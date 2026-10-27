/*
 * Bounded AIRLAB FAILURE / FINO-net real-robot evaluation intake.
 *
 * The 10.2 GB public ZIP is never downloaded.  The acquirer freezes its
 * complete ZIP64 central directory and strict-Range extracts one complete
 * same-action publisher-labeled pair: put_in/50 (label 0) and put_in/49
 * (label 1), including RGB, publisher timestamp text, depth, and audio.
 * Labels are publisher-native binary labels, not independent outcomes.  The
 * repository MIT license is not extended to the separately hosted dataset.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmdirSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "./canonical-historical-replay.js";

export const AIRLAB_REPOSITORY = "ardai/fino-net";
export const AIRLAB_REPOSITORY_COMMIT =
  "8196217bf52d17fdb7193e57619bd855b1723d4e";
export const AIRLAB_ARCHIVE_URL = "http://160.75.159.4/data/failure.zip";
export const AIRLAB_ARCHIVE_BYTES = 10_197_520_375;
export const AIRLAB_ARCHIVE_ETAG = '"25fd1cff7-5bb247e919470"';
export const AIRLAB_ARCHIVE_LAST_MODIFIED = "Fri, 12 Feb 2021 14:31:40 GMT";
export const AIRLAB_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const AIRLAB_SOURCE_SCHEMA = "outsider/airlab-failure-pinned-source/v1";
export const AIRLAB_INVENTORY_SCHEMA = "outsider/airlab-failure-zip-inventory/v1";
export const AIRLAB_REPORT_SCHEMA = "outsider/airlab-failure-bounded-pair/v1";
export const AIRLAB_RECEIPT_SCHEMA = "outsider/airlab-failure-run-receipt/v1";

const PROJECT_URL = "https://air.cs.itu.edu.tr/projects/finonet.html";
const GH_API = `https://api.github.com/repos/${AIRLAB_REPOSITORY}`;
const GH_COMMIT_URL = `${GH_API}/commits/${AIRLAB_REPOSITORY_COMMIT}`;
const GH_TREE_URL = `${GH_API}/git/trees/${AIRLAB_REPOSITORY_COMMIT}?recursive=1`;
const GH_RAW_ROOT = `https://raw.githubusercontent.com/${AIRLAB_REPOSITORY}/${
  AIRLAB_REPOSITORY_COMMIT}`;
const SUPPORT_BLOBS = Object.freeze([
  { remotePath: "LICENSE", gitBlobOid: "ef58f4b73f2bcf06d6fe75f29fdf854b17506011",
    sizeBytes: 1_070, localPath: "source-support/github-license.txt" },
  { remotePath: "README.md", gitBlobOid: "72063b9098e1d9c8732728f7c1a6e2b31bd42d22",
    sizeBytes: 3_143, localPath: "source-support/github-readme.md" },
  { remotePath: "annotation.zip",
    gitBlobOid: "0e2bf0fc16810d11ad29d41a66bcaf33359cdb08", sizeBytes: 1_121,
    localPath: "source-support/github-annotation.zip" },
  { remotePath: "src/finonet-rgb-d-a.ipynb",
    gitBlobOid: "37a45e144dd1870d455ff885a4cd87f50e1f3062", sizeBytes: 27_610,
    localPath: "source-support/github-fino-notebook.ipynb" },
]);
const ACTIONS = Object.freeze(["place", "pour", "push", "put_in", "put_on"]);
const SELECTED_ACTION = "put_in";
const SELECTED_RECORDINGS = Object.freeze([
  { recordingId: 49, publisherLabel: 1, publisherLabelMeaning: "FAILURE" },
  { recordingId: 50, publisherLabel: 0, publisherLabelMeaning: "SUCCESS" },
]);
const ARCHIVE_CENTRAL_OFFSET = 10_190_743_464;
const ARCHIVE_CENTRAL_BYTES = 6_776_813;
const ARCHIVE_ENTRIES = 53_165;
const ARCHIVE_ZIP64_EOCD_OFFSET = 10_197_520_277;
const ARCHIVE_EOCD_OFFSET = 10_197_520_353;
const TAIL_BYTES = 128 * 1024;
const RANGE_CHUNK_BYTES = 512 * 1024;
const RANGE_CONCURRENCY = 12;
const RANGE_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 120_000;
const MAX_DIRECT_BYTES = 8 * 1024 * 1024;
const MAX_CENTRAL_BYTES = 8 * 1024 * 1024;
const MAX_SELECTED_RANGE_BYTES = 64 * 1024 * 1024;
const MAX_RAW_OBJECT_BYTES = 8 * 1024 * 1024;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const ZIP64_EOCD = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP_DESCRIPTOR = 0x08074b50;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const SAFE_ARCHIVE_PATH = /^[A-Za-z0-9._/-]+$/u;

function fail(code, detail = null) {
  throw new Error(detail === null ? `AIRLAB_FAILURE_${code}`
    : `AIRLAB_FAILURE_${code}:${detail}`);
}

export function airlabSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function airlabDigest(value, domain = AIRLAB_REPORT_SCHEMA) {
  return airlabSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function readU64(bytes, offset, code) {
  if (offset < 0 || offset + 8 > bytes.length) fail(code);
  const value = bytes.readUInt32LE(offset)
    + bytes.readUInt32LE(offset + 4) * 0x1_0000_0000;
  if (!Number.isSafeInteger(value)) fail(code);
  return value;
}

function checkedUrl(value, kind) {
  const url = new URL(value);
  if (url.username !== "" || url.password !== "") fail("URL_CREDENTIALS_FORBIDDEN", value);
  if (kind === "ARCHIVE") {
    if (url.toString() !== AIRLAB_ARCHIVE_URL || url.protocol !== "http:"
      || url.hostname !== "160.75.159.4") fail("ARCHIVE_URL_INVALID", value);
  } else if (kind === "PROJECT") {
    if (url.toString() !== PROJECT_URL || url.protocol !== "https:") {
      fail("PROJECT_URL_INVALID", value);
    }
  } else if (kind === "GH_API") {
    if (url.protocol !== "https:" || url.hostname !== "api.github.com") {
      fail("GITHUB_API_URL_INVALID", value);
    }
  } else if (kind === "GH_RAW") {
    if (url.protocol !== "https:" || url.hostname !== "raw.githubusercontent.com") {
      fail("GITHUB_RAW_URL_INVALID", value);
    }
  } else fail("URL_KIND_INVALID", kind);
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
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
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

async function boundedDirectFetch(value, maximumBytes, kind, accept, fetchImpl) {
  const url = checkedUrl(value, kind);
  const response = await fetchImpl(url, {
    redirect: "error",
    headers: { accept, "accept-encoding": "identity",
      "user-agent": "outsider-airlab-failure/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status !== 200 || response.headers.get("content-encoding") !== null
    || new URL(response.url || url).origin !== url.origin) {
    fail(`FETCH_HTTP_${response.status}`, url.pathname);
  }
  return { bytes: await streamResponse(response, maximumBytes), headers: response.headers };
}

async function jsonFetch(value, maximumBytes, kind, fetchImpl) {
  const fetched = await boundedDirectFetch(value, maximumBytes, kind,
    "application/json", fetchImpl);
  try { return { ...fetched, value: JSON.parse(fetched.bytes.toString("utf8")) }; }
  catch { fail("FETCH_JSON_INVALID", value); }
}

function archiveHeadProjection(headers, status, responseUrl) {
  const projected = {
    status,
    responseUrl,
    contentLength: headers.get("content-length"),
    contentType: headers.get("content-type"),
    acceptRanges: headers.get("accept-ranges"),
    etag: headers.get("etag"),
    lastModified: headers.get("last-modified"),
    contentEncoding: headers.get("content-encoding"),
  };
  if (projected.status !== 200 || projected.responseUrl !== AIRLAB_ARCHIVE_URL
    || projected.contentLength !== String(AIRLAB_ARCHIVE_BYTES)
    || projected.acceptRanges !== "bytes" || projected.etag !== AIRLAB_ARCHIVE_ETAG
    || projected.lastModified !== AIRLAB_ARCHIVE_LAST_MODIFIED
    || projected.contentEncoding !== null
    || projected.contentType !== "application/zip") fail("ARCHIVE_HEAD_INVALID");
  return projected;
}

async function archiveHead(fetchImpl) {
  const url = checkedUrl(AIRLAB_ARCHIVE_URL, "ARCHIVE");
  const response = await fetchImpl(url, {
    method: "HEAD", redirect: "error",
    headers: { "accept-encoding": "identity", "user-agent": "outsider-airlab-failure/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.body) await response.body.cancel("HEAD body not consumed");
  return archiveHeadProjection(response.headers, response.status,
    new URL(response.url || url).toString());
}

function waitMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function strictRangePart(start, end, fetchImpl) {
  const url = checkedUrl(AIRLAB_ARCHIVE_URL, "ARCHIVE");
  const expected = end - start + 1;
  let lastError = null;
  for (let attempt = 0; attempt < RANGE_ATTEMPTS; attempt += 1) {
    let response = null;
    try {
      response = await fetchImpl(url, {
        redirect: "error",
        headers: { "accept-encoding": "identity", range: `bytes=${start}-${end}`,
          "user-agent": "outsider-airlab-failure/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const contentRange = response.headers.get("content-range");
      if (response.status !== 206
        || contentRange !== `bytes ${start}-${end}/${AIRLAB_ARCHIVE_BYTES}`
        || response.headers.get("content-length") !== String(expected)
        || response.headers.get("accept-ranges") !== "bytes"
        || response.headers.get("etag") !== AIRLAB_ARCHIVE_ETAG
        || response.headers.get("last-modified") !== AIRLAB_ARCHIVE_LAST_MODIFIED
        || response.headers.get("content-encoding") !== null
        || new URL(response.url || url).toString() !== AIRLAB_ARCHIVE_URL) {
        fail("STRICT_RANGE_UNSUPPORTED", `${response.status}:${contentRange}`);
      }
      const bytes = await streamResponse(response, expected, expected);
      return { bytes, start, end, sizeBytes: bytes.length, contentRange,
        etag: AIRLAB_ARCHIVE_ETAG, lastModified: AIRLAB_ARCHIVE_LAST_MODIFIED,
        sha256: airlabSha256(bytes) };
    } catch (error) {
      if (safeError(error).startsWith("AIRLAB_FAILURE_STRICT_RANGE_")) throw error;
      lastError = safeError(error);
      if (response?.body) {
        try { await response.body.cancel("bounded strict-range retry"); } catch { /* no-op */ }
      }
      if (attempt === RANGE_ATTEMPTS - 1) {
        fail("RANGE_FETCH_FAILED", `${start}-${end}:${lastError}`);
      }
      await waitMilliseconds(Math.min(4_000, 500 * (2 ** attempt)));
    }
  }
  fail("RANGE_FETCH_FAILED", `${start}-${end}:${lastError}`);
}

async function strictRangeFetch(start, end, maximumBytes, fetchImpl) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0
    || end < start || end >= AIRLAB_ARCHIVE_BYTES
    || end - start + 1 > maximumBytes) fail("RANGE_INVALID", `${start}-${end}`);
  const plans = [];
  for (let cursor = start; cursor <= end;) {
    const chunkEnd = Math.min(end, cursor + RANGE_CHUNK_BYTES - 1);
    plans.push({ start: cursor, end: chunkEnd });
    cursor = chunkEnd + 1;
  }
  const chunks = new Array(plans.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(RANGE_CONCURRENCY, plans.length) },
    async () => {
      for (;;) {
        const index = next;
        next += 1;
        if (index >= plans.length) return;
        chunks[index] = await strictRangePart(plans[index].start, plans[index].end, fetchImpl);
      }
    });
  const settled = await Promise.allSettled(workers);
  const rejected = settled.find((result) => result.status === "rejected");
  if (rejected) throw rejected.reason;
  const bytes = Buffer.concat(chunks.map((item) => item.bytes), end - start + 1);
  return { bytes, start, end, sizeBytes: bytes.length,
    contentRange: chunks.length === 1 ? chunks[0].contentRange : "STRICT_206_CHUNK_SET",
    chunks: chunks.map(({ start: chunkStart, end: chunkEnd, sizeBytes, contentRange,
      etag, lastModified, sha256 }) => ({ start: chunkStart, end: chunkEnd,
      sizeBytes, contentRange, etag, lastModified, sha256 })), sha256: airlabSha256(bytes) };
}

