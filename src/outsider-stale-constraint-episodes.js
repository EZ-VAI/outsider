/*
 * Source-replayed intake for the constructed stale-constraint agent study.
 *
 * This adapter intentionally keeps the ZIP, prompts and raw model responses in
 * a private local source directory.  Its public result contains only hashes,
 * aggregate counts, structural (pre-outcome) research features and a HOLD-only
 * review queue.  It never turns the study's deterministic score into a real
 * outcome, actor credit, authority or permission to act.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, rmdirSync, Stats,
} from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { types as utilTypes } from "node:util";

import { canonicalizeStrict } from "./canonical.js";

/* This file is a source-trust boundary. Capture every mutable intrinsic used
 * below before a same-process caller can replace an ambient constructor,
 * static method or prototype method after import. */
const ReflectApply = Reflect.apply;
const uncurryThis = (method) => (receiver, ...args) =>
  ReflectApply(method, receiver, args);
const ArrayConstructor = Array;
const ArrayAt = uncurryThis(Array.prototype.at);
const ArrayEvery = uncurryThis(Array.prototype.every);
const ArrayFill = uncurryThis(Array.prototype.fill);
const ArrayFilter = uncurryThis(Array.prototype.filter);
const ArrayFind = uncurryThis(Array.prototype.find);
const ArrayFlatMap = uncurryThis(Array.prototype.flatMap);
const ArrayForEach = uncurryThis(Array.prototype.forEach);
const ArrayIncludes = uncurryThis(Array.prototype.includes);
const ArrayIsArray = Array.isArray;
const ArrayMap = uncurryThis(Array.prototype.map);
const ArrayPush = uncurryThis(Array.prototype.push);
const ArrayReduce = uncurryThis(Array.prototype.reduce);
const ArrayShift = uncurryThis(Array.prototype.shift);
const ArraySlice = uncurryThis(Array.prototype.slice);
const ArraySome = uncurryThis(Array.prototype.some);
const ArraySort = uncurryThis(Array.prototype.sort);
const BigIntConstructor = BigInt;
const BooleanConstructor = Boolean;
const BufferByteLength = Buffer.byteLength;
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferReadUInt16LE = uncurryThis(Buffer.prototype.readUInt16LE);
const BufferReadUInt32LE = uncurryThis(Buffer.prototype.readUInt32LE);
const BufferSubarray = uncurryThis(Buffer.prototype.subarray);
const BufferToString = uncurryThis(Buffer.prototype.toString);
const CryptoHashPrototype = Object.getPrototypeOf(createHash("sha256"));
const CryptoHashUpdate = uncurryThis(CryptoHashPrototype.update);
const CryptoHashDigest = uncurryThis(CryptoHashPrototype.digest);
const ErrorConstructor = Error;
const JSONParse = JSON.parse;
const MapConstructor = Map;
const MapEntries = uncurryThis(Map.prototype.entries);
const MapForEach = uncurryThis(Map.prototype.forEach);
const MapGet = uncurryThis(Map.prototype.get);
const MapHas = uncurryThis(Map.prototype.has);
const MapSet = uncurryThis(Map.prototype.set);
const MapSize = uncurryThis(Object.getOwnPropertyDescriptor(Map.prototype, "size").get);
const MapValues = uncurryThis(Map.prototype.values);
const MathExp = Math.exp;
const MathFloor = Math.floor;
const MathLog = Math.log;
const MathMax = Math.max;
const MathMin = Math.min;
const MathSqrt = Math.sqrt;
const NumberConstructor = Number;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const NumberToFixed = uncurryThis(Number.prototype.toFixed);
const NumberToString = uncurryThis(Number.prototype.toString);
const ObjectEntries = Object.entries;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectKeys = Object.keys;
const ObjectPrototype = Object.prototype;
const ObjectValues = Object.values;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpExec = uncurryThis(RegExp.prototype.exec);
const RegExpTest = uncurryThis(RegExp.prototype.test);
const SetConstructor = Set;
const SetAdd = uncurryThis(Set.prototype.add);
const SetForEach = uncurryThis(Set.prototype.forEach);
const SetHas = uncurryThis(Set.prototype.has);
const SetSize = uncurryThis(ObjectGetOwnPropertyDescriptor(Set.prototype, "size").get);
const SetValues = uncurryThis(Set.prototype.values);
const StatsIsDirectory = uncurryThis(Stats.prototype.isDirectory);
const StatsIsFile = uncurryThis(Stats.prototype.isFile);
const StatsIsSymbolicLink = uncurryThis(Stats.prototype.isSymbolicLink);
const TypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const TypedArrayLength = uncurryThis(
  Object.getOwnPropertyDescriptor(TypedArrayPrototype, "length").get);
const StringConstructor = String;
const StringIncludes = uncurryThis(String.prototype.includes);
const StringLocaleCompare = uncurryThis(String.prototype.localeCompare);
const StringMatch = uncurryThis(String.prototype.match);
const StringPadStart = uncurryThis(String.prototype.padStart);
const StringSlice = uncurryThis(String.prototype.slice);
const StringSplit = uncurryThis(String.prototype.split);
const StringStartsWith = uncurryThis(String.prototype.startsWith);
const StringToLocaleLowerCase = uncurryThis(String.prototype.toLocaleLowerCase);
const StringTrimEnd = uncurryThis(String.prototype.trimEnd);
const PathDirname = path.dirname;
const PathJoin = path.join;
const PathResolve = path.resolve;

function arrayCopy(values) {
  const result = new ArrayConstructor(values.length);
  for (let index = 0; index < values.length; index += 1) result[index] = values[index];
  return result;
}

function arrayMapSafe(values, callback) {
  const result = new ArrayConstructor(values.length);
  for (let index = 0; index < values.length; index += 1) {
    result[index] = callback(values[index], index);
  }
  return result;
}

function arrayFilterSafe(values, callback) {
  const result = new ArrayConstructor();
  for (let index = 0; index < values.length; index += 1) {
    if (callback(values[index], index)) ArrayPush(result, values[index]);
  }
  return result;
}

function arraySliceSafe(values, start, end = values.length) {
  const result = new ArrayConstructor();
  const boundedStart = start < 0 ? MathMax(values.length + start, 0) : start;
  const boundedEnd = end < 0 ? MathMax(values.length + end, 0)
    : MathMin(end, values.length);
  for (let index = boundedStart; index < boundedEnd; index += 1) {
    ArrayPush(result, values[index]);
  }
  return result;
}

function arrayConcatSafe(left, right) {
  const result = new ArrayConstructor();
  for (let index = 0; index < left.length; index += 1) ArrayPush(result, left[index]);
  for (let index = 0; index < right.length; index += 1) ArrayPush(result, right[index]);
  return result;
}

function setValuesSafe(set) {
  const result = new ArrayConstructor();
  SetForEach(set, (value) => { ArrayPush(result, value); });
  return result;
}

function setFromArraySafe(values) {
  const result = new SetConstructor();
  for (let index = 0; index < values.length; index += 1) SetAdd(result, values[index]);
  return result;
}

function mapValuesSafe(map) {
  const result = new ArrayConstructor();
  MapForEach(map, (value) => { ArrayPush(result, value); });
  return result;
}

function mapKeysSafe(map) {
  const result = new ArrayConstructor();
  MapForEach(map, (_value, key) => { ArrayPush(result, key); });
  return result;
}

function objectFromPairsSafe(pairs) {
  const result = {};
  for (let index = 0; index < pairs.length; index += 1) {
    result[pairs[index][0]] = pairs[index][1];
  }
  return result;
}

function bufferLength(value) {
  return TypedArrayLength(value);
}

export const STALE_CONSTRAINT_EPISODES_SCHEMA
  = "outsider/stale-constraint-constructed-episodes/v2";
export const STALE_CONSTRAINT_ARCHIVE_INDEX_SCHEMA
  = "outsider/stale-constraint-safe-archive-index/v2";
export const STALE_CONSTRAINT_RUN_RECEIPT_SCHEMA
  = "outsider/stale-constraint-constructed-episodes-run-receipt/v2";

export const STALE_CONSTRAINT_ZENODO_RECORD = ObjectFreeze({
  recordId: "22117197",
  conceptRecordId: "22108557",
  doi: "10.5281/zenodo.22117197",
  conceptDoi: "10.5281/zenodo.22108557",
  version: "v2",
  revision: 3,
  created: "2026-08-26T19:36:24.394138+00:00",
  modified: "2026-08-26T19:36:24.872110+00:00",
  licenseId: "cc-by-4.0",
  title: "When Stale Constraints Go Unchecked: Budgeted Verification Failures in Inherited Agent Memory",
});

export const STALE_CONSTRAINT_SOURCE_FILES = ObjectFreeze({
  recordBefore: "record-before.json",
  checksums: "SHA256SUMS",
  archive: "paper2-data-and-code-v2.zip",
  recordAfter: "record-after.json",
});

export const STALE_CONSTRAINT_SOURCE_URLS = ObjectFreeze({
  [STALE_CONSTRAINT_SOURCE_FILES.recordBefore]:
    "https://zenodo.org/api/records/22117197",
  [STALE_CONSTRAINT_SOURCE_FILES.checksums]:
    "https://zenodo.org/api/records/22117197/files/SHA256SUMS/content",
  [STALE_CONSTRAINT_SOURCE_FILES.archive]:
    "https://zenodo.org/api/records/22117197/files/paper2-data-and-code-v2.zip/content",
  [STALE_CONSTRAINT_SOURCE_FILES.recordAfter]:
    "https://zenodo.org/api/records/22117197",
});

const EXPECTED_FILES = ObjectFreeze({
  "paper2-data-and-code-v2.zip": ObjectFreeze({
    bytes: 22_808_747,
    md5: "6296f47aba45921fc12b9e3ef87d255f",
    sha256: "3825d8bae84706deba9cef8d5ddbb9eebc73a13fa0e898c83fb008bc05a55973",
  }),
  SHA256SUMS: ObjectFreeze({
    bytes: 279,
    md5: "71e3cdd016c0c6731069743a3927fa6c",
  }),
});

const EXPECTED_ARCHIVE = ObjectFreeze({
  entries: 5_588,
  compressedBytes: 20_958_613,
  uncompressedBytes: 76_192_717,
  maximumEntryBytes: 964_085,
  confirmatoryEpisodes: 5_400,
  pilotEpisodes: 48,
  keptCalls: 10_800,
  providerUsageRecords: 10_801,
  providerCallAttempts: 10_805,
  retryRecords: 5,
});

const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 24 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 6_000;
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 32;
const ROOT_PREFIX = "paper2-data-and-code-v2/";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const HEX32 = /^[a-f0-9]{32}$/u;
const IsProxy = utilTypes.isProxy;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

