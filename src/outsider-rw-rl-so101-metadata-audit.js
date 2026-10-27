/*
 * Pinned, metadata-first RW-RL SO101 intake.
 *
 * The intake inventories every SO101 task, retains every SO101 metadata
 * object, replays the smallest complete no-video task, and byte-probes one
 * complete data episode from each other SO101 task.  It does not fetch video,
 * infer intervention/reward/done/data-regime fields, grant training rights,
 * establish an outcome, use the network as evidence, or dispatch an action.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "./canonical-historical-replay.js";

export const RW_RL_DATASET_ID = "MINT-SJTU/RW-RL-Dataset";
export const RW_RL_REVISION = "f64b5e765883a12d6e4c3386ddc06c86b67509d9";
export const RW_RL_SO101_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const RW_RL_SO101_SOURCE_SCHEMA =
  "outsider/rw-rl-so101-pinned-source/v1";
export const RW_RL_SO101_AUDIT_SCHEMA =
  "outsider/rw-rl-so101-metadata-audit/v1";

export const RW_RL_SO101_TASKS = Object.freeze([
  "so101_fold_clothes_left_stack_right",
  "so101_insert_spray_pump_bottle_neck",
  "so101_plug_power_cord_socket",
  "so101_put_chopsticks_cups_storage_bucket",
  "so101_put_stationery_table_into_bag",
  "so101_return_tangram_pieces_original_state",
]);

export const RW_RL_SO101_COMPLETE_TASK = RW_RL_SO101_TASKS[0];

export const RW_RL_SO101_TASK_PROFILE = Object.freeze({
  so101_fold_clothes_left_stack_right: Object.freeze({
    pages: 2, entries: 1_812, files: 1_800, bytes: 94_014_768_140,
    episodes: 449, dataFiles: 449, dataBytes: 208_479_584,
    metaFiles: 4, metaBytes: 1_011_421,
    videoFiles: 1_347, videoBytes: 93_805_277_135,
  }),
  so101_insert_spray_pump_bottle_neck: Object.freeze({
    pages: 4, entries: 3_184, files: 3_172, bytes: 69_385_039_702,
    episodes: 792, dataFiles: 792, dataBytes: 185_341_627,
    metaFiles: 4, metaBytes: 1_568_356,
    videoFiles: 2_376, videoBytes: 69_198_129_719,
  }),
  so101_plug_power_cord_socket: Object.freeze({
    pages: 3, entries: 2_128, files: 2_116, bytes: 57_883_596_175,
    episodes: 528, dataFiles: 528, dataBytes: 129_081_351,
    metaFiles: 4, metaBytes: 1_119_583,
    videoFiles: 1_584, videoBytes: 57_753_395_241,
  }),
  so101_put_chopsticks_cups_storage_bucket: Object.freeze({
    pages: 3, entries: 2_324, files: 2_312, bytes: 53_856_140_503,
    episodes: 577, dataFiles: 577, dataBytes: 113_568_654,
    metaFiles: 4, metaBytes: 1_282_022,
    videoFiles: 1_731, videoBytes: 53_741_289_827,
  }),
  so101_put_stationery_table_into_bag: Object.freeze({
    pages: 5, entries: 4_664, files: 4_648, bytes: 74_600_949_497,
    episodes: 1_161, dataFiles: 1_161, dataBytes: 143_715_997,
    metaFiles: 4, metaBytes: 2_543_438,
    videoFiles: 3_483, videoBytes: 74_454_690_062,
  }),
  so101_return_tangram_pieces_original_state: Object.freeze({
    pages: 4, entries: 3_788, files: 3_776, bytes: 48_273_919_552,
    episodes: 943, dataFiles: 943, dataBytes: 120_845_483,
    metaFiles: 4, metaBytes: 2_005_828,
    videoFiles: 2_829, videoBytes: 48_151_068_241,
  }),
});

export const RW_RL_SO101_PROFILE = Object.freeze({
  repositoryUsedStorageBytes: 2_165_418_040_578,
  repositoryFilePaths: 99_622,
  taskCount: 6,
  treeEntries: 17_900,
  treeFiles: 17_824,
  treeBytes: 398_014_413_569,
  episodes: 4_450,
  dataFiles: 4_450,
  dataBytes: 901_032_696,
  metadataFiles: 24,
  metadataBytes: 9_530_648,
  videoFiles: 13_350,
  videoBytes: 397_103_850_225,
  completeTaskDataFiles: 449,
  completeTaskDataBytes: 208_479_584,
  completeTaskEpisodes: 449,
  completeTaskFrames: 5_085_540,
  crossTaskSchemaProbeFiles: 5,
  crossTaskSchemaProbeBytes: 1_107_520,
  readmeFiles: 1,
  readmeBytes: 16_908,
  selectedObjects: 479,
  selectedBytes: 219_134_660,
  actionDimensions: 12,
  stateDimensions: 12,
});

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${RW_RL_DATASET_ID}`;
const REPOSITORY_API = `${HF_API}/revision/${RW_RL_REVISION}`;
const TREE_ROOT = `${HF_API}/tree/${RW_RL_REVISION}`;
const RAW_ROOT = `${HF_ORIGIN}/datasets/${RW_RL_DATASET_ID}/resolve/${RW_RL_REVISION}`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const DATA_PATH = /\/data\/chunk-[0-9]{3}\/file-[0-9]{3}\.parquet$/u;
const META_PATH = /\/meta\/(?:info\.json|stats\.json|tasks\.parquet|episodes\/chunk-000\/file-000\.parquet)$/u;
const VIDEO_PATH = /\/videos\/[^/]+\/chunk-[0-9]{3}\/file-[0-9]{3}\.mp4$/u;
const EXPECTED_DATA_COLUMNS = Object.freeze([
  "action", "observation.state", "timestamp", "frame_index",
  "episode_index", "index", "task_index",
]);
const SIGNAL_PATTERN = /(?:^|[\/_.-])(reward|done|success|outcome|intervention|data[_.-]?regime|regime)(?:$|[\/_.-])/iu;
const MAX_API_BYTES = 8 * 1024 * 1024;
const MAX_REPOSITORY_API_BYTES = 16 * 1024 * 1024;
const MAX_OBJECT_BYTES = 4 * 1024 * 1024;
const MAX_TREE_PAGES_PER_TASK = 8;
const DOWNLOAD_CONCURRENCY = 8;

function fail(code, detail = null) {
  throw new Error(detail == null ? `RW_RL_SO101_${code}`
    : `RW_RL_SO101_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function rwRlSo101Sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return rwRlSo101Sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
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

function repositoryProjection(metadata) {
  if (!plain(metadata) || metadata.id !== RW_RL_DATASET_ID
    || metadata.sha !== RW_RL_REVISION || metadata.private !== false
    || metadata.gated !== false || metadata.disabled !== false
    || metadata.usedStorage !== RW_RL_SO101_PROFILE.repositoryUsedStorageBytes) {
    fail("REPOSITORY_METADATA_INVALID");
  }
  if (Object.hasOwn(metadata.cardData ?? {}, "license")) {
    fail("UNEXPECTED_DATASET_CARD_LICENSE");
  }
  if (!Array.isArray(metadata.siblings)
    || metadata.siblings.length !== RW_RL_SO101_PROFILE.repositoryFilePaths) {
    fail("REPOSITORY_FILE_CENSUS_INVALID");
  }
  const repositoryPaths = metadata.siblings.map((entry) => entry?.rfilename)
    .sort((left, right) => String(left).localeCompare(String(right)));
  if (repositoryPaths.some((entry) => !safeRemotePath(entry))) {
    fail("REPOSITORY_FILE_PATH_INVALID");
  }
  if (new Set(repositoryPaths).size !== repositoryPaths.length) {
    fail("REPOSITORY_FILE_PATH_DUPLICATE");
  }
  const licensePath = repositoryPaths.find((entry) =>
    /(?:^|\/)(?:license|copying)(?:\.[^/]*)?$/iu.test(entry));
  if (licensePath) fail("UNEXPECTED_DATASET_LICENSE_FILE", licensePath);
  return {
    datasetId: RW_RL_DATASET_ID,
    revision: RW_RL_REVISION,
    private: false,
    gated: false,
    disabled: false,
    usedStorageBytes: metadata.usedStorage,
    repositoryFilePaths: repositoryPaths.length,
    repositoryPathProjectionHash: digest(
      "outsider/rw-rl-repository-paths/v1", repositoryPaths),
    datasetCardLicenseDeclared: false,
    datasetRepositoryLicenseFilePresent: false,
    lastModified: typeof metadata.lastModified === "string" ? metadata.lastModified : null,
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
      "user-agent": "outsider-rw-rl-so101-metadata-audit/1.0",
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
    || /^RW_RL_SO101_FETCH_(?:FAILED|408|425|429|5[0-9]{2})(?::|$)/u.test(message);
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

function parseNextTreeLink(header, task) {
  if (header == null || header === "") return null;
  const next = String(header).split(",")
    .find((piece) => /;\s*rel="next"\s*$/iu.test(piece.trim()));
  if (!next) return null;
  const matched = /^\s*<([^>]+)>/u.exec(next);
  if (!matched) fail("TREE_NEXT_LINK_INVALID", task);
  const parsed = new URL(matched[1]);
  if (parsed.origin !== HF_ORIGIN
    || parsed.pathname !== `${new URL(TREE_ROOT).pathname}/${task}`
    || parsed.searchParams.get("recursive") !== "true"
    || parsed.searchParams.get("expand") !== "false"
    || parsed.searchParams.get("limit") !== "1000"
    || !parsed.searchParams.get("cursor")) fail("TREE_NEXT_LINK_UNSAFE", task);
  return parsed.toString();
}

async function fetchRepositorySnapshot(phase, fetchImpl) {
  const fetched = await jsonFetch(REPOSITORY_API, MAX_REPOSITORY_API_BYTES,
    fetchImpl);
  return { phase, url: REPOSITORY_API, bytes: fetched.bytes,
    projection: repositoryProjection(fetched.value) };
}

async function fetchRootTreeSnapshot(phase, fetchImpl) {
  const url = `${TREE_ROOT}?recursive=false&expand=false&limit=1000`;
  const fetched = await jsonFetch(url, MAX_API_BYTES, fetchImpl);
  if (!Array.isArray(fetched.value) || fetched.headers?.get?.("link")) {
    fail("ROOT_TREE_INVALID");
  }
  return { phase, url, bytes: fetched.bytes,
    projection: projectTree(fetched.value) };
}

async function fetchTaskTreeSnapshot(task, phase, fetchImpl) {
  const pages = [];
  const entries = [];
  const seen = new Set();
  let next = `${TREE_ROOT}/${task}?recursive=true&expand=false&limit=1000`;
  while (next !== null) {
    if (seen.has(next) || pages.length >= MAX_TREE_PAGES_PER_TASK) {
      fail("TREE_PAGINATION_INVALID", task);
    }
    seen.add(next);
    const fetched = await jsonFetch(next, MAX_API_BYTES, fetchImpl);
    if (!Array.isArray(fetched.value) || fetched.value.length < 1
      || fetched.value.length > 1_000) fail("TREE_PAGE_INVALID", task);
    pages.push({ task, phase, pageIndex: pages.length, url: next,
      bytes: fetched.bytes });
    entries.push(...fetched.value);
    next = parseNextTreeLink(fetched.headers?.get?.("link"), task);
  }
  return { task, phase, pages, projection: projectTree(entries) };
}

async function fetchAllTaskTrees(phase, fetchImpl) {
  const values = await Promise.all(RW_RL_SO101_TASKS.map((task) =>
    fetchTaskTreeSnapshot(task, phase, fetchImpl)));
  return Object.fromEntries(values.map((value) => [value.task, value]));
}

function classifyTaskFile(task, remotePath) {
  if (!remotePath.startsWith(`${task}/`)) fail("TREE_PATH_OUTSIDE_TASK", remotePath);
  if (DATA_PATH.test(remotePath)) return "data";
  if (META_PATH.test(remotePath)) return "meta";
  if (VIDEO_PATH.test(remotePath)) return "videos";
  fail("TREE_FILE_UNCLASSIFIED", remotePath);
}

function taskInventory(task, tree) {
  const profile = RW_RL_SO101_TASK_PROFILE[task];
  const files = tree.projection.filter((entry) => entry.type === "file");
  const groups = {
    data: { files: 0, bytes: 0 },
    meta: { files: 0, bytes: 0 },
    videos: { files: 0, bytes: 0 },
  };
  for (const entry of files) {
    const group = groups[classifyTaskFile(task, entry.path)];
    group.files += 1;
    group.bytes += entry.sizeBytes;
  }
  const inventory = {
    task,
    pages: tree.pages.length,
    entries: tree.projection.length,
    files: files.length,
    bytes: files.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    data: groups.data,
    meta: groups.meta,
    videos: groups.videos,
    projectionHash: digest("outsider/rw-rl-so101-task-tree/v1", tree.projection),
  };
  const expected = {
    pages: profile.pages, entries: profile.entries, files: profile.files,
    bytes: profile.bytes,
    data: { files: profile.dataFiles, bytes: profile.dataBytes },
    meta: { files: profile.metaFiles, bytes: profile.metaBytes },
    videos: { files: profile.videoFiles, bytes: profile.videoBytes },
  };
  for (const key of ["pages", "entries", "files", "bytes"]) {
    if (inventory[key] !== expected[key]) fail("TASK_INVENTORY_MISMATCH", `${task}:${key}`);
  }
  for (const group of ["data", "meta", "videos"]) {
    if (inventory[group].files !== expected[group].files
      || inventory[group].bytes !== expected[group].bytes) {
      fail("TASK_GROUP_MISMATCH", `${task}:${group}`);
    }
  }
  const expectedMeta = new Set([
    `${task}/meta/info.json`, `${task}/meta/stats.json`,
    `${task}/meta/tasks.parquet`,
    `${task}/meta/episodes/chunk-000/file-000.parquet`,
  ]);
  const actualMeta = files.filter((entry) => META_PATH.test(entry.path));
  if (actualMeta.length !== expectedMeta.size
    || actualMeta.some((entry) => !expectedMeta.has(entry.path))) {
    fail("TASK_META_CLOSURE_INVALID", task);
  }
  const data = files.filter((entry) => DATA_PATH.test(entry.path));
  const expectedData = Array.from({ length: profile.dataFiles }, (_, index) => {
    const chunk = Math.floor(index / 1_000);
    const file = index % 1_000;
    return `${task}/data/chunk-${String(chunk).padStart(3, "0")}/file-${String(file).padStart(3, "0")}.parquet`;
  });
  if (data.length !== expectedData.length
    || data.some((entry, index) => entry.path !== expectedData[index])) {
    fail("TASK_DATA_CENSUS_INVALID", task);
  }
  return inventory;
}

function validateRootTree(rootProjection) {
  const byPath = new Map(rootProjection.map((entry) => [entry.path, entry]));
  for (const task of RW_RL_SO101_TASKS) {
    if (byPath.get(task)?.type !== "directory") fail("ROOT_TASK_MISSING", task);
  }
  const readme = byPath.get("README.md");
  if (readme?.type !== "file" || readme.sizeBytes !== RW_RL_SO101_PROFILE.readmeBytes) {
    fail("ROOT_README_INVALID");
  }
  const license = rootProjection.find((entry) => entry.type === "file"
    && /^(?:license|copying)(?:\.[^/]*)?$/iu.test(entry.path));
  if (license) fail("UNEXPECTED_DATASET_LICENSE_FILE", license.path);
  return readme;
}

function allTaskInventory(taskTrees) {
  const tasks = RW_RL_SO101_TASKS.map((task) => taskInventory(task, taskTrees[task]));
  const totals = {
    entries: tasks.reduce((sum, item) => sum + item.entries, 0),
    files: tasks.reduce((sum, item) => sum + item.files, 0),
    bytes: tasks.reduce((sum, item) => sum + item.bytes, 0),
    dataFiles: tasks.reduce((sum, item) => sum + item.data.files, 0),
    dataBytes: tasks.reduce((sum, item) => sum + item.data.bytes, 0),
    metadataFiles: tasks.reduce((sum, item) => sum + item.meta.files, 0),
    metadataBytes: tasks.reduce((sum, item) => sum + item.meta.bytes, 0),
    videoFiles: tasks.reduce((sum, item) => sum + item.videos.files, 0),
    videoBytes: tasks.reduce((sum, item) => sum + item.videos.bytes, 0),
  };
  const expected = {
    entries: RW_RL_SO101_PROFILE.treeEntries,
    files: RW_RL_SO101_PROFILE.treeFiles,
    bytes: RW_RL_SO101_PROFILE.treeBytes,
    dataFiles: RW_RL_SO101_PROFILE.dataFiles,
    dataBytes: RW_RL_SO101_PROFILE.dataBytes,
    metadataFiles: RW_RL_SO101_PROFILE.metadataFiles,
    metadataBytes: RW_RL_SO101_PROFILE.metadataBytes,
    videoFiles: RW_RL_SO101_PROFILE.videoFiles,
    videoBytes: RW_RL_SO101_PROFILE.videoBytes,
  };
  if (canonicalizeStrict(totals) !== canonicalizeStrict(expected)) {
    fail("SO101_TOTAL_INVENTORY_MISMATCH");
  }
  return { tasks, totals,
    projectionHash: digest("outsider/rw-rl-so101-all-task-trees/v1",
      RW_RL_SO101_TASKS.map((task) => taskTrees[task].projection)) };
}

function selectedEntries(rootProjection, taskTrees) {
  const selected = [validateRootTree(rootProjection)];
  for (const task of RW_RL_SO101_TASKS) {
    selected.push(...taskTrees[task].projection.filter((entry) =>
      entry.type === "file" && META_PATH.test(entry.path)));
  }
  selected.push(...taskTrees[RW_RL_SO101_COMPLETE_TASK].projection.filter((entry) =>
    entry.type === "file" && DATA_PATH.test(entry.path)));
  for (const task of RW_RL_SO101_TASKS.slice(1)) {
    const probe = taskTrees[task].projection.find((entry) =>
      entry.path === `${task}/data/chunk-000/file-000.parquet`);
    if (!probe) fail("SCHEMA_PROBE_MISSING", task);
    selected.push(probe);
  }
  selected.sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(selected.map((entry) => entry.path)).size !== selected.length
    || selected.length !== RW_RL_SO101_PROFILE.selectedObjects
    || selected.reduce((sum, entry) => sum + entry.sizeBytes, 0)
      !== RW_RL_SO101_PROFILE.selectedBytes) fail("SELECTED_CLOSURE_MISMATCH");
  if (selected.some((entry) => VIDEO_PATH.test(entry.path))) {
    fail("VIDEO_SELECTED");
  }
  return selected;
}

function safeJoin(root, remotePath) {
  if (!safeRemotePath(remotePath)) fail("REMOTE_PATH_UNSAFE", remotePath);
  const target = path.join(root, ...remotePath.split("/"));
  const relative = path.relative(root, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("REMOTE_PATH_ESCAPE", remotePath);
  return target;
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

function apiSnapshotPath(kind, phase, task = null, pageIndex = null) {
  if (kind === "repository" || kind === "root-tree") {
    return `control/${kind}-${phase}.json`;
  }
  const safeTask = task.replaceAll("_", "-");
  return `control/task-tree-${phase}-${safeTask}-page-${String(pageIndex).padStart(3, "0")}.json`;
}

function writeApiSnapshots(root, repository, rootTree, taskTrees) {
  const descriptors = [];
  const write = (remotePath, bytes, url) => {
    writePrivateFileOnce(safeJoin(root, remotePath), bytes);
    descriptors.push({ path: remotePath, bytes: bytes.length,
      contentSha256: rwRlSo101Sha256(bytes), url });
  };
  write(apiSnapshotPath("repository", repository.phase), repository.bytes,
    repository.url);
  write(apiSnapshotPath("root-tree", rootTree.phase), rootTree.bytes, rootTree.url);
  for (const task of RW_RL_SO101_TASKS) {
    for (const page of taskTrees[task].pages) {
      write(apiSnapshotPath("task-tree", page.phase, task, page.pageIndex),
        page.bytes, page.url);
    }
  }
  return descriptors.sort((left, right) => left.path.localeCompare(right.path));
}

function objectDescriptor(entry, bytes) {
  const contentSha256 = rwRlSo101Sha256(bytes);
  if (bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_MISMATCH", entry.path);
  if (entry.lfsSha256 !== null && contentSha256 !== entry.lfsSha256) {
    fail("OBJECT_LFS_HASH_MISMATCH", entry.path);
  }
  if (entry.lfsSha256 === null && gitBlobOid(bytes) !== entry.oid) {
    fail("OBJECT_GIT_HASH_MISMATCH", entry.path);
  }
  return {
    path: entry.path,
    bytes: bytes.length,
    lfsSha256: entry.lfsSha256,
    gitBlobSha1: entry.oid,
    contentSha256,
  };
}

async function downloadSelectedObject(root, entry, fetchImpl) {
  const fetched = await boundedFetch(
    `${RAW_ROOT}/${entry.path.split("/").map(encodeURIComponent).join("/")}`,
    Math.min(MAX_OBJECT_BYTES, entry.sizeBytes), fetchImpl);
  const descriptor = objectDescriptor(entry, fetched.bytes);
  writePrivateFileOnce(safeJoin(root, entry.path), fetched.bytes);
  return descriptor;
}

function selectionSummary(selected) {
  const completeData = selected.filter((entry) =>
    entry.path.startsWith(`${RW_RL_SO101_COMPLETE_TASK}/data/`));
  const metadata = selected.filter((entry) => META_PATH.test(entry.path));
  const probes = selected.filter((entry) => DATA_PATH.test(entry.path)
    && !entry.path.startsWith(`${RW_RL_SO101_COMPLETE_TASK}/data/`));
  const summary = {
    readme: { files: 1, bytes: RW_RL_SO101_PROFILE.readmeBytes },
    allSo101Metadata: {
      files: metadata.length,
      bytes: metadata.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    },
    completeNoVideoTask: RW_RL_SO101_COMPLETE_TASK,
    completeTaskData: {
      files: completeData.length,
      bytes: completeData.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      episodes: RW_RL_SO101_PROFILE.completeTaskEpisodes,
    },
    crossTaskCompleteEpisodeSchemaProbes: {
      files: probes.length,
      bytes: probes.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      paths: probes.map((entry) => entry.path),
    },
    selectedObjects: selected.length,
    selectedBytes: selected.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    videoObjectsSelected: 0,
  };
  if (summary.allSo101Metadata.files !== RW_RL_SO101_PROFILE.metadataFiles
    || summary.allSo101Metadata.bytes !== RW_RL_SO101_PROFILE.metadataBytes
    || summary.completeTaskData.files !== RW_RL_SO101_PROFILE.completeTaskDataFiles
    || summary.completeTaskData.bytes !== RW_RL_SO101_PROFILE.completeTaskDataBytes
    || summary.crossTaskCompleteEpisodeSchemaProbes.files
      !== RW_RL_SO101_PROFILE.crossTaskSchemaProbeFiles
    || summary.crossTaskCompleteEpisodeSchemaProbes.bytes
      !== RW_RL_SO101_PROFILE.crossTaskSchemaProbeBytes
    || summary.selectedObjects !== RW_RL_SO101_PROFILE.selectedObjects
    || summary.selectedBytes !== RW_RL_SO101_PROFILE.selectedBytes) {
    fail("SELECTION_SUMMARY_INVALID");
  }
  return summary;
}

function sourceRootFor(remoteObjects) {
  return digest("outsider/rw-rl-so101-source-root/v1", remoteObjects.map((entry) => ({
    path: entry.path,
    bytes: entry.bytes,
    lfsSha256: entry.lfsSha256,
    gitBlobSha1: entry.gitBlobSha1,
    contentSha256: entry.contentSha256,
  })));
}

function sourceManifestHash(body) {
  return digest("outsider/rw-rl-so101-source-manifest/v1", body);
}

function compareSnapshots(before, after, label) {
  if (canonicalizeStrict(before) !== canonicalizeStrict(after)) {
    fail("SOURCE_CHANGED_DURING_ACQUISITION", label);
  }
}

export async function acquirePinnedRwRlSo101Source(sourceDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  const root = path.resolve(sourceDirectory);
  createPrivateRoot(root);
  try {
    const repositoryBefore = await fetchRepositorySnapshot("before", fetchImpl);
    const rootBefore = await fetchRootTreeSnapshot("before", fetchImpl);
    const taskTreesBefore = await fetchAllTaskTrees("before", fetchImpl);
    const readme = validateRootTree(rootBefore.projection);
    const inventoryBefore = allTaskInventory(taskTreesBefore);
    const selected = selectedEntries(rootBefore.projection, taskTreesBefore);
    const snapshots = writeApiSnapshots(root, repositoryBefore, rootBefore,
      taskTreesBefore);

    const remoteObjects = await mapConcurrent(selected, DOWNLOAD_CONCURRENCY,
      (entry) => downloadSelectedObject(root, entry, fetchImpl));
    remoteObjects.sort((left, right) => left.path.localeCompare(right.path));

    const repositoryAfter = await fetchRepositorySnapshot("after", fetchImpl);
    const rootAfter = await fetchRootTreeSnapshot("after", fetchImpl);
    const taskTreesAfter = await fetchAllTaskTrees("after", fetchImpl);
    validateRootTree(rootAfter.projection);
    const inventoryAfter = allTaskInventory(taskTreesAfter);
    compareSnapshots(repositoryBefore.projection, repositoryAfter.projection,
      "repository");
    compareSnapshots(rootBefore.projection, rootAfter.projection, "root-tree");
    compareSnapshots(inventoryBefore, inventoryAfter, "all-so101-task-trees");
    for (const task of RW_RL_SO101_TASKS) {
      compareSnapshots(taskTreesBefore[task].projection,
        taskTreesAfter[task].projection, task);
    }
    snapshots.push(...writeApiSnapshots(root, repositoryAfter, rootAfter,
      taskTreesAfter));
    snapshots.sort((left, right) => left.path.localeCompare(right.path));

    const sourceRoot = sourceRootFor(remoteObjects);
    const body = {
      schema: RW_RL_SO101_SOURCE_SCHEMA,
      datasetId: RW_RL_DATASET_ID,
      revision: RW_RL_REVISION,
      frozenAt: RW_RL_SO101_FROZEN_AT,
      repository: repositoryBefore.projection,
      repositoryRecordEndpoint: REPOSITORY_API,
      rootTreeProjectionHash: digest("outsider/rw-rl-so101-root-tree/v1",
        rootBefore.projection),
      allSo101Inventory: inventoryBefore,
      selection: selectionSummary(selected),
      sourceClosure: {
        selectedObjects: remoteObjects.length,
        selectedBytes: remoteObjects.reduce((sum, entry) => sum + entry.bytes, 0),
        apiSnapshots: snapshots.length,
        readmePath: readme.path,
        completeNoVideoTask: RW_RL_SO101_COMPLETE_TASK,
      },
      apiSnapshots: snapshots,
      remoteObjects,
      sourceRoot,
      exclusions: {
        videos: {
          selected: false,
          objectsRecordedButNotFetched: RW_RL_SO101_PROFILE.videoFiles,
          bytesRecordedButNotFetched: RW_RL_SO101_PROFILE.videoBytes,
        },
        allNonProbeDataOutsideCompleteTaskFetched: false,
      },
      rightsIntake: {
        datasetCardLicenseDeclared: false,
        datasetRepositoryLicenseFilePresent: false,
        linkedCodeRepositoryLicenseDoesNotExtendToDataset: true,
        status: "FAIL_CLOSED_QUARANTINE_EVAL",
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

function readPrivateRegularFile(file, expectedBytes = null) {
  const checked = lstatSync(file);
  if (checked.isSymbolicLink() || !checked.isFile()) fail("SOURCE_FILE_UNSAFE", file);
  if (expectedBytes !== null && checked.size !== expectedBytes) {
    fail("SOURCE_FILE_SIZE_INVALID", file);
  }
  return readFileSync(file);
}

function parseJsonBytes(bytes, label) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("SOURCE_JSON_INVALID", label); }
  return value;
}

function verifySnapshotDescriptor(root, descriptor) {
  if (!plain(descriptor) || typeof descriptor.path !== "string"
    || !descriptor.path.startsWith("control/")
    || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1
    || !HASH.test(descriptor.contentSha256 ?? "")
    || typeof descriptor.url !== "string") fail("SNAPSHOT_DESCRIPTOR_INVALID");
  const bytes = readPrivateRegularFile(safeJoin(root, descriptor.path),
    descriptor.bytes);
  if (rwRlSo101Sha256(bytes) !== descriptor.contentSha256) {
    fail("SNAPSHOT_HASH_MISMATCH", descriptor.path);
  }
  return bytes;
}

function snapshotMapFromManifest(root, manifest) {
  if (!Array.isArray(manifest.apiSnapshots)
    || manifest.apiSnapshots.length !== 46) fail("SNAPSHOT_CENSUS_INVALID");
  const output = new Map();
  for (const descriptor of manifest.apiSnapshots) {
    if (output.has(descriptor.path)) fail("SNAPSHOT_DUPLICATE", descriptor.path);
    output.set(descriptor.path, {
      descriptor,
      bytes: verifySnapshotDescriptor(root, descriptor),
    });
  }
  return output;
}

function treeFromSnapshots(snapshotMap, phase, task = null) {
  if (task === null) {
    const key = apiSnapshotPath("root-tree", phase);
    const snapshot = snapshotMap.get(key);
    if (!snapshot) fail("ROOT_SNAPSHOT_MISSING", phase);
    return projectTree(parseJsonBytes(snapshot.bytes, key));
  }
  const profile = RW_RL_SO101_TASK_PROFILE[task];
  const entries = [];
  for (let index = 0; index < profile.pages; index += 1) {
    const key = apiSnapshotPath("task-tree", phase, task, index);
    const snapshot = snapshotMap.get(key);
    if (!snapshot) fail("TASK_SNAPSHOT_MISSING", key);
    const page = parseJsonBytes(snapshot.bytes, key);
    if (!Array.isArray(page) || page.length < 1 || page.length > 1_000) {
      fail("TASK_SNAPSHOT_PAGE_INVALID", key);
    }
    entries.push(...page);
  }
  return projectTree(entries);
}

function repositoryFromSnapshot(snapshotMap, phase) {
  const key = apiSnapshotPath("repository", phase);
  const snapshot = snapshotMap.get(key);
  if (!snapshot) fail("REPOSITORY_SNAPSHOT_MISSING", phase);
  return repositoryProjection(parseJsonBytes(snapshot.bytes, key));
}

function verifyRemoteObjects(root, manifest, selected) {
  if (!Array.isArray(manifest.remoteObjects)
    || manifest.remoteObjects.length !== RW_RL_SO101_PROFILE.selectedObjects) {
    fail("SOURCE_OBJECT_CENSUS_INVALID");
  }
  const expected = new Map(selected.map((entry) => [entry.path, entry]));
  const verified = [];
  for (const descriptor of manifest.remoteObjects) {
    if (!plain(descriptor) || !safeRemotePath(descriptor.path)
      || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1
      || !SHA1.test(descriptor.gitBlobSha1 ?? "")
      || (descriptor.lfsSha256 !== null && !HASH.test(descriptor.lfsSha256 ?? ""))
      || !HASH.test(descriptor.contentSha256 ?? "")) {
      fail("SOURCE_OBJECT_DESCRIPTOR_INVALID");
    }
    const entry = expected.get(descriptor.path);
    if (!entry || descriptor.bytes !== entry.sizeBytes
      || descriptor.gitBlobSha1 !== entry.oid
      || descriptor.lfsSha256 !== entry.lfsSha256) {
      fail("SOURCE_OBJECT_TREE_BINDING_FAILED", descriptor.path);
    }
    const bytes = readPrivateRegularFile(safeJoin(root, descriptor.path),
      descriptor.bytes);
    const rebuilt = objectDescriptor(entry, bytes);
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(descriptor)) {
      fail("SOURCE_OBJECT_CONTENT_BINDING_FAILED", descriptor.path);
    }
    expected.delete(descriptor.path);
    verified.push(rebuilt);
  }
  if (expected.size !== 0) fail("SOURCE_OBJECT_MISSING");
  verified.sort((left, right) => left.path.localeCompare(right.path));
  return verified;
}

export function verifyRwRlSo101SourceDirectory(sourceDirectory) {
  try {
    const root = path.resolve(sourceDirectory);
    const rootStat = lstatSync(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      fail("SOURCE_DIRECTORY_UNSAFE");
    }
    const manifestBytes = readPrivateRegularFile(
      path.join(root, "acquisition-manifest.json"));
    const manifest = parseJsonBytes(manifestBytes, "acquisition-manifest.json");
    if (!plain(manifest) || manifest.schema !== RW_RL_SO101_SOURCE_SCHEMA
      || manifest.datasetId !== RW_RL_DATASET_ID
      || manifest.revision !== RW_RL_REVISION
      || !HASH.test(manifest.manifestHash ?? "")
      || !HASH.test(manifest.sourceRoot ?? "")) fail("SOURCE_MANIFEST_INVALID");
    const { manifestHash, ...body } = manifest;
    if (sourceManifestHash(body) !== manifestHash) fail("SOURCE_MANIFEST_HASH_INVALID");

    const snapshotMap = snapshotMapFromManifest(root, manifest);
    const repositoryBefore = repositoryFromSnapshot(snapshotMap, "before");
    const repositoryAfter = repositoryFromSnapshot(snapshotMap, "after");
    compareSnapshots(repositoryBefore, repositoryAfter, "repository");
    compareSnapshots(repositoryBefore, manifest.repository, "manifest-repository");
    const rootBefore = treeFromSnapshots(snapshotMap, "before");
    const rootAfter = treeFromSnapshots(snapshotMap, "after");
    compareSnapshots(rootBefore, rootAfter, "root-tree");
    validateRootTree(rootBefore);
    if (digest("outsider/rw-rl-so101-root-tree/v1", rootBefore)
      !== manifest.rootTreeProjectionHash) fail("ROOT_TREE_HASH_INVALID");
    const taskTreesBefore = {};
    const taskTreesAfter = {};
    for (const task of RW_RL_SO101_TASKS) {
      taskTreesBefore[task] = { task,
        pages: Array.from({ length: RW_RL_SO101_TASK_PROFILE[task].pages }),
        projection: treeFromSnapshots(snapshotMap, "before", task) };
      taskTreesAfter[task] = { task,
        pages: Array.from({ length: RW_RL_SO101_TASK_PROFILE[task].pages }),
        projection: treeFromSnapshots(snapshotMap, "after", task) };
      compareSnapshots(taskTreesBefore[task].projection,
        taskTreesAfter[task].projection, task);
    }
    const inventory = allTaskInventory(taskTreesBefore);
    compareSnapshots(inventory, manifest.allSo101Inventory, "manifest-inventory");
    const selected = selectedEntries(rootBefore, taskTreesBefore);
    compareSnapshots(selectionSummary(selected), manifest.selection,
      "manifest-selection");
    const remoteObjects = verifyRemoteObjects(root, manifest, selected);
    if (sourceRootFor(remoteObjects) !== manifest.sourceRoot) {
      fail("SOURCE_ROOT_INVALID");
    }
    if (manifest.sourceClosure?.selectedObjects !== RW_RL_SO101_PROFILE.selectedObjects
      || manifest.sourceClosure?.selectedBytes !== RW_RL_SO101_PROFILE.selectedBytes
      || manifest.sourceClosure?.apiSnapshots !== 46
      || manifest.exclusions?.videos?.selected !== false
      || manifest.exclusions?.videos?.objectsRecordedButNotFetched
        !== RW_RL_SO101_PROFILE.videoFiles
      || manifest.exclusions?.videos?.bytesRecordedButNotFetched
        !== RW_RL_SO101_PROFILE.videoBytes
      || manifest.rightsIntake?.status !== "FAIL_CLOSED_QUARANTINE_EVAL") {
      fail("SOURCE_BOUNDARY_INVALID");
    }
    return { ok: true, sourceDirectory: root, manifest, remoteObjects,
      verificationLevel: "PINNED_REPOSITORY_AND_ALL_SO101_TREE_PLUS_SELECTED_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import hashlib
import json
import os
import re
import sys

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

root = sys.argv[1]
tasks = json.loads(sys.argv[2])
profiles = json.loads(sys.argv[3])
complete_task = sys.argv[4]
expected_columns = [
    "action", "observation.state", "timestamp", "frame_index",
    "episode_index", "index", "task_index",
]
signal_re = re.compile(
    r"(?:^|[/_.-])(reward|done|success|outcome|intervention|data[_.-]?regime|regime)(?:$|[/_.-])",
    re.IGNORECASE,
)

def abort(code, detail=""):
    raise RuntimeError("RW_RL_SO101_PYARROW_" + code + (":" + detail if detail else ""))

def stable_hash(domain, value):
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"),
                         ensure_ascii=False, allow_nan=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(domain.encode("utf-8") + b"\0" + encoded).hexdigest()

def load_json(relative):
    with open(os.path.join(root, relative), "r", encoding="utf-8") as handle:
        return json.load(handle)

def table(relative):
    return pq.read_table(os.path.join(root, relative))

def require_columns(actual, required, label):
    missing = [name for name in required if name not in actual]
    if missing:
        abort("META_COLUMN_MISSING", label + ":" + ",".join(missing))

def array_values(column):
    return column.combine_chunks().to_pylist()

def vector_values(column, width, label):
    combined = column.combine_chunks()
    if not pa.types.is_fixed_size_list(combined.type) or combined.type.list_size != width:
        abort("VECTOR_SHAPE_INVALID", label)
    if combined.type.value_type != pa.float32():
        abort("VECTOR_TYPE_INVALID", label)
    values = combined.values
    if len(values) != len(combined) * width:
        abort("VECTOR_VALUE_COUNT_INVALID", label)
    if not pc.all(pc.is_finite(values)).as_py():
        abort("VECTOR_NONFINITE", label)
    return values

def inspect_data(relative, episode_index, length, dataset_from, fps, task_index=0):
    current = table(relative)
    if current.column_names != expected_columns:
        abort("DATA_COLUMNS_INVALID", relative)
    if current.num_rows != length or any(current[name].null_count for name in current.column_names):
        abort("DATA_ROWS_OR_NULLS_INVALID", relative)
    vector_values(current["action"], 12, relative + ":action")
    vector_values(current["observation.state"], 12, relative + ":state")
    frames = current["frame_index"].combine_chunks()
    episodes = current["episode_index"].combine_chunks()
    indices = current["index"].combine_chunks()
    task_indices = current["task_index"].combine_chunks()
    timestamps = current["timestamp"].combine_chunks()
    expected_frames = pa.array(range(length), type=pa.int64())
    if not pc.all(pc.equal(frames, expected_frames)).as_py():
        abort("FRAME_INDEX_DISCONTINUOUS", relative)
    if not pc.all(pc.equal(episodes, pa.scalar(episode_index, pa.int64()))).as_py():
        abort("EPISODE_INDEX_INVALID", relative)
    expected_indices = pa.array(range(dataset_from, dataset_from + length), type=pa.int64())
    if not pc.all(pc.equal(indices, expected_indices)).as_py():
        abort("GLOBAL_INDEX_DISCONTINUOUS", relative)
    if not pc.all(pc.equal(task_indices, pa.scalar(task_index, pa.int64()))).as_py():
        abort("TASK_INDEX_INVALID", relative)
    expected_time = pa.array((index / float(fps) for index in range(length)),
                             type=pa.float64())
    difference = pc.abs(pc.subtract(pc.cast(timestamps, pa.float64()), expected_time))
    if pc.max(difference).as_py() > 0.00004:
        abort("TIMESTAMP_CADENCE_INVALID", relative)
    matches = [name for name in current.column_names if signal_re.search(name)]
    if matches:
        abort("UNEXPECTED_SIGNAL_COLUMN", relative + ":" + ",".join(matches))
    return {
        "path": relative,
        "rows": current.num_rows,
        "episodeIndex": episode_index,
        "datasetFromIndex": dataset_from,
        "datasetToIndex": dataset_from + length,
        "firstTimestamp": float(timestamps[0].as_py()),
        "lastTimestamp": float(timestamps[-1].as_py()),
        "columns": list(current.column_names),
        "actionDimensions": 12,
        "stateDimensions": 12,
    }

metadata = []
episode_tables = {}
metadata_signal_matches = []
for task_name in tasks:
    profile = profiles[task_name]
    info = load_json(task_name + "/meta/info.json")
    stats = load_json(task_name + "/meta/stats.json")
    tasks_table = table(task_name + "/meta/tasks.parquet")
    episodes_table = table(task_name + "/meta/episodes/chunk-000/file-000.parquet")
    episode_tables[task_name] = episodes_table
    require_columns(episodes_table.column_names, [
        "episode_index", "tasks", "length", "data/chunk_index",
        "data/file_index", "dataset_from_index", "dataset_to_index",
    ], task_name)
    if tasks_table.column_names != ["task_index", "task"] or tasks_table.num_rows != 1:
        abort("TASK_TABLE_INVALID", task_name)
    if episodes_table.num_rows != profile["episodes"]:
        abort("EPISODE_META_ROWS_INVALID", task_name)
    if info.get("total_episodes") != profile["episodes"] or info.get("total_tasks") != 1:
        abort("INFO_EPISODE_COUNT_INVALID", task_name)
    if info.get("total_videos") != profile["episodes"] * 3 or info.get("fps") != 30:
        abort("INFO_VIDEO_OR_FPS_INVALID", task_name)
    if info.get("robot_type") != "bi_so_follower" or info.get("codebase_version") != "v3.0":
        abort("INFO_ROBOT_INVALID", task_name)
    features = info.get("features")
    if not isinstance(features, dict):
        abort("INFO_FEATURES_INVALID", task_name)
    feature_names = sorted(features.keys())
    expected_feature_names = sorted([
        "action", "observation.state", "observation.images.left_wrist",
        "observation.images.right_wrist", "observation.images.right_front",
        "timestamp", "frame_index", "episode_index", "index", "task_index",
    ])
    if feature_names != expected_feature_names:
        abort("INFO_FEATURES_UNEXPECTED", task_name)
    if features["action"].get("shape") != [12] or features["action"].get("dtype") != "float32":
        abort("INFO_ACTION_INVALID", task_name)
    if features["observation.state"].get("shape") != [12] or features["observation.state"].get("dtype") != "float32":
        abort("INFO_STATE_INVALID", task_name)
    if sorted(stats.keys()) != ["action", "observation.state"]:
        abort("STATS_FIELDS_INVALID", task_name)
    candidate_names = feature_names + list(episodes_table.column_names) + list(tasks_table.column_names) + list(stats.keys())
    matches = sorted(set(name for name in candidate_names if signal_re.search(name)))
    metadata_signal_matches.extend(task_name + ":" + name for name in matches)
    episode_indices = array_values(episodes_table["episode_index"])
    lengths = array_values(episodes_table["length"])
    data_chunks = array_values(episodes_table["data/chunk_index"])
    data_files = array_values(episodes_table["data/file_index"])
    dataset_from = array_values(episodes_table["dataset_from_index"])
    dataset_to = array_values(episodes_table["dataset_to_index"])
    if episode_indices != list(range(profile["episodes"])):
        abort("EPISODE_META_INDEX_INVALID", task_name)
    if any(length <= 0 for length in lengths) or sum(lengths) != info.get("total_frames"):
        abort("EPISODE_META_LENGTH_INVALID", task_name)
    if info.get("episode_lengths") != lengths:
        abort("INFO_EPISODE_LENGTHS_INVALID", task_name)
    expected_chunks = [index // 1000 for index in episode_indices]
    expected_files = [index % 1000 for index in episode_indices]
    if data_chunks != expected_chunks or data_files != expected_files:
        abort("EPISODE_META_DATA_PATH_INVALID", task_name)
    expected_from = []
    cursor = 0
    for length in lengths:
        expected_from.append(cursor)
        cursor += length
    expected_to = [start + length for start, length in zip(expected_from, lengths)]
    if dataset_from != expected_from or dataset_to != expected_to:
        abort("EPISODE_META_RANGE_INVALID", task_name)
    if dataset_to[-1] != info.get("total_frames"):
        abort("EPISODE_META_TOTAL_RANGE_INVALID", task_name)
    metadata.append({
        "task": task_name,
        "episodes": episodes_table.num_rows,
        "frames": int(info["total_frames"]),
        "fps": int(info["fps"]),
        "robotType": info["robot_type"],
        "actionDimensions": 12,
        "stateDimensions": 12,
        "infoFeatureNames": feature_names,
        "episodeMetadataColumns": list(episodes_table.column_names),
        "taskMetadataColumns": list(tasks_table.column_names),
        "metadataSignalFieldMatches": matches,
        "splitLabel": info.get("splits"),
    })

if metadata_signal_matches:
    abort("UNEXPECTED_METADATA_SIGNAL_FIELD", ",".join(metadata_signal_matches))

complete_meta = episode_tables[complete_task]
complete_info = load_json(complete_task + "/meta/info.json")
complete_projection = []
for episode_index in range(profiles[complete_task]["episodes"]):
    row = complete_meta.slice(episode_index, 1).select([
        "length", "data/chunk_index", "data/file_index",
        "dataset_from_index", "dataset_to_index",
    ]).to_pylist()[0]
    relative = "%s/data/chunk-%03d/file-%03d.parquet" % (
        complete_task, row["data/chunk_index"], row["data/file_index"])
    inspected = inspect_data(relative, episode_index, int(row["length"]),
                             int(row["dataset_from_index"]), int(complete_info["fps"]))
    if inspected["datasetToIndex"] != int(row["dataset_to_index"]):
        abort("DATA_META_RANGE_MISMATCH", relative)
    complete_projection.append({
        "episodeIndex": inspected["episodeIndex"],
        "rows": inspected["rows"],
        "datasetFromIndex": inspected["datasetFromIndex"],
        "datasetToIndex": inspected["datasetToIndex"],
        "firstTimestamp": inspected["firstTimestamp"],
        "lastTimestamp": inspected["lastTimestamp"],
    })

if sum(item["rows"] for item in complete_projection) != complete_info["total_frames"]:
    abort("COMPLETE_TASK_FRAME_TOTAL_INVALID", complete_task)

schema_probes = []
for task_name in tasks:
    task_meta = episode_tables[task_name]
    info = load_json(task_name + "/meta/info.json")
    first = task_meta.slice(0, 1).select([
        "length", "dataset_from_index", "dataset_to_index",
    ]).to_pylist()[0]
    relative = task_name + "/data/chunk-000/file-000.parquet"
    inspected = inspect_data(relative, 0, int(first["length"]),
                             int(first["dataset_from_index"]), int(info["fps"]))
    if inspected["datasetToIndex"] != int(first["dataset_to_index"]):
        abort("PROBE_META_RANGE_MISMATCH", task_name)
    schema_probes.append(inspected)

output = {
    "pyarrowVersion": pa.__version__,
    "metadataFilesReplayed": len(tasks) * 4,
    "tasksAudited": metadata,
    "allSo101MetadataSignalFieldMatches": [],
    "completeTask": {
        "task": complete_task,
        "dataFilesReplayed": profiles[complete_task]["episodes"],
        "episodesReplayed": profiles[complete_task]["episodes"],
        "framesReplayed": int(complete_info["total_frames"]),
        "episodeFrameIndexContinuous": True,
        "globalIndexContinuous": True,
        "timestampCadenceAligned30Fps": True,
        "episodeMetadataAligned": True,
        "actionDimensions": 12,
        "stateDimensions": 12,
        "dataColumns": expected_columns,
        "dataSignalFieldMatches": [],
        "episodeProjectionHash": stable_hash(
            "outsider/rw-rl-so101-complete-task-episodes/v1", complete_projection),
    },
    "crossTaskSchemaProbes": schema_probes,
    "actualSelectedByteFieldAudit": {
        "intervention": False,
        "reward": False,
        "done": False,
        "success": False,
        "outcome": False,
        "dataRegime": False,
    },
    "publisherNarrativeClaimsSubstitutedForBytes": False,
    "outcomeAvailableInSelectedBytes": False,
}
print(json.dumps(output, sort_keys=True, separators=(",", ":"), allow_nan=False))
`;

function pythonTaskProfiles() {
  return Object.fromEntries(RW_RL_SO101_TASKS.map((task) => [task, {
    episodes: RW_RL_SO101_TASK_PROFILE[task].episodes,
  }]));
}

function runPyarrowReplay(sourceDirectory, pythonExecutable) {
  if (typeof pythonExecutable !== "string" || pythonExecutable.length < 1) {
    fail("PYTHON_EXECUTABLE_INVALID");
  }
  const result = spawnSync(pythonExecutable, ["-c", PYARROW_REPLAY,
    sourceDirectory, JSON.stringify(RW_RL_SO101_TASKS),
    JSON.stringify(pythonTaskProfiles()), RW_RL_SO101_COMPLETE_TASK], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
    timeout: 600_000,
    env: { ...process.env, PYTHONHASHSEED: "0" },
  });
  if (result.error) fail("PYARROW_EXEC_FAILED", result.error.message);
  if (result.status !== 0) {
    fail("PYARROW_REPLAY_FAILED", String(result.stderr || result.stdout).trim());
  }
  let replay;
  try { replay = JSON.parse(result.stdout); }
  catch { fail("PYARROW_OUTPUT_INVALID"); }
  if (!plain(replay)
    || replay.metadataFilesReplayed !== RW_RL_SO101_PROFILE.metadataFiles
    || replay.completeTask?.dataFilesReplayed
      !== RW_RL_SO101_PROFILE.completeTaskDataFiles
    || replay.completeTask?.episodesReplayed
      !== RW_RL_SO101_PROFILE.completeTaskEpisodes
    || replay.completeTask?.framesReplayed !== RW_RL_SO101_PROFILE.completeTaskFrames
    || replay.crossTaskSchemaProbes?.length !== RW_RL_SO101_PROFILE.taskCount
    || replay.outcomeAvailableInSelectedBytes !== false) {
    fail("PYARROW_RESULT_INVALID");
  }
  return replay;
}

function assertReadmeHasNoLicenseClaim(sourceDirectory) {
  const text = readPrivateRegularFile(path.join(sourceDirectory, "README.md"),
    RW_RL_SO101_PROFILE.readmeBytes).toString("utf8");
  const matched = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(text);
  if (!matched || /^license\s*:/imu.test(matched[1])) {
    fail("README_LICENSE_SCOPE_INVALID");
  }
  for (const claim of ["human intervention", "reward", "done", "data regimes"]) {
    if (!text.toLowerCase().includes(claim)) fail("README_NARRATIVE_MISSING", claim);
  }
  return {
    frontmatterLicenseDeclared: false,
    publisherNarrativeMentionsHumanInterventionRewardDoneAndRegimes: true,
    narrativeTreatedAsByteLevelFieldEvidence: false,
  };
}

export function rwRlSo101ArtifactHash(body) {
  return digest("outsider/rw-rl-so101-metadata-audit/v1", body);
}

function auditBodyFromSource(verifiedSource, replay) {
  const manifest = verifiedSource.manifest;
  return {
    schema: RW_RL_SO101_AUDIT_SCHEMA,
    datasetId: RW_RL_DATASET_ID,
    revision: RW_RL_REVISION,
    frozenAt: RW_RL_SO101_FROZEN_AT,
    admission: "QUARANTINE_EVAL",
    status: "BOUNDED_NO_VIDEO_STATE_ACTION_SLICE_METADATA_AUDITED_NO_OUTCOME",
    sourceManifestHash: manifest.manifestHash,
    sourceRoot: manifest.sourceRoot,
    sourceVerificationLevel: verifiedSource.verificationLevel,
    repository: manifest.repository,
    allSo101Inventory: manifest.allSo101Inventory,
    selection: manifest.selection,
    replay,
    fieldConclusion: {
      selectedActualParquetBytesExposeIntervention: false,
      selectedActualParquetBytesExposeReward: false,
      selectedActualParquetBytesExposeDone: false,
      selectedActualParquetBytesExposeSuccessOrOutcome: false,
      selectedActualParquetBytesExposeDataRegime: false,
      cardNarrativeIsNotSubstitutedForActualBytes: true,
      usableAsOutcomeOrRecoveryEvidence: false,
    },
    completeness: {
      allSo101TaskTreesInventoried: true,
      allSo101MetadataObjectsAcquiredAndReplayed: true,
      completeSmallestTaskStateActionEpisodesAcquiredAndReplayed: true,
      oneCompleteDataEpisodeSchemaProbedPerOtherTask: true,
      allSo101DataEpisodesAcquired: false,
      allSo101VideosAcquired: false,
      visualReplay: false,
      attemptOutcomeCensusAvailable: false,
      interventionRecoveryPairsAvailable: false,
    },
    rights: {
      status: "FAIL_CLOSED_QUARANTINE_EVAL",
      datasetCardLicenseDeclared: false,
      pinnedReadmeFrontmatterLicenseDeclared: false,
      datasetRepositoryLicenseFilePresent: false,
      linkedCodeRepositoryApacheLicenseExtendedToDataset: false,
      productionTrainingRightFinallyAdjudicated: false,
    },
    outcome: {
      publisherSourceNativeOutcomeAvailable: false,
      independentOutcome: 0,
      longitudinalOutcome: 0,
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

export function buildRwRlSo101MetadataAuditFromSource(sourceDirectory,
  options = {}) {
  const verified = verifyRwRlSo101SourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const readme = assertReadmeHasNoLicenseClaim(verified.sourceDirectory);
  if (readme.frontmatterLicenseDeclared !== false
    || readme.narrativeTreatedAsByteLevelFieldEvidence !== false) {
    fail("README_AUDIT_INVALID");
  }
  const replay = runPyarrowReplay(verified.sourceDirectory,
    options.pythonExecutable ?? process.env.OUTSIDER_PYTHON ?? ".venv/bin/python");
  const body = auditBodyFromSource(verified, replay);
  return { ...body, artifactHash: rwRlSo101ArtifactHash(body) };
}

function zeroBoundary(boundary) {
  if (!plain(boundary)) return false;
  return ["training", "network", "CEU", "authority", "action", "opportunity",
    "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => boundary[key] === 0);
}

export function verifyRwRlSo101MetadataAuditArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== RW_RL_SO101_AUDIT_SCHEMA
      || artifact.datasetId !== RW_RL_DATASET_ID
      || artifact.revision !== RW_RL_REVISION
      || artifact.admission !== "QUARANTINE_EVAL"
      || artifact.status
        !== "BOUNDED_NO_VIDEO_STATE_ACTION_SLICE_METADATA_AUDITED_NO_OUTCOME"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_INVALID");
    const { artifactHash, ...body } = artifact;
    if (rwRlSo101ArtifactHash(body) !== artifactHash) fail("ARTIFACT_HASH_INVALID");
    if (!zeroBoundary(artifact.boundary)) fail("BOUNDARY_PROMOTION_REFUSED");
    if (artifact.rights?.status !== "FAIL_CLOSED_QUARANTINE_EVAL"
      || artifact.rights?.datasetCardLicenseDeclared !== false
      || artifact.rights?.pinnedReadmeFrontmatterLicenseDeclared !== false
      || artifact.rights?.datasetRepositoryLicenseFilePresent !== false
      || artifact.rights?.linkedCodeRepositoryApacheLicenseExtendedToDataset !== false
      || artifact.rights?.productionTrainingRightFinallyAdjudicated !== false) {
      fail("RIGHTS_PROMOTION_REFUSED");
    }
    if (artifact.completeness?.allSo101TaskTreesInventoried !== true
      || artifact.completeness?.allSo101MetadataObjectsAcquiredAndReplayed !== true
      || artifact.completeness?.completeSmallestTaskStateActionEpisodesAcquiredAndReplayed
        !== true
      || artifact.completeness?.allSo101DataEpisodesAcquired !== false
      || artifact.completeness?.allSo101VideosAcquired !== false
      || artifact.completeness?.visualReplay !== false
      || artifact.completeness?.attemptOutcomeCensusAvailable !== false
      || artifact.completeness?.interventionRecoveryPairsAvailable !== false) {
      fail("COMPLETENESS_PROMOTION_REFUSED");
    }
    if (artifact.fieldConclusion?.selectedActualParquetBytesExposeIntervention !== false
      || artifact.fieldConclusion?.selectedActualParquetBytesExposeReward !== false
      || artifact.fieldConclusion?.selectedActualParquetBytesExposeDone !== false
      || artifact.fieldConclusion?.selectedActualParquetBytesExposeSuccessOrOutcome !== false
      || artifact.fieldConclusion?.selectedActualParquetBytesExposeDataRegime !== false
      || artifact.fieldConclusion?.cardNarrativeIsNotSubstitutedForActualBytes !== true
      || artifact.fieldConclusion?.usableAsOutcomeOrRecoveryEvidence !== false
      || artifact.outcome?.publisherSourceNativeOutcomeAvailable !== false
      || artifact.outcome?.independentOutcome !== 0
      || artifact.outcome?.longitudinalOutcome !== 0) {
      fail("FIELD_OR_OUTCOME_PROMOTION_REFUSED");
    }
    if (artifact.selection?.selectedObjects !== RW_RL_SO101_PROFILE.selectedObjects
      || artifact.selection?.selectedBytes !== RW_RL_SO101_PROFILE.selectedBytes
      || artifact.selection?.videoObjectsSelected !== 0
      || artifact.replay?.metadataFilesReplayed !== RW_RL_SO101_PROFILE.metadataFiles
      || artifact.replay?.completeTask?.dataFilesReplayed
        !== RW_RL_SO101_PROFILE.completeTaskDataFiles
      || artifact.replay?.completeTask?.framesReplayed
        !== RW_RL_SO101_PROFILE.completeTaskFrames
      || artifact.replay?.crossTaskSchemaProbes?.length
        !== RW_RL_SO101_PROFILE.taskCount
      || artifact.replay?.outcomeAvailableInSelectedBytes !== false) {
      fail("ARTIFACT_PROFILE_INVALID");
    }
    return { ok: true, artifactHash,
      verificationLevel: "STANDALONE_HASH_AND_FAIL_CLOSED_SEMANTICS" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyRwRlSo101MetadataAuditArtifactWithSource(artifact,
  sourceDirectory, options = {}) {
  try {
    const standalone = verifyRwRlSo101MetadataAuditArtifact(artifact);
    if (!standalone.ok) fail("STANDALONE_ARTIFACT_FAILED", standalone.error);
    const rebuilt = buildRwRlSo101MetadataAuditFromSource(sourceDirectory, options);
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(artifact)) {
      fail("SOURCE_BOUND_ARTIFACT_MISMATCH");
    }
    return {
      ok: true,
      artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.sourceManifestHash,
      sourceRoot: artifact.sourceRoot,
      verificationLevel: "FULL_PINNED_SOURCE_BYTE_METADATA_AND_BOUNDED_PYARROW_REPLAY",
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
