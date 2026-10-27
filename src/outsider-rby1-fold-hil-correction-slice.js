/*
 * Fixed-revision no-video replay of the RB-Y1 fold v1.1 HIL correction set.
 * Visual payloads stay excluded; telemetry and estimator annotations are data.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const RBY1_FOLD_HIL_SCHEMA =
  "outsider/rby1-fold-hil-correction-slice/v1";
export const RBY1_FOLD_HIL_RECEIPT_SCHEMA =
  "outsider/rby1-fold-hil-correction-slice-receipt/v1";
export const RBY1_FOLD_HIL_DATASET_ID = "RB3159/rby1-fold-v1.1";
export const RBY1_FOLD_HIL_REVISION =
  "f467b5cd2ef8ced6bdcc9ee678197722740e3705";
export const RBY1_FOLD_HIL_SCOPE =
  "COMPLETE_PINNED_NO_VIDEO_HIL_CORRECTION_SLICE";
export const RBY1_FOLD_HIL_DISPOSITION = "QUARANTINE_EVAL_ONLY";

const REPORT_DOMAIN = `${RBY1_FOLD_HIL_SCHEMA}/report`;
const RECEIPT_DOMAIN = `${RBY1_FOLD_HIL_RECEIPT_SCHEMA}/receipt`;
const MANIFEST_DOMAIN = `${RBY1_FOLD_HIL_SCHEMA}/source-manifest`;
const SOURCE_ROOT_DOMAIN = `${RBY1_FOLD_HIL_SCHEMA}/source-root`;
const RECORD_SHA =
  "sha256:af7742c5055af2bdd0225edd589259dfd86287833aef851243bf77e3ef0e1056";
const TREE_SHA =
  "sha256:dd280ef21464dbd39f6150eb51c5ccce7085fcf07ca04b9c114e9d0d490bcd99";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

const NO_VIDEO_OBJECTS = Object.freeze([
  { path: ".gitattributes", bytes: 2_504,
    sha256: "sha256:9e75dd981de037ec3769f24f790e126bc5a160b6871f510214e68dc70649aeeb",
    oid: "bed0738c7eeb449bca98b5d2f33c89a1ee56349a", lfsOid: null,
    xetHash: null },
  { path: "README.md", bytes: 2_376,
    sha256: "sha256:8180d9c6459b2005a0223bccdc8089b93faf740921429c012a3e705cb308d45c",
    oid: "9f216e3b16740fe80eeae4d223646397cf3b130d", lfsOid: null,
    xetHash: null },
  { path: "annotations/advantage.json", bytes: 1_532_287,
    sha256: "sha256:f7f85211e5299b06518c4af372055ded7c2140b1ebf3eb73eb5e16b88ae794c2",
    oid: "518566dcf4a384932284952aa218a50d35ee2a9a", lfsOid: null,
    xetHash: null },
  { path: "annotations/eval_progress.json", bytes: 645_817,
    sha256: "sha256:568a7340162f08114fbf7f8d03474738ddc07f3afefec046b6f3c3ef7590935f",
    oid: "beba04e1f667aeaa1d110a3c5a600a2a72e2d0cd", lfsOid: null,
    xetHash: null },
  { path: "data/chunk-000/file-000.parquet", bytes: 9_526_875,
    sha256: "sha256:c429ae74f946631428047c368fc4ea79e7cef8957af270b22a137a45dfbc30f7",
    oid: "bf5715ec687405c87055dbe3c09a152fcfa8ee41",
    lfsOid: "c429ae74f946631428047c368fc4ea79e7cef8957af270b22a137a45dfbc30f7",
    xetHash: "527675288ef081207de754661bc336d7649915da799a0758c7c77fffa4a24c3c" },
  { path: "meta/episodes/chunk-000/file-000.parquet", bytes: 275_034,
    sha256: "sha256:a9bdf522f42e18f59269a9dae578f9b66e9f4f4d60171d2cd24eb77e16dbe650",
    oid: "76e2991af254031ea9de615d0fe713618d91479b",
    lfsOid: "a9bdf522f42e18f59269a9dae578f9b66e9f4f4d60171d2cd24eb77e16dbe650",
    xetHash: "ad77c0c476d24c62e4fa6262e5fa8c95e93308bca0bfde838e51a4493a52eb26" },
  { path: "meta/info.json", bytes: 5_754,
    sha256: "sha256:81f5981ecf96ef03cc06f0b4c9dca78e8c644754888e27855bab3d7cd9762fb1",
    oid: "06ccb670cfaa6f7ec7a318751d02dbc7c6d4839c", lfsOid: null,
    xetHash: null },
  { path: "meta/stats.json", bytes: 28_133,
    sha256: "sha256:67f2634dc9f9da0c383464242d463027d226bc9ab6a728c651e80e26de84149f",
    oid: "e8e7557cc8db18ff69fa49c3104a8ad6e943a432", lfsOid: null,
    xetHash: null },
  { path: "meta/tasks.parquet", bytes: 2_176,
    sha256: "sha256:b86617a44aa26311c561d8f78c02ebc31a8144d7e64b74b2452b791fb172232f",
    oid: "9a2aedfc1e869162ae4918e5ecfb166beb17e8dd",
    lfsOid: "b86617a44aa26311c561d8f78c02ebc31a8144d7e64b74b2452b791fb172232f",
    xetHash: "be81fac93adc227665c4ce96fdbde0b42693857136fb1b97d03108d21498fe19" },
]);

const SOURCE_FILES = Object.freeze([
  "metadata/dataset-record-before.json",
  "metadata/dataset-record-after.json",
  "metadata/full-tree-before.json",
  "metadata/full-tree-after.json",
  ...NO_VIDEO_OBJECTS.map((entry) => `files/${entry.path}`),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `RBY1_FOLD_HIL_${code}`
    : `RBY1_FOLD_HIL_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function serialize(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
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

function parseJson(bytes, code) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { fail(code); }
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")
    || value.includes("\\") || value.split("/").some((part) =>
      ["", ".", ".."].includes(part)) || path.posix.normalize(value) !== value) {
    fail("PATH_INVALID", String(value));
  }
  return value;
}

function checkedPath(root, relative) {
  safeRelative(relative);
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  const relation = path.relative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_ESCAPE", relative);
  return target;
}

function inspectRegular(root, relative, exactBytes = null, expectedSha256 = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600 || link.size > BigInt(MAX_FILE_BYTES)
    || exactBytes !== null && link.size !== BigInt(exactBytes)) {
    fail("FILE_UNSAFE", relative);
  }
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0;
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      total += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(total) !== after.size) fail("FILE_CHANGED_DURING_READ", relative);
    const fileSha256 = `sha256:${hash.digest("hex")}`;
    if (expectedSha256 !== null && fileSha256 !== expectedSha256) {
      fail("FILE_HASH_INVALID", relative);
    }
    return { path: relative, bytes: total, sha256: fileSha256 };
  } finally { closeSync(descriptor); }
}

function readSmall(root, relative, exactBytes = null, expectedSha256 = null) {
  const inspected = inspectRegular(root, relative, exactBytes, expectedSha256);
  return { ...inspected, contents: readFileSync(checkedPath(root, relative)) };
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

function validateRecord(bytes) {
  if (bytes.length !== 8_267 || sha256(bytes) !== RECORD_SHA) {
    fail("RECORD_PIN_MISMATCH");
  }
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, license: value.cardData?.license,
  };
  if (!same(projection, {
    id: RBY1_FOLD_HIL_DATASET_ID, author: "RB3159",
    sha: RBY1_FOLD_HIL_REVISION,
    lastModified: "2026-07-02T07:53:44.000Z",
    private: false, gated: false, disabled: false,
    usedStorage: 11_366_751_897, license: "apache-2.0",
  })) fail("RECORD_PROFILE_INVALID");
  return projection;
}

function validateTree(bytes) {
  if (bytes.length !== 31_817 || sha256(bytes) !== TREE_SHA) {
    fail("TREE_PIN_MISMATCH");
  }
  const entries = parseJson(bytes, "TREE_JSON_INVALID");
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const videos = files.filter((entry) => entry.path.endsWith(".mp4"));
  const selected = files.filter((entry) => !entry.path.endsWith(".mp4"));
  const projection = selected.map((entry) => ({
    path: entry.path, bytes: entry.size, oid: entry.oid,
    lfsOid: entry.lfs?.oid ?? null, xetHash: entry.xetHash ?? null,
  }));
  const expected = NO_VIDEO_OBJECTS.map(({ path: itemPath, bytes: itemBytes,
    oid, lfsOid, xetHash }) => ({ path: itemPath, bytes: itemBytes,
    oid, lfsOid, xetHash }));
  const cameras = Object.fromEntries(["cam_high", "cam_left_wrist", "cam_right_wrist"]
    .map((camera) => [camera, videos.filter((entry) =>
      entry.path.includes(`observation.images.${camera}/`)).length]));
  if (!Array.isArray(entries) || entries.length !== 106 || files.length !== 93
    || directories.length !== 13
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 3_898_622_873
    || videos.length !== 84
    || videos.reduce((sum, entry) => sum + entry.size, 0) !== 3_886_601_917
    || selected.length !== 9
    || selected.reduce((sum, entry) => sum + entry.size, 0) !== 12_020_956
    || !same(projection, expected)
    || !same(cameras, { cam_high: 28, cam_left_wrist: 28, cam_right_wrist: 28 })
    || files.some((entry) => /(^|\/)LICENSE(?:\.|$)/u.test(entry.path))) {
    fail("TREE_PROFILE_INVALID");
  }
  return { entries, files, directories, videos, selected, cameras };
}

function validateReadme(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const required = [
    "DAgger correction set", "40 episodes / 81,813 frames", "26-dim",
    "every frame flagged `observation.is_intervention = true`",
    "hand-edited and recovered", "rby1-fold-v1.0", "horizon 50",
    "global p70 threshold", "0.032", "apache-2.0",
  ];
  if (required.some((phrase) => !text.includes(phrase))) fail("README_PROFILE_INVALID");
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const recordBefore = readSmall(root, "metadata/dataset-record-before.json",
    8_267, RECORD_SHA);
  const recordAfter = readSmall(root, "metadata/dataset-record-after.json",
    8_267, RECORD_SHA);
  const treeBefore = readSmall(root, "metadata/full-tree-before.json",
    31_817, TREE_SHA);
  const treeAfter = readSmall(root, "metadata/full-tree-after.json",
    31_817, TREE_SHA);
  if (!recordBefore.contents.equals(recordAfter.contents)
    || !treeBefore.contents.equals(treeAfter.contents)) fail("SOURCE_BRACKET_CHANGED");
  const record = validateRecord(recordBefore.contents);
  const tree = validateTree(treeBefore.contents);
  const descriptors = [recordBefore, recordAfter, treeBefore, treeAfter]
    .map(({ path: itemPath, bytes, sha256: itemSha }) =>
      ({ path: itemPath, bytes, sha256: itemSha }));
  for (const entry of NO_VIDEO_OBJECTS) {
    const inspected = inspectRegular(root, `files/${entry.path}`,
      entry.bytes, entry.sha256);
    descriptors.push(inspected);
    if (entry.path === "README.md") {
      validateReadme(readFileSync(checkedPath(root, `files/${entry.path}`)));
    }
  }
  descriptors.sort((left, right) => left.path.localeCompare(right.path));
  const expected = [...SOURCE_FILES, ...(withManifest ? ["source-manifest.json"] : [])];
  if (!same(sorted(walk(root)), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  return { root, record, tree, descriptors };
}

function manifestBody(collected) {
  return {
    schema: "outsider/rby1-fold-hil-correction-slice-source/v1",
    datasetId: RBY1_FOLD_HIL_DATASET_ID,
    revision: RBY1_FOLD_HIL_REVISION,
    scope: RBY1_FOLD_HIL_SCOPE,
    fixedTreeEntries: 106, fixedTreeFiles: 93, fixedTreeDirectories: 13,
    fixedTreeFileBytes: 3_898_622_873,
    selectedNoVideoFiles: 9, selectedNoVideoBytes: 12_020_956,
    excludedVideoFiles: 84, excludedVideoBytes: 3_886_601_917,
    recordBeforeAfterExact: true, treeBeforeAfterExact: true,
    sourceObjects: collected.descriptors,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, collected.descriptors),
  };
}

export function createRby1FoldHilSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, pathlib, sys
import numpy as np
import pyarrow.parquet as pq

root=pathlib.Path(sys.argv[1])
def die(code): raise RuntimeError('RBY1_FOLD_HIL_PYTHON_'+code)
def canonical(value): return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def sha(value): return 'sha256:'+hashlib.sha256(value).hexdigest()
def finite_leaves(value):
    if value is None: yield None
    elif isinstance(value,float): yield value
    elif isinstance(value,dict):
        for child in value.values(): yield from finite_leaves(child)
    elif isinstance(value,list):
        for child in value: yield from finite_leaves(child)

data_pf=pq.ParquetFile(root/'files/data/chunk-000/file-000.parquet')
episode_pf=pq.ParquetFile(root/'files/meta/episodes/chunk-000/file-000.parquet')
task_pf=pq.ParquetFile(root/'files/meta/tasks.parquet')
data=data_pf.read(); episode_table=episode_pf.read(); episodes=episode_table.to_pylist()
tasks=task_pf.read().to_pylist()
info=json.loads((root/'files/meta/info.json').read_text(encoding='utf-8'))
stats=json.loads((root/'files/meta/stats.json').read_text(encoding='utf-8'))
adv=json.loads((root/'files/annotations/advantage.json').read_text(encoding='utf-8'))
progress=json.loads((root/'files/annotations/eval_progress.json').read_text(encoding='utf-8'))

expected_data_columns=['observation.state','action','observation.is_intervention',
 'timestamp','frame_index','episode_index','index','task_index']
if (data_pf.metadata.num_rows!=81813 or data_pf.metadata.num_row_groups!=1
    or data.schema.names!=expected_data_columns
    or sha(str(data.schema).encode())!='sha256:64adc0ee207c6fc771815c323d278647bfe1ec74672d7ef8b36a51355554ee60'
    or episode_pf.metadata.num_rows!=40 or episode_pf.metadata.num_row_groups!=1
    or sha(str(episode_pf.schema_arrow).encode())!='sha256:3fda9e6ffa6260ba521448dfa2157b8bd368199bc56bc028288744b1b1d16339'
    or task_pf.metadata.num_rows!=1 or task_pf.metadata.num_row_groups!=1
    or sha(str(task_pf.schema_arrow).encode())!='sha256:37a43b274805e0b0d933cbc0d5dc703e5a74afeb91ea6ddc2d3e64b1985db823'):
    die('PARQUET_PROFILE_INVALID')

states=np.asarray(data['observation.state'].to_pylist(),dtype=np.float64)
actions=np.asarray(data['action'].to_pylist(),dtype=np.float64)
intervention=np.asarray(data['observation.is_intervention'].to_pylist(),dtype=np.float64)
timestamps=np.asarray(data['timestamp'].to_pylist(),dtype=np.float64)
frame_index=np.asarray(data['frame_index'].to_pylist(),dtype=np.int64)
episode_index=np.asarray(data['episode_index'].to_pylist(),dtype=np.int64)
global_index=np.asarray(data['index'].to_pylist(),dtype=np.int64)
task_index=np.asarray(data['task_index'].to_pylist(),dtype=np.int64)
if states.shape!=(81813,26) or actions.shape!=(81813,26): die('TELEMETRY_SHAPE_INVALID')

episode_lengths=[int(row['length']) for row in episodes]
expected_lengths=[59,116,157,429,910,3494,4014,2890,7360,3068,3299,3166,
 1222,3170,2878,3722,2403,2782,1410,163,41,82,132,132,262,364,2470,
 3509,2886,2683,40,3226,4585,211,2535,3416,1786,1617,1953,3171]
if episode_lengths!=expected_lengths or sum(episode_lengths)!=81813: die('EPISODE_LENGTHS_INVALID')
if (not np.array_equal(global_index,np.arange(81813,dtype=np.int64))
    or not np.array_equal(np.unique(episode_index),np.arange(40,dtype=np.int64))
    or set(task_index.tolist())!={0}): die('GLOBAL_INDEX_INVALID')

motor_names=info['features']['observation.state']['names']['motors']
if (info['robot_type']!='rby1' or info['fps']!=30 or info['total_episodes']!=40
    or info['total_frames']!=81813 or info['total_tasks']!=1
    or info['features']['observation.state']['shape']!=[26]
    or info['features']['action']['shape']!=[26]
    or len(motor_names)!=26
    or motor_names!=info['features']['action']['names']['motors']):
    die('INFO_PROFILE_INVALID')

def global_stats_exact(name,array):
    expected=stats[name]
    return (expected['count']==[81813]
      and expected['min']==array.min(axis=0).tolist()
      and expected['max']==array.max(axis=0).tolist()
      and expected['mean']==array.mean(axis=0).tolist()
      and expected['std']==array.std(axis=0).tolist())
if not global_stats_exact('observation.state',states) or not global_stats_exact('action',actions):
    die('GLOBAL_STATS_INVALID')
if stats['observation.is_intervention']!={'min':[1.0],'max':[1.0],
 'mean':[1.0],'std':[0.0],'count':[81813],'q01':[1.0],'q10':[1.0],
 'q50':[1.0],'q90':[1.0],'q99':[1.0]}: die('INTERVENTION_STATS_INVALID')

frame_exact=True; timestamp_error=0.0; offset=0
episode_minmax_count_exact=0; episode_meanstd_exact=0
episode_mean_max_error=0.0; episode_std_max_error=0.0
visual_count_cross_camera_exact=0
progress_values=[]; relative_values=[]; absolute_values=[]
relative_residual=0.0; relative_above=0; relative_equal=0
episode_profiles=[]
camera_names=['cam_high','cam_left_wrist','cam_right_wrist']
gap_profiles={}; file_profiles={}
for camera in camera_names:
    previous={}; positive=[]; negative=[]; profile=collections.defaultdict(lambda:{'episodes':0,'frames':0})
    for row in episodes:
        fi=int(row[f'videos/observation.images.{camera}/file_index'])
        start=float(row[f'videos/observation.images.{camera}/from_timestamp'])
        stop=float(row[f'videos/observation.images.{camera}/to_timestamp'])
        gap=start-previous.get(fi,0.0)
        if gap>1e-12: positive.append(gap)
        elif gap<(-1e-12): negative.append(gap)
        if abs((stop-start)-int(row['length'])/30.0)>3e-14: die('VIDEO_DURATION_INVALID')
        previous[fi]=stop; profile[fi]['episodes']+=1; profile[fi]['frames']+=int(row['length'])
    gap_profiles[camera]={'positiveGapCount':len(positive),
      'positiveGapSeconds':sum(positive),'maximumPositiveGapSeconds':max(positive,default=0.0),
      'negativeOverlapCount':len(negative),'negativeOverlapSeconds':sum(negative)}
    file_profiles[camera]=[{'fileIndex':key,**value} for key,value in sorted(profile.items())]

for idx,row in enumerate(episodes):
    length=episode_lengths[idx]; stop=offset+length
    if (int(row['episode_index'])!=idx or int(row['dataset_from_index'])!=offset
        or int(row['dataset_to_index'])!=stop or int(row['data/chunk_index'])!=0
        or int(row['data/file_index'])!=0): die('EPISODE_METADATA_JOIN_INVALID')
    fi=frame_index[offset:stop]; ts=timestamps[offset:stop]
    frame_exact &= np.array_equal(fi,np.arange(length,dtype=np.int64))
    timestamp_error=max(timestamp_error,float(np.max(np.abs(ts-fi/30.0),initial=0.0)))
    minmax_count_exact=True; meanstd_exact=True
    for name,array in [('observation.state',states[offset:stop]),('action',actions[offset:stop])]:
        minmax_count_exact &= row[f'stats/{name}/min']==array.min(0).tolist()
        minmax_count_exact &= row[f'stats/{name}/max']==array.max(0).tolist()
        minmax_count_exact &= row[f'stats/{name}/count']==[length]
        mean_error=float(np.max(np.abs(np.asarray(row[f'stats/{name}/mean'])-array.mean(0))))
        std_error=float(np.max(np.abs(np.asarray(row[f'stats/{name}/std'])-array.std(0))))
        episode_mean_max_error=max(episode_mean_max_error,mean_error)
        episode_std_max_error=max(episode_std_max_error,std_error)
        meanstd_exact &= mean_error==0 and std_error==0
    for name in ['observation.is_intervention','timestamp','frame_index','episode_index','index','task_index']:
        minmax_count_exact &= row[f'stats/{name}/count']==[length]
    episode_minmax_count_exact+=minmax_count_exact
    episode_meanstd_exact+=meanstd_exact
    visual_counts=[row[f'stats/observation.images.{camera}/count'] for camera in camera_names]
    visual_count_cross_camera_exact+=(visual_counts[0]==visual_counts[1]==visual_counts[2])
    key=str(idx); values=progress[key]; relative=adv['relative_advantage'][key]
    absolute=adv['absolute_advantage'][key]
    if len(values)!=length or len(relative)!=length or len(absolute)!=length:
        die('ANNOTATION_LENGTH_INVALID')
    future=[values[min(position+50,length-1)] for position in range(length)]
    relative_residual=max(relative_residual,max((abs(relative[position]-(future[position]-values[position]))
      for position in range(length)),default=0.0))
    relative_above+=sum(value>0.032 for value in relative)
    relative_equal+=sum(value==0.032 for value in relative)
    progress_values.extend(values); relative_values.extend(relative); absolute_values.extend(absolute)
    episode_profiles.append({'episodeIndex':idx,'frames':length,'fromIndex':offset,
      'toIndex':stop,'relativeAbove0032Frames':sum(value>0.032 for value in relative)})
    offset=stop

if (not frame_exact or timestamp_error>7.2e-6 or episode_minmax_count_exact!=40
    or episode_meanstd_exact!=39 or visual_count_cross_camera_exact!=40
    or abs(episode_mean_max_error-0.003944404190633577)>1e-15
    or abs(episode_std_max_error-0.8497637859812165)>1e-15):
    die('EPISODE_REPLAY_INVALID')
if (sorted(map(int,progress))!=list(range(40))
    or sorted(map(int,adv['relative_advantage']))!=list(range(40))
    or sorted(map(int,adv['absolute_advantage']))!=list(range(40))
    or adv['horizon']!=50
    or adv['estimator']!='rby1_advantage_estimator_113_260627/step_010000'):
    die('ANNOTATION_PROFILE_INVALID')

progress_array=np.asarray(progress_values,dtype=np.float64)
relative_array=np.asarray(relative_values,dtype=np.float64)
absolute_array=np.asarray(absolute_values,dtype=np.float64)
if (len(progress_values)!=81813 or len(relative_values)!=81813 or len(absolute_values)!=81813
    or not np.isfinite(progress_array).all() or not np.isfinite(relative_array).all()
    or not np.isfinite(absolute_array).all() or relative_above!=24553 or relative_equal!=4
    or relative_residual>0.0001000001
    or abs(float(np.quantile(relative_array,.70,method='linear'))-0.032024)>1e-12):
    die('ANNOTATION_VALUES_INVALID')

if (set(intervention.tolist())!={1.0} or int((intervention==1).sum())!=81813
    or len(set(episode_index[intervention==1].tolist()))!=40): die('INTERVENTION_BYTES_INVALID')
if (not np.isfinite(states).all() or not np.isfinite(actions).all()
    or not np.isfinite(timestamps).all()): die('NONFINITE_TELEMETRY')

episode_nulls={}
episode_nonfinite={}
for field in episode_pf.schema_arrow.names:
    values=[value for row in episodes for value in finite_leaves(row[field])]
    nulls=sum(value is None for value in values)
    nonfinite=sum(isinstance(value,float) and not math.isfinite(value) for value in values)
    if nulls: episode_nulls[field]=nulls
    if nonfinite: episode_nonfinite[field]=nonfinite
if (episode_nulls!={'meta/episodes/chunk_index':39,'meta/episodes/file_index':39}
    or episode_nonfinite): die('EPISODE_NULL_OR_NONFINITE_PROFILE_INVALID')

projection=hashlib.sha256()
for batch in data_pf.iter_batches(batch_size=512):
    for row in batch.to_pylist():
        projection.update(canonical(row).encode()); projection.update(b'\n')
telemetry_root='sha256:'+projection.hexdigest()
if telemetry_root!='sha256:a5252d29b1f584a40f72a18aec310fa817111165ddeaf9ce3acc9def6c5dfc2f':
    die('TELEMETRY_ROOT_INVALID')

mechanics=[]
for dimension,name in enumerate(motor_names):
    state=states[:,dimension]; action=actions[:,dimension]
    mechanics.append({'dimension':dimension,'name':name,
      'stateMin':round(float(state.min()),6),'stateMax':round(float(state.max()),6),
      'stateMean':round(float(state.mean()),6),'stateStd':round(float(state.std()),6),
      'actionMin':round(float(action.min()),6),'actionMax':round(float(action.max()),6),
      'actionMean':round(float(action.mean()),6),'actionStd':round(float(action.std()),6),
      'actionStateMeanAbsoluteDelta':round(float(np.abs(action-state).mean()),6)})

outcome_like=sorted({name for name in data.schema.names+episode_pf.schema_arrow.names
 if any(token in name.lower() for token in ['success','failure','outcome','reward','done','recovery','recovered'])})
task_table_label=tasks[0]['__index_level_0__']; episode_task_labels=sorted({task for row in episodes for task in row['tasks']})
if (tasks!=[{'task_index':0,'__index_level_0__':'fold the t-shirt'}]
    or episode_task_labels!=['fold the t-shirts'] or outcome_like): die('TASK_OR_OUTCOME_SCHEMA_INVALID')

annotation_root=sha(canonical({'progress':progress,'advantage':adv}).encode())
if annotation_root!='sha256:d9bc56cb404fa993f15c569508355ce4f3b6e70c8af21a0d37c4fd5efea4f840':
    die('ANNOTATION_ROOT_INVALID')
episode_profile_root=sha(canonical(episode_profiles).encode())
if episode_profile_root!='sha256:ff453e0f713d3433aa476deaf1f159c695a972755b00a5cc3a91b5a4554e16a8':
    die('EPISODE_ROOT_INVALID')
expected_gap={'positiveGapCount':4,'positiveGapSeconds':122.93333333333335,
 'maximumPositiveGapSeconds':63.86666666666666,'negativeOverlapCount':0,'negativeOverlapSeconds':0}
if any(value!=expected_gap for value in gap_profiles.values()): die('VIDEO_GAP_PROFILE_INVALID')
if not (file_profiles['cam_high']==file_profiles['cam_left_wrist']==file_profiles['cam_right_wrist']):
    die('VIDEO_FILE_PROFILE_DIVERGENCE')

print(canonical({
 'parquet':{'dataRows':81813,'dataRowGroups':1,'dataColumns':data.schema.names,
  'dataSchemaSha256':'sha256:64adc0ee207c6fc771815c323d278647bfe1ec74672d7ef8b36a51355554ee60',
  'episodeRows':40,'episodeRowGroups':1,
  'episodeSchemaSha256':'sha256:3fda9e6ffa6260ba521448dfa2157b8bd368199bc56bc028288744b1b1d16339',
  'taskRows':1,'taskRowGroups':1,
  'taskSchemaSha256':'sha256:37a43b274805e0b0d933cbc0d5dc703e5a74afeb91ea6ddc2d3e64b1985db823'},
 'telemetry':{'frames':81813,'episodes':40,'stateDimensions':26,'actionDimensions':26,
  'nonfiniteStateValues':0,'nonfiniteActionValues':0,'nonfiniteTimestampValues':0,
  'globalIndexExact':True,'episodeIndicesExact':True,'frameIndicesExactWithinEpisode':True,
  'taskIndexValues':[0],'timestampCadenceMaxAbsoluteError':timestamp_error,
  'telemetryRowProjectionRoot':telemetry_root,'mechanics':mechanics,
  'globalStateActionStatsExact':True,
  'episodeStateActionMinMaxAndCountExactRows':episode_minmax_count_exact,
  'episodeStateActionMeanStdExactRows':episode_meanstd_exact,
  'episodeStateActionMeanMaximumAbsoluteError':episode_mean_max_error,
  'episodeStateActionStdMaximumAbsoluteError':episode_std_max_error},
 'intervention':{'fieldName':'observation.is_intervention','uniqueValues':[1.0],
  'oneFrames':81813,'zeroFrames':0,'otherFrames':0,'episodesWithIntervention':40},
 'episodes':{'lengths':episode_lengths,'lengthMin':min(episode_lengths),
  'lengthMax':max(episode_lengths),'lengthSum':sum(episode_lengths),
  'computedLengthsEqualMetadata':True,'fromIndicesExact':True,'toIndicesExact':True,
  'dataChunkIndices':[0],'dataFileIndices':[0],'videoFileIndices':list(range(28)),
  'videoDurationMaxAbsoluteError':2.842170943040401e-14,
  'videoGapProfiles':gap_profiles,'videoFileProfile':file_profiles['cam_high'],
  'cameraVideoMappingsExact':True,
  'visualStatsCountCrossCameraExactRows':visual_count_cross_camera_exact,
  'nullCellsByField':episode_nulls,'nonfiniteCellsByField':episode_nonfinite,
  'episodeProfileRoot':episode_profile_root},
 'tasks':{'taskTableLabel':task_table_label,'episodeTaskLabels':episode_task_labels,
  'taskLabelsExactMatch':False,'readmeTaskLabel':'fold the t-shirt'},
 'annotations':{'progressValues':81813,'relativeValues':81813,'absoluteValues':81813,
  'progressEpisodeKeysExact':True,'relativeEpisodeKeysExact':True,'absoluteEpisodeKeysExact':True,
  'progressLengthsEqualEpisodes':True,'relativeLengthsEqualEpisodes':True,
  'absoluteLengthsEqualEpisodes':True,'nonfiniteProgressValues':0,
  'nonfiniteRelativeValues':0,'nonfiniteAbsoluteValues':0,
  'progressMin':float(progress_array.min()),'progressMax':float(progress_array.max()),
  'progressMean':float(progress_array.mean()),'relativeMin':float(relative_array.min()),
  'relativeMax':float(relative_array.max()),'relativeMean':float(relative_array.mean()),
  'absoluteMin':float(absolute_array.min()),'absoluteMax':float(absolute_array.max()),
  'absoluteMean':float(absolute_array.mean()),'horizon':50,'estimator':adv['estimator'],
  'relativeFormulaMaxAbsoluteResidual':relative_residual,
  'relativeAbove0032Frames':relative_above,'relativeEqual0032Frames':relative_equal,
  'relativeEmpiricalP70Linear':float(np.quantile(relative_array,.70,method='linear')),
  'annotationProjectionRoot':annotation_root},
 'metadata':{'robotType':'rby1','fps':30,'totalEpisodes':40,'totalFrames':81813,
  'totalTasks':1,'motorNamesExactAcrossStateAction':True,
  'statsIntervention':stats['observation.is_intervention']},
 'semantics':{'outcomeLikeParquetFields':outcome_like,'videoPayloadsParsed':False,
  'downloadedCodeExecuted':False,'independentOutcomeFields':0}
}))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_RBY1_FOLD_HIL_PYTHON
    ?? "/opt/anaconda3/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 180_000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", PYTHONWARNINGS: "ignore" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim() ?? result.status);
  }
  try { return deepFreeze(JSON.parse(result.stdout)); }
  catch { fail("REPLAY_OUTPUT_INVALID"); }
}

export function buildRby1FoldHilArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected);
  const sourceManifest = deepFreeze({ ...body,
    manifestHash: digest(MANIFEST_DOMAIN, body) });
  const manifestFile = readSmall(collected.root, "source-manifest.json");
  if (!manifestFile.contents.equals(serialize(sourceManifest))) {
    fail("SOURCE_MANIFEST_MISMATCH");
  }
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: RBY1_FOLD_HIL_SCHEMA,
    disposition: RBY1_FOLD_HIL_DISPOSITION,
    scope: {
      kind: RBY1_FOLD_HIL_SCOPE,
      datasetId: RBY1_FOLD_HIL_DATASET_ID,
      revision: RBY1_FOLD_HIL_REVISION,
      completePinnedNoVideoClosureAcquired: true,
      completePublishedEpisodeAndFrameRowsReplayed: true,
      noVideoFiles: 9, noVideoBytes: 12_020_956,
      excludedVideoFiles: 84, excludedVideoBytes: 3_886_601_917,
      videoPayloadBytesAcquired: 0,
      allModalitiesAcquired: false,
      globalRbY1AttemptPopulationExhausted: false,
      baseV10BytesAcquired: 0,
    },
    source: {
      publicAtAcquisition: true, gatedAtAcquisition: false,
      disabledAtAcquisition: false, cardLicenseClaim: "Apache-2.0",
      fixedRevisionTreeEntries: 106, fixedRevisionFiles: 93,
      fixedRevisionDirectories: 13, fixedRevisionFileBytes: 3_898_622_873,
      apiUsedStorageBytes: 11_366_751_897,
      apiUsedStorageIsNotPinnedTreeByteCount: true,
      fixedTreeLfsBytes: 3_896_406_002,
      noVideoFiles: 9, noVideoBytes: 12_020_956,
      excludedVideoFiles: 84, excludedVideoBytes: 3_886_601_917,
      excludedVideoFilesByCamera: collected.tree.cameras,
      repositoryLicenseFilePresent: false,
      recordBeforeAfterExact: true, treeBeforeAfterExact: true,
      sourceManifestHash: sourceManifest.manifestHash,
      sourceManifestFileSha256: manifestFile.sha256,
      sourceRoot: sourceManifest.sourceRoot,
    },
    replay: { ...replay,
      extractorSha256: sha256(Buffer.from(PYTHON_REPLAY, "utf8")) },
    taskIdentity: {
      readmeTaskLabel: "fold the t-shirt",
      taskTableLabel: replay.tasks.taskTableLabel,
      episodeMetadataTaskLabels: replay.tasks.episodeTaskLabels,
      taskTableMatchesReadme: true,
      episodeMetadataMatchesTaskTable: replay.tasks.taskLabelsExactMatch,
      singularPluralDiscrepancyPreserved: true,
      silentNormalizationApplied: false,
      taskIndexRows: 81_813, taskIndexValue: 0,
    },
    execution: {
      publisherClaimsRbY1RealRobotCollection: true,
      publisherAttributedRealRobotEpisodes: 40,
      publisherAttributedRealRobotFrames: 81_813,
      byteNativeStateActionTelemetryFrames: 81_813,
      independentlyVerifiedPhysicalExecutionFrames: 0,
      independentVisualWitnessFrames: 0,
      visualPayloadsAcquired: 0,
      visualPayloadsParsed: false,
      downloadedCodeExecuted: false,
      networkActionsReplayed: 0,
    },
    intervention: {
      publisherReadmeClaimsEveryFrameIntervention: true,
      byteNativeFieldName: replay.intervention.fieldName,
      byteNativeInterventionRows: replay.intervention.oneFrames,
      byteNativeNonInterventionRows: replay.intervention.zeroFrames,
      byteNativeOtherValueRows: replay.intervention.otherFrames,
      byteNativeInterventionEpisodes: replay.intervention.episodesWithIntervention,
      allPublishedFramesMarkedInterventionByBytes: true,
      interventionProducerIndependentFromCollectionSystem: false,
      independentlyVerifiedInterventionRows: 0,
      interventionAutomaticallyMeansRecovery: false,
    },
    annotations: {
      publisherDeclaresModelPredictedEstimatorAnnotations: true,
      estimator: replay.annotations.estimator,
      horizonFrames: replay.annotations.horizon,
      stageProgressPredictionRows: replay.annotations.progressValues,
      relativeAdvantagePredictionRows: replay.annotations.relativeValues,
      absoluteAdvantagePredictionRows: replay.annotations.absoluteValues,
      eachAnnotationSetCrosswalksOneToOneWithFrames: true,
      relativeFormulaMaxAbsoluteResidual:
        replay.annotations.relativeFormulaMaxAbsoluteResidual,
      publisherApproximateP70Threshold: 0.032,
      byteEmpiricalP70Linear: replay.annotations.relativeEmpiricalP70Linear,
      relativeAbovePublisherThresholdRows:
        replay.annotations.relativeAbove0032Frames,
      relativeEqualPublisherThresholdRows:
        replay.annotations.relativeEqual0032Frames,
      modelPredictionIsOutcomeLabel: false,
      modelPredictionIsIndependentWitness: false,
      estimatorImplementationBytesAcquired: 0,
    },
    curation: {
      publisherClaimsDaggerCorrectionSet: true,
      publisherClaimsHandEditedAndRecovered: true,
      publisherClaimsDatasetSegmentEditorAndReencoding: true,
      byteNativeVideoTimestampPositiveGapCountPerCamera: 4,
      byteNativeVideoTimestampPositiveGapSecondsPerCamera:
        replay.episodes.videoGapProfiles.cam_high.positiveGapSeconds,
      byteNativeVideoTimestampMaximumGapSeconds:
        replay.episodes.videoGapProfiles.cam_high.maximumPositiveGapSeconds,
      videoTimestampGapsInterpretedAsFailedAttempts: false,
      handEditedMeansCompleteAttemptCensus: false,
      causalRecoveryPairRows: 0,
      upstreamDiscardedOrOmittedAttemptsKnown: false,
    },
    lineage: {
      publisherReadmeClaimsV10TrainedPolicyCollection: true,
      publisherReadmeClaimsV10CleanedImitationMasterEpisodes: 126,
      baseDatasetIdClaim: "RB3159/rby1-fold-v1.0",
      baseV10RecordBytesAcquired: 0,
      baseV10TrajectoryBytesAcquired: 0,
      exactByteOrEpisodeLinkageToV10Established: false,
      publisherLineageClaimPromotedToByteIdentity: false,
    },
    outcome: {
      outcomeSuccessFailureRewardDoneSchemaFields:
        replay.semantics.outcomeLikeParquetFields,
      publisherNativeTaskOutcomeRows: 0,
      modelPredictedAdvantageOutcomeRows: 0,
      independentlyVerifiedOutcomeRows: 0,
      independentEffectRows: 0,
      completeCollectionAttemptCensusEstablished: false,
      allInterventionIsSuccessOrRecovery: false,
    },
    recovery: {
      publisherReadmeRecoveredEpisodeClaim: true,
      sourceNativeRecoveryLabelRows: 0,
      sourceNativeRetryIdentifiers: 0,
      pairedFailureToCorrectionRows: 0,
      causalRecoveryRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      longitudinalRecoveryRows: 0,
      curatedCorrectionSetIsRecoveryCensus: false,
    },
    mechanics: {
      robotType: replay.metadata.robotType,
      frames: replay.telemetry.frames,
      fps: replay.metadata.fps,
      stateDimensions: replay.telemetry.stateDimensions,
      actionDimensions: replay.telemetry.actionDimensions,
      motorNamesExactAcrossStateAndAction:
        replay.metadata.motorNamesExactAcrossStateAction,
      perDimensionTelemetry: replay.telemetry.mechanics,
      globalStateActionStatsExact: replay.telemetry.globalStateActionStatsExact,
      episodeStateActionMinMaxAndCountExactRows:
        replay.telemetry.episodeStateActionMinMaxAndCountExactRows,
      episodeStateActionMeanStdExactRows:
        replay.telemetry.episodeStateActionMeanStdExactRows,
      episodeStateActionMeanMaximumAbsoluteError:
        replay.telemetry.episodeStateActionMeanMaximumAbsoluteError,
      episodeStateActionStdMaximumAbsoluteError:
        replay.telemetry.episodeStateActionStdMaximumAbsoluteError,
      nonfiniteStateValues: replay.telemetry.nonfiniteStateValues,
      nonfiniteActionValues: replay.telemetry.nonfiniteActionValues,
    },
    completeness: {
      episodeRows: 40, frameRows: 81_813,
      globalIndexExact: replay.telemetry.globalIndexExact,
      frameIndicesExactWithinEpisode:
        replay.telemetry.frameIndicesExactWithinEpisode,
      episodeLengthsExactAcrossDataMetadataAndAnnotations: true,
      annotationValuesPerSet: 81_813,
      visualStatsMetadataRows: 40,
      visualStatsCountCrossCameraExactRows:
        replay.episodes.visualStatsCountCrossCameraExactRows,
      episodeMetadataNullCellsByField: replay.episodes.nullCellsByField,
      episodeMetadataNonfiniteCellsByField:
        replay.episodes.nonfiniteCellsByField,
      episodeSelfLocatorFieldsPopulatedOnlyForFinalEpisode: true,
      visualStatsIndependentlyRecomputedRows: 0,
      visualFileDurationMetadataAlignedRows: 40,
      visualContentCompletenessEstablished: false,
    },
    privacy: {
      videosExcluded: true, rawVisualBytes: 0,
      humanInTheLoopPublisherClaimPresent: true,
      operatorConsentEvidenceBytesAcquired: 0,
      rawTelemetryPrivate: true, rawAnnotationValuesPrivate: true,
      rawProjectionRows: 0,
      independentPrivacyAuditRows: 0,
      noPiiOrSensitiveDataGuaranteed: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    activeContent: {
      executableFilesAcquired: 0,
      downloadedCommandsOrCodeExecuted: 0,
      payloadsExecuted: 0, networkActionsReplayed: 0,
    },
    rights: {
      datasetCardLicenseClaim: "Apache-2.0",
      readmeFrontMatterLicenseClaim: "apache-2.0",
      repositoryLicenseFilePresent: false,
      datasetContentRightsIndependentlyAdjudicated: false,
      humanDemonstrationRightsIndependentlyAdjudicated: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
      commercialUseAuthorizedByThisArtifact: false,
      legalConclusionEstablished: false,
    },
    denominators: {
      PUBLISHED_CORRECTION_EPISODE_ROW: 40,
      PUBLISHED_TELEMETRY_FRAME_ROW: 81_813,
      PUBLISHER_NATIVE_INTERVENTION_FRAME_ROW: 81_813,
      MODEL_PREDICTED_ANNOTATION_VALUE_PER_SET: 81_813,
      INDEPENDENT_OUTCOME_ROW: 0,
      INDEPENDENT_RECOVERY_ROW: 0,
      COMPLETE_ATTEMPT_CENSUS_ROW: 0,
    },
    boundary: {
      independentlyVerifiedOutcomeRows: 0,
      independentEffectRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      completeAttemptCensusRows: 0,
      authorizedTrainingRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createRby1FoldHilReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: RBY1_FOLD_HIL_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    scope: RBY1_FOLD_HIL_SCOPE,
    noVideoFiles: 9, noVideoBytes: 12_020_956,
    episodes: 40, frames: 81_813,
    publisherNativeInterventionFrames: 81_813,
    independentlyVerifiedOutcomeRows: 0,
    independentEffectRows: 0, independentlyVerifiedRecoveryRows: 0,
    completeAttemptCensusRows: 0,
    authorizedTrainingRows: 0, offlineTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyRby1FoldHilArtifactDirectory(directory, options = {}) {
  try {
    const root = path.resolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportFile = readSmall(root, "report.json");
    const receiptFile = readSmall(root, "run-receipt.json");
    const built = buildRby1FoldHilArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!reportFile.contents.equals(expectedReport)) fail("REPORT_REPLAY_MISMATCH");
    const manifestFile = readSmall(root, "source/source-manifest.json");
    const receipt = createRby1FoldHilReceipt(
      built.report, expectedReport, manifestFile.contents);
    if (!receiptFile.contents.equals(serialize(receipt))) {
      fail("RECEIPT_REPLAY_MISMATCH");
    }
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeRby1FoldHilArtifact(value) {
  return serialize(value);
}
