#!/usr/bin/env node

/**
 * NON-EXECUTABLE DRAFT of a local raw-file purge protocol for the fixed GitHub
 * #64056 private acquisition. main() is deliberately hard-disabled before it
 * parses arguments, resolves/stats/reads a path, creates a directory, writes a
 * marker, or unlinks a file. The draft does not establish integrated purge,
 * bounded retention, physical erasure, deletion of other copies, remote
 * deletion, legal/privacy clearance, or independent provenance.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { TextDecoder } from "node:util";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUISITION_FILES,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH,
  parseAutonomousWorkOrderGithubDiscoveryPreflightReview,
} from "../src/outsider-autonomous-work-order-github-discovery-snapshot.js";
import {
  ACQUISITION_ATTEMPT_EXACT_FIELDS,
  ACQUISITION_CAPTURE_MANIFEST_SCHEMA,
  ACQUISITION_CAPTURE_ROW_EXACT_FIELDS,
  ACQUISITION_CONTROL_FLOW_EXACT_FIELDS,
  ACQUISITION_LIFECYCLE_RECEIPT_EXACT_FIELDS,
  ACQUISITION_LIFECYCLE_RECEIPT_SCHEMA,
  ACQUISITION_MANIFEST_EXACT_FIELDS,
  ACQUISITION_PREFLIGHT_BINDING_EXACT_FIELDS,
} from "./acquire-autonomous-work-order-github-discovery-snapshot.mjs";

export const PURGE_INTENT_SCHEMA =
  "outsider/autonomous-work-order-github-discovery-acquisition-purge-intent/v1";
export const PURGE_RECEIPT_SCHEMA =
  "outsider/autonomous-work-order-github-discovery-acquisition-purge-receipt/v1";
export const PURGE_INTENT_FILE = "purge-intent.json";
export const PURGE_RECEIPT_FILE = "purge-receipt.json";

export const PURGE_INTENT_EXACT_FIELDS = Object.freeze([
  "schema", "purgeId", "captureDirectoryId", "attemptId",
  "targetProfileHash", "createdAtOperatorClock",
  "operatorClockIsIndependentTime", "retentionBoundary", "captureBindings",
  "rawDeletionPlan", "preservePolicy", "controlFlowBoundary",
  "truthBoundary",
]);
export const PURGE_RECEIPT_EXACT_FIELDS = Object.freeze([
  "schema", "purgeId", "captureDirectoryId", "attemptId",
  "purgeIntentBinding", "startedAtOperatorClock", "completedAtOperatorClock",
  "operatorClockIsIndependentTime", "terminalState", "deletedRawFiles",
  "preservedFiles", "directoryFsyncAfterEveryUnlink",
  "allPlannedRawFilesAbsentAtCompletion", "controlFlowBoundary",
  "truthBoundary",
]);
export const PURGE_CAPTURE_BINDINGS_EXACT_FIELDS = Object.freeze([
  "captureManifest", "lifecycleReceipt", "preflightReview",
]);
export const PURGE_FILE_BINDING_EXACT_FIELDS = Object.freeze([
  "file", "bytes", "sha256",
]);
export const PURGE_RETENTION_BOUNDARY_EXACT_FIELDS = Object.freeze([
  "retentionUntilPublisherClock", "expiredUnderLocalOperatorClock",
  "purgeRequired",
]);
export const PURGE_RAW_ROW_EXACT_FIELDS = Object.freeze([
  "ordinal", "role", "file", "bytes", "sha256",
]);
export const PURGE_PRESERVE_POLICY_EXACT_FIELDS = Object.freeze([
  "preservedFiles", "manifestAndReceiptsContainRawHashes",
  "rawNarrativeOrIdentifiersCopiedIntoPurgeArtifacts",
  "immutableNoOverwriteIntent",
]);
export const PURGE_INTENT_CONTROL_EXACT_FIELDS = Object.freeze([
  "fullCaptureReplayCompletedBeforeIntentWrite",
  "intentMustBeFsyncedBeforeFirstUnlink", "publisherControlFlowFactOnly",
  "independentDeletionWitness",
]);
export const PURGE_RECEIPT_CONTROL_EXACT_FIELDS = Object.freeze([
  "intentFsyncedBeforeFirstUnlink", "receiptWrittenAfterAllRawAbsenceChecks",
  "publisherControlFlowFactOnly", "independentDeletionWitness",
]);
export const PURGE_INTENT_TRUTH_EXACT_FIELDS = Object.freeze([
  "localFilesystemDeletionIntentOnly", "remoteDeletionEstablished",
  "copiesOutsideCaptureDirectoryDeleted", "physicalErasureEstablished",
  "legalClearanceEstablished", "privacyClearanceEstablished",
  "externalProvenanceEstablished",
  "sameUserParentReplacementResistanceEstablished",
]);
export const PURGE_RECEIPT_TRUTH_EXACT_FIELDS = Object.freeze([
  "localCaptureRawFilesDeleted", "remoteDeletionEstablished",
  "copiesOutsideCaptureDirectoryDeleted", "physicalErasureEstablished",
  "legalClearanceEstablished", "privacyClearanceEstablished",
  "externalProvenanceEstablished",
  "sameUserParentReplacementResistanceEstablished",
]);

const PRIVATE_ROOT_RELATIVE = "artifacts/private-source-captures";
const OPAQUE_SNAPSHOT = /^snapshot_[a-f0-9]{32}$/u;
const ACQUISITION_ATTEMPT_ID = /^acq_[a-f0-9]{32}$/u;
const PURGE_ID = /^purge_[a-f0-9]{32}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const WEAK_ETAG = /^W\/"[A-Fa-f0-9]{64}"$/u;
const NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const DIRECTORY = fsConstants.O_DIRECTORY ?? 0;
const MAX_SMALL_POLICY_BYTES = 128 * 1024;
// This cannot be lifted by an environment variable, marker file, or caller
// option. A reviewed successor must replace the incomplete protocol atomically.
const PURGE_LIFECYCLE_INTEGRATED = false;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

const FILES = AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUISITION_FILES;
const RAW_PLAN = Object.freeze([
  Object.freeze({ ordinal: 1, key: "issueBefore", role: "ISSUE_BEFORE",
    file: FILES.issueBefore,
    pin: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue }),
  Object.freeze({ ordinal: 2, key: "commentsA", role: "COMMENTS_SCAN_A",
    file: FILES.commentsA,
    pin: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments }),
  Object.freeze({ ordinal: 3, key: "issueMid", role: "ISSUE_MID",
    file: FILES.issueMid,
    pin: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue }),
  Object.freeze({ ordinal: 4, key: "commentsB", role: "COMMENTS_SCAN_B",
    file: FILES.commentsB,
    pin: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments }),
  Object.freeze({ ordinal: 5, key: "issueAfter", role: "ISSUE_AFTER",
    file: FILES.issueAfter,
    pin: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue }),
]);
const BASE_FILES = Object.freeze([
  FILES.acquisitionLifecycleReceipt,
  FILES.acquisitionCaptureManifest,
  FILES.preflightReview,
]);
const FRESH_FILES = Object.freeze([...BASE_FILES, ...RAW_PLAN.map((row) => row.file)]
  .sort());
const INTENT_FILES = Object.freeze([...FRESH_FILES, PURGE_INTENT_FILE].sort());
const PURGED_FILES = Object.freeze([...BASE_FILES, PURGE_INTENT_FILE,
  PURGE_RECEIPT_FILE].sort());
const PRESERVED_FILES = Object.freeze([...BASE_FILES, PURGE_INTENT_FILE,
  PURGE_RECEIPT_FILE]);

function purgeError(code, phase = "REJECTED_BEFORE_PURGE_INTENT") {
  const error = new Error(
    `AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_PURGE_${code}`,
  );
  Object.defineProperty(error, "purgeFailurePhase", { value: phase });
  return error;
}

function fail(code, phase = "REJECTED_BEFORE_PURGE_INTENT") {
  throw purgeError(code, phase);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function canonicalIso(milliseconds) {
  return new Date(milliseconds).toISOString();
}

function sortedKeys(value) {
  return Object.keys(value).sort();
}

function sameStrings(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || !sameStrings(sortedKeys(value), [...fields].sort())) fail(code);
  return value;
}

function canonicalTime(value, code) {
  if (typeof value !== "string") fail(code);
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || canonicalIso(milliseconds) !== value) {
    fail(code);
  }
  return milliseconds;
}

function parseCanonical(bytes, maximumBytes, code) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.length > maximumBytes) {
    fail(`${code}_BYTES_INVALID`);
  }
  let text;
  try { text = utf8Decoder.decode(bytes); }
  catch { fail(`${code}_UTF8_INVALID`); }
  if (text.startsWith("\uFEFF")) fail(`${code}_BOM_INVALID`);
  let parsed;
  try { parsed = JSON.parse(text); }
  catch { fail(`${code}_JSON_INVALID`); }
  let replay;
  try { replay = canonicalBytes(parsed); }
  catch { fail(`${code}_CANONICAL_INVALID`); }
  if (!bytes.equals(replay)) fail(`${code}_NOT_CANONICAL`);
  return parsed;
}

function sameNode(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function sameStableStat(left, right) {
  return sameNode(left, right) && left.mode === right.mode
    && left.size === right.size && left.nlink === right.nlink
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function privateDirectory(directory, code) {
  let status;
  try { status = lstatSync(directory); }
  catch { fail(code); }
  if (!status.isDirectory() || status.isSymbolicLink()
    || (status.mode & 0o777) !== 0o700) fail(code);
  return status;
}

function assertDirectory(directory, expected, code, phase) {
  const current = privateDirectory(directory, code);
  if (!sameNode(current, expected)) fail(code, phase);
}

function stablePrivateRead(file, maximumBytes, code) {
  let initial;
  try { initial = lstatSync(file); }
  catch { fail(code); }
  if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1
    || (initial.mode & 0o777) !== 0o600 || initial.size < 2
    || initial.size > maximumBytes) fail(code);
  let descriptor;
  try {
    descriptor = openSync(file, fsConstants.O_RDONLY | NOFOLLOW);
    const before = fstatSync(descriptor);
    if (!sameStableStat(initial, before)) fail(`${code}_CHANGED`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const finalPath = lstatSync(file);
    if (!sameStableStat(before, after) || !sameStableStat(after, finalPath)
      || bytes.length !== after.size) fail(`${code}_CHANGED`);
    return Object.freeze({ bytes, stat: after });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, fsConstants.O_RDONLY | DIRECTORY | NOFOLLOW);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function durableWritePrivate(directory, directoryStat, file, bytes, phase) {
  assertDirectory(directory, directoryStat, "CAPTURE_DIRECTORY_CHANGED", phase);
  const destination = path.join(directory, file);
  let descriptor;
  try {
    descriptor = openSync(destination,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | NOFOLLOW,
      0o600);
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    const status = fstatSync(descriptor);
    if (!status.isFile() || status.nlink !== 1
      || (status.mode & 0o777) !== 0o600 || status.size !== bytes.length) {
      fail("PURGE_ARTIFACT_WRITE_INVALID", phase);
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const replay = stablePrivateRead(destination, MAX_SMALL_POLICY_BYTES,
    "PURGE_ARTIFACT_REPLAY_INVALID");
  if (!replay.bytes.equals(bytes)) fail("PURGE_ARTIFACT_REPLAY_INVALID", phase);
  fsyncDirectory(directory);
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== 4
    || argv.some((value) => typeof value !== "string" || value.length === 0
      || value.includes("\0"))) fail("ARGUMENTS_INVALID");
  if (!HASH.test(argv[1]) || !HASH.test(argv[2]) || !HASH.test(argv[3])) {
    fail("CALLER_PINS_INVALID");
  }
  return Object.freeze({ directory: argv[0], manifestSha256: argv[1],
    lifecycleSha256: argv[2], preflightSha256: argv[3] });
}

function resolveCaptureDirectory(workspace, argument) {
  const trustedRoot = path.resolve(workspace, PRIVATE_ROOT_RELATIVE);
  const directory = path.resolve(workspace, argument);
  if (path.dirname(directory) !== trustedRoot
    || !OPAQUE_SNAPSHOT.test(path.basename(directory))) {
    fail("CAPTURE_DIRECTORY_OUTSIDE_FIXED_PRIVATE_ROOT");
  }
  let ignoreText;
  try { ignoreText = readFileSync(path.join(workspace, ".gitignore"), "utf8"); }
  catch { fail("GITIGNORE_UNREADABLE"); }
  const ignoreLines = ignoreText.split(/\r?\n/u).map((line) => line.trim());
  if (!ignoreLines.includes("artifacts/")
    || ignoreLines.some((line) => line.startsWith("!artifacts"))) {
    fail("PRIVATE_ROOT_NOT_DURABLY_IGNORED");
  }
  const rootStat = privateDirectory(trustedRoot, "PRIVATE_ROOT_UNSAFE");
  const requestedStat = privateDirectory(directory, "CAPTURE_DIRECTORY_UNSAFE");
  let resolved;
  try { resolved = realpathSync(directory); }
  catch { fail("CAPTURE_DIRECTORY_UNSAFE"); }
  if (resolved !== directory) fail("CAPTURE_DIRECTORY_ALIAS_INVALID");
  const directoryStat = privateDirectory(resolved, "CAPTURE_DIRECTORY_UNSAFE");
  if (!sameNode(requestedStat, directoryStat)) fail("CAPTURE_DIRECTORY_UNSAFE");
  return Object.freeze({ trustedRoot, rootStat, directory: resolved,
    directoryStat, captureDirectoryId: path.basename(resolved) });
}

function readFileSet(paths) {
  assertDirectory(paths.trustedRoot, paths.rootStat, "PRIVATE_ROOT_CHANGED",
    "REJECTED_BEFORE_PURGE_INTENT");
  assertDirectory(paths.directory, paths.directoryStat,
    "CAPTURE_DIRECTORY_CHANGED", "REJECTED_BEFORE_PURGE_INTENT");
  return readdirSync(paths.directory).sort();
}

function readPreserved(paths, pins, phase) {
  const lifecycle = stablePrivateRead(path.join(paths.directory,
    FILES.acquisitionLifecycleReceipt), 32 * 1024, "LIFECYCLE_FILE_UNSAFE");
  const manifest = stablePrivateRead(path.join(paths.directory,
    FILES.acquisitionCaptureManifest), 128 * 1024, "MANIFEST_FILE_UNSAFE");
  const preflight = stablePrivateRead(path.join(paths.directory,
    FILES.preflightReview), 32 * 1024, "PREFLIGHT_FILE_UNSAFE");
  if (sha256(manifest.bytes) !== pins.manifestSha256
    || sha256(lifecycle.bytes) !== pins.lifecycleSha256
    || sha256(preflight.bytes) !== pins.preflightSha256) {
    fail("CALLER_PIN_MISMATCH", phase);
  }
  return Object.freeze({ lifecycle, manifest, preflight });
}

function validateLifecycle(bytes, preflight, preflightBytes) {
  const value = exactObject(parseCanonical(bytes, 32 * 1024, "LIFECYCLE"),
    ACQUISITION_LIFECYCLE_RECEIPT_EXACT_FIELDS, "LIFECYCLE_FIELDS_INVALID");
  const startedAtMs = canonicalTime(value.startedAtPublisherClock,
    "LIFECYCLE_START_INVALID");
  const retentionUntilMs = canonicalTime(value.retentionUntilPublisherClock,
    "LIFECYCLE_RETENTION_INVALID");
  const reviewedAtMs = canonicalTime(preflight.operatorReviewOccurrence.reviewedAt,
    "PREFLIGHT_REVIEWED_AT_INVALID");
  const validThroughMs = canonicalTime(
    preflight.operatorReviewOccurrence.validThrough,
    "PREFLIGHT_VALID_THROUGH_INVALID",
  );
  if (value.schema !== ACQUISITION_LIFECYCLE_RECEIPT_SCHEMA
    || !ACQUISITION_ATTEMPT_ID.test(value.attemptId)
    || value.attemptId === "acq_00000000000000000000000000000000"
    || value.state !== "INCOMPLETE"
    || value.preflightReviewHash !== preflight.reviewHash
    || value.preflightReviewFileSha256 !== sha256(preflightBytes)
    || value.targetProfileHash
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH
    || value.transportClass !== "NODE_HTTPS_FIXED_PUBLIC_API"
    || value.publisherClockIsIndependentTime !== false
    || value.retentionSeconds !== preflight.acquisitionScope.retentionSeconds
    || retentionUntilMs !== startedAtMs + value.retentionSeconds * 1000
    || startedAtMs < reviewedAtMs || startedAtMs > validThroughMs
    || value.purgeRequired !== true
    || value.manifestLastRequiredForTerminalInterpretation !== true
    || value.wholeDirectoryAtomicPublicationEstablished !== false
    || value.independentOccurrenceWitness !== false
    || value.externalProvenanceEstablished !== false) {
    fail("LIFECYCLE_REPLAY_INVALID");
  }
  return Object.freeze({ value, startedAtMs, retentionUntilMs, reviewedAtMs,
    validThroughMs });
}

function validateMeta(meta, plan, preflight) {
  const fields = ["captureOrdinal", "requestMethod", "requestUrl",
    "authVisibilityProfile", "credentialsSent", "redirectCount",
    "requestAccept", "requestAcceptEncoding", "requestedApiVersion",
    "responseStatus", "selectedApiVersion", "etag", "lastModified",
    "responseDate", "contentType", "contentEncoding", "link", "requestId"];
  exactObject(meta, fields, `META_FIELDS_INVALID_${plan.role}`);
  const responseDateMs = Date.parse(meta.responseDate);
  if (meta.captureOrdinal !== plan.ordinal || meta.requestMethod !== "GET"
    || meta.requestUrl !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE
      .requestPlan[plan.ordinal - 1].requestUrl
    || meta.authVisibilityProfile !== "PUBLIC_ANONYMOUS_NO_CREDENTIALS"
    || meta.credentialsSent !== false || meta.redirectCount !== 0
    || meta.requestAccept !== "application/vnd.github+json"
    || meta.requestAcceptEncoding !== "identity"
    || meta.requestedApiVersion !== "2026-03-10"
    || meta.responseStatus !== 200 || meta.selectedApiVersion !== "2026-03-10"
    || !WEAK_ETAG.test(meta.etag)
    || meta.lastModified !== null && !Number.isFinite(Date.parse(meta.lastModified))
    || !Number.isFinite(responseDateMs)
    || responseDateMs < Date.parse(preflight.operatorReviewOccurrence.reviewedAt)
    || responseDateMs > Date.parse(preflight.operatorReviewOccurrence.validThrough)
    || meta.contentType !== "application/json; charset=utf-8"
    || meta.contentEncoding !== null && meta.contentEncoding !== "identity"
    || meta.link !== null || typeof meta.requestId !== "string"
    || meta.requestId.length < 8 || meta.requestId.length > 256
    || /[\r\n]/u.test(meta.requestId)) fail(`META_REPLAY_INVALID_${plan.role}`);
  return responseDateMs;
}

function validateTransport(transport, requestUrl, role) {
  exactObject(transport, ["requestUrl", "finalUrl", "redirected",
    "transportClass", "tlsRejectUnauthorized", "tlsServername",
    "requestAbsoluteDeadlineMs", "bracketAbsoluteDeadlineMs"],
  `TRANSPORT_FIELDS_INVALID_${role}`);
  if (transport.requestUrl !== requestUrl || transport.finalUrl !== requestUrl
    || transport.redirected !== false
    || transport.transportClass !== "NODE_HTTPS_FIXED_PUBLIC_API"
    || transport.tlsRejectUnauthorized !== true
    || transport.tlsServername !== "api.github.com"
    || transport.requestAbsoluteDeadlineMs !== 30_000
    || transport.bracketAbsoluteDeadlineMs !== 180_000) {
    fail(`TRANSPORT_REPLAY_INVALID_${role}`);
  }
}

function validateManifest(bytes, lifecycle, lifecycleBytes, preflight,
  preflightBytes, rawFiles) {
  const manifest = exactObject(parseCanonical(bytes, 128 * 1024, "MANIFEST"),
    ACQUISITION_MANIFEST_EXACT_FIELDS, "MANIFEST_FIELDS_INVALID");
  if (manifest.schema !== ACQUISITION_CAPTURE_MANIFEST_SCHEMA
    || manifest.transportClass !== "NODE_HTTPS_FIXED_PUBLIC_API") {
    fail("MANIFEST_BOUNDARY_INVALID");
  }
  const attempt = exactObject(manifest.acquisitionAttempt,
    ACQUISITION_ATTEMPT_EXACT_FIELDS, "MANIFEST_ATTEMPT_FIELDS_INVALID");
  const completedAtMs = canonicalTime(attempt.completedAtPublisherClock,
    "MANIFEST_COMPLETION_INVALID");
  if (attempt.attemptId !== lifecycle.value.attemptId
    || attempt.startedAtPublisherClock !== lifecycle.value.startedAtPublisherClock
    || attempt.publisherClockIsIndependentTime !== false
    || attempt.terminalState !== "COMPLETE"
    || attempt.initialLifecycleReceiptFile !== FILES.acquisitionLifecycleReceipt
    || attempt.initialLifecycleReceiptBytes !== lifecycleBytes.length
    || attempt.initialLifecycleReceiptSha256 !== sha256(lifecycleBytes)
    || attempt.retentionSeconds !== lifecycle.value.retentionSeconds
    || attempt.retentionUntilPublisherClock
      !== lifecycle.value.retentionUntilPublisherClock
    || attempt.purgeRequired !== true
    || attempt.manifestLastRequiredForTerminalInterpretation !== true
    || attempt.wholeDirectoryAtomicPublicationEstablished !== false
    || completedAtMs < lifecycle.startedAtMs
    || completedAtMs > lifecycle.retentionUntilMs
    || completedAtMs > lifecycle.validThroughMs) {
    fail("MANIFEST_ATTEMPT_INVALID");
  }
  const binding = exactObject(manifest.preflightReviewBinding,
    ACQUISITION_PREFLIGHT_BINDING_EXACT_FIELDS,
    "MANIFEST_PREFLIGHT_BINDING_FIELDS_INVALID");
  if (binding.file !== FILES.preflightReview || binding.bytes !== preflightBytes.length
    || binding.sha256 !== sha256(preflightBytes)
    || binding.reviewHash !== preflight.reviewHash
    || binding.targetProfileHash
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH
    || binding.reviewValidatedBeforeDirectoryCreation !== true
    || binding.reviewValidatedBeforeFirstNetworkRequest !== true
    || binding.captureStartedAfterReview !== true
    || binding.localPolicyWindowSatisfiedAtStart !== true
    || binding.publisherControlFlowFactOnly !== true
    || binding.independentReviewTimingWitness !== false) {
    fail("MANIFEST_PREFLIGHT_BINDING_INVALID");
  }
  const control = exactObject(manifest.controlFlowBoundary,
    ACQUISITION_CONTROL_FLOW_EXACT_FIELDS, "MANIFEST_CONTROL_FIELDS_INVALID");
  if (control.preflightValidatedBeforePrivateDirectoryCreation !== true
    || control.preflightValidatedBeforeFirstNetworkRequest !== true
    || control.fixedSequenceExecutedByPublisherControlFlow !== true
    || control.finalDirectoryReservedByAtomicMkdirNoClobber !== true
    || control.sameUserParentReplacementResistanceEstablished !== false
    || control.independentOccurrenceWitness !== false
    || control.publisherControlFlowFactOnly !== true) fail("MANIFEST_CONTROL_INVALID");
  const requestPolicy = exactObject(manifest.requestPolicy,
    ["accept", "acceptEncoding", "apiOrigin", "authVisibilityProfile",
      "authenticationReadOrSent", "cookiesReadOrSent",
      "contactOrMutationSideEffect", "exactGetCount", "redirectFollowing",
      "retries", "requestedApiVersion", "tlsRejectUnauthorized",
      "tlsServername", "requestAbsoluteDeadlineMs", "bracketAbsoluteDeadlineMs"],
    "MANIFEST_REQUEST_POLICY_FIELDS_INVALID");
  if (requestPolicy.accept !== "application/vnd.github+json"
    || requestPolicy.acceptEncoding !== "identity"
    || requestPolicy.apiOrigin !== "https://api.github.com"
    || requestPolicy.authVisibilityProfile
      !== "PUBLIC_ANONYMOUS_NO_CREDENTIALS"
    || requestPolicy.authenticationReadOrSent !== false
    || requestPolicy.cookiesReadOrSent !== false
    || requestPolicy.contactOrMutationSideEffect !== false
    || requestPolicy.exactGetCount !== 5
    || requestPolicy.redirectFollowing !== false || requestPolicy.retries !== 0
    || requestPolicy.requestedApiVersion !== "2026-03-10"
    || requestPolicy.tlsRejectUnauthorized !== true
    || requestPolicy.tlsServername !== "api.github.com"
    || requestPolicy.requestAbsoluteDeadlineMs !== 30_000
    || requestPolicy.bracketAbsoluteDeadlineMs !== 180_000) {
    fail("MANIFEST_REQUEST_POLICY_INVALID");
  }
  const invariants = exactObject(manifest.invariants,
    ["issueByteLengthPin", "issueSha256Pin", "commentsByteLengthPin",
      "commentsSha256Pin", "issueBeforeMidAfterRawExact",
      "issueBeforeMidAfterSemanticExact", "commentsScanAAndBRawExact",
      "commentsScanAAndBSemanticExact", "fiveRequestIdsDistinct",
      "responseDatesMonotonic", "linkHeaderNullOnEveryCapture"],
    "MANIFEST_INVARIANTS_FIELDS_INVALID");
  if (invariants.issueByteLengthPin !== 10_175
    || invariants.issueSha256Pin
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.sha256
    || invariants.commentsByteLengthPin !== 16_132
    || invariants.commentsSha256Pin
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments.sha256
    || invariants.issueBeforeMidAfterRawExact !== true
    || invariants.issueBeforeMidAfterSemanticExact !== true
    || invariants.commentsScanAAndBRawExact !== true
    || invariants.commentsScanAAndBSemanticExact !== true
    || invariants.fiveRequestIdsDistinct !== true
    || invariants.responseDatesMonotonic !== true
    || invariants.linkHeaderNullOnEveryCapture !== true) {
    fail("MANIFEST_INVARIANTS_INVALID");
  }
  const semantics = exactObject(manifest.semantics,
    ["commentsPage", "commentsPerPage", "commentsPageTerminalAtCapture",
      "issueDeclaredCommentCount", "visibleCommentsCaptured",
      "uniqueVisibleCommentIds", "fullEditOrDeletionHistoryEstablished"],
    "MANIFEST_SEMANTICS_FIELDS_INVALID");
  if (semantics.commentsPage !== 1 || semantics.commentsPerPage !== 100
    || semantics.commentsPageTerminalAtCapture !== true
    || semantics.issueDeclaredCommentCount !== 6
    || semantics.visibleCommentsCaptured !== 6
    || semantics.uniqueVisibleCommentIds !== 6
    || semantics.fullEditOrDeletionHistoryEstablished !== false) {
    fail("MANIFEST_SEMANTICS_INVALID");
  }
  const source = exactObject(manifest.source,
    ["sourceClass", "repository", "issueApiUrl", "commentsApiUrl",
      "mutablePublicApi", "revisionPinned", "contentHashPinned"],
    "MANIFEST_SOURCE_FIELDS_INVALID");
  if (source.sourceClass !== "PROVIDER_HOSTED_USER_GENERATED_MUTABLE_SNAPSHOT"
    || source.repository !== "anthropics/claude-code"
    || source.issueApiUrl
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE.candidateTarget
        .issueRequestUrl
    || source.commentsApiUrl
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE.candidateTarget
        .commentsRequestUrl
    || source.mutablePublicApi !== true || source.revisionPinned !== false
    || source.contentHashPinned !== true) fail("MANIFEST_SOURCE_INVALID");
  if (!Array.isArray(manifest.captureSequence)
    || manifest.captureSequence.length !== RAW_PLAN.length) {
    fail("MANIFEST_CAPTURE_SEQUENCE_INVALID");
  }
  let priorResponseDate = -Infinity;
  const requestIds = new Set();
  const rows = [];
  for (let index = 0; index < RAW_PLAN.length; index += 1) {
    const plan = RAW_PLAN[index];
    const row = exactObject(manifest.captureSequence[index],
      ACQUISITION_CAPTURE_ROW_EXACT_FIELDS,
      `MANIFEST_CAPTURE_ROW_FIELDS_INVALID_${plan.role}`);
    exactObject(row.body, ["byteLength", "sha256"],
      `MANIFEST_BODY_FIELDS_INVALID_${plan.role}`);
    if (row.role !== plan.role || row.file !== plan.file
      || row.body.byteLength !== rawFiles[index].bytes.length
      || row.body.sha256 !== sha256(rawFiles[index].bytes)
      || row.acquiredAtIsIndependentTime !== false) {
      fail(`MANIFEST_CAPTURE_ROW_INVALID_${plan.role}`);
    }
    const acquiredAtMs = canonicalTime(row.acquiredAtPublisherClock,
      `MANIFEST_ACQUIRED_AT_INVALID_${plan.role}`);
    if (acquiredAtMs < lifecycle.startedAtMs || acquiredAtMs > completedAtMs) {
      fail(`MANIFEST_ACQUIRED_AT_RANGE_INVALID_${plan.role}`);
    }
    const responseDateMs = validateMeta(row.meta, plan, preflight);
    validateTransport(row.transport, row.meta.requestUrl, plan.role);
    if (responseDateMs < priorResponseDate || requestIds.has(row.meta.requestId)) {
      fail("MANIFEST_REQUEST_ORDER_INVALID");
    }
    priorResponseDate = responseDateMs;
    requestIds.add(row.meta.requestId);
    rows[index] = row;
  }
  if (rows[0].meta.etag !== rows[2].meta.etag
    || rows[0].meta.etag !== rows[4].meta.etag
    || rows[1].meta.etag !== rows[3].meta.etag) fail("MANIFEST_ETAG_DRIFT");
  exactObject(manifest.sourceEntry,
    ["bound", "disposition", "eligibleForPrivateStructuralReplay"],
    "MANIFEST_SOURCE_ENTRY_FIELDS_INVALID");
  if (manifest.sourceEntry.bound !== false
    || manifest.sourceEntry.disposition !== "PENDING_ACQUISITION"
    || manifest.sourceEntry.eligibleForPrivateStructuralReplay !== true) {
    fail("MANIFEST_SOURCE_ENTRY_INVALID");
  }
  const truth = exactObject(manifest.truthBoundary,
    ["localAcquisitionAttemptOnly", "externalHttpOccurrenceCountEstablished",
      "externalProvenanceEstablished", "independentOccurrenceWitnessEstablished",
      "serverDatesRequestIdsEtagsOrTlsMetadataAreIndependentProvenance",
      "officialIncidentSource", "directParticipantConfirmation",
      "externalOutcomeTruth", "recoveryTruth", "completeAttemptCensusEstablished",
      "currentSnapshotProvesHistoricalCompleteness", "reviewerIdentityVerified",
      "reviewerAuthorityEstablished", "reviewSignatureVerified",
      "reviewBasisReplayed", "reviewTimeIsIndependent",
      "legalClearanceEstablished", "redistributionPermissionEstablished",
      "publicationPermissionEstablished", "trainingPermissionEstablished",
      "networkProjectionEmitted", "networkAdmissionRows", "authorityUnits",
      "actionUnits", "CEU", "pricingUnits", "guaranteeUnits",
      "settlementUnits", "trustedVerification", "decisionState"],
    "MANIFEST_TRUTH_FIELDS_INVALID");
  if (truth.localAcquisitionAttemptOnly !== true
    || truth.externalHttpOccurrenceCountEstablished !== 0
    || truth.externalProvenanceEstablished !== false
    || truth.independentOccurrenceWitnessEstablished !== false
    || truth.serverDatesRequestIdsEtagsOrTlsMetadataAreIndependentProvenance
      !== false
    || truth.officialIncidentSource !== false
    || truth.directParticipantConfirmation !== false
    || truth.externalOutcomeTruth !== false || truth.recoveryTruth !== false
    || truth.completeAttemptCensusEstablished !== false
    || truth.currentSnapshotProvesHistoricalCompleteness !== false
    || truth.reviewerIdentityVerified !== false
    || truth.reviewerAuthorityEstablished !== false
    || truth.reviewSignatureVerified !== false
    || truth.reviewBasisReplayed !== false
    || truth.reviewTimeIsIndependent !== false
    || truth.legalClearanceEstablished !== false
    || truth.redistributionPermissionEstablished !== false
    || truth.publicationPermissionEstablished !== false
    || truth.trainingPermissionEstablished !== false
    || truth.networkProjectionEmitted !== false
    || truth.networkAdmissionRows !== 0 || truth.authorityUnits !== 0
    || truth.actionUnits !== 0 || truth.CEU !== 0
    || truth.pricingUnits !== 0 || truth.guaranteeUnits !== 0
    || truth.settlementUnits !== 0
    || truth.trustedVerification !== "NOT_INTEGRATED"
    || truth.decisionState !== "HOLD") {
    fail("MANIFEST_TRUTH_BOUNDARY_INVALID");
  }
  return Object.freeze({ manifest, rows, completedAtMs });
}

function parseRaw(bytes, role) {
  let text;
  try { text = utf8Decoder.decode(bytes); }
  catch { fail(`RAW_UTF8_INVALID_${role}`); }
  let value;
  try { value = JSON.parse(text); }
  catch { fail(`RAW_JSON_INVALID_${role}`); }
  return value;
}

function validateRawSemantics(rawFiles) {
  for (let index = 0; index < RAW_PLAN.length; index += 1) {
    if (rawFiles[index].bytes.length !== RAW_PLAN[index].pin.bytes
      || sha256(rawFiles[index].bytes) !== RAW_PLAN[index].pin.sha256) {
      fail(`RAW_PIN_MISMATCH_${RAW_PLAN[index].role}`);
    }
  }
  if (!rawFiles[0].bytes.equals(rawFiles[2].bytes)
    || !rawFiles[0].bytes.equals(rawFiles[4].bytes)
    || !rawFiles[1].bytes.equals(rawFiles[3].bytes)) fail("RAW_BRACKET_DRIFT");
  const issueUrl = AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE
    .candidateTarget.issueRequestUrl;
  for (const index of [0, 2, 4]) {
    const issue = parseRaw(rawFiles[index].bytes, RAW_PLAN[index].role);
    if (issue === null || typeof issue !== "object" || Array.isArray(issue)
      || issue.url !== issueUrl || issue.number !== 64_056 || issue.comments !== 6
      || issue.comments_url !== `${issueUrl}/comments`
      || issue.repository_url
        !== "https://api.github.com/repos/anthropics/claude-code"
      || issue.html_url
        !== "https://github.com/anthropics/claude-code/issues/64056"
      || Object.hasOwn(issue, "pull_request")) {
      fail(`RAW_ISSUE_SEMANTIC_DRIFT_${RAW_PLAN[index].role}`);
    }
  }
  let firstIds = null;
  for (const index of [1, 3]) {
    const comments = parseRaw(rawFiles[index].bytes, RAW_PLAN[index].role);
    if (!Array.isArray(comments) || comments.length !== 6) {
      fail(`RAW_COMMENTS_COUNT_DRIFT_${RAW_PLAN[index].role}`);
    }
    const ids = [];
    const unique = new Set();
    for (const comment of comments) {
      if (comment === null || typeof comment !== "object" || Array.isArray(comment)
        || !Number.isSafeInteger(comment.id) || comment.id < 1
        || unique.has(comment.id) || comment.issue_url !== issueUrl
        || typeof comment.node_id !== "string" || comment.node_id.length === 0) {
        fail(`RAW_COMMENT_SEMANTIC_DRIFT_${RAW_PLAN[index].role}`);
      }
      unique.add(comment.id);
      ids[ids.length] = String(comment.id);
    }
    if (firstIds !== null && !sameStrings(firstIds, ids)) {
      fail("RAW_COMMENT_ID_DRIFT");
    }
    firstIds = ids;
  }
}

function fullReplayFresh(paths, pins) {
  const names = readFileSet(paths);
  if (!sameStrings(names, FRESH_FILES)) fail("FRESH_FILE_SET_INVALID");
  const preserved = readPreserved(paths, pins, "REJECTED_BEFORE_PURGE_INTENT");
  let preflight;
  try {
    preflight = parseAutonomousWorkOrderGithubDiscoveryPreflightReview(
      preserved.preflight.bytes,
    );
  } catch { fail("PREFLIGHT_REPLAY_INVALID"); }
  const lifecycle = validateLifecycle(preserved.lifecycle.bytes, preflight,
    preserved.preflight.bytes);
  const rawFiles = [];
  for (let index = 0; index < RAW_PLAN.length; index += 1) {
    rawFiles[index] = stablePrivateRead(path.join(paths.directory,
      RAW_PLAN[index].file), RAW_PLAN[index].pin.bytes, "RAW_FILE_UNSAFE");
  }
  validateRawSemantics(rawFiles);
  const manifest = validateManifest(preserved.manifest.bytes, lifecycle,
    preserved.lifecycle.bytes, preflight, preserved.preflight.bytes, rawFiles);
  let newestPreManifestMtimeMs = Math.max(
    preserved.lifecycle.stat.mtimeMs,
    preserved.preflight.stat.mtimeMs,
  );
  for (const rawFile of rawFiles) {
    newestPreManifestMtimeMs = Math.max(newestPreManifestMtimeMs,
      rawFile.stat.mtimeMs);
  }
  if (preserved.manifest.stat.mtimeMs < newestPreManifestMtimeMs) {
    fail("MANIFEST_NOT_WRITTEN_LAST");
  }
  for (const file of [...Object.values(preserved), ...rawFiles]) {
    const current = lstatSync(path.join(paths.directory,
      file === preserved.lifecycle ? FILES.acquisitionLifecycleReceipt
        : file === preserved.manifest ? FILES.acquisitionCaptureManifest
          : file === preserved.preflight ? FILES.preflightReview
            : RAW_PLAN[rawFiles.indexOf(file)].file));
    if (!sameStableStat(file.stat, current)) fail("CAPTURE_CHANGED_DURING_REPLAY");
  }
  if (!sameStrings(readFileSet(paths), FRESH_FILES)) {
    fail("CAPTURE_CHANGED_DURING_REPLAY");
  }
  assertDirectory(paths.directory, paths.directoryStat,
    "CAPTURE_DIRECTORY_CHANGED", "REJECTED_BEFORE_PURGE_INTENT");
  return Object.freeze({ preserved, preflight, lifecycle, rawFiles,
    manifest: manifest.manifest });
}

function buildRawPlan(rawFiles) {
  return RAW_PLAN.map((plan, index) => ({ ordinal: plan.ordinal, role: plan.role,
    file: plan.file, bytes: rawFiles[index].bytes.length,
    sha256: sha256(rawFiles[index].bytes) }));
}

function buildIntent(paths, replay, createdAtMs, purgeId) {
  return {
    schema: PURGE_INTENT_SCHEMA,
    purgeId,
    captureDirectoryId: paths.captureDirectoryId,
    attemptId: replay.lifecycle.value.attemptId,
    targetProfileHash: AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH,
    createdAtOperatorClock: canonicalIso(createdAtMs),
    operatorClockIsIndependentTime: false,
    retentionBoundary: {
      retentionUntilPublisherClock:
        replay.lifecycle.value.retentionUntilPublisherClock,
      expiredUnderLocalOperatorClock: true,
      purgeRequired: true,
    },
    captureBindings: {
      captureManifest: { file: FILES.acquisitionCaptureManifest,
        bytes: replay.preserved.manifest.bytes.length,
        sha256: sha256(replay.preserved.manifest.bytes) },
      lifecycleReceipt: { file: FILES.acquisitionLifecycleReceipt,
        bytes: replay.preserved.lifecycle.bytes.length,
        sha256: sha256(replay.preserved.lifecycle.bytes) },
      preflightReview: { file: FILES.preflightReview,
        bytes: replay.preserved.preflight.bytes.length,
        sha256: sha256(replay.preserved.preflight.bytes) },
    },
    rawDeletionPlan: buildRawPlan(replay.rawFiles),
    preservePolicy: {
      preservedFiles: [...PRESERVED_FILES],
      manifestAndReceiptsContainRawHashes: true,
      rawNarrativeOrIdentifiersCopiedIntoPurgeArtifacts: false,
      immutableNoOverwriteIntent: true,
    },
    controlFlowBoundary: {
      fullCaptureReplayCompletedBeforeIntentWrite: true,
      intentMustBeFsyncedBeforeFirstUnlink: true,
      publisherControlFlowFactOnly: true,
      independentDeletionWitness: false,
    },
    truthBoundary: {
      localFilesystemDeletionIntentOnly: true,
      remoteDeletionEstablished: false,
      copiesOutsideCaptureDirectoryDeleted: false,
      physicalErasureEstablished: false,
      legalClearanceEstablished: false,
      privacyClearanceEstablished: false,
      externalProvenanceEstablished: false,
      sameUserParentReplacementResistanceEstablished: false,
    },
  };
}

function validateBinding(binding, file, bytes, expectedHash, code) {
  exactObject(binding, PURGE_FILE_BINDING_EXACT_FIELDS, `${code}_FIELDS_INVALID`);
  if (binding.file !== file || binding.bytes !== bytes.length
    || binding.sha256 !== expectedHash || sha256(bytes) !== expectedHash) fail(code);
}

function validateIntent(bytes, paths, preserved, pins) {
  const intent = exactObject(parseCanonical(bytes, MAX_SMALL_POLICY_BYTES,
    "PURGE_INTENT"), PURGE_INTENT_EXACT_FIELDS, "PURGE_INTENT_FIELDS_INVALID");
  if (intent.schema !== PURGE_INTENT_SCHEMA || !PURGE_ID.test(intent.purgeId)
    || intent.purgeId === "purge_00000000000000000000000000000000"
    || intent.captureDirectoryId !== paths.captureDirectoryId
    || !ACQUISITION_ATTEMPT_ID.test(intent.attemptId)
    || intent.targetProfileHash
      !== AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH
    || intent.operatorClockIsIndependentTime !== false) fail("PURGE_INTENT_INVALID");
  const createdAtMs = canonicalTime(intent.createdAtOperatorClock,
    "PURGE_INTENT_TIME_INVALID");
  exactObject(intent.captureBindings, PURGE_CAPTURE_BINDINGS_EXACT_FIELDS,
    "PURGE_INTENT_CAPTURE_BINDINGS_FIELDS_INVALID");
  validateBinding(intent.captureBindings.captureManifest,
    FILES.acquisitionCaptureManifest, preserved.manifest.bytes,
    pins.manifestSha256, "PURGE_INTENT_MANIFEST_BINDING_INVALID");
  validateBinding(intent.captureBindings.lifecycleReceipt,
    FILES.acquisitionLifecycleReceipt, preserved.lifecycle.bytes,
    pins.lifecycleSha256, "PURGE_INTENT_LIFECYCLE_BINDING_INVALID");
  validateBinding(intent.captureBindings.preflightReview,
    FILES.preflightReview, preserved.preflight.bytes,
    pins.preflightSha256, "PURGE_INTENT_PREFLIGHT_BINDING_INVALID");
  exactObject(intent.retentionBoundary, PURGE_RETENTION_BOUNDARY_EXACT_FIELDS,
    "PURGE_INTENT_RETENTION_FIELDS_INVALID");
  const retentionUntilMs = canonicalTime(
    intent.retentionBoundary.retentionUntilPublisherClock,
    "PURGE_INTENT_RETENTION_TIME_INVALID");
  if (createdAtMs < retentionUntilMs
    || intent.retentionBoundary.expiredUnderLocalOperatorClock !== true
    || intent.retentionBoundary.purgeRequired !== true) {
    fail("PURGE_INTENT_RETENTION_INVALID");
  }
  if (!Array.isArray(intent.rawDeletionPlan)
    || intent.rawDeletionPlan.length !== RAW_PLAN.length) {
    fail("PURGE_INTENT_RAW_PLAN_INVALID");
  }
  for (let index = 0; index < RAW_PLAN.length; index += 1) {
    const row = exactObject(intent.rawDeletionPlan[index],
      PURGE_RAW_ROW_EXACT_FIELDS,
      "PURGE_INTENT_RAW_ROW_FIELDS_INVALID");
    const plan = RAW_PLAN[index];
    if (row.ordinal !== plan.ordinal || row.role !== plan.role
      || row.file !== plan.file || row.bytes !== plan.pin.bytes
      || row.sha256 !== plan.pin.sha256) fail("PURGE_INTENT_RAW_ROW_INVALID");
  }
  exactObject(intent.preservePolicy, PURGE_PRESERVE_POLICY_EXACT_FIELDS,
    "PURGE_INTENT_PRESERVE_FIELDS_INVALID");
  if (!Array.isArray(intent.preservePolicy.preservedFiles)
    || !sameStrings(intent.preservePolicy.preservedFiles, PRESERVED_FILES)
    || intent.preservePolicy.manifestAndReceiptsContainRawHashes !== true
    || intent.preservePolicy.rawNarrativeOrIdentifiersCopiedIntoPurgeArtifacts
      !== false || intent.preservePolicy.immutableNoOverwriteIntent !== true) {
    fail("PURGE_INTENT_PRESERVE_INVALID");
  }
  exactObject(intent.controlFlowBoundary, PURGE_INTENT_CONTROL_EXACT_FIELDS,
    "PURGE_INTENT_CONTROL_FIELDS_INVALID");
  if (intent.controlFlowBoundary.fullCaptureReplayCompletedBeforeIntentWrite !== true
    || intent.controlFlowBoundary.intentMustBeFsyncedBeforeFirstUnlink !== true
    || intent.controlFlowBoundary.publisherControlFlowFactOnly !== true
    || intent.controlFlowBoundary.independentDeletionWitness !== false) {
    fail("PURGE_INTENT_CONTROL_INVALID");
  }
  const truth = exactObject(intent.truthBoundary,
    PURGE_INTENT_TRUTH_EXACT_FIELDS,
    "PURGE_INTENT_TRUTH_FIELDS_INVALID");
  if (truth.localFilesystemDeletionIntentOnly !== true
    || truth.remoteDeletionEstablished !== false
    || truth.copiesOutsideCaptureDirectoryDeleted !== false
    || truth.physicalErasureEstablished !== false
    || truth.legalClearanceEstablished !== false
    || truth.privacyClearanceEstablished !== false
    || truth.externalProvenanceEstablished !== false
    || truth.sameUserParentReplacementResistanceEstablished !== false) {
    fail("PURGE_INTENT_TRUTH_INVALID");
  }
  return Object.freeze({ intent, createdAtMs, retentionUntilMs });
}

function validateRemainingFileSet(names) {
  if (!names.includes(PURGE_INTENT_FILE) || names.includes(PURGE_RECEIPT_FILE)) {
    fail("PURGE_RESUME_FILE_SET_INVALID", "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
  }
  for (const name of names) {
    if (!INTENT_FILES.includes(name)) {
      fail("PURGE_RESUME_FILE_SET_INVALID", "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
    }
  }
  for (const name of [...BASE_FILES, PURGE_INTENT_FILE]) {
    if (!names.includes(name)) {
      fail("PURGE_RESUME_FILE_SET_INVALID", "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
    }
  }
}

function deletePlannedRaw(paths, intentRecord) {
  for (const row of intentRecord.intent.rawDeletionPlan) {
    const target = path.join(paths.directory, row.file);
    let exists = true;
    try { lstatSync(target); }
    catch (error) {
      if (error?.code === "ENOENT") exists = false;
      else fail("RAW_DELETE_STAT_FAILED", "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
    }
    if (!exists) continue;
    const read = stablePrivateRead(target, row.bytes, "RAW_DELETE_TARGET_UNSAFE");
    if (read.bytes.length !== row.bytes || sha256(read.bytes) !== row.sha256) {
      fail("RAW_DELETE_TARGET_DRIFT", "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
    }
    assertDirectory(paths.directory, paths.directoryStat,
      "CAPTURE_DIRECTORY_CHANGED", "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
    unlinkSync(target);
    fsyncDirectory(paths.directory);
    try {
      lstatSync(target);
      fail("RAW_DELETE_NOT_ABSENT", "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
    } catch (error) {
      if (error instanceof Error
        && error.message.startsWith(
          "AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_PURGE_")) throw error;
      if (error?.code !== "ENOENT") {
        fail("RAW_DELETE_POSTCHECK_FAILED", "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
      }
    }
  }
}

function buildReceipt(paths, intentRecord, intentBytes, completedAtMs) {
  return {
    schema: PURGE_RECEIPT_SCHEMA,
    purgeId: intentRecord.intent.purgeId,
    captureDirectoryId: paths.captureDirectoryId,
    attemptId: intentRecord.intent.attemptId,
    purgeIntentBinding: { file: PURGE_INTENT_FILE, bytes: intentBytes.length,
      sha256: sha256(intentBytes) },
    startedAtOperatorClock: intentRecord.intent.createdAtOperatorClock,
    completedAtOperatorClock: canonicalIso(completedAtMs),
    operatorClockIsIndependentTime: false,
    terminalState: "LOCAL_RAW_PURGED",
    deletedRawFiles: intentRecord.intent.rawDeletionPlan,
    preservedFiles: [...PRESERVED_FILES],
    directoryFsyncAfterEveryUnlink: true,
    allPlannedRawFilesAbsentAtCompletion: true,
    controlFlowBoundary: {
      intentFsyncedBeforeFirstUnlink: true,
      receiptWrittenAfterAllRawAbsenceChecks: true,
      publisherControlFlowFactOnly: true,
      independentDeletionWitness: false,
    },
    truthBoundary: {
      localCaptureRawFilesDeleted: true,
      remoteDeletionEstablished: false,
      copiesOutsideCaptureDirectoryDeleted: false,
      physicalErasureEstablished: false,
      legalClearanceEstablished: false,
      privacyClearanceEstablished: false,
      externalProvenanceEstablished: false,
      sameUserParentReplacementResistanceEstablished: false,
    },
  };
}

function validateReceipt(bytes, paths, intentRecord, intentBytes) {
  const receipt = exactObject(parseCanonical(bytes, MAX_SMALL_POLICY_BYTES,
    "PURGE_RECEIPT"), PURGE_RECEIPT_EXACT_FIELDS,
  "PURGE_RECEIPT_FIELDS_INVALID");
  if (receipt.schema !== PURGE_RECEIPT_SCHEMA
    || receipt.purgeId !== intentRecord.intent.purgeId
    || receipt.captureDirectoryId !== paths.captureDirectoryId
    || receipt.attemptId !== intentRecord.intent.attemptId
    || receipt.operatorClockIsIndependentTime !== false
    || receipt.terminalState !== "LOCAL_RAW_PURGED"
    || receipt.startedAtOperatorClock !== intentRecord.intent.createdAtOperatorClock
    || canonicalTime(receipt.completedAtOperatorClock,
      "PURGE_RECEIPT_COMPLETION_INVALID") < intentRecord.createdAtMs
    || receipt.directoryFsyncAfterEveryUnlink !== true
    || receipt.allPlannedRawFilesAbsentAtCompletion !== true
    || !Array.isArray(receipt.deletedRawFiles)
    || canonicalizeStrict(receipt.deletedRawFiles)
      !== canonicalizeStrict(intentRecord.intent.rawDeletionPlan)
    || !Array.isArray(receipt.preservedFiles)
    || !sameStrings(receipt.preservedFiles, PRESERVED_FILES)) {
    fail("PURGE_RECEIPT_INVALID", "PURGE_RECEIPT_PRESENT");
  }
  validateBinding(receipt.purgeIntentBinding, PURGE_INTENT_FILE, intentBytes,
    sha256(intentBytes), "PURGE_RECEIPT_INTENT_BINDING_INVALID");
  const control = exactObject(receipt.controlFlowBoundary,
    PURGE_RECEIPT_CONTROL_EXACT_FIELDS,
    "PURGE_RECEIPT_CONTROL_FIELDS_INVALID");
  if (control.intentFsyncedBeforeFirstUnlink !== true
    || control.receiptWrittenAfterAllRawAbsenceChecks !== true
    || control.publisherControlFlowFactOnly !== true
    || control.independentDeletionWitness !== false) {
    fail("PURGE_RECEIPT_CONTROL_INVALID", "PURGE_RECEIPT_PRESENT");
  }
  const truth = exactObject(receipt.truthBoundary,
    PURGE_RECEIPT_TRUTH_EXACT_FIELDS,
    "PURGE_RECEIPT_TRUTH_FIELDS_INVALID");
  if (truth.localCaptureRawFilesDeleted !== true
    || truth.remoteDeletionEstablished !== false
    || truth.copiesOutsideCaptureDirectoryDeleted !== false
    || truth.physicalErasureEstablished !== false
    || truth.legalClearanceEstablished !== false
    || truth.privacyClearanceEstablished !== false
    || truth.externalProvenanceEstablished !== false
    || truth.sameUserParentReplacementResistanceEstablished !== false) {
    fail("PURGE_RECEIPT_TRUTH_INVALID", "PURGE_RECEIPT_PRESENT");
  }
  return receipt;
}

function verifyRawAbsent(paths, phase) {
  for (const plan of RAW_PLAN) {
    try {
      lstatSync(path.join(paths.directory, plan.file));
      fail("RAW_REMAINS_AFTER_PURGE", phase);
    } catch (error) {
      if (error instanceof Error
        && error.message.startsWith(
          "AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_PURGE_")) throw error;
      if (error?.code !== "ENOENT") fail("RAW_ABSENCE_CHECK_FAILED", phase);
    }
  }
}

export function main(argv = process.argv.slice(2)) {
  let captureDirectoryId = null;
  let purgeId = null;
  let intentDurable = false;
  try {
    if (PURGE_LIFECYCLE_INTEGRATED !== true) {
      fail("PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED");
    }
    const args = parseArguments(argv);
    const workspace = realpathSync(process.cwd());
    const paths = resolveCaptureDirectory(workspace, args.directory);
    captureDirectoryId = paths.captureDirectoryId;
    const names = readFileSet(paths);

    if (names.includes(PURGE_RECEIPT_FILE)) {
      if (!sameStrings(names, PURGED_FILES)) {
        fail("PURGED_FILE_SET_INVALID", "PURGE_RECEIPT_PRESENT");
      }
      const preserved = readPreserved(paths, args, "PURGE_RECEIPT_PRESENT");
      const intentRead = stablePrivateRead(path.join(paths.directory,
        PURGE_INTENT_FILE), MAX_SMALL_POLICY_BYTES, "PURGE_INTENT_FILE_UNSAFE");
      const intentRecord = validateIntent(intentRead.bytes, paths, preserved, args);
      purgeId = intentRecord.intent.purgeId;
      const receiptRead = stablePrivateRead(path.join(paths.directory,
        PURGE_RECEIPT_FILE), MAX_SMALL_POLICY_BYTES, "PURGE_RECEIPT_FILE_UNSAFE");
      validateReceipt(receiptRead.bytes, paths, intentRecord, intentRead.bytes);
      verifyRawAbsent(paths, "PURGE_RECEIPT_PRESENT");
      const result = Object.freeze({ status: "LOCAL_RAW_ALREADY_PURGED",
        captureDirectoryId, purgeId });
      process.stdout.write(`${JSON.stringify(result)}\n`);
      return result;
    }

    let intentRead;
    let intentRecord;
    if (names.includes(PURGE_INTENT_FILE)) {
      validateRemainingFileSet(names);
      const preserved = readPreserved(paths, args,
        "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
      intentRead = stablePrivateRead(path.join(paths.directory,
        PURGE_INTENT_FILE), MAX_SMALL_POLICY_BYTES, "PURGE_INTENT_FILE_UNSAFE");
      intentRecord = validateIntent(intentRead.bytes, paths, preserved, args);
      purgeId = intentRecord.intent.purgeId;
      intentDurable = true;
    } else {
      const replay = fullReplayFresh(paths, args);
      const nowMs = Date.now();
      if (nowMs < replay.lifecycle.retentionUntilMs) {
        fail("RETENTION_NOT_EXPIRED");
      }
      purgeId = `purge_${randomBytes(16).toString("hex")}`;
      if (!PURGE_ID.test(purgeId)
        || purgeId === "purge_00000000000000000000000000000000") {
        fail("PURGE_ID_INVALID");
      }
      const intent = buildIntent(paths, replay, nowMs, purgeId);
      const intentBytes = canonicalBytes(intent);
      // Conservatively treat the directory as raw-forbidden as soon as the
      // no-clobber intent write is attempted; a disk error can still leave an
      // intent inode that every loader must honor.
      intentDurable = true;
      durableWritePrivate(paths.directory, paths.directoryStat,
        PURGE_INTENT_FILE, intentBytes, "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
      intentRead = Object.freeze({ bytes: intentBytes });
      intentRecord = validateIntent(intentBytes, paths, replay.preserved, args);
    }

    if (Date.now() < intentRecord.retentionUntilMs) {
      fail("RETENTION_NOT_EXPIRED", "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
    }
    deletePlannedRaw(paths, intentRecord);
    verifyRawAbsent(paths, "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
    const completedAtMs = Date.now();
    if (completedAtMs < intentRecord.createdAtMs) {
      fail("OPERATOR_CLOCK_REGRESSED", "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
    }
    const receipt = buildReceipt(paths, intentRecord, intentRead.bytes,
      completedAtMs);
    const receiptBytes = canonicalBytes(receipt);
    durableWritePrivate(paths.directory, paths.directoryStat,
      PURGE_RECEIPT_FILE, receiptBytes, "PURGE_INTENT_PRESENT_RAW_FORBIDDEN");
    fsyncDirectory(paths.directory);
    assertDirectory(paths.trustedRoot, paths.rootStat, "PRIVATE_ROOT_CHANGED",
      "PURGE_RECEIPT_PRESENT");
    fsyncDirectory(paths.trustedRoot);
    const finalNames = readFileSet(paths);
    if (!sameStrings(finalNames, PURGED_FILES)) {
      fail("PURGED_FILE_SET_INVALID", "PURGE_RECEIPT_PRESENT");
    }
    validateReceipt(receiptBytes, paths, intentRecord, intentRead.bytes);
    verifyRawAbsent(paths, "PURGE_RECEIPT_PRESENT");
    const result = Object.freeze({ status: "LOCAL_RAW_PURGED",
      captureDirectoryId, purgeId });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  } catch (error) {
    const safeError = error instanceof Error
      && error.message.startsWith(
        "AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_PURGE_")
      ? error : purgeError("UNEXPECTED_LOCAL_FAILURE", intentDurable
        ? "PURGE_INTENT_PRESENT_RAW_FORBIDDEN"
        : "REJECTED_BEFORE_PURGE_INTENT");
    Object.defineProperty(safeError, "captureDirectoryId", {
      value: captureDirectoryId, configurable: true,
    });
    Object.defineProperty(safeError, "purgeId", {
      value: purgeId, configurable: true,
    });
    throw safeError;
  }
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  try { main(); }
  catch (error) {
    const status = typeof error?.purgeFailurePhase === "string"
      ? error.purgeFailurePhase : "REJECTED_BEFORE_PURGE_INTENT";
    const result = { status };
    if (typeof error?.captureDirectoryId === "string") {
      result.captureDirectoryId = error.captureDirectoryId;
    }
    if (typeof error?.purgeId === "string") result.purgeId = error.purgeId;
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
