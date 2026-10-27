import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "./canonical.js";
import { verifyDroid100AcquisitionManifest } from "./outsider-droid100-adapter.js";
import { normalizeCurateEpisode, CURATE_SCHEMAS } from "./outsider-curate-core.js";
import {
  crc32c, decodeTensorFlowExample, decodeTfRecordFrames,
} from "./outsider-tfrecord-example.js";

const MAX_IMAGE_DIMENSION = 16_384;
const JPEG_SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const DROID100_FIRST_SHARD_PIN = Object.freeze({
  name: "r2d2_faceblur-train.tfrecord-00000-of-00031",
  sizeBytes: 27_488_816,
  md5Base64: "IQoCwa04u58UpSOzKsS/6g==",
  crc32cBase64: "zgQNQw==",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const VERIFIED_SHARDS = new WeakMap();
const VERIFIED_FRAMES = new WeakMap();
const FEATURE_SPEC = Object.freeze({
  "episode_metadata/file_path": { kind: "bytes", scope: "private-singleton" },
  "episode_metadata/recording_folderpath": { kind: "bytes", scope: "private-singleton" },
  "steps/action": { kind: "float", scope: "action", dimension: 7, prefix: "action" },
  "steps/action_dict/cartesian_position": {
    kind: "float", scope: "action", dimension: 6, prefix: "commanded_cartesian_position",
  },
  "steps/action_dict/cartesian_velocity": {
    kind: "float", scope: "action", dimension: 6, prefix: "commanded_cartesian_velocity",
  },
  "steps/action_dict/gripper_position": {
    kind: "float", scope: "action", dimension: 1, prefix: "commanded_gripper_position",
  },
  "steps/action_dict/gripper_velocity": {
    kind: "float", scope: "action", dimension: 1, prefix: "commanded_gripper_velocity",
  },
  "steps/action_dict/joint_position": {
    kind: "float", scope: "action", dimension: 7, prefix: "commanded_joint_position",
  },
  "steps/action_dict/joint_velocity": {
    kind: "float", scope: "action", dimension: 7, prefix: "commanded_joint_velocity",
  },
  "steps/discount": { kind: "float", scope: "outcome", dimension: 1, prefix: "discount" },
  "steps/is_first": { kind: "int64", scope: "boundary" },
  "steps/is_last": { kind: "int64", scope: "boundary" },
  "steps/is_terminal": { kind: "int64", scope: "boundary" },
  "steps/language_instruction": { kind: "bytes", scope: "private-per-step" },
  "steps/language_instruction_2": { kind: "bytes", scope: "private-per-step" },
  "steps/language_instruction_3": { kind: "bytes", scope: "private-per-step" },
  "steps/observation/cartesian_position": {
    kind: "float", scope: "observation", dimension: 6, prefix: "cartesian_position",
  },
  "steps/observation/exterior_image_1_left": { kind: "bytes", scope: "image" },
  "steps/observation/exterior_image_2_left": { kind: "bytes", scope: "image" },
  "steps/observation/gripper_position": {
    kind: "float", scope: "observation", dimension: 1, prefix: "gripper_position",
  },
  "steps/observation/joint_position": {
    kind: "float", scope: "observation", dimension: 7, prefix: "joint_position",
  },
  "steps/observation/wrist_image_left": { kind: "bytes", scope: "image" },
  "steps/reward": { kind: "float", scope: "outcome", dimension: 1, prefix: "reward" },
});
const FEATURE_NAMES = Object.freeze(Object.keys(FEATURE_SPEC).sort());
const IMAGE_FEATURES = Object.freeze(FEATURE_NAMES.filter((name) => FEATURE_SPEC[name].scope === "image"));
const OBSERVATION_FEATURES = Object.freeze(FEATURE_NAMES.filter(
  (name) => FEATURE_SPEC[name].scope === "observation",
));
const ACTION_FEATURES = Object.freeze(FEATURE_NAMES.filter(
  (name) => FEATURE_SPEC[name].scope === "action",
));
const OUTCOME_FEATURES = Object.freeze(FEATURE_NAMES.filter(
  (name) => FEATURE_SPEC[name].scope === "outcome",
));
const ATTRIBUTION = Object.freeze({
  dataset: "DROID 100 / r2d2_faceblur 1.0.0",
  work: "DROID: A Large-Scale In-The-Wild Robot Manipulation Dataset",
  identifier: "arXiv:2403.12945",
});
export const DROID100_ATTRIBUTION_HASH = `sha256:${createHash("sha256")
  .update(`outsider:droid100:attribution:v1\0${canonicalizeStrict(ATTRIBUTION)}`).digest("hex")}`;
const INSTRUMENT_IMPLEMENTATION_FILES = Object.freeze({
  canonicalizer: "./canonical.js",
  curateCore: "./outsider-curate-core.js",
  acquisitionAdapter: "./outsider-droid100-adapter.js",
  tfRecordExampleDecoder: "./outsider-tfrecord-example.js",
  rldsProjector: "./outsider-droid100-rlds.js",
});
const INSTRUMENT_COMPONENT_HASHES = Object.freeze(Object.fromEntries(
  Object.entries(INSTRUMENT_IMPLEMENTATION_FILES).map(([role, relative]) => [
    role,
    `sha256:${createHash("sha256").update(readFileSync(
      fileURLToPath(new URL(relative, import.meta.url)),
    )).digest("hex")}`,
  ]),
));
export const DROID100_RLDS_IMPLEMENTATION_HASH = `sha256:${createHash("sha256")
  .update(`outsider:droid100:instrument-closure:v1\0${canonicalizeStrict(
    INSTRUMENT_COMPONENT_HASHES,
  )}`).digest("hex")}`;

function parseJson(input, code) {
  if (Buffer.isBuffer(input)) input = input.toString("utf8");
  if (typeof input === "string") {
    try { return JSON.parse(input); } catch { fail(code); }
  }
  if (!input || typeof input !== "object" || Array.isArray(input)) fail(code);
  return input;
}

function sameStrings(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length
    && actual.every((value, index) => String(value) === expected[index]);
}

function tensorSchema(feature, dtype, dimensions) {
  return feature?.tensor?.dtype === dtype
    && feature.tensor.encoding === "none"
    && sameStrings(feature.tensor.shape?.dimensions ?? [], dimensions);
}

function imageSchema(feature) {
  return feature?.pythonClassName === "tensorflow_datasets.core.features.image_feature.Image"
    && feature.image?.dtype === "uint8" && feature.image.encodingFormat === "jpeg"
    && sameStrings(feature.image.shape?.dimensions, ["180", "320", "3"]);
}

function exactFeatureNames(value, expected) {
  return value && typeof value === "object" && !Array.isArray(value)
    && canonicalizeStrict(Object.keys(value).sort()) === canonicalizeStrict([...expected].sort());
}

/** Validate the checked-in TFDS descriptor against the decoder's exact schema. */
export function validateDroid100FeaturesSchema(input) {
  const document = parseJson(input, "DROID100_FEATURES_JSON_INVALID");
  const root = document.featuresDict?.features;
  if (!root) fail("DROID100_FEATURES_ROOT_INVALID");
  const metadata = root.episode_metadata?.featuresDict?.features;
  if (!exactFeatureNames(metadata, ["file_path", "recording_folderpath"])
    || !tensorSchema(metadata.file_path, "string", [])
    || !tensorSchema(metadata.recording_folderpath, "string", [])) {
    fail("DROID100_FEATURES_METADATA_SCHEMA_MISMATCH");
  }
  const steps = root.steps?.sequence?.feature?.featuresDict?.features;
  const stepNames = [
    "action", "action_dict", "discount", "is_first", "is_last", "is_terminal",
    "language_instruction", "language_instruction_2", "language_instruction_3",
    "observation", "reward",
  ];
  if (!exactFeatureNames(steps, stepNames) || !tensorSchema(steps.action, "float64", ["7"])
    || !tensorSchema(steps.discount, "float32", [])
    || !tensorSchema(steps.reward, "float32", [])) {
    fail("DROID100_FEATURES_STEP_SCHEMA_MISMATCH");
  }
  for (const name of ["is_first", "is_last", "is_terminal"]) {
    if (!tensorSchema(steps[name], "bool", [])) fail("DROID100_FEATURES_BOUNDARY_SCHEMA_MISMATCH", name);
  }
  for (const name of ["language_instruction", "language_instruction_2", "language_instruction_3"]) {
    if (!tensorSchema(steps[name], "string", [])) fail("DROID100_FEATURES_LANGUAGE_SCHEMA_MISMATCH", name);
  }
  const actions = steps.action_dict?.featuresDict?.features;
  const actionDimensions = {
    cartesian_position: "6", cartesian_velocity: "6", gripper_position: "1",
    gripper_velocity: "1", joint_position: "7", joint_velocity: "7",
  };
  if (!exactFeatureNames(actions, Object.keys(actionDimensions))) {
    fail("DROID100_FEATURES_ACTION_DICT_MISMATCH");
  }
  for (const [name, dimension] of Object.entries(actionDimensions)) {
    if (!tensorSchema(actions[name], "float64", [dimension])) {
      fail("DROID100_FEATURES_ACTION_SCHEMA_MISMATCH", name);
    }
  }
  const observations = steps.observation?.featuresDict?.features;
  const observationNames = [
    "cartesian_position", "exterior_image_1_left", "exterior_image_2_left",
    "gripper_position", "joint_position", "wrist_image_left",
  ];
  if (!exactFeatureNames(observations, observationNames)
    || !tensorSchema(observations.cartesian_position, "float64", ["6"])
    || !tensorSchema(observations.gripper_position, "float64", ["1"])
    || !tensorSchema(observations.joint_position, "float64", ["7"])) {
    fail("DROID100_FEATURES_OBSERVATION_SCHEMA_MISMATCH");
  }
  for (const name of ["exterior_image_1_left", "exterior_image_2_left", "wrist_image_left"]) {
    if (!imageSchema(observations[name])) fail("DROID100_FEATURES_IMAGE_SCHEMA_MISMATCH", name);
  }
  const body = {
    schema: "outsider/droid100-feature-schema-validation/v1",
    dataset: "r2d2_faceblur",
    version: "1.0.0",
    featureCount: FEATURE_NAMES.length,
    imageStreams: IMAGE_FEATURES.length,
    privateSourceFieldsExcluded: 5,
    officialSchemaMatched: true,
  };
  return { ...body, validationHash: domainDigest("outsider:droid100:feature-schema/v1", body) };
}

/** Validate the 31-shard/100-episode TFDS accounting against object metadata. */
export function validateDroid100DatasetInfo(input, { manifest } = {}) {
  const checked = verifyDroid100AcquisitionManifest(manifest);
  if (!checked.ok) fail("DROID100_DATASET_INFO_MANIFEST_UNVERIFIED", checked.error);
  const document = parseJson(input, "DROID100_DATASET_INFO_JSON_INVALID");
  if (document.name !== "r2d2_faceblur" || document.version !== "1.0.0"
    || document.fileFormat !== "tfrecord" || !Array.isArray(document.splits)
    || document.splits.length !== 1 || document.splits[0]?.name !== "train") {
    fail("DROID100_DATASET_INFO_IDENTITY_MISMATCH");
  }
  const split = document.splits[0];
  if (!/^[1-9][0-9]*$/.test(split.numBytes ?? "")
    || !Array.isArray(split.shardLengths) || split.shardLengths.length !== 31
    || split.shardLengths.some((value) => !/^[1-9][0-9]*$/.test(value))) {
    fail("DROID100_DATASET_INFO_SPLIT_INVALID");
  }
  const episodeCount = split.shardLengths.reduce((sum, value) => sum + Number(value), 0);
  if (episodeCount !== 100) fail("DROID100_DATASET_INFO_EPISODE_COUNT_MISMATCH");
  const shardObjectBytes = manifest.objects.filter((object) => object.role === "TFRECORD_SHARD")
    .reduce((sum, object) => sum + object.sizeBytes, 0);
  const examplePayloadBytes = Number(split.numBytes);
  const framingBytes = shardObjectBytes - examplePayloadBytes;
  if (framingBytes !== episodeCount * 16) fail("DROID100_DATASET_INFO_TFRECORD_ACCOUNTING_MISMATCH");
  const body = {
    schema: "outsider/droid100-dataset-info-validation/v1",
    dataset: "r2d2_faceblur",
    version: "1.0.0",
    shardCount: split.shardLengths.length,
    episodeCount,
    examplePayloadBytes,
    tfRecordFramingBytes: framingBytes,
    shardObjectBytes,
    accountingMatched: true,
  };
  return { ...body, validationHash: domainDigest("outsider:droid100:dataset-info/v1", body) };
}

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

function validDimensions(width, height, channels, format) {
  if (!Number.isInteger(width) || !Number.isInteger(height)
    || width <= 0 || height <= 0
    || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    fail("DROID100_IMAGE_DIMENSIONS_INVALID", format);
  }
  if (!Number.isInteger(channels) || channels < 1 || channels > 4) {
    fail("DROID100_IMAGE_CHANNELS_INVALID", format);
  }
  return { width, height, channels };
}

function inspectPng(bytes) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(PNG_SIGNATURE)
    || bytes.readUInt32BE(8) !== 13 || bytes.toString("ascii", 12, 16) !== "IHDR") {
    fail("DROID100_PNG_HEADER_INVALID");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  const colorType = bytes[25];
  const channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[colorType];
  if (channels == null) fail("DROID100_PNG_COLOR_TYPE_UNSUPPORTED", colorType);
  return { format: "png", ...validDimensions(width, height, channels, "png") };
}

function inspectJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    fail("DROID100_JPEG_HEADER_INVALID");
  }
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) fail("DROID100_JPEG_SEGMENT_TRUNCATED");
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) fail("DROID100_JPEG_SEGMENT_LENGTH_INVALID");
    if (JPEG_SOF.has(marker)) {
      if (length < 8) fail("DROID100_JPEG_SOF_INVALID");
      const height = bytes.readUInt16BE(offset + 3);
      const width = bytes.readUInt16BE(offset + 5);
      const channels = bytes[offset + 7];
      return { format: "jpeg", ...validDimensions(width, height, channels, "jpeg") };
    }
    offset += length;
  }
  fail("DROID100_JPEG_SOF_MISSING");
}

