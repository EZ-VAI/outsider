/*
 * Outsider Globalping HTTP witness node v1.
 *
 * This adapter purchases no capacity and mints no authority. It asks the
 * unauthenticated Globalping public API for exactly one externally executed,
 * read-only HTTP observation of one caller-pinned public HTTPS URL. The
 * create POST is one-shot and is durably preceded by INTENT_ADMITTED,
 * SUBMIT_RESERVED, and SUBMIT_ATTEMPTED in the existing one-use effect
 * ledger. A returned measurement id may only be used for bounded GET status
 * reconciliation. Ambiguous create failures are terminal no-retry HOLDs.
 *
 * Raw API request/response bytes and private bindings live only in a 0700
 * journal with 0600 records. The public projection deliberately omits the
 * target, measurement id, response body/headers, addresses, and probe
 * location. Globalping output remains a third-party source-declared network
 * observation: it is not legal independence, outcome truth, capacity,
 * authority, price, guarantee, settlement, or COMMIT.
 */

import { createHash } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import {
  chmodSync, closeSync, constants, existsSync, fchmodSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeSync,
} from "node:fs";
import { isIP } from "node:net";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import {
  createPinnedPublicHttpsOneUsePostTransportV1,
} from "./outsider-pinned-public-https-one-use-post-transport-v1.js";
import {
  createPublicHttpsReadOnlyFetchTransportV1,
} from "./outsider-public-https-read-only-fetch-transport-v1.js";

const PREFIX = "OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const LEDGER_ID = /^ledger_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;
const MEASUREMENT_ID = /^[A-Za-z0-9_-]{8,128}$/u;
const JOURNAL_FILE = /^[0-9]{6}\.json$/u;
const CREATE_URL = "https://api.globalping.io/v1/measurements";
const API_ORIGIN = "https://api.globalping.io";
const MAX_API_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_JOURNAL_RECORD_BYTES = 4 * 1024 * 1024;
const POLL_INTERVAL_MS = 500;
const MAXIMUM_STATUS_READS = 20;

export const OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V1_SOURCE_PINS
  = Object.freeze({
    apiRepository: "https://github.com/jsdelivr/globalping",
    apiRepositoryCommit: "50aaddb6d312efbc018007e519053bc5c694c039",
    apiSpecPath: "public/v1/spec.yaml",
    apiSpecSha256:
      "1994758aa5f8b230f18cee513be6bece82b227fd87a6f9aa01072339acebd27d",
    apiSpecBytes: 9389,
    apiSchemasPath: "public/v1/components/schemas.yaml",
    apiSchemasSha256:
      "ea01155955413c2973de1d98fa47065313cca37ae7ab3c89c4de76703bd11075",
    apiSchemasBytes: 53010,
    apiResponsesPath: "public/v1/components/responses.yaml",
    apiResponsesSha256:
      "66a8cd4a1d273c348550bfe6804e5c21729ae6edad183bc02bc57fbdc5e26ed2",
    apiResponsesBytes: 11568,
    apiHeadersPath: "public/v1/components/headers.yaml",
    apiHeadersSha256:
      "87c4b9a69a1e046d6fad781cf2497a589acb7e61f4ceb22b705556728fb23b15",
    apiHeadersBytes: 1725,
    probeRepository: "https://github.com/jsdelivr/globalping-probe",
    probeRepositoryCommit: "11d27ebac3a9d4ebcdc4e02a64ae1f5a31baf854",
    probeHttpHandlerPath: "src/command/handlers/http/undici.ts",
    probeHttpHandlerSha256:
      "9ece3ec75cd5e7ec2aa10ac01ff8b53fcc2fd1804366a4eb937affa8f9e9689d",
    probeHttpHandlerBytes: 18835,
    apiAuthenticationUsed: false,
    apiPlan: "UNAUTHENTICATED_FREE_RATE_LIMIT_ONLY",
    sourceCodeNoRedirectBasis:
      "PINNED_HANDLER_USES_ONE_UNDICI_CLIENT_DISPATCH_WITHOUT_REDIRECT_LOOP",
    productionDeploymentRevisionAttested: false,
  });

export const OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V1_BOUNDARY
  = Object.freeze({
    position: "THIRD_PARTY_SOURCE_DECLARED_READ_ONLY_HTTP_OBSERVATION_NODE",
    globalpingCreateEndpoint: CREATE_URL,
    globalpingCreatePostMaximumAttempts: 1,
    globalpingCreatePostAutomaticRetries: 0,
    measurementStatusEndpointMethod: "GET",
    maximumStatusReads: MAXIMUM_STATUS_READS,
    minimumDelayAfterInProgressResponseMs: POLL_INTERVAL_MS,
    measuredTargetProtocols: Object.freeze(["HTTPS"]),
    measuredTargetMethods: Object.freeze(["HEAD", "GET"]),
    measuredTargetWriteMethodsPermitted: false,
    measuredTargetCredentialsPermitted: false,
    measuredTargetCustomHeadersPermitted: false,
    measuredTargetQueryPermitted: false,
    measuredTargetRedirectsRequested: false,
    publicHostnameAndAllLocalResolutionAddressesRequired: true,
    targetSelectionVerificationPerformedByThisModule: false,
    remoteProbePrivateAddressRefusalSourceDeclared: true,
    remoteDnsRebindingCryptographicallyExcluded: false,
    globalpingApiCredentialsUsed: false,
    paidCreditsPermitted: false,
    rawJournalRootMode: "0700",
    rawJournalRecordMode: "0600",
    publicProjectionOmitsTargetAndMeasurementId: true,
    globalpingObservationIsIndependentOutcomeTruth: false,
    legalIndependenceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    outcomeEstablished: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    humanQueueCreated: false,
    internalHumanFallbackPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256Bytes(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)) {
    fail(`${code}_INVALID`);
  }
  const milliseconds = Date.parse(value);
  if (!Number.isSafeInteger(milliseconds)
    || new Date(milliseconds).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function safeNow(clock) {
  let value;
  try { value = clock(); } catch { fail("CLOCK_FAILED"); }
  return instant(value, "CLOCK_INSTANT");
}

function normalizeTargetUrl(raw) {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 4096
    || Buffer.byteLength(raw, "utf8") !== raw.length) fail("TARGET_URL_INVALID");
  let url;
  try { url = new URL(raw); } catch { fail("TARGET_URL_INVALID"); }
  const hostname = url.hostname.toLowerCase().replace(/\.$/u, "");
  const labels = hostname.split(".");
  const refusedSuffixes = [
    ".local", ".localhost", ".internal", ".home", ".lan", ".test",
    ".invalid", ".example", ".onion", ".arpa",
  ];
  if (url.protocol !== "https:" || url.username !== ""
    || url.password !== "" || url.search !== "" || url.hash !== ""
    || (url.port !== "" && url.port !== "443") || isIP(hostname) !== 0
    || hostname.length > 253 || labels.length < 2
    || labels.some((label) => !DNS_LABEL.test(label))
    || hostname === "localhost"
    || refusedSuffixes.some((suffix) => hostname.endsWith(suffix))) {
    fail("EXACT_PUBLIC_HTTPS_TARGET_REQUIRED");
  }
  url.hostname = hostname;
  url.port = "";
  if (url.href !== raw || url.pathname.length > 2048) {
    fail("TARGET_URL_MUST_ALREADY_BE_CANONICAL");
  }
  return Object.freeze({ href: url.href, hostname, path: url.pathname });
}

function statusCodes(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) {
    fail("ACCEPTABLE_STATUS_CODES_INVALID");
  }
  const result = [];
  let previous = 0;
  for (const code of value) {
    if (!Number.isSafeInteger(code) || code < 200 || code > 299
      || code <= previous) fail("ACCEPTABLE_STATUS_CODES_INVALID");
    result.push(code);
    previous = code;
  }
  return Object.freeze(result);
}

