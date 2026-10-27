/*
 * Complete semantic no-video replay for Bekhzod's merged FR3 pick/place data.
 *
 * The repository name is publisher naming, not an outcome annotation.  The
 * selected bytes contain 350 kinematic trajectories and metadata, but no
 * reward, done, success, failure, intervention, or recovery field.  Video
 * objects are inventoried only and no physical witness is claimed.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, existsSync, fstatSync, lstatSync, openSync,
  readFileSync, readSync, readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const FR3_RECOVERY_DATASET_ID =
  "Bekhzod/fr3_pickplace_fixed_goal_robustness_recovery_merged_data";
export const FR3_RECOVERY_REVISION =
  "000189f40a3b33daa92d4089bd56f161f5d56132";
export const FR3_RECOVERY_CARD_LICENSE = "apache-2.0";
export const FR3_RECOVERY_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";
export const FR3_RECOVERY_REPORT_SCHEMA =
  "outsider/fr3-pickplace-recovery-no-video/v1";
export const FR3_RECOVERY_RECEIPT_SCHEMA =
  "outsider/fr3-pickplace-recovery-no-video-receipt/v1";

const SOURCE_SCHEMA = "outsider/fr3-pickplace-recovery-no-video-source/v1";
const TREE_ROOT_DOMAIN = "outsider/fr3-recovery-tree-root/v1";
const SOURCE_ROOT_DOMAIN = "outsider/fr3-recovery-source-root/v1";
const MANIFEST_DOMAIN = "outsider/fr3-recovery-source-manifest/v1";
const REPORT_DOMAIN = "outsider/fr3-recovery-report/v1";
const RECEIPT_DOMAIN = "outsider/fr3-recovery-receipt/v1";
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_SELECTED_FILE_BYTES = 8 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const TASK = "Pick up the object and place it at the target location.";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:907ad5783c9c4b134c2c6984a5034b26a04f41d74b814cbf309837e96e2f6b9f";
const EXPECTED_SOURCE_ROOT =
  "sha256:fddfbbe8b9ad677517ab0fdb8a08d45b3406545ee0b8ba48abdac975c5b052b8";

const SELECTED = Object.freeze([
  Object.freeze({ path: ".gitattributes", bytes: 2_504,
    oid: "bed0738c7eeb449bca98b5d2f33c89a1ee56349a", lfs: null, xetHash: null,
    sha256: "sha256:9e75dd981de037ec3769f24f790e126bc5a160b6871f510214e68dc70649aeeb" }),
  Object.freeze({ path: "README.md", bytes: 3_641,
    oid: "2c567a7c2b2e4658e4edadf05720d5326d9bce32", lfs: null, xetHash: null,
    sha256: "sha256:f6e0dfc7520888e13a2ff53174ab1aa398a07ddf5b9b58b2945d71eaeb2b85ba" }),
  Object.freeze({ path: "data/chunk-000/file-000.parquet", bytes: 5_024_735,
    oid: "63a533e7be43ae2871f8ab710c7f887938c48f45",
    lfs: Object.freeze({ oid: "fb376a224980ab86faf0ff0951a94e2939d3a7dd5f95a8218798d32d3cd69fd8",
      size: 5_024_735, pointerSize: 132 }),
    xetHash: "bcdfe4fd380d5ef77499b24fdfced83c48a0174004ebc868151dcbc87d76b7fa",
    sha256: "sha256:fb376a224980ab86faf0ff0951a94e2939d3a7dd5f95a8218798d32d3cd69fd8" }),
  Object.freeze({ path: "meta/episodes/chunk-000/file-000.parquet", bytes: 593_916,
    oid: "d181a8590de0d559538bb31a39f4f4909dc91ce3",
    lfs: Object.freeze({ oid: "f959c97f704b9d3c06650ef3da9d264954f5454ed53848f7cd3ea80fc4c7c1b8",
      size: 593_916, pointerSize: 131 }),
    xetHash: "cdfec2adfbb7ee5528b7b82fa6a7bcdd532a408ef8d96ddd140468b16b57c377",
    sha256: "sha256:f959c97f704b9d3c06650ef3da9d264954f5454ed53848f7cd3ea80fc4c7c1b8" }),
  Object.freeze({ path: "meta/info.json", bytes: 3_152,
    oid: "cfbdf15082b7c18d29f764bd31ae0935d7a7ca69", lfs: null, xetHash: null,
    sha256: "sha256:e37d6167d1c81f4d6fd7c4ccaf80dae9da7bc4f3452338aafa637537f3268e01" }),
  Object.freeze({ path: "meta/stats.json", bytes: 13_589,
    oid: "66282a76241e8bcf8d48112c7e63d63ff8da746b", lfs: null, xetHash: null,
    sha256: "sha256:59a9d4fc621041ef99963fb7e4016b15ef0e0464b00a33c48dfd2c2eebc9ab14" }),
  Object.freeze({ path: "meta/tasks.parquet", bytes: 2_370,
    oid: "4a65511dd7f746de43632259ca218ad81b15b910",
    lfs: Object.freeze({ oid: "9365b3c4a7661222602ffb3ede7c097ef4dfed0de290cf48d54a1aec9445e881",
      size: 2_370, pointerSize: 129 }),
    xetHash: "bc944391e7b68e19e54370d6a4d38273b2e4aaabc84c98ba8d2edc99f9582d5a",
    sha256: "sha256:9365b3c4a7661222602ffb3ede7c097ef4dfed0de290cf48d54a1aec9445e881" }),
]);

const VIDEO_INVENTORY = Object.freeze([
  Object.freeze({ path: "videos/observation.images.front/chunk-000/file-000.mp4",
    bytes: 107_766_569, oid: "f6a08c0ab6aea959c1ed5778c56966c58de5bcb2",
    lfs: Object.freeze({ oid: "26580470541625cb93ccdbe502f4b52a765f21c09910114d6f50ec14fe2e25d7",
      size: 107_766_569, pointerSize: 134 }),
    xetHash: "08e4064a579b62629ef9b7a0b5d450eb21c18f7fd10e6350448d30ba3b70fec6" }),
  Object.freeze({ path: "videos/observation.images.top/chunk-000/file-000.mp4",
    bytes: 200_684_827, oid: "abd762839bfe9c6a7604e2d49b104be79c1d3b17",
    lfs: Object.freeze({ oid: "87e774cfbe341652d95f5061777aba4a231e4be92bc39e23929ddd0780c7d6fd",
      size: 200_684_827, pointerSize: 134 }),
    xetHash: "1d666b0d0094a769b2476cc781e1770472ff005e69ee152a3b1bdd245ff8a55e" }),
  Object.freeze({ path: "videos/observation.images.top/chunk-000/file-001.mp4",
    bytes: 78_437_654, oid: "146fa27c5cf0bf9efa72627fbfb320313c428d8f",
    lfs: Object.freeze({ oid: "2829fca50a2d30007303e7c629b507c29530ca34e384cd50c4820c8b2fe303b0",
      size: 78_437_654, pointerSize: 133 }),
    xetHash: "deeb073ae7f0ee26bc14be56f89105208a11e3ce3375fb9d4a431767e36c6924" }),
]);

const DIRECTORY_INVENTORY = Object.freeze([
  Object.freeze({ path: "data", oid: "b4288899d48602a3752f0aa9149226fbe3106dae" }),
  Object.freeze({ path: "data/chunk-000", oid: "e0083d5b4efac8319f26ec23b53fbe5ccba83ef4" }),
  Object.freeze({ path: "meta", oid: "90f23efb6c5221627b68809b838a94529158cb83" }),
  Object.freeze({ path: "meta/episodes", oid: "20e98acc3f84093da6819887f70b9a48d7623244" }),
  Object.freeze({ path: "meta/episodes/chunk-000", oid: "dd1b850e1ab6fef4cc60dc000039b2aa828d194c" }),
  Object.freeze({ path: "videos", oid: "28eb0be031dfc795d3b6c8338cbcd4a1e6c97919" }),
  Object.freeze({ path: "videos/observation.images.front", oid: "c995de12f5f9c873f4a0072fb49085ae6ccd3960" }),
  Object.freeze({ path: "videos/observation.images.front/chunk-000", oid: "2da3cdebcb853a44fdb4dd097cd53078bd3ecaec" }),
  Object.freeze({ path: "videos/observation.images.top", oid: "cca47e85aae543c0a5b2bc7575516d118c8f7b0b" }),
  Object.freeze({ path: "videos/observation.images.top/chunk-000", oid: "8babea2fc4b696808be58e45736b469ea535e9d5" }),
]);
const SELECTED_BYTES = SELECTED.reduce((sum, item) => sum + item.bytes, 0);
const VIDEO_BYTES = VIDEO_INVENTORY.reduce((sum, item) => sum + item.bytes, 0);
const FULL_TREE_BYTES = SELECTED_BYTES + VIDEO_BYTES;

function fail(code, detail = null) {
  throw new Error(detail === null ? `FR3_RECOVERY_${code}`
    : `FR3_RECOVERY_${code}:${detail}`);
}

export function fr3RecoverySha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function digest(domain, value) {
  return fr3RecoverySha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}
function serialize(value) { return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"); }
function same(left, right) { return canonicalizeStrict(left) === canonicalizeStrict(right); }
function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}
function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)
    || ArrayBuffer.isView(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
function strictUtf8(bytes, code) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(code); }
}
function parseJson(bytes, code) {
  try { return JSON.parse(strictUtf8(bytes, code)); }
  catch { fail(code); }
}
function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")
    || value.includes("\\") || value.includes("\0")
    || value.split("/").some((part) => ["", ".", ".."].includes(part))
    || path.posix.normalize(value) !== value) fail("PATH_INVALID", String(value));
  return value;
}
function checkedPath(root, relative) {
  safeRelative(relative); const base = path.resolve(root); const target = path.resolve(base, relative);
  const relation = path.relative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_INVALID", relative);
  return target;
}
function checkedRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedPath(root, relative); const status = lstatSync(target, { bigint: true });
  if (!status.isFile() || status.isSymbolicLink() || Number(status.mode & 0o777n) !== 0o600
    || status.size < 1n || status.size > BigInt(maximumBytes)
    || exactBytes !== null && status.size !== BigInt(exactBytes)) {
    fail("SOURCE_FILE_INVALID", relative);
  }
  return { target, bytes: Number(status.size) };
}
function readRegular(root, relative, maximumBytes = MAX_METADATA_BYTES, exactBytes = null) {
  return readFileSync(checkedRegular(root, relative, maximumBytes, exactBytes).target);
}
function hashRegular(root, relative, maximumBytes, exactBytes = null) {
  const checked = checkedRegular(root, relative, maximumBytes, exactBytes);
  const descriptor = openSync(checked.target, O_RDONLY | O_NOFOLLOW);
  try {
    const status = fstatSync(descriptor, { bigint: true });
    if (!status.isFile() || status.size !== BigInt(checked.bytes)) {
      fail("SOURCE_FILE_CHANGED", relative);
    }
    const sha = createHash("sha256"); const git = createHash("sha1");
    git.update(Buffer.from(`blob ${checked.bytes}\0`, "utf8"));
    const buffer = Buffer.allocUnsafe(1024 * 1024); let offset = 0;
    while (offset < checked.bytes) {
      const count = readSync(descriptor, buffer, 0,
        Math.min(buffer.length, checked.bytes - offset), offset);
      if (count < 1) fail("SOURCE_FILE_SHORT", relative);
      const chunk = buffer.subarray(0, count); sha.update(chunk); git.update(chunk); offset += count;
    }
    return { bytes: checked.bytes, sha256: `sha256:${sha.digest("hex")}`,
      gitOid: git.digest("hex") };
  } finally { closeSync(descriptor); }
}
function walkPrivate(root) {
  const found = [];
  function visit(directory, prefix) {
    const status = lstatSync(directory, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700) fail("SOURCE_DIRECTORY_INVALID", prefix);
    for (const name of readdirSync(directory).sort()) {
      const relative = prefix === "" ? name : `${prefix}/${name}`;
      const target = path.join(directory, name); const child = lstatSync(target, { bigint: true });
      if (child.isSymbolicLink()) fail("SOURCE_SYMLINK", relative);
      if (child.isDirectory()) visit(target, relative);
      else if (child.isFile()) {
        if (Number(child.mode & 0o777n) !== 0o600) fail("SOURCE_MODE_INVALID", relative);
        found.push(relative);
      } else fail("SOURCE_TYPE_INVALID", relative);
    }
  }
  visit(path.resolve(root), ""); return found;
}

export function fr3RecoveryPayloadSpecifications() {
  return SELECTED.map((item) => ({ ...item,
    lfs: item.lfs === null ? null : { ...item.lfs } }));
}

function treeProjection(tree) {
  if (!Array.isArray(tree) || tree.length !== 20) fail("TREE_SHAPE_INVALID");
  const directories = tree.filter((item) => item.type === "directory");
  const files = tree.filter((item) => item.type === "file");
  if (directories.length !== 10 || files.length !== 10
    || !same(sorted(directories.map((item) => item.path)),
      sorted(DIRECTORY_INVENTORY.map((item) => item.path)))
    || !same(sorted(files.map((item) => item.path)),
      sorted([...SELECTED, ...VIDEO_INVENTORY].map((item) => item.path)))
    || files.reduce((sum, item) => sum + item.size, 0) !== FULL_TREE_BYTES) {
    fail("TREE_CENSUS_INVALID");
  }
  const expectedDirectoryByPath = new Map(DIRECTORY_INVENTORY
    .map((item) => [item.path, item]));
  for (const item of directories) {
    const expected = expectedDirectoryByPath.get(item.path);
    if (!expected || item.size !== 0 || item.oid !== expected.oid) {
      fail("TREE_DIRECTORY_INVALID", item.path);
    }
  }
  const expectedByPath = new Map([...SELECTED, ...VIDEO_INVENTORY]
    .map((item) => [item.path, item]));
  for (const item of files) {
    const expected = expectedByPath.get(item.path);
    if (!expected || item.size !== expected.bytes || item.oid !== expected.oid
      || !same(item.lfs ?? null, expected.lfs) || (item.xetHash ?? null) !== expected.xetHash) {
      fail("TREE_OBJECT_INVALID", item.path);
    }
  }
  const observed = tree.map((item) => ({ path: item.path, type: item.type,
    bytes: item.size, oid: item.oid,
    ...(item.type === "file" ? { lfs: item.lfs ?? null,
      xetHash: item.xetHash ?? null } : {}) }));
  return { entries: 20, files: 10, directories: 10, fileBytes: FULL_TREE_BYTES,
    lfsFiles: 6, xetFiles: 6, selectedFiles: 7, selectedBytes: SELECTED_BYTES,
    videoFiles: 3, videoBytes: VIDEO_BYTES,
    videoInventory: VIDEO_INVENTORY.map((item) => ({ ...item, lfs: { ...item.lfs } })),
    treeRoot: digest(TREE_ROOT_DOMAIN, observed) };
}

export function inspectFr3RecoveryMetadata(recordBytes, treeBytes) {
  // Dataset-record/tree API bytes include mutable service annotations.  Raw
  // bytes are captured and bracketed within one run; the immutable revision
  // identity and complete path/type/size/Git/LFS/Xet projection are pinned
  // across acquisition time below.
  const record = parseJson(recordBytes, "record"); const tree = parseJson(treeBytes, "tree");
  const siblings = Array.isArray(record.siblings)
    ? sorted(record.siblings.map((item) => item.rfilename)) : [];
  if (record.id !== FR3_RECOVERY_DATASET_ID || record.sha !== FR3_RECOVERY_REVISION
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.cardData?.license !== FR3_RECOVERY_CARD_LICENSE
    || record.usedStorage !== 392_510_071
    || !same(siblings, sorted([...SELECTED, ...VIDEO_INVENTORY].map((item) => item.path)))) {
    fail("RECORD_CONTENT_INVALID");
  }
  return deepFreeze({ record: { createdAt: record.createdAt,
    lastModified: record.lastModified, downloadsAtAcquisition: record.downloads,
    usedStorageBytes: record.usedStorage, public: true, gated: false, disabled: false,
    cardLicenseClaim: record.cardData.license }, inventory: treeProjection(tree) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, pathlib, struct, sys
import pyarrow.parquet as pq

base=pathlib.Path(sys.argv[1])/'files'
task='Pick up the object and place it at the target location.'
features=['action','observation.state','observation.images.front','observation.images.top','timestamp','frame_index','episode_index','index','task_index']
metrics=['min','max','mean','std','count','q01','q10','q50','q90','q99']
data_columns=['action','observation.state','timestamp','frame_index','episode_index','index','task_index']
data_types=['list<element: float>','list<element: float>','float','int64','int64','int64','int64']
base_episode=['episode_index','tasks','length','data/chunk_index','data/file_index','dataset_from_index','dataset_to_index','videos/observation.images.front/chunk_index','videos/observation.images.front/file_index','videos/observation.images.front/from_timestamp','videos/observation.images.front/to_timestamp','videos/observation.images.top/chunk_index','videos/observation.images.top/file_index','videos/observation.images.top/from_timestamp','videos/observation.images.top/to_timestamp']
episode_columns=base_episode+[f'stats/{f}/{m}' for f in features for m in metrics]+['meta/episodes/chunk_index','meta/episodes/file_index']
def die(code): raise RuntimeError('FR3_RECOVERY_PYTHON_'+code)
def canon(v): return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)
def digest(domain,v): return 'sha256:'+hashlib.sha256((domain+'\0'+canon(v)).encode()).hexdigest()
def vector(v,n,code):
 if not isinstance(v,list) or len(v)!=n or any(not math.isfinite(float(x)) for x in v): die(code)
 return [float(x) for x in v]
def finite_nested(v):
 if isinstance(v,list): return all(finite_nested(x) for x in v)
 return isinstance(v,(int,float)) and math.isfinite(float(v))
def mean(v): return math.fsum(v)/len(v)
def std(v):
 m=mean(v); return math.sqrt(math.fsum((x-m)*(x-m) for x in v)/len(v))
def runs(rows,field):
 out=[];start=0;value=rows[0][field]
 for i,row in enumerate(rows[1:],1):
  if row[field]!=value:
   out.append({'fileIndex':value,'episodeFirst':start,'episodeLast':i-1,'datasetFrom':rows[start]['dataset_from_index'],'datasetTo':rows[i-1]['dataset_to_index']})
   start=i;value=row[field]
 out.append({'fileIndex':value,'episodeFirst':start,'episodeLast':len(rows)-1,'datasetFrom':rows[start]['dataset_from_index'],'datasetTo':rows[-1]['dataset_to_index']})
 return out
def trajectory_hash(rows):
 h=hashlib.sha256();h.update(b'fr3/canonical-trajectory/v1\0')
 for row in rows:
  for name in ['action','observation.state']:
   for value in row[name]:h.update(struct.pack('>f',float(value)))
  h.update(struct.pack('>f',float(row['timestamp'])))
  h.update(struct.pack('>q',int(row['frame_index'])))
  h.update(struct.pack('>q',int(row['task_index'])))
 return 'sha256:'+h.hexdigest()

info=json.loads((base/'meta/info.json').read_text(encoding='utf-8'))
global_stats=json.loads((base/'meta/stats.json').read_text(encoding='utf-8'))
if (info.get('codebase_version')!='v3.0' or info.get('robot_type')!='FR3WMS'
 or info.get('total_episodes')!=350 or info.get('total_frames')!=70915
 or info.get('total_tasks')!=1 or info.get('chunks_size')!=1000
 or info.get('data_files_size_in_mb')!=100 or info.get('video_files_size_in_mb')!=200
 or info.get('fps')!=30 or info.get('splits')!={'train':'0:350'}
 or info.get('data_path')!='data/chunk-{chunk_index:03d}/file-{file_index:03d}.parquet'
 or info.get('video_path')!='videos/{video_key}/chunk-{chunk_index:03d}/file-{file_index:03d}.mp4'
 or list(info.get('features',{}))!=features):die('INFO_PROFILE')
joint_names=['j1','j2','j3','j4','j5','j6','gripper_state']
for name in ['action','observation.state']:
 f=info['features'][name]
 if f.get('dtype')!='float32' or f.get('shape')!=[7] or f.get('names')!=joint_names:die('KINEMATIC_FEATURE')
for name in ['observation.images.front','observation.images.top']:
 f=info['features'][name];vi=f.get('info',{})
 if (f.get('dtype')!='video' or f.get('shape')!=[480,480,3]
  or vi.get('video.height')!=480 or vi.get('video.width')!=480 or vi.get('video.channels')!=3
  or vi.get('video.codec')!='libsvtav1' or vi.get('video.pix_fmt')!='yuv420p'
  or vi.get('video.fps')!=30 or vi.get('has_audio') is not False
  or vi.get('video.is_depth_map') is not False):die('VIDEO_FEATURE')

data_pf=pq.ParquetFile(base/'data/chunk-000/file-000.parquet');data_table=data_pf.read();rows=data_table.to_pylist()
episodes_pf=pq.ParquetFile(base/'meta/episodes/chunk-000/file-000.parquet');episodes_table=episodes_pf.read();episodes=episodes_table.to_pylist()
tasks_pf=pq.ParquetFile(base/'meta/tasks.parquet');tasks_table=tasks_pf.read();tasks=tasks_table.to_pylist()
if (data_table.schema.names!=data_columns or [str(f.type) for f in data_table.schema]!=data_types
 or data_pf.metadata.num_rows!=70915 or data_pf.metadata.num_row_groups!=1 or len(rows)!=70915):die('DATA_PARQUET')
if (episodes_table.schema.names!=episode_columns or episodes_pf.metadata.num_rows!=350
 or episodes_pf.metadata.num_row_groups!=1 or len(episodes)!=350 or episodes_table.num_columns!=107):die('EPISODES_PARQUET')
if (tasks_pf.metadata.num_rows!=1 or tasks_pf.metadata.num_row_groups!=1
 or tasks_table.schema.names!=['task_index','__index_level_0__']
 or tasks!=[{'task_index':0,'__index_level_0__':task}]):die('TASKS_PARQUET')

lengths=[];hist=collections.Counter();trajectory=[];trajectory_groups=collections.defaultdict(list)
all_action=[];all_state=[];cursor=0;episode_stat_mean_diff=0.0;episode_stat_std_diff=0.0
episode_scalar_mean_diff=0.0;episode_scalar_std_diff=0.0
episode_scalar_minmax_mismatch=collections.Counter();episode_scalar_offsets={name:collections.Counter() for name in ['episode_index','index']}
same_sum=[0.0]*7;same_max=[0.0]*7;same_exact=0;same_tol=0;same_count=0
next_sum=[0.0]*7;next_max=[0.0]*7;next_exact=0;next_tol=0;next_count=0
for expected,rowmeta in enumerate(episodes):
 if (rowmeta['episode_index']!=expected or rowmeta['tasks']!=[task]
  or not isinstance(rowmeta['length'],int) or rowmeta['length']<1
  or rowmeta['dataset_from_index']!=cursor
  or rowmeta['dataset_to_index']!=cursor+rowmeta['length']
  or rowmeta['data/chunk_index']!=0 or rowmeta['meta/episodes/chunk_index']!=0):die('EPISODE_CROSSWALK')
 lo=cursor;hi=rowmeta['dataset_to_index'];part=rows[lo:hi];length=rowmeta['length']
 if len(part)!=length:die('EPISODE_LENGTH')
 actions=[];states=[]
 for frame,row in enumerate(part):
  a=vector(row['action'],7,'ACTION');s=vector(row['observation.state'],7,'STATE')
  if (row['frame_index']!=frame or row['episode_index']!=expected
   or row['index']!=lo+frame or row['task_index']!=0
   or not math.isfinite(float(row['timestamp']))
   or abs(float(row['timestamp'])-frame/30)>0.000001):die('DATA_ROW')
  actions.append(a);states.append(s);all_action.append(a);all_state.append(s)
  diffs=[abs(a[d]-s[d]) for d in range(7)]
  for d,x in enumerate(diffs):same_sum[d]+=x;same_max[d]=max(same_max[d],x)
  same_exact+=int(all(x==0 for x in diffs));same_tol+=int(all(x<=0.0001 for x in diffs));same_count+=1
  if frame+1<length:
   ns=vector(part[frame+1]['observation.state'],7,'NEXT_STATE');nd=[abs(a[d]-ns[d]) for d in range(7)]
   for d,x in enumerate(nd):next_sum[d]+=x;next_max[d]=max(next_max[d],x)
   next_exact+=int(all(x==0 for x in nd));next_tol+=int(all(x<=0.0001 for x in nd));next_count+=1
 for name,values in [('action',actions),('observation.state',states)]:
  for metric in metrics:
   claimed=rowmeta[f'stats/{name}/{metric}']
   if not isinstance(claimed,list) or not finite_nested(claimed):die('EPISODE_STATS_FINITE')
  if rowmeta[f'stats/{name}/count']!=[length]:die('EPISODE_STATS_COUNT')
  actual_min=[min(v[d] for v in values) for d in range(7)];actual_max=[max(v[d] for v in values) for d in range(7)]
  actual_mean=[mean([v[d] for v in values]) for d in range(7)];actual_std=[std([v[d] for v in values]) for d in range(7)]
  if actual_min!=[float(x) for x in rowmeta[f'stats/{name}/min']] or actual_max!=[float(x) for x in rowmeta[f'stats/{name}/max']]:die('EPISODE_STATS_MIN_MAX')
  episode_stat_mean_diff=max(episode_stat_mean_diff,max(abs(actual_mean[d]-float(rowmeta[f'stats/{name}/mean'][d])) for d in range(7)))
  episode_stat_std_diff=max(episode_stat_std_diff,max(abs(actual_std[d]-float(rowmeta[f'stats/{name}/std'][d])) for d in range(7)))
 for name in ['timestamp','frame_index','episode_index','index','task_index']:
  values=[float(row[name]) for row in part]
  if rowmeta[f'stats/{name}/count']!=[length]:die('EPISODE_SCALAR_COUNT')
  tolerance=0.000001 if name=='timestamp' else 0.0
  actual_min=min(values);actual_max=max(values);claimed_min=float(rowmeta[f'stats/{name}/min'][0]);claimed_max=float(rowmeta[f'stats/{name}/max'][0])
  mismatch=(abs(actual_min-claimed_min)>tolerance or abs(actual_max-claimed_max)>tolerance)
  if mismatch:
   if name not in ['episode_index','index']:die('EPISODE_SCALAR_MIN_MAX')
   if abs((actual_min-claimed_min)-(actual_max-claimed_max))>0.0:die('EPISODE_SCALAR_OFFSET')
   episode_scalar_minmax_mismatch[name]+=1;episode_scalar_offsets[name][int(actual_min-claimed_min)]+=1
  elif name in episode_scalar_offsets:episode_scalar_offsets[name][0]+=1
  episode_scalar_mean_diff=max(episode_scalar_mean_diff,abs(mean(values)-float(rowmeta[f'stats/{name}/mean'][0])))
  episode_scalar_std_diff=max(episode_scalar_std_diff,abs(std(values)-float(rowmeta[f'stats/{name}/std'][0])))
 for name in features[2:]:
  for metric in metrics:
   if not finite_nested(rowmeta[f'stats/{name}/{metric}']):die('EPISODE_OTHER_STATS_FINITE')
 for name in ['observation.images.front','observation.images.top']:
  if rowmeta[f'stats/{name}/count']!=[100]:die('EPISODE_IMAGE_STATS_COUNT')
 canonical=trajectory_hash(part);trajectory.append({'episodeIndex':expected,'length':length,'canonicalTrajectoryHash':canonical})
 trajectory_groups[canonical].append(expected);lengths.append(length);hist[length]+=1;cursor=hi
if cursor!=70915 or sum(lengths)!=70915:die('TOTAL_ROWS')
dupes=[{'canonicalTrajectoryHash':key,'episodeIndices':value} for key,value in sorted(trajectory_groups.items()) if len(value)>1]

def actual_profile(values):
 dimensions=len(values[0]);cols=[[row[d] for row in values] for d in range(dimensions)]
 return {'min':[min(c) for c in cols],'max':[max(c) for c in cols],
  'mean':[mean(c) for c in cols],'std':[std(c) for c in cols]}
kinematic={}
for name,values in [('action',all_action),('observation.state',all_state)]:
 actual=actual_profile(values);claimed=global_stats[name]
 if claimed.get('count')!=[70915]:die('GLOBAL_KINEMATIC_COUNT')
 kinematic[name]={'actual':actual,'claimed':{m:claimed[m] for m in ['min','max','mean','std']},
  'minExact':actual['min']==[float(x) for x in claimed['min']],
  'maxExact':actual['max']==[float(x) for x in claimed['max']],
  'maximumMeanAbsoluteDifference':max(abs(actual['mean'][d]-float(claimed['mean'][d])) for d in range(7)),
  'maximumStdAbsoluteDifference':max(abs(actual['std'][d]-float(claimed['std'][d])) for d in range(7))}

scalar={}
for name in ['timestamp','frame_index','episode_index','index','task_index']:
 values=[float(row[name]) for row in rows];claimed=global_stats[name]
 if claimed.get('count')!=[70915]:die('GLOBAL_SCALAR_COUNT')
 scalar[name]={'actual':{'min':min(values),'max':max(values),'mean':mean(values),'std':std(values)},
  'claimed':{m:float(claimed[m][0]) for m in ['min','max','mean','std']}}
for name in features:
 if sorted(global_stats.get(name,{}))!=sorted(metrics):die('GLOBAL_STATS_KEYS')
 for metric in metrics:
  if not finite_nested(global_stats[name][metric]):die('GLOBAL_STATS_FINITE')
for name in ['observation.images.front','observation.images.top']:
 if global_stats[name]['count']!=[35000]:die('GLOBAL_IMAGE_STATS_COUNT')

video={}
for camera in ['observation.images.front','observation.images.top']:
 prefix='videos/'+camera+'/';duration_mismatch=[];nonzero_gaps=[];resets=[];previous=None
 for meta in episodes:
  file_index=meta[prefix+'file_index'];fr=float(meta[prefix+'from_timestamp']);to=float(meta[prefix+'to_timestamp'])
  if abs((to-fr)-meta['length']/30)>0.000000001:duration_mismatch.append(meta['episode_index'])
  if previous is not None:
   if previous[0]==file_index:
    gap=fr-previous[1]
    if abs(gap)>0.000000001:nonzero_gaps.append({'episodeIndex':meta['episode_index'],'seconds':gap})
   else:resets.append({'episodeIndex':meta['episode_index'],'fromFileIndex':previous[0],'toFileIndex':file_index,'fromTimestamp':fr})
  previous=(file_index,to)
 video[camera]={'logicalFileIndexRuns':runs(episodes,prefix+'file_index'),
  'durationMismatchEpisodeIndices':duration_mismatch,'durationMismatchEpisodes':len(duration_mismatch),
  'nonzeroSameFileGaps':nonzero_gaps,'logicalFileResets':resets}
if video['observation.images.front']['durationMismatchEpisodeIndices']!=[2,121,132,292,337] or video['observation.images.top']['durationMismatchEpisodeIndices']!=[2,121,132,292,337]:die('VIDEO_DRIFT_PROFILE')

outcome_tokens=['reward','done','success','failure','recovery','intervention','terminated','truncated']
semantic_names=data_columns+episode_columns+list(info['features'])
present=sorted({token for token in outcome_tokens if any(token in name.lower() for name in semantic_names)})
if present:die('OUTCOME_FIELDS_PRESENT')
histogram={str(key):hist[key] for key in sorted(hist)}
print(json.dumps({
 'info':{'codebaseVersion':'v3.0','robotType':'FR3WMS','episodes':350,'frames':70915,'tasks':1,'fps':30,
  'actionDimensions':7,'stateDimensions':7,'task':task,'features':features},
 'parquet':{'dataRows':70915,'dataColumns':7,'dataColumnNames':data_columns,'dataColumnTypes':data_types,
  'dataRowGroups':data_pf.metadata.num_row_groups,'dataCreatedBy':data_pf.metadata.created_by,
  'episodesRows':350,'episodesColumns':107,'episodesRowGroups':episodes_pf.metadata.num_row_groups,
  'episodesSchemaRoot':digest('fr3/episodes-schema/v1',[{'name':f.name,'type':str(f.type)} for f in episodes_table.schema]),
  'tasksRows':1,'tasksColumns':2,'tasksRowGroups':tasks_pf.metadata.num_row_groups,
  'dataSchemaRoot':digest('fr3/data-schema/v1',[{'name':f.name,'type':str(f.type)} for f in data_table.schema])},
 'episodeReplay':{'episodeIndicesContiguous':True,'globalIndicesContiguous':True,
  'frameIndicesResetAndContiguous':True,'timestampsMatchThirtyFps':True,
  'episodeLengths':{'minimum':min(lengths),'maximum':max(lengths),'distinctValues':len(hist),
   'repeatedValues':sum(1 for v in hist.values() if v>1),'singletonValues':sum(1 for v in hist.values() if v==1),
   'episodesWithRepeatedLength':sum(v for v in hist.values() if v>1),'histogram':hist,
   'histogramRoot':digest('fr3/episode-length-histogram/v1',histogram)},
  'canonicalTrajectoryDuplicateGroups':dupes,'canonicalTrajectoryDuplicateGroupCount':len(dupes),
  'canonicalTrajectorySetRoot':digest('fr3/trajectory-set/v1',trajectory)},
 'logicalFileIndexReplay':{'dataFileIndexRuns':runs(episodes,'data/file_index'),
  'episodeMetadataFileIndexRuns':runs(episodes,'meta/episodes/file_index'),
  'frontVideo':video['observation.images.front'],'topVideo':video['observation.images.top']},
 'statisticsReplay':{'globalStatsFeatures':features,'allGlobalStatsValuesFinite':True,
  'globalKinematic':kinematic,'globalScalar':scalar,
  'globalIndexAndEpisodeStatisticsDrift':{'claimedIndexMaximum':scalar['index']['claimed']['max'],
   'actualIndexMaximum':scalar['index']['actual']['max'],'claimedEpisodeIndexMaximum':scalar['episode_index']['claimed']['max'],
   'actualEpisodeIndexMaximum':scalar['episode_index']['actual']['max']},
  'episodeKinematicMinMaxExact':True,'maximumEpisodeMeanAbsoluteDifference':episode_stat_mean_diff,
  'maximumEpisodeStdAbsoluteDifference':episode_stat_std_diff,
  'episodeTimestampFrameTaskMinMaxExact':True,
  'episodeIndexStatsMismatchEpisodes':episode_scalar_minmax_mismatch['episode_index'],
  'globalIndexStatsMismatchEpisodes':episode_scalar_minmax_mismatch['index'],
  'episodeIndexOffsetCounts':{str(k):v for k,v in sorted(episode_scalar_offsets['episode_index'].items())},
  'globalIndexOffsetCounts':{str(k):v for k,v in sorted(episode_scalar_offsets['index'].items())},
  'maximumEpisodeScalarMeanAbsoluteDifference':episode_scalar_mean_diff,
  'maximumEpisodeScalarStdAbsoluteDifference':episode_scalar_std_diff,
  'imageStatsParsedButPixelsUnavailable':True,'publisherQuantilesParsedNotAlgorithmicallyRederived':True},
 'kinematicAdjacency':{'interpretation':'descriptive kinematic adjacency only; not execution-effect evidence',
  'sameFrameComparisons':same_count,'sameFrameMeanAbsoluteByDimension':[x/same_count for x in same_sum],
  'sameFrameMaximumAbsoluteByDimension':same_max,'sameFrameExactAllDimensions':same_exact,
  'sameFrameWithinOneEminus4AllDimensions':same_tol,
  'actionToNextStateComparisons':next_count,'actionToNextStateMeanAbsoluteByDimension':[x/next_count for x in next_sum],
  'actionToNextStateMaximumAbsoluteByDimension':next_max,'actionToNextStateExactAllDimensions':next_exact,
  'actionToNextStateWithinOneEminus4AllDimensions':next_tol,
  'stateActionContinuityEstablishesCausalActionEffect':False},
 'outcomeFields':present,
 'execution':{'parquetsDecodedAsInertDataOnly':True,'downloadedInstructionsExecuted':False,'downloadedCodeFiles':0}},
 sort_keys=True,separators=(',',':'),allow_nan=False))
`;

function findPython(options = {}) {
  const candidates = [options.pythonExecutable, process.env.OUTSIDER_FR3_RECOVERY_PYTHON,
    ".venv/bin/python", "/opt/anaconda3/bin/python",
    "/private/tmp/armbench-parquet-venv/bin/python"].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0] ?? "python3";
}
function replayParquets(root, options = {}) {
  const result = spawnSync(findPython(options), ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: options.replayTimeoutMs ?? 180_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", PYTHONWARNINGS: "ignore" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("PARQUET_REPLAY_FAILED", result.error?.message ?? result.stderr?.trim()
      ?? String(result.status));
  }
  const replay = parseJson(Buffer.from(result.stdout, "utf8"), "python-replay");
  if (replay.info?.episodes !== 350 || replay.info?.frames !== 70_915
    || replay.info?.task !== TASK || replay.info?.actionDimensions !== 7
    || replay.info?.stateDimensions !== 7 || replay.parquet?.episodesColumns !== 107
    || replay.episodeReplay?.episodeLengths?.minimum !== 156
    || replay.episodeReplay?.episodeLengths?.maximum !== 389
    || replay.episodeReplay?.episodeLengths?.distinctValues !== 108
    || replay.episodeReplay?.canonicalTrajectoryDuplicateGroupCount !== 0
    || replay.logicalFileIndexReplay?.dataFileIndexRuns?.length !== 12
    || replay.logicalFileIndexReplay?.episodeMetadataFileIndexRuns?.length !== 6
    || replay.logicalFileIndexReplay?.frontVideo?.durationMismatchEpisodes !== 5
    || replay.logicalFileIndexReplay?.topVideo?.durationMismatchEpisodes !== 5
    || replay.statisticsReplay?.globalIndexAndEpisodeStatisticsDrift?.claimedIndexMaximum !== 32_575
    || replay.statisticsReplay?.globalIndexAndEpisodeStatisticsDrift?.actualIndexMaximum !== 70_914
    || replay.statisticsReplay?.globalIndexAndEpisodeStatisticsDrift?.claimedEpisodeIndexMaximum !== 179
    || replay.statisticsReplay?.globalIndexAndEpisodeStatisticsDrift?.actualEpisodeIndexMaximum !== 349
    || replay.statisticsReplay?.episodeIndexStatsMismatchEpisodes !== 170
    || replay.statisticsReplay?.globalIndexStatsMismatchEpisodes !== 170
    || replay.kinematicAdjacency?.actionToNextStateComparisons !== 70_565
    || replay.outcomeFields?.length !== 0) fail("PARQUET_REPLAY_PROFILE_INVALID");
  return deepFreeze(replay);
}

function replayText(root) {
  const readme = strictUtf8(readRegular(root, "files/README.md", 10_000), "readme");
  const attributes = strictUtf8(readRegular(root, "files/.gitattributes", 10_000), "attributes");
  if (!readme.includes("This dataset was created using [LeRobot]")
    || !readme.includes("**License:** apache-2.0")
    || !readme.includes('"robot_type": "FR3WMS"')
    || !readme.includes('"total_episodes": 350')
    || !readme.includes('"total_frames": 70915')
    || !attributes.includes("*.parquet filter=lfs diff=lfs merge=lfs -text")
    || !attributes.includes("*.mp4 filter=lfs diff=lfs merge=lfs -text")) {
    fail("TEXT_PROFILE_INVALID");
  }
  const lower = readme.toLowerCase();
  return { genericLeRobotCard: true, cardAndReadmeLicenseClaim: FR3_RECOVERY_CARD_LICENSE,
    readmeRecoveryWordPresent: lower.includes("recovery"),
    readmeFailureWordPresent: lower.includes("failure"),
    readmeSuccessWordPresent: lower.includes("success"),
    repositoryLicenseFilePresent: false, sourceInstructionsExecuted: false };
}

export function replayFr3RecoverySemanticNoVideo(sourceDirectory, options = {}) {
  const root = path.resolve(sourceDirectory);
  return deepFreeze({ parquet: replayParquets(root, options), text: replayText(root) });
}

function headerRelative(specification) {
  return `metadata/object-response-headers/${specification.path}.headers.json`;
}
function expectedCorePaths() {
  return sorted(["metadata/dataset-record-before.json", "metadata/dataset-record-after.json",
    "metadata/full-tree-before.json", "metadata/full-tree-after.json",
    ...SELECTED.flatMap((item) => [`files/${item.path}`, headerRelative(item)])]);
}
function validateHeader(root, specification) {
  const relative = headerRelative(specification);
  const header = parseJson(readRegular(root, relative), `header:${specification.path}`);
  if (header.path !== specification.path || ![200, 302, 307].includes(header.status)
    || header.headers?.xRepoCommit !== FR3_RECOVERY_REVISION
    || header.headers?.xLinkedEtag !== `\"${specification.lfs?.oid ?? specification.oid}\"`
    || specification.lfs !== null && (header.headers.xLinkedSize !== String(specification.bytes)
      || header.headers.xXetHash !== specification.xetHash)) {
    fail("OBJECT_HEADER_INVALID", specification.path);
  }
}

function collectCoreSource(sourceDirectory, includeManifest, options = {}) {
  const root = path.resolve(sourceDirectory);
  const recordBefore = readRegular(root, "metadata/dataset-record-before.json");
  const recordAfter = readRegular(root, "metadata/dataset-record-after.json");
  const treeBefore = readRegular(root, "metadata/full-tree-before.json");
  const treeAfter = readRegular(root, "metadata/full-tree-after.json");
  if (!recordBefore.equals(recordAfter) || !treeBefore.equals(treeAfter)) {
    fail("ACQUISITION_BRACKET_CHANGED");
  }
  const metadata = inspectFr3RecoveryMetadata(recordBefore, treeBefore);
  const expected = expectedCorePaths(); if (includeManifest) expected.push("source-manifest.json");
  if (!same(walkPrivate(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  const entries = [];
  for (const relative of ["metadata/dataset-record-before.json",
    "metadata/dataset-record-after.json", "metadata/full-tree-before.json",
    "metadata/full-tree-after.json"]) {
    const measured = hashRegular(root, relative, MAX_METADATA_BYTES);
    entries.push({ path: relative, bytes: measured.bytes, sha256: measured.sha256 });
  }
  for (const specification of SELECTED) {
    validateHeader(root, specification); const headerPath = headerRelative(specification);
    const headerMeasured = hashRegular(root, headerPath, MAX_METADATA_BYTES);
    entries.push({ path: headerPath, bytes: headerMeasured.bytes,
      sha256: headerMeasured.sha256 });
    const relative = `files/${specification.path}`;
    const measured = hashRegular(root, relative, MAX_SELECTED_FILE_BYTES, specification.bytes);
    if (measured.sha256 !== specification.sha256
      || specification.lfs === null && measured.gitOid !== specification.oid) {
      fail("SELECTED_OBJECT_DIGEST_INVALID", specification.path);
    }
    entries.push({ path: relative, bytes: measured.bytes, sha256: measured.sha256,
      oid: specification.oid, lfs: specification.lfs, xetHash: specification.xetHash });
  }
  const parquet = replayParquets(root, options); const text = replayText(root);
  const descriptors = entries.sort((left, right) => left.path < right.path ? -1 : 1);
  return { root, metadata, entries: descriptors, parquet, text,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, descriptors) };
}

function manifestBody(source) {
  return { schema: SOURCE_SCHEMA, datasetId: FR3_RECOVERY_DATASET_ID,
    revision: FR3_RECOVERY_REVISION, fullTreeEntries: 20, fullTreeFiles: 10,
    fullTreeDirectories: 10, fullTreeBytes: FULL_TREE_BYTES,
    fixedTreeRoot: source.metadata.inventory.treeRoot,
    selectedSemanticNoVideoFiles: 7, selectedSemanticNoVideoBytes: SELECTED_BYTES,
    inventoryOnlyVideoFiles: 3, inventoryOnlyVideoBytes: VIDEO_BYTES,
    sourceObjects: source.entries,
    dataSchemaRoot: source.parquet.parquet.dataSchemaRoot,
    episodesSchemaRoot: source.parquet.parquet.episodesSchemaRoot,
    canonicalTrajectorySetRoot: source.parquet.episodeReplay.canonicalTrajectorySetRoot,
    sourceRoot: source.sourceRoot };
}

export function createFr3RecoverySourceManifestFromDirectory(sourceDirectory, options = {}) {
  const source = collectCoreSource(sourceDirectory, false, options); const body = manifestBody(source);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}
function collectCompleteSource(sourceDirectory, options = {}) {
  const source = collectCoreSource(sourceDirectory, true, options); const body = manifestBody(source);
  const manifest = deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
  const bytes = readRegular(source.root, "source-manifest.json");
  if (!serialize(manifest).equals(bytes)) fail("SOURCE_MANIFEST_MISMATCH");
  if (manifest.manifestHash !== EXPECTED_SOURCE_MANIFEST_HASH
    || manifest.sourceRoot !== EXPECTED_SOURCE_ROOT) fail("SOURCE_MANIFEST_PIN_INVALID");
  return { ...source, sourceManifest: manifest, sourceManifestBytes: bytes };
}

function reportBody(source) {
  const p = source.parquet;
  return { schema: FR3_RECOVERY_REPORT_SCHEMA, disposition: FR3_RECOVERY_DISPOSITION,
    source: { datasetId: FR3_RECOVERY_DATASET_ID, revision: FR3_RECOVERY_REVISION,
      public: true, gated: false, disabled: false,
      createdAt: source.metadata.record.createdAt, lastModified: source.metadata.record.lastModified,
      recordUsedStorageBytes: source.metadata.record.usedStorageBytes,
      recordUsedStorageDiffersFromFixedTreeBytes: true,
      cardLicenseClaim: source.metadata.record.cardLicenseClaim,
      recordBeforeAfterByteIdentical: true, treeBeforeAfterByteIdentical: true,
      fixedTreeEntries: 20, fixedTreeFiles: 10, fixedTreeDirectories: 10,
      fixedTreeBytes: FULL_TREE_BYTES, fixedTreeLfsFiles: 6, fixedTreeXetFiles: 6,
      fixedTreeRoot: source.metadata.inventory.treeRoot,
      completeFixedTreeInventoryRecorded: true,
      selectedSemanticNoVideoFiles: 7, selectedSemanticNoVideoBytes: SELECTED_BYTES,
      selectedSemanticNoVideoClosureComplete: true,
      inventoryOnlyVideos: source.metadata.inventory.videoInventory,
      inventoryOnlyVideoFiles: 3, inventoryOnlyVideoBytes: VIDEO_BYTES,
      videoPayloadsAcquired: 0, sourceManifestHash: source.sourceManifest.manifestHash,
      sourceManifestFileSha256: fr3RecoverySha256(source.sourceManifestBytes),
      sourceRoot: source.sourceManifest.sourceRoot,
      rawSourcePrivate: true, allSourceFilesMode: "0600", allSourceDirectoriesMode: "0700" },
    semanticNoVideoReplay: { info: p.info, parquet: p.parquet,
      episodeReplay: p.episodeReplay, logicalFileIndexReplay: p.logicalFileIndexReplay,
      statisticsReplay: p.statisticsReplay, kinematicAdjacency: p.kinematicAdjacency,
      allSevenSelectedObjectsReplayed: true, parquetsDecodedAsInertDataOnly: true,
      downloadedInstructionsExecuted: false, rawKinematicRowsProjectedIntoReport: false },
    sourceDiscrepancies: {
      physicalDataParquetFiles: 1,
      logicalDataFileIndicesReferenced: 5,
      logicalDataFileIndexRuns: p.logicalFileIndexReplay.dataFileIndexRuns.length,
      infoDataPathWouldReferenceAbsentPhysicalFiles: true,
      physicalEpisodeMetadataParquetFiles: 1,
      logicalEpisodeMetadataFileIndicesReferenced: 3,
      logicalEpisodeMetadataFileIndexRuns:
        p.logicalFileIndexReplay.episodeMetadataFileIndexRuns.length,
      mergedPhysicalParquetsRetainPreMergeLogicalFileIndices: true,
      globalStatsCountClaim: 70_915,
      globalStatsClaimedIndexMaximum:
        p.statisticsReplay.globalIndexAndEpisodeStatisticsDrift.claimedIndexMaximum,
      actualIndexMaximum:
        p.statisticsReplay.globalIndexAndEpisodeStatisticsDrift.actualIndexMaximum,
      globalStatsClaimedEpisodeIndexMaximum:
        p.statisticsReplay.globalIndexAndEpisodeStatisticsDrift.claimedEpisodeIndexMaximum,
      actualEpisodeIndexMaximum:
        p.statisticsReplay.globalIndexAndEpisodeStatisticsDrift.actualEpisodeIndexMaximum,
      globalStatsIndexAndEpisodeFieldsAreStaleOrIncoherent: true,
      episodeStatsEpisodeIndexMismatchEpisodes:
        p.statisticsReplay.episodeIndexStatsMismatchEpisodes,
      episodeStatsGlobalIndexMismatchEpisodes:
        p.statisticsReplay.globalIndexStatsMismatchEpisodes,
      episodeStatsRetainLocalPreMergeIndexOffsets: true,
      videoReferenceDurationMismatchEpisodes: 5,
      videoReferenceNonzeroSameFileGaps: 2,
      videoReferencesCouldNotBeContainerCrossCheckedWithoutPayloads: true,
      discrepanciesPreservedNotSilentlyRepaired: true },
    publisherNamingBoundary: {
      repositoryNameContainsRecovery: true,
      genericReadmeContainsRecovery: source.text.readmeRecoveryWordPresent,
      genericReadmeContainsFailure: source.text.readmeFailureWordPresent,
      genericReadmeContainsSuccess: source.text.readmeSuccessWordPresent,
      dataOrMetadataOutcomeFields: p.outcomeFields,
      publisherNamedTrajectoryEpisodes: 350,
      publisherRobotTypeClaim: "FR3WMS",
      sourceNativeOutcomeRows: 0, independentOutcomeRows: 0,
      sourceNativeRecoveryInterventionRows: 0, recoveryEffectRows: 0,
      attemptCensusRows: 0, physicalWitnessRows: 0, realWorldOutcomeRows: 0,
      repositoryNameDoesNotEstablishRecoverySemantics: true,
      kinematicAdjacencyDoesNotEstablishExecutionEffect: true },
    rightsPrivacyAndUse: { rights: {
      datasetCardLicenseClaim: FR3_RECOVERY_CARD_LICENSE,
      readmeLicenseClaim: source.text.cardAndReadmeLicenseClaim,
      repositoryLicenseFilePresent: false, legalConclusionEstablished: false,
      rightsDisposition: "FAIL_CLOSED", authorizedTrainingRows: 0 },
    privacy: { rawSourcePrivate: true, videoSourceCouldContainPeopleOrIdentifiers: true,
      videoPixelsAcquired: false, noPiiGuaranteed: false,
      rawTrajectoryRowsProjectedIntoReport: false,
      privateSourceFilesMode: "0600", privateSourceDirectoriesMode: "0700" },
    use: { quarantineEvaluationOnly: true, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0, authorityRows: 0,
      ceuRows: 0, autonomousActionAuthorized: false } },
    zeroClaimBoundary: { sourceNativeOutcomeRows: 0, independentOutcomeRows: 0,
      realWorldOutcomeRows: 0, physicalWitnessRows: 0, physicalEffectRows: 0,
      successRows: 0, failureOutcomeRows: 0, retryRows: 0,
      recoveryInterventionRows: 0, recoveryEffectRows: 0, attemptCensusRows: 0,
      causalRecoveryRows: 0, longitudinalRows: 0, delegationRows: 0,
      authorizedTrainingRows: 0, networkAdmissionRows: 0, actorCreditRows: 0,
      ceuRows: 0, authorityDelta: 0, autonomousActionAuthorized: false } };
}

export function buildFr3RecoveryReportFromSource(sourceDirectory, options = {}) {
  const source = collectCompleteSource(sourceDirectory, options); const body = reportBody(source);
  return deepFreeze({ ...body, artifactHash: digest(REPORT_DOMAIN, body) });
}
function reportErrors(report) {
  const errors = [];
  if (!exactObject(report) || report.schema !== FR3_RECOVERY_REPORT_SCHEMA) return ["SCHEMA_INVALID"];
  if (report.disposition !== FR3_RECOVERY_DISPOSITION
    || report.source?.selectedSemanticNoVideoFiles !== 7
    || report.source?.selectedSemanticNoVideoBytes !== 5_643_907
    || report.semanticNoVideoReplay?.info?.episodes !== 350
    || report.semanticNoVideoReplay?.info?.frames !== 70_915) errors.push("SOURCE_CENSUS_BOUNDARY");
  if (report.publisherNamingBoundary?.sourceNativeOutcomeRows !== 0
    || report.publisherNamingBoundary?.recoveryEffectRows !== 0
    || report.publisherNamingBoundary?.attemptCensusRows !== 0
    || report.publisherNamingBoundary?.physicalWitnessRows !== 0) errors.push("NAMING_BOUNDARY");
  if (report.sourceDiscrepancies?.actualIndexMaximum !== 70_914
    || report.sourceDiscrepancies?.globalStatsClaimedIndexMaximum !== 32_575
    || report.sourceDiscrepancies?.actualEpisodeIndexMaximum !== 349
    || report.sourceDiscrepancies?.globalStatsClaimedEpisodeIndexMaximum !== 179) {
    errors.push("SOURCE_DISCREPANCY_BOUNDARY");
  }
  const zero = report.zeroClaimBoundary;
  if (!exactObject(zero) || Object.entries(zero).some(([key, value]) =>
    key === "autonomousActionAuthorized" ? value !== false : value !== 0)) {
    errors.push("ZERO_CLAIM_BOUNDARY");
  }
  const rights = report.rightsPrivacyAndUse;
  if (rights?.rights?.rightsDisposition !== "FAIL_CLOSED"
    || rights.rights.authorizedTrainingRows !== 0
    || rights.privacy?.rawSourcePrivate !== true || rights.privacy?.noPiiGuaranteed !== false
    || rights.use?.networkAdmissionRows !== 0 || rights.use?.authorityRows !== 0) {
    errors.push("RIGHTS_PRIVACY_USE_BOUNDARY");
  }
  const { artifactHash: ignored, ...body } = report;
  if (!HASH.test(report.artifactHash ?? "")
    || report.artifactHash !== digest(REPORT_DOMAIN, body)) errors.push("ARTIFACT_HASH");
  return errors;
}
export function verifyFr3RecoveryReport(report) {
  const errors = reportErrors(report); return deepFreeze({ ok: errors.length === 0, errors });
}
export function createFr3RecoveryReceipt(report) {
  const checked = verifyFr3RecoveryReport(report);
  if (!checked.ok) fail("REPORT_INVALID", checked.errors.join(","));
  const body = { schema: FR3_RECOVERY_RECEIPT_SCHEMA, reportHash: report.artifactHash,
    sourceManifestHash: report.source.sourceManifestHash, sourceRoot: report.source.sourceRoot,
    disposition: FR3_RECOVERY_DISPOSITION, selectedSemanticNoVideoFiles: 7,
    selectedSemanticNoVideoBytes: SELECTED_BYTES, trajectoryEpisodes: 350,
    trajectoryFrames: 70_915, sourceNativeOutcomeRows: 0, independentOutcomeRows: 0,
    attemptCensusRows: 0, recoveryEffectRows: 0, physicalWitnessRows: 0,
    authorizedTrainingRows: 0, networkAdmissionRows: 0, authorityDelta: 0,
    receiptWrittenLast: true, noClobber: true };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}
export function verifyFr3RecoverySourceDirectory(sourceDirectory, options = {}) {
  try {
    const source = collectCompleteSource(sourceDirectory, options);
    return deepFreeze({ ok: true, sourceManifest: source.sourceManifest,
      verificationLevel: "FIXED_REPOSITORY_COMPLETE_SEMANTIC_NO_VIDEO_SOURCE_REDERIVED" });
  } catch (error) { return deepFreeze({ ok: false,
    error: error instanceof Error ? error.message : String(error) }); }
}
export function verifyFr3RecoveryArtifactDirectory(directory, options = {}) {
  try {
    const root = path.resolve(directory); const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readRegular(root, "report.json");
    const receiptBytes = readRegular(root, "run-receipt.json");
    const report = buildFr3RecoveryReportFromSource(checkedPath(root, "source"), options);
    if (!serialize(report).equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const receipt = createFr3RecoveryReceipt(report);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report, receipt,
      reportFileSha256: fr3RecoverySha256(reportBytes),
      receiptFileSha256: fr3RecoverySha256(receiptBytes),
      verificationLevel: "FIXED_REPOSITORY_COMPLETE_SEMANTIC_NO_VIDEO_SOURCE_REDERIVED" });
  } catch (error) { return deepFreeze({ ok: false,
    error: error instanceof Error ? error.message : String(error) }); }
}
export function serializeFr3RecoveryArtifact(value) { return serialize(value); }
