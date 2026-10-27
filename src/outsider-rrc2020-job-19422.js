/*
 * Fixed official Real Robot Challenge 2020 intake for one complete physical
 * TriFinger run (job 19422).  The 299,208,343-byte Zarr ZIP is acquired with
 * strict HTTP ranges and resumable chunk receipts.  SQLite, ZIP and Zarr are
 * replayed as data only; the publisher's query helper and every possible code
 * or pickle payload remain inert.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, readSync, readdirSync, renameSync, rmSync, statSync, writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { canonicalizeStrict } from "./canonical.js";

export const RRC2020_JOB_ID = 19422;
export const RRC2020_FROZEN_AT = "2026-08-29T00:00:00.000Z";
export const RRC2020_SOURCE_SCHEMA = "outsider/rrc2020-job-source/v1";
export const RRC2020_ARTIFACT_SCHEMA = "outsider/rrc2020-job/v1";
export const RRC2020_PROFILE = Object.freeze({
  pageBytes: 25_684,
  indexBytes: 1_695_744,
  indexPages: 414,
  indexPageSize: 4096,
  jobs: 10_278,
  phase2Jobs: 2_856,
  phase3Jobs: 7_422,
  queryHelperBytes: 7_467,
  queryHelperSha256:
    "sha256:7978bef3ad8ec46d648c27c7eecce8eb33b48ff3732518321d702fca0b011e64",
  zarrZipBytes: 299_208_343,
  zarrEtag: "\"61456ede-11d58e97\"",
  zarrLastModified: "Sat, 18 Sep 2021 04:45:18 GMT",
  indexEtag: "\"61444c79-19e000\"",
  indexLastModified: "Fri, 17 Sep 2021 08:06:17 GMT",
});

const PAGE_URL = "https://people.tuebingen.mpg.de/mpi-is-software/data/rrc2020/";
const INDEX_URL = "https://download.is.tue.mpg.de/rrc2020/rrc2020_dataset_index.db";
const QUERY_URL = "https://download.is.tue.mpg.de/rrc2020/rrc_dataset_query.py";
const ZARR_URL = "https://download.is.tue.mpg.de/rrc2020/zarr/19422.zip";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const FETCH_ATTEMPTS = 6;
const RANGE_CONCURRENCY = 64;
const INDEX_CHUNK_BYTES = 256 * 1024;
const ZARR_CHUNK_BYTES = 512 * 1024;

function fail(code, detail = null) {
  throw new Error(detail === null ? `RRC2020_${code}` : `RRC2020_${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function rrc2020Sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return rrc2020Sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function safeRelative(value) {
  return typeof value === "string" && value.length > 0 && value.length < 4096
    && !value.startsWith("/") && !value.includes("\\") && !value.includes("\0")
    && value.split("/").every((part) => part !== "" && part !== "."
      && part !== "..");
}

function safeJoin(root, relative) {
  if (!safeRelative(relative)) fail("PATH_REFUSED", String(relative));
  const base = path.resolve(root);
  const joined = path.resolve(base, relative);
  const rel = path.relative(base, joined);
  if (rel === "" || rel === ".." || rel.startsWith(`..${path.sep}`)
    || path.isAbsolute(rel)) fail("PATH_ESCAPE", relative);
  return joined;
}

function permittedUrl(value) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === ""
      && parsed.password === "" && ["people.tuebingen.mpg.de",
        "download.is.tue.mpg.de"].includes(parsed.hostname);
  } catch { return false; }
}

function retryable(error) {
  return error?.name === "AbortError" || error?.retryable === true
    || /(?:fetch failed|network|timed out|timeout|ECONN|ENOTFOUND|EAI_AGAIN|terminated|socket|other side closed)/iu
      .test(String(error?.message ?? error));
}

function headersObject(headers) {
  const result = {};
  if (headers && typeof headers.entries === "function") {
    for (const [name, value] of headers.entries()) result[name.toLowerCase()] = value;
  }
  return result;
}

async function fetchOnce(url, options, fetchImpl) {
  if (!permittedUrl(url)) fail("URL_REFUSED", url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 180_000);
  try {
    const response = await fetchImpl(url, {
      method: options.method ?? "GET", redirect: "follow", signal: controller.signal,
      headers: { Accept: options.accept ?? "*/*", "Accept-Encoding": "identity",
        "User-Agent": "outsider-source-intake/1", ...(options.headers ?? {}) },
    });
    if (!response || typeof response.arrayBuffer !== "function") {
      fail("FETCH_RESPONSE_INVALID");
    }
    if (!options.expectedStatuses.includes(response.status)) {
      const error = new Error(`HTTP_${response.status}`);
      error.retryable = response.status === 408 || response.status === 425
        || response.status === 429 || response.status >= 500;
      throw error;
    }
    const declaredText = response.headers?.get?.("content-length");
    const declared = declaredText === null ? null : Number(declaredText);
    if (Number.isFinite(declared) && declared > options.maximumBytes) {
      fail("CONTENT_LENGTH_EXCEEDED", String(declared));
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > options.maximumBytes) fail("BODY_BYTES_EXCEEDED", String(bytes.length));
    const finalUrl = response.url || url;
    if (!permittedUrl(finalUrl)) fail("FINAL_URL_REFUSED", finalUrl);
    return { status: response.status, finalUrl, bytes,
      headers: headersObject(response.headers) };
  } finally { clearTimeout(timer); }
}

async function boundedFetch(url, options, fetchImpl) {
  let last;
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt += 1) {
    try { return await fetchOnce(url, options, fetchImpl); }
    catch (error) {
      last = error;
      if (!retryable(error) || attempt === FETCH_ATTEMPTS - 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 750 * (2 ** attempt)));
    }
  }
  throw last;
}

function ensureDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", directory);
  chmodSync(directory, 0o700);
}

function writePrivate(file, bytes, stable = true) {
  ensureDirectory(path.dirname(file));
  const value = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (existsSync(file)) {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) fail("FILE_UNSAFE", file);
    if (stable && !readFileSync(file).equals(value)) fail("CHECKPOINT_MISMATCH", file);
  } else writeFileSync(file, value, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

function writeCanonical(file, value, stable = true) {
  writePrivate(file, canonicalBytes(value), stable);
}

function enforcePrivateTree(root) {
  const stat = lstatSync(root);
  if (stat.isSymbolicLink() || !stat.isDirectory()) fail("DIRECTORY_UNSAFE", root);
  chmodSync(root, 0o700);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", child);
    if (entry.isDirectory()) enforcePrivateTree(child);
    else if (entry.isFile()) chmodSync(child, 0o600);
    else fail("SPECIAL_FILE_REFUSED", child);
  }
}