/** Return only a byte commitment and structural dimensions; never the image. */
export function summarizeEncodedImage(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length === 0) fail("DROID100_IMAGE_EMPTY");
  let dimensions;
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIGNATURE)) dimensions = inspectPng(bytes);
  else if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) dimensions = inspectJpeg(bytes);
  else fail("DROID100_IMAGE_ENCODING_UNSUPPORTED");
  return {
    commitment: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
    byteLength: bytes.length,
    ...dimensions,
  };
}

/** Verify the exact official first-shard byte pin before protobuf decoding. */
export function verifyDroid100FirstShardBytes(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length !== DROID100_FIRST_SHARD_PIN.sizeBytes) {
    fail("DROID100_FIRST_SHARD_SIZE_MISMATCH", bytes.length);
  }
  const md5Base64 = createHash("md5").update(bytes).digest("base64");
  if (md5Base64 !== DROID100_FIRST_SHARD_PIN.md5Base64) {
    fail("DROID100_FIRST_SHARD_MD5_MISMATCH");
  }
  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE(crc32c(bytes));
  const crc32cBase64 = crcBytes.toString("base64");
  if (crc32cBase64 !== DROID100_FIRST_SHARD_PIN.crc32cBase64) {
    fail("DROID100_FIRST_SHARD_CRC32C_MISMATCH");
  }
  const verified = Object.freeze({
    sizeBytes: bytes.length,
    md5Base64,
    crc32cBase64,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  });
  VERIFIED_SHARDS.set(verified, { ...verified });
  return verified;
}

