/*
 * Direct SO-101 mechanical telemetry intake from the Neural Actuation Dataset.
 *
 * The exact Hugging Face revision and the exact linked GitHub HEAD are bracketed.
 * The closure contains all 100 canonical SO-101 CSV trajectories, the three SO-101
 * Parquet repacks, and byte-pinned documentation/config/loader code. The 100 videos
 * are explicitly excluded. Payload-derived force labels are never promoted to force
 * sensor measurements, task outcomes, recovery, delegation, or authority.
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

export const NAD_DATASET_ID = "frankzydou/NAD";
export const NAD_REVISION = "88838bce278e381a830a71af83e27dfbb1dac414";
export const NAD_GITHUB_REPOSITORY = "Frank-ZY-Dou/Dynamics-Modeling";
export const NAD_GITHUB_HEAD = "729d0fdacf48e4051354c9e7dd92ce256d7a0a20";
export const NAD_GITHUB_TREE = "791cdfc1c7dda7106061bb26c2f6a6c548f52a61";
export const NAD_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const NAD_SOURCE_SCHEMA = "outsider/nad-so101-pinned-source/v1";
export const NAD_REPORT_SCHEMA = "outsider/nad-so101-mechanics/v1";
export const NAD_RECEIPT_SCHEMA = "outsider/nad-so101-mechanics-run-receipt/v1";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${NAD_DATASET_ID}/revision/${NAD_REVISION}`;
const TREE_PATH = `/api/datasets/${NAD_DATASET_ID}/tree/${NAD_REVISION}`;
const TREE_URL = `${HF_ORIGIN}${TREE_PATH}?recursive=true&expand=true`;
const RAW_ROOT = `${HF_ORIGIN}/datasets/${NAD_DATASET_ID}/resolve/${NAD_REVISION}`;
const GH_API_ORIGIN = "https://api.github.com";
const GH_RAW_ORIGIN = "https://raw.githubusercontent.com";
const GH_HEAD_URL = `${GH_API_ORIGIN}/repos/${NAD_GITHUB_REPOSITORY}/commits/main`;
const GH_TREE_URL = `${GH_API_ORIGIN}/repos/${NAD_GITHUB_REPOSITORY}/git/trees`;
const GH_RAW_ROOT = `${GH_RAW_ORIGIN}/${NAD_GITHUB_REPOSITORY}/${NAD_GITHUB_HEAD}`;
const README_PATH = "README.md";
const RAW_PREFIX = "data/so101/";
const PARQUET_PREFIX = "parquet/so101/";
const VIDEO_PREFIX = "videos/so101/";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const MAX_API_BYTES = 4 * 1024 * 1024;
const MAX_REMOTE_FILE_BYTES = 2 * 1024 * 1024;
const MAX_TREE_PAGES = 32;
const FETCH_TIMEOUT_MS = 180_000;
const DOWNLOAD_CONCURRENCY = 6;
const ALLOWED_REDIRECT_HOST = /^(huggingface\.co|[a-z0-9.-]+\.hf\.co|api\.github\.com|raw\.githubusercontent\.com)$/iu;
const EXPECTED_TREE_SNAPSHOT_HASH =
  "sha256:e9f4a134d65b569797fcceaa5cdd04fcb56fe17d8a413a60a5fce588097e7d73";
const EXPECTED_HF_DATA_TREE = "3a6be23a226ebee48dd606c1e5f25a5ad4281829";
const EXPECTED_SO101_TREE = "2b401d9362f42fffdf07e45adbd9dbd19107fa68";
const EXPECTED_PROFILE = Object.freeze({
  treePages: 27,
  treeEntries: 1302,
  repositoryFiles: 925,
  hfObjects: 104,
  hfBytes: 25_826_291,
  readmeBytes: 13_552,
  rawFiles: 100,
  rawBytes: 24_207_793,
  parquetFiles: 3,
  parquetBytes: 1_604_946,
  trainRawFiles: 80,
  validationRawFiles: 10,
  testRawFiles: 10,
  videoFilesExcluded: 100,
  videoBytesExcluded: 379_638_513,
  githubObjects: 7,
  githubBytes: 192_712,
});

const GITHUB_TREE_SPECS = Object.freeze([
  { key: "root", sha: NAD_GITHUB_TREE },
  { key: "neural-actuator", sha: "b554acbb59f8f0b2a7cfb35b550724b290bd3178" },
  { key: "configs", sha: "e7131092248e9837af4c06dde189da19101b25b0" },
  { key: "data", sha: EXPECTED_HF_DATA_TREE },
  { key: "so101", sha: EXPECTED_SO101_TREE },
]);

const GITHUB_OBJECT_SPECS = Object.freeze([
  {
    path: "NeuralActuator/LICENSE", sizeBytes: 1083,
    gitBlobSha1: "e52e2f6871f4301ab22a0c259a9854926a161071",
    sha256: "sha256:f7dca68ac5ef25ab25986c9d3eb2b7c386b945b09ea13f668518b566aae427c5",
  },
  {
    path: "NeuralActuator/README.md", sizeBytes: 57_825,
    gitBlobSha1: "f83e4905e0110f1221ae20b2190ac1ed54b3692d",
    sha256: "sha256:659240d4d0790db1ecaffbb38293ec6a7af4f38664137ca83f6504dbfe5f2a32",
  },
  {
    path: "NeuralActuator/configs/so101_extended.yaml", sizeBytes: 1508,
    gitBlobSha1: "0d0842d18f6d3e667e4f0f0ab016bf5d2191b78a",
    sha256: "sha256:8152db80590b888572a302fc6b0f1968339332c91410e10b07411b9630c597c9",
  },
  {
    path: "NeuralActuator/configs/so101_extended_ft.yaml", sizeBytes: 1810,
    gitBlobSha1: "eb6d782b2c630d307ea73854d309e4ce911b5a31",
    sha256: "sha256:97e48d9a80a72e5d64a0a3ebb619137da3e8cb595baa1d0f8a25a4c7e14def05",
  },
  {
    path: "NeuralActuator/configs/so101_weight.yaml", sizeBytes: 1418,
    gitBlobSha1: "beaaf21dccdf9a79980aed9db94dfd84cc08477a",
    sha256: "sha256:ae679cf84f71c8aa3c4d1fb7d5b4979ead6381045ed7046119a1e745f082a2f9",
  },
  {
    path: "NeuralActuator/train_actuator_diffsim_so101.py", sizeBytes: 96_208,
    gitBlobSha1: "77b36d3a1e669c6af9de79c8768fa300fa709443",
    sha256: "sha256:03239e31a61f08b864739c8ad31fc7b0f942c879f3eb830fb4012dae1874a0c9",
  },
  {
    path: "NeuralActuator/evaluate_actuator_so101.py", sizeBytes: 32_860,
    gitBlobSha1: "4f67398e172747a47da45091202a04ff9f6f47b2",
    sha256: "sha256:00fa0ead45aafa5f99d048f495a4f30658015db7093962ac54c64161350a345a",
  },
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `NAD_SO101_${code}` : `NAD_SO101_${code}:${detail}`);
}

export function nadSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return nadSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
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
    || url.username !== "" || url.password !== "") {
    fail("FETCH_REDIRECT_INVALID", url.hostname);
  }
  return url;
}

async function fetchOnce(value, maximumBytes, accept, fetchImpl) {
  let current = checkedInitialUrl(value);
  for (let redirects = 0; redirects <= 7; redirects += 1) {
    const response = await fetchImpl(current, {
      redirect: "manual",
      headers: { accept, "accept-encoding": "identity",
        "user-agent": "outsider-nad-so101-mechanics/1.0" },
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
  if (url.pathname !== TREE_PATH || url.searchParams.get("recursive") !== "true"
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
    const normalized = { path: entry.path, type: entry.type,
      size: entry.size, oid: entry.oid };
    if (entry.lfs !== undefined) {
      if (!exactObject(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
        || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
      normalized.lfs = { oid: entry.lfs.oid, size: entry.lfs.size };
    }
    return normalized;
  });
}

async function fetchHfTree(fetchImpl, bracket) {
  const entries = [];
  const support = [];
  const seen = new Set();
  let next = TREE_URL;
  for (let page = 1; next !== null; page += 1) {
    if (page > MAX_TREE_PAGES || seen.has(next)) fail("TREE_PAGINATION_INVALID");
    seen.add(next);
    const fetched = await jsonFetch(next, MAX_API_BYTES, fetchImpl);
    entries.push(...normalizeTreeEntries(fetched.value));
    support.push({ path: `source-support/hf-tree-${bracket}-${String(page)
      .padStart(3, "0")}.json`, fetchUrl: next, bytes: fetched.bytes });
    next = parseNextTreeLink(fetched.headers.get("link"));
  }
  const normalized = entries.sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(normalized.map((entry) => entry.path)).size !== normalized.length) {
    fail("TREE_DUPLICATE_PATH");
  }
  const snapshotHash = digest(NAD_SOURCE_SCHEMA + "/full-tree-snapshot", normalized);
  if (normalized.length !== EXPECTED_PROFILE.treeEntries
    || support.length !== EXPECTED_PROFILE.treePages
    || snapshotHash !== EXPECTED_TREE_SNAPSHOT_HASH) fail("TREE_PROFILE_CHANGED");
  return { entries: normalized, pages: support.length, snapshotHash, support };
}

function hfRepositoryProjection(value) {
  if (value?.id !== NAD_DATASET_ID || value?.sha !== NAD_REVISION
    || value?.private !== false || value?.gated !== false || value?.disabled !== false
    || String(value?.cardData?.license).toLowerCase() !== "mit"
    || value?.lastModified !== "2026-07-13T04:32:43.000Z") {
    fail("HF_REPOSITORY_PROFILE_CHANGED");
  }
  return { datasetId: NAD_DATASET_ID, revision: NAD_REVISION,
    private: false, gated: false, disabled: false, cardLicenseClaim: "mit",
    lastModified: value.lastModified };
}

function githubHeadProjection(value) {
  if (value?.sha !== NAD_GITHUB_HEAD || value?.commit?.tree?.sha !== NAD_GITHUB_TREE
    || value?.commit?.committer?.date !== "2026-08-29T00:28:23Z"
    || !Array.isArray(value?.parents) || value.parents.length !== 1
    || !SHA1.test(value.parents[0]?.sha ?? "")) fail("GITHUB_HEAD_CHANGED");
  return { repository: NAD_GITHUB_REPOSITORY, branch: "main", head: NAD_GITHUB_HEAD,
    tree: NAD_GITHUB_TREE, committedAt: value.commit.committer.date,
    parent: value.parents[0].sha };
}

function rawSplit(value) {
  const match = /^data\/so101\/(go_up_and_stay_still|pick_and_place)\/(empty|200g|300g|400g|500g)\/(train|validation|test)\/(\d{3})\.csv$/u.exec(value);
  return match ? { task: match[1], payload: match[2], split: match[3],
    trajectory: match[4] } : null;
}

function remoteBinding(entry) {
  return entry.lfs
    ? { kind: "LFS_SHA256", value: `sha256:${entry.lfs.oid}` }
    : { kind: "GIT_BLOB_SHA1", value: entry.oid };
}

function selectHfObjects(entries) {
  const files = entries.filter((entry) => entry.type === "file");
  const readme = files.filter((entry) => entry.path === README_PATH);
  const raw = files.filter((entry) => entry.path.startsWith(RAW_PREFIX));
  const parquet = files.filter((entry) => entry.path.startsWith(PARQUET_PREFIX));
  const videos = files.filter((entry) => entry.path.startsWith(VIDEO_PREFIX));
  if (files.length !== EXPECTED_PROFILE.repositoryFiles || readme.length !== 1
    || raw.length !== EXPECTED_PROFILE.rawFiles
    || parquet.length !== EXPECTED_PROFILE.parquetFiles
    || videos.length !== EXPECTED_PROFILE.videoFilesExcluded) fail("SELECTION_COUNT_CHANGED");
  const rawProjected = raw.map((entry) => {
    const fields = rawSplit(entry.path);
    if (!fields || entry.lfs !== undefined) fail("RAW_PATH_OR_BINDING_INVALID", entry.path);
    return { path: entry.path, sizeBytes: entry.size, ...fields,
      kind: "RAW_CSV", remoteBinding: remoteBinding(entry) };
  });
  const parquetProjected = parquet.map((entry) => {
    const match = /^parquet\/so101\/(train|validation|test)\.parquet$/u.exec(entry.path);
    if (!match || !entry.lfs) fail("PARQUET_PATH_OR_BINDING_INVALID", entry.path);
    return { path: entry.path, sizeBytes: entry.size, split: match[1],
      task: null, payload: null, trajectory: null, kind: "PARQUET_REPACK",
      remoteBinding: remoteBinding(entry) };
  });
  const selected = [{ path: readme[0].path, sizeBytes: readme[0].size,
    split: null, task: null, payload: null, trajectory: null, kind: "README",
    remoteBinding: remoteBinding(readme[0]) }, ...rawProjected, ...parquetProjected]
    .sort((left, right) => left.path.localeCompare(right.path));
  const rawBytes = rawProjected.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const parquetBytes = parquetProjected.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const splitCounts = Object.fromEntries(["train", "validation", "test"].map((split) =>
    [split, rawProjected.filter((entry) => entry.split === split).length]));
  const combinationCounts = new Map();
  for (const entry of rawProjected) {
    const key = `${entry.task}/${entry.payload}`;
    const value = combinationCounts.get(key) ?? { train: 0, validation: 0, test: 0 };
    value[entry.split] += 1;
    combinationCounts.set(key, value);
  }
  const dataTree = entries.find((entry) => entry.path === "data" && entry.type === "directory");
  const so101Tree = entries.find((entry) => entry.path === "data/so101"
    && entry.type === "directory");
  if (selected.length !== EXPECTED_PROFILE.hfObjects
    || selected.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== EXPECTED_PROFILE.hfBytes
    || readme[0].size !== EXPECTED_PROFILE.readmeBytes
    || rawBytes !== EXPECTED_PROFILE.rawBytes || parquetBytes !== EXPECTED_PROFILE.parquetBytes
    || !same(splitCounts, { train: 80, validation: 10, test: 10 })
    || combinationCounts.size !== 10
    || [...combinationCounts.values()].some((value) =>
      !same(value, { train: 8, validation: 1, test: 1 }))
    || videos.reduce((sum, entry) => sum + entry.size, 0)
      !== EXPECTED_PROFILE.videoBytesExcluded
    || dataTree?.oid !== EXPECTED_HF_DATA_TREE || so101Tree?.oid !== EXPECTED_SO101_TREE) {
    fail("SELECTION_PROFILE_CHANGED");
  }
  return { selected, rawProjected, parquetProjected,
    projection: selected.map(({ path: objectPath, sizeBytes, split, task, payload,
      trajectory, kind, remoteBinding: binding }) => ({ path: objectPath, sizeBytes,
      split, task, payload, trajectory, kind, remoteBinding: binding })),
    summary: { sourceObjects: selected.length, selectedBytes: EXPECTED_PROFILE.hfBytes,
      readmeBytes: EXPECTED_PROFILE.readmeBytes, rawCsvFiles: raw.length,
      rawCsvBytes: rawBytes, parquetFiles: parquet.length, parquetBytes,
      taskPayloadCombinations: 10, trainRawFiles: 80, validationRawFiles: 10,
      testRawFiles: 10, excludedVideoFiles: videos.length,
      excludedVideoBytes: EXPECTED_PROFILE.videoBytesExcluded,
      excludedRepositoryFiles: files.length - selected.length } };
}

function validateGithubTree(key, value) {
  const spec = GITHUB_TREE_SPECS.find((entry) => entry.key === key);
  if (!spec || value?.sha !== spec.sha || value?.truncated !== false
    || !Array.isArray(value.tree)) fail("GITHUB_TREE_INVALID", key);
  const members = new Map(value.tree.map((entry) => [entry.path, entry]));
  if (key === "root") {
    if (members.get("NeuralActuator")?.sha !== GITHUB_TREE_SPECS[1].sha) {
      fail("GITHUB_ROOT_TREE_CHANGED");
    }
  } else if (key === "neural-actuator") {
    const required = {
      LICENSE: GITHUB_OBJECT_SPECS[0].gitBlobSha1,
      "README.md": GITHUB_OBJECT_SPECS[1].gitBlobSha1,
      configs: GITHUB_TREE_SPECS[2].sha,
      data: EXPECTED_HF_DATA_TREE,
      "train_actuator_diffsim_so101.py": GITHUB_OBJECT_SPECS[5].gitBlobSha1,
      "evaluate_actuator_so101.py": GITHUB_OBJECT_SPECS[6].gitBlobSha1,
    };
    if (Object.entries(required).some(([name, sha]) => members.get(name)?.sha !== sha)) {
      fail("GITHUB_NEURAL_TREE_CHANGED");
    }
  } else if (key === "configs") {
    if (GITHUB_OBJECT_SPECS.slice(2, 5).some((entry) =>
      members.get(path.posix.basename(entry.path))?.sha !== entry.gitBlobSha1)) {
      fail("GITHUB_CONFIG_TREE_CHANGED");
    }
  } else if (key === "data") {
    if (members.get("so101")?.sha !== EXPECTED_SO101_TREE) fail("GITHUB_DATA_TREE_CHANGED");
  } else if (key === "so101") {
    if (value.tree.filter((entry) => entry.type === "blob").length !== 100
      || value.tree.filter((entry) => entry.type === "blob")
        .reduce((sum, entry) => sum + entry.size, 0) !== EXPECTED_PROFILE.rawBytes) {
      fail("GITHUB_SO101_TREE_CHANGED");
    }
  }
  return { key, sha: spec.sha, entries: value.tree.length,
    blobFiles: value.tree.filter((entry) => entry.type === "blob").length };
}

function checkRemoteBytes(entry, bytes) {
  if (bytes.length !== entry.sizeBytes) fail("REMOTE_SIZE_MISMATCH", entry.path);
  const sha256 = nadSha256(bytes);
  if (entry.remoteBinding.kind === "LFS_SHA256") {
    if (entry.remoteBinding.value !== sha256) fail("REMOTE_LFS_MISMATCH", entry.path);
  } else if (entry.remoteBinding.kind === "GIT_BLOB_SHA1") {
    if (entry.remoteBinding.value !== gitBlobOid(bytes)) fail("REMOTE_GIT_MISMATCH", entry.path);
  } else fail("REMOTE_BINDING_KIND_INVALID", entry.path);
  return sha256;
}

async function mapConcurrent(values, width, operation) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await operation(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, values.length) }, worker));
  return results;
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function safeTarget(root, relative) {
  if (!safeRemotePath(relative)) fail("LOCAL_PATH_INVALID", relative);
  const target = path.resolve(root, ...relative.split("/"));
  const relation = path.relative(path.resolve(root), target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("LOCAL_PATH_ESCAPE", relative);
  return target;
}

function writePrivate(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function supportEntry(item) {
  return { path: item.path, fetchUrl: item.fetchUrl, sizeBytes: item.bytes.length,
    sha256: nadSha256(item.bytes) };
}

function sourceManifestBody(input) {
  return {
    schema: NAD_SOURCE_SCHEMA,
    capturedAt: NAD_FROZEN_AT,
    hf: {
      datasetId: NAD_DATASET_ID,
      pinnedRevision: NAD_REVISION,
      repositoryBefore: input.hfRepositoryBefore,
      repositoryAfter: input.hfRepositoryAfter,
      repositoryStableDuringAcquisition: true,
      treeBefore: { pages: input.treeBefore.pages,
        entryCount: input.treeBefore.entries.length,
        snapshotHash: input.treeBefore.snapshotHash,
        selectedObjects: input.selection.projection },
      treeAfter: { pages: input.treeAfter.pages,
        entryCount: input.treeAfter.entries.length,
        snapshotHash: input.treeAfter.snapshotHash,
        selectedObjects: input.selection.projection },
      treeStableDuringAcquisition: true,
    },
    github: {
      repository: NAD_GITHUB_REPOSITORY,
      observedMainHeadBefore: input.githubHeadBefore,
      observedMainHeadAfter: input.githubHeadAfter,
      headStableDuringAcquisition: true,
      pinnedHead: NAD_GITHUB_HEAD,
      pinnedTree: NAD_GITHUB_TREE,
      treeClosure: input.githubTreeSummaries,
      hfDataTreeOid: EXPECTED_HF_DATA_TREE,
      hfSo101TreeOid: EXPECTED_SO101_TREE,
      githubDataTreeOid: EXPECTED_HF_DATA_TREE,
      githubSo101TreeOid: EXPECTED_SO101_TREE,
      rawDataTreeIdentityEstablished: true,
    },
    selection: { ...input.selection.summary,
      rule: "README plus all data/so101 CSV and all parquet/so101 files; no videos",
      githubProvenanceObjects: EXPECTED_PROFILE.githubObjects,
      githubProvenanceBytes: EXPECTED_PROFILE.githubBytes,
      fullRawSo101Closure: true,
      fullParquetSo101Closure: true,
      videoFetched: false,
    },
    semantics: {
      sourceCardClaimsSo101NoEndEffectorForceSensor: true,
      forceZIsPayloadDerivedSourceClaim: true,
      missingForceSentinel: -999,
      releasedConfigCurrentSource: "load",
      releasedConfigMasksInvalidForce: true,
      linkedCodeOrConfigsExecutedDuringAcquisition: false,
    },
    rights: {
      hfCardLicenseClaim: "MIT",
      hfReadmeLicenseClaimBytePinned: true,
      linkedGithubLicenseBytePinned: true,
      legalAdjudicationPerformed: false,
      authorizedTrainingClearanceAdjudicated: false,
      productionTrainingAuthorizedByOutsider: false,
    },
    privacy: {
      rawTelemetryRetainedLocally: true,
      videoRetained: false,
      noPiiGuaranteed: false,
      networkProjectionAllowed: false,
    },
    transportAttested: false,
    sourceSupportObjects: input.supportItems.map(supportEntry)
      .sort((left, right) => left.path.localeCompare(right.path)),
    hfRemoteObjects: input.hfDownloaded.sort((left, right) =>
      left.path.localeCompare(right.path)),
    githubRemoteObjects: input.githubDownloaded.sort((left, right) =>
      left.path.localeCompare(right.path)),
  };
}

function publishSourceStaging(staging, target) {
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("OUTPUT_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    for (const name of ["README.md", "data", "parquet", "github", "source-support"]) {
      renameSync(path.join(staging, name), path.join(target, name));
    }
    /* Manifest is the source completion marker and is moved last. */
    renameSync(path.join(staging, "acquisition-manifest.json"),
      path.join(target, "acquisition-manifest.json"));
    rmdirSync(staging);
  } catch { fail("OUTPUT_PUBLISH_FAILED", target); }
}

