/* Fixed-revision replay of RoboReward's complete berkeley_autolab_ur5 test group. */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const ROBOREWARD_UR5_SCHEMA =
  "outsider/roboreward-ur5-test-group/v1";
export const ROBOREWARD_UR5_RECEIPT_SCHEMA =
  "outsider/roboreward-ur5-test-group-receipt/v1";
export const ROBOREWARD_UR5_DATASET_ID = "teetone/RoboReward";
export const ROBOREWARD_UR5_REVISION =
  "469b9af76e8539e8d2ac553b081307738fd92ca5";
export const ROBOREWARD_UR5_GROUP = "test/berkeley_autolab_ur5";
export const ROBOREWARD_UR5_SCOPE =
  "COMPLETE_PINNED_SOURCE_NATIVE_TEST_GROUP_WITH_COMPLETE_TEST_METADATA";
export const ROBOREWARD_UR5_DISPOSITION = "QUARANTINE_EVAL_ONLY";

const REPORT_DOMAIN = `${ROBOREWARD_UR5_SCHEMA}/report`;
const RECEIPT_DOMAIN = `${ROBOREWARD_UR5_RECEIPT_SCHEMA}/receipt`;
const MANIFEST_DOMAIN = `${ROBOREWARD_UR5_SCHEMA}/source-manifest`;
const SOURCE_ROOT_DOMAIN = `${ROBOREWARD_UR5_SCHEMA}/source-root`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const RECORD_SPEC = Object.freeze({ bytes: 5_848_348,
  sha256: "sha256:4fa48842eb9387995f593cbf8c95029a88b9c16c1509987597d04a5278726613" });
const ROOT_TREE_SPEC = Object.freeze({ bytes: 477,
  sha256: "sha256:128e3a3cb1ac1df82ac28cc863293a848b8d035a91e36db99449b073e8266457" });
const TEST_TREE_SPEC = Object.freeze({ bytes: 2_998,
  sha256: "sha256:b9ff8723e30b7b27329c0b88aaa5053cf57a2c2bc9e67af3d5a9cc16743c015a" });
const GROUP_TREE_SPEC = Object.freeze({ bytes: 36_822,
  sha256: "sha256:534fac018d9eaa4ab26ec95b705c4b6d418e21c322f1c40c6f374789a56a370b" });

const BRACKET_FILES = Object.freeze([
  "metadata/hf-record-before.json", "metadata/hf-record-after.json",
  "metadata/hf-root-tree-before.json", "metadata/hf-root-tree-after.json",
  "metadata/hf-test-tree-before.json", "metadata/hf-test-tree-after.json",
  "metadata/hf-group-tree-before.json", "metadata/hf-group-tree-after.json",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `ROBOREWARD_UR5_${code}`
    : `ROBOREWARD_UR5_${code}:${detail}`);
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
  if (bytes.length !== RECORD_SPEC.bytes || sha256(bytes) !== RECORD_SPEC.sha256) {
    fail("RECORD_PIN_MISMATCH");
  }
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const siblings = value.siblings?.map((entry) => entry.rfilename);
  const splitVideos = Object.fromEntries(["train", "val", "test"].map(
    (split) => [split, siblings.filter((item) =>
      item.startsWith(`${split}/`) && item.endsWith(".mp4")).length]));
  const licenseFiles = siblings.filter((item) =>
    /(^|\/)licen[sc]e(?:\.|$)/iu.test(item));
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, license: value.cardData?.license,
    siblings: siblings.length,
  };
  if (!same(projection, {
    id: ROBOREWARD_UR5_DATASET_ID, author: "teetone",
    sha: ROBOREWARD_UR5_REVISION,
    lastModified: "2026-01-06T17:41:31.000Z",
    private: false, gated: false, disabled: false,
    usedStorage: 26_984_900_768, license: "cc-by-4.0", siblings: 54_140,
  }) || !same(splitVideos, { train: 45_072, val: 6_232, test: 2_831 })
    || siblings.filter((item) => item.endsWith(".mp4")).length !== 54_135
    || !same(siblings.filter((item) => item.endsWith("metadata.jsonl")),
      ["test/metadata.jsonl", "train/metadata.jsonl", "val/metadata.jsonl"])
    || !same(siblings.filter((item) => !item.endsWith(".mp4")
      && !item.endsWith("metadata.jsonl")), [".gitattributes", "README.md"])
    || licenseFiles.length !== 0 || new Set(siblings).size !== 54_140) {
    fail("RECORD_PROFILE_INVALID");
  }
  return { projection, siblings, splitVideos, licenseFiles };
}

