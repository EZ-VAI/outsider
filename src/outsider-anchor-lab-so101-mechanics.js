/*
 * NVIDIA Anchor-Lab SO-101 50-motion mechanical telemetry intake.
 *
 * This module acquires and replays one exact, byte-pinned source closure. It
 * never turns historical telemetry into delegation, task outcome, recovery,
 * training permission, action authority, CEU, pricing, or network admission.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmdirSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const ANCHOR_LAB_DATASET_ID = "nvidia/Anchor-Lab";
export const ANCHOR_LAB_REVISION = "647edd5787cd764cdc041103ad282dc59214d919";
export const ANCHOR_LAB_VERSION = "v1.0";
export const ANCHOR_LAB_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const ANCHOR_LAB_SOURCE_MANIFEST_SCHEMA =
  "outsider/anchor-lab-so101-mechanics-pinned-source/v1";
export const ANCHOR_LAB_MECHANICS_SCHEMA =
  "outsider/anchor-lab-so101-mechanics/v1";
export const ANCHOR_LAB_RUN_RECEIPT_SCHEMA =
  "outsider/anchor-lab-so101-mechanics-run-receipt/v1";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${ANCHOR_LAB_DATASET_ID}`;
const TREE_PATH = `/api/datasets/${ANCHOR_LAB_DATASET_ID}/tree/${ANCHOR_LAB_REVISION}`;
const RAW_ROOT = `${HF_ORIGIN}/datasets/${ANCHOR_LAB_DATASET_ID}/resolve/${ANCHOR_LAB_REVISION}`;
const GROUP_PREFIX = "data/so101_arm_50motion/";
const README_PATH = "README.md";
const EXPECTED_SCHEMA_ORDER = Object.freeze([
  "time_ns", "time_utc", "experiment", "field", "value",
]);
const EXPECTED_SCHEMA_TYPES = Object.freeze({
  time_ns: "int64",
  time_utc: "timestamp[ns, tz=UTC]",
  experiment: "string",
  field: "string",
  value: "double",
});
const EXPECTED_PROFILE = Object.freeze({
  sourceObjects: 51,
  readmeBytes: 14_082,
  parquetFiles: 50,
  parquetBytes: 86_065_893,
  sourceBytes: 86_079_975,
  trainTraces: 42,
  heldoutTraces: 8,
});
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const SAFE_DATA_BASENAME = /^[A-Za-z0-9][A-Za-z0-9._-]*\.parquet$/u;
const MAX_API_BYTES = 16 * 1024 * 1024;
const MAX_REMOTE_FILE_BYTES = 32 * 1024 * 1024;
const MAX_TREE_PAGES = 32;
const FETCH_TIMEOUT_MS = 120_000;
const PYARROW_TIMEOUT_MS = 180_000;
const MAX_EXTRACTOR_OUTPUT_BYTES = 32 * 1024 * 1024;
const ALLOWED_FETCH_HOST = /^(huggingface\.co|[a-z0-9.-]+\.hf\.co)$/iu;

function fail(code, detail = null) {
  throw new Error(detail === null ? `ANCHOR_LAB_SO101_${code}`
    : `ANCHOR_LAB_SO101_${code}:${detail}`);
}

export function anchorLabSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function anchorLabDigest(value, domain = ANCHOR_LAB_MECHANICS_SCHEMA) {
  return anchorLabSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return exactObject(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function splitForPath(remotePath) {
  const basename = path.posix.basename(remotePath).toLowerCase();
  if (/(^|[-_])(held[-_]?out|heldout|hold[-_]?out)([-_]|\.)/u.test(basename)) {
    return "HELDOUT";
  }
  if (/(^|[-_])train([-_]|\.)/u.test(basename)) return "TRAIN";
  return "UNKNOWN";
}

function safeRemotePath(remotePath) {
  if (remotePath === README_PATH) return true;
  if (typeof remotePath !== "string" || !remotePath.startsWith(GROUP_PREFIX)) return false;
  const basename = remotePath.slice(GROUP_PREFIX.length);
  return !basename.includes("/") && SAFE_DATA_BASENAME.test(basename);
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
    || url.username !== "" || url.password !== "") fail("FETCH_REDIRECT_UNSAFE", url.hostname);
  return url;
}

async function fetchOnce(value, maximumBytes, accept, fetchImpl) {
  let current = checkedInitialUrl(value);
  for (let redirect = 0; redirect <= 6; redirect += 1) {
    const response = await fetchImpl(current, {
      redirect: "manual",
      headers: { accept, "user-agent": "outsider-anchor-lab-so101-mechanics/1.0" },
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
    }
  }
  fail("FETCH_FAILED", `${checkedInitialUrl(value).pathname}:${safeError(lastError)}`);
}

async function jsonFetch(value, maximumBytes, fetchImpl) {
  const fetched = await boundedFetch(value, maximumBytes,
    "application/json", fetchImpl);
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
    || !url.searchParams.get("cursor")) fail("TREE_NEXT_LINK_UNSAFE");
  return url.toString();
}

function normalizeTreeEntries(entries) {
  if (!Array.isArray(entries) || entries.length < 1) fail("TREE_PAGE_INVALID");
  return entries.map((entry) => {
    if (!exactObject(entry) || typeof entry.path !== "string"
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
  let next = `${HF_API}/tree/${ANCHOR_LAB_REVISION}?recursive=true&expand=true`;
  const seenUrls = new Set();
  for (let pageNumber = 1; next !== null; pageNumber += 1) {
    if (seenUrls.has(next) || pageNumber > MAX_TREE_PAGES) fail("TREE_PAGINATION_INVALID");
    seenUrls.add(next);
    const page = await jsonFetch(next, MAX_API_BYTES, fetchImpl);
    const normalized = normalizeTreeEntries(page.value);
    entries.push(...normalized);
    rawPages.push({ path: `source-support/tree-${bracket}-${String(pageNumber)
      .padStart(3, "0")}.json`, fetchUrl: next, bytes: page.bytes });
    next = parseNextTreeLink(page.headers.get("link"));
  }
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) fail("TREE_DUPLICATE_PATH");
  const normalizedEntries = [...entries].sort((left, right) => left.path.localeCompare(right.path));
  return { entries: normalizedEntries, rawPages,
    snapshotHash: anchorLabDigest(normalizedEntries,
      `${ANCHOR_LAB_SOURCE_MANIFEST_SCHEMA}/full-tree-snapshot`),
    pages: rawPages.length };
}

function remoteBinding(entry) {
  if (entry.lfs) return { kind: "LFS_SHA256", value: `sha256:${entry.lfs.oid}` };
  return { kind: "GIT_BLOB_SHA1", value: entry.oid };
}

function selectedTreeProjection(selected) {
  return selected.map((entry) => ({ path: entry.path, sizeBytes: entry.sizeBytes,
    split: entry.split, remoteBinding: entry.remoteBinding }));
}

export function selectAnchorLabSo101Entries(treeEntries, profile = EXPECTED_PROFILE) {
  if (!Array.isArray(treeEntries) || !exactObject(profile)) fail("TREE_INVALID");
  const files = treeEntries.filter((entry) => entry?.type === "file");
  const groupFiles = files.filter((entry) => String(entry.path).startsWith(GROUP_PREFIX));
  if (groupFiles.some((entry) => !safeRemotePath(entry.path))) {
    fail("TREE_GROUP_MEMBER_UNSAFE");
  }
  const readmes = files.filter((entry) => entry.path === README_PATH);
  if (readmes.length !== 1 || groupFiles.length !== profile.parquetFiles) {
    fail("TREE_SELECTION_COUNT_INVALID");
  }
  const projected = [...readmes, ...groupFiles].map((entry) => {
    if (!Number.isSafeInteger(entry.size) || entry.size <= 0
      || entry.size > MAX_REMOTE_FILE_BYTES) fail("TREE_FILE_SIZE_INVALID", entry.path);
    return { path: entry.path, sizeBytes: entry.size,
      split: entry.path === README_PATH ? null : splitForPath(entry.path),
      remoteBinding: remoteBinding(entry) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const readmeBytes = projected.find((entry) => entry.path === README_PATH)?.sizeBytes;
  const data = projected.filter((entry) => entry.path !== README_PATH);
  const parquetBytes = data.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const trainTraces = data.filter((entry) => entry.split === "TRAIN").length;
  const heldoutTraces = data.filter((entry) => entry.split === "HELDOUT").length;
  if (projected.length !== profile.sourceObjects || readmeBytes !== profile.readmeBytes
    || parquetBytes !== profile.parquetBytes
    || projected.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== profile.sourceBytes
    || trainTraces !== profile.trainTraces || heldoutTraces !== profile.heldoutTraces
    || data.some((entry) => entry.split === "UNKNOWN")) {
    fail("TREE_CANONICAL_PROFILE_CHANGED");
  }
  if (data.some((entry) => entry.remoteBinding.kind !== "LFS_SHA256")
    || projected.find((entry) => entry.path === README_PATH)?.remoteBinding.kind
      !== "GIT_BLOB_SHA1") fail("TREE_BINDING_KIND_INVALID");
  return {
    selected: projected,
    sourceObjects: projected.length,
    selectedBytes: profile.sourceBytes,
    readmeBytes,
    parquetFiles: data.length,
    parquetBytes,
    trainTraces,
    heldoutTraces,
    excludedRepositoryFiles: files.length - projected.length,
  };
}

function repositoryProjection(metadata) {
  if (!exactObject(metadata) || metadata.id !== ANCHOR_LAB_DATASET_ID
    || metadata.sha !== ANCHOR_LAB_REVISION || metadata.private !== false
    || metadata.gated !== false || metadata.disabled !== false
    || String(metadata.cardData?.license ?? "").toLowerCase() !== "apache-2.0") {
    fail("REPOSITORY_RECORD_INVALID");
  }
  return {
    datasetId: ANCHOR_LAB_DATASET_ID,
    revision: ANCHOR_LAB_REVISION,
    private: false,
    gated: false,
    disabled: false,
    hfCardLicenseClaim: "apache-2.0",
    lastModified: typeof metadata.lastModified === "string" ? metadata.lastModified : null,
  };
}

function safeTarget(root, remotePath) {
  if (!safeRemotePath(remotePath)) fail("REMOTE_PATH_UNSAFE", remotePath);
  const target = path.resolve(root, ...remotePath.split("/"));
  const relative = path.relative(path.resolve(root), target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("REMOTE_PATH_ESCAPE", remotePath);
  return target;
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function checkRemoteBytes(entry, bytes) {
  if (bytes.length !== entry.sizeBytes) fail("REMOTE_SIZE_MISMATCH", entry.path);
  const sha256 = anchorLabSha256(bytes);
  if (entry.remoteBinding.kind === "LFS_SHA256"
    && entry.remoteBinding.value !== sha256) fail("REMOTE_LFS_MISMATCH", entry.path);
  if (entry.remoteBinding.kind === "GIT_BLOB_SHA1"
    && entry.remoteBinding.value !== gitBlobOid(bytes)) fail("REMOTE_GIT_MISMATCH", entry.path);
  return sha256;
}

async function mapConcurrent(values, width, operation) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      output[index] = await operation(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, values.length) }, worker));
  return output;
}

function supportEntry(item) {
  return { path: item.path, fetchUrl: item.fetchUrl,
    sizeBytes: item.bytes.length, sha256: anchorLabSha256(item.bytes) };
}

function writeSupportBytes(root, items) {
  for (const item of items) writePrivate(path.join(root, ...item.path.split("/")), item.bytes);
}

function publishSourceStaging(staging, target) {
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("OUTPUT_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "README.md"), path.join(target, "README.md"));
    renameSync(path.join(staging, "data"), path.join(target, "data"));
    renameSync(path.join(staging, "source-support"), path.join(target, "source-support"));
    /* The manifest is the source-completion marker and moves last. */
    renameSync(path.join(staging, "acquisition-manifest.json"),
      path.join(target, "acquisition-manifest.json"));
    rmdirSync(staging);
  } catch { fail("OUTPUT_PUBLISH_FAILED", target); }
}

