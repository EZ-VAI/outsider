/*
 * Full replay of the publisher-provided six-trajectory sample from RMPD.
 *
 * The 28.1 GB PostgreSQL dump is inventoried but not acquired.  The selected
 * source-native sample archive and schema are acquired in full.  Commanded
 * controller streams, measured Leica streams and publisher distance metrics
 * are kept distinct from task outcome, failure, recovery and authority.
 */

import { createHash } from "node:crypto";
import {
  lstatSync, readFileSync, readdirSync, renameSync, mkdirSync, writeFileSync,
  chmodSync, rmSync,
} from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const RMPD_RECORD_ID = 18_549_433;
export const RMPD_DOI = "10.5281/zenodo.18549433";
export const RMPD_REVISION = 14;
export const RMPD_REPORT_SCHEMA = "outsider/rmpd-robot-motion-sample/v1";
export const RMPD_RECEIPT_SCHEMA = "outsider/rmpd-robot-motion-sample-receipt/v1";
export const RMPD_SOURCE_MANIFEST_SCHEMA =
  "outsider/rmpd-robot-motion-sample-source-manifest/v1";
export const RMPD_DISPOSITION = "ADMITTED_RESEARCH_ONLY";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\0-\x1f\x7f]+$/u;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const MAX_ARCHIVE_BYTES = 5_000_000;
const MAX_UNCOMPRESSED_BYTES = 14_000_000;
const EXPECTED_FILES = Object.freeze({
  "samples.zip": Object.freeze({
    bytes: 4_043_321,
    md5: "5ce44686ac54640776995342809b25e8",
    sha256: "5065e7f5586e83a89369b5babdc5f76afa62ae0581f221fdbe0c288e4f9462ed",
  }),
  "schema_rmpd.sql": Object.freeze({
    bytes: 28_586,
    md5: "ca407b92ebf12f48bb90f17be3f0ddb7",
    sha256: "2a3e67f94836bc794141b7e951f2df4c1c2064f29d136904fb793c572901aebe",
  }),
  "rmpd.dump": Object.freeze({
    bytes: 28_101_516_873,
    md5: "0edc77300f6d38f2c23f39e794fc02e6",
    sha256: null,
  }),
});

