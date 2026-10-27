/*
 * Complete fixed-revision intake of obaydata/mcp-agent-trajectory-benchmark.
 * All 413 files are acquired and parsed as inert bytes/data.  Python servers,
 * command strings, MCP arguments and tool payloads are never executed.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, rmSync, unlinkSync, writeSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const MCP_TRAJECTORY_ID = "obaydata/mcp-agent-trajectory-benchmark";
export const MCP_TRAJECTORY_REVISION =
  "f4f449d65271abc1e4ccd5157d121a59a1dd38c4";
export const MCP_TRAJECTORY_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const MCP_TRAJECTORY_SOURCE_SCHEMA =
  "outsider/mcp-agent-trajectory-benchmark-source/v1";
export const MCP_TRAJECTORY_ARTIFACT_SCHEMA =
  "outsider/mcp-agent-trajectory-benchmark/v1";
export const MCP_TRAJECTORY_PROFILE = Object.freeze({
  usedStorage: 13_507,
  treeEntries: 501,
  treeDirectories: 88,
  treeFiles: 413,
  treeBytes: 3_605_902,
  publisherClaimedTrajectories: 49,
  publisherClaimedSinglePass: 38,
  publisherClaimedMultiConversation: 11,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const MAX_API_BYTES = 8 * 1024 * 1024;
const MAX_OBJECT_BYTES = 8 * 1024 * 1024;
const FETCH_ATTEMPTS = 4;
const FETCH_CONCURRENCY = 8;

function fail(code, detail = null) {
  throw new Error(detail === null ? `MCP_TRAJECTORY_${code}`
    : `MCP_TRAJECTORY_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function mcpTrajectorySha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return mcpTrajectorySha256(Buffer.from(
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

function endpoints() {
  const encoded = MCP_TRAJECTORY_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${MCP_TRAJECTORY_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${MCP_TRAJECTORY_REVISION}`
      + "?recursive=true&expand=false&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${MCP_TRAJECTORY_REVISION}`,
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

function repositoryProjection(value) {
  if (!plain(value) || !Array.isArray(value.siblings)) fail("REPOSITORY_INVALID");
  const siblingPaths = value.siblings.map((entry) => entry?.rfilename)
    .sort((left, right) => String(left).localeCompare(String(right)));
  if (siblingPaths.some((entry) => !safeRemotePath(entry))
    || new Set(siblingPaths).size !== siblingPaths.length) {
    fail("REPOSITORY_PATHS_INVALID");
  }
  const projection = { id: value.id, sha: value.sha, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage ?? null,
    cardLicense: value.cardData?.license ?? null, siblingPaths };
  if (projection.id !== MCP_TRAJECTORY_ID
    || projection.sha !== MCP_TRAJECTORY_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false
    || projection.usedStorage !== MCP_TRAJECTORY_PROFILE.usedStorage
    || projection.cardLicense !== "apache-2.0"
    || projection.siblingPaths.length !== MCP_TRAJECTORY_PROFILE.treeFiles) {
    fail("REPOSITORY_PROFILE_INVALID");
  }
  return projection;
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

function projectTree(value) {
  if (!Array.isArray(value)) fail("TREE_INVALID");
  const projection = value.map(treeEntry)
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(projection.map((entry) => entry.path)).size !== projection.length) {
    fail("TREE_DUPLICATE_PATH");
  }
  const files = projection.filter((entry) => entry.type === "file");
  const directories = projection.filter((entry) => entry.type === "directory");
  const bytes = files.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (projection.length !== MCP_TRAJECTORY_PROFILE.treeEntries
    || files.length !== MCP_TRAJECTORY_PROFILE.treeFiles
    || directories.length !== MCP_TRAJECTORY_PROFILE.treeDirectories
    || bytes !== MCP_TRAJECTORY_PROFILE.treeBytes) fail("TREE_PROFILE_INVALID");
  return { projection, files, directories, bytes,
    treeHash: digest("outsider/mcp-trajectory-tree/v1", projection) };
}

function validateRecordTree(record, tree) {
  const repository = repositoryProjection(record);
  const projectedTree = projectTree(tree);
  if (!same(repository.siblingPaths,
    projectedTree.files.map((entry) => entry.path)
      .sort((left, right) => left.localeCompare(right)))) {
    fail("REPOSITORY_TREE_FILE_SET_MISMATCH");
  }
  return { repository, tree: projectedTree };
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

function snapshotDescriptor(phase, kind, url, fetched, file) {
  return { phase, kind, requestUrl: url, finalUrl: fetched.finalUrl,
    status: fetched.status, contentType: fetched.contentType,
    link: fetched.link, file, bytes: fetched.bytes.length,
    sha256: mcpTrajectorySha256(fetched.bytes) };
}

async function captureSnapshotSet(root, phase, fetchImpl) {
  const temporary = path.join(root, `.${phase}.tmp-${process.pid}`);
  if (existsSync(temporary)) rmSync(temporary, { recursive: true, force: true });
  mkdirSync(temporary, { mode: 0o700 });
  const endpoint = endpoints();
  try {
    const [record, tree] = await Promise.all([
      fetchJson(endpoint.repository, fetchImpl), fetchJson(endpoint.tree, fetchImpl),
    ]);
    if (tree.link !== null) fail("TREE_PAGINATION_NOT_CLOSED");
    validateRecordTree(record.value, tree.value);
    writePrivateOnce(path.join(temporary, "repository.json"), record.bytes);
    writePrivateOnce(path.join(temporary, "tree.json"), tree.bytes);
    const descriptors = [
      snapshotDescriptor(phase, "repository", endpoint.repository, record,
        `api/${phase}/repository.json`),
      snapshotDescriptor(phase, "tree", endpoint.tree, tree,
        `api/${phase}/tree.json`),
    ];
    const finalRoot = path.join(root, "api", phase);
    ensurePrivateDirectory(path.dirname(finalRoot));
    if (existsSync(finalRoot)) fail("SNAPSHOT_PHASE_EXISTS", phase);
    renameSync(temporary, finalRoot);
    return descriptors;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function readSnapshot(root, descriptor) {
  const bytes = readRegular(safeJoin(root, descriptor.file), descriptor.bytes);
  if (mcpTrajectorySha256(bytes) !== descriptor.sha256) {
    fail("SNAPSHOT_HASH_INVALID", descriptor.file);
  }
  return parseJson(bytes, descriptor.file);
}

function snapshotsFor(root, descriptors, phase) {
  const record = descriptors.find((entry) => entry.phase === phase
    && entry.kind === "repository");
  const tree = descriptors.find((entry) => entry.phase === phase
    && entry.kind === "tree");
  if (!record || !tree) fail("SNAPSHOT_MISSING", phase);
  return { record: readSnapshot(root, record), tree: readSnapshot(root, tree) };
}

function compareSnapshots(before, after) {
  const left = validateRecordTree(before.record, before.tree);
  const right = validateRecordTree(after.record, after.tree);
  if (!same(left, right)) fail("PINNED_SOURCE_CHANGED_DURING_ACQUISITION");
}

function objectRelative(entry) {
  return `objects/${entry.path}`;
}

function verifyObjectBytes(bytes, entry) {
  if (bytes.length !== entry.sizeBytes) fail("OBJECT_SIZE_INVALID", entry.path);
  const sha256 = mcpTrajectorySha256(bytes);
  if (entry.lfsSha256 !== null ? sha256 !== entry.lfsSha256
    : gitBlobOid(bytes) !== entry.oid) fail("OBJECT_TREE_HASH_INVALID", entry.path);
  return sha256;
}

async function downloadOrReuse(root, entry, fetchImpl) {
  const url = `${endpoints().raw}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const relative = objectRelative(entry);
  const local = safeJoin(root, relative);
  if (existsSync(local)) {
    const bytes = readRegular(local, entry.sizeBytes);
    return { path: entry.path, file: relative, requestUrl: url, finalUrl: url,
      status: 200, contentType: null, bytes: bytes.length,
      sha256: verifyObjectBytes(bytes, entry), gitOid: entry.oid,
      lfsSha256: entry.lfsSha256,
      retrieval: "CHECKPOINT_REUSED_VERIFIED_BYTES" };
  }
  const fetched = await boundedFetch(url,
    Math.min(MAX_OBJECT_BYTES, entry.sizeBytes + 1), fetchImpl);
  const sha256 = verifyObjectBytes(fetched.bytes, entry);
  writePrivateOnce(local, fetched.bytes);
  return { path: entry.path, file: relative, requestUrl: url,
    finalUrl: fetched.finalUrl, status: fetched.status,
    contentType: fetched.contentType, bytes: fetched.bytes.length, sha256,
    gitOid: entry.oid, lfsSha256: entry.lfsSha256, retrieval: "NETWORK_FETCH" };
}

function checkpointMarker() {
  return { schema: "outsider/mcp-agent-trajectory-checkpoint/v1",
    id: MCP_TRAJECTORY_ID, revision: MCP_TRAJECTORY_REVISION };
}

function initializeCheckpoint(root) {
  if (!existsSync(root)) {
    mkdirSync(root, { recursive: true, mode: 0o700 });
    writePrivateOnce(path.join(root, "checkpoint-marker.json"),
      canonicalBytes(checkpointMarker()));
  }
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("CHECKPOINT_UNSAFE", root);
  const marker = parseJson(readRegular(path.join(root, "checkpoint-marker.json")),
    "checkpoint-marker.json");
  if (!same(marker, checkpointMarker())) fail("CHECKPOINT_MARKER_INVALID");
  const stateFile = path.join(root, "checkpoint-state.json");
  if (!existsSync(stateFile)) return { beforeDescriptors: null,
    remoteObjects: [], afterDescriptors: null };
  const state = parseJson(readRegular(stateFile), "checkpoint-state.json");
  if (!plain(state) || !Array.isArray(state.remoteObjects)) {
    fail("CHECKPOINT_STATE_INVALID");
  }
  return state;
}

function saveCheckpoint(root, state) {
  replacePrivateJson(path.join(root, "checkpoint-state.json"), state);
}

function sourceRootFor(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots.map((entry) => ({ file: entry.file,
    bytes: entry.bytes, sha256: entry.sha256 })),
  ...remoteObjects.map((entry) => ({ file: entry.file,
    bytes: entry.bytes, sha256: entry.sha256 }))]
    .sort((left, right) => left.file.localeCompare(right.file));
  return { files,
    sourceRoot: digest("outsider/mcp-agent-trajectory-source-root/v1", files) };
}

function extension(pathname) {
  const base = path.posix.basename(pathname);
  if (base === ".gitattributes") return ".gitattributes";
  const value = path.posix.extname(pathname).toLowerCase();
  return value || "[none]";
}

function closureFrom(tree) {
  const extensionCounts = {};
  const extensionBytes = {};
  for (const entry of tree.files) {
    const ext = extension(entry.path);
    extensionCounts[ext] = (extensionCounts[ext] ?? 0) + 1;
    extensionBytes[ext] = (extensionBytes[ext] ?? 0) + entry.sizeBytes;
  }
  const trajectories = tree.files.filter((entry) =>
    /(?:^|\/)trajectory\.json$/u.test(entry.path));
  const standard = trajectories.filter((entry) => !entry.path.startsWith("multi_conv/"));
  const multi = trajectories.filter((entry) => entry.path.startsWith("multi_conv/"));
  const licensePaths = tree.files.filter((entry) =>
    /(?:^|\/)(?:licen[cs]e|copying|notice)(?:\.|$)/iu.test(entry.path));
  return { fullFixedRepository: true, selectedObjects: tree.files.length,
    selectedBytes: tree.bytes, recursiveTreeEntries: tree.projection.length,
    recursiveTreeDirectories: tree.directories.length,
    recursiveTreeFiles: tree.files.length,
    recursiveTreeHash: tree.treeHash,
    recursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreePagesPerPhase: 1,
    trajectoryFiles: trajectories.length,
    standardTrajectoryFiles: standard.length,
    multiConversationTrajectoryFiles: multi.length,
    extensionCounts, extensionBytes,
    licenseFilesPresent: licensePaths.length,
    licensePaths: licensePaths.map((entry) => entry.path),
    executablePayloadsExecuted: 0,
    completePublishedFileCensus: true,
    globallyExhaustive: false };
}

function sourceManifestHash(body) {
  return digest("outsider/mcp-agent-trajectory-source-manifest/v1", body);
}

export async function acquirePinnedMcpTrajectorySource(sourceDirectory,
  options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPL_INVALID");
  if (existsSync(sourceDirectory)) fail("SOURCE_EXISTS", sourceDirectory);
  ensurePrivateDirectory(path.dirname(path.resolve(sourceDirectory)));
  const checkpoint = options.checkpointDirectory
    ?? `${path.resolve(sourceDirectory)}.checkpoint`;
  const state = initializeCheckpoint(checkpoint);
  try {
    if (state.beforeDescriptors === null) {
      state.beforeDescriptors = await captureSnapshotSet(checkpoint, "before", fetchImpl);
      saveCheckpoint(checkpoint, state);
    }
    const before = snapshotsFor(checkpoint, state.beforeDescriptors, "before");
    const joined = validateRecordTree(before.record, before.tree);
    const completed = new Map(state.remoteObjects.map((entry) => [entry.path, entry]));
    await mapConcurrent(joined.tree.files, FETCH_CONCURRENCY, async (entry) => {
      const prior = completed.get(entry.path);
      if (prior) {
        verifyObjectBytes(readRegular(safeJoin(checkpoint, prior.file), prior.bytes), entry);
        return prior;
      }
      const descriptor = await downloadOrReuse(checkpoint, entry, fetchImpl);
      completed.set(entry.path, descriptor);
      state.remoteObjects = [...completed.values()]
        .sort((left, right) => left.file.localeCompare(right.file));
      saveCheckpoint(checkpoint, state);
      return descriptor;
    });
    state.remoteObjects = [...completed.values()]
      .sort((left, right) => left.file.localeCompare(right.file));
    if (state.remoteObjects.length !== MCP_TRAJECTORY_PROFILE.treeFiles) {
      fail("REMOTE_OBJECT_CENSUS_INVALID");
    }
    if (state.afterDescriptors === null) {
      state.afterDescriptors = await captureSnapshotSet(checkpoint, "after", fetchImpl);
      saveCheckpoint(checkpoint, state);
    }
    const after = snapshotsFor(checkpoint, state.afterDescriptors, "after");
    compareSnapshots(before, after);
    const apiSnapshots = [...state.beforeDescriptors, ...state.afterDescriptors]
      .sort((left, right) => left.file.localeCompare(right.file));
    const rooted = sourceRootFor(apiSnapshots, state.remoteObjects);
    const manifestBody = { schema: MCP_TRAJECTORY_SOURCE_SCHEMA,
      frozenAt: MCP_TRAJECTORY_FROZEN_AT,
      datasetId: MCP_TRAJECTORY_ID, revision: MCP_TRAJECTORY_REVISION,
      apiSnapshots, remoteObjects: state.remoteObjects,
      sourceFiles: rooted.files, sourceRoot: rooted.sourceRoot,
      closure: closureFrom(joined.tree) };
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
    try { enforcePrivateTree(checkpoint); } catch { /* preserve primary error */ }
    throw error;
  }
}

