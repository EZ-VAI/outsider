/*
 * Fixed-revision bounded intake for FactoryBench/FactoryBench.  It closes the
 * complete 291,800,891-byte natural slice consisting of FactoryBench Lite,
 * UR 10 Hz telemetry, episode/flow metadata, the knowledge graph, and root
 * docs.  Every one of the repository's 18 files receives an explicit terminal
 * disposition.  Larger alternate QA/signal files remain tree-bound inventory.
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

export const FACTORYBENCH_ID = "FactoryBench/FactoryBench";
export const FACTORYBENCH_REVISION =
  "d0a3735b89eced7016e59e87eecf764287bc297c";
export const FACTORYBENCH_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const FACTORYBENCH_SOURCE_SCHEMA =
  "outsider/factorybench-bounded-source/v1";
export const FACTORYBENCH_ARTIFACT_SCHEMA =
  "outsider/factorybench-bounded-slice/v1";
export const FACTORYBENCH_PROFILE = Object.freeze({
  usedStorage: 13_427_184_505,
  treeEntries: 22, treeDirectories: 4, treeFiles: 18,
  treeBytes: 5_223_446_797,
  selectedFiles: 11, selectedBytes: 291_800_891,
  liteFiles: 4, liteBytes: 70_118_768,
  ur10Bytes: 220_910_648,
  supportFiles: 6, supportBytes: 771_475,
  unselectedFiles: 7, unselectedBytes: 4_931_645_906,
});

export const FACTORYBENCH_SELECTED_PATHS = Object.freeze([
  ".gitattributes", "README.md",
  "factorybench_lite/level_1.jsonl",
  "factorybench_lite/level_2.jsonl",
  "factorybench_lite/level_3.jsonl",
  "factorybench_lite/level_4.jsonl",
  "factorywave/episodes.parquet", "factorywave/flow.parquet",
  "factorywave/ur_signals_10hz.parquet",
  "knowledge_graph/SCHEMA.md", "knowledge_graph/knowledge_graph.json",
]);

const HF = "https://huggingface.co";
const VIEWER = "https://datasets-server.huggingface.co/first-rows"
  + "?dataset=FactoryBench%2FFactoryBench&config=level_1&split=train";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const FETCH_ATTEMPTS = 6;
const FETCH_CONCURRENCY = 8;
const RANGE_CONCURRENCY = 64;
const RANGE_CHUNK_BYTES = 512 * 1024;
const RANGE_THRESHOLD = 8 * 1024 * 1024;
const MAX_API_BYTES = 8 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail === null ? `FACTORYBENCH_${code}`
    : `FACTORYBENCH_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function factoryBenchSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return factoryBenchSha256(Buffer.from(
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
  const encoded = FACTORYBENCH_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${FACTORYBENCH_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${FACTORYBENCH_REVISION}`
      + "?recursive=true&expand=false&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${FACTORYBENCH_REVISION}`,
  };
}

function permittedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === ""
      && parsed.password === "" && (parsed.hostname === "huggingface.co"
        || parsed.hostname === "datasets-server.huggingface.co"
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
      method: options.method ?? "GET", redirect: options.redirect ?? "follow",
      signal: controller.signal,
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
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, cardLicense: value.cardData?.license ?? null,
    cardConfigs: value.cardData?.configs ?? null, siblingPaths };
  if (projection.id !== FACTORYBENCH_ID || projection.sha !== FACTORYBENCH_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false
    || projection.usedStorage !== FACTORYBENCH_PROFILE.usedStorage
    || projection.cardLicense !== "cc-by-4.0"
    || siblingPaths.length !== FACTORYBENCH_PROFILE.treeFiles
    || siblingPaths.some((entry) => !safeRemotePath(entry))) {
    fail("REPOSITORY_PROFILE_INVALID");
  }
  return projection;
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
  const selectedSet = new Set(FACTORYBENCH_SELECTED_PATHS);
  const selected = files.filter((entry) => selectedSet.has(entry.path));
  const unselected = files.filter((entry) => !selectedSet.has(entry.path));
  const bytes = (rows) => rows.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const lite = selected.filter((entry) => entry.path.startsWith("factorybench_lite/"));
  const support = selected.filter((entry) => !entry.path.startsWith("factorybench_lite/")
    && entry.path !== "factorywave/ur_signals_10hz.parquet");
  if (projection.length !== 22 || files.length !== 18 || directories.length !== 4
    || bytes(files) !== 5_223_446_797 || selected.length !== 11
    || bytes(selected) !== 291_800_891 || unselected.length !== 7
    || bytes(unselected) !== 4_931_645_906 || lite.length !== 4
    || bytes(lite) !== 70_118_768 || support.length !== 6
    || bytes(support) !== 771_475) fail("TREE_PROFILE_INVALID");
  return { projection, files, directories, selected, unselected, lite, support,
    treeHash: digest("outsider/factorybench-tree/v1", projection) };
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
  const stat = statSync(file);
  if (stat.size !== entry.sizeBytes) fail("OBJECT_SIZE_INVALID", entry.path);
  const sha256 = hashFile(file);
  if (entry.lfsSha256 !== null) {
    if (sha256 !== entry.lfsSha256) fail("OBJECT_LFS_HASH_INVALID", entry.path);
  } else {
    const bytes = readFileSync(file);
    if (gitBlobOid(bytes) !== entry.oid) fail("OBJECT_GIT_HASH_INVALID", entry.path);
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
    oid: entry.oid, lfsSha256: entry.lfsSha256, acquisition: "BOUNDED_DIRECT_GET",
    status: response.status, finalUrl: sanitizedUrl(response.finalUrl), rangeChunks: 0 };
  writeCanonical(safeJoin(work, `http/objects/${entry.path}.headers.json`), {
    requestUrl: url, status: response.status, finalUrl: sanitizedUrl(response.finalUrl),
    headers: response.headers,
  }, false);
  writeCanonical(marker, record);
  return record;
}

async function acquireRangedObjects(entries, work, fetchImpl) {
  const raw = endpoints().raw;
  const profiles = await mapConcurrent(entries, Math.min(entries.length, 8),
    async (entry) => {
      const url = `${raw}/${entry.path.split("/").map(encodeURIComponent).join("/")}`;
      const response = await boundedFetch(url, { method: "HEAD",
        maximumBytes: entry.sizeBytes, expectedStatuses: [200], accept: "*/*" }, fetchImpl);
      const length = Number(response.headers["content-length"]);
      if (length !== entry.sizeBytes || !/bytes/iu.test(response.headers["accept-ranges"] ?? "")) {
        fail("RANGE_HEAD_INVALID", entry.path);
      }
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
      contentRange: response.headers["content-range"],
      contentLength: Number(response.headers["content-length"]),
      bytes: response.bytes.length, sha256: factoryBenchSha256(response.bytes),
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
    if (existsSync(target) && statSync(target).size !== entry.sizeBytes) {
      rmSync(target, { force: true });
    }
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
    const rangeLog = { schema: "outsider/factorybench-http-ranges/v1",
      path: entry.path, requestUrl: profile.url, contentLength: entry.sizeBytes,
      chunkBytes: RANGE_CHUNK_BYTES, ranges };
    writeCanonical(safeJoin(work, `http/ranges/${profile.key}.ranges.json`), rangeLog);
    const record = { path: entry.path, bytes: entry.sizeBytes, sha256,
      oid: entry.oid, lfsSha256: entry.lfsSha256,
      acquisition: "STRICT_HTTP_RANGE_ASSEMBLY", status: 206,
      finalUrl: profile.head.finalUrl, rangeChunks: ranges.length,
      rangeLogHash: digest("outsider/factorybench-range-log/v1", ranges) };
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

