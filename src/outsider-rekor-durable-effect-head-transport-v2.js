/*
 * VERSIONED SOURCE LINEAGE — durable effect-head Rekor transport v2.
 *
 * Supersedes the frozen v1 source
 * src/outsider-rekor-durable-effect-head-transport-v1.js
 * SHA-256 562385466c8928a2f09d95a7b0106c2ecc1ff77cd89fc27c28cbff1933fa1d85.
 *
 * V1 used Rekor API v1 and did not persist the exact request/proposal before
 * its one POST.  A lost response therefore left no safe reconciliation key.
 * This descendant targets Rekor API v2, consumes a caller-pinned replay of
 * arbitrary-named TUF SigningConfig and TrustedRoot targets, and fsyncs a
 * privacy-closed attempt journal before network I/O.  The journal retains the
 * exact public proposal, operator public key, target pins, service selection,
 * response bundle, and phase chain; it never retains the operator private key.
 *
 * Rekor v2 intentionally has no online entry-search API.  Ambiguous writes are
 * never retried.  Reconciliation is therefore offline/read-only: a tile
 * monitor or separately obtained TransparencyLogEntry is checked against the
 * journal's exact canonical entry/leaf query.  Absence from a bounded scan is
 * not proof of non-inclusion.  Every result remains HOLD/NONE and neither log
 * inclusion nor caller-pinned TUF target hashes create authority or outcome
 * truth.
 */

import {
  createHash, createPrivateKey, createPublicKey, sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import {
  closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, realpathSync, writeSync,
} from "node:fs";
import path from "node:path";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS,
} from "./outsider-durable-effect-ledger-external-head-publication-v1.js";

const PREFIX = "OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const HEX = /^[a-f0-9]{64}$/u;
const RECORD = /^[0-9]{12}\.json$/u;
const DECIMAL = /^(?:0|[1-9][0-9]{0,18})$/u;
const CONTENT_JSON = /^application\/(?:[A-Za-z0-9.+-]+\+)?json(?:\s*;|$)/iu;
const MAX_TARGET_BYTES = 1024 * 1024;
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_RECORD_BYTES = 8 * 1024 * 1024;
const CREATE_PATH = "/api/v2/log/entries";
const MINIMUM_TIMEOUT_MS = 20_000;
const TRANSPORT_ID = "sigstore.rekor-v2.durable-effect-head.v2";
const FROZEN_V1_SOURCE_HASH
  = "sha256:562385466c8928a2f09d95a7b0106c2ecc1ff77cd89fc27c28cbff1933fa1d85";

const ADAPTER_STATE = new WeakMap();

export const OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_SCHEMAS
  = Object.freeze({
    selection: "outsider/rekor-v2-pinned-tuf-service-selection/v2",
    journalRecord: "outsider/rekor-v2-durable-effect-head-journal-record/v2",
    journalReplay: "outsider/rekor-v2-durable-effect-head-journal-replay/v2",
    statement: "outsider/rekor-v2-durable-effect-head-statement/v2",
    bundle: "outsider/rekor-v2-durable-effect-head-bundle/v2",
    adapter: "outsider/rekor-v2-durable-effect-head-adapter/v2",
    reconciliationQuery:
      "outsider/rekor-v2-durable-effect-head-reconciliation-query/v2",
  });