function hashFile(file) {
  const hash = createHash("sha256");
  const handle = openSync(file, "r");
  const buffer = Buffer.allocUnsafe(4 * 1024 * 1024);
  try {
    let offset = 0;
    for (;;) {
      const count = readSync(handle, buffer, 0, buffer.length, offset);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      offset += count;
    }
  } finally { closeSync(handle); }
  return `sha256:${hash.digest("hex")}`;
}

function scanFiles(root, excluded = new Set()) {
  const files = [];
  const directories = [root];
  for (let index = 0; index < directories.length; index += 1) {
    for (const entry of readdirSync(directories[index], { withFileTypes: true })) {
      const child = path.join(directories[index], entry.name);
      const relative = path.relative(root, child).split(path.sep).join("/");
      if (excluded.has(relative)) continue;
      if (entry.isSymbolicLink()) fail("SYMLINK_REFUSED", relative);
      if (entry.isDirectory()) directories.push(child);
      else if (entry.isFile()) files.push({ path: relative, bytes: statSync(child).size,
        sha256: hashFile(child) });
      else fail("SPECIAL_FILE_REFUSED", relative);
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function mapConcurrent(values, concurrency, operation) {
  const results = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) },
    async () => {
      while (cursor < values.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await operation(values[index], index);
      }
    }));
  return results;
}

function expectedProfile(key) {
  if (key.startsWith("index-")) return { bytes: RRC2020_PROFILE.indexBytes,
    etag: RRC2020_PROFILE.indexEtag,
    lastModified: RRC2020_PROFILE.indexLastModified };
  if (key === "job-19422") return { bytes: RRC2020_PROFILE.zarrZipBytes,
    etag: RRC2020_PROFILE.zarrEtag,
    lastModified: RRC2020_PROFILE.zarrLastModified };
  fail("RANGE_PROFILE_UNKNOWN", key);
}

async function headProfile(url, key, fetchImpl) {
  const expected = expectedProfile(key);
  const response = await boundedFetch(url, { method: "HEAD", maximumBytes: expected.bytes,
    expectedStatuses: [200], accept: "*/*" }, fetchImpl);
  const size = Number(response.headers["content-length"]);
  if (size !== expected.bytes || response.headers.etag !== expected.etag
    || response.headers["last-modified"] !== expected.lastModified
    || !/bytes/iu.test(response.headers["accept-ranges"] ?? "")) {
    fail("HEAD_PROFILE_INVALID", key);
  }
  return { requestUrl: url, status: response.status, finalUrl: response.finalUrl,
    contentLength: size, etag: response.headers.etag,
    lastModified: response.headers["last-modified"],
    acceptRanges: response.headers["accept-ranges"], headers: response.headers };
}

async function acquireRangeFile(url, key, relative, work, chunkBytes, fetchImpl) {
  const profile = expectedProfile(key);
  const target = safeJoin(work, relative);
  const headPath = safeJoin(work, `http/${key}.head.json`);
  const rangeLogPath = safeJoin(work, `http/${key}.ranges.json`);
  const head = await headProfile(url, key, fetchImpl);
  if (existsSync(target) && existsSync(headPath) && existsSync(rangeLogPath)) {
    if (statSync(target).size !== profile.bytes) fail("COMPLETED_SIZE_INVALID", key);
    const existingHead = JSON.parse(readFileSync(headPath, "utf8"));
    const ranges = JSON.parse(readFileSync(rangeLogPath, "utf8"));
    if (existingHead.contentLength !== profile.bytes || existingHead.etag !== profile.etag
      || !Array.isArray(ranges.ranges)) fail("COMPLETED_HTTP_INVALID", key);
    return { key, relative, bytes: profile.bytes, sha256: hashFile(target), head,
      chunks: ranges.ranges.length, chunkBytes, rangeLogHash: digest(
        "outsider/rrc2020-range-log/v1", ranges.ranges) };
  }
  writeCanonical(headPath, head, false);
  const ranges = [];
  for (let start = 0, index = 0; start < profile.bytes;
    start += chunkBytes, index += 1) {
    ranges.push({ index, start, end: Math.min(profile.bytes - 1,
      start + chunkBytes - 1) });
  }
  const chunkDirectory = safeJoin(work, `range-checkpoints/${key}`);
  ensureDirectory(chunkDirectory);
  const completed = await mapConcurrent(ranges, RANGE_CONCURRENCY, async (range) => {
    const part = safeJoin(chunkDirectory, `${String(range.index).padStart(4, "0")}.part`);
    const marker = safeJoin(chunkDirectory, `${String(range.index).padStart(4, "0")}.json`);
    if (existsSync(part) && existsSync(marker)) {
      const record = JSON.parse(readFileSync(marker, "utf8"));
      if (record.start !== range.start || record.end !== range.end
        || statSync(part).size !== range.end - range.start + 1
        || hashFile(part) !== record.sha256) fail("RANGE_CHECKPOINT_INVALID", `${key}:${range.index}`);
      return record;
    }
    const response = await boundedFetch(url, {
      maximumBytes: range.end - range.start + 1,
      expectedStatuses: [206], accept: "application/octet-stream",
      headers: { Range: `bytes=${range.start}-${range.end}`, "If-Range": profile.etag },
    }, fetchImpl);
    const contentRange = response.headers["content-range"];
    const expectedRange = `bytes ${range.start}-${range.end}/${profile.bytes}`;
    if (contentRange !== expectedRange || response.bytes.length !== range.end - range.start + 1
      || response.headers.etag !== profile.etag
      || response.headers["last-modified"] !== profile.lastModified) {
      fail("RANGE_RESPONSE_INVALID", `${key}:${range.index}`);
    }
    writePrivate(part, response.bytes);
    const record = { ...range, status: response.status, contentRange,
      contentLength: Number(response.headers["content-length"]),
      etag: response.headers.etag, lastModified: response.headers["last-modified"],
      bytes: response.bytes.length, sha256: rrc2020Sha256(response.bytes) };
    writeCanonical(marker, record);
    return record;
  });
  if (existsSync(target)) fail("ASSEMBLY_TARGET_EXISTS", target);
  ensureDirectory(path.dirname(target));
  const handle = openSync(target, "wx", 0o600);
  try {
    let offset = 0;
    for (const range of completed.sort((left, right) => left.index - right.index)) {
      const part = safeJoin(chunkDirectory, `${String(range.index).padStart(4, "0")}.part`);
      const bytes = readFileSync(part);
      if (bytes.length !== range.bytes || writeSync(handle, bytes, 0, bytes.length, offset)
        !== bytes.length) fail("ASSEMBLY_WRITE_FAILED", `${key}:${range.index}`);
      offset += bytes.length;
    }
    if (offset !== profile.bytes) fail("ASSEMBLY_SIZE_INVALID", key);
    fsyncSync(handle);
  } finally { closeSync(handle); }
  chmodSync(target, 0o600);
  const rangeLog = { schema: "outsider/rrc2020-http-ranges/v1", requestUrl: url,
    contentLength: profile.bytes, etag: profile.etag,
    lastModified: profile.lastModified, chunkBytes, ranges: completed };
  writeCanonical(rangeLogPath, rangeLog);
  rmSync(chunkDirectory, { recursive: true, force: true });
  return { key, relative, bytes: profile.bytes, sha256: hashFile(target), head,
    chunks: completed.length, chunkBytes,
    rangeLogHash: digest("outsider/rrc2020-range-log/v1", completed) };
}

