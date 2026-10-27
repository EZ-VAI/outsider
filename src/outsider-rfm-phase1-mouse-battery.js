/*
 * Pinned, bounded intake of the smallest Phase 1 task's complete published
 * failure and success/HIL no-video subsets.  The full 13-page repository tree
 * is bound before and after acquisition, while 23+ GB of physical storage and
 * every video object remain outside the workspace.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, rmSync, writeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "./canonical-historical-replay.js";

export const RFM_PHASE1_ID =
  "Posttraining-RFM-RSS2026/Challenge-phase1-dataset";
export const RFM_PHASE1_REVISION =
  "71c595336c336b50afb08ebb17c206d8625b5606";
export const RFM_PHASE1_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const RFM_PHASE1_SOURCE_SCHEMA =
  "outsider/rfm-phase1-mouse-battery-source/v1";
export const RFM_PHASE1_AUDIT_SCHEMA =
  "outsider/rfm-phase1-mouse-battery-audit/v1";

export const RFM_PHASE1_PROFILE = Object.freeze({
  usedStorageBytes: 23_878_206_905,
  treeLogicalBytes: 101_586_346_251,
  repositoryFiles: 12_874,
  treeEntries: 12_963,
  treeDirectories: 89,
  treePages: 13,
  repositoryProjectionHash:
    "sha256:8fe91856ddb55b1540661c79e526a8de07fcddae93e610ec153c9e7bbf584475",
  treeProjectionHash:
    "sha256:d5b96506c7298491cf270efe18cf06053fa1f2f9f08a22293a5a723426ff4ffd",
  task: "insert-mouse-battery",
  selectedObjects: 298,
  selectedBytes: 81_902_279,
  selectedParquets: 289,
  selectedMetaObjects: 8,
  failureEpisodes: 125,
  failureFrames: 314_899,
  failureObjects: 129,
  failureBytes: 26_057_872,
  successHilEpisodes: 164,
  successHilFrames: 692_068,
  successHilObjects: 168,
  successHilBytes: 55_836_534,
  stateDimensions: 14,
  actionDimensions: 14,
  fps: 60,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const MODES = Object.freeze([
  Object.freeze({ key: "failure", directory: "failure-data",
    episodes: 125, frames: 314_899, objects: 129, bytes: 26_057_872,
    parquets: 125, videos: 375 }),
  Object.freeze({ key: "successHil", directory: "success-and-hil-data",
    episodes: 164, frames: 692_068, objects: 168, bytes: 55_836_534,
    parquets: 164, videos: 492 }),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `RFM_PHASE1_${code}`
    : `RFM_PHASE1_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function rfmPhase1Sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return rfmPhase1Sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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

function encodedId() {
  return RFM_PHASE1_ID.split("/").map(encodeURIComponent).join("/");
}

function endpoints() {
  return {
    repository: `${HF}/api/datasets/${encodedId()}/revision/${RFM_PHASE1_REVISION}`,
    tree: `${HF}/api/datasets/${encodedId()}/tree/${RFM_PHASE1_REVISION}`
      + "?recursive=true&limit=1000",
    raw: `${HF}/datasets/${encodedId()}/resolve/${RFM_PHASE1_REVISION}`,
  };
}

function repositoryProjection(value) {
  if (!plain(value) || !Array.isArray(value.siblings)) fail("REPOSITORY_INVALID");
  const siblingPaths = value.siblings.map((entry) => entry?.rfilename)
    .sort((left, right) => left.localeCompare(right));
  if (siblingPaths.some((entry) => !safeRemotePath(entry))
    || new Set(siblingPaths).size !== siblingPaths.length) fail("REPOSITORY_PATHS_INVALID");
  return { id: value.id, sha: value.sha, private: value.private, gated: value.gated,
    disabled: value.disabled, usedStorage: value.usedStorage,
    cardLicense: value.cardData?.license ?? null, siblingPaths };
}

function validateRepository(value) {
  const projection = repositoryProjection(value);
  if (projection.id !== RFM_PHASE1_ID || projection.sha !== RFM_PHASE1_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false
    || projection.usedStorage !== RFM_PHASE1_PROFILE.usedStorageBytes
    || projection.cardLicense !== "cc-by-nc-4.0"
    || projection.siblingPaths.length !== RFM_PHASE1_PROFILE.repositoryFiles
    || digest("outsider/phase1-repository-projection/v1", projection)
      !== RFM_PHASE1_PROFILE.repositoryProjectionHash) fail("REPOSITORY_PROFILE_INVALID");
  return projection;
}

function treeEntry(entry) {
  if (!plain(entry) || !safeRemotePath(entry.path)
    || !["file", "directory"].includes(entry.type)
    || !SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size)
    || entry.size < 0) fail("TREE_ENTRY_INVALID");
  if (entry.type === "directory") {
    if (entry.size !== 0 || entry.lfs != null) fail("TREE_DIRECTORY_INVALID");
    return { path: entry.path, type: "directory", oid: entry.oid,
      sizeBytes: 0, lfsSha256: null, lfsBytes: null };
  }
  if (entry.lfs == null) return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: null, lfsBytes: null };
  if (!plain(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
    || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
  return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: `sha256:${entry.lfs.oid}`,
    lfsBytes: entry.lfs.size };
}

function selectedPath(remotePath) {
  if (remotePath === "README.md") return true;
  const inMode = MODES.some((mode) => remotePath.startsWith(
    `${RFM_PHASE1_PROFILE.task}/${mode.directory}/`));
  return inMode && !remotePath.includes("/videos/") && !remotePath.endsWith(".mp4");
}

function validateTree(rawEntries) {
  if (!Array.isArray(rawEntries)) fail("TREE_INVALID");
  const projection = rawEntries.map(treeEntry)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (projection.length !== RFM_PHASE1_PROFILE.treeEntries
    || new Set(projection.map((entry) => entry.path)).size !== projection.length) {
    fail("TREE_ENTRY_COUNT_INVALID");
  }
  const files = projection.filter((entry) => entry.type === "file");
  const directories = projection.filter((entry) => entry.type === "directory");
  const selected = files.filter((entry) => selectedPath(entry.path));
  if (files.length !== RFM_PHASE1_PROFILE.repositoryFiles
    || directories.length !== RFM_PHASE1_PROFILE.treeDirectories
    || files.reduce((sum, entry) => sum + entry.sizeBytes, 0)
      !== RFM_PHASE1_PROFILE.treeLogicalBytes
    || digest("outsider/phase1-tree-projection/v1", projection)
      !== RFM_PHASE1_PROFILE.treeProjectionHash
    || selected.length !== RFM_PHASE1_PROFILE.selectedObjects
    || selected.reduce((sum, entry) => sum + entry.sizeBytes, 0)
      !== RFM_PHASE1_PROFILE.selectedBytes
    || selected.filter((entry) => entry.path.endsWith(".parquet")).length !== 289
    || selected.filter((entry) => entry.path.includes("/meta/")).length !== 8
    || selected.some((entry) => entry.path.includes("/videos/")
      || entry.path.endsWith(".mp4"))) fail("TREE_PROFILE_INVALID");
  for (const mode of MODES) {
    const subset = selected.filter((entry) => entry.path.startsWith(
      `${RFM_PHASE1_PROFILE.task}/${mode.directory}/`));
    if (subset.length !== mode.objects
      || subset.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== mode.bytes
      || subset.filter((entry) => entry.path.endsWith(".parquet")).length
        !== mode.parquets) fail("TREE_MODE_PROFILE_INVALID", mode.key);
  }
  return { projection, files, directories, selected };
}

function permittedFinalUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === ""
      && parsed.password === "" && (parsed.hostname === "huggingface.co"
        || parsed.hostname.endsWith(".hf.co")
        || parsed.hostname.endsWith(".xethub.hf.co"));
  } catch { return false; }
}

function pinnedTreeUrl(value) {
  try {
    const parsed = new URL(value);
    const expectedPath = `/api/datasets/${encodedId()}/tree/${RFM_PHASE1_REVISION}`;
    if (parsed.protocol !== "https:" || parsed.hostname !== "huggingface.co"
      || parsed.username !== "" || parsed.password !== ""
      || parsed.pathname !== expectedPath
      || parsed.searchParams.get("recursive") !== "true"
      || parsed.searchParams.get("limit") !== "1000") return false;
    const allowed = new Set(["recursive", "limit", "expand", "cursor"]);
    for (const key of parsed.searchParams.keys()) if (!allowed.has(key)) return false;
    if (parsed.searchParams.has("expand")
      && parsed.searchParams.get("expand") !== "false") return false;
    return true;
  } catch { return false; }
}

function retryable(error) {
  return error?.name === "AbortError" || error?.retryable === true
    || /(?:fetch failed|network|timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN)/iu
      .test(String(error?.message ?? error));
}

async function fetchOnce(url, maximumBytes, fetchImpl, timeoutMs = 60_000) {
  if (!permittedFinalUrl(url)) fail("REQUEST_URL_REFUSED", url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "follow",
      signal: controller.signal });
    if (!response || typeof response.arrayBuffer !== "function") fail("FETCH_INVALID");
    if (!response.ok) {
      const error = new Error(`HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 429
        || response.status >= 500;
      throw error;
    }
    const finalUrl = response.url || url;
    if (!permittedFinalUrl(finalUrl)) fail("FINAL_URL_REFUSED", finalUrl);
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > maximumBytes) fail("CONTENT_LENGTH_EXCEEDED");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) fail("BODY_BYTES_EXCEEDED");
    return { bytes, finalUrl, status: response.status,
      contentType: response.headers?.get?.("content-type") ?? null,
      link: response.headers?.get?.("link") ?? null };
  } finally { clearTimeout(timer); }
}

async function boundedFetch(url, maximumBytes, fetchImpl, timeoutMs = 60_000) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetchOnce(url, maximumBytes, fetchImpl, timeoutMs); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }
  throw last;
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

function nextLink(value) {
  if (value === null || value === "") return null;
  const matches = [...value.matchAll(/<([^>]+)>; rel="next"/gu)];
  if (matches.length !== 1 || !pinnedTreeUrl(matches[0][1])) fail("NEXT_LINK_INVALID");
  return matches[0][1];
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function safeJoin(root, relative) {
  if (!safeRemotePath(relative)) fail("PATH_INVALID", relative);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, ...relative.split("/"));
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) fail("PATH_ESCAPE", relative);
  return resolved;
}

function writePrivateOnce(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  const descriptor = openSync(file, fsConstants.O_WRONLY | fsConstants.O_CREAT
    | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.nlink !== 1) fail("OUTPUT_UNSAFE", file);
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
  } finally { closeSync(descriptor); }
}

function privateTree(root) {
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) privateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

async function fetchJson(url, maximumBytes, fetchImpl) {
  const value = await boundedFetch(url, maximumBytes, fetchImpl);
  return { ...value, parsed: parseJson(value.bytes, url) };
}

async function capturePhase(root, phase, fetchImpl) {
  const repository = await fetchJson(endpoints().repository, 2 * 1024 * 1024, fetchImpl);
  validateRepository(repository.parsed);
  const repositoryFile = `api/${phase}/repository.json`;
  writePrivateOnce(safeJoin(root, repositoryFile), repository.bytes);
  const descriptors = [{ phase, kind: "repository", page: null,
    file: repositoryFile, requestUrl: endpoints().repository,
    finalUrl: repository.finalUrl, nextRequestUrl: null,
    status: repository.status, contentType: repository.contentType,
    bytes: repository.bytes.length, sha256: rfmPhase1Sha256(repository.bytes) }];
  const treeEntries = [];
  let requestUrl = endpoints().tree;
  for (let page = 0; requestUrl !== null; page += 1) {
    if (page >= 20 || !pinnedTreeUrl(requestUrl)) fail("TREE_PAGINATION_INVALID");
    const response = await fetchJson(requestUrl, 8 * 1024 * 1024, fetchImpl);
    if (!Array.isArray(response.parsed)) fail("TREE_PAGE_INVALID");
    const nextRequestUrl = nextLink(response.link);
    const file = `api/${phase}/tree-page-${String(page).padStart(3, "0")}.json`;
    writePrivateOnce(safeJoin(root, file), response.bytes);
    descriptors.push({ phase, kind: "tree", page, file, requestUrl,
      finalUrl: response.finalUrl, nextRequestUrl, status: response.status,
      contentType: response.contentType, bytes: response.bytes.length,
      sha256: rfmPhase1Sha256(response.bytes) });
    treeEntries.push(...response.parsed);
    requestUrl = nextRequestUrl;
  }
  if (descriptors.filter((entry) => entry.kind === "tree").length !== 13) {
    fail("TREE_PAGE_COUNT_INVALID");
  }
  const tree = validateTree(treeEntries);
  return { repository: repository.parsed, tree,
    descriptors: descriptors.sort((left, right) => left.file.localeCompare(right.file)) };
}

async function mapConcurrent(values, concurrency, operation) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await operation(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

async function downloadObject(root, entry, fetchImpl) {
  const url = `${endpoints().raw}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const response = await boundedFetch(url, entry.sizeBytes + 1, fetchImpl, 120_000);
  const sha256 = rfmPhase1Sha256(response.bytes);
  if (response.bytes.length !== entry.sizeBytes
    || (entry.lfsSha256 === null ? gitBlobOid(response.bytes) !== entry.oid
      : sha256 !== entry.lfsSha256)) fail("OBJECT_INVALID", entry.path);
  const file = `objects/${entry.path}`;
  writePrivateOnce(safeJoin(root, file), response.bytes);
  return { datasetId: RFM_PHASE1_ID, revision: RFM_PHASE1_REVISION,
    path: entry.path, file, requestUrl: url, finalUrl: response.finalUrl,
    status: response.status, contentType: response.contentType,
    bytes: response.bytes.length, sha256, gitOid: entry.oid,
    lfsSha256: entry.lfsSha256 };
}

function rootProjection(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots, ...remoteObjects].map((entry) => ({
    file: entry.file, bytes: entry.bytes, sha256: entry.sha256,
  })).sort((left, right) => left.file.localeCompare(right.file));
  return { files, sourceRoot: digest("outsider/rfm-phase1-source-root/v1", files) };
}

export async function acquirePinnedRfmPhase1Source(sourceDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  if (existsSync(sourceDirectory)) fail("SOURCE_EXISTS", sourceDirectory);
  const parent = path.dirname(path.resolve(sourceDirectory));
  ensurePrivateDirectory(parent);
  const temporary = path.join(parent,
    `.${path.basename(sourceDirectory)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const before = await capturePhase(temporary, "before", fetchImpl);
    const remoteObjects = (await mapConcurrent(before.tree.selected, 10,
      (entry) => downloadObject(temporary, entry, fetchImpl)))
      .sort((left, right) => left.file.localeCompare(right.file));
    const after = await capturePhase(temporary, "after", fetchImpl);
    if (!same(validateRepository(before.repository), validateRepository(after.repository))
      || !same(before.tree.projection, after.tree.projection)) fail("SOURCE_DRIFT");
    if (remoteObjects.length !== 298
      || remoteObjects.reduce((sum, entry) => sum + entry.bytes, 0) !== 81_902_279
      || remoteObjects.some((entry) => entry.path.includes("/videos/")
        || entry.path.endsWith(".mp4"))) fail("CLOSURE_INVALID");
    const apiSnapshots = [...before.descriptors, ...after.descriptors]
      .sort((left, right) => left.file.localeCompare(right.file));
    const rooted = rootProjection(apiSnapshots, remoteObjects);
    const body = {
      schema: RFM_PHASE1_SOURCE_SCHEMA, frozenAt: RFM_PHASE1_FROZEN_AT,
      apiSnapshots, remoteObjects, sourceFiles: rooted.files,
      sourceRoot: rooted.sourceRoot,
      fullRepository: { usedStorageBytes: 23_878_206_905,
        treeLogicalBytes: 101_586_346_251, treePages: 13,
        treeEntries: 12_963, repositoryFiles: 12_874 },
      closure: { selectedTask: "insert-mouse-battery",
        selectedModes: ["failure-data", "success-and-hil-data"],
        selectedObjects: 298, selectedBytes: 81_902_279,
        selectedParquets: 289, selectedMetaObjects: 8,
        rootReadmeObjects: 1, videosSelected: 0,
        completeFailureNoVideoSubset: true,
        completeSuccessHilNoVideoSubset: true },
    };
    const manifest = { ...body,
      manifestHash: digest("outsider/rfm-phase1-source-manifest/v1", body) };
    writePrivateOnce(path.join(temporary, "acquisition-manifest.json"),
      canonicalBytes(manifest));
    privateTree(temporary);
    renameSync(temporary, sourceDirectory);
    chmodSync(sourceDirectory, 0o700);
    return { sourceDirectory, manifest };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function readRegular(file, bytesExpected = null) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) fail("FILE_UNSAFE", file);
  const bytes = readFileSync(file);
  if (bytesExpected !== null && bytes.length !== bytesExpected) fail("FILE_SIZE_INVALID");
  return bytes;
}

function walk(root) {
  const files = [];
  const queue = [root];
  while (queue.length) {
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

function snapshotBytes(root, descriptor) {
  const bytes = readRegular(safeJoin(root, descriptor.file), descriptor.bytes);
  if (rfmPhase1Sha256(bytes) !== descriptor.sha256) fail("SNAPSHOT_HASH_INVALID");
  return bytes;
}

function reconstructPhaseTree(root, manifest, phase) {
  const pages = manifest.apiSnapshots.filter((entry) =>
    entry.phase === phase && entry.kind === "tree")
    .sort((left, right) => left.page - right.page);
  if (pages.length !== 13 || pages.some((entry, index) => entry.page !== index)) {
    fail("TREE_PAGE_DESCRIPTORS_INVALID");
  }
  let expectedRequest = endpoints().tree;
  const entries = [];
  for (let index = 0; index < pages.length; index += 1) {
    const descriptor = pages[index];
    if (descriptor.requestUrl !== expectedRequest || !pinnedTreeUrl(descriptor.requestUrl)
      || (descriptor.nextRequestUrl !== null
        && !pinnedTreeUrl(descriptor.nextRequestUrl))) fail("TREE_PAGE_CHAIN_INVALID");
    const values = parseJson(snapshotBytes(root, descriptor), descriptor.file);
    const expectedLength = index === 12 ? 963 : 1000;
    if (!Array.isArray(values) || values.length !== expectedLength) {
      fail("TREE_PAGE_LENGTH_INVALID", descriptor.file);
    }
    entries.push(...values);
    expectedRequest = descriptor.nextRequestUrl;
  }
  if (expectedRequest !== null) fail("TREE_PAGE_TERMINATION_INVALID");
  return validateTree(entries);
}

export function verifyRfmPhase1SourceDirectory(sourceDirectory) {
  try {
    const manifest = parseJson(readRegular(path.join(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== RFM_PHASE1_SOURCE_SCHEMA
      || manifest.frozenAt !== RFM_PHASE1_FROZEN_AT
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 28
      || !Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 298
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")) {
      fail("MANIFEST_INVALID");
    }
    const repositories = {};
    const trees = {};
    for (const phase of ["before", "after"]) {
      const descriptor = manifest.apiSnapshots.find((entry) =>
        entry.phase === phase && entry.kind === "repository");
      if (!descriptor || descriptor.page !== null) fail("REPOSITORY_SNAPSHOT_MISSING");
      repositories[phase] = validateRepository(parseJson(
        snapshotBytes(sourceDirectory, descriptor), descriptor.file));
      trees[phase] = reconstructPhaseTree(sourceDirectory, manifest, phase);
    }
    if (!same(repositories.before, repositories.after)
      || !same(trees.before.projection, trees.after.projection)) fail("SOURCE_DRIFT");
    const expectedPaths = trees.before.selected.map((entry) => entry.path).sort();
    if (!same(expectedPaths, manifest.remoteObjects.map((entry) => entry.path).sort())) {
      fail("REMOTE_SET_INVALID");
    }
    for (const descriptor of manifest.remoteObjects) {
      const entry = trees.before.selected.find((value) => value.path === descriptor.path);
      if (!entry || descriptor.datasetId !== RFM_PHASE1_ID
        || descriptor.revision !== RFM_PHASE1_REVISION
        || descriptor.file !== `objects/${entry.path}` || descriptor.bytes !== entry.sizeBytes
        || descriptor.gitOid !== entry.oid || descriptor.lfsSha256 !== entry.lfsSha256) {
        fail("REMOTE_DESCRIPTOR_INVALID");
      }
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      const sha256 = rfmPhase1Sha256(bytes);
      if (descriptor.sha256 !== sha256
        || (entry.lfsSha256 === null ? gitBlobOid(bytes) !== entry.oid
          : sha256 !== entry.lfsSha256)) fail("REMOTE_HASH_INVALID");
    }
    const rooted = rootProjection(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles) || rooted.sourceRoot !== manifest.sourceRoot) {
      fail("SOURCE_ROOT_INVALID");
    }
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"].sort((left, right) => left.localeCompare(right));
    if (!same(walk(sourceDirectory), expectedFiles)) fail("FILE_CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/rfm-phase1-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    return { ok: true, manifest, tree: trees.before,
      verificationLevel: "PINNED_FULL_13_PAGE_TREE_AND_COMPLETE_MOUSE_BATTERY_NO_VIDEO_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import collections, json, math, os, re, sys
import pyarrow.parquet as pq

root = sys.argv[1]
task = "insert-mouse-battery"
profiles = {
  "failure": {
    "directory": "failure-data", "episodes": 125, "frames": 314899,
    "columns": ["observation.state", "observation.commander_state", "action",
      "mcap_path", "subtask", "timestamp", "frame_index", "episode_index",
      "index", "task_index", "reward"],
  },
  "successHil": {
    "directory": "success-and-hil-data", "episodes": 164, "frames": 692068,
    "columns": ["observation.state", "observation.commander_state", "action",
      "mcap_path", "subtask", "timestamp", "frame_index", "episode_index",
      "index", "task_index"],
  },
}

def die(code):
    raise RuntimeError("RFM_PHASE1_PYARROW_" + code)

def json_lines(file):
    with open(file, "r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]

output = {}
for key, profile in profiles.items():
    base = os.path.join(root, "objects", task, profile["directory"])
    info_file = os.path.join(base, "meta", "info.json")
    with open(info_file, "r", encoding="utf-8") as handle:
        info = json.load(handle)
    if (info.get("codebase_version") != "v2.1" or info.get("robot_type") != "arx"
        or info.get("total_episodes") != profile["episodes"]
        or info.get("total_frames") != profile["frames"] or info.get("total_tasks") != 1
        or info.get("fps") != 60):
        die(key.upper() + "_INFO_INVALID")
    episode_meta = json_lines(os.path.join(base, "meta", "episodes.jsonl"))
    episode_stats = json_lines(os.path.join(base, "meta", "episodes_stats.jsonl"))
    tasks = json_lines(os.path.join(base, "meta", "tasks.jsonl"))
    if (len(episode_meta) != profile["episodes"]
        or len(episode_stats) != profile["episodes"] or len(tasks) != 1):
        die(key.upper() + "_META_COUNTS_INVALID")
    files = sorted(os.path.join(base, "data", "chunk-000", name)
      for name in os.listdir(os.path.join(base, "data", "chunk-000"))
      if name.endswith(".parquet"))
    if len(files) != profile["episodes"]:
        die(key.upper() + "_PARQUET_COUNT_INVALID")

    modes = collections.Counter()
    transition_pairs = collections.Counter()
    rewards = collections.Counter()
    subtask_values = set()
    hil_episodes = 0
    inference_only_episodes = 0
    teleop_only_episodes = 0
    inference_teleop_boundaries = 0
    max_state_jump = 0.0
    max_action_jump = 0.0
    global_index = 0
    mcap_paths_present = 0
    timestamp_monotonic = True
    episode_lengths = []
    for episode, file in enumerate(files):
        match = re.search(r"episode_(\d{6})\.parquet$", file)
        if match is None or int(match.group(1)) != episode:
            die(key.upper() + "_FILE_SEQUENCE_INVALID")
        table = pq.read_table(file)
        if table.column_names != profile["columns"] or table.num_rows <= 0:
            die(key.upper() + "_SCHEMA_INVALID")
        data = table.to_pydict()
        rows = table.num_rows
        episode_lengths.append(rows)
        if (data["episode_index"] != [episode] * rows
            or data["frame_index"] != list(range(rows))
            or data["index"] != list(range(global_index, global_index + rows))
            or data["task_index"] != [0] * rows):
            die(key.upper() + "_CONTINUITY_INVALID")
        if any(not isinstance(value, list) or len(value) != 14
          or any(not math.isfinite(float(item)) for item in value)
          for value in data["observation.state"] + data["action"]):
            die(key.upper() + "_VECTOR_INVALID")
        commander = data["observation.commander_state"]
        unique_modes = set(commander)
        modes.update(commander)
        if "inference" in unique_modes and "teleop" in unique_modes:
            hil_episodes += 1
        elif unique_modes == {"inference"}:
            inference_only_episodes += 1
        elif unique_modes == {"teleop"}:
            teleop_only_episodes += 1
        for index in range(1, rows):
            if commander[index] != commander[index - 1]:
                transition_pairs[(commander[index - 1], commander[index])] += 1
            if commander[index - 1] == "inference" and commander[index] == "teleop":
                inference_teleop_boundaries += 1
                max_state_jump = max(max_state_jump, max(abs(float(left) - float(right))
                  for left, right in zip(data["observation.state"][index - 1],
                    data["observation.state"][index])))
                max_action_jump = max(max_action_jump, max(abs(float(left) - float(right))
                  for left, right in zip(data["action"][index - 1], data["action"][index])))
        if "reward" in data:
            rewards.update(str(float(value)) for value in data["reward"])
        subtask_values.update(str(value) for value in data["subtask"])
        mcap_paths_present += sum(1 for value in data["mcap_path"]
          if isinstance(value, str) and len(value) > 0)
        timestamps = data["timestamp"]
        if (any(not math.isfinite(float(value)) for value in timestamps)
            or any(float(timestamps[index]) < float(timestamps[index - 1])
              for index in range(1, rows))):
            timestamp_monotonic = False
        global_index += rows
    if (global_index != profile["frames"] or mcap_paths_present != profile["frames"]
        or not timestamp_monotonic):
        die(key.upper() + "_TOTAL_INVALID")
    if ([value.get("episode_index") for value in episode_meta]
          != list(range(profile["episodes"]))
        or [value.get("episode_index") for value in episode_stats]
          != list(range(profile["episodes"]))):
        die(key.upper() + "_META_SEQUENCE_INVALID")
    if [value.get("length") for value in episode_meta] != episode_lengths:
        die(key.upper() + "_META_LENGTH_INVALID")
    output[key] = {
      "episodes": profile["episodes"], "frames": profile["frames"],
      "parquetFiles": len(files), "metadataAligned": True,
      "episodeFrameAndGlobalIndexContinuity": True,
      "stateDimensions": 14, "actionDimensions": 14, "fps": 60,
      "infoRobotType": info["robot_type"],
      "commanderStateFrameCounts": dict(sorted(modes.items())),
      "modeTransitionCounts": {left + "->" + right: count
        for (left, right), count in sorted(transition_pairs.items())},
      "hilEpisodes": hil_episodes,
      "inferenceOnlyEpisodes": inference_only_episodes,
      "teleopOnlyEpisodes": teleop_only_episodes,
      "inferenceToTeleopBoundaries": inference_teleop_boundaries,
      "maximumInferenceToTeleopStateJump": max_state_jump,
      "maximumInferenceToTeleopActionJump": max_action_jump,
      "rewardFrameCounts": dict(sorted(rewards.items())),
      "subtaskValues": sorted(subtask_values),
      "mcapPathPresentFrames": mcap_paths_present,
      "mcapPathValuesRepublished": False,
      "timestampMonotonicWithinEpisodes": timestamp_monotonic,
      "minimumEpisodeFrames": min(episode_lengths),
      "maximumEpisodeFrames": max(episode_lengths),
    }

print(json.dumps(output, sort_keys=True, separators=(",", ":")))
`;

export function runRfmPhase1Replay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const verified = verifyRfmPhase1SourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const result = spawnSync(python, ["-c", PYARROW_REPLAY, sourceDirectory], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) fail("PYARROW_REPLAY_FAILED",
    String(result.stderr || result.stdout).trim());
  const replay = parseJson(Buffer.from(result.stdout.trim(), "utf8"), "pyarrow");
  const readme = readRegular(path.join(sourceDirectory, "objects", "README.md"))
    .toString("utf8");
  const claims = ["bimanual YAM", "failure-data", "success-and-hil-data",
    "observation.commander_state", "CC BY-NC 4.0", "robot_type` is `\"yam\"`"];
  if (claims.some((claim) => !readme.includes(claim))) fail("README_CLAIM_MISSING");
  return replay;
}

export function rfmPhase1ArtifactHash(body) {
  return digest("outsider/rfm-phase1-mouse-battery-audit/v1", body);
}

function buildBody(verified, replay) {
  return {
    schema: RFM_PHASE1_AUDIT_SCHEMA,
    frozenAt: RFM_PHASE1_FROZEN_AT,
    status: "PINNED_RFM_PHASE1_MOUSE_BATTERY_FAILURE_AND_SUCCESS_HIL_NO_VIDEO_REPLAY",
    admission: "QUARANTINE_EVAL",
    source: { id: RFM_PHASE1_ID, revision: RFM_PHASE1_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      usedStorageBytes: 23_878_206_905,
      treeLogicalBytes: 101_586_346_251,
      selectedObjects: 298, selectedBytes: 81_902_279,
      selectedTask: "insert-mouse-battery" },
    replay,
    outcome: {
      publisherFailureEpisodes: 125,
      publisherSuccessOrHilEpisodes: 164,
      publisherOutcomeSource: "DATASET_CARD_AND_SUBSET_DIRECTORY",
      sourceNativePerEpisodeSuccessField: false,
      sourceNativePerEpisodeFailureField: false,
      failureRewardFieldPresent: true,
      successHilRewardFieldPresent: false,
      independentOutcome: 0,
      longitudinalOutcome: 0,
    },
    intervention: {
      commanderStateSourceNative: true,
      hilDefinitionUsesInferenceAndTeleopInSameEpisode: true,
      frameAndEpisodeCountsByteReplayed: true,
      humanTakeoverPromotedToIndependentRecovery: false,
      pairedFailureToRecoveryOutcomeAvailable: false,
    },
    hardware: {
      cardClaimsBimanualYamFollower: true,
      cardClaimsRobotTypeYam: true,
      infoJsonRobotTypeValues: ["arx"],
      cardAndInfoRobotTypeAgree: false,
      discrepancyResolvedByThisArtifact: false,
      physicalRobotIdentityIndependentlyVerified: false,
    },
    completeness: {
      fullRepositoryRecordAnd13PageTreeCapturedBeforeAndAfter: true,
      completeSelectedFailureNoVideoSubset: true,
      completeSelectedSuccessHilNoVideoSubset: true,
      completeAttemptCensus: false,
      publisherDiscardedOrUnpublishedAttemptsUnknown: true,
      videosAcquired: false,
      visualReplay: false,
    },
    rights: {
      datasetCardClaim: "CC-BY-NC-4.0",
      commercialUseAllowed: false,
      productionTrainingAllowed: false,
      evaluationUseFinallyAdjudicated: false,
      repositoryLicenseFilePresent: false,
    },
    privacy: {
      rawMcapPathsPresent: true,
      rawMcapPathValuesRepublishedInReport: false,
      humanInterventionTrajectoriesPresent: true,
      sceneVideosAcquired: false,
      noPersonalInformationGuarantee: false,
      privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    boundary: { training: 0, network: 0, CEU: 0, authority: 0, action: 0,
      opportunity: 0, delegation: 0, independentOutcome: 0,
      longitudinalOutcome: 0 },
  };
}

export function buildRfmPhase1AuditFromSource(sourceDirectory, options = {}) {
  const verified = verifyRfmPhase1SourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const body = buildBody(verified, runRfmPhase1Replay(sourceDirectory, options));
  return { ...body, artifactHash: rfmPhase1ArtifactHash(body) };
}

function zeroBoundary(value) {
  return plain(value) && ["training", "network", "CEU", "authority", "action",
    "opportunity", "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => value[key] === 0);
}

export function verifyRfmPhase1Audit(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== RFM_PHASE1_AUDIT_SCHEMA
      || artifact.frozenAt !== RFM_PHASE1_FROZEN_AT
      || artifact.status
        !== "PINNED_RFM_PHASE1_MOUSE_BATTERY_FAILURE_AND_SUCCESS_HIL_NO_VIDEO_REPLAY"
      || artifact.admission !== "QUARANTINE_EVAL" || !HASH.test(artifact.artifactHash ?? "")) {
      fail("ARTIFACT_SHAPE_INVALID");
    }
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== rfmPhase1ArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.selectedObjects !== 298 || artifact.source?.selectedBytes !== 81_902_279
      || artifact.source?.usedStorageBytes !== 23_878_206_905
      || artifact.source?.treeLogicalBytes !== 101_586_346_251
      || artifact.replay?.failure?.episodes !== 125
      || artifact.replay?.failure?.frames !== 314_899
      || artifact.replay?.successHil?.episodes !== 164
      || artifact.replay?.successHil?.frames !== 692_068) fail("ARTIFACT_COUNTS_INVALID");
    if (artifact.outcome?.sourceNativePerEpisodeSuccessField !== false
      || artifact.outcome?.publisherFailureEpisodes !== 125
      || artifact.outcome?.publisherSuccessOrHilEpisodes !== 164
      || artifact.outcome?.publisherOutcomeSource !== "DATASET_CARD_AND_SUBSET_DIRECTORY"
      || artifact.outcome?.failureRewardFieldPresent !== true
      || artifact.outcome?.successHilRewardFieldPresent !== false
      || artifact.outcome?.sourceNativePerEpisodeFailureField !== false
      || artifact.outcome?.independentOutcome !== 0
      || artifact.outcome?.longitudinalOutcome !== 0
      || artifact.intervention?.commanderStateSourceNative !== true
      || artifact.intervention?.hilDefinitionUsesInferenceAndTeleopInSameEpisode !== true
      || artifact.intervention?.frameAndEpisodeCountsByteReplayed !== true
      || artifact.intervention?.humanTakeoverPromotedToIndependentRecovery !== false
      || artifact.intervention?.pairedFailureToRecoveryOutcomeAvailable !== false
      || artifact.replay?.failure?.hilEpisodes !== 1
      || artifact.replay?.failure?.commanderStateFrameCounts?.inference !== 301_512
      || artifact.replay?.failure?.commanderStateFrameCounts?.teleop !== 235
      || artifact.replay?.failure?.rewardFrameCounts?.["-1.0"] !== 314_774
      || artifact.replay?.failure?.rewardFrameCounts?.["-2000.0"] !== 125
      || artifact.replay?.successHil?.hilEpisodes !== 128
      || artifact.replay?.successHil?.inferenceOnlyEpisodes !== 36
      || artifact.replay?.successHil?.inferenceToTeleopBoundaries !== 173
      || artifact.replay?.successHil?.commanderStateFrameCounts?.inference !== 421_865
      || artifact.replay?.successHil?.commanderStateFrameCounts?.teleop !== 270_203
      || artifact.hardware?.cardAndInfoRobotTypeAgree !== false
      || !same(artifact.hardware?.infoJsonRobotTypeValues, ["arx"])
      || artifact.hardware?.discrepancyResolvedByThisArtifact !== false
      || artifact.hardware?.physicalRobotIdentityIndependentlyVerified !== false
      || artifact.completeness?.fullRepositoryRecordAnd13PageTreeCapturedBeforeAndAfter
        !== true
      || artifact.completeness?.completeSelectedFailureNoVideoSubset !== true
      || artifact.completeness?.completeSelectedSuccessHilNoVideoSubset !== true
      || artifact.completeness?.completeAttemptCensus !== false
      || artifact.completeness?.publisherDiscardedOrUnpublishedAttemptsUnknown !== true
      || artifact.completeness?.videosAcquired !== false
      || artifact.completeness?.visualReplay !== false
      || artifact.rights?.datasetCardClaim !== "CC-BY-NC-4.0"
      || artifact.rights?.commercialUseAllowed !== false
      || artifact.rights?.productionTrainingAllowed !== false
      || artifact.rights?.evaluationUseFinallyAdjudicated !== false
      || artifact.rights?.repositoryLicenseFilePresent !== false
      || artifact.privacy?.rawMcapPathsPresent !== true
      || artifact.privacy?.rawMcapPathValuesRepublishedInReport !== false
      || artifact.privacy?.humanInterventionTrajectoriesPresent !== true
      || artifact.privacy?.sceneVideosAcquired !== false
      || artifact.privacy?.noPersonalInformationGuarantee !== false
      || artifact.privacy?.privacyReviewComplete !== false
      || artifact.privacy?.publicAvailabilityResolvesPrivacy !== false
      || !zeroBoundary(artifact.boundary)) fail("ARTIFACT_BOUNDARY_INVALID");
    return { ok: true, artifactHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyRfmPhase1AuditWithSource(artifact,
  sourceDirectory, options = {}) {
  const standalone = verifyRfmPhase1Audit(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildRfmPhase1AuditFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: rebuilt.source.sourceManifestHash,
      sourceRoot: rebuilt.source.sourceRoot,
      verificationLevel: "FULL_289_PARQUET_META_AND_13_PAGE_TREE_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
