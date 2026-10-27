/*
 * Fixed-revision, complete no-video intake for
 * KGB0/pick_and_place_failure_labeling.  Every non-MP4 byte is acquired:
 * 194 complete Parquets, 194 matching tactile-token sidecars, all metadata and
 * root reports.  All 388 MP4s are retained as a complete tree-bound inventory.
 * Publisher failure annotations remain annotations; they are never promoted to
 * independent task outcomes, recovery executions, or an attempt census.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, rmSync, unlinkSync, writeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const KGB0_FAILURE_ID = "KGB0/pick_and_place_failure_labeling";
export const KGB0_FAILURE_REVISION =
  "6ba69839b27ed99d0f214bbbb8c52ca31f2d3bc6";
export const KGB0_FAILURE_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const KGB0_FAILURE_SOURCE_SCHEMA =
  "outsider/kgb0-pick-place-failure-labeling-source/v1";
export const KGB0_FAILURE_ARTIFACT_SCHEMA =
  "outsider/kgb0-pick-place-failure-labeling/v1";
export const KGB0_FAILURE_PROFILE = Object.freeze({
  usedStorage: 1_826_356_890,
  treeEntries: 803,
  treeDirectories: 12,
  treeFiles: 791,
  treeBytes: 1_791_793_136,
  noVideoFiles: 403,
  noVideoBytes: 236_435_951,
  parquetFiles: 194,
  parquetBytes: 89_233_489,
  embeddingFiles: 194,
  embeddingBytes: 142_678_424,
  metadataFiles: 11,
  metadataBytes: 4_487_738,
  rootFiles: 4,
  rootBytes: 36_300,
  videoFiles: 388,
  videoBytes: 1_555_357_185,
  episodes: 194,
  frames: 69_416,
  tasks: 14,
  labels: 228,
  failureFrames: 20_963,
  fps: 30,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_API_BYTES = 8 * 1024 * 1024;
const MAX_OBJECT_BYTES = 12 * 1024 * 1024;
const FETCH_ATTEMPTS = 4;
const FETCH_CONCURRENCY = 6;

function fail(code, detail = null) {
  throw new Error(detail === null ? `KGB0_FAILURE_${code}`
    : `KGB0_FAILURE_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function kgb0FailureSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return kgb0FailureSha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes).digest("hex");
}

function safeRemotePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 2048
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function endpoints() {
  const encoded = KGB0_FAILURE_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${KGB0_FAILURE_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${KGB0_FAILURE_REVISION}`
      + "?recursive=true&expand=false&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${KGB0_FAILURE_REVISION}`,
  };
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
    || /(?:fetch failed|network|timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN|terminated)/iu
      .test(String(error?.message ?? error));
}

async function fetchOnce(url, maximumBytes, fetchImpl) {
  if (!permittedUrl(url)) fail("REQUEST_URL_REFUSED", url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "application/json, application/octet-stream;q=0.9, */*;q=0.8" } });
    if (!response || typeof response.arrayBuffer !== "function") {
      fail("FETCH_RESPONSE_INVALID");
    }
    if (!response.ok) {
      const error = new Error(`HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 425
        || response.status === 429 || response.status >= 500;
      throw error;
    }
    const finalUrl = response.url || url;
    if (!permittedUrl(finalUrl)) fail("FINAL_URL_REFUSED", finalUrl);
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > maximumBytes) {
      fail("CONTENT_LENGTH_EXCEEDED", String(declared));
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) fail("BODY_BYTES_EXCEEDED", String(bytes.length));
    return { bytes, finalUrl, status: response.status,
      contentType: response.headers?.get?.("content-type") ?? null,
      link: response.headers?.get?.("link") ?? null };
  } finally { clearTimeout(timer); }
}

async function boundedFetch(url, maximumBytes, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try { return await fetchOnce(url, maximumBytes, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === FETCH_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw last;
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

async function fetchJson(url, fetchImpl) {
  const fetched = await boundedFetch(url, MAX_API_BYTES, fetchImpl);
  return { ...fetched, value: parseJson(fetched.bytes, url) };
}

function repositoryProjection(value) {
  if (!plain(value) || !Array.isArray(value.siblings)) fail("REPOSITORY_INVALID");
  const siblingPaths = value.siblings.map((entry) => entry?.rfilename)
    .sort((left, right) => String(left).localeCompare(String(right)));
  const projected = { id: value.id, sha: value.sha, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage ?? null,
    cardLicense: value.cardData?.license ?? null, siblingPaths };
  if (siblingPaths.some((entry) => !safeRemotePath(entry))
    || new Set(siblingPaths).size !== siblingPaths.length
    || projected.id !== KGB0_FAILURE_ID || projected.sha !== KGB0_FAILURE_REVISION
    || projected.private !== false || projected.gated !== false
    || projected.disabled !== false
    || projected.usedStorage !== KGB0_FAILURE_PROFILE.usedStorage
    || projected.cardLicense !== "apache-2.0"
    || siblingPaths.length !== KGB0_FAILURE_PROFILE.treeFiles) {
    fail("REPOSITORY_PROFILE_INVALID");
  }
  return projected;
}

function treeEntry(entry) {
  if (!plain(entry) || !safeRemotePath(entry.path)
    || !["file", "directory"].includes(entry.type)
    || !SHA1.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
  if (entry.type === "directory") {
    if (entry.size !== 0 || entry.lfs != null) fail("TREE_DIRECTORY_INVALID", entry.path);
    return { path: entry.path, type: "directory", oid: entry.oid,
      sizeBytes: 0, lfsSha256: null };
  }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
    fail("TREE_FILE_SIZE_INVALID", entry.path);
  }
  if (entry.lfs == null) return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: null };
  if (!plain(entry.lfs) || !SHA256.test(entry.lfs.oid ?? "")
    || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
  return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: `sha256:${entry.lfs.oid}` };
}

function sumBytes(entries) {
  return entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
}

function projectTree(value) {
  if (!Array.isArray(value)) fail("TREE_INVALID");
  const projection = value.map(treeEntry)
    .sort((left, right) => left.path.localeCompare(right.path));
  const files = projection.filter((entry) => entry.type === "file");
  const directories = projection.filter((entry) => entry.type === "directory");
  const videos = files.filter((entry) => entry.path.endsWith(".mp4"));
  const selected = files.filter((entry) => !entry.path.endsWith(".mp4"));
  const parquet = selected.filter((entry) => entry.path.endsWith(".parquet"));
  const embeddings = selected.filter((entry) => entry.path.endsWith(".pt"));
  const metadata = selected.filter((entry) => entry.path.startsWith("meta/"));
  const roots = selected.filter((entry) => !entry.path.includes("/"));
  const licensePaths = files.filter((entry) =>
    /(?:^|\/)(?:licen[cs]e|copying|notice)(?:\.|$)/iu.test(entry.path));
  if (new Set(projection.map((entry) => entry.path)).size !== projection.length
    || projection.length !== KGB0_FAILURE_PROFILE.treeEntries
    || files.length !== KGB0_FAILURE_PROFILE.treeFiles
    || directories.length !== KGB0_FAILURE_PROFILE.treeDirectories
    || sumBytes(files) !== KGB0_FAILURE_PROFILE.treeBytes
    || selected.length !== KGB0_FAILURE_PROFILE.noVideoFiles
    || sumBytes(selected) !== KGB0_FAILURE_PROFILE.noVideoBytes
    || parquet.length !== KGB0_FAILURE_PROFILE.parquetFiles
    || sumBytes(parquet) !== KGB0_FAILURE_PROFILE.parquetBytes
    || embeddings.length !== KGB0_FAILURE_PROFILE.embeddingFiles
    || sumBytes(embeddings) !== KGB0_FAILURE_PROFILE.embeddingBytes
    || metadata.length !== KGB0_FAILURE_PROFILE.metadataFiles
    || sumBytes(metadata) !== KGB0_FAILURE_PROFILE.metadataBytes
    || roots.length !== KGB0_FAILURE_PROFILE.rootFiles
    || sumBytes(roots) !== KGB0_FAILURE_PROFILE.rootBytes
    || videos.length !== KGB0_FAILURE_PROFILE.videoFiles
    || sumBytes(videos) !== KGB0_FAILURE_PROFILE.videoBytes
    || licensePaths.length !== 0) fail("TREE_PROFILE_INVALID");
  return { projection, files, directories, selected, videos, parquet,
    embeddings, metadata, roots, licensePaths, bytes: sumBytes(files),
    treeHash: digest("outsider/kgb0-failure-tree/v1", projection) };
}

function validateRecordTree(record, tree) {
  const repository = repositoryProjection(record);
  const projectedTree = projectTree(tree);
  if (!same(repository.siblingPaths, projectedTree.files.map((entry) => entry.path)
    .sort((left, right) => left.localeCompare(right)))) {
    fail("REPOSITORY_TREE_FILE_SET_MISMATCH");
  }
  return { repository, tree: projectedTree };
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
  const descriptor = openSync(file, fsConstants.O_CREAT | fsConstants.O_EXCL
    | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size !== bytes.length) fail("WRITE_VERIFY_FAILED", file);
  } finally { closeSync(descriptor); }
}

function replacePrivateJson(file, value) {
  const temporary = `${file}.next-${process.pid}`;
  writePrivateOnce(temporary, canonicalBytes(value));
  renameSync(temporary, file);
  chmodSync(file, 0o600);
}

function readRegular(file, expectedBytes = null) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) fail("FILE_UNSAFE", file);
  const bytes = readFileSync(file);
  if (expectedBytes !== null && bytes.length !== expectedBytes) {
    fail("FILE_SIZE_INVALID", file);
  }
  return bytes;
}

function enforcePrivateTree(root) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", root);
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) enforcePrivateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

function walkRelative(root) {
  const files = [];
  const queue = [root];
  while (queue.length > 0) {
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

async function mapConcurrent(values, concurrency, operation) {
  const result = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return result;
}

function snapshotDescriptor(phase, kind, url, fetched, file) {
  return { phase, kind, requestUrl: url, finalUrl: fetched.finalUrl,
    status: fetched.status, contentType: fetched.contentType,
    link: fetched.link, file, bytes: fetched.bytes.length,
    sha256: kgb0FailureSha256(fetched.bytes) };
}

async function captureSnapshotSet(root, phase, fetchImpl) {
  const temporary = path.join(root, `.${phase}.tmp-${process.pid}`);
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
  mkdirSync(temporary, { mode: 0o700 });
  const endpoint = endpoints();
  try {
    const [record, tree] = await Promise.all([
      fetchJson(endpoint.repository, fetchImpl), fetchJson(endpoint.tree, fetchImpl),
    ]);
    if (tree.link !== null) fail("TREE_PAGINATION_NOT_CLOSED");
    validateRecordTree(record.value, tree.value);
    writePrivateOnce(path.join(temporary, "repository.json"), record.bytes);
    writePrivateOnce(path.join(temporary, "tree.json"), tree.bytes);
    const descriptors = [
      snapshotDescriptor(phase, "repository", endpoint.repository, record,
        `api/${phase}/repository.json`),
      snapshotDescriptor(phase, "tree", endpoint.tree, tree,
        `api/${phase}/tree.json`),
    ];
    const finalRoot = path.join(root, "api", phase);
    ensurePrivateDirectory(path.dirname(finalRoot));
    if (existsSync(finalRoot)) fail("SNAPSHOT_PHASE_EXISTS", phase);
    renameSync(temporary, finalRoot);
    return descriptors;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function readSnapshot(root, descriptor) {
  const bytes = readRegular(safeJoin(root, descriptor.file), descriptor.bytes);
  if (kgb0FailureSha256(bytes) !== descriptor.sha256) {
    fail("SNAPSHOT_HASH_INVALID", descriptor.file);
  }
  return parseJson(bytes, descriptor.file);
}

function snapshotsFor(root, descriptors, phase) {
  const record = descriptors.find((entry) => entry.phase === phase
    && entry.kind === "repository");
  const tree = descriptors.find((entry) => entry.phase === phase
    && entry.kind === "tree");
  if (!record || !tree) fail("SNAPSHOT_MISSING", phase);
  return { record: readSnapshot(root, record), tree: readSnapshot(root, tree) };
}

function compareSnapshots(before, after) {
  if (!same(validateRecordTree(before.record, before.tree),
    validateRecordTree(after.record, after.tree))) {
    fail("PINNED_SOURCE_CHANGED_DURING_ACQUISITION");
  }
}

function objectRelative(entry) {
  return `objects/${entry.path}`;
}

function verifyObjectBytes(bytes, entry) {
  if (bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_INVALID", entry.path);
  const sha256 = kgb0FailureSha256(bytes);
  if (entry.lfsSha256 !== null ? sha256 !== entry.lfsSha256
    : gitBlobOid(bytes) !== entry.oid) fail("OBJECT_TREE_HASH_INVALID", entry.path);
  return sha256;
}

async function downloadOrReuse(root, entry, fetchImpl) {
  const url = `${endpoints().raw}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const relative = objectRelative(entry);
  const local = safeJoin(root, relative);
  if (existsSync(local)) {
    const bytes = readRegular(local, entry.sizeBytes);
    return { path: entry.path, file: relative, requestUrl: url, finalUrl: url,
      status: 200, contentType: null, bytes: bytes.length,
      sha256: verifyObjectBytes(bytes, entry), gitOid: entry.oid,
      lfsSha256: entry.lfsSha256,
      retrieval: "CHECKPOINT_REUSED_VERIFIED_BYTES" };
  }
  const fetched = await boundedFetch(url,
    Math.min(MAX_OBJECT_BYTES, entry.sizeBytes + 1), fetchImpl);
  const sha256 = verifyObjectBytes(fetched.bytes, entry);
  writePrivateOnce(local, fetched.bytes);
  return { path: entry.path, file: relative, requestUrl: url,
    finalUrl: fetched.finalUrl, status: fetched.status,
    contentType: fetched.contentType, bytes: fetched.bytes.length, sha256,
    gitOid: entry.oid, lfsSha256: entry.lfsSha256, retrieval: "NETWORK_FETCH" };
}

function checkpointMarker() {
  return { schema: "outsider/kgb0-failure-no-video-checkpoint/v1",
    id: KGB0_FAILURE_ID, revision: KGB0_FAILURE_REVISION };
}

function initializeCheckpoint(root) {
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writePrivateOnce(path.join(root, "checkpoint-marker.json"),
      canonicalBytes(checkpointMarker()));
  }
  const marker = parseJson(readRegular(path.join(root, "checkpoint-marker.json")),
    "checkpoint-marker.json");
  if (!same(marker, checkpointMarker())) fail("CHECKPOINT_MARKER_INVALID");
  const stateFile = path.join(root, "checkpoint-state.json");
  if (!existsSync(stateFile)) return { beforeDescriptors: null,
    remoteObjects: [], afterDescriptors: null };
  const state = parseJson(readRegular(stateFile), "checkpoint-state.json");
  if (!plain(state) || !Array.isArray(state.remoteObjects)) {
    fail("CHECKPOINT_STATE_INVALID");
  }
  return state;
}

