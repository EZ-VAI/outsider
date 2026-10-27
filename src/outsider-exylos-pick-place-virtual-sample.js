/*
 * Exylos pick-and-place complete no-video sample intake.
 *
 * The pinned sample contains VR-seeded, procedurally expanded virtual Panda
 * trajectories. Publisher success/failure and correction labels remain
 * publisher labels: this module creates no physical outcome, recovery,
 * delegation, training, network, economic, or execution authority.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmdirSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const EXYLOS_DATASET_ID = "ExylosAi/pick_and_place_sample";
export const EXYLOS_REVISION = "c28315b295edc0cc2a61bf1b39b72eed4a88a849";
export const EXYLOS_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const EXYLOS_SOURCE_SCHEMA =
  "outsider/exylos-pick-place-virtual-sample-pinned-source/v1";
export const EXYLOS_REPORT_SCHEMA =
  "outsider/exylos-pick-place-virtual-sample/v1";
export const EXYLOS_RECEIPT_SCHEMA =
  "outsider/exylos-pick-place-virtual-sample-run-receipt/v1";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${EXYLOS_DATASET_ID}`;
const TREE_PATH = `/api/datasets/${EXYLOS_DATASET_ID}/tree/${EXYLOS_REVISION}`;
const RAW_ROOT = `${HF_ORIGIN}/datasets/${EXYLOS_DATASET_ID}/resolve/${EXYLOS_REVISION}`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const SAFE_COMPONENT = /^[A-Za-z0-9._-]+$/u;
const ALLOWED_FETCH_HOST = /^(huggingface\.co|[a-z0-9.-]+\.hf\.co)$/iu;
const MAX_API_BYTES = 16 * 1024 * 1024;
const MAX_REMOTE_BYTES = 4 * 1024 * 1024;
const MAX_TREE_PAGES = 16;
const FETCH_TIMEOUT_MS = 90_000;
const PYARROW_TIMEOUT_MS = 180_000;
const MAX_PYARROW_OUTPUT_BYTES = 16 * 1024 * 1024;
const EXPECTED = Object.freeze({
  treeEntries: 319,
  treeFiles: 310,
  treeDirectories: 9,
  treeFileBytes: 3_518_770_691,
  treePages: 4,
  selectedFiles: 58,
  selectedBytes: 3_358_010,
  parquetFiles: 50,
  parquetBytes: 3_086_411,
  supportFiles: 8,
  supportBytes: 271_599,
  excludedVisualObjects: 252,
  excludedVisualBytes: 3_515_412_681,
  excludedMp4Objects: 251,
  excludedGifObjects: 1,
  episodes: 50,
  frames: 21_412,
});
const SUPPORT_PATHS = Object.freeze([
  ".gitattributes", "annotations.json", "episodes_stats.jsonl", "episodes.jsonl",
  "info.json", "LICENSE_1.txt", "README.md", "tasks.jsonl",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `EXYLOS_VIRTUAL_SAMPLE_${code}`
    : `EXYLOS_VIRTUAL_SAMPLE_${code}:${detail}`);
}

export function exylosSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function exylosDigest(value, domain = EXYLOS_REPORT_SCHEMA) {
  return exylosSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function safeRemotePath(value) {
  return typeof value === "string" && value.length > 0 && !value.startsWith("/")
    && value.split("/").every((part) => SAFE_COMPONENT.test(part)
      && part !== "." && part !== "..");
}

function isVisualPath(value) {
  return /\.(mp4|gif)$/iu.test(value);
}

function checkedInitialUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== HF_ORIGIN
    || url.username !== "" || url.password !== "") fail("FETCH_URL_INVALID", value);
  return url;
}

function checkedRedirectUrl(value, base) {
  const url = new URL(value, base);
  if (url.protocol !== "https:" || !ALLOWED_FETCH_HOST.test(url.hostname)
    || url.username !== "" || url.password !== "") {
    fail("FETCH_REDIRECT_UNSAFE", url.hostname);
  }
  return url;
}

async function fetchOnce(value, maximumBytes, accept, fetchImpl) {
  let current = checkedInitialUrl(value);
  for (let redirect = 0; redirect <= 6; redirect += 1) {
    const response = await fetchImpl(current, {
      redirect: "manual",
      headers: { accept, "user-agent": "outsider-exylos-virtual-sample/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.("location");
      if (!location || redirect === 6) fail("FETCH_REDIRECT_INVALID", current.toString());
      current = checkedRedirectUrl(location, current);
      continue;
    }
    if (response.status !== 200 || !response.body) {
      fail(`FETCH_HTTP_${response.status}`, checkedInitialUrl(value).pathname);
    }
    const finalUrl = new URL(response.url || current.toString());
    if (finalUrl.protocol !== "https:" || !ALLOWED_FETCH_HOST.test(finalUrl.hostname)) {
      fail("FETCH_FINAL_ORIGIN_UNSAFE", finalUrl.hostname);
    }
    const declared = response.headers.get("content-length");
    if (declared !== null && (!/^\d+$/u.test(declared)
      || Number(declared) > maximumBytes)) fail("FETCH_DECLARED_SIZE_INVALID", value);
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      total += chunk.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("source byte limit exceeded");
        fail("FETCH_STREAM_SIZE_INVALID", value);
      }
      chunks.push(Buffer.from(chunk));
    }
    if (total < 1) fail("FETCH_EMPTY", value);
    return { bytes: Buffer.concat(chunks, total), headers: response.headers,
      finalHost: finalUrl.hostname };
  }
  fail("FETCH_REDIRECT_LIMIT", value);
}

async function boundedFetch(value, maximumBytes, accept, fetchImpl) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await fetchOnce(value, maximumBytes, accept, fetchImpl); }
    catch (error) {
      lastError = error;
      if (/FETCH_HTTP_4\d\d/u.test(safeError(error))) break;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  fail("FETCH_FAILED", `${checkedInitialUrl(value).pathname}:${safeError(lastError)}`);
}

async function jsonFetch(value, fetchImpl) {
  const fetched = await boundedFetch(value, MAX_API_BYTES, "application/json", fetchImpl);
  let parsed;
  try { parsed = JSON.parse(fetched.bytes.toString("utf8")); }
  catch { fail("FETCH_JSON_INVALID", checkedInitialUrl(value).pathname); }
  return { ...fetched, value: parsed };
}

function parseNextTreeLink(header) {
  if (header == null || header === "") return null;
  const next = String(header).split(",")
    .find((part) => /;\s*rel="next"\s*$/iu.test(part.trim()));
  if (!next) return null;
  const matched = /^\s*<([^>]+)>/u.exec(next);
  if (!matched) fail("TREE_NEXT_LINK_INVALID");
  const url = checkedInitialUrl(matched[1]);
  if (url.pathname !== TREE_PATH || url.searchParams.get("recursive") !== "true"
    || url.searchParams.get("expand") !== "true"
    || url.searchParams.get("limit") !== "100"
    || !url.searchParams.get("cursor")) fail("TREE_NEXT_LINK_UNSAFE");
  return url.toString();
}

function normalizeTreeEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 1) fail("TREE_PAGE_INVALID");
  return entries.map((entry) => {
    if (!exactObject(entry) || !safeRemotePath(entry.path)
      || !["file", "directory"].includes(entry.type)) fail("TREE_ENTRY_INVALID");
    if (entry.type === "directory") return { path: entry.path, type: "directory" };
    if (!Number.isSafeInteger(entry.size) || entry.size < 0
      || !SHA1.test(entry.oid ?? "")) fail("TREE_FILE_ENTRY_INVALID", entry.path);
    const normalized = { path: entry.path, type: "file", size: entry.size, oid: entry.oid };
    if (entry.lfs !== undefined) {
      if (!exactObject(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
        || entry.lfs.size !== entry.size) fail("TREE_LFS_ENTRY_INVALID", entry.path);
      normalized.lfs = { oid: entry.lfs.oid, size: entry.lfs.size };
    }
    return normalized;
  });
}

async function fetchPinnedTree(fetchImpl, bracket) {
  const entries = [];
  const rawPages = [];
  let next = `${HF_API}/tree/${EXYLOS_REVISION}?recursive=true&expand=true&limit=100`;
  const seen = new Set();
  for (let page = 1; next !== null; page += 1) {
    if (seen.has(next) || page > MAX_TREE_PAGES) fail("TREE_PAGINATION_INVALID");
    seen.add(next);
    const fetched = await jsonFetch(next, fetchImpl);
    entries.push(...normalizeTreeEntries(fetched.value));
    rawPages.push({ path: `source-support/tree-${bracket}-${String(page)
      .padStart(3, "0")}.json`, fetchUrl: next, bytes: fetched.bytes });
    next = parseNextTreeLink(fetched.headers.get("link"));
  }
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) fail("TREE_DUPLICATE_PATH");
  const normalized = [...entries].sort((a, b) => a.path.localeCompare(b.path));
  return { entries: normalized, rawPages, pages: rawPages.length,
    snapshotHash: exylosDigest(normalized, `${EXYLOS_SOURCE_SCHEMA}/tree`) };
}

function remoteBinding(entry) {
  return entry.lfs
    ? { kind: "LFS_SHA256", value: `sha256:${entry.lfs.oid}` }
    : { kind: "GIT_BLOB_SHA1", value: entry.oid };
}

function selectedProjection(entries) {
  return entries.map(({ path: objectPath, sizeBytes, remoteBinding: binding }) =>
    ({ path: objectPath, sizeBytes, remoteBinding: binding }));
}

export function selectExylosNoVideoEntries(treeEntries) {
  if (!Array.isArray(treeEntries)) fail("TREE_INVALID");
  const files = treeEntries.filter((entry) => entry.type === "file");
  const directories = treeEntries.filter((entry) => entry.type === "directory");
  const treeBytes = files.reduce((sum, entry) => sum + entry.size, 0);
  const excluded = files.filter((entry) => isVisualPath(entry.path));
  const selected = files.filter((entry) => !isVisualPath(entry.path)).map((entry) => ({
    path: entry.path, sizeBytes: entry.size, remoteBinding: remoteBinding(entry),
  })).sort((a, b) => a.path.localeCompare(b.path));
  const parquet = selected.filter((entry) => entry.path.endsWith(".parquet"));
  const support = selected.filter((entry) => !entry.path.endsWith(".parquet"));
  const excludedBytes = excluded.reduce((sum, entry) => sum + entry.size, 0);
  const parquetBytes = parquet.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const supportBytes = support.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (treeEntries.length !== EXPECTED.treeEntries || files.length !== EXPECTED.treeFiles
    || directories.length !== EXPECTED.treeDirectories || treeBytes !== EXPECTED.treeFileBytes
    || selected.length !== EXPECTED.selectedFiles
    || parquet.length !== EXPECTED.parquetFiles || parquetBytes !== EXPECTED.parquetBytes
    || support.length !== EXPECTED.supportFiles || supportBytes !== EXPECTED.supportBytes
    || selected.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== EXPECTED.selectedBytes
    || excluded.length !== EXPECTED.excludedVisualObjects
    || excludedBytes !== EXPECTED.excludedVisualBytes
    || excluded.filter((entry) => entry.path.endsWith(".mp4")).length
      !== EXPECTED.excludedMp4Objects
    || excluded.filter((entry) => entry.path.endsWith(".gif")).length
      !== EXPECTED.excludedGifObjects
    || !same(support.map((entry) => entry.path), SUPPORT_PATHS)) {
    fail("TREE_CANONICAL_PROFILE_CHANGED");
  }
  if (parquet.some((entry) => !/^data\/chunk-000\/episode_\d{6}\.parquet$/u.test(entry.path)
    || entry.remoteBinding.kind !== "LFS_SHA256")) fail("PARQUET_SELECTION_INVALID");
  if (!same(parquet.map((entry) => entry.path), Array.from({ length: 50 }, (_, index) =>
    `data/chunk-000/episode_${String(index).padStart(6, "0")}.parquet`))) {
    fail("PARQUET_EPISODE_SEQUENCE_INVALID");
  }
  return { selected, treeEntries: treeEntries.length, treeFiles: files.length,
    treeDirectories: directories.length, treeFileBytes: treeBytes,
    parquetFiles: parquet.length, parquetBytes, supportFiles: support.length,
    supportBytes, selectedBytes: parquetBytes + supportBytes,
    excludedVisualObjects: excluded.length, excludedVisualBytes: excludedBytes,
    excludedMp4Objects: EXPECTED.excludedMp4Objects,
    excludedGifObjects: EXPECTED.excludedGifObjects };
}

function repositoryProjection(metadata) {
  if (!exactObject(metadata) || metadata.id !== EXYLOS_DATASET_ID
    || metadata.sha !== EXYLOS_REVISION || metadata.private !== false
    || metadata.gated !== false || metadata.disabled !== false
    || String(metadata.cardData?.license ?? "").toLowerCase() !== "apache-2.0") {
    fail("REPOSITORY_RECORD_INVALID");
  }
  const tags = Array.isArray(metadata.tags) ? [...metadata.tags].sort() : [];
  for (const required of ["synthetic", "human-in-the-loop", "license:apache-2.0"]) {
    if (!tags.includes(required)) fail("REPOSITORY_TAG_MISSING", required);
  }
  return { datasetId: metadata.id, revision: metadata.sha, private: false, gated: false,
    disabled: false, publisherCardLicenseClaim: "apache-2.0", tags,
    lastModified: typeof metadata.lastModified === "string" ? metadata.lastModified : null };
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function safeTarget(root, remotePath) {
  if (!safeRemotePath(remotePath)) fail("REMOTE_PATH_UNSAFE", remotePath);
  const target = path.resolve(root, ...remotePath.split("/"));
  const relative = path.relative(path.resolve(root), target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("REMOTE_PATH_ESCAPE", remotePath);
  return target;
}

function checkRemoteBytes(entry, bytes) {
  if (bytes.length !== entry.sizeBytes) fail("REMOTE_SIZE_MISMATCH", entry.path);
  const sha256 = exylosSha256(bytes);
  if (entry.remoteBinding.kind === "LFS_SHA256"
    && entry.remoteBinding.value !== sha256) fail("REMOTE_LFS_MISMATCH", entry.path);
  if (entry.remoteBinding.kind === "GIT_BLOB_SHA1"
    && entry.remoteBinding.value !== gitBlobOid(bytes)) fail("REMOTE_GIT_MISMATCH", entry.path);
  return sha256;
}

async function mapConcurrent(values, width, operation) {
  const result = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      result[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, values.length) }, worker));
  return result;
}

function supportEntry(item) {
  return { path: item.path, fetchUrl: item.fetchUrl,
    sizeBytes: item.bytes.length, sha256: exylosSha256(item.bytes) };
}

function publishSource(staging, target) {
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("OUTPUT_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "raw"), path.join(target, "raw"));
    renameSync(path.join(staging, "source-support"), path.join(target, "source-support"));
    renameSync(path.join(staging, "acquisition-manifest.json"),
      path.join(target, "acquisition-manifest.json"));
    rmdirSync(staging);
  } catch { fail("OUTPUT_PUBLISH_FAILED", target); }
}

export async function acquirePinnedExylosSource(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_BROAD");
  ensurePrivateDirectory(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  try {
    const recordBeforeRaw = await jsonFetch(`${HF_API}/revision/${EXYLOS_REVISION}`, fetchImpl);
    const recordBefore = repositoryProjection(recordBeforeRaw.value);
    const treeBefore = await fetchPinnedTree(fetchImpl, "before");
    const selectionBefore = selectExylosNoVideoEntries(treeBefore.entries);
    if (treeBefore.pages !== EXPECTED.treePages) fail("TREE_PAGE_COUNT_CHANGED");
    const downloaded = await mapConcurrent(selectionBefore.selected, 6, async (entry, index) => {
      const encoded = entry.path.split("/").map(encodeURIComponent).join("/");
      const fetched = await boundedFetch(`${RAW_ROOT}/${encoded}?download=true`,
        Math.max(entry.sizeBytes, 1), "application/octet-stream,text/plain;q=0.8", fetchImpl);
      const sha256 = checkRemoteBytes(entry, fetched.bytes);
      writePrivate(safeTarget(path.join(staging, "raw"), entry.path), fetched.bytes);
      options.onProgress?.(index + 1, selectionBefore.selected.length, entry.path);
      return { ...entry, sha256, transportFinalHost: fetched.finalHost };
    });
    const readme = readFileSync(path.join(staging, "raw", "README.md"), "utf8");
    const license = readFileSync(path.join(staging, "raw", "LICENSE_1.txt"), "utf8");
    if (!/(^|\n)license:\s*apache-2\.0\s*($|\n)/iu.test(readme)
      || !/virtual Franka Panda/iu.test(readme)
      || !/without requiring every trajectory to be collected on a physical robot/iu.test(readme)
      || !/Apache License[\s\S]{0,80}Version 2\.0/iu.test(license)) {
      fail("PINNED_RIGHTS_OR_GENERATION_CLAIM_INVALID");
    }
    const treeAfter = await fetchPinnedTree(fetchImpl, "after");
    const selectionAfter = selectExylosNoVideoEntries(treeAfter.entries);
    const recordAfterRaw = await jsonFetch(`${HF_API}/revision/${EXYLOS_REVISION}`, fetchImpl);
    const recordAfter = repositoryProjection(recordAfterRaw.value);
    if (treeAfter.pages !== EXPECTED.treePages || !same(recordBefore, recordAfter)
      || treeBefore.snapshotHash !== treeAfter.snapshotHash
      || !same(selectedProjection(selectionBefore.selected),
        selectedProjection(selectionAfter.selected))) {
      fail("REMOTE_RECORD_OR_TREE_CHANGED_DURING_ACQUISITION");
    }
    const sourceSupport = [
      { path: "source-support/repository-before.json",
        fetchUrl: `${HF_API}/revision/${EXYLOS_REVISION}`, bytes: recordBeforeRaw.bytes },
      ...treeBefore.rawPages,
      ...treeAfter.rawPages,
      { path: "source-support/repository-after.json",
        fetchUrl: `${HF_API}/revision/${EXYLOS_REVISION}`, bytes: recordAfterRaw.bytes },
    ];
    for (const item of sourceSupport) {
      writePrivate(path.join(staging, ...item.path.split("/")), item.bytes);
    }
    const manifestBody = {
      schema: EXYLOS_SOURCE_SCHEMA, capturedAt: EXYLOS_FROZEN_AT,
      datasetId: EXYLOS_DATASET_ID, pinnedRevision: EXYLOS_REVISION,
      recordBefore, recordAfter, recordStableDuringAcquisition: true,
      treeBefore: { pages: treeBefore.pages, entryCount: treeBefore.entries.length,
        snapshotHash: treeBefore.snapshotHash,
        selectedObjects: selectedProjection(selectionBefore.selected) },
      treeAfter: { pages: treeAfter.pages, entryCount: treeAfter.entries.length,
        snapshotHash: treeAfter.snapshotHash,
        selectedObjects: selectedProjection(selectionAfter.selected) },
      treeStableDuringAcquisition: true,
      selection: {
        rule: "every repository file except .mp4 and .gif visual payloads",
        ...Object.fromEntries(Object.entries(selectionBefore)
          .filter(([key]) => key !== "selected")),
        imageryBytesFetched: false, videoBytesFetched: false, audioBytesFetched: false,
        visualReplayEstablished: false,
      },
      generationBoundary: {
        publisherClaimsVrTeleoperation: true,
        publisherClaimsHumanSeeded: true,
        publisherClaimsProceduralExpansion: true,
        publisherClaimsPhysicsConsistentVariations: true,
        independentPhysicsValidationPerformed: false,
        physicalRobotExecutionEstablished: false,
      },
      rights: {
        publisherCardLicenseClaim: "Apache-2.0",
        publisherReadmeLicenseClaimBytePinned: true,
        standaloneApacheLicenseBytesPinned: true,
        legalAdjudicationPerformed: false,
        productionTrainingAuthorizedByOutsider: false,
        artifactRedistributionAuthorityEstablished: false,
      },
      privacy: {
        humanSeededPublisherClaim: true, rawImageryFetched: false,
        videoReferencesPresentInParquet: true, publisherPrivacyStatementFound: false,
        participantConsentEstablished: false, noPiiGuaranteed: false,
      },
      transportAttested: false,
      sourceSupportObjects: sourceSupport.map(supportEntry)
        .sort((a, b) => a.path.localeCompare(b.path)),
      remoteObjects: downloaded.sort((a, b) => a.path.localeCompare(b.path)),
    };
    const manifest = { ...manifestBody,
      manifestHash: exylosDigest(manifestBody, `${EXYLOS_SOURCE_SCHEMA}/manifest`) };
    writePrivate(path.join(staging, "acquisition-manifest.json"), canonicalBytes(manifest));
    publishSource(staging, target);
    const manifestBytes = readFileSync(path.join(target, "acquisition-manifest.json"));
    return { sourceDirectory: target, manifest,
      manifestFileSha256: exylosSha256(manifestBytes) };
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function checkedLocalPath(root, relative) {
  if (!safeRemotePath(relative)) fail("SOURCE_PATH_INVALID", relative);
  const target = path.resolve(root, ...relative.split("/"));
  const relation = path.relative(path.resolve(root), target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("SOURCE_PATH_ESCAPE", relative);
  return target;
}

function readPrivateStable(root, relative, expected = null,
  maximumBytes = MAX_REMOTE_BYTES) {
  const target = checkedLocalPath(root, relative);
  const linkStat = lstatSync(target, { bigint: true });
  if (linkStat.isSymbolicLink() || !linkStat.isFile()
    || Number(linkStat.mode & 0o777n) !== 0o600 || linkStat.size < 1n
    || linkStat.size > BigInt(maximumBytes)) fail("SOURCE_FILE_UNSAFE", relative);
  let descriptor;
  try {
    descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.dev !== linkStat.dev || before.ino !== linkStat.ino
      || before.mode !== linkStat.mode || before.dev !== after.dev || before.ino !== after.ino
      || before.mode !== after.mode || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || bytes.length !== Number(before.size)) fail("SOURCE_FILE_CHANGED", relative);
    if (expected && (bytes.length !== expected.sizeBytes
      || exylosSha256(bytes) !== expected.sha256)) fail("SOURCE_OBJECT_MISMATCH", relative);
    return bytes;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function assertPrivateExactTree(root, files) {
  const expected = new Map([["", new Set()]]);
  for (const relative of files) {
    const parts = relative.split("/");
    let parent = "";
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      expected.get(parent).add(part);
      if (index < parts.length - 1) {
        parent = parent ? `${parent}/${part}` : part;
        if (!expected.has(parent)) expected.set(parent, new Set());
      }
    }
  }
  for (const [relative, children] of expected) {
    const directory = relative ? checkedLocalPath(root, relative) : path.resolve(root);
    const before = lstatSync(directory, { bigint: true });
    if (!before.isDirectory() || before.isSymbolicLink()
      || Number(before.mode & 0o777n) !== 0o700) fail("SOURCE_DIRECTORY_UNSAFE", relative);
    if (!same(sorted(readdirSync(directory)), sorted(children))) {
      fail("SOURCE_DIRECTORY_LAYOUT_INVALID", relative);
    }
    const after = lstatSync(directory, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      fail("SOURCE_DIRECTORY_CHANGED", relative);
    }
  }
}

function validateRemoteObject(entry) {
  if (!exactObject(entry) || !safeRemotePath(entry.path)
    || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 1
    || entry.sizeBytes > MAX_REMOTE_BYTES || !HASH.test(entry.sha256 ?? "")
    || !exactObject(entry.remoteBinding)
    || typeof entry.transportFinalHost !== "string"
    || !ALLOWED_FETCH_HOST.test(entry.transportFinalHost)) fail("REMOTE_OBJECT_INVALID");
  if (entry.remoteBinding.kind === "LFS_SHA256") {
    if (entry.remoteBinding.value !== entry.sha256) fail("LFS_BINDING_INVALID", entry.path);
  } else if (entry.remoteBinding.kind === "GIT_BLOB_SHA1") {
    if (!SHA1.test(entry.remoteBinding.value ?? "")) fail("GIT_BINDING_INVALID", entry.path);
  } else fail("REMOTE_BINDING_KIND_INVALID", entry.path);
}

function validateSupportObject(entry) {
  if (!exactObject(entry)
    || !/^source-support\/(repository-(before|after)|tree-(before|after)-\d{3})\.json$/u
      .test(entry.path ?? "")
    || typeof entry.fetchUrl !== "string" || !Number.isSafeInteger(entry.sizeBytes)
    || entry.sizeBytes < 1 || entry.sizeBytes > MAX_API_BYTES
    || !HASH.test(entry.sha256 ?? "")) fail("SUPPORT_OBJECT_INVALID");
  checkedInitialUrl(entry.fetchUrl);
}

function validateManifest(manifest) {
  if (!exactObject(manifest)) fail("SOURCE_MANIFEST_INVALID");
  const { manifestHash, ...body } = manifest;
  if (manifest.schema !== EXYLOS_SOURCE_SCHEMA || manifest.capturedAt !== EXYLOS_FROZEN_AT
    || manifest.datasetId !== EXYLOS_DATASET_ID || manifest.pinnedRevision !== EXYLOS_REVISION
    || manifest.recordStableDuringAcquisition !== true
    || manifest.treeStableDuringAcquisition !== true || manifest.transportAttested !== false
    || manifestHash !== exylosDigest(body, `${EXYLOS_SOURCE_SCHEMA}/manifest`)) {
    fail("SOURCE_MANIFEST_IDENTITY_INVALID");
  }
  if (!same(manifest.recordBefore, manifest.recordAfter)) fail("RECORD_BRACKET_INVALID");
  repositoryProjection({ id: manifest.recordBefore.datasetId,
    sha: manifest.recordBefore.revision, private: manifest.recordBefore.private,
    gated: manifest.recordBefore.gated, disabled: manifest.recordBefore.disabled,
    cardData: { license: manifest.recordBefore.publisherCardLicenseClaim },
    tags: manifest.recordBefore.tags, lastModified: manifest.recordBefore.lastModified });
  const selection = manifest.selection;
  for (const [key, expected] of Object.entries({
    treeEntries: EXPECTED.treeEntries, treeFiles: EXPECTED.treeFiles,
    treeDirectories: EXPECTED.treeDirectories, treeFileBytes: EXPECTED.treeFileBytes,
    parquetFiles: EXPECTED.parquetFiles, parquetBytes: EXPECTED.parquetBytes,
    supportFiles: EXPECTED.supportFiles, supportBytes: EXPECTED.supportBytes,
    selectedBytes: EXPECTED.selectedBytes,
    excludedVisualObjects: EXPECTED.excludedVisualObjects,
    excludedVisualBytes: EXPECTED.excludedVisualBytes,
    excludedMp4Objects: EXPECTED.excludedMp4Objects,
    excludedGifObjects: EXPECTED.excludedGifObjects,
  })) if (selection?.[key] !== expected) fail("MANIFEST_SELECTION_INVALID", key);
  if (selection.imageryBytesFetched !== false || selection.videoBytesFetched !== false
    || selection.audioBytesFetched !== false || selection.visualReplayEstablished !== false
    || manifest.generationBoundary?.publisherClaimsVrTeleoperation !== true
    || manifest.generationBoundary?.publisherClaimsHumanSeeded !== true
    || manifest.generationBoundary?.publisherClaimsProceduralExpansion !== true
    || manifest.generationBoundary?.publisherClaimsPhysicsConsistentVariations !== true
    || manifest.generationBoundary?.independentPhysicsValidationPerformed !== false
    || manifest.generationBoundary?.physicalRobotExecutionEstablished !== false
    || manifest.rights?.publisherCardLicenseClaim !== "Apache-2.0"
    || manifest.rights?.publisherReadmeLicenseClaimBytePinned !== true
    || manifest.rights?.standaloneApacheLicenseBytesPinned !== true
    || manifest.rights?.legalAdjudicationPerformed !== false
    || manifest.rights?.productionTrainingAuthorizedByOutsider !== false
    || manifest.rights?.artifactRedistributionAuthorityEstablished !== false
    || manifest.privacy?.humanSeededPublisherClaim !== true
    || manifest.privacy?.rawImageryFetched !== false
    || manifest.privacy?.videoReferencesPresentInParquet !== true
    || manifest.privacy?.publisherPrivacyStatementFound !== false
    || manifest.privacy?.participantConsentEstablished !== false
    || manifest.privacy?.noPiiGuaranteed !== false) fail("MANIFEST_BOUNDARY_INVALID");
  if (!Array.isArray(manifest.remoteObjects)
    || manifest.remoteObjects.length !== EXPECTED.selectedFiles
    || !Array.isArray(manifest.sourceSupportObjects)
    || manifest.sourceSupportObjects.length !== 10) fail("MANIFEST_OBJECT_COUNT_INVALID");
  manifest.remoteObjects.forEach(validateRemoteObject);
  manifest.sourceSupportObjects.forEach(validateSupportObject);
  const remotePaths = manifest.remoteObjects.map((entry) => entry.path);
  const supportPaths = manifest.sourceSupportObjects.map((entry) => entry.path);
  if (new Set(remotePaths).size !== remotePaths.length
    || new Set(supportPaths).size !== supportPaths.length
    || !same(remotePaths, sorted(remotePaths)) || !same(supportPaths, sorted(supportPaths))) {
    fail("MANIFEST_PATH_ORDER_INVALID");
  }
  if (manifest.treeBefore?.pages !== EXPECTED.treePages
    || manifest.treeAfter?.pages !== EXPECTED.treePages
    || manifest.treeBefore?.entryCount !== EXPECTED.treeEntries
    || manifest.treeAfter?.entryCount !== EXPECTED.treeEntries
    || !HASH.test(manifest.treeBefore?.snapshotHash ?? "")
    || manifest.treeBefore.snapshotHash !== manifest.treeAfter.snapshotHash
    || !same(manifest.treeBefore.selectedObjects, manifest.treeAfter.selectedObjects)
    || !same(manifest.treeBefore.selectedObjects,
      selectedProjection(manifest.remoteObjects))) fail("MANIFEST_TREE_BRACKET_INVALID");
  return manifest;
}

function replaySupport(manifest, supportBytes) {
  const beforeRaw = parseJson(supportBytes.get("source-support/repository-before.json"),
    "RECORD_BEFORE_JSON_INVALID");
  const afterRaw = parseJson(supportBytes.get("source-support/repository-after.json"),
    "RECORD_AFTER_JSON_INVALID");
  if (!same(repositoryProjection(beforeRaw), manifest.recordBefore)
    || !same(repositoryProjection(afterRaw), manifest.recordAfter)) {
    fail("RECORD_SUPPORT_REPLAY_INVALID");
  }
  for (const bracket of ["before", "after"]) {
    const pages = manifest.sourceSupportObjects.filter((entry) =>
      entry.path.startsWith(`source-support/tree-${bracket}-`));
    if (pages.length !== EXPECTED.treePages) fail("TREE_SUPPORT_PAGE_COUNT_INVALID");
    const entries = [];
    for (const [index, page] of pages.entries()) {
      const url = checkedInitialUrl(page.fetchUrl);
      if (url.pathname !== TREE_PATH || url.searchParams.get("recursive") !== "true"
        || url.searchParams.get("expand") !== "true"
        || url.searchParams.get("limit") !== "100"
        || (index === 0 ? url.searchParams.has("cursor")
          : !url.searchParams.get("cursor"))) fail("TREE_SUPPORT_URL_INVALID", page.path);
      entries.push(...normalizeTreeEntries(parseJson(supportBytes.get(page.path),
        "TREE_SUPPORT_JSON_INVALID")));
    }
    const paths = entries.map((entry) => entry.path);
    if (new Set(paths).size !== paths.length) fail("TREE_SUPPORT_DUPLICATE_PATH");
    const normalized = [...entries].sort((a, b) => a.path.localeCompare(b.path));
    const selected = selectExylosNoVideoEntries(normalized);
    const summary = bracket === "before" ? manifest.treeBefore : manifest.treeAfter;
    if (entries.length !== summary.entryCount
      || exylosDigest(normalized, `${EXYLOS_SOURCE_SCHEMA}/tree`) !== summary.snapshotHash
      || !same(selectedProjection(selected.selected), summary.selectedObjects)) {
      fail("TREE_SUPPORT_REPLAY_INVALID", bracket);
    }
  }
}

export function verifyExylosSourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const manifestBytes = readPrivateStable(root, "acquisition-manifest.json", null,
    4 * 1024 * 1024);
  const manifest = validateManifest(parseJson(manifestBytes, "SOURCE_MANIFEST_JSON_INVALID"));
  const expectedFiles = ["acquisition-manifest.json",
    ...manifest.remoteObjects.map((entry) => `raw/${entry.path}`),
    ...manifest.sourceSupportObjects.map((entry) => entry.path)];
  assertPrivateExactTree(root, expectedFiles);
  let selectedBytes = 0;
  for (const entry of manifest.remoteObjects) {
    const bytes = readPrivateStable(root, `raw/${entry.path}`, entry);
    if (entry.remoteBinding.kind === "LFS_SHA256"
      && entry.remoteBinding.value !== exylosSha256(bytes)) {
      fail("SOURCE_LFS_REPLAY_INVALID", entry.path);
    }
    if (entry.remoteBinding.kind === "GIT_BLOB_SHA1"
      && entry.remoteBinding.value !== gitBlobOid(bytes)) {
      fail("SOURCE_GIT_REPLAY_INVALID", entry.path);
    }
    selectedBytes += bytes.length;
  }
  if (selectedBytes !== EXPECTED.selectedBytes) fail("SOURCE_SELECTED_BYTES_INVALID");
  const supportBytes = new Map();
  for (const entry of manifest.sourceSupportObjects) {
    supportBytes.set(entry.path, readPrivateStable(root, entry.path, entry, MAX_API_BYTES));
  }
  replaySupport(manifest, supportBytes);
  const readme = readPrivateStable(root, "raw/README.md",
    manifest.remoteObjects.find((entry) => entry.path === "README.md")).toString("utf8");
  const license = readPrivateStable(root, "raw/LICENSE_1.txt",
    manifest.remoteObjects.find((entry) => entry.path === "LICENSE_1.txt")).toString("utf8");
  if (!/(^|\n)license:\s*apache-2\.0\s*($|\n)/iu.test(readme)
    || !/virtual Franka Panda/iu.test(readme)
    || !/without requiring every trajectory to be collected on a physical robot/iu.test(readme)
    || !/Apache License[\s\S]{0,80}Version 2\.0/iu.test(license)) {
    fail("SOURCE_RIGHTS_OR_GENERATION_REPLAY_INVALID");
  }
  assertPrivateExactTree(root, expectedFiles);
  return Object.freeze({ ok: true, verificationLevel: "FULL_NO_VIDEO_SOURCE_BYTE_REPLAY",
    sourceDirectory: root, manifest,
    manifestFileSha256: exylosSha256(manifestBytes),
    sourceRoot: exylosDigest(manifest.remoteObjects.map(({ path: objectPath,
      sizeBytes, sha256 }) => ({ path: objectPath, sizeBytes, sha256 })),
    `${EXYLOS_SOURCE_SCHEMA}/source-root`) });
}

const PYARROW_REPLAY = String.raw`
import json
import math
import os
import platform
import stat
import sys
from collections import Counter
import pyarrow
import pyarrow.parquet as pq

root = os.path.realpath(sys.argv[1])
raw = os.path.join(root, "raw")

def die(code, detail=""):
    raise RuntimeError(code + ((":" + detail) if detail else ""))

def load_bytes(relative):
    target = os.path.join(raw, *relative.split("/"))
    st = os.lstat(target)
    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode) or stat.S_IMODE(st.st_mode) != 0o600:
        die("SOURCE_FILE_UNSAFE", relative)
    fd = os.open(target, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(fd)
        data = b""
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk: break
            data += chunk
        after = os.fstat(fd)
        identity = lambda x: (x.st_dev, x.st_ino, x.st_mode, x.st_size,
                              x.st_mtime_ns, x.st_ctime_ns)
        if identity(before) != identity(after) or len(data) != before.st_size:
            die("SOURCE_FILE_CHANGED", relative)
        return data
    finally:
        os.close(fd)

def load_json(relative):
    return json.loads(load_bytes(relative).decode("utf-8"))

def load_jsonl(relative):
    return [json.loads(line) for line in load_bytes(relative).decode("utf-8").splitlines()
            if line.strip()]

def finite_scalar(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)

def finite_vector(values, width):
    return isinstance(values, list) and len(values) == width and all(finite_scalar(x) for x in values)

annotations_obj = load_json("annotations.json")
episodes_meta = load_jsonl("episodes.jsonl")
stats_meta = load_jsonl("episodes_stats.jsonl")
info = load_json("info.json")
tasks = load_jsonl("tasks.jsonl")
annotations = annotations_obj.get("episodes") if isinstance(annotations_obj, dict) else None
if not isinstance(annotations, list) or len(annotations) != 50:
    die("ANNOTATIONS_INVALID")
if len(episodes_meta) != 50 or len(stats_meta) != 50 or len(tasks) != 1:
    die("METADATA_ROW_COUNT_INVALID")
if info.get("codebase_version") != "v2.1" or info.get("robot_type") != "panda" or info.get("fps") != 30.0:
    die("INFO_IDENTITY_INVALID")
for key, expected in [("total_episodes", 50), ("total_frames", 21412),
                      ("total_tasks", 1), ("total_videos", 250),
                      ("total_chunks", 1), ("chunks_size", 1000)]:
    if info.get(key) != expected: die("INFO_COUNT_INVALID", key)
if info.get("splits") != {"train": "0:50"}:
    die("INFO_SPLIT_INVALID")
if tasks != [{"task_index": 0, "task": "Pick up an object and place it into a container"}]:
    die("TASK_INVALID")

expected_names = ["timestamp", "frame_index", "episode_index", "index", "task_index",
                  "next.done", "next.success", "observation.state", "action",
                  "observation.images.wrist_cam", "observation.images.front_cam",
                  "observation.images.left_cam", "observation.images.top_cam",
                  "observation.images.right_cam"]
expected_types = ["float", "int64", "int64", "int64", "int64", "bool", "bool",
                  "fixed_size_list<element: float>[9]", "fixed_size_list<element: float>[9]",
                  "struct<path: string, timestamp: float>",
                  "struct<path: string, timestamp: float>",
                  "struct<path: string, timestamp: float>",
                  "struct<path: string, timestamp: float>",
                  "struct<path: string, timestamp: float>"]
cameras = [name for name in expected_names if name.startswith("observation.images.")]
phase_counts = Counter()
failure_counts = Counter()
correction_distribution = Counter()
correction_episode_ids = []
terminal_success_true_units = 0
terminal_label_disagreement_ids = []
episode_summaries = []
global_cursor = 0
total_frames = 0
video_reference_rows = 0
schema_string = None

for episode in range(50):
    expected_id = "episode_" + str(episode).zfill(6)
    annotation = annotations[episode]
    meta = episodes_meta[episode]
    stats = stats_meta[episode]
    if annotation.get("episode_id") != expected_id or meta.get("episode_index") != episode \
       or stats.get("episode_index") != episode:
        die("EPISODE_JOIN_INVALID", str(episode))
    if annotation.get("success") is not annotation.get("task_success"):
        die("PUBLISHER_LABEL_MISMATCH", str(episode))
    publisher_success = annotation.get("success")
    if not isinstance(publisher_success, bool): die("PUBLISHER_SUCCESS_INVALID", str(episode))
    reason = annotation.get("failure_reason")
    if reason not in ["none", "operator_abort", "slip_drop"]:
        die("FAILURE_REASON_INVALID", str(episode))
    if (publisher_success and reason != "none") or ((not publisher_success) and reason == "none"):
        die("FAILURE_REASON_LABEL_MISMATCH", str(episode))
    failure_counts[reason] += 1
    length = meta.get("length")
    if not isinstance(length, int) or length < 1 or meta.get("tasks") != [tasks[0]["task"]]:
        die("EPISODE_META_INVALID", str(episode))
    stats_payload = stats.get("stats")
    if not isinstance(stats_payload, dict) or set(stats_payload) != {"observation.state", "action", "timestamp"}:
        die("EPISODE_STATS_INVALID", str(episode))
    for field, width in [("observation.state", 9), ("action", 9), ("timestamp", 1)]:
        profile = stats_payload.get(field)
        if not isinstance(profile, dict) or set(profile) != {"min", "max", "mean", "std", "count"}:
            die("STATS_PROFILE_INVALID", str(episode))
        for measure in ["min", "max", "mean", "std"]:
            if not finite_vector(profile.get(measure), width): die("STATS_NUMERIC_INVALID", str(episode))
        if profile.get("count") != [length]: die("STATS_COUNT_INVALID", str(episode))

    parquet_path = "data/chunk-000/" + expected_id + ".parquet"
    parquet_bytes = load_bytes(parquet_path)
    table = pq.read_table(pyarrow.BufferReader(parquet_bytes))
    names = table.schema.names
    types = [str(field.type) for field in table.schema]
    if names != expected_names or types != expected_types:
        die("PARQUET_SCHEMA_INVALID", str(episode))
    current_schema = str(table.schema)
    if schema_string is None: schema_string = current_schema
    elif current_schema != schema_string: die("PARQUET_SCHEMA_DRIFT", str(episode))
    if table.num_rows != length: die("PARQUET_LENGTH_INVALID", str(episode))
    cols = {name: table.column(name).combine_chunks().to_pylist() for name in expected_names}
    timestamps = cols["timestamp"]
    if any(not finite_scalar(value) for value in timestamps): die("TIMESTAMP_INVALID", str(episode))
    if any(timestamps[i] <= timestamps[i-1] for i in range(1, length)):
        die("TIMESTAMP_NOT_STRICT", str(episode))
    if any(abs(timestamps[i] - i / 30.0) > 0.0001 for i in range(length)):
        die("TIMESTAMP_FPS_MISMATCH", str(episode))
    if cols["frame_index"] != list(range(length)):
        die("FRAME_INDEX_INVALID", str(episode))
    if cols["episode_index"] != [episode] * length or cols["task_index"] != [0] * length:
        die("EPISODE_OR_TASK_INDEX_INVALID", str(episode))
    if cols["index"] != list(range(global_cursor, global_cursor + length)):
        die("GLOBAL_INDEX_INVALID", str(episode))
    if cols["next.done"] != [False] * (length - 1) + [True]:
        die("DONE_FLAG_INVALID", str(episode))
    terminal_success = cols["next.success"][-1]
    if cols["next.success"][:-1] != [False] * (length - 1) \
       or not isinstance(terminal_success, bool):
        die("PUBLISHER_SUCCESS_FLAG_INVALID", str(episode))
    terminal_success_true_units += int(terminal_success)
    terminal_label_agrees = terminal_success == publisher_success
    if not terminal_label_agrees:
        terminal_label_disagreement_ids.append(episode)
    for field in ["observation.state", "action"]:
        if any(not finite_vector(row, 9) for row in cols[field]):
            die("STATE_OR_ACTION_INVALID", str(episode))
    for camera in cameras:
        expected_video = "videos/chunk-000/" + camera + "/" + expected_id + ".mp4"
        for index, reference in enumerate(cols[camera]):
            if not isinstance(reference, dict) or reference.get("path") != expected_video \
               or not finite_scalar(reference.get("timestamp")) \
               or abs(reference["timestamp"] - timestamps[index]) > 0.0001:
                die("VIDEO_REFERENCE_INVALID", str(episode))
            video_reference_rows += 1

    phases = annotation.get("phase_annotations")
    if not isinstance(phases, list) or not phases: die("PHASES_INVALID", str(episode))
    correction_phases = 0
    for phase in phases:
        name = phase.get("phase") if isinstance(phase, dict) else None
        frame_range = phase.get("frame_range") if isinstance(phase, dict) else None
        if name not in ["approach", "grasp", "transport", "place", "retract", "correction"] \
           or not isinstance(frame_range, list) or len(frame_range) != 2 \
           or any(not isinstance(x, int) for x in frame_range) \
           or frame_range[0] < 0 or frame_range[1] < frame_range[0] or frame_range[1] >= length:
            die("PHASE_INVALID", str(episode))
        phase_counts[name] += 1
        correction_phases += int(name == "correction")
    measurements = annotation.get("raw_measurements")
    correction_count = measurements.get("correction_count") if isinstance(measurements, dict) else None
    if not isinstance(correction_count, int) or correction_count < 0:
        die("CORRECTION_COUNT_INVALID", str(episode))
    if (correction_count > 0) != (correction_phases > 0):
        die("CORRECTION_PHASE_MISMATCH", str(episode))
    correction_distribution[str(correction_count)] += 1
    if correction_count > 0:
        correction_episode_ids.append(episode)
        if not publisher_success: die("CORRECTION_FAILURE_LABEL_UNEXPECTED", str(episode))
    scorer = annotation.get("scorer_id")
    if scorer != "auto_v1.1.0": die("SCORER_INVALID", str(episode))
    episode_summaries.append({
        "episodeIndex": episode, "frames": length,
        "publisherSuccess": publisher_success, "publisherFailureReason": reason,
        "parquetTerminalSuccessFlag": terminal_success,
        "publisherLabelFieldsAgree": terminal_label_agrees,
        "publisherCorrectionCount": correction_count,
        "publisherCorrectionPhaseUnits": correction_phases,
        "terminalDoneFlagReplayed": True,
        "terminalPublisherSuccessFlagMatched": terminal_label_agrees,
        "stateActionFiniteRows": length,
        "videoReferenceRows": length * len(cameras),
    })
    global_cursor += length
    total_frames += length

if total_frames != 21412 or global_cursor != 21412:
    die("TOTAL_FRAME_COUNT_INVALID")
if failure_counts != Counter({"none": 30, "operator_abort": 14, "slip_drop": 6}):
    die("PUBLISHER_LABEL_COUNTS_INVALID")
if correction_distribution != Counter({"0": 34, "1": 7, "2": 7, "3": 2}):
    die("CORRECTION_DISTRIBUTION_INVALID")
if correction_episode_ids != [10,11,12,13,15,16,17,18,19,20,21,22,23,24,26,45]:
    die("CORRECTION_EPISODE_SET_INVALID")
if terminal_success_true_units != 33 or terminal_label_disagreement_ids != [25,42,43]:
    die("PUBLISHER_TERMINAL_LABEL_CONFLICT_SET_INVALID")
if phase_counts != Counter({"approach": 74, "correction": 27, "grasp": 58,
                            "place": 55, "retract": 52, "transport": 58}):
    die("PHASE_COUNTS_INVALID")

print(json.dumps({
  "parser": {"engine": "pyarrow", "pythonVersion": platform.python_version(),
             "pyarrowVersion": pyarrow.__version__},
  "schema": {"columnNames": expected_names, "columnTypes": expected_types,
             "stateWidth": 9, "actionWidth": 9, "cameraReferenceColumns": cameras},
  "dataset": {"episodeUnits": 50, "frameUnits": total_frames, "fps": 30,
              "taskUnits": 1, "cameraReferenceColumns": 5,
              "videoReferenceRows": video_reference_rows,
              "actualVideoBytesReplayed": False},
  "publisherLabels": {"annotationSuccessUnits": 30, "annotationFailureUnits": 20,
      "failureReasonCounts": dict(sorted(failure_counts.items())),
      "parquetTerminalSuccessTrueUnits": terminal_success_true_units,
      "parquetTerminalSuccessFalseUnits": 50 - terminal_success_true_units,
      "crossFieldAgreementUnits": 50 - len(terminal_label_disagreement_ids),
      "crossFieldDisagreementUnits": len(terminal_label_disagreement_ids),
      "crossFieldDisagreementEpisodeIndices": terminal_label_disagreement_ids,
      "conflictResolutionEstablished": False,
      "scorerIds": ["auto_v1.1.0"]},
  "publisherCorrectionMorphology": {
      "episodesWithCorrectionPhase": 16, "correctionPhaseUnits": 27,
      "correctionCountDistribution": dict(sorted(correction_distribution.items())),
      "correctionEpisodeIndices": correction_episode_ids,
      "correctionThenPublisherSuccessLabelUnits": 16},
  "phaseCounts": dict(sorted(phase_counts.items())),
  "episodeSummaries": episode_summaries,
}, sort_keys=True, separators=(",", ":"), allow_nan=False))
`;

function extractWithPyarrow(sourceDirectory, options = {}) {
  const pythonExecutable = path.resolve(options.pythonExecutable ?? process.env.OUTSIDER_PYTHON ?? ".venv/bin/python");
  if (!existsSync(pythonExecutable)) fail("PYARROW_RUNTIME_MISSING", pythonExecutable);
  const before = verifyExylosSourceDirectory(sourceDirectory);
  const child = spawnSync(pythonExecutable, ["-c", PYARROW_REPLAY, before.sourceDirectory], {
    encoding: "utf8", timeout: PYARROW_TIMEOUT_MS,
    maxBuffer: MAX_PYARROW_OUTPUT_BYTES, windowsHide: true,
    env: { PATH: process.env.PATH ?? "", PYTHONNOUSERSITE: "1", PYTHONHASHSEED: "0" },
  });
  if (child.status !== 0 || child.error || child.signal) {
    fail("PYARROW_REPLAY_FAILED", String(child.stderr || child.error?.message || child.signal)
      .slice(0, 2_000));
  }
  let projection;
  try { projection = JSON.parse(child.stdout); }
  catch { fail("PYARROW_OUTPUT_INVALID"); }
  const after = verifyExylosSourceDirectory(sourceDirectory);
  if (before.sourceRoot !== after.sourceRoot
    || before.manifestFileSha256 !== after.manifestFileSha256) {
    fail("SOURCE_CHANGED_DURING_PYARROW_REPLAY");
  }
  projection.parser.helperSha256 = exylosSha256(Buffer.from(PYARROW_REPLAY, "utf8"));
  projection.parser.timeoutMs = PYARROW_TIMEOUT_MS;
  return { source: after, projection };
}

function validateProjection(projection) {
  if (!exactObject(projection) || projection.parser?.engine !== "pyarrow"
    || typeof projection.parser?.pythonVersion !== "string"
    || typeof projection.parser?.pyarrowVersion !== "string"
    || !HASH.test(projection.parser?.helperSha256 ?? "")
    || projection.parser?.timeoutMs !== PYARROW_TIMEOUT_MS
    || projection.dataset?.episodeUnits !== EXPECTED.episodes
    || projection.dataset?.frameUnits !== EXPECTED.frames
    || projection.dataset?.fps !== 30 || projection.dataset?.taskUnits !== 1
    || projection.dataset?.cameraReferenceColumns !== 5
    || projection.dataset?.videoReferenceRows !== 107_060
    || projection.dataset?.actualVideoBytesReplayed !== false
    || projection.publisherLabels?.annotationSuccessUnits !== 30
    || projection.publisherLabels?.annotationFailureUnits !== 20
    || !same(projection.publisherLabels?.failureReasonCounts,
      { none: 30, operator_abort: 14, slip_drop: 6 })
    || projection.publisherLabels?.parquetTerminalSuccessTrueUnits !== 33
    || projection.publisherLabels?.parquetTerminalSuccessFalseUnits !== 17
    || projection.publisherLabels?.crossFieldAgreementUnits !== 47
    || projection.publisherLabels?.crossFieldDisagreementUnits !== 3
    || !same(projection.publisherLabels?.crossFieldDisagreementEpisodeIndices,
      [25, 42, 43])
    || projection.publisherLabels?.conflictResolutionEstablished !== false
    || !same(projection.publisherLabels?.scorerIds, ["auto_v1.1.0"])
    || projection.publisherCorrectionMorphology?.episodesWithCorrectionPhase !== 16
    || projection.publisherCorrectionMorphology?.correctionPhaseUnits !== 27
    || projection.publisherCorrectionMorphology?.correctionThenPublisherSuccessLabelUnits !== 16
    || !same(projection.publisherCorrectionMorphology?.correctionCountDistribution,
      { 0: 34, 1: 7, 2: 7, 3: 2 })
    || !same(projection.publisherCorrectionMorphology?.correctionEpisodeIndices,
      [10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 45])
    || !same(projection.phaseCounts,
      { approach: 74, correction: 27, grasp: 58, place: 55, retract: 52,
        transport: 58 })
    || !Array.isArray(projection.episodeSummaries)
    || projection.episodeSummaries.length !== EXPECTED.episodes
    || projection.episodeSummaries.reduce((sum, item) => sum + item.frames, 0)
      !== EXPECTED.frames
    || projection.episodeSummaries.some((item, index) => item.episodeIndex !== index
      || !Number.isSafeInteger(item.frames) || item.frames < 1
      || typeof item.publisherSuccess !== "boolean"
      || !["none", "operator_abort", "slip_drop"].includes(item.publisherFailureReason)
      || !Number.isSafeInteger(item.publisherCorrectionCount)
      || !Number.isSafeInteger(item.publisherCorrectionPhaseUnits)
      || typeof item.parquetTerminalSuccessFlag !== "boolean"
      || typeof item.publisherLabelFieldsAgree !== "boolean"
      || item.terminalDoneFlagReplayed !== true
      || item.terminalPublisherSuccessFlagMatched !== item.publisherLabelFieldsAgree
      || item.stateActionFiniteRows !== item.frames
      || item.videoReferenceRows !== item.frames * 5)) fail("OBSERVATION_PROJECTION_INVALID");
  const expectedColumns = ["timestamp", "frame_index", "episode_index", "index",
    "task_index", "next.done", "next.success", "observation.state", "action",
    "observation.images.wrist_cam", "observation.images.front_cam",
    "observation.images.left_cam", "observation.images.top_cam",
    "observation.images.right_cam"];
  if (!same(projection.schema?.columnNames, expectedColumns)
    || projection.schema?.stateWidth !== 9 || projection.schema?.actionWidth !== 9
    || !Array.isArray(projection.schema?.columnTypes)
    || projection.schema.columnTypes.length !== expectedColumns.length
    || !same(projection.schema?.cameraReferenceColumns, expectedColumns.slice(9))) {
    fail("OBSERVATION_SCHEMA_INVALID");
  }
  return projection;
}

function buildReportBody(source, observations) {
  validateProjection(observations);
  if (!exactObject(source) || !HASH.test(source.manifestHash ?? "")
    || !HASH.test(source.manifestFileSha256 ?? "") || !HASH.test(source.sourceRoot ?? "")) {
    fail("REPORT_SOURCE_INVALID");
  }
  return {
    schema: EXYLOS_REPORT_SCHEMA,
    generatedAt: EXYLOS_FROZEN_AT,
    sourceClass:
      "PUBLISHER_VR_SEEDED_PROCEDURALLY_EXPANDED_VIRTUAL_ROBOT_TRAJECTORY_SAMPLE",
    source,
    observations,
    denominators: {
      publishedNoVideoEpisodeSample: {
        class: "PUBLISHER_VIRTUAL_ROBOT_TRAJECTORY_EPISODE",
        units: 50, frames: 21_412, completeForPinnedPublishedSample: true,
        physicalExecutionUnits: 0, independentOutcomeUnits: 0,
      },
      completeRepositoryTreeInventory: {
        class: "PINNED_REPOSITORY_TREE_ENTRY", units: 319,
        files: 310, directories: 9, complete: true,
      },
      publisherOutcomeLabels: {
        class: "PUBLISHER_VIRTUAL_ANNOTATION_LABEL", units: 50,
        successUnits: 30, failureUnits: 20, independentUnits: 0,
      },
      publisherParquetTerminalFlags: {
        class: "PUBLISHER_VIRTUAL_PARQUET_TERMINAL_FLAG", units: 50,
        trueUnits: 33, falseUnits: 17, annotationAgreementUnits: 47,
        annotationDisagreementUnits: 3, conflictResolutionEstablished: false,
      },
      publisherCorrectionMorphology: {
        class: "PUBLISHER_VIRTUAL_CORRECTION_PHASE_EPISODE", units: 16,
        phaseUnits: 27, verifiedRecoveryEffectUnits: 0,
      },
      generationOpportunityOrSeedCensus: {
        class: "UNESTABLISHED", units: null, complete: false,
      },
      crossTotal: null,
    },
    truthBoundary: {
      vrTeleoperationEstablishedOnlyAsPublisherClaim: true,
      humanSeededEstablishedOnlyAsPublisherClaim: true,
      procedurallyExpandedEstablishedOnlyAsPublisherClaim: true,
      physicsConsistentEstablishedOnlyAsPublisherClaim: true,
      independentPhysicsValidationPerformed: false,
      physicalRobotExecutionEstablished: false,
      publishedSampleEpisodeCensusEstablished: true,
      prospectiveOpportunityCensusEstablished: false,
      realWorldAttemptCensusEstablished: false,
      generationOpportunityOrSeedCensusEstablished: false,
      publisherOutcomeLabelsReplayed: true,
      publisherOutcomeLabelFieldsConflict: true,
      publisherOutcomeLabelConflictResolved: false,
      independentOutcomeEstablished: false,
      correctionMorphologyReplayed: true,
      executableRecoverySuffixEstablished: false,
      verifiedRecoveryEffectEstablished: false,
      independentWitnessEstablished: false,
      longitudinalFollowupEstablished: false,
      outsiderExecutionAttempt: false,
    },
    segments: {
      opportunityCensus: { prospectiveUnits: 0, established: false },
      delegationAuthorization: { units: 0, established: false },
      actionTrace: { publisherVirtualEpisodeUnits: 50, outsiderGovernedUnits: 0,
        physicalUnits: 0 },
      effect: { physicalUnits: 0, independentUnits: 0 },
      outcome: { publisherVirtualAnnotationLabelUnits: 50,
        publisherVirtualTerminalFlagUnits: 50,
        publisherCrossFieldDisagreementUnits: 3, crossFieldUnitsAdditive: false,
        independentUnits: 0 },
      recovery: { publisherCorrectionMorphologyEpisodeUnits: 16,
        executableSuffixUnits: 0, verifiedEffectUnits: 0 },
      longitudinal: { units: 0, established: false },
    },
    rights: {
      publisherCardLicenseClaim: "Apache-2.0",
      publisherReadmeLicenseClaimBytePinned: true,
      standaloneApacheLicenseBytesPinned: true,
      legalAdjudicationPerformed: false,
      productionTrainingAuthorizedByOutsider: false,
      artifactRedistributionAuthorityEstablished: false,
    },
    privacy: {
      humanSeededPublisherClaim: true,
      rawImageryFetched: false,
      videoPathAndTimestampReferencesReplayed: true,
      publisherPrivacyStatementFound: false,
      participantConsentEstablished: false,
      biometricOrIdentityAbsenceGuaranteed: false,
      noPiiGuaranteed: false,
    },
    useBoundary: {
      status: "QUARANTINE_EVAL_ONLY",
      offlineVirtualTrajectoryEvaluationOnly: true,
      visualReplayEstablished: false,
      publicDeploymentReady: false,
      governedTrainingRows: 0,
      productionTrainingRows: 0,
    },
    network: { admissionEstablished: false, networkAdmissionRows: 0,
      publicNodeWrites: 0 },
    economics: { CEU: 0, pricingUnits: 0, compensationUnits: 0 },
    authority: {
      delegationAuthorityEstablished: false,
      executionAuthorityEstablished: false,
      trainingAuthorityEstablished: false,
      physicalSafetyEstablished: false,
      authorityUnits: 0,
    },
  };
}

export function buildExylosReportFromSource(sourceDirectory, options = {}) {
  const { source: verified, projection } = extractWithPyarrow(sourceDirectory, options);
  const source = {
    datasetId: EXYLOS_DATASET_ID, pinnedRevision: EXYLOS_REVISION,
    manifestHash: verified.manifest.manifestHash,
    manifestFileSha256: verified.manifestFileSha256,
    sourceRoot: verified.sourceRoot,
    verificationLevel: "FULL_NO_VIDEO_SOURCE_BYTE_AND_PYARROW_REPLAY",
    selectedFiles: EXPECTED.selectedFiles, selectedBytes: EXPECTED.selectedBytes,
    parquetFiles: EXPECTED.parquetFiles, parquetBytes: EXPECTED.parquetBytes,
    completeRepositoryTreeInventoryEstablished: true,
    completePublishedNoVideoEpisodeSampleReplayed: true,
    fullRepositoryPayloadDownloaded: false,
    rawVisualPayloadDownloaded: false,
  };
  const body = buildReportBody(source, projection);
  return Object.freeze({ ...body,
    artifactHash: exylosDigest(body, `${EXYLOS_REPORT_SCHEMA}/artifact`) });
}

export function verifyExylosReport(report) {
  try {
    if (!exactObject(report)) fail("REPORT_INVALID");
    const { artifactHash, ...body } = report;
    if (artifactHash !== exylosDigest(body, `${EXYLOS_REPORT_SCHEMA}/artifact`)) {
      fail("REPORT_HASH_INVALID");
    }
    const expected = buildReportBody(report.source, report.observations);
    if (!same(body, expected)) fail("REPORT_SEMANTICS_INVALID");
    if (report.source.datasetId !== EXYLOS_DATASET_ID
      || report.source.pinnedRevision !== EXYLOS_REVISION
      || report.source.verificationLevel
        !== "FULL_NO_VIDEO_SOURCE_BYTE_AND_PYARROW_REPLAY"
      || report.source.selectedFiles !== EXPECTED.selectedFiles
      || report.source.selectedBytes !== EXPECTED.selectedBytes
      || report.source.parquetFiles !== EXPECTED.parquetFiles
      || report.source.parquetBytes !== EXPECTED.parquetBytes
      || report.source.completeRepositoryTreeInventoryEstablished !== true
      || report.source.completePublishedNoVideoEpisodeSampleReplayed !== true
      || report.source.fullRepositoryPayloadDownloaded !== false
      || report.source.rawVisualPayloadDownloaded !== false) fail("REPORT_SOURCE_BOUNDARY_INVALID");
    return Object.freeze({ ok: true, artifactHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: safeError(error) });
  }
}

export function verifyExylosReportWithSource(report, sourceDirectory, options = {}) {
  try {
    const standalone = verifyExylosReport(report);
    if (!standalone.ok) fail("REPORT_STANDALONE_INVALID", standalone.error);
    const rebuilt = buildExylosReportFromSource(sourceDirectory, options);
    if (!same(report, rebuilt)) fail("REPORT_SOURCE_REDERIVATION_INVALID");
    return Object.freeze({ ok: true,
      verificationLevel: "FULL_NO_VIDEO_SOURCE_REDERIVED",
      artifactHash: report.artifactHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: safeError(error) });
  }
}

export function buildExylosReceipt(report, reportBytes) {
  const checked = verifyExylosReport(report);
  if (!checked.ok || !Buffer.isBuffer(reportBytes)
    || !same(parseJson(reportBytes, "RECEIPT_REPORT_JSON_INVALID"), report)) {
    fail("RECEIPT_REPORT_INVALID");
  }
  const body = {
    schema: EXYLOS_RECEIPT_SCHEMA, generatedAt: EXYLOS_FROZEN_AT,
    datasetId: EXYLOS_DATASET_ID, pinnedRevision: EXYLOS_REVISION,
    reportFileSha256: exylosSha256(reportBytes), artifactHash: report.artifactHash,
    sourceManifestHash: report.source.manifestHash,
    sourceManifestFileSha256: report.source.manifestFileSha256,
    sourceRoot: report.source.sourceRoot,
    verificationLevel: "FULL_NO_VIDEO_SOURCE_REDERIVED",
    independentOutcomeUnits: 0, recoveryEffectUnits: 0,
    governedTrainingRows: 0, networkAdmissionRows: 0, CEU: 0,
    pricingUnits: 0, authorityUnits: 0,
  };
  return Object.freeze({ ...body,
    receiptHash: exylosDigest(body, `${EXYLOS_RECEIPT_SCHEMA}/receipt`) });
}

export function verifyExylosReceipt(receipt, report, reportBytes) {
  try {
    if (!exactObject(receipt) || !verifyExylosReport(report).ok
      || !Buffer.isBuffer(reportBytes)) fail("RECEIPT_INPUT_INVALID");
    const expected = buildExylosReceipt(report, reportBytes);
    if (!same(receipt, expected)) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true, receiptHash: receipt.receiptHash });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function publishExylosArtifactDirectory(stagingDirectory, targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (target === path.parse(target).root || existsSync(target)) {
    fail("PUBLISH_TARGET_EXISTS_OR_BROAD", target);
  }
  const stagingStat = lstatSync(staging);
  if (!stagingStat.isDirectory() || stagingStat.isSymbolicLink()
    || !same(sorted(readdirSync(staging)), ["report.json", "run-receipt.json", "source"])) {
    fail("PUBLISH_STAGING_INVALID");
  }
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("PUBLISH_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "source"), path.join(target, "source"));
    renameSync(path.join(staging, "report.json"), path.join(target, "report.json"));
    /* Receipt is the artifact-completion marker and moves last. */
    renameSync(path.join(staging, "run-receipt.json"), path.join(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch { fail("PUBLISH_FAILED", target); }
}

export function verifyExylosArtifactDirectory(artifactDirectory, options = {}) {
  try {
    const root = path.resolve(artifactDirectory);
    const stat = lstatSync(root);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700
      || !same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readPrivateStable(root, "report.json", null, 16 * 1024 * 1024);
    const receiptBytes = readPrivateStable(root, "run-receipt.json", null, 4 * 1024 * 1024);
    const report = parseJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    const sourceReplay = verifyExylosSourceDirectory(path.join(root, "source"));
    const fullReplay = verifyExylosReportWithSource(report, path.join(root, "source"), options);
    if (!sourceReplay.ok || !fullReplay.ok
      || !verifyExylosReceipt(receipt, report, reportBytes).ok) {
      fail("ARTIFACT_REPLAY_INVALID", fullReplay.error);
    }
    return Object.freeze({ ok: true,
      verificationLevel: "FULL_NO_VIDEO_SOURCE_REDERIVED",
      artifactHash: report.artifactHash, receiptHash: receipt.receiptHash,
      publisherOutcomeLabelUnits: 50, publisherCorrectionMorphologyEpisodeUnits: 16,
      physicalExecutionUnits: 0, independentOutcomeUnits: 0,
      recoveryEffectUnits: 0, governedTrainingRows: 0,
      networkAdmissionRows: 0, CEU: 0, pricingUnits: 0, authorityUnits: 0 });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export const EXYLOS_EXPECTED_PROFILE = EXPECTED;
export const EXYLOS_PYARROW_HELPER_SHA256 =
  exylosSha256(Buffer.from(PYARROW_REPLAY, "utf8"));
