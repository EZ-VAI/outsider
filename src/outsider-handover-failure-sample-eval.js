/*
 * Bounded Zenodo robot↔human handover failure sample intake.
 *
 * The source closure is the official two-trial sample, the complete training
 * label archive, class-name map, and datasheet.  Exact trial-id joins preserve
 * publisher labels only.  Human participation is neither an independent
 * witness nor an independent outcome observation, and visible faces keep the
 * material in privacy quarantine.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmdirSync, unlinkSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const HANDOVER_RECORD_ID = 10_708_763;
export const HANDOVER_DOI = "10.5281/zenodo.10708763";
export const HANDOVER_LICENSE = "CC-BY-4.0";
export const HANDOVER_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const HANDOVER_SOURCE_SCHEMA = "outsider/handover-failure-pinned-source/v1";
export const HANDOVER_INVENTORY_SCHEMA = "outsider/handover-failure-archive-inventory/v1";
export const HANDOVER_REPORT_SCHEMA = "outsider/handover-failure-sample-eval/v1";
export const HANDOVER_RECEIPT_SCHEMA = "outsider/handover-failure-run-receipt/v1";

const ZENODO_ORIGIN = "https://zenodo.org";
const RECORD_URL = `${ZENODO_ORIGIN}/api/records/${HANDOVER_RECORD_ID}`;
const RANGE_CHUNK_BYTES = 512 * 1024;
const RANGE_CONCURRENCY = 16;
const RANGE_ATTEMPTS = 6;
const RANGE_BACKOFF_MAX_MS = 10_000;
const FETCH_TIMEOUT_MS = 300_000;
const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const MAX_SELECTED_BYTES = 64 * 1024 * 1024;
const MAX_TAR_BYTES = 128 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MD5 = /^md5:[a-f0-9]{32}$/u;
const SAFE_TAR_PATH = /^[A-Za-z0-9._/+ -]+$/u;
const TRIAL_ID = /^trial\d{4}$/u;
const EXPECTED_OBSERVATIONS_HASH =
  "sha256:a6d7e87ad8407b4b8f2c1f263cba7f83e78cfe816696acb70cd43767609c7a64";

const RECORD_FILES = Object.freeze([
  { key: "class_names.json", sizeBytes: 580,
    md5: "md5:4d3c62f83c1f0de4e7705eeae3f7e306" },
  { key: "datasheet.pdf", sizeBytes: 142_810,
    md5: "md5:da8d8c94d33534656c8ec7fe2762864e" },
  { key: "sample_training_set.tar.gz", sizeBytes: 59_949_643,
    md5: "md5:c6466839bc34310fcf8e5e828874dbc7" },
  { key: "test_labels.tar.gz", sizeBytes: 2_339,
    md5: "md5:3fe3450ac8457c1d8686c2f1014d5a98" },
  { key: "test_set.tar.gz", sizeBytes: 2_212_335_673,
    md5: "md5:438190b8fdde75c3f866e6759015fa45" },
  { key: "training_labels.tar.gz", sizeBytes: 4_724,
    md5: "md5:d121a36ccbc3dec189ddcf0153c391a8" },
  { key: "training_set.tar.gz", sizeBytes: 9_185_706_983,
    md5: "md5:14232fcd1b34030b77db48d8c771710d" },
  { key: "val_labels.tar.gz", sizeBytes: 1_791,
    md5: "md5:127bc496afe500e3177edd9dd8532f2d" },
  { key: "val_set.tar.gz", sizeBytes: 1_553_494_905,
    md5: "md5:88e1f855d0e82fd8cb7a216ecee36e59" },
  { key: "wrench_stats.json", sizeBytes: 367,
    md5: "md5:12473fd7485db80ea131073ff843b54e" },
]);

const SELECTED_FILES = Object.freeze(RECORD_FILES.filter((item) => [
  "class_names.json", "datasheet.pdf", "sample_training_set.tar.gz",
  "training_labels.tar.gz",
].includes(item.key)));

const EXPECTED_CLASS_NAMES = Object.freeze({
  "human action classes": ["idle", "approach", "interact", "retract", "post-idle",
    "not released", "dropped"],
  "human to robot handover outcomes": ["success", "no approach", "no release", "drop"],
  "robot action classes": ["idle", "approach", "interact", "retract", "post-idle"],
  "robot to human handover outcomes": ["success", "no approach", "no grasp", "drop"],
});

function fail(code, detail = null) {
  throw new Error(detail === null ? `HANDOVER_FAILURE_${code}`
    : `HANDOVER_FAILURE_${code}:${detail}`);
}

export function handoverSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function handoverMd5(bytes) {
  return `md5:${createHash("md5").update(bytes).digest("hex")}`;
}

export function handoverDigest(value, domain = HANDOVER_REPORT_SCHEMA) {
  return handoverSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function checkedZenodoUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.origin !== ZENODO_ORIGIN
    || url.username !== "" || url.password !== "") fail("URL_INVALID", value);
  return url;
}

async function streamResponse(response, maximumBytes, expectedBytes = null) {
  if (!response.body) fail("FETCH_BODY_MISSING");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared)
    || Number(declared) > maximumBytes
    || expectedBytes !== null && Number(declared) !== expectedBytes)) {
    fail("FETCH_CONTENT_LENGTH_INVALID", declared);
  }
  const chunks = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes || expectedBytes !== null && total > expectedBytes) {
      await reader.cancel("bounded source limit exceeded");
      fail("FETCH_STREAM_SIZE_INVALID", String(total));
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1 || expectedBytes !== null && total !== expectedBytes) {
    fail("FETCH_BODY_SIZE_INVALID", String(total));
  }
  return Buffer.concat(chunks, total);
}

async function boundedRecordFetch(fetchImpl) {
  const url = checkedZenodoUrl(RECORD_URL);
  const response = await fetchImpl(url, {
    redirect: "error",
    headers: { accept: "application/json", "accept-encoding": "identity",
      "user-agent": "outsider-handover-failure/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status !== 200 || response.headers.get("content-encoding") !== null
    || new URL(response.url || url).origin !== url.origin) {
    fail(`RECORD_FETCH_HTTP_${response.status}`);
  }
  const bytes = await streamResponse(response, MAX_RECORD_BYTES);
  return { bytes, value: parseJson(bytes, "RECORD_JSON_INVALID") };
}

function retryDelay(response, attempt) {
  const value = response?.headers?.get("retry-after");
  if (value && /^\d+$/u.test(value)) {
    return Math.min(RANGE_BACKOFF_MAX_MS, Math.max(500, Number(value) * 1_000));
  }
  return Math.min(RANGE_BACKOFF_MAX_MS, 750 * (2 ** attempt));
}

function waitMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function strictRangePart(file, start, end, fetchImpl) {
  const url = checkedZenodoUrl(`${RECORD_URL}/files/${encodeURIComponent(file.key)}/content`);
  const expected = end - start + 1;
  let lastError = null;
  for (let attempt = 0; attempt < RANGE_ATTEMPTS; attempt += 1) {
    let response = null;
    try {
      response = await fetchImpl(url, {
        redirect: "error",
        headers: { "accept-encoding": "identity", range: `bytes=${start}-${end}`,
          "user-agent": "outsider-handover-failure/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const contentRange = response.headers.get("content-range");
      if (response.status === 206) {
        if (contentRange !== `bytes ${start}-${end}/${file.sizeBytes}`
          || response.headers.get("accept-ranges") !== "bytes"
          || response.headers.get("content-encoding") !== null
          || new URL(response.url || url).origin !== url.origin) {
          fail("STRICT_RANGE_UNSUPPORTED", `${file.key}:${response.status}:${contentRange}`);
        }
        const bytes = await streamResponse(response, expected, expected);
        return { start, end, sizeBytes: bytes.length, contentRange,
          sha256: handoverSha256(bytes), bytes };
      }
      lastError = `HTTP_${response.status}`;
      const transient = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
      if (!transient || attempt === RANGE_ATTEMPTS - 1) {
        fail("STRICT_RANGE_UNSUPPORTED", `${file.key}:${response.status}:${contentRange}`);
      }
      if (response.body) await response.body.cancel("bounded range retry");
      await waitMilliseconds(retryDelay(response, attempt));
    } catch (error) {
      if (safeError(error).startsWith("HANDOVER_FAILURE_STRICT_RANGE_")) throw error;
      lastError = safeError(error);
      if (attempt === RANGE_ATTEMPTS - 1) {
        fail("STRICT_RANGE_FETCH_FAILED", `${file.key}:${start}-${end}:${lastError}`);
      }
      if (response?.body) {
        try { await response.body.cancel("bounded range retry"); } catch { /* no-op */ }
      }
      await waitMilliseconds(retryDelay(response, attempt));
    }
  }
  fail("STRICT_RANGE_FETCH_FAILED", `${file.key}:${lastError}`);
}

