#!/usr/bin/env node

/**
 * Preflight-gated, GET-only acquisition of the fixed GitHub #64056 discovery
 * bracket. Raw public narrative and provider identifiers remain in a private,
 * ignored local directory with a declared retention deadline and mandatory
 * purge due. The resulting capture is only a
 * mutable public-source discovery input; it establishes no authority, incident
 * fact, participant standing, independent outcome, recovery, or admission.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { request as httpsRequest } from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import { TextDecoder } from "node:util";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE,
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH,
  parseAutonomousWorkOrderGithubDiscoveryPreflightReview,
} from "../src/outsider-autonomous-work-order-github-discovery-snapshot.js";

export const ACQUISITION_PREFLIGHT_SCHEMA =
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_SCHEMAS.preflightReview;
export const ACQUISITION_CAPTURE_MANIFEST_SCHEMA =
  "outsider.autonomous-work-order.github-discovery-snapshot-capture-manifest.v2";
export const ACQUISITION_TARGET_PROFILE_HASH_DOMAIN =
  "outsider.autonomous-work-order.github-discovery.target-profile.v1";
export const ACQUISITION_PREFLIGHT_REVIEW_HASH_DOMAIN =
  "outsider.autonomous-work-order.github-discovery.acquisition-preflight-review.v1";
export const ACQUISITION_LIFECYCLE_RECEIPT_SCHEMA =
  "outsider/autonomous-work-order-github-discovery-acquisition-lifecycle-receipt/v1";
export const ACQUISITION_LIFECYCLE_RECEIPT_FILE =
  "acquisition-lifecycle-receipt.json";

const API_VERSION =
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS
    .requestedAndSelectedApiVersion;
const AUTH_VISIBILITY_PROFILE =
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE.authVisibilityProfile;
const ISSUE_URL = AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE
  .candidateTarget.issueRequestUrl;
const COMMENTS_URL = AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE
  .candidateTarget.commentsRequestUrl;
const ACCEPT = AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE
  .requestHeaders.accept;
const CONTENT_TYPE = "application/json; charset=utf-8";
const USER_AGENT = "outsider-autonomous-work-order-github-discovery/2.0";
const PRIVATE_ROOT_RELATIVE = "artifacts/private-source-captures";
const LIVE_TRANSPORT_CLASS = "NODE_HTTPS_FIXED_PUBLIC_API";
const TEST_TRANSPORT_CLASS = "TEST_ONLY_IN_MEMORY_TRANSPORT";
// Fail closed for both live and injected transports until the separate purge
// operator and its focused lifecycle tests have passed joint review. This must
// be deliberately changed in a versioned successor; a dependency, marker file,
// environment variable, or caller option cannot lift it.
const LIVE_ACQUISITION_ENABLED = false;
const REQUEST_ABSOLUTE_DEADLINE_MS = 30_000;
const BRACKET_ABSOLUTE_DEADLINE_MS = 180_000;
const SOCKET_IDLE_TIMEOUT_MS = 10_000;
const MAX_REVIEW_BYTES = 32 * 1024;
const MAX_RETENTION_SECONDS = 604_800;
const MAX_REVIEW_WINDOW_MS = MAX_RETENTION_SECONDS * 1_000;
const OPAQUE_SNAPSHOT = /^snapshot_[a-f0-9]{32}$/u;
export const ACQUISITION_ATTEMPT_ID_PATTERN = "^acq_[a-f0-9]{32}$";
const ACQUISITION_ATTEMPT_ID = /^acq_[a-f0-9]{32}$/u;
const REVIEW_ID = /^awo_[a-f0-9]{32}$/u;
const SHA256 = /^sha256:[a-f0-9]{64}$/u;
const REVIEWER_ALIAS = /^reviewer_[a-f0-9]{32}$/u;
const WEAK_ETAG = /^W\/"[A-Fa-f0-9]{64}"$/u;
const NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;
const DIRECTORY = fsConstants.O_DIRECTORY ?? 0;
const utf8Decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false });

const RAW_FILES = Object.freeze([
  "issue-before.json",
  "comments-scan-a.json",
  "issue-mid.json",
  "comments-scan-b.json",
  "issue-after.json",
]);
const FINAL_FILES = Object.freeze([
  "acquisition-lifecycle-receipt.json",
  "capture-manifest.json",
  "comments-scan-a.json",
  "comments-scan-b.json",
  "issue-after.json",
  "issue-before.json",
  "issue-mid.json",
  "preflight-review.json",
]);

const REQUEST_PLAN = AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE
  .requestPlan;
export const ACQUISITION_TARGET_PROFILE =
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE;
export const ACQUISITION_TARGET_PROFILE_HASH =
  AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_TARGET_PROFILE_HASH;

export const ACQUISITION_PREFLIGHT_EXACT_FIELDS = Object.freeze([
  "schema", "candidateTarget", "operatorReviewOccurrence", "acquisitionScope",
  "operatorPolicy", "legalBoundary", "decision", "reviewHash",
]);
export const ACQUISITION_MANIFEST_EXACT_FIELDS = Object.freeze([
  "schema", "transportClass", "acquisitionAttempt", "preflightReviewBinding",
  "captureSequence", "controlFlowBoundary", "requestPolicy", "invariants",
  "semantics", "source", "sourceEntry", "truthBoundary",
]);
export const ACQUISITION_ATTEMPT_EXACT_FIELDS = Object.freeze([
  "attemptId", "startedAtPublisherClock", "completedAtPublisherClock",
  "publisherClockIsIndependentTime", "terminalState",
  "initialLifecycleReceiptFile", "initialLifecycleReceiptBytes",
  "initialLifecycleReceiptSha256",
  "retentionSeconds", "retentionUntilPublisherClock", "purgeRequired",
  "manifestLastRequiredForTerminalInterpretation",
  "wholeDirectoryAtomicPublicationEstablished",
]);
export const ACQUISITION_LIFECYCLE_RECEIPT_EXACT_FIELDS = Object.freeze([
  "schema", "attemptId", "state", "preflightReviewHash",
  "preflightReviewFileSha256", "targetProfileHash", "transportClass",
  "startedAtPublisherClock", "publisherClockIsIndependentTime",
  "retentionSeconds", "retentionUntilPublisherClock", "purgeRequired",
  "manifestLastRequiredForTerminalInterpretation",
  "wholeDirectoryAtomicPublicationEstablished",
  "independentOccurrenceWitness", "externalProvenanceEstablished",
]);
export const ACQUISITION_CONTROL_FLOW_EXACT_FIELDS = Object.freeze([
  "preflightValidatedBeforePrivateDirectoryCreation",
  "preflightValidatedBeforeFirstNetworkRequest",
  "fixedSequenceExecutedByPublisherControlFlow",
  "finalDirectoryReservedByAtomicMkdirNoClobber",
  "sameUserParentReplacementResistanceEstablished",
  "independentOccurrenceWitness", "publisherControlFlowFactOnly",
]);
export const ACQUISITION_CAPTURE_ROW_EXACT_FIELDS = Object.freeze([
  "role", "file", "body", "acquiredAtPublisherClock",
  "acquiredAtIsIndependentTime", "meta", "transport",
]);
export const ACQUISITION_PREFLIGHT_BINDING_EXACT_FIELDS = Object.freeze([
  "file", "bytes", "sha256", "reviewHash", "targetProfileHash",
  "reviewValidatedBeforeDirectoryCreation",
  "reviewValidatedBeforeFirstNetworkRequest", "captureStartedAfterReview",
  "localPolicyWindowSatisfiedAtStart", "publisherControlFlowFactOnly",
  "independentReviewTimingWitness",
]);

const CAPTURE_PLAN = Object.freeze([
  Object.freeze({ ...REQUEST_PLAN[0], file: RAW_FILES[0] }),
  Object.freeze({ ...REQUEST_PLAN[1], file: RAW_FILES[1] }),
  Object.freeze({ ...REQUEST_PLAN[2], file: RAW_FILES[2] }),
  Object.freeze({ ...REQUEST_PLAN[3], file: RAW_FILES[3] }),
  Object.freeze({ ...REQUEST_PLAN[4], file: RAW_FILES[4] }),
]);

function captureError(code, phase = "REJECTED_BEFORE_NETWORK") {
  const normalizedPhase = phase === "INCOMPLETE_PRIVATE_STAGING_RETAINED"
    ? "INCOMPLETE_PRIVATE_CAPTURE_DIRECTORY_RETAINED" : phase;
  const error = new Error(`AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUIRE_${code}`);
  Object.defineProperty(error, "captureFailurePhase", { value: normalizedPhase });
  return error;
}

function fail(code, phase = "REJECTED_BEFORE_NETWORK") {
  throw captureError(code, phase);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalIso(milliseconds) {
  return new Date(milliseconds).toISOString();
}

function sameStrings(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

function sameBytes(left, right) {
  return Buffer.isBuffer(left) && Buffer.isBuffer(right) && left.equals(right);
}

function parseArguments(argv) {
  if (!Array.isArray(argv) || argv.length !== 2
    || typeof argv[0] !== "string" || argv[0].length === 0
    || typeof argv[1] !== "string" || argv[1].length === 0
    || argv[0].includes("\0") || argv[1].includes("\0")) {
    fail("ARGUMENTS_INVALID");
  }
  return { output: argv[0], preflightReview: argv[1] };
}

function statPrivateDirectory(directory, code) {
  let status;
  try { status = lstatSync(directory); } catch { fail(code); }
  if (!status.isDirectory() || status.isSymbolicLink()
    || (status.mode & 0o777) !== 0o700) fail(code);
  return status;
}

function sameNode(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function assertDirectoryNode(directory, expected, code) {
  const current = statPrivateDirectory(directory, code);
  if (!sameNode(current, expected)) fail(code, "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  return current;
}

function stablePrivateRead(file, maximumBytes, workspace) {
  const absolute = path.resolve(workspace, file);
  const relative = path.relative(workspace, absolute);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("PREFLIGHT_PATH_OUTSIDE_WORKSPACE");
  let cursor = workspace;
  const parentRelative = path.relative(workspace, path.dirname(absolute));
  for (const segment of parentRelative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    let parentStatus;
    try { parentStatus = lstatSync(cursor); } catch { fail("PREFLIGHT_PARENT_UNSAFE"); }
    if (!parentStatus.isDirectory() || parentStatus.isSymbolicLink()) {
      fail("PREFLIGHT_PARENT_UNSAFE");
    }
  }
  let initial;
  try { initial = lstatSync(absolute); } catch { fail("PREFLIGHT_FILE_MISSING"); }
  if (!initial.isFile() || initial.isSymbolicLink() || initial.nlink !== 1
    || (initial.mode & 0o777) !== 0o600 || initial.size < 2
    || initial.size > maximumBytes) fail("PREFLIGHT_FILE_UNSAFE");
  let descriptor;
  try {
    descriptor = openSync(absolute, fsConstants.O_RDONLY | NOFOLLOW);
    const before = fstatSync(descriptor);
    if (!sameNode(initial, before) || initial.size !== before.size
      || initial.mtimeMs !== before.mtimeMs || initial.ctimeMs !== before.ctimeMs) {
      fail("PREFLIGHT_FILE_CHANGED");
    }
    const first = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const finalPath = lstatSync(absolute);
    if (!sameNode(before, after) || !sameNode(after, finalPath)
      || before.size !== after.size || after.size !== finalPath.size
      || before.mtimeMs !== after.mtimeMs || after.mtimeMs !== finalPath.mtimeMs
      || before.ctimeMs !== after.ctimeMs || after.ctimeMs !== finalPath.ctimeMs
      || first.length !== before.size) fail("PREFLIGHT_FILE_CHANGED");
    const second = readFileSync(absolute);
    const finalAgain = lstatSync(absolute);
    if (!sameNode(finalPath, finalAgain) || finalPath.size !== finalAgain.size
      || finalPath.mtimeMs !== finalAgain.mtimeMs
      || finalPath.ctimeMs !== finalAgain.ctimeMs
      || !sameBytes(first, second)) fail("PREFLIGHT_FILE_CHANGED");
    return { absolute, bytes: first };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateOutputPath(workspace, outputArgument, testContext) {
  const output = path.resolve(workspace, outputArgument);
  const snapshotId = path.basename(output);
  if (!OPAQUE_SNAPSHOT.test(snapshotId)) fail("OUTPUT_ID_INVALID");
  if (testContext !== null) {
    const testRoot = testContext.testRoot;
    if (path.dirname(output) !== testRoot) fail("TEST_OUTPUT_ROOT_INVALID");
    if (existsSync(output)) fail("OUTPUT_EXISTS");
    return { output, privateRoot: testRoot, snapshotId, testTransport: true };
  }
  const privateRoot = path.resolve(workspace, PRIVATE_ROOT_RELATIVE);
  if (path.dirname(output) !== privateRoot || output === privateRoot
    || output === path.parse(output).root) fail("OUTPUT_ROOT_INVALID");
  if (existsSync(output)) fail("OUTPUT_EXISTS");
  return { output, privateRoot, snapshotId, testTransport: false };
}

function validateDependencies(dependencies) {
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies)) fail("DEPENDENCIES_INVALID");
  const keys = Object.keys(dependencies).sort();
  if (keys.length === 0) return null;
  if (!sameStrings(keys, ["testRoot", "transport"])
    || typeof dependencies.transport !== "function"
    || typeof dependencies.testRoot !== "string") fail("DEPENDENCIES_INVALID");
  let testRoot;
  try { testRoot = realpathSync(dependencies.testRoot); }
  catch { fail("TEST_ROOT_UNSAFE"); }
  const allowedTemporaryRoots = [];
  try { allowedTemporaryRoots[allowedTemporaryRoots.length] = realpathSync("/private/tmp"); }
  catch { /* Linux commonly has only /tmp. */ }
  allowedTemporaryRoots[allowedTemporaryRoots.length] = realpathSync(tmpdir());
  let underTemporaryRoot = false;
  for (const temporaryRoot of allowedTemporaryRoots) {
    const relative = path.relative(temporaryRoot, testRoot);
    if (relative !== "" && relative !== ".."
      && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
      underTemporaryRoot = true;
    }
  }
  if (!underTemporaryRoot) fail("TEST_ROOT_UNSAFE");
  statPrivateDirectory(testRoot, "TEST_ROOT_UNSAFE");
  return Object.freeze({ testRoot, transport: dependencies.transport });
}

