#!/usr/bin/env node

/*
 * Offline only. Exact gateway pages stay in caller-owned private files. Build
 * happens in a private sibling staging directory, is replayed from disk, and
 * is published through an exclusive directory claim. The local completion
 * marker is both written and published last. Its absence makes every partial
 * target fail closed; it is not an external receipt, timestamp, WORM claim, or
 * non-omission proof.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, fsyncSync, linkSync, lstatSync, mkdirSync,
  mkdtempSync, openSync, readFileSync, readdirSync, rmdirSync, unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  NETWORK_LIFECYCLE_HEAD_SCHEMAS,
  NETWORK_LIFECYCLE_HEAD_USE_BOUNDARY,
  assertNetworkLifecycleAnchorOutboxRequest,
  assertNetworkLifecycleHeadCheckpoint,
  createNetworkLifecycleAnchorOutboxRequest,
  createNetworkLifecycleHeadCheckpoint,
  verifyNetworkLifecycleHeadCheckpoint,
} from "../src/outsider-network-lifecycle-head-checkpoint.js";

const MAX_PRIVATE_FILE_BYTES = 256 * 1024 * 1024;
const ARTIFACT_NAMES = Object.freeze([
  "anchor-outbox-request.json",
  "checkpoint.json",
  "verification.json",
]);
const COMPLETE_NAME = "complete.json";
const COMPLETE_SCHEMA = "outsider/network-lifecycle-head-directory-complete/v1";
const DIRECTORY_VERIFICATION_SCHEMA
  = "outsider/network-lifecycle-head-directory-verification/v1";

function usage() {
  return [
    "Usage:",
    "  node scripts/network-lifecycle-head-checkpoint.mjs \\",
    "    --page <exact-export-page.json> [--page <next-page.json> ...] \\",
    "    --created-at <canonical-UTC-ISO> --out-dir <new-private-directory>",
    "  node scripts/network-lifecycle-head-checkpoint.mjs verify-dir \\",
    "    --dir <completed-private-directory>",
    "",
    "No network request or provider submission is performed.",
  ].join("\n");
}

function parseArgs(argv) {
  if (argv[0] === "verify-dir") {
    if (argv.length !== 3 || argv[1] !== "--dir") throw new Error("ARGUMENT_INVALID");
    return { mode: "verify", directory: argv[2] };
  }
  const result = { mode: "build", pages: [], createdAt: null, outDir: null };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help") return { mode: "help" };
    if (!["--page", "--created-at", "--out-dir"].includes(flag)
      || index + 1 >= argv.length) throw new Error("ARGUMENT_INVALID");
    const value = argv[index += 1];
    if (flag === "--page") result.pages.push(value);
    else if (flag === "--created-at" && result.createdAt === null) result.createdAt = value;
    else if (flag === "--out-dir" && result.outDir === null) result.outDir = value;
    else throw new Error("ARGUMENT_DUPLICATE");
  }
  if (result.pages.length < 1 || result.createdAt === null || result.outDir === null) {
    throw new Error("ARGUMENT_REQUIRED");
  }
  return result;
}

function sameFileStat(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.mode === right.mode && left.nlink === right.nlink;
}

function sameDirectoryIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode;
}

function privateDirectoryStat(input, code) {
  let stat;
  try { stat = lstatSync(input, { bigint: true }); }
  catch { throw new Error(`${code}_MISSING`); }
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || (Number(stat.mode) & 0o777) !== 0o700) throw new Error(`${code}_INVALID`);
  return stat;
}

function readPrivateRegularFile(input, code = "SOURCE_PAGE") {
  const target = path.resolve(input);
  let beforePath;
  try { beforePath = lstatSync(target, { bigint: true }); }
  catch { throw new Error(`${code}_MISSING`); }
  if (!beforePath.isFile() || beforePath.isSymbolicLink()
    || (Number(beforePath.mode) & 0o777) !== 0o600 || beforePath.nlink !== 1n
    || beforePath.size < 3n || beforePath.size > BigInt(MAX_PRIVATE_FILE_BYTES)) {
    throw new Error(`${code}_PRIVATE_REGULAR_FILE_REQUIRED`);
  }
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  let descriptor;
  try {
    descriptor = openSync(target, flags);
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.nlink !== 1n || !sameFileStat(beforePath, before)) {
      throw new Error(`${code}_CHANGED_BEFORE_READ`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!sameFileStat(before, after) || BigInt(bytes.length) !== before.size) {
      throw new Error(`${code}_CHANGED_DURING_READ`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function fsyncDirectory(directory, { expectedIdentity = null, requiredMode = null } = {}) {
  const flags = constants.O_RDONLY | (constants.O_DIRECTORY ?? 0)
    | (constants.O_NOFOLLOW ?? 0);
  let descriptor;
  try {
    descriptor = openSync(directory, flags);
    const opened = fstatSync(descriptor, { bigint: true });
    if (!opened.isDirectory()
      || requiredMode !== null && (Number(opened.mode) & 0o777) !== requiredMode
      || expectedIdentity !== null && !sameDirectoryIdentity(opened, expectedIdentity)) {
      throw new Error("DIRECTORY_IDENTITY_CHANGED");
    }
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function outputLocation(input) {
  const target = path.resolve(input);
  const parent = path.dirname(target);
  const basename = path.basename(target);
  if (target === parent || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(basename)) {
    throw new Error("OUTPUT_DIRECTORY_NAME_INVALID");
  }
  const parentStat = lstatSync(parent, { bigint: true });
  if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
    throw new Error("OUTPUT_PARENT_REAL_DIRECTORY_REQUIRED");
  }
  return { target, parent, basename, parentStat };
}

function createPrivateStagingDirectory(location) {
  const staging = mkdtempSync(path.join(location.parent, `.${location.basename}.staging-`));
  const stat = privateDirectoryStat(staging, "STAGING_DIRECTORY");
  fsyncDirectory(staging, { expectedIdentity: stat, requiredMode: 0o700 });
  return { staging, stat };
}

function claimPrivateOutputDirectory(location) {
  try { mkdirSync(location.target, { mode: 0o700 }); }
  catch (error) {
    if (error?.code === "EEXIST") throw new Error("OUTPUT_DIRECTORY_EXISTS");
    throw error;
  }
  const claimed = privateDirectoryStat(location.target, "OUTPUT_DIRECTORY");
  fsyncDirectory(location.target, { expectedIdentity: claimed, requiredMode: 0o700 });
  return claimed;
}

function writePrivateJson(directory, name, value) {
  const target = path.join(directory, name);
  const flags = constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
    | (constants.O_NOFOLLOW ?? 0);
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(target, flags, 0o600);
    writeFileSync(descriptor, bytes);
    fsyncSync(descriptor);
    const written = fstatSync(descriptor, { bigint: true });
    if (!written.isFile() || written.nlink !== 1n || written.size !== BigInt(bytes.length)
      || (Number(written.mode) & 0o777) !== 0o600) throw new Error("OUTPUT_FILE_INVALID");
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return { target, bytes };
}

function byteHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function lifecycleHash(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:network-lifecycle-head:${domain}:v1\0${canonicalizeStrict(value)}`)
    .digest("hex")}`;
}

function directoryHash(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:network-lifecycle-head-directory:${domain}:v1\0`
      + canonicalizeStrict(value))
    .digest("hex")}`;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).sort().join("\0") !== [...fields].sort().join("\0")) {
    throw new Error(`${code}_SHAPE_INVALID`);
  }
}

function parsePrivateCanonicalJson(bytes, code) {
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes)) throw new Error(`${code}_UTF8_INVALID`);
  let value;
  try { value = JSON.parse(text); }
  catch { throw new Error(`${code}_JSON_INVALID`); }
  if (`${canonicalizeStrict(value)}\n` !== text) throw new Error(`${code}_NOT_CANONICAL`);
  return value;
}

function assertStoredVerification(value, checkpoint, outboxRequest) {
  exactObject(value, ["schema", "checkpointHash", "outboxRequestHash",
    "callerPinnedCheckpointHash", "registryId", "eventCount", "tailHash", "exportSetRoot",
    "source", "localChecks", "limitations", "useBoundary", "verificationHash"],
  "VERIFICATION");
  const { verificationHash, ...body } = value;
  if (body.schema !== NETWORK_LIFECYCLE_HEAD_SCHEMAS.verification
    || body.checkpointHash !== checkpoint.checkpointHash
    || body.outboxRequestHash !== outboxRequest.requestHash
    || body.callerPinnedCheckpointHash !== checkpoint.checkpointHash
    || body.registryId !== checkpoint.registryId || body.eventCount !== checkpoint.eventCount
    || body.tailHash !== checkpoint.tailHash || body.exportSetRoot !== checkpoint.exportSetRoot
    || canonicalizeStrict(body.useBoundary)
      !== canonicalizeStrict(NETWORK_LIFECYCLE_HEAD_USE_BOUNDARY)
    || lifecycleHash("verification", body) !== verificationHash) {
    throw new Error("VERIFICATION_INVALID");
  }
  exactObject(body.localChecks, ["eventOrdinalsAndPreviousHashesReplayed",
    "eventHashesRecomputed", "lifecycleTransitionsReplayed",
    "paginationCursorsAndTailReplayed", "exactExportSetRootRecomputed",
    "checkpointMatchedCallerPinAndSource", "outboxDigestOnlyBindingRecomputed"],
  "VERIFICATION_LOCAL_CHECKS");
  if (Object.values(body.localChecks).some((claim) => claim !== true)) {
    throw new Error("VERIFICATION_LOCAL_CHECK_INVALID");
  }
  exactObject(body.limitations, ["localCheckpointOnly", "selfSignaturePresent",
    "externalAnchorEstablished", "independentWitnessEstablished", "wormStorageEstablished",
    "nonOmissionProofEstablished", "serverNonEquivocationEstablished",
    "serverCompletenessEstablished", "generatedAtIsExternalTimeEvidence",
    "derivedLedgerAuditIndependentlyReplayed", "providerReceiptPresent",
    "callerPinIsNotExternalEvidence"], "VERIFICATION_LIMITATIONS");
  const expectedLimitations = {
    localCheckpointOnly: true,
    selfSignaturePresent: false,
    externalAnchorEstablished: false,
    independentWitnessEstablished: false,
    wormStorageEstablished: false,
    nonOmissionProofEstablished: false,
    serverNonEquivocationEstablished: false,
    serverCompletenessEstablished: false,
    generatedAtIsExternalTimeEvidence: false,
    derivedLedgerAuditIndependentlyReplayed: false,
    providerReceiptPresent: false,
    callerPinIsNotExternalEvidence: true,
  };
  if (canonicalizeStrict(body.limitations) !== canonicalizeStrict(expectedLimitations)) {
    throw new Error("VERIFICATION_LIMITATION_INVALID");
  }
}

function artifactContentHash(name, value) {
  if (name === "checkpoint.json") return value.checkpointHash;
  if (name === "anchor-outbox-request.json") return value.requestHash;
  return value.verificationHash;
}

function artifactDescriptors(directory) {
  const descriptors = [];
  const values = {};
  for (const name of ARTIFACT_NAMES) {
    const bytes = readPrivateRegularFile(path.join(directory, name), "ARTIFACT_FILE");
    const value = parsePrivateCanonicalJson(bytes, "ARTIFACT_FILE");
    descriptors.push({ name, byteLength: bytes.length, fileHash: byteHash(bytes),
      contentHash: artifactContentHash(name, value) });
    values[name] = value;
  }
  return { descriptors, values };
}

function assertArtifactValues(values) {
  const checkpoint = assertNetworkLifecycleHeadCheckpoint(values["checkpoint.json"]);
  const outboxRequest = assertNetworkLifecycleAnchorOutboxRequest(
    values["anchor-outbox-request.json"], { checkpoint });
  assertStoredVerification(values["verification.json"], checkpoint, outboxRequest);
  return { checkpoint, outboxRequest, verification: values["verification.json"] };
}

function completionMarker(descriptors, artifacts) {
  const body = {
    schema: COMPLETE_SCHEMA,
    files: descriptors,
    checkpointHash: artifacts.checkpoint.checkpointHash,
    outboxRequestHash: artifacts.outboxRequest.requestHash,
    verificationHash: artifacts.verification.verificationHash,
    createdAt: artifacts.checkpoint.createdAt,
    localDirectoryCompletionOnly: true,
    sourceReplayReportedBeforePublication: true,
    sourcePagesStored: false,
    providerReceiptPresent: false,
    externalAnchorEstablished: false,
    independentWitnessEstablished: false,
    wormStorageEstablished: false,
    nonOmissionProofEstablished: false,
    networkSubmissionPerformed: false,
    useBoundary: NETWORK_LIFECYCLE_HEAD_USE_BOUNDARY,
  };
  return { ...body, completionHash: directoryHash("completion", body) };
}

function assertCompletionMarker(marker, descriptors, artifacts) {
  exactObject(marker, ["schema", "files", "checkpointHash", "outboxRequestHash",
    "verificationHash", "createdAt", "localDirectoryCompletionOnly",
    "sourceReplayReportedBeforePublication", "sourcePagesStored", "providerReceiptPresent",
    "externalAnchorEstablished", "independentWitnessEstablished", "wormStorageEstablished",
    "nonOmissionProofEstablished", "networkSubmissionPerformed", "useBoundary",
    "completionHash"], "COMPLETE_MARKER");
  const { completionHash, ...body } = marker;
  if (body.schema !== COMPLETE_SCHEMA
    || canonicalizeStrict(body.files) !== canonicalizeStrict(descriptors)
    || body.checkpointHash !== artifacts.checkpoint.checkpointHash
    || body.outboxRequestHash !== artifacts.outboxRequest.requestHash
    || body.verificationHash !== artifacts.verification.verificationHash
    || body.createdAt !== artifacts.checkpoint.createdAt
    || body.localDirectoryCompletionOnly !== true
    || body.sourceReplayReportedBeforePublication !== true
    || body.sourcePagesStored !== false || body.providerReceiptPresent !== false
    || body.externalAnchorEstablished !== false
    || body.independentWitnessEstablished !== false || body.wormStorageEstablished !== false
    || body.nonOmissionProofEstablished !== false || body.networkSubmissionPerformed !== false
    || canonicalizeStrict(body.useBoundary)
      !== canonicalizeStrict(NETWORK_LIFECYCLE_HEAD_USE_BOUNDARY)
    || completionHash !== directoryHash("completion", body)) {
    throw new Error("COMPLETE_MARKER_INVALID");
  }
}

export function verifyNetworkLifecycleCheckpointDirectory(input) {
  const directory = path.resolve(input);
  const before = privateDirectoryStat(directory, "CHECKPOINT_DIRECTORY");
  const names = readdirSync(directory).sort();
  const expectedNames = [...ARTIFACT_NAMES, COMPLETE_NAME].sort();
  if (canonicalizeStrict(names) !== canonicalizeStrict(expectedNames)) {
    throw new Error("CHECKPOINT_DIRECTORY_INCOMPLETE");
  }
  const { descriptors, values } = artifactDescriptors(directory);
  const artifacts = assertArtifactValues(values);
  const markerBytes = readPrivateRegularFile(path.join(directory, COMPLETE_NAME),
    "COMPLETE_MARKER");
  const marker = parsePrivateCanonicalJson(markerBytes, "COMPLETE_MARKER");
  assertCompletionMarker(marker, descriptors, artifacts);
  const after = privateDirectoryStat(directory, "CHECKPOINT_DIRECTORY");
  if (!sameDirectoryIdentity(before, after) || before.mtimeNs !== after.mtimeNs
    || before.nlink !== after.nlink) throw new Error("CHECKPOINT_DIRECTORY_CHANGED_DURING_VERIFY");
  const body = {
    schema: DIRECTORY_VERIFICATION_SCHEMA,
    directory,
    directoryComplete: true,
    completionHash: marker.completionHash,
    checkpointHash: artifacts.checkpoint.checkpointHash,
    outboxRequestHash: artifacts.outboxRequest.requestHash,
    verificationHash: artifacts.verification.verificationHash,
    sourceReplayReperformed: false,
    localDirectoryCompletionOnly: true,
    providerReceiptPresent: false,
    externalAnchorEstablished: false,
    independentWitnessEstablished: false,
    wormStorageEstablished: false,
    nonOmissionProofEstablished: false,
    networkSubmissionPerformed: false,
    useBoundary: NETWORK_LIFECYCLE_HEAD_USE_BOUNDARY,
  };
  return { ...body, directoryVerificationHash:
    directoryHash("verification", body) };
}

function replayStagedArtifacts(staging, exportPageBytes, expected) {
  const { descriptors, values } = artifactDescriptors(staging);
  const artifacts = assertArtifactValues(values);
  if (canonicalizeStrict(artifacts.checkpoint) !== canonicalizeStrict(expected.checkpoint)
    || canonicalizeStrict(artifacts.outboxRequest) !== canonicalizeStrict(expected.outboxRequest)
    || canonicalizeStrict(artifacts.verification) !== canonicalizeStrict(expected.verification)) {
    throw new Error("STAGING_ARTIFACT_REPLAY_MISMATCH");
  }
  const replayed = verifyNetworkLifecycleHeadCheckpoint({ exportPageBytes,
    checkpoint: artifacts.checkpoint, outboxRequest: artifacts.outboxRequest,
    expectedCheckpointHash: artifacts.checkpoint.checkpointHash });
  if (canonicalizeStrict(replayed) !== canonicalizeStrict(artifacts.verification)) {
    throw new Error("STAGING_SOURCE_REPLAY_MISMATCH");
  }
  return { descriptors, artifacts };
}

function publishFileNoClobber(staging, target, name) {
  const source = path.join(staging, name);
  const destination = path.join(target, name);
  const before = lstatSync(source, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
    || (Number(before.mode) & 0o777) !== 0o600) throw new Error("STAGING_FILE_INVALID");
  linkSync(source, destination);
  const linked = lstatSync(destination, { bigint: true });
  if (!linked.isFile() || linked.dev !== before.dev || linked.ino !== before.ino
    || linked.nlink !== 2n) throw new Error("PUBLISHED_FILE_LINK_INVALID");
  unlinkSync(source);
  const published = lstatSync(destination, { bigint: true });
  if (published.dev !== before.dev || published.ino !== before.ino || published.nlink !== 1n) {
    throw new Error("PUBLISHED_FILE_IDENTITY_INVALID");
  }
}

export function buildNetworkLifecycleCheckpointDirectory({ pageFiles, createdAt, outDir,
  beforeClaim = null } = {}) {
  if (!Array.isArray(pageFiles) || pageFiles.length < 1
    || beforeClaim !== null && typeof beforeClaim !== "function") {
    throw new Error("BUILD_OPTIONS_INVALID");
  }
  const exportPageBytes = pageFiles.map((file) => readPrivateRegularFile(file));
  const checkpoint = createNetworkLifecycleHeadCheckpoint({ exportPageBytes, createdAt });
  const outboxRequest = createNetworkLifecycleAnchorOutboxRequest({ checkpoint });
  const verification = verifyNetworkLifecycleHeadCheckpoint({ exportPageBytes, checkpoint,
    outboxRequest, expectedCheckpointHash: checkpoint.checkpointHash });
  const expected = { checkpoint, outboxRequest, verification };
  const location = outputLocation(outDir);
  const { staging, stat: stagingIdentity } = createPrivateStagingDirectory(location);
  writePrivateJson(staging, "checkpoint.json", checkpoint);
  writePrivateJson(staging, "anchor-outbox-request.json", outboxRequest);
  writePrivateJson(staging, "verification.json", verification);
  fsyncDirectory(staging, { expectedIdentity: stagingIdentity, requiredMode: 0o700 });
  const replayed = replayStagedArtifacts(staging, exportPageBytes, expected);
  const marker = completionMarker(replayed.descriptors, replayed.artifacts);
  writePrivateJson(staging, COMPLETE_NAME, marker);
  fsyncDirectory(staging, { expectedIdentity: stagingIdentity, requiredMode: 0o700 });
  const stagedVerification = verifyNetworkLifecycleCheckpointDirectory(staging);

  if (beforeClaim !== null) beforeClaim({ targetDirectory: location.target,
    stagingDirectory: staging });
  const preClaimVerification = verifyNetworkLifecycleCheckpointDirectory(staging);
  if (preClaimVerification.directoryVerificationHash
    !== stagedVerification.directoryVerificationHash) {
    throw new Error("STAGING_CHANGED_BEFORE_CLAIM");
  }
  const targetIdentity = claimPrivateOutputDirectory(location);
  fsyncDirectory(location.parent, { expectedIdentity: location.parentStat });
  for (const name of ARTIFACT_NAMES) publishFileNoClobber(staging, location.target, name);
  fsyncDirectory(location.target, { expectedIdentity: targetIdentity, requiredMode: 0o700 });
  /* A verifier must never accept the target before this final publication. */
  publishFileNoClobber(staging, location.target, COMPLETE_NAME);
  fsyncDirectory(location.target, { expectedIdentity: targetIdentity, requiredMode: 0o700 });
  const directoryVerification = verifyNetworkLifecycleCheckpointDirectory(location.target);
  fsyncDirectory(staging, { expectedIdentity: stagingIdentity, requiredMode: 0o700 });
  rmdirSync(staging);
  fsyncDirectory(location.parent, { expectedIdentity: location.parentStat });
  return { directory: location.target, checkpoint, outboxRequest, verification,
    marker, directoryVerification };
}