function validateTree(bytes, spec, kind) {
  if (bytes.length !== spec.bytes || sha256(bytes) !== spec.sha256) {
    fail(`${kind}_TREE_PIN_MISMATCH`);
  }
  const entries = parseJson(bytes, `${kind}_TREE_JSON_INVALID`);
  if (!Array.isArray(entries)
    || new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail(`${kind}_TREE_PROFILE_INVALID`);
  }
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  if (kind === "ROOT" && (entries.length !== 5 || files.length !== 2
    || directories.length !== 3
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 5_445
    || !same(files.map((entry) => entry.path), [".gitattributes", "README.md"])
    || !same(directories.map((entry) => entry.path), ["test", "train", "val"]))) {
    fail("ROOT_TREE_PROFILE_INVALID");
  }
  if (kind === "TEST" && (entries.length !== 24 || files.length !== 1
    || directories.length !== 23 || files[0].path !== "test/metadata.jsonl"
    || files[0].size !== 1_337_128
    || !directories.some((entry) => entry.path === ROBOREWARD_UR5_GROUP))) {
    fail("TEST_TREE_PROFILE_INVALID");
  }
  if (kind === "GROUP" && (entries.length !== 100 || files.length !== 100
    || directories.length !== 0
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 75_317_206
    || files.some((entry) => !entry.path.startsWith(`${ROBOREWARD_UR5_GROUP}/`)
      || !entry.path.endsWith(".mp4") || !entry.lfs
      || entry.lfs.size !== entry.size || typeof entry.xetHash !== "string"))) {
    fail("GROUP_TREE_PROFILE_INVALID");
  }
  return { entries, files, directories };
}

function validateReadme(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  for (const phrase of ["license: cc-by-4.0", "real-robot rollout video",
    "Open X-Embodiment (OXE)", "RoboArena", "Counterfactual relabeling",
    "Temporal clipping", "**Test:** 2,831", "fully human-verified",
    "gpt5_mini_check", "discrete end-of-episode progress reward score"]) {
    if (!text.includes(phrase)) fail("README_PROFILE_INVALID");
  }
}

