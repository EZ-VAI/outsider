/*
 * Fixed-revision, complete no-video replay of three byte-linked handover
 * intervention representations published by Jiacheng0603.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const HANDOVER_LINKED_SCHEMA =
  "outsider/handover-linked-intervention-lineage/v1";
export const HANDOVER_LINKED_RECEIPT_SCHEMA =
  "outsider/handover-linked-intervention-lineage-receipt/v1";
export const HANDOVER_LINKED_SCOPE =
  "COMPLETE_PINNED_THREE_REPOSITORY_LINKED_FAMILY_NO_VIDEO";
export const HANDOVER_LINKED_DISPOSITION = "QUARANTINE_EVAL_ONLY";

const REPORT_DOMAIN = `${HANDOVER_LINKED_SCHEMA}/report`;
const RECEIPT_DOMAIN = `${HANDOVER_LINKED_RECEIPT_SCHEMA}/receipt`;
const MANIFEST_DOMAIN = `${HANDOVER_LINKED_SCHEMA}/source-manifest`;
const SOURCE_ROOT_DOMAIN = `${HANDOVER_LINKED_SCHEMA}/source-root`;
const VIDEO_PATH_DOMAIN = `${HANDOVER_LINKED_SCHEMA}/video-path-inventory`;
const VIDEO_PAYLOAD_DOMAIN = `${HANDOVER_LINKED_SCHEMA}/video-payload-inventory`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const MAX_FILE_BYTES = 64 * 1024 * 1024;

const SELECTED_PATHS = Object.freeze([
  ".gitattributes", "data/chunk-000/file-000.parquet",
  "meta/episodes/chunk-000/file-000.parquet", "meta/info.json",
  "meta/stats.json", "meta/tasks.parquet",
]);

export const HANDOVER_LINKED_SOURCES = deepFreeze([
  {
    key: "intervention", directory: "int",
    requestedIdFromTask:
      "Jiacheng0603/handover_208trajs_lerobot_dataset_pi05_task_cmd_crop_intervention",
    id: "Jiacheng0603/handover_lerobot_dataset_208trajs_pi05_task_cmd_crop_intervention",
    revision: "1e1dd392adeb27be69399484ec2040e7050400b0",
    lastModified: "2026-02-11T06:32:03.000Z",
    usedStorage: 8_599_999_878, treeFileBytes: 8_600_038_247,
    selectedBytes: 38_296_466, videoBytes: 8_561_741_781,
    episodes: 208, rows: 197_088, rowGroups: 208,
    dataBytes: 36_852_814,
    dataSha256:
      "sha256:61b3762f9cc51c4ff2c56dd7684e352fc3bc6febc4f6ce96fc3bfc0e6628533b",
  },
  {
    key: "no_intervention", directory: "no-int",
    requestedIdFromTask:
      "Jiacheng0603/handover_208trajs_lerobot_dataset_pi05_task_cmd_crop_no_intervention",
    id: "Jiacheng0603/handover_208trajs_lerobot_dataset_pi05_task_cmd_crop_no_intervention",
    revision: "22a03e642665ffa5423897210a8bed74b44196b4",
    lastModified: "2026-03-09T15:47:50.000Z",
    usedStorage: 8_589_790_539, treeFileBytes: 8_589_828_908,
    selectedBytes: 28_087_127, videoBytes: 8_561_741_781,
    episodes: 208, rows: 197_088, rowGroups: 1,
    dataBytes: 26_643_475,
    dataSha256:
      "sha256:7684bfd8a53d3ca5b160abb88bd2f823561bb9e7708122ff7e6435a9a8060219",
  },
  {
    key: "intervention_delta", directory: "delta",
    requestedIdFromTask:
      "Jiacheng0603/handover_208trajs_dataset_lerobot_pi05_task_camd_crop_intervention_delta",
    id: "Jiacheng0603/handover_208trajs_dataset_lerobot_pi05_task_camd_crop_intervention_delta",
    revision: "163b08aad34996b781c3e27acc61d5457183994f",
    lastModified: "2026-03-02T09:22:12.000Z",
    usedStorage: 8_401_705_263, treeFileBytes: 8_401_743_772,
    selectedBytes: 34_754_005, videoBytes: 8_366_989_767,
    episodes: 203, rows: 192_541, rowGroups: 203,
    dataBytes: 33_331_603,
    dataSha256:
      "sha256:e1cbdb7eb95927ef15369cc1b2c6ea3c79dd56110dbe01aa55af6b968c2fb31c",
  },
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `HANDOVER_LINKED_${code}`
    : `HANDOVER_LINKED_${code}:${detail}`);
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
  if (!same(projection, {
    id: spec.id, author: "Jiacheng0603", sha: spec.revision,
    lastModified: spec.lastModified, private: false, gated: false,
    disabled: false, usedStorage: spec.usedStorage, siblings: 49,
    cardLicense: null, tagLicenses: [],
  })) fail("RECORD_PROFILE_INVALID", spec.key);
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
  const videos = files.filter((entry) => entry.path.startsWith("videos/"));
  const selected = files.filter((entry) => !entry.path.startsWith("videos/"));
  const licenses = files.filter((entry) =>
    /(^|\/)licen[sc]e(?:\.|$)/iu.test(entry.path));
  const readmes = files.filter((entry) => /(^|\/)readme(?:\.|$)/iu.test(entry.path));
  if (!Array.isArray(entries) || entries.length !== 61 || files.length !== 49
    || directories.length !== 12
    || new Set(entries.map((entry) => entry.path)).size !== 61
    || files.reduce((sum, entry) => sum + entry.size, 0) !== spec.treeFileBytes
    || videos.length !== 43
    || videos.reduce((sum, entry) => sum + entry.size, 0) !== spec.videoBytes
    || selected.length !== 6
    || selected.reduce((sum, entry) => sum + entry.size, 0) !== spec.selectedBytes
    || !same(sorted(selected.map((entry) => entry.path)), sorted(SELECTED_PATHS))
    || licenses.length !== 0 || readmes.length !== 0) {
    fail("TREE_PROFILE_INVALID", spec.key);
  }
  const data = selected.find((entry) =>
    entry.path === "data/chunk-000/file-000.parquet");
  if (!data || data.size !== spec.dataBytes
    || `sha256:${data.lfs?.oid}` !== spec.dataSha256
    || data.lfs?.size !== spec.dataBytes) fail("DATA_TREE_JOIN_INVALID", spec.key);
  return { entries, files, directories, videos, selected };
}

function makeVideoInventory(sourceTrees) {
  const physical = [];
  for (const source of sourceTrees) {
    for (const entry of source.tree.videos) {
      if (!entry.lfs?.oid || entry.lfs.size !== entry.size || !entry.xetHash) {
        fail("VIDEO_IDENTITY_CLAIM_INVALID", `${source.spec.key}:${entry.path}`);
      }
      physical.push({ repositoryKey: source.spec.key, path: entry.path,
        gitOid: entry.oid, lfsOid: entry.lfs.oid, xetHash: entry.xetHash,
        bytes: entry.size });
    }
  }
  physical.sort((left, right) => left.path.localeCompare(right.path)
    || left.repositoryKey.localeCompare(right.repositoryKey));
  const pathMap = new Map();
  const payloadMap = new Map();
  for (const item of physical) {
    const pathItems = pathMap.get(item.path) ?? [];
    pathItems.push(item); pathMap.set(item.path, pathItems);
    const identity = `${item.lfsOid}:${item.bytes}`;
    const payloadItems = payloadMap.get(identity) ?? [];
    payloadItems.push(item); payloadMap.set(identity, payloadItems);
  }
  const byPath = [...pathMap].map(([videoPath, items]) => ({
    path: videoPath,
    identicalAcrossThreeRepositories:
      new Set(items.map((item) => `${item.lfsOid}:${item.bytes}`)).size === 1,
    entries: items.map(({ repositoryKey, gitOid, lfsOid, xetHash, bytes }) =>
      ({ repositoryKey, gitOid, lfsOid, xetHash, bytes })),
  })).sort((left, right) => left.path.localeCompare(right.path));
  const byPayload = [...payloadMap].map(([identity, items]) => ({
    lfsOid: identity.split(":")[0], bytes: items[0].bytes,
    occurrences: items.length,
    repositoryKeys: sorted([...new Set(items.map((item) => item.repositoryKey))]),
    paths: sorted([...new Set(items.map((item) => item.path))]),
  })).sort((left, right) => left.lfsOid.localeCompare(right.lfsOid));
  const occurrenceCounts = byPayload.reduce((counts, item) => ({ ...counts,
    [item.occurrences]: (counts[item.occurrences] ?? 0) + 1 }), {});
  if (physical.length !== 129
    || physical.reduce((sum, item) => sum + item.bytes, 0) !== 25_490_473_329
    || byPath.length !== 43
    || byPath.filter((item) => item.identicalAcrossThreeRepositories).length !== 40
    || byPayload.length !== 46
    || byPayload.reduce((sum, item) => sum + item.bytes, 0) !== 8_815_458_004
    || !same(occurrenceCounts, { 1: 3, 2: 3, 3: 40 })) {
    fail("VIDEO_INVENTORY_PROFILE_INVALID");
  }
  return deepFreeze({
    physicalEntries: physical, physicalEntryCount: 129,
    physicalBytes: 25_490_473_329, pathProfiles: byPath,
    pathProfileCount: 43, identicalPathProfiles: 40,
    differingPathProfiles: 3, payloadProfiles: byPayload,
    uniquePayloads: 46, uniquePayloadBytes: 8_815_458_004,
    payloadOccurrenceCounts: occurrenceCounts,
    pathProfileHash: digest(VIDEO_PATH_DOMAIN, byPath),
    payloadProfileHash: digest(VIDEO_PAYLOAD_DOMAIN, byPayload),
  });
}

function selectedIdentity(descriptors) {
  const groups = new Map();
  for (const item of descriptors) {
    const key = `${item.sha256}:${item.bytes}`;
    const values = groups.get(key) ?? [];
    values.push(item.path); groups.set(key, values);
  }
  const profiles = [...groups].map(([identity, paths]) => ({
    sha256: identity.slice(0, 71), bytes: Number(identity.slice(72)),
    occurrences: paths.length, paths: sorted(paths),
  })).sort((left, right) => left.sha256.localeCompare(right.sha256));
  const uniqueBytes = profiles.reduce((sum, item) => sum + item.bytes, 0);
  if (descriptors.length !== 18 || profiles.length !== 11
    || uniqueBytes !== 99_688_595) fail("SELECTED_IDENTITY_PROFILE_INVALID");
  return { physicalObjects: 18, physicalBytes: 101_137_598,
    uniquePayloads: 11, uniquePayloadBytes: uniqueBytes, profiles };
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const descriptors = [];
  const sources = [];
  const selectedDescriptors = [];
  for (const spec of HANDOVER_LINKED_SOURCES) {
    const prefix = `metadata/${spec.directory}`;
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
      const relative = `repos/${spec.directory}/${entry.path}`;
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
    sources.push({ spec, record: recordProjectionBefore,
      tree: parsedTreeBefore,
      recordRawBeforeAfterExact: recordBefore.contents.equals(recordAfter.contents),
      treeRawBeforeAfterExact: treeBefore.contents.equals(treeAfter.contents) });
  }
  descriptors.sort((left, right) => left.path.localeCompare(right.path));
  const expected = descriptors.map((entry) => entry.path);
  if (withManifest) expected.push("source-manifest.json");
  if (!same(sorted(walk(root)), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  return { root, descriptors, selectedDescriptors, sources,
    selectedIdentity: selectedIdentity(selectedDescriptors),
    videoInventory: makeVideoInventory(sources) };
}

function manifestBody(collected) {
  return {
    schema: "outsider/handover-linked-intervention-lineage-source/v1",
    scope: HANDOVER_LINKED_SCOPE,
    sources: collected.sources.map(({ spec, recordRawBeforeAfterExact,
      treeRawBeforeAfterExact }) => ({
      key: spec.key, directory: spec.directory, id: spec.id,
      requestedIdFromTask: spec.requestedIdFromTask,
      requestedIdMatchesOfficialRecordId: spec.requestedIdFromTask === spec.id,
      revision: spec.revision, publicAtAcquisition: true,
      gatedAtAcquisition: false, recordStableProjectionBeforeAfterExact: true,
      treeStableProjectionBeforeAfterExact: true,
      recordRawBeforeAfterExact, treeRawBeforeAfterExact,
      treeEntries: 61, treeFiles: 49, treeDirectories: 12,
      treeFileBytes: spec.treeFileBytes, selectedNoVideoFiles: 6,
      selectedNoVideoBytes: spec.selectedBytes, videoFilesExcluded: 43,
      videoBytesExcluded: spec.videoBytes,
    })),
    selected: collected.selectedIdentity,
    videoInventory: collected.videoInventory,
    sourceObjects: collected.descriptors,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, collected.descriptors),
  };
}

export function createHandoverLinkedSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, pathlib, sys, warnings
warnings.filterwarnings('ignore')
import numpy as np
import pyarrow.parquet as pq

root=pathlib.Path(sys.argv[1])
specs={
 'intervention':{'dir':'int','rows':197088,'episodes':208,'rowGroups':208,
  'profile':'sha256:0ee80ed52491ffd1d53f9216e20c32db73054e2b2a99e2f54a2b3e379271e801',
  'schema':'sha256:ad793fabd24ec864dbc41fb2ac6983add8412c1a9cc6c4647b72b1e0b8440a38'},
 'no_intervention':{'dir':'no-int','rows':197088,'episodes':208,'rowGroups':1,
  'profile':'sha256:946898b49580b1f4e1363020e561d7d77a5b24ba50d10c508d9b58e871c9d7ad',
  'schema':'sha256:69844761224b34ef2e121fcc0a2df4ab74ed1e510856fd06fa12fab0b10bb264'},
 'intervention_delta':{'dir':'delta','rows':192541,'episodes':203,'rowGroups':203,
  'profile':'sha256:52125b6f038d03cbdd05bf3f45f1b402a5ef3aafd2b594615b4912124cde0066',
  'schema':'sha256:ad793fabd24ec864dbc41fb2ac6983add8412c1a9cc6c4647b72b1e0b8440a38'},
}
columns=['observation.state','action','observation.intervention','timestamp',
 'frame_index','episode_index','index','task_index']
task_sha='sha256:75e8b1a467dfbb7cd72fafdce3a1118397f0e05ff6bfcb909b12acbcf7ad1f8a'
logical_schema_sha='sha256:978b6469aeb62e7861edfa810150b5f67d8f3fbf29d83d41bec6f317b88288e2'

def die(code): raise RuntimeError('HANDOVER_LINKED_PYTHON_'+code)
def canonical(value): return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def sha_bytes(value): return 'sha256:'+hashlib.sha256(value).hexdigest()
def ah(array): return sha_bytes(str(array.dtype).encode()+str(array.shape).encode()+array.tobytes())
def get_array(table,name):
    if name in ['observation.state','action']:
        return np.asarray(table[name].to_pylist(),dtype='<f4')
    return np.asarray(table[name].to_numpy(zero_copy_only=False),
      dtype='<f4' if name=='timestamp' else '<i8')
def numeric_summary(array):
    return {name:getattr(array,name)(0).tolist() for name in ['min','max','mean','std']}
def quat_mul(q,r):
    x1,y1,z1,w1=np.moveaxis(q,-1,0);x2,y2,z2,w2=np.moveaxis(r,-1,0)
    return np.stack([w1*x2+x1*w2+y1*z2-z1*y2,
      w1*y2-x1*z2+y1*w2+z1*x2,
      w1*z2+x1*y2-y1*x2+z1*w2,
      w1*w2-x1*x2-y1*y2-z1*z2],-1)
def quat_inv(q):
    result=q.copy();result[:,:3]*=-1
    result/=np.sum(q*q,axis=1,keepdims=True)
    return result

tables={};arrays={};episodes={};infos={};stats={};profiles={};repo_replay={}
task_payloads=[]
for key,spec in specs.items():
    base=root/'repos'/spec['dir']
    pf=pq.ParquetFile(base/'data/chunk-000/file-000.parquet')
    table=pf.read(); tables[key]=table
    episodes[key]=pq.read_table(base/'meta/episodes/chunk-000/file-000.parquet').to_pylist()
    tasks=pq.read_table(base/'meta/tasks.parquet').to_pylist()
    infos[key]=json.loads((base/'meta/info.json').read_text(encoding='utf-8'))
    stats[key]=json.loads((base/'meta/stats.json').read_text(encoding='utf-8'))
    if (table.column_names!=columns or table.num_rows!=spec['rows']
        or pf.metadata.num_rows!=spec['rows']
        or pf.metadata.num_row_groups!=spec['rowGroups']
        or pf.metadata.num_columns!=8
        or sha_bytes(str(pf.schema_arrow).encode())!=spec['schema']
        or sha_bytes(str(pf.schema_arrow.remove_metadata()).encode())!=logical_schema_sha):
        die('DATA_PARQUET_PROFILE_INVALID_'+key)
    info=infos[key]
    if (info['robot_type']!='offline_robot' or info['total_episodes']!=spec['episodes']
        or info['total_frames']!=spec['rows'] or info['total_tasks']!=1
        or info['fps']!=30 or info['splits']!={'train':f"0:{spec['episodes']}"}
        or info['features']['observation.state']['shape']!=[32]
        or info['features']['action']['shape']!=[32]
        or info['features']['observation.intervention']['dtype']!='int64'):
        die('INFO_PROFILE_INVALID_'+key)
    expected_action_prefix=(['left_dpos_x','left_dpos_y','left_dpos_z',
      'left_dquat_x','left_dquat_y','left_dquat_z','left_dquat_w']
      if key=='intervention_delta' else
      ['left_pos_x','left_pos_y','left_pos_z','left_quat_x','left_quat_y',
       'left_quat_z','left_quat_w'])
    if info['features']['action']['names'][:7]!=expected_action_prefix:
        die('ACTION_NAMES_INVALID_'+key)
    if (len(tasks)!=1 or tasks[0]['task_index']!=0
        or sha_bytes(tasks[0]['__index_level_0__'].encode())!=task_sha):
        die('TASK_PROFILE_INVALID_'+key)
    task_payloads.append(tasks[0]['__index_level_0__'])
    rows=episodes[key]
    if (len(rows)!=spec['episodes'] or sum(row['length'] for row in rows)!=spec['rows']
        or any(row['episode_index']!=i for i,row in enumerate(rows))
        or any(row['dataset_from_index']!=(0 if i==0 else rows[i-1]['dataset_to_index'])
          for i,row in enumerate(rows))
        or any(row['dataset_to_index']-row['dataset_from_index']!=row['length']
          for row in rows)
        or not all(row['success'] is True for row in rows)):
        die('EPISODE_SIDECAR_PROFILE_INVALID_'+key)
    data={name:get_array(table,name) for name in columns};arrays[key]=data
    if (data['observation.state'].shape!=(spec['rows'],32)
        or data['action'].shape!=(spec['rows'],32)
        or not np.isfinite(data['observation.state']).all()
        or not np.isfinite(data['action']).all()
        or not np.isfinite(data['timestamp']).all()):
        die('NUMERIC_PROFILE_INVALID_'+key)
    timestamp_error=0.0
    for i,row in enumerate(rows):
        lo=row['dataset_from_index'];hi=row['dataset_to_index'];n=hi-lo
        if (not np.array_equal(data['frame_index'][lo:hi],np.arange(n,dtype='<i8'))
            or set(data['episode_index'][lo:hi].tolist())!={i}
            or not np.array_equal(data['index'][lo:hi],np.arange(lo,hi,dtype='<i8'))
            or set(data['task_index'][lo:hi].tolist())!={0}):
            die('INDEX_CROSSWALK_INVALID_'+key)
        timestamp_error=max(timestamp_error,float(np.max(np.abs(
          data['timestamp'][lo:hi]-np.arange(n)/30))))
    ep_profiles=[]
    for row in rows:
        lo=row['dataset_from_index'];hi=row['dataset_to_index']
        ep_profiles.append({'episode':row['episode_index'],'rows':row['length'],
          'interventionHash':ah(data['observation.intervention'][lo:hi]),
          'stateHash':ah(data['observation.state'][lo:hi]),
          'actionHash':ah(data['action'][lo:hi])})
    profile_root=sha_bytes(canonical(ep_profiles).encode())
    if profile_root!=spec['profile']: die('SEMANTIC_PROFILE_INVALID_'+key)
    profiles[key]=ep_profiles
    intervention=data['observation.intervention'];episode_index=data['episode_index']
    values,counts=np.unique(intervention,return_counts=True)
    positive_segments=0;zero_segments=0;episodes_positive=0;episodes_all_positive=0
    within_transitions=0
    for row in rows:
        lo=row['dataset_from_index'];hi=row['dataset_to_index'];segment=intervention[lo:hi]
        within_transitions+=int(np.sum(segment[1:]!=segment[:-1]))
        positive_segments+=int(segment[0]!=0)+int(np.sum((segment[1:]!=0)&(segment[:-1]==0)))
        zero_segments+=int(segment[0]==0)+int(np.sum((segment[1:]==0)&(segment[:-1]!=0)))
        episodes_positive+=int(np.any(segment!=0));episodes_all_positive+=int(np.all(segment!=0))
    actual_global={'min':[int(intervention.min())],'max':[int(intervention.max())],
      'mean':[float(intervention.mean())],'count':[len(intervention)]}
    side_global=stats[key]['observation.intervention']
    global_mismatch_fields=[name for name in actual_global if side_global[name]!=actual_global[name]]
    episode_mismatch=0
    for row in rows:
        lo=row['dataset_from_index'];hi=row['dataset_to_index'];segment=intervention[lo:hi]
        actual={'min':[int(segment.min())],'max':[int(segment.max())],
          'mean':[float(segment.mean())],'count':[len(segment)]}
        if any(row[f'stats/observation.intervention/{name}']!=value
          for name,value in actual.items()): episode_mismatch+=1
    repo_replay[key]={
      'rows':spec['rows'],'episodes':spec['episodes'],'rowGroups':spec['rowGroups'],
      'lengthMin':min(row['length'] for row in rows),
      'lengthMax':max(row['length'] for row in rows),
      'logicalSchemaSha256':logical_schema_sha,'fullSchemaSha256':spec['schema'],
      'semanticEpisodeProfileRoot':profile_root,
      'columnHashes':{name:ah(value) for name,value in data.items()},
      'stateSummary':numeric_summary(data['observation.state']),
      'actionSummary':numeric_summary(data['action']),
      'nonfiniteStateValues':int((~np.isfinite(data['observation.state'])).sum()),
      'nonfiniteActionValues':int((~np.isfinite(data['action'])).sum()),
      'timestampAt30FpsMaxAbsoluteError':timestamp_error,
      'publisherEpisodeSuccessTrueRows':sum(row['success'] is True for row in rows),
      'directDataSuccessFailureOutcomeFields':sorted(set(columns)&
        {'success','failure','outcome','reward','done','terminal','is_success'}),
      'intervention':{'valueCounts':dict(zip(map(str,values.tolist()),counts.tolist())),
        'positiveRows':int(np.sum(intervention!=0)),'zeroRows':int(np.sum(intervention==0)),
        'withinEpisodeTransitions':within_transitions,
        'boundaryTransitions':int(np.sum((intervention[1:]!=intervention[:-1])&
          (episode_index[1:]!=episode_index[:-1]))),
        'positiveSegments':positive_segments,'zeroSegments':zero_segments,
        'episodesWithPositive':episodes_positive,
        'episodesAllPositive':episodes_all_positive,
        'episodesAllZero':spec['episodes']-episodes_positive},
      'interventionSidecarDrift':{'globalMismatchFields':global_mismatch_fields,
        'episodeRowsWithMinMaxMeanOrCountMismatch':episode_mismatch,
        'byteNativeValuesTakePrecedence':True},
    }

if len(set(task_payloads))!=1: die('TASK_CROSS_REPOSITORY_MISMATCH')
for relative in ['.gitattributes','meta/info.json','meta/stats.json',
  'meta/tasks.parquet','meta/episodes/chunk-000/file-000.parquet']:
    if ((root/'repos/int'/relative).read_bytes()!=
        (root/'repos/no-int'/relative).read_bytes()):
        die('A_B_SUPPORT_BYTES_DIFFER_'+relative.replace('/','_'))

a=arrays['intervention'];b=arrays['no_intervention'];c=arrays['intervention_delta']
ab={}
for name in columns:
    left=a[name];right=b[name];different=left!=right
    ab[name]={'exact':bool(np.array_equal(left,right)),
      'differentValues':int(different.sum()),
      'differentRows':int(np.any(different,axis=1).sum()) if different.ndim>1
        else int(different.sum()),
      'maxAbsoluteDifference':float(np.max(np.abs(left.astype(float)-right.astype(float))))}
if (not all(ab[name]['exact'] for name in columns if name!='observation.intervention')
    or ab['observation.intervention']!={'exact':False,'differentValues':197088,
      'differentRows':197088,'maxAbsoluteDifference':1.0}):
    die('A_B_CROSSWALK_INVALID')

n=specs['intervention_delta']['rows']
prefix_fields=[name for name in columns if name!='action']
if not all(np.array_equal(a[name][:n],c[name]) for name in prefix_fields):
    die('DELTA_PREFIX_CROSSWALK_INVALID')
absolute=a['action'][:n];state=a['observation.state'][:n];delta=c['action']
left_pos=absolute[:,0:3]-state[:,0:3];right_pos=absolute[:,8:11]-state[:,8:11]
if (not np.array_equal(left_pos,delta[:,0:3])
    or not np.array_equal(right_pos,delta[:,8:11])
    or not np.array_equal(absolute[:,7],delta[:,7])
    or not np.array_equal(absolute[:,15],delta[:,15])
    or not np.array_equal(absolute[:,16:],delta[:,16:])
    or not np.all(delta[:,16:]==0)):
    die('DELTA_POSITION_GRIPPER_PADDING_FORMULA_INVALID')
quat_results={}
for label,slice_value in [('left',slice(3,7)),('right',slice(11,15))]:
    prediction=quat_mul(absolute[:,slice_value].astype(float),
      quat_inv(state[:,slice_value].astype(float)))
    error=np.abs(prediction-delta[:,slice_value])
    quat_results[label]={'rows':n,'maxAbsoluteError':float(error.max()),
      'meanAbsoluteError':float(error.mean()),
      'rowsWithin3e7AbsoluteTolerance':int(np.sum(np.max(error,axis=1)<=3e-7))}
    if quat_results[label]['rowsWithin3e7AbsoluteTolerance']!=n:
        die('DELTA_QUATERNION_FORMULA_INVALID_'+label)

meta_differences=collections.Counter()
for i in range(203):
    for field,value in episodes['intervention'][i].items():
        if value!=episodes['intervention_delta'][i][field]:meta_differences[field]+=1
expected_meta_differences={f'stats/action/{name}':203 for name in
 ['min','max','mean','std','q01','q10','q50','q90','q99']}
if dict(meta_differences)!=expected_meta_differences:
    die('DELTA_EPISODE_METADATA_CROSSWALK_INVALID')
missing=[{'episodeIndex':row['episode_index'],'rows':row['length'],
  'fromIndex':row['dataset_from_index'],'toIndexExclusive':row['dataset_to_index'],
  'disposition':'PRESENT_IN_ABSOLUTE_A_AND_B_MISSING_FROM_DELTA_PREFIX'}
  for row in episodes['intervention'][203:]]
if [row['rows'] for row in missing]!=[1005,913,775,950,904]:
    die('DELTA_MISSING_EPISODE_PROFILE_INVALID')

print(canonical({
 'task':{'taskPayloadSha256':task_sha,'taskUtf8Bytes':len(task_payloads[0].encode()),
  'taskWords':len(task_payloads[0].split()),'taskPayloadProjected':False},
 'repositories':repo_replay,
 'physical':{'repositoryEpisodeOccurrences':619,
  'repositoryFrameOccurrences':586717,'byteLinkedEpisodeKeys':208,
  'byteLinkedFrameKeys':197088,'globalUnderlyingExecutionCount':None},
 'absolutePair':{'episodeRowsCrosswalked':208,'frameRowsCrosswalked':197088,
  'supportObjectsExactByteIdentical':5,'fieldComparisons':ab,
  'onlyDifferingField':'observation.intervention'},
 'deltaCrosswalk':{'selectionKind':'EXACT_CONTIGUOUS_PREFIX_OF_A_AND_B',
  'episodeRowsCrosswalked':203,'frameRowsCrosswalked':192541,
  'prefixFieldsExact':prefix_fields,
  'episodeMetadataOnlyDifferingFields':dict(meta_differences),
  'positionFormula':'delta_position = absolute_action_position - observation_state_position',
  'leftPositionExactRows':n,'rightPositionExactRows':n,
  'quaternionFormula':'delta_quaternion = absolute_action_quaternion * inverse(observation_state_quaternion)',
  'quaternionAbsoluteTolerance':3e-7,'quaternionResults':quat_results,
  'leftGripperExactRows':n,'rightGripperExactRows':n,
  'paddingExactRows':n,'missingEpisodes':missing,
  'missingEpisodeRows':sum(row['rows'] for row in missing),
  'publisherReasonForMissingEpisodes':None},
 'outcome':{'publisherEpisodeSuccessTrueOccurrences':619,
  'byteLinkedEpisodeKeysWithPublisherSuccessTrue':208,
  'directDataSuccessFailureOutcomeFields':[],
  'publisherSuccessIsIndependentOutcome':False},
}))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable ?? process.env.OUTSIDER_HANDOVER_LINKED_PYTHON
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

export function buildHandoverLinkedArtifactFromSourceDirectory(
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
  const sourceRows = collected.sources.map(({ spec, recordRawBeforeAfterExact,
    treeRawBeforeAfterExact }) => ({
    key: spec.key, id: spec.id, requestedIdFromTask: spec.requestedIdFromTask,
    requestedIdMatchesOfficialRecordId: spec.id === spec.requestedIdFromTask,
    revision: spec.revision, publicAtAcquisition: true,
    gatedAtAcquisition: false, disabledAtAcquisition: false,
    apiUsedStorageBytes: spec.usedStorage,
    recordStableProjectionBeforeAfterExact: true,
    treeStableProjectionBeforeAfterExact: true,
    recordResponseBeforeAfterExact: recordRawBeforeAfterExact,
    treeResponseBeforeAfterExact: treeRawBeforeAfterExact,
    treeRawDriftReason: treeRawBeforeAfterExact ? null
      : "mutable_expanded_tree_metadata_only",
  }));
  const reportBody = {
    schema: HANDOVER_LINKED_SCHEMA,
    disposition: HANDOVER_LINKED_DISPOSITION,
    scope: {
      kind: HANDOVER_LINKED_SCOPE, producer: "Jiacheng0603",
      repositoryCount: 3, fixedRevisionCount: 3,
      completePinnedNoVideoObjects: 18,
      completePinnedNoVideoBytes: 101_137_598,
      selectedUniquePayloads: 11, selectedUniquePayloadBytes: 99_688_595,
      repositoryEpisodeOccurrences: 619,
      repositoryFrameOccurrences: 586_717,
      byteLinkedEpisodeKeys: 208, byteLinkedFrameKeys: 197_088,
      globalUnderlyingExecutionCount: null,
      fullTreeEntries: 183, fullTreeFiles: 147, fullTreeDirectories: 36,
      videoObjectsInventoriedNotAcquired: 129,
      physicalVideoBytesInventoriedNotAcquired: 25_490_473_329,
      rawVideoBytesAcquired: 0, allModalitiesAcquired: false,
      fullThreeRepositoriesAcquired: false,
      globalSourceUniverseExhausted: false,
    },
    source: { sources: sourceRows,
      officialRecordIdInputDiscrepancyCount:
        sourceRows.filter((row) => !row.requestedIdMatchesOfficialRecordId).length,
      sourceManifestHash: sourceManifest.manifestHash,
      sourceManifestFileSha256: manifestFile.sha256,
      sourceRoot: sourceManifest.sourceRoot,
      recordStableProjectionBeforeAfterExactRepositories: 3,
      treeStableProjectionBeforeAfterExactRepositories: 3,
      completeExpandedTreeSnapshots: 6,
      paginationRequiredRepositories: 0,
    },
    replay: { ...replay,
      extractorSha256: sha256(Buffer.from(PYTHON_REPLAY, "utf8")) },
    linkedFamily: {
      absolutePair: replay.absolutePair,
      deltaCrosswalk: replay.deltaCrosswalk,
      byteLinkedEpisodeKeys: 208, byteLinkedFrameKeys: 197_088,
      byteLinkageEstablishesUnderlyingExecutionUniqueness: false,
      repositoryNamingPromotedToExecutionFact: false,
    },
    intervention: {
      publisherNativeField: "observation.intervention",
      perRepository: Object.fromEntries(Object.entries(replay.repositories)
        .map(([key, value]) => [key, value.intervention])),
      interventionRepositoryPositiveRows: 389_629,
      noInterventionRepositoryZeroRows: 197_088,
      positiveSegments: 411, zeroSegments: 208,
      withinEpisodeTransitions: 0, boundaryTransitions: 0,
      publisherFieldEstablishesHumanAuthorizedIntervention: false,
      humanAuthorizedInterventionRows: 0,
      humanAuthorizationProvenanceRows: 0,
    },
    sidecarDrift: {
      intervention: Object.fromEntries(Object.entries(replay.repositories)
        .map(([key, value]) => [key, value.interventionSidecarDrift])),
      noInterventionDataNativeValueCounts: { 0: 197_088 },
      noInterventionGlobalSidecarDeclaresValueCounts: { 1: 197_088 },
      noInterventionEpisodeSidecarMismatchRows: 208,
      aAndBSupportObjectsExactByteIdentical: 5,
      byteNativeParquetValuesTakePrecedence: true,
      silentNormalizationApplied: false,
    },
    mechanics: {
      stateDimensions: 32, actionDimensions: 32,
      absoluteActionRepositories: ["intervention", "no_intervention"],
      deltaActionRepositories: ["intervention_delta"],
      stateActionFiniteRepositoryFrameOccurrences: 586_717,
      absoluteToDeltaFormula: replay.deltaCrosswalk,
      stateSummaryAbsoluteFamily:
        replay.repositories.intervention.stateSummary,
      absoluteActionSummary:
        replay.repositories.intervention.actionSummary,
      deltaActionSummary:
        replay.repositories.intervention_delta.actionSummary,
    },
    videoInventory: {
      typedPopulation: "PINNED_TREE_VIDEO_OBJECT_IDENTITY_CLAIM",
      physicalObjects: collected.videoInventory.physicalEntryCount,
      physicalBytes: collected.videoInventory.physicalBytes,
      pathProfiles: collected.videoInventory.pathProfileCount,
      identicalPathProfilesAcrossThreeRepositories:
        collected.videoInventory.identicalPathProfiles,
      differingPathProfilesAcrossThreeRepositories:
        collected.videoInventory.differingPathProfiles,
      uniquePayloadClaims: collected.videoInventory.uniquePayloads,
      uniquePayloadClaimBytes: collected.videoInventory.uniquePayloadBytes,
      payloadOccurrenceCounts:
        collected.videoInventory.payloadOccurrenceCounts,
      pathProfileHash: collected.videoInventory.pathProfileHash,
      payloadProfileHash: collected.videoInventory.payloadProfileHash,
      rawVideoObjectsAcquired: 0, rawVideoBytesAcquired: 0,
      selectedNoVideoBytesAddedToVideoInventoryBytes: false,
      combinedModalityByteTotalDefined: false,
    },
    execution: {
      publisherRobotType: "offline_robot",
      repositoryNamesClaimHandover: true,
      byteNativeStateActionRows: 586_717,
      independentlyVerifiedPhysicalExecutionRows: 0,
      independentVisualWitnessRows: 0,
      downloadedActionsExecuted: 0, networkActionsReplayed: 0,
    },
    outcome: {
      publisherEpisodeSidecarSuccessTrueOccurrences: 619,
      byteLinkedEpisodeKeysWithPublisherSuccessTrue: 208,
      directDataSuccessFailureOutcomeFields: [],
      publisherSuccessIsIndependentOutcome: false,
      independentlyVerifiedOutcomeRows: 0, independentEffectRows: 0,
      completeCollectionAttemptCensusRows: 0,
    },
    recovery: {
      byteNativeRecoveryFields: [], pairedFailureToRecoveryRows: 0,
      interventionFieldPromotedToRecovery: false,
      independentlyVerifiedRecoveryRows: 0, causalRecoveryEffectRows: 0,
      completeAttemptCensusRows: 0,
    },
    privacy: {
      rawVisualBytes: 0, rawAudioBytes: 0,
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
      datasetApiLicenseClaims: { intervention: null,
        no_intervention: null, intervention_delta: null },
      datasetCardLicenseClaims: { intervention: null,
        no_intervention: null, intervention_delta: null },
      fixedTreeReadmeFiles: 0, fixedTreeLicenseFiles: 0,
      datasetRightsIndependentlyAdjudicated: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
      commercialUseAuthorizedByThisArtifact: false,
      legalConclusionEstablished: false,
    },
    denominators: {
      PHYSICAL_SELECTED_NO_VIDEO_OBJECT: 18,
      PHYSICAL_SELECTED_NO_VIDEO_BYTE: 101_137_598,
      REPOSITORY_EPISODE_OCCURRENCE: 619,
      REPOSITORY_FRAME_OCCURRENCE: 586_717,
      BYTE_LINKED_EPISODE_KEY: 208, BYTE_LINKED_FRAME_KEY: 197_088,
      PINNED_TREE_VIDEO_OBJECT_CLAIM: 129,
      RAW_VISUAL_BYTE: 0,
      PUBLISHER_EPISODE_SUCCESS_TRUE_OCCURRENCE: 619,
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

export function createHandoverLinkedReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: HANDOVER_LINKED_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    scope: HANDOVER_LINKED_SCOPE, fixedRevisionRepositories: 3,
    selectedNoVideoObjects: 18, selectedNoVideoBytes: 101_137_598,
    repositoryEpisodeOccurrences: 619, repositoryFrameOccurrences: 586_717,
    byteLinkedEpisodeKeys: 208, byteLinkedFrameKeys: 197_088,
    rawVideoBytes: 0, independentlyVerifiedOutcomeRows: 0,
    independentEffectRows: 0, independentlyVerifiedRecoveryRows: 0,
    completeAttemptCensusRows: 0, authorizedTrainingRows: 0,
    offlineTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, authorityRows: 0, ceuRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyHandoverLinkedArtifactDirectory(directory, options = {}) {
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
    const built = buildHandoverLinkedArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!reportFile.contents.equals(expectedReport)) fail("REPORT_REPLAY_MISMATCH");
    const manifestFile = readSmall(root, "source/source-manifest.json");
    const receipt = createHandoverLinkedReceipt(
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

export function serializeHandoverLinkedArtifact(value) {
  return serialize(value);
}
