/*
 * Source-bound AutoResearchEval optimization/opus-4.8 model group.
 *
 * The selected raw JSONL contains agent messages, tool calls, commands, code,
 * outputs, and evaluation interactions. It remains mode-0600 private source.
 * Replay only parses JSON; no command, code, or tool payload is executed.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const AUTORESEARCH_DATASET_ID = "PrentisAI/AutoResearchEval";
export const AUTORESEARCH_REVISION =
  "412fb4908a3a7b98dd50cfa3e5c6cd40750d2d4f";
export const AUTORESEARCH_MODEL = "opus-4.8";
export const AUTORESEARCH_OPUS_SCHEMA =
  "outsider/autoresearch-opus-optimization-group/v1";
export const AUTORESEARCH_OPUS_RECEIPT_SCHEMA =
  "outsider/autoresearch-opus-optimization-group-receipt/v1";
export const AUTORESEARCH_OPUS_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/autoresearch-opus-optimization-report/v1";
const RECEIPT_DOMAIN = "outsider/autoresearch-opus-optimization-receipt/v1";
const MANIFEST_DOMAIN = "outsider/autoresearch-opus-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/autoresearch-opus-source-root/v1";
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const MAX_SUPPORT_BYTES = 20 * 1024 * 1024;
const MAX_TRAJECTORY_BYTES = 8 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

const EXPECTED = Object.freeze({
  recordLastModified: "2026-08-21T02:43:41.000Z",
  recordUsedStorageBytes: 197_733_921,
  recordSiblingPaths: 809,
  fullTreeEntries: 829,
  fullTreeFiles: 809,
  fullTreeDirectories: 20,
  fullTreeDeclaredFileBytes: 721_929_474,
  optimizationRows: 240,
  optimizationTasks: 30,
  optimizationModels: 8,
  selectedTrajectoryFiles: 30,
  selectedTrajectoryBytes: 13_656_864,
  selectedCleanSteps: 15_148,
  selectedPreCleanRawLines: 17_507,
});

const MODELS = Object.freeze([
  "codex-gpt5mini", "deepseek-v4-pro", "gemini-3.5-flash", "glm-5.2",
  "minimax-m3", "opus-4.8", "qwen3.7-max", "sonnet-5",
]);
const SUPPORT_PATHS = Object.freeze([
  ".gitattributes",
  "README.md",
  "_clean_manifest.json",
  "optimization/rollouts.jsonl",
  "optimization/tasks.jsonl",
  "optimization/task_list.csv",
]);
const METADATA_PATHS = Object.freeze([
  "dataset-record-before.json", "full-tree-before.json",
  "dataset-record-after.json", "full-tree-after.json",
]);
const KNOWN_SHA256 = Object.freeze({
  "README.md": "sha256:c29e3562c04989685170cc24741188e142a9e583407ff3703c9c082ef46c2237",
  "_clean_manifest.json": "sha256:33cc315c4a9e76672c198090272722be9dd952c4db263ff5565aed1d67cd135a",
  "optimization/rollouts.jsonl": "sha256:5a384102afed933d9dd89bc265aeb3d6b861a89890a25a5f3031d2a00f201a77",
  "optimization/tasks.jsonl": "sha256:6107d3a851ab2c86f5624925cd259b825473ab34b237790293fccdddb2962f25",
  "optimization/task_list.csv": "sha256:95b44b2bdaf951edd632b4692724d52351b9f06cf33f391f82a5dfe6faba4faf",
});

const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:080cd999c974c8d6dc199aa7618087f4030733d54fd36d97644e3826382dbf0e";

function fail(code, detail = null) {
  throw new Error(detail === null ? `AUTORESEARCH_OPUS_${code}`
    : `AUTORESEARCH_OPUS_${code}:${detail}`);
}

export function autoResearchSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return autoResearchSha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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

function parseJson(bytes, code) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { fail(code); }
}

function parseJsonLines(bytes, code) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(`${code}_UTF8_INVALID`); }
  const physical = text.split("\n");
  if (physical.at(-1) === "") physical.pop();
  if (physical.length === 0 || physical.some((line) => line.length === 0)) {
    fail(`${code}_EMPTY_LINE`);
  }
  return physical.map((line, index) => {
    try {
      const value = JSON.parse(line);
      if (!exactObject(value)) fail(`${code}_ROW_NOT_OBJECT`, String(index + 1));
      return value;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("AUTORESEARCH_OPUS_")) {
        throw error;
      }
      fail(`${code}_JSON_INVALID`, String(index + 1));
    }
  });
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

function hashRegular(root, relative, maximumBytes, exactBytes) {
  const { target } = checkedRegular(root, relative, maximumBytes, exactBytes);
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  const hash = createHash("sha256");
  const git = createHash("sha1");
  git.update(`blob ${exactBytes}\0`);
  const chunk = Buffer.allocUnsafe(1024 * 1024);
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

function recordProjection(bytes) {
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  if (!exactObject(value) || !Array.isArray(value.siblings)
    || !Array.isArray(value.tags)) fail("RECORD_SHAPE_INVALID");
  const siblingPaths = value.siblings.map((entry) => safeRelative(entry?.rfilename));
  if (new Set(siblingPaths).size !== siblingPaths.length) {
    fail("RECORD_SIBLING_DUPLICATE");
  }
  const ordered = sorted(siblingPaths);
  const licenseFiles = ordered.filter((entry) =>
    /(^|\/)(licen[cs]e|copying)(\.|$)/iu.test(entry));
  const licenseTags = value.tags.filter((entry) =>
    typeof entry === "string" && entry.startsWith("license:"));
  const result = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorageBytes: value.usedStorage, siblingPaths: ordered.length,
    siblingPathRoot: autoResearchSha256(Buffer.from(canonicalizeStrict(ordered), "utf8")),
    cardLicense: value.cardData?.license ?? null,
    licenseTags: sorted(licenseTags), licenseFiles,
    paths: ordered,
  };
  if (result.id !== AUTORESEARCH_DATASET_ID || result.author !== "PrentisAI"
    || result.sha !== AUTORESEARCH_REVISION
    || result.lastModified !== EXPECTED.recordLastModified
    || result.private !== false || result.gated !== false
    || result.disabled !== false
    || result.usedStorageBytes !== EXPECTED.recordUsedStorageBytes
    || result.siblingPaths !== EXPECTED.recordSiblingPaths
    || result.cardLicense !== "cc-by-4.0"
    || !same(result.licenseTags, ["license:cc-by-4.0"])
    || result.licenseFiles.length !== 0) fail("RECORD_PROFILE_INVALID");
  return result;
}

function treeProjection(bytes) {
  const value = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(value)) fail("TREE_SHAPE_INVALID");
  const entries = value.map((entry) => {
    if (!exactObject(entry) || !["file", "directory"].includes(entry.type)
      || !SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size)
      || entry.size < 0) fail("TREE_ENTRY_INVALID");
    const projected = { path: safeRelative(entry.path), type: entry.type,
      size: entry.size, oid: entry.oid, lfs: null, xetHash: null };
    if (entry.type === "directory") {
      if (entry.size !== 0 || entry.lfs !== undefined || entry.xetHash !== undefined) {
        fail("TREE_DIRECTORY_INVALID", entry.path);
      }
      return projected;
    }
    if (entry.lfs !== undefined) {
      if (!exactObject(entry.lfs) || !SHA256.test(entry.lfs.oid ?? "")
        || entry.lfs.size !== entry.size
        || !Number.isSafeInteger(entry.lfs.pointerSize)) {
        fail("TREE_LFS_INVALID", entry.path);
      }
      projected.lfs = { oid: entry.lfs.oid, size: entry.lfs.size,
        pointerSize: entry.lfs.pointerSize };
    }
    if (entry.xetHash !== undefined) {
      if (!SHA256.test(entry.xetHash)) fail("TREE_XET_INVALID", entry.path);
      projected.xetHash = entry.xetHash;
    }
    return projected;
  }).sort((left, right) => left.path < right.path ? -1 : 1);
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("TREE_PATH_DUPLICATE");
  }
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const fileBytes = files.reduce((sum, entry) => sum + entry.size, 0);
  if (entries.length !== EXPECTED.fullTreeEntries
    || files.length !== EXPECTED.fullTreeFiles
    || directories.length !== EXPECTED.fullTreeDirectories
    || fileBytes !== EXPECTED.fullTreeDeclaredFileBytes) {
    fail("TREE_CENSUS_INVALID");
  }
  const paths = files.map((entry) => entry.path);
  const selected = files.filter((entry) => entry.path.startsWith(
    `optimization/trajectories/${AUTORESEARCH_MODEL}/`));
  if (selected.length !== EXPECTED.selectedTrajectoryFiles
    || selected.reduce((sum, entry) => sum + entry.size, 0)
      !== EXPECTED.selectedTrajectoryBytes
    || selected.some((entry) => entry.size < 1
      || entry.lfs !== null || entry.xetHash !== null)) {
    fail("SELECTED_TREE_PROFILE_INVALID");
  }
  for (const required of SUPPORT_PATHS) {
    const entry = files.find((candidate) => candidate.path === required);
    if (!entry || entry.size < 1) fail("TREE_SUPPORT_MISSING", required);
  }
  return {
    entries, files, directories, fileBytes, selected,
    root: digest("autoresearch/full-tree/v1", entries),
    filePathRoot: digest("autoresearch/full-tree-file-paths/v1", paths),
    selectedRoot: digest("autoresearch/opus-selected-tree/v1", selected),
    lfsFiles: files.filter((entry) => entry.lfs !== null).length,
    xetFiles: files.filter((entry) => entry.xetHash !== null).length,
  };
}

export function inspectAutoResearchMetadataSnapshot(recordBytes, treeBytes) {
  const record = recordProjection(recordBytes);
  const tree = treeProjection(treeBytes);
  if (!same(record.paths, tree.files.map((entry) => entry.path))) {
    fail("RECORD_TREE_FILE_PATH_MISMATCH");
  }
  return deepFreeze({ record, tree });
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key];
    if (typeof value !== "string" || value.length === 0) fail("COUNT_KEY_INVALID", key);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return Object.fromEntries(sorted(Object.keys(counts)).map((name) => [name, counts[name]]));
}

function parseTaskCsv(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail("TASK_CSV_UTF8_INVALID"); }
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length !== 31
    || lines[0] !== "task_id,domain,description,venue,year,venue_source_confidence\r"
      && lines[0] !== "task_id,domain,description,venue,year,venue_source_confidence") {
    fail("TASK_CSV_PROFILE_INVALID");
  }
  return lines.slice(1).map((line) => {
    const cleaned = line.endsWith("\r") ? line.slice(0, -1) : line;
    const first = cleaned.indexOf(",");
    if (first < 1) fail("TASK_CSV_ROW_INVALID");
    return cleaned.slice(0, first);
  });
}

function validateReadme(bytes) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail("README_UTF8_INVALID"); }
  const claims = {
    cardCcBy40: text.includes("license: cc-by-4.0"),
    eightModels: text.includes("collected across 8 frontier\nmodels"),
    staleOptimization31Tasks: text.includes("31 tasks where"),
    staleOptimization247Rows: text.includes("8 models = 247 rollouts"),
    staleOptimization195Success: text.includes("195 success / 52 non-success"),
    failureTrajectoriesIncludedClaim: text.includes("Failure trajectories are included on purpose"),
  };
  if (Object.values(claims).some((value) => value !== true)) {
    fail("README_CLAIM_PROFILE_INVALID");
  }
  return claims;
}

function replaySelectedFiles(root, tree) {
  const treeByPath = new Map(tree.files.map((entry) => [entry.path, entry]));
  const entries = [];
  let selectedSourcePayloadBytes = 0;
  for (const relative of SUPPORT_PATHS) {
    const treeEntry = treeByPath.get(relative);
    const measured = hashRegular(root, `files/${relative}`, MAX_SUPPORT_BYTES,
      treeEntry.size);
    if (measured.gitBlobOid !== treeEntry.oid) fail("GIT_BLOB_OID_MISMATCH", relative);
    if (KNOWN_SHA256[relative] && measured.sha256 !== KNOWN_SHA256[relative]) {
      fail("KNOWN_SHA256_MISMATCH", relative);
    }
    selectedSourcePayloadBytes += measured.bytes;
    entries.push({ path: `files/${relative}`, bytes: measured.bytes,
      sha256: measured.sha256, sourcePath: relative, sourceGitBlobOid: treeEntry.oid });
  }
  const readme = validateReadme(readRegular(root, "files/README.md", MAX_SUPPORT_BYTES));

  const allRollouts = parseJsonLines(readRegular(root,
    "files/optimization/rollouts.jsonl", MAX_SUPPORT_BYTES), "ROLLOUTS");
  if (allRollouts.length !== EXPECTED.optimizationRows) fail("ROLLOUT_COUNT_INVALID");
  const rolloutKeys = new Set();
  for (const row of allRollouts) {
    if (typeof row.task_id !== "string" || typeof row.model !== "string"
      || typeof row.harness !== "string" || typeof row.status !== "string"
      || typeof row.trajectory_path !== "string"
      || !Number.isSafeInteger(row.returncode)) fail("ROLLOUT_ROW_INVALID");
    const key = `${row.model}\0${row.task_id}`;
    if (rolloutKeys.has(key)) fail("ROLLOUT_PAIR_DUPLICATE", key);
    rolloutKeys.add(key);
  }
  const modelCounts = countBy(allRollouts, "model");
  if (!same(Object.keys(modelCounts), MODELS)
    || Object.values(modelCounts).some((count) => count !== 30)) {
    fail("ROLLOUT_MODEL_CENSUS_INVALID");
  }
  const allStatuses = countBy(allRollouts, "status");
  if (!same(allStatuses,
    { agent_error: 23, killed: 12, success: 188, timeout: 17 })) {
    fail("ROLLOUT_STATUS_CENSUS_INVALID");
  }

  const taskRows = parseJsonLines(readRegular(root,
    "files/optimization/tasks.jsonl", MAX_SUPPORT_BYTES), "TASKS");
  if (taskRows.length !== EXPECTED.optimizationTasks
    || taskRows.some((row) => typeof row.task_id !== "string")) {
    fail("TASK_ROWS_INVALID");
  }
  const taskIds = sorted(taskRows.map((row) => row.task_id));
  if (new Set(taskIds).size !== taskIds.length) fail("TASK_ID_DUPLICATE");
  const csvIds = sorted(parseTaskCsv(readRegular(root,
    "files/optimization/task_list.csv", MAX_SUPPORT_BYTES)));
  if (!same(taskIds, csvIds)) fail("TASK_CSV_JSONL_MISMATCH");

  const cleanManifest = parseJson(readRegular(root,
    "files/_clean_manifest.json", MAX_SUPPORT_BYTES), "CLEAN_MANIFEST_INVALID");
  if (!Array.isArray(cleanManifest) || cleanManifest.length !== 800) {
    fail("CLEAN_MANIFEST_CENSUS_INVALID");
  }
  const cleanKeys = new Set();
  for (const row of cleanManifest) {
    if (!exactObject(row) || typeof row.subset !== "string"
      || typeof row.model !== "string" || typeof row.task !== "string"
      || typeof row.format !== "string" || !Number.isSafeInteger(row.raw_lines)
      || !Number.isSafeInteger(row.clean_steps)) fail("CLEAN_MANIFEST_ROW_INVALID");
    const key = `${row.subset}\0${row.model}\0${row.task}`;
    if (cleanKeys.has(key)) fail("CLEAN_MANIFEST_DUPLICATE", key);
    cleanKeys.add(key);
  }
  const optimizationManifest = cleanManifest.filter((row) => row.subset === "optimization");
  if (optimizationManifest.length !== 240) fail("OPTIMIZATION_MANIFEST_COUNT_INVALID");
  const selectedManifest = optimizationManifest.filter((row) => row.model === AUTORESEARCH_MODEL);
  if (selectedManifest.length !== 30 || selectedManifest.some((row) => row.format !== "json_stream")) {
    fail("SELECTED_MANIFEST_PROFILE_INVALID");
  }
  const selectedManifestByTask = new Map(selectedManifest.map((row) => [row.task, row]));
  if (!same(sorted(selectedManifestByTask.keys()), taskIds)) {
    fail("SELECTED_MANIFEST_TASK_CLOSURE_INVALID");
  }

  const selectedRollouts = allRollouts.filter((row) => row.model === AUTORESEARCH_MODEL);
  if (selectedRollouts.length !== 30
    || !same(sorted(selectedRollouts.map((row) => row.task_id)), taskIds)
    || selectedRollouts.some((row) => row.harness !== "claude")) {
    fail("SELECTED_ROLLOUT_TASK_CLOSURE_INVALID");
  }
  const selectedStatuses = countBy(selectedRollouts, "status");
  if (!same(selectedStatuses,
    { agent_error: 7, killed: 2, success: 17, timeout: 4 })) {
    fail("SELECTED_STATUS_CENSUS_INVALID");
  }
  const selectedReturnCodes = Object.fromEntries(Object.entries(
    selectedRollouts.reduce((result, row) => {
      const key = String(row.returncode);
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {})).sort(([left], [right]) => Number(left) - Number(right)));
  if (!same(selectedReturnCodes, { "-1": 4, "0": 17, "1": 7, "137": 2 })) {
    fail("SELECTED_RETURNCODE_CENSUS_INVALID");
  }

  const selectedTreeByPath = new Map(tree.selected.map((entry) => [entry.path, entry]));
  const trajectoryTypeCounts = {};
  let cleanSteps = 0;
  let preCleanRawLines = 0;
  for (const rollout of selectedRollouts) {
    const sourcePath = `optimization/${safeRelative(rollout.trajectory_path)}`;
    const expectedPath = `optimization/trajectories/${AUTORESEARCH_MODEL}/${rollout.task_id}.jsonl`;
    if (sourcePath !== expectedPath) fail("ROLLOUT_TRAJECTORY_PATH_INVALID", rollout.task_id);
    const treeEntry = selectedTreeByPath.get(sourcePath);
    const manifestRow = selectedManifestByTask.get(rollout.task_id);
    if (!treeEntry || !manifestRow) fail("TRAJECTORY_CLOSURE_MISSING", rollout.task_id);
    const artifactPath = `files/${sourcePath}`;
    const bytes = readRegular(root, artifactPath, MAX_TRAJECTORY_BYTES, treeEntry.size);
    const measured = hashRegular(root, artifactPath, MAX_TRAJECTORY_BYTES, treeEntry.size);
    if (measured.gitBlobOid !== treeEntry.oid) fail("GIT_BLOB_OID_MISMATCH", sourcePath);
    const rows = parseJsonLines(bytes, "TRAJECTORY");
    if (rows.length !== manifestRow.clean_steps) {
      fail("TRAJECTORY_CLEAN_STEP_MISMATCH", rollout.task_id);
    }
    for (const row of rows) {
      const type = typeof row.type === "string" && row.type.length > 0
        ? row.type : "__missing__";
      trajectoryTypeCounts[type] = (trajectoryTypeCounts[type] ?? 0) + 1;
    }
    cleanSteps += rows.length;
    preCleanRawLines += manifestRow.raw_lines;
    selectedSourcePayloadBytes += measured.bytes;
    entries.push({ path: artifactPath, bytes: measured.bytes,
      sha256: measured.sha256, sourcePath, sourceGitBlobOid: treeEntry.oid });
  }
  if (cleanSteps !== EXPECTED.selectedCleanSteps
    || preCleanRawLines !== EXPECTED.selectedPreCleanRawLines
    || selectedTreeByPath.size !== selectedRollouts.length) {
    fail("SELECTED_TRAJECTORY_CENSUS_INVALID");
  }
  return {
    entries, selectedSourcePayloadBytes, readme,
    taskIds, allRollouts, allStatuses, modelCounts,
    selectedRollouts, selectedStatuses, selectedReturnCodes,
    cleanManifestRows: cleanManifest.length,
    optimizationManifestRows: optimizationManifest.length,
    selectedCleanManifestRows: selectedManifest.length,
    cleanSteps, preCleanRawLines,
    trajectoryTypeCounts: Object.fromEntries(sorted(Object.keys(trajectoryTypeCounts))
      .map((name) => [name, trajectoryTypeCounts[name]])),
  };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/autoresearch-opus-source-manifest/v1",
    datasetId: AUTORESEARCH_DATASET_ID, revision: AUTORESEARCH_REVISION,
    subset: "optimization", model: AUTORESEARCH_MODEL,
    sourceNativeTaskRows: 30, selectedTrajectoryFiles: 30,
    entries: ordered, sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const metadataEntries = [];
  const metadata = new Map();
  for (const name of METADATA_PATHS) {
    const bytes = readRegular(root, `metadata/${name}`, MAX_METADATA_BYTES);
    metadata.set(name, bytes);
    metadataEntries.push({ path: `metadata/${name}`, bytes: bytes.length,
      sha256: autoResearchSha256(bytes) });
  }
  const before = inspectAutoResearchMetadataSnapshot(
    metadata.get("dataset-record-before.json"), metadata.get("full-tree-before.json"));
  const after = inspectAutoResearchMetadataSnapshot(
    metadata.get("dataset-record-after.json"), metadata.get("full-tree-after.json"));
  if (!same(before, after)) fail("MATERIAL_FIXED_REVISION_STATE_CHANGED");
  const selectedPaths = before.tree.selected.map((entry) => entry.path);
  const expectedLayout = sorted([
    ...METADATA_PATHS.map((name) => `metadata/${name}`),
    ...SUPPORT_PATHS.map((name) => `files/${name}`),
    ...selectedPaths.map((name) => `files/${name}`),
    ...(withManifest ? ["source-manifest.json"] : []),
  ]);
  if (!same(walk(root), expectedLayout)) fail("SOURCE_LAYOUT_INVALID");
  const replay = replaySelectedFiles(root, before.tree);
  return { root, metadataEntries, snapshot: before, replay,
    entries: [...metadataEntries, ...replay.entries] };
}

export function createAutoResearchOpusSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

export function buildAutoResearchOpusArtifactFromSourceDirectory(sourceDirectory) {
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
    schema: AUTORESEARCH_OPUS_SCHEMA,
    disposition: AUTORESEARCH_OPUS_DISPOSITION,
    source: {
      datasetId: AUTORESEARCH_DATASET_ID, revision: AUTORESEARCH_REVISION,
      lastModified: record.lastModified, public: true, gated: false,
      fixedRevisionUsedStorageBytes: record.usedStorageBytes,
      exactRecordSiblingPaths: record.siblingPaths,
      exactRecordSiblingPathRoot: record.siblingPathRoot,
      fullTreeEntries: tree.entries.length, fullTreeFiles: tree.files.length,
      fullTreeDirectories: tree.directories.length,
      fullTreeDeclaredFileBytes: tree.fileBytes,
      fullTreeRoot: tree.root, fullTreeFilePathRoot: tree.filePathRoot,
      fullTreeLfsFiles: tree.lfsFiles, fullTreeXetFiles: tree.xetFiles,
      completeRecordAndFullTreeInventoried: true,
      fullRepositoryPayloadAcquired: false,
      materialRecordAndTreeStateStable: true,
      selectedTreeRoot: tree.selectedRoot,
      selectedPhysicalPrefix: `optimization/trajectories/${AUTORESEARCH_MODEL}/`,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
    },
    selection: {
      subset: "optimization", model: AUTORESEARCH_MODEL,
      completeOptimizationRolloutsAcquired: true,
      completeOptimizationTasksAcquired: true,
      completeOptimizationTaskListAcquired: true,
      completeSelectedModelDirectoryAcquired: true,
      currentOptimizationTaskRows: replay.taskIds.length,
      currentOptimizationModelRows: Object.keys(replay.modelCounts).length,
      currentOptimizationRolloutRows: replay.allRollouts.length,
      selectedSourceNativeAttemptRows: replay.selectedRollouts.length,
      selectedTrajectoryFiles: tree.selected.length,
      selectedTrajectoryBytes: tree.selected.reduce((sum, entry) => sum + entry.size, 0),
      selectedSourcePayloadBytes: replay.selectedSourcePayloadBytes,
      completeCurrentModelTaskCrossProduct: true,
      representativenessEstablished: false,
      fullDatasetPayloadExhausted: false,
    },
    replay: {
      currentOptimizationTasks: replay.taskIds.length,
      currentOptimizationModels: replay.modelCounts,
      currentOptimizationRollouts: replay.allRollouts.length,
      currentOptimizationStatuses: replay.allStatuses,
      selectedHarness: "claude",
      selectedStatuses: replay.selectedStatuses,
      selectedReturnCodes: replay.selectedReturnCodes,
      cleanManifestRows: replay.cleanManifestRows,
      optimizationCleanManifestRows: replay.optimizationManifestRows,
      selectedCleanManifestRows: replay.selectedCleanManifestRows,
      selectedPreCleanRawLinesClaim: replay.preCleanRawLines,
      selectedCurrentTrajectoryJsonRows: replay.cleanSteps,
      selectedTrajectoryTypeCounts: replay.trajectoryTypeCounts,
      rolloutsTasksManifestTrajectoryClosureVerified: true,
      trajectoryPayloadsExecutedDuringReplay: false,
      rawTrajectoryContentProjected: false,
    },
    documentationDrift: {
      readmeClaimsOptimizationTasks: 31,
      readmeClaimsOptimizationRollouts: 247,
      readmeClaimsOptimizationSuccess: 195,
      readmeClaimsOptimizationNonSuccess: 52,
      currentBytesOptimizationTasks: 30,
      currentBytesOptimizationRollouts: 240,
      currentBytesOptimizationSuccess: 188,
      currentBytesOptimizationNonSuccess: 52,
      readmeTaskAndRolloutDenominatorsMatchCurrentBytes: false,
      currentBytesSupersedeNarrativeCountsForThisArtifact: true,
    },
    semantics: {
      statusMeaning: "PUBLISHER_SANDBOX_HARNESS_STATUS",
      successIsIndependentOutcome: false,
      nonSuccessIsObservedRealWorldFailure: false,
      rowsAreRetriesOfOneTaskExecution: false,
      chronologicalRecoverySequenceEstablished: false,
      currentSourceNativeAttemptCensusScope:
        "OPUS_4_8_X_CURRENT_30_OPTIMIZATION_TASKS",
      broaderExperimentalAttemptCensusEstablished: false,
      preCleanRawLinesAreCurrentPhysicalJsonRows: false,
      cleanStepsMatchCurrentPhysicalJsonRows: true,
    },
    denominators: {
      FIXED_REVISION_SIBLING_PATHS: record.siblingPaths,
      FULL_TREE_FILES: tree.files.length,
      CURRENT_OPTIMIZATION_TASKS: replay.taskIds.length,
      CURRENT_OPTIMIZATION_MODELS: Object.keys(replay.modelCounts).length,
      CURRENT_OPTIMIZATION_ROLLOUT_ROWS: replay.allRollouts.length,
      SELECTED_OPUS_TASK_ROWS: replay.selectedRollouts.length,
      SELECTED_OPUS_TRAJECTORY_FILES: tree.selected.length,
      crossModelAdditionWithoutTaskIdentityProhibited: true,
    },
    outcome: {
      publisherHarnessStatusRows: replay.selectedRollouts.length,
      publisherHarnessSuccessRows: replay.selectedStatuses.success,
      publisherHarnessNonSuccessRows: replay.selectedRollouts.length
        - replay.selectedStatuses.success,
      publisherOutcomesIndependentlyRerun: false,
      independentOutcomeRows: 0, realWorldOutcomeRows: 0,
      recoveryEpisodeRows: 0,
    },
    rights: {
      datasetCardLicenseClaim: "CC-BY-4.0",
      datasetApiLicenseTagPresent: true,
      datasetLicenseFilePresent: false,
      upstreamTaskRightsEstablished: false,
      cardClaimExtrapolatedToUpstreamTasks: false,
      rightsDisposition: "FAIL_CLOSED",
      legalConclusionEstablished: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      rawTrajectoryFiles: tree.selected.length,
      rawTrajectoryBytes: tree.selected.reduce((sum, entry) => sum + entry.size, 0),
      rawSourcePrivate: true, noPiiGuaranteed: false,
      rawMessagesCommandsCodeOutputsProjected: false,
      rawProjectionRows: 0,
    },
    boundary: {
      softwareAgentHarnessRows: replay.selectedRollouts.length,
      publisherHarnessStatusRows: replay.selectedRollouts.length,
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

export function createAutoResearchOpusReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: AUTORESEARCH_OPUS_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: autoResearchSha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: autoResearchSha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: AUTORESEARCH_OPUS_DISPOSITION,
    selectedSourceNativeAttemptRows: 30,
    publisherHarnessStatusRows: 30,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    authorizedTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyAutoResearchOpusArtifactDirectory(directory) {
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
    const built = buildAutoResearchOpusArtifactFromSourceDirectory(
      checkedPath(root, "source"));
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createAutoResearchOpusReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED" });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeAutoResearchOpusArtifact(value) {
  return serialize(value);
}

export const AUTORESEARCH_SELECTED_SUPPORT_PATHS = SUPPORT_PATHS;
