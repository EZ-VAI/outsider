/*
 * Complete source-native intake for one official SWE-bench Lite submission.
 *
 * Raw model completions, source patches, evaluation scripts and test output stay
 * in 0600 source files.  The public report contains only structural, census,
 * retry, binding and harness-outcome aggregates.  The linked agent-code MIT
 * license is separately pinned and is never extended to submission artifacts or
 * to the heterogeneous upstream repositories represented by the benchmark.
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

export const SWEBENCH_AGENTLESS_O3_REPOSITORY = "SWE-bench/experiments";
export const SWEBENCH_AGENTLESS_O3_REVISION =
  "1faa91cade0562ba62b66c1c99e71f7b72d96f13";
export const SWEBENCH_AGENTLESS_O3_ROOT_TREE =
  "3940b71d3cbc7fc7d76ff391ea2540f6f84f1a23";
export const SWEBENCH_AGENTLESS_O3_EVALUATION_TREE =
  "e89b20232ed3e005997d2ccfa50ee16c714b19e2";
export const SWEBENCH_AGENTLESS_O3_LITE_TREE =
  "0d64fb04255a29fbb9e10af9f258ace12b22db7d";
export const SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE =
  "b4a5d6aa50be28b2c3b5a12f6e203ff000579e22";
export const SWEBENCH_AGENTLESS_O3_SUBMISSION =
  "evaluation/lite/20250214_agentless_lite_o3_mini";
export const SWEBENCH_AGENTLESS_O3_S3_PREFIX =
  "lite/20250214_agentless_lite_o3_mini/";
export const SWEBENCH_AGENTLESS_O3_LINKED_CODE_REPOSITORY =
  "sorendunn/Agentless-Lite";
export const SWEBENCH_AGENTLESS_O3_LINKED_LICENSE_REVISION =
  "8515a99125909b5bf206d2b8e8f957057b6599f5";
export const SWEBENCH_AGENTLESS_O3_LINKED_LICENSE_TREE =
  "ea28c909b990a578840968b7935d918f66c88a29";
export const SWEBENCH_AGENTLESS_O3_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const SWEBENCH_AGENTLESS_O3_SOURCE_SCHEMA =
  "outsider/swebench-agentless-o3-source/v1";
export const SWEBENCH_AGENTLESS_O3_AUDIT_SCHEMA =
  "outsider/swebench-agentless-o3-audit/v1";
export const SWEBENCH_AGENTLESS_O3_GIT_TREE_HASH =
  "sha256:58b4796563146ff262fe2f6c8486b4908f2cb7a581b5c25ad629e737e1625d03";
export const SWEBENCH_AGENTLESS_O3_S3_INVENTORY_HASH =
  "sha256:a76eafd529da39e11d4a75a40e563bbd54352fbb39642dd49278887367cf9c5e";
export const SWEBENCH_AGENTLESS_O3_REPLAY_HASH =
  "sha256:7d5deefe8f910f59b9c1fc2f528a56a13e89d2082ec65beb382b1f3c569aab3b";

export const SWEBENCH_AGENTLESS_O3_PROFILE = Object.freeze({
  githubSubmissionBlobs: 6,
  githubSubmissionBytes: 7_573,
  linkedLicenseBlobs: 1,
  linkedLicenseBytes: 1_070,
  s3Objects: 1_478,
  s3Bytes: 29_987_771,
  submissionObjects: 1_484,
  submissionBytes: 29_995_344,
  selectedObjectsIncludingLicenseSupport: 1_485,
  selectedBytesIncludingLicenseSupport: 29_996_414,
  predictionObjects: 1,
  predictionBytes: 300_081,
  trajectoryLogs: 300,
  trajectoryObjectsIncludingParameters: 301,
  trajectoryBytes: 1_834_434,
  harnessInstances: 294,
  harnessObjects: 1_176,
  harnessBytes: 27_853_256,
  declaredTasks: 300,
  noGeneration: 6,
  noLogs: 0,
  resolved: 97,
  upstreamRepositoryFamilies: 12,
});

const GITHUB_API = "https://api.github.com";
const GITHUB_RAW = "https://raw.githubusercontent.com";
const S3_HOST = "swe-bench-submissions.s3.amazonaws.com";
const S3_ROOT = `https://${S3_HOST}`;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const MD5 = /^[a-f0-9]{32}$/u;
const INSTANCE_ID = /^[A-Za-z0-9_.-]+__[A-Za-z0-9_.-]+-[0-9]+$/u;

const SUBMISSION_BLOBS = Object.freeze({
  "README.md": Object.freeze({ oid: "dd1296c987a86a99cb1f9c587a774dcb2dd6ef97",
    bytes: 1_608 }),
  "logo.png": Object.freeze({ oid: "f82e574f02483a9eee586c5b463e3cb48fc91b6f",
    bytes: 1_070 }),
  "metadata.yaml": Object.freeze({ oid: "1567cbf4725603ef0f43180912cb3393f7d0fbfc",
    bytes: 493 }),
  "results/resolved_by_repo.json": Object.freeze({
    oid: "ccbdb7afcfd674450957b4ebd8ed752f1fa33a4a", bytes: 764 }),
  "results/resolved_by_time.json": Object.freeze({
    oid: "1a0abaffb9e866b72b7cc0bb6d531218469e89dd", bytes: 574 }),
  "results/results.json": Object.freeze({
    oid: "55fcd0eccaf901464aa7547bb3c13bfa0ff2d9ed", bytes: 3_064 }),
});

const LINKED_LICENSE = Object.freeze({ path: "LICENSE",
  oid: "c99d4d2ce279ca269d1a4d918dff73c105a8fa17", bytes: 1_070 });

const UPSTREAM_FAMILIES = Object.freeze({
  astropy: 6, django: 114, matplotlib: 23, mwaskom: 4, pallets: 3, psf: 6,
  pydata: 5, "pylint-dev": 6, "pytest-dev": 17, "scikit-learn": 23,
  "sphinx-doc": 16, sympy: 77,
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `SWEBENCH_AGENTLESS_O3_${code}`
    : `SWEBENCH_AGENTLESS_O3_${code}:${detail}`);
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

export function swebenchAgentlessO3Sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function md5(bytes) {
  return createHash("md5").update(bytes).digest("hex");
}

function digest(domain, value) {
  return swebenchAgentlessO3Sha256(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes).digest("hex");
}

function safeRemotePath(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 4096
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function safeJoin(root, relative) {
  if (!safeRemotePath(relative)) fail("PATH_INVALID", relative);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, ...relative.split("/"));
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) fail("PATH_ESCAPE", relative);
  return resolved;
}

function permittedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === ""
      && parsed.password === "" && (parsed.hostname === "api.github.com"
        || parsed.hostname === "raw.githubusercontent.com"
        || parsed.hostname === S3_HOST);
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
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "follow",
      headers: { accept: "application/vnd.github+json, application/json, */*",
        "user-agent": "outsider-swebench-source-audit/1" }, signal: controller.signal });
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
    if (Number.isFinite(declared) && declared > maximumBytes) {
      fail("CONTENT_LENGTH_EXCEEDED", url);
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) fail("BODY_BYTES_EXCEEDED", url);
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
      await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** attempt)));
    }
  }
  throw last;
}

