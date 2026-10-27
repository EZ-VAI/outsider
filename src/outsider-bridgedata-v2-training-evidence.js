/*
 * BridgeData V2 source-aware training-candidate evidence.
 *
 * This lane proves a small, byte-pinned slice of real robot trajectory data
 * and the publisher's CC BY 4.0 statement.  It deliberately does not turn a
 * single TFRecord into a claim that the full corpus was inspected, that model
 * quality improved, or that an Outsider trainer/authority was exercised.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, lstatSync, openSync,
  readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";

export const BRIDGEDATA_V2_TRAINING_EVIDENCE_SCHEMA
  = "outsider/bridgedata-v2-training-evidence/v1";
const FROZEN_AT = "2026-08-22T00:00:00.000Z";
const MAX_FILE_BYTES = 4 * 1024 * 1024;
const CANONICAL_ARTIFACT_HASH
  = "sha256:1db2d9b893cdb6cfc604154a787d70092b5a6c03d2122f2b81f56fa9e79e97c2";
const ARTIFACT_STRUCTURAL_SHAPE_HASH
  = "sha256:04705e91e1383cae539cd495f634caee789eb900daf9c46d82f5834f48205f1c";

export const BRIDGEDATA_V2_FROZEN_SOURCE_20260822 = Object.freeze({
  sourceId: "BERKELEY_RAIL_BRIDGEDATA_V2_TFDS_1_0_0_MINIMAL_RECORD_20260822",
  frozenAt: FROZEN_AT,
  parentShard: Object.freeze({
    url: "https://rail.eecs.berkeley.edu/datasets/bridge_release/data/tfds/bridge_dataset/1.0.0/bridge_dataset-train.tfrecord-00000-of-01024",
    contentLength: 108_381_239,
    etag: '"675c437-605e3b1511a6d"',
    lastModified: "Thu, 21 Sep 2023 19:42:30 GMT",
    capturedRange: "bytes=0-3092033",
  }),
  files: Object.freeze([
    Object.freeze({ name: "bridgedata-v2-project-20260822.html", kind: "PROJECT_AND_DATA_LICENSE_PAGE",
      url: "https://rail-berkeley.github.io/bridgedata/", bytes: 31_252,
      sha256: "sha256:9be7a758ab24782955a6fa4145bbed80527671939e4f40dff70e22ee9b69c580" }),
    Object.freeze({ name: "tfds-index-1.0.0-20260822.html", kind: "OFFICIAL_TFDS_DIRECTORY_INDEX",
      url: "https://rail.eecs.berkeley.edu/datasets/bridge_release/data/tfds/bridge_dataset/1.0.0/",
      bytes: 317_995, sha256: "sha256:975c80df400b8d6b2c1d0748f566f8ea189f695b8abce51bc5e81c574a04077a" }),
    Object.freeze({ name: "dataset_info.json", kind: "TFDS_DATASET_INFO",
      url: "https://rail.eecs.berkeley.edu/datasets/bridge_release/data/tfds/bridge_dataset/1.0.0/dataset_info.json",
      bytes: 17_009, sha256: "sha256:977f2efb2a4be1d839b0b67b9cae8f2007568a1da689ad170f1b72846dc54653" }),
    Object.freeze({ name: "features.json", kind: "TFDS_FEATURE_SCHEMA",
      url: "https://rail.eecs.berkeley.edu/datasets/bridge_release/data/tfds/bridge_dataset/1.0.0/features.json",
      bytes: 14_194, sha256: "sha256:b1b139dc3d48bc71b1f01552f6ad267fc35527cb756dbea4b089a44d6d128c4f" }),
    Object.freeze({ name: "action_proprio_stats_7d6a416829d818b733e7342f225f3c522a8265a5224e0175f2ab28e26a932ff1.json",
      kind: "ACTION_PROPRIO_STATS_PROFILE", url: "https://rail.eecs.berkeley.edu/datasets/bridge_release/data/tfds/bridge_dataset/1.0.0/action_proprio_stats_7d6a416829d818b733e7342f225f3c522a8265a5224e0175f2ab28e26a932ff1.json",
      bytes: 1_254, sha256: "sha256:1d22ea6845cea045ba9f09f86b142039a165bf049c7d9578000e464d88ecb860" }),
    Object.freeze({ name: "action_proprio_stats_9ccaabde9b86d1b6d3bfdf6fcfc1ab326e3265b928ae4dd4cab47e2067b9ecab.json",
      kind: "ACTION_PROPRIO_STATS_PROFILE", url: "https://rail.eecs.berkeley.edu/datasets/bridge_release/data/tfds/bridge_dataset/1.0.0/action_proprio_stats_9ccaabde9b86d1b6d3bfdf6fcfc1ab326e3265b928ae4dd4cab47e2067b9ecab.json",
      bytes: 1_262, sha256: "sha256:156db9daf1790df2e07bacf176f8dadb2c4fc48cb6606eb14b07a477b487979c" }),
    Object.freeze({ name: "action_proprio_stats_4203a9a0c2e65f37c33c477d42e8f9d87929e12a4df4e51dbf1479f417d7f3e5.json",
      kind: "ACTION_PROPRIO_STATS_PROFILE", url: "https://rail.eecs.berkeley.edu/datasets/bridge_release/data/tfds/bridge_dataset/1.0.0/action_proprio_stats_4203a9a0c2e65f37c33c477d42e8f9d87929e12a4df4e51dbf1479f417d7f3e5.json",
      bytes: 1_254, sha256: "sha256:8c305fb34df6123e7e5783f5613ef90ac78762bb54a77219499ef82019ed3536" }),
    Object.freeze({ name: "action_proprio_stats_eb41baf7d978d166b787f61ef00e0c6a1b747c3dc68e2d19167bf750b025c417.json",
      kind: "ACTION_PROPRIO_STATS_PROFILE", url: "https://rail.eecs.berkeley.edu/datasets/bridge_release/data/tfds/bridge_dataset/1.0.0/action_proprio_stats_eb41baf7d978d166b787f61ef00e0c6a1b747c3dc68e2d19167bf750b025c417.json",
      bytes: 1_242, sha256: "sha256:fb0e6bd375fb5d2b04dd7f7da34fec23918d1b4a46bc506ed593f755481281cf" }),
    Object.freeze({ name: "bridge_dataset-train-record-00000.tfrecord", kind: "EXACT_FIRST_TFRECORD_BYTE_RANGE_SAMPLE",
      url: "https://rail.eecs.berkeley.edu/datasets/bridge_release/data/tfds/bridge_dataset/1.0.0/bridge_dataset-train.tfrecord-00000-of-01024",
      bytes: 3_092_034, sha256: "sha256:c23e3a89f8be58533e132a5c9102281ad208f13952441641332b4483e932fbf0",
      httpRange: "bytes=0-3092033" }),
  ]),
});

const EXPECTED_NAMES = Object.freeze(BRIDGEDATA_V2_FROZEN_SOURCE_20260822.files.map((file) => file.name));
const EXPECTED_DIRECTORY_NAMES = Object.freeze([...EXPECTED_NAMES, "acquisition.json"].sort());

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function digest(value) { return sha256(Buffer.from(canonicalizeStrict(value))); }
function artifactDigest(value) {
  return digest({ domain: BRIDGEDATA_V2_TRAINING_EVIDENCE_SCHEMA, value });
}
function sortedCounts(values) {
  const counts = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}
function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function structuralShape(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    const memberShapes = [...new Set(value.map((item) => canonicalizeStrict(structuralShape(item))))]
      .sort().map((item) => JSON.parse(item));
    return { type: "array", memberShapes };
  }
  if (typeof value === "object") {
    return {
      type: "object",
      fields: Object.fromEntries(Object.keys(value).sort()
        .map((key) => [key, structuralShape(value[key])])),
    };
  }
  return typeof value;
}
function structuralShapeHash(value) {
  return digest({
    domain: `${BRIDGEDATA_V2_TRAINING_EVIDENCE_SCHEMA}/structural-shape/v1`,
    value: structuralShape(value),
  });
}
function canonicalTime(value, code) {
  if (typeof value !== "string" || value.length > 40 || !Number.isFinite(Date.parse(value))) {
    throw new Error(`${code}_INVALID`);
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) throw new Error(`${code}_NON_CANONICAL`);
  if (normalized !== FROZEN_AT) throw new Error(`${code}_NOT_FROZEN_SNAPSHOT`);
  return normalized;
}

export function bridgedataV2ExpectedAcquisitionManifest() {
  return {
    schema: "outsider/bridgedata-v2-acquisition-manifest/v1",
    sourceId: BRIDGEDATA_V2_FROZEN_SOURCE_20260822.sourceId,
    capturedAt: FROZEN_AT,
    transportAttested: false,
    parentShard: BRIDGEDATA_V2_FROZEN_SOURCE_20260822.parentShard,
    objects: BRIDGEDATA_V2_FROZEN_SOURCE_20260822.files.map((file) => ({
      name: file.name, kind: file.kind, url: file.url, bytes: file.bytes,
      sha256: file.sha256, httpRange: file.httpRange ?? null,
      acquisition: file.httpRange ? "EXACT_HTTPS_RANGE_CAPTURE_IMPORT" : "EXACT_HTTPS_CAPTURE_IMPORT",
    })),
  };
}

function stableReadExactManifest(directory, expectedBytes) {
  const target = path.join(directory, "acquisition.json");
  const pathBefore = lstatSync(target, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink()
    || pathBefore.size !== BigInt(expectedBytes.length)) {
    throw new Error("BRIDGEDATA_ACQUISITION_MANIFEST_UNSAFE");
  }
  const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const before = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const pathAfter = lstatSync(target, { bigint: true });
    for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
      if (before[field] !== after[field] || before[field] !== pathBefore[field]
        || before[field] !== pathAfter[field]) throw new Error("BRIDGEDATA_ACQUISITION_MANIFEST_CHANGED");
    }
    if (!bytes.equals(expectedBytes)) throw new Error("BRIDGEDATA_ACQUISITION_MANIFEST_MISMATCH");
    return bytes;
  } finally { closeSync(fd); }
}

function stableReadSourceDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || !sourceDirectory.trim()) {
    throw new Error("BRIDGEDATA_SOURCE_DIRECTORY_INVALID");
  }
  const directory = path.resolve(sourceDirectory);
  if (directory === path.parse(directory).root) throw new Error("BRIDGEDATA_SOURCE_DIRECTORY_TOO_BROAD");
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("BRIDGEDATA_SOURCE_DIRECTORY_UNSAFE");
  if (canonicalizeStrict(readdirSync(directory).sort()) !== canonicalizeStrict(EXPECTED_DIRECTORY_NAMES)) {
    throw new Error("BRIDGEDATA_SOURCE_DIRECTORY_PROFILE_MISMATCH");
  }
  const files = {};
  for (const expected of BRIDGEDATA_V2_FROZEN_SOURCE_20260822.files) {
    const target = path.join(directory, expected.name);
    const pathBefore = lstatSync(target, { bigint: true });
    if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.size !== BigInt(expected.bytes)
      || pathBefore.size > BigInt(MAX_FILE_BYTES)) throw new Error(`BRIDGEDATA_SOURCE_FILE_UNSAFE:${expected.name}`);
    const fd = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
      const before = fstatSync(fd, { bigint: true });
      const bytes = readFileSync(fd);
      const after = fstatSync(fd, { bigint: true });
      const pathAfter = lstatSync(target, { bigint: true });
      for (const field of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) {
        if (before[field] !== after[field] || before[field] !== pathBefore[field]
          || before[field] !== pathAfter[field]) throw new Error(`BRIDGEDATA_SOURCE_FILE_CHANGED:${expected.name}`);
      }
      if (sha256(bytes) !== expected.sha256) throw new Error(`BRIDGEDATA_SOURCE_PIN_MISMATCH:${expected.name}`);
      files[expected.name] = bytes;
    } finally { closeSync(fd); }
  }
  const expectedManifest = Buffer.from(`${JSON.stringify(bridgedataV2ExpectedAcquisitionManifest(), null, 2)}\n`);
  stableReadExactManifest(directory, expectedManifest);
  return files;
}

function assertInputFiles(files) {
  if (!exactKeys(files, EXPECTED_NAMES)) throw new Error("BRIDGEDATA_INPUT_FILE_SET_INVALID");
  for (const name of EXPECTED_NAMES) {
    if (!Buffer.isBuffer(files[name]) || files[name].length <= 0 || files[name].length > MAX_FILE_BYTES) {
      throw new Error(`BRIDGEDATA_INPUT_FILE_INVALID:${name}`);
    }
  }
}

function officialPinsMatch(files) {
  return BRIDGEDATA_V2_FROZEN_SOURCE_20260822.files.every((expected) => (
    files[expected.name].length === expected.bytes && sha256(files[expected.name]) === expected.sha256
  ));
}

function parseJson(bytes, code) {
  try {
    const value = JSON.parse(bytes.toString("utf8"));
    if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("NOT_OBJECT");
    return value;
  } catch (error) { throw new Error(`${code}:${error.message}`); }
}

function readVarint(buffer, offset, end, code) {
  let result = 0n;
  let shift = 0n;
  let cursor = offset;
  while (cursor < end && shift <= 63n) {
    const byte = buffer[cursor];
    cursor += 1;
    result |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value: result, next: cursor };
    shift += 7n;
  }
  throw new Error(`${code}_VARINT_INVALID`);
}

function readLengthDelimited(buffer, offset, end, code) {
  const length = readVarint(buffer, offset, end, code);
  if (length.value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${code}_LENGTH_TOO_LARGE`);
  const start = length.next;
  const finish = start + Number(length.value);
  if (finish > end) throw new Error(`${code}_TRUNCATED`);
  return { start, end: finish, next: finish };
}

function fields(buffer, start, end, code) {
  const values = [];
  let cursor = start;
  while (cursor < end) {
    const tag = readVarint(buffer, cursor, end, code);
    cursor = tag.next;
    const field = Number(tag.value >> 3n);
    const wire = Number(tag.value & 7n);
    if (field <= 0) throw new Error(`${code}_FIELD_INVALID`);
    if (wire === 0) {
      const value = readVarint(buffer, cursor, end, code);
      values.push({ field, wire, start: cursor, end: value.next, value: value.value });
      cursor = value.next;
    } else if (wire === 1) {
      if (cursor + 8 > end) throw new Error(`${code}_FIXED64_TRUNCATED`);
      values.push({ field, wire, start: cursor, end: cursor + 8 }); cursor += 8;
    } else if (wire === 2) {
      const value = readLengthDelimited(buffer, cursor, end, code);
      values.push({ field, wire, start: value.start, end: value.end }); cursor = value.next;
    } else if (wire === 5) {
      if (cursor + 4 > end) throw new Error(`${code}_FIXED32_TRUNCATED`);
      values.push({ field, wire, start: cursor, end: cursor + 4 }); cursor += 4;
    } else throw new Error(`${code}_WIRE_UNSUPPORTED:${wire}`);
  }
  return values;
}

const CRC32C_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let crc = index;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (crc >>> 1) ^ 0x82f63b78 : crc >>> 1;
    table[index] = crc >>> 0;
  }
  return table;
})();
function crc32c(buffer, start, end) {
  let crc = 0xffffffff;
  for (let index = start; index < end; index += 1) {
    crc = CRC32C_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function maskedCrc32c(buffer, start, end) {
  const crc = crc32c(buffer, start, end);
  return ((((crc >>> 15) | (crc << 17)) >>> 0) + 0xa282ead8) >>> 0;
}

function jpegProfile(buffer, start, end) {
  if (end - start < 4 || buffer[start] !== 0xff || buffer[start + 1] !== 0xd8) return null;
  let cursor = start + 2;
  while (cursor + 3 < end) {
    if (buffer[cursor] !== 0xff) { cursor += 1; continue; }
    while (cursor < end && buffer[cursor] === 0xff) cursor += 1;
    if (cursor >= end) return null;
    const marker = buffer[cursor]; cursor += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (cursor + 2 > end) return null;
    const length = buffer.readUInt16BE(cursor);
    if (length < 2 || cursor + length > end) return null;
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]
      .includes(marker)) {
      if (length < 8) return null;
      return { width: buffer.readUInt16BE(cursor + 5), height: buffer.readUInt16BE(cursor + 3),
        components: buffer[cursor + 7], sofMarker: `0x${marker.toString(16).padStart(2, "0")}` };
    }
    cursor += length;
  }
  return null;
}

function featureSummary(buffer, start, end) {
  const kindFields = fields(buffer, start, end, "BRIDGEDATA_FEATURE");
  if (kindFields.length !== 1 || ![1, 2, 3].includes(kindFields[0].field) || kindFields[0].wire !== 2) {
    throw new Error("BRIDGEDATA_FEATURE_KIND_INVALID");
  }
  const kind = kindFields[0].field === 1 ? "BYTES_LIST" : kindFields[0].field === 2 ? "FLOAT_LIST" : "INT64_LIST";
  const listFields = fields(buffer, kindFields[0].start, kindFields[0].end, "BRIDGEDATA_FEATURE_LIST");
  if (listFields.some((field) => field.field !== 1)) throw new Error("BRIDGEDATA_FEATURE_LIST_FIELD_INVALID");
  let valueCount = 0;
  let payloadBytes = 0;
  let emptyValueCount = 0, jpegValueCount = 0, nonfiniteFloatValueCount = 0;
  let validUtf8ValueCount = 0;
  const jpegProfiles = [];
  let int64AllBooleanDomain = true;
  if (kind === "BYTES_LIST") {
    if (listFields.some((field) => field.wire !== 2)) throw new Error("BRIDGEDATA_BYTES_LIST_WIRE_INVALID");
    valueCount = listFields.length;
    payloadBytes = listFields.reduce((total, field) => total + field.end - field.start, 0);
    for (const field of listFields) {
      if (field.end === field.start) emptyValueCount += 1;
      const profile = jpegProfile(buffer, field.start, field.end);
      if (profile) { jpegValueCount += 1; jpegProfiles.push(profile); }
      try {
        new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(field.start, field.end));
        validUtf8ValueCount += 1;
      } catch { /* Binary image values are expected to fail UTF-8 and are checked as JPEG instead. */ }
    }
  } else if (kind === "FLOAT_LIST") {
    for (const field of listFields) {
      if (field.wire === 2) {
        if ((field.end - field.start) % 4 !== 0) throw new Error("BRIDGEDATA_FLOAT_LIST_LENGTH_INVALID");
        valueCount += (field.end - field.start) / 4;
        for (let cursor = field.start; cursor < field.end; cursor += 4) {
          if (!Number.isFinite(buffer.readFloatLE(cursor))) nonfiniteFloatValueCount += 1;
        }
      } else if (field.wire === 5) valueCount += 1;
      else throw new Error("BRIDGEDATA_FLOAT_LIST_WIRE_INVALID");
      if (field.wire === 5 && !Number.isFinite(buffer.readFloatLE(field.start))) {
        nonfiniteFloatValueCount += 1;
      }
      payloadBytes += field.end - field.start;
    }
  } else {
    for (const field of listFields) {
      if (field.wire === 0) {
        valueCount += 1;
        if (field.value !== 0n && field.value !== 1n) int64AllBooleanDomain = false;
      }
      else if (field.wire === 2) {
        let cursor = field.start;
        while (cursor < field.end) {
          const value = readVarint(buffer, cursor, field.end, "BRIDGEDATA_INT_LIST");
          valueCount += 1;
          if (value.value !== 0n && value.value !== 1n) int64AllBooleanDomain = false;
          cursor = value.next;
        }
      } else throw new Error("BRIDGEDATA_INT_LIST_WIRE_INVALID");
      payloadBytes += field.end - field.start;
    }
  }
  return { kind, valueCount, payloadBytes, emptyValueCount, jpegValueCount,
    validUtf8ValueCount,
    jpegProfiles: Object.entries(sortedCounts(jpegProfiles.map((profile) => (
      `${profile.width}x${profile.height}x${profile.components}@${profile.sofMarker}`
    )))).map(([profile, count]) => ({ profile, count })),
    nonfiniteFloatValueCount,
    int64AllBooleanDomain: kind === "INT64_LIST" ? int64AllBooleanDomain : null };
}

