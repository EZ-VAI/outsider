/*
 * Bounded Zenodo PiH exception/correction morphology intake.
 *
 * The 7.9 GB archive is never downloaded. The acquirer freezes the official
 * record, replays the complete ZIP central directory, then range-fetches one
 * predeclared error MAT and one human-demonstrated correction MAT. A lexical
 * pairing is not a success claim, independent outcome, attempt census, or
 * executable recovery authority.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync, closeSync, constants as fsConstants, existsSync, fstatSync,
  lstatSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync,
  rmdirSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import { canonicalizeStrict } from "./canonical.js";

export const PIH_RECORD_ID = 7_568_592;
export const PIH_DOI = "10.5281/zenodo.7568592";
export const PIH_ARCHIVE_NAME = "PiH Exception strategies Multimodal Database.zip";
export const PIH_ARCHIVE_BYTES = 7_937_429_792;
export const PIH_ARCHIVE_MD5 = "md5:dfbe7e8cd02750de0fb24ab45d4ec478";
export const PIH_LICENSE = "CC-BY-4.0";
export const PIH_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const PIH_SOURCE_SCHEMA = "outsider/pih-exception-recovery-pinned-source/v1";
export const PIH_INVENTORY_SCHEMA = "outsider/pih-exception-zip-inventory/v1";
export const PIH_REPORT_SCHEMA = "outsider/pih-exception-recovery-morphology-pair/v1";
export const PIH_RECEIPT_SCHEMA = "outsider/pih-exception-recovery-run-receipt/v1";

const ROOT = "PiH Exception strategies Multimodal Database";
const CONDITION = `${ROOT}/offset__x_-10mm__y_-10mm/degree_x_0_y_0_z_0`;
export const PIH_ERROR_INTERNAL_PATH =
  `${CONDITION}/Error_Trajectory/error_trajectory.mat`;
export const PIH_CORRECTION_INTERNAL_PATH =
  `${CONDITION}/Correction_Trajectory/correction_trajectory_1.mat`;
const README_INTERNAL_PATH = `${ROOT}/README.md`;
const RECORD_URL = `https://zenodo.org/api/records/${PIH_RECORD_ID}`;
const PREVIEW_URL = `https://zenodo.org/records/${PIH_RECORD_ID}/preview/${
  encodeURIComponent(PIH_ARCHIVE_NAME)}?include_deleted=0`;
const CONTENT_URL = `${RECORD_URL}/files/${encodeURIComponent(PIH_ARCHIVE_NAME)}/content`;
const TAIL_BYTES = 128 * 1024;
const MAX_RECORD_BYTES = 2 * 1024 * 1024;
const MAX_PREVIEW_BYTES = 4 * 1024 * 1024;
const MAX_CENTRAL_DIRECTORY_BYTES = 16 * 1024 * 1024;
const MAX_SELECTED_COMPRESSED_BYTES = 160 * 1024 * 1024;
const MAX_SELECTED_UNCOMPRESSED_BYTES = 192 * 1024 * 1024;
const RANGE_CHUNK_BYTES = 2 * 1024 * 1024;
const RANGE_CONCURRENCY = 4;
const RANGE_ATTEMPTS = 3;
const RANGE_BACKOFF_MAX_MS = 5_000;
const FETCH_TIMEOUT_MS = 300_000;
const MAT_TIMEOUT_MS = 180_000;
const MAX_MAT_OUTPUT_BYTES = 16 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MD5 = /^md5:[a-f0-9]{32}$/u;
const SAFE_ARCHIVE_PATH = /^[A-Za-z0-9 _./-]+$/u;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const ZIP64_EOCD = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP_DATA_DESCRIPTOR = 0x08074b50;

function fail(code, detail = null) {
  throw new Error(detail === null ? `PIH_EXCEPTION_RECOVERY_${code}`
    : `PIH_EXCEPTION_RECOVERY_${code}:${detail}`);
}

export function pihSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function pihDigest(value, domain = PIH_REPORT_SCHEMA) {
  return pihSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function exactObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return exactObject(value) && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function safeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
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
      fail("FETCH_STREAM_SIZE_INVALID");
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1 || expectedBytes !== null && total !== expectedBytes) {
    fail("FETCH_BODY_SIZE_INVALID", String(total));
  }
  return Buffer.concat(chunks, total);
}

async function boundedFetch(value, maximumBytes, accept, fetchImpl) {
  const url = checkedZenodoUrl(value);
  const response = await fetchImpl(url, {
    redirect: "error",
    headers: { accept, "accept-encoding": "identity",
      "user-agent": "outsider-pih-exception-recovery/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status !== 200 || new URL(response.url || url).origin !== url.origin) {
    fail(`FETCH_HTTP_${response.status}`, url.pathname);
  }
  return { bytes: await streamResponse(response, maximumBytes), headers: response.headers };
}

function retryDelay(response, attempt) {
  const retryAfter = response?.headers?.get("retry-after");
  if (retryAfter && /^\d+$/u.test(retryAfter)) {
    return Math.min(RANGE_BACKOFF_MAX_MS, Math.max(250, Number(retryAfter) * 1_000));
  }
  return Math.min(RANGE_BACKOFF_MAX_MS, 500 * (2 ** attempt));
}

function waitMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function strictRangePart(start, end, fetchImpl) {
  const url = checkedZenodoUrl(CONTENT_URL);
  const expected = end - start + 1;
  let lastError = null;
  for (let attempt = 0; attempt < RANGE_ATTEMPTS; attempt += 1) {
    let response = null;
    try {
      /* Zenodo's content endpoint rejects `Accept: application/octet-stream`
       * with 406 even though a successful Range response is octet-stream.
       * Leave Accept at the fetch default and constrain representation through
       * identity encoding plus exact 206/Content-Range checks below. */
      response = await fetchImpl(url, {
        redirect: "error",
        headers: { "accept-encoding": "identity", range: `bytes=${start}-${end}`,
          "user-agent": "outsider-pih-exception-recovery/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const contentRange = response.headers.get("content-range");
      if (response.status === 206) {
        if (contentRange !== `bytes ${start}-${end}/${PIH_ARCHIVE_BYTES}`
          || response.headers.get("accept-ranges") !== "bytes"
          || response.headers.get("content-encoding") !== null
          || new URL(response.url || url).origin !== url.origin) {
          fail("STRICT_RANGE_UNSUPPORTED", `${response.status}:${contentRange}`);
        }
        const bytes = await streamResponse(response, expected, expected);
        return { bytes, start, end, contentRange, sizeBytes: bytes.length,
          sha256: pihSha256(bytes) };
      }
      lastError = `HTTP_${response.status}`;
      const transient = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
      if (!transient || attempt === RANGE_ATTEMPTS - 1) {
        fail("STRICT_RANGE_UNSUPPORTED", `${response.status}:${contentRange}`);
      }
      if (response.body) await response.body.cancel("bounded strict-range retry");
      await waitMilliseconds(retryDelay(response, attempt));
    } catch (error) {
      if (safeError(error).startsWith("PIH_EXCEPTION_RECOVERY_STRICT_RANGE_")) throw error;
      lastError = safeError(error);
      if (attempt === RANGE_ATTEMPTS - 1) {
        fail("STRICT_RANGE_FETCH_FAILED", `${start}-${end}:${lastError}`);
      }
      if (response?.body) {
        try { await response.body.cancel("bounded strict-range retry"); } catch { /* no-op */ }
      }
      await waitMilliseconds(retryDelay(response, attempt));
    }
  }
  fail("STRICT_RANGE_FETCH_FAILED", `${start}-${end}:${lastError}`);
}

async function strictRangeFetch(start, end, maximumBytes, fetchImpl) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)
    || start < 0 || end < start || end >= PIH_ARCHIVE_BYTES
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
  const bytes = Buffer.concat(chunks.map((chunk) => chunk.bytes), end - start + 1);
  return { bytes, start, end,
    contentRange: chunks.length === 1 ? chunks[0].contentRange : "STRICT_206_CHUNK_SET",
    chunks: chunks.map(({ start: chunkStart, end: chunkEnd, contentRange,
      sizeBytes, sha256 }) => ({ start: chunkStart, end: chunkEnd,
      contentRange, sizeBytes, sha256 })),
    sha256: pihSha256(bytes) };
}

function rangeProjection(fetched) {
  return { start: fetched.start, end: fetched.end,
    contentRange: fetched.contentRange, chunks: fetched.chunks };
}

function jsonFetch(value, maximumBytes, fetchImpl) {
  return boundedFetch(value, maximumBytes, "application/json", fetchImpl)
    .then((fetched) => {
      try { return { ...fetched, value: JSON.parse(fetched.bytes.toString("utf8")) }; }
      catch { fail("FETCH_JSON_INVALID", value); }
    });
}

function recordProjection(record) {
  const file = Array.isArray(record?.files) && record.files.length === 1
    ? record.files[0] : null;
  if (record?.id !== PIH_RECORD_ID || record?.doi !== PIH_DOI
    || record?.metadata?.doi !== PIH_DOI || record?.metadata?.access_right !== "open"
    || record?.metadata?.license?.id !== "cc-by-4.0"
    || record?.metadata?.resource_type?.type !== "dataset"
    || record?.status !== "published" || record?.state !== "done"
    || file?.key !== PIH_ARCHIVE_NAME || file?.size !== PIH_ARCHIVE_BYTES
    || file?.checksum !== PIH_ARCHIVE_MD5 || file?.links?.self !== CONTENT_URL) {
    fail("RECORD_INVALID");
  }
  return {
    recordId: PIH_RECORD_ID,
    doi: PIH_DOI,
    title: record.metadata.title,
    publicationDate: record.metadata.publication_date,
    created: record.created,
    modified: record.modified,
    recordRevision: record.revision,
    accessRight: "open",
    resourceType: "dataset",
    licenseClaim: PIH_LICENSE,
    status: "published",
    archive: { id: file.id, key: PIH_ARCHIVE_NAME, sizeBytes: PIH_ARCHIVE_BYTES,
      checksumClaim: PIH_ARCHIVE_MD5, contentUrl: CONTENT_URL },
  };
}

function findEocd(tail, absoluteStart) {
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) !== ZIP_EOCD) continue;
    const commentLength = tail.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength !== tail.length) continue;
    const disk = tail.readUInt16LE(offset + 4);
    const centralDisk = tail.readUInt16LE(offset + 6);
    if (disk !== 0 || centralDisk !== 0) fail("ZIP_MULTIDISK_UNSUPPORTED");
    return {
      absoluteOffset: absoluteStart + offset,
      relativeOffset: offset,
      entriesOnDisk16: tail.readUInt16LE(offset + 8),
      totalEntries16: tail.readUInt16LE(offset + 10),
      centralSize32: tail.readUInt32LE(offset + 12),
      centralOffset32: tail.readUInt32LE(offset + 16),
      commentLength,
      bytes: tail.subarray(offset),
    };
  }
  fail("ZIP_EOCD_NOT_FOUND");
}

function parseZip64Record(bytes, expectedOffset) {
  if (bytes.length < 56 || bytes.readUInt32LE(0) !== ZIP64_EOCD) {
    fail("ZIP64_EOCD_INVALID");
  }
  const recordSize = readU64(bytes, 4, "ZIP64_RECORD_SIZE_INVALID");
  if (recordSize + 12 > bytes.length || recordSize < 44) fail("ZIP64_RECORD_TRUNCATED");
  const disk = bytes.readUInt32LE(16);
  const centralDisk = bytes.readUInt32LE(20);
  if (disk !== 0 || centralDisk !== 0) fail("ZIP64_MULTIDISK_UNSUPPORTED");
  return {
    offset: expectedOffset,
    recordBytes: recordSize + 12,
    entriesOnDisk: readU64(bytes, 24, "ZIP64_ENTRY_COUNT_INVALID"),
    totalEntries: readU64(bytes, 32, "ZIP64_ENTRY_COUNT_INVALID"),
    centralSize: readU64(bytes, 40, "ZIP64_CENTRAL_SIZE_INVALID"),
    centralOffset: readU64(bytes, 48, "ZIP64_CENTRAL_OFFSET_INVALID"),
    bytes: bytes.subarray(0, recordSize + 12),
  };
}

