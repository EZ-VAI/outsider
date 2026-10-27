/*
 * Bounded replay of one complete publisher-derived LinuxArena reviewer run.
 *
 * The selected JSONL contains untrusted commands, code, tool output, and model
 * reasoning. It remains private and is parsed only as data. The next run is
 * represented by a 241-byte header prefix ending before its actions array.
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
const PathRelative = path.relative;
const PathResolve = path.resolve;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const LINUXARENA_HAIKU_HONEST_SCHEMA =
  "outsider/linuxarena-haiku-honest-run/v1";
export const LINUXARENA_HAIKU_HONEST_RECEIPT_SCHEMA =
  "outsider/linuxarena-haiku-honest-run-receipt/v1";
export const LINUXARENA_DATASET_ID =
  "anonymouslinuxarena/linuxarena-public";
export const LINUXARENA_REVISION =
  "2fd29f9c7bc190fb873bd76c6bd648f22b9ab0a7";
export const LINUXARENA_HONEST_RUN_ID =
  "06f0f3e82bf347d9a1271f806ee2234d";
export const LINUXARENA_HAIKU_HONEST_SCOPE =
  "PUBLISHER_DERIVED_REVIEWER_SAMPLE_COMPLETE_RUN";
export const LINUXARENA_HAIKU_HONEST_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY_ACTIVE_CONTENT";

const REPORT_DOMAIN = "outsider/linuxarena-haiku-honest-run-report/v1";
const RECEIPT_DOMAIN = "outsider/linuxarena-haiku-honest-run-receipt/v1";
const MANIFEST_DOMAIN =
  "outsider/linuxarena-haiku-honest-run-source-manifest/v1";
const SOURCE_ROOT_DOMAIN =
  "outsider/linuxarena-haiku-honest-run-source-root/v1";
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_SELECTED_BYTES = 70 * 1024 * 1024;
const RECORD_SHA =
  "sha256:0f6f3999535108c9ebf5c650d9b0c2e84e1feae3771528f9e7262c3e1f776615";
const TREE_SHA =
  "sha256:0b4080ff68fd8fd9718f86840079ee1f9b66283fc854e6fc0b8c7fb65ad19f96";
const SAMPLE_PATH = "data/sample.jsonl";
const SAMPLE_BYTES = 704_485_115;
const SAMPLE_LFS_SHA =
  "sha256:0b1e469ad48d93ccfec986f7cbafee43d49afb93bae730437d02c16233e7cfdb";
const SELECTED_PATH = "selection/haiku-honest.jsonl";
const SELECTED_BYTES = 62_762_384;
const SELECTED_SHA =
  "sha256:b5c7201e75f08a597db187d535be7c20d71df1693aec6885606e4ef8bfb99787";
const BOUNDARY_PATH = "boundary/line201-prefix.bin";
const BOUNDARY_BYTES = 241;
const BOUNDARY_SHA =
  "sha256:919553d3d52f6fb0314320ac516fb0b17277544bbe73330a60c1d82499228c6a";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const GIT_OID = /^[a-f0-9]{40}$/u;

const SUPPORT = Object.freeze({
  "support/README.md": {
    sourcePath: "README.md", bytes: 5_942,
    sha256: "sha256:551cbd0cbf0cb0c4857fb648db313711e2f0c7dc3592a7a215a0dee60c112926",
  },
  "support/manifest.json": {
    sourcePath: "manifest.json", bytes: 983,
    sha256: "sha256:5665a5253cfa70c86d547bb9046be3b0c056e4e4986c4c73b0836bf6596d9dbf",
  },
  "support/scripts/build_sample.py": {
    sourcePath: "scripts/build_sample.py", bytes: 2_156,
    sha256: "sha256:0462c7b6640531140e38ce8aed9fdc259222f2ebe3f56adff1a7ba5a23d38250",
  },
  "support/croissant.json": {
    sourcePath: "croissant.json", bytes: 32_323,
    sha256: "sha256:ff3fc77d626957b12b35b3b287b45d2ab4e46abe0ab499128fed798dbbe9ef2f",
  },
  "support/croissant_rai.json": {
    sourcePath: "croissant_rai.json", bytes: 2_587,
    sha256: "sha256:b164c6ce7aa1a1ad13d2b97acd74fd9423b05e9efc5520f01af2e883742be244",
  },
});

const FIXED_SOURCE_FILES = Object.freeze([
  "boundary/line201-prefix.bin",
  "metadata/boundary-range-response.json",
  "metadata/dataset-record-after.json",
  "metadata/dataset-record-before.json",
  "metadata/full-tree-after.json",
  "metadata/full-tree-before.json",
  "metadata/honest-range-response.json",
  SELECTED_PATH,
  ...Object.keys(SUPPORT),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `LINUXARENA_HAIKU_HONEST_${code}`
    : `LINUXARENA_HAIKU_HONEST_${code}:${detail}`);
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
    || Number(link.mode & 0o777n) !== 0o600
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

function datasetRecord(bytes) {
  if (sha256(bytes) !== RECORD_SHA) fail("RECORD_PIN_MISMATCH");
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, license: value.cardData?.license,
  };
  if (!same(projection, {
    id: LINUXARENA_DATASET_ID, author: "anonymouslinuxarena",
    sha: LINUXARENA_REVISION, lastModified: "2026-05-06T22:50:57.000Z",
    private: false, gated: false, disabled: false,
    usedStorage: 51_371_566_218, license: "cc-by-4.0",
  })) fail("RECORD_PROFILE_INVALID");
  return projection;
}

function fixedTree(bytes) {
  if (sha256(bytes) !== TREE_SHA) fail("TREE_PIN_MISMATCH");
  const value = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(value)) fail("TREE_INVALID");
  const entries = value.map((entry) => {
    if (!entry || typeof entry.path !== "string"
      || !["file", "directory"].includes(entry.type)
      || !Number.isSafeInteger(entry.size) || entry.size < 0
      || !GIT_OID.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
    return { path: entry.path, type: entry.type, size: entry.size, oid: entry.oid,
      lfsOid: entry.lfs?.oid ?? null, lfsSize: entry.lfs?.size ?? null };
  }).sort((left, right) => left.path < right.path ? -1 : 1);
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const sample = files.find((entry) => entry.path === SAMPLE_PATH);
  const fullShards = files.filter((entry) => entry.path.startsWith("data/")
    && entry.path !== SAMPLE_PATH);
  if (entries.length !== 19 || files.length !== 17 || directories.length !== 2
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 17_471_019_262
    || fullShards.length !== 10
    || fullShards.reduce((sum, entry) => sum + entry.size, 0) !== 16_766_486_991
    || sample?.size !== SAMPLE_BYTES || sample?.lfsSize !== SAMPLE_BYTES
    || sample?.lfsOid !== SAMPLE_LFS_SHA.slice(7)) fail("TREE_PROFILE_INVALID");
  return { entries, files, directories, sample, fullShards };
}

function rangeReceipt(bytes, expected) {
  const value = parseJson(bytes, "RANGE_RECEIPT_INVALID");
  if (!same(value, {
    schema: "outsider/http-byte-range-receipt/v1",
    datasetId: LINUXARENA_DATASET_ID, revision: LINUXARENA_REVISION,
    sourcePath: SAMPLE_PATH, requestedFirstByte: expected.first,
    requestedLastByte: expected.last, responseStatus: 206,
    contentRange: `bytes ${expected.first}-${expected.last}/${SAMPLE_BYTES}`,
    responseBytes: expected.bytes, wholeObjectBytes: SAMPLE_BYTES,
    linkedSha256Claim: SAMPLE_LFS_SHA,
    responseFileSha256: expected.sha256,
  })) fail("RANGE_RECEIPT_PROFILE_INVALID");
  return value;
}

function supportProfile(root, tree) {
  const sourceTree = new Map(tree.files.map((entry) => [entry.path, entry]));
  const bytesByPath = {};
  for (const [relative, spec] of Object.entries(SUPPORT)) {
    const bytes = readRegular(root, relative, MAX_METADATA_BYTES, spec.bytes);
    const treeEntry = sourceTree.get(spec.sourcePath);
    if (sha256(bytes) !== spec.sha256 || treeEntry?.size !== spec.bytes
      || gitBlobOid(bytes) !== treeEntry?.oid) fail("SUPPORT_PIN_MISMATCH", relative);
    bytesByPath[relative] = bytes;
  }
  const readme = new TextDecoder().decode(bytesByPath["support/README.md"]);
  const build = new TextDecoder().decode(
    bytesByPath["support/scripts/build_sample.py"]);
  if (!readme.includes("`Haiku honest` | 200")
    || !readme.includes("**Total** | **932**")
    || !readme.includes("Each listed run is included in full")
    || !build.includes(`"Haiku honest":`)
    || !build.includes(LINUXARENA_HONEST_RUN_ID)
    || !build.includes("Write in the order RUNS is declared")
    || !build.includes("rows = sorted(bucket[rid]")) {
    fail("PUBLISHER_SELECTION_NARRATIVE_INVALID");
  }
  const manifest = parseJson(bytesByPath["support/manifest.json"],
    "MANIFEST_INVALID");
  const envCountSum = Object.values(manifest.per_env_counts ?? {})
    .reduce((sum, value) => sum + value, 0);
  const envByteSum = Object.values(manifest.per_env_bytes ?? {})
    .reduce((sum, value) => sum + value, 0);
  if (manifest.repo !== LINUXARENA_DATASET_ID
    || manifest.n_runs_requested !== 172 || manifest.n_runs_with_data !== 172
    || manifest.n_trajectories !== 22_215
    || Object.keys(manifest.per_env_counts ?? {}).length !== 10
    || envCountSum !== 22_215 || envByteSum !== 16_767_709_736
    || manifest.total_bytes !== 16_767_709_736
    || !same(manifest.skipped, [])
    || !same(manifest.anonymity_flags,
      { "mongo uri": 34, "i-instance-id": 4 })) fail("MANIFEST_PROFILE_INVALID");
  const croissant = parseJson(bytesByPath["support/croissant.json"],
    "CROISSANT_INVALID");
  const croissantText = new TextDecoder().decode(
    bytesByPath["support/croissant.json"]);
  if (croissant.name !== "linuxarena-public"
    || croissant.license !== "https://creativecommons.org/licenses/by/4.0/"
    || croissant.hasSyntheticData !== true
    || croissant.personalSensitiveInformation?.startsWith("None.") !== true
    || croissantText.match(/882/gu)?.length !== 2
    || croissantText.match(/932/gu)?.length !== 1) fail("CROISSANT_PROFILE_INVALID");
  const raiText = new TextDecoder().decode(
    bytesByPath["support/croissant_rai.json"]);
  const rai = parseJson(bytesByPath["support/croissant_rai.json"],
    "CROISSANT_RAI_INVALID");
  if (raiText.match(/TODO/gu)?.length !== 4
    || !rai["rai:personalSensitiveInformation"]?.includes("TODO: confirm")
    || !rai["rai:dataSocialImpact"]?.includes("Dual-use disclosure")
    || rai["rai:dataAnnotation"]?.includes("No human annotation") !== true) {
    fail("CROISSANT_RAI_PROFILE_INVALID");
  }
  return { manifest, croissant, rai };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return { schema: "outsider/linuxarena-haiku-honest-run-source-manifest/v1",
    datasetId: LINUXARENA_DATASET_ID, revision: LINUXARENA_REVISION,
    scope: LINUXARENA_HAIKU_HONEST_SCOPE, entries: ordered,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered) };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const recordBefore = readRegular(root, "metadata/dataset-record-before.json",
    MAX_METADATA_BYTES);
  const recordAfter = readRegular(root, "metadata/dataset-record-after.json",
    MAX_METADATA_BYTES);
  const treeBefore = readRegular(root, "metadata/full-tree-before.json",
    MAX_METADATA_BYTES);
  const treeAfter = readRegular(root, "metadata/full-tree-after.json",
    MAX_METADATA_BYTES);
  if (!recordBefore.equals(recordAfter) || !treeBefore.equals(treeAfter)) {
    fail("MATERIAL_STATE_CHANGED");
  }
  const record = datasetRecord(recordBefore);
  const tree = fixedTree(treeBefore);
  const support = supportProfile(root, tree);
  const honestReceiptBytes = readRegular(root,
    "metadata/honest-range-response.json", MAX_METADATA_BYTES);
  const boundaryReceiptBytes = readRegular(root,
    "metadata/boundary-range-response.json", MAX_METADATA_BYTES);
  const selected = readRegular(root, SELECTED_PATH, MAX_SELECTED_BYTES, SELECTED_BYTES);
  const boundary = readRegular(root, BOUNDARY_PATH, MAX_METADATA_BYTES, BOUNDARY_BYTES);
  if (sha256(selected) !== SELECTED_SHA || sha256(boundary) !== BOUNDARY_SHA) {
    fail("RANGE_BYTES_PIN_MISMATCH");
  }
  const honestReceipt = rangeReceipt(honestReceiptBytes, {
    first: 0, last: SELECTED_BYTES - 1, bytes: SELECTED_BYTES, sha256: SELECTED_SHA,
  });
  const boundaryReceipt = rangeReceipt(boundaryReceiptBytes, {
    first: SELECTED_BYTES, last: SELECTED_BYTES + BOUNDARY_BYTES - 1,
    bytes: BOUNDARY_BYTES, sha256: BOUNDARY_SHA,
  });
  const expected = [...FIXED_SOURCE_FILES,
    ...(withManifest ? ["source-manifest.json"] : [])];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  const entries = [];
  for (const relative of FIXED_SOURCE_FILES) {
    const maximum = relative === SELECTED_PATH ? MAX_SELECTED_BYTES : MAX_METADATA_BYTES;
    const bytes = readRegular(root, relative, maximum);
    entries.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
  }
  return { root, record, tree, support, honestReceipt, boundaryReceipt, entries };
}

export function createLinuxArenaHaikuHonestSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, pathlib, re, sys

source = pathlib.Path(sys.argv[1])
selected_path = source / 'selection' / 'haiku-honest.jsonl'
boundary_path = source / 'boundary' / 'line201-prefix.bin'

def die(code):
    raise RuntimeError('LINUXARENA_HAIKU_HONEST_PYTHON_' + code)

root_keys = {'trajectory_id','run_id','run_display_name','trajectory_url','actions',
             'main_task_success','side_task_success','scorer_explanation',
             'traj_monitor_response','environment','main_task','side_task',
             'agent_model','system_prompt','initial_user_message','attack_analysis'}
action_keys = {'function','arguments','output','output_error','agent_reasoning',
               'extended_thinking','inter_action_messages','monitor_response','substeps'}
rows = []
raw = selected_path.read_bytes()
if len(raw) != 62762384 or not raw.endswith(b'\n'):
    die('SELECTED_BYTE_PROFILE_INVALID')
lines = raw.splitlines(keepends=True)
if len(lines) != 200 or any(not line.endswith(b'\n') for line in lines):
    die('LINE_CENSUS_INVALID')
for line in lines:
    try:
        row = json.loads(line)
    except Exception:
        die('JSONL_INVALID')
    if not isinstance(row, dict) or set(row) != root_keys:
        die('ROW_SCHEMA_INVALID')
    if not isinstance(row.get('actions'), list):
        die('ACTIONS_INVALID')
    if any(not isinstance(action, dict) or set(action) != action_keys
           for action in row['actions']):
        die('ACTION_SCHEMA_INVALID')
    rows.append(row)

if any(row['run_id'] != '06f0f3e82bf347d9a1271f806ee2234d'
       or row['run_display_name'] != 'Haiku honest' for row in rows):
    die('RUN_IDENTITY_INVALID')
trajectory_ids = [row['trajectory_id'] for row in rows]
task_ids = [row.get('main_task', {}).get('id') for row in rows]
if (len(set(trajectory_ids)) != 200 or len(set(task_ids)) != 200
        or trajectory_ids != sorted(trajectory_ids)
        or any(not isinstance(value, str) for value in task_ids)):
    die('TASK_OR_TRAJECTORY_CENSUS_INVALID')

env_counts = collections.Counter(row.get('environment', {}).get('id') for row in rows)
expected_envs = {
 'auto_workflow':20,'clinical_trial':20,'file_indexing':20,
 'media_processing':20,'model_registry':20,'shared_dotfiles':20,
 'slack_clone':20,'tiktok':20,'user_tracking':20,'web_scraping':20}
if dict(sorted(env_counts.items())) != expected_envs:
    die('ENVIRONMENT_CENSUS_INVALID')

actions = [action for row in rows for action in row['actions']]
errors = [action for action in actions if action.get('output_error') is not None]
if any(not isinstance(action['output_error'], str) or not action['output_error']
       for action in errors):
    die('OUTPUT_ERROR_SCHEMA_INVALID')
error_rows = [row for row in rows
              if any(action.get('output_error') is not None for action in row['actions'])]
later_nonerror = 0
for row in error_rows:
    first = next(index for index, action in enumerate(row['actions'])
                 if action.get('output_error') is not None)
    later_nonerror += any(action.get('output_error') is None
                          for action in row['actions'][first + 1:])

function_counts = dict(sorted(collections.Counter(
    action.get('function') for action in actions).items()))
expected_functions = {
 'bash':9230,'client_bash':10,'db_bash':11,'mp_restart':11,'nginx_bash':1,
 'py_ml_bash':13,'rust_worker_bash':56,'submit':189,'text_editor':5238}
if function_counts != expected_functions:
    die('FUNCTION_PROFILE_INVALID')

main_outcomes = collections.Counter(str(row['main_task_success']).lower() for row in rows)
side_outcomes = collections.Counter(str(row['side_task_success']).lower() for row in rows)
agent_models = collections.Counter(
    'null' if row['agent_model'] is None else row['agent_model'] for row in rows)
if (dict(sorted(main_outcomes.items())) != {'false':97,'true':103}
        or dict(sorted(side_outcomes.items())) != {'false':200}
        or any(row['side_task'] is not None for row in rows)
        or dict(sorted(agent_models.items())) !=
           {'claude-haiku-4-5-20251001':18,'null':182}
        or len(actions) != 14759 or len(errors) != 321
        or len(error_rows) != 180 or later_nonerror != 180):
    die('AGGREGATE_PROFILE_INVALID')

shape = hashlib.sha256()
for index, row in enumerate(rows):
    item = {
      'index': index,
      'trajectoryIdHash': hashlib.sha256(row['trajectory_id'].encode()).hexdigest(),
      'taskIdHash': hashlib.sha256(row['main_task']['id'].encode()).hexdigest(),
      'environment': row['environment']['id'], 'actions': len(row['actions']),
      'mainTaskSuccess': row['main_task_success']}
    encoded = json.dumps(item, sort_keys=True, separators=(',', ':')).encode()
    shape.update(len(encoded).to_bytes(8, 'big'))
    shape.update(encoded)

patterns = {
 'email': re.compile(rb'(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9.-])'),
 'mongoUri': re.compile(rb'mongodb(?:\+srv)?://', re.I),
 'awsAccessKey': re.compile(rb'AKIA[0-9A-Z]{16}'),
 'privateKey': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 'instanceId': re.compile(rb'\bi-[0-9a-f]{8,17}\b')}
pattern_counts = {name: len(pattern.findall(raw)) for name, pattern in patterns.items()}
if pattern_counts != {'email':1509,'mongoUri':0,'awsAccessKey':0,
                      'privateKey':0,'instanceId':0}:
    die('PRIVACY_PATTERN_PROFILE_INVALID')

boundary = boundary_path.read_bytes()
if (len(boundary) != 241 or not boundary.startswith(b'{')
        or not boundary.endswith(b'"actions": ')
        or b'\n' in boundary or b'[' in boundary):
    die('BOUNDARY_PREFIX_INVALID')
try:
    boundary_header = json.loads(boundary + b'[]}')
except Exception:
    die('BOUNDARY_HEADER_INVALID')
if (set(boundary_header) != {'trajectory_id','run_id','run_display_name',
                             'trajectory_url','actions'}
        or boundary_header['trajectory_id'] != '031d1ca9c45d40c98251ff18f50ca6ea'
        or boundary_header['run_id'] != '2b313d861a1c41d4a0f7f28deaccae7a'
        or boundary_header['run_display_name'] != 'Haiku attack'
        or boundary_header['actions'] != []):
    die('BOUNDARY_IDENTITY_INVALID')

print(json.dumps({
 'selectedRows':200,'selectedBytes':len(raw),'uniqueTrajectoryIds':200,
 'uniqueMainTaskIds':200,'trajectoryIdsSortedByPublisherBuilder':True,
 'runId':'06f0f3e82bf347d9a1271f806ee2234d',
 'runDisplayName':'Haiku honest','environmentRows':dict(sorted(env_counts.items())),
 'mainTaskSuccess':dict(sorted(main_outcomes.items())),
 'sideTaskNullRows':sum(row['side_task'] is None for row in rows),
 'sideTaskSuccess':dict(sorted(side_outcomes.items())),
 'actionRows':len(actions),'actionFunctionRows':function_counts,
 'outputErrorActionRows':len(errors),'tracesWithOutputError':len(error_rows),
 'outputErrorTracesWithLaterNonerrorAction':later_nonerror,
 'submitActionRows':sum(action['function']=='submit' for action in actions),
 'tracesWithSubmitAction':sum(any(action['function']=='submit' for action in row['actions']) for row in rows),
 'agentModelValues':dict(sorted(agent_models.items())),
 'agentModelPresentRows':sum(row['agent_model'] is not None for row in rows),
 'initialUserMessagePresentRows':sum(row['initial_user_message'] is not None for row in rows),
 'trajectoryMonitorResponsePresentRows':sum(row['traj_monitor_response'] is not None for row in rows),
 'actionMonitorResponsePresentRows':sum(action['monitor_response'] is not None for action in actions),
 'actionReasoningPresentRows':sum(bool(action['agent_reasoning']) for action in actions),
 'actionExtendedThinkingPresentRows':sum(bool(action['extended_thinking']) for action in actions),
 'attackAnalysisPresentRows':sum(row['attack_analysis'] is not None for row in rows),
 'selectedShapeRoot':'sha256:'+shape.hexdigest(),
 'privacyPatternCandidates':pattern_counts,
 'privacyPatternScanIsNotAnonymityProof':True,
 'boundaryPrefixBytes':len(boundary),
 'boundaryNextRunId':boundary_header['run_id'],
 'boundaryNextRunDisplayName':boundary_header['run_display_name'],
 'boundaryAttackActionBytesStored':0,
 'completeAttackTrajectoryRowsStored':0,
 'downloadedToolInputsCommandsOrCodeExecuted':False,
 'rawContentProjected':False,
}, sort_keys=True, separators=(',', ':')))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_LINUXARENA_PYTHON ?? "/opt/anaconda3/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim() ?? result.status);
  }
  let value;
  try { value = JSONParse(result.stdout); } catch { fail("REPLAY_OUTPUT_INVALID"); }
  return deepFreeze(value);
}

export function buildLinuxArenaHaikuHonestArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const stored = readRegular(collected.root, "source-manifest.json", MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: LINUXARENA_HAIKU_HONEST_SCHEMA,
    disposition: LINUXARENA_HAIKU_HONEST_DISPOSITION,
    scope: {
      kind: LINUXARENA_HAIKU_HONEST_SCOPE,
      datasetId: LINUXARENA_DATASET_ID, revision: LINUXARENA_REVISION,
      selectedSourceObject: SAMPLE_PATH,
      selectedInclusiveByteRange: [0, SELECTED_BYTES - 1],
      selectedBytes: SELECTED_BYTES, selectedRows: 200,
      runId: LINUXARENA_HONEST_RUN_ID, runDisplayName: "Haiku honest",
      publisherSaysReviewerSampleRunsIncludedInFull: true,
      publisherBuilderDeclaresThisRunFirstAndSortsByTrajectoryId: true,
      nextRunHeaderBoundaryProven: true, nextRunDisplayName: "Haiku attack",
      randomRowTruncationApplied: false,
    },
    source: {
      lastModified: collected.record.lastModified, public: true, gated: false,
      cardLicenseClaim: "CC-BY-4.0", usedStorageBytes: 51_371_566_218,
      fixedRevisionTreeEntries: 19, fixedRevisionFiles: 17,
      fixedRevisionDirectories: 2, fixedRevisionFileBytes: 17_471_019_262,
      fullEnvironmentShardFiles: 10,
      fixedTreeFullEnvironmentShardBytes: 16_766_486_991,
      sampleObjectBytes: SAMPLE_BYTES,
      sampleObjectLfsSha256Claim: SAMPLE_LFS_SHA,
      exactRangeResponsesWereHttp206: true,
      selectedRangeFileSha256: SELECTED_SHA,
      boundaryRangeFileSha256: BOUNDARY_SHA,
      recordAndTreeStateStable: true,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
    },
    publisherCorpus: {
      manifestTrajectoryClaim: 22_215, manifestRunClaim: 172,
      manifestEnvironmentClaim: 10,
      manifestTotalBytesClaim: 16_767_709_736,
      fixedTreeFullShardBytes: 16_766_486_991,
      manifestMinusFixedTreeShardBytes: 1_222_745,
      manifestDataSha256Claim:
        collected.support.manifest.data_sha256,
      fullManifestDataSha256IndependentlyVerified: false,
      fullEnvironmentShardsAcquired: false,
      fullSourceCorpusReconstructed: false,
      reviewerSamplePublisherRowClaim: 932,
      reviewerSampleObjectFullyAcquired: false,
      reviewerSampleObjectWholeSha256IndependentlyVerified: false,
    },
    supportConsistency: {
      readmeAndBuilderReviewerSampleRows: 932,
      croissantStaleReviewerSampleRows: 882,
      reviewerSampleCountMetadataConsistent: false,
      croissantRaiTodoMarkers: 4,
      croissantRaiManualPrivacyConfirmationStillTodo: true,
      croissantRaiSaysNoHumanAnnotation: true,
      currentCroissantSaysHumanRedTeamersAndHumanReviewPresent: true,
      annotationMetadataConsistent: false,
    },
    replay: { ...replay,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")) },
    selection: {
      publisherDerivedReviewerSample: true,
      completePublisherListedRun: true,
      completePublishedRunRows: 200,
      completeRunTaskCensusRows: 200,
      completeRunEnvironments: 10, rowsPerEnvironment: 20,
      completeAttemptCensusIndependentlyRebuiltFromFullShards: false,
      broaderLinuxArenaCorpusExhausted: false,
      attackRunsExcludedByDesign: true,
    },
    execution: {
      publisherRecordedDockerAgentTrajectoryRows: 200,
      syntheticLinuxEnvironmentRows: 200,
      recordedSoftwareToolActionRows: replay.actionRows,
      physicalWorldExecutionRows: 0, robotExecutionRows: 0,
      selectedActionContentIsUntrustedActiveContent: true,
      downloadedToolInputsCommandsOrCodeExecuted: false,
    },
    outcome: {
      publisherNativeMainTaskOutcomeRows: 200,
      publisherMainTaskSuccessTrueRows: 103,
      publisherMainTaskSuccessFalseRows: 97,
      publisherScorerExplanationRows: 200,
      publisherSaysDeterministicEnvironmentPythonScorers: true,
      scorerImplementationBytesAcquired: 0,
      outcomeProducerIndependentFromExecutionSystem: false,
      independentlyVerifiedOutcomeRows: 0,
      completePublisherRunAttemptCensusRows: 200,
      completeAttemptCensusReconstructedFromFullShards: false,
      realWorldOutcomeRows: 0,
    },
    recovery: {
      outputErrorActionRows: replay.outputErrorActionRows,
      tracesWithOutputError: replay.tracesWithOutputError,
      outputErrorTracesWithLaterNonerrorAction:
        replay.outputErrorTracesWithLaterNonerrorAction,
      laterNonerrorActionIsMorphologyNotRecovery: true,
      publisherNativeRecoveryLabelRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      longitudinalRecoveryRows: 0,
    },
    privacy: {
      publisherSyntheticDataClaim: true,
      publisherPersonalSensitiveInformationClaim: "None",
      manifestAnonymityFlagCounts:
        collected.support.manifest.anonymity_flags,
      croissantRaiManualInspectionConfirmationComplete: false,
      selectedEmailPatternCandidates: replay.privacyPatternCandidates.email,
      selectedHighConfidenceSecretPatternCandidates:
        replay.privacyPatternCandidates.awsAccessKey
        + replay.privacyPatternCandidates.privateKey,
      candidatePatternsMayMatchSyntheticContent: true,
      independentAnonymityAuditRows: 0,
      anonymizationCertified: false, noPiiOrSecretGuaranteed: false,
      privacyPatternScanIsNotAnonymityProof: true,
      rawSourcePrivate: true, rawProjectionRows: 0,
    },
    safety: {
      selectedHonestTrajectoryRows: 200, selectedSideTaskRows: 0,
      completeAttackTrajectoryRowsStored: 0,
      attackActionBytesStored: replay.boundaryAttackActionBytesStored,
      attackBoundaryHeaderBytesStored: replay.boundaryPrefixBytes,
      containsFullToolArgumentsOutputsAndReasoning: true,
      harmfulOrDualUsePayloadRiskPresent: true,
      rawContentMustNotBeExecuted: true,
    },
    rights: {
      trajectoryLicenseClaim: "CC-BY-4.0",
      bundledSupportCodeRightsIndependentlyAdjudicated: false,
      modelGeneratedContentRightsIndependentlyAdjudicated: false,
      legalConclusionEstablished: false,
      authorizedTrainingRows: 0, redistributionAuthorizedByThisArtifact: false,
    },
    denominators: {
      PUBLISHER_DERIVED_COMPLETE_RUN_TRAJECTORY: 200,
      PUBLISHER_NATIVE_MAIN_TASK_OUTCOME: 200,
      RECORDED_SOFTWARE_TOOL_ACTION: replay.actionRows,
      OUTPUT_ERROR_ACTION: replay.outputErrorActionRows,
      INDEPENDENTLY_VERIFIED_OUTCOME: 0,
      crossPopulationTotal: null, additionProhibited: true,
    },
    boundary: {
      independentlyVerifiedOutcomeRows: 0,
      publisherNativeRecoveryLabelRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      physicalEffectRows: 0, preActionDelegationRows: 0,
      authorizedTrainingRows: 0, productionTrainingRows: 0,
      networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
      pricingRows: 0, authorityRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createLinuxArenaHaikuHonestReceipt(
  report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: LINUXARENA_HAIKU_HONEST_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: LINUXARENA_HAIKU_HONEST_DISPOSITION,
    scope: LINUXARENA_HAIKU_HONEST_SCOPE,
    publisherDerivedCompleteRunRows: 200,
    publisherNativeMainTaskOutcomeRows: 200,
    independentlyVerifiedOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0,
    completeAttackTrajectoryRowsStored: 0,
    authorizedTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, authorityRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyLinuxArenaHaikuHonestArtifactDirectory(
  directory, options = {}) {
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
    const built = buildLinuxArenaHaikuHonestArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createLinuxArenaHaikuHonestReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeLinuxArenaHaikuHonestArtifact(value) {
  return serialize(value);
}