const CSV_PROFILE = Object.freeze({
  "samples/rmpd_evaluation_ed_evaluation.csv": Object.freeze({
    header: ["traj_id", "seg_id", "ed_deviation", "points_order", "ed_cmd_x",
      "ed_cmd_y", "ed_cmd_z", "ed_act_x", "ed_act_y", "ed_act_z"], rows: 12_816,
  }),
  "samples/rmpd_evaluation_ed_info.csv": Object.freeze({
    header: ["traj_id", "seg_id", "euclidean_min_distance", "euclidean_max_distance",
      "euclidean_average_distance", "euclidean_standard_deviation"], rows: 24,
  }),
  "samples/rmpd_evaluation_gd_evaluation.csv": Object.freeze({
    header: ["traj_id", "seg_id", "gd_deviation", "gd_cmd_x", "gd_cmd_y",
      "gd_cmd_z", "gd_cmd_w", "gd_act_x", "gd_act_y", "gd_act_z", "gd_act_w",
      "points_order"], rows: 12_816,
  }),
  "samples/rmpd_evaluation_gd_info.csv": Object.freeze({
    header: ["traj_id", "seg_id", "gd_min_distance", "gd_max_distance",
      "gd_average_distance", "gd_standard_deviation"], rows: 24,
  }),
  "samples/rmpd_evaluation_qdtw_evaluation.csv": Object.freeze({
    header: ["traj_id", "seg_id", "qdtw_deviation", "qdtw_cmd_x", "qdtw_cmd_y",
      "qdtw_cmd_z", "qdtw_cmd_w", "qdtw_act_x", "qdtw_act_y", "qdtw_act_z",
      "qdtw_act_w", "points_order"], rows: 12_816,
  }),
  "samples/rmpd_evaluation_qdtw_info.csv": Object.freeze({
    header: ["traj_id", "seg_id", "qdtw_min_distance", "qdtw_max_distance",
      "qdtw_average_distance", "qdtw_standard_deviation"], rows: 24,
  }),
  "samples/rmpd_evaluation_sidtw_evaluation.csv": Object.freeze({
    header: ["traj_id", "seg_id", "sidtw_deviation", "sidtw_cmd_x", "sidtw_cmd_y",
      "sidtw_cmd_z", "sidtw_act_x", "sidtw_act_y", "sidtw_act_z", "points_order"],
    rows: 18_988,
  }),
  "samples/rmpd_evaluation_sidtw_info.csv": Object.freeze({
    header: ["traj_id", "seg_id", "sidtw_min_distance", "sidtw_max_distance",
      "sidtw_average_distance", "sidtw_standard_deviation"], rows: 24,
  }),
  "samples/rmpd_motion_robot_info.csv": Object.freeze({
    header: ["robot_model", "location", "model_year", "max_payload", "vel_max",
      "accel_max", "workspace_max_x", "workspace_max_y", "workspace_max_z",
      "workspace_min_x", "workspace_min_y", "workspace_min_z", "firmware",
      "description", "axes"], rows: 1,
  }),
  "samples/rmpd_motion_traj_accel_act.csv": Object.freeze({
    header: ["traj_id", "seg_id", "timestamp", "tcp_accel_act"], rows: 1_069,
  }),
  "samples/rmpd_motion_traj_accel_cmd.csv": Object.freeze({
    header: ["traj_id", "seg_id", "timestamp", "tcp_accel_cmd"], rows: 1_018,
  }),
  "samples/rmpd_motion_traj_embeddings.csv": Object.freeze({
    header: ["seg_id", "traj_id", "joint_embedding", "position_embedding",
      "orientation_embedding", "velocity_embedding", "metadata_embedding"], rows: 24,
  }),
  "samples/rmpd_motion_traj_info.csv": Object.freeze({
    header: ["traj_id", "robot_model", "path_planning", "recording_date", "start_time",
      "end_time", "source_data_act", "source_data_cmd", "record_filename",
      "number_setpoints", "freq_pose_act", "freq_position_cmd", "freq_orientation_cmd",
      "freq_vel_act", "freq_vel_cmd", "freq_accel_act", "freq_joint_states",
      "number_pose_act", "number_vel_act", "number_accel_act", "number_position_cmd",
      "number_orientation_cmd", "number_vel_cmd", "number_joint_states", "weight",
      "transformation_matrix", "number_accel_cmd", "freq_accel_cmd", "setted_velocity",
      "stop_point", "wait_time"], rows: 6,
  }),
  "samples/rmpd_motion_traj_joint_states.csv": Object.freeze({
    header: ["traj_id", "seg_id", "timestamp", "joint_1", "joint_2", "joint_3",
      "joint_4", "joint_5", "joint_6"], rows: 6_105,
  }),
  "samples/rmpd_motion_traj_metadata.csv": Object.freeze({
    header: ["seg_id", "traj_id", "movement_type", "duration", "weight", "length",
      "min_vel_act", "max_vel_act", "mean_vel_act", "median_vel_act", "std_vel_act",
      "min_accel_act", "max_accel_act", "mean_accel_act", "median_accel_act",
      "std_accel_act", "position_x", "position_y", "position_z"], rows: 24,
  }),
  "samples/rmpd_motion_traj_orientation_cmd.csv": Object.freeze({
    header: ["traj_id", "seg_id", "timestamp", "qx_cmd", "qy_cmd", "qz_cmd", "qw_cmd"],
    rows: 6_105,
  }),
  "samples/rmpd_motion_traj_pose_act.csv": Object.freeze({
    header: ["traj_id", "seg_id", "timestamp", "x_act", "y_act", "z_act", "qx_act",
      "qy_act", "qz_act", "qw_act"], rows: 12_816,
  }),
  "samples/rmpd_motion_traj_pose_act_raw.csv": Object.freeze({
    header: ["traj_id", "segment_id", "timestamp", "x_raw_act", "y_raw_act",
      "z_raw_act", "qx_raw_act", "qy_raw_act", "qz_raw_act", "qw_raw_act"],
    rows: 12_816,
  }),
  "samples/rmpd_motion_traj_position_cmd.csv": Object.freeze({
    header: ["traj_id", "seg_id", "timestamp", "x_cmd", "y_cmd", "z_cmd"], rows: 6_105,
  }),
  "samples/rmpd_motion_traj_setpoints.csv": Object.freeze({
    header: ["traj_id", "seg_id", "timestamp", "x_reached", "y_reached", "z_reached",
      "qx_reached", "qy_reached", "qz_reached", "qw_reached"], rows: 18,
  }),
  "samples/rmpd_motion_traj_vel_act.csv": Object.freeze({
    header: ["traj_id", "seg_id", "timestamp", "tcp_vel_act"], rows: 2_136,
  }),
  "samples/rmpd_motion_traj_vel_cmd.csv": Object.freeze({
    header: ["traj_id", "seg_id", "timestamp", "tcp_vel_cmd"], rows: 2_035,
  }),
});

const METRIC_RANGES = Object.freeze({
  ed: Object.freeze({ minimum: 0.0028546, maximum: 2.4297,
    averageMinimum: 0.28441, averageMaximum: 1.2283,
    standardDeviationMinimum: 0.089223, standardDeviationMaximum: 0.64966 }),
  sidtw: Object.freeze({ minimum: 0.0028546, maximum: 2.7661,
    averageMinimum: 0.28655, averageMaximum: 1.2128,
    standardDeviationMinimum: 0.09226, standardDeviationMaximum: 0.64974 }),
  qdtw: Object.freeze({ minimum: 0.003832, maximum: 0.18395,
    averageMinimum: 0.04441, averageMaximum: 0.083369,
    standardDeviationMinimum: 0.012898, standardDeviationMaximum: 0.051525 }),
  gd: Object.freeze({ minimum: 0.011163, maximum: 0.89138,
    averageMinimum: 0.072983, averageMaximum: 0.37928,
    standardDeviationMinimum: 0.016606, standardDeviationMaximum: 0.28184 }),
});

function fail(code, detail = null) {
  throw new Error(`RMPD_${code}${detail === null ? "" : `:${detail}`}`);
}

export function rmpdSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function md5(bytes) {
  return createHash("md5").update(bytes).digest("hex");
}

export function rmpdDigest(value, domain = RMPD_REPORT_SCHEMA) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function strictJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function strictText(bytes, code) {
  const text = bytes.toString("utf8");
  if (text.includes("\ufffd") || text.includes("\0")) fail(code);
  return text;
}

