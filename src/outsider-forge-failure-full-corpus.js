/*
 * Complete fixed-revision intake for angledusgar/forge-failure-v1.
 * All 53 episode Parquets, all 106 MP4 sidecars and all metadata are acquired.
 * Parquets are fully replayed and MP4 ISO-BMFF sample tables are parsed without
 * decoding or displaying pixels.  Repository membership and README wording are
 * publisher failure labels, not independent outcomes or an attempt census.
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

export const FORGE_FAILURE_ID = "angledusgar/forge-failure-v1";
export const FORGE_FAILURE_REVISION =
  "820392e1167df4d6f5d60f985ec4f3b1b4fd6237";
export const FORGE_FAILURE_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const FORGE_FAILURE_SOURCE_SCHEMA =
  "outsider/forge-failure-full-corpus-source/v1";
export const FORGE_FAILURE_ARTIFACT_SCHEMA =
  "outsider/forge-failure-full-corpus/v1";
export const FORGE_FAILURE_PROFILE = Object.freeze({
  usedStorage: 40_140_940,
  treeEntries: 172,
  treeDirectories: 7,
  treeFiles: 165,
  treeBytes: 40_313_106,
  parquetFiles: 53,
  videoFiles: 106,
  metadataFiles: 4,
  repositoryEpisodeFiles: 53,
  readmeClaimedEpisodes: 51,
  readmeClaimedFrames: 13_899,
  fps: 15,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_API_BYTES = 8 * 1024 * 1024;
const MAX_OBJECT_BYTES = 16 * 1024 * 1024;
const FETCH_ATTEMPTS = 4;
const FETCH_CONCURRENCY = 8;

function fail(code, detail = null) {
  throw new Error(detail === null ? `FORGE_FAILURE_${code}`
    : `FORGE_FAILURE_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function forgeFailureSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return forgeFailureSha256(Buffer.from(
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
  const encoded = FORGE_FAILURE_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${FORGE_FAILURE_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${FORGE_FAILURE_REVISION}`
      + "?recursive=true&expand=false&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${FORGE_FAILURE_REVISION}`,
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
    || projected.id !== FORGE_FAILURE_ID || projected.sha !== FORGE_FAILURE_REVISION
    || projected.private !== false || projected.gated !== false
    || projected.disabled !== false
    || projected.usedStorage !== FORGE_FAILURE_PROFILE.usedStorage
    || projected.cardLicense !== "apache-2.0"
    || siblingPaths.length !== FORGE_FAILURE_PROFILE.treeFiles) {
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

function projectTree(value) {
  if (!Array.isArray(value)) fail("TREE_INVALID");
  const projection = value.map(treeEntry)
    .sort((left, right) => left.path.localeCompare(right.path));
  const files = projection.filter((entry) => entry.type === "file");
  const directories = projection.filter((entry) => entry.type === "directory");
  const bytes = files.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const parquet = files.filter((entry) => entry.path.endsWith(".parquet"));
  const videos = files.filter((entry) => entry.path.endsWith(".mp4"));
  const metadata = files.filter((entry) => entry.path.startsWith("meta/"));
  const licensePaths = files.filter((entry) =>
    /(?:^|\/)(?:licen[cs]e|copying|notice)(?:\.|$)/iu.test(entry.path));
  if (new Set(projection.map((entry) => entry.path)).size !== projection.length
    || projection.length !== FORGE_FAILURE_PROFILE.treeEntries
    || files.length !== FORGE_FAILURE_PROFILE.treeFiles
    || directories.length !== FORGE_FAILURE_PROFILE.treeDirectories
    || bytes !== FORGE_FAILURE_PROFILE.treeBytes
    || parquet.length !== FORGE_FAILURE_PROFILE.parquetFiles
    || videos.length !== FORGE_FAILURE_PROFILE.videoFiles
    || metadata.length !== FORGE_FAILURE_PROFILE.metadataFiles
    || licensePaths.length !== 0) fail("TREE_PROFILE_INVALID");
  return { projection, files, directories, parquet, videos, metadata,
    licensePaths, bytes,
    treeHash: digest("outsider/forge-failure-tree/v1", projection) };
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
    sha256: forgeFailureSha256(fetched.bytes) };
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
  if (forgeFailureSha256(bytes) !== descriptor.sha256) {
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
  const sha256 = forgeFailureSha256(bytes);
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
  return { schema: "outsider/forge-failure-full-checkpoint/v1",
    id: FORGE_FAILURE_ID, revision: FORGE_FAILURE_REVISION };
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
    sourceRoot: digest("outsider/forge-failure-source-root/v1", files) };
}

function closureFrom(tree) {
  const parquetBytes = tree.parquet.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const videoBytes = tree.videos.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const metadataBytes = tree.metadata.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  return { fullFixedRepository: true, selectedObjects: tree.files.length,
    selectedBytes: tree.bytes, recursiveTreeEntries: tree.projection.length,
    recursiveTreeDirectories: tree.directories.length,
    recursiveTreeFiles: tree.files.length,
    recursiveTreeHash: tree.treeHash,
    recursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreePagesPerPhase: 1,
    parquetFiles: tree.parquet.length, parquetBytes,
    videoFiles: tree.videos.length, videoBytes,
    metadataFiles: tree.metadata.length, metadataBytes,
    licenseFilesPresent: tree.licensePaths.length,
    completePublishedEpisodeFileCensus: true,
    completePublishedVideoFileCensus: true,
    globallyExhaustive: false };
}

function sourceManifestHash(body) {
  return digest("outsider/forge-failure-source-manifest/v1", body);
}

export async function acquirePinnedForgeFailureSource(sourceDirectory,
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
    await mapConcurrent(joined.tree.files, FETCH_CONCURRENCY, async (entry) => {
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
    if (state.remoteObjects.length !== FORGE_FAILURE_PROFILE.treeFiles) {
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
    const body = { schema: FORGE_FAILURE_SOURCE_SCHEMA,
      frozenAt: FORGE_FAILURE_FROZEN_AT,
      datasetId: FORGE_FAILURE_ID, revision: FORGE_FAILURE_REVISION,
      apiSnapshots, remoteObjects: state.remoteObjects,
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
    try { enforcePrivateTree(checkpoint); } catch { /* preserve primary failure */ }
    throw error;
  }
}