function parseExampleFeatures(buffer, start, end) {
  const example = fields(buffer, start, end, "BRIDGEDATA_EXAMPLE");
  if (example.length !== 1 || example[0].field !== 1 || example[0].wire !== 2) {
    throw new Error("BRIDGEDATA_EXAMPLE_SCHEMA_INVALID");
  }
  const featureEntries = fields(buffer, example[0].start, example[0].end, "BRIDGEDATA_FEATURES");
  const result = [];
  for (const entryField of featureEntries) {
    if (entryField.field !== 1 || entryField.wire !== 2) throw new Error("BRIDGEDATA_FEATURE_ENTRY_INVALID");
    const entry = fields(buffer, entryField.start, entryField.end, "BRIDGEDATA_FEATURE_ENTRY");
    const keyField = entry.find((field) => field.field === 1 && field.wire === 2);
    const valueField = entry.find((field) => field.field === 2 && field.wire === 2);
    if (!keyField || !valueField || entry.length !== 2) throw new Error("BRIDGEDATA_FEATURE_MAP_INVALID");
    const key = buffer.toString("utf8", keyField.start, keyField.end);
    if (!/^(steps|episode_metadata)\/[a-z0-9_/]+$/u.test(key) || key.length > 96) {
      throw new Error("BRIDGEDATA_FEATURE_KEY_INVALID");
    }
    result.push({ key, ...featureSummary(buffer, valueField.start, valueField.end) });
  }
  if (new Set(result.map((row) => row.key)).size !== result.length) {
    throw new Error("BRIDGEDATA_FEATURE_KEY_DUPLICATE");
  }
  return result.sort((left, right) => left.key.localeCompare(right.key));
}

