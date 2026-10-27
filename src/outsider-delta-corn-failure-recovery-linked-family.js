/*
 * Linked-family source replay for three ykorkmaz Delta corn task repositories.
 *
 * Repository names provide publisher family membership only.  Current episode
 * bytes contain kinematics, timing, indices, and video, but no outcome,
 * intervention, reward, done, or recovery-effect field.  No ordinal pairing or
 * chronology is inferred across repositories.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, existsSync, fstatSync, lstatSync, openSync,
  readFileSync, readSync, readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const DELTA_CORN_REPOSITORIES = Object.freeze([
  Object.freeze({ key: "failure_10_1",
    datasetId: "ykorkmaz/delta_put_corn_in_box_failure_10_1",
    revision: "985fbbd8a03937661073004a6f8a4dd67a4049f0",
    publisherFamily: "failure", publisherOrdinal: "10_1",
    fullTreeBytes: 282_552_837, selectedBytes: 74_291_082,
    noVideoBytes: 427_710, camHighBytes: 73_863_372, frames: 4_618 }),
  Object.freeze({ key: "failure_10_2",
    datasetId: "ykorkmaz/delta_put_corn_in_box_failure_10_2",
    revision: "4de9fe907d4541139622d1e400f5ffc29105fb78",
    publisherFamily: "failure", publisherOrdinal: "10_2",
    fullTreeBytes: 283_229_749, selectedBytes: 75_177_962,
    noVideoBytes: 410_424, camHighBytes: 74_767_538, frames: 4_619 }),
  Object.freeze({ key: "recovery_10_1",
    datasetId: "ykorkmaz/delta_put_corn_in_box_recovery_10_1",
    revision: "fabf0de281dd9f48effec75b79cc5bff43a6454b",
    publisherFamily: "recovery", publisherOrdinal: "10_1",
    fullTreeBytes: 407_667_150, selectedBytes: 106_686_392,
    noVideoBytes: 525_105, camHighBytes: 106_161_287, frames: 6_557 }),
]);

export const DELTA_CORN_CARD_LICENSE = "apache-2.0";
export const DELTA_CORN_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";
export const DELTA_CORN_REPORT_SCHEMA =
  "outsider/delta-corn-failure-recovery-linked-family/v1";
export const DELTA_CORN_RECEIPT_SCHEMA =
  "outsider/delta-corn-failure-recovery-linked-family-receipt/v1";
const SOURCE_SCHEMA = "outsider/delta-corn-failure-recovery-source/v1";
const TREE_ROOT_DOMAIN = "outsider/delta-corn-tree-root/v1";
const SOURCE_ROOT_DOMAIN = "outsider/delta-corn-source-root/v1";
const MANIFEST_DOMAIN = "outsider/delta-corn-source-manifest/v1";
const REPORT_DOMAIN = "outsider/delta-corn-report/v1";
const RECEIPT_DOMAIN = "outsider/delta-corn-receipt/v1";
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const MAX_SELECTED_FILE_BYTES = 20 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const TASK = "put the corn in the box";
const CAMERAS = Object.freeze([
  "observation.images.cam_high", "observation.images.cam_high_depth",
  "observation.images.cam_low", "observation.images.cam_low_depth",
  "observation.images.cam_right_wrist",
]);
const CAMERA_EXPECTATIONS = Object.freeze({
  failure_10_1: Object.freeze({
    "observation.images.cam_high": 73_863_372,
    "observation.images.cam_high_depth": 74_747_731,
    "observation.images.cam_low": 55_702_965,
    "observation.images.cam_low_depth": 27_280_691,
    "observation.images.cam_right_wrist": 50_530_368,
  }),
  failure_10_2: Object.freeze({
    "observation.images.cam_high": 74_767_538,
    "observation.images.cam_high_depth": 74_807_715,
    "observation.images.cam_low": 55_558_253,
    "observation.images.cam_low_depth": 27_032_193,
    "observation.images.cam_right_wrist": 50_653_626,
  }),
  recovery_10_1: Object.freeze({
    "observation.images.cam_high": 106_161_287,
    "observation.images.cam_high_depth": 108_435_693,
    "observation.images.cam_low": 80_364_078,
    "observation.images.cam_low_depth": 41_941_646,
    "observation.images.cam_right_wrist": 70_239_341,
  }),
});
const ACQUISITION_PINS = Object.freeze({
  failure_10_1: Object.freeze({
    record: "sha256:50dea45c12c0feb71e90afffae0a9056dfc42b0fba904948fe41fb01d521659c",
    tree: "sha256:3cdc27df826acfa1d8e206ee801177a93f6dcfdb98ef13fd79e5cab0468812d3" }),
  failure_10_2: Object.freeze({
    record: "sha256:5d6b70512b09fdc3e7854bc5a3bc4babe94159d3bca356cca74f0b2e5f4af30f",
    tree: "sha256:511d6a3f3cc65eb1b33c76daaf4367225f24acedff69cbe52c5443d4d5c36e7d" }),
  recovery_10_1: Object.freeze({
    record: "sha256:3013a8442e821ad6c4d99f6a8e38680ee71482f0feec828e60a29556d9c7611e",
    tree: "sha256:2f866fb5e25570a1f25220a6599bf59ee1cbfaab77d04001d3f4faeedd574781" }),
});
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:eaff8a678bb4560426f2c9da170654a972bd3c34ac1cb7f73456395dadce2a8b";
const EXPECTED_SOURCE_ROOT =
  "sha256:100494cfc0e80bfdacd660daf3f54629c0a5eee26830a827cecfbb12b8bfb233";

function fail(code, detail = null) {
  throw new Error(detail === null ? `DELTA_CORN_${code}` : `DELTA_CORN_${code}:${detail}`);
}

export function deltaCornSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return deltaCornSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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
function repository(key) {
  const found = DELTA_CORN_REPOSITORIES.find((item) => item.key === key);
  if (!found) fail("REPOSITORY_KEY_INVALID", key);
  return found;
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
    || exactBytes !== null && status.size !== BigInt(exactBytes)) fail("SOURCE_FILE_INVALID", relative);
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
    if (!status.isFile() || status.size !== BigInt(checked.bytes)) fail("SOURCE_FILE_CHANGED", relative);
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

function expectedPaths() {
  const paths = [".gitattributes", "README.md", "meta/episodes.jsonl",
    "meta/episodes_stats.jsonl", "meta/info.json", "meta/tasks.jsonl"];
  for (let episode = 0; episode < 10; episode += 1) {
    const suffix = String(episode).padStart(6, "0");
    paths.push(`data/chunk-000/episode_${suffix}.parquet`);
    for (const camera of CAMERAS) {
      paths.push(`videos/chunk-000/${camera}/episode_${suffix}.mp4`);
    }
  }
  return sorted(paths);
}

function inventoryProjection(treeBytes, key) {
  const repo = repository(key); const tree = parseJson(treeBytes, `tree:${key}`);
  if (!Array.isArray(tree) || tree.length !== 76) fail("TREE_ENTRIES_INVALID", key);
  const dirs = tree.filter((item) => item.type === "directory");
  const files = tree.filter((item) => item.type === "file");
  const expectedDirs = ["data", "data/chunk-000", "meta", "videos", "videos/chunk-000",
    ...CAMERAS.map((camera) => `videos/chunk-000/${camera}`)];
  if (dirs.length !== 10 || files.length !== 66
    || !same(sorted(dirs.map((item) => item.path)), sorted(expectedDirs))
    || !same(sorted(files.map((item) => item.path)), expectedPaths())
    || files.reduce((sum, item) => sum + item.size, 0) !== repo.fullTreeBytes) {
    fail("TREE_CENSUS_INVALID", key);
  }
  const cameraInventory = {};
  for (const camera of CAMERAS) {
    const prefix = `videos/chunk-000/${camera}/`;
    const rows = files.filter((item) => item.path.startsWith(prefix));
    if (rows.length !== 10 || rows.reduce((sum, item) => sum + item.size, 0)
      !== CAMERA_EXPECTATIONS[key][camera]
      || !same(sorted(rows.map((item) => item.path.slice(prefix.length))),
        Array.from({ length: 10 }, (_, index) =>
          `episode_${String(index).padStart(6, "0")}.mp4`))) {
      fail("CAMERA_INVENTORY_INVALID", `${key}:${camera}`);
    }
    cameraInventory[camera] = { files: 10,
      bytes: rows.reduce((sum, item) => sum + item.size, 0), terminal: true };
  }
  const lfs = files.filter((item) => item.lfs !== undefined);
  if (lfs.length !== 60 || lfs.some((item) => item.lfs.size !== item.size
    || !/^[a-f0-9]{64}$/u.test(item.lfs.oid)
    || !/^[a-f0-9]{64}$/u.test(item.xetHash ?? ""))) fail("TREE_LFS_INVALID", key);
  const selected = files.filter((item) => !item.path.startsWith("videos/")
    || item.path.startsWith("videos/chunk-000/observation.images.cam_high/"))
    .map((item) => ({ repositoryKey: key, path: item.path, bytes: item.size,
      oid: item.oid, lfs: item.lfs ?? null, xetHash: item.xetHash ?? null,
      sha256: item.lfs === undefined ? null : `sha256:${item.lfs.oid}` }));
  const noVideo = selected.filter((item) => !item.path.startsWith("videos/"));
  const camHigh = selected.filter((item) => item.path.startsWith("videos/"));
  if (selected.length !== 26 || noVideo.length !== 16 || camHigh.length !== 10
    || selected.reduce((sum, item) => sum + item.bytes, 0) !== repo.selectedBytes
    || noVideo.reduce((sum, item) => sum + item.bytes, 0) !== repo.noVideoBytes
    || camHigh.reduce((sum, item) => sum + item.bytes, 0) !== repo.camHighBytes) {
    fail("SELECTED_CLOSURE_INVALID", key);
  }
  const projection = tree.map((item) => ({ type: item.type, path: item.path,
    size: item.size, oid: item.oid, lfs: item.lfs ?? null, xetHash: item.xetHash ?? null }));
  return { entries: 76, files: 66, directories: 10, bytes: repo.fullTreeBytes,
    lfsFiles: 60, xetFiles: 60, cameraInventory, selected,
    selectedFiles: 26, selectedBytes: repo.selectedBytes, noVideoFiles: 16,
    noVideoBytes: repo.noVideoBytes, camHighFiles: 10, camHighBytes: repo.camHighBytes,
    treeRoot: digest(TREE_ROOT_DOMAIN, projection) };
}

export function inspectDeltaCornRepositoryMetadata(recordBytes, treeBytes, key) {
  const repo = repository(key); const record = parseJson(recordBytes, `record:${key}`);
  if (record.id !== repo.datasetId || record.sha !== repo.revision
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.cardData?.license !== DELTA_CORN_CARD_LICENSE
    || !Array.isArray(record.siblings) || record.siblings.length !== 66
    || !same(sorted(record.siblings.map((item) => item.rfilename)), expectedPaths())) {
    fail("RECORD_INVALID", key);
  }
  return deepFreeze({ record: { datasetId: repo.datasetId, revision: repo.revision,
    createdAt: record.createdAt, lastModified: record.lastModified,
    usedStorageBytes: record.usedStorage, downloadsAtAcquisition: record.downloads,
    public: true, gated: false, disabled: false,
    cardLicenseClaim: record.cardData.license },
  inventory: inventoryProjection(treeBytes, key) });
}

export function deltaCornSelectedSpecifications(treeBytes, key) {
  return inventoryProjection(treeBytes, key).selected.map((item) => ({ ...item,
    lfs: item.lfs === null ? null : { ...item.lfs } }));
}

function parseBoxes(bytes, start, end, context) {
  const boxes = []; let cursor = start;
  while (cursor < end) {
    if (end - cursor < 8) fail("MP4_BOX_HEADER_TRUNCATED", context);
    let size = bytes.readUInt32BE(cursor);
    const type = bytes.toString("ascii", cursor + 4, cursor + 8); let headerBytes = 8;
    if (!/^[\x20-\x7e]{4}$/u.test(type)) fail("MP4_BOX_TYPE_INVALID", context);
    if (size === 1) {
      if (end - cursor < 16) fail("MP4_LARGE_BOX_TRUNCATED", context);
      const large = bytes.readBigUInt64BE(cursor + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) fail("MP4_BOX_TOO_LARGE", context);
      size = Number(large); headerBytes = 16;
    } else if (size === 0) size = end - cursor;
    if (size < headerBytes || cursor + size > end) fail("MP4_BOX_SIZE_INVALID", context);
    boxes.push({ type, start: cursor, end: cursor + size,
      payloadStart: cursor + headerBytes, payloadEnd: cursor + size, size });
    cursor += size;
  }
  if (cursor !== end) fail("MP4_BOX_COVERAGE_INVALID", context);
  return boxes;
}
function children(bytes, box, context) {
  return parseBoxes(bytes, box.payloadStart, box.payloadEnd, context);
}
function exactlyOne(boxes, type, context) {
  const matches = boxes.filter((box) => box.type === type);
  if (matches.length !== 1) fail("MP4_BOX_CARDINALITY", `${context}:${type}`);
  return matches[0];
}
function unsigned64(bytes, offset) {
  const value = bytes.readBigUInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail("MP4_INTEGER_TOO_LARGE");
  return Number(value);
}
function mediaHeader(bytes, box, context) {
  const version = bytes[box.payloadStart];
  if (version === 0 && box.payloadEnd - box.payloadStart >= 24) return {
    timescale: bytes.readUInt32BE(box.payloadStart + 12),
    durationTicks: bytes.readUInt32BE(box.payloadStart + 16) };
  if (version === 1 && box.payloadEnd - box.payloadStart >= 36) return {
    timescale: bytes.readUInt32BE(box.payloadStart + 20),
    durationTicks: unsigned64(bytes, box.payloadStart + 24) };
  fail("MP4_MDHD_INVALID", context);
}
function sampleTiming(bytes, box, context) {
  const count = bytes.readUInt32BE(box.payloadStart + 4);
  if (box.payloadEnd - box.payloadStart !== 8 + count * 8) fail("MP4_STTS_SIZE", context);
  let samples = 0; let durationTicks = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = box.payloadStart + 8 + index * 8;
    const current = bytes.readUInt32BE(offset);
    samples += current; durationTicks += current * bytes.readUInt32BE(offset + 4);
  }
  return { entries: count, samples, durationTicks };
}

export function parseDeltaCornMp4(bytes, label = "mp4") {
  if (!Buffer.isBuffer(bytes) || bytes.length < 32) fail("MP4_BYTES_INVALID", label);
  const top = parseBoxes(bytes, 0, bytes.length, label);
  const ftyp = exactlyOne(top, "ftyp", label); const moov = exactlyOne(top, "moov", label);
  const mdats = top.filter((box) => box.type === "mdat");
  if (mdats.length < 1) fail("MP4_MDAT_MISSING", label);
  const tracks = [];
  for (const trak of children(bytes, moov, `${label}:moov`).filter((box) => box.type === "trak")) {
    const tc = children(bytes, trak, `${label}:trak`);
    const tkhd = exactlyOne(tc, "tkhd", label); const mdia = exactlyOne(tc, "mdia", label);
    const mc = children(bytes, mdia, `${label}:mdia`);
    const hdlr = exactlyOne(mc, "hdlr", label);
    const handler = bytes.toString("ascii", hdlr.payloadStart + 8, hdlr.payloadStart + 12);
    const header = mediaHeader(bytes, exactlyOne(mc, "mdhd", label), label);
    const minf = exactlyOne(mc, "minf", label);
    const stbl = exactlyOne(children(bytes, minf, `${label}:minf`), "stbl", label);
    const sc = children(bytes, stbl, `${label}:stbl`);
    const stsz = exactlyOne(sc, "stsz", label);
    const samples = bytes.readUInt32BE(stsz.payloadStart + 8);
    const timing = sampleTiming(bytes, exactlyOne(sc, "stts", label), label);
    if (samples !== timing.samples || header.durationTicks !== timing.durationTicks) {
      fail("MP4_TIMING_INVALID", label);
    }
    const stsd = exactlyOne(sc, "stsd", label); const entryStart = stsd.payloadStart + 8;
    const codec = bytes.toString("ascii", entryStart + 4, entryStart + 8);
    const width = bytes.readUInt16BE(entryStart + 32);
    const height = bytes.readUInt16BE(entryStart + 34);
    const tkhdWidth = bytes.readUInt32BE(tkhd.payloadEnd - 8) / 65_536;
    const tkhdHeight = bytes.readUInt32BE(tkhd.payloadEnd - 4) / 65_536;
    if (handler !== "vide" || width !== tkhdWidth || height !== tkhdHeight) {
      fail("MP4_VIDEO_PROFILE_INVALID", label);
    }
    tracks.push({ handler, codec, width, height, timescale: header.timescale,
      durationTicks: header.durationTicks,
      durationSeconds: header.durationTicks / header.timescale,
      samples, timingEntries: timing.entries });
  }
  if (tracks.length !== 1) fail("MP4_TRACK_CARDINALITY", label);
  return { bytes: bytes.length,
    majorBrand: bytes.toString("ascii", ftyp.payloadStart, ftyp.payloadStart + 4),
    topLevelBoxes: top.map((box) => ({ type: box.type, bytes: box.size })),
    mdatBytes: mdats.reduce((sum, box) => sum + box.size, 0), tracks,
    compressedPixelsDecoded: false, visualSemanticsReviewed: false };
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, pathlib, struct, sys
import pyarrow.parquet as pq

root=pathlib.Path(sys.argv[1])/'repositories'
repos=[('failure_10_1','failure','10_1',4618),('failure_10_2','failure','10_2',4619),('recovery_10_1','recovery','10_1',6557)]
task='put the corn in the box'
cameras=['observation.images.cam_high','observation.images.cam_high_depth','observation.images.cam_low','observation.images.cam_low_depth','observation.images.cam_right_wrist']
columns=['action','observation.state','timestamp','frame_index','episode_index','index','task_index']
types=['fixed_size_list<element: float>[14]','fixed_size_list<element: float>[14]','float','int64','int64','int64','int64']
joint_names=['left_joint_0','left_joint_1','left_joint_2','left_joint_3','left_joint_4','left_joint_5','left_joint_6','right_joint_0','right_joint_1','right_joint_2','right_joint_3','right_joint_4','right_joint_5','right_joint_6']
def die(code): raise RuntimeError('DELTA_CORN_PYTHON_'+code)
def canon(v): return json.dumps(v,ensure_ascii=False,sort_keys=True,separators=(',',':'),allow_nan=False)
def digest(domain,v): return 'sha256:'+hashlib.sha256((domain+'\0'+canon(v)).encode()).hexdigest()
def read_jsonl(p):
 text=p.read_text(encoding='utf-8')
 if not text.endswith('\n'): die('JSONL_NEWLINE')
 return [json.loads(line) for line in text[:-1].split('\n')]
def flat(v):
 while isinstance(v,list) and len(v)==1: v=v[0]
 return v
def vector(v,n,code):
 if not isinstance(v,list) or len(v)!=n or any(not math.isfinite(float(x)) for x in v): die(code)
 return [float(x) for x in v]
def trajectory_hash(rows):
 h=hashlib.sha256();h.update(b'delta/canonical-trajectory/v1\0')
 for row in rows:
  for name in ['action','observation.state']:
   for value in row[name]: h.update(struct.pack('>f',float(value)))
  h.update(struct.pack('>f',float(row['timestamp'])))
  for name in ['frame_index','episode_index','index','task_index']:
   h.update(struct.pack('>q',int(row[name])))
 return 'sha256:'+h.hexdigest()

outputs=[]; all_hashes=[]; schema_roots=[]
for key,family,ordinal,expected_frames in repos:
 base=root/key/'files'; info=json.loads((base/'meta/info.json').read_text(encoding='utf-8'))
 tasks=read_jsonl(base/'meta/tasks.jsonl'); episodes=read_jsonl(base/'meta/episodes.jsonl')
 stats_rows=read_jsonl(base/'meta/episodes_stats.jsonl')
 expected_features=['action','observation.state',*cameras,'timestamp','frame_index','episode_index','index','task_index']
 if (info.get('codebase_version')!='v2.1' or info.get('trossen_subversion')!='v1.0'
  or info.get('robot_type')!='trossen_ai_stationary' or info.get('total_episodes')!=10
  or info.get('total_frames')!=expected_frames or info.get('total_tasks')!=1
  or info.get('total_videos')!=50 or info.get('total_chunks')!=1
  or info.get('chunks_size')!=1000 or info.get('fps')!=30
  or info.get('splits')!={'train':'0:10'} or sorted(info.get('features',{}))!=sorted(expected_features)
  or tasks!=[{'task_index':0,'task':task}] or len(episodes)!=10 or len(stats_rows)!=10): die('METADATA_PROFILE_'+key)
 features=info['features']
 if (features['action'].get('dtype')!='float32' or features['action'].get('shape')!=[14]
  or features['action'].get('names')!=joint_names
  or features['observation.state'].get('dtype')!='float32'
  or features['observation.state'].get('shape')!=[14]
  or features['observation.state'].get('names')!=joint_names): die('KINEMATIC_FEATURE_'+key)
 for camera in cameras:
  feature=features[camera]; expected_shape=[480,640,1] if camera.endswith('_depth') else [480,640,3]
  vi=feature.get('info',{})
  if (feature.get('dtype')!='video' or feature.get('shape')!=expected_shape
   or vi.get('video.fps')!=30.0 or vi.get('video.height')!=480 or vi.get('video.width')!=640
   or vi.get('video.codec')!='av1' or vi.get('video.pix_fmt')!='yuv420p'
   or vi.get('has_audio') is not False): die('VIDEO_FEATURE_'+key)
 lengths=[]; trajectory=[]; visual=[]; global_cursor=0
 amin=[float('inf')]*14;amax=[float('-inf')]*14;smin=[float('inf')]*14;smax=[float('-inf')]*14
 action_delta=[0.0]*14;state_delta=[0.0]*14;as_gap=[0.0]*14;delta_count=0;gap_count=0
 for episode in range(10):
  meta=episodes[episode]; stats=stats_rows[episode]
  if (meta.get('episode_index')!=episode or meta.get('tasks')!=[task]
   or not isinstance(meta.get('length'),int) or meta['length']<1
   or stats.get('episode_index')!=episode or sorted(stats.get('stats',{}))!=sorted(expected_features)):
   die('EPISODE_METADATA_'+key)
  length=meta['length']; lengths.append(length); ss=stats['stats']
  for name in ['action','observation.state']:
   if (sorted(ss[name])!=['count','max','mean','min','std']
    or ss[name].get('count')!=[length]): die('STATS_KINEMATIC_'+key)
   for metric in ['min','max','mean','std']: vector(ss[name][metric],14,'STATS_VECTOR_'+key)
  for camera in cameras:
   camera_count=ss[camera].get('count')
   if (sorted(ss[camera])!=['count','max','mean','min','std']
    or not isinstance(camera_count,list) or len(camera_count)!=1
    or not isinstance(camera_count[0],int) or camera_count[0]<1 or camera_count[0]>length):
    die('STATS_VIDEO_'+key)
   for metric in ['min','max','mean','std']:
    values=ss[camera][metric]
    if not isinstance(values,list) or len(values)!=3: die('STATS_VIDEO_VECTOR_'+key)
    vals=[]
    for value in values:
     scalar=flat(value)
     if not isinstance(scalar,(int,float)) or not math.isfinite(float(scalar)): die('STATS_VIDEO_SCALAR_'+key)
     vals.append(float(scalar))
    if camera=='observation.images.cam_high' and metric in ['mean','std']:
     pass
  if len(set(ss[camera]['count'][0] for camera in cameras))!=1: die('STATS_VIDEO_COUNT_CROSSWALK_'+key)
  visual.append({'episodeIndex':episode,
    'sampledFramesPerCamera':ss['observation.images.cam_high']['count'][0],
    'camHighMean':[float(flat(x)) for x in ss['observation.images.cam_high']['mean']],
    'camHighStd':[float(flat(x)) for x in ss['observation.images.cam_high']['std']]})
  p=base/f'data/chunk-000/episode_{episode:06d}.parquet';pf=pq.ParquetFile(p);table=pf.read();rows=table.to_pylist()
  schema=[str(field.type) for field in table.schema]
  if (table.schema.names!=columns or schema!=types or pf.metadata.num_rows!=length
   or pf.metadata.num_row_groups!=1 or len(rows)!=length): die('PARQUET_PROFILE_'+key)
  schema_root=digest('delta/parquet-schema/v1',{'names':columns,'types':schema})
  schema_roots.append(schema_root)
  previous_action=None;previous_state=None
  for frame,row in enumerate(rows):
   action=vector(row['action'],14,'ACTION_'+key);state=vector(row['observation.state'],14,'STATE_'+key)
   if (not math.isfinite(float(row['timestamp'])) or abs(float(row['timestamp'])-frame/30)>0.00001
    or row['frame_index']!=frame or row['episode_index']!=episode
    or row['index']!=frame+(0 if episode==0 else 1) or row['task_index']!=0): die('ROW_CROSSWALK_'+key)
   for d in range(14):
    amin[d]=min(amin[d],action[d]);amax[d]=max(amax[d],action[d]);smin[d]=min(smin[d],state[d]);smax[d]=max(smax[d],state[d])
    as_gap[d]+=abs(action[d]-state[d])
    if previous_action is not None:
     action_delta[d]+=abs(action[d]-previous_action[d]);state_delta[d]+=abs(state[d]-previous_state[d])
   gap_count+=1
   if previous_action is not None: delta_count+=1
   previous_action=action;previous_state=state
  for name,actual in [('action',rows),('observation.state',rows)]:
   values=[[float(x) for x in row[name]] for row in actual]
   mins=[min(row[d] for row in values) for d in range(14)];maxs=[max(row[d] for row in values) for d in range(14)]
   if any(abs(mins[d]-float(ss[name]['min'][d]))>0.000001 or abs(maxs[d]-float(ss[name]['max'][d]))>0.000001 for d in range(14)):
    die('STATS_DATA_CROSSWALK_'+key)
  sem=trajectory_hash(rows); all_hashes.append((sem,key,episode));trajectory.append({'episodeIndex':episode,'rows':length,'canonicalTrajectoryHash':sem,'indexFirst':rows[0]['index'],'indexLast':rows[-1]['index'],'indexOffsetFromFrame':rows[0]['index'],'timestampFirst':float(rows[0]['timestamp']),'timestampLast':float(rows[-1]['timestamp'])})
  global_cursor+=length
 if sum(lengths)!=expected_frames or global_cursor!=expected_frames: die('FRAME_TOTAL_'+key)
 visual_root=digest('delta/cam-high-publisher-stats/v1',visual)
 outputs.append({'repositoryKey':key,'publisherFamily':family,'publisherOrdinal':ordinal,
  'episodes':10,'frames':expected_frames,'episodeLengths':lengths,'minimumEpisodeLength':min(lengths),
  'maximumEpisodeLength':max(lengths),'meanEpisodeLength':sum(lengths)/10,
  'task':task,'robotType':info['robot_type'],'fps':30,'actionDimensions':14,'stateDimensions':14,
  'parquetColumns':columns,'parquetSchemaRoot':schema_root,'allValuesFinite':True,
  'frameIndicesContiguous':True,'indexContiguousWithinEpisodes':True,
  'indexResetsAcrossEpisodes':True,'indexOffsetPattern':[0,1,1,1,1,1,1,1,1,1],
  'globalIndicesContiguous':False,'timestampsMatchThirtyFps':True,
  'trajectoryRows':trajectory,'canonicalTrajectorySetRoot':digest('delta/trajectory-set/v1',trajectory),
  'kinematicMorphology':{'actionMinimumByDimension':amin,'actionMaximumByDimension':amax,
   'stateMinimumByDimension':smin,'stateMaximumByDimension':smax,
   'meanAbsoluteActionDeltaByDimension':[x/delta_count for x in action_delta],
   'meanAbsoluteStateDeltaByDimension':[x/delta_count for x in state_delta],
   'meanAbsoluteActionStateGapByDimension':[x/gap_count for x in as_gap]},
  'visualMorphology':{'source':'publisher episodes_stats sampled aggregates','perEpisodeCamHigh':visual,
   'visualMorphologyRoot':visual_root,'rawPixelsProjected':False},
  'metadataStatsRows':10,'allMetadataStatsFieldsParsed':True,'kinematicMinMaxRecomputed':True,
  'outcomeRewardDoneInterventionColumns':[]})
if len(set(schema_roots))!=1: die('CROSS_SCHEMA')
groups=collections.defaultdict(list)
for sem,key,episode in all_hashes:groups[sem].append({'repositoryKey':key,'episodeIndex':episode})
dupes=[{'canonicalTrajectoryHash':sem,'members':members} for sem,members in sorted(groups.items()) if len(members)>1]
same_ordinal=sum(1 for episode in range(10) if len(set(next(x[0] for x in all_hashes if x[1]==key and x[2]==episode) for key,_,_,_ in repos))<3)
print(json.dumps({'repositories':outputs,'crossRepository':{
 'taskStringsExactAcrossRepositories':True,'robotAndSchemaExactAcrossRepositories':True,
 'parquetSchemaRoot':schema_roots[0],'canonicalTrajectoryDuplicateGroups':dupes,
 'crossRepositoryExactCanonicalTrajectoryPairs':sum(len(x['members'])*(len(x['members'])-1)//2 for x in dupes),
 'sameOrdinalCanonicalMatches':same_ordinal,'episodeOrdinalEstablishesPairing':False,
 'episodeOrdinalEstablishesChronology':False},
 'execution':{'parquetDecodedAsInertDataOnly':True,'downloadedInstructionsExecuted':False}},
 sort_keys=True,separators=(',',':'),allow_nan=False))
`;

function findPython(options = {}) {
  const candidates = [options.pythonExecutable, process.env.OUTSIDER_DELTA_CORN_PYTHON,
    "/private/tmp/armbench-parquet-venv/bin/python", ".venv/bin/python",
    "/opt/anaconda3/bin/python"].filter(Boolean);
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
  const rows = replay.repositories;
  if (!Array.isArray(rows) || rows.length !== 3
    || !same(rows.map((item) => item.frames), [4_618, 4_619, 6_557])
    || rows.some((item) => item.episodes !== 10 || item.task !== TASK
      || item.actionDimensions !== 14 || item.stateDimensions !== 14
      || item.outcomeRewardDoneInterventionColumns.length !== 0)
    || replay.crossRepository?.taskStringsExactAcrossRepositories !== true
    || replay.crossRepository?.robotAndSchemaExactAcrossRepositories !== true
    || replay.crossRepository?.crossRepositoryExactCanonicalTrajectoryPairs !== 0
    || replay.crossRepository?.sameOrdinalCanonicalMatches !== 0) {
    fail("PARQUET_REPLAY_PROFILE_INVALID");
  }
  return deepFreeze(replay);
}

function replayVideos(root, parquetReplay) {
  const repositories = [];
  for (const repo of DELTA_CORN_REPOSITORIES) {
    const rows = []; const lengths = parquetReplay.repositories
      .find((item) => item.repositoryKey === repo.key).episodeLengths;
    for (let episode = 0; episode < 10; episode += 1) {
      const relative = `repositories/${repo.key}/files/videos/chunk-000/observation.images.cam_high/episode_${String(episode).padStart(6, "0")}.mp4`;
      const bytes = readRegular(root, relative, MAX_SELECTED_FILE_BYTES);
      const parsed = parseDeltaCornMp4(bytes, `${repo.key}:${episode}`);
      const track = parsed.tracks[0];
      if (track.codec !== "av01" || track.width !== 640 || track.height !== 480
        || track.samples !== lengths[episode]
        || Math.abs(track.durationSeconds - lengths[episode] / 30) > 0.000_001) {
        fail("VIDEO_PARQUET_CROSSWALK", `${repo.key}:${episode}`);
      }
      rows.push({ episodeIndex: episode, frames: lengths[episode], bytes: bytes.length,
        encodedBytesPerFrame: bytes.length / lengths[episode], majorBrand: parsed.majorBrand,
        topLevelBoxes: parsed.topLevelBoxes.map((item) => item.type),
        mdatBytes: parsed.mdatBytes, codec: track.codec, width: track.width,
        height: track.height, samples: track.samples, timescale: track.timescale,
        durationTicks: track.durationTicks, durationSeconds: track.durationSeconds,
        timingEntries: track.timingEntries });
    }
    repositories.push({ repositoryKey: repo.key, videos: 10,
      videoBytes: rows.reduce((sum, item) => sum + item.bytes, 0),
      minimumVideoBytes: Math.min(...rows.map((item) => item.bytes)),
      maximumVideoBytes: Math.max(...rows.map((item) => item.bytes)),
      totalSamples: rows.reduce((sum, item) => sum + item.samples, 0),
      weightedEncodedBytesPerFrame: rows.reduce((sum, item) => sum + item.bytes, 0)
        / rows.reduce((sum, item) => sum + item.samples, 0),
      containerProfileRoot: digest("outsider/delta-corn-container-profile/v1", rows),
      episodes: rows });
  }
  if (repositories.reduce((sum, item) => sum + item.videoBytes, 0) !== 254_792_197
    || repositories.some((item, index) => item.videoBytes
      !== DELTA_CORN_REPOSITORIES[index].camHighBytes
      || item.totalSamples !== DELTA_CORN_REPOSITORIES[index].frames)) {
    fail("VIDEO_CENSUS_INVALID");
  }
  return deepFreeze({ repositories, selectedCamHighVideos: 30,
    selectedCamHighBytes: 254_792_197, everyVideoSampleCountMatchesParquetRows: true,
    allContainersStructurallyParsed: true, compressedPixelsDecoded: false,
    visualSemanticsIndependentlyReviewed: false });
}

function expectedCorePaths(profiles) {
  const paths = [];
  for (const profile of profiles) {
    const prefix = `repositories/${profile.repo.key}`;
    paths.push(`${prefix}/metadata/record-before.json`, `${prefix}/metadata/record-after.json`,
      `${prefix}/metadata/tree-before.json`, `${prefix}/metadata/tree-after.json`);
    for (const specification of profile.specifications) {
      paths.push(`${prefix}/files/${specification.path}`,
        `${prefix}/metadata/object-response-headers/${specification.path}.headers.json`);
    }
  }
  return sorted(paths);
}

function validateHeader(root, repo, specification) {
  const relative = `repositories/${repo.key}/metadata/object-response-headers/${specification.path}.headers.json`;
  const header = parseJson(readRegular(root, relative), `header:${repo.key}:${specification.path}`);
  if (header.repositoryKey !== repo.key || header.path !== specification.path
    || ![200, 302, 307].includes(header.status)
    || header.headers?.xRepoCommit !== repo.revision
    || header.headers?.xLinkedEtag !== `\"${specification.lfs?.oid ?? specification.oid}\"`
    || specification.lfs !== null && (header.headers.xLinkedSize !== String(specification.bytes)
      || header.headers.xXetHash !== specification.xetHash)) {
    fail("OBJECT_HEADER_INVALID", `${repo.key}:${specification.path}`);
  }
  return header;
}

function replayText(root, repo) {
  const prefix = `repositories/${repo.key}/files`;
  const readme = strictUtf8(readRegular(root, `${prefix}/README.md`, 20_000), `readme:${repo.key}`);
  const attributes = strictUtf8(readRegular(root, `${prefix}/.gitattributes`, 10_000),
    `attributes:${repo.key}`);
  if (!readme.includes("This dataset was created using [LeRobot]")
    || !readme.includes('"robot_type": "trossen_ai_stationary"')
    || !readme.includes('"total_episodes": 10')
    || !attributes.includes("*.parquet filter=lfs diff=lfs merge=lfs -text")
    || !attributes.includes("*.mp4 filter=lfs diff=lfs merge=lfs -text")) {
    fail("TEXT_PROFILE_INVALID", repo.key);
  }
  const lower = readme.toLowerCase();
  return { repositoryKey: repo.key, genericLeRobotCard: true,
    readmeFailureWordPresent: lower.includes("failure"),
    readmeRecoveryWordPresent: lower.includes("recovery"),
    readmeSuccessWordPresent: lower.includes("success"),
    repositoryLicenseFilePresent: false, cardLicenseClaim: DELTA_CORN_CARD_LICENSE,
    downloadedCodeFiles: 0, sourceInstructionsExecuted: false };
}

function collectCoreSource(sourceDirectory, includeManifest, options = {}) {
  const root = path.resolve(sourceDirectory); const profiles = [];
  for (const repo of DELTA_CORN_REPOSITORIES) {
    const prefix = `repositories/${repo.key}/metadata`;
    const recordBefore = readRegular(root, `${prefix}/record-before.json`);
    const recordAfter = readRegular(root, `${prefix}/record-after.json`);
    const treeBefore = readRegular(root, `${prefix}/tree-before.json`);
    const treeAfter = readRegular(root, `${prefix}/tree-after.json`);
    if (!recordBefore.equals(recordAfter) || !treeBefore.equals(treeAfter)) {
      fail("ACQUISITION_BRACKET_CHANGED", repo.key);
    }
    if (deltaCornSha256(recordBefore) !== ACQUISITION_PINS[repo.key].record
      || deltaCornSha256(treeBefore) !== ACQUISITION_PINS[repo.key].tree) {
      fail("ACQUISITION_PIN_INVALID", repo.key);
    }
    const metadata = inspectDeltaCornRepositoryMetadata(recordBefore, treeBefore, repo.key);
    profiles.push({ repo, recordBefore, treeBefore, metadata,
      specifications: deltaCornSelectedSpecifications(treeBefore, repo.key) });
  }
  const expected = expectedCorePaths(profiles);
  if (includeManifest) expected.push("source-manifest.json");
  if (!same(walkPrivate(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  const entries = []; const text = [];
  for (const profile of profiles) {
    const prefix = `repositories/${profile.repo.key}`;
    for (const name of ["record-before.json", "record-after.json", "tree-before.json",
      "tree-after.json"]) {
      const relative = `${prefix}/metadata/${name}`;
      const measured = hashRegular(root, relative, MAX_METADATA_BYTES);
      entries.push({ path: relative, bytes: measured.bytes, sha256: measured.sha256 });
    }
    for (const specification of profile.specifications) {
      const headerRelative = `${prefix}/metadata/object-response-headers/${specification.path}.headers.json`;
      validateHeader(root, profile.repo, specification);
      const headerMeasured = hashRegular(root, headerRelative, MAX_METADATA_BYTES);
      entries.push({ path: headerRelative, bytes: headerMeasured.bytes,
        sha256: headerMeasured.sha256 });
      const relative = `${prefix}/files/${specification.path}`;
      const measured = hashRegular(root, relative, MAX_SELECTED_FILE_BYTES, specification.bytes);
      if (specification.lfs === null && measured.gitOid !== specification.oid
        || specification.lfs !== null && measured.sha256 !== specification.sha256) {
        fail("SELECTED_OBJECT_DIGEST_INVALID", `${profile.repo.key}:${specification.path}`);
      }
      entries.push({ path: relative, bytes: measured.bytes, sha256: measured.sha256,
        oid: specification.oid, lfs: specification.lfs, xetHash: specification.xetHash });
    }
    text.push(replayText(root, profile.repo));
  }
  const parquet = replayParquets(root, options); const videos = replayVideos(root, parquet);
  const dataIdentities = new Map(); const videoIdentities = new Map();
  for (const profile of profiles) {
    for (const specification of profile.specifications.filter((item) =>
      item.path.startsWith("data/") || item.path.startsWith("videos/"))) {
      const target = specification.path.startsWith("data/") ? dataIdentities : videoIdentities;
      const identity = specification.lfs.oid;
      if (!target.has(identity)) target.set(identity, []);
      target.get(identity).push({ repositoryKey: profile.repo.key, path: specification.path });
    }
  }
  const crossIdentity = { exactDataPayloadDuplicateGroups: [...dataIdentities.entries()]
    .filter(([, rows]) => new Set(rows.map((item) => item.repositoryKey)).size > 1).length,
  exactCamHighPayloadDuplicateGroups: [...videoIdentities.entries()]
    .filter(([, rows]) => new Set(rows.map((item) => item.repositoryKey)).size > 1).length };
  if (crossIdentity.exactDataPayloadDuplicateGroups !== 0
    || crossIdentity.exactCamHighPayloadDuplicateGroups !== 0) fail("CROSS_REPOSITORY_IDENTITY_CHANGED");
  const descriptors = entries.sort((left, right) => left.path < right.path ? -1 : 1);
  return { root, profiles, entries: descriptors, text, parquet, videos, crossIdentity,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, descriptors) };
}

function manifestBody(source) {
  return { schema: SOURCE_SCHEMA,
    repositories: source.profiles.map((profile) => ({ key: profile.repo.key,
      datasetId: profile.repo.datasetId, revision: profile.repo.revision,
      fullTreeEntries: 76, fullTreeFiles: 66, fullTreeDirectories: 10,
      fullTreeBytes: profile.repo.fullTreeBytes,
      fixedTreeRoot: profile.metadata.inventory.treeRoot,
      selectedFiles: 26, selectedBytes: profile.repo.selectedBytes,
      noVideoFiles: 16, noVideoBytes: profile.repo.noVideoBytes,
      camHighFiles: 10, camHighBytes: profile.repo.camHighBytes,
      recordBeforeAfterExact: true, treeBeforeAfterExact: true })),
    selectedRepositoryFiles: 78, selectedRepositoryBytes: 256_155_436,
    selectedNoVideoFiles: 48, selectedNoVideoBytes: 1_363_239,
    selectedCamHighFiles: 30, selectedCamHighBytes: 254_792_197,
    sourceObjects: source.entries, parquetSchemaRoot:
      source.parquet.crossRepository.parquetSchemaRoot,
    trajectorySetRoots: source.parquet.repositories.map((item) => ({
      repositoryKey: item.repositoryKey, root: item.canonicalTrajectorySetRoot })),
    containerProfileRoots: source.videos.repositories.map((item) => ({
      repositoryKey: item.repositoryKey, root: item.containerProfileRoot })),
    sourceRoot: source.sourceRoot };
}

export function createDeltaCornSourceManifestFromDirectory(sourceDirectory, options = {}) {
  const source = collectCoreSource(sourceDirectory, false, options); const body = manifestBody(source);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

function collectCompleteSource(sourceDirectory, options = {}) {
  const source = collectCoreSource(sourceDirectory, true, options); const body = manifestBody(source);
  const sourceManifest = deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
  const bytes = readRegular(source.root, "source-manifest.json");
  if (!serialize(sourceManifest).equals(bytes)) fail("SOURCE_MANIFEST_MISMATCH");
  if (sourceManifest.manifestHash !== EXPECTED_SOURCE_MANIFEST_HASH
    || sourceManifest.sourceRoot !== EXPECTED_SOURCE_ROOT) {
    fail("SOURCE_MANIFEST_PIN_INVALID");
  }
  return { ...source, sourceManifest, sourceManifestBytes: bytes };
}

function reportBody(source) {
  const typed = source.parquet.repositories.map((item) => ({
    repositoryKey: item.repositoryKey, publisherFamily: item.publisherFamily,
    publisherOrdinal: item.publisherOrdinal, sourceNativeEpisodes: item.episodes,
    sourceNativeFrames: item.frames, task: item.task }));
  return { schema: DELTA_CORN_REPORT_SCHEMA, disposition: DELTA_CORN_DISPOSITION,
    source: { repositories: source.profiles.map((profile) => ({
      repositoryKey: profile.repo.key, datasetId: profile.repo.datasetId,
      revision: profile.repo.revision, public: true, gated: false, disabled: false,
      createdAt: profile.metadata.record.createdAt,
      lastModified: profile.metadata.record.lastModified,
      recordUsedStorageBytes: profile.metadata.record.usedStorageBytes,
      recordBeforeAfterByteIdentical: true, treeBeforeAfterByteIdentical: true,
      fullTreeEntries: 76, fullTreeFiles: 66, fullTreeDirectories: 10,
      fullTreeBytes: profile.repo.fullTreeBytes,
      fullTreeLfsFiles: 60, fullTreeXetFiles: 60,
      fullTreeRoot: profile.metadata.inventory.treeRoot,
      completeFiveCameraInventory: profile.metadata.inventory.cameraInventory,
      allFiveCameraInventoriesTerminal: true,
      selectedFiles: 26, selectedBytes: profile.repo.selectedBytes,
      selectedNoVideoFiles: 16, selectedNoVideoBytes: profile.repo.noVideoBytes,
      selectedCamHighFiles: 10, selectedCamHighBytes: profile.repo.camHighBytes })),
      selectedRepositoryFiles: 78, selectedRepositoryBytes: 256_155_436,
      selectedNoVideoFiles: 48, selectedNoVideoBytes: 1_363_239,
      selectedCamHighFiles: 30, selectedCamHighBytes: 254_792_197,
      sourceManifestHash: source.sourceManifest.manifestHash,
      sourceManifestFileSha256: deltaCornSha256(source.sourceManifestBytes),
      sourceRoot: source.sourceManifest.sourceRoot,
      rawSourcePrivate: true, allSourceFilesMode: "0600", allSourceDirectoriesMode: "0700" },
    sourceNativeCensus: { sourceNativeEpisodeFiles: 30,
      sourceNativeFrameRows: 15_794, typedPublisherPopulations: typed,
      publisherFailureNamedRepositories: 2, publisherRecoveryNamedRepositories: 1,
      typedPopulationsAreNonAdditiveForOutcomeOrRecoveryComparison: true,
      crossTotal: null, sameTaskStringAcrossRepositories: true,
      task: TASK, robotType: "trossen_ai_stationary", fps: 30,
      actionDimensions: 14, stateDimensions: 14 },
    parquetAndMetadataReplay: { repositories: source.parquet.repositories,
      crossRepository: source.parquet.crossRepository,
      allThirtyDataParquetsDecoded: true, allThirtyEpisodeMetadataRowsDecoded: true,
      allThirtyEpisodeStatsRowsDecoded: true, metadataInfoAndTaskFilesDecoded: true,
      parquetDecodedAsInertDataOnly: true, downloadedInstructionsExecuted: false },
    videoContainerReplay: source.videos,
    publisherFamilyBoundary: {
      repositoryNameIsOnlyFailureRecoveryMembershipEvidence: true,
      genericReadmesContainFailureWord: source.text.some((item) => item.readmeFailureWordPresent),
      genericReadmesContainRecoveryWord: source.text.some((item) => item.readmeRecoveryWordPresent),
      genericReadmesContainSuccessWord: source.text.some((item) => item.readmeSuccessWordPresent),
      dataOutcomeRewardDoneInterventionFields: 0,
      metadataOutcomeRewardDoneInterventionFields: 0,
      publisherFamilyMembershipRows: 30,
      sourceNativeOutcomeRows: 0, independentOutcomeRows: 0,
      recoveryInterventionRows: 0, recoveryEffectRows: 0,
      physicalEffectRows: 0, realWorldOutcomeRows: 0,
      failureNamedDoesNotEstablishFailureOutcome: true,
      recoveryNamedDoesNotEstablishRecoveryInterventionOrEffect: true },
    crossRepositoryIdentityAndPairing: {
      taskAndRobotSchemaLineageShared: true,
      exactDataPayloadDuplicateGroups: source.crossIdentity.exactDataPayloadDuplicateGroups,
      exactCamHighPayloadDuplicateGroups: source.crossIdentity.exactCamHighPayloadDuplicateGroups,
      exactCanonicalTrajectoryPairs:
        source.parquet.crossRepository.crossRepositoryExactCanonicalTrajectoryPairs,
      sameOrdinalCanonicalMatches:
        source.parquet.crossRepository.sameOrdinalCanonicalMatches,
      sourceIdentityProvenEpisodePairs: 0,
      episodeOrdinalPairingAuthorized: false,
      crossRepositoryChronologyEstablished: false,
      pairedFailureRecoveryComparisons: 0,
      causalRecoveryComparisons: 0 },
    morphology: { kinematic: source.parquet.repositories.map((item) => ({
      repositoryKey: item.repositoryKey, episodeLengths: item.episodeLengths,
      minimumEpisodeLength: item.minimumEpisodeLength,
      maximumEpisodeLength: item.maximumEpisodeLength,
      meanEpisodeLength: item.meanEpisodeLength,
      ...item.kinematicMorphology })),
    visual: source.parquet.repositories.map((item) => ({ repositoryKey: item.repositoryKey,
      ...item.visualMorphology,
      container: source.videos.repositories.find((video) =>
        video.repositoryKey === item.repositoryKey) })),
    publisherStatsAreIndependentVisualMeasurements: false,
    compressedPixelsDecoded: false, visualSemanticsIndependentlyReviewed: false },
    rightsPrivacyAndUse: { rights: {
      datasetCardLicenseClaims: source.text.map((item) => ({
        repositoryKey: item.repositoryKey, claim: item.cardLicenseClaim })),
      allCardClaimsApache20: true, repositoryLicenseFilesPresent: 0,
      legalConclusionEstablished: false, rightsDisposition: "FAIL_CLOSED",
      authorizedTrainingRows: 0 },
    privacy: { rawVisualAndTrajectorySourcePrivate: true, noPiiGuaranteed: false,
      rawFramesOrKinematicRowsProjectedIntoReport: false,
      privateSourceFilesMode: "0600", privateSourceDirectoriesMode: "0700" },
    use: { quarantineEvaluationOnly: true, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0, authorityRows: 0,
      ceuRows: 0, autonomousActionAuthorized: false } },
    zeroClaimBoundary: { sourceNativeOutcomeRows: 0, independentOutcomeRows: 0,
      realWorldOutcomeRows: 0, physicalEffectRows: 0, successRows: 0,
      failureOutcomeRows: 0, retryRows: 0, recoveryInterventionRows: 0,
      recoveryEffectRows: 0, pairedFailureRecoveryRows: 0, causalRecoveryRows: 0,
      longitudinalRows: 0, delegationRows: 0, authorizedTrainingRows: 0,
      networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
      authorityDelta: 0, autonomousActionAuthorized: false } };
}

export function buildDeltaCornReportFromSource(sourceDirectory, options = {}) {
  const source = collectCompleteSource(sourceDirectory, options); const body = reportBody(source);
  return deepFreeze({ ...body, artifactHash: digest(REPORT_DOMAIN, body) });
}

function reportErrors(report) {
  const errors = [];
  if (!exactObject(report) || report.schema !== DELTA_CORN_REPORT_SCHEMA) return ["SCHEMA_INVALID"];
  if (report.disposition !== DELTA_CORN_DISPOSITION
    || report.source?.selectedRepositoryFiles !== 78
    || report.source?.selectedRepositoryBytes !== 256_155_436
    || report.sourceNativeCensus?.sourceNativeEpisodeFiles !== 30
    || report.sourceNativeCensus?.sourceNativeFrameRows !== 15_794
    || report.sourceNativeCensus?.crossTotal !== null) errors.push("SOURCE_CENSUS_BOUNDARY");
  if (report.publisherFamilyBoundary?.sourceNativeOutcomeRows !== 0
    || report.publisherFamilyBoundary?.recoveryEffectRows !== 0
    || report.crossRepositoryIdentityAndPairing?.sourceIdentityProvenEpisodePairs !== 0
    || report.crossRepositoryIdentityAndPairing?.episodeOrdinalPairingAuthorized !== false) {
    errors.push("FAMILY_PAIRING_BOUNDARY");
  }
  const zero = report.zeroClaimBoundary;
  if (!exactObject(zero) || Object.entries(zero).some(([key, value]) =>
    key === "autonomousActionAuthorized" ? value !== false : value !== 0)) {
    errors.push("ZERO_CLAIM_BOUNDARY");
  }
  const rights = report.rightsPrivacyAndUse;
  if (rights?.rights?.rightsDisposition !== "FAIL_CLOSED"
    || rights.rights.authorizedTrainingRows !== 0
    || rights.privacy?.rawVisualAndTrajectorySourcePrivate !== true
    || rights.privacy?.noPiiGuaranteed !== false
    || rights.use?.networkAdmissionRows !== 0 || rights.use?.authorityRows !== 0) {
    errors.push("RIGHTS_PRIVACY_USE_BOUNDARY");
  }
  const { artifactHash: ignored, ...body } = report;
  if (!HASH.test(report.artifactHash ?? "")
    || report.artifactHash !== digest(REPORT_DOMAIN, body)) errors.push("ARTIFACT_HASH");
  return errors;
}

export function verifyDeltaCornReport(report) {
  const errors = reportErrors(report); return deepFreeze({ ok: errors.length === 0, errors });
}

export function createDeltaCornReceipt(report) {
  const checked = verifyDeltaCornReport(report);
  if (!checked.ok) fail("REPORT_INVALID", checked.errors.join(","));
  const body = { schema: DELTA_CORN_RECEIPT_SCHEMA, reportHash: report.artifactHash,
    sourceManifestHash: report.source.sourceManifestHash, sourceRoot: report.source.sourceRoot,
    disposition: DELTA_CORN_DISPOSITION, repositories: 3,
    selectedRepositoryFiles: 78, selectedRepositoryBytes: 256_155_436,
    sourceNativeEpisodeFiles: 30, sourceNativeFrameRows: 15_794,
    crossTotal: null, sourceNativeOutcomeRows: 0, independentOutcomeRows: 0,
    recoveryEffectRows: 0, pairedFailureRecoveryRows: 0,
    authorizedTrainingRows: 0, networkAdmissionRows: 0, authorityDelta: 0,
    receiptWrittenLast: true, noClobber: true };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyDeltaCornSourceDirectory(sourceDirectory, options = {}) {
  try {
    const source = collectCompleteSource(sourceDirectory, options);
    return deepFreeze({ ok: true, sourceManifest: source.sourceManifest,
      verificationLevel: "THREE_FIXED_REPOSITORY_NO_VIDEO_PLUS_COMPLETE_CAM_HIGH_REDERIVED" });
  } catch (error) { return deepFreeze({ ok: false,
    error: error instanceof Error ? error.message : String(error) }); }
}

export function verifyDeltaCornArtifactDirectory(directory, options = {}) {
  try {
    const root = path.resolve(directory); const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readRegular(root, "report.json");
    const receiptBytes = readRegular(root, "run-receipt.json");
    const report = buildDeltaCornReportFromSource(checkedPath(root, "source"), options);
    if (!serialize(report).equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const receipt = createDeltaCornReceipt(report);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report, receipt,
      reportFileSha256: deltaCornSha256(reportBytes),
      receiptFileSha256: deltaCornSha256(receiptBytes),
      verificationLevel: "THREE_FIXED_REPOSITORY_NO_VIDEO_PLUS_COMPLETE_CAM_HIGH_REDERIVED" });
  } catch (error) { return deepFreeze({ ok: false,
    error: error instanceof Error ? error.message : String(error) }); }
}

export function serializeDeltaCornArtifact(value) { return serialize(value); }