/**
 * The only production constructor for decodable first-shard frames. The
 * process-local provenance brands prevent callers from presenting a synthetic
 * Example beside copied public checksum strings as if it came from DROID.
 */
export function decodeDroid100FirstShard(input) {
  const bytes = Buffer.from(input);
  const verifiedShard = verifyDroid100FirstShardBytes(bytes);
  const frames = decodeTfRecordFrames(bytes).map((frame) => {
    const branded = Object.freeze({ ...frame });
    VERIFIED_FRAMES.set(branded, Object.freeze({
      shardSha256: verifiedShard.sha256,
      index: branded.index,
      offset: branded.offset,
      length: branded.length,
      dataHash: branded.dataHash,
    }));
    return branded;
  });
  return Object.freeze({ verifiedShard, frames: Object.freeze(frames) });
}

/** Verify any manifest member's local bytes without retaining its source URI. */
export function verifyDroid100ManifestObjectBytes(input, {
  manifest, role, shardIndex = null,
} = {}) {
  const checked = verifyDroid100AcquisitionManifest(manifest);
  if (!checked.ok) fail("DROID100_OBJECT_BYTES_MANIFEST_UNVERIFIED", checked.error);
  const candidates = manifest.objects.filter((object) => object.role === role
    && (role !== "TFRECORD_SHARD" || object.shardIndex === shardIndex));
  if (candidates.length !== 1) fail("DROID100_OBJECT_BYTES_MEMBER_NOT_UNIQUE");
  const object = candidates[0];
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length !== object.sizeBytes) fail("DROID100_OBJECT_BYTES_SIZE_MISMATCH", role);
  const md5Base64 = createHash("md5").update(bytes).digest("base64");
  if (md5Base64 !== object.md5Base64) fail("DROID100_OBJECT_BYTES_MD5_MISMATCH", role);
  const crcBytes = Buffer.alloc(4);
  crcBytes.writeUInt32BE(crc32c(bytes));
  const crc32cBase64 = crcBytes.toString("base64");
  if (crc32cBase64 !== object.crc32cBase64) fail("DROID100_OBJECT_BYTES_CRC32C_MISMATCH", role);
  return {
    role,
    shardIndex: object.shardIndex,
    objectLeafHash: object.leafHash,
    generation: object.generation,
    sizeBytes: bytes.length,
    md5Base64,
    crc32cBase64,
    sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
  };
}

