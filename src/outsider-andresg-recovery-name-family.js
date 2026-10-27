/*
 * Complete fixed-revision no-video replay of the eleven Andresg324 datasets
 * selected by the publisher-native author listing and literal "recovery" IDs.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const ANDRESG_RECOVERY_SCHEMA =
  "outsider/andresg-recovery-name-family/v1";
export const ANDRESG_RECOVERY_RECEIPT_SCHEMA =
  "outsider/andresg-recovery-name-family-receipt/v1";
export const ANDRESG_RECOVERY_SCOPE =
  "COMPLETE_FIXED_AUTHOR_LIST_LITERAL_RECOVERY_ID_FAMILY_NO_VIDEO";
export const ANDRESG_RECOVERY_DISPOSITION = "QUARANTINE_EVAL_ONLY";

export const ANDRESG_RECOVERY_SOURCES = deepFreeze([
  {
    key: "cube", cohort: "cube_pickup", condition: "recovery",
    id: "Andresg324/cube-pickup-recovery_20260809_141725",
    revision: "6b20df9bb724a6f7c90186113729fa22e57eeeb4",
    lastModified: "2026-08-09T18:54:54.000Z",
    treeBytes: 262_153_317, selectedBytes: 1_624_881,
    videoBytes: 260_528_436, episodes: 50, frames: 32_170,
  },
  {
    key: "recovery", cohort: "default", condition: "in_distribution",
    id: "Andresg324/rollout_recovery_in_distribution_20260810_124638",
    revision: "3e4efe6c0316957a40d0ac40e8ac3a9d992e6b3a",
    lastModified: "2026-08-10T17:00:50.000Z",
    treeBytes: 106_159_581, selectedBytes: 972_573,
    videoBytes: 105_187_008, episodes: 16, frames: 12_737,
  },
  {
    key: "new_positions", cohort: "default", condition: "new_positions",
    id: "Andresg324/rollout_recovery_new_positions_20260810_134854",
    revision: "f746608b332c0110db13880533d507d655fe4479",
    lastModified: "2026-08-10T18:07:20.000Z",
    treeBytes: 154_378_667, selectedBytes: 1_293_563,
    videoBytes: 153_085_104, episodes: 16, frames: 18_373,
  },
  {
    key: "different_object", cohort: "default", condition: "different_object",
    id: "Andresg324/rollout_recovery_different_object_20260810_150115",
    revision: "0581075a38e761ec50d7e3178e1fa5e1b4789a83",
    lastModified: "2026-08-10T19:15:42.000Z",
    treeBytes: 103_540_178, selectedBytes: 969_533,
    videoBytes: 102_570_645, episodes: 16, frames: 12_778,
  },
  {
    key: "distractors", cohort: "default", condition: "distractors",
    id: "Andresg324/rollout_recovery_distractors_20260810_160107",
    revision: "103a19a9256e2e1b0300537ef1d9136d465ac9c6",
    lastModified: "2026-08-10T20:13:24.000Z",
    treeBytes: 90_260_855, selectedBytes: 800_521,
    videoBytes: 89_460_334, episodes: 16, frames: 10_024,
  },
  {
    key: "reduced_lighting", cohort: "default", condition: "reduced_lighting",
    id: "Andresg324/rollout_recovery_reduced_lighting_20260810_165851",
    revision: "36a12b1242ebca8e3c4dd485de85a6be5278a851",
    lastModified: "2026-08-10T21:14:54.000Z",
    treeBytes: 110_174_460, selectedBytes: 1_046_971,
    videoBytes: 109_127_489, episodes: 16, frames: 13_897,
  },
  {
    key: "seed2000", cohort: "seed2000", condition: "in_distribution",
    id: "Andresg324/rollout_recovery-seed2000_in_distribution_20260811_103305",
    revision: "b6a6d0fcdb586650a88d21a85cea82e2b09054b4",
    lastModified: "2026-08-11T14:48:08.000Z",
    treeBytes: 113_094_498, selectedBytes: 1_004_505,
    videoBytes: 112_089_993, episodes: 16, frames: 13_230,
  },
  {
    key: "seed_diff", cohort: "seed2000", condition: "different_object",
    id: "Andresg324/rollout_recovery-seed2000_different_object_20260811_114348",
    revision: "ba5e64b3c9bd582848e818e06bada2eeeaa8c914",
    lastModified: "2026-08-11T16:01:21.000Z",
    treeBytes: 135_470_478, selectedBytes: 1_222_866,
    videoBytes: 134_247_612, episodes: 16, frames: 16_838,
  },
  {
    key: "seed_distractors", cohort: "seed2000", condition: "distractors",
    id: "Andresg324/rollout_recovery-seed2000_distractors_20260811_125939",
    revision: "1cca34beffa08a41db6814740b60ea3c1295bf81",
    lastModified: "2026-08-11T17:13:26.000Z",
    treeBytes: 101_997_447, selectedBytes: 864_778,
    videoBytes: 101_132_669, episodes: 16, frames: 10_931,
  },
  {
    key: "seed_light", cohort: "seed2000", condition: "reduced_lighting",
    id: "Andresg324/rollout_recovery-seed2000_reduced_lighting_20260811_135938",
    revision: "3add1c64159e782a59c1aa2253f892223811c4d4",
    lastModified: "2026-08-11T18:17:27.000Z",
    treeBytes: 132_714_364, selectedBytes: 1_204_494,
    videoBytes: 131_509_870, episodes: 16, frames: 16_273,
  },
  {
    key: "seed_positions", cohort: "seed2000", condition: "new_positions",
    id: "Andresg324/rollout_recovery-seed2000_new_positions_20260811_153653",
    revision: "b5e74904e87e9d8243f11ae46934167fc99db2a0",
    lastModified: "2026-08-11T19:55:33.000Z",
    treeBytes: 152_254_164, selectedBytes: 1_259_821,
    videoBytes: 150_994_343, episodes: 16, frames: 18_360,
  },
]);

const REPORT_DOMAIN = `${ANDRESG_RECOVERY_SCHEMA}/report`;
const RECEIPT_DOMAIN = `${ANDRESG_RECOVERY_RECEIPT_SCHEMA}/receipt`;
const MANIFEST_DOMAIN = `${ANDRESG_RECOVERY_SCHEMA}/source-manifest`;
const SOURCE_ROOT_DOMAIN = `${ANDRESG_RECOVERY_SCHEMA}/source-root`;
const VIDEO_DOMAIN = `${ANDRESG_RECOVERY_SCHEMA}/video-inventory`;
const TRAJECTORY_DOMAIN = `${ANDRESG_RECOVERY_SCHEMA}/trajectory-profiles`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const SELECTED_PATHS = Object.freeze([
  ".gitattributes", "README.md", "data/chunk-000/file-000.parquet",
  "meta/episodes/chunk-000/file-000.parquet", "meta/info.json",
  "meta/stats.json", "meta/tasks.parquet",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `ANDRESG_RECOVERY_${code}`
    : `ANDRESG_RECOVERY_${code}:${detail}`);
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
      hash.update(buffer.subarray(0, count)); total += count;
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

function validateAuthorList(bytes) {
  const value = parseJson(bytes, "AUTHOR_LIST_JSON_INVALID");
  if (!Array.isArray(value) || value.length !== 56) fail("AUTHOR_LIST_COUNT_INVALID");
  const selected = value.filter((entry) =>
    typeof entry.id === "string" && entry.id.toLowerCase().includes("recovery"))
    .map((entry) => ({ id: entry.id, sha: entry.sha,
      lastModified: entry.lastModified, private: entry.private,
      gated: entry.gated, disabled: entry.disabled ?? false,
      cardLicense: entry.cardData?.license ?? null,
      tagLicenses: (entry.tags ?? []).filter((item) =>
        item.startsWith("license:")) }))
    .sort((left, right) => left.id.localeCompare(right.id));
  const expected = ANDRESG_RECOVERY_SOURCES.map((spec) => ({
    id: spec.id, sha: spec.revision, lastModified: spec.lastModified,
    private: false, gated: false, disabled: false, cardLicense: "apache-2.0",
    tagLicenses: ["license:apache-2.0"],
  })).sort((left, right) => left.id.localeCompare(right.id));
  if (!same(selected, expected)) fail("AUTHOR_LIST_RECOVERY_SELECTION_INVALID");
  return { authorDatasetCount: value.length,
    literalRecoveryIdMatches: selected.length, selected };
}

function validateRecord(bytes, spec) {
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, siblings: value.siblings?.length,
    cardLicense: value.cardData?.license ?? null,
    tagLicenses: (value.tags ?? []).filter((item) => item.startsWith("license:")),
  };
  if (projection.id !== spec.id || projection.author !== "Andresg324"
    || projection.sha !== spec.revision
    || projection.lastModified !== spec.lastModified
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false || projection.siblings !== 9
    || !Number.isSafeInteger(projection.usedStorage) || projection.usedStorage < 0
    || projection.cardLicense !== "apache-2.0"
    || !same(projection.tagLicenses, ["license:apache-2.0"])) {
    fail("RECORD_PROFILE_INVALID", spec.key);
  }
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

function validateTree(bytes, spec) {
  const entries = parseJson(bytes, "TREE_JSON_INVALID");
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const videos = files.filter((entry) => entry.path.endsWith(".mp4"));
  const selected = files.filter((entry) => !entry.path.endsWith(".mp4"));
  const licenses = files.filter((entry) =>
    /(^|\/)licen[sc]e(?:\.|$)/iu.test(entry.path));
  if (!Array.isArray(entries) || entries.length !== 19 || files.length !== 9
    || directories.length !== 10
    || new Set(entries.map((entry) => entry.path)).size !== 19
    || files.reduce((sum, entry) => sum + entry.size, 0) !== spec.treeBytes
    || selected.length !== 7
    || selected.reduce((sum, entry) => sum + entry.size, 0) !== spec.selectedBytes
    || !same(sorted(selected.map((entry) => entry.path)), sorted(SELECTED_PATHS))
    || videos.length !== 2
    || videos.reduce((sum, entry) => sum + entry.size, 0) !== spec.videoBytes
    || licenses.length !== 0) fail("TREE_PROFILE_INVALID", spec.key);
  for (const entry of [...videos, ...selected.filter((item) => item.lfs)]) {
    if (!entry.lfs?.oid || entry.lfs.size !== entry.size || !entry.xetHash) {
      fail("LFS_IDENTITY_INVALID", `${spec.key}:${entry.path}`);
    }
  }
  return { entries, files, directories, videos, selected };
}

function groupIdentity(entries, identityFor) {
  const groups = new Map();
  for (const entry of entries) {
    const identity = identityFor(entry);
    const values = groups.get(identity) ?? [];
    values.push(entry); groups.set(identity, values);
  }
  return groups;
}

function selectedIdentity(descriptors) {
  const groups = groupIdentity(descriptors,
    (item) => `${item.sha256}:${item.bytes}`);
  const profiles = [...groups].map(([identity, items]) => ({
    sha256: identity.slice(0, 71), bytes: Number(identity.slice(72)),
    occurrences: items.length, paths: sorted(items.map((item) => item.path)),
  })).sort((left, right) => left.sha256.localeCompare(right.sha256));
  const occurrenceCounts = profiles.reduce((result, item) => ({ ...result,
    [item.occurrences]: (result[item.occurrences] ?? 0) + 1 }), {});
  const uniqueBytes = profiles.reduce((sum, item) => sum + item.bytes, 0);
  if (descriptors.length !== 77 || profiles.length !== 57
    || uniqueBytes !== 12_217_566 || !same(occurrenceCounts, { 1: 55, 11: 2 })) {
    fail("SELECTED_IDENTITY_PROFILE_INVALID");
  }
  return { physicalObjects: 77, physicalBytes: 12_264_506,
    uniquePayloads: 57, uniquePayloadBytes: uniqueBytes,
    occurrenceCounts, profiles };
}

function videoInventory(sources) {
  const physical = sources.flatMap(({ spec, tree }) => tree.videos.map((entry) => ({
    repositoryKey: spec.key, path: entry.path, gitOid: entry.oid,
    lfsOid: entry.lfs.oid, xetHash: entry.xetHash, bytes: entry.size,
  }))).sort((left, right) => left.repositoryKey.localeCompare(right.repositoryKey)
    || left.path.localeCompare(right.path));
  const groups = groupIdentity(physical,
    (item) => `${item.lfsOid}:${item.bytes}`);
  const profiles = [...groups].map(([identity, items]) => ({
    lfsOid: identity.split(":")[0], bytes: items[0].bytes,
    occurrences: items.length,
    repositories: sorted([...new Set(items.map((item) => item.repositoryKey))]),
    paths: sorted(items.map((item) => `${item.repositoryKey}:${item.path}`)),
  })).sort((left, right) => left.lfsOid.localeCompare(right.lfsOid));
  if (physical.length !== 22
    || physical.reduce((sum, item) => sum + item.bytes, 0) !== 1_449_933_503
    || profiles.length !== 22
    || profiles.some((item) => item.occurrences !== 1)) {
    fail("VIDEO_INVENTORY_PROFILE_INVALID");
  }
  return deepFreeze({ physicalEntries: physical, physicalObjects: 22,
    physicalBytes: 1_449_933_503, payloadProfiles: profiles,
    uniquePayloadClaims: 22, uniquePayloadClaimBytes: 1_449_933_503,
    inventoryHash: digest(VIDEO_DOMAIN, { physical, profiles }) });
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const authorBefore = readSmall(root, "metadata/hf-author-list-before.json");
  const authorAfter = readSmall(root, "metadata/hf-author-list-after.json");
  const authorProjectionBefore = validateAuthorList(authorBefore.contents);
  const authorProjectionAfter = validateAuthorList(authorAfter.contents);
  if (!same(authorProjectionBefore, authorProjectionAfter)) {
    fail("AUTHOR_SELECTION_CHANGED");
  }
  const descriptors = [authorBefore, authorAfter].map((item) => ({
    path: item.path, bytes: item.bytes, sha256: item.sha256,
  }));
  const selectedDescriptors = [];
  const sources = [];
  for (const spec of ANDRESG_RECOVERY_SOURCES) {
    const prefix = `metadata/${spec.key}`;
    const recordBefore = readSmall(root, `${prefix}/hf-record-before.json`);
    const recordAfter = readSmall(root, `${prefix}/hf-record-after.json`);
    const treeBefore = readSmall(root, `${prefix}/hf-tree-before.json`);
    const treeAfter = readSmall(root, `${prefix}/hf-tree-after.json`);
    const recordProjectionBefore = validateRecord(recordBefore.contents, spec);
    const recordProjectionAfter = validateRecord(recordAfter.contents, spec);
    const parsedTreeBefore = validateTree(treeBefore.contents, spec);
    const parsedTreeAfter = validateTree(treeAfter.contents, spec);
    if (!same(recordProjectionBefore, recordProjectionAfter)) {
      fail("RECORD_PROJECTION_CHANGED", spec.key);
    }
    if (!same(stableTree(parsedTreeBefore.entries),
      stableTree(parsedTreeAfter.entries))) {
      fail("TREE_STABLE_PROJECTION_CHANGED", spec.key);
    }
    for (const item of [recordBefore, recordAfter, treeBefore, treeAfter]) {
      descriptors.push({ path: item.path, bytes: item.bytes, sha256: item.sha256 });
    }
    for (const entry of parsedTreeBefore.selected) {
      const relative = `repos/${spec.key}/${entry.path}`;
      const expectedSha = entry.lfs?.oid ? `sha256:${entry.lfs.oid}` : null;
      const inspected = inspectRegular(root, relative, entry.size, expectedSha);
      if (!entry.lfs) {
        const bytes = readFileSync(checkedPath(root, relative));
        if (gitBlobOid(bytes) !== entry.oid) {
          fail("SELECTED_GIT_OID_INVALID", `${spec.key}:${entry.path}`);
        }
      }
      descriptors.push(inspected); selectedDescriptors.push(inspected);
    }
    sources.push({ spec, record: recordProjectionBefore, tree: parsedTreeBefore,
      recordRawBeforeAfterExact: recordBefore.contents.equals(recordAfter.contents),
      treeRawBeforeAfterExact: treeBefore.contents.equals(treeAfter.contents) });
  }
  descriptors.sort((left, right) => left.path.localeCompare(right.path));
  const expected = descriptors.map((entry) => entry.path);
  if (withManifest) expected.push("source-manifest.json");
  if (!same(sorted(walk(root)), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  return { root, descriptors, selectedDescriptors, sources,
    authorProjection: authorProjectionBefore,
    authorRawBeforeAfterExact: authorBefore.contents.equals(authorAfter.contents),
    selectedIdentity: selectedIdentity(selectedDescriptors),
    videoInventory: videoInventory(sources) };
}

function manifestBody(collected) {
  return {
    schema: "outsider/andresg-recovery-name-family-source/v1",
    scope: ANDRESG_RECOVERY_SCOPE,
    authorDiscovery: {
      endpointAuthor: "Andresg324", full: true, limit: 1000,
      authorDatasetCount: collected.authorProjection.authorDatasetCount,
      literalRecoveryIdMatches:
        collected.authorProjection.literalRecoveryIdMatches,
      selected: collected.authorProjection.selected,
      selectedProjectionBeforeAfterExact: true,
      rawBeforeAfterExact: collected.authorRawBeforeAfterExact,
    },
    sources: collected.sources.map(({ spec, record,
      recordRawBeforeAfterExact, treeRawBeforeAfterExact }) => ({
      key: spec.key, id: spec.id, revision: spec.revision,
      cohortNameClaim: spec.cohort, conditionNameClaim: spec.condition,
      publicAtAcquisition: true, gatedAtAcquisition: false,
      apiUsedStorageBytes: record.usedStorage,
      recordStableProjectionBeforeAfterExact: true,
      treeStableProjectionBeforeAfterExact: true,
      recordRawBeforeAfterExact, treeRawBeforeAfterExact,
      treeEntries: 19, treeFiles: 9, treeDirectories: 10,
      treeFileBytes: spec.treeBytes, selectedNoVideoFiles: 7,
      selectedNoVideoBytes: spec.selectedBytes, videoFilesExcluded: 2,
      videoBytesExcluded: spec.videoBytes,
    })),
    selected: collected.selectedIdentity,
    videoInventory: collected.videoInventory,
    sourceObjects: collected.descriptors,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, collected.descriptors),
  };
}

export function createAndresgRecoverySourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, pathlib, sys, warnings
warnings.filterwarnings('ignore')
import numpy as np
import pyarrow.parquet as pq

root=pathlib.Path(sys.argv[1])/'repos'
specs=[
 ('cube',50,32170,'cube_pickup','recovery'),
 ('recovery',16,12737,'default','in_distribution'),
 ('new_positions',16,18373,'default','new_positions'),
 ('different_object',16,12778,'default','different_object'),
 ('distractors',16,10024,'default','distractors'),
 ('reduced_lighting',16,13897,'default','reduced_lighting'),
 ('seed2000',16,13230,'seed2000','in_distribution'),
 ('seed_diff',16,16838,'seed2000','different_object'),
 ('seed_distractors',16,10931,'seed2000','distractors'),
 ('seed_light',16,16273,'seed2000','reduced_lighting'),
 ('seed_positions',16,18360,'seed2000','new_positions'),
]
columns=['action','observation.state','timestamp','frame_index','episode_index','index','task_index']
native_words=['success','failure','outcome','reward','done','terminal','intervention','recovery']

def die(code): raise RuntimeError('ANDRESG_RECOVERY_PYTHON_'+code)
def canonical(value): return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False)
def sha_bytes(value): return 'sha256:'+hashlib.sha256(value).hexdigest()
def ah(array):
    value=np.ascontiguousarray(array)
    return sha_bytes(str(value.dtype).encode()+str(value.shape).encode()+value.tobytes())
def arrays(table):
    result={}
    for name in columns:
        if name in ['action','observation.state']:
            result[name]=np.asarray(table[name].to_pylist(),dtype='<f4')
        else:
            result[name]=np.asarray(table[name].to_numpy(zero_copy_only=False),
              dtype='<f4' if name=='timestamp' else '<i8')
    return result

repositories={};trajectory_profiles=[];task_payloads=[];logical_schema=None
total_image_stats_count_one_modality=0
for key,episodes_expected,frames_expected,cohort,condition in specs:
    base=root/key;data_path=base/'data/chunk-000/file-000.parquet'
    pf=pq.ParquetFile(data_path);table=pf.read();value=arrays(table)
    episode_pf=pq.ParquetFile(base/'meta/episodes/chunk-000/file-000.parquet')
    episodes=episode_pf.read().to_pylist()
    info=json.loads((base/'meta/info.json').read_text(encoding='utf-8'))
    stats=json.loads((base/'meta/stats.json').read_text(encoding='utf-8'))
    tasks=pq.read_table(base/'meta/tasks.parquet').to_pylist()
    schema=str(pf.schema_arrow.remove_metadata())
    if logical_schema is None:logical_schema=schema
    if (table.column_names!=columns or schema!=logical_schema
        or pf.metadata.num_rows!=frames_expected
        or pf.metadata.num_row_groups!=episodes_expected or pf.metadata.num_columns!=7
        or value['action'].shape!=(frames_expected,6)
        or value['observation.state'].shape!=(frames_expected,6)):
        die('DATA_PROFILE_INVALID_'+key)
    if not all(np.isfinite(value[name]).all()
      for name in ['action','observation.state','timestamp']):die('NONFINITE_'+key)
    if (len(episodes)!=episodes_expected
        or [row['episode_index'] for row in episodes]!=list(range(episodes_expected))
        or sum(row['length'] for row in episodes)!=frames_expected):
        die('EPISODE_PROFILE_INVALID_'+key)
    if (info['robot_type']!='so_follower' or info['total_episodes']!=episodes_expected
        or info['total_frames']!=frames_expected or info['total_tasks']!=1
        or info['fps']!=30 or info['splits']!={'train':f'0:{episodes_expected}'}
        or info['features']['action']['shape']!=[6]
        or info['features']['observation.state']['shape']!=[6]):
        die('INFO_PROFILE_INVALID_'+key)
    if len(tasks)!=1 or tasks[0]['task_index']!=0 or not isinstance(tasks[0]['task'],str):
        die('TASK_PROFILE_INVALID_'+key)
    task_payloads.append(tasks[0]['task'])
    native_data=sorted([name for name in table.column_names
      if any(word in name.lower() for word in native_words)])
    native_episode=sorted([name for name in episode_pf.schema_arrow.names
      if any(word in name.lower() for word in native_words)])
    if native_data or native_episode:die('NATIVE_BOUNDARY_FIELD_'+key)
    scalar_keys=['action','observation.state','timestamp','frame_index','episode_index','index','task_index']
    if any(stats[name]['count']!=[frames_expected] for name in scalar_keys):
        die('SCALAR_STATS_COUNT_'+key)
    image_keys=sorted(name for name in stats if name.startswith('observation.images.'))
    if len(image_keys)!=2 or stats[image_keys[0]]['count']!=stats[image_keys[1]]['count']:
        die('IMAGE_STATS_PROFILE_'+key)
    image_count=int(stats[image_keys[0]]['count'][0]);total_image_stats_count_one_modality+=image_count
    timestamp_error=0.0;repo_profiles=[]
    for row in episodes:
        lo=int(row['dataset_from_index']);hi=int(row['dataset_to_index']);n=int(row['length'])
        if (hi-lo!=n or lo!=(0 if row['episode_index']==0 else
            episodes[row['episode_index']-1]['dataset_to_index'])
            or not np.array_equal(value['frame_index'][lo:hi],np.arange(n,dtype='<i8'))
            or set(value['episode_index'][lo:hi].tolist())!={row['episode_index']}
            or not np.array_equal(value['index'][lo:hi],np.arange(lo,hi,dtype='<i8'))
            or set(value['task_index'][lo:hi].tolist())!={0}):
            die('EPISODE_CROSSWALK_'+key+'_'+str(row['episode_index']))
        timestamp_error=max(timestamp_error,float(np.max(np.abs(
          value['timestamp'][lo:hi]-np.arange(n)/30))))
        field_hashes={name:ah(value[name][lo:hi]) for name in columns}
        trajectory_hash=sha_bytes(canonical(field_hashes).encode())
        profile={'repositoryKey':key,'episodeIndex':row['episode_index'],
          'rows':n,'trajectoryHash':trajectory_hash}
        repo_profiles.append(profile);trajectory_profiles.append(profile)
    profile_root=sha_bytes(('\n'.join(row['trajectoryHash'] for row in repo_profiles)+'\n').encode())
    repositories[key]={'cohortNameClaim':cohort,'conditionNameClaim':condition,
      'episodes':episodes_expected,'frames':frames_expected,'rowGroups':pf.metadata.num_row_groups,
      'lengthMin':min(row['length'] for row in episodes),
      'lengthMax':max(row['length'] for row in episodes),
      'trajectoryProfileRoot':profile_root,'trajectoryProfiles':repo_profiles,
      'uniqueTrajectoryHashes':len(set(row['trajectoryHash'] for row in repo_profiles)),
      'logicalSchemaSha256':sha_bytes(schema.encode()),
      'columnHashes':{name:ah(array) for name,array in value.items()},
      'finiteActionStateTimestampRows':frames_expected,
      'timestampAt30FpsMaxAbsoluteError':timestamp_error,
      'imageStatsCountPerModality':image_count,
      'imageStatsCountShortfallFromFrames':frames_expected-image_count,
      'nativeDataBoundaryFields':native_data,'nativeEpisodeBoundaryFields':native_episode,
      'publisherRobotType':info['robot_type']}

if len(set(task_payloads))!=1:die('TASK_PAYLOAD_DRIFT')
task_payload=task_payloads[0]
if sha_bytes(task_payload.encode())!='sha256:048baff29f66665f22642d0d7b272193858829ec3eacd2c324f759a2ea84a524':
    die('TASK_HASH_INVALID')
hashes=[row['trajectoryHash'] for row in trajectory_profiles]
if len(hashes)!=210 or len(set(hashes))!=210:die('TRAJECTORY_HASH_UNIQUENESS_INVALID')
pairs=[('in_distribution','recovery','seed2000'),
 ('different_object','different_object','seed_diff'),
 ('distractors','distractors','seed_distractors'),
 ('reduced_lighting','reduced_lighting','seed_light'),
 ('new_positions','new_positions','seed_positions')]
pair_profiles=[]
for condition,left,right in pairs:
    a={row['trajectoryHash'] for row in repositories[left]['trajectoryProfiles']}
    b={row['trajectoryHash'] for row in repositories[right]['trajectoryProfiles']}
    pair_profiles.append({'conditionNameClaim':condition,'defaultRepositoryKey':left,
      'seed2000RepositoryKey':right,'defaultEpisodes':len(a),'seed2000Episodes':len(b),
      'exactTrajectoryHashOverlap':len(a&b),'localEpisodeIndexUsedAsPairKey':False})
    if a&b:die('PAIR_TRAJECTORY_OVERLAP_'+condition)

print(canonical({
 'schema':{'logicalDataSchemaSha256':sha_bytes(logical_schema.encode()),
  'dataColumns':columns,'actionDimensions':6,'stateDimensions':6},
 'repositories':repositories,
 'family':{'repositoryCount':11,'repositoryEpisodeOccurrences':210,
  'repositoryFrameOccurrences':175611,'uniqueExactTrajectoryHashes':210,
  'trajectoryHashCollisions':0,
  'sortedTrajectoryProfileRoot':sha_bytes(('\n'.join(sorted(hashes))+'\n').encode()),
  'trajectoryProfiles':trajectory_profiles,
  'conditionPairProfiles':pair_profiles,
  'totalImageStatsCountOneModalityPerRepository':total_image_stats_count_one_modality,
  'imageStatsCountShortfallFromFrames':175611-total_image_stats_count_one_modality},
 'task':{'taskPayloadSha256':sha_bytes(task_payload.encode()),
  'taskUtf8Bytes':len(task_payload.encode()),'taskWords':len(task_payload.split()),
  'taskPayloadProjected':False}
}))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable ?? process.env.OUTSIDER_ANDRESG_RECOVERY_PYTHON
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

export function buildAndresgRecoveryArtifactFromSourceDirectory(
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
  const sourceRows = collected.sources.map(({ spec, record,
    recordRawBeforeAfterExact, treeRawBeforeAfterExact }) => ({
      key: spec.key, id: spec.id, revision: spec.revision,
      cohortNameClaim: spec.cohort, conditionNameClaim: spec.condition,
      publicAtAcquisition: true, gatedAtAcquisition: false,
      disabledAtAcquisition: false, apiUsedStorageBytes: record.usedStorage,
      recordStableProjectionBeforeAfterExact: true,
      treeStableProjectionBeforeAfterExact: true,
      recordResponseBeforeAfterExact: recordRawBeforeAfterExact,
      treeResponseBeforeAfterExact: treeRawBeforeAfterExact,
      treeRawDriftReason: treeRawBeforeAfterExact ? null
        : "mutable_expanded_tree_metadata_only",
    }));
  const trajectoryProfilesHash = digest(TRAJECTORY_DOMAIN,
    replay.family.trajectoryProfiles);
  const reportBody = {
    schema: ANDRESG_RECOVERY_SCHEMA,
    disposition: ANDRESG_RECOVERY_DISPOSITION,
    scope: {
      kind: ANDRESG_RECOVERY_SCOPE, producer: "Andresg324",
      authorFullListDatasets: 56, literalRecoveryIdRepositories: 11,
      fixedRevisionRepositories: 11,
      completePinnedNoVideoObjects: 77,
      completePinnedNoVideoBytes: 12_264_506,
      selectedUniquePayloads: 57, selectedUniquePayloadBytes: 12_217_566,
      fullTreeEntries: 209, fullTreeFiles: 99, fullTreeDirectories: 110,
      fullTreeFileBytes: 1_462_198_009,
      videoObjectsInventoriedNotAcquired: 22,
      videoBytesInventoriedNotAcquired: 1_449_933_503,
      rawVideoObjectsAcquired: 0, rawVideoBytesAcquired: 0,
      repositoryEpisodeOccurrences: 210,
      repositoryFrameOccurrences: 175_611,
      exactTrajectoryRecordHashes: 210,
      globalUnderlyingExecutionCount: null,
      declaredLiteralRecoveryNameScopeExhausted: true,
      authorDatasetUniverseExhausted: false,
      globalSourceUniverseExhausted: false,
      allModalitiesAcquired: false, fullRepositoriesAcquired: false,
    },
    source: {
      authorDiscovery: {
        endpointAuthor: "Andresg324", full: true, limit: 1000,
        beforeAfterDatasetCount: 56, literalRecoveryIdMatches: 11,
        selectedProjectionBeforeAfterExact: true,
        rawResponseBeforeAfterExact: collected.authorRawBeforeAfterExact,
      },
      sources: sourceRows,
      recordStableProjectionBeforeAfterExactRepositories: 11,
      treeStableProjectionBeforeAfterExactRepositories: 11,
      completeTreeSnapshots: 22, paginationRequiredRepositories: 0,
      sourceManifestHash: sourceManifest.manifestHash,
      sourceManifestFileSha256: manifestFile.sha256,
      sourceRoot: sourceManifest.sourceRoot,
    },
    replay: { ...replay,
      extractorSha256: sha256(Buffer.from(PYTHON_REPLAY, "utf8")) },
    linkedFamily: {
      typedPopulation: "PUBLISHER_AUTHOR_LIST_LITERAL_RECOVERY_ID_REPOSITORY",
      repositoryCount: 11, rolloutRepositoryCount: 10,
      cubePickupRepositoryCount: 1,
      publisherNameDerivedCohorts: ["cube_pickup", "default", "seed2000"],
      publisherNameDerivedConditions: ["different_object", "distractors",
        "in_distribution", "new_positions", "recovery", "reduced_lighting"],
      conditionPairProfiles: replay.family.conditionPairProfiles,
      conditionNamePromotedToObservedEnvironment: false,
      seedNamePromotedToExecutedRandomSeed: false,
      localEpisodeIndexPromotedToCrossRepositoryPairKey: false,
      repositoryTimestampsPromotedToTrajectoryChronology: false,
      exactTrajectoryHashOverlapAcrossRepositories: 0,
      exactTrajectoryRecordHashes: 210,
      trajectoryProfilesHash,
      exactRecordHashUniquenessEstablishesUnderlyingExecutionUniqueness: false,
      globalUnderlyingExecutionCount: null,
    },
    mechanics: {
      actionDimensions: 6, stateDimensions: 6,
      publisherRobotType: "so_follower",
      finiteActionStateTimestampRepositoryFrameOccurrences: 175_611,
      independentMechanicalCalibrationRows: 0,
    },
    sidecarDrift: {
      stateActionScalarStatsCount: 175_611,
      imageStatsCountOneModalityPerRepository: 32_299,
      imageStatsCountShortfallFromRepositoryFrames: 143_312,
      imageStatsCountInterpretedAsMissingVisualFrames: false,
      imageStatsSemanticsIndependentlyAdjudicated: false,
      silentNormalizationApplied: false,
    },
    repositoryNaming: {
      allSelectedIdsContainLiteralRecovery: true,
      literalRecoveryNamingPromotedToNativeRecoveryField: false,
      literalRecoveryNamingPromotedToObservedRecovery: false,
      literalRecoveryNamingPromotedToOutcome: false,
      taskPayloadProjectedIntoReport: false,
      taskPayloadSha256: replay.task.taskPayloadSha256,
    },
    videoInventory: {
      typedPopulation: "PINNED_TREE_VIDEO_OBJECT_IDENTITY_CLAIM",
      physicalObjects: collected.videoInventory.physicalObjects,
      physicalBytes: collected.videoInventory.physicalBytes,
      uniquePayloadClaims: collected.videoInventory.uniquePayloadClaims,
      uniquePayloadClaimBytes: collected.videoInventory.uniquePayloadClaimBytes,
      payloadOccurrenceCounts: { 1: 22 },
      inventoryHash: collected.videoInventory.inventoryHash,
      rawVideoObjectsAcquired: 0, rawVideoBytesAcquired: 0,
      selectedNoVideoBytesAddedToVideoInventoryBytes: false,
      combinedModalityByteTotalDefined: false,
    },
    execution: {
      publisherRobotType: "so_follower",
      byteNativeStateActionRows: 175_611,
      simulationOrPhysicalExecutionNativeFieldRows: 0,
      independentlyVerifiedPhysicalExecutionRows: 0,
      independentVisualWitnessRows: 0,
      downloadedActionsExecuted: 0, networkActionsReplayed: 0,
    },
    outcome: {
      directDataSuccessFailureOutcomeFields: [],
      directEpisodeSuccessFailureOutcomeFields: [],
      publisherOutcomeLabelRows: 0,
      independentlyVerifiedOutcomeRows: 0, independentEffectRows: 0,
      completeCollectionAttemptCensusRows: 0,
    },
    recovery: {
      byteNativeInterventionFields: [], byteNativeRecoveryFields: [],
      repositoryNamingPromotedToRecovery: false,
      pairedFailureToRecoveryRows: 0,
      independentlyVerifiedRecoveryRows: 0, causalRecoveryEffectRows: 0,
      completeAttemptCensusRows: 0,
    },
    privacy: {
      rawVisualObjects: 0, rawVisualBytes: 0, rawAudioBytes: 0,
      rawNoVideoFilesPrivate: true, taskPayloadProjectedIntoReport: false,
      taskPayloadSha256: replay.task.taskPayloadSha256,
      independentPrivacyAuditRows: 0,
      noPiiOrSensitiveDataGuaranteed: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    activeContent: {
      downloadedCodeFiles: 0, executableFilesAcquired: 0,
      downloadedActionsExecuted: 0, rawActionsExecuted: 0,
      rawTextProjectedIntoCommands: 0, networkActionsReplayed: 0,
    },
    rights: {
      datasetApiLicenseClaims: Object.fromEntries(sourceRows.map((row) =>
        [row.key, "apache-2.0"])),
      datasetCardLicenseClaims: Object.fromEntries(sourceRows.map((row) =>
        [row.key, "apache-2.0"])),
      fixedTreeReadmeFiles: 11, fixedTreeLicenseTextFiles: 0,
      publisherLicenseClaimsPromotedToIndependentRightsAdjudication: false,
      datasetRightsIndependentlyAdjudicated: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
      commercialUseAuthorizedByThisArtifact: false,
      legalConclusionEstablished: false,
    },
    denominators: {
      PHYSICAL_SELECTED_NO_VIDEO_OBJECT: 77,
      PHYSICAL_SELECTED_NO_VIDEO_BYTE: 12_264_506,
      REPOSITORY_EPISODE_OCCURRENCE: 210,
      REPOSITORY_FRAME_OCCURRENCE: 175_611,
      EXACT_TRAJECTORY_RECORD_HASH: 210,
      PINNED_TREE_VIDEO_OBJECT_CLAIM: 22, RAW_VISUAL_BYTE: 0,
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

export function createAndresgRecoveryReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: ANDRESG_RECOVERY_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    scope: ANDRESG_RECOVERY_SCOPE, fixedRevisionRepositories: 11,
    selectedNoVideoObjects: 77, selectedNoVideoBytes: 12_264_506,
    repositoryEpisodeOccurrences: 210, repositoryFrameOccurrences: 175_611,
    exactTrajectoryRecordHashes: 210, rawVideoBytes: 0,
    independentlyVerifiedOutcomeRows: 0, independentEffectRows: 0,
    independentlyVerifiedRecoveryRows: 0, completeAttemptCensusRows: 0,
    authorizedTrainingRows: 0, offlineTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function serializeAndresgRecoveryArtifact(value) {
  return serialize(value);
}

export function verifyAndresgRecoveryArtifactDirectory(directory, options = {}) {
  try {
    const root = path.resolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700) fail("ARTIFACT_DIRECTORY_UNSAFE");
    const source = checkedPath(root, "source");
    const reportFile = readSmall(root, "report.json");
    const receiptFile = readSmall(root, "run-receipt.json");
    const manifestFile = readSmall(source, "source-manifest.json");
    if (!same(sorted(walk(root)), sorted([
      ...walk(source).map((item) => `source/${item}`),
      "report.json", "run-receipt.json",
    ]))) fail("ARTIFACT_LAYOUT_INVALID");
    const built = buildAndresgRecoveryArtifactFromSourceDirectory(source, {
      pythonExecutable: options.pythonExecutable,
    });
    const expectedReport = serialize(built.report);
    const receipt = createAndresgRecoveryReceipt(
      built.report, expectedReport, manifestFile.contents);
    const expectedReceipt = serialize(receipt);
    if (!reportFile.contents.equals(expectedReport)) fail("REPORT_BYTES_INVALID");
    if (!receiptFile.contents.equals(expectedReceipt)) fail("RECEIPT_BYTES_INVALID");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}
