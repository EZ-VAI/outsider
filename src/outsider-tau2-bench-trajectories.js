/*
 * Complete pinned intake for AgentSuite/tau2-bench-trajectories. Raw dialogue
 * remains in private source files; the report contains aggregate structure,
 * task coverage, tool-call, anomaly, and publisher-evaluator statistics only.
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

export const TAU2_TRAJECTORIES_ID = "AgentSuite/tau2-bench-trajectories";
export const TAU2_TRAJECTORIES_REVISION =
  "07264f1d253a618fc20966670eddc44246212916";
export const TAU2_TRAJECTORIES_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const TAU2_TRAJECTORIES_SOURCE_SCHEMA =
  "outsider/tau2-bench-trajectories-source/v1";
export const TAU2_TRAJECTORIES_AUDIT_SCHEMA =
  "outsider/tau2-bench-trajectories-audit/v1";
export const TAU2_TRAJECTORIES_TREE_HASH =
  "sha256:bf59893c773c10cc161396f086702d9ec37fba23b1c1c4162da44c4163824fa3";
export const TAU2_TRAJECTORIES_REPLAY_HASH =
  "sha256:b2246c0d4e014f1d79cf82463de7d2100383bec6cf91a73c088da8ab4f2dabc9";

export const TAU2_MODEL_NAMES = Object.freeze([
  "DeepSeek-R1-0528",
  "DeepSeek-V3-0324",
  "DeepSeek-V3.2-Exp-thinking-off",
  "DeepSeek-V3.2-Exp-thinking-on",
  "Kimi-K2-Instruct",
  "Kimi-K2-Instruct-0905",
  "Qwen3-235B-A22B-FP8",
  "Qwen3-235B-A22B-Instruct-2507-FP8",
  "Qwen3-235B-A22B-Thinking-2507-FP8",
  "Qwen3-Coder-480B-A35B-Instruct-FP8",
  "claude-4-opus-thinking-off",
  "claude-4-opus-thinking-on-10k",
  "claude-4-sonnet-thinking-off",
  "claude-4-sonnet-thinking-on-10k",
  "claude-4.5-sonnet-thinking-off",
  "claude-4.5-sonnet-thinking-on-10k",
  "gemini-2.5-flash-thinking-off",
  "gemini-2.5-flash-thinking-on",
  "gemini-2.5-pro-thinking-on",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  "gpt-4o-20240806",
  "gpt-4o-mini",
  "gpt-5",
  "gpt-5-nano",
  "gpt-oss-120b",
  "gpt-oss-20b",
  "o3-high",
  "o4-mini-high",
]);

export const TAU2_TRAJECTORIES_PROFILE = Object.freeze({
  usedStorage: 69_072_767,
  treeEntries: 32,
  treeFiles: 32,
  treeBytes: 289_780_557,
  jsonlFiles: 30,
  jsonlBytes: 289_776_373,
  lfsFiles: 5,
  lfsBytes: 69_072_767,
  readmeBytes: 1_409,
  gitattributesBytes: 2_775,
  models: 30,
  cardClaimedTasksPerModel: 278,
  cardClaimedRows: 8_340,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;

function fail(code, detail = null) {
  throw new Error(detail === null ? `TAU2_TRAJECTORIES_${code}`
    : `TAU2_TRAJECTORIES_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function tau2TrajectoriesSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return tau2TrajectoriesSha256(Buffer.from(
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
  return typeof value === "string" && value.length > 0 && value.length <= 2048
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function endpoints() {
  const encoded = TAU2_TRAJECTORIES_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${TAU2_TRAJECTORIES_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${TAU2_TRAJECTORIES_REVISION}`
      + "?recursive=true&expand=false&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${TAU2_TRAJECTORIES_REVISION}`,
  };
}

function validateRepository(value) {
  if (!plain(value) || !Array.isArray(value.siblings) || !plain(value.cardData)) {
    fail("REPOSITORY_INVALID");
  }
  const paths = value.siblings.map((entry) => entry?.rfilename)
    .sort((left, right) => left.localeCompare(right));
  if (value.id !== TAU2_TRAJECTORIES_ID || value.sha !== TAU2_TRAJECTORIES_REVISION
    || value.private !== false || value.gated !== false || value.disabled !== false
    || value.usedStorage !== TAU2_TRAJECTORIES_PROFILE.usedStorage
    || value.cardData.pretty_name !== "tau2-bench agent trajectories"
    || Object.prototype.hasOwnProperty.call(value.cardData, "license")
    || paths.length !== 32 || paths.some((entry) => !safeRemotePath(entry))) {
    fail("REPOSITORY_PROFILE_INVALID");
  }
  return { id: value.id, sha: value.sha, private: value.private,
    gated: value.gated, disabled: value.disabled, usedStorage: value.usedStorage,
    cardLicense: null, prettyName: value.cardData.pretty_name,
    siblingPaths: paths };
}

function validateTree(raw) {
  if (!Array.isArray(raw) || raw.length !== TAU2_TRAJECTORIES_PROFILE.treeEntries) {
    fail("TREE_INVALID");
  }
  const projection = raw.map((entry) => {
    if (!plain(entry) || entry.type !== "file" || !safeRemotePath(entry.path)
      || !SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size)
      || entry.size < 0) fail("TREE_ENTRY_INVALID");
    if (entry.lfs == null) return { type: "file", path: entry.path,
      oid: entry.oid, sizeBytes: entry.size, lfsSha256: null };
    if (!plain(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
      || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID");
    return { type: "file", path: entry.path, oid: entry.oid,
      sizeBytes: entry.size, lfsSha256: `sha256:${entry.lfs.oid}` };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const jsonl = projection.filter((entry) => entry.path.endsWith(".jsonl"));
  const lfs = projection.filter((entry) => entry.lfsSha256 !== null);
  const models = jsonl.map((entry) => entry.path.slice(0, -6))
    .sort((left, right) => left.localeCompare(right));
  const treeHash = digest("outsider/tau2-full-tree/v1", projection);
  if (treeHash !== TAU2_TRAJECTORIES_TREE_HASH
    || projection.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== 289_780_557
    || jsonl.length !== 30
    || jsonl.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== 289_776_373
    || lfs.length !== 5
    || lfs.reduce((sum, entry) => sum + entry.sizeBytes, 0) !== 69_072_767
    || projection.find((entry) => entry.path === "README.md")?.sizeBytes !== 1_409
    || projection.find((entry) => entry.path === ".gitattributes")?.sizeBytes !== 2_775
    || projection.some((entry) => /^LICENSE(?:\.|$)/iu.test(entry.path))
    || !same(models, [...TAU2_MODEL_NAMES].sort((left, right) =>
      left.localeCompare(right)))) fail("TREE_PROFILE_INVALID");
  return { projection, files: projection, models, treeHash,
    profile: { entries: 32, files: 32, bytes: 289_780_557,
      jsonlFiles: 30, jsonlBytes: 289_776_373,
      lfsFiles: 5, lfsBytes: 69_072_767,
      repositoryLicenseFilePresent: false } };
}

function permittedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === ""
      && parsed.password === "" && (parsed.hostname === "huggingface.co"
        || parsed.hostname.endsWith(".hf.co")
        || parsed.hostname.endsWith(".xethub.hf.co"));
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
  const timer = setTimeout(() => controller.abort(), 240_000);
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "follow",
      signal: controller.signal });
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
    if (Number.isFinite(declared) && declared > maximumBytes) fail("CONTENT_LENGTH_EXCEEDED");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) fail("BODY_BYTES_EXCEEDED");
    return { bytes, finalUrl, status: response.status,
      contentType: response.headers?.get?.("content-type") ?? null,
      link: response.headers?.get?.("link") ?? null };
  } finally { clearTimeout(timer); }
}

async function boundedFetch(url, maximumBytes, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { return await fetchOnce(url, maximumBytes, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
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

function safeJoin(root, relative) {
  if (!safeRemotePath(relative)) fail("PATH_INVALID", relative);
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(root, ...relative.split("/"));
  if (!resolved.startsWith(`${resolvedRoot}${path.sep}`)) fail("PATH_ESCAPE", relative);
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

async function fetchJson(url, fetchImpl) {
  const value = await boundedFetch(url, 16 * 1024 * 1024, fetchImpl);
  return { ...value, parsed: parseJson(value.bytes, url) };
}

async function capturePhase(root, phase, fetchImpl) {
  const endpoint = endpoints();
  const [repository, tree] = await Promise.all([
    fetchJson(endpoint.repository, fetchImpl), fetchJson(endpoint.tree, fetchImpl),
  ]);
  const repositoryProjection = validateRepository(repository.parsed);
  const treeProjection = validateTree(tree.parsed);
  if (!same(repositoryProjection.siblingPaths,
    treeProjection.files.map((entry) => entry.path))) fail("REPOSITORY_TREE_MISMATCH");
  return [{ kind: "repository", value: repository, requestUrl: endpoint.repository },
    { kind: "tree-page-001", value: tree, requestUrl: endpoint.tree }]
    .map((entry) => {
      const file = `api/${phase}/${entry.kind}.json`;
      writePrivateOnce(safeJoin(root, file), entry.value.bytes);
      return { phase, kind: entry.kind, file, requestUrl: entry.requestUrl,
        finalUrl: entry.value.finalUrl, status: entry.value.status,
        contentType: entry.value.contentType, link: entry.value.link,
        bytes: entry.value.bytes.length,
        sha256: tau2TrajectoriesSha256(entry.value.bytes) };
    });
}

async function downloadObject(root, entry, fetchImpl) {
  const url = `${endpoints().raw}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const response = await boundedFetch(url, entry.sizeBytes + 1, fetchImpl);
  const sha256 = tau2TrajectoriesSha256(response.bytes);
  if (response.bytes.length !== entry.sizeBytes
    || (entry.lfsSha256 === null ? gitBlobOid(response.bytes) !== entry.oid
      : sha256 !== entry.lfsSha256)) fail("OBJECT_INVALID", entry.path);
  const file = `objects/${entry.path}`;
  writePrivateOnce(safeJoin(root, file), response.bytes);
  return { datasetId: TAU2_TRAJECTORIES_ID, revision: TAU2_TRAJECTORIES_REVISION,
    path: entry.path, file, requestUrl: url, finalUrl: response.finalUrl,
    status: response.status, contentType: response.contentType,
    bytes: response.bytes.length, sha256, gitOid: entry.oid,
    lfsSha256: entry.lfsSha256 };
}

async function downloadPool(root, entries, fetchImpl, concurrency = 6) {
  const output = new Array(entries.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= entries.length) return;
      output[index] = await downloadObject(root, entries[index], fetchImpl);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, entries.length) }, worker));
  return output.sort((left, right) => left.file.localeCompare(right.file));
}

function rootProjection(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots, ...remoteObjects].map((entry) => ({
    file: entry.file, bytes: entry.bytes, sha256: entry.sha256,
  })).sort((left, right) => left.file.localeCompare(right.file));
  return { files, sourceRoot: digest("outsider/tau2-source-root/v1", files) };
}

export async function acquirePinnedTau2TrajectoriesSource(sourceDirectory,
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
    const before = await capturePhase(temporary, "before", fetchImpl);
    const treeBefore = validateTree(parseJson(readFileSync(path.join(temporary,
      "api/before/tree-page-001.json")), "tree-before"));
    const remoteObjects = await downloadPool(temporary, treeBefore.files, fetchImpl,
      options.downloadConcurrency ?? 6);
    const after = await capturePhase(temporary, "after", fetchImpl);
    const repositoryBefore = validateRepository(parseJson(readFileSync(path.join(temporary,
      "api/before/repository.json")), "repository-before"));
    const repositoryAfter = validateRepository(parseJson(readFileSync(path.join(temporary,
      "api/after/repository.json")), "repository-after"));
    const treeAfter = validateTree(parseJson(readFileSync(path.join(temporary,
      "api/after/tree-page-001.json")), "tree-after"));
    if (!same(repositoryBefore, repositoryAfter)
      || !same(treeBefore.projection, treeAfter.projection)) fail("SOURCE_DRIFT");
    const apiSnapshots = [...before, ...after]
      .sort((left, right) => left.file.localeCompare(right.file));
    const rooted = rootProjection(apiSnapshots, remoteObjects);
    const body = { schema: TAU2_TRAJECTORIES_SOURCE_SCHEMA,
      frozenAt: TAU2_TRAJECTORIES_FROZEN_AT, apiSnapshots, remoteObjects,
      sourceFiles: rooted.files, sourceRoot: rooted.sourceRoot,
      closure: { selectedObjects: 32, selectedBytes: 289_780_557,
        completeRepositoryBytes: true,
        completeRecursiveTreeCapturedBeforeAndAfter: true,
        recursiveTreePagesPerPhase: 1,
        recursiveTreeEntries: 32, recursiveTreeFiles: 32,
        recursiveTreeBytes: 289_780_557,
        recursiveTreeHash: TAU2_TRAJECTORIES_TREE_HASH,
        jsonlObjects: 30, jsonlBytes: 289_776_373,
        readmeObjects: 1, gitattributesObjects: 1,
        excludedObjects: 0, excludedBytes: 0,
        rawDialogueStoredPrivate: true } };
    const manifest = { ...body,
      manifestHash: digest("outsider/tau2-source-manifest/v1", body) };
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
  if (stat.isSymbolicLink() || !stat.isFile()) fail("FILE_UNSAFE", file);
  const bytes = readFileSync(file);
  if (bytesExpected !== null && bytes.length !== bytesExpected) fail("FILE_SIZE_INVALID");
  return bytes;
}

function walk(root) {
  const files = [];
  const queue = [root];
  while (queue.length) {
    const directory = queue.shift();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
      if (entry.isDirectory()) queue.push(child);
      else if (entry.isFile()) files.push(path.relative(root, child).split(path.sep).join("/"));
      else fail("SPECIAL_FILE_REFUSED", child);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function verifyTau2TrajectoriesSourceDirectory(sourceDirectory) {
  try {
    const manifest = parseJson(readRegular(path.join(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== TAU2_TRAJECTORIES_SOURCE_SCHEMA
      || manifest.frozenAt !== TAU2_TRAJECTORIES_FROZEN_AT
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 4
      || !Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 32
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")) {
      fail("MANIFEST_INVALID");
    }
    const snapshots = {};
    for (const descriptor of manifest.apiSnapshots) {
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      if (tau2TrajectoriesSha256(bytes) !== descriptor.sha256) fail("SNAPSHOT_HASH_INVALID");
      snapshots[`${descriptor.phase}:${descriptor.kind}`] = parseJson(bytes, descriptor.file);
    }
    const rb = validateRepository(snapshots["before:repository"]);
    const ra = validateRepository(snapshots["after:repository"]);
    if (!same(rb, ra)) fail("REPOSITORY_DRIFT");
    const before = validateTree(snapshots["before:tree-page-001"]);
    const after = validateTree(snapshots["after:tree-page-001"]);
    if (!same(before.projection, after.projection)) fail("TREE_DRIFT");
    if (!same(rb.siblingPaths, before.files.map((entry) => entry.path))) {
      fail("TREE_SIBLING_MISMATCH");
    }
    if (!same(before.files.map((entry) => entry.path),
      manifest.remoteObjects.map((entry) => entry.path).sort((left, right) =>
        left.localeCompare(right)))) fail("REMOTE_SET_INVALID");
    for (const descriptor of manifest.remoteObjects) {
      const entry = before.files.find((value) => value.path === descriptor.path);
      if (!entry || descriptor.datasetId !== TAU2_TRAJECTORIES_ID
        || descriptor.revision !== TAU2_TRAJECTORIES_REVISION
        || descriptor.file !== `objects/${entry.path}` || descriptor.bytes !== entry.sizeBytes
        || descriptor.gitOid !== entry.oid || descriptor.lfsSha256 !== entry.lfsSha256) {
        fail("REMOTE_DESCRIPTOR_INVALID");
      }
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      const sha256 = tau2TrajectoriesSha256(bytes);
      if (descriptor.sha256 !== sha256
        || (entry.lfsSha256 === null ? gitBlobOid(bytes) !== entry.oid
          : sha256 !== entry.lfsSha256)) fail("REMOTE_HASH_INVALID");
    }
    const rooted = rootProjection(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles) || rooted.sourceRoot !== manifest.sourceRoot) {
      fail("SOURCE_ROOT_INVALID");
    }
    const expectedClosure = { selectedObjects: 32, selectedBytes: 289_780_557,
      completeRepositoryBytes: true,
      completeRecursiveTreeCapturedBeforeAndAfter: true,
      recursiveTreePagesPerPhase: 1, recursiveTreeEntries: 32,
      recursiveTreeFiles: 32, recursiveTreeBytes: 289_780_557,
      recursiveTreeHash: TAU2_TRAJECTORIES_TREE_HASH,
      jsonlObjects: 30, jsonlBytes: 289_776_373,
      readmeObjects: 1, gitattributesObjects: 1,
      excludedObjects: 0, excludedBytes: 0,
      rawDialogueStoredPrivate: true };
    if (!same(manifest.closure, expectedClosure)) fail("CLOSURE_INVALID");
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"].sort((left, right) => left.localeCompare(right));
    if (!same(walk(sourceDirectory), expectedFiles)) fail("FILE_CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/tau2-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    return { ok: true, manifest,
      verificationLevel: "PINNED_COMPLETE_TAU2_TRAJECTORY_REPOSITORY_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, os, sys

root = os.path.join(sys.argv[1], "objects")
expected_top = {"model_path", "user_model_path", "benchmark_name", "task_name",
  "sampling_params", "user_sampling_params", "messages", "eval_result", "meta"}
expected_eval = {"db_match", "score"}
expected_meta = {"agent_cost", "duration_seconds", "finish_reason", "id",
  "is_correct", "reward_details", "run_timestamp", "simulation_end_time",
  "simulation_start_time", "source_file", "task_description",
  "task_instructions", "user_cost"}
expected_call = {"arguments", "id", "name", "requestor"}

def type_name(value):
    if value is None: return "null"
    if isinstance(value, bool): return "bool"
    if isinstance(value, int): return "int"
    if isinstance(value, float): return "float"
    if isinstance(value, str): return "str"
    if isinstance(value, list): return "list"
    if isinstance(value, dict): return "dict"
    return type(value).__name__

def numeric_class(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return type_name(value)
    if not math.isfinite(float(value)):
        return "nonfinite"
    if float(value) == 0.0: return "0"
    if float(value) == 1.0: return "1"
    return "other"

def counter_dict(value):
    return {str(key): count for key, count in sorted(value.items(), key=lambda item: str(item[0]))}

jsonl_paths = sorted(name for name in os.listdir(root) if name.endswith(".jsonl"))
if len(jsonl_paths) != 30:
    raise RuntimeError("TAU2_REPLAY_JSONL_FILE_COUNT_INVALID")

readme = open(os.path.join(root, "README.md"), "r", encoding="utf-8").read()
if ("Models: **30**" not in readme or "Tasks per model: **278**" not in readme
    or "one JSON object per line" not in readme):
    raise RuntimeError("TAU2_REPLAY_README_PROFILE_INVALID")
if "license:" in readme.split("---", 2)[1].lower():
    raise RuntimeError("TAU2_REPLAY_UNEXPECTED_CARD_LICENSE")

per_model = []
task_sets = {}
content_task_sets = {}
content_task_multisets = {}
global_roles = collections.Counter()
global_content_types = collections.Counter()
global_message_keysets = collections.Counter()
global_tool_call_keysets = collections.Counter()
global_eval_scores = collections.Counter()
global_db_match = collections.Counter()
global_is_correct = collections.Counter()
global_finish_reasons = collections.Counter()
global_top_keysets = collections.Counter()
total_rows = total_messages = total_tool_calls = total_tool_messages = 0
total_multi_call_messages = total_reward_field_rows = total_reward_details_rows = 0
total_invalid_json = total_schema_anomalies = 0
total_score_correct_disagreement = total_score_db_disagreement = 0
total_correct_db_disagreement = 0

for filename in jsonl_paths:
    model = filename[:-6]
    file_path = os.path.join(root, filename)
    file_sha = hashlib.sha256()
    rows = 0
    parsed_rows = 0
    invalid_json = 0
    non_object = 0
    expected_schema_rows = 0
    task_identity_invalid = 0
    task_ids = []
    content_task_ids = []
    messages_invalid = 0
    message_objects_invalid = 0
    eval_invalid = 0
    meta_invalid = 0
    tool_calls_invalid = 0
    tool_call_objects_invalid = 0
    model_path_distinct = set()
    user_model_path_distinct = set()
    roles = collections.Counter()
    content_types = collections.Counter()
    message_keysets = collections.Counter()
    tool_call_keysets = collections.Counter()
    eval_scores = collections.Counter()
    db_match = collections.Counter()
    is_correct = collections.Counter()
    finish_reasons = collections.Counter()
    message_count = 0
    tool_call_messages = 0
    tool_calls = 0
    tool_messages = 0
    multi_call_messages = 0
    null_contents = 0
    reward_field_rows = 0
    reward_details_rows = 0
    score_correct_disagreement = 0
    score_db_disagreement = 0
    top_keysets = collections.Counter()
    eval_keysets = collections.Counter()
    meta_keysets = collections.Counter()
    reward_detail_keysets = collections.Counter()
    minimum_messages = None
    maximum_messages = 0

    with open(file_path, "rb") as raw_handle:
        for raw_line in raw_handle:
            file_sha.update(raw_line)
            if not raw_line.strip():
                continue
            rows += 1
            try:
                row = json.loads(raw_line)
            except Exception:
                invalid_json += 1
                continue
            parsed_rows += 1
            if not isinstance(row, dict):
                non_object += 1
                continue
            keys = frozenset(row.keys())
            top_keysets[",".join(sorted(keys))] += 1
            global_top_keysets[",".join(sorted(keys))] += 1
            expected_schema_rows += int(keys == expected_top)
            reward_field_rows += int("reward" in row)
            if isinstance(row.get("model_path"), str): model_path_distinct.add(row["model_path"])
            if isinstance(row.get("user_model_path"), str):
                user_model_path_distinct.add(row["user_model_path"])

            meta = row.get("meta")
            if not isinstance(meta, dict):
                meta_invalid += 1
                meta = {}
            meta_keysets[",".join(sorted(meta.keys()))] += 1
            task_name = row.get("task_name")
            task_id = meta.get("id")
            if isinstance(task_name, str) and isinstance(task_id, str):
                task_ids.append((task_name, task_id))
            else:
                task_identity_invalid += 1
            task_description = meta.get("task_description")
            task_instructions = meta.get("task_instructions")
            if (isinstance(task_name, str) and isinstance(task_description, dict)
                and isinstance(task_instructions, dict)):
                task_projection = {"task_name": task_name,
                  "task_description": task_description,
                  "task_instructions": task_instructions}
                content_task_ids.append(hashlib.sha256(json.dumps(task_projection,
                  sort_keys=True, separators=(",", ":"), ensure_ascii=False)
                  .encode("utf-8")).hexdigest())
            else:
                task_identity_invalid += 1
            correct_value = meta.get("is_correct")
            correct_key = str(correct_value) if isinstance(correct_value, bool) else type_name(correct_value)
            is_correct[correct_key] += 1
            global_is_correct[correct_key] += 1
            finish = meta.get("finish_reason")
            finish_key = finish if isinstance(finish, str) and len(finish) <= 64 else type_name(finish)
            finish_reasons[finish_key] += 1
            global_finish_reasons[finish_key] += 1
            reward_details = meta.get("reward_details")
            if isinstance(reward_details, dict):
                reward_details_rows += 1
                reward_detail_keysets[",".join(sorted(reward_details.keys()))] += 1

            evaluation = row.get("eval_result")
            if not isinstance(evaluation, dict):
                eval_invalid += 1
                evaluation = {}
            eval_keysets[",".join(sorted(evaluation.keys()))] += 1
            score_key = numeric_class(evaluation.get("score"))
            eval_scores[score_key] += 1
            global_eval_scores[score_key] += 1
            db_value = evaluation.get("db_match")
            db_key = str(db_value) if isinstance(db_value, bool) else type_name(db_value)
            db_match[db_key] += 1
            global_db_match[db_key] += 1
            if score_key in ("0", "1") and isinstance(correct_value, bool):
                score_correct_disagreement += int((score_key == "1") != correct_value)
            if score_key in ("0", "1") and isinstance(db_value, bool):
                score_db_disagreement += int((score_key == "1") != db_value)
            if isinstance(correct_value, bool) and isinstance(db_value, bool):
                total_correct_db_disagreement += int(correct_value != db_value)

            messages = row.get("messages")
            if not isinstance(messages, list):
                messages_invalid += 1
                continue
            message_count += len(messages)
            minimum_messages = len(messages) if minimum_messages is None else min(
              minimum_messages, len(messages))
            maximum_messages = max(maximum_messages, len(messages))
            for message in messages:
                if not isinstance(message, dict):
                    message_objects_invalid += 1
                    continue
                message_key = ",".join(sorted(message.keys()))
                message_keysets[message_key] += 1
                global_message_keysets[message_key] += 1
                role = message.get("role")
                role_key = role if isinstance(role, str) and len(role) <= 32 else type_name(role)
                roles[role_key] += 1
                global_roles[role_key] += 1
                content_key = f"{role_key}|{type_name(message.get('content'))}"
                content_types[content_key] += 1
                global_content_types[content_key] += 1
                null_contents += int(message.get("content") is None)
                tool_messages += int(role == "tool")
                calls = message.get("tool_calls")
                if calls is None:
                    continue
                if not isinstance(calls, list):
                    tool_calls_invalid += 1
                    continue
                tool_call_messages += 1
                multi_call_messages += int(len(calls) > 1)
                tool_calls += len(calls)
                for call in calls:
                    if not isinstance(call, dict):
                        tool_call_objects_invalid += 1
                        continue
                    call_key = ",".join(sorted(call.keys()))
                    tool_call_keysets[call_key] += 1
                    global_tool_call_keysets[call_key] += 1
                    if set(call) != expected_call or not isinstance(call.get("arguments"), dict):
                        tool_call_objects_invalid += 1

    unique_tasks = set(task_ids)
    unique_content_tasks = set(content_task_ids)
    content_task_multiset = collections.Counter(content_task_ids)
    duplicate_tasks = len(task_ids) - len(unique_tasks)
    anomalies = (invalid_json + non_object + (rows - expected_schema_rows)
      + task_identity_invalid + messages_invalid + message_objects_invalid
      + eval_invalid + meta_invalid + tool_calls_invalid + tool_call_objects_invalid)
    total_rows += rows
    total_messages += message_count
    total_tool_calls += tool_calls
    total_tool_messages += tool_messages
    total_multi_call_messages += multi_call_messages
    total_reward_field_rows += reward_field_rows
    total_reward_details_rows += reward_details_rows
    total_invalid_json += invalid_json
    total_schema_anomalies += anomalies
    total_score_correct_disagreement += score_correct_disagreement
    total_score_db_disagreement += score_db_disagreement
    task_sets[model] = unique_tasks
    content_task_sets[model] = unique_content_tasks
    content_task_multisets[model] = content_task_multiset
    per_model.append({
      "model": model, "file": filename,
      "fileBytes": os.path.getsize(file_path),
      "fileSha256": "sha256:" + file_sha.hexdigest(),
      "rows": rows, "parsedRows": parsed_rows,
      "uniqueTaskIdentities": len(unique_tasks),
      "uniqueContentTaskSignatures": len(unique_content_tasks),
      "contentTaskSignatureRows": len(content_task_ids),
      "duplicateContentTaskSignatureRows": len(content_task_ids) - len(unique_content_tasks),
      "duplicateTaskIdentities": duplicate_tasks,
      "modelPathDistinctValues": len(model_path_distinct),
      "userModelPathDistinctValues": len(user_model_path_distinct),
      "messages": {"total": message_count,
        "minimumPerTrajectory": 0 if minimum_messages is None else minimum_messages,
        "maximumPerTrajectory": maximum_messages,
        "roles": counter_dict(roles), "contentTypes": counter_dict(content_types),
        "messageKeysets": counter_dict(message_keysets),
        "toolCallMessages": tool_call_messages, "toolCalls": tool_calls,
        "toolResultMessages": tool_messages,
        "multiToolCallMessages": multi_call_messages,
        "nullContentMessages": null_contents,
        "toolCallKeysets": counter_dict(tool_call_keysets)},
      "publisherEvaluation": {"evalResultKeysets": counter_dict(eval_keysets),
        "scoreClasses": counter_dict(eval_scores),
        "dbMatchClasses": counter_dict(db_match),
        "metaIsCorrectClasses": counter_dict(is_correct),
        "scoreVsIsCorrectDisagreements": score_correct_disagreement,
        "scoreVsDbMatchDisagreements": score_db_disagreement,
        "finishReasons": counter_dict(finish_reasons),
        "topLevelRewardFieldRows": reward_field_rows,
        "rewardDetailsRows": reward_details_rows,
        "rewardDetailKeysets": counter_dict(reward_detail_keysets)},
      "anomalies": {"total": anomalies, "invalidJsonLines": invalid_json,
        "nonObjectRows": non_object,
        "unexpectedTopLevelSchemaRows": rows - expected_schema_rows,
        "invalidTaskIdentityRows": task_identity_invalid,
        "invalidMessagesRows": messages_invalid,
        "invalidMessageObjects": message_objects_invalid,
        "invalidEvalResultRows": eval_invalid,
        "invalidMetaRows": meta_invalid,
        "invalidToolCallsFields": tool_calls_invalid,
        "invalidToolCallObjects": tool_call_objects_invalid},
      "schema": {"topLevelKeysets": counter_dict(top_keysets),
        "metaKeysets": counter_dict(meta_keysets)},
    })

models = sorted(task_sets)
union_tasks = set().union(*(task_sets[model] for model in models))
intersection_tasks = set.intersection(*(task_sets[model] for model in models))
content_union = set().union(*(content_task_sets[model] for model in models))
content_intersection = set.intersection(*(content_task_sets[model] for model in models))
task_digest = hashlib.sha256()
task_digest.update(b"outsider/tau2-task-union/v1\0")
task_digest.update(json.dumps(sorted([list(value) for value in union_tasks]),
  separators=(",", ":")).encode("utf-8"))
intersection_digest = hashlib.sha256()
intersection_digest.update(b"outsider/tau2-task-intersection/v1\0")
intersection_digest.update(json.dumps(sorted([list(value) for value in intersection_tasks]),
  separators=(",", ":")).encode("utf-8"))
content_union_digest = hashlib.sha256()
content_union_digest.update(b"outsider/tau2-content-task-union/v1\0")
content_union_digest.update(json.dumps(sorted(content_union),
  separators=(",", ":")).encode("utf-8"))
content_intersection_digest = hashlib.sha256()
content_intersection_digest.update(b"outsider/tau2-content-task-intersection/v1\0")
content_intersection_digest.update(json.dumps(sorted(content_intersection),
  separators=(",", ":")).encode("utf-8"))
publisher_cohorts = collections.Counter()
content_cohorts = collections.Counter()
content_multiset_cohorts = collections.Counter()
for item in per_model:
    item["missingTasksFromUnion"] = len(union_tasks - task_sets[item["model"]])
    item["tasksOutsideAllModelIntersection"] = len(
      task_sets[item["model"]] - intersection_tasks)
    item["missingContentTasksFromUnion"] = len(
      content_union - content_task_sets[item["model"]])
    item["contentTasksOutsideAllModelIntersection"] = len(
      content_task_sets[item["model"]] - content_intersection)
    publisher_hash = hashlib.sha256(json.dumps(sorted(
      [list(value) for value in task_sets[item["model"]]]),
      separators=(",", ":")).encode("utf-8")).hexdigest()
    content_hash = hashlib.sha256(json.dumps(sorted(content_task_sets[item["model"]]),
      separators=(",", ":")).encode("utf-8")).hexdigest()
    content_multiset_hash = hashlib.sha256(json.dumps(sorted(
      content_task_multisets[item["model"]].items()),
      separators=(",", ":")).encode("utf-8")).hexdigest()
    item["publisherTaskIdSetHash"] = "sha256:" + publisher_hash
    item["contentTaskSetHash"] = "sha256:" + content_hash
    item["contentTaskMultisetHash"] = "sha256:" + content_multiset_hash
    publisher_cohorts[item["publisherTaskIdSetHash"]] += 1
    content_cohorts[item["contentTaskSetHash"]] += 1
    content_multiset_cohorts[item["contentTaskMultisetHash"]] += 1

domain_union = collections.Counter(task_name for task_name, task_id in union_tasks)
print(json.dumps({
  "files": {"jsonlFiles": len(jsonl_paths), "models": models,
    "allReadLineByLine": True, "rawMessageContentEmitted": False},
  "matrix": {"totalRows": total_rows, "unionTasks": len(union_tasks),
    "intersectionTasks": len(intersection_tasks),
    "domainTaskCountsInUnion": counter_dict(domain_union),
    "unionTaskSetHash": "sha256:" + task_digest.hexdigest(),
    "intersectionTaskSetHash": "sha256:" + intersection_digest.hexdigest(),
    "publisherTaskIdSetCohorts": counter_dict(publisher_cohorts),
    "publisherTaskIdsStableAcrossModels": len(publisher_cohorts) == 1,
    "contentSignatureUnionTasks": len(content_union),
    "contentSignatureIntersectionTasks": len(content_intersection),
    "contentSignatureUnionHash": "sha256:" + content_union_digest.hexdigest(),
    "contentSignatureIntersectionHash": "sha256:" + content_intersection_digest.hexdigest(),
    "contentTaskSetCohorts": counter_dict(content_cohorts),
    "contentTaskMultisetCohorts": counter_dict(content_multiset_cohorts),
    "modelsWith278Rows": sum(item["rows"] == 278 for item in per_model),
    "modelsWithNoMissingUnionTasks": sum(item["missingTasksFromUnion"] == 0
      for item in per_model),
    "modelsWithNoMissingContentTasks": sum(item["missingContentTasksFromUnion"] == 0
      for item in per_model),
    "modelsWith278ContentTaskRows": sum(item["contentTaskSignatureRows"] == 278
      for item in per_model),
    "completePublished30By278Matrix": total_rows == 8340
      and len(content_multiset_cohorts) == 1},
  "messages": {"total": total_messages,
    "roles": counter_dict(global_roles),
    "contentTypes": counter_dict(global_content_types),
    "messageKeysets": counter_dict(global_message_keysets),
    "toolCalls": total_tool_calls, "toolResultMessages": total_tool_messages,
    "multiToolCallMessages": total_multi_call_messages,
    "toolCallKeysets": counter_dict(global_tool_call_keysets)},
  "publisherEvaluation": {"scoreClasses": counter_dict(global_eval_scores),
    "dbMatchClasses": counter_dict(global_db_match),
    "metaIsCorrectClasses": counter_dict(global_is_correct),
    "finishReasons": counter_dict(global_finish_reasons),
    "topLevelRewardFieldRows": total_reward_field_rows,
    "rewardDetailsRows": total_reward_details_rows,
    "scoreVsIsCorrectDisagreements": total_score_correct_disagreement,
    "scoreVsDbMatchDisagreements": total_score_db_disagreement,
    "isCorrectVsDbMatchDisagreements": total_correct_db_disagreement,
    "evalResultIsPublisherNative": True,
    "independentOutcome": 0},
  "anomalies": {"invalidJsonLines": total_invalid_json,
    "schemaAnomalyEvents": total_schema_anomalies},
  "schema": {"expectedTopLevelKeys": sorted(expected_top),
    "expectedEvalResultKeys": sorted(expected_eval),
    "expectedMetaKeys": sorted(expected_meta),
    "expectedToolCallKeys": sorted(expected_call),
    "topLevelKeysets": counter_dict(global_top_keysets)},
  "perModel": per_model,
}, sort_keys=True, separators=(",", ":")))
`;

export function runTau2TrajectoriesReplay(sourceDirectory, options = {}) {
  const verified = verifyTau2TrajectoriesSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const result = spawnSync(python, ["-c", PYTHON_REPLAY, sourceDirectory], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  if (result.status !== 0) fail("PYTHON_REPLAY_FAILED",
    String(result.stderr || result.stdout).trim());
  const projection = parseJson(Buffer.from(result.stdout.trim(), "utf8"), "python");
  return { ...projection,
    replayHash: digest("outsider/tau2-safe-replay/v1", projection) };
}

export function tau2TrajectoriesArtifactHash(body) {
  return digest("outsider/tau2-bench-trajectories-audit/v1", body);
}

function buildBody(verified, replay) {
  return {
    schema: TAU2_TRAJECTORIES_AUDIT_SCHEMA,
    frozenAt: TAU2_TRAJECTORIES_FROZEN_AT,
    status: "PINNED_COMPLETE_TAU2_TRAJECTORY_MATRIX_REPLAY",
    admission: "QUARANTINE_EVAL",
    source: { id: TAU2_TRAJECTORIES_ID, revision: TAU2_TRAJECTORIES_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      selectedObjects: 32, selectedBytes: 289_780_557,
      fullTreeHash: TAU2_TRAJECTORIES_TREE_HASH },
    replay,
    outcome: { publisherEvalResultAvailable: true,
      publisherMetaIsCorrectAvailable: true,
      topLevelRewardFieldAvailable: false,
      publisherRewardDetailsAvailable: true,
      publisherEvaluationPromotedToIndependentOutcome: false,
      scoreAndDbMatchAreDistinctPublisherSignals: true,
      scoreVsDbMatchDisagreementRows: 1_003,
      metaIsCorrectVsDbMatchDisagreementRows: 0,
      independentOutcome: 0, longitudinalOutcome: 0 },
    recovery: { same278RowContentMultisetAcrossModels: true,
      stable278UniqueTaskIdentityAcrossModels: false,
      sameTaskExecutedAcrossModelsIndependentlyEstablished: false,
      sameTaskAcrossModelsPromotedToRetryLineage: false,
      withinTrajectoryRetryFieldAvailable: false,
      explicitFailureToRecoveryPairAvailable: false,
      recoveryEpisodeCount: 0 },
    completeness: { completeRepositoryBytes: true,
      completePublished30ModelMatrix: true,
      completePublishedRows: 8_340,
      publisherTaskIdUnion: 556,
      publisherTaskIdIntersectionEmpty: true,
      contentSignatureUnion: 169,
      contentSignatureIntersection: 169,
      contentSignatureDuplicateRowsPerModel: 109,
      contentSignatureMultisetAlignedAcrossModels: true,
      completeAttemptCensus: false,
      unpublishedOrDiscardedRunsUnknown: true,
      benchmarkMatrixIsNotExternalAttemptCensus: true },
    rights: { datasetCardLicense: null,
      repositoryLicenseFilePresent: false,
      trainingRightsEstablished: false,
      productionTrainingAllowed: false,
      evaluationUseFinallyAdjudicated: false,
      rightsDisposition: "FAIL_CLOSED" },
    privacy: { rawDialogueAcquired: true,
      rawDialogueStoredPrivate0600: true,
      rawMessageContentRepublishedInReport: false,
      noPiiGuaranteePresent: false,
      privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false },
    boundary: { training: 0, network: 0, CEU: 0, authority: 0, action: 0,
      opportunity: 0, delegation: 0, independentOutcome: 0,
      longitudinalOutcome: 0 },
  };
}

export function buildTau2TrajectoriesAuditFromSource(sourceDirectory,
  options = {}) {
  const verified = verifyTau2TrajectoriesSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const body = buildBody(verified,
    runTau2TrajectoriesReplay(sourceDirectory, options));
  return { ...body, artifactHash: tau2TrajectoriesArtifactHash(body) };
}

function zeroBoundary(value) {
  return plain(value) && ["training", "network", "CEU", "authority", "action",
    "opportunity", "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => value[key] === 0);
}

export function verifyTau2TrajectoriesAudit(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== TAU2_TRAJECTORIES_AUDIT_SCHEMA
      || artifact.frozenAt !== TAU2_TRAJECTORIES_FROZEN_AT
      || artifact.status !== "PINNED_COMPLETE_TAU2_TRAJECTORY_MATRIX_REPLAY"
      || artifact.admission !== "QUARANTINE_EVAL"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== tau2TrajectoriesArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    const { replayHash, ...replayProjection } = artifact.replay ?? {};
    if (!HASH.test(replayHash ?? "")
      || replayHash !== digest("outsider/tau2-safe-replay/v1", replayProjection)
      || replayHash !== TAU2_TRAJECTORIES_REPLAY_HASH
      || artifact.replay?.files?.jsonlFiles !== 30
      || !same(artifact.replay?.files?.models,
        [...TAU2_MODEL_NAMES].sort())
      || artifact.replay?.files?.allReadLineByLine !== true
      || artifact.replay?.files?.rawMessageContentEmitted !== false
      || artifact.replay?.matrix?.totalRows !== 8_340
      || artifact.replay?.matrix?.unionTasks !== 556
      || artifact.replay?.matrix?.intersectionTasks !== 0
      || artifact.replay?.matrix?.publisherTaskIdsStableAcrossModels !== false
      || artifact.replay?.matrix?.contentSignatureUnionTasks !== 169
      || artifact.replay?.matrix?.contentSignatureIntersectionTasks !== 169
      || artifact.replay?.matrix?.modelsWith278Rows !== 30
      || artifact.replay?.matrix?.modelsWithNoMissingUnionTasks !== 0
      || artifact.replay?.matrix?.modelsWithNoMissingContentTasks !== 30
      || artifact.replay?.matrix?.modelsWith278ContentTaskRows !== 30
      || artifact.replay?.matrix?.completePublished30By278Matrix !== true
      || artifact.replay?.publisherEvaluation?.independentOutcome !== 0
      || artifact.replay?.publisherEvaluation?.topLevelRewardFieldRows !== 0
      || !Array.isArray(artifact.replay?.perModel)
      || artifact.replay.perModel.length !== 30
      || artifact.replay.perModel.some((entry) => entry.rows !== 278
      || entry.missingTasksFromUnion !== 278 || entry.uniqueTaskIdentities !== 278
      || entry.uniqueContentTaskSignatures !== 169
      || entry.contentTaskSignatureRows !== 278
      || entry.duplicateContentTaskSignatureRows !== 109
      || entry.missingContentTasksFromUnion !== 0)
      || !plain(artifact.source) || artifact.source.id !== TAU2_TRAJECTORIES_ID
      || artifact.source.revision !== TAU2_TRAJECTORIES_REVISION
      || !HASH.test(artifact.source.sourceManifestHash ?? "")
      || !HASH.test(artifact.source.sourceRoot ?? "")
      || artifact.source.selectedObjects !== 32
      || artifact.source.selectedBytes !== 289_780_557
      || artifact.source.fullTreeHash !== TAU2_TRAJECTORIES_TREE_HASH
      || !same(artifact.outcome, { publisherEvalResultAvailable: true,
        publisherMetaIsCorrectAvailable: true,
        topLevelRewardFieldAvailable: false,
        publisherRewardDetailsAvailable: true,
        publisherEvaluationPromotedToIndependentOutcome: false,
        scoreAndDbMatchAreDistinctPublisherSignals: true,
        scoreVsDbMatchDisagreementRows: 1_003,
        metaIsCorrectVsDbMatchDisagreementRows: 0,
        independentOutcome: 0, longitudinalOutcome: 0 })
      || !same(artifact.recovery, { same278RowContentMultisetAcrossModels: true,
        stable278UniqueTaskIdentityAcrossModels: false,
        sameTaskExecutedAcrossModelsIndependentlyEstablished: false,
        sameTaskAcrossModelsPromotedToRetryLineage: false,
        withinTrajectoryRetryFieldAvailable: false,
        explicitFailureToRecoveryPairAvailable: false,
        recoveryEpisodeCount: 0 })
      || !same(artifact.completeness, { completeRepositoryBytes: true,
        completePublished30ModelMatrix: true, completePublishedRows: 8_340,
        publisherTaskIdUnion: 556, publisherTaskIdIntersectionEmpty: true,
        contentSignatureUnion: 169, contentSignatureIntersection: 169,
        contentSignatureDuplicateRowsPerModel: 109,
        contentSignatureMultisetAlignedAcrossModels: true,
        completeAttemptCensus: false,
        unpublishedOrDiscardedRunsUnknown: true,
        benchmarkMatrixIsNotExternalAttemptCensus: true })
      || !same(artifact.rights, { datasetCardLicense: null,
        repositoryLicenseFilePresent: false, trainingRightsEstablished: false,
        productionTrainingAllowed: false,
        evaluationUseFinallyAdjudicated: false, rightsDisposition: "FAIL_CLOSED" })
      || !same(artifact.privacy, { rawDialogueAcquired: true,
        rawDialogueStoredPrivate0600: true,
        rawMessageContentRepublishedInReport: false,
        noPiiGuaranteePresent: false, privacyReviewComplete: false,
        publicAvailabilityResolvesPrivacy: false })
      || !zeroBoundary(artifact.boundary)) fail("ARTIFACT_BOUNDARY_INVALID");
    return { ok: true, artifactHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyTau2TrajectoriesAuditWithSource(artifact,
  sourceDirectory, options = {}) {
  const standalone = verifyTau2TrajectoriesAudit(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildTau2TrajectoriesAuditFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: rebuilt.source.sourceManifestHash,
      sourceRoot: rebuilt.source.sourceRoot,
      verificationLevel:
        "FULL_TAU2_JSONL_MESSAGE_TOOL_EVAL_AND_TASK_MATRIX_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