function safeRegular(file, code) {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink()) fail(code, file);
  return stat;
}

function safeDirectory(directory, code) {
  const stat = lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail(code, directory);
  return stat;
}

function recordProjection(bytes) {
  const value = strictJson(bytes, "RECORD_JSON_INVALID");
  const files = (value.files ?? []).map((file) => ({ key: file.key, size: file.size,
    checksum: file.checksum, contentUrl: file.links?.self ?? null }))
    .sort((left, right) => left.key.localeCompare(right.key));
  const expected = Object.entries(EXPECTED_FILES).map(([key, profile]) => ({ key,
    size: profile.bytes, checksum: `md5:${profile.md5}` })).sort((left, right) =>
    left.key.localeCompare(right.key));
  if (value.id !== RMPD_RECORD_ID || value.revision !== RMPD_REVISION
    || value.doi !== RMPD_DOI || value.status !== "published" || value.state !== "done"
    || value.metadata?.access_right !== "open"
    || value.metadata?.license?.id !== "cc-by-4.0"
    || value.metadata?.resource_type?.type !== "dataset"
    || files.length !== 3
    || !same(files.map(({ key, size, checksum }) => ({ key, size, checksum })), expected)) {
    fail("RECORD_PROFILE_INVALID");
  }
  for (const file of files) {
    if (typeof file.contentUrl !== "string"
      || !file.contentUrl.startsWith(`https://zenodo.org/api/records/${RMPD_RECORD_ID}/files/`)
      || !file.contentUrl.endsWith("/content")) fail("RECORD_FILE_URL_INVALID", file.key);
  }
  return deepFreeze({ id: value.id, revision: value.revision, doi: value.doi,
    created: value.created, modified: value.modified, license: value.metadata.license.id,
    access: value.metadata.access_right, files });
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = (value >>> 8) ^ CRC_TABLE[(value ^ byte) & 0xff];
  return (value ^ 0xffffffff) >>> 0;
}

function parseZip(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== EXPECTED_FILES["samples.zip"].bytes
    || bytes.length > MAX_ARCHIVE_BYTES) fail("ARCHIVE_BYTES_INVALID");
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65_557);
    offset -= 1) {
    if (bytes.readUInt32LE(offset) === ZIP_EOCD
      && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0 || bytes.readUInt16LE(eocd + 4) !== 0
    || bytes.readUInt16LE(eocd + 6) !== 0
    || bytes.readUInt16LE(eocd + 8) !== bytes.readUInt16LE(eocd + 10)) {
    fail("ARCHIVE_EOCD_INVALID");
  }
  const entryCount = bytes.readUInt16LE(eocd + 10);
  const centralBytes = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (entryCount !== 23 || centralOffset + centralBytes !== eocd) {
    fail("ARCHIVE_CENTRAL_GEOMETRY_INVALID");
  }
  const entries = [];
  let cursor = centralOffset;
  let totalRaw = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (cursor + 46 > eocd || bytes.readUInt32LE(cursor) !== ZIP_CENTRAL) {
      fail("ARCHIVE_CENTRAL_ENTRY_INVALID", String(index));
    }
    const flags = bytes.readUInt16LE(cursor + 8);
    const method = bytes.readUInt16LE(cursor + 10);
    const expectedCrc = bytes.readUInt32LE(cursor + 16);
    const compressedSize = bytes.readUInt32LE(cursor + 20);
    const uncompressedSize = bytes.readUInt32LE(cursor + 24);
    const nameBytes = bytes.readUInt16LE(cursor + 28);
    const extraBytes = bytes.readUInt16LE(cursor + 30);
    const commentBytes = bytes.readUInt16LE(cursor + 32);
    const localOffset = bytes.readUInt32LE(cursor + 42);
    const next = cursor + 46 + nameBytes + extraBytes + commentBytes;
    const archivePath = strictText(bytes.subarray(cursor + 46, cursor + 46 + nameBytes),
      "ARCHIVE_PATH_UTF8_INVALID");
    if ((flags & 1) !== 0 || ![0, 8].includes(method) || next > eocd
      || !SAFE_PATH.test(archivePath) || archivePath.startsWith("/")
      || localOffset + 30 > centralOffset || bytes.readUInt32LE(localOffset) !== ZIP_LOCAL) {
      fail("ARCHIVE_ENTRY_UNSUPPORTED", archivePath);
    }
    const localNameBytes = bytes.readUInt16LE(localOffset + 26);
    const localExtraBytes = bytes.readUInt16LE(localOffset + 28);
    const localName = strictText(bytes.subarray(localOffset + 30,
      localOffset + 30 + localNameBytes), "ARCHIVE_LOCAL_PATH_UTF8_INVALID");
    const dataOffset = localOffset + 30 + localNameBytes + localExtraBytes;
    if (localName !== archivePath || dataOffset + compressedSize > centralOffset) {
      fail("ARCHIVE_LOCAL_BINDING_INVALID", archivePath);
    }
    const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
    let raw;
    try {
      raw = method === 0 ? Buffer.from(compressed)
        : inflateRawSync(compressed, { maxOutputLength: Math.max(1, uncompressedSize) });
    } catch { fail("ARCHIVE_INFLATE_INVALID", archivePath); }
    if (raw.length !== uncompressedSize || crc32(raw) !== expectedCrc) {
      fail("ARCHIVE_ENTRY_INTEGRITY_INVALID", archivePath);
    }
    totalRaw += raw.length;
    if (totalRaw > MAX_UNCOMPRESSED_BYTES) fail("ARCHIVE_TOTAL_RAW_TOO_LARGE");
    entries.push({ archivePath, method, compressedSize, uncompressedSize,
      crc32: expectedCrc.toString(16).padStart(8, "0"),
      rawSha256: rmpdSha256(raw), raw });
    cursor = next;
  }
  if (cursor !== centralOffset + centralBytes
    || new Set(entries.map((entry) => entry.archivePath)).size !== entries.length) {
    fail("ARCHIVE_CENTRAL_LENGTH_OR_DUPLICATE_INVALID");
  }
  const expectedPaths = ["samples/", ...Object.keys(CSV_PROFILE).sort()];
  const actualPaths = entries.map((entry) => entry.archivePath).sort();
  if (!same(actualPaths, expectedPaths.sort())) fail("ARCHIVE_PATH_SET_INVALID");
  const files = new Map(entries.map((entry) => [entry.archivePath, entry.raw]));
  return { files, inventory: entries.map(({ raw, ...entry }) => entry),
    totalRawBytes: totalRaw, centralBytes, centralOffset, entryCount };
}

