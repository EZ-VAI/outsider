import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DROID100_FIRST_SHARD_PIN,
  DROID100_RLDS_IMPLEMENTATION_HASH,
  decodeDroid100FirstShard,
  normalizeDroid100RldsEpisode,
  projectDroid100RldsEpisode,
  summarizeEncodedImage,
  validateDroid100DatasetInfo,
  validateDroid100FeaturesSchema,
  verifyDroid100FirstShardBytes,
  verifyDroid100ManifestObjectBytes,
} from "../src/outsider-droid100-rlds.js";
import {
  DROID100_SHARD_COUNT,
  DROID100_SOURCE_PREFIX,
  buildDroid100AcquisitionManifest,
} from "../src/outsider-droid100-adapter.js";
import { crc32c } from "../src/outsider-tfrecord-example.js";
import { verifyCurateEpisode } from "../src/outsider-curate-core.js";

const REAL_SHARD = fileURLToPath(new URL(
  "../artifacts/curate-droid100-20260819/source/r2d2_faceblur-train.tfrecord-00000-of-00031",
  import.meta.url,
));
const REAL_OBJECT_LIST = fileURLToPath(new URL(
  "../artifacts/curate-droid100-20260819/source/gcs-objects.json", import.meta.url,
));
const REAL_SHARD_AVAILABLE = existsSync(REAL_SHARD) && existsSync(REAL_OBJECT_LIST)
  && statSync(REAL_SHARD).size === DROID100_FIRST_SHARD_PIN.sizeBytes;

function sourceObject(name, index, size) {
  return {
    uri: `${DROID100_SOURCE_PREFIX}${name}`,
    generation: String(1000 + index),
    size: String(size),
    md5Hash: Buffer.alloc(16, index).toString("base64"),
    crc32c: Buffer.alloc(4, index).toString("base64"),
  };
}

function checksums(bytes) {
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32c(bytes));
  return {
    md5Hash: createHash("md5").update(bytes).digest("base64"),
    crc32c: crc.toString("base64"),
  };
}

function metadataBytesManifest(datasetInfoBytes, featureBytes) {
  const objects = [];
  for (const [name, index, bytes] of [
    ["dataset_info.json", 40, datasetInfoBytes], ["features.json", 41, featureBytes],
  ]) {
    objects.push({
      uri: `${DROID100_SOURCE_PREFIX}${name}`,
      generation: String(1000 + index),
      size: String(bytes.length),
      ...checksums(bytes),
    });
  }
  for (let index = 0; index < DROID100_SHARD_COUNT; index += 1) {
    objects.push(sourceObject(
      `r2d2_faceblur-train.tfrecord-${String(index).padStart(5, "0")}-of-00031`,
      index, 1000 + index,
    ));
  }
  return buildDroid100AcquisitionManifest(objects);
}

function accountingManifest() {
  const targetShardBytes = 2_192_595_669;
  const objects = [sourceObject("dataset_info.json", 40, 760), sourceObject("features.json", 41, 18_665)];
  let used = 0;
  for (let index = 0; index < DROID100_SHARD_COUNT; index += 1) {
    const size = index === 0 ? DROID100_FIRST_SHARD_PIN.sizeBytes
      : index === DROID100_SHARD_COUNT - 1 ? targetShardBytes - used : 1_000;
    used += size;
    objects.push(sourceObject(
      `r2d2_faceblur-train.tfrecord-${String(index).padStart(5, "0")}-of-00031`,
      index, size,
    ));
  }
  return buildDroid100AcquisitionManifest(objects);
}

function tensor(dtype, dimensions = []) {
  return { tensor: { dtype, encoding: "none", shape: dimensions.length ? { dimensions } : {} } };
}

