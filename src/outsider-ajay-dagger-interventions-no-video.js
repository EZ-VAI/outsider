/*
 * Complete no-video replay for Ajay's balanced DAgger intervention release
 * and its fixed base revision.  The first 495 derived Parquets are byte-exact
 * base copies.  The remaining 218 episode instances collapse, by native
 * provenance, to 84 human-intervention segments rather than 218 attempts.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, existsSync, fstatSync, lstatSync, openSync,
  readFileSync, readSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "./canonical.js";

export const AJAY_DAGGER_DERIVED_ID =
  "ajaysri/route_subtasks_dual_overhead_pi05_448_dagger_interventions_balanced";
export const AJAY_DAGGER_DERIVED_REVISION =
  "05af6eeb8c525f76cc1b7b9c0f156cf546adf71e";
export const AJAY_DAGGER_BASE_ID = "ajaysri/route_subtasks_dual_overhead_pi05_448";
export const AJAY_DAGGER_BASE_REVISION =
  "2c95bea69a0aa9874669548ba3e506e71ff936de";
export const AJAY_DAGGER_REPORT_SCHEMA =
  "outsider/ajay-dagger-interventions-no-video/v1";
export const AJAY_DAGGER_RECEIPT_SCHEMA =
  "outsider/ajay-dagger-interventions-no-video-receipt/v1";
export const AJAY_DAGGER_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const ACQUISITION_SCHEMA = "outsider/ajay-dagger-interventions-no-video-acquisition/v1";
const REPLAY_SCHEMA = "outsider/ajay-dagger-interventions-no-video-replay/v1";
const SOURCE_SCHEMA = "outsider/ajay-dagger-interventions-no-video-source/v1";
const ACQUISITION_DOMAIN = "outsider/ajay-dagger-acquisition/v1";
const REPLAY_DOMAIN = "outsider/ajay-dagger-replay/v1";
const TREE_DOMAIN = "outsider/ajay-dagger-tree/v1";
const RECORD_DOMAIN = "outsider/ajay-dagger-record/v1";
const SOURCE_ROOT_DOMAIN = "outsider/ajay-dagger-source-root/v1";
const MANIFEST_DOMAIN = "outsider/ajay-dagger-source-manifest/v1";
const REPORT_DOMAIN = "outsider/ajay-dagger-report/v1";
const RECEIPT_DOMAIN = "outsider/ajay-dagger-receipt/v1";
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_OBJECT_BYTES = 8 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
const REPLAY_SCRIPT = path.resolve(moduleDirectory, "../scripts/ajay-dagger-interventions-replay.py");
const PYTHON = "/opt/anaconda3/bin/python";

const REPOSITORIES = Object.freeze([
  Object.freeze({ key: "derived", id: AJAY_DAGGER_DERIVED_ID,
    revision: AJAY_DAGGER_DERIVED_REVISION, pages: 4, entries: 3_585,
    files: 3_575, directories: 10, bytes: 740_445_997,
    recordUsedStorageBytes: 679_156_309,
    videoFiles: 2_852, videoBytes: 704_955_105,
    noVideoFiles: 723, noVideoBytes: 35_490_892,
    parquetFiles: 713, parquetBytes: 30_305_026 }),
  Object.freeze({ key: "base", id: AJAY_DAGGER_BASE_ID,
    revision: AJAY_DAGGER_BASE_REVISION, pages: 3, entries: 2_989,
    files: 2_979, directories: 10, bytes: 649_845_522,
    recordUsedStorageBytes: 637_221_806,
    videoFiles: 1_980, videoBytes: 613_490_034,
    noVideoFiles: 999, noVideoBytes: 36_355_488,
    parquetFiles: 495, parquetBytes: 23_731_772 }),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `AJAY_DAGGER_${code}` : `AJAY_DAGGER_${code}:${detail}`);
}
export function ajayDaggerSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function gitOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes).digest("hex");
}
function digest(domain, value) {
  return ajayDaggerSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}
export function serializeAjayDaggerArtifact(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}
function same(left, right) { return canonicalizeStrict(left) === canonicalizeStrict(right); }
function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}
function strictJson(bytes, code) {
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(code); }
}
function safeRelative(value) {
  if (typeof value !== "string" || !value || value.startsWith("/")
    || value.includes("\\") || value.includes("\0")
    || value.split("/").some((part) => ["", ".", ".."].includes(part))
    || path.posix.normalize(value) !== value) fail("PATH", String(value));
  return value;
}
function checkedPath(root, relative) {
  safeRelative(relative); const base = path.resolve(root); const target = path.resolve(base, relative);
  const relation = path.relative(base, target);
  if (!relation || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH", relative);
  return target;
}
function checkedRegular(root, relative, maximumBytes) {
  const target = checkedPath(root, relative); const status = lstatSync(target, { bigint: true });
  if (!status.isFile() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o600 || status.size < 1n
    || status.size > BigInt(maximumBytes)) fail("SOURCE_FILE", relative);
  return { target, bytes: Number(status.size) };
}
function readRegular(root, relative, maximumBytes = MAX_JSON_BYTES) {
  return readFileSync(checkedRegular(root, relative, maximumBytes).target);
}
function hashRegular(root, relative, maximumBytes = MAX_OBJECT_BYTES) {
  const checked = checkedRegular(root, relative, maximumBytes);
  const descriptor = openSync(checked.target, O_RDONLY | O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true }); const hash = createHash("sha256");
    const git = createHash("sha1"); git.update(Buffer.from(`blob ${checked.bytes}\0`, "utf8"));
    const buffer = Buffer.allocUnsafe(1024 * 1024); let offset = 0;
    while (offset < checked.bytes) {
      const count = readSync(descriptor, buffer, 0,
        Math.min(buffer.length, checked.bytes - offset), offset);
      if (count < 1) fail("SOURCE_SHORT", relative);
      const chunk = buffer.subarray(0, count); hash.update(chunk); git.update(chunk); offset += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (before.size !== after.size || before.mtimeNs !== after.mtimeNs) fail("SOURCE_CHANGED", relative);
    return { path: relative, bytes: checked.bytes,
      sha256: `sha256:${hash.digest("hex")}`, gitOid: git.digest("hex") };
  } finally { closeSync(descriptor); }
}
function walkPrivate(root) {
  const files = [];
  function visit(directory, prefix) {
    const status = lstatSync(directory, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700) fail("SOURCE_DIRECTORY", prefix);
    for (const name of readdirSync(directory).sort()) {
      const target = path.join(directory, name); const relative = prefix ? `${prefix}/${name}` : name;
      const child = lstatSync(target, { bigint: true });
      if (child.isSymbolicLink()) fail("SOURCE_SYMLINK", relative);
      if (child.isDirectory()) visit(target, relative);
      else if (child.isFile()) {
        if (Number(child.mode & 0o777n) !== 0o600) fail("SOURCE_MODE", relative);
        files.push(relative);
      } else fail("SOURCE_TYPE", relative);
    }
  }
  visit(path.resolve(root), ""); return files;
}

function parseAcquisition(sourceRoot) {
  const acquisition = strictJson(readRegular(sourceRoot, "acquisition-index.json"), "ACQUISITION_JSON");
  const body = { ...acquisition }; delete body.acquisitionHash;
  if (acquisition.schema !== ACQUISITION_SCHEMA
    || acquisition.acquisitionHash !== digest(ACQUISITION_DOMAIN, body)
    || acquisition.completeDerivedNoVideo !== true || acquisition.completeBaseNoVideo !== true
    || acquisition.videoPayloadFilesAcquired !== 0 || acquisition.publisherCodeExecuted !== false
    || !Array.isArray(acquisition.repositories) || acquisition.repositories.length !== 2) {
    fail("ACQUISITION");
  }
  return acquisition;
}
function pageFile(key, phase, page, kind) {
  return `metadata/${key}-tree-${phase}-page-${String(page).padStart(3, "0")}.${kind}`;
}
function readTreePages(sourceRoot, specification, phase) {
  const entries = []; const raw = [];
  for (let page = 1; page <= specification.pages; page += 1) {
    const bytes = readRegular(sourceRoot, pageFile(specification.key, phase, page, "json"));
    const parsed = strictJson(bytes, "TREE_JSON");
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > 1000) fail("TREE_PAGE");
    entries.push(...parsed); raw.push(ajayDaggerSha256(bytes));
    const header = strictJson(readRegular(sourceRoot,
      pageFile(specification.key, phase, page, "headers.json")), "TREE_HEADER_JSON");
    if (header.status !== 200 || typeof header.url !== "string"
      || !header.url.includes(specification.revision)) fail("TREE_HEADER");
  }
  return { entries, raw };
}
function treeProjection(entries, specification) {
  const files = entries.filter((item) => item.type === "file");
  const directories = entries.filter((item) => item.type === "directory");
  const video = files.filter((item) => item.path.endsWith(".mp4"));
  const noVideo = files.filter((item) => !item.path.endsWith(".mp4"));
  const parquet = noVideo.filter((item) => item.path.endsWith(".parquet"));
  const sum = (rows) => rows.reduce((total, item) => total + item.size, 0);
  if (entries.length !== specification.entries || files.length !== specification.files
    || directories.length !== specification.directories || sum(files) !== specification.bytes
    || video.length !== specification.videoFiles || sum(video) !== specification.videoBytes
    || noVideo.length !== specification.noVideoFiles || sum(noVideo) !== specification.noVideoBytes
    || parquet.length !== specification.parquetFiles || sum(parquet) !== specification.parquetBytes
    || files.some((item) => item.path === "LICENSE")) fail("TREE_CENSUS", specification.key);
  const projection = entries.map((item) => ({ type: item.type, path: item.path,
    oid: item.oid, size: item.size, lfs: item.lfs ?? null, xetHash: item.xetHash ?? null }));
  return { treeRoot: digest(TREE_DOMAIN, projection), files,
    noVideo: noVideo.sort((left, right) => left.path.localeCompare(right.path)),
    summary: { entries: entries.length, files: files.length, directories: directories.length,
      bytes: sum(files), noVideoFiles: noVideo.length, noVideoBytes: sum(noVideo),
      parquetFiles: parquet.length, parquetBytes: sum(parquet),
      inventoryOnlyVideoFiles: video.length, inventoryOnlyVideoBytes: sum(video) } };
}
function recordProjection(sourceRoot, specification, phase, filePaths) {
  const bytes = readRegular(sourceRoot, `metadata/${specification.key}-record-${phase}.json`);
  const record = strictJson(bytes, "RECORD_JSON");
  const siblings = sorted((record.siblings ?? []).map((item) => item.rfilename));
  if (record.id !== specification.id || record.sha !== specification.revision
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.cardData?.license !== "apache-2.0"
    || record.usedStorage !== specification.recordUsedStorageBytes
    || !same(siblings, sorted(filePaths))) fail("RECORD", specification.key);
  const header = strictJson(readRegular(sourceRoot,
    `metadata/${specification.key}-record-${phase}.headers.json`), "RECORD_HEADER_JSON");
  if (header.status !== 200 || typeof header.url !== "string"
    || !header.url.includes(specification.revision)) fail("RECORD_HEADER");
  const projection = { id: record.id, sha: record.sha, private: record.private,
    gated: record.gated, disabled: record.disabled, license: record.cardData.license,
    usedStorage: record.usedStorage, siblings };
  return { bytes, recordRoot: digest(RECORD_DOMAIN, projection) };
}
function verifyRepository(sourceRoot, specification, acquired) {
  if (acquired.key !== specification.key || acquired.id !== specification.id
    || acquired.revision !== specification.revision
    || acquired.beforePages !== specification.pages || acquired.afterPages !== specification.pages
    || acquired.recordUsedStorageBytes !== specification.recordUsedStorageBytes
    || acquired.recordBeforeAfterByteIdentical !== true) fail("ACQUISITION_REPOSITORY");
  const beforePages = readTreePages(sourceRoot, specification, "before");
  const afterPages = readTreePages(sourceRoot, specification, "after");
  const before = treeProjection(beforePages.entries, specification);
  const after = treeProjection(afterPages.entries, specification);
  const beforeRecord = recordProjection(sourceRoot, specification, "before",
    before.files.map((item) => item.path));
  const afterRecord = recordProjection(sourceRoot, specification, "after",
    after.files.map((item) => item.path));
  const acquisitionSummary = { entries: before.summary.entries,
    files: before.summary.files, directories: before.summary.directories,
    bytes: before.summary.bytes,
    videoFiles: before.summary.inventoryOnlyVideoFiles,
    videoBytes: before.summary.inventoryOnlyVideoBytes,
    noVideoFiles: before.summary.noVideoFiles,
    noVideoBytes: before.summary.noVideoBytes,
    parquetFiles: before.summary.parquetFiles,
    parquetBytes: before.summary.parquetBytes };
  if (before.treeRoot !== after.treeRoot || before.treeRoot !== acquired.treeRoot
    || beforeRecord.recordRoot !== afterRecord.recordRoot
    || beforeRecord.recordRoot !== acquired.recordRoot
    || !same(acquisitionSummary, acquired.treeSummary)) fail("BRACKET", specification.key);
  const expectedByPath = new Map(before.noVideo.map((item) => [item.path, item]));
  if (!Array.isArray(acquired.objects) || acquired.objects.length !== specification.noVideoFiles
    || !same(acquired.objects.map((item) => item.path), before.noVideo.map((item) => item.path))) {
    fail("OBJECT_SET", specification.key);
  }
  let verifiedBytes = 0; let lfsFiles = 0; let gitFiles = 0;
  for (const object of acquired.objects) {
    const expected = expectedByPath.get(object.path);
    if (!expected || object.bytes !== expected.size || object.oid !== expected.oid
      || !same(object.lfs, expected.lfs ?? null) || object.xetHash !== (expected.xetHash ?? null)
      || !HASH.test(object.sha256)) fail("OBJECT_IDENTITY", object.path);
    const checked = hashRegular(sourceRoot, `files/${specification.key}/${object.path}`,
      Math.max(MAX_OBJECT_BYTES, object.bytes));
    if (checked.bytes !== object.bytes || checked.sha256 !== object.sha256) fail("OBJECT_HASH", object.path);
    if (object.lfs) {
      lfsFiles += 1;
      if (object.sha256 !== `sha256:${object.lfs.oid}` || object.lfs.size !== object.bytes) {
        fail("OBJECT_LFS", object.path);
      }
    } else {
      gitFiles += 1;
      if (checked.gitOid !== object.oid) fail("OBJECT_GIT", object.path);
    }
    verifiedBytes += object.bytes;
  }
  if (verifiedBytes !== specification.noVideoBytes) fail("OBJECT_BYTES");
  return { key: specification.key, datasetId: specification.id,
    revision: specification.revision, public: true, gated: false, disabled: false,
    cardLicenseClaim: "apache-2.0", repositoryLicenseFilePresent: false,
    recordUsedStorageBytes: specification.recordUsedStorageBytes,
    recordTreeByteDelta: specification.bytes - specification.recordUsedStorageBytes,
    recordBeforeAfterByteIdentical: beforeRecord.bytes.equals(afterRecord.bytes),
    treeBeforeAfterPageBytesIdentical: same(beforePages.raw, afterPages.raw),
    fullTreeRoot: before.treeRoot, recordRoot: beforeRecord.recordRoot,
    treePagesBefore: specification.pages, treePagesAfter: specification.pages,
    inventory: before.summary, completeNoVideoSourceAcquired: true,
    noVideoObjectsVerified: acquired.objects.length, noVideoBytesVerified: verifiedBytes,
    lfsObjectsVerified: lfsFiles, gitObjectsVerified: gitFiles,
    videoPayloadFilesAcquired: 0 };
}

function runReplay(sourceRoot) {
  if (!existsSync(PYTHON) || !existsSync(REPLAY_SCRIPT)) fail("REPLAY_RUNTIME");
  const result = spawnSync(PYTHON, [REPLAY_SCRIPT, "--source-root", path.resolve(sourceRoot)], {
    encoding: "utf8", maxBuffer: 2 * 1024 * 1024,
    env: { ...process.env, PYTHONWARNINGS: "ignore" },
  });
  if (result.status !== 0) fail("REPLAY_FAILED", result.stderr.trim());
  const replay = strictJson(Buffer.from(result.stdout, "utf8"), "REPLAY_JSON");
  const body = { ...replay }; delete body.replayHash;
  if (replay.schema !== REPLAY_SCHEMA || replay.replayHash !== digest(REPLAY_DOMAIN, body)) {
    fail("REPLAY_HASH");
  }
  return replay;
}

export function createAjayDaggerSourceManifestFromDirectory(sourceRoot) {
  const acquisition = parseAcquisition(sourceRoot);
  const replay = strictJson(readRegular(sourceRoot, "replay-evidence.json"), "REPLAY_EVIDENCE_JSON");
  const derived = runReplay(sourceRoot);
  if (!same(replay, derived)) fail("REPLAY_EVIDENCE_DRIFT");
  const observed = walkPrivate(sourceRoot);
  if (observed.includes("source-manifest.json")) fail("MANIFEST_ALREADY_PRESENT");
  const files = observed.map((relative) => hashRegular(sourceRoot, relative,
    relative.startsWith("files/") ? MAX_OBJECT_BYTES : MAX_JSON_BYTES));
  const body = { schema: SOURCE_SCHEMA,
    sourceType: "FIXED_DERIVED_AND_BASE_COMPLETE_NO_VIDEO_SOURCE",
    acquisitionHash: acquisition.acquisitionHash, replayHash: replay.replayHash,
    videoPayloadFilesIncluded: 0, publisherCodeExecuted: false,
    files: files.map(({ gitOid: _gitOid, ...item }) => item) };
  return { ...body, sourceRoot: digest(SOURCE_ROOT_DOMAIN, body.files),
    manifestHash: digest(MANIFEST_DOMAIN, body) };
}

export function verifyAjayDaggerSourceDirectory(sourceRoot) {
  try {
    const manifest = strictJson(readRegular(sourceRoot, "source-manifest.json"), "MANIFEST_JSON");
    const acquisition = parseAcquisition(sourceRoot);
    const repositories = REPOSITORIES.map((specification) => verifyRepository(sourceRoot,
      specification, acquisition.repositories.find((item) => item.key === specification.key)));
    const replayStored = strictJson(readRegular(sourceRoot, "replay-evidence.json"), "REPLAY_JSON");
    const replay = runReplay(sourceRoot);
    if (!same(replayStored, replay)) fail("REPLAY_EVIDENCE_DRIFT");
    const observed = walkPrivate(sourceRoot);
    const sourceFiles = observed.filter((relative) => relative !== "source-manifest.json");
    const files = sourceFiles.map((relative) => hashRegular(sourceRoot, relative,
      relative.startsWith("files/") ? MAX_OBJECT_BYTES : MAX_JSON_BYTES))
      .map(({ gitOid: _gitOid, ...item }) => item);
    const body = { schema: SOURCE_SCHEMA,
      sourceType: "FIXED_DERIVED_AND_BASE_COMPLETE_NO_VIDEO_SOURCE",
      acquisitionHash: acquisition.acquisitionHash, replayHash: replay.replayHash,
      videoPayloadFilesIncluded: 0, publisherCodeExecuted: false, files };
    const expected = { ...body, sourceRoot: digest(SOURCE_ROOT_DOMAIN, files),
      manifestHash: digest(MANIFEST_DOMAIN, body) };
    if (!same(manifest, expected)) fail("MANIFEST");
    return { ok: true, verificationLevel:
      "FIXED_DERIVED_AND_BASE_COMPLETE_NO_VIDEO_SOURCE_REDERIVED",
    manifest, manifestFileSha256: ajayDaggerSha256(
      readRegular(sourceRoot, "source-manifest.json")), acquisition, repositories, replay };
  } catch (error) { return { ok: false, error: error?.message ?? String(error) }; }
}

export function buildAjayDaggerReportFromSource(sourceRoot) {
  const checked = verifyAjayDaggerSourceDirectory(sourceRoot);
  if (!checked.ok) fail("SOURCE_VERIFY", checked.error);
  const interventionFields = ["metadata.dagger.is_dagger", "metadata.dagger.copy_index",
    "metadata.dagger.demo_id", "metadata.dagger.rollout_id",
    "metadata.source_dataset", "metadata.source_episode_index",
    "metadata.source_frame_index", "metadata.source_start_frame",
    "metadata.source_end_frame_exclusive"];
  const body = {
    schema: AJAY_DAGGER_REPORT_SCHEMA, disposition: AJAY_DAGGER_DISPOSITION,
    source: { repositories: checked.repositories,
      acquisitionHash: checked.acquisition.acquisitionHash,
      replayHash: checked.replay.replayHash,
      sourceManifestHash: checked.manifest.manifestHash,
      sourceManifestFileSha256: checked.manifestFileSha256,
      sourceRoot: checked.manifest.sourceRoot,
      completeDerivedNoVideo: true, completeFixedBaseNoVideo: true,
      selectedRemoteBytes: checked.repositories.reduce(
        (sum, item) => sum + item.noVideoBytesVerified, 0),
      fullRepositoryVideoObjectsInventoryOnly: true, videoPayloadFilesAcquired: 0 },
    replay: checked.replay,
    typedDenominators: {
      derivedPopulation: { populationType: "DERIVED_WEIGHTED_TRAINING_INSTANCES",
        episodes: 713, frames: 164_019 },
      basePublisherPopulation: { populationType: "BASE_SOURCE_PREFIX_DUPLICATED_IN_DERIVED",
        episodes: 495, frames: 128_742, byteIdenticalDerivedPrefixParquets: 495,
        addToDerivedPopulation: false },
      publisherNativeInterventionFamily: {
        populationType: "UNIQUE_PUBLISHER_DAGGER_PROVENANCE_SEGMENTS",
        segments: 84, frames: 13_920, placementSegments: 34,
        placementFrames: 6_483, routingSegments: 50, routingFrames: 7_437,
        provenanceFields: interventionFields },
      weightedInterventionExposure: {
        populationType: "WEIGHTED_COPY_INSTANCES_NOT_INDEPENDENT_INTERVENTIONS",
        episodeInstances: 218, frames: 35_277, placementInstances: 68,
        placementFrames: 12_966, routingInstances: 150, routingFrames: 22_311 },
      crossTotal: null,
    },
    semanticBoundary: {
      publisherRealDatasetTagRetained: true,
      publisherActivelyInterveningHumanClaimRetained: true,
      nativeDaggerMembershipField: "metadata.dagger.is_dagger",
      nativeInterventionProvenanceFields: interventionFields,
      weightedCopiesCollapsedByNativeProvenanceAndSemanticContent: true,
      baseRouteSegmentsAreNotAttemptsOrOutcomes: true,
      daggerInterventionDoesNotEstablishRecovery: true,
      publisherInterventionSegments: 84, publisherInterventionFrames: 13_920,
      nativeOutcomeRows: 0, independentOutcomeRows: 0,
      recoveryEffectRows: 0, completeAttemptCensusRows: 0,
      independentPhysicalWitnessRows: 0, independentCausalEffectRows: 0 },
    rightsPrivacyAndUse: {
      rights: { derivedCardLicenseClaim: "apache-2.0",
        baseCardLicenseClaim: "apache-2.0", repositoryLicenseFilesPresent: 0,
        upstreamCollectionRightsClosedFromSelectedBytes: false,
        rightsDisposition: "FAIL_CLOSED", authorizedTrainingRows: 0 },
      privacy: { rawSourcePrivate: true, noPiiGuaranteed: false,
        videoPayloadsAcquired: false, previewImagePresentInNoVideoSupport: true,
        independentPrivacyReviewRows: 0 },
      use: { quarantineEvaluationOnly: true, networkAdmissionRows: 0,
        authorityRows: 0, delegationAuthorityRows: 0,
        causalEffectUnitRows: 0, autonomousActionAuthorized: false } },
    zeroClaimBoundary: { nativeOutcomeRows: 0, independentOutcomeRows: 0,
      recoveryEffectRows: 0, attemptCensusRows: 0,
      independentPhysicalWitnessRows: 0, authorizedTrainingRows: 0,
      networkAdmissionRows: 0, authorityRows: 0, causalEffectUnitRows: 0 },
  };
  return { ...body, artifactHash: digest(REPORT_DOMAIN, body) };
}

export function createAjayDaggerReceipt(report) {
  if (report?.schema !== AJAY_DAGGER_REPORT_SCHEMA || !HASH.test(report.artifactHash)) {
    fail("REPORT_FOR_RECEIPT");
  }
  const body = { schema: AJAY_DAGGER_RECEIPT_SCHEMA,
    reportHash: report.artifactHash, sourceManifestHash: report.source.sourceManifestHash,
    sourceRoot: report.source.sourceRoot, disposition: report.disposition,
    derivedEpisodes: 713, derivedFrames: 164_019,
    uniquePublisherInterventionSegments: 84, uniquePublisherInterventionFrames: 13_920,
    weightedInterventionEpisodeInstances: 218, weightedInterventionFrames: 35_277,
    independentOutcomeRows: 0, recoveryEffectRows: 0,
    receiptWrittenLast: true, noClobber: true };
  return { ...body, receiptHash: digest(RECEIPT_DOMAIN, body) };
}

export function verifyAjayDaggerArtifactDirectory(artifactRoot) {
  try {
    const report = strictJson(readRegular(artifactRoot, "report.json"), "REPORT_JSON");
    const receipt = strictJson(readRegular(artifactRoot, "receipt.json"), "RECEIPT_JSON");
    const expectedReport = buildAjayDaggerReportFromSource(checkedPath(artifactRoot, "source"));
    const expectedReceipt = createAjayDaggerReceipt(expectedReport);
    if (!same(report, expectedReport) || !same(receipt, expectedReceipt)) fail("ARTIFACT_REPLAY");
    return { ok: true, verificationLevel:
      "FIXED_DERIVED_AND_BASE_COMPLETE_NO_VIDEO_SOURCE_REDERIVED",
    report, receipt,
    reportFileSha256: ajayDaggerSha256(readRegular(artifactRoot, "report.json")),
    receiptFileSha256: ajayDaggerSha256(readRegular(artifactRoot, "receipt.json")) };
  } catch (error) { return { ok: false, error: error?.message ?? String(error) }; }
}