function projectionSalt(value) {
  if (typeof value !== "string") fail("PROJECTION_SALT_INVALID");
  let bytes;
  try { bytes = Buffer.from(value, "base64"); } catch {
    fail("PROJECTION_SALT_INVALID");
  }
  if (bytes.length !== 32 || bytes.toString("base64") !== value) {
    fail("PROJECTION_SALT_INVALID");
  }
  return value;
}

function freezePlan(body) {
  const measurementRequestBytes = Buffer.from(canonicalizeStrict(
    body.measurementRequest), "utf8");
  const derived = {
    ...body,
    measurementRequestHash: sha256Bytes(measurementRequestBytes),
    privateBindingCommitment: digest(
      "outsider/globalping-http-witness-private-binding/v1", {
        projectionSaltBase64: body.projectionSaltBase64,
        targetUrl: body.targetUrl,
        outcomeRequirementHash: body.outcomeRequirementHash,
        evidenceRequirementHash: body.evidenceRequirementHash,
        targetSelectionProvenanceClass:
          body.targetSelectionProvenanceClass,
        targetSelectionProvenanceHash: body.targetSelectionProvenanceHash,
        measurementRequestHash: sha256Bytes(measurementRequestBytes),
      }),
  };
  const plan = Object.freeze({ ...derived, planHash: digest(
    "outsider/globalping-http-witness-plan/v1", derived) });
  return { plan, measurementRequestBytes };
}

export function createGlobalpingHttpWitnessPlanV1(input = {}) {
  exactObject(input, [
    "targetUrl", "requestMethod", "outcomeRequirementHash",
    "evidenceRequirementHash", "targetSelectionProvenanceClass",
    "targetSelectionProvenanceHash", "acceptableStatusCodes",
    "requireTlsAuthorized", "maximumTotalMilliseconds", "probeLimit",
    "measurementTimeoutSeconds", "effectDeadline", "projectionSaltBase64",
  ], "PLAN_INPUT");
  const target = normalizeTargetUrl(input.targetUrl);
  if (input.requestMethod !== "HEAD" && input.requestMethod !== "GET") {
    fail("READ_ONLY_TARGET_METHOD_REQUIRED");
  }
  if (input.requireTlsAuthorized !== true) fail("TLS_AUTHORIZATION_REQUIRED");
  if (input.maximumTotalMilliseconds !== null
    && (!Number.isSafeInteger(input.maximumTotalMilliseconds)
      || input.maximumTotalMilliseconds < 1
      || input.maximumTotalMilliseconds > 300_000)) {
    fail("MAXIMUM_TOTAL_MILLISECONDS_INVALID");
  }
  if (input.probeLimit !== 1) fail("EXACTLY_ONE_PROBE_REQUIRED");
  if (!Number.isSafeInteger(input.measurementTimeoutSeconds)
    || input.measurementTimeoutSeconds < 5
    || input.measurementTimeoutSeconds > 30) {
    fail("MEASUREMENT_TIMEOUT_SECONDS_INVALID");
  }
  const body = {
    schema: "outsider/globalping-http-witness-plan/v1",
    schemaVersion: "1.0.0",
    planClass: "ONE_EXTERNALLY_EXECUTED_READ_ONLY_HTTP_OBSERVATION",
    sourcePins: OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V1_SOURCE_PINS,
    targetUrl: target.href,
    targetHostname: target.hostname,
    requestMethod: input.requestMethod,
    outcomeRequirementHash: hash(input.outcomeRequirementHash,
      "OUTCOME_REQUIREMENT_HASH"),
    evidenceRequirementHash: hash(input.evidenceRequirementHash,
      "EVIDENCE_REQUIREMENT_HASH"),
    targetSelectionProvenanceClass:
      input.targetSelectionProvenanceClass
        === "CALLER_PINNED_PUBLIC_HTTPS_TARGET"
        ? "CALLER_PINNED_PUBLIC_HTTPS_TARGET"
        : fail("TARGET_SELECTION_PROVENANCE_CLASS_INVALID"),
    targetSelectionProvenanceHash: hash(
      input.targetSelectionProvenanceHash,
      "TARGET_SELECTION_PROVENANCE_HASH"),
    targetSelectionVerificationPerformedByThisModule: false,
    acceptableStatusCodes: statusCodes(input.acceptableStatusCodes),
    requireTlsAuthorized: true,
    maximumTotalMilliseconds: input.maximumTotalMilliseconds,
    probeLimit: 1,
    measurementTimeoutSeconds: input.measurementTimeoutSeconds,
    effectDeadline: instant(input.effectDeadline, "EFFECT_DEADLINE"),
    projectionSaltBase64: projectionSalt(input.projectionSaltBase64),
    measurementRequest: Object.freeze({
      inProgressUpdates: false,
      limit: 1,
      measurementOptions: Object.freeze({
        port: 443,
        protocol: "HTTPS",
        request: Object.freeze({
          method: input.requestMethod,
          path: target.path,
          query: "",
        }),
      }),
      target: target.hostname,
      timeout: input.measurementTimeoutSeconds,
      type: "http",
    }),
    measuredTargetCredentialsPresent: false,
    measuredTargetCustomHeadersPresent: false,
    measuredTargetRedirectFollowRequested: false,
    paidApiCredentialPresent: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  return freezePlan(body).plan;
}

function assertPlan(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("PLAN_INVALID");
  }
  const recreated = createGlobalpingHttpWitnessPlanV1({
    targetUrl: value.targetUrl,
    requestMethod: value.requestMethod,
    outcomeRequirementHash: value.outcomeRequirementHash,
    evidenceRequirementHash: value.evidenceRequirementHash,
    targetSelectionProvenanceClass: value.targetSelectionProvenanceClass,
    targetSelectionProvenanceHash: value.targetSelectionProvenanceHash,
    acceptableStatusCodes: value.acceptableStatusCodes,
    requireTlsAuthorized: value.requireTlsAuthorized,
    maximumTotalMilliseconds: value.maximumTotalMilliseconds,
    probeLimit: value.probeLimit,
    measurementTimeoutSeconds: value.measurementTimeoutSeconds,
    effectDeadline: value.effectDeadline,
    projectionSaltBase64: value.projectionSaltBase64,
  });
  if (canonicalizeStrict(recreated) !== canonicalizeStrict(value)) {
    fail("PLAN_DERIVATION_INVALID");
  }
  return recreated;
}

