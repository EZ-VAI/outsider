/*
 * Stage 0 evidence-chain routing manifest.
 *
 * This file does not make a self-sealed pointer authoritative.  The pointer
 * is accepted only when its exact old/new byte inventories still match and
 * the current DROID, Stage 1 registry, and empirical ledger all replay from
 * their pinned source bytes.  It grants no action, training, pricing, or
 * economic authority.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, fstatSync, lstatSync, mkdirSync,
  mkdtempSync, openSync, readSync, readdirSync, realpathSync, rmSync, writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyKnownPublicCorpusRegistrySources,
  verifyPublicAgentWave3MetadataCorpusRegistrySource,
} from "./outsider-corpus-registry-intake.js";
import { verifyDroid100PilotArtifactDirectory } from
  "./outsider-droid100-pilot-artifacts.js";
import { replayEmpiricalFactorLedger } from "./outsider-empirical-factor-ledger.js";

/* Capture the intrinsics used by this trust-routing boundary at import time.
 * A same-process caller may replace ambient globals after import; exact byte
 * inventory and self-seal verification must not silently adopt them. */
const uncurryThis = (method) => Function.prototype.call.bind(method);
const ArrayConstructor = Array;
const ArrayPop = uncurryThis(Array.prototype.pop);
const ArrayPush = uncurryThis(Array.prototype.push);
const ArraySort = uncurryThis(Array.prototype.sort);
const BufferAlloc = Buffer.alloc;
const BufferIsBuffer = Buffer.isBuffer;
const BufferSubarray = uncurryThis(Buffer.prototype.subarray);
const BufferToString = uncurryThis(Buffer.prototype.toString);
const CryptoHashPrototype = Object.getPrototypeOf(createHash("sha256"));
const CryptoHashUpdate = uncurryThis(CryptoHashPrototype.update);
const CryptoHashDigest = uncurryThis(CryptoHashPrototype.digest);
const DateConstructor = Date;
const DateToISOString = uncurryThis(Date.prototype.toISOString);
const ErrorConstructor = Error;
const JSONParse = JSON.parse;
const MapConstructor = Map;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectFreeze = Object.freeze;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = uncurryThis(RegExp.prototype.test);
const StatsPrototype = Object.getPrototypeOf(lstatSync(fileURLToPath(import.meta.url)));
const StatsIsDirectory = uncurryThis(StatsPrototype.isDirectory);
const StatsIsFile = uncurryThis(StatsPrototype.isFile);
const StatsIsSymbolicLink = uncurryThis(StatsPrototype.isSymbolicLink);
const StringConstructor = String;
const StringIncludes = uncurryThis(String.prototype.includes);
const StringLocaleCompare = uncurryThis(String.prototype.localeCompare);
const StringStartsWith = uncurryThis(String.prototype.startsWith);
const PathDirname = path.dirname;
const PathIsAbsolute = path.isAbsolute;
const PathJoin = path.join;
const PathRelative = path.relative;
const PathResolve = path.resolve;
const PathSeparator = path.sep;
const SystemTemporaryDirectory = realpathSync(tmpdir());
const READ_ONLY_NOFOLLOW_FLAGS = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
const READ_ONLY_DIRECTORY_NOFOLLOW_FLAGS = READ_ONLY_NOFOLLOW_FLAGS
  | (constants.O_DIRECTORY ?? 0);
const MAX_MANIFEST_BYTES = 256 * 1024;

export const STAGE0_EVIDENCE_CHAIN_SCHEMA =
  "outsider/stage0-evidence-chain-current/v3";

const REPOSITORY_ROOT = PathResolve(PathDirname(fileURLToPath(import.meta.url)), "..");
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const MAX_DIRECTORY_FILES = 64;
const MAX_SNAPSHOT_FILE_BYTES = 256 * 1024 * 1024;
const MAX_SNAPSHOT_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_SNAPSHOT_FILES = 512;
const SNAPSHOT_COPY_CHUNK_BYTES = 1024 * 1024;
const DROID_SOURCE_OBJECTS = ObjectFreeze([
  ObjectFreeze({ name: "gcs-objects.json", key: "objectListBytes",
    maximumBytes: 2 * 1024 * 1024 }),
  ObjectFreeze({ name: "dataset_info.json", key: "datasetInfoBytes",
    maximumBytes: 2 * 1024 * 1024 }),
  ObjectFreeze({ name: "features.json", key: "featureBytes",
    maximumBytes: 4 * 1024 * 1024 }),
  ObjectFreeze({ name: "r2d2_faceblur-train.tfrecord-00000-of-00031", key: "shardBytes",
    maximumBytes: 128 * 1024 * 1024 }),
]);

export const STAGE0_EVIDENCE_CURRENT_PATHS = ObjectFreeze({
  manifest:
    "artifacts/stage0-evidence-chain-current-20260902/final-v4/manifest.json",
  droidArtifact:
    "artifacts/curate-droid100-20260902/real-pilot-v7-scoped-canonical-replay",
  stage1Registry:
    "artifacts/stage1-curate-corpus-registry-all-evidence-v6-scoped-replay-20260902",
  empiricalLedger:
    "artifacts/empirical-factor-ledger-v6-scoped-replay-20260902/ledger.json",
  nhtsaReplayAt: "2026-09-02T14:20:08.000Z",
});

export const STAGE0_EVIDENCE_SUPERSEDED_PATHS = ObjectFreeze({
  droidArtifact:
    "artifacts/curate-droid100-20260902/real-pilot-v7-scoped-canonical-replay",
  stage1Registry:
    "artifacts/stage1-curate-corpus-registry-all-evidence-v6-scoped-replay-20260902",
  empiricalLedger:
    "artifacts/empirical-factor-ledger-v6-scoped-replay-20260902/ledger.json",
});

const PREDECESSOR_MANIFEST_PATH =
  "artifacts/stage0-evidence-chain-current-20260902/final-v3/manifest.json";
const PREDECESSOR_MANIFEST_RECEIPT = ObjectFreeze({
  repositoryRelativePath: PREDECESSOR_MANIFEST_PATH,
  bytes: 14_085,
  fileSha256:
    "sha256:5ee8904cec84bb1df78574592abcbcedc4ad3b2ec06c4afd6de430e1cb33f6e9",
  manifestHash:
    "sha256:337254904893f9380a7a276b0aca46c7638ac743788e6f44d386d5cbb9ed74fb",
});
const PRIOR_PREDECESSOR_MANIFEST_PATH =
  "artifacts/stage0-evidence-chain-current-20260902/final-v2/manifest.json";
const PRIOR_PREDECESSOR_MANIFEST_RECEIPT = ObjectFreeze({
  repositoryRelativePath: PRIOR_PREDECESSOR_MANIFEST_PATH,
  bytes: 13_218,
  fileSha256:
    "sha256:84defcd0098df9870d7da96f34a21d73d2387f0bfa8a23b82e4b851805b23223",
  manifestHash:
    "sha256:2e1f34bcf3354cdfe32ee6607b95be28960ccf22e85b89ccb6cb5908b9ef72b1",
});

const SOURCE_PATHS = ObjectFreeze({
  droidSource: "artifacts/curate-droid100-20260819/source",
  publicAgentArtifact: "artifacts/public-agent-corpus-20260820",
  wave2Source: "artifacts/public-agent-wave2-20260821/source",
  wave3Source: "artifacts/public-agent-wave3-20260821/source/cuarewardbench",
  wave4Source: "artifacts/public-agent-wave4-20260821/source/agentrx-tau",
  roboticsSource: "artifacts/curate-public-robotics-20260820/source",
  botFailsSource: "artifacts/curate-public-robotics-20260820/source/botfails",
  ur5Source: "artifacts/curate-public-robotics-20260820/source/ur5fail-execution",
  nhtsaCsv: "artifacts/stage2-source-20260820/nhtsa-sgo-ads-20260820.csv",
  nhtsaDictionary:
    "artifacts/stage2-source-20260820/nhtsa-sgo-data-dictionary-20260820.pdf",
  wave3LedgerSource: "artifacts/public-agent-wave3-20260821/source/cuarewardbench",
});