function saveCheckpoint(root, state) {
  replacePrivateJson(path.join(root, "checkpoint-state.json"), state);
}

function sourceRootFor(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots.map((entry) => ({ file: entry.file,
    bytes: entry.bytes, sha256: entry.sha256 })),
  ...remoteObjects.map((entry) => ({ file: entry.file,
    bytes: entry.bytes, sha256: entry.sha256 }))]
    .sort((left, right) => left.file.localeCompare(right.file));
  return { files,
    sourceRoot: digest("outsider/kgb0-failure-source-root/v1", files) };
}

function videoInventory(tree) {
  return tree.videos.map((entry) => ({ path: entry.path,
    bytes: entry.sizeBytes, gitOid: entry.oid, lfsSha256: entry.lfsSha256 }));
}

function closureFrom(tree) {
  const streams = {};
  for (const entry of tree.videos) {
    const match = /^videos\/chunk-\d+\/([^/]+)\/episode_\d+\.mp4$/u.exec(entry.path);
    if (!match) fail("VIDEO_PATH_INVALID", entry.path);
    streams[match[1]] = (streams[match[1]] ?? 0) + 1;
  }
  return {
    selectionRule: "ALL_NON_MP4_FILES_AT_FIXED_REVISION",
    completePublishedNoVideoGroup: true,
    randomTruncation: false,
    selectedObjects: tree.selected.length,
    selectedBytes: sumBytes(tree.selected),
    parquetFiles: tree.parquet.length,
    parquetBytes: sumBytes(tree.parquet),
    embeddingFiles: tree.embeddings.length,
    embeddingBytes: sumBytes(tree.embeddings),
    metadataFiles: tree.metadata.length,
    metadataBytes: sumBytes(tree.metadata),
    rootFiles: tree.roots.length,
    rootBytes: sumBytes(tree.roots),
    videosInventoried: tree.videos.length,
    videoBytesInventoried: sumBytes(tree.videos),
    videoStreams: streams,
    videoBytesAcquired: 0,
    recursiveTreeEntries: tree.projection.length,
    recursiveTreeDirectories: tree.directories.length,
    recursiveTreeFiles: tree.files.length,
    recursiveTreeBytes: tree.bytes,
    recursiveTreeHash: tree.treeHash,
    recursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreePagesPerPhase: 1,
    licenseFilesPresent: tree.licensePaths.length,
    globallyExhaustive: false,
  };
}