function ipv4Number(address) {
  return address.split(".").reduce((number, part) => number * 256 + Number(part),
    0) >>> 0;
}

const NON_PUBLIC_IPV4 = Object.freeze([
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10],
  ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
]);

function ipv6BigInt(address) {
  const split = address.toLowerCase().split("::");
  if (split.length > 2) return null;
  const expand = (side) => {
    if (side === "") return [];
    const output = [];
    for (const piece of side.split(":")) {
      if (piece.includes(".")) {
        if (isIP(piece) !== 4) return null;
        const v4 = ipv4Number(piece);
        output.push(((v4 >>> 16) & 0xffff).toString(16));
        output.push((v4 & 0xffff).toString(16));
      } else if (/^[a-f0-9]{1,4}$/u.test(piece)) output.push(piece);
      else return null;
    }
    return output;
  };
  const left = expand(split[0]);
  const right = expand(split.length === 2 ? split[1] : "");
  if (left === null || right === null) return null;
  const missing = 8 - left.length - right.length;
  if ((split.length === 1 && missing !== 0)
    || (split.length === 2 && missing < 1)) return null;
  let result = 0n;
  for (const word of [...left, ...Array(missing).fill("0"), ...right]) {
    result = (result << 16n) | BigInt(`0x${word}`);
  }
  return result;
}

function publicAddress(address, family) {
  const detected = isIP(address);
  if ((family === 4 || family === "IPv4") && detected !== 4) return false;
  if ((family === 6 || family === "IPv6") && detected !== 6) return false;
  if (detected === 4) {
    const value = ipv4Number(address);
    return !NON_PUBLIC_IPV4.some(([base, bits]) =>
      (value >>> (32 - bits)) === (ipv4Number(base) >>> (32 - bits)));
  }
  if (detected !== 6 || address.includes("%")) return false;
  const value = ipv6BigInt(address);
  if (value === null) return false;
  const subnet = (base, bits) =>
    (value >> (128n - BigInt(bits)))
      === (ipv6BigInt(base) >> (128n - BigInt(bits)));
  return subnet("2000::", 3) && !subnet("2001::", 23)
    && !subnet("2001:db8::", 32) && !subnet("2002::", 16)
    && !subnet("3fff::", 20);
}

async function preflightPublicTarget(plan, lookupImpl, signal) {
  let rows;
  try {
    rows = await lookupImpl(plan.targetHostname, {
      all: true, verbatim: true, signal,
    });
  } catch { fail("TARGET_DNS_PREFLIGHT_FAILED"); }
  if (!Array.isArray(rows) || rows.length < 1 || rows.length > 16) {
    fail("TARGET_DNS_PREFLIGHT_FAILED");
  }
  const output = [];
  const seen = new Set();
  for (const row of rows) {
    if (row === null || typeof row !== "object"
      || !publicAddress(row.address, row.family)) {
      fail("TARGET_DNS_NON_PUBLIC_OR_MIXED_REFUSED");
    }
    const family = row.family === 6 || row.family === "IPv6" ? 6 : 4;
    const key = `${family}:${row.address}`;
    if (!seen.has(key)) {
      seen.add(key);
      output.push(Object.freeze({ address: row.address, family }));
    }
  }
  return Object.freeze(output);
}

function assertPrivateDirectory(directory, code) {
  const absolute = path.resolve(directory);
  let stat;
  try { stat = lstatSync(absolute); } catch { fail(`${code}_UNREADABLE`); }
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || (stat.mode & 0o777) !== 0o700 || realpathSync(absolute) !== absolute) {
    fail(`${code}_INVALID`);
  }
  return absolute;
}

