/*
 * Bounded University of Michigan Digit hardware-fault telemetry intake.
 *
 * Only the nine non-rosbag NPY members of real/trial_1.zip are acquired by
 * strict HTTP Range.  The publisher's numeric label zero is preserved as an
 * uninterpreted label: neither the pinned loader, README, nor dataset card
 * defines zero as safe, unsafe, fall, or non-fall.  This historical telemetry
 * creates no delegation, outcome, recovery, training, network, or execution
 * authority.
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

export const DIGIT_DATASET_ID = "Gokul97/digit_fall_prediction_dataset";
export const DIGIT_DATASET_REVISION = "79c674c00475403e00338d167aa23169f0a24ba0";
export const DIGIT_REPOSITORY = "UMich-BipedLab/Digit_Fall_Prediction_Dataset";
export const DIGIT_REPOSITORY_COMMIT = "08e639e850a98799b3b5b32c686b3bf179883b1b";
export const DIGIT_REPOSITORY_TREE = "9b6d98d269a78fe723457bf1d6e9f97561754ce6";
export const DIGIT_ARCHIVE_PATH = "real/trial_1.zip";
export const DIGIT_ARCHIVE_BYTES = 155_940_207;
export const DIGIT_ARCHIVE_LFS_SHA256 =
  "sha256:60a1e18b554d87107996a4c212f5dbf2e5868ad65711609b8d08c04cf0fd0eef";
export const DIGIT_ARCHIVE_GIT_OID = "2b4aa7f465b01d6d927fce35f49057769cfdc59b";
export const DIGIT_ARCHIVE_XET_HASH =
  "efb127727277c6efeafc2bde12d5849257f1e5646202aa57a7fe452276980858";
export const DIGIT_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const DIGIT_SOURCE_SCHEMA = "outsider/digit-hardware-fault-pinned-source/v1";
export const DIGIT_INVENTORY_SCHEMA = "outsider/digit-trial1-zip-inventory/v1";
export const DIGIT_REPORT_SCHEMA = "outsider/digit-hardware-fault-eval/v1";
export const DIGIT_RECEIPT_SCHEMA = "outsider/digit-hardware-fault-run-receipt/v1";

const HF_ORIGIN = "https://huggingface.co";
const HF_API = `${HF_ORIGIN}/api/datasets/${DIGIT_DATASET_ID}`;
const HF_RECORD_URL = `${HF_API}/revision/${DIGIT_DATASET_REVISION}`;
const HF_TREE_PATH = `/api/datasets/${DIGIT_DATASET_ID}/tree/${DIGIT_DATASET_REVISION}`;
const HF_TREE_URL = `${HF_ORIGIN}${HF_TREE_PATH}?recursive=true&expand=true`;
const HF_ARCHIVE_URL = `${HF_ORIGIN}/datasets/${DIGIT_DATASET_ID}/resolve/${
  DIGIT_DATASET_REVISION}/${DIGIT_ARCHIVE_PATH}`;
const GH_API = `https://api.github.com/repos/${DIGIT_REPOSITORY}`;
const GH_COMMIT_URL = `${GH_API}/commits/${DIGIT_REPOSITORY_COMMIT}`;
const GH_TREE_URL = `${GH_API}/git/trees/${DIGIT_REPOSITORY_TREE}?recursive=1`;
const GH_RAW_ROOT = `https://raw.githubusercontent.com/${DIGIT_REPOSITORY}/${
  DIGIT_REPOSITORY_COMMIT}`;
const ARCHIVE_CENTRAL_OFFSET = 155_939_052;
const ARCHIVE_CENTRAL_BYTES = 1_133;
const ARCHIVE_EOCD_OFFSET = 155_940_185;
const ARCHIVE_EOCD_BYTES = 22;
const RANGE_CHUNK_BYTES = 2 * 1024 * 1024;
const RANGE_CONCURRENCY = 4;
const RANGE_ATTEMPTS = 3;
const FETCH_TIMEOUT_MS = 180_000;
const EXTRACTOR_TIMEOUT_MS = 300_000;
const MAX_EXTRACTOR_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_API_BYTES = 16 * 1024 * 1024;
const MAX_SELECTED_COMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_SELECTED_RAW_BYTES = 128 * 1024 * 1024;
const ZIP_LOCAL = 0x04034b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_EOCD = 0x06054b50;
const ZIP_DESCRIPTOR = 0x08074b50;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const BARE_SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ARCHIVE_PATH = /^[A-Za-z0-9._/-]+$/u;
const ALLOWED_HF_REDIRECT = /^(?:[a-z0-9-]+\.)*hf\.co$/iu;
const SELECTED_BASENAMES = Object.freeze([
  "digit_angular_momentum.npy",
  "digit_command_torque.npy",
  "digit_motor_torque_measured.npy",
  "digit_positions.npy",
  "digit_q.npy",
  "digit_qdot.npy",
  "digit_time.npy",
  "digit_velocity.npy",
  "real_labels.npy",
]);
const CODE_SUPPORT_PATHS = Object.freeze([
  "LICENSE.md", "README.md", "utils/dataset.py",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `DIGIT_HARDWARE_FAULT_${code}`
    : `DIGIT_HARDWARE_FAULT_${code}:${detail}`);
}

export function digitSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function digitDigest(value, domain = DIGIT_REPORT_SCHEMA) {
  return digitSha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
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

function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function checkedUrl(value, kind) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username !== "" || url.password !== "") {
    fail("URL_UNSAFE", value);
  }
  if (kind === "HF_INITIAL" && url.origin !== HF_ORIGIN) fail("HF_URL_UNSAFE", value);
  if (kind === "HF_REDIRECT" && !ALLOWED_HF_REDIRECT.test(url.hostname)) {
    fail("HF_REDIRECT_UNSAFE", url.hostname);
  }
  if (kind === "GH_API" && url.hostname !== "api.github.com") fail("GH_URL_UNSAFE", value);
  if (kind === "GH_RAW" && url.hostname !== "raw.githubusercontent.com") {
    fail("GH_RAW_URL_UNSAFE", value);
  }
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
  const reader = response.body.getReader();
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
      "user-agent": "outsider-digit-hardware-fault/1.0" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (response.status !== 200 || response.headers.get("content-encoding") !== null
    || new URL(response.url || url).hostname !== url.hostname) {
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

function normalizeQuoted(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.startsWith('"') && trimmed.endsWith('"')
    ? trimmed.slice(1, -1) : trimmed;
}

function rangeRetryDelay(attempt) {
  return Math.min(4_000, 500 * (2 ** attempt));
}

function waitMilliseconds(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function strictRangePart(start, end, fetchImpl) {
  const expected = end - start + 1;
  let lastError = null;
  for (let attempt = 0; attempt < RANGE_ATTEMPTS; attempt += 1) {
    let initial;
    let final;
    try {
      const initialUrl = checkedUrl(HF_ARCHIVE_URL, "HF_INITIAL");
      initial = await fetchImpl(initialUrl, {
        redirect: "manual",
        headers: { "accept-encoding": "identity", range: `bytes=${start}-${end}`,
          "user-agent": "outsider-digit-hardware-fault/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const location = initial.headers.get("location");
      const commit = initial.headers.get("x-repo-commit");
      const linkedSize = initial.headers.get("x-linked-size");
      const linkedEtag = normalizeQuoted(initial.headers.get("x-linked-etag"));
      const xetHash = initial.headers.get("x-xet-hash");
      if (initial.status !== 302 || !location || commit !== DIGIT_DATASET_REVISION
        || linkedSize !== String(DIGIT_ARCHIVE_BYTES)
        || linkedEtag !== DIGIT_ARCHIVE_LFS_SHA256.slice(7)
        || xetHash !== DIGIT_ARCHIVE_XET_HASH) {
        fail("RANGE_REDIRECT_BINDING_INVALID", `${initial.status}:${start}-${end}`);
      }
      if (initial.body) await initial.body.cancel("validated redirect without body");
      const finalUrl = checkedUrl(new URL(location, initialUrl).toString(), "HF_REDIRECT");
      final = await fetchImpl(finalUrl, {
        redirect: "error",
        headers: { "accept-encoding": "identity", range: `bytes=${start}-${end}`,
          "user-agent": "outsider-digit-hardware-fault/1.0" },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const contentRange = final.headers.get("content-range");
      const finalHost = new URL(final.url || finalUrl).hostname;
      if (final.status !== 206
        || contentRange !== `bytes ${start}-${end}/${DIGIT_ARCHIVE_BYTES}`
        || final.headers.get("accept-ranges") !== "bytes"
        || final.headers.get("content-encoding") !== null
        || !ALLOWED_HF_REDIRECT.test(finalHost)) {
        fail("STRICT_RANGE_UNSUPPORTED", `${final.status}:${contentRange}`);
      }
      const bytes = await streamResponse(final, expected, expected);
      return { bytes, start, end, contentRange, sizeBytes: bytes.length,
        sha256: digitSha256(bytes), initialStatus: 302,
        repositoryCommit: commit, linkedSizeBytes: Number(linkedSize),
        linkedEtag: `sha256:${linkedEtag}`, xetHash, finalHost };
    } catch (error) {
      if (safeError(error).startsWith("DIGIT_HARDWARE_FAULT_RANGE_REDIRECT_")
        || safeError(error).startsWith("DIGIT_HARDWARE_FAULT_STRICT_RANGE_")) throw error;
      lastError = safeError(error);
      if (attempt === RANGE_ATTEMPTS - 1) {
        fail("RANGE_FETCH_FAILED", `${start}-${end}:${lastError}`);
      }
      try { if (initial?.body) await initial.body.cancel("retry"); } catch { /* no-op */ }
      try { if (final?.body) await final.body.cancel("retry"); } catch { /* no-op */ }
      await waitMilliseconds(rangeRetryDelay(attempt));
    }
  }
  fail("RANGE_FETCH_FAILED", `${start}-${end}:${lastError}`);
}

async function strictRangeFetch(start, end, maximumBytes, fetchImpl) {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0
    || end < start || end >= DIGIT_ARCHIVE_BYTES
    || end - start + 1 > maximumBytes) fail("RANGE_INVALID", `${start}-${end}`);
  const plan = [];
  for (let cursor = start; cursor <= end;) {
    const chunkEnd = Math.min(end, cursor + RANGE_CHUNK_BYTES - 1);
    plan.push({ start: cursor, end: chunkEnd });
    cursor = chunkEnd + 1;
  }
  const results = new Array(plan.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(RANGE_CONCURRENCY, plan.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= plan.length) return;
      results[index] = await strictRangePart(plan[index].start, plan[index].end, fetchImpl);
    }
  });
  const settled = await Promise.allSettled(workers);
  const rejected = settled.find((item) => item.status === "rejected");
  if (rejected) throw rejected.reason;
  const bytes = Buffer.concat(results.map((item) => item.bytes), end - start + 1);
  return { bytes, start, end,
    contentRange: results.length === 1 ? results[0].contentRange : "STRICT_206_CHUNK_SET",
    chunks: results.map(({ bytes: ignored, ...item }) => item),
    sha256: digitSha256(bytes) };
}