async function acquireDirect(url, relative, work, expectedBytes, expectedHash,
  fetchImpl) {
  const response = await boundedFetch(url, { maximumBytes: expectedBytes,
    expectedStatuses: [200], accept: "text/html,text/plain,application/octet-stream" },
  fetchImpl);
  if (response.bytes.length !== expectedBytes
    || (expectedHash && rrc2020Sha256(response.bytes) !== expectedHash)) {
    fail("DIRECT_PROFILE_INVALID", relative);
  }
  writePrivate(safeJoin(work, relative), response.bytes);
  writeCanonical(safeJoin(work, `http/${relative.replaceAll("/", "-")}.headers.json`), {
    requestUrl: url, status: response.status, finalUrl: response.finalUrl,
    headers: response.headers,
  }, false);
  return { relative, bytes: response.bytes.length,
    sha256: rrc2020Sha256(response.bytes), status: response.status,
    etag: response.headers.etag ?? null,
    lastModified: response.headers["last-modified"] ?? null };
}

const PYTHON_INDEX = String.raw`
import json, sqlite3, sys
p=sys.argv[1]
db=sqlite3.connect("file:"+p+"?mode=ro", uri=True)
db.row_factory=sqlite3.Row
integrity=db.execute("pragma integrity_check").fetchone()[0]
page_size=db.execute("pragma page_size").fetchone()[0]
page_count=db.execute("pragma page_count").fetchone()[0]
tables=[r[0] for r in db.execute("select name from sqlite_master where type='table' order by name")]
columns=[]
for row in db.execute("pragma table_info(jobs)"):
    name=row[1]
    missing=db.execute('select count(*) from jobs where "'+name+'" is null').fetchone()[0]
    columns.append({"cid":row[0],"name":name,"type":row[2],"notNull":bool(row[3]),
                    "default":row[4],"primaryKey":bool(row[5]),"missing":missing})
jobs=db.execute("select count(*) from jobs").fetchone()[0]
phases={str(r[0]):r[1] for r in db.execute("select challenge_phase,count(*) from jobs group by challenge_phase order by challenge_phase")}
row=db.execute("select * from jobs where job_id=19422").fetchone()
if row is None: raise RuntimeError("JOB_MISSING")
info=[dict(r) for r in db.execute("select * from info")]
print(json.dumps({"integrity":integrity,"pageSize":page_size,"pageCount":page_count,
 "tables":tables,"jobs":jobs,"phaseCounts":phases,"columns":columns,
 "selectedJob":dict(row),"info":info},sort_keys=True,separators=(",",":"),allow_nan=False))
`;

export function replayRrc2020Index(indexFile, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const result = spawnSync(python, ["-c", PYTHON_INDEX, path.resolve(indexFile)],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) fail("INDEX_PYTHON_FAILED", result.error.message);
  if (result.status !== 0) fail("INDEX_REPLAY_FAILED",
    String(result.stderr || result.stdout).trim());
  const replay = JSON.parse(result.stdout);
  const row = replay.selectedJob;
  if (replay.integrity !== "ok" || replay.pageSize !== 4096 || replay.pageCount !== 414
    || replay.jobs !== 10_278 || replay.phaseCounts?.["2"] !== 2_856
    || replay.phaseCounts?.["3"] !== 7_422 || row.job_id !== 19_422
    || row.challenge_phase !== 3 || row.robot_name !== "roboch3"
    || row.difficulty_level !== 1) fail("INDEX_PROFILE_INVALID");
  return replay;
}

function pageClaims(bytes) {
  const text = bytes.toString("utf8");
  const claims = {
    title: /Real Robot Challenge 2020 Dataset/iu.test(text),
    physicalRunsIncluded: /individual runs that were executed by the challenge participants/iu
      .test(text),
    actionsObservationsGoalReward: /actions sent to the robot[\s\S]*all observations[\s\S]*goal[\s\S]*reward/iu
      .test(text),
    phase2Count: /2856 runs of phase 2/iu.test(text),
    phase3Count: /7422 runs of phase 3/iu.test(text),
    zarrSameDataClaim: /Zarr storages contain the same data as the tarballs/iu.test(text),
    cameraRobotNotAligned: /camera runs at a lower frequency than the robot[\s\S]*not aligned/iu
      .test(text),
    licenseCcByNcSa4: /creativecommons\.org\/licenses\/by-nc-sa\/4\.0/iu.test(text),
  };
  if (!Object.values(claims).every(Boolean)) fail("PAGE_CLAIMS_DRIFT");
  return claims;
}