function domainDigest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function requireHash(value, code) {
  if (!HASH.test(String(value ?? ""))) fail(code);
  return value;
}

function decodedFeatureMap(bytes) {
  const decoded = decodeTensorFlowExample(bytes);
  const names = decoded.map((feature) => feature.name);
  if (canonicalizeStrict(names) !== canonicalizeStrict(FEATURE_NAMES)) {
    const missing = FEATURE_NAMES.filter((name) => !names.includes(name));
    const unknown = names.filter((name) => !FEATURE_NAMES.includes(name));
    fail("DROID100_RLDS_FEATURE_SET_MISMATCH",
      canonicalizeStrict({ missing, unknown }));
  }
  const map = new Map(decoded.map((feature) => [feature.name, feature]));
  for (const name of FEATURE_NAMES) {
    if (map.get(name).kind !== FEATURE_SPEC[name].kind) {
      fail("DROID100_RLDS_FEATURE_KIND_MISMATCH", name);
    }
  }
  return map;
}

function booleanVector(feature, name) {
  return feature.values.map((value) => {
    if (value !== 0 && value !== 1) fail("DROID100_RLDS_BOOLEAN_INVALID", name);
    return value === 1;
  });
}

function validateBoundaries(first, last, terminal) {
  const count = first.length;
  if (last.length !== count || terminal.length !== count || count < 1 || count > 20_000) {
    fail("DROID100_RLDS_STEP_COUNT_INVALID");
  }
  for (let index = 0; index < count; index += 1) {
    if (first[index] !== (index === 0) || last[index] !== (index === count - 1)
      || (terminal[index] && !last[index])) {
      fail("DROID100_RLDS_BOUNDARY_INCONSISTENT", index);
    }
  }
  return count;
}