async function fetchRangeOnce(url, start, end, total, fetchImpl) {
  if (!permittedUrl(url) || new URL(url).hostname !== S3_HOST) {
    fail("RANGE_URL_REFUSED", url);
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000);
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "follow",
      headers: { range: `bytes=${start}-${end}`,
        "user-agent": "outsider-swebench-source-audit/1" },
      signal: controller.signal });
    if (!response || typeof response.arrayBuffer !== "function") fail("RANGE_FETCH_INVALID");
    if (response.status !== 206) {
      const error = new Error(`RANGE_HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 429
        || response.status >= 500;
      throw error;
    }
    const finalUrl = response.url || url;
    if (!permittedUrl(finalUrl) || new URL(finalUrl).hostname !== S3_HOST) {
      fail("RANGE_FINAL_URL_REFUSED", finalUrl);
    }
    const expectedLength = end - start + 1;
    const contentRange = response.headers?.get?.("content-range");
    if (contentRange !== `bytes ${start}-${end}/${total}`) {
      fail("CONTENT_RANGE_INVALID", String(contentRange));
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length !== expectedLength) fail("RANGE_BODY_SIZE_INVALID");
    return bytes;
  } finally { clearTimeout(timer); }
}

async function boundedFetchRange(url, start, end, total, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetchRangeOnce(url, start, end, total, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** attempt)));
    }
  }
  throw last;
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writePrivateOnce(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
    | (fsConstants.O_NOFOLLOW ?? 0);
  const descriptor = openSync(file, flags, 0o600);
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.nlink !== 1) fail("OUTPUT_UNSAFE", file);
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
  } finally { closeSync(descriptor); }
}

function privateTree(root) {
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) privateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

function githubEndpoints() {
  const experiments = `${GITHUB_API}/repos/${SWEBENCH_AGENTLESS_O3_REPOSITORY}`;
  const linked = `${GITHUB_API}/repos/${SWEBENCH_AGENTLESS_O3_LINKED_CODE_REPOSITORY}`;
  return {
    repository: experiments,
    commit: `${experiments}/git/commits/${SWEBENCH_AGENTLESS_O3_REVISION}`,
    rootTree: `${experiments}/git/trees/${SWEBENCH_AGENTLESS_O3_ROOT_TREE}`,
    evaluationTree: `${experiments}/git/trees/${SWEBENCH_AGENTLESS_O3_EVALUATION_TREE}`,
    liteTree: `${experiments}/git/trees/${SWEBENCH_AGENTLESS_O3_LITE_TREE}`,
    submissionTree: `${experiments}/git/trees/${SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE}?recursive=1`,
    linkedRepository: linked,
    linkedCommit: `${linked}/git/commits/${SWEBENCH_AGENTLESS_O3_LINKED_LICENSE_REVISION}`,
    linkedTree: `${linked}/git/trees/${SWEBENCH_AGENTLESS_O3_LINKED_LICENSE_TREE}?recursive=1`,
  };
}

function validateRepository(value) {
  if (!plain(value) || value.full_name !== SWEBENCH_AGENTLESS_O3_REPOSITORY
    || value.private !== false || value.archived !== false
    || value.visibility !== "public" || value.license !== null
    || value.default_branch !== "main") fail("REPOSITORY_PROFILE_INVALID");
  return { fullName: value.full_name, private: value.private,
    archived: value.archived, visibility: value.visibility,
    defaultBranch: value.default_branch, detectedLicense: null };
}

function validateCommit(value) {
  if (!plain(value) || value.sha !== SWEBENCH_AGENTLESS_O3_REVISION
    || value.tree?.sha !== SWEBENCH_AGENTLESS_O3_ROOT_TREE
    || !Array.isArray(value.parents)) fail("COMMIT_INVALID");
  return { sha: value.sha, treeSha: value.tree.sha,
    parentShas: value.parents.map((entry) => entry.sha) };
}

function validateTreeEntry(value, expectedPath, expectedType, expectedSha) {
  if (!plain(value) || value.path !== expectedPath || value.type !== expectedType
    || value.sha !== expectedSha) fail("PATH_CHAIN_INVALID", expectedPath);
}

function validateRootTree(value) {
  if (!plain(value) || value.sha !== SWEBENCH_AGENTLESS_O3_ROOT_TREE
    || value.truncated !== false || !Array.isArray(value.tree)) fail("ROOT_TREE_INVALID");
  validateTreeEntry(value.tree.find((entry) => entry.path === "evaluation"),
    "evaluation", "tree", SWEBENCH_AGENTLESS_O3_EVALUATION_TREE);
  if (value.tree.some((entry) => /^LICENSE(?:\.|$)/iu.test(entry.path))) {
    fail("ROOT_LICENSE_UNEXPECTED");
  }
  return { sha: value.sha, entries: value.tree.length,
    repositoryLicenseFilePresent: false,
    evaluationTreeSha: SWEBENCH_AGENTLESS_O3_EVALUATION_TREE };
}

function validateEvaluationTree(value) {
  if (!plain(value) || value.sha !== SWEBENCH_AGENTLESS_O3_EVALUATION_TREE
    || value.truncated !== false || !Array.isArray(value.tree)) {
    fail("EVALUATION_TREE_INVALID");
  }
  validateTreeEntry(value.tree.find((entry) => entry.path === "lite"),
    "lite", "tree", SWEBENCH_AGENTLESS_O3_LITE_TREE);
  return { sha: value.sha, entries: value.tree.length,
    liteTreeSha: SWEBENCH_AGENTLESS_O3_LITE_TREE };
}

function validateLiteTree(value) {
  if (!plain(value) || value.sha !== SWEBENCH_AGENTLESS_O3_LITE_TREE
    || value.truncated !== false || !Array.isArray(value.tree)) fail("LITE_TREE_INVALID");
  const name = SWEBENCH_AGENTLESS_O3_SUBMISSION.split("/").at(-1);
  validateTreeEntry(value.tree.find((entry) => entry.path === name), name,
    "tree", SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE);
  return { sha: value.sha, entries: value.tree.length,
    submission: name, submissionTreeSha: SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE };
}

function validateSubmissionTree(value) {
  if (!plain(value) || value.sha !== SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE
    || value.truncated !== false || !Array.isArray(value.tree)) {
    fail("SUBMISSION_TREE_INVALID");
  }
  const projection = value.tree.filter((entry) => entry.type === "blob").map((entry) => {
    if (!safeRemotePath(entry.path) || !SHA1.test(entry.sha ?? "")
      || !Number.isSafeInteger(entry.size) || entry.size < 0) fail("SUBMISSION_BLOB_INVALID");
    return { path: entry.path, oid: entry.sha, sizeBytes: entry.size };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const expected = Object.entries(SUBMISSION_BLOBS).map(([blobPath, descriptor]) => ({
    path: blobPath, oid: descriptor.oid, sizeBytes: descriptor.bytes,
  })).sort((left, right) => left.path.localeCompare(right.path));
  const treeHash = digest("outsider/swebench-agentless-o3-git-tree/v1", projection);
  if (!same(projection, expected) || treeHash !== SWEBENCH_AGENTLESS_O3_GIT_TREE_HASH
    || projection.reduce((sum, entry) => sum + entry.sizeBytes, 0)
      !== SWEBENCH_AGENTLESS_O3_PROFILE.githubSubmissionBytes
    || value.tree.some((entry) => /^LICENSE(?:\.|$)/iu.test(entry.path))) {
    fail("SUBMISSION_TREE_PROFILE_INVALID");
  }
  return { sha: value.sha, entries: value.tree.length, projection, treeHash,
    repositoryLicenseFilePresent: false };
}

function validateLinkedRepository(value) {
  if (!plain(value) || value.full_name !== SWEBENCH_AGENTLESS_O3_LINKED_CODE_REPOSITORY
    || value.private !== false || value.archived !== false
    || value.visibility !== "public" || value.license?.spdx_id !== "MIT") {
    fail("LINKED_REPOSITORY_INVALID");
  }
  return { fullName: value.full_name, private: value.private,
    archived: value.archived, visibility: value.visibility,
    detectedLicense: value.license.spdx_id };
}

function validateLinkedCommit(value) {
  if (!plain(value) || value.sha !== SWEBENCH_AGENTLESS_O3_LINKED_LICENSE_REVISION
    || value.tree?.sha !== SWEBENCH_AGENTLESS_O3_LINKED_LICENSE_TREE) {
    fail("LINKED_COMMIT_INVALID");
  }
  return { sha: value.sha, treeSha: value.tree.sha };
}

function validateLinkedTree(value) {
  if (!plain(value) || value.sha !== SWEBENCH_AGENTLESS_O3_LINKED_LICENSE_TREE
    || value.truncated !== false || !Array.isArray(value.tree)) fail("LINKED_TREE_INVALID");
  const license = value.tree.find((entry) => entry.path === LINKED_LICENSE.path);
  if (!plain(license) || license.type !== "blob" || license.sha !== LINKED_LICENSE.oid
    || license.size !== LINKED_LICENSE.bytes) fail("LINKED_LICENSE_BLOB_INVALID");
  return { sha: value.sha, entries: value.tree.length,
    license: { path: license.path, oid: license.sha, sizeBytes: license.size } };
}

function validateGitPhase(values) {
  return {
    repository: validateRepository(values.repository),
    commit: validateCommit(values.commit),
    rootTree: validateRootTree(values.rootTree),
    evaluationTree: validateEvaluationTree(values.evaluationTree),
    liteTree: validateLiteTree(values.liteTree),
    submissionTree: validateSubmissionTree(values.submissionTree),
    linkedRepository: validateLinkedRepository(values.linkedRepository),
    linkedCommit: validateLinkedCommit(values.linkedCommit),
    linkedTree: validateLinkedTree(values.linkedTree),
  };
}

function decodeXml(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"").replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&");
}

function xmlTag(block, name, required = true) {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "u").exec(block);
  if (!match) {
    if (required) fail("S3_XML_TAG_MISSING", name);
    return null;
  }
  return decodeXml(match[1]);
}

function parseS3Page(bytes, expectedPrefix) {
  const text = bytes.toString("utf8");
  if (!text.startsWith("<?xml") || !text.includes("<ListBucketResult")) {
    fail("S3_XML_INVALID");
  }
  const prefix = decodeURIComponent(xmlTag(text, "Prefix"));
  const encodingType = xmlTag(text, "EncodingType");
  const keyCount = Number(xmlTag(text, "KeyCount"));
  const maxKeys = Number(xmlTag(text, "MaxKeys"));
  const truncated = xmlTag(text, "IsTruncated") === "true";
  if (xmlTag(text, "Name") !== "swe-bench-submissions" || prefix !== expectedPrefix
    || encodingType !== "url" || !Number.isSafeInteger(keyCount) || keyCount < 0
    || maxKeys !== 1_000) fail("S3_PAGE_PROFILE_INVALID");
  const contents = [...text.matchAll(/<Contents>([\s\S]*?)<\/Contents>/gu)]
    .map((match) => {
      const block = match[1];
      const key = decodeURIComponent(xmlTag(block, "Key"));
      const sizeBytes = Number(xmlTag(block, "Size"));
      const etag = xmlTag(block, "ETag").replace(/^"|"$/gu, "").toLowerCase();
      const lastModified = xmlTag(block, "LastModified");
      const storageClass = xmlTag(block, "StorageClass");
      if (!safeRemotePath(key) || !key.startsWith(expectedPrefix)
        || !Number.isSafeInteger(sizeBytes) || sizeBytes < 0 || !MD5.test(etag)
        || !Number.isFinite(Date.parse(lastModified)) || storageClass !== "STANDARD") {
        fail("S3_OBJECT_DESCRIPTOR_INVALID", key);
      }
      return { key, sizeBytes, etag, lastModified };
    });
  if (contents.length !== keyCount) fail("S3_KEY_COUNT_MISMATCH");
  const continuationToken = truncated ? xmlTag(text, "NextContinuationToken") : null;
  if (truncated && (!continuationToken || continuationToken.length > 4096)) {
    fail("S3_CONTINUATION_TOKEN_INVALID");
  }
  return { prefix, keyCount, maxKeys, truncated, continuationToken, contents };
}

function validateS3Inventory(objects) {
  const projection = [...objects].sort((left, right) => left.key.localeCompare(right.key));
  if (projection.length !== SWEBENCH_AGENTLESS_O3_PROFILE.s3Objects
    || new Set(projection.map((entry) => entry.key)).size !== projection.length
    || projection.reduce((sum, entry) => sum + entry.sizeBytes, 0)
      !== SWEBENCH_AGENTLESS_O3_PROFILE.s3Bytes) fail("S3_INVENTORY_PROFILE_INVALID");
  const inventoryHash = digest("outsider/swebench-agentless-o3-s3-inventory/v1",
    projection);
  if (inventoryHash !== SWEBENCH_AGENTLESS_O3_S3_INVENTORY_HASH) {
    fail("S3_INVENTORY_HASH_INVALID", inventoryHash);
  }
  const prediction = projection.filter((entry) => entry.key
    === `${SWEBENCH_AGENTLESS_O3_S3_PREFIX}all_preds.jsonl`);
  const trajectories = projection.filter((entry) => /\/trajs\/[^/]+\.log$/u.test(entry.key));
  const parameters = projection.filter((entry) => entry.key
    === `${SWEBENCH_AGENTLESS_O3_S3_PREFIX}trajs/repair_parameters.json`);
  const harness = new Map();
  for (const entry of projection) {
    const match = /\/logs\/([^/]+)\/(eval\.sh|patch\.diff|report\.json|test_output\.txt)$/u
      .exec(entry.key);
    if (!match) continue;
    if (!INSTANCE_ID.test(match[1])) fail("S3_HARNESS_INSTANCE_INVALID", match[1]);
    if (!harness.has(match[1])) harness.set(match[1], []);
    harness.get(match[1]).push(match[2]);
  }
  if (prediction.length !== 1 || prediction[0].sizeBytes !== 300_081
    || trajectories.length !== 300 || parameters.length !== 1
    || harness.size !== 294 || [...harness.values()].some((files) => !same(sorted(files),
      ["eval.sh", "patch.diff", "report.json", "test_output.txt"]))) {
    fail("S3_LOGICAL_CLOSURE_INVALID");
  }
  return { projection, inventoryHash, prediction, trajectories, parameters,
    harnessInstances: sorted(harness.keys()) };
}

async function fetchJson(url, fetchImpl) {
  const response = await boundedFetch(url, 16 * 1024 * 1024, fetchImpl);
  return { ...response, parsed: parseJson(response.bytes, url) };
}

async function captureGithubPhase(root, phase, fetchImpl) {
  const endpoints = githubEndpoints();
  const names = Object.keys(endpoints);
  const responses = await Promise.all(names.map(async (name) => [name,
    await fetchJson(endpoints[name], fetchImpl)]));
  const values = Object.fromEntries(responses.map(([name, response]) =>
    [name, response.parsed]));
  const projection = validateGitPhase(values);
  const snapshots = responses.map(([kind, response]) => {
    const file = `api/${phase}/github-${kind}.json`;
    writePrivateOnce(safeJoin(root, file), response.bytes);
    return { phase, kind: `github-${kind}`, file, requestUrl: endpoints[kind],
      finalUrl: response.finalUrl, status: response.status,
      contentType: response.contentType, bytes: response.bytes.length,
      sha256: swebenchAgentlessO3Sha256(response.bytes) };
  });
  return { snapshots, projection };
}

async function captureS3Phase(root, phase, fetchImpl) {
  const snapshots = [];
  const objects = [];
  let token = null;
  let pageNumber = 0;
  do {
    pageNumber += 1;
    const url = new URL(`${S3_ROOT}/`);
    url.searchParams.set("list-type", "2");
    url.searchParams.set("encoding-type", "url");
    url.searchParams.set("prefix", SWEBENCH_AGENTLESS_O3_S3_PREFIX);
    url.searchParams.set("max-keys", "1000");
    if (token !== null) url.searchParams.set("continuation-token", token);
    const response = await boundedFetch(url.href, 4 * 1024 * 1024, fetchImpl);
    const page = parseS3Page(response.bytes, SWEBENCH_AGENTLESS_O3_S3_PREFIX);
    objects.push(...page.contents);
    token = page.continuationToken;
    const kind = `s3-page-${String(pageNumber).padStart(3, "0")}`;
    const file = `api/${phase}/${kind}.xml`;
    writePrivateOnce(safeJoin(root, file), response.bytes);
    snapshots.push({ phase, kind, file, requestUrl: url.href,
      finalUrl: response.finalUrl, status: response.status,
      contentType: response.contentType, bytes: response.bytes.length,
      sha256: swebenchAgentlessO3Sha256(response.bytes) });
    if (pageNumber > 3) fail("S3_PAGE_COUNT_EXCEEDED");
  } while (token !== null);
  if (pageNumber !== 2) fail("S3_PAGE_COUNT_INVALID", pageNumber);
  return { snapshots, inventory: validateS3Inventory(objects) };
}

function encodedPath(value) {
  return value.split("/").map(encodeURIComponent).join("/");
}

async function downloadGithubObject(root, entry, fetchImpl) {
  const requestUrl = `${GITHUB_RAW}/${SWEBENCH_AGENTLESS_O3_REPOSITORY}/${
    SWEBENCH_AGENTLESS_O3_REVISION}/${encodedPath(SWEBENCH_AGENTLESS_O3_SUBMISSION)}/${
    encodedPath(entry.path)}`;
  const response = await boundedFetch(requestUrl, entry.sizeBytes, fetchImpl);
  if (response.bytes.length !== entry.sizeBytes || gitBlobOid(response.bytes) !== entry.oid) {
    fail("GITHUB_OBJECT_INVALID", entry.path);
  }
  const file = `objects/github/submission/${entry.path}`;
  writePrivateOnce(safeJoin(root, file), response.bytes);
  return { source: "github-submission", remotePath: entry.path, file,
    bytes: response.bytes.length, sha256: swebenchAgentlessO3Sha256(response.bytes),
    gitBlobOid: entry.oid, requestUrl, finalUrl: response.finalUrl,
    status: response.status, contentType: response.contentType };
}

async function downloadLinkedLicense(root, fetchImpl) {
  const requestUrl = `${GITHUB_RAW}/${SWEBENCH_AGENTLESS_O3_LINKED_CODE_REPOSITORY}/${
    SWEBENCH_AGENTLESS_O3_LINKED_LICENSE_REVISION}/${LINKED_LICENSE.path}`;
  const response = await boundedFetch(requestUrl, LINKED_LICENSE.bytes, fetchImpl);
  if (response.bytes.length !== LINKED_LICENSE.bytes
    || gitBlobOid(response.bytes) !== LINKED_LICENSE.oid
    || !response.bytes.toString("utf8").includes("MIT License")) {
    fail("LINKED_LICENSE_OBJECT_INVALID");
  }
  const file = "objects/github/linked-agentless/LICENSE";
  writePrivateOnce(safeJoin(root, file), response.bytes);
  return { source: "github-linked-license", remotePath: LINKED_LICENSE.path,
    file, bytes: response.bytes.length,
    sha256: swebenchAgentlessO3Sha256(response.bytes),
    gitBlobOid: LINKED_LICENSE.oid, requestUrl, finalUrl: response.finalUrl,
    status: response.status, contentType: response.contentType };
}

async function downloadS3Object(root, entry, fetchImpl) {
  const requestUrl = `${S3_ROOT}/${encodedPath(entry.key)}`;
  const response = await boundedFetch(requestUrl, entry.sizeBytes, fetchImpl);
  const digestMd5 = md5(response.bytes);
  if (response.bytes.length !== entry.sizeBytes || digestMd5 !== entry.etag) {
    fail("S3_OBJECT_INVALID", entry.key);
  }
  const file = `objects/s3/${entry.key}`;
  writePrivateOnce(safeJoin(root, file), response.bytes);
  return { source: "s3-submission", key: entry.key, file,
    bytes: response.bytes.length, sha256: swebenchAgentlessO3Sha256(response.bytes),
    etag: entry.etag, lastModified: entry.lastModified, md5Verified: true,
    requestUrl, finalUrl: response.finalUrl, status: response.status,
    contentType: response.contentType };
}

function downloadS3WithAws(root, entries, progress) {
  const destination = safeJoin(root,
    `objects/s3/${SWEBENCH_AGENTLESS_O3_S3_PREFIX.slice(0, -1)}`);
  ensurePrivateDirectory(destination);
  const previousUmask = process.umask(0o077);
  let command;
  try {
    command = spawnSync("aws", ["s3", "cp",
      `s3://swe-bench-submissions/${SWEBENCH_AGENTLESS_O3_S3_PREFIX}`,
      destination, "--recursive", "--no-sign-request", "--only-show-errors",
      "--cli-connect-timeout", "30", "--cli-read-timeout", "120"], {
      encoding: "utf8", maxBuffer: 4 * 1024 * 1024, timeout: 20 * 60_000,
      env: { ...process.env, AWS_MAX_ATTEMPTS: "3", AWS_RETRY_MODE: "standard" },
    });
  } finally { process.umask(previousUmask); }
  if (command.error || command.status !== 0 || command.signal !== null) {
    fail("AWS_BULK_DOWNLOAD_FAILED", command.error?.message
      ?? command.stderr?.trim() ?? `status=${command.status}:signal=${command.signal}`);
  }
  privateTree(destination);
  const expectedRelative = entries.map((entry) =>
    entry.key.slice(SWEBENCH_AGENTLESS_O3_S3_PREFIX.length))
    .sort((left, right) => left.localeCompare(right));
  if (!same(walk(destination), expectedRelative)) fail("AWS_BULK_FILE_SET_INVALID");
  const output = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const relative = entry.key.slice(SWEBENCH_AGENTLESS_O3_S3_PREFIX.length);
    const bytes = readRegular(safeJoin(destination, relative), entry.sizeBytes);
    if (md5(bytes) !== entry.etag) fail("S3_OBJECT_INVALID", entry.key);
    const requestUrl = `${S3_ROOT}/${encodedPath(entry.key)}`;
    output.push({ source: "s3-submission", key: entry.key,
      file: `objects/s3/${entry.key}`, bytes: bytes.length,
      sha256: swebenchAgentlessO3Sha256(bytes), etag: entry.etag,
      lastModified: entry.lastModified, md5Verified: true, requestUrl,
      finalUrl: requestUrl, status: 200, contentType: null,
      transport: "aws-cli-unsigned-bulk" });
    if (typeof progress === "function" && ((index + 1) % 100 === 0
      || index + 1 === entries.length)) progress({ completed: index + 1,
        total: entries.length });
  }
  return output;
}