function sourceManifestBody(records, indexReplay, sourceFiles) {
  return {
    schema: RRC2020_SOURCE_SCHEMA, frozenAt: RRC2020_FROZEN_AT,
    source: { officialPageUrl: PAGE_URL, indexUrl: INDEX_URL,
      queryHelperUrl: QUERY_URL, zarrUrl: ZARR_URL, jobId: RRC2020_JOB_ID },
    records, indexReplay,
    closure: {
      officialPageCapturedBeforeAndAfter: true,
      sqliteIndexCapturedBeforeAndAfter: true,
      sqliteIndexIntegrity: "ok", sqliteJobs: 10_278,
      completeSourceNativeRun: true, selectedRuns: 1,
      zarrZipBytes: RRC2020_PROFILE.zarrZipBytes,
      queryHelperBytesAcquiredInert: RRC2020_PROFILE.queryHelperBytes,
      rangeCheckpointed: true,
      zarrRangeChunks: records.zarr.chunks,
      indexRangeChunksPerSnapshot: records.indexBefore.chunks,
      globallyExhaustive: false, randomTruncation: false,
      selectionRule: "ONE_COMPLETE_OFFICIAL_RUN_JOB_ID_19422_UNDER_300MB",
    },
    sourceFiles,
    sourceRoot: digest("outsider/rrc2020-job-source-root/v1", sourceFiles),
  };
}

export async function acquirePinnedRrc2020JobSource(sourceDirectory, options = {}) {
  if (existsSync(sourceDirectory)) fail("SOURCE_EXISTS", sourceDirectory);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== "function") fail("FETCH_UNAVAILABLE");
  const work = options.checkpointDirectory ?? `${sourceDirectory}.checkpoint`;
  if (existsSync(work)) {
    const stat = lstatSync(work);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("CHECKPOINT_UNSAFE", work);
  } else mkdirSync(work, { recursive: true, mode: 0o700 });
  enforcePrivateTree(work);
  writeCanonical(safeJoin(work, "source-checkpoint.json"), {
    schema: "outsider/rrc2020-job-source-checkpoint/v1",
    target: path.resolve(sourceDirectory), jobId: RRC2020_JOB_ID,
    zarrEtag: RRC2020_PROFILE.zarrEtag,
  });
  const pageBefore = await acquireDirect(PAGE_URL, "official/page-before.html", work,
    RRC2020_PROFILE.pageBytes, null, fetchImpl);
  const query = await acquireDirect(QUERY_URL, "official/rrc_dataset_query.py", work,
    RRC2020_PROFILE.queryHelperBytes, RRC2020_PROFILE.queryHelperSha256, fetchImpl);
  const indexBefore = await acquireRangeFile(INDEX_URL, "index-before",
    "official/index-before.db", work, INDEX_CHUNK_BYTES, fetchImpl);
  const zarr = await acquireRangeFile(ZARR_URL, "job-19422",
    "official/19422.zip", work, ZARR_CHUNK_BYTES, fetchImpl);
  const indexAfter = await acquireRangeFile(INDEX_URL, "index-after",
    "official/index-after.db", work, INDEX_CHUNK_BYTES, fetchImpl);
  const pageAfter = await acquireDirect(PAGE_URL, "official/page-after.html", work,
    RRC2020_PROFILE.pageBytes, null, fetchImpl);
  if (pageBefore.sha256 !== pageAfter.sha256 || indexBefore.sha256 !== indexAfter.sha256) {
    fail("SOURCE_CHANGED_DURING_ACQUISITION");
  }
  const indexReplay = replayRrc2020Index(safeJoin(work, "official/index-before.db"),
    options);
  const secondIndex = replayRrc2020Index(safeJoin(work, "official/index-after.db"),
    options);
  if (!same(indexReplay, secondIndex)) fail("INDEX_REPLAY_CHANGED");
  const claims = pageClaims(readFileSync(safeJoin(work, "official/page-before.html")));
  rmSync(safeJoin(work, "range-checkpoints"), { recursive: true, force: true });
  rmSync(safeJoin(work, "source-checkpoint.json"), { force: true });
  const sourceFiles = scanFiles(work, new Set(["acquisition-manifest.json"]));
  const records = { pageBefore, pageAfter, query, indexBefore, indexAfter, zarr,
    pageClaims: claims };
  const body = sourceManifestBody(records, indexReplay, sourceFiles);
  const manifest = { ...body,
    manifestHash: digest("outsider/rrc2020-job-source-manifest/v1", body) };
  writeCanonical(safeJoin(work, "acquisition-manifest.json"), manifest);
  enforcePrivateTree(work);
  renameSync(work, sourceDirectory);
  chmodSync(sourceDirectory, 0o700);
  const checked = verifyRrc2020JobSourceDirectory(sourceDirectory, options);
  if (!checked.ok) fail("ACQUIRED_SOURCE_INVALID", checked.error);
  return checked;
}

function readSource(sourceDirectory, relative) {
  const file = safeJoin(sourceDirectory, relative);
  const stat = lstatSync(file);
  if (stat.isSymbolicLink() || !stat.isFile() || (stat.mode & 0o777) !== 0o600) {
    fail("SOURCE_FILE_MODE_INVALID", relative);
  }
  return file;
}

