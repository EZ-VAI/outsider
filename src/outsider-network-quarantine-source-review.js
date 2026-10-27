/*
 * Offline source/review-byte descendant for one network quarantine event.
 *
 * The Cloudflare v1 export contains an event and an optional allowlisted
 * network object, but it does not contain the intake manifest or any source,
 * instrument, rights-review, or privacy-review bytes.  This module therefore
 * requires those inputs locally.  It replays four kind-separated byte hashes
 * against the exact source fields in a canonical network intake manifest and
 * emits only hashes, byte counts, and the already-allowlisted v1 event/object
 * projection.  Local paths and raw source/review bytes are never projected.
 *
 * A reservation input is checked only as a self-signed transport-possession
 * record.  Without its challenge, pinned server key, and audience, this module
 * deliberately does not claim challenge/reservation provenance or authority.
 */

import {
  createHash,
  createPublicKey,
  verify as cryptoVerify,
} from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import path from "node:path";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  NETWORK_INTAKE_BOUNDARY,
  NETWORK_INTAKE_LANES,
  NETWORK_INTAKE_SCHEMAS,
  networkIntakeDigest,
  verifyNetworkIntakeManifest,
} from "./outsider-network-intake.js";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u;
const SUBMISSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u;
const REASON_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const EVENT_TYPE
  = /^(?:RESERVED|QUARANTINED|EXPIRED_UNUSED|REVOKED|PURGED|REJECTED_[A-Z0-9_]+)$/u;
const RESERVATION_STATUS
  = /^(?:OPEN|SETTLED|EXPIRED_UNUSED|REVOKED|PURGED|REJECTED_[A-Z0-9_]+)$/u;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_FILE_BYTES = 32 * 1024 * 1024;
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;

export const NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS = Object.freeze({
  predecessorExport: "outsider/network-quarantine-export/v1",
  event: "outsider/network-intake-event/v2",
  sourceReviewSetPin: "outsider/network-quarantine-source-review-set-pin/v1",
  externalHeadPin: "outsider/network-quarantine-external-head-pin/v1",
  export: "outsider/network-quarantine-source-review-export/v2",
});

export const NETWORK_QUARANTINE_SOURCE_REVIEW_FILE_BINDINGS = deepFreeze([
  {
    inputField: "sourceManifest",
    kind: "SOURCE_MANIFEST",
    manifestField: "sourceManifestHash",
    hashDomain:
      "outsider/network-quarantine-source-review/source-manifest-bytes/v1",
  },
  {
    inputField: "instrument",
    kind: "INSTRUMENT",
    manifestField: "instrumentHash",
    hashDomain:
      "outsider/network-quarantine-source-review/instrument-bytes/v1",
  },
  {
    inputField: "rightsReview",
    kind: "RIGHTS_REVIEW",
    manifestField: "rightsReviewHash",
    hashDomain:
      "outsider/network-quarantine-source-review/rights-review-bytes/v1",
  },
  {
    inputField: "privacyReview",
    kind: "PRIVACY_REVIEW",
    manifestField: "privacyReviewHash",
    hashDomain:
      "outsider/network-quarantine-source-review/privacy-review-bytes/v1",
  },
]);

export const NETWORK_QUARANTINE_SOURCE_REVIEW_BOUNDARY = deepFreeze({
  status: "PARTIAL",
  decision: "HOLD",
  disposition: "QUARANTINED",
  sourceReviewByteReplayRequiredForUnsuppressedOccurrence: true,
  maximumSourceReviewFiles: 4,
  sourceHashConvention:
    "V2_KIND_SEPARATED_LENGTH_PREFIXED_SHA256_EXPLICIT_DOMAIN",
  predecessorV1EstablishedSourceHashConvention: false,
  rawSourceOrReviewBytesProjected: false,
  localSourceOrReviewPathsProjected: false,
  sourceReviewSemanticsAdjudicated: false,
  rightsClearanceEstablished: false,
  privacyClearanceEstablished: false,
  vendorClaimsAreAuthority: false,
  serverAcknowledgmentsAreOutcomeTruth: false,
  pseudoLabelsAreAuthority: false,
  modelRewardIsOutcomeTruth: false,
  occurrenceCensusSeparatedFromObjectDedup: true,
  occurrenceDeduplicatedByObjectIdentity: false,
  externalHeadPinIsIndependentWitness: false,
  noPiiGuaranteed: false,
  noRawMediaGuaranteed: false,
  liveActionAvailable: false,
  secretsAcceptedForAction: false,
  authority: "NONE",
  authorityGrants: 0,
  actionReady: false,
  actionAuthorized: false,
  actionAdmissions: 0,
  executable: false,
  automaticTraining: false,
  productionTrainingAuthorized: false,
  trainingRows: 0,
  causalExperienceUnits: 0,
  pricingAuthorized: false,
  guaranteeEstablished: false,
  settlementAuthorized: false,
  enabledCapabilityCount: 0,
  provenAuthorityCount: 0,
  enabledCapabilitiesSubsetOfProvenAuthority: true,
  consequenceReach: "NONE",
  publicDeploymentReady: false,
});

function fail(code, detail = null) {
  throw new Error(detail === null
    ? `NETWORK_QUARANTINE_SOURCE_REVIEW_${code}`
    : `NETWORK_QUARANTINE_SOURCE_REVIEW_${code}:${detail}`);
}

