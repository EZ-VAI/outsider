import { createHash } from "node:crypto";
import { closeSync, fstatSync, openSync, readSync } from "node:fs";
import { TextDecoder } from "node:util";

const CRC32C_POLYNOMIAL = 0x82f63b78;
const TFRECORD_MASK_DELTA = 0xa282ead8;
const DEFAULT_MAX_RECORD_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_FEATURES = 4096;
const utf8 = new TextDecoder("utf-8", { fatal: true });

const crc32cTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? ((value >>> 1) ^ CRC32C_POLYNOMIAL) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

export function crc32c(bytes) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    fail("TFRECORD_CRC_INPUT_INVALID");
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crc32cTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)) >>> 0;
  return (crc ^ 0xffffffff) >>> 0;
}

export function maskTfRecordCrc32c(crc) {
  const value = Number(crc) >>> 0;
  return ((((value >>> 15) | (value << 17)) >>> 0) + TFRECORD_MASK_DELTA) >>> 0;
}

function verifyMaskedCrc(bytes, stored, label, index) {
  const actual = maskTfRecordCrc32c(crc32c(bytes));
  if (actual !== stored) fail(`TFRECORD_${label}_CRC_MISMATCH`, index);
}

function lengthFromHeader(header, maxRecordBytes, index) {
  const length = header.readBigUInt64LE(0);
  if (length > BigInt(Number.MAX_SAFE_INTEGER) || length > BigInt(maxRecordBytes)) {
    fail("TFRECORD_RECORD_LENGTH_INVALID", index);
  }
  verifyMaskedCrc(header.subarray(0, 8), header.readUInt32LE(8), "LENGTH", index);
  return Number(length);
}

function frameResult(data, index, offset) {
  return {
    index,
    offset,
    length: data.length,
    data,
    dataHash: `sha256:${createHash("sha256").update(data).digest("hex")}`,
  };
}

/** Parse a complete in-memory TFRecord stream. Truncated tails fail closed. */
export function decodeTfRecordFrames(bytes, {
  maxRecords = Number.MAX_SAFE_INTEGER,
  maxRecordBytes = DEFAULT_MAX_RECORD_BYTES,
} = {}) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const frames = [];
  let offset = 0;
  let index = 0;
  while (offset < buffer.length && index < maxRecords) {
    if (buffer.length - offset < 12) fail("TFRECORD_TRUNCATED_HEADER", index);
    const header = buffer.subarray(offset, offset + 12);
    const length = lengthFromHeader(header, maxRecordBytes, index);
    const end = offset + 12 + length + 4;
    if (end > buffer.length) fail("TFRECORD_TRUNCATED_DATA", index);
    const data = buffer.subarray(offset + 12, offset + 12 + length);
    verifyMaskedCrc(data, buffer.readUInt32LE(offset + 12 + length), "DATA", index);
    frames.push(frameResult(data, index, offset));
    offset = end;
    index += 1;
  }
  if (index < maxRecords && offset !== buffer.length) fail("TFRECORD_TRAILING_BYTES", offset);
  return frames;
}

function readExact(fd, buffer, position) {
  let read = 0;
  while (read < buffer.length) {
    const count = readSync(fd, buffer, read, buffer.length - read, position + read);
    if (count === 0) break;
    read += count;
  }
  return read;
}

/**
 * Synchronously iterate a local TFRecord without loading the whole shard. The
 * file is never named in yielded records and the descriptor is always closed.
 */
export function* iterateTfRecordFile(file, {
  maxRecords = Number.MAX_SAFE_INTEGER,
  maxRecordBytes = DEFAULT_MAX_RECORD_BYTES,
} = {}) {
  const fd = openSync(file, "r");
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) fail("TFRECORD_SOURCE_NOT_REGULAR_FILE");
    let offset = 0;
    let index = 0;
    while (offset < stat.size && index < maxRecords) {
      const header = Buffer.allocUnsafe(12);
      if (readExact(fd, header, offset) !== header.length) fail("TFRECORD_TRUNCATED_HEADER", index);
      const length = lengthFromHeader(header, maxRecordBytes, index);
      const data = Buffer.allocUnsafe(length);
      if (readExact(fd, data, offset + 12) !== length) fail("TFRECORD_TRUNCATED_DATA", index);
      const checksum = Buffer.allocUnsafe(4);
      if (readExact(fd, checksum, offset + 12 + length) !== 4) fail("TFRECORD_TRUNCATED_DATA_CRC", index);
      verifyMaskedCrc(data, checksum.readUInt32LE(0), "DATA", index);
      yield frameResult(data, index, offset);
      offset += 12 + length + 4;
      index += 1;
    }
  } finally {
    closeSync(fd);
  }
}

