import test from "node:test";
import assert from "node:assert/strict";
import {
  crc32c,
  decodeTensorFlowExample,
  decodeTfRecordFrames,
  maskTfRecordCrc32c,
} from "../src/outsider-tfrecord-example.js";

function varint(input) {
  let value = BigInt(input);
  const bytes = [];
  while (value >= 0x80n) {
    bytes.push(Number(value & 0x7fn) | 0x80);
    value >>= 7n;
  }
  bytes.push(Number(value));
  return Buffer.from(bytes);
}

function field(fieldNumber, wire, value) {
  const tag = varint(BigInt((fieldNumber << 3) | wire));
  return wire === 2 ? Buffer.concat([tag, varint(value.length), value]) : Buffer.concat([tag, value]);
}

function bytesFeature(values) {
  const list = Buffer.concat(values.map((value) => field(1, 2, Buffer.from(value))));
  return field(1, 2, list);
}

function floatFeature(values) {
  const packed = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => packed.writeFloatLE(value, index * 4));
  return field(2, 2, field(1, 2, packed));
}

function intFeature(values) {
  const packed = Buffer.concat(values.map(varint));
  return field(3, 2, field(1, 2, packed));
}

function example(entries) {
  const maps = entries.map(([name, feature]) => {
    const entry = Buffer.concat([field(1, 2, Buffer.from(name)), field(2, 2, feature)]);
    return field(1, 2, entry);
  });
  return field(1, 2, Buffer.concat(maps));
}

function tfrecord(data) {
  const length = Buffer.alloc(8);
  length.writeBigUInt64LE(BigInt(data.length));
  const lengthCrc = Buffer.alloc(4);
  lengthCrc.writeUInt32LE(maskTfRecordCrc32c(crc32c(length)));
  const dataCrc = Buffer.alloc(4);
  dataCrc.writeUInt32LE(maskTfRecordCrc32c(crc32c(data)));
  return Buffer.concat([length, lengthCrc, data, dataCrc]);
}

test("CRC32C and masked CRC match published check values", () => {
  assert.equal(crc32c(Buffer.from("123456789")), 0xe3069283);
  assert.equal(maskTfRecordCrc32c(0xe3069283), 0xc78ab0e5);
});

test("TFRecord framing verifies length/data CRC and hashes payload", () => {
  const one = Buffer.from("one");
  const two = Buffer.from("two");
  const frames = decodeTfRecordFrames(Buffer.concat([tfrecord(one), tfrecord(two)]));
  assert.equal(frames.length, 2);
  assert.deepEqual(frames.map((frame) => frame.data.toString()), ["one", "two"]);
  assert.match(frames[0].dataHash, /^sha256:[a-f0-9]{64}$/);

  const corrupt = tfrecord(one);
  corrupt[12] ^= 1;
  assert.throws(() => decodeTfRecordFrames(corrupt), /TFRECORD_DATA_CRC_MISMATCH:0/);
  assert.throws(() => decodeTfRecordFrames(tfrecord(one).subarray(0, -1)), /TFRECORD_TRUNCATED_DATA/);
});

test("minimal tensorflow.Example decoder reads bytes, packed floats, and packed int64", () => {
  const encoded = example([
    ["steps/image", bytesFeature([Buffer.from([1, 2]), Buffer.from([3, 4])])],
    ["steps/action", floatFeature([1.25, -2.5])],
    ["steps/is_first", intFeature([1, 0])],
  ]);
  const decoded = decodeTensorFlowExample(encoded);
  assert.deepEqual(decoded.map(({ name, kind, values }) => ({
    name,
    kind,
    values: values.map((value) => Buffer.isBuffer(value) ? value.toString("hex") : value),
  })), [
    { name: "steps/action", kind: "float", values: [1.25, -2.5] },
    { name: "steps/image", kind: "bytes", values: ["0102", "0304"] },
    { name: "steps/is_first", kind: "int64", values: [1, 0] },
  ]);
});

test("protobuf decoder fails closed on unsupported fields and duplicate feature names", () => {
  const unknownTop = Buffer.concat([example([["x", intFeature([1])]]), field(2, 0, varint(1))]);
  assert.throws(() => decodeTensorFlowExample(unknownTop), /TFEXAMPLE_TOP_LEVEL_FIELD_UNSUPPORTED/);
  const duplicate = example([["x", intFeature([1])], ["x", intFeature([2])]]);
  assert.throws(() => decodeTensorFlowExample(duplicate), /TFEXAMPLE_FEATURE_NAME_DUPLICATE:x/);
});
