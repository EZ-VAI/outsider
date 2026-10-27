/*
 * Source-bound replay of one complete physical SWE-smith `tool` Parquet shard.
 *
 * The fixed repository contains four eight-file representations (`ticks`,
 * `tool`, legacy/unconfigured `train`, and `xml`). This adapter deliberately
 * does not add their row counts or claim full-dataset coverage. Raw messages,
 * thoughts, tool arguments/results, and patches remain private.
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

export const SWE_SMITH_TOOL_SHARD_SCHEMA =
  "outsider/swe-smith-tool-shard/v1";
export const SWE_SMITH_TOOL_SHARD_RECEIPT_SCHEMA =
  "outsider/swe-smith-tool-shard-receipt/v1";
export const SWE_SMITH_DATASET_ID = "SWE-bench/SWE-smith-trajectories";
export const SWE_SMITH_REVISION =
  "08e109b4a59eaeebf80e4675cd125d42e7ac99a4";
export const SWE_SMITH_TOOL_SHARD_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/swe-smith-tool-shard-report/v1";
const RECEIPT_DOMAIN = "outsider/swe-smith-tool-shard-receipt/v1";
const MANIFEST_DOMAIN = "outsider/swe-smith-tool-shard-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/swe-smith-tool-shard-source-root/v1";
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_SHARD_BYTES = 80 * 1024 * 1024;
const SELECTED_SHARD = Object.freeze({
  path: "data/tool-00004-of-00008.parquet",
  bytes: 77_754_558,
  sha256: "sha256:e41ffbd3f9d1571917ac5b9f4d0108ded4799d9776f597a054203467135a5715",
  gitPointerOid: "202ae5800f5d8c0bb515fe62973707dab7095d8e",
  xetHash: "53042a28c280e7b81ecf06d1a768d99676ec7f0ecb5f55800fb6dbcd18b3f07f",
});
const SUPPORT = Object.freeze([
  Object.freeze({ path: ".gitattributes", bytes: 2_461,
    gitOid: "1ef325f1b111266a6b26e0196871bd78baa8c2f3",
    sha256: "sha256:e7a120ab07b1bc5b486be249e9fc6c83d59448d0093e1dfebe95d1566d9cafc0" }),
  Object.freeze({ path: "README.md", bytes: 1_675,
    gitOid: "45c3393577f392756de3f08aced5cfd18b7c9fad",
    sha256: "sha256:1fa2f5971a723a60a6ca60a5842aa83eb78259bfd175bce9a80692c5a2248aa0" }),
]);
const TREE_PROFILE = Object.freeze({ entries: 35, files: 34, directories: 1,
  totalFileBytes: 4_223_845_920, parquetFiles: 32,
  prefixBytes: Object.freeze({ ticks: 1_018_711_426, tool: 1_077_271_863,
    train: 1_052_703_887, xml: 1_075_154_608, support: 4_136 }) });
const METADATA_FILES = Object.freeze([
  "dataset-record-after.json", "dataset-record-before.json",
  "full-tree-after.json", "full-tree-before.json",
]);
const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code, detail = null) {
  throw new Error(detail === null ? `SWE_SMITH_TOOL_SHARD_${code}`
    : `SWE_SMITH_TOOL_SHARD_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function gitBlobOid(bytes) {
  const header = BufferFrom(`blob ${bytes.length}\0`, "utf8");
  return createHash("sha1").update(header).update(bytes).digest("hex");
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
    else if (child.isFile() && Number(child.mode & 0o777n) === 0o600) result.push(relative);
    else fail("SOURCE_ENTRY_UNSAFE", relative);
  }
  return result;
}

function recordProjection(bytes) {
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const splits = value.cardData?.dataset_info?.splits;
  const result = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, cardLicense: value.cardData?.license,
    splitRows: Array.isArray(splits)
      ? Object.fromEntries(splits.map((split) => [split.name, split.num_examples]))
      : null,
  };
  if (!same(result, {
    id: SWE_SMITH_DATASET_ID, author: "SWE-bench", sha: SWE_SMITH_REVISION,
    lastModified: "2025-07-19T01:18:16.000Z", private: false,
    gated: false, disabled: false, usedStorage: 8_777_676_392,
    cardLicense: "mit",
    splitRows: { ticks: 25_826, tool: 24_100, xml: 26_076 },
  })) fail("RECORD_PROFILE_INVALID");
  return result;
}

function treeProjection(bytes) {
  const value = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(value)) fail("TREE_INVALID");
  const entries = value.map((entry) => ({
    path: entry?.path, type: entry?.type, size: entry?.size,
    oid: entry?.oid, lfsOid: entry?.lfs?.oid ?? null,
    lfsSize: entry?.lfs?.size ?? null, xetHash: entry?.xetHash ?? null,
  })).sort((left, right) => left.path < right.path ? -1 : 1);
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const byPrefix = { support: 0, ticks: 0, tool: 0, train: 0, xml: 0 };
  for (const entry of files) {
    if (typeof entry.path !== "string" || !Number.isSafeInteger(entry.size)
      || entry.size < 1 || !/^[a-f0-9]{40}$/u.test(entry.oid ?? "")) {
      fail("TREE_ENTRY_INVALID");
    }
    const match = /^data\/(ticks|tool|train|xml)-/u.exec(entry.path);
    byPrefix[match?.[1] ?? "support"] += entry.size;
  }
  const selected = files.find((entry) => entry.path === SELECTED_SHARD.path);
  if (entries.length !== TREE_PROFILE.entries || files.length !== TREE_PROFILE.files
    || directories.length !== TREE_PROFILE.directories
    || files.reduce((sum, entry) => sum + entry.size, 0)
      !== TREE_PROFILE.totalFileBytes
    || files.filter((entry) => entry.path.endsWith(".parquet")).length
      !== TREE_PROFILE.parquetFiles
    || !same(byPrefix, TREE_PROFILE.prefixBytes)
    || directories.length !== 1 || directories[0].path !== "data"
    || selected?.size !== SELECTED_SHARD.bytes
    || selected?.oid !== SELECTED_SHARD.gitPointerOid
    || selected?.lfsOid !== SELECTED_SHARD.sha256.slice(7)
    || selected?.lfsSize !== SELECTED_SHARD.bytes
    || selected?.xetHash !== SELECTED_SHARD.xetHash
    || files.filter((entry) => /^data\/tool-/u.test(entry.path)).length !== 8
    || files.filter((entry) => /^data\/ticks-/u.test(entry.path)).length !== 8
    || files.filter((entry) => /^data\/train-/u.test(entry.path)).length !== 8
    || files.filter((entry) => /^data\/xml-/u.test(entry.path)).length !== 8) {
    fail("TREE_PROFILE_INVALID");
  }
  return { entries, byPrefix };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/swe-smith-tool-shard-source-manifest/v1",
    datasetId: SWE_SMITH_DATASET_ID, revision: SWE_SMITH_REVISION,
    selectedShard: SELECTED_SHARD.path, entries: ordered,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const expected = [
    ...METADATA_FILES.map((file) => `metadata/${file}`),
    "files/.gitattributes", "files/README.md",
    `files/${SELECTED_SHARD.path}`,
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  const metadata = new Map();
  const entries = [];
  for (const file of METADATA_FILES) {
    const bytes = readRegular(root, `metadata/${file}`, MAX_METADATA_BYTES);
    metadata.set(file, bytes);
    entries.push({ path: `metadata/${file}`, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const recordBefore = recordProjection(metadata.get("dataset-record-before.json"));
  const recordAfter = recordProjection(metadata.get("dataset-record-after.json"));
  const treeBefore = treeProjection(metadata.get("full-tree-before.json"));
  const treeAfter = treeProjection(metadata.get("full-tree-after.json"));
  if (!same(recordBefore, recordAfter) || !same(treeBefore, treeAfter)) {
    fail("MATERIAL_STATE_CHANGED");
  }
  for (const item of SUPPORT) {
    const bytes = readRegular(root, `files/${item.path}`, item.bytes, item.bytes);
    if (sha256(bytes) !== item.sha256 || gitBlobOid(bytes) !== item.gitOid) {
      fail("SUPPORT_PIN_MISMATCH", item.path);
    }
    entries.push({ path: `files/${item.path}`, bytes: bytes.length,
      sha256: item.sha256 });
  }
  const shard = readRegular(root, `files/${SELECTED_SHARD.path}`,
    MAX_SHARD_BYTES, SELECTED_SHARD.bytes);
  if (sha256(shard) !== SELECTED_SHARD.sha256) fail("SHARD_PIN_MISMATCH");
  entries.push({ path: `files/${SELECTED_SHARD.path}`, bytes: shard.length,
    sha256: SELECTED_SHARD.sha256 });
  return { root, record: recordBefore, tree: treeBefore, entries };
}

export function createSweSmithToolShardSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, pathlib, sys
import pyarrow.parquet as pq

root = pathlib.Path(sys.argv[1])
file = root / 'files' / 'data' / 'tool-00004-of-00008.parquet'

def die(code):
    raise RuntimeError('SWE_SMITH_TOOL_SHARD_PYTHON_' + code)

parquet = pq.ParquetFile(file)
expected_schema = {
  'messages': 'string', 'instance_id': 'string', 'resolved': 'bool',
  'model': 'string', 'traj_id': 'string', 'patch': 'string',
}
schema = {field.name: str(field.type) for field in parquet.schema_arrow}
if (schema != expected_schema or parquet.metadata.num_rows != 3012
        or parquet.metadata.num_row_groups != 4
        or parquet.metadata.num_columns != 6):
    die('PARQUET_PROFILE_INVALID')
table = parquet.read()
if any(table.column(name).null_count != 0 for name in expected_schema):
    die('NULL_VALUE_FORBIDDEN')
columns = table.to_pydict()

models = collections.Counter()
roles = collections.Counter()
content_types = collections.Counter()
instance_outcomes = collections.defaultdict(list)
patch_by_outcome = collections.Counter()
call_ids = set()
result_ids = set()
shape_rows = []
messages = tool_calls = result_ids_seen = 0
actions_present = thoughts_present = content_text_blocks = 0
minimum_messages = None
maximum_messages = 0
empty_patches = 0
patch_hashes = set()

for index in range(3012):
    raw = columns['messages'][index]
    instance = columns['instance_id'][index]
    resolved = columns['resolved'][index]
    model = columns['model'][index]
    trajectory = columns['traj_id'][index]
    patch = columns['patch'][index]
    if (not isinstance(raw, str) or not isinstance(instance, str) or not instance
            or not isinstance(resolved, bool) or not isinstance(model, str) or not model
            or not isinstance(trajectory, str) or not trajectory
            or not isinstance(patch, str)):
        die('ROW_SCHEMA_INVALID')
    try:
        conversation = json.loads(raw)
    except Exception as error:
        die('MESSAGE_JSON_INVALID')
    if not isinstance(conversation, list) or len(conversation) < 1:
        die('MESSAGE_LIST_INVALID')
    local_calls = 0
    for message in conversation:
        if (not isinstance(message, dict)
                or message.get('role') not in ('assistant', 'system', 'tool', 'user')):
            die('MESSAGE_INVALID')
        roles[message['role']] += 1
        content = message.get('content')
        if isinstance(content, str):
            content_types['string'] += 1
        elif isinstance(content, list):
            content_types['list'] += 1
            for block in content:
                if not isinstance(block, dict) or block.get('type') != 'text':
                    die('CONTENT_BLOCK_INVALID')
                content_text_blocks += 1
        else:
            die('CONTENT_INVALID')
        if message.get('action') not in (None, ''):
            actions_present += 1
        if message.get('thought') not in (None, ''):
            thoughts_present += 1
        calls = message.get('tool_calls')
        if calls is not None:
            if not isinstance(calls, list):
                die('TOOL_CALL_LIST_INVALID')
            for call in calls:
                if (not isinstance(call, dict)
                        or set(call) != {'function', 'id', 'index', 'type'}
                        or not isinstance(call['id'], str) or not call['id']
                        or call['id'] in call_ids):
                    die('TOOL_CALL_INVALID')
                call_ids.add(call['id'])
                local_calls += 1
        ids = message.get('tool_call_ids')
        if ids is not None:
            if not isinstance(ids, list):
                die('TOOL_RESULT_ID_LIST_INVALID')
            for identity in ids:
                if (not isinstance(identity, str) or not identity
                        or identity in result_ids):
                    die('TOOL_RESULT_ID_INVALID')
                result_ids.add(identity)
                result_ids_seen += 1
    messages += len(conversation)
    tool_calls += local_calls
    minimum_messages = len(conversation) if minimum_messages is None else min(
        minimum_messages, len(conversation))
    maximum_messages = max(maximum_messages, len(conversation))
    instance_outcomes[instance].append(resolved)
    models[model] += 1
    patch_by_outcome[(resolved, bool(patch))] += 1
    if patch:
        patch_hashes.add(hashlib.sha256(patch.encode()).hexdigest())
    else:
        empty_patches += 1
    shape_rows.append({
      'instanceHash': hashlib.sha256(instance.encode()).hexdigest(),
      'trajectoryHash': hashlib.sha256(trajectory.encode()).hexdigest(),
      'resolved': resolved, 'model': model, 'messages': len(conversation),
      'toolCalls': local_calls, 'patchPresent': bool(patch),
    })

if not result_ids.issubset(call_ids):
    die('TOOL_RESULT_WITHOUT_CALL')
outcome_profiles = collections.Counter((len(values), sum(values))
    for values in instance_outcomes.values())
expected_profiles = {
  (1, 0): 1390, (1, 1): 994, (2, 0): 17, (2, 1): 2,
  (2, 2): 1, (3, 0): 70, (3, 1): 53, (3, 2): 15, (3, 3): 58,
}
expected_models = {
  'claude-3-5-sonnet-20241022': 1987,
  'claude-3-7-sonnet-20250219': 972,
  'gpt-4o-2024-08-06': 53,
}
expected_roles = {'assistant': 66291, 'system': 3012, 'tool': 16961, 'user': 49330}
expected_patch = {(False, False): 601, (False, True): 1156,
                  (True, False): 528, (True, True): 727}
if (dict(models) != expected_models or dict(roles) != expected_roles
        or dict(content_types) != {'string': 119814, 'list': 15780}
        or messages != 135594 or tool_calls != 17654 or result_ids_seen != 16961
        or len(call_ids) != 17654 or len(result_ids) != 16961
        or len(call_ids - result_ids) != 693 or actions_present != 17654
        or thoughts_present != 15953 or content_text_blocks != 15780
        or minimum_messages != 7 or maximum_messages != 241
        or len(instance_outcomes) != 2600 or dict(outcome_profiles) != expected_profiles
        or dict(patch_by_outcome) != expected_patch or empty_patches != 1129
        or len(patch_hashes) != 1751):
    die('AGGREGATE_INVALID')

root_hash = hashlib.sha256()
for row in shape_rows:
    encoded = json.dumps(row, sort_keys=True, separators=(',', ':')).encode()
    root_hash.update(len(encoded).to_bytes(8, 'big'))
    root_hash.update(encoded)

print(json.dumps({
  'physicalShard': 'tool-00004-of-00008', 'parquetRows': 3012,
  'parquetRowGroups': 4, 'schemaColumns': 6,
  'messages': messages, 'minimumMessagesPerTrajectory': minimum_messages,
  'maximumMessagesPerTrajectory': maximum_messages,
  'messageRoles': dict(sorted(roles.items())),
  'stringContentMessages': content_types['string'],
  'listContentMessages': content_types['list'],
  'textBlocksWithinListContent': content_text_blocks,
  'embeddedToolCalls': tool_calls, 'toolResultIdentityRows': result_ids_seen,
  'toolCallsWithoutResultIdentity': len(call_ids - result_ids),
  'allToolResultIdentitiesMatchUniquePriorOrPeerCallIds': True,
  'messageActionFieldsPresent': actions_present,
  'messageThoughtFieldsPresent': thoughts_present,
  'models': dict(sorted(models.items())),
  'uniqueInstanceIds': len(instance_outcomes),
  'singleTrajectoryInstances': 2384, 'repeatedInstanceIds': 216,
  'sameInstanceMixedPublisherOutcomeGroups': 70,
  'publisherResolvedRows': 1255, 'publisherUnresolvedRows': 1757,
  'emptyPatchRows': empty_patches, 'nonemptyPatchRows': 3012 - empty_patches,
  'uniqueNonemptyPatchHashes': len(patch_hashes),
  'resolvedWithoutPatchRows': 528, 'unresolvedWithPatchRows': 1156,
  'trajectoryShapeRoot': 'sha256:' + root_hash.hexdigest(),
  'rawMessagesThoughtsActionsToolArgumentsResultsAndPatchesProjected': False,
}, sort_keys=True, separators=(',', ':')))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_SWE_SMITH_PYTHON ?? ".venv/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim() ?? result.status);
  }
  let value;
  try { value = JSONParse(result.stdout); } catch { fail("REPLAY_OUTPUT_INVALID"); }
  return deepFreeze(value);
}

export function buildSweSmithToolShardArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const stored = readRegular(collected.root, "source-manifest.json", MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: SWE_SMITH_TOOL_SHARD_SCHEMA,
    disposition: SWE_SMITH_TOOL_SHARD_DISPOSITION,
    source: {
      datasetId: SWE_SMITH_DATASET_ID, revision: SWE_SMITH_REVISION,
      lastModified: collected.record.lastModified, public: true, gated: false,
      selectedShard: SELECTED_SHARD.path, selectedShardBytes: SELECTED_SHARD.bytes,
      selectedShardSha256: SELECTED_SHARD.sha256,
      fullFixedRevisionTreeEntries: TREE_PROFILE.entries,
      fullFixedRevisionFiles: TREE_PROFILE.files,
      fullFixedRevisionFileBytes: TREE_PROFILE.totalFileBytes,
      fullFixedRevisionParquetFiles: TREE_PROFILE.parquetFiles,
      physicalRepresentationBytes: TREE_PROFILE.prefixBytes,
      fullTreeInventoried: true, fullRepositoryPayloadAcquired: false,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
      materialRecordAndTreeStateStable: true,
    },
    replay: { ...replay,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")) },
    selection: {
      representation: "tool", physicalShardOrdinal: 4,
      physicalShardCountWithinToolRepresentation: 8,
      selectedBecauseSmallestPhysicalToolShard: true,
      selectedShardRows: 3_012,
      publisherDeclaredToolRows: 24_100,
      publisherDeclaredXmlRows: 26_076,
      publisherDeclaredTicksRows: 25_826,
      unconfiguredLegacyTrainFilesPresent: 8,
      readmeNarrativeTrajectoryCount: 5_017,
      readmeCountConsistentWithPublishedSplitRows: false,
      crossRepresentationIdentityDedupeReplayed: false,
      crossRepresentationRowsMayNotBeAdded: true,
      representativenessEstablished: false,
      completeSelectedPhysicalShard: true,
      completeToolRepresentation: false,
      completeDataset: false,
      sourceUniverseExhausted: false,
    },
    denominators: {
      TOOL_REPRESENTATION_TRAJECTORY_ROW_IN_SELECTED_PHYSICAL_SHARD: 3_012,
      MESSAGE_RECORD_WITHIN_SELECTED_ROWS: 135_594,
      EMBEDDED_TOOL_CALL_WITHIN_SELECTED_ROWS: 17_654,
      crossRepresentationTotal: null, crossPopulationTotal: null,
      additionProhibited: true,
    },
    outcome: {
      publisherResolvedRows: 1_255, publisherUnresolvedRows: 1_757,
      publisherResolutionIndependentlyRerun: false,
      sameInstanceMixedPublisherOutcomeGroups: 70,
      sameInstanceGroupsHaveChronologicalRetryOrder: false,
      patchPresenceIsNotEquivalentToResolution: true,
      independentOutcomeRows: 0, realWorldOutcomeRows: 0,
      longitudinalOutcomeRows: 0, recoveryEpisodeRows: 0,
    },
    rights: {
      datasetCardLicenseClaim: "MIT", licenseFilePresent: false,
      generatedTrajectoryUpstreamRepositoryLicensesReplayed: false,
      publisherFineTuningUseClaimPresent: true,
      selectedShardMembershipInNarratedFiveThousandSeventeenEstablished: false,
      useSpecificTrainingAuthorizationEstablished: false,
      legalConclusionEstablished: false, authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      rawMessagesPresent: true, rawThoughtsAndActionsPresent: true,
      rawToolArgumentsAndResultsPresent: true, rawPatchesPresent: true,
      rawSourcePrivate: true, noPiiGuaranteed: false,
      rawProjectionRows: 0,
    },
    boundary: {
      syntheticSoftwareAgentTrajectoryRows: 3_012,
      publisherOutcomeRows: 3_012, independentOutcomeRows: 0,
      realWorldOutcomeRows: 0, longitudinalOutcomeRows: 0,
      recoveryEpisodeRows: 0, preActionDelegationRows: 0,
      physicalEffectRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      actorCreditRows: 0, ceuRows: 0, pricingRows: 0,
      authorityRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createSweSmithToolShardReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: SWE_SMITH_TOOL_SHARD_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: SWE_SMITH_TOOL_SHARD_DISPOSITION,
    selectedShardRows: 3_012, publisherResolvedRows: 1_255,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    authorizedTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, authorityRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifySweSmithToolShardArtifactDirectory(directory, options = {}) {
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
    const built = buildSweSmithToolShardArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createSweSmithToolShardReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeSweSmithToolShardArtifact(value) {
  return serialize(value);
}