function validatePreflight(workspace, reviewArgument) {
  const file = stablePrivateRead(reviewArgument, MAX_REVIEW_BYTES, workspace);
  let review;
  try {
    review = parseAutonomousWorkOrderGithubDiscoveryPreflightReview(file.bytes);
  } catch {
    fail("PREFLIGHT_REVIEW_REPLAY_INVALID");
  }
  if (review.schema !== ACQUISITION_PREFLIGHT_SCHEMA
    || review.acquisitionScope.targetProfileHash !== ACQUISITION_TARGET_PROFILE_HASH
    || review.acquisitionScope.maxCaptureSlots !== 5
    || review.acquisitionScope.maxRawBytes !== 62_789
    || !Number.isSafeInteger(review.acquisitionScope.retentionSeconds)
    || review.acquisitionScope.retentionSeconds < 1
    || review.acquisitionScope.retentionSeconds > MAX_RETENTION_SECONDS
    || !REVIEW_ID.test(review.operatorReviewOccurrence.reviewId)
    || !REVIEWER_ALIAS.test(review.operatorReviewOccurrence.reviewerPairwiseAlias)
    || !SHA256.test(review.operatorReviewOccurrence.reviewBasisCommitment)) {
    fail("PREFLIGHT_REVIEW_SCOPE_INVALID");
  }
  const reviewedAtMs = Date.parse(review.operatorReviewOccurrence.reviewedAt);
  const validThroughMs = Date.parse(review.operatorReviewOccurrence.validThrough);
  const nowMs = Date.now();
  if (!Number.isFinite(reviewedAtMs) || !Number.isFinite(validThroughMs)
    || canonicalIso(reviewedAtMs) !== review.operatorReviewOccurrence.reviewedAt
    || canonicalIso(validThroughMs) !== review.operatorReviewOccurrence.validThrough
    || validThroughMs <= reviewedAtMs
    || validThroughMs - reviewedAtMs > MAX_REVIEW_WINDOW_MS
    || nowMs < reviewedAtMs || nowMs > validThroughMs) {
    fail("PREFLIGHT_LOCAL_POLICY_WINDOW_INVALID");
  }
  return Object.freeze({
    bytes: file.bytes,
    fileSha256: sha256(file.bytes),
    review,
    reviewedAtMs,
    validThroughMs,
    validatedAtMs: nowMs,
  });
}

