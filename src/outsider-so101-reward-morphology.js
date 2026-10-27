/*
 * Pinned no-video replay of aBochen's 15-episode SO101 reward-classifier
 * dataset.  The HIL wording in repository metadata is never promoted into a
 * byte-native intervention signal: the actual Parquet carries reward, done
 * and penalty fields, but no is_intervention field.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, rmSync, writeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const SO101_REWARD_ID =
  "aBochen/so101_HIL_pick_lift_15ep004_reward_classifier";
export const SO101_REWARD_REVISION =
  "83f82c6baa42e3df696b6465e347c57e80aa3d98";
export const SO101_REWARD_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const SO101_REWARD_SOURCE_SCHEMA =
  "outsider/so101-reward-morphology-source/v1";
export const SO101_REWARD_AUDIT_SCHEMA =
  "outsider/so101-reward-morphology-audit/v1";

const FILES = Object.freeze([
  Object.freeze({ path: ".gitattributes", bytes: 2_504,
    oid: "bed0738c7eeb449bca98b5d2f33c89a1ee56349a", lfs: null, selected: false }),
  Object.freeze({ path: "README.md", bytes: 3_761,
    oid: "1548e191111dbcfb46e89fc269a47fca1836e88e", lfs: null, selected: true }),
  Object.freeze({ path: "data/chunk-000/file-000.parquet", bytes: 372_963,
    oid: "31822008125c6da1a08f33460fc2847405a7ac68",
    lfs: "16abec26858ec09145e77c04e4c93e55453b293d931badb46a99697d5f896330",
    selected: true }),
  Object.freeze({ path: "meta/episodes/chunk-000/file-000.parquet", bytes: 115_323,
    oid: "0186edca3f1e764f2d815f596be648ed6b2a547f",
    lfs: "f679b5d37dc13ec184a3ad329f386d03da0c55afb56db8fa3dc55dd268508db0",
    selected: true }),
  Object.freeze({ path: "meta/info.json", bytes: 2_789,
    oid: "95c2c6bf35ba6492dbe308874f9a6c6dbe4fb699", lfs: null, selected: true }),
  Object.freeze({ path: "meta/stats.json", bytes: 14_586,
    oid: "2ddf93b5cb204985780d6d9f4749391afed887bd", lfs: null, selected: true }),
  Object.freeze({ path: "meta/tasks.parquet", bytes: 2_080,
    oid: "27706ec2f1af0feef42c8135101e0341ced248ca",
    lfs: "fd6d7725af0aa5c4439e6649503351c51f69e17390b21582e7e5ae721836937e",
    selected: true }),
  Object.freeze({ path: "videos/observation.images.camera1/chunk-000/file-000.mp4",
    bytes: 73_262_296, oid: "db5b19d526778cceafa02fb443513e27b5bafc58",
    lfs: "2eb362b5b1d0ad5a71ab8cab67a2c83899459cf8f92c639d50289963263d3dc0",
    selected: false }),
]);

const DIRECTORIES = Object.freeze([
  Object.freeze({ path: "data", oid: "028036bbbfb50c64bd0ff05bdead33b23cacb348" }),
  Object.freeze({ path: "data/chunk-000", oid: "82494024e014a4ebc259d3920843487a34f966b9" }),
  Object.freeze({ path: "meta", oid: "f8c972ef14a80b9b9eb8d27a7d94a6142bc1abd2" }),
  Object.freeze({ path: "meta/episodes", oid: "d3e7d133720fbce2e298f13fb6877f6d9071d26c" }),
  Object.freeze({ path: "meta/episodes/chunk-000", oid: "1e56b91943a0133dcd12f8e1427b0efba7aa5ea0" }),
  Object.freeze({ path: "videos", oid: "57d544dcf5ee219efa78ef304ad2d933b4194b92" }),
  Object.freeze({ path: "videos/observation.images.camera1",
    oid: "b7485041692ad911886b5f91ba84c38ed729faa0" }),
  Object.freeze({ path: "videos/observation.images.camera1/chunk-000",
    oid: "04da12036a9c695624833b1de573d8e5468a31b4" }),
]);

export const SO101_REWARD_PROFILE = Object.freeze({
  usedStorage: 73_752_662,
  treeEntries: 16,
  treeFiles: 8,
  treeBytes: 73_776_302,
  selectedObjects: 6,
  selectedBytes: 511_502,
  excludedVideoObjects: 1,
  excludedVideoBytes: 73_262_296,
  episodes: 15,
  frames: 7_414,
  tasks: 1,
  fps: 30,
  actionDimensions: 4,
  stateDimensions: 18,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;

function fail(code, detail = null) {
  throw new Error(detail === null ? `SO101_REWARD_${code}`
    : `SO101_REWARD_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function so101RewardSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return so101RewardSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes).digest("hex");
}

function safeRemotePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 1024
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function endpoints() {
  const encoded = SO101_REWARD_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${SO101_REWARD_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${SO101_REWARD_REVISION}`
      + "?recursive=true&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${SO101_REWARD_REVISION}`,
  };
}

function validateRepository(value) {
  if (!plain(value) || !Array.isArray(value.siblings)) fail("REPOSITORY_INVALID");
  const paths = value.siblings.map((entry) => entry?.rfilename)
    .sort((left, right) => left.localeCompare(right));
  if (value.id !== SO101_REWARD_ID || value.sha !== SO101_REWARD_REVISION
    || value.private !== false || value.gated !== false || value.disabled !== false
    || value.usedStorage !== SO101_REWARD_PROFILE.usedStorage
    || value.cardData?.license !== "apache-2.0" || paths.length !== 8
    || !same(paths, FILES.map((entry) => entry.path)
      .sort((left, right) => left.localeCompare(right)))) fail("REPOSITORY_PROFILE_INVALID");
  return { id: value.id, sha: value.sha, private: value.private, gated: value.gated,
    disabled: value.disabled, usedStorage: value.usedStorage,
    cardLicense: value.cardData.license, siblingPaths: paths };
}

function validateTree(raw) {
  if (!Array.isArray(raw) || raw.length !== 16) fail("TREE_INVALID");
  const projection = raw.map((entry) => {
    if (!plain(entry) || !safeRemotePath(entry.path)
      || !["file", "directory"].includes(entry.type)
      || !SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size)
      || entry.size < 0) fail("TREE_ENTRY_INVALID");
    if (entry.type === "directory") return { path: entry.path, type: entry.type,
      oid: entry.oid, bytes: entry.size, lfs: null };
    if (entry.lfs == null) return { path: entry.path, type: entry.type,
      oid: entry.oid, bytes: entry.size, lfs: null };
    if (!plain(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
      || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID");
    return { path: entry.path, type: entry.type, oid: entry.oid,
      bytes: entry.size, lfs: entry.lfs.oid };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const expected = [
    ...DIRECTORIES.map((entry) => ({ path: entry.path, type: "directory",
      oid: entry.oid, bytes: 0, lfs: null })),
    ...FILES.map((entry) => ({ path: entry.path, type: "file", oid: entry.oid,
      bytes: entry.bytes, lfs: entry.lfs })),
  ].sort((left, right) => left.path.localeCompare(right.path));
  if (!same(projection, expected)) fail("TREE_PROFILE_INVALID");
  return { projection,
    selected: FILES.filter((entry) => entry.selected).map((entry) => ({
      path: entry.path, oid: entry.oid, sizeBytes: entry.bytes,
      lfsSha256: entry.lfs === null ? null : `sha256:${entry.lfs}`,
    })).sort((left, right) => left.path.localeCompare(right.path)) };
}

function permittedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === ""
      && parsed.password === "" && (parsed.hostname === "huggingface.co"
        || parsed.hostname.endsWith(".hf.co")
        || parsed.hostname.endsWith(".xethub.hf.co"));
  } catch { return false; }
}

function retryable(error) {
  return error?.name === "AbortError" || error?.retryable === true
    || /(?:fetch failed|network|timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN)/iu
      .test(String(error?.message ?? error));
}

async function fetchOnce(url, maximumBytes, fetchImpl) {
  if (!permittedUrl(url)) fail("REQUEST_URL_REFUSED", url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "follow",
      signal: controller.signal });
    if (!response || typeof response.arrayBuffer !== "function") fail("FETCH_INVALID");
    if (!response.ok) {
      const error = new Error(`HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 429
        || response.status >= 500;
      throw error;
    }
    const finalUrl = response.url || url;
    if (!permittedUrl(finalUrl)) fail("FINAL_URL_REFUSED", finalUrl);
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > maximumBytes) fail("CONTENT_LENGTH_EXCEEDED");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) fail("BODY_BYTES_EXCEEDED");
    return { bytes, finalUrl, status: response.status,
      contentType: response.headers?.get?.("content-type") ?? null };
  } finally { clearTimeout(timer); }
}

async function boundedFetch(url, maximumBytes, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetchOnce(url, maximumBytes, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }
  throw last;
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function safeJoin(root, relative) {
  if (!safeRemotePath(relative)) fail("PATH_INVALID", relative);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, ...relative.split("/"));
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) fail("PATH_ESCAPE", relative);
  return resolved;
}

function writePrivateOnce(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  const descriptor = openSync(file, fsConstants.O_WRONLY | fsConstants.O_CREAT
    | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.nlink !== 1) fail("OUTPUT_UNSAFE", file);
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
  } finally { closeSync(descriptor); }
}

function privateTree(root) {
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) privateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

async function fetchJson(url, fetchImpl) {
  const value = await boundedFetch(url, 8 * 1024 * 1024, fetchImpl);
  return { ...value, parsed: parseJson(value.bytes, url) };
}

async function capturePhase(root, phase, fetchImpl) {
  const endpoint = endpoints();
  const [repository, tree] = await Promise.all([
    fetchJson(endpoint.repository, fetchImpl), fetchJson(endpoint.tree, fetchImpl),
  ]);
  validateRepository(repository.parsed);
  validateTree(tree.parsed);
  return [{ kind: "repository", value: repository, requestUrl: endpoint.repository },
    { kind: "tree", value: tree, requestUrl: endpoint.tree }].map((entry) => {
    const file = `api/${phase}/${entry.kind}.json`;
    writePrivateOnce(safeJoin(root, file), entry.value.bytes);
    return { phase, kind: entry.kind, file, requestUrl: entry.requestUrl,
      finalUrl: entry.value.finalUrl, status: entry.value.status,
      contentType: entry.value.contentType, bytes: entry.value.bytes.length,
      sha256: so101RewardSha256(entry.value.bytes) };
  });
}

async function downloadObject(root, entry, fetchImpl) {
  const url = `${endpoints().raw}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const response = await boundedFetch(url, entry.sizeBytes + 1, fetchImpl);
  const sha256 = so101RewardSha256(response.bytes);
  if (response.bytes.length !== entry.sizeBytes
    || (entry.lfsSha256 === null ? gitBlobOid(response.bytes) !== entry.oid
      : sha256 !== entry.lfsSha256)) fail("OBJECT_INVALID", entry.path);
  const file = `objects/${entry.path}`;
  writePrivateOnce(safeJoin(root, file), response.bytes);
  return { datasetId: SO101_REWARD_ID, revision: SO101_REWARD_REVISION,
    path: entry.path, file, requestUrl: url, finalUrl: response.finalUrl,
    status: response.status, contentType: response.contentType,
    bytes: response.bytes.length, sha256, gitOid: entry.oid,
    lfsSha256: entry.lfsSha256 };
}

function rootProjection(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots, ...remoteObjects].map((entry) => ({
    file: entry.file, bytes: entry.bytes, sha256: entry.sha256,
  })).sort((left, right) => left.file.localeCompare(right.file));
  return { files, sourceRoot: digest("outsider/so101-reward-source-root/v1", files) };
}

export async function acquirePinnedSo101RewardSource(sourceDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  if (existsSync(sourceDirectory)) fail("SOURCE_EXISTS", sourceDirectory);
  const parent = path.dirname(path.resolve(sourceDirectory));
  ensurePrivateDirectory(parent);
  const temporary = path.join(parent,
    `.${path.basename(sourceDirectory)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const before = await capturePhase(temporary, "before", fetchImpl);
    const selected = validateTree(parseJson(readFileSync(path.join(temporary,
      "api/before/tree.json")), "tree")).selected;
    const remoteObjects = (await Promise.all(selected.map((entry) =>
      downloadObject(temporary, entry, fetchImpl))))
      .sort((left, right) => left.file.localeCompare(right.file));
    const after = await capturePhase(temporary, "after", fetchImpl);
    const repositoryBefore = parseJson(readFileSync(path.join(temporary,
      "api/before/repository.json")), "repository-before");
    const repositoryAfter = parseJson(readFileSync(path.join(temporary,
      "api/after/repository.json")), "repository-after");
    const treeAfter = parseJson(readFileSync(path.join(temporary,
      "api/after/tree.json")), "tree-after");
    if (!same(validateRepository(repositoryBefore), validateRepository(repositoryAfter))
      || !same(validateTree(treeAfter).projection,
        validateTree(parseJson(readFileSync(path.join(temporary,
          "api/before/tree.json")), "tree-before")).projection)) fail("SOURCE_DRIFT");
    const apiSnapshots = [...before, ...after]
      .sort((left, right) => left.file.localeCompare(right.file));
    const rooted = rootProjection(apiSnapshots, remoteObjects);
    const body = { schema: SO101_REWARD_SOURCE_SCHEMA,
      frozenAt: SO101_REWARD_FROZEN_AT, apiSnapshots, remoteObjects,
      sourceFiles: rooted.files, sourceRoot: rooted.sourceRoot,
      closure: { selectedObjects: 6, selectedBytes: 511_502,
        completeNoVideoDataAndMeta: true, rootReadmeSelected: true,
        videosSelected: 0, videoObjectsExcluded: 1,
        videoBytesExcluded: 73_262_296, gitattributesSelected: false } };
    const manifest = { ...body,
      manifestHash: digest("outsider/so101-reward-source-manifest/v1", body) };
    writePrivateOnce(path.join(temporary, "acquisition-manifest.json"),
      canonicalBytes(manifest));
    privateTree(temporary);
    renameSync(temporary, sourceDirectory);
    chmodSync(sourceDirectory, 0o700);
    return { sourceDirectory, manifest };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function readRegular(file, bytesExpected = null) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) fail("FILE_UNSAFE", file);
  const bytes = readFileSync(file);
  if (bytesExpected !== null && bytes.length !== bytesExpected) fail("FILE_SIZE_INVALID");
  return bytes;
}

function walk(root) {
  const files = [];
  const queue = [root];
  while (queue.length) {
    const directory = queue.shift();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
      if (entry.isDirectory()) queue.push(child);
      else if (entry.isFile()) files.push(path.relative(root, child).split(path.sep).join("/"));
      else fail("SPECIAL_FILE_REFUSED", child);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function verifySo101RewardSourceDirectory(sourceDirectory) {
  try {
    const manifest = parseJson(readRegular(path.join(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== SO101_REWARD_SOURCE_SCHEMA
      || manifest.frozenAt !== SO101_REWARD_FROZEN_AT
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 4
      || !Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 6
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")) {
      fail("MANIFEST_INVALID");
    }
    const snapshots = {};
    for (const descriptor of manifest.apiSnapshots) {
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      if (so101RewardSha256(bytes) !== descriptor.sha256) fail("SNAPSHOT_HASH_INVALID");
      snapshots[`${descriptor.phase}:${descriptor.kind}`] = parseJson(bytes, descriptor.file);
    }
    if (!same(validateRepository(snapshots["before:repository"]),
      validateRepository(snapshots["after:repository"]))
      || !same(validateTree(snapshots["before:tree"]).projection,
        validateTree(snapshots["after:tree"]).projection)) fail("SOURCE_DRIFT");
    const selected = validateTree(snapshots["before:tree"]).selected;
    if (!same(selected.map((entry) => entry.path).sort(),
      manifest.remoteObjects.map((entry) => entry.path).sort())) fail("REMOTE_SET_INVALID");
    for (const descriptor of manifest.remoteObjects) {
      const entry = selected.find((value) => value.path === descriptor.path);
      if (!entry || descriptor.datasetId !== SO101_REWARD_ID
        || descriptor.revision !== SO101_REWARD_REVISION
        || descriptor.file !== `objects/${entry.path}` || descriptor.bytes !== entry.sizeBytes
        || descriptor.gitOid !== entry.oid || descriptor.lfsSha256 !== entry.lfsSha256) {
        fail("REMOTE_DESCRIPTOR_INVALID");
      }
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      const sha256 = so101RewardSha256(bytes);
      if (descriptor.sha256 !== sha256
        || (entry.lfsSha256 === null ? gitBlobOid(bytes) !== entry.oid
          : sha256 !== entry.lfsSha256)) fail("REMOTE_HASH_INVALID");
    }
    const rooted = rootProjection(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles) || rooted.sourceRoot !== manifest.sourceRoot) {
      fail("SOURCE_ROOT_INVALID");
    }
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"].sort((left, right) => left.localeCompare(right));
    if (!same(walk(sourceDirectory), expectedFiles)) fail("FILE_CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/so101-reward-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    return { ok: true, manifest,
      verificationLevel: "PINNED_COMPLETE_SO101_REWARD_NO_VIDEO_DATA_AND_META" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import collections, json, math, os, sys
import pyarrow.parquet as pq

root = sys.argv[1]
base = os.path.join(root, "objects")
with open(os.path.join(base, "meta", "info.json"), "r", encoding="utf-8") as handle:
    info = json.load(handle)
if (info.get("codebase_version") != "v3.0" or info.get("robot_type") is not None
    or info.get("total_episodes") != 15 or info.get("total_frames") != 7414
    or info.get("total_tasks") != 1 or info.get("fps") != 30):
    raise RuntimeError("SO101_REWARD_INFO_INVALID")

table = pq.read_table(os.path.join(base, "data", "chunk-000", "file-000.parquet"))
expected = ["action", "next.reward", "next.done",
  "complementary_info.discrete_penalty", "observation.state", "timestamp",
  "frame_index", "episode_index", "index", "task_index"]
if table.column_names != expected or table.num_rows != 7414:
    raise RuntimeError("SO101_REWARD_DATA_SCHEMA_INVALID")
data = table.to_pydict()
if data["index"] != list(range(7414)) or data["task_index"] != [0] * 7414:
    raise RuntimeError("SO101_REWARD_GLOBAL_INDEX_INVALID")
if (any(not isinstance(value, list) or len(value) != 4 for value in data["action"])
    or any(not isinstance(value, list) or len(value) != 18
      for value in data["observation.state"])):
    raise RuntimeError("SO101_REWARD_VECTOR_INVALID")

episode_lengths = []
terminal_done_episodes = 0
done_true_by_episode = {}
reward_positive_episodes = 0
for episode in range(15):
    positions = [index for index, value in enumerate(data["episode_index"]) if value == episode]
    if not positions or positions != list(range(positions[0], positions[-1] + 1)):
        raise RuntimeError("SO101_REWARD_EPISODE_CONTIGUITY_INVALID")
    frames = [data["frame_index"][index] for index in positions]
    if frames != list(range(len(positions))):
        raise RuntimeError("SO101_REWARD_FRAME_CONTIGUITY_INVALID")
    timestamps = [data["timestamp"][index] for index in positions]
    if (any(not math.isfinite(float(value)) for value in timestamps)
        or any(float(timestamps[index]) < float(timestamps[index - 1])
          for index in range(1, len(timestamps)))):
        raise RuntimeError("SO101_REWARD_TIMESTAMP_INVALID")
    done_positions = [data["frame_index"][index] for index in positions
      if data["next.done"][index] is True]
    done_true_by_episode[str(episode)] = done_positions
    if done_positions and done_positions[-1] == len(positions) - 1:
        terminal_done_episodes += 1
    if any(float(data["next.reward"][index]) > 0 for index in positions):
        reward_positive_episodes += 1
    episode_lengths.append(len(positions))

episodes = pq.read_table(os.path.join(base, "meta", "episodes", "chunk-000",
  "file-000.parquet")).to_pydict()
if (episodes.get("episode_index") != list(range(15))
    or episodes.get("length") != episode_lengths):
    raise RuntimeError("SO101_REWARD_EPISODE_META_INVALID")
tasks = pq.read_table(os.path.join(base, "meta", "tasks.parquet"))
if tasks.num_rows != 1:
    raise RuntimeError("SO101_REWARD_TASK_META_INVALID")

reward_counts = collections.Counter(str(float(value)) for value in data["next.reward"])
penalty_counts = collections.Counter(str(float(value))
  for value in data["complementary_info.discrete_penalty"])
done_counts = collections.Counter(str(bool(value)).lower() for value in data["next.done"])
print(json.dumps({
  "episodes": 15, "frames": 7414, "tasks": 1, "fps": 30,
  "actionDimensions": 4, "stateDimensions": 18,
  "columns": table.column_names,
  "episodeAndFrameContinuity": True, "metadataAligned": True,
  "minimumEpisodeFrames": min(episode_lengths),
  "maximumEpisodeFrames": max(episode_lengths),
  "rewardFrameCounts": dict(sorted(reward_counts.items())),
  "penaltyFrameCounts": dict(sorted(penalty_counts.items())),
  "doneFrameCounts": dict(sorted(done_counts.items())),
  "doneTrueFrameIndicesByEpisode": done_true_by_episode,
  "terminalDoneEpisodes": terminal_done_episodes,
  "positiveRewardEpisodes": reward_positive_episodes,
  "isInterventionFieldPresent": "is_intervention" in table.column_names,
  "successFieldPresent": "success" in table.column_names,
  "failureFieldPresent": "failure" in table.column_names,
  "videoColumnsMaterializedInParquet": any("image" in value for value in table.column_names),
}, sort_keys=True, separators=(",", ":")))
`;

export function runSo101RewardReplay(sourceDirectory, options = {}) {
  const verified = verifySo101RewardSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const result = spawnSync(python, ["-c", PYARROW_REPLAY, sourceDirectory], {
    encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0) fail("PYARROW_REPLAY_FAILED",
    String(result.stderr || result.stdout).trim());
  return parseJson(Buffer.from(result.stdout.trim(), "utf8"), "pyarrow");
}

export function so101RewardArtifactHash(body) {
  return digest("outsider/so101-reward-morphology-audit/v1", body);
}

function buildBody(verified, replay) {
  return {
    schema: SO101_REWARD_AUDIT_SCHEMA,
    frozenAt: SO101_REWARD_FROZEN_AT,
    status: "PINNED_SO101_REWARD_DONE_PENALTY_NO_VIDEO_REPLAY",
    admission: "QUARANTINE_EVAL",
    source: { id: SO101_REWARD_ID, revision: SO101_REWARD_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      selectedObjects: 6, selectedBytes: 511_502,
      videoBytesExcluded: 73_262_296 },
    replay,
    hil: { repositoryNameAndTagsMentionHil: true,
      byteNativeIsInterventionField: false,
      publisherHilNamingPromotedToInterventionFact: false,
      interventionSegmentsRecoverable: false },
    outcome: { sourceNativeRewardAvailable: true, sourceNativeDoneAvailable: true,
      sourceNativeDiscretePenaltyAvailable: true,
      sourceNativeSuccessField: false, sourceNativeFailureField: false,
      publisherOrOperatorOutcome: true, independentOutcome: 0,
      longitudinalOutcome: 0 },
    completeness: { completePublishedNoVideoDataAndMeta: true,
      completePublishedEpisodeCensus: true, completeAttemptCensus: false,
      upstreamDiscardedAttemptsUnknown: true, videosAcquired: false,
      visualReplay: false },
    rights: { datasetCardClaim: "Apache-2.0",
      repositoryLicenseFilePresent: false,
      productionTrainingAllowed: false,
      evaluationUseFinallyAdjudicated: false },
    privacy: { sceneVideoAcquired: false, noPersonalInformationGuarantee: false,
      privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false },
    boundary: { training: 0, network: 0, CEU: 0, authority: 0, action: 0,
      opportunity: 0, delegation: 0, independentOutcome: 0,
      longitudinalOutcome: 0 },
  };
}

export function buildSo101RewardAuditFromSource(sourceDirectory, options = {}) {
  const verified = verifySo101RewardSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const body = buildBody(verified, runSo101RewardReplay(sourceDirectory, options));
  return { ...body, artifactHash: so101RewardArtifactHash(body) };
}

function zeroBoundary(value) {
  return plain(value) && ["training", "network", "CEU", "authority", "action",
    "opportunity", "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => value[key] === 0);
}

export function verifySo101RewardAudit(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== SO101_REWARD_AUDIT_SCHEMA
      || artifact.frozenAt !== SO101_REWARD_FROZEN_AT
      || artifact.status !== "PINNED_SO101_REWARD_DONE_PENALTY_NO_VIDEO_REPLAY"
      || artifact.admission !== "QUARANTINE_EVAL" || !HASH.test(artifact.artifactHash ?? "")) {
      fail("ARTIFACT_SHAPE_INVALID");
    }
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== so101RewardArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.selectedObjects !== 6 || artifact.source?.selectedBytes !== 511_502
      || artifact.replay?.episodes !== 15 || artifact.replay?.frames !== 7_414
      || artifact.replay?.actionDimensions !== 4 || artifact.replay?.stateDimensions !== 18
      || artifact.replay?.rewardFrameCounts?.["0.0"] !== 6_499
      || artifact.replay?.rewardFrameCounts?.["1.0"] !== 915
      || artifact.replay?.doneFrameCounts?.false !== 7_399
      || artifact.replay?.doneFrameCounts?.true !== 15
      || artifact.replay?.penaltyFrameCounts?.["0.0"] !== 7_414
      || artifact.replay?.terminalDoneEpisodes !== 15
      || artifact.replay?.positiveRewardEpisodes !== 15
      || artifact.replay?.isInterventionFieldPresent !== false
      || artifact.replay?.successFieldPresent !== false
      || artifact.replay?.failureFieldPresent !== false
      || artifact.replay?.videoColumnsMaterializedInParquet !== false
      || artifact.hil?.repositoryNameAndTagsMentionHil !== true
      || artifact.hil?.byteNativeIsInterventionField !== false
      || artifact.hil?.publisherHilNamingPromotedToInterventionFact !== false
      || artifact.hil?.interventionSegmentsRecoverable !== false
      || artifact.outcome?.sourceNativeRewardAvailable !== true
      || artifact.outcome?.sourceNativeDoneAvailable !== true
      || artifact.outcome?.sourceNativeDiscretePenaltyAvailable !== true
      || artifact.outcome?.sourceNativeSuccessField !== false
      || artifact.outcome?.sourceNativeFailureField !== false
      || artifact.outcome?.publisherOrOperatorOutcome !== true
      || artifact.outcome?.independentOutcome !== 0
      || artifact.outcome?.longitudinalOutcome !== 0
      || artifact.completeness?.completePublishedNoVideoDataAndMeta !== true
      || artifact.completeness?.completePublishedEpisodeCensus !== true
      || artifact.completeness?.completeAttemptCensus !== false
      || artifact.completeness?.upstreamDiscardedAttemptsUnknown !== true
      || artifact.completeness?.videosAcquired !== false
      || artifact.completeness?.visualReplay !== false
      || artifact.rights?.datasetCardClaim !== "Apache-2.0"
      || artifact.rights?.repositoryLicenseFilePresent !== false
      || artifact.rights?.productionTrainingAllowed !== false
      || artifact.rights?.evaluationUseFinallyAdjudicated !== false
      || artifact.privacy?.sceneVideoAcquired !== false
      || artifact.privacy?.noPersonalInformationGuarantee !== false
      || artifact.privacy?.privacyReviewComplete !== false
      || artifact.privacy?.publicAvailabilityResolvesPrivacy !== false
      || !zeroBoundary(artifact.boundary)) fail("ARTIFACT_BOUNDARY_INVALID");
    return { ok: true, artifactHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifySo101RewardAuditWithSource(artifact,
  sourceDirectory, options = {}) {
  const standalone = verifySo101RewardAudit(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildSo101RewardAuditFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: rebuilt.source.sourceManifestHash,
      sourceRoot: rebuilt.source.sourceRoot,
      verificationLevel: "FULL_SO101_REWARD_PARQUET_AND_META_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