function vectorAt(map, name, step, stepCount) {
  const spec = FEATURE_SPEC[name];
  const values = map.get(name).values;
  if (values.length !== stepCount * spec.dimension) {
    fail("DROID100_RLDS_VECTOR_LENGTH_MISMATCH", name);
  }
  const output = {};
  for (let dimension = 0; dimension < spec.dimension; dimension += 1) {
    const value = values[(step * spec.dimension) + dimension];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      fail("DROID100_RLDS_NUMERIC_VALUE_INVALID", name);
    }
    const key = spec.dimension === 1 ? spec.prefix : `${spec.prefix}_${dimension}`;
    output[key] = Object.is(value, -0) ? 0 : value;
  }
  return output;
}

function combinedVectors(map, names, step, stepCount) {
  return Object.assign({}, ...names.map((name) => vectorAt(map, name, step, stepCount)));
}

function imageProjection(map, step, stepCount) {
  return IMAGE_FEATURES.map((name) => {
    const values = map.get(name).values;
    if (values.length !== stepCount) fail("DROID100_RLDS_IMAGE_COUNT_MISMATCH", name);
    const summary = summarizeEncodedImage(values[step]);
    if (summary.format !== "jpeg" || summary.width !== 320 || summary.height !== 180
      || summary.channels !== 3) {
      fail("DROID100_RLDS_IMAGE_SCHEMA_MISMATCH", name);
    }
    return {
      stream: name.slice("steps/observation/".length),
      commitment: summary.commitment,
      width: summary.width,
      height: summary.height,
      format: summary.format,
    };
  });
}