function supportEntries(trees) {
  return [
    ...trees.root.files,
    ...trees.test.files,
    ...trees.group.files,
  ];
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const bracket = Object.fromEntries(BRACKET_FILES.map((relative) =>
    [relative, readSmall(root, relative,
      relative.includes("hf-record") ? RECORD_SPEC.bytes
        : relative.includes("root-tree") ? ROOT_TREE_SPEC.bytes
          : relative.includes("test-tree") ? TEST_TREE_SPEC.bytes
            : GROUP_TREE_SPEC.bytes,
      relative.includes("hf-record") ? RECORD_SPEC.sha256
        : relative.includes("root-tree") ? ROOT_TREE_SPEC.sha256
          : relative.includes("test-tree") ? TEST_TREE_SPEC.sha256
            : GROUP_TREE_SPEC.sha256)]));
  for (const stem of ["hf-record", "hf-root-tree", "hf-test-tree",
    "hf-group-tree"]) {
    if (!bracket[`metadata/${stem}-before.json`].contents.equals(
      bracket[`metadata/${stem}-after.json`].contents)) {
      fail("SOURCE_BRACKET_CHANGED", stem);
    }
  }
  const record = validateRecord(bracket["metadata/hf-record-before.json"].contents);
  const trees = {
    root: validateTree(bracket["metadata/hf-root-tree-before.json"].contents,
      ROOT_TREE_SPEC, "ROOT"),
    test: validateTree(bracket["metadata/hf-test-tree-before.json"].contents,
      TEST_TREE_SPEC, "TEST"),
    group: validateTree(bracket["metadata/hf-group-tree-before.json"].contents,
      GROUP_TREE_SPEC, "GROUP"),
  };
  const descriptors = Object.values(bracket).map(
    ({ path: itemPath, bytes, sha256: itemSha }) =>
      ({ path: itemPath, bytes, sha256: itemSha }));
  for (const entry of supportEntries(trees)) {
    const relative = `files/${entry.path}`;
    const expectedSha = entry.lfs?.oid ? `sha256:${entry.lfs.oid}` : null;
    const inspected = inspectRegular(root, relative, entry.size, expectedSha);
    if (!entry.lfs) {
      const bytes = readFileSync(checkedPath(root, relative));
      if (gitBlobOid(bytes) !== entry.oid) fail("HF_FILE_OID_INVALID", entry.path);
      if (entry.path === "README.md") validateReadme(bytes);
    }
    descriptors.push(inspected);
  }
  for (const entry of supportEntries(trees)) {
    if (!record.siblings.includes(entry.path)) fail("RECORD_TREE_JOIN_MISSING", entry.path);
  }
  descriptors.sort((left, right) => left.path.localeCompare(right.path));
  const expected = descriptors.map((entry) => entry.path);
  if (withManifest) expected.push("source-manifest.json");
  if (!same(sorted(walk(root)), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  return { root, record, trees, descriptors };
}

function manifestBody(collected) {
  return {
    schema: "outsider/roboreward-ur5-test-group-source/v1",
    datasetId: ROBOREWARD_UR5_DATASET_ID,
    revision: ROBOREWARD_UR5_REVISION,
    sourceNativeGroup: ROBOREWARD_UR5_GROUP,
    scope: ROBOREWARD_UR5_SCOPE,
    recordSiblingInventoryFiles: 54_140,
    groupTreeFiles: 100, groupTreeBytes: 75_317_206,
    completeTestMetadataFiles: 1, completeTestMetadataBytes: 1_337_128,
    rootSupportFiles: 2, rootSupportBytes: 5_445,
    selectedFiles: 103, selectedBytes: 76_659_779,
    recordBeforeAfterExact: true, rootTreeBeforeAfterExact: true,
    testTreeBeforeAfterExact: true, groupTreeBeforeAfterExact: true,
    completePinnedSourceNativeGroupAcquired: true,
    completePinnedTestMetadataAcquired: true,
    sourceObjects: collected.descriptors,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, collected.descriptors),
  };
}

export function createRoboRewardUr5SourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

function countBy(values) {
  const counts = new Map();
  for (const value of values) counts.set(String(value), (counts.get(String(value)) ?? 0) + 1);
  return Object.fromEntries([...counts.entries()].sort((left, right) =>
    left[0].localeCompare(right[0])));
}

function rowSignatureRoot(rows) {
  const hashes = rows.map((row) => createHash("sha256")
    .update(Buffer.from(canonicalizeStrict(row), "utf8")).digest("hex"));
  return sha256(Buffer.from(`${hashes.join("\n")}\n`, "utf8"));
}

function parseBoxes(bytes, start = 0, end = bytes.length) {
  const result = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString("latin1", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) fail("MP4_LARGE_BOX_TRUNCATED");
      const large = bytes.readBigUInt64BE(offset + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) fail("MP4_BOX_TOO_LARGE");
      size = Number(large); header = 16;
    } else if (size === 0) size = end - offset;
    if (size < header || offset + size > end) fail("MP4_BOX_INVALID");
    result.push({ type, payloadStart: offset + header, end: offset + size, size });
    offset += size;
  }
  if (offset !== end) fail("MP4_TRAILING_BYTES_INVALID");
  return result;
}

function child(bytes, parent, type) {
  const matches = parseBoxes(bytes, parent.payloadStart, parent.end)
    .filter((entry) => entry.type === type);
  if (matches.length !== 1) fail("MP4_CHILD_PROFILE_INVALID", type);
  return matches[0];
}