function featuresFixture() {
  const actionDict = {
    cartesian_position: tensor("float64", ["6"]),
    cartesian_velocity: tensor("float64", ["6"]),
    gripper_position: tensor("float64", ["1"]),
    gripper_velocity: tensor("float64", ["1"]),
    joint_position: tensor("float64", ["7"]),
    joint_velocity: tensor("float64", ["7"]),
  };
  const image = () => ({
    pythonClassName: "tensorflow_datasets.core.features.image_feature.Image",
    image: { dtype: "uint8", encodingFormat: "jpeg", shape: { dimensions: ["180", "320", "3"] } },
  });
  const observation = {
    cartesian_position: tensor("float64", ["6"]),
    exterior_image_1_left: image(),
    exterior_image_2_left: image(),
    gripper_position: tensor("float64", ["1"]),
    joint_position: tensor("float64", ["7"]),
    wrist_image_left: image(),
  };
  const steps = {
    action: tensor("float64", ["7"]),
    action_dict: { featuresDict: { features: actionDict } },
    discount: tensor("float32"),
    is_first: tensor("bool"),
    is_last: tensor("bool"),
    is_terminal: tensor("bool"),
    language_instruction: tensor("string"),
    language_instruction_2: tensor("string"),
    language_instruction_3: tensor("string"),
    observation: { featuresDict: { features: observation } },
    reward: tensor("float32"),
  };
  return { featuresDict: { features: {
    episode_metadata: { featuresDict: { features: {
      file_path: tensor("string"), recording_folderpath: tensor("string"),
    } } },
    steps: { sequence: { feature: { featuresDict: { features: steps } } } },
  } } };
}

function protobufVarint(input) {
  let value = BigInt(input);
  const bytes = [];
  while (value >= 0x80n) {
    bytes.push(Number(value & 0x7fn) | 0x80);
    value >>= 7n;
  }
  bytes.push(Number(value));
  return Buffer.from(bytes);
}

function protobufField(fieldNumber, wire, value) {
  const tag = protobufVarint((fieldNumber << 3) | wire);
  return wire === 2
    ? Buffer.concat([tag, protobufVarint(value.length), value]) : Buffer.concat([tag, value]);
}

function encodedBytesFeature(values) {
  return protobufField(1, 2, Buffer.concat(values.map((value) => (
    protobufField(1, 2, Buffer.from(value))
  ))));
}

function encodedFloatFeature(values) {
  const packed = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => packed.writeFloatLE(value, index * 4));
  return protobufField(2, 2, protobufField(1, 2, packed));
}

function encodedIntFeature(values) {
  return protobufField(3, 2, protobufField(1, 2, Buffer.concat(values.map(protobufVarint))));
}

function encodedExample(entries) {
  const maps = Object.entries(entries).map(([name, feature]) => protobufField(1, 2,
    Buffer.concat([
      protobufField(1, 2, Buffer.from(name)), protobufField(2, 2, feature),
    ])));
  return protobufField(1, 2, Buffer.concat(maps));
}

function tinyJpeg() {
  return Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xb4, 0x01, 0x40, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
}

function projectionExample() {
  const steps = 2;
  const floats = (dimensions) => Array.from(
    { length: steps * dimensions }, (_, index) => (index + 1) / 100,
  );
  const imageValues = [tinyJpeg(), tinyJpeg()];
  return encodedExample({
    "episode_metadata/file_path": encodedBytesFeature(["/private/collector-alice/file"]),
    "episode_metadata/recording_folderpath": encodedBytesFeature(["/private/collector-alice"]),
    "steps/action": encodedFloatFeature(floats(7)),
    "steps/action_dict/cartesian_position": encodedFloatFeature(floats(6)),
    "steps/action_dict/cartesian_velocity": encodedFloatFeature(floats(6)),
    "steps/action_dict/gripper_position": encodedFloatFeature(floats(1)),
    "steps/action_dict/gripper_velocity": encodedFloatFeature(floats(1)),
    "steps/action_dict/joint_position": encodedFloatFeature(floats(7)),
    "steps/action_dict/joint_velocity": encodedFloatFeature(floats(7)),
    "steps/discount": encodedFloatFeature([1, 1]),
    "steps/is_first": encodedIntFeature([1, 0]),
    "steps/is_last": encodedIntFeature([0, 1]),
    "steps/is_terminal": encodedIntFeature([0, 1]),
    "steps/language_instruction": encodedBytesFeature(["private task", "private task"]),
    "steps/language_instruction_2": encodedBytesFeature(["private alt", "private alt"]),
    "steps/language_instruction_3": encodedBytesFeature(["private alt3", "private alt3"]),
    "steps/observation/cartesian_position": encodedFloatFeature(floats(6)),
    "steps/observation/exterior_image_1_left": encodedBytesFeature(imageValues),
    "steps/observation/exterior_image_2_left": encodedBytesFeature(imageValues),
    "steps/observation/gripper_position": encodedFloatFeature(floats(1)),
    "steps/observation/joint_position": encodedFloatFeature(floats(7)),
    "steps/observation/wrist_image_left": encodedBytesFeature(imageValues),
    "steps/reward": encodedFloatFeature([0, 1]),
  });
}

