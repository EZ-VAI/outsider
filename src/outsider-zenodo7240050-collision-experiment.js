/*
 * Bounded, byte-pinned collision experiment from Zenodo record 7240050.
 *
 * The 788 MB parent ZIP is not downloaded.  A fixed tail range replays its
 * complete central directory, while one README-described experiment and its
 * ROS bag are retained as a complete two-entry closure.  The external F/T
 * topic is mechanical collision evidence; it is not promoted to a task
 * outcome, recovery episode, delegation record, or training authorization.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmSync, rmdirSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const ZENODO_7240050_RECORD_ID = 7_240_050;
export const ZENODO_7240050_DOI = "10.5281/zenodo.7240050";
export const ZENODO_7240050_ARCHIVE_NAME = "data.zip";
export const ZENODO_7240050_ARCHIVE_BYTES = 788_355_579;
export const ZENODO_7240050_ARCHIVE_MD5
  = "md5:c67b6072ffc1ad5ae627fc464422d158";
export const ZENODO_7240050_LICENSE = "CC-BY-4.0";
export const ZENODO_7240050_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const ZENODO_7240050_SOURCE_SCHEMA
  = "outsider/zenodo-7240050-collision-pinned-source/v1";
export const ZENODO_7240050_INVENTORY_SCHEMA
  = "outsider/zenodo-7240050-zip-inventory/v1";
export const ZENODO_7240050_REPORT_SCHEMA
  = "outsider/zenodo-7240050-collision-experiment/v1";
export const ZENODO_7240050_RECEIPT_SCHEMA
  = "outsider/zenodo-7240050-collision-run-receipt/v1";

const RECORD_URL = `https://zenodo.org/api/records/${ZENODO_7240050_RECORD_ID}`;
const CONTENT_URL = `${RECORD_URL}/files/${ZENODO_7240050_ARCHIVE_NAME}/content`;
const RECORD_BYTES = 4_544;
const RECORD_SHA256
  = "sha256:11a06fe4a0f786e1aa45c47320f536ebb20adaf09f3330aeeb1ffc74b26953ff";
const FILE_ID = "49ff53da-8ef8-4e52-a6e1-b9a4eae639c1";
const TAIL_BYTES = 128 * 1024;
const TAIL_START = ZENODO_7240050_ARCHIVE_BYTES - TAIL_BYTES;
const TAIL_END = ZENODO_7240050_ARCHIVE_BYTES - 1;
const TAIL_SHA256
  = "sha256:c8b0c3d737b2638d55622b192b51cc66e15b2a6a6fd59d1c6732500f246135ea";
const CENTRAL_OFFSET = 788_343_392;
const CENTRAL_BYTES = 12_165;
const CENTRAL_SHA256
  = "sha256:7f1b11e4ceb883a86b38cce393de7183c73322d7f777f9eafc88e092fe647b4c";
const EOCD_OFFSET = 788_355_557;
const CENTRAL_ENTRIES = 98;
const CENTRAL_FILES = 84;
const CENTRAL_DIRECTORIES = 14;
const ARCHIVE_BAG_FILES = 80;
const ARCHIVE_RAW_BYTES = 4_050_857_321;
const ARCHIVE_COMPRESSED_BYTES = 788_336_323;
const FETCH_TIMEOUT_MS = 180_000;
const FETCH_ATTEMPTS = 3;
const RETRYABLE_STATUS = Object.freeze([408, 425, 429, 500, 502, 503, 504]);
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MD5 = /^[a-f0-9]{32}$/u;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;

const SELECTED = Object.freeze([
  Object.freeze({
    role: "EXPERIMENT_README",
    archivePath: "data/2022_08_03_calpak/README_1.docx",
    supportPath: "source-support/readme-1-local-range.bin",
    rawPath: "raw/README_1.docx",
    localHeaderOffset: 215_561_540,
    localRangeBytes: 15_312,
    flags: 0,
    compressionMethod: 8,
    crc32: "efbfe3f2",
    compressedSize: 15_246,
    uncompressedSize: 17_993,
    rangeSha256:
      "sha256:10de7b05eb80ab4baa566147054c42eb93d710108ccbfaac81798148dd90871a",
    rawSha256:
      "sha256:e3eed411b63a84348d902b5a13a0a0ad2f0bd5d289396a75c3ca17d05574288b",
  }),
  Object.freeze({
    role: "COLLISION_EXPERIMENT_ROS_BAG",
    archivePath: "data/2022_08_03_calpak/11.bag",
    supportPath: "source-support/bag-11-local-range.bin",
    rawPath: "raw/11.bag",
    localHeaderOffset: 67_637_933,
    localRangeBytes: 1_698_447,
    flags: 0,
    compressionMethod: 8,
    crc32: "989209b4",
    compressedSize: 1_698_388,
    uncompressedSize: 9_429_893,
    rangeSha256:
      "sha256:4051aee27b48b1d1578788cf9af98b371e1912c671439dd8d4284d6fc685f693",
    rawSha256:
      "sha256:2885ce60e1d730ff58669b4dd5727e85cc5b95361f71c5dbceb76735a411981b",
  }),
]);

const EXPECTED_TOPIC_COUNTS = Object.freeze({
  "/coll_det_ee/coll_detected": 1_403,
  "/coll_det_ee/force": 1_350,
  "/coll_det_ee/force_filt": 1_403,
  "/coll_det_jts/coll_detected": 3_488,
  "/coll_det_jts/force": 3_488,
  "/coll_det_jts/force_filt": 3_487,
  "/execute_trajectory/status": 34,
  "/external_ft_sensor": 6_169,
  "/impedance_gains": 1_433,
  "/io_states": 3_490,
  "/joint_states": 3_441,
  "/move_cartesianpath_action_server/arm/action/status": 35,
  "/move_group/monitored_planning_scene": 29,
  "/move_group/ompl/parameter_descriptions": 1,
  "/move_group/ompl/parameter_updates": 1,
  "/move_group/plan_execution/parameter_descriptions": 1,
  "/move_group/plan_execution/parameter_updates": 1,
  "/move_group/planning_scene_monitor/parameter_descriptions": 1,
  "/move_group/planning_scene_monitor/parameter_updates": 1,
  "/move_group/sense_for_plan/parameter_descriptions": 1,
  "/move_group/sense_for_plan/parameter_updates": 1,
  "/move_group/status": 37,
  "/move_group/trajectory_execution/parameter_descriptions": 1,
  "/move_group/trajectory_execution/parameter_updates": 1,
  "/move_tojoints_action_server/arm/action/status": 39,
  "/move_topose_action_server/arm/action/status": 35,
  "/pass_through_cartesian_trajectory_server/status": 39,
  "/pass_through_enable": 1,
  "/pass_through_joint_trajectory_server/status": 36,
  "/pickup/status": 38,
  "/place/status": 35,
  "/pos_joint_traj_controller/follow_joint_trajectory/status": 35,
  "/robot_state": 1_433,
  "/robot_status": 3_441,
  "/rosout": 1_628,
  "/rosout_agg": 1_605,
  "/sdr/helpers/topics/csv_data": 69,
  "/sensor_tracking_type": 3_489,
  "/tf": 3_809,
  "/tf_static": 1,
  "/tool_controller_pose": 3_490,
});

const EXPECTED_TYPE_COUNTS = Object.freeze({
  "actionlib_msgs/GoalStatusArray": 363,
  "calpak_msgs/CSVParser": 69,
  "comau_msgs/IOStates": 3_490,
  "comau_msgs/RobotStatus": 3_441,
  "dynamic_reconfigure/Config": 5,
  "dynamic_reconfigure/ConfigDescription": 5,
  "geometry_msgs/PoseStamped": 3_490,
  "moveit_msgs/PlanningScene": 29,
  "rosgraph_msgs/Log": 3_233,
  "sensor_msgs/JointState": 22_204,
  "std_msgs/Bool": 4_892,
  "std_msgs/Int32": 3_489,
  "tf2_msgs/TFMessage": 3_810,
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `ZENODO_7240050_${code}`
    : `ZENODO_7240050_${code}:${detail}`);
}

export function zenodo7240050Sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return zenodo7240050Sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`));
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

function safeJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function strictUtf8(bytes, code) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(code); }
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.startsWith("ZENODO_7240050_")) return "UNEXPECTED_ERROR";
  return message.slice("ZENODO_7240050_".length).split(":", 1)[0];
}

function exactKeys(value, keys) {
  return exactObject(value) && same(sorted(Object.keys(value)), sorted(keys));
}

function checkedZenodoUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "zenodo.org"
    || url.username !== "" || url.password !== "") fail("URL_INVALID", value);
  return url;
}

function pause(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function streamResponse(response, expectedBytes) {
  if (!response.body) fail("FETCH_BODY_MISSING");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared)
    || Number(declared) !== expectedBytes)) fail("FETCH_CONTENT_LENGTH_INVALID", declared);
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > expectedBytes) {
      await reader.cancel();
      fail("FETCH_STREAM_SIZE_INVALID");
    }
    chunks.push(Buffer.from(value));
  }
  if (total !== expectedBytes) fail("FETCH_BODY_SIZE_INVALID", String(total));
  return Buffer.concat(chunks, total);
}

async function fetchWithRetry(operation) {
  let last = null;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try { return await operation(attempt); }
    catch (error) {
      if (String(error?.message ?? error).startsWith("ZENODO_7240050_")
        && !String(error?.message ?? error).includes("TRANSIENT")) throw error;
      last = error;
      if (attempt === FETCH_ATTEMPTS - 1) break;
      await pause(attempt === 0 ? 1_000 : 4_000);
    }
  }
  fail("FETCH_RETRIES_EXHAUSTED", String(last?.message ?? last));
}

async function fetchRecord(fetchImpl) {
  const url = checkedZenodoUrl(RECORD_URL);
  return fetchWithRetry(async (attempt) => {
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: "error",
        headers: { accept: "application/json", "accept-encoding": "identity",
          "user-agent": "outsider-zenodo7240050-collision/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) { throw new Error(`TRANSIENT:${String(error?.message ?? error)}`); }
    if (RETRYABLE_STATUS.includes(response.status)) {
      if (response.body) await response.body.cancel();
      throw new Error(`TRANSIENT:HTTP_${response.status}:ATTEMPT_${attempt}`);
    }
    if (response.status !== 200 || response.headers.get("content-encoding") !== null
      || new URL(response.url || url).origin !== url.origin) {
      fail("RECORD_HTTP_INVALID", String(response.status));
    }
    const bytes = await streamResponse(response, RECORD_BYTES);
    if (zenodo7240050Sha256(bytes) !== RECORD_SHA256) fail("RECORD_BYTES_CHANGED");
    return { bytes, value: safeJson(bytes, "RECORD_JSON_INVALID") };
  });
}

async function fetchStrictRange(start, end, fetchImpl) {
  const url = checkedZenodoUrl(CONTENT_URL);
  const expectedBytes = end - start + 1;
  return fetchWithRetry(async (attempt) => {
    let response;
    try {
      response = await fetchImpl(url, {
        redirect: "error",
        headers: { range: `bytes=${start}-${end}`, "accept-encoding": "identity",
          "user-agent": "outsider-zenodo7240050-collision/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) { throw new Error(`TRANSIENT:${String(error?.message ?? error)}`); }
    if (RETRYABLE_STATUS.includes(response.status)) {
      if (response.body) await response.body.cancel();
      throw new Error(`TRANSIENT:HTTP_${response.status}:ATTEMPT_${attempt}`);
    }
    const expectedRange = `bytes ${start}-${end}/${ZENODO_7240050_ARCHIVE_BYTES}`;
    if (response.status !== 206 || response.headers.get("content-range") !== expectedRange
      || response.headers.get("content-encoding") !== null
      || new URL(response.url || url).origin !== url.origin) {
      fail("STRICT_RANGE_UNSUPPORTED",
        `${response.status}:${response.headers.get("content-range")}`);
    }
    const bytes = await streamResponse(response, expectedBytes);
    return Object.freeze({ bytes, start, end, contentRange: expectedRange,
      sizeBytes: expectedBytes, sha256: zenodo7240050Sha256(bytes) });
  });
}

function recordProjection(record) {
  const file = Array.isArray(record?.files) && record.files.length === 1
    ? record.files[0] : null;
  if (record?.id !== ZENODO_7240050_RECORD_ID || record?.conceptrecid !== "7235962"
    || record?.doi !== ZENODO_7240050_DOI || record?.revision !== 3
    || record?.status !== "published"
    || record?.created !== "2022-10-23T08:04:58.383934+00:00"
    || record?.updated !== "2022-10-23T14:26:24.479744+00:00"
    || record?.metadata?.title
      !== "High Payload Collaborative Robot - Joint States/Motor Current/TCP Force-Torque"
    || record?.metadata?.publication_date !== "2022-10-21"
    || record?.metadata?.version !== "1" || record?.metadata?.access_right !== "open"
    || record?.metadata?.license?.id !== "cc-by-4.0"
    || record?.metadata?.resource_type?.type !== "dataset"
    || file?.id !== FILE_ID || file?.key !== ZENODO_7240050_ARCHIVE_NAME
    || file?.size !== ZENODO_7240050_ARCHIVE_BYTES
    || file?.checksum !== ZENODO_7240050_ARCHIVE_MD5
    || file?.links?.self !== CONTENT_URL) fail("RECORD_PROFILE_CHANGED");
  const description = strictUtf8(Buffer.from(record.metadata.description),
    "RECORD_DESCRIPTION_UTF8_INVALID");
  for (const phrase of ["robot joint position", "motor currents", "robot tcp pose",
    "robot tcp Force torque", "external F/T sensor", "collision detection"]) {
    if (!description.includes(phrase)) fail("RECORD_DESCRIPTION_CHANGED", phrase);
  }
  return Object.freeze({
    recordId: ZENODO_7240050_RECORD_ID,
    conceptRecordId: 7_235_962,
    doi: ZENODO_7240050_DOI,
    title: record.metadata.title,
    publicationDate: "2022-10-21",
    created: record.created,
    updated: record.updated,
    revision: 3,
    version: "1",
    accessRight: "open",
    licenseClaim: ZENODO_7240050_LICENSE,
    archive: {
      id: FILE_ID,
      key: ZENODO_7240050_ARCHIVE_NAME,
      sizeBytes: ZENODO_7240050_ARCHIVE_BYTES,
      publisherMd5Claim: ZENODO_7240050_ARCHIVE_MD5,
      contentUrl: CONTENT_URL,
    },
  });
}

function findLastSignature(bytes, signature) {
  for (let offset = bytes.length - 4; offset >= 0; offset -= 1) {
    if (bytes.readUInt32LE(offset) === signature) return offset;
  }
  return -1;
}

function inspectTail(bytes) {
  if (bytes.length !== TAIL_BYTES || zenodo7240050Sha256(bytes) !== TAIL_SHA256) {
    fail("TAIL_BYTES_CHANGED");
  }
  const eocd = findLastSignature(bytes, ZIP_EOCD);
  if (eocd < 0 || TAIL_START + eocd !== EOCD_OFFSET || eocd + 22 !== bytes.length
    || bytes.readUInt16LE(eocd + 4) !== 0 || bytes.readUInt16LE(eocd + 6) !== 0
    || bytes.readUInt16LE(eocd + 8) !== CENTRAL_ENTRIES
    || bytes.readUInt16LE(eocd + 10) !== CENTRAL_ENTRIES
    || bytes.readUInt32LE(eocd + 12) !== CENTRAL_BYTES
    || bytes.readUInt32LE(eocd + 16) !== CENTRAL_OFFSET
    || bytes.readUInt16LE(eocd + 20) !== 0) fail("EOCD_INVALID");
  const relative = CENTRAL_OFFSET - TAIL_START;
  const central = bytes.subarray(relative, relative + CENTRAL_BYTES);
  if (central.length !== CENTRAL_BYTES
    || zenodo7240050Sha256(central) !== CENTRAL_SHA256) fail("CENTRAL_BYTES_CHANGED");
  return Object.freeze({ eocdOffset: EOCD_OFFSET, centralOffset: CENTRAL_OFFSET,
    centralBytes: CENTRAL_BYTES, centralSha256: CENTRAL_SHA256, central });
}

function parseCentralDirectory(bytes) {
  const entries = [];
  const names = new Set();
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== ZIP_CENTRAL) {
      fail("CENTRAL_RECORD_INVALID", String(offset));
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const compressionMethod = bytes.readUInt16LE(offset + 10);
    const crc32 = bytes.readUInt32LE(offset + 16).toString(16).padStart(8, "0");
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameBytes = bytes.readUInt16LE(offset + 28);
    const extraBytes = bytes.readUInt16LE(offset + 30);
    const commentBytes = bytes.readUInt16LE(offset + 32);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const next = offset + 46 + nameBytes + extraBytes + commentBytes;
    if (next > bytes.length) fail("CENTRAL_RECORD_TRUNCATED");
    const archivePath = strictUtf8(bytes.subarray(offset + 46, offset + 46 + nameBytes),
      "CENTRAL_PATH_UTF8_INVALID");
    if (archivePath === "" || archivePath.startsWith("/") || archivePath.includes("\\")
      || archivePath.includes("\0")
      || archivePath.split("/").includes("..") || names.has(archivePath)) {
      fail("CENTRAL_PATH_INVALID", archivePath);
    }
    names.add(archivePath);
    entries.push(Object.freeze({ archivePath, directory: archivePath.endsWith("/"),
      flags, compressionMethod, crc32, compressedSize, uncompressedSize,
      localHeaderOffset }));
    offset = next;
  }
  if (offset !== bytes.length || entries.length !== CENTRAL_ENTRIES) {
    fail("CENTRAL_COUNT_INVALID");
  }
  return Object.freeze(entries);
}

function buildInventory(entries, tail) {
  const files = entries.filter((entry) => !entry.directory);
  const directories = entries.filter((entry) => entry.directory);
  const groups = new Map();
  for (const entry of files) {
    const group = entry.archivePath.split("/")[1] ?? null;
    groups.set(group, (groups.get(group) ?? 0) + 1);
  }
  const selectedEntries = SELECTED.map((specification) => {
    const entry = entries.find((value) => value.archivePath === specification.archivePath);
    if (!entry || entry.directory || entry.flags !== specification.flags
      || entry.compressionMethod !== specification.compressionMethod
      || entry.crc32 !== specification.crc32
      || entry.compressedSize !== specification.compressedSize
      || entry.uncompressedSize !== specification.uncompressedSize
      || entry.localHeaderOffset !== specification.localHeaderOffset) {
      fail("SELECTED_CENTRAL_ENTRY_CHANGED", specification.role);
    }
    return { role: specification.role, ...entry };
  });
  const counts = {
    entries: entries.length,
    files: files.length,
    directories: directories.length,
    rosBagFiles: files.filter((entry) => entry.archivePath.endsWith(".bag")).length,
    textReadmes: files.filter((entry) => entry.archivePath.endsWith(".txt")).length,
    docxReadmes: files.filter((entry) => entry.archivePath.endsWith(".docx")).length,
    totalCompressedFileBytes: files.reduce((sum, entry) => sum + entry.compressedSize, 0),
    totalUncompressedFileBytes: files.reduce((sum, entry) => sum + entry.uncompressedSize, 0),
  };
  if (!same(counts, { entries: CENTRAL_ENTRIES, files: CENTRAL_FILES,
    directories: CENTRAL_DIRECTORIES, rosBagFiles: ARCHIVE_BAG_FILES,
    textReadmes: 2, docxReadmes: 2,
    totalCompressedFileBytes: ARCHIVE_COMPRESSED_BYTES,
    totalUncompressedFileBytes: ARCHIVE_RAW_BYTES })) fail("INVENTORY_COUNTS_CHANGED");
  const groupFileCounts = [...groups].sort(([left], [right]) => left.localeCompare(right))
    .map(([group, fileCount]) => ({ group, fileCount }));
  if (!same(groupFileCounts, [
    { group: "2022_01_25_LMS", fileCount: 5 },
    { group: "2022_02_10_LMS", fileCount: 21 },
    { group: "2022_08_03_calpak", fileCount: 19 },
    { group: "2022_08_04_calpak", fileCount: 39 },
  ])) fail("INVENTORY_GROUPS_CHANGED");
  const body = {
    schema: ZENODO_7240050_INVENTORY_SCHEMA,
    parentArchive: { name: ZENODO_7240050_ARCHIVE_NAME,
      sizeBytes: ZENODO_7240050_ARCHIVE_BYTES,
      publisherMd5Claim: ZENODO_7240050_ARCHIVE_MD5 },
    centralDirectory: { offset: tail.centralOffset, sizeBytes: tail.centralBytes,
      sha256: tail.centralSha256, entries: CENTRAL_ENTRIES,
      completeCentralDirectoryReplayed: true },
    counts,
    groupFileCounts,
    entries,
    selectionPolicy: {
      policy: "SMALLEST_README_MAPPED_COMPLETE_COLLISION_EXPERIMENT_IN_SESSION_1",
      sessionReadmeExperimentRows: 17,
      selectedExperimentRow: 11,
      selectedBagIsSmallestCompressedBagInMappedSession: true,
      selectedEntriesFormCompleteClosure: true,
      fullParentArchiveDownloaded: false,
    },
    selectedEntries,
  };
  return Object.freeze({ ...body,
    inventoryHash: digest(`${ZENODO_7240050_INVENTORY_SCHEMA}/inventory`, body) });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32Hex(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

function extractSelectedLocalRange(rangeBytes, specification, centralEntry) {
  if (rangeBytes.length !== specification.localRangeBytes
    || zenodo7240050Sha256(rangeBytes) !== specification.rangeSha256
    || rangeBytes.readUInt32LE(0) !== ZIP_LOCAL
    || rangeBytes.readUInt16LE(4) !== 20
    || rangeBytes.readUInt16LE(6) !== specification.flags
    || rangeBytes.readUInt16LE(8) !== specification.compressionMethod
    || rangeBytes.readUInt32LE(14).toString(16).padStart(8, "0") !== specification.crc32
    || rangeBytes.readUInt32LE(18) !== specification.compressedSize
    || rangeBytes.readUInt32LE(22) !== specification.uncompressedSize) {
    fail("SELECTED_LOCAL_HEADER_CHANGED", specification.role);
  }
  const nameBytes = rangeBytes.readUInt16LE(26);
  const extraBytes = rangeBytes.readUInt16LE(28);
  const dataStart = 30 + nameBytes + extraBytes;
  const archivePath = strictUtf8(rangeBytes.subarray(30, 30 + nameBytes),
    "SELECTED_LOCAL_PATH_UTF8_INVALID");
  if (archivePath !== specification.archivePath || extraBytes !== 0
    || dataStart + specification.compressedSize !== rangeBytes.length
    || centralEntry.archivePath !== archivePath) fail("SELECTED_LOCAL_RANGE_INVALID");
  const compressed = rangeBytes.subarray(dataStart);
  const raw = specification.compressionMethod === 8 ? inflateRawSync(compressed) : compressed;
  if (raw.length !== specification.uncompressedSize || crc32Hex(raw) !== specification.crc32
    || zenodo7240050Sha256(raw) !== specification.rawSha256) {
    fail("SELECTED_RAW_REPLAY_FAILED", specification.role);
  }
  return raw;
}

function parseNestedZipMember(bytes, memberPath) {
  const eocd = findLastSignature(bytes, ZIP_EOCD);
  if (eocd < 0 || eocd + 22 > bytes.length) fail("DOCX_EOCD_INVALID");
  const count = bytes.readUInt16LE(eocd + 10);
  const centralBytes = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (eocd + 22 + bytes.readUInt16LE(eocd + 20) !== bytes.length
    || centralOffset + centralBytes !== eocd || count !== 12) fail("DOCX_ZIP_PROFILE_CHANGED");
  const entries = parseCentralDirectoryGeneric(bytes.subarray(centralOffset,
    centralOffset + centralBytes), count);
  const entry = entries.find((value) => value.archivePath === memberPath);
  if (!entry) fail("DOCX_MEMBER_MISSING", memberPath);
  const offset = entry.localHeaderOffset;
  if (bytes.readUInt32LE(offset) !== ZIP_LOCAL) fail("DOCX_LOCAL_HEADER_INVALID");
  const nameBytes = bytes.readUInt16LE(offset + 26);
  const extraBytes = bytes.readUInt16LE(offset + 28);
  const name = strictUtf8(bytes.subarray(offset + 30, offset + 30 + nameBytes),
    "DOCX_MEMBER_PATH_UTF8_INVALID");
  const start = offset + 30 + nameBytes + extraBytes;
  const compressed = bytes.subarray(start, start + entry.compressedSize);
  const raw = entry.compressionMethod === 8 ? inflateRawSync(compressed) : compressed;
  if (name !== memberPath || raw.length !== entry.uncompressedSize
    || crc32Hex(raw) !== entry.crc32) fail("DOCX_MEMBER_REPLAY_INVALID", memberPath);
  return { raw, entryCount: entries.length };
}

function parseCentralDirectoryGeneric(bytes, expectedCount) {
  const entries = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== ZIP_CENTRAL) {
      fail("NESTED_CENTRAL_INVALID");
    }
    const nameBytes = bytes.readUInt16LE(offset + 28);
    const extraBytes = bytes.readUInt16LE(offset + 30);
    const commentBytes = bytes.readUInt16LE(offset + 32);
    const archivePath = strictUtf8(bytes.subarray(offset + 46, offset + 46 + nameBytes),
      "NESTED_CENTRAL_PATH_INVALID");
    entries.push({ archivePath, compressionMethod: bytes.readUInt16LE(offset + 10),
      crc32: bytes.readUInt32LE(offset + 16).toString(16).padStart(8, "0"),
      compressedSize: bytes.readUInt32LE(offset + 20),
      uncompressedSize: bytes.readUInt32LE(offset + 24),
      localHeaderOffset: bytes.readUInt32LE(offset + 42) });
    offset += 46 + nameBytes + extraBytes + commentBytes;
  }
  if (offset !== bytes.length || entries.length !== expectedCount) fail("NESTED_CENTRAL_COUNT_INVALID");
  return entries;
}

function xmlDecode(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"").replaceAll("&apos;", "'")
    .replaceAll("&amp;", "&").replace(/&#(\d+);/gu,
      (_match, decimal) => String.fromCodePoint(Number(decimal)))
    .replace(/&#x([a-f0-9]+);/giu,
      (_match, hex) => String.fromCodePoint(Number.parseInt(hex, 16)));
}

function parseReadme(bytes) {
  const document = parseNestedZipMember(bytes, "word/document.xml");
  if (document.raw.length !== 88_259
    || zenodo7240050Sha256(document.raw)
      !== "sha256:63084f85a3d7f5f9fbf5150e9378157a4f31631d2f9f50462b7b255c9655d1ab") {
    fail("README_DOCUMENT_XML_CHANGED");
  }
  const xml = strictUtf8(document.raw, "README_DOCUMENT_XML_UTF8_INVALID");
  const paragraphs = [];
  for (const paragraph of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/gu)) {
    let value = "";
    for (const text of paragraph[1].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/gu)) {
      value += xmlDecode(text[1]);
    }
    if (value.trim() !== "") paragraphs.push(value.trim());
  }
  const header = ["Name", "Speed overide", "Sensor pads for stiffness measurement",
    "robot extension", "orientation", "peak force", "Panel"];
  const start = paragraphs.findIndex((value, index) => value === "Name"
    && same(paragraphs.slice(index, index + header.length), header));
  if (start < 0) fail("README_TABLE_HEADER_CHANGED");
  const rows = [];
  for (let row = 0; row < 17; row += 1) {
    const values = paragraphs.slice(start + header.length + row * 7,
      start + header.length + (row + 1) * 7);
    if (values.length !== 7 || values[0] !== String(row + 1)) fail("README_TABLE_ROW_CHANGED");
    rows.push({ experimentNumber: Number(values[0]), speedOverridePercent: Number(values[1]),
      sensorPads: values[2], robotExtension: values[3], orientation: values[4],
      publisherPeakForceClaim: Number(values[5]), panel: values[6] });
  }
  const selected = rows[10];
  if (!same(selected, { experimentNumber: 11, speedOverridePercent: 100,
    sensorPads: "bbp", robotExtension: "long", orientation: "vertical",
    publisherPeakForceClaim: 526, panel: "no" })) fail("README_SELECTION_CHANGED");
  const topicsAt = start + header.length + 17 * 7;
  if (paragraphs[topicsAt] !== "Topics:") fail("README_TOPICS_MARKER_CHANGED");
  const topics = paragraphs.slice(topicsAt + 1).map((value) =>
    value === "coll_det_jts/coll_detected" ? `/${value}` : value);
  const expectedTopics = [
    "/coll_det_ee/coll_detected", "/coll_det_ee/force", "/coll_det_ee/force_filt",
    "/coll_det_jts/coll_detected", "/coll_det_jts/force", "/coll_det_jts/force_filt",
    "/execute_trajectory/status", "/external_ft_sensor", "/impedance_gains",
    "/io_states", "/joint_states", "/robot_state", "/robot_status", "/tf",
    "/tf_static", "/tool_controller_pose",
  ];
  if (!same(topics, expectedTopics)
    || paragraphs[0] !== "22_08_03_Session_1_CALPAK/1:17.bag"
    || !paragraphs.some((value) => value.includes("External F/T sensor"))
    || !paragraphs.some((value) => value.includes("1.5 seconds deceleration"))
    || !paragraphs.some((value) => value.includes("100% override is 250 mm/sec"))) {
    fail("README_SEMANTICS_CHANGED");
  }
  return Object.freeze({ docxEntries: document.entryCount,
    documentXmlBytes: document.raw.length,
    documentXmlSha256: zenodo7240050Sha256(document.raw),
    experimentRows: rows.length, selectedExperiment: selected,
    categoryClaim: "CATEGORY_1_1_5_SECOND_DECELERATION",
    maximumOverrideClaimMillimetersPerSecond: 250,
    peakForceUnitDeclared: false,
    describedTopics: topics });
}

function parseRosFields(bytes, code) {
  const fields = new Map();
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 4 > bytes.length) fail(code);
    const size = bytes.readUInt32LE(offset);
    offset += 4;
    if (size < 3 || offset + size > bytes.length) fail(code);
    const field = bytes.subarray(offset, offset + size);
    offset += size;
    const equals = field.indexOf(0x3d);
    if (equals < 1) fail(code);
    const key = strictUtf8(field.subarray(0, equals), code);
    if (fields.has(key)) fail(code);
    fields.set(key, field.subarray(equals + 1));
  }
  return fields;
}

function walkRosRecords(bytes, start, callback, code) {
  let offset = start;
  let count = 0;
  while (offset < bytes.length) {
    const recordOffset = offset;
    if (offset + 4 > bytes.length) fail(code);
    const headerBytes = bytes.readUInt32LE(offset);
    offset += 4;
    if (offset + headerBytes + 4 > bytes.length) fail(code);
    const header = parseRosFields(bytes.subarray(offset, offset + headerBytes), code);
    offset += headerBytes;
    const dataBytes = bytes.readUInt32LE(offset);
    offset += 4;
    if (offset + dataBytes > bytes.length) fail(code);
    const data = bytes.subarray(offset, offset + dataBytes);
    offset += dataBytes;
    callback({ recordOffset, header, data, endOffset: offset });
    count += 1;
  }
  if (offset !== bytes.length) fail(code);
  return count;
}

function requiredField(fields, key, bytes, code) {
  const value = fields.get(key);
  if (!value || value.length !== bytes) fail(code);
  return value;
}

function fieldU32(fields, key, code) {
  return requiredField(fields, key, 4, code).readUInt32LE(0);
}

function fieldU64(fields, key, code) {
  const value = requiredField(fields, key, 8, code);
  const bigint = value.readBigUInt64LE(0);
  if (bigint > BigInt(Number.MAX_SAFE_INTEGER)) fail(code);
  return Number(bigint);
}

function fieldText(fields, key, code) {
  const value = fields.get(key);
  if (!value) fail(code);
  return strictUtf8(value, code);
}

function fieldOp(fields, code) {
  return requiredField(fields, "op", 1, code)[0];
}

function stampString(bytes) {
  if (bytes.length !== 8) fail("ROS_TIME_INVALID");
  return `${bytes.readUInt32LE(0)}.${String(bytes.readUInt32LE(4)).padStart(9, "0")}`;
}

function stampNanoseconds(value) {
  const [seconds, nanos] = value.split(".");
  return BigInt(seconds) * 1_000_000_000n + BigInt(nanos);
}

function parseConnection(header, data) {
  const connectionId = fieldU32(header, "conn", "ROS_CONNECTION_INVALID");
  const topic = fieldText(header, "topic", "ROS_CONNECTION_INVALID");
  const metadata = parseRosFields(data, "ROS_CONNECTION_METADATA_INVALID");
  const metadataTopic = fieldText(metadata, "topic", "ROS_CONNECTION_METADATA_INVALID");
  const type = fieldText(metadata, "type", "ROS_CONNECTION_METADATA_INVALID");
  const md5sum = fieldText(metadata, "md5sum", "ROS_CONNECTION_METADATA_INVALID");
  const definition = metadata.get("message_definition");
  if (metadataTopic !== topic || !MD5.test(md5sum) || !definition) {
    fail("ROS_CONNECTION_METADATA_INVALID");
  }
  return Object.freeze({ connectionId, topic, type, md5sum,
    messageDefinitionSha256: zenodo7240050Sha256(definition),
    connectionRecordHash: digest("outsider/rosbag-connection/v1", {
      connectionId, topic, type, md5sum,
      messageDefinitionSha256: zenodo7240050Sha256(definition),
    }) });
}

function readRosString(bytes, state, code) {
  if (state.offset + 4 > bytes.length) fail(code);
  const size = bytes.readUInt32LE(state.offset);
  state.offset += 4;
  if (state.offset + size > bytes.length) fail(code);
  const value = strictUtf8(bytes.subarray(state.offset, state.offset + size), code);
  state.offset += size;
  return value;
}

function readRosStringArray(bytes, state, code) {
  if (state.offset + 4 > bytes.length) fail(code);
  const count = bytes.readUInt32LE(state.offset);
  state.offset += 4;
  if (count > 128) fail(code);
  const values = [];
  for (let index = 0; index < count; index += 1) values.push(readRosString(bytes, state, code));
  return values;
}

function readRosFloat64Array(bytes, state, code) {
  if (state.offset + 4 > bytes.length) fail(code);
  const count = bytes.readUInt32LE(state.offset);
  state.offset += 4;
  if (count > 256 || state.offset + count * 8 > bytes.length) fail(code);
  const values = [];
  for (let index = 0; index < count; index += 1) {
    const value = bytes.readDoubleLE(state.offset);
    state.offset += 8;
    if (!Number.isFinite(value)) fail(code);
    values.push(value);
  }
  return values;
}

function parseJointState(bytes) {
  const state = { offset: 0 };
  if (bytes.length < 16) fail("ROS_JOINT_STATE_INVALID");
  const sequence = bytes.readUInt32LE(state.offset);
  state.offset += 4;
  const stamp = stampString(bytes.subarray(state.offset, state.offset + 8));
  state.offset += 8;
  const frameId = readRosString(bytes, state, "ROS_JOINT_STATE_INVALID");
  const names = readRosStringArray(bytes, state, "ROS_JOINT_STATE_INVALID");
  const position = readRosFloat64Array(bytes, state, "ROS_JOINT_STATE_INVALID");
  const velocity = readRosFloat64Array(bytes, state, "ROS_JOINT_STATE_INVALID");
  const effort = readRosFloat64Array(bytes, state, "ROS_JOINT_STATE_INVALID");
  if (state.offset !== bytes.length) fail("ROS_JOINT_STATE_INVALID");
  return { sequence, stamp, frameId, names, position, velocity, effort };
}

function summarizeJointStates(messages) {
  const shapes = new Map();
  const names = new Map();
  const frames = new Map();
  const arrays = {
    position: { values: 0, minimum: null, maximum: null },
    velocity: { values: 0, minimum: null, maximum: null },
    effort: { values: 0, minimum: null, maximum: null },
  };
  let embeddedMinimum = null;
  let embeddedMaximum = null;
  for (const message of messages) {
    const parsed = parseJointState(message.data);
    const shape = `${parsed.names.length}/${parsed.position.length}/${parsed.velocity.length}/${parsed.effort.length}`;
    shapes.set(shape, (shapes.get(shape) ?? 0) + 1);
    const nameKey = canonicalizeStrict(parsed.names);
    names.set(nameKey, { names: parsed.names, messages: (names.get(nameKey)?.messages ?? 0) + 1 });
    frames.set(parsed.frameId, (frames.get(parsed.frameId) ?? 0) + 1);
    if (embeddedMinimum === null || parsed.stamp < embeddedMinimum) embeddedMinimum = parsed.stamp;
    if (embeddedMaximum === null || parsed.stamp > embeddedMaximum) embeddedMaximum = parsed.stamp;
    for (const key of ["position", "velocity", "effort"]) {
      for (const value of parsed[key]) {
        arrays[key].values += 1;
        arrays[key].minimum = arrays[key].minimum === null ? value
          : Math.min(arrays[key].minimum, value);
        arrays[key].maximum = arrays[key].maximum === null ? value
          : Math.max(arrays[key].maximum, value);
      }
    }
  }
  return Object.freeze({ messages: messages.length,
    shapes: [...shapes].sort(([left], [right]) => left.localeCompare(right))
      .map(([shape, count]) => {
        const [nameCount, positionCount, velocityCount, effortCount]
          = shape.split("/").map(Number);
        return { nameCount, positionCount, velocityCount, effortCount, messages: count };
      }),
    nameVectors: [...names.values()].sort((left, right) =>
      canonicalizeStrict(left.names).localeCompare(canonicalizeStrict(right.names))),
    frameIds: [...frames].sort(([left], [right]) => left.localeCompare(right))
      .map(([frameId, count]) => ({ frameId, messages: count })),
    numericArrays: arrays,
    embeddedHeaderTimeRange: { first: embeddedMinimum, last: embeddedMaximum },
    rosRecordTimeRange: { first: messages[0].stamp,
      last: messages[messages.length - 1].stamp } });
}

function summarizeBool(messages) {
  let trueMessages = 0;
  let falseMessages = 0;
  let firstTrue = null;
  for (const message of messages) {
    if (message.data.length !== 1 || ![0, 1].includes(message.data[0])) {
      fail("ROS_BOOL_PAYLOAD_INVALID");
    }
    if (message.data[0] === 1) {
      trueMessages += 1;
      if (firstTrue === null) firstTrue = message.stamp;
    } else falseMessages += 1;
  }
  return Object.freeze({ messages: messages.length, falseMessages, trueMessages, firstTrue });
}

function buildRosBagSummary(bytes) {
  if (bytes.length !== SELECTED[1].uncompressedSize
    || zenodo7240050Sha256(bytes) !== SELECTED[1].rawSha256
    || !bytes.subarray(0, 13).equals(Buffer.from("#ROSBAG V2.0\n", "ascii"))) {
    fail("ROS_BAG_BYTES_INVALID");
  }
  const topOps = new Map();
  const innerOps = new Map();
  const innerConnections = new Map();
  const topConnections = new Map();
  const messages = new Map();
  const indexCounts = new Map();
  const chunkInfoCounts = new Map();
  let bagHeader = null;
  let chunkRawBytes = 0;
  let chunkCount = 0;
  walkRosRecords(bytes, 13, (record) => {
    const op = fieldOp(record.header, "ROS_TOP_RECORD_INVALID");
    topOps.set(op, (topOps.get(op) ?? 0) + 1);
    if (op === 3) {
      if (bagHeader !== null) fail("ROS_BAG_HEADER_DUPLICATE");
      bagHeader = { chunkCount: fieldU32(record.header, "chunk_count", "ROS_BAG_HEADER_INVALID"),
        connectionCount: fieldU32(record.header, "conn_count", "ROS_BAG_HEADER_INVALID"),
        indexPosition: fieldU64(record.header, "index_pos", "ROS_BAG_HEADER_INVALID"),
        paddingBytes: record.data.length };
    } else if (op === 5) {
      const compression = fieldText(record.header, "compression", "ROS_CHUNK_INVALID");
      const rawSize = fieldU32(record.header, "size", "ROS_CHUNK_INVALID");
      if (compression !== "none" || rawSize !== record.data.length) fail("ROS_CHUNK_INVALID");
      chunkCount += 1;
      chunkRawBytes += record.data.length;
      walkRosRecords(record.data, 0, (inner) => {
        const innerOp = fieldOp(inner.header, "ROS_INNER_RECORD_INVALID");
        innerOps.set(innerOp, (innerOps.get(innerOp) ?? 0) + 1);
        if (innerOp === 7) {
          const connection = parseConnection(inner.header, inner.data);
          if (innerConnections.has(connection.connectionId)) fail("ROS_INNER_CONNECTION_DUPLICATE");
          innerConnections.set(connection.connectionId, connection);
        } else if (innerOp === 2) {
          const connectionId = fieldU32(inner.header, "conn", "ROS_MESSAGE_INVALID");
          const stamp = stampString(requiredField(inner.header, "time", 8,
            "ROS_MESSAGE_INVALID"));
          if (!messages.has(connectionId)) messages.set(connectionId, []);
          messages.get(connectionId).push({ stamp, data: inner.data });
        } else fail("ROS_INNER_OP_UNEXPECTED", String(innerOp));
      }, "ROS_CHUNK_RECORD_SEQUENCE_INVALID");
    } else if (op === 4) {
      const connectionId = fieldU32(record.header, "conn", "ROS_INDEX_INVALID");
      const count = fieldU32(record.header, "count", "ROS_INDEX_INVALID");
      if (record.data.length !== count * 12) fail("ROS_INDEX_INVALID");
      indexCounts.set(connectionId, (indexCounts.get(connectionId) ?? 0) + count);
    } else if (op === 6) {
      const count = fieldU32(record.header, "count", "ROS_CHUNK_INFO_INVALID");
      if (record.data.length !== count * 8) fail("ROS_CHUNK_INFO_INVALID");
      for (let offset = 0; offset < record.data.length; offset += 8) {
        const connectionId = record.data.readUInt32LE(offset);
        const messagesInChunk = record.data.readUInt32LE(offset + 4);
        chunkInfoCounts.set(connectionId,
          (chunkInfoCounts.get(connectionId) ?? 0) + messagesInChunk);
      }
    } else if (op === 7) {
      const connection = parseConnection(record.header, record.data);
      if (topConnections.has(connection.connectionId)) fail("ROS_TOP_CONNECTION_DUPLICATE");
      topConnections.set(connection.connectionId, connection);
    } else fail("ROS_TOP_OP_UNEXPECTED", String(op));
  }, "ROS_TOP_RECORD_SEQUENCE_INVALID");

  const opProjection = (values) => [...values].sort(([left], [right]) => left - right)
    .map(([op, count]) => ({ op, count }));
  if (!same(bagHeader, { chunkCount: 12, connectionCount: 49,
    indexPosition: 9_323_794, paddingBytes: 4_027 })
    || chunkCount !== 12 || chunkRawBytes !== 8_716_664
    || !same(opProjection(topOps), [
      { op: 3, count: 1 }, { op: 4, count: 367 }, { op: 5, count: 12 },
      { op: 6, count: 12 }, { op: 7, count: 49 },
    ]) || !same(opProjection(innerOps), [{ op: 2, count: 48_520 },
      { op: 7, count: 49 }]) || topConnections.size !== 49
    || innerConnections.size !== 49) fail("ROS_BAG_STRUCTURE_CHANGED");

  const connections = [];
  const topicCounts = new Map();
  const typeCounts = new Map();
  for (const [connectionId, connection] of [...topConnections].sort(([left], [right]) => left - right)) {
    if (!same(connection, innerConnections.get(connectionId))) {
      fail("ROS_CONNECTION_INDEX_MISMATCH", String(connectionId));
    }
    const connectionMessages = messages.get(connectionId) ?? [];
    if (indexCounts.get(connectionId) !== connectionMessages.length
      || chunkInfoCounts.get(connectionId) !== connectionMessages.length) {
      fail("ROS_MESSAGE_INDEX_MISMATCH", String(connectionId));
    }
    topicCounts.set(connection.topic,
      (topicCounts.get(connection.topic) ?? 0) + connectionMessages.length);
    typeCounts.set(connection.type,
      (typeCounts.get(connection.type) ?? 0) + connectionMessages.length);
    connections.push({ ...connection, messageCount: connectionMessages.length });
  }
  const topicObject = Object.fromEntries([...topicCounts].sort(([left], [right]) =>
    left.localeCompare(right)));
  const typeObject = Object.fromEntries([...typeCounts].sort(([left], [right]) =>
    left.localeCompare(right)));
  if (!same(topicObject, EXPECTED_TOPIC_COUNTS) || !same(typeObject, EXPECTED_TYPE_COUNTS)
    || [...messages.values()].reduce((sum, values) => sum + values.length, 0) !== 48_520) {
    fail("ROS_MESSAGE_COUNTS_CHANGED");
  }
  const byTopic = (topic) => connections.filter((entry) => entry.topic === topic)
    .flatMap((entry) => messages.get(entry.connectionId) ?? [])
    .sort((left, right) => left.stamp.localeCompare(right.stamp));
  const externalFt = summarizeJointStates(byTopic("/external_ft_sensor"));
  const jointStates = summarizeJointStates(byTopic("/joint_states"));
  const robotState = summarizeJointStates(byTopic("/robot_state"));
  const eeDetected = summarizeBool(byTopic("/coll_det_ee/coll_detected"));
  const jointsDetected = summarizeBool(byTopic("/coll_det_jts/coll_detected"));
  const allStamps = [...messages.values()].flatMap((values) => values.map((value) => value.stamp))
    .sort();
  const durationNanoseconds = Number(stampNanoseconds(allStamps.at(-1))
    - stampNanoseconds(allStamps[0]));
  const imageTopics = connections.filter((entry) => /(?:^|\/)(?:image|camera)/iu.test(entry.topic)
    || /(?:Image|CompressedImage)$/u.test(entry.type)).map((entry) => entry.topic);
  if (!same(externalFt.shapes,
    [{ nameCount: 0, positionCount: 6, velocityCount: 12, effortCount: 6, messages: 6_169 }])) {
    fail("ROS_EXTERNAL_FT_SHAPE_CHANGED", canonicalizeStrict(externalFt.shapes));
  }
  if (externalFt.numericArrays.effort.minimum !== -98.65007781982422
    || externalFt.numericArrays.effort.maximum !== 526.8031387329102) {
    fail("ROS_EXTERNAL_FT_RANGE_CHANGED",
      canonicalizeStrict(externalFt.numericArrays.effort));
  }
  if (!same(jointStates.shapes,
    [{ nameCount: 6, positionCount: 6, velocityCount: 6, effortCount: 6, messages: 3_441 }])
    || !same(jointStates.nameVectors,
      [{ names: ["joint_1", "joint_2", "joint_3", "joint_4", "joint_5", "joint_6"],
        messages: 3_441 }])) fail("ROS_JOINT_STATE_PROFILE_CHANGED");
  if (!same(eeDetected, { messages: 1_403, falseMessages: 1_139,
    trueMessages: 264, firstTrue: "1659533286.019723218" })) {
    fail("ROS_EE_DETECTION_CHANGED", canonicalizeStrict(eeDetected));
  }
  if (!same(jointsDetected, { messages: 3_488, falseMessages: 2_723,
    trueMessages: 765, firstTrue: "1659533285.403377434" })) {
    fail("ROS_JOINT_DETECTION_CHANGED", canonicalizeStrict(jointsDetected));
  }
  if (allStamps[0] !== "1659533284.202274563"
    || allStamps.at(-1) !== "1659533290.993672268"
    || durationNanoseconds !== 6_791_397_705) {
    fail("ROS_TIME_ENVELOPE_CHANGED", canonicalizeStrict({
      first: allStamps[0], last: allStamps.at(-1), durationNanoseconds }));
  }
  if (imageTopics.length !== 0) fail("ROS_IMAGE_TOPICS_CHANGED", canonicalizeStrict(imageTopics));
  return Object.freeze({
    rosbagVersion: "2.0",
    bagHeader,
    topLevelRecordCounts: opProjection(topOps),
    chunkRecordCounts: opProjection(innerOps),
    uncompressedChunkBytes: chunkRawBytes,
    connectionCount: connections.length,
    uniqueTopicCount: Object.keys(topicObject).length,
    messageTypeCount: Object.keys(typeObject).length,
    messageCount: 48_520,
    recordTimeRange: { first: allStamps[0], last: allStamps.at(-1), durationNanoseconds },
    topicMessageCounts: topicObject,
    typeMessageCounts: typeObject,
    connectionInventory: connections,
    selectedStreams: { externalFt, jointStates, robotState,
      endEffectorCollisionDetected: eeDetected,
      jointCollisionDetected: jointsDetected,
      toolControllerPoseMessages: topicObject["/tool_controller_pose"] },
    imageTopics,
    rosgraphLogMessages: typeObject["rosgraph_msgs/Log"],
  });
}

function privateWrite(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function mkdirPrivate(directory) {
  mkdirSync(directory, { mode: 0o700 });
  chmodSync(directory, 0o700);
}

function binding(pathname, bytes) {
  return { path: pathname, sizeBytes: bytes.length, sha256: zenodo7240050Sha256(bytes) };
}

function sourceRootFromBindings(bindings) {
  return digest(`${ZENODO_7240050_SOURCE_SCHEMA}/source-root`,
    [...bindings].sort((left, right) => left.path.localeCompare(right.path)));
}

function rangeProjection(range) {
  return { start: range.start, end: range.end, contentRange: range.contentRange,
    sizeBytes: range.sizeBytes, sha256: range.sha256 };
}

export async function acquirePinnedZenodo7240050CollisionSource(outputDirectory, {
  fetchImpl = globalThis.fetch,
  onProgress = () => {},
} = {}) {
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_INVALID");
  const root = path.resolve(outputDirectory);
  if (existsSync(root)) fail("SOURCE_TARGET_EXISTS", root);
  mkdirPrivate(root);
  mkdirPrivate(path.join(root, "raw"));
  mkdirPrivate(path.join(root, "source-support"));
  try {
    onProgress({ phase: "RECORD_BEFORE" });
    const before = await fetchRecord(fetchImpl);
    const beforeProjection = recordProjection(before.value);
    privateWrite(path.join(root, "source-support", "record-before.json"), before.bytes);
    onProgress({ phase: "COMPLETE_CENTRAL_DIRECTORY_RANGE" });
    const tail = await fetchStrictRange(TAIL_START, TAIL_END, fetchImpl);
    if (tail.sha256 !== TAIL_SHA256) fail("TAIL_BYTES_CHANGED");
    privateWrite(path.join(root, "source-support", "archive-tail.range"), tail.bytes);
    const tailInspection = inspectTail(tail.bytes);
    const entries = parseCentralDirectory(tailInspection.central);
    const inventory = buildInventory(entries, tailInspection);
    const inventoryBytes = canonicalBytes(inventory);
    privateWrite(path.join(root, "archive-inventory.json"), inventoryBytes);
    const selectedRanges = [];
    const rawBindings = [];
    for (const specification of SELECTED) {
      onProgress({ phase: "SELECTED_ENTRY_RANGE", role: specification.role });
      const end = specification.localHeaderOffset + specification.localRangeBytes - 1;
      const range = await fetchStrictRange(specification.localHeaderOffset, end, fetchImpl);
      if (range.sha256 !== specification.rangeSha256) {
        fail("SELECTED_RANGE_BYTES_CHANGED", specification.role);
      }
      const centralEntry = entries.find((entry) => entry.archivePath === specification.archivePath);
      const raw = extractSelectedLocalRange(range.bytes, specification, centralEntry);
      privateWrite(path.join(root, specification.supportPath), range.bytes);
      privateWrite(path.join(root, specification.rawPath), raw);
      selectedRanges.push({ role: specification.role, archivePath: specification.archivePath,
        localHeaderOffset: specification.localHeaderOffset,
        localRangeBytes: specification.localRangeBytes,
        supportPath: specification.supportPath, rawPath: specification.rawPath,
        range: rangeProjection(range), raw: binding(specification.rawPath, raw) });
      rawBindings.push(binding(specification.supportPath, range.bytes),
        binding(specification.rawPath, raw));
    }
    onProgress({ phase: "RECORD_AFTER" });
    const after = await fetchRecord(fetchImpl);
    const afterProjection = recordProjection(after.value);
    if (!before.bytes.equals(after.bytes) || !same(beforeProjection, afterProjection)) {
      fail("RECORD_BRACKET_CHANGED");
    }
    privateWrite(path.join(root, "source-support", "record-after.json"), after.bytes);
    const bindings = [binding("archive-inventory.json", inventoryBytes),
      binding("source-support/record-before.json", before.bytes),
      binding("source-support/record-after.json", after.bytes),
      binding("source-support/archive-tail.range", tail.bytes), ...rawBindings]
      .sort((left, right) => left.path.localeCompare(right.path));
    const sourceRoot = sourceRootFromBindings(bindings);
    const body = {
      schema: ZENODO_7240050_SOURCE_SCHEMA,
      acquiredAt: ZENODO_7240050_FROZEN_AT,
      record: beforeProjection,
      recordBracket: {
        before: binding("source-support/record-before.json", before.bytes),
        after: binding("source-support/record-after.json", after.bytes),
        exactBytesStable: true,
      },
      archiveRangeClosure: {
        parentArchiveDownloaded: false,
        tail: { path: "source-support/archive-tail.range", ...rangeProjection(tail) },
        centralDirectory: { offset: CENTRAL_OFFSET, sizeBytes: CENTRAL_BYTES,
          sha256: CENTRAL_SHA256, entryCount: CENTRAL_ENTRIES,
          completelyReplayedFromTailRange: true },
      },
      selection: {
        policy: inventory.selectionPolicy.policy,
        completeSelectedExperimentClosure: true,
        selectedEntries: selectedRanges,
        excludedArchiveBagFiles: ARCHIVE_BAG_FILES - 1,
      },
      bindings,
      sourceRoot,
    };
    const manifest = Object.freeze({ ...body,
      manifestHash: digest(`${ZENODO_7240050_SOURCE_SCHEMA}/manifest`, body) });
    privateWrite(path.join(root, "acquisition-manifest.json"), canonicalBytes(manifest));
    return verifyZenodo7240050CollisionSourceDirectory(root);
  } catch (error) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function sameStat(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function requirePrivateDirectory(directory, names, snapshots) {
  const before = lstatSync(directory, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()
    || Number(before.mode & 0o777n) !== 0o700
    || !same(sorted(readdirSync(directory)), sorted(names))) fail("SOURCE_DIRECTORY_INVALID", directory);
  const after = lstatSync(directory, { bigint: true });
  if (!sameStat(before, after)) fail("SOURCE_DIRECTORY_CHANGED", directory);
  snapshots.push({ path: directory, stat: after });
}

function readPrivateStable(root, relativePath, snapshots, maximumBytes) {
  const file = path.join(root, ...relativePath.split("/"));
  const before = lstatSync(file, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || Number(before.mode & 0o777n) !== 0o600
    || before.size < 1n || before.size > BigInt(maximumBytes)) fail("SOURCE_FILE_INVALID", relativePath);
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const descriptor = openSync(file, flags);
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameStat(before, opened)) fail("SOURCE_FILE_CHANGED", relativePath);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const finalPath = lstatSync(file, { bigint: true });
    if (!sameStat(opened, after) || !sameStat(opened, finalPath)) {
      fail("SOURCE_FILE_CHANGED", relativePath);
    }
    snapshots.push({ path: file, stat: finalPath });
    return bytes;
  } finally { closeSync(descriptor); }
}

function recheckSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    if (!sameStat(snapshot.stat, lstatSync(snapshot.path, { bigint: true }))) {
      fail("SOURCE_CHANGED_DURING_REPLAY", snapshot.path);
    }
  }
}

function supportNames() {
  return ["archive-tail.range", "bag-11-local-range.bin", "readme-1-local-range.bin",
    "record-after.json", "record-before.json"];
}

export function verifyZenodo7240050CollisionSourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const snapshots = [];
  requirePrivateDirectory(root,
    ["acquisition-manifest.json", "archive-inventory.json", "raw", "source-support"],
    snapshots);
  requirePrivateDirectory(path.join(root, "raw"), ["11.bag", "README_1.docx"], snapshots);
  requirePrivateDirectory(path.join(root, "source-support"), supportNames(), snapshots);
  const manifestBytes = readPrivateStable(root, "acquisition-manifest.json", snapshots,
    2 * 1024 * 1024);
  const inventoryBytes = readPrivateStable(root, "archive-inventory.json", snapshots,
    2 * 1024 * 1024);
  const beforeBytes = readPrivateStable(root, "source-support/record-before.json", snapshots,
    RECORD_BYTES);
  const afterBytes = readPrivateStable(root, "source-support/record-after.json", snapshots,
    RECORD_BYTES);
  const tailBytes = readPrivateStable(root, "source-support/archive-tail.range", snapshots,
    TAIL_BYTES);
  const readmeRange = readPrivateStable(root, SELECTED[0].supportPath, snapshots,
    SELECTED[0].localRangeBytes);
  const bagRange = readPrivateStable(root, SELECTED[1].supportPath, snapshots,
    SELECTED[1].localRangeBytes);
  const readmeBytes = readPrivateStable(root, SELECTED[0].rawPath, snapshots,
    SELECTED[0].uncompressedSize);
  const bagBytes = readPrivateStable(root, SELECTED[1].rawPath, snapshots,
    SELECTED[1].uncompressedSize);
  const manifest = safeJson(manifestBytes, "SOURCE_MANIFEST_JSON_INVALID");
  const inventory = safeJson(inventoryBytes, "SOURCE_INVENTORY_JSON_INVALID");
  if (!manifestBytes.equals(canonicalBytes(manifest))
    || !inventoryBytes.equals(canonicalBytes(inventory))) fail("SOURCE_JSON_NOT_CANONICAL");
  if (beforeBytes.length !== RECORD_BYTES || !beforeBytes.equals(afterBytes)
    || zenodo7240050Sha256(beforeBytes) !== RECORD_SHA256) fail("SOURCE_RECORD_BRACKET_INVALID");
  const beforeProjection = recordProjection(safeJson(beforeBytes, "SOURCE_RECORD_JSON_INVALID"));
  const afterProjection = recordProjection(safeJson(afterBytes, "SOURCE_RECORD_JSON_INVALID"));
  if (!same(beforeProjection, afterProjection)) fail("SOURCE_RECORD_PROJECTION_CHANGED");
  const tail = inspectTail(tailBytes);
  const entries = parseCentralDirectory(tail.central);
  const rebuiltInventory = buildInventory(entries, tail);
  if (!same(inventory, rebuiltInventory)) fail("SOURCE_INVENTORY_REBUILD_MISMATCH");
  const rawByRole = new Map([
    [SELECTED[0].role, { range: readmeRange, raw: readmeBytes }],
    [SELECTED[1].role, { range: bagRange, raw: bagBytes }],
  ]);
  for (const specification of SELECTED) {
    const stored = rawByRole.get(specification.role);
    const centralEntry = entries.find((entry) => entry.archivePath === specification.archivePath);
    const rebuilt = extractSelectedLocalRange(stored.range, specification, centralEntry);
    if (!rebuilt.equals(stored.raw)) fail("SOURCE_SELECTED_RAW_MISMATCH", specification.role);
  }
  const bindings = [binding("archive-inventory.json", inventoryBytes),
    binding("source-support/record-before.json", beforeBytes),
    binding("source-support/record-after.json", afterBytes),
    binding("source-support/archive-tail.range", tailBytes),
    binding(SELECTED[0].supportPath, readmeRange), binding(SELECTED[0].rawPath, readmeBytes),
    binding(SELECTED[1].supportPath, bagRange), binding(SELECTED[1].rawPath, bagBytes)]
    .sort((left, right) => left.path.localeCompare(right.path));
  const sourceRoot = sourceRootFromBindings(bindings);
  const { manifestHash, ...manifestBody } = manifest;
  const expectedArchiveRangeClosure = {
    parentArchiveDownloaded: false,
    tail: { path: "source-support/archive-tail.range",
      start: TAIL_START, end: TAIL_END,
      contentRange: `bytes ${TAIL_START}-${TAIL_END}/${ZENODO_7240050_ARCHIVE_BYTES}`,
      sizeBytes: TAIL_BYTES, sha256: TAIL_SHA256 },
    centralDirectory: { offset: CENTRAL_OFFSET, sizeBytes: CENTRAL_BYTES,
      sha256: CENTRAL_SHA256, entryCount: CENTRAL_ENTRIES,
      completelyReplayedFromTailRange: true },
  };
  const expectedSelectedEntries = SELECTED.map((specification) => {
    const stored = rawByRole.get(specification.role);
    const end = specification.localHeaderOffset + specification.localRangeBytes - 1;
    return { role: specification.role, archivePath: specification.archivePath,
      localHeaderOffset: specification.localHeaderOffset,
      localRangeBytes: specification.localRangeBytes,
      supportPath: specification.supportPath, rawPath: specification.rawPath,
      range: { start: specification.localHeaderOffset, end,
        contentRange: `bytes ${specification.localHeaderOffset}-${end}/${ZENODO_7240050_ARCHIVE_BYTES}`,
        sizeBytes: specification.localRangeBytes,
        sha256: zenodo7240050Sha256(stored.range) },
      raw: binding(specification.rawPath, stored.raw) };
  });
  const expectedSelection = {
    policy: inventory.selectionPolicy.policy,
    completeSelectedExperimentClosure: true,
    selectedEntries: expectedSelectedEntries,
    excludedArchiveBagFiles: 79,
  };
  if (!exactKeys(manifest, ["schema", "acquiredAt", "record", "recordBracket",
    "archiveRangeClosure", "selection", "bindings", "sourceRoot", "manifestHash"])
    || manifest.schema !== ZENODO_7240050_SOURCE_SCHEMA
    || manifest.acquiredAt !== ZENODO_7240050_FROZEN_AT
    || !same(manifest.record, beforeProjection)
    || !same(manifest.bindings, bindings) || manifest.sourceRoot !== sourceRoot
    || manifestHash !== digest(`${ZENODO_7240050_SOURCE_SCHEMA}/manifest`, manifestBody)
    || !same(manifest.recordBracket, {
      before: binding("source-support/record-before.json", beforeBytes),
      after: binding("source-support/record-after.json", afterBytes), exactBytesStable: true,
    }) || !same(manifest.archiveRangeClosure, expectedArchiveRangeClosure)
    || !same(manifest.selection, expectedSelection)) fail("SOURCE_MANIFEST_INVALID");
  recheckSnapshots(snapshots);
  return Object.freeze({ ok: true, sourceDirectory: root,
    verificationLevel: "FULL_SELECTED_SOURCE_BYTE_REPLAY",
    manifest, manifestFileSha256: zenodo7240050Sha256(manifestBytes), sourceRoot,
    inventory, readmeBytes, bagBytes,
    selectedCompressedBytes: SELECTED.reduce((sum, value) => sum + value.compressedSize, 0),
    selectedRawBytes: SELECTED.reduce((sum, value) => sum + value.uncompressedSize, 0) });
}

function sourceIdentity() {
  return {
    recordId: ZENODO_7240050_RECORD_ID,
    doi: ZENODO_7240050_DOI,
    revision: 3,
    version: "1",
    publicationDate: "2022-10-21",
    accessRight: "open",
    zenodoLicenseClaim: ZENODO_7240050_LICENSE,
    archive: { name: ZENODO_7240050_ARCHIVE_NAME,
      sizeBytes: ZENODO_7240050_ARCHIVE_BYTES,
      publisherMd5Claim: ZENODO_7240050_ARCHIVE_MD5 },
  };
}

function denominatorRegistry() {
  return {
    populations: [
      { denominatorClass: "COLLISION_EXPERIMENT", units: 1,
        sourceComponent: "README_ROW_11_PLUS_11_BAG_COMPLETE_CLOSURE" },
      { denominatorClass: "ROS_MESSAGE_RECORD_WITHIN_SELECTED_EXPERIMENT", units: 48_520,
        sourceComponent: "11_BAG_MESSAGES", additiveWithCollisionExperiments: false },
    ],
    topicCountsPartitionMessageRecords: true,
    topicCountsAreAdditionalExperiments: false,
    sensorArrayValuesAreAdditionalMessages: false,
    crossDomainTotal: null,
    crossDomainAdditionProhibited: true,
  };
}

function zeroBoundary() {
  return {
    independentTaskOutcomeRecords: 0,
    taskRecoveryRecords: 0,
    delegationRecords: 0,
    authorityRecords: 0,
    longitudinalTaskOutcomeRecords: 0,
    authorizedTrainingRows: 0,
    productionTrainingRows: 0,
    networkContributionRecords: 0,
    CEURecords: 0,
    authorityDelta: 0,
  };
}

export function buildZenodo7240050CollisionExperimentFromSource(sourceDirectory) {
  const source = verifyZenodo7240050CollisionSourceDirectory(sourceDirectory);
  const readme = parseReadme(source.readmeBytes);
  const bag = buildRosBagSummary(source.bagBytes);
  const external = bag.selectedStreams.externalFt;
  const body = {
    schema: ZENODO_7240050_REPORT_SCHEMA,
    generatedAt: ZENODO_7240050_FROZEN_AT,
    sourceIdentity: sourceIdentity(),
    declaredScope: {
      explicitCandidateUniverse: "ZENODO_RECORD_7240050_ARCHIVE_CENTRAL_DIRECTORY",
      completeCentralDirectoryReplayed: true,
      parentArchiveEntries: CENTRAL_ENTRIES,
      parentArchiveBagFiles: ARCHIVE_BAG_FILES,
      selectedBagFiles: 1,
      selectedExperimentClosureComplete: true,
      archivePayloadExhausted: false,
      globalExhaustion: false,
    },
    selection: {
      policy: source.inventory.selectionPolicy.policy,
      selectedSession: "2022_08_03_calpak",
      selectedExperimentNumber: 11,
      selectedArchiveEntries: SELECTED.map((value) => value.archivePath),
      excludedArchiveBagFiles: 79,
      wholeParentArchiveDownloaded: false,
      selectionIsCorpusWideRepresentativeClaim: false,
    },
    population: {
      collisionExperiments: 1,
      rosMessageRecordsWithinExperiment: bag.messageCount,
      externalFtMessagesWithinExperiment: external.messages,
      jointStateMessagesWithinExperiment: bag.selectedStreams.jointStates.messages,
    },
    denominatorRegistry: denominatorRegistry(),
    publisherExperimentDescription: {
      readmeDocument: { archivePath: SELECTED[0].archivePath,
        docxEntries: readme.docxEntries, documentXmlBytes: readme.documentXmlBytes,
        documentXmlSha256: readme.documentXmlSha256 },
      describedExperimentRows: readme.experimentRows,
      selectedExperiment: readme.selectedExperiment,
      categoryClaim: readme.categoryClaim,
      maximumOverrideClaimMillimetersPerSecond:
        readme.maximumOverrideClaimMillimetersPerSecond,
      peakForceUnitDeclared: readme.peakForceUnitDeclared,
      describedTopics: readme.describedTopics,
      conditionsAndPeakForceArePublisherClaims: true,
    },
    mechanicalCollisionEvidence: {
      rosBag: { archivePath: SELECTED[1].archivePath,
        rawBytes: source.bagBytes.length, rawSha256: zenodo7240050Sha256(source.bagBytes),
        version: bag.rosbagVersion, chunks: bag.bagHeader.chunkCount,
        connections: bag.connectionCount, uniqueTopics: bag.uniqueTopicCount,
        messageTypes: bag.messageTypeCount, messages: bag.messageCount,
        recordTimeRange: bag.recordTimeRange,
        imageTopics: bag.imageTopics },
      topicMessageCounts: bag.topicMessageCounts,
      typeMessageCounts: bag.typeMessageCounts,
      externalFtStream: {
        topic: "/external_ft_sensor",
        rosType: "sensor_msgs/JointState",
        messages: external.messages,
        shapes: external.shapes,
        numericArrays: external.numericArrays,
        rosRecordTimeRange: external.rosRecordTimeRange,
        embeddedHeaderTimeRange: external.embeddedHeaderTimeRange,
        embeddedHeaderTimeAlignedToBagEnvelope: false,
        publisherDescribesAsExternalFtSensor: true,
        physicalIndependenceExternallyAudited: false,
        channelCoordinatesAndUnitsDeclared: false,
        observedEffortArrayMinimum: external.numericArrays.effort.minimum,
        observedEffortArrayMaximum: external.numericArrays.effort.maximum,
        publisherPeakForceClaim: readme.selectedExperiment.publisherPeakForceClaim,
        numericSimilarityIsNotUnitOrCalibrationProof: true,
      },
      robotJointStateStream: bag.selectedStreams.jointStates,
      robotStateStream: bag.selectedStreams.robotState,
      collisionDetectorStreams: {
        endEffector: bag.selectedStreams.endEffectorCollisionDetected,
        joints: bag.selectedStreams.jointCollisionDetected,
      },
      toolControllerPoseMessages: bag.selectedStreams.toolControllerPoseMessages,
      externalMechanicalMeasurementPresent: true,
      independentTaskOutcomePresent: false,
      recoverySequencePresent: false,
      evidenceClass: "MECHANICAL_COLLISION_CONDITION_AND_DETECTOR_RESPONSE",
    },
    segmentCoverageAttribution: {
      mechanicalObservation: { selectedCollisionExperiments: 1,
        externalFtSensorStreams: 1, robotTelemetryStreams: 3 },
      opportunityCensus: { prospectiveOpportunityRecords: 0 },
      delegationAuthorization: { delegationRecords: 0, authorityRecords: 0 },
      effect: { independentPhysicalEffectRecords: 0,
        externalMechanicalMeasurementStreams: 1 },
      outcome: { independentTaskOutcomeRecords: 0 },
      recovery: { taskRecoveryRecords: 0 },
      longitudinal: { longitudinalTaskOutcomeRecords: 0 },
      segmentsAreNotAdditive: true,
    },
    rightsPrivacyRevisionAndUse: {
      rights: { officialZenodoLicenseClaim: ZENODO_7240050_LICENSE,
        embeddedLicenseFilePresentInArchive: false, legalConclusion: false },
      privacy: { rosgraphLogMessagesRetainedLocally: bag.rosgraphLogMessages,
        connectionMetadataRetainedLocally: true, manualPrivacyReviewComplete: false,
        publicRedistributionCleared: false },
      revision: { zenodoRevision: 3, datasetVersion: "1",
        recordBeforeAfterExactBytesStable: true },
      use: { offlineMechanicalEvaluationOnly: true,
        modelFittingPerformed: false, productionTrainingAuthorized: false,
        authorizedTrainingRows: 0 },
    },
    modelAndTrainingBoundary: {
      offlineModelFittingPerformed: false,
      authorizedTraining: false,
      authorizedTrainingRows: 0,
      authorizedTrainingJobs: 0,
      authorizedTrainingPerformed: false,
    },
    authorityAndNetworkBoundary: {
      delegationRecords: 0, authorityRecords: 0, authorityDelta: 0,
      networkContributionRecords: 0, CEURecords: 0,
    },
    zeroClaimBoundary: zeroBoundary(),
    sourceReplay: {
      verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED",
      sourceManifestHash: source.manifest.manifestHash,
      sourceManifestFileSha256: source.manifestFileSha256,
      sourceRoot: source.sourceRoot,
      archiveInventoryHash: source.inventory.inventoryHash,
      completeCentralDirectorySha256: CENTRAL_SHA256,
      selectedCompressedBytes: source.selectedCompressedBytes,
      selectedRawBytes: source.selectedRawBytes,
      readmeReplayHash: digest(`${ZENODO_7240050_REPORT_SCHEMA}/readme`, readme),
      rosBagReplayHash: digest(`${ZENODO_7240050_REPORT_SCHEMA}/rosbag`, bag),
    },
  };
  body.sourceReplay.replayHash = digest(`${ZENODO_7240050_REPORT_SCHEMA}/source-replay`,
    body.sourceReplay);
  return Object.freeze({ ...body,
    artifactHash: digest(`${ZENODO_7240050_REPORT_SCHEMA}/artifact`, body) });
}

export function verifyZenodo7240050CollisionExperimentReport(report) {
  const errors = [];
  try {
    if (!exactKeys(report, ["schema", "generatedAt", "sourceIdentity", "declaredScope",
      "selection", "population", "denominatorRegistry", "publisherExperimentDescription",
      "mechanicalCollisionEvidence", "segmentCoverageAttribution",
      "rightsPrivacyRevisionAndUse", "modelAndTrainingBoundary",
      "authorityAndNetworkBoundary", "zeroClaimBoundary", "sourceReplay", "artifactHash"])) {
      fail("REPORT_SHAPE");
    }
    const { artifactHash, ...body } = report;
    if (report.schema !== ZENODO_7240050_REPORT_SCHEMA
      || report.generatedAt !== ZENODO_7240050_FROZEN_AT
      || artifactHash !== digest(`${ZENODO_7240050_REPORT_SCHEMA}/artifact`, body)) {
      fail("ARTIFACT_HASH");
    }
    if (!same(report.sourceIdentity, sourceIdentity())) fail("SOURCE_IDENTITY_BOUNDARY");
    if (!same(report.denominatorRegistry, denominatorRegistry())
      || !same(report.population, { collisionExperiments: 1,
        rosMessageRecordsWithinExperiment: 48_520,
        externalFtMessagesWithinExperiment: 6_169,
        jointStateMessagesWithinExperiment: 3_441 })) fail("DENOMINATOR_BOUNDARY");
    if (report.declaredScope.completeCentralDirectoryReplayed !== true
      || report.declaredScope.parentArchiveEntries !== CENTRAL_ENTRIES
      || report.declaredScope.parentArchiveBagFiles !== ARCHIVE_BAG_FILES
      || report.declaredScope.selectedBagFiles !== 1
      || report.declaredScope.selectedExperimentClosureComplete !== true
      || report.declaredScope.archivePayloadExhausted !== false
      || report.declaredScope.globalExhaustion !== false
      || report.selection.excludedArchiveBagFiles !== 79
      || report.selection.wholeParentArchiveDownloaded !== false
      || report.selection.selectionIsCorpusWideRepresentativeClaim !== false) {
      fail("SCOPE_BOUNDARY");
    }
    if (report.publisherExperimentDescription.selectedExperiment.experimentNumber !== 11
      || report.publisherExperimentDescription.selectedExperiment.publisherPeakForceClaim !== 526
      || report.publisherExperimentDescription.peakForceUnitDeclared !== false
      || report.publisherExperimentDescription.conditionsAndPeakForceArePublisherClaims !== true
      || report.mechanicalCollisionEvidence.rosBag.messages !== 48_520
      || report.mechanicalCollisionEvidence.rosBag.connections !== 49
      || report.mechanicalCollisionEvidence.externalFtStream.messages !== 6_169
      || report.mechanicalCollisionEvidence.externalFtStream.channelCoordinatesAndUnitsDeclared !== false
      || report.mechanicalCollisionEvidence.externalFtStream.physicalIndependenceExternallyAudited !== false
      || report.mechanicalCollisionEvidence.independentTaskOutcomePresent !== false
      || report.mechanicalCollisionEvidence.recoverySequencePresent !== false) {
      fail("MECHANICAL_EVIDENCE_BOUNDARY");
    }
    if (!same(report.mechanicalCollisionEvidence.topicMessageCounts, EXPECTED_TOPIC_COUNTS)
      || !same(report.mechanicalCollisionEvidence.typeMessageCounts, EXPECTED_TYPE_COUNTS)) {
      fail("ROS_COUNT_BOUNDARY");
    }
    if (report.segmentCoverageAttribution.segmentsAreNotAdditive !== true
      || report.segmentCoverageAttribution.outcome.independentTaskOutcomeRecords !== 0
      || report.segmentCoverageAttribution.recovery.taskRecoveryRecords !== 0
      || report.segmentCoverageAttribution.delegationAuthorization.delegationRecords !== 0
      || report.segmentCoverageAttribution.delegationAuthorization.authorityRecords !== 0
      || !same(report.zeroClaimBoundary, zeroBoundary())) fail("SEGMENT_ZERO_BOUNDARY");
    if (report.rightsPrivacyRevisionAndUse.rights.officialZenodoLicenseClaim
        !== ZENODO_7240050_LICENSE
      || report.rightsPrivacyRevisionAndUse.rights.legalConclusion !== false
      || report.rightsPrivacyRevisionAndUse.privacy.manualPrivacyReviewComplete !== false
      || report.rightsPrivacyRevisionAndUse.privacy.publicRedistributionCleared !== false
      || report.rightsPrivacyRevisionAndUse.use.productionTrainingAuthorized !== false
      || report.rightsPrivacyRevisionAndUse.use.authorizedTrainingRows !== 0
      || !same(report.modelAndTrainingBoundary, {
        offlineModelFittingPerformed: false, authorizedTraining: false,
        authorizedTrainingRows: 0, authorizedTrainingJobs: 0,
        authorizedTrainingPerformed: false })) fail("RIGHTS_PRIVACY_TRAINING_BOUNDARY");
    if (!same(report.authorityAndNetworkBoundary, { delegationRecords: 0,
      authorityRecords: 0, authorityDelta: 0, networkContributionRecords: 0,
      CEURecords: 0 })) fail("AUTHORITY_NETWORK_BOUNDARY");
    if (report.sourceReplay.verificationLevel !== "FULL_SELECTED_SOURCE_REDERIVED"
      || !HASH.test(report.sourceReplay.sourceManifestHash)
      || !HASH.test(report.sourceReplay.sourceManifestFileSha256)
      || !HASH.test(report.sourceReplay.sourceRoot)
      || !HASH.test(report.sourceReplay.archiveInventoryHash)
      || report.sourceReplay.completeCentralDirectorySha256 !== CENTRAL_SHA256
      || report.sourceReplay.selectedCompressedBytes !== 1_713_634
      || report.sourceReplay.selectedRawBytes !== 9_447_886
      || !HASH.test(report.sourceReplay.readmeReplayHash)
      || !HASH.test(report.sourceReplay.rosBagReplayHash)) fail("SOURCE_REPLAY_BOUNDARY");
    const { replayHash, ...replayBody } = report.sourceReplay;
    if (replayHash !== digest(`${ZENODO_7240050_REPORT_SCHEMA}/source-replay`, replayBody)) {
      fail("SOURCE_REPLAY_HASH");
    }
  } catch (error) { errors.push(safeError(error)); }
  return Object.freeze({ ok: errors.length === 0, errors });
}

export function verifyZenodo7240050CollisionExperimentWithSource(report, sourceDirectory) {
  try {
    const standalone = verifyZenodo7240050CollisionExperimentReport(report);
    if (!standalone.ok) fail("REPORT_INVALID", standalone.errors.join(","));
    const rebuilt = buildZenodo7240050CollisionExperimentFromSource(sourceDirectory);
    if (!same(report, rebuilt)) fail("FULL_SOURCE_REBUILD_MISMATCH");
    return Object.freeze({ ok: true, verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED",
      artifactHash: report.artifactHash });
  } catch (error) { return Object.freeze({ ok: false, errors: [safeError(error)] }); }
}

export function buildZenodo7240050CollisionRunReceipt(report, reportBytes) {
  const checked = verifyZenodo7240050CollisionExperimentReport(report);
  if (!checked.ok || !Buffer.isBuffer(reportBytes)
    || !reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_REPORT_INVALID");
  const body = {
    schema: ZENODO_7240050_RECEIPT_SCHEMA,
    completedAt: ZENODO_7240050_FROZEN_AT,
    artifact: { schema: report.schema, artifactHash: report.artifactHash,
      path: "zenodo7240050-collision-experiment.json", sizeBytes: reportBytes.length,
      fileSha256: zenodo7240050Sha256(reportBytes) },
    source: { sourceManifestHash: report.sourceReplay.sourceManifestHash,
      sourceManifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      verificationLevel: "FULL_SELECTED_SOURCE_REDERIVED",
      completeCentralDirectoryReplayed: true,
      fullParentArchiveDownloaded: false },
    denominatorBoundary: { collisionExperiments: 1, rosMessageRecords: 48_520,
      crossDomainTotal: null, crossDomainAdditionProhibited: true },
    zeroClaimBoundary: zeroBoundary(),
    publication: { reportPublishedBeforeReceipt: true, receiptWrittenLast: true,
      filesMode: "0600", directoriesMode: "0700", noClobber: true },
  };
  return Object.freeze({ ...body,
    receiptHash: digest(`${ZENODO_7240050_RECEIPT_SCHEMA}/receipt`, body) });
}

export function verifyZenodo7240050CollisionRunReceipt(receipt, reportBytes) {
  try {
    const report = safeJson(reportBytes, "RECEIPT_REPORT_JSON_INVALID");
    if (!reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_REPORT_NOT_CANONICAL");
    const expected = buildZenodo7240050CollisionRunReceipt(report, reportBytes);
    if (!same(receipt, expected)) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true, receiptHash: receipt.receiptHash });
  } catch (error) { return Object.freeze({ ok: false, errors: [safeError(error)] }); }
}

export function publishZenodo7240050CollisionArtifactDirectory(stagingDirectory,
  targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (staging === target || path.dirname(staging) !== path.dirname(target)) {
    fail("PUBLISH_DIRECTORIES_NOT_SIBLINGS");
  }
  const stat = lstatSync(staging, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || Number(stat.mode & 0o777n) !== 0o700
    || !same(sorted(readdirSync(staging)),
      ["run-receipt.json", "source", "zenodo7240050-collision-experiment.json"])) {
    fail("PUBLISH_STAGING_INVALID");
  }
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("PUBLISH_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "source"), path.join(target, "source"));
    renameSync(path.join(staging, "zenodo7240050-collision-experiment.json"),
      path.join(target, "zenodo7240050-collision-experiment.json"));
    renameSync(path.join(staging, "run-receipt.json"), path.join(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch { fail("PUBLISH_TARGET_INCOMPLETE", target); }
  return target;
}

export function verifyZenodo7240050CollisionArtifactDirectory(artifactDirectory) {
  try {
    const root = path.resolve(artifactDirectory);
    const snapshots = [];
    requirePrivateDirectory(root,
      ["run-receipt.json", "source", "zenodo7240050-collision-experiment.json"], snapshots);
    const reportBytes = readPrivateStable(root,
      "zenodo7240050-collision-experiment.json", snapshots, 8 * 1024 * 1024);
    const receiptBytes = readPrivateStable(root, "run-receipt.json", snapshots,
      2 * 1024 * 1024);
    const report = safeJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receipt = safeJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    if (!reportBytes.equals(canonicalBytes(report))
      || !receiptBytes.equals(canonicalBytes(receipt))) fail("ARTIFACT_JSON_NOT_CANONICAL");
    const replay = verifyZenodo7240050CollisionExperimentWithSource(report,
      path.join(root, "source"));
    const receiptCheck = verifyZenodo7240050CollisionRunReceipt(receipt, reportBytes);
    if (!replay.ok || !receiptCheck.ok) fail("ARTIFACT_REPLAY_FAILED",
      replay.errors?.join(",") ?? receiptCheck.errors?.join(","));
    const reportStat = statSync(path.join(root, "zenodo7240050-collision-experiment.json"),
      { bigint: true });
    const receiptStat = statSync(path.join(root, "run-receipt.json"), { bigint: true });
    if (receiptStat.mtimeNs < reportStat.mtimeNs) fail("RECEIPT_NOT_LAST");
    recheckSnapshots(snapshots);
    return Object.freeze({ ok: true, verificationLevel: replay.verificationLevel,
      artifactHash: report.artifactHash,
      reportFileSha256: zenodo7240050Sha256(reportBytes),
      receiptHash: receipt.receiptHash,
      receiptFileSha256: zenodo7240050Sha256(receiptBytes),
      sourceManifestHash: report.sourceReplay.sourceManifestHash,
      sourceManifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      collisionExperiments: 1, rosMessageRecords: 48_520,
      externalFtMessages: 6_169, independentTaskOutcomeRecords: 0,
      recoveryRecords: 0, authorizedTrainingRows: 0, authorityDelta: 0 });
  } catch (error) { return Object.freeze({ ok: false, errors: [safeError(error)] }); }
}

export const ZENODO_7240050_COLLISION_CONSTANTS = Object.freeze({
  recordUrl: RECORD_URL,
  contentUrl: CONTENT_URL,
  recordBytes: RECORD_BYTES,
  recordSha256: RECORD_SHA256,
  tailStart: TAIL_START,
  tailEnd: TAIL_END,
  tailBytes: TAIL_BYTES,
  tailSha256: TAIL_SHA256,
  centralOffset: CENTRAL_OFFSET,
  centralBytes: CENTRAL_BYTES,
  centralSha256: CENTRAL_SHA256,
  centralEntries: CENTRAL_ENTRIES,
  centralFiles: CENTRAL_FILES,
  centralDirectories: CENTRAL_DIRECTORIES,
  archiveBagFiles: ARCHIVE_BAG_FILES,
  selected: SELECTED,
  expectedTopicCounts: EXPECTED_TOPIC_COUNTS,
});
