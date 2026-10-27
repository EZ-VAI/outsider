/*
 * Source-bound replay of one exact same-instance, mixed-publisher-outcome
 * Open-SWE-Traces group. Two complete Parquet files contain the only two
 * occurrences in the publisher-native qwen35/SWE-agent/SWE-rebench-v2
 * partition; exact column-range proofs close the other seven files.
 * Raw trajectories remain private and no chronological retry is inferred.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const BufferFrom = Buffer.from;
const JSONParse = JSON.parse;
const PathRelative = path.relative;
const PathResolve = path.resolve;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const OPEN_SWE_BOUNDED_GROUP_SCHEMA =
  "outsider/open-swe-bounded-group/v1";
export const OPEN_SWE_BOUNDED_GROUP_RECEIPT_SCHEMA =
  "outsider/open-swe-bounded-group-receipt/v1";
export const OPEN_SWE_DATASET_ID = "nvidia/Open-SWE-Traces";
export const OPEN_SWE_REVISION =
  "dfc5bbcc46b36de773b68e286e59e537ab41d379";
export const OPEN_SWE_BOUNDED_GROUP_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/open-swe-bounded-group-report/v1";
const RECEIPT_DOMAIN = "outsider/open-swe-bounded-group-receipt/v1";
const MANIFEST_DOMAIN = "outsider/open-swe-bounded-group-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/open-swe-bounded-group-source-root/v1";
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_SUPPORT_BYTES = 2 * 1024 * 1024;
const MAX_FULL_BYTES = 250 * 1024 * 1024;
const BLOCK_BYTES = 1_048_576;
const PARTITION = "data/sweagent/qwen35_122b/swe-rebench-v2";
const INSTANCE_HASH =
  "d853cccbb7463117cf60af4626895f44c8baec42bad4eb78147f9d94b240b8b6";
const REPO_HASH =
  "8a5c7a643c0273a0a8b6b023177ba856eb59e4569b8d2e65fe0254df1ce72072";
const TREE_CANONICAL_SHA256 =
  "sha256:4fb7285364b53a8414b1e1c4b6b3da6d1f9de12e8ded4ce14b8d82d9df3f44d9";
const TREE_PROFILE = Object.freeze({
  entries: 235, files: 212, directories: 23, parquetFiles: 210,
  totalFileBytes: 41_291_049_221,
});
const PARTITION_FILE_BYTES = 1_931_533_044;
const SELECTED_FULL_BYTES = 263_596_615;
const PROOF_RANGE_BYTES = 18_526_381;
const ACQUIRED_PARQUET_SOURCE_BYTES = 282_122_996;
const PARTITION_ROWS = 20_334;
const PARTITION_OUTCOMES = Object.freeze({ unknown: 5_236,
  unresolved: 7_750, resolved: 7_348 });
const PERMISSIVE_LICENSES = Object.freeze([
  "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "MIT",
]);

const SUPPORT = Object.freeze([
  Object.freeze({ path: ".gitattributes", bytes: 2_504,
    gitOid: "bed0738c7eeb449bca98b5d2f33c89a1ee56349a",
    sha256: "sha256:9e75dd981de037ec3769f24f790e126bc5a160b6871f510214e68dc70649aeeb" }),
  Object.freeze({ path: "README.md", bytes: 9_532,
    gitOid: "806accb74947d27802f91072d65ab01e45770604",
    sha256: "sha256:6436572c2f25269725ba085cef55b6c7ef062a23d4fd244071d965adfa8e7bd0" }),
]);

const FILES = Object.freeze([
  { ordinal: 0, size: 234_461_442, rows: 2_500,
    outcomes: { unknown: 620, unresolved: 912, resolved: 968 },
    gitOid: "1509ed81a87ffeeb5a3e95f90381283125540d17",
    lfsOid: "56958e94dced93728952f86ee955a4090513784e59f4c04a438398c07cf0bf41",
    xetHash: "0f584419a07411577eee7d18b0184c3d1cae3a8e99cdf07c3b447a07fb0379fb",
    blocks: [0, 212_860_928, 233_832_448] },
  { ordinal: 1, size: 230_946_933, rows: 2_500,
    outcomes: { unknown: 627, unresolved: 978, resolved: 895 },
    gitOid: "93a8d7d8a197063929748a0a7a7273f13e9e1dbc",
    lfsOid: "c02dd1bd39d96e1c2958aeadb1b821177c2d6ed91f68fb391fdfd843e99fe509",
    xetHash: "9947d47fc138ce28e9c1eaae3b2d93056b7ec2a6b6ff125b3446013ddbfad799",
    full: true },
  { ordinal: 2, size: 241_786_701, rows: 2_500,
    outcomes: { unknown: 639, unresolved: 920, resolved: 941 },
    gitOid: "95392ae409c8f9f4ce118d13a1ce972ed023c27b",
    lfsOid: "85d36393dd69306c2d75b05b9740c02118ecbd20a8354ed40e97f75c6bb182d1",
    xetHash: "49bb3aaca3610eae4ae30ee81820206cd81405a283d12d380e95ac86afdba6d5",
    blocks: [0, 212_860_928, 241_172_480] },
  { ordinal: 3, size: 235_349_716, rows: 2_500,
    outcomes: { unknown: 610, unresolved: 949, resolved: 941 },
    gitOid: "4f7074fcfbce6ba3e4306b93e22c94bbe049a143",
    lfsOid: "9143dbc2d66ac65215ace43839c172917d8677118c179dc0f466d19338d64e8d",
    xetHash: "698b03b1d573742c3b000e8c5638daa65548e1f9acc4ba2624c13c97592fb25b",
    blocks: [0, 212_860_928, 234_881_024] },
  { ordinal: 4, size: 233_470_814, rows: 2_500,
    outcomes: { unknown: 610, unresolved: 940, resolved: 950 },
    gitOid: "6e9c839a81e4c9ed1b820d5812770058a3f07298",
    lfsOid: "2c34be8461c624fc248c52e354a6ab926a939708c3b447312916ab1b211a9e67",
    xetHash: "fec4a3cd3064d4dea7e1a4da4dd024f3ac5e61bff82cfc3393bb98f6815ceb4a",
    blocks: [0, 212_860_928, 232_783_872] },
  { ordinal: 5, size: 235_480_561, rows: 2_500,
    outcomes: { unknown: 624, unresolved: 965, resolved: 911 },
    gitOid: "fb7a364f8d0c209ac846fd236bf497beb39df6e7",
    lfsOid: "5769771db79163f4f26e3772681edf31f681e56f980427c5b162701592aeaa45",
    xetHash: "94959a2a190360b7c2b462ba448ca6cdaaee62315df230d20c89bfa07932bb10",
    blocks: [0, 212_860_928, 234_881_024] },
  { ordinal: 6, size: 243_578_790, rows: 2_500,
    outcomes: { unknown: 673, unresolved: 988, resolved: 839 },
    gitOid: "29bd20a249e804d332f9ae851f8e55e8d82a36c1",
    lfsOid: "3d6ae2db9c68b1ee8f607c234535ea904ae3f4986f932737ef61cd3ae36e73fd",
    xetHash: "0b66fb8ff5916dba2fb3f3e45cfbb3e00cff3d1050c076e1b632504eb2c85dac",
    blocks: [0, 217_055_232, 243_269_632] },
  { ordinal: 7, size: 243_808_405, rows: 2_500,
    outcomes: { unknown: 726, unresolved: 971, resolved: 803 },
    gitOid: "caf7d3213c9a33c50a70fe8fd3368ac5aece3a9b",
    lfsOid: "979f2ae69918c17f66cab0f6adbfa2fffbd8d25f87276df2147b4b66c070d808",
    xetHash: "d067fc7b2a14a3ff48786dc9e79dd7d5ae559602b2d3dba5a253de54d78fc23a",
    blocks: [0, 222_298_112, 243_269_632] },
  { ordinal: 8, size: 32_649_682, rows: 334,
    outcomes: { unknown: 107, unresolved: 127, resolved: 100 },
    gitOid: "15956ab61f5f77df22bd046d8788821582724b16",
    lfsOid: "4fe7805a22d42b9903419b5a0aa9e12a52c34c7f3e21590c7909b1bbecf1c9f9",
    xetHash: "1bc525ba7e52b911b066b6b5769dcd503283569085e59d8705af7d999b798f51",
    full: true },
].map((entry) => Object.freeze({ ...entry,
  outcomes: Object.freeze(entry.outcomes),
  blocks: entry.blocks === undefined ? undefined : Object.freeze(entry.blocks),
  path: `${PARTITION}/train-${String(entry.ordinal).padStart(5, "0")}-of-00009.parquet`,
})));

const METADATA_FILES = Object.freeze([
  "dataset-record-after.json", "dataset-record-before.json",
  "full-tree-after.json", "full-tree-before.json",
]);
const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code, detail = null) {
  throw new Error(detail === null ? `OPEN_SWE_BOUNDED_GROUP_${code}`
    : `OPEN_SWE_BOUNDED_GROUP_${code}:${detail}`);
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

function checkedRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600 || link.size < 1n
    || link.size > BigInt(maximumBytes)
    || exactBytes !== null && link.size !== BigInt(exactBytes)) {
    fail("FILE_UNSAFE", relative);
  }
  return { target, link };
}

function readRegular(root, relative, maximumBytes, exactBytes = null) {
  const { target } = checkedRegular(root, relative, maximumBytes, exactBytes);
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

function hashRegular(root, relative, maximumBytes, exactBytes) {
  const { target } = checkedRegular(root, relative, maximumBytes, exactBytes);
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  const hash = createHash("sha256");
  const chunk = Buffer.allocUnsafe(4 * 1024 * 1024);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    let total = 0;
    while (true) {
      const count = readSync(descriptor, chunk, 0, chunk.length, null);
      if (count === 0) break;
      hash.update(chunk.subarray(0, count));
      total += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(total) !== after.size) fail("FILE_CHANGED_DURING_READ", relative);
    return { bytes: total, sha256: `sha256:${hash.digest("hex")}` };
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
  const configs = value.cardData?.configs;
  const result = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, cardLicense: value.cardData?.license,
    siblingCount: value.siblings?.length,
    configs,
  };
  if (!same(result, {
    id: OPEN_SWE_DATASET_ID, author: "nvidia", sha: OPEN_SWE_REVISION,
    lastModified: "2026-08-28T18:39:20.000Z", private: false,
    gated: false, disabled: false, usedStorage: 291_721_693_100,
    cardLicense: "cc-by-4.0", siblingCount: 212,
    configs: [
      { config_name: "v1.0", data_files: [
        { split: "openhands", path: [
          "data/openhands/minimax_m25/*/*.parquet",
          "data/openhands/qwen35_122b/*/*.parquet" ] },
        { split: "sweagent", path: [
          "data/sweagent/minimax_m25/*/*.parquet",
          "data/sweagent/qwen35_122b/*/*.parquet" ] },
      ] },
      { config_name: "v1.1", data_files: [
        { split: "openhands", path: [
          "data/openhands/qwen36_27b/*/*.parquet",
          "data/openhands/deepseek_v4_flash/*/*.parquet" ] },
        { split: "sweagent", path: [
          "data/sweagent/qwen36_27b/*/*.parquet" ] },
        { split: "minisweagent", path: [
          "data/sweagent/qwen36_27b/*/*.parquet" ] },
      ] },
    ],
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
  if (entries.length !== TREE_PROFILE.entries || files.length !== TREE_PROFILE.files
    || directories.length !== TREE_PROFILE.directories
    || files.filter((entry) => entry.path.endsWith(".parquet")).length
      !== TREE_PROFILE.parquetFiles
    || files.reduce((sum, entry) => sum + entry.size, 0)
      !== TREE_PROFILE.totalFileBytes
    || sha256(BufferFrom(canonicalizeStrict(entries), "utf8"))
      !== TREE_CANONICAL_SHA256) fail("TREE_PROFILE_INVALID");
  const partition = files.filter((entry) => entry.path.startsWith(`${PARTITION}/`));
  if (partition.length !== FILES.length
    || partition.reduce((sum, entry) => sum + entry.size, 0)
      !== PARTITION_FILE_BYTES) fail("PARTITION_TREE_INVALID");
  for (const expected of FILES) {
    const actual = partition.find((entry) => entry.path === expected.path);
    if (actual?.size !== expected.size || actual?.oid !== expected.gitOid
      || actual?.lfsOid !== expected.lfsOid || actual?.lfsSize !== expected.size
      || actual?.xetHash !== expected.xetHash) fail("PARTITION_FILE_PIN_INVALID",
        expected.path);
  }
  return { entries };
}

