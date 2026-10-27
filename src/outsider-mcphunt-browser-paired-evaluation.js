/*
 * MCPHunt browser-to-local paired evaluation slice.
 *
 * This adapter replays the complete 39 baseline + 39 defense replication arm
 * at one fixed public revision. The traces intentionally contain synthetic
 * canaries and secret-like payloads, so raw bytes remain private and are never
 * admitted to training or network projection. Publisher labels measure a
 * benchmark safety policy; they are not independent real-world outcomes.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const BufferFrom = Buffer.from;
const JSONParse = JSON.parse;
const PathResolve = path.resolve;
const PathRelative = path.relative;
const PathJoin = path.join;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const MCPHUNT_BROWSER_PAIRED_SCHEMA =
  "outsider/mcphunt-browser-paired-evaluation/v1";
export const MCPHUNT_BROWSER_PAIRED_RECEIPT_SCHEMA =
  "outsider/mcphunt-browser-paired-evaluation-run-receipt/v1";
export const MCPHUNT_DATASET_ID = "mcphunt-benchmark/mcphunt-agent-traces";
export const MCPHUNT_DATASET_REVISION =
  "062bb343fe890ae3018222c7ebe44dbd49ea76d0";
export const MCPHUNT_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/mcphunt-browser-paired-evaluation-report/v1";
const RECEIPT_DOMAIN = "outsider/mcphunt-browser-paired-evaluation-receipt/v1";
const MANIFEST_DOMAIN = "outsider/mcphunt-browser-paired-source-manifest/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const SELECTED_FILES = Object.freeze({
  "README.md": Object.freeze({ sourcePath: "README.md", bytes: 3_933,
    gitOid: "ddee6a72f02db381d9d781d09c17936a1c84547e" }),
  "browser-baseline.json": Object.freeze({
    sourcePath: "browser_replication/deepseek_v4_flash_baseline.json",
    bytes: 3_185_659, gitOid: "7712196a9eec5bf3bb65af12dc92dc4259887867",
    sha256: "sha256:cc89e8c85398d4dba8a9b3f7a8301ee498888c44c7ecb9831dfb6bbf0794fe60" }),
  "browser-defense.json": Object.freeze({
    sourcePath: "browser_replication/deepseek_v4_flash_defense.json",
    bytes: 3_530_977, gitOid: "088d8237c7e15a501ce6e87718408010aa87be09",
    sha256: "sha256:5ac236c1be62f7b6cdfee22e2370b529110973ba0d45dced6d6adc9d16da1b8a" }),
});
const METADATA_FILES = Object.freeze([
  "dataset-record-after.json", "dataset-record-before.json", "dataset-tree.json",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `MCPHUNT_${code}` : `MCPHUNT_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(BufferFrom(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes).digest("hex");
}

function digest(domain, value) {
  return sha256(BufferFrom(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function serialize(value) {
  return BufferFrom(`${canonicalizeStrict(value)}\n`, "utf8");
}

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function parseJson(bytes, code) {
  try { return JSONParse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(code); }
}

function requireDirectory(directory, expected) {
  const status = lstatSync(directory, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o700) fail("DIRECTORY_UNSAFE", directory);
  if (!same(sorted(readdirSync(directory)), sorted(expected))) {
    fail("DIRECTORY_LAYOUT_INVALID", directory);
  }
}

function checkedPath(root, relative) {
  const base = PathResolve(root);
  const target = PathResolve(base, relative);
  const relation = PathRelative(base, target);
  if (typeof relative !== "string" || relative.length === 0 || relative.includes("\0")
    || relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_INVALID", String(relative));
  return target;
}

function readPrivateStable(root, relative, expected = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600 || link.size < 1n
    || link.size > BigInt(MAX_FILE_BYTES)) fail("FILE_UNSAFE", relative);
  let descriptor;
  try {
    descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mode !== after.mode || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || BigInt(bytes.length) !== after.size) {
      fail("FILE_CHANGED_DURING_READ", relative);
    }
    if (expected !== null && (bytes.length !== expected.bytes
      || gitBlobOid(bytes) !== expected.gitOid
      || expected.sha256 !== undefined && sha256(bytes) !== expected.sha256)) {
      fail("FILE_PIN_MISMATCH", relative);
    }
    return bytes;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function verifyRecord(bytes) {
  const record = parseJson(bytes, "DATASET_RECORD_JSON_INVALID");
  if (record.id !== MCPHUNT_DATASET_ID || record.sha !== MCPHUNT_DATASET_REVISION
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.cardData?.license !== "cc-by-4.0") fail("DATASET_RECORD_INVALID");
  return { id: record.id, revision: record.sha, licenseClaim: record.cardData.license,
    private: record.private, gated: record.gated, disabled: record.disabled,
    lastModified: record.lastModified };
}

function verifyTree(bytes) {
  const entries = parseJson(bytes, "DATASET_TREE_JSON_INVALID");
  if (!Array.isArray(entries) || entries.length !== 39) fail("DATASET_TREE_INVALID");
  const byPath = new Map();
  let files = 0;
  let directories = 0;
  let totalBytes = 0;
  for (const entry of entries) {
    if (!entry || typeof entry.path !== "string" || byPath.has(entry.path)
      || !["file", "directory"].includes(entry.type)) fail("DATASET_TREE_ENTRY_INVALID");
    byPath.set(entry.path, entry);
    if (entry.type === "file") {
      files += 1;
      if (!Number.isSafeInteger(entry.size) || entry.size < 1) fail("TREE_SIZE_INVALID");
      totalBytes += entry.size;
    } else directories += 1;
  }
  if (files !== 32 || directories !== 7 || totalBytes !== 593_477_456) {
    fail("DATASET_TREE_PROFILE_MISMATCH");
  }
  for (const expected of Object.values(SELECTED_FILES)) {
    const entry = byPath.get(expected.sourcePath);
    if (!entry || entry.type !== "file" || entry.size !== expected.bytes
      || entry.oid !== expected.gitOid || entry.lfs !== undefined) {
      fail("SELECTED_TREE_ENTRY_INVALID", expected.sourcePath);
    }
  }
  return { entryCount: entries.length, fileCount: files, directoryCount: directories,
    repositoryBytes: totalBytes };
}

const CORE_PAIR_FIELDS = Object.freeze(["task_id", "task_prompt", "task_category",
  "risk_mechanism", "sink_policy", "env_type", "ablation_profile", "mitigation",
  "mitigation_level", "model", "wire_api"]);
const OUTCOMES = Object.freeze(["safe_failure", "unsafe_failure", "unsafe_success"]);

function replayArm(bytes, arm) {
  const value = parseJson(bytes, `${arm}_JSON_INVALID`);
  if (!value || typeof value !== "object" || Array.isArray(value)
    || value.schema_version !== "2.0.0" || !Array.isArray(value.traces)
    || value.traces.length !== 39) fail(`${arm}_PROFILE_INVALID`);
  const expectedCommit = arm === "BASELINE" ? "ffd333b" : "4b85018";
  if (value.pipeline_git_commit !== expectedCommit
    || value.task_taxonomy_version !== "2026-04-24/9mech-147task-registry"
    || value.labeling_rules_version
      !== "2026-04-25/12sig-3tier-crs-stratified-uniform-causal-benign-safe") {
    fail(`${arm}_VERSION_INVALID`);
  }
  const byKey = new Map();
  const outcomes = { safe_failure: 0, unsafe_failure: 0, unsafe_success: 0 };
  let eventCount = 0;
  let turnCount = 0;
  let toolErrorCount = 0;
  let taskCompletedCount = 0;
  let truncatedCount = 0;
  let apiErrorCount = 0;
  let canaryVisibleEventCount = 0;
  let canaryArgumentEventCount = 0;
  let canaryResultEventCount = 0;
  const tasks = new Set();
  for (const trace of value.traces) {
    if (!trace || typeof trace !== "object" || Array.isArray(trace)
      || typeof trace.trace_id !== "string" || typeof trace.task_id !== "string"
      || typeof trace.env_type !== "string" || !OUTCOMES.includes(trace.outcome)
      || !Array.isArray(trace.events) || !Array.isArray(trace.turn_log)
      || trace.events.length !== trace.num_events
      || trace.turn_log.length !== trace.num_turns
      || !Number.isSafeInteger(trace.tool_errors)
      || !Number.isSafeInteger(trace.api_errors)) fail(`${arm}_TRACE_INVALID`);
    const key = `${trace.task_id}\0${trace.env_type}`;
    if (byKey.has(key)) fail(`${arm}_PAIR_KEY_DUPLICATE`, key);
    byKey.set(key, trace);
    tasks.add(trace.task_id);
    outcomes[trace.outcome] += 1;
    eventCount += trace.events.length;
    turnCount += trace.num_turns;
    toolErrorCount += trace.tool_errors;
    apiErrorCount += trace.api_errors;
    taskCompletedCount += trace.task_completed === true ? 1 : 0;
    truncatedCount += trace.truncated === true ? 1 : 0;
    for (const event of trace.events) {
      canaryVisibleEventCount += event?.canary_visible_to_llm === true ? 1 : 0;
      canaryArgumentEventCount += event?.canary_in_args === true ? 1 : 0;
      canaryResultEventCount += event?.canary_in_result === true ? 1 : 0;
    }
  }
  const expected = arm === "BASELINE"
    ? { eventCount: 1_070, turnCount: 562, toolErrorCount: 127,
      taskCompletedCount: 31, truncatedCount: 8, apiErrorCount: 0,
      canaryVisibleEventCount: 233, canaryArgumentEventCount: 54,
      canaryResultEventCount: 233,
      outcomes: { safe_failure: 8, unsafe_failure: 1, unsafe_success: 30 } }
    : { eventCount: 1_110, turnCount: 571, toolErrorCount: 129,
      taskCompletedCount: 32, truncatedCount: 7, apiErrorCount: 0,
      canaryVisibleEventCount: 210, canaryArgumentEventCount: 67,
      canaryResultEventCount: 211,
      outcomes: { safe_failure: 4, unsafe_failure: 4, unsafe_success: 31 } };
  const profile = { traceCount: byKey.size, taskCount: tasks.size, outcomes,
    eventCount, turnCount, toolErrorCount, taskCompletedCount, truncatedCount,
    apiErrorCount, canaryVisibleEventCount, canaryArgumentEventCount,
    canaryResultEventCount };
  if (tasks.size !== 15 || !same(profile, { traceCount: 39, taskCount: 15,
    ...expected })) fail(`${arm}_REPLAY_PROFILE_MISMATCH`);
  return { value, byKey, profile };
}

function pairArms(baseline, defense) {
  if (!same(sorted(baseline.byKey.keys()), sorted(defense.byKey.keys()))) {
    fail("PAIR_KEY_SET_MISMATCH");
  }
  const transitions = {};
  let stablePromptCount = 0;
  let stableCoreFieldPairCount = 0;
  let outcomeChangedPairCount = 0;
  let expectedRiskChangedPairCount = 0;
  for (const key of sorted(baseline.byKey.keys())) {
    const before = baseline.byKey.get(key);
    const after = defense.byKey.get(key);
    if (CORE_PAIR_FIELDS.every((field) => same(before[field], after[field]))) {
      stableCoreFieldPairCount += 1;
    }
    if (before.task_prompt === after.task_prompt) stablePromptCount += 1;
    if (!same(before.expected_risk, after.expected_risk)) expectedRiskChangedPairCount += 1;
    if (before.outcome !== after.outcome) outcomeChangedPairCount += 1;
    const transition = `${before.outcome}->${after.outcome}`;
    transitions[transition] = (transitions[transition] ?? 0) + 1;
  }
  const expectedTransitions = {
    "safe_failure->safe_failure": 4,
    "safe_failure->unsafe_failure": 2,
    "safe_failure->unsafe_success": 2,
    "unsafe_failure->unsafe_failure": 1,
    "unsafe_success->unsafe_failure": 1,
    "unsafe_success->unsafe_success": 29,
  };
  if (stablePromptCount !== 39 || stableCoreFieldPairCount !== 39
    || outcomeChangedPairCount !== 5 || expectedRiskChangedPairCount !== 4
    || !same(transitions, expectedTransitions)) fail("PAIR_REPLAY_PROFILE_MISMATCH");
  return { pairCount: 39, stablePromptPairCount: stablePromptCount,
    stableCoreFieldPairCount, outcomeChangedPairCount, expectedRiskChangedPairCount,
    transitions: expectedTransitions };
}

function manifestBody(entries) {
  return { schema: "outsider/mcphunt-browser-paired-source-manifest/v1",
    datasetId: MCPHUNT_DATASET_ID, revision: MCPHUNT_DATASET_REVISION,
    entries: sorted(entries.map((entry) => entry.path)).map((entryPath) =>
      entries.find((entry) => entry.path === entryPath)) };
}

export function createMcphuntSourceManifestFromDirectory(sourceDirectory) {
  const root = PathResolve(sourceDirectory);
  requireDirectory(root, ["files", "metadata"]);
  requireDirectory(PathJoin(root, "files"), Object.keys(SELECTED_FILES));
  requireDirectory(PathJoin(root, "metadata"), METADATA_FILES);
  const entries = [];
  for (const [file, expected] of Object.entries(SELECTED_FILES)) {
    const bytes = readPrivateStable(root, `files/${file}`, expected);
    entries.push({ path: `files/${file}`, sourcePath: expected.sourcePath,
      bytes: bytes.length, sha256: sha256(bytes), sourceObjectId: expected.gitOid });
  }
  for (const file of METADATA_FILES) {
    const bytes = readPrivateStable(root, `metadata/${file}`);
    entries.push({ path: `metadata/${file}`, sourcePath: null,
      bytes: bytes.length, sha256: sha256(bytes), sourceObjectId: null });
  }
  const body = manifestBody(entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

export function buildMcphuntBrowserPairedEvaluationFromSourceDirectory(sourceDirectory) {
  const root = PathResolve(sourceDirectory);
  requireDirectory(root, ["files", "metadata", "source-manifest.json"]);
  requireDirectory(PathJoin(root, "files"), Object.keys(SELECTED_FILES));
  requireDirectory(PathJoin(root, "metadata"), METADATA_FILES);
  const fileBytes = new Map();
  const entries = [];
  for (const [file, expected] of Object.entries(SELECTED_FILES)) {
    const bytes = readPrivateStable(root, `files/${file}`, expected);
    fileBytes.set(file, bytes);
    entries.push({ path: `files/${file}`, sourcePath: expected.sourcePath,
      bytes: bytes.length, sha256: sha256(bytes), sourceObjectId: expected.gitOid });
  }
  const metadata = new Map();
  for (const file of METADATA_FILES) {
    const bytes = readPrivateStable(root, `metadata/${file}`);
    metadata.set(file, bytes);
    entries.push({ path: `metadata/${file}`, sourcePath: null,
      bytes: bytes.length, sha256: sha256(bytes), sourceObjectId: null });
  }
  const before = verifyRecord(metadata.get("dataset-record-before.json"));
  const after = verifyRecord(metadata.get("dataset-record-after.json"));
  if (!same(before, after)) fail("DATASET_MATERIAL_STATE_CHANGED");
  const tree = verifyTree(metadata.get("dataset-tree.json"));
  const baseline = replayArm(fileBytes.get("browser-baseline.json"), "BASELINE");
  const defense = replayArm(fileBytes.get("browser-defense.json"), "DEFENSE");
  const paired = pairArms(baseline, defense);
  const expectedManifestBody = manifestBody(entries);
  const sourceManifest = deepFreeze({ ...expectedManifestBody,
    sourceManifestHash: digest(MANIFEST_DOMAIN, expectedManifestBody) });
  if (!serialize(sourceManifest).equals(readPrivateStable(root, "source-manifest.json"))) {
    fail("SOURCE_MANIFEST_MISMATCH");
  }
  const reportBody = {
    schema: MCPHUNT_BROWSER_PAIRED_SCHEMA,
    disposition: MCPHUNT_DISPOSITION,
    source: { ...before, sourceManifestHash: sourceManifest.sourceManifestHash,
      repositoryInventory: tree, selectedFileCount: 3,
      selectedBytes: Object.values(SELECTED_FILES).reduce((sum, item) =>
        sum + item.bytes, 0), completeSelectedBytesReplayed: true,
      completeRepositoryPayloadReplayed: false, rawTraceBytesProjected: false },
    declaredScope: { arm: "BROWSER_TO_LOCAL_SAME_SCHEDULE_REPLICATION",
      baselineTraceCount: 39, defenseTraceCount: 39, pairedTraceCount: 39,
      globallyExhaustive: false, fullDatasetExhaustive: false },
    baseline: baseline.profile,
    defense: defense.profile,
    pairedReplay: { ...paired, publisherOutcomeLabelsReplayed: true,
      publisherOutcomeLabelsIndependentGroundTruth: false,
      defenseImprovementClaimedByThisAdapter: false,
      observedUnsafeSuccessDifferenceDefenseMinusBaseline:
        defense.profile.outcomes.unsafe_success - baseline.profile.outcomes.unsafe_success },
    contentBoundary: { intentionallySyntheticCanaryPayloadsPresent: true,
      secretLikeBenchmarkPayloadsPresent: true,
      rawPromptsAndToolResultsPrivate: true, rawProjectionRows: 0,
      noPiiGuaranteed: false, productionExecutionAllowed: false },
    rights: { datasetLicenseClaim: "CC-BY-4.0", legalConclusionEstablished: false,
      evaluationUseOnlyByThisArtifact: true, trainingUseAuthorized: false },
    boundary: { pairedEvaluationMorphologies: 39, realAffectedPartyOutcomeRows: 0,
      independentOutcomeRows: 0, longitudinalOutcomeRows: 0,
      recoveryEpisodeRows: 0, preActionDelegationRows: 0,
      offlineTrainingRows: 0, productionTrainingRows: 0,
      networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
      pricingRows: 0, authorityRows: 0, autonomousActionAuthorized: false },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

function receiptBody(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  return { schema: MCPHUNT_BROWSER_PAIRED_RECEIPT_SCHEMA,
    reportHash: report.artifactHash, reportFileSha256: sha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: MCPHUNT_DISPOSITION, pairedEvaluationMorphologies: 39,
    independentOutcomeRows: 0, offlineTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
    authorityRows: 0, autonomousActionAuthorized: false };
}

export function createMcphuntBrowserPairedRunReceipt(report, reportBytes, manifestBytes) {
  const body = receiptBody(report, reportBytes, manifestBytes);
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyMcphuntBrowserPairedArtifactDirectory(directory) {
  try {
    const root = PathResolve(directory);
    requireDirectory(root, ["report.json", "run-receipt.json", "source"]);
    const reportBytes = readPrivateStable(root, "report.json");
    const receiptBytes = readPrivateStable(root, "run-receipt.json");
    const rebuilt = buildMcphuntBrowserPairedEvaluationFromSourceDirectory(
      PathJoin(root, "source"));
    const expectedReportBytes = serialize(rebuilt.report);
    if (!expectedReportBytes.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readPrivateStable(root, "source/source-manifest.json");
    const receipt = createMcphuntBrowserPairedRunReceipt(rebuilt.report,
      expectedReportBytes, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: rebuilt.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeMcphuntBrowserPairedArtifact(value) {
  return serialize(value);
}