async function captureViewer(work, fetchImpl) {
  const response = await boundedFetch(VIEWER, { maximumBytes: 128 * 1024,
    expectedStatuses: [404], accept: "application/json" }, fetchImpl);
  writePrivate(safeJoin(work, "api/viewer-level-1-train.body.json"), response.bytes);
  writeCanonical(safeJoin(work, "api/viewer-level-1-train.headers.json"), {
    requestUrl: VIEWER, status: response.status, finalUrl: response.finalUrl,
    headers: response.headers,
  }, false);
  const value = jsonValue(response.bytes, "viewer");
  if (value.error !== "Not found.") fail("VIEWER_ERROR_DRIFT");
  return { observedStatus: 404, error: value.error,
    fixedRevisionParameterSupported: false };
}

function terminalDispositions(tree, selectedRecords) {
  const selected = new Map(selectedRecords.map((entry) => [entry.path, entry]));
  return tree.files.map((entry) => selected.has(entry.path) ? {
    path: entry.path, bytes: entry.sizeBytes, disposition: "ACQUIRED_AND_REPLAYED",
    reason: "IN_COMPLETE_BOUNDED_NATURAL_SLICE",
  } : { path: entry.path, bytes: entry.sizeBytes,
    disposition: "TREE_INVENTORY_ONLY_NOT_ACQUIRED",
    reason: entry.path.startsWith("factorybench_qa/")
      ? "FULL_QA_VARIANT_EXCEEDS_BOUNDED_SLICE_AND_LITE_IS_SELECTED"
      : "ALTERNATE_SIGNAL_TABLE_EXCLUDED_TO_KEEP_COMPLETE_SLICE_UNDER_300MB",
  });
}

function sourceManifestBody(before, after, viewer, objects, sourceFiles) {
  const dispositions = terminalDispositions(before.tree, objects);
  return {
    schema: FACTORYBENCH_SOURCE_SCHEMA, frozenAt: FACTORYBENCH_FROZEN_AT,
    dataset: { id: FACTORYBENCH_ID, revision: FACTORYBENCH_REVISION },
    before: { repository: before.repository, treeHash: before.tree.treeHash },
    after: { repository: after.repository, treeHash: after.tree.treeHash },
    tree: before.tree.projection, viewer, remoteObjects: objects,
    terminalDispositions: dispositions,
    closure: {
      recursiveTreeCapturedBeforeAndAfter: true,
      recursiveTreeEntries: 22, recursiveTreeDirectories: 4,
      recursiveTreeFiles: 18, recursiveTreeBytes: 5_223_446_797,
      completeBoundedNaturalSlice: true,
      selectedFiles: 11, selectedBytes: 291_800_891,
      liteFiles: 4, liteBytes: 70_118_768,
      ur10Files: 1, ur10Bytes: 220_910_648,
      supportFiles: 6, supportBytes: 771_475,
      unselectedFilesInventoried: 7, unselectedBytesInventoried: 4_931_645_906,
      allRepositoryFilesHaveTerminalDisposition: true,
      terminalDispositionFiles: dispositions.length,
      selectionUnder300Mb: true, randomTruncation: false,
      globallyExhaustive: false,
      selectionRule: "ALL_FACTORYBENCH_LITE_PLUS_COMPLETE_UR10_AND_JOIN_METADATA",
    },
    sourceFiles,
    sourceRoot: digest("outsider/factorybench-source-root/v1", sourceFiles),
  };
}