function rangeProjection(fetched) {
  return { start: fetched.start, end: fetched.end,
    contentRange: fetched.contentRange, chunks: fetched.chunks };
}

function safeArchiveName(value) {
  if (typeof value !== "string" || value.length < 1 || value.startsWith("/")
    || value.includes("\\") || !SAFE_ARCHIVE_PATH.test(value)
    || value.split("/").some((part, index, pieces) => part === "." || part === ".."
      || part === "" && index !== pieces.length - 1)) fail("ZIP_PATH_UNSAFE", value);
  return value;
}

function parseZip64Extra(extra, saturated, code) {
  let offset = 0;
  let zip64 = null;
  while (offset < extra.length) {
    if (offset + 4 > extra.length) fail(`${code}_EXTRA_TRUNCATED`);
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > extra.length) fail(`${code}_EXTRA_TRUNCATED`);
    if (id === 1) {
      const data = extra.subarray(offset, offset + size);
      let cursor = 0;
      zip64 = {};
      const take = (name) => {
        zip64[name] = readU64(data, cursor, `${code}_ZIP64_INVALID`);
        cursor += 8;
      };
      if (saturated.uncompressed) take("uncompressedSize");
      if (saturated.compressed) take("compressedSize");
      if (saturated.localOffset) take("localHeaderOffset");
      if (saturated.disk) {
        if (cursor + 4 > data.length) fail(`${code}_ZIP64_INVALID`);
        zip64.diskStart = data.readUInt32LE(cursor);
      }
    }
    offset += size;
  }
  return zip64;
}

export function parseAirlabCentralDirectory(bytes, expectedEntries = ARCHIVE_ENTRIES) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 46) fail("CENTRAL_INVALID");
  const entries = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== ZIP_CENTRAL) {
      fail("CENTRAL_HEADER_INVALID", String(offset));
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const compressionMethod = bytes.readUInt16LE(offset + 10);
    const crc32 = bytes.readUInt32LE(offset + 16).toString(16).padStart(8, "0");
    const compressed32 = bytes.readUInt32LE(offset + 20);
    const uncompressed32 = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const disk16 = bytes.readUInt16LE(offset + 34);
    const local32 = bytes.readUInt32LE(offset + 42);
    const finish = offset + 46 + nameLength + extraLength + commentLength;
    if (finish > bytes.length || ![0, 8].includes(compressionMethod)
      || (flags & 1) !== 0) fail("CENTRAL_ENTRY_INVALID", String(offset));
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    if ((flags & 0x0800) === 0 && nameBytes.some((byte) => byte > 0x7f)) {
      fail("CENTRAL_NON_UTF8_UNSUPPORTED", String(offset));
    }
    const entryPath = safeArchiveName(nameBytes.toString("utf8"));
    const extra = bytes.subarray(offset + 46 + nameLength,
      offset + 46 + nameLength + extraLength);
    const saturated = { uncompressed: uncompressed32 === 0xffffffff,
      compressed: compressed32 === 0xffffffff, localOffset: local32 === 0xffffffff,
      disk: disk16 === 0xffff };
    const zip64 = parseZip64Extra(extra, saturated, "CENTRAL");
    const compressedSize = saturated.compressed ? zip64?.compressedSize : compressed32;
    const uncompressedSize = saturated.uncompressed ? zip64?.uncompressedSize : uncompressed32;
    const localHeaderOffset = saturated.localOffset ? zip64?.localHeaderOffset : local32;
    const diskStart = saturated.disk ? zip64?.diskStart : disk16;
    if (![compressedSize, uncompressedSize, localHeaderOffset, diskStart]
      .every(Number.isSafeInteger) || diskStart !== 0) fail("CENTRAL_ZIP64_INVALID", entryPath);
    entries.push({ path: entryPath, directory: entryPath.endsWith("/"), flags,
      compressionMethod, crc32, compressedSize, uncompressedSize, localHeaderOffset,
      centralHeaderOffset: offset, centralHeaderBytes: finish - offset });
    offset = finish;
  }
  if (entries.length !== expectedEntries
    || new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("CENTRAL_COUNT_OR_DUPLICATE_INVALID", String(entries.length));
  }
  return entries;
}

function parseArchiveTail(tail, absoluteStart) {
  let relative = -1;
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) === ZIP_EOCD
      && offset + 22 + tail.readUInt16LE(offset + 20) === tail.length) {
      relative = offset;
      break;
    }
  }
  if (relative < 20 || absoluteStart + relative !== ARCHIVE_EOCD_OFFSET
    || tail.readUInt16LE(relative + 4) !== 0 || tail.readUInt16LE(relative + 6) !== 0
    || ![ARCHIVE_ENTRIES, 0xffff].includes(tail.readUInt16LE(relative + 8))
    || ![ARCHIVE_ENTRIES, 0xffff].includes(tail.readUInt16LE(relative + 10))
    || ![ARCHIVE_CENTRAL_BYTES, 0xffffffff].includes(tail.readUInt32LE(relative + 12))
    || tail.readUInt32LE(relative + 16) !== 0xffffffff
    || tail.readUInt16LE(relative + 20) !== 0) fail("EOCD_INVALID");
  const locator = relative - 20;
  if (tail.readUInt32LE(locator) !== ZIP64_LOCATOR
    || tail.readUInt32LE(locator + 4) !== 0 || tail.readUInt32LE(locator + 16) !== 1) {
    fail("ZIP64_LOCATOR_INVALID");
  }
  const zip64Offset = readU64(tail, locator + 8, "ZIP64_OFFSET_INVALID");
  const zip64Relative = zip64Offset - absoluteStart;
  if (zip64Offset !== ARCHIVE_ZIP64_EOCD_OFFSET || zip64Relative < 0
    || zip64Relative + 56 > tail.length
    || tail.readUInt32LE(zip64Relative) !== ZIP64_EOCD
    || readU64(tail, zip64Relative + 4, "ZIP64_SIZE_INVALID") !== 44
    || tail.readUInt32LE(zip64Relative + 16) !== 0
    || tail.readUInt32LE(zip64Relative + 20) !== 0
    || readU64(tail, zip64Relative + 24, "ZIP64_COUNT_INVALID") !== ARCHIVE_ENTRIES
    || readU64(tail, zip64Relative + 32, "ZIP64_COUNT_INVALID") !== ARCHIVE_ENTRIES
    || readU64(tail, zip64Relative + 40, "ZIP64_CENTRAL_INVALID") !== ARCHIVE_CENTRAL_BYTES
    || readU64(tail, zip64Relative + 48, "ZIP64_CENTRAL_INVALID")
      !== ARCHIVE_CENTRAL_OFFSET) fail("ZIP64_RECORD_INVALID");
  return { zip64: true, eocdOffset: ARCHIVE_EOCD_OFFSET,
    zip64EocdOffset: ARCHIVE_ZIP64_EOCD_OFFSET,
    centralDirectoryOffset: ARCHIVE_CENTRAL_OFFSET,
    centralDirectoryBytes: ARCHIVE_CENTRAL_BYTES,
    centralDirectoryEntries: ARCHIVE_ENTRIES, archiveCommentBytes: 0 };
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

function decompressEntry(compressed, entry) {
  let raw;
  try {
    raw = entry.compressionMethod === 0 ? Buffer.from(compressed)
      : inflateRawSync(compressed, { maxOutputLength: Math.min(MAX_RAW_OBJECT_BYTES,
        entry.uncompressedSize) });
  } catch (error) { fail("ENTRY_DEFLATE_INVALID", `${entry.path}:${safeError(error)}`); }
  if (raw.length !== entry.uncompressedSize || crc32Hex(raw) !== entry.crc32) {
    fail("ENTRY_SIZE_OR_CRC_INVALID", entry.path);
  }
  return raw;
}

function parseLocalRecord(record, entry) {
  if (!Buffer.isBuffer(record) || record.length < 30 || record.readUInt32LE(0) !== ZIP_LOCAL) {
    fail("LOCAL_HEADER_INVALID", entry.path);
  }
  const flags = record.readUInt16LE(6);
  const method = record.readUInt16LE(8);
  const localCrc = record.readUInt32LE(14).toString(16).padStart(8, "0");
  const localCompressed = record.readUInt32LE(18);
  const localUncompressed = record.readUInt32LE(22);
  const nameLength = record.readUInt16LE(26);
  const extraLength = record.readUInt16LE(28);
  const headerBytes = 30 + nameLength + extraLength;
  if (headerBytes > record.length
    || record.subarray(30, 30 + nameLength).toString("utf8") !== entry.path
    || flags !== entry.flags || method !== entry.compressionMethod || (flags & 1) !== 0) {
    fail("LOCAL_CENTRAL_MISMATCH", entry.path);
  }
  const descriptorPresent = (flags & 8) !== 0;
  const compressedEnd = headerBytes + entry.compressedSize;
  if (compressedEnd > record.length) fail("LOCAL_RECORD_TRUNCATED", entry.path);
  if (!descriptorPresent && (localCrc !== entry.crc32
    || localCompressed !== entry.compressedSize
    || localUncompressed !== entry.uncompressedSize
    || record.length !== compressedEnd)) fail("LOCAL_VALUE_MISMATCH", entry.path);
  let descriptor = { present: false, signaturePresent: false, bytes: 0 };
  if (descriptorPresent) {
    let offset = compressedEnd;
    let signaturePresent = false;
    if (record.length >= offset + 4 && record.readUInt32LE(offset) === ZIP_DESCRIPTOR) {
      signaturePresent = true;
      offset += 4;
    }
    const zip64 = entry.compressedSize > 0xffffffff || entry.uncompressedSize > 0xffffffff;
    const required = offset + 4 + (zip64 ? 16 : 8);
    if (record.length !== required) fail("DESCRIPTOR_LENGTH_INVALID", entry.path);
    const crc = record.readUInt32LE(offset).toString(16).padStart(8, "0");
    offset += 4;
    const compressedSize = zip64 ? readU64(record, offset, "DESCRIPTOR_SIZE_INVALID")
      : record.readUInt32LE(offset);
    offset += zip64 ? 8 : 4;
    const uncompressedSize = zip64 ? readU64(record, offset, "DESCRIPTOR_SIZE_INVALID")
      : record.readUInt32LE(offset);
    if (crc !== entry.crc32 || compressedSize !== entry.compressedSize
      || uncompressedSize !== entry.uncompressedSize) fail("DESCRIPTOR_VALUE_INVALID", entry.path);
    descriptor = { present: true, signaturePresent, bytes: required - compressedEnd };
  }
  const compressed = record.subarray(headerBytes, compressedEnd);
  return { raw: decompressEntry(compressed, entry), compressed,
    headerBytes, descriptor, localRecordBytes: record.length };
}