function safeArchiveName(value) {
  if (typeof value !== "string" || value.length < 1 || value.startsWith("/")
    || value.includes("\\") || !SAFE_ARCHIVE_PATH.test(value)
    || value.split("/").some((part, index, pieces) => part === "." || part === ".."
      || part === "" && index !== pieces.length - 1)) fail("ZIP_PATH_UNSAFE", value);
  return value;
}

export function parseDigitCentralDirectory(bytes, expectedEntries = 11) {
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
    const compressedSize = bytes.readUInt32LE(offset + 20);
    const uncompressedSize = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28);
    const extraLength = bytes.readUInt16LE(offset + 30);
    const commentLength = bytes.readUInt16LE(offset + 32);
    const diskStart = bytes.readUInt16LE(offset + 34);
    const localHeaderOffset = bytes.readUInt32LE(offset + 42);
    const finish = offset + 46 + nameLength + extraLength + commentLength;
    if (finish > bytes.length || diskStart !== 0 || ![0, 8].includes(compressionMethod)) {
      fail("CENTRAL_ENTRY_INVALID", String(offset));
    }
    const name = safeArchiveName(bytes.subarray(offset + 46,
      offset + 46 + nameLength).toString("utf8"));
    entries.push({ path: name, directory: name.endsWith("/"), flags,
      compressionMethod, crc32, compressedSize, uncompressedSize,
      localHeaderOffset, centralHeaderOffset: offset,
      centralHeaderBytes: finish - offset });
    offset = finish;
  }
  if (entries.length !== expectedEntries
    || new Set(entries.map((entry) => entry.path)).size !== entries.length) {
    fail("CENTRAL_COUNT_OR_DUPLICATE_INVALID", String(entries.length));
  }
  return entries;
}

function parseEocd(bytes, absoluteStart) {
  if (bytes.length < ARCHIVE_EOCD_BYTES) fail("EOCD_TRUNCATED");
  const offset = bytes.length - ARCHIVE_EOCD_BYTES;
  if (bytes.readUInt32LE(offset) !== ZIP_EOCD
    || bytes.readUInt16LE(offset + 4) !== 0 || bytes.readUInt16LE(offset + 6) !== 0
    || bytes.readUInt16LE(offset + 8) !== 11 || bytes.readUInt16LE(offset + 10) !== 11
    || bytes.readUInt32LE(offset + 12) !== ARCHIVE_CENTRAL_BYTES
    || bytes.readUInt32LE(offset + 16) !== ARCHIVE_CENTRAL_OFFSET
    || bytes.readUInt16LE(offset + 20) !== 0
    || absoluteStart + offset !== ARCHIVE_EOCD_OFFSET) fail("EOCD_GEOMETRY_INVALID");
  return { offset: absoluteStart + offset, centralDirectoryOffset: ARCHIVE_CENTRAL_OFFSET,
    centralDirectoryBytes: ARCHIVE_CENTRAL_BYTES, centralDirectoryEntries: 11,
    commentBytes: 0, zip64: false };
}

function inventoryFromTail(tail) {
  const eocd = parseEocd(tail, ARCHIVE_CENTRAL_OFFSET);
  const centralBytes = tail.subarray(0, ARCHIVE_CENTRAL_BYTES);
  const entries = parseDigitCentralDirectory(centralBytes, 11);
  const files = entries.filter((entry) => !entry.directory);
  const directories = entries.filter((entry) => entry.directory);
  const selectedPaths = SELECTED_BASENAMES.map((name) => `trial_1/${name}`);
  const selected = files.filter((entry) => selectedPaths.includes(entry.path));
  const excluded = files.filter((entry) => !selectedPaths.includes(entry.path));
  if (directories.length !== 1 || directories[0].path !== "trial_1/"
    || files.length !== 10 || selected.length !== 9 || excluded.length !== 1
    || excluded[0].path !== "trial_1/rosbag_data.npy"
    || selected.some((entry) => entry.flags !== 8 || entry.compressionMethod !== 8)) {
    fail("ARCHIVE_PROFILE_CHANGED");
  }
  const body = { schema: DIGIT_INVENTORY_SCHEMA, archivePath: DIGIT_ARCHIVE_PATH,
    archiveBytes: DIGIT_ARCHIVE_BYTES, archiveLfsSha256: DIGIT_ARCHIVE_LFS_SHA256,
    completeCentralDirectoryEnumerated: true,
    zip: { ...eocd, centralDirectorySha256: digitSha256(centralBytes) },
    counts: { centralDirectoryEntries: entries.length, fileEntries: files.length,
      directoryEntries: directories.length, selectedNoRosbagEntries: selected.length,
      excludedRosbagEntries: excluded.length }, entries };
  return { ...body,
    inventoryHash: digitDigest(body, `${DIGIT_INVENTORY_SCHEMA}/inventory`) };
}

function parseLocalPrefix(prefix, entry) {
  if (prefix.length < 30 || prefix.readUInt32LE(0) !== ZIP_LOCAL) {
    fail("LOCAL_HEADER_INVALID", entry.path);
  }
  const flags = prefix.readUInt16LE(6);
  const method = prefix.readUInt16LE(8);
  const nameLength = prefix.readUInt16LE(26);
  const extraLength = prefix.readUInt16LE(28);
  const headerBytes = 30 + nameLength + extraLength;
  if (prefix.length < headerBytes || flags !== entry.flags || method !== entry.compressionMethod
    || prefix.subarray(30, 30 + nameLength).toString("utf8") !== entry.path) {
    fail("LOCAL_CENTRAL_MISMATCH", entry.path);
  }
  const dataStart = entry.localHeaderOffset + headerBytes;
  return { headerBytes, dataStart,
    dataEnd: dataStart + entry.compressedSize - 1, descriptorPresent: (flags & 8) !== 0 };
}

function parseDescriptor(bytes, entry) {
  if (bytes.length < 16 || bytes.readUInt32LE(0) !== ZIP_DESCRIPTOR
    || bytes.readUInt32LE(4).toString(16).padStart(8, "0") !== entry.crc32
    || bytes.readUInt32LE(8) !== entry.compressedSize
    || bytes.readUInt32LE(12) !== entry.uncompressedSize) {
    fail("DATA_DESCRIPTOR_INVALID", entry.path);
  }
  return { signaturePresent: true, descriptorBytes: 16 };
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

function repositoryProjection(value) {
  const license = value?.cardData?.license ?? null;
  if (!exactObject(value) || value.id !== DIGIT_DATASET_ID
    || value.sha !== DIGIT_DATASET_REVISION || value.private !== false
    || value.gated !== false || value.disabled !== false || license !== null) {
    fail("HF_REPOSITORY_RECORD_INVALID");
  }
  return { datasetId: DIGIT_DATASET_ID, revision: DIGIT_DATASET_REVISION,
    private: false, gated: false, disabled: false,
    publisherDatasetLicenseClaim: null,
    lastModified: typeof value.lastModified === "string" ? value.lastModified : null };
}

function normalizeTree(entries) {
  if (!Array.isArray(entries)) fail("HF_TREE_PAGE_INVALID");
  return entries.map((entry) => {
    if (!exactObject(entry) || typeof entry.path !== "string"
      || !["file", "directory"].includes(entry.type)) fail("HF_TREE_ENTRY_INVALID");
    if (entry.type === "directory") return { path: entry.path, type: "directory" };
    if (!Number.isSafeInteger(entry.size) || entry.size < 0 || !SHA1.test(entry.oid ?? "")) {
      fail("HF_TREE_FILE_INVALID", entry.path);
    }
    const projected = { path: entry.path, type: "file", sizeBytes: entry.size,
      gitOid: entry.oid, lfs: null,
      xetHash: typeof entry.xetHash === "string" ? entry.xetHash : null };
    if (entry.lfs !== undefined) {
      if (!exactObject(entry.lfs) || !BARE_SHA256.test(entry.lfs.oid ?? "")
        || entry.lfs.size !== entry.size) fail("HF_TREE_LFS_INVALID", entry.path);
      projected.lfs = { sha256: `sha256:${entry.lfs.oid}`, sizeBytes: entry.lfs.size };
    }
    return projected;
  });
}

function parseNextLink(header) {
  if (!header) return null;
  const part = String(header).split(",").find((item) => /;\s*rel="next"\s*$/iu.test(item));
  if (!part) return null;
  const match = /^\s*<([^>]+)>/u.exec(part);
  if (!match) fail("HF_TREE_LINK_INVALID");
  const url = checkedUrl(match[1], "HF_INITIAL");
  if (url.pathname !== HF_TREE_PATH || url.searchParams.get("recursive") !== "true"
    || url.searchParams.get("expand") !== "true" || !url.searchParams.get("cursor")) {
    fail("HF_TREE_LINK_UNSAFE");
  }
  return url.toString();
}

async function fetchTree(fetchImpl, bracket) {
  const entries = [];
  const support = [];
  const seen = new Set();
  let url = HF_TREE_URL;
  for (let page = 1; url !== null; page += 1) {
    if (page > 32 || seen.has(url)) fail("HF_TREE_PAGINATION_INVALID");
    seen.add(url);
    const fetched = await jsonFetch(url, MAX_API_BYTES, "HF_INITIAL", fetchImpl);
    entries.push(...normalizeTree(fetched.value));
    support.push({ path: `source-support/hf-tree-${bracket}-${String(page).padStart(3, "0")}.json`,
      source: url, bytes: fetched.bytes, range: null });
    url = parseNextLink(fetched.headers.get("link"));
  }
  const ordered = entries.sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(ordered.map((entry) => entry.path)).size !== ordered.length) {
    fail("HF_TREE_DUPLICATE_PATH");
  }
  const archive = ordered.find((entry) => entry.path === DIGIT_ARCHIVE_PATH);
  if (!archive || archive.type !== "file" || archive.sizeBytes !== DIGIT_ARCHIVE_BYTES
    || archive.gitOid !== DIGIT_ARCHIVE_GIT_OID
    || archive.lfs?.sha256 !== DIGIT_ARCHIVE_LFS_SHA256
    || archive.xetHash !== DIGIT_ARCHIVE_XET_HASH) fail("HF_ARCHIVE_TREE_PIN_INVALID");
  return { entries: ordered, support, pages: support.length,
    snapshotHash: digitDigest(ordered, `${DIGIT_SOURCE_SCHEMA}/hf-tree`) };
}

function githubCommitProjection(value) {
  if (!exactObject(value) || value.sha !== DIGIT_REPOSITORY_COMMIT
    || value.commit?.tree?.sha !== DIGIT_REPOSITORY_TREE) fail("GH_COMMIT_INVALID");
  return { repository: DIGIT_REPOSITORY, commit: DIGIT_REPOSITORY_COMMIT,
    treeSha: value.commit.tree.sha,
    authorDate: typeof value.commit?.author?.date === "string" ? value.commit.author.date : null,
    committerDate: typeof value.commit?.committer?.date === "string"
      ? value.commit.committer.date : null,
    commitSignatureVerified: value.commit?.verification?.verified === true };
}

