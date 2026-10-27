/*
 * Fail-closed source replay for the paired Hiesh RoboMME SequenceRecovery
 * HDF5 repositories.  The selected horizontal HDF5 was probed only through
 * exact HTTP ranges.  libhdf5 metadata reads crossed into RGB storage, so the
 * numeric episode closure is intentionally rejected and no HDF5 payload is
 * published by this artifact.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readSync, readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "./canonical-historical-replay.js";

export const HIESH_SEQUENCE_RECOVERY_DISPOSITION =
  "METADATA_ONLY_TERMINAL_DISPOSITION";
export const HIESH_SEQUENCE_RECOVERY_REPORT_SCHEMA =
  "outsider/hiesh-sequence-recovery-metadata-only/v1";
export const HIESH_SEQUENCE_RECOVERY_RECEIPT_SCHEMA =
  "outsider/hiesh-sequence-recovery-metadata-only-receipt/v1";
export const HIESH_SEQUENCE_RECOVERY_TERMINAL_SCHEMA =
  "outsider/hiesh-sequence-recovery-metadata-only-terminal-evidence/v1";

const SOURCE_SCHEMA = "outsider/hiesh-sequence-recovery-metadata-only-source/v1";
const REPORT_DOMAIN = "outsider/hiesh-sequence-recovery-metadata-only-report/v1";
const RECEIPT_DOMAIN = "outsider/hiesh-sequence-recovery-metadata-only-receipt/v1";
const MANIFEST_DOMAIN = "outsider/hiesh-sequence-recovery-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/hiesh-sequence-recovery-source-root/v1";
const TREE_DOMAIN = "outsider/hiesh-sequence-recovery-tree/v1";
const RECORD_DOMAIN = "outsider/hiesh-sequence-recovery-record/v1";
const TERMINAL_DOMAIN = "hiesh/terminal-evidence/v1";
const RANGE_DOMAIN = "hiesh/terminal-range-descriptors/v1";
const IMAGE_DOMAIN = "hiesh/terminal-image-storage/v1";
const OVERLAP_DOMAIN = "hiesh/image-overlap/v1";
const MAX_JSON_BYTES = 24 * 1024 * 1024;
const MAX_SMALL_BYTES = 64 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const HIESH_SEQUENCE_RECOVERY_REPOSITORIES = Object.freeze([
  Object.freeze({
    key: "horizontal",
    datasetId: "Hiesh/sequence_recovery_centered_200_horizontally",
    revision: "87afa6f5bb99cd2926bbc5673f6916838bd438d9",
    cardLicense: "mit",
    recordUsedStorageBytes: 83_233_213_528,
    treeBytes: 83_233_216_844,
    readmeBytes: 812,
    readmeSha256: "sha256:78713ca6aa6932ea4775ff25d90d48706be8eceb42a6a3705b6d450637603f95",
    selected: Object.freeze({
      path: "test/episode_021_seed_43100.h5", bytes: 326_679_376,
      oid: "eef70e7cf6be09f60b39043121ab75cf7928b16d",
      lfsOid: "9f5c91004d423524a3eb519c2d37e083f6ca4a144c6b7864fdc5bbd257e0becd",
      xetHash: "a38473af23179387b05b749ad3fb5d83465bfdba932a29f97ea7eeb5742391b6",
    }),
  }),
  Object.freeze({
    key: "vertical",
    datasetId: "Hiesh/sequence_recovery_centered_200_vertically",
    revision: "f1534a59473feb942a9ada9ea0e5d1949ab77418",
    cardLicense: "mit",
    recordUsedStorageBytes: 83_770_131_544,
    treeBytes: 83_770_134_856,
    readmeBytes: 808,
    readmeSha256: "sha256:c3d4dcc128269efe10b0c5833829bc0f29c48bbbc0352fb4bf77c23d2dedbb19",
    selected: Object.freeze({
      path: "test/episode_021_seed_63100.h5", bytes: 304_676_064,
      oid: "0a0e9d781d054b600f3429b4f0ebf695c1fafa5d",
      lfsOid: "3faf3ec632981877bed4f12a1488ff4555d9d0e104dcc73852df2af6dadfb72c",
      xetHash: "a0497841b73adacbf52a5222f7b5c0932bb24938947852007eec87c4173b52d6",
    }),
  }),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `HIESH_SEQUENCE_RECOVERY_${code}`
    : `HIESH_SEQUENCE_RECOVERY_${code}:${detail}`);
}
export function hieshSequenceRecoverySha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function digest(domain, value) {
  return hieshSequenceRecoverySha256(
    Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}
export function serializeHieshSequenceRecoveryArtifact(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}
function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}
function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}
function strictJson(bytes, code) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { fail(code); }
}
function safeRelative(value) {
  if (typeof value !== "string" || !value || value.startsWith("/")
    || value.includes("\\") || value.includes("\0")
    || value.split("/").some((part) => ["", ".", ".."].includes(part))
    || path.posix.normalize(value) !== value) fail("PATH_INVALID", String(value));
  return value;
}
function checkedPath(root, relative) {
  safeRelative(relative);
  const base = path.resolve(root); const target = path.resolve(base, relative);
  const relation = path.relative(base, target);
  if (!relation || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_INVALID", relative);
  return target;
}
function checkedRegular(root, relative, maximumBytes) {
  const target = checkedPath(root, relative); const status = lstatSync(target, { bigint: true });
  if (!status.isFile() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o600 || status.size < 1n
    || status.size > BigInt(maximumBytes)) fail("SOURCE_FILE_INVALID", relative);
  return { target, bytes: Number(status.size) };
}
function readRegular(root, relative, maximumBytes) {
  return readFileSync(checkedRegular(root, relative, maximumBytes).target);
}
function hashRegular(root, relative, maximumBytes) {
  const checked = checkedRegular(root, relative, maximumBytes);
  const descriptor = openSync(checked.target, O_RDONLY | O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const hash = createHash("sha256"); const buffer = Buffer.allocUnsafe(1024 * 1024);
    let offset = 0;
    while (offset < checked.bytes) {
      const count = readSync(descriptor, buffer, 0,
        Math.min(buffer.length, checked.bytes - offset), offset);
      if (count < 1) fail("SOURCE_FILE_SHORT", relative);
      hash.update(buffer.subarray(0, count)); offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs) {
      fail("SOURCE_FILE_CHANGED", relative);
    }
    return { path: relative, bytes: checked.bytes,
      sha256: `sha256:${hash.digest("hex")}` };
  } finally { closeSync(descriptor); }
}
function walkPrivate(root) {
  const files = [];
  function visit(directory, prefix) {
    const status = lstatSync(directory, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700) fail("SOURCE_DIRECTORY_INVALID", prefix);
    for (const name of readdirSync(directory).sort()) {
      const target = path.join(directory, name);
      const relative = prefix ? `${prefix}/${name}` : name;
      const child = lstatSync(target, { bigint: true });
      if (child.isSymbolicLink()) fail("SOURCE_SYMLINK", relative);
      if (child.isDirectory()) visit(target, relative);
      else if (child.isFile()) {
        if (Number(child.mode & 0o777n) !== 0o600) fail("SOURCE_MODE_INVALID", relative);
        files.push(relative);
      } else fail("SOURCE_TYPE_INVALID", relative);
    }
  }
  visit(path.resolve(root), ""); return files;
}

function projectedTree(tree, specification) {
  if (!Array.isArray(tree) || tree.length !== 205) fail("TREE_COUNT", specification.key);
  const directories = tree.filter((item) => item.type === "directory");
  const files = tree.filter((item) => item.type === "file");
  if (directories.length !== 3 || files.length !== 202
    || !same(sorted(directories.map((item) => item.path)), ["test", "train", "val"])
    || files.reduce((sum, item) => sum + item.size, 0) !== specification.treeBytes) {
    fail("TREE_CENSUS", specification.key);
  }
  const h5 = files.filter((item) => item.path.endsWith(".h5"));
  const splitCounts = Object.fromEntries(["test", "train", "val"].map((split) => [split,
    h5.filter((item) => item.path.startsWith(`${split}/`)).length]));
  if (h5.length !== 200 || splitCounts.train !== 100 || splitCounts.val !== 50
    || splitCounts.test !== 50 || files.some((item) => !["README.md", ".gitattributes"]
      .includes(item.path) && !/^(?:train|val|test)\/episode_\d{3}_seed_\d+\.h5$/u.test(item.path))) {
    fail("TREE_SPLITS", specification.key);
  }
  const selected = files.find((item) => item.path === specification.selected.path);
  if (!selected || selected.size !== specification.selected.bytes
    || selected.oid !== specification.selected.oid
    || selected.lfs?.oid !== specification.selected.lfsOid
    || selected.lfs?.size !== specification.selected.bytes
    || selected.xetHash !== specification.selected.xetHash) {
    fail("TREE_SELECTED_IDENTITY", specification.key);
  }
  const projected = tree.map((item) => ({ type: item.type, path: item.path,
    oid: item.oid, size: item.size, lfs: item.lfs ?? null,
    xetHash: item.xetHash ?? null }));
  return { entries: 205, files: 202, directories: 3,
    bytes: specification.treeBytes, hdf5Files: 200, splitCounts,
    treeRoot: digest(TREE_DOMAIN, projected), filePaths: sorted(files.map((item) => item.path)) };
}

function projectedRecord(record, specification) {
  const siblings = Array.isArray(record.siblings)
    ? sorted(record.siblings.map((item) => item.rfilename)) : [];
  if (record.id !== specification.datasetId || record.sha !== specification.revision
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.cardData?.license !== specification.cardLicense
    || record.usedStorage !== specification.recordUsedStorageBytes || siblings.length !== 202
    || siblings.includes("LICENSE")) fail("RECORD", specification.key);
  const projection = { id: record.id, sha: record.sha, private: record.private,
    gated: record.gated, disabled: record.disabled,
    cardLicense: record.cardData.license, usedStorage: record.usedStorage, siblings };
  return { ...projection, recordRoot: digest(RECORD_DOMAIN, projection) };
}

function inspectRepository(sourceRoot, specification) {
  const prefix = `metadata/${specification.key}`;
  const beforeRecordBytes = readRegular(sourceRoot, `${prefix}-record-before.json`, MAX_JSON_BYTES);
  const afterRecordBytes = readRegular(sourceRoot, `${prefix}-record-after.json`, MAX_JSON_BYTES);
  const beforeTreeBytes = readRegular(sourceRoot, `${prefix}-tree-before.json`, MAX_JSON_BYTES);
  const afterTreeBytes = readRegular(sourceRoot, `${prefix}-tree-after.json`, MAX_JSON_BYTES);
  const beforeRecord = projectedRecord(strictJson(beforeRecordBytes, "RECORD_JSON"), specification);
  const afterRecord = projectedRecord(strictJson(afterRecordBytes, "RECORD_JSON"), specification);
  const beforeTree = projectedTree(strictJson(beforeTreeBytes, "TREE_JSON"), specification);
  const afterTree = projectedTree(strictJson(afterTreeBytes, "TREE_JSON"), specification);
  if (beforeRecord.recordRoot !== afterRecord.recordRoot
    || beforeTree.treeRoot !== afterTree.treeRoot
    || !same(beforeRecord.siblings, beforeTree.filePaths)) fail("BRACKET_DRIFT", specification.key);
  const readme = readRegular(sourceRoot, `files/${specification.key}/README.md`, MAX_SMALL_BYTES);
  if (readme.length !== specification.readmeBytes
    || hieshSequenceRecoverySha256(readme) !== specification.readmeSha256) {
    fail("README_IDENTITY", specification.key);
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(readme);
  if (!text.includes("ManiSkill/SAPIEN benchmark") || !text.includes("RGB/state")
    || !text.includes("actions, and metadata") || !/imitation\s+learning/u.test(text)) {
    fail("README_SEMANTICS", specification.key);
  }
  const attributes = readRegular(sourceRoot,
    `files/${specification.key}/.gitattributes`, MAX_SMALL_BYTES);
  const head = strictJson(readRegular(sourceRoot,
    `metadata/${specification.key}-selected-h5-head.json`, MAX_SMALL_BYTES), "HEAD_JSON");
  if (head.datasetId !== specification.datasetId || head.revision !== specification.revision
    || head.path !== specification.selected.path || ![200, 302, 307].includes(head.status)
    || head.xRepoCommit !== specification.revision
    || Number(head.xLinkedSize) !== specification.selected.bytes
    || head.xLinkedEtag?.replaceAll('"', "") !== specification.selected.lfsOid
    || head.xXetHash !== specification.selected.xetHash) fail("HEAD_IDENTITY", specification.key);
  return { key: specification.key, datasetId: specification.datasetId,
    revision: specification.revision, public: true, gated: false, disabled: false,
    cardLicenseClaim: specification.cardLicense, repositoryLicenseFilePresent: false,
    recordUsedStorageBytes: specification.recordUsedStorageBytes,
    recordTreeByteDelta: specification.treeBytes - specification.recordUsedStorageBytes,
    recordBeforeAfterByteIdentical: beforeRecordBytes.equals(afterRecordBytes),
    treeBeforeAfterByteIdentical: beforeTreeBytes.equals(afterTreeBytes),
    recordRoot: beforeRecord.recordRoot, treeRoot: beforeTree.treeRoot,
    inventory: { entries: beforeTree.entries, files: beforeTree.files,
      directories: beforeTree.directories, bytes: beforeTree.bytes,
      hdf5Files: beforeTree.hdf5Files, splitCounts: beforeTree.splitCounts },
    selectedHdf5: { ...specification.selected, payloadAcquired: false,
      headResolutionPinned: true },
    readmeSha256: hieshSequenceRecoverySha256(readme),
    gitattributesSha256: hieshSequenceRecoverySha256(attributes),
  };
}

function verifyTerminalEvidence(bytes) {
  const terminal = strictJson(bytes, "TERMINAL_JSON");
  const claimed = terminal.evidenceHash; const body = { ...terminal }; delete body.evidenceHash;
  if (terminal.schema !== HIESH_SEQUENCE_RECOVERY_TERMINAL_SCHEMA
    || terminal.status !== HIESH_SEQUENCE_RECOVERY_DISPOSITION
    || claimed !== digest(TERMINAL_DOMAIN, body)) fail("TERMINAL_HASH");
  const ranges = terminal.horizontal?.ranges;
  const images = terminal.horizontal?.imageStorageIntervals;
  const overlaps = terminal.failure?.overlaps;
  if (!Array.isArray(ranges) || ranges.length !== 33_001
    || !Array.isArray(images) || images.length !== 980
    || !Array.isArray(overlaps) || overlaps.length !== 492
    || terminal.horizontal.rangeCount !== 33_001
    || terminal.horizontal.rangeBytes !== 5_389_440
    || terminal.vertical.rangeCount !== 0 || terminal.vertical.rangeBytes !== 0
    || terminal.horizontal.rangeRoot !== digest(RANGE_DOMAIN, ranges)
    || terminal.horizontal.imageStorageRoot !== digest(IMAGE_DOMAIN, images)
    || terminal.failure.overlapRoot !== digest(OVERLAP_DOMAIN, overlaps)) {
    fail("TERMINAL_CENSUS");
  }
  let rangeBytes = 0; let priorEnd = -1;
  for (const item of ranges) {
    if (!Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end)
      || item.start < 0 || item.end < item.start || item.start <= priorEnd
      || item.bytes !== item.end - item.start + 1 || item.status !== 206
      || item.contentRange !== `bytes ${item.start}-${item.end}/326679376`
      || item.contentLength !== String(item.bytes) || item.contentEncoding !== null
      || item.etag !== `"${HIESH_SEQUENCE_RECOVERY_REPOSITORIES[0].selected.xetHash}"`
      || item.signedQueryPersisted !== false || !HASH.test(item.sha256)) {
      fail("TERMINAL_RANGE");
    }
    priorEnd = item.end; rangeBytes += item.bytes;
  }
  const affectedPaths = new Set(); const affectedRanges = new Set(); let overlapBytes = 0;
  for (const event of overlaps) {
    const start = Math.max(event.rangeStart, event.imageStart);
    const end = Math.min(event.rangeEnd, event.imageEnd);
    if (start !== event.overlapStart || end !== event.overlapEnd
      || event.overlapBytes !== end - start + 1 || !HASH.test(event.rangeSha256)) {
      fail("TERMINAL_OVERLAP");
    }
    affectedPaths.add(event.path); affectedRanges.add(`${event.rangeStart}:${event.rangeEnd}`);
    overlapBytes += event.overlapBytes;
  }
  if (rangeBytes !== 5_389_440 || affectedPaths.size !== 490
    || affectedRanges.size !== 492 || overlapBytes !== 133_400
    || terminal.failure.affectedImageDatasets !== 490
    || terminal.failure.affectedRanges !== 492
    || terminal.failure.overlapBytes !== 133_400
    || !same(terminal.failure.overlapByteHistogram,
      { 40: 2, 128: 1, 272: 487, 360: 1, 368: 1 })
    || !same(terminal.failure.affectedSuffixCounts, { front_rgb: 2, wrist_rgb: 488 })
    || terminal.failure.safeNonImageClosureProven !== false
    || terminal.rawExploratoryCheckpoint.copiedIntoArtifact !== false
    || terminal.rawExploratoryCheckpoint.payloadBytesRepublished !== 0
    || terminal.wholeFileFallbackUsed !== false
    || terminal.nonImageValuesDecoded !== false
    || terminal.publisherCodeOrPickleExecuted !== false) fail("TERMINAL_BOUNDARY");
  return { evidenceHash: claimed, rangeCount: 33_001, rangeBytes,
    imageStorageIntervals: 980, overlapEvents: 492,
    affectedImageDatasets: 490, affectedRanges: 492, overlapBytes: 133_400,
    horizontalLayout: terminal.horizontal.layout,
    verticalRangeCount: 0, verticalRangeBytes: 0,
    firstOverlap: terminal.failure.firstOverlap,
    lastOverlap: terminal.failure.lastOverlap,
    rangeRoot: terminal.horizontal.rangeRoot,
    imageStorageRoot: terminal.horizontal.imageStorageRoot,
    overlapRoot: terminal.failure.overlapRoot };
}

function expectedSourceFiles() {
  return sorted([
    "metadata/horizontal-record-before.json", "metadata/horizontal-record-after.json",
    "metadata/horizontal-tree-before.json", "metadata/horizontal-tree-after.json",
    "metadata/horizontal-selected-h5-head.json",
    "metadata/vertical-record-before.json", "metadata/vertical-record-after.json",
    "metadata/vertical-tree-before.json", "metadata/vertical-tree-after.json",
    "metadata/vertical-selected-h5-head.json",
    "files/horizontal/README.md", "files/horizontal/.gitattributes",
    "files/vertical/README.md", "files/vertical/.gitattributes",
    "terminal-evidence.json",
  ]);
}

export function createHieshSequenceRecoverySourceManifestFromDirectory(sourceRoot) {
  const observed = walkPrivate(sourceRoot);
  if (observed.includes("source-manifest.json")) fail("MANIFEST_ALREADY_PRESENT");
  const expected = expectedSourceFiles();
  if (!same(observed, expected)) fail("SOURCE_FILE_SET", canonicalizeStrict(observed));
  const files = expected.map((relative) => hashRegular(sourceRoot, relative,
    relative === "terminal-evidence.json" ? MAX_JSON_BYTES : MAX_SMALL_BYTES * 32));
  const body = { schema: SOURCE_SCHEMA,
    sourceType: "FIXED_REVISION_METADATA_ONLY_TERMINAL_SOURCE",
    rawExploratoryRangePayloadsIncluded: false,
    wholeHdf5PayloadsIncluded: false, files };
  return { ...body, sourceRoot: digest(SOURCE_ROOT_DOMAIN, files),
    manifestHash: digest(MANIFEST_DOMAIN, body) };
}

export function verifyHieshSequenceRecoverySourceDirectory(sourceRoot) {
  try {
    const manifest = strictJson(readRegular(sourceRoot, "source-manifest.json", MAX_JSON_BYTES),
      "MANIFEST_JSON");
    const observed = walkPrivate(sourceRoot);
    if (!same(observed, sorted([...expectedSourceFiles(), "source-manifest.json"]))) {
      fail("SOURCE_FILE_SET");
    }
    const files = expectedSourceFiles().map((relative) => hashRegular(sourceRoot, relative,
      relative === "terminal-evidence.json" ? MAX_JSON_BYTES : MAX_SMALL_BYTES * 32));
    const body = { schema: SOURCE_SCHEMA,
      sourceType: "FIXED_REVISION_METADATA_ONLY_TERMINAL_SOURCE",
      rawExploratoryRangePayloadsIncluded: false,
      wholeHdf5PayloadsIncluded: false, files };
    const expected = { ...body, sourceRoot: digest(SOURCE_ROOT_DOMAIN, files),
      manifestHash: digest(MANIFEST_DOMAIN, body) };
    if (!same(manifest, expected)) fail("MANIFEST_INVALID");
    const repositories = HIESH_SEQUENCE_RECOVERY_REPOSITORIES
      .map((specification) => inspectRepository(sourceRoot, specification));
    const terminal = verifyTerminalEvidence(
      readRegular(sourceRoot, "terminal-evidence.json", MAX_JSON_BYTES));
    return { ok: true, verificationLevel:
      "FIXED_TWO_REPOSITORY_METADATA_ONLY_TERMINAL_SOURCE_REDERIVED",
    manifest, manifestFileSha256: hieshSequenceRecoverySha256(
      readRegular(sourceRoot, "source-manifest.json", MAX_JSON_BYTES)),
    repositories, terminal };
  } catch (error) { return { ok: false, error: error?.message ?? String(error) }; }
}

export function buildHieshSequenceRecoveryReportFromSource(sourceRoot) {
  const checked = verifyHieshSequenceRecoverySourceDirectory(sourceRoot);
  if (!checked.ok) fail("SOURCE_VERIFY", checked.error);
  const body = {
    schema: HIESH_SEQUENCE_RECOVERY_REPORT_SCHEMA,
    disposition: HIESH_SEQUENCE_RECOVERY_DISPOSITION,
    source: { repositories: checked.repositories,
      sourceManifestHash: checked.manifest.manifestHash,
      sourceManifestFileSha256: checked.manifestFileSha256,
      sourceRoot: checked.manifest.sourceRoot,
      pairSelection: { split: "test", ordinal: 21,
        horizontalSeed: 43100, verticalSeed: 63100,
        sameOrdinalAcrossPublisherRepositories: true,
        exactCrossRepositoryTrajectoryIdentityProven: false,
        causalPairingOrChronologyProven: false } },
    terminalPreflight: { ...checked.terminal,
      requestedClosure: "NON_IMAGE_NUMERIC_EPISODE_OBJECT_CLOSURE",
      closureCompleted: false,
      failureCode: "IMAGE_PAYLOAD_READ_DURING_LAYOUT",
      libhdf5MetadataReadAheadCrossedImageStorage: true,
      horizontalExploratoryRangesPrivateOutsideArtifact: true,
      rawRangePayloadsProjected: false,
      rangeHeadersAndPayloadHashesProjected: true,
      verticalRangesAcquired: 0,
      wholeFileFallbackUsed: false,
      hdf5ValuesDecoded: false,
      metadataOnlyTerminalDisposition: true },
    semanticBoundary: {
      publisherTaskFamily: "SequenceRecovery",
      publisherBenchmarkClaim: "ManiSkill/SAPIEN RoboMME simulation benchmark",
      repositoryNamesContainRecovery: true,
      recoveryIsPublisherTaskAndSourceNamingOnly: true,
      rawEpisodeStateActionValuesAvailableInArtifact: false,
      nativeOutcomeRows: 0, independentOutcomeRows: 0,
      nativeInterventionRows: 0, recoveryEffectRows: 0,
      completeAttemptCensusRows: 0, physicalWitnessRows: 0,
      realWorldExecutionRows: 0 },
    rightsPrivacyAndUse: {
      rights: { datasetCardLicenseClaims: ["mit", "mit"],
        repositoryLicenseFilesPresent: 0,
        upstreamRoboMMERightsVerifiedFromSelectedBytes: false,
        rightsDisposition: "FAIL_CLOSED", authorizedTrainingRows: 0 },
      privacy: { rawExploratoryRangesPrivate: true,
        rawHdf5PayloadBytesInArtifact: 0, noPiiGuaranteed: false,
        imagePixelsPresentInSourceRepositories: true,
        imagePixelsPublishedByArtifact: false },
      use: { quarantineEvaluationOnly: true, networkAdmissionRows: 0,
        authorityRows: 0, delegationAuthorityRows: 0,
        causalEffectUnitRows: 0, autonomousActionAuthorized: false } },
    zeroClaimBoundary: { nativeOutcomeRows: 0, independentOutcomeRows: 0,
      recoveryEffectRows: 0, attemptCensusRows: 0, physicalWitnessRows: 0,
      realWorldRows: 0, authorizedTrainingRows: 0, networkAdmissionRows: 0,
      authorityRows: 0, causalEffectUnitRows: 0 },
  };
  return { ...body, artifactHash: digest(REPORT_DOMAIN, body) };
}

export function createHieshSequenceRecoveryReceipt(report) {
  if (report?.schema !== HIESH_SEQUENCE_RECOVERY_REPORT_SCHEMA
    || !HASH.test(report.artifactHash)) fail("REPORT_FOR_RECEIPT");
  const body = { schema: HIESH_SEQUENCE_RECOVERY_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceRoot: report.source.sourceRoot,
    disposition: report.disposition, rangePayloadBytesRepublished: 0,
    wholeHdf5PayloadsAcquired: 0, verticalRangeCount: 0,
    receiptWrittenLast: true, noClobber: true };
  return { ...body, receiptHash: digest(RECEIPT_DOMAIN, body) };
}

export function verifyHieshSequenceRecoveryArtifactDirectory(artifactRoot) {
  try {
    const files = walkPrivate(artifactRoot);
    if (!files.includes("report.json") || !files.includes("receipt.json")) fail("ARTIFACT_SET");
    const report = strictJson(readRegular(artifactRoot, "report.json", MAX_JSON_BYTES), "REPORT_JSON");
    const receipt = strictJson(readRegular(artifactRoot, "receipt.json", MAX_JSON_BYTES), "RECEIPT_JSON");
    const expectedReport = buildHieshSequenceRecoveryReportFromSource(
      checkedPath(artifactRoot, "source"));
    const expectedReceipt = createHieshSequenceRecoveryReceipt(expectedReport);
    if (!same(report, expectedReport) || !same(receipt, expectedReceipt)) fail("ARTIFACT_REPLAY");
    return { ok: true, verificationLevel:
      "FIXED_TWO_REPOSITORY_METADATA_ONLY_TERMINAL_SOURCE_REDERIVED",
    report, receipt,
    reportFileSha256: hieshSequenceRecoverySha256(
      readRegular(artifactRoot, "report.json", MAX_JSON_BYTES)),
    receiptFileSha256: hieshSequenceRecoverySha256(
      readRegular(artifactRoot, "receipt.json", MAX_JSON_BYTES)) };
  } catch (error) { return { ok: false, error: error?.message ?? String(error) }; }
}