function parseClassicZip(bytes) {
  let eocd = -1;
  for (let offset = bytes.length - 22; offset >= 0; offset -= 1) {
    if (bytes.readUInt32LE(offset) === ZIP_EOCD
      && offset + 22 + bytes.readUInt16LE(offset + 20) === bytes.length) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0 || bytes.readUInt16LE(eocd + 4) !== 0
    || bytes.readUInt16LE(eocd + 6) !== 0) fail("ANNOTATION_ZIP_EOCD_INVALID");
  const count = bytes.readUInt16LE(eocd + 10);
  const centralBytes = bytes.readUInt32LE(eocd + 12);
  const centralOffset = bytes.readUInt32LE(eocd + 16);
  if (centralOffset + centralBytes !== eocd) fail("ANNOTATION_ZIP_GEOMETRY_INVALID");
  const entries = parseAirlabCentralDirectory(bytes.subarray(centralOffset, eocd), count);
  const result = new Map();
  const ordered = [...entries].sort((left, right) => left.localHeaderOffset - right.localHeaderOffset);
  for (let index = 0; index < ordered.length; index += 1) {
    const entry = ordered[index];
    const next = index + 1 < ordered.length ? ordered[index + 1].localHeaderOffset : centralOffset;
    const parsed = parseLocalRecord(bytes.subarray(entry.localHeaderOffset, next), entry);
    result.set(entry.path, parsed.raw);
  }
  return result;
}

function parseAnnotations(bytes, notebookBytes) {
  const files = parseClassicZip(bytes);
  const expectedPaths = ACTIONS.map((action) => `${action}_annotation.txt`);
  if (!same(sorted(files.keys()), sorted(expectedPaths))) fail("ANNOTATION_PATH_SET_INVALID");
  const rows = [];
  const byAction = {};
  for (const action of ACTIONS) {
    const text = files.get(`${action}_annotation.txt`).toString("utf8");
    const lines = text.trim().split(/\r?\n/u);
    if (lines[0] !== "name,label") fail("ANNOTATION_HEADER_INVALID", action);
    const actionRows = lines.slice(1).map((line) => {
      const match = /^(\d+),([01])$/u.exec(line);
      if (!match) fail("ANNOTATION_ROW_INVALID", `${action}:${line}`);
      return { action, recordingId: Number(match[1]), publisherLabel: Number(match[2]) };
    });
    if (new Set(actionRows.map((row) => row.recordingId)).size !== actionRows.length) {
      fail("ANNOTATION_DUPLICATE_ID", action);
    }
    byAction[action] = actionRows;
    rows.push(...actionRows);
  }
  const counts = Object.fromEntries(ACTIONS.map((action) => {
    const actionRows = byAction[action];
    return [action, { rows: actionRows.length,
      publisherSuccessLabel0: actionRows.filter((row) => row.publisherLabel === 0).length,
      publisherFailureLabel1: actionRows.filter((row) => row.publisherLabel === 1).length }];
  }));
  const expected = { place: { rows: 47, publisherSuccessLabel0: 14,
    publisherFailureLabel1: 33 }, pour: { rows: 67, publisherSuccessLabel0: 25,
    publisherFailureLabel1: 42 }, push: { rows: 32, publisherSuccessLabel0: 12,
    publisherFailureLabel1: 20 }, put_in: { rows: 56, publisherSuccessLabel0: 23,
    publisherFailureLabel1: 33 }, put_on: { rows: 50, publisherSuccessLabel0: 15,
    publisherFailureLabel1: 35 } };
  const notebook = notebookBytes.toString("utf8");
  if (!same(counts, expected) || rows.length !== 252
    || byAction.put_in.find((row) => row.recordingId === 49)?.publisherLabel !== 1
    || byAction.put_in.find((row) => row.recordingId === 50)?.publisherLabel !== 0
    || !/bag_label[^\n]{0,100}== 0/u.test(notebook)
    || !/bag_label[^\n]{0,100}== 1/u.test(notebook)
    || !/\[\\"start\\"\]/u.test(notebook)) fail("ANNOTATION_SEMANTICS_INVALID");
  return { rows, byAction, counts, totalRows: rows.length,
    columns: ["name", "label"], failureStartColumnPresent: false,
    pinnedNotebookExpectsFailureStartColumn: true,
    labelMeaning: { "0": "SUCCESS", "1": "FAILURE" } };
}

function matchesSelectedFile(entryPath) {
  return /^failnet_dataset\/rgb_imgs\/put_in\/(?:49|50)\/frame\d{6}\.(?:png|txt)$/u
    .test(entryPath)
    || /^failnet_dataset\/depth_imgs\/put_in\/(?:49|50)\/frame\d{6}\.tiff$/u
      .test(entryPath)
    || /^failnet_dataset\/audio\/put_in\/(?:49|50)\.wav$/u.test(entryPath);
}

function recordingCoverage(entries, annotations) {
  const records = new Map();
  const get = (action, id) => {
    const key = `${action}/${id}`;
    if (!records.has(key)) records.set(key, { action, recordingId: Number(id),
      rgb: new Set(), timestamps: new Set(), depth: new Set(), audio: 0 });
    return records.get(key);
  };
  for (const entry of entries.filter((item) => !item.directory)) {
    let match = /^failnet_dataset\/rgb_imgs\/(place|pour|push|put_in|put_on)\/(\d+)\/frame(\d{6})\.(png|txt)$/u
      .exec(entry.path);
    if (match) {
      get(match[1], match[2])[match[4] === "png" ? "rgb" : "timestamps"].add(match[3]);
      continue;
    }
    match = /^failnet_dataset\/depth_imgs\/(place|pour|push|put_in|put_on)\/(\d+)\/frame(\d{6})\.tiff$/u
      .exec(entry.path);
    if (match) { get(match[1], match[2]).depth.add(match[3]); continue; }
    match = /^failnet_dataset\/audio\/(place|pour|push|put_in|put_on)\/(\d+)\.wav$/u
      .exec(entry.path);
    if (match) { get(match[1], match[2]).audio += 1; continue; }
    fail("ARCHIVE_FILE_LAYOUT_UNKNOWN", entry.path);
  }
  const summaries = {};
  for (const action of ACTIONS) {
    const annotationMap = new Map(annotations.byAction[action]
      .map((row) => [row.recordingId, row.publisherLabel]));
    const actionRecords = [...records.values()].filter((record) => record.action === action);
    const complete = actionRecords.filter((record) => same(sorted(record.rgb),
      sorted(record.timestamps)) && same(sorted(record.rgb), sorted(record.depth))
      && record.rgb.size > 0 && record.audio === 1 && annotationMap.has(record.recordingId));
    summaries[action] = { rgbRecordings: actionRecords.filter((r) => r.rgb.size > 0).length,
      depthRecordings: actionRecords.filter((r) => r.depth.size > 0).length,
      audioRecordings: actionRecords.filter((r) => r.audio === 1).length,
      annotationRows: annotations.byAction[action].length,
      completeExactJoinedRecordings: complete.length,
      completePublisherSuccessLabel0: complete.filter((record) =>
        annotationMap.get(record.recordingId) === 0).length,
      completePublisherFailureLabel1: complete.filter((record) =>
        annotationMap.get(record.recordingId) === 1).length };
  }
  const expected = {
    place: { rgbRecordings: 45, depthRecordings: 46, audioRecordings: 46,
      annotationRows: 47, completeExactJoinedRecordings: 45,
      completePublisherSuccessLabel0: 13, completePublisherFailureLabel1: 32 },
    pour: { rgbRecordings: 67, depthRecordings: 67, audioRecordings: 67,
      annotationRows: 67, completeExactJoinedRecordings: 67,
      completePublisherSuccessLabel0: 25, completePublisherFailureLabel1: 42 },
    push: { rgbRecordings: 31, depthRecordings: 32, audioRecordings: 31,
      annotationRows: 32, completeExactJoinedRecordings: 31,
      completePublisherSuccessLabel0: 12, completePublisherFailureLabel1: 19 },
    put_in: { rgbRecordings: 56, depthRecordings: 57, audioRecordings: 57,
      annotationRows: 56, completeExactJoinedRecordings: 56,
      completePublisherSuccessLabel0: 23, completePublisherFailureLabel1: 33 },
    put_on: { rgbRecordings: 30, depthRecordings: 30, audioRecordings: 30,
      annotationRows: 50, completeExactJoinedRecordings: 30,
      completePublisherSuccessLabel0: 9, completePublisherFailureLabel1: 21 },
  };
  if (!same(summaries, expected)) fail("ARCHIVE_ANNOTATION_JOIN_CHANGED");
  return summaries;
}

function inventoryFromEntries(entries, zip, annotations) {
  const files = entries.filter((entry) => !entry.directory);
  const directories = entries.filter((entry) => entry.directory);
  const extensionCounts = { png: 0, txt: 0, tiff: 0, wav: 0 };
  for (const entry of files) {
    const ext = /\.([^.]+)$/u.exec(entry.path)?.[1];
    if (!Object.hasOwn(extensionCounts, ext ?? "")) fail("ARCHIVE_EXTENSION_UNKNOWN", entry.path);
    extensionCounts[ext] += 1;
  }
  const selected = files.filter((entry) => matchesSelectedFile(entry.path));
  const selectedCompressedBytes = selected.reduce((sum, entry) => sum + entry.compressedSize, 0);
  const selectedUncompressedBytes = selected.reduce((sum, entry) => sum + entry.uncompressedSize, 0);
  if (files.length !== 52_685 || directories.length !== 480
    || !same(extensionCounts, { png: 17_400, txt: 17_400, tiff: 17_654, wav: 231 })
    || selected.length !== 236 || selectedCompressedBytes !== 46_704_177
    || selectedUncompressedBytes !== 93_021_329) fail("ARCHIVE_PROFILE_CHANGED");
  const coverage = recordingCoverage(entries, annotations);
  const body = { schema: AIRLAB_INVENTORY_SCHEMA, archiveUrl: AIRLAB_ARCHIVE_URL,
    archiveBytes: AIRLAB_ARCHIVE_BYTES, archiveEtag: AIRLAB_ARCHIVE_ETAG,
    archiveLastModified: AIRLAB_ARCHIVE_LAST_MODIFIED,
    completeCentralDirectoryEnumerated: true, zip,
    counts: { centralDirectoryEntries: entries.length, fileEntries: files.length,
      directoryEntries: directories.length, ...extensionCounts,
      publicAnnotationRows: annotations.totalRows,
      completeExactJoinedRecordings: Object.values(coverage)
        .reduce((sum, item) => sum + item.completeExactJoinedRecordings, 0),
      selectedFiles: selected.length, selectedCompressedBytes, selectedUncompressedBytes },
    coverage, selectedPaths: sorted(selected.map((entry) => entry.path)), entries };
  return { ...body,
    inventoryHash: airlabDigest(body, `${AIRLAB_INVENTORY_SCHEMA}/inventory`) };
}

