#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  HANDOVER_DOI,
  HANDOVER_RECORD_ID,
  acquirePinnedHandoverFailureSource,
  buildHandoverFailureReceipt,
  buildHandoverFailureReportFromSource,
  publishHandoverFailureArtifactDirectory,
  verifyHandoverFailureArtifactDirectory,
  verifyHandoverFailureReceipt,
  verifyHandoverFailureReport,
  verifyHandoverFailureReportWithSource,
  verifyHandoverFailureSourceDirectory,
} from "../src/outsider-handover-failure-sample-eval.js";

const DEFAULT_OUTPUT =
  "artifacts/outsider-handover-failure-sample-eval-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `HANDOVER_FAILURE_CLI_${code}`
    : `HANDOVER_FAILURE_CLI_${code}:${detail}`);
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
      "  node scripts/acquire-handover-failure-sample-eval.mjs [--output <new-dir>]",
      "",
      `Pins Zenodo ${HANDOVER_RECORD_ID}, DOI ${HANDOVER_DOI}, revision 6.`,
      "Downloads four exact objects: two-trial sample, complete training labels,",
      "class names, and datasheet (60,097,757 bytes total).",
      "The sample is joined to publisher labels only by exact trial id.",
      "Faces are visible and potentially identifiable; output is quarantine eval only.",
      "No independent witness/outcome, census, recovery, training, network, CEU,",
      "pricing, or execution authority is created.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }
  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const checkpoint = `${target}.source-checkpoint`;
  let sourceAcquiredThisRun = false;
  if (existsSync(checkpoint)) {
    const checked = verifyHandoverFailureSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_INVALID", checkpoint);
    }
  } else {
    process.stderr.write("Acquiring four checksum-pinned Zenodo objects with strict ranges...\n");
    const progressSeen = new Map();
    await acquirePinnedHandoverFailureSource(checkpoint, { onProgress(key, completed, total) {
      const previous = progressSeen.get(key) ?? 0;
      if (completed === total || completed === 1 || completed - previous >= 8) {
        process.stderr.write(`  ${key}: ${completed}/${total} exact ranges\n`);
        progressSeen.set(key, completed);
      }
    } });
    sourceAcquiredThisRun = true;
    const checked = verifyHandoverFailureSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_REPLAY_FAILED", checkpoint);
    }
  }
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  process.stderr.write("Building source-rederived HRI sample evaluation report...\n");
  const report = buildHandoverFailureReportFromSource(checkpoint);
  if (!verifyHandoverFailureReport(report).ok) fail("STANDALONE_REPORT_INVALID");
  const replay = verifyHandoverFailureReportWithSource(report, checkpoint);
  if (!replay.ok || replay.verificationLevel !== "FULL_BOUNDED_SOURCE_REDERIVED") {
    fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
  }
  const reportBytes = canonicalBytes(report);
  const receipt = buildHandoverFailureReceipt(report, reportBytes);
  const receiptBytes = canonicalBytes(receipt);
  if (!verifyHandoverFailureReceipt(receipt, report, reportBytes).ok) {
    fail("RUN_RECEIPT_INVALID");
  }
  writePrivate(path.join(staging, "report.json"), reportBytes);
  writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
  renameSync(checkpoint, path.join(staging, "source"));
  publishHandoverFailureArtifactDirectory(staging, target);
  const artifact = verifyHandoverFailureArtifactDirectory(target);
  if (!artifact.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", artifact.error);
  const result = { ok: true, outputDirectory: target, sourceAcquiredThisRun,
    recordId: HANDOVER_RECORD_ID, doi: HANDOVER_DOI,
    boundedSampleTrials: 2,
    sampleTrialIds: report.observations.sampleTrialIds,
    publisherOutcomeLabelUnits: report.observations.publisherSampleOutcomeLabelUnits,
    trainingPublisherLabelRows: report.observations.trainingLabelRows,
    artifactHash: report.artifactHash, receiptHash: receipt.receiptHash,
    reportFileSha256: receipt.reportFileSha256,
    sourceManifestHash: report.source.manifestHash,
    sourceManifestFileSha256: report.source.manifestFileSha256,
    sourceRoot: report.source.sourceRoot,
    verificationLevel: artifact.verificationLevel,
    independentOutcomeUnits: 0, independentWitnessUnits: 0, recoveryUnits: 0,
    governedTrainingRows: 0, networkAdmissionRows: 0, CEU: 0,
    pricingUnits: 0, authorityUnits: 0 };
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
