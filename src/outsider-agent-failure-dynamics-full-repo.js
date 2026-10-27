/*
 * Complete fixed-revision source replay for AgentHazard / agent-failure-dynamics.
 *
 * The visible benchmark consists of derived edit-outcome sequences, metadata,
 * documentation, figures, examples, and an evaluator. It does not contain the
 * README's claimed 85,050 raw trajectories. evaluate.py is inert source bytes.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "./canonical-historical-replay.js";

export const AGENT_FAILURE_DYNAMICS_DATASET_ID =
  "Anonymousblind/agent-failure-dynamics";
export const AGENT_FAILURE_DYNAMICS_REVISION =
  "4e448b80d8fd7dec19dacd43312811ee0013f629";
export const AGENT_FAILURE_DYNAMICS_SCHEMA =
  "outsider/agent-failure-dynamics-full-repo/v1";
export const AGENT_FAILURE_DYNAMICS_RECEIPT_SCHEMA =
  "outsider/agent-failure-dynamics-full-repo-receipt/v1";
export const AGENT_FAILURE_DYNAMICS_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/agent-failure-dynamics-full-report/v1";
const RECEIPT_DOMAIN = "outsider/agent-failure-dynamics-full-receipt/v1";
const MANIFEST_DOMAIN = "outsider/agent-failure-dynamics-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/agent-failure-dynamics-source-root/v1";
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

const EXPECTED = Object.freeze({
  lastModified: "2026-07-04T09:33:28.000Z",
  usedStorageBytes: 2_225_307,
  siblingPaths: 39,
  treeEntries: 43,
  treeFiles: 39,
  treeDirectories: 4,
  treeFileBytes: 4_526_823,
  lfsFiles: 10,
  xetFiles: 10,
  extensionCounts: Object.freeze({
    gitattributes: 1, json: 12, md: 4, pdf: 11, png: 10, py: 1,
  }),
  trainRows: 3_043,
  valRows: 1_014,
  testRows: 1_015,
  hiddenRows: 1_015,
  uniqueBenchmarkIds: 5_072,
  editOutcomeValues: 98_198,
  errorEditOutcomes: 20_224,
  cleanEditOutcomes: 77_974,
});

const SPLITS = Object.freeze({
  train: Object.freeze({ rows: 3_043, edits: 59_098, errors: 12_211,
    clean: 46_887, min: 8, max: 115, resolvedTrue: 1_135,
    resolvedFalse: 1_908, scaffold: Object.freeze({ ticks: 1_060,
      tool: 936, xml: 1_047 }) }),
  val: Object.freeze({ rows: 1_014, edits: 19_205, errors: 3_946,
    clean: 15_259, min: 8, max: 86, resolvedTrue: 372,
    resolvedFalse: 642, scaffold: Object.freeze({ ticks: 358,
      tool: 336, xml: 320 }) }),
  test: Object.freeze({ rows: 1_015, edits: 19_895, errors: 4_067,
    clean: 15_828, min: 8, max: 84, scaffold: Object.freeze({ ticks: 364,
      tool: 278, xml: 373 }) }),
});

const METADATA_PATHS = Object.freeze([
  "dataset-record-before.json", "full-tree-before.json",
  "dataset-record-after.json", "full-tree-after.json",
]);

const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:7a5f5c8d140a4d69495f8cf6d4f9ad0c50784a3acbc6f7f38dcb9ab818557408";

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENT_FAILURE_DYNAMICS_${code}`
    : `AGENT_FAILURE_DYNAMICS_${code}:${detail}`);
}

export function agentFailureDynamicsSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return agentFailureDynamicsSha256(Buffer.from(
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
  return target;
}

function readRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedRegular(root, relative, maximumBytes, exactBytes);
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
  const target = checkedRegular(root, relative, MAX_FILE_BYTES, exactBytes);
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
      hash.update(view); git.update(view); total += count;
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

function countBy(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
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
    usedStorageBytes: value.usedStorage, siblingPaths: ordered.length,
    siblingPathRoot: digest("agent-failure-dynamics/sibling-paths/v1", ordered),
    cardLicense: value.cardData?.license ?? null,
    licenseTags: sorted(licenseTags), licenseFiles, paths: ordered,
  };
  if (result.id !== AGENT_FAILURE_DYNAMICS_DATASET_ID
    || result.author !== "Anonymousblind"
    || result.sha !== AGENT_FAILURE_DYNAMICS_REVISION
    || result.lastModified !== EXPECTED.lastModified
    || result.private !== false || result.gated !== false
    || result.disabled !== false
    || result.usedStorageBytes !== EXPECTED.usedStorageBytes
    || result.siblingPaths !== EXPECTED.siblingPaths
    || result.cardLicense !== "cc-by-4.0"
    || !same(result.licenseTags, ["license:cc-by-4.0"])
    || result.licenseFiles.length !== 0) fail("RECORD_PROFILE_INVALID");
  return result;
}

function extension(pathname) {
  const name = pathname.split("/").at(-1);
  const dot = name.lastIndexOf(".");
  return dot < 0 ? "__none__" : name.slice(dot + 1);
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
    if (entry.size < 1) fail("TREE_FILE_EMPTY", entry.path);
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
  const extensionCounts = countBy(files.map((entry) => extension(entry.path)));
  const lfsFiles = files.filter((entry) => entry.lfs !== null).length;
  const xetFiles = files.filter((entry) => entry.xetHash !== null).length;
  if (entries.length !== EXPECTED.treeEntries || files.length !== EXPECTED.treeFiles
    || directories.length !== EXPECTED.treeDirectories
    || fileBytes !== EXPECTED.treeFileBytes
    || lfsFiles !== EXPECTED.lfsFiles || xetFiles !== EXPECTED.xetFiles
    || !same(extensionCounts, EXPECTED.extensionCounts)) fail("TREE_CENSUS_INVALID");
  return { entries, files, directories, fileBytes, extensionCounts,
    lfsFiles, xetFiles,
    root: digest("agent-failure-dynamics/full-tree/v1", entries),
    filePathRoot: digest("agent-failure-dynamics/file-paths/v1",
      files.map((entry) => entry.path)) };
}

export function inspectAgentFailureDynamicsMetadata(recordBytes, treeBytes) {
  const record = recordProjection(recordBytes);
  const tree = treeProjection(treeBytes);
  if (!same(record.paths, tree.files.map((entry) => entry.path))) {
    fail("RECORD_TREE_FILE_PATH_MISMATCH");
  }
  return deepFreeze({ record, tree });
}

function validateReadme(bytes, tree) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail("README_UTF8_INVALID"); }
  const paths = new Set(tree.files.map((entry) => entry.path));
  const claims = {
    cardCcBy40: text.includes("license: cc-by-4.0"),
    globalTrajectories85050: text.includes("85,050 trajectories"),
    rawTrajectoriesClaim: text.includes("| Raw trajectories |")
      && text.includes("| **Yes** |"),
    trainApprox3600: text.includes("train.json | ~3,600"),
    valApprox1200: text.includes("val.json | ~1,200"),
    testApprox1200: text.includes("test.json | ~1,200"),
    benchmarkApprox6000: text.includes("Benchmark split trajectories: ~6,000"),
    codeMitClaim: text.includes("Benchmark code and evaluation scripts: MIT License"),
    parsedDataCcByClaim: text.includes("Parsed trajectory data and annotations: CC-BY-4.0"),
    noPersonalDataClaim: text.includes("No human subjects or personal data involved"),
    productionTrainingOutOfScope: text.includes("Training production coding agents")
      && text.includes("Out-of-scope uses"),
    analysisDirectoryClaim: text.includes("analysis/                 all analysis scripts"),
    allScaffoldsParsedFileClaim:
      text.includes("all_scaffolds_parsed.json    76,977 parsed trajectories"),
  };
  if (Object.values(claims).some((item) => item !== true)) {
    fail("README_CLAIM_PROFILE_INVALID");
  }
  return {
    ...claims,
    rawTrajectoryFilesPresent: false,
    claimedAnalysisDirectoryPresent:
      tree.directories.some((entry) => entry.path === "analysis"),
    claimedAllScaffoldsParsedFilePresent:
      paths.has("data/all_scaffolds_parsed.json"),
  };
}

function splitReplay(value, name) {
  const expected = SPLITS[name];
  if (!Array.isArray(value) || value.length !== expected.rows) {
    fail("SPLIT_ROW_COUNT_INVALID", name);
  }
  const labeled = name !== "test";
  const requiredKeys = sorted(["id", "scaffold", "n_edits", "edit_outcomes",
    ...(labeled ? ["resolved"] : [])]);
  const ids = [];
  let edits = 0;
  let errors = 0;
  let min = Infinity;
  let max = -Infinity;
  let resolvedTrue = 0;
  let resolvedFalse = 0;
  const scaffolds = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    const expectedId = `${name}_${String(index).padStart(5, "0")}`;
    if (!exactObject(row) || !same(sorted(Object.keys(row)), requiredKeys)
      || row.id !== expectedId || typeof row.scaffold !== "string"
      || !Number.isSafeInteger(row.n_edits) || row.n_edits < 0
      || !Array.isArray(row.edit_outcomes)
      || row.edit_outcomes.length !== row.n_edits
      || row.edit_outcomes.some((item) => typeof item !== "boolean")
      || labeled && typeof row.resolved !== "boolean") {
      fail("SPLIT_ROW_INVALID", `${name}/${index}`);
    }
    ids.push(row.id); scaffolds.push(row.scaffold); edits += row.n_edits;
    errors += row.edit_outcomes.filter(Boolean).length;
    min = Math.min(min, row.n_edits); max = Math.max(max, row.n_edits);
    if (row.resolved === true) resolvedTrue += 1;
    if (row.resolved === false) resolvedFalse += 1;
  }
  const result = { rows: value.length, ids, scaffolds: countBy(scaffolds),
    edits, errors, clean: edits - errors, min, max,
    ...(labeled ? { resolvedTrue, resolvedFalse } : {}) };
  const expectedProjection = { rows: expected.rows, scaffolds: expected.scaffold,
    edits: expected.edits, errors: expected.errors, clean: expected.clean,
    min: expected.min, max: expected.max,
    ...(labeled ? { resolvedTrue: expected.resolvedTrue,
      resolvedFalse: expected.resolvedFalse } : {}) };
  const comparable = { rows: result.rows, scaffolds: result.scaffolds,
    edits: result.edits, errors: result.errors, clean: result.clean,
    min: result.min, max: result.max,
    ...(labeled ? { resolvedTrue, resolvedFalse } : {}) };
  if (!same(comparable, expectedProjection)) fail("SPLIT_CENSUS_INVALID", name);
  return result;
}

function validateHidden(value, testIds) {
  if (!Array.isArray(value) || value.length !== EXPECTED.hiddenRows) {
    fail("HIDDEN_ROW_COUNT_INVALID");
  }
  let resolvedTrue = 0;
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    if (!exactObject(row) || !same(sorted(Object.keys(row)), ["id", "resolved"])
      || row.id !== testIds[index] || typeof row.resolved !== "boolean") {
      fail("HIDDEN_ROW_INVALID", String(index));
    }
    if (row.resolved) resolvedTrue += 1;
  }
  if (resolvedTrue !== 355) fail("HIDDEN_LABEL_CENSUS_INVALID");
  return { rows: value.length, resolvedTrue, resolvedFalse: value.length - resolvedTrue,
    idsMatchTestInOrder: true };
}

function validateSchema(schema) {
  if (!exactObject(schema) || schema.name !== "AgentHazard Benchmark"
    || schema.version !== "1.0.0" || !exactObject(schema.trajectory_schema)
    || !exactObject(schema.task_schemas)
    || sorted(Object.keys(schema.trajectory_schema)).join(",")
      !== "edit_outcomes,id,n_edits,resolved,scaffold"
    || schema.trajectory_schema.edit_outcomes
      !== "list[int] — binary sequence, 1=error after edit, 0=clean") {
    fail("SCHEMA_PROFILE_INVALID");
  }
  return { version: schema.version,
    trajectoryFieldCount: Object.keys(schema.trajectory_schema).length,
    taskSchemas: sorted(Object.keys(schema.task_schemas)),
    declaresEditOutcomesAsIntegerList: true };
}

function validateExample(value, kind, testIds) {
  const rows = kind === "collapse" ? 100 : 1_200;
  if (!Array.isArray(value) || value.length !== rows) {
    fail("EXAMPLE_ROW_COUNT_INVALID", kind);
  }
  const ids = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    const prefix = kind === "collapse" ? "collapse" : "test";
    const id = `${prefix}_${String(index).padStart(5, "0")}`;
    const valueKey = kind === "stopping" ? "stop_at" : "prediction";
    const valueValid = kind === "stopping"
      ? Number.isSafeInteger(row?.stop_at)
      : typeof row?.prediction === "number" && Number.isFinite(row.prediction)
        && row.prediction >= 0 && row.prediction <= 1;
    if (!exactObject(row) || !same(sorted(Object.keys(row)), ["id", valueKey])
      || row.id !== id || !valueValid) {
      fail("EXAMPLE_ROW_INVALID", `${kind}/${index}`);
    }
    ids.push(row.id);
  }
  const testSet = new Set(testIds);
  const overlap = ids.filter((id) => testSet.has(id)).length;
  return { rows, uniqueIds: new Set(ids).size, testIdOverlap: overlap,
    extraIdsBeyondCurrentTest: rows - overlap,
    currentTestIdsMissingFromExample: testIds.filter((id) => !ids.includes(id)).length };
}

function replayJsonCorpus(root) {
  const trainRows = parseJson(readRegular(root,
    "files/benchmark_package/train.json", MAX_FILE_BYTES), "TRAIN_JSON_INVALID");
  const valRows = parseJson(readRegular(root,
    "files/benchmark_package/val.json", MAX_FILE_BYTES), "VAL_JSON_INVALID");
  const testRows = parseJson(readRegular(root,
    "files/benchmark_package/test.json", MAX_FILE_BYTES), "TEST_JSON_INVALID");
  const hiddenRows = parseJson(readRegular(root,
    "files/benchmark_package/test_labels_hidden.json", MAX_FILE_BYTES),
  "HIDDEN_JSON_INVALID");
  const train = splitReplay(trainRows, "train");
  const val = splitReplay(valRows, "val");
  const test = splitReplay(testRows, "test");
  const hidden = validateHidden(hiddenRows, test.ids);
  const allIds = [...train.ids, ...val.ids, ...test.ids];
  if (new Set(allIds).size !== EXPECTED.uniqueBenchmarkIds) {
    fail("CROSS_SPLIT_ID_OVERLAP");
  }
  const totalEdits = train.edits + val.edits + test.edits;
  const totalErrors = train.errors + val.errors + test.errors;
  if (totalEdits !== EXPECTED.editOutcomeValues
    || totalErrors !== EXPECTED.errorEditOutcomes) fail("GLOBAL_EDIT_CENSUS_INVALID");
  const schema = validateSchema(parseJson(readRegular(root,
    "files/benchmark_package/SCHEMA.json", MAX_FILE_BYTES), "SCHEMA_JSON_INVALID"));
  const submission = parseJson(readRegular(root,
    "files/benchmark_package/submission_format.json", MAX_FILE_BYTES),
  "SUBMISSION_FORMAT_INVALID");
  if (!exactObject(submission)
    || !same(sorted(Object.keys(submission)), ["collapse", "resolution", "stopping"])) {
    fail("SUBMISSION_FORMAT_PROFILE_INVALID");
  }
  const examples = {
    collapse: validateExample(parseJson(readRegular(root,
      "files/benchmark_package/example_submissions/example_collapse.json",
      MAX_FILE_BYTES), "EXAMPLE_COLLAPSE_INVALID"), "collapse", test.ids),
    resolution: validateExample(parseJson(readRegular(root,
      "files/benchmark_package/example_submissions/example_resolution.json",
      MAX_FILE_BYTES), "EXAMPLE_RESOLUTION_INVALID"), "resolution", test.ids),
    stopping: validateExample(parseJson(readRegular(root,
      "files/benchmark_package/example_submissions/example_stopping.json",
      MAX_FILE_BYTES), "EXAMPLE_STOPPING_INVALID"), "stopping", test.ids),
  };
  const ecosystemRef = parseJson(readRegular(root,
    "files/benchmark_package/ecosystem.json", MAX_FILE_BYTES),
  "ECOSYSTEM_REF_INVALID");
  const ecosystem = parseJson(readRegular(root,
    "files/data/ecosystem_134_agents.json", MAX_FILE_BYTES),
  "ECOSYSTEM_DATA_INVALID");
  if (!exactObject(ecosystemRef) || ecosystemRef.total_configurations !== 134
    || ecosystemRef.with_results !== 0 || !exactObject(ecosystem)
    || Object.keys(ecosystem).length !== 134
    || Object.values(ecosystem).some((row) => !exactObject(row)
      || !Number.isSafeInteger(row.n_resolved))) fail("ECOSYSTEM_PROFILE_INVALID");
  for (const relative of ["benchmark_package/VERSION.json"]) {
    const value = parseJson(readRegular(root, `files/${relative}`,
      MAX_FILE_BYTES), "SUPPORT_JSON_INVALID");
    if (!exactObject(value)) fail("SUPPORT_JSON_PROFILE_INVALID", relative);
  }
  return {
    train, val, test, hidden, schema, examples,
    totalUniqueIds: allIds.length, totalEdits, totalErrors,
    totalClean: totalEdits - totalErrors,
    scaffoldTotals: countBy([...trainRows, ...valRows, ...testRows]
      .map((row) => row.scaffold)),
    idSetRoot: digest("agent-failure-dynamics/benchmark-id-set/v1", sorted(allIds)),
    sequenceRoot: digest("agent-failure-dynamics/edit-sequences/v1",
      [...trainRows, ...valRows, ...testRows].map((row) =>
        [row.id, row.n_edits, row.edit_outcomes])),
    ecosystem: { referenceTotalConfigurations: ecosystemRef.total_configurations,
      referenceWithResults: ecosystemRef.with_results,
      dataConfigurations: Object.keys(ecosystem).length,
      dataConfigurationsWithResolvedCount: Object.keys(ecosystem).length,
      referenceMatchesDataResultAvailability: false },
  };
}

function replayRepository(root, snapshot) {
  const entries = [];
  let payloadBytes = 0;
  let figureBytes = 0;
  for (const entry of snapshot.tree.files) {
    const relative = `files/${entry.path}`;
    const measured = hashRegular(root, relative, entry.size);
    if (entry.lfs === null && measured.gitBlobOid !== entry.oid) {
      fail("GIT_BLOB_OID_MISMATCH", entry.path);
    }
    if (entry.lfs !== null && measured.sha256 !== `sha256:${entry.lfs.oid}`) {
      fail("LFS_SHA256_MISMATCH", entry.path);
    }
    entries.push({ path: relative, bytes: measured.bytes,
      sha256: measured.sha256, sourcePath: entry.path, sourceOid: entry.oid,
      sourceLfsSha256: entry.lfs === null ? null : `sha256:${entry.lfs.oid}`,
      sourceXetHash: entry.xetHash });
    payloadBytes += measured.bytes;
    if (entry.path.startsWith("figures/")) figureBytes += measured.bytes;
    if (entry.path.endsWith(".png")) {
      const header = readRegular(root, relative, MAX_FILE_BYTES, entry.size).subarray(0, 8);
      if (!header.equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
        fail("PNG_HEADER_INVALID", entry.path);
      }
    }
    if (entry.path.endsWith(".pdf")) {
      const header = readRegular(root, relative, MAX_FILE_BYTES, entry.size).subarray(0, 5);
      if (!header.equals(Buffer.from("%PDF-", "ascii"))) fail("PDF_HEADER_INVALID", entry.path);
    }
  }
  if (payloadBytes !== EXPECTED.treeFileBytes) fail("PAYLOAD_BYTE_CENSUS_INVALID");
  const readme = validateReadme(readRegular(root, "files/README.md",
    MAX_FILE_BYTES), snapshot.tree);
  for (const relative of ["benchmark_package/DATASHEET.md",
    "benchmark_package/PROTOCOL.md", "benchmark_package/REPRODUCIBILITY.md",
    "benchmark_package/evaluate.py"]) {
    const bytes = readRegular(root, `files/${relative}`, MAX_FILE_BYTES);
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { fail("TEXT_SUPPORT_UTF8_INVALID", relative); }
  }
  const corpus = replayJsonCorpus(root);
  return { entries, payloadBytes, figureBytes, readme, corpus };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/agent-failure-dynamics-source-manifest/v1",
    datasetId: AGENT_FAILURE_DYNAMICS_DATASET_ID,
    revision: AGENT_FAILURE_DYNAMICS_REVISION,
    completeRepositoryFiles: 39, completeRepositoryBytes: 4_526_823,
    visibleBenchmarkIds: 5_072,
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
      sha256: agentFailureDynamicsSha256(bytes) });
  }
  const before = inspectAgentFailureDynamicsMetadata(
    metadata.get("dataset-record-before.json"), metadata.get("full-tree-before.json"));
  const after = inspectAgentFailureDynamicsMetadata(
    metadata.get("dataset-record-after.json"), metadata.get("full-tree-after.json"));
  if (!same(before, after)) fail("MATERIAL_FIXED_REVISION_STATE_CHANGED");
  const expectedLayout = sorted([
    ...METADATA_PATHS.map((name) => `metadata/${name}`),
    ...before.tree.files.map((entry) => `files/${entry.path}`),
    ...(withManifest ? ["source-manifest.json"] : []),
  ]);
  if (!same(walk(root), expectedLayout)) fail("SOURCE_LAYOUT_INVALID");
  const replay = replayRepository(root, before);
  return { root, snapshot: before, replay,
    entries: [...metadataEntries, ...replay.entries] };
}

export function createAgentFailureDynamicsSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

export function buildAgentFailureDynamicsArtifactFromSourceDirectory(sourceDirectory) {
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
  const corpus = replay.corpus;
  const publicSplit = (split) => ({ rows: split.rows, scaffolds: split.scaffolds,
    editOutcomeValues: split.edits, errorOutcomes: split.errors,
    cleanOutcomes: split.clean, minEdits: split.min, maxEdits: split.max,
    ...(split.resolvedTrue === undefined ? {} : {
      publisherResolvedTrue: split.resolvedTrue,
      publisherResolvedFalse: split.resolvedFalse }) });
  const reportBody = {
    schema: AGENT_FAILURE_DYNAMICS_SCHEMA,
    disposition: AGENT_FAILURE_DYNAMICS_DISPOSITION,
    source: {
      datasetId: AGENT_FAILURE_DYNAMICS_DATASET_ID,
      revision: AGENT_FAILURE_DYNAMICS_REVISION,
      lastModified: record.lastModified, public: true, gated: false,
      fixedRevisionUsedStorageBytes: record.usedStorageBytes,
      exactRecordSiblingPaths: record.siblingPaths,
      exactRecordSiblingPathRoot: record.siblingPathRoot,
      fullTreeEntries: tree.entries.length, fullTreeFiles: tree.files.length,
      fullTreeDirectories: tree.directories.length,
      fullTreeDeclaredFileBytes: tree.fileBytes,
      fullTreeExtensionCounts: tree.extensionCounts,
      fullTreeLfsFiles: tree.lfsFiles, fullTreeXetFiles: tree.xetFiles,
      fullTreeRoot: tree.root, fullTreeFilePathRoot: tree.filePathRoot,
      completeRecordAndTreeInventoried: true,
      fullRepositoryPayloadAcquired: true,
      fullRepositoryPayloadBytes: replay.payloadBytes,
      materialRecordAndTreeStateStable: true,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
    },
    visibleBenchmark: {
      semanticUnit: "DERIVED_EDIT_OUTCOME_SEQUENCE",
      uniqueBenchmarkIds: corpus.totalUniqueIds,
      splitRows: { train: corpus.train.rows, val: corpus.val.rows,
        test: corpus.test.rows },
      train: publicSplit(corpus.train), val: publicSplit(corpus.val),
      test: publicSplit(corpus.test),
      hiddenTestLabels: corpus.hidden,
      scaffoldTotals: corpus.scaffoldTotals,
      editOutcomeValues: corpus.totalEdits,
      errorEditOutcomes: corpus.totalErrors,
      cleanEditOutcomes: corpus.totalClean,
      actualEditOutcomeJsonType: "boolean",
      benchmarkIdSetRoot: corpus.idSetRoot,
      editOutcomeSequenceRoot: corpus.sequenceRoot,
      idsContiguousWithinEachSplit: true,
      splitIdSetsDisjoint: true,
      testHiddenIdsMatchInOrder: true,
      nEditsEqualsSequenceLengthForAllRows: true,
      allEditOutcomeValuesBoolean: true,
    },
    contracts: {
      schemaVersion: corpus.schema.version,
      declaredTrajectoryFields: corpus.schema.trajectoryFieldCount,
      declaredTaskSchemas: corpus.schema.taskSchemas,
      schemaDeclaresEditOutcomesAsIntegerList: true,
      currentBytesEncodeEditOutcomesAsBooleanList: true,
      declaredAndPhysicalEditOutcomeJsonTypesMatch: false,
      exampleRows: corpus.examples,
      resolutionAndStoppingExamplesMatchCurrentTestDenominator: false,
      ecosystem: corpus.ecosystem,
    },
    repositoryPayload: {
      jsonFilesParsed: 12, markdownFilesUtf8Validated: 4,
      figurePdfFiles: 11, figurePngFiles: 10,
      figureBytes: replay.figureBytes, figureHeadersValidated: true,
      evaluatePyFiles: 1, evaluatePyBytes: 2_555,
      evaluatePyExecutedDuringReplay: false,
      allFilesOidLfsSizeAndSha256Bound: true,
    },
    documentationClaims: {
      publisherGlobalRawTrajectoryClaim: 85_050,
      currentVisibleRawTrajectoryRows: 0,
      currentVisibleDerivedBenchmarkIds: corpus.totalUniqueIds,
      readmeApproxBenchmarkRows: 6_000,
      currentBenchmarkRows: corpus.totalUniqueIds,
      readmeApproxTrainRows: 3_600, currentTrainRows: corpus.train.rows,
      readmeApproxValRows: 1_200, currentValRows: corpus.val.rows,
      readmeApproxTestRows: 1_200, currentTestRows: corpus.test.rows,
      readmeClaimedRawTrajectoriesPresent: replay.readme.rawTrajectoriesClaim,
      rawTrajectoryFilesPresentAtFixedRevision:
        replay.readme.rawTrajectoryFilesPresent,
      readmeClaimsAnalysisDirectory: replay.readme.analysisDirectoryClaim,
      fixedRevisionAnalysisDirectoryPresent:
        replay.readme.claimedAnalysisDirectoryPresent,
      readmeClaimsAllScaffoldsParsedFile:
        replay.readme.allScaffoldsParsedFileClaim,
      fixedRevisionAllScaffoldsParsedFilePresent:
        replay.readme.claimedAllScaffoldsParsedFilePresent,
      visibleBytesVerifyGlobalTrajectoryClaim: false,
      visibleBytesVerifyPublisherCausalFailureClaims: false,
      currentBytesSupersedeNarrativeDenominatorsForThisArtifact: true,
    },
    semantics: {
      visibleRowsAreRawAgentTrajectories: false,
      visibleRowsAreProcessLevelDerivedSequences: true,
      editOutcomeIsIndependentCausalFailureTruth: false,
      resolvedIsPublisherDerivedLabel: true,
      publisherGlobalClaimsIndependentlyReproduced: false,
      publisherCausalClaimsIndependentlyEstablished: false,
      sequenceRowsAreRetryOrRecoveryEpisodes: false,
      longitudinalOutcomeEstablished: false,
    },
    denominators: {
      FIXED_REVISION_FILES: tree.files.length,
      FIXED_REVISION_BYTES: tree.fileBytes,
      VISIBLE_UNIQUE_BENCHMARK_IDS: corpus.totalUniqueIds,
      TRAIN_ROWS: corpus.train.rows, VAL_ROWS: corpus.val.rows,
      TEST_ROWS: corpus.test.rows, HIDDEN_TEST_LABEL_ROWS: corpus.hidden.rows,
      EDIT_OUTCOME_VALUES: corpus.totalEdits,
      README_GLOBAL_TRAJECTORY_CLAIM: 85_050,
      narrativeAndVisibleByteDenominatorsMustNotBeMerged: true,
    },
    outcome: {
      publisherResolvedLabelRows: corpus.totalUniqueIds,
      publisherEditOutcomeSequenceRows: corpus.totalUniqueIds,
      publisherLabelsIndependentlyRerun: false,
      independentOutcomeRows: 0, realWorldOutcomeRows: 0,
      recoveryEpisodeRows: 0,
    },
    rights: {
      datasetCardLicenseClaim: "CC-BY-4.0",
      datasetApiLicenseTagPresent: true,
      datasetLicenseFilePresent: false,
      readmeCodeMitClaimPresent: replay.readme.codeMitClaim,
      readmeParsedDataCcByClaimPresent: replay.readme.parsedDataCcByClaim,
      upstreamSourceRightsEstablishedByCurrentBytes: false,
      useSpecificTrainingAuthorizationEstablished: false,
      rightsDisposition: "FAIL_CLOSED",
      legalConclusionEstablished: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      publisherNoPersonalDataClaimPresent: replay.readme.noPersonalDataClaim,
      rawSourcePrivate: true, noPiiGuaranteed: false,
      rawIdsSequencesLabelsFiguresOrCodeProjected: false,
      rawProjectionRows: 0,
    },
    use: {
      readmeProductionAgentTrainingOutOfScope:
        replay.readme.productionTrainingOutOfScope,
      offlineTrainingRows: 0, productionTrainingRows: 0,
      networkAdmissionRows: 0, authorityRows: 0, ceuRows: 0,
      autonomousActionAuthorized: false,
    },
    boundary: {
      derivedEditOutcomeSequenceRows: corpus.totalUniqueIds,
      publisherResolvedLabelRows: corpus.totalUniqueIds,
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

export function createAgentFailureDynamicsReceipt(report, reportBytes,
  manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: AGENT_FAILURE_DYNAMICS_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: agentFailureDynamicsSha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: agentFailureDynamicsSha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: AGENT_FAILURE_DYNAMICS_DISPOSITION,
    completeRepositoryFiles: 39, completeRepositoryBytes: 4_526_823,
    visibleDerivedSequenceRows: 5_072, visibleRawTrajectoryRows: 0,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    authorizedTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyAgentFailureDynamicsArtifactDirectory(directory) {
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
    const built = buildAgentFailureDynamicsArtifactFromSourceDirectory(
      checkedPath(root, "source"));
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createAgentFailureDynamicsReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      verificationLevel: "FULL_REPOSITORY_SOURCE_REDERIVED" });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeAgentFailureDynamicsArtifact(value) {
  return serialize(value);
}