function projectionManifest() {
  const objects = [sourceObject("dataset_info.json", 40, 760), sourceObject("features.json", 41, 18_665)];
  for (let index = 0; index < DROID100_SHARD_COUNT; index += 1) {
    const name = `r2d2_faceblur-train.tfrecord-${String(index).padStart(5, "0")}-of-00031`;
    if (index === 0) {
      objects.push({
        uri: `${DROID100_SOURCE_PREFIX}${name}`,
        generation: "1710528095074666",
        size: String(DROID100_FIRST_SHARD_PIN.sizeBytes),
        md5Hash: DROID100_FIRST_SHARD_PIN.md5Base64,
        crc32c: DROID100_FIRST_SHARD_PIN.crc32cBase64,
      });
    } else objects.push(sourceObject(name, index, 1000 + index));
  }
  return buildDroid100AcquisitionManifest(objects);
}

test("encoded image projection keeps only commitment and PNG dimensions", () => {
  const png = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(png);
  png.writeUInt32BE(13, 8);
  png.write("IHDR", 12, "ascii");
  png.writeUInt32BE(320, 16);
  png.writeUInt32BE(180, 20);
  png[24] = 8;
  png[25] = 2;
  assert.deepEqual(summarizeEncodedImage(png), {
    commitment: "sha256:7801484b8dd0065f0ccec91e30a8cdfac9c159eda2c487cb782a491666be5d98",
    byteLength: 33,
    format: "png",
    width: 320,
    height: 180,
    channels: 3,
  });
});

test("encoded image projection reads JPEG SOF without decoding pixels", () => {
  const jpeg = Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0xb4, 0x01, 0x40, 0x03,
    0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    0xff, 0xd9,
  ]);
  const summary = summarizeEncodedImage(jpeg);
  assert.equal(summary.format, "jpeg");
  assert.equal(summary.width, 320);
  assert.equal(summary.height, 180);
  assert.equal(summary.channels, 3);
  assert.equal("bytes" in summary, false);
  assert.match(summary.commitment, /^sha256:[a-f0-9]{64}$/);
});

test("encoded image projection fails closed on unknown or malformed encodings", () => {
  assert.throws(() => summarizeEncodedImage(Buffer.from("not an image")), /IMAGE_ENCODING_UNSUPPORTED/);
  assert.throws(() => summarizeEncodedImage(Buffer.from([0xff, 0xd8, 0xff, 0xd9])), /JPEG_SOF_MISSING/);
});

test("real first-shard verifier is pinned and refuses partial bytes", () => {
  assert.equal(DROID100_FIRST_SHARD_PIN.sizeBytes, 27_488_816);
  assert.equal(DROID100_FIRST_SHARD_PIN.md5Base64, "IQoCwa04u58UpSOzKsS/6g==");
  assert.equal(DROID100_FIRST_SHARD_PIN.crc32cBase64, "zgQNQw==");
  assert.throws(() => verifyDroid100FirstShardBytes(Buffer.alloc(1)), /FIRST_SHARD_SIZE_MISMATCH:1/);
});

test("local metadata bytes must match manifest size, MD5, and CRC32C", () => {
  const datasetInfoBytes = Buffer.from('{"name":"r2d2_faceblur"}');
  const featureBytes = Buffer.from('{"featuresDict":{}}');
  const manifest = metadataBytesManifest(datasetInfoBytes, featureBytes);
  const verified = verifyDroid100ManifestObjectBytes(datasetInfoBytes, {
    manifest, role: "DATASET_INFO",
  });
  assert.equal(verified.sizeBytes, datasetInfoBytes.length);
  assert.match(verified.sha256, /^sha256:[a-f0-9]{64}$/);
  const tampered = Buffer.from(datasetInfoBytes);
  tampered[0] ^= 1;
  assert.throws(() => verifyDroid100ManifestObjectBytes(tampered, {
    manifest, role: "DATASET_INFO",
  }), /OBJECT_BYTES_MD5_MISMATCH/);
});

test("TFDS dataset accounting binds 31 shards, 100 episodes, and 16-byte framing", () => {
  const manifest = accountingManifest();
  const shardLengths = ["2", ...new Array(29).fill("3"), "11"];
  const result = validateDroid100DatasetInfo({
    fileFormat: "tfrecord",
    name: "r2d2_faceblur",
    version: "1.0.0",
    splits: [{ name: "train", numBytes: "2192594069", shardLengths }],
  }, { manifest });
  assert.equal(result.episodeCount, 100);
  assert.equal(result.tfRecordFramingBytes, 1600);
  assert.match(result.validationHash, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() => validateDroid100DatasetInfo({
    fileFormat: "tfrecord", name: "r2d2_faceblur", version: "1.0.0",
    splits: [{ name: "train", numBytes: "2192594068", shardLengths }],
  }, { manifest }), /TFRECORD_ACCOUNTING_MISMATCH/);
});

