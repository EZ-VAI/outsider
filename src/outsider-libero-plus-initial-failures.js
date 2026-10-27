/*
 * Fixed-revision, complete-repository intake for the public pi0.5 LIBERO-plus
 * Robot Initial States failure release.  The raw queue log contains local
 * absolute paths and the videos are simulation renders, so source bytes stay
 * private and reports expose counts and hashes rather than raw strings/pixels.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync,
  readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const LIBERO_INITIAL_ID =
  "d3d3shan/pi05-libero-plus-robot-initial-failures";
export const LIBERO_INITIAL_REVISION =
  "1807a9af5ce972c57d2bb35fd040587f5adedb22";
export const LIBERO_INITIAL_FROZEN_AT = "2026-08-30T00:00:00.000Z";
export const LIBERO_INITIAL_SOURCE_SCHEMA =
  "outsider/libero-plus-initial-failures-source/v1";
export const LIBERO_INITIAL_ARTIFACT_SCHEMA =
  "outsider/libero-plus-initial-failures/v1";
export const LIBERO_INITIAL_PROFILE = Object.freeze({
  usedStorage: 104_285_124,
  treeEntries: 42, treeDirectories: 3, treeFiles: 39,
  treeBytes: 113_741_083,
  videoFiles: 32, videoBytes: 104_274_343,
  nonVideoFiles: 7, nonVideoBytes: 9_466_740,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const FETCH_ATTEMPTS = 6;
const FETCH_CONCURRENCY = 12;
const MAX_API_BYTES = 8 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail === null ? `LIBERO_INITIAL_${code}`
    : `LIBERO_INITIAL_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function liberoInitialSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return liberoInitialSha256(Buffer.from(
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
  const encoded = LIBERO_INITIAL_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${LIBERO_INITIAL_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${LIBERO_INITIAL_REVISION}`
      + "?recursive=true&expand=false&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${LIBERO_INITIAL_REVISION}`,
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
      method: "GET", redirect: "follow", signal: controller.signal,
      headers: { Accept: options.accept ?? "*/*", "Accept-Encoding": "identity",
        "User-Agent": "outsider-source-intake/1" },
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
  if (projection.id !== LIBERO_INITIAL_ID
    || projection.sha !== LIBERO_INITIAL_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false
    || projection.usedStorage !== LIBERO_INITIAL_PROFILE.usedStorage
    || projection.cardLicense !== "mit" || siblingPaths.length !== 39
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
  const videos = files.filter((entry) => entry.path.endsWith(".mp4"));
  const nonVideos = files.filter((entry) => !entry.path.endsWith(".mp4"));
  const bytes = (rows) => rows.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (projection.length !== 42 || files.length !== 39 || directories.length !== 3
    || bytes(files) !== 113_741_083 || videos.length !== 32
    || bytes(videos) !== 104_274_343 || nonVideos.length !== 7
    || bytes(nonVideos) !== 9_466_740) fail("TREE_PROFILE_INVALID");
  return { projection, files, directories, videos, nonVideos,
    treeHash: digest("outsider/libero-plus-initial-tree/v1", projection) };
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

async function fetchObject(entry, work, fetchImpl) {
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
    finalUrl: sanitizedUrl(response.finalUrl), acquisition: "BOUNDED_DIRECT_GET" };
  writeCanonical(safeJoin(work, `http/objects/${entry.path}.headers.json`), {
    requestUrl: url, status: response.status,
    finalUrl: sanitizedUrl(response.finalUrl), headers: response.headers,
  }, false);
  writeCanonical(marker, record);
  return record;
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
    schema: LIBERO_INITIAL_SOURCE_SCHEMA, frozenAt: LIBERO_INITIAL_FROZEN_AT,
    dataset: { id: LIBERO_INITIAL_ID, revision: LIBERO_INITIAL_REVISION },
    before: { repository: before.repository, treeHash: before.tree.treeHash },
    after: { repository: after.repository, treeHash: after.tree.treeHash },
    tree: before.tree.projection, remoteObjects: objects,
    terminalDispositions: before.tree.files.map((entry) => ({
      path: entry.path, bytes: entry.sizeBytes,
      disposition: "ACQUIRED_AND_REPLAYED", reason: "COMPLETE_FIXED_REPOSITORY",
    })),
    closure: {
      recursiveTreeCapturedBeforeAndAfter: true,
      recursiveTreeEntries: 42, recursiveTreeDirectories: 3,
      recursiveTreeFiles: 39, recursiveTreeBytes: 113_741_083,
      completeFixedRepository: true, selectedFiles: 39,
      selectedBytes: 113_741_083, videoFiles: 32,
      videoBytes: 104_274_343, nonVideoFiles: 7,
      nonVideoBytes: 9_466_740, randomTruncation: false,
      globallyExhaustiveAtFixedRevision: true,
      allRepositoryFilesHaveTerminalDisposition: true,
      repositoryUsedStorageBytes: 104_285_124,
      repositoryUsedStorageAndTreeBytesAreDistinctMeasures: true,
    },
    sourceFiles,
    sourceRoot: digest("outsider/libero-plus-initial-source-root/v1", sourceFiles),
  };
}