const SNAPSHOT_INPUTS = ObjectFreeze([
  ObjectFreeze({ kind: "directory", repositoryRelativePath:
    STAGE0_EVIDENCE_CURRENT_PATHS.droidArtifact }),
  ObjectFreeze({ kind: "directory", repositoryRelativePath:
    STAGE0_EVIDENCE_CURRENT_PATHS.stage1Registry }),
  ObjectFreeze({ kind: "file", repositoryRelativePath:
    STAGE0_EVIDENCE_CURRENT_PATHS.empiricalLedger }),
  ObjectFreeze({ kind: "directory", repositoryRelativePath:
    SOURCE_PATHS.droidSource }),
  ObjectFreeze({ kind: "directory", repositoryRelativePath:
    SOURCE_PATHS.publicAgentArtifact }),
  ObjectFreeze({ kind: "directory", repositoryRelativePath:
    SOURCE_PATHS.wave2Source }),
  ObjectFreeze({ kind: "directory", repositoryRelativePath:
    SOURCE_PATHS.wave3Source }),
  ObjectFreeze({ kind: "directory", repositoryRelativePath:
    SOURCE_PATHS.wave4Source }),
  ObjectFreeze({ kind: "directory", repositoryRelativePath:
    SOURCE_PATHS.roboticsSource }),
  ObjectFreeze({ kind: "file", repositoryRelativePath: SOURCE_PATHS.nhtsaCsv }),
  ObjectFreeze({ kind: "file", repositoryRelativePath: SOURCE_PATHS.nhtsaDictionary }),
  ObjectFreeze({ kind: "file", repositoryRelativePath: PREDECESSOR_MANIFEST_PATH }),
  ObjectFreeze({ kind: "file", repositoryRelativePath:
    PRIOR_PREDECESSOR_MANIFEST_PATH }),
]);

function fail(code, detail = null) {
  throw new ErrorConstructor(detail === null ? `STAGE0_EVIDENCE_CURRENT_${code}`
    : `STAGE0_EVIDENCE_CURRENT_${code}:${detail}`);
}

function digestBytes(bytes) {
  const hash = createHash("sha256");
  CryptoHashUpdate(hash, bytes);
  return `sha256:${CryptoHashDigest(hash, "hex")}`;
}

function domainDigest(domain, value) {
  return digestBytes(`${domain}\0${canonicalizeStrict(value)}`);
}