function s3Descriptor(entry, bytes, transport) {
  const requestUrl = `${S3_ROOT}/${encodedPath(entry.key)}`;
  return { source: "s3-submission", key: entry.key,
    file: `objects/s3/${entry.key}`, bytes: bytes.length,
    sha256: swebenchAgentlessO3Sha256(bytes), etag: entry.etag,
    lastModified: entry.lastModified, md5Verified: true, requestUrl,
    finalUrl: requestUrl, status: 200, contentType: null, transport };
}

async function downloadS3ObjectByRanges(root, entry, fetchImpl, progress,
  completedBefore, totalObjects) {
  const requestUrl = `${S3_ROOT}/${encodedPath(entry.key)}`;
  const chunkBytes = 256 * 1024;
  const ranges = [];
  for (let start = 0; start < entry.sizeBytes; start += chunkBytes) {
    ranges.push({ start, end: Math.min(entry.sizeBytes - 1, start + chunkBytes - 1) });
  }
  const chunks = new Array(ranges.length);
  let next = 0;
  let finished = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= ranges.length) return;
      const range = ranges[index];
      chunks[index] = await boundedFetchRange(requestUrl, range.start, range.end,
        entry.sizeBytes, fetchImpl);
      finished += 1;
      if (typeof progress === "function") progress({ completed: completedBefore,
        total: totalObjects, range: { key: entry.key, completed: finished,
          total: ranges.length } });
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, ranges.length) }, worker));
  const bytes = Buffer.concat(chunks);
  if (bytes.length !== entry.sizeBytes || md5(bytes) !== entry.etag) {
    fail("RANGED_S3_OBJECT_INVALID", entry.key);
  }
  writePrivateOnce(safeJoin(root, `objects/s3/${entry.key}`), bytes);
  return s3Descriptor(entry, bytes, "bounded-http-range-256k");
}

