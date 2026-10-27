/*
 * Pinned, source-first intake for the twelve public yoonjung0705 UR5e
 * agent/expert trajectory repositories.  Every file in each fixed recursive
 * tree except the three MP4 streams is acquired and replayed.  Repository-name
 * tokens such as recovery, attempt, success and score remain publisher naming
 * claims: the LeRobot tables contain no terminal-outcome, recovery-event,
 * effect-receipt or attempt-parent field.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, rmSync, unlinkSync, writeFileSync, writeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const UR5E_AGENT_AUTHOR = "yoonjung0705";
export const UR5E_AGENT_PREFIX =
  "aic_sfp2nic_agent_expert_trajectory_sample_";
export const UR5E_AGENT_DECLARED_QUERY =
  "https://huggingface.co/api/datasets?author=yoonjung0705"
  + "&search=aic_sfp2nic_agent_expert_trajectory_sample&limit=100&full=true";
export const UR5E_AGENT_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const UR5E_AGENT_SOURCE_SCHEMA =
  "outsider/ur5e-agent-recovery-lineage-source/v1";
export const UR5E_AGENT_ARTIFACT_SCHEMA =
  "outsider/ur5e-agent-recovery-lineage/v1";

function repo(key, revision, frames) {
  return Object.freeze({ key,
    id: `${UR5E_AGENT_AUTHOR}/${UR5E_AGENT_PREFIX}${key}`,
    revision, frames });
}

export const UR5E_AGENT_REPOSITORIES = Object.freeze([
  repo("agent_nominal", "4ec4169d0e6f58cac7fb815c246cb02c928a6ad1", 613),
  repo("debug_cheatcode_modified_attempt_15",
    "1158371701efa24a09ef9b16405b10bb96e9979f", 1_463),
  repo("debug_cheatcode_modified_attempt_20",
    "ec73ea948992adb7716182c580b0197df5b8d1aa", 430),
  repo("nominalrecovery_attempt_2",
    "a61a19d3a72620dbcd97549fc734f90d2c8ac464", 1_960),
  repo("nominalrecovery_success",
    "a84c3356b1991a2c67507e8562039569899de9ad", 778),
  repo("vlm_moveit_nominal_attempt_1_score_96p83",
    "26220e4cc18af2b1976787e7000255df7a308c68", 479),
  repo("vlm_moveit_nominalrecovery_attempt_1_score_94p98",
    "10f90720615faf6a988375e1d9c68f7409a6693a", 763),
  repo("vlm_moveit_nominalrecovery_attempt_1_score_97p05",
    "3f4b19a6033c70262dcac2afcd1c24353cdb1106", 424),
  repo("vlm_moveit_recovery_attempt_1",
    "abea068ae3065d59b924d904cbcac06c8ae0b0d8", 644),
  repo("vlm_moveit_recovery_attempt_2",
    "389f1e8fd8e28dad8f414f41c29eda5cb43ead07", 1_482),
  repo("vlm_moveit_recovery_attempt_3",
    "c893aac0f12e67fd6d69afab99419e1c1545f8c6", 637),
  repo("vlm_moveit_recovery_attempt_4",
    "5f9a2d3007fe338dd356dd197e6e3f20d1db6b2b", 799),
]);

export const UR5E_AGENT_PROFILE = Object.freeze({
  repositories: 12,
  episodes: 12,
  frames: 10_472,
  fps: 20,
  robotType: "ur5e_aic",
  videosPerRepository: 3,
  videos: 36,
  expectedDataParquets: 12,
  expectedEpisodeParquets: 12,
  expectedTaskParquets: 12,
  parquetFilesReplayed: 36,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_API_BYTES = 8 * 1024 * 1024;
const MAX_OBJECT_BYTES = 16 * 1024 * 1024;
const FETCH_ATTEMPTS = 4;
const FETCH_CONCURRENCY = 6;
const REQUIRED_NO_VIDEO_PATHS = Object.freeze([
  ".gitattributes",
  "data/chunk-000/file-000.parquet",
  "meta/episodes/chunk-000/file-000.parquet",
  "meta/info.json",
  "meta/stats.json",
  "meta/tasks.parquet",
]);
const DATA_FIELDS = Object.freeze([
  "action", "episode_index", "frame_index", "index", "observation.state",
  "task_index", "timestamp",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `UR5E_AGENT_${code}`
    : `UR5E_AGENT_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function ur5eAgentSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return ur5eAgentSha256(Buffer.from(
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

function profileByKey(key) {
  const value = UR5E_AGENT_REPOSITORIES.find((entry) => entry.key === key);
  if (!value) fail("PROFILE_UNKNOWN", key);
  return value;
}

function encodedDataset(id) {
  return id.split("/").map(encodeURIComponent).join("/");
}

function urls(profile) {
  const encoded = encodedDataset(profile.id);
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${profile.revision}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${profile.revision}`
      + "?recursive=true&expand=false&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${profile.revision}`,
  };
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
    || /(?:fetch failed|network|timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN|terminated)/iu
      .test(String(error?.message ?? error));
}

async function fetchOnce(url, maximumBytes, fetchImpl) {
  if (!permittedUrl(url)) fail("REQUEST_URL_REFUSED", url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const response = await fetchImpl(url, { method: "GET", redirect: "follow",
      signal: controller.signal,
      headers: { Accept: "application/json, application/octet-stream;q=0.9, */*;q=0.8" } });
    if (!response || typeof response.arrayBuffer !== "function") {
      fail("FETCH_RESPONSE_INVALID");
    }
    if (!response.ok) {
      const error = new Error(`HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 425
        || response.status === 429 || response.status >= 500;
      throw error;
    }
    const finalUrl = response.url || url;
    if (!permittedUrl(finalUrl)) fail("FINAL_URL_REFUSED", finalUrl);
    const declared = Number(response.headers?.get?.("content-length"));
    if (Number.isFinite(declared) && declared > maximumBytes) {
      fail("CONTENT_LENGTH_EXCEEDED", String(declared));
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) fail("BODY_BYTES_EXCEEDED", String(bytes.length));
    return { bytes, finalUrl, status: response.status,
      contentType: response.headers?.get?.("content-type") ?? null,
      link: response.headers?.get?.("link") ?? null };
  } finally { clearTimeout(timer); }
}

async function boundedFetch(url, maximumBytes, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try { return await fetchOnce(url, maximumBytes, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === FETCH_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 500 * (2 ** attempt)));
    }
  }
  throw last;
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

async function fetchJson(url, fetchImpl) {
  const fetched = await boundedFetch(url, MAX_API_BYTES, fetchImpl);
  return { ...fetched, value: parseJson(fetched.bytes, url) };
}

function queryProjection(value) {
  if (!Array.isArray(value)) fail("QUERY_INVALID");
  const projected = value.map((entry) => ({ id: entry?.id, sha: entry?.sha,
    private: entry?.private, gated: entry?.gated, disabled: entry?.disabled }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));
  const expected = UR5E_AGENT_REPOSITORIES.map((entry) => ({ id: entry.id,
    sha: entry.revision, private: false, gated: false, disabled: false }))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!same(projected, expected)) fail("DECLARED_QUERY_SCOPE_CHANGED");
  return projected;
}

function repositoryProjection(profile, value) {
  if (!plain(value) || !Array.isArray(value.siblings)) {
    fail("REPOSITORY_INVALID", profile.key);
  }
  const siblingPaths = value.siblings.map((entry) => entry?.rfilename)
    .sort((left, right) => String(left).localeCompare(String(right)));
  if (siblingPaths.some((entry) => !safeRemotePath(entry))
    || new Set(siblingPaths).size !== siblingPaths.length) {
    fail("REPOSITORY_PATHS_INVALID", profile.key);
  }
  const projected = { id: value.id, sha: value.sha, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage ?? null,
    cardLicense: value.cardData?.license ?? null, siblingPaths };
  if (projected.id !== profile.id || projected.sha !== profile.revision
    || projected.private !== false || projected.gated !== false
    || projected.disabled !== false || projected.cardLicense !== null) {
    fail("REPOSITORY_PROFILE_INVALID", profile.key);
  }
  return projected;
}

function treeEntry(entry) {
  if (!plain(entry) || !safeRemotePath(entry.path)
    || !["file", "directory"].includes(entry.type)
    || !SHA1.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
  if (entry.type === "directory") {
    if (entry.size !== 0 || entry.lfs != null) fail("TREE_DIRECTORY_INVALID", entry.path);
    return { path: entry.path, type: "directory", oid: entry.oid,
      sizeBytes: 0, lfsSha256: null };
  }
  if (!Number.isSafeInteger(entry.size) || entry.size < 0) {
    fail("TREE_FILE_SIZE_INVALID", entry.path);
  }
  if (entry.lfs == null) return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: null };
  if (!plain(entry.lfs) || !SHA256.test(entry.lfs.oid ?? "")
    || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID", entry.path);
  return { path: entry.path, type: "file", oid: entry.oid,
    sizeBytes: entry.size, lfsSha256: `sha256:${entry.lfs.oid}` };
}

function treeProjection(profile, value) {
  if (!Array.isArray(value) || value.length < 1) fail("TREE_INVALID", profile.key);
  const projection = value.map(treeEntry)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(projection.map((entry) => entry.path)).size !== projection.length) {
    fail("TREE_DUPLICATE_PATH", profile.key);
  }
  const files = projection.filter((entry) => entry.type === "file");
  const videos = files.filter((entry) => /\.mp4$/iu.test(entry.path));
  const selected = files.filter((entry) => !/\.mp4$/iu.test(entry.path));
  const licensePaths = files.filter((entry) =>
    /(?:^|\/)(?:licen[cs]e|copying|notice)(?:\.|$)/iu.test(entry.path));
  if (videos.length !== UR5E_AGENT_PROFILE.videosPerRepository
    || videos.some((entry) => !entry.path.startsWith("videos/"))
    || REQUIRED_NO_VIDEO_PATHS.some((required) =>
      !selected.some((entry) => entry.path === required))
    || selected.some((entry) => /\.(?:mp4|mov|avi|mkv|webm)$/iu.test(entry.path))
    || licensePaths.length !== 0) fail("TREE_CLOSURE_INVALID", profile.key);
  return { projection, files, videos, selected, licensePaths,
    treeHash: digest("outsider/ur5e-agent-tree/v1", projection) };
}

function validateRecordTreeAgreement(profile, repository, tree) {
  const record = repositoryProjection(profile, repository);
  const projectedTree = treeProjection(profile, tree);
  const filePaths = projectedTree.files.map((entry) => entry.path).sort();
  if (!same(record.siblingPaths, filePaths)) {
    fail("REPOSITORY_TREE_FILE_SET_MISMATCH", profile.key);
  }
  return { record, tree: projectedTree };
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function safeJoin(root, relativePath) {
  if (!safeRemotePath(relativePath)) fail("LOCAL_PATH_UNSAFE", relativePath);
  const target = path.resolve(root, relativePath);
  const relative = path.relative(path.resolve(root), target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative)) fail("LOCAL_PATH_ESCAPE", relativePath);
  return target;
}

function writePrivateOnce(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  const descriptor = openSync(file, fsConstants.O_CREAT | fsConstants.O_EXCL
    | fsConstants.O_WRONLY | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try {
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size !== bytes.length) fail("WRITE_VERIFY_FAILED", file);
  } finally { closeSync(descriptor); }
}

function replacePrivateJson(file, value) {
  const temporary = `${file}.next-${process.pid}`;
  writePrivateOnce(temporary, canonicalBytes(value));
  renameSync(temporary, file);
  chmodSync(file, 0o600);
}

function readRegular(file, expectedBytes = null) {
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile()) fail("FILE_UNSAFE", file);
  const bytes = readFileSync(file);
  if (expectedBytes !== null && bytes.length !== expectedBytes) {
    fail("FILE_SIZE_INVALID", file);
  }
  return bytes;
}

function enforcePrivateTree(root) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", root);
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) enforcePrivateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

function walkRelative(root) {
  const files = [];
  const queue = [root];
  while (queue.length > 0) {
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

async function mapConcurrent(values, concurrency, operation) {
  const result = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return result;
}

function snapshotDescriptor(phase, kind, key, url, fetched, file) {
  return { phase, kind, key, requestUrl: url, finalUrl: fetched.finalUrl,
    status: fetched.status, contentType: fetched.contentType,
    link: fetched.link, file, bytes: fetched.bytes.length,
    sha256: ur5eAgentSha256(fetched.bytes) };
}

async function captureSnapshotSet(root, phase, fetchImpl) {
  const phaseRoot = path.join(root, `.${phase}.tmp-${process.pid}`);
  if (existsSync(phaseRoot)) rmSync(phaseRoot, { recursive: true, force: true });
  mkdirSync(phaseRoot, { mode: 0o700 });
  try {
    const query = await fetchJson(UR5E_AGENT_DECLARED_QUERY, fetchImpl);
    queryProjection(query.value);
    const queryRelative = `api/${phase}/query.json`;
    writePrivateOnce(path.join(phaseRoot, "query.json"), query.bytes);
    const descriptors = [snapshotDescriptor(phase, "query", null,
      UR5E_AGENT_DECLARED_QUERY, query, queryRelative)];
    const pairs = await mapConcurrent(UR5E_AGENT_REPOSITORIES, FETCH_CONCURRENCY,
      async (profile) => {
        const endpoint = urls(profile);
        const [repository, tree] = await Promise.all([
          fetchJson(endpoint.repository, fetchImpl), fetchJson(endpoint.tree, fetchImpl),
        ]);
        if (tree.link !== null) fail("TREE_PAGINATION_NOT_CLOSED", profile.key);
        validateRecordTreeAgreement(profile, repository.value, tree.value);
        const repoName = `${profile.key}.json`;
        const treeName = `${profile.key}.json`;
        writePrivateOnce(path.join(phaseRoot, "repositories", repoName), repository.bytes);
        writePrivateOnce(path.join(phaseRoot, "trees", treeName), tree.bytes);
        return [
          snapshotDescriptor(phase, "repository", profile.key, endpoint.repository,
            repository, `api/${phase}/repositories/${repoName}`),
          snapshotDescriptor(phase, "tree", profile.key, endpoint.tree,
            tree, `api/${phase}/trees/${treeName}`),
        ];
      });
    descriptors.push(...pairs.flat());
    const finalRoot = path.join(root, "api", phase);
    ensurePrivateDirectory(path.dirname(finalRoot));
    if (existsSync(finalRoot)) fail("SNAPSHOT_PHASE_EXISTS", phase);
    renameSync(phaseRoot, finalRoot);
    return descriptors.sort((left, right) => left.file.localeCompare(right.file));
  } catch (error) {
    rmSync(phaseRoot, { recursive: true, force: true });
    throw error;
  }
}

function readSnapshot(root, descriptor) {
  const bytes = readRegular(safeJoin(root, descriptor.file), descriptor.bytes);
  if (ur5eAgentSha256(bytes) !== descriptor.sha256) {
    fail("SNAPSHOT_HASH_INVALID", descriptor.file);
  }
  return parseJson(bytes, descriptor.file);
}

function snapshotsFor(root, descriptors, phase) {
  const selected = descriptors.filter((entry) => entry.phase === phase);
  const queryDescriptor = selected.find((entry) => entry.kind === "query");
  if (!queryDescriptor) fail("QUERY_SNAPSHOT_MISSING", phase);
  const repositories = {};
  const trees = {};
  for (const profile of UR5E_AGENT_REPOSITORIES) {
    const repository = selected.find((entry) => entry.kind === "repository"
      && entry.key === profile.key);
    const tree = selected.find((entry) => entry.kind === "tree"
      && entry.key === profile.key);
    if (!repository || !tree) fail("SNAPSHOT_MISSING", `${phase}:${profile.key}`);
    repositories[profile.key] = readSnapshot(root, repository);
    trees[profile.key] = readSnapshot(root, tree);
  }
  return { query: readSnapshot(root, queryDescriptor), repositories, trees };
}

function compareSnapshots(before, after) {
  if (!same(queryProjection(before.query), queryProjection(after.query))) {
    fail("QUERY_CHANGED_DURING_ACQUISITION");
  }
  for (const profile of UR5E_AGENT_REPOSITORIES) {
    const left = validateRecordTreeAgreement(profile,
      before.repositories[profile.key], before.trees[profile.key]);
    const right = validateRecordTreeAgreement(profile,
      after.repositories[profile.key], after.trees[profile.key]);
    if (!same(left, right)) fail("PINNED_SOURCE_CHANGED", profile.key);
  }
}

function objectRelative(profile, entry) {
  return `objects/${profile.key}/${entry.path}`;
}

function verifyObjectBytes(bytes, profile, entry) {
  if (bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_INVALID",
    `${profile.key}:${entry.path}`);
  const sha256 = ur5eAgentSha256(bytes);
  if (entry.lfsSha256 !== null ? sha256 !== entry.lfsSha256
    : gitBlobOid(bytes) !== entry.oid) fail("OBJECT_TREE_HASH_INVALID",
    `${profile.key}:${entry.path}`);
  return sha256;
}

async function downloadOrReuse(root, profile, entry, fetchImpl) {
  const endpoint = `${urls(profile).raw}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const relative = objectRelative(profile, entry);
  const local = safeJoin(root, relative);
  if (existsSync(local)) {
    const bytes = readRegular(local, entry.sizeBytes);
    return { repoKey: profile.key, datasetId: profile.id,
      revision: profile.revision, path: entry.path, file: relative,
      requestUrl: endpoint, finalUrl: endpoint, status: 200,
      contentType: null, bytes: bytes.length,
      sha256: verifyObjectBytes(bytes, profile, entry), gitOid: entry.oid,
      lfsSha256: entry.lfsSha256,
      retrieval: "CHECKPOINT_REUSED_VERIFIED_BYTES" };
  }
  const fetched = await boundedFetch(endpoint,
    Math.min(MAX_OBJECT_BYTES, entry.sizeBytes + 1), fetchImpl);
  const sha256 = verifyObjectBytes(fetched.bytes, profile, entry);
  writePrivateOnce(local, fetched.bytes);
  return { repoKey: profile.key, datasetId: profile.id,
    revision: profile.revision, path: entry.path, file: relative,
    requestUrl: endpoint, finalUrl: fetched.finalUrl, status: fetched.status,
    contentType: fetched.contentType, bytes: fetched.bytes.length, sha256,
    gitOid: entry.oid, lfsSha256: entry.lfsSha256,
    retrieval: "NETWORK_FETCH" };
}

function checkpointMarker() {
  return { schema: "outsider/ur5e-agent-recovery-checkpoint/v1",
    repositories: UR5E_AGENT_REPOSITORIES.map(({ id, revision }) => ({ id, revision })) };
}

function readCheckpointState(root) {
  const marker = parseJson(readRegular(path.join(root, "checkpoint-marker.json")),
    "checkpoint-marker.json");
  if (!same(marker, checkpointMarker())) fail("CHECKPOINT_MARKER_INVALID");
  const stateFile = path.join(root, "checkpoint-state.json");
  if (!existsSync(stateFile)) return { beforeDescriptors: null, remoteObjects: [],
    afterDescriptors: null };
  const state = parseJson(readRegular(stateFile), "checkpoint-state.json");
  if (!plain(state) || !Array.isArray(state.remoteObjects)) fail("CHECKPOINT_STATE_INVALID");
  return state;
}

function saveCheckpointState(root, state) {
  replacePrivateJson(path.join(root, "checkpoint-state.json"), state);
}

function initializeCheckpoint(root) {
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writePrivateOnce(path.join(root, "checkpoint-marker.json"),
      canonicalBytes(checkpointMarker()));
  }
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("CHECKPOINT_UNSAFE", root);
  chmodSync(root, 0o700);
  return readCheckpointState(root);
}

