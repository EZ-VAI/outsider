#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ZENODO_6461868_CONSTANTS,
  ZENODO_6461868_DOI,
  acquirePinnedZenodo6461868Source,
  buildZenodo6461868JointTorqueRunReceipt,
  buildZenodo6461868JointTorqueSignalPiecesFromSource,
  publishZenodo6461868JointTorqueArtifactDirectory,
  verifyZenodo6461868JointTorqueArtifactDirectory,
  verifyZenodo6461868JointTorqueRunReceipt,
  verifyZenodo6461868JointTorqueSignalPiecesReport,
  verifyZenodo6461868JointTorqueSignalPiecesWithSource,
  verifyZenodo6461868SourceDirectory,
} from "../src/outsider-zenodo6461868-joint-torque-signal-pieces.js";
import { canonicalizeStrict } from "../src/canonical.js";

const DEFAULT_OUTPUT
  = "artifacts/outsider-zenodo6461868-joint-torque-signal-pieces-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `ZENODO_6461868_CLI_${code}`
    : `ZENODO_6461868_CLI_${code}:${detail}`);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = { command: "acquire", output: DEFAULT_OUTPUT, source: null,
    sourceCandidate: null };
  let commandSeen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!commandSeen && ["acquire", "verify", "verify-source"].includes(argument)) {
      parsed.command = argument;
      commandSeen = true;
    } else if (argument === "--output" && argv[index + 1]) parsed.output = argv[++index];
    else if (argument === "--source" && argv[index + 1]) parsed.source = argv[++index];
    else if (argument === "--source-candidate" && argv[index + 1]) {
      parsed.sourceCandidate = argv[++index];
    } else if (["--help", "-h", "help"].includes(argument)) parsed.help = true;
    else fail("ARGUMENT_INVALID", argument);
  }
  return parsed;
}

function pathInsideWorkspace(value, requireAbsent = false) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || target === path.parse(target).root
    || requireAbsent && existsSync(target)) fail("PATH_INVALID", target);
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

function printResult(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return value;
}

function progress(value) {
  process.stderr.write(`${JSON.stringify({ zenodo6461868Progress: value })}\n`);
}

function verifyArtifact(args) {
  const checked = verifyZenodo6461868JointTorqueArtifactDirectory(path.resolve(args.output));
  if (!checked.ok) fail("ARTIFACT_VERIFY_FAILED", checked.errors.join(","));
  return printResult({ ok: true, outputDirectory: path.resolve(args.output), ...checked });
}

function verifySource(args) {
  const source = path.resolve(args.source ?? path.join(args.output, "source"));
  const checked = verifyZenodo6461868SourceDirectory(source);
  return printResult({ ok: true, sourceDirectory: source,
    verificationLevel: checked.verificationLevel,
    sourceManifestHash: checked.manifest.manifestHash,
    sourceManifestFileSha256: checked.manifestFileSha256,
    sourceRoot: checked.sourceRoot,
    officialRemoteObjects: checked.inventory.counts.remoteObjects,
    officialRemoteBytes: checked.inventory.counts.totalRemoteBytes,
    selectedSignalPieces: checked.rows.length,
    selectedRawBytes: checked.selectedRawBytes });
}