function sourceManifestHash(body) {
  return digest("outsider/kgb0-failure-source-manifest/v1", body);
}

export async function acquirePinnedKgb0FailureSource(sourceDirectory,
  options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  if (existsSync(sourceDirectory)) fail("SOURCE_EXISTS", sourceDirectory);
  ensurePrivateDirectory(path.dirname(path.resolve(sourceDirectory)));
  const checkpoint = options.checkpointDirectory
    ?? `${path.resolve(sourceDirectory)}.checkpoint`;
  const state = initializeCheckpoint(checkpoint);
  try {
    if (state.beforeDescriptors === null) {
      state.beforeDescriptors = await captureSnapshotSet(checkpoint, "before", fetchImpl);
      saveCheckpoint(checkpoint, state);
    }
    const before = snapshotsFor(checkpoint, state.beforeDescriptors, "before");
    const joined = validateRecordTree(before.record, before.tree);
    const completed = new Map(state.remoteObjects.map((entry) => [entry.path, entry]));
    await mapConcurrent(joined.tree.selected, FETCH_CONCURRENCY, async (entry) => {
      const prior = completed.get(entry.path);
      if (prior) {
        verifyObjectBytes(readRegular(safeJoin(checkpoint, prior.file), prior.bytes), entry);
        return prior;
      }
      const descriptor = await downloadOrReuse(checkpoint, entry, fetchImpl);
      completed.set(entry.path, descriptor);
      state.remoteObjects = [...completed.values()]
        .sort((left, right) => left.file.localeCompare(right.file));
      saveCheckpoint(checkpoint, state);
      return descriptor;
    });
    state.remoteObjects = [...completed.values()]
      .sort((left, right) => left.file.localeCompare(right.file));
    if (state.remoteObjects.length !== KGB0_FAILURE_PROFILE.noVideoFiles) {
      fail("REMOTE_OBJECT_CENSUS_INVALID");
    }
    if (state.afterDescriptors === null) {
      state.afterDescriptors = await captureSnapshotSet(checkpoint, "after", fetchImpl);
      saveCheckpoint(checkpoint, state);
    }
    const after = snapshotsFor(checkpoint, state.afterDescriptors, "after");
    compareSnapshots(before, after);
    const apiSnapshots = [...state.beforeDescriptors, ...state.afterDescriptors]
      .sort((left, right) => left.file.localeCompare(right.file));
    const rooted = sourceRootFor(apiSnapshots, state.remoteObjects);
    const body = { schema: KGB0_FAILURE_SOURCE_SCHEMA,
      frozenAt: KGB0_FAILURE_FROZEN_AT,
      datasetId: KGB0_FAILURE_ID, revision: KGB0_FAILURE_REVISION,
      apiSnapshots, remoteObjects: state.remoteObjects,
      videoInventory: videoInventory(joined.tree),
      sourceFiles: rooted.files, sourceRoot: rooted.sourceRoot,
      closure: closureFrom(joined.tree) };
    const manifest = { ...body, manifestHash: sourceManifestHash(body) };
    writePrivateOnce(path.join(checkpoint, "acquisition-manifest.json"),
      canonicalBytes(manifest));
    unlinkSync(path.join(checkpoint, "checkpoint-marker.json"));
    unlinkSync(path.join(checkpoint, "checkpoint-state.json"));
    enforcePrivateTree(checkpoint);
    renameSync(checkpoint, sourceDirectory);
    chmodSync(sourceDirectory, 0o700);
    return { sourceDirectory, manifest };
  } catch (error) {
    try { enforcePrivateTree(checkpoint); } catch { /* retain primary failure */ }
    throw error;
  }
}