function verifyRemoteObjects(root, manifest, tree) {
  if (!Array.isArray(manifest.remoteObjects)
    || manifest.remoteObjects.length !== tree.files.length
    || !same(manifest.remoteObjects.map((entry) => entry.path).sort(),
      tree.files.map((entry) => entry.path).sort())) fail("REMOTE_OBJECT_SET_INVALID");
  for (const descriptor of manifest.remoteObjects) {
    const entry = tree.files.find((item) => item.path === descriptor.path);
    if (!entry || descriptor.file !== objectRelative(entry)
      || descriptor.bytes !== entry.sizeBytes || descriptor.gitOid !== entry.oid
      || descriptor.lfsSha256 !== entry.lfsSha256
      || !HASH.test(descriptor.sha256 ?? "") || descriptor.status !== 200
      || !permittedUrl(descriptor.requestUrl) || !permittedUrl(descriptor.finalUrl)) {
      fail("REMOTE_DESCRIPTOR_INVALID", descriptor.file);
    }
    const bytes = readRegular(safeJoin(root, descriptor.file), descriptor.bytes);
    if (forgeFailureSha256(bytes) !== descriptor.sha256) {
      fail("REMOTE_HASH_INVALID", descriptor.file);
    }
    verifyObjectBytes(bytes, entry);
  }
}