export async function acquirePinnedAnchorLabSo101Source(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
  ensurePrivateDirectory(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  let targetClaimed = false;
  try {
    const repositoryBeforeRaw = await jsonFetch(HF_API, MAX_API_BYTES, fetchImpl);
    const repositoryBefore = repositoryProjection(repositoryBeforeRaw.value);
    const treeBefore = await fetchPinnedTree(fetchImpl, "before");
    const selectionBefore = selectAnchorLabSo101Entries(treeBefore.entries);
    const downloaded = await mapConcurrent(selectionBefore.selected, 4, async (entry) => {
      const encodedPath = entry.path.split("/").map(encodeURIComponent).join("/");
      const fetched = await boundedFetch(`${RAW_ROOT}/${encodedPath}?download=true`,
        entry.sizeBytes, "application/octet-stream, text/plain;q=0.8", fetchImpl);
      const sha256 = checkRemoteBytes(entry, fetched.bytes);
      writePrivate(safeTarget(staging, entry.path), fetched.bytes);
      return { ...entry, sha256, transportFinalHost: fetched.finalHost };
    });
    const readme = readFileSync(path.join(staging, README_PATH), "utf8");
    if (!/(^|\n)license:\s*apache-2\.0\s*($|\n)/iu.test(readme)
      || !/## Version[\s\S]{0,80}\bv1\.0\b/iu.test(readme)
      || !EXPECTED_SCHEMA_ORDER.every((field) => readme.includes(`\`${field}\``))) {
      fail("README_CARD_CLAIMS_INVALID");
    }
    const treeAfter = await fetchPinnedTree(fetchImpl, "after");
    const selectionAfter = selectAnchorLabSo101Entries(treeAfter.entries);
    const repositoryAfterRaw = await jsonFetch(HF_API, MAX_API_BYTES, fetchImpl);
    const repositoryAfter = repositoryProjection(repositoryAfterRaw.value);
    if (!same(repositoryBefore, repositoryAfter)
      || treeBefore.snapshotHash !== treeAfter.snapshotHash
      || !same(selectedTreeProjection(selectionBefore.selected),
        selectedTreeProjection(selectionAfter.selected))) {
      fail("REMOTE_RECORD_OR_TREE_CHANGED_DURING_ACQUISITION");
    }
    const supportItems = [
      { path: "source-support/repository-before.json", fetchUrl: HF_API,
        bytes: repositoryBeforeRaw.bytes },
      ...treeBefore.rawPages,
      ...treeAfter.rawPages,
      { path: "source-support/repository-after.json", fetchUrl: HF_API,
        bytes: repositoryAfterRaw.bytes },
    ];
    writeSupportBytes(staging, supportItems);
    const manifestBody = {
      schema: ANCHOR_LAB_SOURCE_MANIFEST_SCHEMA,
      capturedAt: ANCHOR_LAB_FROZEN_AT,
      datasetId: ANCHOR_LAB_DATASET_ID,
      pinnedRevision: ANCHOR_LAB_REVISION,
      datasetVersionClaim: ANCHOR_LAB_VERSION,
      repositoryBefore,
      repositoryAfter,
      recordStableDuringAcquisition: true,
      treeBefore: { pages: treeBefore.pages, entryCount: treeBefore.entries.length,
        snapshotHash: treeBefore.snapshotHash,
        selectedObjects: selectedTreeProjection(selectionBefore.selected) },
      treeAfter: { pages: treeAfter.pages, entryCount: treeAfter.entries.length,
        snapshotHash: treeAfter.snapshotHash,
        selectedObjects: selectedTreeProjection(selectionAfter.selected) },
      treeStableDuringAcquisition: true,
      selection: {
        rule: "README.md plus every and only data/so101_arm_50motion/*.parquet file",
        sourceObjects: selectionBefore.sourceObjects,
        selectedBytes: selectionBefore.selectedBytes,
        readmeBytes: selectionBefore.readmeBytes,
        parquetFiles: selectionBefore.parquetFiles,
        parquetBytes: selectionBefore.parquetBytes,
        trainTraces: selectionBefore.trainTraces,
        heldoutTraces: selectionBefore.heldoutTraces,
        excludedRepositoryFiles: selectionBefore.excludedRepositoryFiles,
        imageryFetched: false,
        audioFetched: false,
      },
      rights: {
        publisherCardLicenseClaim: "Apache-2.0",
        licenseClaimBytePinnedInReadme: true,
        standaloneLicenseFileInClosure: false,
        legalAdjudicationPerformed: false,
        productionTrainingAuthorizedByOutsider: false,
      },
      privacy: {
        cardClaimsNoIntentionalHumanSubjectDataImageryOrPii: true,
        imageryFetched: false,
        audioFetched: false,
        noPiiGuaranteed: false,
      },
      transportAttested: false,
      sourceSupportObjects: supportItems.map(supportEntry)
        .sort((left, right) => left.path.localeCompare(right.path)),
      remoteObjects: downloaded.sort((left, right) => left.path.localeCompare(right.path)),
    };
    const manifest = { ...manifestBody,
      manifestHash: anchorLabDigest(manifestBody,
        `${ANCHOR_LAB_SOURCE_MANIFEST_SCHEMA}/manifest`) };
    writePrivate(path.join(staging, "acquisition-manifest.json"), canonicalBytes(manifest));
    publishSourceStaging(staging, target);
    targetClaimed = true;
    const manifestBytes = readFileSync(path.join(target, "acquisition-manifest.json"));
    return { sourceDirectory: target, manifest,
      manifestFileSha256: anchorLabSha256(manifestBytes) };
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    if (!targetClaimed && existsSync(target)) {
      /* A partial claimed target is deliberately retained fail-closed. */
    }
    throw error;
  }
}

function requireDirectory(directory, expectedEntries, snapshots) {
  const target = path.resolve(directory);
  const before = lstatSync(target, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()
    || Number(before.mode & 0o777n) !== 0o700) fail("SOURCE_DIRECTORY_UNSAFE", target);
  const actual = sorted(readdirSync(target));
  if (!same(actual, sorted(expectedEntries))) fail("SOURCE_DIRECTORY_LAYOUT_INVALID", target);
  const after = lstatSync(target, { bigint: true });
  if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode
    || before.size !== after.size || before.mtimeNs !== after.mtimeNs
    || before.ctimeNs !== after.ctimeNs) fail("SOURCE_DIRECTORY_CHANGED", target);
  snapshots.push({ target, directory: true, expectedEntries: sorted(expectedEntries),
    dev: after.dev, ino: after.ino, mode: after.mode, size: after.size,
    mtimeNs: after.mtimeNs, ctimeNs: after.ctimeNs });
}