function verifyRemoteObjects(root, manifest, tree) {
  if (!Array.isArray(manifest.remoteObjects)
    || manifest.remoteObjects.length !== tree.selected.length
    || !same(manifest.remoteObjects.map((entry) => entry.path).sort(),
      tree.selected.map((entry) => entry.path).sort())) fail("REMOTE_OBJECT_SET_INVALID");
  for (const descriptor of manifest.remoteObjects) {
    const entry = tree.selected.find((item) => item.path === descriptor.path);
    if (!entry || descriptor.file !== objectRelative(entry)
      || descriptor.bytes !== entry.sizeBytes || descriptor.gitOid !== entry.oid
      || descriptor.lfsSha256 !== entry.lfsSha256
      || !HASH.test(descriptor.sha256 ?? "") || descriptor.status !== 200
      || !permittedUrl(descriptor.requestUrl) || !permittedUrl(descriptor.finalUrl)) {
      fail("REMOTE_DESCRIPTOR_INVALID", descriptor.file);
    }
    const bytes = readRegular(safeJoin(root, descriptor.file), descriptor.bytes);
    if (kgb0FailureSha256(bytes) !== descriptor.sha256) {
      fail("REMOTE_HASH_INVALID", descriptor.file);
    }
    verifyObjectBytes(bytes, entry);
  }
}