export async function acquirePinnedNadSo101Source(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
  ensurePrivateDirectory(path.dirname(target));
  const staging = path.join(path.dirname(target), `.${path.basename(target)}.staging-`
    + `${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  let targetClaimed = false;
  try {
    const hfBeforeRaw = await jsonFetch(HF_API, MAX_API_BYTES, fetchImpl);
    const hfRepositoryBefore = hfRepositoryProjection(hfBeforeRaw.value);
    const treeBefore = await fetchHfTree(fetchImpl, "before");
    const selection = selectHfObjects(treeBefore.entries);
    const githubBeforeRaw = await jsonFetch(GH_HEAD_URL, MAX_API_BYTES, fetchImpl);
    const githubHeadBefore = githubHeadProjection(githubBeforeRaw.value);
    const githubTreeFetches = [];
    for (const spec of GITHUB_TREE_SPECS) {
      const url = `${GH_TREE_URL}/${spec.sha}${spec.key === "so101" ? "?recursive=1" : ""}`;
      const fetched = await jsonFetch(url, MAX_API_BYTES, fetchImpl);
      githubTreeFetches.push({ spec, url, fetched,
        summary: validateGithubTree(spec.key, fetched.value) });
    }
    const hfDownloaded = await mapConcurrent(selection.selected,
      DOWNLOAD_CONCURRENCY, async (entry) => {
        const encoded = entry.path.split("/").map(encodeURIComponent).join("/");
        const fetched = await boundedFetch(`${RAW_ROOT}/${encoded}?download=true`,
          entry.sizeBytes, "application/octet-stream,text/plain;q=0.8", fetchImpl);
        const sha256 = checkRemoteBytes(entry, fetched.bytes);
        writePrivate(safeTarget(staging, entry.path), fetched.bytes);
        return { ...entry, sha256, transportFinalHost: fetched.finalHost };
      });
    const githubDownloaded = await mapConcurrent(GITHUB_OBJECT_SPECS,
      DOWNLOAD_CONCURRENCY, async (spec) => {
        const encoded = spec.path.split("/").map(encodeURIComponent).join("/");
        const fetched = await boundedFetch(`${GH_RAW_ROOT}/${encoded}`,
          spec.sizeBytes, "application/octet-stream,text/plain;q=0.8", fetchImpl);
        if (fetched.bytes.length !== spec.sizeBytes
          || nadSha256(fetched.bytes) !== spec.sha256
          || gitBlobOid(fetched.bytes) !== spec.gitBlobSha1) {
          fail("GITHUB_OBJECT_BINDING_MISMATCH", spec.path);
        }
        const localPath = `github/${spec.path}`;
        writePrivate(safeTarget(staging, localPath), fetched.bytes);
        return { path: localPath, upstreamPath: spec.path, sizeBytes: spec.sizeBytes,
          sha256: spec.sha256, gitBlobSha1: spec.gitBlobSha1,
          transportFinalHost: fetched.finalHost };
      });
    const treeAfter = await fetchHfTree(fetchImpl, "after");
    const selectionAfter = selectHfObjects(treeAfter.entries);
    const hfAfterRaw = await jsonFetch(HF_API, MAX_API_BYTES, fetchImpl);
    const hfRepositoryAfter = hfRepositoryProjection(hfAfterRaw.value);
    const githubAfterRaw = await jsonFetch(GH_HEAD_URL, MAX_API_BYTES, fetchImpl);
    const githubHeadAfter = githubHeadProjection(githubAfterRaw.value);
    if (!same(hfRepositoryBefore, hfRepositoryAfter)
      || treeBefore.snapshotHash !== treeAfter.snapshotHash
      || !same(selection.projection, selectionAfter.projection)
      || !same(githubHeadBefore, githubHeadAfter)) {
      fail("REMOTE_CHANGED_DURING_ACQUISITION");
    }
    const supportItems = [
      { path: "source-support/hf-repository-before.json", fetchUrl: HF_API,
        bytes: hfBeforeRaw.bytes },
      ...treeBefore.support,
      ...treeAfter.support,
      { path: "source-support/hf-repository-after.json", fetchUrl: HF_API,
        bytes: hfAfterRaw.bytes },
      { path: "source-support/github-head-before.json", fetchUrl: GH_HEAD_URL,
        bytes: githubBeforeRaw.bytes },
      ...githubTreeFetches.map(({ spec, url, fetched }) => ({
        path: `source-support/github-tree-${spec.key}.json`, fetchUrl: url,
        bytes: fetched.bytes })),
      { path: "source-support/github-head-after.json", fetchUrl: GH_HEAD_URL,
        bytes: githubAfterRaw.bytes },
    ];
    for (const item of supportItems) writePrivate(safeTarget(staging, item.path), item.bytes);
    const manifestBody = sourceManifestBody({ hfRepositoryBefore, hfRepositoryAfter,
      treeBefore, treeAfter, selection, githubHeadBefore, githubHeadAfter,
      githubTreeSummaries: githubTreeFetches.map((entry) => entry.summary),
      supportItems, hfDownloaded, githubDownloaded });
    const manifest = { ...manifestBody,
      manifestHash: digest(NAD_SOURCE_SCHEMA + "/manifest", manifestBody) };
    writePrivate(path.join(staging, "acquisition-manifest.json"), canonicalBytes(manifest));
    publishSourceStaging(staging, target);
    targetClaimed = true;
    const manifestBytes = readFileSync(path.join(target, "acquisition-manifest.json"));
    return { sourceDirectory: target, manifest,
      manifestFileSha256: nadSha256(manifestBytes) };
  } catch (error) {
    if (!targetClaimed && existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function supportNames() {
  return sorted([
    "hf-repository-before.json", "hf-repository-after.json",
    "github-head-before.json", "github-head-after.json",
    ...["before", "after"].flatMap((bracket) =>
      Array.from({ length: EXPECTED_PROFILE.treePages }, (_, index) =>
        `hf-tree-${bracket}-${String(index + 1).padStart(3, "0")}.json`)),
    ...GITHUB_TREE_SPECS.map((entry) => `github-tree-${entry.key}.json`),
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

function readPrivateStable(root, relative, snapshots, maximumBytes,
  expected = null) {
  const target = safeTarget(root, relative);
  const descriptor = openSync(target,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
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
      || nadSha256(bytes) !== expected.sha256)) fail("SOURCE_BINDING_INVALID", relative);
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
  if (url.pathname !== TREE_PATH || url.searchParams.get("recursive") !== "true"
    || url.searchParams.get("expand") !== "true"
    || pageNumber === 1 && url.toString() !== TREE_URL
    || pageNumber > 1 && !url.searchParams.get("cursor")) {
    fail("STORED_TREE_URL_INVALID", `${bracket}:${pageNumber}`);
  }
}

function replayTreeBracket(bracket, supportBytes, supportManifest) {
  const entries = [];
  const support = [];
  for (let page = 1; page <= EXPECTED_PROFILE.treePages; page += 1) {
    const relative = `source-support/hf-tree-${bracket}-${String(page)
      .padStart(3, "0")}.json`;
    const manifestEntry = supportManifest.get(relative);
    if (!manifestEntry) fail("TREE_SUPPORT_MANIFEST_MISSING", relative);
    validateTreePageUrl(manifestEntry.fetchUrl, bracket, page);
    const bytes = supportBytes.get(relative);
    const values = parseJson(bytes, "TREE_SUPPORT_JSON_INVALID");
    if (!Array.isArray(values) || values.length !== (page === 27 ? 2 : 50)) {
      fail("TREE_SUPPORT_PAGE_COUNT_CHANGED", relative);
    }
    entries.push(...normalizeTreeEntries(values));
    support.push({ path: relative, fetchUrl: manifestEntry.fetchUrl, bytes });
  }
  entries.sort((left, right) => left.path.localeCompare(right.path));
  const snapshotHash = digest(NAD_SOURCE_SCHEMA + "/full-tree-snapshot", entries);
  if (entries.length !== EXPECTED_PROFILE.treeEntries
    || new Set(entries.map((entry) => entry.path)).size !== entries.length
    || snapshotHash !== EXPECTED_TREE_SNAPSHOT_HASH) fail("TREE_SUPPORT_REPLAY_FAILED");
  return { entries, pages: EXPECTED_PROFILE.treePages, snapshotHash, support };
}

function expectedGithubTreeUrl(spec) {
  return `${GH_TREE_URL}/${spec.sha}${spec.key === "so101" ? "?recursive=1" : ""}`;
}

function validateHfManifestObject(value, expected) {
  if (!exactObject(value) || !same({
    path: value.path, sizeBytes: value.sizeBytes, split: value.split,
    task: value.task, payload: value.payload, trajectory: value.trajectory,
    kind: value.kind, remoteBinding: value.remoteBinding,
  }, expected) || !HASH.test(value.sha256 ?? "")
    || typeof value.transportFinalHost !== "string"
    || !ALLOWED_REDIRECT_HOST.test(value.transportFinalHost)) {
    fail("HF_MANIFEST_OBJECT_INVALID", expected.path);
  }
}

function validateGithubManifestObject(value, spec) {
  if (!same({ path: value?.path, upstreamPath: value?.upstreamPath,
    sizeBytes: value?.sizeBytes, sha256: value?.sha256,
    gitBlobSha1: value?.gitBlobSha1 }, {
    path: `github/${spec.path}`, upstreamPath: spec.path,
    sizeBytes: spec.sizeBytes, sha256: spec.sha256, gitBlobSha1: spec.gitBlobSha1,
  }) || typeof value.transportFinalHost !== "string"
    || !ALLOWED_REDIRECT_HOST.test(value.transportFinalHost)) {
    fail("GITHUB_MANIFEST_OBJECT_INVALID", spec.path);
  }
}

function validateDocumentationAndCode(root, snapshots, hfObjects, githubObjects) {
  const hfReadme = readPrivateStable(root, "README.md", snapshots,
    EXPECTED_PROFILE.readmeBytes, hfObjects.get("README.md")).toString("utf8");
  const githubReadme = readPrivateStable(root, "github/NeuralActuator/README.md", snapshots,
    MAX_REMOTE_FILE_BYTES, githubObjects.get("github/NeuralActuator/README.md"))
    .toString("utf8");
  const license = readPrivateStable(root, "github/NeuralActuator/LICENSE", snapshots,
    MAX_REMOTE_FILE_BYTES, githubObjects.get("github/NeuralActuator/LICENSE"))
    .toString("utf8");
  const configs = GITHUB_OBJECT_SPECS.slice(2, 5).map((spec) =>
    readPrivateStable(root, `github/${spec.path}`, snapshots, MAX_REMOTE_FILE_BYTES,
      githubObjects.get(`github/${spec.path}`)).toString("utf8"));
  const train = readPrivateStable(root,
    "github/NeuralActuator/train_actuator_diffsim_so101.py", snapshots,
    MAX_REMOTE_FILE_BYTES,
    githubObjects.get("github/NeuralActuator/train_actuator_diffsim_so101.py"))
    .toString("utf8");
  const evaluate = readPrivateStable(root,
    "github/NeuralActuator/evaluate_actuator_so101.py", snapshots,
    MAX_REMOTE_FILE_BYTES,
    githubObjects.get("github/NeuralActuator/evaluate_actuator_so101.py"))
    .toString("utf8");
  if (!/(^|\n)license:\s*mit\s*($|\n)/iu.test(hfReadme)
    || !hfReadme.includes("The SO-101 rig has no end-effector force sensor")
    || !hfReadme.includes("Force labels are derived from the")
    || !hfReadme.includes("`force_z` equals the payload weight")
    || !hfReadme.includes("`-999` as a sentinel")
    || !hfReadme.includes("`current_source: load`")
    || !hfReadme.includes("the CSVs remain the reference format")
    || !license.startsWith("MIT License\n")
    || !githubReadme.includes("The SO-101 rig has no\nend-effector force sensor")
    || !githubReadme.includes("force labels are derived from the known payload weight")
    || !configs.every((value) => value.includes("data_dt: 0.01605")
      && value.includes("current_source: load")
      && value.includes("mask_invalid_force: true"))
    || !train.includes("current_source") || !train.includes("mask_invalid_force")
    || !evaluate.includes("forces[forces == -999] = 0.0")
    || !evaluate.includes("current_source='load'")) {
    fail("DOCUMENTATION_OR_CODE_PROFILE_CHANGED");
  }
  return { hfReadme, githubReadme, license, configs, train, evaluate };
}

function sourceRootFromBindings(bindings) {
  return digest(NAD_SOURCE_SCHEMA + "/source-root", bindings
    .map(({ path: objectPath, bytes }) => ({ path: objectPath,
      sizeBytes: bytes.length, sha256: nadSha256(bytes) }))
    .sort((left, right) => left.path.localeCompare(right.path)));
}

export function verifyNadSo101SourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const bootstrapSnapshots = [];
  requirePrivateDirectory(root,
    ["README.md", "acquisition-manifest.json", "data", "github", "parquet",
      "source-support"], bootstrapSnapshots);
  const manifestBytes = readPrivateStable(root, "acquisition-manifest.json",
    bootstrapSnapshots, MAX_API_BYTES);
  const manifest = parseJson(manifestBytes, "SOURCE_MANIFEST_JSON_INVALID");
  if (!manifestBytes.equals(canonicalBytes(manifest))) fail("SOURCE_MANIFEST_NOT_CANONICAL");
  if (!Array.isArray(manifest.sourceSupportObjects)
    || !Array.isArray(manifest.hfRemoteObjects)
    || !Array.isArray(manifest.githubRemoteObjects)) fail("SOURCE_MANIFEST_ARRAYS_INVALID");
  const supportManifest = new Map(manifest.sourceSupportObjects.map((entry) =>
    [entry.path, entry]));
  const expectedSupportNames = supportNames();
  if (supportManifest.size !== expectedSupportNames.length
    || !same(sorted([...supportManifest.keys()]),
      expectedSupportNames.map((name) => `source-support/${name}`))) {
    fail("SOURCE_SUPPORT_MANIFEST_SET_INVALID");
  }
  const supportBytes = new Map();
  for (const name of expectedSupportNames) {
    const relative = `source-support/${name}`;
    const entry = supportManifest.get(relative);
    if (!exactKeys(entry, ["path", "fetchUrl", "sizeBytes", "sha256"])
      || !HASH.test(entry.sha256 ?? "")) fail("SOURCE_SUPPORT_MANIFEST_INVALID", relative);
    supportBytes.set(relative, readPrivateStable(root, relative, bootstrapSnapshots,
      MAX_API_BYTES, entry));
  }
  const hfBeforeBytes = supportBytes.get("source-support/hf-repository-before.json");
  const hfAfterBytes = supportBytes.get("source-support/hf-repository-after.json");
  const hfRepositoryBefore = hfRepositoryProjection(parseJson(hfBeforeBytes,
    "HF_REPOSITORY_BEFORE_JSON_INVALID"));
  const hfRepositoryAfter = hfRepositoryProjection(parseJson(hfAfterBytes,
    "HF_REPOSITORY_AFTER_JSON_INVALID"));
  if (!same(hfRepositoryBefore, hfRepositoryAfter)
    || supportManifest.get("source-support/hf-repository-before.json").fetchUrl !== HF_API
    || supportManifest.get("source-support/hf-repository-after.json").fetchUrl !== HF_API) {
    fail("HF_REPOSITORY_BRACKET_INVALID");
  }
  const treeBefore = replayTreeBracket("before", supportBytes, supportManifest);
  const treeAfter = replayTreeBracket("after", supportBytes, supportManifest);
  if (treeBefore.snapshotHash !== treeAfter.snapshotHash) fail("HF_TREE_BRACKET_INVALID");
  const selection = selectHfObjects(treeBefore.entries);
  const selectionAfter = selectHfObjects(treeAfter.entries);
  if (!same(selection.projection, selectionAfter.projection)) fail("HF_SELECTION_BRACKET_INVALID");

  const githubBeforeBytes = supportBytes.get("source-support/github-head-before.json");
  const githubAfterBytes = supportBytes.get("source-support/github-head-after.json");
  const githubHeadBefore = githubHeadProjection(parseJson(githubBeforeBytes,
    "GITHUB_HEAD_BEFORE_JSON_INVALID"));
  const githubHeadAfter = githubHeadProjection(parseJson(githubAfterBytes,
    "GITHUB_HEAD_AFTER_JSON_INVALID"));
  if (!same(githubHeadBefore, githubHeadAfter)
    || supportManifest.get("source-support/github-head-before.json").fetchUrl !== GH_HEAD_URL
    || supportManifest.get("source-support/github-head-after.json").fetchUrl !== GH_HEAD_URL) {
    fail("GITHUB_HEAD_BRACKET_INVALID");
  }
  const githubTreeSummaries = [];
  for (const spec of GITHUB_TREE_SPECS) {
    const relative = `source-support/github-tree-${spec.key}.json`;
    if (supportManifest.get(relative)?.fetchUrl !== expectedGithubTreeUrl(spec)) {
      fail("GITHUB_TREE_SUPPORT_URL_INVALID", spec.key);
    }
    githubTreeSummaries.push(validateGithubTree(spec.key,
      parseJson(supportBytes.get(relative), "GITHUB_TREE_JSON_INVALID")));
  }

  const expectedFiles = ["acquisition-manifest.json",
    ...selection.selected.map((entry) => entry.path),
    ...GITHUB_OBJECT_SPECS.map((entry) => `github/${entry.path}`),
    ...expectedSupportNames.map((name) => `source-support/${name}`)];
  const directoryMap = expectedDirectoryMap(expectedFiles);
  const snapshots = [];
  for (const [relative, names] of [...directoryMap].sort(([left], [right]) =>
    left.split("/").length - right.split("/").length || left.localeCompare(right))) {
    requirePrivateDirectory(relative === "" ? root : safeTarget(root, relative),
      [...names], snapshots);
  }
  /* The manifest was bootstrap-read before topology was derived; bind it again. */
  const secondManifestBytes = readPrivateStable(root, "acquisition-manifest.json",
    snapshots, MAX_API_BYTES);
  if (!secondManifestBytes.equals(manifestBytes)) fail("SOURCE_MANIFEST_CHANGED");

  const hfManifest = new Map(manifest.hfRemoteObjects.map((entry) => [entry.path, entry]));
  if (hfManifest.size !== selection.selected.length
    || manifest.hfRemoteObjects.length !== selection.selected.length) {
    fail("HF_REMOTE_OBJECT_SET_INVALID");
  }
  const bindings = [];
  const hfObjects = new Map();
  for (const expected of selection.projection) {
    const value = hfManifest.get(expected.path);
    validateHfManifestObject(value, expected);
    const bytes = readPrivateStable(root, expected.path, snapshots,
      MAX_REMOTE_FILE_BYTES, value);
    checkRemoteBytes(expected, bytes);
    bindings.push({ path: expected.path, bytes });
    hfObjects.set(expected.path, value);
  }
  const githubManifest = new Map(manifest.githubRemoteObjects.map((entry) =>
    [entry.path, entry]));
  if (githubManifest.size !== GITHUB_OBJECT_SPECS.length
    || manifest.githubRemoteObjects.length !== GITHUB_OBJECT_SPECS.length) {
    fail("GITHUB_REMOTE_OBJECT_SET_INVALID");
  }
  const githubObjects = new Map();
  for (const spec of GITHUB_OBJECT_SPECS) {
    const localPath = `github/${spec.path}`;
    const value = githubManifest.get(localPath);
    validateGithubManifestObject(value, spec);
    const bytes = readPrivateStable(root, localPath, snapshots,
      MAX_REMOTE_FILE_BYTES, value);
    if (gitBlobOid(bytes) !== spec.gitBlobSha1) fail("GITHUB_GIT_REPLAY_FAILED", spec.path);
    bindings.push({ path: localPath, bytes });
    githubObjects.set(localPath, value);
  }
  validateDocumentationAndCode(root, snapshots, hfObjects, githubObjects);
  for (const [relative, bytes] of supportBytes) bindings.push({ path: relative, bytes });

  const supportItems = [...supportBytes].map(([relative, bytes]) => ({
    path: relative, fetchUrl: supportManifest.get(relative).fetchUrl, bytes,
  }));
  const manifestBody = sourceManifestBody({ hfRepositoryBefore, hfRepositoryAfter,
    treeBefore, treeAfter, selection, githubHeadBefore, githubHeadAfter,
    githubTreeSummaries, supportItems,
    hfDownloaded: manifest.hfRemoteObjects,
    githubDownloaded: manifest.githubRemoteObjects });
  const expectedManifest = { ...manifestBody,
    manifestHash: digest(NAD_SOURCE_SCHEMA + "/manifest", manifestBody) };
  if (!same(manifest, expectedManifest)) fail("SOURCE_MANIFEST_REBUILD_MISMATCH");
  const sourceRoot = sourceRootFromBindings(bindings);
  recheckSnapshots([...bootstrapSnapshots, ...snapshots]);
  return Object.freeze({ ok: true, verificationLevel: "FULL_SOURCE_BYTE_REPLAY",
    sourceDirectory: root, manifest, manifestFileSha256: nadSha256(manifestBytes),
    sourceRoot, selection, hfObjects, githubObjects });
}

const RAW_COLUMNS = Object.freeze([
  "timestamp",
  ...Array.from({ length: 6 }, (_, index) => `pos${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `goal_pos${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `current${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `vel${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `load${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `temp${index + 1}`),
  ...Array.from({ length: 6 }, (_, index) => `volts${index + 1}`),
  "force_x", "force_y", "force_z",
]);
const PARQUET_COLUMNS = Object.freeze(["task", "payload", "trajectory", ...RAW_COLUMNS]);
const EXPECTED_SPLIT_ROWS = Object.freeze({ train: 52_758, validation: 6599, test: 6559 });
const PYARROW_TIMEOUT_MS = 180_000;
const MAX_EXTRACTOR_OUTPUT_BYTES = 8 * 1024 * 1024;
const EXPECTED_CROSSWALK_HASH =
  "sha256:597161bec0f62039515c410daf00de43c760ef43e17c7ac9a9092af4e3a33c9e";

const PYARROW_CROSSWALK = String.raw`
import csv
import hashlib
import json
import math
import os
import stat
import statistics
import sys

import pyarrow as pa
import pyarrow.parquet as pq

request = json.load(sys.stdin)
root = os.path.realpath(request["root"])
raw_columns = request["rawColumns"]
parquet_columns = request["parquetColumns"]
float_columns = ["timestamp"] + [f"pos{i}" for i in range(1, 7)] + [f"goal_pos{i}" for i in range(1, 7)]
int_columns = ([f"current{i}" for i in range(1, 7)] + [f"vel{i}" for i in range(1, 7)]
               + [f"load{i}" for i in range(1, 7)] + [f"temp{i}" for i in range(1, 7)]
               + [f"volts{i}" for i in range(1, 7)] + ["force_x", "force_y"])
exact_float_columns = ["force_z"]
float_abs_tolerance = 2e-15

def read_exact(item):
    target = os.path.realpath(os.path.join(root, *item["path"].split("/")))
    if os.path.commonpath([root, target]) != root:
        raise RuntimeError("PATH_ESCAPE")
    fd = os.open(target, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or stat.S_IMODE(before.st_mode) != 0o600:
            raise RuntimeError("FILE_UNSAFE")
        chunks = []
        while True:
            value = os.read(fd, 1024 * 1024)
            if not value:
                break
            chunks.append(value)
        after = os.fstat(fd)
        raw = b"".join(chunks)
        if ((before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns,
             before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size,
             after.st_mtime_ns, after.st_ctime_ns)):
            raise RuntimeError("FILE_CHANGED")
        if len(raw) != item["sizeBytes"] or "sha256:" + hashlib.sha256(raw).hexdigest() != item["sha256"]:
            raise RuntimeError("FILE_BINDING_MISMATCH")
        return raw
    finally:
        os.close(fd)

raw_items = sorted(request["raw"], key=lambda value: value["path"])
parquet_items = {item["split"]: item for item in request["parquet"]}
trace_summaries = []
split_summaries = []
column_comparison = {name: {"values": 0, "nonBitExactValues": 0, "maxAbsDifference": 0.0}
                     for name in raw_columns}
force_by_payload = {}
total_rows = 0
integer_value_comparisons = 0
exact_force_value_comparisons = 0
floating_value_comparisons = 0
floating_non_bit_exact = 0
current_load_identical_rows = 0

for split in ["train", "validation", "test"]:
    parquet_item = parquet_items[split]
    parquet_raw = read_exact(parquet_item)
    table = pq.read_table(pa.BufferReader(parquet_raw))
    names = list(table.schema.names)
    if names != parquet_columns:
        raise RuntimeError("PARQUET_SCHEMA_ORDER")
    if table.num_columns != 49 or any(table[name].null_count != 0 for name in names):
        raise RuntimeError("PARQUET_SCHEMA_OR_NULLS")
    data = table.to_pydict()
    groups = {}
    for index, key in enumerate(zip(data["task"], data["payload"], data["trajectory"])):
        groups.setdefault(key, []).append(index)
    split_raw = [item for item in raw_items if item["split"] == split]
    if len(groups) != len(split_raw):
        raise RuntimeError("PARQUET_GROUP_COUNT")
    split_rows = 0
    split_float_max = 0.0
    for item in split_raw:
        raw = read_exact(item)
        text = raw.decode("utf-8")
        reader = csv.reader(text.splitlines())
        header = next(reader)
        if header != raw_columns:
            raise RuntimeError("CSV_HEADER")
        rows = list(reader)
        key = (item["task"], item["payload"], item["trajectory"])
        indices = groups.get(key)
        if indices is None or len(indices) != len(rows):
            raise RuntimeError("CSV_PARQUET_GROUP_ROWS")
        if indices != list(range(indices[0], indices[-1] + 1)):
            raise RuntimeError("PARQUET_GROUP_NOT_CONTIGUOUS")
        timestamps = []
        force_z_values = set()
        force_z_sentinel = 0
        force_z_valid = 0
        force_x_sentinel = 0
        force_y_sentinel = 0
        trace_current_load_identical = 0
        trace_float_max = 0.0
        for raw_row, parquet_index in zip(rows, indices):
            if len(raw_row) != len(raw_columns):
                raise RuntimeError("CSV_ROW_WIDTH")
            row = dict(zip(raw_columns, raw_row))
            timestamp = float(row["timestamp"])
            if not math.isfinite(timestamp):
                raise RuntimeError("CSV_NONFINITE")
            timestamps.append(timestamp)
            current_equal = True
            for column in raw_columns:
                parquet_value = data[column][parquet_index]
                stats = column_comparison[column]
                stats["values"] += 1
                if column in int_columns:
                    raw_value = int(row[column])
                    integer_value_comparisons += 1
                    if raw_value != parquet_value:
                        raise RuntimeError("INTEGER_CROSSWALK")
                elif column in exact_float_columns:
                    raw_value = float(row[column])
                    exact_force_value_comparisons += 1
                    if raw_value != parquet_value:
                        raise RuntimeError("FORCE_CROSSWALK")
                else:
                    raw_value = float(row[column])
                    floating_value_comparisons += 1
                    difference = abs(raw_value - parquet_value)
                    if raw_value != parquet_value:
                        stats["nonBitExactValues"] += 1
                        floating_non_bit_exact += 1
                    stats["maxAbsDifference"] = max(stats["maxAbsDifference"], difference)
                    trace_float_max = max(trace_float_max, difference)
                    split_float_max = max(split_float_max, difference)
                    if not math.isfinite(raw_value) or not math.isfinite(parquet_value) or difference > float_abs_tolerance:
                        raise RuntimeError("FLOAT_CROSSWALK_TOLERANCE")
            for joint in range(1, 7):
                if int(row[f"current{joint}"]) != int(row[f"load{joint}"]):
                    current_equal = False
            if current_equal:
                trace_current_load_identical += 1
                current_load_identical_rows += 1
            fx = int(row["force_x"])
            fy = int(row["force_y"])
            fz = float(row["force_z"])
            force_x_sentinel += int(fx == -999)
            force_y_sentinel += int(fy == -999)
            force_z_sentinel += int(fz == -999)
            force_z_valid += int(fz != -999)
            force_z_values.add(fz)
        non_increasing = sum(right <= left for left, right in zip(timestamps, timestamps[1:]))
        deltas = [right - left for left, right in zip(timestamps, timestamps[1:])]
        payload = force_by_payload.setdefault(item["payload"], {
            "rows": 0, "forceZSentinelRows": 0, "forceZValidLabelRows": 0,
            "observedForceZValues": set()})
        payload["rows"] += len(rows)
        payload["forceZSentinelRows"] += force_z_sentinel
        payload["forceZValidLabelRows"] += force_z_valid
        payload["observedForceZValues"].update(force_z_values)
        trace_summaries.append({
            "path": item["path"], "sha256": item["sha256"], "split": split,
            "task": item["task"], "payload": item["payload"],
            "trajectory": item["trajectory"], "rows": len(rows), "columns": 46,
            "timestampStrictlyIncreasing": non_increasing == 0,
            "timestampNonIncreasingSteps": non_increasing,
            "medianDeltaSeconds": statistics.median(deltas),
            "forceXSentinelRows": force_x_sentinel,
            "forceYSentinelRows": force_y_sentinel,
            "forceZSentinelRows": force_z_sentinel,
            "forceZValidLabelRows": force_z_valid,
            "observedForceZValues": sorted(force_z_values),
            "currentLoadIdenticalRows": trace_current_load_identical,
            "csvParquetMaxAbsFloatDifference": trace_float_max,
            "parquetGroupContiguous": True,
        })
        split_rows += len(rows)
    total_rows += split_rows
    split_summaries.append({
        "split": split, "rawTrajectories": len(split_raw), "parquetGroups": len(groups),
        "rawRows": split_rows, "parquetRows": table.num_rows,
        "rowCountExact": split_rows == table.num_rows,
        "parquetColumns": table.num_columns,
        "parquetSchemaTypes": {field.name: str(field.type) for field in table.schema},
        "parquetNullValues": sum(table[name].null_count for name in names),
        "maxAbsFloatDifference": split_float_max,
    })

force_payload_output = {}
for key, value in sorted(force_by_payload.items()):
    force_payload_output[key] = {**value,
        "observedForceZValues": sorted(value["observedForceZValues"])}

json.dump({
    "schema": request["replaySchema"],
    "parser": {"engine": "python-csv-plus-pyarrow", "pythonVersion": sys.version.split()[0],
               "pyarrowVersion": pa.__version__, "floatAbsTolerance": float_abs_tolerance},
    "rawSchemaColumns": raw_columns,
    "parquetSchemaColumns": parquet_columns,
    "rawTrajectories": len(raw_items),
    "parquetFiles": len(parquet_items),
    "totalRows": total_rows,
    "splitSummaries": split_summaries,
    "traceSummaries": trace_summaries,
    "columnComparison": column_comparison,
    "comparisonCounts": {
        "integerValuesExact": integer_value_comparisons,
        "forceZValuesExact": exact_force_value_comparisons,
        "floatingValuesCompared": floating_value_comparisons,
        "floatingValuesNotBitExact": floating_non_bit_exact,
        "floatingValuesBeyondTolerance": 0,
    },
    "forceLabelsByPayload": force_payload_output,
    "forceXAllSentinel": all(trace["forceXSentinelRows"] == trace["rows"] for trace in trace_summaries),
    "forceYAllSentinel": all(trace["forceYSentinelRows"] == trace["rows"] for trace in trace_summaries),
    "forceZSentinelRows": sum(trace["forceZSentinelRows"] for trace in trace_summaries),
    "forceZValidLabelRows": sum(trace["forceZValidLabelRows"] for trace in trace_summaries),
    "timestampNonIncreasingSteps": sum(trace["timestampNonIncreasingSteps"] for trace in trace_summaries),
    "currentLoadIdenticalRows": current_load_identical_rows,
    "csvParquetRowAndGroupCrosswalkComplete": True,
    "integerAndForceValuesExact": True,
    "floatingValuesWithinDeclaredTolerance": True,
    "floatingValuesBitExact": floating_non_bit_exact == 0,
}, sys.stdout, sort_keys=True, separators=(",", ":"))
`;

function replayHash(value) {
  return digest(NAD_REPORT_SCHEMA + "/csv-parquet-crosswalk", value);
}

export function extractNadSo101Crosswalk(sourceDirectory, options = {}) {
  const before = verifyNadSo101SourceDirectory(sourceDirectory);
  const pythonExecutable = options.pythonExecutable ?? process.env.OUTSIDER_PYTHON ?? ".venv/bin/python";
  if (typeof pythonExecutable !== "string" || pythonExecutable.length < 1) {
    fail("PYTHON_EXECUTABLE_INVALID");
  }
  const raw = before.manifest.hfRemoteObjects.filter((entry) => entry.kind === "RAW_CSV")
    .map(({ path: objectPath, sizeBytes, sha256, split, task, payload, trajectory }) =>
      ({ path: objectPath, sizeBytes, sha256, split, task, payload, trajectory }));
  const parquet = before.manifest.hfRemoteObjects
    .filter((entry) => entry.kind === "PARQUET_REPACK")
    .map(({ path: objectPath, sizeBytes, sha256, split }) =>
      ({ path: objectPath, sizeBytes, sha256, split }));
  const replaySchema = NAD_REPORT_SCHEMA + "/csv-parquet-crosswalk/v1";
  const child = spawnSync(pythonExecutable, ["-c", PYARROW_CROSSWALK], {
    cwd: process.cwd(), encoding: "utf8", timeout: PYARROW_TIMEOUT_MS,
    maxBuffer: MAX_EXTRACTOR_OUTPUT_BYTES,
    input: JSON.stringify({ root: before.sourceDirectory, raw, parquet,
      rawColumns: RAW_COLUMNS, parquetColumns: PARQUET_COLUMNS, replaySchema }),
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONNOUSERSITE: "1", LC_ALL: "C" },
  });
  if (child.error || child.status !== 0 || child.signal !== null || child.stderr !== "") {
    fail("CROSSWALK_EXTRACTOR_FAILED", child.error?.message
      ?? child.stderr?.trim() ?? `status=${child.status};signal=${child.signal}`);
  }
  let replay;
  try { replay = JSON.parse(child.stdout); }
  catch { fail("CROSSWALK_OUTPUT_JSON_INVALID"); }
  const after = verifyNadSo101SourceDirectory(sourceDirectory);
  if (before.manifestFileSha256 !== after.manifestFileSha256
    || before.sourceRoot !== after.sourceRoot) fail("SOURCE_CHANGED_AROUND_CROSSWALK");
  if (!exactObject(replay) || replay.schema !== replaySchema
    || replay.rawTrajectories !== 100 || replay.parquetFiles !== 3
    || replay.totalRows !== 65_916 || !Array.isArray(replay.traceSummaries)
    || replay.traceSummaries.length !== 100 || !Array.isArray(replay.splitSummaries)
    || replay.splitSummaries.length !== 3
    || !same(Object.fromEntries(replay.splitSummaries.map((entry) =>
      [entry.split, entry.rawRows])), EXPECTED_SPLIT_ROWS)
    || replay.csvParquetRowAndGroupCrosswalkComplete !== true
    || replay.integerAndForceValuesExact !== true
    || replay.floatingValuesWithinDeclaredTolerance !== true
    || replay.comparisonCounts?.floatingValuesBeyondTolerance !== 0
    || replay.comparisonCounts?.floatingValuesCompared !== 856_908
    || replay.comparisonCounts?.floatingValuesNotBitExact !== 513_315
    || replay.comparisonCounts?.forceZValuesExact !== 65_916
    || replay.comparisonCounts?.integerValuesExact !== 2_109_312
    || replay.floatingValuesBitExact !== false
    || replay.forceXAllSentinel !== true || replay.forceYAllSentinel !== true
    || replay.forceZSentinelRows !== 26_191 || replay.forceZValidLabelRows !== 39_725
    || replay.timestampNonIncreasingSteps !== 0 || replay.currentLoadIdenticalRows !== 0
    || replay.parser?.floatAbsTolerance !== 2e-15) {
    fail("CROSSWALK_PROFILE_INVALID");
  }
  const hash = replayHash(replay);
  if (EXPECTED_CROSSWALK_HASH !== null && hash !== EXPECTED_CROSSWALK_HASH) {
    fail("CROSSWALK_HASH_CHANGED", hash);
  }
  return Object.freeze({ replay, replayHash: hash, source: before,
    helperSha256: nadSha256(Buffer.from(PYARROW_CROSSWALK, "utf8")) });
}

const SEGMENT_BOUNDARY = Object.freeze({
  additiveAcrossSegments: false,
  completeIndependentEpisodeIntersection: 0,
  opportunityCensus: { prospectiveOpportunityRecords: 0,
    independentlyObservedOpportunityRecords: 0 },
  delegationAuthorization: { delegationRecords: 0, authorityRecords: 0,
    authorizedRecords: 0 },
  action: { sourceNativeCommandedPositionTraceRecords: 100,
    outsiderAuthorizedActionRecords: 0, actionsDispatchedByArtifact: 0,
    actionsExecutedByArtifact: 0 },
  mechanicalTelemetry: { sourceNativeServoTelemetryTraceRecords: 100,
    sourceNativeTelemetryRows: 65_916, independentMechanicalTruthRecords: 0 },
  effect: { independentPhysicalEffectRecords: 0,
    independentObjectStateEffectRecords: 0 },
  outcome: { independentOutcomeRecords: 0 },
  recovery: { independentRecoveryChains: 0 },
  longitudinal: { sourceNativeWithinTraceOrderedRecords: 100,
    independentlyTrackedCrossTraceIdentityRecords: 0 },
});

const TRAINING_BOUNDARY = Object.freeze({
  artifactUseBoundary: "OFFLINE_MECHANICAL_EVALUATION_AND_RESEARCH_ONLY",
  offlineCorpusReplayPerformed: true,
  offlineModelFittingPerformed: false,
  offlineModelFittingRows: 0,
  authorizedTraining: false,
  authorizedTrainingRows: 0,
  authorizedTrainingJobs: 0,
  authorizedTrainingPerformed: false,
  productionTraining: false,
  productionTrainingRows: 0,
  policyOptimizationPerformed: false,
  modelWeightsProduced: false,
  linkedTrainingCodeExecuted: false,
});

const AUTHORITY_BOUNDARY = Object.freeze({
  delegationRecords: 0,
  authorityRecords: 0,
  authorizedActionRecords: 0,
  actionsDispatched: 0,
  actionsExecutedByArtifact: 0,
  independentOutcomeRecords: 0,
  independentRecoveryRecords: 0,
  independentlyTrackedLongitudinalRecords: 0,
  networkContributionRecords: 0,
  CEURecords: 0,
  creditUnitsMinted: 0,
  productionTrainingRows: 0,
  authorityDelta: 0,
  executable: false,
});

const PRIVACY_PROJECTION = Object.freeze({
  retainedVideoFiles: 0,
  rawSourceTextProjectedRows: 0,
  rawTelemetryProjectedRows: 0,
  rawTelemetryProjectedValues: 0,
  humanIdentifierProjectedRows: 0,
  networkProjectionRows: 0,
  trainingProjectionRows: 0,
});

function buildNadReportBody(extracted) {
  const replay = extracted.replay;
  const manifest = extracted.source.manifest;
  return {
    schema: NAD_REPORT_SCHEMA,
    createdAt: NAD_FROZEN_AT,
    dataset: {
      id: NAD_DATASET_ID,
      revision: NAD_REVISION,
      title: "Neural Actuation Dataset (NAD) — SO-101 closure",
      sourceClass: "HISTORICAL_REAL_SO101_MECHANICAL_SYSTEM_IDENTIFICATION_TELEMETRY",
      robotPlatform: "SO-101",
      publisherCardLicenseClaim: "MIT",
      linkedGithubRepository: NAD_GITHUB_REPOSITORY,
      linkedGithubHead: NAD_GITHUB_HEAD,
      linkedGithubTree: NAD_GITHUB_TREE,
    },
    sourceReplay: {
      verificationLevel: "FULL_RAW_AND_PARQUET_SOURCE_REPLAY",
      sourceManifestHash: manifest.manifestHash,
      sourceManifestFileSha256: extracted.source.manifestFileSha256,
      sourceRoot: extracted.source.sourceRoot,
      hfTreePagesPerBracket: EXPECTED_PROFILE.treePages,
      hfTreeEntries: EXPECTED_PROFILE.treeEntries,
      hfRepositoryFiles: EXPECTED_PROFILE.repositoryFiles,
      hfRawDataTreeOid: EXPECTED_HF_DATA_TREE,
      hfSo101TreeOid: EXPECTED_SO101_TREE,
      githubSo101TreeOid: EXPECTED_SO101_TREE,
      rawGithubTreeIdentityEstablished: true,
      hfObjects: EXPECTED_PROFILE.hfObjects,
      hfBytes: EXPECTED_PROFILE.hfBytes,
      rawCsvFiles: EXPECTED_PROFILE.rawFiles,
      rawCsvBytes: EXPECTED_PROFILE.rawBytes,
      parquetFiles: EXPECTED_PROFILE.parquetFiles,
      parquetBytes: EXPECTED_PROFILE.parquetBytes,
      githubProvenanceObjects: EXPECTED_PROFILE.githubObjects,
      githubProvenanceBytes: EXPECTED_PROFILE.githubBytes,
      videoFilesExcluded: EXPECTED_PROFILE.videoFilesExcluded,
      videoBytesExcluded: EXPECTED_PROFILE.videoBytesExcluded,
      rawTrajectories: replay.rawTrajectories,
      rawTelemetryRows: replay.totalRows,
      replaySchema: replay.schema,
      replayHash: extracted.replayHash,
      parser: { ...replay.parser, helperSha256: extracted.helperSha256,
        timeoutMs: PYARROW_TIMEOUT_MS, maxOutputBytes: MAX_EXTRACTOR_OUTPUT_BYTES },
      rawSchemaColumns: replay.rawSchemaColumns,
      parquetSchemaColumns: replay.parquetSchemaColumns,
      splitSummaries: replay.splitSummaries,
      traceSummaries: replay.traceSummaries,
      columnComparison: replay.columnComparison,
      comparisonCounts: replay.comparisonCounts,
      csvParquetRowAndGroupCrosswalkComplete:
        replay.csvParquetRowAndGroupCrosswalkComplete,
      integerAndForceValuesExact: replay.integerAndForceValuesExact,
      floatingValuesWithinDeclaredTolerance: replay.floatingValuesWithinDeclaredTolerance,
      floatingValuesBitExact: replay.floatingValuesBitExact,
      sourceNamedCodeOrConfigsExecuted: 0,
      transportAttested: false,
    },
    declaredScope: {
      exactPinnedHfRepositoryTreeEnumerated: true,
      fullSo101RawCsvClosureExhausted: true,
      fullSo101ParquetClosureExhausted: true,
      linkedGithubHeadAndSelectedProvenanceClosureExhausted: true,
      fullHfRepositoryContentExhausted: false,
      fullGithubRepositoryContentExhausted: false,
      broadExternalDiscoveryPerformed: false,
      globalExhaustion: false,
    },
    denominatorRegistry: {
      populations: [{
        denominatorClass: "MECHANICAL_SYSTEM_IDENTIFICATION_TRACE",
        units: 100,
        unitDefinition: "ONE_CANONICAL_RAW_SO101_CSV_TRAJECTORY",
        trainFilenameSplitTraces: 80,
        validationFilenameSplitTraces: 10,
        testFilenameSplitTraces: 10,
        taskPayloadCombinations: 10,
        representationRows: 65_916,
        parquetRepackFiles: 3,
        parquetRepacksAreAdditionalUnits: false,
        episodeStatus: "NOT_AN_OUTSIDER_PROSPECTIVE_EPISODE",
      }],
      crossDomainTotal: null,
      crossDomainAdditionProhibited: true,
      trajectoryUnitsAndRepresentationRowsAdditive: false,
      rawAndParquetRepresentationsAdditive: false,
    },
    sourceSemantics: {
      publisherSamplingPeriodSecondsClaim: 0.01605,
      publisherApproximateSamplingRateHzClaim: 62.3,
      rawColumns: 46,
      parquetColumnsIncludingProvenance: 49,
      rawTelemetryGroups: ["joint_position", "commanded_joint_position",
        "current_register", "velocity_register", "signed_load_register",
        "temperature", "voltage", "payload_derived_force_label"],
      releasedConfigCurrentSource: "load",
      currentRegisterStillPresentInRawData: true,
      currentAndLoadAreDistinctRegisters: true,
      rowsWhereAllSixCurrentAndLoadValuesAreEqual: replay.currentLoadIdenticalRows,
      releasedConfigMasksInvalidForce: true,
      missingForceSentinel: -999,
      timestampNonIncreasingSteps: replay.timestampNonIncreasingSteps,
      allTraceTimestampsStrictlyIncreasing: replay.timestampNonIncreasingSteps === 0,
    },
    forceLabelBoundary: {
      so101EndEffectorForceSensorPresent: false,
      measuredEndEffectorForceRows: 0,
      forceZAttribution: "PAYLOAD_DERIVED_SOURCE_LABEL_NOT_FORCE_SENSOR_MEASUREMENT",
      forceZValidPayloadLabelRows: replay.forceZValidLabelRows,
      forceZSentinelRows: replay.forceZSentinelRows,
      forceXSentinelRows: replay.totalRows,
      forceYSentinelRows: replay.totalRows,
      forceLabelsByPayload: replay.forceLabelsByPayload,
      sentinelMustBeHandledBeforeNumericUse: true,
      independentForceTruthEstablished: false,
    },
    rightsAndUseClearance: {
      hfCardLicenseClaim: "MIT",
      hfReadmeLicenseClaimBytePinned: true,
      linkedGithubMitLicenseBytePinned: true,
      legalConclusion: false,
      privacyClearanceAdjudicated: false,
      revisionSpecificUseClearanceAdjudicated: false,
      productionUseClearanceAdjudicated: false,
      authorizedTrainingClearanceAdjudicated: false,
      artifactUseBoundary: "OFFLINE_MECHANICAL_EVALUATION_AND_RESEARCH_ONLY",
    },
    segmentCoverageAttribution: SEGMENT_BOUNDARY,
    privacyAndProjection: PRIVACY_PROJECTION,
    modelAndTrainingBoundary: TRAINING_BOUNDARY,
    authorityBoundary: AUTHORITY_BOUNDARY,
    limitations: {
      payloadDerivedForceLabelsAreMeasuredForce: false,
      goalPositionsEstablishOutsiderAuthorization: false,
      servoTelemetryEstablishesIndependentObjectStateEffect: false,
      taskNamesEstablishTaskSuccess: false,
      trainValidationTestSplitsEstablishProspectiveDelegation: false,
      sourceProvidesFailureOrRecoveryCensus: false,
      videosUsedAsIndependentWitness: false,
      videosAreFrameSynchronizedToTelemetry: false,
      floatingCsvAndParquetValuesAreBitExact: false,
      declaredFloatCrosswalkTolerance: 2e-15,
      sourceClaimsMustNotBePromotedToIndependentTruth: true,
    },
  };
}

export function buildNadSo101MechanicsFromSource(sourceDirectory, options = {}) {
  const extracted = extractNadSo101Crosswalk(sourceDirectory, options);
  const body = buildNadReportBody(extracted);
  return Object.freeze({ ...body,
    artifactHash: digest(NAD_REPORT_SCHEMA + "/artifact", body) });
}

function addError(errors, condition, code) {
  if (!condition) errors.push(code);
}

export function verifyNadSo101MechanicsReport(report) {
  const errors = [];
  try {
    addError(errors, exactKeys(report, ["schema", "createdAt", "dataset", "sourceReplay",
      "declaredScope", "denominatorRegistry", "sourceSemantics", "forceLabelBoundary",
      "rightsAndUseClearance", "segmentCoverageAttribution", "privacyAndProjection",
      "modelAndTrainingBoundary", "authorityBoundary", "limitations", "artifactHash"]),
    "TOP_LEVEL_SHAPE");
    if (!exactObject(report)) return Object.freeze({ ok: false, errors });
    const { artifactHash, ...body } = report;
    addError(errors, report.schema === NAD_REPORT_SCHEMA, "SCHEMA");
    addError(errors, report.createdAt === NAD_FROZEN_AT, "CREATED_AT");
    addError(errors, HASH.test(artifactHash ?? "")
      && artifactHash === digest(NAD_REPORT_SCHEMA + "/artifact", body), "ARTIFACT_HASH");
    addError(errors, report.dataset?.id === NAD_DATASET_ID
      && report.dataset?.revision === NAD_REVISION
      && report.dataset?.linkedGithubHead === NAD_GITHUB_HEAD
      && report.dataset?.linkedGithubTree === NAD_GITHUB_TREE, "DATASET_BINDING");
    addError(errors, report.sourceReplay?.verificationLevel
      === "FULL_RAW_AND_PARQUET_SOURCE_REPLAY"
      && HASH.test(report.sourceReplay?.sourceManifestHash ?? "")
      && HASH.test(report.sourceReplay?.sourceManifestFileSha256 ?? "")
      && HASH.test(report.sourceReplay?.sourceRoot ?? "")
      && report.sourceReplay?.hfTreePagesPerBracket === 27
      && report.sourceReplay?.hfTreeEntries === 1302
      && report.sourceReplay?.rawCsvFiles === 100
      && report.sourceReplay?.rawCsvBytes === 24_207_793
      && report.sourceReplay?.parquetFiles === 3
      && report.sourceReplay?.parquetBytes === 1_604_946
      && report.sourceReplay?.videoFilesExcluded === 100
      && report.sourceReplay?.videoBytesExcluded === 379_638_513
      && report.sourceReplay?.rawTrajectories === 100
      && report.sourceReplay?.rawTelemetryRows === 65_916
      && report.sourceReplay?.replayHash === EXPECTED_CROSSWALK_HASH
      && report.sourceReplay?.csvParquetRowAndGroupCrosswalkComplete === true
      && report.sourceReplay?.integerAndForceValuesExact === true
      && report.sourceReplay?.floatingValuesWithinDeclaredTolerance === true
      && report.sourceReplay?.floatingValuesBitExact === false
      && report.sourceReplay?.comparisonCounts?.integerValuesExact === 2_109_312
      && report.sourceReplay?.comparisonCounts?.forceZValuesExact === 65_916
      && report.sourceReplay?.comparisonCounts?.floatingValuesCompared === 856_908
      && report.sourceReplay?.comparisonCounts?.floatingValuesNotBitExact === 513_315
      && report.sourceReplay?.sourceNamedCodeOrConfigsExecuted === 0,
    "SOURCE_REPLAY");
    addError(errors, same(report.declaredScope, {
      exactPinnedHfRepositoryTreeEnumerated: true,
      fullSo101RawCsvClosureExhausted: true,
      fullSo101ParquetClosureExhausted: true,
      linkedGithubHeadAndSelectedProvenanceClosureExhausted: true,
      fullHfRepositoryContentExhausted: false,
      fullGithubRepositoryContentExhausted: false,
      broadExternalDiscoveryPerformed: false,
      globalExhaustion: false,
    }), "SCOPE_BOUNDARY");
    addError(errors, same(report.denominatorRegistry, {
      populations: [{ denominatorClass: "MECHANICAL_SYSTEM_IDENTIFICATION_TRACE",
        units: 100, unitDefinition: "ONE_CANONICAL_RAW_SO101_CSV_TRAJECTORY",
        trainFilenameSplitTraces: 80, validationFilenameSplitTraces: 10,
        testFilenameSplitTraces: 10, taskPayloadCombinations: 10,
        representationRows: 65_916, parquetRepackFiles: 3,
        parquetRepacksAreAdditionalUnits: false,
        episodeStatus: "NOT_AN_OUTSIDER_PROSPECTIVE_EPISODE" }],
      crossDomainTotal: null, crossDomainAdditionProhibited: true,
      trajectoryUnitsAndRepresentationRowsAdditive: false,
      rawAndParquetRepresentationsAdditive: false,
    }), "DENOMINATOR_BOUNDARY");
    addError(errors, report.sourceSemantics?.releasedConfigCurrentSource === "load"
      && report.sourceSemantics?.currentAndLoadAreDistinctRegisters === true
      && report.sourceSemantics?.rowsWhereAllSixCurrentAndLoadValuesAreEqual === 0
      && report.sourceSemantics?.missingForceSentinel === -999
      && report.sourceSemantics?.allTraceTimestampsStrictlyIncreasing === true,
    "SOURCE_SEMANTICS");
    addError(errors, report.forceLabelBoundary?.so101EndEffectorForceSensorPresent === false
      && report.forceLabelBoundary?.measuredEndEffectorForceRows === 0
      && report.forceLabelBoundary?.forceZValidPayloadLabelRows === 39_725
      && report.forceLabelBoundary?.forceZSentinelRows === 26_191
      && report.forceLabelBoundary?.forceXSentinelRows === 65_916
      && report.forceLabelBoundary?.forceYSentinelRows === 65_916
      && report.forceLabelBoundary?.independentForceTruthEstablished === false,
    "FORCE_LABEL_BOUNDARY");
    addError(errors, same(report.segmentCoverageAttribution, SEGMENT_BOUNDARY),
      "SEGMENT_BOUNDARY");
    addError(errors, same(report.privacyAndProjection, PRIVACY_PROJECTION),
      "PRIVACY_PROJECTION");
    addError(errors, same(report.modelAndTrainingBoundary, TRAINING_BOUNDARY),
      "TRAINING_BOUNDARY");
    addError(errors, same(report.authorityBoundary, AUTHORITY_BOUNDARY),
      "AUTHORITY_BOUNDARY");
    addError(errors, report.rightsAndUseClearance?.hfCardLicenseClaim === "MIT"
      && report.rightsAndUseClearance?.linkedGithubMitLicenseBytePinned === true
      && report.rightsAndUseClearance?.legalConclusion === false
      && report.rightsAndUseClearance?.authorizedTrainingClearanceAdjudicated === false,
    "RIGHTS_BOUNDARY");
    addError(errors, report.limitations?.payloadDerivedForceLabelsAreMeasuredForce === false
      && report.limitations?.taskNamesEstablishTaskSuccess === false
      && report.limitations?.sourceProvidesFailureOrRecoveryCensus === false
      && report.limitations?.videosUsedAsIndependentWitness === false
      && report.limitations?.sourceClaimsMustNotBePromotedToIndependentTruth === true,
    "LIMITATIONS");
  } catch (error) { errors.push(`VERIFY_EXCEPTION:${safeError(error)}`); }
  return Object.freeze({ ok: errors.length === 0, errors });
}

export function verifyNadSo101MechanicsWithSource(report, sourceDirectory, options = {}) {
  const errors = [...verifyNadSo101MechanicsReport(report).errors];
  try {
    const rebuilt = buildNadSo101MechanicsFromSource(sourceDirectory, options);
    addError(errors, same(rebuilt, report), "SOURCE_EXACT_REBUILD");
  } catch (error) { errors.push(`SOURCE_REBUILD_EXCEPTION:${safeError(error)}`); }
  return Object.freeze({ ok: errors.length === 0, errors,
    verificationLevel: errors.length === 0 ? "FULL_SOURCE_REDERIVED" : null });
}

export function buildNadSo101RunReceipt(report, reportBytes) {
  if (!Buffer.isBuffer(reportBytes) || !reportBytes.equals(canonicalBytes(report))
    || !verifyNadSo101MechanicsReport(report).ok) fail("RECEIPT_INPUT_INVALID");
  const body = {
    schema: NAD_RECEIPT_SCHEMA,
    createdAt: NAD_FROZEN_AT,
    command: "node scripts/acquire-nad-so101-mechanics.mjs",
    report: { path: "nad-so101-mechanics.json", bytes: reportBytes.length,
      sha256: nadSha256(reportBytes), artifactHash: report.artifactHash },
    source: { manifestHash: report.sourceReplay.sourceManifestHash,
      manifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      exactSourceRebuildPerformed: true,
      csvParquetCrosswalkHash: EXPECTED_CROSSWALK_HASH },
    denominatorBoundary: { class: "MECHANICAL_SYSTEM_IDENTIFICATION_TRACE",
      units: 100, representationRows: 65_916, crossDomainTotal: null,
      crossDomainAdditionProhibited: true },
    zeroClaimBoundary: { measuredEndEffectorForceRows: 0,
      independentOutcomeRecords: 0, recoveryRecords: 0, delegationRecords: 0,
      authorityRecords: 0, networkContributionRecords: 0, CEURecords: 0,
      authorizedTrainingRows: 0, productionTrainingRows: 0 },
    publication: { reportPublishedBeforeReceipt: true, receiptWrittenLast: true,
      filesMode: "0600", directoriesMode: "0700", noClobber: true },
  };
  return Object.freeze({ ...body,
    receiptHash: digest(NAD_RECEIPT_SCHEMA + "/receipt", body) });
}

export function verifyNadSo101RunReceipt(receipt, reportBytes) {
  try {
    if (!exactObject(receipt) || !Buffer.isBuffer(reportBytes)) fail("RECEIPT_VERIFY_INPUT");
    const report = parseJson(reportBytes, "RECEIPT_REPORT_JSON_INVALID");
    if (!reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_REPORT_NOT_CANONICAL");
    const expected = buildNadSo101RunReceipt(report, reportBytes);
    if (!same(receipt, expected)) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true, receiptHash: receipt.receiptHash });
  } catch (error) { return Object.freeze({ ok: false, errors: [safeError(error)] }); }
}