function githubTreeProjection(value, expectedTreeSha) {
  if (!exactObject(value) || value.truncated !== false || value.sha !== expectedTreeSha
    || !Array.isArray(value.tree)) fail("GH_TREE_INVALID");
  const projected = value.tree.map((entry) => ({ path: entry.path, mode: entry.mode,
    type: entry.type, sha: entry.sha, sizeBytes: entry.size ?? null }))
    .sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(projected.map((entry) => entry.path)).size !== projected.length) {
    fail("GH_TREE_DUPLICATE_PATH");
  }
  for (const required of CODE_SUPPORT_PATHS) {
    const found = projected.find((entry) => entry.path === required);
    if (!found || found.type !== "blob" || !SHA1.test(found.sha ?? "")) {
      fail("GH_REQUIRED_BLOB_MISSING", required);
    }
  }
  return projected;
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
  return { path: item.path, source: item.source, sizeBytes: item.bytes.length,
    sha256: digitSha256(item.bytes), range: item.range ?? null };
}

function rangeProjection(range) {
  return { start: range.start, end: range.end, contentRange: range.contentRange,
    chunks: range.chunks };
}

function writeSupport(staging, item, projections) {
  writePrivate(path.join(staging, ...item.path.split("/")), item.bytes);
  projections.push(supportProjection(item));
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

export async function acquirePinnedDigitHardwareFaultSource(outputDirectory, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_IMPLEMENTATION_MISSING");
  const target = path.resolve(outputDirectory);
  if (target === path.parse(target).root || existsSync(target)) fail("OUTPUT_EXISTS_OR_BROAD");
  ensurePrivateDirectory(path.dirname(target));
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  let targetClaimed = false;
  try {
    const supportObjects = [];
    const recordBeforeRaw = await jsonFetch(HF_RECORD_URL, MAX_API_BYTES,
      "HF_INITIAL", fetchImpl);
    const recordBefore = repositoryProjection(recordBeforeRaw.value);
    writeSupport(staging, { path: "source-support/hf-repository-before.json",
      source: HF_RECORD_URL, bytes: recordBeforeRaw.bytes, range: null }, supportObjects);
    const treeBefore = await fetchTree(fetchImpl, "before");
    for (const item of treeBefore.support) writeSupport(staging, item, supportObjects);

    const ghCommitRaw = await jsonFetch(GH_COMMIT_URL, MAX_API_BYTES, "GH_API", fetchImpl);
    const ghCommit = githubCommitProjection(ghCommitRaw.value);
    writeSupport(staging, { path: "source-support/github-commit.json",
      source: GH_COMMIT_URL, bytes: ghCommitRaw.bytes, range: null }, supportObjects);
    const ghTreeRaw = await jsonFetch(GH_TREE_URL, MAX_API_BYTES, "GH_API", fetchImpl);
    const ghTree = githubTreeProjection(ghTreeRaw.value, ghCommit.treeSha);
    writeSupport(staging, { path: "source-support/github-tree.json",
      source: GH_TREE_URL, bytes: ghTreeRaw.bytes, range: null }, supportObjects);
    const codeObjects = [];
    for (const remotePath of CODE_SUPPORT_PATHS) {
      const url = `${GH_RAW_ROOT}/${remotePath}`;
      const fetched = await boundedDirectFetch(url, 4 * 1024 * 1024,
        "GH_RAW", "text/plain", fetchImpl);
      const treeEntry = ghTree.find((entry) => entry.path === remotePath);
      if (gitBlobOid(fetched.bytes) !== treeEntry.sha) fail("GH_BLOB_BINDING_INVALID", remotePath);
      const local = `source-support/github-${remotePath.replaceAll("/", "-").toLowerCase()}`;
      writeSupport(staging, { path: local, source: url, bytes: fetched.bytes,
        range: null }, supportObjects);
      codeObjects.push({ remotePath, supportPath: local, sizeBytes: fetched.bytes.length,
        gitBlobOid: treeEntry.sha, sha256: digitSha256(fetched.bytes) });
    }
    const licenseBytes = readFileSync(path.join(staging, "source-support/github-license.md"));
    const loaderBytes = readFileSync(path.join(staging,
      "source-support/github-utils-dataset.py"));
    if (!/GNU AFFERO GENERAL PUBLIC LICENSE[\s\S]{0,200}Version 3/iu.test(
      licenseBytes.toString("utf8")) || /real_labels\.npy/u.test(loaderBytes.toString("utf8"))) {
      fail("GH_CODE_SEMANTIC_BOUNDARY_CHANGED");
    }

    const tailRange = await strictRangeFetch(ARCHIVE_CENTRAL_OFFSET,
      DIGIT_ARCHIVE_BYTES - 1, ARCHIVE_CENTRAL_BYTES + ARCHIVE_EOCD_BYTES, fetchImpl);
    writeSupport(staging, { path: "source-support/archive-central-and-eocd.bin",
      source: HF_ARCHIVE_URL, bytes: tailRange.bytes,
      range: rangeProjection(tailRange) }, supportObjects);
    const inventory = inventoryFromTail(tailRange.bytes);
    const inventoryBytes = canonicalBytes(inventory);
    writePrivate(path.join(staging, "archive-inventory.json"), inventoryBytes);
    const byPath = new Map(inventory.entries.map((entry) => [entry.path, entry]));
    const selectedObjects = [];
    for (const basename of SELECTED_BASENAMES) {
      const internalPath = `trial_1/${basename}`;
      const entry = byPath.get(internalPath);
      if (!entry) fail("SELECTED_ENTRY_MISSING", internalPath);
      const stem = basename.replace(/\.npy$/u, "").replaceAll("_", "-");
      const prefixRange = await strictRangeFetch(entry.localHeaderOffset,
        entry.localHeaderOffset + 127, 128, fetchImpl);
      const local = parseLocalPrefix(prefixRange.bytes, entry);
      const compressedRange = await strictRangeFetch(local.dataStart, local.dataEnd,
        MAX_SELECTED_COMPRESSED_BYTES, fetchImpl);
      let raw;
      try { raw = inflateRawSync(compressedRange.bytes, { maxOutputLength: entry.uncompressedSize }); }
      catch (error) { fail("ENTRY_DEFLATE_INVALID", `${internalPath}:${safeError(error)}`); }
      if (raw.length !== entry.uncompressedSize || crc32Hex(raw) !== entry.crc32) {
        fail("ENTRY_CRC_OR_SIZE_INVALID", internalPath);
      }
      const descriptorRange = await strictRangeFetch(local.dataEnd + 1,
        local.dataEnd + 24, 24, fetchImpl);
      const descriptor = parseDescriptor(descriptorRange.bytes, entry);
      const rawPath = `raw/${basename}`;
      const prefixPath = `source-support/${stem}-local-prefix.bin`;
      const compressedPath = `source-support/${stem}-compressed.bin`;
      const descriptorPath = `source-support/${stem}-descriptor-prefix.bin`;
      writePrivate(path.join(staging, rawPath), raw);
      writeSupport(staging, { path: prefixPath, source: HF_ARCHIVE_URL,
        bytes: prefixRange.bytes, range: rangeProjection(prefixRange) }, supportObjects);
      writeSupport(staging, { path: compressedPath, source: HF_ARCHIVE_URL,
        bytes: compressedRange.bytes, range: rangeProjection(compressedRange) }, supportObjects);
      writeSupport(staging, { path: descriptorPath, source: HF_ARCHIVE_URL,
        bytes: descriptorRange.bytes, range: rangeProjection(descriptorRange) }, supportObjects);
      selectedObjects.push({ feature: basename.replace(/\.npy$/u, ""), internalPath,
        rawPath, localPrefixPath: prefixPath, compressedPath, descriptorPrefixPath: descriptorPath,
        flags: entry.flags, compressionMethod: entry.compressionMethod, crc32: entry.crc32,
        compressedSize: entry.compressedSize, uncompressedSize: entry.uncompressedSize,
        localHeaderOffset: entry.localHeaderOffset, localHeaderBytes: local.headerBytes,
        dataStart: local.dataStart, dataEnd: local.dataEnd,
        descriptorBytes: descriptor.descriptorBytes,
        compressedRangeChunks: compressedRange.chunks,
        rawSha256: digitSha256(raw), compressedSha256: compressedRange.sha256 });
    }

    const treeAfter = await fetchTree(fetchImpl, "after");
    for (const item of treeAfter.support) writeSupport(staging, item, supportObjects);
    const recordAfterRaw = await jsonFetch(HF_RECORD_URL, MAX_API_BYTES,
      "HF_INITIAL", fetchImpl);
    const recordAfter = repositoryProjection(recordAfterRaw.value);
    writeSupport(staging, { path: "source-support/hf-repository-after.json",
      source: HF_RECORD_URL, bytes: recordAfterRaw.bytes, range: null }, supportObjects);
    if (!same(recordBefore, recordAfter)
      || treeBefore.snapshotHash !== treeAfter.snapshotHash
      || !same(treeBefore.entries, treeAfter.entries)) fail("HF_SOURCE_CHANGED_DURING_ACQUISITION");
    supportObjects.sort((left, right) => left.path.localeCompare(right.path));
    selectedObjects.sort((left, right) => left.feature.localeCompare(right.feature));
    const selectedCompressedBytes = selectedObjects.reduce((sum, item) =>
      sum + item.compressedSize, 0);
    const selectedUncompressedBytes = selectedObjects.reduce((sum, item) =>
      sum + item.uncompressedSize, 0);
    if (selectedCompressedBytes !== 111_676_259
      || selectedUncompressedBytes !== 262_933_275) fail("SELECTION_BYTES_CHANGED");
    const body = {
      schema: DIGIT_SOURCE_SCHEMA,
      capturedAt: DIGIT_FROZEN_AT,
      datasetId: DIGIT_DATASET_ID,
      pinnedRevision: DIGIT_DATASET_REVISION,
      repositoryBefore: recordBefore,
      repositoryAfter: recordAfter,
      repositoryStableDuringAcquisition: true,
      treeBefore: { pages: treeBefore.pages, entryCount: treeBefore.entries.length,
        snapshotHash: treeBefore.snapshotHash },
      treeAfter: { pages: treeAfter.pages, entryCount: treeAfter.entries.length,
        snapshotHash: treeAfter.snapshotHash },
      treeStableDuringAcquisition: true,
      archive: { path: DIGIT_ARCHIVE_PATH, sizeBytes: DIGIT_ARCHIVE_BYTES,
        lfsSha256: DIGIT_ARCHIVE_LFS_SHA256, gitOid: DIGIT_ARCHIVE_GIT_OID,
        xetHash: DIGIT_ARCHIVE_XET_HASH, fullArchiveDownloaded: false,
        fullArchiveLfsSha256Recomputed: false, strictHttpRangeEstablished: true,
        completeCentralDirectoryEnumerated: true,
        inventoryHash: inventory.inventoryHash,
        inventoryFileSha256: digitSha256(inventoryBytes) },
      selection: { trial: 1, selectedNoRosbagObjects: 9,
        selectedCompressedBytes, selectedUncompressedBytes,
        rosbagObjectExcluded: true, completeTrialArchivePayloadReplayed: false,
        completeSelectedNoRosbagClosureReplayed: true },
      repositorySupport: { repository: DIGIT_REPOSITORY,
        commit: DIGIT_REPOSITORY_COMMIT, treeSha: ghCommit.treeSha,
        commitSignatureVerified: ghCommit.commitSignatureVerified,
        codeLicenseClaim: "AGPL-3.0", codeLicenseDoesNotExtendToDatasetBytes: true,
        selectedOfficialLoaderConsumesRealLabels: false, codeObjects },
      rights: { publisherDatasetLicenseClaim: null,
        status: "FAIL_CLOSED_NO_DATASET_LICENSE",
        repositoryCodeLicenseNotAppliedToDatasetBytes: true,
        legalAdjudicationPerformed: false,
        redistributionAuthorizedByArtifact: false,
        productionTrainingAuthorizedByOutsider: false },
      privacy: { imagerySelected: false, audioSelected: false,
        noPiiGuaranteed: false, networkProjectionAllowed: false },
      transportAttested: false,
      sourceSupportObjects: supportObjects,
      selectedObjects,
    };
    const manifest = { ...body,
      manifestHash: digitDigest(body, `${DIGIT_SOURCE_SCHEMA}/manifest`) };
    writePrivate(path.join(staging, "acquisition-manifest.json"), canonicalBytes(manifest));
    publishSourceStaging(staging, target);
    targetClaimed = true;
    const manifestBytes = readFileSync(path.join(target, "acquisition-manifest.json"));
    return { sourceDirectory: target, manifest,
      manifestFileSha256: digitSha256(manifestBytes) };
  } catch (error) {
    if (existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    if (!targetClaimed && existsSync(target)) {
      /* A partial final claim is retained fail-closed; no completion manifest exists. */
    }
    throw error;
  }
}

function requireDirectory(directory, expectedEntries, snapshots) {
  const target = path.resolve(directory);
  const before = lstatSync(target, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()
    || Number(before.mode & 0o777n) !== 0o700) fail("SOURCE_DIRECTORY_UNSAFE", target);
  const entries = sorted(readdirSync(target));
  if (!same(entries, sorted(expectedEntries))) fail("SOURCE_DIRECTORY_LAYOUT_INVALID", target);
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
  maximumBytes = MAX_SELECTED_RAW_BYTES) {
  const target = checkedLocalPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (link.isSymbolicLink() || !link.isFile() || Number(link.mode & 0o777n) !== 0o600
    || link.size < 1n || link.size > BigInt(maximumBytes)) fail("SOURCE_FILE_UNSAFE", relative);
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
      || expected.sha256 !== digitSha256(bytes))) fail("SOURCE_FILE_BINDING_INVALID", relative);
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
      || chunk.contentRange !== `bytes ${chunk.start}-${chunk.end}/${DIGIT_ARCHIVE_BYTES}`
      || chunk.initialStatus !== 302 || chunk.repositoryCommit !== DIGIT_DATASET_REVISION
      || chunk.linkedSizeBytes !== DIGIT_ARCHIVE_BYTES
      || chunk.linkedEtag !== DIGIT_ARCHIVE_LFS_SHA256
      || chunk.xetHash !== DIGIT_ARCHIVE_XET_HASH
      || typeof chunk.finalHost !== "string" || !ALLOWED_HF_REDIRECT.test(chunk.finalHost)) {
      fail(`${code}_CHUNK_INVALID`, String(cursor));
    }
    cursor = chunk.end + 1;
  }
  if (cursor !== range.end + 1
    || range.contentRange !== (range.chunks.length === 1
      ? range.chunks[0].contentRange : "STRICT_206_CHUNK_SET")) {
    fail(`${code}_INCOMPLETE`);
  }
}

