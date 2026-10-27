/*
 * Bounded real-robot recovery morphology from AgentChord.
 *
 * The selected source unit is the complete four-video directory
 * `docs/static/demos/rearrangement/` at one immutable Git commit, together
 * with the publisher page that classifies it as real-world, the repository
 * README, and the root license.  MP4 containers are structurally replayed;
 * pixels are not interpreted.  Publisher titles are not independent outcome
 * labels, continuous robot trajectories, attempt census entries, or evidence
 * of action/delegation authority.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fchmodSync,
  fstatSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync,
  renameSync, statSync, writeSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const AGENTCHORD_REPOSITORY = "EDEM-AI/AgentChord";
export const AGENTCHORD_COMMIT = "74fe7dd756964b737952d26e9e65d4d5e2e29ec3";
export const AGENTCHORD_TREE = "8ff72fbe3bc18044ce4f88678b453257f109892e";
export const AGENTCHORD_GROUP_PREFIX = "docs/static/demos/rearrangement/";
export const AGENTCHORD_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const AGENTCHORD_SOURCE_SCHEMA
  = "outsider/agentchord-real-rearrangement-source/v1";
export const AGENTCHORD_REPORT_SCHEMA
  = "outsider/agentchord-real-rearrangement-recovery/v1";
export const AGENTCHORD_RECEIPT_SCHEMA
  = "outsider/agentchord-real-rearrangement-run-receipt/v1";

const GITHUB_API = `https://api.github.com/repos/${AGENTCHORD_REPOSITORY}`;
const COMMIT_URL = `${GITHUB_API}/commits/${AGENTCHORD_COMMIT}`;
const TREE_URL = `${GITHUB_API}/git/trees/${AGENTCHORD_TREE}?recursive=1`;
const RAW_ROOT = `https://raw.githubusercontent.com/${AGENTCHORD_REPOSITORY}/${AGENTCHORD_COMMIT}`;
const MAX_API_BYTES = 4 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 120_000;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;

const EXPECTED_REPOSITORY = Object.freeze({
  entries: 869,
  files: 676,
  directories: 193,
  bytes: 132_232_145,
  selectedFiles: 7,
  selectedBytes: 4_780_314,
  groupVideos: 4,
  groupVideoBytes: 4_702_943,
});

const SELECTED = Object.freeze([
  Object.freeze({
    path: "LICENSE", bytes: 11_353,
    gitOid: "3154f19d171f2cbb091a5016139479d0bbe7eb1a",
    sha256: "sha256:4ce86d4a082b84c9966f1f17c653934bb47ef550130c1ff5cf0c428646571f0f",
    role: "ROOT_LICENSE",
  }),
  Object.freeze({
    path: "README.md", bytes: 14_626,
    gitOid: "e85b826ba2e7591c461ffd4d2b0503255f6da69d",
    sha256: "sha256:413dd9777df84bf5ce7b463559a8d453d078dea7a8af9c6cb45c7b6ec3145409",
    role: "REPOSITORY_README",
  }),
  Object.freeze({
    path: "docs/index.html", bytes: 51_392,
    gitOid: "4a375e2b73214e560dd1657310b677a0628c8e16",
    sha256: "sha256:128def9a39e74fa993fad503a932f0897dfaca8466f961a0e0c1878617e9b7bc",
    role: "PUBLISHER_PROJECT_PAGE",
  }),
  Object.freeze({
    path: `${AGENTCHORD_GROUP_PREFIX}clean.mp4`, bytes: 993_934,
    gitOid: "e0896f9bd0e9f0966a79d728d5dfddbe180b56dd",
    sha256: "sha256:88afee638ee74098645a5d90d6e31a7acdffea8e7dec7120e6d829cbcbad8552",
    role: "PUBLISHER_LABELED_CLEAN_REFERENCE",
    publisherTitle: "Clean rollout",
    publisherDescription: "A reference rearrangement rollout without external disturbance.",
  }),
  Object.freeze({
    path: `${AGENTCHORD_GROUP_PREFIX}disturb_before_left-arm_grasping_fork.mp4`,
    bytes: 1_175_433,
    gitOid: "63cfb6ab4aace3a4dd13f2b0077496fa96934583",
    sha256: "sha256:e9ff3df4439263da6a3841059c4524266a172e744c7a1ebcce662e6d13157474",
    role: "PUBLISHER_LABELED_PREGRASP_REDIRECTION",
    publisherTitle: "Recovery before left-arm fork grasp",
    publisherDescription:
      "The system redirects execution before a disturbed fork grasp is attempted.",
  }),
  Object.freeze({
    path: `${AGENTCHORD_GROUP_PREFIX}fail_&_retry_multiple_times_of_left-arm_grasping_fork.mp4`,
    bytes: 1_357_147,
    gitOid: "9ff24c3fee9fd07915ded4b7c616524ee9489838",
    sha256: "sha256:ab5f808d3fac680c5decfc8528080931580a406882ef84960123ebc0bdfea462",
    role: "PUBLISHER_LABELED_MULTI_FAILURE_RETRY",
    publisherTitle: "Multiple fork grasp retries",
    publisherDescription:
      "The policy retries through multiple recovery opportunities instead of abandoning the task.",
  }),
  Object.freeze({
    path: `${AGENTCHORD_GROUP_PREFIX}fail_&_retry_one_time_of_right-arm_grasping_spoon.mp4`,
    bytes: 1_176_429,
    gitOid: "d132cdbedd12d9afa6dd3ca4ce4d987a36e7c366",
    sha256: "sha256:83e74dcf975c9cccf3c2176d7207b638d2da9ca39355f58fff392e6a43dc33b1",
    role: "PUBLISHER_LABELED_SINGLE_FAILURE_RETRY",
    publisherTitle: "Fail and retry right-arm spoon grasp",
    publisherDescription: "A failed grasp is followed by a prepared retry branch.",
  }),
]);

export const AGENTCHORD_SEARCH_DISPOSITIONS = Object.freeze([
  Object.freeze({ id: "EDEM-AI/AgentChord", channel: "GITHUB",
    disposition: "ACQUIRE_NOW_SELECTED_COMPLETE_REAL_VIDEO_TASK_GROUP" }),
  Object.freeze({ id: "Serenos/TCoT", channel: "GITHUB",
    disposition: "REJECT_RELEASED_FAILURE_DATA_IS_LIBERO_SIMULATION" }),
  Object.freeze({ id: "x1nyuzhou/Robo-Mani-Failure-Data", channel: "GITHUB",
    disposition: "METADATA_ONLY_CURATED_LINK_LIST_NO_DATA_PAYLOAD" }),
  Object.freeze({ id: "LAIN366/forge-recover", channel: "GITHUB",
    disposition: "REJECT_MUJOCO_RESEARCH_REPO_NO_REAL_ARM_GROUP" }),
  Object.freeze({ id: "easyrider11/robot-vision-copilot", channel: "GITHUB",
    disposition: "REJECT_TABLETOP_LIBERO_GAZEBO_SIMULATION" }),
  Object.freeze({ id: "vsimundic/ur5-door-interaction", channel: "GITHUB",
    disposition: "METADATA_ONLY_CODE_INTEGRATION_NO_CLOSED_DATA_RIGHTS_GROUP" }),
  Object.freeze({ id: "HallowsYves/NSF-REU-TAIRO", channel: "GITHUB",
    disposition: "REJECT_SIMULATED_FETCH_PICK_AND_PLACE_ATTACK_EVAL" }),
  Object.freeze({ id: "auraoneai/robot-recovery-bench", channel: "GITHUB",
    disposition: "REJECT_BUNDLED_RECORDS_EXPLICITLY_SYNTHETIC_TUTORIAL" }),
  Object.freeze({ id: "ethanvillalovoz/intervenesim", channel: "GITHUB",
    disposition: "REJECT_SIMULATED_INTERVENTION_BENCHMARK" }),
  Object.freeze({ id: "charanmanjureddy08-879/Advanced-Obstacle-Avoiding-Robot-using-Arduino-UNO",
    channel: "GITHUB", disposition: "REJECT_OUT_OF_SCOPE_MOBILE_ROBOT" }),
  Object.freeze({ id: "Jayakar72/multiview-act-ur5-servoing", channel: "GITHUB",
    disposition: "REJECT_GAZEBO_ONLY_REAL_TRANSFER_NOT_VALIDATED" }),
  Object.freeze({ id: "iamashkan/UR5e-Circular-Motor-Recovery", channel: "GITHUB",
    disposition: "REJECT_DIGITAL_TWIN_SIMULATION_HARDWARE_READY_ONLY" }),
  Object.freeze({ id: "HaptalAI/robotics-failure-benchmark", channel: "HUGGING_FACE",
    disposition: "REJECT_GATED_AND_PHYSICS_INJECTED_FAILURES" }),
  Object.freeze({ id: "axisrobotics/Franka-Dataset", channel: "HUGGING_FACE",
    disposition: "REJECT_GATED_NONCOMMERCIAL_AND_NOT_RECOVERY_SPECIFIC" }),
  Object.freeze({ id: "MINT-SJTU/RoboFAC-dataset", channel: "HUGGING_FACE",
    disposition: "METADATA_ONLY_25_8GB_MIXED_REAL_SIM_PARTITION_UNCLOSED" }),
  Object.freeze({ id: "nvidia/PhysicalAI-Robotics-Open-H-Embodiment", channel: "HUGGING_FACE",
    disposition: "METADATA_ONLY_MULTI_TERABYTE_AGGREGATE_NO_PER_EPISODE_OUTCOME" }),
  Object.freeze({ id: "ExylosAi/pick_and_place_sample", channel: "HUGGING_FACE",
    disposition: "ALREADY_ACQUIRED_SEPARATELY_SIMULATED_VR_SEEDED" }),
  Object.freeze({ id: "REBOOT", channel: "GITHUB",
    disposition: "ALREADY_ACQUIRED_SEPARATELY_REAL_RECOVERY_PILOT" }),
  Object.freeze({ id: "Zenodo:17198130,17198163", channel: "ZENODO",
    disposition: "REJECT_EACH_COMPLETE_FILE_EXCEEDS_300MB" }),
  Object.freeze({ id: "Zenodo:17198184", channel: "ZENODO",
    disposition: "QUARANTINE_FORMAT_CONFLICT_DOT_ZIP_HAS_NO_ZIP_OR_ROSBAG_MAGIC_IN_STRICT_HEAD_TAIL_RANGES" }),
  Object.freeze({ id: "Zenodo:17198202", channel: "ZENODO",
    disposition: "NOT_SELECTED_LOWER_VALUE_HUMAN_SUBJECT_ROSBAG_SIBLING" }),
  Object.freeze({ id: "Zenodo:17193769,17427472", channel: "ZENODO",
    disposition: "REJECT_HUMAN_GESTURE_RVIZ_VISUALIZATION_NOT_FAILURE_RECOVERY" }),
  Object.freeze({ id: "Zenodo:18954650", channel: "ZENODO",
    disposition: "REJECT_UR5_ACCURACY_DATA_NOT_FAILURE_RECOVERY" }),
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `AGENTCHORD_${code}`
    : `AGENTCHORD_${code}:${detail}`);
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

export function agentChordSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function agentChordDigest(value, domain = AGENTCHORD_REPORT_SCHEMA) {
  return agentChordSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`))
    .update(bytes).digest("hex");
}

function safeRelative(value) {
  return typeof value === "string" && value.length > 0 && value.length <= 4096
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((item) => item !== "" && item !== "." && item !== "..");
}

function encodedPath(value) {
  if (!safeRelative(value)) fail("REMOTE_PATH_INVALID", value);
  return value.split("/").map(encodeURIComponent).join("/");
}

function allowedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === ""
      && ["api.github.com", "raw.githubusercontent.com"].includes(url.hostname);
  } catch { return false; }
}

function retryable(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError"
    || error?.retryable === true
    || /(?:fetch failed|network|timeout|timed out|ECONN|ENOTFOUND|EAI_AGAIN)/iu
      .test(String(error?.message ?? error));
}

async function fetchOnce(url, maximumBytes, accept, fetchImpl) {
  if (!allowedUrl(url)) fail("FETCH_URL_REFUSED", url);
  let current = new URL(url);
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    const response = await fetchImpl(current, {
      method: "GET", redirect: "manual",
      headers: { accept, "user-agent": "outsider-agentchord-quarantine/1.0" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers?.get?.("location");
      if (!location || redirects === 4) fail("FETCH_REDIRECT_INVALID");
      const next = new URL(location, current);
      if (!allowedUrl(next.toString())) fail("FETCH_REDIRECT_REFUSED", next.toString());
      current = next;
      continue;
    }
    if (response.status !== 200 || !response.body) {
      const error = new Error(`HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 429
        || response.status >= 500;
      throw error;
    }
    const finalUrl = response.url || current.toString();
    if (!allowedUrl(finalUrl)) fail("FETCH_FINAL_URL_REFUSED", finalUrl);
    const declared = response.headers?.get?.("content-length");
    if (declared !== null && (!/^\d+$/u.test(declared)
      || Number(declared) > maximumBytes)) fail("FETCH_DECLARED_BYTES_INVALID", url);
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("bounded source limit");
        fail("FETCH_STREAM_BYTES_INVALID", url);
      }
      chunks.push(Buffer.from(value));
    }
    if (total < 1) fail("FETCH_EMPTY", url);
    return { bytes: Buffer.concat(chunks, total), finalUrl,
      contentType: response.headers?.get?.("content-type") ?? null };
  }
  fail("FETCH_REDIRECT_LIMIT");
}

async function boundedFetch(url, maximumBytes, accept, fetchImpl) {
  let last;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await fetchOnce(url, maximumBytes, accept, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400 * attempt));
    }
  }
  throw last;
}

function parseJson(bytes, label) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail("JSON_INVALID", `${label}:${error.message}`); }
}

async function jsonFetch(url, fetchImpl) {
  const fetched = await boundedFetch(url, MAX_API_BYTES, "application/json", fetchImpl);
  return { ...fetched, value: parseJson(fetched.bytes, url) };
}

function normalizeCommit(value) {
  if (!plain(value) || value.sha !== AGENTCHORD_COMMIT
    || value.commit?.tree?.sha !== AGENTCHORD_TREE
    || value.html_url !== `https://github.com/${AGENTCHORD_REPOSITORY}/commit/${AGENTCHORD_COMMIT}`) {
    fail("COMMIT_INVALID");
  }
  return {
    repository: AGENTCHORD_REPOSITORY,
    commit: value.sha,
    tree: value.commit.tree.sha,
    htmlUrl: value.html_url,
    authoredAt: value.commit.author?.date ?? null,
    committedAt: value.commit.committer?.date ?? null,
    signatureVerified: value.commit.verification?.verified === true,
    signatureReason: value.commit.verification?.reason ?? null,
  };
}

function normalizeTree(value) {
  if (!plain(value) || value.sha !== AGENTCHORD_TREE || value.truncated !== false
    || !Array.isArray(value.tree)) fail("TREE_INVALID");
  const entries = value.tree.map((entry) => {
    if (!plain(entry) || !safeRelative(entry.path) || !SHA1.test(entry.sha ?? "")
      || !["blob", "tree"].includes(entry.type)
      || !/^(?:040000|100644|100755)$/u.test(entry.mode ?? "")) {
      fail("TREE_ENTRY_INVALID", entry?.path ?? "unknown");
    }
    // Git trees legitimately contain zero-byte source files.
    if (entry.type === "blob" && (!Number.isSafeInteger(entry.size) || entry.size < 0)) {
      fail("TREE_BLOB_INVALID", entry.path);
    }
    return { path: entry.path, type: entry.type, mode: entry.mode, sha: entry.sha,
      size: entry.type === "blob" ? entry.size : null };
  }).sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("TREE_DUPLICATE_PATH");
  }
  const files = entries.filter((entry) => entry.type === "blob");
  const directories = entries.filter((entry) => entry.type === "tree");
  const bytes = files.reduce((sum, entry) => sum + entry.size, 0);
  const group = files.filter((entry) => entry.path.startsWith(AGENTCHORD_GROUP_PREFIX));
  const selected = files.filter((entry) => SELECTED.some((item) => item.path === entry.path));
  if (entries.length !== EXPECTED_REPOSITORY.entries
    || files.length !== EXPECTED_REPOSITORY.files
    || directories.length !== EXPECTED_REPOSITORY.directories
    || bytes !== EXPECTED_REPOSITORY.bytes
    || group.length !== EXPECTED_REPOSITORY.groupVideos
    || group.some((entry) => !entry.path.endsWith(".mp4"))
    || group.reduce((sum, entry) => sum + entry.size, 0)
      !== EXPECTED_REPOSITORY.groupVideoBytes
    || selected.length !== EXPECTED_REPOSITORY.selectedFiles
    || selected.reduce((sum, entry) => sum + entry.size, 0)
      !== EXPECTED_REPOSITORY.selectedBytes) fail("TREE_PROFILE_INVALID");
  for (const expected of SELECTED) {
    const entry = files.find((item) => item.path === expected.path);
    if (entry?.size !== expected.bytes || entry?.sha !== expected.gitOid) {
      fail("SELECTED_TREE_BINDING_INVALID", expected.path);
    }
  }
  return { sha: value.sha, entries, profile: { entries: entries.length,
    files: files.length, directories: directories.length, bytes,
    groupVideos: group.length, groupVideoBytes: EXPECTED_REPOSITORY.groupVideoBytes,
    selectedFiles: selected.length, selectedBytes: EXPECTED_REPOSITORY.selectedBytes },
  treeProjectionHash: agentChordDigest(entries, `${AGENTCHORD_SOURCE_SCHEMA}/tree`) };
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = lstatSync(directory);
  if (info.isSymbolicLink() || !info.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function safeJoin(root, relative) {
  if (!safeRelative(relative)) fail("LOCAL_PATH_INVALID", relative);
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(root, ...relative.split("/"));
  if (!target.startsWith(`${resolvedRoot}${path.sep}`)) fail("LOCAL_PATH_ESCAPE", relative);
  return target;
}

function writePrivateOnce(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  const descriptor = openSync(file, fsConstants.O_WRONLY | fsConstants.O_CREAT
    | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  try {
    const info = fstatSync(descriptor);
    if (!info.isFile() || info.nlink !== 1) fail("OUTPUT_UNSAFE", file);
    fchmodSync(descriptor, 0o600);
    let offset = 0;
    while (offset < bytes.length) offset += writeSync(descriptor, bytes, offset);
  } finally { closeSync(descriptor); }
}

function stableRead(file) {
  const before = lstatSync(file);
  if (before.isSymbolicLink() || !before.isFile() || before.nlink !== 1
    || (before.mode & 0o777) !== 0o600) fail("SOURCE_FILE_UNSAFE", file);
  const descriptor = openSync(file, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = fstatSync(descriptor);
    if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino
      || opened.size !== before.size) fail("SOURCE_FILE_RACE", file);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (after.dev !== opened.dev || after.ino !== opened.ino || after.size !== opened.size
      || after.mtimeMs !== opened.mtimeMs || after.ctimeMs !== opened.ctimeMs) {
      fail("SOURCE_FILE_MUTATED", file);
    }
    return bytes;
  } finally { closeSync(descriptor); }
}

function walk(root, current = root, output = { files: [], directories: [] }) {
  const info = lstatSync(current);
  if (info.isSymbolicLink()) fail("SOURCE_SYMLINK", current);
  const relative = path.relative(root, current).split(path.sep).join("/") || ".";
  if (info.isDirectory()) {
    if ((info.mode & 0o777) !== 0o700) fail("SOURCE_DIRECTORY_MODE", relative);
    output.directories.push({ path: relative, dev: info.dev, ino: info.ino,
      mode: info.mode & 0o777, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs });
    for (const name of readdirSync(current).sort()) walk(root, path.join(current, name), output);
  } else if (info.isFile()) {
    if ((info.mode & 0o777) !== 0o600 || info.nlink !== 1) fail("SOURCE_FILE_MODE", relative);
    output.files.push({ path: relative, dev: info.dev, ino: info.ino, size: info.size,
      mode: info.mode & 0o777, mtimeMs: info.mtimeMs, ctimeMs: info.ctimeMs });
  } else fail("SOURCE_SPECIAL_FILE", relative);
  return output;
}

function expectedSourceFiles() {
  return sorted([
    "acquisition-manifest.json",
    "support/before/commit.json", "support/before/tree.json",
    "support/after/commit.json", "support/after/tree.json",
    ...SELECTED.map((item) => `objects/${item.path}`),
  ]);
}

function expectedSourceDirectories() {
  const directories = new Set(["."]);
  for (const file of expectedSourceFiles()) {
    const parts = file.split("/");
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current === "" ? part : `${current}/${part}`;
      directories.add(current);
    }
  }
  return sorted(directories);
}

function snapshotProjection(snapshot) {
  return {
    files: snapshot.files.map((item) => ({ path: item.path, dev: item.dev, ino: item.ino,
      size: item.size, mode: item.mode, mtimeMs: item.mtimeMs, ctimeMs: item.ctimeMs })),
    directories: snapshot.directories.map((item) => ({ path: item.path, dev: item.dev,
      ino: item.ino, mode: item.mode, mtimeMs: item.mtimeMs, ctimeMs: item.ctimeMs })),
  };
}

function parseBoxes(bytes, start, end, context) {
  const boxes = [];
  let cursor = start;
  while (cursor < end) {
    if (end - cursor < 8) fail("MP4_BOX_HEADER_TRUNCATED", context);
    let size = bytes.readUInt32BE(cursor);
    const type = bytes.toString("ascii", cursor + 4, cursor + 8);
    let headerBytes = 8;
    if (!/^[\x20-\x7e]{4}$/u.test(type)) fail("MP4_BOX_TYPE_INVALID", context);
    if (size === 1) {
      if (end - cursor < 16) fail("MP4_LARGE_BOX_TRUNCATED", context);
      const large = bytes.readBigUInt64BE(cursor + 8);
      if (large > BigInt(Number.MAX_SAFE_INTEGER)) fail("MP4_BOX_TOO_LARGE", context);
      size = Number(large);
      headerBytes = 16;
    } else if (size === 0) size = end - cursor;
    if (size < headerBytes || cursor + size > end) fail("MP4_BOX_SIZE_INVALID", context);
    boxes.push({ type, start: cursor, end: cursor + size,
      payloadStart: cursor + headerBytes, payloadEnd: cursor + size, size });
    cursor += size;
  }
  if (cursor !== end) fail("MP4_BOX_COVERAGE_INVALID", context);
  return boxes;
}

function children(bytes, box, context) {
  return parseBoxes(bytes, box.payloadStart, box.payloadEnd, context);
}

function exactlyOne(boxes, type, context) {
  const matches = boxes.filter((box) => box.type === type);
  if (matches.length !== 1) fail("MP4_BOX_CARDINALITY", `${context}:${type}`);
  return matches[0];
}

function unsigned64(bytes, offset) {
  const value = bytes.readBigUInt64BE(offset);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail("MP4_INTEGER_TOO_LARGE");
  return Number(value);
}

function parseMediaHeader(bytes, box, context) {
  const length = box.payloadEnd - box.payloadStart;
  const version = bytes[box.payloadStart];
  if (version === 0 && length >= 24) return {
    timescale: bytes.readUInt32BE(box.payloadStart + 12),
    durationTicks: bytes.readUInt32BE(box.payloadStart + 16),
  };
  if (version === 1 && length >= 36) return {
    timescale: bytes.readUInt32BE(box.payloadStart + 20),
    durationTicks: unsigned64(bytes, box.payloadStart + 24),
  };
  fail("MP4_MDHD_INVALID", context);
}

function parseSampleTiming(bytes, box, context) {
  if (box.payloadEnd - box.payloadStart < 8) fail("MP4_STTS_INVALID", context);
  const count = bytes.readUInt32BE(box.payloadStart + 4);
  if (box.payloadEnd - box.payloadStart !== 8 + count * 8) fail("MP4_STTS_SIZE", context);
  let samples = 0;
  let durationTicks = 0;
  for (let index = 0; index < count; index += 1) {
    const offset = box.payloadStart + 8 + index * 8;
    const sampleCount = bytes.readUInt32BE(offset);
    const sampleDelta = bytes.readUInt32BE(offset + 4);
    samples += sampleCount;
    durationTicks += sampleCount * sampleDelta;
    if (!Number.isSafeInteger(samples) || !Number.isSafeInteger(durationTicks)) {
      fail("MP4_STTS_OVERFLOW", context);
    }
  }
  return { entries: count, samples, durationTicks };
}

export function parseAgentChordMp4(bytes, label = "mp4") {
  if (!Buffer.isBuffer(bytes) || bytes.length < 32) fail("MP4_BYTES_INVALID", label);
  const top = parseBoxes(bytes, 0, bytes.length, label);
  const ftyp = exactlyOne(top, "ftyp", label);
  const moov = exactlyOne(top, "moov", label);
  const mdats = top.filter((box) => box.type === "mdat");
  if (mdats.length < 1 || ftyp.payloadEnd - ftyp.payloadStart < 8) {
    fail("MP4_TOP_LEVEL_INVALID", label);
  }
  const majorBrand = bytes.toString("ascii", ftyp.payloadStart, ftyp.payloadStart + 4);
  const compatibleBrands = [];
  for (let offset = ftyp.payloadStart + 8; offset + 4 <= ftyp.payloadEnd; offset += 4) {
    compatibleBrands.push(bytes.toString("ascii", offset, offset + 4));
  }
  const tracks = [];
  for (const trak of children(bytes, moov, `${label}:moov`).filter((box) => box.type === "trak")) {
    const trakChildren = children(bytes, trak, `${label}:trak`);
    const tkhd = exactlyOne(trakChildren, "tkhd", label);
    const mdia = exactlyOne(trakChildren, "mdia", label);
    const mdiaChildren = children(bytes, mdia, `${label}:mdia`);
    const hdlr = exactlyOne(mdiaChildren, "hdlr", label);
    if (hdlr.payloadEnd - hdlr.payloadStart < 12) fail("MP4_HDLR_INVALID", label);
    const handler = bytes.toString("ascii", hdlr.payloadStart + 8, hdlr.payloadStart + 12);
    const header = parseMediaHeader(bytes, exactlyOne(mdiaChildren, "mdhd", label), label);
    const minf = exactlyOne(mdiaChildren, "minf", label);
    const stbl = exactlyOne(children(bytes, minf, `${label}:minf`), "stbl", label);
    const sampleBoxes = children(bytes, stbl, `${label}:stbl`);
    const stsz = exactlyOne(sampleBoxes, "stsz", label);
    if (stsz.payloadEnd - stsz.payloadStart < 12) fail("MP4_STSZ_INVALID", label);
    const sampleCount = bytes.readUInt32BE(stsz.payloadStart + 8);
    const timing = parseSampleTiming(bytes, exactlyOne(sampleBoxes, "stts", label), label);
    if (sampleCount !== timing.samples || header.timescale < 1
      || header.durationTicks !== timing.durationTicks) fail("MP4_TIMING_INCONSISTENT", label);
    const stsd = exactlyOne(sampleBoxes, "stsd", label);
    if (stsd.payloadEnd - stsd.payloadStart < 44
      || bytes.readUInt32BE(stsd.payloadStart + 4) !== 1) fail("MP4_STSD_INVALID", label);
    const entryStart = stsd.payloadStart + 8;
    const entrySize = bytes.readUInt32BE(entryStart);
    if (entrySize < 36 || entryStart + entrySize > stsd.payloadEnd) {
      fail("MP4_SAMPLE_ENTRY_INVALID", label);
    }
    const codec = bytes.toString("ascii", entryStart + 4, entryStart + 8);
    let width = null;
    let height = null;
    if (handler === "vide") {
      width = bytes.readUInt16BE(entryStart + 32);
      height = bytes.readUInt16BE(entryStart + 34);
      const tkhdLength = tkhd.payloadEnd - tkhd.payloadStart;
      if (tkhdLength < 8) fail("MP4_TKHD_INVALID", label);
      const tkhdWidth = bytes.readUInt32BE(tkhd.payloadEnd - 8) / 65_536;
      const tkhdHeight = bytes.readUInt32BE(tkhd.payloadEnd - 4) / 65_536;
      if (tkhdWidth !== width || tkhdHeight !== height || width < 1 || height < 1) {
        fail("MP4_DIMENSIONS_INVALID", label);
      }
    }
    const sync = sampleBoxes.find((box) => box.type === "stss");
    const syncSamples = sync === undefined ? sampleCount
      : bytes.readUInt32BE(sync.payloadStart + 4);
    tracks.push({ handler, codec, width, height, timescale: header.timescale,
      durationTicks: header.durationTicks,
      durationSeconds: header.durationTicks / header.timescale,
      samples: sampleCount, syncSamples, timingEntries: timing.entries });
  }
  const videoTracks = tracks.filter((track) => track.handler === "vide");
  if (videoTracks.length !== 1 || tracks.some((track) => track.handler !== "vide")) {
    fail("MP4_TRACK_PROFILE_INVALID", label);
  }
  return {
    bytes: bytes.length, majorBrand, compatibleBrands,
    topLevelBoxes: top.map((box) => ({ type: box.type, bytes: box.size })),
    mdatPayloadBytes: mdats.reduce((sum, box) => sum + box.payloadEnd - box.payloadStart, 0),
    tracks,
    compressedPixelsDecoded: false,
    semanticEventsVisuallyReviewedByThisModule: false,
  };
}

function publisherPageBoundary(html) {
  const required = [
    "Simulation videos are shown first, followed by the real-world execution videos at 3x speed.",
    '<p class="kicker">Real-World Rollouts</p>',
    "Rearrange the fork and spoon beside the plate.",
    ...SELECTED.filter((item) => item.path.endsWith(".mp4"))
      .flatMap((item) => [item.publisherTitle, item.publisherDescription,
        item.path.replace(/^docs\//u, "")
          .replaceAll("&", "%26")]),
  ];
  if (required.some((value) => !html.includes(value))) fail("PROJECT_PAGE_BOUNDARY_INVALID");
  return {
    section: "Real-World Rollouts",
    task: "Rearrange the fork and spoon beside the plate.",
    presentationSpeedClaim: "3x",
    publisherRealWorldClassificationPresent: true,
  };
}

function sourceFileProjection(bytes, expected) {
  if (bytes.length !== expected.bytes || gitBlobOid(bytes) !== expected.gitOid
    || agentChordSha256(bytes) !== expected.sha256) fail("SOURCE_OBJECT_INVALID", expected.path);
  return { path: expected.path, role: expected.role, bytes: bytes.length,
    gitOid: expected.gitOid, sha256: expected.sha256 };
}

export async function acquireAgentChordRealRearrangementSource(
  { directory, fetchImpl = fetch } = {}) {
  if (typeof directory !== "string" || directory.length < 1) fail("DIRECTORY_REQUIRED");
  if (existsSync(directory)) fail("NO_CLOBBER", directory);
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  chmodSync(directory, 0o700);

  const [beforeCommit, beforeTree] = await Promise.all([
    jsonFetch(COMMIT_URL, fetchImpl), jsonFetch(TREE_URL, fetchImpl),
  ]);
  const beforeCommitProjection = normalizeCommit(beforeCommit.value);
  const beforeTreeProjection = normalizeTree(beforeTree.value);

  const sourceFiles = new Array(SELECTED.length);
  let cursor = 0;
  async function worker() {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= SELECTED.length) return;
      const expected = SELECTED[index];
      const requestUrl = `${RAW_ROOT}/${encodedPath(expected.path)}`;
      const fetched = await boundedFetch(requestUrl, expected.bytes,
        "application/octet-stream", fetchImpl);
      const projection = sourceFileProjection(fetched.bytes, expected);
      writePrivateOnce(safeJoin(directory, `objects/${expected.path}`), fetched.bytes);
      sourceFiles[index] = { ...projection, requestUrl, finalUrl: fetched.finalUrl,
        contentType: fetched.contentType };
    }
  }
  await Promise.all(Array.from({ length: SELECTED.length }, () => worker()));

  const [afterCommit, afterTree] = await Promise.all([
    jsonFetch(COMMIT_URL, fetchImpl), jsonFetch(TREE_URL, fetchImpl),
  ]);
  const afterCommitProjection = normalizeCommit(afterCommit.value);
  const afterTreeProjection = normalizeTree(afterTree.value);
  if (!same(beforeCommitProjection, afterCommitProjection)
    || !same(beforeTreeProjection, afterTreeProjection)) fail("SOURCE_DRIFT");

  const supportItems = [
    ["support/before/commit.json", beforeCommit],
    ["support/before/tree.json", beforeTree],
    ["support/after/commit.json", afterCommit],
    ["support/after/tree.json", afterTree],
  ];
  for (const [file, item] of supportItems) writePrivateOnce(safeJoin(directory, file), item.bytes);

  const sourceRoot = agentChordDigest(sourceFiles.map(({ path: itemPath, bytes,
    gitOid, sha256 }) => ({ path: itemPath, bytes, gitOid, sha256 })),
  `${AGENTCHORD_SOURCE_SCHEMA}/objects`);
  const manifestBase = {
    schema: AGENTCHORD_SOURCE_SCHEMA,
    frozenAt: AGENTCHORD_FROZEN_AT,
    repository: beforeCommitProjection,
    fullTree: beforeTreeProjection.profile,
    treeProjectionHash: beforeTreeProjection.treeProjectionHash,
    selection: {
      kind: "COMPLETE_SOURCE_NATIVE_REAL_WORLD_TASK_VIDEO_GROUP",
      prefix: AGENTCHORD_GROUP_PREFIX,
      completePrefixAtPinnedTree: true,
      randomShardSelection: false,
      files: EXPECTED_REPOSITORY.selectedFiles,
      bytes: EXPECTED_REPOSITORY.selectedBytes,
      videos: EXPECTED_REPOSITORY.groupVideos,
      videoBytes: EXPECTED_REPOSITORY.groupVideoBytes,
    },
    sourceFiles: sourceFiles.sort((left, right) => left.path.localeCompare(right.path)),
    supportSnapshots: supportItems.map(([file, item]) => ({ file,
      requestUrl: file.includes("commit") ? COMMIT_URL : TREE_URL,
      finalUrl: item.finalUrl, bytes: item.bytes.length,
      sha256: agentChordSha256(item.bytes), contentType: item.contentType })),
    sourceRoot,
  };
  const manifestHash = agentChordDigest(manifestBase, `${AGENTCHORD_SOURCE_SCHEMA}/manifest`);
  const manifest = { ...manifestBase, manifestHash };
  writePrivateOnce(path.join(directory, "acquisition-manifest.json"), canonicalBytes(manifest));
  verifyAgentChordRealRearrangementSource(directory);
  return manifest;
}

export function verifyAgentChordRealRearrangementSource(directory) {
  const root = path.resolve(directory);
  const beforeSnapshot = walk(root);
  if (!same(sorted(beforeSnapshot.files.map((item) => item.path)), expectedSourceFiles())
    || !same(sorted(beforeSnapshot.directories.map((item) => item.path)),
      expectedSourceDirectories())) fail("SOURCE_LAYOUT_INVALID");
  const manifestBytes = stableRead(path.join(root, "acquisition-manifest.json"));
  const manifest = parseJson(manifestBytes, "acquisition-manifest.json");
  if (!plain(manifest) || manifest.schema !== AGENTCHORD_SOURCE_SCHEMA
    || manifest.frozenAt !== AGENTCHORD_FROZEN_AT || !HASH.test(manifest.manifestHash ?? "")) {
    fail("MANIFEST_INVALID");
  }
  const { manifestHash, ...manifestBase } = manifest;
  if (agentChordDigest(manifestBase, `${AGENTCHORD_SOURCE_SCHEMA}/manifest`) !== manifestHash) {
    fail("MANIFEST_HASH_INVALID");
  }
  const beforeCommitBytes = stableRead(path.join(root, "support/before/commit.json"));
  const beforeTreeBytes = stableRead(path.join(root, "support/before/tree.json"));
  const afterCommitBytes = stableRead(path.join(root, "support/after/commit.json"));
  const afterTreeBytes = stableRead(path.join(root, "support/after/tree.json"));
  const commitBefore = normalizeCommit(parseJson(beforeCommitBytes, "before-commit"));
  const commitAfter = normalizeCommit(parseJson(afterCommitBytes, "after-commit"));
  const treeBefore = normalizeTree(parseJson(beforeTreeBytes, "before-tree"));
  const treeAfter = normalizeTree(parseJson(afterTreeBytes, "after-tree"));
  if (!same(commitBefore, commitAfter) || !same(treeBefore, treeAfter)
    || !same(manifest.repository, commitBefore)
    || !same(manifest.fullTree, treeBefore.profile)
    || manifest.treeProjectionHash !== treeBefore.treeProjectionHash) {
    fail("SOURCE_BRACKET_INVALID");
  }
  const supportByPath = new Map(manifest.supportSnapshots?.map((item) => [item.file, item]));
  for (const [relative, bytes] of [
    ["support/before/commit.json", beforeCommitBytes],
    ["support/before/tree.json", beforeTreeBytes],
    ["support/after/commit.json", afterCommitBytes],
    ["support/after/tree.json", afterTreeBytes],
  ]) {
    const support = supportByPath.get(relative);
    if (!plain(support) || support.bytes !== bytes.length
      || support.sha256 !== agentChordSha256(bytes)) fail("SUPPORT_BINDING_INVALID", relative);
  }
  const files = [];
  const media = [];
  for (const expected of SELECTED) {
    const bytes = stableRead(safeJoin(path.join(root, "objects"), expected.path));
    const projection = sourceFileProjection(bytes, expected);
    const manifestFile = manifest.sourceFiles?.find((item) => item.path === expected.path);
    if (!plain(manifestFile) || !same({ path: manifestFile.path, role: manifestFile.role,
      bytes: manifestFile.bytes, gitOid: manifestFile.gitOid, sha256: manifestFile.sha256 },
    projection)) fail("MANIFEST_OBJECT_BINDING_INVALID", expected.path);
    files.push(projection);
    if (expected.path.endsWith(".mp4")) {
      media.push({ path: expected.path, role: expected.role,
        publisherTitle: expected.publisherTitle,
        publisherDescription: expected.publisherDescription,
        sha256: expected.sha256, ...parseAgentChordMp4(bytes, expected.path) });
    }
  }
  const sourceRoot = agentChordDigest(files.map(({ path: itemPath, bytes, gitOid, sha256 }) =>
    ({ path: itemPath, bytes, gitOid, sha256 })), `${AGENTCHORD_SOURCE_SCHEMA}/objects`);
  if (manifest.sourceRoot !== sourceRoot) fail("SOURCE_ROOT_INVALID");
  const readme = stableRead(path.join(root, "objects/README.md")).toString("utf8");
  const license = stableRead(path.join(root, "objects/LICENSE")).toString("utf8");
  const html = stableRead(path.join(root, "objects/docs/index.html")).toString("utf8");
  if (!readme.includes("Real-world CobotMagic running script with perception modules.")
    || !readme.includes("Running AgentChord on the Real Robot")
    || !license.includes("Apache License") || !license.includes("Version 2.0, January 2004")) {
    fail("TEXT_SUPPORT_INVALID");
  }
  const publisherPage = publisherPageBoundary(html);
  const afterSnapshot = walk(root);
  if (!same(snapshotProjection(beforeSnapshot), snapshotProjection(afterSnapshot))) {
    fail("SOURCE_TREE_MUTATED_DURING_REPLAY");
  }
  return { ok: true, verificationLevel: "FULL_SELECTED_SOURCE_BYTE_REPLAY",
    manifest, manifestFileSha256: agentChordSha256(manifestBytes), sourceRoot,
    media: media.sort((left, right) => left.path.localeCompare(right.path)),
    publisherPage, sourceFiles: files.sort((left, right) => left.path.localeCompare(right.path)) };
}

function searchLedger() {
  return {
    observedAt: "2026-08-29",
    channels: ["GITHUB_OFFICIAL_SEARCH_AND_REPOSITORY_BYTES",
      "HUGGING_FACE_OFFICIAL_DATASET_API", "ZENODO_OFFICIAL_RECORD_API"],
    fixedQueries: ["robot manipulation failure recovery", "Franka failure recovery",
      "UR5 recovery", "robot intervention recovery"],
    githubFixedQueryCounts: [7, 0, 3, 3],
    githubUniqueHits: 12,
    huggingFaceDirectApiHits: [0, 0, 0, 0],
    zenodoQuotedPhraseHits: [0, 0, 0, 0],
    zenodoUnquotedTokenExpansionWasManuallyRelevanceFiltered: true,
    zenodoUnquotedTokenExpansionIsNotClaimedExhaustive: true,
    dispositions: AGENTCHORD_SEARCH_DISPOSITIONS,
    globalInternetExhaustionClaimed: false,
    exactGitHubHitUniverseTerminallyDisposed: true,
  };
}

export function buildAgentChordRealRearrangementReportFromSource(directory) {
  const checked = verifyAgentChordRealRearrangementSource(directory);
  const videos = checked.media;
  const reportBase = {
    schema: AGENTCHORD_REPORT_SCHEMA,
    frozenAt: AGENTCHORD_FROZEN_AT,
    declaredScope: {
      nonSo101: true,
      realMechanicalArmPublisherClassificationRequired: true,
      completeSourceNativeGroupMaximumBytes: 300_000_000,
      selectedGroupBytes: EXPECTED_REPOSITORY.selectedBytes,
      selectedBecause: "SMALLEST_CLOSED_HIGH_VALUE_REAL_FAILURE_RETRY_TASK_GROUP",
      globalExhaustion: false,
    },
    terminalDispositionLedger: searchLedger(),
    sourceIdentity: {
      repository: AGENTCHORD_REPOSITORY,
      commit: AGENTCHORD_COMMIT,
      tree: AGENTCHORD_TREE,
      commitSignatureVerified: false,
      publisherIdentityCryptographicallyVerified: false,
      rootLicensePublisherClaim: "Apache-2.0",
      sourceManifestHash: checked.manifest.manifestHash,
      sourceManifestFileSha256: checked.manifestFileSha256,
      sourceRoot: checked.sourceRoot,
    },
    selectedGroup: {
      sourceNativePrefix: AGENTCHORD_GROUP_PREFIX,
      completePrefixAtPinnedTree: true,
      taskPrompt: checked.publisherPage.task,
      embodimentPublisherClaim: "REAL_WORLD_COBOTMAGIC_BIMANUAL_ROBOT",
      realWorldClassificationSource: "docs/index.html:Real-World Rollouts",
      presentationSpeedPublisherClaim: checked.publisherPage.presentationSpeedClaim,
      physicalWallClockDurationsRecoverableFromPresentationVideos: false,
      visualRollouts: videos,
      continuousRobotStatePresent: false,
      continuousRobotActionPresent: false,
      forceTorquePresent: false,
      languageTaskPresent: true,
      machineReadableFailureEventBoundariesPresent: false,
      machineReadableRecoveryEventBoundariesPresent: false,
      compressedPixelsDecoded: false,
    },
    denominatorRegistry: {
      populations: [
        { type: "PUBLISHER_LABELED_REAL_WORLD_VIDEO_ROLLOUT", units: 4 },
        { type: "PUBLISHER_LABELED_CLEAN_REFERENCE_VIDEO", units: 1,
          subsetOfVideoRollouts: true },
        { type: "PUBLISHER_LABELED_DISTURBANCE_OR_RETRY_VIDEO", units: 3,
          subsetOfVideoRollouts: true },
        { type: "PUBLISHER_LABELED_FAILED_GRASP_RETRY_VIDEO", units: 2,
          subsetOfVideoRollouts: true },
      ],
      eventCountFromWordOneOrMultiple: null,
      crossPopulationTotal: null,
      subsetCountsMustNotBeAddedToRolloutCount: true,
      completeAttemptCensusEstablished: false,
      failedOrAbortedAttemptDenominatorEstablished: false,
    },
    segmentCoverageAttribution: {
      opportunity: { records: 0, established: false },
      delegation: { records: 0, established: false },
      action: { records: 0, established: false,
        reason: "VIDEO_ONLY_NO_MACHINE_READABLE_ACTION_TRACE" },
      effect: { records: 0, established: false,
        publisherVisualMorphologyClaims: 3 },
      outcome: { independentRecords: 0, publisherOutcomeLabels: 0,
        clipTitlesAreNotIndependentOutcomes: true },
      recovery: { independentRecords: 0, publisherRetryMorphologyVideos: 2,
        publisherPregraspRedirectionVideos: 1 },
      longitudinal: { records: 0, established: false },
    },
    rightsPrivacyAndUse: {
      rights: { repositoryRootPublisherClaim: "Apache-2.0",
        mediaRightsIndependentlyAudited: false, legalConclusion: false },
      privacy: { imageryPresent: true, humanPresencePossible: true,
        noPiiGuaranteed: false, consentDocumentationReplayed: false,
        manualPrivacyReviewComplete: false },
      use: { disposition: "QUARANTINE_EVAL", offlineEvaluationOnly: true,
        productionUseAuthorized: false, modelTrainingAuthorized: false,
        authorizedTrainingRows: 0 },
    },
    authorityAndEconomicsBoundary: {
      actionAuthorityDelta: 0, delegationAuthorityDelta: 0,
      affectedPartyStandingDelta: 0, networkContributionRecords: 0,
      CEURecords: 0, pricingRecords: 0, guaranteeRecords: 0,
      settlementRecords: 0, publicDeploymentReady: false,
    },
    sourceReplay: {
      verificationLevel: checked.verificationLevel,
      completeSelectedBytesReplayed: true,
      fullRepositoryDownloaded: false,
      embeddedRepositoryCodeExecuted: false,
      mp4ContainerStructureReplayed: true,
      visualSemanticsIndependentlyReviewed: false,
      replayHash: agentChordDigest({ sourceRoot: checked.sourceRoot,
        media: videos.map((video) => ({ path: video.path, sha256: video.sha256,
          bytes: video.bytes, tracks: video.tracks, topLevelBoxes: video.topLevelBoxes })) },
      `${AGENTCHORD_REPORT_SCHEMA}/replay`),
    },
  };
  return { ...reportBase,
    artifactHash: agentChordDigest(reportBase, `${AGENTCHORD_REPORT_SCHEMA}/artifact`) };
}

export function verifyAgentChordRealRearrangementReport(report) {
  const errors = [];
  if (!plain(report) || report.schema !== AGENTCHORD_REPORT_SCHEMA
    || report.frozenAt !== AGENTCHORD_FROZEN_AT || !HASH.test(report.artifactHash ?? "")) {
    return { ok: false, errors: ["SHAPE"] };
  }
  const { artifactHash, ...body } = report;
  if (agentChordDigest(body, `${AGENTCHORD_REPORT_SCHEMA}/artifact`) !== artifactHash) {
    errors.push("ARTIFACT_HASH");
  }
  if (report.sourceIdentity.repository !== AGENTCHORD_REPOSITORY
    || report.sourceIdentity.commit !== AGENTCHORD_COMMIT
    || report.sourceIdentity.tree !== AGENTCHORD_TREE
    || report.selectedGroup.completePrefixAtPinnedTree !== true
    || report.selectedGroup.visualRollouts?.length !== 4) errors.push("SOURCE_BOUNDARY");
  if (!same(report.terminalDispositionLedger, searchLedger())) errors.push("SEARCH_LEDGER");
  if (!same(report.denominatorRegistry.populations.map((item) => item.units), [4, 1, 3, 2])
    || report.denominatorRegistry.crossPopulationTotal !== null
    || report.denominatorRegistry.completeAttemptCensusEstablished !== false) {
    errors.push("DENOMINATOR_BOUNDARY");
  }
  if (report.segmentCoverageAttribution.outcome.independentRecords !== 0
    || report.segmentCoverageAttribution.recovery.independentRecords !== 0
    || report.segmentCoverageAttribution.action.records !== 0) errors.push("SEGMENT_BOUNDARY");
  const use = report.rightsPrivacyAndUse;
  if (use.use.disposition !== "QUARANTINE_EVAL" || use.use.modelTrainingAuthorized !== false
    || use.use.authorizedTrainingRows !== 0 || use.privacy.noPiiGuaranteed !== false
    || use.privacy.manualPrivacyReviewComplete !== false
    || use.rights.legalConclusion !== false) errors.push("RIGHTS_PRIVACY_USE_BOUNDARY");
  const authority = report.authorityAndEconomicsBoundary;
  if (Object.entries(authority).some(([key, value]) => key === "publicDeploymentReady"
    ? value !== false : value !== 0)) errors.push("AUTHORITY_ECONOMICS_BOUNDARY");
  if (report.declaredScope.globalExhaustion !== false
    || report.sourceReplay.embeddedRepositoryCodeExecuted !== false
    || report.sourceReplay.visualSemanticsIndependentlyReviewed !== false) {
    errors.push("SCOPE_REPLAY_BOUNDARY");
  }
  return { ok: errors.length === 0, errors };
}

export function verifyAgentChordRealRearrangementWithSource(report, directory) {
  try {
    const rebuilt = buildAgentChordRealRearrangementReportFromSource(directory);
    const reportCheck = verifyAgentChordRealRearrangementReport(report);
    if (!reportCheck.ok) return { ok: false, errors: reportCheck.errors,
      verificationLevel: "FAILED" };
    if (!same(report, rebuilt)) return { ok: false, errors: ["SOURCE_REDERIVATION"],
      verificationLevel: "FAILED" };
    return { ok: true, errors: [], verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED" };
  } catch (error) {
    return { ok: false, errors: [String(error?.message ?? error)], verificationLevel: "FAILED" };
  }
}

export function buildAgentChordRealRearrangementReceipt(report, reportBytes) {
  const checked = verifyAgentChordRealRearrangementReport(report);
  if (!checked.ok) fail("REPORT_INVALID", checked.errors.join(","));
  if (agentChordSha256(reportBytes) !== agentChordSha256(canonicalBytes(report))) {
    fail("REPORT_BYTES_INVALID");
  }
  const base = {
    schema: AGENTCHORD_RECEIPT_SCHEMA,
    frozenAt: AGENTCHORD_FROZEN_AT,
    reportFile: "agentchord-real-rearrangement-recovery.json",
    reportFileSha256: agentChordSha256(reportBytes),
    artifactHash: report.artifactHash,
    sourceManifestHash: report.sourceIdentity.sourceManifestHash,
    sourceRoot: report.sourceIdentity.sourceRoot,
    publication: { receiptWrittenLast: true, noClobber: true,
      directoriesMode: "0700", filesMode: "0600" },
    authorityDelta: 0,
  };
  return { ...base, receiptHash: agentChordDigest(base,
    `${AGENTCHORD_RECEIPT_SCHEMA}/receipt`) };
}

export function verifyAgentChordRealRearrangementReceipt(receipt, reportBytes) {
  const errors = [];
  if (!plain(receipt) || receipt.schema !== AGENTCHORD_RECEIPT_SCHEMA
    || !HASH.test(receipt.receiptHash ?? "")) return { ok: false, errors: ["SHAPE"] };
  const { receiptHash, ...base } = receipt;
  if (agentChordDigest(base, `${AGENTCHORD_RECEIPT_SCHEMA}/receipt`) !== receiptHash) {
    errors.push("RECEIPT_HASH");
  }
  if (receipt.reportFileSha256 !== agentChordSha256(reportBytes)) errors.push("REPORT_HASH");
  if (!same(receipt.publication, { receiptWrittenLast: true, noClobber: true,
    directoriesMode: "0700", filesMode: "0600" }) || receipt.authorityDelta !== 0) {
    errors.push("PUBLICATION_BOUNDARY");
  }
  return { ok: errors.length === 0, errors };
}

export function publishAgentChordRealRearrangementArtifact(staging, target) {
  if (!existsSync(staging) || existsSync(target)) fail("PUBLISH_NO_CLOBBER");
  const entries = readdirSync(staging).sort((left, right) => {
    if (left === "run-receipt.json") return 1;
    if (right === "run-receipt.json") return -1;
    return left.localeCompare(right);
  });
  if (!entries.includes("source") || !entries.includes("run-receipt.json")) {
    fail("PUBLISH_STAGING_INVALID");
  }
  mkdirSync(target, { recursive: false, mode: 0o700 });
  chmodSync(target, 0o700);
  for (const entry of entries) renameSync(path.join(staging, entry), path.join(target, entry));
  return target;
}

export function verifyAgentChordRealRearrangementArtifact(directory) {
  try {
    const root = path.resolve(directory);
    const top = readdirSync(root).sort();
    if (!same(top, ["agentchord-real-rearrangement-recovery.json",
      "run-receipt.json", "source"])) fail("ARTIFACT_LAYOUT_INVALID");
    if ((statSync(root).mode & 0o777) !== 0o700) fail("ARTIFACT_MODE_INVALID");
    const reportBytes = stableRead(path.join(root,
      "agentchord-real-rearrangement-recovery.json"));
    const receiptBytes = stableRead(path.join(root, "run-receipt.json"));
    const report = parseJson(reportBytes, "report");
    const receipt = parseJson(receiptBytes, "receipt");
    const replay = verifyAgentChordRealRearrangementWithSource(report,
      path.join(root, "source"));
    const receiptCheck = verifyAgentChordRealRearrangementReceipt(receipt, reportBytes);
    if (!replay.ok || !receiptCheck.ok) fail("ARTIFACT_REPLAY_INVALID",
      [...replay.errors, ...receiptCheck.errors].join(","));
    return { ok: true, errors: [], verificationLevel: replay.verificationLevel,
      report, receipt, reportFileSha256: agentChordSha256(reportBytes),
      receiptFileSha256: agentChordSha256(receiptBytes) };
  } catch (error) {
    return { ok: false, errors: [String(error?.message ?? error)],
      verificationLevel: "FAILED" };
  }
}

export const AGENTCHORD_REAL_REARRANGEMENT_CONSTANTS = Object.freeze({
  repository: EXPECTED_REPOSITORY,
  selected: SELECTED,
  dispositions: AGENTCHORD_SEARCH_DISPOSITIONS,
});