function deepFreeze(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return Object.freeze(value);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_PROTOTYPE_INVALID`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== "string")
    || keys.slice().sort().join("\0") !== fields.slice().sort().join("\0")) {
    fail(`${code}_SHAPE_INVALID`);
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!(descriptor && "value" in descriptor) || descriptor.enumerable !== true) {
      fail(`${code}_DESCRIPTOR_INVALID`);
    }
  }
  return value;
}

function canonicalClone(value, code) {
  if (value !== null && typeof value === "object" && isProxy(value)) {
    fail(`${code}_PROXY_INVALID`);
  }
  let canonical;
  try { canonical = canonicalizeStrict(value); }
  catch { fail(`${code}_CANONICAL_INVALID`); }
  let clone;
  try { clone = JSON.parse(canonical); }
  catch { fail(`${code}_JSON_INVALID`); }
  return clone;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function canonicalTime(value, code) {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)) fail(`${code}_INVALID`);
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function fileBindingForKind(kind) {
  const binding = NETWORK_QUARANTINE_SOURCE_REVIEW_FILE_BINDINGS.find(
    (candidate) => candidate.kind === kind);
  if (!binding) fail("SOURCE_REVIEW_KIND_INVALID", String(kind));
  return binding;
}

function byteBuffer(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array && Object.getPrototypeOf(value) === Uint8Array.prototype) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  fail("SOURCE_REVIEW_BYTES_INVALID");
}

/* The expected intake field is SHA-256 over an unambiguous kind-specific
   header and the exact file bytes.  The byte length is committed explicitly
   so this mapping can be reproduced without JSON or text normalization. */
export function networkQuarantineSourceReviewFileHash(kind, bytes) {
  const binding = fileBindingForKind(kind);
  const value = byteBuffer(bytes);
  const header = Buffer.from(
    `${binding.hashDomain}\0${binding.kind}\0${value.length}\0`, "utf8");
  return sha256(Buffer.concat([header, value]));
}

const REPLAY_BINDING_FIELDS = ["kind", "manifestField", "hashDomain", "bytes",
  "replayedHash", "expectedHash", "matched", "localPathProjected",
  "rawBytesProjected"];

function validateReplayBindings(value) {
  if (!Array.isArray(value) || value.length !== 4) {
    fail("SOURCE_REVIEW_BINDINGS_INVALID");
  }
  const bindings = canonicalClone(value, "SOURCE_REVIEW_BINDINGS");
  let totalBytes = 0;
  const replayed = new Set();
  for (let index = 0; index < bindings.length; index += 1) {
    const binding = bindings[index];
    const definition = NETWORK_QUARANTINE_SOURCE_REVIEW_FILE_BINDINGS[index];
    exactObject(binding, REPLAY_BINDING_FIELDS, "SOURCE_REVIEW_BINDING");
    if (binding.kind !== definition.kind
      || binding.manifestField !== definition.manifestField
      || binding.hashDomain !== definition.hashDomain
      || !Number.isSafeInteger(binding.bytes) || binding.bytes < 1
      || binding.bytes > MAX_FILE_BYTES
      || binding.replayedHash !== hash(binding.expectedHash,
        "SOURCE_REVIEW_EXPECTED_HASH")
      || binding.replayedHash !== hash(binding.replayedHash,
        "SOURCE_REVIEW_REPLAYED_HASH")
      || binding.matched !== true || binding.localPathProjected !== false
      || binding.rawBytesProjected !== false || replayed.has(binding.replayedHash)) {
      fail("SOURCE_REVIEW_BINDING_INVALID", definition.kind);
    }
    replayed.add(binding.replayedHash);
    totalBytes += binding.bytes;
  }
  if (totalBytes > MAX_TOTAL_FILE_BYTES) fail("SOURCE_REVIEW_SET_TOO_LARGE");
  return deepFreeze({ bindings, totalBytes });
}

export function networkQuarantineSourceArtifactBindingSetRoot(bindings) {
  const checked = validateReplayBindings(bindings);
  return digest("outsider/network-quarantine-source-artifact-binding-set/v2",
    checked.bindings);
}

export function networkQuarantineSourceReviewSetRoot({
  checkpointHash,
  reservationHash,
  manifestHash,
  eventHash,
  artifactBindingSetRoot,
} = {}) {
  const context = {
    checkpointHash: hash(checkpointHash, "SOURCE_REVIEW_CHECKPOINT_HASH"),
    reservationHash: hash(reservationHash, "SOURCE_REVIEW_RESERVATION_HASH"),
    manifestHash: hash(manifestHash, "SOURCE_REVIEW_MANIFEST_HASH"),
    eventHash: hash(eventHash, "SOURCE_REVIEW_EVENT_HASH"),
    artifactBindingSetRoot: hash(artifactBindingSetRoot,
      "SOURCE_REVIEW_ARTIFACT_BINDING_SET_ROOT"),
  };
  return digest("outsider/network-quarantine-source-review-context-set/v2", context);
}

function safeRelative(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 1024
    || value.includes("\0") || value.includes("\\") || path.posix.isAbsolute(value)
    || path.posix.normalize(value) !== value
    || value.split("/").some((part) => part === "" || part === "." || part === "..")) {
    fail(`${code}_PATH_INVALID`);
  }
  return value;
}

function assertPrivateDirectory(target, code) {
  let stat;
  try { stat = lstatSync(target, { bigint: true }); }
  catch { fail(`${code}_MISSING`); }
  if (stat.isSymbolicLink() || !stat.isDirectory()
    || Number(stat.mode & 0o077n) !== 0) fail(`${code}_UNSAFE`);
  return stat;
}

function sameStat(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode && left.size === right.size
    && left.nlink === right.nlink
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function readPrivateStable(root, relative, identities) {
  const checkedRelative = safeRelative(relative, "SOURCE_REVIEW_FILE");
  const parts = checkedRelative.split("/");
  let current = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    current = path.join(current, parts[index]);
    assertPrivateDirectory(current, "SOURCE_REVIEW_ANCESTOR");
  }
  const target = path.join(root, ...parts);
  const relation = path.relative(root, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("SOURCE_REVIEW_FILE_PATH_ESCAPE");
  let before;
  try { before = lstatSync(target, { bigint: true }); }
  catch { fail("SOURCE_REVIEW_FILE_MISSING"); }
  if (before.isSymbolicLink() || !before.isFile()
    || Number(before.mode & 0o777n) !== 0o600
    || before.nlink !== 1n
    || before.size < 1n || before.size > BigInt(MAX_FILE_BYTES)) {
    fail("SOURCE_REVIEW_FILE_UNSAFE");
  }
  const identity = `${before.dev}:${before.ino}`;
  if (identities.has(identity)) fail("SOURCE_REVIEW_FILE_IDENTITY_CONFLATION");
  identities.add(identity);

  let descriptor;
  try { descriptor = openSync(target, fsConstants.O_RDONLY | O_NOFOLLOW); }
  catch { fail("SOURCE_REVIEW_FILE_OPEN_FAILED"); }
  let bytes;
  try {
    const descriptorBefore = fstatSync(descriptor, { bigint: true });
    if (!descriptorBefore.isFile() || !sameStat(before, descriptorBefore)) {
      fail("SOURCE_REVIEW_FILE_RACE");
    }
    bytes = readFileSync(descriptor);
    const descriptorAfter = fstatSync(descriptor, { bigint: true });
    if (!sameStat(descriptorBefore, descriptorAfter)
      || bytes.length !== Number(descriptorBefore.size)) {
      fail("SOURCE_REVIEW_FILE_CHANGED");
    }
  } finally {
    closeSync(descriptor);
  }
  let after;
  try { after = lstatSync(target, { bigint: true }); }
  catch { fail("SOURCE_REVIEW_PATH_CHANGED"); }
  if (after.isSymbolicLink() || !after.isFile() || !sameStat(before, after)) {
    fail("SOURCE_REVIEW_PATH_CHANGED");
  }
  return bytes;
}

function replaySourceReviewFiles(directory, files, source) {
  if (typeof directory !== "string" || directory.length < 1) {
    fail("SOURCE_REVIEW_DIRECTORY_INVALID");
  }
  const root = path.resolve(directory);
  const rootBefore = assertPrivateDirectory(root, "SOURCE_REVIEW_DIRECTORY");
  exactObject(files, NETWORK_QUARANTINE_SOURCE_REVIEW_FILE_BINDINGS.map(
    (binding) => binding.inputField), "SOURCE_REVIEW_FILES");
  const identities = new Set();
  const bindings = [];
  let totalBytes = 0;
  for (const definition of NETWORK_QUARANTINE_SOURCE_REVIEW_FILE_BINDINGS) {
    const bytes = readPrivateStable(root, files[definition.inputField], identities);
    totalBytes += bytes.length;
    if (totalBytes > MAX_TOTAL_FILE_BYTES) fail("SOURCE_REVIEW_SET_TOO_LARGE");
    const replayedHash = networkQuarantineSourceReviewFileHash(definition.kind, bytes);
    const expectedHash = hash(source[definition.manifestField],
      `MANIFEST_${definition.manifestField.toUpperCase()}`);
    if (replayedHash !== expectedHash) {
      fail("SOURCE_REVIEW_HASH_MISMATCH", definition.kind);
    }
    bindings.push({
      kind: definition.kind,
      manifestField: definition.manifestField,
      hashDomain: definition.hashDomain,
      bytes: bytes.length,
      replayedHash,
      expectedHash,
      matched: true,
      localPathProjected: false,
      rawBytesProjected: false,
    });
  }
  let rootAfter;
  try { rootAfter = lstatSync(root, { bigint: true }); }
  catch { fail("SOURCE_REVIEW_DIRECTORY_CHANGED"); }
  if (!rootAfter.isDirectory() || rootAfter.isSymbolicLink()
    || !sameStat(rootBefore, rootAfter)) fail("SOURCE_REVIEW_DIRECTORY_CHANGED");
  const artifactBindingSetRoot = networkQuarantineSourceArtifactBindingSetRoot(bindings);
  return deepFreeze({ bindings, artifactBindingSetRoot, fileCount: bindings.length,
    totalBytes });
}

function validateManifest(manifest, expectedManifestHash, payload = undefined) {
  const checked = verifyNetworkIntakeManifest(manifest, {
    expectedManifestHash,
    ...(payload === undefined ? {} : { payload }),
  });
  if (!checked.ok) fail("MANIFEST_REPLAY_INVALID", checked.error ?? "UNKNOWN");
  return checked;
}

function validateReservationSelfSignature(record) {
  exactObject(record, ["schema", "manifest", "challengeHash",
    "transportSignerKeyId", "reservedAt", "expiresAt", "reservationHash",
    "signature"], "RESERVATION");
  if (record.schema !== NETWORK_INTAKE_SCHEMAS.reservation) {
    fail("RESERVATION_SCHEMA_INVALID");
  }
  hash(record.challengeHash, "RESERVATION_CHALLENGE_HASH");
  hash(record.transportSignerKeyId, "RESERVATION_TRANSPORT_SIGNER_KEY_ID");
  hash(record.reservationHash, "RESERVATION_HASH");
  canonicalTime(record.reservedAt, "RESERVATION_RESERVED_AT");
  canonicalTime(record.expiresAt, "RESERVATION_EXPIRES_AT");
  if (Date.parse(record.expiresAt) <= Date.parse(record.reservedAt)) {
    fail("RESERVATION_WINDOW_INVALID");
  }
  if (Date.parse(record.expiresAt) - Date.parse(record.reservedAt) > 60 * 60_000) {
    fail("RESERVATION_WINDOW_INVALID");
  }
  exactObject(record.signature, ["algorithm", "keyId", "publicKeyPem", "value"],
    "RESERVATION_SIGNATURE");
  const signature = record.signature;
  if (signature.algorithm !== "Ed25519" || signature.keyId !== record.transportSignerKeyId
    || typeof signature.publicKeyPem !== "string" || signature.publicKeyPem.length > 512
    || typeof signature.value !== "string"
    || !/^[A-Za-z0-9+/]+={0,2}$/u.test(signature.value)) {
    fail("RESERVATION_SIGNATURE_INVALID");
  }
  let publicKey;
  try { publicKey = createPublicKey(signature.publicKeyPem); }
  catch { fail("RESERVATION_PUBLIC_KEY_INVALID"); }
  if (publicKey.asymmetricKeyType !== "ed25519") fail("RESERVATION_PUBLIC_KEY_TYPE_INVALID");
  const keyId = sha256(publicKey.export({ type: "spki", format: "der" }));
  const signatureBytes = Buffer.from(signature.value, "base64");
  const unsigned = {
    schema: record.schema,
    manifest: record.manifest,
    challengeHash: record.challengeHash,
    transportSignerKeyId: record.transportSignerKeyId,
    reservedAt: record.reservedAt,
    expiresAt: record.expiresAt,
    signature: null,
  };
  const expected = networkIntakeDigest(NETWORK_INTAKE_SCHEMAS.reservation, unsigned);
  if (keyId !== signature.keyId || signatureBytes.length !== 64
    || signatureBytes.toString("base64") !== signature.value
    || expected !== record.reservationHash
    || !cryptoVerify(null, Buffer.from(expected, "utf8"), publicKey, signatureBytes)) {
    fail("RESERVATION_SELF_SIGNATURE_OR_HASH_INVALID");
  }
}

function persistedContract(value, event) {
  const contract = canonicalClone(value, "PERSISTED_CONTRACT");
  let manifest;
  let kind;
  let reservationHash = event.reservationHash;
  let reservationSelfSignatureVerified = false;
  if (contract.schema === NETWORK_INTAKE_SCHEMAS.reservation) {
    validateReservationSelfSignature(contract);
    manifest = contract.manifest;
    kind = "SELF_SIGNED_RESERVATION_TRANSPORT_POSSESSION_ONLY";
    reservationHash = contract.reservationHash;
    reservationSelfSignatureVerified = true;
    if (reservationHash !== event.reservationHash) fail("EVENT_RESERVATION_HASH_MISMATCH");
  } else if (contract.schema === NETWORK_INTAKE_SCHEMAS.manifest) {
    manifest = contract;
    kind = "MANIFEST_ONLY";
  } else fail("PERSISTED_CONTRACT_SCHEMA_INVALID");
  validateManifest(manifest, event.manifestHash);
  return deepFreeze({
    manifest,
    projection: {
      kind,
      persistedContractHash: digest(
        "outsider/network-quarantine-persisted-contract/v2", contract),
      reservationHash,
      manifestHash: manifest.manifestHash,
      manifestReplayVerified: true,
      reservationSelfSignatureVerified,
      reservationChallengeReplayVerified: false,
      challengeServerKeyPinned: false,
      transportSignatureEstablishesActorIdentity: false,
      transportSignatureEstablishesAuthority: false,
      rawPersistedContractProjected: false,
      persistedSidecarRead: true,
    },
  });
}

const EVENT_FIELDS = ["schema", "ordinal", "previousEventHash", "reservationHash",
  "manifestHash", "lane", "clientSubmissionId", "challengeServerKeyId", "registryId",
  "retentionPolicyVersion", "appliedRetentionDays", "retentionUntil", "eventType",
  "objectIdentityHash", "occurrenceIdentityHash", "stableOccurrenceSubjectHash",
  "semanticSubjectHash", "censusSlotHash", "occurredAt", "disposition", "reasonCode",
  "eventHash"];

function validateEvent(value) {
  const event = canonicalClone(value, "EVENT");
  exactObject(event, EVENT_FIELDS, "EVENT");
  if (event.schema !== NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.event
    || !Number.isSafeInteger(event.ordinal) || event.ordinal < 1
    || !NETWORK_INTAKE_LANES.includes(event.lane)
    || typeof event.clientSubmissionId !== "string"
    || !SUBMISSION_ID.test(event.clientSubmissionId)
    || typeof event.registryId !== "string" || !TOKEN.test(event.registryId)
    || event.retentionPolicyVersion !== "outsider/network-retention-policy/v1"
    || !Number.isSafeInteger(event.appliedRetentionDays)
    || event.appliedRetentionDays < 1 || event.appliedRetentionDays > 3650
    || typeof event.eventType !== "string" || !EVENT_TYPE.test(event.eventType)
    || event.censusSlotHash !== null && !HASH.test(event.censusSlotHash)
    || event.disposition !== "QUARANTINED"
    || event.reasonCode !== null
      && (typeof event.reasonCode !== "string" || !REASON_CODE.test(event.reasonCode))) {
    fail("EVENT_STATE_INVALID");
  }
  for (const [field, code] of [
    ["previousEventHash", "PREVIOUS_EVENT_HASH"],
    ["reservationHash", "RESERVATION_HASH"],
    ["manifestHash", "MANIFEST_HASH"],
    ["challengeServerKeyId", "CHALLENGE_SERVER_KEY_ID"],
    ["objectIdentityHash", "OBJECT_IDENTITY_HASH"],
    ["occurrenceIdentityHash", "OCCURRENCE_IDENTITY_HASH"],
    ["stableOccurrenceSubjectHash", "STABLE_OCCURRENCE_SUBJECT_HASH"],
    ["semanticSubjectHash", "SEMANTIC_SUBJECT_HASH"],
    ["eventHash", "EVENT_HASH"],
  ]) hash(event[field], code);
  canonicalTime(event.retentionUntil, "EVENT_RETENTION_UNTIL");
  canonicalTime(event.occurredAt, "EVENT_OCCURRED_AT");
  const { eventHash, ...body } = event;
  if (eventHash !== networkIntakeDigest("lifecycle-event", body)) {
    fail("EVENT_HASH_REPLAY_INVALID");
  }
  if (event.occurrenceIdentityHash === event.objectIdentityHash
    || event.stableOccurrenceSubjectHash === event.objectIdentityHash) {
    fail("OCCURRENCE_OBJECT_IDENTITY_CONFLATION");
  }
  return deepFreeze(event);
}

function semanticSubjectHash(manifest) {
  if (manifest.lane === "DELEGATION_RESPONSIBILITY") {
    return manifest.subject.accountableDeploymentSubjectHash;
  }
  if (manifest.lane === "ACTION_OUTCOME") return manifest.subject.attemptActorSubjectHash;
  return manifest.subject.censusSlotHash;
}

function stableOccurrenceSubjectHash(manifest) {
  return networkIntakeDigest("stable-occurrence-subject", {
    lane: manifest.lane,
    claimHash: manifest.subject.claimHash,
    wayHash: manifest.subject.wayHash,
    worldHash: manifest.subject.worldHash,
    episodeHash: manifest.subject.episodeHash,
    attemptHash: manifest.subject.attemptHash,
    cohortHash: manifest.subject.cohortHash,
    censusSlotHash: manifest.subject.censusSlotHash,
  });
}

function validateEventManifestBinding(event, manifest) {
  if (event.manifestHash !== manifest.manifestHash
    || event.lane !== manifest.lane
    || event.clientSubmissionId !== manifest.clientSubmissionId
    || event.objectIdentityHash !== manifest.payload.objectIdentityHash
    || event.occurrenceIdentityHash !== manifest.occurrenceIdentityHash
    || event.semanticSubjectHash !== semanticSubjectHash(manifest)
    || event.stableOccurrenceSubjectHash !== stableOccurrenceSubjectHash(manifest)
    || event.censusSlotHash !== manifest.subject.censusSlotHash
    || event.appliedRetentionDays > manifest.retentionDays) {
    fail("EVENT_MANIFEST_BINDING_INVALID");
  }
  const sourceHashes = Object.values(manifest.source);
  if (new Set(sourceHashes).size !== sourceHashes.length) {
    fail("SOURCE_REVIEW_KIND_HASH_CONFLATION");
  }
}

function statusReachableFromEvent(eventType, status) {
  if (eventType === "RESERVED") return true;
  if (eventType === "QUARANTINED") {
    return status === "SETTLED" || status === "REVOKED" || status === "PURGED";
  }
  if (eventType === "EXPIRED_UNUSED") {
    return status === "EXPIRED_UNUSED" || status === "PURGED";
  }
  if (eventType === "REVOKED") return status === "REVOKED" || status === "PURGED";
  if (eventType === "PURGED") return status === "PURGED";
  return status === eventType || status === "PURGED";
}

function validateLifecycle(event, object, derivedState, retention) {
  exactObject(derivedState, ["reservationStatus"], "DERIVED_STATE");
  exactObject(retention, ["retentionUntil", "payloadTombstoned", "tombstonedAt"],
    "RETENTION");
  const status = derivedState.reservationStatus;
  if (typeof status !== "string" || !RESERVATION_STATUS.test(status)
    || !statusReachableFromEvent(event.eventType, status)
    || retention.retentionUntil !== event.retentionUntil
    || typeof retention.payloadTombstoned !== "boolean") {
    fail("LIFECYCLE_STATE_INVALID");
  }
  const terminalPayloadState = status === "REVOKED" || status === "PURGED";
  if (terminalPayloadState !== retention.payloadTombstoned
    || terminalPayloadState !== (retention.tombstonedAt !== null)) {
    fail("LIFECYCLE_TOMBSTONE_INCONSISTENT");
  }
  if (retention.tombstonedAt !== null) {
    canonicalTime(retention.tombstonedAt, "TOMBSTONED_AT");
  }
  const objectMustBePresent = event.eventType === "QUARANTINED" && status === "SETTLED";
  if (objectMustBePresent !== (object !== null)) {
    fail("LIFECYCLE_OBJECT_VISIBILITY_INCONSISTENT");
  }
  return deepFreeze({ reservationStatus: status,
    retentionUntil: retention.retentionUntil,
    payloadTombstoned: retention.payloadTombstoned,
    tombstonedAt: retention.tombstonedAt });
}

function sourceSnapshot(v1ExportItem, eventObjectSnapshot) {
  if ((v1ExportItem === null) === (eventObjectSnapshot === null)) {
    fail("EXACTLY_ONE_SOURCE_SNAPSHOT_REQUIRED");
  }
  if (v1ExportItem !== null) {
    const item = canonicalClone(v1ExportItem, "V1_EXPORT_ITEM");
    exactObject(item, ["event", "object", "derivedState", "retention"],
      "V1_EXPORT_ITEM");
    const event = validateEvent(item.event);
    const object = item.object === null ? null : canonicalClone(item.object, "NETWORK_OBJECT");
    const lifecycle = validateLifecycle(event, object, item.derivedState, item.retention);
    return deepFreeze({ sourceKind: "V1_EXPORT_ITEM", event, object, lifecycle,
      predecessorHash: digest(
        "outsider/network-quarantine-export-v1-item/v1", item) });
  }
  const snapshot = canonicalClone(eventObjectSnapshot, "EVENT_OBJECT_SNAPSHOT");
  exactObject(snapshot, ["event", "object"], "EVENT_OBJECT_SNAPSHOT");
  const event = validateEvent(snapshot.event);
  const object = snapshot.object === null ? null
    : canonicalClone(snapshot.object, "NETWORK_OBJECT");
  const status = event.eventType === "QUARANTINED" ? "SETTLED"
    : event.eventType === "RESERVED" ? "OPEN" : event.eventType;
  const tombstoned = status === "REVOKED" || status === "PURGED";
  const lifecycle = validateLifecycle(event, object, { reservationStatus: status }, {
    retentionUntil: event.retentionUntil,
    payloadTombstoned: tombstoned,
    tombstonedAt: tombstoned ? event.occurredAt : null,
  });
  return deepFreeze({ sourceKind: "EXACT_EVENT_OBJECT_SNAPSHOT", event, object,
    lifecycle, predecessorHash: digest(
      "outsider/network-quarantine-event-object-snapshot/v1", snapshot) });
}

function sourceReviewSetPin(pinValue, event, artifactBindingSetRoot) {
  const pin = canonicalClone(pinValue, "SOURCE_REVIEW_SET_PIN");
  exactObject(pin, ["schema", "checkpointHash", "reservationHash", "manifestHash",
    "eventHash", "artifactBindingSetRoot", "sourceReviewSetRoot"],
  "SOURCE_REVIEW_SET_PIN");
  if (pin.schema !== NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.sourceReviewSetPin
    || pin.reservationHash !== event.reservationHash
    || pin.manifestHash !== event.manifestHash || pin.eventHash !== event.eventHash
    || pin.artifactBindingSetRoot !== artifactBindingSetRoot) {
    fail("SOURCE_REVIEW_SET_PIN_BINDING_INVALID");
  }
  for (const field of ["checkpointHash", "reservationHash", "manifestHash", "eventHash",
    "artifactBindingSetRoot", "sourceReviewSetRoot"]) {
    hash(pin[field], `SOURCE_REVIEW_SET_PIN_${field}`);
  }
  const expectedRoot = networkQuarantineSourceReviewSetRoot({
    checkpointHash: pin.checkpointHash,
    reservationHash: pin.reservationHash,
    manifestHash: pin.manifestHash,
    eventHash: pin.eventHash,
    artifactBindingSetRoot: pin.artifactBindingSetRoot,
  });
  if (pin.sourceReviewSetRoot !== expectedRoot) {
    fail("SOURCE_REVIEW_SET_PIN_ROOT_INVALID");
  }
  return deepFreeze({
    schema: pin.schema,
    pinHash: digest(NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.sourceReviewSetPin, pin),
    checkpointHash: pin.checkpointHash,
    reservationHash: pin.reservationHash,
    manifestHash: pin.manifestHash,
    eventHash: pin.eventHash,
    artifactBindingSetRoot: pin.artifactBindingSetRoot,
    sourceReviewSetRoot: pin.sourceReviewSetRoot,
    callerPinned: true,
    externalPinProvenanceEstablished: false,
    checkpointReplayVerifiedHere: false,
    reviewSemanticsAdjudicated: false,
  });
}

function externalHeadAnchor(pinValue, event) {
  if (pinValue === null) {
    return deepFreeze({
      pinned: false,
      externalHeadAnchorEstablished: false,
      verificationClass: "NONE",
      pinHash: null,
      checkpointHash: null,
      anchorBundleHash: null,
      trustPolicyHash: null,
      anchoredEventCount: null,
      anchoredTailHash: null,
      independentWitnessEstablished: false,
      nonOmissionProofEstablished: false,
      nonEquivocationEstablished: false,
    });
  }
  const pin = canonicalClone(pinValue, "EXTERNAL_HEAD_PIN");
  exactObject(pin, ["schema", "eventOrdinal", "eventHash", "checkpointHash",
    "anchorBundleHash", "trustPolicyHash", "anchoredEventCount", "anchoredTailHash"],
  "EXTERNAL_HEAD_PIN");
  if (pin.schema !== NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.externalHeadPin
    || pin.eventOrdinal !== event.ordinal || pin.eventHash !== event.eventHash
    || !Number.isSafeInteger(pin.anchoredEventCount)
    || pin.anchoredEventCount < event.ordinal) fail("EXTERNAL_HEAD_PIN_BINDING_INVALID");
  for (const field of ["eventHash", "checkpointHash", "anchorBundleHash",
    "trustPolicyHash", "anchoredTailHash"]) hash(pin[field], `EXTERNAL_HEAD_${field}`);
  if (pin.anchoredEventCount === event.ordinal
    && pin.anchoredTailHash !== event.eventHash) {
    fail("EXTERNAL_HEAD_TAIL_BINDING_INVALID");
  }
  return deepFreeze({
    pinned: true,
    externalHeadAnchorEstablished: false,
    verificationClass: "CALLER_PINNED_DIGEST_ONLY_NOT_AN_EXTERNAL_ANCHOR",
    pinHash: digest(NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.externalHeadPin, pin),
    checkpointHash: pin.checkpointHash,
    anchorBundleHash: pin.anchorBundleHash,
    trustPolicyHash: pin.trustPolicyHash,
    anchoredEventCount: pin.anchoredEventCount,
    anchoredTailHash: pin.anchoredTailHash,
    independentWitnessEstablished: false,
    nonOmissionProofEstablished: false,
    nonEquivocationEstablished: false,
  });
}

function options(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || isProxy(input)) {
    fail("INPUT_OBJECT_INVALID");
  }
  const allowed = new Set(["persistedContract", "v1ExportItem", "eventObjectSnapshot",
    "sourceReviewDirectory", "sourceReviewFiles", "sourceReviewSetPin", "reviewedAt",
    "externalHeadPin"]);
  for (const key of Reflect.ownKeys(input)) {
    if (typeof key !== "string" || !allowed.has(key)) fail("INPUT_SHAPE_INVALID");
    const descriptor = Object.getOwnPropertyDescriptor(input, key);
    if (!(descriptor && "value" in descriptor) || descriptor.enumerable !== true) {
      fail("INPUT_DESCRIPTOR_INVALID");
    }
  }
  for (const required of ["persistedContract", "sourceReviewDirectory",
    "sourceReviewFiles", "reviewedAt"]) {
    if (!Object.hasOwn(input, required)) fail("INPUT_REQUIRED", required);
  }
  return {
    persistedContract: input.persistedContract,
    v1ExportItem: Object.hasOwn(input, "v1ExportItem") ? input.v1ExportItem : null,
    eventObjectSnapshot: Object.hasOwn(input, "eventObjectSnapshot")
      ? input.eventObjectSnapshot : null,
    sourceReviewDirectory: input.sourceReviewDirectory,
    sourceReviewFiles: input.sourceReviewFiles,
    sourceReviewSetPin: Object.hasOwn(input, "sourceReviewSetPin")
      ? input.sourceReviewSetPin : null,
    reviewedAt: input.reviewedAt,
    externalHeadPin: Object.hasOwn(input, "externalHeadPin") ? input.externalHeadPin : null,
  };
}

export function createNetworkQuarantineSourceReviewExport(input) {
  const selected = options(input);
  const reviewedAt = canonicalTime(selected.reviewedAt, "REVIEWED_AT");
  const snapshot = sourceSnapshot(selected.v1ExportItem, selected.eventObjectSnapshot);
  if (Date.parse(reviewedAt) < Date.parse(snapshot.event.occurredAt)) {
    fail("REVIEW_PRECEDES_EVENT");
  }
  const anchor = externalHeadAnchor(selected.externalHeadPin, snapshot.event);
  const lifecycleSuppressed = snapshot.lifecycle.payloadTombstoned
    || snapshot.lifecycle.reservationStatus === "REVOKED"
    || snapshot.lifecycle.reservationStatus === "PURGED";
  let contractProjection;
  let sourceReviewSetRoot;
  let sourceReviewSetPinProjection;
  let sourceReview;
  if (lifecycleSuppressed) {
    /* A retained reservation_json/manifest sidecar must never become a
       post-revocation or post-purge disclosure escape.  Deliberately do not
       inspect selected.persistedContract, sourceReviewDirectory, or any file
       path on this branch. */
    contractProjection = {
      kind: "SUPPRESSED_BY_RESERVATION_LIFECYCLE",
      persistedContractHash: null,
      reservationHash: snapshot.event.reservationHash,
      manifestHash: snapshot.event.manifestHash,
      manifestReplayVerified: false,
      reservationSelfSignatureVerified: false,
      reservationChallengeReplayVerified: false,
      challengeServerKeyPinned: false,
      transportSignatureEstablishesActorIdentity: false,
      transportSignatureEstablishesAuthority: false,
      rawPersistedContractProjected: false,
      persistedSidecarRead: false,
    };
    sourceReviewSetRoot = null;
    sourceReviewSetPinProjection = null;
    sourceReview = {
      fileCount: 0,
      totalBytes: 0,
      bindings: [],
      artifactBindingSetRoot: null,
      hashConvention:
        "V2_KIND_SEPARATED_LENGTH_PREFIXED_SHA256_EXPLICIT_DOMAIN",
      predecessorV1EstablishedHashConvention: false,
      replayEstablishedOnlyUnderDescendantConvention: false,
      lifecycleSuppressed: true,
      unavailableReason: "RESERVATION_REVOKED_OR_PURGED",
      allFilesRegular: false,
      allFilesMode0600: false,
      symlinksAccepted: false,
      sourceManifestByteReplayEstablished: false,
      instrumentByteReplayEstablished: false,
      rightsReviewByteReplayEstablished: false,
      privacyReviewByteReplayEstablished: false,
      reviewSemanticsAdjudicated: false,
      rightsClearanceEstablished: false,
      privacyClearanceEstablished: false,
      networkProjectionAuthorized: false,
      rawBytesProjected: false,
      localPathsProjected: false,
      localFilesRead: false,
    };
  } else {
    const contract = persistedContract(selected.persistedContract, snapshot.event);
    const manifest = contract.manifest;
    validateEventManifestBinding(snapshot.event, manifest);
    if (snapshot.object !== null) {
      validateManifest(manifest, snapshot.event.manifestHash, snapshot.object);
    }
    const replay = replaySourceReviewFiles(selected.sourceReviewDirectory,
      selected.sourceReviewFiles, manifest.source);
    const setPin = sourceReviewSetPin(selected.sourceReviewSetPin, snapshot.event,
      replay.artifactBindingSetRoot);
    if (Object.values(manifest.source).includes(setPin.checkpointHash)) {
      fail("SOURCE_REVIEW_SET_PIN_ROLE_COLLISION");
    }
    contractProjection = contract.projection;
    sourceReviewSetRoot = setPin.sourceReviewSetRoot;
    sourceReviewSetPinProjection = setPin;
    sourceReview = {
      fileCount: replay.fileCount,
      totalBytes: replay.totalBytes,
      bindings: replay.bindings,
      artifactBindingSetRoot: replay.artifactBindingSetRoot,
      hashConvention:
        "V2_KIND_SEPARATED_LENGTH_PREFIXED_SHA256_EXPLICIT_DOMAIN",
      predecessorV1EstablishedHashConvention: false,
      replayEstablishedOnlyUnderDescendantConvention: true,
      lifecycleSuppressed: false,
      unavailableReason: null,
      allFilesRegular: true,
      allFilesMode0600: true,
      symlinksAccepted: false,
      sourceManifestByteReplayEstablished: true,
      instrumentByteReplayEstablished: true,
      rightsReviewByteReplayEstablished: true,
      privacyReviewByteReplayEstablished: true,
      reviewSemanticsAdjudicated: false,
      rightsClearanceEstablished: false,
      privacyClearanceEstablished: false,
      networkProjectionAuthorized: false,
      rawBytesProjected: false,
      localPathsProjected: false,
      localFilesRead: true,
    };
  }
  if (anchor.pinned && sourceReviewSetPinProjection !== null
    && anchor.checkpointHash !== sourceReviewSetPinProjection.checkpointHash) {
    fail("CHECKPOINT_PIN_CONTEXT_MISMATCH");
  }
  const occurrenceCensus = {
    ledgerKind: "OCCURRENCE",
    occurrenceIdentityHash: snapshot.event.occurrenceIdentityHash,
    observedEventBindings: 1,
    observedQuarantinedOccurrences: snapshot.event.eventType === "QUARANTINED" ? 1 : 0,
    historicalOccurrenceCompletenessEstablished: false,
    deduplicatedByObjectIdentity: false,
  };
  const objectDedup = {
    ledgerKind: "CONTENT_ADDRESSED_OBJECT",
    objectIdentityHash: snapshot.event.objectIdentityHash,
    referencedDistinctObjectIdentities: 1,
    payloadProjectionPresentInPredecessor: snapshot.object !== null,
    payloadProjectionPresentInDescendant: false,
    contentAddressedDeduplicationApplies: true,
    occurrenceCountDerivedFromObjectCount: false,
  };
  const body = {
    schema: NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.export,
    schemaVersion: "2.0.0",
    reviewedAt,
    supersession: {
      predecessorSchema: NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.predecessorExport,
      relationship: "APPEND_ONLY_DESCENDANT",
      sourceKind: snapshot.sourceKind,
      structuralFixtureOnly: snapshot.sourceKind === "EXACT_EVENT_OBJECT_SNAPSHOT",
      networkPublicationAdmissible: false,
      predecessorItemOrSnapshotHash: snapshot.predecessorHash,
      predecessorMutationAllowed: false,
      predecessorOverwritten: false,
      completePredecessorPageReplayEstablished: false,
    },
    networkBinding: {
      registryId: snapshot.event.registryId,
      reservationHash: snapshot.event.reservationHash,
      manifestHash: snapshot.event.manifestHash,
      eventOrdinal: snapshot.event.ordinal,
      eventHash: snapshot.event.eventHash,
      lane: snapshot.event.lane,
      objectIdentityHash: snapshot.event.objectIdentityHash,
      occurrenceIdentityHash: snapshot.event.occurrenceIdentityHash,
    },
    networkSnapshot: {
      event: snapshot.event,
      object: null,
      objectSuppressed: true,
      predecessorObjectWasPresent: snapshot.object !== null,
    },
    persistedContract: contractProjection,
    lifecycle: {
      eventType: snapshot.event.eventType,
      reservationStatus: snapshot.lifecycle.reservationStatus,
      revoked: snapshot.lifecycle.reservationStatus === "REVOKED",
      purged: snapshot.lifecycle.reservationStatus === "PURGED",
      retentionUntil: snapshot.lifecycle.retentionUntil,
      payloadTombstoned: snapshot.lifecycle.payloadTombstoned,
      tombstonedAt: snapshot.lifecycle.tombstonedAt,
      payloadAccessibleInDescendant: false,
      futureSettlementAuthorized: false,
    },
    occurrenceCensus,
    objectDedup,
    occurrenceObjectConflated: false,
    sourceReviewSetRoot,
    sourceReviewSetPin: sourceReviewSetPinProjection,
    sourceReview,
    externalHeadAnchor: anchor,
    inheritedIntakeBoundaryHash: digest(
      "outsider/network-intake-boundary/v1", NETWORK_INTAKE_BOUNDARY),
    useBoundary: NETWORK_QUARANTINE_SOURCE_REVIEW_BOUNDARY,
  };
  return deepFreeze({ ...body,
    exportHash: digest(NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.export, body) });
}

export function verifyNetworkQuarantineSourceReviewExportStructure(record, {
  expectedExportHash = null,
  expectedSourceReviewSetRoot = null,
} = {}) {
  try {
    const value = canonicalClone(record, "EXPORT");
    exactObject(value, ["schema", "schemaVersion", "reviewedAt", "supersession",
      "networkBinding", "networkSnapshot", "persistedContract", "lifecycle",
      "occurrenceCensus", "objectDedup", "occurrenceObjectConflated",
      "sourceReviewSetRoot", "sourceReviewSetPin", "sourceReview", "externalHeadAnchor",
      "inheritedIntakeBoundaryHash", "useBoundary", "exportHash"], "EXPORT");
    const { exportHash, ...body } = value;
    if (value.schema !== NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.export
      || value.schemaVersion !== "2.0.0"
      || exportHash !== digest(NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.export, body)
      || expectedExportHash !== null && exportHash !== hash(expectedExportHash,
        "EXPECTED_EXPORT_HASH")
      || expectedSourceReviewSetRoot !== null
        && value.sourceReviewSetRoot !== hash(expectedSourceReviewSetRoot,
          "EXPECTED_SOURCE_REVIEW_SET_ROOT")
      || !same(value.useBoundary, NETWORK_QUARANTINE_SOURCE_REVIEW_BOUNDARY)
      || value.occurrenceObjectConflated !== false
      || value.inheritedIntakeBoundaryHash !== digest(
        "outsider/network-intake-boundary/v1", NETWORK_INTAKE_BOUNDARY)) {
      fail("EXPORT_STRUCTURE_INVALID");
    }
    canonicalTime(value.reviewedAt, "EXPORT_REVIEWED_AT");
    const event = validateEvent(value.networkSnapshot.event);
    if (Date.parse(value.reviewedAt) < Date.parse(event.occurredAt)) {
      fail("EXPORT_REVIEW_PRECEDES_EVENT");
    }
    exactObject(value.supersession, ["predecessorSchema", "relationship", "sourceKind",
      "structuralFixtureOnly", "networkPublicationAdmissible",
      "predecessorItemOrSnapshotHash", "predecessorMutationAllowed",
      "predecessorOverwritten", "completePredecessorPageReplayEstablished"],
    "EXPORT_SUPERSESSION");
    const fixtureOnly = value.supersession.sourceKind === "EXACT_EVENT_OBJECT_SNAPSHOT";
    if (value.supersession.predecessorSchema
        !== NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.predecessorExport
      || value.supersession.relationship !== "APPEND_ONLY_DESCENDANT"
      || !["V1_EXPORT_ITEM", "EXACT_EVENT_OBJECT_SNAPSHOT"]
        .includes(value.supersession.sourceKind)
      || value.supersession.structuralFixtureOnly !== fixtureOnly
      || value.supersession.networkPublicationAdmissible !== false
      || !HASH.test(value.supersession.predecessorItemOrSnapshotHash)
      || value.supersession.predecessorMutationAllowed !== false
      || value.supersession.predecessorOverwritten !== false
      || value.supersession.completePredecessorPageReplayEstablished !== false) {
      fail("EXPORT_SUPERSESSION_INVALID");
    }
    exactObject(value.networkBinding, ["registryId", "reservationHash", "manifestHash",
      "eventOrdinal", "eventHash", "lane", "objectIdentityHash",
      "occurrenceIdentityHash"], "EXPORT_NETWORK_BINDING");
    exactObject(value.networkSnapshot, ["event", "object", "objectSuppressed",
      "predecessorObjectWasPresent"], "EXPORT_NETWORK_SNAPSHOT");
    if (value.networkSnapshot.object !== null
      || value.networkSnapshot.objectSuppressed !== true
      || typeof value.networkSnapshot.predecessorObjectWasPresent !== "boolean"
      || value.networkBinding.registryId !== event.registryId
      || value.networkBinding.eventOrdinal !== event.ordinal
      || value.networkBinding.lane !== event.lane
      || value.networkBinding.eventHash !== event.eventHash
      || value.networkBinding.manifestHash !== event.manifestHash
      || value.networkBinding.reservationHash !== event.reservationHash
      || value.networkBinding.objectIdentityHash !== event.objectIdentityHash
      || value.networkBinding.occurrenceIdentityHash !== event.occurrenceIdentityHash) {
      fail("EXPORT_BINDING_INVALID");
    }

    exactObject(value.lifecycle, ["eventType", "reservationStatus", "revoked", "purged",
      "retentionUntil", "payloadTombstoned", "tombstonedAt",
      "payloadAccessibleInDescendant", "futureSettlementAuthorized"],
    "EXPORT_LIFECYCLE");
    validateLifecycle(event,
      value.networkSnapshot.predecessorObjectWasPresent ? {} : null,
      { reservationStatus: value.lifecycle.reservationStatus },
      { retentionUntil: value.lifecycle.retentionUntil,
        payloadTombstoned: value.lifecycle.payloadTombstoned,
        tombstonedAt: value.lifecycle.tombstonedAt });
    if (value.lifecycle.eventType !== event.eventType
      || value.lifecycle.revoked !== (value.lifecycle.reservationStatus === "REVOKED")
      || value.lifecycle.purged !== (value.lifecycle.reservationStatus === "PURGED")
      || value.lifecycle.payloadAccessibleInDescendant !== false
      || value.lifecycle.futureSettlementAuthorized !== false) {
      fail("EXPORT_LIFECYCLE_INVALID");
    }
    const terminal = value.lifecycle.payloadTombstoned
      || value.lifecycle.reservationStatus === "REVOKED"
      || value.lifecycle.reservationStatus === "PURGED";

    exactObject(value.persistedContract, ["kind", "persistedContractHash",
      "reservationHash", "manifestHash", "manifestReplayVerified",
      "reservationSelfSignatureVerified", "reservationChallengeReplayVerified",
      "challengeServerKeyPinned", "transportSignatureEstablishesActorIdentity",
      "transportSignatureEstablishesAuthority", "rawPersistedContractProjected",
      "persistedSidecarRead"], "EXPORT_PERSISTED_CONTRACT");
    if (value.persistedContract.reservationHash !== event.reservationHash
      || value.persistedContract.manifestHash !== event.manifestHash
      || value.persistedContract.reservationChallengeReplayVerified !== false
      || value.persistedContract.challengeServerKeyPinned !== false
      || value.persistedContract.transportSignatureEstablishesActorIdentity !== false
      || value.persistedContract.transportSignatureEstablishesAuthority !== false
      || value.persistedContract.rawPersistedContractProjected !== false) {
      fail("EXPORT_PERSISTED_CONTRACT_INVALID");
    }
    if (terminal) {
      if (value.persistedContract.kind !== "SUPPRESSED_BY_RESERVATION_LIFECYCLE"
        || value.persistedContract.persistedContractHash !== null
        || value.persistedContract.manifestReplayVerified !== false
        || value.persistedContract.reservationSelfSignatureVerified !== false
        || value.persistedContract.persistedSidecarRead !== false) {
        fail("EXPORT_TERMINAL_CONTRACT_DISCLOSURE");
      }
    } else if (!["MANIFEST_ONLY",
      "SELF_SIGNED_RESERVATION_TRANSPORT_POSSESSION_ONLY"]
      .includes(value.persistedContract.kind)
      || !HASH.test(value.persistedContract.persistedContractHash)
      || value.persistedContract.manifestReplayVerified !== true
      || value.persistedContract.persistedSidecarRead !== true
      || value.persistedContract.reservationSelfSignatureVerified
        !== (value.persistedContract.kind
          === "SELF_SIGNED_RESERVATION_TRANSPORT_POSSESSION_ONLY")) {
      fail("EXPORT_ACTIVE_CONTRACT_INVALID");
    }

    exactObject(value.occurrenceCensus, ["ledgerKind", "occurrenceIdentityHash",
      "observedEventBindings", "observedQuarantinedOccurrences",
      "historicalOccurrenceCompletenessEstablished", "deduplicatedByObjectIdentity"],
    "EXPORT_OCCURRENCE_CENSUS");
    exactObject(value.objectDedup, ["ledgerKind", "objectIdentityHash",
      "referencedDistinctObjectIdentities", "payloadProjectionPresentInPredecessor",
      "payloadProjectionPresentInDescendant", "contentAddressedDeduplicationApplies",
      "occurrenceCountDerivedFromObjectCount"], "EXPORT_OBJECT_DEDUP");
    if (value.occurrenceCensus.ledgerKind !== "OCCURRENCE"
      || value.occurrenceCensus.occurrenceIdentityHash !== event.occurrenceIdentityHash
      || value.occurrenceCensus.observedEventBindings !== 1
      || value.occurrenceCensus.observedQuarantinedOccurrences
        !== (event.eventType === "QUARANTINED" ? 1 : 0)
      || value.occurrenceCensus.historicalOccurrenceCompletenessEstablished !== false
      || value.occurrenceCensus.deduplicatedByObjectIdentity !== false
      || value.objectDedup.ledgerKind !== "CONTENT_ADDRESSED_OBJECT"
      || value.objectDedup.objectIdentityHash !== event.objectIdentityHash
      || value.objectDedup.referencedDistinctObjectIdentities !== 1
      || value.objectDedup.payloadProjectionPresentInPredecessor
        !== value.networkSnapshot.predecessorObjectWasPresent
      || value.objectDedup.payloadProjectionPresentInDescendant !== false
      || value.objectDedup.contentAddressedDeduplicationApplies !== true
      || value.objectDedup.occurrenceCountDerivedFromObjectCount !== false) {
      fail("EXPORT_CENSUS_OR_OBJECT_DEDUP_INVALID");
    }

    exactObject(value.sourceReview, ["fileCount", "totalBytes", "bindings",
      "artifactBindingSetRoot", "hashConvention",
      "predecessorV1EstablishedHashConvention",
      "replayEstablishedOnlyUnderDescendantConvention", "lifecycleSuppressed",
      "unavailableReason", "allFilesRegular", "allFilesMode0600", "symlinksAccepted",
      "sourceManifestByteReplayEstablished", "instrumentByteReplayEstablished",
      "rightsReviewByteReplayEstablished", "privacyReviewByteReplayEstablished",
      "reviewSemanticsAdjudicated", "rightsClearanceEstablished",
      "privacyClearanceEstablished", "networkProjectionAuthorized", "rawBytesProjected",
      "localPathsProjected", "localFilesRead"], "EXPORT_SOURCE_REVIEW");
    if (value.sourceReview.hashConvention
        !== "V2_KIND_SEPARATED_LENGTH_PREFIXED_SHA256_EXPLICIT_DOMAIN"
      || value.sourceReview.predecessorV1EstablishedHashConvention !== false
      || value.sourceReview.reviewSemanticsAdjudicated !== false
      || value.sourceReview.rightsClearanceEstablished !== false
      || value.sourceReview.privacyClearanceEstablished !== false
      || value.sourceReview.networkProjectionAuthorized !== false
      || value.sourceReview.rawBytesProjected !== false
      || value.sourceReview.localPathsProjected !== false
      || value.sourceReview.symlinksAccepted !== false) {
      fail("EXPORT_SOURCE_REVIEW_BOUNDARY_INVALID");
    }
    if (terminal) {
      if (value.sourceReviewSetRoot !== null || value.sourceReviewSetPin !== null
        || value.sourceReview.fileCount !== 0 || value.sourceReview.totalBytes !== 0
        || !Array.isArray(value.sourceReview.bindings)
        || value.sourceReview.bindings.length !== 0
        || value.sourceReview.artifactBindingSetRoot !== null
        || value.sourceReview.replayEstablishedOnlyUnderDescendantConvention !== false
        || value.sourceReview.lifecycleSuppressed !== true
        || value.sourceReview.unavailableReason !== "RESERVATION_REVOKED_OR_PURGED"
        || value.sourceReview.allFilesRegular !== false
        || value.sourceReview.allFilesMode0600 !== false
        || value.sourceReview.sourceManifestByteReplayEstablished !== false
        || value.sourceReview.instrumentByteReplayEstablished !== false
        || value.sourceReview.rightsReviewByteReplayEstablished !== false
        || value.sourceReview.privacyReviewByteReplayEstablished !== false
        || value.sourceReview.localFilesRead !== false) {
        fail("EXPORT_TERMINAL_SOURCE_REVIEW_DISCLOSURE");
      }
    } else {
      const checkedBindings = validateReplayBindings(value.sourceReview.bindings);
      const artifactBindingSetRoot = networkQuarantineSourceArtifactBindingSetRoot(
        checkedBindings.bindings);
      exactObject(value.sourceReviewSetPin, ["schema", "pinHash", "checkpointHash",
        "reservationHash", "manifestHash", "eventHash", "artifactBindingSetRoot",
        "sourceReviewSetRoot", "callerPinned", "externalPinProvenanceEstablished",
        "checkpointReplayVerifiedHere", "reviewSemanticsAdjudicated"],
      "EXPORT_SOURCE_REVIEW_SET_PIN");
      const setPin = value.sourceReviewSetPin;
      const setPinBody = {
        schema: setPin.schema,
        checkpointHash: setPin.checkpointHash,
        reservationHash: setPin.reservationHash,
        manifestHash: setPin.manifestHash,
        eventHash: setPin.eventHash,
        artifactBindingSetRoot: setPin.artifactBindingSetRoot,
        sourceReviewSetRoot: setPin.sourceReviewSetRoot,
      };
      const expectedRoot = networkQuarantineSourceReviewSetRoot({
        checkpointHash: setPin.checkpointHash,
        reservationHash: event.reservationHash,
        manifestHash: event.manifestHash,
        eventHash: event.eventHash,
        artifactBindingSetRoot,
      });
      if (value.sourceReview.fileCount !== 4
        || value.sourceReview.totalBytes !== checkedBindings.totalBytes
        || value.sourceReview.artifactBindingSetRoot !== artifactBindingSetRoot
        || value.sourceReview.replayEstablishedOnlyUnderDescendantConvention !== true
        || value.sourceReview.lifecycleSuppressed !== false
        || value.sourceReview.unavailableReason !== null
        || value.sourceReview.allFilesRegular !== true
        || value.sourceReview.allFilesMode0600 !== true
        || value.sourceReview.sourceManifestByteReplayEstablished !== true
        || value.sourceReview.instrumentByteReplayEstablished !== true
        || value.sourceReview.rightsReviewByteReplayEstablished !== true
        || value.sourceReview.privacyReviewByteReplayEstablished !== true
        || value.sourceReview.localFilesRead !== true
        || setPin.schema !== NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.sourceReviewSetPin
        || setPin.pinHash !== digest(
          NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.sourceReviewSetPin, setPinBody)
        || setPin.reservationHash !== event.reservationHash
        || setPin.manifestHash !== event.manifestHash || setPin.eventHash !== event.eventHash
        || setPin.artifactBindingSetRoot !== artifactBindingSetRoot
        || setPin.sourceReviewSetRoot !== expectedRoot
        || value.sourceReviewSetRoot !== expectedRoot || setPin.callerPinned !== true
        || setPin.externalPinProvenanceEstablished !== false
        || setPin.checkpointReplayVerifiedHere !== false
        || setPin.reviewSemanticsAdjudicated !== false) {
        fail("EXPORT_ACTIVE_SOURCE_REVIEW_INVALID");
      }
    }

    exactObject(value.externalHeadAnchor, ["pinned", "externalHeadAnchorEstablished",
      "verificationClass", "pinHash", "checkpointHash", "anchorBundleHash",
      "trustPolicyHash", "anchoredEventCount", "anchoredTailHash",
      "independentWitnessEstablished", "nonOmissionProofEstablished",
      "nonEquivocationEstablished"], "EXPORT_EXTERNAL_HEAD_ANCHOR");
    const anchor = value.externalHeadAnchor;
    if (typeof anchor.pinned !== "boolean" || anchor.externalHeadAnchorEstablished !== false
      || anchor.independentWitnessEstablished !== false
      || anchor.nonOmissionProofEstablished !== false
      || anchor.nonEquivocationEstablished !== false
      || !anchor.pinned && (anchor.verificationClass !== "NONE" || anchor.pinHash !== null
        || anchor.checkpointHash !== null || anchor.anchorBundleHash !== null
        || anchor.trustPolicyHash !== null || anchor.anchoredEventCount !== null
        || anchor.anchoredTailHash !== null)
      || anchor.pinned && (anchor.verificationClass
          !== "CALLER_PINNED_DIGEST_ONLY_NOT_AN_EXTERNAL_ANCHOR"
        || !HASH.test(anchor.pinHash) || !HASH.test(anchor.checkpointHash)
        || !HASH.test(anchor.anchorBundleHash) || !HASH.test(anchor.trustPolicyHash)
        || !Number.isSafeInteger(anchor.anchoredEventCount)
        || anchor.anchoredEventCount < event.ordinal
        || !HASH.test(anchor.anchoredTailHash))) {
      fail("EXPORT_EXTERNAL_HEAD_ANCHOR_INVALID");
    }
    if (anchor.pinned) {
      const pinBody = {
        schema: NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.externalHeadPin,
        eventOrdinal: event.ordinal,
        eventHash: event.eventHash,
        checkpointHash: anchor.checkpointHash,
        anchorBundleHash: anchor.anchorBundleHash,
        trustPolicyHash: anchor.trustPolicyHash,
        anchoredEventCount: anchor.anchoredEventCount,
        anchoredTailHash: anchor.anchoredTailHash,
      };
      if (anchor.pinHash !== digest(
        NETWORK_QUARANTINE_SOURCE_REVIEW_SCHEMAS.externalHeadPin, pinBody)
        || anchor.anchoredEventCount === event.ordinal
          && anchor.anchoredTailHash !== event.eventHash) {
        fail("EXPORT_EXTERNAL_HEAD_PIN_INVALID");
      }
    }
    if (!terminal && anchor.pinned
      && anchor.checkpointHash !== value.sourceReviewSetPin.checkpointHash) {
      fail("EXPORT_CHECKPOINT_PIN_CONTEXT_MISMATCH");
    }
    return deepFreeze({ ok: true, schema: value.schema, exportHash,
      sourceReviewSetRoot: value.sourceReviewSetRoot, decision: "HOLD",
      structuralOnly: true, sourceByteReplayReperformed: false });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message
        : "NETWORK_QUARANTINE_SOURCE_REVIEW_UNKNOWN_FAILURE",
      decision: "HOLD", structuralOnly: true, sourceByteReplayReperformed: false });
  }
}