export function publishNadSo101ArtifactDirectory(stagingDirectory, targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (staging === target || path.dirname(staging) !== path.dirname(target)) {
    fail("PUBLISH_DIRECTORIES_NOT_SIBLINGS");
  }
  const stat = lstatSync(staging, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || Number(stat.mode & 0o777n) !== 0o700
    || !same(sorted(readdirSync(staging)),
      ["nad-so101-mechanics.json", "run-receipt.json", "source"])) {
    fail("PUBLISH_STAGING_INVALID");
  }
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("PUBLISH_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "source"), path.join(target, "source"));
    renameSync(path.join(staging, "nad-so101-mechanics.json"),
      path.join(target, "nad-so101-mechanics.json"));
    /* Receipt moves last as the completion marker. */
    renameSync(path.join(staging, "run-receipt.json"),
      path.join(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch { fail("PUBLISH_TARGET_INCOMPLETE", target); }
  return target;
}

export function verifyNadSo101ArtifactDirectory(artifactDirectory, options = {}) {
  try {
    const root = path.resolve(artifactDirectory);
    const snapshots = [];
    requirePrivateDirectory(root,
      ["nad-so101-mechanics.json", "run-receipt.json", "source"], snapshots);
    const reportBytes = readPrivateStable(root, "nad-so101-mechanics.json", snapshots,
      MAX_EXTRACTOR_OUTPUT_BYTES);
    const receiptBytes = readPrivateStable(root, "run-receipt.json", snapshots,
      MAX_API_BYTES);
    const report = parseJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    if (!reportBytes.equals(canonicalBytes(report))
      || !receiptBytes.equals(canonicalBytes(receipt))) fail("ARTIFACT_JSON_NOT_CANONICAL");
    const replay = verifyNadSo101MechanicsWithSource(report, path.join(root, "source"), options);
    const receiptCheck = verifyNadSo101RunReceipt(receipt, reportBytes);
    if (!replay.ok || !receiptCheck.ok) fail("ARTIFACT_DIRECTORY_REPLAY_FAILED",
      replay.errors?.join(",") ?? receiptCheck.errors?.join(","));
    recheckSnapshots(snapshots);
    return Object.freeze({ ok: true, verificationLevel: "FULL_SOURCE_REDERIVED",
      artifactHash: report.artifactHash, reportFileSha256: nadSha256(reportBytes),
      receiptHash: receipt.receiptHash,
      sourceManifestHash: report.sourceReplay.sourceManifestHash,
      sourceRoot: report.sourceReplay.sourceRoot,
      mechanicalSystemIdentificationTraces: 100, rows: 65_916,
      measuredEndEffectorForceRows: 0, authorizedTrainingRows: 0,
      independentOutcomeRecords: 0, authorityDelta: 0 });
  } catch (error) { return Object.freeze({ ok: false, errors: [safeError(error)] }); }
}

export const NAD_SO101_CONSTANTS = Object.freeze({
  expectedProfile: EXPECTED_PROFILE,
  expectedTreeSnapshotHash: EXPECTED_TREE_SNAPSHOT_HASH,
  expectedCrosswalkHash: EXPECTED_CROSSWALK_HASH,
  expectedRawColumns: RAW_COLUMNS,
  expectedParquetColumns: PARQUET_COLUMNS,
  expectedSplitRows: EXPECTED_SPLIT_ROWS,
  githubObjectSpecs: GITHUB_OBJECT_SPECS,
  pyarrowHelperSha256: nadSha256(Buffer.from(PYARROW_CROSSWALK, "utf8")),
});
