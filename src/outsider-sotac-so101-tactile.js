/*
 * Exact-revision, no-video intake for the SoTac SO-101 tactile corpus.
 *
 * This module preserves the complete curated 63-episode no-video closure,
 * including both raw Paxini fingertip streams and all publisher annotations.
 * It does not promote a curated release to an attempt census, publisher labels
 * to independent outcomes, or a public license to training authorization.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const SOTAC_DATASET_ID = "Jingyi-Z/sotac";
export const SOTAC_REVISION = "47d46cfb82e5d327a0e0790f1414417bddbf3be5";
export const SOTAC_LEROBOTAC_REPOSITORY = "Jingyi-Z/lerobotac";
export const SOTAC_LEROBOTAC_REF = "hall-sensor";
export const SOTAC_LEROBOTAC_HEAD = "0484f77407ba0bce14567a24c3e94f67df31a74a";
export const SOTAC_LEROBOTAC_TREE = "b1093b1a6d2bd3738dd2cb287c1d792db8be0dfa";
export const SOTAC_PAXINI_REPOSITORY = "Jingyi-Z/paxini-sdk";
export const SOTAC_PAXINI_REF = "main";
export const SOTAC_PAXINI_HEAD = "79c82145f88e158dd7706736e8c07f14f11cbd7a";
export const SOTAC_PAXINI_TREE = "fb45e0bbc89d1ff28ca66a336bd7558153843bce";
export const SOTAC_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const SOTAC_SOURCE_SCHEMA = "outsider/sotac-so101-pinned-source/v1";
export const SOTAC_REPORT_SCHEMA = "outsider/sotac-so101-tactile/v1";
export const SOTAC_RECEIPT_SCHEMA = "outsider/sotac-so101-tactile-run-receipt/v1";

const HF_ORIGIN = "https://huggingface.co";
const HF_API_PATH = `/api/datasets/${SOTAC_DATASET_ID}/revision/${SOTAC_REVISION}`;
const HF_API_URL = `${HF_ORIGIN}${HF_API_PATH}`;
const HF_TREE_PATH = `/api/datasets/${SOTAC_DATASET_ID}/tree/${SOTAC_REVISION}`;
const HF_TREE_URL = `${HF_ORIGIN}${HF_TREE_PATH}?recursive=true&expand=true`;
const HF_RAW_ROOT = `${HF_ORIGIN}/datasets/${SOTAC_DATASET_ID}/resolve/${SOTAC_REVISION}`;
const GH_API_ORIGIN = "https://api.github.com";
const GH_RAW_ORIGIN = "https://raw.githubusercontent.com";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const MAX_API_BYTES = 4 * 1024 * 1024;
const MAX_REMOTE_FILE_BYTES = 8 * 1024 * 1024;
const MAX_TREE_PAGES = 16;
const FETCH_TIMEOUT_MS = 180_000;
const DOWNLOAD_CONCURRENCY = 8;
const ALLOWED_REDIRECT_HOST = /^(huggingface\.co|[a-z0-9.-]+\.hf\.co|api\.github\.com|raw\.githubusercontent\.com)$/iu;

const EXPECTED_RECORD = Object.freeze({
  id: SOTAC_DATASET_ID,
  sha: SOTAC_REVISION,
  lastModified: "2026-08-27T21:02:18.000Z",
  private: false,
  gated: false,
  disabled: false,
  usedStorage: 916_190_747,
  license: "apache-2.0",
});

const EXPECTED_PROFILE = Object.freeze({
  treePages: 7,
  treeEntries: 348,
  repositoryFiles: 272,
  repositoryBytes: 1_033_890_080,
  closureFiles: 262,
  closureBytes: 124_527_278,
  readmeFiles: 1,
  curationMapFiles: 1,
  annotationFiles: 64,
  annotationBytes: 194_343,
  dataFiles: 3,
  dataBytes: 1_028_955,
  metaFiles: 4,
  metaBytes: 212_355,
  sensorFiles: 189,
  sensorBytes: 123_081_350,
  rawCsvFiles: 126,
  rawCsvBytes: 123_066_110,
  alignmentFiles: 63,
  alignmentBytes: 15_240,
  videoFilesExcluded: 9,
  videoBytesExcluded: 909_360_298,
  episodes: 63,
  frames: 25_401,
  tasks: 3,
});

const GITHUB_REPOSITORIES = Object.freeze([
  Object.freeze({
    key: "lerobotac",
    repository: SOTAC_LEROBOTAC_REPOSITORY,
    ref: SOTAC_LEROBOTAC_REF,
    head: SOTAC_LEROBOTAC_HEAD,
    tree: SOTAC_LEROBOTAC_TREE,
  }),
  Object.freeze({
    key: "paxini-sdk",
    repository: SOTAC_PAXINI_REPOSITORY,
    ref: SOTAC_PAXINI_REF,
    head: SOTAC_PAXINI_HEAD,
    tree: SOTAC_PAXINI_TREE,
  }),
]);

const GITHUB_OBJECT_SPECS = Object.freeze([
  { repositoryKey: "lerobotac", path: "LICENSE", sizeBytes: 27_627,
    gitBlobSha1: "a603343cdda0228e53d8d9cdeb355f342f1e8f2c",
    sha256: "sha256:0583375a0ec642ec79c447781f34322b0cfa66baff31258214d040f1f6d86d7c" },
  { repositoryKey: "lerobotac", path: "pyproject.toml", sizeBytes: 18_731,
    gitBlobSha1: "f983134ab7b3bc7bae344ff3a60137a851f89356",
    sha256: "sha256:fdccb06b6c81399f76f4a66a2a4298cecaa7983577228e523c07a284a4962965" },
  { repositoryKey: "lerobotac", path: "src/lerobot/scripts/lerobot_record.py", sizeBytes: 22_127,
    gitBlobSha1: "cac812b48d1c76a0856f937c3c813cc6f5ca2bdb",
    sha256: "sha256:995a46f93dd039439989ee7d8f5932663bc57eefab3e40879450b112007a92f9" },
  { repositoryKey: "lerobotac", path: "src/lerobot/sensors/configs.py", sizeBytes: 7317,
    gitBlobSha1: "e97c3825fbfdc0f443ffce2af8cafbc634a1585f",
    sha256: "sha256:1be0265026344ecda2a525dfaf5ea2e1541a06b87b4990193a5e960131dd8fd9" },
  { repositoryKey: "lerobotac", path: "src/lerobot/sensors/paxini.py", sizeBytes: 45_757,
    gitBlobSha1: "2c5480c4c4509a0b8557a8adef5506e6acfd9e31",
    sha256: "sha256:ce68844d2be4f8c7254105472bcda39bb6e775a15268417764b0aa8fa271a8e0" },
  { repositoryKey: "paxini-sdk", path: "LICENSE", sizeBytes: 1067,
    gitBlobSha1: "cad032e77f542ebe9b4a90509a0e08785b3306b9",
    sha256: "sha256:e713d9954d0054543f4a5c60e45656741f5c2702c373ac6383c02ba5dda9386e" },
  { repositoryKey: "paxini-sdk", path: "README.md", sizeBytes: 7793,
    gitBlobSha1: "66049160d45264b82cc4e142833cd6ce9dbc7346",
    sha256: "sha256:9d7e4f6cdb32001770c5a7a1eb1d2bc0cdb5fcd6cfc2a2dfbf2118115564b65c" },
  { repositoryKey: "paxini-sdk", path: "pyproject.toml", sizeBytes: 1817,
    gitBlobSha1: "d118f6852996e3692889fd2d7dfa13e88cb791f7",
    sha256: "sha256:1d61af5ed409e27e5a891a1ec15e9d7a26385612de33abadb98ee0dd47aff0dd" },
  { repositoryKey: "paxini-sdk", path: "paxini_sdk/boards/high_speed.py", sizeBytes: 16_243,
    gitBlobSha1: "7aee2baef78abb79127d656c0d4b38a62c2e563c",
    sha256: "sha256:04b88551512e1b137f7e69db1c6ad3f36ef4900dad4233bdc00ab2b2ec6707ff" },
  { repositoryKey: "paxini-sdk", path: "paxini_sdk/protocol.py", sizeBytes: 13_389,
    gitBlobSha1: "46c54fc2627eb26e84bc29ab60ae487028522273",
    sha256: "sha256:448aa3e0c2a236fa2ab67c898ea9ce3d1d6868a456bd1976f4d893ced1e5037f" },
  { repositoryKey: "paxini-sdk", path: "paxini_sdk/data/registry.json", sizeBytes: 3921,
    gitBlobSha1: "554ee8c895e269b1445c4a312b3fa666d2ce32ea",
    sha256: "sha256:eebaa93a30becec7d643d1dd8ce6b624c4b9ae531ff79f6b9816b17db5659c6a" },
  { repositoryKey: "paxini-sdk", path: "paxini_sdk/sensor_registry.py", sizeBytes: 4049,
    gitBlobSha1: "c5cafcaaf3890290d1aa82f234f5b95ec914aed5",
    sha256: "sha256:f2b3e2ddeac27ba9c324590420e68e86ff3ea7cfa780eee9b22df69802221513" },
  { repositoryKey: "paxini-sdk", path: "paxini_sdk/data/pxsr_stddp03g_points.json", sizeBytes: 6182,
    gitBlobSha1: "50fa2de1a760aeb51013cf9566e0ebf8f01aec95",
    sha256: "sha256:d4324701a69b13c670f23cb34ff4620875b7e2743a14d259fb1a648ebeff5aa0" },
]);

const CURATION_LINK_PATHS = Object.freeze([
  "curate_tactile_dataset.py",
  "curation_sotac_v2.json",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `SOTAC_SO101_${code}` : `SOTAC_SO101_${code}:${detail}`);
}

export function sotacSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sotacSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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
    && !value.includes("\\") && value.split("/").every((part) =>
      part !== "" && part !== "." && part !== "..");
}

function checkedInitialUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !["huggingface.co", "api.github.com",
    "raw.githubusercontent.com"].includes(url.hostname)
    || url.username !== "" || url.password !== "") fail("FETCH_URL_INVALID", value);
  return url;
}

function checkedRedirectUrl(value, base) {
  const url = new URL(value, base);
  if (url.protocol !== "https:" || !ALLOWED_REDIRECT_HOST.test(url.hostname)
    || url.username !== "" || url.password !== "") fail("FETCH_REDIRECT_INVALID", url.hostname);
  return url;
}

async function fetchOnce(value, maximumBytes, accept, fetchImpl) {
  let current = checkedInitialUrl(value);
  for (let redirects = 0; redirects <= 7; redirects += 1) {
    const response = await fetchImpl(current, {
      redirect: "manual",
      headers: { accept, "accept-encoding": "identity",
        "user-agent": "outsider-sotac-so101-tactile/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location || redirects === 7) fail("FETCH_REDIRECT_LIMIT", current.toString());
      if (response.body) await response.body.cancel();
      current = checkedRedirectUrl(location, current);
      continue;
    }
    if (response.status !== 200 || !response.body
      || response.headers.get("content-encoding") !== null) {
      fail(`FETCH_HTTP_${response.status}`, checkedInitialUrl(value).pathname);
    }
    const final = new URL(response.url || current.toString());
    if (!ALLOWED_REDIRECT_HOST.test(final.hostname)) fail("FETCH_FINAL_HOST_INVALID");
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
        await reader.cancel();
        fail("FETCH_STREAM_LIMIT", value);
      }
      chunks.push(Buffer.from(chunk));
    }
    if (total < 1) fail("FETCH_EMPTY", value);
    return { bytes: Buffer.concat(chunks, total), headers: response.headers,
      finalHost: final.hostname };
  }
  fail("FETCH_REDIRECT_LIMIT", value);
}

async function boundedFetch(value, maximumBytes, accept, fetchImpl) {
  let last = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetchOnce(value, maximumBytes, accept, fetchImpl); }
    catch (error) {
      last = error;
      if (/FETCH_HTTP_4\d\d/u.test(safeError(error)) || attempt === 2) break;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** attempt)));
    }
  }
  fail("FETCH_FAILED", safeError(last));
}

async function jsonFetch(value, maximumBytes, fetchImpl) {
  const result = await boundedFetch(value, maximumBytes, "application/json", fetchImpl);
  let parsed;
  try { parsed = JSON.parse(result.bytes.toString("utf8")); }
  catch { fail("FETCH_JSON_INVALID", value); }
  return { ...result, value: parsed };
}

function parseNextTreeLink(header) {
  if (header == null || header === "") return null;
  const part = String(header).split(",").find((value) =>
    /;\s*rel="next"\s*$/iu.test(value.trim()));
  if (!part) return null;
  const match = /^\s*<([^>]+)>/u.exec(part);
  if (!match) fail("TREE_NEXT_INVALID");
  const url = checkedInitialUrl(match[1]);
  if (url.pathname !== HF_TREE_PATH || url.searchParams.get("recursive") !== "true"
    || url.searchParams.get("expand") !== "true" || !url.searchParams.get("cursor")) {
    fail("TREE_NEXT_UNSAFE");
  }
  return url.toString();
}

function normalizeTreeEntries(values) {
  if (!Array.isArray(values) || values.length < 1) fail("TREE_PAGE_INVALID");
  return values.map((entry) => {
    if (!exactObject(entry) || !safeRemotePath(entry.path)
      || !["file", "directory"].includes(entry.type)
      || !SHA1.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
    if (entry.type === "directory") return { path: entry.path, type: entry.type, oid: entry.oid };
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) fail("TREE_FILE_INVALID");
    const normalized = { path: entry.path, type: entry.type, size: entry.size, oid: entry.oid };
    if (entry.lfs !== undefined) {
      if (!exactObject(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
        || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
      normalized.lfs = { oid: entry.lfs.oid, size: entry.lfs.size };
    }
    return normalized;
  });
}

function treeSnapshotHash(entries) {
  const normalized = [...entries].sort((left, right) => left.path.localeCompare(right.path));
  return digest("outsider/sotac-so101-hf-tree/v1", normalized);
}

async function fetchHfTree(fetchImpl, bracket) {
  const entries = [];
  const support = [];
  const seen = new Set();
  let next = HF_TREE_URL;
  for (let page = 1; next !== null; page += 1) {
    if (page > MAX_TREE_PAGES || seen.has(next)) fail("TREE_PAGINATION_INVALID");
    seen.add(next);
    const fetched = await jsonFetch(next, MAX_API_BYTES, fetchImpl);
    entries.push(...normalizeTreeEntries(fetched.value));
    support.push({ localPath: `source-support/hf-tree-${bracket}-${String(page)
      .padStart(3, "0")}.json`, fetchUrl: next, bytes: fetched.bytes });
    next = parseNextTreeLink(fetched.headers.get("link"));
  }
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("TREE_DUPLICATE_PATH");
  }
  return { entries, support, snapshotHash: treeSnapshotHash(entries) };
}

function hfRecordProjection(value) {
  if (!exactObject(value)) fail("HF_RECORD_INVALID");
  return {
    id: value.id,
    sha: value.sha,
    lastModified: value.lastModified,
    private: value.private,
    gated: value.gated,
    disabled: value.disabled,
    usedStorage: value.usedStorage,
    license: value.cardData?.license,
  };
}

function githubBranchProjection(value) {
  if (!exactObject(value) || typeof value.name !== "string") fail("GITHUB_BRANCH_INVALID");
  const projection = {
    name: value.name,
    head: value.commit?.sha,
    tree: value.commit?.commit?.tree?.sha,
  };
  if (!SHA1.test(projection.head ?? "") || !SHA1.test(projection.tree ?? "")) {
    fail("GITHUB_BRANCH_INVALID");
  }
  return projection;
}

function normalizeGithubTree(value, expectedTree) {
  if (!exactObject(value) || value.sha !== expectedTree || value.truncated !== false
    || !Array.isArray(value.tree)) fail("GITHUB_TREE_INVALID", expectedTree);
  const entries = value.tree.map((entry) => {
    if (!safeRemotePath(entry.path) || !["blob", "tree"].includes(entry.type)
      || !SHA1.test(entry.sha ?? "")) fail("GITHUB_TREE_ENTRY_INVALID");
    if (entry.type === "tree") return { path: entry.path, type: entry.type, sha: entry.sha };
    if (!Number.isSafeInteger(entry.size) || entry.size < 0) fail("GITHUB_BLOB_INVALID");
    return { path: entry.path, type: entry.type, sha: entry.sha, size: entry.size };
  });
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("GITHUB_TREE_DUPLICATE_PATH");
  }
  return entries;
}

function selectedHfPath(value) {
  return value === "README.md" || value === "curation_map.json"
    || /^(annotations|data|meta|sensors)\//u.test(value);
}

function summarizeFiles(files, predicate) {
  const values = files.filter(predicate);
  return { files: values.length, bytes: values.reduce((sum, entry) => sum + entry.size, 0) };
}

function validateHfProfile(entries) {
  if (entries.length !== EXPECTED_PROFILE.treeEntries) fail("TREE_ENTRY_COUNT_DRIFT");
  const files = entries.filter((entry) => entry.type === "file");
  const selected = files.filter((entry) => selectedHfPath(entry.path));
  const profile = {
    repositoryFiles: files.length,
    repositoryBytes: files.reduce((sum, entry) => sum + entry.size, 0),
    closureFiles: selected.length,
    closureBytes: selected.reduce((sum, entry) => sum + entry.size, 0),
    annotations: summarizeFiles(files, (entry) => entry.path.startsWith("annotations/")),
    data: summarizeFiles(files, (entry) => entry.path.startsWith("data/")),
    meta: summarizeFiles(files, (entry) => entry.path.startsWith("meta/")),
    sensors: summarizeFiles(files, (entry) => entry.path.startsWith("sensors/")),
    rawCsv: summarizeFiles(files, (entry) => /^sensors\/.*\/sensor_[12]\.csv$/u.test(entry.path)),
    alignment: summarizeFiles(files, (entry) => /^sensors\/.*\/alignment\.json$/u.test(entry.path)),
    videos: summarizeFiles(files, (entry) => entry.path.startsWith("videos/")),
  };
  const expected = {
    repositoryFiles: EXPECTED_PROFILE.repositoryFiles,
    repositoryBytes: EXPECTED_PROFILE.repositoryBytes,
    closureFiles: EXPECTED_PROFILE.closureFiles,
    closureBytes: EXPECTED_PROFILE.closureBytes,
    annotations: { files: EXPECTED_PROFILE.annotationFiles, bytes: EXPECTED_PROFILE.annotationBytes },
    data: { files: EXPECTED_PROFILE.dataFiles, bytes: EXPECTED_PROFILE.dataBytes },
    meta: { files: EXPECTED_PROFILE.metaFiles, bytes: EXPECTED_PROFILE.metaBytes },
    sensors: { files: EXPECTED_PROFILE.sensorFiles, bytes: EXPECTED_PROFILE.sensorBytes },
    rawCsv: { files: EXPECTED_PROFILE.rawCsvFiles, bytes: EXPECTED_PROFILE.rawCsvBytes },
    alignment: { files: EXPECTED_PROFILE.alignmentFiles, bytes: EXPECTED_PROFILE.alignmentBytes },
    videos: { files: EXPECTED_PROFILE.videoFilesExcluded, bytes: EXPECTED_PROFILE.videoBytesExcluded },
  };
  if (!same(profile, expected)) fail("TREE_PROFILE_DRIFT", canonicalizeStrict(profile));
  return selected.sort((left, right) => left.path.localeCompare(right.path));
}

function remoteBinding(entry) {
  const result = { path: entry.path, localPath: `hf/${entry.path}`,
    sizeBytes: entry.size, gitOid: entry.oid };
  if (entry.lfs) result.lfs = { sha256: `sha256:${entry.lfs.oid}`, sizeBytes: entry.lfs.size };
  return result;
}

function checkRemoteBytes(binding, bytes) {
  if (bytes.length !== binding.sizeBytes) fail("REMOTE_SIZE_MISMATCH", binding.path);
  const sha256 = sotacSha256(bytes);
  if (binding.lfs) {
    if (sha256 !== binding.lfs.sha256) fail("REMOTE_LFS_HASH_MISMATCH", binding.path);
  } else if (gitBlobOid(bytes) !== binding.gitOid) {
    fail("REMOTE_GIT_OID_MISMATCH", binding.path);
  }
  return sha256;
}

async function mapConcurrent(values, width, operation) {
  const results = new Array(values.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await operation(values[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, values.length) }, worker));
  return results;
}

function ensurePrivateDirectory(directory) {
  if (existsSync(directory)) {
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
    chmodSync(directory, 0o700);
    return;
  }
  ensurePrivateDirectory(path.dirname(directory));
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function safeTarget(root, relative) {
  if (!safeRemotePath(relative)) fail("LOCAL_PATH_UNSAFE", relative);
  const target = path.resolve(root, relative);
  const rel = path.relative(path.resolve(root), target);
  if (rel.startsWith(`..${path.sep}`) || rel === ".." || path.isAbsolute(rel)) {
    fail("LOCAL_PATH_ESCAPE", relative);
  }
  return target;
}

function writePrivate(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function supportEntry(item) {
  return { localPath: item.localPath, fetchUrl: item.fetchUrl,
    sizeBytes: item.bytes.length, sha256: sotacSha256(item.bytes) };
}

function githubUrl(repository, commit, remotePath) {
  return `${GH_RAW_ORIGIN}/${repository}/${commit}/${remotePath}`;
}

function sourceRootFromBindings(bindings) {
  return digest("outsider/sotac-so101-source-root/v1", bindings.map((entry) => ({
    localPath: entry.localPath,
    sizeBytes: entry.sizeBytes,
    sha256: entry.sha256,
  })).sort((left, right) => left.localPath.localeCompare(right.localPath)));
}

function sourceManifestBody(input) {
  return {
    schema: SOTAC_SOURCE_SCHEMA,
    datasetId: SOTAC_DATASET_ID,
    revision: SOTAC_REVISION,
    frozenAt: SOTAC_FROZEN_AT,
    closure: {
      kind: "FULL_CURATED_NO_VIDEO_CLOSURE",
      selectionRule: "README.md, curation_map.json, and every file below annotations/, data/, meta/, sensors/",
      selectedFiles: EXPECTED_PROFILE.closureFiles,
      selectedBytes: EXPECTED_PROFILE.closureBytes,
      completeCuratedEpisodes: EXPECTED_PROFILE.episodes,
      completeCuratedTasks: EXPECTED_PROFILE.tasks,
      videoFilesExcluded: EXPECTED_PROFILE.videoFilesExcluded,
      videoBytesExcluded: EXPECTED_PROFILE.videoBytesExcluded,
      cameraBytesFetched: 0,
      rawArchiveFetched: false,
    },
    hf: input.hf,
    github: input.github,
    hfRemoteObjects: input.hfRemoteObjects,
    githubRemoteObjects: input.githubRemoteObjects,
    support: input.support,
    sourceRoot: input.sourceRoot,
  };
}

function publishSourceStaging(staging, target) {
  if (existsSync(target)) fail("NO_CLOBBER", target);
  renameSync(staging, target);
  chmodSync(target, 0o700);
}

export async function acquirePinnedSotacSo101Source(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_UNAVAILABLE");
  const target = path.resolve(outputDirectory);
  if (existsSync(target)) fail("NO_CLOBBER", target);
  ensurePrivateDirectory(path.dirname(target));
  const staging = path.join(path.dirname(target), `.${path.basename(target)}.staging-`
    + `${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  try {
    const recordBefore = await jsonFetch(HF_API_URL, MAX_API_BYTES, fetchImpl);
    if (!same(hfRecordProjection(recordBefore.value), EXPECTED_RECORD)) fail("HF_RECORD_DRIFT");
    const treeBefore = await fetchHfTree(fetchImpl, "before");
    if (treeBefore.support.length !== EXPECTED_PROFILE.treePages) fail("TREE_PAGE_COUNT_DRIFT");
    const selectedEntries = validateHfProfile(treeBefore.entries);

    const githubBefore = [];
    const githubTrees = [];
    for (const repository of GITHUB_REPOSITORIES) {
      const branchUrl = `${GH_API_ORIGIN}/repos/${repository.repository}/branches/${repository.ref}`;
      const branch = await jsonFetch(branchUrl, MAX_API_BYTES, fetchImpl);
      const projection = githubBranchProjection(branch.value);
      if (!same(projection, { name: repository.ref, head: repository.head, tree: repository.tree })) {
        fail("GITHUB_HEAD_DRIFT", repository.repository);
      }
      const treeUrl = `${GH_API_ORIGIN}/repos/${repository.repository}/git/trees/${repository.tree}?recursive=1`;
      const tree = await jsonFetch(treeUrl, MAX_API_BYTES, fetchImpl);
      const entries = normalizeGithubTree(tree.value, repository.tree);
      githubBefore.push({ repository, branchUrl, branch });
      githubTrees.push({ repository, treeUrl, tree, entries });
    }

    for (const spec of GITHUB_OBJECT_SPECS) {
      const tree = githubTrees.find((entry) => entry.repository.key === spec.repositoryKey);
      const blob = tree?.entries.find((entry) => entry.path === spec.path && entry.type === "blob");
      if (!blob || blob.sha !== spec.gitBlobSha1 || blob.size !== spec.sizeBytes) {
        fail("GITHUB_OBJECT_TREE_DRIFT", `${spec.repositoryKey}:${spec.path}`);
      }
    }
    const lerobotacTree = githubTrees.find((entry) => entry.repository.key === "lerobotac");
    if (!lerobotacTree || CURATION_LINK_PATHS.some((remotePath) =>
      lerobotacTree.entries.some((entry) => entry.path === remotePath))) {
      fail("CURATION_LINK_BOUNDARY_DRIFT");
    }

    const hfBindings = await mapConcurrent(selectedEntries.map(remoteBinding),
      DOWNLOAD_CONCURRENCY, async (binding) => {
        const fetchUrl = `${HF_RAW_ROOT}/${binding.path.split("/").map(encodeURIComponent).join("/")}`;
        const fetched = await boundedFetch(fetchUrl, MAX_REMOTE_FILE_BYTES,
          "application/octet-stream", fetchImpl);
        const sha256 = checkRemoteBytes(binding, fetched.bytes);
        writePrivate(safeTarget(staging, binding.localPath), fetched.bytes);
        return { ...binding, fetchUrl, sha256 };
      });

    const githubBindings = await mapConcurrent(GITHUB_OBJECT_SPECS,
      DOWNLOAD_CONCURRENCY, async (spec) => {
        const repository = GITHUB_REPOSITORIES.find((entry) => entry.key === spec.repositoryKey);
        if (!repository) fail("GITHUB_SPEC_REPOSITORY_INVALID");
        const fetchUrl = githubUrl(repository.repository, repository.head, spec.path);
        const fetched = await boundedFetch(fetchUrl, MAX_REMOTE_FILE_BYTES,
          "application/octet-stream", fetchImpl);
        if (fetched.bytes.length !== spec.sizeBytes || gitBlobOid(fetched.bytes) !== spec.gitBlobSha1
          || sotacSha256(fetched.bytes) !== spec.sha256) {
          fail("GITHUB_OBJECT_BYTES_DRIFT", `${spec.repositoryKey}:${spec.path}`);
        }
        const binding = { repositoryKey: spec.repositoryKey, repository: repository.repository,
          commit: repository.head, path: spec.path,
          localPath: `github/${spec.repositoryKey}/${spec.path}`,
          sizeBytes: spec.sizeBytes, gitBlobSha1: spec.gitBlobSha1,
          sha256: spec.sha256, fetchUrl };
        writePrivate(safeTarget(staging, binding.localPath), fetched.bytes);
        return binding;
      });

    const recordAfter = await jsonFetch(HF_API_URL, MAX_API_BYTES, fetchImpl);
    const treeAfter = await fetchHfTree(fetchImpl, "after");
    const selectedAfter = validateHfProfile(treeAfter.entries);
    if (!same(hfRecordProjection(recordAfter.value), EXPECTED_RECORD)
      || treeAfter.support.length !== EXPECTED_PROFILE.treePages
      || treeAfter.snapshotHash !== treeBefore.snapshotHash
      || !same(selectedAfter, selectedEntries)) fail("HF_BRACKET_DRIFT");

    const githubAfter = [];
    for (const before of githubBefore) {
      const branch = await jsonFetch(before.branchUrl, MAX_API_BYTES, fetchImpl);
      const expected = { name: before.repository.ref, head: before.repository.head,
        tree: before.repository.tree };
      if (!same(githubBranchProjection(branch.value), expected)) {
        fail("GITHUB_BRACKET_DRIFT", before.repository.repository);
      }
      githubAfter.push({ ...before, branch });
    }

    const supportItems = [
      { localPath: "source-support/hf-record-before.json", fetchUrl: HF_API_URL,
        bytes: recordBefore.bytes },
      ...treeBefore.support,
      ...githubBefore.map((entry) => ({
        localPath: `source-support/github-${entry.repository.key}-branch-before.json`,
        fetchUrl: entry.branchUrl, bytes: entry.branch.bytes,
      })),
      ...githubTrees.map((entry) => ({
        localPath: `source-support/github-${entry.repository.key}-tree.json`,
        fetchUrl: entry.treeUrl, bytes: entry.tree.bytes,
      })),
      { localPath: "source-support/hf-record-after.json", fetchUrl: HF_API_URL,
        bytes: recordAfter.bytes },
      ...treeAfter.support,
      ...githubAfter.map((entry) => ({
        localPath: `source-support/github-${entry.repository.key}-branch-after.json`,
        fetchUrl: entry.branchUrl, bytes: entry.branch.bytes,
      })),
    ];
    for (const item of supportItems) writePrivate(safeTarget(staging, item.localPath), item.bytes);
    const bindings = [...hfBindings, ...githubBindings];
    const sourceRoot = sourceRootFromBindings(bindings);
    const body = sourceManifestBody({
      hf: {
        recordProjection: EXPECTED_RECORD,
        treeBefore: { pages: treeBefore.support.length, entries: treeBefore.entries.length,
          snapshotHash: treeBefore.snapshotHash },
        treeAfter: { pages: treeAfter.support.length, entries: treeAfter.entries.length,
          snapshotHash: treeAfter.snapshotHash },
      },
      github: {
        repositories: GITHUB_REPOSITORIES.map((entry) => ({ ...entry })),
        curationLinkBoundary: {
          linkedPaths: [...CURATION_LINK_PATHS],
          presentAtPinnedLerobotacHead: false,
          curationCodeReplayPerformed: false,
        },
      },
      hfRemoteObjects: hfBindings,
      githubRemoteObjects: githubBindings,
      support: supportItems.map(supportEntry),
      sourceRoot,
    });
    const manifest = { ...body, manifestHash: digest(`${SOTAC_SOURCE_SCHEMA}/manifest`, body) };
    writePrivate(path.join(staging, "source-manifest.json"), canonicalBytes(manifest));
    publishSourceStaging(staging, target);
    return verifySotacSo101SourceDirectory(target);
  } catch (error) {
    if (existsSync(staging) && !existsSync(target)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function supportNames() {
  return sorted([
    "hf-record-before.json",
    "hf-record-after.json",
    ...["before", "after"].flatMap((bracket) =>
      Array.from({ length: EXPECTED_PROFILE.treePages }, (_, index) =>
        `hf-tree-${bracket}-${String(index + 1).padStart(3, "0")}.json`)),
    ...GITHUB_REPOSITORIES.flatMap((entry) => [
      `github-${entry.key}-branch-before.json`,
      `github-${entry.key}-tree.json`,
      `github-${entry.key}-branch-after.json`,
    ]),
  ]);
}

function expectedDirectoryMap(filePaths) {
  const map = new Map([["", new Set()]]);
  for (const filePath of filePaths) {
    if (!safeRemotePath(filePath)) fail("EXPECTED_PATH_INVALID", filePath);
    const parts = filePath.split("/");
    let current = "";
    for (let index = 0; index < parts.length; index += 1) {
      const name = parts[index];
      map.get(current).add(name);
      if (index === parts.length - 1) break;
      current = current === "" ? name : `${current}/${name}`;
      if (!map.has(current)) map.set(current, new Set());
    }
  }
  return map;
}

function statIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs]
    .map((value) => value.toString()).join(":");
}

function requirePrivateDirectory(directory, expectedNames, snapshots) {
  const stat = lstatSync(directory, { bigint: true });
  const names = sorted(readdirSync(directory));
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || Number(stat.mode & 0o777n) !== 0o700
    || !same(names, sorted(expectedNames))) fail("SOURCE_DIRECTORY_INVALID", directory);
  snapshots.push({ kind: "directory", path: directory,
    identity: statIdentity(stat), names });
}

function readPrivateStable(root, relative, snapshots, maximumBytes, expected = null) {
  const target = safeTarget(root, relative);
  const descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || Number(before.mode & 0o777n) !== 0o600
      || before.size < 1n || before.size > BigInt(maximumBytes)) {
      fail("SOURCE_FILE_INVALID", relative);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (statIdentity(before) !== statIdentity(after)
      || bytes.length !== Number(before.size)) fail("SOURCE_FILE_CHANGED", relative);
    if (expected && (bytes.length !== expected.sizeBytes
      || sotacSha256(bytes) !== expected.sha256)) fail("SOURCE_BINDING_INVALID", relative);
    snapshots.push({ kind: "file", path: target, identity: statIdentity(after) });
    return bytes;
  } finally { closeSync(descriptor); }
}

function recheckSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    const stat = lstatSync(snapshot.path, { bigint: true });
    if (statIdentity(stat) !== snapshot.identity
      || snapshot.kind === "file" && (!stat.isFile() || stat.isSymbolicLink())
      || snapshot.kind === "directory" && (!stat.isDirectory() || stat.isSymbolicLink())
      || snapshot.kind === "directory"
        && !same(sorted(readdirSync(snapshot.path)), snapshot.names)) {
      fail("SOURCE_CHANGED_DURING_REPLAY", snapshot.path);
    }
  }
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function validateTreePageUrl(value, bracket, pageNumber) {
  const url = checkedInitialUrl(value);
  if (url.pathname !== HF_TREE_PATH || url.searchParams.get("recursive") !== "true"
    || url.searchParams.get("expand") !== "true"
    || pageNumber === 1 && url.toString() !== HF_TREE_URL
    || pageNumber > 1 && !url.searchParams.get("cursor")) {
    fail("STORED_TREE_URL_INVALID", `${bracket}:${pageNumber}`);
  }
}

function replayTreeBracket(bracket, supportBytes, supportManifest) {
  const entries = [];
  for (let page = 1; page <= EXPECTED_PROFILE.treePages; page += 1) {
    const relative = `source-support/hf-tree-${bracket}-${String(page).padStart(3, "0")}.json`;
    const manifestEntry = supportManifest.get(relative);
    if (!manifestEntry) fail("TREE_SUPPORT_MANIFEST_MISSING", relative);
    validateTreePageUrl(manifestEntry.fetchUrl, bracket, page);
    const values = parseJson(supportBytes.get(relative), "TREE_SUPPORT_JSON_INVALID");
    if (!Array.isArray(values) || values.length !== (page === EXPECTED_PROFILE.treePages ? 48 : 50)) {
      fail("TREE_SUPPORT_PAGE_COUNT_CHANGED", relative);
    }
    entries.push(...normalizeTreeEntries(values));
  }
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("TREE_SUPPORT_DUPLICATE_PATH");
  }
  validateHfProfile(entries);
  return { entries, pages: EXPECTED_PROFILE.treePages,
    snapshotHash: treeSnapshotHash(entries) };
}

function validateSupportManifestEntry(entry, expectedPath) {
  if (!exactObject(entry) || entry.localPath !== expectedPath
    || typeof entry.fetchUrl !== "string" || !HASH.test(entry.sha256 ?? "")
    || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 1) {
    fail("SOURCE_SUPPORT_MANIFEST_INVALID", expectedPath);
  }
}

function validateHfManifestObject(value, expected) {
  const base = remoteBinding(expected);
  const expectedUrl = `${HF_RAW_ROOT}/${expected.path.split("/").map(encodeURIComponent).join("/")}`;
  const lfsMatches = value?.lfs === undefined && base.lfs === undefined
    || value?.lfs !== undefined && base.lfs !== undefined && same(value.lfs, base.lfs);
  if (!exactObject(value) || value.path !== base.path || value.localPath !== base.localPath
    || value.sizeBytes !== base.sizeBytes || value.gitOid !== base.gitOid
    || !lfsMatches || value.fetchUrl !== expectedUrl
    || !HASH.test(value.sha256 ?? "")) fail("HF_MANIFEST_OBJECT_INVALID", expected.path);
}

function validateGithubManifestObject(value, spec) {
  const repository = GITHUB_REPOSITORIES.find((entry) => entry.key === spec.repositoryKey);
  const expected = {
    repositoryKey: spec.repositoryKey,
    repository: repository?.repository,
    commit: repository?.head,
    path: spec.path,
    localPath: `github/${spec.repositoryKey}/${spec.path}`,
    sizeBytes: spec.sizeBytes,
    gitBlobSha1: spec.gitBlobSha1,
    sha256: spec.sha256,
    fetchUrl: githubUrl(repository?.repository, repository?.head, spec.path),
  };
  if (!same(value, expected)) fail("GITHUB_MANIFEST_OBJECT_INVALID", spec.path);
}

function validateDocumentationAndCode(root, snapshots, hfObjects, githubObjects) {
  const readText = (relative, objects) => readPrivateStable(root, relative, snapshots,
    MAX_REMOTE_FILE_BYTES, objects.get(relative)).toString("utf8");
  const readme = readText("hf/README.md", hfObjects);
  const info = parseJson(readPrivateStable(root, "hf/meta/info.json", snapshots,
    MAX_REMOTE_FILE_BYTES, hfObjects.get("hf/meta/info.json")), "INFO_JSON_INVALID");
  const curationMap = parseJson(readPrivateStable(root, "hf/curation_map.json", snapshots,
    MAX_REMOTE_FILE_BYTES, hfObjects.get("hf/curation_map.json")), "CURATION_MAP_INVALID");
  const annotations = parseJson(readPrivateStable(root,
    "hf/annotations/episode_annotations.json", snapshots, MAX_REMOTE_FILE_BYTES,
    hfObjects.get("hf/annotations/episode_annotations.json")), "ANNOTATIONS_INVALID");
  const lerobotLicense = readText("github/lerobotac/LICENSE", githubObjects);
  const lerobotProject = readText("github/lerobotac/pyproject.toml", githubObjects);
  const lerobotRecord = readText("github/lerobotac/src/lerobot/scripts/lerobot_record.py",
    githubObjects);
  const lerobotConfigs = readText("github/lerobotac/src/lerobot/sensors/configs.py",
    githubObjects);
  const lerobotPaxini = readText("github/lerobotac/src/lerobot/sensors/paxini.py",
    githubObjects);
  const paxiniLicense = readText("github/paxini-sdk/LICENSE", githubObjects);
  const paxiniProject = readText("github/paxini-sdk/pyproject.toml", githubObjects);
  const highSpeed = readText("github/paxini-sdk/paxini_sdk/boards/high_speed.py",
    githubObjects);
  const registry = parseJson(readPrivateStable(root,
    "github/paxini-sdk/paxini_sdk/data/registry.json", snapshots, MAX_REMOTE_FILE_BYTES,
    githubObjects.get("github/paxini-sdk/paxini_sdk/data/registry.json")),
  "PAXINI_REGISTRY_INVALID");
  const points = parseJson(readPrivateStable(root,
    "github/paxini-sdk/paxini_sdk/data/pxsr_stddp03g_points.json", snapshots,
    MAX_REMOTE_FILE_BYTES,
    githubObjects.get("github/paxini-sdk/paxini_sdk/data/pxsr_stddp03g_points.json")),
  "PAXINI_POINTS_INVALID");
  const registryEntry = registry.sensors?.find((entry) =>
    entry.vendor_part_code === "PXSR-STDDP03G");
  if (!/(^|\n)license:\s*apache-2\.0\s*($|\n)/iu.test(readme)
    || !readme.includes("Current release (2026-08-26): 63 episodes / 25,401 frames")
    || !readme.includes("Episodes with contact") || !readme.includes("sensor faults are removed")
    || !readme.includes("curate_tactile_dataset.py")
    || !readme.includes("curation_sotac_v2.json")
    || !readme.includes("0.1 N/LSB") || !readme.includes("shape `(2, 52, 3)`")
    || info.total_episodes !== 63 || info.total_frames !== 25_401 || info.total_tasks !== 3
    || info.features?.["observation.sensors.paxini_fingertip"]?.dtype !== "float32"
    || !same(info.features?.["observation.sensors.paxini_fingertip"]?.shape, [2, 52, 3])
    || curationMap.source_repo !== "Jingyi-Z/sotac_raw"
    || Object.keys(curationMap.map_source_to_output ?? {}).length !== 63
    || annotations.format !== "sotac episode annotations v3"
    || Object.keys(annotations.episodes ?? {}).length !== 63
    || !lerobotLicense.includes("Apache License")
    || !lerobotProject.includes('license = { text = "Apache-2.0" }')
    || !lerobotRecord.includes("start_raw_episode")
    || !lerobotConfigs.includes("record_raw_csv: bool = False")
    || !lerobotConfigs.includes('raw_csv_filename: str = "sensor_{n}.csv"')
    || !lerobotPaxini.includes("frame.distributed_forces_newtons")
    || !lerobotPaxini.includes("alignment.json")
    || !paxiniLicense.startsWith("MIT License\n")
    || !paxiniProject.includes('version = "0.1.0"')
    || !highSpeed.includes("Physical scale: 0.1 N per LSB")
    || !highSpeed.includes("def _to_newtons_triple")
    || !same(registryEntry, {
      vendor_part_code: "PXSR-STDDP03G",
      sensor_model: "PX6AX-GEN3-DP-S2015-Elite",
      sensor_class: "DP",
      geometry: "fingertip",
      grade: "Elite",
      nominal_size_mm: 15,
      n_points: 52,
      json_file: "pxsr_stddp03g_points.json",
    })
    || points.vendor_part_code !== "PXSR-STDDP03G"
    || points.sensor_model !== "PX6AX-GEN3-DP-S2015-Elite"
    || points.n_points !== 52 || points.units !== "millimeters"
    || !Array.isArray(points.points) || points.points.length !== 52) {
    fail("DOCUMENTATION_OR_CODE_PROFILE_CHANGED");
  }
  return { info, curationMap, annotations, registryEntry, points };
}

export function verifySotacSo101SourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const bootstrapSnapshots = [];
  requirePrivateDirectory(root, ["github", "hf", "source-manifest.json", "source-support"],
    bootstrapSnapshots);
  const manifestBytes = readPrivateStable(root, "source-manifest.json", bootstrapSnapshots,
    MAX_API_BYTES);
  const manifest = parseJson(manifestBytes, "SOURCE_MANIFEST_JSON_INVALID");
  if (!manifestBytes.equals(canonicalBytes(manifest))) fail("SOURCE_MANIFEST_NOT_CANONICAL");
  if (!Array.isArray(manifest.support) || !Array.isArray(manifest.hfRemoteObjects)
    || !Array.isArray(manifest.githubRemoteObjects)) fail("SOURCE_MANIFEST_ARRAYS_INVALID");

  const expectedSupportNames = supportNames();
  const supportManifest = new Map(manifest.support.map((entry) => [entry.localPath, entry]));
  const expectedSupportPaths = expectedSupportNames.map((name) => `source-support/${name}`);
  if (supportManifest.size !== expectedSupportPaths.length
    || !same(sorted([...supportManifest.keys()]), sorted(expectedSupportPaths))) {
    fail("SOURCE_SUPPORT_MANIFEST_SET_INVALID");
  }
  const supportBytes = new Map();
  for (const relative of expectedSupportPaths) {
    const entry = supportManifest.get(relative);
    validateSupportManifestEntry(entry, relative);
    supportBytes.set(relative, readPrivateStable(root, relative, bootstrapSnapshots,
      MAX_API_BYTES, entry));
  }

  const recordBeforeEntry = supportManifest.get("source-support/hf-record-before.json");
  const recordAfterEntry = supportManifest.get("source-support/hf-record-after.json");
  if (recordBeforeEntry.fetchUrl !== HF_API_URL || recordAfterEntry.fetchUrl !== HF_API_URL) {
    fail("HF_RECORD_SUPPORT_URL_INVALID");
  }
  const recordBefore = hfRecordProjection(parseJson(
    supportBytes.get("source-support/hf-record-before.json"), "HF_RECORD_BEFORE_INVALID"));
  const recordAfter = hfRecordProjection(parseJson(
    supportBytes.get("source-support/hf-record-after.json"), "HF_RECORD_AFTER_INVALID"));
  if (!same(recordBefore, EXPECTED_RECORD) || !same(recordAfter, EXPECTED_RECORD)) {
    fail("HF_RECORD_BRACKET_INVALID");
  }
  const treeBefore = replayTreeBracket("before", supportBytes, supportManifest);
  const treeAfter = replayTreeBracket("after", supportBytes, supportManifest);
  if (treeBefore.snapshotHash !== treeAfter.snapshotHash
    || !same(treeBefore.entries, treeAfter.entries)) fail("HF_TREE_BRACKET_INVALID");
  const selectedEntries = validateHfProfile(treeBefore.entries);

  const githubTreeEntries = new Map();
  for (const repository of GITHUB_REPOSITORIES) {
    const branchUrl = `${GH_API_ORIGIN}/repos/${repository.repository}/branches/${repository.ref}`;
    const expectedProjection = { name: repository.ref, head: repository.head,
      tree: repository.tree };
    for (const bracket of ["before", "after"]) {
      const relative = `source-support/github-${repository.key}-branch-${bracket}.json`;
      if (supportManifest.get(relative)?.fetchUrl !== branchUrl
        || !same(githubBranchProjection(parseJson(supportBytes.get(relative),
          "GITHUB_BRANCH_SUPPORT_INVALID")), expectedProjection)) {
        fail("GITHUB_BRANCH_BRACKET_INVALID", `${repository.key}:${bracket}`);
      }
    }
    const treeUrl = `${GH_API_ORIGIN}/repos/${repository.repository}/git/trees/${repository.tree}?recursive=1`;
    const treeRelative = `source-support/github-${repository.key}-tree.json`;
    if (supportManifest.get(treeRelative)?.fetchUrl !== treeUrl) {
      fail("GITHUB_TREE_SUPPORT_URL_INVALID", repository.key);
    }
    githubTreeEntries.set(repository.key, normalizeGithubTree(
      parseJson(supportBytes.get(treeRelative), "GITHUB_TREE_SUPPORT_INVALID"), repository.tree));
  }
  if (CURATION_LINK_PATHS.some((remotePath) => githubTreeEntries.get("lerobotac")
    .some((entry) => entry.path === remotePath))) fail("CURATION_LINK_BOUNDARY_DRIFT");

  const hfManifest = new Map(manifest.hfRemoteObjects.map((entry) => [entry.path, entry]));
  if (hfManifest.size !== selectedEntries.length
    || manifest.hfRemoteObjects.length !== selectedEntries.length) {
    fail("HF_REMOTE_OBJECT_SET_INVALID");
  }
  for (const expected of selectedEntries) {
    const value = hfManifest.get(expected.path);
    validateHfManifestObject(value, expected);
  }
  const githubManifest = new Map(manifest.githubRemoteObjects.map((entry) =>
    [`${entry.repositoryKey}:${entry.path}`, entry]));
  if (githubManifest.size !== GITHUB_OBJECT_SPECS.length
    || manifest.githubRemoteObjects.length !== GITHUB_OBJECT_SPECS.length) {
    fail("GITHUB_REMOTE_OBJECT_SET_INVALID");
  }
  for (const spec of GITHUB_OBJECT_SPECS) {
    const value = githubManifest.get(`${spec.repositoryKey}:${spec.path}`);
    validateGithubManifestObject(value, spec);
    const treeEntry = githubTreeEntries.get(spec.repositoryKey)?.find((entry) =>
      entry.type === "blob" && entry.path === spec.path);
    if (!treeEntry || treeEntry.sha !== spec.gitBlobSha1 || treeEntry.size !== spec.sizeBytes) {
      fail("GITHUB_OBJECT_TREE_REPLAY_FAILED", spec.path);
    }
  }

  const expectedFiles = ["source-manifest.json", ...expectedSupportPaths,
    ...manifest.hfRemoteObjects.map((entry) => entry.localPath),
    ...manifest.githubRemoteObjects.map((entry) => entry.localPath)];
  if (new Set(expectedFiles).size !== expectedFiles.length) fail("SOURCE_FILE_SET_DUPLICATE");
  const directoryMap = expectedDirectoryMap(expectedFiles);
  const snapshots = [];
  for (const [relative, names] of [...directoryMap].sort(([left], [right]) =>
    left.split("/").length - right.split("/").length || left.localeCompare(right))) {
    requirePrivateDirectory(relative === "" ? root : safeTarget(root, relative), [...names], snapshots);
  }
  const secondManifestBytes = readPrivateStable(root, "source-manifest.json", snapshots,
    MAX_API_BYTES);
  if (!secondManifestBytes.equals(manifestBytes)) fail("SOURCE_MANIFEST_CHANGED");

  const actualBindings = [];
  const hfObjects = new Map();
  for (const expected of selectedEntries) {
    const value = hfManifest.get(expected.path);
    const bytes = readPrivateStable(root, value.localPath, snapshots,
      MAX_REMOTE_FILE_BYTES, value);
    checkRemoteBytes(remoteBinding(expected), bytes);
    actualBindings.push({ localPath: value.localPath, sizeBytes: bytes.length,
      sha256: sotacSha256(bytes) });
    hfObjects.set(value.localPath, value);
  }
  const githubObjects = new Map();
  for (const spec of GITHUB_OBJECT_SPECS) {
    const value = githubManifest.get(`${spec.repositoryKey}:${spec.path}`);
    const bytes = readPrivateStable(root, value.localPath, snapshots,
      MAX_REMOTE_FILE_BYTES, value);
    if (gitBlobOid(bytes) !== spec.gitBlobSha1) fail("GITHUB_GIT_REPLAY_FAILED", spec.path);
    actualBindings.push({ localPath: value.localPath, sizeBytes: bytes.length,
      sha256: sotacSha256(bytes) });
    githubObjects.set(value.localPath, value);
  }
  const documentation = validateDocumentationAndCode(root, snapshots, hfObjects,
    githubObjects);

  const { manifestHash, ...body } = manifest;
  if (manifestHash !== digest(`${SOTAC_SOURCE_SCHEMA}/manifest`, body)
    || manifest.schema !== SOTAC_SOURCE_SCHEMA
    || manifest.datasetId !== SOTAC_DATASET_ID
    || manifest.revision !== SOTAC_REVISION
    || manifest.frozenAt !== SOTAC_FROZEN_AT
    || !same(manifest.closure, {
      kind: "FULL_CURATED_NO_VIDEO_CLOSURE",
      selectionRule: "README.md, curation_map.json, and every file below annotations/, data/, meta/, sensors/",
      selectedFiles: EXPECTED_PROFILE.closureFiles,
      selectedBytes: EXPECTED_PROFILE.closureBytes,
      completeCuratedEpisodes: EXPECTED_PROFILE.episodes,
      completeCuratedTasks: EXPECTED_PROFILE.tasks,
      videoFilesExcluded: EXPECTED_PROFILE.videoFilesExcluded,
      videoBytesExcluded: EXPECTED_PROFILE.videoBytesExcluded,
      cameraBytesFetched: 0,
      rawArchiveFetched: false,
    })
    || !same(manifest.hf, {
      recordProjection: EXPECTED_RECORD,
      treeBefore: { pages: EXPECTED_PROFILE.treePages, entries: EXPECTED_PROFILE.treeEntries,
        snapshotHash: treeBefore.snapshotHash },
      treeAfter: { pages: EXPECTED_PROFILE.treePages, entries: EXPECTED_PROFILE.treeEntries,
        snapshotHash: treeAfter.snapshotHash },
    })
    || !same(manifest.github, {
      repositories: GITHUB_REPOSITORIES.map((entry) => ({ ...entry })),
      curationLinkBoundary: { linkedPaths: [...CURATION_LINK_PATHS],
        presentAtPinnedLerobotacHead: false, curationCodeReplayPerformed: false },
    })) fail("SOURCE_MANIFEST_BOUNDARY_INVALID");
  const sourceRoot = sourceRootFromBindings(actualBindings);
  if (manifest.sourceRoot !== sourceRoot) fail("SOURCE_ROOT_MISMATCH");
  recheckSnapshots([...bootstrapSnapshots, ...snapshots]);
  return Object.freeze({ ok: true, verificationLevel: "FULL_SOURCE_BYTE_REPLAY",
    sourceDirectory: root, manifest, manifestFileSha256: sotacSha256(manifestBytes),
    sourceRoot, treeSnapshotHash: treeBefore.snapshotHash, selectedEntries,
    hfObjects, githubObjects, documentation });
}

const SOTAC_REPLAY_PYTHON = String.raw`
import bisect
import collections
import csv
import glob
import hashlib
import json
import math
import os
import statistics
import struct
import sys

import pyarrow.parquet as pq

root = os.path.abspath(sys.argv[1])

def die(code):
    raise RuntimeError("SOTAC_REPLAY_" + code)

def load_json(relative):
    with open(os.path.join(root, relative), "r", encoding="utf-8") as handle:
        return json.load(handle)

def q_tenth(value):
    number = float(value)
    if not math.isfinite(number):
        die("NONFINITE_FORCE")
    quantized = int(round(number * 10.0))
    if abs(number * 10.0 - quantized) > 0.0002 or quantized < -32768 or quantized > 32767:
        die("FORCE_NOT_TENTH_NEWTON_GRID")
    return quantized

def vector_digest(values):
    quantized = [q_tenth(value) for value in values]
    return hashlib.sha256(struct.pack("<" + "h" * len(quantized), *quantized)).digest()

def finite_vector(values, size, code):
    if not isinstance(values, list) or len(values) != size:
        die(code + "_SHAPE")
    for value in values:
        if not math.isfinite(float(value)):
            die(code + "_NONFINITE")

info = load_json("meta/info.json")
curation = load_json("curation_map.json")
episode_annotations = load_json("annotations/episode_annotations.json")

if (info.get("total_episodes") != 63 or info.get("total_frames") != 25401
        or info.get("total_tasks") != 3 or info.get("fps") != 30):
    die("INFO_COUNTS")
feature = info.get("features", {}).get("observation.sensors.paxini_fingertip", {})
if feature.get("dtype") != "float32" or feature.get("shape") != [2, 52, 3]:
    die("INFO_TACTILE_FEATURE")

source_to_output = curation.get("map_source_to_output")
if not isinstance(source_to_output, dict) or len(source_to_output) != 63:
    die("CURATION_MAP_SIZE")
source_to_output = {int(key): int(value) for key, value in source_to_output.items()}
if sorted(source_to_output.values()) != list(range(63)) or len(set(source_to_output)) != 63:
    die("CURATION_MAP_BIJECTION")
output_to_source = {value: key for key, value in source_to_output.items()}

tasks_table = pq.read_table(os.path.join(root, "meta/tasks.parquet"))
if tasks_table.column_names != ["task_index", "task"] or tasks_table.num_rows != 3:
    die("TASK_TABLE_SCHEMA")
tasks = tasks_table.to_pylist()
task_names = [
    "Pick up the red foam ball and place it into the container",
    "Pick up the orange rubber ball and place it into the container",
    "Pick up the red cup and place it on top of the container",
]
if tasks != [{"task_index": index, "task": task_names[index]} for index in range(3)]:
    die("TASK_TABLE_VALUES")

data_files = sorted(glob.glob(os.path.join(root, "data", "chunk-*", "file-*.parquet")))
if len(data_files) != 3:
    die("DATA_FILE_COUNT")
main_by_episode = {index: [] for index in range(63)}
episode_frame_counts = collections.Counter()
task_frame_counts = collections.Counter()
task_episode_sets = collections.defaultdict(set)
main_nonzero_scalars = 0
main_max_abs_n = 0.0
main_tactile_scalars = 0
global_index = 0
expected_frame_by_episode = collections.Counter()
expected_columns = ["action", "observation.state",
                    "observation.sensors.paxini_fingertip", "timestamp",
                    "frame_index", "episode_index", "index", "task_index"]
data_file_rows = []
for file_path in data_files:
    table = pq.read_table(file_path)
    if table.column_names != expected_columns:
        die("DATA_SCHEMA")
    data_file_rows.append(table.num_rows)
    for batch in table.to_batches(max_chunksize=256):
        for row in batch.to_pylist():
            episode = int(row["episode_index"])
            frame = int(row["frame_index"])
            task = int(row["task_index"])
            index = int(row["index"])
            timestamp = float(row["timestamp"])
            if (episode not in main_by_episode or task not in range(3)
                    or index != global_index or frame != expected_frame_by_episode[episode]
                    or not math.isfinite(timestamp)
                    or abs(timestamp - frame / 30.0) > 0.000003):
                die("MAIN_INDEX_CONTINUITY")
            finite_vector(row["action"], 6, "ACTION")
            finite_vector(row["observation.state"], 6, "STATE")
            tactile = row["observation.sensors.paxini_fingertip"]
            if (not isinstance(tactile, list) or len(tactile) != 2
                    or any(not isinstance(finger, list) or len(finger) != 52 for finger in tactile)
                    or any(not isinstance(point, list) or len(point) != 3
                           for finger in tactile for point in finger)):
                die("TACTILE_SHAPE")
            finger_hashes = []
            for finger in tactile:
                flattened = [component for point in finger for component in point]
                finger_hashes.append(vector_digest(flattened))
                for value in flattened:
                    number = float(value)
                    main_tactile_scalars += 1
                    if q_tenth(number) != 0:
                        main_nonzero_scalars += 1
                    main_max_abs_n = max(main_max_abs_n, abs(number))
            main_by_episode[episode].append((timestamp, finger_hashes[0], finger_hashes[1]))
            episode_frame_counts[episode] += 1
            task_frame_counts[task] += 1
            task_episode_sets[task].add(episode)
            expected_frame_by_episode[episode] += 1
            global_index += 1

if global_index != 25401 or main_tactile_scalars != 25401 * 2 * 52 * 3:
    die("MAIN_TOTALS")
if sorted(episode_frame_counts) != list(range(63)):
    die("MAIN_EPISODE_SET")

episode_meta_path = os.path.join(root, "meta", "episodes", "chunk-000", "file-000.parquet")
episode_meta_table = pq.read_table(episode_meta_path)
if episode_meta_table.num_rows != 63 or "source_raw_episode" not in episode_meta_table.column_names:
    die("EPISODE_META_SCHEMA")
episode_meta = episode_meta_table.to_pylist()
cursor = 0
for expected_episode, row in enumerate(episode_meta):
    length = int(row["length"])
    if (int(row["episode_index"]) != expected_episode
            or length != episode_frame_counts[expected_episode]
            or int(row["dataset_from_index"]) != cursor
            or int(row["dataset_to_index"]) != cursor + length
            or int(row["source_raw_episode"]) != output_to_source[expected_episode]
            or row["tasks"] != [task_names[next(task for task in range(3)
                if expected_episode in task_episode_sets[task])]]):
        die("EPISODE_META_CROSSWALK")
    cursor += length
if cursor != 25401:
    die("EPISODE_META_TOTAL")

summary_episodes = episode_annotations.get("episodes")
if (episode_annotations.get("format") != "sotac episode annotations v3"
        or not isinstance(summary_episodes, dict)
        or sorted(int(key) for key in summary_episodes) != list(range(63))):
    die("SUMMARY_ANNOTATIONS_SCHEMA")
publisher_results = collections.Counter()
publisher_attempts = collections.Counter()
distractor_episodes = 0
event_note_episodes = 0
for episode in range(63):
    row = summary_episodes[str(episode)]
    result = row.get("result")
    attempts = row.get("attempts")
    if (result not in {"success", "failure", "partial"}
            or not isinstance(attempts, int) or attempts < 1
            or row.get("reviewed") is not True
            or row.get("source_raw_episode") != output_to_source[episode]
            or row.get("task") != task_names[next(task for task in range(3)
                if episode in task_episode_sets[task])]):
        die("SUMMARY_ANNOTATION_VALUE")
    publisher_results[result] += 1
    publisher_attempts[attempts] += 1
    distractor_episodes += int("distractor" in row)
    event_note_episodes += int("events" in row)
if dict(publisher_results) != {"success": 57, "failure": 3, "partial": 3}:
    die("PUBLISHER_RESULT_COUNTS")
if dict(publisher_attempts) != {1: 53, 2: 9, 3: 1}:
    die("PUBLISHER_ATTEMPT_COUNTS")

atom_styles = collections.Counter()
atom_roles = collections.Counter()
annotation_atoms = 0
for episode in range(63):
    relative = os.path.join("annotations", f"episode_{episode:06d}.json")
    value = load_json(relative)
    atoms = value.get("atoms")
    if (value.get("schema_version") != 1 or value.get("episode_index") != episode
            or not isinstance(value.get("saved_at"), str)
            or not isinstance(atoms, list) or not atoms):
        die("EPISODE_ANNOTATION_SCHEMA")
    max_time = (episode_frame_counts[episode] - 1) / 30.0
    for atom in atoms:
        timestamp = atom.get("timestamp")
        if (atom.get("role") not in {"assistant", "user"}
                or atom.get("style") not in {"subtask", "interjection"}
                or not isinstance(atom.get("content"), str)
                or not isinstance(timestamp, (int, float)) or not math.isfinite(timestamp)
                or timestamp < 0 or timestamp > max_time + 0.2):
            die("ANNOTATION_ATOM_INVALID")
        annotation_atoms += 1
        atom_styles[atom["style"]] += 1
        atom_roles[atom["role"]] += 1

header = ["timestamp_ns", "frame_status", "time_calibration_offset_ns",
          "calibrated_timestamp_ns", "fx", "fy", "fz"]
for point in range(52):
    header.extend([f"p_{point:02d}_fx", f"p_{point:02d}_fy", f"p_{point:02d}_fz"])

raw_dual_timesteps = 0
raw_in_main_window_timesteps = 0
raw_finger_rows = 0
raw_force_scalars = 0
raw_distributed_scalars = 0
raw_nonzero_force_scalars = 0
raw_max_abs_n = 0.0
raw_row_counts = []
raw_periods_ns = []
first_raw_alignment_deltas_ns = []
sidecar_tail_after_main_ns = []
frame_status_counts = collections.Counter()
calibration_offset_counts = collections.Counter()
same_episode_matches = 0
same_episode_unmatched = 0
latest_matches = 0
bounded_window_matches = 0

for episode in range(63):
    alignment = load_json(os.path.join("sensors", "paxini_fingertip",
                                        f"episode_{episode:06d}", "alignment.json"))
    start_ns = alignment.get("episode_start_timestamp_ns")
    if (not isinstance(start_ns, int) or alignment.get("clock") != "time.time_ns (epoch)"
            or alignment.get("source_raw_episode") != output_to_source[episode]):
        die("ALIGNMENT_SCHEMA")
    finger_times = []
    finger_hashes = []
    for finger in (1, 2):
        csv_path = os.path.join(root, "sensors", "paxini_fingertip",
                                f"episode_{episode:06d}", f"sensor_{finger}.csv")
        times = []
        hashes = []
        previous_time = None
        with open(csv_path, "r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.reader(handle)
            try:
                observed_header = next(reader)
            except StopIteration:
                die("RAW_CSV_EMPTY")
            if observed_header != header:
                die("RAW_CSV_HEADER")
            for row in reader:
                if len(row) != 163:
                    die("RAW_CSV_WIDTH")
                timestamp_ns = int(row[0])
                frame_status = int(row[1])
                offset_ns = int(row[2])
                calibrated_ns = int(row[3])
                if calibrated_ns != timestamp_ns + offset_ns:
                    die("RAW_CALIBRATION_ARITHMETIC")
                if previous_time is not None and calibrated_ns <= previous_time:
                    die("RAW_TIME_ORDER")
                if previous_time is not None:
                    raw_periods_ns.append(calibrated_ns - previous_time)
                previous_time = calibrated_ns
                forces = [float(value) for value in row[4:]]
                quantized = [q_tenth(value) for value in forces]
                raw_force_scalars += len(quantized)
                raw_distributed_scalars += len(quantized) - 3
                raw_nonzero_force_scalars += sum(value != 0 for value in quantized)
                if quantized:
                    raw_max_abs_n = max(raw_max_abs_n, max(abs(value) for value in quantized) / 10.0)
                times.append(calibrated_ns)
                hashes.append(vector_digest(row[7:]))
                frame_status_counts[str(frame_status)] += 1
                calibration_offset_counts[str(offset_ns)] += 1
        if not times:
            die("RAW_CSV_NO_ROWS")
        finger_times.append(times)
        finger_hashes.append(hashes)
        raw_finger_rows += len(times)
    if finger_times[0] != finger_times[1] or len(finger_hashes[0]) != len(finger_hashes[1]):
        die("DUAL_FINGER_TIME_MISMATCH")
    times = finger_times[0]
    raw_dual_timesteps += len(times)
    raw_row_counts.append(len(times))
    first_raw_alignment_deltas_ns.append(times[0] - start_ns)
    main_end_ns = start_ns + round(main_by_episode[episode][-1][0] * 1_000_000_000)
    raw_in_main_window_timesteps += bisect.bisect_right(times, main_end_ns)
    sidecar_tail_after_main_ns.append(times[-1] - main_end_ns)
    sets = [set(finger_hashes[0]), set(finger_hashes[1])]
    for timestamp, hash_one, hash_two in main_by_episode[episode]:
        target = start_ns + round(timestamp * 1_000_000_000)
        index = bisect.bisect_right(times, target) - 1
        if index < 0:
            index = 0
        for finger, main_hash in enumerate((hash_one, hash_two)):
            if main_hash in sets[finger]:
                same_episode_matches += 1
            else:
                same_episode_unmatched += 1
            if finger_hashes[finger][index] == main_hash:
                latest_matches += 1
                bounded_window_matches += 1
            elif any(finger_hashes[finger][candidate] == main_hash
                     for candidate in range(max(0, index - 40), min(len(times), index + 41))):
                bounded_window_matches += 1

if raw_finger_rows != raw_dual_timesteps * 2:
    die("RAW_DENOMINATOR_PARITY")
if raw_force_scalars != raw_finger_rows * 159 or raw_distributed_scalars != raw_finger_rows * 156:
    die("RAW_SCALAR_TOTAL")
if same_episode_unmatched != 0 or same_episode_matches != 25401 * 2:
    die("RAW_MAIN_VECTOR_CROSSWALK")

task_breakdown = []
for task in range(3):
    task_breakdown.append({
        "taskIndex": task,
        "task": task_names[task],
        "episodes": len(task_episode_sets[task]),
        "frames": task_frame_counts[task],
    })

selected_raw_indices = sorted(source_to_output)
missing_within_span = sorted(set(range(selected_raw_indices[-1] + 1)) - set(selected_raw_indices))
result = {
    "dataParquetFiles": len(data_files),
    "dataFileRows": data_file_rows,
    "metaEpisodeRows": len(episode_meta),
    "metaTaskRows": len(tasks),
    "episodes": 63,
    "frames": global_index,
    "tasks": 3,
    "taskBreakdown": task_breakdown,
    "actionRows": global_index,
    "stateRows": global_index,
    "mainTactileFingerVectors": global_index * 2,
    "mainTactileScalarValues": main_tactile_scalars,
    "mainTactileNonzeroScalarValues": main_nonzero_scalars,
    "mainTactileMaxAbsN": round(main_max_abs_n, 6),
    "mainTactileValuesOnTenthNewtonGrid": True,
    "rawCsvFiles": 126,
    "alignmentFiles": 63,
    "rawDualFingerTimesteps": raw_dual_timesteps,
    "rawFingerSampleRows": raw_finger_rows,
    "rawForceScalarValues": raw_force_scalars,
    "rawDistributedForceScalarValues": raw_distributed_scalars,
    "rawNonzeroForceScalarValues": raw_nonzero_force_scalars,
    "rawMaxAbsN": round(raw_max_abs_n, 6),
    "rawValuesOnTenthNewtonGrid": True,
    "rawTimestepsPerEpisode": {
        "minimum": min(raw_row_counts),
        "maximum": max(raw_row_counts),
        "total": raw_dual_timesteps,
    },
    "rawTiming": {
        "medianPeriodNs": int(statistics.median(raw_periods_ns)),
        "medianEffectiveHz": round(1_000_000_000 / statistics.median(raw_periods_ns), 6),
        "minimumPeriodNs": min(raw_periods_ns),
        "maximumPeriodNs": max(raw_periods_ns),
        "firstRawAlignmentDeltaNsMinimum": min(first_raw_alignment_deltas_ns),
        "firstRawAlignmentDeltaNsMaximum": max(first_raw_alignment_deltas_ns),
        "rawInMainWindowDualFingerTimesteps": raw_in_main_window_timesteps,
        "sidecarTailAfterMainNsMinimum": min(sidecar_tail_after_main_ns),
        "sidecarTailAfterMainNsMaximum": max(sidecar_tail_after_main_ns),
    },
    "frameStatusCountsAcrossFingerRows": dict(sorted(frame_status_counts.items())),
    "calibrationOffsetCountsAcrossFingerRows": dict(sorted(calibration_offset_counts.items())),
    "crosswalk": {
        "sameEpisodeRawVectorMatches": same_episode_matches,
        "sameEpisodeRawVectorUnmatched": same_episode_unmatched,
        "latestAtOrBeforeTimestampMatches": latest_matches,
        "boundedFortySampleWindowMatches": bounded_window_matches,
        "exactTimestampIdentityEstablished": False,
    },
    "publisherAnnotations": {
        "resultLabels": {key: publisher_results[key] for key in ("success", "failure", "partial")},
        "annotatedWithinEpisodeAttempts": sum(key * value for key, value in publisher_attempts.items()),
        "episodesWithMultipleAnnotatedAttempts": sum(value for key, value in publisher_attempts.items() if key > 1),
        "maximumAnnotatedAttemptsInEpisode": max(publisher_attempts),
        "distractorEpisodes": distractor_episodes,
        "eventNoteEpisodes": event_note_episodes,
        "timeAlignedAtomFiles": 63,
        "timeAlignedAtoms": annotation_atoms,
        "atomStyles": dict(sorted(atom_styles.items())),
        "atomRoles": dict(sorted(atom_roles.items())),
    },
    "curationMap": {
        "selectedRawEpisodeIds": 63,
        "minimumRawEpisodeId": selected_raw_indices[0],
        "maximumRawEpisodeId": selected_raw_indices[-1],
        "missingRawIdsWithinObservedSpan": len(missing_within_span),
        "missingRawIdListWithinObservedSpan": missing_within_span,
        "mappingBijective": True,
    },
}
print(json.dumps(result, sort_keys=True, separators=(",", ":")))
`;

function runSotacReplay(hfDirectory, pythonExecutable) {
  const result = spawnSync(pythonExecutable, ["-c", SOTAC_REPLAY_PYTHON, hfDirectory], {
    encoding: "utf8",
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", PYTHONNOUSERSITE: "1" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("PYTHON_REPLAY_FAILED", `${result.status}:${result.signal}:${result.stderr}`);
  }
  let parsed;
  try { parsed = JSON.parse(result.stdout); }
  catch { fail("PYTHON_REPLAY_JSON_INVALID"); }
  return parsed;
}

function replayHash(value) {
  return digest("outsider/sotac-so101-tactile-replay/v1", value);
}

export function extractSotacSo101TactileReplay(sourceDirectory, options = {}) {
  const source = verifySotacSo101SourceDirectory(sourceDirectory);
  const replay = runSotacReplay(path.join(source.sourceDirectory, "hf"),
    options.pythonExecutable ?? ".venv/bin/python");
  return Object.freeze({ source, replay,
    replayHash: replayHash(replay) });
}

function buildSotacReportBody(extracted) {
  const { source, replay } = extracted;
  return {
    schema: SOTAC_REPORT_SCHEMA,
    generatedAt: SOTAC_FROZEN_AT,
    artifactKind: "SO101_CURATED_TACTILE_TELEOP_CORPUS",
    source: {
      datasetId: SOTAC_DATASET_ID,
      revision: SOTAC_REVISION,
      repositoryVisibility: "PUBLIC_UNGATED",
      datasetLicense: "Apache-2.0",
      recordLastModified: EXPECTED_RECORD.lastModified,
      recordUsedStorageBytes: EXPECTED_RECORD.usedStorage,
      releaseDeclaredDate: "2026-08-26",
      linkedRecordingFork: {
        repository: SOTAC_LEROBOTAC_REPOSITORY,
        ref: SOTAC_LEROBOTAC_REF,
        head: SOTAC_LEROBOTAC_HEAD,
        tree: SOTAC_LEROBOTAC_TREE,
        license: "Apache-2.0",
      },
      linkedSensorSdk: {
        repository: SOTAC_PAXINI_REPOSITORY,
        ref: SOTAC_PAXINI_REF,
        head: SOTAC_PAXINI_HEAD,
        tree: SOTAC_PAXINI_TREE,
        releasedVersion: "0.1.0",
        license: "MIT",
      },
    },
    acquisition: {
      closureKind: "FULL_CURATED_NO_VIDEO_CLOSURE",
      selectedFiles: EXPECTED_PROFILE.closureFiles,
      selectedBytes: EXPECTED_PROFILE.closureBytes,
      hfTreePagesReplayedBefore: EXPECTED_PROFILE.treePages,
      hfTreePagesReplayedAfter: EXPECTED_PROFILE.treePages,
      hfTreeEntries: EXPECTED_PROFILE.treeEntries,
      videoFilesExcluded: EXPECTED_PROFILE.videoFilesExcluded,
      videoBytesExcluded: EXPECTED_PROFILE.videoBytesExcluded,
      cameraBytesFetched: 0,
      rawArchiveFetched: false,
      noSamplingWithinCuratedRelease: true,
      noClobber: true,
      privateFilesystemModes: true,
    },
    sourceReplay: {
      verificationLevel: "FULL_SOURCE_REDERIVED",
      sourceManifestHash: source.manifest.manifestHash,
      sourceManifestFileSha256: source.manifestFileSha256,
      sourceRoot: source.sourceRoot,
      hfTreeSnapshotHash: source.treeSnapshotHash,
      replayHash: extracted.replayHash,
      derived: replay,
    },
    population: {
      curatedRealRobotTeleopEpisodes: replay.episodes,
      sourceNativeActionRows: replay.actionRows,
      mainTableFrames30Hz: replay.frames,
      tasks: replay.tasks,
      taskBreakdown: replay.taskBreakdown,
      publisherResultLabels: replay.publisherAnnotations.resultLabels,
      publisherAnnotatedWithinEpisodeAttempts:
        replay.publisherAnnotations.annotatedWithinEpisodeAttempts,
      publisherEpisodesWithMultipleAnnotatedAttempts:
        replay.publisherAnnotations.episodesWithMultipleAnnotatedAttempts,
    },
    tactileEvidence: {
      physicalEffectSensorTelemetryPresent: true,
      independentWitnessPath: false,
      sensor: {
        model: "Paxini PX6AX-GEN3-DP-S2015-Elite",
        vendorPartCode: "PXSR-STDDP03G",
        fingers: 2,
        taxelsPerFinger: 52,
        axesPerTaxel: 3,
        moduleOrder: [10, 18],
        forceUnit: "newton",
        sourceScale: "0.1 N/LSB converted to newtons by pinned SDK code",
        coordinateUnit: "millimeters",
        coordinateAsset: "paxini_sdk/data/pxsr_stddp03g_points.json",
        firmwareZeroingAtConnect: true,
      },
      mainTable: {
        nominalHz: 30,
        shape: [2, 52, 3],
        fingerVectors: replay.mainTactileFingerVectors,
        scalarValues: replay.mainTactileScalarValues,
        nonzeroScalarValues: replay.mainTactileNonzeroScalarValues,
        maximumAbsoluteN: replay.mainTactileMaxAbsN,
        tenthNewtonGridVerified: replay.mainTactileValuesOnTenthNewtonGrid,
      },
      rawSidecars: {
        csvFiles: replay.rawCsvFiles,
        alignmentFiles: replay.alignmentFiles,
        dualFingerTimesteps: replay.rawDualFingerTimesteps,
        fingerSampleRows: replay.rawFingerSampleRows,
        forceScalarValues: replay.rawForceScalarValues,
        distributedForceScalarValues: replay.rawDistributedForceScalarValues,
        nonzeroForceScalarValues: replay.rawNonzeroForceScalarValues,
        maximumAbsoluteN: replay.rawMaxAbsN,
        tenthNewtonGridVerified: replay.rawValuesOnTenthNewtonGrid,
        timing: replay.rawTiming,
        frameStatusCountsAcrossFingerRows: replay.frameStatusCountsAcrossFingerRows,
        calibrationOffsetCountsAcrossFingerRows: replay.calibrationOffsetCountsAcrossFingerRows,
      },
      mainToRawCrosswalk: {
        ...replay.crosswalk,
        sameEpisodeVectorContainmentEstablished:
          replay.crosswalk.sameEpisodeRawVectorUnmatched === 0,
        temporalSelectionRuleClaimed: false,
        note: "Alignment anchors and same-episode vector containment are verified; asynchronous held-latest sampling does not establish one exact raw-row identity for every 30 Hz frame.",
      },
      sidecarWindowBoundary: {
        rawSidecarsMayExtendBeyondCuratedMainTableWindow: true,
        rawInMainWindowDualFingerTimesteps:
          replay.rawTiming.rawInMainWindowDualFingerTimesteps,
        sidecarTailAfterMainNsMinimum: replay.rawTiming.sidecarTailAfterMainNsMinimum,
        sidecarTailAfterMainNsMaximum: replay.rawTiming.sidecarTailAfterMainNsMaximum,
        tailRowsAreAdditionalEpisodes: false,
        tailRowsAreAdditionalAttempts: false,
      },
    },
    annotationEvidence: {
      publisherHumanReviewed: true,
      publisherResultLabelEpisodes: 63,
      publisherResultLabels: replay.publisherAnnotations.resultLabels,
      resultLabelsIndependentlyVerified: 0,
      timeAlignedAtomFiles: replay.publisherAnnotations.timeAlignedAtomFiles,
      timeAlignedAtoms: replay.publisherAnnotations.timeAlignedAtoms,
      atomStyles: replay.publisherAnnotations.atomStyles,
      atomRoles: replay.publisherAnnotations.atomRoles,
      distractorEpisodes: replay.publisherAnnotations.distractorEpisodes,
      eventNoteEpisodes: replay.publisherAnnotations.eventNoteEpisodes,
      languageAndTactileEventsArePublisherAnnotations: true,
    },
    curationBoundary: {
      curatedRelease: true,
      cardDeclaresRemovedCategories: [
        "contact_fault",
        "operator_visibility",
        "sensor_fault",
      ],
      taskOnsetTrimmingDeclared: true,
      releasedPopulationIsProspectiveOpportunityCensus: false,
      releasedPopulationIsCompleteAttemptCensus: false,
      publisherAttemptAnnotationsAreCompleteAttemptCensus: false,
      rawArchiveAcquired: false,
      curationMap: replay.curationMap,
      linkedCurationScript: "curate_tactile_dataset.py",
      linkedCurationSpec: "curation_sotac_v2.json",
      linkedFilesPresentAtPinnedRecordingForkHead: false,
      curationCodeReplayPerformed: false,
      cardCurationReproducibilityClaimEstablishedByThisClosure: false,
      deletedRunCountInferred: null,
      selectionBiasMaterial: true,
    },
    segmentCoverage: {
      opportunityCensus: { units: 0, complete: false,
        reason: "Publisher removed fault/operator-visible runs and the raw archive was not acquired." },
      delegationAuthorization: { units: 0, complete: false },
      action: { episodes: 63, rows: replay.actionRows,
        sourceNativeTeleoperation: true, outsiderExecutedActions: 0 },
      effect: { episodesWithDirectTactileTelemetry: 63,
        mainFrames: replay.frames, rawDualFingerTimesteps: replay.rawDualFingerTimesteps,
        independentWitnessEpisodes: 0 },
      outcome: { publisherLabels: 63, independentOutcomeRecords: 0 },
      recovery: { publisherMultiAttemptEpisodeLabels:
        replay.publisherAnnotations.episodesWithMultipleAnnotatedAttempts,
        independentlyVerifiedRecoveryRecords: 0, completeAttemptCensus: false },
      longitudinal: { units: 0 },
      segmentsAreAdditive: false,
    },
    denominatorRegistry: {
      populations: [
        { denominatorClass: "CURATED_REAL_ROBOT_TELEOP_EPISODE", units: 63,
          sourceComponents: 1, completeWithinPinnedCuratedRelease: true,
          completeOpportunityOrFailureCensus: false },
        { denominatorClass: "MAIN_TABLE_30HZ_FRAME", units: replay.frames,
          sourceComponents: 3, representsSameEpisodes: true },
        { denominatorClass: "RAW_DUAL_FINGER_TACTILE_TIMESTEP",
          units: replay.rawDualFingerTimesteps, sourceComponents: 126,
          twoFingerRowsAreOneTimestep: true, representsSameEpisodes: true },
        { denominatorClass: "PUBLISHER_EPISODE_RESULT_LABEL", units: 63,
          sourceComponents: 1, independentlyVerified: false },
      ],
      rawFingerRowsAreAdditionalTimesteps: false,
      rawAndMainRepresentationsAreAdditionalEpisodes: false,
      annotatedAttemptCountsAreAStandaloneCensusDenominator: false,
      crossDomainTotal: null,
      crossDomainAdditionProhibited: true,
    },
    rightsPrivacyRevisionAndUse: {
      rights: {
        datasetLicense: "Apache-2.0",
        recordingForkLicense: "Apache-2.0",
        sensorSdkLicense: "MIT",
        licenseBytesPinned: true,
        rightsHolderIdentityIndependentlyVerified: false,
      },
      privacy: {
        publisherPrivacyGuaranteePresent: false,
        cameraBytesExcluded: true,
        preciseEpochAlignmentTimestampsRetained: 63,
        humanOperatorTeleoperationDeclared: true,
        useSpecificPrivacyClearance: "NOT_PROVIDED",
      },
      revision: {
        exactRevisionPinned: true,
        growingCorpusLatestExhaustionClaimed: false,
        globalExhaustion: false,
      },
      use: {
        offlineEvaluationOrResearchUseOnlyForThisArtifact: true,
        productionTrainingAuthorized: false,
        authorizedTrainingRows: 0,
        authorizedTrainingJobs: 0,
        authorizedTrainingPerformed: 0,
      },
    },
    contributionAndAuthorityBoundary: {
      rawUserCommunicationRecords: 0,
      videoFilesFetched: 0,
      networkContributionRecords: 0,
      CEURecords: 0,
      outsiderExecutedActions: 0,
      delegationRecords: 0,
      authorityRecords: 0,
      authorityDelta: 0,
    },
    declaredScope: {
      declaredScopeExhausted: true,
      declaredScope: "All semantic files in the fixed curated revision except camera videos and .gitattributes.",
      globalExhaustion: false,
      externalDiscoveryPerformed: false,
    },
  };
}

export function buildSotacSo101TactileFromSource(sourceDirectory, options = {}) {
  const extracted = extractSotacSo101TactileReplay(sourceDirectory, options);
  const body = buildSotacReportBody(extracted);
  return Object.freeze({ ...body,
    artifactHash: digest(`${SOTAC_REPORT_SCHEMA}/artifact`, body) });
}

function addError(errors, condition, code) {
  if (!condition) errors.push(code);
}

export function verifySotacSo101TactileReport(report) {
  const errors = [];
  addError(errors, exactObject(report), "REPORT_OBJECT");
  if (!exactObject(report)) return Object.freeze({ ok: false, errors });
  const { artifactHash, ...body } = report;
  addError(errors, report.schema === SOTAC_REPORT_SCHEMA, "SCHEMA");
  addError(errors, report.generatedAt === SOTAC_FROZEN_AT, "FROZEN_AT");
  addError(errors, artifactHash === digest(`${SOTAC_REPORT_SCHEMA}/artifact`, body),
    "ARTIFACT_HASH");
  addError(errors, report.source?.datasetId === SOTAC_DATASET_ID
    && report.source?.revision === SOTAC_REVISION
    && report.source?.datasetLicense === "Apache-2.0"
    && report.source?.linkedRecordingFork?.head === SOTAC_LEROBOTAC_HEAD
    && report.source?.linkedRecordingFork?.tree === SOTAC_LEROBOTAC_TREE
    && report.source?.linkedSensorSdk?.head === SOTAC_PAXINI_HEAD
    && report.source?.linkedSensorSdk?.tree === SOTAC_PAXINI_TREE,
  "SOURCE_PIN");
  addError(errors, report.acquisition?.closureKind === "FULL_CURATED_NO_VIDEO_CLOSURE"
    && report.acquisition?.selectedFiles === EXPECTED_PROFILE.closureFiles
    && report.acquisition?.selectedBytes === EXPECTED_PROFILE.closureBytes
    && report.acquisition?.videoFilesExcluded === EXPECTED_PROFILE.videoFilesExcluded
    && report.acquisition?.videoBytesExcluded === EXPECTED_PROFILE.videoBytesExcluded
    && report.acquisition?.cameraBytesFetched === 0
    && report.acquisition?.noSamplingWithinCuratedRelease === true,
  "CLOSURE");
  const derived = report.sourceReplay?.derived;
  addError(errors, exactObject(derived)
    && report.sourceReplay?.verificationLevel === "FULL_SOURCE_REDERIVED"
    && HASH.test(report.sourceReplay?.sourceManifestHash ?? "")
    && HASH.test(report.sourceReplay?.sourceManifestFileSha256 ?? "")
    && HASH.test(report.sourceReplay?.sourceRoot ?? "")
    && HASH.test(report.sourceReplay?.hfTreeSnapshotHash ?? "")
    && report.sourceReplay?.replayHash === replayHash(derived), "SOURCE_REPLAY");
  addError(errors, derived?.episodes === 63 && derived?.frames === 25_401
    && derived?.tasks === 3 && derived?.actionRows === 25_401
    && derived?.stateRows === 25_401 && derived?.mainTactileFingerVectors === 50_802
    && derived?.mainTactileScalarValues === 7_925_112
    && derived?.rawCsvFiles === 126 && derived?.alignmentFiles === 63
    && derived?.rawFingerSampleRows === derived?.rawDualFingerTimesteps * 2
    && derived?.rawForceScalarValues === derived?.rawFingerSampleRows * 159
    && derived?.rawDistributedForceScalarValues === derived?.rawFingerSampleRows * 156
    && derived?.crosswalk?.sameEpisodeRawVectorMatches === 50_802
    && derived?.crosswalk?.sameEpisodeRawVectorUnmatched === 0
    && derived?.crosswalk?.exactTimestampIdentityEstablished === false,
  "REPLAY_COUNTS");
  addError(errors, same(derived?.taskBreakdown?.map((entry) => entry.episodes), [21, 22, 20])
    && same(derived?.publisherAnnotations?.resultLabels,
      { success: 57, failure: 3, partial: 3 })
    && derived?.publisherAnnotations?.annotatedWithinEpisodeAttempts === 74
    && derived?.publisherAnnotations?.episodesWithMultipleAnnotatedAttempts === 10,
  "PUBLISHER_COUNTS");
  addError(errors, report.tactileEvidence?.physicalEffectSensorTelemetryPresent === true
    && report.tactileEvidence?.independentWitnessPath === false
    && report.tactileEvidence?.sensor?.taxelsPerFinger === 52
    && report.tactileEvidence?.sensor?.forceUnit === "newton"
    && report.tactileEvidence?.sensor?.coordinateUnit === "millimeters"
    && report.tactileEvidence?.mainToRawCrosswalk?.sameEpisodeVectorContainmentEstablished === true
    && report.tactileEvidence?.mainToRawCrosswalk?.temporalSelectionRuleClaimed === false,
  "TACTILE_BOUNDARY");
  addError(errors, report.curationBoundary?.curatedRelease === true
    && report.curationBoundary?.releasedPopulationIsProspectiveOpportunityCensus === false
    && report.curationBoundary?.releasedPopulationIsCompleteAttemptCensus === false
    && report.curationBoundary?.linkedFilesPresentAtPinnedRecordingForkHead === false
    && report.curationBoundary?.curationCodeReplayPerformed === false
    && report.curationBoundary?.cardCurationReproducibilityClaimEstablishedByThisClosure === false
    && report.curationBoundary?.deletedRunCountInferred === null
    && report.curationBoundary?.selectionBiasMaterial === true,
  "CURATION_BOUNDARY");
  addError(errors, report.segmentCoverage?.opportunityCensus?.units === 0
    && report.segmentCoverage?.delegationAuthorization?.units === 0
    && report.segmentCoverage?.action?.episodes === 63
    && report.segmentCoverage?.action?.outsiderExecutedActions === 0
    && report.segmentCoverage?.effect?.episodesWithDirectTactileTelemetry === 63
    && report.segmentCoverage?.effect?.independentWitnessEpisodes === 0
    && report.segmentCoverage?.outcome?.publisherLabels === 63
    && report.segmentCoverage?.outcome?.independentOutcomeRecords === 0
    && report.segmentCoverage?.recovery?.independentlyVerifiedRecoveryRecords === 0
    && report.segmentCoverage?.longitudinal?.units === 0
    && report.segmentCoverage?.segmentsAreAdditive === false,
  "SEGMENT_BOUNDARY");
  addError(errors, Array.isArray(report.denominatorRegistry?.populations)
    && same(report.denominatorRegistry.populations.map((entry) => entry.denominatorClass), [
      "CURATED_REAL_ROBOT_TELEOP_EPISODE",
      "MAIN_TABLE_30HZ_FRAME",
      "RAW_DUAL_FINGER_TACTILE_TIMESTEP",
      "PUBLISHER_EPISODE_RESULT_LABEL",
    ])
    && report.denominatorRegistry?.populations?.[0]?.units === 63
    && report.denominatorRegistry?.populations?.[2]?.units === derived?.rawDualFingerTimesteps
    && report.denominatorRegistry?.rawFingerRowsAreAdditionalTimesteps === false
    && report.denominatorRegistry?.rawAndMainRepresentationsAreAdditionalEpisodes === false
    && report.denominatorRegistry?.annotatedAttemptCountsAreAStandaloneCensusDenominator === false
    && report.denominatorRegistry?.crossDomainTotal === null
    && report.denominatorRegistry?.crossDomainAdditionProhibited === true,
  "DENOMINATOR_BOUNDARY");
  addError(errors, report.annotationEvidence?.publisherResultLabelEpisodes === 63
    && report.annotationEvidence?.resultLabelsIndependentlyVerified === 0
    && report.annotationEvidence?.languageAndTactileEventsArePublisherAnnotations === true,
  "ANNOTATION_BOUNDARY");
  addError(errors, report.rightsPrivacyRevisionAndUse?.privacy?.publisherPrivacyGuaranteePresent === false
    && report.rightsPrivacyRevisionAndUse?.privacy?.useSpecificPrivacyClearance === "NOT_PROVIDED"
    && report.rightsPrivacyRevisionAndUse?.revision?.globalExhaustion === false
    && report.rightsPrivacyRevisionAndUse?.use?.productionTrainingAuthorized === false
    && report.rightsPrivacyRevisionAndUse?.use?.authorizedTrainingRows === 0
    && report.rightsPrivacyRevisionAndUse?.use?.authorizedTrainingJobs === 0
    && report.rightsPrivacyRevisionAndUse?.use?.authorizedTrainingPerformed === 0,
  "RIGHTS_PRIVACY_TRAINING_BOUNDARY");
  addError(errors, report.contributionAndAuthorityBoundary?.rawUserCommunicationRecords === 0
    && report.contributionAndAuthorityBoundary?.videoFilesFetched === 0
    && report.contributionAndAuthorityBoundary?.networkContributionRecords === 0
    && report.contributionAndAuthorityBoundary?.CEURecords === 0
    && report.contributionAndAuthorityBoundary?.outsiderExecutedActions === 0
    && report.contributionAndAuthorityBoundary?.delegationRecords === 0
    && report.contributionAndAuthorityBoundary?.authorityRecords === 0
    && report.contributionAndAuthorityBoundary?.authorityDelta === 0,
  "AUTHORITY_BOUNDARY");
  addError(errors, report.declaredScope?.declaredScopeExhausted === true
    && report.declaredScope?.globalExhaustion === false
    && report.declaredScope?.externalDiscoveryPerformed === false,
  "SCOPE_BOUNDARY");
  return Object.freeze({ ok: errors.length === 0, errors });
}

export function verifySotacSo101TactileWithSource(report, sourceDirectory, options = {}) {
  const standalone = verifySotacSo101TactileReport(report);
  if (!standalone.ok) return Object.freeze({ ...standalone,
    verificationLevel: "REPORT_INVALID" });
  const rebuilt = buildSotacSo101TactileFromSource(sourceDirectory, options);
  const errors = same(rebuilt, report) ? [] : ["SOURCE_REBUILD_MISMATCH"];
  return Object.freeze({ ok: errors.length === 0, errors,
    verificationLevel: errors.length === 0 ? "FULL_SOURCE_REDERIVED" : "SOURCE_MISMATCH" });
}

export function buildSotacSo101RunReceipt(report, reportBytes) {
  const reportCheck = verifySotacSo101TactileReport(report);
  if (!reportCheck.ok || !Buffer.isBuffer(reportBytes)
    || !reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_REPORT_INVALID");
  const body = {
    schema: SOTAC_RECEIPT_SCHEMA,
    issuedAt: SOTAC_FROZEN_AT,
    reportSchema: SOTAC_REPORT_SCHEMA,
    artifactHash: report.artifactHash,
    reportFileSha256: sotacSha256(reportBytes),
    sourceManifestHash: report.sourceReplay.sourceManifestHash,
    sourceRoot: report.sourceReplay.sourceRoot,
    publication: {
      noClobber: true,
      directoriesMode: "0700",
      filesMode: "0600",
      receiptWrittenLast: true,
    },
    boundaryTotals: {
      videoFilesFetched: 0,
      independentOutcomeRecords: 0,
      independentRecoveryRecords: 0,
      delegationRecords: 0,
      authorizedTrainingRows: 0,
      networkContributionRecords: 0,
      CEURecords: 0,
      authorityDelta: 0,
    },
  };
  return Object.freeze({ ...body,
    receiptHash: digest(`${SOTAC_RECEIPT_SCHEMA}/receipt`, body) });
}

export function verifySotacSo101RunReceipt(receipt, reportBytes) {
  const errors = [];
  if (!exactObject(receipt) || !Buffer.isBuffer(reportBytes)) {
    return Object.freeze({ ok: false, errors: ["RECEIPT_INPUT"] });
  }
  const { receiptHash, ...body } = receipt;
  addError(errors, receipt.schema === SOTAC_RECEIPT_SCHEMA, "RECEIPT_SCHEMA");
  addError(errors, receiptHash === digest(`${SOTAC_RECEIPT_SCHEMA}/receipt`, body),
    "RECEIPT_HASH");
  addError(errors, receipt.reportFileSha256 === sotacSha256(reportBytes),
    "RECEIPT_REPORT_HASH");
  let report = null;
  try { report = JSON.parse(reportBytes.toString("utf8")); }
  catch { errors.push("RECEIPT_REPORT_JSON"); }
  addError(errors, report !== null && receipt.artifactHash === report.artifactHash
    && receipt.sourceManifestHash === report.sourceReplay?.sourceManifestHash
    && receipt.sourceRoot === report.sourceReplay?.sourceRoot,
  "RECEIPT_BINDING");
  addError(errors, same(receipt.publication, {
    noClobber: true, directoriesMode: "0700", filesMode: "0600", receiptWrittenLast: true,
  }), "RECEIPT_PUBLICATION");
  addError(errors, same(receipt.boundaryTotals, {
    videoFilesFetched: 0, independentOutcomeRecords: 0, independentRecoveryRecords: 0,
    delegationRecords: 0, authorizedTrainingRows: 0, networkContributionRecords: 0,
    CEURecords: 0, authorityDelta: 0,
  }), "RECEIPT_BOUNDARIES");
  return Object.freeze({ ok: errors.length === 0, errors });
}

export function publishSotacSo101ArtifactDirectory(stagingDirectory, targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (existsSync(target)) fail("ARTIFACT_NO_CLOBBER", target);
  const stat = lstatSync(staging);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("ARTIFACT_STAGING_INVALID");
  const names = sorted(readdirSync(staging));
  if (!same(names, ["run-receipt.json", "sotac-so101-tactile.json", "source"])) {
    fail("ARTIFACT_STAGING_CONTENT_INVALID");
  }
  chmodSync(staging, 0o700);
  renameSync(staging, target);
  chmodSync(target, 0o700);
  return target;
}

export function verifySotacSo101ArtifactDirectory(artifactDirectory, options = {}) {
  const root = path.resolve(artifactDirectory);
  const snapshots = [];
  requirePrivateDirectory(root, ["run-receipt.json", "sotac-so101-tactile.json", "source"],
    snapshots);
  const reportBytes = readPrivateStable(root, "sotac-so101-tactile.json", snapshots,
    MAX_API_BYTES);
  const receiptBytes = readPrivateStable(root, "run-receipt.json", snapshots, MAX_API_BYTES);
  const report = parseJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
  const receipt = parseJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
  if (!reportBytes.equals(canonicalBytes(report)) || !receiptBytes.equals(canonicalBytes(receipt))) {
    fail("ARTIFACT_JSON_NOT_CANONICAL");
  }
  const reportCheck = verifySotacSo101TactileReport(report);
  const receiptCheck = verifySotacSo101RunReceipt(receipt, reportBytes);
  const replayCheck = verifySotacSo101TactileWithSource(report, path.join(root, "source"), options);
  recheckSnapshots(snapshots);
  const errors = [...reportCheck.errors, ...receiptCheck.errors, ...replayCheck.errors];
  return Object.freeze({ ok: errors.length === 0, errors,
    verificationLevel: errors.length === 0 ? "FULL_SOURCE_REDERIVED" : "INVALID",
    reportFileSha256: sotacSha256(reportBytes),
    receiptFileSha256: sotacSha256(receiptBytes),
    artifactHash: report.artifactHash,
    receiptHash: receipt.receiptHash,
    sourceManifestHash: report.sourceReplay?.sourceManifestHash,
    sourceRoot: report.sourceReplay?.sourceRoot });
}

export const SOTAC_SO101_CONSTANTS = Object.freeze({
  expectedRecord: EXPECTED_RECORD,
  expectedProfile: EXPECTED_PROFILE,
  githubRepositories: GITHUB_REPOSITORIES,
  githubObjectSpecs: GITHUB_OBJECT_SPECS,
  curationLinkPaths: CURATION_LINK_PATHS,
});
