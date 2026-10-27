/*
 * Fixed-revision, source-native replay of Robo-ValueRL block_data/block_1.
 * Video payloads and downloaded publisher code remain inert and unexecuted.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const ROBOVALUE_BLOCK1_SCHEMA =
  "outsider/robovalue-block1-no-video-slice/v1";
export const ROBOVALUE_BLOCK1_RECEIPT_SCHEMA =
  "outsider/robovalue-block1-no-video-slice-receipt/v1";
export const ROBOVALUE_BLOCK1_DATASET_ID = "X-Humanoid/Robo-ValueRL";
export const ROBOVALUE_BLOCK1_REVISION =
  "f05df00f90048def91efd7bd5b61adebecf6cbea";
export const ROBOVALUE_BLOCK1_GITHUB_REPOSITORY =
  "Open-X-Humanoid/Robo-ValueRL";
export const ROBOVALUE_BLOCK1_GITHUB_COMMIT =
  "1618bcb01212eb747a5d2659228b7fb5db87a563";
export const ROBOVALUE_BLOCK1_GITHUB_TREE =
  "2cd4454dc417ab42b334931fdbdccd51d3cd65b3";
export const ROBOVALUE_BLOCK1_SCOPE =
  "COMPLETE_SOURCE_NATIVE_BLOCK_1_NO_VIDEO_SLICE";
export const ROBOVALUE_BLOCK1_DISPOSITION = "QUARANTINE_EVAL_ONLY";

const REPORT_DOMAIN = `${ROBOVALUE_BLOCK1_SCHEMA}/report`;
const RECEIPT_DOMAIN = `${ROBOVALUE_BLOCK1_RECEIPT_SCHEMA}/receipt`;
const MANIFEST_DOMAIN = `${ROBOVALUE_BLOCK1_SCHEMA}/source-manifest`;
const SOURCE_ROOT_DOMAIN = `${ROBOVALUE_BLOCK1_SCHEMA}/source-root`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const MAX_FILE_BYTES = 32 * 1024 * 1024;

const TREE_PAGES = Object.freeze([
  { name: "page-1", bytes: 292_056,
    sha256: "sha256:b405310038a23cd84815f362a4db62c53dc2b6543660288a4239cfc88a00adf0" },
  { name: "page-2", bytes: 110_524,
    sha256: "sha256:f31026146b7b85c9bac7eb88146820e0e41afd192bc14581a3fe1b9e92d34d6e" },
]);
const ROOT_TREE = Object.freeze({ bytes: 395,
  sha256: "sha256:8fc4673a7a8f34665dbce7e0a25d471ef54825db4b69f8ee21f4f0ec8abec4c4" });
const GITHUB_TREE = Object.freeze({ bytes: 278_446,
  sha256: "sha256:7e6d78af7477a24506103aef82701d7666eb756f11abba9f602e317affbaf874" });
const HF_SUPPORT = Object.freeze([
  { path: ".gitattributes", bytes: 2_504,
    sha256: "sha256:9e75dd981de037ec3769f24f790e126bc5a160b6871f510214e68dc70649aeeb",
    oid: "bed0738c7eeb449bca98b5d2f33c89a1ee56349a" },
  { path: "README.md", bytes: 4_346,
    sha256: "sha256:e1d56537460a5c0cf99a1ac1eaae78fbda24a38df43ba3b08ef66b6beaa6a26c",
    oid: "1cf945a78c559b69ca23b2fc533f1cc56712f1e7" },
]);
const GITHUB_EVIDENCE = Object.freeze([
  "README.md",
  "robo_valuerl/config/data_config.py",
  "robo_valuerl/config/lerobot_features.py",
  "robo_valuerl/config/value_config.py",
  "robo_valuerl/convert_online_buffer_to_lerobot_multi.py",
  "robo_valuerl/generate_action_quality/generate_quality.py",
  "robo_valuerl/translate_dataset_to_lerobot/translate_x_humanoid_three_camera_with_quality.py",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `ROBOVALUE_BLOCK1_${code}`
    : `ROBOVALUE_BLOCK1_${code}:${detail}`);
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
    usedStorage: value.usedStorage, siblingCount: value.siblings?.length,
    cardLicense: value.cardData?.license ?? null,
  };
  if (!same(projection, {
    id: ROBOVALUE_BLOCK1_DATASET_ID, author: "X-Humanoid",
    sha: ROBOVALUE_BLOCK1_REVISION,
    lastModified: "2026-07-09T06:41:30.000Z",
    private: false, gated: false, disabled: false,
    usedStorage: 415_449_094_530, siblingCount: 98_630, cardLicense: null,
  })) fail("RECORD_PROFILE_INVALID");
  return projection;
}

function validateRootTree(bytes) {
  if (bytes.length !== ROOT_TREE.bytes || sha256(bytes) !== ROOT_TREE.sha256) {
    fail("ROOT_TREE_PIN_MISMATCH");
  }
  const entries = parseJson(bytes, "ROOT_TREE_JSON_INVALID");
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const projection = files.map(({ path: itemPath, size, oid }) =>
    ({ path: itemPath, bytes: size, oid }));
  if (entries.length !== 4 || directories.length !== 2
    || !same(sorted(directories.map((entry) => entry.path)), ["block_data", "chip_data"])
    || !same(projection, HF_SUPPORT.map(({ path: itemPath, bytes, oid }) =>
      ({ path: itemPath, bytes, oid })))) fail("ROOT_TREE_PROFILE_INVALID");
  return entries;
}

function validateBlockTree(pageBytes) {
  const entries = [];
  for (let index = 0; index < TREE_PAGES.length; index += 1) {
    const spec = TREE_PAGES[index];
    const bytes = pageBytes[index];
    if (bytes.length !== spec.bytes || sha256(bytes) !== spec.sha256) {
      fail("BLOCK_TREE_PAGE_PIN_MISMATCH", spec.name);
    }
    const page = parseJson(bytes, "BLOCK_TREE_PAGE_JSON_INVALID");
    if (!Array.isArray(page) || page.length !== (index === 0 ? 1000 : 308)) {
      fail("BLOCK_TREE_PAGE_LENGTH_INVALID", spec.name);
    }
    entries.push(...page);
  }
  const paths = entries.map((entry) => entry.path);
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const parquet = files.filter((entry) => entry.path.endsWith(".parquet"));
  const metadata = files.filter((entry) =>
    entry.path.endsWith(".json") || entry.path.endsWith(".jsonl"));
  const videos = files.filter((entry) => entry.path.endsWith(".mp4"));
  const selected = [...parquet, ...metadata]
    .sort((left, right) => left.path.localeCompare(right.path));
  const expectedParquet = Array.from({ length: 259 }, (_, index) =>
    `block_data/block_1/data/chunk-000/episode_${String(index).padStart(6, "0")}.parquet`);
  const expectedShards = Array.from({ length: 259 }, (_, index) =>
    `block_data/block_1/meta/shards/episode_${String(index).padStart(6, "0")}.json`);
  const expectedMetadata = [
    "block_data/block_1/meta/episodes.jsonl",
    "block_data/block_1/meta/episodes_stats.jsonl",
    "block_data/block_1/meta/info.json",
    ...expectedShards,
    "block_data/block_1/meta/tasks.jsonl",
  ].sort((left, right) => left.localeCompare(right));
  const videoByCamera = Object.fromEntries([
    "observation.image.image", "observation.image.left", "observation.image.right",
  ].map((camera) => [camera, videos.filter((entry) =>
    entry.path.includes(`/${camera}/`)).length]));
  if (entries.length !== 1_308 || new Set(paths).size !== 1_308
    || files.length !== 1_299 || directories.length !== 9
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 3_452_099_760
    || parquet.length !== 259
    || parquet.reduce((sum, entry) => sum + entry.size, 0) !== 41_568_105
    || metadata.length !== 263
    || metadata.reduce((sum, entry) => sum + entry.size, 0) !== 3_794_838
    || videos.length !== 777
    || videos.reduce((sum, entry) => sum + entry.size, 0) !== 3_406_736_817
    || selected.length !== 522
    || selected.reduce((sum, entry) => sum + entry.size, 0) !== 45_362_943
    || !same(sorted(parquet.map((entry) => entry.path)), expectedParquet)
    || !same(sorted(metadata.map((entry) => entry.path)), expectedMetadata)
    || !same(videoByCamera, {
      "observation.image.image": 259,
      "observation.image.left": 259,
      "observation.image.right": 259,
    }) || parquet.some((entry) => entry.lfs?.oid === undefined)
    || metadata.some((entry) => entry.lfs !== undefined)) {
    fail("BLOCK_TREE_PROFILE_INVALID");
  }
  return { entries, files, directories, parquet, metadata, videos, selected,
    videoByCamera };
}

function validateHfReadme(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const phrases = [
    "heterogeneous real-robot experience", "Mixed-quality trajectories",
    "successful demonstrations, corrections, suboptimal behaviors, and failure cases",
    "Value-derived action-quality labels", "refer to the license file",
  ];
  if (phrases.some((phrase) => !text.includes(phrase))) {
    fail("HF_README_PROFILE_INVALID");
  }
}

function validateGithub(root) {
  const repository = readSmall(root, "github/repository.json");
  const commit = readSmall(root, "github/commit.json");
  const treeFile = readSmall(root, "github/tree.json",
    GITHUB_TREE.bytes, GITHUB_TREE.sha256);
  const repositoryValue = parseJson(repository.contents, "GITHUB_REPOSITORY_INVALID");
  const commitValue = parseJson(commit.contents, "GITHUB_COMMIT_INVALID");
  const tree = parseJson(treeFile.contents, "GITHUB_TREE_INVALID");
  if (!same({ fullName: repositoryValue.full_name, private: repositoryValue.private,
    archived: repositoryValue.archived, disabled: repositoryValue.disabled,
    defaultBranch: repositoryValue.default_branch,
    license: repositoryValue.license?.spdx_id ?? null }, {
    fullName: ROBOVALUE_BLOCK1_GITHUB_REPOSITORY, private: false,
    archived: false, disabled: false, defaultBranch: "main", license: null,
  }) || commitValue.sha !== ROBOVALUE_BLOCK1_GITHUB_COMMIT
    || commitValue.commit?.tree?.sha !== ROBOVALUE_BLOCK1_GITHUB_TREE
    || !same(commitValue.commit?.verification, {
      verified: false, reason: "unsigned", signature: null,
      payload: null, verified_at: null,
    }) || tree.sha !== ROBOVALUE_BLOCK1_GITHUB_TREE
    || tree.truncated !== false || tree.tree?.length !== 838) {
    fail("GITHUB_PROFILE_INVALID");
  }
  const licensePaths = tree.tree.filter((entry) => entry.type === "blob"
    && /(^|\/)LICENSE(?:\.|$)/u.test(entry.path)).map((entry) => entry.path);
  if (!same(licensePaths, ["lerobot_2_1/LICENSE", "openpi/LICENSE"])) {
    fail("GITHUB_LICENSE_TREE_INVALID");
  }
  const descriptors = [repository, commit, treeFile].map(
    ({ path: itemPath, bytes, sha256: itemSha }) =>
      ({ path: itemPath, bytes, sha256: itemSha }));
  for (const evidencePath of GITHUB_EVIDENCE) {
    const entry = tree.tree.find((candidate) => candidate.type === "blob"
      && candidate.path === evidencePath);
    if (!entry || !Number.isSafeInteger(entry.size)) {
      fail("GITHUB_EVIDENCE_TREE_MISSING", evidencePath);
    }
    const relative = `github/files/${evidencePath}`;
    const inspected = inspectRegular(root, relative, entry.size);
    const bytes = readFileSync(checkedPath(root, relative));
    if (gitBlobOid(bytes) !== entry.sha) fail("GITHUB_BLOB_OID_INVALID", evidencePath);
    descriptors.push(inspected);
  }
  const githubReadme = readFileSync(checkedPath(root, "github/files/README.md"));
  const githubText = new TextDecoder("utf-8", { fatal: true }).decode(githubReadme);
  for (const phrase of ["rank-based action-quality labels", "real-world dual-arm humanoid robot",
    "human-in-the-loop intervention", "per-frame `remain_time` and `quality` fields"]) {
    if (!githubText.includes(phrase)) fail("GITHUB_README_PROFILE_INVALID");
  }
  return { descriptors, licensePaths };
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
  const rootTreeBefore = readSmall(root, "metadata/hf-root-tree-before.json",
    ROOT_TREE.bytes, ROOT_TREE.sha256);
  const rootTreeAfter = readSmall(root, "metadata/hf-root-tree-after.json",
    ROOT_TREE.bytes, ROOT_TREE.sha256);
  if (!rootTreeBefore.contents.equals(rootTreeAfter.contents)) {
    fail("ROOT_TREE_BRACKET_CHANGED");
  }
  validateRootTree(rootTreeBefore.contents);
  const blockBefore = TREE_PAGES.map((spec) => readSmall(root,
    `metadata/hf-block1-tree-${spec.name}-before.json`, spec.bytes, spec.sha256));
  const blockAfter = TREE_PAGES.map((spec) => readSmall(root,
    `metadata/hf-block1-tree-${spec.name}-after.json`, spec.bytes, spec.sha256));
  if (blockBefore.some((item, index) =>
    !item.contents.equals(blockAfter[index].contents))) {
    fail("BLOCK_TREE_BRACKET_CHANGED");
  }
  const blockTree = validateBlockTree(blockBefore.map((item) => item.contents));
  const descriptors = [recordBefore, recordAfter, rootTreeBefore, rootTreeAfter,
    ...blockBefore, ...blockAfter].map(({ path: itemPath, bytes, sha256: itemSha }) =>
    ({ path: itemPath, bytes, sha256: itemSha }));
  for (const support of HF_SUPPORT) {
    const relative = `hf-root/${support.path}`;
    const inspected = inspectRegular(root, relative, support.bytes, support.sha256);
    const bytes = readFileSync(checkedPath(root, relative));
    if (gitBlobOid(bytes) !== support.oid) fail("HF_SUPPORT_OID_INVALID", support.path);
    if (support.path === "README.md") validateHfReadme(bytes);
    descriptors.push(inspected);
  }
  for (const entry of blockTree.selected) {
    const relative = `files/${entry.path}`;
    const expectedSha = entry.lfs?.oid ? `sha256:${entry.lfs.oid}` : null;
    const inspected = inspectRegular(root, relative, entry.size, expectedSha);
    if (!entry.lfs) {
      const bytes = readFileSync(checkedPath(root, relative));
      if (gitBlobOid(bytes) !== entry.oid) fail("HF_GIT_BLOB_OID_INVALID", entry.path);
    }
    descriptors.push(inspected);
  }
  const github = validateGithub(root);
  descriptors.push(...github.descriptors);
  descriptors.sort((left, right) => left.path.localeCompare(right.path));
  const expected = descriptors.map((entry) => entry.path);
  if (withManifest) expected.push("source-manifest.json");
  if (!same(sorted(walk(root)), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  return { root, record: recordProjectionBefore, blockTree, github,
    recordBeforeAfterExact: recordBefore.contents.equals(recordAfter.contents),
    descriptors };
}

function manifestBody(collected) {
  return {
    schema: "outsider/robovalue-block1-no-video-slice-source/v1",
    datasetId: ROBOVALUE_BLOCK1_DATASET_ID,
    revision: ROBOVALUE_BLOCK1_REVISION,
    githubRepository: ROBOVALUE_BLOCK1_GITHUB_REPOSITORY,
    githubCommit: ROBOVALUE_BLOCK1_GITHUB_COMMIT,
    githubTree: ROBOVALUE_BLOCK1_GITHUB_TREE,
    scope: ROBOVALUE_BLOCK1_SCOPE,
    fixedSubtreeEntries: 1_308, fixedSubtreeFiles: 1_299,
    fixedSubtreeDirectories: 9, fixedSubtreeFileBytes: 3_452_099_760,
    selectedNoVideoFiles: 522, selectedNoVideoBytes: 45_362_943,
    selectedParquetFiles: 259, selectedParquetBytes: 41_568_105,
    selectedMetadataFiles: 263, selectedMetadataBytes: 3_794_838,
    excludedVideoFiles: 777, excludedVideoBytes: 3_406_736_817,
    rootSupportFiles: 2, githubEvidenceFiles: 7,
    recordStableProjectionBeforeAfterExact: true,
    recordResponseBeforeAfterExact: collected.recordBeforeAfterExact,
    rootTreeBeforeAfterExact: true, blockTreeBeforeAfterExact: true,
    sourceObjects: collected.descriptors,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, collected.descriptors),
  };
}

export function createRoboValueBlock1SourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import hashlib, json, pathlib, sys, warnings
warnings.filterwarnings('ignore')
import numpy as np
import pyarrow.parquet as pq

root=pathlib.Path(sys.argv[1])/'files/block_data/block_1'
def die(code): raise RuntimeError('ROBOVALUE_BLOCK1_PYTHON_'+code)
def lines(path): return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x.strip()]
def canonical(v): return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)

info=json.loads((root/'meta/info.json').read_text(encoding='utf-8'))
episodes=lines(root/'meta/episodes.jsonl'); episode_stats=lines(root/'meta/episodes_stats.jsonl')
tasks=lines(root/'meta/tasks.jsonl')
shards=[json.loads((root/f'meta/shards/episode_{i:06d}.json').read_text(encoding='utf-8')) for i in range(259)]
files=[root/f'data/chunk-000/episode_{i:06d}.parquet' for i in range(259)]
vector_cols=['observation.state.puppet_left_arm_position','observation.state.puppet_right_arm_position','observation.state.puppet_left_gripper_position','observation.state.puppet_right_gripper_position','observation.state.master_left_gripper_position','observation.state.master_right_gripper_position','observation.state.master_left_arm_position','observation.state.master_right_arm_position','action.left_arm_position','action.right_arm_position','action.left_gripper_position','action.right_gripper_position']
scalar_cols=['value_reward','discounted_value_return','y_pressed','quality','timestamp','frame_index','episode_index','index','task_index','remain_time','return_to_go','predict_value_function','predict_remain_time','predict_return_to_go']
expected_cols=vector_cols+scalar_cols
vectors={c:[] for c in vector_cols}; scalars={c:[] for c in scalar_cols}
lengths=[]; schemas=[]; row_groups=0; current=0; profiles=[]
index_exact=frame_exact=episode_exact=task_exact=timestamp_exact=True
action_master={c:0 for c in ['left_arm','right_arm','left_gripper','right_gripper']}
side_fields=vector_cols+['value_reward','discounted_value_return','y_pressed','quality','timestamp','frame_index','episode_index','index','task_index']
side={c:{'episodesWithField':0,'allStatsWithin1e5':0,'maxAbsoluteError':0.0} for c in side_fields}
quality_episode_presence={0:0,1:0,2:0}; quality_only_one=0; terminal_positive=0; one_positive=0
remain_exact=0; return_zero=0; quality_transitions=0
for i,p in enumerate(files):
    pf=pq.ParquetFile(p); table=pf.read(); row_groups+=pf.metadata.num_row_groups
    schemas.append(str(table.schema.remove_metadata()))
    if table.column_names!=expected_cols: die('COLUMN_PROFILE_INVALID')
    n=table.num_rows; lengths.append(n); values={}
    for c in vector_cols:
        a=np.asarray(table[c].to_pylist(),dtype=np.float64); values[c]=a; vectors[c].append(a)
    for c in scalar_cols:
        a=np.asarray(table[c].to_numpy(zero_copy_only=False)); values[c]=a; scalars[c].append(a)
    index_exact &= np.array_equal(values['index'],np.arange(current,current+n))
    frame_exact &= np.array_equal(values['frame_index'],np.arange(n))
    episode_exact &= np.all(values['episode_index']==i); task_exact &= np.all(values['task_index']==0)
    timestamp_exact &= np.allclose(values['timestamp'],np.arange(n)/30,atol=2e-6,rtol=0)
    current+=n
    for key,a,b in [('left_arm','action.left_arm_position','observation.state.master_left_arm_position'),('right_arm','action.right_arm_position','observation.state.master_right_arm_position'),('left_gripper','action.left_gripper_position','observation.state.master_left_gripper_position'),('right_gripper','action.right_gripper_position','observation.state.master_right_gripper_position')]:
        action_master[key]+=int(np.array_equal(values[a],values[b]))
    stats=episode_stats[i]['stats']
    for c in side_fields:
        if c not in stats: continue
        side[c]['episodesWithField']+=1; a=values[c]
        if a.ndim==1: a=a[:,None]
        calc={'min':np.min(a,axis=0),'max':np.max(a,axis=0),'mean':np.mean(a,axis=0),'std':np.std(a,axis=0),'count':np.array([len(a)],dtype=np.float64)}
        ok=True; maximum=0.0
        for key,actual in calc.items():
            declared=np.asarray(stats[c][key],dtype=np.float64).reshape(-1); actual=np.asarray(actual,dtype=np.float64).reshape(-1)
            if len(declared)!=len(actual): ok=False; maximum=float('inf'); continue
            error=float(np.max(np.abs(declared-actual))) if len(actual) else 0.0
            maximum=max(maximum,error); ok &= np.allclose(declared,actual,atol=1e-5,rtol=1e-5)
        side[c]['allStatsWithin1e5']+=int(ok); side[c]['maxAbsoluteError']=max(side[c]['maxAbsoluteError'],maximum)
    q=values['quality']; reward=values['value_reward']
    for value in quality_episode_presence: quality_episode_presence[value]+=int(np.any(q==value))
    quality_only_one+=int(np.all(q==1)); terminal_positive+=int(reward[-1]==100)
    one_positive+=int(np.count_nonzero(reward==100)==1)
    remain_exact+=int(np.array_equal(values['remain_time'],n-values['frame_index']))
    return_zero+=int(np.all(values['return_to_go']==0))
    quality_transitions+=int(np.count_nonzero(q[1:]!=q[:-1]))
    profiles.append({'episode':i,'rows':n,'quality':{str(int(k)):int(v) for k,v in zip(*np.unique(q,return_counts=True))},'scalarMinMax':{c:[float(np.min(values[c])),float(np.max(values[c]))] for c in ['value_reward','discounted_value_return','y_pressed','remain_time','return_to_go','predict_value_function','predict_remain_time','predict_return_to_go']}})

scalar_summary={}
for c,parts in scalars.items():
    a=np.concatenate(parts).astype(np.float64); unique,counts=np.unique(a,return_counts=True)
    row={'count':len(a),'finiteValues':int(np.isfinite(a).sum()),'nullValues':0,'min':float(a.min()),'max':float(a.max()),'mean':float(a.mean()),'std':float(a.std()),'sum':float(a.sum()),'uniqueValues':len(unique)}
    if len(unique)<=20: row['valueCounts']={str(float(k)):int(v) for k,v in zip(unique,counts)}
    scalar_summary[c]=row
vector_summary={}
for c,parts in vectors.items():
    a=np.concatenate(parts).astype(np.float64)
    vector_summary[c]={'rows':len(a),'dimensions':a.shape[1],'values':int(a.size),'finiteValues':int(np.isfinite(a).sum()),'min':[float(x) for x in a.min(0)],'max':[float(x) for x in a.max(0)],'mean':[float(x) for x in a.mean(0)],'std':[float(x) for x in a.std(0)]}

if info!={}:
    expected_totals=(259,210121,1,777,30)
    if (info['total_episodes'],info['total_frames'],info['total_tasks'],info['total_videos'],info['fps'])!=expected_totals: die('INFO_TOTALS_INVALID')
if len(episodes)!=259 or len(episode_stats)!=259 or len(shards)!=259 or tasks!=[{'task_index':0,'task':'unstack and sorting blocks'}]: die('METADATA_ROWS_INVALID')
stats_equal=sum(canonical(shards[i]['episode_stats'])==canonical(episode_stats[i]['stats']) for i in range(259))
metadata={'episodeRows':len(episodes),'episodeStatsRows':len(episode_stats),'taskRows':len(tasks),'shardRows':len(shards),'indicesExact':all(episodes[i]['episode_index']==episode_stats[i]['episode_index']==shards[i]['episode_index']==i for i in range(259)),'lengthsExact':all(episodes[i]['length']==shards[i]['length']==lengths[i] for i in range(259)),'tasksExact':all(episodes[i]['tasks']==['unstack and sorting blocks'] and shards[i]['task']=='unstack and sorting blocks' for i in range(259)),'parquetPathsExact':all(shards[i]['parquet_path']==f'data/chunk-000/episode_{i:06d}.parquet' for i in range(259)),'videoPathsExact':all(shards[i]['video_paths']==[f'videos/chunk-000/observation.image.image/episode_{i:06d}.mp4',f'videos/chunk-000/observation.image.left/episode_{i:06d}.mp4',f'videos/chunk-000/observation.image.right/episode_{i:06d}.mp4'] for i in range(259)),'shardStatsExactlyEqualEpisodeStatsRows':stats_equal,'shardOkTrueRows':sum(s.get('ok') is True for s in shards),'absoluteTrajectoryPathRows':sum(isinstance(s.get('trajectory_path'),str) and s['trajectory_path'].startswith('/') for s in shards),'uniqueTrajectoryPaths':len({s.get('trajectory_path') for s in shards}),'successEpisodesPathSegmentRows':sum('/success_episodes/' in s.get('trajectory_path','') for s in shards)}
first=pq.read_table(files[0]); actual_types={field.name:str(field.type) for field in first.schema}
meaningful_type_drift={c:{'info':info['features'][c]['dtype'],'parquet':actual_types[c]} for c in ['quality','predict_value_function','predict_remain_time','predict_return_to_go']}
profile_hash=hashlib.sha256(('\n'.join(canonical(x) for x in profiles)+'\n').encode()).hexdigest()
quality_declared_all_one=sum(s['stats']['quality']['min']==[1.0] and s['stats']['quality']['max']==[1.0] and s['stats']['quality']['mean']==[1.0] for s in episode_stats)
result={'parquet':{'files':259,'rowGroups':row_groups,'rows':sum(lengths),'columns':expected_cols,'schemaUniform':len(set(schemas))==1,'schemaSha256':'sha256:'+hashlib.sha256(schemas[0].encode()).hexdigest(),'lengthMin':min(lengths),'lengthMax':max(lengths),'lengthSum':sum(lengths)},'scalarFields':scalar_summary,'vectorFields':vector_summary,'indices':{'globalExact':bool(index_exact),'frameExactWithinEpisode':bool(frame_exact),'episodeExact':bool(episode_exact),'taskExact':bool(task_exact),'timestampAt30FpsWithin2e6':bool(timestamp_exact)},'mechanics':{'stateDimensions':sum(vector_summary[c]['dimensions'] for c in vector_cols if c.startswith('observation.state.')),'actionDimensions':sum(vector_summary[c]['dimensions'] for c in vector_cols if c.startswith('action.')),'actionEqualsMasterStateEpisodes':action_master},'metadata':metadata,'sidecar':{'statsByField':side,'qualityDeclaredAllOneEpisodes':quality_declared_all_one,'qualityActualEpisode0':profiles[0]['quality'],'qualityEpisodesContainingEachClass':{str(k):v for k,v in quality_episode_presence.items()},'qualityOnlyOneEpisodes':quality_only_one,'missingParquetFields':['predict_remain_time','predict_return_to_go','predict_value_function','remain_time','return_to_go'],'videoStatsNotReplayed':['observation.image.image','observation.image.left','observation.image.right'],'meaningfulInfoParquetTypeDrift':meaningful_type_drift},'relations':{'terminalPositiveRewardEpisodes':terminal_positive,'exactlyOnePositiveRewardEpisodes':one_positive,'remainTimeEqualsLengthMinusFrameEpisodes':remain_exact,'returnToGoAllZeroEpisodes':return_zero,'qualityTransitions':quality_transitions},'episodeProfileSha256':'sha256:'+profile_hash}
if (result['parquet']['rows']!=210121 or result['parquet']['rowGroups']!=259 or result['parquet']['lengthMin']!=435 or result['parquet']['lengthMax']!=1522 or not result['parquet']['schemaUniform'] or result['parquet']['schemaSha256']!='sha256:08a48182362c0e2ec62ce39fc2e5f3493f0655fc528de52976c5329a0f2a9281'): die('PARQUET_PROFILE_INVALID')
if not all(result['indices'].values()) or result['mechanics']['stateDimensions']!=32 or result['mechanics']['actionDimensions']!=16 or set(action_master.values())!={259}: die('MECHANICS_OR_INDEX_INVALID')
if not all(metadata[k] is True for k in ['indicesExact','lengthsExact','tasksExact','parquetPathsExact','videoPathsExact']) or stats_equal!=259 or metadata['absoluteTrajectoryPathRows']!=259 or metadata['successEpisodesPathSegmentRows']!=259: die('CROSSWALK_INVALID')
if scalar_summary['quality']['valueCounts']!={'0.0':87394,'1.0':27227,'2.0':95500} or quality_declared_all_one!=259 or quality_episode_presence!={0:259,1:259,2:259} or quality_only_one!=0 or side['quality']['allStatsWithin1e5']!=0 or side['quality']['maxAbsoluteError']!=1.0: die('QUALITY_DRIFT_INVALID')
if scalar_summary['value_reward']['valueCounts']!={'-0.10000000149011612':209862,'100.0':259} or scalar_summary['y_pressed']['valueCounts']!={'0.0':210121} or scalar_summary['return_to_go']['valueCounts']!={'0.0':210121} or terminal_positive!=259 or one_positive!=259 or remain_exact!=259 or return_zero!=259: die('VALUE_PROFILE_INVALID')
if any(row['finiteValues']!=row['count'] for row in scalar_summary.values()) or any(row['finiteValues']!=row['values'] for row in vector_summary.values()): die('NONFINITE_VALUES')
if profile_hash!='492edefc909d4c95ae6cbebbb028af0b2f8f8af140c6a549942b3dbcb2c6629f': die('EPISODE_PROFILE_INVALID')
print(canonical(result))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_ROBOVALUE_BLOCK1_PYTHON
    ?? "/opt/anaconda3/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 16 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", PYTHONWARNINGS: "ignore" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim() ?? result.status);
  }
  try { return deepFreeze(JSON.parse(result.stdout)); }
  catch { fail("REPLAY_OUTPUT_INVALID"); }
}

export function buildRoboValueBlock1ArtifactFromSourceDirectory(
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
  const quality = replay.scalarFields.quality;
  const reportBody = {
    schema: ROBOVALUE_BLOCK1_SCHEMA,
    disposition: ROBOVALUE_BLOCK1_DISPOSITION,
    scope: {
      kind: ROBOVALUE_BLOCK1_SCOPE,
      datasetId: ROBOVALUE_BLOCK1_DATASET_ID,
      revision: ROBOVALUE_BLOCK1_REVISION,
      sourceNativeGroup: "block_data/block_1",
      completePinnedSourceNativeNoVideoGroupAcquired: true,
      completePublishedEpisodeAndFrameRowsReplayed: true,
      selectedFiles: 522, selectedBytes: 45_362_943,
      parquetFiles: 259, parquetBytes: 41_568_105,
      metadataFiles: 263, metadataBytes: 3_794_838,
      excludedVideoFiles: 777, excludedVideoBytes: 3_406_736_817,
      videoPayloadBytesAcquired: 0, allModalitiesAcquired: false,
      entireRoboValueRlDatasetAcquired: false,
      entirePublisherAttemptPopulationAcquired: false,
    },
    source: {
      publicAtAcquisition: true, gatedAtAcquisition: false,
      disabledAtAcquisition: false,
      fixedSubtreeEntries: 1_308, fixedSubtreeFiles: 1_299,
      fixedSubtreeDirectories: 9, fixedSubtreeFileBytes: 3_452_099_760,
      apiUsedStorageBytes: 415_449_094_530,
      apiUsedStorageIsNotPinnedSubtreeByteCount: true,
      apiSiblingEntries: 98_630,
      recordStableProjectionBeforeAfterExact: true,
      recordResponseBeforeAfterExact: collected.recordBeforeAfterExact,
      rootTreeBeforeAfterExact: true, blockTreeBeforeAfterExact: true,
      githubRepository: ROBOVALUE_BLOCK1_GITHUB_REPOSITORY,
      githubCommit: ROBOVALUE_BLOCK1_GITHUB_COMMIT,
      githubTree: ROBOVALUE_BLOCK1_GITHUB_TREE,
      githubCommitVerified: false, githubCommitVerificationReason: "unsigned",
      sourceManifestHash: sourceManifest.manifestHash,
      sourceManifestFileSha256: manifestFile.sha256,
      sourceRoot: sourceManifest.sourceRoot,
    },
    replay: { ...replay,
      extractorSha256: sha256(Buffer.from(PYTHON_REPLAY, "utf8")) },
    mechanics: {
      publisherRobotType: "x_humanoid",
      episodes: 259, frames: 210_121, fps: 30,
      stateDimensions: replay.mechanics.stateDimensions,
      actionDimensions: replay.mechanics.actionDimensions,
      stateAndActionFields: replay.parquet.columns.filter((field) =>
        field.startsWith("observation.state.") || field.startsWith("action.")),
      allStateActionValuesFinite: true,
      actionEqualsMasterStateEpisodes:
        replay.mechanics.actionEqualsMasterStateEpisodes,
    },
    annotations: {
      byteNativeFields: ["value_reward", "discounted_value_return", "y_pressed",
        "quality", "remain_time", "return_to_go", "predict_value_function",
        "predict_remain_time", "predict_return_to_go"],
      allRowsReplayedPerField: 210_121,
      qualityParquetType: "int64",
      qualityInfoDeclaredType: "bool",
      qualityValueCounts: quality.valueCounts,
      qualityBadRows: quality.valueCounts["0.0"],
      qualityMediumRows: quality.valueCounts["1.0"],
      qualityGoodRows: quality.valueCounts["2.0"],
      qualityEpisodesContainingAllThreeClasses: 259,
      qualityTransitions: replay.relations.qualityTransitions,
      publisherGithubDefinesQualityAsRankDerivedActionCondition: true,
      publisherGithubQualityGeneratorExecuted: false,
      qualityIsTaskOutcome: false,
      predictedValueFieldsAreIndependentOutcomes: false,
    },
    sidecarDrift: {
      episodeStatsRows: 259,
      shardStatsCopiesExactlyEqualEpisodeStatsRows:
        replay.metadata.shardStatsExactlyEqualEpisodeStatsRows,
      qualitySidecarsDeclareAllOneEpisodes:
        replay.sidecar.qualityDeclaredAllOneEpisodes,
      qualityActualAllOneEpisodes: replay.sidecar.qualityOnlyOneEpisodes,
      qualityActualEpisode0Counts: replay.sidecar.qualityActualEpisode0,
      qualityActualGlobalCounts: quality.valueCounts,
      everyEpisodeActualContainsZeroOneAndTwo: true,
      qualitySidecarMaxAbsoluteError:
        replay.sidecar.statsByField.quality.maxAbsoluteError,
      qualitySidecarRowsMatchingWithin1e5:
        replay.sidecar.statsByField.quality.allStatsWithin1e5,
      parquetFieldsMissingFromEpisodeStatsSidecars:
        replay.sidecar.missingParquetFields,
      visualStatsFieldsNotReplayedBecauseVideoExcluded:
        replay.sidecar.videoStatsNotReplayed,
      meaningfulInfoParquetTypeDrift:
        replay.sidecar.meaningfulInfoParquetTypeDrift,
      parquetBytesTakePrecedenceOverStaleSidecars: true,
      silentCoercionApplied: false,
    },
    valueSignals: {
      scalarSummaries: replay.scalarFields,
      positiveTerminalRewardEpisodes:
        replay.relations.terminalPositiveRewardEpisodes,
      exactlyOnePositiveRewardEpisodes:
        replay.relations.exactlyOnePositiveRewardEpisodes,
      yPressedNonzeroRows: 0,
      returnToGoNonzeroRows: 0,
      remainTimeEqualsEpisodeLengthMinusFrameEpisodes:
        replay.relations.remainTimeEqualsLengthMinusFrameEpisodes,
      publisherNativeRewardFieldIsIndependentTaskOutcome: false,
      successDirectoryPathIsIndependentTaskOutcome: false,
    },
    execution: {
      publisherDatasetCardClaimsRealRobotExperience: true,
      publisherAttributedRealRobotEpisodes: 259,
      byteNativeStateActionTelemetryFrames: 210_121,
      independentlyVerifiedPhysicalExecutionFrames: 0,
      independentVisualWitnessFrames: 0,
      visualPayloadsAcquired: 0, visualPayloadsParsed: false,
      downloadedPublisherCodeExecuted: false,
      trajectoryCommandsOrActionsExecuted: 0,
    },
    outcome: {
      publisherNativeRewardFieldRows: 210_121,
      publisherNativePositiveTerminalRewardEpisodes: 259,
      publisherNativeExplicitSuccessFailureOutcomeRows: 0,
      independentlyVerifiedOutcomeRows: 0,
      independentEffectRows: 0,
      sourcePathSuccessSegmentRows:
        replay.metadata.successEpisodesPathSegmentRows,
      sourcePathPromotedToIndependentOutcome: false,
      completeCollectionAttemptCensusEstablished: false,
    },
    recovery: {
      datasetWideReadmeClaimsMixedSuccessfulCorrectiveSuboptimalFailureData: true,
      selectedBlock1SourceNativeRecoveryLabelRows: 0,
      pairedFailureToCorrectionRows: 0,
      causalRecoveryRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      longitudinalRecoveryRows: 0,
      selectedCuratedGroupIsRecoveryCensus: false,
    },
    completeness: {
      episodeRows: 259, frameRows: 210_121,
      globalIndexExact: replay.indices.globalExact,
      frameIndicesExactWithinEpisode: replay.indices.frameExactWithinEpisode,
      episodeIndicesExact: replay.indices.episodeExact,
      taskIndicesExact: replay.indices.taskExact,
      timestampCadenceAt30FpsWithin2e6:
        replay.indices.timestampAt30FpsWithin2e6,
      metadataEpisodeLengthAndPathCrosswalkExact: true,
      perEpisodeShardCrosswalkExact: true,
      sourceNativeEpisodeProfileSha256: replay.episodeProfileSha256,
      selectedGroupComplete: true,
      publisherDatasetAttemptCensusComplete: false,
    },
    privacy: {
      videosExcluded: true, rawVisualBytes: 0,
      absolutePublisherLocalTrajectoryPathRows:
        replay.metadata.absoluteTrajectoryPathRows,
      uniquePublisherLocalTrajectoryPaths:
        replay.metadata.uniqueTrajectoryPaths,
      rawTelemetryPrivate: true, rawMetadataPrivate: true,
      rawProjectionRows: 0, independentPrivacyAuditRows: 0,
      noPiiOrSensitiveDataGuaranteed: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    activeContent: {
      downloadedPublisherCodeFiles: 6,
      downloadedPublisherShellFiles: 0,
      downloadedPublisherCodeExecuted: 0,
      trajectoryPayloadsExecuted: 0, networkActionsReplayed: 0,
    },
    rights: {
      datasetApiLicenseClaim: null,
      datasetReadmeRedirectsToGithubLicenseFile: true,
      githubApiDetectedLicense: null,
      githubRootLicenseFilePresent: false,
      vendoredLicenseFiles: collected.github.licensePaths,
      vendoredLicensesAdjudicateDatasetRights: false,
      datasetContentRightsIndependentlyAdjudicated: false,
      humanDemonstrationRightsIndependentlyAdjudicated: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
      commercialUseAuthorizedByThisArtifact: false,
      legalConclusionEstablished: false,
    },
    denominators: {
      PUBLISHED_SOURCE_NATIVE_EPISODE_ROW: 259,
      PUBLISHED_TELEMETRY_FRAME_ROW: 210_121,
      PUBLISHER_DERIVED_ACTION_QUALITY_ROW: 210_121,
      PUBLISHER_NATIVE_REWARD_ROW: 210_121,
      INDEPENDENT_OUTCOME_ROW: 0,
      INDEPENDENT_RECOVERY_ROW: 0,
      COMPLETE_ATTEMPT_CENSUS_ROW: 0,
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

export function createRoboValueBlock1Receipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: ROBOVALUE_BLOCK1_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    scope: ROBOVALUE_BLOCK1_SCOPE,
    selectedFiles: 522, selectedBytes: 45_362_943,
    episodes: 259, frames: 210_121,
    publisherDerivedActionQualityRows: 210_121,
    independentlyVerifiedOutcomeRows: 0, independentEffectRows: 0,
    independentlyVerifiedRecoveryRows: 0, completeAttemptCensusRows: 0,
    authorizedTrainingRows: 0, offlineTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyRoboValueBlock1ArtifactDirectory(directory, options = {}) {
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
    const built = buildRoboValueBlock1ArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!reportFile.contents.equals(expectedReport)) fail("REPORT_REPLAY_MISMATCH");
    const manifestFile = readSmall(root, "source/source-manifest.json");
    const receipt = createRoboValueBlock1Receipt(
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

export function serializeRoboValueBlock1Artifact(value) {
  return serialize(value);
}