test("official 23-feature schema is exact and image encoding fails closed", () => {
  const fixture = featuresFixture();
  const validated = validateDroid100FeaturesSchema(fixture);
  assert.equal(validated.featureCount, 23);
  assert.equal(validated.imageStreams, 3);
  const tampered = structuredClone(fixture);
  tampered.featuresDict.features.steps.sequence.feature.featuresDict.features
    .observation.featuresDict.features.wrist_image_left.image.encodingFormat = "png";
  assert.throws(() => validateDroid100FeaturesSchema(tampered), /FEATURES_IMAGE_SCHEMA_MISMATCH/);
});

test("production projection refuses synthetic frames and copied public shard pins", () => {
  const data = projectionExample();
  const frame = {
    data,
    dataHash: `sha256:${createHash("sha256").update(data).digest("hex")}`,
  };
  const manifest = projectionManifest();
  const verifiedShard = {
    sizeBytes: DROID100_FIRST_SHARD_PIN.sizeBytes,
    md5Base64: DROID100_FIRST_SHARD_PIN.md5Base64,
    crc32cBase64: DROID100_FIRST_SHARD_PIN.crc32cBase64,
    sha256: `sha256:${"d".repeat(64)}`,
  };
  assert.throws(() => projectDroid100RldsEpisode(frame, {
    manifest, verifiedShard, episodeOrdinal: 0,
  }), /DROID100_RLDS_SHARD_UNVERIFIED/);
  assert.throws(() => normalizeDroid100RldsEpisode(frame, {
    manifest, verifiedShard, episodeOrdinal: 1,
  }), /DROID100_RLDS_SHARD_UNVERIFIED/);
  assert.match(DROID100_RLDS_IMPLEMENTATION_HASH, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() => decodeDroid100FirstShard(Buffer.alloc(1)),
    /DROID100_FIRST_SHARD_SIZE_MISMATCH:1/);
});

test("exact real-shard pipeline binds frame identity and emits only the safe schema", {
  skip: !REAL_SHARD_AVAILABLE,
}, () => {
  const manifest = buildDroid100AcquisitionManifest(readFileSync(REAL_OBJECT_LIST));
  const { verifiedShard, frames } = decodeDroid100FirstShard(readFileSync(REAL_SHARD));
  assert.equal(frames.length, 2);
  const projected = projectDroid100RldsEpisode(frames[0], {
    manifest, verifiedShard, episodeOrdinal: 0,
  });
  assert.equal(projected.steps.length, 166);
  assert.equal(projected.steps[0].observation.images.length, 3);
  assert.equal(Object.keys(projected.steps[0].observation.features).length, 14);
  assert.equal(Object.keys(projected.steps[0].action.features).length, 35);
  assert.equal(Object.keys(projected.steps[0].outcome.features).length, 2);
  assert.equal(projected.instrument.extractorImplementationHash,
    DROID100_RLDS_IMPLEMENTATION_HASH);
  const serialized = JSON.stringify(projected);
  assert.doesNotMatch(serialized,
    /episode_metadata|language_instruction|recording_folderpath|"type":"Buffer"/);
  const normalized = normalizeDroid100RldsEpisode(frames[0], {
    manifest, verifiedShard, episodeOrdinal: 0,
  });
  assert.equal(verifyCurateEpisode(normalized).ok, true);
  assert.throws(() => projectDroid100RldsEpisode(frames[0], {
    manifest, verifiedShard, episodeOrdinal: 1,
  }), /DROID100_RLDS_FRAME_UNVERIFIED/);
  assert.throws(() => projectDroid100RldsEpisode({ ...frames[0] }, {
    manifest, verifiedShard, episodeOrdinal: 0,
  }), /DROID100_RLDS_FRAME_UNVERIFIED/);
  assert.throws(() => projectDroid100RldsEpisode(frames[0], {
    manifest, verifiedShard, episodeOrdinal: 0, licenseId: "Apache-2.0",
  }), /DROID100_RLDS_LICENSE_ID_UNSUPPORTED/);
});