async function acquire(args) {
  const target = pathInsideWorkspace(args.output, true);
  requireSafeParent(path.dirname(target));
  const staging = path.join(path.dirname(target), `.${path.basename(target)}.staging-`
    + `${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  let sourceReady = false;
  let targetClaimed = false;
  try {
    let sourceDirectory;
    if (args.sourceCandidate !== null) {
      const candidate = pathInsideWorkspace(args.sourceCandidate);
      if (!existsSync(candidate)) fail("SOURCE_CANDIDATE_MISSING", candidate);
      verifyZenodo6461868SourceDirectory(candidate);
      renameSync(candidate, path.join(staging, "source"));
      sourceDirectory = path.join(staging, "source");
      sourceReady = true;
    } else {
      const acquired = await acquirePinnedZenodo6461868Source(path.join(staging, "source"),
        { onProgress: progress });
      sourceDirectory = acquired.sourceDirectory;
      sourceReady = true;
    }
    progress({ phase: "FULL_SELECTED_CONTENT_REPLAY" });
    const report = buildZenodo6461868JointTorqueSignalPiecesFromSource(sourceDirectory);
    const reportCheck = verifyZenodo6461868JointTorqueSignalPiecesReport(report);
    if (!reportCheck.ok) fail("REPORT_INVALID", reportCheck.errors.join(","));
    const replayCheck = verifyZenodo6461868JointTorqueSignalPiecesWithSource(report,
      sourceDirectory);
    if (!replayCheck.ok
      || replayCheck.verificationLevel !== "FULL_SELECTED_SOURCE_REDERIVED") {
      fail("SOURCE_REPLAY_FAILED", replayCheck.errors.join(","));
    }
    const reportBytes = canonicalBytes(report);
    const receipt = buildZenodo6461868JointTorqueRunReceipt(report, reportBytes);
    const receiptBytes = canonicalBytes(receipt);
    if (!verifyZenodo6461868JointTorqueRunReceipt(receipt, reportBytes).ok) {
      fail("RECEIPT_INVALID");
    }
    writePrivate(path.join(staging, "zenodo6461868-joint-torque-signal-pieces.json"),
      reportBytes);
    writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
    publishZenodo6461868JointTorqueArtifactDirectory(staging, target);
    targetClaimed = true;
    const published = verifyZenodo6461868JointTorqueArtifactDirectory(target);
    if (!published.ok) fail("PUBLISHED_ARTIFACT_INVALID", published.errors.join(","));
    return printResult({ ok: true, outputDirectory: target,
      doi: ZENODO_6461868_DOI,
      officialRemoteObjects: ZENODO_6461868_CONSTANTS.files.length,
      officialRemoteBytes: ZENODO_6461868_CONSTANTS.totalRemoteBytes,
      fullCsvFilesDownloaded: false,
      selectedJointIdentifier: 1,
      selectedPublisherClasses: ["cls", "ctc", "fre"],
      selectedSignalPieces: 3,
      selectedTorqueSamples: 3_072,
      selectedBytesIncludingReadme: 55_979,
      artifactHash: report.artifactHash,
      reportFileSha256: published.reportFileSha256,
      receiptHash: receipt.receiptHash,
      receiptFileSha256: published.receiptFileSha256,
      sourceManifestHash: report.sourceReplay.sourceManifestHash,
      sourceManifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      verificationLevel: published.verificationLevel,
      independentTaskOutcomeRecords: 0,
      recoveryRecords: 0,
      delegationRecords: 0,
      authorizedTrainingRows: 0,
      networkContributionRecords: 0,
      CEURecords: 0,
      authorityDelta: 0 });
  } catch (error) {
    if (!sourceReady && !targetClaimed && !existsSync(target) && existsSync(staging)) {
      rmSync(staging, { recursive: true, force: true });
    }
    if (sourceReady && !targetClaimed && existsSync(path.join(staging, "source"))) {
      const suffix = `:RECOVERABLE_SOURCE=${path.join(staging, "source")}`;
      if (error instanceof Error) error.message += suffix;
    }
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return printResult({ ok: true, usage: [
    "node scripts/acquire-zenodo6461868-joint-torque-signal-pieces.mjs acquire [--output <new-dir>]",
    "node scripts/acquire-zenodo6461868-joint-torque-signal-pieces.mjs acquire --source-candidate <dir> [--output <new-dir>]",
    "node scripts/acquire-zenodo6461868-joint-torque-signal-pieces.mjs verify [--output <artifact-dir>]",
    "node scripts/acquire-zenodo6461868-joint-torque-signal-pieces.mjs verify-source --source <source-dir>",
  ], boundary: "Three complete publisher-native joint-1 torque rows, not whole CSV files, task outcomes, recovery or training authority." });
  if (args.command === "verify") return verifyArtifact(args);
  if (args.command === "verify-source") return verifySource(args);
  return acquire(args);
}

const invoked = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invoked) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