function verifyRemoteObjects(root, manifest, tree) {
  if (!Array.isArray(manifest.remoteObjects)
    || manifest.remoteObjects.length !== tree.files.length) {
    fail("REMOTE_OBJECT_CENSUS_INVALID");
  }
  if (!same(manifest.remoteObjects.map((entry) => entry.path).sort(),
    tree.files.map((entry) => entry.path).sort())) fail("REMOTE_OBJECT_SET_INVALID");
  for (const descriptor of manifest.remoteObjects) {
    const entry = tree.files.find((item) => item.path === descriptor.path);
    if (!entry || descriptor.file !== objectRelative(entry)
      || descriptor.bytes !== entry.sizeBytes || descriptor.gitOid !== entry.oid
      || descriptor.lfsSha256 !== entry.lfsSha256
      || !HASH.test(descriptor.sha256 ?? "") || descriptor.status !== 200
      || !permittedUrl(descriptor.requestUrl) || !permittedUrl(descriptor.finalUrl)) {
      fail("REMOTE_DESCRIPTOR_INVALID", descriptor.file);
    }
    const bytes = readRegular(safeJoin(root, descriptor.file), descriptor.bytes);
    if (mcpTrajectorySha256(bytes) !== descriptor.sha256) {
      fail("REMOTE_HASH_INVALID", descriptor.file);
    }
    verifyObjectBytes(bytes, entry);
  }
}

