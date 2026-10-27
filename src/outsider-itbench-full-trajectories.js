/*
 * Source-bound complete ITBench-Trajectories fixed-revision replay.
 *
 * Every repository file is retained in a private source tree. Session commands
 * and generated Python are inert bytes: this module hashes files and parses
 * JSON/JSONL only; it never imports, evaluates, or executes trajectory content.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const ITBENCH_DATASET_ID = "ibm-research/ITBench-Trajectories";
export const ITBENCH_REVISION =
  "c3093ee33b4f16a8eed97ade1266d0d7e88b2dec";
export const ITBENCH_FULL_SCHEMA = "outsider/itbench-full-trajectories/v1";
export const ITBENCH_FULL_RECEIPT_SCHEMA =
  "outsider/itbench-full-trajectories-receipt/v1";
export const ITBENCH_FULL_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/itbench-full-trajectories-report/v1";
const RECEIPT_DOMAIN = "outsider/itbench-full-trajectories-receipt/v1";
const MANIFEST_DOMAIN = "outsider/itbench-full-trajectories-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/itbench-full-trajectories-source-root/v1";
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const ROOT = "ReAct-Agent-Trajectories/OpenAI-GPT-OSS-120B/sre";
const RUN_RE = new RegExp(`^${ROOT}/Scenario-(\\d+)/([123])/(.+)$`, "u");

const EXPECTED = Object.freeze({
  lastModified: "2026-01-19T23:23:00.000Z",
  recordUsedStorageBytes: 0,
  siblingPaths: 389,
  treePages: 6,
  pageLengths: Object.freeze([100, 100, 100, 100, 100, 99]),
  treeEntries: 599,
  treeFiles: 389,
  treeDirectories: 210,
  treeFileBytes: 23_173_423,
  scenarios: 35,
  runs: 105,
  sessions: 105,
  agentOutputs: 90,
  judgeOutputs: 90,
  generatedCodeFiles: 102,
  extensionCounts: Object.freeze({
    gitattributes: 1, json: 180, jsonl: 105, md: 1, py: 102,
  }),
  runShapes: Object.freeze({
    OUTPUT_JUDGE_SESSION_ONLY: 36,
    OUTPUT_JUDGE_SESSION_WITH_GENERATED_CODE: 54,
    GENERATED_CODE_AND_SESSION_ONLY: 13,
    SESSION_ONLY: 2,
  }),
});

const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:cd1bc48abf45a33988b9b9636db93fd80f553e85f28d7e1f191cf87d2e013d1f";

const METADATA_PATHS = Object.freeze([
  "dataset-record-before.json",
  ...Array.from({ length: 6 }, (_, index) =>
    `full-tree-before-page${index + 1}.json`),
  "dataset-record-after.json",
  ...Array.from({ length: 6 }, (_, index) =>
    `full-tree-after-page${index + 1}.json`),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `ITBENCH_FULL_${code}`
    : `ITBENCH_FULL_${code}:${detail}`);
}

export function itBenchSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return itBenchSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function serialize(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")
    || value.includes("\\") || value.includes("\0")
    || value.split("/").some((part) => ["", ".", ".."].includes(part))
    || path.posix.normalize(value) !== value) fail("PATH_INVALID", String(value));
  return value;
}

function checkedPath(root, relative) {
  safeRelative(relative);
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  const relation = path.relative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_INVALID", relative);
  return target;
}

function checkedRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedPath(root, relative);
  const status = lstatSync(target, { bigint: true });
  if (!status.isFile() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o600 || status.size < 1n
    || status.size > BigInt(maximumBytes)
    || exactBytes !== null && status.size !== BigInt(exactBytes)) {
    fail("FILE_UNSAFE", relative);
  }
  return { target, status };
}

function readRegular(root, relative, maximumBytes, exactBytes = null) {
  const { target } = checkedRegular(root, relative, maximumBytes, exactBytes);
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== after.size) {
      fail("FILE_CHANGED_DURING_READ", relative);
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

function hashRegular(root, relative, exactBytes) {
  const { target } = checkedRegular(root, relative, MAX_FILE_BYTES, exactBytes);
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  const hash = createHash("sha256");
  const git = createHash("sha1");
  git.update(`blob ${exactBytes}\0`);
  const chunk = Buffer.allocUnsafe(256 * 1024);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    let total = 0;
    while (true) {
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      const view = chunk.subarray(0, count);
      hash.update(view);
      git.update(view);
      total += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || total !== exactBytes) fail("FILE_CHANGED_DURING_READ", relative);
    return { bytes: total, sha256: `sha256:${hash.digest("hex")}`,
      gitBlobOid: git.digest("hex") };
  } finally { closeSync(descriptor); }
}

function walk(root, prefix = "") {
  const directory = prefix === "" ? path.resolve(root) : checkedPath(root, prefix);
  const status = lstatSync(directory, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o700) fail("DIRECTORY_UNSAFE", prefix);
  const result = [];
  for (const name of sorted(readdirSync(directory))) {
    const relative = prefix === "" ? name : `${prefix}/${name}`;
    const child = lstatSync(checkedPath(root, relative), { bigint: true });
    if (child.isSymbolicLink()) fail("SYMLINK_FORBIDDEN", relative);
    if (child.isDirectory()) result.push(...walk(root, relative));
    else if (child.isFile() && Number(child.mode & 0o777n) === 0o600) {
      result.push(relative);
    } else fail("SOURCE_ENTRY_UNSAFE", relative);
  }
  return result;
}

function parseJson(bytes, code) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { fail(code); }
}

function parseJsonLines(bytes, code) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(`${code}_UTF8_INVALID`); }
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length === 0 || lines.some((line) => line.length === 0)) {
    fail(`${code}_EMPTY_LINE`);
  }
  return lines.map((line, index) => {
    try {
      const value = JSON.parse(line);
      if (!exactObject(value)) fail(`${code}_ROW_NOT_OBJECT`, String(index + 1));
      return value;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("ITBENCH_FULL_")) throw error;
      fail(`${code}_JSON_INVALID`, String(index + 1));
    }
  });
}

function countByValues(values) {
  const counts = {};
  for (const value of values) {
    const key = typeof value === "string" && value.length > 0 ? value : "__missing__";
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(sorted(Object.keys(counts)).map((key) => [key, counts[key]]));
}

function recordProjection(bytes) {
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  if (!exactObject(value) || !Array.isArray(value.siblings)
    || !Array.isArray(value.tags)) fail("RECORD_SHAPE_INVALID");
  const paths = value.siblings.map((entry) => safeRelative(entry?.rfilename));
  if (new Set(paths).size !== paths.length) fail("RECORD_SIBLING_DUPLICATE");
  const ordered = sorted(paths);
  const licenseTags = value.tags.filter((entry) =>
    typeof entry === "string" && entry.startsWith("license:"));
  const licenseFiles = ordered.filter((entry) =>
    /(^|\/)(licen[cs]e|copying)(\.|$)/iu.test(entry));
  const result = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorageBytes: value.usedStorage,
    siblingPaths: ordered.length,
    siblingPathRoot: digest("itbench/record-sibling-paths/v1", ordered),
    cardLicense: value.cardData?.license ?? null,
    licenseTags: sorted(licenseTags), licenseFiles, paths: ordered,
  };
  if (result.id !== ITBENCH_DATASET_ID || result.author !== "ibm-research"
    || result.sha !== ITBENCH_REVISION
    || result.lastModified !== EXPECTED.lastModified
    || result.private !== false || result.gated !== false
    || result.disabled !== false
    || result.usedStorageBytes !== EXPECTED.recordUsedStorageBytes
    || result.siblingPaths !== EXPECTED.siblingPaths
    || result.cardLicense !== "cc-by-nc-4.0"
    || !same(result.licenseTags, ["license:cc-by-nc-4.0"])
    || result.licenseFiles.length !== 0) fail("RECORD_PROFILE_INVALID");
  return result;
}

function extension(pathname) {
  const name = pathname.split("/").at(-1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "__none__" : name.slice(dot + 1);
}

function deriveRunInventory(files) {
  const runs = new Map();
  for (const entry of files) {
    if ([".gitattributes", "README.md"].includes(entry.path)) continue;
    const match = RUN_RE.exec(entry.path);
    if (match === null) fail("UNEXPECTED_REPOSITORY_FILE", entry.path);
    const scenario = match[1];
    const run = Number(match[2]);
    const child = match[3];
    const key = `${scenario}/${run}`;
    if (!runs.has(key)) runs.set(key, {
      scenario, run, basePath: `${ROOT}/Scenario-${scenario}/${run}`,
      session: null, agentOutput: null, judgeOutput: null, generatedCode: [],
    });
    const item = runs.get(key);
    if (child === "session.jsonl") {
      if (item.session !== null) fail("RUN_FILE_DUPLICATE", entry.path);
      item.session = entry;
    } else if (child === "agent_output.json") {
      if (item.agentOutput !== null) fail("RUN_FILE_DUPLICATE", entry.path);
      item.agentOutput = entry;
    } else if (child === "judge_output.json") {
      if (item.judgeOutput !== null) fail("RUN_FILE_DUPLICATE", entry.path);
      item.judgeOutput = entry;
    } else if (child.startsWith("code_generated_by_agent/")
      && child.endsWith(".py") && child.split("/").length === 2) {
      item.generatedCode.push(entry);
    } else fail("RUN_CHILD_INVALID", entry.path);
  }
  const values = [...runs.values()].sort((left, right) =>
    Number(left.scenario) - Number(right.scenario) || left.run - right.run);
  if (values.length !== EXPECTED.runs
    || values.some((run) => run.session === null
      || (run.agentOutput === null) !== (run.judgeOutput === null))) {
    fail("RUN_INVENTORY_INVALID");
  }
  const byScenario = new Map();
  for (const item of values) {
    if (!byScenario.has(item.scenario)) byScenario.set(item.scenario, []);
    byScenario.get(item.scenario).push(item.run);
  }
  if (byScenario.size !== EXPECTED.scenarios
    || [...byScenario.values()].some((runsForScenario) =>
      !same(sorted(runsForScenario), [1, 2, 3]))) fail("SCENARIO_CROSS_PRODUCT_INVALID");
  const shapeCounts = {};
  for (const item of values) {
    const hasOutcome = item.agentOutput !== null;
    const hasCode = item.generatedCode.length > 0;
    const shape = hasOutcome
      ? hasCode ? "OUTPUT_JUDGE_SESSION_WITH_GENERATED_CODE"
        : "OUTPUT_JUDGE_SESSION_ONLY"
      : hasCode ? "GENERATED_CODE_AND_SESSION_ONLY" : "SESSION_ONLY";
    item.shape = shape;
    shapeCounts[shape] = (shapeCounts[shape] ?? 0) + 1;
  }
  const agentOutputs = values.filter((item) => item.agentOutput !== null).length;
  const judges = values.filter((item) => item.judgeOutput !== null).length;
  const generatedCode = values.reduce((sum, item) => sum + item.generatedCode.length, 0);
  if (!same(shapeCounts, EXPECTED.runShapes)
    || agentOutputs !== EXPECTED.agentOutputs || judges !== EXPECTED.judgeOutputs
    || generatedCode !== EXPECTED.generatedCodeFiles) fail("RUN_SHAPE_CENSUS_INVALID");
  const scenarioIds = sorted(byScenario.keys());
  return { runs: values, scenarioIds, shapeCounts, agentOutputs, judges,
    generatedCode, missingOutcomeRuns: values.length - judges,
    scenarioIdRoot: digest("itbench/scenario-id-set/v1", scenarioIds),
    runPathRoot: digest("itbench/run-path-set/v1", values.map((item) => item.basePath)),
  };
}

function treeProjection(pageBytes) {
  if (!Array.isArray(pageBytes) || pageBytes.length !== EXPECTED.treePages) {
    fail("TREE_PAGE_COUNT_INVALID");
  }
  const pages = pageBytes.map((bytes, index) => {
    const page = parseJson(bytes, "TREE_PAGE_JSON_INVALID");
    if (!Array.isArray(page) || page.length !== EXPECTED.pageLengths[index]) {
      fail("TREE_PAGE_LENGTH_INVALID", String(index + 1));
    }
    return page;
  });
  const entries = pages.flat().map((entry) => {
    if (!exactObject(entry) || !["file", "directory"].includes(entry.type)
      || !SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size)
      || entry.size < 0) fail("TREE_ENTRY_INVALID");
    if (entry.type === "directory" && entry.size !== 0) {
      fail("TREE_DIRECTORY_SIZE_INVALID", entry.path);
    }
    if (entry.type === "file" && (entry.size < 1
      || entry.lfs !== undefined || entry.xetHash !== undefined)) {
      fail("TREE_FILE_PROFILE_INVALID", entry.path);
    }
    return { path: safeRelative(entry.path), type: entry.type,
      size: entry.size, oid: entry.oid };
  }).sort((left, right) => left.path < right.path ? -1 : 1);
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("TREE_PATH_DUPLICATE");
  }
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const fileBytes = files.reduce((sum, entry) => sum + entry.size, 0);
  const extensionCounts = countByValues(files.map((entry) => extension(entry.path)));
  if (entries.length !== EXPECTED.treeEntries || files.length !== EXPECTED.treeFiles
    || directories.length !== EXPECTED.treeDirectories
    || fileBytes !== EXPECTED.treeFileBytes
    || !same(extensionCounts, EXPECTED.extensionCounts)) fail("TREE_CENSUS_INVALID");
  const inventory = deriveRunInventory(files);
  return {
    pages: pages.length, entries, files, directories, fileBytes,
    extensionCounts, inventory,
    root: digest("itbench/full-tree/v1", entries),
    filePathRoot: digest("itbench/full-tree-file-paths/v1",
      files.map((entry) => entry.path)),
  };
}

export function inspectItBenchMetadataSnapshot(recordBytes, treePageBytes) {
  const record = recordProjection(recordBytes);
  const tree = treeProjection(treePageBytes);
  if (!same(record.paths, tree.files.map((entry) => entry.path))) {
    fail("RECORD_TREE_FILE_PATH_MISMATCH");
  }
  return deepFreeze({ record, tree });
}

function validateReadme(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail("README_UTF8_INVALID"); }
  const claims = {
    cardCcByNc40: text.includes("license: cc-by-nc-4.0"),
    completeTrajectories105: text.includes("105 complete agent trajectories"),
    scenarios35: text.includes("35 distinct ITBench SRE scenarios"),
    threeRunsPerScenario: text.includes("3 runs per scenario"),
    generatedCodeOptional: text.includes("code_generated_by_agent/   # Python scripts (optional)"),
    automaticEvaluationClaim: text.includes("automatically evaluated against ground truth"),
    trainingDataUseCaseClaim: text.includes("**Training Data**"),
  };
  if (Object.values(claims).some((value) => value !== true)) {
    fail("README_CLAIM_PROFILE_INVALID");
  }
  return claims;
}

function increment(result, key, amount = 1) {
  result[key] = (result[key] ?? 0) + amount;
}

function toolCategory(value) {
  if (value === "shell") return "SHELL";
  if (value === "apply_patch") return "APPLY_PATCH";
  if (value === "list_mcp_resources") return "MCP_RESOURCE_LIST";
  if (typeof value === "string" && value.startsWith("mcp__sre_utils__")) {
    return "MCP_SRE_UTILS";
  }
  return "OTHER_OR_MALFORMED";
}

function replaySession(bytes, aggregates, sessionIds) {
  const rows = parseJsonLines(bytes, "SESSION");
  aggregates.rows += rows.length;
  let sessionMetaRows = 0;
  for (const row of rows) {
    if (typeof row.type !== "string" || !exactObject(row.payload)) {
      fail("SESSION_ROW_PROFILE_INVALID");
    }
    increment(aggregates.topLevelTypes, row.type);
    const payloadType = typeof row.payload.type === "string" ? row.payload.type : null;
    if (row.type === "session_meta") {
      sessionMetaRows += 1;
      if (typeof row.payload.id !== "string" || row.payload.id.length === 0) {
        fail("SESSION_META_ID_INVALID");
      }
      sessionIds.push(row.payload.id);
    }
    if (row.type === "response_item") {
      increment(aggregates.responseItemTypes, payloadType ?? "__missing__");
      if (payloadType === "message") aggregates.responseMessageRows += 1;
      if (payloadType === "function_call") {
        aggregates.functionCallRows += 1;
        increment(aggregates.functionCallCategories, toolCategory(row.payload.name));
      }
      if (payloadType === "function_call_output") {
        aggregates.functionCallOutputRows += 1;
        if (typeof row.payload.output !== "string") {
          aggregates.unstructuredFunctionOutputRows += 1;
        } else {
          try {
            const output = JSON.parse(row.payload.output);
            const exitCode = output?.metadata?.exit_code;
            if (Number.isSafeInteger(exitCode)) {
              aggregates.structuredFunctionOutputRows += 1;
              increment(aggregates.toolExitCodes, String(exitCode));
              if (exitCode !== 0) aggregates.nonzeroToolExitRows += 1;
            } else aggregates.unstructuredFunctionOutputRows += 1;
          } catch { aggregates.unstructuredFunctionOutputRows += 1; }
        }
      }
    }
    if (row.type === "event_msg") {
      increment(aggregates.eventMessageTypes, payloadType ?? "__missing__");
      if (payloadType === "agent_message") aggregates.eventAgentMessageRows += 1;
      if (payloadType === "user_message") aggregates.eventUserMessageRows += 1;
    }
    if (/error|abort|fail/iu.test(row.type)
      || payloadType !== null && /error|abort|fail/iu.test(payloadType)) {
      aggregates.explicitErrorTypedRows += 1;
    }
  }
  if (sessionMetaRows !== 1) fail("SESSION_META_CENSUS_INVALID");
}

function replayAgentOutput(bytes, aggregates) {
  const value = parseJson(bytes, "AGENT_OUTPUT_JSON_INVALID");
  if (!exactObject(value) || !Array.isArray(value.entities)
    || !Array.isArray(value.propagations) || !Array.isArray(value.alerts_explained)) {
    fail("AGENT_OUTPUT_PROFILE_INVALID");
  }
  aggregates.rows += 1;
  aggregates.entities += value.entities.length;
  aggregates.propagations += value.propagations.length;
  aggregates.alertsExplained += value.alerts_explained.length;
}

function numericSummaryAdd(summaries, key, value) {
  if (!summaries[key]) summaries[key] = {
    present: 0, numeric: 0, null: 0, min: null, max: null, sum: 0,
  };
  const item = summaries[key];
  item.present += 1;
  if (value === null) { item.null += 1; return; }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    fail("JUDGE_FLAT_SCORE_VALUE_INVALID", key);
  }
  item.numeric += 1;
  item.sum += value;
  item.min = item.min === null ? value : Math.min(item.min, value);
  item.max = item.max === null ? value : Math.max(item.max, value);
}

function replayJudgeOutput(bytes, expectedScenario, expectedRun, aggregates) {
  const value = parseJson(bytes, "JUDGE_OUTPUT_JSON_INVALID");
  if (!exactObject(value) || !exactObject(value.metadata)
    || !exactObject(value.eval_result) || !exactObject(value.eval_result.scores)
    || !exactObject(value.flat_scores)
    || value.metadata.scenario !== `Scenario-${expectedScenario}`
    || value.metadata.run !== expectedRun
    || value.eval_result.incident_id !== `Scenario-${expectedScenario}`
    || String(value.eval_result.trial_id) !== String(expectedRun)) {
    fail("JUDGE_OUTPUT_PROFILE_INVALID", `${expectedScenario}/${expectedRun}`);
  }
  aggregates.rows += 1;
  increment(aggregates.judgeModels,
    typeof value.metadata.judge_model === "string"
      ? value.metadata.judge_model : "__missing__");
  increment(aggregates.judgeProviders,
    typeof value.metadata.judge_provider === "string"
      ? value.metadata.judge_provider : "__missing__");
  for (const [key, score] of Object.entries(value.flat_scores)) {
    numericSummaryAdd(aggregates.flatScoreSummaries, key, score);
    aggregates.flatScoreObservations += 1;
    if (score === null) aggregates.flatScoreNullObservations += 1;
    else aggregates.flatScoreNumericObservations += 1;
  }
  aggregates.evalScoreSections += Object.keys(value.eval_result.scores).length;
}

function finalizeSummaries(summaries, judgeRows) {
  return Object.fromEntries(sorted(Object.keys(summaries)).map((key) => {
    const item = summaries[key];
    return [key, {
      present: item.present,
      missing: judgeRows - item.present,
      numeric: item.numeric, null: item.null,
      min: item.min, max: item.max,
      mean: item.numeric === 0 ? null
        : Number((item.sum / item.numeric).toFixed(12)),
    }];
  }));
}

function replayRepository(root, tree) {
  const entries = [];
  const byPath = new Map(tree.files.map((entry) => [entry.path, entry]));
  let payloadBytes = 0;
  let generatedCodeBytes = 0;
  for (const entry of tree.files) {
    const relative = `files/${entry.path}`;
    const measured = hashRegular(root, relative, entry.size);
    if (measured.gitBlobOid !== entry.oid) fail("GIT_BLOB_OID_MISMATCH", entry.path);
    entries.push({ path: relative, bytes: measured.bytes,
      sha256: measured.sha256, sourcePath: entry.path,
      sourceGitBlobOid: entry.oid });
    payloadBytes += measured.bytes;
    if (entry.path.endsWith(".py")) generatedCodeBytes += measured.bytes;
  }
  if (payloadBytes !== EXPECTED.treeFileBytes) fail("PAYLOAD_BYTE_CENSUS_INVALID");
  const readme = validateReadme(readRegular(root, "files/README.md", MAX_FILE_BYTES,
    byPath.get("README.md").size));
  const sessions = {
    rows: 0, topLevelTypes: {}, responseItemTypes: {}, eventMessageTypes: {},
    responseMessageRows: 0, eventAgentMessageRows: 0, eventUserMessageRows: 0,
    functionCallRows: 0, functionCallOutputRows: 0, functionCallCategories: {},
    structuredFunctionOutputRows: 0, unstructuredFunctionOutputRows: 0,
    toolExitCodes: {}, nonzeroToolExitRows: 0, explicitErrorTypedRows: 0,
  };
  const agentOutputs = { rows: 0, entities: 0, propagations: 0, alertsExplained: 0 };
  const judges = {
    rows: 0, judgeModels: {}, judgeProviders: {}, flatScoreSummaries: {},
    flatScoreObservations: 0, flatScoreNumericObservations: 0,
    flatScoreNullObservations: 0, evalScoreSections: 0,
  };
  const sessionIds = [];
  for (const run of tree.inventory.runs) {
    replaySession(readRegular(root, `files/${run.session.path}`,
      MAX_FILE_BYTES, run.session.size), sessions, sessionIds);
    if (run.agentOutput !== null) replayAgentOutput(readRegular(root,
      `files/${run.agentOutput.path}`, MAX_FILE_BYTES, run.agentOutput.size), agentOutputs);
    if (run.judgeOutput !== null) replayJudgeOutput(readRegular(root,
      `files/${run.judgeOutput.path}`, MAX_FILE_BYTES, run.judgeOutput.size),
    run.scenario, run.run, judges);
  }
  if (sessionIds.length !== EXPECTED.sessions
    || new Set(sessionIds).size !== EXPECTED.sessions
    || agentOutputs.rows !== EXPECTED.agentOutputs
    || judges.rows !== EXPECTED.judgeOutputs) fail("REPLAY_ROW_CENSUS_INVALID");
  sessions.topLevelTypes = countByValues(Object.entries(sessions.topLevelTypes)
    .flatMap(([key, count]) => Array(count).fill(key)));
  sessions.responseItemTypes = countByValues(Object.entries(sessions.responseItemTypes)
    .flatMap(([key, count]) => Array(count).fill(key)));
  sessions.eventMessageTypes = countByValues(Object.entries(sessions.eventMessageTypes)
    .flatMap(([key, count]) => Array(count).fill(key)));
  sessions.functionCallCategories = countByValues(Object.entries(
    sessions.functionCallCategories)
    .flatMap(([key, count]) => Array(count).fill(key)));
  sessions.toolExitCodes = Object.fromEntries(Object.entries(sessions.toolExitCodes)
    .sort(([left], [right]) => Number(left) - Number(right)));
  judges.judgeModels = countByValues(Object.entries(judges.judgeModels)
    .flatMap(([key, count]) => Array(count).fill(key)));
  judges.judgeProviders = countByValues(Object.entries(judges.judgeProviders)
    .flatMap(([key, count]) => Array(count).fill(key)));
  judges.flatScoreSummaries = finalizeSummaries(
    judges.flatScoreSummaries, judges.rows);
  return { entries, payloadBytes, generatedCodeBytes, readme,
    sessions, agentOutputs, judges,
    sessionIdSetRoot: digest("itbench/session-id-set/v1", sorted(sessionIds)) };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/itbench-full-trajectories-source-manifest/v1",
    datasetId: ITBENCH_DATASET_ID, revision: ITBENCH_REVISION,
    completeRepositoryFiles: 389, completeRepositoryBytes: 23_173_423,
    sessionFiles: 105, scenarioRuns: 105,
    entries: ordered, sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const metadata = new Map();
  const metadataEntries = [];
  for (const name of METADATA_PATHS) {
    const bytes = readRegular(root, `metadata/${name}`, MAX_METADATA_BYTES);
    metadata.set(name, bytes);
    metadataEntries.push({ path: `metadata/${name}`, bytes: bytes.length,
      sha256: itBenchSha256(bytes) });
  }
  const pageBytes = (when) => Array.from({ length: 6 }, (_, index) =>
    metadata.get(`full-tree-${when}-page${index + 1}.json`));
  const before = inspectItBenchMetadataSnapshot(
    metadata.get("dataset-record-before.json"), pageBytes("before"));
  const after = inspectItBenchMetadataSnapshot(
    metadata.get("dataset-record-after.json"), pageBytes("after"));
  if (!same(before, after)) fail("MATERIAL_FIXED_REVISION_STATE_CHANGED");
  const expectedLayout = sorted([
    ...METADATA_PATHS.map((name) => `metadata/${name}`),
    ...before.tree.files.map((entry) => `files/${entry.path}`),
    ...(withManifest ? ["source-manifest.json"] : []),
  ]);
  if (!same(walk(root), expectedLayout)) fail("SOURCE_LAYOUT_INVALID");
  const replay = replayRepository(root, before.tree);
  return { root, snapshot: before, replay,
    entries: [...metadataEntries, ...replay.entries] };
}

export function createItBenchFullSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

export function buildItBenchFullArtifactFromSourceDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  if (sourceManifest.sourceManifestHash !== EXPECTED_SOURCE_MANIFEST_HASH) {
    fail("SOURCE_MANIFEST_PIN_INVALID", sourceManifest.sourceManifestHash);
  }
  const manifestBytes = readRegular(collected.root, "source-manifest.json",
    MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(manifestBytes)) fail("SOURCE_MANIFEST_MISMATCH");
  const { record, tree } = collected.snapshot;
  const replay = collected.replay;
  const reportBody = {
    schema: ITBENCH_FULL_SCHEMA,
    disposition: ITBENCH_FULL_DISPOSITION,
    source: {
      datasetId: ITBENCH_DATASET_ID, revision: ITBENCH_REVISION,
      lastModified: record.lastModified, public: true, gated: false,
      fixedRevisionApiUsedStorageBytes: record.usedStorageBytes,
      exactRecordSiblingPaths: record.siblingPaths,
      exactRecordSiblingPathRoot: record.siblingPathRoot,
      fullTreePagesPerSnapshot: tree.pages,
      fullTreeSnapshots: 2,
      fullTreeEntries: tree.entries.length, fullTreeFiles: tree.files.length,
      fullTreeDirectories: tree.directories.length,
      fullTreeDeclaredFileBytes: tree.fileBytes,
      fullTreeExtensionCounts: tree.extensionCounts,
      fullTreeRoot: tree.root, fullTreeFilePathRoot: tree.filePathRoot,
      recordApiUsedStorageMatchesTreeDeclaredBytes:
        record.usedStorageBytes === tree.fileBytes,
      completeRecordAndTreeInventoried: true,
      fullRepositoryPayloadAcquired: true,
      fullRepositoryPayloadBytes: replay.payloadBytes,
      materialRecordAndTreeStateStable: true,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
    },
    corpus: {
      domain: "sre", modelDirectory: "OpenAI-GPT-OSS-120B",
      scenarios: tree.inventory.scenarioIds.length,
      scenarioIdSetRoot: tree.inventory.scenarioIdRoot,
      runsPerScenario: 3, sourceNativeRunRows: tree.inventory.runs.length,
      runPathRoot: tree.inventory.runPathRoot,
      uniqueSessionIds: 105, sessionIdSetRoot: replay.sessionIdSetRoot,
      sessionFiles: 105, agentOutputFiles: tree.inventory.agentOutputs,
      judgeOutputFiles: tree.inventory.judges,
      generatedCodeFiles: tree.inventory.generatedCode,
      generatedCodeBytes: replay.generatedCodeBytes,
      runShapes: tree.inventory.shapeCounts,
      runsMissingAgentAndJudgeOutput: tree.inventory.missingOutcomeRuns,
      agentAndJudgeOutputsAlwaysCoPresent: true,
      completeCurrentScenarioRunCrossProduct: true,
    },
    replay: {
      sessionJsonRows: replay.sessions.rows,
      sessionTopLevelTypes: replay.sessions.topLevelTypes,
      responseItemTypes: replay.sessions.responseItemTypes,
      eventMessageTypes: replay.sessions.eventMessageTypes,
      responseMessageRows: replay.sessions.responseMessageRows,
      eventAgentMessageRows: replay.sessions.eventAgentMessageRows,
      eventUserMessageRows: replay.sessions.eventUserMessageRows,
      functionCallRows: replay.sessions.functionCallRows,
      functionCallOutputRows: replay.sessions.functionCallOutputRows,
      functionCallCategories: replay.sessions.functionCallCategories,
      structuredFunctionOutputRows: replay.sessions.structuredFunctionOutputRows,
      unstructuredFunctionOutputRows: replay.sessions.unstructuredFunctionOutputRows,
      toolExitCodes: replay.sessions.toolExitCodes,
      nonzeroToolExitRows: replay.sessions.nonzeroToolExitRows,
      explicitErrorOrAbortTypedRows: replay.sessions.explicitErrorTypedRows,
      agentOutputRows: replay.agentOutputs.rows,
      agentOutputEntityItems: replay.agentOutputs.entities,
      agentOutputPropagationItems: replay.agentOutputs.propagations,
      agentOutputAlertExplanationItems: replay.agentOutputs.alertsExplained,
      judgeOutputRows: replay.judges.rows,
      judgeModels: replay.judges.judgeModels,
      judgeProviders: replay.judges.judgeProviders,
      judgeEvalScoreSections: replay.judges.evalScoreSections,
      publisherFlatScoreObservations: replay.judges.flatScoreObservations,
      publisherFlatScoreNumericObservations:
        replay.judges.flatScoreNumericObservations,
      publisherFlatScoreNullObservations: replay.judges.flatScoreNullObservations,
      publisherFlatScoreSummaries: replay.judges.flatScoreSummaries,
      allRepositoryGitBlobOidsSizesAndSha256Verified: true,
      allSessionsParsedAsJsonl: true,
      allOutputsAndJudgesParsedAsJson: true,
      generatedCodeAndSessionCommandsExecutedDuringReplay: false,
      rawSessionOutputJudgeOrCodeContentProjected: false,
    },
    semantics: {
      sourceOrganization: "THREE_FRESH_SIBLING_TRIALS_PER_SCENARIO",
      siblingRunsAreRetries: false,
      chronologicalRecoverySequenceEstablished: false,
      longitudinalOutcomeEstablished: false,
      generatedCodePresenceIsOutcomeSuccess: false,
      missingJudgeAndAgentOutputIsPublisherOutcomeFailure: false,
      judgeMeaning: "PUBLISHER_AUTOMATED_BENCHMARK_EVALUATION",
      publisherJudgeIsIndependentOutcome: false,
      publisherJudgeIsObservedRealWorldTruth: false,
      broaderAttemptCensusEstablished: false,
    },
    denominators: {
      FIXED_REVISION_FILES: tree.files.length,
      FIXED_REVISION_BYTES: tree.fileBytes,
      SRE_SCENARIOS: tree.inventory.scenarioIds.length,
      SOURCE_NATIVE_FRESH_RUNS: tree.inventory.runs.length,
      SESSION_FILES: 105, AGENT_OUTPUT_FILES: tree.inventory.agentOutputs,
      JUDGE_OUTPUT_FILES: tree.inventory.judges,
      GENERATED_CODE_FILES: tree.inventory.generatedCode,
      RUNS_MISSING_AGENT_AND_JUDGE_OUTPUT: tree.inventory.missingOutcomeRuns,
      siblingRunsMustNotBeCollapsedIntoRetryRecovery: true,
    },
    outcome: {
      publisherJudgeRows: replay.judges.rows,
      publisherJudgeMetricObservations: replay.judges.flatScoreObservations,
      missingPublisherJudgeRows: tree.inventory.missingOutcomeRuns,
      publisherJudgesIndependentlyRerun: false,
      independentOutcomeRows: 0, realWorldOutcomeRows: 0,
      longitudinalOutcomeRows: 0, recoveryEpisodeRows: 0,
    },
    rights: {
      datasetCardLicenseClaim: "CC-BY-NC-4.0",
      datasetApiLicenseTagPresent: true,
      datasetLicenseFilePresent: false,
      commercialUseAuthorizedByCardClaim: false,
      readmeTrainingDataUseCaseClaimPresent: replay.readme.trainingDataUseCaseClaim,
      useSpecificTrainingAuthorizationEstablished: false,
      rightsDisposition: "FAIL_CLOSED",
      legalConclusionEstablished: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      rawRepositoryFiles: tree.files.length,
      rawRepositoryBytes: replay.payloadBytes,
      rawSessionFiles: 105, rawGeneratedCodeFiles: tree.inventory.generatedCode,
      possibleInfrastructureIdentifiersOrSecrets: true,
      rawSourcePrivate: true, noPiiGuaranteed: false,
      rawTrajectoryOutputJudgeAndCodeProjected: false,
      rawProjectionRows: 0,
    },
    boundary: {
      softwareAgentFreshTrialRows: tree.inventory.runs.length,
      publisherJudgeRows: replay.judges.rows,
      independentOutcomeRows: 0, physicalEffectRows: 0,
      realWorldOutcomeRows: 0, longitudinalOutcomeRows: 0,
      recoveryEpisodeRows: 0, retrySequenceRows: 0,
      preActionDelegationRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      actorCreditRows: 0, ceuRows: 0, pricingRows: 0,
      authorityRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createItBenchFullReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: ITBENCH_FULL_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: itBenchSha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: itBenchSha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: ITBENCH_FULL_DISPOSITION,
    completeRepositoryFiles: 389, completeRepositoryBytes: 23_173_423,
    sourceNativeFreshTrialRows: 105, publisherJudgeRows: 90,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    authorizedTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyItBenchFullArtifactDirectory(directory) {
  try {
    const root = path.resolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)),
        ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readRegular(root, "report.json", MAX_METADATA_BYTES);
    const receiptBytes = readRegular(root, "run-receipt.json", MAX_METADATA_BYTES);
    const built = buildItBenchFullArtifactFromSourceDirectory(
      checkedPath(root, "source"));
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createItBenchFullReceipt(built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      verificationLevel: "FULL_REPOSITORY_SOURCE_REDERIVED" });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeItBenchFullArtifact(value) {
  return serialize(value);
}
