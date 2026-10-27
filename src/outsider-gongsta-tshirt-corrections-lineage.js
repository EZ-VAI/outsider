/*
 * Fixed-revision, complete no-video replay of Gongsta's DK1 t-shirt
 * corrections repository, including its publisher backup episode metadata.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const GONGSTA_TSHIRT_SCHEMA =
  "outsider/gongsta-tshirt-corrections-lineage/v1";
export const GONGSTA_TSHIRT_RECEIPT_SCHEMA =
  "outsider/gongsta-tshirt-corrections-lineage-receipt/v1";
export const GONGSTA_TSHIRT_SCOPE =
  "COMPLETE_PINNED_REPOSITORY_NO_VIDEO_WITH_PUBLISHER_BACKUP_METADATA";
export const GONGSTA_TSHIRT_DISPOSITION = "QUARANTINE_EVAL_ONLY";

export const GONGSTA_TSHIRT_SOURCE = Object.freeze({
  id: "Gongsta/dagger_dk1_tshirt_corrections",
  revision: "4709f4e733dc4f884bc81cb211c1751e85ed87b7",
  author: "Gongsta",
  lastModified: "2026-03-24T01:00:01.000Z",
  apiUsedStorageBytes: 4_916_801_434,
  recordSiblingFiles: 318,
  treeEntries: 570,
  treeFiles: 318,
  treeDirectories: 252,
  treeFileBytes: 2_833_179_487,
  selectedNoVideoFiles: 40,
  selectedNoVideoBytes: 23_179_179,
  currentSemanticFiles: 29,
  currentSemanticBytes: 21_634_892,
  backupMetadataFiles: 11,
  backupMetadataBytes: 1_544_287,
  videoFiles: 278,
  videoBytes: 2_810_000_308,
});

const REPORT_DOMAIN = `${GONGSTA_TSHIRT_SCHEMA}/report`;
const RECEIPT_DOMAIN = `${GONGSTA_TSHIRT_RECEIPT_SCHEMA}/receipt`;
const MANIFEST_DOMAIN = `${GONGSTA_TSHIRT_SCHEMA}/source-manifest`;
const SOURCE_ROOT_DOMAIN = `${GONGSTA_TSHIRT_SCHEMA}/source-root`;
const VIDEO_PATH_DOMAIN = `${GONGSTA_TSHIRT_SCHEMA}/video-path-inventory`;
const VIDEO_PAYLOAD_DOMAIN = `${GONGSTA_TSHIRT_SCHEMA}/video-payload-inventory`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const TREE_PAGE_LENGTHS = Object.freeze([100, 100, 100, 100, 100, 70]);
const DATA_ROWS = Object.freeze([
  19, 2_223, 1_746, 1_729, 1_995, 2_384, 2_470, 5_841, 26_171,
  21_532, 7_824, 43_396,
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `GONGSTA_TSHIRT_${code}`
    : `GONGSTA_TSHIRT_${code}:${detail}`);
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
    id: GONGSTA_TSHIRT_SOURCE.id, author: GONGSTA_TSHIRT_SOURCE.author,
    sha: GONGSTA_TSHIRT_SOURCE.revision,
    lastModified: GONGSTA_TSHIRT_SOURCE.lastModified,
    private: false, gated: false, disabled: false,
    usedStorage: GONGSTA_TSHIRT_SOURCE.apiUsedStorageBytes,
    siblings: GONGSTA_TSHIRT_SOURCE.recordSiblingFiles,
    cardLicense: "apache-2.0", tagLicenses: ["license:apache-2.0"],
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

function isVideo(entry) {
  return entry.type === "file" && entry.path.endsWith(".mp4");
}

function isBackup(entry) {
  return entry.type === "file"
    && entry.path.startsWith("meta/episodes_backup_20260323_135935/");
}

function validateTreePages(pageFiles) {
  const pages = pageFiles.map((item, index) => {
    const value = parseJson(item.contents, "TREE_PAGE_JSON_INVALID");
    if (!Array.isArray(value) || value.length !== TREE_PAGE_LENGTHS[index]) {
      fail("TREE_PAGE_LENGTH_INVALID", String(index + 1));
    }
    return value;
  });
  const entries = pages.flat();
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const videos = files.filter((entry) => isVideo(entry));
  const selected = files.filter((entry) => !isVideo(entry));
  const backup = selected.filter((entry) => isBackup(entry));
  const current = selected.filter((entry) => !isBackup(entry));
  const licenses = files.filter((entry) =>
    /(^|\/)licen[sc]e(?:\.|$)/iu.test(entry.path));
  const readmes = files.filter((entry) => /(^|\/)readme(?:\.|$)/iu.test(entry.path));
  if (entries.length !== GONGSTA_TSHIRT_SOURCE.treeEntries
    || files.length !== GONGSTA_TSHIRT_SOURCE.treeFiles
    || directories.length !== GONGSTA_TSHIRT_SOURCE.treeDirectories
    || new Set(entries.map((entry) => entry.path)).size !== entries.length
    || files.reduce((sum, entry) => sum + entry.size, 0)
      !== GONGSTA_TSHIRT_SOURCE.treeFileBytes
    || videos.length !== GONGSTA_TSHIRT_SOURCE.videoFiles
    || videos.reduce((sum, entry) => sum + entry.size, 0)
      !== GONGSTA_TSHIRT_SOURCE.videoBytes
    || selected.length !== GONGSTA_TSHIRT_SOURCE.selectedNoVideoFiles
    || selected.reduce((sum, entry) => sum + entry.size, 0)
      !== GONGSTA_TSHIRT_SOURCE.selectedNoVideoBytes
    || current.length !== GONGSTA_TSHIRT_SOURCE.currentSemanticFiles
    || current.reduce((sum, entry) => sum + entry.size, 0)
      !== GONGSTA_TSHIRT_SOURCE.currentSemanticBytes
    || backup.length !== GONGSTA_TSHIRT_SOURCE.backupMetadataFiles
    || backup.reduce((sum, entry) => sum + entry.size, 0)
      !== GONGSTA_TSHIRT_SOURCE.backupMetadataBytes
    || licenses.length !== 0 || readmes.length !== 1
    || readmes[0].path !== "README.md") fail("TREE_PROFILE_INVALID");
  for (const entry of [...videos, ...selected.filter((item) => item.lfs)]) {
    if (!entry.lfs?.oid || entry.lfs.size !== entry.size || !entry.xetHash) {
      fail("LFS_IDENTITY_INVALID", entry.path);
    }
  }
  const data = selected.filter((entry) => entry.path.startsWith("data/"));
  if (data.length !== 12 || data.reduce((sum, entry) => sum + entry.size, 0)
      !== 19_564_743
    || !same(data.map((entry) => entry.size), DATA_ROWS.map((_, index) =>
      [5_115, 368_051, 291_103, 281_210, 334_350, 410_312, 384_877,
        946_085, 4_396_485, 3_572_733, 1_265_180, 7_309_242][index]))) {
    fail("DATA_TREE_PROFILE_INVALID");
  }
  return { pages, entries, files, directories, videos, selected, backup, current };
}

function groupIdentity(entries, identityFor) {
  const groups = new Map();
  for (const entry of entries) {
    const identity = identityFor(entry);
    const items = groups.get(identity) ?? [];
    items.push(entry); groups.set(identity, items);
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
  if (descriptors.length !== 40 || profiles.length !== 36
    || uniqueBytes !== 22_831_623 || !same(occurrenceCounts, { 1: 32, 2: 4 })) {
    fail("SELECTED_IDENTITY_PROFILE_INVALID");
  }
  return { physicalObjects: 40, physicalBytes: 23_179_179,
    uniquePayloads: 36, uniquePayloadBytes: uniqueBytes,
    occurrenceCounts, profiles };
}

function modality(videoPath) {
  for (const name of ["top", "left_wrist", "right_wrist"]) {
    if (videoPath.includes(`.${name}`)) return name;
  }
  fail("VIDEO_MODALITY_UNKNOWN", videoPath);
}

function makeVideoInventory(videos) {
  const physical = videos.map((entry) => ({
    path: entry.path, gitOid: entry.oid, lfsOid: entry.lfs.oid,
    xetHash: entry.xetHash, bytes: entry.size,
    pathClass: entry.path.startsWith("videos/")
      ? "CURRENT_CANONICAL_PATH" : "PUBLISHER_TMP_PATH",
    modality: modality(entry.path),
  })).sort((left, right) => left.path.localeCompare(right.path));
  const payloadGroups = groupIdentity(physical,
    (item) => `${item.lfsOid}:${item.bytes}`);
  const payloadProfiles = [...payloadGroups].map(([identity, items]) => ({
    lfsOid: identity.split(":")[0], bytes: items[0].bytes,
    occurrences: items.length,
    pathClasses: sorted([...new Set(items.map((item) => item.pathClass))]),
    modalities: sorted([...new Set(items.map((item) => item.modality))]),
    paths: sorted(items.map((item) => item.path)),
  })).sort((left, right) => left.lfsOid.localeCompare(right.lfsOid));
  const occurrenceCounts = payloadProfiles.reduce((result, item) => ({ ...result,
    [item.occurrences]: (result[item.occurrences] ?? 0) + 1 }), {});
  const canonical = physical.filter((item) =>
    item.pathClass === "CURRENT_CANONICAL_PATH");
  const temporary = physical.filter((item) =>
    item.pathClass === "PUBLISHER_TMP_PATH");
  const episode40Temporary = temporary.filter((item) =>
    item.path.endsWith("_040.mp4"));
  const otherTemporary = temporary.filter((item) =>
    !item.path.endsWith("_040.mp4"));
  const ep40Groups = groupIdentity(episode40Temporary,
    (item) => `${item.lfsOid}:${item.bytes}`);
  const ep40OccurrenceCounts = [...ep40Groups.values()].reduce((result, items) =>
    ({ ...result, [items.length]: (result[items.length] ?? 0) + 1 }), {});
  if (physical.length !== 278
    || physical.reduce((sum, item) => sum + item.bytes, 0) !== 2_810_000_308
    || payloadProfiles.length !== 84
    || payloadProfiles.reduce((sum, item) => sum + item.bytes, 0)
      !== 2_396_321_227
    || !same(occurrenceCounts, { 1: 75, 8: 3, 11: 2, 12: 1, 48: 2, 49: 1 })
    || canonical.length !== 40
    || canonical.reduce((sum, item) => sum + item.bytes, 0) !== 2_254_240_847
    || temporary.length !== 238
    || temporary.reduce((sum, item) => sum + item.bytes, 0) !== 555_759_461
    || episode40Temporary.length !== 208
    || episode40Temporary.reduce((sum, item) => sum + item.bytes, 0)
      !== 447_324_390
    || ep40Groups.size !== 14
    || [...ep40Groups].reduce((sum, [identity]) =>
      sum + Number(identity.split(":")[1]), 0) !== 33_645_309
    || !same(ep40OccurrenceCounts, { 1: 5, 8: 3, 11: 2, 12: 1, 48: 2, 49: 1 })
    || otherTemporary.length !== 30
    || otherTemporary.reduce((sum, item) => sum + item.bytes, 0) !== 108_435_071) {
    fail("VIDEO_INVENTORY_PROFILE_INVALID");
  }
  return deepFreeze({
    physicalEntries: physical, physicalEntryCount: 278,
    physicalBytes: 2_810_000_308, uniquePayloads: 84,
    uniquePayloadBytes: 2_396_321_227, payloadProfiles, occurrenceCounts,
    canonical: { objects: 40, bytes: 2_254_240_847,
      modalityObjects: { left_wrist: 13, right_wrist: 13, top: 14 } },
    publisherTemporary: { objects: 238, bytes: 555_759_461,
      modalityObjects: { left_wrist: 79, right_wrist: 79, top: 80 },
      episode40PhysicalObjects: 208, episode40PhysicalBytes: 447_324_390,
      episode40UniquePayloadClaims: 14,
      episode40UniquePayloadClaimBytes: 33_645_309,
      episode40PayloadOccurrenceCounts: ep40OccurrenceCounts,
      otherEpisodePhysicalObjects: 30, otherEpisodePhysicalBytes: 108_435_071,
      otherEpisodeUniquePayloadClaims: 30 },
    pathInventoryHash: digest(VIDEO_PATH_DOMAIN, physical),
    payloadInventoryHash: digest(VIDEO_PAYLOAD_DOMAIN, payloadProfiles),
  });
}

function collectTreeSnapshot(root, suffix) {
  const pageFiles = TREE_PAGE_LENGTHS.map((_, index) => readSmall(root,
    `metadata/hf-tree-${suffix}-page-${String(index + 1).padStart(3, "0")}.json`));
  return { pageFiles, tree: validateTreePages(pageFiles) };
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const recordBefore = readSmall(root, "metadata/hf-record-before.json");
  const recordAfter = readSmall(root, "metadata/hf-record-after.json");
  const recordProjectionBefore = validateRecord(recordBefore.contents);
  const recordProjectionAfter = validateRecord(recordAfter.contents);
  if (!same(recordProjectionBefore, recordProjectionAfter)) {
    fail("RECORD_PROJECTION_CHANGED");
  }
  const before = collectTreeSnapshot(root, "before");
  const after = collectTreeSnapshot(root, "after");
  if (!same(stableTree(before.tree.entries), stableTree(after.tree.entries))) {
    fail("TREE_STABLE_PROJECTION_CHANGED");
  }
  const descriptors = [recordBefore, recordAfter,
    ...before.pageFiles, ...after.pageFiles].map((item) => ({
      path: item.path, bytes: item.bytes, sha256: item.sha256,
    }));
  const selectedDescriptors = [];
  for (const entry of before.tree.selected) {
    const relative = `repo/${entry.path}`;
    const expectedSha = entry.lfs?.oid ? `sha256:${entry.lfs.oid}` : null;
    const inspected = inspectRegular(root, relative, entry.size, expectedSha);
    if (!entry.lfs) {
      const bytes = readFileSync(checkedPath(root, relative));
      if (gitBlobOid(bytes) !== entry.oid) {
        fail("SELECTED_GIT_OID_INVALID", entry.path);
      }
    }
    descriptors.push(inspected); selectedDescriptors.push(inspected);
  }
  descriptors.sort((left, right) => left.path.localeCompare(right.path));
  const expected = descriptors.map((entry) => entry.path);
  if (withManifest) expected.push("source-manifest.json");
  if (!same(sorted(walk(root)), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  return {
    root, descriptors, selectedDescriptors,
    selectedIdentity: selectedIdentity(selectedDescriptors),
    videoInventory: makeVideoInventory(before.tree.videos),
    recordProjection: recordProjectionBefore,
    recordRawBeforeAfterExact: recordBefore.contents.equals(recordAfter.contents),
    treePagesRawBeforeAfterExact: before.pageFiles.map((item, index) =>
      item.contents.equals(after.pageFiles[index].contents)),
    tree: before.tree,
  };
}

function manifestBody(collected) {
  return {
    schema: "outsider/gongsta-tshirt-corrections-lineage-source/v1",
    scope: GONGSTA_TSHIRT_SCOPE,
    source: {
      id: GONGSTA_TSHIRT_SOURCE.id, revision: GONGSTA_TSHIRT_SOURCE.revision,
      publicAtAcquisition: true, gatedAtAcquisition: false,
      disabledAtAcquisition: false,
      recordStableProjectionBeforeAfterExact: true,
      treeStableProjectionBeforeAfterExact: true,
      recordRawBeforeAfterExact: collected.recordRawBeforeAfterExact,
      treePageRawBeforeAfterExact: collected.treePagesRawBeforeAfterExact,
      treePagesPerSnapshot: 6, treeEntries: 570, treeFiles: 318,
      treeDirectories: 252, treeFileBytes: 2_833_179_487,
    },
    selected: collected.selectedIdentity,
    videoInventory: collected.videoInventory,
    sourceObjects: collected.descriptors,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, collected.descriptors),
  };
}

export function createGongstaTshirtSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, pathlib, sys, warnings
warnings.filterwarnings('ignore')
import numpy as np
import pyarrow.parquet as pq

root=pathlib.Path(sys.argv[1])/'repo'
data_paths=sorted((root/'data').rglob('*.parquet'))
current_paths=sorted((root/'meta'/'episodes').rglob('*.parquet'))
backup_paths=sorted((root/'meta'/'episodes_backup_20260323_135935').rglob('*.parquet'))
data_rows=[19,2223,1746,1729,1995,2384,2470,5841,26171,21532,7824,43396]
data_rowgroups=[1,11,5,5,4,5,8,13,60,37,16,59]
current_rows=[1,11,5,5,4,5,8,1,60,37,16,59]
backup_rows=[1,11,5,5,4,5,8,1,60,37,16]
fragment_lengths=[601,301,367,665,88,289,1128,145,495,693,327,343]
columns=['action','observation.state','timestamp','frame_index','episode_index','index','task_index']
native_words=['success','failure','outcome','reward','done','terminal','intervention','recovery']

def die(code): raise RuntimeError('GONGSTA_TSHIRT_PYTHON_'+code)
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
def read_episode_rows(paths):
    rows=[]
    for value in paths: rows.extend(pq.read_table(value).to_pylist())
    return rows
def equal_value(a,b):
    if isinstance(a,float) and isinstance(b,float) and math.isnan(a) and math.isnan(b): return True
    return a==b
def row_differences(a,b):
    differences=[]
    for key in sorted(set(a)|set(b)):
        if key not in a or key not in b or not equal_value(a.get(key),b.get(key)):
            differences.append(key)
    return differences

if len(data_paths)!=12 or len(current_paths)!=12 or len(backup_paths)!=11:
    die('FILE_COUNT_INVALID')
tables=[];data=[];file_profiles=[]
logical_schema=None;physical_rowgroups=0
for i,p in enumerate(data_paths):
    pf=pq.ParquetFile(p);table=pf.read();value=arrays(table)
    schema=str(pf.schema_arrow.remove_metadata())
    if (table.column_names!=columns or pf.metadata.num_rows!=data_rows[i]
        or pf.metadata.num_row_groups!=data_rowgroups[i]
        or pf.metadata.num_columns!=7): die('DATA_PROFILE_INVALID_'+str(i))
    if logical_schema is None: logical_schema=schema
    if schema!=logical_schema: die('LOGICAL_SCHEMA_DRIFT_'+str(i))
    if value['action'].shape!=(data_rows[i],28) or value['observation.state'].shape!=(data_rows[i],14):
        die('DIMENSIONS_INVALID_'+str(i))
    if not all(np.isfinite(value[name]).all() for name in ['action','observation.state','timestamp']):
        die('NONFINITE_DATA_'+str(i))
    tables.append(table);data.append(value);physical_rowgroups+=pf.metadata.num_row_groups
    file_profiles.append({'fileIndex':i,'rows':data_rows[i],
      'rowGroups':data_rowgroups[i],
      'episodeIndices':sorted(map(int,np.unique(value['episode_index']).tolist())),
      'indexMin':int(value['index'].min()),'indexMax':int(value['index'].max()),
      'columnHashes':{name:ah(value[name]) for name in columns}})

for i,p in enumerate(current_paths):
    pf=pq.ParquetFile(p)
    if pf.metadata.num_rows!=current_rows[i]:die('CURRENT_META_FILE_PROFILE_INVALID_'+str(i))
for i,p in enumerate(backup_paths):
    pf=pq.ParquetFile(p)
    if pf.metadata.num_rows!=backup_rows[i]:die('BACKUP_META_FILE_PROFILE_INVALID_'+str(i))
current=read_episode_rows(current_paths);backup=read_episode_rows(backup_paths)
if (len(current)!=212 or len(backup)!=153
    or [row['episode_index'] for row in current]!=list(range(212))
    or [row['episode_index'] for row in backup]!=list(range(153))
    or sum(row['length'] for row in current)!=111888
    or sum(row['length'] for row in backup)!=68492):die('EPISODE_METADATA_PROFILE_INVALID')
current_columns=pq.ParquetFile(current_paths[0]).schema_arrow.names
backup_columns=pq.ParquetFile(backup_paths[0]).schema_arrow.names
if current_columns!=backup_columns:die('BACKUP_SCHEMA_DRIFT')
native_data_fields=sorted([name for name in columns if any(word in name.lower() for word in native_words)])
native_meta_fields=sorted([name for name in current_columns if any(word in name.lower() for word in native_words)])
if native_data_fields or native_meta_fields:die('UNEXPECTED_NATIVE_BOUNDARY_FIELD')

canonical_arrays={name:[] for name in columns};canonical_file_rows=[];timestamp_error=0.0
for row in current:
    episode=int(row['episode_index']);file_index=int(row['data/file_index'])
    source=data[file_index];lo=int(row['dataset_from_index']);hi=int(row['dataset_to_index'])
    selected=np.where((source['index']>=lo)&(source['index']<hi)&
      (source['episode_index']==episode))[0]
    if (len(selected)!=row['length'] or hi-lo!=row['length']
        or not np.array_equal(source['frame_index'][selected],np.arange(row['length'],dtype='<i8'))
        or not np.array_equal(source['index'][selected],np.arange(lo,hi,dtype='<i8'))
        or set(source['task_index'][selected].tolist())!={0}):
        die('CURRENT_META_TO_DATA_CROSSWALK_INVALID_'+str(episode))
    timestamp_error=max(timestamp_error,float(np.max(np.abs(
      source['timestamp'][selected]-np.arange(row['length'])/50))))
    for name in columns:canonical_arrays[name].append(source[name][selected])
    canonical_file_rows.append({'episodeIndex':episode,'fileIndex':file_index,
      'rows':row['length'],'fromIndex':lo,'toIndexExclusive':hi})
canonical_arrays={name:np.concatenate(values) for name,values in canonical_arrays.items()}
if (len(canonical_arrays['index'])!=111888
    or not np.array_equal(canonical_arrays['index'],np.arange(111888,dtype='<i8'))
    or set(canonical_arrays['episode_index'].tolist())!=set(range(212))):
    die('CANONICAL_PROJECTION_INVALID')

physical={name:np.concatenate([value[name] for value in data]) for name in columns}
unique_index,counts=np.unique(physical['index'],return_counts=True)
if (len(physical['index'])!=117330 or len(unique_index)!=111888
    or not np.array_equal(unique_index,np.arange(111888,dtype='<i8'))
    or int(np.sum(counts-1))!=5442 or int(np.sum(counts>1))!=1128
    or physical_rowgroups!=224):die('PHYSICAL_ROW_PROFILE_INVALID')

file7=pq.ParquetFile(data_paths[7]);file8=pq.ParquetFile(data_paths[8])
if file7.metadata.num_row_groups!=13 or file8.metadata.num_row_groups!=60:
    die('EP40_FILE_ROWGROUP_PROFILE_INVALID')
first=arrays(file7.read_row_group(0))
if len(first['index'])!=399 or set(first['episode_index'].tolist())!={39}:
    die('EP39_ROWGROUP_INVALID')
fragments=[]
for row_group,expected_length in enumerate(fragment_lengths,start=1):
    segment=arrays(file7.read_row_group(row_group));length=len(segment['index'])
    if (length!=expected_length or set(segment['episode_index'].tolist())!={40}
        or not np.array_equal(segment['frame_index'],np.arange(length,dtype='<i8'))
        or not np.array_equal(segment['index'],np.arange(12965,12965+length,dtype='<i8'))
        or set(segment['task_index'].tolist())!={0}):
        die('EP40_FRAGMENT_INVALID_'+str(row_group))
    fragments.append({'physicalRowGroup':row_group,'rows':length,
      'frameFrom':0,'frameToExclusive':length,'globalIndexFrom':12965,
      'globalIndexToExclusive':12965+length,
      'semanticHash':sha_bytes(canonical({name:ah(segment[name]) for name in columns}).encode())})
canonical40=arrays(file8.read_row_group(0))
if (len(canonical40['index'])!=178 or set(canonical40['episode_index'].tolist())!={40}
    or not np.array_equal(canonical40['frame_index'],np.arange(178,dtype='<i8'))
    or not np.array_equal(canonical40['index'],np.arange(12965,13143,dtype='<i8'))):
    die('EP40_CANONICAL_INVALID')
fragment_hashes=[row['semanticHash'] for row in fragments]
if len(set(fragment_hashes))!=12:die('EP40_FRAGMENT_HASH_COLLISION')
same_frame_exact=0;comparable_rows=0
for row_group,fragment in enumerate(fragments,start=1):
    segment=arrays(file7.read_row_group(row_group));n=min(len(segment['index']),178)
    comparable_rows+=n
    exact=np.ones(n,dtype=bool)
    for name in ['action','observation.state','timestamp']:
        value=segment[name][:n]==canonical40[name][:n]
        exact &= np.all(value,axis=1) if value.ndim>1 else value
    same_frame_exact+=int(exact.sum())
if comparable_rows!=2013 or same_frame_exact!=0:die('EP40_FRAGMENT_CANONICAL_MATCH_INVALID')

fully_exact=0;only_video_end_drift=0;drift_fields=collections.Counter();drift_episodes=[]
for i,row in enumerate(backup):
    current_row=current[i];differences=row_differences(row,current_row)
    if not differences:fully_exact+=1
    expected=[f'videos/observation.images.{name}/to_timestamp'
      for name in ['left_wrist','right_wrist','top']]
    if differences==expected:
        only_video_end_drift+=1;drift_episodes.append(i)
    elif differences:die('BACKUP_UNEXPECTED_DRIFT_'+str(i))
    for name in differences:drift_fields[name]+=1
if fully_exact!=121 or only_video_end_drift!=32:die('BACKUP_DRIFT_PROFILE_INVALID')

info=json.loads((root/'meta'/'info.json').read_text(encoding='utf-8'))
stats=json.loads((root/'meta'/'stats.json').read_text(encoding='utf-8'))
if (info['robot_type']!='bi_dk1_follower' or info['total_episodes']!=212
    or info['total_frames']!=111888 or info['total_tasks']!=1 or info['fps']!=50
    or info['splits']!={'train':'0:212'}
    or info['features']['action']['shape']!=[28]
    or info['features']['observation.state']['shape']!=[14]):die('INFO_PROFILE_INVALID')
scalar_keys=['action','observation.state','timestamp','frame_index','episode_index','index','task_index']
if any(stats[name]['count']!=[111888] for name in scalar_keys):die('SCALAR_STATS_COUNT_INVALID')
image_keys=['observation.images.left_wrist','observation.images.top','observation.images.right_wrist']
if any(stats[name]['count']!=[25958] for name in image_keys):die('IMAGE_STATS_COUNT_INVALID')
episode_image_count_mismatches={}
for name in image_keys:
    field=f'stats/{name}/count'
    episode_image_count_mismatches[name]=sum(row[field]!=[row['length']] for row in current)
if set(episode_image_count_mismatches.values())!={204}:die('EPISODE_IMAGE_STATS_DRIFT_INVALID')
stat_errors={}
for name in scalar_keys:
    source=canonical_arrays[name].astype(np.float64)
    stat_errors[name]={operation:float(np.max(np.abs(
      getattr(source,operation)(axis=0)-np.asarray(stats[name][operation]))))
      for operation in ['min','max','mean','std']}
if (max(stat_errors['action'].values())>2e-6
    or max(stat_errors['observation.state'].values())>2e-6
    or max(stat_errors['timestamp'].values())>1e-6):die('CANONICAL_STATS_REPLAY_INVALID')

tasks=pq.read_table(root/'meta'/'tasks.parquet').to_pylist()
if len(tasks)!=1 or tasks[0]['task_index']!=0:die('TASK_PROFILE_INVALID')
task_payload=tasks[0]['__index_level_0__']
if sha_bytes(task_payload.encode())!='sha256:d1140c331e0b6dbcf87ce41fb55b11fa6016d50dd3bd6b20693357670a5665c1':
    die('TASK_HASH_INVALID')
current_video_refs=set();backup_video_refs=set()
for rows,target in [(current,current_video_refs),(backup,backup_video_refs)]:
    for row in rows:
        for name in ['top','left_wrist','right_wrist']:
            chunk=row[f'videos/observation.images.{name}/chunk_index']
            file=row[f'videos/observation.images.{name}/file_index']
            target.add(f'videos/observation.images.{name}/chunk-{chunk:03d}/file-{file:03d}.mp4')
if len(current_video_refs)!=40 or len(backup_video_refs)!=33 or not backup_video_refs<=current_video_refs:
    die('VIDEO_REFERENCE_PROFILE_INVALID')

print(canonical({
 'schema':{'logicalDataSchemaSha256':sha_bytes(logical_schema.encode()),
  'dataColumns':columns,'actionDimensions':28,'stateDimensions':14,
  'nativeDataBoundaryFields':native_data_fields,
  'nativeEpisodeBoundaryFields':native_meta_fields},
 'data':{'physicalRows':117330,'physicalRowGroups':224,'dataFiles':12,
  'uniqueGlobalIndices':111888,'globalIndexMin':0,'globalIndexMax':111887,
  'duplicateGlobalIndexKeys':1128,'duplicateIndexExtraRows':5442,
  'finiteActionStateTimestampRows':117330,'fileProfiles':file_profiles,
  'physicalColumnHashes':{name:ah(value) for name,value in physical.items()}},
 'canonical':{'metadataEpisodes':212,'metadataFrames':111888,
  'canonicalRows':111888,'canonicalRowGroupsRepresented':212,
  'canonicalColumnHashes':{name:ah(value) for name,value in canonical_arrays.items()},
  'timestampAt50FpsMaxAbsoluteError':timestamp_error,
  'episodeLengthMin':min(row['length'] for row in current),
  'episodeLengthMax':max(row['length'] for row in current)},
 'episode40':{'metadataSelectedFileIndex':int(current[40]['data/file_index']),
  'metadataSelectedRows':178,'physicalRowsAcrossFiles':5620,
  'physicalFileIndices':[7,8],'overlappingGlobalIndexKeys':1128,
  'overlapGlobalIndexFrom':12965,'overlapGlobalIndexToExclusive':14093,
  'fragmentPhysicalRows':5442,'fragmentRowGroups':12,
  'fragmentLengths':fragment_lengths,'fragmentProfiles':fragments,
  'fragmentProfileRoot':sha_bytes(canonical(fragments).encode()),
  'distinctFragmentSemanticHashes':12,'canonicalSemanticHash':sha_bytes(
    canonical({name:ah(canonical40[name]) for name in columns}).encode()),
  'sameFrameComparableRows':comparable_rows,
  'sameFrameExactActionStateTimestampRows':same_frame_exact},
 'backup':{'publisherPathLabel':'episodes_backup_20260323_135935',
  'metadataEpisodes':153,'metadataFrames':68492,'episodeIndexFrom':0,
  'episodeIndexToInclusive':152,'exactCurrentPrefixEpisodeIndices':True,
  'exactCurrentPrefixLengthsAndDatasetRanges':True,
  'wholeRowsExact':fully_exact,'rowsDifferingOnlyInThreeVideoEndTimestamps':only_video_end_drift,
  'videoEndTimestampDriftFields':dict(drift_fields),
  'videoEndTimestampDriftEpisodeIndices':drift_episodes,
  'rowsExactAfterExcludingVideoEndTimestamps':153},
 'sidecars':{'infoTotalEpisodes':info['total_episodes'],
  'infoTotalFrames':info['total_frames'],'infoFps':info['fps'],
  'publisherRobotType':info['robot_type'],
  'scalarAndStateActionStatsCount':111888,'imageStatsCountPerModality':25958,
  'imageStatsCountShortfallFromCanonicalFrames':85930,
  'episodeImageCountMismatchRowsPerModality':episode_image_count_mismatches,
  'canonicalScalarStatsMaxAbsoluteErrors':stat_errors,
  'currentCanonicalVideoPathsReferenced':len(current_video_refs),
  'backupCanonicalVideoPathsReferenced':len(backup_video_refs)},
 'task':{'taskPayloadSha256':sha_bytes(task_payload.encode()),
  'taskUtf8Bytes':len(task_payload.encode()),'taskWords':len(task_payload.split()),
  'taskPayloadProjected':False}
}))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable ?? process.env.OUTSIDER_GONGSTA_TSHIRT_PYTHON
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

export function buildGongstaTshirtArtifactFromSourceDirectory(
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
  const treeRawExactPages = collected.treePagesRawBeforeAfterExact
    .filter(Boolean).length;
  const reportBody = {
    schema: GONGSTA_TSHIRT_SCHEMA,
    disposition: GONGSTA_TSHIRT_DISPOSITION,
    scope: {
      kind: GONGSTA_TSHIRT_SCOPE, producer: "Gongsta",
      repositoryCount: 1, fixedRevisionCount: 1,
      completePinnedNoVideoObjects: 40,
      completePinnedNoVideoBytes: 23_179_179,
      currentSemanticObjects: 29, currentSemanticBytes: 21_634_892,
      publisherBackupMetadataObjects: 11,
      publisherBackupMetadataBytes: 1_544_287,
      selectedUniquePayloads: 36, selectedUniquePayloadBytes: 22_831_623,
      fullTreeEntries: 570, fullTreeFiles: 318, fullTreeDirectories: 252,
      fullTreeFileBytes: 2_833_179_487,
      videoObjectsInventoriedNotAcquired: 278,
      videoBytesInventoriedNotAcquired: 2_810_000_308,
      rawVideoObjectsAcquired: 0, rawVideoBytesAcquired: 0,
      allModalitiesAcquired: false, fullRepositoryAcquired: false,
      globalUnderlyingExecutionCount: null,
      globalSourceUniverseExhausted: false,
    },
    source: {
      id: GONGSTA_TSHIRT_SOURCE.id,
      revision: GONGSTA_TSHIRT_SOURCE.revision,
      publicAtAcquisition: true, gatedAtAcquisition: false,
      disabledAtAcquisition: false,
      apiUsedStorageBytes: GONGSTA_TSHIRT_SOURCE.apiUsedStorageBytes,
      apiUsedStorageAddedToPinnedTreeBytes: false,
      recordStableProjectionBeforeAfterExact: true,
      treeStableProjectionBeforeAfterExact: true,
      recordResponseBeforeAfterExact: collected.recordRawBeforeAfterExact,
      treePageResponsesBeforeAfterExactPages: treeRawExactPages,
      treePageResponsesBeforeAfterDifferentPages: 6 - treeRawExactPages,
      treeRawDriftReason: treeRawExactPages === 6 ? null
        : "mutable_expanded_tree_metadata_only",
      completePaginatedTreeSnapshots: 2, pagesPerTreeSnapshot: 6,
      sourceManifestHash: sourceManifest.manifestHash,
      sourceManifestFileSha256: manifestFile.sha256,
      sourceRoot: sourceManifest.sourceRoot,
    },
    replay: { ...replay,
      extractorSha256: sha256(Buffer.from(PYTHON_REPLAY, "utf8")) },
    lineage: {
      currentMetadataEpisodes: 212, currentMetadataFrames: 111_888,
      backupMetadataEpisodes: 153, backupMetadataFrames: 68_492,
      backupIsExactContiguousEpisodeIndexPrefix: true,
      backupWholeRowsExact: replay.backup.wholeRowsExact,
      backupRowsDifferingOnlyInThreeVideoEndTimestamps:
        replay.backup.rowsDifferingOnlyInThreeVideoEndTimestamps,
      backupRowsExactAfterExcludingVideoEndTimestamps: 153,
      backupRepresentsSeparateTrajectoryPayload: false,
      backupDataParquetObjects: 0,
      publisherBackupDirectoryNameEstablishesCreationChronology: false,
      publisherBackupDirectoryNameEstablishesAttemptLineage: false,
    },
    episode40: {
      ...replay.episode40,
      interpretation: "TWELVE_DISTINCT_RESET_TRAJECTORY_FRAGMENTS_PLUS_ONE_METADATA_SELECTED_CANONICAL_PROJECTION",
      fragmentsArePublisherLabeledAttempts: false,
      fragmentsArePublisherLabeledCorrections: false,
      fragmentsPromotedToAttempts: false,
      fragmentsPromotedToRecoveryEpisodes: false,
      fragmentOrderingEstablishesChronology: false,
      metadataSelectedCanonicalProjectionCount: 1,
      globalUnderlyingExecutionCount: null,
    },
    mechanics: {
      actionDimensions: 28, stateDimensions: 14,
      byteNativePhysicalRows: 117_330,
      metadataSelectedCanonicalRows: 111_888,
      finiteActionStateTimestampPhysicalRows: 117_330,
      physicalRowsAreNotAddedToCanonicalRows: true,
      publisherRobotType: replay.sidecars.publisherRobotType,
      independentMechanicalCalibrationRows: 0,
    },
    sidecarDrift: {
      infoFrameDenominator: 111_888,
      globalStateActionScalarStatsDenominator: 111_888,
      physicalParquetRowDenominator: 117_330,
      physicalExtraFragmentRows: 5_442,
      imageStatsCountPerModality: 25_958,
      imageStatsCountShortfallFromCanonicalFrames: 85_930,
      episodeImageCountMismatchRowsPerModality:
        replay.sidecars.episodeImageCountMismatchRowsPerModality,
      imageStatsCountInterpretedAsMissingVisualFrames: false,
      imageStatsSemanticsIndependentlyAdjudicated: false,
      byteNativeRowsAndPublisherSidecarsKeptSeparate: true,
      silentNormalizationApplied: false,
    },
    repositoryNaming: {
      nameContainsCorrections: true,
      correctionsNamingPromotedToNativeIntervention: false,
      correctionsNamingPromotedToRecovery: false,
      taskPayloadProjectedIntoReport: false,
      taskPayloadSha256: replay.task.taskPayloadSha256,
    },
    videoInventory: {
      typedPopulation: "PINNED_TREE_VIDEO_OBJECT_IDENTITY_CLAIM",
      physicalObjects: collected.videoInventory.physicalEntryCount,
      physicalBytes: collected.videoInventory.physicalBytes,
      uniquePayloadClaims: collected.videoInventory.uniquePayloads,
      uniquePayloadClaimBytes: collected.videoInventory.uniquePayloadBytes,
      payloadOccurrenceCounts: collected.videoInventory.occurrenceCounts,
      currentCanonicalPathObjects: collected.videoInventory.canonical.objects,
      currentCanonicalPathBytes: collected.videoInventory.canonical.bytes,
      currentMetadataReferencedCanonicalPaths: 40,
      backupMetadataReferencedCanonicalPaths: 33,
      publisherTemporaryPathObjects:
        collected.videoInventory.publisherTemporary.objects,
      publisherTemporaryPathBytes:
        collected.videoInventory.publisherTemporary.bytes,
      publisherTemporaryEpisode40PhysicalObjects:
        collected.videoInventory.publisherTemporary.episode40PhysicalObjects,
      publisherTemporaryEpisode40PhysicalBytes:
        collected.videoInventory.publisherTemporary.episode40PhysicalBytes,
      publisherTemporaryEpisode40UniquePayloadClaims:
        collected.videoInventory.publisherTemporary.episode40UniquePayloadClaims,
      publisherTemporaryEpisode40UniquePayloadClaimBytes:
        collected.videoInventory.publisherTemporary.episode40UniquePayloadClaimBytes,
      temporaryPathsEstablishTrajectoryAttemptCount: false,
      temporaryPayloadsEstablishTrajectoryChronology: false,
      pathInventoryHash: collected.videoInventory.pathInventoryHash,
      payloadInventoryHash: collected.videoInventory.payloadInventoryHash,
      rawVideoObjectsAcquired: 0, rawVideoBytesAcquired: 0,
      noVideoRowsReplayed: 0,
      selectedNoVideoBytesAddedToVideoInventoryBytes: false,
      combinedModalityByteTotalDefined: false,
    },
    execution: {
      publisherRobotType: replay.sidecars.publisherRobotType,
      publisherRepositoryTaskCategory: "robotics",
      byteNativeStateActionRows: 117_330,
      independentlyVerifiedPhysicalExecutionRows: 0,
      independentVisualWitnessRows: 0,
      downloadedActionsExecuted: 0, networkActionsReplayed: 0,
    },
    outcome: {
      directDataSuccessFailureOutcomeFields: [],
      directEpisodeSuccessFailureOutcomeFields: [],
      publisherOutcomeLabelRows: 0,
      independentlyVerifiedOutcomeRows: 0,
      independentEffectRows: 0,
      completeCollectionAttemptCensusRows: 0,
    },
    recovery: {
      byteNativeInterventionFields: [], byteNativeRecoveryFields: [],
      repositoryCorrectionsNamingPromotedToRecovery: false,
      episode40FragmentsPromotedToRecovery: false,
      pairedFailureToRecoveryRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      causalRecoveryEffectRows: 0,
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
      datasetApiLicenseClaim: "apache-2.0",
      datasetCardLicenseClaim: "apache-2.0",
      readmeLicenseClaim: "apache-2.0",
      fixedTreeReadmeFiles: 1, fixedTreeLicenseTextFiles: 0,
      publisherLicenseClaimPromotedToIndependentRightsAdjudication: false,
      datasetRightsIndependentlyAdjudicated: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
      commercialUseAuthorizedByThisArtifact: false,
      legalConclusionEstablished: false,
    },
    denominators: {
      PHYSICAL_SELECTED_NO_VIDEO_OBJECT: 40,
      PHYSICAL_SELECTED_NO_VIDEO_BYTE: 23_179_179,
      CURRENT_METADATA_EPISODE: 212, CURRENT_METADATA_FRAME: 111_888,
      DATA_PHYSICAL_ROW: 117_330, DATA_UNIQUE_GLOBAL_INDEX: 111_888,
      EPISODE40_TRAJECTORY_FRAGMENT: 12,
      EPISODE40_TRAJECTORY_FRAGMENT_ROW: 5_442,
      EPISODE40_METADATA_SELECTED_CANONICAL_ROW: 178,
      BACKUP_METADATA_EPISODE: 153, BACKUP_METADATA_FRAME: 68_492,
      PINNED_TREE_VIDEO_OBJECT_CLAIM: 278, RAW_VISUAL_BYTE: 0,
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

export function createGongstaTshirtReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: GONGSTA_TSHIRT_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    scope: GONGSTA_TSHIRT_SCOPE,
    fixedRevisionRepositories: 1, selectedNoVideoObjects: 40,
    selectedNoVideoBytes: 23_179_179,
    currentMetadataEpisodes: 212, currentMetadataFrames: 111_888,
    dataPhysicalRows: 117_330, dataUniqueGlobalIndices: 111_888,
    episode40TrajectoryFragments: 12, episode40FragmentRows: 5_442,
    backupMetadataEpisodes: 153, backupMetadataFrames: 68_492,
    rawVideoBytes: 0, independentlyVerifiedOutcomeRows: 0,
    independentEffectRows: 0, independentlyVerifiedRecoveryRows: 0,
    completeAttemptCensusRows: 0, authorizedTrainingRows: 0,
    offlineTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, authorityRows: 0, ceuRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function serializeGongstaTshirtArtifact(value) {
  return serialize(value);
}

export function verifyGongstaTshirtArtifactDirectory(directory, options = {}) {
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
    const built = buildGongstaTshirtArtifactFromSourceDirectory(source, {
      pythonExecutable: options.pythonExecutable,
    });
    const expectedReport = serialize(built.report);
    const receipt = createGongstaTshirtReceipt(
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