export function verifyMcpTrajectorySourceDirectory(sourceDirectory) {
  try {
    const stat = lstatSync(sourceDirectory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("SOURCE_DIRECTORY_UNSAFE");
    const manifest = parseJson(readRegular(path.join(sourceDirectory,
      "acquisition-manifest.json")), "acquisition-manifest.json");
    if (!plain(manifest) || manifest.schema !== MCP_TRAJECTORY_SOURCE_SCHEMA
      || manifest.frozenAt !== MCP_TRAJECTORY_FROZEN_AT
      || manifest.datasetId !== MCP_TRAJECTORY_ID
      || manifest.revision !== MCP_TRAJECTORY_REVISION
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 4
      || !Array.isArray(manifest.sourceFiles) || !HASH.test(manifest.sourceRoot ?? "")
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_SHAPE_INVALID");
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
    const joined = validateRecordTree(before.record, before.tree);
    verifyRemoteObjects(sourceDirectory, manifest, joined.tree);
    const rooted = sourceRootFor(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles)
      || rooted.sourceRoot !== manifest.sourceRoot) fail("SOURCE_ROOT_INVALID");
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"]
      .sort((left, right) => left.localeCompare(right));
    if (!same(walkRelative(sourceDirectory), expectedFiles)) {
      fail("SOURCE_FILE_CLOSURE_INVALID");
    }
    if (!same(manifest.closure, closureFrom(joined.tree))) fail("CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== sourceManifestHash(body)) fail("MANIFEST_HASH_INVALID");
    return { ok: true, manifest, before, after, tree: joined.tree,
      verificationLevel: "PINNED_FULL_413_FILE_REPOSITORY_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function sourceObject(sourceDirectory, remotePath) {
  return safeJoin(sourceDirectory, `objects/${remotePath}`);
}

function parseJsonl(bytes, label) {
  const text = bytes.toString("utf8");
  const lines = text.split(/\r?\n/u).filter((line) => line.length > 0);
  const records = lines.map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { fail("JSONL_INVALID", `${label}:${index + 1}:${error.message}`); }
  });
  return { records, lines };
}

function structuralSummary(value) {
  const paths = new Set();
  const counts = { arrays: 0, objects: 0, strings: 0,
    numbers: 0, booleans: 0, nulls: 0 };
  const keyCounts = {};
  const toolCalls = [];
  const toolResults = [];
  const successBooleans = [];
  const messageRoles = {};
  const commandLikeFields = [];
  const recoveryLinkFields = [];
  const judgeLikeFields = [];
  function visit(node, current, parentKey = null) {
    if (Array.isArray(node)) {
      counts.arrays += 1;
      paths.add(`${current}[]`);
      for (const item of node) visit(item, `${current}[]`, parentKey);
      return;
    }
    if (plain(node)) {
      counts.objects += 1;
      if (typeof node.role === "string") {
        messageRoles[node.role] = (messageRoles[node.role] ?? 0) + 1;
      }
      if (parentKey === "tool_calls") {
        toolCalls.push({ id: node.tool_call_id ?? node.id ?? null,
          name: node.function_name ?? node.tool_name ?? node.function?.name ?? null,
          argumentsPresent: node.arguments != null || node.function?.arguments != null });
      }
      if ((parentKey === "results" && node.source_call_id != null)
        || node.role === "tool" || parentKey === "tool_results") {
        toolResults.push({ sourceCallId: node.source_call_id ?? node.tool_call_id ?? null });
      }
      for (const key of Object.keys(node).sort()) {
        keyCounts[key] = (keyCounts[key] ?? 0) + 1;
        const child = `${current}.${key}`;
        paths.add(child);
        if (key === "success" && typeof node[key] === "boolean") {
          successBooleans.push(node[key]);
        }
        if (/^(?:command|cmd|shell_command|tool_payload)$/iu.test(key)) {
          commandLikeFields.push(child);
        }
        if (/^(?:recovery_of|retry_of|parent_attempt|prior_attempt)$/iu.test(key)) {
          recoveryLinkFields.push(child);
        }
        if (/^(?:judge|verdict|reward|grader|correctness)$/iu.test(key)) {
          judgeLikeFields.push(child);
        }
        visit(node[key], child, key);
      }
      return;
    }
    if (node === null) counts.nulls += 1;
    else if (typeof node === "string") counts.strings += 1;
    else if (typeof node === "number") counts.numbers += 1;
    else if (typeof node === "boolean") counts.booleans += 1;
    else fail("JSON_TYPE_UNSUPPORTED", typeof node);
    paths.add(`${current}:${node === null ? "null" : typeof node}`);
  }
  visit(value, "$", null);
  const sortedPaths = [...paths].sort();
  return { counts, keyCounts, structuralPaths: sortedPaths.length,
    structuralPathHash: digest("outsider/mcp-trajectory-structural-paths/v1", sortedPaths),
    toolCalls, toolResults, successBooleans, messageRoles,
    commandLikeFields: commandLikeFields.length,
    recoveryLinkFields: recoveryLinkFields.length,
    judgeLikeFields: judgeLikeFields.length };
}

function atifReplay(remotePath, value, summary) {
  if (!plain(value) || value.schema_version !== "ATIF-v1.2"
    || !Array.isArray(value.steps) || value.steps.length < 1) {
    fail("ATIF_SHAPE_INVALID", remotePath);
  }
  const stepIds = value.steps.map((step) => step?.step_id);
  const sourceCounts = {};
  const modelCounts = {};
  const toolNames = {};
  let toolCalls = 0;
  let toolResults = 0;
  let matchedResults = 0;
  let unmatchedCalls = 0;
  let unmatchedResults = 0;
  let usageSteps = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let cacheTokens = 0;
  let turnCompleteTrue = 0;
  for (const step of value.steps) {
    if (!plain(step) || typeof step.source !== "string") {
      fail("ATIF_STEP_INVALID", remotePath);
    }
    sourceCounts[step.source] = (sourceCounts[step.source] ?? 0) + 1;
    if (typeof step.model_name === "string") {
      modelCounts[step.model_name] = (modelCounts[step.model_name] ?? 0) + 1;
    }
    const calls = Array.isArray(step.tool_calls) ? step.tool_calls : [];
    const results = Array.isArray(step.observation?.results)
      ? step.observation.results : [];
    toolCalls += calls.length;
    toolResults += results.length;
    const callIds = new Set(calls.map((call) => call?.tool_call_id));
    const resultIds = new Set(results.map((result) => result?.source_call_id));
    matchedResults += [...resultIds].filter((id) => callIds.has(id)).length;
    unmatchedCalls += [...callIds].filter((id) => !resultIds.has(id)).length;
    unmatchedResults += [...resultIds].filter((id) => !callIds.has(id)).length;
    for (const call of calls) {
      if (!plain(call) || typeof call.function_name !== "string"
        || !plain(call.arguments) || typeof call.tool_call_id !== "string") {
        fail("ATIF_TOOL_CALL_INVALID", remotePath);
      }
      toolNames[call.function_name] = (toolNames[call.function_name] ?? 0) + 1;
    }
    for (const result of results) {
      if (!plain(result) || typeof result.source_call_id !== "string"
        || typeof result.content !== "string") fail("ATIF_TOOL_RESULT_INVALID", remotePath);
    }
    if (plain(step.usage)) {
      usageSteps += 1;
      promptTokens += Number(step.usage.prompt_tokens ?? 0);
      completionTokens += Number(step.usage.completion_tokens ?? 0);
      cacheTokens += Number(step.usage.cache_tokens ?? 0);
    }
    if (step.extra?.is_turn_complete === true) turnCompleteTrue += 1;
  }
  return { schemaVersion: value.schema_version, sessionId: value.session_id ?? null,
    agentName: value.agent?.name ?? null, agentVersion: value.agent?.version ?? null,
    modelName: value.agent?.model_name ?? null,
    steps: value.steps.length, sequentialStepIds: same(stepIds,
      Array.from({ length: value.steps.length }, (_, index) => index + 1)),
    sourceCounts, modelCounts, toolCalls, toolResults, matchedResults,
    unmatchedCalls, unmatchedResults, toolNames,
    usage: { steps: usageSteps, promptTokens, completionTokens, cacheTokens },
    turnCompleteTrue, lastStepTurnComplete:
      value.steps.at(-1)?.extra?.is_turn_complete === true,
    publisherSuccessBooleanCount: summary.successBooleans.length,
    recoveryLinkFields: summary.recoveryLinkFields,
    judgeLikeFields: summary.judgeLikeFields };
}

function trajectoryReplay(remotePath, bytes) {
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch (error) {
    if (!remotePath.startsWith("multi_conv/")) {
      fail("STANDARD_TRAJECTORY_JSON_INVALID", `${remotePath}:${error.message}`);
    }
    const text = bytes.toString("utf8");
    return { path: remotePath, bytes: bytes.length,
      byteHash: mcpTrajectorySha256(bytes), logicalHash: null,
      classification: "PUBLISHER_MULTI_CONV_MALFORMED_JSON",
      rootType: null, rootKeys: [], units: 0, jsonParsed: false,
      parseError: String(error.message), structural: null,
      observedToolCalls: [...text.matchAll(/"tool_calls"\s*:/gu)].length,
      observedToolResults: [...text.matchAll(/"(?:tool_results|results)"\s*:/gu)].length,
      publisherSuccessTrue: [...text.matchAll(/"success"\s*:\s*true/gu)].length,
      publisherSuccessFalse: [...text.matchAll(/"success"\s*:\s*false/gu)].length,
      recoveryLinkFields: 0, judgeLikeFields: 0, atif: null };
  }
  const summary = structuralSummary(value);
  const standard = !remotePath.startsWith("multi_conv/");
  const classification = standard ? "STANDARD_ATIF_V1_2"
    : Array.isArray(value) ? "PUBLISHER_MULTI_CONV_ARRAY"
      : "PUBLISHER_MULTI_CONV_OBJECT";
  const units = Array.isArray(value) ? value.length : 1;
  const atif = standard ? atifReplay(remotePath, value, summary) : null;
  return { path: remotePath, bytes: bytes.length,
    byteHash: mcpTrajectorySha256(bytes),
    logicalHash: digest("outsider/mcp-trajectory-json/v1", value),
    classification, rootType: Array.isArray(value) ? "array" : "object",
    jsonParsed: true,
    rootKeys: plain(value) ? Object.keys(value).sort() : [], units,
    structural: { counts: summary.counts,
      structuralPaths: summary.structuralPaths,
      structuralPathHash: summary.structuralPathHash,
      messageRoles: summary.messageRoles,
      commandLikeFields: summary.commandLikeFields },
    observedToolCalls: summary.toolCalls.length,
    observedToolResults: summary.toolResults.length,
    publisherSuccessTrue: summary.successBooleans.filter(Boolean).length,
    publisherSuccessFalse: summary.successBooleans.filter((item) => !item).length,
    recoveryLinkFields: summary.recoveryLinkFields,
    judgeLikeFields: summary.judgeLikeFields,
    atif };
}

function jsonlReplay(remotePath, bytes) {
  const parsed = parseJsonl(bytes, remotePath);
  const keySets = [...new Set(parsed.records.map((entry) =>
    plain(entry) ? Object.keys(entry).sort().join("\0") : `[${typeof entry}]`))].sort();
  return { path: remotePath, bytes: bytes.length,
    byteHash: mcpTrajectorySha256(bytes), recordCount: parsed.records.length,
    logicalHash: digest("outsider/mcp-trajectory-jsonl/v1", parsed.records),
    recordKeySets: keySets.map((entry) => entry.split("\0")),
    records: parsed.records };
}

function readUtf8(bytes, label) {
  const text = bytes.toString("utf8");
  if (Buffer.from(text, "utf8").compare(bytes) !== 0) fail("UTF8_INVALID", label);
  return text;
}

function replayPython(remotePath, bytes) {
  const text = readUtf8(bytes, remotePath);
  return { path: remotePath, bytes: bytes.length,
    byteHash: mcpTrajectorySha256(bytes),
    definitions: [...text.matchAll(/^\s*(?:async\s+)?def\s+[A-Za-z_]\w*\s*\(/gmu)].length,
    classes: [...text.matchAll(/^\s*class\s+[A-Za-z_]\w*/gmu)].length,
    toolDecorators: [...text.matchAll(/^\s*@[^\n]*(?:tool|resource|prompt)[^\n]*$/gimu)].length,
    importStatements: [...text.matchAll(/^\s*(?:from\s+\S+\s+)?import\s+/gmu)].length,
    executed: false };
}

function trainCrosswalk(train, conversations, trajectories) {
  const topAtif = trajectories.filter((entry) =>
    entry.classification === "STANDARD_ATIF_V1_2");
  let summaryParsed = 0;
  let conversationParsed = 0;
  let trajectoryFound = 0;
  let sessionMatches = 0;
  let modelMatches = 0;
  let stepMatches = 0;
  let toolCallMatches = 0;
  let conversationMatches = 0;
  const domains = {};
  for (const row of train.records) {
    if (!plain(row) || typeof row.agent_name !== "string"
      || typeof row.domain !== "string" || typeof row.conversation !== "string"
      || typeof row.trajectory_summary !== "string") fail("TRAIN_ROW_INVALID");
    let summary;
    try { summary = JSON.parse(row.trajectory_summary); summaryParsed += 1; }
    catch { fail("TRAIN_SUMMARY_INVALID", row.agent_name); }
    const embeddedConversation = parseJsonl(Buffer.from(row.conversation, "utf8"),
      `train:${row.agent_name}`).records;
    conversationParsed += 1;
    const trajectory = topAtif.find((entry) =>
      entry.path === `${row.agent_name}/trajectory.json`);
    const conversation = conversations.find((entry) =>
      entry.path === `${row.agent_name}/conversation.jsonl`);
    if (trajectory) trajectoryFound += 1;
    if (summary.session_id === trajectory?.atif?.sessionId) sessionMatches += 1;
    if (summary.model === trajectory?.atif?.modelName) modelMatches += 1;
    if (summary.num_steps === trajectory?.atif?.steps) stepMatches += 1;
    if (summary.tool_call_count === trajectory?.atif?.toolCalls) toolCallMatches += 1;
    if (conversation && same(embeddedConversation, conversation.records)) {
      conversationMatches += 1;
    }
    domains[row.domain] = (domains[row.domain] ?? 0) + 1;
  }
  return { rows: train.records.length, summaryJsonParsed: summaryParsed,
    embeddedConversationJsonlParsed: conversationParsed,
    exactTopLevelTrajectoryFound: trajectoryFound,
    sessionIdMatches: sessionMatches, modelMatches, stepCountMatches: stepMatches,
    toolCallCountMatches: toolCallMatches,
    exactConversationMatches: conversationMatches, domains };
}

function readmeClaims(text) {
  return {
    apache2YamlClaim: /^license:\s*apache-2\.0\s*$/mu.test(text),
    total49Claim: /49 MCP[^\n]*agent trajectories/iu.test(text)
      || /Total trajectories[^\n]*49/iu.test(text),
    singlePass38Claim: /38[^\n]*(?:single-pass|ATIF)/iu.test(text),
    multiConversation11Claim: /11[^\n]*(?:multi-conv|multi.?conversation)/iu.test(text),
    atif12Claim: /ATIF v1\.2/iu.test(text),
    realOpenClawClaim: /real OpenClaw/iu.test(text),
    syntheticClaim: /synthetic/iu.test(text),
  };
}

export function replayMcpTrajectoryRepository(sourceDirectory) {
  const verified = verifyMcpTrajectorySourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const descriptorByPath = new Map(verified.manifest.remoteObjects.map((entry) =>
    [entry.path, entry]));
  const trajectoryDescriptors = verified.manifest.remoteObjects.filter((entry) =>
    /(?:^|\/)trajectory\.json$/u.test(entry.path));
  const jsonlDescriptors = verified.manifest.remoteObjects.filter((entry) =>
    entry.path.endsWith(".jsonl"));
  const jsonDescriptors = verified.manifest.remoteObjects.filter((entry) =>
    entry.path.endsWith(".json"));
  const pythonDescriptors = verified.manifest.remoteObjects.filter((entry) =>
    entry.path.endsWith(".py"));
  const markdownDescriptors = verified.manifest.remoteObjects.filter((entry) =>
    entry.path.endsWith(".md"));
  const trajectories = trajectoryDescriptors.map((descriptor) =>
    trajectoryReplay(descriptor.path,
      readRegular(sourceObject(sourceDirectory, descriptor.path), descriptor.bytes)));
  const jsonl = jsonlDescriptors.map((descriptor) =>
    jsonlReplay(descriptor.path,
      readRegular(sourceObject(sourceDirectory, descriptor.path), descriptor.bytes)));
  const otherJson = jsonDescriptors.filter((descriptor) =>
    !/(?:^|\/)trajectory\.json$/u.test(descriptor.path)).map((descriptor) => {
    const bytes = readRegular(sourceObject(sourceDirectory, descriptor.path), descriptor.bytes);
    const value = parseJson(bytes, descriptor.path);
    const structural = structuralSummary(value);
    return { path: descriptor.path, bytes: descriptor.bytes,
      byteHash: descriptor.sha256,
      logicalHash: digest("outsider/mcp-trajectory-other-json/v1", value),
      rootType: Array.isArray(value) ? "array" : "object",
      rootKeys: plain(value) ? Object.keys(value).sort() : [],
      structuralPathHash: structural.structuralPathHash,
      publisherProjection: descriptor.path.endsWith("archive_report.json")
        && plain(value) ? {
          totalFiles: value.total_files ?? null,
          successCount: value.success_count ?? null,
          archivedFileNames: Array.isArray(value.archived_files)
            ? value.archived_files.length : null,
          privacyCleanedClaim: value.privacy_cleaned ?? null,
          absoluteSourceDirectoryPresent:
            typeof value.source_directory === "string"
              && value.source_directory.startsWith("/"),
          absoluteTargetDirectoryPresent:
            typeof value.target_directory === "string"
              && value.target_directory.startsWith("/"),
        } : null };
  });
  const python = pythonDescriptors.map((descriptor) => replayPython(descriptor.path,
    readRegular(sourceObject(sourceDirectory, descriptor.path), descriptor.bytes)));
  const readmeDescriptor = descriptorByPath.get("README.md");
  if (!readmeDescriptor) fail("README_MISSING");
  const readme = readUtf8(readRegular(sourceObject(sourceDirectory, "README.md"),
    readmeDescriptor.bytes), "README.md");
  const conversations = jsonl.filter((entry) => entry.path !== "train.jsonl");
  const train = jsonl.find((entry) => entry.path === "train.jsonl");
  if (!train) fail("TRAIN_JSONL_MISSING");
  const trainResult = trainCrosswalk(train, conversations, trajectories);
  const standard = trajectories.filter((entry) =>
    entry.classification === "STANDARD_ATIF_V1_2");
  const multi = trajectories.filter((entry) =>
    entry.classification !== "STANDARD_ATIF_V1_2");
  const aggregateNames = {};
  for (const entry of standard) {
    for (const [name, count] of Object.entries(entry.atif.toolNames)) {
      aggregateNames[name] = (aggregateNames[name] ?? 0) + count;
    }
  }
  const claims = readmeClaims(readme);
  if (trajectoryDescriptors.length !== 49 || standard.length !== 38 || multi.length !== 11
    || !Object.values(claims).every(Boolean)) fail("PUBLISHER_CLAIMS_OR_FILE_CENSUS_DRIFT");
  const extensionBytesRead = verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + readRegular(sourceObject(sourceDirectory, entry.path), entry.bytes).length, 0);
  if (extensionBytesRead !== MCP_TRAJECTORY_PROFILE.treeBytes) {
    fail("FULL_REPOSITORY_BYTE_REPLAY_INVALID");
  }
  const sensitivePathDomains = [...new Set(verified.manifest.remoteObjects
    .map((entry) => entry.path.split("/")[0])
    .filter((name) => /(?:health|fitbit|garmin|oura|hevy|diet|calorie|fasting|finance|financial|expense|budget|loan|tax|stock|crypto|account)/iu.test(name)))].sort();
  return {
    allRepositoryBytesRead: true,
    bytesRead: extensionBytesRead,
    filesRead: verified.manifest.remoteObjects.length,
    trajectories: {
      files: trajectories.length, standardFiles: standard.length,
      multiConversationFiles: multi.length,
      sessionLikeRootUnits: trajectories.reduce((sum, entry) => sum + entry.units, 0),
      standardSteps: standard.reduce((sum, entry) => sum + entry.atif.steps, 0),
      standardToolCalls: standard.reduce((sum, entry) => sum + entry.atif.toolCalls, 0),
      standardToolResults: standard.reduce((sum, entry) => sum + entry.atif.toolResults, 0),
      standardMatchedResults: standard.reduce((sum, entry) => sum
        + entry.atif.matchedResults, 0),
      standardUnmatchedCalls: standard.reduce((sum, entry) => sum
        + entry.atif.unmatchedCalls, 0),
      standardUnmatchedResults: standard.reduce((sum, entry) => sum
        + entry.atif.unmatchedResults, 0),
      standardLastStepComplete: standard.filter((entry) =>
        entry.atif.lastStepTurnComplete).length,
      parsedTrajectoryFiles: trajectories.filter((entry) => entry.jsonParsed).length,
      multiObservedToolCalls: multi.reduce((sum, entry) => sum
        + entry.observedToolCalls, 0),
      multiObservedToolResults: multi.reduce((sum, entry) => sum
        + entry.observedToolResults, 0),
      publisherSuccessTrue: multi.reduce((sum, entry) => sum
        + entry.publisherSuccessTrue, 0),
      publisherSuccessFalse: multi.reduce((sum, entry) => sum
        + entry.publisherSuccessFalse, 0),
      filesWithPublisherSuccessLabels: multi.filter((entry) =>
        entry.publisherSuccessTrue + entry.publisherSuccessFalse > 0).length,
      filesWithRecoveryLinkFields: trajectories.filter((entry) =>
        entry.recoveryLinkFields > 0).length,
      filesWithJudgeLikeFields: trajectories.filter((entry) =>
        entry.judgeLikeFields > 0).length,
      malformedJsonFiles: trajectories.filter((entry) => !entry.jsonParsed).length,
      aggregateStandardToolNames: aggregateNames,
      fileReplay: trajectories,
    },
    jsonl: {
      files: jsonl.length,
      conversationFiles: conversations.length,
      conversationRecords: conversations.reduce((sum, entry) =>
        sum + entry.recordCount, 0),
      trainRows: train.recordCount,
      filesReplay: jsonl.map(({ records, ...entry }) => entry),
      trainCrosswalk: trainResult,
    },
    otherJson,
    python: {
      files: python.length,
      bytes: python.reduce((sum, entry) => sum + entry.bytes, 0),
      totalDefinitions: python.reduce((sum, entry) => sum + entry.definitions, 0),
      totalToolDecorators: python.reduce((sum, entry) => sum + entry.toolDecorators, 0),
      executedFiles: 0, filesReplay: python,
    },
    markdown: {
      files: markdownDescriptors.length,
      bytes: markdownDescriptors.reduce((sum, entry) => sum + entry.bytes, 0),
      workspaceConfigs: markdownDescriptors.filter((entry) =>
        /(?:^|\/)(?:AGENTS|BOOTSTRAP|HEARTBEAT|IDENTITY|SOUL|TOOLS|USER)\.md$/u
          .test(entry.path)).length,
    },
    publisherClaims: claims,
    privacySignals: {
      sensitivePathDomainCount: sensitivePathDomains.length,
      sensitivePathDomains,
      userConversationContentPresent: conversations.length > 0,
      financialContentPresent: true,
      healthContentPresent: true,
    },
  };
}

function artifactBody(verified, replay) {
  return {
    schema: MCP_TRAJECTORY_ARTIFACT_SCHEMA,
    frozenAt: MCP_TRAJECTORY_FROZEN_AT,
    status: "PINNED_FULL_MCP_TRAJECTORY_REPOSITORY_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: { datasetId: MCP_TRAJECTORY_ID, revision: MCP_TRAJECTORY_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure },
    replay,
    countAdjudication: {
      publisherClaimedTrajectories: 49,
      publishedTrajectoryFiles: replay.trajectories.files,
      standardAtifFiles: replay.trajectories.standardFiles,
      multiConversationFiles: replay.trajectories.multiConversationFiles,
      sessionLikeRootUnits: replay.trajectories.sessionLikeRootUnits,
      publisher49MatchesTrajectoryFileCount: replay.trajectories.files === 49,
      publisher49IsNotSessionLikeRootUnitCount:
        replay.trajectories.sessionLikeRootUnits !== 49,
      denominator: "PUBLISHED_TRAJECTORY_FILES",
    },
    missingness: {
      reliableTerminalCorrectness: 0,
      independentOutcome: 0,
      longitudinalOutcome: 0,
      pairedFailureRecovery: 0,
      recoveryLinkFields: replay.trajectories.filesWithRecoveryLinkFields,
      externalEffectReceipts: 0,
      malformedTrajectoryJsonFiles: replay.trajectories.malformedJsonFiles,
      completeExecutionEnvironmentCensus: false,
      completePublishedRepositoryFileCensus: true,
      standardLastStepCompletionFlags:
        replay.trajectories.standardLastStepComplete,
      publisherSuccessTrueLabels: replay.trajectories.publisherSuccessTrue,
      publisherSuccessFalseLabels: replay.trajectories.publisherSuccessFalse,
      publisherSuccessLabelsAreIndependentOutcomes: false,
      turnCompleteFlagsAreCorrectnessOutcomes: false,
      toolResultContentIsExternalEffectReceipt: false,
      publisherArchiveSuccessCountIsIndependentOutcome: false,
      publisherArchivePrivacyCleanedClaimResolvesPrivacy: false,
    },
    executionSafety: {
      pythonFilesPresent: replay.python.files,
      pythonFilesExecuted: 0,
      commandsExecuted: 0,
      toolPayloadsExecuted: 0,
      mcpServersStarted: 0,
      networkActionsReplayed: 0,
      parseMode: "INERT_BYTES_JSON_JSONL_AND_LEXICAL_SOURCE_ONLY",
    },
    rights: {
      datasetCardLicenseClaim: "Apache-2.0",
      readmeYamlLicenseClaim: "Apache-2.0",
      repositoryLicenseFilePresent: verified.manifest.closure.licenseFilesPresent > 0,
      productionTrainingAuthorized: false,
      rightsFinallyAdjudicatedForTraining: false,
      evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    },
    privacy: {
      rawArtifactPrivate: true,
      userConversationContentPresent: true,
      financialContentPresent: true,
      healthContentPresent: true,
      privacyReviewComplete: false,
      noPiiEstablished: false,
      publicAvailabilityResolvesPrivacy: false,
      rawConversationTextRepublishedInReport: false,
      absoluteFilesystemPathsPresentInPublisherArchiveReport: true,
      publisherArchivePrivacyCleanedClaimPresent: true,
      sensitivePathDomains: replay.privacySignals.sensitivePathDomains,
    },
    boundary: { privacy: 0, training: 0, network: 0, authority: 0,
      CEU: 0, action: 0, delegation: 0, reliableOutcome: 0,
      independentOutcome: 0, recovery: 0, externalEffect: 0 },
  };
}

export function mcpTrajectoryArtifactHash(body) {
  return digest("outsider/mcp-agent-trajectory-benchmark/v1", body);
}

export function buildMcpTrajectoryArtifactFromSource(sourceDirectory) {
  const verified = verifyMcpTrajectorySourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = replayMcpTrajectoryRepository(sourceDirectory);
  const body = artifactBody(verified, replay);
  const artifact = { ...body, artifactHash: mcpTrajectoryArtifactHash(body) };
  const checked = verifyMcpTrajectoryArtifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifyMcpTrajectoryArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== MCP_TRAJECTORY_ARTIFACT_SCHEMA
      || artifact.frozenAt !== MCP_TRAJECTORY_FROZEN_AT
      || artifact.status !== "PINNED_FULL_MCP_TRAJECTORY_REPOSITORY_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== mcpTrajectoryArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.datasetId !== MCP_TRAJECTORY_ID
      || artifact.source?.revision !== MCP_TRAJECTORY_REVISION
      || artifact.source?.closure?.selectedObjects !== 413
      || artifact.source?.closure?.selectedBytes !== 3_605_902
      || artifact.source?.closure?.fullFixedRepository !== true
      || artifact.source?.closure?.executablePayloadsExecuted !== 0) {
      fail("ARTIFACT_SOURCE_INVALID");
    }
    if (artifact.replay?.allRepositoryBytesRead !== true
      || artifact.replay?.filesRead !== 413 || artifact.replay?.bytesRead !== 3_605_902
      || artifact.replay?.trajectories?.files !== 49
      || artifact.replay?.trajectories?.standardFiles !== 38
      || artifact.replay?.trajectories?.multiConversationFiles !== 11
      || artifact.replay?.trajectories?.parsedTrajectoryFiles !== 48
      || artifact.replay?.trajectories?.malformedJsonFiles !== 1
      || artifact.replay?.python?.executedFiles !== 0) fail("ARTIFACT_REPLAY_INVALID");
    if (artifact.countAdjudication?.publisher49MatchesTrajectoryFileCount !== true
      || artifact.countAdjudication?.denominator !== "PUBLISHED_TRAJECTORY_FILES") {
      fail("ARTIFACT_COUNT_ADJUDICATION_INVALID");
    }
    if (artifact.missingness?.reliableTerminalCorrectness !== 0
      || artifact.missingness?.independentOutcome !== 0
      || artifact.missingness?.pairedFailureRecovery !== 0
      || artifact.missingness?.externalEffectReceipts !== 0
      || artifact.missingness?.publisherSuccessLabelsAreIndependentOutcomes !== false
      || artifact.missingness?.turnCompleteFlagsAreCorrectnessOutcomes !== false
      || artifact.missingness?.toolResultContentIsExternalEffectReceipt !== false
      || artifact.missingness?.publisherArchiveSuccessCountIsIndependentOutcome !== false
      || artifact.missingness?.publisherArchivePrivacyCleanedClaimResolvesPrivacy !== false) {
      fail("ARTIFACT_OUTCOME_PROMOTION");
    }
    if (!same(artifact.executionSafety, {
      pythonFilesPresent: artifact.replay.python.files,
      pythonFilesExecuted: 0, commandsExecuted: 0, toolPayloadsExecuted: 0,
      mcpServersStarted: 0, networkActionsReplayed: 0,
      parseMode: "INERT_BYTES_JSON_JSONL_AND_LEXICAL_SOURCE_ONLY",
    })) fail("ARTIFACT_EXECUTION_SAFETY_INVALID");
    if (artifact.rights?.datasetCardLicenseClaim !== "Apache-2.0"
      || artifact.rights?.readmeYamlLicenseClaim !== "Apache-2.0"
      || artifact.rights?.productionTrainingAuthorized !== false
      || artifact.rights?.rightsFinallyAdjudicatedForTraining !== false
      || artifact.rights?.evaluationUseBoundary !== "QUARANTINE_EVAL_ONLY") {
      fail("ARTIFACT_RIGHTS_INVALID");
    }
    if (artifact.privacy?.rawArtifactPrivate !== true
      || artifact.privacy?.privacyReviewComplete !== false
      || artifact.privacy?.noPiiEstablished !== false
      || artifact.privacy?.rawConversationTextRepublishedInReport !== false
      || artifact.privacy?.absoluteFilesystemPathsPresentInPublisherArchiveReport !== true
      || artifact.privacy?.publisherArchivePrivacyCleanedClaimPresent !== true) {
      fail("ARTIFACT_PRIVACY_INVALID");
    }
    if (!same(artifact.boundary, { privacy: 0, training: 0, network: 0,
      authority: 0, CEU: 0, action: 0, delegation: 0, reliableOutcome: 0,
      independentOutcome: 0, recovery: 0, externalEffect: 0 })) {
      fail("ARTIFACT_BOUNDARY_INVALID");
    }
    return { ok: true, artifactHash,
      verificationLevel: "STANDALONE_HASH_AND_INERT_REPLAY_SEMANTICS" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyMcpTrajectoryArtifactWithSource(artifact, sourceDirectory) {
  const standalone = verifyMcpTrajectoryArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildMcpTrajectoryArtifactFromSource(sourceDirectory);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel: "FULL_413_FILE_INERT_SCHEMA_AND_TRACE_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
