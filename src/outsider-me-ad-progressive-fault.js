/*
 * Bounded ME-AD progressive mechanical-fault slice.
 *
 * The 10.8 GB parent archive is never downloaded. The official Zenodo record
 * is bracketed, the complete ZIP64 central directory is replayed using fixed
 * 512 KiB strict-206 ranges, and only four source documents plus three raw
 * CSV traces from one fixed-layout operation are extracted. Publisher health
 * and fault labels remain source claims. This module creates no task outcome,
 * recovery, delegation, authority, CEU, network contribution, or training
 * permission.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmSync, rmdirSync, statSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const ME_AD_RECORD_ID = 20_817_531;
export const ME_AD_DOI = "10.5281/zenodo.20817531";
export const ME_AD_ARCHIVE_NAME = "ME-AD.zip";
export const ME_AD_ARCHIVE_BYTES = 10_788_420_015;
export const ME_AD_ARCHIVE_MD5 = "md5:c74dedb954931034d1870db8cd13e33b";
export const ME_AD_LICENSE = "CC-BY-SA-4.0";
export const ME_AD_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const ME_AD_SOURCE_SCHEMA = "outsider/me-ad-progressive-fault-pinned-source/v1";
export const ME_AD_INVENTORY_SCHEMA = "outsider/me-ad-zip64-inventory/v1";
export const ME_AD_REPORT_SCHEMA = "outsider/me-ad-progressive-fault-slice/v1";
export const ME_AD_RECEIPT_SCHEMA = "outsider/me-ad-progressive-fault-run-receipt/v1";

const RECORD_URL = "https://zenodo.org/api/records/" + ME_AD_RECORD_ID;
const CONTENT_URL = RECORD_URL + "/files/" + encodeURIComponent(ME_AD_ARCHIVE_NAME)
  + "/content";
const RECORD_BYTES = 7148;
const RECORD_SHA256
  = "sha256:7c7622693979c1f49f0ce1844aeba6d8ddbbf796623577fa84eebd121748fa1b";
const FILE_ID = "bb16a23a-c39d-48f2-aa35-2e3e7a9368f6";
const CENTRAL_OFFSET = 10_780_812_659;
const CENTRAL_BYTES = 7_607_258;
const CENTRAL_END = CENTRAL_OFFSET + CENTRAL_BYTES - 1;
const CENTRAL_SHA256
  = "sha256:ca4c0e0a1f6d6c2e21c49cbac2ef7fd88bec25fdf5eef50567087f4ec62ee932";
const CENTRAL_ENTRIES = 57_687;
const CENTRAL_FILES = 57_652;
const CENTRAL_DIRECTORIES = 35;
const TAIL_BYTES = 128 * 1024;
const TAIL_START = ME_AD_ARCHIVE_BYTES - TAIL_BYTES;
const TAIL_SHA256
  = "sha256:7f23de4f969b0f1b73fd577e1dae18700edc22ea3b9409caa4a52f17ef12147c";
const ZIP64_OFFSET = 10_788_419_917;
const ZIP64_LOCATOR_OFFSET = 10_788_419_973;
const EOCD_OFFSET = 10_788_419_993;
const RANGE_CHUNK_BYTES = 512 * 1024;
const RANGE_CONCURRENCY = 4;
const RANGE_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 180_000;
const MAX_ENTRY_UNCOMPRESSED_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_COMPRESSED_BYTES = 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const ZIP64_EOCD = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP_DESCRIPTOR = 0x08074b50;

const OPERATION_COUNTS = Object.freeze({
  1050: 2063, 1051: 2061, 1052: 2054, 1053: 2054,
  1100: 1931, 1101: 1930, 1102: 1929, 1103: 1929,
  2000: 1605, 2100: 1599, 2200: 1608, 2300: 1603,
  2400: 1602, 2500: 1631, 3000: 1595, 3100: 1630,
});
const FIXED_LAYOUT_OPERATIONS = Object.freeze([
  "1050", "1051", "1052", "1053", "1100", "1101", "1102", "1103",
]);

const ROOT_ENTRY_SPECS = Object.freeze([
  {
    role: "README", key: "readme", path: "ME-AD/README.md",
    localPath: "raw/README.md", rawBytes: 9209,
    rawSha256: "sha256:2de25f525e06ac8ffb2c3f925c9338811dfaa1f0c38744cb30ec5db1e9f3ad70",
  },
  {
    role: "IMPORT_DATA", key: "import-data", path: "ME-AD/Import_data.py",
    localPath: "raw/Import_data.py", rawBytes: 10434,
    rawSha256: "sha256:6bf5c58e2de048d5f79820b8b16feb4f41e681a3ab1b27c39b29362ee687ae6a",
  },
  {
    role: "GENERATE_TASKS", key: "generate-tasks", path: "ME-AD/Generate_tasks.py",
    localPath: "raw/Generate_tasks.py", rawBytes: 3429,
    rawSha256: "sha256:d98d4cb032aaec5095a927bdf483d0a2ebb9646e5245e1fc250e6c69d3520829",
  },
  {
    role: "COMBINE_DATASETS", key: "combine-datasets", path: "ME-AD/Combine_datasets.py",
    localPath: "raw/Combine_datasets.py", rawBytes: 4216,
    rawSha256: "sha256:c183190e1622629505a53c58f430b79d91904c04a43a43efb5356a4854b8ee00",
  },
]);

const EXPECTED_SELECTED = Object.freeze([
  {
    role: "SOURCE_HEALTHY_EARLY", key: "healthy-early",
    cycleOrdinalZeroBased: 0, sampleRangeFirst: 1, sampleRangeLast: 3,
    path: "ME-AD/CSV/1100_CSV/Remove_grease_Data(000001-000003).csv",
    localPath: "raw/healthy-early.csv", flags: 8, compressionMethod: 8,
    crc32: "3cfa93bf", compressedSize: 116553, uncompressedSize: 323274,
    localHeaderOffset: 1326281085,
    rawSha256: "sha256:8a959f06e224dfc0a9b94c6dcf9305c9f78e0d93271ae391a3e8c6ada3dae543",
  },
  {
    role: "UNLABELED_TEMPORAL_MIDPOINT", key: "temporal-midpoint",
    cycleOrdinalZeroBased: 965, sampleRangeFirst: 27679, sampleRangeLast: 27696,
    path: "ME-AD/CSV/1100_CSV/Remove_grease_Data(027679-027696).csv",
    localPath: "raw/temporal-midpoint.csv", flags: 8, compressionMethod: 8,
    crc32: "c4d57e10", compressedSize: 117688, uncompressedSize: 324521,
    localHeaderOffset: 1341494437,
    rawSha256: "sha256:9ee5650d20fde6a55e0eb72041dd29fc49faee2a923699d1666187cdfa7e4b58",
  },
  {
    role: "SOURCE_FAULTY_LATE", key: "faulty-late",
    cycleOrdinalZeroBased: 1930, sampleRangeFirst: 55006, sampleRangeLast: 55036,
    path: "ME-AD/CSV/1100_CSV/Remove_grease_Data(055006-055036).csv",
    localPath: "raw/faulty-late.csv", flags: 8, compressionMethod: 8,
    crc32: "81c6cbdd", compressedSize: 118347, uncompressedSize: 326091,
    localHeaderOffset: 1374391761,
    rawSha256: "sha256:bfc73ff3dee12a36923b4397554781d1477547c6fdbbb1f02d7ba50a27769ee3",
  },
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? "ME_AD_" + code : "ME_AD_" + code + ":" + detail);
}

export function meAdSha256(bytes) {
  return "sha256:" + createHash("sha256").update(bytes).digest("hex");
}

function digest(domain, value) {
  return meAdSha256(Buffer.from(domain + "\0" + canonicalizeStrict(value), "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(canonicalizeStrict(value) + "\n", "utf8");
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function safeJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function readU64(bytes, offset, code) {
  if (offset < 0 || offset + 8 > bytes.length) fail(code);
  const value = bytes.readUInt32LE(offset)
    + bytes.readUInt32LE(offset + 4) * 0x1_0000_0000;
  if (!Number.isSafeInteger(value)) fail(code);
  return value;
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
      await reader.cancel();
      fail("FETCH_STREAM_SIZE_INVALID");
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1 || expectedBytes !== null && total !== expectedBytes) {
    fail("FETCH_BODY_SIZE_INVALID", String(total));
  }
  return Buffer.concat(chunks, total);
}

function retryDelay(attempt) {
  return 1000 * (2 ** attempt);
}

async function fetchRecord(fetchImpl) {
  const url = checkedZenodoUrl(RECORD_URL);
  let last = null;
  for (let attempt = 0; attempt < RANGE_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        redirect: "error",
        headers: { accept: "application/json", "accept-encoding": "identity",
          "user-agent": "outsider-me-ad-progressive-fault/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (response.status !== 200 || new URL(response.url || url).origin !== url.origin
        || response.headers.get("content-encoding") !== null) {
        const transient = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
        if (!transient || attempt === RANGE_ATTEMPTS - 1) {
          fail("RECORD_HTTP_INVALID", String(response.status));
        }
        if (response.body) await response.body.cancel();
        await pause(retryDelay(attempt));
        continue;
      }
      const bytes = await streamResponse(response, RECORD_BYTES, RECORD_BYTES);
      if (meAdSha256(bytes) !== RECORD_SHA256) fail("RECORD_BYTES_CHANGED");
      return { bytes, value: safeJson(bytes, "RECORD_JSON_INVALID") };
    } catch (error) {
      if (String(error?.message ?? error).startsWith("ME_AD_RECORD_")) throw error;
      last = error;
      if (attempt === RANGE_ATTEMPTS - 1) {
        fail("RECORD_FETCH_FAILED", String(last?.message ?? last));
      }
      await pause(retryDelay(attempt));
    }
  }
  fail("RECORD_FETCH_FAILED");
}

function recordProjection(record) {
  const file = Array.isArray(record?.files) && record.files.length === 1
    ? record.files[0] : null;
  if (record?.id !== ME_AD_RECORD_ID || record?.doi !== ME_AD_DOI
    || record?.metadata?.doi !== ME_AD_DOI
    || record?.metadata?.title !== "ME-AD: Progressive Robotics Anomaly Detection Dataset"
    || record?.metadata?.publication_date !== "2026-06-23"
    || record?.metadata?.access_right !== "open"
    || record?.metadata?.license?.id !== "cc-by-sa-4.0"
    || record?.metadata?.resource_type?.type !== "dataset"
    || record?.created !== "2026-06-23T17:18:05.289774+00:00"
    || record?.modified !== "2026-06-23T17:18:05.494481+00:00"
    || record?.revision !== 4 || record?.status !== "published" || record?.state !== "done"
    || file?.id !== FILE_ID || file?.key !== ME_AD_ARCHIVE_NAME
    || file?.size !== ME_AD_ARCHIVE_BYTES || file?.checksum !== ME_AD_ARCHIVE_MD5
    || file?.links?.self !== CONTENT_URL) fail("RECORD_PROFILE_CHANGED");
  return {
    recordId: ME_AD_RECORD_ID,
    doi: ME_AD_DOI,
    title: record.metadata.title,
    publicationDate: record.metadata.publication_date,
    created: record.created,
    modified: record.modified,
    revision: record.revision,
    accessRight: "open",
    licenseClaim: ME_AD_LICENSE,
    status: "published",
    archive: {
      id: FILE_ID,
      key: ME_AD_ARCHIVE_NAME,
      sizeBytes: ME_AD_ARCHIVE_BYTES,
      publisherMd5Claim: ME_AD_ARCHIVE_MD5,
      contentUrl: CONTENT_URL,
    },
  };
}

async function strictRangePart(start, end, fetchImpl) {
  const url = checkedZenodoUrl(CONTENT_URL);
  const expectedBytes = end - start + 1;
  let last = null;
  for (let attempt = 0; attempt < RANGE_ATTEMPTS; attempt += 1) {
    let response = null;
    try {
      response = await fetchImpl(url, {
        redirect: "error",
        headers: {
          "accept-encoding": "identity",
          range: "bytes=" + start + "-" + end,
          "user-agent": "outsider-me-ad-progressive-fault/1.0",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const contentRange = response.headers.get("content-range");
      if (response.status === 206) {
        if (contentRange !== "bytes " + start + "-" + end + "/" + ME_AD_ARCHIVE_BYTES
          || response.headers.get("accept-ranges") !== "bytes"
          || response.headers.get("content-encoding") !== null
          || new URL(response.url || url).origin !== url.origin) {
          fail("STRICT_RANGE_UNSUPPORTED", response.status + ":" + contentRange);
        }
        const bytes = await streamResponse(response, expectedBytes, expectedBytes);
        return {
          bytes, start, end, contentRange, sizeBytes: bytes.length,
          sha256: meAdSha256(bytes),
        };
      }
      const transient = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
      if (!transient || attempt === RANGE_ATTEMPTS - 1) {
        fail("STRICT_RANGE_UNSUPPORTED", response.status + ":" + contentRange);
      }
      if (response.body) await response.body.cancel();
      await pause(retryDelay(attempt));
    } catch (error) {
      if (String(error?.message ?? error).startsWith("ME_AD_STRICT_RANGE_")) throw error;
      last = error;
      try { await response?.body?.cancel?.(); } catch {}
      if (attempt === RANGE_ATTEMPTS - 1) {
        fail("STRICT_RANGE_FETCH_FAILED",
          start + "-" + end + ":" + String(last?.message ?? last));
      }
      await pause(retryDelay(attempt));
    }
  }
  fail("STRICT_RANGE_FETCH_FAILED", start + "-" + end);
}

async function strictRangeFetch(start, end, maximumBytes, fetchImpl) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0
    || end < start || end >= ME_AD_ARCHIVE_BYTES
    || end - start + 1 > maximumBytes) fail("RANGE_INVALID", start + "-" + end);
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
        chunks[index] = await strictRangePart(plans[index].start, plans[index].end,
          fetchImpl);
      }
    });
  const settled = await Promise.allSettled(workers);
  const rejected = settled.find((result) => result.status === "rejected");
  if (rejected) throw rejected.reason;
  const bytes = Buffer.concat(chunks.map((chunk) => chunk.bytes), end - start + 1);
  return {
    bytes, start, end,
    contentRange: chunks.length === 1 ? chunks[0].contentRange : "STRICT_206_CHUNK_SET",
    chunks: chunks.map((chunk) => ({
      start: chunk.start, end: chunk.end, contentRange: chunk.contentRange,
      sizeBytes: chunk.sizeBytes, sha256: chunk.sha256,
    })),
    sha256: meAdSha256(bytes),
  };
}

function rangeProjection(value) {
  return {
    start: value.start, end: value.end,
    contentRange: value.contentRange, chunks: value.chunks,
  };
}

function findEocd(tail) {
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) !== ZIP_EOCD) continue;
    const commentBytes = tail.readUInt16LE(offset + 20);
    if (offset + 22 + commentBytes !== tail.length) continue;
    if (tail.readUInt16LE(offset + 4) !== 0 || tail.readUInt16LE(offset + 6) !== 0) {
      fail("ZIP_MULTIDISK_UNSUPPORTED");
    }
    return { relativeOffset: offset, absoluteOffset: TAIL_START + offset,
      commentBytes, bytes: tail.subarray(offset) };
  }
  fail("ZIP_EOCD_NOT_FOUND");
}

function parseZip64(bytes, relativeOffset) {
  if (relativeOffset < 0 || relativeOffset + 56 > bytes.length
    || bytes.readUInt32LE(relativeOffset) !== ZIP64_EOCD) fail("ZIP64_RECORD_INVALID");
  const recordSize = readU64(bytes, relativeOffset + 4, "ZIP64_SIZE_INVALID");
  if (recordSize !== 44 || bytes.readUInt32LE(relativeOffset + 16) !== 0
    || bytes.readUInt32LE(relativeOffset + 20) !== 0) fail("ZIP64_PROFILE_INVALID");
  return {
    offset: TAIL_START + relativeOffset,
    recordBytes: recordSize + 12,
    entriesOnDisk: readU64(bytes, relativeOffset + 24, "ZIP64_ENTRY_INVALID"),
    totalEntries: readU64(bytes, relativeOffset + 32, "ZIP64_ENTRY_INVALID"),
    centralBytes: readU64(bytes, relativeOffset + 40, "ZIP64_CENTRAL_INVALID"),
    centralOffset: readU64(bytes, relativeOffset + 48, "ZIP64_CENTRAL_INVALID"),
    bytes: bytes.subarray(relativeOffset, relativeOffset + recordSize + 12),
  };
}

function parseExtraFields(extra, saturated, code) {
  let offset = 0;
  let zip64 = {};
  while (offset < extra.length) {
    if (offset + 4 > extra.length) fail(code + "_EXTRA_TRUNCATED");
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > extra.length) fail(code + "_EXTRA_TRUNCATED");
    if (id === 1) {
      const data = extra.subarray(offset, offset + size);
      let cursor = 0;
      for (const name of ["uncompressedSize", "compressedSize", "localHeaderOffset"]) {
        if (!saturated[name]) continue;
        zip64[name] = readU64(data, cursor, code + "_ZIP64_INVALID");
        cursor += 8;
      }
      if (saturated.diskStart) {
        if (cursor + 4 > data.length) fail(code + "_ZIP64_INVALID");
        zip64.diskStart = data.readUInt32LE(cursor);
        cursor += 4;
      }
      if (cursor > data.length) fail(code + "_ZIP64_INVALID");
    }
    offset += size;
  }
  return zip64;
}

function safeArchivePath(name) {
  if (typeof name !== "string" || name.length < 1 || !/^[\x20-\x7e]+$/u.test(name)
    || name.includes("\\") || name.startsWith("/")
    || name.split("/").some((part, index, pieces) =>
      part === "." || part === ".." || part === "" && index !== pieces.length - 1)) {
    fail("ZIP_PATH_UNSAFE", name);
  }
  return name;
}

export function parseMeAdCentralDirectory(bytes, expectedEntries = CENTRAL_ENTRIES) {
  if (!Buffer.isBuffer(bytes) || bytes.length !== CENTRAL_BYTES) {
    fail("CENTRAL_BYTES_INVALID");
  }
  const entries = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== ZIP_CENTRAL) {
      fail("CENTRAL_HEADER_INVALID", String(offset));
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const compressionMethod = bytes.readUInt16LE(offset + 10);
    const crc32 = bytes.readUInt32LE(offset + 16);
    const compressed32 = bytes.readUInt32LE(offset + 20);
    const uncompressed32 = bytes.readUInt32LE(offset + 24);
    const nameBytes = bytes.readUInt16LE(offset + 28);
    const extraBytes = bytes.readUInt16LE(offset + 30);
    const commentBytes = bytes.readUInt16LE(offset + 32);
    const disk32 = bytes.readUInt16LE(offset + 34);
    const localOffset32 = bytes.readUInt32LE(offset + 42);
    const finish = offset + 46 + nameBytes + extraBytes + commentBytes;
    if (finish > bytes.length) fail("CENTRAL_ENTRY_TRUNCATED");
    const rawName = bytes.subarray(offset + 46, offset + 46 + nameBytes);
    if ((flags & 0x800) === 0 && rawName.some((value) => value > 0x7f)) {
      fail("CENTRAL_NON_UTF8_UNSUPPORTED");
    }
    const entryPath = safeArchivePath(rawName.toString("utf8"));
    const saturated = {
      uncompressedSize: uncompressed32 === 0xffffffff,
      compressedSize: compressed32 === 0xffffffff,
      localHeaderOffset: localOffset32 === 0xffffffff,
      diskStart: disk32 === 0xffff,
    };
    const extra = bytes.subarray(offset + 46 + nameBytes,
      offset + 46 + nameBytes + extraBytes);
    const zip64 = parseExtraFields(extra, saturated, "CENTRAL");
    const compressedSize = saturated.compressedSize
      ? zip64.compressedSize : compressed32;
    const uncompressedSize = saturated.uncompressedSize
      ? zip64.uncompressedSize : uncompressed32;
    const localHeaderOffset = saturated.localHeaderOffset
      ? zip64.localHeaderOffset : localOffset32;
    const diskStart = saturated.diskStart ? zip64.diskStart : disk32;
    if (![compressedSize, uncompressedSize, localHeaderOffset, diskStart]
      .every(Number.isSafeInteger) || diskStart !== 0 || ![0, 8].includes(compressionMethod)
      || (flags & 1) !== 0) fail("CENTRAL_ENTRY_VALUE_INVALID", entryPath);
    entries.push({
      path: entryPath,
      directory: entryPath.endsWith("/"),
      flags,
      compressionMethod,
      crc32: crc32.toString(16).padStart(8, "0"),
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
      centralHeaderOffset: offset,
      centralHeaderBytes: finish - offset,
    });
    offset = finish;
  }
  if (entries.length !== expectedEntries
    || new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("CENTRAL_COUNT_OR_DUPLICATE", String(entries.length));
  }
  return entries;
}

function publicEntry(entry) {
  return {
    path: entry.path,
    flags: entry.flags,
    compressionMethod: entry.compressionMethod,
    crc32: entry.crc32,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    localHeaderOffset: entry.localHeaderOffset,
    centralHeaderOffset: entry.centralHeaderOffset,
    centralHeaderBytes: entry.centralHeaderBytes,
  };
}

function buildInventory(entries, zip) {
  const files = entries.filter((entry) => !entry.directory);
  const directories = entries.filter((entry) => entry.directory);
  const csvPattern
    = /^ME-AD\/CSV\/(\d{4})_CSV\/Remove_grease_Data\((\d{6})-(\d{6})\)\.csv$/u;
  const pandasPattern
    = /^ME-AD\/Pandas\/(\d{4})\/cleaned_dataset_(\d+)\.pkl$/u;
  const csvGroups = new Map();
  const pandasGroups = new Map();
  const roots = [];
  for (const entry of files) {
    let match = csvPattern.exec(entry.path);
    if (match) {
      const group = csvGroups.get(match[1]) ?? [];
      group.push({ entry, sampleFirst: Number(match[2]), sampleLast: Number(match[3]) });
      csvGroups.set(match[1], group);
      continue;
    }
    match = pandasPattern.exec(entry.path);
    if (match) {
      const group = pandasGroups.get(match[1]) ?? [];
      group.push({ entry, index: Number(match[2]) });
      pandasGroups.set(match[1], group);
      continue;
    }
    if (ROOT_ENTRY_SPECS.some((spec) => spec.path === entry.path)) {
      roots.push(entry);
      continue;
    }
    fail("INVENTORY_UNEXPECTED_FILE", entry.path);
  }
  if (files.length !== CENTRAL_FILES || directories.length !== CENTRAL_DIRECTORIES
    || csvGroups.size !== 16 || pandasGroups.size !== 16 || roots.length !== 4) {
    fail("INVENTORY_COUNTS_INVALID");
  }
  const operationCounts = {};
  const operationSummaries = [];
  const candidateSelections = [];
  for (const operationCode of Object.keys(OPERATION_COUNTS).sort()) {
    const csv = csvGroups.get(operationCode);
    const pandas = pandasGroups.get(operationCode);
    const expected = OPERATION_COUNTS[operationCode];
    if (!csv || !pandas || csv.length !== expected || pandas.length !== expected) {
      fail("INVENTORY_OPERATION_COUNT_INVALID", operationCode);
    }
    csv.sort((left, right) => left.sampleFirst - right.sampleFirst
      || left.sampleLast - right.sampleLast);
    pandas.sort((left, right) => left.index - right.index);
    if (csv.some((value, index) => value.sampleFirst < 1
      || value.sampleLast < value.sampleFirst
      || index > 0 && value.sampleFirst <= csv[index - 1].sampleLast)
      || pandas.some((value, index) => value.index !== index)) {
      fail("INVENTORY_OPERATION_ORDER_INVALID", operationCode);
    }
    operationCounts[operationCode] = expected;
    operationSummaries.push({
      operationCode,
      rawCsvCycleTraceFiles: expected,
      processedPklCycleTraceFiles: expected,
      firstSampleRangeStart: csv[0].sampleFirst,
      finalSampleRangeEnd: csv.at(-1).sampleLast,
      rawCsvCompressedBytes: csv.reduce((sum, value) =>
        sum + value.entry.compressedSize, 0),
      rawCsvUncompressedBytes: csv.reduce((sum, value) =>
        sum + value.entry.uncompressedSize, 0),
    });
    if (FIXED_LAYOUT_OPERATIONS.includes(operationCode)) {
      const ordinals = [0, Math.floor((expected - 1) / 2), expected - 1];
      const roles = ["SOURCE_HEALTHY_EARLY", "UNLABELED_TEMPORAL_MIDPOINT",
        "SOURCE_FAULTY_LATE"];
      const selected = ordinals.map((ordinal, index) => ({
        role: roles[index],
        cycleOrdinalZeroBased: ordinal,
        sampleRangeFirst: csv[ordinal].sampleFirst,
        sampleRangeLast: csv[ordinal].sampleLast,
        ...publicEntry(csv[ordinal].entry),
      }));
      candidateSelections.push({
        operationCode,
        sourceFileCount: expected,
        selectedCompressedBytes: selected.reduce((sum, value) =>
          sum + value.compressedSize, 0),
        selectedUncompressedBytes: selected.reduce((sum, value) =>
          sum + value.uncompressedSize, 0),
        selected,
      });
    }
  }
  candidateSelections.sort((left, right) =>
    left.selectedCompressedBytes - right.selectedCompressedBytes
    || left.operationCode.localeCompare(right.operationCode));
  const winner = candidateSelections[0];
  const selectedProjection = winner.selected.map((entry, index) => ({
    role: entry.role,
    key: EXPECTED_SELECTED[index].key,
    cycleOrdinalZeroBased: entry.cycleOrdinalZeroBased,
    sampleRangeFirst: entry.sampleRangeFirst,
    sampleRangeLast: entry.sampleRangeLast,
    path: entry.path,
    localPath: EXPECTED_SELECTED[index].localPath,
    flags: entry.flags,
    compressionMethod: entry.compressionMethod,
    crc32: entry.crc32,
    compressedSize: entry.compressedSize,
    uncompressedSize: entry.uncompressedSize,
    localHeaderOffset: entry.localHeaderOffset,
    rawSha256: EXPECTED_SELECTED[index].rawSha256,
  }));
  if (winner.operationCode !== "1100"
    || !same(selectedProjection, EXPECTED_SELECTED)) {
    fail("INVENTORY_SELECTION_CHANGED");
  }
  const rootEntries = ROOT_ENTRY_SPECS.map((spec) => {
    const entry = roots.find((candidate) => candidate.path === spec.path);
    if (!entry || entry.uncompressedSize !== spec.rawBytes) {
      fail("INVENTORY_ROOT_ENTRY_CHANGED", spec.path);
    }
    return { role: spec.role, key: spec.key, localPath: spec.localPath,
      rawSha256: spec.rawSha256, ...publicEntry(entry) };
  });
  const body = {
    schema: ME_AD_INVENTORY_SCHEMA,
    archiveName: ME_AD_ARCHIVE_NAME,
    archiveBytes: ME_AD_ARCHIVE_BYTES,
    publisherMd5Claim: ME_AD_ARCHIVE_MD5,
    completeCentralDirectoryEnumerated: true,
    zip,
    counts: {
      centralDirectoryEntries: entries.length,
      fileEntries: files.length,
      directoryEntries: directories.length,
      rawCsvCycleTraceFiles: [...csvGroups.values()]
        .reduce((sum, values) => sum + values.length, 0),
      processedPklCycleTraceFiles: [...pandasGroups.values()]
        .reduce((sum, values) => sum + values.length, 0),
      pythonSourceFiles: 3,
      markdownFiles: 1,
      taskDirectoryOrFilesPresent: 0,
    },
    operationCounts,
    operationSummaries,
    selectionPolicy: {
      selectedAfterCompleteCentralDirectoryReplay: true,
      fixedLayoutEligibilitySource: "BYTE_PINNED_README_FAMILY_1_DESCRIPTION",
      eligibleOperationCodes: FIXED_LAYOUT_OPERATIONS,
      perOperationOrdinals: "FIRST_MIDDLE_LAST",
      metric: "MINIMUM_SELECTED_COMPRESSED_BYTES",
      tieBreak: "LEXICOGRAPHIC_OPERATION_CODE",
      randomLocationFamily2RejectedAsSameMotionSpan: true,
      selectedOperationCode: "1100",
      selectedOperationPublisherMeaning:
        "FAMILY_1_100_PERCENT_SPEED_FIXED_LAYOUT_0_TWO_PICK_AND_PLACE_TRANSFERS",
    },
    eligibleCandidateSummaries: candidateSelections.map((candidate) => ({
      operationCode: candidate.operationCode,
      sourceFileCount: candidate.sourceFileCount,
      selectedCompressedBytes: candidate.selectedCompressedBytes,
      selectedUncompressedBytes: candidate.selectedUncompressedBytes,
      selectedPaths: candidate.selected.map((entry) => entry.path),
    })),
    selectedEntries: selectedProjection,
    rootSupportEntries: rootEntries,
    documentationAnomalies: {
      readmeDescribesTasksFolderButArchiveContainsTaskEntries: 0,
      readmeStatesCsvColumns: 24,
      importScriptParsesCsvColumns: 36,
      schemaMismatchRetained: true,
    },
  };
  return {
    inventory: { ...body,
      inventoryHash: digest(ME_AD_INVENTORY_SCHEMA + "/inventory", body) },
    selectedEntries: winner.selected.map((entry) => entries.find((candidate) =>
      candidate.path === entry.path)),
    rootEntries: ROOT_ENTRY_SPECS.map((spec) =>
      entries.find((entry) => entry.path === spec.path)),
  };
}

function inspectTail(tail) {
  if (!Buffer.isBuffer(tail) || tail.length !== TAIL_BYTES
    || meAdSha256(tail) !== TAIL_SHA256) fail("TAIL_PROFILE_CHANGED");
  const eocd = findEocd(tail);
  const locatorRelative = eocd.relativeOffset - 20;
  if (locatorRelative < 0 || tail.readUInt32LE(locatorRelative) !== ZIP64_LOCATOR
    || tail.readUInt32LE(locatorRelative + 4) !== 0
    || tail.readUInt32LE(locatorRelative + 16) !== 1) {
    fail("ZIP64_LOCATOR_INVALID");
  }
  const zip64Offset = readU64(tail, locatorRelative + 8, "ZIP64_LOCATOR_OFFSET_INVALID");
  const zip64 = parseZip64(tail, zip64Offset - TAIL_START);
  const zip = {
    zip64: true,
    zip64Offset: zip64.offset,
    zip64RecordBytes: zip64.recordBytes,
    zip64LocatorOffset: TAIL_START + locatorRelative,
    eocdOffset: eocd.absoluteOffset,
    eocdCommentBytes: eocd.commentBytes,
    centralDirectoryOffset: zip64.centralOffset,
    centralDirectoryBytes: zip64.centralBytes,
    centralDirectoryEntries: zip64.totalEntries,
    centralDirectorySha256: CENTRAL_SHA256,
  };
  if (zip64.entriesOnDisk !== CENTRAL_ENTRIES
    || zip64.totalEntries !== CENTRAL_ENTRIES
    || zip64.centralBytes !== CENTRAL_BYTES
    || zip64.centralOffset !== CENTRAL_OFFSET
    || zip64.offset !== ZIP64_OFFSET
    || zip.zip64LocatorOffset !== ZIP64_LOCATOR_OFFSET
    || zip.eocdOffset !== EOCD_OFFSET || zip.eocdCommentBytes !== 0
    || CENTRAL_END + 1 !== ZIP64_OFFSET) fail("ZIP64_GEOMETRY_CHANGED");
  return zip;
}

async function inspectRemoteArchive(fetchImpl) {
  const tail = await strictRangeFetch(TAIL_START, ME_AD_ARCHIVE_BYTES - 1,
    TAIL_BYTES, fetchImpl);
  const zip = inspectTail(tail.bytes);
  const central = await strictRangeFetch(CENTRAL_OFFSET, CENTRAL_END,
    CENTRAL_BYTES, fetchImpl);
  if (central.sha256 !== CENTRAL_SHA256) fail("CENTRAL_HASH_CHANGED");
  const entries = parseMeAdCentralDirectory(central.bytes);
  const built = buildInventory(entries, zip);
  return {
    ...built,
    entries,
    support: [
      {
        path: "source-support/tail.bin",
        bytes: tail.bytes,
        source: CONTENT_URL,
        range: rangeProjection(tail),
      },
      {
        path: "source-support/central-directory.bin",
        bytes: central.bytes,
        source: CONTENT_URL,
        range: rangeProjection(central),
      },
    ],
  };
}

function parseLocalHeader(bytes, centralEntry) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 30
    || bytes.readUInt32LE(0) !== ZIP_LOCAL) fail("LOCAL_HEADER_INVALID", centralEntry.path);
  const flags = bytes.readUInt16LE(6);
  const method = bytes.readUInt16LE(8);
  const crc32 = bytes.readUInt32LE(14);
  const compressed32 = bytes.readUInt32LE(18);
  const uncompressed32 = bytes.readUInt32LE(22);
  const nameBytes = bytes.readUInt16LE(26);
  const extraBytes = bytes.readUInt16LE(28);
  const headerBytes = 30 + nameBytes + extraBytes;
  if (bytes.length !== headerBytes) fail("LOCAL_HEADER_LENGTH_INVALID", centralEntry.path);
  const entryPath = bytes.subarray(30, 30 + nameBytes).toString("utf8");
  if (entryPath !== centralEntry.path || flags !== centralEntry.flags
    || method !== centralEntry.compressionMethod || (flags & 1) !== 0) {
    fail("LOCAL_CENTRAL_MISMATCH", centralEntry.path);
  }
  const descriptor = (flags & 8) !== 0;
  const saturated = {
    uncompressedSize: uncompressed32 === 0xffffffff,
    compressedSize: compressed32 === 0xffffffff,
    localHeaderOffset: false,
    diskStart: false,
  };
  const zip64 = parseExtraFields(bytes.subarray(30 + nameBytes),
    saturated, "LOCAL");
  const localCompressed = saturated.compressedSize
    ? zip64.compressedSize : compressed32;
  const localUncompressed = saturated.uncompressedSize
    ? zip64.uncompressedSize : uncompressed32;
  const localCrc = crc32.toString(16).padStart(8, "0");
  if (!descriptor && (localCrc !== centralEntry.crc32
    || localCompressed !== centralEntry.compressedSize
    || localUncompressed !== centralEntry.uncompressedSize)) {
    fail("LOCAL_SIZE_OR_CRC_MISMATCH", centralEntry.path);
  }
  if (descriptor && ![0, centralEntry.compressedSize].includes(localCompressed)
    || descriptor && ![0, centralEntry.uncompressedSize].includes(localUncompressed)
    || descriptor && crc32 !== 0 && localCrc !== centralEntry.crc32) {
    fail("LOCAL_DESCRIPTOR_PLACEHOLDER_INVALID", centralEntry.path);
  }
  return {
    flags,
    compressionMethod: method,
    descriptor,
    headerBytes,
    dataStart: centralEntry.localHeaderOffset + headerBytes,
    dataEnd: centralEntry.localHeaderOffset + headerBytes
      + centralEntry.compressedSize - 1,
    localCrc32: localCrc,
    localCompressedSize: localCompressed,
    localUncompressedSize: localUncompressed,
  };
}

function parseDescriptor(bytes, centralEntry) {
  let offset = 0;
  let signaturePresent = false;
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === ZIP_DESCRIPTOR) {
    signaturePresent = true;
    offset = 4;
  }
  const zip64 = centralEntry.compressedSize > 0xffffffff
    || centralEntry.uncompressedSize > 0xffffffff;
  const required = offset + 4 + (zip64 ? 16 : 8);
  if (bytes.length < required) fail("DESCRIPTOR_TRUNCATED", centralEntry.path);
  const crc32 = bytes.readUInt32LE(offset).toString(16).padStart(8, "0");
  offset += 4;
  const compressedSize = zip64
    ? readU64(bytes, offset, "DESCRIPTOR_SIZE_INVALID") : bytes.readUInt32LE(offset);
  offset += zip64 ? 8 : 4;
  const uncompressedSize = zip64
    ? readU64(bytes, offset, "DESCRIPTOR_SIZE_INVALID") : bytes.readUInt32LE(offset);
  offset += zip64 ? 8 : 4;
  if (crc32 !== centralEntry.crc32
    || compressedSize !== centralEntry.compressedSize
    || uncompressedSize !== centralEntry.uncompressedSize) {
    fail("DESCRIPTOR_MISMATCH", centralEntry.path);
  }
  return {
    bytes: bytes.subarray(0, offset),
    signaturePresent,
    zip64,
    crc32,
    compressedSize,
    uncompressedSize,
  };
}

let crcTable = null;
function crc32Hex(bytes) {
  if (crcTable === null) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      }
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const value of bytes) crc = crcTable[(crc ^ value) & 0xff] ^ (crc >>> 8);
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0");
}

function decompressEntry(compressed, entry) {
  if (entry.compressionMethod === 0) return Buffer.from(compressed);
  if (entry.compressionMethod === 8) {
    return inflateRawSync(compressed, { maxOutputLength: MAX_ENTRY_UNCOMPRESSED_BYTES });
  }
  fail("ENTRY_COMPRESSION_UNSUPPORTED", entry.path);
}

async function fetchEntry(entry, descriptor, fetchImpl) {
  if (!entry || entry.directory || entry.uncompressedSize < 1
    || entry.uncompressedSize > MAX_ENTRY_UNCOMPRESSED_BYTES
    || entry.compressedSize < 1 || entry.compressedSize > MAX_ENTRY_COMPRESSED_BYTES) {
    fail("ENTRY_SIZE_INVALID", descriptor.role);
  }
  const fixed = await strictRangeFetch(entry.localHeaderOffset,
    entry.localHeaderOffset + 29, 30, fetchImpl);
  if (fixed.bytes.readUInt32LE(0) !== ZIP_LOCAL) fail("LOCAL_FIXED_INVALID", entry.path);
  const headerBytes = 30 + fixed.bytes.readUInt16LE(26) + fixed.bytes.readUInt16LE(28);
  if (headerBytes < 30 || headerBytes > 64 * 1024) fail("LOCAL_HEADER_SIZE_INVALID");
  const header = await strictRangeFetch(entry.localHeaderOffset,
    entry.localHeaderOffset + headerBytes - 1, headerBytes, fetchImpl);
  const local = parseLocalHeader(header.bytes, entry);
  if (!local.descriptor || local.dataEnd >= ME_AD_ARCHIVE_BYTES) {
    fail("ENTRY_DESCRIPTOR_OR_RANGE_INVALID", entry.path);
  }
  const compressed = await strictRangeFetch(local.dataStart, local.dataEnd,
    MAX_ENTRY_COMPRESSED_BYTES, fetchImpl);
  const raw = decompressEntry(compressed.bytes, entry);
  if (raw.length !== entry.uncompressedSize || crc32Hex(raw) !== entry.crc32
    || raw.length !== descriptor.rawBytes
    || meAdSha256(raw) !== descriptor.rawSha256) {
    fail("ENTRY_RAW_BINDING_INVALID", descriptor.role);
  }
  const descriptorRange = await strictRangeFetch(local.dataEnd + 1,
    local.dataEnd + 24, 24, fetchImpl);
  const parsedDescriptor = parseDescriptor(descriptorRange.bytes, entry);
  return {
    role: descriptor.role,
    key: descriptor.key,
    localPath: descriptor.localPath,
    descriptor,
    entry,
    local,
    raw,
    header,
    compressed,
    descriptorRange,
    parsedDescriptor,
  };
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const checked = lstatSync(directory);
  if (!checked.isDirectory() || checked.isSymbolicLink()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes) {
  ensurePrivateDirectory(path.dirname(file));
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function supportItem(pathValue, bytes, range = null, source = CONTENT_URL) {
  return {
    path: pathValue,
    bytes,
    source,
    range,
  };
}

function supportManifestEntry(item) {
  return {
    path: item.path,
    sizeBytes: item.bytes.length,
    sha256: meAdSha256(item.bytes),
    source: item.source,
    range: item.range,
  };
}

function fetchedManifestEntry(fetched) {
  return {
    role: fetched.role,
    internalPath: fetched.entry.path,
    localPath: fetched.localPath,
    flags: fetched.entry.flags,
    compressionMethod: fetched.entry.compressionMethod,
    crc32: fetched.entry.crc32,
    compressedSize: fetched.entry.compressedSize,
    uncompressedSize: fetched.entry.uncompressedSize,
    localHeaderOffset: fetched.entry.localHeaderOffset,
    localHeaderBytes: fetched.local.headerBytes,
    dataStart: fetched.local.dataStart,
    dataEnd: fetched.local.dataEnd,
    dataDescriptorPresent: true,
    cycleOrdinalZeroBased: fetched.descriptor.cycleOrdinalZeroBased ?? null,
    sampleRangeFirst: fetched.descriptor.sampleRangeFirst ?? null,
    sampleRangeLast: fetched.descriptor.sampleRangeLast ?? null,
    conditionClaim: fetched.descriptor.conditionClaim ?? null,
    rawSha256: meAdSha256(fetched.raw),
    supportPaths: {
      localHeader: "source-support/" + fetched.key + "-local-header.bin",
      compressed: "source-support/" + fetched.key + "-compressed.bin",
      dataDescriptor: "source-support/" + fetched.key + "-data-descriptor.bin",
    },
    ranges: {
      localHeader: rangeProjection(fetched.header),
      compressed: rangeProjection(fetched.compressed),
      dataDescriptor: rangeProjection(fetched.descriptorRange),
    },
  };
}

function entrySupportItems(fetched) {
  return [
    supportItem("source-support/" + fetched.key + "-local-header.bin",
      fetched.header.bytes, rangeProjection(fetched.header)),
    supportItem("source-support/" + fetched.key + "-compressed.bin",
      fetched.compressed.bytes, rangeProjection(fetched.compressed)),
    supportItem("source-support/" + fetched.key + "-data-descriptor.bin",
      fetched.descriptorRange.bytes, rangeProjection(fetched.descriptorRange)),
  ];
}

function sourceManifestBody({ recordBefore, recordAfter, inventory,
  supportItems, fetched }) {
  const inventoryBytes = canonicalBytes(inventory);
  return {
    schema: ME_AD_SOURCE_SCHEMA,
    capturedAt: ME_AD_FROZEN_AT,
    recordBefore,
    recordAfter,
    recordStableDuringAcquisition: true,
    recordBytesPerBracket: RECORD_BYTES,
    recordSha256PerBracket: RECORD_SHA256,
    archive: {
      name: ME_AD_ARCHIVE_NAME,
      sizeBytes: ME_AD_ARCHIVE_BYTES,
      publisherMd5Claim: ME_AD_ARCHIVE_MD5,
      fullArchiveDownloaded: false,
      fullArchiveMd5Recomputed: false,
      strictHttpRangeEstablished: true,
      fixedRangeChunkBytes: RANGE_CHUNK_BYTES,
      completeCentralDirectoryEnumerated: true,
      centralDirectoryEntries: CENTRAL_ENTRIES,
      centralDirectoryBytes: CENTRAL_BYTES,
      centralDirectorySha256: CENTRAL_SHA256,
      inventoryHash: inventory.inventoryHash,
      inventoryFileSha256: meAdSha256(inventoryBytes),
    },
    selection: {
      selectedAfterCompleteCentralDirectoryReplay: true,
      operationCode: "1100",
      sameFixedLayoutSpeedAndOperation: true,
      sourceOperationTraceFiles: OPERATION_COUNTS[1100],
      selectedRawCycleTraces: 3,
      selectedCompressedBytes: EXPECTED_SELECTED.reduce((sum, entry) =>
        sum + entry.compressedSize, 0),
      selectedUncompressedBytes: EXPECTED_SELECTED.reduce((sum, entry) =>
        sum + entry.uncompressedSize, 0),
      earlyHealthySourceClaim: 1,
      unlabeledTemporalMidpoints: 1,
      lateFaultySourceClaim: 1,
      randomLocationFamily2Rejected: true,
    },
    rights: {
      publisherLicenseClaim: ME_AD_LICENSE,
      claimSource: "ZENODO_OFFICIAL_RECORD_API",
      legalAdjudicationPerformed: false,
      authorizedTrainingClearanceAdjudicated: false,
      productionTrainingAuthorizedByOutsider: false,
    },
    privacy: {
      rawSelectedTelemetryRetainedLocally: true,
      humanPersonalDataExpected: false,
      noPiiGuaranteed: false,
      networkProjectionAllowed: false,
    },
    transportAttested: false,
    sourceSupportObjects: supportItems.map(supportManifestEntry),
    fetchedEntries: fetched.map(fetchedManifestEntry)
      .sort((left, right) => left.role.localeCompare(right.role)),
  };
}

export async function acquirePinnedMeAdProgressiveFaultSource(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) {
    fail("OUTPUT_EXISTS_OR_TOO_BROAD");
  }
  ensurePrivateDirectory(path.dirname(target));
  const staging = path.join(path.dirname(target), "." + path.basename(target)
    + ".tmp-" + process.pid + "-" + randomBytes(8).toString("hex"));
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  try {
    const beforeRaw = await fetchRecord(fetchImpl);
    const recordBefore = recordProjection(beforeRaw.value);
    const archive = await inspectRemoteArchive(fetchImpl);
    const byPath = new Map(archive.entries.map((entry) => [entry.path, entry]));
    const selectedDescriptors = EXPECTED_SELECTED.map((value) => ({
      ...value,
      rawBytes: value.uncompressedSize,
      conditionClaim: value.role === "SOURCE_HEALTHY_EARLY"
        ? "SOURCE_CLAIMED_HEALTHY_FIRST_70"
        : value.role === "SOURCE_FAULTY_LATE"
          ? "SOURCE_CLAIMED_FAULTY_LAST_50"
          : "UNLABELED_TEMPORAL_INTERMEDIATE",
    }));
    const descriptors = [...ROOT_ENTRY_SPECS, ...selectedDescriptors];
    const fetched = [];
    for (const descriptor of descriptors) {
      fetched.push(await fetchEntry(byPath.get(descriptor.path), descriptor, fetchImpl));
    }
    const afterRaw = await fetchRecord(fetchImpl);
    const recordAfter = recordProjection(afterRaw.value);
    if (!beforeRaw.bytes.equals(afterRaw.bytes) || !same(recordBefore, recordAfter)) {
      fail("RECORD_CHANGED_DURING_ACQUISITION");
    }
    const supportItems = [
      supportItem("source-support/record-before.json", beforeRaw.bytes, null, RECORD_URL),
      supportItem("source-support/record-after.json", afterRaw.bytes, null, RECORD_URL),
      ...archive.support,
      ...fetched.flatMap(entrySupportItems),
    ].sort((left, right) => left.path.localeCompare(right.path));
    for (const item of supportItems) {
      writePrivate(path.join(staging, ...item.path.split("/")), item.bytes);
    }
    for (const item of fetched) {
      writePrivate(path.join(staging, ...item.localPath.split("/")), item.raw);
    }
    const inventoryBytes = canonicalBytes(archive.inventory);
    writePrivate(path.join(staging, "archive-inventory.json"), inventoryBytes);
    const manifestBody = sourceManifestBody({ recordBefore, recordAfter,
      inventory: archive.inventory, supportItems, fetched });
    const manifest = {
      ...manifestBody,
      manifestHash: digest(ME_AD_SOURCE_SCHEMA + "/manifest", manifestBody),
    };
    writePrivate(path.join(staging, "acquisition-manifest.json"), canonicalBytes(manifest));
    renameSync(staging, target);
    return {
      sourceDirectory: target,
      manifest,
      manifestFileSha256: meAdSha256(readFileSync(
        path.join(target, "acquisition-manifest.json"))),
    };
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function exactKeys(value, keys) {
  return exactObject(value) && same(sorted(Object.keys(value)), sorted(keys));
}

function statIdentity(stat) {
  return [stat.dev, stat.ino, stat.mode, stat.size, stat.mtimeNs, stat.ctimeNs]
    .map((value) => value.toString()).join(":");
}

function requirePrivateDirectory(directory, expectedNames, snapshots) {
  const stat = lstatSync(directory, { bigint: true });
  const names = sorted(readdirSync(directory));
  if (!stat.isDirectory() || stat.isSymbolicLink()
    || Number(stat.mode & 0o777n) !== 0o700
    || !same(names, sorted(expectedNames))) fail("SOURCE_DIRECTORY_INVALID", directory);
  snapshots.push({ kind: "directory", path: directory,
    identity: statIdentity(stat), names });
}

function readPrivateStable(root, relativePath, snapshots, maximumBytes,
  expected = null) {
  const target = path.resolve(root, ...relativePath.split("/"));
  const relative = path.relative(root, target);
  if (relative === "" || relative === ".." || relative.startsWith(".." + path.sep)
    || path.isAbsolute(relative)) fail("SOURCE_PATH_ESCAPE", relativePath);
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const descriptor = openSync(target, flags);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || Number(before.mode & 0o777n) !== 0o600
      || before.size < 1n || before.size > BigInt(maximumBytes)) {
      fail("SOURCE_FILE_INVALID", relativePath);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (statIdentity(before) !== statIdentity(after)
      || bytes.length !== Number(before.size)) fail("SOURCE_FILE_CHANGED", relativePath);
    if (expected && (bytes.length !== expected.sizeBytes
      || meAdSha256(bytes) !== expected.sha256)) {
      fail("SOURCE_FILE_BINDING_INVALID", relativePath);
    }
    snapshots.push({ kind: "file", path: target, identity: statIdentity(after) });
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function recheckSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    const stat = lstatSync(snapshot.path, { bigint: true });
    if (statIdentity(stat) !== snapshot.identity
      || snapshot.kind === "file" && (!stat.isFile() || stat.isSymbolicLink())
      || snapshot.kind === "directory" && (!stat.isDirectory() || stat.isSymbolicLink())
      || snapshot.kind === "directory"
        && !same(sorted(readdirSync(snapshot.path)), snapshot.names)) {
      fail("SOURCE_CHANGED_DURING_REPLAY", snapshot.path);
    }
  }
}

function validateStoredRange(bytes, range, expectedStart, expectedEnd) {
  if (!Buffer.isBuffer(bytes)
    || !exactKeys(range, ["start", "end", "contentRange", "chunks"])
    || range.start !== expectedStart || range.end !== expectedEnd
    || bytes.length !== expectedEnd - expectedStart + 1
    || !Array.isArray(range.chunks) || range.chunks.length < 1) {
    fail("STORED_RANGE_INVALID", expectedStart + "-" + expectedEnd);
  }
  const expectedChunks = [];
  let byteOffset = 0;
  for (let start = expectedStart; start <= expectedEnd;) {
    const end = Math.min(expectedEnd, start + RANGE_CHUNK_BYTES - 1);
    const chunk = range.chunks[expectedChunks.length];
    const sizeBytes = end - start + 1;
    const contentRange = "bytes " + start + "-" + end + "/" + ME_AD_ARCHIVE_BYTES;
    const expected = {
      start, end, contentRange, sizeBytes,
      sha256: meAdSha256(bytes.subarray(byteOffset, byteOffset + sizeBytes)),
    };
    if (!exactKeys(chunk, ["start", "end", "contentRange", "sizeBytes", "sha256"])
      || !same(chunk, expected)) fail("STORED_RANGE_CHUNK_INVALID", start + "-" + end);
    expectedChunks.push(expected);
    byteOffset += sizeBytes;
    start = end + 1;
  }
  const expectedContentRange = expectedChunks.length === 1
    ? expectedChunks[0].contentRange : "STRICT_206_CHUNK_SET";
  if (range.chunks.length !== expectedChunks.length
    || range.contentRange !== expectedContentRange) fail("STORED_RANGE_SET_INVALID");
  return { start: expectedStart, end: expectedEnd,
    contentRange: expectedContentRange, chunks: expectedChunks };
}

function selectedDescriptors() {
  return EXPECTED_SELECTED.map((value) => ({
    ...value,
    rawBytes: value.uncompressedSize,
    conditionClaim: value.role === "SOURCE_HEALTHY_EARLY"
      ? "SOURCE_CLAIMED_HEALTHY_FIRST_70"
      : value.role === "SOURCE_FAULTY_LATE"
        ? "SOURCE_CLAIMED_FAULTY_LAST_50"
        : "UNLABELED_TEMPORAL_INTERMEDIATE",
  }));
}

function sourceSupportNames() {
  return sorted([
    "record-before.json", "record-after.json", "tail.bin", "central-directory.bin",
    ...[...ROOT_ENTRY_SPECS, ...selectedDescriptors()].flatMap((descriptor) => [
      descriptor.key + "-local-header.bin",
      descriptor.key + "-compressed.bin",
      descriptor.key + "-data-descriptor.bin",
    ]),
  ]);
}

function sourceRootFromBindings(bindings) {
  return digest(ME_AD_SOURCE_SCHEMA + "/source-root",
    bindings.map(({ path: objectPath, bytes }) => ({
      path: objectPath, sizeBytes: bytes.length, sha256: meAdSha256(bytes),
    })).sort((left, right) => left.path.localeCompare(right.path)));
}

export function verifyMeAdProgressiveFaultSourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const snapshots = [];
  const rawNames = sorted([...ROOT_ENTRY_SPECS, ...EXPECTED_SELECTED]
    .map((entry) => path.posix.basename(entry.localPath)));
  const supportNames = sourceSupportNames();
  requirePrivateDirectory(root,
    ["acquisition-manifest.json", "archive-inventory.json", "raw", "source-support"],
    snapshots);
  requirePrivateDirectory(path.join(root, "raw"), rawNames, snapshots);
  requirePrivateDirectory(path.join(root, "source-support"), supportNames, snapshots);
  const manifestBytes = readPrivateStable(root, "acquisition-manifest.json", snapshots,
    4 * 1024 * 1024);
  const manifest = safeJson(manifestBytes, "SOURCE_MANIFEST_JSON_INVALID");
  if (!manifestBytes.equals(canonicalBytes(manifest))) fail("SOURCE_MANIFEST_NOT_CANONICAL");
  const inventoryBytes = readPrivateStable(root, "archive-inventory.json", snapshots,
    4 * 1024 * 1024);
  const inventory = safeJson(inventoryBytes, "SOURCE_INVENTORY_JSON_INVALID");
  if (!inventoryBytes.equals(canonicalBytes(inventory))) fail("SOURCE_INVENTORY_NOT_CANONICAL");

  const supportBytes = new Map();
  for (const name of supportNames) {
    const relativePath = "source-support/" + name;
    supportBytes.set(relativePath, readPrivateStable(root, relativePath, snapshots,
      CENTRAL_BYTES + 1024));
  }
  const rawBytes = new Map();
  for (const descriptor of [...ROOT_ENTRY_SPECS, ...selectedDescriptors()]) {
    rawBytes.set(descriptor.localPath, readPrivateStable(root, descriptor.localPath,
      snapshots, MAX_ENTRY_UNCOMPRESSED_BYTES));
  }

  const recordBeforeBytes = supportBytes.get("source-support/record-before.json");
  const recordAfterBytes = supportBytes.get("source-support/record-after.json");
  if (recordBeforeBytes.length !== RECORD_BYTES || recordAfterBytes.length !== RECORD_BYTES
    || meAdSha256(recordBeforeBytes) !== RECORD_SHA256
    || meAdSha256(recordAfterBytes) !== RECORD_SHA256
    || !recordBeforeBytes.equals(recordAfterBytes)) fail("SOURCE_RECORD_BRACKET_INVALID");
  const recordBefore = recordProjection(safeJson(recordBeforeBytes,
    "SOURCE_RECORD_BEFORE_JSON_INVALID"));
  const recordAfter = recordProjection(safeJson(recordAfterBytes,
    "SOURCE_RECORD_AFTER_JSON_INVALID"));
  if (!same(recordBefore, recordAfter)) fail("SOURCE_RECORD_PROJECTION_CHANGED");

  const tailBytes = supportBytes.get("source-support/tail.bin");
  const centralBytes = supportBytes.get("source-support/central-directory.bin");
  const zip = inspectTail(tailBytes);
  if (centralBytes.length !== CENTRAL_BYTES || meAdSha256(centralBytes) !== CENTRAL_SHA256) {
    fail("SOURCE_CENTRAL_BINDING_INVALID");
  }
  const entries = parseMeAdCentralDirectory(centralBytes);
  const rebuiltInventory = buildInventory(entries, zip).inventory;
  if (!same(inventory, rebuiltInventory)) fail("SOURCE_INVENTORY_REBUILD_MISMATCH");
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  const manifestEntries = new Map((manifest?.fetchedEntries ?? [])
    .map((entry) => [entry.role, entry]));
  const fetched = [];
  const validatedSupport = [
    supportItem("source-support/record-before.json", recordBeforeBytes, null, RECORD_URL),
    supportItem("source-support/record-after.json", recordAfterBytes, null, RECORD_URL),
  ];
  const tailManifest = (manifest?.sourceSupportObjects ?? []).find((entry) =>
    entry.path === "source-support/tail.bin");
  const centralManifest = (manifest?.sourceSupportObjects ?? []).find((entry) =>
    entry.path === "source-support/central-directory.bin");
  validatedSupport.push(supportItem("source-support/tail.bin", tailBytes,
    validateStoredRange(tailBytes, tailManifest?.range, TAIL_START,
      ME_AD_ARCHIVE_BYTES - 1)));
  validatedSupport.push(supportItem("source-support/central-directory.bin", centralBytes,
    validateStoredRange(centralBytes, centralManifest?.range, CENTRAL_OFFSET, CENTRAL_END)));

  for (const descriptor of [...ROOT_ENTRY_SPECS, ...selectedDescriptors()]) {
    const entry = byPath.get(descriptor.path);
    const manifestEntry = manifestEntries.get(descriptor.role);
    if (!entry || !manifestEntry) fail("SOURCE_FETCHED_ENTRY_MISSING", descriptor.role);
    const prefix = "source-support/" + descriptor.key;
    const headerBytes = supportBytes.get(prefix + "-local-header.bin");
    const compressedBytes = supportBytes.get(prefix + "-compressed.bin");
    const descriptorBytes = supportBytes.get(prefix + "-data-descriptor.bin");
    const local = parseLocalHeader(headerBytes, entry);
    const headerRange = validateStoredRange(headerBytes, manifestEntry.ranges?.localHeader,
      entry.localHeaderOffset, entry.localHeaderOffset + local.headerBytes - 1);
    const compressedRange = validateStoredRange(compressedBytes,
      manifestEntry.ranges?.compressed, local.dataStart, local.dataEnd);
    const descriptorRange = validateStoredRange(descriptorBytes,
      manifestEntry.ranges?.dataDescriptor, local.dataEnd + 1, local.dataEnd + 24);
    const parsedDescriptor = parseDescriptor(descriptorBytes, entry);
    const raw = decompressEntry(compressedBytes, entry);
    if (!local.descriptor || raw.length !== descriptor.rawBytes
      || raw.length !== entry.uncompressedSize || crc32Hex(raw) !== entry.crc32
      || meAdSha256(raw) !== descriptor.rawSha256
      || !raw.equals(rawBytes.get(descriptor.localPath))) {
      fail("SOURCE_ENTRY_REPLAY_MISMATCH", descriptor.role);
    }
    const value = {
      role: descriptor.role, key: descriptor.key, localPath: descriptor.localPath,
      descriptor, entry, local, raw,
      header: { bytes: headerBytes, ...headerRange },
      compressed: { bytes: compressedBytes, ...compressedRange },
      descriptorRange: { bytes: descriptorBytes, ...descriptorRange },
      parsedDescriptor,
    };
    if (!same(manifestEntry, fetchedManifestEntry(value))) {
      fail("SOURCE_FETCHED_MANIFEST_MISMATCH", descriptor.role);
    }
    fetched.push(value);
    validatedSupport.push(...entrySupportItems(value));
  }
  validatedSupport.sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(manifestEntries.keys()).size !== fetched.length
    || manifest.fetchedEntries.length !== fetched.length
    || !same(manifest.fetchedEntries.map((entry) => entry.role),
      sorted(manifest.fetchedEntries.map((entry) => entry.role)))) {
    fail("SOURCE_FETCHED_MANIFEST_SET_INVALID");
  }
  const manifestBody = sourceManifestBody({ recordBefore, recordAfter,
    inventory: rebuiltInventory, supportItems: validatedSupport, fetched });
  const expectedManifest = { ...manifestBody,
    manifestHash: digest(ME_AD_SOURCE_SCHEMA + "/manifest", manifestBody) };
  if (!same(manifest, expectedManifest)) fail("SOURCE_MANIFEST_REBUILD_MISMATCH");

  const bindings = [
    { path: "archive-inventory.json", bytes: inventoryBytes },
    ...[...rawBytes].map(([objectPath, bytes]) => ({ path: objectPath, bytes })),
    ...[...supportBytes].map(([objectPath, bytes]) => ({ path: objectPath, bytes })),
  ];
  const sourceRoot = sourceRootFromBindings(bindings);
  recheckSnapshots(snapshots);
  return Object.freeze({ ok: true, verificationLevel: "FULL_SOURCE_BYTE_REPLAY",
    sourceDirectory: root, manifest, inventory: rebuiltInventory, rawBytes,
    manifestFileSha256: meAdSha256(manifestBytes), sourceRoot,
    selectedCompressedBytes: EXPECTED_SELECTED.reduce((sum, entry) =>
      sum + entry.compressedSize, 0),
    selectedRawBytes: EXPECTED_SELECTED.reduce((sum, entry) =>
      sum + entry.uncompressedSize, 0) });
}

const SIGNAL_GROUPS = Object.freeze([
  { key: "position", columns: [0, 5], unitClaim: "rad" },
  { key: "velocity", columns: [6, 11], unitClaim: "rad/s" },
  { key: "acceleration", columns: [12, 17], unitClaim: "rad/s^2" },
  { key: "motorTorque", columns: [18, 23], unitClaim: "Nm" },
  { key: "matlabEstimatedTorque", columns: [24, 29], unitClaim: null },
  { key: "matlabEstimatedExternalTorque", columns: [30, 35], unitClaim: null },
]);
const EXPECTED_TRACE_ROWS = Object.freeze([1172, 1172, 1174]);
const NUMBER_TOKEN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/iu;

const SEGMENT_BOUNDARY = Object.freeze({
  additiveAcrossSegments: false,
  completeIndependentEpisodeIntersection: 0,
  opportunityCensus: { prospectiveOpportunityRecords: 0,
    independentlyObservedOpportunityRecords: 0 },
  delegationAuthorization: { delegationRecords: 0, authorityRecords: 0,
    authorizedRecords: 0 },
  action: { outsiderAuthorizedActionRecords: 0, actionsDispatchedByArtifact: 0,
    actionsExecutedByArtifact: 0 },
  mechanicalCondition: { sourceNativeOrderedTracePoints: 3,
    publisherConditionClaimedEndpoints: 2, independentlyVerifiedConditionRecords: 0 },
  effect: { independentPhysicalEffectRecords: 0,
    independentObjectStateEffectRecords: 0 },
  outcome: { independentOutcomeRecords: 0 },
  recovery: { independentRecoveryChains: 0 },
  longitudinal: { sourceNativeTemporalOrderPoints: 3,
    independentlyTrackedIdentityRecords: 0 },
});

const TRAINING_BOUNDARY = Object.freeze({
  artifactUseBoundary: "OFFLINE_MECHANICAL_EVALUATION_AND_RESEARCH_ONLY",
  offlineCorpusReplayPerformed: true,
  offlineModelFittingPerformed: false,
  offlineModelFittingRows: 0,
  authorizedTraining: false,
  authorizedTrainingRows: 0,
  authorizedTrainingJobs: 0,
  authorizedTrainingPerformed: false,
  productionTraining: false,
  productionTrainingRows: 0,
  policyOptimizationPerformed: false,
  modelWeightsProduced: false,
});

const AUTHORITY_BOUNDARY = Object.freeze({
  delegationRecords: 0,
  authorityRecords: 0,
  authorizedActionRecords: 0,
  actionsDispatched: 0,
  actionsExecutedByArtifact: 0,
  independentOutcomeRecords: 0,
  independentRecoveryRecords: 0,
  independentlyTrackedLongitudinalRecords: 0,
  networkContributionRecords: 0,
  CEURecords: 0,
  creditUnitsMinted: 0,
  productionTrainingRows: 0,
  authorityDelta: 0,
  executable: false,
});

const PRIVACY_PROJECTION = Object.freeze({
  rawSourceTextProjectedRows: 0,
  rawTelemetryProjectedRows: 0,
  rawTelemetryProjectedValues: 0,
  humanIdentifierProjectedRows: 0,
  networkProjectionRows: 0,
  trainingProjectionRows: 0,
});

function rounded(value) {
  const result = Number(value.toFixed(12));
  return Object.is(result, -0) ? 0 : result;
}

function parseRawTrace(bytes, descriptor) {
  if (!Buffer.isBuffer(bytes) || meAdSha256(bytes) !== descriptor.rawSha256
    || bytes.length !== descriptor.uncompressedSize) fail("TRACE_BYTES_INVALID", descriptor.role);
  const text = bytes.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(bytes) || text.includes("\0")) {
    fail("TRACE_TEXT_INVALID", descriptor.role);
  }
  const lines = text.replace(/\r?\n$/u, "").split(/\r?\n/u);
  const accumulators = Array.from({ length: 36 }, () => ({
    min: Infinity, max: -Infinity, sum: 0, squares: 0,
  }));
  for (const [rowIndex, line] of lines.entries()) {
    const tokens = line.split(",");
    if (tokens.length !== 36) fail("TRACE_COLUMN_COUNT_INVALID",
      descriptor.role + ":" + rowIndex + ":" + tokens.length);
    for (const [columnIndex, token] of tokens.entries()) {
      if (!NUMBER_TOKEN.test(token)) fail("TRACE_TOKEN_INVALID",
        descriptor.role + ":" + rowIndex + ":" + columnIndex);
      const value = Number(token);
      if (!Number.isFinite(value)) fail("TRACE_NONFINITE", descriptor.role);
      const accumulator = accumulators[columnIndex];
      accumulator.min = Math.min(accumulator.min, value);
      accumulator.max = Math.max(accumulator.max, value);
      accumulator.sum += value;
      accumulator.squares += value * value;
    }
  }
  const columnStats = accumulators.map((accumulator, zeroBasedColumn) => ({
    zeroBasedColumn,
    sourceGroup: SIGNAL_GROUPS.find((group) => zeroBasedColumn >= group.columns[0]
      && zeroBasedColumn <= group.columns[1]).key,
    jointOneBased: zeroBasedColumn % 6 + 1,
    min: rounded(accumulator.min),
    max: rounded(accumulator.max),
    mean: rounded(accumulator.sum / lines.length),
    rms: rounded(Math.sqrt(accumulator.squares / lines.length)),
  }));
  return {
    role: descriptor.role,
    localPath: descriptor.localPath,
    internalPath: descriptor.path,
    conditionAttribution: descriptor.conditionClaim,
    cycleOrdinalZeroBased: descriptor.cycleOrdinalZeroBased,
    sampleRangeFirst: descriptor.sampleRangeFirst,
    sampleRangeLast: descriptor.sampleRangeLast,
    bytes: bytes.length,
    sha256: descriptor.rawSha256,
    rows: lines.length,
    columns: 36,
    numericValues: lines.length * 36,
    nonFiniteValues: 0,
    columnStats,
  };
}

function validateSourceDocumentation(rawBytes) {
  const readme = rawBytes.get("raw/README.md").toString("utf8");
  const importData = rawBytes.get("raw/Import_data.py").toString("utf8");
  const generateTasks = rawBytes.get("raw/Generate_tasks.py").toString("utf8");
  const combineDatasets = rawBytes.get("raw/Combine_datasets.py").toString("utf8");
  if (!readme.includes("first **70 cycles** are considered nominal")
    || !readme.includes("last **50 cycles**, the anomaly is considered evident")
    || !readme.includes("Each CSV file contains **24 columns**")
    || !readme.includes("Family 1") || !readme.includes("fixed, pick locations B")
    || !readme.includes("(Insert your license here")
    || !importData.includes("list_files.sort()")
    || !importData.includes("5 * n_joints :")
    || !generateTasks.includes("(-50, 0, 1)")
    || ![importData, generateTasks, combineDatasets].every((value) =>
      value.includes("CONFIDENTIAL Copyright"))) {
    fail("SOURCE_DOCUMENTATION_PROFILE_CHANGED");
  }
  return {
    publisherProgressiveFaultClaimByteReplayed: true,
    publisherFirst70HealthyClaimByteReplayed: true,
    publisherLast50FaultyClaimByteReplayed: true,
    importScriptLexicographicCycleIndexMappingByteReplayed: true,
    generateTasksUsesNegativeLast50SliceByteReplayed: true,
    sourceNamedPythonFiles: 3,
    sourcePythonFilesExecuted: 0,
    archiveReadmeClaimedCsvColumns: 24,
    selectedRawCsvObservedColumns: 36,
    archiveReadmeLicenseTextIsPlaceholder: true,
    pythonFilesWithConfidentialHeader: 3,
  };
}

export function extractMeAdProgressiveFault(sourceDirectory) {
  const checked = verifyMeAdProgressiveFaultSourceDirectory(sourceDirectory);
  const documentation = validateSourceDocumentation(checked.rawBytes);
  const traces = selectedDescriptors().map((descriptor, index) => {
    const trace = parseRawTrace(checked.rawBytes.get(descriptor.localPath), descriptor);
    if (trace.rows !== EXPECTED_TRACE_ROWS[index]) {
      fail("TRACE_ROW_PROFILE_CHANGED", descriptor.role + ":" + trace.rows);
    }
    return trace;
  });
  const contentReplayBody = {
    schema: ME_AD_REPORT_SCHEMA + "/selected-raw-content-replay/v1",
    documentation,
    traces,
  };
  return Object.freeze({ checked, documentation, traces,
    totalRows: traces.reduce((sum, trace) => sum + trace.rows, 0),
    totalNumericValues: traces.reduce((sum, trace) => sum + trace.numericValues, 0),
    contentReplayHash: digest(ME_AD_REPORT_SCHEMA + "/selected-raw-content-replay",
      contentReplayBody) });
}

function jointThreeObservation(traces) {
  const metric = (trace, group, name) => trace.columnStats.find((column) =>
    column.sourceGroup === group && column.jointOneBased === 3)[name];
  const early = traces[0];
  const late = traces[2];
  return {
    metricInterpretation: "DESCRIPTIVE_RAW_TELEMETRY_ONLY",
    motorTorqueJoint3RmsEarly: metric(early, "motorTorque", "rms"),
    motorTorqueJoint3RmsLate: metric(late, "motorTorque", "rms"),
    motorTorqueJoint3RmsLateMinusEarly: rounded(
      metric(late, "motorTorque", "rms") - metric(early, "motorTorque", "rms")),
    accelerationJoint3RmsEarly: metric(early, "acceleration", "rms"),
    accelerationJoint3RmsLate: metric(late, "acceleration", "rms"),
    matlabEstimatedExternalTorqueJoint3RmsEarly:
      metric(early, "matlabEstimatedExternalTorque", "rms"),
    matlabEstimatedExternalTorqueJoint3RmsLate:
      metric(late, "matlabEstimatedExternalTorque", "rms"),
    monotonicDegradationEstablished: false,
    causalEffectEstablished: false,
    independentConditionTruthEstablished: false,
  };
}

function reportBody(extracted) {
  const source = extracted.checked;
  const manifest = source.manifest;
  const selectedEntryRawBytes = ROOT_ENTRY_SPECS.reduce((sum, entry) =>
    sum + entry.rawBytes, 0) + source.selectedRawBytes;
  return {
    schema: ME_AD_REPORT_SCHEMA,
    createdAt: ME_AD_FROZEN_AT,
    dataset: {
      recordId: ME_AD_RECORD_ID,
      doi: ME_AD_DOI,
      title: "ME-AD: Progressive Robotics Anomaly Detection Dataset",
      publisher: "Mitsubishi Electric Research Laboratories and contributors",
      robotPlatformClaim: "Mitsubishi Electric RV-7FM-D1-S15 6-DoF manipulator",
      sourceClass: "SOURCE_CLAIMED_PROGRESSIVE_MECHANICAL_FAULT_TELEMETRY",
      publicationDate: "2026-06-23",
      revision: 4,
    },
    sourceReplay: {
      verificationLevel: "FULL_SELECTED_SOURCE_BYTE_AND_CONTENT_REPLAY",
      sourceManifestHash: manifest.manifestHash,
      sourceManifestFileSha256: source.manifestFileSha256,
      sourceRoot: source.sourceRoot,
      officialRecordSnapshots: 2,
      officialRecordBytesPerSnapshot: RECORD_BYTES,
      officialRecordStableWithinBracket: true,
      parentArchiveBytes: ME_AD_ARCHIVE_BYTES,
      parentArchiveDownloaded: false,
      parentArchiveMd5Recomputed: false,
      strict206RangeEstablished: true,
      fixedRangeChunkBytes: RANGE_CHUNK_BYTES,
      completeZip64CentralDirectoryReplayed: true,
      centralDirectoryEntries: CENTRAL_ENTRIES,
      centralDirectoryBytes: CENTRAL_BYTES,
      centralDirectorySha256: CENTRAL_SHA256,
      rawCsvTraceFilesEnumerated: 28_824,
      processedPklTraceFilesEnumerated: 28_824,
      selectedEntryObjects: 7,
      selectedEntryRawBytes,
      selectedRawCycleTraceFiles: 3,
      selectedRawCycleTraceBytes: source.selectedRawBytes,
      selectedCompressedBytes: source.selectedCompressedBytes,
      selectedRawRows: extracted.totalRows,
      selectedRawNumericValues: extracted.totalNumericValues,
      contentReplayHash: extracted.contentReplayHash,
      sourceDocumentation: extracted.documentation,
      signalGroups: SIGNAL_GROUPS,
      traces: extracted.traces,
      sourceNamedPythonFilesExecuted: 0,
      transportAttested: false,
    },
    selectionAndScope: {
      selectionPerformedAfterCompleteCentralDirectoryReplay: true,
      eligibleFixedLayoutOperationCodes: FIXED_LAYOUT_OPERATIONS,
      selectedOperationCode: "1100",
      selectedOperationSourceTraceFiles: OPERATION_COUNTS[1100],
      selectionRule: "MINIMUM_FIRST_MIDDLE_LAST_COMPRESSED_BYTES_THEN_LEXICOGRAPHIC_CODE",
      sameFixedLayoutSpeedAndOperation: true,
      selectedCycleOrdinalsZeroBased: EXPECTED_SELECTED.map((entry) =>
        entry.cycleOrdinalZeroBased),
      randomLocationFamily2Excluded: true,
      exactCentralDirectoryScopeExhausted: true,
      selectedEntryByteClosureExhausted: true,
      fullArchiveContentExhausted: false,
      externalDiscoveryPerformed: false,
      globalExhaustion: false,
    },
    denominatorRegistry: {
      populations: [{
        denominatorClass: "MECHANICAL_DEGRADATION_OPERATION_CYCLE_TRACE",
        units: 3,
        unitDefinition: "ONE_SELECTED_RAW_CSV_TRACE_FOR_ONE_SOURCE_OPERATION_CYCLE",
        operationCode: "1100",
        sourceParentPopulationFiles: OPERATION_COUNTS[1100],
        independentlyVerifiedFaultUnits: 0,
        episodeStatus: "NOT_AN_OUTSIDER_PROSPECTIVE_EPISODE",
      }],
      crossDomainTotal: null,
      crossDomainAdditionProhibited: true,
      parentArchiveRawCsvTraceFiles: 28_824,
      parentArchiveApproximateUniqueCycleClaim: 17_000,
      parentFileCountAndApproximateCycleClaimCommensurate: false,
      uniquePhysicalCycleCountEstablished: null,
    },
    temporalConditionEvidence: {
      evidenceClass: "SOURCE_CLAIMED_PROGRESSIVE_FAULT_WITH_ORDERED_RAW_TELEMETRY",
      publisherActuatorJointClaim: 3,
      publisherMechanismClaim: "GRADUAL_GEARBOX_LUBRICANT_LOSS",
      earlyTraceCondition: "SOURCE_CLAIMED_HEALTHY_FIRST_70",
      midpointTraceCondition: "UNLABELED_TEMPORAL_INTERMEDIATE",
      lateTraceCondition: "SOURCE_CLAIMED_FAULTY_LAST_50",
      sourceOrderBasis: "ZERO_PADDED_FILENAME_ORDER_REPLAYED_BY_IMPORT_SCRIPT",
      labelsAreIndependentGroundTruth: false,
      observedJointThreeTelemetry: jointThreeObservation(extracted.traces),
    },
    rightsAndUseClearance: {
      zenodoOfficialRecordLicenseClaim: ME_AD_LICENSE,
      zenodoRecordClaimBytePinned: true,
      archiveReadmeLicenseTextIsPlaceholder: true,
      sourcePythonFilesWithConfidentialHeader: 3,
      rightsNoticeConsistencyEstablished: false,
      legalConclusion: false,
      privacyClearanceAdjudicated: false,
      revisionSpecificUseClearanceAdjudicated: false,
      productionUseClearanceAdjudicated: false,
      authorizedTrainingClearanceAdjudicated: false,
      artifactUseBoundary: "OFFLINE_MECHANICAL_EVALUATION_AND_RESEARCH_ONLY",
    },
    segmentCoverageAttribution: SEGMENT_BOUNDARY,
    privacyAndProjection: PRIVACY_PROJECTION,
    modelAndTrainingBoundary: TRAINING_BOUNDARY,
    authorityBoundary: AUTHORITY_BOUNDARY,
    limitations: {
      publisherConditionLabelsIndependentlyValidated: false,
      selectedTraceFilesEstablishMonotonicDegradation: false,
      selectedTraceFilesEstablishLubricantLossCausality: false,
      independentExternalMetrologyPresent: false,
      taskOutcomePresent: false,
      recoveryAttemptStructurePresent: false,
      delegationOrAuthorityPresent: false,
      absoluteCrossCycleTimestampsPresent: false,
      sameRobotIdentityCryptographicallyBoundAcrossTraces: false,
      readme24ColumnClaimMatchesSelectedRaw36ColumnSchema: false,
      readmeDescribedTaskFilesPresentInCentralDirectory: false,
      unselectedArchiveEntriesContentVerified: false,
      sourceClaimsMustNotBePromotedToIndependentTruth: true,
    },
  };
}

export function buildMeAdProgressiveFaultFromSource(sourceDirectory) {
  const extracted = extractMeAdProgressiveFault(sourceDirectory);
  const body = reportBody(extracted);
  return Object.freeze({ ...body,
    artifactHash: digest(ME_AD_REPORT_SCHEMA + "/artifact", body) });
}

function addError(errors, condition, code) {
  if (!condition) errors.push(code);
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

export function verifyMeAdProgressiveFaultReport(report) {
  const errors = [];
  try {
    addError(errors, exactKeys(report, ["schema", "createdAt", "dataset", "sourceReplay",
      "selectionAndScope", "denominatorRegistry", "temporalConditionEvidence",
      "rightsAndUseClearance", "segmentCoverageAttribution", "privacyAndProjection",
      "modelAndTrainingBoundary", "authorityBoundary", "limitations", "artifactHash"]),
    "TOP_LEVEL_SHAPE");
    if (!exactObject(report)) return { ok: false, errors };
    const { artifactHash, ...body } = report;
    addError(errors, report.schema === ME_AD_REPORT_SCHEMA, "SCHEMA");
    addError(errors, report.createdAt === ME_AD_FROZEN_AT, "CREATED_AT");
    addError(errors, HASH.test(artifactHash ?? "")
      && artifactHash === digest(ME_AD_REPORT_SCHEMA + "/artifact", body), "ARTIFACT_HASH");
    addError(errors, report.dataset?.recordId === ME_AD_RECORD_ID
      && report.dataset?.doi === ME_AD_DOI && report.dataset?.revision === 4,
    "DATASET_BINDING");
    addError(errors, report.sourceReplay?.verificationLevel
      === "FULL_SELECTED_SOURCE_BYTE_AND_CONTENT_REPLAY"
      && HASH.test(report.sourceReplay?.sourceManifestHash ?? "")
      && HASH.test(report.sourceReplay?.sourceManifestFileSha256 ?? "")
      && HASH.test(report.sourceReplay?.sourceRoot ?? "")
      && report.sourceReplay?.parentArchiveBytes === ME_AD_ARCHIVE_BYTES
      && report.sourceReplay?.parentArchiveDownloaded === false
      && report.sourceReplay?.parentArchiveMd5Recomputed === false
      && report.sourceReplay?.strict206RangeEstablished === true
      && report.sourceReplay?.completeZip64CentralDirectoryReplayed === true
      && report.sourceReplay?.centralDirectoryEntries === CENTRAL_ENTRIES
      && report.sourceReplay?.centralDirectoryBytes === CENTRAL_BYTES
      && report.sourceReplay?.centralDirectorySha256 === CENTRAL_SHA256
      && report.sourceReplay?.rawCsvTraceFilesEnumerated === 28_824
      && report.sourceReplay?.processedPklTraceFilesEnumerated === 28_824
      && report.sourceReplay?.selectedRawCycleTraceFiles === 3
      && report.sourceReplay?.selectedRawCycleTraceBytes === 973_886
      && report.sourceReplay?.selectedCompressedBytes === 352_588
      && report.sourceReplay?.selectedRawRows === 3518
      && report.sourceReplay?.selectedRawNumericValues === 126_648
      && report.sourceReplay?.sourceNamedPythonFilesExecuted === 0
      && report.sourceReplay?.transportAttested === false
      && Array.isArray(report.sourceReplay?.traces)
      && same(report.sourceReplay.traces.map((trace) => trace.rows), EXPECTED_TRACE_ROWS)
      && report.sourceReplay.traces.every((trace, index) =>
        trace.columns === 36 && trace.numericValues === EXPECTED_TRACE_ROWS[index] * 36
        && trace.nonFiniteValues === 0 && trace.sha256 === EXPECTED_SELECTED[index].rawSha256),
    "SOURCE_REPLAY");
    addError(errors, report.selectionAndScope?.selectedOperationCode === "1100"
      && report.selectionAndScope?.selectedOperationSourceTraceFiles === 1931
      && same(report.selectionAndScope?.selectedCycleOrdinalsZeroBased, [0, 965, 1930])
      && report.selectionAndScope?.exactCentralDirectoryScopeExhausted === true
      && report.selectionAndScope?.selectedEntryByteClosureExhausted === true
      && report.selectionAndScope?.fullArchiveContentExhausted === false
      && report.selectionAndScope?.externalDiscoveryPerformed === false
      && report.selectionAndScope?.globalExhaustion === false, "SCOPE_BOUNDARY");
    addError(errors, same(report.denominatorRegistry, {
      populations: [{
        denominatorClass: "MECHANICAL_DEGRADATION_OPERATION_CYCLE_TRACE",
        units: 3,
        unitDefinition: "ONE_SELECTED_RAW_CSV_TRACE_FOR_ONE_SOURCE_OPERATION_CYCLE",
        operationCode: "1100", sourceParentPopulationFiles: 1931,
        independentlyVerifiedFaultUnits: 0,
        episodeStatus: "NOT_AN_OUTSIDER_PROSPECTIVE_EPISODE",
      }],
      crossDomainTotal: null, crossDomainAdditionProhibited: true,
      parentArchiveRawCsvTraceFiles: 28_824,
      parentArchiveApproximateUniqueCycleClaim: 17_000,
      parentFileCountAndApproximateCycleClaimCommensurate: false,
      uniquePhysicalCycleCountEstablished: null,
    }), "DENOMINATOR_BOUNDARY");
    addError(errors, same(report.segmentCoverageAttribution, SEGMENT_BOUNDARY),
      "SEGMENT_BOUNDARY");
    addError(errors, same(report.privacyAndProjection, PRIVACY_PROJECTION),
      "PRIVACY_PROJECTION");
    addError(errors, same(report.modelAndTrainingBoundary, TRAINING_BOUNDARY),
      "TRAINING_BOUNDARY");
    addError(errors, same(report.authorityBoundary, AUTHORITY_BOUNDARY),
      "AUTHORITY_BOUNDARY");
    addError(errors, report.temporalConditionEvidence?.labelsAreIndependentGroundTruth === false
      && report.temporalConditionEvidence?.observedJointThreeTelemetry
        ?.monotonicDegradationEstablished === false
      && report.temporalConditionEvidence?.observedJointThreeTelemetry
        ?.causalEffectEstablished === false
      && report.temporalConditionEvidence?.observedJointThreeTelemetry
        ?.independentConditionTruthEstablished === false, "CONDITION_BOUNDARY");
    addError(errors, report.rightsAndUseClearance?.zenodoOfficialRecordLicenseClaim
      === ME_AD_LICENSE
      && report.rightsAndUseClearance?.archiveReadmeLicenseTextIsPlaceholder === true
      && report.rightsAndUseClearance?.sourcePythonFilesWithConfidentialHeader === 3
      && report.rightsAndUseClearance?.rightsNoticeConsistencyEstablished === false
      && report.rightsAndUseClearance?.legalConclusion === false
      && report.rightsAndUseClearance?.authorizedTrainingClearanceAdjudicated === false,
    "RIGHTS_BOUNDARY");
    addError(errors, report.limitations?.publisherConditionLabelsIndependentlyValidated === false
      && report.limitations?.taskOutcomePresent === false
      && report.limitations?.recoveryAttemptStructurePresent === false
      && report.limitations?.delegationOrAuthorityPresent === false
      && report.limitations?.unselectedArchiveEntriesContentVerified === false
      && report.limitations?.sourceClaimsMustNotBePromotedToIndependentTruth === true,
    "LIMITATIONS");
  } catch (error) { errors.push("VERIFY_EXCEPTION:" + safeError(error)); }
  return Object.freeze({ ok: errors.length === 0, errors });
}

export function verifyMeAdProgressiveFaultWithSource(report, sourceDirectory) {
  const errors = [...verifyMeAdProgressiveFaultReport(report).errors];
  try {
    const rebuilt = buildMeAdProgressiveFaultFromSource(sourceDirectory);
    addError(errors, same(rebuilt, report), "SOURCE_EXACT_REBUILD");
  } catch (error) { errors.push("SOURCE_REBUILD_EXCEPTION:" + safeError(error)); }
  return Object.freeze({ ok: errors.length === 0, errors,
    verificationLevel: errors.length === 0 ? "FULL_SOURCE_REDERIVED" : null });
}

export function buildMeAdProgressiveFaultRunReceipt(report, reportBytes) {
  if (!Buffer.isBuffer(reportBytes) || !reportBytes.equals(canonicalBytes(report))
    || !verifyMeAdProgressiveFaultReport(report).ok) fail("RECEIPT_INPUT_INVALID");
  const body = {
    schema: ME_AD_RECEIPT_SCHEMA,
    createdAt: ME_AD_FROZEN_AT,
    command: "node scripts/acquire-me-ad-progressive-fault.mjs",
    report: {
      path: "me-ad-progressive-fault.json",
      bytes: reportBytes.length,
      sha256: meAdSha256(reportBytes),
      artifactHash: report.artifactHash,
    },
    source: {
      manifestHash: report.sourceReplay.sourceManifestHash,
      manifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      fullSelectedSourceRebuildPerformed: true,
      completeCentralDirectoryReplayed: true,
      fullParentArchiveDownloaded: false,
    },
    denominatorBoundary: {
      class: "MECHANICAL_DEGRADATION_OPERATION_CYCLE_TRACE",
      selectedUnits: 3,
      crossDomainTotal: null,
      crossDomainAdditionProhibited: true,
    },
    zeroClaimBoundary: {
      independentFaultTruthRecords: 0,
      independentOutcomeRecords: 0,
      recoveryRecords: 0,
      delegationRecords: 0,
      authorityRecords: 0,
      networkContributionRecords: 0,
      CEURecords: 0,
      authorizedTrainingRows: 0,
      productionTrainingRows: 0,
    },
    publication: {
      reportPublishedBeforeReceipt: true,
      receiptWrittenLast: true,
      filesMode: "0600",
      directoriesMode: "0700",
      noClobber: true,
    },
  };
  return Object.freeze({ ...body,
    receiptHash: digest(ME_AD_RECEIPT_SCHEMA + "/receipt", body) });
}

export function verifyMeAdProgressiveFaultRunReceipt(receipt, reportBytes) {
  try {
    if (!exactObject(receipt) || !Buffer.isBuffer(reportBytes)) {
      fail("RECEIPT_VERIFY_INPUT_INVALID");
    }
    const report = safeJson(reportBytes, "RECEIPT_REPORT_JSON_INVALID");
    if (!reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_REPORT_NOT_CANONICAL");
    const expected = buildMeAdProgressiveFaultRunReceipt(report, reportBytes);
    if (!same(receipt, expected)) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true, receiptHash: receipt.receiptHash });
  } catch (error) {
    return Object.freeze({ ok: false, errors: [safeError(error)] });
  }
}

export function publishMeAdProgressiveFaultArtifactDirectory(stagingDirectory,
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
      ["me-ad-progressive-fault.json", "run-receipt.json", "source"])) {
    fail("PUBLISH_STAGING_INVALID");
  }
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("PUBLISH_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "source"), path.join(target, "source"));
    renameSync(path.join(staging, "me-ad-progressive-fault.json"),
      path.join(target, "me-ad-progressive-fault.json"));
    /* The receipt is the final completion marker. */
    renameSync(path.join(staging, "run-receipt.json"),
      path.join(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch { fail("PUBLISH_TARGET_INCOMPLETE", target); }
  return target;
}

export function verifyMeAdProgressiveFaultArtifactDirectory(artifactDirectory) {
  try {
    const root = path.resolve(artifactDirectory);
    const snapshots = [];
    requirePrivateDirectory(root,
      ["me-ad-progressive-fault.json", "run-receipt.json", "source"], snapshots);
    const reportBytes = readPrivateStable(root, "me-ad-progressive-fault.json",
      snapshots, 8 * 1024 * 1024);
    const receiptBytes = readPrivateStable(root, "run-receipt.json", snapshots,
      2 * 1024 * 1024);
    const report = safeJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receipt = safeJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    if (!reportBytes.equals(canonicalBytes(report))
      || !receiptBytes.equals(canonicalBytes(receipt))) fail("ARTIFACT_JSON_NOT_CANONICAL");
    const replay = verifyMeAdProgressiveFaultWithSource(report,
      path.join(root, "source"));
    const receiptCheck = verifyMeAdProgressiveFaultRunReceipt(receipt, reportBytes);
    if (!replay.ok || !receiptCheck.ok) fail("ARTIFACT_DIRECTORY_REPLAY_FAILED",
      replay.errors?.join(",") ?? receiptCheck.errors?.join(","));
    recheckSnapshots(snapshots);
    return Object.freeze({ ok: true, verificationLevel: "FULL_SOURCE_REDERIVED",
      artifactHash: report.artifactHash,
      reportFileSha256: meAdSha256(reportBytes),
      receiptHash: receipt.receiptHash,
      sourceManifestHash: report.sourceReplay.sourceManifestHash,
      sourceRoot: report.sourceReplay.sourceRoot,
      selectedMechanicalTraceUnits: 3,
      selectedRows: report.sourceReplay.selectedRawRows,
      authorizedTrainingRows: 0,
      independentOutcomeRecords: 0,
      authorityDelta: 0 });
  } catch (error) {
    return Object.freeze({ ok: false, errors: [safeError(error)] });
  }
}

export const ME_AD_PROGRESSIVE_FAULT_CONSTANTS = Object.freeze({
  recordUrl: RECORD_URL,
  contentUrl: CONTENT_URL,
  recordBytes: RECORD_BYTES,
  recordSha256: RECORD_SHA256,
  archiveBytes: ME_AD_ARCHIVE_BYTES,
  centralOffset: CENTRAL_OFFSET,
  centralBytes: CENTRAL_BYTES,
  centralSha256: CENTRAL_SHA256,
  centralEntries: CENTRAL_ENTRIES,
  centralFiles: CENTRAL_FILES,
  centralDirectories: CENTRAL_DIRECTORIES,
  rangeChunkBytes: RANGE_CHUNK_BYTES,
  selectedOperationCode: "1100",
  selectedEntries: EXPECTED_SELECTED,
  expectedTraceRows: EXPECTED_TRACE_ROWS,
});