function readCachedRange(file, partPath, start, end) {
  const stat = lstatSync(partPath);
  const expected = end - start + 1;
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o777) !== 0o600
    || stat.size !== expected) fail("RANGE_CACHE_FILE_UNSAFE", partPath);
  const bytes = readFileSync(partPath);
  if (bytes.length !== expected) fail("RANGE_CACHE_FILE_SIZE_INVALID", partPath);
  return { start, end, sizeBytes: bytes.length,
    contentRange: `bytes ${start}-${end}/${file.sizeBytes}`,
    sha256: handoverSha256(bytes), bytes };
}

async function strictRangeObject(file, fetchImpl, progress = null, cacheRoot = null) {
  const plans = [];
  for (let start = 0; start < file.sizeBytes; start += RANGE_CHUNK_BYTES) {
    plans.push({ start, end: Math.min(file.sizeBytes - 1, start + RANGE_CHUNK_BYTES - 1) });
  }
  const parts = new Array(plans.length);
  const pending = [];
  let completed = 0;
  let cacheDirectory = null;
  if (cacheRoot !== null) {
    cacheDirectory = path.join(cacheRoot, file.key);
    ensurePrivateDirectory(cacheDirectory);
  }
  for (let index = 0; index < plans.length; index += 1) {
    const partPath = cacheDirectory === null ? null
      : path.join(cacheDirectory, `part-${String(index).padStart(4, "0")}.bin`);
    if (partPath !== null && existsSync(partPath)) {
      parts[index] = readCachedRange(file, partPath, plans[index].start, plans[index].end);
      completed += 1;
      if (typeof progress === "function") progress(file.key, completed, plans.length);
    } else pending.push(index);
  }
  let next = 0;
  const failures = [];
  const workers = Array.from({ length: Math.min(RANGE_CONCURRENCY, plans.length) }, async () => {
    for (;;) {
      const pendingIndex = next;
      next += 1;
      if (pendingIndex >= pending.length) return;
      const index = pending[pendingIndex];
      try {
        parts[index] = await strictRangePart(file, plans[index].start, plans[index].end, fetchImpl);
        if (cacheDirectory !== null) {
          writePrivate(path.join(cacheDirectory,
            `part-${String(index).padStart(4, "0")}.bin`), parts[index].bytes);
        }
        completed += 1;
        if (typeof progress === "function") progress(file.key, completed, plans.length);
      } catch (error) { failures.push({ index, error }); }
    }
  });
  await Promise.all(workers);
  if (failures.length > 0) {
    fail("RANGE_PARTS_EXHAUSTED", failures.map((item) =>
      `${plans[item.index].start}-${plans[item.index].end}:${safeError(item.error)}`).join("|"));
  }
  const bytes = Buffer.concat(parts.map((item) => item.bytes), file.sizeBytes);
  if (bytes.length !== file.sizeBytes || handoverMd5(bytes) !== file.md5) {
    fail("SELECTED_OBJECT_PIN_MISMATCH", file.key);
  }
  return { bytes, transcript: { key: file.key,
    url: `${RECORD_URL}/files/${encodeURIComponent(file.key)}/content`,
    sizeBytes: bytes.length, publisherMd5Claim: file.md5,
    recomputedMd5: handoverMd5(bytes), sha256: handoverSha256(bytes),
    strict206PartCount: parts.length,
    parts: parts.map(({ start, end, sizeBytes, contentRange, sha256 }) =>
      ({ start, end, sizeBytes, contentRange, sha256 })) } };
}

function clearExactRangeCache(cacheRoot) {
  if (!existsSync(cacheRoot)) return;
  const allowed = new Set(SELECTED_FILES.map((item) => item.key));
  for (const name of readdirSync(cacheRoot)) {
    if (!allowed.has(name)) fail("RANGE_CACHE_LAYOUT_INVALID", name);
    const directory = path.join(cacheRoot, name);
    const stat = lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("RANGE_CACHE_LAYOUT_INVALID", name);
    for (const part of readdirSync(directory)) {
      if (!/^part-\d{4}\.bin$/u.test(part)) fail("RANGE_CACHE_LAYOUT_INVALID", part);
      const target = path.join(directory, part);
      const item = lstatSync(target);
      if (item.isSymbolicLink() || !item.isFile()) fail("RANGE_CACHE_LAYOUT_INVALID", part);
      unlinkSync(target);
    }
    rmdirSync(directory);
  }
  rmdirSync(cacheRoot);
}

function recordProjection(value) {
  if (!exactObject(value) || value.id !== HANDOVER_RECORD_ID || value.revision !== 6
    || value.conceptrecid !== "10708762" || value.doi !== HANDOVER_DOI
    || value.status !== "published" || value.state !== "done"
    || value.metadata?.title !== "Handover Failure Detection dataset"
    || value.metadata?.resource_type?.type !== "dataset"
    || value.metadata?.license?.id !== "cc-by-4.0"
    || value.metadata?.access_right !== "open" || !Array.isArray(value.files)) {
    fail("RECORD_PROFILE_INVALID");
  }
  const files = value.files.map((item) => ({ key: item.key, sizeBytes: item.size,
    md5: item.checksum, url: item.links?.self })).sort((a, b) => a.key.localeCompare(b.key));
  const expected = RECORD_FILES.map((item) => ({ ...item,
    url: `${RECORD_URL}/files/${encodeURIComponent(item.key)}/content` }));
  if (!same(files, expected)) fail("RECORD_FILE_SET_CHANGED");
  return { recordId: HANDOVER_RECORD_ID, revision: 6, conceptRecordId: "10708762",
    doi: HANDOVER_DOI, created: value.created, updated: value.updated,
    status: "published", state: "done", title: value.metadata.title,
    resourceType: "dataset", access: "open", publisherLicenseClaim: HANDOVER_LICENSE,
    files };
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function parseTarNumber(field, code) {
  if ((field[0] & 0x80) !== 0) {
    if ((field[0] & 0x40) !== 0) fail(code);
    let value = BigInt(field[0] & 0x3f);
    for (let index = 1; index < field.length; index += 1) {
      value = (value << 8n) | BigInt(field[index]);
    }
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) fail(code);
    return Number(value);
  }
  const text = field.toString("ascii").replace(/\0.*$/u, "").trim();
  if (text === "") return 0;
  if (!/^[0-7]+$/u.test(text)) fail(code);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value)) fail(code);
  return value;
}

function tarString(field) {
  const end = field.indexOf(0);
  return field.subarray(0, end < 0 ? field.length : end).toString("utf8");
}

function safeTarPath(value, directory = false) {
  if (typeof value !== "string" || value.length < 1 || value.includes("\\")
    || value.startsWith("/") || !SAFE_TAR_PATH.test(value)) fail("TAR_PATH_UNSAFE", value);
  const normalized = directory ? value.replace(/\/+$/u, "") : value;
  if (normalized.length < 1 || normalized.split("/").some((part) =>
    part === "" || part === "." || part === "..")) fail("TAR_PATH_UNSAFE", value);
  return normalized;
}

