/*
 * BotFails complete public annotation/metadata intake plus one complete
 * same-task no-video state/action group.
 *
 * Binary publisher labels are detection targets.  They are not independent
 * task outcomes, recovery chains, or a prospective attempt census.  Likewise,
 * normal_train membership is a publisher split declaration, not independently
 * adjudicated success.
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

export const BOTFAILS_DATASET_ID = "kantine/BotFails";
export const BOTFAILS_REVISION = "3478e49d91e1737eb76dfee2d81bb22617039c13";
export const BOTFAILS_GITHUB_REPOSITORY = "CEA-LIST/FIDeL";
export const BOTFAILS_GITHUB_REVISION = "33f67be857a5fb855fa538291616ee2e4e6369bf";
export const BOTFAILS_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const BOTFAILS_SOURCE_SCHEMA = "outsider/botfails-pinned-source/v1";
export const BOTFAILS_INVENTORY_SCHEMA = "outsider/botfails-anomaly-inventory/v1";
export const BOTFAILS_REPORT_SCHEMA = "outsider/botfails-anomaly-annotation-corpus/v1";
export const BOTFAILS_RECEIPT_SCHEMA = "outsider/botfails-run-receipt/v1";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${BOTFAILS_DATASET_ID}`;
const HF_RECORD_URL = `${HF_API}/revision/${BOTFAILS_REVISION}`;
const HF_COMMITS_URL = `${HF_API}/commits/main?limit=100`;
const HF_TREE_PATH = `/api/datasets/${BOTFAILS_DATASET_ID}/tree/${BOTFAILS_REVISION}`;
const HF_TREE_URL = `${HF_ORIGIN}${HF_TREE_PATH}?recursive=true&limit=1000`;
const HF_RESOLVE = `${HF_ORIGIN}/datasets/${BOTFAILS_DATASET_ID}/resolve/${BOTFAILS_REVISION}`;
const GH_API = `https://api.github.com/repos/${BOTFAILS_GITHUB_REPOSITORY}`;
const GH_HEAD_URL = `${GH_API}/commits/main`;
const GH_TREE_URL = `${GH_API}/git/trees/${BOTFAILS_GITHUB_REVISION}?recursive=1`;
const PROJECT_URL = "https://cea-list.github.io/FIDeL/";
const FETCH_TIMEOUT_MS = 180_000;
const MAX_API_BYTES = 16 * 1024 * 1024;
const MAX_OBJECT_BYTES = 2 * 1024 * 1024;
const DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_CONCURRENCY = 20;
const EXPECTED = Object.freeze({
  hfEntries: 1_369,
  hfFiles: 1_195,
  hfDirectories: 174,
  hfTreeBytes: 9_172_439_329,
  hfRecordUsedStorageBytes: 9_171_977_436,
  parquetFiles: 323,
  parquetBytes: 21_024_201,
  videoFiles: 646,
  videoBytes: 9_150_824_572,
  labelFiles: 144,
  labelBytes: 361_749,
  metadataFiles: 80,
  metadataBytes: 220_417,
  testEpisodes: 145,
  normalTrainEpisodes: 178,
  selectedHfFiles: 256,
  selectedHfBytes: 2_717_072,
  selectedTaskParquets: 30,
  selectedTaskParquetBytes: 2_126_516,
  selectedTaskTestEpisodes: 10,
  selectedTaskNormalEpisodes: 20,
  metadataFrames: 414_359,
  testFrames: 182_070,
  normalTrainFrames: 232_289,
  labelRows: 180_875,
  labelMetadataFrames: 180_876,
  labelZeroRows: 120_665,
  labelOneRows: 60_210,
  labelEpisodesWithAnyOne: 108,
  labelAllZeroEpisodes: 36,
  labelAllOneEpisodes: 1,
  labelPositiveRuns: 129,
  labelValueTransitions: 159,
  selectedTaskFrames: 44_785,
  selectedTaskTestFrames: 14_926,
  selectedTaskNormalFrames: 29_859,
  githubEntries: 354,
  githubBlobs: 318,
  githubBlobBytes: 14_993_875,
  githubLabelBlobs: 181,
  crossRepositoryLabelMatches: 144,
});
const TASK_PROFILES = Object.freeze([
  ["domotic_dishTidyUp", 15, 15, 20],
  ["domotic_groceriesSorting", 10, 10, 20],
  ["domotic_makingCoffee", 15, 15, 20],
  ["domotic_pouringCoffee", 20, 20, 20],
  ["domotic_setTheTable", 14, 15, 18],
  ["domotic_vegetablesAndFruitsSorting", 20, 20, 20],
  ["industrial_robothon_buttons", 10, 10, 15],
  ["industrial_robothon_hatchAndProbe", 15, 15, 10],
  ["industrial_screws_sorting", 10, 10, 20],
  ["industrial_soldering", 15, 15, 15],
]);
const MISSING_LABEL_KEY = "domotic_setTheTable/episode_000007";
const LABEL_LENGTH_MISMATCH = Object.freeze({
  episodeKey: "industrial_screws_sorting/episode_000007",
  metadataFrames: 1_492,
  labelRows: 1_491,
  labelLengthDeltaRows: -1,
});
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const REDIRECT_HOST = /(?:^|\.)(?:hf\.co|huggingface\.co)$/iu;

function fail(code, detail = null) {
  throw new Error(detail === null ? `BOTFAILS_CORPUS_${code}`
    : `BOTFAILS_CORPUS_${code}:${detail}`);
}

export function botFailsSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function botFailsDigest(value, domain = BOTFAILS_REPORT_SCHEMA) {
  return botFailsSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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
  if (typeof value !== "string" || value.length < 1 || value.startsWith("/")
    || value.includes("\\") || value.split("/").some((part) => ["", ".", ".."].includes(part))
    || path.posix.normalize(value) !== value) fail("PATH_INVALID", String(value));
  return value;
}

function checkedUrl(value, kind) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    fail("URL_INVALID", value);
  }
  if (kind === "HF" && url.origin !== HF_ORIGIN) fail("HF_URL_INVALID", value);
  if (kind === "GH" && url.origin !== "https://api.github.com") {
    fail("GITHUB_URL_INVALID", value);
  }
  if (kind === "PROJECT" && url.origin !== "https://cea-list.github.io") {
    fail("PROJECT_URL_INVALID", value);
  }
  if (kind === "REDIRECT" && !(url.origin === HF_ORIGIN
    || REDIRECT_HOST.test(url.hostname))) fail("REDIRECT_URL_INVALID", value);
  return url;
}

async function delay(milliseconds) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readResponse(response, maximumBytes, expectedBytes = null) {
  if (!response.body) fail("FETCH_BODY_MISSING");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared) || Number(declared) > maximumBytes
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

async function boundedFetch(value, kind, maximumBytes, fetchImpl, expectedStatus = 200) {
  const url = checkedUrl(value, kind);
  let lastError = null;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, { redirect: "error",
        headers: { accept: kind === "PROJECT" ? "text/html" : "application/json",
          "accept-encoding": "identity", "user-agent": "outsider-botfails-corpus/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (response.status !== expectedStatus || response.headers.get("content-encoding") !== null
        || new URL(response.url || url).origin !== url.origin) {
        fail(`FETCH_HTTP_${response.status}`, url.pathname);
      }
      return { bytes: await readResponse(response, maximumBytes), headers: response.headers,
        status: response.status };
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

async function jsonFetch(value, kind, maximumBytes, fetchImpl) {
  const fetched = await boundedFetch(value, kind, maximumBytes, fetchImpl);
  return { ...fetched, value: parseJson(fetched.bytes, "FETCH_JSON_INVALID") };
}

async function objectFetch(remotePath, expectedBytes, fetchImpl) {
  const initial = checkedUrl(`${HF_RESOLVE}/${remotePath}?download=true`, "HF");
  let lastError = null;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      let url = initial;
      for (let redirect = 0; redirect < 5; redirect += 1) {
        const response = await fetchImpl(url, { redirect: "manual",
          headers: { accept: "application/octet-stream", "accept-encoding": "identity",
            "user-agent": "outsider-botfails-corpus/1.0" },
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          const location = response.headers.get("location");
          if (!location) fail("OBJECT_REDIRECT_MISSING", remotePath);
          url = checkedUrl(new URL(location, url).toString(), "REDIRECT");
          continue;
        }
        if (response.status !== 200 || response.headers.get("content-encoding") !== null) {
          fail(`OBJECT_HTTP_${response.status}`, remotePath);
        }
        return readResponse(response, Math.min(MAX_OBJECT_BYTES,
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
  if (!exactObject(value) || value.id !== BOTFAILS_DATASET_ID
    || value.sha !== BOTFAILS_REVISION || value.private !== false || value.gated !== false
    || value.disabled !== false || value.cardData?.license !== "apache-2.0"
    || value.lastModified !== "2026-04-28T15:36:42.000Z"
    || value.usedStorage !== EXPECTED.hfRecordUsedStorageBytes
    || !Array.isArray(value.siblings) || value.siblings.length !== EXPECTED.hfFiles) {
    fail("HF_RECORD_INVALID");
  }
  return { datasetId: BOTFAILS_DATASET_ID, revision: BOTFAILS_REVISION,
    lastModified: value.lastModified, private: false, gated: false, disabled: false,
    publisherLicenseClaim: "Apache-2.0", usedStorageBytes: value.usedStorage,
    siblingCount: value.siblings.length,
    siblingPaths: sorted(value.siblings.map((item) => safeRelative(item.rfilename))) };
}

function commitsProjection(value) {
  if (!Array.isArray(value) || value.length !== 4) fail("HF_COMMITS_INVALID");
  const projected = value.map((entry) => ({ id: entry.id, title: entry.title,
    date: entry.date, author: entry.authors?.[0]?.user ?? null }));
  const expected = [
    [BOTFAILS_REVISION, "Upload labels", "2026-04-28T15:36:42.000Z"],
    ["af2076a3523a1eb6f9e3ed38f069c0dd97423db4", "Update README.md",
      "2026-04-28T15:31:53.000Z"],
    ["3751f2c6313c2dd28992690dfcf1bbc4a1d9491d", "initial commit",
      "2026-04-28T14:06:23.000Z"],
    ["1678698fd880b4674a45b6b76deaab64449e8551", "initial commit",
      "2026-04-28T14:00:48.000Z"],
  ];
  for (let index = 0; index < expected.length; index += 1) {
    if (projected[index].id !== expected[index][0]
      || projected[index].title !== expected[index][1]
      || projected[index].date !== expected[index][2]
      || projected[index].author !== "kantine") fail("HF_COMMIT_LINEAGE_CHANGED");
  }
  return projected;
}

function normalizeHfTree(value) {
  if (!Array.isArray(value)) fail("HF_TREE_INVALID");
  return value.map((entry) => {
    if (!exactObject(entry) || !["file", "directory"].includes(entry.type)
      || !SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size) || entry.size < 0) {
      fail("HF_TREE_ENTRY_INVALID");
    }
    const projected = { path: safeRelative(entry.path), type: entry.type,
      gitOid: entry.oid, sizeBytes: entry.size, lfs: null, xetHash: null };
    if (entry.type === "directory") {
      if (entry.size !== 0) fail("HF_TREE_DIRECTORY_INVALID", entry.path);
      return projected;
    }
    if (entry.size < 1) fail("HF_TREE_FILE_EMPTY", entry.path);
    if (entry.lfs !== undefined) {
      if (!exactObject(entry.lfs) || !SHA256.test(entry.lfs.oid ?? "")
        || entry.lfs.size !== entry.size || !Number.isSafeInteger(entry.lfs.pointerSize)) {
        fail("HF_TREE_LFS_INVALID", entry.path);
      }
      projected.lfs = { sha256: `sha256:${entry.lfs.oid}`, sizeBytes: entry.lfs.size,
        pointerSize: entry.lfs.pointerSize };
    }
    if (entry.xetHash !== undefined) {
      if (!SHA256.test(entry.xetHash)) fail("HF_TREE_XET_INVALID", entry.path);
      projected.xetHash = entry.xetHash;
    }
    return projected;
  });
}

function parseNextLink(value) {
  if (!value) return null;
  const part = String(value).split(",").find((item) => /;\s*rel="next"\s*$/iu.test(item));
  if (!part) return null;
  const match = /^\s*<([^>]+)>/u.exec(part);
  if (!match) fail("HF_TREE_LINK_INVALID");
  const url = checkedUrl(match[1], "HF");
  if (decodeURIComponent(url.pathname) !== HF_TREE_PATH
    || url.searchParams.get("recursive") !== "true"
    || url.searchParams.get("limit") !== "1000"
    || url.searchParams.get("expand") !== "false"
    || !url.searchParams.get("cursor")) fail("HF_TREE_LINK_UNSAFE");
  return url.toString();
}

async function fetchHfTree(fetchImpl, label) {
  const entries = [];
  const support = [];
  const seen = new Set();
  let url = HF_TREE_URL;
  for (let page = 1; url !== null; page += 1) {
    if (page > 4 || seen.has(url)) fail("HF_TREE_PAGINATION_INVALID");
    seen.add(url);
    const fetched = await jsonFetch(url, "HF", MAX_API_BYTES, fetchImpl);
    entries.push(...normalizeHfTree(fetched.value));
    support.push({ relativePath: `source-support/hf-tree-${label}-${String(page).padStart(3, "0")}.json`,
      source: url, fetched });
    url = parseNextLink(fetched.headers.get("link"));
  }
  const ordered = entries.sort((left, right) => left.path.localeCompare(right.path));
  if (support.length !== 2 || ordered.length !== EXPECTED.hfEntries
    || new Set(ordered.map((entry) => entry.path)).size !== ordered.length) {
    fail("HF_TREE_PROFILE_CHANGED");
  }
  return { entries: ordered, support };
}

function hfTreeSummary(entries) {
  const files = entries.filter((entry) => entry.type === "file");
  return { entries: entries.length, files: files.length,
    directories: entries.length - files.length,
    bytes: files.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    snapshotHash: botFailsDigest(entries, `${BOTFAILS_SOURCE_SCHEMA}/hf-tree`) };
}

function githubRepoProjection(value) {
  if (!exactObject(value) || value.full_name !== BOTFAILS_GITHUB_REPOSITORY
    || value.private !== false || value.default_branch !== "main"
    || value.html_url !== `https://github.com/${BOTFAILS_GITHUB_REPOSITORY}`
    || value.license !== null) fail("GITHUB_REPOSITORY_INVALID");
  return { repository: BOTFAILS_GITHUB_REPOSITORY, private: false, defaultBranch: "main",
    htmlUrl: value.html_url, declaredLicense: null };
}

function githubHeadProjection(value) {
  if (!exactObject(value) || value.sha !== BOTFAILS_GITHUB_REVISION
    || value.commit?.committer?.date !== "2026-07-30T11:15:00Z"
    || value.commit?.message
      !== "Update video links in index.html to use GitHub Releases & minor readme fix") {
    fail("GITHUB_HEAD_INVALID");
  }
  return { revision: value.sha, committedAt: value.commit.committer.date,
    message: value.commit.message };
}

function githubTreeProjection(value) {
  if (!exactObject(value) || value.sha !== BOTFAILS_GITHUB_REVISION
    || value.truncated !== false || !Array.isArray(value.tree)) fail("GITHUB_TREE_INVALID");
  const entries = value.tree.map((entry) => {
    if (!exactObject(entry) || !["blob", "tree"].includes(entry.type)
      || !SHA1.test(entry.sha ?? "") || typeof entry.path !== "string") {
      fail("GITHUB_TREE_ENTRY_INVALID");
    }
    safeRelative(entry.path);
    if (entry.type === "blob" && (!Number.isSafeInteger(entry.size) || entry.size < 1)) {
      fail("GITHUB_TREE_BLOB_INVALID", entry.path);
    }
    return { path: entry.path, type: entry.type, gitOid: entry.sha,
      sizeBytes: entry.type === "blob" ? entry.size : 0 };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (entries.length !== EXPECTED.githubEntries
    || new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("GITHUB_TREE_PROFILE_CHANGED");
  }
  return entries;
}

function githubTreeSummary(entries) {
  const blobs = entries.filter((entry) => entry.type === "blob");
  const labelBlobs = blobs.filter((entry) => /^Labels\/.+\.csv$/u.test(entry.path));
  const licensePaths = entries.filter((entry) => /(?:^|\/)licen[sc]e/iu.test(entry.path));
  const summary = { entries: entries.length, blobs: blobs.length,
    trees: entries.length - blobs.length,
    bytes: blobs.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    labelCsvBlobs: labelBlobs.length, licensePaths: licensePaths.map((entry) => entry.path),
    snapshotHash: botFailsDigest(entries, `${BOTFAILS_SOURCE_SCHEMA}/github-tree`) };
  if (summary.entries !== EXPECTED.githubEntries || summary.blobs !== EXPECTED.githubBlobs
    || summary.bytes !== EXPECTED.githubBlobBytes
    || summary.labelCsvBlobs !== EXPECTED.githubLabelBlobs
    || summary.licensePaths.length !== 0) fail("GITHUB_TREE_SUMMARY_INVALID");
  return summary;
}

function projectProjection(bytes) {
  const text = bytes.toString("utf8");
  if (!text.includes("https://huggingface.co/datasets/kantine/BotFails")
    || !text.includes("https://github.com/CEA-LIST/FIDeL")
    || !text.includes("Failure Identification in Imitation Learning")) {
    fail("PROJECT_PAGE_LINKAGE_INVALID");
  }
  return { projectUrl: PROJECT_URL,
    datasetUrl: "https://huggingface.co/datasets/kantine/BotFails",
    codeUrl: "https://github.com/CEA-LIST/FIDeL" };
}

async function fetchSnapshot(fetchImpl, label) {
  const record = await jsonFetch(HF_RECORD_URL, "HF", MAX_API_BYTES, fetchImpl);
  const commits = await jsonFetch(HF_COMMITS_URL, "HF", MAX_API_BYTES, fetchImpl);
  const hfTree = await fetchHfTree(fetchImpl, label);
  const ghRepo = await jsonFetch(GH_API, "GH", MAX_API_BYTES, fetchImpl);
  const ghHead = await jsonFetch(GH_HEAD_URL, "GH", MAX_API_BYTES, fetchImpl);
  const ghTree = await jsonFetch(GH_TREE_URL, "GH", MAX_API_BYTES, fetchImpl);
  const project = await boundedFetch(PROJECT_URL, "PROJECT", MAX_API_BYTES, fetchImpl);
  const support = [
    { relativePath: `source-support/hf-record-${label}.json`, source: HF_RECORD_URL,
      fetched: record },
    { relativePath: `source-support/hf-commits-${label}.json`, source: HF_COMMITS_URL,
      fetched: commits },
    ...hfTree.support,
    { relativePath: `source-support/github-repository-${label}.json`, source: GH_API,
      fetched: ghRepo },
    { relativePath: `source-support/github-head-${label}.json`, source: GH_HEAD_URL,
      fetched: ghHead },
    { relativePath: `source-support/github-tree-${label}.json`, source: GH_TREE_URL,
      fetched: ghTree },
    { relativePath: `source-support/project-page-${label}.html`, source: PROJECT_URL,
      fetched: project },
  ];
  return { record: recordProjection(record.value), commits: commitsProjection(commits.value),
    hfTree: hfTree.entries, hfTreeSummary: hfTreeSummary(hfTree.entries),
    ghRepo: githubRepoProjection(ghRepo.value), ghHead: githubHeadProjection(ghHead.value),
    ghTree: githubTreeProjection(ghTree.value),
    ghTreeSummary: githubTreeSummary(githubTreeProjection(ghTree.value)),
    project: projectProjection(project.bytes), support };
}

function taskProfileFromTree(files) {
  return TASK_PROFILES.map(([task, labels, test, normalTrain]) => {
    const labelPrefix = `BotFails/labels/${task}_anomaly/`;
    const testPrefix = `BotFails/test/${task}_anomaly/data/chunk-000/`;
    const normalPrefix = `BotFails/normal_train/${task}_expert/data/chunk-000/`;
    const profile = { task, publisherLabelFiles: files.filter((entry) =>
      entry.path.startsWith(labelPrefix) && entry.path.endsWith(".csv")).length,
    testEpisodes: files.filter((entry) => entry.path.startsWith(testPrefix)
      && entry.path.endsWith(".parquet")).length,
    normalTrainEpisodes: files.filter((entry) => entry.path.startsWith(normalPrefix)
      && entry.path.endsWith(".parquet")).length };
    if (!same(profile, { task, publisherLabelFiles: labels, testEpisodes: test,
      normalTrainEpisodes: normalTrain })) fail("TASK_PROFILE_CHANGED", task);
    return profile;
  });
}

function remoteBinding(entry) {
  return { remotePath: entry.path, sizeBytes: entry.sizeBytes, gitOid: entry.gitOid,
    lfsSha256: entry.lfs?.sha256 ?? null,
    lfsPointerSize: entry.lfs?.pointerSize ?? null, xetHash: entry.xetHash };
}

function inventoryFromTrees(hfEntries, ghEntries) {
  const files = hfEntries.filter((entry) => entry.type === "file");
  const parquets = files.filter((entry) => entry.path.endsWith(".parquet"));
  const videos = files.filter((entry) => entry.path.endsWith(".mp4"));
  const labels = files.filter((entry) => /^BotFails\/labels\/.+\.csv$/u.test(entry.path));
  const metadata = files.filter((entry) => /^BotFails\/(?:normal_train|test)\/.+\/meta\/(?:episodes\.jsonl|info\.json|stats\.json|tasks\.jsonl)$/u.test(entry.path));
  const screws = files.filter((entry) => /^BotFails\/(?:normal_train\/industrial_screws_sorting_expert|test\/industrial_screws_sorting_anomaly)\/data\/chunk-000\/episode_[0-9]{6}\.parquet$/u.test(entry.path));
  const card = files.filter((entry) => [".gitattributes", "README.md"].includes(entry.path));
  const selected = [...labels, ...metadata, ...screws, ...card]
    .sort((left, right) => left.path.localeCompare(right.path));
  const counts = { entries: hfEntries.length, files: files.length,
    directories: hfEntries.length - files.length,
    repositoryBytes: files.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    parquetFiles: parquets.length, parquetBytes: parquets.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    videoFiles: videos.length, videoBytes: videos.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    publisherLabelFiles: labels.length, publisherLabelBytes: labels.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    metadataFiles: metadata.length, metadataBytes: metadata.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    selectedTaskParquetFiles: screws.length,
    selectedTaskParquetBytes: screws.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    selectedHfFiles: selected.length,
    selectedHfBytes: selected.reduce((sum, entry) => sum + entry.sizeBytes, 0) };
  const expectedCounts = { entries: EXPECTED.hfEntries, files: EXPECTED.hfFiles,
    directories: EXPECTED.hfDirectories, repositoryBytes: EXPECTED.hfTreeBytes,
    parquetFiles: EXPECTED.parquetFiles, parquetBytes: EXPECTED.parquetBytes,
    videoFiles: EXPECTED.videoFiles, videoBytes: EXPECTED.videoBytes,
    publisherLabelFiles: EXPECTED.labelFiles, publisherLabelBytes: EXPECTED.labelBytes,
    metadataFiles: EXPECTED.metadataFiles, metadataBytes: EXPECTED.metadataBytes,
    selectedTaskParquetFiles: EXPECTED.selectedTaskParquets,
    selectedTaskParquetBytes: EXPECTED.selectedTaskParquetBytes,
    selectedHfFiles: EXPECTED.selectedHfFiles, selectedHfBytes: EXPECTED.selectedHfBytes };
  if (!same(counts, expectedCounts) || card.length !== 2) fail("INVENTORY_COUNTS_CHANGED");
  const testKeys = parquets.filter((entry) => /^BotFails\/test\/.+\/data\/chunk-000\//u.test(entry.path))
    .map((entry) => entry.path.replace(/^BotFails\/test\/(.+)_anomaly\/data\/chunk-000\/(episode_[0-9]{6})\.parquet$/u, "$1/$2"));
  const labelKeys = labels.map((entry) => entry.path.replace(
    /^BotFails\/labels\/(.+)_anomaly\/(episode_[0-9]{6})_labels\.csv$/u, "$1/$2"));
  const missing = sorted(testKeys.filter((key) => !new Set(labelKeys).has(key)));
  if (!same(missing, [MISSING_LABEL_KEY])) fail("MISSING_LABEL_PROFILE_CHANGED");
  const ghBlobs = new Map(ghEntries.filter((entry) => entry.type === "blob")
    .map((entry) => [entry.path, entry]));
  const crossRepositoryLabelBindings = labels.map((entry) => {
    const githubPath = entry.path.replace(/^BotFails\/labels\//u, "Labels/");
    const github = ghBlobs.get(githubPath);
    if (!github || github.sizeBytes !== entry.sizeBytes || github.gitOid !== entry.gitOid) {
      fail("CROSS_REPOSITORY_LABEL_MISMATCH", entry.path);
    }
    return { hfPath: entry.path, githubPath, sizeBytes: entry.sizeBytes,
      sharedGitBlobOid: entry.gitOid };
  });
  if (crossRepositoryLabelBindings.length !== EXPECTED.crossRepositoryLabelMatches) {
    fail("CROSS_REPOSITORY_LABEL_COUNT_INVALID");
  }
  const inventory = { schema: BOTFAILS_INVENTORY_SCHEMA, datasetId: BOTFAILS_DATASET_ID,
    pinnedRevision: BOTFAILS_REVISION, githubRepository: BOTFAILS_GITHUB_REPOSITORY,
    githubRevision: BOTFAILS_GITHUB_REVISION, counts,
    taskProfiles: taskProfileFromTree(files), missingPublisherLabelEpisodeKeys: missing,
    selectedHfObjects: selected.map(remoteBinding),
    excludedVideoObjects: videos.map(remoteBinding),
    excludedUnselectedParquetObjects: parquets.filter((entry) => !screws.includes(entry))
      .map(remoteBinding),
    crossRepositoryLabelBindings,
    crossPopulationTotal: null, additionProhibited: true };
  inventory.inventoryHash = botFailsDigest(inventory,
    `${BOTFAILS_INVENTORY_SCHEMA}/inventory`);
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

function verifyObject(entry, bytes) {
  if (bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_INVALID", entry.path);
  const fileSha256 = botFailsSha256(bytes);
  if (entry.lfs !== null) {
    if (fileSha256 !== entry.lfs.sha256) fail("OBJECT_LFS_HASH_INVALID", entry.path);
  } else if (gitBlobOid(bytes) !== entry.gitOid) fail("OBJECT_GIT_OID_INVALID", entry.path);
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

function supportDescriptor(item) {
  return { path: item.relativePath, source: item.source, httpStatus: item.fetched.status,
    sizeBytes: item.fetched.bytes.length, sha256: botFailsSha256(item.fetched.bytes) };
}

function manifestCore(manifest) {
  const copy = structuredClone(manifest);
  delete copy.manifestHash;
  return copy;
}

export async function acquirePinnedBotFailsSource(targetDirectory,
  { fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  const target = path.resolve(targetDirectory);
  if (existsSync(target)) fail("SOURCE_TARGET_EXISTS", target);
  mkdirPrivate(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirPrivate(staging);
  const before = await fetchSnapshot(fetchImpl, "before");
  const { inventory, selected } = inventoryFromTrees(before.hfTree, before.ghTree);
  const downloaded = await mapConcurrent(selected, DOWNLOAD_CONCURRENCY, async (entry) => {
    const bytes = await objectFetch(entry.path, entry.sizeBytes, fetchImpl);
    const fileSha256 = verifyObject(entry, bytes);
    writePrivate(path.join(staging, entry.path), bytes);
    return { ...remoteBinding(entry), localPath: entry.path, fileSha256 };
  });
  const after = await fetchSnapshot(fetchImpl, "after");
  if (!same(before.record, after.record) || !same(before.commits, after.commits)
    || !same(before.hfTree, after.hfTree) || !same(before.ghRepo, after.ghRepo)
    || !same(before.ghHead, after.ghHead) || !same(before.ghTree, after.ghTree)
    || !same(before.project, after.project)) fail("SOURCE_BRACKET_CHANGED");
  const supportRecords = [...before.support, ...after.support];
  for (const item of supportRecords) writePrivate(path.join(staging, item.relativePath),
    item.fetched.bytes);
  const inventoryBytes = canonicalBytes(inventory);
  writePrivate(path.join(staging, "source-inventory.json"), inventoryBytes);
  const sourceSupportObjects = supportRecords.map(supportDescriptor);
  const selectedObjects = downloaded.sort((left, right) =>
    left.remotePath.localeCompare(right.remotePath));
  const sourceRoot = botFailsDigest({ sourceSupportObjects, selectedObjects,
    inventoryFileSha256: botFailsSha256(inventoryBytes), inventoryHash: inventory.inventoryHash },
  `${BOTFAILS_SOURCE_SCHEMA}/source-root`);
  const manifest = { schema: BOTFAILS_SOURCE_SCHEMA, frozenAt: BOTFAILS_FROZEN_AT,
    datasetId: BOTFAILS_DATASET_ID, pinnedRevision: BOTFAILS_REVISION,
    repositoryBefore: before.record, repositoryAfter: after.record,
    commitHistoryBefore: before.commits, commitHistoryAfter: after.commits,
    hfTreeBefore: before.hfTreeSummary, hfTreeAfter: after.hfTreeSummary,
    githubRepositoryBefore: before.ghRepo, githubRepositoryAfter: after.ghRepo,
    githubHeadBefore: before.ghHead, githubHeadAfter: after.ghHead,
    githubTreeBefore: before.ghTreeSummary, githubTreeAfter: after.ghTreeSummary,
    projectPageBefore: before.project, projectPageAfter: after.project,
    selection: { rule: "all HF annotation CSV and all 20 split metadata sets, plus complete industrial_screws_sorting no-video state/action groups in test and normal_train",
      completeRepositoryTreeEnumerated: true, completePublisherLabelFileUniverseDownloaded: true,
      completeSplitMetadataDownloaded: true, selectedTaskGroupComplete: true,
      selectedTask: "industrial_screws_sorting", fullVideoContentDownloaded: false,
      selectedHfFiles: EXPECTED.selectedHfFiles, selectedHfBytes: EXPECTED.selectedHfBytes,
      excludedVideoFiles: EXPECTED.videoFiles, excludedVideoBytes: EXPECTED.videoBytes },
    rights: { publisherLicenseClaim: "Apache-2.0", hfLicenseFilePresent: false,
      githubDeclaredLicense: null, githubLicenseFilePresent: false,
      useSpecificLegalClearanceEstablished: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: { videosExcluded: true, noPiiGuaranteed: false,
      videoPrivacyReviewPerformed: false },
    inventory: { path: "source-inventory.json", sizeBytes: inventoryBytes.length,
      fileSha256: botFailsSha256(inventoryBytes), inventoryHash: inventory.inventoryHash },
    sourceSupportObjects, selectedObjects, sourceRoot };
  manifest.manifestHash = botFailsDigest(manifestCore(manifest),
    `${BOTFAILS_SOURCE_SCHEMA}/manifest`);
  writePrivate(path.join(staging, "source-manifest.json"), canonicalBytes(manifest));
  renameSync(staging, target);
  chmodSync(target, 0o700);
  const checked = verifyBotFailsSourceDirectory(target);
  if (!checked.ok) fail("SOURCE_PUBLICATION_INVALID", checked.error);
  return checked;
}

function listFiles(root) {
  const result = [];
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
        result.push(relative);
      }
    }
  };
  visit(root);
  return sorted(result);
}

function readPrivate(file, expectedBytes = null) {
  const descriptor = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600
      || expectedBytes !== null && stat.size !== expectedBytes) fail("FILE_INVALID", file);
    return readFileSync(descriptor);
  } finally { closeSync(descriptor); }
}

function supportByPath(manifest) {
  if (!Array.isArray(manifest.sourceSupportObjects)
    || manifest.sourceSupportObjects.length !== 16) fail("SUPPORT_COUNT_INVALID");
  return new Map(manifest.sourceSupportObjects.map((item) => [item.path, item]));
}

function replaySupportSnapshot(bytes, label) {
  const record = recordProjection(parseJson(bytes.get(`source-support/hf-record-${label}.json`),
    "SAVED_HF_RECORD_INVALID"));
  const commits = commitsProjection(parseJson(bytes.get(`source-support/hf-commits-${label}.json`),
    "SAVED_HF_COMMITS_INVALID"));
  const hfEntries = [1, 2].flatMap((page) => normalizeHfTree(parseJson(bytes.get(
    `source-support/hf-tree-${label}-${String(page).padStart(3, "0")}.json`),
  "SAVED_HF_TREE_INVALID"))).sort((left, right) => left.path.localeCompare(right.path));
  const ghRepo = githubRepoProjection(parseJson(bytes.get(
    `source-support/github-repository-${label}.json`), "SAVED_GH_REPO_INVALID"));
  const ghHead = githubHeadProjection(parseJson(bytes.get(
    `source-support/github-head-${label}.json`), "SAVED_GH_HEAD_INVALID"));
  const ghEntries = githubTreeProjection(parseJson(bytes.get(
    `source-support/github-tree-${label}.json`), "SAVED_GH_TREE_INVALID"));
  const project = projectProjection(bytes.get(`source-support/project-page-${label}.html`));
  return { record, commits, hfEntries, hfSummary: hfTreeSummary(hfEntries),
    ghRepo, ghHead, ghEntries, ghSummary: githubTreeSummary(ghEntries), project };
}

export function verifyBotFailsSourceDirectory(sourceDirectory) {
  try {
    const root = path.resolve(sourceDirectory);
    const manifestBytes = readPrivate(path.join(root, "source-manifest.json"));
    const manifest = parseJson(manifestBytes, "MANIFEST_JSON_INVALID");
    if (!exactObject(manifest) || manifest.schema !== BOTFAILS_SOURCE_SCHEMA
      || manifest.frozenAt !== BOTFAILS_FROZEN_AT || manifest.datasetId !== BOTFAILS_DATASET_ID
      || manifest.pinnedRevision !== BOTFAILS_REVISION
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")
      || manifest.manifestHash !== botFailsDigest(manifestCore(manifest),
        `${BOTFAILS_SOURCE_SCHEMA}/manifest`)) fail("MANIFEST_INVALID");
    const support = supportByPath(manifest);
    const supportBytes = new Map();
    for (const [relative, item] of support) {
      safeRelative(relative);
      const bytes = readPrivate(path.join(root, relative), item.sizeBytes);
      if (botFailsSha256(bytes) !== item.sha256) fail("SUPPORT_HASH_INVALID", relative);
      supportBytes.set(relative, bytes);
    }
    const before = replaySupportSnapshot(supportBytes, "before");
    const after = replaySupportSnapshot(supportBytes, "after");
    if (!same(before, after) || !same(manifest.repositoryBefore, before.record)
      || !same(manifest.repositoryAfter, after.record)
      || !same(manifest.commitHistoryBefore, before.commits)
      || !same(manifest.commitHistoryAfter, after.commits)
      || !same(manifest.hfTreeBefore, before.hfSummary)
      || !same(manifest.hfTreeAfter, after.hfSummary)
      || !same(manifest.githubRepositoryBefore, before.ghRepo)
      || !same(manifest.githubRepositoryAfter, after.ghRepo)
      || !same(manifest.githubHeadBefore, before.ghHead)
      || !same(manifest.githubHeadAfter, after.ghHead)
      || !same(manifest.githubTreeBefore, before.ghSummary)
      || !same(manifest.githubTreeAfter, after.ghSummary)
      || !same(manifest.projectPageBefore, before.project)
      || !same(manifest.projectPageAfter, after.project)) fail("SAVED_BRACKET_INVALID");
    if (!same(before.record.siblingPaths,
      before.hfEntries.filter((entry) => entry.type === "file").map((entry) => entry.path))) {
      fail("HF_RECORD_TREE_MISMATCH");
    }
    const { inventory: rebuiltInventory, selected } = inventoryFromTrees(before.hfEntries,
      before.ghEntries);
    const inventoryBytes = readPrivate(path.join(root, "source-inventory.json"));
    const inventory = parseJson(inventoryBytes, "INVENTORY_JSON_INVALID");
    if (!same(inventory, rebuiltInventory)
      || inventoryBytes.length !== manifest.inventory.sizeBytes
      || botFailsSha256(inventoryBytes) !== manifest.inventory.fileSha256
      || inventory.inventoryHash !== manifest.inventory.inventoryHash) fail("INVENTORY_INVALID");
    if (!Array.isArray(manifest.selectedObjects)
      || manifest.selectedObjects.length !== selected.length) fail("SELECTED_OBJECTS_INVALID");
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
      const bytes = readPrivate(path.join(root, entry.path), entry.sizeBytes);
      if (verifyObject(entry, bytes) !== declared.fileSha256) {
        fail("SELECTED_FILE_HASH_INVALID", entry.path);
      }
    }
    const expectedFiles = sorted(["source-manifest.json", "source-inventory.json",
      ...manifest.sourceSupportObjects.map((item) => item.path),
      ...manifest.selectedObjects.map((item) => item.localPath)]);
    if (!same(listFiles(root), expectedFiles)) fail("SOURCE_FILE_SET_INVALID");
    const sourceRoot = botFailsDigest({ sourceSupportObjects: manifest.sourceSupportObjects,
      selectedObjects: manifest.selectedObjects,
      inventoryFileSha256: botFailsSha256(inventoryBytes),
      inventoryHash: inventory.inventoryHash }, `${BOTFAILS_SOURCE_SCHEMA}/source-root`);
    if (sourceRoot !== manifest.sourceRoot) fail("SOURCE_ROOT_INVALID");
    const readme = readPrivate(path.join(root, "README.md")).toString("utf8");
    if (!readme.includes("license: apache-2.0")
      || !readme.includes("human expert judgment")
      || !readme.includes("Non-failure anomalies")) fail("README_BOUNDARY_MISSING");
    return { ok: true, verificationLevel: "FULL_SELECTED_SOURCE_REPLAY",
      sourceDirectory: root, manifest, inventory, sourceRoot,
      manifestFileSha256: botFailsSha256(manifestBytes), hfEntries: before.hfEntries,
      githubEntries: before.ghEntries };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import glob
import json
import math
import os
import struct
import sys
import pyarrow as pa
import pyarrow.parquet as pq

root = sys.argv[1]
bot = os.path.join(root, "BotFails")

def load_json(path):
    with open(path, "rb") as handle:
        return json.loads(handle.read().decode("utf-8"))

def load_jsonl(path):
    with open(path, "rb") as handle:
        return [json.loads(line) for line in handle.read().decode("utf-8").splitlines()]

def f32(value):
    return struct.unpack("<f", struct.pack("<f", value))[0]

metadata_profiles = []
metadata_index = {}
metadata_totals = {"episodes": 0, "frames": 0, "videos": 0,
                   "testEpisodes": 0, "testFrames": 0,
                   "normalTrainEpisodes": 0, "normalTrainFrames": 0}

for split in ["normal_train", "test"]:
    info_files = sorted(glob.glob(os.path.join(bot, split, "*", "meta", "info.json")))
    if len(info_files) != 10:
        raise RuntimeError("BOTFAILS_PYARROW_METADATA_DIRECTORY_COUNT_INVALID")
    for info_path in info_files:
        dataset_root = os.path.dirname(os.path.dirname(info_path))
        dataset_name = os.path.basename(dataset_root)
        info = load_json(info_path)
        episodes = load_jsonl(os.path.join(dataset_root, "meta", "episodes.jsonl"))
        tasks = load_jsonl(os.path.join(dataset_root, "meta", "tasks.jsonl"))
        stats = load_json(os.path.join(dataset_root, "meta", "stats.json"))
        if (info.get("codebase_version") != "v2.0" or info.get("robot_type") != "so100"
                or info.get("fps") != 30 or info.get("total_episodes") != len(episodes)
                or info.get("total_tasks") != len(tasks) or len(tasks) != 1
                or info.get("total_videos") != 2 * len(episodes)
                or [item["episode_index"] for item in episodes] != list(range(len(episodes)))
                or [item["task_index"] for item in tasks] != [0]):
            raise RuntimeError("BOTFAILS_PYARROW_METADATA_PROFILE_INVALID")
        frames = sum(item["length"] for item in episodes)
        if frames != info.get("total_frames"):
            raise RuntimeError("BOTFAILS_PYARROW_METADATA_FRAME_COUNT_INVALID")
        task_text = tasks[0]["task"]
        if any(item["tasks"] != [task_text] for item in episodes):
            raise RuntimeError("BOTFAILS_PYARROW_EPISODE_TASK_INVALID")
        profile = {"split": split, "datasetName": dataset_name,
                   "episodes": len(episodes), "frames": frames,
                   "videos": info["total_videos"], "fps": info["fps"],
                   "robotType": info["robot_type"], "task": task_text,
                   "statsTopLevelKeys": sorted(stats.keys())}
        metadata_profiles.append(profile)
        metadata_index[(split, dataset_name)] = {"info": info, "episodes": episodes,
                                                  "tasks": tasks, "root": dataset_root}
        metadata_totals["episodes"] += len(episodes)
        metadata_totals["frames"] += frames
        metadata_totals["videos"] += info["total_videos"]
        if split == "test":
            metadata_totals["testEpisodes"] += len(episodes)
            metadata_totals["testFrames"] += frames
        else:
            metadata_totals["normalTrainEpisodes"] += len(episodes)
            metadata_totals["normalTrainFrames"] += frames

label_files = sorted(glob.glob(os.path.join(bot, "labels", "*", "*_labels.csv")))
if len(label_files) != 144:
    raise RuntimeError("BOTFAILS_PYARROW_LABEL_FILE_COUNT_INVALID")

label_episode_profiles = []
label_task_aggregate = {}
label_keys = set()
label_totals = {"files": 0, "rows": 0, "zeroRows": 0, "oneRows": 0,
                "episodesWithAnyOne": 0, "allZeroEpisodes": 0,
                "allOneEpisodes": 0, "positiveRuns": 0, "valueTransitions": 0,
                "metadataFrameRowsForLabeledEpisodes": 0,
                "lengthMismatchEpisodes": 0, "labelLengthDeltaRows": 0}
label_length_mismatches = []

for label_path in label_files:
    task_dir = os.path.basename(os.path.dirname(label_path))
    dataset_name = task_dir
    episode_name = os.path.basename(label_path).replace("_labels.csv", "")
    episode_index = int(episode_name.split("_")[-1])
    key = task_dir[:-len("_anomaly")] + "/" + episode_name
    metadata = metadata_index.get(("test", dataset_name))
    if metadata is None or episode_index >= len(metadata["episodes"]):
        raise RuntimeError("BOTFAILS_PYARROW_LABEL_JOIN_INVALID")
    with open(label_path, "rb") as handle:
        raw = handle.read().decode("utf-8")
    lines = raw.splitlines()
    if not lines or any(line not in ["0", "1"] for line in lines):
        raise RuntimeError("BOTFAILS_PYARROW_LABEL_VALUE_INVALID")
    values = [int(line) for line in lines]
    expected_rows = metadata["episodes"][episode_index]["length"]
    length_delta = len(values) - expected_rows
    zeros = values.count(0)
    ones = values.count(1)
    runs = sum(1 for index, value in enumerate(values)
               if value == 1 and (index == 0 or values[index - 1] == 0))
    transitions = sum(1 for index in range(1, len(values))
                      if values[index] != values[index - 1])
    profile = {"episodeKey": key, "taskDirectory": task_dir,
               "episodeIndex": episode_index, "rows": len(values),
               "metadataFrames": expected_rows,
               "labelLengthDeltaRows": length_delta,
               "lengthMatchesMetadata": length_delta == 0,
               "zeroRows": zeros, "oneRows": ones,
               "hasAnyOne": ones > 0, "allZero": ones == 0,
               "allOne": zeros == 0, "positiveRuns": runs,
               "valueTransitions": transitions}
    label_episode_profiles.append(profile)
    label_keys.add(key)
    aggregate = label_task_aggregate.setdefault(task_dir, {"taskDirectory": task_dir,
        "labelFiles": 0, "rows": 0, "zeroRows": 0, "oneRows": 0,
        "episodesWithAnyOne": 0, "allZeroEpisodes": 0,
        "positiveRuns": 0, "valueTransitions": 0,
        "metadataFrameRowsForLabeledEpisodes": 0,
        "lengthMismatchEpisodes": 0, "labelLengthDeltaRows": 0})
    aggregate["labelFiles"] += 1
    aggregate["rows"] += len(values)
    aggregate["zeroRows"] += zeros
    aggregate["oneRows"] += ones
    aggregate["episodesWithAnyOne"] += int(ones > 0)
    aggregate["allZeroEpisodes"] += int(ones == 0)
    aggregate["positiveRuns"] += runs
    aggregate["valueTransitions"] += transitions
    aggregate["metadataFrameRowsForLabeledEpisodes"] += expected_rows
    aggregate["lengthMismatchEpisodes"] += int(length_delta != 0)
    aggregate["labelLengthDeltaRows"] += length_delta
    label_totals["files"] += 1
    label_totals["rows"] += len(values)
    label_totals["zeroRows"] += zeros
    label_totals["oneRows"] += ones
    label_totals["episodesWithAnyOne"] += int(ones > 0)
    label_totals["allZeroEpisodes"] += int(ones == 0)
    label_totals["allOneEpisodes"] += int(zeros == 0)
    label_totals["positiveRuns"] += runs
    label_totals["valueTransitions"] += transitions
    label_totals["metadataFrameRowsForLabeledEpisodes"] += expected_rows
    label_totals["lengthMismatchEpisodes"] += int(length_delta != 0)
    label_totals["labelLengthDeltaRows"] += length_delta
    if length_delta != 0:
        label_length_mismatches.append({"episodeKey": key,
            "metadataFrames": expected_rows, "labelRows": len(values),
            "labelLengthDeltaRows": length_delta})

test_keys = set()
for (split, dataset_name), metadata in metadata_index.items():
    if split != "test":
        continue
    task_base = dataset_name[:-len("_anomaly")]
    for episode in metadata["episodes"]:
        test_keys.add(task_base + "/episode_" + str(episode["episode_index"]).zfill(6))
missing_label_keys = sorted(test_keys - label_keys)
extra_label_keys = sorted(label_keys - test_keys)
if missing_label_keys != ["domotic_setTheTable/episode_000007"] or extra_label_keys:
    raise RuntimeError("BOTFAILS_PYARROW_LABEL_COVERAGE_INVALID")
if label_length_mismatches != [{"episodeKey": "industrial_screws_sorting/episode_000007",
                                "metadataFrames": 1492, "labelRows": 1491,
                                "labelLengthDeltaRows": -1}]:
    raise RuntimeError("BOTFAILS_PYARROW_LABEL_LENGTH_PROFILE_INVALID")

selected_profiles = []
schema_profiles = {}
selected_totals = {"episodes": 0, "frames": 0, "testEpisodes": 0,
                   "testFrames": 0, "normalTrainEpisodes": 0,
                   "normalTrainFrames": 0, "nullValues": 0,
                   "nonfiniteValues": 0, "timestampExactRows": 0}
expected_columns = ["action", "observation.state", "timestamp", "frame_index",
                    "episode_index", "index", "task_index"]

for split, dataset_name in [("normal_train", "industrial_screws_sorting_expert"),
                            ("test", "industrial_screws_sorting_anomaly")]:
    metadata = metadata_index[(split, dataset_name)]
    parquet_files = sorted(glob.glob(os.path.join(metadata["root"], "data", "chunk-000",
                                                   "episode_*.parquet")))
    if len(parquet_files) != len(metadata["episodes"]):
        raise RuntimeError("BOTFAILS_PYARROW_SELECTED_PARQUET_COUNT_INVALID")
    running_index = 0
    for episode_index, parquet_path in enumerate(parquet_files):
        table = pq.read_table(parquet_path)
        if table.column_names != expected_columns:
            raise RuntimeError("BOTFAILS_PYARROW_SELECTED_COLUMNS_INVALID")
        schema_text = str(table.schema.remove_metadata())
        schema_profiles[schema_text] = schema_profiles.get(schema_text, 0) + 1
        rows = table.to_pylist()
        if table.num_rows != metadata["episodes"][episode_index]["length"]:
            raise RuntimeError("BOTFAILS_PYARROW_SELECTED_LENGTH_INVALID")
        nulls = sum(table[name].null_count for name in expected_columns)
        selected_totals["nullValues"] += nulls
        nonfinite = 0
        timestamp_exact = 0
        for frame_index, row in enumerate(rows):
            if (row["episode_index"] != episode_index or row["task_index"] != 0
                    or row["frame_index"] != frame_index or row["index"] != running_index + frame_index):
                raise RuntimeError("BOTFAILS_PYARROW_SELECTED_PROVENANCE_INVALID")
            if row["timestamp"] != f32(frame_index / 30.0):
                raise RuntimeError("BOTFAILS_PYARROW_SELECTED_TIMESTAMP_INVALID")
            timestamp_exact += 1
            if len(row["action"]) != 6 or len(row["observation.state"]) != 6:
                raise RuntimeError("BOTFAILS_PYARROW_SELECTED_VECTOR_WIDTH_INVALID")
            for value in row["action"] + row["observation.state"]:
                if not math.isfinite(value):
                    nonfinite += 1
        selected_totals["nonfiniteValues"] += nonfinite
        selected_totals["timestampExactRows"] += timestamp_exact
        selected_profiles.append({"split": split, "datasetName": dataset_name,
                                  "episodeIndex": episode_index,
                                  "frames": table.num_rows, "nullValues": nulls,
                                  "nonfiniteValues": nonfinite,
                                  "timestampExactRows": timestamp_exact})
        running_index += table.num_rows
        selected_totals["episodes"] += 1
        selected_totals["frames"] += table.num_rows
        if split == "test":
            selected_totals["testEpisodes"] += 1
            selected_totals["testFrames"] += table.num_rows
        else:
            selected_totals["normalTrainEpisodes"] += 1
            selected_totals["normalTrainFrames"] += table.num_rows

result = {
    "parser": {"engine": "python-pyarrow", "pythonVersion": sys.version.split()[0],
               "pyarrowVersion": pa.__version__},
    "metadataProfiles": metadata_profiles,
    "metadataTotals": metadata_totals,
    "labelEpisodeProfiles": label_episode_profiles,
    "labelTaskProfiles": [label_task_aggregate[key] for key in sorted(label_task_aggregate)],
    "labelTotals": label_totals,
    "missingLabelEpisodeKeys": missing_label_keys,
    "labelLengthMismatches": label_length_mismatches,
    "selectedTask": "industrial_screws_sorting",
    "selectedParquetProfiles": selected_profiles,
    "selectedParquetSchemaProfiles": [{"schema": key, "files": value}
                                      for key, value in sorted(schema_profiles.items())],
    "selectedParquetTotals": selected_totals,
}
print(json.dumps(result, sort_keys=True, separators=(",", ":"), allow_nan=False))
`;

function runReplay(sourceDirectory) {
  const python = process.env.OUTSIDER_PYTHON ?? path.resolve(".venv/bin/python");
  const result = spawnSync(python, ["-c", PYARROW_REPLAY, sourceDirectory], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 180_000,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONNOUSERSITE: "1" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("PYARROW_REPLAY_FAILED", String(result.stderr || result.error?.message));
  }
  const replay = parseJson(Buffer.from(result.stdout, "utf8"), "PYARROW_OUTPUT_INVALID");
  if (!exactObject(replay) || replay.metadataProfiles?.length !== 20
    || replay.metadataTotals?.episodes !== EXPECTED.parquetFiles
    || replay.metadataTotals?.frames !== EXPECTED.metadataFrames
    || replay.metadataTotals?.videos !== EXPECTED.videoFiles
    || replay.metadataTotals?.testEpisodes !== EXPECTED.testEpisodes
    || replay.metadataTotals?.testFrames !== EXPECTED.testFrames
    || replay.metadataTotals?.normalTrainEpisodes !== EXPECTED.normalTrainEpisodes
    || replay.metadataTotals?.normalTrainFrames !== EXPECTED.normalTrainFrames
    || replay.labelTotals?.files !== EXPECTED.labelFiles
    || replay.labelTotals?.rows !== EXPECTED.labelRows
    || replay.labelTotals?.metadataFrameRowsForLabeledEpisodes
      !== EXPECTED.labelMetadataFrames
    || replay.labelTotals?.zeroRows !== EXPECTED.labelZeroRows
    || replay.labelTotals?.oneRows !== EXPECTED.labelOneRows
    || replay.labelTotals?.episodesWithAnyOne !== EXPECTED.labelEpisodesWithAnyOne
    || replay.labelTotals?.allZeroEpisodes !== EXPECTED.labelAllZeroEpisodes
    || replay.labelTotals?.allOneEpisodes !== EXPECTED.labelAllOneEpisodes
    || replay.labelTotals?.positiveRuns !== EXPECTED.labelPositiveRuns
    || replay.labelTotals?.valueTransitions !== EXPECTED.labelValueTransitions
    || replay.labelTotals?.lengthMismatchEpisodes !== 1
    || replay.labelTotals?.labelLengthDeltaRows !== -1
    || !same(replay.missingLabelEpisodeKeys, [MISSING_LABEL_KEY])
    || !same(replay.labelLengthMismatches, [LABEL_LENGTH_MISMATCH])
    || replay.selectedParquetTotals?.episodes !== EXPECTED.selectedTaskParquets
    || replay.selectedParquetTotals?.frames !== EXPECTED.selectedTaskFrames
    || replay.selectedParquetTotals?.testEpisodes !== EXPECTED.selectedTaskTestEpisodes
    || replay.selectedParquetTotals?.testFrames !== EXPECTED.selectedTaskTestFrames
    || replay.selectedParquetTotals?.normalTrainEpisodes !== EXPECTED.selectedTaskNormalEpisodes
    || replay.selectedParquetTotals?.normalTrainFrames !== EXPECTED.selectedTaskNormalFrames
    || replay.selectedParquetTotals?.nullValues !== 0
    || replay.selectedParquetTotals?.nonfiniteValues !== 0
    || replay.selectedParquetTotals?.timestampExactRows
      !== replay.selectedParquetTotals?.frames) fail("PYARROW_PROFILE_INVALID");
  return replay;
}

function reportCore(report) {
  const copy = structuredClone(report);
  delete copy.artifactHash;
  return copy;
}

export function buildBotFailsReportFromSource(sourceDirectory) {
  const checked = verifyBotFailsSourceDirectory(sourceDirectory);
  if (!checked.ok) fail("SOURCE_INVALID", checked.error);
  const replay = runReplay(checked.sourceDirectory);
  const report = { schema: BOTFAILS_REPORT_SCHEMA, generatedAt: BOTFAILS_FROZEN_AT,
    source: { datasetId: BOTFAILS_DATASET_ID, pinnedRevision: BOTFAILS_REVISION,
      githubRepository: BOTFAILS_GITHUB_REPOSITORY,
      githubRevision: BOTFAILS_GITHUB_REVISION,
      sourceRoot: checked.sourceRoot, sourceManifestHash: checked.manifest.manifestHash,
      sourceManifestFileSha256: checked.manifestFileSha256,
      completeRepositoryTreeReplayed: true,
      completePublisherLabelFileUniverseReplayed: true,
      completeSplitMetadataReplayed: true, fullVideoContentReplayed: false },
    denominators: {
      completeRepositoryTree: { units: EXPECTED.hfEntries, unit: "HF_TREE_ENTRY",
        files: EXPECTED.hfFiles, directories: EXPECTED.hfDirectories,
        bytes: EXPECTED.hfTreeBytes },
      publisherBinaryLabelFiles: { units: EXPECTED.labelFiles,
        unit: "PUBLISHER_BINARY_LABEL_FILE", bytes: EXPECTED.labelBytes,
        frameLabelRows: replay.labelTotals.rows },
      publisherTestMembershipEpisodes: { units: EXPECTED.testEpisodes,
        unit: "PUBLISHER_TEST_DIRECTORY_EPISODE", frameRows: replay.metadataTotals.testFrames,
        withLabelFile: EXPECTED.labelFiles, missingLabelFile: 1 },
      publisherNormalTrainMembershipEpisodes: { units: EXPECTED.normalTrainEpisodes,
        unit: "PUBLISHER_NORMAL_TRAIN_DIRECTORY_EPISODE",
        frameRows: replay.metadataTotals.normalTrainFrames,
        independentlyAdjudicatedSuccessUnits: 0 },
      selectedSameTaskTelemetryEpisodes: { units: EXPECTED.selectedTaskParquets,
        unit: "SELECTED_SAME_TASK_STATE_ACTION_EPISODE",
        task: "industrial_screws_sorting",
        testMembershipEpisodes: EXPECTED.selectedTaskTestEpisodes,
        normalTrainMembershipEpisodes: EXPECTED.selectedTaskNormalEpisodes,
        frameRows: replay.selectedParquetTotals.frames },
      excludedVideos: { units: EXPECTED.videoFiles, unit: "MP4_OBJECT",
        bytes: EXPECTED.videoBytes, contentReplayed: false },
      completeAttemptCensus: { units: 0, established: false },
      crossPopulationTotal: null, additionProhibited: true },
    observations: {
      publisherDescription: "real-world LeRobot teleoperation on one SO-100 platform in controlled laboratories",
      metadataReplay: { parser: replay.parser, profiles: replay.metadataProfiles,
        totals: replay.metadataTotals },
      binaryLabelReplay: { semantics: "publisher ground-truth anomaly detection target; values preserved as 0/1",
        totals: replay.labelTotals, taskProfiles: replay.labelTaskProfiles,
        episodeProfiles: replay.labelEpisodeProfiles,
        missingLabelEpisodeKeys: replay.missingLabelEpisodeKeys,
        labelLengthMismatches: replay.labelLengthMismatches,
        valuesObserved: [0, 1] },
      selectedSameTaskParquetReplay: { task: replay.selectedTask,
        schemaProfiles: replay.selectedParquetSchemaProfiles,
        totals: replay.selectedParquetTotals,
        episodeProfiles: replay.selectedParquetProfiles,
        actionWidth: 6, observationStateWidth: 6 },
      githubLineage: { projectPageLinksDatasetAndCode: true,
        githubLabelCsvBlobs: EXPECTED.githubLabelBlobs,
        hfLabelFilesWithExactGithubPathSizeGitOidMatch:
          EXPECTED.crossRepositoryLabelMatches,
        extraGithubLabelFilesNotInHfDataset: EXPECTED.githubLabelBlobs - EXPECTED.labelFiles,
        extraGithubLabelsCountedInHfDenominator: false },
    },
    coverage: { testEpisodes: EXPECTED.testEpisodes, labelFiles: EXPECTED.labelFiles,
      testEpisodesWithLabelFile: EXPECTED.labelFiles,
      testEpisodesMissingLabelFile: 1, completeTestEpisodeLabelCoverage: false,
      missingLabelEpisodeKeys: [MISSING_LABEL_KEY],
      labelFilesWithMetadataLengthMismatch: replay.labelLengthMismatches.length,
      labelLengthMismatches: replay.labelLengthMismatches,
      completePublishedLabelFileUniverseReplayed: true },
    segments: { opportunityCensus: { units: 0, prospective: false },
      delegationAuthorization: { units: 0, established: false },
      action: { episodeUnits: EXPECTED.selectedTaskParquets,
        frameUnits: replay.selectedParquetTotals.frames,
        stateActionTelemetryPresent: true },
      effect: { publisherBinaryAnomalyFrameRows: replay.labelTotals.rows,
        independentPhysicalEffectUnits: 0 },
      outcome: { publisherAnomalyLabelEpisodeUnits:
        replay.labelTotals.episodesWithAnyOne, independentUnits: 0,
        verifiedTaskSuccessUnits: 0 },
      recovery: { units: 0, verifiedRecoveryEffectUnits: 0 },
      longitudinal: { units: 0 }, attributionAdditionProhibited: true },
    truthBoundary: { publisherBinaryAnomalyLabelsEstablished: true,
      publisherSplitMembershipEstablished: true,
      labelOneMeansIndependentTaskFailure: false,
      normalTrainMeansIndependentlyVerifiedSuccess: false,
      independentPhysicalOutcomeEstablished: false,
      recoveryChainEstablished: false,
      completeAttemptCensusEstablished: false,
      prospectiveOpportunityCensusEstablished: false,
      delegationOrAuthorityEstablished: false,
      completeTestEpisodeLabelCoverageEstablished: false },
    rights: { publisherLicenseClaim: "Apache-2.0", hfLicenseFilePresent: false,
      githubDeclaredLicense: null, githubLicenseFilePresent: false,
      useSpecificLegalClearanceEstablished: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: { noPiiGuaranteed: false, videosExcluded: true,
      videoPrivacyReviewPerformed: false },
    useBoundary: { status: "QUARANTINE_EVAL_ONLY",
      offlineEvaluationLabelRows: replay.labelTotals.rows,
      offlineModelFittingRows: 0, authorizedTrainingRows: 0,
      governedTrainingRows: 0, trainingPerformed: false },
    network: { rawNetworkAdmissionRows: 0, networkAdmissionRows: 0 },
    economics: { CEU: 0, pricingUnits: 0 },
    authority: { executionAuthorityUnits: 0, executionAuthorityEstablished: false },
    rankedGaps: [
      "one published test episode lacks a label file",
      "one published label file is one row shorter than its episode metadata",
      "video/object-state replay and independent outcome adjudication",
      "failure-vs-benign-anomaly semantics for every binary positive interval",
      "prospective opportunity and complete attempt census",
      "recovery suffixes and longitudinal follow-up",
      "use-specific rights/privacy clearance and delegation authority",
    ],
    verification: { level: "FULL_SELECTED_SOURCE_REDERIVED",
      pyarrowHelperSha256: botFailsSha256(Buffer.from(PYARROW_REPLAY, "utf8")) } };
  report.artifactHash = botFailsDigest(reportCore(report),
    `${BOTFAILS_REPORT_SCHEMA}/artifact`);
  const verified = verifyBotFailsReport(report);
  if (!verified.ok) fail("BUILT_REPORT_INVALID", verified.error);
  return report;
}

export function verifyBotFailsReport(report) {
  try {
    if (!exactObject(report) || report.schema !== BOTFAILS_REPORT_SCHEMA
      || report.generatedAt !== BOTFAILS_FROZEN_AT || !HASH.test(report.artifactHash ?? "")
      || report.artifactHash !== botFailsDigest(reportCore(report),
        `${BOTFAILS_REPORT_SCHEMA}/artifact`)) fail("REPORT_HASH_INVALID");
    if (report.source?.datasetId !== BOTFAILS_DATASET_ID
      || report.source?.pinnedRevision !== BOTFAILS_REVISION
      || report.source?.githubRepository !== BOTFAILS_GITHUB_REPOSITORY
      || report.source?.githubRevision !== BOTFAILS_GITHUB_REVISION
      || !HASH.test(report.source?.sourceRoot ?? "")
      || !HASH.test(report.source?.sourceManifestHash ?? "")
      || !HASH.test(report.source?.sourceManifestFileSha256 ?? "")
      || report.source?.completeRepositoryTreeReplayed !== true
      || report.source?.completePublisherLabelFileUniverseReplayed !== true
      || report.source?.completeSplitMetadataReplayed !== true
      || report.source?.fullVideoContentReplayed !== false) fail("REPORT_SOURCE_INVALID");
    const d = report.denominators;
    if (d?.completeRepositoryTree?.units !== EXPECTED.hfEntries
      || d?.completeRepositoryTree?.unit !== "HF_TREE_ENTRY"
      || d?.completeRepositoryTree?.files !== EXPECTED.hfFiles
      || d?.completeRepositoryTree?.directories !== EXPECTED.hfDirectories
      || d?.completeRepositoryTree?.bytes !== EXPECTED.hfTreeBytes
      || d?.publisherBinaryLabelFiles?.units !== EXPECTED.labelFiles
      || d?.publisherBinaryLabelFiles?.unit !== "PUBLISHER_BINARY_LABEL_FILE"
      || d?.publisherBinaryLabelFiles?.bytes !== EXPECTED.labelBytes
      || d?.publisherBinaryLabelFiles?.frameLabelRows !== EXPECTED.labelRows
      || d?.publisherTestMembershipEpisodes?.units !== EXPECTED.testEpisodes
      || d?.publisherTestMembershipEpisodes?.unit !== "PUBLISHER_TEST_DIRECTORY_EPISODE"
      || d?.publisherTestMembershipEpisodes?.frameRows !== EXPECTED.testFrames
      || d?.publisherTestMembershipEpisodes?.withLabelFile !== EXPECTED.labelFiles
      || d?.publisherTestMembershipEpisodes?.missingLabelFile !== 1
      || d?.publisherNormalTrainMembershipEpisodes?.units !== EXPECTED.normalTrainEpisodes
      || d?.publisherNormalTrainMembershipEpisodes?.unit
        !== "PUBLISHER_NORMAL_TRAIN_DIRECTORY_EPISODE"
      || d?.publisherNormalTrainMembershipEpisodes?.frameRows !== EXPECTED.normalTrainFrames
      || d?.publisherNormalTrainMembershipEpisodes?.independentlyAdjudicatedSuccessUnits !== 0
      || d?.selectedSameTaskTelemetryEpisodes?.units !== EXPECTED.selectedTaskParquets
      || d?.selectedSameTaskTelemetryEpisodes?.unit
        !== "SELECTED_SAME_TASK_STATE_ACTION_EPISODE"
      || d?.selectedSameTaskTelemetryEpisodes?.task !== "industrial_screws_sorting"
      || d?.selectedSameTaskTelemetryEpisodes?.testMembershipEpisodes
        !== EXPECTED.selectedTaskTestEpisodes
      || d?.selectedSameTaskTelemetryEpisodes?.normalTrainMembershipEpisodes
        !== EXPECTED.selectedTaskNormalEpisodes
      || d?.selectedSameTaskTelemetryEpisodes?.frameRows !== EXPECTED.selectedTaskFrames
      || d?.excludedVideos?.units !== EXPECTED.videoFiles
      || d?.excludedVideos?.unit !== "MP4_OBJECT"
      || d?.excludedVideos?.bytes !== EXPECTED.videoBytes
      || d?.excludedVideos?.contentReplayed !== false
      || d?.completeAttemptCensus?.units !== 0
      || d?.completeAttemptCensus?.established !== false
      || d?.crossPopulationTotal !== null || d?.additionProhibited !== true) {
      fail("REPORT_DENOMINATOR_INVALID");
    }
    const labels = report.observations?.binaryLabelReplay?.totals;
    const selected = report.observations?.selectedSameTaskParquetReplay?.totals;
    if (report.observations?.metadataReplay?.profiles?.length !== 20
      || report.observations?.metadataReplay?.totals?.episodes !== EXPECTED.parquetFiles
      || report.observations?.metadataReplay?.totals?.frames !== EXPECTED.metadataFrames
      || report.observations?.metadataReplay?.totals?.videos !== EXPECTED.videoFiles
      || report.observations?.metadataReplay?.totals?.testFrames !== EXPECTED.testFrames
      || report.observations?.metadataReplay?.totals?.normalTrainFrames
        !== EXPECTED.normalTrainFrames
      || labels?.files !== EXPECTED.labelFiles
      || labels?.rows !== EXPECTED.labelRows
      || labels?.metadataFrameRowsForLabeledEpisodes !== EXPECTED.labelMetadataFrames
      || labels?.zeroRows !== EXPECTED.labelZeroRows
      || labels?.oneRows !== EXPECTED.labelOneRows
      || labels?.episodesWithAnyOne !== EXPECTED.labelEpisodesWithAnyOne
      || labels?.allZeroEpisodes !== EXPECTED.labelAllZeroEpisodes
      || labels?.allOneEpisodes !== EXPECTED.labelAllOneEpisodes
      || labels?.positiveRuns !== EXPECTED.labelPositiveRuns
      || labels?.valueTransitions !== EXPECTED.labelValueTransitions
      || labels?.lengthMismatchEpisodes !== 1
      || labels?.labelLengthDeltaRows !== -1
      || report.observations?.binaryLabelReplay?.semantics
        !== "publisher ground-truth anomaly detection target; values preserved as 0/1"
      || !same(report.observations?.binaryLabelReplay?.valuesObserved, [0, 1])
      || labels?.zeroRows + labels?.oneRows !== labels?.rows
      || labels?.episodesWithAnyOne + labels?.allZeroEpisodes !== EXPECTED.labelFiles
      || !Array.isArray(report.observations?.binaryLabelReplay?.episodeProfiles)
      || report.observations.binaryLabelReplay.episodeProfiles.length !== EXPECTED.labelFiles
      || !same(report.observations?.binaryLabelReplay?.missingLabelEpisodeKeys,
        [MISSING_LABEL_KEY])
      || !same(report.observations?.binaryLabelReplay?.labelLengthMismatches,
        [LABEL_LENGTH_MISMATCH])
      || selected?.episodes !== EXPECTED.selectedTaskParquets
      || selected?.frames !== EXPECTED.selectedTaskFrames
      || selected?.testEpisodes !== EXPECTED.selectedTaskTestEpisodes
      || selected?.testFrames !== EXPECTED.selectedTaskTestFrames
      || selected?.normalTrainEpisodes !== EXPECTED.selectedTaskNormalEpisodes
      || selected?.normalTrainFrames !== EXPECTED.selectedTaskNormalFrames
      || selected?.nullValues !== 0 || selected?.nonfiniteValues !== 0
      || selected?.timestampExactRows !== selected?.frames
      || report.observations?.selectedSameTaskParquetReplay?.task
        !== "industrial_screws_sorting"
      || report.observations?.selectedSameTaskParquetReplay?.actionWidth !== 6
      || report.observations?.selectedSameTaskParquetReplay?.observationStateWidth !== 6
      || report.observations?.githubLineage?.hfLabelFilesWithExactGithubPathSizeGitOidMatch
        !== EXPECTED.crossRepositoryLabelMatches
      || report.observations?.githubLineage?.extraGithubLabelFilesNotInHfDataset
        !== EXPECTED.githubLabelBlobs - EXPECTED.labelFiles
      || report.observations?.githubLineage?.extraGithubLabelsCountedInHfDenominator !== false) {
      fail("REPORT_OBSERVATION_INVALID");
    }
    if (report.coverage?.testEpisodes !== EXPECTED.testEpisodes
      || report.coverage?.labelFiles !== EXPECTED.labelFiles
      || report.coverage?.testEpisodesWithLabelFile !== EXPECTED.labelFiles
      || report.coverage?.testEpisodesMissingLabelFile !== 1
      || report.coverage?.completeTestEpisodeLabelCoverage !== false
      || !same(report.coverage?.missingLabelEpisodeKeys, [MISSING_LABEL_KEY])
      || report.coverage?.labelFilesWithMetadataLengthMismatch !== 1
      || !same(report.coverage?.labelLengthMismatches, [LABEL_LENGTH_MISMATCH])
      || report.coverage?.completePublishedLabelFileUniverseReplayed !== true) {
      fail("REPORT_COVERAGE_INVALID");
    }
    const truth = report.truthBoundary;
    if (truth?.publisherBinaryAnomalyLabelsEstablished !== true
      || truth?.publisherSplitMembershipEstablished !== true
      || truth?.labelOneMeansIndependentTaskFailure !== false
      || truth?.normalTrainMeansIndependentlyVerifiedSuccess !== false
      || truth?.independentPhysicalOutcomeEstablished !== false
      || truth?.recoveryChainEstablished !== false
      || truth?.completeAttemptCensusEstablished !== false
      || truth?.prospectiveOpportunityCensusEstablished !== false
      || truth?.delegationOrAuthorityEstablished !== false
      || truth?.completeTestEpisodeLabelCoverageEstablished !== false
      || report.segments?.opportunityCensus?.units !== 0
      || report.segments?.opportunityCensus?.prospective !== false
      || report.segments?.delegationAuthorization?.units !== 0
      || report.segments?.delegationAuthorization?.established !== false
      || report.segments?.action?.episodeUnits !== EXPECTED.selectedTaskParquets
      || report.segments?.action?.frameUnits !== EXPECTED.selectedTaskFrames
      || report.segments?.action?.stateActionTelemetryPresent !== true
      || report.segments?.effect?.publisherBinaryAnomalyFrameRows !== EXPECTED.labelRows
      || report.segments?.effect?.independentPhysicalEffectUnits !== 0
      || report.segments?.outcome?.publisherAnomalyLabelEpisodeUnits
        !== EXPECTED.labelEpisodesWithAnyOne
      || report.segments?.outcome?.independentUnits !== 0
      || report.segments?.outcome?.verifiedTaskSuccessUnits !== 0
      || report.segments?.recovery?.units !== 0
      || report.segments?.recovery?.verifiedRecoveryEffectUnits !== 0
      || report.segments?.longitudinal?.units !== 0
      || report.segments?.attributionAdditionProhibited !== true) fail("REPORT_TRUTH_INVALID");
    if (report.rights?.publisherLicenseClaim !== "Apache-2.0"
      || report.rights?.hfLicenseFilePresent !== false
      || report.rights?.githubDeclaredLicense !== null
      || report.rights?.githubLicenseFilePresent !== false
      || report.rights?.useSpecificLegalClearanceEstablished !== false
      || report.rights?.productionTrainingAuthorizedByOutsider !== false
      || report.privacy?.noPiiGuaranteed !== false
      || report.privacy?.videosExcluded !== true
      || report.privacy?.videoPrivacyReviewPerformed !== false
      || report.useBoundary?.status !== "QUARANTINE_EVAL_ONLY"
      || report.useBoundary?.offlineEvaluationLabelRows !== labels.rows
      || report.useBoundary?.offlineModelFittingRows !== 0
      || report.useBoundary?.authorizedTrainingRows !== 0
      || report.useBoundary?.governedTrainingRows !== 0
      || report.useBoundary?.trainingPerformed !== false
      || report.network?.rawNetworkAdmissionRows !== 0
      || report.network?.networkAdmissionRows !== 0
      || report.economics?.CEU !== 0 || report.economics?.pricingUnits !== 0
      || report.authority?.executionAuthorityUnits !== 0
      || report.authority?.executionAuthorityEstablished !== false
      || report.verification?.level !== "FULL_SELECTED_SOURCE_REDERIVED"
      || report.verification?.pyarrowHelperSha256
        !== botFailsSha256(Buffer.from(PYARROW_REPLAY, "utf8"))) fail("REPORT_BOUNDARY_INVALID");
    return { ok: true, artifactHash: report.artifactHash,
      publisherLabelFiles: EXPECTED.labelFiles, publisherLabelRows: labels.rows,
      selectedTelemetryEpisodes: EXPECTED.selectedTaskParquets,
      independentOutcomeUnits: 0, recoveryUnits: 0, authorizedTrainingRows: 0,
      authorityUnits: 0 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyBotFailsReportWithSource(report, sourceDirectory) {
  const standalone = verifyBotFailsReport(report);
  if (!standalone.ok) return standalone;
  const source = verifyBotFailsSourceDirectory(sourceDirectory);
  if (!source.ok) return source;
  try {
    if (report.source.sourceRoot !== source.sourceRoot
      || report.source.sourceManifestHash !== source.manifest.manifestHash
      || report.source.sourceManifestFileSha256 !== source.manifestFileSha256) {
      fail("REPORT_SOURCE_BINDING_INVALID");
    }
    const rebuilt = buildBotFailsReportFromSource(sourceDirectory);
    if (!same(report, rebuilt)) fail("REPORT_SOURCE_REDERIVATION_MISMATCH");
    return { ...standalone, ok: true, verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function receiptCore(receipt) {
  const copy = structuredClone(receipt);
  delete copy.receiptHash;
  return copy;
}

export function buildBotFailsReceipt(report, reportBytes) {
  const checked = verifyBotFailsReport(report);
  if (!checked.ok || !Buffer.isBuffer(reportBytes)
    || !reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_INPUT_INVALID");
  const receipt = { schema: BOTFAILS_RECEIPT_SCHEMA, createdAt: BOTFAILS_FROZEN_AT,
    reportSchema: BOTFAILS_REPORT_SCHEMA, artifactHash: report.artifactHash,
    reportFileSha256: botFailsSha256(reportBytes), sourceRoot: report.source.sourceRoot,
    sourceManifestHash: report.source.sourceManifestHash,
    verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED",
    closure: { publisherLabelFiles: EXPECTED.labelFiles,
      publisherLabelRows: report.observations.binaryLabelReplay.totals.rows,
      publisherTestEpisodes: EXPECTED.testEpisodes,
      missingLabelFiles: 1, publisherNormalTrainEpisodes: EXPECTED.normalTrainEpisodes,
      selectedTelemetryEpisodes: EXPECTED.selectedTaskParquets,
      independentOutcomeUnits: 0, recoveryUnits: 0, completeAttemptCensusEstablished: false,
      authorizedTrainingRows: 0, networkAdmissionRows: 0, CEU: 0, pricingUnits: 0,
      authorityUnits: 0 } };
  receipt.receiptHash = botFailsDigest(receiptCore(receipt),
    `${BOTFAILS_RECEIPT_SCHEMA}/receipt`);
  return receipt;
}

export function verifyBotFailsReceipt(receipt, report, reportBytes) {
  try {
    if (!exactObject(receipt) || receipt.schema !== BOTFAILS_RECEIPT_SCHEMA
      || receipt.createdAt !== BOTFAILS_FROZEN_AT || !HASH.test(receipt.receiptHash ?? "")
      || receipt.receiptHash !== botFailsDigest(receiptCore(receipt),
        `${BOTFAILS_RECEIPT_SCHEMA}/receipt`)
      || receipt.reportSchema !== BOTFAILS_REPORT_SCHEMA
      || receipt.artifactHash !== report.artifactHash
      || receipt.reportFileSha256 !== botFailsSha256(reportBytes)
      || receipt.sourceRoot !== report.source.sourceRoot
      || receipt.sourceManifestHash !== report.source.sourceManifestHash
      || receipt.verificationLevel !== "FULL_SELECTED_SOURCE_REDERIVED"
      || receipt.closure?.publisherLabelFiles !== EXPECTED.labelFiles
      || receipt.closure?.publisherLabelRows
        !== report.observations.binaryLabelReplay.totals.rows
      || receipt.closure?.publisherTestEpisodes !== EXPECTED.testEpisodes
      || receipt.closure?.missingLabelFiles !== 1
      || receipt.closure?.publisherNormalTrainEpisodes !== EXPECTED.normalTrainEpisodes
      || receipt.closure?.selectedTelemetryEpisodes !== EXPECTED.selectedTaskParquets
      || receipt.closure?.independentOutcomeUnits !== 0
      || receipt.closure?.recoveryUnits !== 0
      || receipt.closure?.completeAttemptCensusEstablished !== false
      || receipt.closure?.authorizedTrainingRows !== 0
      || receipt.closure?.networkAdmissionRows !== 0
      || receipt.closure?.CEU !== 0 || receipt.closure?.pricingUnits !== 0
      || receipt.closure?.authorityUnits !== 0) fail("RECEIPT_INVALID");
    return { ok: true, receiptHash: receipt.receiptHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function publishBotFailsArtifactDirectory(stagingDirectory, targetDirectory) {
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

export function verifyBotFailsArtifactDirectory(artifactDirectory) {
  try {
    const root = path.resolve(artifactDirectory);
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700) {
      fail("ARTIFACT_ROOT_INVALID");
    }
    if (!same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_TOP_LEVEL_INVALID");
    }
    const reportBytes = readPrivate(path.join(root, "report.json"));
    const receiptBytes = readPrivate(path.join(root, "run-receipt.json"));
    const report = parseJson(reportBytes, "ARTIFACT_REPORT_INVALID");
    const receipt = parseJson(receiptBytes, "ARTIFACT_RECEIPT_INVALID");
    const replay = verifyBotFailsReportWithSource(report, path.join(root, "source"));
    if (!replay.ok) fail("ARTIFACT_REPLAY_INVALID", replay.error);
    const checkedReceipt = verifyBotFailsReceipt(receipt, report, reportBytes);
    if (!checkedReceipt.ok) fail("ARTIFACT_RECEIPT_INVALID", checkedReceipt.error);
    return { ...replay, ok: true, report, receipt,
      reportFileSha256: botFailsSha256(reportBytes),
      receiptFileSha256: botFailsSha256(receiptBytes),
      sourceManifestFileSha256: report.source.sourceManifestFileSha256 };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
