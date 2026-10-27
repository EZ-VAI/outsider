#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  SO101_HF_ADMITTED_DATASET_ID,
  SO101_HF_ADMITTED_REVISION,
  acquireSo101HfExhaustionSource,
  buildSo101HfExhaustionReceipt,
  buildSo101HfExhaustionReportFromSource,
  publishSo101HfExhaustionArtifactDirectory,
  verifySo101HfExhaustionArtifactDirectory,
  verifySo101HfExhaustionReceipt,
  verifySo101HfExhaustionReport,
  verifySo101HfExhaustionReportWithSource,
  verifySo101HfExhaustionSource,
} from "../src/outsider-so101-hf-exhaustion-ledger.js";

const DEFAULT_OUTPUT = "artifacts/outsider-so101-hf-exhaustion-ledger-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `SO101_HF_EXHAUSTION_CLI_${code}`
    : `SO101_HF_EXHAUSTION_CLI_${code}:${detail}`);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = { output: DEFAULT_OUTPUT, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output" && argv[index + 1]) parsed.output = argv[++index];
    else if (["--help", "-h"].includes(argument)) parsed.help = true;
    else fail("ARGUMENT_INVALID", argument);
  }
  return parsed;
}

function targetInsideWorkspace(value) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || target === path.parse(target).root) {
    fail("OUTPUT_OUTSIDE_WORKSPACE", target);
  }
  return target;
}

function requireSafeParent(directory) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(directory);
  const relative = path.relative(workspace, target);
  let cursor = workspace;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment);
    if (!existsSync(cursor)) mkdirSync(cursor, { mode: 0o700 });
    const stat = lstatSync(cursor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail("PARENT_UNSAFE", cursor);
  }
}

function writePrivate(file, bytes) {
  writeFileSync(file, bytes, { flag: "wx", mode: 0o600 });
  chmodSync(file, 0o600);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/acquire-so101-hf-exhaustion-ledger.mjs [--output <new-dir>]",
      "",
      "Freezes complete official HF dataset searches for `so101` and `SO-101`,",
      "records a terminal disposition for every deduplicated result, and admits one",
      "bounded complete no-video source-native reward closure. Global exhaustion",
      "is always false. Publisher reward values are not task outcomes or recovery.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }
  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const checkpoint = `${target}.source-checkpoint`;
  let sourceAcquiredThisRun = false;
  if (existsSync(checkpoint)) {
    const checked = verifySo101HfExhaustionSource(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_QUERY_AND_SELECTED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_INVALID", checked.error);
    }
  } else {
    process.stderr.write("Freezing complete official HF SO-101 query universe...\n");
    await acquireSo101HfExhaustionSource(checkpoint);
    sourceAcquiredThisRun = true;
    const checked = verifySo101HfExhaustionSource(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_QUERY_AND_SELECTED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_REPLAY_FAILED", checked.error);
    }
  }
  process.stderr.write("Building terminal candidate ledger and selected-source replay...\n");
  const report = buildSo101HfExhaustionReportFromSource(checkpoint);
  const standalone = verifySo101HfExhaustionReport(report);
  if (!standalone.ok) fail("STANDALONE_REPORT_INVALID", standalone.error);
  const replay = verifySo101HfExhaustionReportWithSource(report, checkpoint);
  if (!replay.ok || replay.verificationLevel !== "FULL_QUERY_AND_SELECTED_SOURCE_REDERIVED") {
    fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
  }
  const reportBytes = canonicalBytes(report);
  const receipt = buildSo101HfExhaustionReceipt(report, reportBytes);
  const receiptBytes = canonicalBytes(receipt);
  if (!verifySo101HfExhaustionReceipt(receipt, report, reportBytes).ok) {
    fail("RECEIPT_INVALID");
  }

  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  writePrivate(path.join(staging, "so101-hf-exhaustion-ledger.json"), reportBytes);
  renameSync(checkpoint, path.join(staging, "source"));
  // Receipt is deliberately last before the atomic no-clobber publish.
  writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
  publishSo101HfExhaustionArtifactDirectory(staging, target);
  const artifact = verifySo101HfExhaustionArtifactDirectory(target);
  if (!artifact.ok) fail("PUBLISHED_ARTIFACT_INVALID", artifact.error);

  const result = { ok: true, outputDirectory: target, sourceAcquiredThisRun,
    observedFrom: report.source.observedFrom, observedThrough: report.source.observedThrough,
    searchQueryVariants: 2, searchPagesPerVariant: 10,
    deduplicatedCandidateRecords: 9_766, terminalCandidateRecords: 9_766,
    prioritySignalCandidates: report.discovery.prioritySignalCandidates,
    dispositionCounts: report.discovery.countsByDispositionCode,
    declaredScopeExhausted: true, globalExhaustion: false,
    admittedDatasetId: SO101_HF_ADMITTED_DATASET_ID,
    admittedRevision: SO101_HF_ADMITTED_REVISION,
    selectedNoVideoFiles: 7, selectedNoVideoBytes: 1_287_697,
    excludedVideoFiles: 4, excludedVideoBytes: 680_347_338,
    selectedEpisodes: 50, selectedFrames: 45_273,
    publisherRewardRows: 45_273, independentOutcomeUnits: 0,
    recoveryUnits: 0, completeAttemptCensusEstablished: false,
    artifactHash: report.artifactHash, receiptHash: receipt.receiptHash,
    reportFileSha256: artifact.reportFileSha256,
    receiptFileSha256: artifact.receiptFileSha256,
    sourceRoot: report.source.sourceRoot,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: report.source.sourceManifestFileSha256,
    candidateLedgerHash: report.candidateLedger.ledgerHash,
    verificationLevel: artifact.verificationLevel,
    authorizedTrainingRows: 0, networkAdmissionRows: 0,
    CEU: 0, pricingUnits: 0, authorityUnits: 0 };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  return result;
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