export async function acquirePinnedFactoryBenchSource(sourceDirectory,
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
  writeCanonical(safeJoin(work, "source-checkpoint.json"), {
    schema: "outsider/factorybench-source-checkpoint/v1",
    target: path.resolve(sourceDirectory), revision: FACTORYBENCH_REVISION,
  });
  const before = await captureApi("before", work, fetchImpl);
  const viewer = await captureViewer(work, fetchImpl);
  const ranged = before.tree.selected.filter((entry) => entry.sizeBytes >= RANGE_THRESHOLD);
  const direct = before.tree.selected.filter((entry) => entry.sizeBytes < RANGE_THRESHOLD);
  const [rangedRecords, directRecords] = await Promise.all([
    acquireRangedObjects(ranged, work, fetchImpl),
    mapConcurrent(direct, FETCH_CONCURRENCY,
      (entry) => fetchDirectObject(entry, work, fetchImpl)),
  ]);
  const objects = [...rangedRecords, ...directRecords]
    .sort((left, right) => left.path.localeCompare(right.path));
  const after = await captureApi("after", work, fetchImpl);
  if (!same(before.repository, after.repository)
    || before.tree.treeHash !== after.tree.treeHash) fail("SOURCE_CHANGED_DURING_ACQUISITION");
  rmSync(safeJoin(work, "range-checkpoints"), { recursive: true, force: true });
  rmSync(safeJoin(work, "object-checkpoints"), { recursive: true, force: true });
  rmSync(safeJoin(work, "source-checkpoint.json"), { force: true });
  const sourceFiles = scanFiles(work, new Set(["acquisition-manifest.json"]));
  const body = sourceManifestBody(before, after, viewer, objects, sourceFiles);
  const manifest = { ...body,
    manifestHash: digest("outsider/factorybench-source-manifest/v1", body) };
  writeCanonical(safeJoin(work, "acquisition-manifest.json"), manifest);
  enforcePrivateTree(work);
  renameSync(work, sourceDirectory);
  chmodSync(sourceDirectory, 0o700);
  const checked = verifyFactoryBenchSourceDirectory(sourceDirectory);
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

export function verifyFactoryBenchSourceDirectory(sourceDirectory) {
  try {
    const root = lstatSync(sourceDirectory);
    if (root.isSymbolicLink() || !root.isDirectory() || (root.mode & 0o777) !== 0o700) {
      fail("SOURCE_DIRECTORY_MODE_INVALID");
    }
    const manifest = jsonValue(readFileSync(readSource(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== FACTORYBENCH_SOURCE_SCHEMA
      || manifest.frozenAt !== FACTORYBENCH_FROZEN_AT
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_SHAPE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/factorybench-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    const actual = scanFiles(sourceDirectory, new Set(["acquisition-manifest.json"]));
    if (!same(actual, manifest.sourceFiles)
      || manifest.sourceRoot !== digest("outsider/factorybench-source-root/v1", actual)) {
      fail("SOURCE_ROOT_INVALID");
    }
    const beforeRepo = repositoryProjection(jsonValue(readFileSync(readSource(sourceDirectory,
      "api/before/repository.json")), "before-repo"));
    const afterRepo = repositoryProjection(jsonValue(readFileSync(readSource(sourceDirectory,
      "api/after/repository.json")), "after-repo"));
    const beforeTree = projectTree(jsonValue(readFileSync(readSource(sourceDirectory,
      "api/before/tree.json")), "before-tree"));
    const afterTree = projectTree(jsonValue(readFileSync(readSource(sourceDirectory,
      "api/after/tree.json")), "after-tree"));
    if (!same(beforeRepo, afterRepo) || beforeTree.treeHash !== afterTree.treeHash
      || beforeTree.treeHash !== manifest.before.treeHash) fail("API_BRACKET_INVALID");
    if (!Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 11) {
      fail("OBJECT_CLOSURE_INVALID");
    }
    const entryByPath = new Map(beforeTree.files.map((entry) => [entry.path, entry]));
    for (const record of manifest.remoteObjects) {
      const entry = entryByPath.get(record.path);
      if (!entry || validateObject(entry,
        readSource(sourceDirectory, `objects/${record.path}`)) !== record.sha256
        || record.bytes !== entry.sizeBytes) fail("OBJECT_INVALID", record.path);
      if (record.rangeChunks > 0) {
        const key = record.path.replaceAll("/", "__");
        const log = jsonValue(readFileSync(readSource(sourceDirectory,
          `http/ranges/${key}.ranges.json`)), `range-log:${record.path}`);
        if (!Array.isArray(log.ranges) || log.ranges.length !== record.rangeChunks
          || log.ranges[0].start !== 0
          || log.ranges.at(-1).end !== record.bytes - 1
          || log.ranges.some((row, index) => row.index !== index
            || row.path !== record.path
            || row.start !== (index === 0 ? 0 : log.ranges[index - 1].end + 1)
            || row.status !== 206 || row.contentRange
              !== `bytes ${row.start}-${row.end}/${record.bytes}`
            || row.contentLength !== row.bytes
            || row.bytes !== row.end - row.start + 1 || !HASH.test(row.sha256))) {
          fail("RANGE_LOG_INVALID", record.path);
        }
      }
    }
    if (!Array.isArray(manifest.terminalDispositions)
      || manifest.terminalDispositions.length !== 18
      || manifest.terminalDispositions.filter((row) =>
        row.disposition === "ACQUIRED_AND_REPLAYED").length !== 11
      || manifest.terminalDispositions.filter((row) =>
        row.disposition === "TREE_INVENTORY_ONLY_NOT_ACQUIRED").length !== 7) {
      fail("TERMINAL_DISPOSITION_INVALID");
    }
    const viewer = jsonValue(readFileSync(readSource(sourceDirectory,
      "api/viewer-level-1-train.body.json")), "viewer");
    if (viewer.error !== "Not found." || manifest.viewer.observedStatus !== 404) {
      fail("VIEWER_EVIDENCE_INVALID");
    }
    const closure = manifest.closure;
    if (closure.completeBoundedNaturalSlice !== true || closure.selectedFiles !== 11
      || closure.selectedBytes !== 291_800_891 || closure.unselectedFilesInventoried !== 7
      || closure.allRepositoryFilesHaveTerminalDisposition !== true
      || closure.randomTruncation !== false || closure.globallyExhaustive !== false) {
      fail("CLOSURE_INVALID");
    }
    return { ok: true, manifest, before: { repository: beforeRepo, tree: beforeTree },
      after: { repository: afterRepo, tree: afterTree },
      verificationLevel: "PINNED_COMPLETE_291800891_BYTE_NATURAL_SLICE_AND_FULL_TREE_DISPOSITION" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYTHON_FACTORYBENCH_REPLAY = String.raw`
import ast
import collections
import datetime
import hashlib
import json
import math
import os
import sys

import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.parquet as pq

root = os.path.realpath(sys.argv[1])
objects = os.path.join(root, "objects")

def die(code, detail=""):
    raise SystemExit("FACTORYBENCH_REPLAY_" + code + (":" + detail if detail else ""))

def source_path(relative):
    value = os.path.realpath(os.path.join(objects, relative))
    if not value.startswith(objects + os.sep) or not os.path.isfile(value):
        die("PATH", relative)
    return value

def schema_projection(schema):
    return [{"name": field.name, "type": str(field.type),
             "nullable": bool(field.nullable)} for field in schema]

def sorted_counts(counter):
    return {str(key): int(counter[key]) for key in sorted(counter, key=lambda x: str(x))}

def scalar_key(value):
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)

def parquet_profile(relative, expected_rows=None):
    file = source_path(relative)
    parquet = pq.ParquetFile(file)
    if expected_rows is not None and parquet.metadata.num_rows != expected_rows:
        die("PARQUET_ROWS", relative)
    nulls = {name: 0 for name in parquet.schema_arrow.names}
    nan = {name: 0 for name in parquet.schema_arrow.names}
    inf = {name: 0 for name in parquet.schema_arrow.names}
    logical = hashlib.sha256()
    rows = 0
    batches = 0
    for batch in parquet.iter_batches(batch_size=32768, use_threads=False):
        rows += batch.num_rows
        batches += 1
        logical.update(batch.serialize().to_pybytes())
        for field, array in zip(batch.schema, batch.columns):
            nulls[field.name] += array.null_count
            if pa.types.is_floating(field.type):
                nan[field.name] += int(pc.sum(pc.is_nan(array)).as_py() or 0)
                inf[field.name] += int(pc.sum(pc.is_inf(array)).as_py() or 0)
    if rows != parquet.metadata.num_rows:
        die("PARQUET_REPLAY_ROWS", relative)
    compressed = 0
    uncompressed = 0
    row_group_rows = []
    for index in range(parquet.metadata.num_row_groups):
        group = parquet.metadata.row_group(index)
        row_group_rows.append(group.num_rows)
        for column_index in range(group.num_columns):
            column = group.column(column_index)
            compressed += column.total_compressed_size
            uncompressed += column.total_uncompressed_size
    return {
      "path": relative, "bytes": os.path.getsize(file), "rows": rows,
      "fields": len(parquet.schema_arrow), "rowGroups": parquet.metadata.num_row_groups,
      "rowGroupRows": row_group_rows, "schema": schema_projection(parquet.schema_arrow),
      "nullCounts": nulls, "nanCounts": nan, "infCounts": inf,
      "totalNullValues": sum(nulls.values()), "totalNanValues": sum(nan.values()),
      "totalInfValues": sum(inf.values()), "logicalBatches": batches,
      "logicalStreamSha256": "sha256:" + logical.hexdigest(),
      "parquetCompressedColumnBytes": compressed,
      "parquetUncompressedColumnBytes": uncompressed,
      "footerSerializedBytes": parquet.metadata.serialized_size,
    }

episodes_file = source_path("factorywave/episodes.parquet")
episodes_profile = parquet_profile("factorywave/episodes.parquet", 9728)
episodes_table = pq.read_table(episodes_file, use_threads=False)
expected_episode_fields = ["id", "flow_id", "machine_id", "fault_metadata",
 "episode_metadata", "counterfactual", "created_at", "updated_at", "cf_fault_id",
 "cf_injection_timestep", "cf_injection_time_s", "cf_baseline_episode_id",
 "trajectory_id", "selected_cf_variant_id"]
if episodes_table.column_names != expected_episode_fields:
    die("EPISODE_SCHEMA")
episode_ids = episodes_table["id"].to_pylist()
if len(set(episode_ids)) != 9728:
    die("EPISODE_IDS")
episode_id_set = set(episode_ids)
flow_id_values = episodes_table["flow_id"].to_pylist()
episode_metadata = {}
episode_metadata_key_presence = collections.Counter()
episode_partitions = collections.Counter()
episode_faults = collections.Counter()
episode_conditions = collections.Counter()
episode_tasks = collections.Counter()
episode_robots = collections.Counter()
metadata_parse_errors = 0
for episode_id, raw in zip(episode_ids, episodes_table["episode_metadata"].to_pylist()):
    try:
        value = ast.literal_eval(raw)
    except Exception:
        metadata_parse_errors += 1
        continue
    if not isinstance(value, dict):
        metadata_parse_errors += 1
        continue
    episode_metadata[episode_id] = value
    episode_metadata_key_presence.update(value.keys())
    robot = scalar_key(value.get("robot_model"))
    task = scalar_key(value.get("task"))
    condition = scalar_key(value.get("condition"))
    fault = scalar_key(value.get("fault_id"))
    episode_robots[robot] += 1
    episode_tasks[task] += 1
    episode_conditions[condition] += 1
    episode_faults[fault] += 1
    episode_partitions[json.dumps([robot, task, condition], separators=(",", ":"))] += 1
if metadata_parse_errors != 0 or len(episode_metadata) != 9728:
    die("EPISODE_METADATA_PARSE")
baseline_values = episodes_table["cf_baseline_episode_id"].to_pylist()
baseline_refs = [value for value in baseline_values if value is not None]
episodes_summary = {
  **episodes_profile,
  "uniqueEpisodeIds": len(episode_id_set),
  "metadataLiteralDocumentsParsed": len(episode_metadata),
  "metadataLiteralParseErrors": metadata_parse_errors,
  "metadataKeyPresenceCounts": sorted_counts(episode_metadata_key_presence),
  "robotModelCounts": sorted_counts(episode_robots),
  "taskCounts": sorted_counts(episode_tasks),
  "conditionCounts": sorted_counts(episode_conditions),
  "faultIdCounts": sorted_counts(episode_faults),
  "robotTaskConditionPartitions": sorted_counts(episode_partitions),
  "counterfactualCounts": sorted_counts(collections.Counter(
      episodes_table["counterfactual"].to_pylist())),
  "counterfactualBaselineReferences": len(baseline_refs),
  "counterfactualBaselineMissingFromEpisodes": sum(
      value not in episode_id_set for value in baseline_refs),
}

flow_file = source_path("factorywave/flow.parquet")
flow_profile = parquet_profile("factorywave/flow.parquet", 9)
flow_table = pq.read_table(flow_file, use_threads=False)
expected_flow_fields = ["id", "flow_type", "flow_content", "task_number",
                        "created_at", "updated_at"]
if flow_table.column_names != expected_flow_fields:
    die("FLOW_SCHEMA")
flow_ids = set(flow_table["id"].to_pylist())
if len(flow_ids) != 9:
    die("FLOW_IDS")
episode_flow_ids = set(flow_id_values)
flow_summary = {
  **flow_profile, "uniqueFlowIds": len(flow_ids),
  "flowTypeCounts": sorted_counts(collections.Counter(flow_table["flow_type"].to_pylist())),
  "episodeFlowReferences": len(flow_id_values),
  "episodeFlowReferencesMissing": sum(value not in flow_ids for value in flow_id_values),
  "flowIdsReferencedByEpisodes": len(episode_flow_ids),
  "flowIdsNotReferencedByEpisodes": len(flow_ids - episode_flow_ids),
  "flowPayloadDocumentsExecuted": 0,
}

signal_relative = "factorywave/ur_signals_10hz.parquet"
signal_file = source_path(signal_relative)
signal_profile = parquet_profile(signal_relative, 590715)
signal_parquet = pq.ParquetFile(signal_file)
if len(signal_parquet.schema_arrow) != 136 or signal_parquet.schema_arrow.names[:3] != [
        "time", "episode_id", "fault"]:
    die("SIGNAL_SCHEMA")
signal_episode_rows = collections.Counter()
signal_episode_faults = collections.defaultdict(set)
signal_fault_rows = collections.Counter()
last_time = {}
closed_episodes = set()
last_block_episode = None
last_block_time = None
episode_blocks = 0
reopened_episode_blocks = 0
time_decreases = 0
block_time_decreases = 0
time_duplicates = 0
time_delta_min = None
time_delta_max = None
time_delta_sum = 0.0
time_delta_count = 0
created_after_updated = 0
for batch in signal_parquet.iter_batches(
        columns=["time", "episode_id", "fault", "created_at", "updated_at"],
        batch_size=65536, use_threads=False):
    times = batch.column(0).to_pylist()
    ids = batch.column(1).to_pylist()
    faults = batch.column(2).to_pylist()
    created = batch.column(3).to_pylist()
    updated = batch.column(4).to_pylist()
    for timestamp, episode_id, fault, created_at, updated_at in zip(
            times, ids, faults, created, updated):
        if last_block_episode != episode_id:
            if last_block_episode is not None:
                closed_episodes.add(last_block_episode)
            if episode_id in closed_episodes:
                reopened_episode_blocks += 1
            episode_blocks += 1
            last_block_episode = episode_id
            last_block_time = None
        signal_episode_rows[episode_id] += 1
        signal_episode_faults[episode_id].add(int(fault))
        signal_fault_rows[int(fault)] += 1
        previous = last_time.get(episode_id)
        if previous is not None:
            delta = (timestamp - previous).total_seconds()
            if delta < 0:
                time_decreases += 1
            elif delta == 0:
                time_duplicates += 1
            time_delta_min = delta if time_delta_min is None else min(time_delta_min, delta)
            time_delta_max = delta if time_delta_max is None else max(time_delta_max, delta)
            time_delta_sum += delta
            time_delta_count += 1
        if last_block_time is not None and timestamp < last_block_time:
            block_time_decreases += 1
        last_block_time = timestamp
        last_time[episode_id] = timestamp
        if created_at > updated_at:
            created_after_updated += 1
signal_episode_set = set(signal_episode_rows)
if len(signal_episode_set) != 3984 or sum(signal_episode_rows.values()) != 590715:
    die("SIGNAL_EPISODES")
missing_signal_episodes = signal_episode_set - episode_id_set
mixed_fault_episodes = sum(len(values) != 1 for values in signal_episode_faults.values())
fault_metadata_mismatches = 0
fault_metadata_relations = collections.Counter()
selected_metadata_conditions = collections.Counter()
for episode_id, observed in signal_episode_faults.items():
    metadata_value = episode_metadata.get(episode_id, {})
    selected_metadata_conditions[scalar_key(metadata_value.get("condition"))] += 1
    metadata_fault = metadata_value.get("fault_id")
    if metadata_fault is None:
        metadata_fault = 0
    if isinstance(metadata_fault, float) and metadata_fault.is_integer():
        metadata_fault = int(metadata_fault)
    if observed != {metadata_fault}:
        fault_metadata_mismatches += 1
    if observed == {metadata_fault}:
        fault_metadata_relations["EXACT_SINGLE_LABEL"] += 1
    elif metadata_fault in observed:
        fault_metadata_relations["OBSERVED_SET_CONTAINS_METADATA_LABEL"] += 1
    elif observed == {0}:
        fault_metadata_relations["SIGNAL_ONLY_ZERO_METADATA_OTHER"] += 1
    elif metadata_fault == 0:
        fault_metadata_relations["METADATA_ZERO_SIGNAL_OTHER"] += 1
    else:
        fault_metadata_relations["OTHER_MISMATCH"] += 1
row_count_values = list(signal_episode_rows.values())
signal_summary = {
  **signal_profile, "uniqueEpisodes": len(signal_episode_set),
  "episodeRowsMinimum": min(row_count_values),
  "episodeRowsMaximum": max(row_count_values),
  "episodeRowsMean": sum(row_count_values) / len(row_count_values),
  "faultRowLabelCounts": sorted_counts(signal_fault_rows),
  "faultLabels": sorted(signal_fault_rows),
  "mixedFaultLabelEpisodes": mixed_fault_episodes,
  "episodeBlocks": episode_blocks,
  "reopenedEpisodeBlocks": reopened_episode_blocks,
  "episodesMissingFromMetadataTable": len(missing_signal_episodes),
  "episodesJoinedToMetadataTable": len(signal_episode_set & episode_id_set),
  "metadataRowsOutsideSelected10Hz": len(episode_id_set - signal_episode_set),
  "faultLabelMetadataMismatchEpisodes": fault_metadata_mismatches,
  "faultLabelMetadataRelationCounts": sorted_counts(fault_metadata_relations),
  "selectedMetadataConditionCounts": sorted_counts(selected_metadata_conditions),
  "time": {"nonNullRows": 590715, "withinEpisodeDecreaseCount": time_decreases,
           "withinContiguousEpisodeBlockDecreaseCount": block_time_decreases,
           "withinEpisodeDuplicateCount": time_duplicates,
           "withinEpisodeDeltaCount": time_delta_count,
           "deltaSecondsMinimum": time_delta_min, "deltaSecondsMaximum": time_delta_max,
           "deltaSecondsMean": time_delta_sum / time_delta_count,
           "createdAfterUpdatedRows": created_after_updated},
}

required_qa_fields = {"acceptance_bounds", "answer", "context", "hides", "id",
 "level", "lite", "options", "provenance", "question", "template_id",
 "template_type"}
qa_ids = set()
qa_total = 0
qa_file_reports = []
qa_template_counts = collections.Counter()
qa_answer_types = collections.Counter()
qa_context_types = collections.Counter()
qa_context_canonical_bytes = 0
qa_references = collections.Counter()
qa_distinct_references = collections.defaultdict(set)
qa_factorywave_episode_matches = 0
qa_factorywave_episode_missing = 0
qa_factorywave_ur10_matches = 0
qa_factorywave_other_episode_matches = 0
qa_logical = hashlib.sha256()
for level in range(1, 5):
    relative = "factorybench_lite/level_%d.jsonl" % level
    file = source_path(relative)
    rows = 0
    file_templates = collections.Counter()
    file_references = collections.Counter()
    expected_fields = required_qa_fields | ({"root_cause"} if level == 4 else set())
    field_type_counts = {name: collections.Counter() for name in expected_fields}
    with open(file, "r", encoding="utf-8", newline="") as handle:
        for line_number, line in enumerate(handle, 1):
            try:
                item = json.loads(line, parse_constant=lambda value: die(
                    "JSON_NONFINITE", relative + ":" + str(line_number)))
            except json.JSONDecodeError as error:
                die("JSONL", relative + ":" + str(line_number) + ":" + str(error))
            if not isinstance(item, dict) or set(item) != expected_fields:
                die("QA_SCHEMA", relative + ":" + str(line_number))
            if item["level"] != level or item["lite"] is not True:
                die("QA_LEVEL", relative + ":" + str(line_number))
            if not isinstance(item["id"], str) or item["id"] in qa_ids:
                die("QA_ID", relative + ":" + str(line_number))
            if not isinstance(item["question"], str) or not isinstance(item["context"], dict):
                die("QA_TYPES", relative + ":" + str(line_number))
            qa_ids.add(item["id"])
            canonical = json.dumps(item, sort_keys=True, separators=(",", ":"),
                                   ensure_ascii=False, allow_nan=False).encode("utf-8")
            qa_logical.update(canonical + b"\n")
            qa_context_canonical_bytes += len(json.dumps(item["context"], sort_keys=True,
                separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8"))
            rows += 1
            qa_total += 1
            template_type = str(item["template_type"])
            file_templates[template_type] += 1
            qa_template_counts[template_type] += 1
            qa_answer_types[type(item["answer"]).__name__] += 1
            qa_context_types[type(item["context"]).__name__] += 1
            for name, value in item.items():
                field_type_counts[name][type(value).__name__] += 1
            provenance = item["provenance"]
            if not isinstance(provenance, dict):
                die("PROVENANCE", relative + ":" + str(line_number))
            for suffix in ["", "_a", "_b"]:
                dataset = provenance.get("dataset" + suffix)
                episode = provenance.get("episode" + suffix)
                if dataset is None and episode is None:
                    continue
                if not isinstance(dataset, str) or not isinstance(episode, str):
                    die("PROVENANCE_REFERENCE", relative + ":" + str(line_number))
                qa_references[dataset] += 1
                file_references[dataset] += 1
                qa_distinct_references[dataset].add(episode)
                if dataset == "factorywave":
                    if episode in episode_id_set:
                        qa_factorywave_episode_matches += 1
                        if episode in signal_episode_set:
                            qa_factorywave_ur10_matches += 1
                        else:
                            qa_factorywave_other_episode_matches += 1
                    else:
                        qa_factorywave_episode_missing += 1
    qa_file_reports.append({"path": relative, "bytes": os.path.getsize(file),
      "level": level, "rows": rows, "templateTypeCounts": sorted_counts(file_templates),
      "provenanceReferenceCounts": sorted_counts(file_references),
      "fieldTypeCounts": {name: sorted_counts(field_type_counts[name])
                          for name in sorted(field_type_counts)}})
if qa_total != 3000 or len(qa_ids) != 3000:
    die("QA_TOTAL")
qa_summary = {
  "files": 4, "bytes": sum(item["bytes"] for item in qa_file_reports),
  "rows": qa_total, "uniqueIds": len(qa_ids), "fileReports": qa_file_reports,
  "templateTypeCounts": sorted_counts(qa_template_counts),
  "answerTypeCounts": sorted_counts(qa_answer_types),
  "contextTypeCounts": sorted_counts(qa_context_types),
  "contextCanonicalBytesReplayed": qa_context_canonical_bytes,
  "logicalRecordsSha256": "sha256:" + qa_logical.hexdigest(),
  "provenanceReferenceCounts": sorted_counts(qa_references),
  "distinctProvenanceEpisodeCounts": {dataset: len(values) for dataset, values in
      sorted(qa_distinct_references.items())},
  "factorywaveProvenance": {
      "referenceOccurrences": qa_references["factorywave"],
      "matchedEpisodeMetadataOccurrences": qa_factorywave_episode_matches,
      "missingEpisodeMetadataOccurrences": qa_factorywave_episode_missing,
      "matchedSelectedUr10Occurrences": qa_factorywave_ur10_matches,
      "matchedOtherEpisodeMetadataOccurrences": qa_factorywave_other_episode_matches},
  "questionTextProjected": False, "answerTextProjected": False,
  "contextTimeSeriesProjected": False,
}

kg_file = source_path("knowledge_graph/knowledge_graph.json")
with open(kg_file, "r", encoding="utf-8") as handle:
    kg = json.load(handle, parse_constant=lambda value: die("KG_NONFINITE"))
kg_keys = {"$schema_version", "anomalies", "anomaly_ranking", "datasets",
 "description", "events", "grippers", "machines", "relevance_specs",
 "root_cause_error_mapping", "root_causes", "tasks"}
if not isinstance(kg, dict) or set(kg) != kg_keys or kg.get("$schema_version") != "1.0":
    die("KG_SCHEMA")
kg_counts = {name: len(kg[name]) for name in ["machines", "grippers", "datasets",
 "tasks", "events", "root_causes", "anomalies", "root_cause_error_mapping"]}
if kg_counts != {"machines": 4, "grippers": 3, "datasets": 3, "tasks": 3,
                   "events": 10, "root_causes": 34, "anomalies": 41,
                   "root_cause_error_mapping": 36}:
    die("KG_COUNTS")
machine_ids = {row["machine_id"] for row in kg["machines"]}
gripper_ids = {row["gripper_id"] for row in kg["grippers"]}
dataset_ids = {row["dataset_id"] for row in kg["datasets"]}
task_ids = {row["id"] for row in kg["tasks"]}
root_pairs = {(row["fault_id"], row["root_cause"]) for row in kg["root_causes"]}
anomaly_names = {row["anomaly_name"] for row in kg["anomalies"]}
dataset_reference_violations = 0
for row in kg["datasets"]:
    dataset_reference_violations += int(row["machine_id"] not in machine_ids)
    dataset_reference_violations += int(row.get("gripper_id") is not None
                                        and row["gripper_id"] not in gripper_ids)
    dataset_reference_violations += int(row["task_id"] != "mixed"
                                        and row["task_id"] not in task_ids)
root_reference_violations = 0
root_missing_task_fault_ids = []
for row in kg["root_causes"]:
    root_reference_violations += sum(dataset not in dataset_ids for dataset in row["datasets"])
    root_reference_violations += sum(task not in task_ids for task in row.get("task", []))
    if any(task not in task_ids for task in row.get("task", [])):
        root_missing_task_fault_ids.append(row["fault_id"])
    root_reference_violations += sum(value not in anomaly_names
                                     for value in row["possible_anomalies"])
mapping_reference_violations = sum((row["fault_id"], row["root_cause"]) not in root_pairs
                                   for row in kg["root_cause_error_mapping"])
mapping_missing_root_fault_ids = sorted(row["fault_id"]
    for row in kg["root_cause_error_mapping"]
    if (row["fault_id"], row["root_cause"]) not in root_pairs)
ranking = kg["anomaly_ranking"].get("ranking_least_to_most_severe", [])
ranking_reference_violations = sum((row["fault_id"], row["root_cause"]) not in root_pairs
                                   for row in ranking)
event_reference_violations = sum(task not in task_ids for row in kg["events"]
                                 for task in row["tasks"])
relevance_fault_ids = set(kg["relevance_specs"].get("specs", {}))
root_fault_ids = {str(row["fault_id"]) for row in kg["root_causes"]}
relevance_reference_violations = len(relevance_fault_ids - root_fault_ids - {"0"})
kg_canonical = json.dumps(kg, sort_keys=True, separators=(",", ":"),
                          ensure_ascii=False, allow_nan=False).encode("utf-8")
kg_summary = {
  "path": "knowledge_graph/knowledge_graph.json", "bytes": os.path.getsize(kg_file),
  "schemaVersion": kg["$schema_version"], "entityCounts": kg_counts,
  "anomalyRankingEntries": len(ranking),
  "relevanceSpecEntries": len(relevance_fault_ids),
  "rootCausesWithoutTaskField": sum("task" not in row for row in kg["root_causes"]),
  "referenceViolations": {"datasets": dataset_reference_violations,
      "rootCauses": root_reference_violations, "errorMappings": mapping_reference_violations,
      "anomalyRanking": ranking_reference_violations, "events": event_reference_violations,
      "relevanceSpecs": relevance_reference_violations},
  "missingTaskReferenceFaultIds": sorted(root_missing_task_fault_ids),
  "mappingWithoutRootCauseFaultIds": mapping_missing_root_fault_ids,
  "allReferencesResolved": (dataset_reference_violations + root_reference_violations +
      mapping_reference_violations + ranking_reference_violations +
      event_reference_violations + relevance_reference_violations) == 0,
  "publisherUpstreamLicenseClaims": {row["dataset_id"]: row["license"]
                                      for row in kg["datasets"]},
  "logicalDocumentSha256": "sha256:" + hashlib.sha256(kg_canonical).hexdigest(),
  "descriptionsProjected": False, "protocolTextProjected": False,
}

readme_file = source_path("README.md")
schema_file = source_path("knowledge_graph/SCHEMA.md")
attributes_file = source_path(".gitattributes")
readme = open(readme_file, "r", encoding="utf-8").read()
schema_text = open(schema_file, "r", encoding="utf-8").read()
attributes_text = open(attributes_file, "r", encoding="utf-8").read()
docs_summary = {
  "readme": {"bytes": os.path.getsize(readme_file),
      "utf8Characters": len(readme),
      "claims70918QaPairs": "70,918 Q&A pairs" in readme,
      "claimsNestedSplitPaths": "level_1/{train,validation,test}.jsonl" in readme,
      "claimsUr10Episodes3984": "3,984 episodes" in readme,
      "claimsUr125Episodes3076": "3,076 episodes" in readme,
      "claimsUr10Ur125Disjoint": "cover **disjoint** UR3 episode subsets" in readme,
      "claimsPhysicalFaultInjection": "27 physically injected mechanisms" in readme,
      "claimsCcBy4": "Creative Commons Attribution 4.0" in readme},
  "knowledgeGraphSchema": {"bytes": os.path.getsize(schema_file),
      "utf8Characters": len(schema_text), "textProjected": False},
  "gitAttributes": {"bytes": os.path.getsize(attributes_file),
      "utf8Characters": len(attributes_text),
      "lfsPatternLines": sum("filter=lfs" in line for line in attributes_text.splitlines())},
}

print(json.dumps({
  "qaLite": qa_summary, "episodes": episodes_summary, "flow": flow_summary,
  "urSignals10Hz": signal_summary, "knowledgeGraph": kg_summary, "documents": docs_summary,
  "joins": {"selectedUr10Episodes": len(signal_episode_set),
            "selectedUr10ToEpisodeMetadataMatches": len(signal_episode_set & episode_id_set),
            "selectedUr10ToEpisodeMetadataMissing": len(missing_signal_episodes),
            "episodeMetadataRowsOutsideSelectedUr10": len(episode_id_set - signal_episode_set),
            "factorywaveLiteReferencesMatched": qa_factorywave_episode_matches,
            "factorywaveLiteReferencesMissing": qa_factorywave_episode_missing},
  "safety": {"pythonSourceFilesExecuted": 0, "publisherFlowPayloadsExecuted": 0,
             "publisherCommandsExecuted": 0, "questionTextProjected": False,
             "contextTimeSeriesProjected": False, "protocolTextProjected": False},
}, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False))
`;

export function runFactoryBenchReplay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const result = spawnSync(python, ["-c", PYTHON_FACTORYBENCH_REPLAY,
    path.resolve(sourceDirectory)], {
    encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) fail("REPLAY_PYTHON_FAILED", result.error.message);
  if (result.status !== 0) fail("REPLAY_FAILED",
    String(result.stderr || result.stdout).trim());
  let replay;
  try { replay = JSON.parse(result.stdout); }
  catch (error) { fail("REPLAY_JSON_INVALID", error.message); }
  if (replay.qaLite?.rows !== 3_000 || replay.qaLite?.uniqueIds !== 3_000
    || replay.qaLite?.bytes !== 70_118_768
    || replay.episodes?.rows !== 9_728 || replay.episodes?.fields !== 14
    || replay.flow?.rows !== 9 || replay.flow?.fields !== 6
    || replay.urSignals10Hz?.rows !== 590_715
    || replay.urSignals10Hz?.fields !== 136
    || replay.urSignals10Hz?.uniqueEpisodes !== 3_984
    || replay.urSignals10Hz?.episodesMissingFromMetadataTable !== 0
    || replay.knowledgeGraph?.entityCounts?.root_causes !== 34
    || replay.safety?.publisherFlowPayloadsExecuted !== 0) {
    fail("REPLAY_RESULT_INVALID");
  }
  return replay;
}

function fixedTreePathDrift(verified) {
  const paths = new Set(verified.before.tree.files.map((entry) => entry.path));
  const flat = [1, 2, 3, 4].map((level) =>
    `factorybench_qa/level_${level}.jsonl`);
  const nested = [1, 2, 3, 4].flatMap((level) =>
    ["train", "validation", "test"].map((split) =>
      `factorybench_qa/level_${level}/${split}.jsonl`));
  return {
    readmePublisherQaCountClaim: 70_918,
    selectedLiteQaRows: 3_000,
    selectedLiteIsNotCompleteQa: true,
    readmeClaimsNestedSplitLayout: true,
    fixedTreeFlatLevelFiles: flat.filter((entry) => paths.has(entry)).length,
    fixedTreeNestedSplitFiles: nested.filter((entry) => paths.has(entry)).length,
    fixedTreeContradictsReadmeLayout: flat.every((entry) => paths.has(entry))
      && nested.every((entry) => !paths.has(entry)),
    liveViewerStatus: verified.manifest.viewer.observedStatus,
    liveViewerError: verified.manifest.viewer.error,
    viewerFailureConsistentWithStaleCardConfig: true,
    fixedRevisionTreeIsAuthorityForObjectPresence: true,
  };
}

function factoryBenchArtifactBody(verified, replay) {
  return {
    schema: FACTORYBENCH_ARTIFACT_SCHEMA, frozenAt: FACTORYBENCH_FROZEN_AT,
    status: "COMPLETE_FIXED_REVISION_FACTORYBENCH_BOUNDED_SLICE_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: { id: FACTORYBENCH_ID, revision: FACTORYBENCH_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure,
      repositoryUsedStorageBytes: verified.before.repository.usedStorage,
      recursiveTreeBytes: verified.manifest.closure.recursiveTreeBytes,
      repositoryUsedStorageAndTreeBytesAreDistinctMeasures: true },
    replay,
    typedDenominators: {
      FACTORYBENCH_LITE_QA_ITEM: 3_000,
      UR10_SIGNAL_ROW: 590_715,
      UR10_EPISODE: 3_984,
      EPISODE_METADATA_ROW: 9_728,
      FLOW_ROW: 9,
      KG_MACHINE: 4, KG_GRIPPER: 3, KG_DATASET: 3, KG_TASK: 3,
      KG_EVENT: 10, KG_ROOT_CAUSE: 34, KG_ANOMALY: 41,
      KG_ROOT_CAUSE_ERROR_MAPPING: 36,
      crossTotal: null,
    },
    sourceDrift: fixedTreePathDrift(verified),
    urSignalCoverage: {
      selected10HzBytesPresent: true,
      selected10HzEpisodesByteVerified: 3_984,
      selected10HzRowsByteVerified: 590_715,
      selected10HzEpisodesJoinMetadataRows: 3_984,
      publisherClaimed125HzEpisodes: 3_076,
      publisherClaimed10HzEpisodes: 3_984,
      publisherClaimedJointDistinctUrEpisodes: 7_060,
      publisherClaimed10Hz125HzDisjoint: true,
      ur125HzTreeBytes: 1_704_885_150,
      ur125HzBytesAcquired: false,
      ur125HzEpisodeIdsDirectlyCompared: false,
      disjointnessClassification: "PUBLISHER_METADATA_CLAIM_NOT_DIRECT_BYTE_REPLAY",
    },
    semantics: {
      publicFixedRevisionEstablished: true,
      sourceNativeBoundedSliceComplete: true,
      completeRepositoryEstablished: false,
      fullQaCorpusAcquired: false,
      selectedLiteQaIsDerivedBenchmarkMaterial: true,
      publisherRealIndustrialRobotTelemetryClaim: true,
      publisherPhysicalFaultInjectionClaim: true,
      sourceNativeFaultLabelsPresent: true,
      faultLabelsAreTaskOutcomeLabels: false,
      signalFaultLabelsExactlyMatchEpisodeMetadata: false,
      selectedSignalTimestampsMonotonicWithinEpisode: false,
      knowledgeGraphAllReferencesResolved: false,
      sourceQualityGapsRetainedWithoutRepair: true,
      terminalCorrectnessEstablished: false,
      directPhysicalCausalEffectEstablished: false,
      independentOutcomeEstablished: false,
      withinEpisodeCorrectionEstablished: false,
      recoveryEstablished: false,
      completeAttemptCensusEstablished: false,
      delegationEstablished: false,
      longitudinalIdentityEstablished: false,
    },
    selection: {
      completeNaturalSliceUnder300Mb: true, selectedBytes: 291_800_891,
      randomTruncation: false, globallyExhaustive: false,
      selectedLiteRows: 3_000, publisherClaimedFullQaRows: 70_918,
      selectedSignalTable: "factorywave/ur_signals_10hz.parquet",
      alternateSignalTablesAcquired: false,
      derivedCausalQuestionsPromotedToEffects: false,
    },
    rights: {
      datasetCardLicenseClaim: "CC-BY-4.0",
      readmeLicenseClaim: "CC-BY-4.0",
      publisherUpstreamLicenseClaims:
        replay.knowledgeGraph.publisherUpstreamLicenseClaims,
      rootLicenseFilePresent: false,
      upstreamRightsIndependentlyAdjudicated: false,
      scopeConflictOrAmbiguityRetained: true,
      legalConclusionEstablished: false,
      productionTrainingAuthorized: false,
      evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    },
    privacy: {
      rawArtifactPrivate: true, directoryMode: "0700", fileMode: "0600",
      noPiiGuaranteed: false, privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false,
      rawQuestionsProjected: false, rawAnswersProjected: false,
      rawContextTimeSeriesProjected: false, rawFlowPayloadsProjected: false,
    },
    boundary: { privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
      action: 1, physicalObservation: 1, publisherFaultLabel: 1,
      publisherOutcomeLabel: 0,
      reliableOutcome: 0, independentOutcome: 0, directCausalEffect: 0,
      recovery: 0, delegation: 0, externalEffect: 1 },
  };
}

export function factoryBenchArtifactHash(body) {
  return digest("outsider/factorybench-bounded-slice/v1", body);
}

export function buildFactoryBenchArtifactFromSource(sourceDirectory,
  options = {}) {
  const verified = verifyFactoryBenchSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runFactoryBenchReplay(sourceDirectory, options);
  const body = factoryBenchArtifactBody(verified, replay);
  const artifact = { ...body, artifactHash: factoryBenchArtifactHash(body) };
  const checked = verifyFactoryBenchArtifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifyFactoryBenchArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== FACTORYBENCH_ARTIFACT_SCHEMA
      || artifact.frozenAt !== FACTORYBENCH_FROZEN_AT
      || artifact.status
        !== "COMPLETE_FIXED_REVISION_FACTORYBENCH_BOUNDED_SLICE_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== factoryBenchArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.closure?.selectedBytes !== 291_800_891
      || artifact.source?.closure?.selectedFiles !== 11
      || artifact.source?.closure?.unselectedFilesInventoried !== 7
      || artifact.replay?.qaLite?.rows !== 3_000
      || artifact.replay?.episodes?.rows !== 9_728
      || artifact.replay?.flow?.rows !== 9
      || artifact.replay?.urSignals10Hz?.rows !== 590_715
      || artifact.replay?.urSignals10Hz?.uniqueEpisodes !== 3_984
      || artifact.replay?.urSignals10Hz?.fields !== 136
      || artifact.replay?.urSignals10Hz?.totalNullValues !== 10_646_423
      || artifact.replay?.urSignals10Hz?.totalNanValues !== 0
      || artifact.replay?.urSignals10Hz?.totalInfValues !== 0
      || artifact.replay?.urSignals10Hz?.mixedFaultLabelEpisodes !== 480
      || artifact.replay?.urSignals10Hz?.faultLabelMetadataMismatchEpisodes !== 2_930
      || artifact.replay?.urSignals10Hz?.time?.withinEpisodeDecreaseCount !== 59_615
      || artifact.replay?.joins?.selectedUr10ToEpisodeMetadataMissing !== 0
      || artifact.replay?.knowledgeGraph?.entityCounts?.root_causes !== 34
      || artifact.replay?.knowledgeGraph?.referenceViolations?.rootCauses !== 5
      || artifact.replay?.knowledgeGraph?.referenceViolations?.errorMappings !== 4
      || artifact.replay?.knowledgeGraph?.allReferencesResolved !== false
      || !same(artifact.replay?.knowledgeGraph?.missingTaskReferenceFaultIds,
        [32, 33, 34, 35, 36])
      || !same(artifact.replay?.knowledgeGraph?.mappingWithoutRootCauseFaultIds,
        [21, 24, 26, 27])) fail("ARTIFACT_REPLAY_INVALID");
    if (artifact.typedDenominators?.crossTotal !== null
      || artifact.sourceDrift?.fixedTreeFlatLevelFiles !== 4
      || artifact.sourceDrift?.fixedTreeNestedSplitFiles !== 0
      || artifact.sourceDrift?.fixedTreeContradictsReadmeLayout !== true
      || artifact.urSignalCoverage?.ur125HzBytesAcquired !== false
      || artifact.urSignalCoverage?.ur125HzEpisodeIdsDirectlyCompared !== false) {
      fail("SCOPE_PROMOTION");
    }
    if (artifact.semantics?.completeRepositoryEstablished !== false
      || artifact.semantics?.fullQaCorpusAcquired !== false
      || artifact.semantics?.faultLabelsAreTaskOutcomeLabels !== false
      || artifact.semantics?.signalFaultLabelsExactlyMatchEpisodeMetadata !== false
      || artifact.semantics?.selectedSignalTimestampsMonotonicWithinEpisode !== false
      || artifact.semantics?.knowledgeGraphAllReferencesResolved !== false
      || artifact.semantics?.directPhysicalCausalEffectEstablished !== false
      || artifact.semantics?.independentOutcomeEstablished !== false
      || artifact.semantics?.recoveryEstablished !== false
      || artifact.semantics?.completeAttemptCensusEstablished !== false
      || artifact.selection?.derivedCausalQuestionsPromotedToEffects !== false) {
      fail("SEMANTIC_PROMOTION");
    }
    if (artifact.rights?.legalConclusionEstablished !== false
      || artifact.rights?.productionTrainingAuthorized !== false
      || artifact.rights?.upstreamRightsIndependentlyAdjudicated !== false
      || artifact.privacy?.rawArtifactPrivate !== true
      || artifact.privacy?.noPiiGuaranteed !== false
      || artifact.privacy?.rawContextTimeSeriesProjected !== false) fail("GATE_INVALID");
    if (!same(artifact.boundary, { privacy: 0, training: 0, network: 0,
      authority: 0, CEU: 0, action: 1, physicalObservation: 1,
      publisherFaultLabel: 1, publisherOutcomeLabel: 0,
      reliableOutcome: 0, independentOutcome: 0,
      directCausalEffect: 0, recovery: 0, delegation: 0, externalEffect: 1 })) {
      fail("BOUNDARY_INVALID");
    }
    return { ok: true, artifactHash,
      verificationLevel: "STANDALONE_HASH_TYPED_SCOPE_RIGHTS_AND_SEMANTIC_BOUNDARY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyFactoryBenchArtifactWithSource(artifact, sourceDirectory,
  options = {}) {
  const standalone = verifyFactoryBenchArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildFactoryBenchArtifactFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel:
        "FULL_JSONL_PARQUET_SIGNAL_EPISODE_FLOW_KG_AND_PROVENANCE_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