async function downloadS3FromVerifiedSeed(root, entries, seedDirectory, fetchImpl,
  progress) {
  const seedStat = lstatSync(seedDirectory);
  if (seedStat.isSymbolicLink() || !seedStat.isDirectory()) {
    fail("SEED_DIRECTORY_UNSAFE", seedDirectory);
  }
  const output = [];
  const missing = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const relative = entry.key.slice(SWEBENCH_AGENTLESS_O3_S3_PREFIX.length);
    const candidate = safeJoin(seedDirectory, relative);
    let bytes = null;
    if (existsSync(candidate)) {
      const stat = lstatSync(candidate);
      if (!stat.isSymbolicLink() && stat.isFile() && stat.size === entry.sizeBytes) {
        const value = readFileSync(candidate);
        if (md5(value) === entry.etag) bytes = value;
      }
    }
    if (bytes === null) missing.push(entry);
    else {
      writePrivateOnce(safeJoin(root, `objects/s3/${entry.key}`), bytes);
      output.push(s3Descriptor(entry, bytes, "verified-local-restart-seed"));
      if (typeof progress === "function" && ((index + 1) % 100 === 0
        || index + 1 === entries.length)) progress({ completed: index + 1,
          total: entries.length });
    }
  }
  if (missing.length > 8) fail("SEED_MISSING_OBJECT_LIMIT_EXCEEDED", missing.length);
  for (const entry of missing) {
    output.push(await downloadS3ObjectByRanges(root, entry, fetchImpl, progress,
      output.length, entries.length));
  }
  return output.sort((left, right) => left.key.localeCompare(right.key));
}

async function downloadPool(entries, worker, concurrency, progress) {
  const output = new Array(entries.length);
  let next = 0;
  let completed = 0;
  let firstError = null;
  async function run() {
    while (true) {
      if (firstError !== null) return;
      const index = next;
      next += 1;
      if (index >= entries.length) return;
      try { output[index] = await worker(entries[index]); }
      catch (error) { firstError ??= error; return; }
      completed += 1;
      if (typeof progress === "function" && (completed % 100 === 0
        || completed === entries.length)) progress({ completed, total: entries.length });
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, run));
  if (firstError !== null) throw firstError;
  return output;
}

function rootProjection(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots, ...remoteObjects].map((entry) => ({
    file: entry.file, bytes: entry.bytes, sha256: entry.sha256,
  })).sort((left, right) => left.file.localeCompare(right.file));
  return { files, sourceRoot: digest("outsider/swebench-agentless-o3-source-root/v1",
    files) };
}

async function settledPair(left, right) {
  const results = await Promise.allSettled([left, right]);
  const rejected = results.find((entry) => entry.status === "rejected");
  if (rejected) throw rejected.reason;
  return results.map((entry) => entry.value);
}

