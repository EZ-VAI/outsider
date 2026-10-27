/*
 * Pinned REBOOT recovery-data pilot.
 *
 * This module deliberately separates four things that are easy to blur:
 *   1. byte-pinned source acquisition;
 *   2. privacy-minimised episode projections;
 *   3. an episode-disjoint recovery-window acquisition ranker; and
 *   4. authority, which remains exactly zero.
 *
 * The trained model is not a robot policy and cannot establish success,
 * causal effect, CEU, credit, delegation, or permission to act.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, closeSync,
  readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
  constants as fsConstants,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const REBOOT_RECOVERY_PILOT_SCHEMA = "outsider/reboot-recovery-pilot/v1";
export const REBOOT_SOURCE_MANIFEST_SCHEMA = "outsider/reboot-pinned-source/v1";
export const REBOOT_DATASET_ID = "REBOOT26/sample_recovery-demonstration";
export const REBOOT_REVISION = "0633573d0438be1185bddebdf1a2c8f5505f7b2a";
export const REBOOT_FROZEN_AT = "2026-08-28T00:00:00.000Z";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${REBOOT_DATASET_ID}`;
const TREE_PATH = `/api/datasets/${REBOOT_DATASET_ID}/tree/${REBOOT_REVISION}`;
const RAW_ROOT = `${HF_ORIGIN}/datasets/${REBOOT_DATASET_ID}/resolve/${REBOOT_REVISION}`;
const PROJECT_URL = "https://nanayawoa.github.io/REBOOT/";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SHA256_BARE = /^[a-f0-9]{64}$/u;
const SAFE_REMOTE_PATH = /^(README\.md|meta\/(info\.json|phase\.json|stats\.json|tasks\.parquet|episodes\/chunk-000\/file-00[01]\.parquet)|data\/chunk-000\/file-0(?:[0-5][0-9])\.parquet)$/u;
const DATA_PATH = /^data\/chunk-000\/file-(0[0-5][0-9])\.parquet$/u;
const META_EPISODE_PATH = /^meta\/episodes\/chunk-000\/file-00[01]\.parquet$/u;
const MAX_REMOTE_FILE_BYTES = 1024 * 1024;
const MAX_SELECTED_BYTES = 12 * 1024 * 1024;
const MAX_API_BYTES = 8 * 1024 * 1024;
const CANONICAL_SOURCE_MANIFEST_HASH
  = "sha256:d82c74b5ea2b19dcc06a9309c42e4bdb2d149bce4015c45ceefcfccb09ae4373";
const FEATURE_STRIDE_FRAMES = 5;
const FEATURE_NAMES = Object.freeze([
  "mean_abs_command_state_error",
  "max_abs_command_state_error",
  "left_abs_command_state_error",
  "right_abs_command_state_error",
  "gripper_abs_command_state_error",
  "mean_abs_state_delta",
  "max_abs_state_delta",
  "mean_abs_action_delta",
  "bilateral_tracking_asymmetry",
]);
const PROMOTION_GATE = Object.freeze({
  minimumEligibleEpisodes: 40,
  minimumHoldoutEpisodes: 10,
  minimumAuprcLift: 0.005,
  minimumAuroc: 0.55,
  minimumBrierImprovement: 0.001,
  minimumLogLossImprovement: 0.002,
});
const BANNED_PROJECTION_KEYS = /(^|_)(operator|session|language|description|instruction|raw|image|video|url)(_|$)/iu;
const FAILURE_MODE_CODE = /^(misalignment|slip|premature_release|excessive_force|retention_failure|sub_mm_misalignment|jamming|poor_engagement|premature_grasp|delayed_start|freeze)$/u;

function fail(code, detail = null) {
  throw new Error(detail == null ? `REBOOT_RECOVERY_PILOT_${code}`
    : `REBOOT_RECOVERY_PILOT_${code}:${detail}`);
}
export function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function digest(domain, value) {
  return sha256Bytes(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
}
function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`);
}
function round(value, digits = 12) {
  if (!Number.isFinite(value)) fail("NON_FINITE_NUMBER");
  return Number(value.toFixed(digits));
}
function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function exactKeys(value, keys) {
  return exactObject(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}
function repositoryProjection(metadata) {
  if (!exactObject(metadata) || metadata.id !== REBOOT_DATASET_ID
    || metadata.sha !== REBOOT_REVISION || metadata.private !== false
    || metadata.gated !== false || metadata.disabled !== false
    || String(metadata.cardData?.license ?? "").toLowerCase() !== "apache-2.0") {
    fail("REPOSITORY_METADATA_INVALID");
  }
  return {
    datasetId: REBOOT_DATASET_ID,
    revision: REBOOT_REVISION,
    private: false,
    gated: false,
    disabled: false,
    hfCardLicenseClaim: "apache-2.0",
    lastModified: typeof metadata.lastModified === "string" ? metadata.lastModified : null,
  };
}
function parseNextTreeLink(header) {
  if (header == null || header === "") return null;
  const pieces = String(header).split(",");
  const next = pieces.find((piece) => /;\s*rel="next"\s*$/iu.test(piece.trim()));
  if (!next) return null;
  const matched = /^\s*<([^>]+)>/u.exec(next);
  if (!matched) fail("TREE_NEXT_LINK_INVALID");
  const parsed = new URL(matched[1]);
  if (parsed.origin !== HF_ORIGIN || parsed.pathname !== TREE_PATH
    || parsed.searchParams.get("recursive") !== "true"
    || parsed.searchParams.get("expand") !== "true"
    || !parsed.searchParams.get("cursor")) fail("TREE_NEXT_LINK_UNSAFE");
  return parsed.toString();
}
async function boundedFetch(url, maximumBytes, fetchImpl) {
  const response = await fetchImpl(url, { redirect: "follow", headers: {
    accept: "application/json, application/octet-stream;q=0.9, text/plain;q=0.8",
    "user-agent": "outsider-reboot-recovery-pilot/1.0",
  } });
  if (!response?.ok) fail(`FETCH_${response?.status ?? "FAILED"}`, url);
  const declared = response.headers?.get?.("content-length");
  if (declared != null && (!/^[0-9]+$/u.test(declared)
    || Number(declared) > maximumBytes)) fail("FETCH_DECLARED_SIZE_INVALID", url);
  const reader = response.body?.getReader?.();
  if (!reader) fail("FETCH_BODY_MISSING", url);
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel();
      fail("FETCH_SIZE_INVALID", url);
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1) fail("FETCH_EMPTY", url);
  return { bytes: Buffer.concat(chunks, total), headers: response.headers };
}
async function jsonFetch(url, maximumBytes, fetchImpl) {
  const fetched = await boundedFetch(url, maximumBytes, fetchImpl);
  try { return { value: JSON.parse(fetched.bytes.toString("utf8")), headers: fetched.headers }; }
  catch { fail("FETCH_JSON_INVALID", url); }
}
async function fetchPinnedTree(fetchImpl) {
  const entries = [];
  let next = `${HF_API}/tree/${REBOOT_REVISION}?recursive=true&expand=true`;
  let pages = 0;
  const seenUrls = new Set();
  while (next !== null) {
    if (seenUrls.has(next) || pages >= 10) fail("TREE_PAGINATION_INVALID");
    seenUrls.add(next);
    const page = await jsonFetch(next, MAX_API_BYTES, fetchImpl);
    if (!Array.isArray(page.value) || page.value.length < 1) fail("TREE_PAGE_INVALID");
    entries.push(...page.value);
    pages += 1;
    next = parseNextTreeLink(page.headers?.get?.("link"));
  }
  const paths = entries.map((entry) => entry?.path);
  if (paths.some((entry) => typeof entry !== "string")
    || new Set(paths).size !== paths.length) fail("TREE_PATHS_INVALID");
  return { entries, pages };
}

function remoteBinding(entry) {
  if (exactObject(entry.lfs)) {
    if (!SHA256_BARE.test(entry.lfs.oid ?? "") || entry.lfs.size !== entry.size) {
      fail("TREE_LFS_BINDING_INVALID", entry.path);
    }
    return { kind: "LFS_SHA256", value: `sha256:${entry.lfs.oid}` };
  }
  if (!SHA1.test(entry.oid ?? "")) fail("TREE_GIT_BINDING_INVALID", entry.path);
  return { kind: "GIT_BLOB_SHA1", value: entry.oid };
}

export function selectPinnedRebootEntries(treeEntries) {
  if (!Array.isArray(treeEntries)) fail("TREE_INVALID");
  const files = treeEntries.filter((entry) => entry?.type === "file");
  const selected = files.filter((entry) => SAFE_REMOTE_PATH.test(entry.path ?? ""));
  const data = selected.filter((entry) => DATA_PATH.test(entry.path));
  const episodeMetadata = selected.filter((entry) => META_EPISODE_PATH.test(entry.path));
  const expectedDataPaths = Array.from({ length: 60 }, (_, index) =>
    `data/chunk-000/file-${String(index).padStart(3, "0")}.parquet`);
  const selectedPaths = selected.map((entry) => entry.path).sort();
  const requiredOtherPaths = [
    "README.md", "meta/info.json", "meta/phase.json", "meta/stats.json",
    "meta/tasks.parquet", "meta/episodes/chunk-000/file-000.parquet",
    "meta/episodes/chunk-000/file-001.parquet",
  ];
  const expectedPaths = [...expectedDataPaths, ...requiredOtherPaths].sort();
  if (canonicalizeStrict(selectedPaths) !== canonicalizeStrict(expectedPaths)
    || data.length !== 60 || episodeMetadata.length !== 2) fail("TREE_SELECTION_CHANGED");
  const videoFiles = files.filter((entry) => String(entry.path).startsWith("videos/"));
  if (videoFiles.length < 1) fail("TREE_VIDEO_EXCLUSION_NOT_OBSERVABLE");
  let totalBytes = 0;
  const projected = selected.map((entry) => {
    if (!Number.isSafeInteger(entry.size) || entry.size <= 0
      || entry.size > MAX_REMOTE_FILE_BYTES) fail("TREE_FILE_SIZE_INVALID", entry.path);
    totalBytes += entry.size;
    return { path: entry.path, sizeBytes: entry.size, remoteBinding: remoteBinding(entry) };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (totalBytes > MAX_SELECTED_BYTES) fail("TREE_SELECTED_BYTES_INVALID");
  return {
    selectionRule: "all 60 data/chunk-000 action-state Parquet files; both meta/episodes Parquet files; README and four exact metadata files; exclude every videos/ object",
    selected: projected,
    selectedCount: projected.length,
    selectedBytes: totalBytes,
    dataEpisodeFiles: data.length,
    episodeMetadataFiles: episodeMetadata.length,
    excludedVideoFiles: videoFiles.length,
  };
}

function safeTarget(root, remotePath) {
  if (!SAFE_REMOTE_PATH.test(remotePath)) fail("REMOTE_PATH_UNSAFE", remotePath);
  const target = path.resolve(root, ...remotePath.split("/"));
  const prefix = `${path.resolve(root)}${path.sep}`;
  if (!target.startsWith(prefix)) fail("REMOTE_PATH_ESCAPE", remotePath);
  return target;
}
function writeRaw(root, remotePath, bytes) {
  const target = safeTarget(root, remotePath);
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  chmodSync(path.dirname(target), 0o700);
  writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(target, 0o600);
}
async function mapConcurrent(values, width, operation) {
  const output = new Array(values.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor++;
      if (index >= values.length) return;
      output[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, values.length) }, worker));
  return output;
}
function checkRemoteBytes(selected, bytes) {
  if (bytes.length !== selected.sizeBytes) fail("REMOTE_SIZE_MISMATCH", selected.path);
  const contentSha256 = sha256Bytes(bytes);
  if (selected.remoteBinding.kind === "LFS_SHA256"
    && contentSha256 !== selected.remoteBinding.value) fail("REMOTE_LFS_MISMATCH", selected.path);
  if (selected.remoteBinding.kind === "GIT_BLOB_SHA1"
    && gitBlobOid(bytes) !== selected.remoteBinding.value) fail("REMOTE_GIT_MISMATCH", selected.path);
  return contentSha256;
}

export async function acquirePinnedRebootSource(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
  mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = path.join(path.dirname(target),
    `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(temporary, { mode: 0o700 });
  try {
    const beforeFetch = await jsonFetch(HF_API, MAX_API_BYTES, fetchImpl);
    const before = repositoryProjection(beforeFetch.value);
    const tree = await fetchPinnedTree(fetchImpl);
    const selection = selectPinnedRebootEntries(tree.entries);
    const downloaded = await mapConcurrent(selection.selected, 8, async (entry) => {
      const encodedPath = entry.path.split("/").map(encodeURIComponent).join("/");
      const fetched = await boundedFetch(`${RAW_ROOT}/${encodedPath}?download=true`,
        entry.sizeBytes, fetchImpl);
      const contentSha256 = checkRemoteBytes(entry, fetched.bytes);
      writeRaw(temporary, entry.path, fetched.bytes);
      return { ...entry, sha256: contentSha256 };
    });
    const readme = readFileSync(path.join(temporary, "README.md"), "utf8");
    if (!/(^|\n)license:\s*apache-2\.0\s*($|\n)/iu.test(readme)) {
      fail("README_LICENSE_CLAIM_MISSING");
    }
    const afterFetch = await jsonFetch(HF_API, MAX_API_BYTES, fetchImpl);
    const after = repositoryProjection(afterFetch.value);
    if (canonicalizeStrict(before) !== canonicalizeStrict(after)) {
      fail("REVISION_CHANGED_DURING_ACQUISITION");
    }
    const manifestBody = {
      schema: REBOOT_SOURCE_MANIFEST_SCHEMA,
      capturedAt: REBOOT_FROZEN_AT,
      datasetId: REBOOT_DATASET_ID,
      pinnedRevision: REBOOT_REVISION,
      repositoryBefore: before,
      repositoryAfter: after,
      revisionStableDuringAcquisition: true,
      treePagesFetched: tree.pages,
      treeEntryCount: tree.entries.length,
      selection: {
        rule: selection.selectionRule,
        selectedCount: selection.selectedCount,
        selectedBytes: selection.selectedBytes,
        dataEpisodeFiles: selection.dataEpisodeFiles,
        episodeMetadataFiles: selection.episodeMetadataFiles,
        excludedVideoFiles: selection.excludedVideoFiles,
        videoOrMediaFetched: false,
      },
      rightsClaims: {
        hfDatasetCard: { claim: "Apache-2.0", bytePinnedReadme: true,
          revision: REBOOT_REVISION },
        officialProjectPage: { claim: "CC-BY-4.0", url: PROJECT_URL,
          bytePinnedInThisAcquisition: false },
        resolution: "UNRESOLVED_LICENSE_MISMATCH",
        productionTrainingRightFinallyAdjudicated: false,
      },
      transportAttested: false,
      remoteObjects: downloaded.sort((left, right) => left.path.localeCompare(right.path)),
    };
    const manifest = { ...manifestBody,
      manifestHash: digest(`${REBOOT_SOURCE_MANIFEST_SCHEMA}/manifest`, manifestBody) };
    if (options.requireCanonicalProfile !== false
      && manifest.manifestHash !== CANONICAL_SOURCE_MANIFEST_HASH) {
      fail("CANONICAL_SOURCE_PROFILE_CHANGED");
    }
    writeFileSync(path.join(temporary, "acquisition-manifest.json"), canonicalBytes(manifest),
      { flag: "wx", mode: 0o600 });
    chmodSync(path.join(temporary, "acquisition-manifest.json"), 0o600);
    renameSync(temporary, target);
    return { sourceDirectory: target, manifest,
      manifestFileSha256: sha256Bytes(readFileSync(path.join(target, "acquisition-manifest.json"))) };
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    throw error;
  }
}

function recursiveFiles(root, relative = "") {
  const directory = path.join(root, relative);
  const output = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) fail("SOURCE_SYMLINK", child);
    if (entry.isDirectory()) output.push(...recursiveFiles(root, child));
    else if (entry.isFile()) output.push(child);
    else fail("SOURCE_SPECIAL_FILE", child);
  }
  return output.sort();
}
function stableReadFile(target, expectedBytes) {
  const beforePath = lstatSync(target, { bigint: true });
  if (!beforePath.isFile() || beforePath.isSymbolicLink()
    || beforePath.size !== BigInt(expectedBytes)) fail("SOURCE_FILE_UNSAFE", target);
  if ((Number(beforePath.mode) & 0o777) !== 0o600) fail("SOURCE_FILE_MODE_INVALID", target);
  const descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || bytes.length !== expectedBytes) {
      fail("SOURCE_FILE_CHANGED", target);
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

export function verifyRebootSourceDirectory(sourceDirectory, options = {}) {
  const root = path.resolve(sourceDirectory);
  const rootStat = lstatSync(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail("SOURCE_DIRECTORY_UNSAFE");
  const manifestPath = path.join(root, "acquisition-manifest.json");
  const manifestSize = statSync(manifestPath).size;
  if (manifestSize <= 0 || manifestSize > 1024 * 1024) fail("SOURCE_MANIFEST_SIZE_INVALID");
  const manifestBytes = stableReadFile(manifestPath, manifestSize);
  let manifest;
  try { manifest = JSON.parse(manifestBytes.toString("utf8")); }
  catch { fail("SOURCE_MANIFEST_JSON_INVALID"); }
  const { manifestHash, ...body } = manifest;
  if (manifest.schema !== REBOOT_SOURCE_MANIFEST_SCHEMA
    || manifest.datasetId !== REBOOT_DATASET_ID
    || manifest.pinnedRevision !== REBOOT_REVISION
    || manifest.capturedAt !== REBOOT_FROZEN_AT
    || manifest.revisionStableDuringAcquisition !== true
    || manifest.selection?.dataEpisodeFiles !== 60
    || manifest.selection?.episodeMetadataFiles !== 2
    || manifest.selection?.videoOrMediaFetched !== false
    || manifest.rightsClaims?.resolution !== "UNRESOLVED_LICENSE_MISMATCH"
    || manifest.rightsClaims?.productionTrainingRightFinallyAdjudicated !== false
    || manifestHash !== digest(`${REBOOT_SOURCE_MANIFEST_SCHEMA}/manifest`, body)
    || !Array.isArray(manifest.remoteObjects) || manifest.remoteObjects.length !== 67) {
    fail("SOURCE_MANIFEST_INVALID");
  }
  if (options.requireCanonicalProfile !== false
    && manifestHash !== CANONICAL_SOURCE_MANIFEST_HASH) {
    fail("SOURCE_CANONICAL_PROFILE_MISMATCH");
  }
  repositoryProjection({ id: manifest.repositoryBefore.datasetId,
    sha: manifest.repositoryBefore.revision, private: manifest.repositoryBefore.private,
    gated: manifest.repositoryBefore.gated, disabled: manifest.repositoryBefore.disabled,
    lastModified: manifest.repositoryBefore.lastModified,
    cardData: { license: manifest.repositoryBefore.hfCardLicenseClaim } });
  if (canonicalizeStrict(manifest.repositoryBefore)
    !== canonicalizeStrict(manifest.repositoryAfter)) fail("SOURCE_REVISION_NOT_STABLE");
  const expectedPaths = ["acquisition-manifest.json"];
  let selectedBytes = 0;
  for (const entry of manifest.remoteObjects) {
    if (!exactObject(entry) || !SAFE_REMOTE_PATH.test(entry.path ?? "")
      || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes <= 0
      || !HASH.test(entry.sha256 ?? "") || !exactObject(entry.remoteBinding)) {
      fail("SOURCE_OBJECT_ENTRY_INVALID");
    }
    const bytes = stableReadFile(safeTarget(root, entry.path), entry.sizeBytes);
    if (sha256Bytes(bytes) !== entry.sha256) fail("SOURCE_OBJECT_HASH_MISMATCH", entry.path);
    if (entry.remoteBinding.kind === "LFS_SHA256"
      && entry.remoteBinding.value !== entry.sha256) fail("SOURCE_LFS_REPLAY_FAILED", entry.path);
    if (entry.remoteBinding.kind === "GIT_BLOB_SHA1"
      && gitBlobOid(bytes) !== entry.remoteBinding.value) fail("SOURCE_GIT_REPLAY_FAILED", entry.path);
    expectedPaths.push(entry.path);
    selectedBytes += entry.sizeBytes;
  }
  if (new Set(expectedPaths).size !== expectedPaths.length
    || canonicalizeStrict(recursiveFiles(root)) !== canonicalizeStrict(expectedPaths.sort())) {
    fail("SOURCE_FILE_SET_INVALID");
  }
  if (selectedBytes !== manifest.selection.selectedBytes
    || manifest.remoteObjects.some((entry) => entry.path.startsWith("videos/"))) {
    fail("SOURCE_SELECTION_REPLAY_FAILED");
  }
  const readme = readFileSync(path.join(root, "README.md"), "utf8");
  if (!/(^|\n)license:\s*apache-2\.0\s*($|\n)/iu.test(readme)) {
    fail("SOURCE_README_LICENSE_REPLAY_FAILED");
  }
  return {
    ok: true,
    manifest,
    manifestFileSha256: sha256Bytes(manifestBytes),
    sourceRoot: digest(`${REBOOT_SOURCE_MANIFEST_SCHEMA}/source-root`, {
      manifestHash, objects: manifest.remoteObjects.map(({ path: objectPath, sizeBytes, sha256 }) =>
        ({ path: objectPath, sizeBytes, sha256 })),
    }),
  };
}

const PYARROW_EXTRACTOR = String.raw`
import json, math, os, sys
import pyarrow.parquet as pq

root = os.path.abspath(sys.argv[1])
with open(os.path.join(root, "meta", "phase.json"), "r", encoding="utf-8") as handle:
    phase = json.load(handle)

if phase.get("num_episodes") != 60 or len(phase.get("episodes", [])) != 60:
    raise RuntimeError("PHASE_EPISODE_COUNT_INVALID")
if phase.get("fps") != 30 or len(phase.get("phase_names", [])) != 5:
    raise RuntimeError("PHASE_HEADER_INVALID")

by_index = {}
for episode in phase["episodes"]:
    index = int(episode["episode_index"])
    if index in by_index:
        raise RuntimeError("PHASE_EPISODE_DUPLICATE")
    by_index[index] = episode
if sorted(by_index) != list(range(60)):
    raise RuntimeError("PHASE_EPISODE_INDEX_SET_INVALID")

feature_names = [
    "mean_abs_command_state_error", "max_abs_command_state_error",
    "left_abs_command_state_error", "right_abs_command_state_error",
    "gripper_abs_command_state_error", "mean_abs_state_delta",
    "max_abs_state_delta", "mean_abs_action_delta",
    "bilateral_tracking_asymmetry",
]
expected_columns = ["action", "observation.state", "timestamp", "frame_index",
                    "episode_index", "index", "task_index"]
episodes = []
samples = []

def mean(values):
    return sum(values) / len(values)

for episode_index in range(60):
    relative = f"data/chunk-000/file-{episode_index:03d}.parquet"
    table = pq.read_table(os.path.join(root, *relative.split("/")))
    if table.column_names != expected_columns:
        raise RuntimeError("DATA_COLUMNS_INVALID:" + relative)
    rows = table.to_pylist()
    if len(rows) < 2:
        raise RuntimeError("DATA_ROWS_INVALID:" + relative)
    observed_episode_ids = {int(row["episode_index"]) for row in rows}
    if observed_episode_ids != {episode_index}:
        raise RuntimeError("DATA_EPISODE_BINDING_INVALID:" + relative)
    frames = [int(row["frame_index"]) for row in rows]
    if frames != list(range(len(rows))):
        raise RuntimeError("DATA_FRAME_SEQUENCE_INVALID:" + relative)
    phase_episode = by_index[episode_index]
    failure = phase_episode.get("failure", {})
    induced = failure.get("induced_at_frame")
    recovery = failure.get("recovery_started_at_frame")
    declared_duration = phase_episode.get("duration_frames")
    label_window_valid = (isinstance(induced, int) and isinstance(recovery, int)
                          and isinstance(declared_duration, int)
                          and 0 <= induced < recovery <= declared_duration
                          and recovery <= frames[-1] + 1)
    origin = failure.get("originating_phase")
    origin_valid = isinstance(origin, int) and 1 <= origin <= 5
    boundaries = phase_episode.get("phase_boundaries", {})
    boundary_values = [boundaries.get(f"tau_{i}") for i in range(6)]
    phase_boundaries_valid = (all(isinstance(value, int) for value in boundary_values)
                              and all(boundary_values[i] < boundary_values[i + 1]
                                      for i in range(len(boundary_values) - 1))
                              and boundary_values[0] == 0
                              and boundary_values[-1] == declared_duration)
    sampled_features = []
    for offset in range(1, len(rows), 5):
        row = rows[offset]
        previous = rows[offset - 1]
        action = [float(value) for value in row["action"]]
        state = [float(value) for value in row["observation.state"]]
        previous_action = [float(value) for value in previous["action"]]
        previous_state = [float(value) for value in previous["observation.state"]]
        if not (len(action) == len(state) == len(previous_action) == len(previous_state) == 14):
            raise RuntimeError("ACTION_STATE_WIDTH_INVALID:" + relative)
        error = [abs(action[i] - state[i]) for i in range(14)]
        state_delta = [abs(state[i] - previous_state[i]) for i in range(14)]
        action_delta = [abs(action[i] - previous_action[i]) for i in range(14)]
        left = mean(error[:7])
        right = mean(error[7:])
        features = [mean(error), max(error), left, right, mean([error[6], error[13]]),
                    mean(state_delta), max(state_delta), mean(action_delta), abs(left - right)]
        if not all(math.isfinite(value) for value in features):
            raise RuntimeError("FEATURE_NON_FINITE:" + relative)
        sampled_features.append(features)
        if label_window_valid:
            frame = frames[offset]
            samples.append({"episodeIndex": episode_index, "frameIndex": frame,
                            "features": features,
                            "label": 1 if induced <= frame < recovery else 0})
    means = [mean([row[index] for row in sampled_features]) for index in range(len(feature_names))]
    maxima = [max(row[index] for row in sampled_features) for index in range(len(feature_names))]
    episodes.append({
        "episodeIndex": episode_index,
        "dataPath": relative,
        "frameCount": len(rows),
        "minimumFrameIndex": frames[0],
        "maximumFrameIndex": frames[-1],
        "maximumTimestampSeconds": float(rows[-1]["timestamp"]),
        "taskIndex": int(rows[0]["task_index"]),
        "declaredDurationFrames": declared_duration,
        "phaseBoundaryFrames": boundary_values,
        "phaseBoundariesValid": phase_boundaries_valid,
        "failureOriginatingPhaseSourceValue": origin,
        "failureOriginatingPhaseOneBasedValid": origin_valid,
        "failureMode": str(failure.get("failure_mode", "UNKNOWN")),
        "failureInducedFrame": induced,
        "recoveryStartedFrame": recovery,
        "labelWindowValid": label_window_valid,
        "operatorGroupSourceValue": str(phase_episode.get("operator_id", "")),
        "collectionSessionGroupSourceValue": str(phase_episode.get("collection_session", "")),
        "sampledFrameCount": len(sampled_features),
        "featureMean": means,
        "featureMaximum": maxima,
    })

print(json.dumps({
    "extractor": {"engine": "pyarrow", "featureStrideFrames": 5,
                  "featureNames": feature_names},
    "declared": {"taskId": phase.get("task_id"), "fps": phase.get("fps"),
                 "numEpisodes": phase.get("num_episodes"),
                 "phaseNames": phase.get("phase_names")},
    "dataSchema": expected_columns,
    "episodes": episodes,
    "samples": samples,
}, separators=(",", ":"), allow_nan=False))
`;

export function extractRebootFeatures(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const result = spawnSync(python, ["-c", PYARROW_EXTRACTOR, path.resolve(sourceDirectory)], {
    encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) fail("PYARROW_EXTRACTION_FAILED",
    String(result.stderr || result.error?.message || result.status).trim().slice(0, 1000));
  try { return JSON.parse(result.stdout); }
  catch { fail("PYARROW_EXTRACTION_JSON_INVALID"); }
}

function validateExtracted(extracted) {
  if (!exactObject(extracted) || extracted.extractor?.featureStrideFrames !== FEATURE_STRIDE_FRAMES
    || canonicalizeStrict(extracted.extractor?.featureNames) !== canonicalizeStrict(FEATURE_NAMES)
    || extracted.declared?.numEpisodes !== 60 || extracted.declared?.fps !== 30
    || !Array.isArray(extracted.declared?.phaseNames)
    || extracted.declared.phaseNames.length !== 5
    || !Array.isArray(extracted.episodes) || extracted.episodes.length !== 60
    || !Array.isArray(extracted.samples) || extracted.samples.length < 1) {
    fail("EXTRACTED_STRUCTURE_INVALID");
  }
  const episodeIndices = extracted.episodes.map((episode) => episode.episodeIndex).sort((a, b) => a - b);
  if (canonicalizeStrict(episodeIndices)
    !== canonicalizeStrict(Array.from({ length: 60 }, (_, index) => index))) {
    fail("EXTRACTED_EPISODE_SET_INVALID");
  }
  if (extracted.episodes.some((episode) =>
    typeof episode.operatorGroupSourceValue !== "string"
    || episode.operatorGroupSourceValue.length < 1 || episode.operatorGroupSourceValue.length > 128
    || typeof episode.collectionSessionGroupSourceValue !== "string"
    || episode.collectionSessionGroupSourceValue.length < 1
    || episode.collectionSessionGroupSourceValue.length > 128)) {
    fail("EXTRACTED_CORRELATION_GROUP_INVALID");
  }
  for (const sample of extracted.samples) {
    if (!Number.isInteger(sample.episodeIndex) || !Number.isInteger(sample.frameIndex)
      || ![0, 1].includes(sample.label) || !Array.isArray(sample.features)
      || sample.features.length !== FEATURE_NAMES.length
      || sample.features.some((value) => !Number.isFinite(value))) fail("EXTRACTED_SAMPLE_INVALID");
  }
}
function episodeHash(taskHash, index) {
  return digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/episode`, {
    revision: REBOOT_REVISION, taskHash, sourceEpisodeIndex: index,
  });
}
function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-Math.min(value, 40)));
  const exponential = Math.exp(Math.max(value, -40));
  return exponential / (1 + exponential);
}
function fitLogistic(trainRows) {
  const width = FEATURE_NAMES.length;
  const means = Array.from({ length: width }, (_, index) => mean(trainRows.map((row) => row.features[index])));
  const deviations = Array.from({ length: width }, (_, index) => {
    const variance = mean(trainRows.map((row) => (row.features[index] - means[index]) ** 2));
    return variance > 1e-18 ? Math.sqrt(variance) : 1;
  });
  const prevalence = mean(trainRows.map((row) => row.label));
  let intercept = Math.log(Math.max(1e-6, prevalence) / Math.max(1e-6, 1 - prevalence));
  const weights = Array(width).fill(0);
  const iterations = 500;
  const l2 = 0.002;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let interceptGradient = 0;
    const gradients = Array(width).fill(0);
    for (const row of trainRows) {
      let score = intercept;
      for (let index = 0; index < width; index += 1) {
        score += weights[index] * ((row.features[index] - means[index]) / deviations[index]);
      }
      const error = sigmoid(score) - row.label;
      interceptGradient += error;
      for (let index = 0; index < width; index += 1) {
        gradients[index] += error * ((row.features[index] - means[index]) / deviations[index]);
      }
    }
    const learningRate = 0.22 / Math.sqrt(1 + iteration / 40);
    intercept -= learningRate * interceptGradient / trainRows.length;
    for (let index = 0; index < width; index += 1) {
      weights[index] -= learningRate * (gradients[index] / trainRows.length + l2 * weights[index]);
    }
  }
  return {
    algorithm: "DETERMINISTIC_L2_LOGISTIC_REGRESSION",
    iterations,
    learningRateSchedule: "0.22/sqrt(1+iteration/40)",
    l2,
    intercept: round(intercept),
    weights: weights.map((value) => round(value)),
    featureMeans: means.map((value) => round(value)),
    featureStandardDeviations: deviations.map((value) => round(value)),
  };
}
function predict(model, row) {
  let score = model.intercept;
  for (let index = 0; index < FEATURE_NAMES.length; index += 1) {
    score += model.weights[index]
      * ((row.features[index] - model.featureMeans[index])
        / model.featureStandardDeviations[index]);
  }
  return sigmoid(score);
}
function auroc(labels, scores) {
  const rows = labels.map((label, index) => ({ label, score: scores[index] }))
    .sort((left, right) => left.score - right.score);
  let positiveRanks = 0;
  let cursor = 0;
  while (cursor < rows.length) {
    let end = cursor + 1;
    while (end < rows.length && rows[end].score === rows[cursor].score) end += 1;
    const averageRank = (cursor + 1 + end) / 2;
    for (let index = cursor; index < end; index += 1) {
      if (rows[index].label === 1) positiveRanks += averageRank;
    }
    cursor = end;
  }
  const positives = labels.reduce((sum, label) => sum + label, 0);
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) fail("METRIC_CLASS_MISSING");
  return (positiveRanks - positives * (positives + 1) / 2) / (positives * negatives);
}
function averagePrecision(labels, scores) {
  const rows = labels.map((label, index) => ({ label, score: scores[index] }))
    .sort((left, right) => right.score - left.score);
  const positives = labels.reduce((sum, label) => sum + label, 0);
  if (positives === 0) fail("METRIC_POSITIVE_MISSING");
  // Treat equal scores as one threshold.  Ordering tied rows individually
  // makes a constant baseline's AP depend on input order instead of equal its
  // prevalence, which is not a valid ranking comparison.
  let truePositives = 0;
  let consumed = 0;
  let accumulated = 0;
  while (consumed < rows.length) {
    let end = consumed + 1;
    while (end < rows.length && rows[end].score === rows[consumed].score) end += 1;
    let groupPositives = 0;
    for (let index = consumed; index < end; index += 1) groupPositives += rows[index].label;
    truePositives += groupPositives;
    accumulated += (groupPositives / positives) * (truePositives / end);
    consumed = end;
  }
  return accumulated;
}
function metrics(rows, scores) {
  const labels = rows.map((row) => row.label);
  const epsilon = 1e-12;
  let truePositive = 0; let falsePositive = 0; let trueNegative = 0; let falseNegative = 0;
  labels.forEach((label, index) => {
    const predicted = scores[index] >= 0.5 ? 1 : 0;
    if (label === 1 && predicted === 1) truePositive += 1;
    if (label === 0 && predicted === 1) falsePositive += 1;
    if (label === 0 && predicted === 0) trueNegative += 1;
    if (label === 1 && predicted === 0) falseNegative += 1;
  });
  return {
    rows: rows.length,
    positives: labels.reduce((sum, label) => sum + label, 0),
    prevalence: round(mean(labels)),
    auroc: round(auroc(labels, scores)),
    averagePrecision: round(averagePrecision(labels, scores)),
    brier: round(mean(labels.map((label, index) => (scores[index] - label) ** 2))),
    logLoss: round(mean(labels.map((label, index) => -(label * Math.log(Math.max(epsilon, scores[index]))
      + (1 - label) * Math.log(Math.max(epsilon, 1 - scores[index])))))),
    balancedAccuracy: round(((truePositive / (truePositive + falseNegative))
      + (trueNegative / (trueNegative + falsePositive))) / 2),
  };
}

export function deriveRebootCorrelationGroups(extracted) {
  validateExtracted(extracted);
  const parents = new Map();
  const find = (node) => {
    let current = node;
    while (parents.get(current) !== current) current = parents.get(current);
    let cursor = node;
    while (parents.get(cursor) !== cursor) {
      const next = parents.get(cursor);
      parents.set(cursor, current);
      cursor = next;
    }
    return current;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents.set(rightRoot, leftRoot);
  };
  const provisional = extracted.episodes.map((episode) => {
    const operatorGroupHash = digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/operator-group/v1`,
      episode.operatorGroupSourceValue);
    const sessionGroupHash = digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/session-group/v1`,
      episode.collectionSessionGroupSourceValue);
    const operatorNode = `operator:${operatorGroupHash}`;
    const sessionNode = `session:${sessionGroupHash}`;
    if (!parents.has(operatorNode)) parents.set(operatorNode, operatorNode);
    if (!parents.has(sessionNode)) parents.set(sessionNode, sessionNode);
    union(operatorNode, sessionNode);
    return { episodeIndex: episode.episodeIndex, operatorGroupHash, sessionGroupHash,
      operatorNode, sessionNode };
  });
  const membersByRoot = new Map();
  for (const node of parents.keys()) {
    const root = find(node);
    if (!membersByRoot.has(root)) membersByRoot.set(root, []);
    membersByRoot.get(root).push(node.slice(node.indexOf(":") + 1));
  }
  const componentHashByRoot = new Map([...membersByRoot].map(([root, members]) =>
    [root, digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/correlation-component/v1`, members.sort())]));
  const byIndex = Object.fromEntries(provisional.map((row) => [row.episodeIndex, {
    operatorGroupHash: row.operatorGroupHash,
    sessionGroupHash: row.sessionGroupHash,
    componentHash: componentHashByRoot.get(find(row.operatorNode)),
  }]));
  const operatorGroups = [...new Set(provisional.map((row) => row.operatorGroupHash))].sort();
  const sessionGroups = [...new Set(provisional.map((row) => row.sessionGroupHash))].sort();
  const components = [...new Set(Object.values(byIndex).map((row) => row.componentHash))].sort();
  return {
    byIndex,
    summary: {
      operatorGroupCount: operatorGroups.length,
      sessionGroupCount: sessionGroups.length,
      connectedComponentCount: components.length,
      operatorGroupRoot: digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/operator-group-root/v1`, operatorGroups),
      sessionGroupRoot: digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/session-group-root/v1`, sessionGroups),
      connectedComponentRoot: digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/component-root/v1`, components),
      rawGroupValuesProjected: false,
    },
  };
}

function overlapCount(left, right) {
  const rightSet = new Set(right);
  return new Set(left.filter((value) => rightSet.has(value))).size;
}

export function trainRebootRecoveryPrioritizer(extracted, episodeIdsByIndex) {
  validateExtracted(extracted);
  const correlation = deriveRebootCorrelationGroups(extracted);
  const eligible = extracted.episodes.filter((episode) => episode.labelWindowValid === true)
    .map((episode) => episode.episodeIndex);
  if (eligible.length < PROMOTION_GATE.minimumEligibleEpisodes) fail("ELIGIBLE_EPISODES_TOO_FEW");
  const holdoutCount = Math.max(PROMOTION_GATE.minimumHoldoutEpisodes, Math.ceil(eligible.length * 0.2));
  const rankedEpisodes = eligible.map((index) => ({ index, episodeIdHash: episodeIdsByIndex[index],
    splitHash: digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/episode-split/v1`, episodeIdsByIndex[index]) }))
    .sort((left, right) => left.splitHash.localeCompare(right.splitHash));
  const holdoutSet = new Set(rankedEpisodes.slice(0, holdoutCount).map((row) => row.index));
  const trainSet = new Set(rankedEpisodes.slice(holdoutCount).map((row) => row.index));
  const rows = extracted.samples.map((sample) => ({ ...sample,
    features: sample.features.map((value) => Number(value)) }));
  const trainRows = rows.filter((row) => trainSet.has(row.episodeIndex));
  const holdoutRows = rows.filter((row) => holdoutSet.has(row.episodeIndex));
  if (trainRows.length < 1 || holdoutRows.length < 1) fail("SPLIT_ROWS_MISSING");
  const trainPrevalence = mean(trainRows.map((row) => row.label));
  const baselineScores = holdoutRows.map(() => trainPrevalence);
  const model = fitLogistic(trainRows);
  const candidateScores = holdoutRows.map((row) => predict(model, row));
  const baseline = metrics(holdoutRows, baselineScores);
  const candidate = metrics(holdoutRows, candidateScores);
  const trainEpisodeHashes = [...trainSet].map((index) => episodeIdsByIndex[index]).sort();
  const holdoutEpisodeHashes = [...holdoutSet].map((index) => episodeIdsByIndex[index]).sort();
  const overlap = trainEpisodeHashes.filter((hash) => holdoutEpisodeHashes.includes(hash));
  if (overlap.length !== 0) fail("EPISODE_SPLIT_LEAKAGE");
  const trainGroups = [...trainSet].map((index) => correlation.byIndex[index]);
  const holdoutGroups = [...holdoutSet].map((index) => correlation.byIndex[index]);
  const exploratoryOverlap = {
    episodeIdOverlapCount: 0,
    operatorGroupOverlapCount: overlapCount(trainGroups.map((row) => row.operatorGroupHash),
      holdoutGroups.map((row) => row.operatorGroupHash)),
    sessionGroupOverlapCount: overlapCount(trainGroups.map((row) => row.sessionGroupHash),
      holdoutGroups.map((row) => row.sessionGroupHash)),
    connectedComponentOverlapCount: overlapCount(trainGroups.map((row) => row.componentHash),
      holdoutGroups.map((row) => row.componentHash)),
  };
  const formalSplitFeasible = correlation.summary.connectedComponentCount >= 2;
  // The pinned source has one connected component across operator and session.
  // No non-empty train/holdout split can therefore satisfy both boundaries.
  if (formalSplitFeasible) fail("UNEXPECTED_CORRELATION_PROFILE_REQUIRES_NEW_PREREGISTRATION");
  const checks = {
    operatorSessionDisjointSplitFeasible: false,
    eligibleEpisodes: eligible.length >= PROMOTION_GATE.minimumEligibleEpisodes,
    holdoutEpisodes: false,
    auprcLift: false,
    auroc: false,
    brierImprovement: false,
    logLossImprovement: false,
  };
  return {
    purpose: "RECOVERY_WINDOW_AND_FOLLOWUP_ACQUISITION_RANKING_ONLY",
    target: "source-annotated frames from failure.induced_at_frame inclusive to recovery_started_at_frame exclusive",
    labelSource: "PINNED_META_PHASE_JSON_ONLY",
    excludedFromFeatures: ["episode_index", "frame_index", "timestamp", "task_index",
      "phase_boundaries", "failure labels", "operator_id", "collection_session",
      "language_description", "task_description", "images", "video"],
    featureNames: [...FEATURE_NAMES],
    featureStrideFrames: FEATURE_STRIDE_FRAMES,
    correlationGroups: correlation.summary,
    split: {
      unit: "OPERATOR_SESSION_CONNECTED_COMPONENT",
      algorithm: "connected components of hashed operator_id and collection_session bipartite graph",
      eligibleEpisodes: eligible.length,
      excludedEpisodesWithInvalidFailureWindow: 60 - eligible.length,
      connectedComponents: correlation.summary.connectedComponentCount,
      feasible: false,
      trainEpisodes: 0,
      holdoutEpisodes: 0,
      trainRows: 0,
      holdoutRows: 0,
      operatorGroupOverlapCount: 0,
      sessionGroupOverlapCount: 0,
      connectedComponentOverlapCount: 0,
      abstentionReason: "ALL_EPISODES_COLLAPSE_TO_ONE_OPERATOR_SESSION_CONNECTED_COMPONENT",
    },
    baseline: { kind: "NOT_EVALUATED_GROUP_DISJOINT_SPLIT_IMPOSSIBLE", metrics: null },
    candidate: { model: null, metrics: null },
    exploratoryEpisodeOnlyDiagnostic: {
      status: "CORRELATED_NOT_PROMOTION_EVIDENCE",
      warning: "operator and collection-session groups overlap across the episode-only split",
      split: {
        unit: "EPISODE_ONLY",
        algorithm: "lowest sha256(domain,episodeIdHash) assigned to deterministic 20% holdout",
        trainEpisodes: trainSet.size,
        holdoutEpisodes: holdoutSet.size,
        trainRows: trainRows.length,
        holdoutRows: holdoutRows.length,
        trainEpisodeRoot: digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/train-episodes`, trainEpisodeHashes),
        holdoutEpisodeRoot: digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/holdout-episodes`, holdoutEpisodeHashes),
        ...exploratoryOverlap,
      },
      baseline: { kind: "TRAIN_PREVALENCE_CONSTANT", probability: round(trainPrevalence), metrics: baseline },
      candidate: { model, metrics: candidate },
      promotionEligible: false,
    },
    promotionGate: { ...PROMOTION_GATE,
      requiredSplitUnit: "OPERATOR_SESSION_CONNECTED_COMPONENT", checks, passed: false },
    decision: "KEEP_BASELINE_GROUP_DISJOINT_SPLIT_IMPOSSIBLE",
    promoted: false,
    automaticTraining: false,
    autoDispatch: false,
  };
}

function assertNoBannedProjectionKeys(value, currentPath = "projection") {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoBannedProjectionKeys(item, `${currentPath}[${index}]`));
    return;
  }
  if (!exactObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (BANNED_PROJECTION_KEYS.test(key)) fail("PROJECTION_PRIVACY_KEY", `${currentPath}.${key}`);
    assertNoBannedProjectionKeys(child, `${currentPath}.${key}`);
  }
}

function validateSafeEpisodeProjections(projections, phaseNames = null) {
  if (!Array.isArray(projections) || projections.length !== 60) {
    fail("PROJECTION_EPISODE_COUNT_INVALID");
  }
  assertNoBannedProjectionKeys(projections);
  const ordinals = [];
  for (const row of projections) {
    if (!exactKeys(row, ["episodeIdHash", "taskIdHash", "sourceEpisodeOrdinal", "dataObject",
      "frameSummary", "phaseSummary", "recoveryAnnotationSummary", "actionStateSummary"])
      || !HASH.test(row.episodeIdHash ?? "") || !HASH.test(row.taskIdHash ?? "")
      || !Number.isInteger(row.sourceEpisodeOrdinal)
      || row.sourceEpisodeOrdinal < 0 || row.sourceEpisodeOrdinal >= 60) {
      fail("PROJECTION_EPISODE_SHAPE_INVALID");
    }
    ordinals.push(row.sourceEpisodeOrdinal);
    const expectedPath = `data/chunk-000/file-${String(row.sourceEpisodeOrdinal).padStart(3, "0")}.parquet`;
    if (!exactKeys(row.dataObject, ["path", "sizeBytes", "sha256"])
      || row.dataObject.path !== expectedPath || !Number.isSafeInteger(row.dataObject.sizeBytes)
      || row.dataObject.sizeBytes <= 0 || !HASH.test(row.dataObject.sha256 ?? "")) {
      fail("PROJECTION_DATA_BINDING_INVALID");
    }
    const frame = row.frameSummary;
    if (!exactKeys(frame, ["observedFrames", "declaredDurationFrames", "minimumFrameIndex",
      "maximumFrameIndex", "maximumTimestampSeconds", "sampledFrames",
      "durationConventionMatches"])
      || !Number.isInteger(frame.observedFrames) || frame.observedFrames < 2
      || !Number.isInteger(frame.declaredDurationFrames) || frame.declaredDurationFrames < 1
      || frame.minimumFrameIndex !== 0 || !Number.isInteger(frame.maximumFrameIndex)
      || !Number.isFinite(frame.maximumTimestampSeconds) || frame.maximumTimestampSeconds < 0
      || !Number.isInteger(frame.sampledFrames) || frame.sampledFrames < 1
      || typeof frame.durationConventionMatches !== "boolean") fail("PROJECTION_FRAME_INVALID");
    const phase = row.phaseSummary;
    if (!exactKeys(phase, ["names", "boundaryFractions", "boundariesValid"])
      || !Array.isArray(phase.names) || phase.names.length !== 5
      || (phaseNames !== null && canonicalizeStrict(phase.names) !== canonicalizeStrict(phaseNames))
      || !Array.isArray(phase.boundaryFractions) || phase.boundaryFractions.length !== 6
      || phase.boundaryFractions.some((value) => !Number.isFinite(value) || value < 0 || value > 1)
      || phase.boundaryFractions[0] !== 0 || phase.boundaryFractions[5] !== 1
      || typeof phase.boundariesValid !== "boolean") fail("PROJECTION_PHASE_INVALID");
    const recovery = row.recoveryAnnotationSummary;
    if (!exactKeys(recovery, ["failureModeCode", "originatingPhaseSourceValue",
      "originatingPhaseOneBasedValid", "failureInducedFraction", "recoveryStartedFraction",
      "failureWindowValid"])
      || !FAILURE_MODE_CODE.test(recovery.failureModeCode ?? "")
      || !Number.isInteger(recovery.originatingPhaseSourceValue)
      || typeof recovery.originatingPhaseOneBasedValid !== "boolean"
      || typeof recovery.failureWindowValid !== "boolean"
      || ![recovery.failureInducedFraction, recovery.recoveryStartedFraction].every((value) =>
        value === null || (Number.isFinite(value) && value >= 0 && value <= 1))) {
      fail("PROJECTION_RECOVERY_ANNOTATION_INVALID");
    }
    const summary = row.actionStateSummary;
    if (!exactKeys(summary, ["featureNames", "means", "maxima"])
      || canonicalizeStrict(summary.featureNames) !== canonicalizeStrict(FEATURE_NAMES)
      || !Array.isArray(summary.means) || summary.means.length !== FEATURE_NAMES.length
      || !Array.isArray(summary.maxima) || summary.maxima.length !== FEATURE_NAMES.length
      || [...summary.means, ...summary.maxima].some((value) => !Number.isFinite(value) || value < 0)) {
      fail("PROJECTION_ACTION_STATE_SUMMARY_INVALID");
    }
  }
  ordinals.sort((left, right) => left - right);
  if (canonicalizeStrict(ordinals)
    !== canonicalizeStrict(Array.from({ length: 60 }, (_, index) => index))) {
    fail("PROJECTION_ORDINAL_SET_INVALID");
  }
}

export function buildRebootRecoveryPilotFromExtracted(sourceVerification, extracted) {
  if (sourceVerification?.ok !== true || !exactObject(sourceVerification.manifest)) {
    fail("SOURCE_VERIFICATION_REQUIRED");
  }
  validateExtracted(extracted);
  const manifest = sourceVerification.manifest;
  const taskHash = digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/task`, {
    datasetId: REBOOT_DATASET_ID, revision: REBOOT_REVISION,
    taskId: extracted.declared.taskId,
  });
  const episodeIdsByIndex = Object.fromEntries(extracted.episodes.map((episode) =>
    [episode.episodeIndex, episodeHash(taskHash, episode.episodeIndex)]));
  const objectByPath = new Map(manifest.remoteObjects.map((entry) => [entry.path, entry]));
  const projections = extracted.episodes.map((episode) => {
    const dataObject = objectByPath.get(episode.dataPath);
    if (!dataObject) fail("EPISODE_SOURCE_BINDING_MISSING", episode.dataPath);
    const durationDenominator = Math.max(1, episode.declaredDurationFrames);
    return {
      episodeIdHash: episodeIdsByIndex[episode.episodeIndex],
      taskIdHash: taskHash,
      sourceEpisodeOrdinal: episode.episodeIndex,
      dataObject: { path: episode.dataPath, sizeBytes: dataObject.sizeBytes,
        sha256: dataObject.sha256 },
      frameSummary: {
        observedFrames: episode.frameCount,
        declaredDurationFrames: episode.declaredDurationFrames,
        minimumFrameIndex: episode.minimumFrameIndex,
        maximumFrameIndex: episode.maximumFrameIndex,
        maximumTimestampSeconds: round(episode.maximumTimestampSeconds),
        sampledFrames: episode.sampledFrameCount,
        durationConventionMatches: episode.frameCount === episode.declaredDurationFrames + 1
          && episode.maximumFrameIndex === episode.declaredDurationFrames,
      },
      phaseSummary: {
        names: [...extracted.declared.phaseNames],
        boundaryFractions: episode.phaseBoundaryFrames.map((value) => round(value / durationDenominator)),
        boundariesValid: episode.phaseBoundariesValid,
      },
      recoveryAnnotationSummary: {
        failureModeCode: episode.failureMode,
        originatingPhaseSourceValue: episode.failureOriginatingPhaseSourceValue,
        originatingPhaseOneBasedValid: episode.failureOriginatingPhaseOneBasedValid,
        failureInducedFraction: Number.isInteger(episode.failureInducedFrame)
          ? round(episode.failureInducedFrame / durationDenominator) : null,
        recoveryStartedFraction: Number.isInteger(episode.recoveryStartedFrame)
          ? round(episode.recoveryStartedFrame / durationDenominator) : null,
        failureWindowValid: episode.labelWindowValid,
      },
      actionStateSummary: {
        featureNames: [...FEATURE_NAMES],
        means: episode.featureMean.map((value) => round(value)),
        maxima: episode.featureMaximum.map((value) => round(value)),
      },
    };
  });
  validateSafeEpisodeProjections(projections, extracted.declared.phaseNames);
  const training = trainRebootRecoveryPrioritizer(extracted, episodeIdsByIndex);
  const quality = {
    projectedEpisodes: projections.length,
    realRobotActionStateParquetFilesReplayed: manifest.selection.dataEpisodeFiles,
    framesObserved: projections.reduce((sum, row) => sum + row.frameSummary.observedFrames, 0),
    validFailureWindows: projections.filter((row) => row.recoveryAnnotationSummary.failureWindowValid).length,
    invalidFailureWindows: projections.filter((row) => !row.recoveryAnnotationSummary.failureWindowValid).length,
    sourceOriginPhaseValuesOutsideOneBasedFive: projections.filter((row) =>
      !row.recoveryAnnotationSummary.originatingPhaseOneBasedValid).length,
    invalidPhaseBoundarySequences: projections.filter((row) =>
      !row.phaseSummary.boundariesValid).length,
    frameDurationConventionMismatches: projections.filter((row) =>
      !row.frameSummary.durationConventionMatches).length,
    phaseIndexingConvention: "SOURCE_APPEARS_ONE_BASED; NOT ASSERTED DUE OUTLIERS",
    independentOutcomeAuditPresent: false,
    forceTorquePresent: false,
    videoObserved: false,
    singleTaskOnly: true,
    crossTaskGeneralizationEstablished: false,
  };
  const body = {
    schema: REBOOT_RECOVERY_PILOT_SCHEMA,
    generatedAt: REBOOT_FROZEN_AT,
    stage: "FIRST_GOVERNED_REALITY_EPISODE_PRE_ACTION",
    source: {
      datasetId: REBOOT_DATASET_ID,
      revision: REBOOT_REVISION,
      sourceRoot: sourceVerification.sourceRoot,
      manifestHash: manifest.manifestHash,
      manifestFileSha256: sourceVerification.manifestFileSha256,
      selectedObjects: manifest.remoteObjects.map(({ path: objectPath, sizeBytes, sha256 }) =>
        ({ path: objectPath, sizeBytes, sha256 })),
      exactSourceReplayRequired: true,
    },
    rights: {
      hfDatasetCardClaim: "Apache-2.0",
      officialProjectPageClaim: "CC-BY-4.0",
      officialProjectPage: PROJECT_URL,
      mismatchResolution: "UNRESOLVED",
      productionTrainingRightFinallyAdjudicated: false,
      pilotUse: "LOCAL_RESEARCH_EVALUATION_ONLY",
    },
    dataset: {
      robotType: "bi_widowxai_follower_robot",
      fps: extracted.declared.fps,
      taskIdHash: taskHash,
      phaseNames: [...extracted.declared.phaseNames],
      actionDimensions: 14,
      stateDimensions: 14,
      actionStateColumns: ["action", "observation.state", "timestamp", "frame_index",
        "episode_index", "index", "task_index"],
      mediaFetched: false,
    },
    quality,
    episodeProjection: {
      privacyBoundary: "NO_OPERATOR_SESSION_FREE_TEXT_TASK_TEXT_OR_MEDIA",
      projectionHash: digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/episode-projection`, projections),
      episodes: projections,
    },
    training,
    controlPlaneProjection: {
      status: "QUARANTINED_REVIEW_ONLY",
      lane: "RECOVERY_FOLLOWUP_ACQUISITION",
      suggestedUse: training.decision,
      dispatched: false,
      executable: false,
      actionReady: false,
      authorityDelta: 0,
      delegationRadiusDelta: 0,
      evidenceRadiusBehindCapability: false,
    },
    authority: {
      TRAIN_AUTOMATICALLY: false,
      ACT: false,
      UNDERWRITE: false,
      GUARANTEE: false,
      PAY: false,
      SET_CEU: false,
      ESTABLISH_OUTCOME_TRUTH: false,
      authorityDelta: 0,
    },
  };
  return { ...body, artifactHash: digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/artifact`, body) };
}

export function buildRebootRecoveryPilotFromSource(sourceDirectory, options = {}) {
  const sourceVerification = verifyRebootSourceDirectory(sourceDirectory);
  const extracted = extractRebootFeatures(sourceDirectory, options);
  return buildRebootRecoveryPilotFromExtracted(sourceVerification, extracted);
}

export function verifyRebootRecoveryPilotArtifact(artifact) {
  try {
    if (!exactObject(artifact) || artifact.schema !== REBOOT_RECOVERY_PILOT_SCHEMA
      || artifact.generatedAt !== REBOOT_FROZEN_AT || !HASH.test(artifact.artifactHash ?? "")) {
      return { ok: false, verificationLevel: "INVALID" };
    }
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/artifact`, body)) {
      return { ok: false, verificationLevel: "INVALID" };
    }
    validateSafeEpisodeProjections(artifact.episodeProjection?.episodes,
      artifact.dataset?.phaseNames);
    const authorityZero = artifact.authority?.TRAIN_AUTOMATICALLY === false
      && artifact.authority?.ACT === false && artifact.authority?.UNDERWRITE === false
      && artifact.authority?.GUARANTEE === false && artifact.authority?.PAY === false
      && artifact.authority?.SET_CEU === false
      && artifact.authority?.ESTABLISH_OUTCOME_TRUTH === false
      && artifact.authority?.authorityDelta === 0
      && artifact.controlPlaneProjection?.authorityDelta === 0
      && artifact.controlPlaneProjection?.delegationRadiusDelta === 0
      && artifact.controlPlaneProjection?.dispatched === false
      && artifact.controlPlaneProjection?.executable === false
      && artifact.controlPlaneProjection?.actionReady === false;
    const split = artifact.training?.split;
    const groups = artifact.training?.correlationGroups;
    const exploratory = artifact.training?.exploratoryEpisodeOnlyDiagnostic;
    const noLeakage = canonicalizeStrict(artifact.training?.featureNames) === canonicalizeStrict(FEATURE_NAMES)
      && split?.unit === "OPERATOR_SESSION_CONNECTED_COMPONENT"
      && split?.feasible === false && split?.connectedComponents === 1
      && split?.trainEpisodes === 0 && split?.holdoutEpisodes === 0
      && split?.operatorGroupOverlapCount === 0 && split?.sessionGroupOverlapCount === 0
      && split?.connectedComponentOverlapCount === 0
      && groups?.operatorGroupCount === 2 && groups?.sessionGroupCount === 2
      && groups?.connectedComponentCount === 1
      && HASH.test(groups?.operatorGroupRoot ?? "") && HASH.test(groups?.sessionGroupRoot ?? "")
      && HASH.test(groups?.connectedComponentRoot ?? "")
      && groups?.rawGroupValuesProjected === false
      && exploratory?.status === "CORRELATED_NOT_PROMOTION_EVIDENCE"
      && exploratory?.promotionEligible === false
      && exploratory?.split?.episodeIdOverlapCount === 0
      && exploratory?.split?.operatorGroupOverlapCount === 1
      && exploratory?.split?.sessionGroupOverlapCount === 1
      && exploratory?.split?.connectedComponentOverlapCount === 1
      && artifact.training?.excludedFromFeatures?.includes("failure labels")
      && artifact.training?.purpose === "RECOVERY_WINDOW_AND_FOLLOWUP_ACQUISITION_RANKING_ONLY"
      && artifact.training?.automaticTraining === false
      && artifact.training?.autoDispatch === false
      && artifact.dataset?.mediaFetched === false;
    const rightsBounded = artifact.rights?.mismatchResolution === "UNRESOLVED"
      && artifact.rights?.productionTrainingRightFinallyAdjudicated === false;
    const declaredGate = artifact.training?.promotionGate;
    const recalculatedChecks = {
      operatorSessionDisjointSplitFeasible: false,
      eligibleEpisodes: split?.eligibleEpisodes >= PROMOTION_GATE.minimumEligibleEpisodes,
      holdoutEpisodes: false,
      auprcLift: false,
      auroc: false,
      brierImprovement: false,
      logLossImprovement: false,
    };
    const gateFixed = declaredGate?.minimumEligibleEpisodes === PROMOTION_GATE.minimumEligibleEpisodes
      && declaredGate?.minimumHoldoutEpisodes === PROMOTION_GATE.minimumHoldoutEpisodes
      && declaredGate?.minimumAuprcLift === PROMOTION_GATE.minimumAuprcLift
      && declaredGate?.minimumAuroc === PROMOTION_GATE.minimumAuroc
      && declaredGate?.minimumBrierImprovement === PROMOTION_GATE.minimumBrierImprovement
      && declaredGate?.minimumLogLossImprovement === PROMOTION_GATE.minimumLogLossImprovement
      && declaredGate?.requiredSplitUnit === "OPERATOR_SESSION_CONNECTED_COMPONENT"
      && declaredGate?.passed === false
      && canonicalizeStrict(declaredGate?.checks) === canonicalizeStrict(recalculatedChecks);
    const decisionConsistent = artifact.training?.promoted === false
      && artifact.training?.decision === "KEEP_BASELINE_GROUP_DISJOINT_SPLIT_IMPOSSIBLE"
      && artifact.training?.baseline?.kind === "NOT_EVALUATED_GROUP_DISJOINT_SPLIT_IMPOSSIBLE"
      && artifact.training?.baseline?.metrics === null
      && artifact.training?.candidate?.model === null
      && artifact.training?.candidate?.metrics === null;
    const projectionHashValid = artifact.episodeProjection?.projectionHash
      === digest(`${REBOOT_RECOVERY_PILOT_SCHEMA}/episode-projection`,
        artifact.episodeProjection?.episodes);
    const ok = authorityZero && noLeakage && rightsBounded && gateFixed && decisionConsistent
      && projectionHashValid && artifact.quality?.videoObserved === false
      && artifact.quality?.independentOutcomeAuditPresent === false;
    return {
      ok,
      verificationLevel: ok ? "FIXED_PROJECTION_NO_SOURCE_AUTHENTICATION" : "INVALID",
      authorityEstablished: false,
      sourceArtifactsReverified: false,
      trainingUse: "RECOVERY_FOLLOWUP_ACQUISITION_RANKING_ONLY",
    };
  } catch {
    return { ok: false, verificationLevel: "INVALID" };
  }
}

export function verifyRebootRecoveryPilotArtifactWithSource(artifact, sourceDirectory, options = {}) {
  const standalone = verifyRebootRecoveryPilotArtifact(artifact);
  if (!standalone.ok) return { ...standalone, sourceArtifactsReverified: false };
  try {
    const rebuilt = buildRebootRecoveryPilotFromSource(sourceDirectory, options);
    const equal = canonicalizeStrict(rebuilt) === canonicalizeStrict(artifact);
    return {
      ok: equal,
      verificationLevel: equal ? "FULL_SOURCE_REPLAY" : "SOURCE_REPLAY_MISMATCH",
      sourceArtifactsReverified: true,
      candidateArtifactExactlyRebuilt: equal,
      authorityEstablished: false,
      outcomeTruthEstablished: false,
      causalEffectEstablished: false,
      trainingUse: "RECOVERY_FOLLOWUP_ACQUISITION_RANKING_ONLY",
    };
  } catch (error) {
    return { ok: false, verificationLevel: "SOURCE_REPLAY_FAILED",
      sourceArtifactsReverified: false,
      error: error instanceof Error ? error.message : String(error) };
  }
}

export function rebootRecoveryOpaqueReference(artifact) {
  const checked = verifyRebootRecoveryPilotArtifact(artifact);
  if (!checked.ok) fail("OPAQUE_REFERENCE_ARTIFACT_INVALID");
  return {
    schema: "outsider/reboot-recovery-opaque-reference/v1",
    sourceArtifactHash: artifact.artifactHash,
    episodeProjectionHashClaim: artifact.episodeProjection.projectionHash,
    verificationLevel: "SELF_SEALED_OPAQUE_REFERENCE_NO_SOURCE_AUTHENTICATION",
    sourceRootVerified: false,
    episodeCountsVerified: false,
    sourceRootIncluded: false,
    episodeCountIncluded: false,
    authorityDelta: 0,
    executable: false,
    dispatched: false,
  };
}

export function rebootRecoveryProjectionForNetwork(artifact, sourceDirectory, options = {}) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length < 1) {
    fail("NETWORK_PROJECTION_FULL_SOURCE_REPLAY_REQUIRED");
  }
  const checked = verifyRebootRecoveryPilotArtifactWithSource(artifact, sourceDirectory, options);
  if (!checked.ok || checked.verificationLevel !== "FULL_SOURCE_REPLAY"
    || checked.sourceArtifactsReverified !== true
    || checked.candidateArtifactExactlyRebuilt !== true) {
    fail("NETWORK_PROJECTION_FULL_SOURCE_REPLAY_FAILED");
  }
  return {
    schema: "outsider/reboot-recovery-network-projection/v1",
    sourceArtifactHash: artifact.artifactHash,
    sourceRoot: artifact.source.sourceRoot,
    episodeProjectionHash: artifact.episodeProjection.projectionHash,
    verifiedEpisodeCount: artifact.quality.projectedEpisodes,
    countsSourceVerified: true,
    sourceReplayVerificationLevel: "FULL_SOURCE_REPLAY",
    trainingDecision: artifact.training.decision,
    purpose: "RECOVERY_FOLLOWUP_ACQUISITION_RANKING_ONLY",
    status: "QUARANTINED_REVIEW_ONLY",
    authorityDelta: 0,
    executable: false,
    dispatched: false,
  };
}

export const REBOOT_RECOVERY_PILOT_CONSTANTS = Object.freeze({
  featureNames: FEATURE_NAMES,
  featureStrideFrames: FEATURE_STRIDE_FRAMES,
  promotionGate: PROMOTION_GATE,
  canonicalSourceManifestHash: CANONICAL_SOURCE_MANIFEST_HASH,
  projectUrl: PROJECT_URL,
});
