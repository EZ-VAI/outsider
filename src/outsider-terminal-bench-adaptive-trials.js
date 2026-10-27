/*
 * Source-bound replay of one complete five-trial Terminal-Bench 2 task group.
 *
 * The selected group contains four publisher-harness failures and one success
 * for the same task, agent, model, and run configuration. Raw prompts,
 * responses, terminal recordings, pane contents, debug payloads, trajectories,
 * and verifier output remain private. Nothing from the source tree is executed.
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
const ObjectEntries = Object.entries;
const ObjectValues = Object.values;
const PathRelative = path.relative;
const PathResolve = path.resolve;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const TERMINAL_BENCH_ADAPTIVE_TRIALS_SCHEMA =
  "outsider/terminal-bench-adaptive-trials/v1";
export const TERMINAL_BENCH_ADAPTIVE_TRIALS_RECEIPT_SCHEMA =
  "outsider/terminal-bench-adaptive-trials-receipt/v1";
export const TERMINAL_BENCH_LEADERBOARD_DATASET_ID =
  "harborframework/terminal-bench-2-leaderboard";
export const TERMINAL_BENCH_LEADERBOARD_REVISION =
  "572b2614be2c0cb2527e14f5b1e4026f1072e6c1";
export const TERMINAL_BENCH_TASK_REPOSITORY =
  "harbor-framework/terminal-bench-2";
export const TERMINAL_BENCH_TASK_RECORDED_GIT_URL =
  "https://github.com/laude-institute/terminal-bench-2.git";
export const TERMINAL_BENCH_TASK_COMMIT =
  "69671fbaac6d67a7ef0dfec016cc38a64ef7a77c";
export const TERMINAL_BENCH_TASK_ROOT_TREE =
  "03e5d294753cbd4a6b9b25b6ae8479a8692a1675";
export const TERMINAL_BENCH_SELECTED_TASK_TREE =
  "e27a8bafe51e4a227cc1bbffab99601544bc5bee";
export const TERMINAL_BENCH_SELECTED_TASK = "adaptive-rejection-sampler";
export const TERMINAL_BENCH_ADAPTIVE_TRIALS_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const SUBMISSION = "Terminus2__DeepSeek-V3.2";
const RUN = "2026-02-07__07-47-43";
const BASE = `submissions/terminal-bench/2.0/${SUBMISSION}`;
const RUN_BASE = `${BASE}/${RUN}`;
const TRIALS = Object.freeze([
  Object.freeze({ id: "j2dYmiT", reward: 0,
    oid: "b066bbcf00f7d6da314f453f39805187dcd60141",
    entries: 109, files: 82, directories: 27, bytes: 7_856_231 }),
  Object.freeze({ id: "psAuVJK", reward: 0,
    oid: "88c4a250c3629dfc1759839feb6dc59d3d2f4563",
    entries: 78, files: 59, directories: 19, bytes: 4_310_784 }),
  Object.freeze({ id: "qdhwC4A", reward: 0,
    oid: "046aa100c7d65d5a94225caaf5b134a562410766",
    entries: 57, files: 43, directories: 14, bytes: 2_726_926 }),
  Object.freeze({ id: "vKShZVu", reward: 0,
    oid: "d33ac8d00490415972366d57484dc8b574d65c8c",
    entries: 70, files: 53, directories: 17, bytes: 3_992_164 }),
  Object.freeze({ id: "wEPyjMJ", reward: 1,
    oid: "e17c252b8991835e78df1350159fb18a66a8105c",
    entries: 131, files: 99, directories: 32, bytes: 7_692_987 }),
]);

const REPORT_DOMAIN = "outsider/terminal-bench-adaptive-trials-report/v1";
const RECEIPT_DOMAIN = "outsider/terminal-bench-adaptive-trials-receipt/v1";
const MANIFEST_DOMAIN =
  "outsider/terminal-bench-adaptive-trials-source-manifest/v1";
const SOURCE_ROOT_DOMAIN =
  "outsider/terminal-bench-adaptive-trials-source-root/v1";
const SHAPE_ROOT_DOMAIN =
  "outsider/terminal-bench-adaptive-trials-shape-root/v1";
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 16 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const GIT_OID = /^[a-f0-9]{40}$/u;

const METADATA_PINS = Object.freeze({
  "leaderboard-record":
    "sha256:bfe567eb99299898c169c02662772baf805aa0ed23001b5189e6e846e928f575",
  "leaderboard-root-tree":
    "sha256:dfd22a380dfaea52588d4604c9e8e10cc0b2f0b15c6cc391a773d3faf97e8860",
  "leaderboard-submissions-tree":
    "sha256:ca392f69d9cee19866a562dae6da0b85f08d9e27cda043638c0efb761166d131",
  "leaderboard-terminal-tree":
    "sha256:dddaa31310c3fe5f4d11cd1feb54034336f5e5551f851ff31841d776c578d677",
  "leaderboard-v2-tree":
    "sha256:ad100871ab4e586da9c34ee192c316d3be3d05d04e3f4aea366f9217547a2a86",
  "leaderboard-submission-tree":
    "sha256:a860b3fe6c768a968702254669a5df4e342d65c564615ea36f481bcb5f79aa5f",
  "leaderboard-run-tree":
    "sha256:dac41ad02628c00a8d827573a38fb158d9692e6f92b4712ebd414cb9c7ac3121",
  "leaderboard-trial-j2dYmiT-tree":
    "sha256:1c9b631c91b4a17739e12d8e54c6bb49ddb6803a15e2a63516bca3ff62f0b434",
  "leaderboard-trial-psAuVJK-tree":
    "sha256:e13e7becdc815c3dbb3f2f497f92a001501fe66bb7e53f2ea35150abe29cc900",
  "leaderboard-trial-qdhwC4A-tree":
    "sha256:ec4bb957b90bca298938ccf0628f34a0f398f49495817065f631eeb34cefc018",
  "leaderboard-trial-vKShZVu-tree":
    "sha256:60d0aa2aab59d8fda0df921c72b86483ed00df3b3271988f16da248a8f2b76b1",
  "leaderboard-trial-wEPyjMJ-tree":
    "sha256:d4635e81a43dfddb7bc3501013454fc2a7b67b09598a5aaedcf161fae8d0a586",
  "task-commit":
    "sha256:899cb3d7f5d416b16d8e11f533d216ab1e13eaf794496c631bf28c14e1aa26ec",
  "task-root-tree":
    "sha256:e893d3b4f310884e758d85e443356e40c6bf7902d7f795cce3a2469cedca9c7b",
  "task-selected-tree":
    "sha256:b7e602510953bcc1298a7d7b408a6c3bbd2f7e3973905af901c3d77f3dfe1dc4",
});

const METADATA_BASES = Object.freeze(Object.keys(METADATA_PINS).sort());

function fail(code, detail = null) {
  throw new Error(detail === null ? `TERMINAL_BENCH_ADAPTIVE_TRIALS_${code}`
    : `TERMINAL_BENCH_ADAPTIVE_TRIALS_${code}:${detail}`);
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

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of ObjectValues(value)) deepFreeze(child);
  return Object.freeze(value);
}

function parseJson(bytes, code) {
  try { return JSONParse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(code); }
}

function checkedPath(root, relative) {
  if (typeof relative !== "string" || relative.length === 0
    || relative.includes("\0")) fail("PATH_INVALID");
  const base = PathResolve(root);
  const target = PathResolve(base, relative);
  const relation = PathRelative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_INVALID", relative);
  return target;
}

function readRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600 || link.size < 1n
    || link.size > BigInt(maximumBytes)
    || exactBytes !== null && link.size !== BigInt(exactBytes)) {
    fail("FILE_UNSAFE", relative);
  }
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== after.size) fail("FILE_CHANGED_DURING_READ", relative);
    return bytes;
  } finally { closeSync(descriptor); }
}

function walk(root, prefix = "") {
  const directory = prefix === "" ? root : checkedPath(root, prefix);
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

function metadataNames() {
  return METADATA_BASES.flatMap((base) => [
    `${base}-after.json`, `${base}-before.json`,
  ]).sort();
}

function readMetadata(root) {
  const result = new Map();
  for (const base of METADATA_BASES) {
    for (const phase of ["before", "after"]) {
      const name = `${base}-${phase}.json`;
      const bytes = readRegular(root, `metadata/${name}`, MAX_METADATA_BYTES);
      if (sha256(bytes) !== METADATA_PINS[base]) fail("METADATA_PIN_MISMATCH", name);
      result.set(name, bytes);
    }
  }
  for (const base of METADATA_BASES) {
    if (!result.get(`${base}-before.json`).equals(result.get(`${base}-after.json`))) {
      fail("MATERIAL_METADATA_CHANGED", base);
    }
  }
  return result;
}

function hfEntries(bytes, code) {
  const value = parseJson(bytes, code);
  if (!Array.isArray(value)) fail(code);
  return value.map((entry) => {
    if (!entry || typeof entry.path !== "string"
      || !["file", "directory"].includes(entry.type)
      || !Number.isSafeInteger(entry.size) || entry.size < 0
      || !GIT_OID.test(entry.oid ?? "")) fail(code);
    return {
      path: entry.path, type: entry.type, size: entry.size, oid: entry.oid,
      lfsOid: entry.lfs?.oid ?? null, lfsSize: entry.lfs?.size ?? null,
      xetHash: entry.xetHash ?? null,
    };
  }).sort((left, right) => left.path < right.path ? -1 : 1);
}

function githubTree(bytes, expectedSha, code) {
  const value = parseJson(bytes, code);
  if (value?.sha !== expectedSha || value?.truncated !== false
    || !Array.isArray(value.tree)) fail(code);
  const entries = value.tree.map((entry) => {
    if (!entry || typeof entry.path !== "string"
      || !["blob", "tree"].includes(entry.type)
      || !GIT_OID.test(entry.sha ?? "")
      || entry.type === "blob" && (!Number.isSafeInteger(entry.size) || entry.size < 1)) {
      fail(code);
    }
    return { path: entry.path, type: entry.type, mode: entry.mode,
      size: entry.size ?? 0, oid: entry.sha };
  }).sort((left, right) => left.path < right.path ? -1 : 1);
  return entries;
}

function one(entries, predicate, code) {
  const values = entries.filter(predicate);
  if (values.length !== 1) fail(code);
  return values[0];
}

function fixedPlan(metadata) {
  const leaderRecord = parseJson(metadata.get("leaderboard-record-before.json"),
    "LEADERBOARD_RECORD_INVALID");
  const recordProjection = {
    id: leaderRecord.id, author: leaderRecord.author, sha: leaderRecord.sha,
    lastModified: leaderRecord.lastModified, private: leaderRecord.private,
    gated: leaderRecord.gated, disabled: leaderRecord.disabled,
    usedStorage: leaderRecord.usedStorage, license: leaderRecord.cardData?.license,
  };
  if (!same(recordProjection, {
    id: TERMINAL_BENCH_LEADERBOARD_DATASET_ID, author: "harborframework",
    sha: TERMINAL_BENCH_LEADERBOARD_REVISION,
    lastModified: "2026-05-15T21:18:55.000Z", private: false,
    gated: false, disabled: false, usedStorage: 121_593_795_082,
    license: "apache-2.0",
  })) fail("LEADERBOARD_RECORD_PROFILE_INVALID");

  const root = hfEntries(metadata.get("leaderboard-root-tree-before.json"),
    "LEADERBOARD_ROOT_TREE_INVALID");
  const submissions = hfEntries(
    metadata.get("leaderboard-submissions-tree-before.json"),
    "LEADERBOARD_SUBMISSIONS_TREE_INVALID");
  const terminal = hfEntries(metadata.get("leaderboard-terminal-tree-before.json"),
    "LEADERBOARD_TERMINAL_TREE_INVALID");
  const v2 = hfEntries(metadata.get("leaderboard-v2-tree-before.json"),
    "LEADERBOARD_V2_TREE_INVALID");
  const submission = hfEntries(
    metadata.get("leaderboard-submission-tree-before.json"),
    "LEADERBOARD_SUBMISSION_TREE_INVALID");
  const run = hfEntries(metadata.get("leaderboard-run-tree-before.json"),
    "LEADERBOARD_RUN_TREE_INVALID");

  if (root.length !== 4
    || one(root, (entry) => entry.path === "submissions", "ROOT_CHAIN_INVALID").oid
      !== "d6d2b0ad705a50d5cf20bb265105151a6826f82c"
    || submissions.length !== 1 || submissions[0].oid
      !== "306dab47b144f4d46b6dd038f8566806a19e0d6c"
    || terminal.length !== 2
    || one(terminal, (entry) => entry.path.endsWith("/2.0"),
      "ROOT_CHAIN_INVALID").oid !== "8f0d2d9fd30acae4ca7dfe7c1bc2569ddee92c67"
    || v2.length !== 76 || v2.filter((entry) => entry.type === "directory").length !== 75
    || one(v2, (entry) => entry.path === `${BASE}`, "SUBMISSION_CHAIN_INVALID").oid
      !== "1d0fe9ddd197bfa179dbac6f5b0cb9473bbea6dc"
    || submission.length !== 2
    || one(submission, (entry) => entry.path === RUN_BASE,
      "RUN_CHAIN_INVALID").oid !== "bbe15acbbd5ccfd7261dcbf54c6cf54a2bd2bb85"
    || run.length !== 447 || run.filter((entry) => entry.type === "directory").length !== 445
    || run.filter((entry) => entry.type === "file").length !== 2) {
    fail("LEADERBOARD_TREE_PROFILE_INVALID");
  }

  const leaderFiles = [];
  leaderFiles.push(one(root, (entry) => entry.path === "README.md",
    "ROOT_README_MISSING"));
  leaderFiles.push(one(submission, (entry) => entry.path === `${BASE}/metadata.yaml`,
    "SUBMISSION_METADATA_MISSING"));
  leaderFiles.push(one(run, (entry) => entry.path === `${RUN_BASE}/config.json`,
    "RUN_CONFIG_MISSING"));
  leaderFiles.push(one(run, (entry) => entry.path === `${RUN_BASE}/result.json`,
    "RUN_RESULT_MISSING"));

  const trialTrees = new Map();
  for (const trial of TRIALS) {
    const directory = one(run,
      (entry) => entry.path === `${RUN_BASE}/${TERMINAL_BENCH_SELECTED_TASK}__${trial.id}`,
      "TRIAL_DIRECTORY_MISSING");
    if (directory.oid !== trial.oid) fail("TRIAL_DIRECTORY_OID_INVALID", trial.id);
    const entries = hfEntries(metadata.get(
      `leaderboard-trial-${trial.id}-tree-before.json`), "TRIAL_TREE_INVALID");
    const files = entries.filter((entry) => entry.type === "file");
    const directories = entries.filter((entry) => entry.type === "directory");
    if (entries.length !== trial.entries || files.length !== trial.files
      || directories.length !== trial.directories
      || files.reduce((sum, entry) => sum + entry.size, 0) !== trial.bytes) {
      fail("TRIAL_TREE_PROFILE_INVALID", trial.id);
    }
    const prefix = `${RUN_BASE}/${TERMINAL_BENCH_SELECTED_TASK}__${trial.id}/`;
    if (files.some((entry) => !entry.path.startsWith(prefix))) {
      fail("TRIAL_PATH_INVALID", trial.id);
    }
    leaderFiles.push(...files);
    trialTrees.set(trial.id, entries);
  }
  if (run.filter((entry) => entry.path.startsWith(
    `${RUN_BASE}/${TERMINAL_BENCH_SELECTED_TASK}__`)).length !== 5) {
    fail("SELECTED_TASK_TRIAL_CENSUS_INVALID");
  }

  const commit = parseJson(metadata.get("task-commit-before.json"),
    "TASK_COMMIT_INVALID");
  if (commit?.sha !== TERMINAL_BENCH_TASK_COMMIT
    || commit?.tree?.sha !== TERMINAL_BENCH_TASK_ROOT_TREE
    || commit?.verification?.verified !== false) fail("TASK_COMMIT_PROFILE_INVALID");
  const taskRoot = githubTree(metadata.get("task-root-tree-before.json"),
    TERMINAL_BENCH_TASK_ROOT_TREE, "TASK_ROOT_TREE_INVALID");
  const taskDirectory = one(taskRoot,
    (entry) => entry.path === TERMINAL_BENCH_SELECTED_TASK && entry.type === "tree",
    "TASK_DIRECTORY_INVALID");
  if (taskDirectory.oid !== TERMINAL_BENCH_SELECTED_TASK_TREE) {
    fail("TASK_DIRECTORY_OID_INVALID");
  }
  const taskTree = githubTree(metadata.get("task-selected-tree-before.json"),
    TERMINAL_BENCH_SELECTED_TASK_TREE, "TASK_SELECTED_TREE_INVALID");
  const taskFiles = taskTree.filter((entry) => entry.type === "blob");
  if (taskTree.length !== 10 || taskFiles.length !== 7
    || taskFiles.reduce((sum, entry) => sum + entry.size, 0) !== 34_255) {
    fail("TASK_TREE_PROFILE_INVALID");
  }

  const plan = [
    ...leaderFiles.map((entry) => ({ namespace: "leaderboard",
      repoPath: entry.path, localPath: `files/leaderboard/${entry.path}`,
      size: entry.size, oid: entry.oid, lfsOid: entry.lfsOid })),
    ...taskFiles.map((entry) => ({ namespace: "task",
      repoPath: `${TERMINAL_BENCH_SELECTED_TASK}/${entry.path}`,
      localPath: `files/task/${TERMINAL_BENCH_SELECTED_TASK}/${entry.path}`,
      size: entry.size, oid: entry.oid, lfsOid: null })),
  ].sort((left, right) => left.localPath < right.localPath ? -1 : 1);
  if (plan.length !== 347 || new Set(plan.map((item) => item.localPath)).size !== 347
    || plan.reduce((sum, item) => sum + item.size, 0) !== 26_650_574) {
    fail("SOURCE_PLAN_PROFILE_INVALID");
  }
  return { record: recordProjection, root, submissions, terminal, v2,
    submission, run, trialTrees, commit, taskRoot, taskTree, plan };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/terminal-bench-adaptive-trials-source-manifest/v1",
    leaderboardDatasetId: TERMINAL_BENCH_LEADERBOARD_DATASET_ID,
    leaderboardRevision: TERMINAL_BENCH_LEADERBOARD_REVISION,
    taskRepository: TERMINAL_BENCH_TASK_REPOSITORY,
    taskCommit: TERMINAL_BENCH_TASK_COMMIT,
    selectedSubmission: SUBMISSION, selectedRun: RUN,
    selectedTask: TERMINAL_BENCH_SELECTED_TASK,
    entries: ordered, sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const metadataExpected = metadataNames().map((name) => `metadata/${name}`);
  const metadata = readMetadata(root);
  const fixed = fixedPlan(metadata);
  const expected = [
    ...metadataExpected, ...fixed.plan.map((item) => item.localPath),
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  const entries = [];
  for (const name of metadataNames()) {
    const bytes = metadata.get(name);
    entries.push({ path: `metadata/${name}`, bytes: bytes.length, sha256: sha256(bytes) });
  }
  for (const item of fixed.plan) {
    const bytes = readRegular(root, item.localPath,
      Math.max(MAX_SOURCE_FILE_BYTES, item.size), item.size);
    const actualSha = sha256(bytes);
    if (item.lfsOid !== null) {
      if (actualSha !== `sha256:${item.lfsOid}`) fail("LFS_PIN_MISMATCH", item.repoPath);
    } else if (gitBlobOid(bytes) !== item.oid) {
      fail("GIT_BLOB_PIN_MISMATCH", item.repoPath);
    }
    entries.push({ path: item.localPath, bytes: bytes.length, sha256: actualSha,
      gitOid: item.oid, lfsSha256: item.lfsOid === null ? null : `sha256:${item.lfsOid}` });
  }
  return { root, fixed, entries };
}

export function createTerminalBenchAdaptiveTrialsSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

function leaderboardPath(root, repoPath) {
  return `files/leaderboard/${repoPath}`;
}

function trialBase(trial) {
  return `${RUN_BASE}/${TERMINAL_BENCH_SELECTED_TASK}__${trial.id}`;
}

function parseCast(bytes, trialId) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail("CAST_UTF8_INVALID", trialId); }
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.length < 2) fail("CAST_EMPTY", trialId);
  const header = parseJson(BufferFrom(lines[0], "utf8"), "CAST_HEADER_INVALID");
  if (!header || typeof header !== "object" || header.version !== 2) {
    fail("CAST_HEADER_PROFILE_INVALID", trialId);
  }
  let previous = -Infinity;
  const types = {};
  for (const line of lines.slice(1)) {
    const event = parseJson(BufferFrom(line, "utf8"), "CAST_EVENT_INVALID");
    if (!Array.isArray(event) || event.length !== 3
      || !Number.isFinite(event[0]) || event[0] < previous
      || typeof event[1] !== "string" || typeof event[2] !== "string") {
      fail("CAST_EVENT_PROFILE_INVALID", trialId);
    }
    previous = event[0];
    types[event[1]] = (types[event[1]] ?? 0) + 1;
  }
  return { events: lines.length - 1, durationSeconds: previous,
    eventTypes: Object.fromEntries(ObjectEntries(types).sort()) };
}

function replaySelectedTrials(collected) {
  const root = collected.root;
  const runConfig = parseJson(readRegular(root,
    leaderboardPath(root, `${RUN_BASE}/config.json`), MAX_SOURCE_FILE_BYTES),
  "RUN_CONFIG_JSON_INVALID");
  const runResult = parseJson(readRegular(root,
    leaderboardPath(root, `${RUN_BASE}/result.json`), MAX_SOURCE_FILE_BYTES),
  "RUN_RESULT_JSON_INVALID");
  if (runConfig?.n_attempts !== 5 || runResult?.n_total_trials !== 445
    || runResult?.stats?.n_trials !== 445 || runResult?.stats?.n_errors !== 91) {
    fail("RUN_PROFILE_INVALID");
  }
  const evalValue = ObjectValues(runResult.stats?.evals ?? {})[0];
  const rewardStats = evalValue?.reward_stats?.reward;
  if (!rewardStats || typeof rewardStats !== "object") fail("RUN_REWARD_STATS_INVALID");

  let episodeDirectories = 0;
  let completeEpisodeTriplets = 0;
  let partialPromptOnlyEpisodes = 0;
  let promptFiles = 0;
  let responseFiles = 0;
  let debugFiles = 0;
  let promptBytes = 0;
  let responseBytes = 0;
  let debugBytes = 0;
  let trajectorySteps = 0;
  let castEvents = 0;
  let verifierTests = 0;
  let verifierPassed = 0;
  let verifierFailed = 0;
  let inputTokens = 0;
  let cacheTokens = 0;
  let outputTokens = 0;
  let declaredAgentEpisodes = 0;
  const exceptionTypes = {};
  const perTrial = [];

  for (const trial of TRIALS) {
    const base = trialBase(trial);
    const entries = collected.fixed.trialTrees.get(trial.id);
    const files = entries.filter((entry) => entry.type === "file");
    const local = (suffix) => leaderboardPath(root, `${base}/${suffix}`);
    const config = parseJson(readRegular(root, local("config.json"),
      MAX_SOURCE_FILE_BYTES), "TRIAL_CONFIG_INVALID");
    const result = parseJson(readRegular(root, local("result.json"),
      MAX_SOURCE_FILE_BYTES), "TRIAL_RESULT_INVALID");
    const trajectory = parseJson(readRegular(root, local("agent/trajectory.json"),
      MAX_SOURCE_FILE_BYTES), "TRAJECTORY_INVALID");
    const ctrf = parseJson(readRegular(root, local("verifier/ctrf.json"),
      MAX_SOURCE_FILE_BYTES), "CTRF_INVALID");
    const rewardText = new TextDecoder("utf-8", { fatal: true }).decode(
      readRegular(root, local("verifier/reward.txt"), 32)).trim();
    const reward = Number(rewardText);
    const expectedTrialName = `${TERMINAL_BENCH_SELECTED_TASK}__${trial.id}`;
    if (config?.trial_name !== expectedTrialName
      || config?.task?.path !== TERMINAL_BENCH_SELECTED_TASK
      || config?.task?.git_url !== TERMINAL_BENCH_TASK_RECORDED_GIT_URL
      || config?.task?.git_commit_id !== TERMINAL_BENCH_TASK_COMMIT
      || result?.task_name !== TERMINAL_BENCH_SELECTED_TASK
      || result?.trial_name !== expectedTrialName
      || result?.task_id?.git_url !== TERMINAL_BENCH_TASK_RECORDED_GIT_URL
      || result?.task_id?.git_commit_id !== TERMINAL_BENCH_TASK_COMMIT
      || result?.task_id?.path !== TERMINAL_BENCH_SELECTED_TASK
      || result?.task_checksum !==
        "4fde6e809c475b000ae3ea4135f906ffe4775bccae7dafd0b123f4ecc9fcf697"
      || result?.verifier_result?.rewards?.reward !== trial.reward
      || reward !== trial.reward
      || trajectory?.schema_version !== "ATIF-v1.5"
      || !Array.isArray(trajectory.steps) || trajectory.steps.length < 1
      || ctrf?.results?.summary?.tests !== 9
      || !Array.isArray(ctrf?.results?.tests)
      || ctrf.results.tests.length !== 9) fail("TRIAL_PROFILE_INVALID", trial.id);

    const listedInRun = ObjectEntries(rewardStats).some(([key, ids]) =>
      Number(key) === trial.reward && Array.isArray(ids)
        && ids.includes(expectedTrialName));
    if (!listedInRun) fail("RUN_TRIAL_OUTCOME_BINDING_INVALID", trial.id);

    const episodeMap = new Map();
    for (const entry of files) {
      const suffix = entry.path.slice(base.length + 1);
      const match = /^agent\/episode-(\d+)\/(debug\.json|prompt\.txt|response\.txt)$/u
        .exec(suffix);
      if (!match) continue;
      const index = Number(match[1]);
      const name = match[2];
      if (!episodeMap.has(index)) episodeMap.set(index, new Set());
      episodeMap.get(index).add(name);
      const bytes = readRegular(root, local(suffix), MAX_SOURCE_FILE_BYTES, entry.size);
      if (name === "debug.json") {
        const value = parseJson(bytes, "DEBUG_JSON_INVALID");
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          fail("DEBUG_JSON_PROFILE_INVALID", trial.id);
        }
        debugFiles += 1; debugBytes += bytes.length;
      } else if (name === "prompt.txt") {
        promptFiles += 1; promptBytes += bytes.length;
      } else { responseFiles += 1; responseBytes += bytes.length; }
    }
    const indices = [...episodeMap.keys()].sort((left, right) => left - right);
    if (!same(indices, Array.from({ length: indices.length }, (_, index) => index))) {
      fail("EPISODE_INDEX_GAP", trial.id);
    }
    let complete = 0;
    let partial = 0;
    for (const names of episodeMap.values()) {
      if (same(sorted(names), ["debug.json", "prompt.txt", "response.txt"])) complete += 1;
      else if (same(sorted(names), ["prompt.txt"])) partial += 1;
      else fail("EPISODE_FILE_SET_INVALID", trial.id);
    }

    const cast = parseCast(readRegular(root, local("agent/recording.cast"),
      MAX_SOURCE_FILE_BYTES), trial.id);
    const pane = readRegular(root, local("agent/terminus_2.pane"),
      MAX_SOURCE_FILE_BYTES);
    const summary = ctrf.results.summary;
    if (summary.passed + summary.failed + summary.skipped
      + summary.pending + summary.other !== summary.tests
      || trial.reward === 1 && summary.failed !== 0
      || trial.reward === 0 && summary.failed < 1) {
      fail("VERIFIER_SUMMARY_INVALID", trial.id);
    }
    const exceptionType = result?.exception_info?.exception_type ?? null;
    if (exceptionType !== null) {
      exceptionTypes[exceptionType] = (exceptionTypes[exceptionType] ?? 0) + 1;
    }
    const shape = {
      trialIdHash: sha256(BufferFrom(trial.id, "utf8")), reward,
      files: files.length, bytes: files.reduce((sum, entry) => sum + entry.size, 0),
      episodeDirectories: indices.length, completeEpisodeTriplets: complete,
      promptOnlyPartialEpisodes: partial, trajectorySteps: trajectory.steps.length,
      castEvents: cast.events, castEventTypes: cast.eventTypes,
      paneBytes: pane.length, verifierTests: summary.tests,
      verifierPassed: summary.passed, verifierFailed: summary.failed,
      exceptionType, inputTokens: result.agent_result?.n_input_tokens,
      cacheTokens: result.agent_result?.n_cache_tokens,
      outputTokens: result.agent_result?.n_output_tokens,
      declaredAgentEpisodes: result.agent_result?.metadata?.n_episodes,
    };
    for (const value of [shape.inputTokens, shape.cacheTokens, shape.outputTokens,
      shape.declaredAgentEpisodes]) {
      if (!Number.isSafeInteger(value) || value < 0) fail("TOKEN_PROFILE_INVALID", trial.id);
    }
    perTrial.push(shape);
    episodeDirectories += indices.length;
    completeEpisodeTriplets += complete;
    partialPromptOnlyEpisodes += partial;
    trajectorySteps += trajectory.steps.length;
    castEvents += cast.events;
    verifierTests += summary.tests;
    verifierPassed += summary.passed;
    verifierFailed += summary.failed;
    inputTokens += shape.inputTokens;
    cacheTokens += shape.cacheTokens;
    outputTokens += shape.outputTokens;
    declaredAgentEpisodes += shape.declaredAgentEpisodes;
  }

  const successes = perTrial.filter((trial) => trial.reward === 1).length;
  const failures = perTrial.length - successes;
  if (successes !== 1 || failures !== 4 || perTrial.length !== 5) {
    fail("SELECTED_OUTCOME_PROFILE_INVALID");
  }
  return deepFreeze({
    selectedTask: TERMINAL_BENCH_SELECTED_TASK,
    completeFreshTrialGroupWithinSelectedRun: true,
    selectedTrials: 5, publisherHarnessSuccesses: successes,
    publisherHarnessFailures: failures,
    episodeDirectories, completeEpisodeTriplets, partialPromptOnlyEpisodes,
    promptFiles, responseFiles, debugFiles,
    promptBytes, responseBytes, debugBytes,
    trajectorySteps, asciinemaCastEvents: castEvents,
    verifierTests, verifierPassed, verifierFailed,
    inputTokens, cacheTokens, outputTokens, declaredAgentEpisodes,
    exceptionTypes: Object.fromEntries(ObjectEntries(exceptionTypes).sort()),
    perTrialShapeRoot: digest(SHAPE_ROOT_DOMAIN, perTrial),
    rawPromptResponseDebugTrajectoryCastPaneAndVerifierTextProjected: false,
  });
}

export function buildTerminalBenchAdaptiveTrialsArtifactFromSourceDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const stored = readRegular(collected.root, "source-manifest.json", MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = replaySelectedTrials(collected);
  const reportBody = {
    schema: TERMINAL_BENCH_ADAPTIVE_TRIALS_SCHEMA,
    disposition: TERMINAL_BENCH_ADAPTIVE_TRIALS_DISPOSITION,
    source: {
      leaderboardDatasetId: TERMINAL_BENCH_LEADERBOARD_DATASET_ID,
      leaderboardRevision: TERMINAL_BENCH_LEADERBOARD_REVISION,
      leaderboardLastModified: collected.fixed.record.lastModified,
      public: true, gated: false,
      fullLeaderboardFixedRevisionUsedStorageBytes: 121_593_795_082,
      leaderboardSubmissionDirectoriesInventoried: 75,
      selectedSubmission: SUBMISSION, selectedRun: RUN,
      selectedRunTrialsInventoried: 445,
      selectedTaskTrialDirectoriesInventoried: 5,
      selectedTrialFiles: 336, selectedTrialBytes: 26_579_092,
      acquiredSourceFiles: collected.fixed.plan.length,
      acquiredSourceBytes: collected.fixed.plan.reduce((sum, item) => sum + item.size, 0),
      taskRecordedGitUrl: TERMINAL_BENCH_TASK_RECORDED_GIT_URL,
      taskResolvedRepository: TERMINAL_BENCH_TASK_REPOSITORY,
      taskCommit: TERMINAL_BENCH_TASK_COMMIT,
      taskCommitSigned: false, taskRootTree: TERMINAL_BENCH_TASK_ROOT_TREE,
      selectedTaskTree: TERMINAL_BENCH_SELECTED_TASK_TREE,
      selectedTaskFiles: 7, selectedTaskBytes: 34_255,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
      fixedRevisionMetadataBeforeAfterExact: true,
      completeLeaderboardPayloadAcquired: false,
      completeSelectedTaskTrialGroupAcquired: true,
    },
    replay,
    selection: {
      selectedBecauseCompleteSameTaskMixedOutcomeFiveTrialGroup: true,
      taskAgentModelAndRunConfigurationHeldConstant: true,
      selectedTaskOpportunityCensusWithinRunComplete: true,
      freshTrialAttemptsConfigured: 5, freshTrialAttemptsObserved: 5,
      selectedRunAllTasksAcquired: false, wholeSubmissionAcquired: false,
      wholeLeaderboardAcquired: false, representativenessEstablished: false,
      declaredSelectedGroupScopeExhausted: true,
      globalSourceUniverseExhausted: false,
    },
    denominators: {
      SOFTWARE_BENCHMARK_FRESH_TRIAL: 5,
      AGENT_EPISODE_DIRECTORY_WITHIN_SELECTED_TRIALS: replay.episodeDirectories,
      AGENT_TRAJECTORY_STEP_WITHIN_SELECTED_TRIALS: replay.trajectorySteps,
      VERIFIER_TEST_WITHIN_SELECTED_TRIALS: replay.verifierTests,
      TERMINAL_CAST_EVENT_WITHIN_SELECTED_TRIALS: replay.asciinemaCastEvents,
      crossPopulationTotal: null, additionProhibited: true,
    },
    outcome: {
      publisherHarnessOutcomeRows: 5,
      publisherHarnessSuccessRows: 1, publisherHarnessFailureRows: 4,
      actingAgentSelfReportedOutcomeRows: 0,
      externallyIndependentOutcomeRows: 0, realWorldOutcomeRows: 0,
      sameTaskMixedOutcomeComparisonAvailable: true,
      sameTaskTrialsAreFreshAttemptsNotOneLongitudinalRecoveryChain: true,
      longitudinalRecoveryRows: 0, causalRecoveryRows: 0,
      agentTimeoutCanCoexistWithHarnessSuccess: true,
    },
    rights: {
      leaderboardDatasetCardLicenseClaim: "Apache-2.0",
      leaderboardLicenseFilePresent: false,
      selectedSubmissionContributorRightsIndependentlyAdjudicated: false,
      taskCommitLicenseFilePresent: false,
      taskRepositoryCurrentLicenseNotInheritedIntoCommitPayload: true,
      useSpecificTrainingAuthorizationEstablished: false,
      legalConclusionEstablished: false, authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      rawPromptsPresent: true, rawResponsesPresent: true,
      rawDebugPayloadsPresent: true, rawTerminalRecordingsPresent: true,
      rawPaneContentsPresent: true, rawTrajectoryMessagesPresent: true,
      rawVerifierOutputPresent: true, rawSourcePrivate: true,
      noPiiOrSecretGuaranteed: false, rawProjectionRows: 0,
    },
    safety: {
      sourceCommandsExecutedDuringAcquisitionOrReplay: false,
      taskSolutionExecuted: false, taskVerifierExecuted: false,
      encryptedProtectedTaskArchiveDecrypted: false,
      terminalCastPlayedOrInterpretedAsCommands: false,
    },
    boundary: {
      softwareBenchmarkTrialRows: 5, publisherHarnessOutcomeRows: 5,
      externallyIndependentOutcomeRows: 0, realWorldOutcomeRows: 0,
      longitudinalRecoveryRows: 0, physicalEffectRows: 0,
      preActionDelegationRows: 0, authorizedTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      actorCreditRows: 0, ceuRows: 0, pricingRows: 0,
      authorityRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createTerminalBenchAdaptiveTrialsReceipt(
  report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: TERMINAL_BENCH_ADAPTIVE_TRIALS_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: TERMINAL_BENCH_ADAPTIVE_TRIALS_DISPOSITION,
    selectedFreshTrials: 5, publisherHarnessSuccessRows: 1,
    publisherHarnessFailureRows: 4, externallyIndependentOutcomeRows: 0,
    longitudinalRecoveryRows: 0, authorizedTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0, authorityRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyTerminalBenchAdaptiveTrialsArtifactDirectory(directory) {
  try {
    const root = PathResolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readRegular(root, "report.json", MAX_METADATA_BYTES);
    const receiptBytes = readRegular(root, "run-receipt.json", MAX_METADATA_BYTES);
    const built = buildTerminalBenchAdaptiveTrialsArtifactFromSourceDirectory(
      checkedPath(root, "source"));
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createTerminalBenchAdaptiveTrialsReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeTerminalBenchAdaptiveTrialsArtifact(value) {
  return serialize(value);
}