function verifyReadme(bytes) {
  if (sha256(bytes) !== SUPPORT[1].sha256) fail("README_PIN_INVALID");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const sweagent = 'split: sweagent\n        path: \n          - "data/sweagent/qwen36_27b/*/*.parquet"';
  const minisweagent = 'split: minisweagent\n        path: \n          - "data/sweagent/qwen36_27b/*/*.parquet"';
  if (!text.includes(sweagent) || !text.includes(minisweagent)
    || text.includes('split: minisweagent\n        path: \n          - "data/minisweagent/')
    || !text.includes("Released 207k agent trajectories")
    || !text.includes("Now, v1.0 includes 151k agent trajectories")
    || !text.includes("207,489** total trajectories")
    || !text.includes("## Data Version\n1.0")) fail("README_PROFILE_INVALID");
}

function proofPath(entry, start) {
  return `proof-ranges/${entry.ordinal}/${String(start).padStart(12, "0")}.bin`;
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/open-swe-bounded-group-source-manifest/v1",
    datasetId: OPEN_SWE_DATASET_ID, revision: OPEN_SWE_REVISION,
    partition: PARTITION,
    selectedFullParquetOrdinals: [1, 8],
    closureProofParquetOrdinals: [0, 2, 3, 4, 5, 6, 7],
    entries: ordered, sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const expected = [
    ...METADATA_FILES.map((file) => `metadata/${file}`),
    ...SUPPORT.map((item) => `files/${item.path}`),
    ...FILES.filter((item) => item.full).map((item) => `files/${item.path}`),
    ...FILES.filter((item) => !item.full).flatMap((item) =>
      item.blocks.map((start) => proofPath(item, start))),
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  const entries = [];
  const metadata = new Map();
  for (const file of METADATA_FILES) {
    const bytes = readRegular(root, `metadata/${file}`, MAX_METADATA_BYTES);
    metadata.set(file, bytes);
    entries.push({ path: `metadata/${file}`, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const beforeRecord = recordProjection(metadata.get("dataset-record-before.json"));
  const afterRecord = recordProjection(metadata.get("dataset-record-after.json"));
  const beforeTree = treeProjection(metadata.get("full-tree-before.json"));
  const afterTree = treeProjection(metadata.get("full-tree-after.json"));
  if (!same(beforeRecord, afterRecord) || !same(beforeTree, afterTree)) {
    fail("MATERIAL_STATE_CHANGED");
  }
  for (const item of SUPPORT) {
    const bytes = readRegular(root, `files/${item.path}`,
      MAX_SUPPORT_BYTES, item.bytes);
    if (sha256(bytes) !== item.sha256 || gitBlobOid(bytes) !== item.gitOid) {
      fail("SUPPORT_PIN_INVALID", item.path);
    }
    if (item.path === "README.md") verifyReadme(bytes);
    entries.push({ path: `files/${item.path}`, bytes: bytes.length,
      sha256: item.sha256 });
  }
  for (const item of FILES.filter((entry) => entry.full)) {
    const relative = `files/${item.path}`;
    const measured = hashRegular(root, relative, MAX_FULL_BYTES, item.size);
    if (measured.sha256 !== `sha256:${item.lfsOid}`) {
      fail("FULL_PARQUET_PIN_INVALID", item.path);
    }
    entries.push({ path: relative, ...measured });
  }
  let proofBytes = 0;
  for (const item of FILES.filter((entry) => !entry.full)) {
    for (const start of item.blocks) {
      const exact = Math.min(BLOCK_BYTES, item.size - start);
      const relative = proofPath(item, start);
      const bytes = readRegular(root, relative, BLOCK_BYTES, exact);
      proofBytes += bytes.length;
      entries.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  if (proofBytes !== PROOF_RANGE_BYTES) fail("PROOF_RANGE_BYTES_INVALID");
  return { root, entries, record: beforeRecord, tree: beforeTree };
}

export function createOpenSweBoundedGroupSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, io, json, pathlib, sys
import pyarrow as pa
import pyarrow.parquet as pq

root = pathlib.Path(sys.argv[1])
partition = 'data/sweagent/qwen35_122b/swe-rebench-v2'
block_bytes = 1048576
instance_hash = 'd853cccbb7463117cf60af4626895f44c8baec42bad4eb78147f9d94b240b8b6'
repo_hash = '8a5c7a643c0273a0a8b6b023177ba856eb59e4569b8d2e65fe0254df1ce72072'
files = [
 (0,234461442,2500,{-1:620,0:912,1:968},[0,212860928,233832448],False),
 (1,230946933,2500,{-1:627,0:978,1:895},[],True),
 (2,241786701,2500,{-1:639,0:920,1:941},[0,212860928,241172480],False),
 (3,235349716,2500,{-1:610,0:949,1:941},[0,212860928,234881024],False),
 (4,233470814,2500,{-1:610,0:940,1:950},[0,212860928,232783872],False),
 (5,235480561,2500,{-1:624,0:965,1:911},[0,212860928,234881024],False),
 (6,243578790,2500,{-1:673,0:988,1:839},[0,217055232,243269632],False),
 (7,243808405,2500,{-1:726,0:971,1:803},[0,222298112,243269632],False),
 (8,32649682,334,{-1:107,0:127,1:100},[],True),
]

def die(code):
    raise RuntimeError('OPEN_SWE_BOUNDED_GROUP_PYTHON_' + code)

class RangeReader(io.RawIOBase):
    def __init__(self, ordinal, size, blocks):
        self.ordinal = ordinal
        self.size = size
        self.position = 0
        self.blocks = set(blocks)
        self.cache = {}
    def readable(self): return True
    def seekable(self): return True
    def tell(self): return self.position
    def seek(self, offset, whence=0):
        if whence == 0: self.position = offset
        elif whence == 1: self.position += offset
        elif whence == 2: self.position = self.size + offset
        else: die('RANGE_WHENCE_INVALID')
        if self.position < 0 or self.position > self.size:
            die('RANGE_SEEK_INVALID')
        return self.position
    def readinto(self, buffer):
        length = min(len(buffer), max(0, self.size - self.position))
        target = memoryview(buffer)
        completed = 0
        while completed < length:
            start = self.position // block_bytes * block_bytes
            if start not in self.blocks: die('UNACQUIRED_RANGE_REQUESTED')
            if start not in self.cache:
                file = root / 'proof-ranges' / str(self.ordinal) / (str(start).zfill(12) + '.bin')
                data = file.read_bytes()
                if len(data) != min(block_bytes, self.size - start):
                    die('RANGE_FILE_SIZE_INVALID')
                self.cache[start] = data
            data = self.cache[start]
            within = self.position - start
            take = min(length - completed, len(data) - within)
            if take <= 0: die('RANGE_READ_INVALID')
            target[completed:completed + take] = data[within:within + take]
            self.position += take
            completed += take
        return length

profiles = []
selected = []
schema_names = None
for ordinal, size, rows, expected_outcomes, blocks, full in files:
    name = 'train-' + str(ordinal).zfill(5) + '-of-00009.parquet'
    if full:
        parquet = pq.ParquetFile(root / 'files' / partition / name)
        names = parquet.schema_arrow.names
        required = {'instance_id','repo','license','language','trajectory_id',
                    'messages','tools','resolved','metadata','hf_dataset_name'}
        if set(names) != required: die('TOP_LEVEL_SCHEMA_INVALID')
        schema_names = sorted(names) if schema_names is None else schema_names
        if schema_names != sorted(names): die('FULL_SCHEMA_NAMES_DIFFER')
        table = parquet.read(columns=['instance_id','repo','license','language',
                                      'trajectory_id','resolved'])
    else:
        reader = RangeReader(ordinal, size, blocks)
        parquet = pq.ParquetFile(pa.PythonFile(reader))
        table = parquet.read(columns=['instance_id','resolved'])
    if parquet.metadata.num_rows != rows or parquet.metadata.num_row_groups != 1:
        die('PARQUET_PROFILE_INVALID')
    data = table.to_pydict()
    if any(table.column(name).null_count != 0 for name in table.column_names):
        die('NULL_SCALAR_VALUE')
    outcomes = collections.Counter(data['resolved'])
    if dict(outcomes) != expected_outcomes: die('OUTCOME_PROFILE_INVALID')
    hits = []
    for index, identity in enumerate(data['instance_id']):
        if not isinstance(identity, str) or not identity: die('INSTANCE_INVALID')
        if hashlib.sha256(identity.encode()).hexdigest() == instance_hash:
            hit = {'ordinal': ordinal, 'rowIndex': index,
                   'publisherOutcome': data['resolved'][index]}
            if full:
                for field in ('repo','license','language','trajectory_id'):
                    value = data[field][index]
                    if not isinstance(value, str) or not value: die('GROUP_FIELD_INVALID')
                hit.update({
                  'repoHash': hashlib.sha256(data['repo'][index].encode()).hexdigest(),
                  'license': data['license'][index],
                  'language': data['language'][index],
                  'trajectoryHash': hashlib.sha256(data['trajectory_id'][index].encode()).hexdigest(),
                })
            hits.append(hit)
    selected.extend(hits)
    profiles.append({'ordinal': ordinal, 'rows': rows,
      'unknown': outcomes[-1], 'unresolved': outcomes[0],
      'resolved': outcomes[1], 'selectedInstanceOccurrences': len(hits),
      'completeFileAcquired': full})

if (len(selected) != 2 or [row['ordinal'] for row in selected] != [1,8]
        or [row['publisherOutcome'] for row in selected] != [0,1]
        or any(row['repoHash'] != repo_hash for row in selected)
        or any(row['license'] != 'MIT' for row in selected)
        or any(row['language'] != 'typescript' for row in selected)
        or len({row['trajectoryHash'] for row in selected}) != 2):
    die('SELECTED_GROUP_INVALID')
shape = hashlib.sha256()
for row in selected:
    shape.update(json.dumps(row, sort_keys=True, separators=(',', ':')).encode())
    shape.update(b'\n')
print(json.dumps({
  'partitionRows': sum(profile['rows'] for profile in profiles),
  'partitionPublisherOutcomes': {
    'unknown': sum(profile['unknown'] for profile in profiles),
    'unresolved': sum(profile['unresolved'] for profile in profiles),
    'resolved': sum(profile['resolved'] for profile in profiles),
  },
  'partitionFileProfiles': profiles,
  'selectedInstanceHash': 'sha256:' + instance_hash,
  'selectedRepoHash': 'sha256:' + repo_hash,
  'selectedGroupRows': 2,
  'selectedPublisherOutcomes': {'unresolved': 1, 'resolved': 1},
  'selectedPhysicalFileOrdinals': [1,8],
  'selectedRowIndexesWithinPhysicalFiles': [selected[0]['rowIndex'], selected[1]['rowIndex']],
  'selectedLicenses': ['MIT'],
  'selectedLanguages': ['typescript'],
  'selectedTrajectoryHashes': sorted('sha256:' + row['trajectoryHash'] for row in selected),
  'selectedTrajectoryShapeRoot': 'sha256:' + shape.hexdigest(),
  'partitionClosureReplayed': True,
  'sameInstanceOccurrencesInOtherSevenPartitionFiles': 0,
  'rawMessagesToolsReasoningPatchesProjected': False,
}, sort_keys=True, separators=(',', ':')))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_OPEN_SWE_PYTHON ?? ".venv/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 300_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim() ?? result.status);
  }
  let value;
  try { value = JSONParse(result.stdout); } catch { fail("REPLAY_OUTPUT_INVALID"); }
  if (value.partitionRows !== PARTITION_ROWS
    || !same(value.partitionPublisherOutcomes, PARTITION_OUTCOMES)) {
    fail("REPLAY_DENOMINATOR_INVALID");
  }
  return deepFreeze(value);
}

export function buildOpenSweBoundedGroupArtifactFromSourceDirectory(
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
    schema: OPEN_SWE_BOUNDED_GROUP_SCHEMA,
    disposition: OPEN_SWE_BOUNDED_GROUP_DISPOSITION,
    source: {
      datasetId: OPEN_SWE_DATASET_ID, revision: OPEN_SWE_REVISION,
      lastModified: collected.record.lastModified, public: true, gated: false,
      fullFixedRevisionTreeEntries: TREE_PROFILE.entries,
      fullFixedRevisionFiles: TREE_PROFILE.files,
      fullFixedRevisionParquetFiles: TREE_PROFILE.parquetFiles,
      fullFixedRevisionFileBytes: TREE_PROFILE.totalFileBytes,
      fixedTreeApiPages: 1, fixedTreeApiPageLimit: 1_000,
      fixedTreeApiPageReturnedEntries: TREE_PROFILE.entries,
      paginationTerminatedBelowLimit: true,
      fixedRevisionRecordUsedStorageBytes: collected.record.usedStorage,
      fixedRevisionRowCountPublishedInRecord: null,
      fullTreeInventoried: true, fullRepositoryPayloadAcquired: false,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
      materialRecordAndTreeStateStable: true,
    },
    loaderManifest: {
      v11MinisweagentLogicalPath:
        "data/sweagent/qwen36_27b/*/*.parquet",
      v11SweagentLogicalPath:
        "data/sweagent/qwen36_27b/*/*.parquet",
      physicalMinisweagentPathPresent:
        "data/minisweagent/qwen36_27b",
      minisweagentPointsAtSweagentPhysicalPath: true,
      manifestMatchesPhysicalMinisweagentPath: false,
      directLoadDatasetDenominatorTrusted: false,
      readmeDataVersion: "1.0",
      readmeHistoricalBeforeFilteringTrajectories: 207_489,
      readmeNarrativeAfterFilteringTrajectories: "151k",
      readmeCountsApplyToV11: false,
    },
    selection: {
      partition: PARTITION, partitionPhysicalFiles: 9,
      partitionPhysicalFileBytes: PARTITION_FILE_BYTES,
      completeFullParquetOrdinals: [1, 8],
      closureProofParquetOrdinals: [0, 2, 3, 4, 5, 6, 7],
      completeFullParquetBytes: SELECTED_FULL_BYTES,
      exactClosureProofRangeBytes: PROOF_RANGE_BYTES,
      acquiredParquetSourceBytes: ACQUIRED_PARQUET_SOURCE_BYTES,
      acquisitionBudgetBytes: 300_000_000,
      withinAcquisitionBudget: true,
      sourceNativeSameInstanceGroup: true,
      completeWithinSelectedPartition: true,
      completeAcrossOtherHarnessModelPartitions: false,
      completeDataset: false, representativenessEstablished: false,
      sourceUniverseExhausted: false,
    },
    replay: { ...replay,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")) },
    denominators: {
      PUBLISHER_NATIVE_PARTITION_TRAJECTORY: PARTITION_ROWS,
      SELECTED_SAME_INSTANCE_TRAJECTORY_WITHIN_PARTITION: 2,
      FIXED_REVISION_REPOSITORY_FILE_BYTES: TREE_PROFILE.totalFileBytes,
      fixedRevisionTrajectoryTotal: null,
      crossConfigTotal: null, crossPopulationTotal: null,
      additionProhibited: true,
    },
    outcome: {
      partitionPublisherOutcomes: PARTITION_OUTCOMES,
      selectedPublisherOutcomes: { unresolved: 1, resolved: 1 },
      publisherHarnessOutcomeRows: 2,
      publisherResolutionIndependentlyRerun: false,
      chronologicalRetryOrderEstablished: false,
      recoveryEpisodeRows: 0, independentOutcomeRows: 0,
      realWorldOutcomeRows: 0, longitudinalOutcomeRows: 0,
    },
    rights: {
      datasetCardLicenseClaim: "CC-BY-4.0",
      datasetLicenseFilePresent: false,
      selectedRowRepositoryLicenses: ["MIT"],
      allowedPermissiveRepositoryLicenseSet: PERMISSIVE_LICENSES,
      everySelectedRowLicenseAllowed: true,
      publisherFineTuningAndDistillationClaimPresent: true,
      useSpecificTrainingAuthorizationEstablished: false,
      legalConclusionEstablished: false, authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      rawMessagesPresentBySchema: true, rawToolsPresentBySchema: true,
      rawReasoningMayBePresentBySchema: true,
      rawPatchesPresentBySchema: true, rawSourcePrivate: true,
      noPiiGuaranteed: false, rawProjectionRows: 0,
    },
    boundary: {
      syntheticSoftwareAgentTrajectoryRows: 2,
      publisherOutcomeRows: 2, independentOutcomeRows: 0,
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

export function createOpenSweBoundedGroupReceipt(
  report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: OPEN_SWE_BOUNDED_GROUP_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: OPEN_SWE_BOUNDED_GROUP_DISPOSITION,
    selectedGroupRows: 2, publisherOutcomeRows: 2,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    authorizedTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, authorityRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyOpenSweBoundedGroupArtifactDirectory(directory, options = {}) {
  try {
    const root = PathResolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)),
        ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readRegular(root, "report.json", MAX_METADATA_BYTES);
    const receiptBytes = readRegular(root, "run-receipt.json", MAX_METADATA_BYTES);
    const built = buildOpenSweBoundedGroupArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createOpenSweBoundedGroupReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) {
      fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    }
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeOpenSweBoundedGroupArtifact(value) {
  return serialize(value);
}
