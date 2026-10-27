/*
 * Complete fixed-revision τ2-bench agent-lens evaluation-run census.
 *
 * All published results.json files are replayed.  The main with/without-policy
 * runs form a strong configuration-controlled comparison, but one baseline
 * trajectory is absent and the executions are simulated/stochastic; therefore
 * outcome deltas remain publisher-evaluator evidence, not causal proof or
 * production authority.  Raw tasks, policies, messages, and tool payloads stay
 * private and never enter the report.
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

export const TAU2_GUARDRAIL_SCHEMA =
  "outsider/tau2-guardrail-eval-run-census/v1";
export const TAU2_GUARDRAIL_RECEIPT_SCHEMA =
  "outsider/tau2-guardrail-eval-run-census-receipt/v1";
export const TAU2_GUARDRAIL_DATASET_ID = "foundation-models/eval-runs";
export const TAU2_GUARDRAIL_REVISION =
  "c13db40ab1b9bd3ea66f06678db43dcea9c88d68";
export const TAU2_GUARDRAIL_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/tau2-guardrail-eval-run-census-report/v1";
const RECEIPT_DOMAIN = "outsider/tau2-guardrail-eval-run-census-receipt/v1";
const MANIFEST_DOMAIN = "outsider/tau2-guardrail-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/tau2-guardrail-source-root/v1";
const TREE_DOMAIN = "outsider/foundation-eval-tree/v1";
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_OBJECT_BYTES = 48 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;

const OBJECTS = Object.freeze([
  Object.freeze({ path: "README.md", bytes: 1_362,
    oid: "5a9138c5ad409ef02d0bbd3f723030368866e01c", lfsSha256: null }),
  Object.freeze({
    path: "tau2-bench/gpt-4o-mini/with-patch/agent-lens-retail-gpt4o-mini-direct-tau2-t1-k1/results.json",
    bytes: 76_010, oid: "477cae15c9ee2bd1dba98f094e0ed65678b449df", lfsSha256: null }),
  Object.freeze({
    path: "tau2-bench/gpt-4o-mini/with-patch/agent-lens-retail-gpt4o-mini-direct-tau2-t10-k1/results.json",
    bytes: 712_527, oid: "e05d34641203107053be69985ab7700630a96221", lfsSha256: null }),
  Object.freeze({
    path: "tau2-bench/gpt-4o-mini/with-patch/agent-lens-retail-gpt4o-mini-standard-t1-k1/results.json",
    bytes: 85_925, oid: "0d62d9413fdf768be54d14cbd172dee0efba46e3", lfsSha256: null }),
  Object.freeze({
    path: "tau2-bench/gpt-4o-mini/with-patch/agent-lens-retail-policy/results.json",
    bytes: 41_549_400, oid: "6917160510ab31f7980474d70e0d1482e9620476",
    lfsSha256: "sha256:76ceca1a5ef468a8db107233e994b98076f8b8d17cc94be6f6f3ccfef94673d4" }),
  Object.freeze({
    path: "tau2-bench/gpt-4o-mini/without-patch/agent-lens-config-smoke/results.json",
    bytes: 33_191, oid: "d938483eb4870b49f01ed4c86b78298af3748516", lfsSha256: null }),
  Object.freeze({
    path: "tau2-bench/gpt-4o-mini/without-patch/agent-lens-retail/results.json",
    bytes: 37_979_633, oid: "3d946f20347bd03b61d9790de32e54e8c0300e46",
    lfsSha256: "sha256:cf8abd2309816752ceeb95f095f9f42e1f8304539463022864fd16ee680a6710" }),
  Object.freeze({
    path: "tau2-bench/other-models/with-patch/agent-lens-retail-policy-smoke/results.json",
    bytes: 393_202, oid: "fe61057df75501297524ee8e3be2ad6587f72654", lfsSha256: null }),
  Object.freeze({
    path: "tau2-bench/other-models/with-patch/agent-lens-retail-probable-ngrok-standard-t10-k1/results.json",
    bytes: 47_555, oid: "209bd689a41337fe0b8c775ab237b6342c235309", lfsSha256: null }),
  Object.freeze({
    path: "tau2-bench/other-models/with-patch/agent-lens-retail-probable-ngrok-standard-t10-k2/results.json",
    bytes: 47_555, oid: "b7692eb414a6a19b972cc0db5a203eaad3ab8217", lfsSha256: null }),
  Object.freeze({
    path: "tau2-bench/other-models/without-patch/agent-lens-retail-probable-ngrok-smoke/results.json",
    bytes: 15_263, oid: "426db6f4de987cd9c5d346f0c25d14d39de7e138", lfsSha256: null }),
  Object.freeze({
    path: "tau2-bench/other-models/without-patch/agent-lens-retail-probable-ngrok-standard-t1-k1/results.json",
    bytes: 33_834, oid: "40d38be45abf8e3badc98a6b629b78e85f72a73c", lfsSha256: null }),
  Object.freeze({
    path: "tau2-bench/other-models/without-patch/agent-lens-retail-smoke/results.json",
    bytes: 139_407, oid: "00e40352ef41d02aeb24ba3e2f9a142ce7233cc9", lfsSha256: null }),
  Object.freeze({
    path: "tau2-bench/other-models/without-patch/agent-lens-telecom-probable-ngrok-solo-t1-k1/results.json",
    bytes: 33_561, oid: "8041f900aa434eb06d6ece37b4e808729c8744b4", lfsSha256: null }),
]);

export const TAU2_GUARDRAIL_SOURCE_OBJECTS = OBJECTS;

const MAIN_WITH =
  "tau2-bench/gpt-4o-mini/with-patch/agent-lens-retail-policy/results.json";
const MAIN_WITHOUT =
  "tau2-bench/gpt-4o-mini/without-patch/agent-lens-retail/results.json";
const TREE_PROFILE = Object.freeze({
  entries: 35,
  files: 15,
  directories: 20,
  logicalBytes: 81_151_304,
  selectedObjects: 14,
  selectedBytes: 81_148_425,
  attributesBytes: 2_879,
  attributesOid: "6430c4cf972ebe69405d49363b2d89d78c0f0a6e",
  projectionHash:
    "sha256:c380cb670b9c06974d0416022a9853e16547e6d3d4d21e90c6850f8666c0662d",
});
const METADATA_FILES = Object.freeze([
  "dataset-record-after.json", "dataset-record-before.json",
  "full-tree-after.json", "full-tree-before.json",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `TAU2_GUARDRAIL_${code}`
    : `TAU2_GUARDRAIL_${code}:${detail}`);
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
  const expectedSiblings = sorted([".gitattributes", ...OBJECTS.map((entry) => entry.path)]);
  const projection = {
    id: record.id,
    revision: record.sha,
    private: record.private,
    gated: record.gated,
    disabled: record.disabled,
    usedStorage: record.usedStorage,
    lastModified: record.lastModified,
    siblings,
    cardLicense: record.cardData?.license ?? null,
    licenseTagPresent: Array.isArray(record.tags)
      && record.tags.includes("license:mit"),
  };
  if (projection.id !== TAU2_GUARDRAIL_DATASET_ID
    || projection.revision !== TAU2_GUARDRAIL_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false || projection.usedStorage !== 79_529_033
    || projection.cardLicense !== "mit" || projection.licenseTagPresent !== true
    || !same(projection.siblings, expectedSiblings)) fail("DATASET_RECORD_INVALID");
  return projection;
}

function treeProjection(bytes) {
  const tree = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(tree)) fail("TREE_INVALID");
  const projection = tree.map((entry) => ({
    path: entry?.path,
    type: entry?.type,
    oid: entry?.oid,
    bytes: entry?.size,
    lfsSha256: entry?.lfs?.oid ? `sha256:${entry.lfs.oid}` : null,
    lfsBytes: entry?.lfs?.size ?? null,
  })).sort((left, right) => left.path < right.path ? -1 : 1);
  if (projection.length !== TREE_PROFILE.entries
    || projection.filter((entry) => entry.type === "file").length !== TREE_PROFILE.files
    || projection.filter((entry) => entry.type === "directory").length
      !== TREE_PROFILE.directories
    || projection.reduce((sum, entry) => sum + entry.bytes, 0)
      !== TREE_PROFILE.logicalBytes
    || digest(TREE_DOMAIN, projection) !== TREE_PROFILE.projectionHash) {
    fail("TREE_PROFILE_INVALID");
  }
  const attributes = projection.find((entry) => entry.path === ".gitattributes");
  if (!attributes || attributes.type !== "file"
    || attributes.bytes !== TREE_PROFILE.attributesBytes
    || attributes.oid !== TREE_PROFILE.attributesOid) fail("ATTRIBUTES_PIN_INVALID");
  for (const expected of OBJECTS) {
    const actual = projection.find((entry) => entry.path === expected.path);
    if (!actual || actual.type !== "file" || actual.bytes !== expected.bytes
      || actual.oid !== expected.oid || actual.lfsSha256 !== expected.lfsSha256
      || actual.lfsBytes !== (expected.lfsSha256 === null ? null : expected.bytes)) {
      fail("TREE_OBJECT_PIN_INVALID", expected.path);
    }
  }
  return projection;
}

function verifyReadme(bytes) {
  const descriptor = OBJECTS[0];
  if (bytes.length !== descriptor.bytes || gitBlobOid(bytes) !== descriptor.oid) {
    fail("README_PIN_MISMATCH");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const markers = ["license: mit", "Evaluation run artifacts", "with-patch",
    "without-patch", "write guardrail", "full trajectories",
    "agent-lens-retail-policy", "Trials", "4"];
  if (markers.some((marker) => !text.includes(marker))) fail("README_PROFILE_INVALID");
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/tau2-guardrail-source-manifest/v1",
    datasetId: TAU2_GUARDRAIL_DATASET_ID,
    revision: TAU2_GUARDRAIL_REVISION,
    entries: ordered,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const expectedPaths = [
    ...METADATA_FILES.map((file) => `metadata/${file}`),
    ...OBJECTS.map((entry) => `files/${entry.path}`),
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expectedPaths))) fail("SOURCE_LAYOUT_INVALID");
  const entries = [];
  const metadata = new Map();
  for (const file of METADATA_FILES) {
    const bytes = readRegular(root, `metadata/${file}`, MAX_METADATA_BYTES);
    metadata.set(file, bytes);
    entries.push({ path: `metadata/${file}`, bytes: bytes.length,
      sha256: sha256(bytes), sourceObjectId: null, lfsSha256: null });
  }
  const before = recordProjection(metadata.get("dataset-record-before.json"));
  const after = recordProjection(metadata.get("dataset-record-after.json"));
  if (!same(before, after)) fail("DATASET_MATERIAL_STATE_CHANGED");
  const treeBefore = treeProjection(metadata.get("full-tree-before.json"));
  const treeAfter = treeProjection(metadata.get("full-tree-after.json"));
  if (!same(treeBefore, treeAfter)) fail("TREE_MATERIAL_STATE_CHANGED");
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

export function createTau2GuardrailSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, copy, hashlib, json, math, os, sys

root = sys.argv[1]
paths = json.loads(sys.argv[2])
main_with_path = sys.argv[3]
main_without_path = sys.argv[4]

def die(code):
    raise RuntimeError("TAU2_GUARDRAIL_PYTHON_" + code)

def canonical_hash(value):
    data = json.dumps(value, sort_keys=True, separators=(",", ":"),
      ensure_ascii=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(data).hexdigest()

def text_hash(value):
    return "sha256:" + hashlib.sha256(value.encode("utf-8")).hexdigest()

def counter_dict(counter):
    return {str(key): counter[key] for key in sorted(counter, key=lambda value: str(value))}

runs = {}
total = collections.Counter()
termination_total = collections.Counter()
role_total = collections.Counter()
for relative in paths:
    full = os.path.join(root, relative)
    with open(full, "r", encoding="utf-8") as handle:
        value = json.load(handle)
    if (not isinstance(value, dict)
        or set(value.keys()) != {"timestamp", "info", "tasks", "simulations", "simulation_index"}
        or value["simulation_index"] is not None
        or not isinstance(value["timestamp"], str)
        or not isinstance(value["info"], dict)
        or not isinstance(value["tasks"], list)
        or not isinstance(value["simulations"], list)):
        die("RUN_SHAPE_INVALID")
    info = value["info"]
    if (not isinstance(info.get("num_trials"), int)
        or not isinstance(info.get("max_steps"), int)
        or not isinstance(info.get("max_errors"), int)
        or not isinstance(info.get("environment_info"), dict)
        or not isinstance(info["environment_info"].get("policy"), str)):
        die("RUN_INFO_INVALID")
    task_ids = []
    for task in value["tasks"]:
        if not isinstance(task, dict) or "id" not in task:
            die("TASK_INVALID")
        task_ids.append(str(task["id"]))
    if len(task_ids) != len(set(task_ids)):
        die("TASK_ID_DUPLICATE")

    reward_counts = collections.Counter()
    terminations = collections.Counter()
    roles = collections.Counter()
    seen = set()
    messages = 0
    tool_calls = 0
    tool_results = 0
    costs_finite = True
    durations_finite = True
    policies = set()
    for simulation in value["simulations"]:
        if (not isinstance(simulation, dict)
            or str(simulation.get("task_id")) not in set(task_ids)
            or not isinstance(simulation.get("trial"), int)
            or not isinstance(simulation.get("seed"), int)
        or not isinstance(simulation.get("messages"), list)
        or not (isinstance(simulation.get("policy"), str)
          or (simulation.get("policy") is None
            and simulation.get("termination_reason") == "infrastructure_error"))
            or simulation.get("mode") != "half_duplex"):
            die("SIMULATION_INVALID")
        key = (str(simulation["task_id"]), simulation["trial"])
        if key in seen:
            die("SIMULATION_KEY_DUPLICATE")
        seen.add(key)
        if isinstance(simulation["policy"], str):
            policies.add(simulation["policy"])
        reward_info = simulation.get("reward_info")
        if reward_info is None:
            reward_counts["MISSING"] += 1
        elif isinstance(reward_info, dict) and reward_info.get("reward") in (0.0, 1.0):
            reward_counts[str(float(reward_info["reward"]))] += 1
        else:
            die("REWARD_INVALID")
        termination = simulation.get("termination_reason")
        if termination not in ("user_stop", "max_steps", "too_many_errors",
            "infrastructure_error"):
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
                if (not isinstance(call, dict)
                    or set(call.keys()) != {"arguments", "id", "name", "requestor"}
                    or not isinstance(call["id"], str)):
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
        for field in ("agent_cost", "user_cost"):
            scalar = simulation.get(field)
            if scalar is not None and (not isinstance(scalar, (int, float))
                or not math.isfinite(float(scalar)) or float(scalar) < 0):
                costs_finite = False
        duration = simulation.get("duration")
        if duration is not None and (not isinstance(duration, (int, float))
            or not math.isfinite(float(duration)) or float(duration) < 0):
            durations_finite = False
    if policies and policies != {info["environment_info"]["policy"]}:
        die("POLICY_BINDING_INVALID")
    if not policies and any(simulation.get("termination_reason") != "infrastructure_error"
      for simulation in value["simulations"]):
        die("POLICY_BINDING_INVALID")
    if not costs_finite or not durations_finite:
        die("NUMERIC_AGGREGATE_INVALID")
    profile = {
      "path": relative,
      "taskDefinitions": len(value["tasks"]),
      "simulations": len(value["simulations"]),
      "declaredTrials": info["num_trials"],
      "uniqueTaskTrialKeys": len(seen),
      "rewardRows": counter_dict(reward_counts),
      "terminationRows": counter_dict(terminations),
      "messages": messages,
      "messageRoles": counter_dict(roles),
      "toolCalls": tool_calls,
      "toolResults": tool_results,
      "toolCallsAndResultsExactlyJoined": True,
      "policyBytes": len(info["environment_info"]["policy"].encode("utf-8")),
      "policySha256": text_hash(info["environment_info"]["policy"]),
      "rawTaskPolicyMessageAndToolValuesProjected": False,
    }
    runs[relative] = {"value": value, "profile": profile}
    total["runs"] += 1
    total["taskDefinitions"] += profile["taskDefinitions"]
    total["simulations"] += profile["simulations"]
    total["messages"] += messages
    total["toolCalls"] += tool_calls
    total["toolResults"] += tool_results
    total["rewardOne"] += reward_counts["1.0"]
    total["rewardZero"] += reward_counts["0.0"]
    total["rewardMissing"] += reward_counts["MISSING"]
    total["zeroSimulationRuns"] += 1 if profile["simulations"] == 0 else 0
    termination_total.update(terminations)
    role_total.update(roles)

with_run = runs[main_with_path]["value"]
without_run = runs[main_without_path]["value"]
if with_run["tasks"] != without_run["tasks"]:
    die("MAIN_TASKS_DIFFER")
with_info = copy.deepcopy(with_run["info"])
without_info = copy.deepcopy(without_run["info"])
with_policy = with_info["environment_info"].pop("policy")
without_policy = without_info["environment_info"].pop("policy")
if with_info != without_info or not with_policy.startswith(without_policy):
    die("MAIN_CONFIGURATION_INVALID")
with_index = {(str(row["task_id"]), row["trial"]): row for row in with_run["simulations"]}
without_index = {(str(row["task_id"]), row["trial"]): row for row in without_run["simulations"]}
paired = sorted(set(with_index) & set(without_index))
if any(with_index[key]["seed"] != without_index[key]["seed"]
  or with_index[key]["mode"] != without_index[key]["mode"] for key in paired):
    die("MAIN_PAIR_CONFIGURATION_INVALID")
transitions = collections.Counter()
for key in paired:
    baseline = without_index[key].get("reward_info")
    patched = with_index[key].get("reward_info")
    if not isinstance(baseline, dict) or not isinstance(patched, dict):
        die("MAIN_PAIR_REWARD_MISSING")
    transitions[str(int(baseline["reward"])) + "->" + str(int(patched["reward"]))] += 1
missing_without = sorted(set(with_index) - set(without_index))
missing_with = sorted(set(without_index) - set(with_index))
if len(missing_without) != 1 or missing_with:
    die("MAIN_PAIR_MISSING_PROFILE_INVALID")
missing_reward = with_index[missing_without[0]]["reward_info"]["reward"]

expected_total = {"runs": 13, "taskDefinitions": 273, "simulations": 934,
  "messages": 29836, "toolCalls": 8311, "toolResults": 8311,
  "rewardOne": 286, "rewardZero": 647, "rewardMissing": 1,
  "zeroSimulationRuns": 3}
expected_terminations = {"infrastructure_error": 1, "max_steps": 14,
  "too_many_errors": 23, "user_stop": 896}
expected_transitions = {"0->0": 269, "0->1": 43, "1->0": 49, "1->1": 94}
if (dict(total) != expected_total or dict(termination_total) != expected_terminations
    or dict(transitions) != expected_transitions
    or len(paired) != 455 or missing_reward != 0.0
    or len(with_run["simulations"]) != 456
    or len(without_run["simulations"]) != 455
    or len(with_run["tasks"]) != 114):
    die("FROZEN_AGGREGATE_PROFILE_INVALID")

output = {
  "resultsFiles": total["runs"],
  "runProfiles": [runs[key]["profile"] for key in sorted(runs)],
  "taskDefinitionsAcrossRunsNonDistinct": total["taskDefinitions"],
  "simulations": total["simulations"],
  "messages": total["messages"],
  "messageRoles": counter_dict(role_total),
  "toolCalls": total["toolCalls"],
  "toolResults": total["toolResults"],
  "allToolCallsAndResultsJoined": True,
  "publisherRewardOneRows": total["rewardOne"],
  "publisherRewardZeroRows": total["rewardZero"],
  "publisherRewardMissingRows": total["rewardMissing"],
  "terminationRows": counter_dict(termination_total),
  "zeroSimulationRunFiles": total["zeroSimulationRuns"],
  "mainPair": {
    "taskDefinitionsExactMatch": True,
    "taskDefinitionsHash": canonical_hash(with_run["tasks"]),
    "configurationExceptPolicyExactMatch": True,
    "configurationExceptPolicyHash": canonical_hash(with_info),
    "withPatchSimulations": len(with_run["simulations"]),
    "withoutPatchSimulations": len(without_run["simulations"]),
    "alignedTaskTrialPairs": len(paired),
    "alignedSeedsAndModes": True,
    "missingWithoutPatchPairs": len(missing_without),
    "missingWithPatchPairs": len(missing_with),
    "missingPairPatchedReward": missing_reward,
    "baselinePolicyBytes": len(without_policy.encode("utf-8")),
    "baselinePolicySha256": text_hash(without_policy),
    "patchedPolicyBytes": len(with_policy.encode("utf-8")),
    "patchedPolicySha256": text_hash(with_policy),
    "baselinePolicyExactPrefixOfPatchedPolicy": True,
    "appendedGuardrailBytes": len(with_policy.encode("utf-8")) - len(without_policy.encode("utf-8")),
    "appendedGuardrailSha256": text_hash(with_policy[len(without_policy):]),
    "baselineToPatchRewardTransitions": counter_dict(transitions),
    "baselineRewardOneRows": 143,
    "patchedRewardOneRows": 137,
    "pairedNetRewardOneDifference": -6,
    "causalEffectEstablished": False,
  },
  "rawTaskPolicyMessageAndToolValuesProjected": False,
}
print(json.dumps(output, sort_keys=True, separators=(",", ":")))
`;

function runReplay(root, pythonExecutable = ".venv/bin/python") {
  if (typeof pythonExecutable !== "string" || pythonExecutable.length === 0) {
    fail("PYTHON_EXECUTABLE_INVALID");
  }
  const resultPaths = OBJECTS.filter((entry) => entry.path.endsWith("/results.json"))
    .map((entry) => entry.path);
  const child = spawnSync(pythonExecutable,
    ["-c", PYTHON_REPLAY, PathJoin(root, "files"), JSON.stringify(resultPaths),
      MAIN_WITH, MAIN_WITHOUT], {
      encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONHASHSEED: "0",
        PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1" },
    });
  if (child.status !== 0) fail("PYTHON_REPLAY_FAILED",
    String(child.stderr || child.stdout).trim());
  const replay = parseJson(BufferFrom(child.stdout.trim(), "utf8"),
    "PYTHON_OUTPUT_INVALID");
  if (replay.resultsFiles !== 13 || replay.simulations !== 934
    || replay.toolCalls !== 8_311 || replay.mainPair?.alignedTaskTrialPairs !== 455) {
    fail("PYTHON_OUTPUT_PROFILE_INVALID");
  }
  return replay;
}

export function buildTau2GuardrailArtifactFromSourceDirectory(sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const storedManifest = readRegular(collected.root, "source-manifest.json",
    MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(storedManifest)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: TAU2_GUARDRAIL_SCHEMA,
    disposition: TAU2_GUARDRAIL_DISPOSITION,
    source: {
      id: TAU2_GUARDRAIL_DATASET_ID,
      revision: TAU2_GUARDRAIL_REVISION,
      lastModified: collected.before.lastModified,
      public: true,
      gated: false,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
      repositoryFiles: TREE_PROFILE.files,
      repositoryDirectories: TREE_PROFILE.directories,
      repositoryLogicalBytes: TREE_PROFILE.logicalBytes,
      selectedObjects: TREE_PROFILE.selectedObjects,
      selectedBytes: TREE_PROFILE.selectedBytes,
      completePublishedResultFilesReplayed: true,
      completeRepositoryBytesReplayed: false,
      omittedOnlyGitAttributes: true,
      recordAndFullTreeCapturedBeforeAndAfter: true,
      materialRecordAndTreeStateStable: true,
    },
    replay: { ...replay,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")) },
    comparison: {
      ...replay.mainPair,
      publisherCallsPatchRetailWriteGuardrail: true,
      configurationControlledComparisonAvailable: true,
      stochasticExecutionsAreNotSameEpisodeCounterfactuals: true,
      oneBaselineTrajectoryMissing: true,
      guardrailImprovementClaimSupported: false,
      guardrailRegressionClaimSupported: false,
      descriptiveOutcomeTransitionsOnly: true,
    },
    completeness: {
      completeThirteenPublishedResultFiles: true,
      resultFilesWithZeroSimulations: 3,
      infrastructureErrorRowsWithoutReward: 1,
      completeMainWithPatchRun: true,
      completeMainWithoutPatchRun: false,
      missingMainBaselineTaskTrialPairs: 1,
      completeUnderlyingTau2TaskUniverse: false,
      completeOpportunityOrAttemptCensus: false,
    },
    denominators: {
      PUBLISHED_SIMULATION_RECORD: 934,
      PUBLISHER_SCORED_SIMULATION_RECORD: 933,
      ALIGNED_MAIN_TASK_TRIAL_PAIR: 455,
      RESULT_FILE: 13,
      crossPopulationTotal: null,
      additionProhibited: true,
    },
    outcome: {
      publisherEvaluatorRewardRows: 933,
      publisherRewardOneRows: 286,
      publisherRewardZeroRows: 647,
      missingRewardRows: 1,
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
      rawTaskScenariosPresent: true,
      rawPoliciesPresent: true,
      rawMessagesPresent: true,
      rawToolArgumentsAndResultsPresent: true,
      rawSourcePrivate: true,
      noPiiGuaranteed: false,
      rawProjectionRows: 0,
    },
    boundary: {
      simulatedCustomerServiceRecords: 934,
      publisherEvaluatedOutcomeRows: 933,
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

export function createTau2GuardrailReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: TAU2_GUARDRAIL_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: TAU2_GUARDRAIL_DISPOSITION,
    simulations: 934,
    publisherEvaluatedOutcomeRows: 933,
    alignedMainTaskTrialPairs: 455,
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

export function verifyTau2GuardrailArtifactDirectory(directory, options = {}) {
  try {
    const root = PathResolve(directory);
    const expected = ["report.json", "run-receipt.json", "source"];
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)), expected)) fail("ARTIFACT_LAYOUT_INVALID");
    const reportBytes = readRegular(root, "report.json", MAX_METADATA_BYTES);
    const receiptBytes = readRegular(root, "run-receipt.json", MAX_METADATA_BYTES);
    const built = buildTau2GuardrailArtifactFromSourceDirectory(
      PathJoin(root, "source"), options,
    );
    const expectedReportBytes = serialize(built.report);
    if (!expectedReportBytes.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createTau2GuardrailReceipt(built.report,
      expectedReportBytes, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeTau2GuardrailArtifact(value) {
  return serialize(value);
}
