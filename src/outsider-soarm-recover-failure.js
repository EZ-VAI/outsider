/*
 * Fixed-revision SO-ARM101 source closure for MikeChenYZ/soarm-recover-failure.
 * The selected slice contains every non-video semantic object and the complete
 * wrist-camera modality across all published episodes.  Oversized top-camera
 * files and non-semantic Finder files remain exact tree-bound dispositions.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const SOARM_RECOVER_ID = "MikeChenYZ/soarm-recover-failure";
export const SOARM_RECOVER_REVISION =
  "15322666a3d0b29a0705c201b67f927a9df520ff";
export const SOARM_RECOVER_FROZEN_AT = "2026-08-30T00:00:00.000Z";
export const SOARM_RECOVER_SOURCE_SCHEMA =
  "outsider/soarm-recover-failure-source/v1";
export const SOARM_RECOVER_ARTIFACT_SCHEMA =
  "outsider/soarm-recover-failure/v1";
export const SOARM_RECOVER_PROFILE = Object.freeze({
  usedStorage: 551_588_945,
  treeEntries: 34, treeDirectories: 10, treeFiles: 24,
  treeBytes: 551_629_823,
  selectedFiles: 17, selectedBytes: 88_249_046,
  semanticNoVideoFiles: 13, semanticNoVideoBytes: 1_377_650,
  wristVideoFiles: 4, wristVideoBytes: 86_871_396,
  topVideoFiles: 4, topVideoBytes: 463_362_333,
  finderFiles: 3, finderBytes: 18_444,
  publishedEpisodes: 44,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_API_BYTES = 8 * 1024 * 1024;
const RANGE_CHUNK_BYTES = 4 * 1024 * 1024;
const FETCH_ATTEMPTS = 6;
const DIRECT_CONCURRENCY = 8;
const RANGE_CONCURRENCY = 6;

function fail(code, detail = null) {
  throw new Error(detail === null ? `SOARM_RECOVER_${code}`
    : `SOARM_RECOVER_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function soarmRecoverSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return soarmRecoverSha256(Buffer.from(
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
  const encoded = SOARM_RECOVER_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${SOARM_RECOVER_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${SOARM_RECOVER_REVISION}`
      + "?recursive=true&expand=false&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${SOARM_RECOVER_REVISION}`,
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
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 180_000);
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
    taskCategories: value.cardData?.task_categories ?? null, siblingPaths };
  if (projection.id !== SOARM_RECOVER_ID
    || projection.sha !== SOARM_RECOVER_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false
    || projection.usedStorage !== SOARM_RECOVER_PROFILE.usedStorage
    || projection.cardLicense !== "apache-2.0" || siblingPaths.length !== 24
    || siblingPaths.some((entry) => !safeRemotePath(entry))) {
    fail("REPOSITORY_PROFILE_INVALID");
  }
  return projection;
}

function selectedPath(remotePath) {
  return remotePath === ".gitattributes" || remotePath === "README.md"
    || remotePath.startsWith("data/") || remotePath.startsWith("meta/")
    || remotePath.startsWith("videos/observation.images.wrist/")
      && remotePath.endsWith(".mp4");
}

function disposition(entry) {
  if (selectedPath(entry.path)) return {
    disposition: "ACQUIRED_AND_REPLAYED",
    reason: entry.path.includes("observation.images.wrist")
      ? "COMPLETE_WRIST_MODALITY" : "COMPLETE_SEMANTIC_NO_VIDEO_CLOSURE",
  };
  if (entry.path.endsWith(".DS_Store")) return {
    disposition: "TREE_INVENTORY_ONLY_NOT_ACQUIRED",
    reason: "NON_SEMANTIC_FINDER_METADATA",
  };
  return { disposition: "TREE_INVENTORY_ONLY_NOT_ACQUIRED",
    reason: "OVERSIZED_TOP_CAMERA_MODALITY_EXCLUDED_COMPLETE_WRIST_SELECTED" };
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
  const wrist = selected.filter((entry) => entry.path.endsWith(".mp4"));
  const noVideo = selected.filter((entry) => !entry.path.endsWith(".mp4"));
  const top = files.filter((entry) => entry.path.startsWith(
    "videos/observation.images.top/") && entry.path.endsWith(".mp4"));
  const finder = files.filter((entry) => entry.path.endsWith(".DS_Store"));
  const bytes = (rows) => rows.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (projection.length !== 34 || files.length !== 24 || directories.length !== 10
    || bytes(files) !== 551_629_823 || selected.length !== 17
    || bytes(selected) !== 88_249_046 || noVideo.length !== 13
    || bytes(noVideo) !== 1_377_650 || wrist.length !== 4
    || bytes(wrist) !== 86_871_396 || top.length !== 4
    || bytes(top) !== 463_362_333 || finder.length !== 3
    || bytes(finder) !== 18_444) fail("TREE_PROFILE_INVALID");
  return { projection, files, directories, selected, wrist, noVideo, top, finder,
    treeHash: digest("outsider/soarm-recover-failure-tree/v1", projection) };
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
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
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
        const index = cursor;
        cursor += 1;
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
  const tasks = profiles.flatMap((profile) => profile.ranges);
  const records = await mapConcurrent(tasks, RANGE_CONCURRENCY, async (task) => {
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
      sha256: soarmRecoverSha256(response.bytes),
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
    const rangeLog = { schema: "outsider/soarm-recover-http-ranges/v1",
      path: entry.path, requestUrl: profile.url, contentLength: entry.sizeBytes,
      chunkBytes: RANGE_CHUNK_BYTES, ranges };
    writeCanonical(safeJoin(work, `http/ranges/${profile.key}.ranges.json`), rangeLog);
    const record = { path: entry.path, bytes: entry.sizeBytes, sha256,
      oid: entry.oid, lfsSha256: entry.lfsSha256,
      acquisition: "STRICT_HTTP_RANGE_ASSEMBLY", status: 206,
      finalUrl: profile.head.finalUrl, rangeChunks: ranges.length,
      rangeLogHash: digest("outsider/soarm-recover-range-log/v1", ranges) };
    writeCanonical(safeJoin(work, `object-checkpoints/${entry.path}.json`), record);
    objectRecords.push(record);
  }
  return objectRecords;
}

async function captureApi(label, work, fetchImpl) {
  const api = endpoints();
  const repository = await fetchJson(api.repository, fetchImpl);
  const tree = await fetchJson(api.tree, fetchImpl);
  writePrivate(safeJoin(work, `api/${label}/repository.json`), repository.bytes);
  writePrivate(safeJoin(work, `api/${label}/tree.json`), tree.bytes);
  return { repository: repositoryProjection(repository.value),
    tree: projectTree(tree.value) };
}

function sourceManifestBody(before, after, objects, sourceFiles) {
  const terminalDispositions = before.tree.files.map((entry) => ({
    path: entry.path, bytes: entry.sizeBytes, ...disposition(entry),
  }));
  return {
    schema: SOARM_RECOVER_SOURCE_SCHEMA, frozenAt: SOARM_RECOVER_FROZEN_AT,
    dataset: { id: SOARM_RECOVER_ID, revision: SOARM_RECOVER_REVISION },
    before: { repository: before.repository, treeHash: before.tree.treeHash },
    after: { repository: after.repository, treeHash: after.tree.treeHash },
    tree: before.tree.projection, remoteObjects: objects, terminalDispositions,
    closure: {
      recursiveTreeCapturedBeforeAndAfter: true,
      recursiveTreeEntries: 34, recursiveTreeDirectories: 10,
      recursiveTreeFiles: 24, recursiveTreeBytes: 551_629_823,
      selectedFiles: 17, selectedBytes: 88_249_046,
      semanticNoVideoFiles: 13, semanticNoVideoBytes: 1_377_650,
      completeSemanticNoVideoClosure: true,
      wristVideoFiles: 4, wristVideoBytes: 86_871_396,
      completeWristVideoModality: true,
      allPublishedEpisodesInSelectedData: true,
      topVideoFilesInventoryOnly: 4, topVideoBytesInventoryOnly: 463_362_333,
      finderFilesInventoryOnly: 3, finderBytesInventoryOnly: 18_444,
      completeFixedRepositoryAcquired: false, randomTruncation: false,
      allRepositoryFilesHaveTerminalDisposition: true,
      repositoryUsedStorageBytes: 551_588_945,
      repositoryUsedStorageAndTreeBytesAreDistinctMeasures: true,
    },
    sourceFiles,
    sourceRoot: digest("outsider/soarm-recover-failure-source-root/v1", sourceFiles),
  };
}

export async function acquirePinnedSoarmRecoverSource(sourceDirectory,
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
  // A prior process may have completed receipt construction but stopped before
  // the final rename.  Promote that verified checkpoint without refetching.
  if (existsSync(safeJoin(work, "acquisition-manifest.json"))) {
    const completed = verifySoarmRecoverSourceDirectory(work);
    if (!completed.ok) fail("COMPLETED_CHECKPOINT_INVALID", completed.error);
    ensureDirectory(path.dirname(sourceDirectory));
    renameSync(work, sourceDirectory);
    chmodSync(sourceDirectory, 0o700);
    return verifySoarmRecoverSourceDirectory(sourceDirectory);
  }
  writeCanonical(safeJoin(work, "source-checkpoint.json"), {
    schema: "outsider/soarm-recover-failure-source-checkpoint/v1",
    target: path.resolve(sourceDirectory), revision: SOARM_RECOVER_REVISION,
  });
  const before = await captureApi("before", work, fetchImpl);
  const direct = before.tree.selected.filter((entry) => !entry.path.endsWith(".mp4"));
  const ranged = before.tree.wrist;
  const [directRecords, rangeRecords] = await Promise.all([
    mapConcurrent(direct, DIRECT_CONCURRENCY,
      (entry) => fetchDirectObject(entry, work, fetchImpl)),
    acquireRangedObjects(ranged, work, fetchImpl),
  ]);
  const objects = [...directRecords, ...rangeRecords]
    .sort((left, right) => left.path.localeCompare(right.path));
  const after = await captureApi("after", work, fetchImpl);
  if (!same(before.repository, after.repository)
    || before.tree.treeHash !== after.tree.treeHash) fail("SOURCE_CHANGED_DURING_ACQUISITION");
  for (const relative of ["object-checkpoints", "range-checkpoints"]) {
    const directory = safeJoin(work, relative);
    if (existsSync(directory)) rmSync(directory, { recursive: true, force: true });
  }
  rmSync(safeJoin(work, "source-checkpoint.json"), { force: true });
  const sourceFiles = scanFiles(work, new Set(["acquisition-manifest.json"]));
  const body = sourceManifestBody(before, after, objects, sourceFiles);
  const manifest = { ...body,
    manifestHash: digest("outsider/soarm-recover-failure-source-manifest/v1", body) };
  writeCanonical(safeJoin(work, "acquisition-manifest.json"), manifest);
  enforcePrivateTree(work);
  ensureDirectory(path.dirname(sourceDirectory));
  renameSync(work, sourceDirectory);
  chmodSync(sourceDirectory, 0o700);
  const checked = verifySoarmRecoverSourceDirectory(sourceDirectory);
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

export function verifySoarmRecoverSourceDirectory(sourceDirectory) {
  try {
    const root = lstatSync(sourceDirectory);
    if (root.isSymbolicLink() || !root.isDirectory() || (root.mode & 0o777) !== 0o700) {
      fail("SOURCE_DIRECTORY_MODE_INVALID");
    }
    const manifest = jsonValue(readFileSync(readSource(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== SOARM_RECOVER_SOURCE_SCHEMA
      || manifest.frozenAt !== SOARM_RECOVER_FROZEN_AT
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_SHAPE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/soarm-recover-failure-source-manifest/v1",
      body)) fail("MANIFEST_HASH_INVALID");
    const actual = scanFiles(sourceDirectory, new Set(["acquisition-manifest.json"]));
    if (!same(actual, manifest.sourceFiles)
      || manifest.sourceRoot
        !== digest("outsider/soarm-recover-failure-source-root/v1", actual)) {
      fail("SOURCE_ROOT_INVALID");
    }
    const beforeRepo = repositoryProjection(jsonValue(readFileSync(readSource(
      sourceDirectory, "api/before/repository.json")), "before-repo"));
    const afterRepo = repositoryProjection(jsonValue(readFileSync(readSource(
      sourceDirectory, "api/after/repository.json")), "after-repo"));
    const beforeTree = projectTree(jsonValue(readFileSync(readSource(
      sourceDirectory, "api/before/tree.json")), "before-tree"));
    const afterTree = projectTree(jsonValue(readFileSync(readSource(
      sourceDirectory, "api/after/tree.json")), "after-tree"));
    if (!same(beforeRepo, afterRepo) || beforeTree.treeHash !== afterTree.treeHash
      || beforeTree.treeHash !== manifest.before.treeHash) fail("API_BRACKET_INVALID");
    if (!Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 17) {
      fail("OBJECT_CLOSURE_INVALID");
    }
    const selected = new Map(beforeTree.selected.map((entry) => [entry.path, entry]));
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
          || digest("outsider/soarm-recover-range-log/v1", log.ranges)
            !== record.rangeLogHash) fail("RANGE_LOG_INVALID", record.path);
      }
    }
    if (!Array.isArray(manifest.terminalDispositions)
      || manifest.terminalDispositions.length !== 24
      || manifest.terminalDispositions.filter((row) =>
        row.disposition === "ACQUIRED_AND_REPLAYED").length !== 17
      || manifest.terminalDispositions.filter((row) =>
        row.disposition === "TREE_INVENTORY_ONLY_NOT_ACQUIRED").length !== 7) {
      fail("DISPOSITION_INVALID");
    }
    if (manifest.closure?.selectedFiles !== 17
      || manifest.closure?.selectedBytes !== 88_249_046
      || manifest.closure?.completeSemanticNoVideoClosure !== true
      || manifest.closure?.completeWristVideoModality !== true
      || manifest.closure?.completeFixedRepositoryAcquired !== false
      || manifest.closure?.allRepositoryFilesHaveTerminalDisposition !== true) {
      fail("CLOSURE_INVALID");
    }
    return { ok: true, manifest,
      before: { repository: beforeRepo, tree: beforeTree },
      after: { repository: afterRepo, tree: afterTree },
      verificationLevel:
        "PINNED_ALL_EPISODE_NO_VIDEO_PLUS_COMPLETE_WRIST_MODALITY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// Replay and artifact construction are appended after the source bytes have
// been acquired, so their assertions can be pinned to the actual Parquet and
// ISO-BMFF structures rather than inferred from repository naming.

const PYTHON_SOARM_RECOVER_REPLAY = String.raw`
import hashlib
import json
import math
import os
import struct
import sys

import numpy as np
import pyarrow as pa
import pyarrow.parquet as pq

root = os.path.realpath(sys.argv[1])
objects = os.path.realpath(os.path.join(root, "objects"))

def die(code, detail=""):
    raise SystemExit("SOARM_RECOVER_REPLAY_" + code + (":" + detail if detail else ""))

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
        return json.load(handle, parse_constant=lambda value: die("JSON_NONFINITE", relative))

def canonical_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False, allow_nan=False).encode("utf-8")

def logical_hash(value):
    return "sha256:" + hashlib.sha256(canonical_bytes(value)).hexdigest()

def schema_projection(table):
    return [{"name": field.name, "type": str(field.type), "nullable": field.nullable}
            for field in table.schema]

def parquet(relative):
    file = obj(relative)
    source = pq.ParquetFile(file)
    table = source.read()
    return source, table, {"path": relative, "bytes": os.path.getsize(file),
      "rows": table.num_rows, "rowGroups": source.num_row_groups,
      "columns": table.num_columns, "schema": schema_projection(table),
      "schemaHash": logical_hash(schema_projection(table)),
      "logicalRowsHash": logical_hash(table.to_pylist()),
      "nullValues": sum(table[name].null_count for name in table.column_names)}

data_relatives = ["data/chunk-000/file-%03d.parquet" % index for index in range(4)]
episode_relatives = ["meta/episodes/chunk-000/file-%03d.parquet" % index
                     for index in range(4)]
data_loaded = [parquet(relative) for relative in data_relatives]
episode_loaded = [parquet(relative) for relative in episode_relatives]
tasks_source, tasks_table, tasks_report = parquet("meta/tasks.parquet")
data_tables = [item[1] for item in data_loaded]
episode_tables = [item[1] for item in episode_loaded]
data_reports = [item[2] for item in data_loaded]
episode_reports = [item[2] for item in episode_loaded]

if [item.num_rows for item in data_tables] != [4993, 3991, 6611, 9592] \
   or [item[0].num_row_groups for item in data_loaded] != [10, 10, 10, 14]:
    die("DATA_SHARDS")
if [item.num_rows for item in episode_tables] != [10, 10, 10, 14] \
   or [item[0].num_row_groups for item in episode_loaded] != [1, 1, 1, 2]:
    die("EPISODE_SHARDS")
data_schemas = [schema_projection(table) for table in data_tables]
episode_schemas = [schema_projection(table) for table in episode_tables]
if any(value != data_schemas[0] for value in data_schemas[1:]):
    die("DATA_SCHEMA_DRIFT")
if any(value != episode_schemas[0] for value in episode_schemas[1:]):
    die("EPISODE_SCHEMA_DRIFT")

expected_data_columns = ["action", "observation.state", "timestamp", "frame_index",
                         "episode_index", "index", "task_index"]
if data_tables[0].column_names != expected_data_columns:
    die("DATA_COLUMNS")
if len(episode_tables[0].column_names) != 107:
    die("EPISODE_COLUMNS", str(len(episode_tables[0].column_names)))
essential_episode_columns = {"episode_index", "tasks", "length", "data/chunk_index",
  "data/file_index", "dataset_from_index", "dataset_to_index",
  "videos/observation.images.top/chunk_index",
  "videos/observation.images.top/file_index",
  "videos/observation.images.top/from_timestamp",
  "videos/observation.images.top/to_timestamp",
  "videos/observation.images.wrist/chunk_index",
  "videos/observation.images.wrist/file_index",
  "videos/observation.images.wrist/from_timestamp",
  "videos/observation.images.wrist/to_timestamp", "meta/episodes/chunk_index",
  "meta/episodes/file_index"}
if not essential_episode_columns.issubset(episode_tables[0].column_names):
    die("EPISODE_ESSENTIAL_COLUMNS")

data = pa.concat_tables(data_tables)
episode_table = pa.concat_tables(episode_tables)
if data.num_rows != 25187 or episode_table.num_rows != 44:
    die("TOTAL_ROWS")
values = {name: data[name].to_pylist() for name in data.column_names}
episodes = episode_table.to_pylist()
if sum(data[name].null_count for name in data.column_names) != 0 \
   or sum(episode_table[name].null_count for name in episode_table.column_names) != 0:
    die("NULL_VALUES")
if values["index"] != list(range(25187)) \
   or sorted(set(values["episode_index"])) != list(range(44)) \
   or set(values["task_index"]) != {0}:
    die("DATA_INDEX_CENSUS")
if any(len(row) != 6 or any(not math.isfinite(float(item)) for item in row)
       for row in values["action"]):
    die("ACTION_VALUES")
if any(len(row) != 6 or any(not math.isfinite(float(item)) for item in row)
       for row in values["observation.state"]):
    die("STATE_VALUES")
if any(not math.isfinite(float(item)) for item in values["timestamp"]):
    die("TIMESTAMP_VALUES")

tasks_rows = tasks_table.to_pylist()
if tasks_table.column_names != ["task_index", "__index_level_0__"] \
   or tasks_rows != [{"task_index": 0, "__index_level_0__": "recover-from-failure"}]:
    die("TASK_TABLE")

episode_crosswalk = []
lengths = []
episode_stat_max_error = 0.0
previous_to = 0
file_episode_sets = [set() for _ in range(4)]
video_windows_by_file = [[] for _ in range(4)]
numeric_stat_fields = ["action", "observation.state", "timestamp", "frame_index",
                       "episode_index", "index", "task_index"]
for expected_index, episode in enumerate(episodes):
    if episode["episode_index"] != expected_index:
        die("EPISODE_INDEX")
    start = episode["dataset_from_index"]
    stop = episode["dataset_to_index"]
    length = episode["length"]
    file_index = episode["data/file_index"]
    wrist_file = episode["videos/observation.images.wrist/file_index"]
    top_file = episode["videos/observation.images.top/file_index"]
    if start != previous_to or stop - start != length or not 0 <= file_index < 4:
        die("EPISODE_RANGE", str(expected_index))
    previous_to = stop
    if episode["data/chunk_index"] != 0 or wrist_file != file_index \
       or top_file != file_index \
       or episode["videos/observation.images.wrist/chunk_index"] != 0 \
       or episode["videos/observation.images.top/chunk_index"] != 0 \
       or episode["meta/episodes/chunk_index"] != 0 \
       or episode["meta/episodes/file_index"] != file_index:
        die("EPISODE_FILE_CROSSWALK", str(expected_index))
    if values["episode_index"][start:stop] != [expected_index] * length \
       or values["frame_index"][start:stop] != list(range(length)) \
       or values["task_index"][start:stop] != [0] * length:
        die("EPISODE_DATA_CROSSWALK", str(expected_index))
    max_time_error = max(abs(float(values["timestamp"][row])
                             - values["frame_index"][row] / 30.0)
                         for row in range(start, stop))
    if max_time_error > 0.000001:
        die("EPISODE_TIMESTAMP", str(expected_index))
    wrist_from = episode["videos/observation.images.wrist/from_timestamp"]
    wrist_to = episode["videos/observation.images.wrist/to_timestamp"]
    top_from = episode["videos/observation.images.top/from_timestamp"]
    top_to = episode["videos/observation.images.top/to_timestamp"]
    if wrist_from != top_from or wrist_to != top_to \
       or abs((wrist_to - wrist_from) - length / 30.0) > 0.000000001:
        die("VIDEO_WINDOW", str(expected_index))
    expected_from = video_windows_by_file[file_index][-1][1] \
        if video_windows_by_file[file_index] else 0.0
    if abs(wrist_from - expected_from) > 0.000000001:
        die("VIDEO_WINDOW_CONTIGUITY", str(expected_index))
    video_windows_by_file[file_index].append((wrist_from, wrist_to))
    if episode["tasks"] != ["recover-from-failure"]:
        die("EPISODE_TASK", str(expected_index))
    for key in numeric_stat_fields:
        array = np.asarray(values[key][start:stop], dtype=float)
        if array.ndim == 1:
            array = array[:, None]
        for stat, computed in [("min", array.min(axis=0)),
                               ("max", array.max(axis=0)),
                               ("mean", array.mean(axis=0))]:
            observed = np.asarray(episode["stats/%s/%s" % (key, stat)], dtype=float)
            episode_stat_max_error = max(episode_stat_max_error,
                                         float(np.max(np.abs(computed - observed))))
        if episode["stats/%s/count" % key] != [length]:
            die("EPISODE_STAT_COUNT", str(expected_index) + ":" + key)
    file_episode_sets[file_index].add(expected_index)
    lengths.append(length)
    episode_crosswalk.append({"episodeIndex": expected_index, "length": length,
      "datasetFromIndex": start, "datasetToIndex": stop,
      "dataFileIndex": file_index, "wristFileIndex": wrist_file,
      "wristFromTimestamp": wrist_from, "wristToTimestamp": wrist_to,
      "timestampMaxAbsoluteErrorFromFrameOver30": max_time_error,
      "taskIndex": 0})
if previous_to != 25187 or min(lengths) != 172 or max(lengths) != 805:
    die("EPISODE_LENGTH_CENSUS")
if file_episode_sets != [set(range(0, 10)), set(range(10, 20)),
                         set(range(20, 30)), set(range(30, 44))]:
    die("SHARD_EPISODE_SETS")
if episode_stat_max_error > 0.0004:
    die("EPISODE_STAT_DRIFT", str(episode_stat_max_error))

global_timestamp_decreases = sum(
    values["timestamp"][index] < values["timestamp"][index - 1]
    for index in range(1, len(values["timestamp"])))
within_episode_timestamp_decreases = sum(
    values["episode_index"][index] == values["episode_index"][index - 1]
    and values["timestamp"][index] < values["timestamp"][index - 1]
    for index in range(1, len(values["timestamp"])))
if global_timestamp_decreases != 43 or within_episode_timestamp_decreases != 0:
    die("TIMESTAMP_ORDER")

info = read_json("meta/info.json")
if info.get("codebase_version") != "v3.0" \
   or info.get("robot_type") != "so101_follower" \
   or info.get("total_episodes") != 44 or info.get("total_frames") != 25187 \
   or info.get("total_tasks") != 1 or info.get("fps") != 30 \
   or info.get("splits") != {"train": "0:44"}:
    die("INFO_PROFILE")
if info.get("features", {}).get("action", {}).get("shape") != [6] \
   or info["features"]["observation.state"]["shape"] != [6] \
   or info["features"]["observation.images.wrist"]["shape"] != [480, 640, 3] \
   or info["features"]["observation.images.wrist"]["info"]["video.codec"] != "av1":
    die("INFO_FEATURES")

stats = read_json("meta/stats.json")
if set(stats) != set(info["features"]):
    die("STATS_KEYS")
def finite_tree(value):
    if isinstance(value, dict):
        return all(finite_tree(item) for item in value.values())
    if isinstance(value, list):
        return all(finite_tree(item) for item in value)
    return not isinstance(value, float) or math.isfinite(value)
if not finite_tree(stats):
    die("STATS_NONFINITE")
for key in numeric_stat_fields:
    if stats[key].get("count") != [25187]:
        die("GLOBAL_STAT_COUNT", key)
if stats["observation.images.top"].get("count") != [5376] \
   or stats["observation.images.wrist"].get("count") != [5376]:
    die("IMAGE_STAT_SAMPLE_COUNT")
global_stat_max_error = 0.0
for key in numeric_stat_fields:
    array = np.asarray(values[key], dtype=float)
    if array.ndim == 1:
        array = array[:, None]
    for stat, computed in [("min", array.min(axis=0)),
                           ("max", array.max(axis=0)),
                           ("mean", array.mean(axis=0))]:
        observed = np.asarray(stats[key][stat], dtype=float)
        global_stat_max_error = max(global_stat_max_error,
                                    float(np.max(np.abs(computed - observed))))
if global_stat_max_error > 0.00006:
    die("GLOBAL_STAT_DRIFT", str(global_stat_max_error))

semantic_names = [name.lower() for name in data.column_names
                  + episode_table.column_names + list(info["features"])]
semantic_terms = ["reward", "done", "success", "failure", "recover", "intervention"]
semantic_term_fields = {term: sorted(set(name for name in semantic_names if term in name))
                        for term in semantic_terms}
if any(semantic_term_fields.values()):
    die("OUTCOME_FIELD_UNEXPECTED", repr(semantic_term_fields))

readme = read_text("README.md")
attributes = read_text(".gitattributes")
readme_claims = {
  "apacheYamlClaim": bool("license: apache-2.0" in readme),
  "apacheBodyClaim": bool("License:** apache-2.0" in readme),
  "lerobotCreationClaim": bool("This dataset was created using" in readme
                                and "LeRobot" in readme),
  "infoBlockContains44Episodes": bool('"total_episodes": 44' in readme),
  "infoBlockContainsSo101Follower": bool('"robot_type": "so101_follower"' in readme),
}
if not all(readme_claims.values()):
    die("README_CLAIMS")

def boxes(data, start, end):
    offset = start
    out = []
    while offset + 8 <= end:
        size = struct.unpack_from(">I", data, offset)[0]
        typ = data[offset + 4:offset + 8].decode("latin1")
        header = 8
        if size == 1:
            if offset + 16 > end:
                die("MP4_EXTENDED_BOX")
            size = struct.unpack_from(">Q", data, offset + 8)[0]
            header = 16
        elif size == 0:
            size = end - offset
        if size < header or offset + size > end:
            die("MP4_BOX", typ)
        out.append((typ, offset + header, offset + size, size, offset))
        offset += size
    if offset != end:
        die("MP4_TRAILING", str(end - offset))
    return out

def children(data, container, wanted):
    return [item for item in boxes(data, container[1], container[2])
            if item[0] == wanted]

def child(data, container, wanted, required=True):
    found = children(data, container, wanted)
    if required and len(found) != 1:
        die("MP4_CHILD", wanted + ":" + str(len(found)))
    return found[0] if found else None

def fullbox_time(data, box):
    version = data[box[1]]
    if version == 0:
        timescale = struct.unpack_from(">I", data, box[1] + 12)[0]
        duration = struct.unpack_from(">I", data, box[1] + 16)[0]
    elif version == 1:
        timescale = struct.unpack_from(">I", data, box[1] + 20)[0]
        duration = struct.unpack_from(">Q", data, box[1] + 24)[0]
    else:
        die("MP4_FULLBOX_VERSION", str(version))
    if timescale <= 0:
        die("MP4_TIMESCALE")
    return timescale, duration

def count_table(data, box, entry_offset=4, width=4):
    count = struct.unpack_from(">I", data, box[1] + entry_offset)[0]
    if box[1] + entry_offset + 4 + count * width > box[2]:
        die("MP4_TABLE_LENGTH", box[0])
    return count

def parse_mp4(relative):
    with open(obj(relative), "rb") as handle:
        data_bytes = handle.read()
    top = boxes(data_bytes, 0, len(data_bytes))
    ftyp = [box for box in top if box[0] == "ftyp"]
    moov = [box for box in top if box[0] == "moov"]
    mdat = [box for box in top if box[0] == "mdat"]
    if len(ftyp) != 1 or len(moov) != 1 or len(mdat) != 1:
        die("MP4_TOP", relative)
    ftyp_payload = data_bytes[ftyp[0][1]:ftyp[0][2]]
    movie_scale, movie_duration = fullbox_time(data_bytes,
                                               child(data_bytes, moov[0], "mvhd"))
    tracks = []
    for trak in children(data_bytes, moov[0], "trak"):
        tkhd = child(data_bytes, trak, "tkhd")
        mdia = child(data_bytes, trak, "mdia")
        scale, duration = fullbox_time(data_bytes, child(data_bytes, mdia, "mdhd"))
        hdlr = child(data_bytes, mdia, "hdlr")
        handler = data_bytes[hdlr[1] + 8:hdlr[1] + 12].decode("latin1")
        stbl = child(data_bytes, child(data_bytes, mdia, "minf"), "stbl")
        stsd = child(data_bytes, stbl, "stsd")
        entry_count = struct.unpack_from(">I", data_bytes, stsd[1] + 4)[0]
        sample_start = stsd[1] + 8
        codec = data_bytes[sample_start + 4:sample_start + 8].decode("latin1")
        sample_width = struct.unpack_from(">H", data_bytes, sample_start + 32)[0] \
            if handler == "vide" else None
        sample_height = struct.unpack_from(">H", data_bytes, sample_start + 34)[0] \
            if handler == "vide" else None
        stsz = child(data_bytes, stbl, "stsz")
        default_sample_size = struct.unpack_from(">I", data_bytes, stsz[1] + 4)[0]
        sample_count = struct.unpack_from(">I", data_bytes, stsz[1] + 8)[0]
        if default_sample_size == 0:
            if stsz[1] + 12 + sample_count * 4 > stsz[2]:
                die("MP4_STSZ", relative)
            sample_bytes = sum(struct.unpack_from(">I", data_bytes,
                stsz[1] + 12 + index * 4)[0] for index in range(sample_count))
        else:
            sample_bytes = default_sample_size * sample_count
        stts = child(data_bytes, stbl, "stts")
        timing_entries = count_table(data_bytes, stts, 4, 8)
        timing_samples = sum(struct.unpack_from(">I", data_bytes,
            stts[1] + 8 + index * 8)[0] for index in range(timing_entries))
        stsc = child(data_bytes, stbl, "stsc")
        sample_to_chunk_entries = count_table(data_bytes, stsc, 4, 12)
        stco = child(data_bytes, stbl, "stco", required=False)
        co64 = child(data_bytes, stbl, "co64", required=False)
        if (stco is None) == (co64 is None):
            die("MP4_CHUNK_OFFSET_TABLE", relative)
        offsets_box = stco if stco is not None else co64
        offset_width = 4 if stco is not None else 8
        chunk_count = count_table(data_bytes, offsets_box, 4, offset_width)
        stss = child(data_bytes, stbl, "stss", required=False)
        sync_samples = count_table(data_bytes, stss, 4, 4) \
            if stss is not None else sample_count
        tracks.append({"handler": handler, "codec": codec,
          "sampleDescriptionEntries": entry_count, "sampleCount": sample_count,
          "sampleDataBytes": sample_bytes, "timingEntries": timing_entries,
          "timingSampleCount": timing_samples,
          "sampleToChunkEntries": sample_to_chunk_entries,
          "chunkOffsetTable": "stco" if stco is not None else "co64",
          "chunkCount": chunk_count, "syncSampleCount": sync_samples,
          "timescale": scale, "durationTicks": duration,
          "durationSeconds": duration / scale,
          "trackWidth": struct.unpack_from(">I", data_bytes, tkhd[2] - 8)[0] / 65536.0,
          "trackHeight": struct.unpack_from(">I", data_bytes, tkhd[2] - 4)[0] / 65536.0,
          "sampleWidth": sample_width, "sampleHeight": sample_height})
    return {"path": relative, "bytes": len(data_bytes),
      "topLevelBoxes": [box[0] for box in top],
      "topLevelBoxBytes": sum(box[3] for box in top),
      "majorBrand": ftyp_payload[:4].decode("latin1"),
      "minorVersion": struct.unpack_from(">I", ftyp_payload, 4)[0],
      "compatibleBrands": [ftyp_payload[index:index + 4].decode("latin1")
                           for index in range(8, len(ftyp_payload), 4)],
      "movieTimescale": movie_scale, "movieDurationTicks": movie_duration,
      "movieDurationSeconds": movie_duration / movie_scale,
      "mdatBoxes": len(mdat), "mdatBytes": sum(box[3] for box in mdat),
      "tracks": tracks}

video_relatives = [
  "videos/observation.images.wrist/chunk-000/file-%03d.mp4" % index
  for index in range(4)]
videos = [parse_mp4(relative) for relative in video_relatives]
video_tracks = [track for item in videos for track in item["tracks"]]
expected_video_rows = [4993, 3991, 6611, 9592]
if sum(item["bytes"] for item in videos) != 86871396 \
   or len(video_tracks) != 4 \
   or [track["sampleCount"] for track in video_tracks] != expected_video_rows \
   or any(track["handler"] != "vide" or track["codec"] != "av01"
          or track["sampleWidth"] != 640 or track["sampleHeight"] != 480
          or track["timingSampleCount"] != track["sampleCount"]
          for track in video_tracks) \
   or sum(track["sampleDataBytes"] for track in video_tracks) != 86715728:
    die("VIDEO_PROFILE")
for file_index, track in enumerate(video_tracks):
    if abs(track["durationSeconds"] - expected_video_rows[file_index] / 30.0) \
       > 0.000000001 \
       or abs(video_windows_by_file[file_index][-1][1]
              - track["durationSeconds"]) > 0.000000001:
        die("VIDEO_DATA_TIMING_CROSSWALK", str(file_index))

data_summary = {"files": data_reports, "rows": data.num_rows,
  "fields": data.num_columns, "columns": data.column_names,
  "schema": data_schemas[0], "schemaHash": logical_hash(data_schemas[0]),
  "schemaIdenticalAcrossShards": True,
  "logicalRowsHash": logical_hash(data.to_pylist()),
  "shardRows": [table.num_rows for table in data_tables],
  "shardRowGroups": [item[0].num_row_groups for item in data_loaded],
  "shardEpisodeRanges": [[min(group), max(group)] for group in file_episode_sets],
  "shardGlobalIndexRanges": [[table["index"][0].as_py(),
                               table["index"][-1].as_py()]
                              for table in data_tables],
  "globalIndicesContiguousZeroThrough25186": True,
  "duplicateGlobalIndices": 0, "crossShardIndexOverlap": 0,
  "episodeIndicesContiguousZeroThrough43": True,
  "actionWidth": 6, "stateWidth": 6,
  "nullValues": 0, "nonfiniteActionValues": 0,
  "nonfiniteStateValues": 0, "nonfiniteTimestamps": 0,
  "globalTimestampDecreasesAtEpisodeReset": global_timestamp_decreases,
  "withinEpisodeTimestampDecreases": within_episode_timestamp_decreases,
  "timestampEqualsFrameIndexOver30MaxAbsoluteError": max(
      row["timestampMaxAbsoluteErrorFromFrameOver30"] for row in episode_crosswalk),
  "rawActionStateValuesProjected": False}

episode_summary = {"files": episode_reports, "rows": episode_table.num_rows,
  "fields": episode_table.num_columns, "columns": episode_table.column_names,
  "schema": episode_schemas[0], "schemaHash": logical_hash(episode_schemas[0]),
  "schemaIdenticalAcrossShards": True,
  "logicalRowsHash": logical_hash(episode_table.to_pylist()),
  "shardRows": [table.num_rows for table in episode_tables],
  "episodeIndicesContiguousZeroThrough43": True,
  "duplicateEpisodeIndices": 0, "crossShardEpisodeOverlap": 0,
  "sumEpisodeLengths": sum(lengths), "minimumEpisodeLength": min(lengths),
  "maximumEpisodeLength": max(lengths), "episodeLengthsHash": logical_hash(lengths),
  "datasetRangesContiguousNoGapsOrOverlaps": True,
  "episodeDataFrameAndTaskCrosswalkExact": True,
  "dataAndVideoFileIndexCrosswalkExact": True,
  "topAndWristTimestampWindowsIdentical": True,
  "videoWindowsContiguousWithinEachFile": True,
  "videoWindowDurationEqualsEpisodeLengthOver30": True,
  "episodeNumericStatMaxAbsoluteError": episode_stat_max_error,
  "taskStrings": ["recover-from-failure"],
  "episodeCrosswalk": episode_crosswalk,
  "rawPerEpisodeStatisticsProjected": False}

video_summary = {"files": len(videos), "bytes": sum(item["bytes"] for item in videos),
  "tracks": len(video_tracks), "videoTracks": sum(
      track["handler"] == "vide" for track in video_tracks),
  "totalSamples": sum(track["sampleCount"] for track in video_tracks),
  "totalSampleDataBytes": sum(track["sampleDataBytes"] for track in video_tracks),
  "sampleCountsEqualDataShardRows": True,
  "trackDurationsEqualDataRowsOver30": True,
  "episodeWindowsCloseEachTrackDuration": True,
  "codecs": sorted(set(track["codec"] for track in video_tracks)),
  "dimensions": sorted(set(str(track["sampleWidth"]) + "x"
                           + str(track["sampleHeight"]) for track in video_tracks)),
  "containerReplay": videos, "pixelsDecoded": False,
  "visualInspectionPerformed": False, "pixelsProjected": False}

result = {
  "data": data_summary,
  "episodes": episode_summary,
  "tasks": {**tasks_report, "records": tasks_rows,
            "taskStrings": ["recover-from-failure"]},
  "info": {"bytes": os.path.getsize(obj("meta/info.json")),
    "logicalHash": logical_hash(info), "codebaseVersion": "v3.0",
    "publisherDeclaredRobotType": "so101_follower", "episodes": 44,
    "frames": 25187, "tasks": 1, "fps": 30, "split": {"train": "0:44"},
    "featureKeys": list(info["features"]), "actionShape": [6], "stateShape": [6],
    "wristShape": [480, 640, 3], "publisherDeclaredWristCodec": "av1",
    "rawPathsProjected": False},
  "stats": {"bytes": os.path.getsize(obj("meta/stats.json")),
    "logicalHash": logical_hash(stats), "keys": list(stats),
    "numericFieldCounts": {key: stats[key]["count"] for key in numeric_stat_fields},
    "topImageSampleStatCount": stats["observation.images.top"]["count"][0],
    "wristImageSampleStatCount": stats["observation.images.wrist"]["count"][0],
    "jsonFinite": True, "globalNumericStatMaxAbsoluteError": global_stat_max_error,
    "rawStatisticsProjected": False},
  "documents": {"readme": {"bytes": len(readme.encode("utf-8")),
      "claims": readme_claims, "rawTextProjected": False},
    "gitAttributes": {"bytes": len(attributes.encode("utf-8")),
      "lfsPatternLines": sum("filter=lfs" in line for line in attributes.splitlines())}},
  "video": video_summary,
  "nativeSemantics": {"searchedFieldTerms": semantic_terms,
    "matchingFields": semantic_term_fields, "rewardFieldPresent": False,
    "doneFieldPresent": False, "successFieldPresent": False,
    "failureFieldPresent": False, "recoveryFieldPresent": False,
    "interventionFieldPresent": False,
    "repositoryAndTaskRecoveryWordsArePublisherNamingClaimsOnly": True},
  "safety": {"publisherCodeExecuted": False, "publisherCommandsExecuted": False,
    "videoPixelsDecoded": False, "videoPixelsProjected": False,
    "rawActionStateValuesProjected": False},
}
print(json.dumps(result, sort_keys=True, separators=(",", ":"),
                 ensure_ascii=False, allow_nan=False))
`;

export function runSoarmRecoverReplay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const executed = spawnSync(python, ["-c", PYTHON_SOARM_RECOVER_REPLAY,
    path.resolve(sourceDirectory)], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (executed.error) fail("REPLAY_PYTHON_FAILED", executed.error.message);
  if (executed.status !== 0) fail("REPLAY_FAILED",
    String(executed.stderr || executed.stdout).trim());
  let replay;
  try { replay = JSON.parse(executed.stdout); }
  catch (error) { fail("REPLAY_JSON_INVALID", error.message); }
  if (replay.data?.rows !== 25_187 || replay.episodes?.rows !== 44
    || replay.video?.files !== 4 || replay.video?.totalSamples !== 25_187
    || replay.nativeSemantics?.successFieldPresent !== false
    || replay.nativeSemantics?.recoveryFieldPresent !== false
    || replay.safety?.publisherCodeExecuted !== false) fail("REPLAY_RESULT_INVALID");
  return replay;
}

function artifactBody(verified, replay) {
  return {
    schema: SOARM_RECOVER_ARTIFACT_SCHEMA,
    frozenAt: SOARM_RECOVER_FROZEN_AT,
    status: "PINNED_ALL_EPISODE_NO_VIDEO_PLUS_COMPLETE_WRIST_MODALITY_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: { id: SOARM_RECOVER_ID, revision: SOARM_RECOVER_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure },
    replay,
    typedDenominators: {
      SOURCE_NATIVE_EPISODE: 44,
      ACTION_STATE_FRAME: 25_187,
      WRIST_VIDEO_SAMPLE: 25_187,
      WRIST_VIDEO_FILE: 4,
      crossTotal: null,
    },
    publisherNamingBoundary: {
      repositoryName: "soarm-recover-failure",
      taskStrings: ["recover-from-failure"],
      repositoryNameIsOutcomeLabel: false,
      taskStringIsOutcomeLabel: false,
      failureOutcomeEstablishedByNaming: false,
      recoveryEstablishedByNaming: false,
    },
    semantics: {
      publisherDeclaredRobotType: "so101_follower",
      publisherHardwareTrajectoryClaimPresent: true,
      sourceNativeActionStateTrajectoryPresent: true,
      completeWristVisualModalityPresent: true,
      topVisualModalityAcquired: false,
      topVisualModalityExactInventoryPresent: true,
      independentHardwareIdentityWitnessPresent: false,
      independentPhysicalProvenanceVerified: false,
      sourceNativeOutcomeLabelPresent: false,
      sourceNativeFailureLabelPresent: false,
      sourceNativeRecoveryLabelPresent: false,
      rewardPresent: false, donePresent: false, interventionPresent: false,
      reliableOutcomeEstablished: false,
      independentOutcomeEstablished: false,
      directCausalEffectEstablished: false,
      recoveryEstablished: false,
      correctionWithinEpisodeEstablished: false,
      attemptChronologyEstablished: false,
      delegationEstablished: false,
      longitudinalDeviceIdentityEstablished: false,
    },
    rights: {
      datasetCardLicenseClaim: "Apache-2.0",
      readmeLicenseClaim: "Apache-2.0",
      rootLicenseFilePresent: false,
      upstreamLeRobotRightsIndependentlyAdjudicated: false,
      visualContentRightsIndependentlyAdjudicated: false,
      legalConclusionEstablished: false,
      productionTrainingAuthorized: false,
      evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    },
    privacy: {
      rawArtifactPrivate: true, directoryMode: "0700", fileMode: "0600",
      wristVisualDataPresent: true, noPiiGuaranteed: false,
      privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false,
      videoPixelsDecoded: false, videoPixelsProjected: false,
      rawActionStateValuesProjected: false,
    },
    boundary: { privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
      action: 1, physicalObservation: 1, publisherHardwareTrajectory: 1,
      independentHardwareWitness: 0, publisherOutcome: 0, reliableOutcome: 0,
      independentOutcome: 0, directCausalEffect: 0, recovery: 0,
      delegation: 0, externalEffect: 1 },
  };
}

export function soarmRecoverArtifactHash(body) {
  return digest("outsider/soarm-recover-failure/v1", body);
}

export function buildSoarmRecoverArtifactFromSource(sourceDirectory,
  options = {}) {
  const verified = verifySoarmRecoverSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runSoarmRecoverReplay(sourceDirectory, options);
  const body = artifactBody(verified, replay);
  const artifact = { ...body, artifactHash: soarmRecoverArtifactHash(body) };
  const checked = verifySoarmRecoverArtifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifySoarmRecoverArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== SOARM_RECOVER_ARTIFACT_SCHEMA
      || artifact.frozenAt !== SOARM_RECOVER_FROZEN_AT
      || artifact.status
        !== "PINNED_ALL_EPISODE_NO_VIDEO_PLUS_COMPLETE_WRIST_MODALITY_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== soarmRecoverArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.closure?.selectedFiles !== 17
      || artifact.source?.closure?.selectedBytes !== 88_249_046
      || artifact.source?.closure?.completeSemanticNoVideoClosure !== true
      || artifact.source?.closure?.completeWristVideoModality !== true
      || artifact.replay?.data?.rows !== 25_187
      || artifact.replay?.episodes?.rows !== 44
      || artifact.replay?.video?.totalSamples !== 25_187
      || artifact.replay?.video?.pixelsDecoded !== false) fail("REPLAY_INVALID");
    if (!same(artifact.typedDenominators, {
      SOURCE_NATIVE_EPISODE: 44, ACTION_STATE_FRAME: 25_187,
      WRIST_VIDEO_SAMPLE: 25_187, WRIST_VIDEO_FILE: 4, crossTotal: null })) {
      fail("DENOMINATOR_INVALID");
    }
    if (artifact.publisherNamingBoundary?.repositoryNameIsOutcomeLabel !== false
      || artifact.publisherNamingBoundary?.taskStringIsOutcomeLabel !== false
      || artifact.semantics?.sourceNativeOutcomeLabelPresent !== false
      || artifact.semantics?.sourceNativeFailureLabelPresent !== false
      || artifact.semantics?.sourceNativeRecoveryLabelPresent !== false
      || artifact.semantics?.recoveryEstablished !== false
      || artifact.semantics?.directCausalEffectEstablished !== false
      || artifact.semantics?.attemptChronologyEstablished !== false) {
      fail("SEMANTIC_PROMOTION");
    }
    if (artifact.semantics?.publisherDeclaredRobotType !== "so101_follower"
      || artifact.semantics?.sourceNativeActionStateTrajectoryPresent !== true
      || artifact.semantics?.independentHardwareIdentityWitnessPresent !== false
      || artifact.rights?.rootLicenseFilePresent !== false
      || artifact.rights?.legalConclusionEstablished !== false
      || artifact.rights?.productionTrainingAuthorized !== false
      || artifact.privacy?.rawArtifactPrivate !== true
      || artifact.privacy?.noPiiGuaranteed !== false) fail("GATE_INVALID");
    if (!same(artifact.boundary, { privacy: 0, training: 0, network: 0,
      authority: 0, CEU: 0, action: 1, physicalObservation: 1,
      publisherHardwareTrajectory: 1, independentHardwareWitness: 0,
      publisherOutcome: 0, reliableOutcome: 0, independentOutcome: 0,
      directCausalEffect: 0, recovery: 0, delegation: 0, externalEffect: 1 })) {
      fail("BOUNDARY_INVALID");
    }
    return { ok: true, artifactHash,
      verificationLevel:
        "STANDALONE_HASH_TYPED_PHYSICAL_TRAJECTORY_AND_NO_OUTCOME_BOUNDARY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifySoarmRecoverArtifactWithSource(artifact, sourceDirectory,
  options = {}) {
  const standalone = verifySoarmRecoverArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildSoarmRecoverArtifactFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel:
        "FULL_PARQUET_EPISODE_STATS_TASK_AND_WRIST_MP4_SAMPLE_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