function sourceRootFor(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots.map((entry) => ({ file: entry.file,
    bytes: entry.bytes, sha256: entry.sha256 })),
  ...remoteObjects.map((entry) => ({ file: entry.file,
    bytes: entry.bytes, sha256: entry.sha256 }))]
    .sort((left, right) => left.file.localeCompare(right.file));
  return { files,
    sourceRoot: digest("outsider/ur5e-agent-source-root/v1", files) };
}

function sourceManifestHash(body) {
  return digest("outsider/ur5e-agent-source-manifest/v1", body);
}

function closureFrom(before, remoteObjects) {
  const trees = UR5E_AGENT_REPOSITORIES.map((profile) =>
    treeProjection(profile, before.trees[profile.key]));
  const videos = trees.flatMap((entry, index) => entry.videos.map((video) => ({
    repoKey: UR5E_AGENT_REPOSITORIES[index].key, path: video.path,
    bytes: video.sizeBytes, gitOid: video.oid, lfsSha256: video.lfsSha256,
  })));
  const reports = remoteObjects.filter((entry) =>
    /(?:selection|stall).*\.(?:csv|json)$/iu.test(entry.path));
  return {
    repositories: UR5E_AGENT_PROFILE.repositories,
    recursiveTreesCapturedBeforeAndAfter: true,
    recursiveTreePagesPerRepositoryPerPhase: 1,
    recursiveTreeEntries: trees.reduce((sum, entry) => sum + entry.projection.length, 0),
    recursiveTreeFiles: trees.reduce((sum, entry) => sum + entry.files.length, 0),
    recursiveTreeBytes: trees.reduce((sum, entry) => sum
      + entry.files.reduce((inner, file) => inner + file.sizeBytes, 0), 0),
    noVideoObjects: remoteObjects.length,
    noVideoBytes: remoteObjects.reduce((sum, entry) => sum + entry.bytes, 0),
    completeNoVideoClosure: true,
    reportObjects: reports.length,
    selectionReportObjects: reports.filter((entry) => /selection/iu.test(entry.path)).length,
    stallReportObjects: reports.filter((entry) => /stall/iu.test(entry.path)).length,
    videosInventoried: videos.length,
    videoBytesInventoried: videos.reduce((sum, entry) => sum + entry.bytes, 0),
    videoObjectsAcquired: 0,
    videos,
    licenseFilesPresent: 0,
    repositoryCardLicenseClaimsPresent: 0,
    declaredFamilyScopeCompleteAtCutoff: true,
    globalSourceExhaustion: false,
  };
}