class ProtoCursor {
  constructor(bytes, label) {
    this.bytes = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    this.offset = 0;
    this.label = label;
  }

  get done() { return this.offset === this.bytes.length; }

  varint() {
    let value = 0n;
    for (let shift = 0n; shift < 70n; shift += 7n) {
      if (this.offset >= this.bytes.length) fail("PROTOBUF_TRUNCATED_VARINT", this.label);
      const byte = this.bytes[this.offset++];
      value |= BigInt(byte & 0x7f) << shift;
      if ((byte & 0x80) === 0) {
        if (shift === 63n && byte > 1) fail("PROTOBUF_VARINT_OVERFLOW", this.label);
        return value;
      }
    }
    fail("PROTOBUF_VARINT_OVERFLOW", this.label);
  }

  tag() {
    const raw = this.varint();
    const field = Number(raw >> 3n);
    const wire = Number(raw & 7n);
    if (!Number.isSafeInteger(field) || field <= 0) fail("PROTOBUF_FIELD_NUMBER_INVALID", this.label);
    if (![0, 1, 2, 5].includes(wire)) fail("PROTOBUF_WIRE_TYPE_UNSUPPORTED", `${this.label}:${wire}`);
    return { field, wire };
  }

  lengthDelimited() {
    const length = this.varint();
    if (length > BigInt(Number.MAX_SAFE_INTEGER)) fail("PROTOBUF_LENGTH_INVALID", this.label);
    const end = this.offset + Number(length);
    if (end > this.bytes.length) fail("PROTOBUF_TRUNCATED_LENGTH_DELIMITED", this.label);
    const value = this.bytes.subarray(this.offset, end);
    this.offset = end;
    return value;
  }

  float32() {
    if (this.offset + 4 > this.bytes.length) fail("PROTOBUF_TRUNCATED_FLOAT", this.label);
    const value = this.bytes.readFloatLE(this.offset);
    this.offset += 4;
    if (!Number.isFinite(value)) fail("PROTOBUF_NONFINITE_FLOAT", this.label);
    return value;
  }
}

function requireWire(actual, expected, label) {
  if (actual !== expected) fail("PROTOBUF_WIRE_TYPE_INVALID", label);
}

function signedInt64(value) {
  const signed = value >= (1n << 63n) ? value - (1n << 64n) : value;
  return signed >= BigInt(Number.MIN_SAFE_INTEGER) && signed <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(signed) : signed;
}

function decodeBytesList(bytes) {
  const cursor = new ProtoCursor(bytes, "BytesList");
  const values = [];
  while (!cursor.done) {
    const tag = cursor.tag();
    if (tag.field !== 1) fail("TFEXAMPLE_BYTES_LIST_FIELD_UNSUPPORTED", tag.field);
    requireWire(tag.wire, 2, "BytesList.value");
    values.push(cursor.lengthDelimited());
  }
  return values;
}

function decodeFloatList(bytes) {
  const cursor = new ProtoCursor(bytes, "FloatList");
  const values = [];
  while (!cursor.done) {
    const tag = cursor.tag();
    if (tag.field !== 1) fail("TFEXAMPLE_FLOAT_LIST_FIELD_UNSUPPORTED", tag.field);
    if (tag.wire === 5) values.push(cursor.float32());
    else if (tag.wire === 2) {
      const packed = new ProtoCursor(cursor.lengthDelimited(), "FloatList.packed");
      if (packed.bytes.length % 4 !== 0) fail("TFEXAMPLE_PACKED_FLOAT_LENGTH_INVALID");
      while (!packed.done) values.push(packed.float32());
    } else fail("PROTOBUF_WIRE_TYPE_INVALID", "FloatList.value");
  }
  return values;
}