const CONFIRMATORY_PATH = /^paper2-data-and-code-v2\/next_studies\/stale_constraints\/(?:corrected_heldout\/runs\/heldout-corrected|runs\/(?:primary|replication|heldout))\/([^/]+)\.json$/u;
const PILOT_PATH = /^paper2-data-and-code-v2\/next_studies\/stale_constraints\/runs\/pilot\/([^/]+)\.json$/u;
const EPISODE_BASENAME = /^([^_]+)__([^_]+)__([^_]+)__(.+)__(\d+)$/u;

const SPLIT_SEED = "outsider/stale-constraint/cross-run-block-split/2026-08-28/v1";
const AUDIT_SEED = "outsider/stale-constraint/outcome-blind-audit/2026-08-28/v1";
const HOLDOUT_POOL_FRACTION = 0.30;
const AUDIT_RESERVE_FRACTION_OF_HOLDOUT = 1 / 3;
const PRIORITY_GROUP_FRACTION = 0.10;
const TRAINING = ObjectFreeze({
  algorithm: "DETERMINISTIC_L2_LOGISTIC_REGRESSION",
  epochs: 900,
  learningRate: 0.08,
  learningRateDecay: 0.002,
  l2: 0.001,
  threshold: 0.5,
});

const CATEGORICAL_FEATURES = ObjectFreeze([
  "form", "policy", "model", "family", "kind", "worldKey",
]);
const NUMERIC_FEATURES = ObjectFreeze([
  "budget", "targetChars", "targetNumerics", "targetClauses",
]);

function fail(code, detail = null) {
  throw new ErrorConstructor(detail == null ? `STALE_CONSTRAINT_EPISODES_${code}`
    : `STALE_CONSTRAINT_EPISODES_${code}:${detail}`);
}

function sha256(bytes) {
  const state = createHash("sha256");
  CryptoHashUpdate(state, bytes);
  return `sha256:${CryptoHashDigest(state, "hex")}`;
}

function md5(bytes) {
  const state = createHash("md5");
  CryptoHashUpdate(state, bytes);
  return CryptoHashDigest(state, "hex");
}

function digest(domain, value) {
  return sha256(BufferFrom(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function round(value) {
  return NumberIsFinite(value) ? NumberConstructor(NumberToFixed(value, 12)) : value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value);
  }
  return ObjectFreeze(value);
}

function requirePlainObject(value, code) {
  if (!value || typeof value !== "object" || ArrayIsArray(value) || IsProxy(value)
    || (ObjectGetPrototypeOf(value) !== ObjectPrototype
      && ObjectGetPrototypeOf(value) !== null)) fail(code);
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (!descriptor || !("value" in descriptor) || descriptor.enumerable !== true) {
      fail(code);
    }
  }
  return value;
}

function ownData(value, key, code) {
  const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
  if (!descriptor || !("value" in descriptor)) fail(code, key);
  return descriptor.value;
}

function requireSourceBytes(sourceBytes) {
  requirePlainObject(sourceBytes, "SOURCE_SET_INVALID");
  const expected = ArraySort(ObjectValues(STALE_CONSTRAINT_SOURCE_FILES));
  const actual = ArraySort(ObjectKeys(sourceBytes));
  if (!same(actual, expected)) fail("SOURCE_SET_INVALID");
  for (let index = 0; index < expected.length; index += 1) {
    const name = expected[index];
    const descriptor = ObjectGetOwnPropertyDescriptor(sourceBytes, name);
    if (!descriptor || !("value" in descriptor) || !BufferIsBuffer(descriptor.value)) {
      fail("SOURCE_BYTES_INVALID", name);
    }
  }
  return sourceBytes;
}

function parseJson(bytes, code) {
  try {
    const parsed = JSONParse(BufferToString(bytes, "utf8"));
    requirePlainObject(parsed, code);
    return parsed;
  } catch {
    fail(code);
  }
}

function materialRecordState(record) {
  const metadata = requirePlainObject(ownData(record, "metadata",
    "RECORD_METADATA_INVALID"), "RECORD_METADATA_INVALID");
  const license = requirePlainObject(ownData(metadata, "license",
    "RECORD_LICENSE_INVALID"), "RECORD_LICENSE_INVALID");
  const recordFiles = ownData(record, "files", "RECORD_FILES_INVALID");
  const files = ArrayIsArray(recordFiles) ? arrayMapSafe(recordFiles, (item) => {
    requirePlainObject(item, "RECORD_FILE_INVALID");
    return {
      key: ownData(item, "key", "RECORD_FILE_INVALID"),
      size: ownData(item, "size", "RECORD_FILE_INVALID"),
      checksum: ownData(item, "checksum", "RECORD_FILE_INVALID"),
    };
  }) : fail("RECORD_FILES_INVALID");
  ArraySort(files, (left, right) => StringLocaleCompare(left.key, right.key));
  const state = {
    id: StringConstructor(ownData(record, "id", "RECORD_ID_INVALID")),
    conceptRecordId: StringConstructor(ownData(record, "conceptrecid",
      "RECORD_CONCEPT_ID_INVALID")),
    doi: ownData(record, "doi", "RECORD_DOI_INVALID"),
    conceptDoi: ownData(record, "conceptdoi", "RECORD_CONCEPT_DOI_INVALID"),
    revision: ownData(record, "revision", "RECORD_REVISION_INVALID"),
    created: ownData(record, "created", "RECORD_CREATED_INVALID"),
    modified: ownData(record, "modified", "RECORD_MODIFIED_INVALID"),
    status: ownData(record, "status", "RECORD_STATUS_INVALID"),
    state: ownData(record, "state", "RECORD_STATE_INVALID"),
    submitted: ownData(record, "submitted", "RECORD_SUBMITTED_INVALID"),
    title: ownData(metadata, "title", "RECORD_TITLE_INVALID"),
    version: ownData(metadata, "version", "RECORD_VERSION_INVALID"),
    accessRight: ownData(metadata, "access_right", "RECORD_ACCESS_INVALID"),
    licenseId: ownData(license, "id", "RECORD_LICENSE_INVALID"),
    files,
  };
  const pin = STALE_CONSTRAINT_ZENODO_RECORD;
  if (state.id !== pin.recordId || state.conceptRecordId !== pin.conceptRecordId
    || state.doi !== pin.doi || state.conceptDoi !== pin.conceptDoi
    || state.revision !== pin.revision || state.created !== pin.created
    || state.modified !== pin.modified || state.status !== "published"
    || state.state !== "done" || state.submitted !== true
    || state.title !== pin.title || state.version !== pin.version
    || state.accessRight !== "open" || state.licenseId !== pin.licenseId) {
    fail("RECORD_PIN_MISMATCH");
  }
  const byName = new MapConstructor();
  for (let index = 0; index < files.length; index += 1) {
    MapSet(byName, files[index].key, files[index]);
  }
  const expectedEntries = ObjectEntries(EXPECTED_FILES);
  for (let index = 0; index < expectedEntries.length; index += 1) {
    const name = expectedEntries[index][0];
    const expected = expectedEntries[index][1];
    const file = MapGet(byName, name);
    if (!file || file.size !== expected.bytes || file.checksum !== `md5:${expected.md5}`) {
      fail("RECORD_FILE_PIN_MISMATCH", name);
    }
  }
  return state;
}

function parseChecksums(bytes) {
  if (bufferLength(bytes) !== EXPECTED_FILES.SHA256SUMS.bytes
    || md5(bytes) !== EXPECTED_FILES.SHA256SUMS.md5) fail("CHECKSUM_FILE_PIN_MISMATCH");
  const lines = StringSplit(StringTrimEnd(BufferToString(bytes, "utf8")), "\n");
  const result = {};
  for (let index = 0; index < lines.length; index += 1) {
    const match = RegExpExec(/^([a-f0-9]{64})  ([A-Za-z0-9._-]+)$/u, lines[index]);
    if (!match || ObjectHasOwn(result, match[2])) fail("CHECKSUM_FILE_FORMAT_INVALID");
    result[match[2]] = match[1];
  }
  if (ObjectKeys(result).length !== 3
    || result[STALE_CONSTRAINT_SOURCE_FILES.archive]
      !== EXPECTED_FILES[STALE_CONSTRAINT_SOURCE_FILES.archive].sha256) {
    fail("CHECKSUM_FILE_CONTENT_INVALID");
  }
  return result;
}

function findEndOfCentralDirectory(bytes) {
  const length = bufferLength(bytes);
  const minimum = MathMax(0, length - 65_557);
  for (let offset = length - 22; offset >= minimum; offset -= 1) {
    if (BufferReadUInt32LE(bytes, offset) === 0x06054b50) return offset;
  }
  fail("ZIP_EOCD_MISSING");
}

