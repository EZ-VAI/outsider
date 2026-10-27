#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  DIGIT_ARCHIVE_BYTES,
  DIGIT_ARCHIVE_LFS_SHA256,
  DIGIT_ARCHIVE_PATH,
  DIGIT_DATASET_ID,
  DIGIT_DATASET_REVISION,
  DIGIT_REPOSITORY_COMMIT,
  acquirePinnedDigitHardwareFaultSource,
  buildDigitHardwareFaultReceipt,
  buildDigitHardwareFaultReportFromSource,
  publishDigitHardwareFaultArtifactDirectory,
  verifyDigitHardwareFaultArtifactDirectory,
  verifyDigitHardwareFaultReceipt,
  verifyDigitHardwareFaultReport,
  verifyDigitHardwareFaultReportWithSource,
  verifyDigitHardwareFaultSourceDirectory,
} from "../src/outsider-digit-hardware-fault-eval.js";

const DEFAULT_OUTPUT = "artifacts/outsider-digit-hardware-fault-eval-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `DIGIT_HARDWARE_FAULT_CLI_${code}`
    : `DIGIT_HARDWARE_FAULT_CLI_${code}:${detail}`);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = { output: DEFAULT_OUTPUT, python: "/opt/anaconda3/bin/python", help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output" && argv[index + 1]) parsed.output = argv[++index];
    else if (argument === "--python" && argv[index + 1]) parsed.python = argv[++index];
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
    const stat = lstatSync(cursor, { bigint: true });
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
      "  node scripts/acquire-digit-hardware-fault-eval.mjs [--output <new-dir>] [--python <numpy-python>]",
      "",
      `Pins ${DIGIT_DATASET_ID}@${DIGIT_DATASET_REVISION}.`,
      `Strict-Range extracts the nine non-rosbag NPY members of ${DIGIT_ARCHIVE_PATH}`,
      `from the ${DIGIT_ARCHIVE_BYTES}-byte archive (${DIGIT_ARCHIVE_LFS_SHA256}).`,
      `The official support code is separately pinned at ${DIGIT_REPOSITORY_COMMIT}.`,
      "The publisher numeric label zero remains uninterpreted: safe/unsafe/fall are UNKNOWN.",
      "Dataset rights fail closed; this is isolated offline morphology evaluation only.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }
  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const checkpoint = `${target}.source-checkpoint`;
  let sourceAcquiredThisRun = false;
  if (existsSync(checkpoint)) {
    const checked = verifyDigitHardwareFaultSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_INVALID", checkpoint);
    }
  } else {
    process.stderr.write("Acquiring pinned Digit trial_1 no-rosbag source checkpoint...\n");
    await acquirePinnedDigitHardwareFaultSource(checkpoint);
    sourceAcquiredThisRun = true;
    const checked = verifyDigitHardwareFaultSourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_REPLAY_FAILED", checkpoint);
    }
  }
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  let published = false;
  try {
    process.stderr.write("Running restricted NPY replay over the nine selected objects...\n");
    const report = buildDigitHardwareFaultReportFromSource(checkpoint,
      { pythonExecutable: args.python });
    const standalone = verifyDigitHardwareFaultReport(report);
    if (!standalone.ok) fail("STANDALONE_REPORT_INVALID", standalone.error);
    const replay = verifyDigitHardwareFaultReportWithSource(report, checkpoint,
      { pythonExecutable: args.python });
    if (!replay.ok || replay.verificationLevel !== "FULL_BOUNDED_SOURCE_REDERIVED") {
      fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
    }
    const reportBytes = canonicalBytes(report);
    const receipt = buildDigitHardwareFaultReceipt(report, reportBytes);
    const receiptBytes = canonicalBytes(receipt);
    if (!verifyDigitHardwareFaultReceipt(receipt, report, reportBytes).ok) {
      fail("RUN_RECEIPT_INVALID");
    }
    writePrivate(path.join(staging, "report.json"), reportBytes);
    writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
    renameSync(checkpoint, path.join(staging, "source"));
    publishDigitHardwareFaultArtifactDirectory(staging, target);
    published = true;
    const directoryReplay = verifyDigitHardwareFaultArtifactDirectory(target,
      { pythonExecutable: args.python });
    if (!directoryReplay.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", directoryReplay.error);
    const result = {
      ok: true,
      outputDirectory: target,
      sourceAcquiredThisRun,
      datasetId: DIGIT_DATASET_ID,
      pinnedRevision: DIGIT_DATASET_REVISION,
      repositoryCommit: DIGIT_REPOSITORY_COMMIT,
      archivePath: DIGIT_ARCHIVE_PATH,
      archiveBytes: DIGIT_ARCHIVE_BYTES,
      selectedObjects: report.denominators.selectedNoRosbagClosure.units,
      selectedCompressedBytes: report.denominators.selectedNoRosbagClosure.compressedBytes,
      selectedUncompressedBytes: report.denominators.selectedNoRosbagClosure.uncompressedBytes,
      historicalTraces: report.denominators.historicalTraces.units,
      publisherNumericLabelZeroTraces: report.denominators.historicalTraces.units,
      artifactHash: report.artifactHash,
      receiptHash: receipt.receiptHash,
      reportFileSha256: receipt.reportFileSha256,
      sourceManifestHash: report.source.manifestHash,
      sourceManifestFileSha256: report.source.manifestFileSha256,
      sourceRoot: report.source.sourceRoot,
      verificationLevel: directoryReplay.verificationLevel,
      safeUnsafeClassificationEstablished: false,
      independentOutcomeEstablished: false,
      recoveryEstablished: false,
      trainingRows: 0,
      networkAdmissionRows: 0,
      CEU: 0,
      pricingUnits: 0,
      authorityUnits: 0,
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result;
  } catch (error) {
    const stagedSource = path.join(staging, "source");
    if (!published && !existsSync(checkpoint) && existsSync(stagedSource)) {
      renameSync(stagedSource, checkpoint);
    }
    if (!published && existsSync(staging)) rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
