#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  EXYLOS_DATASET_ID,
  EXYLOS_REVISION,
  acquirePinnedExylosSource,
  buildExylosReceipt,
  buildExylosReportFromSource,
  publishExylosArtifactDirectory,
  verifyExylosArtifactDirectory,
  verifyExylosReceipt,
  verifyExylosReport,
  verifyExylosReportWithSource,
  verifyExylosSourceDirectory,
} from "../src/outsider-exylos-pick-place-virtual-sample.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-exylos-pick-place-virtual-sample-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `EXYLOS_VIRTUAL_SAMPLE_CLI_${code}`
    : `EXYLOS_VIRTUAL_SAMPLE_CLI_${code}:${detail}`);
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
      "  node scripts/acquire-exylos-pick-place-virtual-sample.mjs [--output <new-dir>]",
      "",
      `Pins ${EXYLOS_DATASET_ID}@${EXYLOS_REVISION}.`,
      "Acquires the complete no-video closure: 50 parquet episodes plus eight",
      "support files (58 files / 3,358,010 bytes). MP4/GIF bytes are excluded.",
      "The source is VR-seeded and procedurally expanded virtual Panda data.",
      "Publisher success/failure and correction labels do not establish physical",
      "outcome, recovery, attempt census, training, network, CEU, pricing, or authority.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }
  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const checkpoint = `${target}.source-checkpoint`;
  let sourceAcquiredThisRun = false;
  if (existsSync(checkpoint)) {
    const checked = verifyExylosSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_NO_VIDEO_SOURCE_BYTE_REPLAY") {
      fail("SOURCE_CHECKPOINT_INVALID", checkpoint);
    }
  } else {
    process.stderr.write("Acquiring the fixed complete no-video HF closure...\n");
    let last = 0;
    await acquirePinnedExylosSource(checkpoint, { onProgress(completed, total, objectPath) {
      if (completed === total || completed - last >= 10) {
        process.stderr.write(`  ${completed}/${total}: ${objectPath}\n`);
        last = completed;
      }
    } });
    sourceAcquiredThisRun = true;
    const checked = verifyExylosSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_NO_VIDEO_SOURCE_BYTE_REPLAY") {
      fail("SOURCE_CHECKPOINT_REPLAY_FAILED", checkpoint);
    }
  }
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  process.stderr.write("Replaying all 50 parquet traces and publisher annotations...\n");
  const report = buildExylosReportFromSource(checkpoint);
  if (!verifyExylosReport(report).ok) fail("REPORT_INVALID");
  const replay = verifyExylosReportWithSource(report, checkpoint);
  if (!replay.ok || replay.verificationLevel !== "FULL_NO_VIDEO_SOURCE_REDERIVED") {
    fail("REPORT_SOURCE_REPLAY_FAILED", replay.error);
  }
  const reportBytes = canonicalBytes(report);
  const receipt = buildExylosReceipt(report, reportBytes);
  const receiptBytes = canonicalBytes(receipt);
  if (!verifyExylosReceipt(receipt, report, reportBytes).ok) fail("RECEIPT_INVALID");
  writePrivate(path.join(staging, "report.json"), reportBytes);
  writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
  renameSync(checkpoint, path.join(staging, "source"));
  publishExylosArtifactDirectory(staging, target);
  const artifact = verifyExylosArtifactDirectory(target);
  if (!artifact.ok) fail("PUBLISHED_ARTIFACT_INVALID", artifact.error);
  const result = {
    ok: true, outputDirectory: target, sourceAcquiredThisRun,
    datasetId: EXYLOS_DATASET_ID, pinnedRevision: EXYLOS_REVISION,
    selectedFiles: report.source.selectedFiles,
    selectedBytes: report.source.selectedBytes,
    episodes: report.observations.dataset.episodeUnits,
    frames: report.observations.dataset.frameUnits,
    publisherAnnotationSuccessLabels:
      report.observations.publisherLabels.annotationSuccessUnits,
    publisherAnnotationFailureLabels:
      report.observations.publisherLabels.annotationFailureUnits,
    publisherParquetTerminalSuccessTrueFlags:
      report.observations.publisherLabels.parquetTerminalSuccessTrueUnits,
    publisherLabelFieldDisagreements:
      report.observations.publisherLabels.crossFieldDisagreementUnits,
    publisherCorrectionMorphologyEpisodes:
      report.observations.publisherCorrectionMorphology.episodesWithCorrectionPhase,
    artifactHash: report.artifactHash, receiptHash: receipt.receiptHash,
    reportFileSha256: receipt.reportFileSha256,
    sourceManifestHash: report.source.manifestHash,
    sourceManifestFileSha256: report.source.manifestFileSha256,
    sourceRoot: report.source.sourceRoot,
    verificationLevel: artifact.verificationLevel,
    physicalExecutionUnits: 0, independentOutcomeUnits: 0, recoveryEffectUnits: 0,
    governedTrainingRows: 0, networkAdmissionRows: 0, CEU: 0,
    pricingUnits: 0, authorityUnits: 0,
  };
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
