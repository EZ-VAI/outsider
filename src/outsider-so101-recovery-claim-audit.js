/*
 * Pinned SO101 recovery-claim audit.
 *
 * The dataset bytes contain 143 complete state/action episodes but no recovery
 * or outcome field.  A separately pinned, publisher-authored model card claims
 * 120 clean plus 23 failure-then-recovery episodes.  This module preserves the
 * claim as provenance, replays every no-video frame, and refuses to turn the
 * count-compatible 23-episode suffix into byte-proven recovery identities.
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

export const SO101_RECOVERY_DATASET_ID =
  "BrutalCaesar/phi_so101_cubes_cylinder_recovery_v1";
export const SO101_RECOVERY_DATASET_REVISION =
  "cf44c0993c77e89629fd1e598088eef8187845c9";
export const SO101_RECOVERY_MODEL_ID =
  "BrutalCaesar/dp_so101_cubcyl_recovery_tp48_lerobot_3cam";
export const SO101_RECOVERY_MODEL_REVISION =
  "ed3a6ce4d293c974d45e619a44bc87821cd5742b";
export const SO101_RECOVERY_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const SO101_RECOVERY_SOURCE_SCHEMA = "outsider/so101-recovery-claim-source/v1";
export const SO101_RECOVERY_AUDIT_SCHEMA = "outsider/so101-recovery-claim-audit/v1";

const DATASET_PATHS = Object.freeze([
  "README.md",
  ...Array.from({ length: 7 }, (_, index) =>
    `data/chunk-000/file-${String(index).padStart(3, "0")}.parquet`),
  "meta/episodes/chunk-000/file-000.parquet",
  "meta/info.json",
  "meta/stats.json",
  "meta/tasks.parquet",
]);

export const SO101_RECOVERY_SOURCES = Object.freeze({
  dataset: Object.freeze({
    key: "dataset", kind: "dataset", id: SO101_RECOVERY_DATASET_ID,
    revision: SO101_RECOVERY_DATASET_REVISION, usedStorage: 1_286_367_869,
    cardLicense: "apache-2.0", repositoryPaths: 34, treeEntries: 46,
    treeFiles: 34, treeBytes: 1_286_396_423,
    selectedPaths: DATASET_PATHS, selectedBytes: 2_931_914,
    repositoryProjectionHash:
      "sha256:75051a49fde97089854471010d06539a9d6dd3c61b995ccad0c1262c9e4a8c4c",
    treeProjectionHash:
      "sha256:78ba3bb6299136fa72116d05fe659edcab20f319833cc692f0bc6d43571942c7",
  }),
  modelCard: Object.freeze({
    key: "model-card", kind: "model", id: SO101_RECOVERY_MODEL_ID,
    revision: SO101_RECOVERY_MODEL_REVISION, usedStorage: 409_222_264,
    cardLicense: "apache-2.0", repositoryPaths: 9, treeEntries: 9,
    treeFiles: 9, treeBytes: 409_246_611,
    selectedPaths: Object.freeze(["README.md"]), selectedBytes: 8_365,
    repositoryProjectionHash:
      "sha256:9e23bf13b2eb789249bd5cde34f8ddacc0c77ede38a0795b6d515569ff2565c2",
    treeProjectionHash:
      "sha256:2d4d4ef841465c531fea988a9480469f6f3480de49f867de0364ca272d730e00",
  }),
});

export const SO101_RECOVERY_PROFILE = Object.freeze({
  selectedObjects: 13,
  selectedBytes: 2_940_279,
  datasetObjects: 12,
  modelCardObjects: 1,
  episodes: 143,
  frames: 81_943,
  tasks: 1,
  dataFiles: 7,
  stateDimensions: 6,
  actionDimensions: 6,
  fps: 30,
  publisherClaimCleanEpisodes: 120,
  publisherClaimFailureThenRecoveryEpisodes: 23,
  countCompatibleSuffixStartEpisode: 120,
  countCompatibleSuffixFrames: 15_070,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const MAX_API_BYTES = 8 * 1024 * 1024;
const MAX_OBJECT_BYTES = 2 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail == null ? `SO101_RECOVERY_${code}`
    : `SO101_RECOVERY_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function so101RecoverySha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return so101RecoverySha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
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

function sourceProfiles() {
  return [SO101_RECOVERY_SOURCES.dataset, SO101_RECOVERY_SOURCES.modelCard];
}

function urls(profile) {
  const encoded = profile.id.split("/").map(encodeURIComponent).join("/");
  const apiKind = profile.kind === "dataset" ? "datasets" : "models";
  const rawPrefix = profile.kind === "dataset" ? `datasets/${encoded}` : encoded;
  return {
    repository: `${HF}/api/${apiKind}/${encoded}/revision/${profile.revision}`,
    tree: `${HF}/api/${apiKind}/${encoded}/tree/${profile.revision}?recursive=true&limit=1000`,
    rawBase: `${HF}/${rawPrefix}/resolve/${profile.revision}`,
  };
}

function repositoryProjection(metadata) {
  if (!plain(metadata) || !Array.isArray(metadata.siblings)) {
    fail("REPOSITORY_METADATA_INVALID");
  }
  const siblingPaths = metadata.siblings.map((entry) => entry?.rfilename).sort();
  if (siblingPaths.some((entry) => !safeRemotePath(entry))
    || new Set(siblingPaths).size !== siblingPaths.length) fail("REPOSITORY_PATHS_INVALID");
  return {
    id: metadata.id, sha: metadata.sha, private: metadata.private,
    gated: metadata.gated, disabled: metadata.disabled,
    usedStorage: metadata.usedStorage, cardLicense: metadata.cardData?.license ?? null,
    siblingPaths,
  };
}

function validateRepository(profile, metadata) {
  const projected = repositoryProjection(metadata);
  if (projected.id !== profile.id || projected.sha !== profile.revision
    || projected.private !== false || projected.gated !== false
    || projected.disabled !== false || projected.usedStorage !== profile.usedStorage
    || projected.cardLicense !== profile.cardLicense
    || projected.siblingPaths.length !== profile.repositoryPaths
    || digest("outsider/brutal-repository-projection/v1", projected)
      !== profile.repositoryProjectionHash) fail("REPOSITORY_PROFILE_INVALID", profile.key);
  return projected;
}

function treeEntry(entry) {
  if (!plain(entry) || !safeRemotePath(entry.path)
    || !["file", "directory"].includes(entry.type)
    || !SHA1.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
  if (entry.type === "directory") {
    if (entry.size !== 0) fail("TREE_DIRECTORY_SIZE_INVALID", entry.path);
    return { path: entry.path, type: "directory", oid: entry.oid,
      sizeBytes: 0, lfsSha256: null, lfsBytes: null };
  }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0) fail("TREE_FILE_SIZE_INVALID");
  if (entry.lfs == null) return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: null, lfsBytes: null };
  if (!plain(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
    || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
  return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: `sha256:${entry.lfs.oid}`,
    lfsBytes: entry.lfs.size };
}

function validateTree(profile, raw) {
  if (!Array.isArray(raw)) fail("TREE_INVALID");
  const projection = raw.map(treeEntry)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(projection.map((entry) => entry.path)).size !== projection.length) {
    fail("TREE_DUPLICATE_PATH");
  }
  const files = projection.filter((entry) => entry.type === "file");
  const selected = profile.selectedPaths.map((remotePath) => {
    const found = files.find((entry) => entry.path === remotePath);
    if (!found) fail("SELECTED_PATH_MISSING", `${profile.key}:${remotePath}`);
    return found;
  });
  if (projection.length !== profile.treeEntries || files.length !== profile.treeFiles
    || files.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== profile.treeBytes
    || selected.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== profile.selectedBytes
    || digest("outsider/brutal-tree-projection/v1", projection)
      !== profile.treeProjectionHash) fail("TREE_PROFILE_INVALID", profile.key);
  return { projection, selected };
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
  const timer = setTimeout(() => controller.abort(), 30_000);
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
      contentType: response.headers?.get?.("content-type") ?? null };
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

async function fetchJson(url, fetchImpl) {
  const fetched = await boundedFetch(url, MAX_API_BYTES, fetchImpl);
  return { ...fetched, value: parseJson(fetched.bytes, url) };
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function safeJoin(root, relativePath) {
  if (!safeRemotePath(relativePath)) fail("LOCAL_PATH_UNSAFE", relativePath);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(path.resolve(root), target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("LOCAL_PATH_ESCAPE", relativePath);
  return target;
}

function writePrivateOnce(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  const fd = openSync(file, fsConstants.O_CREAT | fsConstants.O_EXCL
    | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fchmodSync(fd, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(fd, bytes, offset);
    if (!fstatSync(fd).isFile() || fstatSync(fd).size !== bytes.length) {
      fail("WRITE_VERIFY_FAILED", file);
    }
  } finally { closeSync(fd); }
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

async function mapConcurrent(values, concurrency, operation) {
  const result = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await operation(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return result;
}

function snapshotPath(phase, profile, kind) {
  return `api/${phase}/${profile.key}-${kind}.json`;
}

function snapshotDescriptor(phase, profile, kind, requestUrl, fetched, file) {
  return { phase, sourceKey: profile.key, kind, requestUrl,
    finalUrl: fetched.finalUrl, status: fetched.status,
    contentType: fetched.contentType, file, bytes: fetched.bytes.length,
    sha256: so101RecoverySha256(fetched.bytes) };
}

async function capturePhase(root, phase, fetchImpl) {
  const groups = await mapConcurrent(sourceProfiles(), 2, async (profile) => {
    const endpoint = urls(profile);
    const [repository, tree] = await Promise.all([
      fetchJson(endpoint.repository, fetchImpl), fetchJson(endpoint.tree, fetchImpl),
    ]);
    validateRepository(profile, repository.value);
    validateTree(profile, tree.value);
    const repositoryFile = snapshotPath(phase, profile, "repository");
    const treeFile = snapshotPath(phase, profile, "tree");
    writePrivateOnce(safeJoin(root, repositoryFile), repository.bytes);
    writePrivateOnce(safeJoin(root, treeFile), tree.bytes);
    return {
      descriptors: [snapshotDescriptor(phase, profile, "repository",
        endpoint.repository, repository, repositoryFile),
      snapshotDescriptor(phase, profile, "tree", endpoint.tree, tree, treeFile)],
      repository: repository.value, tree: tree.value,
    };
  });
  const values = {};
  for (const group of groups) values[group.descriptors[0].sourceKey] = group;
  return { descriptors: groups.flatMap((group) => group.descriptors)
    .sort((left, right) => left.file.localeCompare(right.file)), values };
}

async function downloadObject(root, profile, entry, fetchImpl) {
  const url = `${urls(profile).rawBase}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const fetched = await boundedFetch(url,
    Math.min(MAX_OBJECT_BYTES, entry.sizeBytes + 1), fetchImpl);
  if (fetched.bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_INVALID", entry.path);
  const sha256 = so101RecoverySha256(fetched.bytes);
  if (entry.lfsSha256 !== null ? sha256 !== entry.lfsSha256
    : gitBlobOid(fetched.bytes) !== entry.oid) fail("OBJECT_HASH_INVALID", entry.path);
  const file = `objects/${profile.key}/${entry.path}`;
  writePrivateOnce(safeJoin(root, file), fetched.bytes);
  return { sourceKey: profile.key, sourceKind: profile.kind,
    sourceId: profile.id, revision: profile.revision, path: entry.path, file,
    requestUrl: url, finalUrl: fetched.finalUrl, status: fetched.status,
    contentType: fetched.contentType, bytes: fetched.bytes.length, sha256,
    gitOid: entry.oid, lfsSha256: entry.lfsSha256 };
}

function sourceRoot(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots, ...remoteObjects].map((entry) => ({
    file: entry.file, bytes: entry.bytes, sha256: entry.sha256,
  })).sort((left, right) => left.file.localeCompare(right.file));
  return { files, hash: digest("outsider/so101-recovery-source-root/v1", files) };
}

export async function acquirePinnedSo101RecoverySource(sourceDirectory, options = {}) {
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
    const selections = [];
    for (const profile of sourceProfiles()) {
      for (const entry of validateTree(profile, before.values[profile.key].tree).selected) {
        selections.push({ profile, entry });
      }
    }
    const remoteObjects = (await mapConcurrent(selections, 6,
      ({ profile, entry }) => downloadObject(temporary, profile, entry, fetchImpl)))
      .sort((left, right) => left.file.localeCompare(right.file));
    const after = await capturePhase(temporary, "after", fetchImpl);
    for (const profile of sourceProfiles()) {
      if (!same(validateRepository(profile, before.values[profile.key].repository),
        validateRepository(profile, after.values[profile.key].repository))
        || !same(validateTree(profile, before.values[profile.key].tree).projection,
          validateTree(profile, after.values[profile.key].tree).projection)) {
        fail("SOURCE_CHANGED_DURING_ACQUISITION", profile.key);
      }
    }
    const apiSnapshots = [...before.descriptors, ...after.descriptors]
      .sort((left, right) => left.file.localeCompare(right.file));
    if (remoteObjects.length !== 13
      || remoteObjects.reduce((sum, entry) => sum + entry.bytes, 0) !== 2_940_279
      || remoteObjects.some((entry) => /\.(?:mp4|safetensors)$/iu.test(entry.path))) {
      fail("SOURCE_CLOSURE_INVALID");
    }
    const rooted = sourceRoot(apiSnapshots, remoteObjects);
    const body = {
      schema: SO101_RECOVERY_SOURCE_SCHEMA, frozenAt: SO101_RECOVERY_FROZEN_AT,
      apiSnapshots, remoteObjects, sourceFiles: rooted.files, sourceRoot: rooted.hash,
      closure: { selectedObjects: 13, selectedBytes: 2_940_279,
        datasetNoVideoComplete: true, modelCardReadmeOnly: true,
        videosSelected: 0, modelWeightsSelected: 0 },
    };
    const manifest = { ...body,
      manifestHash: digest("outsider/so101-recovery-source-manifest/v1", body) };
    writePrivateOnce(path.join(temporary, "acquisition-manifest.json"),
      canonicalBytes(manifest));
    enforcePrivateTree(temporary);
    renameSync(temporary, sourceDirectory);
    chmodSync(sourceDirectory, 0o700);
    return { sourceDirectory, manifest };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function readRegular(file, expectedBytes = null) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) fail("FILE_UNSAFE", file);
  const bytes = readFileSync(file);
  if (expectedBytes !== null && bytes.length !== expectedBytes) fail("FILE_SIZE_INVALID", file);
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

function snapshotValue(root, manifest, phase, profile, kind) {
  const descriptor = manifest.apiSnapshots.find((entry) => entry.phase === phase
    && entry.sourceKey === profile.key && entry.kind === kind);
  if (!descriptor) fail("SNAPSHOT_MISSING", `${phase}:${profile.key}:${kind}`);
  const bytes = readRegular(safeJoin(root, descriptor.file), descriptor.bytes);
  if (so101RecoverySha256(bytes) !== descriptor.sha256) fail("SNAPSHOT_HASH_INVALID");
  return parseJson(bytes, descriptor.file);
}

export function verifySo101RecoverySourceDirectory(sourceDirectory) {
  try {
    const manifestBytes = readRegular(path.join(sourceDirectory, "acquisition-manifest.json"));
    const manifest = parseJson(manifestBytes, "manifest");
    if (!plain(manifest) || manifest.schema !== SO101_RECOVERY_SOURCE_SCHEMA
      || manifest.frozenAt !== SO101_RECOVERY_FROZEN_AT
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 8
      || !Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 13
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")) {
      fail("MANIFEST_SHAPE_INVALID");
    }
    const trees = {};
    for (const profile of sourceProfiles()) {
      const beforeRepository = validateRepository(profile,
        snapshotValue(sourceDirectory, manifest, "before", profile, "repository"));
      const afterRepository = validateRepository(profile,
        snapshotValue(sourceDirectory, manifest, "after", profile, "repository"));
      const beforeTree = validateTree(profile,
        snapshotValue(sourceDirectory, manifest, "before", profile, "tree"));
      const afterTree = validateTree(profile,
        snapshotValue(sourceDirectory, manifest, "after", profile, "tree"));
      if (!same(beforeRepository, afterRepository)
        || !same(beforeTree.projection, afterTree.projection)) fail("SNAPSHOT_DRIFT");
      trees[profile.key] = beforeTree;
    }
    const expectedKeys = sourceProfiles().flatMap((profile) =>
      trees[profile.key].selected.map((entry) => `${profile.key}\0${entry.path}`)).sort();
    const actualKeys = manifest.remoteObjects.map((entry) =>
      `${entry.sourceKey}\0${entry.path}`).sort();
    if (!same(expectedKeys, actualKeys)) fail("REMOTE_SET_INVALID");
    for (const descriptor of manifest.remoteObjects) {
      const profile = sourceProfiles().find((entry) => entry.key === descriptor.sourceKey);
      const entry = trees[profile?.key]?.selected.find((item) => item.path === descriptor.path);
      if (!profile || !entry || descriptor.sourceKind !== profile.kind
        || descriptor.sourceId !== profile.id || descriptor.revision !== profile.revision
        || descriptor.file !== `objects/${profile.key}/${entry.path}`
        || descriptor.bytes !== entry.sizeBytes || descriptor.gitOid !== entry.oid
        || descriptor.lfsSha256 !== entry.lfsSha256 || !HASH.test(descriptor.sha256 ?? "")) {
        fail("REMOTE_DESCRIPTOR_INVALID");
      }
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      if (so101RecoverySha256(bytes) !== descriptor.sha256
        || (entry.lfsSha256 !== null ? descriptor.sha256 !== entry.lfsSha256
          : gitBlobOid(bytes) !== entry.oid)) fail("REMOTE_HASH_INVALID", descriptor.file);
    }
    const rooted = sourceRoot(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles) || rooted.hash !== manifest.sourceRoot) {
      fail("SOURCE_ROOT_INVALID");
    }
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"].sort((left, right) => left.localeCompare(right));
    if (!same(walk(sourceDirectory), expectedFiles)) fail("SOURCE_FILE_CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/so101-recovery-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    return { ok: true, manifest, trees,
      verificationLevel: "PINNED_DATASET_NO_VIDEO_AND_PINNED_MODEL_CARD_SUPPORT" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import json, os, sys
import pyarrow as pa
import pyarrow.parquet as pq

root = sys.argv[1]
base = os.path.join(root, "objects", "dataset")

def die(code):
    raise RuntimeError("SO101_RECOVERY_PYARROW_" + code)

def p(rel):
    return os.path.join(base, *rel.split("/"))

with open(p("meta/info.json"), "r", encoding="utf-8") as handle:
    info = json.load(handle)
parts = [pq.read_table(p("data/chunk-000/file-%03d.parquet" % index)) for index in range(7)]
rows_per_file = [part.num_rows for part in parts]
data = pa.concat_tables(parts)
episodes = pq.read_table(p("meta/episodes/chunk-000/file-000.parquet"))
tasks = pq.read_table(p("meta/tasks.parquet"))
expected_columns = ["action", "observation.state", "timestamp", "frame_index",
                    "episode_index", "index", "task_index"]
if info.get("total_episodes") != 143 or info.get("total_frames") != 81943 \
   or info.get("total_tasks") != 1 or info.get("fps") != 30 \
   or data.num_rows != 81943 or episodes.num_rows != 143 or tasks.num_rows != 1:
    die("PROFILE")
if any(part.column_names != expected_columns for part in parts):
    die("COLUMNS")
if tasks.to_pylist() != [{"task_index": 0,
    "task": "pick up the cubes/cylinder and place it in the box"}]:
    die("TASK")
values = {name: data[name].to_pylist() for name in expected_columns}
if values["index"] != list(range(81943)):
    die("GLOBAL_INDEX")
if any(len(item) != 6 for item in values["action"] + values["observation.state"]):
    die("DIMENSIONS")
ep = episodes.select(["episode_index", "length", "data/file_index",
                      "dataset_from_index", "dataset_to_index"]).to_pylist()
if [row["episode_index"] for row in ep] != list(range(143)):
    die("EPISODE_INDEX")
cursor = 0
for row in ep:
    stop = cursor + row["length"]
    if row["dataset_from_index"] != cursor or row["dataset_to_index"] != stop \
       or values["episode_index"][cursor:stop] != [row["episode_index"]] * row["length"] \
       or values["frame_index"][cursor:stop] != list(range(row["length"])):
        die("EPISODE_ALIGNMENT")
    if any(abs(float(values["timestamp"][cursor + i]) - i / 30) > 0.00001
           for i in range(row["length"])):
        die("TIMESTAMP")
    cursor = stop
if cursor != 81943:
    die("FRAME_SUM")

feature_names = set(info.get("features", {}).keys())
for forbidden in ["recovery", "is_recovery", "failure", "success", "reward",
                  "next.reward", "done", "next.done", "is_intervention"]:
    if forbidden in feature_names or forbidden in data.column_names:
        die("UNEXPECTED_SEMANTIC_FIELD")

file_groups = []
for file_index in range(7):
    group = [row for row in ep if row["data/file_index"] == file_index]
    file_groups.append({"fileIndex": file_index,
        "firstEpisode": group[0]["episode_index"],
        "lastEpisode": group[-1]["episode_index"],
        "frames": sum(row["length"] for row in group),
        "physicalRows": rows_per_file[file_index]})
    if file_groups[-1]["frames"] != rows_per_file[file_index]:
        die("FILE_GROUP_ALIGNMENT")

first = [row["length"] for row in ep[:120]]
suffix = [row["length"] for row in ep[120:]]
if sum(first) != 66873 or sum(suffix) != 15070 or ep[119]["dataset_to_index"] != 66873 \
   or ep[120]["dataset_from_index"] != 66873 \
   or file_groups[4]["lastEpisode"] != 119 or file_groups[5]["firstEpisode"] != 120:
    die("COUNT_COMPATIBLE_SUFFIX")

out = {
  "episodes": 143, "frames": 81943, "tasks": 1, "fps": 30,
  "stateDimensions": 6, "actionDimensions": 6,
  "dataFiles": 7, "rowsPerDataFile": rows_per_file,
  "fileEpisodeGroups": file_groups,
  "episodeAndFrameContinuity": True,
  "metadataAligned": True,
  "semanticFields": {
    "recovery": False, "failure": False, "success": False,
    "reward": False, "done": False, "isIntervention": False,
  },
  "countCompatiblePartition": {
    "prefix": {"episodeStart": 0, "episodeEndInclusive": 119,
               "episodes": 120, "frames": 66873,
               "minimumFrames": min(first), "maximumFrames": max(first)},
    "suffix": {"episodeStart": 120, "episodeEndInclusive": 142,
               "episodes": 23, "frames": 15070,
               "minimumFrames": min(suffix), "maximumFrames": max(suffix)},
    "suffixStartsAtPhysicalDataFileBoundary": True,
  },
}
print(json.dumps(out, sort_keys=True, separators=(",", ":")))
`;

export function runSo101RecoveryPyarrowReplay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const result = spawnSync(python, ["-c", PYARROW_REPLAY, path.resolve(sourceDirectory)],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) fail("PYARROW_EXEC_FAILED", result.error.message);
  if (result.status !== 0) fail("PYARROW_REPLAY_FAILED",
    String(result.stderr || result.stdout).trim());
  const replay = parseJson(Buffer.from(result.stdout, "utf8"), "PYARROW_REPLAY");
  if (replay?.episodes !== 143 || replay?.frames !== 81_943
    || replay?.countCompatiblePartition?.suffix?.episodes !== 23
    || replay?.semanticFields?.recovery !== false) fail("PYARROW_RESULT_INVALID");
  return replay;
}

function objectPath(sourceDirectory, key, remotePath) {
  return path.join(sourceDirectory, "objects", key, ...remotePath.split("/"));
}

function inspectPublisherCards(sourceDirectory) {
  const dataset = readRegular(objectPath(sourceDirectory, "dataset", "README.md"))
    .toString("utf8");
  const model = readRegular(objectPath(sourceDirectory, "model-card", "README.md"))
    .toString("utf8");
  if (!dataset.includes('"total_episodes": 143')
    || !dataset.includes('"total_frames": 81943')
    || /120 clean|failure-then-recovery/iu.test(dataset)
    || !model.includes("143 episodes / 81,943 frames")
    || !model.includes("120 clean + 23 failure-then-recovery")
    || !model.includes("All 23 recovery episodes in training")
    || !model.includes("30-episode holdout is clean-only")
    || !model.includes("Not scored on the arm")
    || !model.includes(SO101_RECOVERY_DATASET_ID)) fail("PUBLISHER_CARD_CLAIMS_INVALID");
  return {
    datasetCardContainsRecoveryClaim: false,
    modelCardLinksExactDatasetId: true,
    modelCardClaimsCleanEpisodes: 120,
    modelCardClaimsFailureThenRecoveryEpisodes: 23,
    modelCardClaimsAllRecoveryInTraining: true,
    modelCardClaims30EpisodeHoldoutCleanOnly: true,
    modelCardStatesNotScoredOnArm: true,
  };
}

export function so101RecoveryArtifactHash(body) {
  return digest("outsider/so101-recovery-claim-audit/v1", body);
}

function artifactBody(verified, replay, publisher) {
  return {
    schema: SO101_RECOVERY_AUDIT_SCHEMA,
    frozenAt: SO101_RECOVERY_FROZEN_AT,
    status: "PINNED_SO101_NO_VIDEO_REPLAY_WITH_SEPARATE_RECOVERY_CLAIM",
    admission: "ACQUIRED_EVAL_ONLY",
    source: {
      dataset: { id: SO101_RECOVERY_DATASET_ID,
        revision: SO101_RECOVERY_DATASET_REVISION },
      publisherModelCard: { id: SO101_RECOVERY_MODEL_ID,
        revision: SO101_RECOVERY_MODEL_REVISION },
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      selectedObjects: 13,
      selectedBytes: 2_940_279,
    },
    replay,
    publisher,
    recoveryClaimConclusion: {
      publisherClaimCountsCloseAgainst143Episodes: true,
      countCompatibleContiguousSuffixExists: true,
      countCompatibleSuffixEpisodes: [120, 142],
      suffixSeparatedAtPhysicalDataFileBoundary: true,
      recoveryFieldPresentInDatasetBytes: false,
      recoveryEpisodeIdentitiesByteProven: false,
      suffixClassifiedAsRecoveryByThisAudit: false,
      modelCardClaimPromotedToSourceNativeLabel: false,
    },
    outcome: {
      datasetOutcomeLabelsPresent: false,
      modelOnArmSuccessRatePresent: false,
      independentOutcome: 0,
      longitudinalOutcome: 0,
    },
    recovery: {
      publisherAggregateClaimAvailable: true,
      byteNativeRecoveryMarkerAvailable: false,
      pairedFailureToRecoveryBoundaryAvailable: false,
      completeAttemptCensus: false,
      upstreamDiscardedAttemptsUnknown: true,
    },
    completeness: {
      completePinnedDatasetDataAndMetadata: true,
      complete143EpisodeStateActionReplay: true,
      pinnedPublisherModelCardSupport: true,
      modelWeightsAcquired: false,
      videosAcquired: false,
      visualReplay: false,
    },
    rights: {
      datasetCardClaim: "Apache-2.0",
      modelCardClaim: "Apache-2.0",
      repositoryLicenseFilesPresent: false,
      productionTrainingRightFinallyAdjudicated: false,
    },
    privacy: {
      videosAcquired: false,
      privacyReviewComplete: false,
      noPersonalInformationGuarantee: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    boundary: {
      training: 0, network: 0, CEU: 0, authority: 0, action: 0,
      opportunity: 0, delegation: 0, independentOutcome: 0,
      longitudinalOutcome: 0,
    },
  };
}

export function buildSo101RecoveryClaimAuditFromSource(sourceDirectory, options = {}) {
  const verified = verifySo101RecoverySourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runSo101RecoveryPyarrowReplay(sourceDirectory, options);
  const publisher = inspectPublisherCards(sourceDirectory);
  const body = artifactBody(verified, replay, publisher);
  return { ...body, artifactHash: so101RecoveryArtifactHash(body) };
}

function zeroBoundary(value) {
  return plain(value) && ["training", "network", "CEU", "authority", "action",
    "opportunity", "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => value[key] === 0);
}

export function verifySo101RecoveryClaimAudit(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== SO101_RECOVERY_AUDIT_SCHEMA
      || artifact.frozenAt !== SO101_RECOVERY_FROZEN_AT
      || artifact.status !== "PINNED_SO101_NO_VIDEO_REPLAY_WITH_SEPARATE_RECOVERY_CLAIM"
      || artifact.admission !== "ACQUIRED_EVAL_ONLY" || !HASH.test(artifact.artifactHash ?? "")) {
      fail("ARTIFACT_SHAPE_INVALID");
    }
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== so101RecoveryArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.selectedObjects !== 13 || artifact.source?.selectedBytes !== 2_940_279
      || artifact.replay?.episodes !== 143 || artifact.replay?.frames !== 81_943
      || artifact.replay?.dataFiles !== 7 || artifact.replay?.stateDimensions !== 6
      || artifact.replay?.actionDimensions !== 6
      || artifact.replay?.countCompatiblePartition?.prefix?.frames !== 66_873
      || artifact.replay?.countCompatiblePartition?.suffix?.frames !== 15_070
      || artifact.replay?.countCompatiblePartition?.suffix?.episodes !== 23
      || artifact.publisher?.modelCardClaimsCleanEpisodes !== 120
      || artifact.publisher?.modelCardClaimsFailureThenRecoveryEpisodes !== 23) {
      fail("ARTIFACT_COUNTS_INVALID");
    }
    const conclusion = artifact.recoveryClaimConclusion;
    if (conclusion?.publisherClaimCountsCloseAgainst143Episodes !== true
      || conclusion?.countCompatibleContiguousSuffixExists !== true
      || conclusion?.recoveryFieldPresentInDatasetBytes !== false
      || conclusion?.recoveryEpisodeIdentitiesByteProven !== false
      || conclusion?.suffixClassifiedAsRecoveryByThisAudit !== false
      || conclusion?.modelCardClaimPromotedToSourceNativeLabel !== false
      || artifact.outcome?.datasetOutcomeLabelsPresent !== false
      || artifact.outcome?.independentOutcome !== 0
      || artifact.recovery?.byteNativeRecoveryMarkerAvailable !== false
      || artifact.recovery?.pairedFailureToRecoveryBoundaryAvailable !== false
      || artifact.recovery?.completeAttemptCensus !== false
      || artifact.completeness?.modelWeightsAcquired !== false
      || artifact.completeness?.videosAcquired !== false
      || artifact.completeness?.visualReplay !== false
      || artifact.rights?.productionTrainingRightFinallyAdjudicated !== false
      || artifact.privacy?.privacyReviewComplete !== false
      || !zeroBoundary(artifact.boundary)) fail("ARTIFACT_BOUNDARY_INVALID");
    return { ok: true, artifactHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifySo101RecoveryClaimAuditWithSource(artifact,
  sourceDirectory, options = {}) {
  const standalone = verifySo101RecoveryClaimAudit(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildSo101RecoveryClaimAuditFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: rebuilt.source.sourceManifestHash,
      sourceRoot: rebuilt.source.sourceRoot,
      verificationLevel: "FULL_DATASET_NO_VIDEO_AND_PINNED_MODEL_CARD_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