function verifyRangeBytes(bytes, range, code) {
  validateRange(range, bytes.length, code);
  for (const chunk of range.chunks) {
    const begin = chunk.start - range.start;
    const finish = begin + chunk.sizeBytes;
    if (begin < 0 || finish > bytes.length
      || digitSha256(bytes.subarray(begin, finish)) !== chunk.sha256) {
      fail(`${code}_HASH_INVALID`, `${chunk.start}-${chunk.end}`);
    }
  }
}

function validateSupportObject(item) {
  if (!exactObject(item) || typeof item.path !== "string"
    || !item.path.startsWith("source-support/") || item.path.split("/").length !== 2
    || typeof item.source !== "string" || !Number.isSafeInteger(item.sizeBytes)
    || item.sizeBytes <= 0 || !HASH.test(item.sha256 ?? "")) fail("SUPPORT_OBJECT_INVALID");
  const url = new URL(item.source);
  if (url.protocol !== "https:" || !["huggingface.co", "api.github.com",
    "raw.githubusercontent.com"].includes(url.hostname)) fail("SUPPORT_SOURCE_URL_INVALID");
  if (item.range === null) {
    if (item.source === HF_ARCHIVE_URL) fail("SUPPORT_RANGE_MISSING", item.path);
  } else {
    if (item.source !== HF_ARCHIVE_URL) fail("SUPPORT_RANGE_SOURCE_INVALID", item.path);
    validateRange(item.range, item.sizeBytes, "SUPPORT_RANGE");
  }
}

function validateManifest(manifest) {
  if (!exactObject(manifest)) fail("MANIFEST_INVALID");
  const { manifestHash, ...body } = manifest;
  if (manifest.schema !== DIGIT_SOURCE_SCHEMA || manifest.capturedAt !== DIGIT_FROZEN_AT
    || manifest.datasetId !== DIGIT_DATASET_ID
    || manifest.pinnedRevision !== DIGIT_DATASET_REVISION
    || manifest.repositoryStableDuringAcquisition !== true
    || manifest.treeStableDuringAcquisition !== true
    || manifest.transportAttested !== false
    || manifestHash !== digitDigest(body, `${DIGIT_SOURCE_SCHEMA}/manifest`)
    || !same(manifest.repositoryBefore, manifest.repositoryAfter)
    || manifest.treeBefore?.snapshotHash !== manifest.treeAfter?.snapshotHash
    || manifest.treeBefore?.pages !== manifest.treeAfter?.pages
    || manifest.treeBefore?.entryCount !== manifest.treeAfter?.entryCount) {
    fail("MANIFEST_IDENTITY_INVALID");
  }
  repositoryProjection({ id: manifest.repositoryBefore.datasetId,
    sha: manifest.repositoryBefore.revision, private: manifest.repositoryBefore.private,
    gated: manifest.repositoryBefore.gated, disabled: manifest.repositoryBefore.disabled,
    lastModified: manifest.repositoryBefore.lastModified });
  if (manifest.archive?.path !== DIGIT_ARCHIVE_PATH
    || manifest.archive?.sizeBytes !== DIGIT_ARCHIVE_BYTES
    || manifest.archive?.lfsSha256 !== DIGIT_ARCHIVE_LFS_SHA256
    || manifest.archive?.gitOid !== DIGIT_ARCHIVE_GIT_OID
    || manifest.archive?.xetHash !== DIGIT_ARCHIVE_XET_HASH
    || manifest.archive?.fullArchiveDownloaded !== false
    || manifest.archive?.fullArchiveLfsSha256Recomputed !== false
    || manifest.archive?.strictHttpRangeEstablished !== true
    || manifest.archive?.completeCentralDirectoryEnumerated !== true
    || !HASH.test(manifest.archive?.inventoryHash ?? "")
    || !HASH.test(manifest.archive?.inventoryFileSha256 ?? "")) {
    fail("MANIFEST_ARCHIVE_INVALID");
  }
  if (manifest.selection?.trial !== 1
    || manifest.selection?.selectedNoRosbagObjects !== 9
    || manifest.selection?.selectedCompressedBytes !== 111_676_259
    || manifest.selection?.selectedUncompressedBytes !== 262_933_275
    || manifest.selection?.rosbagObjectExcluded !== true
    || manifest.selection?.completeTrialArchivePayloadReplayed !== false
    || manifest.selection?.completeSelectedNoRosbagClosureReplayed !== true) {
    fail("MANIFEST_SELECTION_INVALID");
  }
  if (manifest.repositorySupport?.repository !== DIGIT_REPOSITORY
    || manifest.repositorySupport?.commit !== DIGIT_REPOSITORY_COMMIT
    || manifest.repositorySupport?.treeSha !== DIGIT_REPOSITORY_TREE
    || manifest.repositorySupport?.commitSignatureVerified !== true
    || manifest.repositorySupport?.codeLicenseClaim !== "AGPL-3.0"
    || manifest.repositorySupport?.codeLicenseDoesNotExtendToDatasetBytes !== true
    || manifest.repositorySupport?.selectedOfficialLoaderConsumesRealLabels !== false
    || !Array.isArray(manifest.repositorySupport?.codeObjects)
    || manifest.repositorySupport.codeObjects.length !== 3) {
    fail("MANIFEST_REPOSITORY_SUPPORT_INVALID");
  }
  if (manifest.rights?.publisherDatasetLicenseClaim !== null
    || manifest.rights?.status !== "FAIL_CLOSED_NO_DATASET_LICENSE"
    || manifest.rights?.repositoryCodeLicenseNotAppliedToDatasetBytes !== true
    || manifest.rights?.legalAdjudicationPerformed !== false
    || manifest.rights?.redistributionAuthorizedByArtifact !== false
    || manifest.rights?.productionTrainingAuthorizedByOutsider !== false
    || manifest.privacy?.imagerySelected !== false
    || manifest.privacy?.audioSelected !== false
    || manifest.privacy?.noPiiGuaranteed !== false
    || manifest.privacy?.networkProjectionAllowed !== false) fail("MANIFEST_BOUNDARY_INVALID");
  if (!Array.isArray(manifest.sourceSupportObjects)
    || !Array.isArray(manifest.selectedObjects)
    || manifest.selectedObjects.length !== 9) fail("MANIFEST_OBJECTS_INVALID");
  manifest.sourceSupportObjects.forEach(validateSupportObject);
  const supportPaths = manifest.sourceSupportObjects.map((item) => item.path);
  const selectedFeatures = manifest.selectedObjects.map((item) => item.feature);
  if (!same(supportPaths, sorted(supportPaths))
    || new Set(supportPaths).size !== supportPaths.length
    || !same(selectedFeatures, sorted(selectedFeatures))
    || !same(selectedFeatures, SELECTED_BASENAMES.map((item) => item.replace(/\.npy$/u, "")))) {
    fail("MANIFEST_OBJECT_ORDER_INVALID");
  }
  for (const item of manifest.selectedObjects) {
    if (!exactObject(item) || item.internalPath !== `trial_1/${item.feature}.npy`
      || item.rawPath !== `raw/${item.feature}.npy`
      || !item.localPrefixPath?.startsWith("source-support/")
      || !item.compressedPath?.startsWith("source-support/")
      || !item.descriptorPrefixPath?.startsWith("source-support/")
      || item.flags !== 8 || item.compressionMethod !== 8
      || !/^[a-f0-9]{8}$/u.test(item.crc32 ?? "")
      || !Number.isSafeInteger(item.compressedSize) || item.compressedSize <= 0
      || !Number.isSafeInteger(item.uncompressedSize) || item.uncompressedSize <= 0
      || !Number.isSafeInteger(item.localHeaderOffset) || item.localHeaderOffset < 0
      || !Number.isSafeInteger(item.localHeaderBytes) || item.localHeaderBytes < 30
      || item.dataStart !== item.localHeaderOffset + item.localHeaderBytes
      || item.dataEnd !== item.dataStart + item.compressedSize - 1
      || item.descriptorBytes !== 16 || !HASH.test(item.rawSha256 ?? "")
      || !HASH.test(item.compressedSha256 ?? "")
      || !Array.isArray(item.compressedRangeChunks)) fail("MANIFEST_SELECTED_INVALID");
    validateRange({ start: item.dataStart, end: item.dataEnd,
      contentRange: item.compressedRangeChunks.length === 1
        ? item.compressedRangeChunks[0].contentRange : "STRICT_206_CHUNK_SET",
      chunks: item.compressedRangeChunks }, item.compressedSize, "SELECTED_RANGE");
  }
  return manifest;
}