function checkedLocalPath(root, relative) {
  if (typeof relative !== "string" || relative.length < 1
    || relative.startsWith("/") || relative.split("/").some((part) =>
      part === "" || part === "." || part === "..")) fail("SOURCE_PATH_INVALID", relative);
  const target = path.resolve(root, ...relative.split("/"));
  const relation = path.relative(path.resolve(root), target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("SOURCE_PATH_ESCAPE", relative);
  return target;
}

function readPrivateStable(root, relative, snapshots, expected = null,
  maximumBytes = MAX_REMOTE_FILE_BYTES) {
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
      || anchorLabSha256(bytes) !== expected.sha256)) fail("SOURCE_OBJECT_MISMATCH", relative);
    snapshots.push({ target, directory: false, expectedEntries: null,
      dev: after.dev, ino: after.ino, mode: after.mode, size: after.size,
      mtimeNs: after.mtimeNs, ctimeNs: after.ctimeNs });
    return bytes;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function recheckSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    const after = lstatSync(snapshot.target, { bigint: true });
    if (after.isSymbolicLink()
      || (snapshot.directory ? !after.isDirectory() : !after.isFile())
      || after.dev !== snapshot.dev || after.ino !== snapshot.ino
      || after.mode !== snapshot.mode || after.size !== snapshot.size
      || after.mtimeNs !== snapshot.mtimeNs || after.ctimeNs !== snapshot.ctimeNs) {
      fail("SOURCE_SNAPSHOT_CHANGED", snapshot.target);
    }
    if (snapshot.directory
      && !same(sorted(readdirSync(snapshot.target)), snapshot.expectedEntries)) {
      fail("SOURCE_SNAPSHOT_LAYOUT_CHANGED", snapshot.target);
    }
  }
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function validateRemoteObject(entry) {
  if (!exactObject(entry) || !safeRemotePath(entry.path)
    || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes <= 0
    || ![null, "TRAIN", "HELDOUT"].includes(entry.split)
    || !exactObject(entry.remoteBinding) || !HASH.test(entry.sha256 ?? "")
    || typeof entry.transportFinalHost !== "string"
    || !ALLOWED_FETCH_HOST.test(entry.transportFinalHost)) fail("MANIFEST_REMOTE_OBJECT_INVALID");
  if (entry.remoteBinding.kind === "LFS_SHA256") {
    if (!HASH.test(entry.remoteBinding.value ?? "")
      || entry.remoteBinding.value !== entry.sha256) fail("MANIFEST_LFS_BINDING_INVALID");
  } else if (entry.remoteBinding.kind === "GIT_BLOB_SHA1") {
    if (!SHA1.test(entry.remoteBinding.value ?? "")) fail("MANIFEST_GIT_BINDING_INVALID");
  } else fail("MANIFEST_REMOTE_BINDING_KIND_INVALID");
}

function validateSupportObject(entry) {
  if (!exactKeys(entry, ["path", "fetchUrl", "sizeBytes", "sha256"])
    || !/^source-support\/(repository-(before|after)|tree-(before|after)-\d{3})\.json$/u
      .test(entry.path ?? "")
    || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes <= 0
    || entry.sizeBytes > MAX_API_BYTES || !HASH.test(entry.sha256 ?? "")) {
    fail("MANIFEST_SUPPORT_OBJECT_INVALID");
  }
  checkedInitialUrl(entry.fetchUrl);
}