function fsyncDirectory(directory) {
  const descriptor = openSync(directory,
    constants.O_RDONLY | constants.O_NOFOLLOW);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function initializeEpisode(directory) {
  const root = path.resolve(directory);
  if (existsSync(root)) fail("PRIVATE_EPISODE_DIRECTORY_ALREADY_EXISTS");
  const parent = assertPrivateDirectory(path.dirname(root),
    "PRIVATE_EPISODE_PARENT");
  mkdirSync(root, { mode: 0o700 });
  chmodSync(root, 0o700);
  fsyncDirectory(parent);
  assertPrivateDirectory(root, "PRIVATE_EPISODE_ROOT");
  const journal = path.join(root, "raw-globalping-journal");
  mkdirSync(journal, { mode: 0o700 });
  chmodSync(journal, 0o700);
  fsyncDirectory(root);
  return Object.freeze({ root, journal, ledger: path.join(root,
    "one-use-effect-ledger") });
}

function journalRecord(body) {
  return Object.freeze({ ...body, recordHash: digest(
    "outsider/globalping-http-witness-raw-journal-record/v1", body) });
}

function appendJournal(state, phase, recordedAt, payload) {
  const body = {
    schema: "outsider/globalping-http-witness-raw-journal-record/v1",
    schemaVersion: "1.0.0",
    sequence: state.sequence + 1,
    previousRecordHash: state.headHash,
    phase,
    recordedAt,
    payload,
    privateRawEvidence: true,
    publicProjectionPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  const record = journalRecord(body);
  const bytes = canonicalBytes(record);
  if (bytes.length > MAX_JOURNAL_RECORD_BYTES) fail("JOURNAL_RECORD_TOO_LARGE");
  const filename = path.join(state.directory,
    `${String(record.sequence).padStart(6, "0")}.json`);
  const descriptor = openSync(filename, constants.O_WRONLY | constants.O_CREAT
    | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
  fsyncDirectory(state.directory);
  state.sequence = record.sequence;
  state.headHash = record.recordHash;
  state.byteCount += bytes.length;
  return record;
}

function writePrivateCanonicalFile(directory, name, value) {
  if (!/^[a-z0-9][a-z0-9.-]{0,127}\.json$/u.test(name)) {
    fail("FINAL_ARTIFACT_NAME_INVALID");
  }
  assertPrivateDirectory(directory, "PRIVATE_EPISODE_ROOT");
  const filename = path.join(directory, name);
  const bytes = canonicalBytes(value);
  if (bytes.length > MAX_JOURNAL_RECORD_BYTES) {
    fail("FINAL_ARTIFACT_TOO_LARGE");
  }
  const descriptor = openSync(filename, constants.O_WRONLY | constants.O_CREAT
    | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
    fsyncSync(descriptor);
  } finally { closeSync(descriptor); }
  fsyncDirectory(directory);
  return Object.freeze({ name, bytes: bytes.length, mode: "0600",
    sha256: sha256Bytes(bytes) });
}

function finalizeDurableRun(state, projection) {
  const finalProjectionFile = writePrivateCanonicalFile(state.paths.root,
    "final-public-projection.json", projection);
  const manifestBody = {
    schema: "outsider/globalping-http-witness-run-manifest/v1",
    schemaVersion: "1.0.0",
    manifestClass: "PRIVATE_DURABLE_RUN_RECORD_PUBLISHED_LAST",
    sourcePins: OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V1_SOURCE_PINS,
    sourcePinsHash: digest(
      "outsider/globalping-http-witness-source-pins/v1",
      OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V1_SOURCE_PINS),
    targetSelectionProvenanceClass:
      state.plan.targetSelectionProvenanceClass,
    targetSelectionProvenanceHash:
      state.plan.targetSelectionProvenanceHash,
    targetSelectionVerificationPerformedByThisModule: false,
    privateTargetAndRequirementsBindingCommitment:
      state.plan.privateBindingCommitment,
    finalProjection: finalProjectionFile,
    privateRawJournal: {
      relativeDirectory: "raw-globalping-journal",
      headHash: state.journal.headHash,
      recordCount: state.journal.sequence,
      exactByteCount: state.journal.byteCount,
      directoryMode: "0700",
      recordMode: "0600",
    },
    oneUseEffectLedger: {
      relativeDirectory: "one-use-effect-ledger",
      ledgerId: state.ledgerId,
      headHash: state.ledgerVerification.head.headHash,
      entryCount: state.ledgerVerification.head.entryCount,
      exactEntryByteCount: state.ledgerVerification.exactEntryByteCount,
    },
    publicationOrder: Object.freeze([
      "final-public-projection.json", "manifest.json",
    ]),
    manifestPublishedLast: true,
    liveCreatePostAttemptCount: projection.createPostAttemptCount,
    liveCreatePostAutomaticRetryCount: 0,
    paidCreditsPermitted: false,
    independentOutcomeTruthEstablished: false,
    commitPermitted: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  const manifest = Object.freeze({ ...manifestBody, manifestHash: digest(
    "outsider/globalping-http-witness-run-manifest/v1", manifestBody) });
  const manifestFile = writePrivateCanonicalFile(state.paths.root,
    "manifest.json", manifest);
  return Object.freeze({
    ...projection,
    durableFinalProjectionFileHash: finalProjectionFile.sha256,
    durableFinalProjectionFileBytes: finalProjectionFile.bytes,
    durableManifestHash: manifest.manifestHash,
    durableManifestFileHash: manifestFile.sha256,
    durableManifestFileBytes: manifestFile.bytes,
    durableManifestPublishedLast: true,
  });
}

export function verifyGlobalpingHttpWitnessRawJournalV1(input = {}) {
  exactObject(input, ["directory", "expectedHeadHash"], "VERIFY_JOURNAL_INPUT");
  const directory = assertPrivateDirectory(input.directory, "RAW_JOURNAL");
  const names = readdirSync(directory).sort();
  if (names.length < 1 || names.length > 10_000) fail("JOURNAL_FILE_COUNT_INVALID");
  let previous = null;
  let byteCount = 0;
  const phaseCounts = {};
  for (let index = 0; index < names.length; index += 1) {
    const expected = `${String(index + 1).padStart(6, "0")}.json`;
    if (names[index] !== expected || !JOURNAL_FILE.test(names[index])) {
      fail("JOURNAL_SEQUENCE_INVALID");
    }
    const file = path.join(directory, names[index]);
    const stat = lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600
      || stat.size < 2 || stat.size > MAX_JOURNAL_RECORD_BYTES) {
      fail("JOURNAL_FILE_INVALID");
    }
    const bytes = readFileSync(file);
    let record;
    try { record = JSON.parse(bytes.toString("utf8")); }
    catch { fail("JOURNAL_JSON_INVALID"); }
    if (!bytes.equals(canonicalBytes(record)) || record.sequence !== index + 1
      || record.previousRecordHash !== previous) fail("JOURNAL_CHAIN_INVALID");
    const { recordHash, ...body } = record;
    if (journalRecord(body).recordHash !== recordHash) {
      fail("JOURNAL_HASH_INVALID");
    }
    previous = recordHash;
    byteCount += bytes.length;
    phaseCounts[record.phase] = (phaseCounts[record.phase] ?? 0) + 1;
  }
  if (input.expectedHeadHash !== null
    && hash(input.expectedHeadHash, "EXPECTED_JOURNAL_HEAD_HASH") !== previous) {
    fail("EXPECTED_JOURNAL_HEAD_HASH_MISMATCH");
  }
  return Object.freeze({
    schema: "outsider/globalping-http-witness-raw-journal-verification/v1",
    ok: true,
    recordCount: names.length,
    exactByteCount: byteCount,
    headHash: previous,
    phaseCounts: Object.freeze(phaseCounts),
    rawFilesModeRequired: "0600",
    rawDirectoryModeRequired: "0700",
    filesystemReadPerformed: true,
    networkIoPerformed: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
}

function responseHeaders(headers) {
  const names = [
    "content-type", "location", "retry-after", "etag",
    "x-ratelimit-limit", "x-ratelimit-consumed", "x-ratelimit-remaining",
    "x-ratelimit-reset", "x-credits-consumed", "x-credits-remaining",
    "x-request-cost",
  ];
  const output = {};
  for (const name of names) {
    let value = null;
    try { value = headers?.get?.(name) ?? null; } catch { value = null; }
    if (value !== null) output[name] = String(value);
  }
  return Object.freeze(output);
}

async function captureResponse(response) {
  if (response === null || typeof response !== "object"
    || !Number.isSafeInteger(response.status) || response.status < 100
    || response.status > 599 || typeof response.text !== "function") {
    fail("API_RESPONSE_INVALID");
  }
  let text;
  try { text = await response.text(); } catch { fail("API_RESPONSE_BODY_FAILED"); }
  const bytes = Buffer.from(text, "utf8");
  if (bytes.length > MAX_API_RESPONSE_BYTES) fail("API_RESPONSE_TOO_LARGE");
  return Object.freeze({ status: response.status,
    headers: responseHeaders(response.headers), bytes });
}

function parseJson(bytes, code) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); } catch { fail(code); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(code);
  }
  return value;
}

function createReceipt(response) {
  return digest("outsider/globalping-create-response/v1", {
    status: response.status,
    headers: response.headers,
    bodyHash: sha256Bytes(response.bytes),
    bodyLength: response.bytes.length,
  });
}

function validateCreateAccepted(response) {
  const value = parseJson(response.bytes, "CREATE_RESPONSE_JSON_INVALID");
  if (!MEASUREMENT_ID.test(value.id)
    || !Number.isSafeInteger(value.probesCount) || value.probesCount !== 1) {
    fail("CREATE_RESPONSE_BINDING_INVALID");
  }
  const expectedPath = `/v1/measurements/${value.id}`;
  let location;
  try { location = new URL(response.headers.location, API_ORIGIN); }
  catch { fail("CREATE_LOCATION_INVALID"); }
  if (location.origin !== API_ORIGIN || location.pathname !== expectedPath
    || location.search !== "" || location.hash !== "") {
    fail("CREATE_LOCATION_INVALID");
  }
  return Object.freeze({ id: value.id, probesCount: 1,
    statusUrl: `${API_ORIGIN}${expectedPath}` });
}

function responseReportsPaidCredits(response) {
  const value = response.headers["x-credits-consumed"];
  if (value === undefined || value === "0") return false;
  // A malformed value is handled conservatively as possible paid consumption.
  return true;
}

function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function evaluateFinalMeasurement(value, plan, measurementId) {
  if (value.id !== measurementId || value.type !== "http"
    || value.target !== plan.targetHostname || value.status !== "finished"
    || !Number.isSafeInteger(value.probesCount) || value.probesCount !== 1
    || !Array.isArray(value.results) || value.results.length !== 1) {
    fail("FINAL_MEASUREMENT_BINDING_INVALID");
  }
  const result = value.results[0]?.result;
  if (result === null || typeof result !== "object") {
    fail("FINAL_MEASUREMENT_RESULT_INVALID");
  }
  const counts = { finished: 0, failed: 0, offline: 0, other: 0 };
  if (Object.hasOwn(counts, result.status)) counts[result.status] += 1;
  else counts.other += 1;
  let matches = false;
  if (result.status === "finished") {
    if (!Number.isSafeInteger(result.statusCode)
      || result.statusCode < 100 || result.statusCode > 599
      || result.timings === null || typeof result.timings !== "object"
      || !finiteNonnegative(result.timings.total)
      || result.tls === null || typeof result.tls !== "object") {
      fail("FINISHED_HTTP_RESULT_INVALID");
    }
    const totalMatches = plan.maximumTotalMilliseconds === null
      || result.timings.total <= plan.maximumTotalMilliseconds;
    matches = plan.acceptableStatusCodes.includes(result.statusCode)
      && result.tls.authorized === true && totalMatches;
  } else if (result.status !== "failed" && result.status !== "offline") {
    fail("FINAL_MEASUREMENT_RESULT_STATUS_INVALID");
  }
  return Object.freeze({
    sourceDeclaredResultStatusCounts: Object.freeze(counts),
    sourceDeclaredRequirementMatch: matches,
  });
}

function publicProjection({ plan, disposition, externalReceiptObserved,
  statusReadCount, finalEvaluation, ledgerHeadHash, journal, postAttempts,
  targetDnsAddressCount, paidCreditsObserved = false }) {
  const body = {
    schema: "outsider/globalping-http-witness-public-projection/v1",
    schemaVersion: "1.0.0",
    observationClass: "THIRD_PARTY_SOURCE_DECLARED_HTTP_OBSERVATION",
    source: "GLOBALPING_PUBLIC_API",
    sourcePins: OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V1_SOURCE_PINS,
    targetSelectionVerificationPerformedByThisModule: false,
    privateTargetAndRequirementsBindingCommitment:
      plan.privateBindingCommitment,
    exactPrivateTargetBound: true,
    targetDisclosed: false,
    targetHostnameDisclosed: false,
    targetPathDisclosed: false,
    targetAddressesDisclosed: false,
    measurementIdDisclosed: false,
    responseBodyOrHeadersDisclosed: false,
    privateProjectionSaltDisclosed: false,
    outcomeRequirementDisclosed: false,
    evidenceRequirementDisclosed: false,
    targetDnsAddressCount,
    measuredTargetMethodClass: "READ_ONLY_HEAD_OR_GET",
    measuredTargetCredentialsPresent: false,
    measuredTargetCustomHeadersPresent: false,
    measuredTargetQueryPresent: false,
    measuredTargetRedirectFollowRequested: false,
    globalpingApiCredentialPresent: false,
    paidCreditsPermitted: false,
    paidCreditsObserved,
    createPostAttemptCount: postAttempts,
    createPostAutomaticRetryCount: 0,
    statusGetCount: statusReadCount,
    externalCreateReceiptObserved: externalReceiptObserved,
    disposition,
    sourceDeclaredResultStatusCounts: finalEvaluation
      ?.sourceDeclaredResultStatusCounts ?? Object.freeze({
        finished: 0, failed: 0, offline: 0, other: 0,
      }),
    sourceDeclaredRequirementMatch:
      finalEvaluation?.sourceDeclaredRequirementMatch ?? false,
    sourceDeclaredObservationOnly: true,
    independentOutcomeTruthEstablished: false,
    legalIndependenceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    commitPermitted: false,
    oneUseEffectLedgerHeadHash: ledgerHeadHash,
    privateRawJournalHeadHash: journal.headHash,
    privateRawJournalRecordCount: journal.sequence,
    privateRawJournalByteCount: journal.byteCount,
    privateRawJournalMode: "0600_FILES_IN_0700_DIRECTORY",
    humanQueueCreated: false,
    internalHumanFallbackPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V1_BOUNDARY,
  };
  return Object.freeze({ ...body, projectionHash: digest(
    "outsider/globalping-http-witness-public-projection/v1", body) });
}

function eventFor(state, eventType, recordedAt, previousEffectEventHash,
  evidence = null) {
  return createDurableOneUseEndpointEffectEventV1({
    ledgerId: state.ledgerId,
    eventType,
    effectIdHash: state.effectIdHash,
    transactionBindingHash: state.transactionBindingHash,
    endpointBindingHash: state.endpointBindingHash,
    adapterInstanceRefHash: state.adapterInstanceRefHash,
    permissionGrantHash: state.permissionGrantHash,
    oneUseNonceHash: state.oneUseNonceHash,
    idempotencyKeyHash: state.idempotencyKeyHash,
    bodyHash: state.plan.measurementRequestHash,
    effectDeadline: state.plan.effectDeadline,
    recordedAt,
    previousEffectEventHash,
    occurrenceNonceHash: digest(
      "outsider/globalping-http-witness-effect-occurrence/v1", {
        planHash: state.plan.planHash, eventType, recordedAt,
      }),
    endpointReceiptHash: eventType === "ENDPOINT_RECEIPT_OBSERVED"
      ? evidence : null,
    terminalEvidenceHash: eventType === "AMBIGUOUS_NO_RETRY_HOLD"
      ? evidence : null,
  });
}

function appendEffect(state, event, initialize = false) {
  const verification = initialize
    ? initializeDurableOneUseEndpointEffectLedgerV1({
      directory: state.paths.ledger, ledgerId: state.ledgerId,
      genesisEvent: event,
    })
    : appendDurableOneUseEndpointEffectLedgerV1({
      directory: state.paths.ledger, ledgerId: state.ledgerId, event,
      expectedLocalHeadHash: state.ledgerVerification.head.headHash,
    });
  state.ledgerVerification = verification;
  state.previousEffectEventHash = event.eventHash;
  return verification;
}

function executionInput(input) {
  exactObject(input, [
    "plan", "privateEpisodeDirectory", "ledgerId",
    "transactionBindingHash", "adapterInstanceRefHash", "permissionGrantHash",
    "oneUseNonceHash", "idempotencyKeyHash",
  ], "EXECUTION_INPUT");
  if (typeof input.privateEpisodeDirectory !== "string"
    || !LEDGER_ID.test(input.ledgerId)) fail("EXECUTION_BINDING_INVALID");
  return {
    plan: assertPlan(input.plan),
    privateEpisodeDirectory: input.privateEpisodeDirectory,
    ledgerId: input.ledgerId,
    transactionBindingHash: hash(input.transactionBindingHash,
      "TRANSACTION_BINDING_HASH"),
    adapterInstanceRefHash: hash(input.adapterInstanceRefHash,
      "ADAPTER_INSTANCE_REF_HASH"),
    permissionGrantHash: hash(input.permissionGrantHash,
      "PERMISSION_GRANT_HASH"),
    oneUseNonceHash: hash(input.oneUseNonceHash, "ONE_USE_NONCE_HASH"),
    idempotencyKeyHash: hash(input.idempotencyKeyHash,
      "IDEMPOTENCY_KEY_HASH"),
  };
}

function executionDependencies(config = {}) {
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    fail("CONFIG_INVALID");
  }
  const clock = config.clock ?? (() => new Date().toISOString());
  const waitImpl = config.waitImpl ?? ((milliseconds, signal) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, milliseconds);
      const abort = () => {
        clearTimeout(timer);
        reject(new Error("aborted"));
      };
      signal.addEventListener("abort", abort, { once: true });
    }));
  const signal = config.signal ?? new AbortController().signal;
  const lookupTargetImpl = config.lookupTargetImpl ?? dnsLookup;
  const postTransport = config.postTransport
    ?? createPinnedPublicHttpsOneUsePostTransportV1({
      timeoutMs: 15_000,
      maximumRequestBytes: 64 * 1024,
      maximumResponseBytes: MAX_API_RESPONSE_BYTES,
    });
  const getTransport = config.getTransport
    ?? createPublicHttpsReadOnlyFetchTransportV1({
      timeoutMs: 15_000,
      maximumResponseBytes: MAX_API_RESPONSE_BYTES,
    });
  if (typeof clock !== "function" || typeof waitImpl !== "function"
    || typeof lookupTargetImpl !== "function" || typeof postTransport !== "function"
    || typeof getTransport !== "function" || signal === null
    || typeof signal !== "object" || typeof signal.addEventListener !== "function") {
    fail("CONFIG_INVALID");
  }
  return { clock, waitImpl, signal, lookupTargetImpl, postTransport,
    getTransport };
}