function replayHfTree(manifest, supportBytes, bracket) {
  const entries = [];
  const prefix = `source-support/hf-tree-${bracket}-`;
  const pages = manifest.sourceSupportObjects.filter((item) => item.path.startsWith(prefix));
  if (pages.length !== manifest[bracket === "before" ? "treeBefore" : "treeAfter"].pages) {
    fail("HF_TREE_REPLAY_PAGE_COUNT_INVALID", bracket);
  }
  for (const page of pages) entries.push(...normalizeTree(parseJson(supportBytes.get(page.path),
    "HF_TREE_SUPPORT_JSON_INVALID")));
  const ordered = entries.sort((left, right) => left.path.localeCompare(right.path));
  if (new Set(ordered.map((entry) => entry.path)).size !== ordered.length) {
    fail("HF_TREE_REPLAY_DUPLICATE", bracket);
  }
  const summary = manifest[bracket === "before" ? "treeBefore" : "treeAfter"];
  if (ordered.length !== summary.entryCount
    || digitDigest(ordered, `${DIGIT_SOURCE_SCHEMA}/hf-tree`) !== summary.snapshotHash) {
    fail("HF_TREE_REPLAY_HASH_INVALID", bracket);
  }
  const archive = ordered.find((entry) => entry.path === DIGIT_ARCHIVE_PATH);
  if (archive?.sizeBytes !== DIGIT_ARCHIVE_BYTES
    || archive?.gitOid !== DIGIT_ARCHIVE_GIT_OID
    || archive?.lfs?.sha256 !== DIGIT_ARCHIVE_LFS_SHA256
    || archive?.xetHash !== DIGIT_ARCHIVE_XET_HASH) fail("HF_TREE_REPLAY_ARCHIVE_INVALID");
  return ordered;
}

export function verifyDigitHardwareFaultSourceDirectory(sourceDirectory) {
  const root = path.resolve(sourceDirectory);
  const snapshots = [];
  requireDirectory(root,
    ["acquisition-manifest.json", "archive-inventory.json", "raw", "source-support"],
    snapshots);
  const manifestBytes = readPrivateStable(root, "acquisition-manifest.json", snapshots,
    null, 4 * 1024 * 1024);
  const manifest = validateManifest(parseJson(manifestBytes, "MANIFEST_JSON_INVALID"));
  requireDirectory(path.join(root, "raw"), SELECTED_BASENAMES, snapshots);
  requireDirectory(path.join(root, "source-support"),
    manifest.sourceSupportObjects.map((item) => path.posix.basename(item.path)), snapshots);
  const supportBytes = new Map();
  for (const item of manifest.sourceSupportObjects) {
    const bytes = readPrivateStable(root, item.path, snapshots, item,
      Math.max(MAX_API_BYTES, MAX_SELECTED_COMPRESSED_BYTES));
    if (item.range !== null) verifyRangeBytes(bytes, item.range, "SUPPORT_RANGE_REPLAY");
    supportBytes.set(item.path, bytes);
  }
  if (!same(repositoryProjection(parseJson(supportBytes.get(
    "source-support/hf-repository-before.json"), "HF_RECORD_BEFORE_INVALID")),
  manifest.repositoryBefore)
    || !same(repositoryProjection(parseJson(supportBytes.get(
      "source-support/hf-repository-after.json"), "HF_RECORD_AFTER_INVALID")),
    manifest.repositoryAfter)) fail("HF_RECORD_REPLAY_INVALID");
  const treeBefore = replayHfTree(manifest, supportBytes, "before");
  const treeAfter = replayHfTree(manifest, supportBytes, "after");
  if (!same(treeBefore, treeAfter)) fail("HF_TREE_BRACKET_REPLAY_INVALID");

  const ghCommitRaw = parseJson(supportBytes.get("source-support/github-commit.json"),
    "GH_COMMIT_SUPPORT_INVALID");
  const ghCommit = githubCommitProjection(ghCommitRaw);
  if (ghCommit.treeSha !== manifest.repositorySupport.treeSha
    || ghCommit.commitSignatureVerified !== manifest.repositorySupport.commitSignatureVerified) {
    fail("GH_COMMIT_REPLAY_INVALID");
  }
  const ghTree = githubTreeProjection(parseJson(supportBytes.get(
    "source-support/github-tree.json"), "GH_TREE_SUPPORT_INVALID"), ghCommit.treeSha);
  for (const item of manifest.repositorySupport.codeObjects) {
    const bytes = supportBytes.get(item.supportPath);
    const treeItem = ghTree.find((entry) => entry.path === item.remotePath);
    if (!bytes || !treeItem || item.sizeBytes !== bytes.length
      || item.sha256 !== digitSha256(bytes) || item.gitBlobOid !== gitBlobOid(bytes)
      || item.gitBlobOid !== treeItem.sha) fail("GH_CODE_OBJECT_REPLAY_INVALID", item.remotePath);
  }
  if (!/GNU AFFERO GENERAL PUBLIC LICENSE[\s\S]{0,200}Version 3/iu.test(
    supportBytes.get("source-support/github-license.md").toString("utf8"))
    || /real_labels\.npy/u.test(supportBytes.get(
      "source-support/github-utils-dataset.py").toString("utf8"))) {
    fail("GH_CODE_SEMANTIC_REPLAY_INVALID");
  }

  const inventoryBytes = readPrivateStable(root, "archive-inventory.json", snapshots,
    { sizeBytes: Number(lstatSync(path.join(root, "archive-inventory.json")).size),
      sha256: manifest.archive.inventoryFileSha256 }, 4 * 1024 * 1024);
  const inventory = parseJson(inventoryBytes, "INVENTORY_JSON_INVALID");
  const tail = supportBytes.get("source-support/archive-central-and-eocd.bin");
  const rebuilt = inventoryFromTail(tail);
  if (!same(rebuilt, inventory) || inventory.inventoryHash !== manifest.archive.inventoryHash) {
    fail("INVENTORY_REPLAY_INVALID");
  }
  const byPath = new Map(inventory.entries.map((entry) => [entry.path, entry]));
  const rawObjects = [];
  for (const item of manifest.selectedObjects) {
    const central = byPath.get(item.internalPath);
    if (!central || central.flags !== item.flags
      || central.compressionMethod !== item.compressionMethod || central.crc32 !== item.crc32
      || central.compressedSize !== item.compressedSize
      || central.uncompressedSize !== item.uncompressedSize
      || central.localHeaderOffset !== item.localHeaderOffset) {
      fail("SELECTED_CENTRAL_REPLAY_INVALID", item.feature);
    }
    const prefix = supportBytes.get(item.localPrefixPath);
    const local = parseLocalPrefix(prefix, central);
    const prefixBinding = manifest.sourceSupportObjects.find((entry) =>
      entry.path === item.localPrefixPath)?.range;
    if (local.headerBytes !== item.localHeaderBytes || local.dataStart !== item.dataStart
      || local.dataEnd !== item.dataEnd || local.descriptorPresent !== true
      || prefixBinding?.start !== item.localHeaderOffset
      || prefixBinding?.end !== item.localHeaderOffset + 127) {
      fail("SELECTED_LOCAL_REPLAY_INVALID", item.feature);
    }
    const descriptor = supportBytes.get(item.descriptorPrefixPath);
    const descriptorBinding = manifest.sourceSupportObjects.find((entry) =>
      entry.path === item.descriptorPrefixPath)?.range;
    parseDescriptor(descriptor, central);
    if (descriptorBinding?.start !== item.dataEnd + 1
      || descriptorBinding?.end !== item.dataEnd + 24) {
      fail("SELECTED_DESCRIPTOR_REPLAY_INVALID", item.feature);
    }
    const compressed = supportBytes.get(item.compressedPath);
    const compressedBinding = manifest.sourceSupportObjects.find((entry) =>
      entry.path === item.compressedPath)?.range;
    if (compressed.length !== item.compressedSize
      || digitSha256(compressed) !== item.compressedSha256
      || compressedBinding?.start !== item.dataStart || compressedBinding?.end !== item.dataEnd
      || !same(compressedBinding?.chunks, item.compressedRangeChunks)) {
      fail("SELECTED_COMPRESSED_REPLAY_INVALID", item.feature);
    }
    const raw = readPrivateStable(root, item.rawPath, snapshots,
      { sizeBytes: item.uncompressedSize, sha256: item.rawSha256 });
    let replayed;
    try { replayed = inflateRawSync(compressed, { maxOutputLength: item.uncompressedSize }); }
    catch { fail("SELECTED_DEFLATE_REPLAY_INVALID", item.feature); }
    if (!replayed.equals(raw) || crc32Hex(raw) !== item.crc32) {
      fail("SELECTED_RAW_REPLAY_INVALID", item.feature);
    }
    rawObjects.push({ path: item.rawPath, sizeBytes: raw.length, sha256: digitSha256(raw) });
  }
  recheckSnapshots(snapshots);
  const rootObjects = [
    { path: "archive-inventory.json", sizeBytes: inventoryBytes.length,
      sha256: digitSha256(inventoryBytes) },
    ...manifest.sourceSupportObjects.map(({ path: objectPath, sizeBytes, sha256 }) =>
      ({ path: objectPath, sizeBytes, sha256 })),
    ...rawObjects,
  ].sort((left, right) => left.path.localeCompare(right.path));
  return Object.freeze({ ok: true, verificationLevel: "FULL_BOUNDED_SOURCE_REPLAY",
    sourceDirectory: root, manifest, inventory,
    manifestFileSha256: digitSha256(manifestBytes),
    sourceRoot: digitDigest(rootObjects, `${DIGIT_SOURCE_SCHEMA}/source-root`) });
}