function descend(bytes, parent, types) {
  let cursor = parent;
  for (const type of types) cursor = child(bytes, cursor, type);
  return cursor;
}

function parseMp4(bytes) {
  const top = parseBoxes(bytes);
  const ftyp = top.find((entry) => entry.type === "ftyp");
  const moov = top.find((entry) => entry.type === "moov");
  const mdat = top.find((entry) => entry.type === "mdat");
  if (!ftyp || !moov || !mdat) fail("MP4_REQUIRED_BOX_MISSING");
  const brand = bytes.toString("latin1", ftyp.payloadStart, ftyp.payloadStart + 4);
  const mvhd = child(bytes, moov, "mvhd");
  const version = bytes[mvhd.payloadStart];
  let timescale; let duration;
  if (version === 0) {
    timescale = bytes.readUInt32BE(mvhd.payloadStart + 12);
    duration = bytes.readUInt32BE(mvhd.payloadStart + 16);
  } else if (version === 1) {
    timescale = bytes.readUInt32BE(mvhd.payloadStart + 20);
    const value = bytes.readBigUInt64BE(mvhd.payloadStart + 24);
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail("MP4_DURATION_TOO_LARGE");
    duration = Number(value);
  } else fail("MP4_MVHD_VERSION_INVALID");
  const tracks = parseBoxes(bytes, moov.payloadStart, moov.end)
    .filter((entry) => entry.type === "trak");
  const profiles = tracks.map((track) => {
    const handler = descend(bytes, track, ["mdia", "hdlr"]);
    const handlerType = bytes.toString("latin1",
      handler.payloadStart + 8, handler.payloadStart + 12);
    if (handlerType !== "vide") return { handlerType };
    const tkhd = child(bytes, track, "tkhd");
    const tkhdVersion = bytes[tkhd.payloadStart];
    const dimensionOffset = tkhdVersion === 0 ? 76 : tkhdVersion === 1 ? 88 : -1;
    if (dimensionOffset < 0) fail("MP4_TKHD_VERSION_INVALID");
    const width = bytes.readUInt32BE(tkhd.payloadStart + dimensionOffset) / 65_536;
    const height = bytes.readUInt32BE(tkhd.payloadStart + dimensionOffset + 4) / 65_536;
    const stsd = descend(bytes, track, ["mdia", "minf", "stbl", "stsd"]);
    const stsz = descend(bytes, track, ["mdia", "minf", "stbl", "stsz"]);
    const codec = bytes.toString("latin1", stsd.payloadStart + 12,
      stsd.payloadStart + 16);
    const frames = bytes.readUInt32BE(stsz.payloadStart + 8);
    return { handlerType, width, height, codec, frames };
  });
  const video = profiles.filter((entry) => entry.handlerType === "vide");
  if (video.length !== 1 || profiles.length !== 1 || timescale === 0) {
    fail("MP4_TRACK_PROFILE_INVALID");
  }
  return {
    topBoxOrder: top.map((entry) => entry.type).join(","), brand,
    durationSeconds: duration / timescale, ...video[0],
  };
}

