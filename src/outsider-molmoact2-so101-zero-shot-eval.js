/*
 * Pinned acquisition and replay of abdul004's two published MolmoAct2 SO101
 * zero-shot traces.  The complete repository is retained, including raw
 * event logs, embedded Parquet images and GIF previews.  Publisher-native
 * transport/action evidence is kept distinct from task outcome, independent
 * adjudication, attempt-census completeness and deployment authority.
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

export const MOLMOACT2_SO101_ID =
  "abdul004/molmoact2-so101-zero-shot-eval";
export const MOLMOACT2_SO101_REVISION =
  "e228b32ac68d65bf94c34abce434faa8fbfd0e2d";
export const MOLMOACT2_SO101_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const MOLMOACT2_SO101_SOURCE_SCHEMA =
  "outsider/molmoact2-so101-zero-shot-source/v1";
export const MOLMOACT2_SO101_AUDIT_SCHEMA =
  "outsider/molmoact2-so101-zero-shot-audit/v1";

export const MOLMOACT2_SO101_FILES = Object.freeze([
  Object.freeze({ path: ".gitattributes", bytes: 2_504,
    oid: "bed0738c7eeb449bca98b5d2f33c89a1ee56349a", lfs: null }),
  Object.freeze({ path: "README.md", bytes: 6_393,
    oid: "4e70787becd6db193ebaff189632e71acfda84ed", lfs: null }),
  Object.freeze({ path: "data/evaluation_frames.parquet", bytes: 53_768_120,
    oid: "5945ac6e63fb9b752bf66a6cc7e69cc8f68a6401",
    lfs: "676a9db8f4d162842a092d06ec2c1e9cab9369ece43c7c2b61d674e5e44bbad6" }),
  Object.freeze({ path: "media/trace_20260530_032416/events.jsonl", bytes: 365_110,
    oid: "ff9f477b24efb4755f04e816f61888885c6eee4d", lfs: null }),
  Object.freeze({ path: "media/trace_20260530_032416/metadata.json", bytes: 1_855,
    oid: "0e95a9c6fab419f92fcfaa59f29d5c2d0ee6573f", lfs: null }),
  Object.freeze({ path: "media/trace_20260530_032416/overhead.gif", bytes: 4_646_302,
    oid: "198a3b6ddb76770a2949b0fff24a75b1136226b9",
    lfs: "26c8ef9a98ed7f3e22ca1c117346c09e3d66635168770b35801f7f6dd1f03beb" }),
  Object.freeze({ path: "media/trace_20260530_032614/events.jsonl", bytes: 410_166,
    oid: "05f2c19412007f6500ed04fdfebc563bdf0c7c65", lfs: null }),
  Object.freeze({ path: "media/trace_20260530_032614/metadata.json", bytes: 1_846,
    oid: "52b37597f878539b79e7c1d820827ce214a02265", lfs: null }),
  Object.freeze({ path: "media/trace_20260530_032614/overhead.gif", bytes: 5_719_199,
    oid: "cc8070452339b95b8da6ca1cb394731338bf6e75",
    lfs: "30293bbb15097dbe6788ea3ca28e1c541a27e119c765aa3e93c44c9f26f97bb1" }),
]);

export const MOLMOACT2_SO101_PROFILE = Object.freeze({
  usedStorage: 136_775_845,
  treeEntries: 13,
  repositoryFiles: 9,
  selectedObjects: 9,
  selectedBytes: 64_921_495,
  parquetRows: 688,
  traces: 2,
  observationEvents: 344,
  actionChunkEvents: 40,
  appliedActionEvents: 605,
  gifObjects: 2,
  cameras: 2,
  actionDimensions: 6,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const EXPECTED_DIRECTORIES = Object.freeze([
  Object.freeze({ path: "data", oid: "c5508e1551262f4afc9bde7371220cad92ce1521" }),
  Object.freeze({ path: "media", oid: "721acc34bd7bbaaf0776be4f4cdbda45185793a7" }),
  Object.freeze({ path: "media/trace_20260530_032416",
    oid: "f14c1bd9d5e0496c9d3aa5ed72fdb6ca73b4b35e" }),
  Object.freeze({ path: "media/trace_20260530_032614",
    oid: "44947e9de76147985b6d825e38c823522bc1ac63" }),
]);
const TRACE_PROFILES = Object.freeze([
  Object.freeze({ id: "trace_20260530_032416",
    task: "pick up the whistle and put it in the green bin",
    observations: 160, chunks: 19, applied: 286 }),
  Object.freeze({ id: "trace_20260530_032614",
    task: "pick up the ball and put it in the bin",
    observations: 184, chunks: 21, applied: 319 }),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `MOLMOACT2_SO101_${code}`
    : `MOLMOACT2_SO101_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function molmoact2So101Sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return molmoact2So101Sha256(Buffer.from(
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
  return typeof value === "string" && value.length > 0 && value.length <= 1024
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "." && part !== "..");
}

function endpoints() {
  const encoded = MOLMOACT2_SO101_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${MOLMOACT2_SO101_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${MOLMOACT2_SO101_REVISION}`
      + "?recursive=true&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${MOLMOACT2_SO101_REVISION}`,
  };
}

function repositoryProjection(value) {
  if (!plain(value) || !Array.isArray(value.siblings)) fail("REPOSITORY_INVALID");
  const siblingPaths = value.siblings.map((entry) => entry?.rfilename).sort();
  if (siblingPaths.some((entry) => !safeRemotePath(entry))) fail("REPOSITORY_PATH_INVALID");
  return {
    id: value.id, sha: value.sha, private: value.private, gated: value.gated,
    disabled: value.disabled, usedStorage: value.usedStorage,
    cardLicense: value.cardData?.license ?? null, siblingPaths,
  };
}

function validateRepository(value) {
  const projection = repositoryProjection(value);
  if (projection.id !== MOLMOACT2_SO101_ID
    || projection.sha !== MOLMOACT2_SO101_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false
    || projection.usedStorage !== MOLMOACT2_SO101_PROFILE.usedStorage
    || projection.cardLicense !== "apache-2.0"
    || !same(projection.siblingPaths,
      MOLMOACT2_SO101_FILES.map((entry) => entry.path).sort())) {
    fail("REPOSITORY_PROFILE_INVALID");
  }
  return projection;
}

function validateTree(raw) {
  if (!Array.isArray(raw) || raw.length !== 13) fail("TREE_INVALID");
  const values = raw.map((entry) => {
    if (!plain(entry) || !safeRemotePath(entry.path)
      || !["file", "directory"].includes(entry.type)
      || !SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size)
      || entry.size < 0) fail("TREE_ENTRY_INVALID");
    return { path: entry.path, type: entry.type, oid: entry.oid, bytes: entry.size,
      lfs: entry.lfs == null ? null : {
        oid: entry.lfs.oid, size: entry.lfs.size,
      } };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(values.map((entry) => entry.path)).size !== values.length) {
    fail("TREE_DUPLICATE_PATH");
  }
  const directories = values.filter((entry) => entry.type === "directory");
  if (!same(directories.map(({ path: remotePath, oid }) => ({ path: remotePath, oid })),
    [...EXPECTED_DIRECTORIES].sort((left, right) => left.path.localeCompare(right.path)))
    || directories.some((entry) => entry.bytes !== 0 || entry.lfs !== null)) {
    fail("TREE_DIRECTORIES_INVALID");
  }
  const files = values.filter((entry) => entry.type === "file");
  const expected = MOLMOACT2_SO101_FILES.map((entry) => ({
    path: entry.path, type: "file", oid: entry.oid, bytes: entry.bytes,
    lfs: entry.lfs === null ? null : { oid: entry.lfs, size: entry.bytes },
  })).sort((left, right) => left.path.localeCompare(right.path));
  if (!same(files, expected)) fail("TREE_FILES_INVALID");
  return { values, files };
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
  const timer = setTimeout(() => controller.abort(), 180_000);
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
      await new Promise((resolve) => setTimeout(resolve, 250 * (2 ** attempt)));
    }
  }
  throw last;
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

async function fetchJson(url, fetchImpl) {
  const value = await boundedFetch(url, 8 * 1024 * 1024, fetchImpl);
  return { ...value, parsed: parseJson(value.bytes, url) };
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

async function capturePhase(root, phase, fetchImpl) {
  const endpoint = endpoints();
  const [repository, tree] = await Promise.all([
    fetchJson(endpoint.repository, fetchImpl), fetchJson(endpoint.tree, fetchImpl),
  ]);
  validateRepository(repository.parsed);
  validateTree(tree.parsed);
  const captures = [
    { kind: "repository", file: `api/${phase}/repository.json`,
      requestUrl: endpoint.repository, value: repository },
    { kind: "tree", file: `api/${phase}/tree.json`, requestUrl: endpoint.tree,
      value: tree },
  ].map((entry) => {
    writePrivateOnce(safeJoin(root, entry.file), entry.value.bytes);
    return { phase, kind: entry.kind, file: entry.file,
      requestUrl: entry.requestUrl, finalUrl: entry.value.finalUrl,
      status: entry.value.status, contentType: entry.value.contentType,
      bytes: entry.value.bytes.length,
      sha256: molmoact2So101Sha256(entry.value.bytes) };
  });
  return { repository: repository.parsed, tree: tree.parsed, captures };
}

async function mapConcurrent(values, concurrency, operation) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await operation(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, worker));
  return output;
}

async function downloadObject(root, expected, fetchImpl) {
  const url = `${endpoints().raw}/${expected.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const fetched = await boundedFetch(url, expected.bytes + 1, fetchImpl);
  const sha256 = molmoact2So101Sha256(fetched.bytes);
  if (fetched.bytes.length !== expected.bytes
    || (expected.lfs === null ? gitBlobOid(fetched.bytes) !== expected.oid
      : sha256 !== `sha256:${expected.lfs}`)) fail("OBJECT_INVALID", expected.path);
  const file = `objects/${expected.path}`;
  writePrivateOnce(safeJoin(root, file), fetched.bytes);
  return { datasetId: MOLMOACT2_SO101_ID, revision: MOLMOACT2_SO101_REVISION,
    path: expected.path, file, requestUrl: url, finalUrl: fetched.finalUrl,
    status: fetched.status, contentType: fetched.contentType,
    bytes: fetched.bytes.length, sha256, gitOid: expected.oid,
    lfsSha256: expected.lfs === null ? null : `sha256:${expected.lfs}` };
}

function rootProjection(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots, ...remoteObjects].map((entry) => ({
    file: entry.file, bytes: entry.bytes, sha256: entry.sha256,
  })).sort((left, right) => left.file.localeCompare(right.file));
  return { files,
    sourceRoot: digest("outsider/molmoact2-so101-source-root/v1", files) };
}

export async function acquirePinnedMolmoact2So101Source(sourceDirectory,
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
    const remoteObjects = (await mapConcurrent(MOLMOACT2_SO101_FILES, 3,
      (entry) => downloadObject(temporary, entry, fetchImpl)))
      .sort((left, right) => left.file.localeCompare(right.file));
    const after = await capturePhase(temporary, "after", fetchImpl);
    if (!same(validateRepository(before.repository), validateRepository(after.repository))
      || !same(validateTree(before.tree).values, validateTree(after.tree).values)) {
      fail("SOURCE_DRIFT");
    }
    if (remoteObjects.length !== 9
      || remoteObjects.reduce((sum, entry) => sum + entry.bytes, 0) !== 64_921_495) {
      fail("CLOSURE_INVALID");
    }
    const apiSnapshots = [...before.captures, ...after.captures]
      .sort((left, right) => left.file.localeCompare(right.file));
    const rooted = rootProjection(apiSnapshots, remoteObjects);
    const body = {
      schema: MOLMOACT2_SO101_SOURCE_SCHEMA,
      frozenAt: MOLMOACT2_SO101_FROZEN_AT,
      apiSnapshots, remoteObjects, sourceFiles: rooted.files,
      sourceRoot: rooted.sourceRoot,
      closure: { selectedObjects: 9, selectedBytes: 64_921_495,
        completeRepositoryBytes: true, completeDeclaredTwoTraceRunSet: true,
        eventLogs: 2, metadataFiles: 2, gifObjects: 2,
        parquetObjects: 1, excludedObjects: 0, excludedBytes: 0 },
    };
    const manifest = { ...body,
      manifestHash: digest("outsider/molmoact2-so101-source-manifest/v1", body) };
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

function snapshot(root, manifest, phase, kind) {
  const descriptor = manifest.apiSnapshots.find((entry) =>
    entry.phase === phase && entry.kind === kind);
  if (!descriptor) fail("SNAPSHOT_MISSING");
  const bytes = readRegular(safeJoin(root, descriptor.file), descriptor.bytes);
  if (molmoact2So101Sha256(bytes) !== descriptor.sha256) fail("SNAPSHOT_HASH_INVALID");
  return parseJson(bytes, descriptor.file);
}

export function verifyMolmoact2So101SourceDirectory(sourceDirectory) {
  try {
    const manifest = parseJson(readRegular(path.join(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== MOLMOACT2_SO101_SOURCE_SCHEMA
      || manifest.frozenAt !== MOLMOACT2_SO101_FROZEN_AT
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 4
      || !Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 9
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")) {
      fail("MANIFEST_INVALID");
    }
    const rb = validateRepository(snapshot(sourceDirectory, manifest, "before", "repository"));
    const ra = validateRepository(snapshot(sourceDirectory, manifest, "after", "repository"));
    const tb = validateTree(snapshot(sourceDirectory, manifest, "before", "tree"));
    const ta = validateTree(snapshot(sourceDirectory, manifest, "after", "tree"));
    if (!same(rb, ra) || !same(tb.values, ta.values)) fail("SOURCE_DRIFT");
    const expectedPaths = MOLMOACT2_SO101_FILES.map((entry) => entry.path).sort();
    if (!same(expectedPaths, manifest.remoteObjects.map((entry) => entry.path).sort())) {
      fail("REMOTE_SET_INVALID");
    }
    for (const descriptor of manifest.remoteObjects) {
      const expected = MOLMOACT2_SO101_FILES.find((entry) => entry.path === descriptor.path);
      if (!expected || descriptor.datasetId !== MOLMOACT2_SO101_ID
        || descriptor.revision !== MOLMOACT2_SO101_REVISION
        || descriptor.file !== `objects/${expected.path}`
        || descriptor.bytes !== expected.bytes || descriptor.gitOid !== expected.oid
        || descriptor.lfsSha256 !== (expected.lfs === null
          ? null : `sha256:${expected.lfs}`)) fail("REMOTE_DESCRIPTOR_INVALID");
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), expected.bytes);
      const sha256 = molmoact2So101Sha256(bytes);
      if (descriptor.sha256 !== sha256
        || (expected.lfs === null ? gitBlobOid(bytes) !== expected.oid
          : sha256 !== `sha256:${expected.lfs}`)) fail("REMOTE_HASH_INVALID");
    }
    const rooted = rootProjection(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles)
      || rooted.sourceRoot !== manifest.sourceRoot) fail("SOURCE_ROOT_INVALID");
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"].sort((left, right) => left.localeCompare(right));
    if (!same(walk(sourceDirectory), expectedFiles)) fail("FILE_CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/molmoact2-so101-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    return { ok: true, manifest,
      verificationLevel: "PINNED_COMPLETE_REPOSITORY_AND_DECLARED_TWO_TRACE_RUN_SET" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function parseJsonLines(bytes, label) {
  const lines = bytes.toString("utf8").split(/\r?\n/u).filter((line) => line.length > 0);
  return lines.map((line, index) => parseJson(Buffer.from(line, "utf8"),
    `${label}:${index + 1}`));
}

function exactKeys(value, keys, label) {
  if (!plain(value) || !same(Object.keys(value).sort(), [...keys].sort())) {
    fail("EVENT_KEYS_INVALID", label);
  }
}

function sixJointObject(value, label) {
  const keys = ["shoulder_pan.pos", "shoulder_lift.pos", "elbow_flex.pos",
    "wrist_flex.pos", "wrist_roll.pos", "gripper.pos"];
  if (!plain(value) || !same(Object.keys(value).sort(), [...keys].sort())
    || keys.some((key) => typeof value[key] !== "number" || !Number.isFinite(value[key]))) {
    fail("ACTION_SHAPE_INVALID", label);
  }
}

function replayEvents(sourceDirectory, profile) {
  const relative = `objects/media/${profile.id}/events.jsonl`;
  const values = parseJsonLines(readRegular(path.join(sourceDirectory, relative)), relative);
  const groups = { observation: [], action_chunk: [], applied_action: [] };
  for (const value of values) {
    if (!plain(value) || !Object.hasOwn(groups, value.event)) fail("EVENT_TYPE_INVALID");
    groups[value.event].push(value);
  }
  if (groups.observation.length !== profile.observations
    || groups.action_chunk.length !== profile.chunks
    || groups.applied_action.length !== profile.applied) fail("EVENT_COUNTS_INVALID");
  groups.observation.forEach((value, index) => {
    exactKeys(value, ["event", "image_shapes", "must_go", "queue_size", "state",
      "timestamp", "timestep", "video_frame_index", "video_frames", "wall_time"],
    `${profile.id}:observation`);
    if (value.video_frame_index !== index || value.state?.task !== profile.task
      || !Array.isArray(value.video_frames) || value.video_frames.length !== 2
      || !plain(value.image_shapes) || Object.keys(value.image_shapes).length !== 2) {
      fail("OBSERVATION_INVALID", profile.id);
    }
  });
  groups.action_chunk.forEach((value) => {
    exactKeys(value, ["clamped_first", "delta_from_state", "event", "first_timestep",
      "last_timestep", "raw_first", "raw_last", "wall_time"],
    `${profile.id}:action_chunk`);
    for (const key of ["clamped_first", "delta_from_state", "raw_first", "raw_last"]) {
      sixJointObject(value[key], `${profile.id}:${key}`);
    }
  });
  let rawEqualsClamped = 0;
  let clampedEqualsPerformed = 0;
  groups.applied_action.forEach((value, index) => {
    exactKeys(value, ["clamped_action", "event", "performed_action", "raw_action",
      "timestep", "wall_time"], `${profile.id}:applied_action`);
    if (value.timestep !== index) fail("APPLIED_TIMESTEP_INVALID", profile.id);
    for (const key of ["clamped_action", "performed_action", "raw_action"]) {
      sixJointObject(value[key], `${profile.id}:${key}`);
    }
    if (same(value.raw_action, value.clamped_action)) rawEqualsClamped += 1;
    if (same(value.clamped_action, value.performed_action)) clampedEqualsPerformed += 1;
  });
  return { traceId: profile.id, task: profile.task, totalEvents: values.length,
    observationEvents: groups.observation.length,
    actionChunkEvents: groups.action_chunk.length,
    appliedActionEvents: groups.applied_action.length,
    rawEqualsClampedAppliedActions: rawEqualsClamped,
    clampedEqualsPerformedAppliedActions: clampedEqualsPerformed,
    observationFrameContinuity: true, appliedActionTimestepContinuity: true };
}

function replayMetadata(sourceDirectory, profile) {
  const relative = `objects/media/${profile.id}/metadata.json`;
  const value = parseJson(readRegular(path.join(sourceDirectory, relative)), relative);
  const config = value?.config;
  if (value.capture_version !== 1 || value.video_enabled !== true
    || !Array.isArray(value.action_keys) || value.action_keys.length !== 6
    || config?.task !== profile.task || config?.policy_type !== "molmoact2"
    || config?.robot?.id !== "my_follower_arm"
    || typeof config?.robot?.port !== "string" || config.robot.port.length === 0
    || typeof config?.server_address !== "string"
    || !/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/u.test(config.server_address)
    || config?.max_relative_target !== 0 || config?.max_step_deg !== 0
    || config?.actions_per_chunk !== 30 || config?.fps !== 30
    || !plain(config?.robot?.cameras)
    || !same(Object.keys(config.robot.cameras).sort(), ["overhead", "wrist"])) {
    fail("METADATA_INVALID", profile.id);
  }
  return { traceId: profile.id, captureVersion: 1, videoEnabled: true,
    task: profile.task, policyType: "molmoact2", fps: 30,
    actionDimensions: 6, cameras: 2, clampDisabled: true,
    historicalNetworkEndpointPresent: true,
    localDeviceIdentifierPresent: true,
    networkEndpointRepublishedInReport: false,
    localDeviceIdentifierRepublishedInReport: false };
}

function replayGif(bytes, label) {
  if (bytes.length < 14 || !["GIF87a", "GIF89a"].includes(bytes.subarray(0, 6)
    .toString("ascii"))) fail("GIF_SIGNATURE_INVALID", label);
  const width = bytes.readUInt16LE(6);
  const height = bytes.readUInt16LE(8);
  let cursor = 13;
  const packed = bytes[10];
  if ((packed & 0x80) !== 0) cursor += 3 * (2 ** ((packed & 0x07) + 1));
  let frames = 0;
  let trailer = false;
  function skipSubBlocks() {
    while (cursor < bytes.length) {
      const size = bytes[cursor++];
      if (size === 0) return;
      cursor += size;
      if (cursor > bytes.length) fail("GIF_TRUNCATED", label);
    }
    fail("GIF_TRUNCATED", label);
  }
  while (cursor < bytes.length) {
    const marker = bytes[cursor++];
    if (marker === 0x3b) { trailer = true; break; }
    if (marker === 0x21) {
      if (cursor >= bytes.length) fail("GIF_TRUNCATED", label);
      cursor += 1;
      skipSubBlocks();
    } else if (marker === 0x2c) {
      frames += 1;
      if (cursor + 9 > bytes.length) fail("GIF_TRUNCATED", label);
      const imagePacked = bytes[cursor + 8];
      cursor += 9;
      if ((imagePacked & 0x80) !== 0) {
        cursor += 3 * (2 ** ((imagePacked & 0x07) + 1));
      }
      if (cursor >= bytes.length) fail("GIF_TRUNCATED", label);
      cursor += 1;
      skipSubBlocks();
    } else fail("GIF_BLOCK_INVALID", `${label}:${marker}`);
  }
  if (!trailer || cursor !== bytes.length || frames === 0 || width !== 480 || height !== 360) {
    fail("GIF_STRUCTURE_INVALID", label);
  }
  return { bytes: bytes.length, width, height, frames,
    structureReplayComplete: true };
}

const PARQUET_REPLAY = String.raw`
import json, os, sys
import pyarrow.parquet as pq

root = sys.argv[1]
file = os.path.join(root, "objects", "data", "evaluation_frames.parquet")
table = pq.read_table(file)
expected_names = ["image", "camera", "trace_id", "frame_index", "task", "result"]
if table.column_names != expected_names:
    raise RuntimeError("MOLMOACT2_SO101_PARQUET_COLUMNS_INVALID")
if table.num_rows != 688:
    raise RuntimeError("MOLMOACT2_SO101_PARQUET_ROWS_INVALID")

rows = table.to_pylist()
profiles = {
  "trace_20260530_032416": {
    "task": "pick up the whistle and put it in the green bin", "frames": 160,
  },
  "trace_20260530_032614": {
    "task": "pick up the ball and put it in the bin", "frames": 184,
  },
}
counts = {}
image_bytes = 0
jpeg_images = 0
for row in rows:
    trace = row["trace_id"]
    camera = row["camera"]
    if trace not in profiles or camera not in (0, 1):
        raise RuntimeError("MOLMOACT2_SO101_PARQUET_ID_INVALID")
    if row["task"] != profiles[trace]["task"] or row["result"] != "failed":
        raise RuntimeError("MOLMOACT2_SO101_PARQUET_LABEL_INVALID")
    key = (trace, camera)
    counts.setdefault(key, []).append(row["frame_index"])
    image = row["image"]
    if not isinstance(image, dict) or image.get("bytes") is None:
        raise RuntimeError("MOLMOACT2_SO101_PARQUET_IMAGE_INVALID")
    raw = image["bytes"]
    image_bytes += len(raw)
    if raw[:2] == b"\xff\xd8" and raw[-2:] == b"\xff\xd9":
        jpeg_images += 1

for trace, profile in profiles.items():
    for camera in (0, 1):
        values = counts.get((trace, camera))
        if values != list(range(profile["frames"])):
            raise RuntimeError("MOLMOACT2_SO101_PARQUET_CONTINUITY_INVALID")

out = {
  "rows": table.num_rows,
  "columns": table.column_names,
  "schema": str(table.schema),
  "traceRows": {
    trace: sum(1 for row in rows if row["trace_id"] == trace)
    for trace in profiles
  },
  "cameraRows": {
    "overhead": sum(1 for row in rows if row["camera"] == 0),
    "wrist": sum(1 for row in rows if row["camera"] == 1),
  },
  "resultRows": {"failed": sum(1 for row in rows if row["result"] == "failed")},
  "embeddedImageBytes": image_bytes,
  "jpegImages": jpeg_images,
  "frameContinuityByTraceAndCamera": True,
}
print(json.dumps(out, sort_keys=True, separators=(",", ":")))
`;

export function runMolmoact2So101Replay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const verified = verifyMolmoact2So101SourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const parquet = spawnSync(python, ["-c", PARQUET_REPLAY, sourceDirectory], {
    encoding: "utf8", maxBuffer: 8 * 1024 * 1024,
  });
  if (parquet.status !== 0) fail("PYARROW_REPLAY_FAILED",
    String(parquet.stderr || parquet.stdout).trim());
  const parquetReplay = parseJson(Buffer.from(parquet.stdout.trim(), "utf8"), "pyarrow");
  const readme = readRegular(path.join(sourceDirectory, "objects", "README.md"))
    .toString("utf8");
  const requiredClaims = [
    "The server streamed action chunks continuously, and the robot executed those actions.",
    "the policy generally stalled after small initial motion",
    "The failure appears behavioral rather than networking-related.",
    "task-level behavior still did not complete.",
  ];
  if (requiredClaims.some((claim) => !readme.includes(claim))) fail("README_CLAIM_MISSING");
  const traces = TRACE_PROFILES.map((profile) => ({
    ...replayMetadata(sourceDirectory, profile),
    events: replayEvents(sourceDirectory, profile),
    gif: replayGif(readRegular(path.join(sourceDirectory, "objects", "media",
      profile.id, "overhead.gif")), profile.id),
  }));
  return { parquet: parquetReplay, traces,
    totals: {
      traces: 2,
      observationEvents: traces.reduce((sum, value) =>
        sum + value.events.observationEvents, 0),
      actionChunkEvents: traces.reduce((sum, value) =>
        sum + value.events.actionChunkEvents, 0),
      appliedActionEvents: traces.reduce((sum, value) =>
        sum + value.events.appliedActionEvents, 0),
      gifFrames: traces.reduce((sum, value) => sum + value.gif.frames, 0),
      gifBytes: traces.reduce((sum, value) => sum + value.gif.bytes, 0),
    },
  };
}

export function molmoact2So101ArtifactHash(body) {
  return digest("outsider/molmoact2-so101-zero-shot-audit/v1", body);
}

function buildBody(verified, replay) {
  return {
    schema: MOLMOACT2_SO101_AUDIT_SCHEMA,
    frozenAt: MOLMOACT2_SO101_FROZEN_AT,
    status: "PINNED_COMPLETE_MOLMOACT2_SO101_ZERO_SHOT_TRACE_REPLAY",
    admission: "QUARANTINE_EVAL",
    source: { id: MOLMOACT2_SO101_ID, revision: MOLMOACT2_SO101_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      selectedObjects: 9, selectedBytes: 64_921_495 },
    replay,
    transportAndExecution: {
      publisherClaimsRemoteInferenceBroughtUp: true,
      publisherClaimsContinuousActionStreaming: true,
      publisherClaimsRobotExecutedActions: true,
      rawObservationEvents: 344,
      rawActionChunkEvents: 40,
      rawAppliedActionEvents: 605,
      sourceNativeAppliedActionRecordsPresent: true,
      transportWorkingIndependentlyVerified: false,
      physicalExecutionIndependentlyVerified: false,
      networkPermissionConferred: false,
      actionAuthorityConferred: false,
    },
    taskOutcome: {
      publishedTraces: 2,
      publisherNativeFailedResultRows: 688,
      publisherClassifiesBothTasksIncomplete: true,
      successTraces: 0,
      failureTraces: 2,
      independentOutcome: 0,
      longitudinalOutcome: 0,
      recoveryPairs: 0,
    },
    conclusion: {
      transportWorkingVersusPolicyFailureIsPublisherInference: true,
      rawExchangeAndAppliedActionRecordsSupportThatInference: true,
      taskLevelFailurePromotedToNetworkFailure: false,
      publisherTracePromotedToIndependentOutcome: false,
      rawAppliedActionRecordPromotedToIndependentPhysicalEffect: false,
    },
    completeness: {
      completeRepositoryBytes: true,
      completeDeclaredTwoTraceRunSet: true,
      completeAttemptCensus: false,
      otherAttemptedOrDiscardedRunsUnknown: true,
      embeddedParquetImagesAcquired: true,
      gifPreviewsAcquired: true,
      gifStructureReplayed: true,
      visualOutcomeIndependentlyAdjudicated: false,
    },
    rights: {
      datasetCardClaim: "apache-2.0",
      repositoryLicenseFilePresent: false,
      evaluationUseFinallyAdjudicated: false,
      productionTrainingAllowed: false,
    },
    privacy: {
      rawSourceContainsHistoricalNetworkEndpoint: true,
      rawSourceContainsLocalDeviceIdentifier: true,
      rawSourceContainsSceneImages: true,
      sensitiveValuesRepublishedInReport: false,
      noPersonalInformationGuarantee: false,
      privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    boundary: { training: 0, network: 0, CEU: 0, authority: 0, action: 0,
      opportunity: 0, delegation: 0, independentOutcome: 0,
      longitudinalOutcome: 0 },
  };
}

export function buildMolmoact2So101AuditFromSource(sourceDirectory, options = {}) {
  const verified = verifyMolmoact2So101SourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const body = buildBody(verified, runMolmoact2So101Replay(sourceDirectory, options));
  return { ...body, artifactHash: molmoact2So101ArtifactHash(body) };
}

function zeroBoundary(value) {
  return plain(value) && ["training", "network", "CEU", "authority", "action",
    "opportunity", "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => value[key] === 0);
}

export function verifyMolmoact2So101Audit(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== MOLMOACT2_SO101_AUDIT_SCHEMA
      || artifact.frozenAt !== MOLMOACT2_SO101_FROZEN_AT
      || artifact.status !== "PINNED_COMPLETE_MOLMOACT2_SO101_ZERO_SHOT_TRACE_REPLAY"
      || artifact.admission !== "QUARANTINE_EVAL" || !HASH.test(artifact.artifactHash ?? "")) {
      fail("ARTIFACT_SHAPE_INVALID");
    }
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== molmoact2So101ArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.selectedObjects !== 9 || artifact.source?.selectedBytes !== 64_921_495
      || artifact.replay?.parquet?.rows !== 688
      || artifact.replay?.totals?.observationEvents !== 344
      || artifact.replay?.totals?.actionChunkEvents !== 40
      || artifact.replay?.totals?.appliedActionEvents !== 605
      || artifact.taskOutcome?.failureTraces !== 2
      || artifact.taskOutcome?.successTraces !== 0) fail("ARTIFACT_COUNTS_INVALID");
    if (artifact.transportAndExecution?.transportWorkingIndependentlyVerified !== false
      || artifact.transportAndExecution?.publisherClaimsRemoteInferenceBroughtUp !== true
      || artifact.transportAndExecution?.publisherClaimsContinuousActionStreaming !== true
      || artifact.transportAndExecution?.publisherClaimsRobotExecutedActions !== true
      || artifact.transportAndExecution?.sourceNativeAppliedActionRecordsPresent !== true
      || artifact.transportAndExecution?.physicalExecutionIndependentlyVerified !== false
      || artifact.transportAndExecution?.networkPermissionConferred !== false
      || artifact.transportAndExecution?.actionAuthorityConferred !== false
      || artifact.taskOutcome?.independentOutcome !== 0
      || artifact.taskOutcome?.longitudinalOutcome !== 0
      || artifact.taskOutcome?.recoveryPairs !== 0
      || artifact.conclusion?.taskLevelFailurePromotedToNetworkFailure !== false
      || artifact.conclusion?.transportWorkingVersusPolicyFailureIsPublisherInference !== true
      || artifact.conclusion?.rawExchangeAndAppliedActionRecordsSupportThatInference !== true
      || artifact.conclusion?.publisherTracePromotedToIndependentOutcome !== false
      || artifact.conclusion?.rawAppliedActionRecordPromotedToIndependentPhysicalEffect !== false
      || artifact.completeness?.completeRepositoryBytes !== true
      || artifact.completeness?.completeDeclaredTwoTraceRunSet !== true
      || artifact.completeness?.completeAttemptCensus !== false
      || artifact.completeness?.otherAttemptedOrDiscardedRunsUnknown !== true
      || artifact.completeness?.embeddedParquetImagesAcquired !== true
      || artifact.completeness?.gifPreviewsAcquired !== true
      || artifact.completeness?.gifStructureReplayed !== true
      || artifact.completeness?.visualOutcomeIndependentlyAdjudicated !== false
      || artifact.rights?.datasetCardClaim !== "apache-2.0"
      || artifact.rights?.repositoryLicenseFilePresent !== false
      || artifact.rights?.evaluationUseFinallyAdjudicated !== false
      || artifact.rights?.productionTrainingAllowed !== false
      || artifact.privacy?.rawSourceContainsHistoricalNetworkEndpoint !== true
      || artifact.privacy?.rawSourceContainsLocalDeviceIdentifier !== true
      || artifact.privacy?.rawSourceContainsSceneImages !== true
      || artifact.privacy?.noPersonalInformationGuarantee !== false
      || artifact.privacy?.publicAvailabilityResolvesPrivacy !== false
      || artifact.privacy?.privacyReviewComplete !== false
      || artifact.privacy?.sensitiveValuesRepublishedInReport !== false
      || !zeroBoundary(artifact.boundary)) fail("ARTIFACT_BOUNDARY_INVALID");
    return { ok: true, artifactHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyMolmoact2So101AuditWithSource(artifact,
  sourceDirectory, options = {}) {
  const standalone = verifyMolmoact2So101Audit(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildMolmoact2So101AuditFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: rebuilt.source.sourceManifestHash,
      sourceRoot: rebuilt.source.sourceRoot,
      verificationLevel: "FULL_COMPLETE_REPOSITORY_EVENT_PARQUET_AND_GIF_STRUCTURE_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