export function verifyRrc2020JobSourceDirectory(sourceDirectory, options = {}) {
  try {
    const root = lstatSync(sourceDirectory);
    if (root.isSymbolicLink() || !root.isDirectory() || (root.mode & 0o777) !== 0o700) {
      fail("SOURCE_DIRECTORY_MODE_INVALID");
    }
    const manifestFile = readSource(sourceDirectory, "acquisition-manifest.json");
    const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
    if (!plain(manifest) || manifest.schema !== RRC2020_SOURCE_SCHEMA
      || manifest.frozenAt !== RRC2020_FROZEN_AT
      || !HASH.test(manifest.manifestHash ?? "")) fail("MANIFEST_SHAPE_INVALID");
    const { manifestHash, ...body } = manifest;
    if (manifestHash !== digest("outsider/rrc2020-job-source-manifest/v1", body)) {
      fail("MANIFEST_HASH_INVALID");
    }
    const actualFiles = scanFiles(sourceDirectory, new Set(["acquisition-manifest.json"]));
    if (!same(actualFiles, manifest.sourceFiles)
      || manifest.sourceRoot !== digest("outsider/rrc2020-job-source-root/v1", actualFiles)) {
      fail("SOURCE_ROOT_INVALID");
    }
    const pageBefore = readFileSync(readSource(sourceDirectory, "official/page-before.html"));
    const pageAfter = readFileSync(readSource(sourceDirectory, "official/page-after.html"));
    if (rrc2020Sha256(pageBefore) !== manifest.records.pageBefore.sha256
      || !pageBefore.equals(pageAfter)
      || !same(pageClaims(pageBefore), manifest.records.pageClaims)) fail("PAGE_INVALID");
    const queryFile = readSource(sourceDirectory, "official/rrc_dataset_query.py");
    if (statSync(queryFile).size !== 7_467 || hashFile(queryFile)
      !== RRC2020_PROFILE.queryHelperSha256) fail("QUERY_HELPER_INVALID");
    const indexBefore = readSource(sourceDirectory, "official/index-before.db");
    const indexAfter = readSource(sourceDirectory, "official/index-after.db");
    if (statSync(indexBefore).size !== RRC2020_PROFILE.indexBytes
      || statSync(indexAfter).size !== RRC2020_PROFILE.indexBytes
      || hashFile(indexBefore) !== hashFile(indexAfter)) fail("INDEX_BYTES_INVALID");
    const indexReplay = replayRrc2020Index(indexBefore, options);
    if (!same(indexReplay, manifest.indexReplay)) fail("INDEX_REPLAY_INVALID");
    const zarr = readSource(sourceDirectory, "official/19422.zip");
    if (statSync(zarr).size !== RRC2020_PROFILE.zarrZipBytes
      || hashFile(zarr) !== manifest.records.zarr.sha256) fail("ZARR_BYTES_INVALID");
    for (const key of ["index-before", "index-after", "job-19422"]) {
      const ranges = JSON.parse(readFileSync(readSource(sourceDirectory,
        `http/${key}.ranges.json`), "utf8"));
      const expected = expectedProfile(key);
      if (ranges.contentLength !== expected.bytes || ranges.etag !== expected.etag
        || ranges.lastModified !== expected.lastModified
        || !Array.isArray(ranges.ranges) || ranges.ranges.length < 1
        || ranges.ranges[0].start !== 0
        || ranges.ranges.at(-1).end !== expected.bytes - 1
        || ranges.ranges.some((row, index) => row.index !== index
          || row.start !== (index === 0 ? 0 : ranges.ranges[index - 1].end + 1)
          || row.status !== 206 || row.contentRange
            !== `bytes ${row.start}-${row.end}/${expected.bytes}`
          || row.bytes !== row.end - row.start + 1
          || row.contentLength !== row.bytes || row.etag !== expected.etag
          || row.lastModified !== expected.lastModified || !HASH.test(row.sha256))) {
        fail("RANGE_LOG_INVALID", key);
      }
    }
    if (manifest.closure?.completeSourceNativeRun !== true
      || manifest.closure?.selectedRuns !== 1
      || manifest.closure?.zarrZipBytes !== 299_208_343
      || manifest.closure?.rangeCheckpointed !== true
      || manifest.closure?.randomTruncation !== false
      || manifest.closure?.globallyExhaustive !== false) fail("CLOSURE_INVALID");
    return { ok: true, manifest, indexReplay,
      verificationLevel: "OFFICIAL_PAGE_INDEX_AND_COMPLETE_RANGE_BOUND_JOB_19422_BYTES" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const PYTHON_ZARR_REPLAY = String.raw`
import ctypes, hashlib, itertools, json, math, os, struct, sys, zipfile, zlib
import numpy as np

root=os.path.realpath(sys.argv[1])
archive_path=os.path.join(root,"official","19422.zip")
library_path=os.path.realpath(sys.argv[2])
if not os.path.isfile(library_path): raise RuntimeError("BLOSC_LIBRARY_MISSING")
lib=ctypes.CDLL(library_path)
lib.blosc_decompress.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_size_t]
lib.blosc_decompress.restype=ctypes.c_int

def die(code,detail=""):
    raise RuntimeError("RRC2020_ZARR_"+code+(":"+detail if detail else ""))

def decode_blosc(payload,name):
    if len(payload)<16: die("BLOSC_HEADER",name)
    version,codec_version,flags,typesize,nbytes,blocksize,cbytes=struct.unpack_from("<BBBBIII",payload,0)
    if version not in (1,2) or cbytes!=len(payload) or nbytes<0 or nbytes>512*1024*1024:
        die("BLOSC_PROFILE",name)
    target=ctypes.create_string_buffer(nbytes)
    result=lib.blosc_decompress(ctypes.c_char_p(payload),target,nbytes)
    if result!=nbytes: die("BLOSC_DECOMPRESS",name+":"+str(result))
    return target,{"version":version,"codecVersion":codec_version,
      "flags":flags,"typeSize":typesize,"uncompressedBytes":nbytes,
      "blockSize":blocksize,"compressedBytes":cbytes}

with zipfile.ZipFile(archive_path,"r") as archive:
    infos=archive.infolist()
    names=[x.filename for x in infos]
    if len(names)!=len(set(names)): die("DUPLICATE_NAMES")
    metadata={}
    for info in infos:
        if info.filename.endswith((".zarray",".zattrs",".zgroup")) \
           or info.filename==".zmetadata":
            metadata[info.filename]=json.loads(archive.read(info))
    arrays={name[:-8].rstrip("/"):value for name,value in metadata.items()
            if name.endswith(".zarray")}
    attrs=metadata.get(".zattrs")
    if metadata.get(".zgroup")!={"zarr_format":2} or not isinstance(attrs,dict):
        die("ROOT_METADATA")
    if not arrays: die("ARRAYS_EMPTY")
    for name,meta in arrays.items():
        if meta.get("zarr_format")!=2 or meta.get("order") not in ("C","F") \
           or meta.get("filters") is not None or meta.get("compressor",{}).get("id")!="blosc" \
           or meta.get("compressor",{}).get("cname")!="lz4":
            die("ARRAY_CODEC",name)
        dtype=np.dtype(meta["dtype"])
        if dtype.kind not in "biuf": die("ARRAY_DTYPE",name+":"+str(dtype))
        if len(meta["shape"])!=len(meta["chunks"]) or not meta["shape"]:
            die("ARRAY_SHAPE",name)

    array_entries={name:{} for name in arrays}
    metadata_names=set(metadata)
    group_names={name for name in metadata if name.endswith(".zgroup")}
    unknown=[]
    executable=[]
    central=local=crc_count=0
    compressed_zip_bytes=uncompressed_zip_bytes=0
    for info in infos:
        if info.flag_bits&1: die("ZIP_ENCRYPTED",info.filename)
        if info.filename.startswith("/") or ".." in info.filename.split("/"):
            die("ZIP_PATH",info.filename)
        with open(archive_path,"rb") as handle:
            handle.seek(info.header_offset)
            local_header=handle.read(30)
            if len(local_header)!=30 or local_header[:4]!=b"PK\x03\x04":
                die("LOCAL_SIGNATURE",info.filename)
            fields=struct.unpack("<IHHHHHIIIHH",local_header)
            flags,method=fields[2],fields[3]
            local_crc,local_comp,local_size=fields[6],fields[7],fields[8]
            name_len,extra_len=fields[9],fields[10]
            local_name=handle.read(name_len).decode("utf-8")
            handle.read(extra_len)
            if local_name!=info.filename or flags!=info.flag_bits or method!=info.compress_type:
                die("LOCAL_CENTRAL",info.filename)
            if not (flags&8) and (local_crc!=info.CRC or local_comp!=info.compress_size \
                                  or local_size!=info.file_size):
                die("LOCAL_SIZES",info.filename)
        payload=archive.read(info)
        check=zlib.crc32(payload)&0xffffffff
        if len(payload)!=info.file_size or check!=info.CRC:
            die("CRC",info.filename)
        central+=1;local+=1;crc_count+=1
        compressed_zip_bytes+=info.compress_size;uncompressed_zip_bytes+=info.file_size
        if info.filename.lower().endswith((".py",".pyc",".p",".pkl",".pickle",".so",".dylib",".exe",".sh")):
            executable.append(info.filename)
        if info.filename in metadata_names or info.filename in group_names or info.is_dir():
            continue
        matched=False
        for array_name in arrays:
            prefix=array_name+"/" if array_name else ""
            if info.filename.startswith(prefix):
                suffix=info.filename[len(prefix):]
                if suffix and all(part.isdigit() for part in suffix.split(".")):
                    coords=tuple(int(part) for part in suffix.split("."))
                    array_entries[array_name][coords]=(info,payload)
                    matched=True
                    break
        if not matched: unknown.append(info.filename)
    if unknown: die("UNKNOWN_MEMBERS",unknown[0])

    reports=[]
    collected={}
    total_values=total_nan=total_inf=total_chunk_entries=0
    decoded_bytes_total=0
    for name in sorted(arrays):
        meta=arrays[name]
        shape=tuple(int(x) for x in meta["shape"])
        chunks=tuple(int(x) for x in meta["chunks"])
        dtype=np.dtype(meta["dtype"])
        grid=tuple(int(math.ceil(size/chunk)) for size,chunk in zip(shape,chunks))
        expected=list(itertools.product(*(range(size) for size in grid)))
        entries=array_entries[name]
        if set(entries)!=set(expected): die("CHUNK_CENSUS",name)
        value_hash=hashlib.sha256()
        values=nan_count=inf_count=0
        chunk_profiles={}
        collect=name in {"time_index","timestamp","image_timestamps","map_robot_to_camera_index"}
        collected_values=[]
        for coords in expected:
            info,payload=entries[coords]
            decoded,blosc=decode_blosc(payload,info.filename)
            full_elems=math.prod(chunks)
            if len(decoded)!=full_elems*dtype.itemsize: die("CHUNK_BYTES",info.filename)
            block=np.frombuffer(decoded,dtype=dtype).reshape(chunks,order=meta["order"])
            slices=tuple(slice(0,min(chunk,shape[axis]-coords[axis]*chunk))
                         for axis,chunk in enumerate(chunks))
            logical=np.ascontiguousarray(block[slices])
            value_hash.update(memoryview(logical).cast("B"))
            values+=logical.size
            if dtype.kind=="f":
                nan_count+=int(np.isnan(logical).sum())
                inf_count+=int(np.isinf(logical).sum())
            if collect: collected_values.extend(logical.reshape(-1).tolist())
            key=json.dumps(blosc,sort_keys=True,separators=(",",":"))
            chunk_profiles[key]=chunk_profiles.get(key,0)+1
            decoded_bytes_total+=len(decoded)
        if values!=math.prod(shape): die("LOGICAL_VALUES",name)
        if collect: collected[name]=collected_values
        reports.append({"name":name,"shape":list(shape),"chunks":list(chunks),
          "grid":list(grid),"dtype":dtype.str,"order":meta["order"],
          "compressor":meta["compressor"],"chunkEntries":len(entries),
          "logicalValues":values,"nanCount":nan_count,"infCount":inf_count,
          "decodedValueHash":"sha256:"+value_hash.hexdigest(),
          "bloscChunkProfiles":chunk_profiles})
        total_values+=values;total_nan+=nan_count;total_inf+=inf_count
        total_chunk_entries+=len(entries)

time_index=collected.get("time_index",[])
timestamps=collected.get("timestamp",[])
mapping=collected.get("map_robot_to_camera_index",[])
image_timestamps=collected.get("image_timestamps",[])
if len(time_index)!=120000 or len(timestamps)!=120000 or len(mapping)!=120000:
    die("ROBOT_SEQUENCE_LENGTH")
time_index_int=[int(x) for x in time_index]
time_index_strict=all(b>a for a,b in zip(time_index_int,time_index_int[1:]))
timestamp_finite=all(math.isfinite(float(x)) for x in timestamps)
timestamp_monotonic=all(b>=a for a,b in zip(timestamps,timestamps[1:]))
image_timestamp_finite=all(math.isfinite(float(x)) for x in image_timestamps)
image_count=next((r["shape"][0] for r in reports if r["name"]=="images"),None)
mapping_int=[int(x) for x in mapping]
mapping_in_range=image_count is not None and all(-1<=x<image_count for x in mapping_int)

for required in ["camera_matrices","distortion_coefficients","tf_world_to_cameras",
 "time_index","timestamp","observation/position","observation/velocity",
 "observation/torque","desired_action/torque","applied_action/torque",
 "map_robot_to_camera_index","image_timestamps","images",
 "object_pose/position","object_pose/orientation","object_pose/confidence",
 "filtered_object_pose/position","filtered_object_pose/orientation",
 "filtered_object_pose/confidence"]:
    if required not in arrays: die("REQUIRED_ARRAY",required)

metrics=attrs.get("metrics",{})
goal=attrs.get("goal")
if attrs.get("robot_name")!="roboch3" or not isinstance(goal,dict) \
   or abs(metrics.get("cumulative_reward",0)-(-1091.5548254253654))>1e-12:
    die("ATTRIBUTES")

print(json.dumps({
 "zip":{"entries":len(infos),"centralEntriesValidated":central,
        "localHeadersValidated":local,"crcMembersValidated":crc_count,
        "compressedMemberBytes":compressed_zip_bytes,
        "uncompressedMemberBytes":uncompressed_zip_bytes,
        "unsafePaths":0,"encryptedMembers":0},
 "zarr":{"format":2,"groups":len(group_names),"arrays":len(reports),
         "metadataDocuments":len(metadata),"chunkEntries":total_chunk_entries,
         "logicalValues":total_values,"decodedChunkBytes":decoded_bytes_total,
         "nanCount":total_nan,"infCount":total_inf,"arrayReports":reports,
         "unknownMembers":0,"allExpectedChunksPresent":True},
 "attributes":attrs,
 "sequences":{"robotSteps":len(time_index),"timeIndexStrictlyIncreasing":time_index_strict,
              "timestampsFinite":timestamp_finite,"timestampsMonotonic":timestamp_monotonic,
              "cameraFrames":image_count,"imageTimestampValues":len(image_timestamps),
              "imageTimestampsFinite":image_timestamp_finite,
              "robotToCameraMapRows":len(mapping),"robotToCameraMapInRange":mapping_in_range},
 "safety":{"sourceExecutableMembers":executable,"sourcePayloadsExecuted":0,
           "picklePayloadsExecuted":0,"publisherQueryHelperExecuted":0,
           "cameraPixelsProjectedInReport":False},
 "decoder":{"name":"LOCAL_LIBBLOSC_DATA_DECODER","librarySha256":"sha256:"+
            hashlib.sha256(open(library_path,"rb").read()).hexdigest()}
},sort_keys=True,separators=(",",":"),allow_nan=False))
`;

function defaultBloscLibrary() {
  const libraryRoot = path.resolve(".venv/lib");
  if (!existsSync(libraryRoot)) fail("BLOSC_LIBRARY_ROOT_MISSING");
  for (const pythonDirectory of readdirSync(libraryRoot)) {
    if (!pythonDirectory.startsWith("python")) continue;
    const plugins = path.join(libraryRoot, pythonDirectory,
      "site-packages/hdf5plugin/plugins");
    if (!existsSync(plugins)) continue;
    const candidate = readdirSync(plugins).find((name) =>
      /^libh5blosc\.(?:dylib|so)$/u.test(name));
    if (candidate) return path.join(plugins, candidate);
  }
  fail("BLOSC_LIBRARY_MISSING");
}

export function runRrc2020JobReplay(sourceDirectory, options = {}) {
  const python = options.pythonExecutable ?? ".venv/bin/python";
  const library = options.bloscLibrary ?? defaultBloscLibrary();
  const result = spawnSync(python, ["-c", PYTHON_ZARR_REPLAY,
    path.resolve(sourceDirectory), path.resolve(library)], {
    encoding: "utf8", maxBuffer: 128 * 1024 * 1024,
  });
  if (result.error) fail("ZARR_PYTHON_FAILED", result.error.message);
  if (result.status !== 0) fail("ZARR_REPLAY_FAILED",
    String(result.stderr || result.stdout).trim());
  const replay = JSON.parse(result.stdout);
  if (replay.zip?.entries < 1
    || replay.zip?.centralEntriesValidated !== replay.zip.entries
    || replay.zip?.localHeadersValidated !== replay.zip.entries
    || replay.zip?.crcMembersValidated !== replay.zip.entries
    || replay.zarr?.arrays < 1 || replay.zarr?.chunkEntries < 1
    || replay.zarr?.allExpectedChunksPresent !== true
    || replay.sequences?.robotSteps !== 120_000
    || replay.sequences?.robotToCameraMapRows !== 120_000
    || replay.safety?.sourcePayloadsExecuted !== 0
    || replay.safety?.picklePayloadsExecuted !== 0) fail("ZARR_RESULT_INVALID");
  return replay;
}

function metricAgreement(index, attrs) {
  const pairs = {
    baseline_reward: "baseline_reward",
    cumulative_reward: "cumulative_reward",
    furthest_from_start: "furthest_from_start",
    initial_distance_to_goal: "initial_distance_to_goal",
    max_height: "max_height",
    min_distance_to_goal: "min_distance_to_goal",
  };
  const differences = {};
  for (const [databaseKey, attributeKey] of Object.entries(pairs)) {
    const difference = Math.abs(index[databaseKey] - attrs[attributeKey]);
    if (!Number.isFinite(difference) || difference > 1e-12) {
      fail("METRIC_CROSSWALK_INVALID", databaseKey);
    }
    differences[databaseKey] = difference;
  }
  return { fields: Object.keys(pairs), maximumAbsoluteDifference:
    Math.max(...Object.values(differences)), allWithin1eMinus12: true };
}

function artifactBody(verified, replay) {
  const indexJob = verified.indexReplay.selectedJob;
  const metrics = replay.attributes.metrics;
  return {
    schema: RRC2020_ARTIFACT_SCHEMA, frozenAt: RRC2020_FROZEN_AT,
    status: "COMPLETE_OFFICIAL_PHYSICAL_TRIFINGER_RUN_REPLAYED",
    admission: "QUARANTINE_EVAL_ONLY",
    source: { jobId: RRC2020_JOB_ID,
      sourceManifestHash: verified.manifest.manifestHash,
      sourceRoot: verified.manifest.sourceRoot,
      closure: verified.manifest.closure },
    index: verified.indexReplay,
    replay,
    metricCrosswalk: metricAgreement(indexJob, metrics),
    runSemantics: {
      publisherPhysicalTriFingerRunEstablished: true,
      challengePhase: 3, robotName: "roboch3", difficultyLevel: 1,
      completeActionSequencePresent: true,
      completeRobotObservationSequencePresent: true,
      completeCameraSequencePresent: true,
      goalAttributePresent: true,
      officialHarnessMetricsPresent: true,
      publisherEvaluatorOutcomePresent: true,
      independentThirdPartyOutcomePresent: false,
      recoveryFieldPresent: false,
      recoveryEstablished: false,
      delegationPresent: false,
      longitudinalIdentityEstablished: false,
      completeAttemptCensusEstablished: false,
    },
    outcome: {
      cumulativeReward: metrics.cumulative_reward,
      baselineReward: metrics.baseline_reward,
      initialDistanceToGoal: metrics.initial_distance_to_goal,
      minimumDistanceToGoal: metrics.min_distance_to_goal,
      maximumHeight: metrics.max_height,
      furthestFromStart: metrics.furthest_from_start,
      source: "OFFICIAL_RRC_HARNESS_ATTRIBUTES_AND_INDEX",
      independentlyWitnessedByThirdParty: false,
      binarySuccessInferred: false,
      recoveryInferred: false,
    },
    rights: {
      officialDatasetLicense: "CC BY-NC-SA 4.0",
      commercialUseRestricted: true,
      shareAlikeConditionPresent: true,
      productionTrainingAuthorized: false,
      legalAuthorityEstablished: false,
      evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    },
    privacy: {
      rawArtifactPrivate: true, directoryMode: "0700", fileMode: "0600",
      physicalCameraFramesPresent: true,
      cameraPixelsProjectedInReport: false,
      privacyReviewComplete: false, noPiiGuaranteed: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    boundary: { privacy: 0, training: 0, network: 0, authority: 0, CEU: 0,
      action: 1, delegation: 0, reliableOutcome: 1, independentOutcome: 0,
      recovery: 0, externalEffect: 1 },
  };
}

export function rrc2020ArtifactHash(body) {
  return digest("outsider/rrc2020-job-19422/v1", body);
}

export function buildRrc2020JobArtifactFromSource(sourceDirectory, options = {}) {
  const verified = verifyRrc2020JobSourceDirectory(sourceDirectory, options);
  if (!verified.ok) fail("SOURCE_VERIFICATION_FAILED", verified.error);
  const replay = runRrc2020JobReplay(sourceDirectory, options);
  const body = artifactBody(verified, replay);
  const artifact = { ...body, artifactHash: rrc2020ArtifactHash(body) };
  const checked = verifyRrc2020JobArtifact(artifact);
  if (!checked.ok) fail("ARTIFACT_BUILD_INVALID", checked.error);
  return artifact;
}

export function verifyRrc2020JobArtifact(artifact) {
  try {
    if (!plain(artifact) || artifact.schema !== RRC2020_ARTIFACT_SCHEMA
      || artifact.frozenAt !== RRC2020_FROZEN_AT
      || artifact.status !== "COMPLETE_OFFICIAL_PHYSICAL_TRIFINGER_RUN_REPLAYED"
      || artifact.admission !== "QUARANTINE_EVAL_ONLY"
      || !HASH.test(artifact.artifactHash ?? "")) fail("ARTIFACT_SHAPE_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== rrc2020ArtifactHash(body)) fail("ARTIFACT_HASH_INVALID");
    if (artifact.source?.closure?.completeSourceNativeRun !== true
      || artifact.source?.closure?.selectedRuns !== 1
      || artifact.source?.closure?.zarrZipBytes !== 299_208_343
      || artifact.index?.jobs !== 10_278 || artifact.index?.phaseCounts?.["3"] !== 7_422
      || artifact.replay?.sequences?.robotSteps !== 120_000
      || artifact.replay?.zarr?.allExpectedChunksPresent !== true
      || artifact.metricCrosswalk?.allWithin1eMinus12 !== true) {
      fail("ARTIFACT_REPLAY_INVALID");
    }
    if (artifact.runSemantics?.publisherEvaluatorOutcomePresent !== true
      || artifact.runSemantics?.independentThirdPartyOutcomePresent !== false
      || artifact.runSemantics?.recoveryEstablished !== false
      || artifact.runSemantics?.delegationPresent !== false
      || artifact.runSemantics?.completeAttemptCensusEstablished !== false
      || artifact.outcome?.binarySuccessInferred !== false
      || artifact.outcome?.recoveryInferred !== false) fail("OUTCOME_PROMOTION");
    if (artifact.rights?.officialDatasetLicense !== "CC BY-NC-SA 4.0"
      || artifact.rights?.productionTrainingAuthorized !== false
      || artifact.rights?.legalAuthorityEstablished !== false
      || artifact.privacy?.rawArtifactPrivate !== true
      || artifact.privacy?.cameraPixelsProjectedInReport !== false
      || artifact.privacy?.noPiiGuaranteed !== false) fail("GATE_INVALID");
    if (!same(artifact.boundary, { privacy: 0, training: 0, network: 0,
      authority: 0, CEU: 0, action: 1, delegation: 0, reliableOutcome: 1,
      independentOutcome: 0, recovery: 0, externalEffect: 1 })) {
      fail("BOUNDARY_INVALID");
    }
    return { ok: true, artifactHash,
      verificationLevel: "STANDALONE_HASH_OFFICIAL_EVALUATOR_AND_INDEPENDENCE_BOUNDARY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyRrc2020JobArtifactWithSource(artifact, sourceDirectory,
  options = {}) {
  const standalone = verifyRrc2020JobArtifact(artifact);
  if (!standalone.ok) return standalone;
  try {
    const rebuilt = buildRrc2020JobArtifactFromSource(sourceDirectory, options);
    if (!same(rebuilt, artifact)) fail("SOURCE_REBUILD_MISMATCH");
    return { ok: true, artifactHash: artifact.artifactHash,
      sourceManifestHash: artifact.source.sourceManifestHash,
      sourceRoot: artifact.source.sourceRoot,
      verificationLevel:
        "FULL_SQLITE_ZIP_ZARR_ARRAY_CHUNK_ATTRIBUTE_AND_SEQUENCE_REPLAY" };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
