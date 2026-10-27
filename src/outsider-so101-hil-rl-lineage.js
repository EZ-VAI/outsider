/*
 * Pinned, linked SO101 HIL -> RL lineage intake.
 *
 * This module acquires every data and metadata Parquet object from two
 * publisher-linked repositories while excluding every video/image object.
 * It verifies intervention, terminal reward/done, operator outcome, and task
 * crosswalk bytes.  It does not make discarded attempts appear, promote the
 * operator label to an independent outcome, authorize training or action, or
 * claim a cryptographically proven model lineage.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const SO101_HIL_RL_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const SO101_HIL_RL_SOURCE_SCHEMA =
  "outsider/so101-hil-rl-linked-source/v1";
export const SO101_HIL_RL_LINEAGE_SCHEMA =
  "outsider/so101-hil-rl-linked-lineage/v1";

export const SO101_HIL_RL_REPOSITORIES = Object.freeze({
  hil: Object.freeze({
    key: "hil",
    datasetId: "TakuyaHiraoka/so101_pick_diverse_objects_hil_round1",
    revision: "9c6638fd71027d26b98524134436d7443030c48d",
    usedStorageBytes: 461_971_915,
    repositoryFilePaths: 413,
    treeEntries: 426,
    treeFiles: 413,
    treeBytes: 420_322_757,
    readmeBytes: 3_149,
    dataFiles: 49,
    dataBytes: 10_805_341,
    metadataFiles: 52,
    metadataBytes: 3_750_646,
    selectedObjects: 102,
    selectedBytes: 14_559_136,
    mediaFiles: 310,
    mediaBytes: 405_761_117,
    otherExcludedFiles: 1,
    otherExcludedBytes: 2_504,
    episodes: 563,
    frames: 164_795,
    tasks: 30,
  }),
  rl: Object.freeze({
    key: "rl",
    datasetId: "TakuyaHiraoka/so101_pick_diverse_objects_rl_round1",
    revision: "1b8ae961e180e288d8e2e043b4026477f613bc85",
    usedStorageBytes: 69_014_270,
    repositoryFilePaths: 41,
    treeEntries: 49,
    treeFiles: 41,
    treeBytes: 69_036_936,
    readmeBytes: 5_211,
    dataFiles: 12,
    dataBytes: 3_364_125,
    metadataFiles: 15,
    metadataBytes: 921_713,
    selectedObjects: 28,
    selectedBytes: 4_291_049,
    mediaFiles: 12,
    mediaBytes: 64_743_383,
    otherExcludedFiles: 1,
    otherExcludedBytes: 2_504,
    episodes: 101,
    frames: 46_016,
    tasks: 2,
    successfulEpisodes: 49,
    failedEpisodes: 52,
  }),
});

export const SO101_HIL_RL_PROFILE = Object.freeze({
  repositories: 2,
  treeEntries: 475,
  treeFiles: 454,
  treeBytes: 489_359_693,
  selectedObjects: 130,
  selectedBytes: 18_850_185,
  readmeFiles: 2,
  readmeBytes: 8_360,
  dataFiles: 61,
  dataBytes: 14_169_466,
  metadataFiles: 67,
  metadataBytes: 4_672_359,
  episodes: 664,
  frames: 210_811,
  mediaFilesExcluded: 322,
  mediaBytesExcluded: 470_504_500,
  otherFilesExcluded: 2,
  otherBytesExcluded: 5_008,
  actionDimensions: 6,
  stateDimensions: 6,
});

const REPO_KEYS = Object.freeze(["hil", "rl"]);
const HF_ORIGIN = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const DATA_PATH = /^data\/chunk-000\/file-[0-9]{3}\.parquet$/u;
const META_PATH = /^meta\/(?:info\.json|stats\.json|tasks\.parquet|episodes\/chunk-000\/file-[0-9]{3}\.parquet)$/u;
const MEDIA_PATH = /^(?:videos\/.*\.mp4|images\/.*\.(?:png|jpg|jpeg)|tmp_[^/]+\/.*\.mp4)$/iu;
const MAX_REPOSITORY_BYTES = 2 * 1024 * 1024;
const MAX_TREE_BYTES = 2 * 1024 * 1024;
const MAX_OBJECT_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 8;

const EXPECTED_TASK_CROSSWALK = Object.freeze([
  Object.freeze({ rlTaskIndex: 0, rlPrompt: "Pick a pen.",
    hilTaskIndex: 25, hilPrompt: "Pick a pen.", match: "EXACT_PROMPT" }),
  Object.freeze({ rlTaskIndex: 1, rlPrompt: "Pick Chikawa toy.",
    hilTaskIndex: 0, hilPrompt: "Pick Chikawa toy.", match: "EXACT_PROMPT" }),
]);

function fail(code, detail = null) {
  throw new Error(detail == null ? `SO101_HIL_RL_${code}`
    : `SO101_HIL_RL_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function so101HilRlSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return so101HilRlSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function safeRemotePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 512
    && !value.startsWith("/") && !value.includes("\\")
    && !value.split("/").some((part) => part === "" || part === "." || part === "..")
    && !/[\u0000-\u001f\u007f]/u.test(value);
}

function apiFor(profile) {
  const base = `${HF_ORIGIN}/api/datasets/${profile.datasetId}`;
  return {
    repository: `${base}/revision/${profile.revision}`,
    tree: `${base}/tree/${profile.revision}?recursive=true&expand=false&limit=1000`,
    raw: `${HF_ORIGIN}/datasets/${profile.datasetId}/resolve/${profile.revision}`,
  };
}

function repositoryProjection(profile, metadata) {
  if (!plain(metadata) || metadata.id !== profile.datasetId
    || metadata.sha !== profile.revision || metadata.private !== false
    || metadata.gated !== false || metadata.disabled !== false
    || metadata.usedStorage !== profile.usedStorageBytes
    || String(metadata.cardData?.license ?? "").toLowerCase() !== "mit"
    || !Array.isArray(metadata.siblings)
    || metadata.siblings.length !== profile.repositoryFilePaths) {
    fail("REPOSITORY_METADATA_INVALID", profile.key);
  }
  const paths = metadata.siblings.map((entry) => entry?.rfilename)
    .sort((left, right) => String(left).localeCompare(String(right)));
  if (paths.some((entry) => !safeRemotePath(entry))
    || new Set(paths).size !== paths.length) fail("REPOSITORY_PATHS_INVALID", profile.key);
  const licensePath = paths.find((entry) =>
    /(?:^|\/)(?:license|copying)(?:\.[^/]*)?$/iu.test(entry));
  if (licensePath) fail("UNEXPECTED_LICENSE_FILE", `${profile.key}:${licensePath}`);
  return {
    key: profile.key,
    datasetId: profile.datasetId,
    revision: profile.revision,
    private: false,
    gated: false,
    disabled: false,
    usedStorageBytes: metadata.usedStorage,
    repositoryFilePaths: paths.length,
    repositoryPathProjectionHash: digest(
      "outsider/so101-hil-rl-repository-paths/v1", paths),
    datasetCardLicenseClaim: "MIT",
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
  if (entry.lfs == null) {
    return { path: entry.path, type: "file", oid: entry.oid,
      sizeBytes: entry.size, lfsSha256: null, lfsBytes: null };
  }
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
    headers: {
      accept: "application/json, application/octet-stream;q=0.9, text/plain;q=0.8",
      "user-agent": "outsider-so101-hil-rl-linked-lineage/1.0",
    },
    signal: AbortSignal.timeout(180_000),
  });
  if (!response?.ok || !response.body) {
    fail(`FETCH_${response?.status ?? "FAILED"}`, url);
  }
  if (!permittedFinalUrl(response.url || url)) {
    fail("FETCH_REDIRECT_UNSAFE", response.url || url);
  }
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

function retryableFetchFailure(error) {
  const message = error instanceof Error ? error.message : String(error);
  return error?.name === "TypeError" || error?.name === "AbortError"
    || /^SO101_HIL_RL_FETCH_(?:FAILED|408|425|429|5[0-9]{2})(?::|$)/u.test(message);
}

async function boundedFetch(url, maximumBytes, fetchImpl) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await boundedFetchOnce(url, maximumBytes, fetchImpl); }
    catch (error) {
      lastError = error;
      if (attempt === 2 || !retryableFetchFailure(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, [250, 1_000][attempt]));
    }
  }
  throw lastError;
}

async function jsonFetch(url, maximumBytes, fetchImpl) {
  const fetched = await boundedFetch(url, maximumBytes, fetchImpl);
  let value;
  try { value = JSON.parse(fetched.bytes.toString("utf8")); }
  catch { fail("FETCH_JSON_INVALID", url); }
  return { ...fetched, value };
}

async function fetchRepository(profile, phase, fetchImpl) {
  const api = apiFor(profile);
  const fetched = await jsonFetch(api.repository, MAX_REPOSITORY_BYTES, fetchImpl);
  return { profile, phase, url: api.repository, bytes: fetched.bytes,
    projection: repositoryProjection(profile, fetched.value) };
}

async function fetchTree(profile, phase, fetchImpl) {
  const api = apiFor(profile);
  const fetched = await jsonFetch(api.tree, MAX_TREE_BYTES, fetchImpl);
  if (!Array.isArray(fetched.value) || fetched.value.length < 1
    || fetched.value.length > 1_000 || fetched.headers?.get?.("link")) {
    fail("TREE_PAGE_OR_PAGINATION_INVALID", profile.key);
  }
  return { profile, phase, url: api.tree, bytes: fetched.bytes,
    projection: projectTree(fetched.value) };
}

function expectedShardPath(prefix, index) {
  return `${prefix}/chunk-000/file-${String(index).padStart(3, "0")}.parquet`;
}

function repoInventory(profile, projection) {
  const files = projection.filter((entry) => entry.type === "file");
  const readme = files.filter((entry) => entry.path === "README.md");
  const data = files.filter((entry) => DATA_PATH.test(entry.path));
  const metadata = files.filter((entry) => META_PATH.test(entry.path));
  const media = files.filter((entry) => MEDIA_PATH.test(entry.path));
  const other = files.filter((entry) => !readme.includes(entry)
    && !data.includes(entry) && !metadata.includes(entry) && !media.includes(entry));
  const selected = [...readme, ...data, ...metadata]
    .sort((left, right) => left.path.localeCompare(right.path));
  const sum = (values) => values.reduce((total, entry) => total + entry.sizeBytes, 0);
  const inventory = {
    key: profile.key,
    entries: projection.length,
    files: files.length,
    bytes: sum(files),
    readme: { files: readme.length, bytes: sum(readme) },
    data: { files: data.length, bytes: sum(data) },
    metadata: { files: metadata.length, bytes: sum(metadata) },
    selected: { files: selected.length, bytes: sum(selected) },
    mediaExcluded: { files: media.length, bytes: sum(media) },
    otherExcluded: { files: other.length, bytes: sum(other),
      paths: other.map((entry) => entry.path) },
    projectionHash: digest("outsider/so101-hil-rl-tree/v1", projection),
  };
  const expected = {
    entries: profile.treeEntries, files: profile.treeFiles, bytes: profile.treeBytes,
    readme: { files: 1, bytes: profile.readmeBytes },
    data: { files: profile.dataFiles, bytes: profile.dataBytes },
    metadata: { files: profile.metadataFiles, bytes: profile.metadataBytes },
    selected: { files: profile.selectedObjects, bytes: profile.selectedBytes },
    mediaExcluded: { files: profile.mediaFiles, bytes: profile.mediaBytes },
    otherExcluded: { files: profile.otherExcludedFiles,
      bytes: profile.otherExcludedBytes },
  };
  for (const key of ["entries", "files", "bytes"]) {
    if (inventory[key] !== expected[key]) fail("INVENTORY_INVALID", `${profile.key}:${key}`);
  }
  for (const key of ["readme", "data", "metadata", "selected", "mediaExcluded",
    "otherExcluded"]) {
    if (inventory[key].files !== expected[key].files
      || inventory[key].bytes !== expected[key].bytes) {
      fail("INVENTORY_GROUP_INVALID", `${profile.key}:${key}`);
    }
  }
  if (readme[0]?.sizeBytes !== profile.readmeBytes
    || other.length !== 1 || other[0].path !== ".gitattributes") {
    fail("INVENTORY_ROOT_FILES_INVALID", profile.key);
  }
  const expectedData = Array.from({ length: profile.dataFiles }, (_, index) =>
    expectedShardPath("data", index));
  const actualData = data.map((entry) => entry.path);
  if (canonicalizeStrict(expectedData) !== canonicalizeStrict(actualData)) {
    fail("DATA_SHARD_CENSUS_INVALID", profile.key);
  }
  const episodeMetadata = metadata.filter((entry) =>
    entry.path.startsWith("meta/episodes/"));
  const expectedEpisodeMetadata = Array.from({ length: profile.dataFiles }, (_, index) =>
    expectedShardPath("meta/episodes", index));
  if (canonicalizeStrict(episodeMetadata.map((entry) => entry.path))
    !== canonicalizeStrict(expectedEpisodeMetadata)) {
    fail("EPISODE_META_SHARD_CENSUS_INVALID", profile.key);
  }
  const fixedMeta = new Set(["meta/info.json", "meta/stats.json", "meta/tasks.parquet"]);
  if (metadata.filter((entry) => !entry.path.startsWith("meta/episodes/"))
    .some((entry) => !fixedMeta.has(entry.path))) fail("META_CLOSURE_INVALID", profile.key);
  return { inventory, selected, media };
}

function combinedInventory(repos) {
  const values = REPO_KEYS.map((key) => repoInventory(repos[key].profile,
    repos[key].projection));
  const totals = {
    treeEntries: values.reduce((sum, value) => sum + value.inventory.entries, 0),
    treeFiles: values.reduce((sum, value) => sum + value.inventory.files, 0),
    treeBytes: values.reduce((sum, value) => sum + value.inventory.bytes, 0),
    selectedObjects: values.reduce((sum, value) => sum + value.inventory.selected.files, 0),
    selectedBytes: values.reduce((sum, value) => sum + value.inventory.selected.bytes, 0),
    mediaFilesExcluded: values.reduce((sum, value) => sum + value.inventory.mediaExcluded.files, 0),
    mediaBytesExcluded: values.reduce((sum, value) => sum + value.inventory.mediaExcluded.bytes, 0),
  };
  for (const key of Object.keys(totals)) {
    if (totals[key] !== SO101_HIL_RL_PROFILE[key]) fail("COMBINED_INVENTORY_INVALID", key);
  }
  return {
    repositories: Object.fromEntries(REPO_KEYS.map((key, index) =>
      [key, values[index].inventory])),
    totals,
    projectionHash: digest("outsider/so101-hil-rl-combined-trees/v1",
      REPO_KEYS.map((key) => repos[key].projection)),
  };
}

function validateRepositoryTreeCrossBinding(repository, tree, key) {
  const treePaths = tree.filter((entry) => entry.type === "file")
    .map((entry) => entry.path).sort((left, right) => left.localeCompare(right));
  if (treePaths.length !== repository.repositoryFilePaths
    || digest("outsider/so101-hil-rl-repository-paths/v1", treePaths)
      !== repository.repositoryPathProjectionHash) {
    fail("REPOSITORY_TREE_PATH_BINDING_INVALID", key);
  }
}

function ensurePrivateDirectory(directory) {
  if (existsSync(directory)) {
    const checked = lstatSync(directory);
    if (checked.isSymbolicLink() || !checked.isDirectory()) {
      fail("DIRECTORY_UNSAFE", directory);
    }
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
  const descriptor = openSync(file,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
      | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
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
      output[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

function apiSnapshotPath(key, kind, phase) {
  return `control/${key}-${kind}-${phase}.json`;
}

function writeApiSnapshot(root, key, kind, snapshot) {
  const localPath = apiSnapshotPath(key, kind, snapshot.phase);
  writePrivateFileOnce(safeJoin(root, localPath), snapshot.bytes);
  return { path: localPath, bytes: snapshot.bytes.length,
    contentSha256: so101HilRlSha256(snapshot.bytes), url: snapshot.url };
}

function objectDescriptor(repoKey, entry, bytes) {
  const contentSha256 = so101HilRlSha256(bytes);
  if (bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_MISMATCH", `${repoKey}:${entry.path}`);
  if (entry.lfsSha256 !== null && contentSha256 !== entry.lfsSha256) {
    fail("OBJECT_LFS_HASH_MISMATCH", `${repoKey}:${entry.path}`);
  }
  if (entry.lfsSha256 === null && gitBlobOid(bytes) !== entry.oid) {
    fail("OBJECT_GIT_HASH_MISMATCH", `${repoKey}:${entry.path}`);
  }
  return {
    repoKey,
    remotePath: entry.path,
    localPath: `${repoKey}/${entry.path}`,
    bytes: bytes.length,
    lfsSha256: entry.lfsSha256,
    gitBlobSha1: entry.oid,
    contentSha256,
  };
}

async function downloadSelected(root, repoKey, profile, entry, fetchImpl) {
  const api = apiFor(profile);
  const url = `${api.raw}/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
  const fetched = await boundedFetch(url,
    Math.min(MAX_OBJECT_BYTES, entry.sizeBytes), fetchImpl);
  const descriptor = objectDescriptor(repoKey, entry, fetched.bytes);
  writePrivateFileOnce(safeJoin(root, descriptor.localPath), fetched.bytes);
  return descriptor;
}

function compareSnapshots(before, after, label) {
  if (canonicalizeStrict(before) !== canonicalizeStrict(after)) {
    fail("SOURCE_CHANGED_DURING_ACQUISITION", label);
  }
}

function sourceRootFor(remoteObjects) {
  return digest("outsider/so101-hil-rl-source-root/v1", remoteObjects.map((item) => ({
    repoKey: item.repoKey,
    remotePath: item.remotePath,
    localPath: item.localPath,
    bytes: item.bytes,
    lfsSha256: item.lfsSha256,
    gitBlobSha1: item.gitBlobSha1,
    contentSha256: item.contentSha256,
  })));
}

function sourceManifestHash(body) {
  return digest("outsider/so101-hil-rl-source-manifest/v1", body);
}

export async function acquirePinnedSo101HilRlSource(sourceDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  const root = path.resolve(sourceDirectory);
  createPrivateRoot(root);
  try {
    const repositoryBeforeValues = await Promise.all(REPO_KEYS.map((key) =>
      fetchRepository(SO101_HIL_RL_REPOSITORIES[key], "before", fetchImpl)));
    const treeBeforeValues = await Promise.all(REPO_KEYS.map((key) =>
      fetchTree(SO101_HIL_RL_REPOSITORIES[key], "before", fetchImpl)));
    const repositoriesBefore = Object.fromEntries(repositoryBeforeValues.map((item) =>
      [item.profile.key, item]));
    const treesBefore = Object.fromEntries(treeBeforeValues.map((item) =>
      [item.profile.key, item]));
    const inventoryBefore = combinedInventory(treesBefore);
    for (const key of REPO_KEYS) {
      validateRepositoryTreeCrossBinding(repositoriesBefore[key].projection,
        treesBefore[key].projection, key);
    }
    const apiSnapshots = [];
    for (const key of REPO_KEYS) {
      apiSnapshots.push(writeApiSnapshot(root, key, "repository",
        repositoriesBefore[key]));
      apiSnapshots.push(writeApiSnapshot(root, key, "tree", treesBefore[key]));
    }
    const selected = [];
    for (const key of REPO_KEYS) {
      const profile = SO101_HIL_RL_REPOSITORIES[key];
      const selection = repoInventory(profile, treesBefore[key].projection).selected;
      selected.push(...selection.map((entry) => ({ key, profile, entry })));
    }
    selected.sort((left, right) => `${left.key}/${left.entry.path}`
      .localeCompare(`${right.key}/${right.entry.path}`));
    if (selected.length !== SO101_HIL_RL_PROFILE.selectedObjects
      || selected.reduce((sum, item) => sum + item.entry.sizeBytes, 0)
        !== SO101_HIL_RL_PROFILE.selectedBytes) fail("SELECTED_CLOSURE_INVALID");
    const remoteObjects = await mapConcurrent(selected, DOWNLOAD_CONCURRENCY,
      (item) => downloadSelected(root, item.key, item.profile, item.entry, fetchImpl));
    remoteObjects.sort((left, right) => left.localPath.localeCompare(right.localPath));

    const repositoryAfterValues = await Promise.all(REPO_KEYS.map((key) =>
      fetchRepository(SO101_HIL_RL_REPOSITORIES[key], "after", fetchImpl)));
    const treeAfterValues = await Promise.all(REPO_KEYS.map((key) =>
      fetchTree(SO101_HIL_RL_REPOSITORIES[key], "after", fetchImpl)));
    const repositoriesAfter = Object.fromEntries(repositoryAfterValues.map((item) =>
      [item.profile.key, item]));
    const treesAfter = Object.fromEntries(treeAfterValues.map((item) =>
      [item.profile.key, item]));
    const inventoryAfter = combinedInventory(treesAfter);
    for (const key of REPO_KEYS) {
      compareSnapshots(repositoriesBefore[key].projection,
        repositoriesAfter[key].projection, `${key}:repository`);
      compareSnapshots(treesBefore[key].projection,
        treesAfter[key].projection, `${key}:tree`);
      validateRepositoryTreeCrossBinding(repositoriesAfter[key].projection,
        treesAfter[key].projection, key);
      apiSnapshots.push(writeApiSnapshot(root, key, "repository",
        repositoriesAfter[key]));
      apiSnapshots.push(writeApiSnapshot(root, key, "tree", treesAfter[key]));
    }
    compareSnapshots(inventoryBefore, inventoryAfter, "combined-inventory");
    apiSnapshots.sort((left, right) => left.path.localeCompare(right.path));
    const sourceRoot = sourceRootFor(remoteObjects);
    const body = {
      schema: SO101_HIL_RL_SOURCE_SCHEMA,
      frozenAt: SO101_HIL_RL_FROZEN_AT,
      repositories: Object.fromEntries(REPO_KEYS.map((key) =>
        [key, repositoriesBefore[key].projection])),
      combinedInventory: inventoryBefore,
      sourceClosure: {
        selectedObjects: remoteObjects.length,
        selectedBytes: remoteObjects.reduce((sum, item) => sum + item.bytes, 0),
        apiSnapshots: apiSnapshots.length,
        noVideo: true,
      },
      apiSnapshots,
      remoteObjects,
      sourceRoot,
      exclusions: {
        mediaSelected: false,
        mediaFilesRecordedButNotFetched: SO101_HIL_RL_PROFILE.mediaFilesExcluded,
        mediaBytesRecordedButNotFetched: SO101_HIL_RL_PROFILE.mediaBytesExcluded,
        otherFilesRecordedButNotFetched: SO101_HIL_RL_PROFILE.otherFilesExcluded,
        otherBytesRecordedButNotFetched: SO101_HIL_RL_PROFILE.otherBytesExcluded,
      },
      rightsIntake: {
        datasetCardClaims: { hil: "MIT", rl: "MIT" },
        repositoryLicenseFilesPresent: { hil: false, rl: false },
        trainingAuthorized: false,
      },
    };
    const manifest = { ...body, manifestHash: sourceManifestHash(body) };
    writePrivateFileOnce(path.join(root, "acquisition-manifest.json"),
      canonicalBytes(manifest));
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

function parseJsonBytes(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail("SOURCE_JSON_INVALID", label); }
}

function snapshotMapFromManifest(root, manifest) {
  if (!Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 8) {
    fail("SNAPSHOT_CENSUS_INVALID");
  }
  const output = new Map();
  for (const descriptor of manifest.apiSnapshots) {
    if (!plain(descriptor) || typeof descriptor.path !== "string"
      || !descriptor.path.startsWith("control/")
      || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1
      || !HASH.test(descriptor.contentSha256 ?? "")
      || typeof descriptor.url !== "string" || output.has(descriptor.path)) {
      fail("SNAPSHOT_DESCRIPTOR_INVALID");
    }
    const matched = /^control\/(hil|rl)-(repository|tree)-(before|after)\.json$/u
      .exec(descriptor.path);
    if (!matched) fail("SNAPSHOT_PATH_INVALID", descriptor.path);
    const expectedUrl = apiFor(SO101_HIL_RL_REPOSITORIES[matched[1]])[matched[2]];
    if (descriptor.url !== expectedUrl) fail("SNAPSHOT_URL_INVALID", descriptor.path);
    const bytes = readRegularFile(safeJoin(root, descriptor.path), descriptor.bytes);
    if (so101HilRlSha256(bytes) !== descriptor.contentSha256) {
      fail("SNAPSHOT_HASH_INVALID", descriptor.path);
    }
    output.set(descriptor.path, bytes);
  }
  return output;
}

function repositoryFromSnapshot(snapshotMap, key, phase) {
  const localPath = apiSnapshotPath(key, "repository", phase);
  const bytes = snapshotMap.get(localPath);
  if (!bytes) fail("REPOSITORY_SNAPSHOT_MISSING", localPath);
  return repositoryProjection(SO101_HIL_RL_REPOSITORIES[key],
    parseJsonBytes(bytes, localPath));
}

function treeFromSnapshot(snapshotMap, key, phase) {
  const localPath = apiSnapshotPath(key, "tree", phase);
  const bytes = snapshotMap.get(localPath);
  if (!bytes) fail("TREE_SNAPSHOT_MISSING", localPath);
  return projectTree(parseJsonBytes(bytes, localPath));
}

function verifyRemoteObjects(root, manifest, trees) {
  if (!Array.isArray(manifest.remoteObjects)
    || manifest.remoteObjects.length !== SO101_HIL_RL_PROFILE.selectedObjects) {
    fail("SOURCE_OBJECT_CENSUS_INVALID");
  }
  const expected = new Map();
  for (const key of REPO_KEYS) {
    for (const entry of repoInventory(SO101_HIL_RL_REPOSITORIES[key],
      trees[key].projection).selected) expected.set(`${key}/${entry.path}`, { key, entry });
  }
  const verified = [];
  for (const descriptor of manifest.remoteObjects) {
    if (!plain(descriptor) || !REPO_KEYS.includes(descriptor.repoKey)
      || !safeRemotePath(descriptor.remotePath)
      || descriptor.localPath !== `${descriptor.repoKey}/${descriptor.remotePath}`
      || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1
      || !SHA1.test(descriptor.gitBlobSha1 ?? "")
      || (descriptor.lfsSha256 !== null && !HASH.test(descriptor.lfsSha256 ?? ""))
      || !HASH.test(descriptor.contentSha256 ?? "")) {
      fail("SOURCE_OBJECT_DESCRIPTOR_INVALID");
    }
    const expectedItem = expected.get(descriptor.localPath);
    if (!expectedItem || descriptor.bytes !== expectedItem.entry.sizeBytes
      || descriptor.gitBlobSha1 !== expectedItem.entry.oid
      || descriptor.lfsSha256 !== expectedItem.entry.lfsSha256) {
      fail("SOURCE_OBJECT_TREE_BINDING_INVALID", descriptor.localPath);
    }
    const bytes = readRegularFile(safeJoin(root, descriptor.localPath),
      descriptor.bytes);
    const rebuilt = objectDescriptor(descriptor.repoKey, expectedItem.entry, bytes);
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(descriptor)) {
      fail("SOURCE_OBJECT_CONTENT_BINDING_INVALID", descriptor.localPath);
    }
    expected.delete(descriptor.localPath);
    verified.push(rebuilt);
  }
  if (expected.size !== 0) fail("SOURCE_OBJECT_MISSING");
  verified.sort((left, right) => left.localPath.localeCompare(right.localPath));
  return verified;
}

export function verifySo101HilRlSourceDirectory(sourceDirectory) {
  try {
    const root = path.resolve(sourceDirectory);
    const checked = lstatSync(root);
    if (checked.isSymbolicLink() || !checked.isDirectory()) {
      fail("SOURCE_DIRECTORY_UNSAFE");
    }
    const manifest = parseJsonBytes(readRegularFile(
      path.join(root, "acquisition-manifest.json")), "acquisition-manifest.json");
    if (!plain(manifest) || manifest.schema !== SO101_HIL_RL_SOURCE_SCHEMA
      || manifest.frozenAt !== SO101_HIL_RL_FROZEN_AT
      || !HASH.test(manifest.manifestHash ?? "")
      || !HASH.test(manifest.sourceRoot ?? "")) fail("SOURCE_MANIFEST_INVALID");
    const { manifestHash, ...body } = manifest;
    if (sourceManifestHash(body) !== manifestHash) fail("SOURCE_MANIFEST_HASH_INVALID");
    const snapshots = snapshotMapFromManifest(root, manifest);
    const treesBefore = {};
    const treesAfter = {};
    for (const key of REPO_KEYS) {
      const repositoryBefore = repositoryFromSnapshot(snapshots, key, "before");
      const repositoryAfter = repositoryFromSnapshot(snapshots, key, "after");
      compareSnapshots(repositoryBefore, repositoryAfter, `${key}:repository`);
      compareSnapshots(repositoryBefore, manifest.repositories?.[key],
        `${key}:manifest-repository`);
      treesBefore[key] = { profile: SO101_HIL_RL_REPOSITORIES[key],
        projection: treeFromSnapshot(snapshots, key, "before") };
      treesAfter[key] = { profile: SO101_HIL_RL_REPOSITORIES[key],
        projection: treeFromSnapshot(snapshots, key, "after") };
      compareSnapshots(treesBefore[key].projection, treesAfter[key].projection,
        `${key}:tree`);
      validateRepositoryTreeCrossBinding(repositoryBefore,
        treesBefore[key].projection, key);
    }
    const inventory = combinedInventory(treesBefore);
    compareSnapshots(inventory, manifest.combinedInventory, "manifest-inventory");
    const remoteObjects = verifyRemoteObjects(root, manifest, treesBefore);
    if (sourceRootFor(remoteObjects) !== manifest.sourceRoot) fail("SOURCE_ROOT_INVALID");
    if (manifest.sourceClosure?.selectedObjects !== SO101_HIL_RL_PROFILE.selectedObjects
      || manifest.sourceClosure?.selectedBytes !== SO101_HIL_RL_PROFILE.selectedBytes
      || manifest.sourceClosure?.apiSnapshots !== 8
      || manifest.sourceClosure?.noVideo !== true
      || manifest.exclusions?.mediaSelected !== false
      || manifest.exclusions?.mediaFilesRecordedButNotFetched
        !== SO101_HIL_RL_PROFILE.mediaFilesExcluded
      || manifest.exclusions?.mediaBytesRecordedButNotFetched
        !== SO101_HIL_RL_PROFILE.mediaBytesExcluded
      || manifest.exclusions?.otherFilesRecordedButNotFetched
        !== SO101_HIL_RL_PROFILE.otherFilesExcluded
      || manifest.exclusions?.otherBytesRecordedButNotFetched
        !== SO101_HIL_RL_PROFILE.otherBytesExcluded
      || !same(manifest.rightsIntake?.datasetCardClaims, { hil: "MIT", rl: "MIT" })
      || !same(manifest.rightsIntake?.repositoryLicenseFilesPresent,
        { hil: false, rl: false })
      || manifest.rightsIntake?.trainingAuthorized !== false) {
      fail("SOURCE_BOUNDARY_INVALID");
    }
    return { ok: true, sourceDirectory: root, manifest, remoteObjects,
      verificationLevel: "TWO_PINNED_REPOSITORIES_FULL_TREES_AND_COMPLETE_NO_VIDEO_BYTES" };
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
profiles = json.loads(sys.argv[2])

def abort(code, detail=""):
    raise RuntimeError("SO101_HIL_RL_PYARROW_" + code + (":" + detail if detail else ""))

def stable_hash(domain, value):
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"),
                         ensure_ascii=False, allow_nan=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(domain.encode("utf-8") + b"\0" + encoded).hexdigest()

def load_json(relative):
    with open(os.path.join(root, relative), "r", encoding="utf-8") as handle:
        return json.load(handle)

def read_table(relative, columns=None):
    return pq.read_table(os.path.join(root, relative), columns=columns)

def values(column):
    return column.combine_chunks().to_pylist()

def vector_valid(column, width, label):
    combined = column.combine_chunks()
    if not pa.types.is_fixed_size_list(combined.type) or combined.type.list_size != width:
        abort("VECTOR_SHAPE_INVALID", label)
    if combined.type.value_type != pa.float32():
        abort("VECTOR_TYPE_INVALID", label)
    if combined.null_count or combined.values.null_count:
        abort("VECTOR_NULL_INVALID", label)
    if not pc.all(pc.is_finite(combined.values)).as_py():
        abort("VECTOR_NONFINITE", label)

def require_binary(items, label):
    if any(value not in (0, 0.0, 1, 1.0) for value in items):
        abort("BINARY_SIGNAL_INVALID", label)

def count_stats(stats, frames, key, label):
    entry = stats.get(key)
    if not isinstance(entry, dict) or entry.get("count") != [frames]:
        abort("STATS_COUNT_INVALID", label)

def profile_repo(key):
    profile = profiles[key]
    prefix = key + "/"
    info = load_json(prefix + "meta/info.json")
    stats = load_json(prefix + "meta/stats.json")
    tasks_table = read_table(prefix + "meta/tasks.parquet")
    expected_tasks_columns = ["task_index", "__index_level_0__"]
    if tasks_table.column_names != expected_tasks_columns:
        abort("TASK_COLUMNS_INVALID", key)
    if tasks_table.num_rows != profile["tasks"] or any(
            tasks_table[name].null_count for name in tasks_table.column_names):
        abort("TASK_ROWS_INVALID", key)
    task_indices = values(tasks_table["task_index"])
    task_prompts = values(tasks_table["__index_level_0__"])
    if task_indices != list(range(profile["tasks"])):
        abort("TASK_INDICES_INVALID", key)
    if len(set(task_prompts)) != len(task_prompts) or any(
            not isinstance(item, str) or not item for item in task_prompts):
        abort("TASK_PROMPTS_INVALID", key)

    if (info.get("total_episodes") != profile["episodes"] or
            info.get("total_frames") != profile["frames"] or
            info.get("total_tasks") != profile["tasks"] or
            info.get("fps") != 30 or info.get("robot_type") != "so_follower" or
            info.get("codebase_version") != "v3.0" or
            info.get("splits") != {"train": "0:" + str(profile["episodes"])}):
        abort("INFO_PROFILE_INVALID", key)
    features = info.get("features")
    if not isinstance(features, dict):
        abort("INFO_FEATURES_INVALID", key)
    base_features = [
        "action", "observation.state", "observation.images.wrist",
        "is_intervention", "timestamp", "frame_index", "episode_index",
        "index", "task_index",
    ]
    expected_features = base_features + (["next.reward", "next.done"] if key == "rl" else [])
    if sorted(features.keys()) != sorted(expected_features):
        abort("INFO_FEATURE_CENSUS_INVALID", key)
    for field in ["action", "observation.state"]:
        if features[field].get("shape") != [6] or features[field].get("dtype") != "float32":
            abort("INFO_VECTOR_INVALID", key + ":" + field)
    for field in ["is_intervention"] + (["next.reward", "next.done"] if key == "rl" else []):
        if features[field].get("shape") != [1] or features[field].get("dtype") != "float32":
            abort("INFO_SIGNAL_INVALID", key + ":" + field)
    if features["observation.images.wrist"].get("dtype") != "video":
        abort("INFO_VIDEO_INVALID", key)
    if sorted(stats.keys()) != sorted(expected_features):
        abort("STATS_CENSUS_INVALID", key)
    for field in expected_features:
        if field != "observation.images.wrist":
            count_stats(stats, profile["frames"], field, key + ":" + field)

    data_columns = [
        "action", "observation.state", "is_intervention",
    ] + (["next.reward", "next.done"] if key == "rl" else []) + [
        "timestamp", "frame_index", "episode_index", "index", "task_index",
    ]
    metadata_required = [
        "episode_index", "tasks", "length", "data/chunk_index",
        "data/file_index", "dataset_from_index", "dataset_to_index",
        "meta/episodes/chunk_index", "meta/episodes/file_index",
    ]
    cursor_episode = 0
    cursor_frame = 0
    total_interventions = 0
    episodes_with_intervention = 0
    reward_ones = 0
    done_ones = 0
    successes = 0
    failures = 0
    episode_projection = []
    shard_projection = []
    task_aggregate = {
        str(index): {"taskIndex": index, "prompt": task_prompts[index],
                     "episodes": 0, "frames": 0, "interventionFrames": 0,
                     "successes": 0, "failures": 0}
        for index in range(profile["tasks"])
    }

    for shard_index in range(profile["dataFiles"]):
        suffix = "chunk-000/file-%03d.parquet" % shard_index
        meta_relative = prefix + "meta/episodes/" + suffix
        data_relative = prefix + "data/" + suffix
        meta = read_table(meta_relative, columns=metadata_required)
        data = read_table(data_relative)
        if data.column_names != data_columns:
            abort("DATA_COLUMNS_INVALID", data_relative)
        if any(data[name].null_count for name in data.column_names):
            abort("DATA_NULL_INVALID", data_relative)
        vector_valid(data["action"], 6, data_relative + ":action")
        vector_valid(data["observation.state"], 6, data_relative + ":state")
        meta_rows = meta.to_pylist()
        if not meta_rows or sum(int(row["length"]) for row in meta_rows) != data.num_rows:
            abort("SHARD_ROW_ALIGNMENT_INVALID", data_relative)

        interventions = values(data["is_intervention"])
        require_binary(interventions, data_relative + ":is_intervention")
        frame_indices = values(data["frame_index"])
        episode_indices = values(data["episode_index"])
        global_indices = values(data["index"])
        task_values = values(data["task_index"])
        timestamps = values(data["timestamp"])
        rewards = values(data["next.reward"]) if key == "rl" else None
        dones = values(data["next.done"]) if key == "rl" else None
        if key == "rl":
            require_binary(rewards, data_relative + ":next.reward")
            require_binary(dones, data_relative + ":next.done")

        local_cursor = 0
        shard_interventions = 0
        shard_successes = 0
        for row in meta_rows:
            episode = int(row["episode_index"])
            length = int(row["length"])
            start = int(row["dataset_from_index"])
            end = int(row["dataset_to_index"])
            if (episode != cursor_episode or length <= 0 or start != cursor_frame or
                    end != cursor_frame + length or row["data/chunk_index"] != 0 or
                    row["data/file_index"] != shard_index or
                    row["meta/episodes/chunk_index"] != 0 or
                    row["meta/episodes/file_index"] != shard_index):
                abort("EPISODE_METADATA_SEQUENCE_INVALID", key + ":" + str(episode))
            stop = local_cursor + length
            if stop > data.num_rows:
                abort("EPISODE_LOCAL_RANGE_INVALID", key + ":" + str(episode))
            episode_task_values = task_values[local_cursor:stop]
            if not episode_task_values or len(set(episode_task_values)) != 1:
                abort("EPISODE_TASK_DATA_INVALID", key + ":" + str(episode))
            task_index = int(episode_task_values[0])
            if task_index < 0 or task_index >= len(task_prompts):
                abort("EPISODE_TASK_INDEX_INVALID", key + ":" + str(episode))
            if row["tasks"] != [task_prompts[task_index]]:
                abort("EPISODE_TASK_META_INVALID", key + ":" + str(episode))
            if (frame_indices[local_cursor:stop] != list(range(length)) or
                    episode_indices[local_cursor:stop] != [episode] * length or
                    global_indices[local_cursor:stop] != list(range(start, end))):
                abort("EPISODE_INDEX_ALIGNMENT_INVALID", key + ":" + str(episode))
            if any(abs(float(timestamps[local_cursor + frame]) - frame / 30.0) > 0.00004
                   for frame in range(length)):
                abort("EPISODE_TIMESTAMP_INVALID", key + ":" + str(episode))
            intervention_count = sum(int(value) for value in interventions[local_cursor:stop])
            total_interventions += intervention_count
            shard_interventions += intervention_count
            if intervention_count:
                episodes_with_intervention += 1
            outcome = None
            if key == "rl":
                episode_rewards = rewards[local_cursor:stop]
                episode_dones = dones[local_cursor:stop]
                if any(value != 0.0 for value in episode_rewards[:-1]) or any(
                        value != 0.0 for value in episode_dones[:-1]) or episode_dones[-1] != 1.0:
                    abort("RL_TERMINAL_SIGNAL_INVALID", str(episode))
                reward_ones += sum(int(value) for value in episode_rewards)
                done_ones += sum(int(value) for value in episode_dones)
                if episode_rewards[-1] == 1.0:
                    outcome = "success"
                    successes += 1
                    shard_successes += 1
                    task_aggregate[str(task_index)]["successes"] += 1
                elif episode_rewards[-1] == 0.0:
                    outcome = "failure"
                    failures += 1
                    task_aggregate[str(task_index)]["failures"] += 1
                else:
                    abort("RL_OUTCOME_INVALID", str(episode))
            task_aggregate[str(task_index)]["episodes"] += 1
            task_aggregate[str(task_index)]["frames"] += length
            task_aggregate[str(task_index)]["interventionFrames"] += intervention_count
            episode_projection.append({
                "episodeIndex": episode,
                "taskIndex": task_index,
                "length": length,
                "datasetFromIndex": start,
                "datasetToIndex": end,
                "interventionFrames": intervention_count,
                "operatorOutcome": outcome,
            })
            cursor_episode += 1
            cursor_frame += length
            local_cursor = stop
        if local_cursor != data.num_rows:
            abort("SHARD_LOCAL_TOTAL_INVALID", data_relative)
        shard_projection.append({
            "fileIndex": shard_index,
            "episodes": len(meta_rows),
            "frames": data.num_rows,
            "firstEpisodeIndex": int(meta_rows[0]["episode_index"]),
            "lastEpisodeIndex": int(meta_rows[-1]["episode_index"]),
            "interventionFrames": shard_interventions,
            "successes": shard_successes if key == "rl" else None,
        })

    if cursor_episode != profile["episodes"] or cursor_frame != profile["frames"]:
        abort("REPOSITORY_TOTAL_INVALID", key)
    if key == "rl" and (successes != profile["successfulEpisodes"] or
                         failures != profile["failedEpisodes"] or
                         reward_ones != successes or done_ones != profile["episodes"]):
        abort("RL_OUTCOME_TOTAL_INVALID")

    return {
        "repoKey": key,
        "dataFilesReplayed": profile["dataFiles"],
        "episodeMetadataFilesReplayed": profile["dataFiles"],
        "fixedMetadataFilesReplayed": 3,
        "episodesReplayed": cursor_episode,
        "framesReplayed": cursor_frame,
        "taskCount": len(task_prompts),
        "tasks": [{"taskIndex": index, "prompt": prompt}
                  for index, prompt in enumerate(task_prompts)],
        "dataColumns": data_columns,
        "actionDimensions": 6,
        "stateDimensions": 6,
        "interventionFrames": total_interventions,
        "episodesWithIntervention": episodes_with_intervention,
        "successfulEpisodes": successes if key == "rl" else None,
        "failedEpisodes": failures if key == "rl" else None,
        "rewardOneFrames": reward_ones if key == "rl" else None,
        "doneOneFrames": done_ones if key == "rl" else None,
        "episodeIndexContinuous": True,
        "frameIndexContinuousWithinEpisode": True,
        "globalIndexContinuous": True,
        "timestampCadenceAligned30Fps": True,
        "episodeMetadataAligned": True,
        "taskMetadataAligned": True,
        "infoMetadataAligned": True,
        "statsNonVisualFrameCountsAligned": True,
        "episodeProjectionHash": stable_hash(
            "outsider/so101-hil-rl-" + key + "-episodes/v1", episode_projection),
        "shards": shard_projection,
        "taskAggregates": [task_aggregate[str(index)] for index in range(len(task_prompts))],
    }

hil = profile_repo("hil")
rl = profile_repo("rl")
if rl["tasks"] != [
        {"taskIndex": 0, "prompt": "Pick a pen."},
        {"taskIndex": 1, "prompt": "Pick Chikawa toy."},
    ]:
    abort("RL_TASK_PROMPTS_UNEXPECTED")
if hil["tasks"][25] != {"taskIndex": 25, "prompt": "Pick a pen."} or hil["tasks"][0] != {
        "taskIndex": 0, "prompt": "Pick Chikawa toy."}:
    abort("HIL_TASK_PROMPTS_UNEXPECTED")

crosswalk = [
    {"rlTaskIndex": 0, "rlPrompt": "Pick a pen.",
     "hilTaskIndex": 25, "hilPrompt": "Pick a pen.", "match": "EXACT_PROMPT"},
    {"rlTaskIndex": 1, "rlPrompt": "Pick Chikawa toy.",
     "hilTaskIndex": 0, "hilPrompt": "Pick Chikawa toy.", "match": "EXACT_PROMPT"},
]

output = {
    "pyarrowVersion": pa.__version__,
    "repositories": {"hil": hil, "rl": rl},
    "combined": {
        "dataFilesReplayed": hil["dataFilesReplayed"] + rl["dataFilesReplayed"],
        "metadataFilesReplayed": (hil["episodeMetadataFilesReplayed"] +
                                    rl["episodeMetadataFilesReplayed"] + 6),
        "episodesReplayed": hil["episodesReplayed"] + rl["episodesReplayed"],
        "framesReplayed": hil["framesReplayed"] + rl["framesReplayed"],
        "interventionFrames": hil["interventionFrames"] + rl["interventionFrames"],
    },
    "taskCrosswalk": crosswalk,
    "visualReplay": False,
    "publisherOutcomeIndependent": False,
    "longitudinalOutcomeAvailable": False,
}
print(json.dumps(output, sort_keys=True, separators=(",", ":"), allow_nan=False))
`;

function replayProfiles() {
  return Object.fromEntries(REPO_KEYS.map((key) => [key, {
    episodes: SO101_HIL_RL_REPOSITORIES[key].episodes,
    frames: SO101_HIL_RL_REPOSITORIES[key].frames,
    tasks: SO101_HIL_RL_REPOSITORIES[key].tasks,
    dataFiles: SO101_HIL_RL_REPOSITORIES[key].dataFiles,
    successfulEpisodes: SO101_HIL_RL_REPOSITORIES[key].successfulEpisodes ?? null,
    failedEpisodes: SO101_HIL_RL_REPOSITORIES[key].failedEpisodes ?? null,
  }]));
}

export function runSo101HilRlPyarrowReplay(sourceDirectory,
  pythonExecutable = ".venv/bin/python") {
  if (typeof pythonExecutable !== "string" || pythonExecutable.length < 1) {
    fail("PYTHON_EXECUTABLE_INVALID");
  }
  const executed = spawnSync(pythonExecutable, ["-c", PYARROW_REPLAY,
    path.resolve(sourceDirectory), JSON.stringify(replayProfiles())], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 600_000,
    env: { ...process.env, PYTHONHASHSEED: "0" },
  });
  if (executed.error) fail("PYARROW_EXEC_FAILED", executed.error.message);
  if (executed.status !== 0) {
    fail("PYARROW_REPLAY_FAILED", String(executed.stderr || executed.stdout).trim());
  }
  const replay = parseJsonBytes(Buffer.from(executed.stdout, "utf8"), "PYARROW_REPLAY");
  if (!plain(replay)
    || replay.repositories?.hil?.dataFilesReplayed !== 49
    || replay.repositories?.hil?.episodesReplayed !== 563
    || replay.repositories?.hil?.framesReplayed !== 164_795
    || replay.repositories?.rl?.dataFilesReplayed !== 12
    || replay.repositories?.rl?.episodesReplayed !== 101
    || replay.repositories?.rl?.framesReplayed !== 46_016
    || replay.repositories?.rl?.successfulEpisodes !== 49
    || replay.repositories?.rl?.failedEpisodes !== 52
    || replay.repositories?.rl?.doneOneFrames !== 101
    || replay.repositories?.rl?.rewardOneFrames !== 49
    || replay.combined?.dataFilesReplayed !== 61
    || replay.combined?.metadataFilesReplayed !== 67
    || replay.combined?.episodesReplayed !== 664
    || replay.combined?.framesReplayed !== 210_811
    || replay.taskCrosswalk?.length !== 2
    || replay.visualReplay !== false
    || replay.publisherOutcomeIndependent !== false
    || replay.longitudinalOutcomeAvailable !== false) {
    fail("PYARROW_RESULT_INVALID");
  }
  return replay;
}

function inspectReadmes(sourceDirectory) {
  const hil = readRegularFile(path.join(sourceDirectory, "hil", "README.md"),
    SO101_HIL_RL_REPOSITORIES.hil.readmeBytes).toString("utf8");
  const rl = readRegularFile(path.join(sourceDirectory, "rl", "README.md"),
    SO101_HIL_RL_REPOSITORIES.rl.readmeBytes).toString("utf8");
  const requiredHil = ["license: mit", "Number of episodes | 51",
    "`is_intervention = 1`", "Save current episode as success",
    "Discard and re-record", "act_so101_pick_diverse_objects"];
  const requiredRl = ["license: mit", "so101_pick_diverse_objects_hil_round1",
    "act_so101_pick_diverse_objects", "Save current episode as **success**",
    "Save current episode as **failure**", "Discard and re-record",
    "`next.reward` and `next.done`"];
  for (const claim of requiredHil) {
    if (!hil.includes(claim)) fail("HIL_README_CLAIM_MISSING", claim);
  }
  for (const claim of requiredRl) {
    if (!rl.includes(claim)) fail("RL_README_CLAIM_MISSING", claim);
  }
  return {
    datasetCardLicenseClaims: { hil: "MIT", rl: "MIT" },
    repositoryLicenseFilesPresent: { hil: false, rl: false },
    hilCardEpisodeCountClaim: 51,
    hilPinnedMetadataEpisodeCount: 563,
    hilCardEpisodeClaimStaleAgainstPinnedMetadata: true,
    hilSaveSuccessAndDiscardControlsPublisherDeclared: true,
    rlSaveSuccessFailureAndDiscardControlsPublisherDeclared: true,
    rlSeedHilDatasetPublisherDeclared: SO101_HIL_RL_REPOSITORIES.hil.datasetId,
    rlPolicyPublisherDeclared: "TakuyaHiraoka/act_so101_pick_diverse_objects",
    linkedPolicyBytesAcquired: false,
    linkedPolicyHashVerified: false,
  };
}

export function so101HilRlArtifactHash(body) {
  return digest("outsider/so101-hil-rl-linked-lineage/v1", body);
}

function lineageBody(verifiedSource, replay, readme) {
  return {
    schema: SO101_HIL_RL_LINEAGE_SCHEMA,
    frozenAt: SO101_HIL_RL_FROZEN_AT,
    admission: "ACQUIRED_EVAL_ONLY",
    status: "PINNED_LINKED_SO101_HIL_RL_COMPLETE_NO_VIDEO_REPLAY",
    repositories: Object.fromEntries(REPO_KEYS.map((key) => [key, {
      datasetId: SO101_HIL_RL_REPOSITORIES[key].datasetId,
      revision: SO101_HIL_RL_REPOSITORIES[key].revision,
    }])),
    sourceManifestHash: verifiedSource.manifest.manifestHash,
    sourceRoot: verifiedSource.manifest.sourceRoot,
    sourceVerificationLevel: verifiedSource.verificationLevel,
    sourceClosure: verifiedSource.manifest.sourceClosure,
    combinedInventory: verifiedSource.manifest.combinedInventory,
    replay,
    readme,
    lineage: {
      hilToRlPublisherDeclared: true,
      exactPromptTaskCrosswalkVerifiedFromPinnedParquet: replay.taskCrosswalk,
      sharedSixDimensionalStateActionSchemaVerified: true,
      linkedPolicyBytesAcquired: false,
      linkedPolicyHashVerified: false,
      cryptographicModelLineageEstablished: false,
      episodeLevelHilToRlCrosswalkAvailable: false,
    },
    outcome: {
      hilOutcomeColumnAvailable: false,
      hilPublisherNarrativeSaysSavedEpisodesAreSuccesses: true,
      hilNarrativePromotedToByteLevelOutcome: false,
      rlPublisherSourceNativeOperatorOutcomeAvailable: true,
      rlSuccessfulEpisodes: 49,
      rlFailedEpisodes: 52,
      rlOutcomeMechanism: "OPERATOR_LABEL_ENCODED_AS_TERMINAL_NEXT_REWARD_AND_DONE",
      independentOutcome: 0,
      longitudinalOutcome: 0,
    },
    recovery: {
      perFrameInterventionAvailable: true,
      interventionFrames: replay.combined.interventionFrames,
      pairedFailureToRetryRecoveryAvailable: false,
      discardedAttemptsAvailable: false,
      completeAttemptCensus: false,
      savedOnlySelectionBias: true,
    },
    completeness: {
      bothPinnedRepositoryRecordsAndFullTreesCapturedBeforeAndAfter: true,
      allDataAndMetadataObjectsAcquiredAndReplayed: true,
      allSavedEpisodesReplayed: true,
      visualObjectsAcquired: false,
      visualReplay: false,
      savedEpisodeCensusCompleteWithinPinnedBytes: true,
      collectionAttemptCensusComplete: false,
      discardedAttemptsUnknown: true,
    },
    rights: {
      datasetCardClaims: { hil: "MIT", rl: "MIT" },
      pinnedReadmeClaims: { hil: "MIT", rl: "MIT" },
      repositoryLicenseFilesPresent: { hil: false, rl: false },
      productionTrainingRightFinallyAdjudicated: false,
    },
    boundary: {
      training: 0,
      network: 0,
      CEU: 0,
      authority: 0,
      action: 0,
      opportunity: 0,
      delegation: 0,
      independentOutcome: 0,
      longitudinalOutcome: 0,
    },
  };
}

export function buildSo101HilRlLineageFromSource(sourceDirectory, options = {}) {
  const verified = verifySo101HilRlSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const readme = inspectReadmes(verified.sourceDirectory);
  const replay = runSo101HilRlPyarrowReplay(verified.sourceDirectory,
    options.pythonExecutable ?? ".venv/bin/python");
  const body = lineageBody(verified, replay, readme);
  return { ...body, artifactHash: so101HilRlArtifactHash(body) };
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function zeroBoundary(boundary) {
  return plain(boundary) && ["training", "network", "CEU", "authority", "action",
    "opportunity", "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => boundary[key] === 0);
}

export function verifySo101HilRlLineageArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== SO101_HIL_RL_LINEAGE_SCHEMA
      || artifact.frozenAt !== SO101_HIL_RL_FROZEN_AT
      || artifact.admission !== "ACQUIRED_EVAL_ONLY"
      || artifact.status !== "PINNED_LINKED_SO101_HIL_RL_COMPLETE_NO_VIDEO_REPLAY"
      || !HASH.test(artifact.artifactHash ?? "")
      || !HASH.test(artifact.sourceManifestHash ?? "")
      || !HASH.test(artifact.sourceRoot ?? "")) fail("ARTIFACT_INVALID");
    const { artifactHash, ...body } = artifact;
    if (so101HilRlArtifactHash(body) !== artifactHash) fail("ARTIFACT_HASH_INVALID");
    if (!same(artifact.repositories, Object.fromEntries(REPO_KEYS.map((key) => [key, {
      datasetId: SO101_HIL_RL_REPOSITORIES[key].datasetId,
      revision: SO101_HIL_RL_REPOSITORIES[key].revision,
    }])))) fail("REPOSITORY_PIN_INVALID");
    if (!zeroBoundary(artifact.boundary)) fail("BOUNDARY_PROMOTION_REFUSED");
    if (!same(artifact.rights, {
      datasetCardClaims: { hil: "MIT", rl: "MIT" },
      pinnedReadmeClaims: { hil: "MIT", rl: "MIT" },
      repositoryLicenseFilesPresent: { hil: false, rl: false },
      productionTrainingRightFinallyAdjudicated: false,
    })) fail("RIGHTS_PROMOTION_REFUSED");
    if (artifact.completeness?.allDataAndMetadataObjectsAcquiredAndReplayed !== true
      || artifact.completeness?.allSavedEpisodesReplayed !== true
      || artifact.completeness?.visualObjectsAcquired !== false
      || artifact.completeness?.visualReplay !== false
      || artifact.completeness?.savedEpisodeCensusCompleteWithinPinnedBytes !== true
      || artifact.completeness?.collectionAttemptCensusComplete !== false
      || artifact.completeness?.discardedAttemptsUnknown !== true) {
      fail("COMPLETENESS_PROMOTION_REFUSED");
    }
    if (artifact.lineage?.hilToRlPublisherDeclared !== true
      || artifact.lineage?.sharedSixDimensionalStateActionSchemaVerified !== true
      || artifact.lineage?.linkedPolicyBytesAcquired !== false
      || artifact.lineage?.linkedPolicyHashVerified !== false
      || artifact.lineage?.cryptographicModelLineageEstablished !== false
      || artifact.lineage?.episodeLevelHilToRlCrosswalkAvailable !== false
      || !same(artifact.lineage?.exactPromptTaskCrosswalkVerifiedFromPinnedParquet,
        EXPECTED_TASK_CROSSWALK)
      || !same(artifact.replay?.taskCrosswalk, EXPECTED_TASK_CROSSWALK)) {
      fail("LINEAGE_PROMOTION_REFUSED");
    }
    if (artifact.outcome?.hilOutcomeColumnAvailable !== false
      || artifact.outcome?.hilNarrativePromotedToByteLevelOutcome !== false
      || artifact.outcome?.rlPublisherSourceNativeOperatorOutcomeAvailable !== true
      || artifact.outcome?.rlSuccessfulEpisodes !== 49
      || artifact.outcome?.rlFailedEpisodes !== 52
      || artifact.outcome?.independentOutcome !== 0
      || artifact.outcome?.longitudinalOutcome !== 0
      || artifact.recovery?.perFrameInterventionAvailable !== true
      || artifact.recovery?.pairedFailureToRetryRecoveryAvailable !== false
      || artifact.recovery?.discardedAttemptsAvailable !== false
      || artifact.recovery?.completeAttemptCensus !== false
      || artifact.recovery?.savedOnlySelectionBias !== true
      || artifact.recovery?.interventionFrames !== 78_986) {
      fail("OUTCOME_OR_RECOVERY_PROMOTION_REFUSED");
    }
    if (artifact.sourceClosure?.selectedObjects !== 130
      || artifact.sourceClosure?.selectedBytes !== 18_850_185
      || artifact.sourceClosure?.apiSnapshots !== 8
      || artifact.sourceClosure?.noVideo !== true
      || artifact.replay?.repositories?.hil?.episodesReplayed !== 563
      || artifact.replay?.repositories?.hil?.framesReplayed !== 164_795
      || artifact.replay?.repositories?.hil?.interventionFrames !== 77_888
      || artifact.replay?.repositories?.hil?.episodesWithIntervention !== 475
      || artifact.replay?.repositories?.hil?.episodeProjectionHash
        !== "sha256:2be6668ad8ecd8e216618b330c594924114534411f393121b0048ddf1c766819"
      || artifact.replay?.repositories?.rl?.episodesReplayed !== 101
      || artifact.replay?.repositories?.rl?.framesReplayed !== 46_016
      || artifact.replay?.repositories?.rl?.interventionFrames !== 1_098
      || artifact.replay?.repositories?.rl?.episodesWithIntervention !== 5
      || artifact.replay?.repositories?.rl?.episodeProjectionHash
        !== "sha256:1b4c999bc221c5a05d8a12691fe9bdd50ed423d78f6583d344217913697f1cda"
      || artifact.replay?.repositories?.rl?.successfulEpisodes !== 49
      || artifact.replay?.repositories?.rl?.failedEpisodes !== 52
      || artifact.replay?.combined?.episodesReplayed !== 664
      || artifact.replay?.combined?.framesReplayed !== 210_811
      || artifact.replay?.combined?.interventionFrames !== 78_986
      || artifact.replay?.visualReplay !== false) fail("ARTIFACT_PROFILE_INVALID");
    if (!same(artifact.readme, {
      datasetCardLicenseClaims: { hil: "MIT", rl: "MIT" },
      repositoryLicenseFilesPresent: { hil: false, rl: false },
      hilCardEpisodeCountClaim: 51,
      hilPinnedMetadataEpisodeCount: 563,
      hilCardEpisodeClaimStaleAgainstPinnedMetadata: true,
      hilSaveSuccessAndDiscardControlsPublisherDeclared: true,
      rlSaveSuccessFailureAndDiscardControlsPublisherDeclared: true,
      rlSeedHilDatasetPublisherDeclared:
        "TakuyaHiraoka/so101_pick_diverse_objects_hil_round1",
      rlPolicyPublisherDeclared: "TakuyaHiraoka/act_so101_pick_diverse_objects",
      linkedPolicyBytesAcquired: false,
      linkedPolicyHashVerified: false,
    })) fail("README_FINDINGS_INVALID");
    return { ok: true, artifactHash,
      verificationLevel: "STANDALONE_HASH_AND_FAIL_CLOSED_LINEAGE_SEMANTICS" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifySo101HilRlLineageArtifactWithSource(artifact,
  sourceDirectory, options = {}) {
  try {
    const standalone = verifySo101HilRlLineageArtifact(artifact);
    if (!standalone.ok) fail("STANDALONE_ARTIFACT_FAILED", standalone.error);
    const rebuilt = buildSo101HilRlLineageFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_BOUND_ARTIFACT_MISMATCH");
    return {
      ok: true,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.sourceManifestHash,
      sourceRoot: artifact.sourceRoot,
      verificationLevel: "FULL_TWO_REPOSITORY_PINNED_BYTE_AND_PYARROW_REPLAY",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