export function verifyKgb0FailureSourceDirectory(sourceDirectory) {
  try {
    const stat = lstatSync(sourceDirectory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("SOURCE_DIRECTORY_UNSAFE");
    const manifest = parseJson(readRegular(path.join(sourceDirectory,
      "acquisition-manifest.json")), "acquisition-manifest.json");
    if (!plain(manifest) || manifest.schema !== KGB0_FAILURE_SOURCE_SCHEMA
      || manifest.frozenAt !== KGB0_FAILURE_FROZEN_AT
      || manifest.datasetId !== KGB0_FAILURE_ID
      || manifest.revision !== KGB0_FAILURE_REVISION
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 4
      || !Array.isArray(manifest.videoInventory)
      || !Array.isArray(manifest.sourceFiles) || !HASH.test(manifest.sourceRoot ?? "")
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_SHAPE_INVALID");
    for (const descriptor of manifest.apiSnapshots) {
      if (!plain(descriptor) || !safeRemotePath(descriptor.file)
        || !HASH.test(descriptor.sha256 ?? "")
        || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1
        || !permittedUrl(descriptor.requestUrl) || !permittedUrl(descriptor.finalUrl)
        || descriptor.status !== 200) fail("SNAPSHOT_DESCRIPTOR_INVALID");
      readSnapshot(sourceDirectory, descriptor);
    }
    const before = snapshotsFor(sourceDirectory, manifest.apiSnapshots, "before");
    const after = snapshotsFor(sourceDirectory, manifest.apiSnapshots, "after");
    compareSnapshots(before, after);
    const joined = validateRecordTree(before.record, before.tree);
    verifyRemoteObjects(sourceDirectory, manifest, joined.tree);
    if (!same(manifest.videoInventory, videoInventory(joined.tree))) {
      fail("VIDEO_INVENTORY_INVALID");
    }
    const rooted = sourceRootFor(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles)
      || rooted.sourceRoot !== manifest.sourceRoot) fail("SOURCE_ROOT_INVALID");
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"]
      .sort((left, right) => left.localeCompare(right));
    if (!same(walkRelative(sourceDirectory), expectedFiles)) {
      fail("SOURCE_FILE_CLOSURE_INVALID");
    }
    if (!same(manifest.closure, closureFrom(joined.tree))) fail("CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== sourceManifestHash(body)) fail("MANIFEST_HASH_INVALID");
    return { ok: true, manifest, before, after, tree: joined.tree,
      verificationLevel: "PINNED_COMPLETE_403_FILE_NO_VIDEO_GROUP_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, os, re, sys, zipfile
import pyarrow.parquet as pq

root = sys.argv[1]

def die(code, detail=""):
    raise RuntimeError("KGB0_FAILURE_PY_" + code + ((":" + detail) if detail else ""))

def obj(rel):
    return os.path.join(root, "objects", *rel.split("/"))

def read_json(rel):
    with open(obj(rel), "r", encoding="utf-8") as handle:
        return json.load(handle)

def read_jsonl(rel):
    rows = []
    with open(obj(rel), "r", encoding="utf-8") as handle:
        for line_no, line in enumerate(handle, 1):
            if line.strip():
                try: rows.append(json.loads(line))
                except Exception as exc: die("JSONL", rel + ":" + str(line_no) + ":" + str(exc))
    return rows

def schema_projection(table):
    return [{"name": field.name, "type": str(field.type), "nullable": field.nullable}
            for field in table.schema]

def counter_json(values):
    count = collections.Counter(values)
    return {str(key): count[key] for key in sorted(count, key=lambda item: str(item))}

def vector_accumulator(dimensions):
    return {"dimensions": dimensions, "count": 0,
            "minimum": [float("inf")] * dimensions,
            "maximum": [float("-inf")] * dimensions,
            "sum": [0.0] * dimensions}

def add_vectors(aggregate, rows, label):
    if any(len(row) != aggregate["dimensions"] for row in rows): die("VECTOR_SHAPE", label)
    for row in rows:
        for index, raw in enumerate(row):
            value = float(raw)
            if not math.isfinite(value): die("VECTOR_NONFINITE", label)
            aggregate["minimum"][index] = min(aggregate["minimum"][index], value)
            aggregate["maximum"][index] = max(aggregate["maximum"][index], value)
            aggregate["sum"][index] += value
        aggregate["count"] += 1

def finish_vectors(aggregate):
    return {"dimensions": aggregate["dimensions"], "count": aggregate["count"],
            "minimum": aggregate["minimum"], "maximum": aggregate["maximum"],
            "mean": [value / aggregate["count"] for value in aggregate["sum"]]}

info = read_json("meta/info.json")
episodes_meta = read_jsonl("meta/episodes.jsonl")
stats_meta = read_jsonl("meta/episodes_stats.jsonl")
tasks_meta = read_jsonl("meta/tasks.jsonl")
failure_map = read_jsonl("meta/failure_episode_map.jsonl")
failure_episodes = read_jsonl("meta/failure_episodes.jsonl")
failure_labels = read_jsonl("meta/failure_labels.jsonl")
label_mappings = read_json("meta/failure_label_mappings.json")
embeddings = read_jsonl("meta/embeddings.jsonl")
embedding_summary = read_json("meta/embeddings_summary.json")
missing_embeddings = read_jsonl("meta/missing_embeddings.jsonl")
build_report = read_json("build_report.json")
one_step_report = read_json("one_step_report.json")

if info.get("total_episodes") != 194 or info.get("total_frames") != 69416 \
   or info.get("total_tasks") != 14 or info.get("total_videos") != 388 \
   or info.get("fps") != 30 or info.get("robot_type") != "Unitree_G1_Inspire":
    die("INFO_PROFILE")
if [row.get("episode_index") for row in episodes_meta] != list(range(194)) \
   or [row.get("episode_index") for row in stats_meta] != list(range(194)) \
   or [row.get("episode_index") for row in failure_map] != list(range(194)) \
   or [row.get("episode_index") for row in failure_episodes] != list(range(194)) \
   or [row.get("episode_index") for row in embeddings] != list(range(194)):
    die("META_EPISODE_INDICES")
if len(tasks_meta) != 14 or len(failure_labels) != 228 or len(missing_embeddings) != 0:
    die("META_COUNTS")
if any(sorted(row.get("stats", {}).keys()) != sorted(info["features"].keys())
       for row in stats_meta): die("STATS_FEATURE_DRIFT")

tasks_by_index = {row["task_index"]: row["task"] for row in tasks_meta}
if sorted(tasks_by_index) != list(range(14)): die("TASK_INDICES")
labels_by_episode = collections.defaultdict(list)
for label in failure_labels:
    labels_by_episode[label["episode_index"]].append(label)
    for name, mapping_name in [("failure", "failure_type_to_id"),
                               ("sub_task", "sub_task_type_to_id"),
                               ("hand", "hand_type_to_id")]:
        if label[name + "_type_id"] != label_mappings[mapping_name][label[name + "_type"]]:
            die("LABEL_MAPPING", str(label.get("label_id")))

if build_report.get("num_failure_episodes") != 194 \
   or build_report.get("num_label_intervals") != 228 \
   or build_report.get("total_frames") != 69416 \
   or build_report.get("failure_labeled_frames_after_rewrite") != 20963 \
   or build_report.get("max_active_labels_per_frame") != 2 \
   or build_report.get("copied_video_files") != 388 \
   or build_report.get("missing_video_files") != []:
    die("BUILD_REPORT")
if one_step_report.get("build_report") != build_report \
   or one_step_report.get("upload_report", {}).get("uploaded") is not True:
    die("ONE_STEP_REPORT")
if embedding_summary.get("copied_embedding_files") != 194 \
   or embedding_summary.get("missing_embedding_files") != 0 \
   or embedding_summary.get("embedding_total_bytes") != 142678424:
    die("EMBEDDING_SUMMARY")

expected_parquet_fields = [name for name, feature in info["features"].items()
                           if feature.get("dtype") != "video"]
tactile_fields = [name for name in expected_parquet_fields
                  if name.startswith("observation.tactiles.")]
if len(expected_parquet_fields) != 58 or len(tactile_fields) != 34:
    die("EXPECTED_FIELDS")

schemas = []
episodes = []
state_aggregate = vector_accumulator(26)
action_aggregate = vector_accumulator(26)
contact_counts = {name: collections.Counter() for name in expected_parquet_fields
                  if name.startswith("observation.contact.")}
language_token_min = None
language_token_max = None
attention_counts = collections.Counter()
tactile_bytes = collections.Counter()
tactile_rows = collections.Counter()
failure_type_frames = collections.Counter()
sub_task_frames = collections.Counter()
hand_frames = collections.Counter()
end_resolution_counts = collections.Counter(label["end_resolution"] for label in failure_labels)
task_episode_counts = collections.Counter()
global_cursor = 0
failure_frames_total = 0
max_active_observed = 0
episodes_with_overlap = 0
episodes_with_multiple_labels = 0
episodes_with_post_label_frames = 0
episodes_with_pre_label_frames = 0
original_index_missing = 0
png_signature = b"\x89PNG\r\n\x1a\n"

for episode_index in range(194):
    rel = "data/chunk-000/episode_%06d.parquet" % episode_index
    table = pq.read_table(obj(rel))
    schemas.append(schema_projection(table))
    if table.column_names != expected_parquet_fields:
        die("PARQUET_FIELDS", rel)
    if any(table[name].null_count != 0 for name in table.column_names):
        die("PARQUET_NULL", rel)
    rows = table.num_rows
    episode_meta = episodes_meta[episode_index]
    map_meta = failure_map[episode_index]
    failure_meta = failure_episodes[episode_index]
    embedding_meta = embeddings[episode_index]
    labels = sorted(labels_by_episode[episode_index], key=lambda row: row["label_id"])
    if episode_meta.get("length") != rows \
       or map_meta.get("length") != rows \
       or failure_meta.get("length") != rows \
       or episode_meta.get("tasks") != map_meta.get("tasks") \
       or episode_meta.get("tasks") != failure_meta.get("tasks") \
       or failure_meta.get("num_labels") != len(labels) \
       or sorted(failure_meta.get("labels", []), key=lambda row: row["label_id"]) != labels \
       or embedding_meta.get("expected_num_steps") != rows:
        die("META_PARQUET_CROSSWALK", rel)
    original_episode = map_meta.get("original_episode_index")
    if failure_meta.get("original_episode_index") != original_episode \
       or embedding_meta.get("original_episode_index") != original_episode:
        die("ORIGINAL_EPISODE_CROSSWALK", rel)
    frame_index = table["frame_index"].to_pylist()
    episode_values = table["episode_index"].to_pylist()
    global_index = table["index"].to_pylist()
    timestamps = table["timestamp"].to_pylist()
    task_indices = table["task_index"].to_pylist()
    if frame_index != list(range(rows)) or episode_values != [episode_index] * rows \
       or global_index != list(range(global_cursor, global_cursor + rows)) \
       or any(abs(float(value) - index / 30.0) > 0.00001
              for index, value in enumerate(timestamps)) \
       or len(set(task_indices)) != 1:
        die("PARQUET_INDICES", rel)
    task_index = int(task_indices[0])
    task = tasks_by_index.get(task_index)
    if task is None or episode_meta.get("tasks") != [task]: die("TASK_CROSSWALK", rel)
    task_episode_counts[task] += 1

    active = [[] for _ in range(rows)]
    for label in labels:
        start = label["start_frame"]
        end = label["end_frame_exclusive"]
        if not (0 <= start < end <= rows) \
           or label["end_frame_inclusive"] != end - 1 \
           or label["num_failure_frames"] != end - start \
           or label["episode_length_frames"] != rows \
           or label["episode_index"] != episode_index \
           or label["original_episode_index"] != original_episode \
           or label["episode_task"] != task:
            die("LABEL_INTERVAL", str(label.get("label_id")))
        for frame in range(start, end): active[frame].append(label)
    expected_is_failure = [int(bool(items)) for items in active]
    expected_num_active = [len(items) for items in active]
    observed_is_failure = table["annotation.failure.is_failure"].to_pylist()
    observed_num_active = table["annotation.failure.num_active_labels"].to_pylist()
    if observed_is_failure != expected_is_failure \
       or observed_num_active != expected_num_active \
       or table["annotation.failure.episode_has_failure"].to_pylist() != [1] * rows \
       or table["annotation.failure.original_episode_index"].to_pylist() != [original_episode] * rows:
        die("FRAME_LABEL_REPLAY", rel)
    primary_fields = {
      "annotation.failure.primary_label_id": "label_id",
      "annotation.failure.failure_type_id": "failure_type_id",
      "annotation.failure.sub_task_type_id": "sub_task_type_id",
      "annotation.failure.hand_type_id": "hand_type_id",
    }
    for column, key in primary_fields.items():
        expected = []
        for items in active:
            if not items: expected.append(-1)
            else:
                primary = max(items, key=lambda row: (row["start_frame"], row["source_row_index"]))
                expected.append(primary[key])
        if table[column].to_pylist() != expected: die("PRIMARY_LABEL_RULE", column + ":" + rel)
    for frame, items in enumerate(active):
        if items:
            primary = max(items, key=lambda row: (row["start_frame"], row["source_row_index"]))
            failure_type_frames[primary["failure_type"]] += 1
            sub_task_frames[primary["sub_task_type"]] += 1
            hand_frames[primary["hand_type"]] += 1
    failure_frames = sum(expected_is_failure)
    failure_frames_total += failure_frames
    local_max = max(expected_num_active)
    max_active_observed = max(max_active_observed, local_max)
    episodes_with_overlap += int(local_max > 1)
    episodes_with_multiple_labels += int(len(labels) > 1)
    first_start = min(label["start_frame"] for label in labels)
    last_end = max(label["end_frame_exclusive"] for label in labels)
    episodes_with_pre_label_frames += int(first_start > 0)
    episodes_with_post_label_frames += int(last_end < rows)

    add_vectors(state_aggregate, table["observation.state"].to_pylist(), rel + ":state")
    add_vectors(action_aggregate, table["action"].to_pylist(), rel + ":action")
    language = table["observation.language.tokens"].to_pylist()
    attention = table["observation.language.attention_mask"].to_pylist()
    if any(len(row) != 48 for row in language + attention): die("LANGUAGE_SHAPE", rel)
    token_values = [int(value) for row in language for value in row]
    language_token_min = min(token_values) if language_token_min is None else min(language_token_min, min(token_values))
    language_token_max = max(token_values) if language_token_max is None else max(language_token_max, max(token_values))
    attention_counts.update(int(value) for row in attention for value in row)
    if any(value not in (0, 1) for row in attention for value in row): die("ATTENTION_VALUE", rel)
    for name in contact_counts:
        contact_counts[name].update(table[name].to_pylist())
    original_index_values = table["annotation.failure.original_index"].to_pylist()
    original_index_missing += sum(value == -1 for value in original_index_values)
    for name in tactile_fields:
        array = table[name].combine_chunks()
        byte_values = array.field("bytes").to_pylist()
        path_values = array.field("path").to_pylist()
        if len(byte_values) != rows or len(path_values) != rows \
           or any(value is None or not value.startswith(png_signature) for value in byte_values) \
           or path_values != ["frame_%06d.png" % frame for frame in range(rows)]:
            die("TACTILE_CONTAINER", name + ":" + rel)
        tactile_rows[name] += rows
        tactile_bytes[name] += sum(len(value) for value in byte_values)

    episodes.append({"episodeIndex": episode_index,
                     "originalEpisodeIndex": original_episode,
                     "frames": rows, "taskIndex": task_index, "task": task,
                     "labelIntervals": len(labels), "failureLabeledFrames": failure_frames,
                     "firstFailureFrame": first_start,
                     "lastFailureEndExclusive": last_end,
                     "preLabelFrames": first_start, "postLabelFrames": rows - last_end,
                     "maxActiveLabels": local_max,
                     "parquetByteHash": "sha256:" + hashlib.sha256(open(obj(rel), "rb").read()).hexdigest()})
    global_cursor += rows

if any(schema != schemas[0] for schema in schemas): die("PARQUET_SCHEMA_DRIFT")
if global_cursor != 69416 or failure_frames_total != 20963 or max_active_observed != 2:
    die("REPLAY_COUNTS")

embedding_paths = []
embedding_zip_entries = 0
embedding_pickle_members = 0
embedding_storage_members = 0
embedding_bytes = 0
for row in embeddings:
    rel = row["embedding_path"]
    file = obj(rel)
    with open(file, "rb") as handle: raw = handle.read()
    digest_hex = hashlib.sha256(raw).hexdigest()
    if len(raw) != row.get("copied_size_bytes") \
       or digest_hex != row.get("copied_sha256") \
       or digest_hex != row.get("source_sha256") \
       or row.get("source_size_bytes") != len(raw) \
       or row.get("episode_field") != row.get("original_episode_index") \
       or row.get("num_steps_field") != row.get("expected_num_steps") \
       or row.get("steps_length") != row.get("expected_num_steps") \
       or row.get("steps_min") != 0 \
       or row.get("steps_max") != row.get("expected_num_steps") - 1 \
       or row.get("steps_unique_count") != row.get("expected_num_steps") \
       or row.get("steps_contiguous_zero_based") is not True \
       or row.get("tensor_shape") != [row.get("expected_num_steps"), 1, 512] \
       or row.get("tensor_dtype") != "torch.float32" \
       or row.get("nan_count") != 0 or row.get("inf_count") != 0 \
       or row.get("warnings") != [] or row.get("errors") != []:
        die("EMBEDDING_CROSSWALK", rel)
    if not zipfile.is_zipfile(file): die("EMBEDDING_CONTAINER", rel)
    with zipfile.ZipFile(file, "r") as archive:
        members = archive.infolist()
        embedding_zip_entries += len(members)
        embedding_pickle_members += sum(item.filename.endswith(".pkl") for item in members)
        embedding_storage_members += sum("/data/" in item.filename for item in members)
    embedding_paths.append(rel)
    embedding_bytes += len(raw)
if len(set(embedding_paths)) != 194 or embedding_bytes != 142678424:
    die("EMBEDDING_CENSUS")

notes = [label.get("note") for label in failure_labels if label.get("note") not in (None, "")]
aux_notes = [label.get("aux_note_2") for label in failure_labels if label.get("aux_note_2") not in (None, "")]

print(json.dumps({
  "info": {"codebaseVersion": info["codebase_version"],
           "robotType": info["robot_type"], "totalEpisodes": info["total_episodes"],
           "totalFrames": info["total_frames"], "totalTasks": info["total_tasks"],
           "totalVideos": info["total_videos"], "fps": info["fps"],
           "featureNames": sorted(info["features"].keys())},
  "metadata": {"episodeRows": len(episodes_meta), "statsRows": len(stats_meta),
               "taskRows": len(tasks_meta), "failureMapRows": len(failure_map),
               "failureEpisodeRows": len(failure_episodes),
               "failureLabelRows": len(failure_labels),
               "embeddingRows": len(embeddings), "missingEmbeddingRows": 0,
               "tasks": tasks_meta},
  "parquet": {"files": 194, "frames": global_cursor, "columns": len(schemas[0]),
              "schema": schemas[0], "episodes": episodes,
              "state": finish_vectors(state_aggregate),
              "action": finish_vectors(action_aggregate),
              "taskEpisodeCounts": counter_json(task_episode_counts),
              "contactValueCounts": {name: counter_json(values)
                                     for name, values in contact_counts.items()},
              "language": {"dimensions": 48, "tokenMinimum": language_token_min,
                           "tokenMaximum": language_token_max,
                           "attentionValueCounts": counter_json(attention_counts)},
              "tactilePng": {"features": len(tactile_fields),
                             "rowsPerFeature": {name: tactile_rows[name]
                                                for name in sorted(tactile_rows)},
                             "encodedBytesPerFeature": {name: tactile_bytes[name]
                                                        for name in sorted(tactile_bytes)},
                             "encodedBytes": sum(tactile_bytes.values()),
                             "pixelsDecoded": False},
              "originalIndexMissingRows": original_index_missing},
  "annotations": {"intervals": len(failure_labels),
                  "failureLabeledFrames": failure_frames_total,
                  "maxActiveLabels": max_active_observed,
                  "episodesWithOverlap": episodes_with_overlap,
                  "episodesWithMultipleLabels": episodes_with_multiple_labels,
                  "episodesWithPreLabelFrames": episodes_with_pre_label_frames,
                  "episodesWithPostLabelFrames": episodes_with_post_label_frames,
                  "failureTypeIntervalCounts": build_report["failure_type_label_counts"],
                  "taskIntervalCounts": build_report["task_label_counts"],
                  "failureTypePrimaryFrameCounts": counter_json(failure_type_frames),
                  "subTaskPrimaryFrameCounts": counter_json(sub_task_frames),
                  "handPrimaryFrameCounts": counter_json(hand_frames),
                  "endResolutionCounts": counter_json(end_resolution_counts),
                  "nonemptyNoteRows": len(notes), "nonemptyAuxNoteRows": len(aux_notes),
                  "rawNotesRepublished": False,
                  "frameIntervalsExactlyReplayed": True,
                  "primaryLabelRuleExactlyReplayed": True},
  "embeddings": {"files": len(embedding_paths), "bytes": embedding_bytes,
                 "metadataCrosswalkRows": len(embeddings),
                 "allCopiedHashesMatch": True, "allStepCountsMatchEpisodes": True,
                 "zipArchives": len(embedding_paths),
                 "zipEntries": embedding_zip_entries,
                 "pickleMembersPresent": embedding_pickle_members,
                 "tensorStorageMembersPresent": embedding_storage_members,
                 "ptPayloadsDeserialized": 0, "picklePayloadsExecuted": 0,
                 "publisherTensorMetadataOnly": True},
  "reports": {"buildReportExactCountsReplayed": True,
              "oneStepReportCrosswalkExact": True,
              "publisherUploadedClaim": one_step_report["upload_report"]["uploaded"],
              "absoluteWindowsPathsPresent": True},
}, sort_keys=True, separators=(",", ":"), allow_nan=False))
`;

export function runKgb0FailureReplay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const executed = spawnSync(python, ["-c", PYTHON_REPLAY,
    path.resolve(sourceDirectory)], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (executed.error) fail("PYTHON_EXEC_FAILED", executed.error.message);
  if (executed.status !== 0) fail("PYTHON_REPLAY_FAILED",
    String(executed.stderr || executed.stdout).trim());
  const replay = parseJson(Buffer.from(executed.stdout, "utf8"), "python-replay");
  if (!plain(replay) || replay.info?.totalEpisodes !== 194
    || replay.parquet?.files !== 194 || replay.parquet?.frames !== 69_416
    || replay.annotations?.intervals !== 228
    || replay.annotations?.failureLabeledFrames !== 20_963
    || replay.embeddings?.files !== 194
    || replay.embeddings?.ptPayloadsDeserialized !== 0) {
    fail("PYTHON_RESULT_INVALID");
  }
  return replay;
}

function sourceObject(sourceDirectory, remotePath) {
  return safeJoin(sourceDirectory, `objects/${remotePath}`);
}

function readmeProjection(sourceDirectory) {
  const text = readRegular(sourceObject(sourceDirectory, "README.md")).toString("utf8");
  const claims = {
    apache2YamlClaim: /^license:\s*apache-2\.0\s*$/mu.test(text),
    failureOnlyClaim: /failure-only, frame-labeled subset/iu.test(text),
    derivedSourceClaim: /derived from `KGB0\/pick_and_place_annotation_image`/u.test(text),
    completeFailureEpisodeClaim: /keeps complete episodes that contain at least one failure label/iu
      .test(text),
    frameAnnotationColumnsClaim: /adds frame-level failure annotation columns/iu.test(text),
    recoveryExperimentsClaim: /recovery experiments/iu.test(text),
    sourceDatasetNamed: /Source dataset: `KGB0\/pick_and_place_annotation_image`/u.test(text),
  };
  if (!Object.values(claims).every(Boolean)) fail("README_CLAIMS_DRIFT");
  return claims;
}

function artifactBody(verified, replay, readme) {
  return {
    schema: KGB0_FAILURE_ARTIFACT_SCHEMA,
    frozenAt: KGB0_FAILURE_FROZEN_AT,
    status: "PINNED_COMPLETE_NO_VIDEO_FAILURE_LABEL_GROUP_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: { datasetId: KGB0_FAILURE_ID, revision: KGB0_FAILURE_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure },
    replay,
    selectionSemantics: {
      completePublishedNoVideoGroup: true,
      all194PublishedFailureSubsetEpisodesPresent: true,
      all194MatchingEmbeddingSidecarsPresent: true,
      allMetadataAndRootReportsPresent: true,
      all388VideosTreeInventoried: true,
      videoBytesExcludedByMediaClass: true,
      selectionSizeUnder300Mb: true,
      randomEpisodeTruncation: false,
      taskGroupTruncation: false,
      publisherFailureOnlySelectionBias: true,
      successfulSourcePopulationInClosure: false,
      completeSourceDatasetAttemptCensus: false,
    },
    labelSemantics: {
      sourceNativeFrameAnnotationColumnsPresent: true,
      annotationIntervalsExactlyReplayed: true,
      publisherLabelsAreIndependentTaskOutcomes: false,
      episodeFailureMembershipIsIndependentOutcome: false,
      terminalTaskSuccessFieldPresent: false,
      terminalTaskFailureFieldPresent: false,
      recoveryOutcomeFieldPresent: false,
      postLabelFramesAreRecoveryExecutions: false,
      recoveryTagEstablishesRecovery: false,
      originalSourceDatasetByteCrosswalkEstablished: false,
      directOutcomeEstablished: false,
      recoveryEstablished: false,
    },
    embeddingSafety: {
      allPtBytesAcquiredAndHashCrosswalked: true,
      zipCentralDirectoriesInspected: true,
      publisherTensorMetadataReplayedAsClaims: true,
      ptPayloadsDeserialized: 0,
      picklePayloadsExecuted: 0,
      tensorValuesIndependentlyRecomputed: false,
    },
    provenance: {
      publisherRobotTypeClaim: "Unitree_G1_Inspire",
      realRobotExecutionEstablished: false,
      simulationExecutionEstablished: false,
      independentPhysicalOutcomeEstablished: false,
      externalEffectReceiptPresent: false,
    },
    rights: {
      datasetCardLicenseClaim: "Apache-2.0",
      readmeYamlLicenseClaim: "Apache-2.0",
      repositoryLicenseFilePresent: false,
      productionTrainingAuthorized: false,
      rightsFinallyAdjudicatedForTraining: false,
      evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    },
    privacy: {
      rawArtifactPrivate: true,
      publisherAnnotationNotesPresent: replay.annotations.nonemptyNoteRows > 0
        || replay.annotations.nonemptyAuxNoteRows > 0,
      rawAnnotationNotesRepublishedInReport: false,
      absoluteWindowsPathsPresent: true,
      tactilePngBytesPresent: true,
      tactilePixelsDecoded: false,
      videoBytesAcquired: false,
      videoPixelsInspectedForPeopleOrPii: false,
      privacyReviewComplete: false,
      noPiiEstablished: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    publisherClaims: readme,
    boundary: { privacy: 0, training: 0, network: 0, authority: 0,
      CEU: 0, action: 0, delegation: 0, reliableOutcome: 0,
      independentOutcome: 0, recovery: 0, externalEffect: 0 },
  };
}

export function kgb0FailureArtifactHash(body) {
  return digest("outsider/kgb0-pick-place-failure-labeling/v1", body);
}

export function buildKgb0FailureArtifactFromSource(sourceDirectory, options = {}) {
  const verified = verifyKgb0FailureSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runKgb0FailureReplay(sourceDirectory, options);
  const body = artifactBody(verified, replay, readmeProjection(sourceDirectory));
  const artifact = { ...body, artifactHash: kgb0FailureArtifactHash(body) };
  const checked = verifyKgb0FailureArtifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifyKgb0FailureArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== KGB0_FAILURE_ARTIFACT_SCHEMA
      || artifact.frozenAt !== KGB0_FAILURE_FROZEN_AT
      || artifact.status !== "PINNED_COMPLETE_NO_VIDEO_FAILURE_LABEL_GROUP_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== kgb0FailureArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    const closure = artifact.source?.closure;
    if (closure?.completePublishedNoVideoGroup !== true
      || closure?.selectedObjects !== 403 || closure?.selectedBytes !== 236_435_951
      || closure?.parquetFiles !== 194 || closure?.embeddingFiles !== 194
      || closure?.videosInventoried !== 388 || closure?.videoBytesAcquired !== 0
      || closure?.licenseFilesPresent !== 0) fail("ARTIFACT_SOURCE_INVALID");
    if (artifact.replay?.info?.totalEpisodes !== 194
      || artifact.replay?.parquet?.files !== 194
      || artifact.replay?.parquet?.frames !== 69_416
      || artifact.replay?.annotations?.intervals !== 228
      || artifact.replay?.annotations?.failureLabeledFrames !== 20_963
      || artifact.replay?.annotations?.frameIntervalsExactlyReplayed !== true
      || artifact.replay?.embeddings?.files !== 194
      || artifact.replay?.embeddings?.ptPayloadsDeserialized !== 0
      || artifact.replay?.embeddings?.picklePayloadsExecuted !== 0) {
      fail("ARTIFACT_REPLAY_INVALID");
    }
    const selection = artifact.selectionSemantics;
    if (!plain(selection) || selection.completePublishedNoVideoGroup !== true
      || selection.randomEpisodeTruncation !== false
      || selection.taskGroupTruncation !== false
      || selection.publisherFailureOnlySelectionBias !== true
      || selection.successfulSourcePopulationInClosure !== false
      || selection.completeSourceDatasetAttemptCensus !== false) {
      fail("ARTIFACT_SELECTION_INVALID");
    }
    const labels = artifact.labelSemantics;
    if (!plain(labels) || labels.publisherLabelsAreIndependentTaskOutcomes !== false
      || labels.episodeFailureMembershipIsIndependentOutcome !== false
      || labels.terminalTaskSuccessFieldPresent !== false
      || labels.terminalTaskFailureFieldPresent !== false
      || labels.recoveryOutcomeFieldPresent !== false
      || labels.postLabelFramesAreRecoveryExecutions !== false
      || labels.recoveryTagEstablishesRecovery !== false
      || labels.directOutcomeEstablished !== false
      || labels.recoveryEstablished !== false) fail("ARTIFACT_LABEL_PROMOTION");
    if (artifact.embeddingSafety?.ptPayloadsDeserialized !== 0
      || artifact.embeddingSafety?.picklePayloadsExecuted !== 0
      || artifact.embeddingSafety?.tensorValuesIndependentlyRecomputed !== false) {
      fail("ARTIFACT_EMBEDDING_EXECUTION");
    }
    if (artifact.provenance?.realRobotExecutionEstablished !== false
      || artifact.provenance?.simulationExecutionEstablished !== false
      || artifact.provenance?.independentPhysicalOutcomeEstablished !== false
      || artifact.provenance?.externalEffectReceiptPresent !== false) {
      fail("ARTIFACT_PROVENANCE_INVALID");
    }
    if (artifact.rights?.datasetCardLicenseClaim !== "Apache-2.0"
      || artifact.rights?.repositoryLicenseFilePresent !== false
      || artifact.rights?.productionTrainingAuthorized !== false
      || artifact.rights?.rightsFinallyAdjudicatedForTraining !== false) {
      fail("ARTIFACT_RIGHTS_INVALID");
    }
    if (artifact.privacy?.rawArtifactPrivate !== true
      || artifact.privacy?.rawAnnotationNotesRepublishedInReport !== false
      || artifact.privacy?.tactilePixelsDecoded !== false
      || artifact.privacy?.videoBytesAcquired !== false
      || artifact.privacy?.privacyReviewComplete !== false
      || artifact.privacy?.noPiiEstablished !== false) fail("ARTIFACT_PRIVACY_INVALID");
    if (!same(artifact.boundary, { privacy: 0, training: 0, network: 0,
      authority: 0, CEU: 0, action: 0, delegation: 0, reliableOutcome: 0,
      independentOutcome: 0, recovery: 0, externalEffect: 0 })) {
      fail("ARTIFACT_BOUNDARY_INVALID");
    }
    return { ok: true, artifactHash,
      verificationLevel: "STANDALONE_HASH_AND_PUBLISHER_LABEL_BOUNDARY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyKgb0FailureArtifactWithSource(artifact, sourceDirectory,
  options = {}) {
  const standalone = verifyKgb0FailureArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildKgb0FailureArtifactFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel:
        "FULL_194_PARQUET_194_PT_METADATA_AND_388_VIDEO_INVENTORY_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
