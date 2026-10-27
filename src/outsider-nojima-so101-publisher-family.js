/*
 * Pinned NOJIMA21 SO101 publisher-family intake.
 *
 * This binds the complete no-video root and seven saved evaluation records for
 * raw-egg transport together with the complete no-video egg-cracking episode.
 * Publisher task-success claims are kept separate from a post-finalize motor
 * disconnect error and from a wrist-camera identity drift.  Videos, an
 * external attempt census, independent outcomes and deployment authority stay
 * outside the artifact.
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

export const NOJIMA_TRANSPORT_ID = "NOJIMA21/so101-egg-transport-act-v0";
export const NOJIMA_TRANSPORT_REVISION =
  "b756293309351e38106b34bbe152e0eeb47de041";
export const NOJIMA_CRACKING_ID = "NOJIMA21/so101-egg-cracking";
export const NOJIMA_CRACKING_REVISION =
  "7e79c2c1423e419e430b2228daca0c6a67029a0b";
export const NOJIMA_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const NOJIMA_SOURCE_SCHEMA = "outsider/nojima-so101-family-source/v1";
export const NOJIMA_AUDIT_SCHEMA = "outsider/nojima-so101-family-audit/v1";

function transportSelect(remotePath) {
  return remotePath === "README.md" || remotePath.startsWith("data/")
    || remotePath.startsWith("meta/") || remotePath.startsWith("metadata/")
    || (remotePath.startsWith("evaluations/") && !remotePath.includes("/videos/"));
}

function crackingSelect(remotePath) {
  return remotePath === "README.md" || remotePath.startsWith("data/")
    || remotePath.startsWith("meta/");
}

export const NOJIMA_SOURCES = Object.freeze([
  Object.freeze({
    key: "transport", id: NOJIMA_TRANSPORT_ID, revision: NOJIMA_TRANSPORT_REVISION,
    usedStorage: 797_152_703, cardLicense: null, repositoryPaths: 156,
    treeEntries: 245, treeFiles: 156, treeBytes: 797_315_902,
    selectedObjects: 91, selectedBytes: 3_823_297,
    excludedVideos: 64, excludedVideoBytes: 793_490_101,
    repositoryProjectionHash:
      "sha256:2cd982e8fd5cfd69b58bf1dd92042b1d81d7a68d16726ec1864e7e569b8e0c0c",
    treeProjectionHash:
      "sha256:4da38ac3542bc54f4619142ae32a2830f2802b2f2f73d5126d5ebc84b71ba328",
    select: transportSelect,
  }),
  Object.freeze({
    key: "cracking", id: NOJIMA_CRACKING_ID, revision: NOJIMA_CRACKING_REVISION,
    usedStorage: 73_347_663, cardLicense: "other", repositoryPaths: 9,
    treeEntries: 19, treeFiles: 9, treeBytes: 73_369_049,
    selectedObjects: 6, selectedBytes: 210_888,
    excludedVideos: 2, excludedVideoBytes: 73_155_657,
    repositoryProjectionHash:
      "sha256:dd2edfc6bbc73fec8f050d0239da45f30d38108488f6d09350a56a2ec0508e01",
    treeProjectionHash:
      "sha256:1c6241b23782dae6d5172951fe79c9b155dbec05594b1481f7d6b874683b8385",
    select: crackingSelect,
  }),
]);

export const NOJIMA_PROFILE = Object.freeze({
  selectedObjects: 97,
  selectedBytes: 4_034_185,
  excludedVideos: 66,
  excludedVideoBytes: 866_645_758,
  transportTeleopEpisodes: 25,
  transportTeleopFrames: 35_467,
  transportSavedAutonomousEvaluations: 7,
  crackingEpisodes: 1,
  crackingFrames: 4_301,
  stateDimensions: 6,
  actionDimensions: 6,
  fps: 30,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;

function fail(code, detail = null) {
  throw new Error(detail == null ? `NOJIMA_SO101_${code}`
    : `NOJIMA_SO101_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function nojimaSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return nojimaSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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

function urls(profile) {
  const encoded = profile.id.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${profile.revision}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${profile.revision}?recursive=true&limit=1000`,
    rawBase: `${HF}/datasets/${encoded}/resolve/${profile.revision}`,
  };
}

function repositoryProjection(metadata) {
  if (!plain(metadata) || !Array.isArray(metadata.siblings)) fail("REPOSITORY_INVALID");
  const siblingPaths = metadata.siblings.map((entry) => entry?.rfilename).sort();
  if (siblingPaths.some((entry) => !safeRemotePath(entry))
    || new Set(siblingPaths).size !== siblingPaths.length) fail("REPOSITORY_PATHS_INVALID");
  return { id: metadata.id, sha: metadata.sha, private: metadata.private,
    gated: metadata.gated, disabled: metadata.disabled,
    usedStorage: metadata.usedStorage, cardLicense: metadata.cardData?.license ?? null,
    siblingPaths };
}

function validateRepository(profile, metadata) {
  const value = repositoryProjection(metadata);
  if (value.id !== profile.id || value.sha !== profile.revision
    || value.private !== false || value.gated !== false || value.disabled !== false
    || value.usedStorage !== profile.usedStorage || value.cardLicense !== profile.cardLicense
    || value.siblingPaths.length !== profile.repositoryPaths
    || digest("outsider/nojima-repository-projection/v1", value)
      !== profile.repositoryProjectionHash) fail("REPOSITORY_PROFILE_INVALID", profile.key);
  return value;
}

function treeEntry(entry) {
  if (!plain(entry) || !safeRemotePath(entry.path)
    || !["file", "directory"].includes(entry.type)
    || !SHA1.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
  if (entry.type === "directory") {
    if (entry.size !== 0) fail("TREE_DIRECTORY_SIZE_INVALID", entry.path);
    return { path: entry.path, type: "directory", oid: entry.oid,
      sizeBytes: 0, lfsSha256: null, lfsBytes: null };
  }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0) fail("TREE_FILE_SIZE_INVALID");
  if (entry.lfs == null) return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: null, lfsBytes: null };
  if (!plain(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
    || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
  return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: `sha256:${entry.lfs.oid}`,
    lfsBytes: entry.lfs.size };
}

function validateTree(profile, raw) {
  if (!Array.isArray(raw)) fail("TREE_INVALID");
  const projection = raw.map(treeEntry)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(projection.map((entry) => entry.path)).size !== projection.length) {
    fail("TREE_DUPLICATE_PATH");
  }
  const files = projection.filter((entry) => entry.type === "file");
  const selected = files.filter((entry) => profile.select(entry.path));
  const videos = files.filter((entry) => entry.path.includes("videos/")
    || entry.path.startsWith("videos/"));
  if (projection.length !== profile.treeEntries || files.length !== profile.treeFiles
    || files.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== profile.treeBytes
    || selected.length !== profile.selectedObjects
    || selected.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== profile.selectedBytes
    || videos.length !== profile.excludedVideos
    || videos.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== profile.excludedVideoBytes
    || digest("outsider/nojima-tree-projection/v1", projection)
      !== profile.treeProjectionHash) fail("TREE_PROFILE_INVALID", profile.key);
  return { projection, selected, videos };
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

async function fetchJson(url, fetchImpl) {
  const value = await boundedFetch(url, 8 * 1024 * 1024, fetchImpl);
  return { ...value, parsed: parseJson(value.bytes, url) };
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function safeJoin(root, relativePath) {
  if (!safeRemotePath(relativePath)) fail("LOCAL_PATH_UNSAFE", relativePath);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(path.resolve(root), target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("LOCAL_PATH_ESCAPE", relativePath);
  return target;
}

function writePrivateOnce(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  const fd = openSync(file, fsConstants.O_CREAT | fsConstants.O_EXCL
    | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fchmodSync(fd, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
    if (!fstatSync(fd).isFile() || fstatSync(fd).size !== bytes.length) {
      fail("WRITE_VERIFY_FAILED", file);
    }
  } finally { closeSync(fd); }
}

function privateTree(root) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", root);
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) privateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

async function mapConcurrent(values, concurrency, operation) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await operation(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

async function capturePhase(root, phase, fetchImpl) {
  const groups = await mapConcurrent(NOJIMA_SOURCES, 2, async (profile) => {
    const endpoint = urls(profile);
    const [repository, tree] = await Promise.all([
      fetchJson(endpoint.repository, fetchImpl), fetchJson(endpoint.tree, fetchImpl),
    ]);
    validateRepository(profile, repository.parsed);
    validateTree(profile, tree.parsed);
    const repositoryFile = `api/${phase}/${profile.key}-repository.json`;
    const treeFile = `api/${phase}/${profile.key}-tree.json`;
    writePrivateOnce(safeJoin(root, repositoryFile), repository.bytes);
    writePrivateOnce(safeJoin(root, treeFile), tree.bytes);
    const descriptors = [
      { phase, sourceKey: profile.key, kind: "repository", file: repositoryFile,
        requestUrl: endpoint.repository, finalUrl: repository.finalUrl,
        status: repository.status, contentType: repository.contentType,
        bytes: repository.bytes.length, sha256: nojimaSha256(repository.bytes) },
      { phase, sourceKey: profile.key, kind: "tree", file: treeFile,
        requestUrl: endpoint.tree, finalUrl: tree.finalUrl,
        status: tree.status, contentType: tree.contentType,
        bytes: tree.bytes.length, sha256: nojimaSha256(tree.bytes) },
    ];
    return { profile, repository: repository.parsed, tree: tree.parsed, descriptors };
  });
  return { groups, descriptors: groups.flatMap((group) => group.descriptors)
    .sort((left, right) => left.file.localeCompare(right.file)) };
}

async function downloadObject(root, profile, entry, fetchImpl) {
  const url = `${urls(profile).rawBase}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const fetched = await boundedFetch(url, Math.min(2 * 1024 * 1024,
    entry.sizeBytes + 1), fetchImpl);
  const sha256 = nojimaSha256(fetched.bytes);
  if (fetched.bytes.length !== entry.sizeBytes
    || (entry.lfsSha256 !== null ? sha256 !== entry.lfsSha256
      : gitBlobOid(fetched.bytes) !== entry.oid)) fail("OBJECT_INVALID", entry.path);
  const file = `objects/${profile.key}/${entry.path}`;
  writePrivateOnce(safeJoin(root, file), fetched.bytes);
  return { sourceKey: profile.key, datasetId: profile.id, revision: profile.revision,
    path: entry.path, file, requestUrl: url, finalUrl: fetched.finalUrl,
    status: fetched.status, contentType: fetched.contentType,
    bytes: fetched.bytes.length, sha256, gitOid: entry.oid,
    lfsSha256: entry.lfsSha256 };
}

function rootProjection(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots, ...remoteObjects].map((entry) => ({
    file: entry.file, bytes: entry.bytes, sha256: entry.sha256,
  })).sort((left, right) => left.file.localeCompare(right.file));
  return { files, sourceRoot: digest("outsider/nojima-source-root/v1", files) };
}

export async function acquirePinnedNojimaSource(sourceDirectory, options = {}) {
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
    const selected = before.groups.flatMap((group) => validateTree(group.profile,
      group.tree).selected.map((entry) => ({ profile: group.profile, entry })));
    const remoteObjects = (await mapConcurrent(selected, 6,
      ({ profile, entry }) => downloadObject(temporary, profile, entry, fetchImpl)))
      .sort((left, right) => left.file.localeCompare(right.file));
    const after = await capturePhase(temporary, "after", fetchImpl);
    for (const profile of NOJIMA_SOURCES) {
      const left = before.groups.find((group) => group.profile.key === profile.key);
      const right = after.groups.find((group) => group.profile.key === profile.key);
      if (!same(validateRepository(profile, left.repository),
        validateRepository(profile, right.repository))
        || !same(validateTree(profile, left.tree).projection,
          validateTree(profile, right.tree).projection)) fail("SOURCE_DRIFT", profile.key);
    }
    const apiSnapshots = [...before.descriptors, ...after.descriptors]
      .sort((left, right) => left.file.localeCompare(right.file));
    if (remoteObjects.length !== 97
      || remoteObjects.reduce((sum, entry) => sum + entry.bytes, 0) !== 4_034_185
      || remoteObjects.some((entry) => entry.path.endsWith(".mp4"))) fail("CLOSURE_INVALID");
    const rooted = rootProjection(apiSnapshots, remoteObjects);
    const body = {
      schema: NOJIMA_SOURCE_SCHEMA, frozenAt: NOJIMA_FROZEN_AT,
      apiSnapshots, remoteObjects, sourceFiles: rooted.files,
      sourceRoot: rooted.sourceRoot,
      closure: { selectedObjects: 97, selectedBytes: 4_034_185,
        transportCompleteNoVideoRootAndSevenEvaluations: true,
        crackingCompleteNoVideo: true, videosSelected: 0,
        videosExcluded: 66, videoBytesExcluded: 866_645_758 },
    };
    const manifest = { ...body,
      manifestHash: digest("outsider/nojima-source-manifest/v1", body) };
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

function snapshot(root, manifest, profile, phase, kind) {
  const descriptor = manifest.apiSnapshots.find((entry) => entry.sourceKey === profile.key
    && entry.phase === phase && entry.kind === kind);
  if (!descriptor) fail("SNAPSHOT_MISSING");
  const bytes = readRegular(safeJoin(root, descriptor.file), descriptor.bytes);
  if (nojimaSha256(bytes) !== descriptor.sha256) fail("SNAPSHOT_HASH_INVALID");
  return parseJson(bytes, descriptor.file);
}

export function verifyNojimaSourceDirectory(sourceDirectory) {
  try {
    const manifest = parseJson(readRegular(path.join(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== NOJIMA_SOURCE_SCHEMA
      || manifest.frozenAt !== NOJIMA_FROZEN_AT
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 8
      || !Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 97
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")) {
      fail("MANIFEST_INVALID");
    }
    const trees = {};
    for (const profile of NOJIMA_SOURCES) {
      const rb = validateRepository(profile, snapshot(sourceDirectory, manifest,
        profile, "before", "repository"));
      const ra = validateRepository(profile, snapshot(sourceDirectory, manifest,
        profile, "after", "repository"));
      const tb = validateTree(profile, snapshot(sourceDirectory, manifest,
        profile, "before", "tree"));
      const ta = validateTree(profile, snapshot(sourceDirectory, manifest,
        profile, "after", "tree"));
      if (!same(rb, ra) || !same(tb.projection, ta.projection)) fail("SOURCE_DRIFT");
      trees[profile.key] = tb;
    }
    const expectedKeys = NOJIMA_SOURCES.flatMap((profile) => trees[profile.key].selected
      .map((entry) => `${profile.key}\0${entry.path}`)).sort();
    const actualKeys = manifest.remoteObjects.map((entry) =>
      `${entry.sourceKey}\0${entry.path}`).sort();
    if (!same(expectedKeys, actualKeys)) fail("REMOTE_SET_INVALID");
    for (const descriptor of manifest.remoteObjects) {
      const profile = NOJIMA_SOURCES.find((entry) => entry.key === descriptor.sourceKey);
      const tree = profile && trees[profile.key];
      const entry = tree?.selected.find((item) => item.path === descriptor.path);
      if (!profile || !entry || descriptor.datasetId !== profile.id
        || descriptor.revision !== profile.revision
        || descriptor.file !== `objects/${profile.key}/${entry.path}`
        || descriptor.bytes !== entry.sizeBytes || descriptor.gitOid !== entry.oid
        || descriptor.lfsSha256 !== entry.lfsSha256) fail("REMOTE_DESCRIPTOR_INVALID");
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      if (nojimaSha256(bytes) !== descriptor.sha256
        || (entry.lfsSha256 !== null ? descriptor.sha256 !== entry.lfsSha256
          : gitBlobOid(bytes) !== entry.oid)) fail("REMOTE_HASH_INVALID");
    }
    const rooted = rootProjection(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles) || rooted.sourceRoot !== manifest.sourceRoot) {
      fail("SOURCE_ROOT_INVALID");
    }
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"].sort((left, right) => left.localeCompare(right));
    if (!same(walk(sourceDirectory), expectedFiles)) fail("FILE_CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/nojima-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    return { ok: true, manifest, trees,
      verificationLevel: "PINNED_TWO_REPOSITORY_COMPLETE_SELECTED_NO_VIDEO_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import json, os, sys
import pyarrow as pa
import pyarrow.parquet as pq

root = sys.argv[1]

def die(code):
    raise RuntimeError("NOJIMA_SO101_PYARROW_" + code)

def p(key, rel):
    return os.path.join(root, "objects", key, *rel.split("/"))

def read_json(key, rel, encoding="utf-8"):
    with open(p(key, rel), "r", encoding=encoding) as handle:
        return json.load(handle)

def validate_one(data, episodes, info, expected_episode, expected_frames):
    columns = ["action", "observation.state", "timestamp", "frame_index",
               "episode_index", "index", "task_index"]
    if data.column_names != columns or data.num_rows != expected_frames \
       or info.get("total_episodes") != 1 or info.get("total_frames") != expected_frames \
       or info.get("fps") != 30 or episodes.num_rows != 1:
        die("ONE_PROFILE")
    values = {name: data[name].to_pylist() for name in columns}
    if values["index"] != list(range(expected_frames)) \
       or values["episode_index"] != [expected_episode] * expected_frames \
       or values["frame_index"] != list(range(expected_frames)) \
       or any(len(item) != 6 for item in values["action"] + values["observation.state"]):
        die("ONE_CONTINUITY")
    return values

# Root transport: one physical parquet and one episode-metadata parquet per episode.
tbase = os.path.join(root, "objects", "transport")
with open(os.path.join(tbase, "meta", "info.json"), "r", encoding="utf-8") as handle:
    tinfo = json.load(handle)
tparts = [pq.read_table(os.path.join(tbase, "data", "chunk-000",
          "file-%03d.parquet" % index)) for index in range(25)]
teparts = [pq.read_table(os.path.join(tbase, "meta", "episodes", "chunk-000",
           "file-%03d.parquet" % index)) for index in range(25)]
tdata = pa.concat_tables(tparts)
tepisodes = pa.concat_tables(teparts)
if tinfo.get("total_episodes") != 25 or tinfo.get("total_frames") != 35467 \
   or tinfo.get("fps") != 30 or tdata.num_rows != 35467 or tepisodes.num_rows != 25:
    die("TRANSPORT_PROFILE")
columns = ["action", "observation.state", "timestamp", "frame_index",
           "episode_index", "index", "task_index"]
if any(part.column_names != columns for part in tparts):
    die("TRANSPORT_COLUMNS")
tv = {name: tdata[name].to_pylist() for name in columns}
if tv["index"] != list(range(35467)) \
   or any(len(item) != 6 for item in tv["action"] + tv["observation.state"]):
    die("TRANSPORT_INDEX")
ter = tepisodes.select(["episode_index", "length", "data/file_index",
                        "dataset_from_index", "dataset_to_index"]).to_pylist()
cursor = 0
for index, row in enumerate(ter):
    stop = cursor + row["length"]
    if row["episode_index"] != index or row["data/file_index"] != index \
       or row["dataset_from_index"] != cursor or row["dataset_to_index"] != stop \
       or tparts[index].num_rows != row["length"] \
       or tv["episode_index"][cursor:stop] != [index] * row["length"] \
       or tv["frame_index"][cursor:stop] != list(range(row["length"])):
        die("TRANSPORT_EPISODE_ALIGNMENT")
    cursor = stop
if cursor != 35467:
    die("TRANSPORT_FRAME_SUM")

with open(p("transport", "metadata/experiments.jsonl"), "r", encoding="utf-8-sig") as handle:
    experiments = [json.loads(line) for line in handle if line.strip()]
if len(experiments) != 25 \
   or [item.get("episode_index") for item in experiments] != list(range(25)) \
   or any(item.get("teleoperation") is not True or item.get("outcome") != "success"
          for item in experiments):
    die("EXPERIMENT_LOG")
camera_quality = {}
for item in experiments:
    camera_quality[item.get("camera_quality")] = camera_quality.get(item.get("camera_quality"), 0) + 1

evals = []
for index in range(1, 8):
    prefix = "evaluations/autonomous_success_%03d" % index
    data = pq.read_table(p("transport", prefix + "/data/chunk-000/file-000.parquet"))
    episodes = pq.read_table(p("transport", prefix + "/meta/episodes/chunk-000/file-000.parquet"))
    info = read_json("transport", prefix + "/meta/info.json")
    values = validate_one(data, episodes, info, 0, data.num_rows)
    feature_names = set(info.get("features", {}).keys()) | set(data.column_names)
    forbidden = ["outcome", "success", "failure", "reward", "next.reward", "done",
                 "next.done", "is_intervention"]
    if any(name in feature_names for name in forbidden):
        die("EVAL_SEMANTIC_FIELD")
    evals.append({"evaluationIndex": index, "frames": data.num_rows,
                  "structuredEvaluationJson": index == 1})

evaluation = read_json("transport", "evaluations/autonomous_success_001/evaluation.json")
if evaluation.get("outcome") != "success" \
   or evaluation.get("control") != "policy_only_no_teleoperation" \
   or evaluation.get("policy_type") != "ACT" or evaluation.get("training_episodes") != 25 \
   or "Torque_Enable" not in evaluation.get("notes", "") \
   or "motor ID 3" not in evaluation.get("notes", "") \
   or "successfully finalized before that error" not in evaluation.get("notes", ""):
    die("EVALUATION_JSON")

# Cracking state/action episode.
cinfo = read_json("cracking", "meta/info.json")
cdata = pq.read_table(p("cracking", "data/chunk-000/file-000.parquet"))
cepisodes = pq.read_table(p("cracking", "meta/episodes/chunk-000/file-000.parquet"))
validate_one(cdata, cepisodes, cinfo, 0, 4301)

out = {
  "transport": {
    "teleopEpisodes": 25, "teleopFrames": 35467,
    "teleopPublisherSuccessLogRows": 25,
    "teleopCameraQualityCounts": camera_quality,
    "savedAutonomousEvaluations": evals,
    "savedAutonomousEvaluationFrames": sum(item["frames"] for item in evals),
    "structuredOutcomeAnnotations": 1,
    "evaluation001": {"publisherOutcome": "success",
      "policyOnlyNoTeleoperation": True, "policyType": "ACT",
      "trainingEpisodes": 25,
      "postFinalizeMotorDisconnectError": True,
      "motorId": 3},
  },
  "cracking": {"episodes": 1, "frames": 4301, "fps": 30,
               "actionDimensions": 6, "stateDimensions": 6,
               "episodeAndFrameContinuity": True},
}
print(json.dumps(out, sort_keys=True, separators=(",", ":")))
`;

export function runNojimaPyarrowReplay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const executed = spawnSync(python, ["-c", PYARROW_REPLAY,
    path.resolve(sourceDirectory)], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (executed.error) fail("PYARROW_EXEC_FAILED", executed.error.message);
  if (executed.status !== 0) fail("PYARROW_REPLAY_FAILED",
    String(executed.stderr || executed.stdout).trim());
  const replay = parseJson(Buffer.from(executed.stdout, "utf8"), "PYARROW_REPLAY");
  if (replay?.transport?.teleopEpisodes !== 25
    || replay?.transport?.savedAutonomousEvaluations?.length !== 7
    || replay?.cracking?.frames !== 4_301) fail("PYARROW_RESULT_INVALID");
  return replay;
}

function objectPath(root, key, remotePath) {
  return path.join(root, "objects", key, ...remotePath.split("/"));
}

function inspectReadmes(sourceDirectory) {
  const transport = readRegular(objectPath(sourceDirectory, "transport", "README.md"))
    .toString("utf8");
  const cracking = readRegular(objectPath(sourceDirectory, "cracking", "README.md"))
    .toString("utf8");
  if (!transport.includes("25 human teleoperation demonstrations")
    || !transport.includes("seven saved autonomous-success")
    || !transport.includes("Torque_Enable") || !transport.includes("motor ID 3")
    || !transport.includes("finalized")
    || !cracking.includes("task success, data-capture failure")
    || !cracking.includes("manipulation itself succeeded")
    || !cracking.includes("unintended overhead-camera view")
    || !cracking.includes("Windows camera-routing issue")
    || !cracking.includes("Published with the recorder's authorization")) {
    fail("README_CLAIMS_INVALID");
  }
  return {
    transportPublisherDeclares25Teleop: true,
    transportPublisherDeclares7SavedAutonomousSuccesses: true,
    transportPublisherSeparatesPostFinalizeMotorError: true,
    crackingPublisherDeclaresPhysicalTaskSuccess: true,
    crackingPublisherDeclaresCameraDataFailure: true,
    crackingPublisherDeclaresWristToOverheadIdentityDrift: true,
    crackingPublisherAuthorizationStatement: true,
  };
}

export function nojimaArtifactHash(body) {
  return digest("outsider/nojima-so101-family-audit/v1", body);
}

function artifactBody(verified, replay, publisher) {
  return {
    schema: NOJIMA_AUDIT_SCHEMA,
    frozenAt: NOJIMA_FROZEN_AT,
    status: "PINNED_NOJIMA_SO101_PUBLISHER_FAMILY_NO_VIDEO_REPLAY",
    admission: "QUARANTINE_EVAL",
    source: {
      repositories: NOJIMA_SOURCES.map(({ id, revision, cardLicense }) =>
        ({ id, revision, datasetCardLicenseClaim: cardLicense })),
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      selectedObjects: 97, selectedBytes: 4_034_185,
      videosExcluded: 66, videoBytesExcluded: 866_645_758,
    },
    replay,
    publisher,
    eventClassification: {
      transportEvaluation001PublisherTaskSuccess: true,
      transportMotorErrorOccurredAfterEpisodeFinalization: true,
      transportMotorErrorClassifiedAsTaskFailure: false,
      transportMotorErrorClassifiedAsPostFinalizeOperationalError: true,
      crackingPublisherTaskSuccess: true,
      crackingPublisherCameraPipelineFailure: true,
      crackingCameraIdentityDriftClassifiedAsRobotFailure: false,
      crackingCameraIdentityDriftClassifiedAsCapturePipelineFailure: true,
      cameraIdentityDriftVisuallyVerifiedByThisArtifact: false,
    },
    outcome: {
      source: "PUBLISHER_SELF_REPORTED_OR_FOLDER_NAMING",
      transportRootPublisherSuccessLabels: 25,
      transportSavedAutonomousPublisherSuccesses: 7,
      transportStructuredOutcomeAnnotations: 1,
      crackingPublisherTaskSuccesses: 1,
      independentOutcome: 0,
      longitudinalOutcome: 0,
    },
    selection: {
      onlySavedAutonomousSuccessDirectoriesPublished: true,
      unsuccessfulOrUnsavedAutonomousAttemptsUnknown: true,
      completeAttemptCensus: false,
      selectionBiasPresent: true,
    },
    completeness: {
      completeTransportRootNoVideo: true,
      completeSevenEvaluationNoVideoRecords: true,
      completeCrackingNoVideo: true,
      allSelectedParquetsReplayed: true,
      bothPinnedRepositoryRecordsAndTreesCapturedBeforeAndAfter: true,
      videosAcquired: false,
      visualReplay: false,
    },
    rights: {
      transportDatasetCardClaim: null,
      crackingDatasetCardClaim: "other",
      repositoryLicenseFilesPresent: false,
      productionTrainingAllowed: false,
      evaluationUseFinallyAdjudicated: false,
    },
    privacy: {
      crackingPublisherAuthorizationStatement: true,
      workspaceVideosAcquired: false,
      privacyReviewComplete: false,
      noPersonalInformationGuarantee: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    boundary: {
      training: 0, network: 0, CEU: 0, authority: 0, action: 0,
      opportunity: 0, delegation: 0, independentOutcome: 0,
      longitudinalOutcome: 0,
    },
  };
}

export function buildNojimaFamilyAuditFromSource(sourceDirectory, options = {}) {
  const verified = verifyNojimaSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runNojimaPyarrowReplay(sourceDirectory, options);
  const publisher = inspectReadmes(sourceDirectory);
  const body = artifactBody(verified, replay, publisher);
  return { ...body, artifactHash: nojimaArtifactHash(body) };
}

function zeroBoundary(value) {
  return plain(value) && ["training", "network", "CEU", "authority", "action",
    "opportunity", "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => value[key] === 0);
}

export function verifyNojimaFamilyAudit(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== NOJIMA_AUDIT_SCHEMA
      || artifact.frozenAt !== NOJIMA_FROZEN_AT
      || artifact.status !== "PINNED_NOJIMA_SO101_PUBLISHER_FAMILY_NO_VIDEO_REPLAY"
      || artifact.admission !== "QUARANTINE_EVAL" || !HASH.test(artifact.artifactHash ?? "")) {
      fail("ARTIFACT_SHAPE_INVALID");
    }
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== nojimaArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.selectedObjects !== 97 || artifact.source?.selectedBytes !== 4_034_185
      || artifact.source?.videosExcluded !== 66
      || artifact.replay?.transport?.teleopEpisodes !== 25
      || artifact.replay?.transport?.teleopFrames !== 35_467
      || artifact.replay?.transport?.savedAutonomousEvaluations?.length !== 7
      || artifact.replay?.transport?.structuredOutcomeAnnotations !== 1
      || artifact.replay?.cracking?.episodes !== 1
      || artifact.replay?.cracking?.frames !== 4_301) fail("ARTIFACT_COUNTS_INVALID");
    const events = artifact.eventClassification;
    if (events?.transportEvaluation001PublisherTaskSuccess !== true
      || events?.transportMotorErrorOccurredAfterEpisodeFinalization !== true
      || events?.transportMotorErrorClassifiedAsTaskFailure !== false
      || events?.transportMotorErrorClassifiedAsPostFinalizeOperationalError !== true
      || events?.crackingPublisherTaskSuccess !== true
      || events?.crackingPublisherCameraPipelineFailure !== true
      || events?.crackingCameraIdentityDriftClassifiedAsRobotFailure !== false
      || events?.crackingCameraIdentityDriftClassifiedAsCapturePipelineFailure !== true
      || events?.cameraIdentityDriftVisuallyVerifiedByThisArtifact !== false
      || artifact.outcome?.independentOutcome !== 0
      || artifact.selection?.completeAttemptCensus !== false
      || artifact.selection?.selectionBiasPresent !== true
      || artifact.completeness?.videosAcquired !== false
      || artifact.completeness?.visualReplay !== false
      || artifact.rights?.transportDatasetCardClaim !== null
      || artifact.rights?.crackingDatasetCardClaim !== "other"
      || artifact.rights?.productionTrainingAllowed !== false
      || artifact.privacy?.privacyReviewComplete !== false
      || !zeroBoundary(artifact.boundary)) fail("ARTIFACT_BOUNDARY_INVALID");
    return { ok: true, artifactHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyNojimaFamilyAuditWithSource(artifact,
  sourceDirectory, options = {}) {
  const standalone = verifyNojimaFamilyAudit(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildNojimaFamilyAuditFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: rebuilt.source.sourceManifestHash,
      sourceRoot: rebuilt.source.sourceRoot,
      verificationLevel: "FULL_TWO_REPOSITORY_SELECTED_BYTE_AND_PYARROW_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