function replaySource(collected) {
  const metadataBytes = readFileSync(checkedPath(collected.root,
    "files/test/metadata.jsonl"));
  const text = new TextDecoder("utf-8", { fatal: true }).decode(metadataBytes);
  if (!text.endsWith("\n")) fail("METADATA_NEWLINE_INVALID");
  const lines = text.slice(0, -1).split("\n");
  const rows = lines.map((line) => parseJson(Buffer.from(line),
    "METADATA_ROW_INVALID"));
  const exactKeys = ["file_name", "gpt5_mini_check", "reward", "task"];
  if (rows.length !== 2_831 || rows.some((row) =>
    !same(sorted(Object.keys(row)), exactKeys)
    || typeof row.file_name !== "string" || typeof row.task !== "string"
    || !Number.isInteger(row.reward) || row.reward < 1 || row.reward > 5
    || !(typeof row.gpt5_mini_check === "string"
      || row.gpt5_mini_check === null))) fail("METADATA_SCHEMA_INVALID");
  const groupRows = rows.filter((row) =>
    row.file_name.startsWith("berkeley_autolab_ur5/"));
  const groupTreePaths = new Set(collected.trees.group.files.map((entry) => entry.path));
  const groupMetadataPaths = new Set(groupRows.map((row) => `test/${row.file_name}`));
  if (groupRows.length !== 100 || groupMetadataPaths.size !== 100
    || !same(sorted(groupTreePaths), sorted(groupMetadataPaths))) {
    fail("GROUP_METADATA_TREE_CROSSWALK_INVALID");
  }
  const allSourceCounts = countBy(rows.map((row) => row.file_name.split("/")[0]));
  const allRewards = countBy(rows.map((row) => row.reward));
  const groupRewards = countBy(groupRows.map((row) => row.reward));
  const groupTasks = new Set(groupRows.map((row) => row.task));
  const groupChecks = groupRows.filter((row) =>
    row.gpt5_mini_check?.trimEnd().endsWith("ANSWER: TRUE"));
  const duplicatePayloads = new Map();
  const metadataByPath = new Map(groupRows.map((row) => [`test/${row.file_name}`, row]));
  const videoProfiles = [];
  for (const entry of collected.trees.group.files) {
    const bytes = readFileSync(checkedPath(collected.root, `files/${entry.path}`));
    const profile = parseMp4(bytes);
    videoProfiles.push({ path: entry.path, oid: entry.lfs.oid,
      bytes: entry.size, ...profile });
    if (!duplicatePayloads.has(entry.lfs.oid)) duplicatePayloads.set(entry.lfs.oid, []);
    duplicatePayloads.get(entry.lfs.oid).push(entry);
  }
  const duplicates = [...duplicatePayloads.values()].filter((entries) => entries.length > 1)
    .map((entries) => {
      const ordered = [...entries].sort((left, right) => left.path.localeCompare(right.path));
      const rowsForPayload = ordered.map((entry) => metadataByPath.get(entry.path));
      const basename = path.posix.basename(ordered[0].path, ".mp4")
        .replace(/_[12]$/u, "");
      return {
        sourceIdentity: basename,
        physicalPaths: ordered.length,
        rewards: rowsForPayload.map((row) => row.reward)
          .sort((left, right) => left - right),
        uniqueTaskHashes: new Set(rowsForPayload.map((row) =>
          sha256(Buffer.from(row.task, "utf8")))).size,
        samePayloadDifferentTask: new Set(rowsForPayload.map((row) => row.task)).size
          === ordered.length,
        payloadBytes: ordered[0].size,
      };
    }).sort((left, right) => left.sourceIdentity.localeCompare(right.sourceIdentity));
  const uniqueProfiles = [...duplicatePayloads.entries()].map(([oid]) =>
    videoProfiles.find((profile) => profile.oid === oid));
  const topBoxOrders = countBy(videoProfiles.map((profile) => profile.topBoxOrder));
  const duration = videoProfiles.reduce((sum, profile) => sum + profile.durationSeconds, 0);
  const uniqueDuration = uniqueProfiles.reduce((sum, profile) =>
    sum + profile.durationSeconds, 0);
  const frames = videoProfiles.reduce((sum, profile) => sum + profile.frames, 0);
  const uniqueFrames = uniqueProfiles.reduce((sum, profile) => sum + profile.frames, 0);
  const uniqueBytes = uniqueProfiles.reduce((sum, profile) => sum + profile.bytes, 0);
  if (!same(allRewards, { "1": 689, "2": 641, "3": 556, "4": 418,
    "5": 527 }) || Object.keys(allSourceCounts).length !== 23
    || allSourceCounts.berkeley_autolab_ur5 !== 100
    || allSourceCounts.robo_arena !== 1_000
    || new Set(rows.map((row) => row.file_name)).size !== 2_831
    || new Set(rows.map((row) => row.task)).size !== 1_043
    || rows.filter((row) => row.gpt5_mini_check === null).length !== 1_000
    || !same(groupRewards, { "1": 20, "2": 20, "3": 20, "4": 20,
      "5": 20 }) || groupTasks.size !== 31 || groupChecks.length !== 100
    || groupRows.filter((row) => row.file_name.includes("_attempt_")).length !== 49
    || groupRows.filter((row) => row.file_name.includes("_score_")).length !== 49
    || videoProfiles.length !== 100 || duplicatePayloads.size !== 92
    || uniqueBytes !== 67_673_551 || duplicates.length !== 7
    || Math.max(...duplicates.map((entry) => entry.physicalPaths)) !== 3
    || duplicates.some((entry) => !entry.samePayloadDifferentTask)
    || !same(duplicates.map((entry) => entry.rewards),
      [[1, 5], [3, 5], [1, 5], [1, 3, 4], [1, 3], [1, 2], [3, 5]])
    || videoProfiles.some((profile) => profile.brand !== "isom"
      || profile.codec !== "avc1" || profile.width !== 640 || profile.height !== 480
      || Math.abs(profile.frames / profile.durationSeconds - 10) > 1e-9)
    || !same(topBoxOrders,
      { "ftyp,free,mdat,moov": 49, "ftyp,moov,free,mdat": 51 })
    || frames !== 7_546 || Math.abs(duration - 754.6) > 1e-9
    || uniqueFrames !== 6_737 || Math.abs(uniqueDuration - 673.7) > 1e-9
    || rowSignatureRoot(rows) !==
      "sha256:44e26a058f32c62f3c8f30e5b53024de7fee3e6351c12ad8f12e210b1b48530f"
    || rowSignatureRoot(groupRows) !==
      "sha256:3cf84eab320ab090a01cdc78106651ef37377de6f4deda5541bb3adae6c1464f") {
    fail("REPLAY_PROFILE_INVALID");
  }
  const stringSurface = rows.flatMap((row) => Object.values(row))
    .filter((value) => typeof value === "string").join("\n");
  const email = stringSurface.match(
    /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![A-Z0-9._%+-])/giu) ?? [];
  const ipv4 = stringSurface.match(
    /(?<!\d)(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?!\d)/gu) ?? [];
  return deepFreeze({
    metadata: {
      rows: 2_831, uniqueFileNames: 2_831, uniqueTaskStrings: 1_043,
      exactSchemaRows: 2_831, sourceDatasets: 23,
      sourceDatasetCounts: allSourceCounts, rewardCounts: allRewards,
      gpt5MiniCheckStringRows: 1_831, gpt5MiniCheckNullRows: 1_000,
      rowSignatureRoot: rowSignatureRoot(rows),
    },
    group: {
      rows: 100, uniqueMetadataPaths: 100, treePathCrosswalkExact: true,
      rewardCounts: groupRewards, uniqueTaskStrings: 31,
      gpt5MiniCheckAnswerTrueRows: 100,
      originalSplitTrainPathRows: groupRows.filter((row) =>
        row.file_name.includes("originalsplit_train_index_")).length,
      originalSplitTestPathRows: groupRows.filter((row) =>
        row.file_name.includes("originalsplit_test_index_")).length,
      attemptTokenPathRows: 49, scoreTokenPathRows: 49,
      rowSignatureRoot: rowSignatureRoot(groupRows),
    },
    video: {
      physicalPaths: 100, physicalPathBytes: 75_317_206,
      uniquePayloads: 92, uniquePayloadBytes: uniqueBytes,
      duplicatePhysicalPathCopies: 8,
      duplicatedStorageBytes: 75_317_206 - uniqueBytes,
      duplicatePayloadGroups: 7, maximumPathsPerPayload: 3,
      duplicateProfiles: duplicates,
      validMp4Containers: 100, majorBrandCounts: { isom: 100 },
      codecCounts: { avc1: 100 }, width: 640, height: 480,
      frameRate: 10, physicalPathFrames: frames,
      physicalPathDurationSeconds: Number(duration.toFixed(6)),
      uniquePayloadFrames: uniqueFrames,
      uniquePayloadDurationSeconds: Number(uniqueDuration.toFixed(6)),
      topBoxOrderCounts: topBoxOrders, audioTracks: 0,
    },
    privacyScan: {
      metadataEmailPatternCandidates: email.length,
      metadataIpv4PatternCandidates: ipv4.length,
      visualPayloadIndependentlyAuditedForPii: false,
    },
  });
}