function validateManifestShape(manifest) {
  if (!exactObject(manifest)) fail("SOURCE_MANIFEST_INVALID");
  const { manifestHash, ...body } = manifest;
  if (manifest.schema !== ANCHOR_LAB_SOURCE_MANIFEST_SCHEMA
    || manifest.capturedAt !== ANCHOR_LAB_FROZEN_AT
    || manifest.datasetId !== ANCHOR_LAB_DATASET_ID
    || manifest.pinnedRevision !== ANCHOR_LAB_REVISION
    || manifest.datasetVersionClaim !== ANCHOR_LAB_VERSION
    || manifest.recordStableDuringAcquisition !== true
    || manifest.treeStableDuringAcquisition !== true
    || manifest.transportAttested !== false
    || manifestHash !== anchorLabDigest(body,
      `${ANCHOR_LAB_SOURCE_MANIFEST_SCHEMA}/manifest`)) fail("SOURCE_MANIFEST_IDENTITY_INVALID");
  if (!same(manifest.repositoryBefore, manifest.repositoryAfter)) {
    fail("SOURCE_REPOSITORY_BRACKET_MISMATCH");
  }
  repositoryProjection({ id: manifest.repositoryBefore.datasetId,
    sha: manifest.repositoryBefore.revision, private: manifest.repositoryBefore.private,
    gated: manifest.repositoryBefore.gated, disabled: manifest.repositoryBefore.disabled,
    lastModified: manifest.repositoryBefore.lastModified,
    cardData: { license: manifest.repositoryBefore.hfCardLicenseClaim } });
  if (manifest.selection?.sourceObjects !== EXPECTED_PROFILE.sourceObjects
    || manifest.selection?.selectedBytes !== EXPECTED_PROFILE.sourceBytes
    || manifest.selection?.readmeBytes !== EXPECTED_PROFILE.readmeBytes
    || manifest.selection?.parquetFiles !== EXPECTED_PROFILE.parquetFiles
    || manifest.selection?.parquetBytes !== EXPECTED_PROFILE.parquetBytes
    || manifest.selection?.trainTraces !== EXPECTED_PROFILE.trainTraces
    || manifest.selection?.heldoutTraces !== EXPECTED_PROFILE.heldoutTraces
    || manifest.selection?.imageryFetched !== false
    || manifest.selection?.audioFetched !== false) fail("SOURCE_MANIFEST_SELECTION_INVALID");
  if (manifest.rights?.publisherCardLicenseClaim !== "Apache-2.0"
    || manifest.rights?.licenseClaimBytePinnedInReadme !== true
    || manifest.rights?.standaloneLicenseFileInClosure !== false
    || manifest.rights?.legalAdjudicationPerformed !== false
    || manifest.rights?.productionTrainingAuthorizedByOutsider !== false
    || manifest.privacy?.cardClaimsNoIntentionalHumanSubjectDataImageryOrPii !== true
    || manifest.privacy?.imageryFetched !== false
    || manifest.privacy?.audioFetched !== false
    || manifest.privacy?.noPiiGuaranteed !== false) fail("SOURCE_MANIFEST_BOUNDARY_INVALID");
  if (!Array.isArray(manifest.remoteObjects)
    || manifest.remoteObjects.length !== EXPECTED_PROFILE.sourceObjects
    || !Array.isArray(manifest.sourceSupportObjects)
    || manifest.sourceSupportObjects.length < 4) fail("SOURCE_MANIFEST_OBJECTS_INVALID");
  manifest.remoteObjects.forEach(validateRemoteObject);
  manifest.sourceSupportObjects.forEach(validateSupportObject);
  const remotePaths = manifest.remoteObjects.map((entry) => entry.path);
  const supportPaths = manifest.sourceSupportObjects.map((entry) => entry.path);
  if (new Set(remotePaths).size !== remotePaths.length
    || new Set(supportPaths).size !== supportPaths.length
    || !same(remotePaths, sorted(remotePaths)) || !same(supportPaths, sorted(supportPaths))) {
    fail("SOURCE_MANIFEST_PATH_ORDER_INVALID");
  }
  if (manifest.treeBefore?.snapshotHash !== manifest.treeAfter?.snapshotHash
    || !HASH.test(manifest.treeBefore?.snapshotHash ?? "")
    || manifest.treeBefore?.pages !== manifest.treeAfter?.pages
    || manifest.treeBefore?.entryCount !== manifest.treeAfter?.entryCount
    || !same(manifest.treeBefore?.selectedObjects, manifest.treeAfter?.selectedObjects)
    || !same(manifest.treeBefore?.selectedObjects,
      selectedTreeProjection(manifest.remoteObjects))) fail("SOURCE_TREE_BRACKET_INVALID");
  return manifest;
}

function replaySupportBracket(manifest, supportBytes) {
  const repositoryBefore = parseJson(supportBytes.get("source-support/repository-before.json"),
    "SUPPORT_REPOSITORY_BEFORE_JSON_INVALID");
  const repositoryAfter = parseJson(supportBytes.get("source-support/repository-after.json"),
    "SUPPORT_REPOSITORY_AFTER_JSON_INVALID");
  if (!same(repositoryProjection(repositoryBefore), manifest.repositoryBefore)
    || !same(repositoryProjection(repositoryAfter), manifest.repositoryAfter)) {
    fail("SUPPORT_REPOSITORY_REPLAY_MISMATCH");
  }
  for (const bracket of ["before", "after"]) {
    const entries = [];
    const pages = manifest.sourceSupportObjects.filter((entry) =>
      entry.path.startsWith(`source-support/tree-${bracket}-`));
    if (pages.length !== manifest[`tree${bracket === "before" ? "Before" : "After"}`].pages) {
      fail("SUPPORT_TREE_PAGE_COUNT_MISMATCH", bracket);
    }
    for (const [index, page] of pages.entries()) {
      const url = checkedInitialUrl(page.fetchUrl);
      if (url.pathname !== TREE_PATH || url.searchParams.get("recursive") !== "true"
        || url.searchParams.get("expand") !== "true"
        || (index === 0 ? url.searchParams.has("cursor")
          : !url.searchParams.get("cursor"))) fail("SUPPORT_TREE_PAGE_URL_INVALID", page.path);
      entries.push(...normalizeTreeEntries(parseJson(supportBytes.get(page.path),
        "SUPPORT_TREE_PAGE_JSON_INVALID")));
    }
    const paths = entries.map((entry) => entry.path);
    if (new Set(paths).size !== paths.length) fail("SUPPORT_TREE_DUPLICATE_PATH", bracket);
    const normalized = [...entries].sort((left, right) => left.path.localeCompare(right.path));
    const summary = manifest[`tree${bracket === "before" ? "Before" : "After"}`];
    const snapshotHash = anchorLabDigest(normalized,
      `${ANCHOR_LAB_SOURCE_MANIFEST_SCHEMA}/full-tree-snapshot`);
    const selection = selectAnchorLabSo101Entries(normalized);
    if (entries.length !== summary.entryCount || snapshotHash !== summary.snapshotHash
      || !same(selectedTreeProjection(selection.selected), summary.selectedObjects)) {
      fail("SUPPORT_TREE_REPLAY_MISMATCH", bracket);
    }
  }
}

export function verifyAnchorLabSo101SourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const snapshots = [];
  requireDirectory(root,
    ["README.md", "acquisition-manifest.json", "data", "source-support"], snapshots);
  const manifestBytes = readPrivateStable(root, "acquisition-manifest.json", snapshots,
    null, 2 * 1024 * 1024);
  const manifest = validateManifestShape(parseJson(manifestBytes,
    "SOURCE_MANIFEST_JSON_INVALID"));
  const dataObjects = manifest.remoteObjects.filter((entry) => entry.path !== README_PATH);
  requireDirectory(path.join(root, "data"), ["so101_arm_50motion"], snapshots);
  requireDirectory(path.join(root, "data", "so101_arm_50motion"),
    dataObjects.map((entry) => path.posix.basename(entry.path)), snapshots);
  requireDirectory(path.join(root, "source-support"),
    manifest.sourceSupportObjects.map((entry) => path.posix.basename(entry.path)), snapshots);
  const supportBytes = new Map();
  let selectedBytes = 0;
  for (const entry of manifest.remoteObjects) {
    const bytes = readPrivateStable(root, entry.path, snapshots, entry);
    if (entry.remoteBinding.kind === "LFS_SHA256"
      && entry.remoteBinding.value !== anchorLabSha256(bytes)) {
      fail("SOURCE_LFS_REPLAY_FAILED", entry.path);
    }
    if (entry.remoteBinding.kind === "GIT_BLOB_SHA1"
      && entry.remoteBinding.value !== gitBlobOid(bytes)) {
      fail("SOURCE_GIT_REPLAY_FAILED", entry.path);
    }
    selectedBytes += bytes.length;
  }
  if (selectedBytes !== EXPECTED_PROFILE.sourceBytes) fail("SOURCE_SELECTED_BYTES_INVALID");
  for (const entry of manifest.sourceSupportObjects) {
    supportBytes.set(entry.path, readPrivateStable(root, entry.path, snapshots,
      entry, MAX_API_BYTES));
  }
  replaySupportBracket(manifest, supportBytes);
  const readme = readPrivateStable(root, README_PATH, [],
    manifest.remoteObjects.find((entry) => entry.path === README_PATH)).toString("utf8");
  if (!/(^|\n)license:\s*apache-2\.0\s*($|\n)/iu.test(readme)
    || !/## Version[\s\S]{0,80}\bv1\.0\b/iu.test(readme)) {
    fail("SOURCE_README_CLAIM_REPLAY_FAILED");
  }
  recheckSnapshots(snapshots);
  return Object.freeze({ ok: true, verificationLevel: "FULL_SOURCE_BYTE_REPLAY",
    sourceDirectory: root, manifest,
    manifestFileSha256: anchorLabSha256(manifestBytes),
    sourceRoot: anchorLabDigest(manifest.remoteObjects.map(({ path: objectPath,
      sizeBytes, sha256 }) => ({ path: objectPath, sizeBytes, sha256 })),
    `${ANCHOR_LAB_SOURCE_MANIFEST_SCHEMA}/source-root`) });
}