function verifyIgnoredPrivateRoot(workspace, privateRoot, testTransport) {
  if (testTransport) return statPrivateDirectory(privateRoot, "TEST_ROOT_UNSAFE");
  const ignoreFile = path.join(workspace, ".gitignore");
  let ignoreText;
  try { ignoreText = readFileSync(ignoreFile, "utf8"); }
  catch { fail("GITIGNORE_UNREADABLE"); }
  const lines = ignoreText.split(/\r?\n/u);
  let artifactsIgnored = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "artifacts/") artifactsIgnored = true;
    if (line.startsWith("!artifacts")) fail("PRIVATE_ROOT_NOT_DURABLY_IGNORED");
  }
  if (!artifactsIgnored) fail("PRIVATE_ROOT_NOT_DURABLY_IGNORED");
  const artifacts = path.join(workspace, "artifacts");
  statPrivateDirectory(artifacts, "ARTIFACTS_ROOT_UNSAFE");
  if (!existsSync(privateRoot)) {
    mkdirSync(privateRoot, { mode: 0o700, recursive: false });
    chmodSync(privateRoot, 0o700);
    fsyncDirectory(artifacts);
  }
  const rootStatus = statPrivateDirectory(privateRoot, "PRIVATE_ROOT_UNSAFE");
  fsyncDirectory(privateRoot);
  return rootStatus;
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

function createPrivateDirectory(directory) {
  mkdirSync(directory, { mode: 0o700, recursive: false });
  chmodSync(directory, 0o700);
  return statPrivateDirectory(directory, "PRIVATE_DIRECTORY_CREATE_FAILED");
}

