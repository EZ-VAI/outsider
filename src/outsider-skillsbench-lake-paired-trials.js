/*
 * SkillsBench source-native paired trial intake.
 *
 * The requested leaderboard revision is used as the mapping authority.  Its
 * own analysis identifies PR5 as the pre-selection input and PR6 as the
 * reviewed, non-timeout output.  Selection therefore happens over the complete
 * fixed PR5 tree, not over leaderboard-selected rows.  For the smallest
 * complete OpenHands task/model pair this retains three with-skill trials and
 * four no-skill trials, including a timeout with a partial trajectory.
 *
 * Raw prompts, requests, responses, commands, tool calls, local paths, task
 * instructions, verifier/oracle scripts, and Skills remain in mode-0600 source
 * files.  Nothing from the task package or trajectories is executed.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync,
  readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "./canonical-historical-replay.js";

export const SKILLSBENCH_DATASET_ID = "benchflow/skillsbench-leaderboard";
export const SKILLSBENCH_PRIMARY_REVISION =
  "f104580363a9642563593c475620196ecd36687d";
export const SKILLSBENCH_TRIAL_REVISION =
  "30b03bc84777c84f04fd4c63d3bf580be1062673";
export const SKILLSBENCH_REGISTRY_REPOSITORY = "benchflow-ai/skillsbench";
export const SKILLSBENCH_REGISTRY_REVISION =
  "27738384b1df694ea2ae466e416f476e94d8fab9";
export const SKILLSBENCH_TASK_REVISION =
  "14f3396760786d4ec9ea28e7b865f2ce4d199fdf";
export const SKILLSBENCH_TASK = "lake-warming-attribution";
export const SKILLSBENCH_AGENT = "openhands";
export const SKILLSBENCH_MODEL = "minimax-MiniMax-M3";
export const SKILLSBENCH_DISPOSITION = "QUARANTINE_EVAL";
export const SKILLSBENCH_REPORT_SCHEMA =
  "outsider/skillsbench-lake-paired-trials/v1";
export const SKILLSBENCH_RECEIPT_SCHEMA =
  "outsider/skillsbench-lake-paired-trials-run-receipt/v1";
export const SKILLSBENCH_SOURCE_SCHEMA =
  "outsider/skillsbench-lake-paired-source/v1";

export const SKILLSBENCH_EXPECTED = Object.freeze({
  primary: Object.freeze({ pages: 293, entries: 292_907, files: 210_808,
    directories: 82_099, logicalBytes: 207_907_171_034,
    lfsFiles: 41_238, lfsBytes: 205_589_821_636,
    snapshotHash:
      "sha256:afed1232e6c086d45068d9cc0b3d06bb63c455b90c7172c881d1d8a62c18c707" }),
  trial: Object.freeze({ pages: 22, entries: 21_954, files: 15_153,
    directories: 6_801, logicalBytes: 62_248_806_508,
    lfsFiles: 5_767, lfsBytes: 62_199_713_677,
    snapshotHash:
      "sha256:7d74a8b147522ee7cf798dbd1b771cb5e1e121bdf94ac0779ea8aa91690f4dcf" }),
  eligiblePairs: 263,
  selectedTrialFiles: 35,
  selectedTrialBytes: 10_076_876,
  taskTree: "9744332a49ea262c7f99375d65e4a2b1fec76cf4",
  taskFiles: 14,
  taskBytes: 20_471,
  skillFiles: 4,
  skillBytes: 11_654,
});

const TREE_DOMAIN = "outsider/skillsbench-hf-tree/v1";
const SOURCE_ROOT_DOMAIN = "outsider/skillsbench-source-root/v1";
const SOURCE_MANIFEST_DOMAIN = "outsider/skillsbench-source-manifest/v1";
const REPORT_DOMAIN = "outsider/skillsbench-lake-paired-report/v1";
const RECEIPT_DOMAIN = "outsider/skillsbench-lake-paired-receipt/v1";
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const O_RDONLY = fsConstants.O_RDONLY;
const O_NOFOLLOW = fsConstants.O_NOFOLLOW ?? 0;

const MAIN_SUPPORT = Object.freeze({
  "README.md": "main/support/README.md",
  "analysis/experiment_final_selected_manifest.json":
    "main/support/experiment-final-selected-manifest.json",
  "analysis/experiment_final_selected_summary.md":
    "main/support/experiment-final-selected-summary.md",
});
const TRIAL_SUPPORT = Object.freeze({
  ".gitattributes": "trial/support/.gitattributes",
  "README.md": "trial/support/README.md",
  [`submissions/skillsbench/v1.1/openhands-no-skills__${SKILLSBENCH_MODEL}/metadata.yaml`]:
    "trial/support/metadata-without.yaml",
  [`submissions/skillsbench/v1.1/openhands-with-skills__${SKILLSBENCH_MODEL}/metadata.yaml`]:
    "trial/support/metadata-with.yaml",
});
const REQUIRED_TRIAL_FILES = Object.freeze([
  "config.json", "result.json", "timing.json",
  "trajectory/acp_trajectory.jsonl", "trajectory/llm_trajectory.jsonl",
]);

const EXPECTED_REGISTRY = Object.freeze({
  registryRootTree: "13b376cf432035cd8e55d8fd323fae0eed187402",
  registryBlob: "1fb4ea1a3b6d3740388e5cf295f3f5dcb86d2623",
  registryBytes: 82_975,
  licenseBlob: "261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64",
  licenseBytes: 11_357,
  readmeBlob: "17c5a88203eff5b1e15339ee2dc24cc1d9b38e9a",
  readmeBytes: 3_355,
  taskRootTree: "dcd76dc41b51321083008826be93e0476a2e98dc",
  tasksTree: "126e896fd0efb3f5319bf13674d55e49cb242f11",
  taskTree: SKILLSBENCH_EXPECTED.taskTree,
  registryTaskDigest:
    "sha256:049eb7325f89c88e321c72282fbe3732f16ff92363c4db787c5e2848ffaeb048",
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `SKILLSBENCH_${code}`
    : `SKILLSBENCH_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function skillsbenchSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function skillsbenchDigest(domain, value) {
  return skillsbenchSha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

export function serializeSkillsbenchArtifact(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes).digest("hex");
}

function safeRelative(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 8192
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..")
    && path.posix.normalize(value) === value;
}

function checkedPath(root, relative) {
  if (!safeRelative(relative)) fail("PATH_INVALID", String(relative));
  const base = path.resolve(root);
  const target = path.resolve(base, ...relative.split("/"));
  const relation = path.relative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_ESCAPE", relative);
  return target;
}

function readPrivateStable(root, relative, maximumBytes = MAX_FILE_BYTES) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600 || link.size < 1n
    || link.size > BigInt(maximumBytes)) fail("FILE_UNSAFE", relative);
  let descriptor;
  try {
    descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== after.size) fail("FILE_CHANGED_DURING_READ", relative);
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseJson(bytes, code) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { fail(code); }
}

function parseJsonl(bytes, code) {
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(`${code}_UTF8`); }
  const lines = text.split(/\r?\n/u).filter((line) => line.trim() !== "");
  if (lines.length === 0) fail(`${code}_EMPTY`);
  return lines.map((line, index) => {
    try {
      const value = JSON.parse(line);
      if (!plain(value)) fail(`${code}_ROW_OBJECT`, index);
      return value;
    } catch (error) {
      if (String(error?.message ?? error).startsWith("SKILLSBENCH_")) throw error;
      fail(`${code}_JSON`, index);
    }
  });
}

function walkPrivate(root) {
  const files = [];
  const directories = [path.resolve(root)];
  for (let index = 0; index < directories.length; index += 1) {
    const directory = directories[index];
    const status = lstatSync(directory, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700) fail("DIRECTORY_UNSAFE", directory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
      if (entry.isDirectory()) directories.push(child);
      else if (entry.isFile()) {
        const relative = path.relative(path.resolve(root), child).split(path.sep).join("/");
        const childStatus = lstatSync(child, { bigint: true });
        if (Number(childStatus.mode & 0o777n) !== 0o600) fail("FILE_MODE_INVALID", relative);
        files.push(relative);
      } else fail("SPECIAL_FILE_REFUSED", child);
    }
  }
  return { files: sorted(files), directories };
}

function recordProjection(value, revision, kind) {
  const expected = kind === "primary" ? {
    lastModified: "2026-06-16T21:45:08.000Z", siblingCount: 17_901,
  } : { lastModified: "2026-06-08T14:09:47.000Z", siblingCount: 15_153 };
  if (!plain(value) || value.id !== SKILLSBENCH_DATASET_ID || value.sha !== revision
    || value.private !== false || value.gated !== false || value.disabled !== false
    || value.lastModified !== expected.lastModified
    || value.usedStorage !== 334_066_577_777
    || value.cardData?.license !== "apache-2.0"
    || !Array.isArray(value.tags) || !value.tags.includes("license:apache-2.0")
    || !Array.isArray(value.siblings) || value.siblings.length !== expected.siblingCount
    || value.siblings.some((entry) => !plain(entry)
      || !safeRelative(entry.rfilename))) fail("DATASET_RECORD_INVALID", kind);
  return { datasetId: value.id, revision: value.sha, lastModified: value.lastModified,
    private: false, gated: false, disabled: false, publisherLicenseClaim: "Apache-2.0",
    usedStorageBytes: value.usedStorage, recordSiblingCount: value.siblings.length,
    recordSiblingPathsHash: skillsbenchDigest(
      "outsider/skillsbench-record-siblings/v1", sorted(value.siblings.map(
        (entry) => entry.rfilename))) };
}

function normalizeHfEntry(entry) {
  if (!plain(entry) || !["file", "directory"].includes(entry.type)
    || !safeRelative(entry.path) || !SHA1.test(entry.oid ?? "")
    || !Number.isSafeInteger(entry.size) || entry.size < 0
    || entry.type === "directory" && entry.size !== 0) fail("HF_TREE_ENTRY_INVALID");
  const result = { type: entry.type, path: entry.path, oid: entry.oid, size: entry.size };
  if (entry.lfs !== undefined) {
    if (!plain(entry.lfs) || !SHA256.test(entry.lfs.oid ?? "")
      || !Number.isSafeInteger(entry.lfs.size) || entry.lfs.size !== entry.size
      || !Number.isSafeInteger(entry.lfs.pointerSize) || entry.lfs.pointerSize < 1) {
      fail("HF_TREE_LFS_INVALID", entry.path);
    }
    result.lfs = { oid: entry.lfs.oid, size: entry.lfs.size,
      pointerSize: entry.lfs.pointerSize };
  }
  if (entry.xetHash !== undefined) {
    if (!SHA256.test(entry.xetHash)) fail("HF_TREE_XET_INVALID", entry.path);
    result.xetHash = entry.xetHash;
  }
  return result;
}

function numberedFiles(root, prefix) {
  const directory = checkedPath(root, prefix);
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink()
    || (status.mode & 0o777) !== 0o700) fail("TREE_DIRECTORY_UNSAFE", prefix);
  const names = readdirSync(directory);
  const pages = names.filter((name) => /^page-[0-9]{3}\.json$/u.test(name))
    .sort((left, right) => Number(left.slice(5, 8)) - Number(right.slice(5, 8)));
  const metas = names.filter((name) => /^page-[0-9]{3}\.meta\.json$/u.test(name))
    .sort((left, right) => Number(left.slice(5, 8)) - Number(right.slice(5, 8)));
  if (names.length !== pages.length + metas.length || pages.length !== metas.length
    || pages.length === 0) fail("TREE_PAGE_LAYOUT_INVALID", prefix);
  for (let index = 0; index < pages.length; index += 1) {
    const expected = `page-${String(index + 1).padStart(3, "0")}`;
    if (pages[index] !== `${expected}.json` || metas[index] !== `${expected}.meta.json`) {
      fail("TREE_PAGE_SEQUENCE_INVALID", prefix);
    }
  }
  return { pages, metas };
}

function verifyHfTreePhase(root, prefix, revision, kind) {
  const expected = SKILLSBENCH_EXPECTED[kind];
  const { pages, metas } = numberedFiles(root, prefix);
  if (pages.length !== expected.pages) fail("TREE_PAGE_COUNT_INVALID", kind);
  const entries = [];
  let expectedUrl = `https://huggingface.co/api/datasets/${SKILLSBENCH_DATASET_ID}`
    + `/tree/${revision}?recursive=true&limit=1000`;
  for (let index = 0; index < pages.length; index += 1) {
    const body = readPrivateStable(root, `${prefix}/${pages[index]}`, 2 * 1024 * 1024);
    const meta = parseJson(readPrivateStable(root,
      `${prefix}/${metas[index]}`), "TREE_META_JSON_INVALID");
    const rows = parseJson(body, "TREE_PAGE_JSON_INVALID");
    if (!plain(meta) || meta.schema !== "outsider/skillsbench-hf-tree-page/v1"
      || meta.revision !== revision || meta.page !== index + 1
      || meta.requestUrl !== expectedUrl || meta.bodyBytes !== body.length
      || meta.bodySha256 !== skillsbenchSha256(body)
      || typeof meta.etag !== "string" || meta.etag.length < 3
      || !Array.isArray(rows) || rows.length !== meta.entries
      || rows.length < 1 || rows.length > 1_000
      || index < pages.length - 1 && rows.length !== 1_000
      || index < pages.length - 1 && typeof meta.nextUrl !== "string"
      || index === pages.length - 1 && meta.nextUrl !== null) {
      fail("TREE_PAGE_META_INVALID", `${kind}/${index + 1}`);
    }
    expectedUrl = meta.nextUrl;
    entries.push(...rows.map(normalizeHfEntry));
  }
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) fail("TREE_PATH_DUPLICATE", kind);
  const normalized = [...entries].sort((left, right) => left.path.localeCompare(right.path));
  const files = normalized.filter((entry) => entry.type === "file");
  const snapshot = { pages: pages.length, entries: normalized.length,
    files: files.length, directories: normalized.length - files.length,
    logicalBytes: files.reduce((sum, entry) => sum + entry.size, 0),
    lfsFiles: files.filter((entry) => entry.lfs).length,
    lfsBytes: files.filter((entry) => entry.lfs)
      .reduce((sum, entry) => sum + entry.size, 0),
    snapshotHash: skillsbenchDigest(TREE_DOMAIN, normalized) };
  if (!same(snapshot, expected)) fail("TREE_SNAPSHOT_INVALID", kind);
  return { entries: normalized, snapshot };
}

function exactTreeEntry(entries, remotePath, type = "file") {
  const matches = entries.filter((entry) => entry.path === remotePath);
  if (matches.length !== 1 || matches[0].type !== type) {
    fail("TREE_MEMBER_INVALID", remotePath);
  }
  return matches[0];
}

function verifyHfObject(bytes, entry, remotePath) {
  if (bytes.length !== entry.size) fail("OBJECT_SIZE_INVALID", remotePath);
  if (entry.lfs) {
    if (skillsbenchSha256(bytes) !== `sha256:${entry.lfs.oid}`) {
      fail("OBJECT_LFS_SHA_INVALID", remotePath);
    }
  } else if (gitBlobOid(bytes) !== entry.oid) fail("OBJECT_GIT_OID_INVALID", remotePath);
  return { remotePath, bytes: bytes.length, sha256: skillsbenchSha256(bytes),
    gitObjectId: entry.oid, lfsObjectId: entry.lfs?.oid ?? null };
}

function selectedPair(entries) {
  const groups = new Map();
  for (const entry of entries) {
    if (entry.type !== "file") continue;
    const parts = entry.path.split("/");
    if (parts.length < 7 || parts[0] !== "submissions" || parts[1] !== "skillsbench"
      || parts[2] !== "v1.1") continue;
    const match = /^openhands-(no|with)-skills__(.+)$/u.exec(parts[3]);
    if (!match || parts[4] === "metadata.yaml") continue;
    const mode = match[1] === "with" ? "with" : "without";
    const model = match[2];
    const trialDirectory = parts[5];
    const split = trialDirectory.lastIndexOf("__");
    if (split < 1) continue;
    const task = trialDirectory.slice(0, split);
    const key = `${model}\0${task}\0${mode}`;
    let group = groups.get(key);
    if (!group) {
      group = { model, task, mode, trials: new Map(), bytes: 0, files: 0 };
      groups.set(key, group);
    }
    const trialKey = `${parts[4]}/${trialDirectory}`;
    let trial = group.trials.get(trialKey);
    if (!trial) {
      trial = { run: parts[4], directory: trialDirectory, files: [], bytes: 0 };
      group.trials.set(trialKey, trial);
    }
    trial.files.push(entry);
    trial.bytes += entry.size;
    group.files += 1;
    group.bytes += entry.size;
  }
  const candidates = [];
  for (const withGroup of groups.values()) {
    if (withGroup.mode !== "with") continue;
    const withoutGroup = groups.get(
      `${withGroup.model}\0${withGroup.task}\0without`);
    if (!withoutGroup || withGroup.trials.size < 3 || withoutGroup.trials.size < 3) {
      continue;
    }
    const allTrials = [...withGroup.trials.values(), ...withoutGroup.trials.values()];
    if (allTrials.some((trial) => !REQUIRED_TRIAL_FILES.every((relative) =>
      trial.files.some((entry) => entry.path.endsWith(`/${relative}`))))) continue;
    candidates.push({ model: withGroup.model, task: withGroup.task,
      withGroup, withoutGroup, bytes: withGroup.bytes + withoutGroup.bytes,
      files: withGroup.files + withoutGroup.files });
  }
  candidates.sort((left, right) => left.bytes - right.bytes
    || left.model.localeCompare(right.model) || left.task.localeCompare(right.task));
  const selected = candidates[0];
  if (candidates.length !== SKILLSBENCH_EXPECTED.eligiblePairs || !selected
    || selected.model !== SKILLSBENCH_MODEL || selected.task !== SKILLSBENCH_TASK
    || selected.withGroup.trials.size !== 3 || selected.withoutGroup.trials.size !== 4
    || selected.files !== SKILLSBENCH_EXPECTED.selectedTrialFiles
    || selected.bytes !== SKILLSBENCH_EXPECTED.selectedTrialBytes) {
    fail("BOUNDED_SELECTION_INVALID");
  }
  const trials = [
    ...[...selected.withGroup.trials.values()].map((trial) => ({ ...trial, mode: "with" })),
    ...[...selected.withoutGroup.trials.values()].map((trial) =>
      ({ ...trial, mode: "without" })),
  ].sort((left, right) => `${left.mode}/${left.run}/${left.directory}`.localeCompare(
    `${right.mode}/${right.run}/${right.directory}`));
  return { candidates: candidates.length, selected, trials,
    files: trials.flatMap((trial) => trial.files).sort((left, right) =>
      left.path.localeCompare(right.path)) };
}

export function deriveSkillsbenchSelectedTrialEntries(treePhaseDirectory) {
  const directory = path.resolve(treePhaseDirectory);
  const root = path.dirname(directory);
  const prefix = path.basename(directory);
  const tree = verifyHfTreePhase(root, prefix, SKILLSBENCH_TRIAL_REVISION, "trial");
  return deepFreeze(selectedPair(tree.entries).files.map((entry) => ({ ...entry })));
}

function githubCommitProjection(value, revision, expectedTree, kind) {
  if (!plain(value) || value.sha !== revision || value.commit?.tree?.sha !== expectedTree
    || value.commit?.verification?.verified !== true
    || value.commit?.verification?.reason !== "valid" || !Array.isArray(value.parents)
    || value.parents.length < 1 || value.parents.some((parent) =>
      !SHA1.test(parent.sha ?? ""))) fail("GITHUB_COMMIT_INVALID", kind);
  return { revision: value.sha, tree: value.commit.tree.sha,
    signatureVerifiedByPublisherApi: true,
    verificationReason: value.commit.verification.reason,
    parents: value.parents.map((parent) => parent.sha) };
}

function githubTree(value, expectedSha, kind) {
  if (!plain(value) || value.sha !== expectedSha || value.truncated !== false
    || !Array.isArray(value.tree)) fail("GITHUB_TREE_INVALID", kind);
  const entries = value.tree.map((entry) => {
    if (!plain(entry) || !["blob", "tree"].includes(entry.type)
      || !safeRelative(entry.path) || !SHA1.test(entry.sha ?? "")
      || entry.type === "blob" && (!Number.isSafeInteger(entry.size) || entry.size < 0)) {
      fail("GITHUB_TREE_ENTRY_INVALID", kind);
    }
    return { path: entry.path, type: entry.type, oid: entry.sha,
      bytes: entry.type === "blob" ? entry.size : 0 };
  });
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("GITHUB_TREE_DUPLICATE", kind);
  }
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

function exactGithubEntry(entries, entryPath, type) {
  const matches = entries.filter((entry) => entry.path === entryPath);
  if (matches.length !== 1 || matches[0].type !== type) {
    fail("GITHUB_TREE_MEMBER_INVALID", entryPath);
  }
  return matches[0];
}

function verifyGithubObject(bytes, entry, remotePath) {
  if (bytes.length !== entry.bytes || gitBlobOid(bytes) !== entry.oid) {
    fail("GITHUB_OBJECT_INVALID", remotePath);
  }
  return { remotePath, bytes: bytes.length, sha256: skillsbenchSha256(bytes),
    gitObjectId: entry.oid };
}

function collectGithub(root) {
  const registryBefore = githubCommitProjection(parseJson(readPrivateStable(root,
    "github/registry-commit-before.json"), "REGISTRY_COMMIT_JSON_INVALID"),
  SKILLSBENCH_REGISTRY_REVISION, EXPECTED_REGISTRY.registryRootTree, "registry-before");
  const registryAfter = githubCommitProjection(parseJson(readPrivateStable(root,
    "github/registry-commit-after.json"), "REGISTRY_COMMIT_JSON_INVALID"),
  SKILLSBENCH_REGISTRY_REVISION, EXPECTED_REGISTRY.registryRootTree, "registry-after");
  if (!same(registryBefore, registryAfter)) fail("REGISTRY_COMMIT_CHANGED");
  const registryTreeBefore = githubTree(parseJson(readPrivateStable(root,
    "github/registry-root-tree-before.json"), "REGISTRY_TREE_JSON_INVALID"),
  EXPECTED_REGISTRY.registryRootTree, "registry-root-before");
  const registryTreeAfter = githubTree(parseJson(readPrivateStable(root,
    "github/registry-root-tree-after.json"), "REGISTRY_TREE_JSON_INVALID"),
  EXPECTED_REGISTRY.registryRootTree, "registry-root-after");
  if (!same(registryTreeBefore, registryTreeAfter)) fail("REGISTRY_TREE_CHANGED");
  const registryMembers = {
    "registry.json": [EXPECTED_REGISTRY.registryBlob, EXPECTED_REGISTRY.registryBytes],
    "LICENSE": [EXPECTED_REGISTRY.licenseBlob, EXPECTED_REGISTRY.licenseBytes],
    "README.md": [EXPECTED_REGISTRY.readmeBlob, EXPECTED_REGISTRY.readmeBytes],
  };
  const supportEntries = [];
  const supportBytes = new Map();
  for (const [name, [oid, bytes]] of Object.entries(registryMembers)) {
    const entry = exactGithubEntry(registryTreeBefore, name, "blob");
    if (entry.oid !== oid || entry.bytes !== bytes) fail("REGISTRY_MEMBER_PIN_INVALID", name);
    const content = readPrivateStable(root, `github/registry-files/${name}`);
    supportEntries.push(verifyGithubObject(content, entry, name));
    supportBytes.set(name, content);
  }
  const registry = parseJson(supportBytes.get("registry.json"), "REGISTRY_JSON_INVALID");
  if (!Array.isArray(registry)) fail("REGISTRY_SHAPE_INVALID");
  const versions = registry.filter((entry) => entry?.name === "skillsbench"
    && entry.version === "1.1");
  if (versions.length !== 1 || !Array.isArray(versions[0].tasks)
    || versions[0].tasks.length !== 87) fail("REGISTRY_V11_INVALID");
  const selectedTask = versions[0].tasks.filter((entry) =>
    entry?.name === SKILLSBENCH_TASK);
  if (selectedTask.length !== 1
    || selectedTask[0].git_url !== "https://github.com/benchflow-ai/skillsbench.git"
    || selectedTask[0].git_commit_id !== SKILLSBENCH_TASK_REVISION
    || selectedTask[0].path !== `tasks/${SKILLSBENCH_TASK}`
    || selectedTask[0].digest !== EXPECTED_REGISTRY.registryTaskDigest) {
    fail("REGISTRY_TASK_INVALID");
  }

  const taskBefore = githubCommitProjection(parseJson(readPrivateStable(root,
    "github/task-commit-before.json"), "TASK_COMMIT_JSON_INVALID"),
  SKILLSBENCH_TASK_REVISION, EXPECTED_REGISTRY.taskRootTree, "task-before");
  const taskAfter = githubCommitProjection(parseJson(readPrivateStable(root,
    "github/task-commit-after.json"), "TASK_COMMIT_JSON_INVALID"),
  SKILLSBENCH_TASK_REVISION, EXPECTED_REGISTRY.taskRootTree, "task-after");
  if (!same(taskBefore, taskAfter)) fail("TASK_COMMIT_CHANGED");
  const taskRootBefore = githubTree(parseJson(readPrivateStable(root,
    "github/task-root-tree-before.json"), "TASK_ROOT_JSON_INVALID"),
  EXPECTED_REGISTRY.taskRootTree, "task-root-before");
  const taskRootAfter = githubTree(parseJson(readPrivateStable(root,
    "github/task-root-tree-after.json"), "TASK_ROOT_JSON_INVALID"),
  EXPECTED_REGISTRY.taskRootTree, "task-root-after");
  const tasksBefore = githubTree(parseJson(readPrivateStable(root,
    "github/tasks-tree-before.json"), "TASKS_TREE_JSON_INVALID"),
  EXPECTED_REGISTRY.tasksTree, "tasks-before");
  const tasksAfter = githubTree(parseJson(readPrivateStable(root,
    "github/tasks-tree-after.json"), "TASKS_TREE_JSON_INVALID"),
  EXPECTED_REGISTRY.tasksTree, "tasks-after");
  const selectedTreeBefore = githubTree(parseJson(readPrivateStable(root,
    "github/selected-task-tree-before.json"), "SELECTED_TASK_TREE_JSON_INVALID"),
  EXPECTED_REGISTRY.taskTree, "selected-task-before");
  const selectedTreeAfter = githubTree(parseJson(readPrivateStable(root,
    "github/selected-task-tree-after.json"), "SELECTED_TASK_TREE_JSON_INVALID"),
  EXPECTED_REGISTRY.taskTree, "selected-task-after");
  if (!same(taskRootBefore, taskRootAfter) || !same(tasksBefore, tasksAfter)
    || !same(selectedTreeBefore, selectedTreeAfter)
    || exactGithubEntry(taskRootBefore, "tasks", "tree").oid
      !== EXPECTED_REGISTRY.tasksTree
    || exactGithubEntry(tasksBefore, SKILLSBENCH_TASK, "tree").oid
      !== EXPECTED_REGISTRY.taskTree) fail("TASK_TREE_CHAIN_INVALID");
  const taskFiles = selectedTreeBefore.filter((entry) => entry.type === "blob");
  if (taskFiles.length !== SKILLSBENCH_EXPECTED.taskFiles
    || taskFiles.reduce((sum, entry) => sum + entry.bytes, 0)
      !== SKILLSBENCH_EXPECTED.taskBytes) fail("TASK_FILE_PROFILE_INVALID");
  const taskObjects = [];
  for (const entry of taskFiles) {
    const bytes = readPrivateStable(root, `github/task-objects/${entry.path}`);
    taskObjects.push(verifyGithubObject(bytes, entry,
      `tasks/${SKILLSBENCH_TASK}/${entry.path}`));
  }
  const skillFiles = taskFiles.filter((entry) =>
    /^environment\/skills\/.+\/SKILL\.md$/u.test(entry.path));
  if (skillFiles.length !== SKILLSBENCH_EXPECTED.skillFiles
    || skillFiles.reduce((sum, entry) => sum + entry.bytes, 0)
      !== SKILLSBENCH_EXPECTED.skillBytes) fail("TASK_SKILL_PROFILE_INVALID");
  return { registryBefore, registryTreeBefore, taskBefore, taskFiles,
    skillFiles, supportEntries, taskObjects, registryVersion: versions[0],
    selectedTask: selectedTask[0] };
}

function objectLocalPath(remotePath) {
  return `trial/objects/${remotePath}`;
}

function replayTrial(root, trial) {
  const remotePrefix = trial.files[0].path.split("/").slice(0, 6).join("/");
  const entries = new Map(trial.files.map((entry) =>
    [entry.path.slice(remotePrefix.length + 1), entry]));
  if (!same(sorted(entries.keys()), sorted(REQUIRED_TRIAL_FILES))) {
    fail("TRIAL_FILE_SET_INVALID", trial.directory);
  }
  const readObject = (relative) => {
    const entry = entries.get(relative);
    const bytes = readPrivateStable(root, objectLocalPath(entry.path));
    verifyHfObject(bytes, entry, entry.path);
    return bytes;
  };
  const config = parseJson(readObject("config.json"), "TRIAL_CONFIG_JSON_INVALID");
  const result = parseJson(readObject("result.json"), "TRIAL_RESULT_JSON_INVALID");
  const timing = parseJson(readObject("timing.json"), "TRIAL_TIMING_JSON_INVALID");
  const acp = parseJsonl(readObject("trajectory/acp_trajectory.jsonl"),
    "TRIAL_ACP_INVALID");
  const llm = parseJsonl(readObject("trajectory/llm_trajectory.jsonl"),
    "TRIAL_LLM_INVALID");
  const expectedMode = trial.mode === "with" ? "with-skill" : "no-skill";
  if (!plain(config) || !plain(result) || !plain(timing)
    || config.agent !== SKILLSBENCH_AGENT || config.model !== "minimax/MiniMax-M3"
    || config.skill_mode !== expectedMode || result.skill_mode !== expectedMode
    || config.include_task_skills !== (trial.mode === "with")
    || result.include_task_skills !== (trial.mode === "with")
    || result.task_name !== SKILLSBENCH_TASK || result.model !== "minimax/MiniMax-M3"
    || result.agent !== SKILLSBENCH_AGENT
    || result.agent_name !== "OpenHands CLI ACP Agent"
    || !plain(result.rewards) || ![0, 1].includes(result.rewards.reward)
    || !Number.isSafeInteger(result.n_tool_calls) || result.n_tool_calls < 0
    || !Number.isSafeInteger(result.n_skill_invocations)
    || result.n_skill_invocations < 0 || result.n_prompts !== 1
    || !Number.isSafeInteger(result.agent_result?.total_tokens)
    || result.agent_result.total_tokens < 0 || !Number.isFinite(timing.total)
    || timing.total < 0 || config.timeout_sec !== 300
    || typeof result.started_at !== "string" || typeof result.finished_at !== "string") {
    fail("TRIAL_PROFILE_INVALID", trial.directory);
  }
  const started = Date.parse(`${result.started_at.replace(" ", "T")}Z`);
  const finished = Date.parse(`${result.finished_at.replace(" ", "T")}Z`);
  if (!Number.isFinite(started) || !Number.isFinite(finished) || finished < started) {
    fail("TRIAL_TIME_INVALID", trial.directory);
  }
  if (trial.mode === "with") {
    if (config.requested_skills_dir === null || config.effective_skills_dir === null) {
      fail("WITH_SKILL_DIR_MISSING", trial.directory);
    }
  } else if (config.requested_skills_dir !== null || config.effective_skills_dir !== null
    || result.n_skill_invocations !== 0) fail("NO_SKILL_ISOLATION_INVALID", trial.directory);
  const types = Object.create(null);
  const kinds = Object.create(null);
  const statuses = Object.create(null);
  for (const row of acp) {
    const type = String(row.type ?? "__missing__");
    const kind = String(row.kind ?? "__missing__");
    const status = String(row.status ?? "__missing__");
    types[type] = (types[type] ?? 0) + 1;
    kinds[kind] = (kinds[kind] ?? 0) + 1;
    statuses[status] = (statuses[status] ?? 0) + 1;
  }
  if ((types.tool_call ?? 0) !== result.n_tool_calls
    || (kinds.skill ?? 0) !== result.n_skill_invocations
    || (types.user_message ?? 0) !== 1
    || !llm.every((row) => plain(row.request) && plain(row.response)
      && Number.isFinite(row.duration_ms) && row.duration_ms >= 0)) {
    fail("TRIAL_TRAJECTORY_JOIN_INVALID", trial.directory);
  }
  const timeout = result.error_category === "timeout";
  if (timeout !== (typeof result.error === "string" && /timed out/iu.test(result.error))
    || Boolean(result.partial_trajectory) !== timeout
    || result.verifier_error !== null || result.export_error !== null) {
    fail("TRIAL_FAILURE_CLASS_INVALID", trial.directory);
  }
  return { trialKey: skillsbenchDigest("outsider/skillsbench-trial-key/v1",
    `${trial.mode}/${trial.run}/${trial.directory}`), mode: trial.mode,
  publisherReward: result.rewards.reward, publisherPass: result.rewards.reward === 1,
  timeout, partialTrajectory: result.partial_trajectory,
  errorCategory: result.error_category, toolCalls: result.n_tool_calls,
  skillInvocations: result.n_skill_invocations, prompts: result.n_prompts,
  totalTokens: result.agent_result.total_tokens, timingTotalSeconds: timing.total,
  acpRows: acp.length, llmRows: llm.length,
  pendingToolCalls: statuses.pending ?? 0,
  completedToolCalls: statuses.completed ?? 0,
  executeCalls: kinds.execute ?? 0, editCalls: kinds.edit ?? 0,
  skillCalls: kinds.skill ?? 0, otherCalls: kinds.other ?? 0,
  agentMessages: types.agent_message ?? 0, agentThoughts: types.agent_thought ?? 0 };
}

function sum(rows, key) {
  return rows.reduce((total, row) => total + row[key], 0);
}

function summarizeMode(rows, mode) {
  const selected = rows.filter((row) => row.mode === mode);
  return { trials: selected.length,
    publisherPass: selected.filter((row) => row.publisherPass).length,
    publisherFailOrIncomplete: selected.filter((row) => !row.publisherPass).length,
    timeouts: selected.filter((row) => row.timeout).length,
    partialTrajectories: selected.filter((row) => row.partialTrajectory).length,
    toolCalls: sum(selected, "toolCalls"), skillInvocations: sum(selected, "skillInvocations"),
    pendingToolCalls: sum(selected, "pendingToolCalls"),
    acpRows: sum(selected, "acpRows"), llmRows: sum(selected, "llmRows"),
    totalTokens: sum(selected, "totalTokens"),
    timingTotalSeconds: Math.round(sum(selected, "timingTotalSeconds") * 10) / 10 };
}

function sourceManifestEntries(root) {
  return walkPrivate(root).files.filter((relative) => relative !== "source-manifest.json")
    .map((relative) => {
      const bytes = readPrivateStable(root, relative);
      return { path: relative, bytes: bytes.length, sha256: skillsbenchSha256(bytes) };
    });
}

export function createSkillsbenchSourceManifestFromDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const entries = sourceManifestEntries(root);
  const sourceRoot = skillsbenchDigest(SOURCE_ROOT_DOMAIN, entries);
  const body = { schema: SKILLSBENCH_SOURCE_SCHEMA, datasetId: SKILLSBENCH_DATASET_ID,
    primaryRevision: SKILLSBENCH_PRIMARY_REVISION,
    trialRevision: SKILLSBENCH_TRIAL_REVISION,
    registryRevision: SKILLSBENCH_REGISTRY_REVISION,
    taskRevision: SKILLSBENCH_TASK_REVISION, entries, sourceRoot };
  return deepFreeze({ ...body,
    manifestHash: skillsbenchDigest(SOURCE_MANIFEST_DOMAIN, body) });
}

function collectSource(root, requireManifest) {
  const mainBefore = recordProjection(parseJson(readPrivateStable(root,
    "main/record-before.json", 8 * 1024 * 1024), "MAIN_RECORD_JSON_INVALID"),
  SKILLSBENCH_PRIMARY_REVISION, "primary");
  const mainAfter = recordProjection(parseJson(readPrivateStable(root,
    "main/record-after.json", 8 * 1024 * 1024), "MAIN_RECORD_JSON_INVALID"),
  SKILLSBENCH_PRIMARY_REVISION, "primary");
  if (!same(mainBefore, mainAfter)) fail("MAIN_RECORD_CHANGED");
  const mainTreeBefore = verifyHfTreePhase(root, "main/tree-before",
    SKILLSBENCH_PRIMARY_REVISION, "primary");
  const mainTreeAfter = verifyHfTreePhase(root, "main/tree-after",
    SKILLSBENCH_PRIMARY_REVISION, "primary");
  if (!same(mainTreeBefore.snapshot, mainTreeAfter.snapshot)) fail("MAIN_TREE_CHANGED");

  const trialBefore = recordProjection(parseJson(readPrivateStable(root,
    "trial/record-before.json", 8 * 1024 * 1024), "TRIAL_RECORD_JSON_INVALID"),
  SKILLSBENCH_TRIAL_REVISION, "trial");
  const trialAfter = recordProjection(parseJson(readPrivateStable(root,
    "trial/record-after.json", 8 * 1024 * 1024), "TRIAL_RECORD_JSON_INVALID"),
  SKILLSBENCH_TRIAL_REVISION, "trial");
  if (!same(trialBefore, trialAfter)) fail("TRIAL_RECORD_CHANGED");
  const trialTreeBefore = verifyHfTreePhase(root, "trial/tree-before",
    SKILLSBENCH_TRIAL_REVISION, "trial");
  const trialTreeAfter = verifyHfTreePhase(root, "trial/tree-after",
    SKILLSBENCH_TRIAL_REVISION, "trial");
  if (!same(trialTreeBefore.snapshot, trialTreeAfter.snapshot)) fail("TRIAL_TREE_CHANGED");

  const sourceObjects = [];
  const mainSupportBytes = new Map();
  for (const [remotePath, localPath] of Object.entries(MAIN_SUPPORT)) {
    const bytes = readPrivateStable(root, localPath, 8 * 1024 * 1024);
    sourceObjects.push(verifyHfObject(bytes,
      exactTreeEntry(mainTreeBefore.entries, remotePath), remotePath));
    mainSupportBytes.set(remotePath, bytes);
  }
  const mappingManifest = parseJson(mainSupportBytes.get(
    "analysis/experiment_final_selected_manifest.json"), "MAPPING_MANIFEST_INVALID");
  if (mappingManifest.schema !== "skillsbench_experiment_final_selected_manifest.v2"
    || mappingManifest.source_pr5_commit !== SKILLSBENCH_TRIAL_REVISION
    || mappingManifest.counts?.strict_credited_before_timeout_filter !== 1_162
    || mappingManifest.counts?.selected_non_timeout !== 1_150
    || mappingManifest.counts?.timeout_excluded !== 12
    || mappingManifest.remote_tree_validation?.revision !== "refs/pr/6"
    || mappingManifest.remote_tree_validation?.selected_runs !== 1_150
    || typeof mappingManifest.selection_rule !== "string"
    || !mappingManifest.selection_rule.includes("excluding all timeout runs")) {
    fail("MAPPING_POLICY_INVALID");
  }
  for (const [remotePath, localPath] of Object.entries(TRIAL_SUPPORT)) {
    const bytes = readPrivateStable(root, localPath);
    sourceObjects.push(verifyHfObject(bytes,
      exactTreeEntry(trialTreeBefore.entries, remotePath), remotePath));
  }
  const selection = selectedPair(trialTreeBefore.entries);
  for (const entry of selection.files) {
    const bytes = readPrivateStable(root, objectLocalPath(entry.path));
    sourceObjects.push(verifyHfObject(bytes, entry, entry.path));
  }
  const replay = selection.trials.map((trial) => replayTrial(root, trial));
  const withMode = summarizeMode(replay, "with");
  const withoutMode = summarizeMode(replay, "without");
  const expectedProfile = {
    withMode: { trials: 3, publisherPass: 1, publisherFailOrIncomplete: 2,
      timeouts: 0, partialTrajectories: 0, toolCalls: 35, skillInvocations: 10,
      pendingToolCalls: 2, acpRows: 57, llmRows: 38, totalTokens: 640_278,
      timingTotalSeconds: 1_256.3 },
    withoutMode: { trials: 4, publisherPass: 0, publisherFailOrIncomplete: 4,
      timeouts: 1, partialTrajectories: 1, toolCalls: 35, skillInvocations: 0,
      pendingToolCalls: 0, acpRows: 60, llmRows: 43, totalTokens: 670_144,
      timingTotalSeconds: 1_267.7 },
  };
  if (!same({ withMode, withoutMode }, expectedProfile)) fail("REPLAY_PROFILE_INVALID");
  const github = collectGithub(root);
  const expectedPaths = new Set([
    "main/record-before.json", "main/record-after.json",
    "trial/record-before.json", "trial/record-after.json",
    ...Object.values(MAIN_SUPPORT), ...Object.values(TRIAL_SUPPORT),
    ...selection.files.map((entry) => objectLocalPath(entry.path)),
    ...["before", "after"].flatMap((phase) => [
      `github/registry-commit-${phase}.json`,
      `github/registry-root-tree-${phase}.json`,
      `github/task-commit-${phase}.json`, `github/task-root-tree-${phase}.json`,
      `github/tasks-tree-${phase}.json`, `github/selected-task-tree-${phase}.json`,
    ]),
    "github/registry-files/registry.json", "github/registry-files/LICENSE",
    "github/registry-files/README.md",
    ...github.taskFiles.map((entry) => `github/task-objects/${entry.path}`),
  ]);
  for (const [prefix, pages] of [["main/tree-before", 293], ["main/tree-after", 293],
    ["trial/tree-before", 22], ["trial/tree-after", 22]]) {
    for (let page = 1; page <= pages; page += 1) {
      const stem = `${prefix}/page-${String(page).padStart(3, "0")}`;
      expectedPaths.add(`${stem}.json`);
      expectedPaths.add(`${stem}.meta.json`);
    }
  }
  if (requireManifest) expectedPaths.add("source-manifest.json");
  const walked = walkPrivate(root).files;
  if (!same(walked, sorted(expectedPaths))) fail("SOURCE_LAYOUT_INVALID");
  let sourceManifest = null;
  if (requireManifest) {
    sourceManifest = createSkillsbenchSourceManifestFromDirectory(root);
    const manifestBytes = readPrivateStable(root, "source-manifest.json");
    if (!serializeSkillsbenchArtifact(sourceManifest).equals(manifestBytes)) {
      fail("SOURCE_MANIFEST_MISMATCH");
    }
  }
  return { mainBefore, mainTree: mainTreeBefore, trialBefore,
    trialTree: trialTreeBefore, mappingManifest, selection, replay,
    withMode, withoutMode, github, sourceObjects, sourceManifest };
}

export function verifySkillsbenchSourceDirectory(sourceDirectory) {
  try {
    const collected = collectSource(path.resolve(sourceDirectory), true);
    return deepFreeze({ ok: true,
      verificationLevel: "FULL_MAIN_AND_PR5_INVENTORY_TASK_AND_TRIAL_BYTE_REPLAY",
      manifest: collected.sourceManifest, primaryInventory: collected.mainTree.snapshot,
      trialInventory: collected.trialTree.snapshot });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function buildSkillsbenchLakePairedReportFromSource(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const collected = collectSource(root, true);
  const trials = collected.replay;
  const reportBody = {
    schema: SKILLSBENCH_REPORT_SCHEMA, disposition: SKILLSBENCH_DISPOSITION,
    source: {
      datasetId: SKILLSBENCH_DATASET_ID,
      requestedPrimaryRevision: SKILLSBENCH_PRIMARY_REVISION,
      primaryRecord: collected.mainBefore,
      primaryInventory: collected.mainTree.snapshot,
      primaryRecordSiblingListIsCompleteInventory: false,
      primaryRecordSiblingCount: collected.mainBefore.recordSiblingCount,
      primaryTreeFileCount: collected.mainTree.snapshot.files,
      mappingAuthorityBeforeAndAfterStable: true,
      preSelectionTrialRevision: SKILLSBENCH_TRIAL_REVISION,
      trialRecord: collected.trialBefore,
      trialInventory: collected.trialTree.snapshot,
      trialInventoryBeforeAndAfterStable: true,
      sourceManifestHash: collected.sourceManifest.manifestHash,
      sourceRoot: collected.sourceManifest.sourceRoot,
      sourceFiles: collected.sourceManifest.entries.length,
    },
    mapping: {
      manifestSchema: collected.mappingManifest.schema,
      fixedPreSelectionCommit: collected.mappingManifest.source_pr5_commit,
      reviewedTargetRevision: collected.mappingManifest.remote_tree_validation.revision,
      strictCreditedBeforeTimeoutFilter:
        collected.mappingManifest.counts.strict_credited_before_timeout_filter,
      reviewedNonTimeoutSelected: collected.mappingManifest.counts.selected_non_timeout,
      timeoutExcludedByPublisherSelection: collected.mappingManifest.counts.timeout_excluded,
      reviewedOnlySelectionUsedForThisArtifact: false,
      selectionRuleHash: skillsbenchDigest("outsider/skillsbench-selection-rule/v1",
        collected.mappingManifest.selection_rule),
    },
    boundedSelection: {
      declaredScope: "PR5 OPENHANDS PAIRS WITH >=3 COMPLETE TRAJECTORY TRIALS PER MODE",
      declaredScopeExhausted: true, internetGlobalExhaustionClaimed: false,
      eligibleTaskModelPairs: collected.selection.candidates,
      selectedByMinimumCompleteSourceBytes: true, agent: SKILLSBENCH_AGENT,
      model: SKILLSBENCH_MODEL, task: SKILLSBENCH_TASK,
      allSourceNativeFreshTrialsIncluded: true,
      withSkillTrials: collected.withMode.trials,
      noSkillTrials: collected.withoutMode.trials,
      attemptDenominator: trials.length,
      reviewedTargetWouldLoseSourceNativeAttempt: true,
      selectedFiles: collected.selection.files.length,
      selectedBytes: collected.selection.selected.bytes,
    },
    replay: {
      trials, byMode: { withSkill: collected.withMode,
        noSkill: collected.withoutMode },
      totalTrials: trials.length, publisherPass: trials.filter((row) => row.publisherPass).length,
      publisherFailOrIncomplete: trials.filter((row) => !row.publisherPass).length,
      timeoutTrials: trials.filter((row) => row.timeout).length,
      partialTrajectories: trials.filter((row) => row.partialTrajectory).length,
      totalToolCalls: sum(trials, "toolCalls"),
      totalSkillInvocations: sum(trials, "skillInvocations"),
      pendingToolCalls: sum(trials, "pendingToolCalls"),
      acpRows: sum(trials, "acpRows"), llmRequestResponseRows: sum(trials, "llmRows"),
      totalTokensPublisherReported: sum(trials, "totalTokens"),
      commandsOrSkillContentExecutedByIntake: false,
      exactSourceBytesReplayed: true,
    },
    taskRegistry: {
      repository: SKILLSBENCH_REGISTRY_REPOSITORY,
      registryAuthorityRevision: SKILLSBENCH_REGISTRY_REVISION,
      registryAuthoritySignedCommit: true, registryVersion: "1.1",
      registryTaskCount: collected.github.registryVersion.tasks.length,
      selectedTaskRevision: SKILLSBENCH_TASK_REVISION,
      selectedTaskTree: EXPECTED_REGISTRY.taskTree,
      registryDigestClaim: collected.github.selectedTask.digest,
      taskFiles: collected.github.taskFiles.length,
      taskBytes: collected.github.taskFiles.reduce((sumValue, entry) =>
        sumValue + entry.bytes, 0),
      skillFiles: collected.github.skillFiles.length,
      skillBytes: collected.github.skillFiles.reduce((sumValue, entry) =>
        sumValue + entry.bytes, 0),
      taskBytesExecutedByIntake: false,
      trialConfigStampedWithRegistryDigest: false,
      exactTrialToRegistryTaskByteBindingEstablished: false,
      linkageBasis: "OFFICIAL_NAME_RELEASE_MAPPING_WITH_UNSTAMPED_TRIAL_CONFIG",
    },
    truthBoundary: {
      publisherVerifierRewardIsIndependentOutcome: false,
      publisherVerifierRewardIsRealWorldOutcome: false,
      differentFreshTrialsAreRecoverySequence: false,
      timeoutThenLaterFreshTrialIsCausalRetry: false,
      recoveryUnits: 0, independentOutcomeUnits: 0, longitudinalUnits: 0,
    },
    privacy: {
      rawPromptsPrivate0600: true, rawLlmRequestsAndResponsesPrivate0600: true,
      rawCommandsAndToolCallsPrivate0600: true, rawSkillBytesPrivate0600: true,
      rawTaskOracleAndVerifierPrivate0600: true,
      reportContainsRawDialogueCommandsOrSkillContent: false,
      noPiiOrSecretGuaranteePresent: false,
    },
    rightsAndUse: {
      publisherDatasetCardLicenseClaim: "Apache-2.0",
      pinnedRepositoryLicenseFile: "Apache-2.0",
      licenseClaimIsUseSpecificTrainingClearance: false,
      benchmarkDataTrainingContaminationProhibited: true,
      disposition: SKILLSBENCH_DISPOSITION, offlineEvaluationOnly: true,
      authorizedTrainingRows: 0, offlineModelFittingRows: 0,
      productionTrainingRows: 0, trainingJobs: 0, trainingPerformed: false,
    },
    boundary: { action: 0, authority: 0, ceu: 0, credit: 0, delegation: 0,
      effect: 0, independentOutcome: 0, longitudinal: 0, network: 0,
      opportunity: 0, pricing: 0, productionTraining: 0, offlineModelFitting: 0 },
  };
  return deepFreeze({ ...reportBody,
    artifactHash: skillsbenchDigest(REPORT_DOMAIN, reportBody) });
}

export function createSkillsbenchLakePairedReceipt(report, reportBytes,
  sourceManifestBytes) {
  if (!plain(report) || report.schema !== SKILLSBENCH_REPORT_SCHEMA
    || !HASH.test(report.artifactHash ?? "") || report.disposition !== SKILLSBENCH_DISPOSITION
    || report.rightsAndUse?.authorizedTrainingRows !== 0) fail("RECEIPT_REPORT_INVALID");
  const body = { schema: SKILLSBENCH_RECEIPT_SCHEMA,
    reportHash: report.artifactHash, reportFileSha256: skillsbenchSha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceRoot: report.source.sourceRoot,
    sourceManifestFileSha256: skillsbenchSha256(sourceManifestBytes),
    sourceManifestFileBytes: sourceManifestBytes.length,
    attemptDenominator: report.boundedSelection.attemptDenominator,
    timeoutTrials: report.replay.timeoutTrials,
    partialTrajectories: report.replay.partialTrajectories,
    disposition: SKILLSBENCH_DISPOSITION, authorizedTrainingRows: 0,
    offlineModelFittingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, authorityUnits: 0, independentOutcomeUnits: 0 };
  return deepFreeze({ ...body,
    receiptHash: skillsbenchDigest(RECEIPT_DOMAIN, body) });
}

export function verifySkillsbenchLakePairedReport(report) {
  try {
    if (!plain(report) || report.schema !== SKILLSBENCH_REPORT_SCHEMA
      || report.disposition !== SKILLSBENCH_DISPOSITION
      || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
    const { artifactHash, ...body } = report;
    if (skillsbenchDigest(REPORT_DOMAIN, body) !== artifactHash
      || report.boundedSelection?.attemptDenominator !== 7
      || report.replay?.timeoutTrials !== 1 || report.replay?.partialTrajectories !== 1
      || report.rightsAndUse?.authorizedTrainingRows !== 0
      || report.rightsAndUse?.offlineModelFittingRows !== 0
      || report.rightsAndUse?.productionTrainingRows !== 0
      || report.truthBoundary?.independentOutcomeUnits !== 0
      || report.truthBoundary?.recoveryUnits !== 0
      || Object.values(report.boundary ?? {}).some((value) => value !== 0)) {
      fail("REPORT_INVARIANT_INVALID");
    }
    return deepFreeze({ ok: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifySkillsbenchLakePairedArtifactDirectory(directory) {
  try {
    const root = path.resolve(directory);
    const walked = walkPrivate(root);
    if (!same(readdirSync(root).sort(), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readPrivateStable(root, "report.json");
    const receiptBytes = readPrivateStable(root, "run-receipt.json");
    const report = parseJson(reportBytes, "REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "RECEIPT_JSON_INVALID");
    const rebuilt = buildSkillsbenchLakePairedReportFromSource(
      checkedPath(root, "source"));
    if (!serializeSkillsbenchArtifact(rebuilt).equals(reportBytes)
      || !verifySkillsbenchLakePairedReport(report).ok) fail("REPORT_SOURCE_MISMATCH");
    const manifestBytes = readPrivateStable(root, "source/source-manifest.json");
    const expectedReceipt = createSkillsbenchLakePairedReceipt(
      rebuilt, reportBytes, manifestBytes);
    if (!serializeSkillsbenchArtifact(expectedReceipt).equals(receiptBytes)) {
      fail("RECEIPT_SOURCE_MISMATCH");
    }
    const reportStatus = lstatSync(checkedPath(root, "report.json"), { bigint: true });
    const receiptStatus = lstatSync(checkedPath(root, "run-receipt.json"), { bigint: true });
    if (receiptStatus.mtimeNs < reportStatus.mtimeNs) fail("RECEIPT_NOT_LAST");
    return deepFreeze({ ok: true,
      verificationLevel: "FULL_MAIN_AND_PR5_INVENTORY_TASK_AND_TRIAL_BYTE_REPLAY",
      report, receipt: expectedReceipt, privateFiles: walked.files.length });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}