function safeArchivePath(name) {
  if (name.length < 1 || name.length > 1_024 || StringIncludes(name, "\u0000")
    || StringIncludes(name, "\\") || StringStartsWith(name, "/")
    || RegExpExec(/^[A-Za-z]:/u, name) || !StringStartsWith(name, ROOT_PREFIX)) {
    fail("ZIP_ENTRY_PATH_UNSAFE");
  }
  const components = StringSplit(name, "/");
  if (ArraySome(components, (component) => component === "" || component === "."
    || component === "..")) fail("ZIP_ENTRY_PATH_UNSAFE");
  return name;
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (let index = 0; index < bufferLength(bytes); index += 1) {
    value ^= bytes[index];
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function archiveEntryClass(name) {
  if (RegExpExec(CONFIRMATORY_PATH, name)) return "CONFIRMATORY_EPISODE";
  if (RegExpExec(PILOT_PATH, name)) return "LABELLED_PILOT_EPISODE";
  if (RegExpExec(/\.(?:zip|tar|gz|tgz)$/u, name)) {
    return "NESTED_ARCHIVE_OPAQUE_NOT_EXPANDED";
  }
  return "SUPPORTING_REPRODUCIBILITY_FILE";
}

function parseArchive(bytes, { materialize = false } = {}) {
  if (!BufferIsBuffer(bytes)
    || bufferLength(bytes) !== EXPECTED_FILES[STALE_CONSTRAINT_SOURCE_FILES.archive].bytes
    || bufferLength(bytes) > MAX_ARCHIVE_BYTES || md5(bytes)
      !== EXPECTED_FILES[STALE_CONSTRAINT_SOURCE_FILES.archive].md5
    || sha256(bytes) !== `sha256:${EXPECTED_FILES[STALE_CONSTRAINT_SOURCE_FILES.archive].sha256}`) {
    fail("ZIP_PIN_MISMATCH");
  }
  const eocd = findEndOfCentralDirectory(bytes);
  if (eocd + 22 !== bufferLength(bytes) || BufferReadUInt16LE(bytes, eocd + 4) !== 0
    || BufferReadUInt16LE(bytes, eocd + 6) !== 0
    || BufferReadUInt16LE(bytes, eocd + 8) !== BufferReadUInt16LE(bytes, eocd + 10)
    || BufferReadUInt16LE(bytes, eocd + 20) !== 0) {
    fail("ZIP_MULTIDISK_ZIP64_OR_TRAILING_DATA_REJECTED");
  }
  const entryCount = BufferReadUInt16LE(bytes, eocd + 10);
  const centralBytes = BufferReadUInt32LE(bytes, eocd + 12);
  const centralOffset = BufferReadUInt32LE(bytes, eocd + 16);
  if (entryCount < 1 || entryCount > MAX_ARCHIVE_ENTRIES
    || centralOffset + centralBytes !== eocd) fail("ZIP_CENTRAL_DIRECTORY_INVALID");
  let cursor = centralOffset;
  let totalCompressed = 0;
  let totalUncompressed = 0;
  let maximumEntryBytes = 0;
  const seen = new SetConstructor();
  const folded = new SetConstructor();
  const entries = [];
  const contentByName = materialize ? new MapConstructor() : null;
  let regularFileTypeEntries = 0;
  let unknownTypeEntries = 0;
  for (let ordinal = 0; ordinal < entryCount; ordinal += 1) {
    if (cursor + 46 > eocd || BufferReadUInt32LE(bytes, cursor) !== 0x02014b50) {
      fail("ZIP_CENTRAL_ENTRY_INVALID", ordinal);
    }
    const madeBy = BufferReadUInt16LE(bytes, cursor + 4);
    const flags = BufferReadUInt16LE(bytes, cursor + 8);
    const method = BufferReadUInt16LE(bytes, cursor + 10);
    const expectedCrc = BufferReadUInt32LE(bytes, cursor + 16);
    const compressedBytes = BufferReadUInt32LE(bytes, cursor + 20);
    const uncompressedBytes = BufferReadUInt32LE(bytes, cursor + 24);
    const nameLength = BufferReadUInt16LE(bytes, cursor + 28);
    const extraLength = BufferReadUInt16LE(bytes, cursor + 30);
    const commentLength = BufferReadUInt16LE(bytes, cursor + 32);
    const disk = BufferReadUInt16LE(bytes, cursor + 34);
    const externalAttributes = BufferReadUInt32LE(bytes, cursor + 38);
    const localOffset = BufferReadUInt32LE(bytes, cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + commentLength;
    if (end > eocd || disk !== 0 || (flags & 1) !== 0 || method !== 8
      || uncompressedBytes > MAX_ENTRY_BYTES || compressedBytes < 1
      || uncompressedBytes / compressedBytes > MAX_COMPRESSION_RATIO) {
      fail("ZIP_ENTRY_POLICY_REJECTED", ordinal);
    }
    const name = safeArchivePath(BufferToString(BufferSubarray(bytes, cursor + 46,
      cursor + 46 + nameLength), "utf8"));
    const unixMode = externalAttributes >>> 16;
    if ((madeBy >>> 8) === 3 && (unixMode & 0xf000) === 0xa000) {
      fail("ZIP_SYMLINK_REJECTED", name);
    }
    const fileType = unixMode & 0xf000;
    if ((madeBy >>> 8) === 3 && fileType === 0x8000) regularFileTypeEntries += 1;
    else if (fileType === 0) unknownTypeEntries += 1;
    else fail("ZIP_UNSUPPORTED_ENTRY_TYPE", name);
    const lower = StringToLocaleLowerCase(name, "en-US");
    if (SetHas(seen, name) || SetHas(folded, lower)) {
      fail("ZIP_DUPLICATE_ENTRY_REJECTED", name);
    }
    SetAdd(seen, name);
    SetAdd(folded, lower);
    if (localOffset + 30 > centralOffset
      || BufferReadUInt32LE(bytes, localOffset) !== 0x04034b50) {
      fail("ZIP_LOCAL_HEADER_INVALID", name);
    }
    const localFlags = BufferReadUInt16LE(bytes, localOffset + 6);
    const localMethod = BufferReadUInt16LE(bytes, localOffset + 8);
    const localNameLength = BufferReadUInt16LE(bytes, localOffset + 26);
    const localExtraLength = BufferReadUInt16LE(bytes, localOffset + 28);
    const localName = BufferToString(BufferSubarray(bytes, localOffset + 30,
      localOffset + 30 + localNameLength), "utf8");
    const contentOffset = localOffset + 30 + localNameLength + localExtraLength;
    const contentEnd = contentOffset + compressedBytes;
    if (localFlags !== flags || localMethod !== method || localName !== name
      || contentEnd > centralOffset) fail("ZIP_LOCAL_CENTRAL_MISMATCH", name);
    let content;
    try {
      content = inflateRawSync(BufferSubarray(bytes, contentOffset, contentEnd), {
        maxOutputLength: MAX_ENTRY_BYTES + 1,
      });
    } catch {
      fail("ZIP_DEFLATE_INVALID", name);
    }
    if (bufferLength(content) !== uncompressedBytes || crc32(content) !== expectedCrc) {
      fail("ZIP_ENTRY_INTEGRITY_MISMATCH", name);
    }
    const entry = {
      ordinal,
      path: name,
      entryClass: archiveEntryClass(name),
      compressionMethod: "DEFLATE",
      compressedBytes,
      uncompressedBytes,
      crc32: StringPadStart(NumberToString(expectedCrc, 16), 8, "0"),
      contentHash: sha256(content),
    };
    ArrayPush(entries, entry);
    if (materialize) MapSet(contentByName, name, content);
    totalCompressed += compressedBytes;
    totalUncompressed += uncompressedBytes;
    maximumEntryBytes = MathMax(maximumEntryBytes, uncompressedBytes);
    cursor = end;
  }
  if (cursor !== eocd || totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
    fail("ZIP_CENTRAL_DIRECTORY_OR_TOTAL_BOUND_INVALID");
  }
  const classSet = new SetConstructor();
  for (let index = 0; index < entries.length; index += 1) {
    SetAdd(classSet, entries[index].entryClass);
  }
  const classes = setValuesSafe(classSet);
  ArraySort(classes);
  const countPairs = new ArrayConstructor();
  for (let classIndex = 0; classIndex < classes.length; classIndex += 1) {
    let count = 0;
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      if (entries[entryIndex].entryClass === classes[classIndex]) count += 1;
    }
    ArrayPush(countPairs, [classes[classIndex], count]);
  }
  const counts = objectFromPairsSafe(countPairs);
  if (entryCount !== EXPECTED_ARCHIVE.entries
    || totalCompressed !== EXPECTED_ARCHIVE.compressedBytes
    || totalUncompressed !== EXPECTED_ARCHIVE.uncompressedBytes
    || maximumEntryBytes !== EXPECTED_ARCHIVE.maximumEntryBytes
    || counts.CONFIRMATORY_EPISODE !== EXPECTED_ARCHIVE.confirmatoryEpisodes
    || counts.LABELLED_PILOT_EPISODE !== EXPECTED_ARCHIVE.pilotEpisodes) {
    fail("ZIP_EXPECTED_LAYOUT_MISMATCH");
  }
  const body = {
    schema: STALE_CONSTRAINT_ARCHIVE_INDEX_SCHEMA,
    archive: {
      name: STALE_CONSTRAINT_SOURCE_FILES.archive,
      bytes: bufferLength(bytes),
      md5: md5(bytes),
      sha256: sha256(bytes),
    },
    policy: {
      pathTraversalRejected: true,
      absolutePathsRejected: true,
      caseFoldedDuplicatesRejected: true,
      symlinksRejected: true,
      encryptedEntriesRejected: true,
      zip64AndMultidiskRejected: true,
      allowedCompressionMethods: ["DEFLATE"],
      nestedArchivesExpanded: false,
      extractionMode: "BOUNDED_IN_MEMORY_SOURCE_REPLAY_NO_FILES_WRITTEN",
      maximumEntries: MAX_ARCHIVE_ENTRIES,
      maximumEntryBytes: MAX_ENTRY_BYTES,
      maximumTotalUncompressedBytes: MAX_TOTAL_UNCOMPRESSED_BYTES,
      maximumCompressionRatio: MAX_COMPRESSION_RATIO,
      unknownEntryTypesAcceptedOnlyBecauseReplayIsInMemory: true,
    },
    summary: {
      entries: entryCount,
      compressedBytes: totalCompressed,
      uncompressedBytes: totalUncompressed,
      maximumEntryBytes,
      encryptedEntries: 0,
      symlinkEntries: 0,
      unsafePathEntries: 0,
      duplicateEntries: 0,
      regularFileTypeEntries,
      unknownTypeEntries,
      unsupportedTypeEntries: 0,
      entryClassCounts: counts,
    },
    entries,
  };
  const archiveIndex = deepFreeze({ ...body,
    archiveIndexHash: digest(STALE_CONSTRAINT_ARCHIVE_INDEX_SCHEMA, body) });
  return { archiveIndex, contentByName };
}

function requireString(value, code) {
  if (typeof value !== "string" || value.length < 1) fail(code);
  return value;
}

function requireBoolean(value, code) {
  if (typeof value !== "boolean") fail(code);
  return value;
}

function structuralRecord(episode) {
  const shape = requirePlainObject(ownData(episode, "target_shape",
    "EPISODE_TARGET_SHAPE_INVALID"), "EPISODE_TARGET_SHAPE_INVALID");
  const result = {
    form: requireString(ownData(episode, "form", "EPISODE_FORM_INVALID"),
      "EPISODE_FORM_INVALID"),
    policy: requireString(ownData(episode, "policy", "EPISODE_POLICY_INVALID"),
      "EPISODE_POLICY_INVALID"),
    model: requireString(ownData(episode, "model", "EPISODE_MODEL_INVALID"),
      "EPISODE_MODEL_INVALID"),
    family: requireString(ownData(episode, "family", "EPISODE_FAMILY_INVALID"),
      "EPISODE_FAMILY_INVALID"),
    kind: requireString(ownData(episode, "kind", "EPISODE_KIND_INVALID"),
      "EPISODE_KIND_INVALID"),
    worldKey: requireString(ownData(episode, "world_key",
      "EPISODE_WORLD_KEY_INVALID"), "EPISODE_WORLD_KEY_INVALID"),
    budget: ownData(episode, "budget", "EPISODE_BUDGET_INVALID"),
    targetChars: ownData(shape, "chars", "EPISODE_TARGET_SHAPE_INVALID"),
    targetNumerics: ownData(shape, "numerics", "EPISODE_TARGET_SHAPE_INVALID"),
    targetClauses: ownData(shape, "clauses", "EPISODE_TARGET_SHAPE_INVALID"),
  };
  for (let index = 0; index < NUMERIC_FEATURES.length; index += 1) {
    const key = NUMERIC_FEATURES[index];
    if (!NumberIsSafeInteger(result[key]) || result[key] < 0) {
      fail("EPISODE_STRUCTURAL_NUMBER_INVALID", key);
    }
  }
  return result;
}

/**
 * The only candidate-model inputs.  This function deliberately does not read
 * raw prompts/responses, parsed answers, verification ids/records, usage,
 * retries, world truth, V/R/Y or any deterministic scored field.
 */
export function staleConstraintPreOutcomeFeatures(episode) {
  requirePlainObject(episode, "EPISODE_INVALID");
  return deepFreeze(structuralRecord(episode));
}

function countRawBytePattern(bytes, pattern) {
  const text = BufferToString(bytes, "latin1");
  let count = 0;
  for (;;) {
    const match = RegExpExec(pattern, text);
    if (!match) return count;
    count += 1;
  }
}

function scanEpisodeBytes(bytes, counters, audit) {
  counters.episodeFilesScanned += 1;
  counters.episodeBytesScanned += bufferLength(bytes);
  if (audit) {
    counters.auditEpisodeFilesScanned += 1;
    counters.auditEpisodeBytesScanned += bufferLength(bytes);
  }
  counters.highConfidenceSecretMatches += countRawBytePattern(bytes,
    /(?:sk-(?:ant-)?[A-Za-z0-9_-]{20,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/g);
  counters.emailAddressCandidates += countRawBytePattern(bytes,
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi);
  counters.ipv4AddressCandidates += countRawBytePattern(bytes,
    /\b(?:\d{1,3}\.){3}\d{1,3}\b/g);
}

function episodeFileRun(pathname) {
  if (StringIncludes(pathname, "/corrected_heldout/runs/heldout-corrected/")) {
    return "heldout-corrected";
  }
  const match = RegExpExec(/\/runs\/(primary|replication|heldout)\//u, pathname);
  return match?.[1] ?? fail("EPISODE_PATH_RUN_INVALID", pathname);
}

function inventoryEpisode(entry) {
  const pathname = entry.path;
  const pathMatch = RegExpExec(CONFIRMATORY_PATH, pathname);
  if (!pathMatch) return null;
  const basename = RegExpExec(EPISODE_BASENAME, pathMatch[1]);
  if (!basename) fail("EPISODE_FILENAME_INVALID", pathname);
  const run = NumberConstructor(basename[5]);
  if (!NumberIsSafeInteger(run) || run < 0 || run > 24) {
    fail("EPISODE_FILENAME_RUN_INVALID", pathname);
  }
  const pathFields = {
    form: basename[1],
    world: basename[2],
    policy: basename[3],
    model: basename[4],
    run,
    kind: episodeFileRun(pathname),
  };
  const groupRoot = digest(
    "outsider/stale-constraint/conservative-cross-run-block-root/v1", {
      form: pathFields.form,
      model: pathFields.model,
      run: pathFields.run,
    });
  const nativeIdentity = `${pathFields.kind}\0${pathFields.form}\0${
    pathFields.world}\0${pathFields.policy}\0${pathFields.model}\0${pathFields.run}`;
  const episodeRoot = digest("outsider/stale-constraint/episode-root/v1", {
    recordDoi: STALE_CONSTRAINT_ZENODO_RECORD.doi,
    pathnameHash: sha256(BufferFrom(pathname, "utf8")),
    nativeIdentityHash: sha256(BufferFrom(nativeIdentity, "utf8")),
    contentHash: entry.contentHash,
  });
  return { pathname, pathFields, groupRoot, episodeRoot,
    identity: nativeIdentity, features: null, label: null };
}

function replayEpisodes(archiveIndex, contentByName) {
  const rows = [];
  const identity = new SetConstructor();
  const countsByRun = {};
  const valueSets = objectFromPairsSafe(arrayMapSafe([
    "version", "kind", "worldKey", "form", "world", "policy", "family", "model",
  ], (key) => [key, new SetConstructor()]));
  const sensitive = {
    method: "LOCAL_RAW_EPISODE_BYTE_PATTERN_SCAN_NO_JSON_PARSE_FOR_AUDIT",
    episodeFilesScanned: 0,
    episodeBytesScanned: 0,
    auditEpisodeFilesScanned: 0,
    auditEpisodeBytesScanned: 0,
    highConfidenceSecretMatches: 0,
    emailAddressCandidates: 0,
    ipv4AddressCandidates: 0,
  };
  let pilotEpisodes = 0;
  let inspectedKeptCalls = 0;
  let inspectedProviderUsageRecords = 0;
  let inspectedProviderCallAttempts = 0;
  let inspectedRetryRecords = 0;
  let positiveLabels = 0;
  let staleConsistentApplicable = 0;
  let staleConsistentTrue = 0;
  for (let index = 0; index < archiveIndex.entries.length; index += 1) {
    const entry = archiveIndex.entries[index];
    const pathname = entry.path;
    if (RegExpExec(PILOT_PATH, pathname)) {
      pilotEpisodes += 1;
      continue;
    }
    const row = inventoryEpisode(entry);
    if (!row) continue;
    if (SetHas(identity, row.identity)) fail("EPISODE_DUPLICATE_IDENTITY", row.identity);
    SetAdd(identity, row.identity);
    ArrayPush(rows, row);
    countsByRun[row.pathFields.kind] = (countsByRun[row.pathFields.kind] ?? 0) + 1;
  }
  ArraySort(rows, (left, right) => StringLocaleCompare(left.identity, right.identity));
  if (rows.length !== EXPECTED_ARCHIVE.confirmatoryEpisodes
    || pilotEpisodes !== EXPECTED_ARCHIVE.pilotEpisodes
    || SetSize(identity) !== EXPECTED_ARCHIVE.confirmatoryEpisodes) {
    fail("EPISODE_REPLAY_EXPECTATION_FAILED");
  }
  /* This is the hard temporal boundary: every group root and both split seeds
   * are derived only from the ZIP inventory path plus content hash. No episode
   * JSON has been parsed yet. */
  const partition = splitGroups(rows);
  if (ArraySome(partition.audit, (row) => row.label !== null)) {
    fail("AUDIT_LABEL_TOUCHED_BEFORE_INSPECTION_BOUNDARY");
  }
  const auditRoots = new SetConstructor();
  for (let index = 0; index < partition.audit.length; index += 1) {
    SetAdd(auditRoots, partition.audit[index].groupRoot);
  }
  for (let index = 0; index < rows.length; index += 1) {
    const bytes = MapGet(contentByName, rows[index].pathname);
    if (!BufferIsBuffer(bytes)) fail("EPISODE_BYTES_MISSING", rows[index].pathname);
    scanEpisodeBytes(bytes, sensitive, SetHas(auditRoots, rows[index].groupRoot));
  }
  const inspectedRows = arrayConcatSafe(partition.train, partition.holdout);
  for (let index = 0; index < inspectedRows.length; index += 1) {
    const row = inspectedRows[index];
    const bytes = MapGet(contentByName, row.pathname);
    const episode = parseJson(bytes, "EPISODE_JSON_INVALID");
    const form = ownData(episode, "form", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const world = ownData(episode, "world", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const policy = ownData(episode, "policy", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const model = ownData(episode, "model", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const run = ownData(episode, "run", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const kind = ownData(episode, "kind", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const retries = ownData(episode, "retries", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const usage = ownData(episode, "usage", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const attemptsT1 = ownData(episode, "attempts_t1",
      "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const attemptsT2 = ownData(episode, "attempts_t2",
      "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const rawResponseT1 = ownData(episode, "raw_response_t1",
      "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const rawResponseT2 = ownData(episode, "raw_response_t2",
      "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const answerT1 = ownData(episode, "answer_t1", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    const answerT2 = ownData(episode, "answer_t2", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH");
    if (form !== row.pathFields.form || world !== row.pathFields.world
      || policy !== row.pathFields.policy || model !== row.pathFields.model
      || run !== row.pathFields.run || kind !== row.pathFields.kind
      || !NumberIsSafeInteger(run) || run < 0 || run > 24
      || ownData(episode, "budget", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH") !== 2
      || ownData(episode, "validation", "EPISODE_SCHEMA_OR_FILENAME_MISMATCH")
        !== "schema-valid"
      || !ArrayIsArray(retries) || !ArrayIsArray(usage)
      || !NumberIsSafeInteger(attemptsT1) || !NumberIsSafeInteger(attemptsT2)
      || typeof rawResponseT1 !== "string" || rawResponseT1.length < 1
      || typeof rawResponseT2 !== "string" || rawResponseT2.length < 1
      || !answerT1 || typeof answerT1 !== "object"
      || !answerT2 || typeof answerT2 !== "object") {
      fail("EPISODE_SCHEMA_OR_FILENAME_MISMATCH", row.pathname);
    }
    requirePlainObject(answerT1, "EPISODE_ANSWER_INVALID");
    requirePlainObject(answerT2, "EPISODE_ANSWER_INVALID");
    row.features = staleConstraintPreOutcomeFeatures(episode);
    const scored = requirePlainObject(ownData(episode, "scored", "EPISODE_SCORE_INVALID"),
      "EPISODE_SCORE_INVALID");
    const authoritativeConsistent = requireBoolean(ownData(scored,
      "authoritative_consistent", "EPISODE_LABEL_INVALID"),
      "EPISODE_LABEL_INVALID");
    const staleConsistent = ownData(scored, "stale_consistent", "EPISODE_SCORE_INVALID");
    if (staleConsistent !== null && typeof staleConsistent !== "boolean") {
      fail("EPISODE_SCORE_INVALID");
    }
    if (typeof staleConsistent === "boolean") {
      staleConsistentApplicable += 1;
      if (staleConsistent) staleConsistentTrue += 1;
    }
    /* Acquisition/review priority is the complement of the study's
     * deterministic operational Y.  This is a source-native label only and is
     * never represented as an independently observed real-world outcome. */
    row.label = authoritativeConsistent ? 0 : 1;
    positiveLabels += row.label;
    inspectedKeptCalls += 2;
    inspectedProviderUsageRecords += usage.length;
    inspectedProviderCallAttempts += attemptsT1 + attemptsT2;
    inspectedRetryRecords += retries.length;
    SetAdd(valueSets.version, ownData(episode, "version", "EPISODE_VERSION_INVALID"));
    SetAdd(valueSets.kind, kind);
    SetAdd(valueSets.worldKey, ownData(episode, "world_key",
      "EPISODE_WORLD_KEY_INVALID"));
    SetAdd(valueSets.form, form);
    SetAdd(valueSets.world, world);
    SetAdd(valueSets.policy, policy);
    SetAdd(valueSets.family, ownData(episode, "family", "EPISODE_FAMILY_INVALID"));
    SetAdd(valueSets.model, model);
  }
  if (ArraySome(partition.audit, (row) => row.label !== null || row.features !== null)
    || ArraySome(inspectedRows, (row) => row.label !== 0 && row.label !== 1)) {
    fail("AUDIT_OR_INSPECTED_LABEL_STATE_INVALID");
  }
  if (sensitive.episodeFilesScanned !== EXPECTED_ARCHIVE.confirmatoryEpisodes
    || sensitive.auditEpisodeFilesScanned !== partition.audit.length
    || sensitive.highConfidenceSecretMatches !== 0) fail("EPISODE_PRIVACY_SCAN_FAILED");
  const groups = new MapConstructor();
  for (let index = 0; index < rows.length; index += 1) {
    const bucket = MapGet(groups, rows[index].groupRoot) ?? [];
    ArrayPush(bucket, rows[index]);
    MapSet(groups, rows[index].groupRoot, bucket);
  }
  const values = {};
  const valueEntries = ObjectEntries(valueSets);
  for (let index = 0; index < valueEntries.length; index += 1) {
    const key = valueEntries[index][0];
    const collected = setValuesSafe(valueEntries[index][1]);
    ArraySort(collected);
    values[key] = collected;
  }
  return {
    rows,
    groups,
    partition,
    replay: {
      confirmatoryEpisodes: rows.length,
      archiveEpisodeBytesAndCrcReplayed: rows.length,
      schemaInspectedEpisodes: inspectedRows.length,
      opaqueAuditByteCommitments: partition.audit.length,
      labelledPilotEpisodesNotUsed: pilotEpisodes,
      schemaInspectedKeptTwoPhaseCalls: inspectedKeptCalls,
      schemaInspectedProviderUsageRecords: inspectedProviderUsageRecords,
      schemaInspectedProviderCallAttempts: inspectedProviderCallAttempts,
      schemaInspectedRetryRecords: inspectedRetryRecords,
      datasetWidePinnedAggregateCountsNotRecomputedFromOpaqueAudit: {
        keptTwoPhaseCalls: EXPECTED_ARCHIVE.keptCalls,
        providerUsageRecords: EXPECTED_ARCHIVE.providerUsageRecords,
        providerCallAttempts: EXPECTED_ARCHIVE.providerCallAttempts,
        retryRecords: EXPECTED_ARCHIVE.retryRecords,
        provenance: "PINNED_EXPECTATION_ONLY_AUDIT_EPISODES_NOT_JSON_PARSED_IN_THIS_SUCCESSOR",
      },
      deterministicLabelsInspectedEpisodes: inspectedRows.length,
      deterministicReviewTargetLabelsInspected: positiveLabels,
      otherDeterministicLabelsInspected: inspectedRows.length - positiveLabels,
      staleConsistentApplicableInspectedEpisodes: staleConsistentApplicable,
      deterministicStaleConsistentTrueInInspectedPartitions: staleConsistentTrue,
      outcomeBlindAuditEpisodes: partition.audit.length,
      auditJsonParses: 0,
      auditScoreContainerAccesses: 0,
      auditScoreOwnKeyEnumerations: 0,
      auditScorePropertyDescriptorReads: 0,
      auditScoreValueReads: 0,
      auditMetricsComputed: 0,
      outcomeBlindAuditScorePropertiesAccessedByAdapter: 0,
      countsByRun,
      inspectedPartitionValues: values,
      episodeSetHash: digest("outsider/stale-constraint/episode-set/v1",
        ArraySort(arrayMapSafe(rows, (row) => row.episodeRoot))),
      conservativeCrossRunBlockGroups: MapSize(groups),
      groupSetHash: digest("outsider/stale-constraint/group-set/v1",
        ArraySort(mapKeysSafe(groups))),
    },
    sensitive,
  };
}

function reviewArchiveDocumentation(contentByName) {
  const readmePath = `${ROOT_PREFIX}README.md`;
  const licensePath = `${ROOT_PREFIX}LICENSE`;
  const readmeBytes = MapGet(contentByName, readmePath);
  const licenseBytes = MapGet(contentByName, licensePath);
  if (!BufferIsBuffer(readmeBytes) || !BufferIsBuffer(licenseBytes)
    || bufferLength(readmeBytes) < 1 || bufferLength(readmeBytes) > 256 * 1024
    || bufferLength(licenseBytes) < 1 || bufferLength(licenseBytes) > 64 * 1024) {
    fail("ARCHIVE_RIGHTS_DOCUMENTATION_MISSING_OR_OVERSIZE");
  }
  const readme = BufferToString(readmeBytes, "utf8");
  const license = BufferToString(licenseBytes, "utf8");
  if (!StringIncludes(readme, "Text and data: CC BY 4.0. Code: MIT")
    || !StringIncludes(readme, "all 5,400 confirmatory episode files")
    || !StringIncludes(readme, "they contain no credentials or account identifiers")
    || !StringStartsWith(license, "MIT License\n")) {
    fail("ARCHIVE_RIGHTS_DOCUMENTATION_PIN_MISMATCH");
  }
  return {
    README: { path: readmePath, bytes: bufferLength(readmeBytes),
      contentHash: sha256(readmeBytes) },
    codeLicense: { path: licensePath, bytes: bufferLength(licenseBytes),
      licenseId: "MIT", contentHash: sha256(licenseBytes) },
    textAndDataLicenseClaim: "CC BY 4.0",
    confirmatoryEpisodeCountClaim: 5_400,
    noCredentialsOrAccountIdentifiersClaimPresent: true,
  };
}

function hashRank(seed, root, domain) {
  return digest(domain, { seed, root });
}

function splitGroups(rows) {
  const groups = new MapConstructor();
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const bucket = MapGet(groups, row.groupRoot) ?? [];
    ArrayPush(bucket, row);
    MapSet(groups, row.groupRoot, bucket);
  }
  const allRoots = mapKeysSafe(groups);
  ArraySort(allRoots);
  /* First define a label-blind holdout pool.  Only then use an independent
   * seed to reserve a subset of that pool for an audit whose labels this run
   * never reads. */
  const holdoutPoolCount = MathMax(2,
    MathFloor(allRoots.length * HOLDOUT_POOL_FRACTION));
  const holdoutRanks = arrayMapSafe(allRoots, (root) => ({ root,
    rank: hashRank(SPLIT_SEED, root,
      "outsider/stale-constraint/split-rank/v1") }));
  ArraySort(holdoutRanks, (left, right) => StringLocaleCompare(left.rank, right.rank));
  const holdoutPoolRoots = setFromArraySafe(arrayMapSafe(
    arraySliceSafe(holdoutRanks, 0, holdoutPoolCount), (item) => item.root));
  const auditCount = MathMax(1, MathFloor(SetSize(holdoutPoolRoots)
    * AUDIT_RESERVE_FRACTION_OF_HOLDOUT));
  const auditRanks = arrayMapSafe(setValuesSafe(holdoutPoolRoots), (root) => ({ root,
    rank: hashRank(AUDIT_SEED, root,
      "outsider/stale-constraint/outcome-blind-audit-rank/v1") }));
  ArraySort(auditRanks, (left, right) => StringLocaleCompare(left.rank, right.rank));
  const auditRoots = setFromArraySafe(arrayMapSafe(
    arraySliceSafe(auditRanks, 0, auditCount), (item) => item.root));
  const holdoutRoots = setFromArraySafe(arrayFilterSafe(
    setValuesSafe(holdoutPoolRoots), (root) => !SetHas(auditRoots, root)));
  const train = [];
  const holdout = [];
  const audit = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (SetHas(auditRoots, row.groupRoot)) ArrayPush(audit, row);
    else if (SetHas(holdoutRoots, row.groupRoot)) ArrayPush(holdout, row);
    else ArrayPush(train, row);
  }
  const trainRoots = setFromArraySafe(arrayMapSafe(train, (row) => row.groupRoot));
  let overlaps = 0;
  SetForEach(trainRoots, (root) => {
    if (SetHas(holdoutRoots, root) || SetHas(auditRoots, root)) overlaps += 1;
  });
  SetForEach(holdoutRoots, (root) => {
    if (SetHas(auditRoots, root)) overlaps += 1;
  });
  if (overlaps !== 0) fail("GROUP_SPLIT_OVERLAP");
  return {
    train, holdout, audit,
    summary: {
      method: "SHA256_RANKED_CONSERVATIVE_CROSS_RUN_BLOCK_SPLIT",
      groupingBasis: "FROZEN_DESIGN_BLOCK_(FORM_MODEL_RUN)_MERGED_ACROSS_PRIMARY_REPLICATION_HELDOUT_CORRECTED_HELDOUT",
      groupingEvidence: {
        sourcePath: `${ROOT_PREFIX}next_studies/stale_constraints/STALE_CONSTRAINT_DESIGN.md`,
        frozenDefinition: "A block is (F, model, run); primary replication uses fresh seeds and fresh wording families.",
        conservativeMerge: "kind, world_key, family, block_seed and cell_seed are excluded from the root so related run versions cannot cross partitions.",
        pathFieldMapping: "filename=form__world__policy__model__run.json; group root uses filename form, model and run only",
        episodeCommitmentInputs: "ZIP inventory path hash, native path identity hash and decompressed entry content hash",
      },
      selectionOrder: "ZIP_INVENTORY_PATH_AND_CONTENT_HASH_THEN_GROUP_SPLIT_THEN_TRAIN_EVAL_JSON_PARSE",
      episodeJsonParsesBeforeAuditRootsFrozen: 0,
      splitSeedHash: sha256(BufferFrom(SPLIT_SEED, "utf8")),
      auditSeedHash: sha256(BufferFrom(AUDIT_SEED, "utf8")),
      totalGroups: allRoots.length,
      holdoutPoolFraction: HOLDOUT_POOL_FRACTION,
      holdoutPoolGroups: SetSize(holdoutPoolRoots),
      auditReserveFractionOfHoldoutPool: AUDIT_RESERVE_FRACTION_OF_HOLDOUT,
      trainGroups: SetSize(trainRoots),
      holdoutGroups: SetSize(holdoutRoots),
      auditReserveGroups: SetSize(auditRoots),
      trainEpisodes: train.length,
      holdoutEpisodes: holdout.length,
      auditReserveEpisodes: audit.length,
      groupOverlap: overlaps,
      trainGroupSetHash: digest("outsider/stale-constraint/train-group-set/v1",
        ArraySort(setValuesSafe(trainRoots))),
      holdoutGroupSetHash: digest("outsider/stale-constraint/holdout-group-set/v1",
        ArraySort(setValuesSafe(holdoutRoots))),
      auditReserve: {
        selectedBeforeLabelInspection: true,
        selectedFromHoldoutPool: true,
        labelsUsedForSelection: false,
        labelsInspectedForThisReport: false,
        metricsComputed: false,
        jsonParses: 0,
        scoreContainerAccesses: 0,
        scoreOwnKeyEnumerations: 0,
        scorePropertyDescriptorReads: 0,
        scoreValueReads: 0,
        groupSetHash: digest("outsider/stale-constraint/audit-group-set/v1",
          ArraySort(setValuesSafe(auditRoots))),
        episodeSetHash: digest("outsider/stale-constraint/audit-episode-set/v1",
          ArraySort(arrayMapSafe(audit, (row) => row.episodeRoot))),
      },
    },
  };
}

function fitEncoder(rows) {
  const levels = {};
  for (let featureIndex = 0; featureIndex < CATEGORICAL_FEATURES.length;
    featureIndex += 1) {
    const key = CATEGORICAL_FEATURES[featureIndex];
    const collected = new SetConstructor();
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      SetAdd(collected, rows[rowIndex].features[key]);
    }
    levels[key] = setValuesSafe(collected);
    ArraySort(levels[key]);
  }
  const featureNames = arrayCopy(NUMERIC_FEATURES);
  for (let featureIndex = 0; featureIndex < CATEGORICAL_FEATURES.length;
    featureIndex += 1) {
    const key = CATEGORICAL_FEATURES[featureIndex];
    for (let levelIndex = 0; levelIndex < levels[key].length; levelIndex += 1) {
      ArrayPush(featureNames, `${key}=${levels[key][levelIndex]}`);
    }
  }
  return { levels, featureNames };
}

function vector(features, encoder) {
  const values = arrayMapSafe(NUMERIC_FEATURES, (key) => features[key]);
  for (let featureIndex = 0; featureIndex < CATEGORICAL_FEATURES.length;
    featureIndex += 1) {
    const key = CATEGORICAL_FEATURES[featureIndex];
    const featureLevels = encoder.levels[key];
    for (let levelIndex = 0; levelIndex < featureLevels.length; levelIndex += 1) {
      ArrayPush(values, features[key] === featureLevels[levelIndex] ? 1 : 0);
    }
  }
  return values;
}

function standardizer(matrix) {
  const mean = new ArrayConstructor(matrix[0].length);
  const std = new ArrayConstructor(matrix[0].length);
  ArrayFill(mean, 0);
  ArrayFill(std, 0);
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex];
    for (let index = 0; index < values.length; index += 1) mean[index] += values[index];
  }
  for (let index = 0; index < mean.length; index += 1) mean[index] /= matrix.length;
  for (let rowIndex = 0; rowIndex < matrix.length; rowIndex += 1) {
    const values = matrix[rowIndex];
    for (let index = 0; index < values.length; index += 1) {
      std[index] += (values[index] - mean[index]) ** 2;
    }
  }
  for (let index = 0; index < std.length; index += 1) {
    std[index] = MathSqrt(std[index] / matrix.length) || 1;
  }
  return { mean, std };
}

function normalize(values, fitted) {
  return arrayMapSafe(values,
    (value, index) => (value - fitted.mean[index]) / fitted.std[index]);
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + MathExp(-value));
  const exponential = MathExp(value);
  return exponential / (1 + exponential);
}

function fitCandidate(rows) {
  const encoder = fitEncoder(rows);
  const raw = arrayMapSafe(rows, (row) => vector(row.features, encoder));
  const fitted = standardizer(raw);
  const matrix = arrayMapSafe(raw, (values) => normalize(values, fitted));
  const weights = new ArrayConstructor(encoder.featureNames.length);
  ArrayFill(weights, 0);
  const positives = ArrayReduce(rows, (sum, row) => sum + row.label, 0);
  let bias = MathLog((positives + 0.5) / (rows.length - positives + 0.5));
  for (let epoch = 0; epoch < TRAINING.epochs; epoch += 1) {
    const gradient = new ArrayConstructor(weights.length);
    ArrayFill(gradient, 0);
    let biasGradient = 0;
    for (let index = 0; index < rows.length; index += 1) {
      let linear = bias;
      ArrayForEach(matrix[index], (value, dimension) => {
        linear += weights[dimension] * value;
      });
      const residual = sigmoid(linear) - rows[index].label;
      ArrayForEach(matrix[index], (value, dimension) => {
        gradient[dimension] += residual * value;
      });
      biasGradient += residual;
    }
    const step = TRAINING.learningRate / (1 + TRAINING.learningRateDecay * epoch);
    ArrayForEach(weights, (weight, dimension) => {
      weights[dimension] -= step * (gradient[dimension] / rows.length
        + TRAINING.l2 * weight);
    });
    bias -= step * biasGradient / rows.length;
  }
  const committedBody = {
    algorithm: TRAINING.algorithm,
    parameters: TRAINING,
    featurePolicy: {
      preOutcomeStructuralOnly: true,
      encoderFittedOnTrainingOnly: true,
      normalizationFittedOnTrainingOnly: true,
      holdoutParticipatedInFit: false,
      auditParticipatedInFit: false,
      allowedCategorical: CATEGORICAL_FEATURES,
      allowedNumeric: NUMERIC_FEATURES,
      explicitlyForbidden: [
        "raw prompts", "raw responses", "parsed answers", "scored", "Y", "V",
        "R", "returned records", "post-verification content", "token usage",
        "attempts", "retries", "world truth",
      ],
    },
    encoder,
    standardizer: { fittedOnTrainingOnly: true,
      mean: arrayMapSafe(fitted.mean, round), std: arrayMapSafe(fitted.std, round) },
    bias: round(bias),
    weights: arrayMapSafe(weights, round),
  };
  return { raw: { encoder, fitted, weights, bias },
    committed: { ...committedBody,
      modelHash: digest("outsider/stale-constraint/research-model/v1", committedBody) } };
}

function candidateScore(model, row) {
  const values = normalize(vector(row.features, model.encoder), model.fitted);
  let linear = model.bias;
  ArrayForEach(values, (value, index) => { linear += value * model.weights[index]; });
  return sigmoid(linear);
}

function auc(scores, labels) {
  const positives = arrayFilterSafe(labels, (label) => label === 1).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return null;
  const ranked = arrayMapSafe(scores,
    (score, index) => ({ score, label: labels[index] }));
  ArraySort(ranked, (left, right) => left.score - right.score);
  let cursor = 0;
  let rank = 1;
  let positiveRankSum = 0;
  while (cursor < ranked.length) {
    let end = cursor + 1;
    while (end < ranked.length && ranked[end].score === ranked[cursor].score) end += 1;
    const averageRank = (rank + rank + end - cursor - 1) / 2;
    for (let index = cursor; index < end; index += 1) {
      if (ranked[index].label === 1) positiveRankSum += averageRank;
    }
    rank += end - cursor;
    cursor = end;
  }
  return (positiveRankSum - positives * (positives + 1) / 2)
    / (positives * negatives);
}

function metrics(rows, scores) {
  const labels = arrayMapSafe(rows, (row) => row.label);
  const confusion = { truePositive: 0, falsePositive: 0,
    trueNegative: 0, falseNegative: 0 };
  ArrayForEach(scores, (score, index) => {
    const prediction = score >= TRAINING.threshold ? 1 : 0;
    const label = labels[index];
    if (label === 1 && prediction === 1) confusion.truePositive += 1;
    else if (label === 0 && prediction === 1) confusion.falsePositive += 1;
    else if (label === 0 && prediction === 0) confusion.trueNegative += 1;
    else confusion.falseNegative += 1;
  });
  const sensitivity = confusion.truePositive
    / (confusion.truePositive + confusion.falseNegative);
  const specificity = confusion.trueNegative
    / (confusion.trueNegative + confusion.falsePositive);
  return {
    auc: round(auc(scores, labels)),
    brier: round(ArrayReduce(scores, (sum, score, index) =>
      sum + (score - labels[index]) ** 2, 0) / scores.length),
    balancedAccuracy: round((sensitivity + specificity) / 2),
    prevalence: round(ArrayReduce(labels, (sum, label) => sum + label, 0)
      / labels.length),
    threshold: TRAINING.threshold,
    confusion,
  };
}

function fixedBudgetQueue(rows, scores, domain) {
  const groups = new MapConstructor();
  ArrayForEach(rows, (row, index) => {
    const bucket = MapGet(groups, row.groupRoot) ?? [];
    ArrayPush(bucket, { row, score: scores[index] });
    MapSet(groups, row.groupRoot, bucket);
  });
  const budgetGroups = MathMax(1, MathFloor(MapSize(groups) * PRIORITY_GROUP_FRACTION));
  const ranked = new ArrayConstructor();
  MapForEach(groups, (items, root) => {
    ArrayPush(ranked, {
      root,
      items,
      meanScore: ArrayReduce(items, (sum, item) => sum + item.score, 0) / items.length,
      tie: digest(domain, root),
    });
  });
  ArraySort(ranked, (left, right) => right.meanScore - left.meanScore
    || StringLocaleCompare(left.tie, right.tie));
  const selected = arraySliceSafe(ranked, 0, budgetGroups);
  const selectedRows = new ArrayConstructor();
  for (let groupIndex = 0; groupIndex < selected.length; groupIndex += 1) {
    const items = selected[groupIndex].items;
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      ArrayPush(selectedRows, items[itemIndex].row);
    }
  }
  const positives = ArrayReduce(selectedRows, (sum, row) => sum + row.label, 0);
  return {
    budgetFraction: PRIORITY_GROUP_FRACTION,
    budgetGroups,
    selectedGroups: selected.length,
    selectedEpisodes: selectedRows.length,
    deterministicTargetYield: positives,
    precision: round(positives / selectedRows.length),
    groupSetHash: digest("outsider/stale-constraint/priority-group-set/v1",
      ArraySort(arrayMapSafe(selected, (group) => group.root))),
    episodeSetHash: digest("outsider/stale-constraint/priority-episode-set/v1",
      ArraySort(arrayMapSafe(selectedRows, (row) => row.episodeRoot))),
    rankedGroups: arrayMapSafe(selected, (group, index) => ({
      rank: index + 1,
      groupRoot: group.root,
      meanScore: round(group.meanScore),
      episodeSetHash: digest("outsider/stale-constraint/priority-group-episodes/v1",
        ArraySort(arrayMapSafe(group.items, (item) => item.row.episodeRoot))),
    })),
  };
}

function trainResearchRanker(rows, split) {
  if (!split || !ArrayIsArray(split.train) || !ArrayIsArray(split.holdout)
    || !ArrayIsArray(split.audit) || ArraySome(split.train, (row) => row.label === null)
    || ArraySome(split.holdout, (row) => row.label === null)
    || ArraySome(split.audit, (row) => row.label !== null || row.features !== null)
    || split.train.length + split.holdout.length + split.audit.length !== rows.length) {
    fail("PRESELECTED_OUTCOME_BLIND_PARTITION_INVALID");
  }
  const positives = ArrayReduce(split.train, (sum, row) => sum + row.label, 0);
  const constant = (positives + 0.5) / (split.train.length + 1);
  const baselineScores = arrayMapSafe(split.holdout, () => constant);
  const candidate = fitCandidate(split.train);
  const candidateScores = arrayMapSafe(split.holdout,
    (row) => candidateScore(candidate.raw, row));
  const baselineMetrics = metrics(split.holdout, baselineScores);
  const candidateMetrics = metrics(split.holdout, candidateScores);
  const baselineQueue = fixedBudgetQueue(split.holdout, baselineScores,
    "outsider/stale-constraint/baseline-priority-tie/v1");
  const candidateQueue = fixedBudgetQueue(split.holdout, candidateScores,
    "outsider/stale-constraint/candidate-priority-tie/v1");
  const gates = {
    groupOverlapZero: split.summary.groupOverlap === 0,
    auditReserveOutcomeBlindAndUnused: split.summary.auditReserve.labelsUsedForSelection === false
      && split.summary.auditReserve.labelsInspectedForThisReport === false,
    aucGainAtLeast002: candidateMetrics.auc >= baselineMetrics.auc + 0.02,
    brierReductionAtLeast0005: candidateMetrics.brier <= baselineMetrics.brier - 0.005,
    balancedAccuracyNotLower: candidateMetrics.balancedAccuracy
      >= baselineMetrics.balancedAccuracy,
    priorityPrecisionGainAtLeast005: candidateQueue.precision
      >= baselineQueue.precision + 0.05,
    priorityYieldStrictlyHigher: candidateQueue.deterministicTargetYield
      > baselineQueue.deterministicTargetYield,
    sameFixedGroupBudget: candidateQueue.budgetGroups === baselineQueue.budgetGroups,
  };
  const promotedForResearchQueue = ArrayEvery(ObjectValues(gates), BooleanConstructor);
  const selected = promotedForResearchQueue ? candidateQueue : baselineQueue;
  return {
    purpose: "OFFLINE_ACQUISITION_AND_REVIEW_PRIORITY_RESEARCH_ONLY",
    target: "SOURCE_NATIVE_DETERMINISTIC_NOT_AUTHORITATIVE_CONSISTENT_LABEL",
    targetIsIndependentRealOutcome: false,
    targetIsAuthorityTruth: false,
    split: split.summary,
    train: {
      episodes: split.train.length,
      groups: split.summary.trainGroups,
      deterministicPositiveLabels: positives,
      deterministicOtherLabels: split.train.length - positives,
    },
    baseline: {
      algorithm: "CONSTANT_TRAIN_PREVALENCE",
      probability: round(constant),
      holdoutMetrics: baselineMetrics,
      fixedBudgetQueue: baselineQueue,
    },
    candidate: {
      fitPerformed: true,
      model: candidate.committed,
      holdoutMetrics: candidateMetrics,
      fixedBudgetQueue: candidateQueue,
    },
    deltasCandidateMinusBaseline: {
      auc: round(candidateMetrics.auc - baselineMetrics.auc),
      brier: round(candidateMetrics.brier - baselineMetrics.brier),
      balancedAccuracy: round(candidateMetrics.balancedAccuracy
        - baselineMetrics.balancedAccuracy),
      priorityPrecision: round(candidateQueue.precision - baselineQueue.precision),
      priorityYield: candidateQueue.deterministicTargetYield
        - baselineQueue.deterministicTargetYield,
    },
    predeclaredPromotionGates: gates,
    researchQueueDecision: promotedForResearchQueue
      ? "USE_CANDIDATE_FOR_NEXT_OFFLINE_REVIEW_QUEUE"
      : "KEEP_BASELINE",
    selectedQueue: {
      selectedModel: promotedForResearchQueue ? "STRUCTURAL_LOGISTIC_CANDIDATE"
        : "CONSTANT_BASELINE",
      selectedGroups: selected.selectedGroups,
      selectedEpisodes: selected.selectedEpisodes,
      groupSetHash: selected.groupSetHash,
      episodeSetHash: selected.episodeSetHash,
      rankedGroups: selected.rankedGroups,
      dispatched: false,
      automaticAcquisition: false,
      rawTextIncluded: false,
      executable: false,
    },
    productionDecision: "KEEP_BASELINE_NO_PRODUCTION_TRAINING_OR_PROMOTION_AUTHORIZED",
  };
}

function boundary() {
  return {
    sourceClass: "CONSTRUCTED_AGENT_EXPERIMENT_NOT_REAL_WORLD_OUTCOME",
    rawPromptAndResponseStorage: "LOCAL_PRIVATE_SOURCE_DIRECTORY_ONLY_0600",
    rawPromptAndResponseNetworkProjection: false,
    networkRecordsCreated: 0,
    realWorldCompleteEpisodes: 0,
    independentLongitudinalOutcomes: 0,
    independentAffectedPartyObservations: 0,
    recoveryEpisodes: 0,
    productionTrainingRows: 0,
    productionModelsPromoted: 0,
    authority: "NONE",
    actorCredit: 0,
    CEU: 0,
    PRICE: false,
    GUARANTEE: false,
    SETTLE: false,
    executableAction: false,
    remoteOrPhysicalAction: false,
    fundsMoved: 0,
    CEnabledSubsetOfAProven: true,
    consequenceReachWithinCommittedEvidenceAndResponsibility: true,
  };
}

export function buildStaleConstraintEpisodeArtifact(sourceBytes) {
  requireSourceBytes(sourceBytes);
  const beforeBytes = sourceBytes[STALE_CONSTRAINT_SOURCE_FILES.recordBefore];
  const afterBytes = sourceBytes[STALE_CONSTRAINT_SOURCE_FILES.recordAfter];
  if (bufferLength(beforeBytes) > MAX_RECORD_BYTES
    || bufferLength(afterBytes) > MAX_RECORD_BYTES) {
    fail("RECORD_SIZE_BOUND_EXCEEDED");
  }
  const before = materialRecordState(parseJson(beforeBytes, "RECORD_BEFORE_JSON_INVALID"));
  const after = materialRecordState(parseJson(afterBytes, "RECORD_AFTER_JSON_INVALID"));
  if (!same(before, after)) fail("RECORD_MATERIAL_STATE_CHANGED_DURING_ACQUISITION");
  const sums = parseChecksums(sourceBytes[STALE_CONSTRAINT_SOURCE_FILES.checksums]);
  const { archiveIndex, contentByName } = parseArchive(
    sourceBytes[STALE_CONSTRAINT_SOURCE_FILES.archive], { materialize: true });
  const documentation = reviewArchiveDocumentation(contentByName);
  const episodes = replayEpisodes(archiveIndex, contentByName);
  const training = trainResearchRanker(episodes.rows, episodes.partition);
  const sourceObjects = arrayMapSafe(ObjectValues(STALE_CONSTRAINT_SOURCE_FILES),
    (name) => ({
    name,
    bytes: bufferLength(sourceBytes[name]),
    contentHash: sha256(sourceBytes[name]),
  }));
  ArraySort(sourceObjects, (left, right) => StringLocaleCompare(left.name, right.name));
  const sourceRoot = digest("outsider/stale-constraint/source-root/v1", sourceObjects);
  const body = {
    schema: STALE_CONSTRAINT_EPISODES_SCHEMA,
    schemaVersion: "2.0.0",
    successorBoundary: {
      artifactPath: "artifacts/outsider-stale-constraint-episodes-20260828-v2",
      supersedesWithoutOverwriting:
        "artifacts/outsider-stale-constraint-episodes-20260828-v1",
      predecessorStatus: "REJECTED_P1_INTRINSIC_AND_STRICT_AUDIT_ZERO_ACCESS_CLAIMS",
      predecessorUsedAsAuthority: false,
    },
    dataset: {
      ...STALE_CONSTRAINT_ZENODO_RECORD,
      sourceUrl: "https://zenodo.org/records/22117197",
      creatorAttribution: "Nakayashiki, Kazuki",
      sourceClass: "CONSTRUCTED_AGENT_MEMORY_VERIFICATION_EXPERIMENT",
    },
    sourceTrust: {
      mode: "FULL_PINNED_ARCHIVE_BYTE_CRC_REPLAY_PATH_FIRST_PARTIAL_SCHEMA_INSPECTION",
      exactRecordBeforeAndAfterCaptured: true,
      materialRecordStateStable: true,
      recordBeforeContentHash: sha256(beforeBytes),
      recordAfterContentHash: sha256(afterBytes),
      materialRecordStateHash: digest(
        "outsider/stale-constraint/material-record-state/v1", before),
      sourceObjects,
      sourceRoot,
      externalChecksumFile: {
        bytes: bufferLength(sourceBytes[STALE_CONSTRAINT_SOURCE_FILES.checksums]),
        md5: md5(sourceBytes[STALE_CONSTRAINT_SOURCE_FILES.checksums]),
        entries: sums,
      },
      archiveIndexHash: archiveIndex.archiveIndexHash,
      allArchiveEntriesDecompressedAndCrcVerified: true,
      acquisitionAuditGaps: {
        perRangeResponseTranscriptPersisted: false,
        impact: "P2_FULL_FILE_HASH_PINNED_BUT_48_RANGE_HTTP_TRANSCRIPT_NOT_IN_ARTIFACT",
      },
      predecessorBoundary: {
        rawSourceBytesEligibleOnlyAfterCurrentOfficialHashAndRecordReplay: true,
        predecessorDerivedReportOrReceiptTrusted: false,
      },
    },
    archiveSafety: archiveIndex.summary,
    privacyReview: {
      ...episodes.sensitive,
      valuesOrMatchesEmitted: false,
      READMEPublisherClaim: "Episode files contain no credentials or account identifiers.",
      READMEClaimPinnedFromSource: documentation
        .noCredentialsOrAccountIdentifiersClaimPresent,
      publisherClaimUsedAsAuthority: false,
      directIdentityAdjudicationPerformed: false,
      decision: "DERIVED_STRUCTURAL_RESEARCH_ONLY_RAW_TEXT_QUARANTINED",
    },
    rightsReview: {
      recordLicenseId: STALE_CONSTRAINT_ZENODO_RECORD.licenseId,
      accessRight: "open",
      attributionRequired: true,
      creatorAttribution: "Nakayashiki, Kazuki",
      archiveDocumentation: documentation,
      chainOfTitleIndependentlyAdjudicated: false,
      providerOutputTermsIndependentlyAdjudicated: false,
      networkRedistributionAuthorizedByThisAdapter: false,
      productionTrainingAuthorizedByThisAdapter: false,
      decision: "LOCAL_OFFLINE_RESEARCH_DERIVED_STRUCTURAL_FEATURES_ONLY",
      unresolvedGaps: [
        "The depositor's chain of title over every provider response was not independently adjudicated.",
        "Provider-specific output reuse terms were not independently adjudicated.",
        "Pattern scanning cannot prove absence of all personal information; raw text remains private and unprojected.",
      ],
    },
    sourceReplay: {
      ...episodes.replay,
      rawEpisodeObjectsProjectedToNetwork: 0,
      realWorldCompleteThreeSegmentEpisodes: 0,
      interpretation: "All 5,400 constructed episode entries were decompressed, CRC-checked and byte-committed. Only the 4,896 train/evaluation entries were JSON/schema/score inspected; the 504 audit entries stayed opaque byte commitments. The study has no independent longitudinal real-world outcome, affected-party observation or recovery segment.",
    },
    offlineResearchTraining: training,
    episodeDataEngineControlPlane: {
      schema: "outsider/episode-data-engine-source-candidate-queue/v1",
      datasetId: "ZENODO_22117197_STALE_CONSTRAINT_V2",
      sourceRoot,
      archiveIndexHash: archiveIndex.archiveIndexHash,
      state: "SOURCE_BYTES_REPLAYED_PATH_FIRST_LOCAL_OFFLINE_RESEARCH_ONLY",
      selectedReviewQueueHash: training.selectedQueue.groupSetHash,
      dispatched: false,
      automaticRetrieval: false,
      networkProjection: false,
      authority: "NONE",
    },
    boundary: boundary(),
    admissions: {
      archiveEpisodeByteCommitmentsReplayed: episodes.replay.confirmatoryEpisodes,
      schemaInspectedConstructedEpisodes: episodes.replay.schemaInspectedEpisodes,
      opaqueAuditByteCommitments: episodes.replay.opaqueAuditByteCommitments,
      offlineDerivedStructuralResearchRows: episodes.replay.schemaInspectedEpisodes,
      realOutcomeRows: 0,
      networkRows: 0,
      productionTrainingRows: 0,
      creditRows: 0,
      CEURows: 0,
    },
    rejections: {
      rawPromptResponseNetworkProjectionRows: episodes.replay.confirmatoryEpisodes,
      realOutcomeTruthRows: episodes.replay.confirmatoryEpisodes,
      productionTrainingRows: episodes.replay.confirmatoryEpisodes,
      authorityRows: episodes.replay.confirmatoryEpisodes,
      reason: "CONSTRUCTED_DETERMINISTIC_STUDY_ENDPOINT_IS_NOT_INDEPENDENT_REALITY_TRUTH",
    },
  };
  const report = deepFreeze({ ...body,
    reportHash: digest(STALE_CONSTRAINT_EPISODES_SCHEMA, body) });
  return deepFreeze({ report, archiveIndex });
}

function safeRead(file, maximumBytes) {
  const target = PathResolve(file);
  const stat = lstatSync(target, { bigint: true });
  if (StatsIsSymbolicLink(stat) || !StatsIsFile(stat) || stat.size < 1n
    || stat.size > BigIntConstructor(maximumBytes)) fail("SOURCE_FILE_UNSAFE", target);
  let descriptor;
  try {
    descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!StatsIsFile(before) || before.dev !== stat.dev || before.ino !== stat.ino
      || before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs
      || bufferLength(bytes) !== NumberConstructor(before.size)) {
      fail("SOURCE_FILE_CHANGED_DURING_READ", target);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function buildStaleConstraintEpisodeArtifactFromDirectory(sourceDirectory) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length < 1) {
    fail("SOURCE_DIRECTORY_REQUIRED");
  }
  const root = PathResolve(sourceDirectory);
  const sourceBytes = {};
  const names = ObjectValues(STALE_CONSTRAINT_SOURCE_FILES);
  for (let index = 0; index < names.length; index += 1) {
    const name = names[index];
    sourceBytes[name] = safeRead(PathJoin(root, name),
      name === STALE_CONSTRAINT_SOURCE_FILES.archive ? MAX_ARCHIVE_BYTES : MAX_RECORD_BYTES);
  }
  return buildStaleConstraintEpisodeArtifact(sourceBytes);
}

export function buildStaleConstraintRunReceipt(report, archiveIndex) {
  requirePlainObject(report, "RUN_RECEIPT_REPORT_INVALID");
  requirePlainObject(archiveIndex, "RUN_RECEIPT_ARCHIVE_INDEX_INVALID");
  if (!report || report.schema !== STALE_CONSTRAINT_EPISODES_SCHEMA
    || !RegExpExec(HASH, report.reportHash ?? "") || !archiveIndex
    || archiveIndex.schema !== STALE_CONSTRAINT_ARCHIVE_INDEX_SCHEMA
    || !RegExpExec(HASH, archiveIndex.archiveIndexHash ?? "")
    || report.sourceTrust.archiveIndexHash !== archiveIndex.archiveIndexHash) {
    fail("RUN_RECEIPT_INPUT_INVALID");
  }
  const body = {
    schema: STALE_CONSTRAINT_RUN_RECEIPT_SCHEMA,
    recordId: STALE_CONSTRAINT_ZENODO_RECORD.recordId,
    doi: STALE_CONSTRAINT_ZENODO_RECORD.doi,
    revision: STALE_CONSTRAINT_ZENODO_RECORD.revision,
    sourceRoot: report.sourceTrust.sourceRoot,
    reportHash: report.reportHash,
    archiveIndexHash: archiveIndex.archiveIndexHash,
    sourceBytes: ArrayReduce(report.sourceTrust.sourceObjects,
      (sum, item) => sum + item.bytes, 0),
    archiveBytes: archiveIndex.archive.bytes,
    archiveEntries: archiveIndex.summary.entries,
    archiveUncompressedBytesReplayed: archiveIndex.summary.uncompressedBytes,
    archiveEpisodeByteCommitmentsReplayed: report.sourceReplay.confirmatoryEpisodes,
    schemaInspectedEpisodes: report.sourceReplay.schemaInspectedEpisodes,
    opaqueAuditByteCommitments: report.sourceReplay.opaqueAuditByteCommitments,
    schemaInspectedKeptCalls: report.sourceReplay.schemaInspectedKeptTwoPhaseCalls,
    schemaInspectedProviderUsageRecords:
      report.sourceReplay.schemaInspectedProviderUsageRecords,
    schemaInspectedProviderCallAttempts:
      report.sourceReplay.schemaInspectedProviderCallAttempts,
    schemaInspectedRetryRecords: report.sourceReplay.schemaInspectedRetryRecords,
    datasetWidePinnedAggregateCounts:
      report.sourceReplay.datasetWidePinnedAggregateCountsNotRecomputedFromOpaqueAudit,
    groupRoot: report.sourceReplay.groupSetHash,
    split: report.offlineResearchTraining.split,
    baselineMetrics: report.offlineResearchTraining.baseline.holdoutMetrics,
    candidateMetrics: report.offlineResearchTraining.candidate.holdoutMetrics,
    researchQueueDecision: report.offlineResearchTraining.researchQueueDecision,
    productionDecision: report.offlineResearchTraining.productionDecision,
    admissions: report.admissions,
    rejections: report.rejections,
    boundary: report.boundary,
  };
  return deepFreeze({ ...body,
    receiptHash: digest(STALE_CONSTRAINT_RUN_RECEIPT_SCHEMA, body) });
}

export function verifyStaleConstraintEpisodeArtifact(report, archiveIndex, options = {}) {
  try {
    requirePlainObject(options, "VERIFICATION_OPTIONS_INVALID");
    const sourceDirectory = ownData(options, "sourceDirectory",
      "VERIFICATION_SOURCE_DIRECTORY_REQUIRED");
    if (typeof sourceDirectory !== "string" || sourceDirectory.length < 1) {
      fail("VERIFICATION_SOURCE_DIRECTORY_REQUIRED");
    }
    requirePlainObject(report, "REPORT_INVALID");
    requirePlainObject(archiveIndex, "ARCHIVE_INDEX_INVALID");
    const rebuilt = buildStaleConstraintEpisodeArtifactFromDirectory(sourceDirectory);
    if (!same(report, rebuilt.report) || !same(archiveIndex, rebuilt.archiveIndex)) {
      fail("FULL_SOURCE_REPLAY_MISMATCH");
    }
    return ObjectFreeze({ ok: true,
      reportHash: rebuilt.report.reportHash,
      archiveIndexHash: rebuilt.archiveIndex.archiveIndexHash,
      sourceRoot: rebuilt.report.sourceTrust.sourceRoot,
      episodes: rebuilt.report.sourceReplay.confirmatoryEpisodes,
      schemaInspectedEpisodes: rebuilt.report.sourceReplay.schemaInspectedEpisodes,
      opaqueAuditByteCommitments: rebuilt.report.sourceReplay.opaqueAuditByteCommitments,
      datasetWidePinnedKeptCalls: rebuilt.report.sourceReplay
        .datasetWidePinnedAggregateCountsNotRecomputedFromOpaqueAudit.keptTwoPhaseCalls,
      researchQueueDecision: rebuilt.report.offlineResearchTraining.researchQueueDecision });
  } catch (error) {
    return ObjectFreeze({ ok: false,
      error: error instanceof ErrorConstructor ? error.message : StringConstructor(error) });
  }
}

export function verifyStaleConstraintRunReceipt(receipt, report, archiveIndex,
  directories = {}) {
  const verified = verifyStaleConstraintEpisodeArtifact(report, archiveIndex, directories);
  if (!verified.ok) return verified;
  try {
    const rebuilt = buildStaleConstraintRunReceipt(report, archiveIndex);
    if (!same(receipt, rebuilt)) fail("RUN_RECEIPT_REPLAY_MISMATCH");
    return ObjectFreeze({ ok: true, receiptHash: rebuilt.receiptHash,
      reportHash: report.reportHash, sourceRoot: report.sourceTrust.sourceRoot });
  } catch (error) {
    return ObjectFreeze({ ok: false,
      error: error instanceof ErrorConstructor ? error.message : StringConstructor(error) });
  }
}

export function publishStaleConstraintArtifactDirectory(stagingDirectory,
  targetDirectory) {
  if (typeof stagingDirectory !== "string" || typeof targetDirectory !== "string") {
    fail("PUBLISH_DIRECTORY_REQUIRED");
  }
  const staging = PathResolve(stagingDirectory);
  const target = PathResolve(targetDirectory);
  if (staging === target || PathDirname(staging) !== PathDirname(target)) {
    fail("PUBLISH_DIRECTORIES_MUST_BE_DISTINCT_SIBLINGS");
  }
  const stat = lstatSync(staging, { bigint: true });
  if (StatsIsSymbolicLink(stat) || !StatsIsDirectory(stat)) fail("PUBLISH_STAGING_UNSAFE");
  try {
    mkdirSync(target, { mode: 0o700 });
    chmodSync(target, 0o700);
  } catch {
    fail("TARGET_CLAIM_FAILED", target);
  }
  try {
    renameSync(PathJoin(staging, "source"), PathJoin(target, "source"));
    renameSync(PathJoin(staging, "archive-index.json"),
      PathJoin(target, "archive-index.json"));
    renameSync(PathJoin(staging, "report.json"), PathJoin(target, "report.json"));
    /* Receipt is the completion marker and is always published last. */
    renameSync(PathJoin(staging, "run-receipt.json"),
      PathJoin(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch {
    fail("TARGET_PUBLISH_FAILED", target);
  }
  return target;
}

export const STALE_CONSTRAINT_EXPECTED_FILES = EXPECTED_FILES;