function durableWritePrivate(directory, directoryStat, file, bytes) {
  assertDirectoryNode(directory, directoryStat, "STAGING_DIRECTORY_CHANGED");
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
      fail("PRIVATE_FILE_WRITE_INVALID", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  const pathStatus = lstatSync(destination);
  if (!pathStatus.isFile() || pathStatus.isSymbolicLink() || pathStatus.nlink !== 1
    || (pathStatus.mode & 0o777) !== 0o600 || pathStatus.size !== bytes.length
    || !sameBytes(readFileSync(destination), bytes)) {
    fail("PRIVATE_FILE_REPLAY_INVALID", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  fsyncDirectory(directory);
}

function rawHeaderValues(rawHeaders, name) {
  const target = name.toLowerCase();
  const values = [];
  for (let index = 0; index < rawHeaders.length; index += 2) {
    if (String(rawHeaders[index]).toLowerCase() === target) {
      values[values.length] = String(rawHeaders[index + 1]);
    }
  }
  return values;
}

function optionalHeader(response, name) {
  const values = rawHeaderValues(response.rawHeaders, name);
  if (values.length > 1) fail("RESPONSE_HEADER_DUPLICATE",
    "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  return values.length === 0 ? null : values[0];
}

function requiredHeader(response, name, expected = null) {
  const value = optionalHeader(response, name);
  if (value === null || value.length === 0 || /[\r\n]/u.test(value)) {
    fail("RESPONSE_HEADER_MISSING_OR_INVALID",
      "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  if (expected !== null && value !== expected) {
    fail("RESPONSE_HEADER_VALUE_DRIFT", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  return value;
}

function selectedHeaders(response, item) {
  if (optionalHeader(response, "location") !== null
    || rawHeaderValues(response.rawHeaders, "set-cookie").length !== 0) {
    fail("REDIRECT_OR_COOKIE_RESPONSE", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  const contentType = requiredHeader(response, "content-type", CONTENT_TYPE);
  const selectedApiVersion = requiredHeader(
    response, "x-github-api-version-selected", API_VERSION,
  );
  const requestId = requiredHeader(response, "x-github-request-id");
  const etag = requiredHeader(response, "etag");
  if (!WEAK_ETAG.test(etag)) {
    fail("ETAG_FORMAT_DRIFT", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  const responseDate = requiredHeader(response, "date");
  if (!Number.isFinite(Date.parse(responseDate))) {
    fail("RESPONSE_DATE_INVALID", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  const lastModified = optionalHeader(response, "last-modified");
  if (lastModified !== null && !Number.isFinite(Date.parse(lastModified))) {
    fail("LAST_MODIFIED_INVALID", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  const contentEncoding = optionalHeader(response, "content-encoding");
  if (contentEncoding !== null && contentEncoding !== "identity") {
    fail("CONTENT_ENCODING_DRIFT", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  const contentLength = optionalHeader(response, "content-length");
  if (contentLength !== null
    && (!/^(0|[1-9][0-9]*)$/u.test(contentLength)
      || Number(contentLength) !== item.expectedBytes)) {
    fail("CONTENT_LENGTH_DRIFT", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  const link = optionalHeader(response, "link");
  if (link !== null) {
    fail("NONTERMINAL_OR_AMBIGUOUS_PAGE_LINK",
      "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  return Object.freeze({ contentEncoding, contentLength, contentType, etag,
    lastModified, link, requestId, responseDate, selectedApiVersion });
}

function exactRequestOptions(item) {
  const parsed = new URL(item.requestUrl);
  if (parsed.href !== item.requestUrl || parsed.protocol !== "https:"
    || parsed.hostname !== "api.github.com" || parsed.port !== ""
    || parsed.username !== "" || parsed.password !== "") {
    fail("REQUEST_URL_NOT_FIXED", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  return Object.freeze({
    agent: false,
    headers: Object.freeze({
      Accept: ACCEPT,
      "Accept-Encoding": "identity",
      "User-Agent": USER_AGENT,
      "X-GitHub-Api-Version": API_VERSION,
    }),
    hostname: "api.github.com",
    method: "GET",
    minVersion: "TLSv1.2",
    path: `${parsed.pathname}${parsed.search}`,
    port: 443,
    protocol: "https:",
    rejectUnauthorized: true,
    servername: "api.github.com",
  });
}

async function acquireLive(item, absoluteDeadlineMs) {
  const options = exactRequestOptions(item);
  const remaining = Math.min(
    REQUEST_ABSOLUTE_DEADLINE_MS, absoluteDeadlineMs - Date.now(),
  );
  if (remaining <= 0) {
    fail("BRACKET_ABSOLUTE_DEADLINE_EXCEEDED",
      "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    let wallClockTimer;
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      if (wallClockTimer !== undefined) clearTimeout(wallClockTimer);
      if (request && !request.destroyed) request.destroy();
      reject(error);
    };
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      if (wallClockTimer !== undefined) clearTimeout(wallClockTimer);
      resolve(value);
    };
    try {
      request = httpsRequest(options, (response) => {
        try {
          if (response.req !== request || response.statusCode !== 200
            || response.socket?.authorized !== true
            || response.socket?.authorizationError != null) {
            fail("HTTPS_RESPONSE_BOUNDARY_INVALID",
              "INCOMPLETE_PRIVATE_STAGING_RETAINED");
          }
          const actualUrl = new URL(response.req.path,
            `${response.req.protocol}//${response.req.host}`).href;
          if (actualUrl !== item.requestUrl) {
            fail("ACTUAL_REQUEST_URL_DRIFT",
              "INCOMPLETE_PRIVATE_STAGING_RETAINED");
          }
          const headers = selectedHeaders(response, item);
          const chunks = [];
          let byteLength = 0;
          response.on("aborted", () => finishReject(captureError(
            "RESPONSE_ABORTED", "INCOMPLETE_PRIVATE_STAGING_RETAINED")));
          response.on("error", (error) => finishReject(captureError(
            error ? "RESPONSE_STREAM_ERROR" : "RESPONSE_STREAM_ERROR",
            "INCOMPLETE_PRIVATE_STAGING_RETAINED")));
          response.on("data", (chunk) => {
            if (settled) return;
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            byteLength += bytes.length;
            if (byteLength > item.expectedBytes) {
              finishReject(captureError("BODY_BOUND_EXCEEDED",
                "INCOMPLETE_PRIVATE_STAGING_RETAINED"));
              return;
            }
            chunks[chunks.length] = bytes;
          });
          response.on("end", () => {
            if (settled) return;
            try {
              if (!response.complete || Object.keys(response.trailers).length !== 0
                || response.rawTrailers.length !== 0) {
                fail("RESPONSE_INCOMPLETE_OR_TRAILERED",
                  "INCOMPLETE_PRIVATE_STAGING_RETAINED");
              }
              const body = Buffer.concat(chunks, byteLength);
              if (body.length !== item.expectedBytes
                || sha256(body) !== item.expectedSha256) {
                fail("BODY_PIN_DRIFT", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
              }
              const acquiredAtMs = Date.now();
              finishResolve(Object.freeze({
                acquiredAtMs,
                body,
                finalUrl: actualUrl,
                headers,
                redirected: false,
                requestUrl: actualUrl,
                statusCode: response.statusCode,
              }));
            } catch (error) { finishReject(error); }
          });
        } catch (error) {
          response.destroy();
          finishReject(error);
        }
      });
    } catch (error) {
      finishReject(captureError(error ? "HTTPS_REQUEST_CREATE_FAILED"
        : "HTTPS_REQUEST_CREATE_FAILED", "INCOMPLETE_PRIVATE_STAGING_RETAINED"));
      return;
    }
    request.on("error", () => finishReject(captureError(
      "HTTPS_REQUEST_ERROR", "INCOMPLETE_PRIVATE_STAGING_RETAINED")));
    if (request.getHeader("authorization") !== undefined
      || request.getHeader("proxy-authorization") !== undefined
      || request.getHeader("cookie") !== undefined) {
      finishReject(captureError("CREDENTIAL_HEADER_PRESENT",
        "INCOMPLETE_PRIVATE_STAGING_RETAINED"));
      return;
    }
    request.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () => finishReject(captureError(
      "SOCKET_IDLE_TIMEOUT", "INCOMPLETE_PRIVATE_STAGING_RETAINED")));
    wallClockTimer = setTimeout(() => finishReject(captureError(
      "REQUEST_ABSOLUTE_DEADLINE_EXCEEDED",
      "INCOMPLETE_PRIVATE_STAGING_RETAINED")), remaining);
    request.end();
  });
}

async function withInjectedDeadline(transport, item, absoluteDeadlineMs) {
  const remaining = Math.min(
    REQUEST_ABSOLUTE_DEADLINE_MS, absoluteDeadlineMs - Date.now(),
  );
  if (remaining <= 0) fail("BRACKET_ABSOLUTE_DEADLINE_EXCEEDED",
    "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  let timer;
  try {
    const value = await Promise.race([
      Promise.resolve().then(() => transport(Object.freeze({ ...item }))),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(captureError(
          "TEST_TRANSPORT_ABSOLUTE_DEADLINE_EXCEEDED",
          "INCOMPLETE_PRIVATE_STAGING_RETAINED")), remaining);
      }),
    ]);
    return value;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function normalizeInjectedCapture(item, value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !Buffer.isBuffer(value.body) || value.body.length !== item.expectedBytes
    || sha256(value.body) !== item.expectedSha256
    || value.requestUrl !== item.requestUrl || value.finalUrl !== item.requestUrl
    || value.redirected !== false || value.statusCode !== 200
    || value.headers === null || typeof value.headers !== "object") {
    fail("TEST_TRANSPORT_CAPTURE_INVALID",
      "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  const headers = value.headers;
  if (headers.contentType !== CONTENT_TYPE
    || headers.selectedApiVersion !== API_VERSION
    || headers.contentEncoding !== null && headers.contentEncoding !== "identity"
    || headers.link !== null || !WEAK_ETAG.test(headers.etag)
    || typeof headers.requestId !== "string" || headers.requestId.length < 8
    || !Number.isFinite(Date.parse(headers.responseDate))
    || headers.lastModified !== null
      && !Number.isFinite(Date.parse(headers.lastModified))) {
    fail("TEST_TRANSPORT_HEADERS_INVALID",
      "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  return Object.freeze({
    acquiredAtMs: Date.now(), body: Buffer.from(value.body),
    finalUrl: value.finalUrl, headers: Object.freeze({ ...headers }),
    redirected: false, requestUrl: value.requestUrl, statusCode: 200,
  });
}

function parseJson(bytes, role) {
  let text;
  try { text = utf8Decoder.decode(bytes); }
  catch { fail("BODY_UTF8_INVALID", "INCOMPLETE_PRIVATE_STAGING_RETAINED"); }
  if (text.startsWith("\uFEFF")) {
    fail("BODY_UTF8_BOM_INVALID", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  try { return JSON.parse(text); }
  catch { fail(`BODY_JSON_INVALID_${role}`, "INCOMPLETE_PRIVATE_STAGING_RETAINED"); }
}

function validateIssue(value, role) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.url !== ISSUE_URL
    || value.repository_url
      !== "https://api.github.com/repos/anthropics/claude-code"
    || value.comments_url !== `${ISSUE_URL}/comments`
    || value.html_url
      !== "https://github.com/anthropics/claude-code/issues/64056"
    || value.number !== 64_056 || value.comments !== 6
    || Object.hasOwn(value, "pull_request")) {
    fail(`ISSUE_SEMANTIC_DRIFT_${role}`,
      "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
}

function validateComments(value, role) {
  if (!Array.isArray(value) || value.length !== 6) {
    fail(`COMMENTS_COUNT_DRIFT_${role}`,
      "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  const ids = new Set();
  const ordered = [];
  for (const comment of value) {
    if (comment === null || typeof comment !== "object" || Array.isArray(comment)
      || !Number.isSafeInteger(comment.id) || comment.id < 1
      || ids.has(comment.id) || comment.issue_url !== ISSUE_URL
      || typeof comment.node_id !== "string" || comment.node_id.length === 0) {
      fail(`COMMENTS_SEMANTIC_DRIFT_${role}`,
        "INCOMPLETE_PRIVATE_STAGING_RETAINED");
    }
    ids.add(comment.id);
    ordered[ordered.length] = String(comment.id);
  }
  return ordered;
}

function validateBracket(captures, review) {
  const parsed = [];
  for (let index = 0; index < captures.length; index += 1) {
    const acquiredAtMs = captures[index].acquiredAtMs;
    if (acquiredAtMs < review.reviewedAtMs
      || acquiredAtMs > review.validThroughMs) {
      fail("CAPTURE_OUTSIDE_PREFLIGHT_WINDOW",
        "INCOMPLETE_PRIVATE_STAGING_RETAINED");
    }
    parsed[index] = parseJson(captures[index].body, CAPTURE_PLAN[index].role);
  }
  validateIssue(parsed[0], "ISSUE_BEFORE");
  validateIssue(parsed[2], "ISSUE_MID");
  validateIssue(parsed[4], "ISSUE_AFTER");
  const commentsAIds = validateComments(parsed[1], "COMMENTS_SCAN_A");
  const commentsBIds = validateComments(parsed[3], "COMMENTS_SCAN_B");
  const issueRawExact = sameBytes(captures[0].body, captures[2].body)
    && sameBytes(captures[0].body, captures[4].body);
  const commentsRawExact = sameBytes(captures[1].body, captures[3].body);
  const issueSemanticExact = canonicalizeStrict(parsed[0])
      === canonicalizeStrict(parsed[2])
    && canonicalizeStrict(parsed[0]) === canonicalizeStrict(parsed[4]);
  const commentsSemanticExact = canonicalizeStrict(parsed[1])
    === canonicalizeStrict(parsed[3]);
  if (!issueRawExact || !commentsRawExact || !issueSemanticExact
    || !commentsSemanticExact || !sameStrings(commentsAIds, commentsBIds)) {
    fail("BRACKET_REPLAY_DRIFT", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  const requestIds = new Set();
  let priorDateMs = -Infinity;
  for (let index = 0; index < captures.length; index += 1) {
    const capture = captures[index];
    const dateMs = Date.parse(capture.headers.responseDate);
    if (requestIds.has(capture.headers.requestId) || dateMs < priorDateMs
      || dateMs < review.reviewedAtMs || dateMs > review.validThroughMs
      || capture.headers.link !== null) {
      fail("REQUEST_ID_DATE_OR_PAGE_ORDER_INVALID",
        "INCOMPLETE_PRIVATE_STAGING_RETAINED");
    }
    requestIds.add(capture.headers.requestId);
    priorDateMs = dateMs;
  }
  if (captures[0].headers.etag !== captures[2].headers.etag
    || captures[0].headers.etag !== captures[4].headers.etag
    || captures[1].headers.etag !== captures[3].headers.etag) {
    fail("BRACKET_ETAG_DRIFT", "INCOMPLETE_PRIVATE_STAGING_RETAINED");
  }
  return Object.freeze({ commentsRawExact, commentsSemanticExact,
    issueRawExact, issueSemanticExact, visibleComments: commentsAIds.length });
}

function captureMeta(item, capture) {
  return {
    captureOrdinal: item.ordinal,
    requestMethod: "GET",
    requestUrl: capture.requestUrl,
    authVisibilityProfile: AUTH_VISIBILITY_PROFILE,
    credentialsSent: false,
    redirectCount: 0,
    requestAccept: ACCEPT,
    requestAcceptEncoding: "identity",
    requestedApiVersion: API_VERSION,
    responseStatus: capture.statusCode,
    selectedApiVersion: capture.headers.selectedApiVersion,
    etag: capture.headers.etag,
    lastModified: capture.headers.lastModified,
    responseDate: capture.headers.responseDate,
    contentType: capture.headers.contentType,
    contentEncoding: capture.headers.contentEncoding,
    link: capture.headers.link,
    requestId: capture.headers.requestId,
  };
}

function captureRow(item, capture, transportClass) {
  return {
    role: item.role,
    file: item.file,
    body: { byteLength: capture.body.length, sha256: sha256(capture.body) },
    acquiredAtPublisherClock: canonicalIso(capture.acquiredAtMs),
    acquiredAtIsIndependentTime: false,
    meta: captureMeta(item, capture),
    transport: {
      requestUrl: capture.requestUrl,
      finalUrl: capture.finalUrl,
      redirected: capture.redirected,
      transportClass,
      tlsRejectUnauthorized: transportClass === LIVE_TRANSPORT_CLASS,
      tlsServername: transportClass === LIVE_TRANSPORT_CLASS
        ? "api.github.com" : null,
      requestAbsoluteDeadlineMs: REQUEST_ABSOLUTE_DEADLINE_MS,
      bracketAbsoluteDeadlineMs: BRACKET_ABSOLUTE_DEADLINE_MS,
    },
  };
}

function lifecycleReceipt({ attemptId, preflight, retentionSeconds,
  retentionUntilMs, startedAtMs, transportClass }) {
  return {
    schema: ACQUISITION_LIFECYCLE_RECEIPT_SCHEMA,
    attemptId,
    state: "INCOMPLETE",
    preflightReviewHash: preflight.review.reviewHash,
    preflightReviewFileSha256: preflight.fileSha256,
    targetProfileHash: ACQUISITION_TARGET_PROFILE_HASH,
    transportClass,
    startedAtPublisherClock: canonicalIso(startedAtMs),
    publisherClockIsIndependentTime: false,
    retentionSeconds,
    retentionUntilPublisherClock: canonicalIso(retentionUntilMs),
    purgeRequired: true,
    manifestLastRequiredForTerminalInterpretation: true,
    wholeDirectoryAtomicPublicationEstablished: false,
    independentOccurrenceWitness: false,
    externalProvenanceEstablished: false,
  };
}

function buildManifest({ attemptId, captures, completedAtMs, lifecycleBytes,
  preflight, replay, retentionSeconds, retentionUntilMs, startedAtMs,
  transportClass }) {
  const sequence = [];
  for (let index = 0; index < CAPTURE_PLAN.length; index += 1) {
    sequence[index] = captureRow(CAPTURE_PLAN[index], captures[index], transportClass);
  }
  return {
    schema: ACQUISITION_CAPTURE_MANIFEST_SCHEMA,
    transportClass,
    acquisitionAttempt: {
      attemptId,
      startedAtPublisherClock: canonicalIso(startedAtMs),
      completedAtPublisherClock: canonicalIso(completedAtMs),
      publisherClockIsIndependentTime: false,
      terminalState: "COMPLETE",
      initialLifecycleReceiptFile: ACQUISITION_LIFECYCLE_RECEIPT_FILE,
      initialLifecycleReceiptBytes: lifecycleBytes.length,
      initialLifecycleReceiptSha256: sha256(lifecycleBytes),
      retentionSeconds,
      retentionUntilPublisherClock: canonicalIso(retentionUntilMs),
      purgeRequired: true,
      manifestLastRequiredForTerminalInterpretation: true,
      wholeDirectoryAtomicPublicationEstablished: false,
    },
    preflightReviewBinding: {
      file: "preflight-review.json",
      bytes: preflight.bytes.length,
      sha256: preflight.fileSha256,
      reviewHash: preflight.review.reviewHash,
      targetProfileHash: ACQUISITION_TARGET_PROFILE_HASH,
      reviewValidatedBeforeDirectoryCreation: true,
      reviewValidatedBeforeFirstNetworkRequest: true,
      captureStartedAfterReview: true,
      localPolicyWindowSatisfiedAtStart: true,
      publisherControlFlowFactOnly: true,
      independentReviewTimingWitness: false,
    },
    captureSequence: sequence,
    controlFlowBoundary: {
      preflightValidatedBeforePrivateDirectoryCreation: true,
      preflightValidatedBeforeFirstNetworkRequest: true,
      fixedSequenceExecutedByPublisherControlFlow: true,
      finalDirectoryReservedByAtomicMkdirNoClobber: true,
      sameUserParentReplacementResistanceEstablished: false,
      independentOccurrenceWitness: false,
      publisherControlFlowFactOnly: true,
    },
    requestPolicy: {
      accept: ACCEPT,
      acceptEncoding: "identity",
      apiOrigin: "https://api.github.com",
      authVisibilityProfile: AUTH_VISIBILITY_PROFILE,
      authenticationReadOrSent: false,
      cookiesReadOrSent: false,
      contactOrMutationSideEffect: false,
      exactGetCount: 5,
      redirectFollowing: false,
      retries: 0,
      requestedApiVersion: API_VERSION,
      tlsRejectUnauthorized: transportClass === LIVE_TRANSPORT_CLASS,
      tlsServername: transportClass === LIVE_TRANSPORT_CLASS
        ? "api.github.com" : null,
      requestAbsoluteDeadlineMs: REQUEST_ABSOLUTE_DEADLINE_MS,
      bracketAbsoluteDeadlineMs: BRACKET_ABSOLUTE_DEADLINE_MS,
    },
    invariants: {
      issueByteLengthPin: 10_175,
      issueSha256Pin:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.issue.sha256,
      commentsByteLengthPin: 16_132,
      commentsSha256Pin:
        AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_SNAPSHOT_PINS.comments.sha256,
      issueBeforeMidAfterRawExact: replay.issueRawExact,
      issueBeforeMidAfterSemanticExact: replay.issueSemanticExact,
      commentsScanAAndBRawExact: replay.commentsRawExact,
      commentsScanAAndBSemanticExact: replay.commentsSemanticExact,
      fiveRequestIdsDistinct: true,
      responseDatesMonotonic: true,
      linkHeaderNullOnEveryCapture: true,
    },
    semantics: {
      commentsPage: 1,
      commentsPerPage: 100,
      commentsPageTerminalAtCapture: true,
      issueDeclaredCommentCount: 6,
      visibleCommentsCaptured: replay.visibleComments,
      uniqueVisibleCommentIds: replay.visibleComments,
      fullEditOrDeletionHistoryEstablished: false,
    },
    source: {
      sourceClass: "PROVIDER_HOSTED_USER_GENERATED_MUTABLE_SNAPSHOT",
      repository: "anthropics/claude-code",
      issueApiUrl: ISSUE_URL,
      commentsApiUrl: COMMENTS_URL,
      mutablePublicApi: true,
      revisionPinned: false,
      contentHashPinned: true,
    },
    sourceEntry: {
      bound: false,
      disposition: transportClass === LIVE_TRANSPORT_CLASS
        ? "PENDING_ACQUISITION" : "PENDING_TEST_FIXTURE",
      eligibleForPrivateStructuralReplay:
        transportClass === LIVE_TRANSPORT_CLASS,
    },
    truthBoundary: {
      localAcquisitionAttemptOnly: true,
      externalHttpOccurrenceCountEstablished: 0,
      externalProvenanceEstablished: false,
      independentOccurrenceWitnessEstablished: false,
      serverDatesRequestIdsEtagsOrTlsMetadataAreIndependentProvenance: false,
      officialIncidentSource: false,
      directParticipantConfirmation: false,
      externalOutcomeTruth: false,
      recoveryTruth: false,
      completeAttemptCensusEstablished: false,
      currentSnapshotProvesHistoricalCompleteness: false,
      reviewerIdentityVerified: false,
      reviewerAuthorityEstablished: false,
      reviewSignatureVerified: false,
      reviewBasisReplayed: false,
      reviewTimeIsIndependent: false,
      legalClearanceEstablished: false,
      redistributionPermissionEstablished: false,
      publicationPermissionEstablished: false,
      trainingPermissionEstablished: false,
      networkProjectionEmitted: false,
      networkAdmissionRows: 0,
      authorityUnits: 0,
      actionUnits: 0,
      CEU: 0,
      pricingUnits: 0,
      guaranteeUnits: 0,
      settlementUnits: 0,
      trustedVerification: "NOT_INTEGRATED",
      decisionState: "HOLD",
    },
  };
}

function verifyFinalDirectory(output, outputStat, expectedFiles) {
  assertDirectoryNode(output, outputStat, "FINAL_DIRECTORY_CHANGED");
  const names = readdirSync(output).sort();
  if (!sameStrings(names, FINAL_FILES)) {
    fail("FINAL_FILE_SET_INVALID", "CAPTURED_PRIVATE_POSTCHECK_FAILED");
  }
  for (const [file, bytes] of expectedFiles) {
    const destination = path.join(output, file);
    const status = lstatSync(destination);
    if (!status.isFile() || status.isSymbolicLink() || status.nlink !== 1
      || (status.mode & 0o777) !== 0o600 || status.size !== bytes.length
      || !sameBytes(readFileSync(destination), bytes)) {
      fail("FINAL_FILE_REPLAY_INVALID", "CAPTURED_PRIVATE_POSTCHECK_FAILED");
    }
  }
}

export async function main(argv = process.argv.slice(2), dependencies = {}) {
  let opaqueId = null;
  let captureDirectoryCreated = false;
  let manifestCommitted = false;
  try {
    const args = parseArguments(argv);
    const workspace = realpathSync(process.cwd());
    const testContext = validateDependencies(dependencies);
    const paths = validateOutputPath(workspace, args.output, testContext);
    opaqueId = paths.snapshotId;

    // The exact external review is fully replayed before any private directory
    // creation and before the first network request.
    const preflightReadRoot = testContext === null ? workspace : testContext.testRoot;
    const preflight = validatePreflight(preflightReadRoot, args.preflightReview);
    if (LIVE_ACQUISITION_ENABLED !== true) {
      fail("PURGE_LIFECYCLE_NOT_INTEGRATED_FAIL_CLOSED");
    }
    const rootStat = verifyIgnoredPrivateRoot(
      workspace, paths.privateRoot, paths.testTransport,
    );
    assertDirectoryNode(paths.privateRoot, rootStat, "PRIVATE_ROOT_CHANGED");

    const transportClass = testContext === null
      ? LIVE_TRANSPORT_CLASS : TEST_TRANSPORT_CLASS;
    const attemptId = `acq_${randomBytes(16).toString("hex")}`;
    if (!ACQUISITION_ATTEMPT_ID.test(attemptId)
      || attemptId === "acq_00000000000000000000000000000000") {
      fail("ATTEMPT_ID_INVALID");
    }
    const startedAtMs = Date.now();
    if (startedAtMs < preflight.reviewedAtMs
      || startedAtMs > preflight.validThroughMs) {
      fail("PREFLIGHT_WINDOW_CLOSED_BEFORE_CAPTURE_DIRECTORY");
    }
    const retentionSeconds = preflight.review.acquisitionScope.retentionSeconds;
    const retentionUntilMs = startedAtMs + (retentionSeconds * 1_000);
    const lifecycle = lifecycleReceipt({ attemptId, preflight, retentionSeconds,
      retentionUntilMs, startedAtMs, transportClass });
    const lifecycleBytes = canonicalBytes(lifecycle);

    // mkdir is the no-clobber reservation. The opaque final directory can be
    // present while incomplete; only a valid manifest written last gives it a
    // COMPLETE interpretation. No whole-directory atomic publish is claimed.
    const outputStat = createPrivateDirectory(paths.output);
    captureDirectoryCreated = true;
    fsyncDirectory(paths.privateRoot);

    // Immutable INCOMPLETE lifecycle receipt is deliberately the first file.
    durableWritePrivate(paths.output, outputStat,
      ACQUISITION_LIFECYCLE_RECEIPT_FILE, lifecycleBytes);
    // Preserve the exact pre-GET review bytes beside the capture.
    durableWritePrivate(paths.output, outputStat,
      "preflight-review.json", preflight.bytes);

    const bracketDeadlineMs = Math.min(
      startedAtMs + BRACKET_ABSOLUTE_DEADLINE_MS,
      preflight.validThroughMs,
    );
    const captures = [];
    for (let index = 0; index < CAPTURE_PLAN.length; index += 1) {
      if (Date.now() > bracketDeadlineMs) {
        fail("BRACKET_ABSOLUTE_DEADLINE_EXCEEDED",
          "INCOMPLETE_PRIVATE_STAGING_RETAINED");
      }
      const item = CAPTURE_PLAN[index];
      const captured = testContext === null
        ? await acquireLive(item, bracketDeadlineMs)
        : normalizeInjectedCapture(item, await withInjectedDeadline(
          testContext.transport, item, bracketDeadlineMs,
        ));
      if (captured.acquiredAtMs < preflight.reviewedAtMs
        || captured.acquiredAtMs > preflight.validThroughMs
        || captured.acquiredAtMs > bracketDeadlineMs) {
        fail("CAPTURE_OUTSIDE_DEADLINE_OR_REVIEW_WINDOW",
          "INCOMPLETE_PRIVATE_STAGING_RETAINED");
      }
      captures[index] = captured;
    }
    const replay = validateBracket(captures, preflight);

    // No raw body is durably written until the complete five-response bracket
    // has passed pins, semantics, order, date, request-id and equality checks.
    for (let index = 0; index < CAPTURE_PLAN.length; index += 1) {
      durableWritePrivate(paths.output, outputStat,
        CAPTURE_PLAN[index].file, captures[index].body);
    }
    const completedAtMs = Date.now();
    if (completedAtMs < startedAtMs || completedAtMs > preflight.validThroughMs
      || completedAtMs > retentionUntilMs) {
      fail("COMPLETION_OUTSIDE_PREFLIGHT_WINDOW",
        "INCOMPLETE_PRIVATE_STAGING_RETAINED");
    }
    const manifest = buildManifest({ attemptId, captures, completedAtMs,
      lifecycleBytes, preflight, replay, retentionSeconds, retentionUntilMs,
      startedAtMs, transportClass });
    const manifestBytes = canonicalBytes(manifest);

    // The capture manifest is the final file write.  The immutable receipt
    // always remains INCOMPLETE; only the directory/bundle interpretation can
    // become COMPLETE through manifest-last in the atomically reserved dir.
    durableWritePrivate(paths.output, outputStat,
      "capture-manifest.json", manifestBytes);
    manifestCommitted = true;
    fsyncDirectory(paths.output);
    assertDirectoryNode(paths.privateRoot, rootStat, "PRIVATE_ROOT_CHANGED");
    fsyncDirectory(paths.privateRoot);
    const finalOutputStat = statPrivateDirectory(
      paths.output, "FINAL_DIRECTORY_UNSAFE",
    );
    if (!sameNode(finalOutputStat, outputStat)) {
      fail("FINAL_DIRECTORY_NODE_MISMATCH", "CAPTURED_PRIVATE_POSTCHECK_FAILED");
    }
    const expectedFiles = new Map([
      [ACQUISITION_LIFECYCLE_RECEIPT_FILE, lifecycleBytes],
      ["preflight-review.json", preflight.bytes],
      ...CAPTURE_PLAN.map((item, index) => [item.file, captures[index].body]),
      ["capture-manifest.json", manifestBytes],
    ]);
    verifyFinalDirectory(paths.output, finalOutputStat, expectedFiles);

    const result = Object.freeze({
      status: paths.testTransport ? "PENDING_TEST_FIXTURE" : "PRIVATE_CAPTURED_HOLD",
      opaqueId,
      eligibleForPrivateStructuralReplay: !paths.testTransport,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return result;
  } catch (error) {
    const safeError = error instanceof Error
      && String(error.message).startsWith(
        "AUTONOMOUS_WORK_ORDER_GITHUB_DISCOVERY_ACQUIRE_")
      ? error
      : captureError("UNEXPECTED_LOCAL_OR_TRANSPORT_FAILURE",
        captureDirectoryCreated
          ? (manifestCommitted ? "CAPTURED_PRIVATE_POSTCHECK_FAILED"
            : "INCOMPLETE_PRIVATE_STAGING_RETAINED")
          : "REJECTED_BEFORE_NETWORK");
    Object.defineProperty(safeError, "opaqueId", {
      value: opaqueId, configurable: true,
    });
    if (!Object.hasOwn(safeError, "captureFailurePhase")) {
      Object.defineProperty(safeError, "captureFailurePhase", {
        value: captureDirectoryCreated
          ? (manifestCommitted ? "CAPTURED_PRIVATE_POSTCHECK_FAILED"
            : "INCOMPLETE_PRIVATE_STAGING_RETAINED")
          : "REJECTED_BEFORE_NETWORK",
      });
    }
    throw safeError;
  }
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    const status = typeof error?.captureFailurePhase === "string"
      ? error.captureFailurePhase : "REJECTED_BEFORE_NETWORK";
    const result = error?.opaqueId === null || error?.opaqueId === undefined
      ? { status } : { status, opaqueId: error.opaqueId };
    process.stdout.write(`${JSON.stringify(result)}\n`);
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