export async function acquirePinnedSwebenchAgentlessO3Source(sourceDirectory,
  options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  if (existsSync(sourceDirectory)) fail("SOURCE_EXISTS", sourceDirectory);
  const parent = path.dirname(path.resolve(sourceDirectory));
  ensurePrivateDirectory(parent);
  const temporary = path.join(parent,
    `.${path.basename(sourceDirectory)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const [githubBefore, s3Before] = await settledPair(
      captureGithubPhase(temporary, "before", fetchImpl),
      captureS3Phase(temporary, "before", fetchImpl),
    );
    const githubObjects = await downloadPool(githubBefore.projection.submissionTree.projection,
      (entry) => downloadGithubObject(temporary, entry, fetchImpl), 6, null);
    const linkedLicense = await downloadLinkedLicense(temporary, fetchImpl);
    const s3Objects = options.s3SeedDirectory
      ? await downloadS3FromVerifiedSeed(temporary, s3Before.inventory.projection,
        options.s3SeedDirectory, fetchImpl, options.progress)
      : options.s3Transport === "aws-cli"
        ? downloadS3WithAws(temporary, s3Before.inventory.projection, options.progress)
        : await downloadPool(s3Before.inventory.projection,
          (entry) => downloadS3Object(temporary, entry, fetchImpl),
          options.downloadConcurrency ?? 8, options.progress);
    const [githubAfter, s3After] = await settledPair(
      captureGithubPhase(temporary, "after", fetchImpl),
      captureS3Phase(temporary, "after", fetchImpl),
    );
    if (!same(githubBefore.projection, githubAfter.projection)
      || !same(s3Before.inventory.projection, s3After.inventory.projection)) {
      fail("SOURCE_DRIFT");
    }
    const apiSnapshots = [...githubBefore.snapshots, ...s3Before.snapshots,
      ...githubAfter.snapshots, ...s3After.snapshots]
      .sort((left, right) => left.file.localeCompare(right.file));
    const remoteObjects = [...githubObjects, linkedLicense, ...s3Objects]
      .sort((left, right) => left.file.localeCompare(right.file));
    const rooted = rootProjection(apiSnapshots, remoteObjects);
    const body = { schema: SWEBENCH_AGENTLESS_O3_SOURCE_SCHEMA,
      frozenAt: SWEBENCH_AGENTLESS_O3_FROZEN_AT, apiSnapshots, remoteObjects,
      sourceFiles: rooted.files, sourceRoot: rooted.sourceRoot,
      closure: {
        githubRevision: SWEBENCH_AGENTLESS_O3_REVISION,
        githubPathChainCapturedBeforeAndAfter: true,
        githubSubmissionTree: SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE,
        githubSubmissionBlobs: 6, githubSubmissionBytes: 7_573,
        s3Prefix: SWEBENCH_AGENTLESS_O3_S3_PREFIX,
        s3InventoryCapturedBeforeAndAfter: true, s3PagesPerPhase: 2,
        s3InventoryHash: SWEBENCH_AGENTLESS_O3_S3_INVENTORY_HASH,
        s3Objects: 1_478, s3Bytes: 29_987_771,
        completePublishedSubmissionPrefix: true,
        submissionObjects: 1_484, submissionBytes: 29_995_344,
        linkedLicenseSupportObjects: 1, linkedLicenseSupportBytes: 1_070,
        selectedObjectsIncludingLicenseSupport: 1_485,
        selectedBytesIncludingLicenseSupport: 29_996_414,
        excludedSubmissionObjects: 0, excludedSubmissionBytes: 0,
        rawTrajectoryPatchAndTestOutputStoredPrivate: true,
      } };
    const manifest = { ...body,
      manifestHash: digest("outsider/swebench-agentless-o3-source-manifest/v1", body) };
    writePrivateOnce(path.join(temporary, "acquisition-manifest.json"),
      canonicalBytes(manifest));
    privateTree(temporary);
    renameSync(temporary, sourceDirectory);
    chmodSync(sourceDirectory, 0o700);
    return { sourceDirectory, manifest };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function readRegular(file, bytesExpected = null) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o777) !== 0o600) {
    fail("FILE_UNSAFE", file);
  }
  const bytes = readFileSync(file);
  if (bytesExpected !== null && bytes.length !== bytesExpected) {
    fail("FILE_SIZE_INVALID", file);
  }
  return bytes;
}

function walk(root) {
  const files = [];
  const queue = [root];
  while (queue.length > 0) {
    const directory = queue.shift();
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700) {
      fail("DIRECTORY_UNSAFE", directory);
    }
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
      if (entry.isDirectory()) queue.push(child);
      else if (entry.isFile()) {
        const childStat = lstatSync(child);
        if ((childStat.mode & 0o777) !== 0o600) fail("FILE_MODE_INVALID", child);
        files.push(path.relative(root, child).split(path.sep).join("/"));
      } else fail("SPECIAL_FILE_REFUSED", child);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

function expectedClosure() {
  return {
    githubRevision: SWEBENCH_AGENTLESS_O3_REVISION,
    githubPathChainCapturedBeforeAndAfter: true,
    githubSubmissionTree: SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE,
    githubSubmissionBlobs: 6, githubSubmissionBytes: 7_573,
    s3Prefix: SWEBENCH_AGENTLESS_O3_S3_PREFIX,
    s3InventoryCapturedBeforeAndAfter: true, s3PagesPerPhase: 2,
    s3InventoryHash: SWEBENCH_AGENTLESS_O3_S3_INVENTORY_HASH,
    s3Objects: 1_478, s3Bytes: 29_987_771,
    completePublishedSubmissionPrefix: true,
    submissionObjects: 1_484, submissionBytes: 29_995_344,
    linkedLicenseSupportObjects: 1, linkedLicenseSupportBytes: 1_070,
    selectedObjectsIncludingLicenseSupport: 1_485,
    selectedBytesIncludingLicenseSupport: 29_996_414,
    excludedSubmissionObjects: 0, excludedSubmissionBytes: 0,
    rawTrajectoryPatchAndTestOutputStoredPrivate: true,
  };
}

function snapshotsByPhase(sourceDirectory, descriptors) {
  const phases = { before: { github: {}, s3: [] }, after: { github: {}, s3: [] } };
  for (const descriptor of descriptors) {
    if (!plain(descriptor) || !["before", "after"].includes(descriptor.phase)
      || !safeRemotePath(descriptor.file) || !HASH.test(descriptor.sha256 ?? "")
      || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1) {
      fail("SNAPSHOT_DESCRIPTOR_INVALID");
    }
    const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
    if (swebenchAgentlessO3Sha256(bytes) !== descriptor.sha256) {
      fail("SNAPSHOT_HASH_INVALID", descriptor.file);
    }
    if (descriptor.kind.startsWith("github-")) {
      const key = descriptor.kind.slice("github-".length);
      phases[descriptor.phase].github[key] = parseJson(bytes, descriptor.file);
    } else if (/^s3-page-[0-9]{3}$/u.test(descriptor.kind)) {
      phases[descriptor.phase].s3.push({ kind: descriptor.kind, bytes });
    } else fail("SNAPSHOT_KIND_INVALID", descriptor.kind);
  }
  for (const phase of ["before", "after"]) {
    phases[phase].s3.sort((left, right) => left.kind.localeCompare(right.kind));
  }
  return phases;
}

function validateSnapshotPhase(value) {
  const github = validateGitPhase(value.github);
  if (value.s3.length !== 2) fail("SNAPSHOT_S3_PAGE_COUNT_INVALID");
  const objects = [];
  for (let index = 0; index < value.s3.length; index += 1) {
    if (value.s3[index].kind !== `s3-page-${String(index + 1).padStart(3, "0")}`) {
      fail("SNAPSHOT_S3_PAGE_ORDER_INVALID");
    }
    const page = parseS3Page(value.s3[index].bytes,
      SWEBENCH_AGENTLESS_O3_S3_PREFIX);
    objects.push(...page.contents);
    if ((index === 0) !== page.truncated) fail("SNAPSHOT_S3_TRUNCATION_INVALID");
  }
  return { github, s3: validateS3Inventory(objects) };
}

export function verifySwebenchAgentlessO3SourceDirectory(sourceDirectory) {
  try {
    const manifest = parseJson(readRegular(path.join(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== SWEBENCH_AGENTLESS_O3_SOURCE_SCHEMA
      || manifest.frozenAt !== SWEBENCH_AGENTLESS_O3_FROZEN_AT
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 22
      || !Array.isArray(manifest.remoteObjects)
      || manifest.remoteObjects.length !== 1_485
      || !Array.isArray(manifest.sourceFiles) || !HASH.test(manifest.sourceRoot ?? "")
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_INVALID");
    const phases = snapshotsByPhase(sourceDirectory, manifest.apiSnapshots);
    const before = validateSnapshotPhase(phases.before);
    const after = validateSnapshotPhase(phases.after);
    if (!same(before.github, after.github)
      || !same(before.s3.projection, after.s3.projection)) fail("SOURCE_DRIFT");

    const remoteByFile = new Map();
    for (const descriptor of manifest.remoteObjects) {
      if (!plain(descriptor) || !safeRemotePath(descriptor.file)
        || remoteByFile.has(descriptor.file) || !HASH.test(descriptor.sha256 ?? "")
        || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 0) {
        fail("REMOTE_DESCRIPTOR_INVALID");
      }
      remoteByFile.set(descriptor.file, descriptor);
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      if (swebenchAgentlessO3Sha256(bytes) !== descriptor.sha256) {
        fail("REMOTE_HASH_INVALID", descriptor.file);
      }
      if (descriptor.source === "github-submission") {
        const expected = before.github.submissionTree.projection.find((entry) =>
          entry.path === descriptor.remotePath);
        if (!expected || descriptor.file !== `objects/github/submission/${expected.path}`
          || descriptor.bytes !== expected.sizeBytes
          || descriptor.gitBlobOid !== expected.oid
          || gitBlobOid(bytes) !== expected.oid) fail("GITHUB_REMOTE_INVALID");
      } else if (descriptor.source === "github-linked-license") {
        if (descriptor.remotePath !== LINKED_LICENSE.path
          || descriptor.file !== "objects/github/linked-agentless/LICENSE"
          || descriptor.bytes !== LINKED_LICENSE.bytes
          || descriptor.gitBlobOid !== LINKED_LICENSE.oid
          || gitBlobOid(bytes) !== LINKED_LICENSE.oid) fail("LINKED_REMOTE_INVALID");
      } else if (descriptor.source === "s3-submission") {
        const expected = before.s3.projection.find((entry) => entry.key === descriptor.key);
        if (!expected || descriptor.file !== `objects/s3/${expected.key}`
          || descriptor.bytes !== expected.sizeBytes || descriptor.etag !== expected.etag
          || descriptor.lastModified !== expected.lastModified
          || descriptor.md5Verified !== true || md5(bytes) !== expected.etag) {
          fail("S3_REMOTE_INVALID", descriptor.key);
        }
      } else fail("REMOTE_SOURCE_INVALID");
    }
    const expectedGitFiles = before.github.submissionTree.projection.map((entry) =>
      `objects/github/submission/${entry.path}`);
    const expectedS3Files = before.s3.projection.map((entry) => `objects/s3/${entry.key}`);
    const expectedRemoteFiles = [...expectedGitFiles,
      "objects/github/linked-agentless/LICENSE", ...expectedS3Files]
      .sort((left, right) => left.localeCompare(right));
    if (!same(sorted(remoteByFile.keys()), expectedRemoteFiles)) {
      fail("REMOTE_SET_INVALID");
    }
    if (!same(manifest.closure, expectedClosure())) fail("CLOSURE_INVALID");
    const rooted = rootProjection(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles) || rooted.sourceRoot !== manifest.sourceRoot) {
      fail("SOURCE_ROOT_INVALID");
    }
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"].sort((left, right) => left.localeCompare(right));
    if (!same(walk(sourceDirectory), expectedFiles)) fail("FILE_CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/swebench-agentless-o3-source-manifest/v1",
      body)) fail("MANIFEST_HASH_INVALID");
    return { ok: true, manifest, github: before.github, s3: before.s3,
      verificationLevel:
        "PINNED_COMPLETE_SWEBENCH_AGENTLESS_O3_SUBMISSION_PREFIX_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function increment(target, key, amount = 1) {
  const value = String(key);
  target[value] = (target[value] ?? 0) + amount;
}

function exactKeys(value, expected, code) {
  if (!plain(value) || !same(sorted(Object.keys(value)), sorted(expected))) fail(code);
}

function descriptorForKey(verified, key) {
  const descriptor = verified.manifest.remoteObjects.find((entry) =>
    entry.source === "s3-submission" && entry.key === key);
  if (!descriptor) fail("SOURCE_OBJECT_MISSING", key);
  return descriptor;
}

function descriptorForGithub(verified, remotePath) {
  const descriptor = verified.manifest.remoteObjects.find((entry) =>
    entry.source === "github-submission" && entry.remotePath === remotePath);
  if (!descriptor) fail("GITHUB_SOURCE_OBJECT_MISSING", remotePath);
  return descriptor;
}

function sourceBytes(sourceDirectory, descriptor) {
  return readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
}

function parseJsonLines(bytes, label) {
  const text = bytes.toString("utf8");
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return lines.map((line, index) => {
    if (line.length === 0) fail("JSONL_EMPTY_LINE", `${label}:${index + 1}`);
    return parseJson(Buffer.from(line, "utf8"), `${label}:${index + 1}`);
  });
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-9;]*m/gu, "");
}

function parseTrajectory(instanceId, bytes) {
  const text = bytes.toString("utf8");
  const starts = [...text.matchAll(/Starting retrieval for instance ([^\s]+)$/gmu)]
    .map((match) => match[1]);
  const checkouts = [...text.matchAll(
    /Checking out commit ([a-f0-9]{40}) for repo ([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)$/gmu)];
  const temperatures = [...text.matchAll(
    /Making batch API call with temperature ([0-9.eE+-]+)$/gmu)]
    .map((match) => Number(match[1]));
  const responses = [...text.matchAll(/ - INFO - API response ChatCompletion\(/gu)];
  const finishes = [...text.matchAll(/finish_reason='([^']+)'/gu)].map((match) => match[1]);
  const written = [...text.matchAll(/ - INFO - Output written successfully$/gmu)].length;
  const errors = [...text.matchAll(/ - (?:ERROR|CRITICAL) - /gu)].length;
  const tracebacks = [...text.matchAll(/^Traceback \(most recent call last\):$/gmu)].length;
  if (starts.length !== 1 || starts[0] !== instanceId || checkouts.length !== 1
    || temperatures.some((entry) => !Number.isFinite(entry))
    || responses.length !== finishes.length || responses.length !== written) {
    fail("TRAJECTORY_SCHEMA_INVALID", instanceId);
  }
  const repository = checkouts[0][2];
  const owner = repository.split("/")[0];
  return { instanceId, repository, owner, baseCommit: checkouts[0][1],
    temperatures, apiResponses: responses.length, finishReasons: finishes,
    errors, tracebacks, bytes: bytes.length,
    containsAgentSuccessClaim: /\b(?:task|issue) (?:is )?(?:successfully )?(?:resolved|passed)\b/iu
      .test(text),
    containsPromptLikeAssignmentText: /(?:messages|prompt)\s*=/iu.test(text),
  };
}

function parseHarnessReport(instanceId, bytes) {
  const outer = parseJson(bytes, `report:${instanceId}`);
  exactKeys(outer, [instanceId], "REPORT_OUTER_KEYS_INVALID");
  const report = outer[instanceId];
  exactKeys(report, ["patch_exists", "patch_is_None", "patch_successfully_applied",
    "resolved", "tests_status"], "REPORT_KEYS_INVALID");
  if (typeof report.patch_exists !== "boolean" || typeof report.patch_is_None !== "boolean"
    || typeof report.patch_successfully_applied !== "boolean"
    || typeof report.resolved !== "boolean" || !plain(report.tests_status)) {
    fail("REPORT_TYPES_INVALID", instanceId);
  }
  const categories = ["FAIL_TO_FAIL", "FAIL_TO_PASS", "PASS_TO_FAIL", "PASS_TO_PASS"];
  exactKeys(report.tests_status, categories, "REPORT_TEST_CATEGORIES_INVALID");
  const tests = [];
  for (const category of categories) {
    exactKeys(report.tests_status[category], ["failure", "success"],
      "REPORT_TEST_STATUS_INVALID");
    for (const disposition of ["success", "failure"]) {
      const values = report.tests_status[category][disposition];
      if (!Array.isArray(values) || values.some((entry) => typeof entry !== "string")) {
        fail("REPORT_TEST_LIST_INVALID", instanceId);
      }
      for (const name of values) tests.push({ category, disposition, name });
    }
  }
  return { report, tests };
}

export function runSwebenchAgentlessO3Replay(sourceDirectory) {
  const verified = verifySwebenchAgentlessO3SourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const readGithub = (remotePath) => sourceBytes(sourceDirectory,
    descriptorForGithub(verified, remotePath));
  const readS3 = (key) => sourceBytes(sourceDirectory, descriptorForKey(verified, key));
  const readme = readGithub("README.md").toString("utf8");
  const metadata = readGithub("metadata.yaml").toString("utf8");
  const results = parseJson(readGithub("results/results.json"), "results.json");
  exactKeys(results, ["no_generation", "no_logs", "resolved"], "RESULTS_KEYS_INVALID");
  if (!Array.isArray(results.no_generation) || !Array.isArray(results.no_logs)
    || !Array.isArray(results.resolved) || results.no_generation.length !== 6
    || results.no_logs.length !== 0 || results.resolved.length !== 97
    || [...results.no_generation, ...results.resolved]
      .some((entry) => !INSTANCE_ID.test(entry))) fail("RESULTS_PROFILE_INVALID");
  const resolvedSet = new Set(results.resolved);
  const noGenerationSet = new Set(results.no_generation);
  if (resolvedSet.size !== 97 || noGenerationSet.size !== 6
    || [...resolvedSet].some((entry) => noGenerationSet.has(entry))) {
    fail("RESULTS_SET_INVALID");
  }
  const passAtOneDeclared = readme.includes(
    "Is a pass@1 submission (does not attempt the same task instance more than once)");
  const assetsNullInGitMetadata = /assets:\s*\n\s+logs: null\s*\n\s+trajs: null/u
    .test(metadata);
  if (!passAtOneDeclared || !assetsNullInGitMetadata) fail("SUBMISSION_METADATA_INVALID");

  const predictionKey = `${SWEBENCH_AGENTLESS_O3_S3_PREFIX}all_preds.jsonl`;
  const predictions = parseJsonLines(readS3(predictionKey), "all_preds.jsonl");
  if (predictions.length !== 294) fail("PREDICTION_ROWS_INVALID");
  const predictionById = new Map();
  const attemptClasses = {};
  const temperatureClasses = {};
  for (const row of predictions) {
    exactKeys(row, ["attempt", "instance_id", "model_name_or_path", "model_patch",
      "temperature"], "PREDICTION_KEYS_INVALID");
    if (!INSTANCE_ID.test(row.instance_id) || predictionById.has(row.instance_id)
      || row.model_name_or_path !== "agentless_lite_greedy"
      || typeof row.model_patch !== "string" || row.model_patch.length === 0
      || !Number.isSafeInteger(row.attempt) || row.attempt < 1 || row.attempt > 10
      || !Number.isFinite(row.temperature)) fail("PREDICTION_ROW_INVALID");
    predictionById.set(row.instance_id, row);
    increment(attemptClasses, row.attempt);
    increment(temperatureClasses, row.temperature);
  }

  const trajectoryDescriptors = verified.manifest.remoteObjects.filter((entry) =>
    entry.source === "s3-submission" && /\/trajs\/[^/]+\.log$/u.test(entry.key));
  const trajectoryById = new Map();
  const responseCountClasses = {};
  const finishReasons = {};
  const upstreamCounts = {};
  const upstreamCommits = new Map();
  let totalApiResponses = 0;
  let trajectoryErrors = 0;
  let trajectoryTracebacks = 0;
  let trajectoriesWithAgentSuccessLanguage = 0;
  let trajectoriesWithPromptLikeAssignmentText = 0;
  for (const descriptor of trajectoryDescriptors) {
    const instanceId = descriptor.key.match(/\/trajs\/([^/]+)\.log$/u)?.[1];
    if (!instanceId || trajectoryById.has(instanceId)) fail("TRAJECTORY_ID_INVALID");
    const parsed = parseTrajectory(instanceId, sourceBytes(sourceDirectory, descriptor));
    trajectoryById.set(instanceId, parsed);
    increment(responseCountClasses, parsed.apiResponses);
    totalApiResponses += parsed.apiResponses;
    for (const reason of parsed.finishReasons) increment(finishReasons, reason);
    increment(upstreamCounts, parsed.owner);
    if (!upstreamCommits.has(parsed.repository)) upstreamCommits.set(parsed.repository, new Set());
    upstreamCommits.get(parsed.repository).add(parsed.baseCommit);
    trajectoryErrors += parsed.errors;
    trajectoryTracebacks += parsed.tracebacks;
    if (parsed.containsAgentSuccessClaim) trajectoriesWithAgentSuccessLanguage += 1;
    if (parsed.containsPromptLikeAssignmentText) {
      trajectoriesWithPromptLikeAssignmentText += 1;
    }
  }
  if (trajectoryById.size !== 300 || !same(upstreamCounts, UPSTREAM_FAMILIES)) {
    fail("TRAJECTORY_CENSUS_INVALID");
  }

  const harnessIds = verified.s3.harnessInstances;
  const harnessSet = new Set(harnessIds);
  let resolvedReports = 0;
  let unresolvedReports = 0;
  let patchApplied = 0;
  let patchNotApplied = 0;
  let exactPredictionPatchBindings = 0;
  let testAssertions = 0;
  let testAssertionsObserved = 0;
  let testOutputsWithTimeoutMarker = 0;
  let testOutputsWithErrorMarker = 0;
  let testOutputsWithFailedText = 0;
  const instanceBindings = [];
  const reportResolvedIds = [];
  for (const instanceId of harnessIds) {
    const base = `${SWEBENCH_AGENTLESS_O3_S3_PREFIX}logs/${instanceId}`;
    const evalDescriptor = descriptorForKey(verified, `${base}/eval.sh`);
    const patchDescriptor = descriptorForKey(verified, `${base}/patch.diff`);
    const reportDescriptor = descriptorForKey(verified, `${base}/report.json`);
    const testDescriptor = descriptorForKey(verified, `${base}/test_output.txt`);
    const evalBytes = sourceBytes(sourceDirectory, evalDescriptor);
    const patchBytes = sourceBytes(sourceDirectory, patchDescriptor);
    const reportBytes = sourceBytes(sourceDirectory, reportDescriptor);
    const testBytes = sourceBytes(sourceDirectory, testDescriptor);
    if (evalBytes.length === 0 || patchBytes.length === 0 || testBytes.length === 0) {
      fail("HARNESS_FILE_EMPTY", instanceId);
    }
    const prediction = predictionById.get(instanceId);
    if (!prediction) fail("HARNESS_PREDICTION_MISSING", instanceId);
    if (Buffer.from(prediction.model_patch, "utf8").equals(patchBytes)) {
      exactPredictionPatchBindings += 1;
    } else fail("PATCH_BINDING_INVALID", instanceId);
    const parsedReport = parseHarnessReport(instanceId, reportBytes);
    if (parsedReport.report.resolved) {
      resolvedReports += 1;
      reportResolvedIds.push(instanceId);
    } else unresolvedReports += 1;
    if (parsedReport.report.patch_successfully_applied) patchApplied += 1;
    else patchNotApplied += 1;
    const testText = stripAnsi(testBytes.toString("utf8"));
    for (const test of parsedReport.tests) {
      testAssertions += 1;
      if (testText.includes(test.name)) testAssertionsObserved += 1;
    }
    if (/Tests Timed Out|timed out|TimeoutError/iu.test(testText)) {
      testOutputsWithTimeoutMarker += 1;
    }
    if (/Tests Errored|ERRORS?\b|Traceback \(most recent call last\)/iu.test(testText)) {
      testOutputsWithErrorMarker += 1;
    }
    if (/\bfailed\b/iu.test(testText)) testOutputsWithFailedText += 1;
    instanceBindings.push({ instanceId,
      predictionPatchHash: swebenchAgentlessO3Sha256(Buffer.from(prediction.model_patch,
        "utf8")), patchHash: patchDescriptor.sha256, reportHash: reportDescriptor.sha256,
      testOutputHash: testDescriptor.sha256, evalScriptHash: evalDescriptor.sha256,
      harnessResolved: parsedReport.report.resolved,
      patchSuccessfullyApplied: parsedReport.report.patch_successfully_applied });
  }
  instanceBindings.sort((left, right) => left.instanceId.localeCompare(right.instanceId));
  reportResolvedIds.sort((left, right) => left.localeCompare(right));

  const trajectoryIds = sorted(trajectoryById.keys());
  const predictionIds = sorted(predictionById.keys());
  const expectedNoGeneration = trajectoryIds.filter((entry) => !predictionById.has(entry));
  const expectedNoHarness = predictionIds.filter((entry) => !harnessSet.has(entry));
  if (!same(predictionIds, harnessIds) || !same(expectedNoHarness, [])
    || !same(expectedNoGeneration, sorted(noGenerationSet))
    || !same(reportResolvedIds, sorted(resolvedSet)) || resolvedReports !== 97
    || unresolvedReports !== 197 || exactPredictionPatchBindings !== 294) {
    fail("TASK_PARTITION_INVALID");
  }

  let predictionAttemptResponseMatches = 0;
  let predictionFinalTemperatureMatches = 0;
  for (const [instanceId, prediction] of predictionById) {
    const trajectory = trajectoryById.get(instanceId);
    if (!trajectory) fail("PREDICTION_TRAJECTORY_MISSING", instanceId);
    if (trajectory.apiResponses === prediction.attempt) predictionAttemptResponseMatches += 1;
    const finalTemperature = trajectory.temperatures.at(-1);
    if (Object.is(finalTemperature, prediction.temperature)
      || Math.abs(finalTemperature - prediction.temperature) < 1e-12) {
      predictionFinalTemperatureMatches += 1;
    }
  }
  const noGenerationResponseClasses = {};
  let noGenerationWithTenResponses = 0;
  for (const instanceId of noGenerationSet) {
    const trajectory = trajectoryById.get(instanceId);
    if (!trajectory) fail("NO_GENERATION_TRAJECTORY_MISSING", instanceId);
    increment(noGenerationResponseClasses, trajectory.apiResponses);
    if (trajectory.apiResponses === 10) noGenerationWithTenResponses += 1;
  }

  const parameters = parseJson(readS3(
    `${SWEBENCH_AGENTLESS_O3_S3_PREFIX}trajs/repair_parameters.json`),
  "repair_parameters.json");
  if (parameters.max_retries !== 10 || parameters.temp !== 0
    || parameters.tool_use !== false || parameters.model !== "o3-mini") {
    fail("REPAIR_PARAMETERS_INVALID");
  }
  const upstreamRepositories = [...upstreamCommits.entries()]
    .map(([repository, commits]) => ({ repository, tasks: [...trajectoryById.values()]
      .filter((entry) => entry.repository === repository).length,
    uniqueBaseCommits: commits.size }))
    .sort((left, right) => left.repository.localeCompare(right.repository));

  const replayBody = {
    schema: "outsider/swebench-agentless-o3-safe-replay/v1",
    files: { githubSubmissionBlobs: 6, s3Objects: 1_478,
      rawPredictionObjects: 1, rawTrajectoryLogs: 300,
      repairParameterObjects: 1, harnessInstances: 294,
      harnessObjects: 1_176, rawContentEmitted: false,
      promptRequestPayloadAvailable: false },
    census: { declaredTasks: 300, trajectoryTasks: 300, predictionTasks: 294,
      harnessTasks: 294, resolved: resolvedReports, unresolved: unresolvedReports,
      noGeneration: expectedNoGeneration.length, noLogs: expectedNoHarness.length,
      completePublishedTaskPartition: true,
      completePublishedPassAtOneSubmissionCensus: true,
      upstreamOpportunityCensusComplete: false },
    generation: { passAtOneDeclared, maxRetriesConfigured: parameters.max_retries,
      predictions: predictions.length, finalPredictionAttemptClasses: attemptClasses,
      finalPredictionTemperatureClasses: temperatureClasses,
      trajectoryApiResponses: totalApiResponses,
      trajectoryResponseCountClasses: responseCountClasses,
      finishReasons, predictionAttemptResponseMatches,
      predictionFinalTemperatureMatches,
      noGenerationResponseClasses, noGenerationWithTenResponses,
      internalGenerationRetriesObserved: Object.keys(attemptClasses)
        .some((entry) => Number(entry) > 1) || noGenerationWithTenResponses > 0,
      internalGenerationRetryIsTaskReexecution: false,
      fullRequestPromptLogged: false,
      modelResponseLogged: true, toolCalls: 0 },
    harness: { reports: 294, resolved: resolvedReports, unresolved: unresolvedReports,
      patchApplied, patchNotApplied, exactPredictionPatchBindings,
      testAssertions, testAssertionsObserved,
      allReportedTestNamesObservedInTestOutput: testAssertions === testAssertionsObserved,
      testOutputsWithTimeoutMarker, testOutputsWithErrorMarker,
      testOutputsWithFailedText,
      instanceBindingHash: digest(
        "outsider/swebench-agentless-o3-instance-bindings/v1", instanceBindings),
      officialHarnessOutcomePresent: true, outcomeIsAgentSelfReport: false,
      harnessSeparatedFromAgentGeneration: true,
      thirdPartyIndependentOutcome: 0 },
    trajectories: { errors: trajectoryErrors, tracebacks: trajectoryTracebacks,
      trajectoriesWithAgentSuccessLanguage,
      trajectoriesWithPromptLikeAssignmentText,
      trajectorySuccessLanguagePromotedToOutcome: false,
      completePromptsAvailable: false, interactiveToolResultSequenceAvailable: false },
    upstream: { repositoryFamilies: upstreamRepositories.length,
      familyTaskCounts: upstreamCounts, repositories: upstreamRepositories,
      heterogeneousRepositoryRights: true,
      perTaskLicenseAdjudicationComplete: false },
    metadata: { gitMetadataAssetsNull: assetsNullInGitMetadata,
      s3ArtifactsCommitHashBound: false,
      s3ObjectKeysEtagsLastModifiedAndLocalSha256Bound: true },
    anomalies: { invalidPredictionRows: 0, missingTrajectoryTasks: 0,
      missingPredictionHarnessPairs: 0, missingNoGenerationTrajectories: 0,
      patchBindingMismatches: 0, reportResolvedSetMismatches: 0 },
  };
  return { ...replayBody, replayHash: digest(
    "outsider/swebench-agentless-o3-safe-replay/v1", replayBody) };
}

export function swebenchAgentlessO3ArtifactHash(body) {
  return digest("outsider/swebench-agentless-o3-artifact/v1", body);
}

function buildBody(verified, replay) {
  return {
    schema: SWEBENCH_AGENTLESS_O3_AUDIT_SCHEMA,
    status: "QUARANTINE_EVALUATION_ONLY",
    admission: "QUARANTINE_EVAL",
    frozenAt: SWEBENCH_AGENTLESS_O3_FROZEN_AT,
    source: { repository: SWEBENCH_AGENTLESS_O3_REPOSITORY,
      revision: SWEBENCH_AGENTLESS_O3_REVISION,
      submission: SWEBENCH_AGENTLESS_O3_SUBMISSION,
      submissionTree: SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE,
      s3Prefix: SWEBENCH_AGENTLESS_O3_S3_PREFIX,
      s3VersionIdAvailable: false,
      s3InventoryHash: SWEBENCH_AGENTLESS_O3_S3_INVENTORY_HASH,
      sourceRoot: verified.manifest.sourceRoot,
      sourceManifestHash: verified.manifest.manifestHash },
    replay,
    outcome: { officialHarnessResolvedSignal: true,
      harnessSeparatedFromAgentGeneration: true,
      agentSelfReportedSuccessUsed: false,
      thirdPartyIndependentOutcome: 0,
      realWorldOutcome: 0, longitudinalOutcome: 0 },
    recovery: { internalValidPatchGenerationRetriesObserved: true,
      internalRetryPromotedToExecutionRecovery: false,
      postHarnessFailureRecoveryExecutionPresent: false,
      recoveryEvidence: false },
    completeness: { completePublishedSubmissionPrefixBytes: true,
      completePublished300TaskPassAtOneCensus: true,
      failuresAndNoGenerationRetained: true,
      completeUpstreamOpportunityCensus: false,
      completePromptCorpus: false,
      completeInteractiveToolCallResultTrace: false },
    rights: { submissionRepositoryDetectedLicense: null,
      submissionRepositoryLicenseFilePresent: false,
      linkedAgentCodeRepository: SWEBENCH_AGENTLESS_O3_LINKED_CODE_REPOSITORY,
      linkedAgentCodeLicenseAtSeparatePinnedRevision: "MIT",
      linkedCodeLicensePromotedToSubmissionArtifacts: false,
      upstreamRepositoryFamilies: 12,
      upstreamRepositoryRightsHeterogeneous: true,
      perTaskUpstreamLicenseAdjudicationComplete: false,
      trainingRightsEstablished: false, productionTrainingAllowed: false,
      rightsDisposition: "FAIL_CLOSED" },
    privacy: { rawModelResponsesAcquired: true, rawSourcePatchesAcquired: true,
      rawTestOutputAcquired: true, rawContentStoredPrivate0600: true,
      rawContentRepublishedInReport: false, noPiiGuaranteePresent: false,
      privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false },
    boundary: { training: 0, network: 0, authority: 0, action: 0,
      effect: 0, ceu: 0, pricing: 0, credit: 0, delegation: 0,
      opportunity: 0, independentOutcome: 0, longitudinal: 0 },
  };
}

export function buildSwebenchAgentlessO3AuditFromSource(sourceDirectory) {
  const verified = verifySwebenchAgentlessO3SourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runSwebenchAgentlessO3Replay(sourceDirectory);
  const body = buildBody(verified, replay);
  return { ...body, artifactHash: swebenchAgentlessO3ArtifactHash(body) };
}

function zeroBoundary(value) {
  return plain(value) && Object.values(value).every((entry) => entry === 0);
}

export function verifySwebenchAgentlessO3Audit(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== SWEBENCH_AGENTLESS_O3_AUDIT_SCHEMA
      || artifact.status !== "QUARANTINE_EVALUATION_ONLY"
      || artifact.admission !== "QUARANTINE_EVAL"
      || artifact.frozenAt !== SWEBENCH_AGENTLESS_O3_FROZEN_AT
      || !HASH.test(artifact.artifactHash ?? "") || !plain(artifact.replay)) {
      fail("ARTIFACT_INVALID");
    }
    const { replayHash, ...replayBody } = artifact.replay;
    if (replayHash !== digest("outsider/swebench-agentless-o3-safe-replay/v1",
      replayBody) || replayHash !== SWEBENCH_AGENTLESS_O3_REPLAY_HASH) {
      fail("REPLAY_HASH_INVALID");
    }
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== swebenchAgentlessO3ArtifactHash(body)) {
      fail("ARTIFACT_HASH_INVALID");
    }
    if (artifact.source.repository !== SWEBENCH_AGENTLESS_O3_REPOSITORY
      || artifact.source.revision !== SWEBENCH_AGENTLESS_O3_REVISION
      || artifact.source.submissionTree !== SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE
      || artifact.source.s3VersionIdAvailable !== false
      || artifact.source.s3InventoryHash !== SWEBENCH_AGENTLESS_O3_S3_INVENTORY_HASH
      || artifact.replay.census.declaredTasks !== 300
      || artifact.replay.census.trajectoryTasks !== 300
      || artifact.replay.census.predictionTasks !== 294
      || artifact.replay.census.harnessTasks !== 294
      || artifact.replay.census.resolved !== 97
      || artifact.replay.census.unresolved !== 197
      || artifact.replay.census.noGeneration !== 6
      || artifact.replay.census.noLogs !== 0
      || artifact.replay.census.completePublishedTaskPartition !== true
      || artifact.replay.generation.passAtOneDeclared !== true
      || artifact.replay.generation.internalGenerationRetriesObserved !== true
      || artifact.replay.generation.internalGenerationRetryIsTaskReexecution !== false
      || artifact.replay.generation.fullRequestPromptLogged !== false
      || artifact.replay.generation.predictionAttemptResponseMatches !== 294
      || artifact.replay.generation.predictionFinalTemperatureMatches !== 294
      || artifact.replay.harness.exactPredictionPatchBindings !== 294
      || artifact.replay.harness.reports !== 294
      || artifact.replay.harness.resolved !== 97
      || artifact.replay.harness.unresolved !== 197
      || artifact.replay.harness.outcomeIsAgentSelfReport !== false
      || artifact.replay.harness.thirdPartyIndependentOutcome !== 0
      || artifact.replay.metadata.s3ArtifactsCommitHashBound !== false
      || artifact.replay.metadata.s3ObjectKeysEtagsLastModifiedAndLocalSha256Bound !== true
      || artifact.replay.upstream.repositoryFamilies !== 12
      || artifact.replay.upstream.perTaskLicenseAdjudicationComplete !== false
      || artifact.outcome.officialHarnessResolvedSignal !== true
      || artifact.outcome.agentSelfReportedSuccessUsed !== false
      || artifact.outcome.thirdPartyIndependentOutcome !== 0
      || artifact.outcome.realWorldOutcome !== 0
      || artifact.recovery.internalRetryPromotedToExecutionRecovery !== false
      || artifact.recovery.recoveryEvidence !== false
      || artifact.completeness.completePublished300TaskPassAtOneCensus !== true
      || artifact.completeness.completeUpstreamOpportunityCensus !== false
      || artifact.completeness.completePromptCorpus !== false
      || artifact.rights.submissionRepositoryDetectedLicense !== null
      || artifact.rights.linkedAgentCodeLicenseAtSeparatePinnedRevision !== "MIT"
      || artifact.rights.linkedCodeLicensePromotedToSubmissionArtifacts !== false
      || artifact.rights.trainingRightsEstablished !== false
      || artifact.rights.productionTrainingAllowed !== false
      || artifact.rights.rightsDisposition !== "FAIL_CLOSED"
      || artifact.privacy.rawContentStoredPrivate0600 !== true
      || artifact.privacy.rawContentRepublishedInReport !== false
      || artifact.privacy.noPiiGuaranteePresent !== false
      || !zeroBoundary(artifact.boundary)) fail("BOUNDARY_INVALID");
    return { ok: true, artifactHash,
      verificationLevel: "SAFE_AGGREGATE_SWEBENCH_AGENTLESS_O3_AUDIT" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifySwebenchAgentlessO3AuditWithSource(artifact, sourceDirectory) {
  const standalone = verifySwebenchAgentlessO3Audit(artifact);
  if (!standalone.ok) return standalone;
  const source = verifySwebenchAgentlessO3SourceDirectory(sourceDirectory);
  if (!source.ok) return source;
  try {
    const rebuilt = buildSwebenchAgentlessO3AuditFromSource(sourceDirectory);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: source.manifest.manifestHash,
      sourceRoot: source.manifest.sourceRoot,
      verificationLevel:
        "FULL_SWEBENCH_TRAJECTORY_PREDICTION_PATCH_REPORT_TEST_OUTPUT_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
