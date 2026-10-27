/*
 * Complete no-video fixed-revision replay for DecisionFacts/physical-ai.
 *
 * Robot telemetry and metadata are retained privately. Parquet and JSON are
 * parsed as data only; no downloaded content is executed. Video is excluded.
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

export const PHYSICAL_AI_NO_VIDEO_SCHEMA =
  "outsider/physical-ai-no-video-slice/v1";
export const PHYSICAL_AI_NO_VIDEO_RECEIPT_SCHEMA =
  "outsider/physical-ai-no-video-slice-receipt/v1";
export const PHYSICAL_AI_DATASET_ID = "DecisionFacts/physical-ai";
export const PHYSICAL_AI_REVISION =
  "5293dabc165b0c3398cb2f6613387e0a7f356ef4";
export const PHYSICAL_AI_NO_VIDEO_SCOPE =
  "COMPLETE_FIXED_REVISION_NO_VIDEO_SLICE";
export const PHYSICAL_AI_NO_VIDEO_DISPOSITION = "QUARANTINE_EVAL_ONLY";

const REPORT_DOMAIN = "outsider/physical-ai-no-video-slice-report/v1";
const RECEIPT_DOMAIN = "outsider/physical-ai-no-video-slice-receipt/v1";
const MANIFEST_DOMAIN = "outsider/physical-ai-no-video-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/physical-ai-no-video-source-root/v1";
const MAX_METADATA_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 2 * 1024 * 1024;
const TREE_SHA =
  "sha256:0bee9abdab872756457b8da6dad2683dc117492f3f4a8fe29eca75c76b192292";
const README_SHA =
  "sha256:55b648a9600923eb3dd96b2897c6b44b9b74657bf98646958c6bbfd141eed40d";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;
const TASKS = Object.freeze(["cup_nesting", "marker_binning", "paper_toss"]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `PHYSICAL_AI_NO_VIDEO_${code}`
    : `PHYSICAL_AI_NO_VIDEO_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, license: value.cardData?.license,
    taskCategories: value.cardData?.task_categories,
  };
  if (!same(projection, {
    id: PHYSICAL_AI_DATASET_ID, author: "DecisionFacts",
    sha: PHYSICAL_AI_REVISION, lastModified: "2026-08-21T17:59:42.000Z",
    private: false, gated: false, disabled: false,
    usedStorage: 1_482_181_031, license: "other",
    taskCategories: ["robotics"],
  })) fail("RECORD_PROFILE_INVALID");
  return { ...projection, bytes: bytes.length, sha256: sha256(bytes) };
}

function fixedTree(bytes) {
  if (sha256(bytes) !== TREE_SHA) fail("TREE_PIN_MISMATCH");
  const value = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(value)) fail("TREE_INVALID");
  const entries = value.map((entry) => {
    if (!entry || typeof entry.path !== "string"
      || !["file", "directory"].includes(entry.type)
      || !Number.isSafeInteger(entry.size) || entry.size < 0
      || !OID.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
    const lfsOid = entry.lfs?.oid ?? null;
    const lfsSize = entry.lfs?.size ?? null;
    if (lfsOid !== null && (!/^[a-f0-9]{64}$/u.test(lfsOid)
      || !Number.isSafeInteger(lfsSize) || lfsSize !== entry.size)) {
      fail("TREE_LFS_INVALID", entry.path);
    }
    return { path: entry.path, type: entry.type, size: entry.size,
      oid: entry.oid, lfsOid, lfsSize };
  }).sort((left, right) => left.path < right.path ? -1 : 1);
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const video = files.filter((entry) => entry.path.endsWith(".mp4"));
  const noVideo = files.filter((entry) => !entry.path.endsWith(".mp4"));
  const totalBytes = files.reduce((sum, entry) => sum + entry.size, 0);
  const videoBytes = video.reduce((sum, entry) => sum + entry.size, 0);
  const noVideoBytes = noVideo.reduce((sum, entry) => sum + entry.size, 0);
  const taskProfiles = Object.fromEntries(TASKS.map((task) => {
    const prefix = `SO-101/${task}/`;
    const selected = noVideo.filter((entry) => entry.path.startsWith(prefix));
    return [task, {
      files: selected.length,
      bytes: selected.reduce((sum, entry) => sum + entry.size, 0),
      dataParquetFiles: selected.filter((entry) =>
        entry.path.includes("/data/") && entry.path.endsWith(".parquet")).length,
      episodeParquetFiles: selected.filter((entry) =>
        entry.path.includes("/meta/episodes/") && entry.path.endsWith(".parquet")).length,
      taskParquetFiles: selected.filter((entry) =>
        entry.path.endsWith("/meta/tasks.parquet")).length,
    }];
  }));
  if (entries.length !== 91 || files.length !== 57 || directories.length !== 34
    || totalBytes !== 1_482_245_559
    || video.length !== 24 || videoBytes !== 1_478_075_534
    || noVideo.length !== 33 || noVideoBytes !== 4_170_025
    || noVideo.filter((entry) => entry.lfsOid !== null).length !== 25
    || !same(taskProfiles, {
      cup_nesting: { files: 9, bytes: 1_296_314,
        dataParquetFiles: 3, episodeParquetFiles: 3, taskParquetFiles: 1 },
      marker_binning: { files: 13, bytes: 1_568_304,
        dataParquetFiles: 5, episodeParquetFiles: 5, taskParquetFiles: 1 },
      paper_toss: { files: 9, bytes: 1_293_382,
        dataParquetFiles: 3, episodeParquetFiles: 3, taskParquetFiles: 1 },
    })
    || files.some((entry) => ["LICENSE", "LICENSE.md", "LICENSE.txt"]
      .includes(entry.path))) fail("TREE_PROFILE_INVALID");
  return { entries, files, directories, video, noVideo,
    totalBytes, videoBytes, noVideoBytes, taskProfiles };
}

function validateReadme(bytes) {
  if (bytes.length !== 9_521 || sha256(bytes) !== README_SHA) {
    fail("README_PIN_MISMATCH");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const required = [
    "real-world **teleoperation data**",
    "successful task completion before being included",
    "Outcome (success, failure, or recovery) is recorded per episode",
    "are labeled with an outcome field (success / failure / recovery)",
    "**public evaluation sample**",
    "CC BY-NC 4.0 for research and evaluation purposes only",
    "requires agreeing to the stated terms and providing contact information",
    "requires a separate license",
  ];
  if (required.some((phrase) => !text.includes(phrase))) {
    fail("README_NARRATIVE_INVALID");
  }
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
  const entries = [
    { path: "metadata/dataset-record-before.json", bytes: recordBefore.length,
      sha256: sha256(recordBefore) },
    { path: "metadata/dataset-record-after.json", bytes: recordAfter.length,
      sha256: sha256(recordAfter) },
    { path: "metadata/full-tree-before.json", bytes: treeBefore.length,
      sha256: sha256(treeBefore) },
    { path: "metadata/full-tree-after.json", bytes: treeAfter.length,
      sha256: sha256(treeAfter) },
  ];
  const payloads = new Map();
  for (const file of tree.noVideo) {
    const relative = `files/${file.path}`;
    const bytes = readRegular(root, relative, MAX_SOURCE_FILE_BYTES, file.size);
    const payloadSha256 = sha256(bytes);
    if (file.lfsOid !== null && payloadSha256 !== `sha256:${file.lfsOid}`) {
      fail("LFS_PAYLOAD_HASH_MISMATCH", file.path);
    }
    entries.push({ path: relative, repositoryPath: file.path,
      bytes: bytes.length, sha256: payloadSha256,
      repositoryOid: file.oid,
      lfsSha256: file.lfsOid === null ? null : `sha256:${file.lfsOid}`,
      lfsBytes: file.lfsSize });
    payloads.set(file.path, bytes);
  }
  validateReadme(payloads.get("README.md"));
  const expected = [
    ...tree.noVideo.map((entry) => `files/${entry.path}`),
    "metadata/dataset-record-after.json",
    "metadata/dataset-record-before.json",
    "metadata/full-tree-after.json",
    "metadata/full-tree-before.json",
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  return { root, record, tree, entries };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/physical-ai-no-video-source-manifest/v1",
    datasetId: PHYSICAL_AI_DATASET_ID, revision: PHYSICAL_AI_REVISION,
    scope: PHYSICAL_AI_NO_VIDEO_SCOPE,
    entries: ordered,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

export function createPhysicalAiNoVideoSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, pathlib, sys
import pyarrow.parquet as pq

root = pathlib.Path(sys.argv[1]) / 'files' / 'SO-101'
tasks = ['cup_nesting','marker_binning','paper_toss']
outcome_names = {'outcome','outcomes','reward','rewards','done','success','failure',
                 'recovery','intervention','terminal','terminated','truncated'}

def die(code):
    raise RuntimeError('PHYSICAL_AI_NO_VIDEO_PYTHON_' + code)

def load_json(path):
    try: return json.loads(path.read_bytes().decode('utf-8'))
    except Exception: die('JSON_INVALID')

def field_names(field):
    names = [field.name]
    dtype = field.type
    if hasattr(dtype, 'num_fields'):
        for index in range(dtype.num_fields): names += field_names(dtype.field(index))
    if hasattr(dtype, 'value_field'): names += field_names(dtype.value_field)
    return names

def key_names(value):
    result = []
    if isinstance(value, dict):
        for key, child in value.items(): result.append(str(key)); result += key_names(child)
    elif isinstance(value, list):
        for child in value: result += key_names(child)
    return result

task_results = {}
all_schema_names = collections.Counter()
all_json_keys = collections.Counter()
total_frames = total_episodes = 0
total_data_parquets = total_episode_parquets = total_task_parquets = 0
total_null_values = total_nonfinite_values = 0
shape = hashlib.sha256()

for task in tasks:
    base = root / task
    info = load_json(base / 'meta' / 'info.json')
    stats = load_json(base / 'meta' / 'stats.json')
    for name in key_names(info) + key_names(stats): all_json_keys[name] += 1
    expected_info_keys = {'codebase_version','fps','features','total_episodes',
      'total_frames','total_tasks','chunks_size','data_files_size_in_mb',
      'video_files_size_in_mb','data_path','video_path','robot_type','splits'}
    if (set(info) != expected_info_keys or info['codebase_version'] != 'v3.0'
            or info['fps'] != 30 or info['total_tasks'] != 1
            or info['robot_type'] != 'so_follower'
            or info['features']['action'].get('shape') != [6]
            or info['features']['observation.state'].get('shape') != [6]):
        die(task.upper() + '_INFO_PROFILE_INVALID')

    data_files = sorted((base / 'data' / 'chunk-000').glob('*.parquet'))
    episode_files = sorted((base / 'meta' / 'episodes' / 'chunk-000').glob('*.parquet'))
    task_files = [base / 'meta' / 'tasks.parquet']
    if not data_files or len(data_files) != len(episode_files):
        die(task.upper() + '_FILE_PAIRING_INVALID')

    data_rows = []
    data_file_rows = []
    data_schemas = set()
    null_values = nonfinite_values = 0
    action_min = [math.inf] * 6; action_max = [-math.inf] * 6
    state_min = [math.inf] * 6; state_max = [-math.inf] * 6
    for file in data_files:
        parquet = pq.ParquetFile(file)
        schema = parquet.schema_arrow
        names = schema.names
        expected_names = ['action','observation.state','timestamp','frame_index',
                          'episode_index','index','task_index']
        if names != expected_names: die(task.upper() + '_DATA_SCHEMA_INVALID')
        for field in schema: 
            for name in field_names(field): all_schema_names[name] += 1
        data_schemas.add(str(schema))
        count = 0
        for batch in parquet.iter_batches(batch_size=1024):
            for row in batch.to_pylist():
                if set(row) != set(expected_names): die(task.upper() + '_DATA_ROW_INVALID')
                action = row['action']; state = row['observation.state']
                if not isinstance(action,list) or len(action) != 6 or not isinstance(state,list) or len(state) != 6:
                    die(task.upper() + '_VECTOR_INVALID')
                values = action + state + [row['timestamp']]
                null_values += sum(value is None for value in values)
                nonfinite_values += sum(value is not None and isinstance(value,(int,float))
                                        and not math.isfinite(value) for value in values)
                if any(value is None or not math.isfinite(value) for value in action + state):
                    die(task.upper() + '_VECTOR_NONFINITE')
                for index,value in enumerate(action):
                    action_min[index] = min(action_min[index],value)
                    action_max[index] = max(action_max[index],value)
                for index,value in enumerate(state):
                    state_min[index] = min(state_min[index],value)
                    state_max[index] = max(state_max[index],value)
                data_rows.append(row); count += 1
        data_file_rows.append(count)

    if len(data_rows) != info['total_frames']:
        die(task.upper() + '_FRAME_TOTAL_INVALID')
    if [row['index'] for row in data_rows] != list(range(len(data_rows))):
        die(task.upper() + '_GLOBAL_INDEX_INVALID')
    if set(row['task_index'] for row in data_rows) != {0}:
        die(task.upper() + '_TASK_INDEX_INVALID')
    episode_frame_rows = collections.Counter(row['episode_index'] for row in data_rows)
    if set(episode_frame_rows) != set(range(info['total_episodes'])):
        die(task.upper() + '_DATA_EPISODE_CENSUS_INVALID')
    per_episode_frame_indices = collections.defaultdict(list)
    timestamp_exact_rows = 0
    for row in data_rows:
        per_episode_frame_indices[row['episode_index']].append(row['frame_index'])
        if abs(row['timestamp'] - row['frame_index'] / 30.0) <= 2e-5:
            timestamp_exact_rows += 1
    if any(indices != list(range(len(indices)))
           for indices in per_episode_frame_indices.values()):
        die(task.upper() + '_FRAME_INDEX_INVALID')

    episode_rows = []
    episode_file_rows = []
    episode_schemas = set()
    for file in episode_files:
        parquet = pq.ParquetFile(file)
        schema = parquet.schema_arrow
        episode_schemas.add(str(schema))
        for field in schema:
            for name in field_names(field): all_schema_names[name] += 1
        count = 0
        for batch in parquet.iter_batches(batch_size=256):
            for row in batch.to_pylist():
                episode_rows.append(row); count += 1
                for name in key_names(row): all_json_keys[name] += 1
        episode_file_rows.append(count)
    if len(episode_rows) != info['total_episodes']:
        die(task.upper() + '_EPISODE_TOTAL_INVALID')
    episode_indices = [row.get('episode_index') for row in episode_rows]
    if episode_indices != list(range(info['total_episodes'])):
        die(task.upper() + '_EPISODE_INDEX_INVALID')
    if any(row.get('length') != episode_frame_rows[row['episode_index']]
           for row in episode_rows):
        die(task.upper() + '_EPISODE_LENGTH_INVALID')
    if any(row.get('dataset_from_index') != sum(episode_frame_rows[i]
               for i in range(row['episode_index']))
           or row.get('dataset_to_index') != sum(episode_frame_rows[i]
               for i in range(row['episode_index'] + 1))
           for row in episode_rows):
        die(task.upper() + '_EPISODE_OFFSET_INVALID')

    task_rows = []
    task_schemas = set()
    for file in task_files:
        parquet = pq.ParquetFile(file)
        schema = parquet.schema_arrow
        task_schemas.add(str(schema))
        for field in schema:
            for name in field_names(field): all_schema_names[name] += 1
        task_rows += parquet.read().to_pylist()
    if (len(task_rows) != 1 or task_rows[0].get('task_index') != 0
            or not isinstance(task_rows[0].get('task'), str)):
        die(task.upper() + '_TASK_MAP_INVALID')

    profile = {
      'task':task,'infoEpisodes':info['total_episodes'],'infoFrames':info['total_frames'],
      'parquetEpisodeRows':len(episode_rows),'parquetFrameRows':len(data_rows),
      'taskMapRows':len(task_rows),'taskDescriptionSha256':'sha256:'+hashlib.sha256(
          task_rows[0]['task'].encode()).hexdigest(),
      'dataParquetFiles':len(data_files),'episodeParquetFiles':len(episode_files),
      'taskParquetFiles':1,'dataFileRows':data_file_rows,
      'episodeFileRows':episode_file_rows,
      'dataSchemaProfiles':len(data_schemas),'episodeSchemaProfiles':len(episode_schemas),
      'taskSchemaProfiles':len(task_schemas),
      'dataSchemaSha256':['sha256:'+hashlib.sha256(value.encode()).hexdigest()
                          for value in sorted(data_schemas)],
      'episodeSchemaSha256':['sha256:'+hashlib.sha256(value.encode()).hexdigest()
                             for value in sorted(episode_schemas)],
      'taskSchemaSha256':['sha256:'+hashlib.sha256(value.encode()).hexdigest()
                          for value in sorted(task_schemas)],
      'episodeLengths':{'min':min(episode_frame_rows.values()),
                        'max':max(episode_frame_rows.values()),
                        'sum':sum(episode_frame_rows.values())},
      'timestampFrameIndexOverFpsRows':timestamp_exact_rows,
      'nullTelemetryValues':null_values,'nonfiniteTelemetryValues':nonfinite_values,
      'actionMin':action_min,'actionMax':action_max,
      'stateMin':state_min,'stateMax':state_max,
    }
    encoded = json.dumps(profile,sort_keys=True,separators=(',',':')).encode()
    shape.update(len(encoded).to_bytes(8,'big')); shape.update(encoded)
    task_results[task] = profile
    total_frames += len(data_rows); total_episodes += len(episode_rows)
    total_data_parquets += len(data_files)
    total_episode_parquets += len(episode_files); total_task_parquets += 1
    total_null_values += null_values; total_nonfinite_values += nonfinite_values

normalized_schema_names = sorted({name.strip().lower().replace('-','_')
                                  for name in all_schema_names})
normalized_json_keys = sorted({name.strip().lower().replace('-','_')
                               for name in all_json_keys})
schema_outcome_hits = sorted(set(normalized_schema_names) & outcome_names)
json_key_outcome_hits = sorted(set(normalized_json_keys) & outcome_names)
expected_task_totals = {
 'cup_nesting':(30,26769,[8923,8918,8928],[10,10,10],890,894),
 'marker_binning':(26,29517,[2424,9679,5533,2479,9402],[2,8,5,2,9],864,1345),
 'paper_toss':(30,26210,[8550,8925,8735],[10,10,10],741,894)}
for task, expected in expected_task_totals.items():
    profile = task_results[task]
    actual = (profile['parquetEpisodeRows'],profile['parquetFrameRows'],
              profile['dataFileRows'],profile['episodeFileRows'],
              profile['episodeLengths']['min'],profile['episodeLengths']['max'])
    if actual != expected or profile['timestampFrameIndexOverFpsRows'] != expected[1]:
        die(task.upper() + '_FINAL_PROFILE_INVALID')
if (total_episodes != 86 or total_frames != 82496
        or total_data_parquets != 11 or total_episode_parquets != 11
        or total_task_parquets != 3 or total_null_values != 0
        or total_nonfinite_values != 0 or schema_outcome_hits
        or json_key_outcome_hits):
    die('FINAL_AGGREGATE_PROFILE_INVALID')
shape_root = 'sha256:' + shape.hexdigest()
if shape_root != 'sha256:3dd63626273c89837c725798341423eb77ca2578f8a96f826557662bc0b9b6b2':
    die('REPLAY_SHAPE_ROOT_INVALID')

print(json.dumps({
 'tasks':task_results,'taskCount':len(tasks),'totalEpisodes':total_episodes,
 'totalFrames':total_frames,'dataParquetFiles':total_data_parquets,
 'episodeParquetFiles':total_episode_parquets,'taskParquetFiles':total_task_parquets,
 'parquetFilesReplayed':total_data_parquets+total_episode_parquets+total_task_parquets,
 'telemetryActionWidth':6,'telemetryStateWidth':6,'fps':30,
 'nullTelemetryValues':total_null_values,
 'nonfiniteTelemetryValues':total_nonfinite_values,
 'schemaFieldNames':normalized_schema_names,
 'jsonAndNestedRecordKeyNames':normalized_json_keys,
 'outcomeLikeSchemaFieldNames':schema_outcome_hits,
 'outcomeLikeJsonOrNestedRecordKeys':json_key_outcome_hits,
 'byteNativeOutcomeFieldRows':0 if not schema_outcome_hits and not json_key_outcome_hits else None,
 'byteNativeRewardDoneInterventionFieldRows':0 if not schema_outcome_hits and not json_key_outcome_hits else None,
 'replayShapeRoot':shape_root,
 'downloadedCodeOrContentExecuted':False,
 'videoPayloadsParsed':False,'videoPayloadBytesAcquired':0,
},sort_keys=True,separators=(',',':')))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_PHYSICAL_AI_PYTHON ?? "/opt/anaconda3/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim() ?? result.status);
  }
  let value;
  try { value = JSONParse(result.stdout); } catch { fail("REPLAY_OUTPUT_INVALID"); }
  return deepFreeze(value);
}

export function buildPhysicalAiNoVideoArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const stored = readRegular(collected.root, "source-manifest.json",
    MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: PHYSICAL_AI_NO_VIDEO_SCHEMA,
    disposition: PHYSICAL_AI_NO_VIDEO_DISPOSITION,
    scope: {
      kind: PHYSICAL_AI_NO_VIDEO_SCOPE,
      datasetId: PHYSICAL_AI_DATASET_ID, revision: PHYSICAL_AI_REVISION,
      completeFixedRevisionNoVideoSliceAcquired: true,
      fullFixedRevisionAllModalitiesClaimed: false,
      noVideoSourceFiles: 33, noVideoSourceBytes: 4_170_025,
      excludedVideoFiles: 24, excludedVideoBytes: 1_478_075_534,
      videoPayloadBytesAcquired: 0,
      taskGroups: TASKS,
    },
    source: {
      publicAtAcquisition: true, gatedAtAcquisition: false,
      disabledAtAcquisition: false, lastModified: collected.record.lastModified,
      apiCardLicenseValue: "other", usedStorageBytes: 1_482_181_031,
      fixedTreeEntries: 91, fixedTreeFiles: 57, fixedTreeDirectories: 34,
      fixedTreeFileBytes: collected.tree.totalBytes,
      noVideoFiles: collected.tree.noVideo.length,
      noVideoBytes: collected.tree.noVideoBytes,
      videoFiles: collected.tree.video.length,
      videoBytes: collected.tree.videoBytes,
      noVideoTaskProfiles: collected.tree.taskProfiles,
      recordBeforeAfterExact: true, treeBeforeAfterExact: true,
      recordSnapshotBytes: collected.record.bytes,
      recordSnapshotSha256: collected.record.sha256,
      fixedTreeSha256: TREE_SHA,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
    },
    replay: { ...replay,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")) },
    accessState: {
      apiObservedPublic: true, apiObservedUngated: true,
      readmeClaimsAgreementAndContactInformationRequired: true,
      accessNarrativeMatchesObservedApiState: false,
      observedPublicAccessDoesNotResolveLicenseTerms: true,
    },
    documentation: {
      publisherClaimsRealWorldHumanTeleoperation: true,
      publisherClaimsEveryEpisodeReviewedForSuccessfulTaskCompletion: true,
      publisherClaimsFailureAndRecoveryEpisodesRetained: true,
      publisherClaimsOutcomeFieldPerEpisode: true,
      claimedOutcomeVocabulary: ["success", "failure", "recovery"],
      episodeMetadataRowsWithinNarrativeScope: replay.totalEpisodes,
      readmeOutcomeClaimProjectedToEpisodeRows: false,
      readmeTargetEpisodeCountPerTask: "30+",
      markerBinningByteNativeEpisodeRows: replay.tasks.marker_binning.parquetEpisodeRows,
      everyTaskMeetsReadmeTargetEpisodeCount: false,
      successfulInclusionAndFailureRetentionNarrativesBothPresent: true,
      byteNativeOutcomeLikeSchemaFieldNames: replay.outcomeLikeSchemaFieldNames,
      byteNativeOutcomeLikeJsonKeys: replay.outcomeLikeJsonOrNestedRecordKeys,
      claimedOutcomeFieldFoundInAcquiredTaskBytes: false,
      readmeOutcomeClaimPromotedToByteFact: false,
    },
    execution: {
      publisherClaimedRealWorldTeleoperationEpisodes: replay.totalEpisodes,
      publisherNativeActionStateTelemetryFrames: replay.totalFrames,
      independentlyReceiptedRobotExecutionEpisodes: 0,
      independentWitnessVideoBytesAcquired: 0,
      physicalExecutionIndependentlyVerified: false,
      downloadedCodeOrContentExecuted: false,
    },
    outcome: {
      readmeOutcomeClaimRowsWithByteNativeSupport: 0,
      byteNativeOutcomeFieldRows: replay.byteNativeOutcomeFieldRows,
      byteNativeRewardDoneInterventionFieldRows:
        replay.byteNativeRewardDoneInterventionFieldRows,
      publisherNativeSuccessLabelRows: 0,
      publisherNativeFailureLabelRows: 0,
      publisherNativeRecoveryLabelRows: 0,
      independentlyWitnessedOutcomeRows: 0,
      telemetryAlonePromotedToTaskOutcome: false,
      completeOutcomeCensusEstablished: false,
    },
    recovery: {
      readmeRecoveryNarrativePresent: true,
      byteNativeRecoveryLabelRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      longitudinalRecoveryRows: 0,
      retriesOrCorrectionsDerivedFromTelemetryRows: 0,
    },
    modality: {
      actionStateTelemetryFrames: replay.totalFrames,
      actionWidth: replay.telemetryActionWidth,
      stateWidth: replay.telemetryStateWidth,
      fps: replay.fps,
      taskLanguageRows: replay.taskCount,
      rawVideoFilesAcquired: 0, rawVideoBytesAcquired: 0,
      visualOutcomeAdjudicationRows: 0,
      audioBytesAcquired: 0,
    },
    privacy: {
      videoExcluded: true, rawVisualBytes: 0,
      humanTeleoperationClaimPresent: true,
      operatorConsentEvidenceBytesAcquired: 0,
      independentPiiAuditRows: 0,
      noPiiOrSensitiveDataGuaranteed: false,
      rawTelemetryPrivate: true, rawProjectionRows: 0,
    },
    rights: {
      apiCardLicenseValue: "other",
      readmePublicSampleLicenseClaim: "CC-BY-NC-4.0",
      readmeResearchAndEvaluationOnlyClaim: true,
      readmeCommercialTrainingRequiresSeparateLicense: true,
      readmeCommercialUseRequiresSeparateLicense: true,
      readmeRedistributionRequiresSeparateLicense: true,
      repositoryLicenseFilePresent: false,
      useSpecificRightsIndependentlyAdjudicated: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
      commercialUseAuthorizedByThisArtifact: false,
      legalConclusionEstablished: false,
    },
    denominators: {
      PUBLISHER_NO_VIDEO_TELEMETRY_FRAME: replay.totalFrames,
      PUBLISHER_EPISODE_METADATA_ROW: replay.totalEpisodes,
      TASK_LANGUAGE_ROW: replay.taskCount,
      BYTE_NATIVE_OUTCOME_LABEL: 0,
      INDEPENDENTLY_WITNESSED_OUTCOME: 0,
      crossModalityTotal: null, additionProhibited: true,
    },
    boundary: {
      independentlyVerifiedOutcomeRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      completeOutcomeCensusRows: 0,
      authorizedTrainingRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      authorityRows: 0, ceuRows: 0, actorCreditRows: 0,
      autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createPhysicalAiNoVideoReceipt(
  report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: PHYSICAL_AI_NO_VIDEO_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: PHYSICAL_AI_NO_VIDEO_DISPOSITION,
    scope: PHYSICAL_AI_NO_VIDEO_SCOPE,
    noVideoFiles: 33, noVideoBytes: 4_170_025,
    videoBytesAcquired: 0,
    byteNativeOutcomeLabelRows: 0,
    independentlyVerifiedOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0,
    authorizedTrainingRows: 0, offlineTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyPhysicalAiNoVideoArtifactDirectory(
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
    const built = buildPhysicalAiNoVideoArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createPhysicalAiNoVideoReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializePhysicalAiNoVideoArtifact(value) {
  return serialize(value);
}