function decodeInt64List(bytes) {
  const cursor = new ProtoCursor(bytes, "Int64List");
  const values = [];
  while (!cursor.done) {
    const tag = cursor.tag();
    if (tag.field !== 1) fail("TFEXAMPLE_INT64_LIST_FIELD_UNSUPPORTED", tag.field);
    if (tag.wire === 0) values.push(signedInt64(cursor.varint()));
    else if (tag.wire === 2) {
      const packed = new ProtoCursor(cursor.lengthDelimited(), "Int64List.packed");
      while (!packed.done) values.push(signedInt64(packed.varint()));
    } else fail("PROTOBUF_WIRE_TYPE_INVALID", "Int64List.value");
  }
  return values;
}

function decodeFeature(bytes) {
  const cursor = new ProtoCursor(bytes, "Feature");
  let decoded = null;
  while (!cursor.done) {
    const tag = cursor.tag();
    if (![1, 2, 3].includes(tag.field)) fail("TFEXAMPLE_FEATURE_KIND_UNSUPPORTED", tag.field);
    requireWire(tag.wire, 2, "Feature.kind");
    if (decoded !== null) fail("TFEXAMPLE_FEATURE_ONEOF_MULTIPLE");
    const list = cursor.lengthDelimited();
    if (tag.field === 1) decoded = { kind: "bytes", values: decodeBytesList(list) };
    if (tag.field === 2) decoded = { kind: "float", values: decodeFloatList(list) };
    if (tag.field === 3) decoded = { kind: "int64", values: decodeInt64List(list) };
  }
  if (decoded === null) fail("TFEXAMPLE_FEATURE_KIND_MISSING");
  return decoded;
}

function decodeMapEntry(bytes) {
  const cursor = new ProtoCursor(bytes, "Features.feature");
  let name = null;
  let feature = null;
  while (!cursor.done) {
    const tag = cursor.tag();
    requireWire(tag.wire, 2, "Features.feature.entry");
    if (tag.field === 1) {
      if (name !== null) fail("TFEXAMPLE_FEATURE_KEY_DUPLICATE");
      try { name = utf8.decode(cursor.lengthDelimited()); }
      catch { fail("TFEXAMPLE_FEATURE_KEY_UTF8_INVALID"); }
    } else if (tag.field === 2) {
      if (feature !== null) fail("TFEXAMPLE_FEATURE_VALUE_DUPLICATE");
      feature = decodeFeature(cursor.lengthDelimited());
    } else fail("TFEXAMPLE_MAP_ENTRY_FIELD_UNSUPPORTED", tag.field);
  }
  if (!name || feature === null || name.includes("\0")) fail("TFEXAMPLE_MAP_ENTRY_INCOMPLETE");
  return { name, ...feature };
}

/** Decode the standard tensorflow.Example feature map, with no TensorFlow dependency. */
export function decodeTensorFlowExample(bytes, { maxFeatures = DEFAULT_MAX_FEATURES } = {}) {
  const example = new ProtoCursor(bytes, "Example");
  const top = example.tag();
  if (top.field !== 1 || top.wire !== 2) fail("TFEXAMPLE_FEATURES_REQUIRED");
  const featuresMessage = example.lengthDelimited();
  if (!example.done) fail("TFEXAMPLE_TOP_LEVEL_FIELD_UNSUPPORTED");
  const features = new ProtoCursor(featuresMessage, "Features");
  const output = [];
  const names = new Set();
  while (!features.done) {
    const tag = features.tag();
    if (tag.field !== 1 || tag.wire !== 2) fail("TFEXAMPLE_FEATURES_FIELD_UNSUPPORTED");
    if (output.length >= maxFeatures) fail("TFEXAMPLE_FEATURE_COUNT_LIMIT");
    const decoded = decodeMapEntry(features.lengthDelimited());
    if (names.has(decoded.name)) fail("TFEXAMPLE_FEATURE_NAME_DUPLICATE", decoded.name);
    names.add(decoded.name);
    output.push(decoded);
  }
  output.sort((left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0));
  return output;
}
