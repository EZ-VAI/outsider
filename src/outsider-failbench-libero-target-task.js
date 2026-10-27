/*
 * Pinned bounded intake for the smallest complete FailBench-LIBERO v2 target
 * cache task.  The selected HDF5 is a derived contact-projection cache joined
 * to the full publisher manifest; it is not the multi-gigabyte raw execution
 * HDF5 and cannot establish a real-robot outcome or recovery execution.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, rmSync, writeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const FAILBENCH_LIBERO_ID = "aaronngx/failbench-libero-v2";
export const FAILBENCH_LIBERO_REVISION =
  "32ae05d04fadf4005dfa50a6ff4199b8bc29923e";
export const FAILBENCH_LIBERO_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const FAILBENCH_LIBERO_SPLIT = "libero_goal";
export const FAILBENCH_LIBERO_TASK = "turn_on_the_stove";
export const FAILBENCH_LIBERO_SOURCE_SCHEMA =
  "outsider/failbench-libero-target-task-source/v1";
export const FAILBENCH_LIBERO_AUDIT_SCHEMA =
  "outsider/failbench-libero-target-task-audit/v1";

export const FAILBENCH_LIBERO_TREE_HASH =
  "sha256:33b3c3b75add4009a3f7546e44965cdb9ff27b643c4e3b1777e21fcece929e16";

export const FAILBENCH_LIBERO_FILES = Object.freeze([
  Object.freeze({ path: "README.md", bytes: 7_495,
    oid: "f2df1e929f9b23fb625854ac09351fac2488b3ad", lfs: null }),
  Object.freeze({ path: "target_cache/libero_goal/turn_on_the_stove.h5",
    bytes: 10_953_680, oid: "07e1ca6518cc9143e48790b271b7c8ee7cccaf5f",
    lfs: "24acefc5306cf3d44521d3be66c4d13df871b5041dc32f87fee0d2b16e62ad96" }),
  Object.freeze({ path: "v2/libero_goal/manifest.csv", bytes: 3_120_202,
    oid: "79c11c6c08ee5e33a35ee3ee6e7ddb5fadeeb118", lfs: null }),
  Object.freeze({ path: "v2/quarantine.csv", bytes: 35_778,
    oid: "66348c119c83c962baca96196aca18006ca4a228", lfs: null }),
]);

export const FAILBENCH_LIBERO_PROFILE = Object.freeze({
  usedStorage: 191_382_817_871,
  treeEntries: 99,
  treeDirectories: 14,
  treeFiles: 85,
  treeBytes: 191_394_194_500,
  lfsFiles: 60,
  lfsBytes: 191_382_817_871,
  rawTaskHdf5Files: 30,
  rawTaskHdf5Bytes: 189_538_198_315,
  targetCacheHdf5Files: 30,
  targetCacheHdf5Bytes: 1_844_619_556,
  selectedObjects: 4,
  selectedBytes: 14_117_155,
  selectedTargetCacheBytes: 10_953_680,
  correspondingRawTaskBytes: 5_687_181_286,
  fullManifestRows: 15_000,
  fullManifestTasks: 10,
  selectedTrials: 1_500,
  failureModes: 5,
  progressBins: 10,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;

function fail(code, detail = null) {
  throw new Error(detail === null ? `FAILBENCH_LIBERO_${code}`
    : `FAILBENCH_LIBERO_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function failbenchLiberoSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return failbenchLiberoSha256(Buffer.from(
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
  return typeof value === "string" && value.length > 0 && value.length <= 4096
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function endpoints() {
  const encoded = FAILBENCH_LIBERO_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${FAILBENCH_LIBERO_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${FAILBENCH_LIBERO_REVISION}`
      + "?recursive=true&expand=false&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${FAILBENCH_LIBERO_REVISION}`,
  };
}

function validateRepository(value) {
  if (!plain(value) || !Array.isArray(value.siblings)) fail("REPOSITORY_INVALID");
  const paths = value.siblings.map((entry) => entry?.rfilename)
    .sort((left, right) => left.localeCompare(right));
  if (value.id !== FAILBENCH_LIBERO_ID || value.sha !== FAILBENCH_LIBERO_REVISION
    || value.private !== false || value.gated !== false || value.disabled !== false
    || value.usedStorage !== FAILBENCH_LIBERO_PROFILE.usedStorage
    || value.cardData?.license !== "mit"
    || value.cardData?.pretty_name !== "FailBench LIBERO v2 (contact prediction)"
    || paths.length !== FAILBENCH_LIBERO_PROFILE.treeFiles
    || paths.some((entry) => !safeRemotePath(entry))) fail("REPOSITORY_PROFILE_INVALID");
  return { id: value.id, sha: value.sha, private: value.private,
    gated: value.gated, disabled: value.disabled, usedStorage: value.usedStorage,
    cardLicense: value.cardData.license, prettyName: value.cardData.pretty_name,
    siblingPaths: paths };
}

function validateTree(raw) {
  if (!Array.isArray(raw) || raw.length !== FAILBENCH_LIBERO_PROFILE.treeEntries) {
    fail("TREE_INVALID");
  }
  const projection = raw.map((entry) => {
    if (!plain(entry) || !["directory", "file"].includes(entry.type)
      || !safeRemotePath(entry.path) || !SHA1.test(entry.oid ?? "")
      || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      fail("TREE_ENTRY_INVALID");
    }
    if (entry.type === "directory") {
      if (entry.size !== 0 || entry.lfs != null) fail("TREE_DIRECTORY_INVALID");
      return { type: entry.type, path: entry.path, oid: entry.oid,
        sizeBytes: 0, lfsSha256: null };
    }
    if (entry.lfs == null) return { type: entry.type, path: entry.path,
      oid: entry.oid, sizeBytes: entry.size, lfsSha256: null };
    if (!plain(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
      || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID");
    return { type: entry.type, path: entry.path, oid: entry.oid,
      sizeBytes: entry.size, lfsSha256: `sha256:${entry.lfs.oid}` };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const files = projection.filter((entry) => entry.type === "file");
  const directories = projection.filter((entry) => entry.type === "directory");
  const lfs = files.filter((entry) => entry.lfsSha256 !== null);
  const rawH5 = files.filter((entry) => entry.path.startsWith("v2/")
    && entry.path.endsWith(".h5"));
  const targetH5 = files.filter((entry) => entry.path.startsWith("target_cache/")
    && entry.path.endsWith(".h5"));
  const treeHash = digest("outsider/failbench-libero-full-tree/v1", projection);
  const smallestTarget = [...targetH5].sort((left, right) =>
    left.sizeBytes - right.sizeBytes || left.path.localeCompare(right.path))[0];
  const correspondingRaw = rawH5.find((entry) => entry.path
    === "v2/libero_goal/turn_on_the_stove.h5");
  if (treeHash !== FAILBENCH_LIBERO_TREE_HASH
    || files.length !== FAILBENCH_LIBERO_PROFILE.treeFiles
    || directories.length !== FAILBENCH_LIBERO_PROFILE.treeDirectories
    || files.reduce((sum, entry) => sum + entry.sizeBytes, 0)
      !== FAILBENCH_LIBERO_PROFILE.treeBytes
    || lfs.length !== FAILBENCH_LIBERO_PROFILE.lfsFiles
    || lfs.reduce((sum, entry) => sum + entry.sizeBytes, 0)
      !== FAILBENCH_LIBERO_PROFILE.lfsBytes
    || rawH5.length !== FAILBENCH_LIBERO_PROFILE.rawTaskHdf5Files
    || rawH5.reduce((sum, entry) => sum + entry.sizeBytes, 0)
      !== FAILBENCH_LIBERO_PROFILE.rawTaskHdf5Bytes
    || targetH5.length !== FAILBENCH_LIBERO_PROFILE.targetCacheHdf5Files
    || targetH5.reduce((sum, entry) => sum + entry.sizeBytes, 0)
      !== FAILBENCH_LIBERO_PROFILE.targetCacheHdf5Bytes
    || smallestTarget?.path !== "target_cache/libero_goal/turn_on_the_stove.h5"
    || smallestTarget?.sizeBytes !== FAILBENCH_LIBERO_PROFILE.selectedTargetCacheBytes
    || correspondingRaw?.sizeBytes !== FAILBENCH_LIBERO_PROFILE.correspondingRawTaskBytes) {
    fail("TREE_PROFILE_INVALID");
  }
  const selected = FAILBENCH_LIBERO_FILES.map((expected) => {
    const actual = files.find((entry) => entry.path === expected.path);
    if (!actual || actual.sizeBytes !== expected.bytes || actual.oid !== expected.oid
      || actual.lfsSha256 !== (expected.lfs === null ? null : `sha256:${expected.lfs}`)) {
      fail("SELECTED_TREE_ENTRY_INVALID", expected.path);
    }
    return actual;
  }).sort((left, right) => left.path.localeCompare(right.path));
  return { projection, files, selected, treeHash,
    profile: { entries: projection.length, directories: directories.length,
      files: files.length, bytes: files.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      lfsFiles: lfs.length,
      lfsBytes: lfs.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      rawTaskHdf5Files: rawH5.length,
      rawTaskHdf5Bytes: rawH5.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      targetCacheHdf5Files: targetH5.length,
      targetCacheHdf5Bytes: targetH5.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      minimumTargetCachePath: smallestTarget.path,
      minimumTargetCacheBytes: smallestTarget.sizeBytes,
      correspondingRawTaskBytes: correspondingRaw.sizeBytes } };
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
    || /(?:fetch failed|network|timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN)/iu
      .test(String(error?.message ?? error));
}

async function fetchOnce(url, maximumBytes, fetchImpl) {
  if (!permittedUrl(url)) fail("REQUEST_URL_REFUSED", url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180_000);
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
    if (!permittedUrl(finalUrl)) fail("FINAL_URL_REFUSED", finalUrl);
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > maximumBytes) fail("CONTENT_LENGTH_EXCEEDED");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) fail("BODY_BYTES_EXCEEDED");
    return { bytes, finalUrl, status: response.status,
      contentType: response.headers?.get?.("content-type") ?? null,
      link: response.headers?.get?.("link") ?? null };
  } finally { clearTimeout(timer); }
}

async function boundedFetch(url, maximumBytes, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetchOnce(url, maximumBytes, fetchImpl); }
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

async function fetchJson(url, fetchImpl) {
  const value = await boundedFetch(url, 16 * 1024 * 1024, fetchImpl);
  return { ...value, parsed: parseJson(value.bytes, url) };
}

async function capturePhase(root, phase, fetchImpl) {
  const endpoint = endpoints();
  const [repository, tree] = await Promise.all([
    fetchJson(endpoint.repository, fetchImpl), fetchJson(endpoint.tree, fetchImpl),
  ]);
  const repositoryProjection = validateRepository(repository.parsed);
  const treeProjection = validateTree(tree.parsed);
  if (!same(repositoryProjection.siblingPaths,
    treeProjection.files.map((entry) => entry.path)
      .sort((left, right) => left.localeCompare(right)))) {
    fail("REPOSITORY_TREE_PATH_MISMATCH");
  }
  return [{ kind: "repository", value: repository, requestUrl: endpoint.repository },
    { kind: "tree-page-001", value: tree, requestUrl: endpoint.tree }]
    .map((entry) => {
      const file = `api/${phase}/${entry.kind}.json`;
      writePrivateOnce(safeJoin(root, file), entry.value.bytes);
      return { phase, kind: entry.kind, file, requestUrl: entry.requestUrl,
        finalUrl: entry.value.finalUrl, status: entry.value.status,
        contentType: entry.value.contentType, link: entry.value.link,
        bytes: entry.value.bytes.length,
        sha256: failbenchLiberoSha256(entry.value.bytes) };
    });
}

async function downloadObject(root, entry, fetchImpl) {
  const url = `${endpoints().raw}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const response = await boundedFetch(url, entry.sizeBytes + 1, fetchImpl);
  const sha256 = failbenchLiberoSha256(response.bytes);
  if (response.bytes.length !== entry.sizeBytes
    || (entry.lfsSha256 === null ? gitBlobOid(response.bytes) !== entry.oid
      : sha256 !== entry.lfsSha256)) fail("OBJECT_INVALID", entry.path);
  const file = `objects/${entry.path}`;
  writePrivateOnce(safeJoin(root, file), response.bytes);
  return { datasetId: FAILBENCH_LIBERO_ID, revision: FAILBENCH_LIBERO_REVISION,
    path: entry.path, file, requestUrl: url, finalUrl: response.finalUrl,
    status: response.status, contentType: response.contentType,
    bytes: response.bytes.length, sha256, gitOid: entry.oid,
    lfsSha256: entry.lfsSha256 };
}

function rootProjection(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots, ...remoteObjects].map((entry) => ({
    file: entry.file, bytes: entry.bytes, sha256: entry.sha256,
  })).sort((left, right) => left.file.localeCompare(right.file));
  return { files,
    sourceRoot: digest("outsider/failbench-libero-source-root/v1", files) };
}

export async function acquirePinnedFailbenchLiberoSource(sourceDirectory,
  options = {}) {
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
    const treeBefore = validateTree(parseJson(readFileSync(path.join(temporary,
      "api/before/tree-page-001.json")), "tree-before"));
    const remoteObjects = (await Promise.all(treeBefore.selected.map((entry) =>
      downloadObject(temporary, entry, fetchImpl))))
      .sort((left, right) => left.file.localeCompare(right.file));
    const after = await capturePhase(temporary, "after", fetchImpl);
    const repositoryBefore = validateRepository(parseJson(readFileSync(path.join(temporary,
      "api/before/repository.json")), "repository-before"));
    const repositoryAfter = validateRepository(parseJson(readFileSync(path.join(temporary,
      "api/after/repository.json")), "repository-after"));
    const treeAfter = validateTree(parseJson(readFileSync(path.join(temporary,
      "api/after/tree-page-001.json")), "tree-after"));
    if (!same(repositoryBefore, repositoryAfter)
      || !same(treeBefore.projection, treeAfter.projection)) fail("SOURCE_DRIFT");
    const apiSnapshots = [...before, ...after]
      .sort((left, right) => left.file.localeCompare(right.file));
    const rooted = rootProjection(apiSnapshots, remoteObjects);
    const body = { schema: FAILBENCH_LIBERO_SOURCE_SCHEMA,
      frozenAt: FAILBENCH_LIBERO_FROZEN_AT, apiSnapshots, remoteObjects,
      sourceFiles: rooted.files, sourceRoot: rooted.sourceRoot,
      closure: { selectedObjects: 4, selectedBytes: 14_117_155,
        completeRecursiveTreeCapturedBeforeAndAfter: true,
        recursiveTreePagesPerPhase: 1,
        recursiveTreeEntries: 99, recursiveTreeFiles: 85,
        recursiveTreeBytes: 191_394_194_500,
        recursiveTreeHash: FAILBENCH_LIBERO_TREE_HASH,
        completeSelectedTargetCacheHdf5: true,
        completeSelectedSplitManifest: true,
        completePublisherQuarantineLedger: true,
        rootReadmeSelected: true,
        rawTaskHdf5Selected: false,
        correspondingRawTaskBytesExcluded: 5_687_181_286,
        boundedClosureUnder300MB: true } };
    const manifest = { ...body,
      manifestHash: digest("outsider/failbench-libero-source-manifest/v1", body) };
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

export function verifyFailbenchLiberoSourceDirectory(sourceDirectory) {
  try {
    const manifest = parseJson(readRegular(path.join(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== FAILBENCH_LIBERO_SOURCE_SCHEMA
      || manifest.frozenAt !== FAILBENCH_LIBERO_FROZEN_AT
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 4
      || !Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 4
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")) {
      fail("MANIFEST_INVALID");
    }
    const snapshots = {};
    for (const descriptor of manifest.apiSnapshots) {
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      if (failbenchLiberoSha256(bytes) !== descriptor.sha256) fail("SNAPSHOT_HASH_INVALID");
      snapshots[`${descriptor.phase}:${descriptor.kind}`] = parseJson(bytes, descriptor.file);
    }
    const rb = validateRepository(snapshots["before:repository"]);
    const ra = validateRepository(snapshots["after:repository"]);
    if (!same(rb, ra)) fail("REPOSITORY_DRIFT");
    const before = validateTree(snapshots["before:tree-page-001"]);
    const after = validateTree(snapshots["after:tree-page-001"]);
    if (!same(before.projection, after.projection)) fail("TREE_DRIFT");
    if (!same(rb.siblingPaths, before.files.map((entry) => entry.path)
      .sort((left, right) => left.localeCompare(right)))) fail("TREE_SIBLING_MISMATCH");
    if (!same(before.selected.map((entry) => entry.path).sort(),
      manifest.remoteObjects.map((entry) => entry.path).sort())) fail("REMOTE_SET_INVALID");
    for (const descriptor of manifest.remoteObjects) {
      const entry = before.selected.find((value) => value.path === descriptor.path);
      if (!entry || descriptor.datasetId !== FAILBENCH_LIBERO_ID
        || descriptor.revision !== FAILBENCH_LIBERO_REVISION
        || descriptor.file !== `objects/${entry.path}` || descriptor.bytes !== entry.sizeBytes
        || descriptor.gitOid !== entry.oid || descriptor.lfsSha256 !== entry.lfsSha256) {
        fail("REMOTE_DESCRIPTOR_INVALID");
      }
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      const sha256 = failbenchLiberoSha256(bytes);
      if (descriptor.sha256 !== sha256
        || (entry.lfsSha256 === null ? gitBlobOid(bytes) !== entry.oid
          : sha256 !== entry.lfsSha256)) fail("REMOTE_HASH_INVALID");
    }
    const rooted = rootProjection(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles) || rooted.sourceRoot !== manifest.sourceRoot) {
      fail("SOURCE_ROOT_INVALID");
    }
    const expectedClosure = { selectedObjects: 4, selectedBytes: 14_117_155,
      completeRecursiveTreeCapturedBeforeAndAfter: true,
      recursiveTreePagesPerPhase: 1, recursiveTreeEntries: 99,
      recursiveTreeFiles: 85, recursiveTreeBytes: 191_394_194_500,
      recursiveTreeHash: FAILBENCH_LIBERO_TREE_HASH,
      completeSelectedTargetCacheHdf5: true,
      completeSelectedSplitManifest: true,
      completePublisherQuarantineLedger: true,
      rootReadmeSelected: true, rawTaskHdf5Selected: false,
      correspondingRawTaskBytesExcluded: 5_687_181_286,
      boundedClosureUnder300MB: true };
    if (!same(manifest.closure, expectedClosure)) fail("CLOSURE_INVALID");
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"].sort((left, right) => left.localeCompare(right));
    if (!same(walk(sourceDirectory), expectedFiles)) fail("FILE_CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/failbench-libero-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    return { ok: true, manifest,
      verificationLevel: "PINNED_FAILBENCH_FULL_TREE_AND_COMPLETE_TARGET_TASK_CACHE" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYTHON_REPLAY = String.raw`
import collections, csv, hashlib, json, math, os, struct, sys
import hdf5plugin  # registers the publisher-required filter before h5py
import h5py
import numpy as np

root = os.path.join(sys.argv[1], "objects")
task = "turn_on_the_stove"
split = "libero_goal"

def die(code):
    raise RuntimeError("FAILBENCH_LIBERO_REPLAY_" + code)

manifest_path = os.path.join(root, "v2", "libero_goal", "manifest.csv")
with open(manifest_path, "r", encoding="utf-8", newline="") as handle:
    reader = csv.DictReader(handle)
    header = reader.fieldnames
    rows = list(reader)

expected_header = ["trial_id", "split", "task", "demo_key", "seed",
  "seed_idx", "bin_idx", "fail_idx", "traj_progress", "failure_mode",
  "failure_joints", "failure_prob", "is_holding", "n_contacts", "h5_path"]
if header != expected_header or len(rows) != 15000:
    die("MANIFEST_SHAPE_INVALID")
if any(set(row) != set(expected_header) for row in rows):
    die("MANIFEST_KEYS_INVALID")
task_counts = collections.Counter(row["task"] for row in rows)
if len(task_counts) != 10 or set(task_counts.values()) != {1500}:
    die("MANIFEST_TASK_COUNTS_INVALID")
selected = [row for row in rows if row["split"] == split and row["task"] == task]
if len(selected) != 1500:
    die("SELECTED_ROWS_INVALID")
by_id = {row["trial_id"]: row for row in selected}
if len(by_id) != 1500:
    die("TRIAL_IDS_NOT_UNIQUE")
if any(not row["h5_path"].startswith("/") for row in rows):
    die("MANIFEST_H5_PATH_PROFILE_INVALID")

mode_counts = collections.Counter(row["failure_mode"] for row in selected)
expected_modes = {"ALL_JOINTS": 119, "GRIPPER_OPEN": 351,
  "MULTI_JOINT": 128, "SINGLE_JOINT": 661, "SLIPPERY_GRIP": 241}
if dict(mode_counts) != expected_modes:
    die("FAILURE_MODE_COUNTS_INVALID")

bin_rows = collections.defaultdict(list)
for row in selected:
    try:
        bin_idx = int(row["bin_idx"])
        progress = float(row["traj_progress"])
        int(row["seed"]); int(row["n_contacts"]); float(row["failure_prob"])
    except Exception:
        die("MANIFEST_NUMERIC_INVALID")
    if not math.isfinite(progress):
        die("PROGRESS_NONFINITE")
    bin_rows[bin_idx].append(progress)
if set(bin_rows) != set(range(10)) or any(len(values) != 150 for values in bin_rows.values()):
    die("PROGRESS_BINS_INVALID")

h5_path = os.path.join(root, "target_cache", "libero_goal", task + ".h5")
logical = hashlib.sha256()
logical.update(b"outsider/failbench-libero-target-projection/v1\0")
projection_rows = 0
zero_groups = 0
maximum_rows = 0
u_min = u_max = v_min = v_max = force_min = force_max = None
mode_cache = collections.defaultdict(collections.Counter)
bin_cache = collections.defaultdict(collections.Counter)
raw_cache = collections.Counter()
probability_mismatches = 0

with h5py.File(h5_path, "r") as handle:
    if list(handle.attrs.keys()) != []:
        die("HDF5_ROOT_ATTRS_INVALID")
    trial_ids = sorted(handle.keys())
    if len(trial_ids) != 1500 or set(trial_ids) != set(by_id):
        die("HDF5_TRIAL_SET_INVALID")
    for trial_id in trial_ids:
        group = handle[trial_id]
        if not isinstance(group, h5py.Group) or sorted(group.keys()) != ["projection"]:
            die("HDF5_GROUP_SHAPE_INVALID")
        if sorted(group.attrs.keys()) != ["failure_prob"]:
            die("HDF5_GROUP_ATTRS_INVALID")
        dataset = group["projection"]
        if (str(dataset.dtype) != "float32" or len(dataset.shape) != 2
            or dataset.shape[1] != 3 or dataset.compression is not None
            or dataset.chunks is not None or dataset.shuffle or dataset.fletcher32):
            die("HDF5_DATASET_SCHEMA_INVALID")
        values = np.ascontiguousarray(dataset[...], dtype="<f4")
        if values.shape != dataset.shape or not np.isfinite(values).all():
            die("HDF5_VALUES_INVALID")
        count = int(values.shape[0])
        projection_rows += count
        maximum_rows = max(maximum_rows, count)
        is_zero = count == 0
        zero_groups += int(is_zero)
        row = by_id[trial_id]
        state = "zero" if is_zero else "nonzero"
        mode_cache[row["failure_mode"]][state] += 1
        bin_cache[int(row["bin_idx"])][state] += 1
        bin_cache[int(row["bin_idx"])]["projectionRows"] += count
        raw_state = "rawZero" if int(row["n_contacts"]) == 0 else "rawPositive"
        raw_cache[f"{raw_state}|cache{'Zero' if is_zero else 'Positive'}"] += 1
        probability = np.float32(group.attrs["failure_prob"])
        if abs(float(probability) - float(row["failure_prob"])) > 1e-6:
            probability_mismatches += 1
        logical.update(trial_id.encode("utf-8")); logical.update(b"\0")
        logical.update(str(count).encode("ascii")); logical.update(b"\0")
        logical.update(struct.pack("<f", float(probability)))
        logical.update(values.tobytes(order="C"))
        if count:
            if (np.min(values[:, 0]) < 0 or np.max(values[:, 0]) >= 320
                or np.min(values[:, 1]) < 0 or np.max(values[:, 1]) >= 240
                or np.min(values[:, 2]) <= 0):
                die("PROJECTION_DOMAIN_INVALID")
            local = [float(np.min(values[:, 0])), float(np.max(values[:, 0])),
              float(np.min(values[:, 1])), float(np.max(values[:, 1])),
              float(np.min(values[:, 2])), float(np.max(values[:, 2]))]
            u_min = local[0] if u_min is None else min(u_min, local[0])
            u_max = local[1] if u_max is None else max(u_max, local[1])
            v_min = local[2] if v_min is None else min(v_min, local[2])
            v_max = local[3] if v_max is None else max(v_max, local[3])
            force_min = local[4] if force_min is None else min(force_min, local[4])
            force_max = local[5] if force_max is None else max(force_max, local[5])

if (projection_rows != 391541 or zero_groups != 689 or maximum_rows != 4091
    or probability_mismatches != 0):
    die("TARGET_CACHE_PROFILE_INVALID")

quarantine_path = os.path.join(root, "v2", "quarantine.csv")
with open(quarantine_path, "r", encoding="utf-8", newline="") as handle:
    q_reader = csv.DictReader(handle)
    q_header = q_reader.fieldnames
    quarantine = list(q_reader)
if q_header != ["source", "split", "task", "trial_id", "primary_reason", "all_reasons"]:
    die("QUARANTINE_HEADER_INVALID")
q_sources = collections.Counter(row["source"] for row in quarantine)
selected_quarantine = sum(row["split"] == split and row["task"] == task
  for row in quarantine)
if len(quarantine) != 346 or dict(q_sources) != {"robocasa": 346} or selected_quarantine != 0:
    die("QUARANTINE_PROFILE_INVALID")

readme = open(os.path.join(root, "README.md"), "r", encoding="utf-8").read()
claims = ["45,000 trials", "GRIPPER_OPEN", "SINGLE_JOINT", "MULTI_JOINT",
  "ALL_JOINTS", "SLIPPERY_GRIP", "Released under **MIT**",
  "content remains under its upstream LIBERO license",
  "target_cache/<split>/<task>.h5"]
if any(claim not in readme for claim in claims):
    die("README_CLAIM_MISSING")

bin_summary = {}
for index in range(10):
    values = bin_rows[index]
    bin_summary[str(index)] = {"rows": len(values),
      "progressMin": min(values), "progressMax": max(values)}

print(json.dumps({
  "manifest": {"header": expected_header, "rows": len(rows),
    "tasks": len(task_counts), "rowsPerTask": 1500,
    "absoluteBuildPathRows": sum(row["h5_path"].startswith("/") for row in rows)},
  "selectedTask": {"split": split, "task": task, "trials": len(selected),
    "failureModeCounts": dict(sorted(mode_counts.items())),
    "progressBins": bin_summary,
    "progressMin": min(float(row["traj_progress"]) for row in selected),
    "progressMax": max(float(row["traj_progress"]) for row in selected),
    "uniqueProgressValues": len(set(row["traj_progress"] for row in selected)),
    "demos": len(set(row["demo_key"] for row in selected)),
    "seeds": len(set(row["seed"] for row in selected)),
    "manifestDeclaredRawContactRows": sum(int(row["n_contacts"]) for row in selected),
    "manifestDeclaredZeroContactTrials": sum(int(row["n_contacts"]) == 0
      for row in selected)},
  "targetCache": {"derivativeProjectionCache": True,
    "trialGroups": 1500, "trialIdsExactlyMatchManifest": True,
    "rootAttributes": [], "datasetsPerGroup": ["projection"],
    "attributesPerGroup": ["failure_prob"],
    "failureModeAttributePresent": False,
    "trajProgressAttributePresent": False,
    "projectionDtype": "float32", "projectionColumns": 3,
    "projectionRows": projection_rows, "minimumProjectionRowsPerTrial": 0,
    "maximumProjectionRowsPerTrial": maximum_rows,
    "nonzeroProjectionTrials": 1500 - zero_groups,
    "zeroProjectionTrials": zero_groups,
    "coordinateBounds": {"u": [u_min, u_max], "v": [v_min, v_max]},
    "forceBounds": [force_min, force_max],
    "failureProbabilityManifestMatches": True,
    "logicalProjectionHash": "sha256:" + logical.hexdigest(),
    "allTrialsReadWithH5py": True},
  "crosswalk": {"rawContactToFilteredCache": dict(sorted(raw_cache.items())),
    "failureModeToCache": {key: dict(sorted(value.items()))
      for key, value in sorted(mode_cache.items())},
    "progressBinToCache": {str(key): dict(sorted(value.items()))
      for key, value in sorted(bin_cache.items())}},
  "quarantine": {"rows": len(quarantine), "sourceCounts": dict(q_sources),
    "liberoRows": sum(row["source"] == "libero" for row in quarantine),
    "selectedTaskRows": selected_quarantine},
}, sort_keys=True, separators=(",", ":")))
`;

export function runFailbenchLiberoReplay(sourceDirectory, options = {}) {
  const verified = verifyFailbenchLiberoSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const result = spawnSync(python, ["-c", PYTHON_REPLAY, sourceDirectory], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) fail("PYTHON_REPLAY_FAILED",
    String(result.stderr || result.stdout).trim());
  return parseJson(Buffer.from(result.stdout.trim(), "utf8"), "python");
}

export function failbenchLiberoArtifactHash(body) {
  return digest("outsider/failbench-libero-target-task-audit/v1", body);
}

function buildBody(verified, replay) {
  return {
    schema: FAILBENCH_LIBERO_AUDIT_SCHEMA,
    frozenAt: FAILBENCH_LIBERO_FROZEN_AT,
    status: "PINNED_FAILBENCH_LIBERO_DERIVED_TARGET_TASK_REPLAY",
    admission: "QUARANTINE_EVAL",
    source: { id: FAILBENCH_LIBERO_ID, revision: FAILBENCH_LIBERO_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      selectedObjects: 4, selectedBytes: 14_117_155,
      fullTreeHash: FAILBENCH_LIBERO_TREE_HASH },
    selection: { split: FAILBENCH_LIBERO_SPLIT, task: FAILBENCH_LIBERO_TASK,
      selectedBecauseMinimumTargetCacheHdf5ByPinnedTreeBytes: true,
      targetCacheBytes: 10_953_680,
      correspondingRawTaskHdf5Bytes: 5_687_181_286,
      correspondingRawTaskHdf5Selected: false,
      boundedClosureLimitBytes: 300_000_000,
      boundedClosureWithinLimit: true,
      allFiveFailureModesCovered: true,
      allTenProgressBinsCovered: true },
    replay,
    evidenceClass: { liberoSimulation: true,
      publisherDescribesTeleopDemoBase: true,
      injectedFailureCondition: true,
      contactPredictionTarget: true,
      targetCacheIsDerivedFromFailureInducedFilteredContacts: true,
      realRobotExecution: false,
      physicalOutcome: false,
      independentOutcome: 0,
      longitudinalOutcome: 0 },
    semantics: { failureModeIsInjectedConditionNotObservedTerminalOutcome: true,
      trajProgressIsInjectionPointNotTaskOutcome: true,
      projectionIsDerivedSupervisionTarget: true,
      sourceNativeTerminalSuccessFieldInClosure: false,
      sourceNativeTerminalFailureFieldInClosure: false,
      rawActionStreamInClosure: false,
      rawStateStreamInClosure: false,
      rawImageStreamInClosure: false,
      recoveryExecutionInClosure: false },
    completeness: { completePinnedRecursiveTreeMetadata: true,
      completeSelectedTargetTaskCacheBytes: true,
      completeSelectedSplitManifestBytes: true,
      completePublisherQuarantineLedgerBytes: true,
      completeSelectedPublishedTargetGroupCensus: true,
      selectedPublishedTargetGroups: 1_500,
      completeRawTaskHdf5: false,
      completeDatasetBytes: false,
      completeAttemptCensus: false,
      publisherQuarantineContainsNoLiberoRowsAtPin: true,
      noLiberoQuarantineRowsDoesNotProveNoDiscardedGenerationAttempts: true },
    rights: { datasetCardClaim: "MIT",
      readmeClaim: "MIT",
      repositoryLicenseFilePresent: false,
      readmeSaysUnderlyingDemoContentRemainsUnderUpstreamLiberoLicense: true,
      upstreamLiberoLicenseIncludedInClosure: false,
      productionTrainingAllowed: false,
      evaluationUseFinallyAdjudicated: false },
    privacy: { humanImagesSelected: false,
      rawManifestContainsAbsoluteBuildPaths: true,
      absoluteBuildPathValuesRepublishedInReport: false,
      privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false },
    boundary: { training: 0, network: 0, CEU: 0, authority: 0, action: 0,
      opportunity: 0, delegation: 0, independentOutcome: 0,
      longitudinalOutcome: 0 },
  };
}

export function buildFailbenchLiberoAuditFromSource(sourceDirectory,
  options = {}) {
  const verified = verifyFailbenchLiberoSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const body = buildBody(verified,
    runFailbenchLiberoReplay(sourceDirectory, options));
  return { ...body, artifactHash: failbenchLiberoArtifactHash(body) };
}

function zeroBoundary(value) {
  return plain(value) && ["training", "network", "CEU", "authority", "action",
    "opportunity", "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => value[key] === 0);
}

function expectedReplay() {
  return {
    manifest: { header: ["trial_id", "split", "task", "demo_key", "seed",
      "seed_idx", "bin_idx", "fail_idx", "traj_progress", "failure_mode",
      "failure_joints", "failure_prob", "is_holding", "n_contacts", "h5_path"],
    rows: 15_000, tasks: 10, rowsPerTask: 1_500,
    absoluteBuildPathRows: 15_000 },
    selectedTask: { split: "libero_goal", task: "turn_on_the_stove", trials: 1_500,
      failureModeCounts: { ALL_JOINTS: 119, GRIPPER_OPEN: 351,
        MULTI_JOINT: 128, SINGLE_JOINT: 661, SLIPPERY_GRIP: 241 },
      progressBins: {
        0: { rows: 150, progressMin: 0.0514, progressMax: 0.1347 },
        1: { rows: 150, progressMin: 0.1352, progressMax: 0.2196 },
        2: { rows: 150, progressMin: 0.2215, progressMax: 0.3049 },
        3: { rows: 150, progressMin: 0.3051, progressMax: 0.3887 },
        4: { rows: 150, progressMin: 0.3901, progressMax: 0.4749 },
        5: { rows: 150, progressMin: 0.4754, progressMax: 0.5593 },
        6: { rows: 150, progressMin: 0.5602, progressMax: 0.6447 },
        7: { rows: 150, progressMin: 0.6453, progressMax: 0.7299 },
        8: { rows: 150, progressMin: 0.7307, progressMax: 0.8147 },
        9: { rows: 150, progressMin: 0.8152, progressMax: 0.9 },
      },
      progressMin: 0.0514, progressMax: 0.9, uniqueProgressValues: 1_371,
      demos: 50, seeds: 1_500, manifestDeclaredRawContactRows: 699_167,
      manifestDeclaredZeroContactTrials: 580 },
    targetCache: { derivativeProjectionCache: true, trialGroups: 1_500,
      trialIdsExactlyMatchManifest: true, rootAttributes: [],
      datasetsPerGroup: ["projection"], attributesPerGroup: ["failure_prob"],
      failureModeAttributePresent: false, trajProgressAttributePresent: false,
      projectionDtype: "float32", projectionColumns: 3,
      projectionRows: 391_541, minimumProjectionRowsPerTrial: 0,
      maximumProjectionRowsPerTrial: 4_091,
      nonzeroProjectionTrials: 811, zeroProjectionTrials: 689,
      coordinateBounds: { u: [120.02790832519531, 221.33395385742188],
        v: [75.44967651367188, 163.22894287109375] },
      forceBounds: [1.0001130104064941, 13538.162109375],
      failureProbabilityManifestMatches: true,
      logicalProjectionHash:
        "sha256:a8acdbc6e2e64a1488cbd29b2e555759db5192b19748269b3de09d6dbda5d632",
      allTrialsReadWithH5py: true },
    crosswalk: {
      rawContactToFilteredCache: { "rawPositive|cachePositive": 811,
        "rawPositive|cacheZero": 109, "rawZero|cacheZero": 580 },
      failureModeToCache: {
        ALL_JOINTS: { nonzero: 113, zero: 6 },
        GRIPPER_OPEN: { nonzero: 114, zero: 237 },
        MULTI_JOINT: { nonzero: 87, zero: 41 },
        SINGLE_JOINT: { nonzero: 424, zero: 237 },
        SLIPPERY_GRIP: { nonzero: 73, zero: 168 },
      },
      progressBinToCache: {
        0: { nonzero: 45, projectionRows: 33_788, zero: 105 },
        1: { nonzero: 38, projectionRows: 10_294, zero: 112 },
        2: { nonzero: 50, projectionRows: 16_518, zero: 100 },
        3: { nonzero: 43, projectionRows: 18_121, zero: 107 },
        4: { nonzero: 70, projectionRows: 42_499, zero: 80 },
        5: { nonzero: 98, projectionRows: 71_410, zero: 52 },
        6: { nonzero: 100, projectionRows: 55_370, zero: 50 },
        7: { nonzero: 106, projectionRows: 46_432, zero: 44 },
        8: { nonzero: 128, projectionRows: 44_458, zero: 22 },
        9: { nonzero: 133, projectionRows: 52_651, zero: 17 },
      },
    },
    quarantine: { rows: 346, sourceCounts: { robocasa: 346 },
      liberoRows: 0, selectedTaskRows: 0 },
  };
}

export function verifyFailbenchLiberoAudit(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== FAILBENCH_LIBERO_AUDIT_SCHEMA
      || artifact.frozenAt !== FAILBENCH_LIBERO_FROZEN_AT
      || artifact.status !== "PINNED_FAILBENCH_LIBERO_DERIVED_TARGET_TASK_REPLAY"
      || artifact.admission !== "QUARANTINE_EVAL"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== failbenchLiberoArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (!plain(artifact.source) || artifact.source.id !== FAILBENCH_LIBERO_ID
      || artifact.source.revision !== FAILBENCH_LIBERO_REVISION
      || !HASH.test(artifact.source.sourceManifestHash ?? "")
      || !HASH.test(artifact.source.sourceRoot ?? "")
      || artifact.source.selectedObjects !== 4
      || artifact.source.selectedBytes !== 14_117_155
      || artifact.source.fullTreeHash !== FAILBENCH_LIBERO_TREE_HASH
      || !same(artifact.selection, { split: "libero_goal", task: "turn_on_the_stove",
        selectedBecauseMinimumTargetCacheHdf5ByPinnedTreeBytes: true,
        targetCacheBytes: 10_953_680,
        correspondingRawTaskHdf5Bytes: 5_687_181_286,
        correspondingRawTaskHdf5Selected: false,
        boundedClosureLimitBytes: 300_000_000,
        boundedClosureWithinLimit: true,
        allFiveFailureModesCovered: true, allTenProgressBinsCovered: true })
      || !same(artifact.replay, expectedReplay())
      || !same(artifact.evidenceClass, { liberoSimulation: true,
        publisherDescribesTeleopDemoBase: true, injectedFailureCondition: true,
        contactPredictionTarget: true,
        targetCacheIsDerivedFromFailureInducedFilteredContacts: true,
        realRobotExecution: false, physicalOutcome: false,
        independentOutcome: 0, longitudinalOutcome: 0 })
      || !same(artifact.semantics, {
        failureModeIsInjectedConditionNotObservedTerminalOutcome: true,
        trajProgressIsInjectionPointNotTaskOutcome: true,
        projectionIsDerivedSupervisionTarget: true,
        sourceNativeTerminalSuccessFieldInClosure: false,
        sourceNativeTerminalFailureFieldInClosure: false,
        rawActionStreamInClosure: false, rawStateStreamInClosure: false,
        rawImageStreamInClosure: false, recoveryExecutionInClosure: false })
      || !same(artifact.completeness, {
        completePinnedRecursiveTreeMetadata: true,
        completeSelectedTargetTaskCacheBytes: true,
        completeSelectedSplitManifestBytes: true,
        completePublisherQuarantineLedgerBytes: true,
        completeSelectedPublishedTargetGroupCensus: true,
        selectedPublishedTargetGroups: 1_500, completeRawTaskHdf5: false,
        completeDatasetBytes: false, completeAttemptCensus: false,
        publisherQuarantineContainsNoLiberoRowsAtPin: true,
        noLiberoQuarantineRowsDoesNotProveNoDiscardedGenerationAttempts: true })
      || !same(artifact.rights, { datasetCardClaim: "MIT", readmeClaim: "MIT",
        repositoryLicenseFilePresent: false,
        readmeSaysUnderlyingDemoContentRemainsUnderUpstreamLiberoLicense: true,
        upstreamLiberoLicenseIncludedInClosure: false,
        productionTrainingAllowed: false,
        evaluationUseFinallyAdjudicated: false })
      || !same(artifact.privacy, { humanImagesSelected: false,
        rawManifestContainsAbsoluteBuildPaths: true,
        absoluteBuildPathValuesRepublishedInReport: false,
        privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false })
      || !zeroBoundary(artifact.boundary)) fail("ARTIFACT_BOUNDARY_INVALID");
    return { ok: true, artifactHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyFailbenchLiberoAuditWithSource(artifact,
  sourceDirectory, options = {}) {
  const standalone = verifyFailbenchLiberoAudit(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildFailbenchLiberoAuditFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: rebuilt.source.sourceManifestHash,
      sourceRoot: rebuilt.source.sourceRoot,
      verificationLevel:
        "FULL_FAILBENCH_MANIFEST_TARGET_HDF5_AND_QUARANTINE_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
