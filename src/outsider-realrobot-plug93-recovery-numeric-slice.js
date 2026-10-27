/*
 * Fixed-revision, range-closed non-image replay of the publisher-declared
 * recovery group in tliangucl/realrobot-plug93-recovery-v2.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const PLUG93_RECOVERY_SCHEMA =
  "outsider/realrobot-plug93-recovery-numeric-slice/v1";
export const PLUG93_RECOVERY_RECEIPT_SCHEMA =
  "outsider/realrobot-plug93-recovery-numeric-slice-receipt/v1";
export const PLUG93_RECOVERY_DATASET_ID =
  "tliangucl/realrobot-plug93-recovery-v2";
export const PLUG93_RECOVERY_REVISION =
  "006a8160e4bcf8f39952597a064606086576146c";
export const PLUG93_RECOVERY_SCOPE =
  "COMPLETE_PINNED_PUBLISHER_DECLARED_RECOVERY_GROUP_NON_IMAGE_COLUMNS";
export const PLUG93_RECOVERY_DISPOSITION = "QUARANTINE_EVAL_ONLY";

const REPORT_DOMAIN = `${PLUG93_RECOVERY_SCHEMA}/report`;
const RECEIPT_DOMAIN = `${PLUG93_RECOVERY_RECEIPT_SCHEMA}/receipt`;
const MANIFEST_DOMAIN = `${PLUG93_RECOVERY_SCHEMA}/source-manifest`;
const SOURCE_ROOT_DOMAIN = `${PLUG93_RECOVERY_SCHEMA}/source-root`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const SUPPORT_PATHS = Object.freeze([
  ".gitattributes", "README.md",
  "meta/episodes/chunk-000/file-000.parquet", "meta/info.json",
  "meta/realrobot_conversion.json", "meta/stats.json",
  "meta/tasks.parquet", "meta/training_sample_mask.json",
]);

const RANGE_ROWS = Object.freeze([
  [76, 2_141_820_162, 2_542, 5_714, 227_295, 2_137_468_186,
    "c751bfa250a9fc194d08bc4d6da97ce9c679922f",
    "92ce0da48a9024915ddf395263f8b1f5682267f806d1d7e94e1f2b5879c69163",
    "ccafd1c1fab58078b9364c17236ea7cb17127c1cebecb0adbd35dea2e4e2b3a5"],
  [77, 1_529_618_820, 1_837, 5_714, 163_947, 1_526_301_315,
    "dd6fe6ad436fa33b663d941841abbc4ee51810c4",
    "95a3a2d7be1983590ad2c2607bbee7f7bf244c77b83b18412d747f4fb68e45aa",
    "a2de108ebeb8d76eaa75f6babb9a66945f27cca50dc5a8c958de9c919b0179b4"],
  [78, 1_641_430_514, 1_982, 5_714, 173_191, 1_637_901_551,
    "21026cf7d59578786918074397bbbfe25aa3b723",
    "34cddb7d2b5f4e23ef4891d7120132242730abb3b63244f97ba177ebdb5d662f",
    "9affee3627c8587e51d477ec24f1e0d788e8ab716c3fcca47c5446e30fa0c115"],
  [79, 1_267_140_142, 1_491, 5_710, 132_749, 1_264_326_362,
    "621a59ef22a9b2ed66f27850786ba96cd3b2c480",
    "cda1bbbf3a529daaa960a8bbb2bddbe3eb45247e782256646385e06a970fb5f6",
    "ec483e2f626547a48684063d10fee7210c2f3162a12581140f5d7d332e3454af"],
  [80, 1_707_099_479, 2_034, 5_714, 184_331, 1_703_494_037,
    "86d10aaab4ef3324946547442ede2d276eeadeff",
    "fa3202be30351015c5b9ea16dbeee74c061fa79577ba157174e49e845ba8bc45",
    "10493e12d116dcbb49b69a241caccf870656f79caa0d07ed06549aacaf62a04f"],
  [81, 1_325_165_728, 1_601, 5_714, 141_931, 1_322_193_903,
    "5f7372256d05c24e6717bda8902e4e9e56101509",
    "3cd5656738eeb2c31d5a913acc85efb82b4f72a397ff1c27306efef223e7974f",
    "6bd0f416d9ca687c2e98a843fab00aee71a2a3411ca821610c948ae3163816af"],
  [82, 1_409_816_439, 1_668, 5_714, 149_012, 1_406_745_540,
    "4ebf832524235757a45fc69e21a8dab000f93e4b",
    "bf34399d34af27d4922edc47ef3e4a4bf7da3c40baea2fbebcbd7dfab2feef43",
    "afe512190ab52e26ec4ff8cc688ec81da2f7ea82926c5091fc1f833cc4fcbc7f"],
  [83, 1_253_701_833, 1_498, 5_710, 134_637, 1_250_879_519,
    "702d0329f00f0db78eb3d5079773386f08b002c0",
    "ec3d2947d3b24164eebd3e1fcd1025016a8e8fc41275ac68f09e82baf42591e9",
    "ef7ad8e88d7963b2b3139c187ae0523e17760d11d3d2a5d0b3cb1b8e3bec96a4"],
  [84, 1_468_422_007, 1_700, 5_714, 151_857, 1_465_304_539,
    "b71a5c0316720c41c899c7b060624801f18add9b",
    "10c4c6555af569b66336b7a40c597f5d2b75926b5299dadaa92b90721d1221c1",
    "a746001e13789673949373e900ba801c0750308cea5f3f2f35c7a687c2d1c1b4"],
  [85, 1_381_221_038, 1_637, 5_714, 147_159, 1_378_196_862,
    "9e70298281907a5cf6e3c8eceb36944ad8e0f6c7",
    "3826a2b89ebb4291bb137d4c4e8b8803ab4703f530a7cfac9f1d4c00a903ec2c",
    "4b1e785e4a65e6218f7be1d0fc47fb6cc29f13e624840c5db647ebb080de9568"],
  [86, 1_535_206_850, 1_814, 5_714, 162_494, 1_531_923_297,
    "b23311aa1ada123b3c49865624a01c2a722e0591",
    "96f9d821179683fa74c5c765633da2e0ce21c04a6b4dbb0ad78e9a0fd2695074",
    "636016766fd055916016059921bcf185dc383ae39aa25affb6d60d6572b52277"],
  [87, 1_542_165_738, 1_845, 5_714, 164_919, 1_538_834_741,
    "ff42c5c45ce26a6627b22471ece0b7c0597b0c33",
    "0cfd0299b5da971aaad7464d03945982e4615e7ecb9cb776bd54d2ab7e5d90e9",
    "88cb53ffa1e34b370a56d07ecdc44ca7c70f1eac8615afafcc45c7c0485d3c97"],
  [88, 1_419_041_421, 1_714, 5_714, 154_300, 1_415_903_054,
    "3596111c5fc4ed31ba078fa697f57a8a243ca938",
    "6ae43bba49634e1a2a44023ee8f0dc87ce80ead8d68687e8c8ac62f5ce30e8f2",
    "16a0b0cc91d90e34e71cb834e78d1a0a8fa2fee92d0d6cb954c8b20406a56c70"],
  [89, 1_428_711_028, 1_729, 5_714, 154_792, 1_425_550_344,
    "26a8bab97c0b1113668444c2b4ad4207c4602b8a",
    "2f3838b7cec419e4a133d9cb9a9e2622e9d57458bbbd674ee8b7db523bc30e3e",
    "d8c71ad85589826197ec274116a2070847f323eeffd64f45f2a5bdfcea0a97db"],
  [90, 1_492_251_356, 1_771, 5_714, 159_289, 1_489_030_648,
    "97d8f70e25a5cd7b2d940cd18bc983b057e4daca",
    "bb36d5456e5dec04f281cdc3c58c4a1e51c86d982b7e34ae393c30508fc3840c",
    "8a1c5ccfd5466883c2ac3f7f597472d8d9166c88427c3bd9da1288edd0ed8a1a"],
  [91, 1_469_685_278, 1_779, 5_714, 158_916, 1_466_451_029,
    "e110469ea0a71c5833efb50431c2a1060f6092a4",
    "3660ff1688b0e579948c455fb74e67d7c90a98b83223dc7bab14b4eb9fd2e89a",
    "f2dbcb3a32f3e031a40ff51d814af15183fa367ef95fd188dd488f27caad6cae"],
  [92, 1_564_897_190, 1_870, 5_714, 167_204, 1_561_529_848,
    "f6105cec86ea9b5b96f4622fccf4b0599fd9b9a5",
    "58d7338e1c32cfd308f8fbf19d120732d3a8271b0336a2feaf74551fbb188ecc",
    "6bd8cf8cffd50f264050410997258bea223ed1e514abc75bf6a8a7423d5b1441"],
]);

function planEntry(row) {
  const [episode, fileBytes, rows, footerLength, range1EndExclusive,
    range2Start, gitOid, lfsOid, xetHash] = row;
  const pathValue = `data/chunk-000/file-${String(episode).padStart(3, "0")}.parquet`;
  const selectedRanges = [
    { index: 0, start: 0, endExclusive: range1EndExclusive,
      bytes: range1EndExclusive },
    { index: 1, start: range2Start, endExclusive: fileBytes,
      bytes: fileBytes - range2Start },
  ];
  return {
    episode, path: pathValue, fileBytes, rows, footerLength,
    gitOid, lfsOid, xetHash, range1EndExclusive, range2Start,
    selectedRanges,
    selectedBytes: selectedRanges.reduce((sum, item) => sum + item.bytes, 0),
    excludedImageRange: {
      start: range1EndExclusive, endExclusive: range2Start,
      bytes: range2Start - range1EndExclusive,
    },
  };
}

export const PLUG93_RECOVERY_RANGE_PLAN = deepFreeze({
  schema: "outsider/realrobot-plug93-recovery-range-plan/v1",
  datasetId: PLUG93_RECOVERY_DATASET_ID,
  revision: PLUG93_RECOVERY_REVISION,
  selectedTopLevelColumns: ["observation.state", "action",
    "observation.tactile.force_grid", "timestamp", "frame_index",
    "episode_index", "index", "task_index"],
  excludedTopLevelColumns: ["observation.images.camera1",
    "observation.images.camera2"],
  files: RANGE_ROWS.map(planEntry),
  selectedFiles: 17, fragmentObjects: 34,
  selectedRows: 30_512, selectedRangeBytes: 58_088_271,
  selectedWholeFileBytes: 25_577_395_023,
  excludedImageChunkBytes: 25_519_306_752,
  footerBytes: 97_266,
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `PLUG93_RECOVERY_${code}`
    : `PLUG93_RECOVERY_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes).digest("hex");
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
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, siblings: value.siblings?.length,
    cardLicense: value.cardData?.license ?? null,
    tagLicenses: (value.tags ?? []).filter((item) => item.startsWith("license:")),
  };
  if (!same(projection, {
    id: PLUG93_RECOVERY_DATASET_ID, author: "tliangucl",
    sha: PLUG93_RECOVERY_REVISION,
    lastModified: "2026-08-19T22:06:37.000Z",
    private: false, gated: false, disabled: false,
    usedStorage: 82_358_104_597, siblings: 101,
    cardLicense: null, tagLicenses: [],
  })) fail("RECORD_PROFILE_INVALID");
  return projection;
}

function stableTree(entries) {
  return entries.map((entry) => ({
    type: entry.type, oid: entry.oid, size: entry.size, path: entry.path,
    lfs: entry.lfs ? { oid: entry.lfs.oid, size: entry.lfs.size,
      pointerSize: entry.lfs.pointerSize } : null,
    xetHash: entry.xetHash ?? null,
  }));
}

function validateTreePages(page1Bytes, page2Bytes) {
  const page1 = parseJson(page1Bytes, "TREE_PAGE1_JSON_INVALID");
  const page2 = parseJson(page2Bytes, "TREE_PAGE2_JSON_INVALID");
  const entries = [...page1, ...page2];
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const dataFiles = files.filter((entry) =>
    /^data\/chunk-000\/file-\d{3}\.parquet$/u.test(entry.path));
  const support = files.filter((entry) => !entry.path.startsWith("data/"));
  const licenses = files.filter((entry) =>
    /(^|\/)licen[sc]e(?:\.|$)/iu.test(entry.path));
  if (!Array.isArray(page1) || !Array.isArray(page2)
    || page1.length !== 100 || page2.length !== 6
    || entries.length !== 106 || files.length !== 101 || directories.length !== 5
    || new Set(entries.map((entry) => entry.path)).size !== 106
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 82_358_405_909
    || dataFiles.length !== 93
    || dataFiles.reduce((sum, entry) => sum + entry.size, 0) !== 82_357_803_531
    || Math.min(...dataFiles.map((entry) => entry.size)) !== 550_412_782
    || Math.max(...dataFiles.map((entry) => entry.size)) !== 2_141_820_162
    || support.length !== 8
    || support.reduce((sum, entry) => sum + entry.size, 0) !== 602_378
    || !same(sorted(support.map((entry) => entry.path)), sorted(SUPPORT_PATHS))
    || licenses.length !== 0) fail("TREE_PROFILE_INVALID");
  for (const item of PLUG93_RECOVERY_RANGE_PLAN.files) {
    const entry = dataFiles.find((candidate) => candidate.path === item.path);
    if (!entry || entry.size !== item.fileBytes || entry.oid !== item.gitOid
      || entry.lfs?.oid !== item.lfsOid || entry.lfs?.size !== item.fileBytes
      || entry.xetHash !== item.xetHash) fail("RANGE_PLAN_TREE_JOIN_INVALID", item.path);
  }
  return { page1, page2, entries, files, directories, dataFiles, support };
}

function validateReadme(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  for (const phrase of ["Franka real-robot plug D93 recovery-v2",
    "93 episodes", "104,310 frames", "97,717 valid training centers",
    "image-in-Parquet storage", "two RGB cameras", "GelSight force grid",
    "11-D state", "7-D delta action", "training_sample_mask.json",
    "realrobot_conversion.json", "`episode_15_mix.h5` is excluded"]) {
    if (!text.includes(phrase)) fail("README_PROFILE_INVALID");
  }
}

function fragmentRelative(item, range) {
  const end = range.endExclusive - 1;
  return `ranges/file-${String(item.episode).padStart(3, "0")}/range-${String(range.start)
    .padStart(12, "0")}-${String(end).padStart(12, "0")}.bin`;
}

function validateRangeAcquisition(root, contents, descriptors) {
  const value = parseJson(contents, "RANGE_ACQUISITION_JSON_INVALID");
  if (value.schema !== "outsider/realrobot-plug93-range-acquisition/v1"
    || !Array.isArray(value.records) || value.records.length !== 34) {
    fail("RANGE_ACQUISITION_PROFILE_INVALID");
  }
  const records = [...value.records].sort((left, right) =>
    left.episode - right.episode || left.rangeIndex - right.rangeIndex);
  let selectedBytes = 0;
  for (const item of PLUG93_RECOVERY_RANGE_PLAN.files) {
    for (const range of item.selectedRanges) {
      const record = records.find((candidate) => candidate.episode === item.episode
        && candidate.rangeIndex === range.index);
      const end = range.endExclusive - 1;
      if (!record || !same({
        episode: record.episode, path: record.path,
        fileBytes: record.fileBytes, lfsOid: record.lfsOid,
        rangeIndex: record.rangeIndex, start: record.start,
        endInclusive: record.endInclusive, bytes: record.bytes,
        status: record.status, contentRange: record.contentRange,
        contentLength: record.contentLength,
      }, {
        episode: item.episode, path: item.path,
        fileBytes: item.fileBytes, lfsOid: item.lfsOid,
        rangeIndex: range.index, start: range.start,
        endInclusive: end, bytes: range.bytes,
        status: 206,
        contentRange: `bytes ${range.start}-${end}/${item.fileBytes}`,
        contentLength: range.bytes,
      }) || !HASH.test(record.sha256 ?? "")) {
        fail("RANGE_ACQUISITION_RECORD_INVALID", `${item.episode}:${range.index}`);
      }
      const inspected = inspectRegular(root, fragmentRelative(item, range),
        range.bytes, record.sha256);
      descriptors.push(inspected);
      selectedBytes += range.bytes;
    }
  }
  if (selectedBytes !== 58_088_271) fail("RANGE_BYTES_INVALID");
  return { records, selectedBytes };
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const bracketNames = ["hf-record", "hf-tree-page1", "hf-tree-page2"];
  const bracket = {};
  for (const name of bracketNames) {
    bracket[`${name}-before`] = readSmall(root,
      `metadata/${name}-before.json`);
    bracket[`${name}-after`] = readSmall(root,
      `metadata/${name}-after.json`);
  }
  const recordBefore = validateRecord(bracket["hf-record-before"].contents);
  const recordAfter = validateRecord(bracket["hf-record-after"].contents);
  if (!same(recordBefore, recordAfter)) fail("RECORD_PROJECTION_CHANGED");
  const treeBefore = validateTreePages(
    bracket["hf-tree-page1-before"].contents,
    bracket["hf-tree-page2-before"].contents);
  const treeAfter = validateTreePages(
    bracket["hf-tree-page1-after"].contents,
    bracket["hf-tree-page2-after"].contents);
  if (!same(stableTree(treeBefore.entries), stableTree(treeAfter.entries))) {
    fail("TREE_STABLE_PROJECTION_CHANGED");
  }
  const descriptors = Object.values(bracket).map(
    ({ path: itemPath, bytes, sha256: itemSha }) =>
      ({ path: itemPath, bytes, sha256: itemSha }));
  for (const entry of treeBefore.support) {
    const relative = `files/${entry.path}`;
    const expectedSha = entry.lfs?.oid ? `sha256:${entry.lfs.oid}` : null;
    const inspected = inspectRegular(root, relative, entry.size, expectedSha);
    const bytes = readFileSync(checkedPath(root, relative));
    if (!entry.lfs && gitBlobOid(bytes) !== entry.oid) {
      fail("SUPPORT_GIT_OID_INVALID", entry.path);
    }
    if (entry.path === "README.md") validateReadme(bytes);
    descriptors.push(inspected);
  }
  const planFile = readSmall(root, "range-plan.json");
  if (!planFile.contents.equals(serialize(PLUG93_RECOVERY_RANGE_PLAN))) {
    fail("RANGE_PLAN_FILE_INVALID");
  }
  descriptors.push({ path: planFile.path, bytes: planFile.bytes,
    sha256: planFile.sha256 });
  const rangeFile = readSmall(root, "range-acquisition.json");
  const range = validateRangeAcquisition(root, rangeFile.contents, descriptors);
  descriptors.push({ path: rangeFile.path, bytes: rangeFile.bytes,
    sha256: rangeFile.sha256 });
  descriptors.sort((left, right) => left.path.localeCompare(right.path));
  const expected = descriptors.map((entry) => entry.path);
  if (withManifest) expected.push("source-manifest.json");
  if (!same(sorted(walk(root)), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  return {
    root, recordBefore, treeBefore, treeAfter, range, descriptors,
    recordRawBeforeAfterExact: bracket["hf-record-before"].contents.equals(
      bracket["hf-record-after"].contents),
    treePage1RawBeforeAfterExact: bracket["hf-tree-page1-before"].contents.equals(
      bracket["hf-tree-page1-after"].contents),
    treePage2RawBeforeAfterExact: bracket["hf-tree-page2-before"].contents.equals(
      bracket["hf-tree-page2-after"].contents),
  };
}

function manifestBody(collected) {
  return {
    schema: "outsider/realrobot-plug93-recovery-numeric-slice-source/v1",
    datasetId: PLUG93_RECOVERY_DATASET_ID,
    revision: PLUG93_RECOVERY_REVISION, scope: PLUG93_RECOVERY_SCOPE,
    fullTreeEntries: 106, fullTreeFiles: 101, fullTreeDirectories: 5,
    fullTreeFileBytes: 82_358_405_909,
    completeSupportFiles: 8, completeSupportBytes: 602_378,
    selectedPhysicalParquetFiles: 17,
    selectedPhysicalWholeFileBytes: 25_577_395_023,
    selectedRangeObjects: 34, selectedRangeBytes: 58_088_271,
    excludedImageChunkBytes: 25_519_306_752,
    selectedRows: 30_512, completeSelectedNonImageColumns: true,
    wholeParquetFilesAcquired: 0, wholeFileSha256Verified: 0,
    treeLfsOidClaimsPinned: 17, strict206RangeObjects: 34,
    recordStableProjectionBeforeAfterExact: true,
    treeStableProjectionBeforeAfterExact: true,
    recordRawBeforeAfterExact: collected.recordRawBeforeAfterExact,
    treePage1RawBeforeAfterExact: collected.treePage1RawBeforeAfterExact,
    treePage2RawBeforeAfterExact: collected.treePage2RawBeforeAfterExact,
    sourceObjects: collected.descriptors,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, collected.descriptors),
  };
}

export function createPlug93RecoveryRangePlan() {
  return PLUG93_RECOVERY_RANGE_PLAN;
}

export function createPlug93RecoverySourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, os, pathlib, re, struct, sys, tempfile, warnings
warnings.filterwarnings('ignore')
import numpy as np
import pyarrow.parquet as pq

root=pathlib.Path(sys.argv[1])
plan=json.loads((root/'range-plan.json').read_text(encoding='utf-8'))
conversion=json.loads((root/'files/meta/realrobot_conversion.json').read_text(encoding='utf-8'))
mask=json.loads((root/'files/meta/training_sample_mask.json').read_text(encoding='utf-8'))
info=json.loads((root/'files/meta/info.json').read_text(encoding='utf-8'))
stats=json.loads((root/'files/meta/stats.json').read_text(encoding='utf-8'))
episodes_pf=pq.ParquetFile(root/'files/meta/episodes/chunk-000/file-000.parquet')
tasks_pf=pq.ParquetFile(root/'files/meta/tasks.parquet')
episodes=episodes_pf.read().to_pylist(); tasks=tasks_pf.read().to_pylist()

def die(code): raise RuntimeError('PLUG93_RECOVERY_PYTHON_'+code)
def canonical(value): return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def sha(value): return 'sha256:'+hashlib.sha256(value).hexdigest()
def frag(item,r):
    end=r['endExclusive']-1
    return root/f"ranges/file-{item['episode']:03d}/range-{r['start']:012d}-{end:012d}.bin"
def leaves(value):
    if isinstance(value,str): yield value
    elif isinstance(value,list):
        for child in value: yield from leaves(child)
    elif isinstance(value,dict):
        for key,child in value.items():
            yield key
            yield from leaves(child)
def summary(array):
    return {name:getattr(array,name)(0).tolist() for name in ['min','max','mean','std']}

if (plan['selectedFiles']!=17 or plan['fragmentObjects']!=34
    or plan['selectedRows']!=30512 or plan['selectedRangeBytes']!=58088271
    or plan['selectedWholeFileBytes']!=25577395023
    or plan['excludedImageChunkBytes']!=25519306752
    or len(plan['files'])!=17): die('PLAN_PROFILE_INVALID')
if (episodes_pf.metadata.num_rows!=93 or episodes_pf.metadata.num_row_groups!=1
    or episodes_pf.metadata.num_columns!=109
    or sha(str(episodes_pf.schema_arrow).encode())!='sha256:b451aabc4c4d8f3c5f301e8d8c5cabc6dd653253fc2c58ba8a13d0ad1577fb80'
    or tasks_pf.metadata.num_rows!=1 or tasks_pf.metadata.num_row_groups!=1
    or sha(str(tasks_pf.schema_arrow).encode())!='sha256:37a43b274805e0b0d933cbc0d5dc703e5a74afeb91ea6ddc2d3e64b1985db823'
    or tasks!=[{'task_index':0,'__index_level_0__':'insert the plug into the power strip'}]):
    die('SUPPORT_PARQUET_PROFILE_INVALID')
if (info['robot_type']!='franka_realrobot_gelsight' or info['total_episodes']!=93
    or info['total_frames']!=104310 or info['total_tasks']!=1
    or info['fps']!=16.2132046464818 or info['splits']!={'train':'0:93'}
    or info['features']['observation.state']['shape']!=[11]
    or info['features']['action']['shape']!=[7]
    or info['features']['observation.tactile.force_grid']['shape']!=[1,10,12,3]
    or info['features']['observation.images.camera1']['shape']!=[3,512,512]
    or info['features']['observation.images.camera2']['shape']!=[3,512,910]):
    die('INFO_PROFILE_INVALID')
if (conversion['aggregation']!='D52 + clean new trajectories + 17 recovery trajectories'
    or conversion['total_source_trajectories']!=93
    or conversion['total_episodes']!=93 or conversion['total_frames']!=104310
    or conversion['source_counts']!=[{'episodes':76,'frames':73798},{'episodes':17,'frames':30512}]
    or conversion['training_valid_samples']!=97717
    or len(conversion['frames'])!=93): die('CONVERSION_PROFILE_INVALID')
if (mask['schema_version']!=3 or mask['dataset_total_frames']!=104310
    or mask['valid_sample_count']!=97717 or mask['invalid_sample_count']!=6593
    or mask['state_history_offsets']!=[-48,-43,-37,-32,-27,-21,-16,-11,-5,0]
    or mask['action_chunk']!=50 or len(mask['episodes'])!=17
    or len(mask['valid_index_ranges'])!=50): die('MASK_PROFILE_INVALID')

selected=['observation.state','action','observation.tactile.force_grid',
 'timestamp','frame_index','episode_index','index','task_index']
leaf_paths=['observation.state.list.element','action.list.element',
 'observation.images.camera1.bytes','observation.images.camera1.path',
 'observation.images.camera2.bytes','observation.images.camera2.path',
 'observation.tactile.force_grid.list.element.list.element.list.element.list.element',
 'timestamp','frame_index','episode_index','index','task_index']
all_state=[]; all_action=[]; all_tactile=[]; profiles=[]
comparison=collections.defaultdict(lambda:{'minExact':0,'maxExact':0,
 'countExact':0,'meanExact':0,'stdExact':0,'maxMeanError':0.0,'maxStdError':0.0})
global_offset=73798; max_info_fps_error=0.0; max_measured_fps_error=0.0
schema_hashes=set(); footer_bytes=0; derived_excluded=0; derived_selected=0

with tempfile.TemporaryDirectory(prefix='outsider-plug93-') as temporary:
    temporary=pathlib.Path(temporary)
    for local_index,item in enumerate(plan['files']):
        final_index=76+local_index
        if item['episode']!=final_index: die('PLAN_EPISODE_ORDER_INVALID')
        sparse=temporary/f"file-{final_index:03d}.parquet"
        with sparse.open('wb') as handle:
            handle.truncate(item['fileBytes'])
            for r in item['selectedRanges']:
                payload=frag(item,r).read_bytes()
                if len(payload)!=r['bytes']: die('FRAGMENT_SIZE_INVALID')
                handle.seek(r['start']); handle.write(payload)
        pf=pq.ParquetFile(sparse); rg=pf.metadata.row_group(0)
        schema_hash=sha(str(pf.schema_arrow).encode()); schema_hashes.add(schema_hash)
        if (pf.metadata.num_rows!=item['rows'] or pf.metadata.num_row_groups!=1
            or pf.metadata.num_columns!=12
            or schema_hash!='sha256:a360a3d48aa7bc02464967596a121805bce44933f2205770252906f53ee1b087'):
            die('PARQUET_PROFILE_INVALID')
        columns=[]
        for column_index in range(rg.num_columns):
            column=rg.column(column_index)
            start=column.dictionary_page_offset
            if start is None: start=column.data_page_offset
            columns.append({'path':column.path_in_schema,'start':start,
              'endExclusive':start+column.total_compressed_size,
              'bytes':column.total_compressed_size})
        if ([column['path'] for column in columns]!=leaf_paths
            or not all(columns[index]['endExclusive']==columns[index+1]['start']
              for index in range(11))
            or columns[1]['endExclusive']!=item['range1EndExclusive']
            or columns[2]['start']!=item['range1EndExclusive']
            or columns[6]['start']!=item['range2Start']):
            die('COLUMN_RANGE_BOUNDARY_INVALID')
        with sparse.open('rb') as handle:
            handle.seek(-8,os.SEEK_END); trailer=handle.read(8)
        footer_length=struct.unpack('<I',trailer[:4])[0]
        if (trailer[4:]!=b'PAR1' or footer_length!=item['footerLength']
            or columns[-1]['endExclusive']!=item['fileBytes']-footer_length-8):
            die('FOOTER_BOUNDARY_INVALID')
        footer_bytes+=footer_length+8
        excluded=columns[6]['start']-columns[2]['start']
        selected_bytes=columns[1]['endExclusive']+(item['fileBytes']-columns[6]['start'])
        if (excluded!=item['excludedImageRange']['bytes']
            or selected_bytes!=item['selectedBytes']):
            die('DERIVED_RANGE_SIZE_INVALID')
        derived_excluded+=excluded; derived_selected+=selected_bytes
        table=pf.read(columns=selected); n=table.num_rows
        state=np.asarray(table['observation.state'].to_pylist(),dtype='<f4')
        action=np.asarray(table['action'].to_pylist(),dtype='<f4')
        tactile=np.asarray(table['observation.tactile.force_grid'].to_pylist(),dtype='<f4')
        timestamp=np.asarray(table['timestamp'].to_numpy(zero_copy_only=False),dtype='<f4')
        frame_index=np.asarray(table['frame_index'].to_numpy(zero_copy_only=False),dtype='<i8')
        episode_index=np.asarray(table['episode_index'].to_numpy(zero_copy_only=False),dtype='<i8')
        index=np.asarray(table['index'].to_numpy(zero_copy_only=False),dtype='<i8')
        task_index=np.asarray(table['task_index'].to_numpy(zero_copy_only=False),dtype='<i8')
        if (state.shape!=(n,11) or action.shape!=(n,7)
            or tactile.shape!=(n,1,10,12,3)
            or not np.isfinite(state).all() or not np.isfinite(action).all()
            or not np.isfinite(tactile).all() or not np.isfinite(timestamp).all()):
            die('NUMERIC_SHAPE_OR_FINITE_INVALID')
        source=conversion['frames'][final_index]; episode=episodes[final_index]
        mask_episode=mask['episodes'][local_index]
        if (n!=source['frames_written'] or n!=episode['length']
            or n!=mask_episode['frames']
            or source['final_episode_index']!=final_index
            or source['source_episode_index']!=local_index
            or source['source_group']!='recovery'
            or source['source_repo_id']!='local/realrobot-plug17-recovery-v2'
            or mask_episode['final_episode_index']!=final_index
            or mask_episode['source_episode_index']!=local_index
            or episode['data/file_index']!=final_index
            or episode['dataset_from_index']!=global_offset
            or episode['dataset_to_index']!=global_offset+n
            or mask_episode['global_frame_range']!=[global_offset,global_offset+n]
            or not np.array_equal(frame_index,np.arange(n,dtype=np.int64))
            or set(episode_index.tolist())!={final_index}
            or not np.array_equal(index,np.arange(global_offset,global_offset+n,dtype=np.int64))
            or set(task_index.tolist())!={0}):
            die('EPISODE_CROSSWALK_INVALID')
        info_error=float(np.max(np.abs(timestamp-frame_index/info['fps'])))
        measured_error=float(np.max(np.abs(timestamp-frame_index/source['fps_measured'])))
        max_info_fps_error=max(max_info_fps_error,info_error)
        max_measured_fps_error=max(max_measured_fps_error,measured_error)
        arrays={'observation.state':state,'action':action,
          'observation.tactile.force_grid':tactile.reshape(-1,3),
          'timestamp':timestamp.reshape(n,1),'frame_index':frame_index.reshape(n,1),
          'episode_index':episode_index.reshape(n,1),'index':index.reshape(n,1),
          'task_index':task_index.reshape(n,1)}
        for name,array in arrays.items():
            result=comparison[name]
            shape=np.asarray(episode[f'stats/{name}/min']).shape
            actual={'min':array.min(0).reshape(shape),'max':array.max(0).reshape(shape),
              'mean':array.mean(0).reshape(shape),'std':array.std(0).reshape(shape)}
            result['minExact']+=actual['min'].tolist()==episode[f'stats/{name}/min']
            result['maxExact']+=actual['max'].tolist()==episode[f'stats/{name}/max']
            result['countExact']+=episode[f'stats/{name}/count']==[n]
            mean_error=float(np.max(np.abs(np.asarray(episode[f'stats/{name}/mean'])-actual['mean'])))
            std_error=float(np.max(np.abs(np.asarray(episode[f'stats/{name}/std'])-actual['std'])))
            result['meanExact']+=mean_error==0; result['stdExact']+=std_error==0
            result['maxMeanError']=max(result['maxMeanError'],mean_error)
            result['maxStdError']=max(result['maxStdError'],std_error)
        column_hashes={}
        for name,array in [('state',state),('action',action),('tactile',tactile),
          ('timestamp',timestamp),('frame_index',frame_index),
          ('episode_index',episode_index),('index',index),('task_index',task_index)]:
            column_hashes[name]=sha(str(array.dtype).encode()+str(array.shape).encode()+array.tobytes())
        profiles.append({'finalEpisodeIndex':final_index,
          'sourceEpisodeIndex':local_index,'rows':n,
          'globalFromIndex':global_offset,'globalToIndex':global_offset+n,
          'fpsMeasured':source['fps_measured'],'timestampMaxError':measured_error,
          'columnHashes':column_hashes})
        all_state.append(state); all_action.append(action); all_tactile.append(tactile)
        global_offset+=n

if (global_offset!=104310 or derived_excluded!=25519306752
    or derived_selected!=58088271 or footer_bytes!=97266
    or schema_hashes!={'sha256:a360a3d48aa7bc02464967596a121805bce44933f2205770252906f53ee1b087'}):
    die('AGGREGATE_RANGE_PROFILE_INVALID')
profile_root=sha(canonical(profiles).encode())
if profile_root!='sha256:ffcdac953eb50d31615c2907d0bcfd393101901eec91d3338aeadae7713e19f0':
    die('SEMANTIC_PROFILE_ROOT_INVALID')

state=np.concatenate(all_state); action=np.concatenate(all_action)
tactile=np.concatenate(all_tactile).reshape(-1,3)
mode_counts=collections.Counter(row['recovery_training_mask']['mode']
  for row in conversion['frames'][76:])
source_counts={name:sum(row['recovery_training_mask']['source_counts'].get(name,0)
  for row in conversion['frames'][76:]) for name in ['policy','manual','boundary']}
mask_sums={name:sum(row[name] for row in mask['episodes']) for name in
 ['frames','valid_samples','invalid_samples','valid_policy_samples',
  'valid_manual_samples','valid_mixed_source_samples','valid_boundary_source_samples']}
invalid_reasons={name:sum(row['invalid_reason_first_match'].get(name,0)
  for row in mask['episodes']) for name in
 sorted(set().union(*(row['invalid_reason_first_match'] for row in mask['episodes'])))}
cut_intervals=sum(len(row['recovery_training_mask']['cut_intervals'])
  for row in conversion['frames'][76:])
cut_episodes=sum(bool(row['recovery_training_mask']['cut_intervals'])
  for row in conversion['frames'][76:])
absolute_paths=[]
for document in [conversion,mask,info,stats]:
    for value in leaves(document):
        if re.search(r'(?<![A-Za-z0-9])/(?:workspace|mnt|home|Users)/',value):
            absolute_paths.append(value)

print(canonical({
 'parquet':{'files':17,'rowGroups':17,'rows':30512,'leafColumnsPerFile':12,
  'fullSchemaSha256':next(iter(schema_hashes)),'selectedTopLevelColumns':selected,
  'excludedTopLevelColumns':['observation.images.camera1','observation.images.camera2'],
  'footerBytes':footer_bytes,'rangeBoundaryReplayExactFiles':17,
  'selectedRangeBytes':derived_selected,'excludedImageChunkBytes':derived_excluded},
 'telemetry':{'rows':30512,'stateShape':list(state.shape),'actionShape':list(action.shape),
  'tactileShape':[30512,1,10,12,3],
  'nonfiniteStateValues':int((~np.isfinite(state)).sum()),
  'nonfiniteActionValues':int((~np.isfinite(action)).sum()),
  'nonfiniteTactileValues':int((~np.isfinite(tactile)).sum()),
  'stateStats':summary(state),'actionStats':summary(action),
  'tactileChannelStats':summary(tactile),'semanticProfiles':profiles,
  'semanticProfileRoot':profile_root},
 'indices':{'frameIndexExactWithinEpisode':True,
  'byteNativeEpisodeIndexNamespace':'final_dataset_76_through_92',
  'byteNativeGlobalIndexFrom':73798,'byteNativeGlobalIndexToExclusive':104310,
  'byteNativeGlobalIndexExact':True,'taskIndexValues':[0],
  'timestampMatchesInfoFpsMaxAbsoluteError':max_info_fps_error,
  'timestampMatchesPerSourceMeasuredFpsMaxAbsoluteError':max_measured_fps_error},
 'sidecar':{'comparison':dict(comparison),
  'episodeTopLevelLengthAndFileIndexCrosswalkExactRows':17,
  'maskGlobalFrameRangeCrosswalkExactRows':17,
  'conversionFrameCountCrosswalkExactRows':17,
  'nestedEpisodeAndIndexStatsUsePreAggregationNamespaceRows':17,
  'episodeIndexNamespaceOffset':76,'globalIndexNamespaceOffset':73798,
  'byteNativeValuesTakePrecedence':True,'silentNormalizationApplied':False},
 'lineage':{'publisherSourceGroup':'recovery','publisherSourceEpisodes':17,
  'publisherSourceRows':30512,'publisherModeCounts':dict(sorted(mode_counts.items())),
  'publisherActionSourceCounts':source_counts,'publisherActionSourceRows':sum(source_counts.values()),
  'publisherCutIntervals':cut_intervals,'publisherEpisodesWithCutIntervals':cut_episodes,
  'publisherSourceFilenameSuccessTokenRows':sum('succeed' in row['file'] for row in conversion['frames'][76:]),
  'publisherRecoverySourceRevision':mask['recovery_source_revision'],
  'publisherRecoverySourceRule':mask['recovery_source_rule'],
  'perRowActionSourceFieldPresent':False},
 'trainingMask':{'datasetFrames':mask['dataset_total_frames'],
  'validSamples':mask['valid_sample_count'],'invalidSamples':mask['invalid_sample_count'],
  'cleanBaseFramesImpliedValid':73798,'selectedRecovery':mask_sums,
  'invalidReasonFirstMatch':invalid_reasons,'validIndexRanges':len(mask['valid_index_ranges']),
  'publisherPipelineEligibilityIsLegalTrainingAuthorization':False},
 'support':{'episodesRows':93,'tasksRows':1,'statsFields':len(stats),
  'taskText':'insert the plug into the power strip'},
 'privacyScan':{'absoluteLocalPathOccurrences':len(absolute_paths),
  'uniqueAbsoluteLocalPaths':len(set(absolute_paths)),'independentAudit':False}
}))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable ?? process.env.OUTSIDER_PLUG93_PYTHON
    ?? "/opt/anaconda3/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 300_000, maxBuffer: 32 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", PYTHONWARNINGS: "ignore" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim()
      ?? result.status);
  }
  try { return deepFreeze(JSON.parse(result.stdout)); }
  catch { fail("REPLAY_OUTPUT_INVALID"); }
}

export function buildPlug93RecoveryArtifactFromSourceDirectory(
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
    schema: PLUG93_RECOVERY_SCHEMA,
    disposition: PLUG93_RECOVERY_DISPOSITION,
    scope: {
      kind: PLUG93_RECOVERY_SCOPE, datasetId: PLUG93_RECOVERY_DATASET_ID,
      revision: PLUG93_RECOVERY_REVISION,
      publisherDeclaredRecoveryFinalEpisodeRange: [76, 92],
      publisherDeclaredRecoveryEpisodes: 17,
      selectedRows: 30_512,
      completePublisherDeclaredRecoveryGroupNonImageColumns: true,
      cleanBaseEpisodesInventoriedButPayloadNotAcquired: 76,
      fullTreeEntries: 106, fullTreeFiles: 101, fullTreeDirectories: 5,
      fullTreeFileBytes: 82_358_405_909,
      completeSupportFiles: 8, completeSupportBytes: 602_378,
      selectedPhysicalParquetFiles: 17,
      selectedPhysicalWholeFileBytes: 25_577_395_023,
      selectedRangeObjects: 34, selectedRangeBytes: 58_088_271,
      excludedImageChunkBytes: 25_519_306_752,
      wholeParquetFilesAcquired: 0,
      wholeFileSha256Verified: 0,
      globalSourceUniverseExhausted: false,
    },
    source: {
      publicAtAcquisition: true, gatedAtAcquisition: false,
      disabledAtAcquisition: false,
      apiUsedStorageBytes: 82_358_104_597,
      recordStableProjectionBeforeAfterExact: true,
      recordResponseBeforeAfterExact: collected.recordRawBeforeAfterExact,
      treeStableProjectionBeforeAfterExact: true,
      treePage1ResponseBeforeAfterExact: collected.treePage1RawBeforeAfterExact,
      treePage2ResponseBeforeAfterExact: collected.treePage2RawBeforeAfterExact,
      treePage2RawDriftReason: collected.treePage2RawBeforeAfterExact ? null
        : "mutable_security_scan_status_only",
      treePages: 2, treePaginationComplete: true,
      treeLfsOidClaimsPinned: 17,
      lfsClaimsAreWholeFileHashesVerifiedByThisArtifact: false,
      strict206RangeResponsesVerified: 34,
      rangeContentLengthAndContentRangeVerified: 34,
      sourceManifestHash: sourceManifest.manifestHash,
      sourceManifestFileSha256: manifestFile.sha256,
      sourceRoot: sourceManifest.sourceRoot,
    },
    replay: { ...replay,
      extractorSha256: sha256(Buffer.from(PYTHON_REPLAY, "utf8")) },
    mechanics: {
      byteNativeRows: 30_512,
      stateDimensions: 11, actionDimensions: 7,
      tactileShapePerFrame: [1, 10, 12, 3],
      tactileChannelSemanticsPublisherClaim: [
        "x_gradient", "y_gradient", "deformation_response_strength"],
      stateStats: replay.telemetry.stateStats,
      actionStats: replay.telemetry.actionStats,
      tactileChannelStats: replay.telemetry.tactileChannelStats,
      nonfiniteStateValues: 0, nonfiniteActionValues: 0,
      nonfiniteTactileValues: 0,
      semanticProfileRoot: replay.telemetry.semanticProfileRoot,
    },
    lineage: {
      publisherDeclaredSourceGroup: "recovery",
      publisherDeclaredRecoveryEpisodes: 17,
      publisherDeclaredRecoveryRows: 30_512,
      publisherModeCounts: replay.lineage.publisherModeCounts,
      publisherActionSourceCounts: replay.lineage.publisherActionSourceCounts,
      publisherActionSourceRows: 30_512,
      publisherCutIntervals: replay.lineage.publisherCutIntervals,
      publisherEpisodesWithCutIntervals:
        replay.lineage.publisherEpisodesWithCutIntervals,
      publisherRecoverySourceRevision:
        replay.lineage.publisherRecoverySourceRevision,
      publisherRecoverySourceRule: replay.lineage.publisherRecoverySourceRule,
      perRowActionSourceFieldPresent: false,
      sourceFilenameSuccessTokenRows:
        replay.lineage.publisherSourceFilenameSuccessTokenRows,
      sourceFilenameSuccessTokenPromotedToOutcome: false,
    },
    trainingMask: {
      publisherNativeDatasetValidSamples: 97_717,
      publisherNativeDatasetInvalidSamples: 6_593,
      publisherNativeCleanBaseFramesImpliedValid: 73_798,
      publisherNativeSelectedRecoveryValidSamples: 23_919,
      publisherNativeSelectedRecoveryInvalidSamples: 6_593,
      selectedRecoveryValidPolicySamples: 20_306,
      selectedRecoveryValidManualSamples: 2_416,
      selectedRecoveryValidBoundarySamples: 1_197,
      selectedRecoveryValidMixedSourceSamples: 0,
      invalidReasonFirstMatch: replay.trainingMask.invalidReasonFirstMatch,
      publisherPipelineEligibilityIsLegalTrainingAuthorization: false,
      authorizedTrainingRows: 0,
    },
    sidecarDrift: {
      byteNativeTimestampMatchesInfoFpsMaxAbsoluteError:
        replay.indices.timestampMatchesInfoFpsMaxAbsoluteError,
      byteNativeTimestampVsPerSourceMeasuredFpsMaxAbsoluteError:
        replay.indices.timestampMatchesPerSourceMeasuredFpsMaxAbsoluteError,
      episodeSidecarComparison: replay.sidecar.comparison,
      nestedEpisodeAndIndexStatsUsePreAggregationNamespaceRows: 17,
      episodeIndexNamespaceOffset: 76,
      globalIndexNamespaceOffset: 73_798,
      byteNativeEpisodeIndexRange: [76, 92],
      byteNativeGlobalIndexRange: [73_798, 104_310],
      episodeTopLevelOffsetsAndFileIndicesCrosswalkExactRows: 17,
      byteNativeValuesTakePrecedence: true,
      silentNormalizationApplied: false,
    },
    execution: {
      publisherDatasetNameClaimsRealRobot: true,
      publisherRobotType: "franka_realrobot_gelsight",
      byteNativeStateActionTactileRows: 30_512,
      publisherClaimedRealRobotRows: 30_512,
      independentlyVerifiedPhysicalExecutionRows: 0,
      rawVisualBytesAcquired: 0,
      independentVisualWitnessRows: 0,
      downloadedActionsExecuted: 0,
      networkActionsReplayed: 0,
    },
    outcome: {
      publisherNativeSuccessFieldRows: 0,
      publisherNativeFailureFieldRows: 0,
      publisherNativeOutcomeFieldRows: 0,
      sourceFilenameSuccessTokenRows: 1,
      sourceFilenameSuccessTokenPromotedToOutcome: false,
      independentlyVerifiedOutcomeRows: 0,
      independentEffectRows: 0,
      completeCollectionAttemptCensusRows: 0,
    },
    recovery: {
      publisherDeclaredRecoveryLineageEpisodes: 17,
      publisherDeclaredRecoveryLineageRows: 30_512,
      publisherMetadataManualActionSourceRows: 3_613,
      publisherMetadataPolicyActionSourceRows: 26_779,
      publisherMetadataBoundaryActionSourceRows: 120,
      byteNativePerRowRecoveryLabelRows: 0,
      pairedFailureToRecoveryRows: 0,
      causalRecoveryEffectRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      completeAttemptCensusRows: 0,
      publisherRecoveryLineageIsCausalRecoveryEvidence: false,
    },
    modalityBoundary: {
      selectedNonImageTopLevelColumns:
        PLUG93_RECOVERY_RANGE_PLAN.selectedTopLevelColumns,
      excludedImageTopLevelColumns:
        PLUG93_RECOVERY_RANGE_PLAN.excludedTopLevelColumns,
      excludedImageLeafColumnChunks: 68,
      excludedImageChunkBytes: 25_519_306_752,
      rawVisualBytesAcquired: 0,
      imagePathColumnBytesAcquired: 0,
      completeSelectedNonImageColumns: true,
      completeWholeParquetFiles: false,
    },
    privacy: {
      rawVisualBytes: 0, rawAudioBytes: 0,
      metadataAbsoluteLocalPathOccurrences:
        replay.privacyScan.absoluteLocalPathOccurrences,
      metadataUniqueAbsoluteLocalPaths:
        replay.privacyScan.uniqueAbsoluteLocalPaths,
      rawRangeFragmentsPrivate: true, rawMetadataPrivate: true,
      independentPrivacyAuditRows: 0,
      noPiiOrSensitiveDataGuaranteed: false,
      publicAvailabilityResolvesPrivacy: false,
      rawMetadataProjectedIntoReport: false,
    },
    activeContent: {
      downloadedCodeFiles: 0, executableFilesAcquired: 0,
      downloadedCommandsExecuted: 0, rawActionsExecuted: 0,
      rawTextProjectedIntoCommands: 0, networkActionsReplayed: 0,
    },
    rights: {
      datasetApiLicenseClaim: null, datasetCardLicenseClaim: null,
      fixedTreeLicenseFiles: 0,
      datasetRightsIndependentlyAdjudicated: false,
      upstreamSourceRightsIndependentlyAdjudicated: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
      commercialUseAuthorizedByThisArtifact: false,
      legalConclusionEstablished: false,
    },
    denominators: {
      PUBLISHER_DECLARED_RECOVERY_LINEAGE_EPISODE: 17,
      PUBLISHER_DECLARED_RECOVERY_LINEAGE_ROW: 30_512,
      COMPLETE_SELECTED_NON_IMAGE_TELEMETRY_ROW: 30_512,
      STRICT_206_RANGE_OBJECT: 34,
      WHOLE_PARQUET_FILE_SHA256_VERIFIED: 0,
      RAW_VISUAL_BYTE: 0,
      INDEPENDENT_OUTCOME_ROW: 0, INDEPENDENT_EFFECT_ROW: 0,
      INDEPENDENT_RECOVERY_ROW: 0, COMPLETE_ATTEMPT_CENSUS_ROW: 0,
    },
    boundary: {
      independentlyVerifiedOutcomeRows: 0, independentEffectRows: 0,
      independentlyVerifiedRecoveryRows: 0, completeAttemptCensusRows: 0,
      authorizedTrainingRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createPlug93RecoveryReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: PLUG93_RECOVERY_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    scope: PLUG93_RECOVERY_SCOPE,
    publisherDeclaredRecoveryEpisodes: 17, selectedRows: 30_512,
    selectedRangeObjects: 34, selectedRangeBytes: 58_088_271,
    excludedImageChunkBytes: 25_519_306_752,
    wholeFileSha256Verified: 0, rawVisualBytes: 0,
    independentlyVerifiedOutcomeRows: 0, independentEffectRows: 0,
    independentlyVerifiedRecoveryRows: 0, completeAttemptCensusRows: 0,
    authorizedTrainingRows: 0, offlineTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyPlug93RecoveryArtifactDirectory(directory, options = {}) {
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
    const built = buildPlug93RecoveryArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!reportFile.contents.equals(expectedReport)) fail("REPORT_REPLAY_MISMATCH");
    const manifestFile = readSmall(root, "source/source-manifest.json");
    const receipt = createPlug93RecoveryReceipt(
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

export function serializePlug93RecoveryArtifact(value) {
  return serialize(value);
}
