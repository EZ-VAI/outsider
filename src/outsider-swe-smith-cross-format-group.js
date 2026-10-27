/*
 * Fixed-revision, source-native SWE-smith trajectory groups.
 *
 * Every physical Parquet path contributes its exact `traj_id` column ranges,
 * while the two selected tool/ticks row groups contribute every source column.
 * This closes representation duplicates without publishing raw trajectories.
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
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const PathRelative = path.relative;
const PathResolve = path.resolve;

export const SWE_SMITH_CROSS_FORMAT_GROUP_SCHEMA =
  "outsider/swe-smith-cross-format-group/v1";
export const SWE_SMITH_CROSS_FORMAT_GROUP_RECEIPT_SCHEMA =
  "outsider/swe-smith-cross-format-group-receipt/v1";
export const SWE_SMITH_CROSS_FORMAT_DATASET_ID =
  "SWE-bench/SWE-smith-trajectories";
export const SWE_SMITH_CROSS_FORMAT_REVISION =
  "08e109b4a59eaeebf80e4675cd125d42e7ac99a4";
export const SWE_SMITH_CROSS_FORMAT_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/swe-smith-cross-format-group-report/v1";
const RECEIPT_DOMAIN = "outsider/swe-smith-cross-format-group-receipt/v1";
const MANIFEST_DOMAIN =
  "outsider/swe-smith-cross-format-group-source-manifest/v1";
const SOURCE_ROOT_DOMAIN =
  "outsider/swe-smith-cross-format-group-source-root/v1";
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_RANGE_BYTES = 40 * 1024 * 1024;
const RANGE_SOURCE_BYTES = 196_566_655;
const ACQUISITION_BUDGET_BYTES = 300_000_000;
const TREE_CANONICAL_SHA256 =
  "sha256:bc4b82fc5a663d0080f1f7a339673d24b2ef1158dbb7d3fa2ba59f0c1d850dfb";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:4315ca1f8bc8594dae371e80904d476c85e66b3bf29e74bbacf9745ef6e5e7ef";
const HASH = /^sha256:[a-f0-9]{64}$/u;

const SUPPORT = Object.freeze([
  Object.freeze({ path: ".gitattributes", bytes: 2_461,
    gitOid: "1ef325f1b111266a6b26e0196871bd78baa8c2f3",
    sha256: "sha256:e7a120ab07b1bc5b486be249e9fc6c83d59448d0093e1dfebe95d1566d9cafc0" }),
  Object.freeze({ path: "README.md", bytes: 1_675,
    gitOid: "45c3393577f392756de3f08aced5cfd18b7c9fad",
    sha256: "sha256:1fa2f5971a723a60a6ca60a5842aa83eb78259bfd175bce9a80692c5a2248aa0" }),
]);

const TREE_PROFILE = Object.freeze({
  entries: 35, files: 34, directories: 1, parquetFiles: 32,
  totalFileBytes: 4_223_845_920,
  prefixBytes: Object.freeze({ ticks: 1_018_711_426,
    tool: 1_077_271_863, train: 1_052_703_887,
    xml: 1_075_154_608, support: 4_136 }),
});

function frozenRanges(values) {
  return Object.freeze(values.map((value) => Object.freeze(value)));
}

function sourceFile(pathname, size, rows, ranges) {
  return Object.freeze({ path: pathname, size, rows,
    rowGroups: 4, ranges: frozenRanges(ranges) });
}

const FILES = Object.freeze([
  sourceFile("data/ticks-00000-of-00008.parquet", 113_912_058, 3_229,
    [[31_457_280,32_505_855],[67_108_864,68_157_439],
      [101_711_872,102_760_447],[113_246_208,113_912_057]]),
  sourceFile("data/ticks-00001-of-00008.parquet", 94_554_660, 3_229,
    [[28_311_552,29_360_127],[57_671_680,58_720_255],
      [85_983_232,87_031_807],[94_371_840,94_554_659]]),
  sourceFile("data/ticks-00002-of-00008.parquet", 111_837_011, 3_228,
    [[0,3],[23_068_672,24_117_247],[27_060_353,63_981_391],
      [100_663_296,101_711_871],[110_100_480,111_837_010]]),
  sourceFile("data/ticks-00003-of-00008.parquet", 143_312_101, 3_228,
    [[36_700_160,37_748_735],[74_448_896,75_497_471],
      [111_149_056,112_197_631],[141_557_760,143_312_100]]),
  sourceFile("data/ticks-00004-of-00008.parquet", 110_237_523, 3_228,
    [[26_214_400,27_262_975],[73_400_320,74_448_895],
      [102_760_448,103_809_023],[109_051_904,110_237_522]]),
  sourceFile("data/ticks-00005-of-00008.parquet", 95_669_393, 3_228,
    [[25_165_824,26_214_399],[53_477_376,54_525_951],
      [84_934_656,85_983_231],[94_371_840,95_669_392]]),
  sourceFile("data/ticks-00006-of-00008.parquet", 119_695_672, 3_228,
    [[27_262_976,28_311_551],[57_671_680,58_720_255],
      [89_128_960,90_177_535],[114_294_784,115_343_359],
      [119_537_664,119_695_671]]),
  sourceFile("data/ticks-00007-of-00008.parquet", 229_493_008, 3_228,
    [[15_728_640,16_777_215],[39_845_888,40_894_463],
      [222_298_112,223_346_687],[228_589_568,229_493_007]]),
  sourceFile("data/tool-00000-of-00008.parquet", 248_851_790, 3_013,
    [[28_311_552,29_360_127],[69_206_016,70_254_591],
      [246_415_360,247_463_935],[248_512_512,248_851_789]]),
  sourceFile("data/tool-00001-of-00008.parquet", 115_563_238, 3_013,
    [[33_554_432,35_651_583],[69_206_016,70_254_591],
      [98_566_144,99_614_719],[115_343_360,115_563_237]]),
  sourceFile("data/tool-00002-of-00008.parquet", 99_575_331, 3_013,
    [[26_214_400,27_262_975],[63_963_136,65_011_711],
      [95_420_416,96_468_991],[98_566_144,99_575_330]]),
  sourceFile("data/tool-00003-of-00008.parquet", 138_356_054, 3_013,
    [[41_943_040,42_991_615],[78_643_200,79_691_775],
      [114_294_784,115_343_359],[137_363_456,138_356_053]]),
  sourceFile("data/tool-00004-of-00008.parquet", 77_754_558, 3_012,
    [[0,31_541_683],[46_137_344,47_185_919],
      [75_497_472,76_546_047],[77_594_624,77_754_557]]),
  sourceFile("data/tool-00005-of-00008.parquet", 122_628_947, 3_012,
    [[38_797_312,39_845_887],[78_643_200,79_691_775],
      [120_586_240,122_628_946]]),
  sourceFile("data/tool-00006-of-00008.parquet", 152_807_260, 3_012,
    [[38_797_312,39_845_887],[76_546_048,77_594_623],
      [125_829_120,126_877_695],[152_043_520,152_807_259]]),
  sourceFile("data/tool-00007-of-00008.parquet", 121_734_685, 3_012,
    [[32_505_856,33_554_431],[72_351_744,73_400_319],
      [119_537_664,120_586_239],[121_634_816,121_734_684]]),
  sourceFile("data/train-00000-of-00008.parquet", 102_759_501, 3_260,
    [[29_360_128,30_408_703],[65_011_712,66_060_287],
      [94_371_840,95_420_415],[101_711_872,102_759_500]]),
  sourceFile("data/train-00001-of-00008.parquet", 117_771_443, 3_260,
    [[28_311_552,29_360_127],[63_963_136,65_011_711],
      [112_197_632,113_246_207],[117_440_512,117_771_442]]),
  sourceFile("data/train-00002-of-00008.parquet", 112_075_262, 3_260,
    [[23_068_672,24_117_247],[60_817_408,61_865_983],
      [100_663_296,101_711_871],[111_149_056,112_075_261]]),
  sourceFile("data/train-00003-of-00008.parquet", 140_249_623, 3_260,
    [[37_748_736,38_797_311],[77_594_624,78_643_199],
      [115_343_360,116_391_935],[139_460_608,140_249_622]]),
  sourceFile("data/train-00004-of-00008.parquet", 123_631_125, 3_259,
    [[31_457_280,32_505_855],[90_177_536,91_226_111],
      [115_343_360,116_391_935],[122_683_392,123_631_124]]),
  sourceFile("data/train-00005-of-00008.parquet", 241_523_549, 3_259,
    [[26_214_400,27_262_975],[67_108_864,68_157_439],
      [232_783_872,233_832_447],[241_172_480,241_523_548]]),
  sourceFile("data/train-00006-of-00008.parquet", 110_276_367, 3_259,
    [[29_360_128,30_408_703],[58_720_256,59_768_831],
      [101_711_872,102_760_447],[109_051_904,110_276_366]]),
  sourceFile("data/train-00007-of-00008.parquet", 104_417_017, 3_259,
    [[27_262_976,28_311_551],[61_865_984,62_914_559],
      [98_566_144,99_614_719],[103_809_024,104_417_016]]),
  sourceFile("data/xml-00000-of-00008.parquet", 105_531_809, 3_260,
    [[30_408_704,31_457_279],[67_108_864,68_157_439],
      [96_468_992,97_517_567],[103_809_024,105_531_808]]),
  sourceFile("data/xml-00001-of-00008.parquet", 120_512_063, 3_260,
    [[29_360_128,30_408_703],[65_011_712,66_060_287],
      [115_343_360,116_391_935],[119_537_664,120_512_062]]),
  sourceFile("data/xml-00002-of-00008.parquet", 115_266_864, 3_260,
    [[24_117_248,25_165_823],[61_865_984,62_914_559],
      [102_760_448,103_809_023],[114_294_784,115_266_863]]),
  sourceFile("data/xml-00003-of-00008.parquet", 143_562_585, 3_260,
    [[38_797_312,39_845_887],[79_691_776,80_740_351],
      [118_489_088,119_537_663],[142_606_336,143_562_584]]),
  sourceFile("data/xml-00004-of-00008.parquet", 126_290_943, 3_259,
    [[32_505_856,33_554_431],[92_274_688,93_323_263],
      [117_440_512,118_489_087],[125_829_120,126_290_942]]),
  sourceFile("data/xml-00005-of-00008.parquet", 244_101_081, 3_259,
    [[27_262_976,28_311_551],[69_206_016,70_254_591],
      [234_881_024,235_929_599],[243_269_632,244_101_080]]),
  sourceFile("data/xml-00006-of-00008.parquet", 112_771_234, 3_259,
    [[29_360_128,30_408_703],[59_768_832,61_865_983],
      [103_809_024,104_857_599],[112_197_632,112_771_233]]),
  sourceFile("data/xml-00007-of-00008.parquet", 107_118_029, 3_259,
    [[28_311_552,29_360_127],[62_914_560,63_963_135],
      [100_663_296,101_711_871],[105_906_176,107_118_028]]),
]);

const SELECTED = Object.freeze([
  Object.freeze({ trajectoryHash:
    "sha256:00922d5017c4be2e2dc14788eb045586e3ba1cb6b0d89c8f40a4f755a70db6ef",
    instanceHash:
    "sha256:7e9cf9de3721e98b3af99dac7f9639884e980af304d836da16a27f3ba198e412",
    publisherOutcome: "unresolved", toolRow: 659, ticksRow: 1_311 }),
  Object.freeze({ trajectoryHash:
    "sha256:014ac4b3ac17adb9089181edb9c2136c539f983576689f140484c4759f3dcdc2",
    instanceHash:
    "sha256:5a59e10779cc79d8763aa1211f32f1bcad54ddb9a6300d302c3179737ee5ac87",
    publisherOutcome: "resolved", toolRow: 565, ticksRow: 1_222 }),
]);

const METADATA_FILES = Object.freeze([
  "dataset-record-after.json", "dataset-record-before.json",
  "full-tree-after.json", "full-tree-before.json",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `SWE_SMITH_CROSS_FORMAT_${code}`
    : `SWE_SMITH_CROSS_FORMAT_${code}:${detail}`);
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
  const status = lstatSync(target, { bigint: true });
  if (!status.isFile() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o600 || status.size < 1n
    || status.size > BigInt(maximumBytes)
    || exactBytes !== null && status.size !== BigInt(exactBytes)) {
    fail("FILE_UNSAFE", relative);
  }
  return { target, status };
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
      || BigInt(bytes.length) !== after.size) {
      fail("FILE_CHANGED_DURING_READ", relative);
    }
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
      || BigInt(total) !== after.size) {
      fail("FILE_CHANGED_DURING_READ", relative);
    }
    return { bytes: total, sha256: `sha256:${hash.digest("hex")}` };
  } finally { closeSync(descriptor); }
}

function walk(root, prefix = "") {
  const directory = prefix === "" ? root : checkedPath(root, prefix);
  const status = lstatSync(directory, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o700) {
    fail("DIRECTORY_UNSAFE", prefix);
  }
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

function recordProjection(bytes) {
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const splits = value.cardData?.dataset_info?.splits;
  const result = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, cardLicense: value.cardData?.license,
    siblingCount: value.siblings?.length,
    splitRows: Array.isArray(splits)
      ? Object.fromEntries(splits.map((item) => [item.name, item.num_examples]))
      : null,
    configs: value.cardData?.configs,
  };
  if (!same(result, {
    id: SWE_SMITH_CROSS_FORMAT_DATASET_ID, author: "SWE-bench",
    sha: SWE_SMITH_CROSS_FORMAT_REVISION,
    lastModified: "2025-07-19T01:18:16.000Z", private: false,
    gated: false, disabled: false, usedStorage: 8_777_676_392,
    cardLicense: "mit", siblingCount: 34,
    splitRows: { ticks: 25_826, tool: 24_100, xml: 26_076 },
    configs: [{ config_name: "default", data_files: [
      { split: "tool", path: "data/tool-*" },
      { split: "xml", path: "data/xml-*" },
      { split: "ticks", path: "data/ticks-*" },
    ] }],
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
  const prefixBytes = { support: 0, ticks: 0, tool: 0, train: 0, xml: 0 };
  for (const entry of files) {
    const match = /^data\/(ticks|tool|train|xml)-/u.exec(entry.path ?? "");
    prefixBytes[match?.[1] ?? "support"] += entry.size;
  }
  if (entries.length !== TREE_PROFILE.entries || files.length !== TREE_PROFILE.files
    || directories.length !== TREE_PROFILE.directories
    || directories[0]?.path !== "data"
    || files.filter((entry) => entry.path.endsWith(".parquet")).length
      !== TREE_PROFILE.parquetFiles
    || files.reduce((sum, entry) => sum + entry.size, 0)
      !== TREE_PROFILE.totalFileBytes
    || !same(prefixBytes, TREE_PROFILE.prefixBytes)
    || sha256(BufferFrom(canonicalizeStrict(entries), "utf8"))
      !== TREE_CANONICAL_SHA256
    || files.some((entry) => /(^|\/)(licen[cs]e|copying)(\.|$)/iu.test(entry.path))) {
    fail("TREE_PROFILE_INVALID");
  }
  for (const expected of FILES) {
    const actual = files.find((entry) => entry.path === expected.path);
    if (actual?.size !== expected.size || actual?.lfsSize !== expected.size
      || !/^[a-f0-9]{40}$/u.test(actual?.oid ?? "")
      || !/^[a-f0-9]{64}$/u.test(actual?.lfsOid ?? "")
      || !/^[a-f0-9]{64}$/u.test(actual?.xetHash ?? "")) {
      fail("PARQUET_TREE_PIN_INVALID", expected.path);
    }
  }
  return { entries, prefixBytes };
}

function verifyReadme(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (!text.includes("This dataset contains the 5017 trajectories")
    || !text.includes("we fine-tuned Qwen 2.5 Coder Instruct on")
    || !text.includes("no verifiers or multiple rollouts, just 1 attempt per instance")
    || !text.includes("SWE-agent + Claude 3.7 Sonnet")) {
    fail("README_PROFILE_INVALID");
  }
}

function rangePath(entry, range) {
  return `ranges/${entry.path}/${String(range[0]).padStart(12, "0")}-${
    String(range[1]).padStart(12, "0")}.bin`;
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/swe-smith-cross-format-group-source-manifest/v1",
    datasetId: SWE_SMITH_CROSS_FORMAT_DATASET_ID,
    revision: SWE_SMITH_CROSS_FORMAT_REVISION,
    groupKey: "traj_id", selectedLogicalGroups: 2,
    physicalParquetPathsClosed: FILES.length,
    exactSourceRangeBytes: RANGE_SOURCE_BYTES,
    entries: ordered, sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const expected = [
    ...METADATA_FILES.map((file) => `metadata/${file}`),
    ...SUPPORT.map((item) => `files/${item.path}`),
    ...FILES.flatMap((entry) => entry.ranges.map((range) => rangePath(entry, range))),
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  const entries = [];
  const metadata = new Map();
  for (const file of METADATA_FILES) {
    const bytes = readRegular(root, `metadata/${file}`, MAX_METADATA_BYTES);
    metadata.set(file, bytes);
    entries.push({ path: `metadata/${file}`, bytes: bytes.length,
      sha256: sha256(bytes) });
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
      fail("SUPPORT_PIN_INVALID", item.path);
    }
    if (item.path === "README.md") verifyReadme(bytes);
    entries.push({ path: `files/${item.path}`, bytes: bytes.length,
      sha256: item.sha256 });
  }
  let rangeBytes = 0;
  for (const entry of FILES) {
    let previousEnd = -1;
    for (const range of entry.ranges) {
      const exact = range[1] - range[0] + 1;
      if (range[0] <= previousEnd || range[0] < 0 || range[1] >= entry.size
        || exact < 1 || exact > MAX_RANGE_BYTES) {
        fail("RANGE_PLAN_INVALID", entry.path);
      }
      previousEnd = range[1];
      const relative = rangePath(entry, range);
      const measured = hashRegular(root, relative, MAX_RANGE_BYTES, exact);
      rangeBytes += measured.bytes;
      entries.push({ path: relative, ...measured });
    }
  }
  if (rangeBytes !== RANGE_SOURCE_BYTES
    || rangeBytes > ACQUISITION_BUDGET_BYTES) fail("RANGE_BUDGET_INVALID");
  return { root, entries, record: recordBefore, tree: treeBefore };
}

export function createSweSmithCrossFormatSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import hashlib, io, json, pathlib, re, sys
import pyarrow as pa
import pyarrow.parquet as pq

root = pathlib.Path(sys.argv[1])
files = json.loads(sys.argv[2])
selected = json.loads(sys.argv[3])
required = {'messages','instance_id','resolved','model','traj_id','patch'}

def die(code):
    raise RuntimeError('SWE_SMITH_CROSS_FORMAT_PYTHON_' + code)

def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()

def range_name(start, end):
    return str(start).zfill(12) + '-' + str(end).zfill(12) + '.bin'

class RangeReader(io.RawIOBase):
    def __init__(self, entry):
        self.entry = entry
        self.size = entry['size']
        self.position = 0
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
    def interval(self, position):
        for start, end in self.entry['ranges']:
            if start <= position <= end: return start, end
        die('UNACQUIRED_RANGE_REQUESTED_' + self.entry['path'] + '_' + str(position))
    def readinto(self, buffer):
        length = min(len(buffer), max(0, self.size - self.position))
        target = memoryview(buffer)
        completed = 0
        while completed < length:
            start, end = self.interval(self.position)
            key = (start, end)
            if key not in self.cache:
                source = root / 'ranges' / self.entry['path'] / range_name(start, end)
                data = source.read_bytes()
                if len(data) != end - start + 1: die('RANGE_SIZE_INVALID')
                self.cache[key] = data
            data = self.cache[key]
            within = self.position - start
            take = min(length - completed, len(data) - within)
            if take <= 0: die('RANGE_READ_INVALID')
            target[completed:completed + take] = data[within:within + take]
            self.position += take
            completed += take
        return length

def parquet_for(entry):
    return pq.ParquetFile(pa.PythonFile(RangeReader(entry)))

file_hashes = {}
format_sets = {name:set() for name in ('ticks','tool','train','xml')}
format_rows = {name:0 for name in format_sets}
file_profiles = []
for entry in files:
    match = re.fullmatch(r'data/(ticks|tool|train|xml)-[0-9]{5}-of-00008[.]parquet', entry['path'])
    if match is None: die('PHYSICAL_PATH_INVALID')
    representation = match.group(1)
    parquet = parquet_for(entry)
    if (parquet.metadata.num_rows != entry['rows']
            or parquet.metadata.num_row_groups != entry['rowGroups']
            or set(parquet.schema_arrow.names) != required):
        die('PARQUET_PROFILE_INVALID_' + entry['path'])
    table = parquet.read(columns=['traj_id'])
    if table.column('traj_id').null_count != 0: die('TRAJ_ID_NULL')
    values = table.column('traj_id').to_pylist()
    if any(not isinstance(value, str) or not value for value in values):
        die('TRAJ_ID_INVALID')
    hashes = [digest(value) for value in values]
    file_hashes[entry['path']] = hashes
    format_sets[representation].update(hashes)
    format_rows[representation] += len(hashes)
    file_profiles.append({'path':entry['path'],'rows':len(hashes),
                          'distinctTrajIds':len(set(hashes)),
                          'duplicateTrajIdRows':len(hashes)-len(set(hashes)),
                          'rowGroups':parquet.metadata.num_row_groups})

if format_rows != {'ticks':25826,'tool':24100,'train':26076,'xml':26076}:
    die('PHYSICAL_ROW_COUNTS_INVALID')
tool4 = set(file_hashes['data/tool-00004-of-00008.parquet'])
profile = {'toolOnly':0,'toolTicks':0,'toolXmlAndLegacyTrain':0,'other':0}
for identity in tool4:
    membership = tuple(name for name in ('ticks','xml','train')
                       if identity in format_sets[name])
    if membership == (): profile['toolOnly'] += 1
    elif membership == ('ticks',): profile['toolTicks'] += 1
    elif membership == ('xml','train'):
        profile['toolXmlAndLegacyTrain'] += 1
    else: profile['other'] += 1
if profile != {'toolOnly':197,'toolTicks':588,
               'toolXmlAndLegacyTrain':2227,'other':0}:
    die('TOOL4_CROSS_FORMAT_PROFILE_INVALID')

occurrences = {item['trajectoryHash'][7:]:[] for item in selected}
for pathname, hashes in file_hashes.items():
    for row, identity in enumerate(hashes):
        if identity in occurrences:
            occurrences[identity].append({'path':pathname,'rowIndex':row})

expected_occurrences = {
 selected[0]['trajectoryHash'][7:]:[
   {'path':'data/ticks-00002-of-00008.parquet','rowIndex':selected[0]['ticksRow']},
   {'path':'data/tool-00004-of-00008.parquet','rowIndex':selected[0]['toolRow']}],
 selected[1]['trajectoryHash'][7:]:[
   {'path':'data/ticks-00002-of-00008.parquet','rowIndex':selected[1]['ticksRow']},
   {'path':'data/tool-00004-of-00008.parquet','rowIndex':selected[1]['toolRow']}],
}
if occurrences != expected_occurrences: die('SELECTED_CLOSURE_INVALID')

physical = []
for pathname, row_group in [
    ('data/ticks-00002-of-00008.parquet',1),
    ('data/tool-00004-of-00008.parquet',0)]:
    entry = next(item for item in files if item['path'] == pathname)
    parquet = parquet_for(entry)
    table = parquet.read_row_group(row_group)
    data = table.to_pydict()
    first = sum(parquet.metadata.row_group(index).num_rows
                for index in range(row_group))
    for local, trajectory in enumerate(data['traj_id']):
        identity = digest(trajectory)
        if identity not in occurrences: continue
        for field in ('messages','instance_id','model','traj_id','patch'):
            if not isinstance(data[field][local], str): die('RAW_ROW_FIELD_INVALID')
        physical.append({
          'trajectoryHash':'sha256:' + identity,
          'instanceHash':'sha256:' + digest(data['instance_id'][local]),
          'publisherOutcome':'resolved' if data['resolved'][local] else 'unresolved',
          'model':data['model'][local], 'path':pathname,
          'rowIndex':first + local,
        })

groups = []
for expected in selected:
    rows = sorted((row for row in physical
                   if row['trajectoryHash'] == expected['trajectoryHash']),
                  key=lambda row: row['path'])
    if (len(rows) != 2
            or any(row['instanceHash'] != expected['instanceHash'] for row in rows)
            or any(row['publisherOutcome'] != expected['publisherOutcome'] for row in rows)
            or any(row['model'] != 'claude-3-5-sonnet-20241022' for row in rows)):
        die('SELECTED_ROW_CONTENT_INVALID')
    groups.append({
      'trajectoryHash':expected['trajectoryHash'],
      'instanceHash':expected['instanceHash'],
      'publisherOutcome':expected['publisherOutcome'],
      'model':'claude-3-5-sonnet-20241022',
      'physicalRepresentations':[
        {'format':row['path'].split('/')[1].split('-')[0],
         'path':row['path'],'rowIndex':row['rowIndex']} for row in rows],
    })
groups.sort(key=lambda item:item['trajectoryHash'])

configured_union = format_sets['ticks'] | format_sets['tool'] | format_sets['xml']
all_union = configured_union | format_sets['train']
cross = {
 'physicalRowsByRepresentation':format_rows,
 'distinctTrajIdsByRepresentation':{name:len(format_sets[name]) for name in format_sets},
 'toolTicksIntersection':len(format_sets['tool'] & format_sets['ticks']),
 'toolXmlIntersection':len(format_sets['tool'] & format_sets['xml']),
 'ticksXmlIntersection':len(format_sets['ticks'] & format_sets['xml']),
 'configuredTripleIntersection':len(format_sets['tool'] & format_sets['ticks'] & format_sets['xml']),
 'configuredDistinctTrajIds':len(configured_union),
 'allPhysicalDistinctTrajIds':len(all_union),
 'legacyTrainEqualsXmlTrajIds':format_sets['train'] == format_sets['xml'],
 'toolShard4Profile':profile,
}
shape = hashlib.sha256(json.dumps(groups,sort_keys=True,separators=(',',':')).encode()).hexdigest()
print(json.dumps({
 'fileProfiles':file_profiles,
 'crossFormat':cross,
 'selectedLogicalGroups':groups,
 'selectedLogicalGroupCount':len(groups),
 'selectedPhysicalRepresentationRows':len(physical),
 'selectedPublisherOutcomes':{'resolved':1,'unresolved':1},
 'sameInstanceContrast':False,
 'selectedGroupClosureAcrossAllPhysicalParquetPaths':True,
 'selectedGroupShapeRoot':'sha256:' + shape,
 'rawMessagesPatchesProjected':False,
},sort_keys=True,separators=(',',':')))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_SWE_SMITH_CROSS_FORMAT_PYTHON
    ?? ".venv/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root,
    JSON.stringify(FILES), JSON.stringify(SELECTED)], {
    encoding: "utf8", timeout: 300_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim()
      ?? result.status);
  }
  let value;
  try { value = JSONParse(result.stdout); }
  catch { fail("REPLAY_OUTPUT_INVALID"); }
  if (value.selectedLogicalGroupCount !== 2
    || value.selectedPhysicalRepresentationRows !== 4
    || value.fileProfiles?.length !== 32
    || value.selectedGroupClosureAcrossAllPhysicalParquetPaths !== true) {
    fail("REPLAY_PROFILE_INVALID");
  }
  return deepFreeze(value);
}

export function buildSweSmithCrossFormatArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  if (sourceManifest.sourceManifestHash !== EXPECTED_SOURCE_MANIFEST_HASH) {
    fail("SOURCE_MANIFEST_PIN_INVALID", sourceManifest.sourceManifestHash);
  }
  const stored = readRegular(collected.root, "source-manifest.json",
    MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: SWE_SMITH_CROSS_FORMAT_GROUP_SCHEMA,
    disposition: SWE_SMITH_CROSS_FORMAT_DISPOSITION,
    source: {
      datasetId: SWE_SMITH_CROSS_FORMAT_DATASET_ID,
      revision: SWE_SMITH_CROSS_FORMAT_REVISION,
      lastModified: collected.record.lastModified,
      public: true, gated: false,
      fullFixedRevisionTreeEntries: TREE_PROFILE.entries,
      fullFixedRevisionFiles: TREE_PROFILE.files,
      fullFixedRevisionParquetFiles: TREE_PROFILE.parquetFiles,
      fullFixedRevisionFileBytes: TREE_PROFILE.totalFileBytes,
      fixedTreeApiPages: 1, fixedTreeApiPageLimit: 1_000,
      fixedTreeApiPageReturnedEntries: TREE_PROFILE.entries,
      paginationTerminatedBelowLimit: true,
      fixedRevisionRecordUsedStorageBytes: collected.record.usedStorage,
      fullTreeInventoried: true, fullRepositoryPayloadAcquired: false,
      exactTrajIdColumnCensusAllPhysicalParquetPaths: true,
      selectedCompleteRowGroupsAcquired: true,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
      materialRecordAndTreeStateStable: true,
    },
    representationInventory: {
      configuredPhysicalPaths: ["data/ticks-*", "data/tool-*", "data/xml-*"],
      legacyUnconfiguredPhysicalPath: "data/train-*",
      physicalFilesPerRepresentation: 8,
      fixedTreeBytesByRepresentation: TREE_PROFILE.prefixBytes,
      cardPublishedRows: collected.record.splitRows,
      readmeFineTuningTrajectoryClaim: 5_017,
      rowCountsDescribeOverlappingRepresentations: true,
      configuredPhysicalRowCountsAddableAsLogicalDenominator: false,
      legacyTrainRowsAddableToConfiguredRows: false,
      directLoadDatasetLogicalDenominatorTrusted: false,
    },
    selection: {
      sourceNativeGroupKey: "traj_id",
      selectedLogicalGroups: 2,
      selectedPhysicalRepresentationRows: 4,
      selectedFormats: ["ticks", "tool"],
      selectedPhysicalPaths: [
        "data/ticks-00002-of-00008.parquet",
        "data/tool-00004-of-00008.parquet",
      ],
      physicalParquetPathsClosed: FILES.length,
      exactSourceRangeBytes: RANGE_SOURCE_BYTES,
      acquisitionBudgetBytes: ACQUISITION_BUDGET_BYTES,
      withinAcquisitionBudget: true,
      completeAcrossFixedRevisionPhysicalParquetPaths: true,
      sameTaskMixedOutcomeContrast: false,
      chronologicalRetryGroup: false,
      representativenessEstablished: false,
      sourceUniverseExhaustedForTrajIdCensus: true,
      sourceUniverseExhaustedForRawTrajectoryPayloads: false,
    },
    replay: { ...replay,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")) },
    denominators: {
      PUBLISHER_CONFIGURED_TOOL_PHYSICAL_ROWS: 24_100,
      PUBLISHER_CONFIGURED_XML_PHYSICAL_ROWS: 26_076,
      PUBLISHER_CONFIGURED_TICKS_PHYSICAL_ROWS: 25_826,
      LEGACY_UNCONFIGURED_TRAIN_PHYSICAL_ROWS: 26_076,
      FIXED_REVISION_CONFIGURED_DISTINCT_TRAJ_IDS:
        replay.crossFormat.configuredDistinctTrajIds,
      FIXED_REVISION_ALL_PHYSICAL_DISTINCT_TRAJ_IDS:
        replay.crossFormat.allPhysicalDistinctTrajIds,
      SELECTED_LOGICAL_TRAJ_ID_GROUPS: 2,
      selectedPhysicalRepresentationRows: 4,
      configuredPhysicalRowsArithmeticOnly: 76_002,
      configuredPhysicalRowsAreLogicalDenominator: false,
      legacyTrainRowsAreAdditionalLogicalTrajectories: false,
      crossRepresentationAdditionProhibited: true,
    },
    outcome: {
      selectedPublisherOutcomes: { resolved: 1, unresolved: 1 },
      publisherHarnessOutcomeLogicalRows: 2,
      duplicatePhysicalOutcomeRepresentationRows: 4,
      outcomeDeduplicatedByTrajId: true,
      publisherResolutionIndependentlyRerun: false,
      publisherHarnessIndependentOfActingAgent: false,
      chronologicalRetryOrderEstablished: false,
      sameTaskContrastEstablished: false,
      recoveryEpisodeRows: 0, independentOutcomeRows: 0,
      realWorldOutcomeRows: 0, longitudinalOutcomeRows: 0,
    },
    rights: {
      datasetCardLicenseClaim: "MIT",
      datasetLicenseFilePresent: false,
      rowLevelLicenseFieldPresent: false,
      everySelectedRowLicenseIndependentlyVerifiedPermissive: false,
      publisherFineTuningClaimPresent: true,
      useSpecificTrainingAuthorizationEstablished: false,
      legalConclusionEstablished: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      rawMessagesPresentBySchema: true, rawPatchesPresentBySchema: true,
      rawSourceRangesPrivate: true, noPiiGuaranteed: false,
      rawTrajectoryProjectionRows: 0,
      projectedIdentityFieldsAreOneWaySha256: true,
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

export function createSweSmithCrossFormatReceipt(
  report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: SWE_SMITH_CROSS_FORMAT_GROUP_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: SWE_SMITH_CROSS_FORMAT_DISPOSITION,
    selectedLogicalGroups: 2, publisherOutcomeRows: 2,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    authorizedTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, authorityRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifySweSmithCrossFormatArtifactDirectory(directory, options = {}) {
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
    const built = buildSweSmithCrossFormatArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createSweSmithCrossFormatReceipt(
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

export function serializeSweSmithCrossFormatArtifact(value) {
  return serialize(value);
}

export const SWE_SMITH_CROSS_FORMAT_RANGE_PLAN = FILES;