export async function acquirePinnedUr5eAgentLineageSource(sourceDirectory,
  options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  if (existsSync(sourceDirectory)) fail("SOURCE_EXISTS", sourceDirectory);
  const checkpoint = options.checkpointDirectory
    ?? `${path.resolve(sourceDirectory)}.checkpoint`;
  ensurePrivateDirectory(path.dirname(path.resolve(sourceDirectory)));
  const state = initializeCheckpoint(checkpoint);
  try {
    if (state.beforeDescriptors === null) {
      state.beforeDescriptors = await captureSnapshotSet(checkpoint, "before", fetchImpl);
      saveCheckpointState(checkpoint, state);
    }
    const before = snapshotsFor(checkpoint, state.beforeDescriptors, "before");
    const selections = [];
    for (const profile of UR5E_AGENT_REPOSITORIES) {
      const joined = validateRecordTreeAgreement(profile,
        before.repositories[profile.key], before.trees[profile.key]);
      for (const entry of joined.tree.selected) selections.push({ profile, entry });
    }
    const completed = new Map(state.remoteObjects.map((entry) =>
      [`${entry.repoKey}\0${entry.path}`, entry]));
    await mapConcurrent(selections, FETCH_CONCURRENCY, async ({ profile, entry }) => {
      const key = `${profile.key}\0${entry.path}`;
      const prior = completed.get(key);
      if (prior) {
        const bytes = readRegular(safeJoin(checkpoint, prior.file), prior.bytes);
        verifyObjectBytes(bytes, profile, entry);
        return prior;
      }
      const descriptor = await downloadOrReuse(checkpoint, profile, entry, fetchImpl);
      completed.set(key, descriptor);
      state.remoteObjects = [...completed.values()]
        .sort((left, right) => left.file.localeCompare(right.file));
      saveCheckpointState(checkpoint, state);
      return descriptor;
    });
    state.remoteObjects = [...completed.values()]
      .sort((left, right) => left.file.localeCompare(right.file));
    if (state.remoteObjects.length !== selections.length) fail("OBJECT_CENSUS_INVALID");
    if (state.afterDescriptors === null) {
      state.afterDescriptors = await captureSnapshotSet(checkpoint, "after", fetchImpl);
      saveCheckpointState(checkpoint, state);
    }
    const after = snapshotsFor(checkpoint, state.afterDescriptors, "after");
    compareSnapshots(before, after);
    const apiSnapshots = [...state.beforeDescriptors, ...state.afterDescriptors]
      .sort((left, right) => left.file.localeCompare(right.file));
    const rooted = sourceRootFor(apiSnapshots, state.remoteObjects);
    const manifestBody = { schema: UR5E_AGENT_SOURCE_SCHEMA,
      frozenAt: UR5E_AGENT_FROZEN_AT, declaredQuery: UR5E_AGENT_DECLARED_QUERY,
      apiSnapshots, remoteObjects: state.remoteObjects,
      sourceFiles: rooted.files, sourceRoot: rooted.sourceRoot,
      closure: closureFrom(before, state.remoteObjects) };
    const manifest = { ...manifestBody,
      manifestHash: sourceManifestHash(manifestBody) };
    writePrivateOnce(path.join(checkpoint, "acquisition-manifest.json"),
      canonicalBytes(manifest));
    unlinkSync(path.join(checkpoint, "checkpoint-marker.json"));
    unlinkSync(path.join(checkpoint, "checkpoint-state.json"));
    enforcePrivateTree(checkpoint);
    renameSync(checkpoint, sourceDirectory);
    chmodSync(sourceDirectory, 0o700);
    return { sourceDirectory, manifest };
  } catch (error) {
    try { enforcePrivateTree(checkpoint); } catch { /* preserve original failure */ }
    throw error;
  }
}