const NPY_EXTRACTOR = String.raw`
import ast
import gc
import hashlib
import io
import json
import math
import os
import pickle
import re
import stat
import struct
import sys
from collections import Counter

import numpy as np

request = json.load(sys.stdin)
root = os.path.realpath(request["root"])

class RestrictedNumpyUnpickler(pickle.Unpickler):
    ALLOWED = {
        ("numpy.core.multiarray", "_reconstruct"),
        ("numpy._core.multiarray", "_reconstruct"),
        ("numpy", "ndarray"),
        ("numpy", "dtype"),
    }
    def find_class(self, module, name):
        if (module, name) not in self.ALLOWED:
            raise pickle.UnpicklingError("DISALLOWED_GLOBAL:%s.%s" % (module, name))
        return super().find_class(module, name)
    def persistent_load(self, pid):
        raise pickle.UnpicklingError("PERSISTENT_ID_DISALLOWED")

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

def parse_npy_object(raw):
    if raw[:6] != b"\x93NUMPY":
        raise RuntimeError("NPY_MAGIC_INVALID")
    major, minor = raw[6], raw[7]
    if (major, minor) == (1, 0):
        header_len = struct.unpack_from("<H", raw, 8)[0]
        data_start = 10 + header_len
    elif major in (2, 3) and minor == 0:
        header_len = struct.unpack_from("<I", raw, 8)[0]
        data_start = 12 + header_len
    else:
        raise RuntimeError("NPY_VERSION_UNSUPPORTED")
    header = ast.literal_eval(raw[data_start-header_len:data_start].decode("latin1").strip())
    if set(header) != {"descr", "fortran_order", "shape"}:
        raise RuntimeError("NPY_HEADER_KEYS_INVALID")
    dtype = np.dtype(header["descr"])
    if not dtype.hasobject or tuple(header["shape"]) != () or header["fortran_order"] is not False:
        raise RuntimeError("NPY_TOP_LEVEL_PROFILE_INVALID")
    stream = io.BytesIO(raw[data_start:])
    container = RestrictedNumpyUnpickler(stream).load()
    if (stream.read() != b"" or not isinstance(container, np.ndarray)
            or container.shape != () or not container.dtype.hasobject):
        raise RuntimeError("NPY_PICKLE_CONTAINER_INVALID")
    value = container.item()
    if not isinstance(value, dict):
        raise RuntimeError("NPY_TOP_LEVEL_MAPPING_REQUIRED")
    return value, {"version": "%d.%d" % (major, minor), "headerLength": header_len,
                   "dtype": str(dtype), "shape": []}

def summarize_array(value):
    if value.dtype.hasobject or value.dtype.kind not in "biuf":
        raise RuntimeError("NESTED_ARRAY_DTYPE_DISALLOWED:%s" % value.dtype)
    nonfinite = int(np.count_nonzero(~np.isfinite(value))) if value.dtype.kind == "f" else 0
    return {"kind": "NUMERIC_ARRAY", "dtype": str(value.dtype),
            "shape": [int(item) for item in value.shape],
            "elementCount": int(value.size),
            "firstAxisRows": int(value.shape[0]) if value.ndim > 0 else None,
            "nonFiniteCount": nonfinite}

def summarize(value, depth=0):
    if depth > 6:
        raise RuntimeError("OBJECT_DEPTH_EXCEEDED")
    if isinstance(value, np.ndarray):
        return summarize_array(value)
    if isinstance(value, dict):
        if not all(isinstance(key, str) and key and "/" not in key for key in value):
            raise RuntimeError("NESTED_MAPPING_KEY_INVALID")
        names = sorted(value)
        return {"kind": "MAPPING", "keys": names,
                "children": {key: summarize(value[key], depth + 1) for key in names}}
    if type(value) is int or isinstance(value, np.integer):
        return {"kind": "INTEGER", "value": int(value)}
    if type(value) is float or isinstance(value, np.floating):
        number = float(value)
        if not math.isfinite(number):
            raise RuntimeError("NONFINITE_SCALAR")
        return {"kind": "FLOAT", "value": number}
    raise RuntimeError("OBJECT_TYPE_DISALLOWED:%s" % type(value).__name__)

def first_axes(summary):
    if summary["kind"] == "NUMERIC_ARRAY":
        return [] if summary["firstAxisRows"] is None else [summary["firstAxisRows"]]
    if summary["kind"] == "MAPPING":
        out = []
        for child in summary["children"].values():
            out.extend(first_axes(child))
        return out
    return []

objects = []
trajectory_names = None
feature_rows = {}
time_stats = {}
motor_stats = {}
labels = {}
total_nonfinite = 0

for item in request["objects"]:
    raw = read_exact(item["path"], item["sizeBytes"], item["sha256"])
    mapping, npy = parse_npy_object(raw)
    if not all(isinstance(key, str) and key for key in mapping):
        raise RuntimeError("TRAJECTORY_KEY_INVALID")
    names = sorted(mapping)
    if trajectory_names is None:
        trajectory_names = names
    elif names != trajectory_names:
        raise RuntimeError("FEATURE_KEY_JOIN_MISMATCH:%s" % item["feature"])
    summaries = []
    for name in names:
        summary = summarize(mapping[name])
        axes = sorted(set(first_axes(summary)))
        feature_rows.setdefault(name, {})[item["feature"]] = axes
        def count_nonfinite(node):
            if node["kind"] == "NUMERIC_ARRAY":
                return node["nonFiniteCount"]
            if node["kind"] == "MAPPING":
                return sum(count_nonfinite(child) for child in node["children"].values())
            return 0
        total_nonfinite += count_nonfinite(summary)
        summaries.append({"trajectory": name, "value": summary})
        if item["feature"] == "digit_time":
            array = mapping[name]
            if not isinstance(array, np.ndarray) or array.dtype.hasobject:
                raise RuntimeError("TIME_ARRAY_INVALID")
            flat = array.reshape(-1)
            diffs = np.diff(flat.astype(np.float64)) if flat.size > 1 else np.array([])
            time_stats[name] = {"shape": [int(v) for v in array.shape],
                "samples": int(flat.size), "nondecreasing": bool(np.all(diffs >= 0)),
                "strictlyIncreasing": bool(np.all(diffs > 0)),
                "decreaseCount": int(np.count_nonzero(diffs < 0)),
                "equalAdjacentCount": int(np.count_nonzero(diffs == 0)),
                "minimum": float(np.min(flat)) if flat.size else None,
                "maximum": float(np.max(flat)) if flat.size else None}
        elif item["feature"] == "digit_motor_torque_measured":
            array = mapping[name]
            if not isinstance(array, np.ndarray) or array.ndim != 2 or array.shape[1] <= 3:
                raise RuntimeError("MOTOR_TORQUE_ARRAY_INVALID")
            indices = np.flatnonzero(array[:, 3] == 0)
            motor_stats[name] = {"shape": [int(v) for v in array.shape],
                "publisherLoaderProbeColumn": 3,
                "zeroSignalObserved": bool(indices.size),
                "firstZeroIndex": int(indices[0]) if indices.size else None,
                "zeroSampleCount": int(indices.size)}
        elif item["feature"] == "real_labels":
            value = mapping[name]
            if type(value) is not int and not isinstance(value, np.integer):
                raise RuntimeError("LABEL_VALUE_NOT_INTEGER")
            labels[name] = int(value)
    objects.append({"feature": item["feature"], "path": item["path"],
                    "sizeBytes": item["sizeBytes"], "sha256": item["sha256"],
                    "npy": npy, "trajectoryCount": len(names),
                    "trajectories": summaries})
    del mapping
    gc.collect()

if trajectory_names is None:
    raise RuntimeError("NO_TRAJECTORIES")
traces = []
for name in trajectory_names:
    all_axes = sorted(set(axis for axes in feature_rows[name].values() for axis in axes))
    match = re.search(r"_ft_([0-9]+(?:\.[0-9]+)?)\.bag$", name)
    fault = "ABRUPT_FAST" if "_fast_" in name else "INCIPIENT_SLOW" if "_slow_" in name else "UNKNOWN"
    traces.append({"trajectory": name, "publisherNumericLabel": labels.get(name),
        "faultFamilyFromPublisherName": fault,
        "faultApplicationTimeFromPublisherName": float(match.group(1)) if match else None,
        "featureFirstAxisRows": dict(sorted(feature_rows[name].items())),
        "allObservedFeatureLeavesShareFirstAxis": len(all_axes) == 1,
        "observedRowCount": all_axes[0] if len(all_axes) == 1 else None,
        "time": time_stats.get(name), "motorKillSignal": motor_stats.get(name)})

json.dump({
    "parser": {"engine": "restricted-numpy-pickle-inventory",
               "pythonVersion": sys.version.split()[0], "numpyVersion": np.__version__},
    "objectCount": len(objects), "traceCount": len(trajectory_names),
    "completeFeatureKeyJoin": True,
    "publisherNumericLabelCounts": dict(sorted((str(k), v) for k, v in Counter(labels.values()).items())),
    "abruptTraceCount": sum(1 for item in traces if item["faultFamilyFromPublisherName"] == "ABRUPT_FAST"),
    "incipientTraceCount": sum(1 for item in traces if item["faultFamilyFromPublisherName"] == "INCIPIENT_SLOW"),
    "motorKillSignalTraceCount": sum(1 for item in traces if item["motorKillSignal"] and item["motorKillSignal"]["zeroSignalObserved"]),
    "totalNonFiniteCount": total_nonfinite,
    "objects": objects, "traces": traces,
}, sys.stdout, separators=(",", ":"), sort_keys=True)
`;

export function extractDigitHardwareFaultStructures(sourceDirectory, options = {}) {
  const checked = verifyDigitHardwareFaultSourceDirectory(sourceDirectory);
  const pythonExecutable = options.pythonExecutable ?? "/opt/anaconda3/bin/python";
  const objects = checked.manifest.selectedObjects.map((item) => ({ feature: item.feature,
    path: item.rawPath, sizeBytes: item.uncompressedSize, sha256: item.rawSha256 }));
  const child = spawnSync(pythonExecutable, ["-c", NPY_EXTRACTOR], {
    input: canonicalizeStrict({ root: checked.sourceDirectory, objects }),
    encoding: "utf8", timeout: EXTRACTOR_TIMEOUT_MS,
    maxBuffer: MAX_EXTRACTOR_OUTPUT_BYTES,
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONNOUSERSITE: "1",
      PYTHONDONTWRITEBYTECODE: "1" },
  });
  if (child.error || child.status !== 0 || child.signal !== null) {
    fail("NPY_EXTRACTOR_FAILED", `${safeError(child.error ?? "")}:${child.status}:${
      child.signal}:${String(child.stderr).slice(0, 500)}`);
  }
  let extracted;
  try { extracted = JSON.parse(child.stdout); }
  catch { fail("NPY_EXTRACTOR_OUTPUT_INVALID"); }
  return { ...extracted,
    parser: { ...extracted.parser, helperSha256: digitSha256(Buffer.from(NPY_EXTRACTOR)),
      timeoutMs: EXTRACTOR_TIMEOUT_MS, maxOutputBytes: MAX_EXTRACTOR_OUTPUT_BYTES } };
}

