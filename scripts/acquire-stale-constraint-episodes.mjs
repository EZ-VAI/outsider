#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, rmSync, unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  STALE_CONSTRAINT_SOURCE_FILES,
  STALE_CONSTRAINT_SOURCE_URLS,
  STALE_CONSTRAINT_ZENODO_RECORD,
  buildStaleConstraintEpisodeArtifact,
  buildStaleConstraintRunReceipt,
  publishStaleConstraintArtifactDirectory,
  verifyStaleConstraintEpisodeArtifact,
  verifyStaleConstraintRunReceipt,
} from "../src/outsider-stale-constraint-episodes.js";

const DEFAULT_OUTPUT = "artifacts/outsider-stale-constraint-episodes-20260828-v2";
const RECORD_LIMIT = 2 * 1024 * 1024;
const ARCHIVE_BYTES = 22_808_747;
const SUMS_BYTES = 279;
const RANGE_COUNT = 48;
const RANGE_CONCURRENCY = 8;
const RANGE_ATTEMPTS = 4;
const ALLOWED_HOST = "zenodo.org";
const execFileAsync = promisify(execFile);
process.umask(0o077);

function fail(code, detail = null) {
  throw new Error(detail == null ? `STALE_CONSTRAINT_ACQUIRE_${code}`
    : `STALE_CONSTRAINT_ACQUIRE_${code}:${detail}`);
}

function serialize(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const result = { outputDir: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      result.outputDir = argv[++index];
    } else if (["--help", "-h"].includes(argument)) {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-stale-constraint-episodes.mjs [--output-dir <new-dir>]",
        "",
        "Acquires exactly the pinned Zenodo v2 ZIP and SHA256SUMS plus before/after",
        "record snapshots. Raw prompts/responses remain private and local; only derived",
        "structural research features enter the offline review-ranker evaluation.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_INVALID", argument);
  }
  return result;
}

function checkedUrl(value, expectedPath) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== ALLOWED_HOST
    || url.username !== "" || url.password !== "" || url.port !== ""
    || url.pathname !== expectedPath || url.search !== "" || url.hash !== "") {
    fail("URL_INVALID", value);
  }
  return url;
}

async function readBoundedBody(response, maximumBytes, exactBytes = null) {
  if (!response.body) fail("RESPONSE_BODY_MISSING");
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared)
    || Number(declared) > maximumBytes
    || (exactBytes !== null && Number(declared) !== exactBytes))) {
    fail("CONTENT_LENGTH_INVALID", declared);
  }
  const chunks = [];
  const reader = response.body.getReader();
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maximumBytes) {
      await reader.cancel("bounded source intake exceeded");
      fail("BODY_SIZE_BOUND_EXCEEDED");
    }
    chunks.push(Buffer.from(value));
  }
  if (total < 1 || (exactBytes !== null && total !== exactBytes)) {
    fail("BODY_SIZE_INVALID", total);
  }
  return Buffer.concat(chunks, total);
}

async function curlBytes(url, {
  maximumBytes, exactBytes = null, range = null, timeoutSeconds = 180,
} = {}) {
  const marker = "\nOUTSIDER_CURL_STATUS:";
  const args = [
    "--fail-with-body", "--silent", "--show-error", "--max-redirs", "0",
    "--connect-timeout", "30", "--max-time", String(timeoutSeconds),
    "--header", "Accept: */*", "--header", "Accept-Encoding: identity",
    "--user-agent", "outsider-stale-constraint-source-replay/1.0",
  ];
  if (range) args.push("--range", `${range.start}-${range.end}`);
  args.push("--write-out",
    `${marker}%{http_code}\nOUTSIDER_CURL_URL:%{url_effective}\nOUTSIDER_CURL_RANGE:%header{content-range}\n`,
  url.href);
  let stdout;
  try {
    ({ stdout } = await execFileAsync("/usr/bin/curl", args, {
      encoding: "buffer",
      maxBuffer: maximumBytes + 8_192,
    }));
  } catch (error) {
    const status = Number.isSafeInteger(error?.code) ? error.code : "FAILED";
    fail("CURL_SOURCE_FETCH_FAILED", status);
  }
  if (!Buffer.isBuffer(stdout)) fail("CURL_OUTPUT_INVALID");
  const markerOffset = stdout.lastIndexOf(Buffer.from(marker, "utf8"));
  if (markerOffset < 0) fail("CURL_TRAILER_MISSING");
  const body = stdout.subarray(0, markerOffset);
  const trailer = stdout.subarray(markerOffset + 1).toString("utf8");
  const statusMatch = /^OUTSIDER_CURL_STATUS:(\d{3})\n/u.exec(trailer);
  const urlMatch = /\nOUTSIDER_CURL_URL:([^\n]+)\n/u.exec(`\n${trailer}`);
  const rangeMatch = /\nOUTSIDER_CURL_RANGE:([^\n]*)\n?$/u.exec(`\n${trailer}`);
  const expectedStatus = range ? 206 : 200;
  if (!statusMatch || Number(statusMatch[1]) !== expectedStatus || !urlMatch
    || urlMatch[1] !== url.href || !rangeMatch
    || (range && rangeMatch[1] !== `bytes ${range.start}-${range.end}/${ARCHIVE_BYTES}`)
    || body.length < 1 || body.length > maximumBytes
    || (exactBytes !== null && body.length !== exactBytes)) {
    fail("CURL_RESPONSE_STRICT_VALIDATION_FAILED");
  }
  return Buffer.from(body);
}