function exactObjectKeys(value, expected, code) {
  canonicalizeStrict(value);
  if (!value || typeof value !== "object"
    || ObjectGetPrototypeOf(value) !== ObjectPrototype) fail(`${code}_OBJECT_INVALID`);
  const actual = ReflectOwnKeys(value);
  if (actual.length !== expected.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < expected.length; index += 1) {
    let found = false;
    for (let candidate = 0; candidate < actual.length; candidate += 1) {
      if (expected[index] === actual[candidate]) { found = true; break; }
    }
    if (!found) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function parseManifestBytes(input) {
  if (!(typeof input === "string" || BufferIsBuffer(input))) {
    fail("MANIFEST_BYTES_REQUIRED");
  }
  const text = typeof input === "string" ? input : BufferToString(input, "utf8");
  if (text.length <= 0 || text.length > MAX_MANIFEST_BYTES) {
    fail("MANIFEST_BYTES_INVALID");
  }
  const manifest = JSONParse(text);
  exactObjectKeys(manifest, [
    "schema", "schemaVersion", "createdAt", "status", "reasonCodes",
    "predecessor", "priorPredecessor", "supersedesManifestHash", "superseded",
    "current", "pinnedDroidSourceObjects", "currentReplay", "inputSnapshotAssurance",
    "dependencyEdges", "preservation", "boundary", "manifestHash",
  ], "MANIFEST");
  if (manifest.schema !== STAGE0_EVIDENCE_CHAIN_SCHEMA
    || manifest.schemaVersion !== "3.0.0"
    || manifest.status !== "CURRENT_ROUTING_POINTER_SOURCE_REPLAY_REQUIRED"
    || !RegExpTest(HASH, StringConstructor(manifest.manifestHash ?? ""))) {
    fail("MANIFEST_STRUCTURE_INVALID");
  }
  if (DateToISOString(new DateConstructor(manifest.createdAt)) !== manifest.createdAt) {
    fail("MANIFEST_CREATED_AT_INVALID");
  }
  const body = { ...manifest };
  delete body.manifestHash;
  if (domainDigest(STAGE0_EVIDENCE_CHAIN_SCHEMA, body) !== manifest.manifestHash) {
    fail("MANIFEST_HASH_MISMATCH");
  }
  exactObjectKeys(manifest.boundary, [
    "routingMetadataOnly", "authority", "causalExperienceUnits",
    "automaticTraining", "productionTraining", "pricing", "guarantee",
    "settlement", "remoteOrPhysicalAction",
  ], "BOUNDARY");
  if (manifest.boundary.routingMetadataOnly !== true
    || manifest.boundary.authority !== "none"
    || manifest.boundary.causalExperienceUnits !== 0
    || manifest.boundary.automaticTraining !== false
    || manifest.boundary.productionTraining !== false
    || manifest.boundary.pricing !== false
    || manifest.boundary.guarantee !== false
    || manifest.boundary.settlement !== false
    || manifest.boundary.remoteOrPhysicalAction !== false) {
    fail("BOUNDARY_PROMOTION_INVALID");
  }
  exactObjectKeys(manifest.preservation, [
    "oldArtifactBytesPreserved", "oldChainMutatedByThisManifest",
    "supersessionMarkerSourceReplaysOldProjection", "oldProjectionFailureCode",
  ], "PRESERVATION");
  if (manifest.preservation.oldArtifactBytesPreserved !== true
    || manifest.preservation.oldChainMutatedByThisManifest !== false
    || manifest.preservation.supersessionMarkerSourceReplaysOldProjection !== false
    || manifest.preservation.oldProjectionFailureCode
      !== "DROID100_PILOT_SOURCE_EPISODE_PROJECTION_MISMATCH") {
    fail("PRESERVATION_BOUNDARY_INVALID");
  }
  exactObjectKeys(manifest.predecessor, [
    "repositoryRelativePath", "bytes", "fileSha256", "manifestHash",
  ], "PREDECESSOR");
  if (canonicalizeStrict(manifest.predecessor)
      !== canonicalizeStrict(PREDECESSOR_MANIFEST_RECEIPT)
    || manifest.supersedesManifestHash !== PREDECESSOR_MANIFEST_RECEIPT.manifestHash
    || manifest.supersedesManifestHash !== manifest.predecessor.manifestHash) {
    fail("PREDECESSOR_RECEIPT_INVALID");
  }
  exactObjectKeys(manifest.priorPredecessor, [
    "repositoryRelativePath", "bytes", "fileSha256", "manifestHash",
  ], "PRIOR_PREDECESSOR");
  if (canonicalizeStrict(manifest.priorPredecessor)
      !== canonicalizeStrict(PRIOR_PREDECESSOR_MANIFEST_RECEIPT)) {
    fail("PRIOR_PREDECESSOR_RECEIPT_INVALID");
  }
  exactObjectKeys(manifest.inputSnapshotAssurance, [
    "method", "inputRootCount", "fileCount", "totalBytes", "inputTreeCommitment",
    "originalDescriptorsHeldThroughReplay",
    "declaredArtifactAndDatasetReplayReadsUsePrivateSnapshot",
    "droidSourceBuffersReadOnceFromPrivateSnapshot",
    "receiptsAndInventoriesDerivedFromPrivateSnapshot",
    "postReplayOriginalDescriptorPathAndBytesReverified",
    "postReplayPrivateDescriptorPathAndBytesReverified",
    "verifierImplementationFilesSnapshotted", "stage1ImplementationClosureAtomic",
    "overallAdmission", "privateFilesMode", "privateDirectoriesMode",
    "privateSnapshotRemovedBeforeReturn",
  ], "INPUT_SNAPSHOT_ASSURANCE");
  if (manifest.inputSnapshotAssurance.method
      !== "COMPLETE_BOUNDED_O_NOFOLLOW_PRIVATE_READ_ONLY_TREE"
    || manifest.inputSnapshotAssurance.inputRootCount !== SNAPSHOT_INPUTS.length
    || !NumberIsSafeInteger(manifest.inputSnapshotAssurance.fileCount)
    || manifest.inputSnapshotAssurance.fileCount <= 0
    || !NumberIsSafeInteger(manifest.inputSnapshotAssurance.totalBytes)
    || manifest.inputSnapshotAssurance.totalBytes <= 0
    || !RegExpTest(HASH,
      StringConstructor(manifest.inputSnapshotAssurance.inputTreeCommitment ?? ""))
    || manifest.inputSnapshotAssurance.originalDescriptorsHeldThroughReplay !== true
    || manifest.inputSnapshotAssurance
      .declaredArtifactAndDatasetReplayReadsUsePrivateSnapshot !== true
    || manifest.inputSnapshotAssurance.droidSourceBuffersReadOnceFromPrivateSnapshot
      !== true
    || manifest.inputSnapshotAssurance.receiptsAndInventoriesDerivedFromPrivateSnapshot
      !== true
    || manifest.inputSnapshotAssurance
      .postReplayOriginalDescriptorPathAndBytesReverified !== true
    || manifest.inputSnapshotAssurance
      .postReplayPrivateDescriptorPathAndBytesReverified !== true
    || manifest.inputSnapshotAssurance.verifierImplementationFilesSnapshotted !== false
    || manifest.inputSnapshotAssurance.stage1ImplementationClosureAtomic !== false
    || manifest.inputSnapshotAssurance.overallAdmission
      !== "HOLD_NONATOMIC_VERIFIER_IMPLEMENTATION_CLOSURE"
    || manifest.inputSnapshotAssurance.privateFilesMode !== "0400"
    || manifest.inputSnapshotAssurance.privateDirectoriesMode !== "0500"
    || manifest.inputSnapshotAssurance.privateSnapshotRemovedBeforeReturn !== true) {
    fail("INPUT_SNAPSHOT_ASSURANCE_INVALID");
  }
  if (manifest.current?.droid?.inventory?.repositoryRelativePath
      !== STAGE0_EVIDENCE_CURRENT_PATHS.droidArtifact
    || manifest.current?.stage1Registry?.inventory?.repositoryRelativePath
      !== STAGE0_EVIDENCE_CURRENT_PATHS.stage1Registry
    || manifest.current?.empiricalLedger?.file?.repositoryRelativePath
      !== STAGE0_EVIDENCE_CURRENT_PATHS.empiricalLedger
    || manifest.superseded?.droid?.inventory?.repositoryRelativePath
      !== STAGE0_EVIDENCE_SUPERSEDED_PATHS.droidArtifact
    || manifest.superseded?.stage1Registry?.inventory?.repositoryRelativePath
      !== STAGE0_EVIDENCE_SUPERSEDED_PATHS.stage1Registry
    || manifest.superseded?.empiricalLedger?.file?.repositoryRelativePath
      !== STAGE0_EVIDENCE_SUPERSEDED_PATHS.empiricalLedger) {
    fail("ROUTING_PATH_INVALID");
  }
  return manifest;
}

function repositoryPath(relativePath) {
  if (typeof relativePath !== "string" || relativePath.length === 0
    || StringIncludes(relativePath, "\0") || PathIsAbsolute(relativePath)) {
    fail("PATH_INVALID", relativePath);
  }
  const resolved = PathResolve(REPOSITORY_ROOT, relativePath);
  const prefix = `${REPOSITORY_ROOT}${PathSeparator}`;
  if (!StringStartsWith(resolved, prefix)) fail("PATH_OUTSIDE_REPOSITORY", relativePath);
  return resolved;
}

function sameFileState(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.size === right.size && left.mode === right.mode
    && left.mtimeMs === right.mtimeMs && left.ctimeMs === right.ctimeMs;
}

function sameDirectoryNamespaceIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino
    && left.mode === right.mode;
}

function readDescriptorExact(descriptor, size, relativePath) {
  const bytes = BufferAlloc(size);
  let offset = 0;
  while (offset < size) {
    const count = readSync(descriptor, bytes, offset, size - offset, offset);
    if (count <= 0) fail("FILE_SHORT_READ", relativePath);
    offset += count;
  }
  return bytes;
}

function openStableBoundedFile(relativePath, maximumBytes = MAX_FILE_BYTES) {
  const absolute = repositoryPath(relativePath);
  const pathBefore = lstatSync(absolute);
  if (!StatsIsFile(pathBefore) || StatsIsSymbolicLink(pathBefore)) {
    fail("FILE_INVALID", relativePath);
  }
  let descriptor;
  try {
    descriptor = openSync(absolute, READ_ONLY_NOFOLLOW_FLAGS);
    const descriptorBefore = fstatSync(descriptor);
    if (!StatsIsFile(descriptorBefore) || descriptorBefore.size <= 0
      || descriptorBefore.size > maximumBytes
      || !sameFileState(pathBefore, descriptorBefore)) {
      fail("FILE_INVALID", relativePath);
    }
    const bytes = readDescriptorExact(descriptor, descriptorBefore.size, relativePath);
    const descriptorAfter = fstatSync(descriptor);
    const pathAfter = lstatSync(absolute);
    if (!sameFileState(descriptorBefore, descriptorAfter)
      || !sameFileState(descriptorBefore, pathAfter)) {
      fail("FILE_CHANGED_DURING_READ", relativePath);
    }
    return { absolute, relativePath, descriptor, state: descriptorBefore, bytes };
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    throw error;
  }
}

function regularBytes(relativePath) {
  const opened = openStableBoundedFile(relativePath);
  try { return opened.bytes; }
  finally { closeSync(opened.descriptor); }
}

function pathWithinRoot(root, relativePath, code = "SNAPSHOT_PATH") {
  if (typeof root !== "string" || root.length === 0
    || typeof relativePath !== "string" || relativePath.length === 0
    || StringIncludes(relativePath, "\0") || PathIsAbsolute(relativePath)) {
    fail(`${code}_INVALID`, relativePath);
  }
  const resolvedRoot = PathResolve(root);
  const resolved = PathResolve(resolvedRoot, relativePath);
  if (!StringStartsWith(resolved, `${resolvedRoot}${PathSeparator}`)) {
    fail(`${code}_OUTSIDE_ROOT`, relativePath);
  }
  return resolved;
}

function pathAtOrWithinRoot(root, candidate) {
  return candidate === root
    || StringStartsWith(candidate, `${root}${PathSeparator}`);
}

function physicalPathExact(absolute, code, detail) {
  let physical;
  try { physical = realpathSync(absolute); }
  catch { fail(code, detail); }
  if (physical !== absolute) fail(code, detail);
  return physical;
}

function originalDirectoryLabel(snapshot, absolute) {
  if (absolute === snapshot.originalRoot) return ".";
  if (pathAtOrWithinRoot(snapshot.originalRoot, absolute)) {
    return PathRelative(snapshot.originalRoot, absolute);
  }
  return `@ancestor:${absolute}`;
}

/* Pin every physical directory component from the filesystem root through the
 * declared source root and each selected input.  O_NOFOLLOW protects the leaf
 * open; realpath equality rejects a symlink in any earlier component.  The
 * declared root and its descendants are the replay-owned namespace, so their
 * complete directory state remains frozen to expose a directory/path ABA.
 * Ancestors above that boundary are only routing components: pin their
 * directory identity, mode, and physical path without treating unrelated
 * sibling entry churn (for example in a shared system temp directory) as an
 * input mutation. */
function pinAbsoluteOriginalDirectory(snapshot, absolute) {
  const resolved = PathResolve(absolute);
  const existing = snapshot.originalDirectoryMap.get(resolved);
  if (existing) return existing;
  const parent = PathDirname(resolved);
  if (parent !== resolved) pinAbsoluteOriginalDirectory(snapshot, parent);
  const relativePath = originalDirectoryLabel(snapshot, resolved);
  let pathBefore;
  try { pathBefore = lstatSync(resolved); }
  catch { fail("SNAPSHOT_DIRECTORY_SYMLINK_OR_ANCESTOR_INVALID", relativePath); }
  if (!StatsIsDirectory(pathBefore) || StatsIsSymbolicLink(pathBefore)) {
    fail("SNAPSHOT_DIRECTORY_SYMLINK_OR_ANCESTOR_INVALID", relativePath);
  }
  const physical = physicalPathExact(resolved,
    "SNAPSHOT_DIRECTORY_SYMLINK_OR_ANCESTOR_INVALID", relativePath);
  const replayOwnedNamespace = pathAtOrWithinRoot(snapshot.originalRoot, resolved);
  if (replayOwnedNamespace
    && !pathAtOrWithinRoot(snapshot.originalRoot, physical)) {
    fail("SNAPSHOT_DIRECTORY_PHYSICAL_OUTSIDE_ROOT", relativePath);
  }
  let descriptor;
  try {
    descriptor = openSync(resolved, READ_ONLY_DIRECTORY_NOFOLLOW_FLAGS);
    const descriptorState = fstatSync(descriptor);
    const pathAfter = lstatSync(resolved);
    const sameRequiredState = replayOwnedNamespace
      ? sameFileState : sameDirectoryNamespaceIdentity;
    if (!StatsIsDirectory(descriptorState)
      || !StatsIsDirectory(pathAfter) || StatsIsSymbolicLink(pathAfter)
      || !sameRequiredState(pathBefore, descriptorState)
      || !sameRequiredState(descriptorState, pathAfter)
      || physicalPathExact(resolved,
        "SNAPSHOT_DIRECTORY_SYMLINK_OR_ANCESTOR_INVALID", relativePath) !== physical) {
      fail("SNAPSHOT_DIRECTORY_IDENTITY_INVALID", relativePath);
    }
    const entry = { absolute: resolved, physicalPath: physical, relativePath,
      descriptor, state: descriptorState, replayOwnedNamespace };
    snapshot.originalDirectoryMap.set(resolved, entry);
    ArrayPush(snapshot.originalDirectories, entry);
    return entry;
  } catch (error) {
    if (descriptor !== undefined) closeSync(descriptor);
    throw error;
  }
}

function pinOriginalDirectory(snapshot, relativePath) {
  if (relativePath === "." || relativePath === "") {
    return snapshot.originalRootEntry;
  }
  const absolute = pathWithinRoot(snapshot.originalRoot, relativePath);
  const entry = pinAbsoluteOriginalDirectory(snapshot, absolute);
  if (!pathAtOrWithinRoot(snapshot.physicalOriginalRoot, entry.physicalPath)) {
    fail("SNAPSHOT_DIRECTORY_PHYSICAL_OUTSIDE_ROOT", relativePath);
  }
  return entry;
}

function verifyOriginalDirectoryNamespaceStable(snapshot, code) {
  for (let index = 0; index < snapshot.originalDirectories.length; index += 1) {
    const entry = snapshot.originalDirectories[index];
    let descriptorState;
    let pathState;
    try {
      descriptorState = fstatSync(entry.descriptor);
      pathState = lstatSync(entry.absolute);
    } catch { fail(code, entry.relativePath); }
    const sameRequiredState = entry.replayOwnedNamespace
      ? sameFileState : sameDirectoryNamespaceIdentity;
    if (!StatsIsDirectory(descriptorState) || !StatsIsDirectory(pathState)
      || StatsIsSymbolicLink(pathState)
      || !sameRequiredState(entry.state, descriptorState)
      || !sameRequiredState(entry.state, pathState)
      || physicalPathExact(entry.absolute, code, entry.relativePath)
        !== entry.physicalPath) {
      fail(code, entry.relativePath);
    }
  }
}

function ensurePrivateDirectory(snapshot, relativePath) {
  if (relativePath === "." || relativePath === "") return snapshot.privateRoot;
  const destination = pathWithinRoot(snapshot.privateRoot, relativePath,
    "PRIVATE_SNAPSHOT_PATH");
  if (!snapshot.privateDirectoryMap.has(relativePath)) {
    const parent = PathRelative(snapshot.privateRoot, PathDirname(destination));
    ensurePrivateDirectory(snapshot, parent === "" ? "." : parent);
    mkdirSync(destination, { mode: 0o700 });
    snapshot.privateDirectoryMap.set(relativePath, destination);
  }
  return destination;
}

function streamCopyAndHash(sourceDescriptor, destinationDescriptor, size, relativePath) {
  const hash = createHash("sha256");
  const buffer = BufferAlloc(Math.min(SNAPSHOT_COPY_CHUNK_BYTES, size));
  let offset = 0;
  while (offset < size) {
    const requested = Math.min(buffer.length, size - offset);
    const read = readSync(sourceDescriptor, buffer, 0, requested, offset);
    if (read <= 0) fail("SNAPSHOT_SOURCE_SHORT_READ", relativePath);
    CryptoHashUpdate(hash, read === buffer.length ? buffer : BufferSubarray(buffer, 0, read));
    let written = 0;
    while (written < read) {
      const count = writeSync(destinationDescriptor, buffer, written,
        read - written, offset + written);
      if (count <= 0) fail("SNAPSHOT_DESTINATION_SHORT_WRITE", relativePath);
      written += count;
    }
    offset += read;
  }
  return `sha256:${CryptoHashDigest(hash, "hex")}`;
}

function digestHeldDescriptor(descriptor, size, relativePath) {
  const hash = createHash("sha256");
  const buffer = BufferAlloc(Math.min(SNAPSHOT_COPY_CHUNK_BYTES, size));
  let offset = 0;
  while (offset < size) {
    const requested = Math.min(buffer.length, size - offset);
    const read = readSync(descriptor, buffer, 0, requested, offset);
    if (read <= 0) fail("SNAPSHOT_REVERIFY_SHORT_READ", relativePath);
    CryptoHashUpdate(hash, read === buffer.length ? buffer : BufferSubarray(buffer, 0, read));
    offset += read;
  }
  return `sha256:${CryptoHashDigest(hash, "hex")}`;
}

function snapshotOneFile(snapshot, relativePath) {
  if (snapshot.fileMap.has(relativePath)) fail("SNAPSHOT_DUPLICATE_FILE", relativePath);
  const absolute = pathWithinRoot(snapshot.originalRoot, relativePath);
  const parentRelative = PathRelative(snapshot.originalRoot, PathDirname(absolute)) || ".";
  pinOriginalDirectory(snapshot, parentRelative);
  let pathBefore;
  try { pathBefore = lstatSync(absolute); }
  catch { fail("SNAPSHOT_FILE_INVALID", relativePath); }
  if (!StatsIsFile(pathBefore) || StatsIsSymbolicLink(pathBefore)
    || pathBefore.size <= 0 || pathBefore.size > MAX_SNAPSHOT_FILE_BYTES) {
    fail("SNAPSHOT_FILE_INVALID", relativePath);
  }
  const physicalBefore = physicalPathExact(absolute,
    "SNAPSHOT_FILE_SYMLINK_OR_ANCESTOR_INVALID", relativePath);
  if (!pathAtOrWithinRoot(snapshot.physicalOriginalRoot, physicalBefore)) {
    fail("SNAPSHOT_FILE_PHYSICAL_OUTSIDE_ROOT", relativePath);
  }
  if (snapshot.files.length >= MAX_SNAPSHOT_FILES
    || snapshot.totalBytes + pathBefore.size > MAX_SNAPSHOT_TOTAL_BYTES) {
    fail("SNAPSHOT_BUDGET_EXCEEDED", relativePath);
  }
  let originalDescriptor;
  let destinationDescriptor;
  let privateDescriptor;
  try {
    originalDescriptor = openSync(absolute, READ_ONLY_NOFOLLOW_FLAGS);
    const originalState = fstatSync(originalDescriptor);
    if (!StatsIsFile(originalState) || !sameFileState(pathBefore, originalState)) {
      fail("SNAPSHOT_FILE_IDENTITY_INVALID", relativePath);
    }
    ensurePrivateDirectory(snapshot, PathRelative(snapshot.originalRoot,
      PathDirname(absolute)) || ".");
    const privatePath = pathWithinRoot(snapshot.privateRoot, relativePath,
      "PRIVATE_SNAPSHOT_PATH");
    destinationDescriptor = openSync(privatePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
    const fileSha256 = streamCopyAndHash(originalDescriptor, destinationDescriptor,
      originalState.size, relativePath);
    fsyncSync(destinationDescriptor);
    closeSync(destinationDescriptor);
    destinationDescriptor = undefined;
    const originalAfterCopy = fstatSync(originalDescriptor);
    const originalPathAfterCopy = lstatSync(absolute);
    if (!sameFileState(originalState, originalAfterCopy)
      || !sameFileState(originalState, originalPathAfterCopy)
      || physicalPathExact(absolute,
        "SNAPSHOT_FILE_SYMLINK_OR_ANCESTOR_INVALID", relativePath)
        !== physicalBefore) {
      fail("SNAPSHOT_SOURCE_CHANGED_DURING_COPY", relativePath);
    }
    chmodSync(privatePath, 0o400);
    privateDescriptor = openSync(privatePath, READ_ONLY_NOFOLLOW_FLAGS);
    const privateState = fstatSync(privateDescriptor);
    const privatePathState = lstatSync(privatePath);
    if (!StatsIsFile(privateState) || !sameFileState(privateState, privatePathState)
      || (privateState.mode & 0o777) !== 0o400
      || privateState.size !== originalState.size
      || digestHeldDescriptor(privateDescriptor, privateState.size, relativePath)
        !== fileSha256) {
      fail("PRIVATE_SNAPSHOT_COPY_INVALID", relativePath);
    }
    const receipt = ObjectFreeze({ repositoryRelativePath: relativePath,
      bytes: originalState.size, fileSha256 });
    const entry = { relativePath, originalPath: absolute, originalDescriptor,
      originalState, privatePath, privateDescriptor, privateState, receipt };
    originalDescriptor = undefined;
    privateDescriptor = undefined;
    ArrayPush(snapshot.files, entry);
    snapshot.fileMap.set(relativePath, entry);
    snapshot.totalBytes += originalState.size;
  } finally {
    if (destinationDescriptor !== undefined) closeSync(destinationDescriptor);
    if (privateDescriptor !== undefined) closeSync(privateDescriptor);
    if (originalDescriptor !== undefined) closeSync(originalDescriptor);
  }
}

function snapshotDirectoryRecursively(snapshot, relativeDirectory) {
  const held = pinOriginalDirectory(snapshot, relativeDirectory);
  const absolute = held.absolute;
  ensurePrivateDirectory(snapshot, relativeDirectory);
  const entries = readdirSync(absolute);
  ArraySort(entries, (left, right) => StringLocaleCompare(left, right));
  for (let index = 0; index < entries.length; index += 1) {
    const relativePath = `${relativeDirectory}/${entries[index]}`;
    const child = lstatSync(pathWithinRoot(snapshot.originalRoot, relativePath));
    if (StatsIsSymbolicLink(child)) fail("SNAPSHOT_SYMLINK_INVALID", relativePath);
    if (StatsIsDirectory(child)) snapshotDirectoryRecursively(snapshot, relativePath);
    else if (StatsIsFile(child)) snapshotOneFile(snapshot, relativePath);
    else fail("SNAPSHOT_ENTRY_INVALID", relativePath);
  }
  const descriptorAfter = fstatSync(held.descriptor);
  const pathAfter = lstatSync(held.absolute);
  if (!sameFileState(held.state, descriptorAfter)
    || !sameFileState(held.state, pathAfter)) {
    fail("SNAPSHOT_DIRECTORY_CHANGED_DURING_COPY", relativeDirectory);
  }
}

function lockPrivateSnapshotDirectories(snapshot) {
  const directories = [...snapshot.privateDirectoryMap.values()];
  ArraySort(directories, (left, right) => right.length - left.length);
  for (let index = 0; index < directories.length; index += 1) {
    chmodSync(directories[index], 0o500);
    const state = lstatSync(directories[index]);
    if (!StatsIsDirectory(state) || StatsIsSymbolicLink(state)
      || (state.mode & 0o777) !== 0o500) {
      fail("PRIVATE_SNAPSHOT_DIRECTORY_MODE_INVALID", directories[index]);
    }
  }
  chmodSync(snapshot.privateRoot, 0o500);
  const rootState = lstatSync(snapshot.privateRoot);
  if (!StatsIsDirectory(rootState) || StatsIsSymbolicLink(rootState)
    || (rootState.mode & 0o777) !== 0o500) {
    fail("PRIVATE_SNAPSHOT_ROOT_MODE_INVALID");
  }
}

function createPrivateInputSnapshot({ originalRoot = REPOSITORY_ROOT,
  inputs = SNAPSHOT_INPUTS } = {}) {
  if (typeof originalRoot !== "string" || originalRoot.length === 0
    || StringIncludes(originalRoot, "\0")) {
    fail("SNAPSHOT_ROOT_INVALID");
  }
  const privateRoot = mkdtempSync(PathJoin(SystemTemporaryDirectory,
    "outsider-stage0-private-snapshot-"));
  chmodSync(privateRoot, 0o700);
  const snapshot = {
    originalRoot: PathResolve(originalRoot), privateRoot, inputs,
    files: new ArrayConstructor(), fileMap: new MapConstructor(), totalBytes: 0,
    originalDirectories: new ArrayConstructor(),
    originalDirectoryMap: new MapConstructor(), originalRootEntry: null,
    physicalOriginalRoot: null,
    privateDirectoryMap: new MapConstructor(), cleaned: false,
  };
  try {
    snapshot.originalRootEntry = pinAbsoluteOriginalDirectory(snapshot,
      snapshot.originalRoot);
    snapshot.physicalOriginalRoot = snapshot.originalRootEntry.physicalPath;
    if (snapshot.physicalOriginalRoot !== snapshot.originalRoot) {
      fail("SNAPSHOT_ROOT_SYMLINK_OR_ANCESTOR_INVALID");
    }
    for (let index = 0; index < inputs.length; index += 1) {
      const input = inputs[index];
      if (input.kind === "directory") {
        snapshotDirectoryRecursively(snapshot, input.repositoryRelativePath);
      } else if (input.kind === "file") {
        snapshotOneFile(snapshot, input.repositoryRelativePath);
      } else fail("SNAPSHOT_INPUT_KIND_INVALID", input.kind);
    }
    lockPrivateSnapshotDirectories(snapshot);
    verifyOriginalDirectoryNamespaceStable(snapshot,
      "SNAPSHOT_DIRECTORY_CHANGED_DURING_COPY");
    return snapshot;
  } catch (error) {
    cleanupPrivateInputSnapshot(snapshot);
    throw error;
  }
}

function privateSnapshotPath(snapshot, relativePath) {
  if (!snapshot.fileMap.has(relativePath)
    && !snapshot.privateDirectoryMap.has(relativePath)) {
    fail("PRIVATE_SNAPSHOT_INPUT_NOT_CAPTURED", relativePath);
  }
  const absolute = pathWithinRoot(snapshot.privateRoot, relativePath,
    "PRIVATE_SNAPSHOT_PATH");
  const physical = physicalPathExact(absolute,
    "PRIVATE_SNAPSHOT_SYMLINK_OR_ANCESTOR_INVALID", relativePath);
  if (physical !== absolute
    || !pathAtOrWithinRoot(snapshot.privateRoot, physical)) {
    fail("PRIVATE_SNAPSHOT_PHYSICAL_OUTSIDE_ROOT", relativePath);
  }
  return absolute;
}

function privateSnapshotBytes(snapshot, relativePath) {
  const entry = snapshot.fileMap.get(relativePath);
  if (!entry) fail("PRIVATE_SNAPSHOT_FILE_NOT_CAPTURED", relativePath);
  const bytes = readDescriptorExact(entry.privateDescriptor, entry.privateState.size,
    relativePath);
  if (digestBytes(bytes) !== entry.receipt.fileSha256) {
    fail("PRIVATE_SNAPSHOT_BYTES_INVALID", relativePath);
  }
  return bytes;
}

function verifyPrivateInputSnapshotStable(snapshot) {
  for (let index = 0; index < snapshot.files.length; index += 1) {
    const entry = snapshot.files[index];
    const originalDescriptorState = fstatSync(entry.originalDescriptor);
    const originalPathState = lstatSync(entry.originalPath);
    if (!sameFileState(entry.originalState, originalDescriptorState)
      || !sameFileState(entry.originalState, originalPathState)
      || StatsIsSymbolicLink(originalPathState)
      || physicalPathExact(entry.originalPath,
        "ORIGINAL_INPUT_CHANGED_DURING_REPLAY", entry.relativePath)
        !== entry.originalPath
      || digestHeldDescriptor(entry.originalDescriptor, entry.originalState.size,
        entry.relativePath) !== entry.receipt.fileSha256) {
      fail("ORIGINAL_INPUT_CHANGED_DURING_REPLAY", entry.relativePath);
    }
    const privateDescriptorState = fstatSync(entry.privateDescriptor);
    const privatePathState = lstatSync(entry.privatePath);
    if (!sameFileState(entry.privateState, privateDescriptorState)
      || !sameFileState(entry.privateState, privatePathState)
      || digestHeldDescriptor(entry.privateDescriptor, entry.privateState.size,
        entry.relativePath) !== entry.receipt.fileSha256) {
      fail("PRIVATE_SNAPSHOT_CHANGED_DURING_REPLAY", entry.relativePath);
    }
  }
  verifyOriginalDirectoryNamespaceStable(snapshot,
    "ORIGINAL_DIRECTORY_CHANGED_DURING_REPLAY");
}

function cleanupPrivateInputSnapshot(snapshot) {
  if (!snapshot || snapshot.cleaned) return;
  snapshot.cleaned = true;
  for (let index = 0; index < snapshot.files.length; index += 1) {
    try { closeSync(snapshot.files[index].originalDescriptor); } catch {}
    try { closeSync(snapshot.files[index].privateDescriptor); } catch {}
  }
  for (let index = 0; index < snapshot.originalDirectories.length; index += 1) {
    try { closeSync(snapshot.originalDirectories[index].descriptor); } catch {}
  }
  const privatePrefix = `${PathResolve(SystemTemporaryDirectory)}${PathSeparator}`;
  if (!StringStartsWith(PathResolve(snapshot.privateRoot), privatePrefix)
    || !StringIncludes(PathResolve(snapshot.privateRoot),
      `${PathSeparator}outsider-stage0-private-snapshot-`)) {
    fail("PRIVATE_SNAPSHOT_CLEANUP_PATH_INVALID");
  }
  try {
    chmodSync(snapshot.privateRoot, 0o700);
    for (const directory of snapshot.privateDirectoryMap.values()) {
      try { chmodSync(directory, 0o700); } catch {}
    }
    rmSync(snapshot.privateRoot, { recursive: true, force: false });
  } catch (error) {
    fail("PRIVATE_SNAPSHOT_CLEANUP_FAILED", error instanceof ErrorConstructor
      ? error.message : StringConstructor(error));
  }
}

function snapshotJsonFile(snapshot, relativePath) {
  try { return JSONParse(BufferToString(privateSnapshotBytes(snapshot, relativePath), "utf8")); }
  catch (error) {
    fail("JSON_INVALID", `${relativePath}:${error instanceof ErrorConstructor
      ? error.message : StringConstructor(error)}`);
  }
}

function snapshotDirectoryInventory(snapshot, relativeDirectory) {
  const files = new ArrayConstructor();
  const prefix = `${relativeDirectory}/`;
  for (let index = 0; index < snapshot.files.length; index += 1) {
    const entry = snapshot.files[index];
    if (StringStartsWith(entry.relativePath, prefix)) {
      ArrayPush(files, ObjectFreeze({ path: entry.relativePath.slice(prefix.length),
        bytes: entry.receipt.bytes, fileSha256: entry.receipt.fileSha256 }));
      if (files.length > MAX_DIRECTORY_FILES) fail("DIRECTORY_FILE_COUNT_INVALID");
    }
  }
  if (files.length <= 0) fail("DIRECTORY_INVALID", relativeDirectory);
  ArraySort(files, (left, right) => StringLocaleCompare(left.path, right.path));
  let totalBytes = 0;
  for (let index = 0; index < files.length; index += 1) totalBytes += files[index].bytes;
  return ObjectFreeze({ repositoryRelativePath: relativeDirectory,
    fileCount: files.length,
    totalBytes,
    files: ObjectFreeze(files),
    directoryCommitment: domainDigest("outsider/stage0-evidence-directory/v1", files) });
}

function snapshotFileReceipt(snapshot, relativePath) {
  const entry = snapshot.fileMap.get(relativePath);
  if (!entry) fail("PRIVATE_SNAPSHOT_FILE_NOT_CAPTURED", relativePath);
  return entry.receipt;
}

function predecessorManifestSnapshot(snapshot) {
  const bytes = privateSnapshotBytes(snapshot, PREDECESSOR_MANIFEST_PATH);
  const priorBytes = privateSnapshotBytes(snapshot, PRIOR_PREDECESSOR_MANIFEST_PATH);
  let predecessor;
  let priorPredecessor;
  try {
    predecessor = JSONParse(BufferToString(bytes, "utf8"));
    priorPredecessor = JSONParse(BufferToString(priorBytes, "utf8"));
  }
  catch (error) {
    fail("PREDECESSOR_MANIFEST_JSON_INVALID", error instanceof ErrorConstructor
      ? error.message : StringConstructor(error));
  }
  const body = { ...predecessor };
  delete body.manifestHash;
  const priorBody = { ...priorPredecessor };
  delete priorBody.manifestHash;
  const receipt = ObjectFreeze({ ...snapshotFileReceipt(snapshot, PREDECESSOR_MANIFEST_PATH),
    manifestHash: predecessor.manifestHash });
  const priorReceipt = ObjectFreeze({
    ...snapshotFileReceipt(snapshot, PRIOR_PREDECESSOR_MANIFEST_PATH),
    manifestHash: priorPredecessor.manifestHash,
  });
  if (predecessor.schema !== "outsider/stage0-evidence-chain-current/v2"
    || predecessor.schemaVersion !== "2.0.0"
    || domainDigest(predecessor.schema, body) !== predecessor.manifestHash
    || canonicalizeStrict(receipt)
      !== canonicalizeStrict(PREDECESSOR_MANIFEST_RECEIPT)
    || priorPredecessor.schema !== "outsider/stage0-evidence-chain-current/v1"
    || priorPredecessor.schemaVersion !== "1.0.0"
    || domainDigest(priorPredecessor.schema, priorBody) !== priorPredecessor.manifestHash
    || canonicalizeStrict(priorReceipt)
      !== canonicalizeStrict(PRIOR_PREDECESSOR_MANIFEST_RECEIPT)
    || predecessor.supersedesManifestHash !== priorReceipt.manifestHash
    || canonicalizeStrict(predecessor.predecessor) !== canonicalizeStrict(priorReceipt)) {
    fail("PREDECESSOR_MANIFEST_RECEIPT_MISMATCH");
  }
  return ObjectFreeze({ receipt, priorReceipt,
    predecessorCurrent: predecessor.current });
}

function droidSourceBytes(snapshot) {
  const source = {};
  for (let index = 0; index < DROID_SOURCE_OBJECTS.length; index += 1) {
    const definition = DROID_SOURCE_OBJECTS[index];
    source[definition.key] = privateSnapshotBytes(snapshot,
      `${SOURCE_PATHS.droidSource}/${definition.name}`);
  }
  return source;
}

function sourceFilePins(snapshot) {
  const pins = new ArrayConstructor(DROID_SOURCE_OBJECTS.length);
  for (let index = 0; index < DROID_SOURCE_OBJECTS.length; index += 1) {
    const definition = DROID_SOURCE_OBJECTS[index];
    pins[index] = ObjectFreeze({ name: definition.name,
      ...snapshotFileReceipt(snapshot, `${SOURCE_PATHS.droidSource}/${definition.name}`) });
  }
  return ObjectFreeze(pins);
}

function inputSnapshotAssurance(snapshot) {
  const receipts = snapshot.files.map((entry) => entry.receipt);
  ArraySort(receipts, (left, right) => StringLocaleCompare(
    left.repositoryRelativePath, right.repositoryRelativePath));
  return ObjectFreeze({
    method: "COMPLETE_BOUNDED_O_NOFOLLOW_PRIVATE_READ_ONLY_TREE",
    inputRootCount: snapshot.inputs.length,
    fileCount: snapshot.files.length,
    totalBytes: snapshot.totalBytes,
    inputTreeCommitment: domainDigest("outsider/stage0-private-input-tree/v1", receipts),
    originalDescriptorsHeldThroughReplay: true,
    declaredArtifactAndDatasetReplayReadsUsePrivateSnapshot: true,
    droidSourceBuffersReadOnceFromPrivateSnapshot: true,
    receiptsAndInventoriesDerivedFromPrivateSnapshot: true,
    postReplayOriginalDescriptorPathAndBytesReverified: true,
    postReplayPrivateDescriptorPathAndBytesReverified: true,
    verifierImplementationFilesSnapshotted: false,
    stage1ImplementationClosureAtomic: false,
    overallAdmission: "HOLD_NONATOMIC_VERIFIER_IMPLEMENTATION_CLOSURE",
    privateFilesMode: "0400",
    privateDirectoriesMode: "0500",
    privateSnapshotRemovedBeforeReturn: true,
  });
}

function ledgerSources(snapshot, droidSource) {
  return {
    wave3SourceDirectory: privateSnapshotPath(snapshot, SOURCE_PATHS.wave3LedgerSource),
    wave4SourceDirectory: privateSnapshotPath(snapshot, SOURCE_PATHS.wave4Source),
    botFailsSourceDirectory: privateSnapshotPath(snapshot, SOURCE_PATHS.botFailsSource),
    ur5SourceDirectory: privateSnapshotPath(snapshot, SOURCE_PATHS.ur5Source),
    droidArtifactDirectory: privateSnapshotPath(snapshot,
      STAGE0_EVIDENCE_CURRENT_PATHS.droidArtifact),
    nhtsaRegistryDirectory: privateSnapshotPath(snapshot,
      STAGE0_EVIDENCE_CURRENT_PATHS.stage1Registry),
    nhtsaCsvPath: privateSnapshotPath(snapshot, SOURCE_PATHS.nhtsaCsv),
    nhtsaDataDictionaryPath: privateSnapshotPath(snapshot, SOURCE_PATHS.nhtsaDictionary),
    nhtsaReplayAt: STAGE0_EVIDENCE_CURRENT_PATHS.nhtsaReplayAt,
    droidSource,
  };
}

function semanticChainReceipt(paths, snapshot) {
  const droidReport = snapshotJsonFile(snapshot, `${paths.droidArtifact}/report.json`);
  const registryIndex = snapshotJsonFile(snapshot, `${paths.stage1Registry}/index.json`);
  const ledger = snapshotJsonFile(snapshot, paths.empiricalLedger);
  return ObjectFreeze({
    droid: ObjectFreeze({ inventory: snapshotDirectoryInventory(snapshot,
      paths.droidArtifact),
      reportHash: droidReport.reportHash,
      artifactSetHash: droidReport.artifactSetHash,
      checkpointHash: droidReport.checkpoint?.checkpointHash ?? null,
      episodeCount: droidReport.decoded?.episodeCount ?? null,
      totalSteps: droidReport.decoded?.totalSteps ?? null }),
    stage1Registry: ObjectFreeze({ inventory: snapshotDirectoryInventory(snapshot,
      paths.stage1Registry),
      indexHash: registryIndex.indexHash,
      head: registryIndex.log?.head ?? null,
      artifactSets: registryIndex.counts?.artifactSets ?? null,
      candidates: registryIndex.counts?.candidates ?? null }),
    empiricalLedger: ObjectFreeze({ file: snapshotFileReceipt(snapshot,
      paths.empiricalLedger),
      ledgerHash: ledger.ledgerHash,
      sourceProfiles: ledger.accounting?.sourceProfiles ?? null,
      factorRows: ledger.accounting?.factorRows ?? null }),
  });
}

async function replayCurrentChain(snapshot) {
  const droidSource = droidSourceBytes(snapshot);
  const droid = verifyDroid100PilotArtifactDirectory(
    privateSnapshotPath(snapshot, STAGE0_EVIDENCE_CURRENT_PATHS.droidArtifact),
    { source: droidSource },
  );
  if (!droid.ok || droid.verificationLevel !== "FULL_SOURCE_REPRODUCED") {
    fail("DROID_FULL_SOURCE_REPLAY_FAILED", droid.error ?? "LEVEL");
  }
  const stage1 = await verifyKnownPublicCorpusRegistrySources({
    directory: privateSnapshotPath(snapshot, STAGE0_EVIDENCE_CURRENT_PATHS.stage1Registry),
    agentArtifactDirectory: privateSnapshotPath(snapshot, SOURCE_PATHS.publicAgentArtifact),
    wave2SourceRoot: privateSnapshotPath(snapshot, SOURCE_PATHS.wave2Source),
    roboticsSourceRoot: privateSnapshotPath(snapshot, SOURCE_PATHS.roboticsSource),
    droidArtifactDirectory: privateSnapshotPath(snapshot,
      STAGE0_EVIDENCE_CURRENT_PATHS.droidArtifact),
    droidSourceRoot: privateSnapshotPath(snapshot, SOURCE_PATHS.droidSource),
    wave4SourceRoot: privateSnapshotPath(snapshot, SOURCE_PATHS.wave4Source),
    nhtsaCsvPath: privateSnapshotPath(snapshot, SOURCE_PATHS.nhtsaCsv),
    nhtsaDataDictionaryPath: privateSnapshotPath(snapshot, SOURCE_PATHS.nhtsaDictionary),
    now: STAGE0_EVIDENCE_CURRENT_PATHS.nhtsaReplayAt,
  });
  if (!stage1.ok || !stage1.sourceArtifactsReverified
    || !stage1.allOperatorSignedFullSourceClaimsReverified) {
    fail("STAGE1_FULL_SOURCE_REPLAY_FAILED", stage1.error ?? "LEVEL");
  }
  const wave3 = verifyPublicAgentWave3MetadataCorpusRegistrySource({
    directory: privateSnapshotPath(snapshot, STAGE0_EVIDENCE_CURRENT_PATHS.stage1Registry),
    sourceRoot: privateSnapshotPath(snapshot, SOURCE_PATHS.wave3Source),
    now: STAGE0_EVIDENCE_CURRENT_PATHS.nhtsaReplayAt,
  });
  if (!wave3.ok || !wave3.sourceArtifactsReverified) {
    fail("STAGE1_WAVE3_SOURCE_REPLAY_FAILED", wave3.error ?? "LEVEL");
  }
  const ledger = snapshotJsonFile(snapshot, STAGE0_EVIDENCE_CURRENT_PATHS.empiricalLedger);
  const empirical = replayEmpiricalFactorLedger(ledger, ledgerSources(snapshot, droidSource));
  if (!empirical.ok || empirical.verificationLevel !== "FULL_SIX_SOURCE_REPRODUCED") {
    fail("EMPIRICAL_FULL_SOURCE_REPLAY_FAILED", empirical.error ?? "LEVEL");
  }
  return ObjectFreeze({
    droid: ObjectFreeze({ verificationLevel: droid.verificationLevel,
      sourceArtifactsReverified: true }),
    stage1: ObjectFreeze({ verificationLevel:
      "FULL_SIX_KNOWN_SOURCE_ARTIFACT_SETS_AND_WAVE3_METADATA_REPRODUCED",
      sourceArtifactsReverified: true,
      fullSourceArtifactSetsReverified: stage1.fullSourceArtifactSetsReverified,
      fullSourceCandidatesReverified: stage1.fullSourceCandidatesReverified,
      wave3MetadataCandidatesReverified: wave3.candidates }),
    empirical: ObjectFreeze({ verificationLevel: empirical.verificationLevel,
      sourceArtifactsReverified: empirical.sourceArtifactsReverified,
      ledgerHash: empirical.ledgerHash,
      factorRows: empirical.accounting.factorRows }),
  });
}

/* Test-only seam for exercising the exact private-snapshot implementation
 * without ever mutating a frozen repository artifact.  The fixture root must
 * be a caller-owned directory below the system temporary directory. */
export async function runStage0PrivateSnapshotMutationProbeForTest({ fixtureRoot,
  inputRelativePath = "input.bin", duringReplay } = {}) {
  const resolvedRoot = PathResolve(fixtureRoot ?? "");
  const temporaryPrefix = `${PathResolve(SystemTemporaryDirectory)}${PathSeparator}`;
  if (!StringStartsWith(resolvedRoot, temporaryPrefix)
    || typeof inputRelativePath !== "string" || inputRelativePath.length === 0
    || typeof duringReplay !== "function") {
    fail("TEST_SNAPSHOT_PROBE_ARGUMENT_INVALID");
  }
  const input = ObjectFreeze({ kind: "file", repositoryRelativePath: inputRelativePath });
  const snapshot = createPrivateInputSnapshot({ originalRoot: resolvedRoot,
    inputs: ObjectFreeze([input]) });
  try {
    const entry = snapshot.fileMap.get(input.repositoryRelativePath);
    const replayResult = await duringReplay(ObjectFreeze({
      privatePath: entry.privatePath,
      fileSha256: entry.receipt.fileSha256,
      bytes: entry.receipt.bytes,
    }));
    verifyPrivateInputSnapshotStable(snapshot);
    return ObjectFreeze({ ok: true, replayResult,
      privateSnapshotFileSha256: entry.receipt.fileSha256 });
  } finally {
    cleanupPrivateInputSnapshot(snapshot);
  }
}

export async function buildStage0EvidenceChainCurrentManifest({
  createdAt = "2026-09-02T14:30:09.000Z",
} = {}) {
  if (DateToISOString(new DateConstructor(createdAt)) !== createdAt) {
    fail("CREATED_AT_INVALID");
  }
  const snapshot = createPrivateInputSnapshot();
  try {
    const currentReplay = await replayCurrentChain(snapshot);
    const predecessorSnapshot = predecessorManifestSnapshot(snapshot);
    const predecessor = predecessorSnapshot.receipt;
    const priorPredecessor = predecessorSnapshot.priorReceipt;
    const superseded = semanticChainReceipt(STAGE0_EVIDENCE_SUPERSEDED_PATHS, snapshot);
    if (canonicalizeStrict(superseded)
        !== canonicalizeStrict(predecessorSnapshot.predecessorCurrent)) {
      fail("PREDECESSOR_CURRENT_BYTES_NOT_PRESERVED");
    }
    const current = semanticChainReceipt(STAGE0_EVIDENCE_CURRENT_PATHS, snapshot);
    if (canonicalizeStrict(current) !== canonicalizeStrict(superseded)) {
      fail("CURRENT_PRIVATE_SNAPSHOT_NOT_PREDECESSOR_EXACT");
    }
    const body = {
      schema: STAGE0_EVIDENCE_CHAIN_SCHEMA,
      schemaVersion: "3.0.0",
      createdAt,
      status: "CURRENT_ROUTING_POINTER_SOURCE_REPLAY_REQUIRED",
      reasonCodes: [
        "FINAL_V3_REPLAY_USED_NONATOMIC_CURRENT_ARTIFACT_INVENTORY_READS",
        "FINAL_V3_BYTES_PRESERVED_AND_EXACTLY_LINKED_AS_PREDECESSOR",
        "ALL_CURRENT_ARTIFACT_AND_SOURCE_INPUTS_REPLAYED_FROM_ONE_PRIVATE_READ_ONLY_TREE",
        "VERIFIER_IMPLEMENTATION_CLOSURE_NOT_ATOMICALLY_SNAPSHOTTED_HOLD",
      ],
      predecessor,
      priorPredecessor,
      supersedesManifestHash: predecessor.manifestHash,
      superseded,
      current,
      pinnedDroidSourceObjects: sourceFilePins(snapshot),
      currentReplay,
      inputSnapshotAssurance: inputSnapshotAssurance(snapshot),
      dependencyEdges: [
        "PINNED_DROID_SOURCE_OBJECTS->DROID_V7",
        "DROID_V7->STAGE1_REGISTRY_V6",
        "DROID_V7+STAGE1_REGISTRY_V6+FIVE_ADJACENT_SOURCES->EMPIRICAL_LEDGER_V6",
        "STAGE0_FINAL_V2_MANIFEST->STAGE0_FINAL_V3_MANIFEST",
        "STAGE0_FINAL_V3_MANIFEST->STAGE0_FINAL_V4_MANIFEST",
      ],
      preservation: {
        oldArtifactBytesPreserved: true,
        oldChainMutatedByThisManifest: false,
        supersessionMarkerSourceReplaysOldProjection: false,
        oldProjectionFailureCode: "DROID100_PILOT_SOURCE_EPISODE_PROJECTION_MISMATCH",
      },
      boundary: {
        routingMetadataOnly: true,
        authority: "none",
        causalExperienceUnits: 0,
        automaticTraining: false,
        productionTraining: false,
        pricing: false,
        guarantee: false,
        settlement: false,
        remoteOrPhysicalAction: false,
      },
    };
    verifyPrivateInputSnapshotStable(snapshot);
    return ObjectFreeze({ ...body,
      manifestHash: domainDigest(STAGE0_EVIDENCE_CHAIN_SCHEMA, body) });
  } finally {
    cleanupPrivateInputSnapshot(snapshot);
  }
}

export function verifyStage0EvidenceChainCurrentManifestStructure(manifestBytes) {
  try {
    const manifest = parseManifestBytes(manifestBytes);
    return ObjectFreeze({ ok: true,
      verificationLevel: "SELF_SEALED_ROUTING_STRUCTURE_AND_ZERO_AUTHORITY_ONLY",
      sourceArtifactsReverified: false,
      oldArtifactBytesReverified: false,
      manifestHash: manifest.manifestHash,
      boundary: manifest.boundary });
  } catch (error) {
    return ObjectFreeze({ ok: false,
      verificationLevel: "INVALID",
      sourceArtifactsReverified: false,
      oldArtifactBytesReverified: false,
      error: error instanceof ErrorConstructor ? error.message : StringConstructor(error) });
  }
}

export async function verifyStage0EvidenceChainCurrentManifest(manifestPath =
  STAGE0_EVIDENCE_CURRENT_PATHS.manifest) {
  try {
    if (manifestPath !== STAGE0_EVIDENCE_CURRENT_PATHS.manifest) {
      fail("MANIFEST_PATH_MISMATCH");
    }
    const bytes = regularBytes(manifestPath);
    const manifest = parseManifestBytes(bytes);
    const expected = await buildStage0EvidenceChainCurrentManifest({
      createdAt: manifest.createdAt,
    });
    if (canonicalizeStrict(expected) !== canonicalizeStrict(manifest)) {
      fail("MANIFEST_CURRENT_REPLAY_MISMATCH");
    }
    return ObjectFreeze({ ok: true,
      verificationLevel:
        "THREE_LAYER_PRIVATE_DATA_INPUT_REPLAY_WITH_IMPLEMENTATION_CLOSURE_HOLD",
      sourceArtifactsReverified: true,
      allReplayInputsAtomic: false,
      holdReason: "NONATOMIC_VERIFIER_IMPLEMENTATION_CLOSURE",
      oldArtifactBytesPreserved: true,
      manifestHash: manifest.manifestHash,
      manifestFileSha256: digestBytes(bytes),
      manifestFileBytes: bytes.length,
      boundary: manifest.boundary });
  } catch (error) {
    return ObjectFreeze({ ok: false,
      verificationLevel: "INVALID",
      sourceArtifactsReverified: false,
      allReplayInputsAtomic: false,
      oldArtifactBytesPreserved: false,
      error: error instanceof ErrorConstructor ? error.message : StringConstructor(error) });
  }
}
