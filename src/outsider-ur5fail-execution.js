/*
 * Pinned full-repository intake for the UR5-Fail test split.  The compressed
 * record archive is replayed in place: no member is extracted.  Execution
 * endpoint images and publisher annotations are evidence for start/end state
 * classification, not a continuous trajectory, recovery trace, independent
 * outcome, or longitudinal record.
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

export const UR5FAIL_ID = "paulpacaud/ur5fail_test_dataset";
export const UR5FAIL_REVISION = "fedfcb3346b92f6a2bfeb14dc254635c9a5013f1";
export const UR5FAIL_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const UR5FAIL_SOURCE_SCHEMA = "outsider/ur5fail-execution-source/v1";
export const UR5FAIL_AUDIT_SCHEMA = "outsider/ur5fail-execution-audit/v1";

export const UR5FAIL_FILES = Object.freeze([
  Object.freeze({ path: ".gitattributes", bytes: 2_461,
    oid: "1ef325f1b111266a6b26e0196871bd78baa8c2f3", lfs: null }),
  Object.freeze({ path: "README.md", bytes: 11_009,
    oid: "27d21d0c2a1c7987af0e6871d3ffe9c3bf7b8ab6", lfs: null }),
  Object.freeze({ path: "internVL_dataset_execution_thinking.jsonl", bytes: 331_829,
    oid: "c1cda535d0707fba6490f5f737beee0461118e4b", lfs: null }),
  Object.freeze({ path: "internVL_dataset_execution_vanilla.jsonl", bytes: 312_649,
    oid: "45c5cd4ec0483ee94c3d506e3f2c2d09ad2bd9bf", lfs: null }),
  Object.freeze({ path: "internVL_dataset_planning_thinking.jsonl", bytes: 278_312,
    oid: "182ce34b8c00baa631d016478e2651e92b305a5c", lfs: null }),
  Object.freeze({ path: "internVL_dataset_planning_vanilla.jsonl", bytes: 259_132,
    oid: "09ba4a69f597d73481d49b9d397c3f643c3c51cf", lfs: null }),
  Object.freeze({ path: "metadata_execution.jsonl", bytes: 102_667,
    oid: "3ab09ce296488fde190e3115480b4f1797cfcdb2", lfs: null }),
  Object.freeze({ path: "metadata_planning.jsonl", bytes: 96_248,
    oid: "42bc958c6a9d95e37bf9cafad0a22be79c6312ac", lfs: null }),
  Object.freeze({ path: "records.tar.gz", bytes: 54_848_824,
    oid: "691b4f9e35d4b570602296df549054720a26ded5",
    lfs: "ef56f7b0c4e196a758a8571ee24acafba5f27043102b55e25d32f423d79f45e1" }),
]);

export const UR5FAIL_PROFILE = Object.freeze({
  usedStorage: 110_716_350,
  treeFiles: 9,
  treeBytes: 56_243_131,
  selectedObjects: 9,
  selectedBytes: 56_243_131,
  archiveBytes: 54_848_824,
  executionSamples: 140,
  executionImageReferences: 840,
  executionUniqueImages: 510,
  archivePngFiles: 523,
  archiveUnreferencedPngFiles: 13,
  executionSuccesses: 69,
  executionFailures: 71,
  planningSamples: 140,
  planningSuccesses: 70,
  planningFailures: 70,
  imageWidth: 256,
  imageHeight: 256,
  viewpoints: 3,
});

const HF = "https://huggingface.co";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;

function fail(code, detail = null) {
  throw new Error(detail === null ? `UR5FAIL_${code}` : `UR5FAIL_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function ur5failSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return ur5failSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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
  const encoded = UR5FAIL_ID.split("/").map(encodeURIComponent).join("/");
  return {
    repository: `${HF}/api/datasets/${encoded}/revision/${UR5FAIL_REVISION}`,
    tree: `${HF}/api/datasets/${encoded}/tree/${UR5FAIL_REVISION}`
      + "?recursive=true&limit=1000",
    raw: `${HF}/datasets/${encoded}/resolve/${UR5FAIL_REVISION}`,
  };
}

function validateRepository(value) {
  if (!plain(value) || !Array.isArray(value.siblings)) fail("REPOSITORY_INVALID");
  const paths = value.siblings.map((entry) => entry?.rfilename)
    .sort((left, right) => left.localeCompare(right));
  if (value.id !== UR5FAIL_ID || value.sha !== UR5FAIL_REVISION
    || value.private !== false || value.gated !== false || value.disabled !== false
    || value.usedStorage !== UR5FAIL_PROFILE.usedStorage
    || value.cardData?.license !== "apache-2.0" || paths.length !== 9
    || !same(paths, UR5FAIL_FILES.map((entry) => entry.path)
      .sort((left, right) => left.localeCompare(right)))) fail("REPOSITORY_PROFILE_INVALID");
  return { id: value.id, sha: value.sha, private: value.private,
    gated: value.gated, disabled: value.disabled, usedStorage: value.usedStorage,
    cardLicense: value.cardData.license, siblingPaths: paths };
}

function validateTree(raw) {
  if (!Array.isArray(raw) || raw.length !== 9) fail("TREE_INVALID");
  const projection = raw.map((entry) => {
    if (!plain(entry) || entry.type !== "file" || !safeRemotePath(entry.path)
      || !SHA1.test(entry.oid ?? "") || !Number.isSafeInteger(entry.size)
      || entry.size < 0) fail("TREE_ENTRY_INVALID");
    if (entry.lfs == null) return { path: entry.path, oid: entry.oid,
      sizeBytes: entry.size, lfsSha256: null };
    if (!plain(entry.lfs) || !SHA256_BARE.test(entry.lfs.oid ?? "")
      || entry.lfs.size !== entry.size) fail("TREE_LFS_INVALID");
    return { path: entry.path, oid: entry.oid, sizeBytes: entry.size,
      lfsSha256: `sha256:${entry.lfs.oid}` };
  }).sort((left, right) => left.path.localeCompare(right.path));
  const expected = UR5FAIL_FILES.map((entry) => ({ path: entry.path,
    oid: entry.oid, sizeBytes: entry.bytes,
    lfsSha256: entry.lfs === null ? null : `sha256:${entry.lfs}` }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (!same(projection, expected)) fail("TREE_PROFILE_INVALID");
  return projection;
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
  const value = await boundedFetch(url, 8 * 1024 * 1024, fetchImpl);
  return { ...value, parsed: parseJson(value.bytes, url) };
}

async function capturePhase(root, phase, fetchImpl) {
  const endpoint = endpoints();
  const [repository, tree] = await Promise.all([
    fetchJson(endpoint.repository, fetchImpl), fetchJson(endpoint.tree, fetchImpl),
  ]);
  validateRepository(repository.parsed);
  validateTree(tree.parsed);
  return [{ kind: "repository", value: repository, requestUrl: endpoint.repository },
    { kind: "tree", value: tree, requestUrl: endpoint.tree }].map((entry) => {
    const file = `api/${phase}/${entry.kind}.json`;
    writePrivateOnce(safeJoin(root, file), entry.value.bytes);
    return { phase, kind: entry.kind, file, requestUrl: entry.requestUrl,
      finalUrl: entry.value.finalUrl, status: entry.value.status,
      contentType: entry.value.contentType, bytes: entry.value.bytes.length,
      sha256: ur5failSha256(entry.value.bytes) };
  });
}

async function downloadObject(root, entry, fetchImpl) {
  const url = `${endpoints().raw}/${entry.path.split("/")
    .map(encodeURIComponent).join("/")}`;
  const response = await boundedFetch(url, entry.sizeBytes + 1, fetchImpl);
  const sha256 = ur5failSha256(response.bytes);
  if (response.bytes.length !== entry.sizeBytes
    || (entry.lfsSha256 === null ? gitBlobOid(response.bytes) !== entry.oid
      : sha256 !== entry.lfsSha256)) fail("OBJECT_INVALID", entry.path);
  const file = `objects/${entry.path}`;
  writePrivateOnce(safeJoin(root, file), response.bytes);
  return { datasetId: UR5FAIL_ID, revision: UR5FAIL_REVISION,
    path: entry.path, file, requestUrl: url, finalUrl: response.finalUrl,
    status: response.status, contentType: response.contentType,
    bytes: response.bytes.length, sha256, gitOid: entry.oid,
    lfsSha256: entry.lfsSha256 };
}

function rootProjection(apiSnapshots, remoteObjects) {
  const files = [...apiSnapshots, ...remoteObjects].map((entry) => ({
    file: entry.file, bytes: entry.bytes, sha256: entry.sha256,
  })).sort((left, right) => left.file.localeCompare(right.file));
  return { files, sourceRoot: digest("outsider/ur5fail-source-root/v1", files) };
}

export async function acquirePinnedUr5failSource(sourceDirectory, options = {}) {
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
      "api/before/tree.json")), "tree-before"));
    const remoteObjects = (await Promise.all(treeBefore.map((entry) =>
      downloadObject(temporary, entry, fetchImpl))))
      .sort((left, right) => left.file.localeCompare(right.file));
    const after = await capturePhase(temporary, "after", fetchImpl);
    const rb = validateRepository(parseJson(readFileSync(path.join(temporary,
      "api/before/repository.json")), "repository-before"));
    const ra = validateRepository(parseJson(readFileSync(path.join(temporary,
      "api/after/repository.json")), "repository-after"));
    const ta = validateTree(parseJson(readFileSync(path.join(temporary,
      "api/after/tree.json")), "tree-after"));
    if (!same(rb, ra) || !same(treeBefore, ta)) fail("SOURCE_DRIFT");
    const apiSnapshots = [...before, ...after]
      .sort((left, right) => left.file.localeCompare(right.file));
    const rooted = rootProjection(apiSnapshots, remoteObjects);
    const body = { schema: UR5FAIL_SOURCE_SCHEMA, frozenAt: UR5FAIL_FROZEN_AT,
      apiSnapshots, remoteObjects, sourceFiles: rooted.files,
      sourceRoot: rooted.sourceRoot,
      closure: { selectedObjects: 9, selectedBytes: 56_243_131,
        completeRepositoryBytes: true, archiveObjects: 1,
        executionMetadataObjects: 1, planningMetadataObjects: 1,
        derivedInternvlObjects: 4, rootSupportObjects: 2, excludedObjects: 0 } };
    const manifest = { ...body,
      manifestHash: digest("outsider/ur5fail-source-manifest/v1", body) };
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

export function verifyUr5failSourceDirectory(sourceDirectory) {
  try {
    const manifest = parseJson(readRegular(path.join(sourceDirectory,
      "acquisition-manifest.json")), "manifest");
    if (!plain(manifest) || manifest.schema !== UR5FAIL_SOURCE_SCHEMA
      || manifest.frozenAt !== UR5FAIL_FROZEN_AT
      || !Array.isArray(manifest.apiSnapshots) || manifest.apiSnapshots.length !== 4
      || !Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 9
      || !HASH.test(manifest.sourceRoot ?? "") || !HASH.test(manifest.manifestHash ?? "")) {
      fail("MANIFEST_INVALID");
    }
    const snapshots = {};
    for (const descriptor of manifest.apiSnapshots) {
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      if (ur5failSha256(bytes) !== descriptor.sha256) fail("SNAPSHOT_HASH_INVALID");
      snapshots[`${descriptor.phase}:${descriptor.kind}`] = parseJson(bytes, descriptor.file);
    }
    if (!same(validateRepository(snapshots["before:repository"]),
      validateRepository(snapshots["after:repository"]))) fail("REPOSITORY_DRIFT");
    const before = validateTree(snapshots["before:tree"]);
    if (!same(before, validateTree(snapshots["after:tree"]))) fail("TREE_DRIFT");
    if (!same(before.map((entry) => entry.path).sort(),
      manifest.remoteObjects.map((entry) => entry.path).sort())) fail("REMOTE_SET_INVALID");
    for (const descriptor of manifest.remoteObjects) {
      const entry = before.find((value) => value.path === descriptor.path);
      if (!entry || descriptor.datasetId !== UR5FAIL_ID
        || descriptor.revision !== UR5FAIL_REVISION
        || descriptor.file !== `objects/${entry.path}` || descriptor.bytes !== entry.sizeBytes
        || descriptor.gitOid !== entry.oid || descriptor.lfsSha256 !== entry.lfsSha256) {
        fail("REMOTE_DESCRIPTOR_INVALID");
      }
      const bytes = readRegular(safeJoin(sourceDirectory, descriptor.file), descriptor.bytes);
      const sha256 = ur5failSha256(bytes);
      if (descriptor.sha256 !== sha256
        || (entry.lfsSha256 === null ? gitBlobOid(bytes) !== entry.oid
          : sha256 !== entry.lfsSha256)) fail("REMOTE_HASH_INVALID");
    }
    const rooted = rootProjection(manifest.apiSnapshots, manifest.remoteObjects);
    if (!same(rooted.files, manifest.sourceFiles) || rooted.sourceRoot !== manifest.sourceRoot) {
      fail("SOURCE_ROOT_INVALID");
    }
    const expectedFiles = [...manifest.sourceFiles.map((entry) => entry.file),
      "acquisition-manifest.json"].sort((left, right) => left.localeCompare(right));
    if (!same(walk(sourceDirectory), expectedFiles)) fail("FILE_CLOSURE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/ur5fail-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    return { ok: true, manifest,
      verificationLevel: "PINNED_COMPLETE_UR5FAIL_REPOSITORY_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, os, pathlib, re, struct, sys, tarfile

root = os.path.join(sys.argv[1], "objects")

def die(code):
    raise RuntimeError("UR5FAIL_REPLAY_" + code)

def json_lines(name):
    with open(os.path.join(root, name), "r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]

execution = json_lines("metadata_execution.jsonl")
planning = json_lines("metadata_planning.jsonl")
if len(execution) != 140 or len(planning) != 140:
    die("METADATA_COUNTS_INVALID")

def valid_view_triplet(values):
    parsed = []
    for value in values:
        match = re.match(r"^(.+)_img_viewpoint_(0|1|2|left|right|wrist)\.png$",
          os.path.basename(value))
        if match is None:
            return False
        parsed.append((match.group(1), match.group(2)))
    viewpoints = {value[1] for value in parsed}
    return len({value[0] for value in parsed}) == 1 and viewpoints in (
      {"0", "1", "2"}, {"left", "right", "wrist"})

execution_refs = []
execution_categories = collections.Counter()
execution_rewards = collections.Counter()
taskvars = set()
episode_keys = set()
for sample in execution:
    if set(sample) != {"taskvar", "task_instruction", "episode_id", "images",
      "failure_mode", "detailed_subtask_name", "failure_reason", "plan", "reward",
      "planning_reward", "execution_reward"}:
        die("EXECUTION_KEYS_INVALID")
    images = sample["images"]
    if (not isinstance(images, list) or len(images) != 6
        or not valid_view_triplet(images[:3]) or not valid_view_triplet(images[3:])):
        die("EXECUTION_IMAGES_INVALID")
    if (sample["planning_reward"] != 1
        or sample["reward"] != sample["execution_reward"]
        or sample["execution_reward"] not in (0, 1)):
        die("EXECUTION_REWARD_INVALID")
    execution_refs.extend(images)
    execution_categories[sample["failure_mode"]] += 1
    execution_rewards[str(sample["execution_reward"])] += 1
    taskvars.add(sample["taskvar"])
    episode_keys.add((sample["taskvar"], sample["episode_id"]))

planning_refs = []
planning_categories = collections.Counter()
planning_rewards = collections.Counter()
for sample in planning:
    if set(sample) != {"taskvar", "task_instruction", "episode_id", "images",
      "failure_mode", "detailed_subtask_name", "failure_reason", "plan",
      "planning_reward", "execution_reward"}:
        die("PLANNING_KEYS_INVALID")
    if (not isinstance(sample["images"], list) or len(sample["images"]) != 1
        or sample["execution_reward"] != 1
        or sample["planning_reward"] not in (0, 1)):
        die("PLANNING_REWARD_INVALID")
    planning_refs.extend(sample["images"])
    planning_categories[sample["failure_mode"]] += 1
    planning_rewards[str(sample["planning_reward"])] += 1

archive_paths = set()
archive_projection = []
directory_members = 0
total_png_bytes = 0
archive_file = os.path.join(root, "records.tar.gz")
with tarfile.open(archive_file, "r:gz") as archive:
    for member in archive.getmembers():
        parts = pathlib.PurePosixPath(member.name).parts
        if member.name.startswith("/") or ".." in parts or "" in parts:
            die("ARCHIVE_PATH_INVALID")
        if member.isdir():
            directory_members += 1
            continue
        if (not member.isfile() or not member.name.endswith(".png")
            or member.issym() or member.islnk() or member.size <= 24):
            die("ARCHIVE_MEMBER_INVALID")
        stream = archive.extractfile(member)
        if stream is None:
            die("ARCHIVE_STREAM_INVALID")
        raw = stream.read()
        if (len(raw) != member.size or raw[:8] != b"\x89PNG\r\n\x1a\n"
            or raw[12:16] != b"IHDR"):
            die("PNG_INVALID")
        width, height = struct.unpack(">II", raw[16:24])
        if width != 256 or height != 256:
            die("PNG_DIMENSIONS_INVALID")
        if member.name in archive_paths:
            die("ARCHIVE_DUPLICATE_PATH")
        archive_paths.add(member.name)
        total_png_bytes += len(raw)
        archive_projection.append({"path": member.name, "bytes": len(raw),
          "sha256": hashlib.sha256(raw).hexdigest()})

execution_unique = set(execution_refs)
planning_unique = set(planning_refs)
if (len(execution_refs) != 840 or len(execution_unique) != 510
    or not execution_unique.issubset(archive_paths)
    or not planning_unique.issubset(archive_paths)):
    die("REFERENCE_CLOSURE_INVALID")

unreferenced_archive = sorted(archive_paths - execution_unique)
if len(archive_paths) != 523 or len(unreferenced_archive) != 13:
    die("ARCHIVE_ORPHAN_PROFILE_INVALID")

derived = {}
for name in ["internVL_dataset_execution_vanilla.jsonl",
  "internVL_dataset_execution_thinking.jsonl",
  "internVL_dataset_planning_vanilla.jsonl",
  "internVL_dataset_planning_thinking.jsonl"]:
    rows = json_lines(name)
    expected = 140
    if len(rows) != expected:
        die("DERIVED_COUNT_INVALID")
    references = []
    for row in rows:
        images = row.get("image")
        if not isinstance(images, list) or not isinstance(row.get("conversations"), list):
            die("DERIVED_SHAPE_INVALID")
        references.extend(images)
    if not set(references).issubset(archive_paths):
        die("DERIVED_REFERENCE_INVALID")
    derived[name] = {"rows": len(rows), "imageReferences": len(references),
      "uniqueImageReferences": len(set(references))}

projection = sorted(archive_projection, key=lambda value: value["path"])
closure_hash = hashlib.sha256(("outsider/ur5fail-png-closure/v1\0"
  + json.dumps(projection, sort_keys=True, separators=(",", ":"))).encode()).hexdigest()
print(json.dumps({
  "execution": {"samples": 140, "imageReferences": 840,
    "uniqueImages": 510, "successes": execution_rewards["1"],
    "failures": execution_rewards["0"],
    "categoryCounts": dict(sorted(execution_categories.items())),
    "taskvars": len(taskvars), "taskEpisodePairs": len(episode_keys),
    "allPlanningRewardsOne": True, "labelsPublisherManual": True},
  "planning": {"samples": 140, "imageReferences": 140,
    "uniqueImages": len(planning_unique), "successes": planning_rewards["1"],
    "failures": planning_rewards["0"],
    "categoryCounts": dict(sorted(planning_categories.items())),
    "failuresPublisherDescribedAsSynthetic": True},
  "archive": {"regularPngFiles": len(archive_paths),
    "directoryMembers": directory_members, "totalPngBytes": total_png_bytes,
    "width": 256, "height": 256, "allExecutionReferencesClosed": True,
    "referencedExecutionPngFiles": len(execution_unique),
    "unreferencedPngFiles": len(unreferenced_archive),
    "allArchiveImagesReferencedByExecutionMetadata": False,
    "unreferencedPathsHash": "sha256:" + hashlib.sha256(
      ("outsider/ur5fail-unreferenced-png-paths/v1\0" + json.dumps(
        unreferenced_archive, separators=(",", ":"))).encode()).hexdigest(),
    "planningReferencesSubset": True, "membersExtractedToWorkspace": False,
    "imageClosureHash": "sha256:" + closure_hash},
  "derived": derived,
}, sort_keys=True, separators=(",", ":")))
`;

export function runUr5failReplay(sourceDirectory, options = {}) {
  const verified = verifyUr5failSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const result = spawnSync(python, ["-c", PYTHON_REPLAY, sourceDirectory], {
    encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) fail("PYTHON_REPLAY_FAILED",
    String(result.stderr || result.stdout).trim());
  const replay = parseJson(Buffer.from(result.stdout.trim(), "utf8"), "python");
  const readme = readRegular(path.join(sourceDirectory, "objects", "README.md"))
    .toString("utf8");
  const claims = ["6-DoF UR5 robot arm", "Subtasks are manually labeled",
    "Planning failures are generated", "3 cameras", "Apache 2.0"];
  if (claims.some((claim) => !readme.includes(claim))) fail("README_CLAIM_MISSING");
  return replay;
}

export function ur5failArtifactHash(body) {
  return digest("outsider/ur5fail-execution-audit/v1", body);
}

function buildBody(verified, replay) {
  return {
    schema: UR5FAIL_AUDIT_SCHEMA,
    frozenAt: UR5FAIL_FROZEN_AT,
    status: "PINNED_UR5FAIL_EXECUTION_ENDPOINT_IMAGE_REPLAY",
    admission: "QUARANTINE_EVAL",
    source: { id: UR5FAIL_ID, revision: UR5FAIL_REVISION,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      selectedObjects: 9, selectedBytes: 56_243_131 },
    replay,
    physicalProvenance: { publisherClaimsRealUr5Robot: true,
      publisherClaimsThreeRealSenseCameras: true,
      publisherClaimsAutonomousPolicy: true,
      realRobotIdentityIndependentlyVerified: false },
    outcome: { executionLabelsPublisherManual: true,
      executionSuccesses: 69, executionFailures: 71,
      planningFailuresPublisherSynthetic: true,
      independentOutcome: 0, longitudinalOutcome: 0 },
    morphology: { continuousTrajectoryAvailable: false,
      actionStreamAvailable: false, stateStreamAvailable: false,
      startAndEndThreeViewImagesAvailable: true,
      endpointTripletNamingValidated: true,
      pngByteStructureReplayComplete: true,
      visualContentReviewed: false,
      failureToRecoveryPairAvailable: false,
      recoveryEpisodeAvailable: false },
    completeness: { completeRepositoryBytes: true,
      completePublishedExecutionMetadata: true,
      all840ExecutionImageReferencesClosed: true,
      uniqueExecutionImages: 510,
      archivePngFiles: 523,
      unreferencedArchiveImages: 13,
      allArchiveImagesReferencedByExecutionMetadata: false,
      orphanImagesAssignableToPublishedAttempts: false,
      completeAttemptCensus: false,
      publisherDiscardedAttemptsUnknown: true,
      archiveMembersExtracted: false,
      visualOutcomeIndependentlyAdjudicated: false },
    rights: { datasetCardClaim: "Apache-2.0",
      repositoryLicenseFilePresent: false,
      productionTrainingAllowed: false,
      evaluationUseFinallyAdjudicated: false },
    privacy: { physicalSceneImagesPresent: true,
      noPersonalInformationGuarantee: false,
      privacyReviewComplete: false,
      publicAvailabilityResolvesPrivacy: false },
    boundary: { training: 0, network: 0, CEU: 0, authority: 0, action: 0,
      opportunity: 0, delegation: 0, independentOutcome: 0,
      longitudinalOutcome: 0 },
  };
}

export function buildUr5failAuditFromSource(sourceDirectory, options = {}) {
  const verified = verifyUr5failSourceDirectory(sourceDirectory);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const body = buildBody(verified, runUr5failReplay(sourceDirectory, options));
  return { ...body, artifactHash: ur5failArtifactHash(body) };
}

function zeroBoundary(value) {
  return plain(value) && ["training", "network", "CEU", "authority", "action",
    "opportunity", "delegation", "independentOutcome", "longitudinalOutcome"]
    .every((key) => value[key] === 0);
}

export function verifyUr5failAudit(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== UR5FAIL_AUDIT_SCHEMA
      || artifact.frozenAt !== UR5FAIL_FROZEN_AT
      || artifact.status !== "PINNED_UR5FAIL_EXECUTION_ENDPOINT_IMAGE_REPLAY"
      || artifact.admission !== "QUARANTINE_EVAL" || !HASH.test(artifact.artifactHash ?? "")) {
      fail("ARTIFACT_SHAPE_INVALID");
    }
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== ur5failArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    const expectedExecution = {
      samples: 140, imageReferences: 840, uniqueImages: 510,
      successes: 69, failures: 71,
      categoryCounts: { ground_truth: 69, "no progress": 1, no_close: 13,
        slip: 1, translation_object: 16, translation_target: 1,
        "wrong object manipulated": 8, "wrong object state or placement": 19,
        wrong_object: 12 },
      taskvars: 23, taskEpisodePairs: 56,
      allPlanningRewardsOne: true, labelsPublisherManual: true,
    };
    const expectedPlanning = {
      samples: 140, imageReferences: 140, uniqueImages: 38,
      successes: 70, failures: 70,
      categoryCounts: { "contradictory subtasks": 11, ground_truth: 70,
        "missing subtask": 20, "wrong object manipulated": 13,
        "wrong object state or placement": 16, "wrong order": 10 },
      failuresPublisherDescribedAsSynthetic: true,
    };
    const expectedArchive = {
      regularPngFiles: 523, directoryMembers: 131, totalPngBytes: 54_763_820,
      width: 256, height: 256, allExecutionReferencesClosed: true,
      referencedExecutionPngFiles: 510, unreferencedPngFiles: 13,
      allArchiveImagesReferencedByExecutionMetadata: false,
      unreferencedPathsHash:
        "sha256:c75af6f5c767929b9030636d0100020d4598f926d699fee7d43ed8fc3b0d607c",
      planningReferencesSubset: true, membersExtractedToWorkspace: false,
      imageClosureHash:
        "sha256:50320016d0c515ebf32120e16edaf754fe16457af4937915ce6ad06641262f61",
    };
    const expectedDerived = {
      "internVL_dataset_execution_thinking.jsonl": {
        rows: 140, imageReferences: 840, uniqueImageReferences: 510 },
      "internVL_dataset_execution_vanilla.jsonl": {
        rows: 140, imageReferences: 840, uniqueImageReferences: 510 },
      "internVL_dataset_planning_thinking.jsonl": {
        rows: 140, imageReferences: 140, uniqueImageReferences: 38 },
      "internVL_dataset_planning_vanilla.jsonl": {
        rows: 140, imageReferences: 140, uniqueImageReferences: 38 },
    };
    if (!plain(artifact.source) || artifact.source.id !== UR5FAIL_ID
      || artifact.source.revision !== UR5FAIL_REVISION
      || !HASH.test(artifact.source.sourceManifestHash ?? "")
      || !HASH.test(artifact.source.sourceRoot ?? "")
      || artifact.source.selectedObjects !== 9 || artifact.source.selectedBytes !== 56_243_131
      || !same(artifact.replay?.execution, expectedExecution)
      || !same(artifact.replay?.planning, expectedPlanning)
      || !same(artifact.replay?.archive, expectedArchive)
      || !same(artifact.replay?.derived, expectedDerived)
      || !same(artifact.physicalProvenance, {
        publisherClaimsRealUr5Robot: true,
        publisherClaimsThreeRealSenseCameras: true,
        publisherClaimsAutonomousPolicy: true,
        realRobotIdentityIndependentlyVerified: false })
      || !same(artifact.outcome, { executionLabelsPublisherManual: true,
        executionSuccesses: 69, executionFailures: 71,
        planningFailuresPublisherSynthetic: true,
        independentOutcome: 0, longitudinalOutcome: 0 })
      || !same(artifact.morphology, { continuousTrajectoryAvailable: false,
        actionStreamAvailable: false, stateStreamAvailable: false,
        startAndEndThreeViewImagesAvailable: true,
        endpointTripletNamingValidated: true,
        pngByteStructureReplayComplete: true,
        visualContentReviewed: false,
        failureToRecoveryPairAvailable: false,
        recoveryEpisodeAvailable: false })
      || !same(artifact.completeness, { completeRepositoryBytes: true,
        completePublishedExecutionMetadata: true,
        all840ExecutionImageReferencesClosed: true,
        uniqueExecutionImages: 510, archivePngFiles: 523,
        unreferencedArchiveImages: 13,
        allArchiveImagesReferencedByExecutionMetadata: false,
        orphanImagesAssignableToPublishedAttempts: false,
        completeAttemptCensus: false,
        publisherDiscardedAttemptsUnknown: true,
        archiveMembersExtracted: false,
        visualOutcomeIndependentlyAdjudicated: false })
      || !same(artifact.rights, { datasetCardClaim: "Apache-2.0",
        repositoryLicenseFilePresent: false,
        productionTrainingAllowed: false,
        evaluationUseFinallyAdjudicated: false })
      || !same(artifact.privacy, { physicalSceneImagesPresent: true,
        noPersonalInformationGuarantee: false,
        privacyReviewComplete: false,
        publicAvailabilityResolvesPrivacy: false })
      || !zeroBoundary(artifact.boundary)) fail("ARTIFACT_BOUNDARY_INVALID");
    return { ok: true, artifactHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyUr5failAuditWithSource(artifact,
  sourceDirectory, options = {}) {
  const standalone = verifyUr5failAudit(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildUr5failAuditFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: rebuilt.source.sourceManifestHash,
      sourceRoot: rebuilt.source.sourceRoot,
      verificationLevel: "FULL_UR5FAIL_METADATA_TAR_PNG_AND_DERIVED_REFERENCE_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
