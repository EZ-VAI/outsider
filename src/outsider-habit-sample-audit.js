/*
 * Pinned HABIT sample, complete no-video intake.
 *
 * The pinned sample is 60 episodes, not the 40 Parquet files visible on the
 * first expanded API page.  This module binds the complete sample subtree,
 * acquires all 60 episode Parquets plus seven metadata files and the root
 * README, and replays explicit frame signals.  Videos, full-dataset bytes,
 * privacy guarantees, independent outcomes, and action/training authority are
 * intentionally outside the result.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const HABIT_DATASET_ID = "configinc/HABIT";
export const HABIT_REQUESTED_REVISION = "bae97d251907743f8fb6db7e70c61d361df4dc1";
export const HABIT_REVISION = "bae97d251907743f8fb6db7e70c61d361df4dc1e";
export const HABIT_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const HABIT_SOURCE_SCHEMA = "outsider/habit-sample-source/v1";
export const HABIT_AUDIT_SCHEMA = "outsider/habit-sample-audit/v1";

export const HABIT_SAMPLE_PROFILE = Object.freeze({
  repositoryUsedStorageBytes: 250_134_941_418,
  repositoryFilePaths: 63_880,
  repositoryFullPaths: 63_385,
  repositorySamplePaths: 367,
  repositoryFigurePaths: 66,
  repositoryTaskDetailPaths: 60,
  rootTreeEntries: 6,
  rootTreeFiles: 2,
  rootTreeBytes: 18_044,
  sampleTreeEntries: 377,
  sampleTreeFiles: 367,
  sampleTreeBytes: 1_499_293_321,
  dataFiles: 60,
  dataBytes: 105_021_911,
  metadataFiles: 7,
  metadataBytes: 174_960,
  readmeFiles: 1,
  readmeBytes: 15_540,
  selectedObjects: 68,
  selectedBytes: 105_212_411,
  videosExcluded: 300,
  videoBytesExcluded: 1_394_096_450,
  episodes: 60,
  frames: 35_529,
  metadataTasks: 58,
  publisherFullDatasetEpisodes: 10_563,
  publisherFullDatasetTasks: 60,
  actionDimensions: 14,
  stateDimensions: 14,
  fps: 10,
});

const HF_ORIGIN = "https://huggingface.co";
const REPOSITORY_API = `${HF_ORIGIN}/api/datasets/${HABIT_DATASET_ID}`
  + `/revision/${HABIT_REVISION}`;
const ROOT_TREE_API = `${HF_ORIGIN}/api/datasets/${HABIT_DATASET_ID}`
  + `/tree/${HABIT_REVISION}?limit=1000`;
const SAMPLE_TREE_API = `${HF_ORIGIN}/api/datasets/${HABIT_DATASET_ID}`
  + `/tree/${HABIT_REVISION}/sample?recursive=true&limit=1000`;
const RAW_BASE = `${HF_ORIGIN}/datasets/${HABIT_DATASET_ID}/resolve/${HABIT_REVISION}`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const DATA_PATH = /^sample\/data\/chunk-000\/episode_[0-9]{6}\.parquet$/u;
const META_PATH = /^sample\/meta\/(?:episodes\.jsonl|human_subtasks\.jsonl|info\.json|modality\.json|stats\.json|subtasks\.jsonl|tasks\.jsonl)$/u;
const VIDEO_PATH = /^sample\/videos\/chunk-000\/observation\.images\.[^/]+\/episode_[0-9]{6}\.mp4$/u;
const MAX_REPOSITORY_BYTES = 8 * 1024 * 1024;
const MAX_TREE_BYTES = 1024 * 1024;
const MAX_OBJECT_BYTES = 4 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 6;

function fail(code, detail = null) {
  throw new Error(detail == null ? `HABIT_SAMPLE_${code}`
    : `HABIT_SAMPLE_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function habitSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return habitSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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

function repositoryProjection(metadata) {
  if (!plain(metadata) || metadata.id !== HABIT_DATASET_ID
    || metadata.sha !== HABIT_REVISION || metadata.private !== false
    || metadata.gated !== false || metadata.disabled !== false
    || metadata.usedStorage !== HABIT_SAMPLE_PROFILE.repositoryUsedStorageBytes
    || String(metadata.cardData?.license ?? "").toLowerCase() !== "cc-by-4.0"
    || !Array.isArray(metadata.siblings)
    || metadata.siblings.length !== HABIT_SAMPLE_PROFILE.repositoryFilePaths) {
    fail("REPOSITORY_METADATA_INVALID");
  }
  const paths = metadata.siblings.map((entry) => entry?.rfilename)
    .sort((left, right) => String(left).localeCompare(String(right)));
  if (paths.some((entry) => !safeRemotePath(entry))
    || new Set(paths).size !== paths.length) fail("REPOSITORY_PATHS_INVALID");
  if (paths.some((entry) => /(?:^|\/)(?:license|copying)(?:\.[^/]*)?$/iu.test(entry))) {
    fail("UNEXPECTED_REPOSITORY_LICENSE_FILE");
  }
  const prefixCounts = {
    full: paths.filter((item) => item.startsWith("full/")).length,
    sample: paths.filter((item) => item.startsWith("sample/")).length,
    figures: paths.filter((item) => item.startsWith("figures/")).length,
    taskDetails: paths.filter((item) => item.startsWith("task_details/")).length,
    root: paths.filter((item) => !item.includes("/")).length,
  };
  if (!same(prefixCounts, { full: 63_385, sample: 367, figures: 66,
    taskDetails: 60, root: 2 })) fail("REPOSITORY_PREFIX_CENSUS_INVALID");
  return {
    datasetId: HABIT_DATASET_ID,
    revision: HABIT_REVISION,
    private: false,
    gated: false,
    disabled: false,
    usedStorageBytes: metadata.usedStorage,
    repositoryFilePaths: paths.length,
    repositoryPathProjectionHash: digest("outsider/habit-repository-paths/v1", paths),
    prefixCounts,
    datasetCardLicenseClaim: "CC-BY-4.0",
    repositoryLicenseFilePresent: false,
    lastModified: typeof metadata.lastModified === "string"
      ? metadata.lastModified : null,
  };
}

function treeEntryProjection(entry) {
  if (!plain(entry) || !safeRemotePath(entry.path)
    || !["file", "directory"].includes(entry.type)
    || !SHA1.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
  if (entry.type === "directory") {
    if (entry.size !== 0) fail("TREE_DIRECTORY_SIZE_INVALID", entry.path);
    return { path: entry.path, type: "directory", oid: entry.oid,
      sizeBytes: 0, lfsSha256: null, lfsBytes: null };
  }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
    fail("TREE_FILE_SIZE_INVALID", entry.path);
  }
  if (entry.lfs == null) return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: null, lfsBytes: null };
  if (!plain(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
    || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
  return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: `sha256:${entry.lfs.oid}`,
    lfsBytes: entry.lfs.size };
}

function projectTree(entries) {
  if (!Array.isArray(entries) || entries.length < 1) fail("TREE_INVALID");
  const projection = entries.map(treeEntryProjection)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(projection.map((entry) => entry.path)).size !== projection.length) {
    fail("TREE_DUPLICATE_PATH");
  }
  return projection;
}

function sumBytes(values) {
  return values.reduce((total, entry) => total + entry.sizeBytes, 0);
}

function rootInventory(projection) {
  const files = projection.filter((entry) => entry.type === "file");
  if (projection.length !== 6 || files.length !== 2 || sumBytes(files) !== 18_044
    || !same(projection.map((entry) => entry.path), [".gitattributes", "figures",
      "full", "README.md", "sample", "task_details"]
      .sort((left, right) => left.localeCompare(right)))) {
    fail("ROOT_TREE_PROFILE_INVALID");
  }
  const readme = files.find((entry) => entry.path === "README.md");
  if (!readme || readme.sizeBytes !== HABIT_SAMPLE_PROFILE.readmeBytes) {
    fail("README_TREE_ENTRY_INVALID");
  }
  return { entries: projection.length, files: files.length, bytes: sumBytes(files),
    projectionHash: digest("outsider/habit-root-tree/v1", projection), readme };
}

function sampleInventory(projection) {
  const files = projection.filter((entry) => entry.type === "file");
  const data = files.filter((entry) => DATA_PATH.test(entry.path));
  const metadata = files.filter((entry) => META_PATH.test(entry.path));
  const videos = files.filter((entry) => VIDEO_PATH.test(entry.path));
  const other = files.filter((entry) => !data.includes(entry)
    && !metadata.includes(entry) && !videos.includes(entry));
  if (projection.length !== HABIT_SAMPLE_PROFILE.sampleTreeEntries
    || files.length !== HABIT_SAMPLE_PROFILE.sampleTreeFiles
    || sumBytes(files) !== HABIT_SAMPLE_PROFILE.sampleTreeBytes
    || data.length !== HABIT_SAMPLE_PROFILE.dataFiles
    || sumBytes(data) !== HABIT_SAMPLE_PROFILE.dataBytes
    || metadata.length !== HABIT_SAMPLE_PROFILE.metadataFiles
    || sumBytes(metadata) !== HABIT_SAMPLE_PROFILE.metadataBytes
    || videos.length !== HABIT_SAMPLE_PROFILE.videosExcluded
    || sumBytes(videos) !== HABIT_SAMPLE_PROFILE.videoBytesExcluded
    || other.length !== 0) fail("SAMPLE_TREE_PROFILE_INVALID");
  const expectedData = Array.from({ length: 60 }, (_, index) =>
    `sample/data/chunk-000/episode_${String(index).padStart(6, "0")}.parquet`);
  if (!same(data.map((entry) => entry.path), expectedData)) {
    fail("SAMPLE_DATA_CENSUS_INVALID");
  }
  const firstFortyDataBytes = sumBytes(data.slice(0, 40));
  if (firstFortyDataBytes !== 67_502_409) fail("FIRST_PAGE_TRAP_PROFILE_INVALID");
  const expectedMeta = ["episodes.jsonl", "human_subtasks.jsonl", "info.json",
    "modality.json", "stats.json", "subtasks.jsonl", "tasks.jsonl"]
    .map((name) => `sample/meta/${name}`).sort();
  if (!same(metadata.map((entry) => entry.path), expectedMeta)) {
    fail("SAMPLE_METADATA_CENSUS_INVALID");
  }
  return {
    entries: projection.length,
    files: files.length,
    bytes: sumBytes(files),
    data: { files: data.length, bytes: sumBytes(data) },
    firstExpandedPageDataPrefix: { files: 40, bytes: firstFortyDataBytes,
      completeSample: false },
    metadata: { files: metadata.length, bytes: sumBytes(metadata) },
    videosExcluded: { files: videos.length, bytes: sumBytes(videos) },
    projectionHash: digest("outsider/habit-sample-tree/v1", projection),
    selected: [...data, ...metadata].sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function permittedFinalUrl(value) {
  const parsed = new URL(value);
  return parsed.protocol === "https:" && parsed.username === ""
    && parsed.password === "" && (parsed.hostname === "huggingface.co"
      || parsed.hostname === "us.aws.cdn.hf.co"
      || parsed.hostname.endsWith(".xethub.hf.co"));
}

async function boundedFetchOnce(url, maximumBytes, fetchImpl) {
  const requested = new URL(url);
  if (requested.protocol !== "https:" || requested.hostname !== "huggingface.co"
    || requested.username !== "" || requested.password !== "") {
    fail("FETCH_URL_UNSAFE", url);
  }
  const response = await fetchImpl(requested, {
    redirect: "follow",
    headers: { accept: "application/json, application/octet-stream;q=0.9, text/plain;q=0.8",
      "user-agent": "outsider-habit-sample-audit/1.0" },
    signal: AbortSignal.timeout(180_000),
  });
  if (!response?.ok || !response.body) fail(`FETCH_${response?.status ?? "FAILED"}`, url);
  if (!permittedFinalUrl(response.url || url)) fail("FETCH_REDIRECT_UNSAFE", response.url || url);
  const declared = response.headers?.get?.("content-length");
  if (declared != null && (!/^[0-9]+$/u.test(declared)
    || Number(declared) > maximumBytes)) fail("FETCH_DECLARED_SIZE_INVALID", url);
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("size limit exceeded");
      fail("FETCH_SIZE_INVALID", url);
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1) fail("FETCH_EMPTY", url);
  return { bytes: Buffer.concat(chunks, total), headers: response.headers,
    finalUrl: response.url || url };
}

function retryable(error) {
  const message = error instanceof Error ? error.message : String(error);
  return error?.name === "TypeError" || error?.name === "AbortError"
    || /^HABIT_SAMPLE_FETCH_(?:FAILED|408|425|429|5[0-9]{2})(?::|$)/u.test(message);
}

async function boundedFetch(url, maximumBytes, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await boundedFetchOnce(url, maximumBytes, fetchImpl); }
    catch (error) {
      last = error;
      if (attempt === 2 || !retryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, [250, 1_000][attempt]));
    }
  }
  throw last;
}

async function jsonFetch(url, maximumBytes, fetchImpl) {
  const fetched = await boundedFetch(url, maximumBytes, fetchImpl);
  let value;
  try { value = JSON.parse(fetched.bytes.toString("utf8")); }
  catch { fail("FETCH_JSON_INVALID", url); }
  return { ...fetched, value };
}

async function fetchRepository(phase, fetchImpl) {
  const fetched = await jsonFetch(REPOSITORY_API, MAX_REPOSITORY_BYTES, fetchImpl);
  return { phase, kind: "repository", url: REPOSITORY_API, bytes: fetched.bytes,
    projection: repositoryProjection(fetched.value) };
}

async function fetchTree(kind, phase, fetchImpl) {
  const url = kind === "root-tree" ? ROOT_TREE_API : SAMPLE_TREE_API;
  const fetched = await jsonFetch(url, MAX_TREE_BYTES, fetchImpl);
  if (!Array.isArray(fetched.value) || fetched.headers?.get?.("link")) {
    fail("TREE_PAGE_OR_PAGINATION_INVALID", kind);
  }
  const projection = projectTree(fetched.value);
  if (kind === "root-tree") rootInventory(projection);
  else sampleInventory(projection);
  return { phase, kind, url, bytes: fetched.bytes, projection };
}

function ensurePrivateDirectory(directory) {
  if (existsSync(directory)) {
    const checked = lstatSync(directory);
    if (checked.isSymbolicLink() || !checked.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
    chmodSync(directory, 0o700);
    return;
  }
  ensurePrivateDirectory(path.dirname(directory));
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function createPrivateRoot(directory) {
  if (existsSync(directory)) fail("SOURCE_EXISTS", directory);
  ensurePrivateDirectory(path.dirname(directory));
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function safeJoin(root, relativePath) {
  if (!safeRemotePath(relativePath)) fail("LOCAL_PATH_UNSAFE", relativePath);
  const target = path.join(root, ...relativePath.split("/"));
  const relative = path.relative(root, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("LOCAL_PATH_ESCAPE", relativePath);
  return target;
}

function writePrivateFileOnce(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  const descriptor = openSync(file, fsConstants.O_WRONLY | fsConstants.O_CREAT
    | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fchmodSync(descriptor, 0o600);
    writeFileSync(descriptor, bytes);
    const checked = fstatSync(descriptor);
    if (!checked.isFile() || checked.size !== bytes.length) fail("WRITE_VERIFY_FAILED", file);
  } finally { closeSync(descriptor); }
  chmodSync(file, 0o600);
}

async function mapConcurrent(values, concurrency, operation) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      output[index] = await operation(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

function snapshotPath(kind, phase) {
  return `control/${kind}-${phase}.json`;
}

function writeSnapshot(root, snapshot) {
  const localPath = snapshotPath(snapshot.kind, snapshot.phase);
  writePrivateFileOnce(safeJoin(root, localPath), snapshot.bytes);
  return { path: localPath, url: snapshot.url, bytes: snapshot.bytes.length,
    contentSha256: habitSha256(snapshot.bytes) };
}

function objectDescriptor(entry, bytes) {
  const contentSha256 = habitSha256(bytes);
  if (bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_MISMATCH", entry.path);
  if (entry.lfsSha256 !== null && contentSha256 !== entry.lfsSha256) {
    fail("OBJECT_LFS_HASH_MISMATCH", entry.path);
  }
  if (entry.lfsSha256 === null && gitBlobOid(bytes) !== entry.oid) {
    fail("OBJECT_GIT_HASH_MISMATCH", entry.path);
  }
  return { path: entry.path, bytes: bytes.length, lfsSha256: entry.lfsSha256,
    gitBlobSha1: entry.oid, contentSha256 };
}

async function downloadObject(root, entry, fetchImpl) {
  const url = `${RAW_BASE}/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
  const fetched = await boundedFetch(url, Math.min(MAX_OBJECT_BYTES, entry.sizeBytes), fetchImpl);
  const descriptor = objectDescriptor(entry, fetched.bytes);
  writePrivateFileOnce(safeJoin(root, entry.path), fetched.bytes);
  return descriptor;
}

function compare(left, right, label) {
  if (!same(left, right)) fail("SOURCE_CHANGED_DURING_ACQUISITION", label);
}

function sourceRootFor(objects) {
  return digest("outsider/habit-sample-source-root/v1", objects);
}

function sourceManifestHash(body) {
  return digest("outsider/habit-sample-source-manifest/v1", body);
}

export async function acquirePinnedHabitSampleSource(sourceDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  const root = path.resolve(sourceDirectory);
  createPrivateRoot(root);
  try {
    const [repoBefore, rootBefore, sampleBefore] = await Promise.all([
      fetchRepository("before", fetchImpl), fetchTree("root-tree", "before", fetchImpl),
      fetchTree("sample-tree", "before", fetchImpl),
    ]);
    const rootProfile = rootInventory(rootBefore.projection);
    const sampleProfile = sampleInventory(sampleBefore.projection);
    const selected = [rootProfile.readme, ...sampleProfile.selected]
      .sort((left, right) => left.path.localeCompare(right.path));
    if (selected.length !== HABIT_SAMPLE_PROFILE.selectedObjects
      || sumBytes(selected) !== HABIT_SAMPLE_PROFILE.selectedBytes) {
      fail("SELECTED_CLOSURE_INVALID");
    }
    const apiSnapshots = [repoBefore, rootBefore, sampleBefore]
      .map((snapshot) => writeSnapshot(root, snapshot));
    const remoteObjects = await mapConcurrent(selected, DOWNLOAD_CONCURRENCY,
      (entry) => downloadObject(root, entry, fetchImpl));
    remoteObjects.sort((left, right) => left.path.localeCompare(right.path));
    const [repoAfter, rootAfter, sampleAfter] = await Promise.all([
      fetchRepository("after", fetchImpl), fetchTree("root-tree", "after", fetchImpl),
      fetchTree("sample-tree", "after", fetchImpl),
    ]);
    compare(repoBefore.projection, repoAfter.projection, "repository");
    compare(rootBefore.projection, rootAfter.projection, "root-tree");
    compare(sampleBefore.projection, sampleAfter.projection, "sample-tree");
    apiSnapshots.push(...[repoAfter, rootAfter, sampleAfter]
      .map((snapshot) => writeSnapshot(root, snapshot)));
    apiSnapshots.sort((left, right) => left.path.localeCompare(right.path));
    const sourceRoot = sourceRootFor(remoteObjects);
    const body = {
      schema: HABIT_SOURCE_SCHEMA,
      datasetId: HABIT_DATASET_ID,
      requestedRevisionPrefix: HABIT_REQUESTED_REVISION,
      revision: HABIT_REVISION,
      frozenAt: HABIT_FROZEN_AT,
      repository: repoBefore.projection,
      rootTree: { ...rootProfile, readme: undefined },
      sampleTree: { ...sampleProfile, selected: undefined },
      sourceClosure: { selectedObjects: remoteObjects.length,
        selectedBytes: remoteObjects.reduce((sum, item) => sum + item.bytes, 0),
        apiSnapshots: apiSnapshots.length, noVideo: true },
      apiSnapshots,
      remoteObjects,
      sourceRoot,
      excluded: {
        sampleVideos: { files: HABIT_SAMPLE_PROFILE.videosExcluded,
          bytes: HABIT_SAMPLE_PROFILE.videoBytesExcluded },
        fullDatasetBytesAcquired: false,
        sampleFirstExpandedPageWasTreatedAsComplete: false,
      },
      rightsIntake: { datasetCardClaim: "CC-BY-4.0",
        pinnedReadmeClaim: "CC-BY-4.0", repositoryLicenseFilePresent: false,
        trainingAuthorizedByThisAudit: false },
    };
    // Omit undefined properties before strict canonicalization.
    delete body.rootTree.readme;
    delete body.sampleTree.selected;
    const manifest = { ...body, manifestHash: sourceManifestHash(body) };
    writePrivateFileOnce(path.join(root, "acquisition-manifest.json"), canonicalBytes(manifest));
    return { sourceDirectory: root, manifest };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function readRegularFile(file, expectedBytes = null) {
  const checked = lstatSync(file);
  if (checked.isSymbolicLink() || !checked.isFile()) fail("SOURCE_FILE_UNSAFE", file);
  if (expectedBytes !== null && checked.size !== expectedBytes) {
    fail("SOURCE_FILE_SIZE_INVALID", file);
  }
  return readFileSync(file);
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail("SOURCE_JSON_INVALID", label); }
}

function snapshotsFromManifest(root, manifest) {
  if (!Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 6) {
    fail("SNAPSHOT_CENSUS_INVALID");
  }
  const output = new Map();
  const urls = { repository: REPOSITORY_API, "root-tree": ROOT_TREE_API,
    "sample-tree": SAMPLE_TREE_API };
  for (const item of manifest.apiSnapshots) {
    const matched = /^control\/(repository|root-tree|sample-tree)-(before|after)\.json$/u
      .exec(item?.path ?? "");
    if (!matched || item.url !== urls[matched[1]]
      || !Number.isSafeInteger(item.bytes) || item.bytes < 1
      || !HASH.test(item.contentSha256 ?? "") || output.has(item.path)) {
      fail("SNAPSHOT_DESCRIPTOR_INVALID");
    }
    const bytes = readRegularFile(safeJoin(root, item.path), item.bytes);
    if (habitSha256(bytes) !== item.contentSha256) fail("SNAPSHOT_HASH_INVALID", item.path);
    output.set(item.path, bytes);
  }
  return output;
}

function verifyObjects(root, manifest, selected) {
  if (!Array.isArray(manifest.remoteObjects)
    || manifest.remoteObjects.length !== HABIT_SAMPLE_PROFILE.selectedObjects) {
    fail("SOURCE_OBJECT_CENSUS_INVALID");
  }
  const expected = new Map(selected.map((entry) => [entry.path, entry]));
  const verified = [];
  for (const descriptor of manifest.remoteObjects) {
    if (!plain(descriptor) || !safeRemotePath(descriptor.path)
      || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1
      || !SHA1.test(descriptor.gitBlobSha1 ?? "")
      || (descriptor.lfsSha256 !== null && !HASH.test(descriptor.lfsSha256 ?? ""))
      || !HASH.test(descriptor.contentSha256 ?? "")) fail("OBJECT_DESCRIPTOR_INVALID");
    const entry = expected.get(descriptor.path);
    if (!entry || descriptor.bytes !== entry.sizeBytes
      || descriptor.gitBlobSha1 !== entry.oid
      || descriptor.lfsSha256 !== entry.lfsSha256) fail("OBJECT_TREE_BINDING_INVALID", descriptor.path);
    const rebuilt = objectDescriptor(entry,
      readRegularFile(safeJoin(root, descriptor.path), descriptor.bytes));
    if (!same(rebuilt, descriptor)) fail("OBJECT_CONTENT_BINDING_INVALID", descriptor.path);
    expected.delete(descriptor.path);
    verified.push(rebuilt);
  }
  if (expected.size) fail("SOURCE_OBJECT_MISSING");
  verified.sort((left, right) => left.path.localeCompare(right.path));
  return verified;
}

export function verifyHabitSampleSourceDirectory(sourceDirectory) {
  try {
    const root = path.resolve(sourceDirectory);
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("SOURCE_DIRECTORY_UNSAFE");
    const manifest = parseJson(readRegularFile(path.join(root,
      "acquisition-manifest.json")), "acquisition-manifest.json");
    if (!plain(manifest) || manifest.schema !== HABIT_SOURCE_SCHEMA
      || manifest.datasetId !== HABIT_DATASET_ID || manifest.revision !== HABIT_REVISION
      || manifest.requestedRevisionPrefix !== HABIT_REQUESTED_REVISION
      || manifest.frozenAt !== HABIT_FROZEN_AT || !HASH.test(manifest.sourceRoot ?? "")
      || !HASH.test(manifest.manifestHash ?? "")) fail("SOURCE_MANIFEST_INVALID");
    const { manifestHash, ...body } = manifest;
    if (sourceManifestHash(body) !== manifestHash) fail("SOURCE_MANIFEST_HASH_INVALID");
    const snapshots = snapshotsFromManifest(root, manifest);
    const repository = {};
    const rootTrees = {};
    const sampleTrees = {};
    for (const phase of ["before", "after"]) {
      repository[phase] = repositoryProjection(parseJson(
        snapshots.get(snapshotPath("repository", phase)), `repository-${phase}`));
      rootTrees[phase] = projectTree(parseJson(
        snapshots.get(snapshotPath("root-tree", phase)), `root-tree-${phase}`));
      sampleTrees[phase] = projectTree(parseJson(
        snapshots.get(snapshotPath("sample-tree", phase)), `sample-tree-${phase}`));
    }
    compare(repository.before, repository.after, "repository");
    compare(rootTrees.before, rootTrees.after, "root-tree");
    compare(sampleTrees.before, sampleTrees.after, "sample-tree");
    compare(repository.before, manifest.repository, "manifest-repository");
    const rootProfile = rootInventory(rootTrees.before);
    const sampleProfile = sampleInventory(sampleTrees.before);
    const rootManifest = { ...rootProfile }; delete rootManifest.readme;
    const sampleManifest = { ...sampleProfile }; delete sampleManifest.selected;
    compare(rootManifest, manifest.rootTree, "manifest-root-tree");
    compare(sampleManifest, manifest.sampleTree, "manifest-sample-tree");
    const selected = [rootProfile.readme, ...sampleProfile.selected]
      .sort((left, right) => left.path.localeCompare(right.path));
    const objects = verifyObjects(root, manifest, selected);
    if (sourceRootFor(objects) !== manifest.sourceRoot) fail("SOURCE_ROOT_INVALID");
    if (manifest.sourceClosure?.selectedObjects !== 68
      || manifest.sourceClosure?.selectedBytes !== 105_212_411
      || manifest.sourceClosure?.apiSnapshots !== 6
      || manifest.sourceClosure?.noVideo !== true
      || !same(manifest.excluded?.sampleVideos, { files: 300, bytes: 1_394_096_450 })
      || manifest.excluded?.fullDatasetBytesAcquired !== false
      || manifest.excluded?.sampleFirstExpandedPageWasTreatedAsComplete !== false
      || manifest.rightsIntake?.datasetCardClaim !== "CC-BY-4.0"
      || manifest.rightsIntake?.pinnedReadmeClaim !== "CC-BY-4.0"
      || manifest.rightsIntake?.repositoryLicenseFilePresent !== false
      || manifest.rightsIntake?.trainingAuthorizedByThisAudit !== false) {
      fail("SOURCE_BOUNDARY_INVALID");
    }
    return { ok: true, sourceDirectory: root, manifest, remoteObjects: objects,
      verificationLevel: "PINNED_REPOSITORY_ROOT_SAMPLE_TREES_AND_COMPLETE_SAMPLE_NO_VIDEO_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import hashlib
import json
import math
import os
import sys

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

root = sys.argv[1]

def abort(code, detail=""):
    raise RuntimeError("HABIT_SAMPLE_PYARROW_" + code + (":" + detail if detail else ""))

def stable_hash(domain, value):
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"),
                         ensure_ascii=False, allow_nan=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(domain.encode("utf-8") + b"\0" + encoded).hexdigest()

def load_json(relative):
    with open(os.path.join(root, relative), "r", encoding="utf-8") as handle:
        return json.load(handle)

def load_jsonl(relative):
    output = []
    with open(os.path.join(root, relative), "r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, 1):
            try:
                value = json.loads(line)
            except Exception:
                abort("JSONL_INVALID", relative + ":" + str(line_number))
            output.append(value)
    return output

def values(column):
    return column.combine_chunks().to_pylist()

def validate_list(column, width, label):
    combined = column.combine_chunks()
    if not (pa.types.is_list(combined.type) or pa.types.is_fixed_size_list(combined.type)):
        abort("VECTOR_TYPE_INVALID", label)
    lengths = pc.list_value_length(combined)
    if combined.null_count or not pc.all(pc.equal(lengths, pa.scalar(width))).as_py():
        abort("VECTOR_WIDTH_INVALID", label)
    if combined.type.value_type != pa.float32() or combined.values.null_count:
        abort("VECTOR_VALUE_TYPE_INVALID", label)
    if not pc.all(pc.is_finite(combined.values)).as_py():
        abort("VECTOR_NONFINITE", label)

def binary(items, label):
    if any(value not in (0, 1, False, True) for value in items):
        abort("BINARY_INVALID", label)

def segments(items, target=1):
    count = 0
    previous = False
    for value in items:
        current = value == target
        if current and not previous:
            count += 1
        previous = current
    return count

def transitions(items):
    return sum(left != right for left, right in zip(items, items[1:]))

info = load_json("sample/meta/info.json")
stats = load_json("sample/meta/stats.json")
modality = load_json("sample/meta/modality.json")
episodes = load_jsonl("sample/meta/episodes.jsonl")
tasks = load_jsonl("sample/meta/tasks.jsonl")
subtasks = load_jsonl("sample/meta/subtasks.jsonl")
human_subtasks = load_jsonl("sample/meta/human_subtasks.jsonl")

if (info.get("total_episodes") != 60 or info.get("total_frames") != 35529 or
        info.get("total_tasks") != 58 or info.get("total_videos") != 300 or
        info.get("fps") != 10.0 or info.get("robot_type") != "human" or
        info.get("codebase_version") != "v2.0" or
        info.get("splits") != {"train": "0:60"}):
    abort("INFO_PROFILE_INVALID")
features = info.get("features")
if not isinstance(features, dict) or len(features) != 76:
    abort("INFO_FEATURES_INVALID")
for field in ["action", "observation.state"]:
    if features.get(field, {}).get("shape") != [14] or features[field].get("dtype") != "float32":
        abort("INFO_VECTOR_INVALID", field)
for field in ["is_intervention_segment", "is_error_segment", "is_high_jerk_segment", "next.done"]:
    if features.get(field, {}).get("shape") != [1] or features[field].get("dtype") != "bool":
        abort("INFO_SIGNAL_INVALID", field)
if sorted(modality.keys()) != ["action", "annotation", "state", "video"]:
    abort("MODALITY_PROFILE_INVALID")
if len(episodes) != 60 or len(tasks) != 58 or len(subtasks) != 156 or len(human_subtasks) != 178:
    abort("METADATA_CENSUS_INVALID")
if [row.get("episode_index") for row in episodes] != list(range(60)):
    abort("EPISODE_METADATA_INDEX_INVALID")
if [row.get("task_index") for row in tasks] != list(range(58)):
    abort("TASK_METADATA_INDEX_INVALID")
if [row.get("task_index") for row in subtasks] != list(range(156)):
    abort("SUBTASK_METADATA_INDEX_INVALID")
if [row.get("task_index") for row in human_subtasks] != list(range(178)):
    abort("HUMAN_SUBTASK_METADATA_INDEX_INVALID")
task_map = {row["task_index"]: row["task"] for row in tasks}
if any(row.get("task_status") != "success" for row in episodes):
    abort("PUBLISHER_TASK_STATUS_INVALID")
if sum(int(row.get("length", 0)) for row in episodes) != 35529:
    abort("EPISODE_METADATA_FRAME_TOTAL_INVALID")

required_vectors = {
    "action": 14,
    "observation.state": 14,
    "robot0.observation.state.cartesian_position": 6,
    "robot0.observation.state.joint_positions": 7,
    "robot0.observation.state.motor_torques_measured": 7,
    "robot0.observation.state.joint_torques_computed": 7,
    "robot1.observation.state.cartesian_position": 6,
    "robot1.observation.state.joint_positions": 7,
    "robot1.observation.state.motor_torques_measured": 7,
    "robot1.observation.state.joint_torques_computed": 7,
    "robot0.action.delta_action": 7,
    "robot1.action.delta_action": 7,
}
signal_fields = ["is_intervention_segment", "is_error_segment", "is_high_jerk_segment"]
expected_schema = None
schema_projection = None
column_order_variants = set()
cursor = 0
intervention_frames = 0
intervention_episodes = 0
intervention_segments = 0
error_frames = 0
error_episodes = 0
error_segments = 0
jerk_frames = 0
jerk_episodes = 0
jerk_segments = 0
done_frames = 0
source_counts = {"robot0": {}, "robot1": {}}
source_transitions = {"robot0": 0, "robot1": 0}
source_transition_episodes = {"robot0": 0, "robot1": 0}
source_disagreement_frames = 0
intervention_both_teleop_matches = 0
robot_subtask_transitions = 0
human_subtask_transitions = 0
episodes_projection = []
task_aggregate = {str(index): {"taskIndex": index, "task": task_map[index],
                               "episodes": 0, "frames": 0,
                               "interventionFrames": 0, "errorFrames": 0}
                  for index in range(58)}

for episode_index in range(60):
    relative = "sample/data/chunk-000/episode_%06d.parquet" % episode_index
    table = pq.read_table(os.path.join(root, relative))
    meta = episodes[episode_index]
    length = int(meta["length"])
    if table.num_rows != length:
        abort("EPISODE_LENGTH_INVALID", str(episode_index))
    current_schema = sorted((field.name, str(field.type)) for field in table.schema)
    column_order_variants.add(tuple(table.column_names))
    if expected_schema is None:
        expected_schema = current_schema
        schema_projection = list(table.column_names)
    elif current_schema != expected_schema:
        abort("PARQUET_SCHEMA_DRIFT", str(episode_index))
    for field in required_vectors:
        if field not in table.column_names:
            abort("REQUIRED_VECTOR_MISSING", field)
        validate_list(table[field], required_vectors[field], relative + ":" + field)
    if any(table.schema.field(field).type != pa.int64() for field in signal_fields):
        abort("PHYSICAL_SIGNAL_TYPE_INVALID", str(episode_index))
    if table.schema.field("next.done").type != pa.bool_():
        abort("PHYSICAL_DONE_TYPE_INVALID", str(episode_index))
    for field in ["robot0.action_source", "robot1.action_source"]:
        if not (pa.types.is_string(table.schema.field(field).type) or
                pa.types.is_large_string(table.schema.field(field).type)):
            abort("PHYSICAL_ACTION_SOURCE_TYPE_INVALID", field)
    required_scalars = ["index", "timestamp", "frame_index", "episode_index",
                        "task_index", "low_level_task_index",
                        "human_role_subtask_index", "next.done",
                        "robot0.action_source", "robot1.action_source"] + signal_fields
    if any(field not in table.column_names for field in required_scalars):
        abort("REQUIRED_SCALAR_MISSING", str(episode_index))
    if any(table[field].null_count for field in required_scalars):
        abort("REQUIRED_SCALAR_NULL", str(episode_index))
    frames = values(table["frame_index"])
    episode_values = values(table["episode_index"])
    global_values = values(table["index"])
    timestamps = values(table["timestamp"])
    task_values = values(table["task_index"])
    if frames != list(range(length)) or episode_values != [episode_index] * length:
        abort("EPISODE_FRAME_INDEX_INVALID", str(episode_index))
    if global_values != list(range(cursor, cursor + length)):
        abort("GLOBAL_INDEX_INVALID", str(episode_index))
    if any(abs(float(value) - frame / 10.0) > 0.00005
           for frame, value in enumerate(timestamps)):
        abort("TIMESTAMP_INVALID", str(episode_index))
    task_index = int(meta["task_index"])
    if task_index not in task_map or task_values != [task_index] * length:
        abort("TASK_INDEX_INVALID", str(episode_index))
    if meta.get("tasks") != [task_map[task_index]] or meta.get("high_level_instruction") != task_map[task_index]:
        abort("TASK_TEXT_INVALID", str(episode_index))
    robot_subtasks = values(table["low_level_task_index"])
    human_subtask_values = values(table["human_role_subtask_index"])
    if any(not isinstance(value, int) or value < 0 or value >= 156 for value in robot_subtasks):
        abort("ROBOT_SUBTASK_INDEX_INVALID", str(episode_index))
    if any(not isinstance(value, int) or value < 0 or value >= 178 for value in human_subtask_values):
        abort("HUMAN_SUBTASK_INDEX_INVALID", str(episode_index))
    robot_changes = transitions(robot_subtasks)
    human_changes = transitions(human_subtask_values)
    robot_subtask_transitions += robot_changes
    human_subtask_transitions += human_changes

    signal_values = {field: values(table[field]) for field in signal_fields}
    for field, items in signal_values.items():
        binary(items, relative + ":" + field)
    interventions = sum(int(value) for value in signal_values["is_intervention_segment"])
    errors = sum(int(value) for value in signal_values["is_error_segment"])
    jerks = sum(int(value) for value in signal_values["is_high_jerk_segment"])
    intervention_frames += interventions
    error_frames += errors
    jerk_frames += jerks
    intervention_episodes += int(interventions > 0)
    error_episodes += int(errors > 0)
    jerk_episodes += int(jerks > 0)
    intervention_segments += segments(signal_values["is_intervention_segment"])
    error_segments += segments(signal_values["is_error_segment"])
    jerk_segments += segments(signal_values["is_high_jerk_segment"])
    done = values(table["next.done"])
    binary(done, relative + ":next.done")
    if done != [False] * (length - 1) + [True]:
        abort("TERMINAL_DONE_INVALID", str(episode_index))
    done_frames += sum(int(value) for value in done)
    episode_sources = {}
    for robot in ["robot0", "robot1"]:
        items = values(table[robot + ".action_source"])
        if any(value not in ("policy", "teleop") for value in items):
            abort("ACTION_SOURCE_INVALID", robot + ":" + str(episode_index))
        for value in items:
            source_counts[robot][value] = source_counts[robot].get(value, 0) + 1
        change_count = transitions(items)
        source_transitions[robot] += change_count
        source_transition_episodes[robot] += int(change_count > 0)
        episode_sources[robot] = items
    source_disagreement_frames += sum(
        left != right for left, right in zip(episode_sources["robot0"], episode_sources["robot1"]))
    intervention_both_teleop_matches += sum(
        bool(intervention) == (left == "teleop" and right == "teleop")
        for intervention, left, right in zip(
            signal_values["is_intervention_segment"], episode_sources["robot0"],
            episode_sources["robot1"]))
    task_aggregate[str(task_index)]["episodes"] += 1
    task_aggregate[str(task_index)]["frames"] += length
    task_aggregate[str(task_index)]["interventionFrames"] += interventions
    task_aggregate[str(task_index)]["errorFrames"] += errors
    episodes_projection.append({
        "episodeIndex": episode_index,
        "taskIndex": task_index,
        "sid": meta.get("sid"),
        "length": length,
        "datasetFromIndex": cursor,
        "datasetToIndex": cursor + length,
        "publisherTaskStatus": meta.get("task_status"),
        "interventionFrames": interventions,
        "interventionSegments": segments(signal_values["is_intervention_segment"]),
        "errorFrames": errors,
        "highJerkFrames": jerks,
        "robot0ActionSourceTransitions": transitions(episode_sources["robot0"]),
        "robot1ActionSourceTransitions": transitions(episode_sources["robot1"]),
        "robotSubtaskTransitions": robot_changes,
        "humanSubtaskTransitions": human_changes,
    })
    cursor += length

if cursor != 35529 or done_frames != 60:
    abort("REPLAY_TOTAL_INVALID")
parquet_columns = schema_projection
metadata_features = sorted(features.keys())
parquet_set = set(parquet_columns)
metadata_set = set(metadata_features)
raw_only = sorted(parquet_set - metadata_set)
metadata_only = sorted(metadata_set - parquet_set)
if len(parquet_columns) != 124 or len(raw_only) != 53 or len(metadata_only) != 5:
    abort("SCHEMA_CENSUS_INVALID")
if metadata_only != [
        "observation.images.exo_view", "observation.images.front_view",
        "observation.images.human_front_view", "observation.images.left_wrist_view",
        "observation.images.right_wrist_view"]:
    abort("METADATA_ONLY_FIELDS_INVALID")
yielding_fields = sorted(name for name in parquet_columns if "yield" in name.lower())
if yielding_fields:
    abort("UNEXPECTED_DIRECT_YIELDING_FIELD")

output = {
    "pyarrowVersion": pa.__version__,
    "dataFilesReplayed": 60,
    "metadataFilesReplayed": 7,
    "episodesReplayed": 60,
    "framesReplayed": 35529,
    "publisherSuccessfulMetadataEpisodes": 60,
    "terminalDoneFrames": done_frames,
    "signals": {
        "intervention": {"frames": intervention_frames, "episodes": intervention_episodes,
                         "segments": intervention_segments},
        "error": {"frames": error_frames, "episodes": error_episodes,
                  "segments": error_segments},
        "highJerk": {"frames": jerk_frames, "episodes": jerk_episodes,
                     "segments": jerk_segments},
    },
    "actionSource": {
        "robot0Counts": source_counts["robot0"],
        "robot1Counts": source_counts["robot1"],
        "robot0Transitions": source_transitions["robot0"],
        "robot1Transitions": source_transitions["robot1"],
        "robot0EpisodesWithTransition": source_transition_episodes["robot0"],
        "robot1EpisodesWithTransition": source_transition_episodes["robot1"],
        "crossArmDisagreementFrames": source_disagreement_frames,
        "interventionEqualsBothArmsTeleopFrames": intervention_both_teleop_matches,
        "interventionEqualsBothArmsTeleopForEveryFrame": intervention_both_teleop_matches == 35529,
    },
    "subtaskTransitions": {"robot": robot_subtask_transitions,
                           "human": human_subtask_transitions},
    "schema": {
        "parquetColumns": parquet_columns,
        "parquetColumnCount": len(parquet_columns),
        "infoFeatureCount": len(metadata_features),
        "overlapCount": len(parquet_set & metadata_set),
        "rawParquetOnlyColumns": raw_only,
        "rawParquetOnlyColumnCount": len(raw_only),
        "metadataOnlyVideoFields": metadata_only,
        "metadataOnlyFieldCount": len(metadata_only),
        "identicalFieldTypeSchemaAcrossAllEpisodes": True,
        "columnOrderVariantCount": len(column_order_variants),
        "identicalColumnOrderAcrossAllEpisodes": len(column_order_variants) == 1,
        "infoDeclaresSignalsBoolButPhysicalParquetUsesInt64": True,
        "directYieldingFields": [],
        "dualFrankaStateActionAndTorqueFieldsValidated": True,
        "stateDimensions": 14,
        "actionDimensions": 14,
    },
    "continuity": {
        "episodeIndexContinuous": True,
        "frameIndexContinuousWithinEpisode": True,
        "globalIndexContinuous": True,
        "timestampCadenceAligned10Fps": True,
        "metadataAligned": True,
    },
    "metadata": {
        "sampleEpisodes": 60,
        "sampleFrames": 35529,
        "sampleTaskRows": 58,
        "robotSubtaskRows": 156,
        "humanSubtaskRows": 178,
        "allTaskStatusValues": ["success"],
    },
    "episodes": episodes_projection,
    "episodeProjectionHash": stable_hash("outsider/habit-sample-episodes/v1", episodes_projection),
    "taskAggregates": [task_aggregate[str(index)] for index in range(58)],
}
print(json.dumps(output, sort_keys=True, separators=(",", ":"), allow_nan=False))
`;

export function runHabitSamplePyarrowReplay(sourceDirectory,
  pythonExecutable = ".venv/bin/python") {
  if (typeof pythonExecutable !== "string" || pythonExecutable.length < 1) {
    fail("PYTHON_EXECUTABLE_INVALID");
  }
  const executed = spawnSync(pythonExecutable, ["-c", PYARROW_REPLAY,
    path.resolve(sourceDirectory)], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 600_000,
    env: { ...process.env, PYTHONHASHSEED: "0" },
  });
  if (executed.error) fail("PYARROW_EXEC_FAILED", executed.error.message);
  if (executed.status !== 0) {
    fail("PYARROW_REPLAY_FAILED", String(executed.stderr || executed.stdout).trim());
  }
  const replay = parseJson(Buffer.from(executed.stdout, "utf8"), "PYARROW_REPLAY");
  if (!plain(replay) || replay.dataFilesReplayed !== 60
    || replay.metadataFilesReplayed !== 7 || replay.episodesReplayed !== 60
    || replay.framesReplayed !== 35_529
    || replay.publisherSuccessfulMetadataEpisodes !== 60
    || replay.terminalDoneFrames !== 60
    || replay.schema?.parquetColumnCount !== 124
    || replay.schema?.infoFeatureCount !== 76
    || replay.schema?.rawParquetOnlyColumnCount !== 53
    || replay.schema?.metadataOnlyFieldCount !== 5
    || replay.schema?.directYieldingFields?.length !== 0
    || replay.schema?.dualFrankaStateActionAndTorqueFieldsValidated !== true
    || replay.episodes?.length !== 60 || replay.taskAggregates?.length !== 58) {
    fail("PYARROW_RESULT_INVALID");
  }
  return replay;
}

function inspectReadme(sourceDirectory) {
  const text = readRegularFile(path.join(sourceDirectory, "README.md"),
    HABIT_SAMPLE_PROFILE.readmeBytes).toString("utf8");
  const required = ["license: cc-by-4.0", "10,563 episodes", "spanning 60 tasks",
    "A small subset covering all 60 tasks", "1 episode per task",
    "In every episode of HABIT, a co-present human shares the workspace",
    "robot retracts when about to collide with the human"];
  for (const claim of required) {
    if (!text.includes(claim)) fail("README_CLAIM_MISSING", claim);
  }
  return {
    licenseClaim: "CC-BY-4.0",
    fullDatasetEpisodeClaim: 10_563,
    fullDatasetTaskClaim: 60,
    sampleTaskClaim: 60,
    sampleOneEpisodePerTaskClaim: true,
    pinnedSampleMetadataEpisodes: 60,
    pinnedSampleMetadataTaskRows: 58,
    sampleTaskNarrativeMatchesPinnedTaskRows: false,
    humanPresentEveryEpisodePublisherDeclared: true,
    yieldingSafetyRetractionPublisherNarrative: true,
    narrativeMappedToDirectYieldingField: false,
  };
}

export function habitSampleArtifactHash(body) {
  return digest("outsider/habit-sample-audit/v1", body);
}

function auditBody(source, replay, readme) {
  return {
    schema: HABIT_AUDIT_SCHEMA,
    datasetId: HABIT_DATASET_ID,
    requestedRevisionPrefix: HABIT_REQUESTED_REVISION,
    revision: HABIT_REVISION,
    frozenAt: HABIT_FROZEN_AT,
    admission: "ACQUIRED_EVAL_ONLY",
    status: "COMPLETE_PINNED_HABIT_SAMPLE_NO_VIDEO_SIGNAL_REPLAY",
    sourceManifestHash: source.manifest.manifestHash,
    sourceRoot: source.manifest.sourceRoot,
    sourceVerificationLevel: source.verificationLevel,
    sourceClosure: source.manifest.sourceClosure,
    repository: source.manifest.repository,
    rootTree: source.manifest.rootTree,
    sampleTree: source.manifest.sampleTree,
    replay,
    readme,
    paginationCorrection: {
      firstExpandedApiPageDataFiles: 40,
      firstExpandedApiPageDataBytes: 67_502_409,
      firstExpandedApiPageWasCompleteSample: false,
      pinnedCompleteSampleDataFiles: 60,
      pinnedCompleteSampleDataBytes: 105_021_911,
      missingIfFirstPageMistakenForComplete: { files: 20, bytes: 37_519_502 },
    },
    sampleScope: {
      sampleEpisodesReplayed: 60,
      sampleFramesReplayed: 35_529,
      pinnedSampleTaskRows: 58,
      publisherFullDatasetEpisodeClaim: 10_563,
      publisherFullDatasetTaskClaim: 60,
      samplePromotedToFullDatasetCensus: false,
      fullDatasetBytesAcquired: false,
      selectionBias: "PUBLISHER_SAMPLE_ALL_METADATA_TASK_STATUS_SUCCESS",
    },
    fieldConclusion: {
      interventionSegmentByteField: true,
      errorSegmentByteField: true,
      highJerkSegmentByteField: true,
      actionSourceByteFields: true,
      humanAndRobotSubtaskByteFields: true,
      terminalDoneByteField: true,
      dualFrankaStateActionTorqueBytes: true,
      directYieldingByteField: false,
      yieldingOnlyPublisherNarrative: true,
      interventionAutomaticallyClassifiedAsYielding: false,
    },
    outcome: {
      publisherMetadataTaskStatus: "success",
      publisherSuccessfulSampleEpisodes: 60,
      outcomeColumnInFrameParquet: false,
      terminalDoneIsNotSuccessOutcome: true,
      operatorSafetyRetractionPromotedToIndependentOutcome: false,
      independentOutcome: 0,
      longitudinalOutcome: 0,
    },
    recovery: {
      frameInterventionAndSourceTransitionsAvailable: true,
      explicitFailureToRecoveryPairsAvailable: false,
      completeCollectionAttemptCensus: false,
      discardedOrUnpublishedAttemptsKnown: false,
    },
    completeness: {
      completePinnedSampleDataAndMetadata: true,
      completePinnedSampleEpisodeReplay: true,
      sampleVideosAcquired: false,
      visualReplay: false,
      completeFullDataset: false,
      firstApiPageTreatedAsFullSample: false,
    },
    privacy: {
      coPresentHumanPublisherDeclaredEveryEpisode: true,
      humanCameraVideoAcquired: false,
      privacyReviewComplete: false,
      noPersonalInformationGuarantee: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    rights: {
      datasetCardClaim: "CC-BY-4.0",
      pinnedReadmeClaim: "CC-BY-4.0",
      repositoryLicenseFilePresent: false,
      productionTrainingRightFinallyAdjudicated: false,
    },
    boundary: {
      training: 0, network: 0, CEU: 0, authority: 0, action: 0,
      opportunity: 0, delegation: 0, independentOutcome: 0,
      longitudinalOutcome: 0,
    },
  };
}

export function buildHabitSampleAuditFromSource(sourceDirectory, options = {}) {
  const source = verifyHabitSampleSourceDirectory(sourceDirectory);
  if (!source.ok) fail("SOURCE_VERIFICATION_FAILED", source.error);
  const readme = inspectReadme(source.sourceDirectory);
  const replay = runHabitSamplePyarrowReplay(source.sourceDirectory,
    options.pythonExecutable ?? ".venv/bin/python");
  const body = auditBody(source, replay, readme);
  return { ...body, artifactHash: habitSampleArtifactHash(body) };
}

function zeroBoundary(boundary) {
  return plain(boundary) && ["training", "network", "CEU", "authority", "action",
    "opportunity", "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => boundary[key] === 0);
}

export function verifyHabitSampleAuditArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== HABIT_AUDIT_SCHEMA
      || artifact.datasetId !== HABIT_DATASET_ID || artifact.revision !== HABIT_REVISION
      || artifact.requestedRevisionPrefix !== HABIT_REQUESTED_REVISION
      || artifact.frozenAt !== HABIT_FROZEN_AT || artifact.admission !== "ACQUIRED_EVAL_ONLY"
      || artifact.status !== "COMPLETE_PINNED_HABIT_SAMPLE_NO_VIDEO_SIGNAL_REPLAY"
      || !HASH.test(artifact.artifactHash ?? "")
      || !HASH.test(artifact.sourceManifestHash ?? "")
      || !HASH.test(artifact.sourceRoot ?? "")) fail("ARTIFACT_INVALID");
    const { artifactHash, ...body } = artifact;
    if (habitSampleArtifactHash(body) !== artifactHash) fail("ARTIFACT_HASH_INVALID");
    if (!zeroBoundary(artifact.boundary)) fail("BOUNDARY_PROMOTION_REFUSED");
    if (!same(artifact.paginationCorrection, {
      firstExpandedApiPageDataFiles: 40,
      firstExpandedApiPageDataBytes: 67_502_409,
      firstExpandedApiPageWasCompleteSample: false,
      pinnedCompleteSampleDataFiles: 60,
      pinnedCompleteSampleDataBytes: 105_021_911,
      missingIfFirstPageMistakenForComplete: { files: 20, bytes: 37_519_502 },
    })) fail("PAGINATION_PROMOTION_REFUSED");
    if (artifact.sampleScope?.sampleEpisodesReplayed !== 60
      || artifact.sampleScope?.sampleFramesReplayed !== 35_529
      || artifact.sampleScope?.pinnedSampleTaskRows !== 58
      || artifact.sampleScope?.samplePromotedToFullDatasetCensus !== false
      || artifact.sampleScope?.fullDatasetBytesAcquired !== false) fail("SCOPE_PROMOTION_REFUSED");
    if (artifact.fieldConclusion?.interventionSegmentByteField !== true
      || artifact.fieldConclusion?.errorSegmentByteField !== true
      || artifact.fieldConclusion?.actionSourceByteFields !== true
      || artifact.fieldConclusion?.dualFrankaStateActionTorqueBytes !== true
      || artifact.fieldConclusion?.directYieldingByteField !== false
      || artifact.fieldConclusion?.yieldingOnlyPublisherNarrative !== true
      || artifact.fieldConclusion?.interventionAutomaticallyClassifiedAsYielding !== false) {
      fail("FIELD_PROMOTION_REFUSED");
    }
    if (artifact.outcome?.publisherSuccessfulSampleEpisodes !== 60
      || artifact.outcome?.outcomeColumnInFrameParquet !== false
      || artifact.outcome?.terminalDoneIsNotSuccessOutcome !== true
      || artifact.outcome?.operatorSafetyRetractionPromotedToIndependentOutcome !== false
      || artifact.outcome?.independentOutcome !== 0
      || artifact.outcome?.longitudinalOutcome !== 0
      || artifact.recovery?.explicitFailureToRecoveryPairsAvailable !== false
      || artifact.recovery?.completeCollectionAttemptCensus !== false
      || artifact.recovery?.discardedOrUnpublishedAttemptsKnown !== false) {
      fail("OUTCOME_RECOVERY_PROMOTION_REFUSED");
    }
    if (artifact.completeness?.completePinnedSampleDataAndMetadata !== true
      || artifact.completeness?.sampleVideosAcquired !== false
      || artifact.completeness?.visualReplay !== false
      || artifact.completeness?.completeFullDataset !== false
      || artifact.completeness?.firstApiPageTreatedAsFullSample !== false) {
      fail("COMPLETENESS_PROMOTION_REFUSED");
    }
    if (artifact.privacy?.coPresentHumanPublisherDeclaredEveryEpisode !== true
      || artifact.privacy?.humanCameraVideoAcquired !== false
      || artifact.privacy?.privacyReviewComplete !== false
      || artifact.privacy?.noPersonalInformationGuarantee !== false
      || artifact.privacy?.publicAvailabilityResolvesPrivacy !== false) {
      fail("PRIVACY_PROMOTION_REFUSED");
    }
    if (!same(artifact.rights, { datasetCardClaim: "CC-BY-4.0",
      pinnedReadmeClaim: "CC-BY-4.0", repositoryLicenseFilePresent: false,
      productionTrainingRightFinallyAdjudicated: false })) fail("RIGHTS_PROMOTION_REFUSED");
    if (artifact.sourceClosure?.selectedObjects !== 68
      || artifact.sourceClosure?.selectedBytes !== 105_212_411
      || artifact.sourceClosure?.noVideo !== true
      || artifact.replay?.dataFilesReplayed !== 60
      || artifact.replay?.metadataFilesReplayed !== 7
      || artifact.replay?.episodesReplayed !== 60
      || artifact.replay?.framesReplayed !== 35_529
      || artifact.replay?.episodeProjectionHash
        !== "sha256:8a296c38549c7d40cedf85da2ba0b8801b12e6b5b78ed5e382b43da363c4d67e"
      || !same(artifact.replay?.signals, {
        intervention: { frames: 4_722, episodes: 9, segments: 9 },
        error: { frames: 0, episodes: 0, segments: 0 },
        highJerk: { frames: 0, episodes: 0, segments: 0 },
      })
      || !same(artifact.replay?.actionSource, {
        robot0Counts: { policy: 8, teleop: 35_521 },
        robot1Counts: { policy: 8, teleop: 35_521 },
        robot0Transitions: 8,
        robot1Transitions: 8,
        robot0EpisodesWithTransition: 8,
        robot1EpisodesWithTransition: 8,
        crossArmDisagreementFrames: 0,
        interventionEqualsBothArmsTeleopFrames: 4_730,
        interventionEqualsBothArmsTeleopForEveryFrame: false,
      })
      || !same(artifact.replay?.subtaskTransitions, { robot: 143, human: 155 })
      || artifact.replay?.schema?.columnOrderVariantCount !== 8
      || artifact.replay?.schema?.identicalFieldTypeSchemaAcrossAllEpisodes !== true
      || artifact.replay?.schema?.identicalColumnOrderAcrossAllEpisodes !== false
      || artifact.replay?.schema?.directYieldingFields?.length !== 0
      || artifact.replay?.episodes?.length !== 60) fail("ARTIFACT_PROFILE_INVALID");
    return { ok: true, artifactHash,
      verificationLevel: "STANDALONE_HASH_AND_FAIL_CLOSED_SAMPLE_SEMANTICS" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyHabitSampleAuditArtifactWithSource(artifact,
  sourceDirectory, options = {}) {
  try {
    const standalone = verifyHabitSampleAuditArtifact(artifact);
    if (!standalone.ok) fail("STANDALONE_ARTIFACT_FAILED", standalone.error);
    const rebuilt = buildHabitSampleAuditFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_BOUND_ARTIFACT_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.sourceManifestHash, sourceRoot: artifact.sourceRoot,
      verificationLevel: "FULL_PINNED_SAMPLE_SOURCE_BYTE_AND_PYARROW_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