function parseCsv(bytes, archivePath, expected) {
  const text = strictText(bytes, "CSV_UTF8_INVALID");
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === "\"") {
        if (text[index + 1] === "\"") { value += "\""; index += 1; }
        else quoted = false;
      } else value += character;
    } else if (character === "\"") {
      if (value !== "") fail("CSV_QUOTE_POSITION_INVALID", archivePath);
      quoted = true;
    } else if (character === ",") {
      row.push(value); value = "";
    } else if (character === "\n") {
      row.push(value.endsWith("\r") ? value.slice(0, -1) : value);
      rows.push(row); row = []; value = "";
    } else value += character;
  }
  if (quoted) fail("CSV_UNTERMINATED_QUOTE", archivePath);
  if (value !== "" || row.length > 0) { row.push(value); rows.push(row); }
  const header = rows.shift();
  if (!same(header, expected.header) || rows.length !== expected.rows
    || rows.some((item) => item.length !== header.length)) {
    fail("CSV_PROFILE_INVALID", archivePath);
  }
  return { header, rows };
}

function numberValue(value, code) {
  if (value === "" || !Number.isFinite(Number(value))) fail(code, value);
  return Number(value);
}

function analyzeCsvs(files) {
  const parsed = new Map();
  for (const [archivePath, expected] of Object.entries(CSV_PROFILE)) {
    parsed.set(archivePath, parseCsv(files.get(archivePath), archivePath, expected));
  }
  const info = parsed.get("samples/rmpd_motion_traj_info.csv");
  const trajectoryIds = new Set(info.rows.map((row) => row[0]));
  if (trajectoryIds.size !== 6 || info.rows.some((row) => row[1] !== "abb_irb4400"
    || row[2] !== "abb_steuerung" || row[6] !== "leica_at960"
    || row[7] !== "abb_websocket" || numberValue(row[24], "WEIGHT_INVALID") !== 12
    || numberValue(row[28], "SET_VELOCITY_INVALID") !== 3_000)) {
    fail("TRAJECTORY_INFO_PROFILE_INVALID");
  }
  const metadata = parsed.get("samples/rmpd_motion_traj_metadata.csv").rows;
  const segmentIds = new Set(metadata.map((row) => row[0]));
  const primitiveMovement = new Set(["linear", "circular"]);
  const primitiveSegments = new Set(metadata.filter((row) => primitiveMovement.has(row[2]))
    .map((row) => row[0]));
  const aggregateSegments = new Set(metadata.filter((row) => !primitiveMovement.has(row[2]))
    .map((row) => row[0]));
  const movementCounts = Object.fromEntries([...new Set(metadata.map((row) => row[2]))]
    .sort().map((movement) => [movement, metadata.filter((row) => row[2] === movement).length]));
  if (segmentIds.size !== 24 || primitiveSegments.size !== 18 || aggregateSegments.size !== 6
    || !same(movementCounts, { circular: 3, cll: 1, lcl: 2, linear: 15, lll: 3 })) {
    fail("SEGMENT_PROFILE_INVALID");
  }
  let finiteNumericValues = 0;
  let embeddingScalars = 0;
  const timeSeries = {};
  const timeSeriesPaths = [
    "samples/rmpd_motion_traj_pose_act.csv",
    "samples/rmpd_motion_traj_pose_act_raw.csv",
    "samples/rmpd_motion_traj_position_cmd.csv",
    "samples/rmpd_motion_traj_orientation_cmd.csv",
    "samples/rmpd_motion_traj_joint_states.csv",
    "samples/rmpd_motion_traj_vel_act.csv",
    "samples/rmpd_motion_traj_vel_cmd.csv",
    "samples/rmpd_motion_traj_accel_act.csv",
    "samples/rmpd_motion_traj_accel_cmd.csv",
  ];
  for (const archivePath of timeSeriesPaths) {
    const table = parsed.get(archivePath);
    const last = new Map();
    let decreases = 0;
    let duplicates = 0;
    for (const row of table.rows) {
      if (!trajectoryIds.has(row[0]) || !primitiveSegments.has(row[1])
        || !/^\d+$/u.test(row[2])) fail("TIME_SERIES_ID_INVALID", archivePath);
      const key = `${row[0]}\0${row[1]}`;
      const timestamp = BigInt(row[2]);
      if (last.has(key)) {
        if (timestamp < last.get(key)) decreases += 1;
        if (timestamp === last.get(key)) duplicates += 1;
      }
      last.set(key, timestamp);
      for (const value of row.slice(3)) {
        numberValue(value, "TIME_SERIES_NUMERIC_INVALID");
        finiteNumericValues += 1;
      }
    }
    if (last.size !== 18 || decreases !== 0 || duplicates !== 0) {
      fail("TIME_SERIES_ORDER_INVALID", archivePath);
    }
    timeSeries[path.basename(archivePath, ".csv").replace("rmpd_motion_", "")] = {
      rows: table.rows.length, primitiveSegmentGroups: last.size,
      timestampDecreases: decreases, duplicateTimestamps: duplicates,
    };
  }
  const embeddings = parsed.get("samples/rmpd_motion_traj_embeddings.csv").rows;
  const expectedEmbeddingLengths = [60, 30, 30, 30, 14];
  for (const row of embeddings) {
    if (!segmentIds.has(row[0]) || !trajectoryIds.has(row[1])) {
      fail("EMBEDDING_ID_INVALID");
    }
    for (let index = 2; index < row.length; index += 1) {
      let values;
      try { values = JSON.parse(row[index]); } catch { fail("EMBEDDING_JSON_INVALID"); }
      if (!Array.isArray(values) || values.length !== expectedEmbeddingLengths[index - 2]
        || values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
        fail("EMBEDDING_PROFILE_INVALID");
      }
      embeddingScalars += values.length;
    }
  }
  const metricSummaries = {};
  for (const metric of ["ed", "sidtw", "qdtw", "gd"]) {
    const detail = parsed.get(`samples/rmpd_evaluation_${metric}_evaluation.csv`);
    const summary = parsed.get(`samples/rmpd_evaluation_${metric}_info.csv`);
    const pointOrderIndex = metric === "ed" ? 3 : metric === "sidtw" ? 9 : 11;
    const last = new Map();
    let pointOrderGaps = 0;
    for (const row of detail.rows) {
      if (!trajectoryIds.has(row[0]) || !primitiveSegments.has(row[1])) {
        fail("METRIC_DETAIL_ID_INVALID", metric);
      }
      const key = `${row[0]}\0${row[1]}`;
      const ordinal = numberValue(row[pointOrderIndex], "POINT_ORDER_INVALID");
      if (last.has(key) && ordinal !== last.get(key) + 1) pointOrderGaps += 1;
      last.set(key, ordinal);
      for (const value of row.slice(2)) {
        numberValue(value, "METRIC_DETAIL_NUMERIC_INVALID");
        finiteNumericValues += 1;
      }
    }
    if (last.size !== 18 || pointOrderGaps !== 0) {
      fail("METRIC_POINT_ORDER_PROFILE_INVALID", metric);
    }
    const columns = [2, 3, 4, 5].map((index) => summary.rows.map((row) => {
      if (!trajectoryIds.has(row[0]) || !segmentIds.has(row[1])) {
        fail("METRIC_SUMMARY_ID_INVALID", metric);
      }
      finiteNumericValues += 1;
      return numberValue(row[index], "METRIC_SUMMARY_NUMERIC_INVALID");
    }));
    const observed = { minimum: Math.min(...columns[0]), maximum: Math.max(...columns[1]),
      averageMinimum: Math.min(...columns[2]), averageMaximum: Math.max(...columns[2]),
      standardDeviationMinimum: Math.min(...columns[3]),
      standardDeviationMaximum: Math.max(...columns[3]) };
    if (!same(observed, METRIC_RANGES[metric])) fail("METRIC_RANGE_CHANGED", metric);
    metricSummaries[metric] = { detailRows: detail.rows.length, detailSegmentGroups: last.size,
      summaryRows: summary.rows.length, pointOrderGaps, ranges: observed };
  }
  const robot = parsed.get("samples/rmpd_motion_robot_info.csv").rows[0];
  if (robot[0] !== "abb_irb4400" || robot[12] !== "robotware_5.16"
    || numberValue(robot[14], "ROBOT_AXES_INVALID") !== 6) fail("ROBOT_PROFILE_INVALID");
  return deepFreeze({ trajectoryCount: 6, metadataSegmentCount: 24,
    primitiveSegmentCount: 18, aggregateTrajectorySegmentCount: 6,
    movementCounts, timeSeries, metricSummaries, embeddingRows: embeddings.length,
    embeddingScalars, finiteNumericValues, robot: { model: robot[0], firmware: robot[12],
      axes: 6, publisherMaximumPayload: numberValue(robot[3], "ROBOT_PAYLOAD_INVALID") },
    publisherMeasurementSources: { actual: "leica_at960", commanded: "abb_websocket" } });
}

