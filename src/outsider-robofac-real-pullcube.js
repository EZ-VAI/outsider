/*
 * Bounded RoboFAC real-robot failure/outcome intake.
 *
 * The selected physical source unit is the complete publisher-native
 * `realworld_data/so100_pull_cube_error` task directory: every published
 * episode, both camera views, and no random shard.  The complete seven-file
 * `test_qa_realworld` group is retained to close the publisher annotation
 * denominator.  Correction text is an instruction annotation, not evidence
 * that a correction was executed or that a recovery succeeded.  Raw videos
 * and QA text stay private and are never projected into the report.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "./canonical-historical-replay.js";

export const ROBOFAC_DATASET_ID = "MINT-SJTU/RoboFAC-dataset";
export const ROBOFAC_DATASET_REVISION = "d18353ab36db82ff888ebc9e8485c9fa77e1b25b";
export const ROBOFAC_CODE_REPOSITORY = "MINT-SJTU/RoboFAC";
export const ROBOFAC_CODE_COMMIT = "638eb5320d409e4072710a0db26f1c0d68cef3de";
export const ROBOFAC_CODE_TREE = "cbd62628ae16f8fd275c500ce44d35a33a01f124";
export const ROBOFAC_ARXIV_ID = "2505.12224";
export const ROBOFAC_ARXIV_VERSION = "v4";
export const ROBOFAC_TASK_PREFIX = "realworld_data/so100_pull_cube_error/";
export const ROBOFAC_QA_PREFIX = "test_qa_realworld/";
export const ROBOFAC_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const ROBOFAC_SOURCE_SCHEMA = "outsider/robofac-real-pullcube-source/v1";
export const ROBOFAC_REPORT_SCHEMA = "outsider/robofac-real-pullcube/v1";
export const ROBOFAC_RECEIPT_SCHEMA = "outsider/robofac-real-pullcube-receipt/v1";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${ROBOFAC_DATASET_ID}`;
const HF_TREE_PATH = `/api/datasets/${ROBOFAC_DATASET_ID}/tree/${ROBOFAC_DATASET_REVISION}`;
const HF_RAW = `${HF_ORIGIN}/datasets/${ROBOFAC_DATASET_ID}/resolve/${ROBOFAC_DATASET_REVISION}`;
const GITHUB_API = `https://api.github.com/repos/${ROBOFAC_CODE_REPOSITORY}`;
const GITHUB_COMMIT_URL = `${GITHUB_API}/commits/${ROBOFAC_CODE_COMMIT}`;
const GITHUB_TREE_URL = `${GITHUB_API}/git/trees/${ROBOFAC_CODE_TREE}?recursive=1`;
const GITHUB_RAW = `https://raw.githubusercontent.com/${ROBOFAC_CODE_REPOSITORY}/${ROBOFAC_CODE_COMMIT}`;
const PROJECT_URL = "https://mint-sjtu.github.io/RoboFAC.io/";
const ARXIV_ATOM_URL = `https://export.arxiv.org/api/query?id_list=${ROBOFAC_ARXIV_ID}`;
const ARXIV_ABS_URL = `https://arxiv.org/abs/${ROBOFAC_ARXIV_ID}${ROBOFAC_ARXIV_VERSION}`;
const ZENODO_SEARCH_URL = "https://zenodo.org/api/records?q=RoboFAC&size=25";

const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const MAX_API_BYTES = 4 * 1024 * 1024;
const MAX_SUPPORT_BYTES = 2 * 1024 * 1024;
const MAX_TREE_PAGES = 20;
const FETCH_TIMEOUT_MS = 180_000;
const DOWNLOAD_CONCURRENCY = 6;
const MAX_SELECTED_BYTES = 300_000_000;

const EXPECTED = Object.freeze({
  repositoryUsedStorage: 25_800_271_397,
  repositoryFiles: 12_739,
  repositoryEntries: 13_563,
  repositoryDirectories: 824,
  repositoryBytes: 25_771_018_505,
  treePages: 14,
  treeSnapshotHash:
    "sha256:c693f974660a63138c93b8d9f45d8cb96899626d7aae6011aa0c6357bd7afac8",
  selectedFiles: 175,
  selectedBytes: 270_620_557,
  taskTreeOid: "edb421f54130840bc255dbed3b9a41f522fc625c",
  taskFiles: 165,
  taskBytes: 265_835_244,
  taskVideos: 164,
  qaTreeOid: "904586625148dd690e9079f000d3220839f9c378",
  qaFiles: 7,
  qaBytes: 4_777_345,
  qaViewRows: 1_204,
  qaExecutionRoots: 602,
  qaPairs: 7_848,
  selectedViewRows: 164,
  selectedExecutionRoots: 82,
  selectedFailedExecutions: 60,
  selectedSuccessfulExecutions: 22,
  selectedHighLevelCorrectionExecutions: 60,
  selectedLowLevelCorrectionExecutions: 18,
  qaAssistantArrayValueRows: 16,
  qaPerFile: Object.freeze([
    Object.freeze({ path: "test_qa_realworld/annos_per_video_split0.json",
      viewRows: 172, qaPairs: 1_284 }),
    Object.freeze({ path: "test_qa_realworld/annos_per_video_split1.json",
      viewRows: 172, qaPairs: 1_108 }),
    Object.freeze({ path: "test_qa_realworld/annos_per_video_split2.json",
      viewRows: 172, qaPairs: 1_100 }),
    Object.freeze({ path: "test_qa_realworld/annos_per_video_split3.json",
      viewRows: 172, qaPairs: 1_212 }),
    Object.freeze({ path: "test_qa_realworld/annos_per_video_split4.json",
      viewRows: 172, qaPairs: 1_032 }),
    Object.freeze({ path: "test_qa_realworld/annos_per_video_split5.json",
      viewRows: 172, qaPairs: 1_036 }),
    Object.freeze({ path: "test_qa_realworld/annos_per_video_split6.json",
      viewRows: 172, qaPairs: 1_076 }),
  ]),
  codeEntries: 139,
  codeFiles: 126,
  codeDirectories: 13,
  codeBytes: 3_557_336,
  codeReadmeSha256:
    "sha256:4230342fa93f8f203bd586a415496d2ccdf32c886def19b9e20802958e45d13d",
  codeLicenseSha256:
    "sha256:6723985aaf2a0c57f47d9bbb58adb3504068cf3776b4d57ba831b902c9c4e4c5",
});

const ROOT_SUPPORT = Object.freeze([".gitattributes", ".gitignore", "README.md"]);
const QA_CATEGORIES = Object.freeze([
  "Task identification", "Task planning", "Failure detection",
  "Failure identification", "Failure locating", "Failure explanation",
  "High-level correction", "Low-level correction",
]);
const TASK_FOLDER_TO_NAME = Object.freeze({
  so100_insert_cylinder_error: "InsertCylinder",
  so100_pick_cube_in_box_error: "PickCubeInBox",
  so100_pull_cube_by_tool_error: "PullCubeByTool",
  so100_pull_cube_error: "PullCube",
  so100_push_cube_error: "PushCube",
  so100_stack_cube_error: "StackCube",
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `ROBOFAC_${code}` : `ROBOFAC_${code}:${detail}`);
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

export function roboFacSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function roboFacDigest(value, domain = ROBOFAC_REPORT_SCHEMA) {
  return roboFacSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes).digest("hex");
}

function safeRelative(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 4096
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function safeJoin(root, relative) {
  if (!safeRelative(relative)) fail("LOCAL_PATH_INVALID", String(relative));
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, ...relative.split("/"));
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) fail("LOCAL_PATH_ESCAPE", relative);
  return resolved;
}

function encodedPath(value) {
  if (!safeRelative(value)) fail("REMOTE_PATH_INVALID", String(value));
  return value.split("/").map(encodeURIComponent).join("/");
}

function selectedPath(value) {
  return ROOT_SUPPORT.includes(value) || value.startsWith(ROBOFAC_TASK_PREFIX)
    || value.startsWith(ROBOFAC_QA_PREFIX);
}

function allowedUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username !== "" || url.password !== "") return false;
    return url.hostname === "huggingface.co" || url.hostname.endsWith(".huggingface.co")
      || url.hostname.endsWith(".hf.co") || url.hostname.endsWith(".xethub.hf.co")
      || url.hostname === "api.github.com" || url.hostname === "raw.githubusercontent.com"
      || url.hostname === "mint-sjtu.github.io" || url.hostname === "arxiv.org"
      || url.hostname === "export.arxiv.org" || url.hostname === "zenodo.org";
  } catch { return false; }
}

function retryable(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError"
    || error?.retryable === true
    || /(?:fetch failed|network|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN|socket)/iu
      .test(String(error?.message ?? error));
}

async function fetchOnce(url, maximumBytes, accept, fetchImpl) {
  if (!allowedUrl(url)) fail("FETCH_URL_REFUSED", url);
  let current = new URL(url);
  for (let redirects = 0; redirects <= 7; redirects += 1) {
    const response = await fetchImpl(current, {
      method: "GET", redirect: "manual",
      headers: { accept, "accept-encoding": "identity",
        "user-agent": "outsider-robofac-real-pullcube-quarantine/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.("location");
      if (!location || redirects === 7) fail("FETCH_REDIRECT_INVALID", url);
      const next = new URL(location, current);
      if (!allowedUrl(next.toString())) fail("FETCH_REDIRECT_REFUSED", next.toString());
      current = next;
      continue;
    }
    if (response.status !== 200 || !response.body) {
      const error = new Error(`HTTP_${response.status}:${url}`);
      error.retryable = response.status === 408 || response.status === 425
        || response.status === 429 || response.status >= 500;
      throw error;
    }
    const finalUrl = response.url || current.toString();
    if (!allowedUrl(finalUrl)) fail("FETCH_FINAL_URL_REFUSED", finalUrl);
    const declared = response.headers?.get?.("content-length");
    if (declared !== null && (!/^\d+$/u.test(declared)
      || Number(declared) > maximumBytes)) fail("FETCH_DECLARED_BYTES_INVALID", url);
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("bounded RoboFAC source limit exceeded");
        fail("FETCH_STREAM_BYTES_INVALID", url);
      }
      chunks.push(Buffer.from(value));
    }
    if (total < 1) fail("FETCH_EMPTY", url);
    return { bytes: Buffer.concat(chunks, total), finalUrl,
      contentType: response.headers?.get?.("content-type") ?? null,
      status: response.status, headers: response.headers };
  }
  fail("FETCH_REDIRECT_LIMIT", url);
}

async function boundedFetch(url, maximumBytes, accept, fetchImpl) {
  let last;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try { return await fetchOnce(url, maximumBytes, accept, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === 4) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
    }
  }
  throw last;
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

async function jsonFetch(url, fetchImpl, maximumBytes = MAX_API_BYTES) {
  const fetched = await boundedFetch(url, maximumBytes, "application/json", fetchImpl);
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
    || url.searchParams.get("limit") !== "1000" || !url.searchParams.get("cursor")) {
    fail("TREE_NEXT_LINK_REFUSED", url.toString());
  }
  return url.toString();
}

function normalizeTreePage(value) {
  if (!Array.isArray(value) || value.length < 1) fail("TREE_PAGE_INVALID");
  return value.map((entry) => {
    if (!plain(entry) || !safeRelative(entry.path)
      || !["file", "directory"].includes(entry.type)) fail("TREE_ENTRY_INVALID");
    if (!SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size)
      || entry.size < 0) fail("TREE_ENTRY_PROFILE_INVALID", entry.path);
    if (entry.type === "directory") {
      if (entry.size !== 0) fail("TREE_DIRECTORY_SIZE_INVALID", entry.path);
      return { path: entry.path, type: "directory", oid: entry.oid };
    }
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
  const snapshots = [];
  const seen = new Set();
  let next = `${HF_API}/tree/${ROBOFAC_DATASET_REVISION}?recursive=true&limit=1000`;
  for (let page = 1; next !== null; page += 1) {
    if (page > MAX_TREE_PAGES || seen.has(next)) fail("TREE_PAGINATION_INVALID");
    seen.add(next);
    const fetched = await jsonFetch(next, fetchImpl);
    entries.push(...normalizeTreePage(fetched.value));
    snapshots.push({ file: `control/hf/${phase}/tree-${String(page).padStart(3, "0")}.json`,
      requestUrl: next, finalUrl: fetched.finalUrl, bytes: fetched.bytes,
      status: fetched.status, contentType: fetched.contentType });
    next = parseNextTreeLink(fetched.headers?.get?.("link"));
  }
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) fail("TREE_DUPLICATE_PATH");
  return { entries: entries.sort((a, b) => a.path.localeCompare(b.path)), snapshots };
}

function repositoryProjection(value) {
  if (!plain(value) || value.id !== ROBOFAC_DATASET_ID
    || value.sha !== ROBOFAC_DATASET_REVISION || value.private !== false
    || value.gated !== false || value.disabled !== false
    || value.usedStorage !== EXPECTED.repositoryUsedStorage
    || value.cardData?.license !== "mit" || !Array.isArray(value.siblings)) {
    fail("REPOSITORY_PROFILE_INVALID");
  }
  const siblingPaths = sorted(value.siblings.map((entry) => entry?.rfilename));
  if (siblingPaths.length !== EXPECTED.repositoryFiles
    || siblingPaths.some((item) => !safeRelative(item))) fail("REPOSITORY_SIBLINGS_INVALID");
  return { id: value.id, sha: value.sha, lastModified: value.lastModified,
    private: false, gated: false, disabled: false, usedStorage: value.usedStorage,
    cardLicense: value.cardData.license, siblingPaths };
}

function treeProfile(entries, pages) {
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const bytes = files.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const filePaths = files.map((entry) => entry.path);
  const taskDirectory = directories.find((entry) => entry.path === ROBOFAC_TASK_PREFIX.slice(0, -1));
  const qaDirectory = directories.find((entry) => entry.path === ROBOFAC_QA_PREFIX.slice(0, -1));
  const task = files.filter((entry) => entry.path.startsWith(ROBOFAC_TASK_PREFIX));
  const qa = files.filter((entry) => entry.path.startsWith(ROBOFAC_QA_PREFIX));
  const selected = files.filter((entry) => selectedPath(entry.path));
  const videos = task.filter((entry) => entry.path.endsWith(".mp4"));
  const treeSnapshotHash = roboFacDigest(entries, `${ROBOFAC_SOURCE_SCHEMA}/tree`);
  if (files.length !== EXPECTED.repositoryFiles
    || taskDirectory?.oid !== EXPECTED.taskTreeOid || qaDirectory?.oid !== EXPECTED.qaTreeOid
    || task.length !== EXPECTED.taskFiles
    || task.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== EXPECTED.taskBytes
    || videos.length !== EXPECTED.taskVideos || qa.length !== EXPECTED.qaFiles
    || qa.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== EXPECTED.qaBytes
    || selected.length !== EXPECTED.selectedFiles
    || selected.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== EXPECTED.selectedBytes
    || selected.reduce((sum, entry) => sum + entry.sizeBytes, 0) > MAX_SELECTED_BYTES
    || filePaths.includes("LICENSE")) fail("TREE_PROFILE_INVALID");
  if (EXPECTED.repositoryEntries !== null && (entries.length !== EXPECTED.repositoryEntries
    || directories.length !== EXPECTED.repositoryDirectories || bytes !== EXPECTED.repositoryBytes
    || pages !== EXPECTED.treePages || treeSnapshotHash !== EXPECTED.treeSnapshotHash)) {
    fail("TREE_FROZEN_PROFILE_INVALID");
  }
  return { entries: entries.length, files: files.length, directories: directories.length,
    bytes, pages, treeSnapshotHash,
    selected: selected.sort((a, b) => a.path.localeCompare(b.path)),
    task: task.sort((a, b) => a.path.localeCompare(b.path)),
    qa: qa.sort((a, b) => a.path.localeCompare(b.path)),
    allRealworldVideos: files.filter((entry) =>
      /^realworld_data\/[^/]+\/videos\/chunk-000\/observation\.images\.(above|rightfront)\/episode_\d{6}\.mp4$/u
        .test(entry.path)).map((entry) => entry.path).sort(),
  };
}

function githubProjection(repository, commit, tree) {
  if (!plain(repository) || repository.full_name !== ROBOFAC_CODE_REPOSITORY
    || repository.private !== false || repository.archived !== false
    || repository.default_branch !== "main" || repository.license?.spdx_id !== "MIT"
    || !plain(commit) || commit.sha !== ROBOFAC_CODE_COMMIT
    || commit.commit?.tree?.sha !== ROBOFAC_CODE_TREE
    || !plain(tree) || tree.sha !== ROBOFAC_CODE_TREE || tree.truncated !== false
    || !Array.isArray(tree.tree)) fail("GITHUB_PROFILE_INVALID");
  const files = tree.tree.filter((entry) => entry.type === "blob");
  const directories = tree.tree.filter((entry) => entry.type === "tree");
  if (tree.tree.length !== EXPECTED.codeEntries || files.length !== EXPECTED.codeFiles
    || directories.length !== EXPECTED.codeDirectories
    || files.reduce((sum, entry) => sum + entry.size, 0) !== EXPECTED.codeBytes
    || files.find((entry) => entry.path === "README.md")?.sha
      !== "498c816a68b3bdf5f82e69f837a0fdddc4fd3461"
    || files.find((entry) => entry.path === "LICENSE")?.sha
      !== "8ddfacade0f8c040571313794dbc54d438aae9e1") fail("GITHUB_TREE_INVALID");
  return { repository: ROBOFAC_CODE_REPOSITORY, commit: ROBOFAC_CODE_COMMIT,
    tree: ROBOFAC_CODE_TREE, commitVerified: commit.commit?.verification?.verified === true,
    commitVerificationReason: commit.commit?.verification?.reason ?? null,
    rootLicense: "MIT", entries: tree.tree.length, files: files.length,
    directories: directories.length, bytes: files.reduce((sum, entry) => sum + entry.size, 0) };
}

function arxivProjection(atomBytes, absBytes) {
  const atom = atomBytes.toString("utf8").replace(/\s+/gu, " ");
  const html = absBytes.toString("utf8").replace(/\s+/gu, " ");
  const fragments = [
    `http://arxiv.org/abs/${ROBOFAC_ARXIV_ID}${ROBOFAC_ARXIV_VERSION}`,
    "RoboFAC: A Comprehensive Framework for Robotic Failure Analysis and Correction",
    "9,440 erroneous manipulation trajectories", "78,623 QA pairs",
    "2026-03-22T09:17:11Z",
  ];
  if (fragments.some((fragment) => !atom.includes(fragment))
    || !html.includes(`arXiv:${ROBOFAC_ARXIV_ID}${ROBOFAC_ARXIV_VERSION}`)
    || !html.includes("RoboFAC: A Comprehensive Framework for Robotic Failure Analysis and Correction")) {
    fail("ARXIV_PROFILE_INVALID");
  }
  return { id: ROBOFAC_ARXIV_ID, version: ROBOFAC_ARXIV_VERSION,
    updated: "2026-03-22T09:17:11Z", publisherErroneousTrajectoryClaim: 9_440,
    publisherQaPairClaim: 78_623 };
}

function projectProjection(bytes) {
  const text = bytes.toString("utf8");
  const fragments = ["RoboFAC: A Comprehensive Framework for Robotic Failure Analysis and Correction",
    "9,440", "78,623", "MINT-SJTU/RoboFAC", "MINT-SJTU/RoboFAC-dataset",
    "2505.12224"];
  if (fragments.some((fragment) => !text.includes(fragment))) fail("PROJECT_PAGE_INVALID");
  return { officialProjectPage: true, codeRepositoryLinked: true,
    datasetRepositoryLinked: true, arxivLinked: true };
}

function zenodoProjection(value) {
  if (!plain(value) || !plain(value.hits) || value.hits.total !== 0
    || !Array.isArray(value.hits.hits) || value.hits.hits.length !== 0) {
    fail("ZENODO_SEARCH_PROFILE_INVALID");
  }
  return { query: "RoboFAC", hits: 0, officialDepositEstablished: false };
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
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
    bytes: item.bytes.length, sha256: roboFacSha256(item.bytes), status: item.status,
    contentType: item.contentType };
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
      const requestUrl = `${HF_RAW}/${encodedPath(entry.path)}?download=true`;
      const fetched = await boundedFetch(requestUrl, Math.max(1, entry.sizeBytes),
        "application/octet-stream", fetchImpl);
      if (fetched.bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_MISMATCH", entry.path);
      const sha256 = roboFacSha256(fetched.bytes);
      if (entry.lfsSha256 !== null ? sha256 !== entry.lfsSha256
        : gitBlobOid(fetched.bytes) !== entry.oid) fail("OBJECT_HASH_MISMATCH", entry.path);
      writePrivateOnce(safeJoin(directory, `objects/${entry.path}`), fetched.bytes);
      results[index] = { path: entry.path, bytes: fetched.bytes.length, sha256,
        gitOid: entry.oid, lfsSha256: entry.lfsSha256, requestUrl,
        finalUrl: fetched.finalUrl, contentType: fetched.contentType };
    }
  }
  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, () => worker()));
  return results.sort((a, b) => a.path.localeCompare(b.path));
}

async function fixedSupport(fetchImpl) {
  const [repository, commit, tree, readme, license, atom, abs] = await Promise.all([
    jsonFetch(GITHUB_API, fetchImpl), jsonFetch(GITHUB_COMMIT_URL, fetchImpl),
    jsonFetch(GITHUB_TREE_URL, fetchImpl),
    boundedFetch(`${GITHUB_RAW}/README.md`, MAX_SUPPORT_BYTES, "text/plain", fetchImpl),
    boundedFetch(`${GITHUB_RAW}/LICENSE`, MAX_SUPPORT_BYTES, "text/plain", fetchImpl),
    boundedFetch(ARXIV_ATOM_URL, MAX_SUPPORT_BYTES, "application/atom+xml", fetchImpl),
    boundedFetch(ARXIV_ABS_URL, MAX_SUPPORT_BYTES, "text/html", fetchImpl),
  ]);
  const github = githubProjection(repository.value, commit.value, tree.value);
  if (roboFacSha256(readme.bytes) !== EXPECTED.codeReadmeSha256
    || roboFacSha256(license.bytes) !== EXPECTED.codeLicenseSha256
    || gitBlobOid(readme.bytes) !== "498c816a68b3bdf5f82e69f837a0fdddc4fd3461"
    || gitBlobOid(license.bytes) !== "8ddfacade0f8c040571313794dbc54d438aae9e1") {
    fail("GITHUB_ROOT_BYTES_INVALID");
  }
  const arxiv = arxivProjection(atom.bytes, abs.bytes);
  const snapshots = [
    ["control/github/repository.json", GITHUB_API, repository],
    ["control/github/commit.json", GITHUB_COMMIT_URL, commit],
    ["control/github/tree.json", GITHUB_TREE_URL, tree],
    ["control/github/README.md", `${GITHUB_RAW}/README.md`, readme],
    ["control/github/LICENSE", `${GITHUB_RAW}/LICENSE`, license],
    ["control/arxiv/atom.xml", ARXIV_ATOM_URL, atom],
    ["control/arxiv/abs-v4.html", ARXIV_ABS_URL, abs],
  ].map(([file, requestUrl, fetched]) => ({ file, requestUrl,
    finalUrl: fetched.finalUrl, bytes: fetched.bytes,
    status: fetched.status, contentType: fetched.contentType }));
  return { github, arxiv, snapshots };
}

export async function acquireRoboFacRealPullCubeSource({ directory, fetchImpl = fetch } = {}) {
  if (typeof directory !== "string" || directory.length < 1) fail("DIRECTORY_REQUIRED");
  if (existsSync(directory)) fail("NO_CLOBBER", directory);
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  chmodSync(directory, 0o700);

  const repositoryUrl = `${HF_API}/revision/${ROBOFAC_DATASET_REVISION}`;
  const [beforeRepository, beforeProject, beforeZenodo] = await Promise.all([
    jsonFetch(repositoryUrl, fetchImpl),
    boundedFetch(PROJECT_URL, MAX_SUPPORT_BYTES, "text/html", fetchImpl),
    jsonFetch(ZENODO_SEARCH_URL, fetchImpl),
  ]);
  const beforeRepositoryProjection = repositoryProjection(beforeRepository.value);
  const beforeProjectProjection = projectProjection(beforeProject.bytes);
  const beforeZenodoProjection = zenodoProjection(beforeZenodo.value);
  const beforeTree = await fetchFullTree(fetchImpl, "before");
  const beforeProfile = treeProfile(beforeTree.entries, beforeTree.snapshots.length);
  if (!same(beforeRepositoryProjection.siblingPaths,
    beforeTree.entries.filter((entry) => entry.type === "file").map((entry) => entry.path))) {
    fail("REPOSITORY_TREE_DISAGREE");
  }

  const support = await fixedSupport(fetchImpl);
  const sourceFiles = await downloadSelected(beforeProfile.selected, directory, fetchImpl);

  const [afterRepository, afterProject, afterZenodo] = await Promise.all([
    jsonFetch(repositoryUrl, fetchImpl),
    boundedFetch(PROJECT_URL, MAX_SUPPORT_BYTES, "text/html", fetchImpl),
    jsonFetch(ZENODO_SEARCH_URL, fetchImpl),
  ]);
  const afterTree = await fetchFullTree(fetchImpl, "after");
  const afterProfile = treeProfile(afterTree.entries, afterTree.snapshots.length);
  if (!same(beforeRepositoryProjection, repositoryProjection(afterRepository.value))
    || !same(beforeTree.entries, afterTree.entries)
    || !same(beforeProjectProjection, projectProjection(afterProject.bytes))
    || !same(beforeZenodoProjection, zenodoProjection(afterZenodo.value))
    || !same(beforeProfile, afterProfile)) fail("SOURCE_DRIFT");

  const control = [
    { file: "control/hf/before/repository.json", requestUrl: repositoryUrl,
      finalUrl: beforeRepository.finalUrl, bytes: beforeRepository.bytes,
      status: beforeRepository.status, contentType: beforeRepository.contentType },
    ...beforeTree.snapshots,
    { file: "control/project/before.html", requestUrl: PROJECT_URL,
      finalUrl: beforeProject.finalUrl, bytes: beforeProject.bytes,
      status: beforeProject.status, contentType: beforeProject.contentType },
    { file: "control/zenodo/before.json", requestUrl: ZENODO_SEARCH_URL,
      finalUrl: beforeZenodo.finalUrl, bytes: beforeZenodo.bytes,
      status: beforeZenodo.status, contentType: beforeZenodo.contentType },
    ...support.snapshots,
    { file: "control/hf/after/repository.json", requestUrl: repositoryUrl,
      finalUrl: afterRepository.finalUrl, bytes: afterRepository.bytes,
      status: afterRepository.status, contentType: afterRepository.contentType },
    ...afterTree.snapshots,
    { file: "control/project/after.html", requestUrl: PROJECT_URL,
      finalUrl: afterProject.finalUrl, bytes: afterProject.bytes,
      status: afterProject.status, contentType: afterProject.contentType },
    { file: "control/zenodo/after.json", requestUrl: ZENODO_SEARCH_URL,
      finalUrl: afterZenodo.finalUrl, bytes: afterZenodo.bytes,
      status: afterZenodo.status, contentType: afterZenodo.contentType },
  ];
  for (const item of control) writePrivateOnce(safeJoin(directory, item.file), item.bytes);

  const sourceRoot = roboFacDigest(sourceFiles.map(({ path: sourcePath, bytes, sha256,
    gitOid, lfsSha256 }) => ({ path: sourcePath, bytes, sha256, gitOid, lfsSha256 })),
  `${ROBOFAC_SOURCE_SCHEMA}/objects`);
  const manifestBase = {
    schema: ROBOFAC_SOURCE_SCHEMA, frozenAt: ROBOFAC_FROZEN_AT,
    dataset: { id: ROBOFAC_DATASET_ID, revision: ROBOFAC_DATASET_REVISION,
      public: true, gated: false, disabled: false, publisherLicenseClaim: "MIT" },
    producer: support.github, paper: support.arxiv,
    project: beforeProjectProjection, zenodo: beforeZenodoProjection,
    repository: { usedStorage: EXPECTED.repositoryUsedStorage,
      completeTreePinned: true, entries: beforeProfile.entries,
      files: beforeProfile.files, directories: beforeProfile.directories,
      bytes: beforeProfile.bytes, pages: beforeProfile.pages,
      treeSnapshotHash: beforeProfile.treeSnapshotHash },
    selection: { kind: "COMPLETE_PUBLISHER_REAL_TASK_AND_COMPLETE_REAL_QA_GROUP",
      taskPrefix: ROBOFAC_TASK_PREFIX, qaPrefix: ROBOFAC_QA_PREFIX,
      randomShardSelection: false, maximumBytes: MAX_SELECTED_BYTES,
      files: EXPECTED.selectedFiles, bytes: EXPECTED.selectedBytes,
      taskFiles: EXPECTED.taskFiles, taskBytes: EXPECTED.taskBytes,
      qaFiles: EXPECTED.qaFiles, qaBytes: EXPECTED.qaBytes },
    sourceFiles,
    controlSnapshots: control.map(snapshotRecord).sort((a, b) => a.file.localeCompare(b.file)),
    sourceRoot,
  };
  const manifestHash = roboFacDigest(manifestBase, `${ROBOFAC_SOURCE_SCHEMA}/manifest`);
  const manifest = { ...manifestBase, manifestHash };
  writePrivateOnce(path.join(directory, "acquisition-manifest.json"), canonicalBytes(manifest));
  verifyRoboFacRealPullCubeSource(directory);
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

function parseStoredTreePages(directory, phase, pages) {
  const entries = [];
  for (let page = 1; page <= pages; page += 1) {
    const relative = `control/hf/${phase}/tree-${String(page).padStart(3, "0")}.json`;
    entries.push(...normalizeTreePage(parseJson(stableRead(safeJoin(directory, relative)), relative)));
  }
  const paths = entries.map((entry) => entry.path);
  if (new Set(paths).size !== paths.length) fail("STORED_TREE_DUPLICATE");
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

export function verifyRoboFacRealPullCubeSource(directory) {
  const manifest = parseJson(stableRead(path.join(directory, "acquisition-manifest.json")),
    "acquisition-manifest");
  if (!plain(manifest) || manifest.schema !== ROBOFAC_SOURCE_SCHEMA
    || manifest.frozenAt !== ROBOFAC_FROZEN_AT || !HASH.test(manifest.sourceRoot ?? "")
    || !HASH.test(manifest.manifestHash ?? "") || !Number.isSafeInteger(manifest.repository?.pages)) {
    fail("MANIFEST_INVALID");
  }
  const { manifestHash, ...manifestBase } = manifest;
  if (roboFacDigest(manifestBase, `${ROBOFAC_SOURCE_SCHEMA}/manifest`) !== manifestHash) {
    fail("MANIFEST_HASH_INVALID");
  }
  const beforeRepository = repositoryProjection(parseJson(stableRead(safeJoin(directory,
    "control/hf/before/repository.json")), "before-repository"));
  const afterRepository = repositoryProjection(parseJson(stableRead(safeJoin(directory,
    "control/hf/after/repository.json")), "after-repository"));
  const beforeTree = parseStoredTreePages(directory, "before", manifest.repository.pages);
  const afterTree = parseStoredTreePages(directory, "after", manifest.repository.pages);
  const beforeProfile = treeProfile(beforeTree, manifest.repository.pages);
  treeProfile(afterTree, manifest.repository.pages);
  if (!same(beforeRepository, afterRepository) || !same(beforeTree, afterTree)
    || !same(beforeRepository.siblingPaths,
      beforeTree.filter((entry) => entry.type === "file").map((entry) => entry.path))) {
    fail("STORED_SOURCE_DRIFT");
  }
  const githubRepository = parseJson(stableRead(safeJoin(directory,
    "control/github/repository.json")), "github-repository");
  const githubCommit = parseJson(stableRead(safeJoin(directory,
    "control/github/commit.json")), "github-commit");
  const githubTree = parseJson(stableRead(safeJoin(directory,
    "control/github/tree.json")), "github-tree");
  const github = githubProjection(githubRepository, githubCommit, githubTree);
  const codeReadme = stableRead(safeJoin(directory, "control/github/README.md"));
  const codeLicense = stableRead(safeJoin(directory, "control/github/LICENSE"));
  if (roboFacSha256(codeReadme) !== EXPECTED.codeReadmeSha256
    || roboFacSha256(codeLicense) !== EXPECTED.codeLicenseSha256) fail("GITHUB_BYTES_INVALID");
  const arxiv = arxivProjection(stableRead(safeJoin(directory, "control/arxiv/atom.xml")),
    stableRead(safeJoin(directory, "control/arxiv/abs-v4.html")));
  const projectBefore = projectProjection(stableRead(safeJoin(directory,
    "control/project/before.html")));
  const projectAfter = projectProjection(stableRead(safeJoin(directory,
    "control/project/after.html")));
  const zenodoBefore = zenodoProjection(parseJson(stableRead(safeJoin(directory,
    "control/zenodo/before.json")), "zenodo-before"));
  const zenodoAfter = zenodoProjection(parseJson(stableRead(safeJoin(directory,
    "control/zenodo/after.json")), "zenodo-after"));
  if (!same(projectBefore, projectAfter) || !same(zenodoBefore, zenodoAfter)
    || !same(github, manifest.producer) || !same(arxiv, manifest.paper)) {
    fail("PRODUCER_SOURCE_DRIFT");
  }

  const expectedFiles = new Set(["acquisition-manifest.json",
    ...manifest.controlSnapshots.map((item) => item.file),
    ...beforeProfile.selected.map((item) => `objects/${item.path}`)]);
  const layout = walk(directory);
  if (!same(sorted(layout.files), sorted(expectedFiles))) fail("SOURCE_LAYOUT_INVALID");
  const expectedDirectories = new Set();
  for (const file of expectedFiles) {
    const parts = file.split("/").slice(0, -1);
    for (let length = 1; length <= parts.length; length += 1) {
      expectedDirectories.add(parts.slice(0, length).join("/"));
    }
  }
  if (!same(sorted(layout.directories), sorted(expectedDirectories))) {
    fail("SOURCE_DIRECTORY_LAYOUT_INVALID");
  }
  for (const item of manifest.controlSnapshots) {
    const bytes = stableRead(safeJoin(directory, item.file));
    if (bytes.length !== item.bytes || roboFacSha256(bytes) !== item.sha256) {
      fail("CONTROL_BYTES_INVALID", item.file);
    }
  }
  const expectedSource = beforeProfile.selected.map((entry) => {
    const bytes = stableRead(safeJoin(directory, `objects/${entry.path}`));
    const sha256 = roboFacSha256(bytes);
    if (bytes.length !== entry.sizeBytes || (entry.lfsSha256 !== null
      ? sha256 !== entry.lfsSha256 : gitBlobOid(bytes) !== entry.oid)) {
      fail("SOURCE_OBJECT_INVALID", entry.path);
    }
    return { path: entry.path, bytes: bytes.length, sha256, gitOid: entry.oid,
      lfsSha256: entry.lfsSha256 };
  });
  const manifestProjection = manifest.sourceFiles.map(({ path: sourcePath, bytes, sha256,
    gitOid, lfsSha256 }) => ({ path: sourcePath, bytes, sha256, gitOid, lfsSha256 }));
  if (!same(expectedSource, manifestProjection)) fail("SOURCE_MANIFEST_OBJECTS_INVALID");
  const sourceRoot = roboFacDigest(expectedSource, `${ROBOFAC_SOURCE_SCHEMA}/objects`);
  if (sourceRoot !== manifest.sourceRoot
    || beforeProfile.treeSnapshotHash !== manifest.repository.treeSnapshotHash
    || !same({ entries: beforeProfile.entries, files: beforeProfile.files,
      directories: beforeProfile.directories, bytes: beforeProfile.bytes,
      pages: beforeProfile.pages }, { entries: manifest.repository.entries,
      files: manifest.repository.files, directories: manifest.repository.directories,
      bytes: manifest.repository.bytes, pages: manifest.repository.pages })) {
    fail("SOURCE_ROOT_INVALID");
  }
  return { ok: true, sourceRoot, manifestHash, manifest,
    treeSnapshotHash: beforeProfile.treeSnapshotHash, profile: beforeProfile,
    selectedFiles: expectedSource.length,
    selectedBytes: expectedSource.reduce((sum, item) => sum + item.bytes, 0) };
}

function inspectMp4(bytes, objectPath) {
  if (bytes.length < 16) fail("MP4_TOO_SHORT", objectPath);
  const boxes = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (bytes.length - offset < 8) fail("MP4_BOX_TRUNCATED", objectPath);
    const size32 = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (!/^[\x20-\x7e]{4}$/u.test(type)) fail("MP4_BOX_TYPE_INVALID", objectPath);
    let header = 8;
    let size = size32;
    if (size32 === 1) {
      if (bytes.length - offset < 16) fail("MP4_EXTENDED_BOX_TRUNCATED", objectPath);
      const extended = bytes.readBigUInt64BE(offset + 8);
      if (extended > BigInt(Number.MAX_SAFE_INTEGER)) fail("MP4_BOX_TOO_LARGE", objectPath);
      size = Number(extended);
      header = 16;
    } else if (size32 === 0) size = bytes.length - offset;
    if (size < header || offset + size > bytes.length) fail("MP4_BOX_SIZE_INVALID", objectPath);
    boxes.push({ type, bytes: size });
    offset += size;
  }
  const types = boxes.map((box) => box.type);
  if (offset !== bytes.length || !types.includes("ftyp") || !types.includes("moov")
    || !types.includes("mdat")) fail("MP4_CONTAINER_PROFILE_INVALID", objectPath);
  return { boxes: boxes.length,
    types: Object.fromEntries([...new Set(types)].sort().map((type) =>
      [type, types.filter((item) => item === type).length])) };
}

function qaReplay(directory, profile) {
  const qaFiles = profile.qa.map((entry) => entry.path);
  const ids = new Set();
  const videos = new Set();
  const episodes = new Map();
  const perFile = [];
  const categoryCounts = Object.fromEntries(QA_CATEGORIES.map((item) =>
    [item, { viewRows: 0, qaPairs: 0 }]));
  const taskViewRows = {};
  let qaPairs = 0;
  let assistantArrayValueRows = 0;
  for (const qaPath of qaFiles) {
    const value = parseJson(stableRead(safeJoin(directory, `objects/${qaPath}`)), qaPath);
    if (!plain(value)) fail("QA_FILE_INVALID", qaPath);
    let fileRows = 0;
    let filePairs = 0;
    for (const [id, row] of Object.entries(value)) {
      if (!UUID.test(id) || ids.has(id) || !plain(row) || typeof row.video !== "string"
        || videos.has(row.video) || typeof row.task !== "string" || !plain(row.annos)) {
        fail("QA_ROW_INVALID", id);
      }
      const match = /^([^/]+)\/videos\/chunk-000\/observation\.images\.(above|rightfront)\/(episode_\d{6})\.mp4$/u
        .exec(row.video);
      if (!match || TASK_FOLDER_TO_NAME[match[1]] !== row.task) fail("QA_VIDEO_PATH_INVALID", id);
      ids.add(id);
      videos.add(row.video);
      fileRows += 1;
      taskViewRows[row.task] = (taskViewRows[row.task] ?? 0) + 1;
      const episodeKey = `${match[1]}/${match[3]}`;
      const episode = episodes.get(episodeKey) ?? { folder: match[1], task: row.task,
        episode: match[3], views: new Set(), outcomes: new Set(), high: 0, low: 0 };
      if (episode.views.has(match[2])) fail("QA_EPISODE_VIEW_DUPLICATE", episodeKey);
      episode.views.add(match[2]);
      for (const [category, conversation] of Object.entries(row.annos)) {
        const assistantValue = conversation?.[1]?.value;
        const assistantValueValid = typeof assistantValue === "string"
          || category === "High-level correction" && Array.isArray(assistantValue)
            && assistantValue.length > 0
            && assistantValue.every((item) => typeof item === "string");
        if (!QA_CATEGORIES.includes(category) || !Array.isArray(conversation)
          || conversation.length !== 2 || conversation[0]?.from !== "human"
          || typeof conversation[0]?.value !== "string"
          || conversation[1]?.from !== "assistant" || !assistantValueValid) {
          fail("QA_CONVERSATION_INVALID", id);
        }
        if (Array.isArray(assistantValue)) assistantArrayValueRows += 1;
        categoryCounts[category].viewRows += 1;
        categoryCounts[category].qaPairs += 1;
        filePairs += 1;
        qaPairs += 1;
      }
      const outcome = row.annos["Failure detection"]?.[1]?.value;
      if (!["No.", "Yes."].includes(outcome)) fail("QA_OUTCOME_LABEL_INVALID", id);
      episode.outcomes.add(outcome);
      episode.high += row.annos["High-level correction"] === undefined ? 0 : 1;
      episode.low += row.annos["Low-level correction"] === undefined ? 0 : 1;
      episodes.set(episodeKey, episode);
    }
    perFile.push({ path: qaPath, viewRows: fileRows, qaPairs: filePairs });
  }
  for (const episode of episodes.values()) {
    if (!same(sorted(episode.views), ["above", "rightfront"]) || episode.outcomes.size !== 1
      || ![0, 2].includes(episode.high) || ![0, 2].includes(episode.low)) {
      fail("QA_EPISODE_CORRELATION_INVALID", `${episode.folder}/${episode.episode}`);
    }
  }
  const treeVideos = profile.allRealworldVideos.map((item) => item.slice("realworld_data/".length));
  const expectedCategoryCounts = {
    "Failure detection": { viewRows: 1_204, qaPairs: 1_204 },
    "Failure explanation": { viewRows: 960, qaPairs: 960 },
    "Failure identification": { viewRows: 960, qaPairs: 960 },
    "Failure locating": { viewRows: 960, qaPairs: 960 },
    "High-level correction": { viewRows: 960, qaPairs: 960 },
    "Low-level correction": { viewRows: 396, qaPairs: 396 },
    "Task identification": { viewRows: 1_204, qaPairs: 1_204 },
    "Task planning": { viewRows: 1_204, qaPairs: 1_204 },
  };
  const expectedTaskViewRows = { InsertCylinder: 240, PickCubeInBox: 160,
    PullCube: 164, PullCubeByTool: 320, PushCube: 160, StackCube: 160 };
  const sortedCategoryCounts = Object.fromEntries(Object.entries(categoryCounts)
    .sort(([left], [right]) => left.localeCompare(right)));
  if (!same(sorted(videos), treeVideos) || ids.size !== EXPECTED.qaViewRows
    || episodes.size !== EXPECTED.qaExecutionRoots || qaPairs !== EXPECTED.qaPairs
    || assistantArrayValueRows !== EXPECTED.qaAssistantArrayValueRows
    || !same(perFile, EXPECTED.qaPerFile) || !same(taskViewRows, expectedTaskViewRows)
    || !same(sortedCategoryCounts, expectedCategoryCounts)) {
    fail("QA_DENOMINATOR_INVALID");
  }
  const selected = [...episodes.values()].filter((episode) => episode.task === "PullCube");
  const selectedFailures = selected.filter((episode) => [...episode.outcomes][0] === "No.");
  const selectedSuccesses = selected.filter((episode) => [...episode.outcomes][0] === "Yes.");
  const selectedHigh = selected.filter((episode) => episode.high === 2);
  const selectedLow = selected.filter((episode) => episode.low === 2);
  if (selected.length !== EXPECTED.selectedExecutionRoots
    || selectedFailures.length !== EXPECTED.selectedFailedExecutions
    || selectedSuccesses.length !== EXPECTED.selectedSuccessfulExecutions
    || selectedHigh.length !== EXPECTED.selectedHighLevelCorrectionExecutions
    || selectedLow.length !== EXPECTED.selectedLowLevelCorrectionExecutions
    || (taskViewRows.PullCube ?? 0) !== EXPECTED.selectedViewRows) fail("QA_SELECTED_INVALID");
  return { files: qaFiles.length, viewRows: ids.size, executionCorrelationRoots: episodes.size,
    qaPairs, perFile, taskViewRows,
    categories: sortedCategoryCounts, assistantArrayValueRows,
    selected: { task: "PullCube", viewRows: taskViewRows.PullCube,
      executionCorrelationRoots: selected.length, publisherFailedExecutions: selectedFailures.length,
      publisherSuccessfulReferenceExecutions: selectedSuccesses.length,
      publisherHighLevelCorrectionInstructionExecutions: selectedHigh.length,
      publisherLowLevelCorrectionInstructionExecutions: selectedLow.length,
      cameraViewsPerExecution: 2, cameraViews: ["above", "rightfront"],
      outcomeViewDisagreements: 0 },
    rawTextProjected: false, rawIdentifiersProjected: false, rawVideoPathsProjected: false };
}

export function replayRoboFacRealPullCubeSource(directory) {
  const verified = verifyRoboFacRealPullCubeSource(directory);
  const card = stableRead(safeJoin(directory, "objects/README.md")).toString("utf8");
  const cardFragments = ["license: mit", "9,440", "78,623", "1,282",
    "simulated", "real-world", "training_qa.json"];
  if (cardFragments.some((fragment) => !card.includes(fragment))) fail("DATASET_CARD_INVALID");
  const qa = qaReplay(directory, verified.profile);
  const videos = verified.profile.task.filter((entry) => entry.path.endsWith(".mp4"));
  const profiles = new Map();
  const episodeViews = new Map();
  let videoBytes = 0;
  for (const entry of videos) {
    const bytes = stableRead(safeJoin(directory, `objects/${entry.path}`));
    videoBytes += bytes.length;
    const mp4 = inspectMp4(bytes, entry.path);
    const key = canonicalizeStrict(mp4);
    profiles.set(key, { ...mp4, files: (profiles.get(key)?.files ?? 0) + 1 });
    const match = /observation\.images\.(above|rightfront)\/(episode_\d{6})\.mp4$/u.exec(entry.path);
    if (!match) fail("VIDEO_PATH_INVALID", entry.path);
    const views = episodeViews.get(match[2]) ?? new Set();
    if (views.has(match[1])) fail("VIDEO_VIEW_DUPLICATE", entry.path);
    views.add(match[1]);
    episodeViews.set(match[2], views);
  }
  if (videos.length !== EXPECTED.taskVideos || episodeViews.size !== EXPECTED.selectedExecutionRoots
    || [...episodeViews.values()].some((views) => !same(sorted(views), ["above", "rightfront"]))) {
    fail("VIDEO_DENOMINATOR_INVALID");
  }
  const selectedQaVideoPaths = new Set();
  for (const qaPath of verified.profile.qa.map((entry) => entry.path)) {
    const value = parseJson(stableRead(safeJoin(directory, `objects/${qaPath}`)), qaPath);
    for (const row of Object.values(value)) {
      if (row.task === "PullCube") selectedQaVideoPaths.add(`realworld_data/${row.video}`);
    }
  }
  if (!same(sorted(selectedQaVideoPaths), videos.map((entry) => entry.path))) {
    fail("VIDEO_QA_CLOSURE_INVALID");
  }
  return { verified, qa, video: { files: videos.length, bytes: videoBytes,
    executionCorrelationRoots: episodeViews.size, viewsPerExecution: 2,
    views: ["above", "rightfront"],
    containerProfiles: [...profiles.values()].sort((left, right) =>
      canonicalizeStrict(left).localeCompare(canonicalizeStrict(right))),
    pixelsInterpreted: false, audioInterpreted: false },
  selectedTaskHasKinematicsFiles: verified.profile.task.some((entry) =>
    entry.path.endsWith(".h5") || entry.path.endsWith(".json")) };
}

function reportBase(replay) {
  return {
    schema: ROBOFAC_REPORT_SCHEMA, frozenAt: ROBOFAC_FROZEN_AT,
    status: "PINNED_COMPLETE_BOUNDED_REAL_ROBOT_FAILURE_OUTCOME_GROUP",
    admission: "PRIVATE_EVALUATION_QUARANTINE_ONLY",
    source: { datasetId: ROBOFAC_DATASET_ID, revision: ROBOFAC_DATASET_REVISION,
      codeRepository: ROBOFAC_CODE_REPOSITORY, codeCommit: ROBOFAC_CODE_COMMIT,
      codeTree: ROBOFAC_CODE_TREE, arxivId: ROBOFAC_ARXIV_ID,
      arxivVersion: ROBOFAC_ARXIV_VERSION,
      sourceRoot: replay.verified.sourceRoot,
      sourceManifestHash: replay.verified.manifestHash,
      completeRepositoryTreePinned: true, completeSelectedBytesReplayed: true,
      zenodoExactNameQueryHits: 0 },
    repositoryInventory: { files: replay.verified.profile.files,
      directories: replay.verified.profile.directories,
      entries: replay.verified.profile.entries, bytes: replay.verified.profile.bytes,
      pages: replay.verified.profile.pages,
      usedStorage: EXPECTED.repositoryUsedStorage,
      treeSnapshotHash: replay.verified.treeSnapshotHash,
      publisherCardErroneousTrajectoryClaim: 9_440,
      publisherCardSuccessfulReferenceClaim: 1_282,
      publisherCardQaPairClaim: 78_623,
      wholeClaimedCorpusRowsReplayed: false },
    selection: { class: "REAL_SO100_PULLCUBE_COMPLETE_PUBLISHED_TASK_DIRECTORY",
      taskPrefix: ROBOFAC_TASK_PREFIX, qaPrefix: ROBOFAC_QA_PREFIX,
      randomShardSelection: false, below300MB: EXPECTED.selectedBytes <= MAX_SELECTED_BYTES,
      selectedFiles: EXPECTED.selectedFiles, selectedBytes: EXPECTED.selectedBytes,
      taskFiles: EXPECTED.taskFiles, taskBytes: EXPECTED.taskBytes,
      qaFiles: EXPECTED.qaFiles, qaBytes: EXPECTED.qaBytes,
      completePublishedTaskObjectCensus: true,
      completePublishedRealworldQaGroup: true },
    replay: { qa: replay.qa, video: replay.video,
      selectedTaskHasKinematicsFiles: replay.selectedTaskHasKinematicsFiles,
      rawQaTextProjected: false, rawVisualsProjected: false },
    outcomesAndRecovery: {
      selectedPublishedExecutions: EXPECTED.selectedExecutionRoots,
      publisherFailureLabels: EXPECTED.selectedFailedExecutions,
      publisherSuccessReferenceLabels: EXPECTED.selectedSuccessfulExecutions,
      publisherHighLevelCorrectionInstructionAnnotations:
        EXPECTED.selectedHighLevelCorrectionExecutions,
      publisherLowLevelCorrectionInstructionAnnotations:
        EXPECTED.selectedLowLevelCorrectionExecutions,
      correctionInstructionsExecuted: 0, linkedPostCorrectionExecutions: 0,
      recoveryAttemptUnits: 0, recoveryOutcomeUnits: 0,
      independentOutcomeUnits: 0, independentWitnessUnits: 0,
      longitudinalOutcomeUnits: 0,
    },
    selectionAndCensus: {
      completePublishedSelectedDirectoryCensus: true,
      completePublishedQaAnnotationCensus: true,
      completeCollectionAttemptCensus: false,
      acquisitionOrInclusionProtocolAvailable: false,
      excludedOrUnpublishedAttemptCount: null,
      viewRowsAreNotIndependentAttempts: true,
      twoCameraViewsShareOneExecutionCorrelationRoot: true,
    },
    truth: {
      environment: "PUBLISHER_DECLARED_REAL_WORLD_SO100",
      physicalRobotVideoBytesPresent: true,
      physicalRobotExecutionCorrelationRoots: EXPECTED.selectedExecutionRoots,
      rawKinematicsOrActionTrajectoryPresent: false,
      publisherOutcomeLabelsPresent: true,
      publisherFailureDiagnosisAnnotationsPresent: true,
      publisherCorrectionInstructionAnnotationsPresent: true,
      executedRecoveryEstablished: false,
      recoverySuccessEstablished: false,
      independentOutcomeEstablished: false,
      independentWitnessEstablished: false,
      causalRecoveryEstablished: false,
      externalEffectEstablished: false,
    },
    rights: {
      datasetCardClaim: "MIT", datasetLicenseFilePresent: false,
      codeRepositoryLicense: "MIT", codeLicenseAppliesToDatasetFinallyAdjudicated: false,
      upstreamSceneObjectAndMediaRightsResolved: false,
      rightsFinallyAdjudicated: false, evaluationUseFinallyAdjudicated: false,
      productionTrainingAuthorized: false,
    },
    privacy: {
      rawPhysicalSceneVideoPresent: true, rawHumanAuthoredOrGeneratedQaTextPresent: true,
      rawSourcePrivate: true, noPiiEstablished: false,
      deidentificationEstablished: false, privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    safety: { embeddedCodeExecuted: false, publisherCodeExecuted: false,
      videoDecoded: false, pixelsInterpreted: false, qaTextProjected: false },
    boundary: { opportunity: 0, delegation: 0, actionAuthority: 0,
      independentOutcome: 0, longitudinalOutcome: 0, training: 0,
      network: 0, CEU: 0, pricing: 0, authority: 0 },
  };
}

export function buildRoboFacRealPullCubeReport(directory) {
  const base = reportBase(replayRoboFacRealPullCubeSource(directory));
  return { ...base, artifactHash: roboFacDigest(base, ROBOFAC_REPORT_SCHEMA) };
}

export function verifyRoboFacRealPullCubeReport(report, directory) {
  if (!plain(report) || report.schema !== ROBOFAC_REPORT_SCHEMA
    || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const expected = buildRoboFacRealPullCubeReport(directory);
  if (!same(report, expected)) fail("REPORT_NOT_FULL_SOURCE_DERIVED");
  return { ok: true, report, artifactHash: report.artifactHash };
}

function buildReceipt(report, reportBytes) {
  const base = { schema: ROBOFAC_RECEIPT_SCHEMA, frozenAt: ROBOFAC_FROZEN_AT,
    report: { file: "robofac-real-pullcube.json", bytes: reportBytes.length,
      sha256: roboFacSha256(reportBytes), artifactHash: report.artifactHash },
    sourceRoot: report.source.sourceRoot,
    sourceManifestHash: report.source.sourceManifestHash,
    receiptPublishedLast: true, boundary: report.boundary };
  return { ...base, receiptHash: roboFacDigest(base, ROBOFAC_RECEIPT_SCHEMA) };
}

export function publishRoboFacRealPullCubeArtifact({ sourceDirectory, targetDirectory }) {
  if (existsSync(targetDirectory)) fail("TARGET_NO_CLOBBER", targetDirectory);
  const verified = verifyRoboFacRealPullCubeSource(sourceDirectory);
  const staging = `${targetDirectory}.staging-${process.pid}-${Date.now()}`;
  if (existsSync(staging)) fail("STAGING_COLLISION", staging);
  mkdirSync(staging, { recursive: false, mode: 0o700 });
  chmodSync(staging, 0o700);
  try {
    const report = buildRoboFacRealPullCubeReport(sourceDirectory);
    const reportBytes = canonicalBytes(report);
    const receipt = buildReceipt(report, reportBytes);
    const receiptBytes = canonicalBytes(receipt);
    const manifestBase = { schema: "outsider/robofac-real-pullcube-artifact-manifest/v1",
      frozenAt: ROBOFAC_FROZEN_AT, sourceRoot: verified.sourceRoot,
      sourceManifestHash: verified.manifestHash, artifactHash: report.artifactHash,
      report: { file: "robofac-real-pullcube.json", bytes: reportBytes.length,
        sha256: roboFacSha256(reportBytes) },
      receipt: { file: "run-receipt.json", bytes: receiptBytes.length,
        sha256: roboFacSha256(receiptBytes), receiptHash: receipt.receiptHash } };
    const artifactManifest = { ...manifestBase,
      manifestHash: roboFacDigest(manifestBase,
        "outsider/robofac-real-pullcube-artifact-manifest/v1") };
    renameSync(sourceDirectory, path.join(staging, "source"));
    writePrivateOnce(path.join(staging, "robofac-real-pullcube.json"), reportBytes);
    writePrivateOnce(path.join(staging, "artifact-manifest.json"), canonicalBytes(artifactManifest));
    // The receipt is the final write in the staging artifact.
    writePrivateOnce(path.join(staging, "run-receipt.json"), receiptBytes);
    verifyRoboFacRealPullCubeReport(report, path.join(staging, "source"));
    renameSync(staging, targetDirectory);
    return { report, receipt, artifactManifest };
  } catch (error) {
    // Preserve the private staging/source checkpoint for bounded recovery.
    throw error;
  }
}
