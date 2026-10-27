/*
 * Frozen, no-video ArmnetBench v0.1 SO-101 outcome/state intake.
 *
 * This module acquires and replays publisher-native robot state, action,
 * terminal reward, done, and episode outcome labels.  It deliberately does
 * not fetch or replay video, infer missing attempts, establish independent or
 * longitudinal outcomes, authorize training, dispatch actions, set CEU, or
 * expand delegation.
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

export const ARMNETBENCH_SO101_DATASET_ID =
  "armnet/armnetbench_v01_lerobot_so101";
export const ARMNETBENCH_SO101_REVISION =
  "2e5e89aee0e7f081078d9d6ab3b279fc4b83ea84";
export const ARMNETBENCH_SO101_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const ARMNETBENCH_SO101_SOURCE_MANIFEST_SCHEMA =
  "outsider/armnetbench-so101-pinned-source/v1";
export const ARMNETBENCH_SO101_OUTCOME_SCHEMA =
  "outsider/armnetbench-so101-outcome-state/v1";
export const ARMNETBENCH_SO101_EXPECTED_SOURCE_ROOT =
  "sha256:4e9e37cb909456d898a6fdfe137680ba39e55a4b70ca07f29be4e483c41e04c7";
export const ARMNETBENCH_SO101_EXPECTED_TREE_PROJECTION_HASH =
  "sha256:e5535e7ff377027643be6f612c44b209b0b02bf7b6826c72cab52c7538469b88";

export const ARMNETBENCH_SO101_PROFILE = Object.freeze({
  selectedObjects: 125,
  selectedBytes: 57_660_573,
  dataFiles: 120,
  dataBytes: 53_757_034,
  metadataFiles: 4,
  metadataBytes: 3_890_685,
  readmeFiles: 1,
  readmeBytes: 12_854,
  episodes: 2_499,
  frames: 1_127_881,
  outcomes: Object.freeze({ successful: 915, failure: 1_532, suboptimal: 52 }),
  tasks: 8,
  evaluationPolicyFamilies: 7,
  stateDimensions: 6,
  actionDimensions: 6,
});

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${ARMNETBENCH_SO101_DATASET_ID}`;
const TREE_PATH = `/api/datasets/${ARMNETBENCH_SO101_DATASET_ID}/tree/${ARMNETBENCH_SO101_REVISION}`;
const RAW_ROOT = `${HF_ORIGIN}/datasets/${ARMNETBENCH_SO101_DATASET_ID}/resolve/${ARMNETBENCH_SO101_REVISION}`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const SAFE_PATH = /^(README\.md|data\/chunk-000\/file-(?:0[0-9]{2}|1[01][0-9])\.parquet|meta\/(?:info\.json|stats\.json|tasks\.parquet|episodes\/chunk-000\/file-000\.parquet))$/u;
const DATA_PATH = /^data\/chunk-000\/file-(?:0[0-9]{2}|1[01][0-9])\.parquet$/u;
const META_PATH = /^meta\/(?:info\.json|stats\.json|tasks\.parquet|episodes\/chunk-000\/file-000\.parquet)$/u;
const API_CAPTURE_PATH = /^control\/(?:repository-(?:before|after)\.json|tree-(?:before|after)-page-[0-9]{3}\.json)$/u;
const MAX_API_BYTES = 8 * 1024 * 1024;
const MAX_TREE_PAGES = 20;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail == null ? `ARMNETBENCH_SO101_${code}`
    : `ARMNETBENCH_SO101_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

export function armnetBenchSo101Sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return armnetBenchSo101Sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
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
  if (!plain(metadata) || metadata.id !== ARMNETBENCH_SO101_DATASET_ID
    || metadata.sha !== ARMNETBENCH_SO101_REVISION || metadata.private !== false
    || metadata.gated !== false || metadata.disabled !== false
    || String(metadata.cardData?.license ?? "").toLowerCase() !== "apache-2.0") {
    fail("REPOSITORY_METADATA_INVALID");
  }
  return {
    datasetId: ARMNETBENCH_SO101_DATASET_ID,
    revision: ARMNETBENCH_SO101_REVISION,
    private: false,
    gated: false,
    disabled: false,
    hfCardLicenseClaim: "Apache-2.0",
    lastModified: typeof metadata.lastModified === "string" ? metadata.lastModified : null,
  };
}

function treeEntryProjection(entry) {
  if (!plain(entry) || !safeRemotePath(entry.path)
    || !["file", "directory"].includes(entry.type)
    || !SHA1.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
  if (entry.type === "directory") {
    if (entry.size !== 0) fail("TREE_DIRECTORY_SIZE_INVALID", entry.path);
    return { path: entry.path, type: "directory", oid: entry.oid, sizeBytes: 0,
      lfsSha256: null, lfsBytes: null };
  }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
    fail("TREE_FILE_SIZE_INVALID", entry.path);
  }
  if (entry.lfs == null) {
    return { path: entry.path, type: "file", oid: entry.oid, sizeBytes: entry.size,
      lfsSha256: null, lfsBytes: null };
  }
  if (!plain(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
    || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
  return { path: entry.path, type: "file", oid: entry.oid, sizeBytes: entry.size,
    lfsSha256: `sha256:${entry.lfs.oid}`, lfsBytes: entry.lfs.size };
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

function parseNextTreeLink(header) {
  if (header == null || header === "") return null;
  const next = String(header).split(",")
    .find((piece) => /;\s*rel="next"\s*$/iu.test(piece.trim()));
  if (!next) return null;
  const matched = /^\s*<([^>]+)>/u.exec(next);
  if (!matched) fail("TREE_NEXT_LINK_INVALID");
  const parsed = new URL(matched[1]);
  if (parsed.origin !== HF_ORIGIN || parsed.pathname !== TREE_PATH
    || parsed.searchParams.get("recursive") !== "true"
    || parsed.searchParams.get("expand") !== "true"
    || !parsed.searchParams.get("cursor")) fail("TREE_NEXT_LINK_UNSAFE");
  return parsed.toString();
}

function permittedFinalUrl(value) {
  const parsed = new URL(value);
  return parsed.protocol === "https:" && parsed.username === "" && parsed.password === ""
    && (parsed.hostname === "huggingface.co"
      || parsed.hostname === "us.aws.cdn.hf.co"
      || parsed.hostname.endsWith(".xethub.hf.co"));
}

async function boundedFetch(url, maximumBytes, fetchImpl) {
  const requested = new URL(url);
  if (requested.protocol !== "https:" || requested.hostname !== "huggingface.co"
    || requested.username !== "" || requested.password !== "") fail("FETCH_URL_UNSAFE", url);
  const response = await fetchImpl(requested, { redirect: "follow", headers: {
    accept: "application/json, application/octet-stream;q=0.9, text/plain;q=0.8",
    "user-agent": "outsider-armnetbench-so101-outcome/1.0",
  }, signal: AbortSignal.timeout(180_000) });
  if (!response?.ok || !response.body) fail(`FETCH_${response?.status ?? "FAILED"}`, url);
  if (!permittedFinalUrl(response.url || url)) fail("FETCH_REDIRECT_UNSAFE", response.url);
  const declared = response.headers?.get?.("content-length");
  if (declared != null && (!/^[0-9]+$/u.test(declared)
    || Number(declared) > maximumBytes)) fail("FETCH_DECLARED_SIZE_INVALID", url);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
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

async function jsonFetch(url, maximumBytes, fetchImpl) {
  const fetched = await boundedFetch(url, maximumBytes, fetchImpl);
  let value;
  try { value = JSON.parse(fetched.bytes.toString("utf8")); }
  catch { fail("FETCH_JSON_INVALID", url); }
  return { ...fetched, value };
}

async function fetchRepositorySnapshot(phase, fetchImpl) {
  const fetched = await jsonFetch(HF_API, MAX_API_BYTES, fetchImpl);
  return { phase, url: HF_API, bytes: fetched.bytes,
    projection: repositoryProjection(fetched.value) };
}

async function fetchTreeSnapshot(phase, fetchImpl) {
  const pages = [];
  const entries = [];
  const seen = new Set();
  let next = `${HF_API}/tree/${ARMNETBENCH_SO101_REVISION}?recursive=true&expand=true`;
  while (next !== null) {
    if (seen.has(next) || pages.length >= MAX_TREE_PAGES) fail("TREE_PAGINATION_INVALID");
    seen.add(next);
    const fetched = await jsonFetch(next, MAX_API_BYTES, fetchImpl);
    if (!Array.isArray(fetched.value) || fetched.value.length < 1) {
      fail("TREE_PAGE_INVALID", String(pages.length));
    }
    pages.push({ phase, pageIndex: pages.length, url: next, bytes: fetched.bytes });
    entries.push(...fetched.value);
    next = parseNextTreeLink(fetched.headers?.get?.("link"));
  }
  return { phase, pages, entries, projection: projectTree(entries) };
}

function expectedDataPaths() {
  return Array.from({ length: ARMNETBENCH_SO101_PROFILE.dataFiles }, (_, index) =>
    `data/chunk-000/file-${String(index).padStart(3, "0")}.parquet`);
}

const EXPECTED_META_PATHS = Object.freeze([
  "meta/episodes/chunk-000/file-000.parquet",
  "meta/info.json",
  "meta/stats.json",
  "meta/tasks.parquet",
]);

function selectedRemoteDescriptor(entry) {
  return {
    path: entry.path,
    bytes: entry.sizeBytes,
    lfsSha256: entry.lfsSha256,
    gitBlobSha1: entry.oid,
  };
}

export function selectPinnedArmnetBenchSo101Entries(treeEntries) {
  const tree = projectTree(treeEntries);
  const files = tree.filter((entry) => entry.type === "file");
  const selected = files.filter((entry) => SAFE_PATH.test(entry.path));
  const expected = ["README.md", ...expectedDataPaths(), ...EXPECTED_META_PATHS].sort();
  const actual = selected.map((entry) => entry.path).sort();
  if (canonicalizeStrict(actual) !== canonicalizeStrict(expected)) {
    fail("TREE_SELECTION_CHANGED");
  }
  const data = selected.filter((entry) => DATA_PATH.test(entry.path));
  const meta = selected.filter((entry) => META_PATH.test(entry.path));
  const readme = selected.filter((entry) => entry.path === "README.md");
  const sum = (values) => values.reduce((total, entry) => total + entry.sizeBytes, 0);
  const selectedBytes = sum(selected);
  if (selected.length !== ARMNETBENCH_SO101_PROFILE.selectedObjects
    || selectedBytes !== ARMNETBENCH_SO101_PROFILE.selectedBytes
    || data.length !== ARMNETBENCH_SO101_PROFILE.dataFiles
    || sum(data) !== ARMNETBENCH_SO101_PROFILE.dataBytes
    || meta.length !== ARMNETBENCH_SO101_PROFILE.metadataFiles
    || sum(meta) !== ARMNETBENCH_SO101_PROFILE.metadataBytes
    || readme.length !== ARMNETBENCH_SO101_PROFILE.readmeFiles
    || sum(readme) !== ARMNETBENCH_SO101_PROFILE.readmeBytes) {
    fail("TREE_CLOSURE_PROFILE_MISMATCH");
  }
  if (selected.some((entry) => entry.sizeBytes < 1 || entry.sizeBytes > MAX_FILE_BYTES)) {
    fail("TREE_SELECTED_FILE_SIZE_INVALID");
  }
  const videos = files.filter((entry) => entry.path.startsWith("videos/"));
  if (videos.length < 1) fail("TREE_VIDEO_EXCLUSION_NOT_OBSERVABLE");
  const licenseFiles = files.filter((entry) => /(^|\/)licen[cs]e(?:\.|$)/iu.test(entry.path));
  if (licenseFiles.length !== 0) fail("REPOSITORY_LICENSE_FILE_PROFILE_CHANGED");
  return {
    selected: selected.map(selectedRemoteDescriptor)
      .sort((left, right) => left.path.localeCompare(right.path)),
    selectedCount: selected.length,
    selectedBytes,
    dataFiles: data.length,
    dataBytes: sum(data),
    metadataFiles: meta.length,
    metadataBytes: sum(meta),
    readmeFiles: readme.length,
    readmeBytes: sum(readme),
    excludedVideoFiles: videos.length,
    repositoryLicenseFilePresent: false,
    visualReplay: false,
  };
}

function safeTarget(root, remotePath) {
  if (!SAFE_PATH.test(remotePath) && !API_CAPTURE_PATH.test(remotePath)) {
    fail("LOCAL_PATH_UNSAFE", remotePath);
  }
  const target = path.resolve(root, ...remotePath.split("/"));
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) fail("LOCAL_PATH_ESCAPE");
  return target;
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const checked = lstatSync(directory);
  if (checked.isSymbolicLink() || !checked.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writeOnce(root, relativePath, bytes) {
  const target = safeTarget(root, relativePath);
  ensurePrivateDirectory(path.dirname(target));
  let descriptor;
  try {
    descriptor = openSync(target, fsConstants.O_WRONLY | fsConstants.O_CREAT
      | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
    writeFileSync(descriptor, bytes);
    fchmodSync(descriptor, 0o600);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

async function mapConcurrent(values, width, operation) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, values.length) }, worker));
  return output;
}

function verifyDownloadedObject(entry, bytes) {
  if (bytes.length !== entry.bytes) fail("REMOTE_SIZE_MISMATCH", entry.path);
  const contentSha256 = armnetBenchSo101Sha256(bytes);
  if (entry.lfsSha256 !== null && contentSha256 !== entry.lfsSha256) {
    fail("REMOTE_LFS_SHA256_MISMATCH", entry.path);
  }
  if (entry.lfsSha256 === null && gitBlobOid(bytes) !== entry.gitBlobSha1) {
    fail("REMOTE_GIT_BLOB_MISMATCH", entry.path);
  }
  return { ...entry, contentSha256 };
}

function snapshotDescriptor(root, relativePath, url, bytes, phase, kind,
  pageIndex = null) {
  writeOnce(root, relativePath, bytes);
  return { path: relativePath, url, phase, kind, pageIndex,
    bytes: bytes.length, sha256: armnetBenchSo101Sha256(bytes) };
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export async function acquirePinnedArmnetBenchSo101Source(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) {
    fail("OUTPUT_EXISTS_OR_TOO_BROAD", target);
  }
  ensurePrivateDirectory(path.dirname(target));
  const temporary = path.join(path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const repositoryBefore = await fetchRepositorySnapshot("before", fetchImpl);
    const treeBefore = await fetchTreeSnapshot("before", fetchImpl);
    const selection = selectPinnedArmnetBenchSo101Entries(treeBefore.entries);
    const downloaded = await mapConcurrent(selection.selected, 8, async (entry) => {
      const encoded = entry.path.split("/").map(encodeURIComponent).join("/");
      const fetched = await boundedFetch(`${RAW_ROOT}/${encoded}?download=true`,
        entry.bytes, fetchImpl);
      const verified = verifyDownloadedObject(entry, fetched.bytes);
      writeOnce(temporary, entry.path, fetched.bytes);
      return verified;
    });
    const repositoryAfter = await fetchRepositorySnapshot("after", fetchImpl);
    const treeAfter = await fetchTreeSnapshot("after", fetchImpl);
    const selectionAfter = selectPinnedArmnetBenchSo101Entries(treeAfter.entries);
    if (!same(repositoryBefore.projection, repositoryAfter.projection)
      || !same(treeBefore.projection, treeAfter.projection)
      || !same(selection.selected, selectionAfter.selected)) {
      fail("REMOTE_SNAPSHOT_CHANGED_DURING_ACQUISITION");
    }
    const readmeBytes = readFileSync(path.join(temporary, "README.md"));
    if (readmeBytes.length !== ARMNETBENCH_SO101_PROFILE.readmeBytes
      || !/(^|\n)license:\s*apache-2\.0\s*($|\n)/iu.test(readmeBytes.toString("utf8"))) {
      fail("README_LICENSE_CLAIM_INVALID");
    }

    const apiSnapshots = [];
    apiSnapshots.push(snapshotDescriptor(temporary, "control/repository-before.json",
      repositoryBefore.url, repositoryBefore.bytes, "before", "repository"));
    for (const page of treeBefore.pages) {
      apiSnapshots.push(snapshotDescriptor(temporary,
        `control/tree-before-page-${String(page.pageIndex).padStart(3, "0")}.json`,
        page.url, page.bytes, "before", "tree", page.pageIndex));
    }
    apiSnapshots.push(snapshotDescriptor(temporary, "control/repository-after.json",
      repositoryAfter.url, repositoryAfter.bytes, "after", "repository"));
    for (const page of treeAfter.pages) {
      apiSnapshots.push(snapshotDescriptor(temporary,
        `control/tree-after-page-${String(page.pageIndex).padStart(3, "0")}.json`,
        page.url, page.bytes, "after", "tree", page.pageIndex));
    }

    const remoteObjects = downloaded.sort((left, right) => left.path.localeCompare(right.path));
    const sourceRoot = digest(`${ARMNETBENCH_SO101_SOURCE_MANIFEST_SCHEMA}/source-root`,
      remoteObjects);
    if (sourceRoot !== ARMNETBENCH_SO101_EXPECTED_SOURCE_ROOT) {
      fail("CANONICAL_SOURCE_ROOT_CHANGED");
    }
    const treeProjectionHash = digest(`${ARMNETBENCH_SO101_SOURCE_MANIFEST_SCHEMA}/tree`,
      treeBefore.projection);
    if (treeProjectionHash !== ARMNETBENCH_SO101_EXPECTED_TREE_PROJECTION_HASH) {
      fail("CANONICAL_TREE_PROJECTION_CHANGED");
    }
    const manifestBody = {
      schema: ARMNETBENCH_SO101_SOURCE_MANIFEST_SCHEMA,
      capturedAt: ARMNETBENCH_SO101_FROZEN_AT,
      datasetId: ARMNETBENCH_SO101_DATASET_ID,
      pinnedRevision: ARMNETBENCH_SO101_REVISION,
      repositoryBefore: repositoryBefore.projection,
      repositoryAfter: repositoryAfter.projection,
      repositoryStableDuringAcquisition: true,
      treeBefore: { pages: treeBefore.pages.length, entries: treeBefore.projection.length,
        projectionHash: treeProjectionHash },
      treeAfter: { pages: treeAfter.pages.length, entries: treeAfter.projection.length,
        projectionHash: treeProjectionHash },
      treeStableDuringAcquisition: true,
      sourceClosure: {
        selectedObjects: selection.selectedCount,
        selectedBytes: selection.selectedBytes,
        dataFiles: selection.dataFiles,
        dataBytes: selection.dataBytes,
        metadataFiles: selection.metadataFiles,
        metadataBytes: selection.metadataBytes,
        readmeFiles: selection.readmeFiles,
        readmeBytes: selection.readmeBytes,
        excludedVideoFiles: selection.excludedVideoFiles,
        visualReplay: false,
      },
      rights: {
        datasetCardClaim: "Apache-2.0",
        pinnedReadmeFrontmatterClaim: "Apache-2.0",
        repositoryLicenseFilePresent: false,
        conclusion: "CARD_AND_README_CLAIM_ONLY_NO_REPOSITORY_LICENSE_FILE",
        trainingAuthorizedByThisArtifact: 0,
      },
      apiSnapshots: apiSnapshots.sort((left, right) => left.path.localeCompare(right.path)),
      remoteObjects,
      sourceRoot,
    };
    const manifest = { ...manifestBody,
      manifestHash: digest(`${ARMNETBENCH_SO101_SOURCE_MANIFEST_SCHEMA}/manifest`, manifestBody) };
    writeFileSync(path.join(temporary, "acquisition-manifest.json"), canonicalBytes(manifest),
      { flag: "wx", mode: 0o600 });
    chmodSync(path.join(temporary, "acquisition-manifest.json"), 0o600);
    renameSync(temporary, target);
    chmodSync(target, 0o700);
    return { sourceDirectory: target, manifest };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function recursiveFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("SOURCE_DIRECTORY_UNSAFE", relative);
  if ((stat.mode & 0o777) !== 0o700) fail("SOURCE_DIRECTORY_MODE_INVALID", relative);
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail("SOURCE_SYMLINK", child);
    if (entry.isDirectory()) files.push(...recursiveFiles(root, child));
    else if (entry.isFile()) files.push(child);
    else fail("SOURCE_SPECIAL_FILE", child);
  }
  return files.sort();
}

function stableRead(target, expectedBytes = null) {
  const pathname = lstatSync(target, { bigint: true });
  if (pathname.isSymbolicLink() || !pathname.isFile()
    || (Number(pathname.mode) & 0o777) !== 0o600
    || (expectedBytes !== null && pathname.size !== BigInt(expectedBytes))) {
    fail("SOURCE_FILE_UNSAFE", target);
  }
  let descriptor;
  try {
    descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.dev !== pathname.dev || before.ino !== pathname.ino
      || before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || bytes.length !== Number(before.size)) {
      fail("SOURCE_FILE_CHANGED_DURING_READ", target);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseJsonBytes(bytes, code) {
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (!plain(value) && !Array.isArray(value)) fail(`${code}_ROOT_INVALID`);
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("ARMNETBENCH_SO101_")) throw error;
    fail(`${code}_JSON_INVALID`);
  }
}

function manifestHashValid(manifest) {
  if (!plain(manifest) || !HASH.test(manifest.manifestHash ?? "")) return false;
  const body = { ...manifest };
  delete body.manifestHash;
  return manifest.manifestHash === digest(
    `${ARMNETBENCH_SO101_SOURCE_MANIFEST_SCHEMA}/manifest`, body);
}

function treeFromSnapshotBytes(descriptors, root, phase) {
  const pages = descriptors.filter((entry) => entry.phase === phase && entry.kind === "tree")
    .sort((left, right) => left.pageIndex - right.pageIndex);
  if (pages.length < 1 || pages.some((page, index) => page.pageIndex !== index)) {
    fail("SOURCE_TREE_SNAPSHOT_SET_INVALID", phase);
  }
  const entries = [];
  for (const page of pages) {
    const value = parseJsonBytes(stableRead(path.join(root, page.path), page.bytes),
      "SOURCE_TREE_SNAPSHOT");
    if (!Array.isArray(value) || value.length < 1) fail("SOURCE_TREE_SNAPSHOT_PAGE_INVALID");
    entries.push(...value);
  }
  return { entries, projection: projectTree(entries) };
}

export function verifyArmnetBenchSo101SourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  try {
    const manifestBytes = stableRead(path.join(root, "acquisition-manifest.json"));
    const manifest = parseJsonBytes(manifestBytes, "SOURCE_MANIFEST");
    if (!manifestHashValid(manifest)
      || manifest.schema !== ARMNETBENCH_SO101_SOURCE_MANIFEST_SCHEMA
      || manifest.datasetId !== ARMNETBENCH_SO101_DATASET_ID
      || manifest.pinnedRevision !== ARMNETBENCH_SO101_REVISION
      || manifest.repositoryStableDuringAcquisition !== true
      || manifest.treeStableDuringAcquisition !== true
      || manifest.sourceClosure?.selectedObjects !== ARMNETBENCH_SO101_PROFILE.selectedObjects
      || manifest.sourceClosure?.selectedBytes !== ARMNETBENCH_SO101_PROFILE.selectedBytes
      || manifest.sourceClosure?.dataFiles !== ARMNETBENCH_SO101_PROFILE.dataFiles
      || manifest.sourceClosure?.dataBytes !== ARMNETBENCH_SO101_PROFILE.dataBytes
      || manifest.sourceClosure?.metadataFiles !== ARMNETBENCH_SO101_PROFILE.metadataFiles
      || manifest.sourceClosure?.metadataBytes !== ARMNETBENCH_SO101_PROFILE.metadataBytes
      || manifest.sourceClosure?.readmeBytes !== ARMNETBENCH_SO101_PROFILE.readmeBytes
      || manifest.sourceClosure?.visualReplay !== false
      || manifest.rights?.repositoryLicenseFilePresent !== false
      || manifest.rights?.trainingAuthorizedByThisArtifact !== 0
      || manifest.sourceRoot !== ARMNETBENCH_SO101_EXPECTED_SOURCE_ROOT
      || manifest.treeBefore?.projectionHash !== ARMNETBENCH_SO101_EXPECTED_TREE_PROJECTION_HASH
      || manifest.treeAfter?.projectionHash !== ARMNETBENCH_SO101_EXPECTED_TREE_PROJECTION_HASH
      || !Array.isArray(manifest.remoteObjects)
      || manifest.remoteObjects.length !== ARMNETBENCH_SO101_PROFILE.selectedObjects
      || !Array.isArray(manifest.apiSnapshots)) fail("SOURCE_MANIFEST_INVALID");

    const expectedFiles = ["acquisition-manifest.json",
      ...manifest.remoteObjects.map((entry) => entry.path),
      ...manifest.apiSnapshots.map((entry) => entry.path)].sort();
    if (!same(recursiveFiles(root), expectedFiles)) fail("SOURCE_FILE_SET_INVALID");

    for (const entry of manifest.apiSnapshots) {
      if (!plain(entry) || !API_CAPTURE_PATH.test(entry.path)
        || !["before", "after"].includes(entry.phase)
        || !["repository", "tree"].includes(entry.kind)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1
        || !HASH.test(entry.sha256 ?? "")) fail("SOURCE_API_SNAPSHOT_INVALID");
      const bytes = stableRead(path.join(root, entry.path), entry.bytes);
      if (armnetBenchSo101Sha256(bytes) !== entry.sha256) {
        fail("SOURCE_API_SNAPSHOT_HASH_MISMATCH", entry.path);
      }
    }
    const repositorySnapshots = Object.fromEntries(["before", "after"].map((phase) => {
      const descriptor = manifest.apiSnapshots.find((entry) =>
        entry.phase === phase && entry.kind === "repository");
      if (!descriptor) fail("SOURCE_REPOSITORY_SNAPSHOT_MISSING", phase);
      const value = parseJsonBytes(stableRead(path.join(root, descriptor.path), descriptor.bytes),
        "SOURCE_REPOSITORY_SNAPSHOT");
      return [phase, repositoryProjection(value)];
    }));
    if (!same(repositorySnapshots.before, manifest.repositoryBefore)
      || !same(repositorySnapshots.after, manifest.repositoryAfter)
      || !same(repositorySnapshots.before, repositorySnapshots.after)) {
      fail("SOURCE_REPOSITORY_REPLAY_FAILED");
    }
    const treeBefore = treeFromSnapshotBytes(manifest.apiSnapshots, root, "before");
    const treeAfter = treeFromSnapshotBytes(manifest.apiSnapshots, root, "after");
    if (!same(treeBefore.projection, treeAfter.projection)
      || manifest.treeBefore?.entries !== treeBefore.projection.length
      || manifest.treeAfter?.entries !== treeAfter.projection.length
      || manifest.treeBefore?.projectionHash !== digest(
        `${ARMNETBENCH_SO101_SOURCE_MANIFEST_SCHEMA}/tree`, treeBefore.projection)
      || manifest.treeAfter?.projectionHash !== digest(
        `${ARMNETBENCH_SO101_SOURCE_MANIFEST_SCHEMA}/tree`, treeAfter.projection)) {
      fail("SOURCE_TREE_REPLAY_FAILED");
    }
    const selected = selectPinnedArmnetBenchSo101Entries(treeBefore.entries);
    if (!same(selected.selected, manifest.remoteObjects.map((entry) => ({
      path: entry.path, bytes: entry.bytes, lfsSha256: entry.lfsSha256,
      gitBlobSha1: entry.gitBlobSha1,
    })))) fail("SOURCE_REMOTE_OBJECT_TREE_BINDING_FAILED");

    let bytesObserved = 0;
    const verifiedObjects = [];
    for (const entry of manifest.remoteObjects) {
      if (!plain(entry) || !SAFE_PATH.test(entry.path)
        || !Number.isSafeInteger(entry.bytes) || entry.bytes < 1
        || !SHA1.test(entry.gitBlobSha1 ?? "")
        || (entry.lfsSha256 !== null && !HASH.test(entry.lfsSha256 ?? ""))
        || !HASH.test(entry.contentSha256 ?? "")) fail("SOURCE_REMOTE_OBJECT_INVALID");
      const bytes = stableRead(path.join(root, entry.path), entry.bytes);
      const checked = verifyDownloadedObject(entry, bytes);
      if (checked.contentSha256 !== entry.contentSha256) {
        fail("SOURCE_OBJECT_HASH_MISMATCH", entry.path);
      }
      bytesObserved += bytes.length;
      verifiedObjects.push(entry);
    }
    if (bytesObserved !== ARMNETBENCH_SO101_PROFILE.selectedBytes
      || manifest.sourceRoot !== digest(
        `${ARMNETBENCH_SO101_SOURCE_MANIFEST_SCHEMA}/source-root`, verifiedObjects)) {
      fail("SOURCE_ROOT_MISMATCH");
    }
    return { ok: true, sourceDirectory: root, manifest, bytesObserved,
      objectsVerified: verifiedObjects.length, treeBefore: treeBefore.projection,
      treeAfter: treeAfter.projection };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import collections
import json
import math
import sys
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq

root = Path(sys.argv[1])

def require(condition, code):
    if not condition:
        raise RuntimeError(code)

with (root / "meta/info.json").open("r", encoding="utf-8") as handle:
    info = json.load(handle)
with (root / "meta/stats.json").open("r", encoding="utf-8") as handle:
    stats = json.load(handle)

expected_joint_names = [
    "shoulder_pan.pos", "shoulder_lift.pos", "elbow_flex.pos",
    "wrist_flex.pos", "wrist_roll.pos", "gripper.pos",
]
require(info.get("codebase_version") == "v3.0", "INFO_CODEBASE_VERSION")
require(info.get("fps") == 20, "INFO_FPS")
require(info.get("total_episodes") == 2499, "INFO_EPISODES")
require(info.get("total_frames") == 1127881, "INFO_FRAMES")
require(info.get("total_tasks") == 8, "INFO_TASKS")
require(info.get("robot_type") == "so-101", "INFO_ROBOT")
require(info.get("splits") == {"train": "0:2499"}, "INFO_SPLIT")
for feature in ("action", "observation.state"):
    spec = info.get("features", {}).get(feature, {})
    require(spec.get("dtype") == "float32" and spec.get("shape") == [6]
            and spec.get("names") == expected_joint_names, "INFO_" + feature)
require(info.get("features", {}).get("next.reward", {}).get("dtype") == "float32",
        "INFO_REWARD")
require(info.get("features", {}).get("next.done", {}).get("dtype") == "bool",
        "INFO_DONE")

tasks_table = pq.read_table(root / "meta/tasks.parquet")
require(tasks_table.schema.names == ["task_index", "task"], "TASK_SCHEMA_NAMES")
require(tasks_table.schema.field("task_index").type == pa.int64(), "TASK_INDEX_TYPE")
require(tasks_table.schema.field("task").type == pa.string(), "TASK_TEXT_TYPE")
tasks_rows = tasks_table.to_pylist()
require(len(tasks_rows) == 8, "TASK_COUNT")
require([row["task_index"] for row in tasks_rows] == list(range(8)), "TASK_CONTINUITY")
task_text = {row["task_index"]: row["task"] for row in tasks_rows}
require(len(set(task_text.values())) == 8, "TASK_TEXT_UNIQUENESS")

episode_columns = [
    "episode_index", "tasks", "length", "data/chunk_index", "data/file_index",
    "dataset_from_index", "dataset_to_index", "success", "success_class",
    "policy_repo_id", "policy_type",
]
episode_table = pq.read_table(root / "meta/episodes/chunk-000/file-000.parquet",
                              columns=episode_columns)
episode_rows = episode_table.to_pylist()
require(len(episode_rows) == 2499, "EPISODE_COUNT")
require([row["episode_index"] for row in episode_rows] == list(range(2499)),
        "EPISODE_INDEX_CONTINUITY")

classes = {"successful", "failure", "suboptimal"}
policy_types = {"act", "diffusion", "smolvla", "pi0", "pi0.5", "grootn1.7",
                "molmoact2", "teleoperated"}
expected_from = 0
outcome_counts = collections.Counter()
policy_outcomes = collections.defaultdict(collections.Counter)
for row in episode_rows:
    require(row["length"] > 0, "EPISODE_LENGTH")
    require(row["data/chunk_index"] == 0, "EPISODE_DATA_CHUNK")
    require(0 <= row["data/file_index"] < 120, "EPISODE_DATA_FILE")
    require(row["dataset_from_index"] == expected_from, "EPISODE_DATASET_FROM")
    require(row["dataset_to_index"] == expected_from + row["length"],
            "EPISODE_DATASET_TO")
    expected_from = row["dataset_to_index"]
    require(row["success_class"] in classes, "EPISODE_SUCCESS_CLASS")
    require(row["success"] in (0, 1), "EPISODE_SUCCESS_VALUE")
    require(row["success"] == (1 if row["success_class"] == "successful" else 0),
            "EPISODE_SUCCESS_ALIGNMENT")
    require(row["policy_type"] in policy_types, "EPISODE_POLICY_TYPE")
    require(isinstance(row["tasks"], list) and len(row["tasks"]) == 1,
            "EPISODE_TASK_LIST")
    if row["policy_type"] == "teleoperated":
        require(row["success_class"] == "successful" and row["success"] == 1,
                "TELEOP_SUCCESS_POLICY")
        require(row["policy_repo_id"] in ("", None), "TELEOP_REPO_ID")
    outcome_counts[row["success_class"]] += 1
    policy_outcomes[row["policy_type"]][row["success_class"]] += 1
require(expected_from == 1127881, "EPISODE_FRAME_SUM")
require(dict(outcome_counts) == {"failure": 1532, "successful": 915, "suboptimal": 52},
        "EPISODE_OUTCOME_COUNTS")
require(len(policy_types - {"teleoperated"}) == 7, "EVALUATION_POLICY_COUNT")

expected_schema = {
    "action": "list<element: float>",
    "observation.state": "list<element: float>",
    "timestamp": "float",
    "frame_index": "int64",
    "episode_index": "int64",
    "index": "int64",
    "task_index": "int64",
    "next.reward": "float",
    "next.done": "bool",
}

episode_projection = []
episode_accumulator = None
global_index = 0
done_count = 0
reward_count = 0
file_rows = []

def rounded(values):
    return [round(float(value), 6) for value in values]

def finish_episode(acc):
    require(acc is not None, "FINISH_EPISODE_MISSING")
    require(acc["framesSeen"] == acc["frames"], "EPISODE_FRAME_COUNT")
    acc["meanAbsActionStateError"] = round(
        acc.pop("trackingErrorSum") / (acc["frames"] * 6), 9)
    acc["maxAbsActionStateError"] = round(acc["maxAbsActionStateError"], 9)
    episode_projection.append(acc)

for file_index in range(120):
    data_path = root / "data/chunk-000" / f"file-{file_index:03d}.parquet"
    parquet = pq.ParquetFile(data_path)
    require(parquet.schema_arrow.names == list(expected_schema), "DATA_SCHEMA_NAMES")
    for name, expected_type in expected_schema.items():
        require(str(parquet.schema_arrow.field(name).type) == expected_type,
                "DATA_SCHEMA_TYPE_" + name)
    observed_file_rows = 0
    for batch in parquet.iter_batches(batch_size=65536, columns=list(expected_schema)):
        values = {name: batch.column(batch.schema.get_field_index(name)).to_pylist()
                  for name in expected_schema}
        for offset in range(batch.num_rows):
            episode_index = values["episode_index"][offset]
            frame_index = values["frame_index"][offset]
            source_index = values["index"][offset]
            task_index = values["task_index"][offset]
            timestamp = values["timestamp"][offset]
            action = values["action"][offset]
            state = values["observation.state"][offset]
            reward = values["next.reward"][offset]
            done = values["next.done"][offset]
            require(isinstance(episode_index, int) and 0 <= episode_index < 2499,
                    "DATA_EPISODE_INDEX")
            require(source_index == global_index, "DATA_GLOBAL_INDEX_CONTINUITY")
            require(isinstance(frame_index, int) and frame_index >= 0,
                    "DATA_FRAME_INDEX")
            require(isinstance(task_index, int) and task_index in task_text,
                    "DATA_TASK_INDEX")
            require(isinstance(timestamp, (int, float)) and math.isfinite(timestamp)
                    and abs(float(timestamp) - frame_index / 20.0) <= 0.0002,
                    "DATA_TIMESTAMP_ALIGNMENT")
            require(isinstance(action, list) and len(action) == 6
                    and all(isinstance(value, (int, float)) and math.isfinite(value)
                            for value in action), "DATA_ACTION_VECTOR")
            require(isinstance(state, list) and len(state) == 6
                    and all(isinstance(value, (int, float)) and math.isfinite(value)
                            for value in state), "DATA_STATE_VECTOR")
            meta = episode_rows[episode_index]
            require(meta["data/file_index"] == file_index, "DATA_FILE_ALIGNMENT")
            require(meta["dataset_from_index"] <= global_index < meta["dataset_to_index"],
                    "DATA_EPISODE_BOUNDS")
            require(frame_index == global_index - meta["dataset_from_index"],
                    "DATA_FRAME_CONTINUITY")
            require(meta["tasks"] == [task_text[task_index]], "DATA_TASK_ALIGNMENT")
            terminal = frame_index == meta["length"] - 1
            require(bool(done) == terminal, "DATA_DONE_ALIGNMENT")
            expected_reward = 1.0 if terminal and meta["success_class"] == "successful" else 0.0
            require(float(reward) in (0.0, 1.0) and float(reward) == expected_reward,
                    "DATA_REWARD_ALIGNMENT")
            if done:
                done_count += 1
            if float(reward) == 1.0:
                reward_count += 1

            if episode_accumulator is None or episode_accumulator["episodeIndex"] != episode_index:
                if episode_accumulator is not None:
                    finish_episode(episode_accumulator)
                require(frame_index == 0 and episode_index == len(episode_projection),
                        "DATA_EPISODE_CONTINUITY")
                episode_accumulator = {
                    "episodeIndex": episode_index,
                    "taskIndex": task_index,
                    "dataFileIndex": file_index,
                    "frames": meta["length"],
                    "framesSeen": 0,
                    "outcome": meta["success_class"],
                    "success": bool(meta["success"]),
                    "policyType": meta["policy_type"],
                    "firstState": rounded(state),
                    "finalState": rounded(state),
                    "firstAction": rounded(action),
                    "finalAction": rounded(action),
                    "terminalReward": 0,
                    "terminalDone": False,
                    "trackingErrorSum": 0.0,
                    "maxAbsActionStateError": 0.0,
                }
            require(episode_accumulator["taskIndex"] == task_index,
                    "DATA_EPISODE_TASK_STABILITY")
            errors = [abs(float(action[index]) - float(state[index])) for index in range(6)]
            episode_accumulator["trackingErrorSum"] += sum(errors)
            episode_accumulator["maxAbsActionStateError"] = max(
                episode_accumulator["maxAbsActionStateError"], max(errors))
            episode_accumulator["framesSeen"] += 1
            episode_accumulator["finalState"] = rounded(state)
            episode_accumulator["finalAction"] = rounded(action)
            if terminal:
                episode_accumulator["terminalReward"] = int(reward)
                episode_accumulator["terminalDone"] = bool(done)
            global_index += 1
            observed_file_rows += 1
    require(observed_file_rows == parquet.metadata.num_rows, "DATA_FILE_ROW_COUNT")
    file_rows.append(observed_file_rows)

finish_episode(episode_accumulator)
require(global_index == 1127881, "DATA_TOTAL_FRAMES")
require(len(episode_projection) == 2499, "DATA_TOTAL_EPISODES")
require(done_count == 2499, "DATA_DONE_COUNT")
require(reward_count == 915, "DATA_REWARD_COUNT")
require(sum(file_rows) == 1127881 and len(file_rows) == 120, "DATA_FILE_TOTAL")

stats_fields = ["action", "observation.state", "next.reward", "next.done",
                "timestamp", "frame_index", "episode_index", "index", "task_index"]
stats_count_claims = {}
for field in stats_fields:
    count = stats.get(field, {}).get("count")
    require(isinstance(count, list) and len(count) == 1, "STATS_COUNT_" + field)
    stats_count_claims[field] = int(count[0])
require(stats_count_claims["action"] == 1127881, "STATS_ACTION_COUNT")
require(stats_count_claims["observation.state"] == 1127881, "STATS_STATE_COUNT")
require(stats_count_claims["next.reward"] == 1127881, "STATS_REWARD_COUNT")
require(stats_count_claims["next.done"] == 1127881, "STATS_DONE_COUNT")
stale_fields = sorted(field for field, count in stats_count_claims.items()
                      if count != 1127881)
require(stale_fields == ["episode_index", "frame_index", "index", "task_index", "timestamp"],
        "STATS_STALE_FIELD_PROFILE")
require(all(stats_count_claims[field] == 1147055 for field in stale_fields),
        "STATS_STALE_COUNT_PROFILE")

def sorted_counts(counter):
    return {key: counter[key] for key in sorted(counter)}

task_outcomes = collections.defaultdict(collections.Counter)
for episode in episode_projection:
    task_outcomes[str(episode["taskIndex"])][episode["outcome"]] += 1

result = {
    "pyarrowVersion": pa.__version__,
    "dataFilesReplayed": 120,
    "metadataFilesReplayed": 4,
    "episodesReplayed": 2499,
    "framesReplayed": 1127881,
    "stateDimensions": 6,
    "actionDimensions": 6,
    "taskCount": 8,
    "evaluationPolicyFamilyCount": 7,
    "policyTypesIncludingTeleoperation": sorted(policy_types),
    "outcomeCounts": sorted_counts(outcome_counts),
    "doneTrueCount": done_count,
    "rewardOneCount": reward_count,
    "episodeIndexContinuous": True,
    "frameIndexContinuousWithinEpisode": True,
    "globalIndexContinuous": True,
    "episodeMetadataAligned": True,
    "taskMetadataAligned": True,
    "infoMetadataAligned": True,
    "rewardDoneAlignedToPublisherOutcome": True,
    "publisherStatsFullyFrameAligned": False,
    "publisherStatsCountClaims": stats_count_claims,
    "publisherStatsStaleCountFields": stale_fields,
    "fileRowCounts": file_rows,
    "outcomesByPolicyType": {
        key: sorted_counts(policy_outcomes[key]) for key in sorted(policy_outcomes)
    },
    "outcomesByTaskIndex": {
        key: sorted_counts(task_outcomes[key]) for key in sorted(task_outcomes, key=int)
    },
    "episodes": episode_projection,
}
print(json.dumps(result, sort_keys=True, separators=(",", ":"), allow_nan=False))
`;

function replayWithPyarrow(sourceDirectory, pythonExecutable) {
  const executed = spawnSync(pythonExecutable, ["-c", PYARROW_REPLAY,
    path.resolve(sourceDirectory)], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000, shell: false });
  if (executed.error || executed.status !== 0) {
    fail("PYARROW_REPLAY_FAILED",
      `${executed.error?.message ?? "status=" + executed.status}:${String(executed.stderr).slice(0, 4_000)}`);
  }
  const replay = parseJsonBytes(Buffer.from(executed.stdout, "utf8"), "PYARROW_REPLAY");
  if (!plain(replay) || replay.dataFilesReplayed !== 120
    || replay.metadataFilesReplayed !== 4 || replay.episodesReplayed !== 2_499
    || replay.framesReplayed !== 1_127_881 || replay.stateDimensions !== 6
    || replay.actionDimensions !== 6 || replay.taskCount !== 8
    || replay.evaluationPolicyFamilyCount !== 7
    || !same(replay.outcomeCounts, ARMNETBENCH_SO101_PROFILE.outcomes)
    || replay.doneTrueCount !== 2_499 || replay.rewardOneCount !== 915
    || replay.publisherStatsFullyFrameAligned !== false
    || !Array.isArray(replay.episodes) || replay.episodes.length !== 2_499) {
    fail("PYARROW_REPLAY_PROFILE_INVALID");
  }
  return replay;
}

export function buildArmnetBenchSo101OutcomeFromSource(sourceDirectory, options = {}) {
  const verified = verifyArmnetBenchSo101SourceDirectory(sourceDirectory);
  if (!verified.ok) fail("FULL_SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = replayWithPyarrow(sourceDirectory,
    options.pythonExecutable ?? ".venv/bin/python");
  const body = {
    schema: ARMNETBENCH_SO101_OUTCOME_SCHEMA,
    generatedAt: ARMNETBENCH_SO101_FROZEN_AT,
    dataset: {
      id: ARMNETBENCH_SO101_DATASET_ID,
      revision: ARMNETBENCH_SO101_REVISION,
      embodiment: "SO-101_SINGLE_ARM",
      format: "LEROBOT_V3",
      sourceObjects: ARMNETBENCH_SO101_PROFILE.selectedObjects,
      sourceBytes: ARMNETBENCH_SO101_PROFILE.selectedBytes,
      visualReplay: false,
    },
    source: {
      manifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      verificationLevel: "FULL_PINNED_SOURCE_BYTE_AND_PYARROW_REPLAY",
      repositoryAndTreeCapturedBeforeAndAfter: true,
      everySelectedObjectPathLfsShaAndBytesBound: true,
    },
    replay,
    outcomeProvenance: {
      kind: "PUBLISHER_SOURCE_NATIVE",
      humanEvaluatedPolicyRolloutsClaimedByPublisher: true,
      independentOutcome: 0,
      longitudinalOutcome: 0,
      outcomeTruthEstablishedBeyondPublisherClaim: 0,
    },
    completeness: {
      attemptCensusComplete: false,
      publisherExcludedCorruptOrUnlabelledMultiEpisodeRecords: true,
      publisherMayTailTrimSuccessfulOrSuboptimalEpisodesAtSuccessCutoff: true,
      retainedRowsAreNotACompleteOpportunitySet: true,
      teleoperationEpisodesPublisherAssignedSuccessful: true,
    },
    rights: {
      datasetCardClaim: "Apache-2.0",
      pinnedReadmeFrontmatterClaim: "Apache-2.0",
      repositoryLicenseFilePresent: false,
      conclusion: "CARD_AND_README_CLAIM_ONLY_NO_REPOSITORY_LICENSE_FILE",
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
  return { ...body,
    artifactHash: digest(`${ARMNETBENCH_SO101_OUTCOME_SCHEMA}/artifact`, body) };
}

function artifactHashValid(artifact) {
  if (!plain(artifact) || !HASH.test(artifact.artifactHash ?? "")) return false;
  const body = { ...artifact };
  delete body.artifactHash;
  return artifact.artifactHash === digest(`${ARMNETBENCH_SO101_OUTCOME_SCHEMA}/artifact`, body);
}

export function verifyArmnetBenchSo101OutcomeArtifact(artifact) {
  try {
    if (!artifactHashValid(artifact) || artifact.schema !== ARMNETBENCH_SO101_OUTCOME_SCHEMA
      || artifact.dataset?.id !== ARMNETBENCH_SO101_DATASET_ID
      || artifact.dataset?.revision !== ARMNETBENCH_SO101_REVISION
      || artifact.dataset?.sourceObjects !== 125 || artifact.dataset?.sourceBytes !== 57_660_573
      || artifact.dataset?.visualReplay !== false
      || artifact.source?.verificationLevel !== "FULL_PINNED_SOURCE_BYTE_AND_PYARROW_REPLAY"
      || artifact.replay?.episodesReplayed !== 2_499
      || artifact.replay?.framesReplayed !== 1_127_881
      || artifact.replay?.stateDimensions !== 6 || artifact.replay?.actionDimensions !== 6
      || artifact.replay?.taskCount !== 8
      || artifact.replay?.evaluationPolicyFamilyCount !== 7
      || !same(artifact.replay?.outcomeCounts, ARMNETBENCH_SO101_PROFILE.outcomes)
      || artifact.replay?.doneTrueCount !== 2_499
      || artifact.replay?.rewardOneCount !== 915
      || artifact.replay?.episodeIndexContinuous !== true
      || artifact.replay?.frameIndexContinuousWithinEpisode !== true
      || artifact.replay?.globalIndexContinuous !== true
      || artifact.replay?.episodeMetadataAligned !== true
      || artifact.replay?.taskMetadataAligned !== true
      || artifact.replay?.infoMetadataAligned !== true
      || artifact.replay?.publisherStatsFullyFrameAligned !== false
      || !Array.isArray(artifact.replay?.episodes)
      || artifact.replay.episodes.length !== 2_499
      || artifact.outcomeProvenance?.kind !== "PUBLISHER_SOURCE_NATIVE"
      || artifact.outcomeProvenance?.independentOutcome !== 0
      || artifact.outcomeProvenance?.longitudinalOutcome !== 0
      || artifact.completeness?.attemptCensusComplete !== false
      || artifact.completeness?.publisherExcludedCorruptOrUnlabelledMultiEpisodeRecords !== true
      || artifact.completeness?.publisherMayTailTrimSuccessfulOrSuboptimalEpisodesAtSuccessCutoff !== true
      || artifact.rights?.repositoryLicenseFilePresent !== false
      || artifact.rights?.productionTrainingRightFinallyAdjudicated !== false
      || !plain(artifact.boundary)
      || Object.keys(artifact.boundary).length !== 9
      || Object.values(artifact.boundary).some((value) => value !== 0)) {
      fail("ARTIFACT_INVALID");
    }
    let frames = 0;
    const outcomes = { successful: 0, failure: 0, suboptimal: 0 };
    for (let index = 0; index < artifact.replay.episodes.length; index += 1) {
      const episode = artifact.replay.episodes[index];
      if (!plain(episode) || episode.episodeIndex !== index
        || !Number.isSafeInteger(episode.frames) || episode.frames < 1
        || !Object.hasOwn(outcomes, episode.outcome)
        || episode.success !== (episode.outcome === "successful")
        || episode.terminalDone !== true
        || episode.terminalReward !== (episode.success ? 1 : 0)
        || ![episode.firstState, episode.finalState, episode.firstAction,
          episode.finalAction].every((vector) => Array.isArray(vector)
            && vector.length === 6 && vector.every(Number.isFinite))
        || !Number.isFinite(episode.meanAbsActionStateError)
        || !Number.isFinite(episode.maxAbsActionStateError)) fail("EPISODE_INVALID", String(index));
      frames += episode.frames;
      outcomes[episode.outcome] += 1;
    }
    if (frames !== 1_127_881 || !same(outcomes, ARMNETBENCH_SO101_PROFILE.outcomes)) {
      fail("ARTIFACT_EPISODE_TOTAL_INVALID");
    }
    return { ok: true, artifactHash: artifact.artifactHash,
      verificationLevel: "SELF_SEALED_PROJECTION_ONLY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyArmnetBenchSo101OutcomeArtifactWithSource(artifact,
  sourceDirectory, options = {}) {
  try {
    const standalone = verifyArmnetBenchSo101OutcomeArtifact(artifact);
    if (!standalone.ok) fail("ARTIFACT_STANDALONE_INVALID", standalone.error);
    const rebuilt = buildArmnetBenchSo101OutcomeFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("ARTIFACT_SOURCE_REBUILD_MISMATCH");
    return {
      ok: true,
      verificationLevel: "FULL_PINNED_SOURCE_BYTE_AND_PYARROW_REPLAY",
      sourceObjectsReverified: 125,
      sourceBytesReverified: 57_660_573,
      episodesReplayed: 2_499,
      framesReplayed: 1_127_881,
      candidateArtifactExactlyRebuilt: true,
      visualReplay: false,
      authorityEstablished: false,
      actionAuthorized: false,
      independentOutcomeEstablished: false,
      longitudinalOutcomeEstablished: false,
    };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error),
      verificationLevel: "FAILED" };
  }
}

export function armnetBenchSo101ArtifactFileMode(file) {
  return statSync(file).mode & 0o777;
}
