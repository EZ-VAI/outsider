/*
 * Pinned RACER open-drawer sample intake.
 *
 * The selected source unit is the complete publisher-native
 * `samples/open_drawer/0` group, not a byte-range or archive shard.  Pickles
 * remain opaque and are never imported.  Publisher recovery labels and the
 * task-success filtering procedure are morphology claims, not independent
 * outcomes, a complete attempt census, or evidence from a physical robot.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, writeSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const RACER_DATASET_ID = "sled-umich/RACER-augmented_rlbench";
export const RACER_DATASET_REVISION = "a3d4f00a35f83401606188cac75b48a336eb4b6c";
export const RACER_CODE_COMMIT = "df8cb2beec2e2061392ef0c4be93bda916dfd51e";
export const RACER_DATAGEN_COMMIT = "bb360889e2a2cd7d79157cb82e60d967c8f30309";
export const RACER_SAMPLE_PREFIX = "samples/open_drawer/0/";
export const RACER_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const RACER_SOURCE_SCHEMA = "outsider/racer-open-drawer-source/v1";
export const RACER_REPORT_SCHEMA = "outsider/racer-open-drawer-recovery/v1";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${RACER_DATASET_ID}`;
const HF_TREE_PATH = `/api/datasets/${RACER_DATASET_ID}/tree/${RACER_DATASET_REVISION}`;
const HF_RAW = `${HF_ORIGIN}/datasets/${RACER_DATASET_ID}/resolve/${RACER_DATASET_REVISION}`;
const CODE_API = `https://api.github.com/repos/sled-group/RACER/commits/${RACER_CODE_COMMIT}`;
const DATAGEN_API = `https://api.github.com/repos/rich-language-failure-recovery/RACER-DataGen/commits/${RACER_DATAGEN_COMMIT}`;
const CODE_README = `https://raw.githubusercontent.com/sled-group/RACER/${RACER_CODE_COMMIT}/readme.md`;
const DATAGEN_README = `https://raw.githubusercontent.com/rich-language-failure-recovery/RACER-DataGen/${RACER_DATAGEN_COMMIT}/README.md`;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SAFE_COMPONENT = /^[A-Za-z0-9._+-]+$/u;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_API_BYTES = 16 * 1024 * 1024;
const MAX_SUPPORT_BYTES = 2 * 1024 * 1024;
const MAX_TREE_PAGES = 12;
const FETCH_TIMEOUT_MS = 120_000;
const DOWNLOAD_CONCURRENCY = 8;

const EXPECTED = Object.freeze({
  repositoryUsedStorage: 128_900_080_616,
  treePages: 6,
  treeEntries: 511,
  treeFiles: 488,
  treeDirectories: 23,
  treeBytes: 128_900_282_212,
  trainArchives: 18,
  validationArchives: 18,
  smallestTrainArchive: Object.freeze({
    path: "train/insert_onto_square_peg.zip",
    bytes: 1_282_953_600,
  }),
  smallestValidationArchive: Object.freeze({
    path: "val/insert_onto_square_peg.zip",
    bytes: 322_967_185,
  }),
  sampleTaskGroups: 2,
  sampleFiles: 197,
  sampleDirectories: 8,
  sampleBytes: 32_475_363,
  selectedFiles: 199,
  selectedBytes: 32_479_055,
  treeSnapshotHash:
    "sha256:8dc4736bba50d2ff6394e3e4bbfc2f9d1d5fe62f1de2a9f67e942798739eb7fd",
  codeReadmeSha256:
    "sha256:80265a7b422fa974ac599e51e5af21a419e69027763060addf256595cf453d4c",
  datagenReadmeSha256:
    "sha256:405f1a5d657598c31ce563dfe73ab4fea546d08a69b5ffde96f478fcda69f58c",
  pngFiles: 192,
  modalityDirectories: 8,
  actionRows: 24,
  actionWidth: 9,
  expertNodes: 4,
  recoveryFailureNodes: 15,
  correctionNodes: 5,
  languageNodes: 24,
  llavaRows: 50,
  llavaUniqueImages: 19,
  opaquePickles: 2,
});

const MODALITIES = Object.freeze([
  "front_depth", "front_rgb", "left_shoulder_depth", "left_shoulder_rgb",
  "right_shoulder_depth", "right_shoulder_rgb", "wrist_depth", "wrist_rgb",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `RACER_${code}` : `RACER_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

export function racerSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function racerDigest(value, domain = RACER_REPORT_SCHEMA) {
  return racerSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes).digest("hex");
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 4096
    || value.startsWith("/") || value.includes("\\") || value.includes("\0")) return false;
  return value.split("/").every((part) => part !== "" && part !== "."
    && part !== ".." && SAFE_COMPONENT.test(part));
}

function selectedPath(value) {
  return value === ".gitattributes" || value === "README.md"
    || value.startsWith(RACER_SAMPLE_PREFIX);
}

function encodedPath(value) {
  if (!safeRelative(value)) fail("REMOTE_PATH_INVALID", value);
  return value.split("/").map(encodeURIComponent).join("/");
}

function allowedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return false;
    return url.hostname === "huggingface.co" || url.hostname.endsWith(".hf.co")
      || url.hostname.endsWith(".xethub.hf.co") || url.hostname === "api.github.com"
      || url.hostname === "raw.githubusercontent.com";
  } catch { return false; }
}

function retryable(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError"
    || error?.retryable === true
    || /(?:fetch failed|network|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN)/iu
      .test(String(error?.message ?? error));
}

async function fetchOnce(url, maximumBytes, accept, fetchImpl) {
  if (!allowedUrl(url)) fail("FETCH_URL_REFUSED", url);
  let current = new URL(url);
  for (let redirect = 0; redirect <= 6; redirect += 1) {
    const response = await fetchImpl(current, {
      method: "GET", redirect: "manual",
      headers: { accept, "user-agent": "outsider-racer-quarantine/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.("location");
      if (!location || redirect === 6) fail("FETCH_REDIRECT_INVALID");
      const next = new URL(location, current);
      if (!allowedUrl(next.toString())) fail("FETCH_REDIRECT_REFUSED", next.toString());
      current = next;
      continue;
    }
    if (response.status !== 200 || !response.body) {
      const error = new Error(`HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 429
        || response.status >= 500;
      throw error;
    }
    const finalUrl = response.url || current.toString();
    if (!allowedUrl(finalUrl)) fail("FETCH_FINAL_URL_REFUSED", finalUrl);
    const declared = response.headers?.get?.("content-length");
    if (declared !== null && (!/^\d+$/u.test(declared)
      || Number(declared) > maximumBytes)) fail("FETCH_DECLARED_BYTES_INVALID");
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("bounded source limit");
        fail("FETCH_STREAM_BYTES_INVALID");
      }
      chunks.push(Buffer.from(value));
    }
    if (total < 1) fail("FETCH_EMPTY");
    return {
      bytes: Buffer.concat(chunks, total), finalUrl,
      contentType: response.headers?.get?.("content-type") ?? null,
      headers: response.headers, status: response.status,
    };
  }
  fail("FETCH_REDIRECT_LIMIT");
}

async function boundedFetch(url, maximumBytes, accept, fetchImpl) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await fetchOnce(url, maximumBytes, accept, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * attempt));
    }
  }
  throw last;
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

async function jsonFetch(url, fetchImpl) {
  const fetched = await boundedFetch(url, MAX_API_BYTES, "application/json", fetchImpl);
  return { ...fetched, value: parseJson(fetched.bytes, url) };
}

function parseNextTreeLink(header) {
  if (header == null || header === "") return null;
  const next = String(header).split(",")
    .find((part) => /;\s*rel="next"\s*$/iu.test(part.trim()));
  if (!next) return null;
  const match = /^\s*<([^>]+)>/u.exec(next);
  if (!match) fail("TREE_NEXT_LINK_INVALID");
  const url = new URL(match[1]);
  if (url.origin !== HF_ORIGIN || url.pathname !== HF_TREE_PATH
    || url.searchParams.get("recursive") !== "true"
    || url.searchParams.get("limit") !== "100"
    || !url.searchParams.get("cursor")) fail("TREE_NEXT_LINK_REFUSED");
  return url.toString();
}

function normalizeTreePage(value) {
  if (!Array.isArray(value) || value.length < 1) fail("TREE_PAGE_INVALID");
  return value.map((entry) => {
    if (!plain(entry) || !safeRelative(entry.path)
      || !["file", "directory"].includes(entry.type)) fail("TREE_ENTRY_INVALID");
    if (entry.type === "directory") return { path: entry.path, type: "directory" };
    if (!SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size)
      || entry.size < 1) fail("TREE_FILE_INVALID", entry.path);
    let lfsSha256 = null;
    if (entry.lfs !== undefined) {
      if (!plain(entry.lfs) || !SHA256.test(entry.lfs.oid ?? "")
        || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
      lfsSha256 = `sha256:${entry.lfs.oid}`;
    }
    return { path: entry.path, type: "file", sizeBytes: entry.size,
      oid: entry.oid, lfsSha256 };
  });
}

async function fetchFullTree(fetchImpl, phase) {
  const entries = [];
  const rawPages = [];
  const seen = new Set();
  let next = `${HF_API}/tree/${RACER_DATASET_REVISION}?recursive=true&limit=100`;
  for (let page = 1; next !== null; page += 1) {
    if (page > MAX_TREE_PAGES || seen.has(next)) fail("TREE_PAGINATION_INVALID");
    seen.add(next);
    const fetched = await jsonFetch(next, fetchImpl);
    entries.push(...normalizeTreePage(fetched.value));
    rawPages.push({
      file: `support/hf/${phase}/tree-${String(page).padStart(3, "0")}.json`,
      requestUrl: next, finalUrl: fetched.finalUrl, bytes: fetched.bytes,
      contentType: fetched.contentType, status: fetched.status,
    });
    next = parseNextTreeLink(fetched.headers?.get?.("link"));
  }
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) fail("TREE_DUPLICATE_PATH");
  return { entries: entries.sort((a, b) => a.path.localeCompare(b.path)), rawPages };
}

function repositoryProjection(value) {
  if (!plain(value) || value.id !== RACER_DATASET_ID || value.sha !== RACER_DATASET_REVISION
    || value.private !== false || value.gated !== false || value.disabled !== false
    || value.usedStorage !== EXPECTED.repositoryUsedStorage
    || value.cardData?.license !== "mit" || !Array.isArray(value.siblings)) {
    fail("REPOSITORY_PROFILE_INVALID");
  }
  const siblingPaths = sorted(value.siblings.map((entry) => entry?.rfilename));
  if (siblingPaths.length !== EXPECTED.treeFiles
    || siblingPaths.some((item) => !safeRelative(item))) fail("REPOSITORY_SIBLINGS_INVALID");
  return { id: value.id, sha: value.sha, private: value.private, gated: value.gated,
    disabled: value.disabled, usedStorage: value.usedStorage,
    cardLicense: value.cardData.license, siblingPaths };
}

function treeProfile(entries) {
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const totalBytes = files.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const archives = (split) => files.filter((entry) => entry.path.startsWith(`${split}/`)
    && entry.path.endsWith(".zip")).sort((a, b) => a.sizeBytes - b.sizeBytes);
  const train = archives("train");
  const validation = archives("val");
  const sampleEpisodeDirectories = directories.filter((entry) =>
    /^samples\/(close_jar|open_drawer)\/0$/u.test(entry.path));
  const sampleFiles = files.filter((entry) => entry.path.startsWith(RACER_SAMPLE_PREFIX));
  const sampleDirectories = directories.filter((entry) =>
    entry.path.startsWith(RACER_SAMPLE_PREFIX));
  const selected = files.filter((entry) => selectedPath(entry.path));
  if (entries.length !== EXPECTED.treeEntries || files.length !== EXPECTED.treeFiles
    || directories.length !== EXPECTED.treeDirectories || totalBytes !== EXPECTED.treeBytes
    || train.length !== EXPECTED.trainArchives
    || validation.length !== EXPECTED.validationArchives
    || !same({ path: train[0]?.path, bytes: train[0]?.sizeBytes },
      EXPECTED.smallestTrainArchive)
    || !same({ path: validation[0]?.path, bytes: validation[0]?.sizeBytes },
      EXPECTED.smallestValidationArchive)
    || sampleEpisodeDirectories.length !== EXPECTED.sampleTaskGroups
    || sampleFiles.length !== EXPECTED.sampleFiles
    || sampleDirectories.length !== EXPECTED.sampleDirectories
    || sampleFiles.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== EXPECTED.sampleBytes
    || selected.length !== EXPECTED.selectedFiles
    || selected.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== EXPECTED.selectedBytes
    || racerDigest(entries, `${RACER_SOURCE_SCHEMA}/tree`) !== EXPECTED.treeSnapshotHash) {
    fail("TREE_PROFILE_INVALID");
  }
  return {
    entries: entries.length, files: files.length, directories: directories.length,
    bytes: totalBytes, pages: EXPECTED.treePages,
    trainArchives: train.map((entry) => ({ path: entry.path, bytes: entry.sizeBytes,
      lfsSha256: entry.lfsSha256 })),
    validationArchives: validation.map((entry) => ({ path: entry.path,
      bytes: entry.sizeBytes, lfsSha256: entry.lfsSha256 })),
    sampleEpisodeDirectories: sampleEpisodeDirectories.map((entry) => entry.path).sort(),
    selected: selected.sort((a, b) => a.path.localeCompare(b.path)),
  };
}

function validateGitHubCommit(value, expected, repository) {
  if (!plain(value) || value.sha !== expected || value.commit?.tree?.sha == null
    || value.html_url !== `https://github.com/${repository}/commit/${expected}`) {
    fail("PRODUCER_COMMIT_INVALID", repository);
  }
  return { repository, commit: value.sha, tree: value.commit.tree.sha,
    htmlUrl: value.html_url };
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function safeJoin(root, relative) {
  if (!safeRelative(relative)) fail("LOCAL_PATH_INVALID", relative);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, ...relative.split("/"));
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) fail("LOCAL_PATH_ESCAPE", relative);
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

function stableRead(file) {
  const before = lstatSync(file);
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1
    || (before.mode & 0o777) !== 0o600) fail("SOURCE_FILE_UNSAFE", file);
  const descriptor = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size) fail("SOURCE_FILE_RACE", file);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
      fail("SOURCE_FILE_MUTATED", file);
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

function snapshotRecord(item) {
  return { file: item.file, requestUrl: item.requestUrl, finalUrl: item.finalUrl,
    bytes: item.bytes.length, sha256: racerSha256(item.bytes), status: item.status,
    contentType: item.contentType };
}

async function producerSupport(fetchImpl, phase) {
  const [code, datagen] = await Promise.all([
    jsonFetch(CODE_API, fetchImpl), jsonFetch(DATAGEN_API, fetchImpl),
  ]);
  const codeProjection = validateGitHubCommit(code.value, RACER_CODE_COMMIT,
    "sled-group/RACER");
  const datagenProjection = validateGitHubCommit(datagen.value, RACER_DATAGEN_COMMIT,
    "rich-language-failure-recovery/RACER-DataGen");
  return {
    projections: { code: codeProjection, datagen: datagenProjection },
    snapshots: [
      { file: `support/github/${phase}/racer-commit.json`, requestUrl: CODE_API,
        finalUrl: code.finalUrl, bytes: code.bytes, status: code.status,
        contentType: code.contentType },
      { file: `support/github/${phase}/datagen-commit.json`, requestUrl: DATAGEN_API,
        finalUrl: datagen.finalUrl, bytes: datagen.bytes, status: datagen.status,
        contentType: datagen.contentType },
    ],
  };
}

async function downloadSelected(entries, directory, fetchImpl) {
  const results = new Array(entries.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= entries.length) return;
      const entry = entries[index];
      const requestUrl = `${HF_RAW}/${encodedPath(entry.path)}`;
      const fetched = await boundedFetch(requestUrl, entry.sizeBytes,
        "application/octet-stream", fetchImpl);
      if (fetched.bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_MISMATCH", entry.path);
      const sha256 = racerSha256(fetched.bytes);
      if (entry.lfsSha256 !== null) {
        if (sha256 !== entry.lfsSha256) fail("OBJECT_LFS_MISMATCH", entry.path);
      } else if (gitBlobOid(fetched.bytes) !== entry.oid) {
        fail("OBJECT_GIT_BLOB_MISMATCH", entry.path);
      }
      writePrivateOnce(safeJoin(directory, `objects/${entry.path}`), fetched.bytes);
      results[index] = { path: entry.path, bytes: fetched.bytes.length, sha256,
        gitOid: entry.oid, lfsSha256: entry.lfsSha256, requestUrl,
        finalUrl: fetched.finalUrl, contentType: fetched.contentType };
    }
  }
  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, () => worker()));
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

export async function acquireRacerOpenDrawerSource({ directory, fetchImpl = fetch } = {}) {
  if (typeof directory !== "string" || directory.length < 1) fail("DIRECTORY_REQUIRED");
  if (existsSync(directory)) fail("NO_CLOBBER", directory);
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  chmodSync(directory, 0o700);

  const repositoryUrl = `${HF_API}/revision/${RACER_DATASET_REVISION}`;
  const beforeRepository = await jsonFetch(repositoryUrl, fetchImpl);
  const beforeRepoProjection = repositoryProjection(beforeRepository.value);
  const beforeTree = await fetchFullTree(fetchImpl, "before");
  const beforeProfile = treeProfile(beforeTree.entries);
  if (beforeTree.rawPages.length !== EXPECTED.treePages) fail("TREE_PAGE_COUNT_INVALID");
  if (!same(beforeRepoProjection.siblingPaths,
    beforeTree.entries.filter((entry) => entry.type === "file").map((entry) => entry.path))) {
    fail("REPOSITORY_TREE_DISAGREE");
  }
  const beforeProducer = await producerSupport(fetchImpl, "before");
  const [codeReadme, datagenReadme] = await Promise.all([
    boundedFetch(CODE_README, MAX_SUPPORT_BYTES, "text/plain", fetchImpl),
    boundedFetch(DATAGEN_README, MAX_SUPPORT_BYTES, "text/plain", fetchImpl),
  ]);
  if (!codeReadme.bytes.toString("utf8").includes("Rich Language-Guided Failure Recovery")
    || !datagenReadme.bytes.toString("utf8").includes("Data Generation Pipeline")
    || racerSha256(codeReadme.bytes) !== EXPECTED.codeReadmeSha256
    || racerSha256(datagenReadme.bytes) !== EXPECTED.datagenReadmeSha256) {
    fail("PRODUCER_README_INVALID");
  }
  const sourceFiles = await downloadSelected(beforeProfile.selected, directory, fetchImpl);

  const afterRepository = await jsonFetch(repositoryUrl, fetchImpl);
  const afterRepoProjection = repositoryProjection(afterRepository.value);
  const afterTree = await fetchFullTree(fetchImpl, "after");
  const afterProfile = treeProfile(afterTree.entries);
  const afterProducer = await producerSupport(fetchImpl, "after");
  if (afterTree.rawPages.length !== EXPECTED.treePages
    || !same(beforeRepoProjection, afterRepoProjection)
    || !same(beforeTree.entries, afterTree.entries)
    || !same(beforeProducer.projections, afterProducer.projections)) fail("SOURCE_DRIFT");

  const support = [
    { file: "support/hf/before/repository.json", requestUrl: repositoryUrl,
      finalUrl: beforeRepository.finalUrl, bytes: beforeRepository.bytes,
      status: beforeRepository.status, contentType: beforeRepository.contentType },
    ...beforeTree.rawPages,
    ...beforeProducer.snapshots,
    { file: "support/github/racer-README.md", requestUrl: CODE_README,
      finalUrl: codeReadme.finalUrl, bytes: codeReadme.bytes, status: codeReadme.status,
      contentType: codeReadme.contentType },
    { file: "support/github/datagen-README.md", requestUrl: DATAGEN_README,
      finalUrl: datagenReadme.finalUrl, bytes: datagenReadme.bytes,
      status: datagenReadme.status, contentType: datagenReadme.contentType },
    { file: "support/hf/after/repository.json", requestUrl: repositoryUrl,
      finalUrl: afterRepository.finalUrl, bytes: afterRepository.bytes,
      status: afterRepository.status, contentType: afterRepository.contentType },
    ...afterTree.rawPages,
    ...afterProducer.snapshots,
  ];
  for (const item of support) writePrivateOnce(safeJoin(directory, item.file), item.bytes);

  const treeSnapshotHash = racerDigest(beforeTree.entries, `${RACER_SOURCE_SCHEMA}/tree`);
  const sourceRoot = racerDigest(sourceFiles.map(({ path: objectPath, bytes, sha256,
    gitOid, lfsSha256 }) => ({ path: objectPath, bytes, sha256, gitOid, lfsSha256 })),
  `${RACER_SOURCE_SCHEMA}/objects`);
  const manifestBase = {
    schema: RACER_SOURCE_SCHEMA, frozenAt: RACER_FROZEN_AT,
    dataset: { id: RACER_DATASET_ID, revision: RACER_DATASET_REVISION,
      public: true, gated: false, disabled: false, publisherLicenseClaim: "MIT" },
    producers: beforeProducer.projections,
    repository: { usedStorage: EXPECTED.repositoryUsedStorage,
      completeTreePinned: true, treeSnapshotHash,
      entries: EXPECTED.treeEntries, files: EXPECTED.treeFiles,
      directories: EXPECTED.treeDirectories, pages: EXPECTED.treePages,
      bytes: EXPECTED.treeBytes },
    inventory: {
      trainArchives: beforeProfile.trainArchives,
      validationArchives: beforeProfile.validationArchives,
      sampleEpisodeDirectories: beforeProfile.sampleEpisodeDirectories,
      allTaskArchivesExceed300MB: beforeProfile.trainArchives.every((item) =>
        item.bytes > 300_000_000) && beforeProfile.validationArchives.every((item) =>
        item.bytes > 300_000_000),
    },
    selection: { kind: "COMPLETE_SOURCE_NATIVE_SAMPLE_EPISODE_GROUP",
      prefix: RACER_SAMPLE_PREFIX, randomShardSelection: false,
      files: EXPECTED.selectedFiles, bytes: EXPECTED.selectedBytes,
      sampleFiles: EXPECTED.sampleFiles, sampleBytes: EXPECTED.sampleBytes,
      rootSupportFiles: 2 },
    sourceFiles,
    supportSnapshots: support.map(snapshotRecord).sort((a, b) => a.file.localeCompare(b.file)),
    sourceRoot,
  };
  const manifestHash = racerDigest(manifestBase, `${RACER_SOURCE_SCHEMA}/manifest`);
  const manifest = { ...manifestBase, manifestHash };
  writePrivateOnce(path.join(directory, "acquisition-manifest.json"), canonicalBytes(manifest));
  verifyRacerOpenDrawerSource(directory);
  return manifest;
}

function walk(root, current = root, result = { files: [], directories: [] }) {
  const stat = lstatSync(current);
  if (stat.isSymbolicLink()) fail("SOURCE_SYMLINK", current);
  if (!stat.isDirectory() || (stat.mode & 0o777) !== 0o700) fail("SOURCE_DIRECTORY_MODE", current);
  if (current !== root) result.directories.push(path.relative(root, current).split(path.sep).join("/"));
  for (const name of readdirSync(current).sort()) {
    const item = path.join(current, name);
    const child = lstatSync(item);
    if (child.isSymbolicLink()) fail("SOURCE_SYMLINK", item);
    if (child.isDirectory()) walk(root, item, result);
    else if (child.isFile()) result.files.push(path.relative(root, item).split(path.sep).join("/"));
    else fail("SOURCE_SPECIAL_FILE", item);
  }
  return result;
}

function parseStoredTreePages(directory, phase, count) {
  const entries = [];
  for (let page = 1; page <= count; page += 1) {
    const relative = `support/hf/${phase}/tree-${String(page).padStart(3, "0")}.json`;
    entries.push(...normalizeTreePage(parseJson(stableRead(safeJoin(directory, relative)), relative)));
  }
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) fail("STORED_TREE_DUPLICATE");
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function verifyRacerOpenDrawerSource(directory) {
  const manifestBytes = stableRead(path.join(directory, "acquisition-manifest.json"));
  const manifest = parseJson(manifestBytes, "acquisition-manifest");
  if (!plain(manifest) || manifest.schema !== RACER_SOURCE_SCHEMA
    || manifest.frozenAt !== RACER_FROZEN_AT || !HASH.test(manifest.sourceRoot ?? "")
    || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_INVALID");
  const { manifestHash, ...manifestBase } = manifest;
  if (racerDigest(manifestBase, `${RACER_SOURCE_SCHEMA}/manifest`) !== manifestHash) {
    fail("MANIFEST_HASH_INVALID");
  }
  const beforeRepository = repositoryProjection(parseJson(stableRead(safeJoin(directory,
    "support/hf/before/repository.json")), "before-repository"));
  const afterRepository = repositoryProjection(parseJson(stableRead(safeJoin(directory,
    "support/hf/after/repository.json")), "after-repository"));
  const beforeTree = parseStoredTreePages(directory, "before", EXPECTED.treePages);
  const afterTree = parseStoredTreePages(directory, "after", EXPECTED.treePages);
  const beforeProfile = treeProfile(beforeTree);
  treeProfile(afterTree);
  if (!same(beforeRepository, afterRepository) || !same(beforeTree, afterTree)
    || !same(beforeRepository.siblingPaths,
      beforeTree.filter((entry) => entry.type === "file").map((entry) => entry.path))) {
    fail("STORED_SOURCE_DRIFT");
  }
  const codeBefore = validateGitHubCommit(parseJson(stableRead(safeJoin(directory,
    "support/github/before/racer-commit.json")), "code-before"), RACER_CODE_COMMIT,
  "sled-group/RACER");
  const codeAfter = validateGitHubCommit(parseJson(stableRead(safeJoin(directory,
    "support/github/after/racer-commit.json")), "code-after"), RACER_CODE_COMMIT,
  "sled-group/RACER");
  const dataBefore = validateGitHubCommit(parseJson(stableRead(safeJoin(directory,
    "support/github/before/datagen-commit.json")), "datagen-before"), RACER_DATAGEN_COMMIT,
  "rich-language-failure-recovery/RACER-DataGen");
  const dataAfter = validateGitHubCommit(parseJson(stableRead(safeJoin(directory,
    "support/github/after/datagen-commit.json")), "datagen-after"), RACER_DATAGEN_COMMIT,
  "rich-language-failure-recovery/RACER-DataGen");
  if (!same(codeBefore, codeAfter) || !same(dataBefore, dataAfter)) fail("PRODUCER_DRIFT");

  const expectedFiles = new Set(["acquisition-manifest.json",
    ...manifest.supportSnapshots.map((item) => item.file),
    ...beforeProfile.selected.map((item) => `objects/${item.path}`)]);
  const layout = walk(directory);
  if (!same(sorted(layout.files), sorted(expectedFiles))) fail("SOURCE_LAYOUT_INVALID");
  const expectedDirectories = new Set([""]);
  for (const file of expectedFiles) {
    const parts = file.split("/").slice(0, -1);
    for (let length = 1; length <= parts.length; length += 1) {
      expectedDirectories.add(parts.slice(0, length).join("/"));
    }
  }
  if (!same(sorted(layout.directories), sorted([...expectedDirectories].filter(Boolean)))) {
    fail("SOURCE_DIRECTORY_LAYOUT_INVALID");
  }
  for (const support of manifest.supportSnapshots) {
    const bytes = stableRead(safeJoin(directory, support.file));
    if (bytes.length !== support.bytes || racerSha256(bytes) !== support.sha256) {
      fail("SUPPORT_BYTES_INVALID", support.file);
    }
  }
  if (racerSha256(stableRead(safeJoin(directory, "support/github/racer-README.md")))
      !== EXPECTED.codeReadmeSha256
    || racerSha256(stableRead(safeJoin(directory, "support/github/datagen-README.md")))
      !== EXPECTED.datagenReadmeSha256) fail("PRODUCER_README_BYTES_INVALID");
  const expectedSource = beforeProfile.selected.map((entry) => {
    const bytes = stableRead(safeJoin(directory, `objects/${entry.path}`));
    const sha256 = racerSha256(bytes);
    if (bytes.length !== entry.sizeBytes || (entry.lfsSha256 !== null
      ? sha256 !== entry.lfsSha256 : gitBlobOid(bytes) !== entry.oid)) {
      fail("SOURCE_OBJECT_INVALID", entry.path);
    }
    return { path: entry.path, bytes: bytes.length, sha256, gitOid: entry.oid,
      lfsSha256: entry.lfsSha256 };
  });
  const manifestProjection = manifest.sourceFiles.map(({ path: objectPath, bytes, sha256,
    gitOid, lfsSha256 }) => ({ path: objectPath, bytes, sha256, gitOid, lfsSha256 }));
  if (!same(expectedSource, manifestProjection)) fail("SOURCE_MANIFEST_OBJECTS_INVALID");
  const sourceRoot = racerDigest(expectedSource, `${RACER_SOURCE_SCHEMA}/objects`);
  const treeSnapshotHash = racerDigest(beforeTree, `${RACER_SOURCE_SCHEMA}/tree`);
  if (sourceRoot !== manifest.sourceRoot
    || treeSnapshotHash !== manifest.repository.treeSnapshotHash) fail("SOURCE_ROOT_INVALID");
  return { ok: true, sourceRoot, manifestHash, treeSnapshotHash,
    selectedFiles: expectedSource.length, selectedBytes: expectedSource.reduce((sum, item) =>
      sum + item.bytes, 0), manifest, profile: beforeProfile };
}

function parseActions(bytes) {
  const text = bytes.toString("utf8");
  const lines = text.split(/\r?\n/u).filter((line) => line !== "");
  const rows = lines.map((line, index) => {
    const values = line.split(",").map(Number);
    if (values.length !== EXPECTED.actionWidth || values.some((value) => !Number.isFinite(value))) {
      fail("ACTIONS_ROW_INVALID", index);
    }
    return values;
  });
  if (rows.length !== EXPECTED.actionRows) fail("ACTIONS_COUNT_INVALID");
  return { rows: rows.length, width: EXPECTED.actionWidth,
    allFinite: true, headerPresent: false,
    publisherFieldMeaning: "7DoF EE pose, gripper, collision",
    rowToLanguageNodeIdentityExplicit: false };
}

function languageProjection(value) {
  if (!plain(value) || value.task_goal !== "open the bottom drawer" || !plain(value.subgoal)) {
    fail("LANGUAGE_ROOT_INVALID");
  }
  const nodes = [];
  for (const [expertKey, expert] of Object.entries(value.subgoal)) {
    if (!plain(expert) || !/^\d+_expert$/u.test(expertKey)
      || !Number.isSafeInteger(expert.idx) || typeof expert.label !== "string"
      || !plain(expert.augmentation)) fail("LANGUAGE_EXPERT_INVALID", expertKey);
    nodes.push({ key: expertKey, kind: "expert", label: expert.label, idx: expert.idx });
    for (const [failureKey, failure] of Object.entries(expert.augmentation)) {
      if (!plain(failure) || !/^\d+_perturb_heuristic_\d+$/u.test(failureKey)
        || failure.label !== "recoverable_failure" || !plain(failure.correction)) {
        fail("LANGUAGE_FAILURE_INVALID", failureKey);
      }
      nodes.push({ key: failureKey, kind: "failure", label: failure.label,
        idx: failure.idx });
      for (const [correctionKey, correction] of Object.entries(failure.correction)) {
        if (!plain(correction) || !/^\d+_intermediate_heuristic_\d+$/u.test(correctionKey)
          || correction.label !== "ongoing") fail("LANGUAGE_CORRECTION_INVALID", correctionKey);
        nodes.push({ key: correctionKey, kind: "correction", label: correction.label,
          idx: correction.idx });
      }
    }
  }
  const expert = nodes.filter((node) => node.kind === "expert");
  const failures = nodes.filter((node) => node.kind === "failure");
  const corrections = nodes.filter((node) => node.kind === "correction");
  if (nodes.length !== EXPECTED.languageNodes || expert.length !== EXPECTED.expertNodes
    || failures.length !== EXPECTED.recoveryFailureNodes
    || corrections.length !== EXPECTED.correctionNodes
    || new Set(nodes.map((node) => node.key)).size !== nodes.length) {
    fail("LANGUAGE_COUNTS_INVALID");
  }
  return { taskGoal: value.task_goal, nodes: nodes.sort((a, b) => a.key.localeCompare(b.key)),
    expertNodes: expert.length, recoverableFailureNodes: failures.length,
    correctionNodes: corrections.length,
    expertLabelCounts: Object.fromEntries([...new Set(expert.map((node) => node.label))]
      .sort().map((label) => [label, expert.filter((node) => node.label === label).length])) };
}

function inspectPng(bytes, objectPath) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
    || bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    fail("PNG_INVALID", objectPath);
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const bitDepth = bytes[24];
  const colorType = bytes[25];
  if (width < 1 || height < 1 || ![0, 2, 3, 4, 6].includes(colorType)) {
    fail("PNG_PROFILE_INVALID", objectPath);
  }
  return { width, height, bitDepth, colorType };
}

function llavaProjection(value, selectedImagePaths) {
  if (!Array.isArray(value) || value.length !== EXPECTED.llavaRows) fail("LLAVA_ROWS_INVALID");
  const ids = new Set();
  const images = new Set();
  const labels = {};
  for (const row of value) {
    if (!plain(row) || typeof row.id !== "string" || ids.has(row.id)
      || typeof row.image !== "string" || !Array.isArray(row.conversations)
      || row.conversations.length !== 2 || typeof row.conversations[1]?.label !== "string") {
      fail("LLAVA_ROW_INVALID");
    }
    ids.add(row.id);
    const prefix = "augmented_rlbench/train/open_drawer/0/";
    if (!row.image.startsWith(prefix)) fail("LLAVA_IMAGE_PREFIX_INVALID");
    const selected = `${RACER_SAMPLE_PREFIX}${row.image.slice(prefix.length)}`;
    if (!selectedImagePaths.has(selected)) fail("LLAVA_IMAGE_MISSING", selected);
    images.add(selected);
    labels[row.conversations[1].label] = (labels[row.conversations[1].label] ?? 0) + 1;
  }
  if (images.size !== EXPECTED.llavaUniqueImages
    || !same(labels, { ongoing: 3, start: 5, "subgoal failure": 12,
      "subgoal success": 25, "task success": 5 })) fail("LLAVA_PROFILE_INVALID");
  return { rows: value.length, uniqueIds: ids.size, uniqueFrontRgbImages: images.size,
    publisherLabelCounts: Object.fromEntries(Object.entries(labels)
      .sort(([left], [right]) => left.localeCompare(right))), rawTextProjected: false };
}

export function replayRacerOpenDrawerSource(directory) {
  const verified = verifyRacerOpenDrawerSource(directory);
  const object = (relative) => stableRead(safeJoin(directory, `objects/${relative}`));
  const readme = object("README.md").toString("utf8");
  const datagenReadme = stableRead(safeJoin(directory, "support/github/datagen-README.md"))
    .toString("utf8");
  if (!/^---\nlicense: mit\n---/u.test(readme)
    || !readme.includes("filter unsuccessful trajectories")
    || !readme.includes("10,159 episodes in total")
    || !datagenReadme.includes("actions.csv: raw wapoint actions (7DoF EE pose, gripper, collision)")) {
    fail("PUBLISHER_DOCUMENTATION_INVALID");
  }
  const actions = parseActions(object(`${RACER_SAMPLE_PREFIX}actions.csv`));
  const language = languageProjection(parseJson(object(
    `${RACER_SAMPLE_PREFIX}language_description.json`), "language-description"));
  const imageFiles = verified.profile.selected.filter((entry) => entry.path.endsWith(".png"));
  if (imageFiles.length !== EXPECTED.pngFiles) fail("IMAGE_COUNT_INVALID");
  const nodeNames = new Set(language.nodes.map((node) => `${node.key}.png`));
  const modalityCounts = {};
  const profiles = new Map();
  for (const modality of MODALITIES) {
    const files = imageFiles.filter((entry) => entry.path.startsWith(
      `${RACER_SAMPLE_PREFIX}${modality}/`));
    if (files.length !== EXPECTED.languageNodes
      || !same(sorted(files.map((entry) => path.posix.basename(entry.path))), sorted(nodeNames))) {
      fail("MODALITY_CLOSURE_INVALID", modality);
    }
    modalityCounts[modality] = files.length;
    for (const file of files) {
      const profile = inspectPng(object(file.path), file.path);
      profiles.set(canonicalizeStrict(profile), profile);
    }
  }
  if (Object.keys(modalityCounts).length !== EXPECTED.modalityDirectories) {
    fail("MODALITY_COUNT_INVALID");
  }
  const selectedImagePaths = new Set(imageFiles.map((entry) => entry.path));
  const llava = llavaProjection(parseJson(object(`${RACER_SAMPLE_PREFIX}llava.json`),
    "llava"), selectedImagePaths);
  const pickles = ["annotated_episode.pkl", "obs.pkl"].map((name) => {
    const bytes = object(`${RACER_SAMPLE_PREFIX}${name}`);
    if (bytes.length < 2 || bytes[0] !== 0x80) fail("PICKLE_PROFILE_INVALID", name);
    return { name, bytes: bytes.length, sha256: racerSha256(bytes),
      protocolMarker: bytes[1], deserialized: false, executed: false };
  });
  if (pickles.length !== EXPECTED.opaquePickles) fail("PICKLE_COUNT_INVALID");
  return { verified, actions, language, modalityCounts,
    pngProfiles: [...profiles.values()].sort((left, right) => canonicalizeStrict(left)
      .localeCompare(canonicalizeStrict(right))), llava, pickles };
}

function reportBaseFromReplay(replay) {
  const profile = replay.verified.profile;
  return {
    schema: RACER_REPORT_SCHEMA, frozenAt: RACER_FROZEN_AT,
    status: "PINNED_SIMULATED_FILTERED_RECOVERY_MORPHOLOGY_SAMPLE",
    admission: "QUARANTINE_EVAL",
    source: { datasetId: RACER_DATASET_ID, revision: RACER_DATASET_REVISION,
      racerCodeCommit: RACER_CODE_COMMIT, dataGenerationCommit: RACER_DATAGEN_COMMIT,
      sourceRoot: replay.verified.sourceRoot,
      sourceManifestHash: replay.verified.manifestHash,
      completeRepositoryTreePinned: true, completeSelectedBytesReplayed: true,
      selectedObjects: EXPECTED.selectedFiles, selectedBytes: EXPECTED.selectedBytes },
    repositoryInventory: {
      repositoryObjects: EXPECTED.treeFiles, repositoryBytes: EXPECTED.treeBytes,
      trainTaskArchives: EXPECTED.trainArchives,
      validationTaskArchives: EXPECTED.validationArchives,
      smallestTrainArchive: EXPECTED.smallestTrainArchive,
      smallestValidationArchive: EXPECTED.smallestValidationArchive,
      allCompleteTaskArchivesExceed300MB: true,
      sourceNativeSampleEpisodeGroups: profile.sampleEpisodeDirectories,
      randomArchiveShardUsed: false,
    },
    slice: { task: "open_drawer", publisherEpisodeDirectory: "0",
      class: "SIMULATED_RECOVERY_TRANSITION_MORPHOLOGY_GROUP",
      completeSourceNativeGroup: true, sampleFiles: EXPECTED.sampleFiles,
      sampleBytes: EXPECTED.sampleBytes, modalityDirectories: EXPECTED.modalityDirectories,
      pngFiles: EXPECTED.pngFiles },
    replay: { actions: replay.actions,
      language: { taskGoal: replay.language.taskGoal,
        nodes: replay.language.nodes.length, expertNodes: replay.language.expertNodes,
        recoverableFailureNodes: replay.language.recoverableFailureNodes,
        correctionNodes: replay.language.correctionNodes,
        expertLabelCounts: replay.language.expertLabelCounts,
        rawLanguageProjected: false },
      modalityCounts: replay.modalityCounts, pngProfiles: replay.pngProfiles,
      llava: replay.llava, opaquePickles: replay.pickles },
    selectionAndCensus: {
      publisherReportsExpertEpisodes: 2_250,
      publisherReportsRetainedRecoveryEpisodes: 10_159,
      publisherReportsFivePerturbationsPerExpertEpisode: true,
      publisherReportsEpisodesFilteredByTaskSuccess: true,
      unsuccessfulPostRecoveryEpisodesExcludedByPublisher: true,
      discardedEpisodeCountAvailable: false,
      preFilterAttemptDenominatorAvailable: false,
      completeDatasetAttemptCensus: false,
      completeSelectedAttemptCensus: false,
      sampleSelectionProcedureDocumented: false,
      filteredSuccessSelectionBiasPresent: true,
      crossTotal: null,
    },
    truth: {
      environment: "RLBENCH_SIMULATION",
      physicalRobotEpisode: false, simToRealResultIsDatasetProvenance: false,
      sparseWaypointActionsPresent: true, continuousTrajectoryEstablished: false,
      publisherRecoverableFailureLabelsPresent: true,
      publisherCorrectionMorphologyPresent: true,
      terminalRecoverySuccessPublisherFiltered: true,
      independentOutcomeEstablished: false,
      recoveryCausallyEstablishedByIndependentEvidence: false,
      independentWitnessEstablished: false,
      externalEffectEstablished: false,
    },
    safety: { opaquePythonPicklesPresent: true, pickleDeserialized: false,
      pickleExecuted: false, embeddedCodeExecuted: false,
      publisherToolingExecuted: false },
    rights: { datasetCardClaim: "MIT", datasetReadmeClaim: "MIT",
      datasetLicenseFilePresent: false, rightsFinallyAdjudicated: false,
      evaluationUseFinallyAdjudicated: false, productionTrainingAuthorized: false },
    privacy: { simulatedImagesPresent: true, physicalSceneImagesPresent: false,
      noPersonalInformationGuaranteed: false, privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false },
    boundary: { opportunity: 0, delegation: 0, actionAuthority: 0,
      independentOutcome: 0, longitudinalOutcome: 0, training: 0,
      network: 0, CEU: 0, pricing: 0, authority: 0 },
  };
}

export function buildRacerOpenDrawerReport(directory) {
  const base = reportBaseFromReplay(replayRacerOpenDrawerSource(directory));
  return { ...base, artifactHash: racerDigest(base, RACER_REPORT_SCHEMA) };
}

export function verifyRacerOpenDrawerReport(report, directory) {
  if (!plain(report) || report.schema !== RACER_REPORT_SCHEMA
    || report.status !== "PINNED_SIMULATED_FILTERED_RECOVERY_MORPHOLOGY_SAMPLE"
    || report.admission !== "QUARANTINE_EVAL" || !HASH.test(report.artifactHash ?? "")) {
    fail("REPORT_INVALID");
  }
  const expected = buildRacerOpenDrawerReport(directory);
  if (!same(report, expected)) fail("REPORT_NOT_FULL_SOURCE_DERIVED");
  return { ok: true, verificationLevel:
    "FULL_PINNED_TREE_SELECTED_BYTES_JSON_CSV_PNG_AND_OPAQUE_PICKLE_REPLAY",
  artifactHash: report.artifactHash, sourceRoot: report.source.sourceRoot,
  sourceManifestHash: report.source.sourceManifestHash };
}

export function publishRacerOpenDrawerArtifact({ sourceDirectory, targetDirectory }) {
  if (existsSync(targetDirectory)) fail("ARTIFACT_NO_CLOBBER", targetDirectory);
  const report = buildRacerOpenDrawerReport(sourceDirectory);
  const verification = verifyRacerOpenDrawerReport(report, sourceDirectory);
  mkdirSync(targetDirectory, { recursive: false, mode: 0o700 });
  chmodSync(targetDirectory, 0o700);
  renameSync(sourceDirectory, path.join(targetDirectory, "source"));
  writePrivateOnce(path.join(targetDirectory, "racer-open-drawer-recovery.json"),
    canonicalBytes(report));
  const manifestBase = {
    schema: "outsider/racer-open-drawer-artifact-manifest/v1",
    reportSchema: RACER_REPORT_SCHEMA,
    report: { path: "racer-open-drawer-recovery.json",
      bytes: canonicalBytes(report).length, sha256: racerSha256(canonicalBytes(report)) },
    artifactHash: report.artifactHash,
    sourceRoot: verification.sourceRoot,
    sourceManifestHash: verification.sourceManifestHash,
    admission: report.admission, boundary: report.boundary,
    verification,
  };
  const manifest = { ...manifestBase,
    manifestHash: racerDigest(manifestBase,
      "outsider/racer-open-drawer-artifact-manifest/v1") };
  writePrivateOnce(path.join(targetDirectory, "artifact-manifest.json"),
    canonicalBytes(manifest));
  return { report, manifest, verification };
}
