#!/usr/bin/env node

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, mkdirSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  TRACELAB_V002_COMMIT,
  TRACELAB_V002_RELEASE,
  TRACELAB_V002_SOURCE_URLS,
  buildTraceLabV002SourceCandidate,
  publishTraceLabV002ArtifactDirectory,
  verifyTraceLabV002SourceCandidate,
} from "../src/outsider-tracelab-v002-source-queue.js";

const DEFAULT_OUTPUT = "artifacts/tracelab-v002-source-candidate-20260828-v1";
const MAX_SOURCE_BYTES = 512 * 1024;
const ALLOWED_HOSTS = new Set(["api.github.com", "raw.githubusercontent.com"]);

function fail(code, detail = null) {
  throw new Error(detail == null ? `TRACELAB_V002_ACQUIRE_${code}`
    : `TRACELAB_V002_ACQUIRE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function serialize(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = { outputDir: DEFAULT_OUTPUT };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output-dir" && argv[index + 1]) {
      parsed.outputDir = argv[++index];
    } else if (["--help", "-h"].includes(argument)) {
      process.stdout.write([
        "Usage:",
        "  node scripts/acquire-tracelab-v002-source-queue.mjs [--output-dir <new-dir>]",
        "",
        "Fetches only bounded TraceLab v0.0.2 release/tag/license/schema metadata.",
        "It does not download the 101 MB JSONL, DuckDB, trace rows or any private data.",
      ].join("\n") + "\n");
      process.exit(0);
    } else fail("ARGUMENT_INVALID", argument);
  }
  return parsed;
}

function checkedUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !ALLOWED_HOSTS.has(url.hostname)
    || url.username !== "" || url.password !== "") fail("URL_INVALID", value);
  return url;
}

async function boundedFetch(value) {
  const url = checkedUrl(value);
  const response = await fetch(url, {
    redirect: "error",
    headers: { accept: "application/json, text/plain;q=0.9",
      "user-agent": "outsider-tracelab-v002-metadata-intake/1.0" },
    signal: AbortSignal.timeout(120_000),
  });
  if (response.status !== 200 || !response.body) fail(`HTTP_${response.status}`, url);
  checkedUrl(response.url);
  const declared = response.headers.get("content-length");
  if (declared !== null && (!/^\d+$/u.test(declared)
    || Number(declared) > MAX_SOURCE_BYTES)) fail("CONTENT_LENGTH_INVALID", url);
  const chunks = [];
  const reader = response.body.getReader();
  let total = 0;
  for (;;) {
    const { done, value: chunk } = await reader.read();
    if (done) break;
    total += chunk.byteLength;
    if (total > MAX_SOURCE_BYTES) {
      await reader.cancel("metadata size bound exceeded");
      fail("SOURCE_SIZE_INVALID", url);
    }
    chunks.push(Buffer.from(chunk));
  }
  if (total < 1) fail("SOURCE_EMPTY", url);
  return Buffer.concat(chunks, total);
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
const temporary = path.join(path.dirname(target),
  `.${path.basename(target)}.tmp-${process.pid}-${randomBytes(8).toString("hex")}`);
mkdirSync(temporary, { mode: 0o700 });
chmodSync(temporary, 0o700);

try {
  const sourceBytes = Object.fromEntries(await Promise.all(
    Object.entries(TRACELAB_V002_SOURCE_URLS).map(async ([name, url]) =>
      [name, await boundedFetch(url)])));
  const report = buildTraceLabV002SourceCandidate(sourceBytes);
  const sourceDirectory = path.join(temporary, "source");
  mkdirSync(sourceDirectory, { mode: 0o700 });
  chmodSync(sourceDirectory, 0o700);
  for (const [name, bytes] of Object.entries(sourceBytes)) {
    writePrivate(path.join(sourceDirectory, name), bytes);
  }
  const reportBytes = serialize(report);
  writePrivate(path.join(temporary, "report.json"), reportBytes);
  const verified = verifyTraceLabV002SourceCandidate(report, { sourceDirectory });
  if (!verified.ok) fail("FULL_METADATA_SOURCE_REPLAY_FAILED", verified.error);
  const receiptBody = {
    schema: "outsider/tracelab-v002-source-candidate-run-receipt/v1",
    datasetId: report.datasetId,
    release: TRACELAB_V002_RELEASE,
    tagTargetCommit: TRACELAB_V002_COMMIT,
    sourceObjectsFetched: Object.keys(sourceBytes).length,
    sourceBytesFetched: Object.values(sourceBytes).reduce((sum, bytes) => sum + bytes.length, 0),
    releasePayloadObjectsFetched: 0,
    releasePayloadBytesFetched: 0,
    sourceRoot: report.sourceTrust.sourceRoot,
    reportHash: report.reportHash,
    reportFileContentHash: sha256(reportBytes),
    queueHash: report.controlPlaneQueue.queueHash,
    publisherClaimedAgentSteps: report.release.publisherCounts.agentSteps,
    sourceRowsReplayed: 0,
    episodeRowsAdmitted: 0,
    networkRecordsCreated: 0,
    trainingDecision: report.training.decision,
    priorReleasePreserved: report.supersession.priorReleasePreserved,
    fullMetadataSourceReplay: verified,
  };
  const receipt = { ...receiptBody,
    receiptHash: sha256(Buffer.from(`outsider/tracelab-v002-run-receipt/v1\0${
      canonicalizeStrict(receiptBody)}`, "utf8")) };
  writePrivate(path.join(temporary, "run-receipt.json"), serialize(receipt));
  publishTraceLabV002ArtifactDirectory(temporary, target);
  process.stdout.write(`${JSON.stringify({ ok: true, outputDirectory: target,
    datasetId: report.datasetId, release: TRACELAB_V002_RELEASE,
    tagTargetCommit: TRACELAB_V002_COMMIT,
    movingHeadAtReview: report.movingHeadObservation.headAtReview,
    sourceObjectsFetched: receipt.sourceObjectsFetched,
    sourceBytesFetched: receipt.sourceBytesFetched,
    publishedJsonlBytesNotFetched: report.release.assets.find((asset) =>
      asset.name === "syfi_coding_trace.jsonl.gz").sizeBytes,
    releasePayloadBytesFetched: 0,
    publisherClaimedAgentSteps: receipt.publisherClaimedAgentSteps,
    sourceRowsReplayed: 0, episodeRowsAdmitted: 0, networkRecordsCreated: 0,
    reportHash: report.reportHash, sourceRoot: report.sourceTrust.sourceRoot,
    queueHash: report.controlPlaneQueue.queueHash,
    trainingDecision: report.training.decision,
    priorReleasePreserved: true }, null, 2)}\n`);
} catch (error) {
  rmSync(temporary, { recursive: true, force: true });
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
