#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ME_AD_ARCHIVE_BYTES,
  ME_AD_DOI,
  ME_AD_PROGRESSIVE_FAULT_CONSTANTS,
  acquirePinnedMeAdProgressiveFaultSource,
  buildMeAdProgressiveFaultFromSource,
  buildMeAdProgressiveFaultRunReceipt,
  publishMeAdProgressiveFaultArtifactDirectory,
  verifyMeAdProgressiveFaultArtifactDirectory,
  verifyMeAdProgressiveFaultReport,
  verifyMeAdProgressiveFaultRunReceipt,
  verifyMeAdProgressiveFaultSourceDirectory,
  verifyMeAdProgressiveFaultWithSource,
} from "../src/outsider-me-ad-progressive-fault.js";
import { canonicalizeStrict } from "../src/canonical.js";

const DEFAULT_OUTPUT = "artifacts/outsider-me-ad-progressive-fault-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? "ME_AD_CLI_" + code
    : "ME_AD_CLI_" + code + ":" + detail);
}

function canonicalBytes(value) {
  return Buffer.from(canonicalizeStrict(value) + "\n", "utf8");
}

function parseArgs(argv) {
  const parsed = { command: "acquire", output: DEFAULT_OUTPUT, source: null };
  let commandSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!commandSeen && ["acquire", "verify", "verify-source"].includes(argument)) {
      parsed.command = argument;
      commandSeen = true;
    } else if (argument === "--output" && argv[index + 1]) {
      parsed.output = argv[++index];
    } else if (argument === "--source" && argv[index + 1]) {
      parsed.source = argv[++index];
    } else if (["--help", "-h", "help"].includes(argument)) {
      parsed.help = true;
    } else fail("ARGUMENT_INVALID", argument);
  }
  return parsed;
}

function targetInsideWorkspace(value) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(".." + path.sep)
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

function printResult(result) {
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  return result;
}

function verifyArtifact(output) {
  const checked = verifyMeAdProgressiveFaultArtifactDirectory(path.resolve(output));
  if (!checked.ok) fail("ARTIFACT_VERIFY_FAILED", checked.errors.join(","));
  return printResult({ ok: true, outputDirectory: path.resolve(output), ...checked });
}

function verifySource(source) {
  const checked = verifyMeAdProgressiveFaultSourceDirectory(path.resolve(source));
  return printResult({
    ok: true,
    sourceDirectory: checked.sourceDirectory,
    verificationLevel: checked.verificationLevel,
    sourceManifestHash: checked.manifest.manifestHash,
    sourceManifestFileSha256: checked.manifestFileSha256,
    sourceRoot: checked.sourceRoot,
    selectedCompressedBytes: checked.selectedCompressedBytes,
    selectedRawBytes: checked.selectedRawBytes,
  });
}

async function acquire(output) {
  const target = targetInsideWorkspace(output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const staging = path.join(path.dirname(target), "." + path.basename(target)
    + ".staging-" + process.pid + "-" + randomBytes(8).toString("hex"));
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  let targetClaimed = false;
  let sourceAcquired = false;
  try {
    const acquisition = await acquirePinnedMeAdProgressiveFaultSource(
      path.join(staging, "source"));
    sourceAcquired = true;
    const report = buildMeAdProgressiveFaultFromSource(acquisition.sourceDirectory);
    const standalone = verifyMeAdProgressiveFaultReport(report);
    if (!standalone.ok) fail("REPORT_INVALID", standalone.errors.join(","));
    const fullReplay = verifyMeAdProgressiveFaultWithSource(report,
      acquisition.sourceDirectory);
    if (!fullReplay.ok || fullReplay.verificationLevel !== "FULL_SOURCE_REDERIVED") {
      fail("SOURCE_REPLAY_FAILED", fullReplay.errors.join(","));
    }
    const reportBytes = canonicalBytes(report);
    const receipt = buildMeAdProgressiveFaultRunReceipt(report, reportBytes);
    const receiptBytes = canonicalBytes(receipt);
    if (!verifyMeAdProgressiveFaultRunReceipt(receipt, reportBytes).ok) {
      fail("RECEIPT_INVALID");
    }
    writePrivate(path.join(staging, "me-ad-progressive-fault.json"), reportBytes);
    writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
    publishMeAdProgressiveFaultArtifactDirectory(staging, target);
    targetClaimed = true;
    const published = verifyMeAdProgressiveFaultArtifactDirectory(target);
    if (!published.ok) fail("PUBLISHED_ARTIFACT_INVALID", published.errors.join(","));
    return printResult({
      ok: true,
      outputDirectory: target,
      doi: ME_AD_DOI,
      parentArchiveBytes: ME_AD_ARCHIVE_BYTES,
      parentArchiveDownloaded: false,
      centralDirectoryEntries: ME_AD_PROGRESSIVE_FAULT_CONSTANTS.centralEntries,
      centralDirectoryBytes: ME_AD_PROGRESSIVE_FAULT_CONSTANTS.centralBytes,
      selectedOperationCode: "1100",
      selectedMechanicalTraceUnits: 3,
      selectedRows: report.sourceReplay.selectedRawRows,
      selectedRawBytes: report.sourceReplay.selectedRawCycleTraceBytes,
      selectedCompressedBytes: report.sourceReplay.selectedCompressedBytes,
      artifactHash: report.artifactHash,
      reportFileSha256: published.reportFileSha256,
      receiptHash: receipt.receiptHash,
      sourceManifestHash: report.sourceReplay.sourceManifestHash,
      sourceManifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      verificationLevel: published.verificationLevel,
      independentFaultTruthRecords: 0,
      independentOutcomeRecords: 0,
      recoveryRecords: 0,
      delegationRecords: 0,
      authorizedTrainingRows: 0,
      networkContributionRecords: 0,
      CEURecords: 0,
      authorityDelta: 0,
    });
  } catch (error) {
    if (!sourceAcquired && !targetClaimed && !existsSync(target) && existsSync(staging)) {
      rmSync(staging, { recursive: true, force: true });
    }
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    return printResult({
      ok: true,
      usage: [
        "node scripts/acquire-me-ad-progressive-fault.mjs acquire [--output <new-dir>]",
        "node scripts/acquire-me-ad-progressive-fault.mjs verify [--output <artifact-dir>]",
        "node scripts/acquire-me-ad-progressive-fault.mjs verify-source --source <source-dir>",
      ],
      boundary: "Downloads the complete ZIP64 central directory and three raw CSV traces, not the 10.8 GB archive.",
    });
  }
  if (args.command === "verify") return verifyArtifact(args.output);
  if (args.command === "verify-source") {
    return verifySource(args.source ?? path.join(args.output, "source"));
  }
  return acquire(args.output);
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}
