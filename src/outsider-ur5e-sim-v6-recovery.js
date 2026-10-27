/*
 * Fixed-revision source-first closure for xhaka3456/aic_ur5e_sim_v6_recovery.
 * All seven non-video objects are acquired. The three complete published video
 * modalities remain byte-exact recursive-tree inventory and contribute zero
 * selected bytes.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, readSync, readdirSync, renameSync, rmSync, statSync,
  writeFileSync, writeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const UR5E_SIM_V6_ID = "xhaka3456/aic_ur5e_sim_v6_recovery";
export const UR5E_SIM_V6_REVISION =
  "2f7c0e58fa228995ac591d91e04214ca8167938c";
export const UR5E_SIM_V6_FROZEN_AT = "2026-08-30T00:00:00.000Z";
export const UR5E_SIM_V6_SOURCE_SCHEMA =
  "outsider/ur5e-sim-v6-recovery-source/v1";
export const UR5E_SIM_V6_ARTIFACT_SCHEMA =
  "outsider/ur5e-sim-v6-recovery/v1";
export const UR5E_SIM_V6_PROFILE = Object.freeze({
  usedStorage: 7_776_291_078,
  treePages: 1, treeEntries: 58, treeDirectories: 12, treeFiles: 46,
  treeBytes: 7_776_325_133,
  selectedFiles: 7, selectedBytes: 84_162_060,
  videoFiles: 39, videoBytes: 7_692_163_073,
  centerVideoFiles: 11, leftVideoFiles: 14, rightVideoFiles: 14,
  episodes: 1_410, frames: 384_618, fps: 20,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_API_BYTES = 16 * 1024 * 1024;
const RANGE_THRESHOLD_BYTES = 16 * 1024 * 1024;
const RANGE_CHUNK_BYTES = 8 * 1024 * 1024;
const FETCH_ATTEMPTS = 6;
const DIRECT_CONCURRENCY = 6;
const RANGE_CONCURRENCY = 5;

function fail(code, detail = null) {
  throw new Error(detail === null ? `UR5E_SIM_V6_${code}`
    : `UR5E_SIM_V6_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function ur5eSimV6Sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return ur5eSimV6Sha256(Buffer.from(
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
  return typeof value === "string" && value.length > 0 && value.length < 4096
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "."
      && part !== "..");
}

function safeJoin(root, relative) {
  if (!safeRemotePath(relative)) fail("PATH_REFUSED", String(relative));
  const base = path.resolve(root);
  const joined = path.resolve(base, relative);
  const rel = path.relative(base, joined);
  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`)
    || path.isAbsolute(rel)) fail("PATH_ESCAPE", relative);
  return joined;
}

function endpoints() {
  const encoded = UR5E_SIM_V6_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${UR5E_SIM_V6_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${UR5E_SIM_V6_REVISION}`
      + "?recursive=true&expand=false&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${UR5E_SIM_V6_REVISION}`,
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
    || /(?:fetch failed|network|timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN|terminated|socket|other side closed)/iu
      .test(String(error?.message ?? error));
}

function headersObject(headers) {
  const result = {};
  if (headers && typeof headers.entries === "function") {
    for (const [name, value] of headers.entries()) result[name.toLowerCase()] = value;
  }
  return result;
}

async function fetchOnce(url, options, fetchImpl) {
  if (!permittedUrl(url)) fail("URL_REFUSED", url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 240_000);
  try {
    const response = await fetchImpl(url, {
      method: options.method ?? "GET", redirect: "follow", signal: controller.signal,
      headers: { Accept: options.accept ?? "*/*", "Accept-Encoding": "identity",
        "User-Agent": "outsider-source-intake/1", ...(options.headers ?? {}) },
    });
    if (!response || typeof response.arrayBuffer !== "function") {
      fail("FETCH_RESPONSE_INVALID");
    }
    if (!options.expectedStatuses.includes(response.status)) {
      const error = new Error(`HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 425
        || response.status === 429 || response.status >= 500;
      throw error;
    }
    const declaredText = response.headers?.get?.("content-length");
    const declared = declaredText === null ? null : Number(declaredText);
    if (Number.isFinite(declared) && declared > options.maximumBytes) {
      fail("CONTENT_LENGTH_EXCEEDED", String(declared));
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > options.maximumBytes) fail("BODY_BYTES_EXCEEDED", String(bytes.length));
    const finalUrl = response.url || url;
    if (!permittedUrl(finalUrl)) fail("FINAL_URL_REFUSED", finalUrl);
    return { status: response.status, finalUrl, bytes,
      headers: headersObject(response.headers) };
  } finally { clearTimeout(timer); }
}

async function boundedFetch(url, options, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try { return await fetchOnce(url, options, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === FETCH_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)));
    }
  }
  throw last;
}

function jsonValue(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

async function fetchJson(url, fetchImpl) {
  const response = await boundedFetch(url, { maximumBytes: MAX_API_BYTES,
    expectedStatuses: [200], accept: "application/json" }, fetchImpl);
  return { ...response, value: jsonValue(response.bytes, url) };
}

function repositoryProjection(value) {
  if (!plain(value) || !Array.isArray(value.siblings)) fail("REPOSITORY_INVALID");
  const siblingPaths = value.siblings.map((entry) => entry.rfilename)
    .sort((left, right) => left.localeCompare(right));
  const projection = { id: value.id, sha: value.sha, private: value.private,
    gated: value.gated, disabled: value.disabled, usedStorage: value.usedStorage,
    cardLicense: value.cardData?.license ?? null,
    taskCategories: value.cardData?.task_categories ?? null,
    cardTags: value.cardData?.tags ?? null, siblingPaths };
  if (projection.id !== UR5E_SIM_V6_ID
    || projection.sha !== UR5E_SIM_V6_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false
    || projection.usedStorage !== UR5E_SIM_V6_PROFILE.usedStorage
    || projection.cardLicense !== "apache-2.0"
    || !Array.isArray(projection.taskCategories)
    || !projection.taskCategories.includes("robotics")
    || siblingPaths.length !== 46
    || siblingPaths.some((entry) => !safeRemotePath(entry))) {
    fail("REPOSITORY_PROFILE_INVALID");
  }
  return projection;
}

function selectedPath(remotePath) {
  return !remotePath.endsWith(".mp4");
}

function projectTree(value) {
  if (!Array.isArray(value)) fail("TREE_INVALID");
  const projection = value.map((entry) => {
    if (!plain(entry) || !safeRemotePath(entry.path)
      || !["file", "directory"].includes(entry.type)
      || !SHA1.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
    if (entry.type === "directory") return { path: entry.path, type: "directory",
      oid: entry.oid, sizeBytes: 0, lfsSha256: null };
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) fail("TREE_SIZE_INVALID");
    if (entry.lfs == null) return { path: entry.path, type: "file",
      oid: entry.oid, sizeBytes: entry.size, lfsSha256: null };
    if (!plain(entry.lfs) || !SHA256.test(entry.lfs.oid ?? "")
      || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
    return { path: entry.path, type: "file", oid: entry.oid,
      sizeBytes: entry.size, lfsSha256: `sha256:${entry.lfs.oid}` };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const files = projection.filter((entry) => entry.type === "file");
  const directories = projection.filter((entry) => entry.type === "directory");
  const selected = files.filter((entry) => selectedPath(entry.path));
  const videos = files.filter((entry) => entry.path.endsWith(".mp4"));
  const center = videos.filter((entry) => entry.path.includes("center_camera"));
  const left = videos.filter((entry) => entry.path.includes("left_camera"));
  const right = videos.filter((entry) => entry.path.includes("right_camera"));
  const bytes = (rows) => rows.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (projection.length !== 58 || files.length !== 46 || directories.length !== 12
    || bytes(files) !== 7_776_325_133 || selected.length !== 7
    || bytes(selected) !== 84_162_060 || videos.length !== 39
    || bytes(videos) !== 7_692_163_073 || center.length !== 11
    || left.length !== 14 || right.length !== 14) fail("TREE_PROFILE_INVALID");
  return { projection, files, directories, selected, videos, center, left, right,
    treeHash: digest("outsider/ur5e-sim-v6-recovery-tree/v1", projection) };
}

function parseNextLink(link) {
  if (link == null || link === "") return null;
  for (const part of link.split(",")) {
    const match = part.match(/^\s*<([^>]+)>;\s*rel="next"\s*$/u);
    if (match) {
      if (!permittedUrl(match[1])) fail("PAGINATION_URL_REFUSED", match[1]);
      return match[1];
    }
  }
  return null;
}

function ensureDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes, stable = true) {
  ensureDirectory(path.dirname(file));
  const value = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (existsSync(file)) {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) fail("FILE_UNSAFE", file);
    if (stable && !readFileSync(file).equals(value)) fail("CHECKPOINT_MISMATCH", file);
  } else writeFileSync(file, value, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function writeCanonical(file, value, stable = true) {
  writePrivate(file, canonicalBytes(value), stable);
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

function hashFile(file) {
  const hash = createHash("sha256");
  const handle = openSync(file, "r");
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  try {
    let offset = 0;
    for (;;) {
      const count = readSync(handle, buffer, 0, buffer.length, offset);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      offset += count;
    }
  } finally { closeSync(handle); }
  return `sha256:${hash.digest("hex")}`;
}

function scanFiles(root, excluded = new Set()) {
  const result = [];
  const directories = [root];
  for (let index = 0; index < directories.length; index += 1) {
    for (const entry of readdirSync(directories[index], { withFileTypes: true })) {
      const child = path.join(directories[index], entry.name);
      const relative = path.relative(root, child).split(path.sep).join("/");
      if (excluded.has(relative)) continue;
      if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", relative);
      if (entry.isDirectory()) directories.push(child);
      else if (entry.isFile()) result.push({ path: relative,
        bytes: statSync(child).size, sha256: hashFile(child) });
      else fail("SPECIAL_FILE_REFUSED", relative);
    }
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

async function mapConcurrent(values, concurrency, operation) {
  const results = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor++;
        results[index] = await operation(values[index], index);
      }
    }));
  return results;
}

function sanitizedUrl(value) {
  const parsed = new URL(value);
  return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
}

function validateObject(entry, file) {
  if (statSync(file).size !== entry.sizeBytes) fail("OBJECT_SIZE_INVALID", entry.path);
  const sha256 = hashFile(file);
  if (entry.lfsSha256 !== null) {
    if (sha256 !== entry.lfsSha256) fail("OBJECT_LFS_HASH_INVALID", entry.path);
  } else if (gitBlobOid(readFileSync(file)) !== entry.oid) {
    fail("OBJECT_GIT_HASH_INVALID", entry.path);
  }
  return sha256;
}

async function fetchDirectObject(entry, work, fetchImpl) {
  const target = safeJoin(work, `objects/${entry.path}`);
  const marker = safeJoin(work, `object-checkpoints/${entry.path}.json`);
  if (existsSync(marker) && existsSync(target)) {
    const record = jsonValue(readFileSync(marker), entry.path);
    if (record.path !== entry.path || validateObject(entry, target) !== record.sha256) {
      fail("OBJECT_CHECKPOINT_INVALID", entry.path);
    }
    return record;
  }
  const url = `${endpoints().raw}/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
  const response = await boundedFetch(url, { maximumBytes: entry.sizeBytes,
    expectedStatuses: [200], accept: "application/octet-stream,*/*;q=0.8" }, fetchImpl);
  if (response.bytes.length !== entry.sizeBytes) fail("OBJECT_BYTES_INVALID", entry.path);
  writePrivate(target, response.bytes);
  const sha256 = validateObject(entry, target);
  const record = { path: entry.path, bytes: entry.sizeBytes, sha256,
    oid: entry.oid, lfsSha256: entry.lfsSha256, status: response.status,
    finalUrl: sanitizedUrl(response.finalUrl), acquisition: "BOUNDED_DIRECT_GET",
    rangeChunks: 0 };
  writeCanonical(safeJoin(work, `http/objects/${entry.path}.headers.json`), {
    requestUrl: url, status: response.status,
    finalUrl: sanitizedUrl(response.finalUrl), headers: response.headers,
  }, false);
  writeCanonical(marker, record);
  return record;
}

async function acquireRangedObjects(entries, work, fetchImpl) {
  const profiles = await mapConcurrent(entries, entries.length, async (entry) => {
    const url = `${endpoints().raw}/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
    const response = await boundedFetch(url, { method: "HEAD",
      maximumBytes: entry.sizeBytes, expectedStatuses: [200], accept: "*/*" }, fetchImpl);
    const length = Number(response.headers["content-length"]);
    if (length !== entry.sizeBytes || !/bytes/iu.test(
      response.headers["accept-ranges"] ?? "")) fail("RANGE_HEAD_INVALID", entry.path);
    const key = entry.path.replaceAll("/", "__");
    const head = { path: entry.path, requestUrl: url, status: response.status,
      finalUrl: sanitizedUrl(response.finalUrl), contentLength: length,
      etag: response.headers.etag ?? null,
      acceptRanges: response.headers["accept-ranges"], headers: response.headers };
    writeCanonical(safeJoin(work, `http/ranges/${key}.head.json`), head, false);
    const ranges = [];
    for (let start = 0, index = 0; start < entry.sizeBytes;
      start += RANGE_CHUNK_BYTES, index += 1) {
      ranges.push({ entry, key, url, index, start,
        end: Math.min(entry.sizeBytes - 1, start + RANGE_CHUNK_BYTES - 1) });
    }
    return { entry, key, url, head, ranges };
  });
  const records = await mapConcurrent(profiles.flatMap((profile) => profile.ranges),
    RANGE_CONCURRENCY, async (task) => {
      const base = safeJoin(work, `range-checkpoints/${task.key}`);
      ensureDirectory(base);
      const part = safeJoin(base, `${String(task.index).padStart(4, "0")}.part`);
      const marker = safeJoin(base, `${String(task.index).padStart(4, "0")}.json`);
      if (existsSync(part) && existsSync(marker)) {
        const record = jsonValue(readFileSync(marker), `${task.key}:${task.index}`);
        if (record.start !== task.start || record.end !== task.end
          || statSync(part).size !== task.end - task.start + 1
          || hashFile(part) !== record.sha256) fail("RANGE_CHECKPOINT_INVALID", task.key);
        return record;
      }
      const response = await boundedFetch(task.url, {
        maximumBytes: task.end - task.start + 1, expectedStatuses: [206],
        accept: "application/octet-stream",
        headers: { Range: `bytes=${task.start}-${task.end}` },
      }, fetchImpl);
      const expectedRange = `bytes ${task.start}-${task.end}/${task.entry.sizeBytes}`;
      if (response.headers["content-range"] !== expectedRange
        || response.bytes.length !== task.end - task.start + 1) {
        fail("RANGE_RESPONSE_INVALID", `${task.key}:${task.index}`);
      }
      writePrivate(part, response.bytes);
      const record = { path: task.entry.path, index: task.index,
        start: task.start, end: task.end, status: response.status,
        contentRange: response.headers["content-range"], bytes: response.bytes.length,
        sha256: ur5eSimV6Sha256(response.bytes),
        finalUrl: sanitizedUrl(response.finalUrl), etag: response.headers.etag ?? null };
      writeCanonical(marker, record);
      return record;
    });
  const byPath = new Map(entries.map((entry) => [entry.path, []]));
  for (const record of records) byPath.get(record.path).push(record);
  const objectRecords = [];
  for (const profile of profiles) {
    const entry = profile.entry;
    const target = safeJoin(work, `objects/${entry.path}`);
    const ranges = byPath.get(entry.path).sort((left, right) => left.index - right.index);
    if (existsSync(target) && statSync(target).size !== entry.sizeBytes) rmSync(target);
    if (!existsSync(target)) {
      ensureDirectory(path.dirname(target));
      const handle = openSync(target, "wx", 0o600);
      try {
        let offset = 0;
        for (const range of ranges) {
          const part = safeJoin(work,
            `range-checkpoints/${profile.key}/${String(range.index).padStart(4, "0")}.part`);
          const bytes = readFileSync(part);
          if (range.start !== offset || writeSync(handle, bytes, 0, bytes.length, offset)
            !== bytes.length) fail("RANGE_ASSEMBLY_INVALID", entry.path);
          offset += bytes.length;
        }
        if (offset !== entry.sizeBytes) fail("RANGE_ASSEMBLY_SIZE", entry.path);
        fsyncSync(handle);
      } finally { closeSync(handle); }
      chmodSync(target, 0o600);
    }
    const sha256 = validateObject(entry, target);
    const rangeLog = { schema: "outsider/ur5e-sim-v6-recovery-http-ranges/v1",
      path: entry.path, requestUrl: profile.url, contentLength: entry.sizeBytes,
      chunkBytes: RANGE_CHUNK_BYTES, ranges };
    writeCanonical(safeJoin(work, `http/ranges/${profile.key}.ranges.json`), rangeLog);
    const record = { path: entry.path, bytes: entry.sizeBytes, sha256,
      oid: entry.oid, lfsSha256: entry.lfsSha256,
      acquisition: "STRICT_HTTP_RANGE_ASSEMBLY", status: 206,
      finalUrl: profile.head.finalUrl, rangeChunks: ranges.length,
      rangeLogHash: digest("outsider/ur5e-sim-v6-recovery-range-log/v1", ranges) };
    writeCanonical(safeJoin(work, `object-checkpoints/${entry.path}.json`), record);
    objectRecords.push(record);
  }
  return objectRecords;
}

async function captureTreePages(label, work, fetchImpl) {
  let next = endpoints().tree;
  const entries = [];
  const pages = [];
  for (let page = 0; next !== null; page += 1) {
    if (page >= 100) fail("TREE_PAGE_LIMIT");
    const response = await fetchJson(next, fetchImpl);
    if (!Array.isArray(response.value)) fail("TREE_PAGE_INVALID", String(page));
    const pageName = `page-${String(page).padStart(3, "0")}`;
    writePrivate(safeJoin(work, `api/${label}/tree/${pageName}.json`), response.bytes);
    const link = response.headers.link ?? null;
    const nextUrl = parseNextLink(link);
    const record = { page, requestUrl: next, status: response.status,
      finalUrl: sanitizedUrl(response.finalUrl), entries: response.value.length,
      link, nextUrl: nextUrl === null ? null : sanitizedUrl(nextUrl),
      headers: response.headers };
    writeCanonical(safeJoin(work,
      `api/${label}/tree/${pageName}.headers.json`), record, false);
    pages.push({ page, entries: response.value.length,
      pageHash: ur5eSimV6Sha256(response.bytes), hasNext: nextUrl !== null });
    entries.push(...response.value);
    next = nextUrl;
  }
  return { tree: projectTree(entries), pages };
}

async function captureApi(label, work, fetchImpl) {
  const repository = await fetchJson(endpoints().repository, fetchImpl);
  writePrivate(safeJoin(work, `api/${label}/repository.json`), repository.bytes);
  const paged = await captureTreePages(label, work, fetchImpl);
  return { repository: repositoryProjection(repository.value), ...paged };
}

function sourceManifestBody(before, after, objects, sourceFiles) {
  const videoModalities = [
    { key: "center_camera", files: before.tree.center.length,
      bytes: before.tree.center.reduce((sum, row) => sum + row.sizeBytes, 0) },
    { key: "left_camera", files: before.tree.left.length,
      bytes: before.tree.left.reduce((sum, row) => sum + row.sizeBytes, 0) },
    { key: "right_camera", files: before.tree.right.length,
      bytes: before.tree.right.reduce((sum, row) => sum + row.sizeBytes, 0) },
  ];
  return {
    schema: UR5E_SIM_V6_SOURCE_SCHEMA, frozenAt: UR5E_SIM_V6_FROZEN_AT,
    dataset: { id: UR5E_SIM_V6_ID, revision: UR5E_SIM_V6_REVISION },
    before: { repository: before.repository, treeHash: before.tree.treeHash,
      treePages: before.pages },
    after: { repository: after.repository, treeHash: after.tree.treeHash,
      treePages: after.pages },
    tree: before.tree.projection, remoteObjects: objects,
    terminalDispositions: before.tree.files.map((entry) => ({
      path: entry.path, bytes: entry.sizeBytes,
      disposition: selectedPath(entry.path) ? "ACQUIRED_AND_REPLAYED"
        : "TREE_INVENTORY_ONLY_NOT_ACQUIRED",
      reason: selectedPath(entry.path) ? "COMPLETE_SEMANTIC_NO_VIDEO_CLOSURE"
        : "ALL_VIDEO_MODALITIES_EXCLUDED_ZERO_SELECTED_VIDEO_BYTES",
    })),
    closure: {
      recursiveTreeCapturedBeforeAndAfter: true,
      recursiveTreePagesBefore: before.pages.length,
      recursiveTreePagesAfter: after.pages.length,
      recursiveTreeEntries: 58, recursiveTreeDirectories: 12,
      recursiveTreeFiles: 46, recursiveTreeBytes: 7_776_325_133,
      noFurtherTreePageBefore: before.pages.at(-1)?.hasNext === false,
      noFurtherTreePageAfter: after.pages.at(-1)?.hasNext === false,
      selectedFiles: 7, selectedBytes: 84_162_060,
      completeSemanticNoVideoClosure: true,
      allPublishedEpisodesInSelectedData: true,
      videoFilesInventoryOnly: 39, videoBytesInventoryOnly: 7_692_163_073,
      videoModalities, selectedVideoFiles: 0, selectedVideoBytes: 0,
      completeFixedRepositoryAcquired: false, randomTruncation: false,
      allRepositoryFilesHaveTerminalDisposition: true,
      repositoryUsedStorageBytes: 7_776_291_078,
      repositoryUsedStorageAndTreeBytesAreDistinctMeasures: true,
    },
    sourceFiles,
    sourceRoot: digest("outsider/ur5e-sim-v6-recovery-source-root/v1", sourceFiles),
  };
}

export async function acquirePinnedUr5eSimV6Source(sourceDirectory,
  options = {}) {
  if (existsSync(sourceDirectory)) fail("SOURCE_EXISTS", sourceDirectory);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_UNAVAILABLE");
  const work = options.checkpointDirectory ?? `${sourceDirectory}.checkpoint`;
  if (existsSync(work)) {
    const stat = lstatSync(work);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("CHECKPOINT_UNSAFE", work);
  } else mkdirSync(work, { recursive: true, mode: 0o700 });
  enforcePrivateTree(work);
  if (existsSync(safeJoin(work, "acquisition-manifest.json"))) {
    const completed = verifyUr5eSimV6SourceDirectory(work);
    if (!completed.ok) fail("COMPLETED_CHECKPOINT_INVALID", completed.error);
    ensureDirectory(path.dirname(sourceDirectory));
    renameSync(work, sourceDirectory);
    chmodSync(sourceDirectory, 0o700);
    return verifyUr5eSimV6SourceDirectory(sourceDirectory);
  }
  writeCanonical(safeJoin(work, "source-checkpoint.json"), {
    schema: "outsider/ur5e-sim-v6-recovery-source-checkpoint/v1",
    target: path.resolve(sourceDirectory), revision: UR5E_SIM_V6_REVISION,
  });
  const before = await captureApi("before", work, fetchImpl);
  const direct = before.tree.selected.filter((entry) =>
    entry.sizeBytes <= RANGE_THRESHOLD_BYTES);
  const ranged = before.tree.selected.filter((entry) =>
    entry.sizeBytes > RANGE_THRESHOLD_BYTES);
  const [directRecords, rangeRecords] = await Promise.all([
    mapConcurrent(direct, DIRECT_CONCURRENCY,
      (entry) => fetchDirectObject(entry, work, fetchImpl)),
    acquireRangedObjects(ranged, work, fetchImpl),
  ]);
  const objects = [...directRecords, ...rangeRecords]
    .sort((left, right) => left.path.localeCompare(right.path));
  const after = await captureApi("after", work, fetchImpl);
  if (!same(before.repository, after.repository)
    || before.tree.treeHash !== after.tree.treeHash
    || !same(before.pages, after.pages)) fail("SOURCE_CHANGED_DURING_ACQUISITION");
  for (const relative of ["object-checkpoints", "range-checkpoints"]) {
    const directory = safeJoin(work, relative);
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  }
  rmSync(safeJoin(work, "source-checkpoint.json"), { force: true });
  const sourceFiles = scanFiles(work, new Set(["acquisition-manifest.json"]));
  const body = sourceManifestBody(before, after, objects, sourceFiles);
  const manifest = { ...body,
    manifestHash: digest("outsider/ur5e-sim-v6-recovery-source-manifest/v1", body) };
  writeCanonical(safeJoin(work, "acquisition-manifest.json"), manifest);
  enforcePrivateTree(work);
  ensureDirectory(path.dirname(sourceDirectory));
  renameSync(work, sourceDirectory);
  chmodSync(sourceDirectory, 0o700);
  const checked = verifyUr5eSimV6SourceDirectory(sourceDirectory);
  if (!checked.ok) fail("ACQUIRED_SOURCE_INVALID", checked.error);
  return checked;
}

function readSource(sourceDirectory, relative) {
  const file = safeJoin(sourceDirectory, relative);
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o777) !== 0o600) {
    fail("SOURCE_FILE_MODE_INVALID", relative);
  }
  return file;
}

function readCapturedApi(sourceDirectory, label) {
  const repository = repositoryProjection(jsonValue(readFileSync(readSource(
    sourceDirectory, `api/${label}/repository.json`)), `${label}-repository`));
  const pages = [];
  const entries = [];
  for (let page = 0; ; page += 1) {
    const pageName = `page-${String(page).padStart(3, "0")}`;
    const jsonRelative = `api/${label}/tree/${pageName}.json`;
    const absolute = path.resolve(sourceDirectory, jsonRelative);
    if (!existsSync(absolute)) break;
    const bytes = readFileSync(readSource(sourceDirectory, jsonRelative));
    const value = jsonValue(bytes, `${label}:${pageName}`);
    const headers = jsonValue(readFileSync(readSource(sourceDirectory,
      `api/${label}/tree/${pageName}.headers.json`)), `${label}:${pageName}:headers`);
    entries.push(...value);
    pages.push({ page, entries: value.length, pageHash: ur5eSimV6Sha256(bytes),
      hasNext: headers.nextUrl !== null });
    if (headers.nextUrl === null) break;
  }
  if (pages.length === 0) fail("CAPTURED_TREE_EMPTY", label);
  return { repository, tree: projectTree(entries), pages };
}

export function verifyUr5eSimV6SourceDirectory(sourceDirectory) {
  try {
    const root = lstatSync(sourceDirectory);
    if (root.isSymbolicLink() || !root.isDirectory() || (root.mode & 0o777) !== 0o700) {
      fail("SOURCE_DIRECTORY_MODE_INVALID");
    }
    const manifest = jsonValue(readFileSync(readSource(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== UR5E_SIM_V6_SOURCE_SCHEMA
      || manifest.frozenAt !== UR5E_SIM_V6_FROZEN_AT
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_SHAPE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest(
      "outsider/ur5e-sim-v6-recovery-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    const actual = scanFiles(sourceDirectory, new Set(["acquisition-manifest.json"]));
    if (!same(actual, manifest.sourceFiles)
      || manifest.sourceRoot !== digest(
        "outsider/ur5e-sim-v6-recovery-source-root/v1", actual)) {
      fail("SOURCE_ROOT_INVALID");
    }
    const before = readCapturedApi(sourceDirectory, "before");
    const after = readCapturedApi(sourceDirectory, "after");
    if (!same(before.repository, after.repository)
      || before.tree.treeHash !== after.tree.treeHash
      || before.tree.treeHash !== manifest.before.treeHash
      || !same(before.pages, after.pages)
      || before.pages.length !== 1 || before.pages[0].hasNext !== false) {
      fail("API_BRACKET_INVALID");
    }
    if (!Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 7) {
      fail("OBJECT_CLOSURE_INVALID");
    }
    const selected = new Map(before.tree.selected.map((entry) => [entry.path, entry]));
    for (const record of manifest.remoteObjects) {
      const entry = selected.get(record.path);
      if (!entry || record.bytes !== entry.sizeBytes || validateObject(entry,
        readSource(sourceDirectory, `objects/${record.path}`)) !== record.sha256) {
        fail("OBJECT_INVALID", record.path);
      }
      if (record.rangeChunks > 0) {
        const key = record.path.replaceAll("/", "__");
        const log = jsonValue(readFileSync(readSource(sourceDirectory,
          `http/ranges/${key}.ranges.json`)), `range-log:${record.path}`);
        if (!Array.isArray(log.ranges) || log.ranges.length !== record.rangeChunks
          || digest("outsider/ur5e-sim-v6-recovery-range-log/v1", log.ranges)
            !== record.rangeLogHash) fail("RANGE_LOG_INVALID", record.path);
      }
    }
    if (!Array.isArray(manifest.terminalDispositions)
      || manifest.terminalDispositions.length !== 46
      || manifest.terminalDispositions.filter((row) =>
        row.disposition === "ACQUIRED_AND_REPLAYED").length !== 7
      || manifest.terminalDispositions.filter((row) =>
        row.disposition === "TREE_INVENTORY_ONLY_NOT_ACQUIRED").length !== 39) {
      fail("DISPOSITION_INVALID");
    }
    if (manifest.closure?.selectedFiles !== 7
      || manifest.closure?.selectedBytes !== 84_162_060
      || manifest.closure?.completeSemanticNoVideoClosure !== true
      || manifest.closure?.selectedVideoFiles !== 0
      || manifest.closure?.selectedVideoBytes !== 0
      || manifest.closure?.completeFixedRepositoryAcquired !== false
      || manifest.closure?.allRepositoryFilesHaveTerminalDisposition !== true) {
      fail("CLOSURE_INVALID");
    }
    return { ok: true, manifest, before, after,
      verificationLevel: "PINNED_COMPLETE_NO_VIDEO_ALL_EPISODE_CLOSURE" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Replay and the standalone artifact are appended after acquisition so every
// schema, count, label, and missingness assertion is fixed from source bytes.

const PYTHON_UR5E_SIM_V6_REPLAY = String.raw`
import collections
import hashlib
import json
import math
import os
import sys

import numpy as np
import pyarrow.parquet as pq

root = os.path.realpath(sys.argv[1])
objects = os.path.realpath(os.path.join(root, "objects"))

def die(code, detail=""):
    raise SystemExit("UR5E_SIM_V6_REPLAY_" + code
                     + ((":" + detail) if detail else ""))

def obj(relative):
    value = os.path.realpath(os.path.join(objects, relative))
    if not value.startswith(objects + os.sep) or not os.path.isfile(value):
        die("PATH", relative)
    return value

def read_text(relative):
    with open(obj(relative), "r", encoding="utf-8", errors="strict") as handle:
        return handle.read()

def read_json(relative):
    with open(obj(relative), "r", encoding="utf-8") as handle:
        return json.load(handle,
                         parse_constant=lambda value: die("JSON_NONFINITE", relative))

def canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False).encode("utf-8")

def logical_hash(value):
    return "sha256:" + hashlib.sha256(canonical_bytes(value)).hexdigest()

def raw_hash(array, dtype):
    value = np.asarray(array, dtype=dtype)
    return "sha256:" + hashlib.sha256(value.tobytes(order="C")).hexdigest()

def schema_projection(table):
    return [{"name": field.name, "type": str(field.type),
             "nullable": field.nullable} for field in table.schema]

def parquet(relative):
    file = obj(relative)
    reader = pq.ParquetFile(file)
    table = reader.read()
    schema = schema_projection(table)
    return reader, table, {"path": relative, "bytes": os.path.getsize(file),
      "rows": table.num_rows, "rowGroups": reader.num_row_groups,
      "fields": table.num_columns, "columns": table.column_names,
      "schema": schema, "schemaHash": logical_hash(schema),
      "nullValues": sum(table[name].null_count for name in table.column_names)}

data_source, data, data_report = parquet("data/chunk-000/file-000.parquet")
episode_source, episode_table, episode_report = parquet(
    "meta/episodes/chunk-000/file-000.parquet")
tasks_source, tasks_table, tasks_report = parquet("meta/tasks.parquet")

expected_data_columns = ["observation.state", "action", "timestamp",
  "frame_index", "episode_index", "index", "task_index"]
if data.num_rows != 384618 or data.num_columns != 7 \
   or data_source.num_row_groups != 1410 \
   or data.column_names != expected_data_columns:
    die("DATA_PROFILE")
if episode_table.num_rows != 1410 or episode_table.num_columns != 121 \
   or episode_source.num_row_groups != 141:
    die("EPISODE_PROFILE")
if tasks_table.column_names != ["task_index", "__index_level_0__"] \
   or tasks_source.num_row_groups != 1:
    die("TASK_SCHEMA")
tasks_rows = tasks_table.to_pylist()
expected_tasks = [
  {"task_index": 0, "__index_level_0__": "insert_sfp_port_0"},
  {"task_index": 1, "__index_level_0__": "insert_sfp_port_1"},
  {"task_index": 2, "__index_level_0__": "insert_sc"},
]
if tasks_rows != expected_tasks:
    die("TASK_ROWS")
if data_report["nullValues"] != 0 or episode_report["nullValues"] != 0 \
   or tasks_report["nullValues"] != 0:
    die("NULL_VALUES")

values = {name: data[name].to_pylist() for name in data.column_names}
episodes = episode_table.to_pylist()
indices = np.asarray(values["index"], dtype=np.int64)
episode_indices = np.asarray(values["episode_index"], dtype=np.int64)
frame_indices = np.asarray(values["frame_index"], dtype=np.int64)
task_indices = np.asarray(values["task_index"], dtype=np.int64)
timestamps = np.asarray(values["timestamp"], dtype=np.float64)
state = np.asarray(values["observation.state"], dtype=np.float32)
actions = np.asarray(values["action"], dtype=np.float32)
if not np.array_equal(indices, np.arange(384618, dtype=np.int64)) \
   or not np.array_equal(np.unique(episode_indices),
                         np.arange(1410, dtype=np.int64)) \
   or set(task_indices.tolist()) != {0, 1, 2}:
    die("INDEX_CENSUS")
if state.shape != (384618, 26) or actions.shape != (384618, 6) \
   or not np.isfinite(state).all() or not np.isfinite(actions).all() \
   or not np.isfinite(timestamps).all():
    die("NUMERIC_VALUES")

same_episode = episode_indices[1:] == episode_indices[:-1]
transition_rows = int(same_episode.sum())
if transition_rows != 383208:
    die("TRANSITION_ROWS")
continuity = {}
for name, array in [("observation.state", state), ("action", actions)]:
    differences = np.abs(array[1:] - array[:-1])[same_episode]
    continuity[name] = {"rowsWithValues": int(array.shape[0]),
      "width": int(array.shape[1]), "finite": True,
      "withinEpisodeTransitions": int(differences.shape[0]),
      "maximumAbsoluteStep": float(differences.max()),
      "meanAbsoluteStep": float(differences.mean(dtype=np.float64)),
      "rootMeanSquareStep": float(np.sqrt(np.mean(
          differences.astype(np.float64) ** 2))),
      "exactRepeatedTransitionRows": int(np.all(differences == 0, axis=1).sum())}

task_map = {row["task_index"]: row["__index_level_0__"] for row in tasks_rows}
cameras = ["left_camera", "center_camera", "right_camera"]
camera_expected_ranges = {
  "left_camera": [[0,128],[128,259],[259,386],[386,519],[519,647],
    [647,774],[774,888],[888,968],[968,1047],[1047,1128],[1128,1207],
    [1207,1283],[1283,1357],[1357,1410]],
  "center_camera": [[0,150],[150,297],[297,450],[450,602],[602,750],
    [750,894],[894,1020],[1020,1148],[1148,1271],[1271,1390],[1390,1410]],
  "right_camera": [[0,143],[143,284],[284,428],[428,566],[566,702],
    [702,837],[837,929],[929,1012],[1012,1093],[1093,1175],[1175,1257],
    [1257,1333],[1333,1409],[1409,1410]],
}
camera_windows = {camera: collections.defaultdict(list) for camera in cameras}
camera_image_stat_counts = {camera: [] for camera in cameras}
task_episode_counts = collections.Counter()
task_frame_counts = collections.Counter()
task_sequence = []
lengths = []
episode_crosswalk = []
stable_episode_stat_max_error = 0.0
data_stat_fields = ["observation.state", "action", "timestamp", "frame_index",
                    "episode_index", "index", "task_index"]
previous_stop = 0
for expected_episode, episode in enumerate(episodes):
    start = episode["dataset_from_index"]
    stop = episode["dataset_to_index"]
    length = episode["length"]
    task_index = int(task_indices[start])
    task = task_map[task_index]
    if episode["episode_index"] != expected_episode or start != previous_stop \
       or stop - start != length or episode["data/chunk_index"] != 0 \
       or episode["data/file_index"] != 0 \
       or episode["meta/episodes/chunk_index"] != 0 \
       or episode["meta/episodes/file_index"] != 0:
        die("EPISODE_RANGE", str(expected_episode))
    previous_stop = stop
    if not np.all(episode_indices[start:stop] == expected_episode) \
       or not np.array_equal(frame_indices[start:stop], np.arange(length)) \
       or not np.all(task_indices[start:stop] == task_index) \
       or episode["tasks"] != [task]:
        die("EPISODE_DATA_TASK", str(expected_episode))
    timestamp_error = float(np.max(np.abs(
        timestamps[start:stop] - frame_indices[start:stop] / 20.0)))
    if timestamp_error > 0.000001:
        die("EPISODE_TIMESTAMP", str(expected_episode))
    video_projection = {}
    image_count = None
    for camera in cameras:
        prefix = "videos/observation.images." + camera
        file_index = episode[prefix + "/file_index"]
        expected_file = next(index for index, interval
          in enumerate(camera_expected_ranges[camera])
          if interval[0] <= expected_episode < interval[1])
        if episode[prefix + "/chunk_index"] != 0 or file_index != expected_file:
            die("VIDEO_FILE_INDEX", camera + ":" + str(expected_episode))
        window_from = episode[prefix + "/from_timestamp"]
        window_to = episode[prefix + "/to_timestamp"]
        windows = camera_windows[camera][file_index]
        expected_from = windows[-1][1] if windows else 0.0
        if abs(window_from - expected_from) > 0.000000001 \
           or abs((window_to - window_from) - length / 20.0) > 0.000000001:
            die("VIDEO_WINDOW", camera + ":" + str(expected_episode))
        windows.append((window_from, window_to, length))
        count = episode["stats/observation.images.%s/count" % camera][0]
        camera_image_stat_counts[camera].append(count)
        if image_count is None:
            image_count = count
        elif count != image_count:
            die("CAMERA_IMAGE_STAT_COUNT_MISMATCH", str(expected_episode))
        video_projection[camera] = {"fileIndex": file_index,
          "fromTimestamp": window_from, "toTimestamp": window_to}
    for key in data_stat_fields:
        array = np.asarray(values[key][start:stop], dtype=float)
        if array.ndim == 1:
            array = array[:, None]
        if episode["stats/%s/count" % key] != [length]:
            die("EPISODE_STAT_COUNT", str(expected_episode) + ":" + key)
        for stat, computed in [("min", array.min(axis=0)),
                               ("max", array.max(axis=0)),
                               ("mean", array.mean(axis=0))]:
            observed = np.asarray(episode["stats/%s/%s" % (key, stat)],
                                  dtype=float)
            stable_episode_stat_max_error = max(stable_episode_stat_max_error,
              float(np.max(np.abs(observed - computed))))
    lengths.append(length)
    task_sequence.append(task)
    task_episode_counts[task] += 1
    task_frame_counts[task] += length
    episode_crosswalk.append({"episodeIndex": expected_episode,
      "length": length, "datasetFromIndex": start, "datasetToIndex": stop,
      "taskIndex": task_index, "task": task,
      "timestampMaxAbsoluteErrorFromFrameOver20": timestamp_error,
      "publisherImageStatisticCountPerCamera": image_count,
      "videoMetadata": video_projection})
if previous_stop != 384618 or sum(lengths) != 384618 \
   or min(lengths) != 130 or max(lengths) != 634 \
   or stable_episode_stat_max_error > 0.000004:
    die("EPISODE_CLOSURE")

task_runs = []
run_start = 0
for index in range(1, len(task_sequence) + 1):
    if index == len(task_sequence) or task_sequence[index] != task_sequence[run_start]:
        task_runs.append({"task": task_sequence[run_start],
          "episodeFromInclusive": run_start, "episodeToExclusive": index,
          "episodes": index - run_start})
        run_start = index
expected_task_runs = [
  {"task": "insert_sfp_port_0", "episodeFromInclusive": 0,
   "episodeToExclusive": 413, "episodes": 413},
  {"task": "insert_sfp_port_1", "episodeFromInclusive": 413,
   "episodeToExclusive": 858, "episodes": 445},
  {"task": "insert_sc", "episodeFromInclusive": 858,
   "episodeToExclusive": 1410, "episodes": 552},
]
if task_runs != expected_task_runs:
    die("TASK_RUNS")

camera_file_summaries = {}
for camera in cameras:
    ranges = []
    metadata_frames = []
    durations = []
    for file_index in sorted(camera_windows[camera]):
        windows = camera_windows[camera][file_index]
        ranges.append(camera_expected_ranges[camera][file_index])
        metadata_frames.append(sum(row[2] for row in windows))
        durations.append(windows[-1][1])
    if ranges != camera_expected_ranges[camera] \
       or sum(metadata_frames) != 384618:
        die("CAMERA_METADATA_CLOSURE", camera)
    camera_file_summaries[camera] = {"files": len(ranges),
      "episodeRanges": ranges, "metadataWindowFramesByFile": metadata_frames,
      "metadataWindowDurationsSecondsByFile": durations,
      "metadataWindowFrames": sum(metadata_frames)}

global_timestamp_decreases = int(np.sum(timestamps[1:] < timestamps[:-1]))
within_timestamp_decreases = int(np.sum(same_episode
    & (timestamps[1:] < timestamps[:-1])))
global_frame_decreases = int(np.sum(frame_indices[1:] < frame_indices[:-1]))
if global_timestamp_decreases != 1409 or within_timestamp_decreases != 0 \
   or global_frame_decreases != 1409:
    die("ORDER")

info = read_json("meta/info.json")
if info.get("codebase_version") != "v3.0" or info.get("robot_type") != "ur5e" \
   or info.get("total_episodes") != 1410 \
   or info.get("total_frames") != 384618 or info.get("total_tasks") != 3 \
   or info.get("fps") != 20 or info.get("splits") != {"train": "0:1410"}:
    die("INFO_PROFILE")
features = info.get("features", {})
expected_feature_keys = ["observation.images.left_camera",
  "observation.images.center_camera", "observation.images.right_camera",
  "observation.state", "action", "timestamp", "frame_index", "episode_index",
  "index", "task_index"]
if list(features) != expected_feature_keys \
   or features["observation.state"].get("shape") != [26] \
   or features["action"].get("shape") != [6]:
    die("INFO_FEATURES")
for camera in cameras:
    feature = features["observation.images." + camera]
    if feature.get("shape") != [480, 640, 3] \
       or feature.get("info", {}).get("video.codec") != "av1" \
       or feature["info"].get("video.fps") != 20 \
       or feature["info"].get("has_audio") is not False:
        die("INFO_CAMERA", camera)
expected_state_names = ["tcp_x", "tcp_y", "tcp_z", "tcp_qx", "tcp_qy",
  "tcp_qz", "tcp_qw", "tcp_vx", "tcp_vy", "tcp_vz", "tcp_wx", "tcp_wy",
  "tcp_wz", "joint_shoulder_pan", "joint_shoulder_lift", "joint_elbow",
  "joint_wrist_1", "joint_wrist_2", "joint_wrist_3", "gripper", "force_x",
  "force_y", "force_z", "torque_x", "torque_y", "torque_z"]
expected_action_names = ["d_tcp_x", "d_tcp_y", "d_tcp_z", "d_rot_x",
                         "d_rot_y", "d_rot_z"]
if features["observation.state"].get("names") != expected_state_names \
   or features["action"].get("names") != expected_action_names:
    die("CHANNEL_NAMES")

stats = read_json("meta/stats.json")
if set(stats) != set(features):
    die("STATS_KEYS")
def finite_tree(value):
    if isinstance(value, dict):
        return all(finite_tree(item) for item in value.values())
    if isinstance(value, list):
        return all(finite_tree(item) for item in value)
    return not isinstance(value, float) or math.isfinite(value)
if not finite_tree(stats):
    die("STATS_NONFINITE")
global_stat_max_error = 0.0
for key in data_stat_fields:
    if stats[key].get("count") != [384618]:
        die("GLOBAL_STAT_COUNT", key)
    array = np.asarray(values[key], dtype=float)
    if array.ndim == 1:
        array = array[:, None]
    for stat, computed in [("min", array.min(axis=0)),
                           ("max", array.max(axis=0)),
                           ("mean", array.mean(axis=0)),
                           ("std", array.std(axis=0))]:
        global_stat_max_error = max(global_stat_max_error,
          float(np.max(np.abs(np.asarray(stats[key][stat], dtype=float)
                              - computed))))
if global_stat_max_error > 0.000001:
    die("GLOBAL_STATS")

image_count_distribution = dict(sorted(collections.Counter(
    camera_image_stat_counts["left_camera"]).items()))
if any(camera_image_stat_counts[camera]
       != camera_image_stat_counts["left_camera"] for camera in cameras) \
   or sum(camera_image_stat_counts["left_camera"]) != 141219 \
   or any(stats["observation.images." + camera].get("count") != [141219]
          for camera in cameras):
    die("IMAGE_STATS")

semantic_names = [name.lower() for name in data.column_names
                  + episode_table.column_names + list(features)]
semantic_terms = ["intervention", "reward", "done", "success", "failure",
                  "recover", "attempt", "parent", "retry", "trial"]
semantic_matches = {term: sorted(set(name for name in semantic_names
                                     if term in name))
                    for term in semantic_terms}
if any(semantic_matches.values()):
    die("NATIVE_SEMANTIC_FIELD_UNEXPECTED", repr(semantic_matches))

readme = read_text("README.md")
attributes = read_text(".gitattributes")
readme_claims = {"apacheYamlClaim": "license: apache-2.0" in readme,
  "apacheBodyClaim": "**License:** apache-2.0" in readme,
  "roboticsCategoryClaim": "task_categories:\n- robotics" in readme,
  "recoveryTagClaim": "\n- recovery\n" in readme,
  "createdUsingLeRobot": "This dataset was created using" in readme
                          and "LeRobot" in readme,
  "infoBlockContains1410Episodes": '"total_episodes": 1410' in readme,
  "infoBlockContainsUr5e": '"robot_type": "ur5e"' in readme}
if not all(readme_claims.values()):
    die("README_CLAIMS")

numeric_content_hashes = {
  "stateFloat32LittleEndian": raw_hash(state, "<f4"),
  "actionFloat32LittleEndian": raw_hash(actions, "<f4"),
  "timestampFloat32LittleEndian": raw_hash(values["timestamp"], "<f4"),
  "frameIndexInt64LittleEndian": raw_hash(values["frame_index"], "<i8"),
  "episodeIndexInt64LittleEndian": raw_hash(values["episode_index"], "<i8"),
  "indexInt64LittleEndian": raw_hash(values["index"], "<i8"),
  "taskIndexInt64LittleEndian": raw_hash(values["task_index"], "<i8"),
}

data_summary = {**data_report,
  "schemaHash": logical_hash(schema_projection(data)),
  "numericContentHashes": numeric_content_hashes,
  "numericContentRoot": logical_hash(numeric_content_hashes),
  "globalIndicesContiguousZeroThrough384617": True,
  "episodeIndicesContiguousZeroThrough1409": True,
  "duplicateGlobalIndices": 0, "actionWidth": 6, "stateWidth": 26,
  "nonfiniteActionValues": 0, "nonfiniteStateValues": 0,
  "nonfiniteTimestamps": 0,
  "globalTimestampDecreasesAtEpisodeReset": global_timestamp_decreases,
  "withinEpisodeTimestampDecreases": within_timestamp_decreases,
  "globalFrameIndexDecreasesAtEpisodeReset": global_frame_decreases,
  "timestampEqualsFrameIndexOver20MaxAbsoluteError": float(np.max(
      np.abs(timestamps - frame_indices / 20.0))),
  "withinEpisodeTransitionRows": transition_rows,
  "continuity": continuity, "physicalContinuityThresholdApplied": False,
  "rawActionStateValuesProjected": False}

episode_rows_hash = logical_hash(episodes)
episode_summary = {**episode_report,
  "logicalRowsHash": episode_rows_hash,
  "episodeIndicesContiguousZeroThrough1409": True,
  "sumEpisodeLengths": sum(lengths), "minimumEpisodeLength": min(lengths),
  "maximumEpisodeLength": max(lengths), "episodeLengthsHash": logical_hash(lengths),
  "datasetRangesContiguousNoGapsOrOverlaps": True,
  "episodeDataFrameTimestampTaskCrosswalkExact": True,
  "stableEpisodeStatMaxAbsoluteError": stable_episode_stat_max_error,
  "taskRuns": task_runs,
  "taskSequenceHash": logical_hash(task_sequence),
  "taskEpisodeCounts": dict(task_episode_counts),
  "taskFrameCounts": dict(task_frame_counts),
  "taskTransitionsInPublishedOrder": 2,
  "cameraFileMetadata": camera_file_summaries,
  "cameraImageStatisticCountDistribution": {
      str(key): value for key, value in image_count_distribution.items()},
  "cameraImageStatisticCountPerModality": 141219,
  "cameraImageStatisticCountsIdenticalAcrossModalities": True,
  "episodeCrosswalk": episode_crosswalk,
  "rawPerEpisodeStatisticsProjected": False}

result = {
  "data": data_summary, "episodes": episode_summary,
  "tasks": {**tasks_report, "logicalRowsHash": logical_hash(tasks_rows),
    "records": tasks_rows,
    "taskStrings": [row["__index_level_0__"] for row in tasks_rows]},
  "info": {"bytes": os.path.getsize(obj("meta/info.json")),
    "logicalHash": logical_hash(info), "codebaseVersion": "v3.0",
    "publisherDeclaredRobotType": "ur5e", "episodes": 1410,
    "frames": 384618, "tasks": 3, "fps": 20,
    "split": {"train": "0:1410"}, "featureKeys": list(features),
    "stateShape": [26], "actionShape": [6],
    "stateChannelNames": expected_state_names,
    "actionChannelNames": expected_action_names,
    "stateChannelGroups": {"tcpPose": 7, "tcpVelocity": 6,
      "jointPosition": 6, "gripper": 1, "force": 3, "torque": 3},
    "actionChannelGroups": {"deltaTranslation": 3, "deltaRotation": 3},
    "forceTorqueChannelsPresent": True,
    "forceTorqueUnitsDeclared": False,
    "forceTorqueCalibrationReceiptPresent": False,
    "cameraShapes": {camera: [480, 640, 3] for camera in cameras},
    "publisherDeclaredVideoCodec": "av1", "rawPathsProjected": False},
  "stats": {"bytes": os.path.getsize(obj("meta/stats.json")),
    "logicalHash": logical_hash(stats), "keys": list(stats), "jsonFinite": True,
    "globalNumericStatMaxAbsoluteError": global_stat_max_error,
    "imageStatisticCountPerModality": 141219,
    "imageStatisticCountIsVideoFrameCount": False,
    "imagePixelsOrFramesReplayed": False,
    "rawStatisticsProjected": False},
  "documents": {"readme": {"bytes": len(readme.encode("utf-8")),
      "claims": readme_claims, "rawTextProjected": False},
    "gitAttributes": {"bytes": len(attributes.encode("utf-8")),
      "lfsPatternLines": sum("filter=lfs" in line
                             for line in attributes.splitlines())}},
  "videoMetadataOnly": {"modalities": camera_file_summaries,
    "inventoryFiles": 39, "inventoryBytes": 7692163073,
    "videoFilesAcquired": 0, "videoBytesAcquired": 0,
    "videoContainersReplayed": 0, "videoSamplesReplayed": 0,
    "publisherMetadataWindowFramesPerModality": 384618,
    "publisherMetadataWindowFramesAreVerifiedVideoSamples": False,
    "pixelsDecoded": False, "pixelsProjected": False},
  "nativeSemantics": {"searchedFieldTerms": semantic_terms,
    "matchingFields": semantic_matches,
    "interventionFieldPresent": False, "rewardFieldPresent": False,
    "doneFieldPresent": False, "successFieldPresent": False,
    "failureFieldPresent": False, "recoveryFieldPresent": False,
    "attemptIdFieldPresent": False, "attemptParentFieldPresent": False,
    "retryFieldPresent": False,
    "repositoryNameContainsSimulationAndRecovery": True,
    "readmeRecoveryTagPresent": True,
    "taskStringsContainRecovery": False,
    "repositoryAndCardNamingAreNotNativeOutcomeOrRecoveryLabels": True,
    "orderedEpisodeIndexIsNotAttemptLineage": True,
    "contiguousTaskGroupsDoNotEstablishAttemptChronology": True},
  "safety": {"publisherCodeExecuted": False, "publisherCommandsExecuted": False,
    "videoBytesAcquired": False, "videoPixelsDecoded": False,
    "videoPixelsProjected": False, "rawActionStateValuesProjected": False},
}
print(json.dumps(result, sort_keys=True, separators=(",", ":"),
                 ensure_ascii=False, allow_nan=False))
`;

export function runUr5eSimV6Replay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const executed = spawnSync(python, ["-c", PYTHON_UR5E_SIM_V6_REPLAY,
    path.resolve(sourceDirectory)], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  if (executed.error) fail("REPLAY_PYTHON_FAILED", executed.error.message);
  if (executed.status !== 0) fail("REPLAY_FAILED",
    String(executed.stderr || executed.stdout).trim());
  let replay;
  try { replay = JSON.parse(executed.stdout); }
  catch (error) { fail("REPLAY_JSON_INVALID", error.message); }
  if (replay.data?.rows !== 384_618 || replay.episodes?.rows !== 1_410
    || replay.tasks?.rows !== 3
    || replay.nativeSemantics?.recoveryFieldPresent !== false
    || replay.nativeSemantics?.successFieldPresent !== false
    || replay.videoMetadataOnly?.videoBytesAcquired !== 0
    || replay.safety?.publisherCodeExecuted !== false) fail("REPLAY_RESULT_INVALID");
  return replay;
}

function artifactBody(verified, replay) {
  return {
    schema: UR5E_SIM_V6_ARTIFACT_SCHEMA,
    frozenAt: UR5E_SIM_V6_FROZEN_AT,
    status: "PINNED_COMPLETE_NO_VIDEO_ALL_EPISODE_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: { id: UR5E_SIM_V6_ID, revision: UR5E_SIM_V6_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure },
    replay,
    typedDenominators: {
      SOURCE_NATIVE_EPISODE: 1_410,
      ACTION_STATE_FRAME: 384_618,
      TASK_DEFINITION: 3,
      PUBLISHER_IMAGE_STAT_SAMPLE_PER_MODALITY: 141_219,
      VIDEO_FILE_INVENTORY: 39,
      crossTotal: null,
    },
    publisherNamingBoundary: {
      repositoryName: "aic_ur5e_sim_v6_recovery",
      repositorySimulationTokenPresent: true,
      repositoryRecoveryTokenPresent: true,
      cardRecoveryTagPresent: true,
      simulationTokenIsIndependentProvenance: false,
      recoveryTokenIsSourceNativeRecoveryLabel: false,
      recoveryTokenIsOutcomeLabel: false,
    },
    semantics: {
      publisherDeclaredRobotType: "ur5e",
      publisherSimulationNamingClaimPresent: true,
      simulationProvenanceIndependentlyVerified: false,
      realRobotPhysicalProvenanceEstablished: false,
      sourceNativeActionStateTrajectoryPresent: true,
      sourceNativeMechanicsChannelsPresent: true,
      sourceNativeForceTorqueChannelsPresent: true,
      forceTorqueUnitsDeclared: false,
      forceTorqueCalibrationReceiptPresent: false,
      independentHardwareIdentityWitnessPresent: false,
      sourceNativeOutcomeLabelPresent: false,
      sourceNativeFailureLabelPresent: false,
      sourceNativeRecoveryLabelPresent: false,
      sourceNativeInterventionLabelPresent: false,
      sourceNativeRewardPresent: false, sourceNativeDonePresent: false,
      publisherOutcomeEstablished: false,
      reliableOutcomeEstablished: false,
      independentOutcomeEstablished: false,
      directCausalEffectEstablished: false,
      recoveryEstablished: false,
      correctionWithinEpisodeEstablished: false,
      attemptIdentityEstablished: false,
      attemptParentLineageEstablished: false,
      attemptChronologyEstablished: false,
      completeAttemptCensusEstablished: false,
      delegationEstablished: false,
    },
    rights: {
      datasetCardLicenseClaim: "Apache-2.0",
      readmeLicenseClaim: "Apache-2.0",
      rootLicenseFilePresent: false,
      upstreamLeRobotRightsIndependentlyAdjudicated: false,
      robotTelemetryRightsIndependentlyAdjudicated: false,
      excludedVisualContentRightsIndependentlyAdjudicated: false,
      legalConclusionEstablished: false,
      productionTrainingAuthorized: false,
      evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    },
    privacy: {
      rawArtifactPrivate: true, directoryMode: "0700", fileMode: "0600",
      selectedVisualBytesPresent: false,
      rawTelemetryPresent: true, noPiiGuaranteed: false,
      privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false,
      rawActionStateValuesProjected: false,
      videoPixelsDecoded: false, videoPixelsProjected: false,
    },
    boundary: { privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
      action: 1, mechanicsTelemetry: 1, publisherRobotTypeClaim: 1,
      publisherSimulationClaim: 1, independentSimulationProvenance: 0,
      physicalObservation: 0, independentHardwareWitness: 0,
      publisherOutcome: 0, reliableOutcome: 0, independentOutcome: 0,
      directCausalEffect: 0, recovery: 0, intervention: 0,
      attemptLineage: 0, attemptCensus: 0, delegation: 0, externalEffect: 0 },
  };
}

export function ur5eSimV6ArtifactHash(body) {
  return digest("outsider/ur5e-sim-v6-recovery/v1", body);
}

export function buildUr5eSimV6ArtifactFromSource(sourceDirectory,
  options = {}) {
  const verified = verifyUr5eSimV6SourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runUr5eSimV6Replay(sourceDirectory, options);
  const body = artifactBody(verified, replay);
  const artifact = { ...body, artifactHash: ur5eSimV6ArtifactHash(body) };
  const checked = verifyUr5eSimV6Artifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifyUr5eSimV6Artifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== UR5E_SIM_V6_ARTIFACT_SCHEMA
      || artifact.frozenAt !== UR5E_SIM_V6_FROZEN_AT
      || artifact.status !== "PINNED_COMPLETE_NO_VIDEO_ALL_EPISODE_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== ur5eSimV6ArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.closure?.selectedFiles !== 7
      || artifact.source?.closure?.selectedBytes !== 84_162_060
      || artifact.source?.closure?.selectedVideoBytes !== 0
      || artifact.source?.closure?.completeSemanticNoVideoClosure !== true
      || artifact.replay?.data?.rows !== 384_618
      || artifact.replay?.episodes?.rows !== 1_410
      || artifact.replay?.tasks?.rows !== 3
      || artifact.replay?.videoMetadataOnly?.videoBytesAcquired !== 0) {
      fail("REPLAY_INVALID");
    }
    if (!same(artifact.typedDenominators, {
      SOURCE_NATIVE_EPISODE: 1_410, ACTION_STATE_FRAME: 384_618,
      TASK_DEFINITION: 3, PUBLISHER_IMAGE_STAT_SAMPLE_PER_MODALITY: 141_219,
      VIDEO_FILE_INVENTORY: 39, crossTotal: null })) fail("DENOMINATOR_INVALID");
    if (artifact.publisherNamingBoundary?.simulationTokenIsIndependentProvenance
        !== false
      || artifact.publisherNamingBoundary?.recoveryTokenIsSourceNativeRecoveryLabel
        !== false
      || artifact.semantics?.sourceNativeOutcomeLabelPresent !== false
      || artifact.semantics?.sourceNativeRecoveryLabelPresent !== false
      || artifact.semantics?.publisherOutcomeEstablished !== false
      || artifact.semantics?.independentOutcomeEstablished !== false
      || artifact.semantics?.directCausalEffectEstablished !== false
      || artifact.semantics?.recoveryEstablished !== false
      || artifact.semantics?.attemptIdentityEstablished !== false
      || artifact.semantics?.attemptParentLineageEstablished !== false
      || artifact.semantics?.attemptChronologyEstablished !== false
      || artifact.semantics?.completeAttemptCensusEstablished !== false) {
      fail("SEMANTIC_PROMOTION");
    }
    if (artifact.rights?.rootLicenseFilePresent !== false
      || artifact.rights?.legalConclusionEstablished !== false
      || artifact.rights?.productionTrainingAuthorized !== false
      || artifact.privacy?.rawArtifactPrivate !== true
      || artifact.privacy?.noPiiGuaranteed !== false) fail("GATE_INVALID");
    if (!same(artifact.boundary, { privacy: 0, training: 0, network: 0,
      authority: 0, CEU: 0, action: 1, mechanicsTelemetry: 1,
      publisherRobotTypeClaim: 1, publisherSimulationClaim: 1,
      independentSimulationProvenance: 0, physicalObservation: 0,
      independentHardwareWitness: 0, publisherOutcome: 0, reliableOutcome: 0,
      independentOutcome: 0, directCausalEffect: 0, recovery: 0,
      intervention: 0, attemptLineage: 0, attemptCensus: 0, delegation: 0,
      externalEffect: 0 })) fail("BOUNDARY_INVALID");
    return { ok: true, artifactHash,
      verificationLevel:
        "STANDALONE_HASH_TYPED_SIM_NAMING_AND_NO_NATIVE_RECOVERY_BOUNDARY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyUr5eSimV6ArtifactWithSource(artifact, sourceDirectory,
  options = {}) {
  const standalone = verifyUr5eSimV6Artifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildUr5eSimV6ArtifactFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel:
        "FULL_PARQUET_EPISODE_TASK_STATS_AND_VIDEO_METADATA_WINDOW_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
