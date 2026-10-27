/*
 * FARM UF850 public failure/recovery morphology intake.
 *
 * This slice pins the final 66-episode revision, enumerates the complete
 * repository tree before and after acquisition, and downloads the complete
 * no-video state/action closure.  Publisher task text can establish a
 * within-episode failure-then-recovery morphology.  Without the two video
 * streams or object-state telemetry it cannot establish the physical drop,
 * task success, an independent witness, or a complete attempt census.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const FARM_DATASET_ID = "NoahWeiss/farm_uf850";
export const FARM_REVISION = "51f0836c86873e18d91d4f3a5bb734dabc065d36";
export const FARM_INITIAL_66_REVISION = "e47c25818ead772ee8e93f7c56c1af17a4caa8fe";
export const FARM_CURRENT_HEAD_AT_FREEZE = "c96f01c927c783a2900a910d619e598a06dd4a18";
export const FARM_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const FARM_SOURCE_SCHEMA = "outsider/farm-uf850-pinned-source/v1";
export const FARM_INVENTORY_SCHEMA = "outsider/farm-uf850-inventory/v1";
export const FARM_REPORT_SCHEMA = "outsider/farm-uf850-recovery-morphology/v1";
export const FARM_RECEIPT_SCHEMA = "outsider/farm-uf850-run-receipt/v1";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${FARM_DATASET_ID}`;
const RECORD_URL = `${HF_API}/revision/${FARM_REVISION}`;
const COMMITS_URL = `${HF_API}/commits/main?limit=100`;
const TREE_PATH = `/api/datasets/${FARM_DATASET_ID}/tree/${FARM_REVISION}`;
const TREE_URL = `${HF_ORIGIN}${TREE_PATH}?recursive=true&limit=1000`;
const RESOLVE_ROOT = `${HF_ORIGIN}/datasets/${FARM_DATASET_ID}/resolve/${FARM_REVISION}`;
const GITHUB_REPOSITORY_URL = "https://github.com/NoahWeiss123/CS153";
const GITHUB_API_URL = "https://api.github.com/repos/NoahWeiss123/CS153";
const FETCH_TIMEOUT_MS = 180_000;
const MAX_API_BYTES = 16 * 1024 * 1024;
const MAX_SELECTED_OBJECT_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_CONCURRENCY = 12;
const DOWNLOAD_ATTEMPTS = 3;
const EXPECTED = Object.freeze({
  treeEntries: 211,
  treeFiles: 204,
  treeDirectories: 7,
  treeBytes: 232_558_348,
  parquetFiles: 66,
  parquetBytes: 2_978_478,
  videoFiles: 132,
  videoBytes: 229_556_112,
  selectedFiles: 72,
  selectedBytes: 3_002_236,
  episodes: 66,
  frames: 25_803,
  tasks: 17,
  publisherRecoveryMorphologyEpisodes: 9,
  excludedEarlyDemosClaim: 41,
});
const RECOVERY_TASK_INDEXES = Object.freeze([2, 7, 9, 10, 11, 13]);
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_REDIRECT_HOST = /(?:^|\.)(?:hf\.co|huggingface\.co)$/iu;

function fail(code, detail = null) {
  throw new Error(detail === null ? `FARM_UF850_${code}`
    : `FARM_UF850_${code}:${detail}`);
}

export function farmSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function farmDigest(value, domain = FARM_REPORT_SCHEMA) {
  return farmSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length < 1 || value.includes("\\")
    || value.startsWith("/") || value.split("/").some((part) => part === "" || part === "."
      || part === "..") || path.posix.normalize(value) !== value) {
    fail("PATH_INVALID", String(value));
  }
  return value;
}

function checkedUrl(value, kind) {
  const url = new URL(value);
  if (url.username !== "" || url.password !== "" || url.protocol !== "https:") {
    fail("URL_INVALID", value);
  }
  if (kind === "HF" && url.origin !== HF_ORIGIN) fail("HF_URL_INVALID", value);
  if (kind === "GITHUB" && url.origin !== "https://api.github.com") {
    fail("GITHUB_URL_INVALID", value);
  }
  if (kind === "REDIRECT" && !(url.origin === HF_ORIGIN
    || SAFE_REDIRECT_HOST.test(url.hostname))) fail("REDIRECT_URL_INVALID", value);
  return url;
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readResponse(response, maximumBytes, expectedBytes = null) {
  if (!response.body) fail("FETCH_BODY_MISSING");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared)
    || Number(declared) > maximumBytes
    || expectedBytes !== null && Number(declared) !== expectedBytes)) {
    fail("FETCH_CONTENT_LENGTH_INVALID", declared);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes || expectedBytes !== null && total > expectedBytes) {
      await reader.cancel("bounded source limit exceeded");
      fail("FETCH_STREAM_SIZE_INVALID", String(total));
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1 || expectedBytes !== null && total !== expectedBytes) {
    fail("FETCH_BODY_SIZE_INVALID", String(total));
  }
  return Buffer.concat(chunks, total);
}

async function apiFetch(value, maximumBytes, fetchImpl, expectedStatus = 200) {
  const kind = value.startsWith("https://api.github.com/") ? "GITHUB" : "HF";
  const url = checkedUrl(value, kind);
  let lastError = null;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        redirect: "error",
        headers: { accept: "application/json", "accept-encoding": "identity",
          "user-agent": "outsider-farm-uf850/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.status !== expectedStatus || response.headers.get("content-encoding") !== null
        || new URL(response.url || url).origin !== url.origin) {
        fail(`FETCH_HTTP_${response.status}`, url.pathname);
      }
      return { bytes: await readResponse(response, maximumBytes), status: response.status,
        headers: response.headers };
    } catch (error) {
      lastError = error;
      if (attempt < DOWNLOAD_ATTEMPTS) await delay(250 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

async function jsonFetch(value, maximumBytes, fetchImpl, expectedStatus = 200) {
  const fetched = await apiFetch(value, maximumBytes, fetchImpl, expectedStatus);
  return { ...fetched, value: parseJson(fetched.bytes, "FETCH_JSON_INVALID") };
}

async function objectFetch(remotePath, expectedBytes, fetchImpl) {
  const initial = checkedUrl(`${RESOLVE_ROOT}/${remotePath}?download=true`, "HF");
  let lastError = null;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      let url = initial;
      for (let redirect = 0; redirect < 5; redirect += 1) {
        const response = await fetchImpl(url, {
          redirect: "manual",
          headers: { accept: "application/octet-stream", "accept-encoding": "identity",
            "user-agent": "outsider-farm-uf850/1.0" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location) fail("OBJECT_REDIRECT_LOCATION_MISSING", remotePath);
          url = checkedUrl(new URL(location, url).toString(), "REDIRECT");
          continue;
        }
        if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
          fail(`OBJECT_HTTP_${response.status}`, remotePath);
        }
        return readResponse(response, Math.min(MAX_SELECTED_OBJECT_BYTES,
          Math.max(1, expectedBytes)), expectedBytes);
      }
      fail("OBJECT_REDIRECT_LIMIT", remotePath);
    } catch (error) {
      lastError = error;
      if (attempt < DOWNLOAD_ATTEMPTS) await delay(250 * (2 ** (attempt - 1)));
    }
  }
  throw lastError;
}

function recordProjection(value) {
  if (!exactObject(value) || value.id !== FARM_DATASET_ID || value.sha !== FARM_REVISION
    || value.private !== false || value.gated !== false || value.disabled !== false
    || value.cardData?.license !== "apache-2.0"
    || value.lastModified !== "2026-05-27T21:44:33.000Z"
    || !Array.isArray(value.siblings) || value.siblings.length !== EXPECTED.treeFiles
    || !Number.isSafeInteger(value.usedStorage) || value.usedStorage < EXPECTED.treeBytes) {
    fail("REPOSITORY_RECORD_INVALID");
  }
  return { datasetId: FARM_DATASET_ID, revision: FARM_REVISION,
    lastModified: value.lastModified, private: false, gated: false, disabled: false,
    publisherLicenseClaim: "Apache-2.0", repositoryReportedUsedStorageBytes: value.usedStorage,
    siblingCount: value.siblings.length,
    siblingPaths: sorted(value.siblings.map((item) => safeRelative(item.rfilename))) };
}

function commitsProjection(value) {
  if (!Array.isArray(value) || value.length !== 4) fail("COMMITS_INVALID");
  const projected = value.map((entry) => {
    if (!exactObject(entry) || !SHA1.test(entry.id ?? "")
      || typeof entry.title !== "string" || typeof entry.message !== "string"
      || typeof entry.date !== "string" || !Array.isArray(entry.authors)) {
      fail("COMMIT_ENTRY_INVALID");
    }
    return { id: entry.id, title: entry.title, message: entry.message, date: entry.date,
      authors: entry.authors.map((author) => ({ user: author.user })) };
  });
  const expected = [
    [FARM_CURRENT_HEAD_AT_FREEZE, "200 episodes, 2 tasks, 59183 frames, 30 fps",
      "2026-05-29T00:23:12.000Z"],
    [FARM_REVISION, "regenerate exact-fps timestamps (i/30) for LeRobot validator",
      "2026-05-27T21:44:33.000Z"],
    [FARM_INITIAL_66_REVISION, "initial upload: 66 episodes, 17 tasks, 30 fps",
      "2026-05-27T20:57:24.000Z"],
    ["e0af7ba8c23d2170f8eafc608b733d23e16f7d34", "initial commit",
      "2026-05-27T20:56:48.000Z"],
  ];
  for (let index = 0; index < expected.length; index += 1) {
    if (projected[index].id !== expected[index][0]
      || projected[index].title !== expected[index][1]
      || projected[index].date !== expected[index][2]
      || projected[index].authors.length !== 1
      || projected[index].authors[0].user !== "NoahWeiss") fail("COMMIT_LINEAGE_CHANGED");
  }
  return projected;
}

function normalizeTree(value) {
  if (!Array.isArray(value)) fail("TREE_INVALID");
  const entries = value.map((entry) => {
    if (!exactObject(entry) || !["file", "directory"].includes(entry.type)
      || !SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      fail("TREE_ENTRY_INVALID");
    }
    const projected = { path: safeRelative(entry.path), type: entry.type,
      gitOid: entry.oid, sizeBytes: entry.size };
    if (entry.type === "directory") {
      if (entry.size !== 0 || entry.lfs !== undefined || entry.xetHash !== undefined) {
        fail("TREE_DIRECTORY_INVALID", entry.path);
      }
      return { ...projected, lfs: null, xetHash: null };
    }
    if (entry.size < 1) fail("TREE_FILE_EMPTY", entry.path);
    let lfs = null;
    if (entry.lfs !== undefined) {
      if (!exactObject(entry.lfs) || !SHA256.test(entry.lfs.oid ?? "")
        || entry.lfs.size !== entry.size || !Number.isSafeInteger(entry.lfs.pointerSize)) {
        fail("TREE_LFS_INVALID", entry.path);
      }
      lfs = { sha256: `sha256:${entry.lfs.oid}`, sizeBytes: entry.lfs.size,
        pointerSize: entry.lfs.pointerSize };
    }
    const xetHash = entry.xetHash === undefined ? null : entry.xetHash;
    if (xetHash !== null && !SHA256.test(xetHash)) fail("TREE_XET_INVALID", entry.path);
    return { ...projected, lfs, xetHash };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("TREE_PATH_DUPLICATE");
  }
  return entries;
}

function treeSummary(entries) {
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  return { entries: entries.length, files: files.length, directories: directories.length,
    bytes: files.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    snapshotHash: farmDigest(entries, `${FARM_SOURCE_SCHEMA}/tree`) };
}

function inventoryFromTree(entries) {
  const files = entries.filter((entry) => entry.type === "file");
  const parquets = files.filter((entry) => entry.path.endsWith(".parquet"));
  const videos = files.filter((entry) => entry.path.endsWith(".mp4"));
  const selected = files.filter((entry) => !entry.path.endsWith(".mp4"));
  const expectedOther = new Set([".gitattributes", "README.md", "meta/episodes.jsonl",
    "meta/info.json", "meta/stats.json", "meta/tasks.jsonl"]);
  const other = selected.filter((entry) => !entry.path.endsWith(".parquet"));
  const expectedParquets = Array.from({ length: EXPECTED.parquetFiles }, (_, index) =>
    `data/chunk-000/episode_${String(index).padStart(6, "0")}.parquet`);
  const expectedVideos = Array.from({ length: EXPECTED.episodes }, (_, index) => [
    `videos/chunk-000/observation.images.base/episode_${String(index).padStart(6, "0")}.mp4`,
    `videos/chunk-000/observation.images.wrist/episode_${String(index).padStart(6, "0")}.mp4`,
  ]).flat().sort();
  const counts = { entries: entries.length, files: files.length,
    directories: entries.filter((entry) => entry.type === "directory").length,
    repositoryBytes: files.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    parquetFiles: parquets.length,
    parquetBytes: parquets.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    excludedVideoFiles: videos.length,
    excludedVideoBytes: videos.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    selectedNoVideoFiles: selected.length,
    selectedNoVideoBytes: selected.reduce((sum, entry) => sum + entry.sizeBytes, 0) };
  if (!same(counts, { entries: EXPECTED.treeEntries, files: EXPECTED.treeFiles,
    directories: EXPECTED.treeDirectories, repositoryBytes: EXPECTED.treeBytes,
    parquetFiles: EXPECTED.parquetFiles, parquetBytes: EXPECTED.parquetBytes,
    excludedVideoFiles: EXPECTED.videoFiles, excludedVideoBytes: EXPECTED.videoBytes,
    selectedNoVideoFiles: EXPECTED.selectedFiles,
    selectedNoVideoBytes: EXPECTED.selectedBytes })
    || !same(parquets.map((entry) => entry.path).sort(), expectedParquets)
    || !same(videos.map((entry) => entry.path).sort(), expectedVideos)
    || other.length !== expectedOther.size
    || other.some((entry) => !expectedOther.has(entry.path))) {
    fail("TREE_PROFILE_CHANGED");
  }
  const binding = (entry) => ({ remotePath: entry.path, sizeBytes: entry.sizeBytes,
    gitOid: entry.gitOid, lfsSha256: entry.lfs?.sha256 ?? null,
    lfsPointerSize: entry.lfs?.pointerSize ?? null, xetHash: entry.xetHash });
  const inventory = { schema: FARM_INVENTORY_SCHEMA, datasetId: FARM_DATASET_ID,
    pinnedRevision: FARM_REVISION, counts,
    selectedNoVideoObjects: selected.map(binding), excludedVideoObjects: videos.map(binding),
    crossPopulationTotal: null, additionProhibited: true };
  inventory.inventoryHash = farmDigest(inventory, `${FARM_INVENTORY_SCHEMA}/inventory`);
  return { inventory, selected };
}

function mkdirPrivate(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  mkdirPrivate(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function verifyObjectBytes(entry, bytes) {
  if (bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_MISMATCH", entry.path);
  const fileSha256 = farmSha256(bytes);
  if (entry.lfs !== null) {
    if (fileSha256 !== entry.lfs.sha256) fail("OBJECT_LFS_HASH_MISMATCH", entry.path);
  } else if (gitBlobOid(bytes) !== entry.gitOid) fail("OBJECT_GIT_OID_MISMATCH", entry.path);
  return fileSha256;
}

async function mapConcurrent(values, concurrency, operation) {
  const result = new Array(values.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      result[index] = await operation(values[index], index);
    }
  });
  await Promise.all(workers);
  return result;
}

function supportDescriptor(relativePath, source, fetched) {
  return { path: relativePath, source, httpStatus: fetched.status,
    sizeBytes: fetched.bytes.length, sha256: farmSha256(fetched.bytes) };
}

function githubProjection(value) {
  if (!exactObject(value) || value.message !== "Not Found"
    || !String(value.documentation_url ?? "").startsWith("https://docs.github.com/")) {
    fail("GITHUB_404_BODY_INVALID");
  }
  return { repositoryUrl: GITHUB_REPOSITORY_URL, apiUrl: GITHUB_API_URL,
    httpStatus: 404, availableAtFreeze: false };
}

async function fetchBracket(fetchImpl, label) {
  const record = await jsonFetch(RECORD_URL, MAX_API_BYTES, fetchImpl);
  const commits = await jsonFetch(COMMITS_URL, MAX_API_BYTES, fetchImpl);
  const tree = await jsonFetch(TREE_URL, MAX_API_BYTES, fetchImpl);
  if (tree.headers.get("link") !== null) fail("TREE_UNEXPECTED_PAGINATION");
  const recordValue = recordProjection(record.value);
  const commitsValue = commitsProjection(commits.value);
  const treeEntries = normalizeTree(tree.value);
  const summary = treeSummary(treeEntries);
  if (!same(summary, { entries: EXPECTED.treeEntries, files: EXPECTED.treeFiles,
    directories: EXPECTED.treeDirectories, bytes: EXPECTED.treeBytes,
    snapshotHash: summary.snapshotHash })) fail("TREE_SUMMARY_INVALID");
  if (!same(recordValue.siblingPaths,
    treeEntries.filter((entry) => entry.type === "file").map((entry) => entry.path))) {
    fail("RECORD_TREE_SIBLINGS_MISMATCH");
  }
  const support = [
    { relativePath: `source-support/hf-record-${label}.json`, source: RECORD_URL, fetched: record },
    { relativePath: `source-support/hf-commits-${label}.json`, source: COMMITS_URL,
      fetched: commits },
    { relativePath: `source-support/hf-tree-${label}.json`, source: TREE_URL, fetched: tree },
  ];
  return { recordValue, commitsValue, treeEntries, summary, support };
}

function manifestCoreFrom(source) {
  return { schema: FARM_SOURCE_SCHEMA, frozenAt: FARM_FROZEN_AT,
    datasetId: FARM_DATASET_ID, pinnedRevision: FARM_REVISION,
    repositoryBefore: source.repositoryBefore, repositoryAfter: source.repositoryAfter,
    commitHistoryBefore: source.commitHistoryBefore,
    commitHistoryAfter: source.commitHistoryAfter,
    treeBefore: source.treeBefore, treeAfter: source.treeAfter,
    releaseLineage: source.releaseLineage, codeRepository: source.codeRepository,
    selection: source.selection, rights: source.rights, privacy: source.privacy,
    inventory: source.inventory, sourceSupportObjects: source.sourceSupportObjects,
    selectedObjects: source.selectedObjects, sourceRoot: source.sourceRoot };
}

export async function acquirePinnedFarmUf850Source(targetDirectory,
  { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  const target = path.resolve(targetDirectory);
  if (existsSync(target)) fail("SOURCE_TARGET_EXISTS", target);
  mkdirPrivate(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirPrivate(staging);

  const before = await fetchBracket(fetchImpl, "before");
  const { inventory, selected } = inventoryFromTree(before.treeEntries);
  const github = await jsonFetch(GITHUB_API_URL, MAX_API_BYTES, fetchImpl, 404);
  const codeRepository = githubProjection(github.value);

  const supportRecords = [...before.support,
    { relativePath: "source-support/github-repository-404.json",
      source: GITHUB_API_URL, fetched: github }];
  const downloaded = await mapConcurrent(selected, DOWNLOAD_CONCURRENCY, async (entry) => {
    const bytes = await objectFetch(entry.path, entry.sizeBytes, fetchImpl);
    const fileSha256 = verifyObjectBytes(entry, bytes);
    writePrivate(path.join(staging, entry.path), bytes);
    return { remotePath: entry.path, localPath: entry.path, sizeBytes: entry.sizeBytes,
      gitOid: entry.gitOid, lfsSha256: entry.lfs?.sha256 ?? null,
      lfsPointerSize: entry.lfs?.pointerSize ?? null, xetHash: entry.xetHash, fileSha256 };
  });

  const after = await fetchBracket(fetchImpl, "after");
  if (!same(before.recordValue, after.recordValue)
    || !same(before.commitsValue, after.commitsValue)
    || !same(before.treeEntries, after.treeEntries)) fail("SOURCE_BRACKET_CHANGED");
  supportRecords.push(...after.support);
  for (const item of supportRecords) writePrivate(path.join(staging, item.relativePath),
    item.fetched.bytes);
  const inventoryBytes = canonicalBytes(inventory);
  writePrivate(path.join(staging, "source-inventory.json"), inventoryBytes);
  const sourceSupportObjects = supportRecords.map((item) =>
    supportDescriptor(item.relativePath, item.source, item.fetched));
  const selectedObjects = downloaded.sort((left, right) =>
    left.remotePath.localeCompare(right.remotePath));
  const sourceRoot = farmDigest({ sourceSupportObjects, selectedObjects,
    inventoryFileSha256: farmSha256(inventoryBytes), inventoryHash: inventory.inventoryHash },
  `${FARM_SOURCE_SCHEMA}/source-root`);
  const manifest = {
    schema: FARM_SOURCE_SCHEMA,
    frozenAt: FARM_FROZEN_AT,
    datasetId: FARM_DATASET_ID,
    pinnedRevision: FARM_REVISION,
    repositoryBefore: before.recordValue,
    repositoryAfter: after.recordValue,
    commitHistoryBefore: before.commitsValue,
    commitHistoryAfter: after.commitsValue,
    treeBefore: before.summary,
    treeAfter: after.summary,
    releaseLineage: {
      initial66EpisodeRevision: FARM_INITIAL_66_REVISION,
      corrected66EpisodeRevision: FARM_REVISION,
      currentHeadAtFreeze: FARM_CURRENT_HEAD_AT_FREEZE,
      currentHeadAtFreezeDeclaredEpisodes: 200,
      currentHeadAtFreezeDeclaredTasks: 2,
      pinIsHistoricalNotCurrent: true,
      reason: "final 66-episode revision before the later 200-episode/2-task replacement",
    },
    codeRepository,
    selection: {
      rule: "complete pinned 66-episode state/action and metadata closure; exclude all MP4",
      completePinnedTreeEnumerated: true,
      completeSelectedNoVideoClosureDownloaded: true,
      fullParquetContentDownloaded: true,
      fullVideoContentDownloaded: false,
      selectedNoVideoFiles: EXPECTED.selectedFiles,
      selectedNoVideoBytes: EXPECTED.selectedBytes,
      excludedVideoFiles: EXPECTED.videoFiles,
      excludedVideoBytes: EXPECTED.videoBytes,
    },
    rights: { publisherLicenseClaim: "Apache-2.0", licenseFilePresent: false,
      useSpecificLegalClearanceEstablished: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: { videosExcluded: true, noPiiGuaranteed: false,
      biometricOrFaceReviewPerformed: false },
    inventory: { path: "source-inventory.json", sizeBytes: inventoryBytes.length,
      fileSha256: farmSha256(inventoryBytes), inventoryHash: inventory.inventoryHash },
    sourceSupportObjects,
    selectedObjects,
    sourceRoot,
  };
  manifest.manifestHash = farmDigest(manifestCoreFrom(manifest),
    `${FARM_SOURCE_SCHEMA}/manifest`);
  writePrivate(path.join(staging, "source-manifest.json"), canonicalBytes(manifest));
  renameSync(staging, target);
  chmodSync(target, 0o700);
  const checked = verifyFarmUf850SourceDirectory(target);
  if (!checked.ok) fail("SOURCE_PUBLICATION_INVALID", checked.error);
  return checked;
}

function listFiles(root) {
  const files = [];
  const visit = (directory, prefix = "") => {
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700) {
      fail("DIRECTORY_UNSAFE", directory);
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      const target = path.join(directory, entry.name);
      const child = lstatSync(target);
      if (child.isSymbolicLink()) fail("SYMLINK_FORBIDDEN", relative);
      if (child.isDirectory()) visit(target, relative);
      else {
        if (!child.isFile() || (child.mode & 0o777) !== 0o600) fail("FILE_UNSAFE", relative);
        files.push(relative);
      }
    }
  };
  visit(root);
  return sorted(files);
}

function readRegularPrivate(file, expectedBytes = null) {
  const descriptor = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600
      || expectedBytes !== null && stat.size !== expectedBytes) fail("FILE_INVALID", file);
    return readFileSync(descriptor);
  } finally { closeSync(descriptor); }
}

function supportMapFromManifest(manifest) {
  if (!Array.isArray(manifest.sourceSupportObjects)
    || manifest.sourceSupportObjects.length !== 7) fail("SUPPORT_MANIFEST_INVALID");
  return new Map(manifest.sourceSupportObjects.map((item) => [item.path, item]));
}

export function verifyFarmUf850SourceDirectory(sourceDirectory) {
  try {
    const root = path.resolve(sourceDirectory);
    const manifestBytes = readRegularPrivate(path.join(root, "source-manifest.json"));
    const manifest = parseJson(manifestBytes, "MANIFEST_JSON_INVALID");
    if (!exactObject(manifest) || manifest.schema !== FARM_SOURCE_SCHEMA
      || manifest.datasetId !== FARM_DATASET_ID || manifest.pinnedRevision !== FARM_REVISION
      || manifest.frozenAt !== FARM_FROZEN_AT || !HASH.test(manifest.manifestHash ?? "")
      || !HASH.test(manifest.sourceRoot ?? "")) fail("MANIFEST_INVALID");
    const expectedManifestHash = farmDigest(manifestCoreFrom(manifest),
      `${FARM_SOURCE_SCHEMA}/manifest`);
    if (manifest.manifestHash !== expectedManifestHash) fail("MANIFEST_HASH_INVALID");

    const support = supportMapFromManifest(manifest);
    const supportBytes = new Map();
    for (const [relative, item] of support) {
      safeRelative(relative);
      const bytes = readRegularPrivate(path.join(root, relative), item.sizeBytes);
      if (farmSha256(bytes) !== item.sha256) fail("SUPPORT_HASH_INVALID", relative);
      supportBytes.set(relative, bytes);
    }
    const recordBefore = recordProjection(parseJson(
      supportBytes.get("source-support/hf-record-before.json"), "RECORD_BEFORE_INVALID"));
    const recordAfter = recordProjection(parseJson(
      supportBytes.get("source-support/hf-record-after.json"), "RECORD_AFTER_INVALID"));
    const commitsBefore = commitsProjection(parseJson(
      supportBytes.get("source-support/hf-commits-before.json"), "COMMITS_BEFORE_INVALID"));
    const commitsAfter = commitsProjection(parseJson(
      supportBytes.get("source-support/hf-commits-after.json"), "COMMITS_AFTER_INVALID"));
    const treeBeforeEntries = normalizeTree(parseJson(
      supportBytes.get("source-support/hf-tree-before.json"), "TREE_BEFORE_INVALID"));
    const treeAfterEntries = normalizeTree(parseJson(
      supportBytes.get("source-support/hf-tree-after.json"), "TREE_AFTER_INVALID"));
    const github = githubProjection(parseJson(
      supportBytes.get("source-support/github-repository-404.json"), "GITHUB_INVALID"));
    if (!same(recordBefore, recordAfter) || !same(commitsBefore, commitsAfter)
      || !same(treeBeforeEntries, treeAfterEntries)) fail("SAVED_BRACKET_CHANGED");
    if (!same(manifest.repositoryBefore, recordBefore)
      || !same(manifest.repositoryAfter, recordAfter)
      || !same(manifest.commitHistoryBefore, commitsBefore)
      || !same(manifest.commitHistoryAfter, commitsAfter)
      || !same(manifest.treeBefore, treeSummary(treeBeforeEntries))
      || !same(manifest.treeAfter, treeSummary(treeAfterEntries))
      || !same(manifest.codeRepository, github)) fail("MANIFEST_SUPPORT_MISMATCH");

    const { inventory: expectedInventory, selected } = inventoryFromTree(treeBeforeEntries);
    const inventoryBytes = readRegularPrivate(path.join(root, "source-inventory.json"));
    const inventory = parseJson(inventoryBytes, "INVENTORY_JSON_INVALID");
    if (!same(inventory, expectedInventory)
      || inventoryBytes.length !== manifest.inventory.sizeBytes
      || farmSha256(inventoryBytes) !== manifest.inventory.fileSha256
      || inventory.inventoryHash !== manifest.inventory.inventoryHash) {
      fail("INVENTORY_INVALID");
    }
    if (!Array.isArray(manifest.selectedObjects)
      || manifest.selectedObjects.length !== EXPECTED.selectedFiles) {
      fail("SELECTED_OBJECTS_INVALID");
    }
    const expectedSelected = [];
    for (let index = 0; index < selected.length; index += 1) {
      const entry = selected[index];
      const declared = manifest.selectedObjects[index];
      if (declared.remotePath !== entry.path || declared.localPath !== entry.path
        || declared.sizeBytes !== entry.sizeBytes || declared.gitOid !== entry.gitOid
        || declared.lfsSha256 !== (entry.lfs?.sha256 ?? null)
        || declared.lfsPointerSize !== (entry.lfs?.pointerSize ?? null)
        || declared.xetHash !== entry.xetHash || !HASH.test(declared.fileSha256 ?? "")) {
        fail("SELECTED_BINDING_INVALID", entry.path);
      }
      const bytes = readRegularPrivate(path.join(root, entry.path), entry.sizeBytes);
      const fileSha256 = verifyObjectBytes(entry, bytes);
      if (declared.fileSha256 !== fileSha256) fail("SELECTED_FILE_HASH_INVALID", entry.path);
      expectedSelected.push({ ...declared });
    }
    const expectedFiles = sorted(["source-manifest.json", "source-inventory.json",
      ...manifest.sourceSupportObjects.map((item) => item.path),
      ...manifest.selectedObjects.map((item) => item.localPath)]);
    if (!same(listFiles(root), expectedFiles)) fail("SOURCE_FILE_SET_INVALID");
    const sourceRoot = farmDigest({ sourceSupportObjects: manifest.sourceSupportObjects,
      selectedObjects: expectedSelected, inventoryFileSha256: farmSha256(inventoryBytes),
      inventoryHash: inventory.inventoryHash }, `${FARM_SOURCE_SCHEMA}/source-root`);
    if (manifest.sourceRoot !== sourceRoot) fail("SOURCE_ROOT_INVALID");
    const readme = readRegularPrivate(path.join(root, "README.md")).toString("utf8");
    if (!readme.includes(`(${GITHUB_REPOSITORY_URL})`)
      || !readme.includes("the 41 demos collected before the camera FPS fix are not in this release")
      || !readme.includes("66 episodes") || !readme.includes("17 distinct")) {
      fail("README_DECLARATIONS_MISSING");
    }
    return { ok: true, verificationLevel: "FULL_PINNED_NO_VIDEO_SOURCE_REPLAY",
      sourceDirectory: root, manifest, inventory, treeEntries: treeBeforeEntries,
      sourceRoot, manifestFileSha256: farmSha256(manifestBytes) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import glob
import hashlib
import json
import math
import os
import struct
import sys
import pyarrow as pa
import pyarrow.parquet as pq

root = sys.argv[1]

def load_json(name):
    with open(os.path.join(root, name), "rb") as handle:
        return json.loads(handle.read().decode("utf-8"))

def load_jsonl(name):
    with open(os.path.join(root, name), "rb") as handle:
        lines = handle.read().decode("utf-8").splitlines()
    return [json.loads(line) for line in lines]

def f32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]

info = load_json("meta/info.json")
stats = load_json("meta/stats.json")
episodes = load_jsonl("meta/episodes.jsonl")
tasks = load_jsonl("meta/tasks.jsonl")
files = sorted(glob.glob(os.path.join(root, "data", "chunk-000", "episode_*.parquet")))

expected_columns = ["observation.state", "action", "timestamp", "frame_index",
                    "episode_index", "task_index", "index"]
schema_profiles = {}
task_counts = {index: 0 for index in range(len(tasks))}
state_min = [float("inf")] * 7
state_max = [float("-inf")] * 7
action_min = [float("inf")] * 7
action_max = [float("-inf")] * 7
total_rows = 0
transition_bindings = 0
final_repeat_bindings = 0
timestamp_exact = 0
null_values = 0
nonfinite_values = 0
episode_profiles = []

if len(files) != 66 or len(episodes) != 66 or len(tasks) != 17:
    raise RuntimeError("FARM_PYARROW_METADATA_COUNT_INVALID")
if [item["task_index"] for item in tasks] != list(range(17)):
    raise RuntimeError("FARM_PYARROW_TASK_INDEX_INVALID")
if len({item["task"] for item in tasks}) != 17:
    raise RuntimeError("FARM_PYARROW_TASK_DUPLICATE")
if [item["episode_index"] for item in episodes] != list(range(66)):
    raise RuntimeError("FARM_PYARROW_EPISODE_INDEX_INVALID")

for episode_index, filename in enumerate(files):
    table = pq.read_table(filename)
    if table.column_names != expected_columns:
        raise RuntimeError("FARM_PYARROW_COLUMNS_INVALID")
    schema_text = str(table.schema.remove_metadata())
    schema_profiles[schema_text] = schema_profiles.get(schema_text, 0) + 1
    null_values += sum(table[name].null_count for name in expected_columns)
    rows = table.to_pylist()
    meta = episodes[episode_index]
    if table.num_rows != meta["length"] or len(meta["tasks"]) != 1:
        raise RuntimeError("FARM_PYARROW_EPISODE_LENGTH_INVALID")
    task_text = meta["tasks"][0]
    matching = [item["task_index"] for item in tasks if item["task"] == task_text]
    if len(matching) != 1:
        raise RuntimeError("FARM_PYARROW_TASK_TEXT_INVALID")
    task_index = matching[0]
    task_counts[task_index] += 1
    for frame_index, row in enumerate(rows):
        if row["episode_index"] != episode_index or row["task_index"] != task_index:
            raise RuntimeError("FARM_PYARROW_ROW_PROVENANCE_INVALID")
        if row["frame_index"] != frame_index or row["index"] != total_rows + frame_index:
            raise RuntimeError("FARM_PYARROW_INDEX_INVALID")
        if row["timestamp"] != f32(frame_index / 30.0):
            raise RuntimeError("FARM_PYARROW_TIMESTAMP_INVALID")
        timestamp_exact += 1
        state = row["observation.state"]
        action = row["action"]
        if len(state) != 7 or len(action) != 7:
            raise RuntimeError("FARM_PYARROW_VECTOR_WIDTH_INVALID")
        for joint in range(7):
            if not math.isfinite(state[joint]) or not math.isfinite(action[joint]):
                nonfinite_values += 1
            state_min[joint] = min(state_min[joint], state[joint])
            state_max[joint] = max(state_max[joint], state[joint])
            action_min[joint] = min(action_min[joint], action[joint])
            action_max[joint] = max(action_max[joint], action[joint])
        if frame_index + 1 < len(rows):
            if action != rows[frame_index + 1]["observation.state"]:
                raise RuntimeError("FARM_PYARROW_ACTION_SHIFT_INVALID")
            transition_bindings += 1
        else:
            if action != state:
                raise RuntimeError("FARM_PYARROW_FINAL_REPEAT_INVALID")
            final_repeat_bindings += 1
    episode_profiles.append({"episodeIndex": episode_index, "taskIndex": task_index,
                             "task": task_text, "frames": table.num_rows})
    total_rows += table.num_rows

task_profiles = [{"taskIndex": item["task_index"], "task": item["task"],
                  "episodes": task_counts[item["task_index"]]} for item in tasks]
recovery_indexes = [2, 7, 9, 10, 11, 13]
recovery_profiles = [item for item in task_profiles if item["taskIndex"] in recovery_indexes]
recovery_episode_indexes = [item["episodeIndex"] for item in episode_profiles
                            if item["taskIndex"] in recovery_indexes]

result = {
    "parser": {"engine": "python-pyarrow", "pythonVersion": sys.version.split()[0],
               "pyarrowVersion": pa.__version__},
    "info": info,
    "statsSha256": "sha256:" + hashlib.sha256(
        open(os.path.join(root, "meta/stats.json"), "rb").read()).hexdigest(),
    "parquetFiles": len(files),
    "frames": total_rows,
    "episodes": len(episodes),
    "tasks": len(tasks),
    "columns": expected_columns,
    "schemaProfiles": [{"schema": key, "files": value}
                       for key, value in sorted(schema_profiles.items())],
    "physicalElementTypeObservationState": str(pq.read_table(files[0]).schema.field(
        "observation.state").type.value_type),
    "physicalElementTypeAction": str(pq.read_table(files[0]).schema.field(
        "action").type.value_type),
    "nullValues": null_values,
    "nonfiniteValues": nonfinite_values,
    "timestampExactRows": timestamp_exact,
    "actionToNextStateExactTransitions": transition_bindings,
    "finalActionRepeatsStateEpisodes": final_repeat_bindings,
    "stateMin": state_min,
    "stateMax": state_max,
    "actionMin": action_min,
    "actionMax": action_max,
    "taskProfiles": task_profiles,
    "episodeProfiles": episode_profiles,
    "publisherRecoveryTaskIndexes": recovery_indexes,
    "publisherRecoveryTaskProfiles": recovery_profiles,
    "publisherRecoveryEpisodeIndexes": recovery_episode_indexes,
}
print(json.dumps(result, sort_keys=True, separators=(",", ":"), allow_nan=False))
`;

function runReplay(sourceDirectory) {
  const python = process.env.OUTSIDER_PYTHON ?? path.resolve(".venv/bin/python");
  const result = spawnSync(python, ["-c", PYARROW_REPLAY, sourceDirectory], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 180_000,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONNOUSERSITE: "1" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("PYARROW_REPLAY_FAILED", String(result.stderr || result.error?.message));
  }
  const replay = parseJson(Buffer.from(result.stdout, "utf8"), "PYARROW_OUTPUT_INVALID");
  if (!exactObject(replay) || replay.parquetFiles !== EXPECTED.parquetFiles
    || replay.frames !== EXPECTED.frames || replay.episodes !== EXPECTED.episodes
    || replay.tasks !== EXPECTED.tasks || replay.nullValues !== 0 || replay.nonfiniteValues !== 0
    || replay.timestampExactRows !== EXPECTED.frames
    || replay.actionToNextStateExactTransitions !== EXPECTED.frames - EXPECTED.episodes
    || replay.finalActionRepeatsStateEpisodes !== EXPECTED.episodes
    || replay.physicalElementTypeObservationState !== "double"
    || replay.physicalElementTypeAction !== "double"
    || !same(replay.publisherRecoveryTaskIndexes, RECOVERY_TASK_INDEXES)
    || replay.publisherRecoveryEpisodeIndexes.length
      !== EXPECTED.publisherRecoveryMorphologyEpisodes) fail("PYARROW_PROFILE_INVALID");
  return replay;
}

function reportCore(report) {
  const copy = structuredClone(report);
  delete copy.artifactHash;
  return copy;
}

export function buildFarmUf850ReportFromSource(sourceDirectory) {
  const checked = verifyFarmUf850SourceDirectory(sourceDirectory);
  if (!checked.ok) fail("SOURCE_INVALID", checked.error);
  const replay = runReplay(checked.sourceDirectory);
  const recoveryTaskProfiles = replay.publisherRecoveryTaskProfiles;
  const report = {
    schema: FARM_REPORT_SCHEMA,
    generatedAt: FARM_FROZEN_AT,
    source: { datasetId: FARM_DATASET_ID, pinnedRevision: FARM_REVISION,
      sourceRoot: checked.sourceRoot, sourceManifestHash: checked.manifest.manifestHash,
      sourceManifestFileSha256: checked.manifestFileSha256,
      completePinnedTreeReplayed: true, completeNoVideoClosureReplayed: true,
      fullVideoContentReplayed: false },
    lineage: checked.manifest.releaseLineage,
    denominators: {
      completePinnedTree: { units: EXPECTED.treeEntries, unit: "HF_TREE_ENTRY",
        files: EXPECTED.treeFiles, directories: EXPECTED.treeDirectories,
        bytes: EXPECTED.treeBytes },
      selectedNoVideoClosure: { units: EXPECTED.selectedFiles, unit: "SOURCE_FILE",
        bytes: EXPECTED.selectedBytes, parquetFiles: EXPECTED.parquetFiles,
        metadataAndCardFiles: 6 },
      keptRealRobotEpisodes: { units: EXPECTED.episodes, unit: "KEPT_REAL_ROBOT_EPISODE",
        frames: EXPECTED.frames, taskDescriptions: EXPECTED.tasks },
      publisherTaskTextRecoveryMorphology: {
        units: EXPECTED.publisherRecoveryMorphologyEpisodes,
        unit: "PUBLISHER_TASK_TEXT_WITHIN_EPISODE_RECOVERY_MORPHOLOGY",
        taskDescriptions: recoveryTaskProfiles.length },
      publisherExcludedEarlyDemosClaim: {
        units: EXPECTED.excludedEarlyDemosClaim,
        unit: "PUBLISHER_REPORTED_EXCLUDED_DEMO",
        contentPresent: false, metadataRowsPresent: false, countedAsEpisodes: false,
        countedAsAttempts: false },
      excludedVideos: { units: EXPECTED.videoFiles, unit: "MP4_OBJECT",
        bytes: EXPECTED.videoBytes, contentReplayed: false },
      completeAttemptCensus: { units: 0, established: false },
      crossPopulationTotal: null,
      additionProhibited: true,
    },
    observations: {
      robot: "UFactory UF850, 6-DoF arm plus parallel gripper",
      publisherCollectionClaim: "Meta Quest teleoperation; UF850 encoder reads at 250 Hz snapshotted at 30 Hz",
      metadata: { codebaseVersion: replay.info.codebase_version,
        robotType: replay.info.robot_type, fps: replay.info.fps,
        totalEpisodes: replay.info.total_episodes, totalFrames: replay.info.total_frames,
        totalTasks: replay.info.total_tasks, totalVideos: replay.info.total_videos,
        dataPath: replay.info.data_path, videoPath: replay.info.video_path },
      parquetReplay: { parser: replay.parser, files: replay.parquetFiles,
        frames: replay.frames, columns: replay.columns, schemaProfiles: replay.schemaProfiles,
        declaredStateAndActionDtype: "float32",
        physicalParquetStateElementType: replay.physicalElementTypeObservationState,
        physicalParquetActionElementType: replay.physicalElementTypeAction,
        declaredVsPhysicalElementTypeMismatchRecorded: true,
        nullValues: replay.nullValues, nonfiniteValues: replay.nonfiniteValues,
        timestampExactRows: replay.timestampExactRows,
        actionToNextStateExactTransitions: replay.actionToNextStateExactTransitions,
        finalActionRepeatsStateEpisodes: replay.finalActionRepeatsStateEpisodes,
        stateMin: replay.stateMin, stateMax: replay.stateMax,
        actionMin: replay.actionMin, actionMax: replay.actionMax,
        statsFileSha256: replay.statsSha256 },
      taskProfiles: replay.taskProfiles,
      episodeProfiles: replay.episodeProfiles,
      publisherRecoveryMorphology: {
        taskIndexes: replay.publisherRecoveryTaskIndexes,
        taskProfiles: recoveryTaskProfiles,
        episodeIndexes: replay.publisherRecoveryEpisodeIndexes,
        evidenceType: "publisher imperative task string joined to a complete state/action episode",
      },
    },
    selectionBias: {
      publisherClaimedExcludedBeforeCameraFpsFix: EXPECTED.excludedEarlyDemosClaim,
      excludedDemoBytesPresent: false,
      excludedDemoIdentifiersPresent: false,
      excludedDemoDispositionRowsPresent: false,
      exclusionReasonIndependentlyVerified: false,
      released66RepresentativeOfEarlierCollectionEstablished: false,
      completeAttemptCensusEstablished: false,
      note: "41 is a publisher exclusion claim, not an additive episode or attempt population",
    },
    segments: {
      opportunityCensus: { units: 0, prospective: false },
      delegationAuthorization: { units: 0, established: false },
      action: { episodeUnits: EXPECTED.episodes, frameUnits: EXPECTED.frames,
        stateActionTrajectoryPresent: true },
      effect: { robotStateTrajectoryEpisodeUnits: EXPECTED.episodes,
        independentObjectStateUnits: 0, objectDropOrFallUnits: 0 },
      outcome: { publisherTaskTextMorphologyUnits:
        EXPECTED.publisherRecoveryMorphologyEpisodes, independentUnits: 0,
        verifiedTaskSuccessUnits: 0 },
      recovery: { publisherWithinEpisodeMorphologyUnits:
        EXPECTED.publisherRecoveryMorphologyEpisodes, physicallyObservedUnits: 0,
        independentlyVerifiedEffectUnits: 0 },
      longitudinal: { units: 0 },
      attributionAdditionProhibited: true,
    },
    truthBoundary: {
      completeReleased66EpisodeStateActionClosureEstablished: true,
      withinEpisodePublisherRecoveryMorphologyEstablished: true,
      physicalObjectDropOrFallEstablished: false,
      physicalRecoveryExecutionEstablished: false,
      successfulTaskOutcomeEstablished: false,
      independentWitnessEstablished: false,
      completeAttemptCensusEstablished: false,
      prospectiveOpportunityCensusEstablished: false,
      delegationOrAuthorityEstablished: false,
      excluded41PromotedToEpisodesOrAttempts: false,
    },
    codeLineageBoundary: {
      datasetCardLinkedRepository: GITHUB_REPOSITORY_URL,
      repositoryAvailableAtFreeze: false,
      collectionImplementationIndependentlyReplayed: false,
      datasetBytesRemainFullyReplayedWithinSelectedNoVideoScope: true,
    },
    rights: { publisherLicenseClaim: "Apache-2.0", licenseFilePresent: false,
      useSpecificLegalClearanceEstablished: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: { noPiiGuaranteed: false, videosExcluded: true,
      videoPrivacyReviewPerformed: false },
    useBoundary: { status: "QUARANTINE_EVAL_ONLY",
      offlineEvaluationFrameRows: EXPECTED.frames,
      offlineModelFittingRows: 0, authorizedTrainingRows: 0,
      governedTrainingRows: 0, trainingPerformed: false },
    network: { rawNetworkAdmissionRows: 0, networkAdmissionRows: 0 },
    economics: { CEU: 0, pricingUnits: 0 },
    authority: { executionAuthorityUnits: 0, executionAuthorityEstablished: false },
    rankedGaps: [
      "video/object-state replay for physical failure and recovery verification",
      "independent outcome witness and explicit acceptance criteria",
      "prospective opportunity and complete attempt census",
      "identifiable dispositions for the 41 publisher-excluded early demos",
      "available pinned collection code and use-specific rights/privacy clearance",
      "delegation and execution authority records",
    ],
    verification: { level: "FULL_PINNED_NO_VIDEO_SOURCE_REDERIVED",
      pyarrowHelperSha256: farmSha256(Buffer.from(PYARROW_REPLAY, "utf8")) },
  };
  report.artifactHash = farmDigest(reportCore(report), `${FARM_REPORT_SCHEMA}/artifact`);
  const checkedReport = verifyFarmUf850Report(report);
  if (!checkedReport.ok) fail("BUILT_REPORT_INVALID", checkedReport.error);
  return report;
}

export function verifyFarmUf850Report(report) {
  try {
    if (!exactObject(report) || report.schema !== FARM_REPORT_SCHEMA
      || report.generatedAt !== FARM_FROZEN_AT || !HASH.test(report.artifactHash ?? "")
      || report.artifactHash !== farmDigest(reportCore(report),
        `${FARM_REPORT_SCHEMA}/artifact`)) fail("REPORT_HASH_INVALID");
    if (report.source?.datasetId !== FARM_DATASET_ID
      || report.source?.pinnedRevision !== FARM_REVISION
      || !HASH.test(report.source?.sourceRoot ?? "")
      || !HASH.test(report.source?.sourceManifestHash ?? "")
      || !HASH.test(report.source?.sourceManifestFileSha256 ?? "")
      || report.source?.completePinnedTreeReplayed !== true
      || report.source?.completeNoVideoClosureReplayed !== true
      || report.source?.fullVideoContentReplayed !== false) fail("REPORT_SOURCE_INVALID");
    const d = report.denominators;
    if (!same(d?.completePinnedTree, { units: EXPECTED.treeEntries, unit: "HF_TREE_ENTRY",
      files: EXPECTED.treeFiles, directories: EXPECTED.treeDirectories,
      bytes: EXPECTED.treeBytes })
      || !same(d?.selectedNoVideoClosure, { units: EXPECTED.selectedFiles,
        unit: "SOURCE_FILE", bytes: EXPECTED.selectedBytes,
        parquetFiles: EXPECTED.parquetFiles, metadataAndCardFiles: 6 })
      || d?.keptRealRobotEpisodes?.units !== EXPECTED.episodes
      || d?.keptRealRobotEpisodes?.frames !== EXPECTED.frames
      || d?.keptRealRobotEpisodes?.unit !== "KEPT_REAL_ROBOT_EPISODE"
      || d?.publisherTaskTextRecoveryMorphology?.units
        !== EXPECTED.publisherRecoveryMorphologyEpisodes
      || d?.publisherExcludedEarlyDemosClaim?.units !== EXPECTED.excludedEarlyDemosClaim
      || d?.publisherExcludedEarlyDemosClaim?.countedAsEpisodes !== false
      || d?.publisherExcludedEarlyDemosClaim?.countedAsAttempts !== false
      || d?.completeAttemptCensus?.units !== 0
      || d?.completeAttemptCensus?.established !== false
      || d?.crossPopulationTotal !== null || d?.additionProhibited !== true) {
      fail("REPORT_DENOMINATOR_INVALID");
    }
    if (report.lineage?.corrected66EpisodeRevision !== FARM_REVISION
      || report.lineage?.currentHeadAtFreeze !== FARM_CURRENT_HEAD_AT_FREEZE
      || report.lineage?.pinIsHistoricalNotCurrent !== true
      || report.observations?.metadata?.totalEpisodes !== EXPECTED.episodes
      || report.observations?.metadata?.totalFrames !== EXPECTED.frames
      || report.observations?.metadata?.totalTasks !== EXPECTED.tasks
      || report.observations?.parquetReplay?.files !== EXPECTED.parquetFiles
      || report.observations?.parquetReplay?.frames !== EXPECTED.frames
      || report.observations?.parquetReplay?.physicalParquetStateElementType !== "double"
      || report.observations?.parquetReplay?.physicalParquetActionElementType !== "double"
      || report.observations?.parquetReplay?.declaredVsPhysicalElementTypeMismatchRecorded
        !== true
      || report.observations?.parquetReplay?.nullValues !== 0
      || report.observations?.parquetReplay?.nonfiniteValues !== 0
      || report.observations?.parquetReplay?.timestampExactRows !== EXPECTED.frames
      || report.observations?.parquetReplay?.actionToNextStateExactTransitions
        !== EXPECTED.frames - EXPECTED.episodes
      || report.observations?.parquetReplay?.finalActionRepeatsStateEpisodes
        !== EXPECTED.episodes
      || !same(report.observations?.publisherRecoveryMorphology?.taskIndexes,
        RECOVERY_TASK_INDEXES)
      || report.observations?.publisherRecoveryMorphology?.episodeIndexes?.length
        !== EXPECTED.publisherRecoveryMorphologyEpisodes) fail("REPORT_REPLAY_INVALID");
    if (report.selectionBias?.publisherClaimedExcludedBeforeCameraFpsFix
        !== EXPECTED.excludedEarlyDemosClaim
      || report.selectionBias?.excludedDemoBytesPresent !== false
      || report.selectionBias?.excludedDemoIdentifiersPresent !== false
      || report.selectionBias?.excludedDemoDispositionRowsPresent !== false
      || report.selectionBias?.completeAttemptCensusEstablished !== false
      || report.segments?.opportunityCensus?.units !== 0
      || report.segments?.delegationAuthorization?.units !== 0
      || report.segments?.action?.episodeUnits !== EXPECTED.episodes
      || report.segments?.action?.frameUnits !== EXPECTED.frames
      || report.segments?.effect?.independentObjectStateUnits !== 0
      || report.segments?.outcome?.independentUnits !== 0
      || report.segments?.outcome?.verifiedTaskSuccessUnits !== 0
      || report.segments?.recovery?.publisherWithinEpisodeMorphologyUnits
        !== EXPECTED.publisherRecoveryMorphologyEpisodes
      || report.segments?.recovery?.physicallyObservedUnits !== 0
      || report.segments?.recovery?.independentlyVerifiedEffectUnits !== 0
      || report.segments?.longitudinal?.units !== 0
      || report.segments?.attributionAdditionProhibited !== true) fail("REPORT_SEGMENT_INVALID");
    const truth = report.truthBoundary;
    if (truth?.completeReleased66EpisodeStateActionClosureEstablished !== true
      || truth?.withinEpisodePublisherRecoveryMorphologyEstablished !== true
      || truth?.physicalObjectDropOrFallEstablished !== false
      || truth?.physicalRecoveryExecutionEstablished !== false
      || truth?.successfulTaskOutcomeEstablished !== false
      || truth?.independentWitnessEstablished !== false
      || truth?.completeAttemptCensusEstablished !== false
      || truth?.prospectiveOpportunityCensusEstablished !== false
      || truth?.delegationOrAuthorityEstablished !== false
      || truth?.excluded41PromotedToEpisodesOrAttempts !== false) fail("REPORT_TRUTH_INVALID");
    if (report.codeLineageBoundary?.repositoryAvailableAtFreeze !== false
      || report.codeLineageBoundary?.collectionImplementationIndependentlyReplayed !== false
      || report.rights?.publisherLicenseClaim !== "Apache-2.0"
      || report.rights?.licenseFilePresent !== false
      || report.rights?.useSpecificLegalClearanceEstablished !== false
      || report.rights?.productionTrainingAuthorizedByOutsider !== false
      || report.privacy?.noPiiGuaranteed !== false
      || report.useBoundary?.status !== "QUARANTINE_EVAL_ONLY"
      || report.useBoundary?.offlineEvaluationFrameRows !== EXPECTED.frames
      || report.useBoundary?.offlineModelFittingRows !== 0
      || report.useBoundary?.authorizedTrainingRows !== 0
      || report.useBoundary?.governedTrainingRows !== 0
      || report.useBoundary?.trainingPerformed !== false
      || report.network?.rawNetworkAdmissionRows !== 0
      || report.network?.networkAdmissionRows !== 0
      || report.economics?.CEU !== 0 || report.economics?.pricingUnits !== 0
      || report.authority?.executionAuthorityUnits !== 0
      || report.authority?.executionAuthorityEstablished !== false
      || report.verification?.level !== "FULL_PINNED_NO_VIDEO_SOURCE_REDERIVED"
      || report.verification?.pyarrowHelperSha256
        !== farmSha256(Buffer.from(PYARROW_REPLAY, "utf8"))) fail("REPORT_BOUNDARY_INVALID");
    return { ok: true, artifactHash: report.artifactHash,
      keptRealRobotEpisodeUnits: EXPECTED.episodes,
      publisherRecoveryMorphologyUnits: EXPECTED.publisherRecoveryMorphologyEpisodes,
      independentOutcomeUnits: 0, verifiedRecoveryEffectUnits: 0,
      authorizedTrainingRows: 0, authorityUnits: 0 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyFarmUf850ReportWithSource(report, sourceDirectory) {
  const standalone = verifyFarmUf850Report(report);
  if (!standalone.ok) return standalone;
  const source = verifyFarmUf850SourceDirectory(sourceDirectory);
  if (!source.ok) return source;
  try {
    if (report.source.sourceRoot !== source.sourceRoot
      || report.source.sourceManifestHash !== source.manifest.manifestHash
      || report.source.sourceManifestFileSha256 !== source.manifestFileSha256) {
      fail("REPORT_SOURCE_BINDING_INVALID");
    }
    const rebuilt = buildFarmUf850ReportFromSource(sourceDirectory);
    if (!same(report, rebuilt)) fail("REPORT_SOURCE_REDERIVATION_MISMATCH");
    return { ...standalone, ok: true,
      verificationLevel: "FULL_PINNED_NO_VIDEO_SOURCE_REDERIVED" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function receiptCore(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receiptHash;
  return copy;
}

export function buildFarmUf850Receipt(report, reportBytes) {
  const checked = verifyFarmUf850Report(report);
  if (!checked.ok) fail("RECEIPT_REPORT_INVALID", checked.error);
  if (!Buffer.isBuffer(reportBytes) || !reportBytes.equals(canonicalBytes(report))) {
    fail("RECEIPT_REPORT_BYTES_INVALID");
  }
  const receipt = { schema: FARM_RECEIPT_SCHEMA, createdAt: FARM_FROZEN_AT,
    reportSchema: FARM_REPORT_SCHEMA, artifactHash: report.artifactHash,
    reportFileSha256: farmSha256(reportBytes), sourceRoot: report.source.sourceRoot,
    sourceManifestHash: report.source.sourceManifestHash,
    verificationLevel: "FULL_PINNED_NO_VIDEO_SOURCE_REDERIVED",
    closure: { keptRealRobotEpisodes: EXPECTED.episodes, frames: EXPECTED.frames,
      publisherRecoveryMorphologyEpisodes: EXPECTED.publisherRecoveryMorphologyEpisodes,
      completeAttemptCensusEstablished: false, independentOutcomeUnits: 0,
      verifiedRecoveryEffectUnits: 0, authorizedTrainingRows: 0,
      networkAdmissionRows: 0, CEU: 0, pricingUnits: 0, authorityUnits: 0 } };
  receipt.receiptHash = farmDigest(receiptCore(receipt), `${FARM_RECEIPT_SCHEMA}/receipt`);
  return receipt;
}

export function verifyFarmUf850Receipt(receipt, report, reportBytes) {
  try {
    if (!exactObject(receipt) || receipt.schema !== FARM_RECEIPT_SCHEMA
      || receipt.createdAt !== FARM_FROZEN_AT || !HASH.test(receipt.receiptHash ?? "")
      || receipt.receiptHash !== farmDigest(receiptCore(receipt),
        `${FARM_RECEIPT_SCHEMA}/receipt`)
      || receipt.reportSchema !== FARM_REPORT_SCHEMA
      || receipt.artifactHash !== report.artifactHash
      || receipt.reportFileSha256 !== farmSha256(reportBytes)
      || receipt.sourceRoot !== report.source.sourceRoot
      || receipt.sourceManifestHash !== report.source.sourceManifestHash
      || receipt.verificationLevel !== "FULL_PINNED_NO_VIDEO_SOURCE_REDERIVED"
      || !same(receipt.closure, { keptRealRobotEpisodes: EXPECTED.episodes,
        frames: EXPECTED.frames,
        publisherRecoveryMorphologyEpisodes: EXPECTED.publisherRecoveryMorphologyEpisodes,
        completeAttemptCensusEstablished: false, independentOutcomeUnits: 0,
        verifiedRecoveryEffectUnits: 0, authorizedTrainingRows: 0,
        networkAdmissionRows: 0, CEU: 0, pricingUnits: 0, authorityUnits: 0 })) {
      fail("RECEIPT_INVALID");
    }
    return { ok: true, receiptHash: receipt.receiptHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function publishFarmUf850ArtifactDirectory(stagingDirectory, targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (staging === target || target === path.parse(target).root || existsSync(target)) {
    fail("PUBLISH_TARGET_EXISTS_OR_BROAD", target);
  }
  const parent = path.dirname(target);
  if (!existsSync(parent) || lstatSync(parent).isSymbolicLink()
    || !lstatSync(parent).isDirectory()) fail("PUBLISH_PARENT_INVALID", parent);
  renameSync(staging, target);
  chmodSync(target, 0o700);
  return target;
}

export function verifyFarmUf850ArtifactDirectory(artifactDirectory) {
  try {
    const root = path.resolve(artifactDirectory);
    const rootStat = lstatSync(root);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()
      || (rootStat.mode & 0o777) !== 0o700) fail("ARTIFACT_ROOT_INVALID");
    const top = sorted(readdirSync(root));
    if (!same(top, ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_TOP_LEVEL_INVALID");
    }
    const reportBytes = readRegularPrivate(path.join(root, "report.json"));
    const receiptBytes = readRegularPrivate(path.join(root, "run-receipt.json"));
    const report = parseJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    const replay = verifyFarmUf850ReportWithSource(report, path.join(root, "source"));
    if (!replay.ok) fail("ARTIFACT_REPLAY_INVALID", replay.error);
    const checkedReceipt = verifyFarmUf850Receipt(receipt, report, reportBytes);
    if (!checkedReceipt.ok) fail("ARTIFACT_RECEIPT_INVALID", checkedReceipt.error);
    return { ...replay, ok: true, report, receipt,
      reportFileSha256: farmSha256(reportBytes), receiptFileSha256: farmSha256(receiptBytes),
      sourceManifestFileSha256: report.source.sourceManifestFileSha256 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