function buildResult(result) {
  return {
    schema: "outsider/network-lifecycle-head-checkpoint-cli-result/v1",
    directory: result.directory,
    pageCount: result.verification.source.pageCount,
    exactByteCount: result.verification.source.exactByteCount,
    eventCount: result.checkpoint.eventCount,
    tailHash: result.checkpoint.tailHash,
    exportSetRoot: result.checkpoint.exportSetRoot,
    checkpointHash: result.checkpoint.checkpointHash,
    outboxRequestHash: result.outboxRequest.requestHash,
    verificationHash: result.verification.verificationHash,
    completionHash: result.marker.completionHash,
    directoryVerificationHash: result.directoryVerification.directoryVerificationHash,
    networkSubmissionPerformed: false,
    externalAnchorEstablished: false,
  };
}

function main() {
  process.umask(0o077);
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "help") {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const result = options.mode === "verify"
    ? verifyNetworkLifecycleCheckpointDirectory(options.directory)
    : buildResult(buildNetworkLifecycleCheckpointDirectory({ pageFiles: options.pages,
      createdAt: options.createdAt, outDir: options.outDir }));
  process.stdout.write(`${canonicalizeStrict(result)}\n`);
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) {
  try { main(); }
  catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n${usage()}\n`);
    process.exitCode = 1;
  }
}