function parseExtraFields(extra, saturated, code) {
  let offset = 0;
  let zip64 = null;
  while (offset < extra.length) {
    if (offset + 4 > extra.length) fail(`${code}_EXTRA_TRUNCATED`);
    const id = extra.readUInt16LE(offset);
    const size = extra.readUInt16LE(offset + 2);
    offset += 4;
    if (offset + size > extra.length) fail(`${code}_EXTRA_TRUNCATED`);
    if (id === 0x0001) {
      const data = extra.subarray(offset, offset + size);
      let cursor = 0;
      zip64 = {};
      const take64 = (name) => {
        zip64[name] = readU64(data, cursor, `${code}_ZIP64_INVALID`);
        cursor += 8;
      };
      if (saturated.uncompressed) take64("uncompressedSize");
      if (saturated.compressed) take64("compressedSize");
      if (saturated.localOffset) take64("localHeaderOffset");
      if (saturated.disk) {
        if (cursor + 4 > data.length) fail(`${code}_ZIP64_INVALID`);
        zip64.diskStart = data.readUInt32LE(cursor);
        cursor += 4;
      }
      if (cursor > data.length) fail(`${code}_ZIP64_INVALID`);
    }
    offset += size;
  }
  return zip64;
}

function safeArchiveName(name) {
  if (typeof name !== "string" || name.length < 1 || name.includes("\\")
    || name.startsWith("/") || !SAFE_ARCHIVE_PATH.test(name)
    || name.split("/").some((part, index, pieces) =>
      part === "." || part === ".." || part === "" && index !== pieces.length - 1)) {
    fail("ZIP_ENTRY_PATH_UNSAFE", name);
  }
  return name;
}

export function parsePihCentralDirectory(bytes, expectedEntries = null) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 46) fail("ZIP_CENTRAL_INVALID");
  const entries = [];
  let offset = 0;
  while (offset < bytes.length) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== ZIP_CENTRAL) {
      fail("ZIP_CENTRAL_HEADER_INVALID", String(offset));
    }
    const flags = bytes.readUInt16LE(offset + 8);
    const method = bytes.readUInt16LE(offset + 10);
    const crc32 = bytes.readUInt32LE(offset + 16);
    const compressed32 = bytes.readUInt32LE(offset + 20);
    const uncompressed32 = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const diskStart16 = bytes.readUInt16LE(offset + 34);
    const localOffset32 = bytes.readUInt32LE(offset + 42);
    const finish = offset + 46 + nameLength + extraLength + commentLength;
    if (finish > bytes.length) fail("ZIP_CENTRAL_ENTRY_TRUNCATED");
    const nameBytes = bytes.subarray(offset + 46, offset + 46 + nameLength);
    if ((flags & 0x0800) === 0 && nameBytes.some((value) => value > 0x7f)) {
      fail("ZIP_NON_UTF8_ENTRY_UNSUPPORTED");
    }
    const name = safeArchiveName(nameBytes.toString("utf8"));
    const extra = bytes.subarray(offset + 46 + nameLength,
      offset + 46 + nameLength + extraLength);
    const saturated = { uncompressed: uncompressed32 === 0xffffffff,
      compressed: compressed32 === 0xffffffff, localOffset: localOffset32 === 0xffffffff,
      disk: diskStart16 === 0xffff };
    const zip64 = parseExtraFields(extra, saturated, "ZIP_CENTRAL");
    const compressedSize = saturated.compressed ? zip64?.compressedSize : compressed32;
    const uncompressedSize = saturated.uncompressed ? zip64?.uncompressedSize : uncompressed32;
    const localHeaderOffset = saturated.localOffset ? zip64?.localHeaderOffset : localOffset32;
    const diskStart = saturated.disk ? zip64?.diskStart : diskStart16;
    if (![compressedSize, uncompressedSize, localHeaderOffset, diskStart]
      .every(Number.isSafeInteger) || diskStart !== 0 || ![0, 8].includes(method)) {
      fail("ZIP_CENTRAL_ENTRY_VALUE_INVALID", name);
    }
    entries.push({ path: name, directory: name.endsWith("/"), flags,
      compressionMethod: method, crc32: crc32.toString(16).padStart(8, "0"),
      compressedSize, uncompressedSize, localHeaderOffset,
      centralHeaderOffset: offset, centralHeaderBytes: finish - offset });
    offset = finish;
  }
  if (expectedEntries !== null && entries.length !== expectedEntries) {
    fail("ZIP_CENTRAL_ENTRY_COUNT_MISMATCH", `${entries.length}/${expectedEntries}`);
  }
  const names = entries.map((entry) => entry.path);
  if (new Set(names).size !== names.length) fail("ZIP_CENTRAL_DUPLICATE_PATH");
  return entries;
}

function inventoryFromEntries(entries, zip) {
  const files = entries.filter((entry) => !entry.directory);
  const directories = entries.filter((entry) => entry.directory);
  const errors = files.filter((entry) => /\/Error_Trajectory\/error_trajectory\.mat$/u
    .test(entry.path));
  const corrections = files.filter((entry) =>
    /\/Correction_Trajectory\/correction_trajectory_\d+\.mat$/u.test(entry.path));
  const readmes = files.filter((entry) => entry.path === README_INTERNAL_PATH);
  const trajectoryPaths = new Set([...errors, ...corrections].map((entry) => entry.path));
  const otherFiles = files.filter((entry) => entry.path !== README_INTERNAL_PATH
    && !trajectoryPaths.has(entry.path));
  if (readmes.length !== 1 || errors.length < 1 || corrections.length < 1
    || otherFiles.length !== 0
    || !entries.some((entry) => entry.path === PIH_ERROR_INTERNAL_PATH)
    || !entries.some((entry) => entry.path === PIH_CORRECTION_INTERNAL_PATH)) {
    fail("ZIP_PREDECLARED_INVENTORY_CHANGED");
  }
  const body = {
    schema: PIH_INVENTORY_SCHEMA,
    archiveName: PIH_ARCHIVE_NAME,
    archiveBytes: PIH_ARCHIVE_BYTES,
    publisherMd5Claim: PIH_ARCHIVE_MD5,
    completeCentralDirectoryEnumerated: true,
    zip,
    counts: { centralDirectoryEntries: entries.length, fileEntries: files.length,
      directoryEntries: directories.length, readmeEntries: readmes.length,
      errorTrajectoryEntries: errors.length,
      correctionTrajectoryEntries: corrections.length,
      otherFileEntries: otherFiles.length },
    entries,
  };
  return { ...body, inventoryHash: pihDigest(body, `${PIH_INVENTORY_SCHEMA}/inventory`) };
}

async function inspectRemoteArchive(fetchImpl) {
  const tailStart = PIH_ARCHIVE_BYTES - TAIL_BYTES;
  const tail = await strictRangeFetch(tailStart, PIH_ARCHIVE_BYTES - 1,
    TAIL_BYTES, fetchImpl);
  const eocd = findEocd(tail.bytes, tailStart);
  const locatorRelative = eocd.relativeOffset - 20;
  if (locatorRelative < 0 || tail.bytes.readUInt32LE(locatorRelative) !== ZIP64_LOCATOR) {
    fail("ZIP64_LOCATOR_MISSING");
  }
  if (tail.bytes.readUInt32LE(locatorRelative + 4) !== 0
    || tail.bytes.readUInt32LE(locatorRelative + 16) !== 1) fail("ZIP64_LOCATOR_MULTIDISK");
  const zip64Offset = readU64(tail.bytes, locatorRelative + 8, "ZIP64_LOCATOR_OFFSET_INVALID");
  let zip64Bytes;
  let zip64Fetch = null;
  if (zip64Offset >= tailStart && zip64Offset + 56 <= PIH_ARCHIVE_BYTES) {
    zip64Bytes = tail.bytes.subarray(zip64Offset - tailStart);
  } else {
    zip64Fetch = await strictRangeFetch(zip64Offset, zip64Offset + 55, 56, fetchImpl);
    zip64Bytes = zip64Fetch.bytes;
  }
  const zip64 = parseZip64Record(zip64Bytes, zip64Offset);
  if (zip64.entriesOnDisk !== zip64.totalEntries
    || zip64.centralSize <= 0 || zip64.centralSize > MAX_CENTRAL_DIRECTORY_BYTES
    || zip64.centralOffset + zip64.centralSize !== zip64Offset) {
    fail("ZIP64_DIRECTORY_GEOMETRY_INVALID");
  }
  const central = await strictRangeFetch(zip64.centralOffset,
    zip64.centralOffset + zip64.centralSize - 1, MAX_CENTRAL_DIRECTORY_BYTES, fetchImpl);
  const entries = parsePihCentralDirectory(central.bytes, zip64.totalEntries);
  const zip = {
    zip64: true,
    eocdOffset: eocd.absoluteOffset,
    zip64EocdOffset: zip64.offset,
    centralDirectoryOffset: zip64.centralOffset,
    centralDirectoryBytes: zip64.centralSize,
    centralDirectorySha256: central.sha256,
    centralDirectoryEntries: zip64.totalEntries,
    archiveCommentBytes: eocd.commentLength,
  };
  const inventory = inventoryFromEntries(entries, zip);
  return { inventory, entries, support: [
    { path: "source-support/archive-tail.bin", bytes: tail.bytes,
      range: rangeProjection(tail) },
    { path: "source-support/zip64-eocd.bin", bytes: zip64.bytes,
      range: zip64Fetch === null
        ? { start: zip64.offset, end: zip64.offset + zip64.bytes.length - 1,
          contentRange: `derived-from-tail:${zip64.offset}`, chunks: null }
        : rangeProjection(zip64Fetch) },
    { path: "source-support/central-directory.bin", bytes: central.bytes,
      range: rangeProjection(central) },
    { path: "source-support/eocd.bin", bytes: eocd.bytes,
      range: { start: eocd.absoluteOffset,
        end: eocd.absoluteOffset + eocd.bytes.length - 1,
        contentRange: `derived-from-tail:${eocd.absoluteOffset}`, chunks: null } },
  ] };
}

