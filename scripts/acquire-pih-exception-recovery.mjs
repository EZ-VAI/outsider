#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  PIH_ARCHIVE_BYTES,
  PIH_ARCHIVE_MD5,
  PIH_DOI,
  PIH_RECORD_ID,
  acquirePinnedPihExceptionRecoverySource,
  buildPihExceptionRecoveryReceipt,
  buildPihExceptionRecoveryReportFromSource,
  publishPihExceptionRecoveryArtifactDirectory,
  verifyPihExceptionRecoveryArtifactDirectory,
  verifyPihExceptionRecoveryReceipt,
  verifyPihExceptionRecoveryReport,
  verifyPihExceptionRecoveryReportWithSource,
  verifyPihExceptionRecoverySourceDirectory,
} from "../src/outsider-pih-exception-recovery.js";
import { canonicalizeStrict } from "../src/canonical.js";

const DEFAULT_OUTPUT = "artifacts/outsider-pih-exception-recovery-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `PIH_EXCEPTION_RECOVERY_CLI_${code}`
    : `PIH_EXCEPTION_RECOVERY_CLI_${code}:${detail}`);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = { output: DEFAULT_OUTPUT, python: "/opt/anaconda3/bin/python" };
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
      "  node scripts/acquire-pih-exception-recovery.mjs [--output <new-dir>] [--python <mat-python>]",
      "",
      `Pins Zenodo record ${PIH_RECORD_ID} (${PIH_DOI}) and its ${PIH_ARCHIVE_BYTES}-byte archive.`,
      "Enumerates the complete ZIP64 central directory by strict HTTP Range, then extracts only",
      "the predeclared x=-10 mm/y=-10 mm, 0/0/0-degree error and correction_trajectory_1 MAT pair.",
      `The publisher archive checksum remains an unrecomputed claim (${PIH_ARCHIVE_MD5}).`,
      "A fully replayed private source checkpoint is sealed before MAT projection and resumed safely.",
      "This is offline morphology analysis only; it establishes no correction success or authority.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }
  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const checkpoint = `${target}.source-checkpoint`;
  let sourceAcquiredThisRun = false;
  if (existsSync(checkpoint)) {
    const checked = verifyPihExceptionRecoverySourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_BOUNDED_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_INVALID", checkpoint);
    }
  } else {
    await acquirePinnedPihExceptionRecoverySource(checkpoint);
    sourceAcquiredThisRun = true;
    const checked = verifyPihExceptionRecoverySourceDirectory(checkpoint);
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
    const report = buildPihExceptionRecoveryReportFromSource(checkpoint,
      { pythonExecutable: args.python });
    const standalone = verifyPihExceptionRecoveryReport(report);
    if (!standalone.ok) fail("STANDALONE_REPORT_INVALID", standalone.error);
    const replay = verifyPihExceptionRecoveryReportWithSource(report,
      checkpoint, { pythonExecutable: args.python });
    if (!replay.ok || replay.verificationLevel !== "FULL_BOUNDED_SOURCE_REDERIVED") {
      fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
    }
    const reportBytes = canonicalBytes(report);
    const receipt = buildPihExceptionRecoveryReceipt(report, reportBytes);
    const receiptBytes = canonicalBytes(receipt);
    if (!verifyPihExceptionRecoveryReceipt(receipt, report, reportBytes).ok) {
      fail("RUN_RECEIPT_INVALID");
    }
    writePrivate(path.join(staging, "report.json"), reportBytes);
    writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
    renameSync(checkpoint, path.join(staging, "source"));
    publishPihExceptionRecoveryArtifactDirectory(staging, target);
    published = true;
    const directoryReplay = verifyPihExceptionRecoveryArtifactDirectory(target,
      { pythonExecutable: args.python });
    if (!directoryReplay.ok) fail("PUBLISHED_ARTIFACT_REPLAY_FAILED", directoryReplay.error);
    const result = {
      ok: true,
      outputDirectory: target,
      sourceAcquiredThisRun,
      recordId: PIH_RECORD_ID,
      doi: PIH_DOI,
      archiveBytes: PIH_ARCHIVE_BYTES,
      archiveInventoryEntries: report.denominators.archiveInventory.units,
      archiveFileEntries: report.denominators.archiveInventory.fileEntries,
      archiveErrorTrajectories: report.denominators.archiveInventory.errorTrajectoryEntries,
      archiveCorrectionTrajectories:
        report.denominators.archiveInventory.correctionTrajectoryEntries,
      morphologyPairs: report.denominators.boundedPair.units,
      selectedUncompressedBytes: report.denominators.boundedPair.selectedUncompressedBytes,
      artifactHash: report.artifactHash,
      receiptHash: receipt.receiptHash,
      reportFileSha256: receipt.reportFileSha256,
      sourceManifestHash: report.source.manifestHash,
      sourceManifestFileSha256: report.source.manifestFileSha256,
      sourceRoot: report.source.sourceRoot,
      verificationLevel: directoryReplay.verificationLevel,
      correctionSuccessEstablished: false,
      independentOutcomeEstablished: false,
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
