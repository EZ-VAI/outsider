#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  BOTFAILS_DATASET_ID,
  BOTFAILS_GITHUB_REPOSITORY,
  BOTFAILS_GITHUB_REVISION,
  BOTFAILS_REVISION,
  acquirePinnedBotFailsSource,
  buildBotFailsReceipt,
  buildBotFailsReportFromSource,
  publishBotFailsArtifactDirectory,
  verifyBotFailsArtifactDirectory,
  verifyBotFailsReceipt,
  verifyBotFailsReport,
  verifyBotFailsReportWithSource,
  verifyBotFailsSourceDirectory,
} from "../src/outsider-botfails-anomaly-annotation-corpus.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-botfails-anomaly-annotation-corpus-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `BOTFAILS_CORPUS_CLI_${code}`
    : `BOTFAILS_CORPUS_CLI_${code}:${detail}`);
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
      "  node scripts/acquire-botfails-anomaly-annotation-corpus.mjs [--output <new-dir>]",
      "",
      `Pins ${BOTFAILS_DATASET_ID}@${BOTFAILS_REVISION} and`,
      `${BOTFAILS_GITHUB_REPOSITORY}@${BOTFAILS_GITHUB_REVISION}.`,
      "Enumerates and brackets both complete public trees, then downloads all 144",
      "publisher label CSVs, all split metadata, and a complete 30-episode no-video",
      "industrial_screws_sorting state/action group. All 646 MP4s remain inventory-only.",
      "Binary detection labels and split membership are not promoted to independent",
      "task outcomes, recoveries, successful attempts, or a complete attempt census.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }

  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const checkpoint = `${target}.source-checkpoint`;
  let sourceAcquiredThisRun = false;
  if (existsSync(checkpoint)) {
    const checked = verifyBotFailsSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_SELECTED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_INVALID", checked.error);
    }
  } else {
    process.stderr.write("Acquiring pinned BotFails annotation/metadata closure...\n");
    await acquirePinnedBotFailsSource(checkpoint);
    sourceAcquiredThisRun = true;
    const checked = verifyBotFailsSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_SELECTED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_REPLAY_FAILED", checked.error);
    }
  }

  process.stderr.write("Building full-selected-source-rederived BotFails report...\n");
  const report = buildBotFailsReportFromSource(checkpoint);
  const standalone = verifyBotFailsReport(report);
  if (!standalone.ok) fail("STANDALONE_REPORT_INVALID", standalone.error);
  const replay = verifyBotFailsReportWithSource(report, checkpoint);
  if (!replay.ok || replay.verificationLevel !== "FULL_SELECTED_SOURCE_REDERIVED") {
    fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
  }
  const reportBytes = canonicalBytes(report);
  const receipt = buildBotFailsReceipt(report, reportBytes);
  const receiptBytes = canonicalBytes(receipt);
  if (!verifyBotFailsReceipt(receipt, report, reportBytes).ok) fail("RECEIPT_INVALID");

  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  writePrivate(path.join(staging, "report.json"), reportBytes);
  renameSync(checkpoint, path.join(staging, "source"));
  // Receipt is deliberately the final file written before atomic publication.
  writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
  publishBotFailsArtifactDirectory(staging, target);

  const artifact = verifyBotFailsArtifactDirectory(target);
  if (!artifact.ok) fail("PUBLISHED_ARTIFACT_INVALID", artifact.error);
  const labels = report.observations.binaryLabelReplay.totals;
  const selected = report.observations.selectedSameTaskParquetReplay.totals;
  const result = { ok: true, outputDirectory: target, sourceAcquiredThisRun,
    datasetId: BOTFAILS_DATASET_ID, pinnedRevision: BOTFAILS_REVISION,
    githubRepository: BOTFAILS_GITHUB_REPOSITORY,
    githubRevision: BOTFAILS_GITHUB_REVISION,
    completeTreeEntries: 1_369, selectedHfFiles: 256, selectedHfBytes: 2_717_072,
    excludedVideoFiles: 646, excludedVideoBytes: 9_150_824_572,
    publisherTestEpisodes: 145, publisherNormalTrainEpisodes: 178,
    publisherLabelFiles: labels.files, publisherLabelRows: labels.rows,
    publisherOneRows: labels.oneRows, missingLabelFiles: 1,
    labelLengthMismatchFiles: labels.lengthMismatchEpisodes,
    selectedTelemetryEpisodes: selected.episodes, selectedTelemetryFrames: selected.frames,
    independentOutcomeUnits: 0, recoveryUnits: 0,
    completeAttemptCensusEstablished: false,
    artifactHash: report.artifactHash, receiptHash: receipt.receiptHash,
    reportFileSha256: artifact.reportFileSha256,
    receiptFileSha256: artifact.receiptFileSha256,
    sourceRoot: report.source.sourceRoot,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: report.source.sourceManifestFileSha256,
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
