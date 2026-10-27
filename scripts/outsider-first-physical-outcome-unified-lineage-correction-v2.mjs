#!/usr/bin/env node

/*
 * Append-only, no-network correction for a unified live-preflight summary
 * whose CLI-supplied supersession token was wrong. The source summary is
 * verified and retained unchanged. Verified predecessor summary files supply
 * the corrected hashes; no hash is accepted from free-form operator text.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync,
  mkdtempSync, openSync, readFileSync, realpathSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";

const PREFIX
  = "OUTSIDER_FIRST_PHYSICAL_OUTCOME_UNIFIED_LINEAGE_CORRECTION_V2_";
const CORRECTION_SCHEMA
  = "outsider/first-physical-outcome-unified-lineage-correction/v2";
const SUMMARY_SCHEMA
  = "outsider/first-physical-outcome-unified-live-preflight-summary/v2";
const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function hashBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return hashBytes(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function readSummary(filename) {
  const requested = path.resolve(filename);
  const absolute = realpathSync(requested);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) {
    fail("PRIVATE_0600_SUMMARY_REQUIRED");
  }
  if (requested !== absolute) fail("SUMMARY_SYMLINK_FORBIDDEN");
  const bytes = readFileSync(absolute);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("SUMMARY_JSON_INVALID"); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail("SUMMARY_NOT_CANONICAL");
  }
  const { summaryProjectionHash, ...body } = value;
  if (!HASH.test(summaryProjectionHash)
    || digest(value.schema, body) !== summaryProjectionHash) {
    fail("SUMMARY_HASH_INVALID");
  }
  return Object.freeze({ absolute, bytes: bytes.length,
    fileHash: hashBytes(bytes), value });
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("PRIVATE_DIRECTORY_INVALID");
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(file, 0o600);
  return Object.freeze({ bytes: bytes.length, hash: hashBytes(bytes) });
}

export function reissueUnifiedLivePreflightLineageCorrectionV2(input = {}) {
  if (input === null || typeof input !== "object" || Array.isArray(input)
    || Reflect.ownKeys(input).length !== 4
    || !Object.hasOwn(input, "sourceSummaryFile")
    || !Object.hasOwn(input, "predecessorSummaryFiles")
    || !Object.hasOwn(input, "erroneousSupersessionToken")
    || !Object.hasOwn(input, "outputRoot")) fail("INPUT_INVALID");
  if (!Array.isArray(input.predecessorSummaryFiles)
    || input.predecessorSummaryFiles.length < 1
    || !HASH.test(input.erroneousSupersessionToken)) fail("INPUT_INVALID");
  const source = readSummary(input.sourceSummaryFile);
  const predecessors = input.predecessorSummaryFiles.map(readSummary);
  const predecessorHashes = predecessors.map((item) =>
    item.value.summaryProjectionHash);
  if (new Set(predecessorHashes).size !== predecessorHashes.length
    || !source.value.appendOnlyLineage?.supersedesSummaryProjectionHashes
      ?.includes(input.erroneousSupersessionToken)
    || predecessorHashes.includes(input.erroneousSupersessionToken)
    || source.value.summaryProjectionHash === input.erroneousSupersessionToken
    || source.value.evidencePayloadSetHash === input.erroneousSupersessionToken) {
    fail("CORRECTION_BINDING_INVALID");
  }
  const recordedAt = new Date().toISOString();
  const outputRoot = path.resolve(input.outputRoot);
  ensurePrivateDirectory(outputRoot);
  const directory = mkdtempSync(path.join(outputRoot,
    `first-physical-unified-lineage-correction-${recordedAt.slice(0, 10)
      .replaceAll("-", "")}-`));
  chmodSync(directory, 0o700);
  const correctedLineage = Object.freeze({
    revision: Number(source.value.appendOnlyLineage.revision) + 1,
    predecessorSummaryProjectionHash: source.value.summaryProjectionHash,
    supersedesSummaryProjectionHashes: Object.freeze([
      ...predecessorHashes, source.value.summaryProjectionHash,
    ]),
    inPlaceMutationAllowed: false,
  });
  const correctionBody = {
    schema: CORRECTION_SCHEMA,
    schemaVersion: "2.0.0",
    recordedAt,
    sourceRun: {
      summaryProjectionHash: source.value.summaryProjectionHash,
      publicSummaryFileBytes: source.bytes,
      publicSummaryFileHash: source.fileHash,
      evidencePayloadSetHash: source.value.evidencePayloadSetHash,
      evidencePayloadFileCount: source.value.evidencePayloadFileCount,
      evidencePayloadBytes: source.value.evidencePayloadBytes,
    },
    verifiedPredecessorSummaries: predecessors.map((item) => ({
      summaryProjectionHash: item.value.summaryProjectionHash,
      publicSummaryFileBytes: item.bytes,
      publicSummaryFileHash: item.fileHash,
      evidencePayloadSetHash: item.value.evidencePayloadSetHash,
    })),
    erroneousSupersessionToken: input.erroneousSupersessionToken,
    erroneousTokenMatchesVerifiedSummaryProjection: false,
    erroneousTokenAcceptedAsSupersession: false,
    correctedAppendOnlyLineage: correctedLineage,
    sourceSummaryRetainedUnmodified: true,
    externalNetworkRequestCount: 0,
    sellerCartMutationCount: 0,
    paymentAttempted: false,
    checkoutAttempted: false,
    orderSubmitted: false,
    decisionState: "HOLD",
  };
  const correction = Object.freeze({ ...correctionBody,
    correctionHash: digest(correctionBody.schema, correctionBody) });
  const correctionFile = writeOnce(path.join(directory,
    "lineage-correction.v2.json"), correction);
  const { summaryProjectionHash: sourceSummaryProjectionHash,
    ...sourceBody } = source.value;
  const descendantBody = {
    ...sourceBody,
    schema: SUMMARY_SCHEMA,
    schemaVersion: "2.0.0",
    appendOnlyLineage: correctedLineage,
    sourceSummaryProjectionHash,
    sourceSummaryFileHash: source.fileHash,
    sourceSummaryRetainedUnmodified: true,
    lineageCorrectionHash: correction.correctionHash,
    erroneousSupersessionTokenAccepted: false,
  };
  const descendant = Object.freeze({ ...descendantBody,
    summaryProjectionHash: digest(descendantBody.schema, descendantBody) });
  const summaryFile = writeOnce(path.join(directory,
    "public-summary.v2.json"), descendant);
  const artifactRows = Object.freeze([
    Object.freeze({ name: "lineage-correction.v2.json",
      bytes: correctionFile.bytes, sha256: correctionFile.hash }),
    Object.freeze({ name: "public-summary.v2.json",
      bytes: summaryFile.bytes, sha256: summaryFile.hash }),
  ]);
  return Object.freeze({
    schema: "outsider/first-physical-outcome-unified-lineage-correction-run/v2",
    schemaVersion: "2.0.0",
    directory,
    correctionHash: correction.correctionHash,
    correctedSummaryProjectionHash: descendant.summaryProjectionHash,
    correctedSummaryFileBytes: summaryFile.bytes,
    correctedSummaryFileHash: summaryFile.hash,
    artifactCount: artifactRows.length,
    artifactBytes: artifactRows.reduce((sum, row) => sum + row.bytes, 0),
    artifactSetHash: digest(
      "outsider/first-physical-unified-lineage-correction-artifact-set/v2",
      artifactRows),
    externalNetworkRequestCount: 0,
    paymentAttempted: false,
    orderSubmitted: false,
  });
}

function values(argv, flag) {
  const output = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === flag) output.push(argv[index + 1]);
  }
  return output;
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write([
      "Usage:",
      "  node scripts/outsider-first-physical-outcome-unified-lineage-correction-v2.mjs \\",
      "    --source-summary FILE --predecessor-summary FILE [--predecessor-summary FILE ...] \\",
      "    --erroneous-token SHA256 --output-root PRIVATE_DIRECTORY",
      "",
      "Performs no network request and does not mutate the source summaries.",
      "",
    ].join("\n"));
    return;
  }
  const single = (flag) => {
    const found = values(argv, flag);
    if (found.length !== 1 || typeof found[0] !== "string") {
      fail("ARGUMENT_INVALID");
    }
    return found[0];
  };
  const known = new Set(["--source-summary", "--predecessor-summary",
    "--erroneous-token", "--output-root"]);
  for (let index = 0; index < argv.length; index += 2) {
    if (!known.has(argv[index]) || argv[index + 1] === undefined) {
      fail("ARGUMENT_INVALID");
    }
  }
  const result = reissueUnifiedLivePreflightLineageCorrectionV2({
    sourceSummaryFile: single("--source-summary"),
    predecessorSummaryFiles: values(argv, "--predecessor-summary"),
    erroneousSupersessionToken: single("--erroneous-token"),
    outputRoot: single("--output-root"),
  });
  process.stdout.write(`${canonicalizeStrict(result)}\n`);
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  });
}