function parseSingleTfrecord(bytes) {
  if (bytes.length < 16) throw new Error("BRIDGEDATA_TFRECORD_TOO_SMALL");
  const payloadLengthBig = bytes.readBigUInt64LE(0);
  if (payloadLengthBig > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("BRIDGEDATA_TFRECORD_LENGTH_TOO_LARGE");
  const payloadLength = Number(payloadLengthBig);
  const expectedBytes = payloadLength + 16;
  if (bytes.length !== expectedBytes) throw new Error("BRIDGEDATA_TFRECORD_EXACT_ONE_RECORD_REQUIRED");
  const storedLengthCrc = bytes.readUInt32LE(8);
  const storedDataCrc = bytes.readUInt32LE(12 + payloadLength);
  const computedLengthCrc = maskedCrc32c(bytes, 0, 8);
  const computedDataCrc = maskedCrc32c(bytes, 12, 12 + payloadLength);
  if (storedLengthCrc !== computedLengthCrc || storedDataCrc !== computedDataCrc) {
    throw new Error("BRIDGEDATA_TFRECORD_CRC32C_INVALID");
  }
  return {
    recordCount: 1,
    payloadBytes: payloadLength,
    framedBytes: bytes.length,
    lengthCrc32cMasked: storedLengthCrc,
    dataCrc32cMasked: storedDataCrc,
    allCrc32cValid: true,
    features: parseExampleFeatures(bytes, 12, 12 + payloadLength),
  };
}

function flattenExpectedFeatureKeys(features) {
  const top = features?.featuresDict?.features;
  const step = top?.steps?.sequence?.feature?.featuresDict?.features;
  const metadata = top?.episode_metadata?.featuresDict?.features;
  if (!step || !metadata) throw new Error("BRIDGEDATA_FEATURES_JSON_SHAPE_INVALID");
  const result = [];
  for (const [name, value] of Object.entries(step)) {
    if (name === "observation") {
      const observations = value?.featuresDict?.features;
      if (!observations) throw new Error("BRIDGEDATA_OBSERVATION_SCHEMA_INVALID");
      for (const child of Object.keys(observations)) result.push(`steps/observation/${child}`);
    } else result.push(`steps/${name}`);
  }
  for (const name of Object.keys(metadata)) result.push(`episode_metadata/${name}`);
  return result.sort();
}

function declaredFeatureProfile(key, feature, sequence) {
  const className = feature?.pythonClassName;
  if (className === "tensorflow_datasets.core.features.image_feature.Image") {
    const dimensions = feature.image?.shape?.dimensions?.map((item) => Number(item));
    if (!Array.isArray(dimensions) || dimensions.some((item) => !Number.isInteger(item) || item <= 0)
      || feature.image?.dtype !== "uint8" || feature.image?.encodingFormat !== "jpeg") {
      throw new Error(`BRIDGEDATA_DECLARED_IMAGE_SCHEMA_INVALID:${key}`);
    }
    return { key, sequence, pythonClassName: className, dtype: "uint8", encoding: "jpeg",
      shape: dimensions, expectedExampleKind: "BYTES_LIST", valuesPerSequenceEntry: 1 };
  }
  if (className === "tensorflow_datasets.core.features.text_feature.Text") {
    return { key, sequence, pythonClassName: className, dtype: "string", encoding: "utf8_bytes",
      shape: [], expectedExampleKind: "BYTES_LIST", valuesPerSequenceEntry: 1 };
  }
  const tensor = feature?.tensor;
  if (!["tensorflow_datasets.core.features.tensor_feature.Tensor",
    "tensorflow_datasets.core.features.scalar.Scalar"].includes(className) || !tensor) {
    throw new Error(`BRIDGEDATA_DECLARED_FEATURE_CLASS_UNSUPPORTED:${key}`);
  }
  const dimensions = tensor.shape?.dimensions?.map((item) => Number(item)) ?? [];
  if (dimensions.some((item) => !Number.isInteger(item) || item <= 0) || tensor.encoding !== "none") {
    throw new Error(`BRIDGEDATA_DECLARED_TENSOR_SCHEMA_INVALID:${key}`);
  }
  const kind = tensor.dtype === "float32" ? "FLOAT_LIST"
    : ["bool", "int32"].includes(tensor.dtype) ? "INT64_LIST" : null;
  if (!kind) throw new Error(`BRIDGEDATA_DECLARED_DTYPE_UNSUPPORTED:${key}`);
  return { key, sequence, pythonClassName: className, dtype: tensor.dtype, encoding: tensor.encoding,
    shape: dimensions, expectedExampleKind: kind,
    valuesPerSequenceEntry: dimensions.reduce((product, item) => product * item, 1) };
}

function flattenExpectedFeatureProfiles(features) {
  const top = features?.featuresDict?.features;
  const step = top?.steps?.sequence?.feature?.featuresDict?.features;
  const metadata = top?.episode_metadata?.featuresDict?.features;
  if (!step || !metadata) throw new Error("BRIDGEDATA_FEATURES_JSON_SHAPE_INVALID");
  const result = [];
  for (const [name, feature] of Object.entries(step)) {
    if (name === "observation") {
      const observations = feature?.featuresDict?.features;
      if (!observations) throw new Error("BRIDGEDATA_OBSERVATION_SCHEMA_INVALID");
      for (const [child, childFeature] of Object.entries(observations)) {
        result.push(declaredFeatureProfile(`steps/observation/${child}`, childFeature, "TIMESTEP"));
      }
    } else result.push(declaredFeatureProfile(`steps/${name}`, feature, "TIMESTEP"));
  }
  for (const [name, feature] of Object.entries(metadata)) {
    result.push(declaredFeatureProfile(`episode_metadata/${name}`, feature, "EPISODE"));
  }
  return result.sort((left, right) => left.key.localeCompare(right.key));
}

function validateStatsProfile(value, name) {
  if (!exactKeys(value, ["action", "proprio"])) throw new Error(`BRIDGEDATA_STATS_PROFILE_INVALID:${name}`);
  for (const section of ["action", "proprio"]) {
    const profile = value[section];
    if (!exactKeys(profile, ["mean", "std", "max", "min"])) throw new Error(`BRIDGEDATA_STATS_KEYS_INVALID:${name}`);
    for (const key of ["mean", "std", "max", "min"]) {
      if (!Array.isArray(profile[key]) || profile[key].length !== 7
        || profile[key].some((item) => !Number.isFinite(item))) throw new Error(`BRIDGEDATA_STATS_DIMENSION_INVALID:${name}`);
    }
    for (let index = 0; index < 7; index += 1) {
      if (!(profile.min[index] <= profile.mean[index] && profile.mean[index] <= profile.max[index])
        || !(profile.std[index] > 0)) throw new Error(`BRIDGEDATA_STATS_ORDER_INVALID:${name}`);
    }
  }
  return { name, actionDimensions: 7, proprioDimensions: 7,
    allFinite: true, allPositiveStandardDeviations: true, boundsContainMeans: true };
}

function splitSummary(datasetInfo) {
  if (datasetInfo.name !== "bridge_dataset" || datasetInfo.fileFormat !== "tfrecord"
    || !Array.isArray(datasetInfo.splits) || datasetInfo.splits.length !== 2
    || datasetInfo.releaseNotes?.["1.0.0"] !== "Initial release.") {
    throw new Error("BRIDGEDATA_DATASET_INFO_IDENTITY_INVALID");
  }
  return datasetInfo.splits.map((split) => {
    if (!["train", "val"].includes(split.name) || !Array.isArray(split.shardLengths)
      || !/^\d+$/u.test(split.numBytes)) throw new Error("BRIDGEDATA_SPLIT_INVALID");
    const lengths = split.shardLengths.map((value) => {
      if (!/^\d+$/u.test(value)) throw new Error("BRIDGEDATA_SHARD_LENGTH_INVALID");
      return Number(value);
    });
    return { name: split.name, bytes: split.numBytes, shards: lengths.length,
      examples: lengths.reduce((total, count) => total + count, 0),
      minExamplesPerShard: Math.min(...lengths), maxExamplesPerShard: Math.max(...lengths),
      firstShardExamples: lengths[0] };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function indexSummary(html) {
  const train = [...html.matchAll(/bridge_dataset-train\.tfrecord-(\d{5})-of-01024/gu)].map((match) => Number(match[1]));
  const validation = [...html.matchAll(/bridge_dataset-val\.tfrecord-(\d{5})-of-00128/gu)].map((match) => Number(match[1]));
  const uniqueTrain = [...new Set(train)].sort((left, right) => left - right);
  const uniqueValidation = [...new Set(validation)].sort((left, right) => left - right);
  if (uniqueTrain.length !== 1024 || uniqueValidation.length !== 128
    || uniqueTrain.some((value, index) => value !== index)
    || uniqueValidation.some((value, index) => value !== index)
    || !html.includes("dataset_info.json") || !html.includes("features.json")) {
    throw new Error("BRIDGEDATA_TFDS_INDEX_INCOMPLETE");
  }
  return { trainShardLinks: 1024, validationShardLinks: 128, contiguousShardIndexes: true,
    metadataLinksPresent: true };
}

function buildInternal(files, official) {
  assertInputFiles(files);
  const pinsMatch = officialPinsMatch(files);
  if (official && !pinsMatch) throw new Error("BRIDGEDATA_OFFICIAL_PROFILE_PIN_MISMATCH");
  const project = files["bridgedata-v2-project-20260822.html"].toString("utf8");
  const index = files["tfds-index-1.0.0-20260822.html"].toString("utf8");
  const datasetInfo = parseJson(files["dataset_info.json"], "BRIDGEDATA_DATASET_INFO_JSON_INVALID");
  const featureSchema = parseJson(files["features.json"], "BRIDGEDATA_FEATURES_JSON_INVALID");
  const sample = parseSingleTfrecord(files["bridge_dataset-train-record-00000.tfrecord"]);
  const splits = splitSummary(datasetInfo);
  const directory = indexSummary(index);
  const expectedFeatureKeys = flattenExpectedFeatureKeys(featureSchema);
  const declaredFeatureProfiles = flattenExpectedFeatureProfiles(featureSchema);
  const sampleFeatureKeys = sample.features.map((row) => row.key);
  if (canonicalizeStrict(expectedFeatureKeys) !== canonicalizeStrict(sampleFeatureKeys)) {
    throw new Error("BRIDGEDATA_SAMPLE_FEATURE_SCHEMA_MISMATCH");
  }
  if (official) {
    const normalizedProject = project.replace(/\s+/gu, " ");
    const phrases = ["60,096 trajectories", "50,365 teleoperated demonstrations",
      "9,731 rollouts from a scripted pick-and-place policy", "24 environments", "13 skills",
      "WidowX 250 6DOF robot arm", "control frequency is 5 Hz", "average trajectory length is 38 timesteps",
      "All data is provided under", "Creative Commons", "Attribution 4.0 International License"];
    if (phrases.some((phrase) => !normalizedProject.includes(phrase))) {
      throw new Error("BRIDGEDATA_PROJECT_BOUNDARY_MISSING");
    }
  }
  const stats = BRIDGEDATA_V2_FROZEN_SOURCE_20260822.files.filter((file) => file.kind === "ACTION_PROPRIO_STATS_PROFILE")
    .map((file) => validateStatsProfile(parseJson(files[file.name], "BRIDGEDATA_STATS_JSON_INVALID"), file.name));
  const train = splits.find((split) => split.name === "train");
  const validation = splits.find((split) => split.name === "val");
  if (!train || !validation || train.shards !== directory.trainShardLinks
    || validation.shards !== directory.validationShardLinks || train.examples !== 53_192
    || validation.examples !== 6_872 || train.firstShardExamples !== 52) {
    throw new Error("BRIDGEDATA_SPLIT_RECONCILIATION_INVALID");
  }
  const projectTrajectoryCount = 60_096;
  const tfdsTrajectoryCount = train.examples + validation.examples;
  const featureByKey = new Map(sample.features.map((feature) => [feature.key, feature]));
  const sampleTimesteps = featureByKey.get("steps/reward")?.valueCount;
  const sampleSchemaChecks = declaredFeatureProfiles.map((declared) => {
    const observed = featureByKey.get(declared.key);
    const sequenceEntries = declared.sequence === "TIMESTEP" ? sampleTimesteps : 1;
    const expectedValueCount = sequenceEntries * declared.valuesPerSequenceEntry;
    const imageEncodingAndDimensionsMatch = declared.encoding !== "jpeg" ? null
      : observed?.jpegValueCount === observed?.valueCount
        && observed?.jpegProfiles?.every((profile) => (
          profile.profile.startsWith(`${declared.shape.join("x")}@`)
        ));
    const textEncodingMatches = declared.encoding !== "utf8_bytes" ? null
      : observed?.validUtf8ValueCount === observed?.valueCount;
    const booleanDomainMatches = declared.dtype !== "bool" ? null
      : observed?.int64AllBooleanDomain === true;
    const finiteFloatValues = declared.dtype !== "float32" ? null
      : observed?.nonfiniteFloatValueCount === 0;
    return { key: declared.key, sequence: declared.sequence, dtype: declared.dtype,
      encoding: declared.encoding, shape: declared.shape,
      expectedExampleKind: declared.expectedExampleKind,
      observedExampleKind: observed?.kind ?? null,
      kindMatches: observed?.kind === declared.expectedExampleKind,
      sequenceEntries, valuesPerSequenceEntry: declared.valuesPerSequenceEntry,
      expectedValueCount, observedValueCount: observed?.valueCount ?? null,
      valueCountMatches: observed?.valueCount === expectedValueCount,
      imageEncodingAndDimensionsMatch, textEncodingMatches, booleanDomainMatches, finiteFloatValues };
  });
  const sampleRepresentationChecks = {
    declaredFeatures: sampleSchemaChecks.length,
    allKindsMatch: sampleSchemaChecks.every((item) => item.kindMatches),
    allDeclaredValueCountsMatch: sampleSchemaChecks.every((item) => item.valueCountMatches),
    allFloatValuesFinite: sampleSchemaChecks
      .filter((item) => item.dtype === "float32").every((item) => item.finiteFloatValues),
    allBooleanValuesInDomain: sampleSchemaChecks
      .filter((item) => item.dtype === "bool").every((item) => item.booleanDomainMatches),
    allDeclaredJpegImagesDecodeHeaderAs256x256x3: sampleSchemaChecks
      .filter((item) => item.encoding === "jpeg")
      .every((item) => item.imageEncodingAndDimensionsMatch),
    allDeclaredUtf8TextValuesValid: sampleSchemaChecks
      .filter((item) => item.encoding === "utf8_bytes")
      .every((item) => item.textEncodingMatches),
    checks: sampleSchemaChecks,
  };
  const sampleDimensionChecks = {
    timesteps: sampleTimesteps,
    actionValues: featureByKey.get("steps/action")?.valueCount,
    actionDimensionsPerStep: 7,
    actionValuesReconcile: featureByKey.get("steps/action")?.valueCount === sampleTimesteps * 7,
    stateValues: featureByKey.get("steps/observation/state")?.valueCount,
    stateDimensionsPerStep: 7,
    stateValuesReconcile: featureByKey.get("steps/observation/state")?.valueCount === sampleTimesteps * 7,
    languageEmbeddingValues: featureByKey.get("steps/language_embedding")?.valueCount,
    languageEmbeddingDimensionsPerStep: 512,
    languageEmbeddingValuesReconcile:
      featureByKey.get("steps/language_embedding")?.valueCount === sampleTimesteps * 512,
    imageStreamsWithOneValuePerStep: [0, 1, 2, 3].filter((index) => (
      featureByKey.get(`steps/observation/image_${index}`)?.valueCount === sampleTimesteps
    )).length,
    languageInstructionValuesReconcile:
      featureByKey.get("steps/language_instruction")?.valueCount === sampleTimesteps,
    rewardDiscountAndBoundaryFlagsReconcile: ["reward", "discount", "is_first", "is_last", "is_terminal"]
      .every((key) => featureByKey.get(`steps/${key}`)?.valueCount === sampleTimesteps),
  };
  const source = {
    sourceId: official ? BRIDGEDATA_V2_FROZEN_SOURCE_20260822.sourceId : "CALLER_PROVIDED_BRIDGEDATA_SHAPED_FIXTURE",
    publisher: official ? "UC_BERKELEY_ROBOTIC_AI_AND_LEARNING_LAB" : null,
    sourceReality: official ? "REAL_LAB_ROBOT_TRAJECTORY_DATA_AND_PUBLISHER_METADATA" : "UNATTESTED_FIXTURE_BYTES",
    profileMatchedAtBuild: official,
    callerBytesMatchedFrozenPins: pinsMatch,
    capturedAt: official ? FROZEN_AT : null,
    files: EXPECTED_NAMES.map((name) => {
      const pin = BRIDGEDATA_V2_FROZEN_SOURCE_20260822.files.find((file) => file.name === name);
      return { name, kind: pin.kind, bytes: files[name].length, sha256: sha256(files[name]),
        url: pin.url, httpRange: pin.httpRange ?? null };
    }),
  };
  source.sourceSetHash = digest({ files: source.files, parentShard: BRIDGEDATA_V2_FROZEN_SOURCE_20260822.parentShard });
  const body = {
    schema: BRIDGEDATA_V2_TRAINING_EVIDENCE_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt: FROZEN_AT,
    source,
    dataset: {
      version: "1.0.0",
      projectClaimedTrajectories: projectTrajectoryCount,
      projectClaimedTeleoperatedDemonstrations: 50_365,
      projectClaimedScriptedRollouts: 9_731,
      projectClaimedEnvironments: 24,
      projectClaimedSkills: 13,
      robotPlatform: "WIDOWX_250_6DOF",
      controlFrequencyHz: 5,
      projectAverageTrajectoryTimesteps: 38,
      tfds: { splits, totalExamples: tfdsTrajectoryCount,
        totalBytes: (BigInt(train.bytes) + BigInt(validation.bytes)).toString(),
        directory },
      reconciliation: {
        projectMinusTfdsExamples: projectTrajectoryCount - tfdsTrajectoryCount,
        countsExactlyReconciled: projectTrajectoryCount === tfdsTrajectoryCount,
        reasonPublishedInCapturedMetadata: false,
      },
    },
    sample: {
      sourceParentShard: "bridge_dataset-train.tfrecord-00000-of-01024",
      parentShardContentLength: BRIDGEDATA_V2_FROZEN_SOURCE_20260822.parentShard.contentLength,
      byteRange: BRIDGEDATA_V2_FROZEN_SOURCE_20260822.parentShard.capturedRange,
      capturedWholeShard: false,
      capturedWholeCorpus: false,
      capturedTrainShards: 0,
      capturedValidationShards: 0,
      capturedWholeRecords: 1,
      knownRecordsInParentShard: 52,
      knownTrainRecords: train.examples,
      wholeRecordCoverageOfParentShard: 1 / 52,
      wholeRecordCoverageOfTrainSplit: 1 / train.examples,
      tfrecord: { ...sample, features: sample.features.map((row) => ({ ...row })) },
      dimensionChecks: sampleDimensionChecks,
      declaredRepresentationChecks: sampleRepresentationChecks,
      expectedFeatureKeys,
      sampleFeatureKeys,
      featureKeysExactlyMatchTfdsSchema: true,
    },
    stats: {
      capturedProfiles: stats.length,
      profiles: stats,
      allProfilesSevenDimensionalAndFinite: stats.length === 4,
    },
    rights: {
      publishedDatasetLicense: official ? "CC_BY_4_0" : "UNESTABLISHED_FIXTURE",
      licenseStatementBytePinned: official,
      licenseScopeStatement: official ? "PROJECT_PAGE_STATES_ALL_DATA_IS_PROVIDED_UNDER_CC_BY_4_0" : null,
      attributionRequired: official,
      indicationOfChangesRequired: official,
      noAdditionalRestrictionsRequired: official,
      legalReviewCompleted: false,
      recordLevelThirdPartyContentReviewCompleted: false,
      productionTrainingRightFinallyAdjudicated: false,
    },
    quality: {
      realRobotDataNotDowngradedForBeingPublished: official,
      actualRecordBytesCrcValidated: true,
      sampleFeatureKeysMatchedTfdsSchema: true,
      sampleDeclaredDtypeShapeEncodingMatchedTfdsRepresentation:
        sampleRepresentationChecks.allKindsMatch
        && sampleRepresentationChecks.allDeclaredValueCountsMatch
        && sampleRepresentationChecks.allFloatValuesFinite
        && sampleRepresentationChecks.allBooleanValuesInDomain
        && sampleRepresentationChecks.allDeclaredJpegImagesDecodeHeaderAs256x256x3
        && sampleRepresentationChecks.allDeclaredUtf8TextValuesValid,
      fullCorpusSchemaConformanceEstablished: false,
      fullSchemaAndSemanticContractEstablished: false,
      metadataDescriptionContainsPlaceholder: String(datasetInfo.description ?? "").includes("TODO(example_dataset)"),
      metadataCitationContainsPlaceholder: String(datasetInfo.citation ?? "").includes("TODO(example_dataset)"),
      projectTfdsCountMismatchPreserved: projectTrajectoryCount !== tfdsTrajectoryCount,
      actionShapeDimensions: 7,
      actionDescriptionImpliedComponents: 10,
      actionShapeDescriptionMismatch: true,
      stateShapeDimensions: 7,
      stateDescriptionImpliedComponents: 10,
      stateShapeDescriptionMismatch: true,
      projectMentionsRgbdButTfdsDepthFeaturePresent: false,
      perRecordOutcomeOrFailureLabelPresent: false,
      sampleSelectionRandomOrRepresentativeEstablished: false,
      trainValidationSplitTemporalOrProspectiveEstablished: false,
      trajectoryCorrelationClustersMaterialized: false,
      sampleStructuralFeatureMissingnessAudited: true,
      sampleSemanticOrDummyValueMissingnessAudited: false,
    },
    stage15Evidence: {
      sourceDomain: "REAL_LAB_ROBOT_MANIPULATION",
      actualRobotTrajectoryBytesObserved: official,
      languageActionObservationStructuralFieldsObserved: official,
      languageActionObservationSemanticContractEstablished: false,
      publisherLicenseStatementSupportsGovernedCandidateReview: official,
      failureOrNegativeOutcomeSensingAdded: false,
      realWorldOpenEnvironmentTransferEstablished: false,
      targetRobotTransferEstablished: false,
      statisticalModelCapabilityImprovementEstablished: false,
    },
    trainingCandidate: {
      contract: "outsider/source-domain-training-candidate/v1",
      decision: official ? "HOLD_FOR_SEMANTIC_CONTENT_AND_GOVERNANCE_REVIEW" : "REJECT_UNATTESTED_FIXTURE",
      candidateWholeRecords: official ? 1 : 0,
      trainerRowsEnqueued: 0,
      automaticTraining: false,
      sourceHash: source.sourceSetHash,
      license: official ? "CC_BY_4_0_WITH_ATTRIBUTION_AND_CHANGE_NOTICE" : null,
      selectionCoverage: {
        corpusExamplesClaimedByTfds: tfdsTrajectoryCount,
        trainExamplesClaimedByTfds: train.examples,
        wholeRecordsCaptured: 1,
        trainShardsFullyCaptured: 0,
        trainShardCount: train.shards,
        validationRecordsCaptured: 0,
      },
      requiredBeforeTrainerAdmission: [
        "RESOLVE_PROJECT_VS_TFDS_32_TRAJECTORY_COUNT_DIFFERENCE",
        "RESOLVE_ACTION_AND_STATE_SHAPE_DESCRIPTION_MISMATCHES",
        "DECODE_AND_AUDIT_RECORD_LEVEL_MISSINGNESS_AND_CONTENT",
        "MATERIALIZE_TRAJECTORY_ENVIRONMENT_OBJECT_AND_COLLECTION_CORRELATION_GROUPS",
        "SEPARATE_TELEOPERATED_AND_SCRIPTED_PROVENANCE_AT_RECORD_LEVEL",
        "ESTABLISH_NON_SUCCESS_FAILURE_AND_NEGATIVE_EXAMPLE_POLICY",
        "COMPLETE_ATTRIBUTION_CHANGE_NOTICE_AND_THIRD_PARTY_CONTENT_REVIEW",
        "CREATE_TARGET_ROBOT_HOLDOUT_AND_TRANSFER_GATE",
      ],
    },
    deferredSources: [
      { sourceId: "OPEN_X_EMBODIMENT", machineStatus: "DEFERRED_DATASET_BY_DATASET_RIGHTS_AND_COLLECTION_REVIEW",
        reasonCodes: ["TOP_LEVEL_CC_BY_DOES_NOT_RESOLVE_EACH_CONTRIBUTED_DATASET", "REQUIRES_PER_DATASET_LICENSE_AND_COLLECTION_PROVENANCE"] },
      { sourceId: "WAYMO_OPEN_DATASET", machineStatus: "DEFERRED_FOR_OUTSIDER_PRODUCTION_TRAINING",
        reasonCodes: ["NON_COMMERCIAL_USE_BOUNDARY", "MANUAL_AND_AUTONOMOUS_SEGMENTS_NOT_LABELED_FOR_PERFORMANCE_EVALUATION"] },
      { sourceId: "NASA_ASRS_UAS", machineStatus: "DEFERRED_FULL_TRAINING_OR_RATE_TRUTH",
        reasonCodes: ["VOLUNTARY_SELF_SELECTED_REPORTS", "NASA_DOES_NOT_VALIDATE_REPORT_FACTS", "ONLINE_EXPORT_LIMIT_10000", "NO_EXPOSURE_DENOMINATOR"] },
    ],
    modelEntrance: {
      TRAIN: false, PRICE: false, CAPITAL: false, COVERAGE: false, SETTLE: false,
      sourceDomainTrainingCandidateOnly: official,
      targetDomainFactorAdmission: false,
      frequencyEligible: false,
      severityEligible: false,
      lossEligible: false,
      prospectiveHoldoutEligible: false,
    },
    authority: { mode: "none", TRAIN: false, PRICE: false, CAPITAL: false,
      COVERAGE: false, SETTLE: false, movesFunds: false },
  };
  return Object.freeze({ ...body, artifactHash: artifactDigest(body) });
}

export function buildBridgeDataV2TrainingEvidenceFromBytes(files, options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    throw new Error("BRIDGEDATA_BUILD_OPTIONS_INVALID");
  }
  canonicalTime(options.generatedAt ?? FROZEN_AT, "BRIDGEDATA_GENERATED_AT");
  return buildInternal(files, false);
}

export function buildBridgeDataV2TrainingEvidenceFromSourceDirectory(sourceDirectory, options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    throw new Error("BRIDGEDATA_BUILD_OPTIONS_INVALID");
  }
  canonicalTime(options.generatedAt ?? FROZEN_AT, "BRIDGEDATA_GENERATED_AT");
  return buildInternal(stableReadSourceDirectory(sourceDirectory), true);
}

function structuralErrors(artifact) {
  const errors = [];
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) return ["ARTIFACT_INVALID"];
  const { artifactHash, ...body } = artifact;
  if (artifact.schema !== BRIDGEDATA_V2_TRAINING_EVIDENCE_SCHEMA) errors.push("SCHEMA_INVALID");
  if (artifact.generatedAt !== FROZEN_AT) errors.push("GENERATED_AT_INVALID");
  if (structuralShapeHash(artifact) !== ARTIFACT_STRUCTURAL_SHAPE_HASH) {
    errors.push("ARTIFACT_STRUCTURAL_SHAPE_INVALID");
  }
  if (artifactHash !== artifactDigest(body)) errors.push("ARTIFACT_HASH_INVALID");
  if (artifactHash !== CANONICAL_ARTIFACT_HASH) errors.push("FIXED_CANONICAL_PROJECTION_INVALID");
  if (artifact.sample?.capturedWholeRecords !== 1 || artifact.sample?.capturedWholeCorpus !== false
    || artifact.sample?.tfrecord?.allCrc32cValid !== true
    || artifact.sample?.dimensionChecks?.actionValuesReconcile !== true
    || artifact.sample?.dimensionChecks?.stateValuesReconcile !== true
    || artifact.sample?.dimensionChecks?.languageEmbeddingValuesReconcile !== true
    || artifact.sample?.dimensionChecks?.imageStreamsWithOneValuePerStep !== 4
    || artifact.sample?.declaredRepresentationChecks?.allKindsMatch !== true
    || artifact.sample?.declaredRepresentationChecks?.allDeclaredValueCountsMatch !== true
    || artifact.sample?.declaredRepresentationChecks?.allFloatValuesFinite !== true
    || artifact.sample?.declaredRepresentationChecks?.allBooleanValuesInDomain !== true
    || artifact.sample?.declaredRepresentationChecks?.allDeclaredJpegImagesDecodeHeaderAs256x256x3 !== true
    || artifact.sample?.declaredRepresentationChecks?.allDeclaredUtf8TextValuesValid !== true) {
    errors.push("SAMPLE_BOUNDARY_INVALID");
  }
  if (artifact.quality?.projectTfdsCountMismatchPreserved !== true
    || artifact.dataset?.reconciliation?.projectMinusTfdsExamples !== 32
    || artifact.quality?.actionShapeDescriptionMismatch !== true
    || artifact.quality?.stateShapeDescriptionMismatch !== true
    || artifact.quality?.fullCorpusSchemaConformanceEstablished !== false
    || artifact.quality?.fullSchemaAndSemanticContractEstablished !== false
    || artifact.stage15Evidence?.languageActionObservationSemanticContractEstablished !== false) {
    errors.push("QUALITY_ANOMALY_BOUNDARY_INVALID");
  }
  if (artifact.trainingCandidate?.automaticTraining !== false
    || artifact.trainingCandidate?.trainerRowsEnqueued !== 0
    || artifact.rights?.productionTrainingRightFinallyAdjudicated !== false
    || artifact.rights?.legalReviewCompleted !== false
    || artifact.stage15Evidence?.statisticalModelCapabilityImprovementEstablished !== false
    || artifact.modelEntrance?.TRAIN !== false || artifact.modelEntrance?.PRICE !== false
    || artifact.modelEntrance?.CAPITAL !== false || artifact.modelEntrance?.COVERAGE !== false
    || artifact.modelEntrance?.SETTLE !== false || artifact.authority?.mode !== "none"
    || ["TRAIN", "PRICE", "CAPITAL", "COVERAGE", "SETTLE", "movesFunds"]
      .some((key) => artifact.authority?.[key] !== false)) errors.push("AUTHORITY_BOUNDARY_INVALID");
  return [...new Set(errors)];
}

export function verifyBridgeDataV2TrainingEvidence(artifact) {
  const errors = structuralErrors(artifact);
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors),
    verificationLevel: "FIXED_CANONICAL_PROJECTION_NO_SOURCE_AUTHENTICATION",
    sourceArtifactsReverified: false,
    realCaseOrExperienceAdmissionEstablished: false,
    trainingAdmissionEstablished: false, authorityEstablished: false });
}

