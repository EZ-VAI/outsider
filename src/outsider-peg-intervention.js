/*
 * Fixed-revision ManiSkill peg-intervention closure.  Every semantic no-video
 * object and the complete hand-camera modality are acquired; the five much
 * larger base-camera files remain exact full-tree terminal dispositions.
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

export const PEG_INTERVENTION_ID = "KeWangRobotics/peg_intervention";
export const PEG_INTERVENTION_REVISION =
  "a521f26020d464a23c19a3fbb24ee10e9f10216c";
export const PEG_INTERVENTION_FROZEN_AT = "2026-08-30T00:00:00.000Z";
export const PEG_INTERVENTION_SOURCE_SCHEMA =
  "outsider/peg-intervention-source/v1";
export const PEG_INTERVENTION_ARTIFACT_SCHEMA =
  "outsider/peg-intervention/v1";
export const PEG_INTERVENTION_PROFILE = Object.freeze({
  usedStorage: 1_138_824_751,
  treeEntries: 24, treeDirectories: 10, treeFiles: 14,
  treeBytes: 1_138_855_978,
  selectedFiles: 9, selectedBytes: 291_674_372,
  noVideoFiles: 7, noVideoBytes: 6_572_363,
  handVideoFiles: 2, handVideoBytes: 285_102_009,
  baseVideoFiles: 5, baseVideoBytes: 847_181_606,
  episodes: 106, frames: 39_295, fps: 20,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_API_BYTES = 8 * 1024 * 1024;
const RANGE_CHUNK_BYTES = 8 * 1024 * 1024;
const FETCH_ATTEMPTS = 6;
const DIRECT_CONCURRENCY = 7;
const RANGE_CONCURRENCY = 6;

function fail(code, detail = null) {
  throw new Error(detail === null ? `PEG_INTERVENTION_${code}`
    : `PEG_INTERVENTION_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function pegInterventionSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return pegInterventionSha256(Buffer.from(
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
  const encoded = PEG_INTERVENTION_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${PEG_INTERVENTION_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${PEG_INTERVENTION_REVISION}`
      + "?recursive=true&expand=false&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${PEG_INTERVENTION_REVISION}`,
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
    taskCategories: value.cardData?.task_categories ?? null, siblingPaths };
  if (projection.id !== PEG_INTERVENTION_ID
    || projection.sha !== PEG_INTERVENTION_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false
    || projection.usedStorage !== PEG_INTERVENTION_PROFILE.usedStorage
    || projection.cardLicense !== null || siblingPaths.length !== 14
    || siblingPaths.some((entry) => !safeRemotePath(entry))) {
    fail("REPOSITORY_PROFILE_INVALID");
  }
  return projection;
}

function selectedPath(remotePath) {
  return !remotePath.endsWith(".mp4")
    || remotePath.startsWith("videos/observation.images.hand_camera/");
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
  const hand = selected.filter((entry) => entry.path.endsWith(".mp4"));
  const noVideo = selected.filter((entry) => !entry.path.endsWith(".mp4"));
  const base = files.filter((entry) => entry.path.startsWith(
    "videos/observation.images.base_camera/") && entry.path.endsWith(".mp4"));
  const bytes = (rows) => rows.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (projection.length !== 24 || files.length !== 14 || directories.length !== 10
    || bytes(files) !== 1_138_855_978 || selected.length !== 9
    || bytes(selected) !== 291_674_372 || noVideo.length !== 7
    || bytes(noVideo) !== 6_572_363 || hand.length !== 2
    || bytes(hand) !== 285_102_009 || base.length !== 5
    || bytes(base) !== 847_181_606) fail("TREE_PROFILE_INVALID");
  return { projection, files, directories, selected, hand, noVideo, base,
    treeHash: digest("outsider/peg-intervention-tree/v1", projection) };
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
    const preseededTarget = safeJoin(work, `objects/${entry.path}`);
    const preseeded = existsSync(preseededTarget)
      && statSync(preseededTarget).size === entry.sizeBytes
      && validateObject(entry, preseededTarget) === entry.lfsSha256;
    const ranges = [];
    if (!preseeded) {
      for (let start = 0, index = 0; start < entry.sizeBytes;
        start += RANGE_CHUNK_BYTES, index += 1) {
        ranges.push({ entry, key, url, index, start,
          end: Math.min(entry.sizeBytes - 1, start + RANGE_CHUNK_BYTES - 1) });
      }
    }
    return { entry, key, url, head, ranges, preseeded };
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
      sha256: pegInterventionSha256(response.bytes),
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
    if (profile.preseeded) {
      objectRecords.push({ path: entry.path, bytes: entry.sizeBytes, sha256,
        oid: entry.oid, lfsSha256: entry.lfsSha256,
        acquisition: "VERIFIED_COMPLETE_OBJECT_CHECKPOINT_PLUS_PINNED_HEAD",
        status: profile.head.status, finalUrl: profile.head.finalUrl,
        rangeChunks: 0, rangeLogHash: null });
      continue;
    }
    const rangeLog = { schema: "outsider/peg-intervention-http-ranges/v1",
      path: entry.path, requestUrl: profile.url, contentLength: entry.sizeBytes,
      chunkBytes: RANGE_CHUNK_BYTES, ranges };
    writeCanonical(safeJoin(work, `http/ranges/${profile.key}.ranges.json`), rangeLog);
    const record = { path: entry.path, bytes: entry.sizeBytes, sha256,
      oid: entry.oid, lfsSha256: entry.lfsSha256,
      acquisition: "STRICT_HTTP_RANGE_ASSEMBLY", status: 206,
      finalUrl: profile.head.finalUrl, rangeChunks: ranges.length,
      rangeLogHash: digest("outsider/peg-intervention-range-log/v1", ranges) };
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
  return {
    schema: PEG_INTERVENTION_SOURCE_SCHEMA, frozenAt: PEG_INTERVENTION_FROZEN_AT,
    dataset: { id: PEG_INTERVENTION_ID, revision: PEG_INTERVENTION_REVISION },
    before: { repository: before.repository, treeHash: before.tree.treeHash },
    after: { repository: after.repository, treeHash: after.tree.treeHash },
    tree: before.tree.projection, remoteObjects: objects,
    terminalDispositions: before.tree.files.map((entry) => ({
      path: entry.path, bytes: entry.sizeBytes,
      disposition: selectedPath(entry.path) ? "ACQUIRED_AND_REPLAYED"
        : "TREE_INVENTORY_ONLY_NOT_ACQUIRED",
      reason: selectedPath(entry.path)
        ? (entry.path.endsWith(".mp4") ? "COMPLETE_HAND_CAMERA_MODALITY"
          : "COMPLETE_SEMANTIC_NO_VIDEO_CLOSURE")
        : "OVERSIZED_BASE_CAMERA_MODALITY_EXCLUDED_COMPLETE_HAND_SELECTED",
    })),
    closure: {
      recursiveTreeCapturedBeforeAndAfter: true,
      recursiveTreeEntries: 24, recursiveTreeDirectories: 10,
      recursiveTreeFiles: 14, recursiveTreeBytes: 1_138_855_978,
      noFurtherTreePage: true,
      selectedFiles: 9, selectedBytes: 291_674_372,
      noVideoFiles: 7, noVideoBytes: 6_572_363,
      completeSemanticNoVideoClosure: true,
      handVideoFiles: 2, handVideoBytes: 285_102_009,
      completeHandCameraModality: true,
      allPublishedEpisodesInSelectedData: true,
      baseVideoFilesInventoryOnly: 5,
      baseVideoBytesInventoryOnly: 847_181_606,
      completeFixedRepositoryAcquired: false, randomTruncation: false,
      allRepositoryFilesHaveTerminalDisposition: true,
      repositoryUsedStorageBytes: 1_138_824_751,
      repositoryUsedStorageAndTreeBytesAreDistinctMeasures: true,
    },
    sourceFiles,
    sourceRoot: digest("outsider/peg-intervention-source-root/v1", sourceFiles),
  };
}

export async function acquirePinnedPegInterventionSource(sourceDirectory,
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
    const completed = verifyPegInterventionSourceDirectory(work);
    if (!completed.ok) fail("COMPLETED_CHECKPOINT_INVALID", completed.error);
    ensureDirectory(path.dirname(sourceDirectory));
    renameSync(work, sourceDirectory);
    chmodSync(sourceDirectory, 0o700);
    return verifyPegInterventionSourceDirectory(sourceDirectory);
  }
  writeCanonical(safeJoin(work, "source-checkpoint.json"), {
    schema: "outsider/peg-intervention-source-checkpoint/v1",
    target: path.resolve(sourceDirectory), revision: PEG_INTERVENTION_REVISION,
  });
  const before = await captureApi("before", work, fetchImpl);
  const direct = before.tree.selected.filter((entry) => !entry.path.endsWith(".mp4"));
  const [directRecords, rangeRecords] = await Promise.all([
    mapConcurrent(direct, DIRECT_CONCURRENCY,
      (entry) => fetchDirectObject(entry, work, fetchImpl)),
    acquireRangedObjects(before.tree.hand, work, fetchImpl),
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
    manifestHash: digest("outsider/peg-intervention-source-manifest/v1", body) };
  writeCanonical(safeJoin(work, "acquisition-manifest.json"), manifest);
  enforcePrivateTree(work);
  ensureDirectory(path.dirname(sourceDirectory));
  renameSync(work, sourceDirectory);
  chmodSync(sourceDirectory, 0o700);
  const checked = verifyPegInterventionSourceDirectory(sourceDirectory);
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

export function verifyPegInterventionSourceDirectory(sourceDirectory) {
  try {
    const root = lstatSync(sourceDirectory);
    if (root.isSymbolicLink() || !root.isDirectory() || (root.mode & 0o777) !== 0o700) {
      fail("SOURCE_DIRECTORY_MODE_INVALID");
    }
    const manifest = jsonValue(readFileSync(readSource(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== PEG_INTERVENTION_SOURCE_SCHEMA
      || manifest.frozenAt !== PEG_INTERVENTION_FROZEN_AT
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_SHAPE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/peg-intervention-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    const actual = scanFiles(sourceDirectory, new Set(["acquisition-manifest.json"]));
    if (!same(actual, manifest.sourceFiles)
      || manifest.sourceRoot !== digest("outsider/peg-intervention-source-root/v1",
        actual)) fail("SOURCE_ROOT_INVALID");
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
    if (!Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 9) {
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
          || digest("outsider/peg-intervention-range-log/v1", log.ranges)
            !== record.rangeLogHash) fail("RANGE_LOG_INVALID", record.path);
      }
    }
    if (!Array.isArray(manifest.terminalDispositions)
      || manifest.terminalDispositions.length !== 14
      || manifest.terminalDispositions.filter((row) =>
        row.disposition === "ACQUIRED_AND_REPLAYED").length !== 9
      || manifest.terminalDispositions.filter((row) =>
        row.disposition === "TREE_INVENTORY_ONLY_NOT_ACQUIRED").length !== 5) {
      fail("DISPOSITION_INVALID");
    }
    if (manifest.closure?.selectedFiles !== 9
      || manifest.closure?.selectedBytes !== 291_674_372
      || manifest.closure?.completeSemanticNoVideoClosure !== true
      || manifest.closure?.completeHandCameraModality !== true
      || manifest.closure?.completeFixedRepositoryAcquired !== false
      || manifest.closure?.allRepositoryFilesHaveTerminalDisposition !== true) {
      fail("CLOSURE_INVALID");
    }
    return { ok: true, manifest,
      before: { repository: beforeRepo, tree: beforeTree },
      after: { repository: afterRepo, tree: afterTree },
      verificationLevel:
        "PINNED_ALL_EPISODE_NO_VIDEO_PLUS_COMPLETE_HAND_CAMERA_MODALITY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYTHON_PEG_INTERVENTION_REPLAY = String.raw`
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
    raise SystemExit("PEG_INTERVENTION_REPLAY_" + code
                     + ((":" + detail) if detail else ""))

def inside(base, relative):
    value = os.path.realpath(os.path.join(base, relative))
    if not value.startswith(base + os.sep) or not os.path.isfile(value):
        die("PATH", relative)
    return value

def obj(relative):
    return inside(objects, relative)

def source_file(relative):
    return inside(root, relative)

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

def packed_hash(values, code):
    digest_value = hashlib.sha256()
    for value in values:
        digest_value.update(struct.pack(code, value))
    return "sha256:" + digest_value.hexdigest()

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
      "columns": table.num_columns, "schema": schema,
      "schemaHash": logical_hash(schema),
      "logicalRowsHash": logical_hash(table.to_pylist()),
      "nullValues": sum(table[name].null_count for name in table.column_names)}

data_source, data, data_report = parquet("data/chunk-000/file-000.parquet")
episode_source, episode_table, episode_report = parquet(
    "meta/episodes/chunk-000/file-000.parquet")
tasks_source, tasks_table, tasks_report = parquet("meta/tasks.parquet")

expected_data_columns = ["action", "observation.state", "observation.qvel",
  "intervention", "next.success", "timestamp", "frame_index",
  "episode_index", "index", "task_index"]
if data.column_names != expected_data_columns or data.num_rows != 39295 \
   or data.num_columns != 10 or data_source.num_row_groups != 106:
    die("DATA_PROFILE")
if episode_table.num_rows != 106 or episode_table.num_columns != 137 \
   or episode_source.num_row_groups != 1:
    die("EPISODE_PROFILE")
essential_episode_columns = {"episode_index", "tasks", "length",
  "data/chunk_index", "data/file_index", "dataset_from_index",
  "dataset_to_index", "videos/observation.images.base_camera/chunk_index",
  "videos/observation.images.base_camera/file_index",
  "videos/observation.images.base_camera/from_timestamp",
  "videos/observation.images.base_camera/to_timestamp",
  "videos/observation.images.hand_camera/chunk_index",
  "videos/observation.images.hand_camera/file_index",
  "videos/observation.images.hand_camera/from_timestamp",
  "videos/observation.images.hand_camera/to_timestamp",
  "meta/episodes/chunk_index", "meta/episodes/file_index"}
if not essential_episode_columns.issubset(episode_table.column_names):
    die("EPISODE_COLUMNS")
if tasks_table.column_names != ["task_index", "task"] \
   or tasks_source.num_row_groups != 1 \
   or tasks_table.to_pylist() != [{"task_index": 0,
                                  "task": "Insert the peg into the hole."}]:
    die("TASK_TABLE")
if data_report["nullValues"] != 0 or episode_report["nullValues"] != 0 \
   or tasks_report["nullValues"] != 0:
    die("NULL_VALUES")

values = {name: data[name].to_pylist() for name in data.column_names}
episodes = episode_table.to_pylist()
if values["index"] != list(range(39295)) \
   or sorted(set(values["episode_index"])) != list(range(106)) \
   or set(values["task_index"]) != {0}:
    die("DATA_INDEX_CENSUS")

vectors = {}
vector_widths = {"action": 8, "observation.state": 9,
                 "observation.qvel": 9}
for name, width in vector_widths.items():
    array = np.asarray(values[name], dtype=np.float32)
    if array.shape != (39295, width) or not np.isfinite(array).all():
        die("VECTOR_VALUES", name)
    vectors[name] = array
for name in ["timestamp", "frame_index", "episode_index", "index", "task_index"]:
    if not np.isfinite(np.asarray(values[name], dtype=float)).all():
        die("SCALAR_VALUES", name)

episode_indices = np.asarray(values["episode_index"], dtype=np.int64)
frame_indices = np.asarray(values["frame_index"], dtype=np.int64)
timestamps = np.asarray(values["timestamp"], dtype=np.float64)
intervention = np.asarray(values["intervention"], dtype=np.bool_)
success = np.asarray(values["next.success"], dtype=np.bool_)
same_episode_transition = episode_indices[1:] == episode_indices[:-1]
within_transition_count = int(same_episode_transition.sum())
if within_transition_count != 39189:
    die("TRANSITION_COUNT")

continuity = {}
for name, array in vectors.items():
    differences = np.abs(array[1:] - array[:-1])[same_episode_transition]
    continuity[name] = {
      "rowsWithValues": int(array.shape[0]),
      "withinEpisodeTransitions": int(differences.shape[0]),
      "maximumAbsoluteStep": float(differences.max()),
      "meanAbsoluteStep": float(differences.mean(dtype=np.float64)),
      "rootMeanSquareStep": float(np.sqrt(np.mean(
          differences.astype(np.float64) ** 2))),
      "exactRepeatedTransitionRows": int(np.all(differences == 0, axis=1).sum()),
      "finite": True,
      "width": int(array.shape[1]),
    }

expected_base_ranges = [(0, 25), (25, 55), (55, 62), (62, 83), (83, 106)]
expected_hand_ranges = [(0, 62), (62, 106)]
camera_windows = {"base_camera": [[] for _ in range(5)],
                  "hand_camera": [[] for _ in range(2)]}
episode_crosswalk = []
lengths = []
segments_per_episode = []
publisher_success_per_episode = []
stable_episode_stat_max_error = 0.0
restart_episode_stat_max_error = 0.0
previous_to = 0
stable_stat_fields = ["action", "observation.state", "observation.qvel",
  "intervention", "next.success", "timestamp", "frame_index", "task_index"]
for expected_episode, episode in enumerate(episodes):
    if episode["episode_index"] != expected_episode:
        die("EPISODE_INDEX", str(expected_episode))
    start = episode["dataset_from_index"]
    stop = episode["dataset_to_index"]
    length = episode["length"]
    if start != previous_to or stop - start != length:
        die("EPISODE_RANGE", str(expected_episode))
    previous_to = stop
    if episode["data/chunk_index"] != 0 or episode["data/file_index"] != 0 \
       or episode["meta/episodes/chunk_index"] != 0 \
       or episode["meta/episodes/file_index"] != 0:
        die("EPISODE_FILE", str(expected_episode))
    if values["episode_index"][start:stop] != [expected_episode] * length \
       or values["frame_index"][start:stop] != list(range(length)) \
       or values["task_index"][start:stop] != [0] * length:
        die("EPISODE_DATA_CROSSWALK", str(expected_episode))
    if episode["tasks"] != ["Insert the peg into the hole."]:
        die("EPISODE_TASK", str(expected_episode))
    max_time_error = max(abs(float(values["timestamp"][row])
                             - values["frame_index"][row] / 20.0)
                         for row in range(start, stop))
    if max_time_error > 0.000002:
        die("EPISODE_TIMESTAMP", str(expected_episode))
    camera_projection = {}
    for camera, expected_ranges in [("base_camera", expected_base_ranges),
                                     ("hand_camera", expected_hand_ranges)]:
        prefix = "videos/observation.images." + camera
        file_index = episode[prefix + "/file_index"]
        expected_file = next(index for index, interval in enumerate(expected_ranges)
                             if interval[0] <= expected_episode < interval[1])
        if episode[prefix + "/chunk_index"] != 0 or file_index != expected_file:
            die("VIDEO_FILE_CROSSWALK", camera + ":" + str(expected_episode))
        window_from = episode[prefix + "/from_timestamp"]
        window_to = episode[prefix + "/to_timestamp"]
        expected_from = camera_windows[camera][file_index][-1][1] \
            if camera_windows[camera][file_index] else 0.0
        if abs(window_from - expected_from) > 0.000000001 \
           or abs((window_to - window_from) - length / 20.0) > 0.000000001:
            die("VIDEO_WINDOW", camera + ":" + str(expected_episode))
        camera_windows[camera][file_index].append((window_from, window_to))
        camera_projection[camera] = {"fileIndex": file_index,
          "fromTimestamp": window_from, "toTimestamp": window_to}
    for key in stable_stat_fields:
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
    local_episode = expected_episode if expected_episode < 62 else expected_episode - 62
    local_start = start if expected_episode < 62 else start - 20840
    local_stop = stop if expected_episode < 62 else stop - 20840
    restarted_expected = {
      "episode_index": {"min": [float(local_episode)],
        "max": [float(local_episode)], "mean": [float(local_episode)]},
      "index": {"min": [float(local_start)], "max": [float(local_stop - 1)],
        "mean": [(local_start + local_stop - 1) / 2.0]},
    }
    for key in ["episode_index", "index"]:
        if episode["stats/%s/count" % key] != [length]:
            die("RESTART_STAT_COUNT", str(expected_episode) + ":" + key)
        for stat in ["min", "max", "mean"]:
            restart_episode_stat_max_error = max(restart_episode_stat_max_error,
              float(np.max(np.abs(np.asarray(episode["stats/%s/%s" % (key, stat)],
                                                  dtype=float)
                                  - np.asarray(restarted_expected[key][stat],
                                               dtype=float)))))
    episode_intervention = intervention[start:stop]
    episode_success = success[start:stop]
    starts = int(np.count_nonzero(episode_intervention
                 & np.concatenate((np.asarray([True], dtype=np.bool_),
                                   ~episode_intervention[:-1]))))
    unique_success = np.unique(episode_success)
    if len(unique_success) != 1:
        die("SUCCESS_NOT_EPISODE_CONSTANT", str(expected_episode))
    publisher_success = bool(unique_success[0])
    segments_per_episode.append(starts)
    publisher_success_per_episode.append(publisher_success)
    lengths.append(length)
    episode_crosswalk.append({"episodeIndex": expected_episode,
      "length": length, "datasetFromIndex": start, "datasetToIndex": stop,
      "taskIndex": 0, "timestampMaxAbsoluteErrorFromFrameOver20": max_time_error,
      "interventionTrueFrames": int(episode_intervention.sum()),
      "interventionSegments": starts,
      "publisherSuccessBroadcastValue": publisher_success,
      "baseVideo": camera_projection["base_camera"],
      "handVideo": camera_projection["hand_camera"]})
if previous_to != 39295 or sum(lengths) != 39295 \
   or min(lengths) != 35 or max(lengths) != 831:
    die("EPISODE_LENGTHS")
if stable_episode_stat_max_error > 0.00001 \
   or restart_episode_stat_max_error > 0.000000001:
    die("EPISODE_STATS")

segment_distribution = {str(value): segments_per_episode.count(value)
                        for value in sorted(set(segments_per_episode))}
intervention_true_frames = int(intervention.sum())
publisher_success_frames = int(success.sum())
episodes_with_intervention = sum(row["interventionTrueFrames"] > 0
                                 for row in episode_crosswalk)
episodes_all_intervention = sum(row["interventionTrueFrames"] == row["length"]
                                for row in episode_crosswalk)
if intervention_true_frames != 28719 or episodes_with_intervention != 105 \
   or episodes_all_intervention != 1 or sum(segments_per_episode) != 134 \
   or segment_distribution != {"0": 1, "1": 77, "2": 27, "3": 1} \
   or sum(publisher_success_per_episode) != 104 \
   or publisher_success_frames != 38796:
    die("INTERVENTION_SUCCESS_CENSUS")
episode_61 = episode_crosswalk[61]
episode_105 = episode_crosswalk[105]
if episode_61["length"] != 35 or episode_61["interventionTrueFrames"] != 0 \
   or episode_61["publisherSuccessBroadcastValue"] is not False \
   or episode_105["length"] != 464 \
   or episode_105["interventionTrueFrames"] != 464 \
   or episode_105["publisherSuccessBroadcastValue"] is not False:
    die("FAILURE_EPISODE_MORPHOLOGY")

global_timestamp_decreases = sum(values["timestamp"][index]
    < values["timestamp"][index - 1] for index in range(1, 39295))
within_timestamp_decreases = sum(values["episode_index"][index]
    == values["episode_index"][index - 1]
    and values["timestamp"][index] < values["timestamp"][index - 1]
    for index in range(1, 39295))
global_frame_decreases = sum(values["frame_index"][index]
    < values["frame_index"][index - 1] for index in range(1, 39295))
if global_timestamp_decreases != 105 or within_timestamp_decreases != 0 \
   or global_frame_decreases != 105:
    die("TIMESTAMP_ORDER")

info = read_json("meta/info.json")
if info.get("codebase_version") != "v3.0" or info.get("fps") != 20 \
   or info.get("total_episodes") != 106 or info.get("total_frames") != 39295 \
   or info.get("total_tasks") != 1 or info.get("robot_type") != "maniskill_sim" \
   or info.get("splits") != {"train": "0:106"}:
    die("INFO_PROFILE")
features = info.get("features", {})
if list(features) != ["action", "observation.state", "observation.qvel",
     "observation.images.base_camera", "observation.images.hand_camera",
     "intervention", "next.success", "timestamp", "frame_index",
     "episode_index", "index", "task_index"] \
   or features["action"].get("shape") != [8] \
   or features["observation.state"].get("shape") != [9] \
   or features["observation.qvel"].get("shape") != [9]:
    die("INFO_FEATURES")
for camera in ["base_camera", "hand_camera"]:
    feature = features["observation.images." + camera]
    if feature.get("shape") != [480, 480, 3] \
       or feature.get("info", {}).get("video.codec") != "av1" \
       or feature["info"].get("video.fps") != 20 \
       or feature["info"].get("has_audio") is not False:
        die("INFO_CAMERA", camera)

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
for key in expected_data_columns:
    if stats[key].get("count") != [39295]:
        die("GLOBAL_STAT_COUNT", key)
for key in ["observation.images.base_camera", "observation.images.hand_camera"]:
    if stats[key].get("count") != [1005952000]:
        die("IMAGE_STAT_COUNT", key)

global_stable_fields = ["action", "observation.state", "observation.qvel",
  "intervention", "next.success", "timestamp", "frame_index", "task_index"]
global_stable_max_error = 0.0
for key in global_stable_fields:
    array = np.asarray(values[key], dtype=float)
    if array.ndim == 1:
        array = array[:, None]
    for stat, computed in [("min", array.min(axis=0)),
                           ("max", array.max(axis=0)),
                           ("mean", array.mean(axis=0)),
                           ("std", array.std(axis=0))]:
        global_stable_max_error = max(global_stable_max_error,
          float(np.max(np.abs(np.asarray(stats[key][stat], dtype=float)
                              - computed))))
if global_stable_max_error > 0.00001:
    die("GLOBAL_STABLE_STATS", str(global_stable_max_error))
reset_episode_index = np.asarray(values["episode_index"], dtype=float)
reset_index = np.asarray(values["index"], dtype=float)
reset_episode_index[20840:] -= 62
reset_index[20840:] -= 20840
restart_global_max_error = 0.0
for key, array in [("episode_index", reset_episode_index), ("index", reset_index)]:
    array = array[:, None]
    for stat, computed in [("min", array.min(axis=0)),
                           ("max", array.max(axis=0)),
                           ("mean", array.mean(axis=0)),
                           ("std", array.std(axis=0))]:
        restart_global_max_error = max(restart_global_max_error,
          float(np.max(np.abs(np.asarray(stats[key][stat], dtype=float)
                              - computed))))
if restart_global_max_error > 0.000000001 \
   or stats["episode_index"]["max"] != [61.0] \
   or stats["index"]["max"] != [20839.0]:
    die("GLOBAL_RESTART_STATS")

readme = read_text("README.md")
attributes = read_text(".gitattributes")
readme_claims = {
  "roboticsTaskCategory": "task_categories:\n- robotics" in readme,
  "createdUsingLeRobot": "This dataset was created using" in readme
                          and "LeRobot" in readme,
  "licenseMoreInformationNeeded": "**License:** [More Information Needed]" in readme,
  "infoBlockContains106Episodes": '"total_episodes": 106' in readme,
  "infoBlockContainsManiskillSim": '"robot_type": "maniskill_sim"' in readme,
  "licenseYamlClaimPresent": "license:" in readme.split("---", 2)[1],
}
if not all(readme_claims[key] for key in ["roboticsTaskCategory",
    "createdUsingLeRobot", "licenseMoreInformationNeeded",
    "infoBlockContains106Episodes", "infoBlockContainsManiskillSim"]) \
   or readme_claims["licenseYamlClaimPresent"]:
    die("README_CLAIMS")

def boxes(data_bytes, start, end):
    offset = start
    result = []
    while offset + 8 <= end:
        size = struct.unpack_from(">I", data_bytes, offset)[0]
        kind = data_bytes[offset + 4:offset + 8].decode("latin1")
        header = 8
        if size == 1:
            if offset + 16 > end:
                die("MP4_EXTENDED_BOX")
            size = struct.unpack_from(">Q", data_bytes, offset + 8)[0]
            header = 16
        elif size == 0:
            size = end - offset
        if size < header or offset + size > end:
            die("MP4_BOX", kind)
        result.append((kind, offset + header, offset + size, size, offset))
        offset += size
    if offset != end:
        die("MP4_TRAILING", str(end - offset))
    return result

def children(data_bytes, container, wanted):
    return [item for item in boxes(data_bytes, container[1], container[2])
            if item[0] == wanted]

def child(data_bytes, container, wanted, required=True):
    found = children(data_bytes, container, wanted)
    if required and len(found) != 1:
        die("MP4_CHILD", wanted + ":" + str(len(found)))
    return found[0] if found else None

def fullbox_time(data_bytes, box):
    version = data_bytes[box[1]]
    if version == 0:
        timescale = struct.unpack_from(">I", data_bytes, box[1] + 12)[0]
        duration = struct.unpack_from(">I", data_bytes, box[1] + 16)[0]
    elif version == 1:
        timescale = struct.unpack_from(">I", data_bytes, box[1] + 20)[0]
        duration = struct.unpack_from(">Q", data_bytes, box[1] + 24)[0]
    else:
        die("MP4_TIME_VERSION", str(version))
    if timescale <= 0:
        die("MP4_TIMESCALE")
    return timescale, duration

def u32_entries(data_bytes, box, width):
    count = struct.unpack_from(">I", data_bytes, box[1] + 4)[0]
    start = box[1] + 8
    if start + count * width > box[2]:
        die("MP4_TABLE", box[0])
    return count, start

def parse_mp4(relative):
    with open(obj(relative), "rb") as handle:
        data_bytes = handle.read()
    top = boxes(data_bytes, 0, len(data_bytes))
    ftyp = [box for box in top if box[0] == "ftyp"]
    moov = [box for box in top if box[0] == "moov"]
    mdats = [box for box in top if box[0] == "mdat"]
    if len(ftyp) != 1 or len(moov) != 1 or not mdats:
        die("MP4_TOP", relative)
    ftyp_payload = data_bytes[ftyp[0][1]:ftyp[0][2]]
    movie_scale, movie_duration = fullbox_time(
        data_bytes, child(data_bytes, moov[0], "mvhd"))
    tracks = []
    for trak in children(data_bytes, moov[0], "trak"):
        tkhd = child(data_bytes, trak, "tkhd")
        mdia = child(data_bytes, trak, "mdia")
        scale, duration = fullbox_time(data_bytes, child(data_bytes, mdia, "mdhd"))
        hdlr = child(data_bytes, mdia, "hdlr")
        handler = data_bytes[hdlr[1] + 8:hdlr[1] + 12].decode("latin1")
        stbl = child(data_bytes, child(data_bytes, mdia, "minf"), "stbl")
        stsd = child(data_bytes, stbl, "stsd")
        description_count = struct.unpack_from(">I", data_bytes, stsd[1] + 4)[0]
        sample_entry = stsd[1] + 8
        codec = data_bytes[sample_entry + 4:sample_entry + 8].decode("latin1")
        width = struct.unpack_from(">H", data_bytes, sample_entry + 32)[0] \
            if handler == "vide" else None
        height = struct.unpack_from(">H", data_bytes, sample_entry + 34)[0] \
            if handler == "vide" else None
        stsz = child(data_bytes, stbl, "stsz")
        default_size = struct.unpack_from(">I", data_bytes, stsz[1] + 4)[0]
        sample_count = struct.unpack_from(">I", data_bytes, stsz[1] + 8)[0]
        if default_size == 0:
            if stsz[1] + 12 + sample_count * 4 > stsz[2]:
                die("MP4_STSZ", relative)
            sample_sizes = [struct.unpack_from(">I", data_bytes,
                stsz[1] + 12 + index * 4)[0] for index in range(sample_count)]
        else:
            sample_sizes = [default_size] * sample_count
        stts = child(data_bytes, stbl, "stts")
        timing_count, timing_start = u32_entries(data_bytes, stts, 8)
        timing = [struct.unpack_from(">II", data_bytes, timing_start + index * 8)
                  for index in range(timing_count)]
        stsc = child(data_bytes, stbl, "stsc")
        stsc_count, stsc_start = u32_entries(data_bytes, stsc, 12)
        stsc_values = [struct.unpack_from(">III", data_bytes,
            stsc_start + index * 12) for index in range(stsc_count)]
        stco = child(data_bytes, stbl, "stco", required=False)
        co64 = child(data_bytes, stbl, "co64", required=False)
        if (stco is None) == (co64 is None):
            die("MP4_CHUNK_TABLE", relative)
        offset_box = stco if stco is not None else co64
        offset_width = 4 if stco is not None else 8
        offset_count, offset_start = u32_entries(data_bytes, offset_box, offset_width)
        offset_code = ">I" if offset_width == 4 else ">Q"
        chunk_offsets = [struct.unpack_from(offset_code, data_bytes,
            offset_start + index * offset_width)[0] for index in range(offset_count)]
        mdat_payloads = [(box[1], box[2]) for box in mdats]
        if any(not any(start <= value < end for start, end in mdat_payloads)
               for value in chunk_offsets):
            die("MP4_CHUNK_OFFSET", relative)
        stss = child(data_bytes, stbl, "stss", required=False)
        if stss is None:
            sync_samples = list(range(1, sample_count + 1))
        else:
            sync_count, sync_start = u32_entries(data_bytes, stss, 4)
            sync_samples = [struct.unpack_from(">I", data_bytes,
                sync_start + index * 4)[0] for index in range(sync_count)]
        timing_samples = sum(row[0] for row in timing)
        timing_ticks = sum(row[0] * row[1] for row in timing)
        tracks.append({"handler": handler, "codec": codec,
          "sampleDescriptionEntries": description_count,
          "sampleCount": sample_count, "sampleDataBytes": sum(sample_sizes),
          "sampleSizesHash": packed_hash(sample_sizes, ">I"),
          "timingEntries": timing_count, "timingSampleCount": timing_samples,
          "timingDurationTicks": timing_ticks,
          "timingTableHash": logical_hash(timing),
          "sampleToChunkEntries": stsc_count,
          "sampleToChunkTableHash": logical_hash(stsc_values),
          "chunkOffsetTable": "stco" if stco is not None else "co64",
          "chunkCount": offset_count,
          "chunkOffsetsHash": packed_hash(chunk_offsets, offset_code),
          "allChunkOffsetsInsideMdat": True,
          "syncSampleCount": len(sync_samples),
          "syncSamplesHash": packed_hash(sync_samples, ">I"),
          "timescale": scale, "durationTicks": duration,
          "durationSeconds": duration / scale,
          "trackWidth": struct.unpack_from(">I", data_bytes, tkhd[2] - 8)[0]
                        / 65536.0,
          "trackHeight": struct.unpack_from(">I", data_bytes, tkhd[2] - 4)[0]
                         / 65536.0,
          "sampleWidth": width, "sampleHeight": height})
    return {"path": relative, "bytes": len(data_bytes),
      "topLevelBoxes": [box[0] for box in top],
      "topLevelBoxBytes": sum(box[3] for box in top),
      "majorBrand": ftyp_payload[:4].decode("latin1"),
      "minorVersion": struct.unpack_from(">I", ftyp_payload, 4)[0],
      "compatibleBrands": [ftyp_payload[index:index + 4].decode("latin1")
                           for index in range(8, len(ftyp_payload), 4)],
      "movieTimescale": movie_scale, "movieDurationTicks": movie_duration,
      "movieDurationSeconds": movie_duration / movie_scale,
      "mdatBoxes": len(mdats),
      "mdatPayloadBytes": sum(box[2] - box[1] for box in mdats),
      "tracks": tracks}

video_relatives = [
  "videos/observation.images.hand_camera/chunk-000/file-%03d.mp4" % index
  for index in range(2)]
videos = [parse_mp4(relative) for relative in video_relatives]
video_tracks = [track for item in videos for track in item["tracks"]]
expected_samples = [20840, 18455]
if sum(item["bytes"] for item in videos) != 285102009 \
   or len(video_tracks) != 2 \
   or [track["sampleCount"] for track in video_tracks] != expected_samples \
   or any(track["handler"] != "vide" or track["codec"] != "av01"
          or track["sampleDescriptionEntries"] != 1
          or track["sampleWidth"] != 480 or track["sampleHeight"] != 480
          or track["timingSampleCount"] != track["sampleCount"]
          or track["timingDurationTicks"] != track["durationTicks"]
          for track in video_tracks):
    die("VIDEO_PROFILE")
for file_index, track in enumerate(video_tracks):
    if abs(track["durationSeconds"] - expected_samples[file_index] / 20.0) \
       > 0.000000001 \
       or abs(camera_windows["hand_camera"][file_index][-1][1]
              - track["durationSeconds"]) > 0.000000001 \
       or videos[file_index]["topLevelBoxBytes"] != videos[file_index]["bytes"] \
       or track["sampleDataBytes"] != videos[file_index]["mdatPayloadBytes"]:
        die("VIDEO_TIMING_OR_SAMPLE_BYTES", str(file_index))

numeric_hashes = {
  "actionFloat32LittleEndian": raw_hash(vectors["action"], "<f4"),
  "stateFloat32LittleEndian": raw_hash(vectors["observation.state"], "<f4"),
  "qvelFloat32LittleEndian": raw_hash(vectors["observation.qvel"], "<f4"),
  "interventionBool": raw_hash(intervention, "?"),
  "successBool": raw_hash(success, "?"),
  "timestampFloat32LittleEndian": raw_hash(values["timestamp"], "<f4"),
  "frameIndexInt64LittleEndian": raw_hash(values["frame_index"], "<i8"),
  "episodeIndexInt64LittleEndian": raw_hash(values["episode_index"], "<i8"),
  "indexInt64LittleEndian": raw_hash(values["index"], "<i8"),
  "taskIndexInt64LittleEndian": raw_hash(values["task_index"], "<i8"),
}

data_summary = {**data_report,
  "globalIndicesContiguousZeroThrough39294": True,
  "duplicateGlobalIndices": 0,
  "episodeIndicesContiguousZeroThrough105": True,
  "actionWidth": 8, "stateWidth": 9, "qvelWidth": 9,
  "nonfiniteVectorValues": 0,
  "globalTimestampDecreasesAtEpisodeReset": global_timestamp_decreases,
  "withinEpisodeTimestampDecreases": within_timestamp_decreases,
  "globalFrameIndexDecreasesAtEpisodeReset": global_frame_decreases,
  "timestampEqualsFrameIndexOver20MaxAbsoluteError": max(
      row["timestampMaxAbsoluteErrorFromFrameOver20"] for row in episode_crosswalk),
  "withinEpisodeTransitionRows": within_transition_count,
  "continuity": continuity, "numericContentHashes": numeric_hashes,
  "physicalContinuityThresholdApplied": False,
  "rawActionStateQvelValuesProjected": False}

episode_summary = {**episode_report,
  "episodeIndicesContiguousZeroThrough105": True,
  "sumEpisodeLengths": sum(lengths), "minimumEpisodeLength": min(lengths),
  "maximumEpisodeLength": max(lengths), "episodeLengthsHash": logical_hash(lengths),
  "datasetRangesContiguousNoGapsOrOverlaps": True,
  "episodeDataFrameTimestampTaskCrosswalkExact": True,
  "videoWindowsContiguousWithinEachFile": True,
  "videoWindowDurationEqualsEpisodeLengthOver20": True,
  "baseCameraEpisodeFileRanges": [list(value) for value in expected_base_ranges],
  "handCameraEpisodeFileRanges": [list(value) for value in expected_hand_ranges],
  "stableEpisodeStatMaxAbsoluteError": stable_episode_stat_max_error,
  "restartedIdentifierEpisodeStatMaxAbsoluteError": restart_episode_stat_max_error,
  "restartedIdentifierStatsAffectEpisodes": 44,
  "restartedEpisodeIndexOffset": 62, "restartedGlobalIndexOffset": 20840,
  "taskStrings": ["Insert the peg into the hole."],
  "episodeCrosswalk": episode_crosswalk,
  "rawPerEpisodeStatisticsProjected": False}

video_summary = {"files": len(videos),
  "bytes": sum(item["bytes"] for item in videos),
  "tracks": len(video_tracks),
  "totalSamples": sum(track["sampleCount"] for track in video_tracks),
  "totalSampleDataBytes": sum(track["sampleDataBytes"] for track in video_tracks),
  "sampleCountsEqualHandVideoMetadataWindows": True,
  "trackDurationsEqualSamplesOver20": True,
  "episodeWindowsCloseEachTrackDuration": True,
  "codecs": sorted(set(track["codec"] for track in video_tracks)),
  "dimensions": sorted(set(str(track["sampleWidth"]) + "x"
                           + str(track["sampleHeight"]) for track in video_tracks)),
  "containerAndFullSampleTablesReplay": videos,
  "pixelsDecoded": False, "visualInspectionPerformed": False,
  "pixelsProjected": False}

result = {
  "data": data_summary, "episodes": episode_summary,
  "tasks": {**tasks_report, "records": tasks_table.to_pylist(),
            "taskStrings": ["Insert the peg into the hole."]},
  "info": {"bytes": os.path.getsize(obj("meta/info.json")),
    "logicalHash": logical_hash(info), "codebaseVersion": "v3.0",
    "publisherDeclaredRobotType": "maniskill_sim", "episodes": 106,
    "frames": 39295, "tasks": 1, "fps": 20, "split": {"train": "0:106"},
    "featureKeys": list(features), "actionShape": [8], "stateShape": [9],
    "qvelShape": [9], "handCameraShape": [480, 480, 3],
    "baseCameraShape": [480, 480, 3], "publisherDeclaredVideoCodec": "av1",
    "rawPathsProjected": False},
  "stats": {"bytes": os.path.getsize(obj("meta/stats.json")),
    "logicalHash": logical_hash(stats), "keys": list(stats), "jsonFinite": True,
    "globalStableFieldMaxAbsoluteError": global_stable_max_error,
    "globalRestartProjectionMaxAbsoluteError": restart_global_max_error,
    "statsIndexMaximum": 20839, "unifiedDataIndexMaximum": 39294,
    "statsEpisodeIndexMaximum": 61, "unifiedEpisodeIndexMaximum": 105,
    "globalIdentifierStatsUseTwoPartRestartProjection": True,
    "perEpisodeIdentifierStatsRestartForLast44Episodes": True,
    "imageStatisticCounts": {"baseCamera": 1005952000,
                             "handCamera": 1005952000},
    "rawStatisticsProjected": False},
  "sourceLineageDiscrepancy": {
    "identifierRestartVerifiedAgainstParquetEpisodeStatsAndStatsJson": True,
    "affectedEpisodeRows": 44, "episodeIndexOffset": 62,
    "globalIndexOffset": 20840,
    "commitLineageClaimedFromUnselectedMetadata": False,
    "rawPublisherFilesystemPathProjected": False},
  "documents": {"readme": {"bytes": len(readme.encode("utf-8")),
      "claims": readme_claims, "rawTextProjected": False},
    "gitAttributes": {"bytes": len(attributes.encode("utf-8")),
      "lfsPatternLines": sum("filter=lfs" in line
                             for line in attributes.splitlines())}},
  "video": video_summary,
  "nativeSemantics": {
    "rewardFieldPresent": False, "doneFieldPresent": False,
    "failureFieldPresent": False, "recoveryFieldPresent": False,
    "interventionFieldPresent": True, "successFieldPresent": True,
    "successField": "next.success", "interventionField": "intervention",
    "successIsEpisodeConstantFrameBroadcast": True,
    "publisherSuccessEpisodeCount": 104, "publisherFailureEpisodeCount": 2,
    "publisherSuccessTrueFrames": 38796, "publisherSuccessFalseFrames": 499,
    "interventionTrueFrames": 28719, "interventionFalseFrames": 10576,
    "episodesWithAnyIntervention": 105, "episodesWithAllIntervention": 1,
    "interventionSegments": 134,
    "interventionSegmentsPerEpisodeDistribution": segment_distribution,
    "episode61FailureNoIntervention": True,
    "episode105FailureAllFramesIntervention": True,
    "episodesWithInterventionAndPublisherSuccess": 104,
    "episodesWithInterventionAndPublisherFailure": 1,
    "episodesWithoutInterventionAndPublisherFailure": 1,
    "frameBroadcastValuesAreNot39295IndependentOutcomes": True,
    "interventionToPublisherSuccessIsPairedWithinEpisodeMorphologyOnly": True,
    "interventionHumanSourceVerified": False,
    "interventionAuthorizationVerified": False},
  "safety": {"publisherCodeExecuted": False, "publisherCommandsExecuted": False,
    "videoPixelsDecoded": False, "videoPixelsProjected": False,
    "rawActionStateQvelValuesProjected": False,
    "rawPublisherFilesystemPathsProjected": False},
}
print(json.dumps(result, sort_keys=True, separators=(",", ":"),
                 ensure_ascii=False, allow_nan=False))
`;

export function runPegInterventionReplay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const executed = spawnSync(python, ["-c", PYTHON_PEG_INTERVENTION_REPLAY,
    path.resolve(sourceDirectory)], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (executed.error) fail("REPLAY_PYTHON_FAILED", executed.error.message);
  if (executed.status !== 0) fail("REPLAY_FAILED",
    String(executed.stderr || executed.stdout).trim());
  let replay;
  try { replay = JSON.parse(executed.stdout); }
  catch (error) { fail("REPLAY_JSON_INVALID", error.message); }
  if (replay.data?.rows !== 39_295 || replay.episodes?.rows !== 106
    || replay.video?.files !== 2 || replay.video?.totalSamples !== 39_295
    || replay.nativeSemantics?.interventionTrueFrames !== 28_719
    || replay.nativeSemantics?.publisherSuccessEpisodeCount !== 104
    || replay.nativeSemantics?.publisherFailureEpisodeCount !== 2
    || replay.nativeSemantics?.successIsEpisodeConstantFrameBroadcast !== true
    || replay.stats?.globalIdentifierStatsUseTwoPartRestartProjection !== true
    || replay.safety?.publisherCodeExecuted !== false) fail("REPLAY_RESULT_INVALID");
  return replay;
}

function artifactBody(verified, replay) {
  return {
    schema: PEG_INTERVENTION_ARTIFACT_SCHEMA,
    frozenAt: PEG_INTERVENTION_FROZEN_AT,
    status: "PINNED_ALL_EPISODE_NO_VIDEO_PLUS_COMPLETE_HAND_CAMERA_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: { id: PEG_INTERVENTION_ID, revision: PEG_INTERVENTION_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure },
    replay,
    typedDenominators: {
      SOURCE_NATIVE_EPISODE: 106,
      ACTION_STATE_QVEL_FRAME: 39_295,
      INTERVENTION_TRUE_FRAME: 28_719,
      INTERVENTION_SEGMENT: 134,
      HAND_CAMERA_VIDEO_SAMPLE: 39_295,
      HAND_CAMERA_VIDEO_FILE: 2,
      crossTotal: null,
    },
    outcomeDenominatorBoundary: {
      publisherEpisodeOutcomeDenominator: 106,
      publisherEpisodeSuccess: 104, publisherEpisodeFailure: 2,
      frameBroadcastTrue: 38_796, frameBroadcastFalse: 499,
      frameBroadcastCountIsEpisodeOutcomeDenominator: false,
      typedPopulationsMayBeSummed: false,
    },
    semantics: {
      publisherDeclaredRobotType: "maniskill_sim",
      simulationTrajectoryPresent: true, realRobotTrajectoryPresent: false,
      sourceNativeActionStateQvelTrajectoryPresent: true,
      completeHandCameraVisualModalityPresent: true,
      baseCameraVisualModalityAcquired: false,
      baseCameraExactInventoryAndEpisodeMetadataPresent: true,
      sourceNativeInterventionFieldPresent: true,
      interventionProvenanceAsHumanVerified: false,
      interventionEstablishesAuthorization: false,
      sourceNativePublisherOutcomePresent: true,
      publisherOutcomeIsEpisodeConstantBroadcast: true,
      independentOutcomeEstablished: false,
      reliableIndependentOutcomeEstablished: false,
      interventionToSuccessMorphologyPresent: true,
      directCausalEffectEstablished: false,
      recoveryEstablished: false,
      correctionWithinEpisodeEstablished: false,
      attemptChronologyEstablished: false,
      completeAttemptCensusEstablished: false,
      delegationEstablished: false,
      longitudinalDeviceIdentityEstablished: false,
    },
    sourceDiscrepancyBoundary: {
      statsIdentifierRestartPresent: true,
      firstPartEpisodes: 62, secondPartEpisodes: 44,
      secondPartEpisodeIndexOffsetMissingInEpisodeStats: 62,
      secondPartGlobalIndexOffsetMissingInEpisodeStats: 20_840,
      statsJsonUsesRestartedIdentifierProjection: true,
      stableTelemetryAndBooleanStatsMatchUnifiedData: true,
      discrepancySilentlyCorrected: false,
    },
    rights: {
      datasetCardLicenseClaim: null,
      readmeLicenseClaim: "More Information Needed",
      rootLicenseFilePresent: false,
      upstreamLeRobotAndManiSkillRightsIndependentlyAdjudicated: false,
      visualContentRightsIndependentlyAdjudicated: false,
      legalConclusionEstablished: false,
      productionTrainingAuthorized: false,
      evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    },
    privacy: {
      rawArtifactPrivate: true, directoryMode: "0700", fileMode: "0600",
      handCameraVisualDataPresent: true, noPiiGuaranteed: false,
      privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false,
      videoPixelsDecoded: false, videoPixelsProjected: false,
      rawActionStateQvelValuesProjected: false,
      rawPublisherFilesystemPathsProjected: false,
    },
    boundary: { privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
      action: 1, simulationObservation: 1, physicalObservation: 0,
      realRobotTrajectory: 0, nativeIntervention: 1,
      humanAuthorization: 0, publisherOutcome: 1, reliableOutcome: 0,
      independentOutcome: 0, directCausalEffect: 0, recovery: 0,
      attemptCensus: 0, delegation: 0, externalEffect: 0 },
  };
}

export function pegInterventionArtifactHash(body) {
  return digest("outsider/peg-intervention/v1", body);
}

export function buildPegInterventionArtifactFromSource(sourceDirectory,
  options = {}) {
  const verified = verifyPegInterventionSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runPegInterventionReplay(sourceDirectory, options);
  const body = artifactBody(verified, replay);
  const artifact = { ...body, artifactHash: pegInterventionArtifactHash(body) };
  const checked = verifyPegInterventionArtifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifyPegInterventionArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== PEG_INTERVENTION_ARTIFACT_SCHEMA
      || artifact.frozenAt !== PEG_INTERVENTION_FROZEN_AT
      || artifact.status
        !== "PINNED_ALL_EPISODE_NO_VIDEO_PLUS_COMPLETE_HAND_CAMERA_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== pegInterventionArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.closure?.selectedFiles !== 9
      || artifact.source?.closure?.selectedBytes !== 291_674_372
      || artifact.source?.closure?.completeSemanticNoVideoClosure !== true
      || artifact.source?.closure?.completeHandCameraModality !== true
      || artifact.replay?.data?.rows !== 39_295
      || artifact.replay?.episodes?.rows !== 106
      || artifact.replay?.video?.totalSamples !== 39_295
      || artifact.replay?.video?.pixelsDecoded !== false) fail("REPLAY_INVALID");
    if (!same(artifact.typedDenominators, {
      SOURCE_NATIVE_EPISODE: 106, ACTION_STATE_QVEL_FRAME: 39_295,
      INTERVENTION_TRUE_FRAME: 28_719, INTERVENTION_SEGMENT: 134,
      HAND_CAMERA_VIDEO_SAMPLE: 39_295, HAND_CAMERA_VIDEO_FILE: 2,
      crossTotal: null })) fail("DENOMINATOR_INVALID");
    if (artifact.outcomeDenominatorBoundary?.publisherEpisodeOutcomeDenominator !== 106
      || artifact.outcomeDenominatorBoundary?.publisherEpisodeSuccess !== 104
      || artifact.outcomeDenominatorBoundary?.publisherEpisodeFailure !== 2
      || artifact.outcomeDenominatorBoundary?.frameBroadcastCountIsEpisodeOutcomeDenominator
        !== false || artifact.outcomeDenominatorBoundary?.typedPopulationsMayBeSummed
        !== false) fail("OUTCOME_DENOMINATOR_INVALID");
    if (artifact.semantics?.publisherDeclaredRobotType !== "maniskill_sim"
      || artifact.semantics?.simulationTrajectoryPresent !== true
      || artifact.semantics?.realRobotTrajectoryPresent !== false
      || artifact.semantics?.sourceNativeInterventionFieldPresent !== true
      || artifact.semantics?.interventionEstablishesAuthorization !== false
      || artifact.semantics?.sourceNativePublisherOutcomePresent !== true
      || artifact.semantics?.independentOutcomeEstablished !== false
      || artifact.semantics?.directCausalEffectEstablished !== false
      || artifact.semantics?.recoveryEstablished !== false
      || artifact.semantics?.attemptChronologyEstablished !== false
      || artifact.semantics?.completeAttemptCensusEstablished !== false) {
      fail("SEMANTIC_PROMOTION");
    }
    if (artifact.sourceDiscrepancyBoundary?.statsIdentifierRestartPresent !== true
      || artifact.sourceDiscrepancyBoundary?.discrepancySilentlyCorrected !== false
      || artifact.rights?.datasetCardLicenseClaim !== null
      || artifact.rights?.rootLicenseFilePresent !== false
      || artifact.rights?.legalConclusionEstablished !== false
      || artifact.rights?.productionTrainingAuthorized !== false
      || artifact.privacy?.rawArtifactPrivate !== true
      || artifact.privacy?.noPiiGuaranteed !== false) fail("GATE_INVALID");
    if (!same(artifact.boundary, { privacy: 0, training: 0, network: 0,
      authority: 0, CEU: 0, action: 1, simulationObservation: 1,
      physicalObservation: 0, realRobotTrajectory: 0, nativeIntervention: 1,
      humanAuthorization: 0, publisherOutcome: 1, reliableOutcome: 0,
      independentOutcome: 0, directCausalEffect: 0, recovery: 0,
      attemptCensus: 0, delegation: 0, externalEffect: 0 })) {
      fail("BOUNDARY_INVALID");
    }
    return { ok: true, artifactHash,
      verificationLevel:
        "STANDALONE_HASH_TYPED_SIM_INTERVENTION_AND_PUBLISHER_OUTCOME_BOUNDARY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyPegInterventionArtifactWithSource(artifact, sourceDirectory,
  options = {}) {
  const standalone = verifyPegInterventionArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildPegInterventionArtifactFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel:
        "FULL_PARQUET_EPISODE_INTERVENTION_SUCCESS_STATS_AND_HAND_MP4_SAMPLE_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