export function verifyForgeFailureSourceDirectory(sourceDirectory) {
  try {
    const stat = lstatSync(sourceDirectory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("SOURCE_DIRECTORY_UNSAFE");
    const manifest = parseJson(readRegular(path.join(sourceDirectory,
      "acquisition-manifest.json")), "acquisition-manifest.json");
    if (!plain(manifest) || manifest.schema !== FORGE_FAILURE_SOURCE_SCHEMA
      || manifest.frozenAt !== FORGE_FAILURE_FROZEN_AT
      || manifest.datasetId !== FORGE_FAILURE_ID
      || manifest.revision !== FORGE_FAILURE_REVISION
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 4
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
      verificationLevel: "PINNED_FULL_165_FILE_FORGE_FAILURE_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYTHON_REPLAY = String.raw`
import hashlib, json, math, os, struct, sys
import pyarrow.parquet as pq

root = sys.argv[1]

def die(code, detail=""):
    raise RuntimeError("FORGE_FAILURE_PY_" + code + ((":" + detail) if detail else ""))

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

def vector_summary(values):
    dims = len(values[0]) if values else 0
    if dims < 1 or any(len(row) != dims for row in values): die("VECTOR_SHAPE")
    columns = [[float(row[i]) for row in values] for i in range(dims)]
    if any(not math.isfinite(value) for col in columns for value in col):
        die("VECTOR_NONFINITE")
    return {"dimensions": dims, "minimum": [min(col) for col in columns],
            "maximum": [max(col) for col in columns],
            "sum": [sum(col) for col in columns], "count": len(values)}

def logical_hash(table):
    digest = hashlib.sha256()
    columns = {name: table[name].to_pylist() for name in table.column_names}
    for i in range(table.num_rows):
        row = {name: columns[name][i] for name in sorted(columns)}
        digest.update(json.dumps(row, sort_keys=True, separators=(",", ":"),
                                 allow_nan=False).encode("utf-8"))
        digest.update(b"\n")
    return "sha256:" + digest.hexdigest()

def boxes(data, start, end):
    offset = start
    out = []
    while offset + 8 <= end:
        size = struct.unpack_from(">I", data, offset)[0]
        typ = data[offset + 4:offset + 8].decode("latin1")
        header = 8
        if size == 1:
            if offset + 16 > end: die("MP4_EXTENDED_BOX")
            size = struct.unpack_from(">Q", data, offset + 8)[0]
            header = 16
        elif size == 0:
            size = end - offset
        if size < header or offset + size > end: die("MP4_BOX", typ)
        out.append((typ, offset + header, offset + size, size))
        offset += size
    if offset != end: die("MP4_TRAILING", str(end - offset))
    return out

def child(data, container, wanted, required=True):
    found = [item for item in boxes(data, container[1], container[2]) if item[0] == wanted]
    if required and len(found) != 1: die("MP4_CHILD", wanted + ":" + str(len(found)))
    return found[0] if found else None

def fullbox_time(data, box):
    version = data[box[1]]
    if version == 0:
        timescale = struct.unpack_from(">I", data, box[1] + 12)[0]
        duration = struct.unpack_from(">I", data, box[1] + 16)[0]
    elif version == 1:
        timescale = struct.unpack_from(">I", data, box[1] + 20)[0]
        duration = struct.unpack_from(">Q", data, box[1] + 24)[0]
    else: die("MP4_FULLBOX_VERSION", str(version))
    return timescale, duration

def parse_mp4(rel):
    with open(obj(rel), "rb") as handle: data = handle.read()
    top = boxes(data, 0, len(data))
    moov = [item for item in top if item[0] == "moov"]
    if len(moov) != 1: die("MP4_MOOV", rel)
    mvhd = child(data, moov[0], "mvhd")
    movie_scale, movie_duration = fullbox_time(data, mvhd)
    tracks = []
    for trak in [item for item in boxes(data, moov[0][1], moov[0][2]) if item[0] == "trak"]:
        tkhd = child(data, trak, "tkhd")
        width = struct.unpack_from(">I", data, tkhd[2] - 8)[0] / 65536.0
        height = struct.unpack_from(">I", data, tkhd[2] - 4)[0] / 65536.0
        mdia = child(data, trak, "mdia")
        mdhd = child(data, mdia, "mdhd")
        scale, duration = fullbox_time(data, mdhd)
        hdlr = child(data, mdia, "hdlr")
        handler = data[hdlr[1] + 8:hdlr[1] + 12].decode("latin1")
        minf = child(data, mdia, "minf")
        stbl = child(data, minf, "stbl")
        stsd = child(data, stbl, "stsd")
        entry_count = struct.unpack_from(">I", data, stsd[1] + 4)[0]
        sample_start = stsd[1] + 8
        codec = data[sample_start + 4:sample_start + 8].decode("latin1")
        sample_width = struct.unpack_from(">H", data, sample_start + 32)[0]
        sample_height = struct.unpack_from(">H", data, sample_start + 34)[0]
        stsz = child(data, stbl, "stsz")
        sample_count = struct.unpack_from(">I", data, stsz[1] + 8)[0]
        stts = child(data, stbl, "stts")
        timing_entries = struct.unpack_from(">I", data, stts[1] + 4)[0]
        timing_samples = 0
        cursor = stts[1] + 8
        for _ in range(timing_entries):
            timing_samples += struct.unpack_from(">I", data, cursor)[0]
            cursor += 8
        tracks.append({"handler": handler, "codec": codec,
                       "sampleDescriptionEntries": entry_count,
                       "sampleCount": sample_count, "timingSampleCount": timing_samples,
                       "timescale": scale, "durationTicks": duration,
                       "durationSeconds": duration / scale,
                       "trackWidth": width, "trackHeight": height,
                       "sampleWidth": sample_width, "sampleHeight": sample_height})
    return {"path": rel, "bytes": len(data),
            "topLevelBoxes": [item[0] for item in top],
            "movieTimescale": movie_scale, "movieDurationTicks": movie_duration,
            "movieDurationSeconds": movie_duration / movie_scale,
            "tracks": tracks}

info = read_json("meta/info.json")
episodes_meta = read_jsonl("meta/episodes.jsonl")
stats_meta = read_jsonl("meta/episodes_stats.jsonl")
tasks_meta = read_jsonl("meta/tasks.jsonl")
if len(episodes_meta) != 53 or len(stats_meta) != 53 or len(tasks_meta) != 3:
    die("META_COUNTS")
if [row.get("episode_index") for row in episodes_meta] != list(range(53)):
    die("META_EPISODE_INDICES")

episodes = []
all_vectors = {name: [] for name in ["state", "actions", "ft", "ft_noisy"]}
schemas = []
global_cursor = 0
observed_field_names = set(info.get("features", {}).keys())
task_counts = {}
for ep in range(53):
    rel = "data/chunk-000/episode_%06d.parquet" % ep
    table = pq.read_table(obj(rel))
    schemas.append(schema_projection(table))
    names = table.column_names
    required = ["state", "actions", "ft", "ft_noisy", "timestamp", "frame_index",
                "episode_index", "index", "task_index"]
    if sorted(names) != sorted(required): die("PARQUET_FIELDS", rel + ":" + repr(names))
    observed_field_names.update(names)
    values = {name: table[name].to_pylist() for name in names}
    rows = table.num_rows
    if values["frame_index"] != list(range(rows)) \
       or values["episode_index"] != [ep] * rows \
       or values["index"] != list(range(global_cursor, global_cursor + rows)):
        die("PARQUET_INDICES", rel)
    if any(abs(float(value) - (i / 15.0)) > 0.00001
           for i, value in enumerate(values["timestamp"])):
        die("PARQUET_TIMESTAMP", rel)
    if len(set(values["task_index"])) != 1: die("PARQUET_TASK_INDEX", rel)
    task_index = int(values["task_index"][0])
    task = next((row.get("task") for row in tasks_meta
                 if row.get("task_index") == task_index), None)
    if not isinstance(task, str): die("TASK_LOOKUP", rel)
    task_counts[task] = task_counts.get(task, 0) + 1
    meta = episodes_meta[ep]
    if meta.get("length") != rows or meta.get("tasks") != [task]:
        die("META_PARQUET_CROSSWALK", rel)
    for name in all_vectors:
        all_vectors[name].extend(values[name])
    vector = {name: vector_summary(values[name]) for name in all_vectors}
    episodes.append({"episodeIndex": ep, "frames": rows, "taskIndex": task_index,
                     "task": task, "schema": schemas[-1],
                     "logicalHash": logical_hash(table), "vectors": vector})
    global_cursor += rows

if any(schema != schemas[0] for schema in schemas): die("PARQUET_SCHEMA_DRIFT")
if info.get("total_episodes") != 53 or info.get("total_frames") != global_cursor \
   or info.get("total_tasks") != 3 or info.get("fps") != 15:
    die("INFO_COUNTS")

videos = []
for ep in range(53):
    frame_count = episodes[ep]["frames"]
    per_episode = []
    for stream in ["image", "wrist_image"]:
        rel = "videos/chunk-000/%s/episode_%06d.mp4" % (stream, ep)
        parsed = parse_mp4(rel)
        if len(parsed["tracks"]) != 1: die("VIDEO_TRACKS", rel)
        track = parsed["tracks"][0]
        if track["handler"] != "vide" or track["codec"] != "av01" \
           or track["sampleCount"] != frame_count \
           or track["timingSampleCount"] != frame_count \
           or track["sampleWidth"] != 256 or track["sampleHeight"] != 256:
            die("VIDEO_PROFILE", rel + ":" + repr(track))
        parsed["stream"] = stream
        parsed["episodeIndex"] = ep
        per_episode.append(parsed)
        videos.append(parsed)
    if per_episode[0]["tracks"][0]["sampleCount"] != per_episode[1]["tracks"][0]["sampleCount"]:
        die("VIDEO_PAIR", str(ep))

outcome_fields = sorted(name for name in observed_field_names
                        if any(token in name.lower()
                               for token in ["success", "failure", "outcome", "reward", "done", "terminal"]))
aggregate_vectors = {}
for name, values in all_vectors.items():
    summary = vector_summary(values)
    aggregate_vectors[name] = {"dimensions": summary["dimensions"],
                               "minimum": summary["minimum"],
                               "maximum": summary["maximum"],
                               "mean": [value / summary["count"] for value in summary["sum"]],
                               "count": summary["count"]}

print(json.dumps({
  "info": {"totalEpisodes": info["total_episodes"],
           "totalFrames": info["total_frames"], "totalTasks": info["total_tasks"],
           "fps": info["fps"], "robotType": info.get("robot_type"),
           "codebaseVersion": info.get("codebase_version"),
           "featureNames": sorted(info.get("features", {}).keys())},
  "metadata": {"episodeRows": len(episodes_meta), "statsRows": len(stats_meta),
               "taskRows": len(tasks_meta), "tasks": tasks_meta},
  "parquet": {"files": 53, "frames": global_cursor, "schema": schemas[0],
              "episodeIndices": list(range(53)), "taskCounts": task_counts,
              "aggregateVectors": aggregate_vectors, "episodes": episodes,
              "sourceNativeOutcomeLikeFields": outcome_fields},
  "video": {"files": len(videos), "bytes": sum(item["bytes"] for item in videos),
            "streams": {stream: sum(item["stream"] == stream for item in videos)
                        for stream in ["image", "wrist_image"]},
            "totalSamples": sum(item["tracks"][0]["sampleCount"] for item in videos),
            "codecs": sorted(set(item["tracks"][0]["codec"] for item in videos)),
            "dimensions": sorted(set(str(item["tracks"][0]["sampleWidth"]) + "x" +
                                     str(item["tracks"][0]["sampleHeight"]) for item in videos)),
            "containerReplay": videos},
}, sort_keys=True, separators=(",", ":"), allow_nan=False))
`;

export function runForgeFailureReplay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const executed = spawnSync(python, ["-c", PYTHON_REPLAY,
    path.resolve(sourceDirectory)], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (executed.error) fail("PYTHON_EXEC_FAILED", executed.error.message);
  if (executed.status !== 0) fail("PYTHON_REPLAY_FAILED",
    String(executed.stderr || executed.stdout).trim());
  const replay = parseJson(Buffer.from(executed.stdout, "utf8"), "python-replay");
  if (!plain(replay) || replay.info?.totalEpisodes !== 53
    || replay.parquet?.files !== 53 || replay.video?.files !== 106
    || replay.video?.totalSamples !== replay.parquet.frames * 2
    || !same(replay.parquet?.episodeIndices,
      Array.from({ length: 53 }, (_, index) => index))) {
    fail("PYTHON_RESULT_INVALID");
  }
  return replay;
}

function readmeProjection(sourceDirectory) {
  const bytes = readRegular(sourceObject(sourceDirectory, "README.md"));
  const text = bytes.toString("utf8");
  const claims = {
    apache2YamlClaim: /^license:\s*apache-2\.0\s*$/mu.test(text),
    failedEpisodesClaim: /The \*\*failed\*\* episodes/iu.test(text),
    sameCollectionClaim: /same collection that produced/iu.test(text),
    identicalPoliciesEnvironmentsRecordingClaim:
      /identical policies,\s*\n?identical environments, identical recording/iu.test(text),
    onlyOutcomeDiffersClaim: /only the outcome differs/iu.test(text),
    readmeEpisodeCount51: /episodes \| \*\*51\*\*/u.test(text),
    readmeFrameCount13899: /frames \| 13,899/u.test(text),
    implicitSuccessLabelsClaim: /Per-episode success labels are implicit/iu.test(text),
    noSuccessColumnClaim: /there is no `success`\s*\n?column/iu.test(text),
    lostFirstRunClaim: /first collection run lost its in-memory failures/iu.test(text),
    roughly19FailuresLostClaim: /roughly 19 failures[^\n]*were lost/iu.test(text),
    rareTailEventsClaim: /These are tail events, not a representative failure distribution/iu
      .test(text),
    isaacLabTag: /- isaac-lab/u.test(text),
    av1Claim: /video \(AV1\)/u.test(text),
    fps15Claim: /fps 15/u.test(text),
  };
  if (!Object.values(claims).every(Boolean)) fail("README_CLAIMS_DRIFT");
  return claims;
}

function sourceObject(sourceDirectory, remotePath) {
  return safeJoin(sourceDirectory, `objects/${remotePath}`);
}

function artifactBody(verified, replay, readme) {
  return {
    schema: FORGE_FAILURE_ARTIFACT_SCHEMA,
    frozenAt: FORGE_FAILURE_FROZEN_AT,
    status: "PINNED_FULL_FORGE_FAILURE_CORPUS_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: { datasetId: FORGE_FAILURE_ID, revision: FORGE_FAILURE_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure },
    replay,
    countAdjudication: {
      readmeEpisodes: 51, readmeFrames: 13_899,
      publishedEpisodeParquets: 53,
      publishedMetadataEpisodeRows: replay.metadata.episodeRows,
      infoEpisodes: replay.info.totalEpisodes,
      actualFrames: replay.parquet.frames,
      readmeEpisodeCountMatchesPinnedBytes: false,
      readmeFrameCountMatchesPinnedBytes: replay.parquet.frames === 13_899,
      authoritativePinnedDenominator: "53_PUBLISHED_EPISODE_PARQUETS",
    },
    publisherClaims: readme,
    failureSemantics: {
      repositoryMembershipPublisherFailureLabel: true,
      sourceNativeOutcomeLikeFields: replay.parquet.sourceNativeOutcomeLikeFields,
      sourceNativeSuccessColumnPresent: false,
      sourceNativeFailureColumnPresent: false,
      publisherFailureLabelIsIndependentOutcome: false,
      everyPublishedEpisodeIndependentlyVerifiedFailed: false,
      sameCollectionLineageByteCrosswalkEstablished: false,
      successfulParentCorpusInClosure: false,
      pairedSuccessFailureAttempts: false,
      recoveryExecutionPresent: false,
      completeCollectionAttemptCensus: false,
      publisherSaysRoughly19FirstRunFailuresLost: true,
      publisherSaysOnlyFailedTailEventsSelected: true,
      onlyFailedSelectionBias: true,
      successfulPopulationMissing: true,
    },
    provenance: {
      publisherIsaacLabTagPresent: true,
      simulationExecutionPublisherDeclared: true,
      realRobotExecutionEstablished: false,
      independentPhysicalOutcomeEstablished: false,
      externalEffectReceiptPresent: false,
    },
    videoSemantics: {
      allVideoBytesAcquired: true,
      allMp4SampleTablesReplayed: true,
      pixelsDecoded: false,
      visualInspectionPerformed: false,
      streamsPerEpisode: 2,
      codec: "av01", dimensions: "256x256",
      videoSamplesMatchParquetFrames: true,
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
      videoBytesPresent: true,
      videoPixelsInspectedForPeopleOrPii: false,
      publisherSimulationContextPresent: true,
      privacyReviewComplete: false,
      noPiiEstablished: false,
      publicAvailabilityResolvesPrivacy: false,
      videoPixelsRepublishedInReport: false,
    },
    boundary: { privacy: 0, training: 0, network: 0, authority: 0,
      CEU: 0, action: 0, delegation: 0, reliableOutcome: 0,
      independentOutcome: 0, recovery: 0, externalEffect: 0 },
  };
}

export function forgeFailureArtifactHash(body) {
  return digest("outsider/forge-failure-full-corpus/v1", body);
}

export function buildForgeFailureArtifactFromSource(sourceDirectory, options = {}) {
  const verified = verifyForgeFailureSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runForgeFailureReplay(sourceDirectory, options);
  const body = artifactBody(verified, replay, readmeProjection(sourceDirectory));
  const artifact = { ...body, artifactHash: forgeFailureArtifactHash(body) };
  const checked = verifyForgeFailureArtifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifyForgeFailureArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== FORGE_FAILURE_ARTIFACT_SCHEMA
      || artifact.frozenAt !== FORGE_FAILURE_FROZEN_AT
      || artifact.status !== "PINNED_FULL_FORGE_FAILURE_CORPUS_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== forgeFailureArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.closure?.selectedObjects !== 165
      || artifact.source?.closure?.selectedBytes !== 40_313_106
      || artifact.source?.closure?.parquetFiles !== 53
      || artifact.source?.closure?.videoFiles !== 106
      || artifact.source?.closure?.licenseFilesPresent !== 0) {
      fail("ARTIFACT_SOURCE_INVALID");
    }
    if (artifact.replay?.info?.totalEpisodes !== 53
      || artifact.replay?.parquet?.files !== 53
      || artifact.replay?.video?.files !== 106
      || artifact.replay?.video?.totalSamples !== artifact.replay.parquet.frames * 2
      || artifact.videoSemantics?.pixelsDecoded !== false
      || artifact.videoSemantics?.visualInspectionPerformed !== false) {
      fail("ARTIFACT_REPLAY_INVALID");
    }
    if (artifact.countAdjudication?.readmeEpisodeCountMatchesPinnedBytes !== false
      || artifact.countAdjudication?.authoritativePinnedDenominator
        !== "53_PUBLISHED_EPISODE_PARQUETS") fail("ARTIFACT_COUNT_INVALID");
    const semantics = artifact.failureSemantics;
    if (!plain(semantics) || semantics.publisherFailureLabelIsIndependentOutcome !== false
      || semantics.everyPublishedEpisodeIndependentlyVerifiedFailed !== false
      || semantics.sameCollectionLineageByteCrosswalkEstablished !== false
      || semantics.pairedSuccessFailureAttempts !== false
      || semantics.recoveryExecutionPresent !== false
      || semantics.completeCollectionAttemptCensus !== false
      || semantics.onlyFailedSelectionBias !== true
      || semantics.successfulPopulationMissing !== true) fail("ARTIFACT_FAILURE_PROMOTION");
    if (artifact.provenance?.simulationExecutionPublisherDeclared !== true
      || artifact.provenance?.realRobotExecutionEstablished !== false
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
      || artifact.privacy?.videoPixelsInspectedForPeopleOrPii !== false
      || artifact.privacy?.privacyReviewComplete !== false
      || artifact.privacy?.noPiiEstablished !== false
      || artifact.privacy?.videoPixelsRepublishedInReport !== false) {
      fail("ARTIFACT_PRIVACY_INVALID");
    }
    if (!same(artifact.boundary, { privacy: 0, training: 0, network: 0,
      authority: 0, CEU: 0, action: 0, delegation: 0, reliableOutcome: 0,
      independentOutcome: 0, recovery: 0, externalEffect: 0 })) {
      fail("ARTIFACT_BOUNDARY_INVALID");
    }
    return { ok: true, artifactHash,
      verificationLevel: "STANDALONE_HASH_AND_FAILURE_SELECTION_SEMANTICS" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyForgeFailureArtifactWithSource(artifact, sourceDirectory,
  options = {}) {
  const standalone = verifyForgeFailureArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildForgeFailureArtifactFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel: "FULL_53_PARQUET_AND_106_MP4_CONTAINER_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