export function verifyBridgeDataV2TrainingEvidenceWithSource(artifact, sourceDirectory) {
  const errors = structuralErrors(artifact);
  let sourceProfileReproduced = false;
  let candidateArtifactExactlyRebuilt = false;
  try {
    const rebuilt = buildBridgeDataV2TrainingEvidenceFromSourceDirectory(sourceDirectory,
      { generatedAt: artifact?.generatedAt });
    sourceProfileReproduced = true;
    candidateArtifactExactlyRebuilt = canonicalizeStrict(rebuilt) === canonicalizeStrict(artifact);
    if (!candidateArtifactExactlyRebuilt) errors.push("EXACT_REBUILD_MISMATCH");
  } catch (error) { errors.push(`SOURCE_REPLAY_FAILED:${error.message}`); }
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze([...new Set(errors)]),
    verificationLevel: "FULL_SOURCE_REPLAY", sourceArtifactsReverified: sourceProfileReproduced,
    sourceProfileReproduced, candidateArtifactExactlyRebuilt,
    exactPublisherSourceReplayEstablished: sourceProfileReproduced && candidateArtifactExactlyRebuilt,
    realCaseOrExperienceAdmissionEstablished: sourceProfileReproduced && candidateArtifactExactlyRebuilt,
    realPublishedRobotExperienceAdmissionEstablished: sourceProfileReproduced && candidateArtifactExactlyRebuilt,
    independentExperimentalTruthEstablished: false,
    underlyingWorldTruthEstablished: false,
    trainingAdmissionEstablished: false, authorityEstablished: false });
}