export function buildRoboRewardUr5ArtifactFromSourceDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected);
  const sourceManifest = deepFreeze({ ...body,
    manifestHash: digest(MANIFEST_DOMAIN, body) });
  const manifestFile = readSmall(collected.root, "source-manifest.json");
  if (!manifestFile.contents.equals(serialize(sourceManifest))) {
    fail("SOURCE_MANIFEST_MISMATCH");
  }
  const replay = replaySource(collected);
  const reportBody = {
    schema: ROBOREWARD_UR5_SCHEMA, disposition: ROBOREWARD_UR5_DISPOSITION,
    scope: {
      kind: ROBOREWARD_UR5_SCOPE, datasetId: ROBOREWARD_UR5_DATASET_ID,
      revision: ROBOREWARD_UR5_REVISION,
      sourceNativeGroup: ROBOREWARD_UR5_GROUP,
      selectedFiles: 103, selectedBytes: 76_659_779,
      groupVideoFiles: 100, groupVideoBytes: 75_317_206,
      completeTestMetadataFiles: 1, completeTestMetadataBytes: 1_337_128,
      rootSupportFiles: 2, rootSupportBytes: 5_445,
      completePinnedSourceNativeGroupAcquired: true,
      completePinnedTestMetadataAcquired: true,
      completeFullDatasetPayloadAcquired: false,
      fixedRecordSiblingInventoryAcquired: true,
      globalRoboRewardSourceUniverseExhausted: false,
    },
    source: {
      publicAtAcquisition: true, gatedAtAcquisition: false,
      disabledAtAcquisition: false,
      apiUsedStorageBytes: 26_984_900_768,
      apiSiblingInventoryFiles: 54_140,
      apiVideoInventoryFiles: 54_135,
      splitVideoInventory: collected.record.splitVideos,
      recordBeforeAfterExact: true, rootTreeBeforeAfterExact: true,
      testTreeBeforeAfterExact: true, groupTreeBeforeAfterExact: true,
      groupTreePaginationLinkAbsentAtAcquisition: true,
      sourceManifestHash: sourceManifest.manifestHash,
      sourceManifestFileSha256: manifestFile.sha256,
      sourceRoot: sourceManifest.sourceRoot,
    },
    replay,
    taskConditionedLabels: {
      publisherNativeTaskConditionedProgressLabelRows: 100,
      rewardScale: [1, 2, 3, 4, 5], rewardRowsPerValue: 20,
      publisherReadmeEndOfEpisodeProgressSemantics: true,
      publisherReadmeTestHumanVerifiedClaimRows: 100,
      byteNativePerRowHumanAnnotatorIdentityFields: 0,
      byteNativeGpt5MiniCheckTextRows: 100,
      byteNativeGpt5MiniCheckAnswerTrueRows: 100,
      samePayloadDifferentTaskGroups: 7,
      samePayloadDifferentTaskRows: 15,
      samePayloadSameTaskDifferentRewardConflictGroups: 0,
      taskConditioningPreserved: true,
      taskConditionedLabelsMustNotBeAddedToUniqueVideoPayloads: true,
      publisherLabelsAreIndependentOutcomeWitnesses: false,
    },
    videoIdentity: {
      taskConditionedLabelRows: 100,
      physicalVideoPaths: 100,
      uniqueVideoExecutionPayloads: 92,
      duplicatePhysicalPathCopies: 8,
      physicalPathBytes: 75_317_206,
      uniquePayloadBytes: 67_673_551,
      denominatorAdditionForbidden: true,
      physicalPathsAndUniquePayloadsAreAlternativeDenominators: true,
      duplicateProfiles: replay.video.duplicateProfiles,
    },
    execution: {
      publisherReadmeClaimsRealRobotRolloutVideos: true,
      publisherClaimedRealRobotVideoPathRows: 100,
      byteValidMp4VideoPathRows: 100,
      independentlyVerifiedRealRobotExecutionRows: 0,
      actionTelemetryRows: 0, stateTelemetryRows: 0,
      independentVisualWitnessRows: 0,
      downloadedVideoPayloadsExecuted: 0,
      downloadedMetadataTextExecuted: 0,
      networkActionsReplayed: 0,
    },
    outcome: {
      publisherTaskConditionedProgressLabelRows: 100,
      publisherPerfectCompletionLabelRows: 20,
      publisherNoSuccessLabelRows: 20,
      independentlyVerifiedOutcomeRows: 0,
      independentEffectRows: 0,
      completeCollectionAttemptCensusRows: 0,
      selectedCuratedBalancedGroupIsAttemptCensus: false,
    },
    recovery: {
      attemptTokenPathRows: 49,
      attemptTokenEstablishesRetryChronology: false,
      pairedFailureToRecoveryRows: 0,
      sourceNativeRecoveryLabelRows: 0,
      causalRecoveryRows: 0, longitudinalRecoveryRows: 0,
      independentlyVerifiedRecoveryRows: 0,
    },
    privacy: {
      rawVisualFiles: 100, rawVisualBytes: 75_317_206,
      rawMetadataRows: 2_831,
      rawVisualPayloadsPrivate: true, rawMetadataPrivate: true,
      independentVisualPiiAuditRows: 0,
      metadataEmailPatternCandidates: replay.privacyScan.metadataEmailPatternCandidates,
      metadataIpv4PatternCandidates: replay.privacyScan.metadataIpv4PatternCandidates,
      noPiiOrSensitiveDataGuaranteed: false,
      publicAvailabilityResolvesPrivacy: false,
      rawTaskOrCheckTextProjectedIntoReport: false,
    },
    activeContent: {
      downloadedCodeFiles: 0, executableFilesAcquired: 0,
      downloadedCommandsExecuted: 0, videoPayloadsExecuted: 0,
      metadataTextExecuted: 0, rawTextProjectedIntoCommands: 0,
      networkActionsReplayed: 0,
    },
    rights: {
      datasetCardLicenseClaim: "CC-BY-4.0",
      fixedRecordLicenseFileCount: 0,
      publisherReadmeNamesOpenXEmbodiment: true,
      publisherReadmeNamesRoboArena: true,
      upstreamCorpusRightsIndependentlyAdjudicated: false,
      datasetCardClaimExtrapolatedToAllUpstreamVideoRights: false,
      legalConclusionEstablished: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
      commercialUseAuthorizedByThisArtifact: false,
    },
    denominators: {
      TASK_CONDITIONED_REWARD_LABEL: 100,
      PHYSICAL_VIDEO_PATH: 100,
      UNIQUE_VIDEO_EXECUTION_BYTES: 92,
      PUBLISHER_GPT_CHECK_TEXT: 100,
      PUBLISHER_DECLARED_HUMAN_VERIFIED_LABEL: 100,
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

export function createRoboRewardUr5Receipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: ROBOREWARD_UR5_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    scope: ROBOREWARD_UR5_SCOPE,
    selectedFiles: 103, selectedBytes: 76_659_779,
    taskConditionedRewardLabels: 100,
    physicalVideoPaths: 100, uniqueVideoExecutionPayloads: 92,
    independentlyVerifiedOutcomeRows: 0, independentEffectRows: 0,
    independentlyVerifiedRecoveryRows: 0, completeAttemptCensusRows: 0,
    authorizedTrainingRows: 0, offlineTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyRoboRewardUr5ArtifactDirectory(directory) {
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
    const built = buildRoboRewardUr5ArtifactFromSourceDirectory(
      checkedPath(root, "source"));
    const expectedReport = serialize(built.report);
    if (!reportFile.contents.equals(expectedReport)) fail("REPORT_REPLAY_MISMATCH");
    const manifestFile = readSmall(root, "source/source-manifest.json");
    const receipt = createRoboRewardUr5Receipt(
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

export function serializeRoboRewardUr5Artifact(value) {
  return serialize(value);
}