function selectedGroups(entries) {
  const ordered = [...entries].sort((left, right) => left.localHeaderOffset - right.localHeaderOffset);
  if (new Set(ordered.map((entry) => entry.localHeaderOffset)).size !== ordered.length) {
    fail("ARCHIVE_LOCAL_OFFSET_DUPLICATE");
  }
  const indices = ordered.map((entry, index) => matchesSelectedFile(entry.path) ? index : null)
    .filter((index) => index !== null);
  const groups = [];
  for (const index of indices) {
    const current = groups.at(-1);
    if (!current || index !== current.lastIndex + 1) {
      groups.push({ firstIndex: index, lastIndex: index });
    } else current.lastIndex = index;
  }
  if (indices.length !== 236 || groups.length !== 6) fail("SELECTED_GROUP_PROFILE_CHANGED");
  return groups.map((group, index) => {
    const entriesInGroup = ordered.slice(group.firstIndex, group.lastIndex + 1);
    const next = ordered[group.lastIndex + 1];
    return { id: `segment-${String(index + 1).padStart(3, "0")}`,
      start: entriesInGroup[0].localHeaderOffset,
      end: (next?.localHeaderOffset ?? ARCHIVE_CENTRAL_OFFSET) - 1,
      entries: entriesInGroup, ordered, lastIndex: group.lastIndex };
  });
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory, { bigint: true });
  if (!stat.isDirectory() || stat.isSymbolicLink()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function supportProjection(item) {
  return { path: item.path, source: item.source, kind: item.kind,
    sizeBytes: item.bytes.length, sha256: airlabSha256(item.bytes), range: item.range ?? null };
}

function writeSupport(staging, item, projections) {
  writePrivate(path.join(staging, ...item.path.split("/")), item.bytes);
  projections.push(supportProjection(item));
}

function githubCommitProjection(value) {
  if (!exactObject(value) || value.sha !== AIRLAB_REPOSITORY_COMMIT
    || !SHA1.test(value.commit?.tree?.sha ?? "")) fail("GITHUB_COMMIT_INVALID");
  return { repository: AIRLAB_REPOSITORY, commit: AIRLAB_REPOSITORY_COMMIT,
    treeSha: value.commit.tree.sha,
    authorDate: typeof value.commit?.author?.date === "string" ? value.commit.author.date : null,
    committerDate: typeof value.commit?.committer?.date === "string"
      ? value.commit.committer.date : null,
    commitSignatureVerified: value.commit?.verification?.verified === true };
}

function githubTreeProjection(value) {
  if (!exactObject(value) || value.truncated !== false || !Array.isArray(value.tree)) {
    fail("GITHUB_TREE_INVALID");
  }
  const entries = value.tree.map((entry) => ({ path: entry.path, mode: entry.mode,
    type: entry.type, sha: entry.sha, sizeBytes: entry.size ?? null }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("GITHUB_TREE_DUPLICATE_PATH");
  }
  for (const expected of SUPPORT_BLOBS) {
    const found = entries.find((entry) => entry.path === expected.remotePath);
    if (!found || found.type !== "blob" || found.sha !== expected.gitBlobOid
      || found.sizeBytes !== expected.sizeBytes) fail("GITHUB_TREE_PIN_MISMATCH", expected.remotePath);
  }
  return { responseSha: typeof value.sha === "string" ? value.sha : null,
    truncated: false, entryCount: entries.length, entries };
}

function publishSourceStaging(staging, target) {
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("SOURCE_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "raw"), path.join(target, "raw"));
    renameSync(path.join(staging, "archive-ranges"), path.join(target, "archive-ranges"));
    renameSync(path.join(staging, "source-support"), path.join(target, "source-support"));
    renameSync(path.join(staging, "archive-inventory.json"),
      path.join(target, "archive-inventory.json"));
    renameSync(path.join(staging, "acquisition-manifest.json"),
      path.join(target, "acquisition-manifest.json"));
    rmdirSync(staging);
  } catch { fail("SOURCE_TARGET_PUBLISH_INCOMPLETE", target); }
}

export async function acquirePinnedAirlabFailureSource(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_BROAD");
  ensurePrivateDirectory(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  try {
    const supportObjects = [];
    const project = await boundedDirectFetch(PROJECT_URL, 2 * 1024 * 1024,
      "PROJECT", "text/html", fetchImpl);
    if (!project.bytes.toString("utf8").includes(AIRLAB_ARCHIVE_URL)) {
      fail("PROJECT_PAGE_ARCHIVE_LINK_MISSING");
    }
    writeSupport(staging, { path: "source-support/official-project-page.html",
      source: PROJECT_URL, kind: "OFFICIAL_PROJECT_PAGE", bytes: project.bytes }, supportObjects);

    const commitRaw = await jsonFetch(GH_COMMIT_URL, MAX_DIRECT_BYTES, "GH_API", fetchImpl);
    const commit = githubCommitProjection(commitRaw.value);
    writeSupport(staging, { path: "source-support/github-commit.json",
      source: GH_COMMIT_URL, kind: "PINNED_GITHUB_COMMIT_API", bytes: commitRaw.bytes },
    supportObjects);
    const treeRaw = await jsonFetch(GH_TREE_URL, MAX_DIRECT_BYTES, "GH_API", fetchImpl);
    const tree = githubTreeProjection(treeRaw.value);
    writeSupport(staging, { path: "source-support/github-tree.json",
      source: GH_TREE_URL, kind: "PINNED_GITHUB_TREE_API", bytes: treeRaw.bytes },
    supportObjects);
    const blobObjects = [];
    for (const expected of SUPPORT_BLOBS) {
      const url = `${GH_RAW_ROOT}/${expected.remotePath}`;
      const fetched = await boundedDirectFetch(url, MAX_DIRECT_BYTES, "GH_RAW",
        "application/octet-stream", fetchImpl);
      if (fetched.bytes.length !== expected.sizeBytes
        || gitBlobOid(fetched.bytes) !== expected.gitBlobOid) {
        fail("GITHUB_BLOB_PIN_MISMATCH", expected.remotePath);
      }
      writeSupport(staging, { path: expected.localPath, source: url,
        kind: "PINNED_GITHUB_BLOB", bytes: fetched.bytes }, supportObjects);
      blobObjects.push({ remotePath: expected.remotePath, supportPath: expected.localPath,
        sizeBytes: fetched.bytes.length, gitBlobOid: expected.gitBlobOid,
        sha256: airlabSha256(fetched.bytes) });
    }
    const supportMap = new Map(supportObjects.map((item) =>
      [item.path, readFileSync(path.join(staging, ...item.path.split("/")))]));
    const readme = supportMap.get("source-support/github-readme.md").toString("utf8");
    const license = supportMap.get("source-support/github-license.txt").toString("utf8");
    if (!readme.includes(AIRLAB_ARCHIVE_URL) || !/MIT License/u.test(license)) {
      fail("REPOSITORY_SUPPORT_SEMANTICS_CHANGED");
    }
    const annotations = parseAnnotations(
      supportMap.get("source-support/github-annotation.zip"),
      supportMap.get("source-support/github-fino-notebook.ipynb"));

    const headBefore = await archiveHead(fetchImpl);
    writeSupport(staging, { path: "source-support/archive-head-before.json",
      source: AIRLAB_ARCHIVE_URL, kind: "HEAD_PROJECTION", bytes: canonicalBytes(headBefore) },
    supportObjects);
    const tailStart = AIRLAB_ARCHIVE_BYTES - TAIL_BYTES;
    const tail = await strictRangeFetch(tailStart, AIRLAB_ARCHIVE_BYTES - 1,
      TAIL_BYTES, fetchImpl);
    const zip = parseArchiveTail(tail.bytes, tailStart);
    writeSupport(staging, { path: "source-support/archive-tail.bin",
      source: AIRLAB_ARCHIVE_URL, kind: "STRICT_RANGE_SUPPORT", bytes: tail.bytes,
      range: rangeProjection(tail) }, supportObjects);
    const central = await strictRangeFetch(ARCHIVE_CENTRAL_OFFSET,
      ARCHIVE_CENTRAL_OFFSET + ARCHIVE_CENTRAL_BYTES - 1,
      MAX_CENTRAL_BYTES, fetchImpl);
    writeSupport(staging, { path: "source-support/archive-central-directory.bin",
      source: AIRLAB_ARCHIVE_URL, kind: "STRICT_RANGE_SUPPORT", bytes: central.bytes,
      range: rangeProjection(central) }, supportObjects);
    const entries = parseAirlabCentralDirectory(central.bytes, ARCHIVE_ENTRIES);
    const inventory = inventoryFromEntries(entries,
      { ...zip, centralDirectorySha256: central.sha256 }, annotations);
    const inventoryBytes = canonicalBytes(inventory);
    writePrivate(path.join(staging, "archive-inventory.json"), inventoryBytes);

    const rangeObjects = [];
    const selectedObjects = [];
    const groups = selectedGroups(entries);
    for (const group of groups) {
      const fetched = await strictRangeFetch(group.start, group.end,
        MAX_SELECTED_RANGE_BYTES, fetchImpl);
      const rangePath = `archive-ranges/${group.id}.bin`;
      writePrivate(path.join(staging, rangePath), fetched.bytes);
      rangeObjects.push({ path: rangePath, source: AIRLAB_ARCHIVE_URL,
        kind: "STRICT_RANGE_SELECTED_LOCAL_RECORD_SET", sizeBytes: fetched.bytes.length,
        sha256: fetched.sha256, range: rangeProjection(fetched),
        selectedEntryCount: group.entries.length });
      for (const entry of group.entries) {
        const globalIndex = group.ordered.findIndex((candidate) => candidate.path === entry.path);
        const nextOffset = group.ordered[globalIndex + 1]?.localHeaderOffset
          ?? ARCHIVE_CENTRAL_OFFSET;
        const begin = entry.localHeaderOffset - group.start;
        const finish = nextOffset - group.start;
        if (begin < 0 || finish > fetched.bytes.length || finish <= begin) {
          fail("SELECTED_RECORD_RANGE_INVALID", entry.path);
        }
        const parsed = parseLocalRecord(fetched.bytes.subarray(begin, finish), entry);
        const rawPath = `raw/${entry.path}`;
        writePrivate(path.join(staging, ...rawPath.split("/")), parsed.raw);
        selectedObjects.push({ internalPath: entry.path, rawPath, rangePath,
          rangeRelativeStart: begin, rangeRelativeEndExclusive: finish,
          flags: entry.flags, compressionMethod: entry.compressionMethod,
          crc32: entry.crc32, compressedSize: entry.compressedSize,
          uncompressedSize: entry.uncompressedSize,
          localHeaderOffset: entry.localHeaderOffset, localHeaderBytes: parsed.headerBytes,
          localRecordBytes: parsed.localRecordBytes,
          dataDescriptorPresent: parsed.descriptor.present,
          dataDescriptorSignaturePresent: parsed.descriptor.signaturePresent,
          dataDescriptorBytes: parsed.descriptor.bytes,
          rawSha256: airlabSha256(parsed.raw), compressedSha256: airlabSha256(parsed.compressed) });
      }
    }
    selectedObjects.sort((left, right) => left.internalPath.localeCompare(right.internalPath));
    rangeObjects.sort((left, right) => left.path.localeCompare(right.path));
    const headAfter = await archiveHead(fetchImpl);
    writeSupport(staging, { path: "source-support/archive-head-after.json",
      source: AIRLAB_ARCHIVE_URL, kind: "HEAD_PROJECTION", bytes: canonicalBytes(headAfter) },
    supportObjects);
    if (!same(headBefore, headAfter)) fail("ARCHIVE_HEAD_CHANGED_DURING_ACQUISITION");

    const transcript = {
      archiveUrl: AIRLAB_ARCHIVE_URL,
      plainHttpTransport: true,
      headBefore,
      headAfter,
      strictRanges: [supportObjects.find((item) => item.path.endsWith("archive-tail.bin")),
        supportObjects.find((item) => item.path.endsWith("archive-central-directory.bin")),
        ...rangeObjects].map((item) => ({ path: item.path, sizeBytes: item.sizeBytes,
        sha256: item.sha256, range: item.range })),
    };
    writeSupport(staging, { path: "source-support/range-transcript.json",
      source: AIRLAB_ARCHIVE_URL, kind: "DERIVED_RANGE_TRANSCRIPT",
      bytes: canonicalBytes(transcript) }, supportObjects);

    supportObjects.sort((left, right) => left.path.localeCompare(right.path));
    const body = {
      schema: AIRLAB_SOURCE_SCHEMA,
      capturedAt: AIRLAB_FROZEN_AT,
      project: { officialPage: PROJECT_URL,
        officialPageSha256: supportObjects.find((item) =>
          item.path === "source-support/official-project-page.html").sha256 },
      repositorySupport: { repository: AIRLAB_REPOSITORY,
        pinnedCommit: AIRLAB_REPOSITORY_COMMIT, commit, tree,
        blobObjects: blobObjects.sort((left, right) =>
          left.remotePath.localeCompare(right.remotePath)),
        repositoryCodeLicenseClaim: "MIT",
        repositoryCodeLicenseDoesNotExtendToDatasetBytes: true,
        annotationColumns: annotations.columns,
        annotationRows: annotations.totalRows,
        annotationCounts: annotations.counts,
        labelMeaningFromPinnedNotebook: annotations.labelMeaning,
        annotationFailureStartColumnPresent: false,
        pinnedNotebookExpectsFailureStartColumn: true },
      archive: { url: AIRLAB_ARCHIVE_URL, sizeBytes: AIRLAB_ARCHIVE_BYTES,
        etag: AIRLAB_ARCHIVE_ETAG, lastModified: AIRLAB_ARCHIVE_LAST_MODIFIED,
        headBefore, headAfter, plainHttpTransport: true,
        providerIdentityCryptographicallyVerified: false,
        transportIntegrityCryptographicallyVerified: false,
        fullArchiveDownloaded: false, fullArchiveCryptographicHashRecomputed: false,
        completeCentralDirectoryEnumerated: true,
        inventoryHash: inventory.inventoryHash,
        inventoryFileSha256: airlabSha256(inventoryBytes) },
      selection: { action: SELECTED_ACTION,
        recordingIds: SELECTED_RECORDINGS.map((item) => item.recordingId),
        publisherLabels: SELECTED_RECORDINGS,
        completeMultimodalExecutions: 2, selectedFiles: 236,
        selectedCompressedBytes: 46_704_177,
        selectedUncompressedBytes: 93_021_329,
        rgbFrames: 78, timestampTexts: 78, depthFrames: 78, audioFiles: 2,
        completeSelectedClosureReplayed: true,
        paperExtendedDatasetCensusUsed: false },
      rights: { publisherDatasetLicenseClaimInPinnedMaterials: null,
        status: "FAIL_CLOSED_NO_DATASET_LICENSE",
        repositoryMitLicenseAppliedToDatasetBytes: false,
        redistributionAuthorizedByArtifact: false,
        productionTrainingAuthorizedByOutsider: false,
        legalAdjudicationPerformed: false },
      privacy: { rgbImagerySelected: true, depthImagerySelected: true,
        audioSelected: true, noPiiGuaranteed: false,
        humanPresenceExcludedByVerifiedAnalysis: false,
        biometricContentExcludedByVerifiedAnalysis: false },
      sourceSupportObjects: supportObjects,
      rangeObjects,
      selectedObjects,
    };
    const manifest = { ...body,
      manifestHash: airlabDigest(body, `${AIRLAB_SOURCE_SCHEMA}/manifest`) };
    writePrivate(path.join(staging, "acquisition-manifest.json"), canonicalBytes(manifest));
    publishSourceStaging(staging, target);
    return { outputDirectory: target, manifestHash: manifest.manifestHash,
      selectedFiles: selectedObjects.length, rangeSegments: rangeObjects.length };
  } catch (error) {
    /* A failed staging directory is intentionally left private for diagnosis;
     * no existing target is removed or overwritten. */
    throw error;
  }
}

function validateRange(range, sizeBytes, code) {
  if (!exactObject(range) || !Number.isSafeInteger(range.start)
    || !Number.isSafeInteger(range.end) || range.end < range.start
    || range.end - range.start + 1 !== sizeBytes || !Array.isArray(range.chunks)
    || range.chunks.length < 1) fail(`${code}_INVALID`);
  let cursor = range.start;
  for (const chunk of range.chunks) {
    if (!exactObject(chunk) || chunk.start !== cursor || !Number.isSafeInteger(chunk.end)
      || chunk.end < chunk.start || chunk.end > range.end
      || chunk.sizeBytes !== chunk.end - chunk.start + 1
      || chunk.sizeBytes > RANGE_CHUNK_BYTES || !HASH.test(chunk.sha256 ?? "")
      || chunk.contentRange !== `bytes ${chunk.start}-${chunk.end}/${AIRLAB_ARCHIVE_BYTES}`
      || chunk.etag !== AIRLAB_ARCHIVE_ETAG
      || chunk.lastModified !== AIRLAB_ARCHIVE_LAST_MODIFIED) {
      fail(`${code}_CHUNK_INVALID`, String(cursor));
    }
    cursor = chunk.end + 1;
  }
  if (cursor !== range.end + 1
    || range.contentRange !== (range.chunks.length === 1
      ? range.chunks[0].contentRange : "STRICT_206_CHUNK_SET")) fail(`${code}_INCOMPLETE`);
}

function verifyRangeBytes(bytes, range, code) {
  validateRange(range, bytes.length, code);
  for (const chunk of range.chunks) {
    const begin = chunk.start - range.start;
    const finish = begin + chunk.sizeBytes;
    if (begin < 0 || finish > bytes.length
      || airlabSha256(bytes.subarray(begin, finish)) !== chunk.sha256) {
      fail(`${code}_HASH_INVALID`, `${chunk.start}-${chunk.end}`);
    }
  }
}

function validateManifest(manifest) {
  if (!exactObject(manifest)) fail("MANIFEST_INVALID");
  const { manifestHash, ...body } = manifest;
  if (manifest.schema !== AIRLAB_SOURCE_SCHEMA || manifest.capturedAt !== AIRLAB_FROZEN_AT
    || manifestHash !== airlabDigest(body, `${AIRLAB_SOURCE_SCHEMA}/manifest`)
    || manifest.project?.officialPage !== PROJECT_URL
    || !HASH.test(manifest.project?.officialPageSha256 ?? "")
    || manifest.repositorySupport?.repository !== AIRLAB_REPOSITORY
    || manifest.repositorySupport?.pinnedCommit !== AIRLAB_REPOSITORY_COMMIT
    || manifest.repositorySupport?.repositoryCodeLicenseClaim !== "MIT"
    || manifest.repositorySupport?.repositoryCodeLicenseDoesNotExtendToDatasetBytes !== true
    || manifest.repositorySupport?.annotationRows !== 252
    || !same(manifest.repositorySupport?.annotationColumns, ["name", "label"])
    || !same(manifest.repositorySupport?.labelMeaningFromPinnedNotebook,
      { "0": "SUCCESS", "1": "FAILURE" })
    || manifest.repositorySupport?.annotationFailureStartColumnPresent !== false
    || manifest.repositorySupport?.pinnedNotebookExpectsFailureStartColumn !== true) {
    fail("MANIFEST_IDENTITY_INVALID");
  }
  const archive = manifest.archive;
  if (archive?.url !== AIRLAB_ARCHIVE_URL || archive?.sizeBytes !== AIRLAB_ARCHIVE_BYTES
    || archive?.etag !== AIRLAB_ARCHIVE_ETAG
    || archive?.lastModified !== AIRLAB_ARCHIVE_LAST_MODIFIED
    || archive?.plainHttpTransport !== true
    || archive?.providerIdentityCryptographicallyVerified !== false
    || archive?.transportIntegrityCryptographicallyVerified !== false
    || archive?.fullArchiveDownloaded !== false
    || archive?.fullArchiveCryptographicHashRecomputed !== false
    || archive?.completeCentralDirectoryEnumerated !== true
    || !same(archive?.headBefore, archive?.headAfter)
    || !HASH.test(archive?.inventoryHash ?? "")
    || !HASH.test(archive?.inventoryFileSha256 ?? "")) fail("MANIFEST_ARCHIVE_INVALID");
  archiveHeadProjection(new Headers(Object.entries({
    "content-length": archive.headBefore.contentLength,
    "content-type": archive.headBefore.contentType,
    "accept-ranges": archive.headBefore.acceptRanges,
    etag: archive.headBefore.etag,
    "last-modified": archive.headBefore.lastModified,
    ...(archive.headBefore.contentEncoding === null ? {} :
      { "content-encoding": archive.headBefore.contentEncoding }),
  })), archive.headBefore.status, archive.headBefore.responseUrl);
  if (!same(manifest.selection, { action: "put_in", recordingIds: [49, 50],
    publisherLabels: SELECTED_RECORDINGS, completeMultimodalExecutions: 2,
    selectedFiles: 236, selectedCompressedBytes: 46_704_177,
    selectedUncompressedBytes: 93_021_329, rgbFrames: 78, timestampTexts: 78,
    depthFrames: 78, audioFiles: 2, completeSelectedClosureReplayed: true,
    paperExtendedDatasetCensusUsed: false })) fail("MANIFEST_SELECTION_INVALID");
  if (!same(manifest.rights, { publisherDatasetLicenseClaimInPinnedMaterials: null,
    status: "FAIL_CLOSED_NO_DATASET_LICENSE",
    repositoryMitLicenseAppliedToDatasetBytes: false,
    redistributionAuthorizedByArtifact: false,
    productionTrainingAuthorizedByOutsider: false,
    legalAdjudicationPerformed: false })
    || !same(manifest.privacy, { rgbImagerySelected: true, depthImagerySelected: true,
      audioSelected: true, noPiiGuaranteed: false,
      humanPresenceExcludedByVerifiedAnalysis: false,
      biometricContentExcludedByVerifiedAnalysis: false })) fail("MANIFEST_BOUNDARY_INVALID");
  if (!Array.isArray(manifest.sourceSupportObjects)
    || !Array.isArray(manifest.rangeObjects) || !Array.isArray(manifest.selectedObjects)
    || manifest.sourceSupportObjects.length !== 12 || manifest.rangeObjects.length !== 6
    || manifest.selectedObjects.length !== 236) fail("MANIFEST_OBJECT_COUNT_INVALID");
  const expectedSupportPaths = [
    "source-support/archive-central-directory.bin",
    "source-support/archive-head-after.json",
    "source-support/archive-head-before.json",
    "source-support/archive-tail.bin",
    "source-support/github-annotation.zip",
    "source-support/github-commit.json",
    "source-support/github-fino-notebook.ipynb",
    "source-support/github-license.txt",
    "source-support/github-readme.md",
    "source-support/github-tree.json",
    "source-support/official-project-page.html",
    "source-support/range-transcript.json",
  ];
  if (!same(manifest.sourceSupportObjects.map((item) => item.path), expectedSupportPaths)
    || !same(manifest.rangeObjects.map((item) => item.path),
      Array.from({ length: 6 }, (_, index) =>
        `archive-ranges/segment-${String(index + 1).padStart(3, "0")}.bin`))
    || !same(manifest.selectedObjects.map((item) => item.internalPath),
      sorted(manifest.selectedObjects.map((item) => item.internalPath)))) {
    fail("MANIFEST_OBJECT_ORDER_INVALID");
  }
  for (const item of manifest.sourceSupportObjects) {
    if (!exactObject(item) || !item.path.startsWith("source-support/")
      || item.path.split("/").length !== 2 || typeof item.source !== "string"
      || typeof item.kind !== "string" || !Number.isSafeInteger(item.sizeBytes)
      || item.sizeBytes < 1 || !HASH.test(item.sha256 ?? "")) fail("SUPPORT_OBJECT_INVALID");
    if (item.range !== null) validateRange(item.range, item.sizeBytes, "SUPPORT_RANGE");
  }
  for (const item of manifest.rangeObjects) {
    if (!exactObject(item) || item.source !== AIRLAB_ARCHIVE_URL
      || item.kind !== "STRICT_RANGE_SELECTED_LOCAL_RECORD_SET"
      || !Number.isSafeInteger(item.sizeBytes) || item.sizeBytes < 1
      || !HASH.test(item.sha256 ?? "") || !Number.isSafeInteger(item.selectedEntryCount)
      || item.selectedEntryCount < 1) fail("RANGE_OBJECT_INVALID");
    validateRange(item.range, item.sizeBytes, "SELECTED_RANGE");
  }
  for (const item of manifest.selectedObjects) {
    if (!exactObject(item) || !matchesSelectedFile(item.internalPath)
      || item.rawPath !== `raw/${item.internalPath}`
      || !/^archive-ranges\/segment-\d{3}\.bin$/u.test(item.rangePath)
      || !Number.isSafeInteger(item.rangeRelativeStart) || item.rangeRelativeStart < 0
      || !Number.isSafeInteger(item.rangeRelativeEndExclusive)
      || item.rangeRelativeEndExclusive <= item.rangeRelativeStart
      || ![0, 8].includes(item.compressionMethod)
      || !/^[a-f0-9]{8}$/u.test(item.crc32 ?? "")
      || !Number.isSafeInteger(item.compressedSize) || item.compressedSize < 1
      || !Number.isSafeInteger(item.uncompressedSize) || item.uncompressedSize < 1
      || !Number.isSafeInteger(item.localHeaderOffset) || item.localHeaderOffset < 0
      || !Number.isSafeInteger(item.localHeaderBytes) || item.localHeaderBytes < 30
      || item.localRecordBytes !== item.rangeRelativeEndExclusive - item.rangeRelativeStart
      || typeof item.dataDescriptorPresent !== "boolean"
      || typeof item.dataDescriptorSignaturePresent !== "boolean"
      || !Number.isSafeInteger(item.dataDescriptorBytes) || item.dataDescriptorBytes < 0
      || !HASH.test(item.rawSha256 ?? "") || !HASH.test(item.compressedSha256 ?? "")) {
      fail("SELECTED_OBJECT_INVALID", item.internalPath);
    }
  }
  return manifest;
}

function pathSnapshot(root) {
  const directories = [];
  const files = [];
  const stamps = [];
  const visit = (directory, relative) => {
    const stat = lstatSync(directory, { bigint: true });
    if (stat.isSymbolicLink() || !stat.isDirectory() || Number(stat.mode & 0o777n) !== 0o700) {
      fail("SOURCE_DIRECTORY_UNSAFE", relative || ".");
    }
    const names = sorted(readdirSync(directory));
    directories.push(relative);
    stamps.push({ path: relative, kind: "directory", dev: String(stat.dev), ino: String(stat.ino),
      mode: String(stat.mode), size: String(stat.size), mtimeNs: String(stat.mtimeNs),
      ctimeNs: String(stat.ctimeNs), names });
    for (const name of names) {
      const child = path.join(directory, name);
      const childRelative = relative === "" ? name : `${relative}/${name}`;
      const childStat = lstatSync(child, { bigint: true });
      if (childStat.isSymbolicLink()) fail("SOURCE_SYMLINK_FORBIDDEN", childRelative);
      if (childStat.isDirectory()) visit(child, childRelative);
      else if (childStat.isFile() && Number(childStat.mode & 0o777n) === 0o600) {
        files.push(childRelative);
        stamps.push({ path: childRelative, kind: "file", dev: String(childStat.dev),
          ino: String(childStat.ino), mode: String(childStat.mode), size: String(childStat.size),
          mtimeNs: String(childStat.mtimeNs), ctimeNs: String(childStat.ctimeNs) });
      } else fail("SOURCE_FILE_UNSAFE", childRelative);
    }
  };
  visit(root, "");
  return { directories: sorted(directories), files: sorted(files), stamps };
}

function expectedDirectories(files) {
  const directories = new Set([""]);
  for (const file of files) {
    let cursor = path.posix.dirname(file);
    while (cursor !== ".") {
      directories.add(cursor);
      cursor = path.posix.dirname(cursor);
    }
  }
  return sorted(directories);
}

function stableRead(root, relative, expected = null, maximumBytes = 128 * 1024 * 1024) {
  if (relative.startsWith("/") || relative.split("/").some((part) => !part || part === "."
    || part === "..")) fail("SOURCE_RELATIVE_PATH_INVALID", relative);
  const target = path.join(root, ...relative.split("/"));
  const link = lstatSync(target, { bigint: true });
  if (link.isSymbolicLink() || !link.isFile() || Number(link.mode & 0o777n) !== 0o600
    || link.size > BigInt(maximumBytes)) fail("SOURCE_FILE_READ_UNSAFE", relative);
  let descriptor;
  try {
    descriptor = openSync(target, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.dev !== link.dev || before.ino !== link.ino
      || before.mode !== link.mode || before.dev !== after.dev || before.ino !== after.ino
      || before.mode !== after.mode || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || bytes.length !== Number(before.size)) fail("SOURCE_FILE_CHANGED", relative);
    if (expected && (expected.sizeBytes !== bytes.length
      || expected.sha256 !== airlabSha256(bytes))) fail("SOURCE_FILE_BINDING_INVALID", relative);
    return bytes;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function pngProfile(bytes, objectPath) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || bytes.readUInt32BE(8) !== 13 || bytes.subarray(12, 16).toString("ascii") !== "IHDR") {
    fail("PNG_HEADER_INVALID", objectPath);
  }
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20),
    bitDepth: bytes[24], colorType: bytes[25], compressionMethod: bytes[26],
    filterMethod: bytes[27], interlaceMethod: bytes[28] };
}

function tiffProfile(bytes, objectPath) {
  if (bytes.length < 8) fail("TIFF_HEADER_INVALID", objectPath);
  const marker = bytes.subarray(0, 2).toString("ascii");
  if (!['II', 'MM'].includes(marker)) fail("TIFF_BYTE_ORDER_INVALID", objectPath);
  const little = marker === "II";
  const u16 = (offset) => little ? bytes.readUInt16LE(offset) : bytes.readUInt16BE(offset);
  const u32 = (offset) => little ? bytes.readUInt32LE(offset) : bytes.readUInt32BE(offset);
  if (u16(2) !== 42) fail("TIFF_MAGIC_INVALID", objectPath);
  const ifd = u32(4);
  if (ifd + 2 > bytes.length) fail("TIFF_IFD_INVALID", objectPath);
  const count = u16(ifd);
  if (ifd + 2 + count * 12 + 4 > bytes.length || count > 256) fail("TIFF_IFD_INVALID", objectPath);
  const tags = new Map();
  for (let index = 0; index < count; index += 1) {
    const offset = ifd + 2 + index * 12;
    const tag = u16(offset);
    const type = u16(offset + 2);
    const values = u32(offset + 4);
    if (values === 1 && [3, 4].includes(type)) {
      tags.set(tag, type === 3 ? u16(offset + 8) : u32(offset + 8));
    }
  }
  if (!Number.isInteger(tags.get(256)) || !Number.isInteger(tags.get(257))) {
    fail("TIFF_DIMENSIONS_MISSING", objectPath);
  }
  return { byteOrder: marker, width: tags.get(256), height: tags.get(257),
    ifdEntryCount: count };
}

function wavProfile(bytes, objectPath) {
  if (bytes.length < 44 || bytes.subarray(0, 4).toString("ascii") !== "RIFF"
    || bytes.subarray(8, 12).toString("ascii") !== "WAVE"
    || bytes.readUInt32LE(4) + 8 !== bytes.length) fail("WAV_HEADER_INVALID", objectPath);
  let offset = 12;
  let format = null;
  let dataBytes = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.subarray(offset, offset + 4).toString("ascii");
    const size = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (start + size > bytes.length) fail("WAV_CHUNK_INVALID", objectPath);
    if (id === "fmt ") {
      if (size < 16) fail("WAV_FMT_INVALID", objectPath);
      format = { audioFormat: bytes.readUInt16LE(start), channels: bytes.readUInt16LE(start + 2),
        sampleRateHz: bytes.readUInt32LE(start + 4), byteRate: bytes.readUInt32LE(start + 8),
        blockAlign: bytes.readUInt16LE(start + 12), bitsPerSample: bytes.readUInt16LE(start + 14) };
    }
    if (id === "data") dataBytes = size;
    offset = start + size + (size & 1);
  }
  if (!format || !Number.isInteger(dataBytes) || format.byteRate < 1) {
    fail("WAV_REQUIRED_CHUNK_MISSING", objectPath);
  }
  return { ...format, dataBytes,
    durationSeconds: Number((dataBytes / format.byteRate).toFixed(9)) };
}