function verifyRemoteObjects(root, manifest, before) {
  const expected = [];
  for (const profile of UR5E_AGENT_REPOSITORIES) {
    const tree = treeProjection(profile, before.trees[profile.key]);
    for (const entry of tree.selected) expected.push({ profile, entry });
  }
  const expectedKeys = expected.map(({ profile, entry }) =>
    `${profile.key}\0${entry.path}`).sort();
  const actualKeys = manifest.remoteObjects.map((entry) =>
    `${entry.repoKey}\0${entry.path}`).sort();
  if (!same(expectedKeys, actualKeys)) fail("REMOTE_OBJECT_SET_INVALID");
  for (const descriptor of manifest.remoteObjects) {
    const profile = profileByKey(descriptor.repoKey);
    const tree = treeProjection(profile, before.trees[profile.key]);
    const entry = tree.selected.find((item) => item.path === descriptor.path);
    if (!entry || descriptor.datasetId !== profile.id
      || descriptor.revision !== profile.revision
      || descriptor.file !== objectRelative(profile, entry)
      || descriptor.bytes !== entry.sizeBytes || descriptor.gitOid !== entry.oid
      || descriptor.lfsSha256 !== entry.lfsSha256
      || !HASH.test(descriptor.sha256 ?? "") || descriptor.status !== 200
      || !permittedUrl(descriptor.requestUrl) || !permittedUrl(descriptor.finalUrl)) {
      fail("REMOTE_DESCRIPTOR_INVALID", descriptor.file);
    }
    const bytes = readRegular(safeJoin(root, descriptor.file), descriptor.bytes);
    if (ur5eAgentSha256(bytes) !== descriptor.sha256) {
      fail("REMOTE_HASH_INVALID", descriptor.file);
    }
    verifyObjectBytes(bytes, profile, entry);
  }
}