function validatePrivateFields(map, stepCount) {
  for (const name of FEATURE_NAMES) {
    const scope = FEATURE_SPEC[name].scope;
    if (scope === "private-singleton" && map.get(name).values.length !== 1) {
      fail("DROID100_RLDS_PRIVATE_SINGLETON_INVALID", name);
    }
    if (scope === "private-per-step" && map.get(name).values.length !== stepCount) {
      fail("DROID100_RLDS_PRIVATE_STEP_COUNT_INVALID", name);
    }
  }
}

/**
 * Decode one official r2d2_faceblur Example into the exact privacy-safe generic
 * Stage 1.5 input. Raw JPEGs, language, file paths, and collector metadata are
 * consumed only in memory for validation and cannot appear in the returned shape.
 */
export function projectDroid100RldsEpisode(frame, {
  manifest,
  verifiedShard,
  episodeOrdinal,
  licenseId = "CC-BY-4.0",
} = {}) {
  const manifestCheck = verifyDroid100AcquisitionManifest(manifest);
  if (!manifestCheck.ok) fail("DROID100_RLDS_MANIFEST_UNVERIFIED", manifestCheck.error);
  const shardProvenance = verifiedShard && VERIFIED_SHARDS.get(verifiedShard);
  if (!shardProvenance
    || canonicalizeStrict(shardProvenance) !== canonicalizeStrict(verifiedShard)
    || verifiedShard.sizeBytes !== DROID100_FIRST_SHARD_PIN.sizeBytes
    || verifiedShard.md5Base64 !== DROID100_FIRST_SHARD_PIN.md5Base64
    || verifiedShard.crc32cBase64 !== DROID100_FIRST_SHARD_PIN.crc32cBase64) {
    fail("DROID100_RLDS_SHARD_UNVERIFIED");
  }
  requireHash(verifiedShard.sha256, "DROID100_RLDS_SHARD_SHA256_INVALID");
  const frameProvenance = frame && VERIFIED_FRAMES.get(frame);
  if (!frameProvenance || frameProvenance.shardSha256 !== verifiedShard.sha256
    || !Buffer.isBuffer(frame.data) || !Number.isSafeInteger(episodeOrdinal)
    || episodeOrdinal < 0 || episodeOrdinal !== frame.index
    || frame.index !== frameProvenance.index || frame.offset !== frameProvenance.offset
    || frame.length !== frameProvenance.length || frame.dataHash !== frameProvenance.dataHash
    || frame.length !== frame.data.length) fail("DROID100_RLDS_FRAME_UNVERIFIED");
  const frameHash = `sha256:${createHash("sha256").update(frame.data).digest("hex")}`;
  if (frame.dataHash !== frameHash) fail("DROID100_RLDS_FRAME_HASH_MISMATCH");
  if (licenseId !== "CC-BY-4.0") fail("DROID100_RLDS_LICENSE_ID_UNSUPPORTED");
  if (manifest.license?.identifier !== "CC-BY-4.0"
      || manifest.license.status !== "DECLARED_BY_OFFICIAL_PAPER_NOT_GCS_OBJECT_METADATA"
      || manifest.license.objectMetadataVerified !== false
      || !HASH.test(manifest.license.attributionNotice?.noticeHash ?? "")) {
    fail("DROID100_RLDS_LICENSE_PROVENANCE_INVALID");
  }
  const firstObject = manifest.objects.find((object) => (
    object.role === "TFRECORD_SHARD" && object.shardIndex === 0
  ));
  if (!firstObject || firstObject.sizeBytes !== verifiedShard.sizeBytes
    || firstObject.md5Base64 !== verifiedShard.md5Base64
    || firstObject.crc32cBase64 !== verifiedShard.crc32cBase64) {
    fail("DROID100_RLDS_SHARD_MANIFEST_MISMATCH");
  }

  const map = decodedFeatureMap(frame.data);
  const first = booleanVector(map.get("steps/is_first"), "steps/is_first");
  const last = booleanVector(map.get("steps/is_last"), "steps/is_last");
  const terminal = booleanVector(map.get("steps/is_terminal"), "steps/is_terminal");
  const stepCount = validateBoundaries(first, last, terminal);
  validatePrivateFields(map, stepCount);
  const steps = [];
  for (let index = 0; index < stepCount; index += 1) {
    const features = combinedVectors(map, OBSERVATION_FEATURES, index, stepCount);
    const namedImages = imageProjection(map, index, stepCount);
    const images = namedImages.map(({ stream: _stream, ...image }) => image);
    steps.push({
      index,
      tOffsetMs: null,
      boundary: { isFirst: first[index], isLast: last[index], isTerminal: terminal[index] },
      observation: {
        commitment: domainDigest("outsider:droid100:observation:v1", {
          features, images: namedImages,
        }),
        features,
        images,
      },
      action: {
        kind: "robot-action",
        features: combinedVectors(map, ACTION_FEATURES, index, stepCount),
      },
      outcome: {
        kind: "recorded-outcome",
        features: combinedVectors(map, OUTCOME_FEATURES, index, stepCount),
      },
    });
  }
  return {
    schema: CURATE_SCHEMAS.episodeInput,
    source: {
      datasetId: "r2d2_faceblur",
      datasetVersion: "1.0.0",
      datasetManifestHash: manifest.manifestHash,
      sourceObjectHash: verifiedShard.sha256,
      licenseId,
      attributionHash: DROID100_ATTRIBUTION_HASH,
    },
    instrument: {
      extractorId: "outsider-droid100-rlds",
      extractorVersion: "1.0.0",
      extractorImplementationHash: DROID100_RLDS_IMPLEMENTATION_HASH,
      featureSchemaHash: domainDigest("outsider:droid100:feature-schema/v1", {
        schema: "outsider/droid100-feature-schema-validation/v1",
        dataset: "r2d2_faceblur",
        version: "1.0.0",
        featureCount: FEATURE_NAMES.length,
        imageStreams: IMAGE_FEATURES.length,
        privateSourceFieldsExcluded: 5,
        officialSchemaMatched: true,
      }),
    },
    episodeIdHash: domainDigest("outsider:droid100:episode-id:v1", {
      sourceObjectHash: verifiedShard.sha256, frameHash, episodeOrdinal,
    }),
    platformClass: "robot-manipulator",
    steps,
  };
}

export function normalizeDroid100RldsEpisode(frame, options) {
  return normalizeCurateEpisode(projectDroid100RldsEpisode(frame, options));
}