export const OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_BOUNDARY
  = Object.freeze({
    position:
      "TUF_TARGET_PINNED_REKOR_V2_ONE_SHOT_INCLUSION_WITH_FSYNCED_ATTEMPT_JOURNAL_HOLD_ONLY",
    predecessorSourceHash: FROZEN_V1_SOURCE_HASH,
    rekorApiMajorVersion: 2,
    createEntryPath: CREATE_PATH,
    hashedRekordVersion: "0.0.2",
    signingConfigTargetPathHardcoded: false,
    shardOriginHardcoded: false,
    signingConfigServiceSelectionReplayed: true,
    supportedServiceSelector: "ANY",
    highestSupportedApiVersionSelected: true,
    tufMetadataSignatureVerificationPerformedByThisModule: false,
    pinnedTargetHashAndLengthReplayed: true,
    minimumCreateTimeoutMs: MINIMUM_TIMEOUT_MS,
    exactRequestPersistedBeforePost: true,
    exactProposalPersistedBeforePost: true,
    operatorPublicKeyPersistedBeforePost: true,
    trustPinsPersistedBeforePost: true,
    callerTufRoleChainVerificationHashPersistedBeforePost: true,
    operatorPrivateKeyPersisted: false,
    phaseFilesFsynced: true,
    phaseDirectoryFsynced: true,
    filesystemOwnerRollbackOrReplacementExcluded: false,
    externalExpectedJournalHeadRequiredToDetectWholeRootRollback: true,
    maximumPostAttempts: 1,
    automaticRetryPermitted: false,
    responseBundlePersistedBeforeAcknowledgement: true,
    onlineSearchAvailableFromRekorV2: false,
    reconciliationFromCallerSuppliedEntryOrTileEvidence: true,
    boundedScanAbsenceProvesNonInclusion: false,
    externalInclusionUnderCallerPinnedCheckpointKeyOnSuccess: true,
    trustedTimeEstablished: false,
    rfc3161TimestampRequiredForTrustedTime: true,
    checkpointConsistencyProofVerified: false,
    independentWitnessEstablished: false,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    durableAppendOnlyExternalHistoryEstablished: false,
    providerAcknowledgementIsAuthority: false,
    providerAcknowledgementIsOutcomeTruth: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    permitsPricing: false,
    permitsGuarantee: false,
    permitsSettlement: false,
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && !isProxy(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function exact(value, fields, code) {
  if (!plain(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || keys.some((key) => typeof key !== "string" || !fields.includes(key))) {
    fail(`${code}_SHAPE_INVALID`);
  }
  for (const field of fields) {
    const descriptor = Object.getOwnPropertyDescriptor(value, field);
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      fail(`${code}_DESCRIPTOR_INVALID`);
    }
  }
  return value;
}

function clone(value) {
  return JSON.parse(canonicalizeStrict(value));
}

function freeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || seen.has(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if ("value" in descriptor) freeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function rawHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return rawHash(Buffer.from(
    `outsider:rekor-durable-effect-head-transport:${domain}:v2\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function canonicalTime(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail(`${code}_INVALID`);
  }
  return new Date(value).toISOString();
}

function origin(value, code) {
  let parsed;
  try { parsed = new URL(value); } catch { fail(`${code}_INVALID`); }
  if (parsed.protocol !== "https:" || parsed.username !== ""
    || parsed.password !== "" || parsed.pathname !== "/"
    || parsed.search !== "" || parsed.hash !== "" || parsed.origin !== value) {
    fail(`${code}_EXACT_HTTPS_ORIGIN_REQUIRED`);
  }
  return value;
}

function strictBase64(value, code, maximum = MAX_RESPONSE_BYTES) {
  if (typeof value !== "string" || value.length < 1) fail(`${code}_INVALID`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maximum || bytes.toString("base64") !== value) {
    fail(`${code}_INVALID`);
  }
  return bytes;
}

function readPinnedTarget(value, code) {
  exact(value, ["targetPath", "expectedLength", "expectedSha256", "bytes"], code);
  if (typeof value.targetPath !== "string" || value.targetPath.length < 1
    || value.targetPath.length > 1024 || value.targetPath.includes("\0")) {
    fail(`${code}_PATH_INVALID`);
  }
  if (!Number.isSafeInteger(value.expectedLength) || value.expectedLength < 2
    || value.expectedLength > MAX_TARGET_BYTES) fail(`${code}_LENGTH_INVALID`);
  if (typeof value.expectedSha256 !== "string" || !HEX.test(value.expectedSha256)) {
    fail(`${code}_SHA256_INVALID`);
  }
  if (!(value.bytes instanceof Uint8Array) || value.bytes.byteLength !== value.expectedLength
    || createHash("sha256").update(value.bytes).digest("hex")
      !== value.expectedSha256) fail(`${code}_PIN_MISMATCH`);
  let parsed;
  try { parsed = JSON.parse(Buffer.from(value.bytes).toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (!plain(parsed)) fail(`${code}_JSON_OBJECT_INVALID`);
  return { parsed, targetPath: value.targetPath,
    length: value.expectedLength, sha256: `sha256:${value.expectedSha256}` };
}

function windowActive(validFor, selectedAt, code) {
  if (!plain(validFor)) fail(`${code}_WINDOW_INVALID`);
  const start = canonicalTime(validFor.start, `${code}_START`);
  const end = validFor.end === undefined || validFor.end === null
    ? null : canonicalTime(validFor.end, `${code}_END`);
  const at = Date.parse(selectedAt);
  if (end !== null && Date.parse(start) >= Date.parse(end)) {
    fail(`${code}_WINDOW_ORDER_INVALID`);
  }
  return { start, end, active: at >= Date.parse(start)
      && (end === null || at < Date.parse(end)) };
}

/**
 * Select the active Rekor v2 service from exact, separately TUF-pinned target
 * bytes. Target names are caller supplied; this function never assumes the
 * generic signing_config target names a v2 log.
 */
export function createRekorV2PinnedTufServiceSelectionV2(input = {}) {
  exact(input, ["signingConfigTarget", "trustedRootTarget", "selectedAt"],
    "SELECTION_INPUT");
  const selectedAt = canonicalTime(input.selectedAt, "SELECTED_AT");
  const signing = readPinnedTarget(input.signingConfigTarget, "SIGNING_CONFIG");
  const trusted = readPinnedTarget(input.trustedRootTarget, "TRUSTED_ROOT");
  const config = signing.parsed;
  if (config.mediaType
      !== "application/vnd.dev.sigstore.signingconfig.v0.2+json"
    || !Array.isArray(config.rekorTlogUrls) || !plain(config.rekorTlogConfig)
    || config.rekorTlogConfig.selector !== "ANY") {
    fail("SIGNING_CONFIG_PROFILE_UNSUPPORTED");
  }
  const eligible = [];
  for (let index = 0; index < config.rekorTlogUrls.length; index += 1) {
    const item = config.rekorTlogUrls[index];
    if (!plain(item) || item.majorApiVersion !== 2
      || typeof item.operator !== "string" || item.operator.length < 1) continue;
    const serviceOrigin = origin(item.url, `SERVICE_${index}_ORIGIN`);
    const window = windowActive(item.validFor, selectedAt, `SERVICE_${index}`);
    if (window.active) eligible.push({ index, origin: serviceOrigin,
      majorApiVersion: 2, operator: item.operator,
      validFrom: window.start, validUntil: window.end });
  }
  if (eligible.length < 1) fail("NO_ACTIVE_SUPPORTED_REKOR_V2_SERVICE");
  eligible.sort((left, right) => right.validFrom.localeCompare(left.validFrom)
    || left.index - right.index);
  const service = eligible[0];
  const root = trusted.parsed;
  if (!["application/vnd.dev.sigstore.trustedroot+json;version=0.1",
    "application/vnd.dev.sigstore.trustedroot.v0.2+json"].includes(root.mediaType)
    || !Array.isArray(root.tlogs)) fail("TRUSTED_ROOT_PROFILE_UNSUPPORTED");
  const matches = root.tlogs.filter((item) => plain(item)
    && item.baseUrl === service.origin && plain(item.publicKey)
    && plain(item.logId));
  if (matches.length !== 1) fail("TRUSTED_ROOT_SERVICE_KEY_CARDINALITY_INVALID");
  const tlog = matches[0];
  const keyWindow = windowActive(tlog.publicKey.validFor, selectedAt,
    "TRUSTED_ROOT_KEY");
  if (!keyWindow.active) fail("TRUSTED_ROOT_KEY_NOT_ACTIVE");
  const publicKeyDer = strictBase64(tlog.publicKey.rawBytes,
    "TRUSTED_ROOT_PUBLIC_KEY", 64 * 1024);
  let publicKey;
  try { publicKey = createPublicKey({ key: publicKeyDer, format: "der", type: "spki" }); }
  catch { fail("TRUSTED_ROOT_PUBLIC_KEY_INVALID"); }
  const keyType = publicKey.asymmetricKeyType;
  if (!((tlog.publicKey.keyDetails === "PKIX_ED25519" && keyType === "ed25519")
    || (tlog.publicKey.keyDetails === "PKIX_ECDSA_P256_SHA_256"
      && keyType === "ec"
      && publicKey.asymmetricKeyDetails?.namedCurve === "prime256v1"))) {
    fail("TRUSTED_ROOT_PUBLIC_KEY_DETAILS_MISMATCH");
  }
  const logId = strictBase64(tlog.logId.keyId, "TRUSTED_ROOT_LOG_ID", 64);
  if (logId.length !== 32) fail("TRUSTED_ROOT_LOG_ID_INVALID");
  const checkpointIdValue = tlog.checkpointKeyId?.keyId ?? tlog.logId.keyId;
  const checkpointId = strictBase64(checkpointIdValue,
    "TRUSTED_ROOT_CHECKPOINT_KEY_ID", 64);
  if (checkpointId.length !== 32) fail("TRUSTED_ROOT_CHECKPOINT_KEY_ID_INVALID");
  let derivedCheckpointId;
  if (keyType === "ed25519") {
    const jwk = publicKey.export({ format: "jwk" });
    const raw = Buffer.from(jwk.x, "base64url");
    derivedCheckpointId = createHash("sha256").update(Buffer.concat([
      Buffer.from(`${new URL(service.origin).host}\n`, "utf8"),
      Buffer.from([1]), raw,
    ])).digest();
  } else {
    derivedCheckpointId = createHash("sha256").update(publicKeyDer).digest();
  }
  if (!checkpointId.equals(derivedCheckpointId)) {
    fail("TRUSTED_ROOT_CHECKPOINT_KEY_ID_DERIVATION_MISMATCH");
  }
  const body = {
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_SCHEMAS.selection,
    selectedAt,
    signingConfigTarget: { targetPath: signing.targetPath,
      length: signing.length, sha256: signing.sha256 },
    trustedRootTarget: { targetPath: trusted.targetPath,
      length: trusted.length, sha256: trusted.sha256 },
    signingConfigMediaType: config.mediaType,
    trustedRootMediaType: root.mediaType,
    selector: "ANY",
    selectedService: service,
    logTrust: {
      keyDetails: tlog.publicKey.keyDetails,
      publicKeyDerBase64: publicKeyDer.toString("base64"),
      logIdKeyIdBase64: logId.toString("base64"),
      checkpointKeyIdBase64: checkpointId.toString("base64"),
      validFrom: keyWindow.start,
      validUntil: keyWindow.end,
    },
    supportedMajorApiVersions: [2],
    highestSupportedActiveApiVersionSelected: true,
    targetNamesHardcoded: false,
    targetHashAndLengthPinsMatched: true,
    tufMetadataSignatureVerificationPerformedByThisModule: false,
    targetBytesProjected: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return freeze({ ...body, selectionHash: digest("tuf-service-selection", body) });
}

function assertSelection(value, expectedHash) {
  if (!plain(value) || value.schema
      !== OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_SCHEMAS.selection) {
    fail("SERVICE_SELECTION_INVALID");
  }
  const cloned = clone(value);
  const { selectionHash, ...body } = cloned;
  if (hash(selectionHash, "SELECTION_HASH") !== digest("tuf-service-selection", body)
    || selectionHash !== hash(expectedHash, "EXPECTED_SELECTION_HASH")
    || body.selectedService?.majorApiVersion !== 2
    || body.selector !== "ANY"
    || body.highestSupportedActiveApiVersionSelected !== true
    || body.targetHashAndLengthPinsMatched !== true
    || body.tufMetadataSignatureVerificationPerformedByThisModule !== false
    || body.authority !== "NONE" || body.decisionState !== "HOLD") {
    fail("SERVICE_SELECTION_REPLAY_INVALID");
  }
  origin(body.selectedService.origin, "SELECTED_SERVICE_ORIGIN");
  canonicalTime(body.selectedAt, "SELECTED_AT");
  strictBase64(body.logTrust.publicKeyDerBase64, "LOG_PUBLIC_KEY", 64 * 1024);
  strictBase64(body.logTrust.logIdKeyIdBase64, "LOG_ID", 64);
  strictBase64(body.logTrust.checkpointKeyIdBase64, "CHECKPOINT_KEY_ID", 64);
  return freeze(cloned);
}

function p256(privateKeyPem) {
  if (typeof privateKeyPem !== "string" || Buffer.byteLength(privateKeyPem) > 64 * 1024) {
    fail("OPERATOR_PRIVATE_KEY_INVALID");
  }
  let privateKey;
  try { privateKey = createPrivateKey(privateKeyPem); }
  catch { fail("OPERATOR_PRIVATE_KEY_INVALID"); }
  if (privateKey.asymmetricKeyType !== "ec"
    || privateKey.asymmetricKeyDetails?.namedCurve !== "prime256v1") {
    fail("OPERATOR_PRIVATE_KEY_P256_REQUIRED");
  }
  const publicKey = createPublicKey(privateKey);
  const publicDer = publicKey.export({ type: "spki", format: "der" });
  return { privateKey, publicDer, keyId: rawHash(publicDer) };
}

function makeStatement(request) {
  const body = {
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_SCHEMAS.statement,
    statementClass: "SIGNED_DIGEST_ONLY_DURABLE_EFFECT_HEAD_PUBLICATION",
    publicationRequestHash: request.requestHash,
    commitmentHash: request.commitmentHash,
    subjectDigest: { algorithm: "sha256", value: request.subject.digestHex },
    transportPolicyHash: request.transportBinding.transportPolicyHash,
    externalSequence: request.externalChainExpectation.expectedSequence,
    previousReceiptHash: request.externalChainExpectation.previousReceiptHash,
    statementCreatedAt: request.publishedAt,
    statementCreatedAtIsExternalTimeEvidence: false,
    disclosure:
      "COMMITMENT_DIGEST_ONLY_NO_DIRECTORY_LEDGER_ID_ENTRY_EVENT_OR_SECRET_BYTES",
    rawLedgerIncluded: false,
    rawLedgerIdIncluded: false,
    entryOrEventBytesIncluded: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return freeze({ ...body, statementHash: digest("statement", body) });
}

function makeProposal(statement, operator) {
  const statementBytes = Buffer.from(canonicalizeStrict(statement), "utf8");
  const statementDigest = createHash("sha256").update(statementBytes).digest();
  const signature = cryptoSign("sha256", statementBytes, operator.privateKey);
  const body = {
    hashedRekordRequestV002: {
      digest: statementDigest.toString("base64"),
      signature: {
        content: signature.toString("base64"),
        verifier: {
          publicKey: { rawBytes: operator.publicDer.toString("base64") },
          keyDetails: "PKIX_ECDSA_P256_SHA_256",
        },
      },
    },
  };
  const canonicalEntry = {
    apiVersion: "0.0.2",
    kind: "hashedrekord",
    spec: { hashedRekordV002: {
      data: { algorithm: "SHA2_256", digest: body.hashedRekordRequestV002.digest },
      signature: clone(body.hashedRekordRequestV002.signature),
    } },
  };
  const proposalBytes = Buffer.from(canonicalizeStrict(body), "utf8");
  const entryBytes = Buffer.from(canonicalizeStrict(canonicalEntry), "utf8");
  return freeze({ proposal: body, proposalHash: rawHash(proposalBytes),
    statementBytesUtf8: statementBytes.toString("utf8"),
    statementDigestBase64: statementDigest.toString("base64"),
    canonicalEntry, canonicalEntryHash: rawHash(entryBytes),
    expectedLeafHash: rawHash(Buffer.concat([Buffer.from([0]), entryBytes])),
    operatorPublicKeyDerBase64: operator.publicDer.toString("base64"),
    operatorKeyId: operator.keyId });
}

function validatePublicationRequest(value, policyHash) {
  if (!plain(value) || value.schema
      !== OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS.request
    || value.requestClass
      !== "DIGEST_ONLY_EXTERNAL_HEAD_APPEND_REQUEST_PROVIDER_ACK_IS_NOT_TRUTH"
    || value.transportBinding?.transportId !== TRANSPORT_ID
    || value.transportBinding?.transportPolicyHash !== policyHash
    || value.commitmentHash !== `sha256:${value.subject?.digestHex}`
    || value.automaticRetryPermitted !== false || value.authority !== "NONE"
    || value.decisionState !== "HOLD") fail("PUBLICATION_REQUEST_INVALID");
  const cloned = clone(value);
  const { requestHash, ...requestBody } = cloned;
  const expectedRequestHash = rawHash(Buffer.concat([
    Buffer.from("durable-effect-ledger-external-head-publication-request\0", "utf8"),
    Buffer.from(canonicalizeStrict(requestBody), "utf8"),
  ]));
  if (hash(requestHash, "PUBLICATION_REQUEST_HASH") !== expectedRequestHash) {
    fail("PUBLICATION_REQUEST_HASH_MISMATCH");
  }
  hash(value.commitmentHash, "COMMITMENT_HASH");
  canonicalTime(value.publishedAt, "PUBLISHED_AT");
  return freeze(cloned);
}

function assertPrivateDirectory(directory) {
  const absolute = path.resolve(directory);
  let stat;
  try { stat = lstatSync(absolute); } catch { fail("JOURNAL_DIRECTORY_UNREADABLE"); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700
    || realpathSync(absolute) !== absolute) fail("JOURNAL_DIRECTORY_INVALID");
  return absolute;
}

function fsyncDirectory(directory) {
  const fd = openSync(directory, constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

export function initializeRekorDurableEffectHeadJournalV2(directory) {
  const absolute = path.resolve(directory);
  const parent = assertPrivateDirectory(path.dirname(absolute));
  try { mkdirSync(absolute, { mode: 0o700 }); }
  catch { fail("JOURNAL_CREATE_FAILED_OR_ALREADY_EXISTS"); }
  fsyncDirectory(parent);
  return absolute;
}

function recordHash(record) {
  const { recordHash: ignored, ...body } = record;
  void ignored;
  return digest("journal-record", body);
}

function replayJournal(directory) {
  const root = assertPrivateDirectory(directory);
  const names = readdirSync(root).filter((name) => RECORD.test(name)).sort();
  const records = [];
  let previous = null;
  for (let index = 0; index < names.length; index += 1) {
    if (names[index] !== `${String(index + 1).padStart(12, "0")}.json`) {
      fail("JOURNAL_SEQUENCE_GAP");
    }
    const file = path.join(root, names[index]);
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600
      || stat.size < 2 || stat.size > MAX_RECORD_BYTES) fail("JOURNAL_FILE_INVALID");
    const bytes = readFileSync(file);
    let value;
    try { value = JSON.parse(bytes.toString("utf8")); }
    catch { fail("JOURNAL_RECORD_JSON_INVALID"); }
    if (!bytes.equals(Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"))
      || value.schema
        !== OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_SCHEMAS.journalRecord
      || value.sequence !== index + 1 || value.previousRecordHash !== previous
      || value.authority !== "NONE" || value.decisionState !== "HOLD"
      || value.recordHash !== recordHash(value)) fail("JOURNAL_RECORD_REPLAY_INVALID");
    previous = value.recordHash;
    records.push(freeze(value));
  }
  return freeze({ root, records, headHash: previous });
}

function appendPhase(directory, phase, recordedAt, details) {
  const replay = replayJournal(directory);
  const sequence = replay.records.length + 1;
  const body = {
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_SCHEMAS.journalRecord,
    sequence,
    phase,
    recordedAt: canonicalTime(recordedAt, "JOURNAL_RECORDED_AT"),
    details: clone(details),
    previousRecordHash: replay.headHash,
    operatorPrivateKeyIncluded: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  const record = freeze({ ...body, recordHash: digest("journal-record", body) });
  const file = path.join(replay.root, `${String(sequence).padStart(12, "0")}.json`);
  let fd;
  try {
    fd = openSync(file, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
      | constants.O_NOFOLLOW, 0o600);
    const bytes = Buffer.from(`${canonicalizeStrict(record)}\n`, "utf8");
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
    fsyncSync(fd);
  } catch { fail("JOURNAL_APPEND_FAILED_NO_FURTHER_NETWORK_PERMITTED"); }
  finally { if (fd !== undefined) closeSync(fd); }
  fsyncDirectory(replay.root);
  return record;
}

export function verifyRekorDurableEffectHeadJournalV2(input = {}) {
  exact(input, ["directory", "expectedHeadHash"], "JOURNAL_VERIFY_INPUT");
  const replay = replayJournal(input.directory);
  if (input.expectedHeadHash !== null
    && replay.headHash !== hash(input.expectedHeadHash, "EXPECTED_JOURNAL_HEAD")) {
    fail("EXPECTED_JOURNAL_HEAD_MISMATCH");
  }
  const phases = replay.records.map((record) => record.phase);
  const body = {
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_SCHEMAS.journalReplay,
    ok: true,
    recordCount: replay.records.length,
    phases,
    headHash: replay.headHash,
    fullHashChainReplayVerified: true,
    exactCanonicalRecordBytesVerified: true,
    phaseFilesMode0600Verified: true,
    journalDirectoryMode0700Verified: true,
    operatorPrivateKeyPresent: false,
    automaticRetryPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return freeze({ ...body, verificationHash: digest("journal-replay", body) });
}

function now(clock) {
  let value;
  try { value = clock(); } catch { fail("CLOCK_FAILED"); }
  if (value instanceof Date) value = value.toISOString();
  return canonicalTime(value, "OBSERVED_AT");
}

function parseCheckpoint(envelope, selection) {
  if (typeof envelope !== "string" || Buffer.byteLength(envelope) > 64 * 1024) {
    fail("CHECKPOINT_INVALID");
  }
  const separator = envelope.indexOf("\n\n");
  if (separator < 0) fail("CHECKPOINT_SIGNATURES_MISSING");
  const signed = envelope.slice(0, separator + 1);
  const lines = signed.slice(0, -1).split("\n");
  if (lines.length < 3) fail("CHECKPOINT_BODY_INVALID");
  const expectedOrigin = new URL(selection.selectedService.origin).host;
  if (lines[0] !== expectedOrigin) fail("CHECKPOINT_ORIGIN_MISMATCH");
  const treeSizeText = lines[1].trim();
  if (!DECIMAL.test(treeSizeText) || BigInt(treeSizeText) < 1n) {
    fail("CHECKPOINT_TREE_SIZE_INVALID");
  }
  const root = strictBase64(lines[2].trim(), "CHECKPOINT_ROOT", 64);
  if (root.length !== 32) fail("CHECKPOINT_ROOT_INVALID");
  const keyId = strictBase64(selection.logTrust.checkpointKeyIdBase64,
    "CHECKPOINT_KEY_ID", 64);
  const publicDer = strictBase64(selection.logTrust.publicKeyDerBase64,
    "CHECKPOINT_PUBLIC_KEY", 64 * 1024);
  const publicKey = createPublicKey({ key: publicDer, format: "der", type: "spki" });
  let matched = false;
  for (const line of envelope.slice(separator + 2).trimEnd().split("\n")) {
    const match = /^— ([^ ]+) ([A-Za-z0-9+/]+={0,2})$/u.exec(line);
    if (!match || match[1] !== expectedOrigin) continue;
    const signedNote = strictBase64(match[2], "CHECKPOINT_SIGNATURE", 4096);
    if (signedNote.length < 5 || !signedNote.subarray(0, 4).equals(keyId.subarray(0, 4))) {
      continue;
    }
    const signature = signedNote.subarray(4);
    const algorithm = publicKey.asymmetricKeyType === "ed25519" ? null : "sha256";
    if (cryptoVerify(algorithm, Buffer.from(signed, "utf8"), publicKey, signature)) {
      matched = true;
      break;
    }
  }
  if (!matched) fail("CHECKPOINT_PINNED_SIGNATURE_INVALID");
  return { treeSize: BigInt(treeSizeText), root };
}

function verifyInclusion(leaf, index, treeSize, proof, expectedRoot) {
  if (index < 0n || index >= treeSize || !Array.isArray(proof)) {
    fail("INCLUSION_POSITION_INVALID");
  }
  let fn = index;
  let sn = treeSize - 1n;
  let root = leaf;
  for (const encoded of proof) {
    const sibling = strictBase64(encoded, "INCLUSION_HASH", 64);
    if (sibling.length !== 32) fail("INCLUSION_HASH_INVALID");
    if ((fn & 1n) === 1n || fn === sn) {
      root = createHash("sha256").update(Buffer.concat([
        Buffer.from([1]), sibling, root,
      ])).digest();
      while ((fn & 1n) === 0n && fn !== 0n) { fn >>= 1n; sn >>= 1n; }
    } else {
      root = createHash("sha256").update(Buffer.concat([
        Buffer.from([1]), root, sibling,
      ])).digest();
    }
    fn >>= 1n;
    sn >>= 1n;
  }
  if (sn !== 0n || !root.equals(expectedRoot)) fail("INCLUSION_PROOF_INVALID");
}

function verifyResponseText(responseText, prepared, observedAt) {
  if (typeof responseText !== "string"
    || Buffer.byteLength(responseText) > MAX_RESPONSE_BYTES) fail("RESPONSE_BYTES_INVALID");
  let response;
  try { response = JSON.parse(responseText); } catch { fail("RESPONSE_JSON_INVALID"); }
  if (!plain(response) || !plain(response.logId) || !plain(response.kindVersion)
    || !plain(response.inclusionProof) || !plain(response.inclusionProof.checkpoint)
    || response.kindVersion.kind !== "hashedrekord"
    || response.kindVersion.version !== "0.0.2"
    || response.logId.keyId !== prepared.selection.logTrust.logIdKeyIdBase64
    || response.integratedTime !== "0" || response.inclusionPromise !== null
    || typeof response.logIndex !== "string" || !DECIMAL.test(response.logIndex)) {
    fail("RESPONSE_STATE_INVALID");
  }
  const canonicalBody = strictBase64(response.canonicalizedBody,
    "CANONICAL_ENTRY", 256 * 1024);
  const expectedBytes = Buffer.from(canonicalizeStrict(prepared.canonicalEntry), "utf8");
  if (!canonicalBody.equals(expectedBytes)
    || rawHash(canonicalBody) !== prepared.canonicalEntryHash) {
    fail("CANONICAL_ENTRY_PROPOSAL_BINDING_MISMATCH");
  }
  const statementBytes = Buffer.from(prepared.statementBytesUtf8, "utf8");
  const publicDer = strictBase64(prepared.operatorPublicKeyDerBase64,
    "OPERATOR_PUBLIC_KEY", 64 * 1024);
  const signature = strictBase64(
    prepared.proposal.hashedRekordRequestV002.signature.content,
    "OPERATOR_SIGNATURE", 4096);
  if (!cryptoVerify("sha256", statementBytes,
    createPublicKey({ key: publicDer, format: "der", type: "spki" }), signature)) {
    fail("OPERATOR_SIGNATURE_INVALID");
  }
  const checkpoint = parseCheckpoint(response.inclusionProof.checkpoint.envelope,
    prepared.selection);
  const index = BigInt(response.logIndex);
  const leaf = Buffer.from(prepared.expectedLeafHash.slice("sha256:".length), "hex");
  verifyInclusion(leaf, index, checkpoint.treeSize,
    response.inclusionProof.hashes, checkpoint.root);
  return freeze({
    logIndex: response.logIndex,
    treeSize: checkpoint.treeSize.toString(),
    checkpointRootHash: `sha256:${checkpoint.root.toString("hex")}`,
    responseHash: rawHash(Buffer.from(responseText, "utf8")),
    observedAt: canonicalTime(observedAt, "RESPONSE_OBSERVED_AT"),
    exactCanonicalEntryBindingVerified: true,
    operatorP256SignatureVerified: true,
    pinnedCheckpointSignatureVerified: true,
    rfc6962InclusionProofVerified: true,
    integratedTimeIgnored: true,
    trustedTimeEstablished: false,
    externalInclusionUnderCallerPinnedCheckpointKeyEstablished: true,
  });
}

function makePolicy(selection, operator, journalDirectory,
  tufRoleChainVerificationHash) {
  const body = {
    transportId: TRANSPORT_ID,
    selectedServiceOrigin: selection.selectedService.origin,
    selectedServiceMajorApiVersion: 2,
    selectionHash: selection.selectionHash,
    tufRoleChainVerificationHash,
    operatorKeyId: operator.keyId,
    journalRootBindingHash: digest("journal-root-binding",
      { realpath: realpathSync(journalDirectory) }),
    createEntryPath: CREATE_PATH,
    minimumTimeoutMs: MINIMUM_TIMEOUT_MS,
    maximumPostAttempts: 1,
    automaticRetryPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return freeze({ ...body, policyHash: digest("transport-policy", body) });
}

function makeBundle(prepared, responseText, facts, policy) {
  const body = {
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_SCHEMAS.bundle,
    publicationRequest: clone(prepared.publicationRequest),
    proposal: clone(prepared.proposal),
    proposalHash: prepared.proposalHash,
    canonicalEntryHash: prepared.canonicalEntryHash,
    expectedLeafHash: prepared.expectedLeafHash,
    operatorKeyId: prepared.operatorKeyId,
    selection: clone(prepared.selection),
    transportPolicyHash: policy.policyHash,
    responseUtf8Base64: Buffer.from(responseText, "utf8").toString("base64"),
    responseHash: facts.responseHash,
    facts: clone(facts),
    providerAcknowledgementIsAuthority: false,
    providerAcknowledgementIsOutcomeTruth: false,
    independentWitnessEstablished: false,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    durableAppendOnlyExternalHistoryEstablished: false,
    authority: "NONE",
    decisionState: "HOLD",
    boundary: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_BOUNDARY,
  };
  return freeze({ ...body, bundleHash: digest("bundle", body) });
}

function preparedFromJournal(directory) {
  const replay = replayJournal(directory);
  const prepared = replay.records.find((record) => record.phase === "PREPARED");
  if (!prepared) fail("PREPARED_PHASE_MISSING");
  return { replay, prepared: prepared.details };
}

export function createRekorV2ReconciliationQueryV2(input = {}) {
  exact(input, ["journalDirectory"], "RECONCILIATION_QUERY_INPUT");
  const { prepared } = preparedFromJournal(input.journalDirectory);
  const body = {
    schema:
      OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_SCHEMAS.reconciliationQuery,
    selectionHash: prepared.selection.selectionHash,
    selectedServiceOrigin: prepared.selection.selectedService.origin,
    proposalHash: prepared.proposalHash,
    canonicalEntryHash: prepared.canonicalEntryHash,
    expectedLeafHash: prepared.expectedLeafHash,
    operatorKeyId: prepared.operatorKeyId,
    searchMechanism:
      "CALLER_OR_MONITOR_SUPPLIED_REKOR_V2_TILE_ENTRY_BUNDLE_NO_ONLINE_SEARCH_API",
    boundedScanAbsenceProvesNonInclusion: false,
    networkIoPerformed: false,
    automaticRetryPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return freeze({ ...body, queryHash: digest("reconciliation-query", body) });
}

export function reconcileRekorV2DurableEffectHeadFromResponseV2(input = {}) {
  exact(input, ["journalDirectory", "responseText", "observedAt"],
    "RECONCILIATION_INPUT");
  const { replay, prepared } = preparedFromJournal(input.journalDirectory);
  if (!replay.records.some((record) => record.phase === "POST_ATTEMPTED")) {
    fail("POST_ATTEMPT_PHASE_MISSING");
  }
  if (replay.records.some((record) => record.phase === "BUNDLE_VERIFIED")) {
    fail("RECONCILIATION_ALREADY_COMPLETE");
  }
  const facts = verifyResponseText(input.responseText, prepared, input.observedAt);
  appendPhase(input.journalDirectory, "RECONCILIATION_EVIDENCE_OBSERVED",
    input.observedAt, { responseUtf8Base64: Buffer.from(input.responseText, "utf8")
      .toString("base64"), responseHash: facts.responseHash });
  const policy = prepared.policy;
  const bundle = makeBundle(prepared, input.responseText, facts, policy);
  appendPhase(input.journalDirectory, "BUNDLE_VERIFIED", input.observedAt,
    { bundle, bundleHash: bundle.bundleHash, reconciliation: true });
  return bundle;
}

export function createRekorDurableEffectHeadTransportV2(input = {}) {
  exact(input, ["selection", "expectedSelectionHash", "operatorPrivateKeyPem",
    "tufRoleChainVerificationHash", "journalDirectory", "fetchImpl", "clock"],
  "CONFIG");
  const selection = assertSelection(input.selection, input.expectedSelectionHash);
  const tufRoleChainVerificationHash = hash(input.tufRoleChainVerificationHash,
    "TUF_ROLE_CHAIN_VERIFICATION_HASH");
  const operator = p256(input.operatorPrivateKeyPem);
  if (typeof input.fetchImpl !== "function" || isProxy(input.fetchImpl)) {
    fail("INJECTED_FETCH_REQUIRED");
  }
  if (typeof input.clock !== "function" || isProxy(input.clock)) {
    fail("INJECTED_CLOCK_REQUIRED");
  }
  const journalDirectory = assertPrivateDirectory(input.journalDirectory);
  if (replayJournal(journalDirectory).records.length !== 0) {
    fail("NEW_TRANSPORT_REQUIRES_EMPTY_JOURNAL");
  }
  const policy = makePolicy(selection, operator, journalDirectory,
    tufRoleChainVerificationHash);
  const state = { used: false, bundle: null };
  const transport = async (candidate, options = {}) => {
    if (state.used) fail("TRANSPORT_ALREADY_CONSUMED");
    state.used = true;
    const request = validatePublicationRequest(candidate, policy.policyHash);
    if (!plain(options) || !options.signal || options.signal.aborted === true) {
      fail("ABORT_SIGNAL_INVALID");
    }
    const statement = makeStatement(request);
    const proposal = makeProposal(statement, operator);
    const prepared = freeze({
      publicationRequest: request,
      statementBytesUtf8: proposal.statementBytesUtf8,
      statementDigestBase64: proposal.statementDigestBase64,
      proposal: proposal.proposal,
      proposalHash: proposal.proposalHash,
      canonicalEntry: proposal.canonicalEntry,
      canonicalEntryHash: proposal.canonicalEntryHash,
      expectedLeafHash: proposal.expectedLeafHash,
      operatorPublicKeyDerBase64: proposal.operatorPublicKeyDerBase64,
      operatorKeyId: proposal.operatorKeyId,
      selection,
      tufRoleChainVerificationHash,
      policy,
      rawLedgerProjected: false,
      rawLedgerIdProjected: false,
      operatorPrivateKeyIncluded: false,
    });
    appendPhase(journalDirectory, "PREPARED", now(input.clock), prepared);
    appendPhase(journalDirectory, "POST_ATTEMPTED", now(input.clock), {
      proposalHash: prepared.proposalHash,
      createEntryPath: CREATE_PATH,
      maximumPostAttempts: 1,
      automaticRetryPermitted: false,
    });
    let response;
    try {
      response = await input.fetchImpl(
        `${selection.selectedService.origin}${CREATE_PATH}`, {
          method: "POST",
          redirect: "error",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: canonicalizeStrict(prepared.proposal),
          signal: options.signal,
        });
    } catch {
      appendPhase(journalDirectory, "COMMIT_UNKNOWN", now(input.clock), {
        proposalHash: prepared.proposalHash,
        disposition: "NO_AUTOMATIC_RETRY_READ_ONLY_RECONCILIATION_REQUIRED",
      });
      fail("POST_FAILED_COMMIT_STATUS_UNKNOWN_NO_RETRY");
    }
    if (!(response instanceof Response) || response.redirected !== false
      || ![200, 201].includes(response.status)
      || !CONTENT_JSON.test(response.headers.get("content-type") ?? "")) {
      appendPhase(journalDirectory, "RESPONSE_INVALID_HOLD", now(input.clock), {
        proposalHash: prepared.proposalHash,
        responseWasNative: response instanceof Response,
        httpStatus: response instanceof Response ? response.status : null,
      });
      fail("RESPONSE_INVALID_NO_RETRY");
    }
    let responseText;
    try { responseText = await response.text(); }
    catch {
      appendPhase(journalDirectory, "COMMIT_UNKNOWN", now(input.clock), {
        proposalHash: prepared.proposalHash,
        disposition:
          "RESPONSE_BODY_LOST_NO_AUTOMATIC_RETRY_READ_ONLY_RECONCILIATION_REQUIRED",
      });
      fail("RESPONSE_BODY_FAILED_COMMIT_STATUS_UNKNOWN_NO_RETRY");
    }
    if (Buffer.byteLength(responseText) > MAX_RESPONSE_BYTES) {
      appendPhase(journalDirectory, "RESPONSE_INVALID_HOLD", now(input.clock), {
        proposalHash: prepared.proposalHash,
        responseWasNative: true,
        httpStatus: response.status,
      });
      fail("RESPONSE_TOO_LARGE_NO_RETRY");
    }
    const observedAt = now(input.clock);
    appendPhase(journalDirectory, "RESPONSE_OBSERVED", observedAt, {
      proposalHash: prepared.proposalHash,
      httpStatus: response.status,
      contentType: response.headers.get("content-type"),
      responseUtf8Base64: Buffer.from(responseText, "utf8").toString("base64"),
      responseHash: rawHash(Buffer.from(responseText, "utf8")),
    });
    const facts = verifyResponseText(responseText, prepared, observedAt);
    const bundle = makeBundle(prepared, responseText, facts, policy);
    appendPhase(journalDirectory, "BUNDLE_VERIFIED", observedAt,
      { bundle, bundleHash: bundle.bundleHash, reconciliation: false });
    state.bundle = bundle;
    return freeze({
      schema:
        OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS
          .transportReceipt,
      status: "APPENDED",
      requestHash: request.requestHash,
      commitmentHash: request.commitmentHash,
      subjectDigestHex: request.subject.digestHex,
      transportId: TRANSPORT_ID,
      transportPolicyHash: policy.policyHash,
      externalSequence: request.externalChainExpectation.expectedSequence,
      previousReceiptHash: request.externalChainExpectation.previousReceiptHash,
      providerReceiptHash: bundle.bundleHash,
      observedAt,
    });
  };
  const adapter = freeze({
    schema: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_SCHEMAS.adapter,
    transportId: TRANSPORT_ID,
    transportPolicyHash: policy.policyHash,
    selectionHash: selection.selectionHash,
    operatorKeyId: operator.keyId,
    transport,
    publicProjection: {
      rekorApiMajorVersion: 2,
      createEntryPath: CREATE_PATH,
      selectionHash: selection.selectionHash,
      selectedServiceOrigin: selection.selectedService.origin,
      journalRootBindingHash: policy.journalRootBindingHash,
      operatorPrivateKeyProjected: false,
      maximumPostAttempts: 1,
      minimumTimeoutMs: MINIMUM_TIMEOUT_MS,
      automaticRetryPermitted: false,
      authority: "NONE",
      decisionState: "HOLD",
      boundary: OUTSIDER_REKOR_DURABLE_EFFECT_HEAD_TRANSPORT_V2_BOUNDARY,
    },
  });
  ADAPTER_STATE.set(adapter, state);
  return adapter;
}

export function readCapturedRekorDurableEffectHeadBundleV2(adapter, input = {}) {
  exact(input, ["expectedBundleHash"], "READ_BUNDLE_INPUT");
  const state = ADAPTER_STATE.get(adapter);
  if (!state || !state.bundle) fail("CAPTURE_NOT_AVAILABLE");
  if (state.bundle.bundleHash !== hash(input.expectedBundleHash,
    "EXPECTED_BUNDLE_HASH")) fail("CAPTURE_HASH_MISMATCH");
  return state.bundle;
}
