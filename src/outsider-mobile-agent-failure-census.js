/*
 * Mobile agent failure-trajectory census.
 *
 * The complete fixed 52-trajectory publisher selection is replayed, including
 * screenshots, UI XML, plans, executed actions and action-level annotations.
 * Screens and free text remain private.  Collection membership is a publisher
 * failure label; it is not an independent terminal outcome or executed repair.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const BufferFrom = Buffer.from;
const JSONParse = JSON.parse;
const ObjectHasOwn = Function.call.bind(Object.prototype.hasOwnProperty);
const PathResolve = path.resolve;
const PathRelative = path.relative;
const PathJoin = path.join;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const MOBILE_AGENT_FAILURE_SCHEMA =
  "outsider/mobile-agent-failure-census/v1";
export const MOBILE_AGENT_FAILURE_RECEIPT_SCHEMA =
  "outsider/mobile-agent-failure-census-receipt/v1";
export const MOBILE_AGENT_FAILURE_DATASET_ID = "orlando23/failed_agent_trajectory";
export const MOBILE_AGENT_FAILURE_DATASET_REVISION =
  "cc009a2a2673ac2702d37e75032f9ea4b56f708e";
export const MOBILE_AGENT_FAILURE_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/mobile-agent-failure-census-report/v1";
const RECEIPT_DOMAIN = "outsider/mobile-agent-failure-census-receipt/v1";
const MANIFEST_DOMAIN = "outsider/mobile-agent-failure-source-manifest/v1";
const TREE_PROJECTION_SHA256 =
  "sha256:f4592df7166d58cdafcafdc853e33b4582a7e0397a326db221f4a6a0ffa56a01";
const EXPECTED_USED_STORAGE = 167_701_001;
const EXPECTED_ENTRIES = 910;
const EXPECTED_FILES = 852;
const EXPECTED_DIRECTORIES = 58;
const EXPECTED_LOGICAL_BYTES = 114_844_591;
const EXPECTED_LFS_FILES = 288;
const MAX_SMALL_BYTES = 8 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code, detail = null) {
  throw new Error(detail === null ? `MOBILE_AGENT_FAILURE_${code}`
    : `MOBILE_AGENT_FAILURE_${code}:${detail}`);
}

function serialize(value) {
  return BufferFrom(`${canonicalizeStrict(value)}\n`, "utf8");
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256").update(domain).update("\0")
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function safeRelative(relative) {
  return typeof relative === "string" && relative.length > 0
    && !path.isAbsolute(relative) && !relative.split("/").includes("..")
    && !relative.includes("\\") && !relative.includes("\0");
}

function safePath(root, relative) {
  if (!safeRelative(relative)) fail("PATH_INVALID", relative);
  const full = PathResolve(root, relative);
  const rel = PathRelative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) fail("PATH_ESCAPE", relative);
  return full;
}

function requireDirectory(directory, expected = null) {
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o700) {
    fail("DIRECTORY_UNSAFE", directory);
  }
  if (expected !== null) {
    const names = readdirSync(directory).sort();
    if (names.join("\0") !== [...expected].sort().join("\0")) {
      fail("DIRECTORY_LAYOUT_INVALID", directory);
    }
  }
}

function hashFile(root, relative, expectedBytes = null, maxBytes = null) {
  const full = safePath(root, relative);
  const status = lstatSync(full);
  if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600) {
    fail("FILE_UNSAFE", relative);
  }
  if (expectedBytes !== null && status.size !== expectedBytes) fail("FILE_SIZE_MISMATCH", relative);
  if (maxBytes !== null && status.size > maxBytes) fail("FILE_TOO_LARGE", relative);
  const descriptor = openSync(full, O_RDONLY | O_NOFOLLOW);
  const contentHash = createHash("sha256");
  const gitHash = createHash("sha1");
  gitHash.update(`blob ${status.size}\0`);
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let total = 0;
  try {
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      const chunk = buffer.subarray(0, count);
      contentHash.update(chunk); gitHash.update(chunk); total += count;
    }
    const after = fstatSync(descriptor);
    if (after.dev !== status.dev || after.ino !== status.ino || after.size !== status.size
      || total !== status.size) fail("FILE_CHANGED", relative);
  } finally { closeSync(descriptor); }
  return { bytes: total, sha256: `sha256:${contentHash.digest("hex")}`,
    gitBlobOid: gitHash.digest("hex") };
}

function readSmall(root, relative) {
  hashFile(root, relative, null, MAX_SMALL_BYTES);
  return readFileSync(safePath(root, relative));
}

function parseJson(bytes, code) {
  try { return JSONParse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function verifyRecord(bytes) {
  const record = parseJson(bytes, "DATASET_RECORD_JSON_INVALID");
  if (record.id !== MOBILE_AGENT_FAILURE_DATASET_ID
    || record.sha !== MOBILE_AGENT_FAILURE_DATASET_REVISION
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.usedStorage !== EXPECTED_USED_STORAGE
    || record.cardData?.license !== "apache-2.0") fail("DATASET_RECORD_INVALID");
  return { datasetId: record.id, revision: record.sha, public: true, gated: false,
    usedStorage: record.usedStorage, licenseClaim: "apache-2.0",
    lastModified: record.lastModified };
}

function verifyTree(bytes) {
  const tree = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(tree) || tree.length !== EXPECTED_ENTRIES
    || sha256(BufferFrom(canonicalizeStrict(tree), "utf8")) !== TREE_PROJECTION_SHA256) {
    fail("TREE_PROJECTION_MISMATCH");
  }
  const files = tree.filter((entry) => entry?.type === "file");
  const directories = tree.filter((entry) => entry?.type === "directory");
  if (files.length !== EXPECTED_FILES || directories.length !== EXPECTED_DIRECTORIES
    || files.reduce((sum, entry) => sum + entry.size, 0) !== EXPECTED_LOGICAL_BYTES
    || files.filter((entry) => entry.lfs !== null).length !== EXPECTED_LFS_FILES) {
    fail("TREE_PROFILE_MISMATCH");
  }
  const paths = new Set();
  for (const entry of tree) {
    if (!safeRelative(entry.path) || paths.has(entry.path)
      || !/^[a-f0-9]{40}$/u.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
    paths.add(entry.path);
    if (entry.type === "file" && (!Number.isSafeInteger(entry.size) || entry.size < 0)) {
      fail("TREE_FILE_INVALID", entry.path);
    }
    if (entry.type === "file" && entry.lfs !== null
      && (!/^[a-f0-9]{64}$/u.test(entry.lfs?.oid ?? "")
        || entry.lfs.size !== entry.size)) fail("TREE_LFS_INVALID", entry.path);
  }
  return { tree, files, directories, entryCount: tree.length,
    fileCount: files.length, directoryCount: directories.length,
    logicalBytes: EXPECTED_LOGICAL_BYTES, lfsFiles: EXPECTED_LFS_FILES,
    treeProjectionSha256: TREE_PROJECTION_SHA256 };
}

function walkRepo(repo, relative = "") {
  const current = relative ? safePath(repo, relative) : repo;
  requireDirectory(current);
  const entries = [];
  for (const name of readdirSync(current).sort()) {
    const child = relative ? `${relative}/${name}` : name;
    const status = lstatSync(safePath(repo, child));
    if (status.isSymbolicLink()) fail("SOURCE_SYMLINK", child);
    if (status.isDirectory()) entries.push({ path: child, type: "directory" },
      ...walkRepo(repo, child));
    else if (status.isFile()) entries.push({ path: child, type: "file" });
    else fail("SOURCE_SPECIAL_FILE", child);
  }
  return entries;
}

function collectSource(root, requireManifest = true) {
  requireDirectory(root, requireManifest
    ? ["repo", "metadata", "source-manifest.json"] : ["repo", "metadata"]);
  requireDirectory(PathJoin(root, "metadata"), ["dataset-record-before.json",
    "dataset-record-after.json", "tree-projection.json"]);
  const before = verifyRecord(readSmall(root, "metadata/dataset-record-before.json"));
  const after = verifyRecord(readSmall(root, "metadata/dataset-record-after.json"));
  if (canonicalizeStrict(before) !== canonicalizeStrict(after)) fail("DATASET_RECORD_DRIFT");
  const tree = verifyTree(readSmall(root, "metadata/tree-projection.json"));
  const repo = PathJoin(root, "repo");
  const actual = walkRepo(repo).sort((a, b) => a.path.localeCompare(b.path));
  const expectedLayout = tree.tree.map(({ path: memberPath, type }) =>
    ({ path: memberPath, type })).sort((a, b) => a.path.localeCompare(b.path));
  if (canonicalizeStrict(actual) !== canonicalizeStrict(expectedLayout)) {
    fail("SOURCE_LAYOUT_TREE_MISMATCH");
  }
  const entries = [];
  for (const expected of tree.files) {
    const checked = hashFile(repo, expected.path, expected.size, null);
    if (expected.lfs !== null) {
      if (checked.sha256 !== `sha256:${expected.lfs.oid}`) fail("LFS_HASH_MISMATCH", expected.path);
    } else if (checked.gitBlobOid !== expected.oid) fail("GIT_BLOB_MISMATCH", expected.path);
    entries.push({ path: `repo/${expected.path}`, bytes: checked.bytes,
      sha256: checked.sha256, gitOid: expected.oid,
      lfsSha256: expected.lfs === null ? null : `sha256:${expected.lfs.oid}` });
  }
  for (const relative of ["metadata/dataset-record-before.json",
    "metadata/dataset-record-after.json", "metadata/tree-projection.json"]) {
    const checked = hashFile(root, relative, null, MAX_SMALL_BYTES);
    entries.push({ path: relative, bytes: checked.bytes, sha256: checked.sha256,
      gitOid: null, lfsSha256: null });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { before, tree, repo, entries };
}

function manifestBody(entries) {
  return { schema: "outsider/mobile-agent-failure-source-manifest/v1",
    datasetId: MOBILE_AGENT_FAILURE_DATASET_ID,
    revision: MOBILE_AGENT_FAILURE_DATASET_REVISION, entries,
    selectedFileCount: entries.length,
    selectedBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
}

export function createMobileAgentFailureSourceManifestFromDirectory(directory) {
  const collected = collectSource(PathResolve(directory), false);
  const body = manifestBody(collected.entries);
  return Object.freeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

function verifyManifest(root, expected) {
  const actual = parseJson(readSmall(root, "source-manifest.json"),
    "SOURCE_MANIFEST_JSON_INVALID");
  if (!serialize(expected).equals(serialize(actual))) fail("SOURCE_MANIFEST_MISMATCH");
}

function parseObject(repo, relative, code) {
  const value = parseJson(readSmall(repo, relative), code);
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function replayTrajectories(repo, tree) {
  const ids = parseJson(readSmall(repo, "trajectory.json"), "TRAJECTORY_INDEX_INVALID");
  if (!Array.isArray(ids) || ids.length !== 52 || new Set(ids).size !== 52
    || ids.some((id) => typeof id !== "string" || !/^[a-z0-9_]+$/u.test(id))) {
    fail("TRAJECTORY_INDEX_INVALID");
  }
  const listed = new Set(ids);
  const topDirectories = tree.directories.filter((entry) => !entry.path.includes("/"))
    .map((entry) => entry.path);
  let executionSteps = 0;
  let detailObjects = 0;
  let jpegFrames = 0;
  let xmlStates = 0;
  let exactJpegXmlPairs = 0;
  let bboxFiles = 0;
  let globallyAnnotatedTrajectories = 0;
  let locallyAnnotatedTrajectories = 0;
  let globalLocalAnnotationAgreement = 0;
  let annotatedActionRows = 0;
  let failedReasonRows = 0;
  let correctActionSuggestionRows = 0;
  let planObjects = 0;
  for (const id of ids) {
    const directory = PathJoin(repo, id);
    requireDirectory(directory);
    const names = readdirSync(directory).sort();
    if (!names.includes("plan_execution_status.json")
      || !names.includes("plan_execution_detail.json")) fail("TRAJECTORY_CORE_MISSING", id);
    const status = parseObject(repo, `${id}/plan_execution_status.json`, "STATUS_INVALID");
    if (!Array.isArray(status.executions) || !status.plan || typeof status.plan !== "object") {
      fail("STATUS_INVALID", id);
    }
    executionSteps += status.executions.length;
    planObjects += 1;
    parseObject(repo, `${id}/plan_execution_detail.json`, "DETAIL_INVALID");
    detailObjects += 1;
    const jpegs = names.filter((name) => name.endsWith(".jpeg"));
    const xmls = names.filter((name) => name.endsWith(".xml"));
    jpegFrames += jpegs.length; xmlStates += xmls.length;
    const xmlSet = new Set(xmls);
    exactJpegXmlPairs += jpegs.filter((name) => xmlSet.has(name.replace(/\.jpeg$/u, ".xml"))).length;
    bboxFiles += names.includes("image_to_bbox_and_scores.json") ? 1 : 0;
    const globalName = "plan_execution_annotated_status.json";
    const localName = "plan_execution_annotated_local_status.json";
    let globalEvaluations = null;
    if (names.includes(globalName)) {
      const annotation = parseObject(repo, `${id}/${globalName}`, "GLOBAL_ANNOTATION_INVALID");
      if (!Array.isArray(annotation.executions)) fail("GLOBAL_ANNOTATION_INVALID", id);
      globallyAnnotatedTrajectories += 1;
      globalEvaluations = annotation.executions.map((row) => row?.action_evaluation ?? null);
      for (const row of annotation.executions) {
        if (!ObjectHasOwn(row ?? {}, "action_evaluation") || row.action_evaluation === null) continue;
        annotatedActionRows += 1;
        if (typeof row.action_evaluation === "object"
          && typeof row.action_evaluation.failedReason === "string") failedReasonRows += 1;
        if (Array.isArray(row.action_evaluation?.correct_action)) {
          correctActionSuggestionRows += row.action_evaluation.correct_action.length;
        }
      }
    }
    if (names.includes(localName)) {
      const annotation = parseObject(repo, `${id}/${localName}`, "LOCAL_ANNOTATION_INVALID");
      if (!Array.isArray(annotation.executions)) fail("LOCAL_ANNOTATION_INVALID", id);
      locallyAnnotatedTrajectories += 1;
      const localEvaluations = annotation.executions.map((row) => row?.action_evaluation ?? null);
      if (globalEvaluations !== null
        && canonicalizeStrict(globalEvaluations) === canonicalizeStrict(localEvaluations)) {
        globalLocalAnnotationAgreement += 1;
      }
    }
  }
  return { publisherSelectedTrajectoryIds: ids.length,
    topLevelSourceDirectories: topDirectories.length,
    unlistedTopLevelDirectories: topDirectories.filter((name) => !listed.has(name)).length,
    executionSteps, planObjects, detailObjects, jpegFrames, xmlStates,
    exactJpegXmlPairs, allJpegFramesHaveSameStemXml: exactJpegXmlPairs === jpegFrames,
    bboxFiles, globallyAnnotatedTrajectories, locallyAnnotatedTrajectories,
    globalLocalAnnotationAgreement, annotatedActionRows, failedReasonRows,
    correctActionSuggestionRows };
}

export function buildMobileAgentFailureCensusFromSourceDirectory(directory) {
  const root = PathResolve(directory);
  const collected = collectSource(root);
  const body = manifestBody(collected.entries);
  const sourceManifest = Object.freeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  verifyManifest(root, sourceManifest);
  const replay = replayTrajectories(collected.repo, collected.tree);
  const reportBody = {
    schema: MOBILE_AGENT_FAILURE_SCHEMA, disposition: MOBILE_AGENT_FAILURE_DISPOSITION,
    source: { ...collected.before, entryCount: collected.tree.entryCount,
      fileCount: collected.tree.fileCount, directoryCount: collected.tree.directoryCount,
      logicalBytes: collected.tree.logicalBytes, lfsFiles: collected.tree.lfsFiles,
      treeProjectionSha256: collected.tree.treeProjectionSha256,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      completeFixedRevisionBytesReplayed: true, rawScreenAndTextProjected: false },
    trajectoryReplay: { ...replay, completePublisherSelected52TrajectorySet: true,
      publisherCollectionMembershipFailureRows: 52,
      directTerminalFailureFlagRows: 0,
      actionAnnotationsArePublisherNative: true,
      actionAnnotationsAreIndependentTruth: false,
      executedRepairSuffixRows: 0 },
    rights: { datasetCardLicenseClaim: "Apache-2.0",
      upstreamAppsScreensAndMagicWandTermsReplayed: false,
      legalConclusionEstablished: false, trainingUseAuthorized: false,
      evaluationUseOnlyByThisArtifact: true },
    privacy: { realMobileScreensAndUiXmlPresent: true, rawSourcePrivate: true,
      noPiiGuaranteed: false, rawProjectionRows: 0 },
    denominatorRegistry: { publisherSelectedFailureTrajectories: 52,
      executedActionRows: replay.executionSteps,
      annotatedActionRows: replay.annotatedActionRows,
      crossDenominatorTotal: null, additionProhibited: true },
    boundary: { mobileFailureTrajectoryMorphologies: 52,
      actionExecutionRows: replay.executionSteps,
      publisherFailureMembershipRows: 52, independentOutcomeRows: 0,
      longitudinalOutcomeRows: 0, recoveryEpisodeRows: 0,
      preActionDelegationRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      actorCreditRows: 0, ceuRows: 0, pricingRows: 0, authorityRows: 0,
      autonomousActionAuthorized: false },
  };
  const report = Object.freeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return Object.freeze({ sourceManifest, report });
}

function receiptBody(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  return { schema: MOBILE_AGENT_FAILURE_RECEIPT_SCHEMA,
    reportHash: report.artifactHash, reportFileSha256: sha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: MOBILE_AGENT_FAILURE_DISPOSITION,
    mobileFailureTrajectoryMorphologies: 52,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    offlineTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
    authorityRows: 0, autonomousActionAuthorized: false };
}

export function createMobileAgentFailureReceipt(report, reportBytes, manifestBytes) {
  const body = receiptBody(report, reportBytes, manifestBytes);
  return Object.freeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyMobileAgentFailureArtifactDirectory(directory) {
  try {
    const root = PathResolve(directory);
    requireDirectory(root, ["report.json", "run-receipt.json", "source"]);
    const reportBytes = readSmall(root, "report.json");
    const receiptBytes = readSmall(root, "run-receipt.json");
    const rebuilt = buildMobileAgentFailureCensusFromSourceDirectory(PathJoin(root, "source"));
    const expectedReportBytes = serialize(rebuilt.report);
    if (!expectedReportBytes.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readSmall(root, "source/source-manifest.json");
    const receipt = createMobileAgentFailureReceipt(rebuilt.report,
      expectedReportBytes, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return Object.freeze({ ok: true, report: rebuilt.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeMobileAgentFailureArtifact(value) {
  return serialize(value);
}