function parseLocalHeader(bytes, centralEntry) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 30 || bytes.readUInt32LE(0) !== ZIP_LOCAL) {
    fail("ZIP_LOCAL_HEADER_INVALID", centralEntry.path);
  }
  const flags = bytes.readUInt16LE(6);
  const method = bytes.readUInt16LE(8);
  const crc32 = bytes.readUInt32LE(14);
  const compressed32 = bytes.readUInt32LE(18);
  const uncompressed32 = bytes.readUInt32LE(22);
  const nameLength = bytes.readUInt16LE(26);
  const extraLength = bytes.readUInt16LE(28);
  const headerBytes = 30 + nameLength + extraLength;
  if (bytes.length !== headerBytes) fail("ZIP_LOCAL_HEADER_LENGTH_INVALID", centralEntry.path);
  const name = bytes.subarray(30, 30 + nameLength).toString("utf8");
  if (name !== centralEntry.path || flags !== centralEntry.flags
    || method !== centralEntry.compressionMethod || (flags & 0x0001) !== 0) {
    fail("ZIP_LOCAL_CENTRAL_MISMATCH", centralEntry.path);
  }
  const descriptor = (flags & 0x0008) !== 0;
  const extra = bytes.subarray(30 + nameLength);
  const saturated = { uncompressed: uncompressed32 === 0xffffffff,
    compressed: compressed32 === 0xffffffff, localOffset: false, disk: false };
  const zip64 = parseExtraFields(extra, saturated, "ZIP_LOCAL");
  const localCompressed = saturated.compressed ? zip64?.compressedSize : compressed32;
  const localUncompressed = saturated.uncompressed ? zip64?.uncompressedSize : uncompressed32;
  if (!descriptor && (crc32.toString(16).padStart(8, "0") !== centralEntry.crc32
    || localCompressed !== centralEntry.compressedSize
    || localUncompressed !== centralEntry.uncompressedSize)) {
    fail("ZIP_LOCAL_SIZE_OR_CRC_MISMATCH", centralEntry.path);
  }
  if (descriptor && ![0, centralEntry.compressedSize].includes(localCompressed)
    || descriptor && ![0, centralEntry.uncompressedSize].includes(localUncompressed)
    || descriptor && crc32 !== 0 && crc32.toString(16).padStart(8, "0") !== centralEntry.crc32) {
    fail("ZIP_LOCAL_DESCRIPTOR_PLACEHOLDER_INVALID", centralEntry.path);
  }
  return { flags, compressionMethod: method, descriptor, headerBytes,
    dataStart: centralEntry.localHeaderOffset + headerBytes,
    dataEnd: centralEntry.localHeaderOffset + headerBytes + centralEntry.compressedSize - 1,
    localCrc32: crc32.toString(16).padStart(8, "0"),
    localCompressedSize: localCompressed, localUncompressedSize: localUncompressed };
}

function parseDataDescriptor(bytes, centralEntry) {
  let offset = 0;
  let signaturePresent = false;
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === ZIP_DATA_DESCRIPTOR) {
    signaturePresent = true;
    offset = 4;
  }
  const zip64 = centralEntry.compressedSize > 0xffffffff
    || centralEntry.uncompressedSize > 0xffffffff;
  const required = offset + 4 + (zip64 ? 16 : 8);
  if (bytes.length < required) fail("ZIP_DATA_DESCRIPTOR_TRUNCATED", centralEntry.path);
  const crc32 = bytes.readUInt32LE(offset).toString(16).padStart(8, "0");
  offset += 4;
  const compressedSize = zip64 ? readU64(bytes, offset, "ZIP_DESCRIPTOR_SIZE_INVALID")
    : bytes.readUInt32LE(offset);
  offset += zip64 ? 8 : 4;
  const uncompressedSize = zip64 ? readU64(bytes, offset, "ZIP_DESCRIPTOR_SIZE_INVALID")
    : bytes.readUInt32LE(offset);
  offset += zip64 ? 8 : 4;
  if (crc32 !== centralEntry.crc32 || compressedSize !== centralEntry.compressedSize
    || uncompressedSize !== centralEntry.uncompressedSize) {
    fail("ZIP_DATA_DESCRIPTOR_MISMATCH", centralEntry.path);
  }
  return { bytes: bytes.subarray(0, offset), signaturePresent, zip64,
    crc32, compressedSize, uncompressedSize };
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
    return inflateRawSync(compressed, { maxOutputLength: MAX_SELECTED_UNCOMPRESSED_BYTES });
  }
  fail("ZIP_COMPRESSION_UNSUPPORTED", String(entry.compressionMethod));
}

async function fetchSelectedEntry(entry, role, fetchImpl) {
  if (!entry || entry.directory || entry.uncompressedSize <= 0
    || entry.uncompressedSize > MAX_SELECTED_UNCOMPRESSED_BYTES
    || entry.compressedSize <= 0 || entry.compressedSize > MAX_SELECTED_COMPRESSED_BYTES) {
    fail("SELECTED_ENTRY_SIZE_INVALID", role);
  }
  const fixed = await strictRangeFetch(entry.localHeaderOffset,
    entry.localHeaderOffset + 29, 30, fetchImpl);
  if (fixed.bytes.readUInt32LE(0) !== ZIP_LOCAL) fail("ZIP_LOCAL_FIXED_INVALID", role);
  const headerBytes = 30 + fixed.bytes.readUInt16LE(26) + fixed.bytes.readUInt16LE(28);
  if (headerBytes < 30 || headerBytes > 64 * 1024) fail("ZIP_LOCAL_HEADER_SIZE_INVALID", role);
  const headerRange = await strictRangeFetch(entry.localHeaderOffset,
    entry.localHeaderOffset + headerBytes - 1, headerBytes, fetchImpl);
  const local = parseLocalHeader(headerRange.bytes, entry);
  if (local.dataEnd >= PIH_ARCHIVE_BYTES) fail("ZIP_ENTRY_DATA_RANGE_INVALID", role);
  const compressedRange = await strictRangeFetch(local.dataStart, local.dataEnd,
    MAX_SELECTED_COMPRESSED_BYTES, fetchImpl);
  const raw = decompressEntry(compressedRange.bytes, entry);
  if (raw.length !== entry.uncompressedSize || crc32Hex(raw) !== entry.crc32) {
    fail("ZIP_SELECTED_ENTRY_CRC_OR_SIZE_INVALID", role);
  }
  let descriptor = null;
  if (local.descriptor) {
    const descriptorRange = await strictRangeFetch(local.dataEnd + 1,
      local.dataEnd + 24, 24, fetchImpl);
    descriptor = { parsed: parseDataDescriptor(descriptorRange.bytes, entry),
      range: descriptorRange };
  }
  return { role, entry, local, raw, headerRange, compressedRange, descriptor };
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

function supportManifestEntry(item) {
  return { path: item.path, sizeBytes: item.bytes.length,
    sha256: pihSha256(item.bytes),
    source: item.source,
    range: item.range ?? null };
}

function writeSupportItems(root, items) {
  for (const item of items) writePrivate(path.join(root, ...item.path.split("/")), item.bytes);
}

function selectedManifestEntry(fetched, localPath, compressedSupportPath) {
  return {
    role: fetched.role,
    internalPath: fetched.entry.path,
    localPath,
    flags: fetched.entry.flags,
    compressionMethod: fetched.entry.compressionMethod,
    crc32: fetched.entry.crc32,
    compressedSize: fetched.entry.compressedSize,
    uncompressedSize: fetched.entry.uncompressedSize,
    localHeaderOffset: fetched.entry.localHeaderOffset,
    localHeaderBytes: fetched.local.headerBytes,
    dataStart: fetched.local.dataStart,
    dataEnd: fetched.local.dataEnd,
    dataDescriptorPresent: fetched.local.descriptor,
    localHeaderSupportPath: `source-support/${fetched.role.toLowerCase()}-local-header.bin`,
    dataDescriptorSupportPath: fetched.descriptor
      ? `source-support/${fetched.role.toLowerCase()}-data-descriptor.bin` : null,
    compressedRangeSha256: fetched.compressedRange.sha256,
    compressedRangeChunks: fetched.compressedRange.chunks,
    compressedBytesStoredSeparately: compressedSupportPath !== null,
    compressedSupportPath,
    rawMatSha256: pihSha256(fetched.raw),
  };
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
    /* Manifest moves last and is the source-completion marker. */
    renameSync(path.join(staging, "acquisition-manifest.json"),
      path.join(target, "acquisition-manifest.json"));
    rmdirSync(staging);
  } catch { fail("SOURCE_TARGET_PUBLISH_INCOMPLETE", target); }
}