function segmentZero(kind) {
  return { kind, covered: false, units: 0, source: null };
}

export function buildDigitHardwareFaultReportFromExtracted(sourceVerification, extracted) {
  if (!exactObject(sourceVerification) || sourceVerification.ok !== true
    || sourceVerification.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY"
    || !exactObject(extracted) || extracted.objectCount !== 9 || extracted.traceCount !== 14
    || extracted.completeFeatureKeyJoin !== true
    || !same(extracted.publisherNumericLabelCounts, { "0": 14 })
    || extracted.abruptTraceCount !== 14 || extracted.incipientTraceCount !== 0
    || !Number.isSafeInteger(extracted.totalNonFiniteCount)
    || extracted.totalNonFiniteCount < 0 || !Array.isArray(extracted.objects)
    || extracted.objects.length !== 9 || !Array.isArray(extracted.traces)
    || extracted.traces.length !== 14) fail("EXTRACTED_PROFILE_INVALID");
  const features = extracted.objects.map((item) => item.feature).sort();
  const expectedFeatures = SELECTED_BASENAMES.map((item) => item.replace(/\.npy$/u, ""));
  if (!same(features, expectedFeatures)
    || extracted.traces.some((trace) => trace.publisherNumericLabel !== 0
      || trace.faultFamilyFromPublisherName !== "ABRUPT_FAST"
      || !Number.isFinite(trace.faultApplicationTimeFromPublisherName)
      || !exactObject(trace.time) || !exactObject(trace.motorKillSignal))) {
    fail("EXTRACTED_TRACE_BOUNDARY_INVALID");
  }
  const { manifest, inventory } = sourceVerification;
  const body = {
    schema: DIGIT_REPORT_SCHEMA,
    frozenAt: DIGIT_FROZEN_AT,
    source: {
      datasetId: DIGIT_DATASET_ID,
      pinnedRevision: DIGIT_DATASET_REVISION,
      archivePath: DIGIT_ARCHIVE_PATH,
      archiveBytes: DIGIT_ARCHIVE_BYTES,
      archiveLfsSha256: DIGIT_ARCHIVE_LFS_SHA256,
      repository: DIGIT_REPOSITORY,
      repositoryCommit: DIGIT_REPOSITORY_COMMIT,
      manifestHash: manifest.manifestHash,
      manifestFileSha256: sourceVerification.manifestFileSha256,
      sourceRoot: sourceVerification.sourceRoot,
      verificationLevel: sourceVerification.verificationLevel,
    },
    denominators: {
      archiveInventory: {
        class: "ZIP_CENTRAL_DIRECTORY_ENTRY",
        units: inventory.counts.centralDirectoryEntries,
        fileEntries: inventory.counts.fileEntries,
        directoryEntries: inventory.counts.directoryEntries,
        completeCentralDirectoryEnumerated: true,
      },
      selectedNoRosbagClosure: {
        class: "SELECTED_NO_ROSBAG_NPY_OBJECT",
        units: manifest.selection.selectedNoRosbagObjects,
        compressedBytes: manifest.selection.selectedCompressedBytes,
        uncompressedBytes: manifest.selection.selectedUncompressedBytes,
        completeSelectedClosureReplayed: true,
        completeTrialArchivePayloadReplayed: false,
      },
      historicalTraces: {
        class: "REAL_HARDWARE_ABRUPT_PERTURBATION_TRACE_WITH_PUBLISHER_NUMERIC_LABEL_ZERO",
        units: 14,
        publisherNumericLabel: 0,
        numericLabelSemanticMeaning: "UNKNOWN_NOT_DEFINED_BY_PINNED_PUBLISHER_MATERIALS",
        safeTraces: null,
        unsafeTraces: null,
        fallTraces: null,
        nonFallTraces: null,
      },
      crossDenominatorAdditionPermitted: false,
      crossTotal: null,
    },
    provenance: {
      publisherRealDirectoryPath: DIGIT_ARCHIVE_PATH,
      faultFamilyAttribution: "PUBLISHER_TRAJECTORY_FILENAME_FAST_TOKEN",
      publisherNumericLabelAttribution: "REAL_LABELS_NPY_EXACT_KEY_JOIN",
      numericLabelMeaningEstablished: false,
      officialSelectedLoaderFileConsumesRealLabels: false,
      paperAggregateSafeUnsafeCountsMappedToTrialOne: false,
      crossTrialInferencePerformed: false,
      repositoryAgplAppliesOnlyToCodeSupport: true,
    },
    telemetry: {
      selectedFeatureObjects: features,
      completeFeatureKeyJoin: true,
      traceCount: 14,
      abruptTraceCount: 14,
      incipientTraceCount: 0,
      totalNonFiniteCount: extracted.totalNonFiniteCount,
      motorKillSignalTraceCount: extracted.motorKillSignalTraceCount,
      parser: extracted.parser,
      objectSchemas: extracted.objects,
      traces: extracted.traces,
      modalityClaims: {
        robotStateTelemetryPresent: true,
        positionVelocityAngularMomentumPresent: true,
        jointPositionAndVelocityPresent: true,
        commandTorqueTelemetryPresent: true,
        measuredMotorTorqueTelemetryPresent: true,
        timeTelemetryPresent: true,
        imageryPresent: false,
        audioPresent: false,
        forceSensorTelemetryPresent: false,
        publisherFaultApplicationTimeEncodedInName: true,
      },
    },
    truthBoundary: {
      publisherNumericZeroPreservedWithoutInterpretation: true,
      safeUnsafeClassificationEstablished: false,
      physicalFallEstablished: false,
      nonFallEstablished: false,
      independentOutcomeEstablished: false,
      independentWitnessEstablished: false,
      prospectiveAttemptCensusEstablished: false,
      completeHistoricalDatasetCensusEstablished: false,
      motorKillSignalIsNotAnOutcomeLabel: true,
      historicalTelemetryIsNotAnOutsiderExecutionAttempt: true,
    },
    segments: {
      opportunityCensus: segmentZero("OPPORTUNITY_CENSUS"),
      delegationAuthorization: segmentZero("DELEGATION_AUTHORIZATION"),
      actionTrace: { kind: "ACTION_TRACE", covered: false, units: 0, source: null,
        historicalCommandTorqueTelemetryPresent: true,
        prospectiveOutsiderActionAuthorityEstablished: false },
      effect: { kind: "EFFECT", covered: false, units: 0, source: null,
        motorKillSignalMorphologyObserved: extracted.motorKillSignalTraceCount > 0,
        effectTruthEstablished: false },
      outcome: segmentZero("OUTCOME"),
      recovery: segmentZero("RECOVERY"),
      longitudinal: segmentZero("LONGITUDINAL"),
    },
    rights: {
      publisherDatasetLicenseClaim: null,
      status: "FAIL_CLOSED_NO_DATASET_LICENSE",
      repositoryCodeLicenseClaim: "AGPL-3.0",
      repositoryCodeLicenseAppliedToDatasetBytes: false,
      redistributionAuthorizedByArtifact: false,
      legalAdjudicationPerformed: false,
      productionTrainingAuthorizedByOutsider: false,
    },
    privacy: {
      imagerySelected: false,
      audioSelected: false,
      trajectoryNamesContainCollectionTimestamps: true,
      noPiiGuaranteed: false,
      networkProjectionAllowed: false,
    },
    useBoundary: {
      status: "QUARANTINE_EVAL_ONLY",
      offlineHardwareFaultMorphologyAnalysisAllowed: true,
      rawRedistributionAllowedByArtifact: false,
      productionTrainingAuthorizedByArtifact: false,
      modelUpdateRows: 0,
      governedTrainingRows: 0,
    },
    network: {
      publicDeploymentReady: false,
      networkAdmissionRows: 0,
      networkSubmissionPerformed: false,
    },
    economics: { CEU: 0, pricingUnits: 0 },
    authority: {
      executionAuthorityEstablished: false,
      delegationAuthorityEstablished: false,
      physicalSafetyEstablished: false,
      productionUseAuthorized: false,
      authorityUnits: 0,
    },
  };
  return Object.freeze({ ...body,
    artifactHash: digitDigest(body, `${DIGIT_REPORT_SCHEMA}/artifact`) });
}

export function buildDigitHardwareFaultReportFromSource(sourceDirectory, options = {}) {
  const source = verifyDigitHardwareFaultSourceDirectory(sourceDirectory);
  const extracted = extractDigitHardwareFaultStructures(sourceDirectory, options);
  return buildDigitHardwareFaultReportFromExtracted(source, extracted);
}