async function fetchExact(urlValue, expectedPath, exactBytes, accept) {
  const url = checkedUrl(urlValue, expectedPath);
  void accept;
  return curlBytes(url, { maximumBytes: exactBytes, exactBytes });
}

async function fetchRecordSnapshot() {
  const expectedPath = `/api/records/${STALE_CONSTRAINT_ZENODO_RECORD.recordId}`;
  const url = checkedUrl(STALE_CONSTRAINT_SOURCE_URLS[
    STALE_CONSTRAINT_SOURCE_FILES.recordBefore], expectedPath);
  return curlBytes(url, { maximumBytes: RECORD_LIMIT });
}

function ranges(totalBytes, count) {
  const quotient = Math.floor(totalBytes / count);
  const remainder = totalBytes % count;
  const result = [];
  let start = 0;
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const bytes = quotient + (ordinal < remainder ? 1 : 0);
    result.push({ ordinal, start, end: start + bytes - 1, bytes });
    start += bytes;
  }
  if (start !== totalBytes) fail("RANGE_CONSTRUCTION_INVALID");
  return result;
}

function parseFinalHeaderBlock(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 64 * 1024) {
    fail("RANGE_HEADER_SIZE_INVALID");
  }
  const blocks = bytes.toString("latin1").replaceAll("\r\n", "\n")
    .split("\n\n").filter((block) => /^HTTP\//u.test(block));
  if (blocks.length < 1) fail("RANGE_HEADER_BLOCK_MISSING");
  const lines = blocks.at(-1).split("\n");
  const status = /^HTTP\/\S+ (\d{3})(?: |$)/u.exec(lines.shift() ?? "");
  if (!status) fail("RANGE_HEADER_STATUS_INVALID");
  const headers = new Map();
  for (const line of lines) {
    if (line === "") continue;
    const separator = line.indexOf(":");
    if (separator < 1) fail("RANGE_HEADER_LINE_INVALID");
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (headers.has(key) && headers.get(key) !== value) {
      fail("RANGE_HEADER_CONFLICTING_DUPLICATE", key);
    }
    headers.set(key, value);
  }
  return { status: Number(status[1]), headers };
}

function ownedScratchFile(file, scratchDirectory) {
  const root = path.resolve(scratchDirectory);
  const target = path.resolve(file);
  if (path.dirname(target) !== root) fail("SCRATCH_FILE_OUTSIDE_OWNED_DIRECTORY");
  return target;
}