function observationsFromRaw(rawByPath, annotations) {
  const executions = [];
  for (const selected of SELECTED_RECORDINGS) {
    const id = String(selected.recordingId);
    const rgbPrefix = `failnet_dataset/rgb_imgs/put_in/${id}/frame`;
    const depthPrefix = `failnet_dataset/depth_imgs/put_in/${id}/frame`;
    const rgb = new Map();
    const timestamps = new Map();
    const depth = new Map();
    for (const [objectPath, bytes] of rawByPath) {
      let match = new RegExp(`^${rgbPrefix}(\\d{6})\\.png$`, "u").exec(objectPath);
      if (match) { rgb.set(match[1], { bytes, profile: pngProfile(bytes, objectPath) }); continue; }
      match = new RegExp(`^${rgbPrefix}(\\d{6})\\.txt$`, "u").exec(objectPath);
      if (match) {
        const text = bytes.toString("utf8").trim();
        if (!/^-?\d+(?:\.\d+)?$/u.test(text) || !Number.isFinite(Number(text))) {
          fail("TIMESTAMP_TEXT_INVALID", objectPath);
        }
        timestamps.set(match[1], Number(text));
        continue;
      }
      match = new RegExp(`^${depthPrefix}(\\d{6})\\.tiff$`, "u").exec(objectPath);
      if (match) depth.set(match[1], { bytes, profile: tiffProfile(bytes, objectPath) });
    }
    const stems = sorted(rgb.keys());
    if (stems.length !== 39 || !same(stems, sorted(timestamps.keys()))
      || !same(stems, sorted(depth.keys()))) fail("FRAME_STEM_JOIN_INVALID", id);
    const values = stems.map((stem) => timestamps.get(stem));
    const deltas = values.slice(1).map((value, index) => value - values[index]);
    if (deltas.some((value) => !Number.isFinite(value) || value <= 0)) {
      fail("TIMESTAMP_NOT_STRICTLY_INCREASING", id);
    }
    const pngProfiles = [...new Map([...rgb.values()].map((item) =>
      [canonicalizeStrict(item.profile), item.profile])).values()];
    const tiffProfiles = [...new Map([...depth.values()].map((item) =>
      [canonicalizeStrict(item.profile), item.profile])).values()];
    const audioPath = `failnet_dataset/audio/put_in/${id}.wav`;
    const audioBytes = rawByPath.get(audioPath);
    if (!audioBytes || pngProfiles.length !== 1 || tiffProfiles.length !== 1) {
      fail("MODALITY_PROFILE_INCONSISTENT", id);
    }
    const annotation = annotations.byAction.put_in.find((row) =>
      row.recordingId === selected.recordingId);
    if (annotation?.publisherLabel !== selected.publisherLabel) fail("SELECTED_LABEL_CHANGED", id);
    executions.push({ action: "put_in", recordingId: selected.recordingId,
      publisherBinaryLabel: selected.publisherLabel,
      publisherLabelMeaning: selected.publisherLabelMeaning,
      publisherLabelSource: "PINNED_ANNOTATION_EXACT_ID_JOIN",
      frames: { units: stems.length, stems,
        filenameCounterMinimum: Number(stems[0]), filenameCounterMaximum: Number(stems.at(-1)),
        filenameCounterUnitDeclaredByPublisher: false,
        rgbProfile: pngProfiles[0], depthProfile: tiffProfiles[0],
        exactRgbTimestampDepthStemJoin: true },
      timestampText: { valuesPresent: true, unitDeclaredByPublisher: false,
        unit: "UNKNOWN_PUBLISHER_TEXT_NUMBER", strictlyIncreasing: true,
        minimum: values[0], maximum: values.at(-1),
        minimumPositiveDelta: Math.min(...deltas), maximumPositiveDelta: Math.max(...deltas) },
      audio: wavProfile(audioBytes, audioPath),
      selectedRawBytes: [...rawByPath.entries()].filter(([objectPath]) =>
        objectPath.includes(`/put_in/${id}/`) || objectPath.endsWith(`/put_in/${id}.wav`))
        .reduce((sum, [, bytes]) => sum + bytes.length, 0) });
  }
  return { executions, completeRgbTimestampDepthAudioJoin: true,
    publisherBinaryLabelsExactlyJoined: true,
    actionOrRobotStateTracePresent: false,
    failureTypeAnnotationPresent: false,
    failureStartTimestampAnnotationPresent: false };
}