function parsePax(bytes) {
  const text = bytes.toString("utf8");
  const values = {};
  let offset = 0;
  while (offset < text.length) {
    const space = text.indexOf(" ", offset);
    if (space < 0 || !/^\d+$/u.test(text.slice(offset, space))) fail("TAR_PAX_INVALID");
    const length = Number(text.slice(offset, space));
    if (!Number.isSafeInteger(length) || length < 4 || offset + length > text.length
      || text[offset + length - 1] !== "\n") fail("TAR_PAX_INVALID");
    const record = text.slice(space + 1, offset + length - 1);
    const equals = record.indexOf("=");
    if (equals < 1) fail("TAR_PAX_INVALID");
    values[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return values;
}

function parseNpyHeader(bytes, sourcePath) {
  if (bytes.length < 10 || !bytes.subarray(0, 6).equals(Buffer.from([0x93, 0x4e, 0x55,
    0x4d, 0x50, 0x59]))) fail("NPY_MAGIC_INVALID", sourcePath);
  const major = bytes[6];
  const minor = bytes[7];
  const lengthBytes = major === 1 ? 2 : [2, 3].includes(major) ? 4 : 0;
  if (lengthBytes === 0 || major === 1 && minor !== 0) fail("NPY_VERSION_INVALID", sourcePath);
  const headerLength = lengthBytes === 2 ? bytes.readUInt16LE(8) : bytes.readUInt32LE(8);
  const headerStart = 8 + lengthBytes;
  const dataStart = headerStart + headerLength;
  if (headerLength < 1 || dataStart > bytes.length
    || bytes[dataStart - 1] !== 0x0a) fail("NPY_HEADER_INVALID", sourcePath);
  const encoding = major === 3 ? "utf8" : "latin1";
  const header = bytes.subarray(headerStart, dataStart).toString(encoding).trim();
  const descr = /['"]descr['"]\s*:\s*['"]([^'"]+)['"]/u.exec(header)?.[1] ?? null;
  const fortran = /['"]fortran_order['"]\s*:\s*(True|False)/u.exec(header)?.[1] ?? null;
  const shapeText = /['"]shape['"]\s*:\s*\(([^)]*)\)/u.exec(header)?.[1] ?? null;
  if (descr === null || fortran === null || shapeText === null) {
    fail("NPY_DICTIONARY_INVALID", sourcePath);
  }
  const shape = shapeText.split(",").map((item) => item.trim()).filter(Boolean).map((item) => {
    if (!/^\d+$/u.test(item)) fail("NPY_SHAPE_INVALID", sourcePath);
    const value = Number(item);
    if (!Number.isSafeInteger(value)) fail("NPY_SHAPE_INVALID", sourcePath);
    return value;
  });
  const type = /^[<>=|]?([biufcOSUVmM])(\d+)$/u.exec(descr);
  /* NumPy's Unicode descriptor width is a count of UCS-4 code points, not
   * bytes. Other primitive descriptors encode their byte width directly. */
  const itemBytes = type ? Number(type[2]) * (type[1] === "U" ? 4 : 1) : null;
  const elementCount = shape.reduce((product, item) => product * item, 1);
  const expectedDataBytes = itemBytes === null || !Number.isSafeInteger(elementCount * itemBytes)
    ? null : elementCount * itemBytes;
  return { version: `${major}.${minor}`, descr, fortranOrder: fortran === "True", shape,
    headerBytes: dataStart, dataBytes: bytes.length - dataStart, itemBytes,
    elementCount, expectedDataBytes,
    exactDataLengthEstablished: expectedDataBytes === null ? null
      : expectedDataBytes === bytes.length - dataStart };
}

function parseTarArchive(gzipBytes, archiveName) {
  if (!Buffer.isBuffer(gzipBytes) || gzipBytes.length < 18
    || gzipBytes[0] !== 0x1f || gzipBytes[1] !== 0x8b || gzipBytes[2] !== 8
    || (gzipBytes[3] & 0xe0) !== 0) fail("GZIP_HEADER_INVALID", archiveName);
  let raw;
  try { raw = gunzipSync(gzipBytes, { maxOutputLength: MAX_TAR_BYTES }); }
  catch { fail("GZIP_REPLAY_INVALID", archiveName); }
  const trailerCrc32 = gzipBytes.readUInt32LE(gzipBytes.length - 8);
  const trailerISize = gzipBytes.readUInt32LE(gzipBytes.length - 4);
  const computedCrc32 = crc32(raw);
  if (trailerCrc32 !== computedCrc32 || trailerISize !== (raw.length >>> 0)) {
    fail("GZIP_TRAILER_INVALID", archiveName);
  }
  const entries = [];
  const payloads = new Map();
  const seen = new Set();
  let offset = 0;
  let zeroBlocks = 0;
  let pendingPax = null;
  let globalPax = {};
  let pendingLongName = null;
  let endOffset = null;
  while (offset + 512 <= raw.length) {
    const header = raw.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      offset += 512;
      if (zeroBlocks === 2) { endOffset = offset; break; }
      continue;
    }
    if (zeroBlocks !== 0) fail("TAR_SINGLE_ZERO_BLOCK", archiveName);
    const storedChecksum = parseTarNumber(header.subarray(148, 156), "TAR_CHECKSUM_INVALID");
    const checksumHeader = Buffer.from(header);
    checksumHeader.fill(0x20, 148, 156);
    const unsignedChecksum = checksumHeader.reduce((sum, byte) => sum + byte, 0);
    if (storedChecksum !== unsignedChecksum) fail("TAR_CHECKSUM_MISMATCH", archiveName);
    const baseName = tarString(header.subarray(0, 100));
    const prefix = tarString(header.subarray(345, 500));
    const physicalPath = prefix ? `${prefix}/${baseName}` : baseName;
    const sizeBytes = parseTarNumber(header.subarray(124, 136), "TAR_SIZE_INVALID");
    const mode = parseTarNumber(header.subarray(100, 108), "TAR_MODE_INVALID");
    const uid = parseTarNumber(header.subarray(108, 116), "TAR_UID_INVALID");
    const gid = parseTarNumber(header.subarray(116, 124), "TAR_GID_INVALID");
    const mtime = parseTarNumber(header.subarray(136, 148), "TAR_MTIME_INVALID");
    const type = String.fromCharCode(header[156] || 48);
    const contentStart = offset + 512;
    const contentEnd = contentStart + sizeBytes;
    const nextOffset = contentStart + Math.ceil(sizeBytes / 512) * 512;
    if (contentEnd > raw.length || nextOffset > raw.length) fail("TAR_MEMBER_TRUNCATED", archiveName);
    const content = raw.subarray(contentStart, contentEnd);
    if (type === "x" || type === "g") {
      const pax = parsePax(content);
      if (type === "x") pendingPax = pax;
      else globalPax = { ...globalPax, ...pax };
    } else if (type === "L") {
      pendingLongName = content.toString("utf8").replace(/\0+$/u, "");
    } else {
      if (!["0", "5"].includes(type)) fail("TAR_MEMBER_TYPE_FORBIDDEN", `${type}:${physicalPath}`);
      const mergedPax = { ...globalPax, ...(pendingPax ?? {}) };
      const declaredPath = mergedPax.path ?? pendingLongName ?? physicalPath;
      if (Object.keys(mergedPax).some((key) => !["path", "mtime", "atime", "ctime"].includes(key))) {
        fail("TAR_PAX_SEMANTICS_UNSUPPORTED", declaredPath);
      }
      const memberPath = safeTarPath(declaredPath, type === "5");
      if (seen.has(memberPath)) fail("TAR_DUPLICATE_PATH", memberPath);
      seen.add(memberPath);
      if (type === "5" && sizeBytes !== 0) fail("TAR_DIRECTORY_SIZE_INVALID", memberPath);
      const entry = { path: memberPath, type: type === "5" ? "directory" : "file",
        sizeBytes, mode, uid, gid, mtime,
        sha256: type === "5" ? null : handoverSha256(content) };
      entries.push(entry);
      if (type === "0") payloads.set(memberPath, content);
      pendingPax = null;
      pendingLongName = null;
    }
    offset = nextOffset;
  }
  if (endOffset === null || pendingPax !== null || pendingLongName !== null
    || raw.subarray(endOffset).some((byte) => byte !== 0)) fail("TAR_END_INVALID", archiveName);
  return { gzip: { compressedBytes: gzipBytes.length, compressedSha256: handoverSha256(gzipBytes),
    rawTarBytes: raw.length, rawTarSha256: handoverSha256(raw),
    trailerCrc32: trailerCrc32.toString(16).padStart(8, "0"),
    computedCrc32: computedCrc32.toString(16).padStart(8, "0"), trailerISize,
    gzipCrcAndISizeReplayed: true }, tar: { physicalEndOffset: endOffset,
    memberCount: entries.length, fileCount: entries.filter((item) => item.type === "file").length,
    directoryCount: entries.filter((item) => item.type === "directory").length,
    entries }, payloads };
}

function extensionOf(value) {
  const base = path.posix.basename(value);
  const index = base.lastIndexOf(".");
  return index < 0 ? "(none)" : base.slice(index + 1).toLowerCase();
}

function countBy(values) {
  const result = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}

function analyzeArchives(sampleBytes, labelBytes, classBytes) {
  const sample = parseTarArchive(sampleBytes, "sample_training_set.tar.gz");
  const labels = parseTarArchive(labelBytes, "training_labels.tar.gz");
  const classNames = parseJson(classBytes, "CLASS_NAMES_JSON_INVALID");
  if (!same(classNames, EXPECTED_CLASS_NAMES)) fail("CLASS_NAMES_PROFILE_CHANGED");
  const sampleFiles = sample.tar.entries.filter((item) => item.type === "file");
  const sampleTrialIds = sorted(new Set(sampleFiles.map((item) => {
    const match = /^sample_training_set\/(trial\d{4})\//u.exec(item.path);
    if (!match) fail("SAMPLE_MEMBER_OUTSIDE_TRIAL", item.path);
    return match[1];
  })));
  if (sampleTrialIds.length !== 2) fail("SAMPLE_TRIAL_COUNT_CHANGED", String(sampleTrialIds.length));
  const npyProfiles = sampleFiles.filter((item) => item.path.endsWith(".npy")).map((entry) =>
    ({ path: entry.path, ...parseNpyHeader(sample.payloads.get(entry.path), entry.path) }));
  if (npyProfiles.some((item) => item.exactDataLengthEstablished === false)) {
    fail("SAMPLE_NPY_LENGTH_INVALID");
  }
  const labelFiles = labels.tar.entries.filter((item) => item.type === "file");
  const publisherLabels = labelFiles.map((entry) => {
    const match = /^training_labels\/(trial\d{4})\.json$/u.exec(entry.path);
    if (!match) fail("TRAINING_LABEL_PATH_INVALID", entry.path);
    const value = parseJson(labels.payloads.get(entry.path), "TRAINING_LABEL_JSON_INVALID");
    if (!exactObject(value) || !same(sorted(Object.keys(value)), ["outcome", "robot", "task"])
      || !["robot to human handover", "human to robot handover"].includes(value.task)
      || typeof value.robot !== "string" || value.robot.length < 1
      || !Number.isInteger(value.outcome) || value.outcome < 0 || value.outcome > 3) {
      fail("TRAINING_LABEL_PROFILE_INVALID", entry.path);
    }
    const classes = classNames[`${value.task} outcomes`];
    return { trialId: match[1], memberPath: entry.path, task: value.task,
      robot: value.robot, publisherOutcomeIndex: value.outcome,
      publisherOutcomeName: classes[value.outcome], labelFileSha256: entry.sha256 };
  }).sort((a, b) => a.trialId.localeCompare(b.trialId));
  if (new Set(publisherLabels.map((item) => item.trialId)).size !== publisherLabels.length) {
    fail("TRAINING_LABEL_ID_DUPLICATE");
  }
  const byTrial = new Map(publisherLabels.map((item) => [item.trialId, item]));
  const sampleTaskInfo = new Map(sampleTrialIds.map((trialId) => {
    const memberPath = `sample_training_set/${trialId}/task_info.json`;
    const entry = sampleFiles.find((item) => item.path === memberPath);
    if (!entry) fail("SAMPLE_TASK_INFO_MISSING", trialId);
    const value = parseJson(sample.payloads.get(memberPath), "SAMPLE_TASK_INFO_JSON_INVALID");
    if (!exactObject(value) || !same(sorted(Object.keys(value)), ["robot", "task"])
      || !["robot to human handover", "human to robot handover"].includes(value.task)
      || typeof value.robot !== "string" || value.robot.length < 1) {
      fail("SAMPLE_TASK_INFO_PROFILE_INVALID", trialId);
    }
    return [trialId, { memberPath, task: value.task, robot: value.robot,
      taskInfoFileSha256: entry.sha256 }];
  }));
  const sampleJoins = sampleTrialIds.map((trialId) => {
    const label = byTrial.get(trialId);
    const taskInfo = sampleTaskInfo.get(trialId);
    return label ? { sampleTrialId: trialId, exactBasenameJoinEstablished: true,
      taskInfoExactMatchEstablished: label.task === taskInfo.task
        && label.robot === taskInfo.robot,
      sampleTaskInfoMemberPath: taskInfo.memberPath,
      sampleTaskInfoFileSha256: taskInfo.taskInfoFileSha256, ...label }
      : { sampleTrialId: trialId, exactBasenameJoinEstablished: false,
        taskInfoExactMatchEstablished: false,
        sampleTaskInfoMemberPath: taskInfo.memberPath,
        sampleTaskInfoFileSha256: taskInfo.taskInfoFileSha256,
        memberPath: null, task: null, robot: null, publisherOutcomeIndex: null,
        publisherOutcomeName: null, labelFileSha256: null };
  });
  const trialProfiles = sampleTrialIds.map((trialId) => {
    const files = sampleFiles.filter((item) => item.path.startsWith(`sample_training_set/${trialId}/`));
    return { trialId, fileCount: files.length,
      totalBytes: files.reduce((sum, item) => sum + item.sizeBytes, 0),
      extensionCounts: countBy(files.map((item) => extensionOf(item.path))),
      memberPaths: files.map((item) => item.path).sort((a, b) => a.localeCompare(b)) };
  });
  return { sample, labels, classNames, sampleFiles, publisherLabels, npyProfiles,
    observations: { sampleTrialIds, sampleTrialCount: sampleTrialIds.length,
      sampleMemberCount: sample.tar.memberCount, sampleFileCount: sample.tar.fileCount,
      sampleDirectoryCount: sample.tar.directoryCount,
      sampleExtensionCounts: countBy(sampleFiles.map((item) => extensionOf(item.path))),
      sampleTotalMemberBytes: sampleFiles.reduce((sum, item) => sum + item.sizeBytes, 0),
      sampleTrialProfiles: trialProfiles, npyProfiles,
      trainingLabelRows: publisherLabels.length,
      trainingLabelTaskCounts: countBy(publisherLabels.map((item) => item.task)),
      trainingLabelOutcomeCounts: countBy(publisherLabels.map((item) =>
        `${item.task}:${item.publisherOutcomeName}`)),
      sampleLabelJoins: sampleJoins,
      exactSampleToTrainingLabelJoinEstablished: sampleJoins.every((item) =>
        item.exactBasenameJoinEstablished && item.taskInfoExactMatchEstablished),
      publisherSampleOutcomeLabelUnits: sampleJoins.filter((item) =>
        item.exactBasenameJoinEstablished && item.taskInfoExactMatchEstablished).length } };
}

function inventoryFromBytes(sampleBytes, labelBytes, classBytes) {
  const analyzed = analyzeArchives(sampleBytes, labelBytes, classBytes);
  const body = { schema: HANDOVER_INVENTORY_SCHEMA,
    sampleArchive: { ...analyzed.sample.gzip, ...analyzed.sample.tar },
    trainingLabelArchive: { ...analyzed.labels.gzip, ...analyzed.labels.tar },
    classNames: analyzed.classNames,
    observations: analyzed.observations };
  return { ...body,
    inventoryHash: handoverDigest(body, `${HANDOVER_INVENTORY_SCHEMA}/inventory`) };
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function supportProjection(item) {
  return { path: item.path, source: item.source, kind: item.kind,
    sizeBytes: item.bytes.length, sha256: handoverSha256(item.bytes) };
}

function publishSourceStaging(staging, target) {
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("SOURCE_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "raw"), path.join(target, "raw"));
    renameSync(path.join(staging, "source-support"), path.join(target, "source-support"));
    renameSync(path.join(staging, "archive-inventory.json"),
      path.join(target, "archive-inventory.json"));
    renameSync(path.join(staging, "acquisition-manifest.json"),
      path.join(target, "acquisition-manifest.json"));
    rmdirSync(staging);
  } catch { fail("SOURCE_TARGET_PUBLISH_INCOMPLETE", target); }
}

export async function acquirePinnedHandoverFailureSource(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_BROAD");
  ensurePrivateDirectory(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  const rangeCache = `${target}.range-cache`;
  ensurePrivateDirectory(rangeCache);
  const beforeRaw = await boundedRecordFetch(fetchImpl);
  const recordBefore = recordProjection(beforeRaw.value);
  const rawObjects = new Map();
  const transfers = [];
  for (const file of SELECTED_FILES) {
    const fetched = await strictRangeObject(file, fetchImpl, options.onProgress, rangeCache);
    rawObjects.set(file.key, fetched.bytes);
    transfers.push(fetched.transcript);
    writePrivate(path.join(staging, "raw", file.key), fetched.bytes);
  }
  const afterRaw = await boundedRecordFetch(fetchImpl);
  const recordAfter = recordProjection(afterRaw.value);
  if (!same(recordBefore, recordAfter)) fail("RECORD_CHANGED_DURING_ACQUISITION");
  const transferTranscript = { recordId: HANDOVER_RECORD_ID, strictHttps206: true,
    rangeChunkBytes: RANGE_CHUNK_BYTES, objects: transfers };
  const support = [
    { path: "source-support/record-before.json", source: RECORD_URL,
      kind: "OFFICIAL_RECORD_BEFORE", bytes: beforeRaw.bytes },
    { path: "source-support/record-after.json", source: RECORD_URL,
      kind: "OFFICIAL_RECORD_AFTER", bytes: afterRaw.bytes },
    { path: "source-support/range-transcript.json", source: RECORD_URL,
      kind: "STRICT_HTTPS_206_TRANSCRIPT", bytes: canonicalBytes(transferTranscript) },
  ];
  const sourceSupportObjects = support.map((item) => supportProjection(item))
    .sort((a, b) => a.path.localeCompare(b.path));
  for (const item of support) writePrivate(path.join(staging, ...item.path.split("/")), item.bytes);
  const inventory = inventoryFromBytes(rawObjects.get("sample_training_set.tar.gz"),
    rawObjects.get("training_labels.tar.gz"), rawObjects.get("class_names.json"));
  const inventoryBytes = canonicalBytes(inventory);
  writePrivate(path.join(staging, "archive-inventory.json"), inventoryBytes);
  const selectedObjects = SELECTED_FILES.map((file) => {
    const bytes = rawObjects.get(file.key);
    return { key: file.key, localPath: `raw/${file.key}`,
      source: `${RECORD_URL}/files/${encodeURIComponent(file.key)}/content`,
      sizeBytes: bytes.length, publisherMd5Claim: file.md5,
      recomputedMd5: handoverMd5(bytes), sha256: handoverSha256(bytes),
      strict206PartCount: transfers.find((item) => item.key === file.key).strict206PartCount };
  });
  const body = { schema: HANDOVER_SOURCE_SCHEMA, capturedAt: HANDOVER_FROZEN_AT,
    recordBefore, recordAfter, recordStableDuringAcquisition: true,
    completeRecordFileInventoryEnumerated: true, selectedObjects, sourceSupportObjects,
    transfer: { strictHttps206EstablishedForEverySelectedObject: true,
      transcriptPath: "source-support/range-transcript.json",
      transcriptSha256: handoverSha256(canonicalBytes(transferTranscript)) },
    archives: { completeSampleTarEnumerated: true, completeTrainingLabelTarEnumerated: true,
      gzipCrcAndISizeReplayed: true, inventoryHash: inventory.inventoryHash,
      inventoryFileSha256: handoverSha256(inventoryBytes) },
    selection: { boundedObjectCount: 4, selectedBytes: selectedObjects.reduce((sum, item) =>
      sum + item.sizeBytes, 0), fullDatasetPayloadDownloaded: false,
      boundedSampleTrialUnits: inventory.observations.sampleTrialCount,
      trainingPublisherLabelRows: inventory.observations.trainingLabelRows },
    rights: { publisherLicenseClaim: HANDOVER_LICENSE,
      legalAdjudicationPerformed: false, productionTrainingAuthorizedByOutsider: false },
    privacy: { datasheetRetained: true, rgbHumanImageryInSamplePossible: true,
      noPiiGuaranteed: false, networkProjectionAllowed: false },
    transportAttested: false };
  const manifest = { ...body,
    manifestHash: handoverDigest(body, `${HANDOVER_SOURCE_SCHEMA}/manifest`) };
  writePrivate(path.join(staging, "acquisition-manifest.json"), canonicalBytes(manifest));
  publishSourceStaging(staging, target);
  const verified = verifyHandoverFailureSourceDirectory(target);
  clearExactRangeCache(rangeCache);
  return verified;
}

function snapshotValue(target, stat, directory) {
  return { target, directory, dev: stat.dev, ino: stat.ino, mode: stat.mode,
    size: stat.size, mtimeNs: stat.mtimeNs, ctimeNs: stat.ctimeNs,
    entries: directory ? sorted(readdirSync(target)) : null };
}

function requireDirectory(directory, expectedEntries, snapshots) {
  const stat = lstatSync(directory, { bigint: true });
  if (stat.isSymbolicLink() || !stat.isDirectory() || Number(stat.mode & 0o777n) !== 0o700) {
    fail("SOURCE_DIRECTORY_UNSAFE", directory);
  }
  const entries = sorted(readdirSync(directory));
  if (!same(entries, sorted(expectedEntries))) fail("SOURCE_DIRECTORY_LAYOUT_INVALID", directory);
  snapshots.push(snapshotValue(directory, stat, true));
}

function readPrivateStable(root, relative, snapshots, expected = null,
  maximumBytes = MAX_SELECTED_BYTES) {
  const target = path.join(root, ...relative.split("/"));
  const relativeCheck = path.relative(root, target);
  if (relativeCheck === "" || relativeCheck === ".." || relativeCheck.startsWith(`..${path.sep}`)) {
    fail("SOURCE_PATH_ESCAPE", relative);
  }
  const before = lstatSync(target, { bigint: true });
  if (before.isSymbolicLink() || !before.isFile()
    || Number(before.mode & 0o777n) !== 0o600
    || before.size < 1n || before.size > BigInt(maximumBytes)) fail("SOURCE_FILE_UNSAFE", relative);
  const descriptor = openSync(target, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  let bytes;
  try {
    const descriptorBefore = fstatSync(descriptor, { bigint: true });
    if (descriptorBefore.dev !== before.dev || descriptorBefore.ino !== before.ino
      || descriptorBefore.size !== before.size || descriptorBefore.mode !== before.mode) {
      fail("SOURCE_FILE_RACE", relative);
    }
    bytes = readFileSync(descriptor);
    const descriptorAfter = fstatSync(descriptor, { bigint: true });
    if (descriptorAfter.dev !== descriptorBefore.dev || descriptorAfter.ino !== descriptorBefore.ino
      || descriptorAfter.size !== descriptorBefore.size || descriptorAfter.mode !== descriptorBefore.mode
      || descriptorAfter.mtimeNs !== descriptorBefore.mtimeNs
      || descriptorAfter.ctimeNs !== descriptorBefore.ctimeNs) fail("SOURCE_FILE_CHANGED", relative);
  } finally { closeSync(descriptor); }
  const after = lstatSync(target, { bigint: true });
  if (after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
    || after.mode !== before.mode || after.mtimeNs !== before.mtimeNs
    || after.ctimeNs !== before.ctimeNs) fail("SOURCE_PATH_CHANGED", relative);
  if (expected && (expected.sizeBytes !== bytes.length
    || expected.sha256 !== handoverSha256(bytes))) fail("SOURCE_FILE_BINDING_INVALID", relative);
  snapshots.push(snapshotValue(target, after, false));
  return bytes;
}

function recheckSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    const after = lstatSync(snapshot.target, { bigint: true });
    if (after.isSymbolicLink() || snapshot.directory && !after.isDirectory()
      || !snapshot.directory && !after.isFile() || after.dev !== snapshot.dev
      || after.ino !== snapshot.ino || after.mode !== snapshot.mode || after.size !== snapshot.size
      || after.mtimeNs !== snapshot.mtimeNs || after.ctimeNs !== snapshot.ctimeNs
      || snapshot.directory && !same(sorted(readdirSync(snapshot.target)), snapshot.entries)) {
      fail("SOURCE_SNAPSHOT_CHANGED", snapshot.target);
    }
  }
}

function validateTranscriptPart(part, file) {
  return exactObject(part) && Number.isSafeInteger(part.start) && Number.isSafeInteger(part.end)
    && part.start >= 0 && part.end >= part.start && part.end < file.sizeBytes
    && part.sizeBytes === part.end - part.start + 1 && part.sizeBytes <= RANGE_CHUNK_BYTES
    && part.contentRange === `bytes ${part.start}-${part.end}/${file.sizeBytes}`
    && HASH.test(part.sha256 ?? "");
}

function validateManifest(manifest) {
  if (!exactObject(manifest)) fail("MANIFEST_INVALID");
  const { manifestHash, ...body } = manifest;
  if (manifest.schema !== HANDOVER_SOURCE_SCHEMA || manifest.capturedAt !== HANDOVER_FROZEN_AT
    || manifestHash !== handoverDigest(body, `${HANDOVER_SOURCE_SCHEMA}/manifest`)
    || !same(manifest.recordBefore, manifest.recordAfter)
    || manifest.recordStableDuringAcquisition !== true
    || manifest.completeRecordFileInventoryEnumerated !== true
    || manifest.transfer?.strictHttps206EstablishedForEverySelectedObject !== true
    || !HASH.test(manifest.transfer?.transcriptSha256 ?? "")
    || manifest.archives?.completeSampleTarEnumerated !== true
    || manifest.archives?.completeTrainingLabelTarEnumerated !== true
    || manifest.archives?.gzipCrcAndISizeReplayed !== true
    || !HASH.test(manifest.archives?.inventoryHash ?? "")
    || !HASH.test(manifest.archives?.inventoryFileSha256 ?? "")
    || manifest.selection?.boundedObjectCount !== 4
    || manifest.selection?.fullDatasetPayloadDownloaded !== false
    || manifest.rights?.publisherLicenseClaim !== HANDOVER_LICENSE
    || manifest.rights?.legalAdjudicationPerformed !== false
    || manifest.rights?.productionTrainingAuthorizedByOutsider !== false
    || manifest.privacy?.datasheetRetained !== true
    || manifest.privacy?.noPiiGuaranteed !== false
    || manifest.privacy?.networkProjectionAllowed !== false
    || manifest.transportAttested !== false) fail("MANIFEST_BOUNDARY_INVALID");
  if (!Array.isArray(manifest.selectedObjects) || manifest.selectedObjects.length !== 4
    || !same(manifest.selectedObjects.map((item) => item.key), SELECTED_FILES.map((item) => item.key))
    || !Array.isArray(manifest.sourceSupportObjects)
    || manifest.sourceSupportObjects.length !== 3) fail("MANIFEST_OBJECT_SET_INVALID");
  for (const selected of manifest.selectedObjects) {
    const expected = SELECTED_FILES.find((item) => item.key === selected.key);
    if (!expected || selected.localPath !== `raw/${expected.key}`
      || selected.source !== `${RECORD_URL}/files/${encodeURIComponent(expected.key)}/content`
      || selected.sizeBytes !== expected.sizeBytes
      || selected.publisherMd5Claim !== expected.md5 || selected.recomputedMd5 !== expected.md5
      || !HASH.test(selected.sha256 ?? "") || !Number.isInteger(selected.strict206PartCount)
      || selected.strict206PartCount < 1) fail("MANIFEST_SELECTED_OBJECT_INVALID", selected.key);
  }
  for (const support of manifest.sourceSupportObjects) {
    if (!/^source-support\/(record-before|record-after|range-transcript)\.json$/u
      .test(support.path ?? "") || support.source !== RECORD_URL
      || !Number.isSafeInteger(support.sizeBytes) || support.sizeBytes < 1
      || !HASH.test(support.sha256 ?? "")) fail("MANIFEST_SUPPORT_OBJECT_INVALID");
  }
  return manifest;
}

export function verifyHandoverFailureSourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const snapshots = [];
  requireDirectory(root,
    ["acquisition-manifest.json", "archive-inventory.json", "raw", "source-support"], snapshots);
  const manifestBytes = readPrivateStable(root, "acquisition-manifest.json", snapshots,
    null, 4 * 1024 * 1024);
  const manifest = validateManifest(parseJson(manifestBytes, "MANIFEST_JSON_INVALID"));
  requireDirectory(path.join(root, "raw"), SELECTED_FILES.map((item) => item.key), snapshots);
  requireDirectory(path.join(root, "source-support"),
    manifest.sourceSupportObjects.map((item) => path.posix.basename(item.path)), snapshots);
  const raw = new Map();
  for (const selected of manifest.selectedObjects) {
    const bytes = readPrivateStable(root, selected.localPath, snapshots, selected);
    if (handoverMd5(bytes) !== selected.publisherMd5Claim) {
      fail("SOURCE_SELECTED_MD5_INVALID", selected.key);
    }
    raw.set(selected.key, bytes);
  }
  const support = new Map();
  for (const entry of manifest.sourceSupportObjects) {
    support.set(entry.path, readPrivateStable(root, entry.path, snapshots, entry,
      4 * 1024 * 1024));
  }
  if (!same(recordProjection(parseJson(support.get("source-support/record-before.json"),
    "RECORD_BEFORE_JSON_INVALID")), manifest.recordBefore)
    || !same(recordProjection(parseJson(support.get("source-support/record-after.json"),
      "RECORD_AFTER_JSON_INVALID")), manifest.recordAfter)) fail("SOURCE_RECORD_REPLAY_INVALID");
  const transcriptBytes = support.get("source-support/range-transcript.json");
  if (handoverSha256(transcriptBytes) !== manifest.transfer.transcriptSha256) {
    fail("SOURCE_TRANSCRIPT_HASH_INVALID");
  }
  const transcript = parseJson(transcriptBytes, "TRANSCRIPT_JSON_INVALID");
  if (transcript.recordId !== HANDOVER_RECORD_ID || transcript.strictHttps206 !== true
    || transcript.rangeChunkBytes !== RANGE_CHUNK_BYTES || !Array.isArray(transcript.objects)
    || transcript.objects.length !== 4) fail("TRANSCRIPT_PROFILE_INVALID");
  for (const object of transcript.objects) {
    const file = SELECTED_FILES.find((item) => item.key === object.key);
    const selected = manifest.selectedObjects.find((item) => item.key === object.key);
    if (!file || !selected || object.url !== selected.source
      || object.sizeBytes !== file.sizeBytes || object.publisherMd5Claim !== file.md5
      || object.recomputedMd5 !== file.md5 || object.sha256 !== selected.sha256
      || object.strict206PartCount !== object.parts?.length
      || object.strict206PartCount !== selected.strict206PartCount) fail("TRANSCRIPT_OBJECT_INVALID");
    let cursor = 0;
    const objectBytes = raw.get(object.key);
    for (const part of object.parts) {
      if (!validateTranscriptPart(part, file) || part.start !== cursor
        || handoverSha256(objectBytes.subarray(part.start, part.end + 1)) !== part.sha256) {
        fail("TRANSCRIPT_PART_INVALID", object.key);
      }
      cursor = part.end + 1;
    }
    if (cursor !== file.sizeBytes) fail("TRANSCRIPT_COVERAGE_INVALID", object.key);
  }
  const rebuiltInventory = inventoryFromBytes(raw.get("sample_training_set.tar.gz"),
    raw.get("training_labels.tar.gz"), raw.get("class_names.json"));
  const inventoryBytes = readPrivateStable(root, "archive-inventory.json", snapshots,
    { sizeBytes: Number(lstatSync(path.join(root, "archive-inventory.json")).size),
      sha256: manifest.archives.inventoryFileSha256 }, 16 * 1024 * 1024);
  const inventory = parseJson(inventoryBytes, "INVENTORY_JSON_INVALID");
  if (!same(inventory, rebuiltInventory)
    || inventory.inventoryHash !== manifest.archives.inventoryHash) fail("INVENTORY_REPLAY_INVALID");
  recheckSnapshots(snapshots);
  const rootObjects = ["archive-inventory.json",
    ...manifest.selectedObjects.map((item) => item.localPath),
    ...manifest.sourceSupportObjects.map((item) => item.path)].map((relative) => {
    const bytes = relative === "archive-inventory.json" ? inventoryBytes
      : raw.get(relative.replace(/^raw\//u, "")) ?? support.get(relative);
    return { path: relative, sizeBytes: bytes.length, sha256: handoverSha256(bytes) };
  }).sort((a, b) => a.path.localeCompare(b.path));
  return Object.freeze({ ok: true, verificationLevel: "FULL_BOUNDED_SOURCE_REPLAY",
    sourceDirectory: root, manifest, inventory,
    manifestFileSha256: handoverSha256(manifestBytes),
    sourceRoot: handoverDigest(rootObjects, `${HANDOVER_SOURCE_SCHEMA}/source-root`) });
}

function privacyFromDatasheet() {
  return { source: "datasheet.pdf", extractionMethod: "MANUAL_PAGE_REVIEW_OF_PINNED_PDF",
    reviewedPages: [2, 3, 4], participantsPublisherClaim: 17,
    rgbFacesVisibleAndPotentiallyIdentifiable: true,
    publisherClaimsNoOtherIdentifyingInformation: true,
    participantsDirectlyCollectedFrom: true, participantsNotified: true,
    participantConsentPublisherClaim: true, futureRevocationMechanismOffered: true,
    deletionOfAllPublicCopiesGuaranteedAfterRevocation: false,
    ethicalReviewConductedPublisherClaim: false,
    dataSubjectImpactAnalysisConductedPublisherClaim: false,
    participantPopulation: "ROBOTICS_STUDENTS_AND_RESEARCHERS",
    participantCompensationPublisherClaim: "NONE", noPiiGuaranteed: false,
    networkProjectionAllowed: false };
}

export function buildHandoverFailureReportFromSource(sourceDirectory) {
  const checked = verifyHandoverFailureSourceDirectory(sourceDirectory);
  const observations = checked.inventory.observations;
  const publisherOutcomeUnits = observations.publisherSampleOutcomeLabelUnits;
  const body = { schema: HANDOVER_REPORT_SCHEMA, capturedAt: HANDOVER_FROZEN_AT,
    source: { recordId: HANDOVER_RECORD_ID, revision: 6, doi: HANDOVER_DOI,
      manifestHash: checked.manifest.manifestHash,
      manifestFileSha256: checked.manifestFileSha256, sourceRoot: checked.sourceRoot,
      verificationLevel: checked.verificationLevel, selectedObjects: 4,
      selectedBytes: checked.manifest.selection.selectedBytes,
      fullDatasetPayloadDownloaded: false, strictHttps206Replayed: true },
    denominators: {
      officialRecordFileInventory: { class: "ZENODO_RECORD_FILE_METADATA_ENTRY", units: 10,
        completeMetadataInventory: true, payloadUnitsDownloaded: 4 },
      boundedSampleTrials: { class: "PUBLISHER_PREPARED_HRI_SAMPLE_TRIAL", units: 2,
        exactTrainingLabelJoinUnits: publisherOutcomeUnits,
        fullSampleArchiveReplayed: true },
      trainingPublisherLabels: { class: "PUBLISHER_HRI_OUTCOME_LABEL_ROW",
        units: observations.trainingLabelRows, completeTrainingLabelArchiveReplayed: true },
      fullDatasetPublisherClaim: { class: "PUBLISHER_DATASET_TRIAL_METADATA",
        units: 589, robotToHumanUnits: 297, humanToRobotUnits: 292,
        payloadReplayed: false, usedAsBoundedSampleDenominator: false },
      crossTotal: null,
    },
    observations,
    truthBoundary: { publisherPhysicalHriDatasetClaimPresent: true,
      boundedSampleBytesReplayed: true, exactSampleToTrainingLabelJoinEstablished:
        observations.exactSampleToTrainingLabelJoinEstablished,
      taskOutcomeEstablishedOnlyAsPublisherLabel: publisherOutcomeUnits === 2,
      independentOutcomeEstablished: false,
      humanParticipantInvolvementCountsAsIndependentWitness: false,
      physicalEffectIndependentlyReplayed: false,
      rawRosBagPresentInPublishedSample: false,
      opportunityOrAttemptCensusEstablished: false,
      censusReason: "INCORRECT_OR_INCOMPLETE_TRIALS_WERE_DISCARDED_DURING_COLLECTION",
      recoveryEstablished: false, longitudinalFollowupEstablished: false,
      delegationAuthorizationEstablished: false, affectedPartyOutcomeEstablished: false },
    segments: {
      opportunityCensus: { units: 0, established: false },
      delegationAuthorization: { units: 0, established: false },
      actionTrace: { governedUnits: 0, publisherPreparedFeatureTrialUnits: 2,
        sourceNativeAttributionOnly: true },
      effect: { units: 0, independentlyEstablished: false },
      outcome: { publisherLabelUnits: publisherOutcomeUnits, independentUnits: 0,
        sourceNativeAttributionOnly: true },
      recovery: { units: 0, established: false },
      longitudinal: { units: 0, established: false },
    },
    rights: { publisherLicenseClaim: HANDOVER_LICENSE,
      status: "ZENODO_CC_BY_4_0_PUBLISHER_CLAIM_PINNED",
      legalAdjudicationPerformed: false, redistributionAuthorizedByArtifact: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: privacyFromDatasheet(),
    quality: { publisherReportsSingleAnnotator: true,
      publisherReportsActionBoundaryAmbiguity: true,
      rawRosBagsIncludedInPublishedRecord: false,
      datasheetClaimsIncorrectOrIncompleteTrialsDiscarded: true },
    useBoundary: { status: "QUARANTINE_EVAL_ONLY", offlineEvaluationOnly: true,
      publicDeploymentReady: false, governedTrainingRows: 0,
      modelTrainingAuthorized: false },
    network: { networkAdmissionRows: 0, published: false, externalAnchorEstablished: false },
    economics: { CEU: 0, pricingUnits: 0, insuranceUnits: 0 },
    authority: { executionAuthorityEstablished: false, trainingAuthorityEstablished: false,
      delegationAuthorityEstablished: false, safetyAuthorityEstablished: false,
      authorityUnits: 0 },
  };
  return Object.freeze({ ...body,
    artifactHash: handoverDigest(body, `${HANDOVER_REPORT_SCHEMA}/artifact`) });
}

function assertReportBoundary(report) {
  if (!exactObject(report)) fail("REPORT_INVALID");
  const { artifactHash, ...body } = report;
  if (report.schema !== HANDOVER_REPORT_SCHEMA || report.capturedAt !== HANDOVER_FROZEN_AT
    || artifactHash !== handoverDigest(body, `${HANDOVER_REPORT_SCHEMA}/artifact`)
    || report.source?.recordId !== HANDOVER_RECORD_ID || report.source?.revision !== 6
    || report.source?.doi !== HANDOVER_DOI || report.source?.selectedObjects !== 4
    || report.source?.fullDatasetPayloadDownloaded !== false
    || report.source?.strictHttps206Replayed !== true
    || !HASH.test(report.source?.manifestHash ?? "")
    || !HASH.test(report.source?.manifestFileSha256 ?? "")
    || !HASH.test(report.source?.sourceRoot ?? "")) fail("REPORT_SOURCE_INVALID");
  if (report.denominators?.officialRecordFileInventory?.units !== 10
    || report.denominators?.boundedSampleTrials?.units !== 2
    || report.denominators?.boundedSampleTrials?.exactTrainingLabelJoinUnits !== 2
    || report.denominators?.trainingPublisherLabels?.units !== 337
    || report.denominators?.fullDatasetPublisherClaim?.units !== 589
    || report.denominators?.fullDatasetPublisherClaim?.robotToHumanUnits !== 297
    || report.denominators?.fullDatasetPublisherClaim?.humanToRobotUnits !== 292
    || report.denominators?.fullDatasetPublisherClaim?.payloadReplayed !== false
    || report.denominators?.crossTotal !== null) fail("REPORT_DENOMINATOR_INVALID");
  if (report.observations?.sampleTrialCount !== 2
    || report.observations?.trainingLabelRows !== 337
    || report.observations?.exactSampleToTrainingLabelJoinEstablished !== true
    || report.observations?.publisherSampleOutcomeLabelUnits !== 2
    || handoverDigest(report.observations,
      `${HANDOVER_REPORT_SCHEMA}/observations`) !== EXPECTED_OBSERVATIONS_HASH
    || !Array.isArray(report.observations?.sampleLabelJoins)
    || report.observations.sampleLabelJoins.length !== 2
    || report.observations.sampleLabelJoins.some((item) =>
      item.exactBasenameJoinEstablished !== true)) fail("REPORT_OBSERVATION_INVALID");
  if (report.truthBoundary?.taskOutcomeEstablishedOnlyAsPublisherLabel !== true
    || report.truthBoundary?.independentOutcomeEstablished !== false
    || report.truthBoundary?.humanParticipantInvolvementCountsAsIndependentWitness !== false
    || report.truthBoundary?.physicalEffectIndependentlyReplayed !== false
    || report.truthBoundary?.rawRosBagPresentInPublishedSample !== false
    || report.truthBoundary?.opportunityOrAttemptCensusEstablished !== false
    || report.truthBoundary?.recoveryEstablished !== false
    || report.truthBoundary?.longitudinalFollowupEstablished !== false
    || report.truthBoundary?.delegationAuthorizationEstablished !== false
    || report.segments?.opportunityCensus?.units !== 0
    || report.segments?.delegationAuthorization?.units !== 0
    || report.segments?.actionTrace?.governedUnits !== 0
    || report.segments?.effect?.units !== 0
    || report.segments?.outcome?.publisherLabelUnits !== 2
    || report.segments?.outcome?.independentUnits !== 0
    || report.segments?.recovery?.units !== 0
    || report.segments?.longitudinal?.units !== 0) fail("REPORT_TRUTH_BOUNDARY_INVALID");
  if (report.rights?.publisherLicenseClaim !== HANDOVER_LICENSE
    || report.rights?.legalAdjudicationPerformed !== false
    || report.rights?.redistributionAuthorizedByArtifact !== false
    || report.rights?.productionTrainingAuthorizedByOutsider !== false
    || report.privacy?.rgbFacesVisibleAndPotentiallyIdentifiable !== true
    || report.privacy?.participantConsentPublisherClaim !== true
    || report.privacy?.futureRevocationMechanismOffered !== true
    || report.privacy?.deletionOfAllPublicCopiesGuaranteedAfterRevocation !== false
    || report.privacy?.ethicalReviewConductedPublisherClaim !== false
    || report.privacy?.dataSubjectImpactAnalysisConductedPublisherClaim !== false
    || report.privacy?.noPiiGuaranteed !== false
    || report.privacy?.networkProjectionAllowed !== false
    || report.useBoundary?.status !== "QUARANTINE_EVAL_ONLY"
    || report.useBoundary?.governedTrainingRows !== 0
    || report.useBoundary?.modelTrainingAuthorized !== false
    || report.network?.networkAdmissionRows !== 0 || report.network?.published !== false
    || report.network?.externalAnchorEstablished !== false
    || report.economics?.CEU !== 0 || report.economics?.pricingUnits !== 0
    || report.economics?.insuranceUnits !== 0
    || report.authority?.executionAuthorityEstablished !== false
    || report.authority?.trainingAuthorityEstablished !== false
    || report.authority?.delegationAuthorityEstablished !== false
    || report.authority?.safetyAuthorityEstablished !== false
    || report.authority?.authorityUnits !== 0) fail("REPORT_AUTHORITY_BOUNDARY_INVALID");
  return report;
}

export function verifyHandoverFailureReport(report) {
  try { assertReportBoundary(report); return Object.freeze({ ok: true,
    verificationLevel: "SELF_SEALED_BOUNDARY_CHECK" }); }
  catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function verifyHandoverFailureReportWithSource(report, sourceDirectory) {
  try {
    assertReportBoundary(report);
    const rebuilt = buildHandoverFailureReportFromSource(sourceDirectory);
    if (!same(report, rebuilt)) fail("FULL_REPLAY_REPORT_MISMATCH");
    return Object.freeze({ ok: true, verificationLevel: "FULL_BOUNDED_SOURCE_REDERIVED",
      sourceRoot: rebuilt.source.sourceRoot });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function buildHandoverFailureReceipt(report, reportBytes) {
  assertReportBoundary(report);
  if (!Buffer.isBuffer(reportBytes) || !reportBytes.equals(canonicalBytes(report))) {
    fail("RECEIPT_REPORT_BYTES_INVALID");
  }
  const body = { schema: HANDOVER_RECEIPT_SCHEMA, capturedAt: HANDOVER_FROZEN_AT,
    reportSchema: HANDOVER_REPORT_SCHEMA, reportFileSha256: handoverSha256(reportBytes),
    artifactHash: report.artifactHash, sourceRoot: report.source.sourceRoot,
    manifestHash: report.source.manifestHash,
    summary: { boundedSampleTrials: 2, publisherOutcomeLabelUnits: 2,
      independentOutcomeUnits: 0, independentWitnessUnits: 0, recoveryUnits: 0,
      governedTrainingRows: 0, networkAdmissionRows: 0, CEU: 0,
      pricingUnits: 0, authorityUnits: 0 },
    verificationLevel: "FULL_BOUNDED_SOURCE_REDERIVED" };
  return Object.freeze({ ...body,
    receiptHash: handoverDigest(body, `${HANDOVER_RECEIPT_SCHEMA}/receipt`) });
}

export function verifyHandoverFailureReceipt(receipt, report, reportBytes) {
  try {
    if (!same(receipt, buildHandoverFailureReceipt(report, reportBytes))) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function publishHandoverFailureArtifactDirectory(stagingDirectory, targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (target === path.parse(target).root || existsSync(target)) {
    fail("PUBLISH_TARGET_EXISTS_OR_BROAD", target);
  }
  const stat = lstatSync(staging);
  if (stat.isSymbolicLink() || !stat.isDirectory()
    || !same(sorted(readdirSync(staging)), ["report.json", "run-receipt.json", "source"])) {
    fail("PUBLISH_STAGING_LAYOUT_INVALID");
  }
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("PUBLISH_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "source"), path.join(target, "source"));
    renameSync(path.join(staging, "report.json"), path.join(target, "report.json"));
    renameSync(path.join(staging, "run-receipt.json"), path.join(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch { fail("PUBLISH_INCOMPLETE", target); }
}

export function verifyHandoverFailureArtifactDirectory(artifactDirectory) {
  try {
    const root = path.resolve(artifactDirectory);
    const stat = lstatSync(root);
    if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o777) !== 0o700
      || !same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const readTop = (name) => {
      const target = path.join(root, name);
      const item = lstatSync(target);
      if (item.isSymbolicLink() || !item.isFile() || (item.mode & 0o777) !== 0o600) {
        fail("ARTIFACT_FILE_UNSAFE", name);
      }
      return readFileSync(target);
    };
    const reportBytes = readTop("report.json");
    const receiptBytes = readTop("run-receipt.json");
    const report = parseJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    const replay = verifyHandoverFailureReportWithSource(report, path.join(root, "source"));
    if (!replay.ok) fail("ARTIFACT_SOURCE_REPLAY_INVALID", replay.error);
    if (!verifyHandoverFailureReceipt(receipt, report, reportBytes).ok) {
      fail("ARTIFACT_RECEIPT_INVALID");
    }
    return Object.freeze({ ok: true, verificationLevel: replay.verificationLevel,
      boundedSampleTrials: 2, publisherOutcomeLabelUnits: 2,
      independentOutcomeUnits: 0, independentWitnessUnits: 0, recoveryUnits: 0,
      governedTrainingRows: 0, networkAdmissionRows: 0, CEU: 0,
      pricingUnits: 0, authorityUnits: 0 });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}