const PYARROW_EXTRACTOR = String.raw`
import hashlib
import json
import math
import os
import stat
import sys
from collections import Counter

import pyarrow as pa
import pyarrow.parquet as pq

request = json.load(sys.stdin)
root = os.path.realpath(request["root"])
expected_order = ["time_ns", "time_utc", "experiment", "field", "value"]
expected_types = {
    "time_ns": "int64",
    "time_utc": "timestamp[ns, tz=UTC]",
    "experiment": "string",
    "field": "string",
    "value": "double",
}

def read_exact(relative, expected_size, expected_sha):
    target = os.path.realpath(os.path.join(root, *relative.split("/")))
    if os.path.commonpath([root, target]) != root:
        raise RuntimeError("PATH_ESCAPE")
    flags = os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(target, flags)
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or stat.S_IMODE(before.st_mode) != 0o600:
            raise RuntimeError("FILE_UNSAFE")
        chunks = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(fd)
        raw = b"".join(chunks)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns,
            before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size,
            after.st_mtime_ns, after.st_ctime_ns):
            raise RuntimeError("FILE_CHANGED")
        if len(raw) != expected_size or "sha256:" + hashlib.sha256(raw).hexdigest() != expected_sha:
            raise RuntimeError("FILE_BINDING_MISMATCH")
        return raw
    finally:
        os.close(fd)

def sequence_stats(values):
    previous = None
    decreases = 0
    equals = 0
    observed = 0
    for value in values:
        if value is None:
            continue
        observed += 1
        if previous is not None:
            if value < previous:
                decreases += 1
            elif value == previous:
                equals += 1
        previous = value
    return {"observed": observed, "decreases": decreases, "equals": equals,
            "nondecreasing": decreases == 0}

traces = []
aggregate_fields = Counter()
total_rows = 0
for item in request["objects"]:
    raw = read_exact(item["path"], item["sizeBytes"], item["sha256"])
    table = pq.read_table(pa.BufferReader(raw))
    names = list(table.schema.names)
    types = {field.name: str(field.type) for field in table.schema}
    nulls = {name: int(table[name].null_count) for name in names}
    fields = [value for value in table["field"].to_pylist() if value is not None]
    experiments = sorted(set(value for value in table["experiment"].to_pylist()
                             if value is not None))
    field_counts = Counter(fields)
    aggregate_fields.update(field_counts)
    time_ns = table["time_ns"].to_pylist()
    time_utc = table["time_utc"].cast(pa.int64()).to_pylist()
    mismatches = sum(1 for left, right in zip(time_ns, time_utc)
                     if left is not None and right is not None and left != right)
    values = table["value"].to_pylist()
    nonfinite = sum(1 for value in values if value is not None and not math.isfinite(value))
    row_count = table.num_rows
    total_rows += row_count
    traces.append({
        "path": item["path"],
        "split": item["split"],
        "sizeBytes": item["sizeBytes"],
        "sha256": item["sha256"],
        "rowCount": row_count,
        "schemaOrder": names,
        "schemaTypes": types,
        "schemaOrderMatchesPublisherCard": names == expected_order,
        "schemaTypesMatchPublisherCard": types == expected_types,
        "nullCounts": nulls,
        "experimentValues": experiments,
        "uniqueFieldCount": len(field_counts),
        "fieldCounts": dict(sorted(field_counts.items())),
        "timeNs": sequence_stats(time_ns),
        "timeUtc": sequence_stats(time_utc),
        "timeNsUtcMismatchCount": mismatches,
        "nonFiniteValueCount": nonfinite,
    })

json.dump({
    "parser": {
        "engine": "pyarrow",
        "pythonVersion": sys.version.split()[0],
        "pyarrowVersion": pa.__version__,
    },
    "traceCount": len(traces),
    "totalRows": total_rows,
    "aggregateFieldCounts": dict(sorted(aggregate_fields.items())),
    "aggregateFieldSet": sorted(aggregate_fields),
    "traces": traces,
}, sys.stdout, separators=(",", ":"), sort_keys=True)
`;

function filenameMotionFamilySignals(remotePath) {
  const basename = path.posix.basename(remotePath).toLowerCase();
  const signals = [];
  const rules = [
    ["BACKLASH_DETECTION", /backlash/u],
    ["FREQUENCY_SWEEP", /(frequency|freq)[-_]?sweep|sine[-_]?sweep/u],
    ["MULTISINE", /multi[-_]?sine|multisine/u],
    ["PICK_PLACE", /pick[-_]?.*place/u],
    ["SINGLE_JOINT", /single[-_]?joint/u],
    ["WORKSPACE_SWEEP", /workspace/u],
  ];
  for (const [family, expression] of rules) if (expression.test(basename)) signals.push(family);
  return signals;
}