export function verifyAirlabFailureSourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const before = pathSnapshot(root);
  if (!same(before.directories.slice(0, 1), [""])) fail("SOURCE_ROOT_INVALID");
  const manifestBytes = stableRead(root, "acquisition-manifest.json", null, 32 * 1024 * 1024);
  const manifest = validateManifest(parseJson(manifestBytes, "MANIFEST_JSON_INVALID"));
  const expectedFiles = ["acquisition-manifest.json", "archive-inventory.json",
    ...manifest.sourceSupportObjects.map((item) => item.path),
    ...manifest.rangeObjects.map((item) => item.path),
    ...manifest.selectedObjects.map((item) => item.rawPath)];
  if (!same(before.files, sorted(expectedFiles))
    || !same(before.directories, expectedDirectories(expectedFiles))) {
    fail("SOURCE_LAYOUT_INVALID");
  }
  const supportBytes = new Map();
  for (const item of manifest.sourceSupportObjects) {
    const bytes = stableRead(root, item.path, item, Math.max(MAX_DIRECT_BYTES,
      MAX_CENTRAL_BYTES, TAIL_BYTES));
    if (item.range !== null) verifyRangeBytes(bytes, item.range, "SUPPORT_RANGE_REPLAY");
    supportBytes.set(item.path, bytes);
  }
  const rangeBytes = new Map();
  for (const item of manifest.rangeObjects) {
    const bytes = stableRead(root, item.path, item, MAX_SELECTED_RANGE_BYTES);
    verifyRangeBytes(bytes, item.range, "SELECTED_RANGE_REPLAY");
    rangeBytes.set(item.path, bytes);
  }
  const project = supportBytes.get("source-support/official-project-page.html");
  if (!project.toString("utf8").includes(AIRLAB_ARCHIVE_URL)
    || airlabSha256(project) !== manifest.project.officialPageSha256) {
    fail("PROJECT_PAGE_REPLAY_INVALID");
  }
  const commit = githubCommitProjection(parseJson(supportBytes.get(
    "source-support/github-commit.json"), "GITHUB_COMMIT_JSON_INVALID"));
  const tree = githubTreeProjection(parseJson(supportBytes.get(
    "source-support/github-tree.json"), "GITHUB_TREE_JSON_INVALID"));
  if (!same(commit, manifest.repositorySupport.commit)
    || !same(tree, manifest.repositorySupport.tree)) fail("GITHUB_API_REPLAY_INVALID");
  for (const item of manifest.repositorySupport.blobObjects) {
    const bytes = supportBytes.get(item.supportPath);
    const treeItem = tree.entries.find((entry) => entry.path === item.remotePath);
    if (!bytes || bytes.length !== item.sizeBytes || airlabSha256(bytes) !== item.sha256
      || gitBlobOid(bytes) !== item.gitBlobOid || treeItem?.sha !== item.gitBlobOid) {
      fail("GITHUB_BLOB_REPLAY_INVALID", item.remotePath);
    }
  }
  const annotations = parseAnnotations(
    supportBytes.get("source-support/github-annotation.zip"),
    supportBytes.get("source-support/github-fino-notebook.ipynb"));
  if (!same(annotations.counts, manifest.repositorySupport.annotationCounts)) {
    fail("ANNOTATION_COUNT_REPLAY_INVALID");
  }
  const headBefore = parseJson(supportBytes.get("source-support/archive-head-before.json"),
    "ARCHIVE_HEAD_BEFORE_JSON_INVALID");
  const headAfter = parseJson(supportBytes.get("source-support/archive-head-after.json"),
    "ARCHIVE_HEAD_AFTER_JSON_INVALID");
  if (!same(headBefore, manifest.archive.headBefore) || !same(headAfter, manifest.archive.headAfter)
    || !same(headBefore, headAfter)) fail("ARCHIVE_HEAD_REPLAY_INVALID");
  const tail = supportBytes.get("source-support/archive-tail.bin");
  const zip = parseArchiveTail(tail, AIRLAB_ARCHIVE_BYTES - TAIL_BYTES);
  const central = supportBytes.get("source-support/archive-central-directory.bin");
  const entries = parseAirlabCentralDirectory(central, ARCHIVE_ENTRIES);
  const rebuiltInventory = inventoryFromEntries(entries,
    { ...zip, centralDirectorySha256: airlabSha256(central) }, annotations);
  const inventoryBytes = stableRead(root, "archive-inventory.json",
    { sizeBytes: Number(lstatSync(path.join(root, "archive-inventory.json")).size),
      sha256: manifest.archive.inventoryFileSha256 }, 32 * 1024 * 1024);
  const inventory = parseJson(inventoryBytes, "INVENTORY_JSON_INVALID");
  if (!same(rebuiltInventory, inventory)
    || inventory.inventoryHash !== manifest.archive.inventoryHash) {
    fail("INVENTORY_REPLAY_INVALID");
  }
  const groups = selectedGroups(entries);
  const selectedByPath = new Map(manifest.selectedObjects.map((item) =>
    [item.internalPath, item]));
  const rawByPath = new Map();
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const rangePath = `archive-ranges/${group.id}.bin`;
    const rangeObject = manifest.rangeObjects[groupIndex];
    const bytes = rangeBytes.get(rangePath);
    if (rangeObject.path !== rangePath || rangeObject.range.start !== group.start
      || rangeObject.range.end !== group.end
      || rangeObject.selectedEntryCount !== group.entries.length || !bytes) {
      fail("SELECTED_GROUP_REPLAY_INVALID", group.id);
    }
    const globalIndexByPath = new Map(group.ordered.map((entry, index) => [entry.path, index]));
    for (const entry of group.entries) {
      const nextOffset = group.ordered[globalIndexByPath.get(entry.path) + 1]?.localHeaderOffset
        ?? ARCHIVE_CENTRAL_OFFSET;
      const begin = entry.localHeaderOffset - group.start;
      const finish = nextOffset - group.start;
      const parsed = parseLocalRecord(bytes.subarray(begin, finish), entry);
      const expected = { internalPath: entry.path, rawPath: `raw/${entry.path}`, rangePath,
        rangeRelativeStart: begin, rangeRelativeEndExclusive: finish,
        flags: entry.flags, compressionMethod: entry.compressionMethod,
        crc32: entry.crc32, compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
        localHeaderOffset: entry.localHeaderOffset, localHeaderBytes: parsed.headerBytes,
        localRecordBytes: parsed.localRecordBytes,
        dataDescriptorPresent: parsed.descriptor.present,
        dataDescriptorSignaturePresent: parsed.descriptor.signaturePresent,
        dataDescriptorBytes: parsed.descriptor.bytes,
        rawSha256: airlabSha256(parsed.raw), compressedSha256: airlabSha256(parsed.compressed) };
      const declared = selectedByPath.get(entry.path);
      if (!same(expected, declared)) fail("SELECTED_OBJECT_REPLAY_INVALID", entry.path);
      const raw = stableRead(root, declared.rawPath,
        { sizeBytes: declared.uncompressedSize, sha256: declared.rawSha256 },
        MAX_RAW_OBJECT_BYTES);
      if (!raw.equals(parsed.raw)) fail("SELECTED_RAW_REPLAY_INVALID", entry.path);
      rawByPath.set(entry.path, raw);
    }
  }
  const transcript = parseJson(supportBytes.get("source-support/range-transcript.json"),
    "RANGE_TRANSCRIPT_JSON_INVALID");
  const expectedTranscript = { archiveUrl: AIRLAB_ARCHIVE_URL, plainHttpTransport: true,
    headBefore, headAfter,
    strictRanges: [manifest.sourceSupportObjects.find((item) =>
      item.path === "source-support/archive-tail.bin"),
    manifest.sourceSupportObjects.find((item) =>
      item.path === "source-support/archive-central-directory.bin"),
    ...manifest.rangeObjects].map((item) => ({ path: item.path, sizeBytes: item.sizeBytes,
      sha256: item.sha256, range: item.range })) };
  if (!same(transcript, expectedTranscript)) fail("RANGE_TRANSCRIPT_REPLAY_INVALID");
  const observations = observationsFromRaw(rawByPath, annotations);
  const after = pathSnapshot(root);
  if (!same(before, after)) fail("SOURCE_TREE_CHANGED_DURING_REPLAY");
  const rootObjects = expectedFiles.filter((item) => item !== "acquisition-manifest.json")
    .map((item) => {
      const bytes = item === "archive-inventory.json" ? inventoryBytes
        : supportBytes.get(item) ?? rangeBytes.get(item) ?? rawByPath.get(item.replace(/^raw\//u, ""));
      if (!bytes) fail("SOURCE_ROOT_OBJECT_MISSING", item);
      return { path: item, sizeBytes: bytes.length, sha256: airlabSha256(bytes) };
    }).sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({ ok: true, verificationLevel: "FULL_BOUNDED_SOURCE_REPLAY",
    sourceDirectory: root, manifest, inventory, annotations, observations,
    manifestFileSha256: airlabSha256(manifestBytes),
    sourceRoot: airlabDigest(rootObjects, `${AIRLAB_SOURCE_SCHEMA}/source-root`) });
}

export function buildAirlabFailureReportFromSource(sourceDirectory) {
  const checked = verifyAirlabFailureSourceDirectory(sourceDirectory);
  const body = {
    schema: AIRLAB_REPORT_SCHEMA,
    capturedAt: AIRLAB_FROZEN_AT,
    source: { repository: AIRLAB_REPOSITORY,
      pinnedCommit: AIRLAB_REPOSITORY_COMMIT,
      archiveUrl: AIRLAB_ARCHIVE_URL,
      archiveBytes: AIRLAB_ARCHIVE_BYTES,
      archiveEtag: AIRLAB_ARCHIVE_ETAG,
      archiveLastModified: AIRLAB_ARCHIVE_LAST_MODIFIED,
      manifestHash: checked.manifest.manifestHash,
      manifestFileSha256: checked.manifestFileSha256,
      sourceRoot: checked.sourceRoot,
      verificationLevel: checked.verificationLevel,
      fullArchiveDownloaded: false,
      completeCentralDirectoryEnumerated: true,
      plainHttpTransport: true,
      providerIdentityCryptographicallyVerified: false,
      transportIntegrityCryptographicallyVerified: false },
    denominators: {
      completeArchiveInventory: { class: "PUBLIC_ARCHIVE_ZIP_CENTRAL_DIRECTORY_ENTRY",
        units: 53_165, fileUnits: 52_685, directoryUnits: 480,
        fullPayloadDownloaded: false },
      publisherAnnotationRows: { class: "PUBLISHER_BINARY_ANNOTATION_ROW",
        units: 252, completeExactMultimodalJoins: 229,
        publisherSuccessLabel0Rows: 89, publisherFailureLabel1Rows: 163 },
      boundedExecutions: { class: "REAL_ROBOT_PUBLISHER_BINARY_LABELED_MULTIMODAL_EXECUTION",
        units: 2, publisherSuccessLabel0Units: 1, publisherFailureLabel1Units: 1,
        selectedFileUnits: 236, selectedCompressedBytes: 46_704_177,
        selectedUncompressedBytes: 93_021_329,
        completeRgbTimestampDepthAudioClosure: true },
      paperExtendedDatasetCensus: { units: null, usedForThisArtifact: false,
        reason: "PINNED_PUBLIC_ARCHIVE_HAS_231_AUDIO_RECORDINGS_NOT_THE_PAPER_REPORTED_324" },
      crossTotal: null,
    },
    observations: checked.observations,
    truthBoundary: {
      publisherPhysicalRobotDatasetClaimPresent: true,
      physicalExecutionIndependentlyVerifiedByOutsider: false,
      publisherBinaryLabelsEstablished: true,
      publisherLabel0MeaningFromPinnedNotebook: "SUCCESS",
      publisherLabel1MeaningFromPinnedNotebook: "FAILURE",
      taskOutcomeEstablishedOnlyAsPublisherLabel: true,
      independentOutcomeEstablished: false,
      physicalEffectIndependentlyReplayed: false,
      failureTypeEstablished: false,
      failureStartTimestampEstablished: false,
      actionOrRobotStateTraceEstablished: false,
      attemptCensusEstablished: false,
      recoveryEstablished: false,
      longitudinalFollowupEstablished: false,
      affectedPartyOutcomeEstablished: false,
    },
    segments: {
      opportunityCensus: { units: 0, established: false },
      delegationAuthorization: { units: 0, established: false },
      actionTrace: { units: 0, established: false },
      effect: { units: 0, independentlyEstablished: false },
      outcome: { publisherBinaryLabelUnits: 2, independentUnits: 0,
        sourceNativeAttributionOnly: true },
      recovery: { units: 0, established: false },
      longitudinal: { units: 0, established: false },
    },
    rights: { publisherDatasetLicenseClaimInPinnedMaterials: null,
      repositoryCodeLicenseClaim: "MIT",
      repositoryMitLicenseAppliedToDatasetBytes: false,
      status: "FAIL_CLOSED_NO_DATASET_LICENSE",
      legalAdjudicationPerformed: false,
      redistributionAuthorizedByArtifact: false,
      productionTrainingAuthorizedByOutsider: false },
    privacy: { rgbImageryPresent: true, depthImageryPresent: true, audioPresent: true,
      noPiiGuaranteed: false, humanPresenceExcludedByVerifiedAnalysis: false,
      biometricContentExcludedByVerifiedAnalysis: false,
      networkProjectionAllowed: false },
    useBoundary: { status: "QUARANTINE_EVAL_ONLY",
      offlineEvaluationOnly: true, publicDeploymentReady: false,
      governedTrainingRows: 0, modelTrainingAuthorized: false },
    network: { networkAdmissionRows: 0, published: false, externalAnchorEstablished: false },
    economics: { CEU: 0, pricingUnits: 0, insuranceUnits: 0 },
    authority: { executionAuthorityEstablished: false, trainingAuthorityEstablished: false,
      delegationAuthorityEstablished: false, safetyAuthorityEstablished: false,
      authorityUnits: 0 },
  };
  return Object.freeze({ ...body,
    artifactHash: airlabDigest(body, `${AIRLAB_REPORT_SCHEMA}/artifact`) });
}

function assertReportBoundary(report) {
  if (!exactObject(report)) fail("REPORT_INVALID");
  const { artifactHash, ...body } = report;
  if (report.schema !== AIRLAB_REPORT_SCHEMA || report.capturedAt !== AIRLAB_FROZEN_AT
    || artifactHash !== airlabDigest(body, `${AIRLAB_REPORT_SCHEMA}/artifact`)
    || report.source?.repository !== AIRLAB_REPOSITORY
    || report.source?.pinnedCommit !== AIRLAB_REPOSITORY_COMMIT
    || report.source?.archiveUrl !== AIRLAB_ARCHIVE_URL
    || report.source?.archiveBytes !== AIRLAB_ARCHIVE_BYTES
    || report.source?.archiveEtag !== AIRLAB_ARCHIVE_ETAG
    || report.source?.plainHttpTransport !== true
    || report.source?.providerIdentityCryptographicallyVerified !== false
    || report.source?.transportIntegrityCryptographicallyVerified !== false
    || report.source?.fullArchiveDownloaded !== false
    || report.source?.completeCentralDirectoryEnumerated !== true
    || !HASH.test(report.source?.manifestHash ?? "")
    || !HASH.test(report.source?.manifestFileSha256 ?? "")
    || !HASH.test(report.source?.sourceRoot ?? "")) fail("REPORT_SOURCE_INVALID");
  if (report.denominators?.completeArchiveInventory?.units !== 53_165
    || report.denominators?.boundedExecutions?.units !== 2
    || report.denominators?.boundedExecutions?.publisherSuccessLabel0Units !== 1
    || report.denominators?.boundedExecutions?.publisherFailureLabel1Units !== 1
    || report.denominators?.boundedExecutions?.selectedFileUnits !== 236
    || report.denominators?.boundedExecutions?.completeRgbTimestampDepthAudioClosure !== true
    || report.denominators?.paperExtendedDatasetCensus?.units !== null
    || report.denominators?.paperExtendedDatasetCensus?.usedForThisArtifact !== false
    || report.denominators?.crossTotal !== null) fail("REPORT_DENOMINATOR_INVALID");
  if (!Array.isArray(report.observations?.executions)
    || report.observations.executions.length !== 2
    || !same(report.observations.executions.map((item) => ({ recordingId: item.recordingId,
      publisherBinaryLabel: item.publisherBinaryLabel,
      publisherLabelMeaning: item.publisherLabelMeaning })), [
      { recordingId: 49, publisherBinaryLabel: 1, publisherLabelMeaning: "FAILURE" },
      { recordingId: 50, publisherBinaryLabel: 0, publisherLabelMeaning: "SUCCESS" },
    ]) || report.observations.executions.some((item) => item.frames?.units !== 39
      || item.frames?.exactRgbTimestampDepthStemJoin !== true
      || item.timestampText?.strictlyIncreasing !== true)
    || report.observations?.actionOrRobotStateTracePresent !== false
    || report.observations?.failureTypeAnnotationPresent !== false
    || report.observations?.failureStartTimestampAnnotationPresent !== false) {
    fail("REPORT_OBSERVATION_INVALID");
  }
  if (report.truthBoundary?.publisherBinaryLabelsEstablished !== true
    || report.truthBoundary?.taskOutcomeEstablishedOnlyAsPublisherLabel !== true
    || report.truthBoundary?.independentOutcomeEstablished !== false
    || report.truthBoundary?.physicalEffectIndependentlyReplayed !== false
    || report.truthBoundary?.failureTypeEstablished !== false
    || report.truthBoundary?.failureStartTimestampEstablished !== false
    || report.truthBoundary?.actionOrRobotStateTraceEstablished !== false
    || report.truthBoundary?.attemptCensusEstablished !== false
    || report.truthBoundary?.recoveryEstablished !== false
    || report.truthBoundary?.longitudinalFollowupEstablished !== false
    || report.segments?.opportunityCensus?.units !== 0
    || report.segments?.delegationAuthorization?.units !== 0
    || report.segments?.actionTrace?.units !== 0
    || report.segments?.effect?.units !== 0
    || report.segments?.outcome?.publisherBinaryLabelUnits !== 2
    || report.segments?.outcome?.independentUnits !== 0
    || report.segments?.recovery?.units !== 0
    || report.segments?.longitudinal?.units !== 0) fail("REPORT_TRUTH_BOUNDARY_INVALID");
  if (report.rights?.publisherDatasetLicenseClaimInPinnedMaterials !== null
    || report.rights?.repositoryCodeLicenseClaim !== "MIT"
    || report.rights?.repositoryMitLicenseAppliedToDatasetBytes !== false
    || report.rights?.status !== "FAIL_CLOSED_NO_DATASET_LICENSE"
    || report.rights?.redistributionAuthorizedByArtifact !== false
    || report.rights?.productionTrainingAuthorizedByOutsider !== false
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

export function verifyAirlabFailureReport(report) {
  try { assertReportBoundary(report); return Object.freeze({ ok: true,
    verificationLevel: "SELF_SEALED_BOUNDARY_CHECK" }); }
  catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function verifyAirlabFailureReportWithSource(report, sourceDirectory) {
  try {
    assertReportBoundary(report);
    const rebuilt = buildAirlabFailureReportFromSource(sourceDirectory);
    if (!same(report, rebuilt)) fail("FULL_REPLAY_REPORT_MISMATCH");
    return Object.freeze({ ok: true, verificationLevel: "FULL_BOUNDED_SOURCE_REDERIVED",
      sourceRoot: rebuilt.source.sourceRoot });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function buildAirlabFailureReceipt(report, reportBytes) {
  assertReportBoundary(report);
  if (!Buffer.isBuffer(reportBytes) || !reportBytes.equals(canonicalBytes(report))) {
    fail("RECEIPT_REPORT_BYTES_INVALID");
  }
  const body = { schema: AIRLAB_RECEIPT_SCHEMA, capturedAt: AIRLAB_FROZEN_AT,
    reportSchema: AIRLAB_REPORT_SCHEMA, reportFileSha256: airlabSha256(reportBytes),
    artifactHash: report.artifactHash, sourceRoot: report.source.sourceRoot,
    manifestHash: report.source.manifestHash,
    summary: { boundedExecutions: 2, publisherSuccessLabel0Units: 1,
      publisherFailureLabel1Units: 1, selectedFiles: 236,
      independentOutcomeUnits: 0, recoveryUnits: 0, governedTrainingRows: 0,
      networkAdmissionRows: 0, CEU: 0, pricingUnits: 0, authorityUnits: 0 },
    verificationLevel: "FULL_BOUNDED_SOURCE_REDERIVED" };
  return Object.freeze({ ...body,
    receiptHash: airlabDigest(body, `${AIRLAB_RECEIPT_SCHEMA}/receipt`) });
}

export function verifyAirlabFailureReceipt(receipt, report, reportBytes) {
  try {
    const expected = buildAirlabFailureReceipt(report, reportBytes);
    if (!same(receipt, expected)) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function publishAirlabFailureArtifactDirectory(stagingDirectory, targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (target === path.parse(target).root || existsSync(target)) {
    fail("PUBLISH_TARGET_EXISTS_OR_BROAD", target);
  }
  const stagingStat = lstatSync(staging);
  if (!stagingStat.isDirectory() || stagingStat.isSymbolicLink()) fail("PUBLISH_STAGING_UNSAFE");
  const names = sorted(readdirSync(staging));
  if (!same(names, ["report.json", "run-receipt.json", "source"])) {
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

export function verifyAirlabFailureArtifactDirectory(artifactDirectory) {
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
    const replay = verifyAirlabFailureReportWithSource(report, path.join(root, "source"));
    if (!replay.ok) fail("ARTIFACT_SOURCE_REPLAY_INVALID", replay.error);
    if (!verifyAirlabFailureReceipt(receipt, report, reportBytes).ok) {
      fail("ARTIFACT_RECEIPT_INVALID");
    }
    return Object.freeze({ ok: true, verificationLevel: replay.verificationLevel,
      boundedExecutions: 2, publisherBinaryOutcomeLabels: 2,
      independentOutcomeUnits: 0, recoveryUnits: 0, governedTrainingRows: 0,
      networkAdmissionRows: 0, CEU: 0, pricingUnits: 0, authorityUnits: 0 });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}
