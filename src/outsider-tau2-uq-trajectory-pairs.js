/*
 * Complete τ2-bench UQ trajectory subset at one fixed public revision.
 *
 * Six trajectory files cover the same 278 domain/task units under two agent
 * model configurations.  Token-level logprob files are fully inventoried but
 * deliberately not acquired (1.65 GB).  Raw tasks, messages, tool payloads,
 * answers, and UQ values stay private; reports contain only replayed aggregates
 * and hashes.  Publisher rewards remain simulated evaluator outcomes.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const BufferFrom = Buffer.from;
const JSONParse = JSON.parse;
const PathJoin = path.join;
const PathRelative = path.relative;
const PathResolve = path.resolve;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const TAU2_UQ_TRAJECTORY_SCHEMA =
  "outsider/tau2-uq-trajectory-pairs/v1";
export const TAU2_UQ_TRAJECTORY_RECEIPT_SCHEMA =
  "outsider/tau2-uq-trajectory-pairs-receipt/v1";
export const TAU2_UQ_DATASET_ID = "changdae/tau2-uq-artifacts";
export const TAU2_UQ_REVISION = "3c2543920c8fe915fb1c46b3b5aba25b01f9daa6";
export const TAU2_UQ_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/tau2-uq-trajectory-pairs-report/v1";
const RECEIPT_DOMAIN = "outsider/tau2-uq-trajectory-pairs-receipt/v1";
const MANIFEST_DOMAIN = "outsider/tau2-uq-trajectory-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/tau2-uq-trajectory-source-root/v1";
const TREE_DOMAIN = "outsider/tau2-uq-tree/v1";
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_OBJECT_BYTES = 20 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;

const OBJECTS = Object.freeze([
  Object.freeze({ path: "README.md", bytes: 6_139,
    oid: "5b5618f809f7aadf641161ad34da079f4375070a", lfsSha256: null }),
  Object.freeze({ path: "trajectories/Kimi-K2.5_airline.json", bytes: 3_693_788,
    oid: "05df9a66be34bb824652763a26e1bacd1f53d126", lfsSha256: null }),
  Object.freeze({ path: "trajectories/Kimi-K2.5_retail.json", bytes: 8_416_693,
    oid: "b0a1458b9a828921a9df098c9dec3a6026002638", lfsSha256: null }),
  Object.freeze({ path: "trajectories/Kimi-K2.5_telecom.json", bytes: 14_844_993,
    oid: "e1772d64c20b5e3699be3f144f6371bfe3c209bd",
    lfsSha256: "sha256:0ba7cc1b3b754eddd197ddb72fd47b86c837c15187054fade2b3a9ebd47465cb" }),
  Object.freeze({ path: "trajectories/gpt41_kimik25_airline.json", bytes: 3_279_051,
    oid: "ddb8293b5695532bf484726641cd18e4393436aa", lfsSha256: null }),
  Object.freeze({ path: "trajectories/gpt41_kimik25_retail.json", bytes: 7_947_099,
    oid: "80b57fd55e0891c916ad8a7b3f10f740e9e3bca8", lfsSha256: null }),
  Object.freeze({ path: "trajectories/gpt41_kimik25_telecom.json", bytes: 13_986_415,
    oid: "df9a4f5c02489031ca27a74dafbbfe9a04b7f6e4",
    lfsSha256: "sha256:aa3a550cc418289c1895c6673b046f1807fff7ab8d26b491e0b0ed5dea6bbb90" }),
]);

export const TAU2_UQ_SOURCE_OBJECTS = OBJECTS;

const TREE_PROFILE = Object.freeze({
  entries: 568,
  files: 564,
  directories: 4,
  logicalBytes: 1_704_355_614,
  selectedObjects: 7,
  selectedBytes: 52_174_178,
  logprobFiles: 556,
  logprobBytes: 1_652_177_550,
  attributesBytes: 3_886,
  projectionHash:
    "sha256:cb123bf11cdf3d557cc3da356f0828e2e501fe0c7c3b29eae7ba0b6ec8dc9cea",
});
const TREE_PAGE_COUNT = 6;
const treePageName = (phase, page, suffix) =>
  `full-tree-${phase}-page-${String(page).padStart(3, "0")}.${suffix}`;
const METADATA_FILES = Object.freeze([
  "dataset-record-after.json", "dataset-record-before.json",
  ...["after", "before"].flatMap((phase) =>
    Array.from({ length: TREE_PAGE_COUNT }, (_, index) => [
      treePageName(phase, index + 1, "json"),
      treePageName(phase, index + 1, "headers"),
    ]).flat()),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `TAU2_UQ_${code}` : `TAU2_UQ_${code}:${detail}`);
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
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function parseJson(bytes, code) {
  try {
    return JSONParse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(code);
  }
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
  } finally {
    closeSync(descriptor);
  }
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
    else if (child.isFile() && Number(child.mode & 0o777n) === 0o600) result.push(relative);
    else fail("SOURCE_ENTRY_UNSAFE", relative);
  }
  return result;
}

function recordProjection(bytes) {
  const record = parseJson(bytes, "DATASET_RECORD_JSON_INVALID");
  const siblings = Array.isArray(record.siblings)
    ? sorted(record.siblings.map((entry) => entry?.rfilename)) : [];
  const projection = {
    id: record.id,
    revision: record.sha,
    private: record.private,
    gated: record.gated,
    disabled: record.disabled,
    usedStorage: record.usedStorage,
    lastModified: record.lastModified,
    siblingCount: siblings.length,
    siblings,
    cardLicense: record.cardData?.license ?? null,
    licenseTagPresent: Array.isArray(record.tags) && record.tags.includes("license:mit"),
  };
  if (projection.id !== TAU2_UQ_DATASET_ID || projection.revision !== TAU2_UQ_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false || projection.usedStorage !== 430_489_452
    || projection.siblingCount !== TREE_PROFILE.files
    || projection.cardLicense !== "mit" || projection.licenseTagPresent !== true) {
    fail("DATASET_RECORD_INVALID");
  }
  return projection;
}

function treeProjection(tree) {
  if (!Array.isArray(tree)) fail("TREE_INVALID");
  const projection = tree.map((entry) => ({
    path: entry?.path,
    type: entry?.type,
    oid: entry?.oid,
    bytes: entry?.size,
    lfsSha256: entry?.lfs?.oid ? `sha256:${entry.lfs.oid}` : null,
    lfsBytes: entry?.lfs?.size ?? null,
  })).sort((left, right) => left.path < right.path ? -1 : 1);
  const files = projection.filter((entry) => entry.type === "file");
  const logprobs = files.filter((entry) => entry.path.startsWith("logprobs/"));
  if (projection.length !== TREE_PROFILE.entries || files.length !== TREE_PROFILE.files
    || projection.filter((entry) => entry.type === "directory").length
      !== TREE_PROFILE.directories
    || projection.reduce((sum, entry) => sum + entry.bytes, 0)
      !== TREE_PROFILE.logicalBytes
    || logprobs.length !== TREE_PROFILE.logprobFiles
    || logprobs.reduce((sum, entry) => sum + entry.bytes, 0)
      !== TREE_PROFILE.logprobBytes
    || digest(TREE_DOMAIN, projection) !== TREE_PROFILE.projectionHash) {
    fail("TREE_PROFILE_INVALID");
  }
  const attributes = files.find((entry) => entry.path === ".gitattributes");
  if (!attributes || attributes.bytes !== TREE_PROFILE.attributesBytes) {
    fail("ATTRIBUTES_PROFILE_INVALID");
  }
  for (const expected of OBJECTS) {
    const actual = files.find((entry) => entry.path === expected.path);
    if (!actual || actual.bytes !== expected.bytes || actual.oid !== expected.oid
      || actual.lfsSha256 !== expected.lfsSha256
      || actual.lfsBytes !== (expected.lfsSha256 === null ? null : expected.bytes)) {
      fail("TREE_OBJECT_PIN_INVALID", expected.path);
    }
  }
  return projection;
}

function nextTreeLink(bytes, phase, page) {
  const text = bytes.toString("latin1");
  const statusRows = text.split(/\r?\n/u).filter((row) => /^HTTP\/\d(?:\.\d)?\s/u.test(row));
  if (statusRows.length !== 1 || !/^HTTP\/\d(?:\.\d)?\s+200(?:\s|$)/u.test(statusRows[0])) {
    fail("TREE_HEADER_STATUS_INVALID", `${phase}:${page}`);
  }
  const links = text.split(/\r?\n/u).filter((row) => /^link:/iu.test(row));
  if (page === TREE_PAGE_COUNT) {
    if (links.length !== 0) fail("TREE_FINAL_LINK_INVALID", phase);
    return null;
  }
  if (links.length !== 1) fail("TREE_NEXT_LINK_MISSING", `${phase}:${page}`);
  const matched = /^link:\s*<([^>]+)>;\s*rel="next"\s*$/iu.exec(links[0]);
  if (!matched) fail("TREE_NEXT_LINK_INVALID", `${phase}:${page}`);
  const url = new URL(matched[1]);
  if (url.protocol !== "https:" || url.hostname !== "huggingface.co"
    || url.pathname !== `/api/datasets/${TAU2_UQ_DATASET_ID}/tree/${TAU2_UQ_REVISION}`
    || url.searchParams.get("recursive") !== "true"
    || url.searchParams.get("expand") !== "true"
    || url.searchParams.get("limit") !== "100"
    || !url.searchParams.get("cursor")) fail("TREE_NEXT_LINK_UNSAFE", `${phase}:${page}`);
  return url.href;
}

function treeSnapshot(metadata, phase) {
  const entries = [];
  const nextLinks = new Set();
  for (let page = 1; page <= TREE_PAGE_COUNT; page += 1) {
    const pageBytes = metadata.get(treePageName(phase, page, "json"));
    const pageValue = parseJson(pageBytes, "TREE_PAGE_JSON_INVALID");
    const expectedRows = page === TREE_PAGE_COUNT ? 68 : 100;
    if (!Array.isArray(pageValue) || pageValue.length !== expectedRows) {
      fail("TREE_PAGE_LENGTH_INVALID", `${phase}:${page}`);
    }
    entries.push(...pageValue);
    const next = nextTreeLink(
      metadata.get(treePageName(phase, page, "headers")), phase, page);
    if (next !== null) {
      if (nextLinks.has(next)) fail("TREE_CURSOR_REPEATED", `${phase}:${page}`);
      nextLinks.add(next);
    }
  }
  if (nextLinks.size !== TREE_PAGE_COUNT - 1) fail("TREE_CURSOR_COUNT_INVALID", phase);
  return treeProjection(entries);
}

function verifyReadme(bytes) {
  if (bytes.length !== OBJECTS[0].bytes || gitBlobOid(bytes) !== OBJECTS[0].oid) {
    fail("README_PIN_MISMATCH");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const markers = ["license: mit", "Full multi-turn agent-user-tool interaction traces",
    "Per-token log-probabilities", "GPT-4.1 / Kimi-K2.5", "278",
    "reward_info", "uq_summary", "MIT"];
  if (markers.some((marker) => !text.includes(marker))) fail("README_PROFILE_INVALID");
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return { schema: "outsider/tau2-uq-trajectory-source-manifest/v1",
    datasetId: TAU2_UQ_DATASET_ID, revision: TAU2_UQ_REVISION,
    entries: ordered, sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered) };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const expectedPaths = [
    ...METADATA_FILES.map((file) => `metadata/${file}`),
    ...OBJECTS.map((entry) => `files/${entry.path}`),
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expectedPaths))) fail("SOURCE_LAYOUT_INVALID");
  const metadata = new Map();
  const entries = [];
  for (const file of METADATA_FILES) {
    const bytes = readRegular(root, `metadata/${file}`, MAX_METADATA_BYTES);
    metadata.set(file, bytes);
    entries.push({ path: `metadata/${file}`, bytes: bytes.length,
      sha256: sha256(bytes), sourceObjectId: null, lfsSha256: null });
  }
  const before = recordProjection(metadata.get("dataset-record-before.json"));
  const after = recordProjection(metadata.get("dataset-record-after.json"));
  if (!same(before, after)) fail("DATASET_MATERIAL_STATE_CHANGED");
  const treeBefore = treeSnapshot(metadata, "before");
  const treeAfter = treeSnapshot(metadata, "after");
  if (!same(treeBefore, treeAfter)) fail("TREE_MATERIAL_STATE_CHANGED");
  const filePaths = sorted(treeBefore.filter((entry) => entry.type === "file")
    .map((entry) => entry.path));
  if (!same(before.siblings, filePaths)) fail("RECORD_TREE_FILE_SET_MISMATCH");
  for (const object of OBJECTS) {
    const relative = `files/${object.path}`;
    const bytes = readRegular(root, relative, MAX_OBJECT_BYTES, object.bytes);
    const contentHash = sha256(bytes);
    if (object.lfsSha256 === null ? gitBlobOid(bytes) !== object.oid
      : contentHash !== object.lfsSha256) fail("SOURCE_OBJECT_PIN_MISMATCH", object.path);
    if (object.path === "README.md") verifyReadme(bytes);
    entries.push({ path: relative, bytes: bytes.length, sha256: contentHash,
      sourceObjectId: object.oid, lfsSha256: object.lfsSha256 });
  }
  return { root, before, tree: treeBefore, entries };
}

export function createTau2UqSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, os, sys

root = sys.argv[1]
specs = json.loads(sys.argv[2])

def die(code):
    raise RuntimeError("TAU2_UQ_PYTHON_" + code)

def canonical_hash(value):
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"),
      ensure_ascii=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()

def counter_dict(counter):
    return {str(key): counter[key] for key in sorted(counter, key=lambda value: str(value))}

expected_uq_fields = {"total_tokens", "trajectory_nll", "avg_token_nll",
  "mean_topk_entropy", "min_chosen_prob"}
runs = {}
total = collections.Counter()
roles_total = collections.Counter()
terminations_total = collections.Counter()
for spec in specs:
    with open(os.path.join(root, spec["path"]), "r", encoding="utf-8") as handle:
        value = json.load(handle)
    if (not isinstance(value, dict)
        or set(value.keys()) != {"timestamp", "info", "tasks", "simulations"}
        or not isinstance(value["timestamp"], str)
        or not isinstance(value["info"], dict)
        or not isinstance(value["tasks"], list)
        or not isinstance(value["simulations"], list)
        or len(value["tasks"]) != spec["tasks"]
        or len(value["simulations"]) != spec["tasks"]):
        die("RUN_SHAPE_INVALID")
    info = value["info"]
    if (info.get("num_trials") != 1 or info.get("max_steps") != 200
        or info.get("max_errors") != 10
        or info.get("agent_info", {}).get("llm") != spec["agent"]
        or info.get("user_info", {}).get("llm") != "azure/Kimi-K2.5"):
        die("RUN_INFO_INVALID")
    task_ids = [str(task.get("id")) for task in value["tasks"] if isinstance(task, dict)]
    if len(task_ids) != spec["tasks"] or len(set(task_ids)) != len(task_ids):
        die("TASK_PROFILE_INVALID")
    simulations = {}
    rewards = collections.Counter()
    terminations = collections.Counter()
    roles = collections.Counter()
    uq_parts = collections.Counter()
    messages = tool_calls = tool_results = 0
    for simulation in value["simulations"]:
        if (not isinstance(simulation, dict)
            or str(simulation.get("task_id")) not in set(task_ids)
            or not isinstance(simulation.get("trial"), int)
            or not isinstance(simulation.get("seed"), int)
            or not isinstance(simulation.get("messages"), list)
            or not isinstance(simulation.get("reward_info"), dict)
            or simulation["reward_info"].get("reward") not in (0.0, 1.0)
            or not isinstance(simulation.get("uq_summary"), dict)):
            die("SIMULATION_INVALID")
        task_id = str(simulation["task_id"])
        if task_id in simulations:
            die("SIMULATION_TASK_DUPLICATE")
        simulations[task_id] = simulation
        rewards[str(float(simulation["reward_info"]["reward"]))] += 1
        termination = simulation.get("termination_reason")
        if termination not in ("user_stop", "max_steps"):
            die("TERMINATION_INVALID")
        terminations[termination] += 1
        calls = []
        results = []
        for message in simulation["messages"]:
            if not isinstance(message, dict) or message.get("role") not in ("assistant", "user", "tool"):
                die("MESSAGE_INVALID")
            roles[message["role"]] += 1
            message_calls = message.get("tool_calls") or []
            if not isinstance(message_calls, list):
                die("TOOL_CALL_LIST_INVALID")
            for call in message_calls:
                if not isinstance(call, dict) or not isinstance(call.get("id"), str):
                    die("TOOL_CALL_INVALID")
                calls.append(call["id"])
            if message["role"] == "tool":
                if not isinstance(message.get("id"), str):
                    die("TOOL_RESULT_INVALID")
                results.append(message["id"])
        if collections.Counter(calls) != collections.Counter(results):
            die("TOOL_JOIN_INVALID")
        messages += len(simulation["messages"])
        tool_calls += len(calls)
        tool_results += len(results)
        for part, summary in simulation["uq_summary"].items():
            if (part not in ("assistant", "user", "combined")
                or not isinstance(summary, dict)
                or set(summary.keys()) != expected_uq_fields):
                die("UQ_SUMMARY_INVALID")
            if (not isinstance(summary["total_tokens"], int) or summary["total_tokens"] < 0
                or any(not isinstance(summary[field], (int, float))
                  or not math.isfinite(float(summary[field]))
                  for field in expected_uq_fields - {"total_tokens"})):
                die("UQ_VALUE_INVALID")
            uq_parts[part] += 1
    profile = {
      "path": spec["path"], "modelKey": spec["modelKey"], "domain": spec["domain"],
      "agentModel": spec["agent"], "userSimulatorModel": "azure/Kimi-K2.5",
      "taskDefinitions": len(value["tasks"]), "simulations": len(value["simulations"]),
      "taskDefinitionsHash": canonical_hash(value["tasks"]),
      "publisherRewardRows": counter_dict(rewards),
      "terminationRows": counter_dict(terminations),
      "messages": messages, "messageRoles": counter_dict(roles),
      "toolCalls": tool_calls, "toolResults": tool_results,
      "toolCallsAndResultsExactlyJoined": True,
      "uqSummaryPartRows": counter_dict(uq_parts),
      "uqMetricsFinite": True,
      "rawTaskMessageToolAndUqValuesProjected": False,
    }
    runs[(spec["modelKey"], spec["domain"])] = {
      "tasks": value["tasks"], "simulations": simulations, "profile": profile,
    }
    total["files"] += 1
    total["simulations"] += profile["simulations"]
    total["messages"] += messages
    total["toolCalls"] += tool_calls
    total["toolResults"] += tool_results
    total["rewardOne"] += rewards["1.0"]
    total["rewardZero"] += rewards["0.0"]
    for part in ("assistant", "user", "combined"):
        total[part] += uq_parts[part]
    roles_total.update(roles)
    terminations_total.update(terminations)

pair_profiles = {}
aggregate_transitions = collections.Counter()
for domain in ("airline", "retail", "telecom"):
    kimi = runs[("kimi", domain)]
    gpt = runs[("gpt41", domain)]
    if kimi["tasks"] != gpt["tasks"] or set(kimi["simulations"]) != set(gpt["simulations"]):
        die("DOMAIN_PAIR_TASKS_INVALID")
    transitions = collections.Counter()
    for task_id in sorted(kimi["simulations"]):
        left = kimi["simulations"][task_id]
        right = gpt["simulations"][task_id]
        if left["seed"] != right["seed"] or left["trial"] != right["trial"]:
            die("DOMAIN_PAIR_SEED_INVALID")
        transition = str(int(left["reward_info"]["reward"])) + "->" + str(int(right["reward_info"]["reward"]))
        transitions[transition] += 1
        aggregate_transitions[transition] += 1
    pair_profiles[domain] = {
      "taskDefinitionsExactMatch": True,
      "taskDefinitionsHash": canonical_hash(kimi["tasks"]),
      "pairedTaskRuns": len(kimi["simulations"]),
      "seedAndTrialExactMatch": True,
      "kimiToGpt41RewardTransitions": counter_dict(transitions),
    }

expected_total = {"files": 6, "simulations": 556, "messages": 20485,
  "toolCalls": 6417, "toolResults": 6417, "rewardOne": 329, "rewardZero": 227,
  "assistant": 556, "user": 279, "combined": 279}
expected_terminations = {"max_steps": 1, "user_stop": 555}
expected_transitions = {"0->0": 56, "0->1": 31, "1->0": 84, "1->1": 107}
if (dict(total) != expected_total or dict(terminations_total) != expected_terminations
    or dict(aggregate_transitions) != expected_transitions):
    die("FROZEN_AGGREGATE_PROFILE_INVALID")

output = {
  "trajectoryFiles": 6,
  "runProfiles": [runs[key]["profile"] for key in sorted(runs)],
  "domainTaskPairs": 278,
  "simulations": 556,
  "messages": 20485,
  "messageRoles": counter_dict(roles_total),
  "toolCalls": 6417,
  "toolResults": 6417,
  "allToolCallsAndResultsJoined": True,
  "publisherRewardOneRows": 329,
  "publisherRewardZeroRows": 227,
  "terminationRows": counter_dict(terminations_total),
  "uqSummaryPartRows": {"assistant": 556, "user": 279, "combined": 279},
  "kimiRowsMissingUserAndCombinedUq": 277,
  "gpt41RowsWithAllThreeUqParts": 278,
  "allUqMetricsFinite": True,
  "domainPairs": pair_profiles,
  "kimiToGpt41RewardTransitions": counter_dict(aggregate_transitions),
  "kimiRewardOneRows": 191,
  "gpt41RewardOneRows": 138,
  "pairedRewardOneDifference": -53,
  "causalModelEffectEstablished": False,
  "rawTaskMessageToolAndUqValuesProjected": False,
}
print(json.dumps(output, sort_keys=True, separators=(",", ":")))
`;

const REPLAY_SPECS = Object.freeze([
  Object.freeze({ path: "trajectories/Kimi-K2.5_airline.json", modelKey: "kimi",
    domain: "airline", agent: "azure/Kimi-K2.5", tasks: 50 }),
  Object.freeze({ path: "trajectories/Kimi-K2.5_retail.json", modelKey: "kimi",
    domain: "retail", agent: "azure/Kimi-K2.5", tasks: 114 }),
  Object.freeze({ path: "trajectories/Kimi-K2.5_telecom.json", modelKey: "kimi",
    domain: "telecom", agent: "azure/Kimi-K2.5", tasks: 114 }),
  Object.freeze({ path: "trajectories/gpt41_kimik25_airline.json", modelKey: "gpt41",
    domain: "airline", agent: "azure/gpt-4.1", tasks: 50 }),
  Object.freeze({ path: "trajectories/gpt41_kimik25_retail.json", modelKey: "gpt41",
    domain: "retail", agent: "azure/gpt-4.1", tasks: 114 }),
  Object.freeze({ path: "trajectories/gpt41_kimik25_telecom.json", modelKey: "gpt41",
    domain: "telecom", agent: "azure/gpt-4.1", tasks: 114 }),
]);

function runReplay(root, pythonExecutable = ".venv/bin/python") {
  if (typeof pythonExecutable !== "string" || pythonExecutable.length === 0) {
    fail("PYTHON_EXECUTABLE_INVALID");
  }
  const child = spawnSync(pythonExecutable,
    ["-c", PYTHON_REPLAY, PathJoin(root, "files"), JSON.stringify(REPLAY_SPECS)], {
      encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONHASHSEED: "0",
        PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1" },
    });
  if (child.status !== 0) fail("PYTHON_REPLAY_FAILED",
    String(child.stderr || child.stdout).trim());
  const replay = parseJson(BufferFrom(child.stdout.trim(), "utf8"),
    "PYTHON_OUTPUT_INVALID");
  if (replay.trajectoryFiles !== 6 || replay.simulations !== 556
    || replay.domainTaskPairs !== 278 || replay.toolCalls !== 6_417) {
    fail("PYTHON_OUTPUT_PROFILE_INVALID");
  }
  return replay;
}

export function buildTau2UqArtifactFromSourceDirectory(sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const storedManifest = readRegular(collected.root, "source-manifest.json",
    MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(storedManifest)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: TAU2_UQ_TRAJECTORY_SCHEMA,
    disposition: TAU2_UQ_DISPOSITION,
    source: {
      id: TAU2_UQ_DATASET_ID,
      revision: TAU2_UQ_REVISION,
      lastModified: collected.before.lastModified,
      public: true,
      gated: false,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
      repositoryFiles: TREE_PROFILE.files,
      repositoryDirectories: TREE_PROFILE.directories,
      repositoryLogicalBytes: TREE_PROFILE.logicalBytes,
      repositoryUsedStorageBytes: 430_489_452,
      selectedObjects: TREE_PROFILE.selectedObjects,
      selectedBytes: TREE_PROFILE.selectedBytes,
      completeSixTrajectoryFilesReplayed: true,
      completeTokenLogprobFilesReplayed: false,
      excludedTokenLogprobFiles: TREE_PROFILE.logprobFiles,
      excludedTokenLogprobLogicalBytes: TREE_PROFILE.logprobBytes,
      recordAndFullTreeCapturedAroundFinalSourceRederivation: true,
      materialRecordAndTreeStateStable: true,
    },
    replay: { ...replay,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")) },
    comparison: {
      same278DomainTaskDefinitionsAcrossModels: true,
      sameTrialAndSeedAcrossModelPairs: true,
      kimiToGpt41RewardTransitions: replay.kimiToGpt41RewardTransitions,
      kimiRewardOneRows: replay.kimiRewardOneRows,
      gpt41RewardOneRows: replay.gpt41RewardOneRows,
      pairedRewardOneDifference: replay.pairedRewardOneDifference,
      descriptivePairedBenchmarkOnly: true,
      randomizedModelAssignmentEstablished: false,
      causalModelEffectEstablished: false,
    },
    uncertainty: {
      assistantSummaryRows: 556,
      userSummaryRows: 279,
      combinedSummaryRows: 279,
      gpt41RowsWithAllThreeParts: 278,
      kimiRowsMissingUserAndCombinedParts: 277,
      oneKimiTelecomRowWithAllThreeParts: true,
      allPresentMetricsFinite: true,
      tokenLevelLogprobsReplayed: false,
      UqCompletenessIsNotUniformAcrossModelFamilies: true,
    },
    completeness: {
      completePublishedTrajectoryConfiguration: true,
      completeSixTrajectoryFiles: true,
      completeTwoModelByThreeDomainMatrix: true,
      complete278PairedDomainTaskUnits: true,
      completeRepositoryPayload: false,
      completeUnderlyingTau2TaskUniverse: false,
      completeOpportunityOrAttemptCensus: false,
    },
    denominators: {
      PUBLISHED_SIMULATION_RECORD: 556,
      PAIRED_DOMAIN_TASK_UNIT: 278,
      UQ_SUMMARY_COMPONENT: 1_114,
      TOOL_CALL_RESULT_PAIR: 6_417,
      crossPopulationTotal: null,
      additionProhibited: true,
    },
    outcome: {
      publisherEvaluatorRewardRows: 556,
      publisherRewardOneRows: 329,
      publisherRewardZeroRows: 227,
      independentOutcomeRows: 0,
      realWorldOutcomeRows: 0,
      longitudinalOutcomeRows: 0,
      recoveryEpisodeRows: 0,
    },
    rights: {
      datasetCardLicenseClaim: "MIT",
      licenseTagPresent: true,
      repositoryLicenseFileAcquired: false,
      upstreamTau2TaskAndEnvironmentTermsReplayed: false,
      legalConclusionEstablished: false,
      evaluationUseByThisArtifact: true,
      trainingUseAuthorized: false,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      rawTasksPresent: true,
      rawMessagesPresent: true,
      rawToolArgumentsAndResultsPresent: true,
      rawUqValuesPresent: true,
      rawTokenLogprobsPresent: false,
      rawSourcePrivate: true,
      noPiiGuaranteed: false,
      rawProjectionRows: 0,
    },
    boundary: {
      simulatedCustomerServiceRecords: 556,
      publisherEvaluatedOutcomeRows: 556,
      independentOutcomeRows: 0,
      realWorldOutcomeRows: 0,
      longitudinalOutcomeRows: 0,
      recoveryEpisodeRows: 0,
      preActionDelegationRows: 0,
      physicalEffectRows: 0,
      offlineTrainingRows: 0,
      productionTrainingRows: 0,
      networkAdmissionRows: 0,
      actorCreditRows: 0,
      ceuRows: 0,
      pricingRows: 0,
      authorityRows: 0,
      autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createTau2UqReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: TAU2_UQ_TRAJECTORY_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: TAU2_UQ_DISPOSITION,
    simulations: 556,
    pairedDomainTaskUnits: 278,
    publisherEvaluatedOutcomeRows: 556,
    independentOutcomeRows: 0,
    recoveryEpisodeRows: 0,
    offlineTrainingRows: 0,
    productionTrainingRows: 0,
    networkAdmissionRows: 0,
    authorityRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyTau2UqArtifactDirectory(directory, options = {}) {
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
    const built = buildTau2UqArtifactFromSourceDirectory(PathJoin(root, "source"), options);
    const expectedReportBytes = serialize(built.report);
    if (!expectedReportBytes.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createTau2UqReceipt(built.report, expectedReportBytes, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeTau2UqArtifact(value) {
  return serialize(value);
}