export function extractAnchorLabSo101Mechanics(sourceDirectory, options = {}) {
  const before = verifyAnchorLabSo101SourceDirectory(sourceDirectory);
  const pythonExecutable = options.pythonExecutable ?? process.env.OUTSIDER_PYTHON ?? ".venv/bin/python";
  if (typeof pythonExecutable !== "string" || pythonExecutable.length < 1) {
    fail("PYTHON_EXECUTABLE_INVALID");
  }
  const objects = before.manifest.remoteObjects.filter((entry) => entry.path !== README_PATH)
    .map(({ path: objectPath, split, sizeBytes, sha256 }) =>
      ({ path: objectPath, split, sizeBytes, sha256 }));
  const child = spawnSync(pythonExecutable, ["-c", PYARROW_EXTRACTOR], {
    cwd: process.cwd(),
    input: JSON.stringify({ root: before.sourceDirectory, objects }),
    encoding: "utf8",
    timeout: PYARROW_TIMEOUT_MS,
    maxBuffer: MAX_EXTRACTOR_OUTPUT_BYTES,
  });
  if (child.error || child.status !== 0 || child.signal !== null) {
    fail("PYARROW_EXTRACTOR_FAILED",
      child.error?.message ?? child.stderr?.trim() ?? `status=${child.status};signal=${child.signal}`);
  }
  let extracted;
  try { extracted = JSON.parse(child.stdout); }
  catch { fail("PYARROW_EXTRACTOR_OUTPUT_INVALID"); }
  const after = verifyAnchorLabSo101SourceDirectory(sourceDirectory);
  if (before.manifestFileSha256 !== after.manifestFileSha256
    || before.sourceRoot !== after.sourceRoot) fail("SOURCE_CHANGED_AROUND_EXTRACTION");
  if (!exactObject(extracted) || extracted.traceCount !== EXPECTED_PROFILE.parquetFiles
    || !Number.isSafeInteger(extracted.totalRows) || extracted.totalRows <= 0
    || !Array.isArray(extracted.traces) || extracted.traces.length !== EXPECTED_PROFILE.parquetFiles
    || !exactObject(extracted.aggregateFieldCounts)
    || !Array.isArray(extracted.aggregateFieldSet)
    || extracted.parser?.engine !== "pyarrow") fail("PYARROW_EXTRACT_INVALID");
  const manifestByPath = new Map(objects.map((entry) => [entry.path, entry]));
  const familyCounts = {};
  let unclassified = 0;
  for (const trace of extracted.traces) {
    const expected = manifestByPath.get(trace.path);
    if (!expected || trace.split !== expected.split || trace.sizeBytes !== expected.sizeBytes
      || trace.sha256 !== expected.sha256 || !Number.isSafeInteger(trace.rowCount)
      || trace.rowCount <= 0 || !Array.isArray(trace.schemaOrder)
      || !exactObject(trace.schemaTypes) || !exactObject(trace.fieldCounts)) {
      fail("PYARROW_TRACE_INVALID", trace?.path);
    }
    trace.motionFamilySignals = filenameMotionFamilySignals(trace.path);
    trace.motionFamilyAttribution = "LEXICAL_FILENAME_SIGNAL_NOT_SEMANTIC_GROUND_TRUTH";
    if (trace.motionFamilySignals.length === 0) unclassified += 1;
    for (const family of trace.motionFamilySignals) {
      familyCounts[family] = (familyCounts[family] ?? 0) + 1;
    }
  }
  extracted.traces.sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({ ...extracted,
    parser: { ...extracted.parser,
      helperSha256: anchorLabSha256(Buffer.from(PYARROW_EXTRACTOR, "utf8")),
      timeoutMs: PYARROW_TIMEOUT_MS,
      maxOutputBytes: MAX_EXTRACTOR_OUTPUT_BYTES },
    motionFamilySignals: Object.fromEntries(Object.entries(familyCounts)
      .sort(([left], [right]) => left.localeCompare(right))),
    unclassifiedFilenamePatternTraces: unclassified,
    sourceVerification: { manifestFileSha256: before.manifestFileSha256,
      sourceRoot: before.sourceRoot, verificationLevel: before.verificationLevel } });
}

function sumTraceMetric(traces, selector) {
  return traces.reduce((sum, trace) => sum + selector(trace), 0);
}

function segmentZero(label) {
  return {
    sourceNativeCount: 0,
    sourceNativeAttribution: `NOT_A_${label}_SOURCE`,
    independentCount: 0,
    independentAttribution: "NO_INDEPENDENT_WITNESS",
    crossAttributionAdditionPermitted: false,
    additiveTotal: null,
  };
}

export function buildAnchorLabSo101MechanicsFromExtracted(sourceVerification, extracted) {
  if (sourceVerification?.ok !== true
    || sourceVerification.verificationLevel !== "FULL_SOURCE_BYTE_REPLAY"
    || !exactObject(sourceVerification.manifest) || !exactObject(extracted)
    || extracted.sourceVerification?.sourceRoot !== sourceVerification.sourceRoot
    || extracted.sourceVerification?.manifestFileSha256
      !== sourceVerification.manifestFileSha256) fail("BUILD_SOURCE_INPUT_INVALID");
  const manifest = sourceVerification.manifest;
  const traces = extracted.traces;
  const trainTraces = traces.filter((trace) => trace.split === "TRAIN").length;
  const heldoutTraces = traces.filter((trace) => trace.split === "HELDOUT").length;
  const schemaOrderMatches = traces.filter((trace) =>
    trace.schemaOrderMatchesPublisherCard === true).length;
  const schemaTypesMatch = traces.filter((trace) =>
    trace.schemaTypesMatchPublisherCard === true).length;
  const timeNsNondecreasing = traces.filter((trace) => trace.timeNs?.nondecreasing === true).length;
  const timeUtcNondecreasing = traces.filter((trace) => trace.timeUtc?.nondecreasing === true).length;
  const nullCounts = {};
  for (const field of EXPECTED_SCHEMA_ORDER) {
    nullCounts[field] = sumTraceMetric(traces,
      (trace) => Number(trace.nullCounts?.[field] ?? 0));
  }
  const body = {
    schema: ANCHOR_LAB_MECHANICS_SCHEMA,
    dataset: {
      id: ANCHOR_LAB_DATASET_ID,
      revision: ANCHOR_LAB_REVISION,
      versionClaim: ANCHOR_LAB_VERSION,
      publisher: "NVIDIA Corporation / NVIDIA Robotics",
      sourceClass: "HISTORICAL_REAL_ROBOT_MECHANICAL_TELEMETRY",
      robotPlatform: "SO-101",
      selectedGroup: "data/so101_arm_50motion",
      mediaFetched: false,
    },
    source: {
      manifestHash: manifest.manifestHash,
      manifestFileSha256: sourceVerification.manifestFileSha256,
      sourceRoot: sourceVerification.sourceRoot,
      sourceObjects: EXPECTED_PROFILE.sourceObjects,
      sourceBytes: EXPECTED_PROFILE.sourceBytes,
      parquetObjects: EXPECTED_PROFILE.parquetFiles,
      parquetBytes: EXPECTED_PROFILE.parquetBytes,
      repositoryRecordBracketed: true,
      fullTreeBracketed: true,
      repositoryRecordStableDuringAcquisition: true,
      treeStableDuringAcquisition: true,
      sourceSupportBytesRetained: true,
      remoteTransportAttested: false,
    },
    denominator: {
      class: "MECHANICAL_SYSTEM_IDENTIFICATION_TRACE",
      unit: "REAL_MECHANICAL_SYSTEM_IDENTIFICATION_TRACE",
      units: EXPECTED_PROFILE.parquetFiles,
      trainFilenameSplitTraces: trainTraces,
      heldoutFilenameSplitTraces: heldoutTraces,
      trainFilenameDoesNotAuthorizeModelTraining: true,
      realityEpisodeRecords: 0,
      taskOutcomeEpisodes: 0,
      recoveryEpisodes: 0,
    },
    replay: {
      verificationLevel: "FULL_SOURCE_REDERIVED",
      parser: extracted.parser,
      tracesParsed: extracted.traceCount,
      rowsParsed: extracted.totalRows,
      schema: {
        publisherCardOrder: [...EXPECTED_SCHEMA_ORDER],
        publisherCardTypes: { ...EXPECTED_SCHEMA_TYPES },
        filesMatchingPublisherCardOrder: schemaOrderMatches,
        filesMatchingPublisherCardTypes: schemaTypesMatch,
        aggregateFieldSet: extracted.aggregateFieldSet,
        aggregateFieldCounts: extracted.aggregateFieldCounts,
        units: "UNKNOWN_NO_FIELD_DICTIONARY",
        fullFieldDictionaryDeclared: false,
      },
      time: {
        filesTimeNsNondecreasing: timeNsNondecreasing,
        filesTimeUtcNondecreasing: timeUtcNondecreasing,
        timeNsDecreaseCount: sumTraceMetric(traces, (trace) => trace.timeNs.decreases),
        timeUtcDecreaseCount: sumTraceMetric(traces, (trace) => trace.timeUtc.decreases),
        timeNsUtcMismatchCount: sumTraceMetric(traces,
          (trace) => trace.timeNsUtcMismatchCount),
      },
      quality: {
        nullCounts,
        nonFiniteValueCount: sumTraceMetric(traces,
          (trace) => trace.nonFiniteValueCount),
        tracesWithMultipleExperimentValues: traces.filter((trace) =>
          trace.experimentValues.length > 1).length,
      },
      motionFamilies: {
        attribution: "LEXICAL_FILENAME_SIGNALS_CONSISTENT_WITH_PUBLISHER_CARD_NOT_SEMANTIC_LABELS",
        publisherCardDeclaredFamilies: [
          "BACKLASH_DETECTION", "FREQUENCY_SWEEP", "MULTISINE", "PICK_PLACE",
          "SINGLE_JOINT", "WORKSPACE_SWEEP",
        ],
        observedFilenameSignals: extracted.motionFamilySignals,
        tracesWithoutDeclaredFilenameSignal: extracted.unclassifiedFilenamePatternTraces,
      },
      traces,
    },
    observation: {
      physicalRobotTelemetryBytesReplayed: true,
      physicalRobotPlatformPublisherClaim: true,
      taskActionTraceEstablished: false,
      semanticTaskEffectEstablished: false,
      semanticTaskOutcomeEstablished: false,
      failureLabelEstablished: false,
      recoverySuffixEstablished: false,
      independentWitnessEstablished: false,
      causalEffectEstablished: false,
      controllerSafetyEstablished: false,
    },
    knowledgeBoundary: {
      unitsKnown: false,
      fieldDictionaryKnown: false,
      hardwareRevisionKnown: false,
      firmwareVersionKnown: false,
      controllerConfigurationKnown: false,
      sensorConfigurationKnown: false,
      calibrationParametersKnown: false,
      standardizedBenchmarkSplitEstablished: false,
      transferToUsersSoArmEstablished: false,
      unknownsMustNotBeGuessed: true,
    },
    segments: {
      opportunityCensus: segmentZero("OPPORTUNITY_CENSUS"),
      delegationAuthorization: segmentZero("DELEGATION_AUTHORIZATION"),
      actionTrace: segmentZero("TASK_ACTION_TRACE"),
      effect: segmentZero("SEMANTIC_EFFECT"),
      outcome: segmentZero("TASK_OUTCOME"),
      recovery: segmentZero("RECOVERY"),
      longitudinal: segmentZero("LONGITUDINAL_OUTCOME"),
    },
    license: {
      status: "PUBLISHER_CARD_APACHE_2_0_CLAIM_BYTE_PINNED",
      publisherClaim: "Apache-2.0",
      publisherClaimSource: "README.md at pinned revision",
      standaloneLicenseFileInSelectedClosure: false,
      legalConclusionEstablished: false,
      rawDatasetRedistributionAuthorizedByOutsider: false,
      productionTrainingAuthorizedByOutsider: false,
      expandedUseRequiresIndependentReview: true,
    },
    privacy: {
      modality: "TABULAR_TELEMETRY_NO_IMAGERY_OR_AUDIO_IN_SELECTED_CLOSURE",
      cardClaimsNoIntentionalHumanSubjectDataImageryOrPii: true,
      imageryFetched: false,
      audioFetched: false,
      freeTextFetchedBeyondDatasetCardAndStructuredIdentifiers: false,
      noPiiGuaranteed: false,
    },
    useBoundary: {
      status: "OFFLINE_MECHANICAL_ANALYSIS_ONLY",
      offlineMechanicalAnalysis: true,
      modelTrainingPerformed: false,
      modelTrainingAuthorizedByArtifact: false,
      automaticTraining: false,
      modelPromotion: false,
      controllerDerived: false,
      controllerDeployed: false,
      actionDispatched: false,
    },
    network: {
      admitted: false,
      projected: false,
      published: false,
      externalSubmissionPerformed: false,
      networkAdmissionRows: 0,
      networkProjectionRows: 0,
      authorityDelta: 0,
    },
    economics: {
      CEU: 0,
      pricingUnits: 0,
      underwritingUnits: 0,
      guaranteeUnits: 0,
      settlementUnits: 0,
      economicAuthorityDelta: 0,
    },
    authority: {
      mode: "HISTORICAL_OFFLINE_MECHANICAL_OBSERVATION_ONLY",
      repositoryCommitPinned: true,
      exactSelectedClosureDownloaded: true,
      officialBytesMatchedPinnedTreeAndReplayed: true,
      releaseTagEstablished: false,
      commitSignatureVerified: false,
      publisherIdentityCryptographicallyVerified: false,
      fullDatasetDownloaded: false,
      opportunityAuthorityEstablished: false,
      delegationAuthorityEstablished: false,
      executionAuthorityEstablished: false,
      physicalSafetyEstablished: false,
      outcomeTruthEstablished: false,
      trainingAuthorityEstablished: false,
      networkAuthorityEstablished: false,
      pricingAuthorityEstablished: false,
      CEUAuthorityEstablished: false,
      authorityDelta: 0,
    },
  };
  return Object.freeze({ ...body,
    artifactHash: anchorLabDigest(body, `${ANCHOR_LAB_MECHANICS_SCHEMA}/artifact`) });
}