function validateReportBody(report) {
  if (!exactObject(report)) fail("REPORT_INVALID");
  const { artifactHash, ...body } = report;
  if (report.schema !== DIGIT_REPORT_SCHEMA || report.frozenAt !== DIGIT_FROZEN_AT
    || artifactHash !== digitDigest(body, `${DIGIT_REPORT_SCHEMA}/artifact`)
    || report.source?.datasetId !== DIGIT_DATASET_ID
    || report.source?.pinnedRevision !== DIGIT_DATASET_REVISION
    || report.source?.archivePath !== DIGIT_ARCHIVE_PATH
    || report.source?.archiveBytes !== DIGIT_ARCHIVE_BYTES
    || report.source?.archiveLfsSha256 !== DIGIT_ARCHIVE_LFS_SHA256
    || report.source?.repository !== DIGIT_REPOSITORY
    || report.source?.repositoryCommit !== DIGIT_REPOSITORY_COMMIT
    || !HASH.test(report.source?.manifestHash ?? "")
    || !HASH.test(report.source?.manifestFileSha256 ?? "")
    || !HASH.test(report.source?.sourceRoot ?? "")
    || report.source?.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY") {
    fail("REPORT_IDENTITY_INVALID");
  }
  if (report.denominators?.archiveInventory?.class !== "ZIP_CENTRAL_DIRECTORY_ENTRY"
    || report.denominators?.archiveInventory?.units !== 11
    || report.denominators?.archiveInventory?.fileEntries !== 10
    || report.denominators?.archiveInventory?.directoryEntries !== 1
    || report.denominators?.archiveInventory?.completeCentralDirectoryEnumerated !== true
    || report.denominators?.selectedNoRosbagClosure?.units !== 9
    || report.denominators?.selectedNoRosbagClosure?.compressedBytes !== 111_676_259
    || report.denominators?.selectedNoRosbagClosure?.uncompressedBytes !== 262_933_275
    || report.denominators?.selectedNoRosbagClosure?.completeSelectedClosureReplayed !== true
    || report.denominators?.selectedNoRosbagClosure?.completeTrialArchivePayloadReplayed !== false
    || report.denominators?.historicalTraces?.class
      !== "REAL_HARDWARE_ABRUPT_PERTURBATION_TRACE_WITH_PUBLISHER_NUMERIC_LABEL_ZERO"
    || report.denominators?.historicalTraces?.units !== 14
    || report.denominators?.historicalTraces?.publisherNumericLabel !== 0
    || report.denominators?.historicalTraces?.numericLabelSemanticMeaning
      !== "UNKNOWN_NOT_DEFINED_BY_PINNED_PUBLISHER_MATERIALS"
    || report.denominators?.historicalTraces?.safeTraces !== null
    || report.denominators?.historicalTraces?.unsafeTraces !== null
    || report.denominators?.historicalTraces?.fallTraces !== null
    || report.denominators?.historicalTraces?.nonFallTraces !== null
    || report.denominators?.crossDenominatorAdditionPermitted !== false
    || report.denominators?.crossTotal !== null) fail("REPORT_DENOMINATOR_INVALID");
  if (report.provenance?.numericLabelMeaningEstablished !== false
    || report.provenance?.officialSelectedLoaderFileConsumesRealLabels !== false
    || report.provenance?.paperAggregateSafeUnsafeCountsMappedToTrialOne !== false
    || report.provenance?.crossTrialInferencePerformed !== false
    || report.provenance?.repositoryAgplAppliesOnlyToCodeSupport !== true
    || report.telemetry?.traceCount !== 14 || report.telemetry?.abruptTraceCount !== 14
    || report.telemetry?.incipientTraceCount !== 0
    || report.telemetry?.completeFeatureKeyJoin !== true
    || !Array.isArray(report.telemetry?.objectSchemas)
    || report.telemetry.objectSchemas.length !== 9
    || !Array.isArray(report.telemetry?.traces) || report.telemetry.traces.length !== 14
    || report.telemetry.traces.some((trace) => trace.publisherNumericLabel !== 0
      || trace.faultFamilyFromPublisherName !== "ABRUPT_FAST")) {
    fail("REPORT_TELEMETRY_INVALID");
  }
  if (report.truthBoundary?.publisherNumericZeroPreservedWithoutInterpretation !== true
    || report.truthBoundary?.safeUnsafeClassificationEstablished !== false
    || report.truthBoundary?.physicalFallEstablished !== false
    || report.truthBoundary?.nonFallEstablished !== false
    || report.truthBoundary?.independentOutcomeEstablished !== false
    || report.truthBoundary?.independentWitnessEstablished !== false
    || report.truthBoundary?.prospectiveAttemptCensusEstablished !== false
    || report.truthBoundary?.completeHistoricalDatasetCensusEstablished !== false
    || report.truthBoundary?.motorKillSignalIsNotAnOutcomeLabel !== true
    || report.truthBoundary?.historicalTelemetryIsNotAnOutsiderExecutionAttempt !== true) {
    fail("REPORT_TRUTH_BOUNDARY_INVALID");
  }
  for (const key of ["opportunityCensus", "delegationAuthorization", "outcome",
    "recovery", "longitudinal"]) {
    if (report.segments?.[key]?.covered !== false
      || report.segments[key].units !== 0 || report.segments[key].source !== null) {
      fail("REPORT_SEGMENT_BOUNDARY_INVALID", key);
    }
  }
  if (report.segments?.actionTrace?.covered !== false
    || report.segments?.actionTrace?.units !== 0
    || report.segments?.actionTrace?.prospectiveOutsiderActionAuthorityEstablished !== false
    || report.segments?.effect?.covered !== false || report.segments?.effect?.units !== 0
    || report.segments?.effect?.effectTruthEstablished !== false
    || report.rights?.publisherDatasetLicenseClaim !== null
    || report.rights?.status !== "FAIL_CLOSED_NO_DATASET_LICENSE"
    || report.rights?.repositoryCodeLicenseAppliedToDatasetBytes !== false
    || report.rights?.redistributionAuthorizedByArtifact !== false
    || report.rights?.productionTrainingAuthorizedByOutsider !== false
    || report.privacy?.noPiiGuaranteed !== false
    || report.privacy?.networkProjectionAllowed !== false
    || report.useBoundary?.status !== "QUARANTINE_EVAL_ONLY"
    || report.useBoundary?.productionTrainingAuthorizedByArtifact !== false
    || report.useBoundary?.modelUpdateRows !== 0
    || report.useBoundary?.governedTrainingRows !== 0
    || report.network?.publicDeploymentReady !== false
    || report.network?.networkAdmissionRows !== 0
    || report.network?.networkSubmissionPerformed !== false
    || report.economics?.CEU !== 0 || report.economics?.pricingUnits !== 0
    || report.authority?.executionAuthorityEstablished !== false
    || report.authority?.delegationAuthorityEstablished !== false
    || report.authority?.physicalSafetyEstablished !== false
    || report.authority?.productionUseAuthorized !== false
    || report.authority?.authorityUnits !== 0) fail("REPORT_AUTHORITY_OR_USE_BOUNDARY_INVALID");
  return report;
}

export function verifyDigitHardwareFaultReport(report) {
  try { validateReportBody(report); return Object.freeze({ ok: true,
    verificationLevel: "SELF_SEALED_REPORT_ONLY", artifactHash: report.artifactHash }); }
  catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function verifyDigitHardwareFaultReportWithSource(report, sourceDirectory, options = {}) {
  try {
    validateReportBody(report);
    const rebuilt = buildDigitHardwareFaultReportFromSource(sourceDirectory, options);
    if (!same(rebuilt, report)) fail("FULL_REPLAY_REPORT_MISMATCH");
    return Object.freeze({ ok: true, verificationLevel: "FULL_BOUNDED_SOURCE_REDERIVED",
      artifactHash: report.artifactHash, traces: 14,
      safeUnsafeClassificationEstablished: false, independentOutcomeEstablished: false,
      recoveryEstablished: false, authorityEstablished: false });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function buildDigitHardwareFaultReceipt(report, reportBytes) {
  validateReportBody(report);
  if (!Buffer.isBuffer(reportBytes)
    || !reportBytes.equals(canonicalBytes(report))) fail("RECEIPT_REPORT_BYTES_INVALID");
  const body = { schema: DIGIT_RECEIPT_SCHEMA, createdAt: DIGIT_FROZEN_AT,
    reportSchema: DIGIT_REPORT_SCHEMA, artifactHash: report.artifactHash,
    reportFileSha256: digitSha256(reportBytes),
    sourceManifestHash: report.source.manifestHash,
    sourceManifestFileSha256: report.source.manifestFileSha256,
    sourceRoot: report.source.sourceRoot,
    historicalTraceClass: report.denominators.historicalTraces.class,
    historicalTraces: 14, publisherNumericLabelZeroTraces: 14,
    safeUnsafeClassificationEstablished: false,
    independentOutcomeEstablished: false, recoveryEstablished: false,
    trainingRows: 0, networkAdmissionRows: 0, CEU: 0,
    pricingUnits: 0, authorityUnits: 0 };
  return Object.freeze({ ...body,
    receiptHash: digitDigest(body, `${DIGIT_RECEIPT_SCHEMA}/receipt`) });
}

export function verifyDigitHardwareFaultReceipt(receipt, report, reportBytes) {
  try {
    const expected = buildDigitHardwareFaultReceipt(report, reportBytes);
    if (!same(receipt, expected)) fail("RECEIPT_MISMATCH");
    return Object.freeze({ ok: true, receiptHash: receipt.receiptHash });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export function publishDigitHardwareFaultArtifactDirectory(stagingDirectory,
  targetDirectory) {
  const staging = path.resolve(stagingDirectory);
  const target = path.resolve(targetDirectory);
  if (staging === target || target === path.parse(target).root || existsSync(target)) {
    fail("PUBLISH_TARGET_CLAIM_FAILED", target);
  }
  const entries = sorted(readdirSync(staging));
  if (!same(entries, ["report.json", "run-receipt.json", "source"])) {
    fail("PUBLISH_STAGING_LAYOUT_INVALID");
  }
  try { mkdirSync(target, { mode: 0o700 }); }
  catch { fail("PUBLISH_TARGET_CLAIM_FAILED", target); }
  chmodSync(target, 0o700);
  try {
    renameSync(path.join(staging, "source"), path.join(target, "source"));
    renameSync(path.join(staging, "report.json"), path.join(target, "report.json"));
    /* Receipt is the artifact-completion marker and moves last. */
    renameSync(path.join(staging, "run-receipt.json"),
      path.join(target, "run-receipt.json"));
    rmdirSync(staging);
  } catch { fail("PUBLISH_INCOMPLETE", target); }
  return target;
}

export function verifyDigitHardwareFaultArtifactDirectory(artifactDirectory, options = {}) {
  try {
    const root = path.resolve(artifactDirectory);
    const snapshots = [];
    requireDirectory(root, ["report.json", "run-receipt.json", "source"], snapshots);
    const reportBytes = readPrivateStable(root, "report.json", snapshots,
      null, MAX_EXTRACTOR_OUTPUT_BYTES);
    const receiptBytes = readPrivateStable(root, "run-receipt.json", snapshots,
      null, 2 * 1024 * 1024);
    const report = parseJson(reportBytes, "ARTIFACT_REPORT_JSON_INVALID");
    const receipt = parseJson(receiptBytes, "ARTIFACT_RECEIPT_JSON_INVALID");
    const replay = verifyDigitHardwareFaultReportWithSource(report,
      path.join(root, "source"), options);
    if (!replay.ok) fail("ARTIFACT_SOURCE_REPLAY_INVALID", replay.error);
    const receiptReplay = verifyDigitHardwareFaultReceipt(receipt, report, reportBytes);
    if (!receiptReplay.ok) fail("ARTIFACT_RECEIPT_INVALID", receiptReplay.error);
    recheckSnapshots(snapshots);
    return Object.freeze({ ok: true,
      verificationLevel: "FULL_BOUNDED_SOURCE_REDERIVED",
      artifactHash: report.artifactHash, receiptHash: receipt.receiptHash,
      historicalTraces: 14, safeUnsafeClassificationEstablished: false,
      recoveryEstablished: false, trainingRows: 0, networkAdmissionRows: 0,
      CEU: 0, pricingUnits: 0, authorityUnits: 0 });
  } catch (error) { return Object.freeze({ ok: false, error: safeError(error) }); }
}

export const DIGIT_HARDWARE_FAULT_CONSTANTS = Object.freeze({
  archiveBytes: DIGIT_ARCHIVE_BYTES,
  archiveLfsSha256: DIGIT_ARCHIVE_LFS_SHA256,
  selectedCompressedBytes: 111_676_259,
  selectedUncompressedBytes: 262_933_275,
  selectedObjects: 9,
  historicalTraces: 14,
  publisherNumericLabel: 0,
  safeTraces: null,
  unsafeTraces: null,
  recoveryUnits: 0,
  trainingRows: 0,
  networkAdmissionRows: 0,
  CEU: 0,
  pricingUnits: 0,
  authorityUnits: 0,
});