export function verifyUr5eAgentLineageSourceDirectory(sourceDirectory) {
  try {
    const stat = lstatSync(sourceDirectory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("SOURCE_DIRECTORY_UNSAFE");
    const bytes = readRegular(path.join(sourceDirectory, "acquisition-manifest.json"));
    const manifest = parseJson(bytes, "acquisition-manifest.json");
    if (!plain(manifest) || manifest.schema !== UR5E_AGENT_SOURCE_SCHEMA
      || manifest.frozenAt !== UR5E_AGENT_FROZEN_AT
      || manifest.declaredQuery !== UR5E_AGENT_DECLARED_QUERY
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 50
      || !Array.isArray(manifest.remoteObjects) || !Array.isArray(manifest.sourceFiles)
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")) {
      fail("MANIFEST_SHAPE_INVALID");
    }
    for (const descriptor of manifest.apiSnapshots) {
      if (!plain(descriptor) || !safeRemotePath(descriptor.file)
        || !HASH.test(descriptor.sha256 ?? "")
        || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1
        || !permittedUrl(descriptor.requestUrl) || !permittedUrl(descriptor.finalUrl)
        || descriptor.status !== 200) fail("SNAPSHOT_DESCRIPTOR_INVALID");
      readSnapshot(sourceDirectory, descriptor);
    }
    const before = snapshotsFor(sourceDirectory, manifest.apiSnapshots, "before");
    const after = snapshotsFor(sourceDirectory, manifest.apiSnapshots, "after");
    compareSnapshots(before, after);
    verifyRemoteObjects(sourceDirectory, manifest, before);
    const rooted = sourceRootFor(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles)
      || rooted.sourceRoot !== manifest.sourceRoot) fail("SOURCE_ROOT_INVALID");
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"].sort();
    if (!same(walkRelative(sourceDirectory), expectedFiles)) {
      fail("SOURCE_FILE_CLOSURE_INVALID");
    }
    const expectedClosure = closureFrom(before, manifest.remoteObjects);
    if (!same(manifest.closure, expectedClosure)) fail("CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== sourceManifestHash(body)) fail("MANIFEST_HASH_INVALID");
    return { ok: true, manifest, before, after,
      verificationLevel:
        "PINNED_12_REPOSITORY_COMPLETE_NO_VIDEO_AND_VIDEO_INVENTORY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYARROW_REPLAY = String.raw`
import csv, hashlib, json, math, os, re, sys
import pyarrow.parquet as pq

root = sys.argv[1]
profiles = json.loads(sys.argv[2])

def die(code, detail=""):
    raise RuntimeError("UR5E_AGENT_PYARROW_" + code + ((":" + detail) if detail else ""))

def obj(key, rel):
    return os.path.join(root, "objects", key, *rel.split("/"))

def read_json(key, rel):
    with open(obj(key, rel), "r", encoding="utf-8") as handle:
        return json.load(handle)

def schema_projection(table):
    return [{"name": field.name, "type": str(field.type), "nullable": field.nullable}
            for field in table.schema]

def vector_summary(values):
    dimensions = len(values[0]) if values else 0
    if dimensions < 1 or any(len(row) != dimensions for row in values):
        die("VECTOR_SHAPE")
    columns = [[float(row[index]) for row in values] for index in range(dimensions)]
    if any(not math.isfinite(value) for column in columns for value in column):
        die("NONFINITE_VECTOR")
    return {"dimensions": dimensions,
            "minimum": [min(column) for column in columns],
            "maximum": [max(column) for column in columns],
            "mean": [sum(column) / len(column) for column in columns]}

def telemetry_hash(table):
    digest = hashlib.sha256()
    columns = {name: table[name].to_pylist() for name in table.column_names}
    for index in range(table.num_rows):
        row = {name: columns[name][index] for name in sorted(columns)}
        digest.update(json.dumps(row, sort_keys=True, separators=(",", ":"),
                                 allow_nan=False).encode("utf-8"))
        digest.update(b"\n")
    return "sha256:" + digest.hexdigest()

def logical_hash(value):
    encoded = json.dumps(value, sort_keys=True, separators=(",", ":"),
                         allow_nan=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(encoded).hexdigest()

def publisher_reports(key):
    base = os.path.join(root, "objects", key)
    reports = []
    for directory, _, files in os.walk(base):
        for name in sorted(files):
            lowered = name.lower()
            if not re.search(r"(?:selection|stall).+\.(?:csv|json)$", lowered):
                continue
            filename = os.path.join(directory, name)
            relative = os.path.relpath(filename, base).replace(os.sep, "/")
            if lowered.endswith(".csv"):
                with open(filename, "r", encoding="utf-8-sig", newline="") as handle:
                    reader = csv.DictReader(handle)
                    rows = list(reader)
                    headers = reader.fieldnames or []
                absolute_fields = sorted(field for field in headers
                                         if any(str(row.get(field, "")).startswith("/")
                                                for row in rows))
                status_counts = {}
                selected_counts = {}
                reason_counts = {}
                for row in rows:
                    if "status" in row:
                        status_counts[row["status"]] = status_counts.get(row["status"], 0) + 1
                    if "selected" in row:
                        selected_counts[row["selected"]] = selected_counts.get(row["selected"], 0) + 1
                    if "reason" in row:
                        reason_counts[row["reason"]] = reason_counts.get(row["reason"], 0) + 1
                reports.append({"path": relative, "format": "CSV",
                                "headers": headers, "dataRows": len(rows),
                                "logicalContentHash": logical_hash(rows),
                                "absolutePathFields": absolute_fields,
                                "absolutePathRows": sum(any(str(row.get(field, "")).startswith("/")
                                                            for field in headers) for row in rows),
                                "statusCounts": status_counts,
                                "selectedCounts": selected_counts,
                                "reasonCounts": reason_counts,
                                "totalScoreValues": [float(row["total_score"]) for row in rows
                                                      if row.get("total_score", "") != ""],
                                "mappedEpisodeIndices": [int(row["mapped_episode_index"])
                                                         for row in rows
                                                         if row.get("mapped_episode_index", "") != ""]})
            else:
                with open(filename, "r", encoding="utf-8") as handle:
                    value = json.load(handle)
                if not isinstance(value, dict):
                    die("REPORT_JSON_SHAPE", key + ":" + relative)
                reports.append({"path": relative, "format": "JSON",
                                "topLevelKeys": sorted(value.keys()),
                                "logicalContentHash": logical_hash(value),
                                "pathFieldsExcludedFromArtifact": sorted(
                                    field for field in ("input_dataset", "output_dataset")
                                    if field in value),
                                "stallCompaction": {
                                  "schemaVersion": value.get("schema_version"),
                                  "inputFrames": value.get("input_frames"),
                                  "outputFrames": value.get("output_frames"),
                                  "removedFrames": value.get("removed_frames"),
                                  "trimmedVideos": value.get("trimmed_videos"),
                                  "cadenceWindowsRemoved": value.get("cadence_windows_removed"),
                                  "actions": value.get("actions"),
                                  "videoNote": value.get("video_note")}})
    return sorted(reports, key=lambda item: item["path"])

results = []
for profile in profiles:
    key = profile["key"]
    expected_frames = profile["frames"]
    data = pq.read_table(obj(key, "data/chunk-000/file-000.parquet"))
    episodes = pq.read_table(obj(key, "meta/episodes/chunk-000/file-000.parquet"))
    tasks = pq.read_table(obj(key, "meta/tasks.parquet"))
    info = read_json(key, "meta/info.json")
    stats = read_json(key, "meta/stats.json")
    if data.num_rows != expected_frames or info.get("total_frames") != expected_frames:
        die("FRAME_COUNT", key)
    if info.get("total_episodes") != 1 or episodes.num_rows != 1:
        die("EPISODE_COUNT", key)
    if info.get("total_tasks") != 1 or tasks.num_rows != 1:
        die("TASK_COUNT", key)
    if info.get("fps") != 20 or info.get("robot_type") != "ur5e_aic":
        die("INFO_PROFILE", key)
    expected_fields = ["action", "episode_index", "frame_index", "index",
                       "observation.state", "task_index", "timestamp"]
    if sorted(data.column_names) != expected_fields:
        die("DATA_FIELDS", key + ":" + repr(data.column_names))
    values = {name: data[name].to_pylist() for name in data.column_names}
    if values["index"] != list(range(expected_frames)) \
       or values["frame_index"] != list(range(expected_frames)) \
       or values["episode_index"] != [0] * expected_frames \
       or values["task_index"] != [0] * expected_frames:
        die("INDEX_ALIGNMENT", key)
    if any(abs(float(value) - (index / 20.0)) > 0.00001
           for index, value in enumerate(values["timestamp"])):
        die("TIMESTAMP_ALIGNMENT", key)
    episode_rows = episodes.to_pylist()
    episode = episode_rows[0]
    if episode.get("episode_index") != 0 or episode.get("length") != expected_frames:
        die("EPISODE_METADATA", key)
    task_rows = tasks.to_pylist()
    task_row = task_rows[0]
    if task_row.get("task_index") != 0 or not isinstance(task_row.get("task"), str) \
       or not task_row.get("task"):
        die("TASK_METADATA", key)
    feature_projection = []
    for name in sorted(info.get("features", {})):
        feature = info["features"][name]
        feature_projection.append({"name": name, "dtype": feature.get("dtype"),
                                   "shape": feature.get("shape"),
                                   "video": feature.get("video_info") is not None})
    observed_names = set(data.column_names) | set(episodes.column_names) \
                     | set(tasks.column_names) | set(info.get("features", {}).keys())
    reports = publisher_reports(key)
    for report in reports:
        observed_names.update(report.get("headers", []))
        observed_names.update(report.get("topLevelKeys", []))
    outcome_like = sorted(name for name in observed_names
                          if re.search(r"(?:^|[._-])(success|failure|reward|done|outcome|terminal)(?:$|[._-])",
                                       str(name), flags=re.I))
    recovery_like = sorted(name for name in observed_names
                           if re.search(r"(?:^|[._-])(recovery|retry|parent_attempt|prior_attempt)(?:$|[._-])",
                                        str(name), flags=re.I))
    results.append({
      "key": key, "frames": data.num_rows, "episodes": episodes.num_rows,
      "fps": info["fps"], "robotType": info["robot_type"],
      "task": task_row["task"], "episodeIndices": [episode["episode_index"]],
      "dataSchema": schema_projection(data),
      "episodeSchema": schema_projection(episodes),
      "taskSchema": schema_projection(tasks),
      "featureProjection": feature_projection,
      "action": vector_summary(values["action"]),
      "state": vector_summary(values["observation.state"]),
      "telemetryLogicalHash": telemetry_hash(data),
      "statsTopLevelKeys": sorted(stats.keys()),
      "publisherReports": reports,
      "sourceNativeOutcomeLikeFields": outcome_like,
      "sourceNativeRecoveryLikeFields": recovery_like,
    })

print(json.dumps({"repositories": results}, sort_keys=True, separators=(",", ":"),
                 allow_nan=False))
`;

export function runUr5eAgentPyarrowReplay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const profiles = UR5E_AGENT_REPOSITORIES.map(({ key, frames }) => ({ key, frames }));
  const executed = spawnSync(python, ["-c", PYARROW_REPLAY,
    path.resolve(sourceDirectory), JSON.stringify(profiles)], {
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
  });
  if (executed.error) fail("PYARROW_EXEC_FAILED", executed.error.message);
  if (executed.status !== 0) fail("PYARROW_REPLAY_FAILED",
    String(executed.stderr || executed.stdout).trim());
  const replay = parseJson(Buffer.from(executed.stdout, "utf8"), "pyarrow-replay");
  if (!plain(replay) || !Array.isArray(replay.repositories)
    || replay.repositories.length !== UR5E_AGENT_PROFILE.repositories
    || replay.repositories.reduce((sum, entry) => sum + entry.frames, 0)
      !== UR5E_AGENT_PROFILE.frames
    || replay.repositories.some((entry) => entry.episodes !== 1
      || entry.fps !== UR5E_AGENT_PROFILE.fps
      || entry.robotType !== UR5E_AGENT_PROFILE.robotType
      || !same(entry.episodeIndices, [0]))) fail("PYARROW_RESULT_INVALID");
  return replay;
}

function publisherNamingClaims() {
  return UR5E_AGENT_REPOSITORIES.map((entry) => ({
    repoKey: entry.key,
    nominalToken: /nominal/iu.test(entry.key),
    recoveryToken: /recovery/iu.test(entry.key),
    attemptToken: /attempt_\d+/iu.test(entry.key),
    successToken: /success/iu.test(entry.key),
    scoreToken: /score_\d+p\d+/iu.test(entry.key),
    claimClass: "PUBLISHER_REPOSITORY_NAMING_ONLY",
  }));
}

function artifactBody(verified, replay) {
  const taskCounts = {};
  for (const entry of replay.repositories) {
    taskCounts[entry.task] = (taskCounts[entry.task] ?? 0) + 1;
  }
  const allObservedOutcomeFields = [...new Set(replay.repositories.flatMap((entry) =>
    entry.sourceNativeOutcomeLikeFields))].sort();
  const allObservedRecoveryFields = [...new Set(replay.repositories.flatMap((entry) =>
    entry.sourceNativeRecoveryLikeFields))].sort();
  const reportFiles = replay.repositories.flatMap((entry) =>
    entry.publisherReports.map((report) => ({
    repoKey: entry.key, ...report,
  })));
  return {
    schema: UR5E_AGENT_ARTIFACT_SCHEMA,
    frozenAt: UR5E_AGENT_FROZEN_AT,
    status: "PINNED_UR5E_AGENT_LINEAGE_NO_VIDEO_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: {
      declaredQuery: UR5E_AGENT_DECLARED_QUERY,
      queryScope: { author: UR5E_AGENT_AUTHOR,
        search: "aic_sfp2nic_agent_expert_trajectory_sample", limit: 100,
        repositories: UR5E_AGENT_PROFILE.repositories,
        declaredFamilyScopeCompleteAtCutoff: true, globallyExhaustive: false },
      pins: UR5E_AGENT_REPOSITORIES.map(({ id, revision }) => ({ id, revision })),
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure,
    },
    replay: {
      allParquetFilesRead: true,
      parquetFilesRead: UR5E_AGENT_PROFILE.parquetFilesReplayed,
      episodes: UR5E_AGENT_PROFILE.episodes,
      frames: UR5E_AGENT_PROFILE.frames,
      fps: UR5E_AGENT_PROFILE.fps,
      robotType: UR5E_AGENT_PROFILE.robotType,
      taskCounts,
      reportFiles,
      repositories: replay.repositories,
    },
    publisherNamingClaims: publisherNamingClaims(),
    evidenceSemantics: {
      telemetryAndMetadataPresent: true,
      rawVideoPresentInPublisherTrees: true,
      rawVideoAcquired: false,
      visualReplay: false,
      repositoryNamesContainAttemptRecoverySuccessOrScoreClaims: true,
      publisherSelectionReportPresent: reportFiles.some((entry) =>
        /selection/iu.test(entry.path)),
      publisherStallCompactionReportPresent: reportFiles.some((entry) =>
        /stall/iu.test(entry.path)),
      selectionStatusAndScoreArePublisherReportFieldsNotIndependentOutcome: true,
      stallCompactionIsPreprocessingMetadataNotRecoveryOutcome: true,
      publisherNamingIsDirectOutcomeEvidence: false,
      sourceNativeOutcomeLikeFields: allObservedOutcomeFields,
      sourceNativeRecoveryLikeFields: allObservedRecoveryFields,
      directTerminalOutcomeEstablished: false,
      independentOutcomeEstablished: false,
      recoveryEventEstablished: false,
      failureToRecoveryPairEstablished: false,
      attemptChronologyEstablished: false,
      physicalExternalEffectEstablished: false,
      externalEffectReceiptPresent: false,
      completePublishedEpisodeCensusWithinPins: true,
      completeUpstreamAttemptCensus: false,
    },
    rights: {
      repositoryCardLicenseClaim: null,
      repositoryLicenseFilePresent: false,
      rightsDisposition: "FAIL_CLOSED",
      rightsStatus: "FAIL_CLOSED_NO_DATASET_LICENSE",
      useBoundary: "QUARANTINE_EVAL_ONLY",
      productionTrainingAllowed: false,
    },
    privacy: {
      videoBytesExcluded: true,
      imagePixelsReplayed: false,
      privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false,
      noPiiEstablished: false,
      absoluteFilesystemPathsPresentInRawSelectionReport: true,
      absoluteFilesystemPathValuesRepublishedInArtifact: false,
    },
    boundary: {
      privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
      action: 0, delegation: 0, directOutcome: 0,
      independentOutcome: 0, recovery: 0, externalEffect: 0,
    },
  };
}

export function ur5eAgentArtifactHash(body) {
  return digest("outsider/ur5e-agent-recovery-lineage/v1", body);
}

export function buildUr5eAgentLineageFromSource(sourceDirectory, options = {}) {
  const verified = verifyUr5eAgentLineageSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runUr5eAgentPyarrowReplay(sourceDirectory, options);
  const body = artifactBody(verified, replay);
  const artifact = { ...body, artifactHash: ur5eAgentArtifactHash(body) };
  const checked = verifyUr5eAgentLineageArtifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifyUr5eAgentLineageArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== UR5E_AGENT_ARTIFACT_SCHEMA
      || artifact.frozenAt !== UR5E_AGENT_FROZEN_AT
      || artifact.status !== "PINNED_UR5E_AGENT_LINEAGE_NO_VIDEO_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== ur5eAgentArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (!plain(artifact.source) || artifact.source.pins?.length !== 12
      || artifact.source.queryScope?.globallyExhaustive !== false
      || artifact.source.closure?.completeNoVideoClosure !== true
      || artifact.source.closure?.videosInventoried !== 36
      || artifact.source.closure?.videoObjectsAcquired !== 0
      || artifact.source.closure?.licenseFilesPresent !== 0) {
      fail("ARTIFACT_SOURCE_BOUNDARY_INVALID");
    }
    if (artifact.replay?.allParquetFilesRead !== true
      || artifact.replay?.parquetFilesRead !== 36
      || artifact.replay?.episodes !== 12 || artifact.replay?.frames !== 10_472
      || artifact.replay?.fps !== 20 || artifact.replay?.robotType !== "ur5e_aic"
      || artifact.replay?.repositories?.length !== 12
      || artifact.replay.repositories.some((entry) =>
        !same(entry.episodeIndices, [0])
        || !same(entry.dataSchema.map((field) => field.name).sort(), DATA_FIELDS))) {
      fail("ARTIFACT_REPLAY_INVALID");
    }
    if (artifact.evidenceSemantics?.publisherNamingIsDirectOutcomeEvidence !== false
      || artifact.evidenceSemantics?.directTerminalOutcomeEstablished !== false
      || artifact.evidenceSemantics?.independentOutcomeEstablished !== false
      || artifact.evidenceSemantics?.recoveryEventEstablished !== false
      || artifact.evidenceSemantics?.failureToRecoveryPairEstablished !== false
      || artifact.evidenceSemantics?.attemptChronologyEstablished !== false
      || artifact.evidenceSemantics?.physicalExternalEffectEstablished !== false
      || artifact.evidenceSemantics?.externalEffectReceiptPresent !== false
      || artifact.evidenceSemantics?.completeUpstreamAttemptCensus !== false) {
      fail("ARTIFACT_SEMANTIC_PROMOTION");
    }
    if (!same(artifact.rights, {
      repositoryCardLicenseClaim: null, repositoryLicenseFilePresent: false,
      rightsDisposition: "FAIL_CLOSED",
      rightsStatus: "FAIL_CLOSED_NO_DATASET_LICENSE",
      useBoundary: "QUARANTINE_EVAL_ONLY", productionTrainingAllowed: false,
    })) fail("ARTIFACT_RIGHTS_INVALID");
    if (!same(artifact.boundary, {
      privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
      action: 0, delegation: 0, directOutcome: 0,
      independentOutcome: 0, recovery: 0, externalEffect: 0,
    })) fail("ARTIFACT_BOUNDARY_INVALID");
    if (artifact.privacy?.privacyReviewComplete !== false
      || artifact.privacy?.noPiiEstablished !== false
      || artifact.privacy?.imagePixelsReplayed !== false) fail("ARTIFACT_PRIVACY_INVALID");
    return { ok: true, artifactHash,
      verificationLevel: "STANDALONE_HASH_AND_FAIL_CLOSED_LINEAGE_SEMANTICS" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyUr5eAgentLineageArtifactWithSource(artifact,
  sourceDirectory, options = {}) {
  const standalone = verifyUr5eAgentLineageArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildUr5eAgentLineageFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel: "FULL_12_REPOSITORY_NO_VIDEO_BYTE_AND_PYARROW_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