export function buildAnchorLabSo101MechanicsFromSource(sourceDirectory, options = {}) {
  const sourceVerification = verifyAnchorLabSo101SourceDirectory(sourceDirectory);
  const extracted = extractAnchorLabSo101Mechanics(sourceDirectory, options);
  return buildAnchorLabSo101MechanicsFromExtracted(sourceVerification, extracted);
}

export function verifyAnchorLabSo101MechanicsArtifact(artifact) {
  try {
    if (!exactObject(artifact)) fail("ARTIFACT_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifact.schema !== ANCHOR_LAB_MECHANICS_SCHEMA
      || artifactHash !== anchorLabDigest(body, `${ANCHOR_LAB_MECHANICS_SCHEMA}/artifact`)
      || artifact.dataset?.id !== ANCHOR_LAB_DATASET_ID
      || artifact.dataset?.revision !== ANCHOR_LAB_REVISION
      || artifact.source?.sourceObjects !== EXPECTED_PROFILE.sourceObjects
      || artifact.source?.sourceBytes !== EXPECTED_PROFILE.sourceBytes
      || artifact.denominator?.class !== "MECHANICAL_SYSTEM_IDENTIFICATION_TRACE"
      || artifact.denominator?.unit !== "REAL_MECHANICAL_SYSTEM_IDENTIFICATION_TRACE"
      || artifact.denominator?.units !== EXPECTED_PROFILE.parquetFiles
      || artifact.denominator?.trainFilenameSplitTraces !== EXPECTED_PROFILE.trainTraces
      || artifact.denominator?.heldoutFilenameSplitTraces !== EXPECTED_PROFILE.heldoutTraces
      || artifact.denominator?.realityEpisodeRecords !== 0
      || artifact.denominator?.taskOutcomeEpisodes !== 0
      || artifact.denominator?.recoveryEpisodes !== 0
      || artifact.replay?.tracesParsed !== EXPECTED_PROFILE.parquetFiles
      || !Number.isSafeInteger(artifact.replay?.rowsParsed) || artifact.replay.rowsParsed <= 0
      || !Array.isArray(artifact.replay?.traces)
      || artifact.replay.traces.length !== EXPECTED_PROFILE.parquetFiles
      || artifact.observation?.semanticTaskOutcomeEstablished !== false
      || artifact.observation?.independentWitnessEstablished !== false
      || artifact.knowledgeBoundary?.unknownsMustNotBeGuessed !== true
      || artifact.privacy?.noPiiGuaranteed !== false
      || artifact.useBoundary?.status !== "OFFLINE_MECHANICAL_ANALYSIS_ONLY"
      || artifact.useBoundary?.modelTrainingPerformed !== false
      || artifact.useBoundary?.modelTrainingAuthorizedByArtifact !== false
      || artifact.useBoundary?.actionDispatched !== false
      || artifact.network?.admitted !== false || artifact.network?.projected !== false
      || artifact.network?.networkAdmissionRows !== 0
      || artifact.network?.networkProjectionRows !== 0
      || artifact.network?.authorityDelta !== 0
      || Object.values(artifact.economics ?? {}).some((value) => value !== 0)
      || artifact.authority?.opportunityAuthorityEstablished !== false
      || artifact.authority?.delegationAuthorityEstablished !== false
      || artifact.authority?.executionAuthorityEstablished !== false
      || artifact.authority?.physicalSafetyEstablished !== false
      || artifact.authority?.outcomeTruthEstablished !== false
      || artifact.authority?.trainingAuthorityEstablished !== false
      || artifact.authority?.networkAuthorityEstablished !== false
      || artifact.authority?.pricingAuthorityEstablished !== false
      || artifact.authority?.CEUAuthorityEstablished !== false
      || artifact.authority?.authorityDelta !== 0) fail("ARTIFACT_BOUNDARY_INVALID");
    if (!exactKeys(artifact.segments, [
      "opportunityCensus", "delegationAuthorization", "actionTrace", "effect",
      "outcome", "recovery", "longitudinal",
    ])) fail("ARTIFACT_SEGMENTS_INVALID");
    for (const segment of Object.values(artifact.segments ?? {})) {
      if (segment?.sourceNativeCount !== 0 || segment?.independentCount !== 0
        || segment?.crossAttributionAdditionPermitted !== false
        || segment?.additiveTotal !== null) fail("ARTIFACT_SEGMENT_INVALID");
    }
    return Object.freeze({ ok: true,
      verificationLevel: "SELF_SEALED_PROJECTION_BOUNDARY_ONLY",
      sourceAuthenticated: false,
      sourceCountsAuthenticated: false,
      authorityEstablished: false,
      outcomeTruthEstablished: false,
      artifactHash });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function verifyAnchorLabSo101MechanicsArtifactWithSource(artifact,
  sourceDirectory, options = {}) {
  try {
    const standalone = verifyAnchorLabSo101MechanicsArtifact(artifact);
    if (!standalone.ok) fail("FULL_REPLAY_STANDALONE_INVALID", standalone.error);
    const source = verifyAnchorLabSo101SourceDirectory(sourceDirectory);
    if (artifact.source?.sourceRoot !== source.sourceRoot
      || artifact.source?.manifestFileSha256 !== source.manifestFileSha256
      || artifact.source?.manifestHash !== source.manifest.manifestHash) {
      fail("FULL_REPLAY_SOURCE_IDENTITY_MISMATCH");
    }
    const rebuilt = buildAnchorLabSo101MechanicsFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("FULL_REPLAY_ARTIFACT_MISMATCH");
    return Object.freeze({ ok: true, verificationLevel: "FULL_SOURCE_REDERIVED",
      sourceArtifactsReverified: true, candidateArtifactExactlyRebuilt: true,
      verifiedTraceCount: EXPECTED_PROFILE.parquetFiles,
      verifiedRowCount: rebuilt.replay.rowsParsed,
      authorityEstablished: false, outcomeTruthEstablished: false,
      trainingAuthorized: false, networkAdmission: false });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function buildAnchorLabSo101RunReceipt(report, reportBytes) {
  const checked = verifyAnchorLabSo101MechanicsArtifact(report);
  if (!checked.ok || !Buffer.isBuffer(reportBytes)
    || !reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_REPORT_INVALID");
  const body = {
    schema: ANCHOR_LAB_RUN_RECEIPT_SCHEMA,
    datasetId: ANCHOR_LAB_DATASET_ID,
    revision: ANCHOR_LAB_REVISION,
    versionClaim: ANCHOR_LAB_VERSION,
    reportHash: report.artifactHash,
    reportFileSha256: anchorLabSha256(reportBytes),
    sourceManifestHash: report.source.manifestHash,
    sourceManifestFileSha256: report.source.manifestFileSha256,
    sourceRoot: report.source.sourceRoot,
    sourceObjects: EXPECTED_PROFILE.sourceObjects,
    sourceBytes: EXPECTED_PROFILE.sourceBytes,
    mechanicalSystemIdentificationTraces: EXPECTED_PROFILE.parquetFiles,
    trainFilenameSplitTraces: EXPECTED_PROFILE.trainTraces,
    heldoutFilenameSplitTraces: EXPECTED_PROFILE.heldoutTraces,
    rowsParsed: report.replay.rowsParsed,
    parser: report.replay.parser,
    completionMarker: true,
    useStatus: "OFFLINE_MECHANICAL_ANALYSIS_ONLY",
    realityEpisodeRecords: 0,
    taskOutcomeEpisodes: 0,
    recoveryEpisodes: 0,
    trainingRows: 0,
    networkAdmissionRows: 0,
    networkProjectionRows: 0,
    CEU: 0,
    pricingUnits: 0,
    authorityUnits: 0,
  };
  return Object.freeze({ ...body,
    receiptHash: anchorLabDigest(body, `${ANCHOR_LAB_RUN_RECEIPT_SCHEMA}/receipt`) });
}

export function verifyAnchorLabSo101RunReceipt(receipt, report, reportBytes) {
  try {
    const expected = buildAnchorLabSo101RunReceipt(report, reportBytes);
    if (!same(receipt, expected)) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true, receiptHash: receipt.receiptHash });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function publishAnchorLabSo101ArtifactDirectory(stagingDirectory, targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (staging === target || path.dirname(staging) !== path.dirname(target)) {
    fail("PUBLISH_DIRECTORIES_NOT_SIBLINGS");
  }
  const before = lstatSync(staging, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()
    || Number(before.mode & 0o777n) !== 0o700
    || !same(sorted(readdirSync(staging)), ["report.json", "run-receipt.json", "source"])) {
    fail("PUBLISH_STAGING_UNSAFE");
  }
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("PUBLISH_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "source"), path.join(target, "source"));
    renameSync(path.join(staging, "report.json"), path.join(target, "report.json"));
    /* Receipt is the final completion marker. */
    renameSync(path.join(staging, "run-receipt.json"),
      path.join(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch { fail("PUBLISH_TARGET_INCOMPLETE", target); }
  return target;
}

export function verifyAnchorLabSo101ArtifactDirectory(artifactDirectory, options = {}) {
  try {
    const root = path.resolve(artifactDirectory);
    const snapshots = [];
    requireDirectory(root, ["report.json", "run-receipt.json", "source"], snapshots);
    const reportBytes = readPrivateStable(root, "report.json", snapshots,
      null, MAX_EXTRACTOR_OUTPUT_BYTES);
    const receiptBytes = readPrivateStable(root, "run-receipt.json", snapshots,
      null, 2 * 1024 * 1024);
    const report = parseJson(reportBytes, "REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "RECEIPT_JSON_INVALID");
    const replay = verifyAnchorLabSo101MechanicsArtifactWithSource(report,
      path.join(root, "source"), options);
    const receiptCheck = verifyAnchorLabSo101RunReceipt(receipt, report, reportBytes);
    if (!replay.ok || !receiptCheck.ok || receipt.completionMarker !== true) {
      fail("ARTIFACT_DIRECTORY_REPLAY_FAILED",
        replay.error ?? receiptCheck.error ?? "completion-marker");
    }
    recheckSnapshots(snapshots);
    return Object.freeze({ ...replay, receiptHash: receipt.receiptHash,
      reportFileSha256: receipt.reportFileSha256,
      artifactHash: report.artifactHash });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export const ANCHOR_LAB_SO101_CONSTANTS = Object.freeze({
  expectedProfile: EXPECTED_PROFILE,
  expectedSchemaOrder: EXPECTED_SCHEMA_ORDER,
  expectedSchemaTypes: EXPECTED_SCHEMA_TYPES,
  groupPrefix: GROUP_PREFIX,
  pyarrowExtractorSha256: anchorLabSha256(Buffer.from(PYARROW_EXTRACTOR, "utf8")),
});
