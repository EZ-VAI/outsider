/*
 * AgentTrajectorySentinel bounded paired-recovery quarantine.
 *
 * This adapter replays a revision-pinned 55 source / 55 located-r1 recovery
 * slice.  It is deliberately evaluation-only.  Publisher labels, tool text,
 * and repair outcomes never become Outsider authority, outcome truth, CEU,
 * credit, pricing input, network projection, or any training row.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, renameSync, rmdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const BufferFrom = Buffer.from;
const BufferConcat = Buffer.concat;
const JSONParse = JSON.parse;
const ObjectEntries = Object.entries;
const ObjectFreeze = Object.freeze;
const ObjectKeys = Object.keys;
const ArrayIsArray = Array.isArray;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const PathJoin = path.join;
const PathResolve = path.resolve;
const PathRelative = path.relative;
const TextDecoderConstructor = TextDecoder;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const AGENT_TRAJECTORY_SENTINEL_SCHEMA =
  "outsider/agent-trajectory-sentinel-paired-recovery-quarantine/v2";
export const AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT =
  "040eb2b74aeab2ed420e2979669f80b18f90370f";
export const AGENT_TRAJECTORY_SENTINEL_GITHUB_ROOT_TREE =
  "88789701c1b2ce1a4ebbba7bdab0c03eade41aa2";
export const AGENT_TRAJECTORY_SENTINEL_GITHUB_TRACES_TREE =
  "0e38acb89c621abbc00f90c885e8d19ef34872ed";
export const AGENT_TRAJECTORY_SENTINEL_GITHUB_RETRY_TREE =
  "e7127dd1c51a0385fe20f6f4baa4b34530cb2d90";
export const AGENT_TRAJECTORY_SENTINEL_GITHUB_RESULTS_TREE =
  "342e19f05ca4df9f027c4471d4ee10a05951f89b";
export const AGENT_TRAJECTORY_SENTINEL_GITHUB_TABLES_TREE =
  "6143a454d4285c28173e0d0ee2d9138ef0091c7c";
export const AGENT_TRAJECTORY_SENTINEL_SOURCE_TREE =
  "de3bbdcf97d3fe3586ed48b5d345f0dfa6dfe063";
export const AGENT_TRAJECTORY_SENTINEL_RECOVERY_TREE =
  "c78d211c6999eb47a8556809dbc029f0a5a1761b";
export const AGENT_TRAJECTORY_SENTINEL_HF_REVISION =
  "91daa8406c34ada15e78123f2fc1f51b3380944d";
export const AGENT_TRAJECTORY_SENTINEL_EXPECTED_DATA_BYTES = 1_536_194;
export const AGENT_TRAJECTORY_SENTINEL_EXPECTED_PAIRS = 55;
export const AGENT_TRAJECTORY_SENTINEL_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const REVIEWED_AT = "2026-08-29T08:00:00.000Z";
const DATASET_ID = "sunnydubey1111/agent-trajectory-sentinel";
const SOURCE_CORPUS = "organic_demo7b_cold";
const RECOVERY_RUNG = "located";
const RECOVERY_REP = "1";
const HASH256 = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/u;
const SAFE_TREE_ENTRY_NAME = /^(?!\.{1,2}$)[^/\0]+$/u;
const MAX_FILE_BYTES = 2 * 1024 * 1024;
const REPORT_HASH_DOMAIN =
  "outsider/agent-trajectory-sentinel-quarantine-report/v2";
const RECEIPT_SCHEMA =
  "outsider/agent-trajectory-sentinel-quarantine-run-receipt/v2";
const RECEIPT_HASH_DOMAIN =
  "outsider/agent-trajectory-sentinel-run-receipt/v2";

const SELECTED_NUMBERS = ObjectFreeze([
  1, 2, 10, 15, 16, 17, 18, 19, 22, 28, 29, 32, 33, 35, 39, 44, 45, 46,
  47, 48, 49, 51, 54, 55, 57, 62, 63, 64, 67, 68, 69, 71, 72, 73, 74, 78,
  79, 81, 82, 84, 86, 87, 89, 91, 92, 93, 94, 98, 103, 106, 108, 113,
  115, 116, 119,
]);

export const AGENT_TRAJECTORY_SENTINEL_EPISODE_IDS = ObjectFreeze(
  SELECTED_NUMBERS.map((value) => `organic-demo-${String(value).padStart(3, "0")}`),
);

const PINNED_FILES = ObjectFreeze({
  "raw/source/manifest.json": ObjectFreeze({
    bytes: 39_709,
    gitBlobOid: "cd98ad4d482c7ada42baa4f08522ca5332e91f50",
    sha256: "sha256:976f3945001ff819a02b0a11fca4928e1b7bb7c28b0131e42ecf0dded1447e3e",
  }),
  "raw/repair_policies.csv": ObjectFreeze({
    bytes: 115_955,
    gitBlobOid: "ff5d3c48312e58af2842917c731760f5f0d3f959",
    sha256: "sha256:3a77084aa623ba1a00bb47c63508c5986c2712b37495ee5e0d288aa20092e99f",
  }),
  "rights/github-README.md": ObjectFreeze({
    bytes: 44_530,
    gitBlobOid: "5a6155cd1503ff2e591f3ae5c25008321d9bd305",
    sha256: "sha256:28984c1cfef2eb0d10e226f60049c2e30f98b79a12475b2c9f3f7e3895a3f3d3",
  }),
  "rights/github-DATA_CARD.md": ObjectFreeze({
    bytes: 14_840,
    gitBlobOid: "a6194a9f0eae2e717236d58d34b024147eed72be",
    sha256: "sha256:20006a547dd2fe6e3d1d58a669e1b2a03c357f134eae089fffd0f49d79c4543f",
  }),
  "rights/github-LICENSE": ObjectFreeze({
    bytes: 11_357,
    gitBlobOid: "261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64",
    sha256: "sha256:c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
  }),
  "rights/github-NOTICE": ObjectFreeze({
    bytes: 919,
    gitBlobOid: "0f21ceb3e4020d00ebdff46382cfa790a7a18aa1",
    sha256: "sha256:4d84505c8ad61c5e2ab879898d2408285ebe3ecaa1a79e8b9f917320811fc0a5",
  }),
  "rights/hf-README.md": ObjectFreeze({
    bytes: 21_045,
    sha256: "sha256:07633682e2b65c69b71d9b4e8dbc0c35f4a2b3dd78c9b3e5c970eedde7dd6442",
  }),
  "rights/hf-LICENSING.md": ObjectFreeze({
    bytes: 318,
    sha256: "sha256:f36cdc5301e99c404f2ee505e14e3ce0e69f0155a50f1710b2febebf2bfbf97f",
  }),
});

const METADATA_FILES = ObjectFreeze([
  "github-commit.json",
  "github-root-tree.json",
  "github-traces-tree.json",
  "github-retry-tree.json",
  "github-results-tree.json",
  "github-tables-tree.json",
  "github-source-tree.json",
  "github-recovery-tree.json",
  "hf-revision.json",
]);
const RIGHTS_FILES = ObjectFreeze([
  "github-DATA_CARD.md",
  "github-LICENSE",
  "github-NOTICE",
  "github-README.md",
  "hf-LICENSING.md",
  "hf-README.md",
]);
const RAW_SOURCE_FILES = ObjectFreeze([
  "manifest.json",
  ...AGENT_TRAJECTORY_SENTINEL_EPISODE_IDS.map((id) => `${id}.jsonl`),
]);
const RAW_RECOVERY_FILES = ObjectFreeze(
  AGENT_TRAJECTORY_SENTINEL_EPISODE_IDS.map((id) => `${id}.jsonl`),
);
const EXPECTED_STEP_KEYS = ObjectFreeze([
  "action", "error", "latency_s", "output_tokens", "text", "token_logprobs",
]);
const EXPECTED_CSV_HEADER = ObjectFreeze([
  "dataset", "episode_id", "rung", "rep", "label", "was_correct",
  "now_correct", "now_correct_checks_parser", "resumed_from", "steps_before",
  "steps_after", "model_calls", "checks_flag_before", "checks_flag_after",
]);

function fail(code, detail = null) {
  throw new Error(detail === null
    ? `AGENT_TRAJECTORY_SENTINEL_QUARANTINE_${code}`
    : `AGENT_TRAJECTORY_SENTINEL_QUARANTINE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256(BufferFrom(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function gitObjectOid(type, bytes) {
  const header = BufferFrom(`${type} ${bytes.length}\0`, "utf8");
  return createHash("sha1").update(header).update(bytes).digest("hex");
}

function utf8(bytes, code) {
  try {
    return new TextDecoderConstructor("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(code);
  }
}

function parseJson(bytes, code) {
  try {
    return JSONParse(utf8(bytes, code));
  } catch {
    fail(code);
  }
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== "object" || ArrayIsArray(value)
    || !same(sorted(ObjectKeys(value)), sorted(expected))) fail(code);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return ObjectFreeze(value);
}

function requireDirectory(directory, expectedEntries, snapshots) {
  const target = PathResolve(directory);
  const before = lstatSync(target, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()
    || Number(before.mode & 0o777n) !== 0o700) fail("DIRECTORY_UNSAFE", target);
  const actual = sorted(readdirSync(target));
  if (!same(actual, sorted(expectedEntries))) fail("DIRECTORY_LAYOUT_INVALID", target);
  const after = lstatSync(target, { bigint: true });
  if (before.dev !== after.dev || before.ino !== after.ino
    || before.mode !== after.mode || before.size !== after.size
    || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
    fail("DIRECTORY_CHANGED_DURING_READ", target);
  }
  snapshots.push({ target, dev: after.dev, ino: after.ino, size: after.size,
    mode: after.mode, mtimeNs: after.mtimeNs, ctimeNs: after.ctimeNs,
    directory: true, expectedEntries: sorted(expectedEntries) });
}

function checkedPath(root, relative) {
  if (typeof relative !== "string" || !SAFE_RELATIVE.test(relative)) {
    fail("SOURCE_PATH_INVALID", String(relative));
  }
  const base = PathResolve(root);
  const target = PathResolve(base, relative);
  const relation = PathRelative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("SOURCE_PATH_ESCAPE", relative);
  return target;
}

function readPrivateStable(root, relative, snapshots, expected = null) {
  const target = checkedPath(root, relative);
  const linkStat = lstatSync(target, { bigint: true });
  if (linkStat.isSymbolicLink() || !linkStat.isFile()
    || Number(linkStat.mode & 0o777n) !== 0o600
    || linkStat.size < 1n || linkStat.size > BigInt(MAX_FILE_BYTES)) {
    fail("SOURCE_FILE_UNSAFE", relative);
  }
  let descriptor;
  try {
    descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || Number(before.mode & 0o777n) !== 0o600
      || before.dev !== linkStat.dev || before.ino !== linkStat.ino
      || before.mode !== linkStat.mode
      || before.dev !== after.dev || before.ino !== after.ino
      || before.mode !== after.mode || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || bytes.length !== Number(before.size)) {
      fail("SOURCE_FILE_CHANGED_DURING_READ", relative);
    }
    if (expected && (bytes.length !== expected.bytes || sha256(bytes) !== expected.sha256)) {
      fail("PINNED_FILE_MISMATCH", relative);
    }
    snapshots.push({ target, dev: after.dev, ino: after.ino, size: after.size,
      mode: after.mode, mtimeNs: after.mtimeNs, ctimeNs: after.ctimeNs,
      directory: false, expectedEntries: null });
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function recheckSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    const after = lstatSync(snapshot.target, { bigint: true });
    if (after.isSymbolicLink()
      || (snapshot.directory ? !after.isDirectory() : !after.isFile())
      || after.dev !== snapshot.dev || after.ino !== snapshot.ino
      || after.size !== snapshot.size || after.mode !== snapshot.mode
      || after.mtimeNs !== snapshot.mtimeNs
      || after.ctimeNs !== snapshot.ctimeNs) {
      fail("SOURCE_SNAPSHOT_CHANGED", snapshot.target);
    }
    if (snapshot.directory
      && !same(sorted(readdirSync(snapshot.target)), snapshot.expectedEntries)) {
      fail("SOURCE_SNAPSHOT_LAYOUT_CHANGED", snapshot.target);
    }
  }
}

function readSourceSnapshot(sourceDirectory) {
  const root = PathResolve(sourceDirectory);
  const snapshots = [];
  requireDirectory(root, ["metadata", "raw", "rights"], snapshots);
  requireDirectory(PathJoin(root, "metadata"), METADATA_FILES, snapshots);
  requireDirectory(PathJoin(root, "rights"), RIGHTS_FILES, snapshots);
  requireDirectory(PathJoin(root, "raw"), ["recovery", "repair_policies.csv", "source"], snapshots);
  requireDirectory(PathJoin(root, "raw", "source"), RAW_SOURCE_FILES, snapshots);
  requireDirectory(PathJoin(root, "raw", "recovery"), RAW_RECOVERY_FILES, snapshots);

  const bytes = {};
  for (const name of METADATA_FILES) {
    bytes[`metadata/${name}`] = readPrivateStable(root, `metadata/${name}`, snapshots);
  }
  for (const name of RIGHTS_FILES) {
    const relative = `rights/${name}`;
    bytes[relative] = readPrivateStable(root, relative, snapshots, PINNED_FILES[relative]);
  }
  bytes["raw/source/manifest.json"] = readPrivateStable(root,
    "raw/source/manifest.json", snapshots, PINNED_FILES["raw/source/manifest.json"]);
  bytes["raw/repair_policies.csv"] = readPrivateStable(root,
    "raw/repair_policies.csv", snapshots, PINNED_FILES["raw/repair_policies.csv"]);
  for (const id of AGENT_TRAJECTORY_SENTINEL_EPISODE_IDS) {
    const source = `raw/source/${id}.jsonl`;
    const recovery = `raw/recovery/${id}.jsonl`;
    bytes[source] = readPrivateStable(root, source, snapshots);
    bytes[recovery] = readPrivateStable(root, recovery, snapshots);
  }
  recheckSnapshots(snapshots);
  return bytes;
}

function computeTreeOid(tree, expectedSha, code) {
  exactKeys(tree, ["sha", "url", "tree", "truncated"], `${code}_SCHEMA`);
  if (tree.sha !== expectedSha || tree.truncated !== false || !ArrayIsArray(tree.tree)) {
    fail(`${code}_PIN`);
  }
  const entries = [...tree.tree].sort((left, right) => Buffer.compare(
    BufferFrom(`${left.path}${left.type === "tree" ? "/" : ""}`, "utf8"),
    BufferFrom(`${right.path}${right.type === "tree" ? "/" : ""}`, "utf8"),
  ));
  const chunks = [];
  for (const entry of entries) {
    const isBlob = entry?.type === "blob";
    const isTree = entry?.type === "tree";
    exactKeys(entry, isBlob
      ? ["path", "mode", "type", "sha", "size", "url"]
      : ["path", "mode", "type", "sha", "url"], `${code}_ENTRY_SCHEMA`);
    const expectedMode = isBlob ? "100644" : isTree ? "040000" : null;
    const expectedUrl = `https://api.github.com/repos/${DATASET_ID}/git/${
      isBlob ? "blobs" : "trees"}/${entry.sha}`;
    if (!SAFE_TREE_ENTRY_NAME.test(entry.path) || entry.mode !== expectedMode
      || !SHA1.test(entry.sha) || entry.url !== expectedUrl
      || isBlob && (!NumberIsSafeInteger(entry.size) || entry.size < 1)) {
      fail(`${code}_ENTRY_INVALID`);
    }
    const objectMode = isTree ? "40000" : entry.mode;
    chunks.push(BufferFrom(`${objectMode} ${entry.path}\0`, "utf8"));
    chunks.push(BufferFrom(entry.sha, "hex"));
  }
  const body = BufferConcat(chunks);
  const computed = gitObjectOid("tree", body);
  if (computed !== expectedSha) fail(`${code}_OBJECT_HASH_MISMATCH`);
  return entries;
}

function requireTreeMember(entriesByName, { path: memberPath, type, sha,
  size = undefined }, code) {
  const member = entriesByName.get(memberPath);
  if (!member || member.type !== type || member.sha !== sha
    || size !== undefined && member.size !== size) fail(code, memberPath);
  return member;
}

function entryMap(entries, code) {
  const result = new Map();
  for (const entry of entries) {
    if (result.has(entry.path)) fail(`${code}_DUPLICATE_PATH`, entry.path);
    result.set(entry.path, entry);
  }
  return result;
}

function verifyMetadata(bytes) {
  const commit = parseJson(bytes["metadata/github-commit.json"], "GITHUB_COMMIT_JSON");
  if (commit.sha !== AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT
    || commit.tree?.sha !== AGENT_TRAJECTORY_SENTINEL_GITHUB_ROOT_TREE
    || commit.verification?.verified !== false
    || commit.verification?.reason !== "unsigned") fail("GITHUB_COMMIT_PIN_MISMATCH");

  const rootTree = parseJson(bytes["metadata/github-root-tree.json"],
    "GITHUB_ROOT_TREE_JSON");
  const tracesTree = parseJson(bytes["metadata/github-traces-tree.json"],
    "GITHUB_TRACES_TREE_JSON");
  const retryTree = parseJson(bytes["metadata/github-retry-tree.json"],
    "GITHUB_RETRY_TREE_JSON");
  const resultsTree = parseJson(bytes["metadata/github-results-tree.json"],
    "GITHUB_RESULTS_TREE_JSON");
  const tablesTree = parseJson(bytes["metadata/github-tables-tree.json"],
    "GITHUB_TABLES_TREE_JSON");
  const sourceTree = parseJson(bytes["metadata/github-source-tree.json"],
    "GITHUB_SOURCE_TREE_JSON");
  const recoveryTree = parseJson(bytes["metadata/github-recovery-tree.json"],
    "GITHUB_RECOVERY_TREE_JSON");
  const rootEntries = computeTreeOid(rootTree,
    AGENT_TRAJECTORY_SENTINEL_GITHUB_ROOT_TREE, "ROOT_TREE");
  const tracesEntries = computeTreeOid(tracesTree,
    AGENT_TRAJECTORY_SENTINEL_GITHUB_TRACES_TREE, "TRACES_TREE");
  const retryEntries = computeTreeOid(retryTree,
    AGENT_TRAJECTORY_SENTINEL_GITHUB_RETRY_TREE, "RETRY_TREE");
  const resultsEntries = computeTreeOid(resultsTree,
    AGENT_TRAJECTORY_SENTINEL_GITHUB_RESULTS_TREE, "RESULTS_TREE");
  const tablesEntries = computeTreeOid(tablesTree,
    AGENT_TRAJECTORY_SENTINEL_GITHUB_TABLES_TREE, "TABLES_TREE");
  const sourceEntries = computeTreeOid(sourceTree,
    AGENT_TRAJECTORY_SENTINEL_SOURCE_TREE, "SOURCE_TREE");
  const recoveryEntries = computeTreeOid(recoveryTree,
    AGENT_TRAJECTORY_SENTINEL_RECOVERY_TREE, "RECOVERY_TREE");
  if (sourceEntries.length !== 121 || recoveryEntries.length !== 55) {
    fail("TREE_DENOMINATOR_MISMATCH");
  }
  const rootByName = entryMap(rootEntries, "ROOT_TREE");
  const tracesByName = entryMap(tracesEntries, "TRACES_TREE");
  const retryByName = entryMap(retryEntries, "RETRY_TREE");
  const resultsByName = entryMap(resultsEntries, "RESULTS_TREE");
  const tablesByName = entryMap(tablesEntries, "TABLES_TREE");
  const sourceByName = entryMap(sourceEntries, "SOURCE_TREE");
  const recoveryByName = entryMap(recoveryEntries, "RECOVERY_TREE");

  requireTreeMember(rootByName, { path: "traces", type: "tree",
    sha: AGENT_TRAJECTORY_SENTINEL_GITHUB_TRACES_TREE },
  "ROOT_TO_TRACES_MEMBERSHIP_MISMATCH");
  requireTreeMember(tracesByName, { path: SOURCE_CORPUS, type: "tree",
    sha: AGENT_TRAJECTORY_SENTINEL_SOURCE_TREE },
  "TRACES_TO_SOURCE_MEMBERSHIP_MISMATCH");
  requireTreeMember(tracesByName, { path: `${SOURCE_CORPUS}_retry`, type: "tree",
    sha: AGENT_TRAJECTORY_SENTINEL_GITHUB_RETRY_TREE },
  "TRACES_TO_RETRY_MEMBERSHIP_MISMATCH");
  requireTreeMember(retryByName, { path: `${RECOVERY_RUNG}-r${RECOVERY_REP}`,
    type: "tree", sha: AGENT_TRAJECTORY_SENTINEL_RECOVERY_TREE },
  "RETRY_TO_RECOVERY_MEMBERSHIP_MISMATCH");
  requireTreeMember(rootByName, { path: "results", type: "tree",
    sha: AGENT_TRAJECTORY_SENTINEL_GITHUB_RESULTS_TREE },
  "ROOT_TO_RESULTS_MEMBERSHIP_MISMATCH");
  requireTreeMember(resultsByName, { path: "tables", type: "tree",
    sha: AGENT_TRAJECTORY_SENTINEL_GITHUB_TABLES_TREE },
  "RESULTS_TO_TABLES_MEMBERSHIP_MISMATCH");
  requireTreeMember(tablesByName, { path: "repair_policies.csv", type: "blob",
    sha: PINNED_FILES["raw/repair_policies.csv"].gitBlobOid,
    size: PINNED_FILES["raw/repair_policies.csv"].bytes },
  "TABLES_TO_REPAIR_CSV_MEMBERSHIP_MISMATCH");
  for (const [name, relative] of [
    ["README.md", "rights/github-README.md"],
    ["DATA_CARD.md", "rights/github-DATA_CARD.md"],
    ["LICENSE", "rights/github-LICENSE"],
    ["NOTICE", "rights/github-NOTICE"],
  ]) {
    requireTreeMember(rootByName, { path: name, type: "blob",
      sha: PINNED_FILES[relative].gitBlobOid, size: PINNED_FILES[relative].bytes },
    "ROOT_RIGHTS_BLOB_MEMBERSHIP_MISMATCH");
  }
  const manifestEntry = sourceByName.get("manifest.json");
  if (!manifestEntry || manifestEntry.size !== PINNED_FILES["raw/source/manifest.json"].bytes
    || manifestEntry.sha !== PINNED_FILES["raw/source/manifest.json"].gitBlobOid) {
    fail("SOURCE_MANIFEST_TREE_BINDING_MISMATCH");
  }
  for (const id of AGENT_TRAJECTORY_SENTINEL_EPISODE_IDS) {
    const name = `${id}.jsonl`;
    if (!sourceByName.has(name) || !recoveryByName.has(name)) {
      fail("PAIR_TREE_PATH_MISSING", name);
    }
  }
  if (!same(sorted([...recoveryByName.keys()]), RAW_RECOVERY_FILES)) {
    fail("RECOVERY_TREE_EXACT_SET_MISMATCH");
  }

  const hf = parseJson(bytes["metadata/hf-revision.json"], "HF_REVISION_JSON");
  if (hf.id !== DATASET_ID || hf.sha !== AGENT_TRAJECTORY_SENTINEL_HF_REVISION
    || hf.private !== false || hf.gated !== false || hf.disabled !== false
    || hf.cardData?.license !== "other"
    || hf.cardData?.license_name !== "mixed-see-licensing") {
    fail("HF_REVISION_PIN_MISMATCH");
  }
  return { commit, hf, rootEntries, tracesEntries, retryEntries, resultsEntries,
    tablesEntries, sourceEntries, recoveryEntries, sourceByName, recoveryByName };
}

function verifyBlob(bytes, entry, code) {
  if (bytes.length !== entry.size || gitObjectOid("blob", bytes) !== entry.sha) fail(code);
}

function parseJsonl(bytes, relative) {
  const text = utf8(bytes, "TRACE_UTF8_INVALID");
  if (text.includes("\r")) fail("TRACE_LINE_ENDING_INVALID", relative);
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  const lines = body.split("\n");
  if (lines.length < 1 || lines.length > 64 || lines.some((line) => line.length === 0)) {
    fail("TRACE_LINE_COUNT_INVALID", relative);
  }
  return lines.map((line, index) => {
    let step;
    try { step = JSONParse(line); } catch { fail("TRACE_JSON_INVALID", `${relative}:${index}`); }
    exactKeys(step, EXPECTED_STEP_KEYS, "TRACE_STEP_SCHEMA_INVALID");
    if (typeof step.text !== "string" || typeof step.action !== "string"
      || typeof step.error !== "boolean" || !NumberIsFinite(step.latency_s)
      || step.latency_s < 0 || !NumberIsSafeInteger(step.output_tokens)
      || step.output_tokens < 0 || !ArrayIsArray(step.token_logprobs)
      || step.token_logprobs.some((value) => !NumberIsFinite(value))) {
      fail("TRACE_STEP_VALUE_INVALID", `${relative}:${index}`);
    }
    return step;
  });
}

function parseCsv(bytes) {
  const input = utf8(bytes, "CSV_UTF8_INVALID");
  if (input.includes("\r")) fail("CSV_LINE_ENDING_INVALID");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(field); field = ""; }
    else if (character === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += character;
  }
  if (quoted || field !== "" || row.length !== 0 || rows.length !== 1_156) {
    fail("CSV_SHAPE_INVALID");
  }
  const header = rows.shift();
  if (!same(header, EXPECTED_CSV_HEADER)) fail("CSV_HEADER_INVALID");
  const records = rows.map((values) => {
    if (values.length !== header.length) fail("CSV_ROW_WIDTH_INVALID");
    return Object.fromEntries(header.map((name, index) => [name, values[index]]));
  });
  return records;
}

function strictInteger(value, code) {
  if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) fail(code);
  const number = Number(value);
  if (!NumberIsSafeInteger(number)) fail(code);
  return number;
}

function strictBoolean(value, code) {
  if (value === "True") return true;
  if (value === "False") return false;
  fail(code);
}

function scanBytes(objects) {
  const patterns = {
    secrets: [
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/giu,
      /\bAKIA[0-9A-Z]{16}\b/gu,
      /\bgh[pousr]_[A-Za-z0-9]{30,}\b/gu,
      /\bsk-[A-Za-z0-9_-]{20,}\b/gu,
      /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/giu,
    ],
    pii: [
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu,
      /\b(?:[0-9]{3}-[0-9]{2}-[0-9]{4})\b/gu,
    ],
  };
  let secretPatternHits = 0;
  let highConfidencePiiPatternHits = 0;
  for (const bytes of objects) {
    const text = utf8(bytes, "SCAN_UTF8_INVALID");
    for (const expression of patterns.secrets) {
      expression.lastIndex = 0;
      while (expression.exec(text)) secretPatternHits += 1;
    }
    for (const expression of patterns.pii) {
      expression.lastIndex = 0;
      while (expression.exec(text)) highConfidencePiiPatternHits += 1;
    }
  }
  return { objectsScanned: objects.length, secretPatternHits,
    highConfidencePiiPatternHits,
    heuristicNotGuarantee: true,
    reviewDecision: secretPatternHits === 0 && highConfidencePiiPatternHits === 0
      ? "NO_HIGH_CONFIDENCE_SECRET_OR_PII_PATTERN_HITS"
      : "MANUAL_PRIVACY_REVIEW_REQUIRED" };
}

function rightsReview(bytes, metadata) {
  const githubReadme = utf8(bytes["rights/github-README.md"], "GITHUB_README_UTF8");
  const dataCard = utf8(bytes["rights/github-DATA_CARD.md"], "DATA_CARD_UTF8");
  const notice = utf8(bytes["rights/github-NOTICE"], "NOTICE_UTF8");
  const hfReadme = utf8(bytes["rights/hf-README.md"], "HF_README_UTF8");
  const hfLicensing = utf8(bytes["rights/hf-LICENSING.md"], "HF_LICENSING_UTF8");
  const intendedUsePhrase = "These traces exist to evaluate monitors, not to train agents.";
  if (!githubReadme.includes("DATA_CARD.md") || !dataCard.includes(intendedUsePhrase)
    || !hfReadme.includes(intendedUsePhrase)
    || !notice.includes("licence cannot grant rights the licensor never held")
    || !hfLicensing.includes("recorded model output carries the terms")) {
    fail("RIGHTS_EVIDENCE_PHRASE_MISSING");
  }
  const qwen7b = /\| `qwen2\.5:7b` \| 2,648 \|/u.test(dataCard) ? 2_648 : null;
  const qwen3b = /\| `qwen2\.5:3b` \| 357 \|/u.test(dataCard) ? 357 : null;
  const licensingCount = /\*\*`qwen2\.5:7b`, `qwen2\.5:3b`\*\* \(2,247 episodes\)/u
    .test(dataCard) ? 2_247 : null;
  if (qwen7b === null || qwen3b === null || licensingCount === null) {
    fail("QWEN_COUNT_EVIDENCE_MISSING");
  }
  const evidence = RIGHTS_FILES.map((name) => {
    const relative = `rights/${name}`;
    return { path: relative, bytes: bytes[relative].length, sha256: sha256(bytes[relative]) };
  });
  return {
    hfRevision: metadata.hf.sha,
    hfCardLicense: metadata.hf.cardData.license,
    hfCardLicenseName: metadata.hf.cardData.license_name,
    intendedUse: "EVALUATE_MONITORS_NOT_TRAIN_AGENTS",
    trainingUseAllowed: false,
    recordedOutputCoveredByRepositoryApacheLicense: false,
    modelOutputTermsRequirePerCorpusReview: true,
    qwenEpisodeCountCrosscheck: {
      tableQwen7b: qwen7b,
      tableQwen3b: qwen3b,
      tableTotal: qwen7b + qwen3b,
      licensingParagraphTotal: licensingCount,
      reconciled: qwen7b + qwen3b === licensingCount,
      unresolvedDifference: qwen7b + qwen3b - licensingCount,
    },
    rightsGate: "FAIL_CLOSED",
    reasons: [
      "PUBLISHER_INTENDED_USE_EXCLUDES_AGENT_TRAINING",
      "MIXED_LICENSE_RECORDED_MODEL_OUTPUT_AND_TOOL_RESULTS",
      "QWEN_EPISODE_COUNT_CONTRADICTION_UNRESOLVED",
    ],
    evidenceRoot: digest("outsider/agent-trajectory-sentinel-rights-evidence/v1", evidence),
    evidence,
  };
}

function buildReport(bytes) {
  const metadata = verifyMetadata(bytes);
  const sourceManifestBytes = bytes["raw/source/manifest.json"];
  const csvBytes = bytes["raw/repair_policies.csv"];
  verifyBlob(sourceManifestBytes, metadata.sourceByName.get("manifest.json"),
    "SOURCE_MANIFEST_BLOB_MISMATCH");
  if (gitObjectOid("blob", csvBytes) !== PINNED_FILES["raw/repair_policies.csv"].gitBlobOid) {
    fail("REPAIR_CSV_BLOB_MISMATCH");
  }
  const manifest = parseJson(sourceManifestBytes, "SOURCE_MANIFEST_JSON");
  const manifestKeys = sorted(ObjectKeys(manifest));
  if (manifestKeys.length !== 120
    || !same(manifestKeys, sorted(Array.from({ length: 120 }, (_value, index) => String(index))))) {
    fail("SOURCE_MANIFEST_DENOMINATOR_INVALID");
  }
  const csvRecords = parseCsv(csvBytes);
  const selectedRows = csvRecords.filter((row) => row.dataset === SOURCE_CORPUS
    && row.rung === RECOVERY_RUNG && row.rep === RECOVERY_REP);
  if (selectedRows.length !== AGENT_TRAJECTORY_SENTINEL_EXPECTED_PAIRS) {
    fail("REPAIR_CSV_DENOMINATOR_INVALID");
  }
  const rowById = new Map();
  for (const row of selectedRows) {
    if (rowById.has(row.episode_id)) fail("REPAIR_CSV_DUPLICATE_EPISODE");
    rowById.set(row.episode_id, row);
  }
  if (!same(sorted([...rowById.keys()]), AGENT_TRAJECTORY_SENTINEL_EPISODE_IDS)) {
    fail("REPAIR_CSV_EPISODE_SET_INVALID");
  }

  const inventory = [];
  const pairs = [];
  const scanObjects = [sourceManifestBytes, csvBytes];
  let sourceBytes = 0;
  let recoveryBytes = 0;
  let nowCorrectTrue = 0;
  let nowCorrectFalse = 0;
  const labelCounts = {};
  for (const id of AGENT_TRAJECTORY_SENTINEL_EPISODE_IDS) {
    const name = `${id}.jsonl`;
    const sourceRelative = `raw/source/${name}`;
    const recoveryRelative = `raw/recovery/${name}`;
    const sourceRaw = bytes[sourceRelative];
    const recoveryRaw = bytes[recoveryRelative];
    const sourceEntry = metadata.sourceByName.get(name);
    const recoveryEntry = metadata.recoveryByName.get(name);
    verifyBlob(sourceRaw, sourceEntry, "SOURCE_TRACE_BLOB_MISMATCH");
    verifyBlob(recoveryRaw, recoveryEntry, "RECOVERY_TRACE_BLOB_MISMATCH");
    const sourceSteps = parseJsonl(sourceRaw, sourceRelative);
    const recoverySteps = parseJsonl(recoveryRaw, recoveryRelative);
    const row = rowById.get(id);
    const number = String(Number(id.slice(-3)));
    const manifestRow = manifest[number];
    if (!manifestRow || manifestRow.episode_id !== id || manifestRow.file !== name
      || manifestRow.model !== "qwen2.5:7b" || manifestRow.temperature !== 0.2
      || manifestRow.failure_class !== null || manifestRow.tau !== null
      || manifestRow.has_logprobs !== true || manifestRow.T !== sourceSteps.length) {
      fail("SOURCE_MANIFEST_PAIR_MISMATCH", id);
    }
    const resumedFrom = strictInteger(row.resumed_from, "CSV_RESUMED_FROM_INVALID");
    const stepsBefore = strictInteger(row.steps_before, "CSV_STEPS_BEFORE_INVALID");
    const stepsAfter = strictInteger(row.steps_after, "CSV_STEPS_AFTER_INVALID");
    const modelCalls = strictInteger(row.model_calls, "CSV_MODEL_CALLS_INVALID");
    const wasCorrect = strictBoolean(row.was_correct, "CSV_WAS_CORRECT_INVALID");
    const nowCorrect = strictBoolean(row.now_correct, "CSV_NOW_CORRECT_INVALID");
    const parserCorrect = strictBoolean(row.now_correct_checks_parser,
      "CSV_PARSER_CORRECT_INVALID");
    const checkBefore = strictBoolean(row.checks_flag_before, "CSV_CHECK_BEFORE_INVALID");
    const checkAfter = strictBoolean(row.checks_flag_after, "CSV_CHECK_AFTER_INVALID");
    if (wasCorrect !== false || nowCorrect !== parserCorrect || checkBefore !== true
      || checkAfter !== !nowCorrect
      || stepsBefore !== sourceSteps.length || stepsAfter !== recoverySteps.length
      || resumedFrom < 1 || resumedFrom > Math.min(stepsBefore, stepsAfter)
      || modelCalls !== stepsAfter - resumedFrom
      || !same(sourceSteps.slice(0, resumedFrom), recoverySteps.slice(0, resumedFrom))) {
      fail("PAIR_REPLAY_INCONSISTENT", id);
    }
    if (nowCorrect) nowCorrectTrue += 1; else nowCorrectFalse += 1;
    labelCounts[row.label] = (labelCounts[row.label] ?? 0) + 1;
    const sourceHash = sha256(sourceRaw);
    const recoveryHash = sha256(recoveryRaw);
    inventory.push({ path: sourceRelative, bytes: sourceRaw.length,
      sha256: sourceHash, gitBlobOid: sourceEntry.sha });
    inventory.push({ path: recoveryRelative, bytes: recoveryRaw.length,
      sha256: recoveryHash, gitBlobOid: recoveryEntry.sha });
    pairs.push({ episodeId: id, sourceHash, recoveryHash,
      sourceSteps: sourceSteps.length, recoverySteps: recoverySteps.length,
      resumedFrom, publisherLabel: row.label, publisherNowCorrect: nowCorrect });
    sourceBytes += sourceRaw.length;
    recoveryBytes += recoveryRaw.length;
    scanObjects.push(sourceRaw, recoveryRaw);
  }
  if (nowCorrectTrue !== 24 || nowCorrectFalse !== 31
    || !same(labelCounts, { arithmetic_error: 37, incomplete: 13, hallucinated: 5 })) {
    fail("REPLAYED_OUTCOME_COUNTS_MISMATCH");
  }
  const rawDataBytes = sourceBytes + recoveryBytes
    + sourceManifestBytes.length + csvBytes.length;
  if (sourceBytes !== 675_606 || recoveryBytes !== 704_924
    || rawDataBytes !== AGENT_TRAJECTORY_SENTINEL_EXPECTED_DATA_BYTES) {
    fail("RAW_DATA_BYTE_DENOMINATOR_MISMATCH");
  }
  inventory.push({ path: "raw/source/manifest.json", bytes: sourceManifestBytes.length,
    sha256: sha256(sourceManifestBytes),
    gitBlobOid: PINNED_FILES["raw/source/manifest.json"].gitBlobOid });
  inventory.push({ path: "raw/repair_policies.csv", bytes: csvBytes.length,
    sha256: sha256(csvBytes),
    gitBlobOid: PINNED_FILES["raw/repair_policies.csv"].gitBlobOid });
  inventory.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  pairs.sort((left, right) => left.episodeId < right.episodeId ? -1 : 1);
  const privacy = scanBytes(scanObjects);
  const rights = rightsReview(bytes, metadata);
  const metadataInventory = METADATA_FILES.map((name) => ({
    path: `metadata/${name}`,
    bytes: bytes[`metadata/${name}`].length,
    sha256: sha256(bytes[`metadata/${name}`]),
  }));
  const body = {
    schema: AGENT_TRAJECTORY_SENTINEL_SCHEMA,
    datasetId: DATASET_ID,
    reviewedAt: REVIEWED_AT,
    disposition: AGENT_TRAJECTORY_SENTINEL_DISPOSITION,
    sourcePins: {
      githubCommit: AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT,
      githubRootTree: AGENT_TRAJECTORY_SENTINEL_GITHUB_ROOT_TREE,
      githubTracesTree: AGENT_TRAJECTORY_SENTINEL_GITHUB_TRACES_TREE,
      githubRetryTree: AGENT_TRAJECTORY_SENTINEL_GITHUB_RETRY_TREE,
      githubResultsTree: AGENT_TRAJECTORY_SENTINEL_GITHUB_RESULTS_TREE,
      githubTablesTree: AGENT_TRAJECTORY_SENTINEL_GITHUB_TABLES_TREE,
      sourceTree: AGENT_TRAJECTORY_SENTINEL_SOURCE_TREE,
      recoveryTree: AGENT_TRAJECTORY_SENTINEL_RECOVERY_TREE,
      githubTreeAncestryVerified: true,
      githubCommitSignatureVerified: false,
      githubCommitSignatureReason: "unsigned",
      huggingFaceRevision: AGENT_TRAJECTORY_SENTINEL_HF_REVISION,
      huggingFaceUse: "CARD_AND_LICENSING_CROSSCHECK_ONLY",
      huggingFaceTracePayloadObjectsFetched: 0,
    },
    boundedSlice: {
      sourceCorpus: SOURCE_CORPUS,
      recoveryRung: RECOVERY_RUNG,
      recoveryReplication: Number(RECOVERY_REP),
      sourceEpisodes: pairs.length,
      recoveryEpisodes: pairs.length,
      pairedEpisodes: pairs.length,
      sourceTraceBytes: sourceBytes,
      recoveryTraceBytes: recoveryBytes,
      sourceManifestBytes: sourceManifestBytes.length,
      repairPolicyCsvBytes: csvBytes.length,
      rawDataObjects: inventory.length,
      rawDataBytes,
      allSourceRowsReplayed: true,
      allRecoveryRowsReplayed: true,
      prefixPairingReplayed: true,
      pairingRoot: digest("outsider/agent-trajectory-sentinel-pairing/v1", pairs),
      sourceRoot: digest("outsider/agent-trajectory-sentinel-source-inventory/v1", inventory),
    },
    replayedPublisherClaims: {
      publisherNowCorrectTrue: nowCorrectTrue,
      publisherNowCorrectFalse: nowCorrectFalse,
      denominator: pairs.length,
      publisherLabelCounts: labelCounts,
      authorityStatus: "PUBLISHER_CLAIM_ONLY_NOT_OUTCOME_TRUTH",
      externalAffectedPartyOutcomeObserved: false,
      longitudinalRecoveryObserved: false,
    },
    rights,
    privacy,
    inventory,
    metadataInventory,
    useBoundary: {
      evaluationOnlyPairs: pairs.length,
      admittedEpisodeRows: 0,
      offlineResearchTrainingRows: 0,
      productionTrainingRows: 0,
      networkAdmissionRows: 0,
      networkProjectionRows: 0,
      rawTraceProjectionRows: 0,
      CEU: 0,
      creditUnits: 0,
      pricingRows: 0,
      authorityUnits: 0,
      actionRows: 0,
      fundsMoved: false,
      remoteActionEnabled: false,
      physicalActionEnabled: false,
      trainingDecision: "KEEP_BASELINE_RIGHTS_FAIL_CLOSED_ZERO_TRAINING_ROWS",
    },
    limitations: [
      "RECORDED_AGENT_TOOL_TRACES_NOT_REAL_EXTERNAL_EFFECT",
      "PUBLISHER_NOW_CORRECT_IS_NOT_INDEPENDENT_OUTCOME_TRUTH",
      "NO_AFFECTED_PARTY_LONGITUDINAL_RECOVERY",
      "UNSIGNED_GITHUB_COMMIT_PROVENANCE",
      "HEURISTIC_PRIVACY_SCAN_IS_NOT_A_PRIVACY_GUARANTEE",
    ],
  };
  return deepFreeze({ ...body,
    reportHash: digest(REPORT_HASH_DOMAIN, body) });
}

export function buildAgentTrajectorySentinelQuarantineFromDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length === 0) {
    fail("SOURCE_DIRECTORY_REQUIRED");
  }
  return buildReport(readSourceSnapshot(sourceDirectory));
}

function canonicalSnapshot(value) {
  return JSONParse(canonicalizeStrict(value));
}

function safeError(error) {
  return error instanceof Error && typeof error.message === "string"
    ? error.message : "AGENT_TRAJECTORY_SENTINEL_QUARANTINE_UNSAFE_INPUT";
}

export function verifyAgentTrajectorySentinelQuarantine(record, options = undefined) {
  try {
    const snapshot = canonicalSnapshot(record);
    const optionSnapshot = canonicalSnapshot(options);
    exactKeys(optionSnapshot, ["sourceDirectory"], "VERIFY_OPTIONS_INVALID");
    if (snapshot.schema !== AGENT_TRAJECTORY_SENTINEL_SCHEMA
      || !HASH256.test(snapshot.reportHash)) fail("REPORT_SCHEMA_INVALID");
    const reportBody = { ...snapshot };
    delete reportBody.reportHash;
    if (digest(REPORT_HASH_DOMAIN, reportBody)
      !== snapshot.reportHash) fail("REPORT_SELF_HASH_INVALID");
    const rebuilt = buildAgentTrajectorySentinelQuarantineFromDirectory(
      optionSnapshot.sourceDirectory,
    );
    if (!same(snapshot, rebuilt)) fail("SOURCE_REPLAY_MISMATCH");
    return ObjectFreeze({ ok: true, reportHash: rebuilt.reportHash,
      sourceRoot: rebuilt.boundedSlice.sourceRoot,
      pairingRoot: rebuilt.boundedSlice.pairingRoot,
      disposition: rebuilt.disposition,
      pairedEpisodes: rebuilt.boundedSlice.pairedEpisodes,
      sourceEpisodesReplayed: rebuilt.boundedSlice.sourceEpisodes,
      recoveryEpisodesReplayed: rebuilt.boundedSlice.recoveryEpisodes,
      rawDataBytes: rebuilt.boundedSlice.rawDataBytes,
      publisherNowCorrectTrue: rebuilt.replayedPublisherClaims.publisherNowCorrectTrue,
      publisherNowCorrectFalse: rebuilt.replayedPublisherClaims.publisherNowCorrectFalse,
      admittedEpisodeRows: 0, offlineResearchTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      networkProjectionRows: 0, CEU: 0, authorityUnits: 0 });
  } catch (error) {
    return ObjectFreeze({ ok: false, error: safeError(error) });
  }
}

export function publishAgentTrajectorySentinelArtifactDirectory(stagingDirectory,
  targetDirectory) {
  if (typeof stagingDirectory !== "string" || typeof targetDirectory !== "string"
    || stagingDirectory.length === 0 || targetDirectory.length === 0) {
    fail("PUBLISH_DIRECTORY_REQUIRED");
  }
  const staging = PathResolve(stagingDirectory);
  const target = PathResolve(targetDirectory);
  if (staging === target || path.dirname(staging) !== path.dirname(target)) {
    fail("PUBLISH_DIRECTORIES_MUST_BE_DISTINCT_SIBLINGS");
  }
  const stagingStat = lstatSync(staging, { bigint: true });
  if (!stagingStat.isDirectory() || stagingStat.isSymbolicLink()
    || Number(stagingStat.mode & 0o777n) !== 0o700
    || !same(sorted(readdirSync(staging)), ["report.json", "run-receipt.json", "source"])) {
    fail("PUBLISH_STAGING_UNSAFE");
  }
  try {
    mkdirSync(target, { mode: 0o700 });
    chmodSync(target, 0o700);
  } catch {
    fail("TARGET_CLAIM_FAILED", target);
  }
  const targetStat = lstatSync(target, { bigint: true });
  if (!targetStat.isDirectory() || targetStat.isSymbolicLink()
    || Number(targetStat.mode & 0o777n) !== 0o700) fail("TARGET_CLAIM_UNSAFE");
  try {
    renameSync(PathJoin(staging, "source"), PathJoin(target, "source"));
    renameSync(PathJoin(staging, "report.json"), PathJoin(target, "report.json"));
    /* Receipt moves last and is the completion marker. */
    renameSync(PathJoin(staging, "run-receipt.json"),
      PathJoin(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch {
    fail("TARGET_PUBLISH_FAILED", target);
  }
  return target;
}

export function verifyAgentTrajectorySentinelArtifactDirectory(artifactDirectory) {
  try {
    if (typeof artifactDirectory !== "string" || artifactDirectory.length === 0) {
      fail("ARTIFACT_DIRECTORY_REQUIRED");
    }
    const root = PathResolve(artifactDirectory);
    const snapshots = [];
    requireDirectory(root, ["report.json", "run-receipt.json", "source"], snapshots);
    const reportBytes = readPrivateStable(root, "report.json", snapshots);
    const receiptBytes = readPrivateStable(root, "run-receipt.json", snapshots);
    const report = parseJson(reportBytes, "REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "RECEIPT_JSON_INVALID");
    const checked = verifyAgentTrajectorySentinelQuarantine(report,
      { sourceDirectory: PathJoin(root, "source") });
    const receiptBody = { ...receipt };
    delete receiptBody.receiptHash;
    const expectedReceiptBody = {
      schema: RECEIPT_SCHEMA,
      datasetId: DATASET_ID,
      githubCommit: AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT,
      huggingFaceRevision: AGENT_TRAJECTORY_SENTINEL_HF_REVISION,
      disposition: AGENT_TRAJECTORY_SENTINEL_DISPOSITION,
      reportHash: report.reportHash,
      reportFileSha256: sha256(reportBytes),
      sourceRoot: report.boundedSlice.sourceRoot,
      pairingRoot: report.boundedSlice.pairingRoot,
      pairedEpisodes: report.boundedSlice.pairedEpisodes,
      sourceEpisodesReplayed: report.boundedSlice.sourceEpisodes,
      recoveryEpisodesReplayed: report.boundedSlice.recoveryEpisodes,
      rawDataObjects: report.boundedSlice.rawDataObjects,
      rawDataBytes: report.boundedSlice.rawDataBytes,
      publisherNowCorrectTrue: report.replayedPublisherClaims.publisherNowCorrectTrue,
      publisherNowCorrectFalse: report.replayedPublisherClaims.publisherNowCorrectFalse,
      trainingRows: 0,
      networkAdmissionRows: 0,
      networkProjectionRows: 0,
      CEU: 0,
      authorityUnits: 0,
    };
    const expectedReceiptHash = sha256(BufferFrom(
      `${RECEIPT_HASH_DOMAIN}\0${
        canonicalizeStrict(expectedReceiptBody)}`, "utf8"));
    if (!checked.ok || !same(receiptBody, expectedReceiptBody)
      || receipt.receiptHash !== expectedReceiptHash) {
      fail("ARTIFACT_RECEIPT_MISMATCH");
    }
    recheckSnapshots(snapshots);
    return ObjectFreeze({ ...checked, receiptHash: receipt.receiptHash,
      reportFileSha256: receipt.reportFileSha256 });
  } catch (error) {
    return ObjectFreeze({ ok: false, error: safeError(error) });
  }
}