export async function acquirePinnedPihExceptionRecoverySource(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_TOO_BROAD");
  ensurePrivateDirectory(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  try {
    const recordBeforeRaw = await jsonFetch(RECORD_URL, MAX_RECORD_BYTES, fetchImpl);
    const recordBefore = recordProjection(recordBeforeRaw.value);
    const preview = await boundedFetch(PREVIEW_URL, MAX_PREVIEW_BYTES, "text/html", fetchImpl);
    const previewText = preview.bytes.toString("utf8");
    for (const marker of ["offset__x_-10mm__y_-10mm", "degree_x_0_y_0_z_0",
      "Error_Trajectory", "error_trajectory.mat", "Correction_Trajectory",
      "correction_trajectory_1.mat"]) {
      if (!previewText.includes(marker)) fail("PREVIEW_PREDECLARED_PATH_MISSING", marker);
    }
    const archive = await inspectRemoteArchive(fetchImpl);
    const byPath = new Map(archive.entries.map((entry) => [entry.path, entry]));
    const error = await fetchSelectedEntry(byPath.get(PIH_ERROR_INTERNAL_PATH),
      "ERROR", fetchImpl);
    const correction = await fetchSelectedEntry(byPath.get(PIH_CORRECTION_INTERNAL_PATH),
      "CORRECTION", fetchImpl);
    const selected = [error, correction];
    const supportItems = [
      { path: "source-support/record-before.json", bytes: recordBeforeRaw.bytes,
        source: RECORD_URL },
      { path: "source-support/preview.html", bytes: preview.bytes,
        source: PREVIEW_URL },
      ...archive.support.map((item) => ({ ...item, source: CONTENT_URL })),
    ];
    const selectedManifest = [];
    for (const fetched of selected) {
      const lower = fetched.role.toLowerCase();
      const localPath = `raw/${lower === "error" ? "error_trajectory.mat"
        : "correction_trajectory_1.mat"}`;
      writePrivate(path.join(staging, ...localPath.split("/")), fetched.raw);
      supportItems.push({ path: `source-support/${lower}-local-header.bin`,
        bytes: fetched.headerRange.bytes, source: CONTENT_URL,
        range: rangeProjection(fetched.headerRange) });
      if (fetched.descriptor) {
        supportItems.push({ path: `source-support/${lower}-data-descriptor.bin`,
          bytes: fetched.descriptor.range.bytes, source: CONTENT_URL,
          range: rangeProjection(fetched.descriptor.range) });
      }
      let compressedSupportPath = null;
      if (fetched.entry.compressionMethod !== 0) {
        compressedSupportPath = `source-support/${lower}-compressed-entry.bin`;
        supportItems.push({ path: compressedSupportPath, bytes: fetched.compressedRange.bytes,
          source: CONTENT_URL,
          range: rangeProjection(fetched.compressedRange) });
      }
      selectedManifest.push(selectedManifestEntry(fetched, localPath, compressedSupportPath));
    }
    const recordAfterRaw = await jsonFetch(RECORD_URL, MAX_RECORD_BYTES, fetchImpl);
    const recordAfter = recordProjection(recordAfterRaw.value);
    if (!same(recordBefore, recordAfter)) fail("RECORD_CHANGED_DURING_ACQUISITION");
    supportItems.push({ path: "source-support/record-after.json", bytes: recordAfterRaw.bytes,
      source: RECORD_URL });
    supportItems.sort((left, right) => left.path.localeCompare(right.path));
    writeSupportItems(staging, supportItems);
    const inventoryBytes = canonicalBytes(archive.inventory);
    writePrivate(path.join(staging, "archive-inventory.json"), inventoryBytes);
    const manifestBody = {
      schema: PIH_SOURCE_SCHEMA,
      capturedAt: PIH_FROZEN_AT,
      recordBefore,
      recordAfter,
      recordStableDuringAcquisition: true,
      preview: { url: PREVIEW_URL, exactPredeclaredConditionObserved: true,
        bytePinned: true },
      archive: {
        name: PIH_ARCHIVE_NAME,
        sizeBytes: PIH_ARCHIVE_BYTES,
        publisherMd5Claim: PIH_ARCHIVE_MD5,
        fullArchiveDownloaded: false,
        fullArchiveMd5Recomputed: false,
        strictHttpRangeEstablished: true,
        completeCentralDirectoryEnumerated: true,
        inventoryHash: archive.inventory.inventoryHash,
        inventoryFileSha256: pihSha256(inventoryBytes),
      },
      selection: {
        condition: { offsetXmm: -10, offsetYmm: -10,
          rotationXdeg: 0, rotationYdeg: 0, rotationZdeg: 0 },
        declaredBeforeArchiveInspection: true,
        selectedEntries: 2,
        selectedUncompressedBytes: selectedManifest.reduce((sum, entry) =>
          sum + entry.uncompressedSize, 0),
        selectedCompressedBytes: selectedManifest.reduce((sum, entry) =>
          sum + entry.compressedSize, 0),
        errorEntries: 1,
        correctionEntries: 1,
      },
      rights: {
        publisherLicenseClaim: PIH_LICENSE,
        claimSource: "Zenodo official record API",
        legalAdjudicationPerformed: false,
        productionTrainingAuthorizedByOutsider: false,
      },
      privacy: {
        publisherDescribesRgbAndPointCloudModalities: true,
        rawSelectedMatricesRetainedLocally: true,
        noPiiGuaranteed: false,
        networkProjectionAllowed: false,
      },
      transportAttested: false,
      sourceSupportObjects: supportItems.map(supportManifestEntry),
      selectedObjects: selectedManifest.sort((left, right) => left.role.localeCompare(right.role)),
    };
    const manifest = { ...manifestBody,
      manifestHash: pihDigest(manifestBody, `${PIH_SOURCE_SCHEMA}/manifest`) };
    writePrivate(path.join(staging, "acquisition-manifest.json"), canonicalBytes(manifest));
    publishSourceStaging(staging, target);
    const manifestBytes = readFileSync(path.join(target, "acquisition-manifest.json"));
    return { sourceDirectory: target, manifest,
      manifestFileSha256: pihSha256(manifestBytes) };
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

function requireDirectory(directory, expectedEntries, snapshots) {
  const target = path.resolve(directory);
  const before = lstatSync(target, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()
    || Number(before.mode & 0o777n) !== 0o700) fail("SOURCE_DIRECTORY_UNSAFE", target);
  const actual = sorted(readdirSync(target));
  if (!same(actual, sorted(expectedEntries))) fail("SOURCE_DIRECTORY_LAYOUT_INVALID", target);
  const after = lstatSync(target, { bigint: true });
  if (before.dev !== after.dev || before.ino !== after.ino || before.mode !== after.mode
    || before.size !== after.size || before.mtimeNs !== after.mtimeNs
    || before.ctimeNs !== after.ctimeNs) fail("SOURCE_DIRECTORY_CHANGED", target);
  snapshots.push({ target, directory: true, entries: sorted(expectedEntries),
    dev: after.dev, ino: after.ino, mode: after.mode, size: after.size,
    mtimeNs: after.mtimeNs, ctimeNs: after.ctimeNs });
}

function checkedLocalPath(root, relative) {
  if (typeof relative !== "string" || relative.length < 1 || relative.startsWith("/")
    || relative.split("/").some((part) => !part || part === "." || part === "..")) {
    fail("SOURCE_PATH_INVALID", relative);
  }
  const target = path.resolve(root, ...relative.split("/"));
  const relation = path.relative(path.resolve(root), target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("SOURCE_PATH_ESCAPE", relative);
  return target;
}

function readPrivateStable(root, relative, snapshots, expected = null,
  maximumBytes = MAX_SELECTED_UNCOMPRESSED_BYTES) {
  const target = checkedLocalPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (link.isSymbolicLink() || !link.isFile()
    || Number(link.mode & 0o777n) !== 0o600 || link.size < 1n
    || link.size > BigInt(maximumBytes)) fail("SOURCE_FILE_UNSAFE", relative);
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
    if (expected && (expected.sizeBytes !== null && bytes.length !== expected.sizeBytes
      || pihSha256(bytes) !== expected.sha256)) fail("SOURCE_FILE_BINDING_MISMATCH", relative);
    snapshots.push({ target, directory: false, entries: null,
      dev: after.dev, ino: after.ino, mode: after.mode, size: after.size,
      mtimeNs: after.mtimeNs, ctimeNs: after.ctimeNs });
    return bytes;
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function recheckSnapshots(snapshots) {
  for (const snapshot of snapshots) {
    const after = lstatSync(snapshot.target, { bigint: true });
    if (after.isSymbolicLink()
      || (snapshot.directory ? !after.isDirectory() : !after.isFile())
      || after.dev !== snapshot.dev || after.ino !== snapshot.ino
      || after.mode !== snapshot.mode || after.size !== snapshot.size
      || after.mtimeNs !== snapshot.mtimeNs || after.ctimeNs !== snapshot.ctimeNs) {
      fail("SOURCE_SNAPSHOT_CHANGED", snapshot.target);
    }
    if (snapshot.directory && !same(sorted(readdirSync(snapshot.target)), snapshot.entries)) {
      fail("SOURCE_SNAPSHOT_LAYOUT_CHANGED", snapshot.target);
    }
  }
}

function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function validateRangeChunks(chunks, start, end, code, allowDerived = false) {
  if (chunks === null) {
    if (!allowDerived) fail(`${code}_CHUNKS_MISSING`);
    return;
  }
  if (!Array.isArray(chunks) || chunks.length < 1) fail(`${code}_CHUNKS_INVALID`);
  let cursor = start;
  for (const chunk of chunks) {
    if (!exactKeys(chunk, ["start", "end", "contentRange", "sizeBytes", "sha256"])
      || chunk.start !== cursor || !Number.isSafeInteger(chunk.end) || chunk.end < chunk.start
      || chunk.end > end || chunk.end - chunk.start + 1 !== chunk.sizeBytes
      || chunk.sizeBytes > RANGE_CHUNK_BYTES || !HASH.test(chunk.sha256 ?? "")
      || chunk.contentRange !== `bytes ${chunk.start}-${chunk.end}/${PIH_ARCHIVE_BYTES}`) {
      fail(`${code}_CHUNK_INVALID`);
    }
    cursor = chunk.end + 1;
  }
  if (cursor !== end + 1) fail(`${code}_CHUNKS_INCOMPLETE`);
}

function verifyRangeChunkHashes(bytes, range, code) {
  if (range.chunks === null) return;
  for (const chunk of range.chunks) {
    const relativeStart = chunk.start - range.start;
    const relativeEnd = relativeStart + chunk.sizeBytes;
    if (relativeStart < 0 || relativeEnd > bytes.length
      || pihSha256(bytes.subarray(relativeStart, relativeEnd)) !== chunk.sha256) {
      fail(`${code}_CHUNK_HASH_MISMATCH`, `${chunk.start}-${chunk.end}`);
    }
  }
}

function validateSupportEntry(entry) {
  if (!exactKeys(entry, ["path", "sizeBytes", "sha256", "source", "range"])
    || !/^source-support\/[a-z0-9-]+\.(json|html|bin)$/u.test(entry.path ?? "")
    || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes <= 0
    || entry.sizeBytes > MAX_SELECTED_COMPRESSED_BYTES
    || !HASH.test(entry.sha256 ?? "") || typeof entry.source !== "string") {
    fail("MANIFEST_SUPPORT_ENTRY_INVALID");
  }
  checkedZenodoUrl(entry.source);
  if (entry.range !== null && (!exactKeys(entry.range,
    ["start", "end", "contentRange", "chunks"])
    || !Number.isSafeInteger(entry.range.start) || !Number.isSafeInteger(entry.range.end)
    || entry.range.end < entry.range.start || typeof entry.range.contentRange !== "string")) {
    fail("MANIFEST_SUPPORT_RANGE_INVALID", entry.path);
  }
  if (entry.range !== null) {
    const derived = entry.range.contentRange.startsWith("derived-from-tail:");
    if (entry.range.end - entry.range.start + 1 !== entry.sizeBytes
      || derived !== (entry.range.chunks === null)) {
      fail("MANIFEST_SUPPORT_RANGE_PROVENANCE_INVALID", entry.path);
    }
    validateRangeChunks(entry.range.chunks, entry.range.start, entry.range.end,
      "MANIFEST_SUPPORT_RANGE", derived);
    if (!derived && entry.range.contentRange !== (entry.range.chunks.length === 1
      ? entry.range.chunks[0].contentRange : "STRICT_206_CHUNK_SET")) {
      fail("MANIFEST_SUPPORT_RANGE_SUMMARY_INVALID", entry.path);
    }
  }
}

function validateSelectedEntry(entry) {
  if (!exactObject(entry) || !["ERROR", "CORRECTION"].includes(entry.role)
    || ![PIH_ERROR_INTERNAL_PATH, PIH_CORRECTION_INTERNAL_PATH].includes(entry.internalPath)
    || !["raw/error_trajectory.mat", "raw/correction_trajectory_1.mat"]
      .includes(entry.localPath)
    || !Number.isSafeInteger(entry.flags) || ![0, 8].includes(entry.compressionMethod)
    || !/^[a-f0-9]{8}$/u.test(entry.crc32 ?? "")
    || !Number.isSafeInteger(entry.compressedSize) || entry.compressedSize <= 0
    || !Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize <= 0
    || !Number.isSafeInteger(entry.localHeaderOffset) || entry.localHeaderOffset < 0
    || !Number.isSafeInteger(entry.localHeaderBytes) || entry.localHeaderBytes < 30
    || !Number.isSafeInteger(entry.dataStart) || !Number.isSafeInteger(entry.dataEnd)
    || typeof entry.dataDescriptorPresent !== "boolean"
    || !/^source-support\/(error|correction)-local-header\.bin$/u
      .test(entry.localHeaderSupportPath ?? "")
    || entry.dataDescriptorSupportPath !== null
      && !/^source-support\/(error|correction)-data-descriptor\.bin$/u
        .test(entry.dataDescriptorSupportPath)
    || !HASH.test(entry.compressedRangeSha256 ?? "")
    || typeof entry.compressedBytesStoredSeparately !== "boolean"
    || entry.compressedSupportPath !== null
      && !/^source-support\/(error|correction)-compressed-entry\.bin$/u
        .test(entry.compressedSupportPath)
    || !Array.isArray(entry.compressedRangeChunks)
    || !HASH.test(entry.rawMatSha256 ?? "")) fail("MANIFEST_SELECTED_ENTRY_INVALID");
  validateRangeChunks(entry.compressedRangeChunks, entry.dataStart, entry.dataEnd,
    "MANIFEST_SELECTED_RANGE");
  const expectedForRole = entry.role === "ERROR"
    ? { internalPath: PIH_ERROR_INTERNAL_PATH, localPath: "raw/error_trajectory.mat",
      supportStem: "error" }
    : { internalPath: PIH_CORRECTION_INTERNAL_PATH,
      localPath: "raw/correction_trajectory_1.mat", supportStem: "correction" };
  if (entry.internalPath !== expectedForRole.internalPath
    || entry.localPath !== expectedForRole.localPath
    || entry.localHeaderSupportPath
      !== `source-support/${expectedForRole.supportStem}-local-header.bin`
    || entry.dataDescriptorSupportPath !== null
      && entry.dataDescriptorSupportPath
        !== `source-support/${expectedForRole.supportStem}-data-descriptor.bin`
    || entry.compressedSupportPath !== null
      && entry.compressedSupportPath
        !== `source-support/${expectedForRole.supportStem}-compressed-entry.bin`) {
    fail("MANIFEST_SELECTED_ROLE_BINDING_INVALID", entry.role);
  }
  if (entry.dataEnd - entry.dataStart + 1 !== entry.compressedSize
    || entry.dataStart !== entry.localHeaderOffset + entry.localHeaderBytes
    || entry.dataDescriptorPresent !== (entry.dataDescriptorSupportPath !== null)
    || entry.compressionMethod === 0 && (entry.compressedBytesStoredSeparately !== false
      || entry.compressedSupportPath !== null || entry.compressedRangeSha256 !== entry.rawMatSha256)
    || entry.compressionMethod === 8 && (entry.compressedBytesStoredSeparately !== true
      || entry.compressedSupportPath === null)) fail("MANIFEST_SELECTED_ENTRY_GEOMETRY_INVALID");
}

function validateManifest(manifest) {
  if (!exactObject(manifest)) fail("MANIFEST_INVALID");
  const { manifestHash, ...body } = manifest;
  if (manifest.schema !== PIH_SOURCE_SCHEMA || manifest.capturedAt !== PIH_FROZEN_AT
    || manifest.recordStableDuringAcquisition !== true
    || manifest.preview?.exactPredeclaredConditionObserved !== true
    || manifest.archive?.name !== PIH_ARCHIVE_NAME
    || manifest.archive?.sizeBytes !== PIH_ARCHIVE_BYTES
    || manifest.archive?.publisherMd5Claim !== PIH_ARCHIVE_MD5
    || manifest.archive?.fullArchiveDownloaded !== false
    || manifest.archive?.fullArchiveMd5Recomputed !== false
    || manifest.archive?.strictHttpRangeEstablished !== true
    || manifest.archive?.completeCentralDirectoryEnumerated !== true
    || !HASH.test(manifest.archive?.inventoryHash ?? "")
    || !HASH.test(manifest.archive?.inventoryFileSha256 ?? "")
    || manifest.selection?.condition?.offsetXmm !== -10
    || manifest.selection?.condition?.offsetYmm !== -10
    || manifest.selection?.condition?.rotationXdeg !== 0
    || manifest.selection?.condition?.rotationYdeg !== 0
    || manifest.selection?.condition?.rotationZdeg !== 0
    || manifest.selection?.declaredBeforeArchiveInspection !== true
    || manifest.selection?.selectedEntries !== 2
    || manifest.selection?.errorEntries !== 1
    || manifest.selection?.correctionEntries !== 1
    || manifest.rights?.publisherLicenseClaim !== PIH_LICENSE
    || manifest.rights?.legalAdjudicationPerformed !== false
    || manifest.rights?.productionTrainingAuthorizedByOutsider !== false
    || manifest.privacy?.rawSelectedMatricesRetainedLocally !== true
    || manifest.privacy?.noPiiGuaranteed !== false
    || manifest.privacy?.networkProjectionAllowed !== false
    || manifest.transportAttested !== false
    || manifestHash !== pihDigest(body, `${PIH_SOURCE_SCHEMA}/manifest`)
    || !same(manifest.recordBefore, manifest.recordAfter)) fail("MANIFEST_BOUNDARY_INVALID");
  if (!Array.isArray(manifest.sourceSupportObjects)
    || manifest.sourceSupportObjects.length < 8
    || !Array.isArray(manifest.selectedObjects) || manifest.selectedObjects.length !== 2) {
    fail("MANIFEST_OBJECT_ARRAYS_INVALID");
  }
  manifest.sourceSupportObjects.forEach(validateSupportEntry);
  manifest.selectedObjects.forEach(validateSelectedEntry);
  const selectedUncompressedBytes = manifest.selectedObjects.reduce((sum, entry) =>
    sum + entry.uncompressedSize, 0);
  const selectedCompressedBytes = manifest.selectedObjects.reduce((sum, entry) =>
    sum + entry.compressedSize, 0);
  const supportPaths = manifest.sourceSupportObjects.map((entry) => entry.path);
  if (!same(supportPaths, sorted(supportPaths)) || new Set(supportPaths).size !== supportPaths.length
    || !same(manifest.selectedObjects.map((entry) => entry.role), ["CORRECTION", "ERROR"])
    || manifest.selection.selectedUncompressedBytes !== selectedUncompressedBytes
    || manifest.selection.selectedCompressedBytes !== selectedCompressedBytes) {
    fail("MANIFEST_OBJECT_ORDER_INVALID");
  }
  return manifest;
}

function replayZipSupport(manifest, inventory, supportBytes, rawBytes) {
  const supportEntries = new Map(manifest.sourceSupportObjects.map((entry) =>
    [entry.path, entry]));
  const tail = supportBytes.get("source-support/archive-tail.bin");
  const tailStart = PIH_ARCHIVE_BYTES - tail.length;
  const tailBinding = supportEntries.get("source-support/archive-tail.bin")?.range;
  if (tailBinding?.start !== tailStart || tailBinding?.end !== PIH_ARCHIVE_BYTES - 1) {
    fail("SOURCE_TAIL_RANGE_BINDING_INVALID");
  }
  const eocd = findEocd(tail, tailStart);
  const locator = eocd.relativeOffset - 20;
  if (locator < 0 || tail.readUInt32LE(locator) !== ZIP64_LOCATOR) {
    fail("SOURCE_ZIP64_LOCATOR_INVALID");
  }
  const zip64Offset = readU64(tail, locator + 8, "SOURCE_ZIP64_OFFSET_INVALID");
  const zip64Support = supportBytes.get("source-support/zip64-eocd.bin");
  const zip64Binding = supportEntries.get("source-support/zip64-eocd.bin")?.range;
  if (zip64Binding?.start !== zip64Offset
    || zip64Binding?.end !== zip64Offset + zip64Support.length - 1
    || zip64Binding.chunks === null && !zip64Support.equals(
      tail.subarray(zip64Offset - tailStart, zip64Offset - tailStart + zip64Support.length))) {
    fail("SOURCE_ZIP64_RANGE_BINDING_INVALID");
  }
  const zip64 = parseZip64Record(zip64Support, zip64Offset);
  const centralBytes = supportBytes.get("source-support/central-directory.bin");
  const centralBinding = supportEntries.get("source-support/central-directory.bin")?.range;
  if (zip64.centralOffset !== inventory.zip.centralDirectoryOffset
    || zip64.centralSize !== centralBytes.length
    || zip64.totalEntries !== inventory.counts.centralDirectoryEntries
    || pihSha256(centralBytes) !== inventory.zip.centralDirectorySha256
    || centralBinding?.start !== zip64.centralOffset
    || centralBinding?.end !== zip64.centralOffset + zip64.centralSize - 1
    || !supportBytes.get("source-support/eocd.bin").equals(eocd.bytes)) {
    fail("SOURCE_ZIP64_GEOMETRY_MISMATCH");
  }
  const entries = parsePihCentralDirectory(centralBytes, zip64.totalEntries);
  const rebuilt = inventoryFromEntries(entries, inventory.zip);
  if (!same(rebuilt, inventory)) fail("SOURCE_INVENTORY_REBUILD_MISMATCH");
  const byPath = new Map(entries.map((entry) => [entry.path, entry]));
  for (const selected of manifest.selectedObjects) {
    const central = byPath.get(selected.internalPath);
    if (!central || central.flags !== selected.flags
      || central.compressionMethod !== selected.compressionMethod
      || central.crc32 !== selected.crc32
      || central.compressedSize !== selected.compressedSize
      || central.uncompressedSize !== selected.uncompressedSize
      || central.localHeaderOffset !== selected.localHeaderOffset) {
      fail("SOURCE_SELECTED_CENTRAL_MISMATCH", selected.role);
    }
    const header = supportBytes.get(selected.localHeaderSupportPath);
    const headerBinding = supportEntries.get(selected.localHeaderSupportPath)?.range;
    const local = parseLocalHeader(header, central);
    if (local.headerBytes !== selected.localHeaderBytes
      || local.dataStart !== selected.dataStart || local.dataEnd !== selected.dataEnd
      || local.descriptor !== selected.dataDescriptorPresent
      || headerBinding?.start !== selected.localHeaderOffset
      || headerBinding?.end !== selected.localHeaderOffset + selected.localHeaderBytes - 1) {
      fail("SOURCE_SELECTED_LOCAL_MISMATCH", selected.role);
    }
    if (selected.dataDescriptorPresent) {
      const descriptorBytes = supportBytes.get(selected.dataDescriptorSupportPath);
      const descriptorBinding = supportEntries.get(selected.dataDescriptorSupportPath)?.range;
      parseDataDescriptor(descriptorBytes, central);
      if (descriptorBinding?.start !== selected.dataEnd + 1
        || descriptorBinding?.end !== selected.dataEnd + 24) {
        fail("SOURCE_SELECTED_DESCRIPTOR_RANGE_MISMATCH", selected.role);
      }
    }
    const raw = rawBytes.get(selected.localPath);
    if (raw.length !== selected.uncompressedSize || pihSha256(raw) !== selected.rawMatSha256
      || crc32Hex(raw) !== selected.crc32) fail("SOURCE_SELECTED_RAW_MISMATCH", selected.role);
    if (selected.compressionMethod === 0) {
      if (pihSha256(raw) !== selected.compressedRangeSha256) {
        fail("SOURCE_STORED_RANGE_MISMATCH", selected.role);
      }
      verifyRangeChunkHashes(raw, { start: selected.dataStart, end: selected.dataEnd,
        chunks: selected.compressedRangeChunks }, "SOURCE_STORED_RANGE");
    } else {
      const compressed = supportBytes.get(selected.compressedSupportPath);
      const compressedBinding = supportEntries.get(selected.compressedSupportPath)?.range;
      if (pihSha256(compressed) !== selected.compressedRangeSha256
        || compressedBinding?.start !== selected.dataStart
        || compressedBinding?.end !== selected.dataEnd
        || !same(compressedBinding?.chunks, selected.compressedRangeChunks)
        || !decompressEntry(compressed, central).equals(raw)) {
        fail("SOURCE_DEFLATE_REPLAY_MISMATCH", selected.role);
      }
    }
  }
}

export function verifyPihExceptionRecoverySourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const snapshots = [];
  requireDirectory(root,
    ["acquisition-manifest.json", "archive-inventory.json", "raw", "source-support"],
    snapshots);
  const manifestBytes = readPrivateStable(root, "acquisition-manifest.json", snapshots,
    null, 4 * 1024 * 1024);
  const manifest = validateManifest(parseJson(manifestBytes, "MANIFEST_JSON_INVALID"));
  requireDirectory(path.join(root, "raw"),
    ["correction_trajectory_1.mat", "error_trajectory.mat"], snapshots);
  requireDirectory(path.join(root, "source-support"),
    manifest.sourceSupportObjects.map((entry) => path.posix.basename(entry.path)), snapshots);
  const inventoryBytes = readPrivateStable(root, "archive-inventory.json", snapshots,
    { sizeBytes: null, sha256: manifest.archive.inventoryFileSha256 },
    8 * 1024 * 1024);
  // Size is intentionally derived from bytes; SHA is the fixed manifest binding.
  if (pihSha256(inventoryBytes) !== manifest.archive.inventoryFileSha256) {
    fail("SOURCE_INVENTORY_FILE_HASH_MISMATCH");
  }
  const inventory = parseJson(inventoryBytes, "INVENTORY_JSON_INVALID");
  const { inventoryHash, ...inventoryBody } = inventory;
  if (inventory.schema !== PIH_INVENTORY_SCHEMA
    || inventoryHash !== pihDigest(inventoryBody, `${PIH_INVENTORY_SCHEMA}/inventory`)
    || inventoryHash !== manifest.archive.inventoryHash) fail("INVENTORY_HASH_INVALID");
  const supportBytes = new Map();
  for (const entry of manifest.sourceSupportObjects) {
    const bytes = readPrivateStable(root, entry.path, snapshots,
      entry, MAX_SELECTED_COMPRESSED_BYTES);
    if (entry.range !== null) verifyRangeChunkHashes(bytes, entry.range, "SOURCE_SUPPORT_RANGE");
    supportBytes.set(entry.path, bytes);
  }
  if (!same(recordProjection(parseJson(supportBytes.get("source-support/record-before.json"),
    "RECORD_BEFORE_JSON_INVALID")), manifest.recordBefore)
    || !same(recordProjection(parseJson(supportBytes.get("source-support/record-after.json"),
      "RECORD_AFTER_JSON_INVALID")), manifest.recordAfter)) {
    fail("SOURCE_RECORD_REPLAY_MISMATCH");
  }
  const preview = supportBytes.get("source-support/preview.html").toString("utf8");
  for (const marker of ["offset__x_-10mm__y_-10mm", "degree_x_0_y_0_z_0",
    "error_trajectory.mat", "correction_trajectory_1.mat"]) {
    if (!preview.includes(marker)) fail("SOURCE_PREVIEW_REPLAY_MISMATCH", marker);
  }
  const rawBytes = new Map();
  for (const selected of manifest.selectedObjects) {
    const bytes = readPrivateStable(root, selected.localPath, snapshots,
      { sizeBytes: selected.uncompressedSize, sha256: selected.rawMatSha256 });
    rawBytes.set(selected.localPath, bytes);
  }
  replayZipSupport(manifest, inventory, supportBytes, rawBytes);
  recheckSnapshots(snapshots);
  const rootObjects = [
    { path: "archive-inventory.json", sizeBytes: inventoryBytes.length,
      sha256: pihSha256(inventoryBytes) },
    ...manifest.sourceSupportObjects.map(({ path: objectPath, sizeBytes, sha256 }) =>
      ({ path: objectPath, sizeBytes, sha256 })),
    ...manifest.selectedObjects.map((entry) => ({ path: entry.localPath,
      sizeBytes: entry.uncompressedSize, sha256: entry.rawMatSha256 })),
  ].sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({ ok: true, verificationLevel: "FULL_BOUNDED_SOURCE_REPLAY",
    sourceDirectory: root, manifest, inventory,
    manifestFileSha256: pihSha256(manifestBytes),
    sourceRoot: pihDigest(rootObjects, `${PIH_SOURCE_SCHEMA}/source-root`) });
}

const MAT_EXTRACTOR = String.raw`
import gc
import hashlib
import io
import json
import os
import stat
import sys
from collections import Counter

import h5py
import numpy as np
import scipy
import scipy.io

request = json.load(sys.stdin)
root = os.path.realpath(request["root"])

def read_exact(relative, expected_size, expected_sha):
    target = os.path.realpath(os.path.join(root, *relative.split("/")))
    if os.path.commonpath([root, target]) != root:
        raise RuntimeError("PATH_ESCAPE")
    fd = os.open(target, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode) or stat.S_IMODE(before.st_mode) != 0o600:
            raise RuntimeError("FILE_UNSAFE")
        chunks = []
        while True:
            chunk = os.read(fd, 1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        after = os.fstat(fd)
        raw = b"".join(chunks)
        if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns,
            before.st_ctime_ns) != (after.st_dev, after.st_ino, after.st_size,
            after.st_mtime_ns, after.st_ctime_ns):
            raise RuntimeError("FILE_CHANGED")
        if len(raw) != expected_size or "sha256:" + hashlib.sha256(raw).hexdigest() != expected_sha:
            raise RuntimeError("FILE_BINDING_MISMATCH")
        return raw
    finally:
        os.close(fd)

def attr_text(value):
    if isinstance(value, bytes):
        return value.decode("utf8", "replace")
    if isinstance(value, np.ndarray):
        if value.size <= 8:
            return [attr_text(item) for item in value.reshape(-1).tolist()]
        return {"dtype": str(value.dtype), "shape": list(value.shape)}
    if isinstance(value, np.generic):
        return value.item()
    return str(value)

def modality_signals(name):
    lowered = name.lower()
    signals = []
    if any(token in lowered for token in ["pose", "position", "quaternion", "cartesian", "target"]):
        signals.append("POSE")
    if any(token in lowered for token in ["force", "torque", "wrench", "ft_"]):
        signals.append("FORCE_TORQUE")
    if any(token in lowered for token in ["rgb", "image", "color"]):
        signals.append("RGB")
    if any(token in lowered for token in ["pointcloud", "point_cloud", "pointcloud", "pcd"]):
        signals.append("POINT_CLOUD")
    return signals

def h5_description(h5, name, obj):
    base = {
        "name": name,
        "kind": "GROUP" if isinstance(obj, h5py.Group) else "DATASET",
        "matlabClass": attr_text(obj.attrs.get("MATLAB_class", "UNKNOWN")),
        "attributeNames": sorted(str(key) for key in obj.attrs.keys()),
        "modalitySignals": modality_signals(name),
    }
    if isinstance(obj, h5py.Group):
        base.update({"memberNames": sorted(str(key) for key in obj.keys()),
                     "axisLengths": None, "elementCount": None,
                     "referenceCount": None, "nonNullReferenceCount": None,
                     "referencedTargetKinds": {}, "referencedTargetShapes": {},
                     "dtype": None})
        return base
    is_reference = h5py.check_dtype(ref=obj.dtype) is not None
    base.update({"axisLengths": list(obj.shape), "elementCount": int(obj.size),
                 "dtype": str(obj.dtype), "referenceCount": None,
                 "nonNullReferenceCount": None, "referencedTargetKinds": {},
                 "referencedTargetShapes": {}})
    if is_reference:
        refs = obj[()].reshape(-1)
        kinds = Counter()
        shapes = Counter()
        valid = 0
        for ref in refs:
            if not ref:
                continue
            valid += 1
            target = h5[ref]
            kinds["GROUP" if isinstance(target, h5py.Group) else "DATASET"] += 1
            if isinstance(target, h5py.Dataset):
                shapes[f"{list(target.shape)}|{str(target.dtype)}"] += 1
            else:
                shapes[f"GROUP|{sorted(str(key) for key in target.keys())}"] += 1
        base["referenceCount"] = int(len(refs))
        base["nonNullReferenceCount"] = valid
        base["referencedTargetKinds"] = dict(sorted(kinds.items()))
        base["referencedTargetShapes"] = dict(sorted(shapes.items()))
    return base

def resolve_states(h5):
    matches = sorted(str(key) for key in h5.keys() if str(key).lower() == "states")
    if not matches:
        return None, None
    variable_name = matches[0]
    states = h5[variable_name]
    if isinstance(states, h5py.Dataset) and h5py.check_dtype(ref=states.dtype) is not None:
        refs = [ref for ref in states[()].reshape(-1) if ref]
        if len(refs) == 1:
            states = h5[refs[0]]
    return states, variable_name

def h5_inventory(h5):
    counts = Counter()
    signals = Counter()
    signatures = Counter()
    state_like_paths = []
    largest = []
    def visit(name, obj):
        kind = "GROUP" if isinstance(obj, h5py.Group) else "DATASET"
        counts[kind] += 1
        for signal in modality_signals(name):
            signals[signal] += 1
        if "state" in name.lower() and len(state_like_paths) < 256:
            state_like_paths.append(name)
        if isinstance(obj, h5py.Dataset):
            matlab_class = attr_text(obj.attrs.get("MATLAB_class", "UNKNOWN"))
            signature = json.dumps({"dtype": str(obj.dtype), "axisLengths": list(obj.shape),
                                    "matlabClass": matlab_class},
                                   separators=(",", ":"), sort_keys=True)
            signatures[signature] += 1
            largest.append((int(obj.size), name, list(obj.shape), str(obj.dtype), matlab_class))
    h5.visititems(visit)
    largest.sort(key=lambda item: (-item[0], item[1]))
    return {
        "objectCounts": dict(sorted(counts.items())),
        "modalityPathSignals": dict(sorted(signals.items())),
        "stateLikePaths": sorted(state_like_paths),
        "datasetSchemaSignatures": [
            {**json.loads(signature), "objectCount": count}
            for signature, count in sorted(signatures.items())
        ],
        "largestDatasets": [
            {"elementCount": size, "path": name, "axisLengths": shape,
             "dtype": dtype, "matlabClass": matlab_class}
            for size, name, shape, dtype, matlab_class in largest[:32]
        ],
        "allObjectMetadataAggregatedWithoutDroppingUnknownSchemas": True,
    }

def inspect_hdf5(raw):
    with h5py.File(io.BytesIO(raw), "r") as h5:
        top = sorted(str(key) for key in h5.keys())
        variables = [h5_description(h5, name, h5[name]) for name in top]
        states, states_variable_name = resolve_states(h5)
        members = []
        states_kind = None
        if states is not None:
            states_kind = "GROUP" if isinstance(states, h5py.Group) else "DATASET"
            if isinstance(states, h5py.Group):
                for name in sorted(states.keys()):
                    members.append(h5_description(h5, str(name), states[name]))
            else:
                members.append(h5_description(h5, "states", states))
        counts = Counter()
        for member in members:
            for signal in member["modalitySignals"]:
                counts[signal] += 1
        inventory = h5_inventory(h5)
        return {"format": "MATLAB_V7_3_HDF5", "topLevelKeys": top,
                "topLevelVariables": variables,
                "statesPresent": states is not None, "statesKind": states_kind,
                "statesVariableName": states_variable_name,
                "statesMembers": members,
                "modalityMemberSignals": dict(sorted(counts.items())),
                **inventory}

def scipy_description(name, value):
    array = np.asarray(value)
    fields = []
    if array.dtype.names:
        fields = sorted(array.dtype.names)
    elif array.dtype == object and array.size and hasattr(array.reshape(-1)[0], "_fieldnames"):
        fields = sorted(array.reshape(-1)[0]._fieldnames or [])
    return {"name": name, "kind": "SCIPY_ARRAY", "matlabClass": "UNKNOWN",
            "attributeNames": [], "modalitySignals": modality_signals(name),
            "memberNames": fields, "axisLengths": list(array.shape),
            "elementCount": int(array.size), "dtype": str(array.dtype),
            "referenceCount": int(array.size) if array.dtype == object else None,
            "nonNullReferenceCount": None, "referencedTargetKinds": {},
            "referencedTargetShapes": {}}

def inspect_v5(raw):
    loaded = scipy.io.loadmat(io.BytesIO(raw), struct_as_record=False,
                              squeeze_me=False)
    top = sorted(key for key in loaded if not key.startswith("__"))
    variables = [scipy_description(name, loaded[name]) for name in top]
    states_names = sorted(name for name in top if name.lower() == "states")
    states_name = states_names[0] if states_names else None
    states = loaded.get(states_name) if states_name else None
    members = []
    if states is not None:
        arr = np.asarray(states)
        if arr.dtype == object and arr.size and hasattr(arr.reshape(-1)[0], "_fieldnames"):
            obj = arr.reshape(-1)[0]
            for name in sorted(obj._fieldnames or []):
                members.append(scipy_description(name, getattr(obj, name)))
        elif arr.dtype.names:
            for name in sorted(arr.dtype.names):
                members.append(scipy_description(name, arr[name]))
        else:
            members.append(scipy_description("states", states))
    counts = Counter(signal for member in members for signal in member["modalitySignals"])
    object_counts = Counter(variable["kind"] for variable in variables)
    path_signals = Counter(signal for variable in variables
                           for signal in variable["modalitySignals"])
    signature_counts = Counter(json.dumps({"dtype": variable["dtype"],
                                            "axisLengths": variable["axisLengths"],
                                            "matlabClass": variable["matlabClass"]},
                                           separators=(",", ":"), sort_keys=True)
                               for variable in variables)
    return {"format": "MATLAB_LEVEL_5", "topLevelKeys": top,
            "topLevelVariables": variables,
            "statesPresent": states is not None,
            "statesKind": "SCIPY_ARRAY" if states is not None else None,
            "statesVariableName": states_name,
            "statesMembers": members,
            "modalityMemberSignals": dict(sorted(counts.items())),
            "objectCounts": dict(sorted(object_counts.items())),
            "modalityPathSignals": dict(sorted(path_signals.items())),
            "stateLikePaths": sorted(name for name in top if "state" in name.lower()),
            "datasetSchemaSignatures": [
                {**json.loads(signature), "objectCount": count}
                for signature, count in sorted(signature_counts.items())
            ],
            "largestDatasets": sorted([
                {"elementCount": variable["elementCount"], "path": variable["name"],
                 "axisLengths": variable["axisLengths"], "dtype": variable["dtype"],
                 "matlabClass": variable["matlabClass"]}
                for variable in variables
            ], key=lambda item: (-item["elementCount"], item["path"]))[:32],
            "allObjectMetadataAggregatedWithoutDroppingUnknownSchemas": True}

results = []
for item in request["objects"]:
    raw = read_exact(item["localPath"], item["sizeBytes"], item["sha256"])
    if b"MATLAB 7.3 MAT-file" in raw[:512] or raw[512:520] == b"\x89HDF\r\n\x1a\n":
        inspected = inspect_hdf5(raw)
    else:
        inspected = inspect_v5(raw)
    results.append({"role": item["role"], "localPath": item["localPath"],
                    "sizeBytes": item["sizeBytes"], "sha256": item["sha256"],
                    **inspected})
    del raw
    gc.collect()

json.dump({
    "parser": {"pythonVersion": sys.version.split()[0],
               "numpyVersion": np.__version__, "scipyVersion": scipy.__version__,
               "h5pyVersion": h5py.__version__},
    "objects": results,
}, sys.stdout, separators=(",", ":"), sort_keys=True)
`;

export function extractPihMatStructures(sourceDirectory, options = {}) {
  const before = verifyPihExceptionRecoverySourceDirectory(sourceDirectory);
  const pythonExecutable = options.pythonExecutable ?? "/opt/anaconda3/bin/python";
  if (typeof pythonExecutable !== "string" || pythonExecutable.length < 1) {
    fail("PYTHON_EXECUTABLE_INVALID");
  }
  const objects = before.manifest.selectedObjects.map((entry) => ({ role: entry.role,
    localPath: entry.localPath, sizeBytes: entry.uncompressedSize,
    sha256: entry.rawMatSha256 }));
  const child = spawnSync(pythonExecutable, ["-c", MAT_EXTRACTOR], {
    cwd: process.cwd(), input: JSON.stringify({ root: before.sourceDirectory, objects }),
    encoding: "utf8", timeout: MAT_TIMEOUT_MS, maxBuffer: MAX_MAT_OUTPUT_BYTES,
  });
  if (child.error || child.status !== 0 || child.signal !== null) {
    fail("MAT_EXTRACTOR_FAILED",
      child.error?.message ?? child.stderr?.trim() ?? `status=${child.status};signal=${child.signal}`);
  }
  let extracted;
  try { extracted = JSON.parse(child.stdout); }
  catch { fail("MAT_EXTRACTOR_OUTPUT_INVALID"); }
  const after = verifyPihExceptionRecoverySourceDirectory(sourceDirectory);
  if (before.manifestFileSha256 !== after.manifestFileSha256
    || before.sourceRoot !== after.sourceRoot) fail("SOURCE_CHANGED_AROUND_MAT_EXTRACTION");
  if (!exactObject(extracted) || !exactObject(extracted.parser)
    || !Array.isArray(extracted.objects) || extracted.objects.length !== 2
    || !same(extracted.objects.map((entry) => entry.role), ["CORRECTION", "ERROR"])) {
    fail("MAT_EXTRACT_INVALID");
  }
  for (const object of extracted.objects) {
    const expected = objects.find((entry) => entry.role === object.role);
    if (!expected || object.localPath !== expected.localPath
      || object.sizeBytes !== expected.sizeBytes || object.sha256 !== expected.sha256
      || !["MATLAB_V7_3_HDF5", "MATLAB_LEVEL_5"].includes(object.format)
      || typeof object.statesPresent !== "boolean" || !Array.isArray(object.statesMembers)
      || !Array.isArray(object.topLevelKeys) || object.topLevelKeys.length < 1
      || !Array.isArray(object.topLevelVariables) || object.topLevelVariables.length < 1
      || !exactObject(object.objectCounts) || !exactObject(object.modalityMemberSignals)
      || !exactObject(object.modalityPathSignals)
      || !Array.isArray(object.datasetSchemaSignatures)
      || object.allObjectMetadataAggregatedWithoutDroppingUnknownSchemas !== true) {
      fail("MAT_EXTRACT_OBJECT_INVALID", object?.role);
    }
  }
  return Object.freeze({ ...extracted,
    parser: { ...extracted.parser,
      helperSha256: pihSha256(Buffer.from(MAT_EXTRACTOR, "utf8")),
      timeoutMs: MAT_TIMEOUT_MS, maxOutputBytes: MAX_MAT_OUTPUT_BYTES },
    sourceVerification: { manifestFileSha256: before.manifestFileSha256,
      sourceRoot: before.sourceRoot, verificationLevel: before.verificationLevel } });
}

function segmentZero(kind) {
  return { sourceNativeCount: 0, sourceNativeAttribution: `NOT_A_${kind}_EPISODE_SOURCE`,
    independentCount: 0, independentAttribution: "NO_INDEPENDENT_WITNESS",
    crossAttributionAdditionPermitted: false, additiveTotal: null };
}

export function buildPihExceptionRecoveryReportFromExtracted(sourceVerification, extracted) {
  if (sourceVerification?.ok !== true
    || sourceVerification.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY"
    || extracted?.sourceVerification?.sourceRoot !== sourceVerification.sourceRoot
    || extracted?.sourceVerification?.manifestFileSha256
      !== sourceVerification.manifestFileSha256) fail("BUILD_INPUT_INVALID");
  const manifest = sourceVerification.manifest;
  const inventory = sourceVerification.inventory;
  const error = extracted.objects.find((entry) => entry.role === "ERROR");
  const correction = extracted.objects.find((entry) => entry.role === "CORRECTION");
  const selectedBytes = manifest.selection.selectedUncompressedBytes;
  const body = {
    schema: PIH_REPORT_SCHEMA,
    dataset: {
      recordId: PIH_RECORD_ID,
      doi: PIH_DOI,
      title: manifest.recordBefore.title,
      publisher: "Zenodo",
      sourceClass: "HISTORICAL_REAL_ROBOT_EXCEPTION_AND_HUMAN_CORRECTION_DATA",
      robotPlatformPublisherClaim: "Franka Emika Research 3",
      forceTorqueSensorPublisherClaim: "ATI Nano25",
      rgbdCameraPublisherClaim: "Intel RealSense D435",
      taskPublisherClaim: "Cranfield peg-in-hole benchmark",
    },
    source: {
      manifestHash: manifest.manifestHash,
      manifestFileSha256: sourceVerification.manifestFileSha256,
      sourceRoot: sourceVerification.sourceRoot,
      recordApiBracketed: true,
      recordStableDuringAcquisition: true,
      officialPreviewBytePinned: true,
      strictHttpRangeEstablished: true,
      completeCentralDirectoryEnumerated: true,
      fullArchiveDownloaded: false,
      publisherArchiveMd5Claim: PIH_ARCHIVE_MD5,
      fullArchiveMd5Recomputed: false,
      remoteTransportAttested: false,
    },
    denominators: {
      archiveInventory: {
        class: "ZIP_CENTRAL_DIRECTORY_ARCHIVE_ENTRY",
        unit: "ZIP_CENTRAL_DIRECTORY_ENTRY",
        units: inventory.counts.centralDirectoryEntries,
        fileEntries: inventory.counts.fileEntries,
        directoryEntries: inventory.counts.directoryEntries,
        errorTrajectoryEntries: inventory.counts.errorTrajectoryEntries,
        correctionTrajectoryEntries: inventory.counts.correctionTrajectoryEntries,
        completeArchiveByteCensusEstablished: false,
      },
      boundedPair: {
        class: "ERROR_AND_HUMAN_CORRECTION_MORPHOLOGY_PAIR",
        unit: "LEXICALLY_CONDITION_MATCHED_ERROR_CORRECTION_MORPHOLOGY_PAIR",
        units: 1,
        components: 2,
        selectedUncompressedBytes: selectedBytes,
        errorComponents: 1,
        correctionComponents: 1,
        executedRecoveryChainEstablished: false,
      },
      crossDenominatorAdditionPermitted: false,
      crossTotal: null,
      realityEpisodeRecords: 0,
      successfulCorrectionEpisodes: 0,
      independentOutcomeEpisodes: 0,
    },
    boundedPair: {
      condition: { positionalOffsetMillimeters: { x: -10, y: -10 },
        orientationOffsetDegrees: { x: 0, y: 0, z: 0 } },
      conditionAttribution: "EXACT_ARCHIVE_PATH_LEXICAL_ENCODING",
      error: { internalPath: PIH_ERROR_INTERNAL_PATH,
        sourceNativeRole: "TRAJECTORY_THAT_LED_TO_OCCURRENCE_OF_ERROR",
        correctionSuccessClaim: false, mat: error },
      correction: { internalPath: PIH_CORRECTION_INTERNAL_PATH,
        sourceNativeRole: "HUMAN_DEMONSTRATED_POSSIBLE_CORRECTION_STRATEGY_1",
        correctionSuccessClaim: false, mat: correction },
      sameConditionEstablished: true,
      sameExecutionAttemptEstablished: false,
      temporalContinuationEstablished: false,
      correctionExecutedAfterSelectedErrorEstablished: false,
      correctionSuccessEstablished: false,
      independentOutcomeEstablished: false,
      causalRecoveryEffectEstablished: false,
    },
    modalities: {
      publisherDescription: {
        referenceAndMeasuredTargetPose: { samplingHzClaim: 100 },
        rawAndRobotWristForceTorque: { samplingHzClaim: 100 },
        rgbImageSequence: { samplingHzClaim: 10 },
        pointCloudSequence: { samplingHzClaim: 10 },
      },
      parser: extracted.parser,
      observedMatTopology: {
        error: {
          format: error.format,
          topLevelKeys: error.topLevelKeys,
          statesPresent: error.statesPresent,
          statesVariableName: error.statesVariableName,
          objectCounts: error.objectCounts,
          modalityPathSignals: error.modalityPathSignals,
        },
        correction: {
          format: correction.format,
          topLevelKeys: correction.topLevelKeys,
          statesPresent: correction.statesPresent,
          statesVariableName: correction.statesVariableName,
          objectCounts: correction.objectCounts,
          modalityPathSignals: correction.modalityPathSignals,
        },
        errorCorrectionSchemaIsomorphismRequired: false,
        publisherStatesStructureClaimTreatedAsClaimNotParserPrecondition: true,
        exactVariableNamesDtypesShapesAndUnknownSchemasRetainedInBoundedPair: true,
      },
      sampleCountsAuthority:
        "MAT_AXIS_LENGTHS_AND_REFERENCE_COUNTS_ONLY_NO_UNDECLARED_TIME_AXIS_INFERENCE",
      crossModalitySynchronizationVerified: false,
    },
    segments: {
      opportunityCensus: segmentZero("OPPORTUNITY_CENSUS"),
      delegationAuthorization: segmentZero("DELEGATION_AUTHORIZATION"),
      actionTrace: segmentZero("GOVERNED_ACTION_TRACE"),
      effect: segmentZero("INDEPENDENT_EFFECT"),
      outcome: segmentZero("INDEPENDENT_OUTCOME"),
      recovery: segmentZero("VERIFIED_RECOVERY"),
      longitudinal: segmentZero("LONGITUDINAL_OUTCOME"),
    },
    completeness: {
      completeZipCentralDirectoryInventory: true,
      completeArchiveBytesDownloaded: false,
      completeAttemptCensusEstablished: false,
      completeConditionTrajectoryBytesDownloaded: false,
      selectedConditionCorrectionCandidatesInArchive:
        inventory.entries.filter((entry) => entry.path.startsWith(`${CONDITION}/`)
          && /\/Correction_Trajectory\/correction_trajectory_\d+\.mat$/u.test(entry.path)).length,
      selectedCorrectionOrdinal: 1,
      outcomeBlindPairSelection: true,
    },
    license: {
      status: "ZENODO_RECORD_CC_BY_4_0_PUBLISHER_CLAIM_PINNED",
      publisherClaim: PIH_LICENSE,
      legalConclusionEstablished: false,
      rawDatasetRedistributionAuthorizedByOutsider: false,
      productionTrainingAuthorizedByOutsider: false,
      expandedUseRequiresIndependentReview: true,
    },
    privacy: {
      rawMatFilesRetainedLocally: true,
      rgbAndPointCloudMayContainSceneInformation: true,
      humanDemonstrationSource: true,
      noPiiGuaranteed: false,
      rawMatricesProjectedToNetwork: false,
      derivedImagesProjectedToNetwork: false,
      derivedPointCloudsProjectedToNetwork: false,
    },
    useBoundary: {
      status: "OFFLINE_ERROR_CORRECTION_MORPHOLOGY_ANALYSIS_ONLY",
      offlineMorphologyAnalysis: true,
      trainingPerformed: false,
      trainingAuthorizedByArtifact: false,
      automaticTraining: false,
      modelPromotion: false,
      robotControllerDerived: false,
      actionDispatched: false,
    },
    network: {
      admitted: false,
      projected: false,
      published: false,
      networkAdmissionRows: 0,
      networkProjectionRows: 0,
      authorityDelta: 0,
    },
    economics: { CEU: 0, pricingUnits: 0, underwritingUnits: 0,
      guaranteeUnits: 0, settlementUnits: 0, economicAuthorityDelta: 0 },
    authority: {
      mode: "HISTORICAL_OFFLINE_MORPHOLOGY_OBSERVATION_ONLY",
      recordAndCentralDirectoryPinned: true,
      selectedZipEntriesCrcVerified: true,
      exactSelectedMatBytesReplayed: true,
      fullArchiveAuthenticatedByRecomputedMd5: false,
      publisherIdentityCryptographicallyVerified: false,
      opportunityAuthorityEstablished: false,
      delegationAuthorityEstablished: false,
      executionAuthorityEstablished: false,
      physicalSafetyEstablished: false,
      correctionSuccessEstablished: false,
      outcomeTruthEstablished: false,
      trainingAuthorityEstablished: false,
      networkAuthorityEstablished: false,
      pricingAuthorityEstablished: false,
      CEUAuthorityEstablished: false,
      authorityDelta: 0,
    },
  };
  return Object.freeze({ ...body,
    artifactHash: pihDigest(body, `${PIH_REPORT_SCHEMA}/artifact`) });
}

export function buildPihExceptionRecoveryReportFromSource(sourceDirectory, options = {}) {
  const source = verifyPihExceptionRecoverySourceDirectory(sourceDirectory);
  const extracted = extractPihMatStructures(sourceDirectory, options);
  return buildPihExceptionRecoveryReportFromExtracted(source, extracted);
}

export function verifyPihExceptionRecoveryReport(report) {
  try {
    if (!exactObject(report)) fail("REPORT_INVALID");
    const { artifactHash, ...body } = report;
    if (report.schema !== PIH_REPORT_SCHEMA
      || artifactHash !== pihDigest(body, `${PIH_REPORT_SCHEMA}/artifact`)
      || report.dataset?.recordId !== PIH_RECORD_ID || report.dataset?.doi !== PIH_DOI
      || report.source?.fullArchiveDownloaded !== false
      || report.source?.fullArchiveMd5Recomputed !== false
      || report.denominators?.archiveInventory?.units < 1
      || report.denominators?.boundedPair?.class
        !== "ERROR_AND_HUMAN_CORRECTION_MORPHOLOGY_PAIR"
      || report.denominators?.boundedPair?.units !== 1
      || report.denominators?.crossDenominatorAdditionPermitted !== false
      || report.denominators?.crossTotal !== null
      || report.denominators?.realityEpisodeRecords !== 0
      || report.denominators?.successfulCorrectionEpisodes !== 0
      || report.denominators?.independentOutcomeEpisodes !== 0
      || report.boundedPair?.correctionSuccessEstablished !== false
      || report.boundedPair?.independentOutcomeEstablished !== false
      || report.boundedPair?.causalRecoveryEffectEstablished !== false
      || report.completeness?.completeAttemptCensusEstablished !== false
      || report.privacy?.noPiiGuaranteed !== false
      || report.useBoundary?.trainingPerformed !== false
      || report.useBoundary?.trainingAuthorizedByArtifact !== false
      || report.useBoundary?.actionDispatched !== false
      || report.network?.admitted !== false || report.network?.projected !== false
      || report.network?.networkAdmissionRows !== 0
      || report.network?.networkProjectionRows !== 0
      || Object.values(report.economics ?? {}).some((value) => value !== 0)
      || report.authority?.opportunityAuthorityEstablished !== false
      || report.authority?.delegationAuthorityEstablished !== false
      || report.authority?.executionAuthorityEstablished !== false
      || report.authority?.physicalSafetyEstablished !== false
      || report.authority?.correctionSuccessEstablished !== false
      || report.authority?.outcomeTruthEstablished !== false
      || report.authority?.trainingAuthorityEstablished !== false
      || report.authority?.networkAuthorityEstablished !== false
      || report.authority?.pricingAuthorityEstablished !== false
      || report.authority?.CEUAuthorityEstablished !== false
      || report.authority?.authorityDelta !== 0
      || !exactKeys(report.segments, ["opportunityCensus", "delegationAuthorization",
        "actionTrace", "effect", "outcome", "recovery", "longitudinal"])) {
      fail("REPORT_BOUNDARY_INVALID");
    }
    for (const segment of Object.values(report.segments)) {
      if (segment.sourceNativeCount !== 0 || segment.independentCount !== 0
        || segment.crossAttributionAdditionPermitted !== false
        || segment.additiveTotal !== null) fail("REPORT_SEGMENT_INVALID");
    }
    return Object.freeze({ ok: true,
      verificationLevel: "SELF_SEALED_BOUNDARY_ONLY",
      sourceAuthenticated: false, sourceCountsAuthenticated: false,
      correctionSuccessEstablished: false, authorityEstablished: false,
      artifactHash });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function verifyPihExceptionRecoveryReportWithSource(report, sourceDirectory,
  options = {}) {
  try {
    const standalone = verifyPihExceptionRecoveryReport(report);
    if (!standalone.ok) fail("FULL_REPLAY_STANDALONE_INVALID", standalone.error);
    const source = verifyPihExceptionRecoverySourceDirectory(sourceDirectory);
    if (report.source?.sourceRoot !== source.sourceRoot
      || report.source?.manifestFileSha256 !== source.manifestFileSha256
      || report.source?.manifestHash !== source.manifest.manifestHash) {
      fail("FULL_REPLAY_SOURCE_IDENTITY_MISMATCH");
    }
    const rebuilt = buildPihExceptionRecoveryReportFromSource(sourceDirectory, options);
    if (!same(rebuilt, report)) fail("FULL_REPLAY_REPORT_MISMATCH");
    return Object.freeze({ ok: true, verificationLevel: "FULL_BOUNDED_SOURCE_REDERIVED",
      archiveInventoryEntries: rebuilt.denominators.archiveInventory.units,
      morphologyPairs: 1, correctionSuccessEstablished: false,
      independentOutcomeEstablished: false, authorityEstablished: false,
      trainingAuthorized: false, networkAdmission: false });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function buildPihExceptionRecoveryReceipt(report, reportBytes) {
  const checked = verifyPihExceptionRecoveryReport(report);
  if (!checked.ok || !Buffer.isBuffer(reportBytes)
    || !reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_REPORT_INVALID");
  const body = {
    schema: PIH_RECEIPT_SCHEMA,
    recordId: PIH_RECORD_ID,
    doi: PIH_DOI,
    reportHash: report.artifactHash,
    reportFileSha256: pihSha256(reportBytes),
    sourceManifestHash: report.source.manifestHash,
    sourceManifestFileSha256: report.source.manifestFileSha256,
    sourceRoot: report.source.sourceRoot,
    archiveInventoryEntries: report.denominators.archiveInventory.units,
    morphologyPairs: 1,
    selectedMatObjects: 2,
    selectedUncompressedBytes: report.denominators.boundedPair.selectedUncompressedBytes,
    completionMarker: true,
    status: "OFFLINE_ERROR_CORRECTION_MORPHOLOGY_ANALYSIS_ONLY",
    successfulCorrectionEpisodes: 0,
    independentOutcomeEpisodes: 0,
    trainingRows: 0,
    networkAdmissionRows: 0,
    networkProjectionRows: 0,
    CEU: 0,
    pricingUnits: 0,
    authorityUnits: 0,
  };
  return Object.freeze({ ...body,
    receiptHash: pihDigest(body, `${PIH_RECEIPT_SCHEMA}/receipt`) });
}

export function verifyPihExceptionRecoveryReceipt(receipt, report, reportBytes) {
  try {
    const expected = buildPihExceptionRecoveryReceipt(report, reportBytes);
    if (!same(expected, receipt)) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true, receiptHash: receipt.receiptHash });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function publishPihExceptionRecoveryArtifactDirectory(stagingDirectory,
  targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (staging === target || path.dirname(staging) !== path.dirname(target)) {
    fail("PUBLISH_DIRECTORIES_NOT_SIBLINGS");
  }
  const before = lstatSync(staging, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()
    || Number(before.mode & 0o777n) !== 0o700
    || !same(sorted(readdirSync(staging)), ["report.json", "run-receipt.json", "source"])) {
    fail("PUBLISH_STAGING_UNSAFE");
  }
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("PUBLISH_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "source"), path.join(target, "source"));
    renameSync(path.join(staging, "report.json"), path.join(target, "report.json"));
    renameSync(path.join(staging, "run-receipt.json"),
      path.join(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch { fail("PUBLISH_TARGET_INCOMPLETE", target); }
  return target;
}

export function verifyPihExceptionRecoveryArtifactDirectory(artifactDirectory, options = {}) {
  try {
    const root = path.resolve(artifactDirectory);
    const snapshots = [];
    requireDirectory(root, ["report.json", "run-receipt.json", "source"], snapshots);
    const reportBytes = readPrivateStable(root, "report.json", snapshots,
      null, MAX_MAT_OUTPUT_BYTES);
    const receiptBytes = readPrivateStable(root, "run-receipt.json", snapshots,
      null, 2 * 1024 * 1024);
    const report = parseJson(reportBytes, "REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "RECEIPT_JSON_INVALID");
    const replay = verifyPihExceptionRecoveryReportWithSource(report,
      path.join(root, "source"), options);
    const receiptCheck = verifyPihExceptionRecoveryReceipt(receipt, report, reportBytes);
    if (!replay.ok || !receiptCheck.ok || receipt.completionMarker !== true) {
      fail("ARTIFACT_DIRECTORY_REPLAY_FAILED", replay.error ?? receiptCheck.error);
    }
    recheckSnapshots(snapshots);
    return Object.freeze({ ...replay, artifactHash: report.artifactHash,
      receiptHash: receipt.receiptHash, reportFileSha256: receipt.reportFileSha256 });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export const PIH_EXCEPTION_RECOVERY_CONSTANTS = Object.freeze({
  recordUrl: RECORD_URL,
  previewUrl: PREVIEW_URL,
  contentUrl: CONTENT_URL,
  conditionInternalPrefix: CONDITION,
  readmeInternalPath: README_INTERNAL_PATH,
  matExtractorSha256: pihSha256(Buffer.from(MAT_EXTRACTOR, "utf8")),
});