function validateSql(bytes) {
  const text = strictText(bytes, "SCHEMA_SQL_UTF8_INVALID");
  const tables = [...text.matchAll(/CREATE TABLE (evaluation|motion)\.([a-z_]+) \(/gu)]
    .map((match) => `${match[1]}.${match[2]}`);
  const expectedTables = [
    "evaluation.ed_evaluation", "evaluation.ed_info", "evaluation.gd_evaluation",
    "evaluation.gd_info", "evaluation.qdtw_evaluation", "evaluation.qdtw_info",
    "evaluation.sidtw_evaluation", "evaluation.sidtw_info", "motion.robot_info",
    "motion.traj_accel_act", "motion.traj_accel_cmd", "motion.traj_embeddings",
    "motion.traj_info", "motion.traj_joint_states", "motion.traj_metadata",
    "motion.traj_orientation_cmd", "motion.traj_pose_act", "motion.traj_pose_act_raw",
    "motion.traj_position_cmd", "motion.traj_setpoints", "motion.traj_vel_act",
    "motion.traj_vel_cmd",
  ];
  if (!same(tables.sort(), expectedTables.sort())
    || !text.includes("CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA motion;")
    || !text.includes("Dumped from database version 16.11")) fail("SCHEMA_SQL_PROFILE_INVALID");
  return deepFreeze({ bytes: bytes.length, sha256: rmpdSha256(bytes), tableCount: tables.length,
    schemas: ["evaluation", "motion"], pgvectorDeclared: true,
    sqlExecuted: false, databaseRestored: false });
}

function manifestBody(sourceDirectory) {
  safeDirectory(sourceDirectory, "SOURCE_DIRECTORY_INVALID");
  const expectedNames = ["record-after.json", "record-before.json", "samples.zip",
    "schema_rmpd.sql"];
  const actualNames = readdirSync(sourceDirectory).filter((name) => name !== "source-manifest.json")
    .sort();
  if (!same(actualNames, expectedNames)) fail("SOURCE_LAYOUT_INVALID");
  const files = expectedNames.map((name) => {
    const file = path.join(sourceDirectory, name);
    safeRegular(file, "SOURCE_FILE_INVALID");
    const bytes = readFileSync(file);
    return { path: name, bytes: bytes.length, sha256: rmpdSha256(bytes) };
  });
  const before = readFileSync(path.join(sourceDirectory, "record-before.json"));
  const after = readFileSync(path.join(sourceDirectory, "record-after.json"));
  const beforeProjection = recordProjection(before);
  const afterProjection = recordProjection(after);
  if (!same(beforeProjection, afterProjection)) fail("RECORD_BRACKET_CHANGED");
  for (const name of ["samples.zip", "schema_rmpd.sql"]) {
    const bytes = readFileSync(path.join(sourceDirectory, name));
    const expected = EXPECTED_FILES[name];
    if (bytes.length !== expected.bytes || md5(bytes) !== expected.md5
      || rmpdSha256(bytes) !== `sha256:${expected.sha256}`) fail("SELECTED_FILE_CHANGED", name);
  }
  const body = { schema: RMPD_SOURCE_MANIFEST_SCHEMA, record: beforeProjection,
    selectedFiles: ["samples.zip", "schema_rmpd.sql"],
    excludedFiles: [{ key: "rmpd.dump", bytes: EXPECTED_FILES["rmpd.dump"].bytes,
      md5: EXPECTED_FILES["rmpd.dump"].md5, contentAcquired: false }], files };
  return { ...body, sourceRoot: rmpdDigest(body, RMPD_SOURCE_MANIFEST_SCHEMA) };
}

export function createRmpdSourceManifestFromDirectory(sourceDirectory) {
  return deepFreeze(manifestBody(sourceDirectory));
}

export function verifyRmpdSourceDirectory(sourceDirectory) {
  const expected = manifestBody(sourceDirectory);
  const manifestFile = path.join(sourceDirectory, "source-manifest.json");
  safeRegular(manifestFile, "SOURCE_MANIFEST_FILE_INVALID");
  const manifest = strictJson(readFileSync(manifestFile), "SOURCE_MANIFEST_JSON_INVALID");
  if (!same(manifest, expected)) fail("SOURCE_MANIFEST_REBUILD_MISMATCH");
  const archive = readFileSync(path.join(sourceDirectory, "samples.zip"));
  const parsedArchive = parseZip(archive);
  const replay = analyzeCsvs(parsedArchive.files);
  const sql = validateSql(readFileSync(path.join(sourceDirectory, "schema_rmpd.sql")));
  return deepFreeze({ ok: true, sourceRoot: expected.sourceRoot, manifest: expected,
    archive: { bytes: archive.length, sha256: rmpdSha256(archive), md5: md5(archive),
      entryCount: parsedArchive.entryCount, totalRawBytes: parsedArchive.totalRawBytes,
      centralBytes: parsedArchive.centralBytes, centralOffset: parsedArchive.centralOffset,
      inventoryHash: rmpdDigest(parsedArchive.inventory, "outsider/rmpd-zip-inventory/v1") },
    replay, sql });
}

export function buildRmpdRobotMotionSampleFromSource(sourceDirectory) {
  const verified = verifyRmpdSourceDirectory(sourceDirectory);
  const body = {
    schema: RMPD_REPORT_SCHEMA,
    disposition: RMPD_DISPOSITION,
    source: {
      recordId: RMPD_RECORD_ID,
      doi: RMPD_DOI,
      revision: RMPD_REVISION,
      sourceRoot: verified.sourceRoot,
      fullSelectedSourceReplay: true,
      completeDatabaseDumpAcquired: false,
    },
    declaredScope: {
      class: "FULL_PUBLISHER_PROVIDED_SAMPLE_AND_SCHEMA",
      sampleArchiveFiles: 22,
      sampleTrajectoryUniverseComplete: true,
      sampleTrajectoryCount: 6,
      fullDatabaseTrajectoryClaim: 31_025,
      fullDatabaseClaimByteVerified: false,
      fullDatabaseDumpBytes: EXPECTED_FILES["rmpd.dump"].bytes,
      fullDatabaseDumpAcquired: false,
      declaredScopeExhausted: true,
      sourceUniverseExhausted: false,
      globalExhaustion: false,
    },
    denominatorRegistry: {
      populations: [
        { id: "RMPD_SAMPLE_MECHANICAL_TRAJECTORY", unit: "sample trajectory", count: 6 },
        { id: "RMPD_SAMPLE_PRIMITIVE_MOTION_SEGMENT", unit: "primitive segment", count: 18 },
        { id: "RMPD_SAMPLE_METADATA_SEGMENT_RECORD", unit: "metadata segment", count: 24 },
        { id: "RMPD_SAMPLE_MEASURED_POSE_RECORD", unit: "measured pose row", count: 12_816 },
        { id: "RMPD_SAMPLE_COMMANDED_POSITION_RECORD", unit: "commanded position row",
          count: 6_105 },
      ],
      crossPopulationTotal: null,
      crossPopulationAdditionProhibited: true,
      fullDatabasePopulationIncluded: false,
    },
    sourceReplay: {
      sourceVerificationLevel: "FULL_SELECTED_SOURCE_REDERIVED",
      archive: verified.archive,
      sql: verified.sql,
      csvTableCount: 22,
      replay: verified.replay,
      commandsOrSqlExecuted: false,
    },
    mechanicalEvidence: {
      robot: verified.replay.robot,
      sampledTrajectories: verified.replay.trajectoryCount,
      metadataSegments: verified.replay.metadataSegmentCount,
      primitiveSegments: verified.replay.primitiveSegmentCount,
      movementCounts: verified.replay.movementCounts,
      commandedControllerSource: "abb_websocket",
      measuredPoseSource: "leica_at960",
      measuredPosePublisherClaimSamplingHertz: 1_000,
      instrumentDistinctCommandMeasuredPathsPresent: true,
      instrumentOperationalIndependenceExternallyAudited: false,
      publisherDistanceMetrics: verified.replay.metricSummaries,
      taskOutcomeEstablished: false,
      failureEstablished: false,
      recoveryEstablished: false,
    },
    segmentCoverage: {
      opportunityCensus: 0,
      delegationAuthorization: 0,
      actionTrace: 6,
      mechanicalCommandMeasuredComparison: 6,
      taskEffect: 0,
      taskOutcome: 0,
      recovery: 0,
      longitudinal: 0,
      completeEpisodeIntersection: 0,
      crossSegmentAdditionProhibited: true,
    },
    rightsPrivacyRevisionAndUse: {
      publisherLicenseClaim: "CC-BY-4.0",
      legalConclusionEstablished: false,
      redistributionAuthorizedByOutsider: false,
      productionTrainingAuthorized: false,
      revisionPinnedAndReplayed: true,
      containsHumanImagery: false,
      noPiiGuaranteed: false,
      rawContentProjected: false,
      offlineResearchOnly: true,
    },
    boundary: {
      authorizedTrainingRows: 0,
      productionTrainingPerformed: false,
      networkAdmission: false,
      delegationAuthority: false,
      actionAuthorityUnits: 0,
      causalExperienceUnits: 0,
      closureCredit: 0,
      pricingAuthorized: false,
      guaranteeAuthorized: false,
      settlementAuthorized: false,
    },
  };
  return deepFreeze({ ...body, artifactHash: rmpdDigest(body, RMPD_REPORT_SCHEMA) });
}

export function verifyRmpdRobotMotionSample(report, sourceDirectory) {
  try {
    const rebuilt = buildRmpdRobotMotionSampleFromSource(sourceDirectory);
    if (!report || report.schema !== RMPD_REPORT_SCHEMA || !HASH.test(report.artifactHash ?? "")
      || !same(report, rebuilt)) return Object.freeze({ ok: false,
        error: "RMPD_REPORT_REBUILD_MISMATCH" });
    return Object.freeze({ ok: true, artifactHash: rebuilt.artifactHash,
      sourceRoot: rebuilt.source.sourceRoot, sampleTrajectories: 6,
      measuredPoseRows: 12_816, completeEpisodeIntersection: 0 });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function createRmpdReceipt(report, reportBytes, manifestBytes) {
  if (!report || report.schema !== RMPD_REPORT_SCHEMA
    || !Buffer.isBuffer(reportBytes) || !Buffer.isBuffer(manifestBytes)
    || !same(strictJson(reportBytes, "REPORT_BYTES_JSON_INVALID"), report)) {
    fail("RECEIPT_INPUT_INVALID");
  }
  const body = { schema: RMPD_RECEIPT_SCHEMA, artifactHash: report.artifactHash,
    sourceRoot: report.source.sourceRoot, reportFileSha256: rmpdSha256(reportBytes),
    sourceManifestFileSha256: rmpdSha256(manifestBytes),
    fullSelectedSourceReplay: true, completeEpisodeIntersection: 0,
    authorizedTrainingRows: 0, networkAdmission: false, delegationAuthority: false };
  return deepFreeze({ ...body, receiptHash: rmpdDigest(body, RMPD_RECEIPT_SCHEMA) });
}

function artifactSnapshot(directory) {
  const root = safeDirectory(directory, "ARTIFACT_DIRECTORY_INVALID");
  const entries = readdirSync(directory).sort();
  if (!same(entries, ["report.json", "run-receipt.json", "source"])) {
    fail("ARTIFACT_LAYOUT_INVALID");
  }
  const source = safeDirectory(path.join(directory, "source"), "ARTIFACT_SOURCE_INVALID");
  const files = ["report.json", "run-receipt.json"].map((name) => {
    const file = path.join(directory, name);
    const stat = safeRegular(file, "ARTIFACT_FILE_INVALID");
    return { name, mode: stat.mode & 0o777, size: stat.size, inode: stat.ino,
      mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs };
  });
  return { root: { mode: root.mode & 0o777, inode: root.ino, mtimeMs: root.mtimeMs,
    ctimeMs: root.ctimeMs }, source: { mode: source.mode & 0o777, inode: source.ino,
    mtimeMs: source.mtimeMs, ctimeMs: source.ctimeMs }, entries, files };
}

export function verifyRmpdArtifactDirectory(directory) {
  try {
    const before = artifactSnapshot(directory);
    if (before.root.mode !== 0o700 || before.source.mode !== 0o700
      || before.files.some((file) => file.mode !== 0o600)) {
      return Object.freeze({ ok: false, error: "RMPD_ARTIFACT_MODE_INVALID" });
    }
    const sourceDirectory = path.join(directory, "source");
    for (const name of readdirSync(sourceDirectory)) {
      const stat = lstatSync(path.join(sourceDirectory, name));
      if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o600) {
        return Object.freeze({ ok: false, error: "RMPD_SOURCE_FILE_MODE_INVALID" });
      }
    }
    const reportBytes = readFileSync(path.join(directory, "report.json"));
    const report = strictJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const verification = verifyRmpdRobotMotionSample(report, sourceDirectory);
    if (!verification.ok) return verification;
    const receipt = strictJson(readFileSync(path.join(directory, "run-receipt.json")),
      "ARTIFACT_RECEIPT_JSON_INVALID");
    const manifestBytes = readFileSync(path.join(sourceDirectory, "source-manifest.json"));
    const expectedReceipt = createRmpdReceipt(report, reportBytes, manifestBytes);
    if (!same(receipt, expectedReceipt)) return Object.freeze({ ok: false,
      error: "RMPD_RECEIPT_REBUILD_MISMATCH" });
    const after = artifactSnapshot(directory);
    if (!same(before, after)) return Object.freeze({ ok: false,
      error: "RMPD_ARTIFACT_CHANGED_DURING_VERIFICATION" });
    return Object.freeze({ ...verification, receiptHash: receipt.receiptHash,
      reportFileSha256: rmpdSha256(reportBytes),
      sourceManifestFileSha256: rmpdSha256(manifestBytes) });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeRmpdArtifact(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

export function publishRmpdArtifactFromSeed(seedDirectory, stagingDirectory, targetDirectory) {
  if (path.resolve(stagingDirectory) === path.resolve(targetDirectory)) {
    fail("PUBLISH_PATH_COLLISION");
  }
  safeDirectory(seedDirectory, "SEED_DIRECTORY_INVALID");
  mkdirSync(stagingDirectory, { recursive: false, mode: 0o700 });
  const sourceDirectory = path.join(stagingDirectory, "source");
  mkdirSync(sourceDirectory, { mode: 0o700 });
  for (const name of ["record-before.json", "record-after.json", "samples.zip",
    "schema_rmpd.sql"]) {
    const bytes = readFileSync(path.join(seedDirectory, name));
    writeFileSync(path.join(sourceDirectory, name), bytes, { mode: 0o600, flag: "wx" });
  }
  const manifest = createRmpdSourceManifestFromDirectory(sourceDirectory);
  const manifestBytes = serializeRmpdArtifact(manifest);
  writeFileSync(path.join(sourceDirectory, "source-manifest.json"), manifestBytes,
    { mode: 0o600, flag: "wx" });
  const report = buildRmpdRobotMotionSampleFromSource(sourceDirectory);
  const reportBytes = serializeRmpdArtifact(report);
  writeFileSync(path.join(stagingDirectory, "report.json"), reportBytes,
    { mode: 0o600, flag: "wx" });
  const receipt = createRmpdReceipt(report, reportBytes, manifestBytes);
  writeFileSync(path.join(stagingDirectory, "run-receipt.json"), serializeRmpdArtifact(receipt),
    { mode: 0o600, flag: "wx" });
  chmodSync(sourceDirectory, 0o700);
  chmodSync(stagingDirectory, 0o700);
  const verification = verifyRmpdArtifactDirectory(stagingDirectory);
  if (!verification.ok) fail("STAGING_VERIFICATION_FAILED", verification.error);
  renameSync(stagingDirectory, targetDirectory);
  return verification;
}

export function cleanupRmpdStagingDirectory(stagingDirectory) {
  rmSync(stagingDirectory, { recursive: true, force: true });
}

export const RMPD_EXPECTED_FILES = EXPECTED_FILES;