function rawHttpPayload(url, method, headers, body = null) {
  return Object.freeze({
    url,
    method,
    headers,
    bodyBase64: body === null ? null : Buffer.from(body).toString("base64"),
    bodyLength: body === null ? 0 : Buffer.byteLength(body),
    rawRequestCaptured: true,
    containsCredentials: false,
  });
}

function rawResponsePayload(response) {
  return Object.freeze({
    status: response.status,
    headers: response.headers,
    bodyBase64: response.bytes.toString("base64"),
    bodyLength: response.bytes.length,
    bodyHash: sha256Bytes(response.bytes),
    rawResponseCaptured: true,
  });
}

export async function executeGlobalpingHttpWitnessObservationV1(input = {},
  config = {}) {
  const binding = executionInput(input);
  const dependencies = executionDependencies(config);
  if (dependencies.signal.aborted) fail("ABORTED_BEFORE_START");
  const paths = initializeEpisode(binding.privateEpisodeDirectory);
  const journal = { directory: paths.journal, sequence: 0, headHash: null,
    byteCount: 0 };
  const state = {
    ...binding, paths, journal,
    effectIdHash: digest("outsider/globalping-http-witness-effect/v1", {
      planHash: binding.plan.planHash,
      oneUseNonceHash: binding.oneUseNonceHash,
    }),
    endpointBindingHash: digest(
      "outsider/globalping-public-api-create-endpoint/v1", {
        endpoint: CREATE_URL,
        method: "POST",
        apiRepositoryCommit:
          OUTSIDER_GLOBALPING_HTTP_WITNESS_NODE_V1_SOURCE_PINS
            .apiRepositoryCommit,
      }),
    ledgerVerification: null,
    previousEffectEventHash: null,
  };
  appendJournal(journal, "PRIVATE_PLAN_PREPARED", safeNow(dependencies.clock), {
    plan: binding.plan,
    transactionBindingHash: binding.transactionBindingHash,
    adapterInstanceRefHash: binding.adapterInstanceRefHash,
    permissionGrantHash: binding.permissionGrantHash,
    oneUseNonceHash: binding.oneUseNonceHash,
    idempotencyKeyHash: binding.idempotencyKeyHash,
  });
  const targetAddresses = await preflightPublicTarget(binding.plan,
    dependencies.lookupTargetImpl, dependencies.signal);
  appendJournal(journal, "TARGET_PUBLIC_DNS_PREFLIGHT_OBSERVED",
    safeNow(dependencies.clock), { targetHostname: binding.plan.targetHostname,
      addresses: targetAddresses,
      remoteDnsRebindingCryptographicallyExcluded: false });
  const admitted = eventFor(state, "INTENT_ADMITTED",
    safeNow(dependencies.clock), null);
  appendEffect(state, admitted, true);
  appendJournal(journal, "INTENT_ADMITTED_FSYNCED", admitted.recordedAt, {
    eventHash: admitted.eventHash,
    localLedgerHeadHash: state.ledgerVerification.head.headHash,
  });
  const reserved = eventFor(state, "SUBMIT_RESERVED",
    safeNow(dependencies.clock), admitted.eventHash);
  appendEffect(state, reserved);
  appendJournal(journal, "SUBMIT_RESERVED_FSYNCED", reserved.recordedAt, {
    eventHash: reserved.eventHash,
    localLedgerHeadHash: state.ledgerVerification.head.headHash,
  });
  const requestBytes = Buffer.from(canonicalizeStrict(
    binding.plan.measurementRequest), "utf8");
  const createHeaders = Object.freeze({ Accept: "application/json",
    "Content-Type": "application/json" });
  appendJournal(journal, "CREATE_REQUEST_FSYNCED_BEFORE_POST",
    safeNow(dependencies.clock), rawHttpPayload(CREATE_URL, "POST",
      createHeaders, requestBytes));
  const attempted = eventFor(state, "SUBMIT_ATTEMPTED",
    safeNow(dependencies.clock), reserved.eventHash);
  appendEffect(state, attempted);
  appendJournal(journal, "SUBMIT_ATTEMPTED_FSYNCED_BEFORE_POST",
    attempted.recordedAt, { eventHash: attempted.eventHash,
      localLedgerHeadHash: state.ledgerVerification.head.headHash,
      automaticRetryPermitted: false });

  let createResponse;
  try {
    const raw = await dependencies.postTransport(CREATE_URL, {
      body: requestBytes,
      credentials: "omit",
      headers: createHeaders,
      method: "POST",
      redirect: "error",
      signal: dependencies.signal,
    });
    createResponse = await captureResponse(raw);
  } catch {
    appendJournal(journal, "CREATE_POST_AMBIGUOUS_FAILURE_OBSERVED",
      safeNow(dependencies.clock), {
        postAttemptCount: 1,
        automaticRetryPerformed: false,
        failureDetailProjected: false,
      });
    const evidence = digest(
      "outsider/globalping-create-ambiguous-no-retry-hold/v1", {
        planHash: binding.plan.planHash, journalHeadHash: journal.headHash,
      });
    const terminal = eventFor(state, "AMBIGUOUS_NO_RETRY_HOLD",
      safeNow(dependencies.clock), attempted.eventHash, evidence);
    appendEffect(state, terminal);
    appendJournal(journal, "AMBIGUOUS_NO_RETRY_HOLD_FSYNCED",
      terminal.recordedAt, { eventHash: terminal.eventHash,
        localLedgerHeadHash: state.ledgerVerification.head.headHash });
    return finalizeDurableRun(state, publicProjection({ plan: binding.plan,
      disposition: "CREATE_COMMIT_UNKNOWN_NO_RETRY_HOLD",
      externalReceiptObserved: false, statusReadCount: 0,
      finalEvaluation: null,
      ledgerHeadHash: state.ledgerVerification.head.headHash,
      journal, postAttempts: 1,
      targetDnsAddressCount: targetAddresses.length }));
  }

  appendJournal(journal, "CREATE_RESPONSE_OBSERVED",
    safeNow(dependencies.clock), rawResponsePayload(createResponse));
  const receiptHash = createReceipt(createResponse);
  const receipt = eventFor(state, "ENDPOINT_RECEIPT_OBSERVED",
    safeNow(dependencies.clock), attempted.eventHash, receiptHash);
  appendEffect(state, receipt);
  appendJournal(journal, "ENDPOINT_RECEIPT_FSYNCED", receipt.recordedAt, {
    eventHash: receipt.eventHash,
    endpointReceiptHash: receiptHash,
    localLedgerHeadHash: state.ledgerVerification.head.headHash,
  });
  if (createResponse.status !== 202) {
    return finalizeDurableRun(state, publicProjection({ plan: binding.plan,
      disposition: "CREATE_ENDPOINT_REFUSED_NO_RETRY_HOLD",
      externalReceiptObserved: true, statusReadCount: 0,
      finalEvaluation: null,
      ledgerHeadHash: state.ledgerVerification.head.headHash,
      journal, postAttempts: 1,
      targetDnsAddressCount: targetAddresses.length }));
  }

  if (responseReportsPaidCredits(createResponse)) {
    appendJournal(journal, "PAID_CREDIT_RESPONSE_REFUSED_HOLD",
      safeNow(dependencies.clock), {
        creditsHeaderPresent: true,
        creditsHeaderValueProjected: false,
        measurementIdProjected: false,
        automaticRetryPerformed: false,
        statusGetPerformed: false,
      });
    return finalizeDurableRun(state, publicProjection({ plan: binding.plan,
      disposition: "PAYMENT_POLICY_VIOLATION_NO_RETRY_HOLD",
      externalReceiptObserved: true, statusReadCount: 0,
      finalEvaluation: null,
      ledgerHeadHash: state.ledgerVerification.head.headHash,
      journal, postAttempts: 1,
      targetDnsAddressCount: targetAddresses.length,
      paidCreditsObserved: true }));
  }

  let accepted;
  try { accepted = validateCreateAccepted(createResponse); }
  catch {
    appendJournal(journal, "CREATE_ACCEPTED_RESPONSE_UNUSABLE_HOLD",
      safeNow(dependencies.clock), {
        responseHash: receiptHash,
        measurementIdProjected: false,
        automaticRetryPerformed: false,
      });
    return finalizeDurableRun(state, publicProjection({ plan: binding.plan,
      disposition: "CREATE_ACCEPTED_RESPONSE_UNUSABLE_NO_RETRY_HOLD",
      externalReceiptObserved: true, statusReadCount: 0,
      finalEvaluation: null,
      ledgerHeadHash: state.ledgerVerification.head.headHash,
      journal, postAttempts: 1,
      targetDnsAddressCount: targetAddresses.length }));
  }

  let statusReadCount = 0;
  for (let index = 0; index < MAXIMUM_STATUS_READS; index += 1) {
    if (dependencies.signal.aborted) break;
    appendJournal(journal, "STATUS_GET_REQUEST_FSYNCED",
      safeNow(dependencies.clock), rawHttpPayload(accepted.statusUrl, "GET",
        Object.freeze({ Accept: "application/json" })));
    let response;
    try {
      response = await captureResponse(await dependencies.getTransport(
        accepted.statusUrl, {
          credentials: "omit",
          headers: { Accept: "application/json" },
          method: "GET",
          redirect: "error",
          signal: dependencies.signal,
        }));
    } catch {
      appendJournal(journal, "STATUS_GET_FAILED_HOLD",
        safeNow(dependencies.clock), { statusReadCount,
          automaticPostRetryPerformed: false });
      break;
    }
    statusReadCount += 1;
    appendJournal(journal, "STATUS_GET_RESPONSE_OBSERVED",
      safeNow(dependencies.clock), rawResponsePayload(response));
    if (response.status !== 200) break;
    let measurement;
    try { measurement = parseJson(response.bytes, "STATUS_RESPONSE_JSON_INVALID"); }
    catch { break; }
    if (measurement.id !== accepted.id) break;
    if (measurement.status === "in-progress") {
      if (index + 1 >= MAXIMUM_STATUS_READS) break;
      try {
        await dependencies.waitImpl(POLL_INTERVAL_MS, dependencies.signal);
      } catch { break; }
      continue;
    }
    let finalEvaluation;
    try {
      finalEvaluation = evaluateFinalMeasurement(measurement, binding.plan,
        accepted.id);
    } catch { break; }
    appendJournal(journal, "FINAL_SOURCE_OBSERVATION_EVALUATED",
      safeNow(dependencies.clock), {
        privateMeasurementId: accepted.id,
        sourceDeclaredResultStatusCounts:
          finalEvaluation.sourceDeclaredResultStatusCounts,
        sourceDeclaredRequirementMatch:
          finalEvaluation.sourceDeclaredRequirementMatch,
        independentOutcomeTruthEstablished: false,
      });
    return finalizeDurableRun(state, publicProjection({ plan: binding.plan,
      disposition: finalEvaluation.sourceDeclaredRequirementMatch
        ? "SOURCE_DECLARED_REQUIREMENT_MATCH_HOLD"
        : "SOURCE_DECLARED_REQUIREMENT_NOT_MATCHED_HOLD",
      externalReceiptObserved: true, statusReadCount, finalEvaluation,
      ledgerHeadHash: state.ledgerVerification.head.headHash,
      journal, postAttempts: 1,
      targetDnsAddressCount: targetAddresses.length }));
  }
  appendJournal(journal, "STATUS_RECONCILIATION_INCOMPLETE_HOLD",
    safeNow(dependencies.clock), { statusReadCount,
      maximumStatusReads: MAXIMUM_STATUS_READS,
      createPostRetryPerformed: false });
  return finalizeDurableRun(state, publicProjection({ plan: binding.plan,
    disposition: "STATUS_RECONCILIATION_INCOMPLETE_HOLD",
    externalReceiptObserved: true, statusReadCount,
    finalEvaluation: null,
    ledgerHeadHash: state.ledgerVerification.head.headHash,
    journal, postAttempts: 1,
    targetDnsAddressCount: targetAddresses.length }));
}