export async function acquirePinnedLiberoInitialSource(sourceDirectory,
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
    schema: "outsider/libero-plus-initial-source-checkpoint/v1",
    target: path.resolve(sourceDirectory), revision: LIBERO_INITIAL_REVISION,
  });
  const before = await captureApi("before", work, fetchImpl);
  const objects = (await mapConcurrent(before.tree.files, FETCH_CONCURRENCY,
    (entry) => fetchObject(entry, work, fetchImpl)))
    .sort((left, right) => left.path.localeCompare(right.path));
  const after = await captureApi("after", work, fetchImpl);
  if (!same(before.repository, after.repository)
    || before.tree.treeHash !== after.tree.treeHash) fail("SOURCE_CHANGED_DURING_ACQUISITION");
  const checkpointDirectory = safeJoin(work, "object-checkpoints");
  if (existsSync(checkpointDirectory)) {
    // Markers are resumable transport state, not source evidence.
    rmSync(checkpointDirectory, { recursive: true, force: true });
  }
  rmSync(safeJoin(work, "source-checkpoint.json"), { force: true });
  const sourceFiles = scanFiles(work, new Set(["acquisition-manifest.json"]));
  const body = sourceManifestBody(before, after, objects, sourceFiles);
  const manifest = { ...body,
    manifestHash: digest("outsider/libero-plus-initial-source-manifest/v1", body) };
  writeCanonical(safeJoin(work, "acquisition-manifest.json"), manifest);
  enforcePrivateTree(work);
  renameSync(work, sourceDirectory);
  chmodSync(sourceDirectory, 0o700);
  const checked = verifyLiberoInitialSourceDirectory(sourceDirectory);
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