async function fetchArchiveRangeToScratch(item, scratchDirectory) {
  const expectedPath = `/api/records/${STALE_CONSTRAINT_ZENODO_RECORD.recordId}/files/${
    STALE_CONSTRAINT_SOURCE_FILES.archive}/content`;
  const url = checkedUrl(STALE_CONSTRAINT_SOURCE_URLS[
    STALE_CONSTRAINT_SOURCE_FILES.archive], expectedPath);
  const expectedRange = `bytes ${item.start}-${item.end}/${ARCHIVE_BYTES}`;
  let finalObservation = "NO_RESPONSE";
  for (let attempt = 1; attempt <= RANGE_ATTEMPTS; attempt += 1) {
    const partFile = ownedScratchFile(path.join(scratchDirectory,
      `range-${item.ordinal}-attempt-${attempt}.part`), scratchDirectory);
    const headerFile = ownedScratchFile(path.join(scratchDirectory,
      `range-${item.ordinal}-attempt-${attempt}.headers`), scratchDirectory);
    try {
      const { stdout } = await execFileAsync("/usr/bin/curl", [
        "--fail", "--silent", "--show-error", "--max-redirs", "0",
        "--connect-timeout", "30", "--max-time", "600",
        "--max-filesize", String(item.bytes),
        "--header", "Accept: */*", "--header", "Accept-Encoding: identity",
        "--user-agent", "outsider-stale-constraint-source-replay/1.0",
        "--range", `${item.start}-${item.end}`,
        "--dump-header", headerFile,
        "--output", partFile,
        "--write-out", "OUTSIDER_STATUS:%{http_code}\nOUTSIDER_URL:%{url_effective}\n",
        url.href,
      ], { encoding: "utf8", maxBuffer: 64 * 1024 });
      const trailer = /^OUTSIDER_STATUS:(\d{3})\nOUTSIDER_URL:([^\n]+)\n$/u.exec(stdout);
      const partStat = lstatSync(partFile);
      const headerStat = lstatSync(headerFile);
      chmodSync(partFile, 0o600);
      chmodSync(headerFile, 0o600);
      if (!trailer || Number(trailer[1]) !== 206 || trailer[2] !== url.href
        || partStat.isSymbolicLink() || !partStat.isFile() || partStat.size !== item.bytes
        || headerStat.isSymbolicLink() || !headerStat.isFile()
        || headerStat.size < 1 || headerStat.size > 64 * 1024) {
        fail("RANGE_SCRATCH_OR_TRAILER_INVALID");
      }
      const parsed = parseFinalHeaderBlock(readFileSync(headerFile));
      if (parsed.status !== 206 || parsed.headers.get("content-range") !== expectedRange
        || parsed.headers.get("content-length") !== String(item.bytes)
        || (parsed.headers.has("content-encoding")
          && parsed.headers.get("content-encoding") !== "identity")) {
        fail("RANGE_HEADER_STRICT_VALIDATION_FAILED");
      }
      process.stderr.write(`${JSON.stringify({ type: "range-complete",
        ordinal: item.ordinal, start: item.start, end: item.end,
        bytes: item.bytes, attempt })}\n`);
      return { ...item, partFile, headerFile };
    } catch (error) {
      finalObservation = error instanceof Error ? error.message : String(error);
      for (const file of [partFile, headerFile]) {
        if (existsSync(file)) {
          const stat = lstatSync(file);
          if (stat.isSymbolicLink() || !stat.isFile()
            || path.dirname(path.resolve(file)) !== path.resolve(scratchDirectory)) {
            fail("SCRATCH_CLEANUP_TARGET_UNSAFE");
          }
          unlinkSync(file);
        }
      }
    }
    if (attempt < RANGE_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
      continue;
    }
  }
  fail("RANGE_HTTP_OR_ORIGIN_INVALID",
    `${item.ordinal}:${expectedRange}:${finalObservation}`);
}

async function fetchArchiveToScratch(scratchDirectory) {
  const work = ranges(ARCHIVE_BYTES, RANGE_COUNT);
  const pieces = [];
  for (let offset = 0; offset < work.length; offset += RANGE_CONCURRENCY) {
    const settled = await Promise.allSettled(work.slice(offset,
      offset + RANGE_CONCURRENCY).map((item) =>
      fetchArchiveRangeToScratch(item, scratchDirectory)));
    const rejected = settled.find((result) => result.status === "rejected");
    if (rejected) throw rejected.reason;
    pieces.push(...settled.map((result) => result.value));
  }
  pieces.sort((left, right) => left.ordinal - right.ordinal);
  let expectedStart = 0;
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (piece.ordinal !== index || piece.start !== expectedStart
      || piece.end !== piece.start + piece.bytes - 1) fail("RANGE_ORDER_INVALID");
    expectedStart = piece.end + 1;
  }
  if (expectedStart !== ARCHIVE_BYTES) fail("RANGE_COVERAGE_INVALID");
  const body = Buffer.concat(pieces.map((piece) => readFileSync(piece.partFile)),
    ARCHIVE_BYTES);
  if (body.length !== ARCHIVE_BYTES) fail("ARCHIVE_REASSEMBLY_INVALID");
  return body;
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

