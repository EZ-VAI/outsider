#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  ZENODO_7240050_ARCHIVE_BYTES,
  ZENODO_7240050_COLLISION_CONSTANTS,
  ZENODO_7240050_DOI,
  acquirePinnedZenodo7240050CollisionSource,
  buildZenodo7240050CollisionExperimentFromSource,
  buildZenodo7240050CollisionRunReceipt,
  publishZenodo7240050CollisionArtifactDirectory,
  verifyZenodo7240050CollisionArtifactDirectory,
  verifyZenodo7240050CollisionExperimentReport,
  verifyZenodo7240050CollisionExperimentWithSource,
  verifyZenodo7240050CollisionRunReceipt,
  verifyZenodo7240050CollisionSourceDirectory,
} from "../src/outsider-zenodo7240050-collision-experiment.js";
import { canonicalizeStrict } from "../src/canonical.js";

const DEFAULT_OUTPUT
  = "artifacts/outsider-zenodo7240050-collision-experiment-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `ZENODO_7240050_CLI_${code}`
    : `ZENODO_7240050_CLI_${code}:${detail}`);
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
  process.stderr.write(`${JSON.stringify({ zenodo7240050Progress: value })}\n`);
}

function verifyArtifact(args) {
  const checked = verifyZenodo7240050CollisionArtifactDirectory(path.resolve(args.output));
  if (!checked.ok) fail("ARTIFACT_VERIFY_FAILED", checked.errors.join(","));
  return printResult({ ok: true, outputDirectory: path.resolve(args.output), ...checked });
}

function verifySource(args) {
  const source = path.resolve(args.source ?? path.join(args.output, "source"));
  const checked = verifyZenodo7240050CollisionSourceDirectory(source);
  return printResult({ ok: true, sourceDirectory: source,
    verificationLevel: checked.verificationLevel,
    sourceManifestHash: checked.manifest.manifestHash,
    sourceManifestFileSha256: checked.manifestFileSha256,
    sourceRoot: checked.sourceRoot,
    archiveEntries: checked.inventory.counts.entries,
    archiveBagFiles: checked.inventory.counts.rosBagFiles,
    selectedCompressedBytes: checked.selectedCompressedBytes,
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
      verifyZenodo7240050CollisionSourceDirectory(candidate);
      const destination = path.join(staging, "source");
      // A candidate handoff is deliberately a rename, never a copy or overwrite.
      renameSync(candidate, destination);
      sourceDirectory = destination;
      sourceReady = true;
    } else {
      const acquired = await acquirePinnedZenodo7240050CollisionSource(
        path.join(staging, "source"), { onProgress: progress });
      sourceDirectory = acquired.sourceDirectory;
      sourceReady = true;
    }
    progress({ phase: "FULL_SELECTED_CONTENT_REPLAY" });
    const report = buildZenodo7240050CollisionExperimentFromSource(sourceDirectory);
    const reportCheck = verifyZenodo7240050CollisionExperimentReport(report);
    if (!reportCheck.ok) fail("REPORT_INVALID", reportCheck.errors.join(","));
    const replayCheck = verifyZenodo7240050CollisionExperimentWithSource(report,
      sourceDirectory);
    if (!replayCheck.ok
      || replayCheck.verificationLevel !== "FULL_SELECTED_SOURCE_REDERIVED") {
      fail("SOURCE_REPLAY_FAILED", replayCheck.errors.join(","));
    }
    const reportBytes = canonicalBytes(report);
    const receipt = buildZenodo7240050CollisionRunReceipt(report, reportBytes);
    const receiptBytes = canonicalBytes(receipt);
    if (!verifyZenodo7240050CollisionRunReceipt(receipt, reportBytes).ok) {
      fail("RECEIPT_INVALID");
    }
    writePrivate(path.join(staging, "zenodo7240050-collision-experiment.json"),
      reportBytes);
    // The receipt is deliberately written after all other staging bytes.
    writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
    publishZenodo7240050CollisionArtifactDirectory(staging, target);
    targetClaimed = true;
    const published = verifyZenodo7240050CollisionArtifactDirectory(target);
    if (!published.ok) fail("PUBLISHED_ARTIFACT_INVALID", published.errors.join(","));
    return printResult({ ok: true, outputDirectory: target,
      doi: ZENODO_7240050_DOI,
      parentArchiveBytes: ZENODO_7240050_ARCHIVE_BYTES,
      parentArchiveDownloaded: false,
      completeCentralDirectoryEntries:
        ZENODO_7240050_COLLISION_CONSTANTS.centralEntries,
      selectedCollisionExperiments: 1,
      selectedRosMessageRecords: 48_520,
      externalFtMessages: 6_169,
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
    "node scripts/acquire-zenodo7240050-collision-experiment.mjs acquire [--output <new-dir>]",
    "node scripts/acquire-zenodo7240050-collision-experiment.mjs acquire --source-candidate <dir> [--output <new-dir>]",
    "node scripts/acquire-zenodo7240050-collision-experiment.mjs verify [--output <artifact-dir>]",
    "node scripts/acquire-zenodo7240050-collision-experiment.mjs verify-source --source <source-dir>",
  ], boundary: "Complete ZIP central directory plus one README-mapped collision experiment; external F/T mechanical evidence, not task outcome or recovery." });
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