export function verifyLiberoInitialSourceDirectory(sourceDirectory) {
  try {
    const root = lstatSync(sourceDirectory);
    if (root.isSymbolicLink() || !root.isDirectory() || (root.mode & 0o777) !== 0o700) {
      fail("SOURCE_DIRECTORY_MODE_INVALID");
    }
    const manifest = jsonValue(readFileSync(readSource(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== LIBERO_INITIAL_SOURCE_SCHEMA
      || manifest.frozenAt !== LIBERO_INITIAL_FROZEN_AT
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_SHAPE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/libero-plus-initial-source-manifest/v1",
      body)) fail("MANIFEST_HASH_INVALID");
    const actual = scanFiles(sourceDirectory, new Set(["acquisition-manifest.json"]));
    if (!same(actual, manifest.sourceFiles)
      || manifest.sourceRoot
        !== digest("outsider/libero-plus-initial-source-root/v1", actual)) {
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
    if (!Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 39) {
      fail("OBJECT_CLOSURE_INVALID");
    }
    const entries = new Map(beforeTree.files.map((entry) => [entry.path, entry]));
    for (const record of manifest.remoteObjects) {
      const entry = entries.get(record.path);
      if (!entry || record.bytes !== entry.sizeBytes || validateObject(entry,
        readSource(sourceDirectory, `objects/${record.path}`)) !== record.sha256) {
        fail("OBJECT_INVALID", record.path);
      }
    }
    if (!Array.isArray(manifest.terminalDispositions)
      || manifest.terminalDispositions.length !== 39
      || manifest.terminalDispositions.some((row) =>
        row.disposition !== "ACQUIRED_AND_REPLAYED")) fail("DISPOSITION_INVALID");
    if (manifest.closure?.completeFixedRepository !== true
      || manifest.closure?.selectedFiles !== 39
      || manifest.closure?.selectedBytes !== 113_741_083
      || manifest.closure?.videoFiles !== 32
      || manifest.closure?.globallyExhaustiveAtFixedRevision !== true) {
      fail("CLOSURE_INVALID");
    }
    return { ok: true, manifest,
      before: { repository: beforeRepo, tree: beforeTree },
      after: { repository: afterRepo, tree: afterTree },
      verificationLevel: "PINNED_COMPLETE_39_FILE_LIBERO_PLUS_REPOSITORY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYTHON_LIBERO_INITIAL_REPLAY = String.raw`
import ast
import collections
import hashlib
import json
import math
import os
import re
import struct
import sys

root = os.path.realpath(sys.argv[1])
objects = os.path.join(root, "objects")

def die(code, detail=""):
    raise SystemExit("LIBERO_INITIAL_REPLAY_" + code + (":" + detail if detail else ""))

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
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False,
                      allow_nan=False).encode("utf-8")

def logical_hash(value):
    return "sha256:" + hashlib.sha256(canonical_bytes(value)).hexdigest()

def set_hash(domain, values):
    payload = domain.encode("utf-8") + b"\0" + canonical_bytes(sorted(values))
    return "sha256:" + hashlib.sha256(payload).hexdigest()

def balanced_dict(text):
    start = text.find("{")
    if start < 0:
        die("BALANCED_START")
    depth = 0
    quote = None
    escaped = False
    for index in range(start, len(text)):
        char = text[index]
        if quote is not None:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char in ["'", '"']:
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[start:index + 1]
    die("BALANCED_END")

log_relative = "logs/robot_initial_queue.log"
log_file = obj(log_relative)
log_text = read_text(log_relative)
running = None
run_literals = []
run_line_numbers = []
expected_config_tokens = ["low_l1_l3_metrics", "low_l1_l3_failed_rerun",
  "high_l4_l5_part_01", "high_l4_l5_part_02", "high_l4_l5_part_03",
  "high_l4_l5_part_04"]
for line_number, line in enumerate(log_text.splitlines(), 1):
    match = re.search(r"\] Running (configs/\S+\.json)", line)
    if match:
        running = match.group(1)
    marker = "Local Eval Info "
    if marker in line:
        if running is None:
            die("RUN_CONFIG_MISSING")
        try:
            value = ast.literal_eval(balanced_dict(line.split(marker, 1)[1]))
        except Exception as error:
            die("RUN_LITERAL", str(error))
        run_literals.append((running, value))
        run_line_numbers.append(line_number)
if len(run_literals) != 6:
    die("RUN_COUNT", str(len(run_literals)))
if any(token not in run_literals[index][0]
       for index, token in enumerate(expected_config_tokens)):
    die("RUN_ORDER")

run_labels = ["LOW_INITIAL", "LOW_SELECTED_RERUN", "HIGH_PART_01",
              "HIGH_PART_02", "HIGH_PART_03", "HIGH_PART_04"]
runs = []
run_cells = []
expected_run_counts = [(241, 1205, 1017, 188), (93, 465, 308, 157),
                       (50, 250, 165, 85), (50, 250, 147, 103),
                       (50, 250, 94, 156), (2, 10, 7, 3)]
for run_index, ((config, value), label) in enumerate(zip(run_literals, run_labels)):
    if not isinstance(value, dict) or set(value) != {"per_task", "overall"} \
       or not isinstance(value["per_task"], list):
        die("RUN_SHAPE", label)
    task_ids = []
    cells = []
    video_entries = 0
    for task in value["per_task"]:
        if not isinstance(task, dict) or set(task) != {"task_group", "task_id", "metrics"} \
           or task["task_group"] != "libero_10" or not isinstance(task["task_id"], int):
            die("TASK_SHAPE", label)
        metrics = task["metrics"]
        if not isinstance(metrics, dict) or set(metrics) != {
                "sum_rewards", "max_rewards", "successes", "video_paths"}:
            die("METRICS_SHAPE", label)
        successes = metrics["successes"]
        sums = metrics["sum_rewards"]
        maximums = metrics["max_rewards"]
        videos = metrics["video_paths"]
        if len(successes) != 5 or len(sums) != 5 or len(maximums) != 5 \
           or len(videos) not in [0, 5] or any(type(item) is not bool for item in successes):
            die("METRICS_LENGTH", label)
        if any(not isinstance(item, (int, float)) or not math.isfinite(float(item))
               for item in sums + maximums):
            die("REWARD_NONFINITE", label)
        if any(float(sums[index]) != float(maximums[index])
               or successes[index] != (float(maximums[index]) > 0.0)
               for index in range(5)):
            die("REWARD_SUCCESS_CROSSWALK", label)
        if any(not isinstance(item, str) for item in videos):
            die("VIDEO_PATH_TYPE", label)
        video_entries += len(videos)
        task_ids.append(task["task_id"])
        for episode in range(5):
            cells.append((task["task_id"], episode, 1000 + episode,
                          bool(successes[episode]), float(sums[episode]),
                          float(maximums[episode])))
    if len(task_ids) != len(set(task_ids)):
        die("TASK_DUPLICATE", label)
    tasks_expected, episodes_expected, success_expected, failure_expected = \
        expected_run_counts[run_index]
    successes_count = sum(cell[3] for cell in cells)
    if len(task_ids) != tasks_expected or len(cells) != episodes_expected \
       or successes_count != success_expected \
       or len(cells) - successes_count != failure_expected:
        die("RUN_PROFILE", label)
    if (run_index == 0 and video_entries != 0) \
       or (run_index > 0 and video_entries != len(cells)):
        die("RUN_VIDEO_PATH_PROFILE", label)
    run_cells.append(cells)
    runs.append({"label": label, "tasks": len(task_ids), "episodes": len(cells),
      "successes": successes_count, "failures": len(cells) - successes_count,
      "videoPathEntries": video_entries,
      "taskSetHash": set_hash("outsider/libero-run-task-set/v1", task_ids),
      "evalInfoLogicalHash": logical_hash(value)})

initial_by_task = {}
for task_id, episode, seed, success, sum_reward, max_reward in run_cells[0]:
    initial_by_task.setdefault(task_id, {})[episode] = success
rerun_by_task = {}
for task_id, episode, seed, success, sum_reward, max_reward in run_cells[1]:
    rerun_by_task.setdefault(task_id, {})[episode] = success
initial_failed_tasks = {task_id for task_id, values in initial_by_task.items()
                        if not all(values.values())}
if initial_failed_tasks != set(rerun_by_task) or len(initial_failed_tasks) != 93:
    die("RERUN_SELECTION")
transitions = collections.Counter()
for task_id in sorted(rerun_by_task):
    if set(initial_by_task[task_id]) != set(range(5)) \
       or set(rerun_by_task[task_id]) != set(range(5)):
        die("PAIR_EPISODES")
    for episode in range(5):
        before = "T" if initial_by_task[task_id][episode] else "F"
        after = "T" if rerun_by_task[task_id][episode] else "F"
        transitions[before + after] += 1
if transitions != {"FF": 117, "FT": 71, "TF": 40, "TT": 237}:
    die("TRANSITIONS", repr(transitions))
original_task_sets = [set(cell[0] for cell in run_cells[index])
                      for index in [0, 2, 3, 4, 5]]
original_task_union = set().union(*original_task_sets)
if len(original_task_union) != 393 \
   or sum(len(values) for values in original_task_sets) != 393:
    die("ORIGINAL_TASK_CENSUS")
all_cells = [cell for run in run_cells for cell in run]
if len(all_cells) != 2430 or sum(cell[3] for cell in all_cells) != 1738:
    die("TOTAL_EXECUTIONS")
log_summary = {
  "path": log_relative, "bytes": os.path.getsize(log_file),
  "utf8Lines": len(log_text.splitlines()), "localEvalInfoDocuments": len(runs),
  "localEvalInfoLineNumbers": run_line_numbers, "runs": runs,
  "totalExecutions": 2430, "totalSuccesses": 1738, "totalFailures": 692,
  "originalEvaluationTasks": 393, "originalEvaluationEpisodes": 1965,
  "selectedRerunTasks": 93, "selectedRerunEpisodes": 465,
  "originalTaskSetsDisjoint": True,
  "originalTaskSetHash": set_hash("outsider/libero-original-task-set/v1",
                                  original_task_union),
  "initialFailedTaskSetHash": set_hash("outsider/libero-initial-failed-task-set/v1",
                                       initial_failed_tasks),
  "rerunTaskSetEqualsInitialFailedTaskSet": True,
  "pairedCells": 465, "transitionCounts": dict(sorted(transitions.items())),
  "absolutePathOccurrences": len(re.findall(r"/home/[A-Za-z0-9_./+\-]+", log_text)),
  "rawPathsProjected": False, "rawLogProjected": False,
  "publisherCommandsExecuted": 0, "publisherPythonExecuted": 0,
}

eval_manifest = read_json("metadata/eval_manifest.json")
if set(eval_manifest) != {"category", "configs", "episode_length", "episodes_per_task",
                         "policy", "seed", "strategy", "suite"} \
   or eval_manifest["category"] != "Robot Initial States" \
   or eval_manifest["suite"] != "libero_10" \
   or eval_manifest["episodes_per_task"] != 5 or eval_manifest["seed"] != 1000 \
   or eval_manifest["episode_length"] != 520 \
   or len(eval_manifest["configs"]) != 5:
    die("EVAL_MANIFEST")
manifest_task_sets = []
manifest_counts = []
for config in eval_manifest["configs"]:
    if not isinstance(config, dict) or set(config) != {
            "name", "config", "render", "task_count", "task_ids"} \
       or config["task_count"] != len(config["task_ids"]) \
       or len(config["task_ids"]) != len(set(config["task_ids"])):
        die("EVAL_CONFIG")
    manifest_task_sets.append(set(config["task_ids"]))
    manifest_counts.append(config["task_count"])
if manifest_counts != [241, 50, 50, 50, 2] \
   or any(manifest_task_sets[index] != original_task_sets[index] for index in range(5)):
    die("EVAL_CONFIG_CROSSWALK")

rerun_manifest = read_json(
    "metadata/robot_initial_low_l1_l3_failed_rerun_manifest.json")
if set(rerun_manifest) != {"failed_task_count", "failed_task_ids", "source_eval_info"} \
   or rerun_manifest["failed_task_count"] != 93 \
   or set(rerun_manifest["failed_task_ids"]) != initial_failed_tasks:
    die("RERUN_MANIFEST")

grid = read_json("metadata/robot_initial_full_failure_grids.json")
grid_keys = {"eval_infos", "failure_video_count", "failure_videos", "grid_size",
             "grid_videos", "missing_video_count", "missing_video_failures", "summary"}
if set(grid) != grid_keys or grid["failure_video_count"] != 504 \
   or len(grid["failure_videos"]) != 504 or grid["missing_video_count"] != 71 \
   or len(grid["missing_video_failures"]) != 71 or grid["grid_size"] != 16 \
   or len(grid["grid_videos"]) != 32 or len(grid["eval_infos"]) != 6:
    die("GRID_PROFILE")
if grid["summary"] != {"episodes": 2430, "successes": 1738, "failures": 692,
                        "success_rate": 1738 / 2430, "task_count": 393}:
    die("GRID_SUMMARY")
video_records = grid["failure_videos"]
missing_records = grid["missing_video_failures"]
if any(record.get("success") is not False or not isinstance(record.get("video_path"), str)
       or record.get("seed") != 1000 + record.get("episode", -1000)
       for record in video_records):
    die("GRID_VIDEO_RECORD")
if any(record.get("success") is not False or record.get("video_path") is not None
       or record.get("seed") != 1000 + record.get("episode", -1000)
       for record in missing_records):
    die("GRID_MISSING_RECORD")

rerun_failure_cells = {(cell[0], cell[1]) for cell in run_cells[1] if not cell[3]}
high_failure_cells = {(cell[0], cell[1]) for index in [2, 3, 4, 5]
                      for cell in run_cells[index] if not cell[3]}
expected_video_cells = rerun_failure_cells | high_failure_cells
expected_missing_cells = {(task_id, episode) for task_id in rerun_by_task
                          for episode in range(5)
                          if not initial_by_task[task_id][episode]
                          and rerun_by_task[task_id][episode]}
observed_video_cells = {(record["task_id"], record["episode"])
                        for record in video_records}
observed_missing_cells = {(record["task_id"], record["episode"])
                          for record in missing_records}
if len(rerun_failure_cells) != 157 or len(high_failure_cells) != 347 \
   or observed_video_cells != expected_video_cells \
   or observed_missing_cells != expected_missing_cells:
    die("GRID_CELL_CROSSWALK")
failure_indices = {record["failure_index"] for record in video_records}
missing_indices = {record["failure_index"] for record in missing_records}
if failure_indices & missing_indices or failure_indices | missing_indices != set(range(1, 576)):
    die("FAILURE_INDEX_CENSUS")

legend_text = read_text("metadata/robot_initial_full_failure_grids.md")
legend_failure = set()
legend_missing = set()
section = None
for line in legend_text.splitlines():
    if line == "## Failure Video Legend":
        section = "failure"
    elif line == "## Missing Video Failures":
        section = "missing"
    elif line.startswith("| "):
        parts = [part.strip() for part in line.strip().strip("|").split("|")]
        if section == "failure" and len(parts) == 9 and parts[0].isdigit():
            legend_failure.add((int(parts[0]), int(parts[2]), int(parts[3]), int(parts[4])))
        elif section == "missing" and len(parts) == 6 and parts[0].isdigit():
            legend_missing.add((int(parts[0]), int(parts[1]), int(parts[2])))
expected_legend_failure = {(record["failure_index"], record["task_id"],
                            record["episode"], record["seed"])
                           for record in video_records}
expected_legend_missing = {(record["task_id"], record["episode"], record["seed"])
                           for record in missing_records}
if legend_failure != expected_legend_failure or legend_missing != expected_legend_missing:
    die("LEGEND_CROSSWALK")

readme = read_text("README.md")
readme_claims = {
  "mitYamlClaim": bool(re.search(r"^license:\s*mit\s*$", readme, re.MULTILINE)),
  "simulationBenchmarkClaim": "Benchmark: LIBERO-plus" in readme,
  "tasks393Claim": "Tasks: 393" in readme,
  "episodes2430Claim": "Total evaluated episodes: 2430" in readme,
  "success1738Claim": "Successes: 1738 / 2430" in readme,
  "failures692Claim": "Failures: 692" in readme,
  "failureVideos504Claim": "Failure videos rendered into grids: 504" in readme,
  "missingVideos71Claim": "Failures missing videos: 71" in readme,
  "seedScheduleClaim": "Seed schedule: episode seeds" in readme
                       and "1000" in readme and "1004" in readme,
  "episodeLength520Claim": "Episode length: 520 steps" in readme,
}
if not all(readme_claims.values()):
    die("README_CLAIMS")
attributes = read_text(".gitattributes")

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
    return [item for item in boxes(data, container[1], container[2]) if item[0] == wanted]

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
        data = handle.read()
    top = boxes(data, 0, len(data))
    ftyp = [box for box in top if box[0] == "ftyp"]
    moov = [box for box in top if box[0] == "moov"]
    mdat = [box for box in top if box[0] == "mdat"]
    if len(ftyp) != 1 or len(moov) != 1 or len(mdat) < 1:
        die("MP4_TOP", relative)
    ftyp_payload = data[ftyp[0][1]:ftyp[0][2]]
    if len(ftyp_payload) < 8 or (len(ftyp_payload) - 8) % 4 != 0:
        die("MP4_FTYP", relative)
    mvhd = child(data, moov[0], "mvhd")
    movie_scale, movie_duration = fullbox_time(data, mvhd)
    tracks = []
    for trak in children(data, moov[0], "trak"):
        tkhd = child(data, trak, "tkhd")
        track_width = struct.unpack_from(">I", data, tkhd[2] - 8)[0] / 65536.0
        track_height = struct.unpack_from(">I", data, tkhd[2] - 4)[0] / 65536.0
        mdia = child(data, trak, "mdia")
        scale, duration = fullbox_time(data, child(data, mdia, "mdhd"))
        hdlr = child(data, mdia, "hdlr")
        handler = data[hdlr[1] + 8:hdlr[1] + 12].decode("latin1")
        minf = child(data, mdia, "minf")
        stbl = child(data, minf, "stbl")
        stsd = child(data, stbl, "stsd")
        entry_count = struct.unpack_from(">I", data, stsd[1] + 4)[0]
        if entry_count < 1:
            die("MP4_STSD", relative)
        sample_start = stsd[1] + 8
        codec = data[sample_start + 4:sample_start + 8].decode("latin1")
        sample_width = struct.unpack_from(">H", data, sample_start + 32)[0] \
            if handler == "vide" else None
        sample_height = struct.unpack_from(">H", data, sample_start + 34)[0] \
            if handler == "vide" else None
        stsz = child(data, stbl, "stsz")
        default_sample_size = struct.unpack_from(">I", data, stsz[1] + 4)[0]
        sample_count = struct.unpack_from(">I", data, stsz[1] + 8)[0]
        if default_sample_size == 0:
            if stsz[1] + 12 + sample_count * 4 > stsz[2]:
                die("MP4_STSZ", relative)
            sample_bytes = sum(struct.unpack_from(">I", data, stsz[1] + 12 + i * 4)[0]
                               for i in range(sample_count))
        else:
            sample_bytes = default_sample_size * sample_count
        stts = child(data, stbl, "stts")
        timing_entries = count_table(data, stts, 4, 8)
        timing_samples = sum(struct.unpack_from(">I", data, stts[1] + 8 + i * 8)[0]
                             for i in range(timing_entries))
        if timing_samples != sample_count:
            die("MP4_TIMING_SAMPLES", relative)
        stsc = child(data, stbl, "stsc")
        sample_to_chunk_entries = count_table(data, stsc, 4, 12)
        stco = child(data, stbl, "stco", required=False)
        co64 = child(data, stbl, "co64", required=False)
        if (stco is None) == (co64 is None):
            die("MP4_CHUNK_OFFSET_TABLE", relative)
        offsets_box = stco if stco is not None else co64
        offset_width = 4 if stco is not None else 8
        chunk_count = count_table(data, offsets_box, 4, offset_width)
        chunk_offsets = [struct.unpack_from(">I" if offset_width == 4 else ">Q", data,
                         offsets_box[1] + 8 + i * offset_width)[0]
                         for i in range(chunk_count)]
        if any(offset >= len(data) for offset in chunk_offsets):
            die("MP4_CHUNK_OFFSET_RANGE", relative)
        stss = child(data, stbl, "stss", required=False)
        sync_samples = count_table(data, stss, 4, 4) if stss is not None else sample_count
        tracks.append({"handler": handler, "codec": codec,
          "sampleDescriptionEntries": entry_count, "sampleCount": sample_count,
          "sampleDataBytes": sample_bytes, "timingEntries": timing_entries,
          "timingSampleCount": timing_samples, "sampleToChunkEntries": sample_to_chunk_entries,
          "chunkOffsetTable": "stco" if stco is not None else "co64",
          "chunkCount": chunk_count, "syncSampleCount": sync_samples,
          "timescale": scale, "durationTicks": duration,
          "durationSeconds": duration / scale, "trackWidth": track_width,
          "trackHeight": track_height, "sampleWidth": sample_width,
          "sampleHeight": sample_height})
    if not tracks or not any(track["handler"] == "vide" for track in tracks):
        die("MP4_VIDEO_TRACK", relative)
    return {"path": relative, "bytes": len(data),
      "topLevelBoxes": [box[0] for box in top],
      "topLevelBoxBytes": sum(box[3] for box in top),
      "majorBrand": ftyp_payload[:4].decode("latin1"),
      "minorVersion": struct.unpack_from(">I", ftyp_payload, 4)[0],
      "compatibleBrands": [ftyp_payload[index:index+4].decode("latin1")
                           for index in range(8, len(ftyp_payload), 4)],
      "movieTimescale": movie_scale, "movieDurationTicks": movie_duration,
      "movieDurationSeconds": movie_duration / movie_scale,
      "mdatBoxes": len(mdat), "mdatBytes": sum(box[3] for box in mdat),
      "tracks": tracks}

video_relatives = ["videos/robot_initial_full_failure_grid_%03d.mp4" % index
                   for index in range(1, 33)]
if grid["grid_videos"] != [os.path.basename(relative) for relative in video_relatives]:
    die("GRID_VIDEO_FILENAMES")
videos = [parse_mp4(relative) for relative in video_relatives]
if sum(item["bytes"] for item in videos) != 104274343 \
   or any(item["topLevelBoxBytes"] != item["bytes"] for item in videos):
    die("VIDEO_CLOSURE")
video_tracks = [track for item in videos for track in item["tracks"]]
video_summary = {"files": len(videos), "bytes": sum(item["bytes"] for item in videos),
  "tracks": len(video_tracks),
  "videoTracks": sum(track["handler"] == "vide" for track in video_tracks),
  "totalSamples": sum(track["sampleCount"] for track in video_tracks),
  "totalSampleDataBytes": sum(track["sampleDataBytes"] for track in video_tracks),
  "codecs": sorted(set(track["codec"] for track in video_tracks)),
  "dimensions": sorted(set(str(track["sampleWidth"]) + "x" + str(track["sampleHeight"])
                           for track in video_tracks if track["handler"] == "vide")),
  "containerReplay": videos, "pixelsDecoded": False,
  "visualInspectionPerformed": False, "pixelsProjected": False}

metadata_summary = {
  "evalManifest": {"logicalHash": logical_hash(eval_manifest),
      "configs": len(eval_manifest["configs"]), "configTaskCounts": manifest_counts,
      "tasks": len(original_task_union), "episodesPerTask": 5, "seedBase": 1000,
      "episodeLengthSteps": 520, "configTaskSetsMatchLog": True,
      "policyNameProjected": False, "configPathsProjected": False},
  "rerunManifest": {"logicalHash": logical_hash(rerun_manifest),
      "failedTaskCount": 93, "taskSetMatchesInitialFailures": True,
      "sourcePathProjected": False},
  "failureGridJson": {"logicalHash": logical_hash(grid),
      "summary": grid["summary"], "evalInfoPaths": len(grid["eval_infos"]),
      "failureVideoRecords": 504, "missingVideoFailureRecords": 71,
      "failureIndexCensus": 575, "failureIndicesContiguousOneThrough575": True,
      "rerunFailureRecords": len(rerun_failure_cells),
      "highFailureRecords": len(high_failure_cells),
      "missingRecordsEqualInitialFailureToRerunSuccess": True,
      "videoRecordsEqualRerunPlusHighFailures": True,
      "gridClips": 32, "panelsPerGrid": 16, "panelCapacity": 512,
      "occupiedPanels": 504, "blankPanels": 8,
      "taskNamesProjected": False, "sourceVideoPathsProjected": False},
  "failureGridMarkdown": {"bytes": len(legend_text.encode("utf-8")),
      "utf8Lines": len(legend_text.splitlines()), "failureLegendRows": len(legend_failure),
      "missingLegendRows": len(legend_missing), "jsonCrosswalkComplete": True,
      "rawLegendProjected": False},
  "readme": {"bytes": len(readme.encode("utf-8")), "claims": readme_claims,
      "rawTextProjected": False},
  "gitAttributes": {"bytes": len(attributes.encode("utf-8")),
      "lfsPatternLines": sum("filter=lfs" in line for line in attributes.splitlines())},
}

print(json.dumps({"log": log_summary, "metadata": metadata_summary,
 "video": video_summary,
 "pairing": {"selectedTasks": 93, "pairedCells": 465,
             "transitionCounts": dict(sorted(transitions.items())),
             "failureToRerunSuccess": transitions["FT"],
             "samePolicyRepeatSuccessMorphology": 71,
             "withinEpisodeCorrection": 0, "causalRecovery": 0,
             "independentOutcome": 0},
 "safety": {"publisherCommandsExecuted": 0, "publisherPythonExecuted": 0,
            "videoPixelsDecoded": False, "rawLogProjected": False,
            "absolutePathsProjected": False, "taskNamesProjected": False}},
 sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False))
`;

export function runLiberoInitialReplay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const executed = spawnSync(python, ["-c", PYTHON_LIBERO_INITIAL_REPLAY,
    path.resolve(sourceDirectory)], { encoding: "utf8", maxBuffer: 128 * 1024 * 1024 });
  if (executed.error) fail("REPLAY_PYTHON_FAILED", executed.error.message);
  if (executed.status !== 0) fail("REPLAY_FAILED",
    String(executed.stderr || executed.stdout).trim());
  let replay;
  try { replay = JSON.parse(executed.stdout); }
  catch (error) { fail("REPLAY_JSON_INVALID", error.message); }
  if (replay.log?.localEvalInfoDocuments !== 6
    || replay.log?.totalExecutions !== 2_430
    || replay.log?.totalSuccesses !== 1_738
    || replay.log?.totalFailures !== 692
    || replay.pairing?.pairedCells !== 465
    || !same(replay.pairing?.transitionCounts,
      { FF: 117, FT: 71, TF: 40, TT: 237 })
    || replay.metadata?.failureGridJson?.failureVideoRecords !== 504
    || replay.metadata?.failureGridJson?.missingVideoFailureRecords !== 71
    || replay.video?.files !== 32 || replay.video?.bytes !== 104_274_343
    || replay.safety?.publisherCommandsExecuted !== 0) fail("REPLAY_RESULT_INVALID");
  return replay;
}

function artifactBody(verified, replay) {
  return {
    schema: LIBERO_INITIAL_ARTIFACT_SCHEMA,
    frozenAt: LIBERO_INITIAL_FROZEN_AT,
    status: "PINNED_COMPLETE_LIBERO_PLUS_INITIAL_FAILURE_REPOSITORY_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: { id: LIBERO_INITIAL_ID, revision: LIBERO_INITIAL_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure },
    replay,
    typedDenominators: {
      ORIGINAL_EVALUATION_EPISODE: 1_965,
      SELECTED_RERUN_EPISODE: 465,
      PAIRED_INITIAL_TO_RERUN_CELL: 465,
      FAILURE_GRID_CLIP: 32,
      crossTotal: null,
    },
    releasedExecutionCensus: {
      totalExecutionsIncludingSelectedRerun: 2_430,
      successes: 1_738, failures: 692,
      originalTasks: 393, selectedRerunTasks: 93,
      originalEpisodes: 1_965, selectedRerunEpisodes: 465,
      originalConfiguredCensusComplete: true,
      selectedRerunConfiguredCensusComplete: true,
      globalPolicyAttemptCensusEstablished: false,
    },
    repeatMorphology: {
      selectionRule: "RERUN_ALL_93_LOW_DIFFICULTY_TASKS_WITH_AT_LEAST_ONE_INITIAL_FAILURE",
      selectionBiasPresent: true,
      sameTaskEpisodeSeedPairs: 465,
      transitions: { FF: 117, FT: 71, TF: 40, TT: 237 },
      failureThenRepeatSuccessCells: 71,
      publisherEvaluatorSamePolicyRepeatSuccessMorphology: true,
      withinEpisodeCorrection: false,
      causalRecoveryEstablished: false,
      independentOutcomeEstablished: false,
    },
    gridSemantics: {
      failureGridVideos: 32, panelsPerGrid: 16, panelCapacity: 512,
      failurePanels: 504, blankPanels: 8,
      publisherDeduplicatedFailureIndices: 575,
      persistentInitialAndRerunFailurePairsCollapsed: 117,
      renderedRecordsEqualRerunFailuresPlusHighFailures: true,
      missingRecordsEqualInitialFailureThenRerunSuccess: true,
      gridPanelsAreNotActionStateTrajectories: true,
      videoPixelsDecoded: false,
    },
    semantics: {
      liberoSimulationEstablished: true,
      realRobotEstablished: false,
      physicalWorldActionEstablished: false,
      actionStateTrajectoryPresent: false,
      sourceNativePublisherEvaluatorSuccessBooleansPresent: true,
      publisherEvaluatorOutcomePresent: true,
      independentThirdPartyOutcomePresent: false,
      terminalOutcomeReliabilityIndependentlyEstablished: false,
      recoveryEstablished: false,
      withinEpisodeCorrectionEstablished: false,
      directCausalEffectEstablished: false,
      delegationEstablished: false,
      longitudinalIdentityEstablished: false,
    },
    rights: {
      datasetCardLicenseClaim: "MIT",
      readmeLicenseClaim: "MIT",
      rootLicenseFilePresent: false,
      upstreamLiberoRightsIndependentlyAdjudicated: false,
      modelPolicyRightsIndependentlyAdjudicated: false,
      legalConclusionEstablished: false,
      productionTrainingAuthorized: false,
      evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    },
    privacy: {
      rawArtifactPrivate: true, directoryMode: "0700", fileMode: "0600",
      rawLogContainsAbsolutePaths: replay.log.absolutePathOccurrences > 0,
      noPiiGuaranteed: false, privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false,
      rawPathsProjected: false, rawTaskNamesProjected: false,
      videoPixelsProjected: false, videoPixelsInspectedForPeopleOrPii: false,
    },
    boundary: { privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
      action: 0, simulation: 1, physicalObservation: 0,
      publisherEvaluatorOutcome: 1, reliableOutcome: 0,
      independentOutcome: 0, directCausalEffect: 0, recovery: 0,
      delegation: 0, externalEffect: 0 },
  };
}

export function liberoInitialArtifactHash(body) {
  return digest("outsider/libero-plus-initial-failures/v1", body);
}

export function buildLiberoInitialArtifactFromSource(sourceDirectory,
  options = {}) {
  const verified = verifyLiberoInitialSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runLiberoInitialReplay(sourceDirectory, options);
  const body = artifactBody(verified, replay);
  const artifact = { ...body, artifactHash: liberoInitialArtifactHash(body) };
  const checked = verifyLiberoInitialArtifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifyLiberoInitialArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== LIBERO_INITIAL_ARTIFACT_SCHEMA
      || artifact.frozenAt !== LIBERO_INITIAL_FROZEN_AT
      || artifact.status
        !== "PINNED_COMPLETE_LIBERO_PLUS_INITIAL_FAILURE_REPOSITORY_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== liberoInitialArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.closure?.completeFixedRepository !== true
      || artifact.source?.closure?.selectedFiles !== 39
      || artifact.source?.closure?.selectedBytes !== 113_741_083
      || artifact.replay?.log?.totalExecutions !== 2_430
      || artifact.replay?.log?.originalEvaluationEpisodes !== 1_965
      || artifact.replay?.log?.selectedRerunEpisodes !== 465
      || artifact.replay?.metadata?.failureGridJson?.failureVideoRecords !== 504
      || artifact.replay?.metadata?.failureGridJson?.blankPanels !== 8
      || artifact.replay?.video?.files !== 32
      || artifact.replay?.video?.pixelsDecoded !== false) fail("ARTIFACT_REPLAY_INVALID");
    if (!same(artifact.typedDenominators, {
      ORIGINAL_EVALUATION_EPISODE: 1_965,
      SELECTED_RERUN_EPISODE: 465,
      PAIRED_INITIAL_TO_RERUN_CELL: 465,
      FAILURE_GRID_CLIP: 32, crossTotal: null })) fail("DENOMINATOR_INVALID");
    if (!same(artifact.repeatMorphology?.transitions,
      { FF: 117, FT: 71, TF: 40, TT: 237 })
      || artifact.repeatMorphology?.failureThenRepeatSuccessCells !== 71
      || artifact.repeatMorphology?.withinEpisodeCorrection !== false
      || artifact.repeatMorphology?.causalRecoveryEstablished !== false
      || artifact.repeatMorphology?.independentOutcomeEstablished !== false
      || artifact.releasedExecutionCensus?.globalPolicyAttemptCensusEstablished !== false) {
      fail("RECOVERY_PROMOTION");
    }
    if (artifact.semantics?.liberoSimulationEstablished !== true
      || artifact.semantics?.realRobotEstablished !== false
      || artifact.semantics?.physicalWorldActionEstablished !== false
      || artifact.semantics?.actionStateTrajectoryPresent !== false
      || artifact.semantics?.independentThirdPartyOutcomePresent !== false
      || artifact.semantics?.directCausalEffectEstablished !== false
      || artifact.semantics?.recoveryEstablished !== false) fail("SEMANTIC_PROMOTION");
    if (artifact.rights?.rootLicenseFilePresent !== false
      || artifact.rights?.legalConclusionEstablished !== false
      || artifact.rights?.productionTrainingAuthorized !== false
      || artifact.privacy?.rawArtifactPrivate !== true
      || artifact.privacy?.rawLogContainsAbsolutePaths !== true
      || artifact.privacy?.noPiiGuaranteed !== false
      || artifact.privacy?.rawPathsProjected !== false
      || artifact.privacy?.videoPixelsProjected !== false) fail("GATE_INVALID");
    if (!same(artifact.boundary, { privacy: 0, training: 0, network: 0,
      authority: 0, CEU: 0, action: 0, simulation: 1,
      physicalObservation: 0, publisherEvaluatorOutcome: 1,
      reliableOutcome: 0, independentOutcome: 0, directCausalEffect: 0,
      recovery: 0, delegation: 0, externalEffect: 0 })) fail("BOUNDARY_INVALID");
    return { ok: true, artifactHash,
      verificationLevel: "STANDALONE_HASH_PAIRED_POPULATION_AND_SIMULATION_BOUNDARY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyLiberoInitialArtifactWithSource(artifact, sourceDirectory,
  options = {}) {
  const standalone = verifyLiberoInitialArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildLiberoInitialArtifactFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel:
        "FULL_LOG_JSON_MARKDOWN_PAIRING_AND_32_MP4_CONTAINER_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