const args = parseArgs(process.argv.slice(2));
const workspace = path.resolve(process.cwd());
const target = path.resolve(args.outputDir);
const relative = path.relative(workspace, target);
if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
  || target === path.parse(target).root || existsSync(target)) {
  fail("OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE", target);
}
mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
const staging = path.join(path.dirname(target),
  `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
mkdirSync(staging, { mode: 0o700 });
chmodSync(staging, 0o700);

try {
  const sourceDirectory = path.join(staging, "source");
  mkdirSync(sourceDirectory, { mode: 0o700 });
  chmodSync(sourceDirectory, 0o700);
  const downloadDirectory = path.join(staging, ".download");
  mkdirSync(downloadDirectory, { mode: 0o700 });
  chmodSync(downloadDirectory, 0o700);

  /* The material record snapshot brackets all file acquisition. */
  const recordBefore = await fetchRecordSnapshot();
  const [checksumBytes, archiveBytes] = await Promise.all([
    fetchExact(STALE_CONSTRAINT_SOURCE_URLS[STALE_CONSTRAINT_SOURCE_FILES.checksums],
      `/api/records/${STALE_CONSTRAINT_ZENODO_RECORD.recordId}/files/${
        STALE_CONSTRAINT_SOURCE_FILES.checksums}/content`, SUMS_BYTES, "text/plain"),
    fetchArchiveToScratch(downloadDirectory),
  ]);
  const recordAfter = await fetchRecordSnapshot();
  const sourceBytes = {
    [STALE_CONSTRAINT_SOURCE_FILES.recordBefore]: recordBefore,
    [STALE_CONSTRAINT_SOURCE_FILES.checksums]: checksumBytes,
    [STALE_CONSTRAINT_SOURCE_FILES.archive]: archiveBytes,
    [STALE_CONSTRAINT_SOURCE_FILES.recordAfter]: recordAfter,
  };
  for (const [name, bytes] of Object.entries(sourceBytes)) {
    writePrivate(path.join(sourceDirectory, name), bytes);
  }
  /* The pinned assembled archive is now in source/. Scratch contains only our
   * range parts and headers; it is removed before any artifact can publish. */
  rmSync(downloadDirectory, { recursive: true, force: true });

  const { report, archiveIndex } = buildStaleConstraintEpisodeArtifact(sourceBytes);
  const receipt = buildStaleConstraintRunReceipt(report, archiveIndex);
  writePrivate(path.join(staging, "archive-index.json"), serialize(archiveIndex));
  writePrivate(path.join(staging, "report.json"), serialize(report));
  writePrivate(path.join(staging, "run-receipt.json"), serialize(receipt));

  const fullReplay = verifyStaleConstraintEpisodeArtifact(report, archiveIndex,
    { sourceDirectory });
  if (!fullReplay.ok) fail("FULL_SOURCE_REPLAY_FAILED", fullReplay.error);
  const receiptReplay = verifyStaleConstraintRunReceipt(receipt, report, archiveIndex,
    { sourceDirectory });
  if (!receiptReplay.ok) fail("RECEIPT_REPLAY_FAILED", receiptReplay.error);

  publishStaleConstraintArtifactDirectory(staging, target);
  process.stdout.write(`${JSON.stringify({
    ok: true,
    outputDirectory: target,
    recordId: STALE_CONSTRAINT_ZENODO_RECORD.recordId,
    doi: STALE_CONSTRAINT_ZENODO_RECORD.doi,
    version: STALE_CONSTRAINT_ZENODO_RECORD.version,
    revision: STALE_CONSTRAINT_ZENODO_RECORD.revision,
    licenseId: STALE_CONSTRAINT_ZENODO_RECORD.licenseId,
    sourceRoot: report.sourceTrust.sourceRoot,
    archiveIndexHash: archiveIndex.archiveIndexHash,
    reportHash: report.reportHash,
    receiptHash: receipt.receiptHash,
    archiveBytes: archiveIndex.archive.bytes,
    archiveEntries: archiveIndex.summary.entries,
    archiveEpisodeByteCommitmentsReplayed: report.sourceReplay.confirmatoryEpisodes,
    schemaInspectedEpisodes: report.sourceReplay.schemaInspectedEpisodes,
    opaqueAuditByteCommitments: report.sourceReplay.opaqueAuditByteCommitments,
    schemaInspectedKeptCalls: report.sourceReplay.schemaInspectedKeptTwoPhaseCalls,
    datasetWidePinnedAggregateCounts:
      report.sourceReplay.datasetWidePinnedAggregateCountsNotRecomputedFromOpaqueAudit,
    splitGroups: report.offlineResearchTraining.split.totalGroups,
    groupOverlap: report.offlineResearchTraining.split.groupOverlap,
    baselineMetrics: report.offlineResearchTraining.baseline.holdoutMetrics,
    candidateMetrics: report.offlineResearchTraining.candidate.holdoutMetrics,
    researchQueueDecision: report.offlineResearchTraining.researchQueueDecision,
    productionDecision: report.offlineResearchTraining.productionDecision,
    realOutcomeRows: 0,
    networkRows: 0,
    productionTrainingRows: 0,
    CEU: 0,
    authority: "NONE",
  }, null, 2)}\n`);
} catch (error) {
  rmSync(staging, { recursive: true, force: true });
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
