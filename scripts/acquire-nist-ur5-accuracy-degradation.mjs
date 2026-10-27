#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  NIST_UR5_ACCURACY_CONSTANTS,
  NIST_UR5_DOI,
  acquirePinnedNistUr5Source,
  buildNistUr5AccuracyDegradationFromSource,
  buildNistUr5AccuracyDegradationRunReceipt,
  publishNistUr5AccuracyDegradationArtifactDirectory,
  verifyNistUr5AccuracyDegradationArtifactDirectory,
  verifyNistUr5AccuracyDegradationReport,
  verifyNistUr5AccuracyDegradationRunReceipt,
  verifyNistUr5AccuracyDegradationWithSource,
  verifyNistUr5SourceDirectory,
} from "../src/outsider-nist-ur5-accuracy-degradation.js";
import { canonicalizeStrict } from "../src/canonical.js";

const DEFAULT_OUTPUT = "artifacts/outsider-nist-ur5-accuracy-degradation-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `NIST_UR5_CLI_${code}` : `NIST_UR5_CLI_${code}:${detail}`);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = { command: "acquire", output: DEFAULT_OUTPUT, source: null,
    sourceCandidate: null, python: ".venv/bin/python" };
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
    } else if (argument === "--python" && argv[index + 1]) parsed.python = argv[++index];
    else if (["--help", "-h", "help"].includes(argument)) parsed.help = true;
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
  process.stderr.write(`${JSON.stringify({ nistUr5Progress: value })}\n`);
}

function verifyArtifact(args) {
  const checked = verifyNistUr5AccuracyDegradationArtifactDirectory(
    path.resolve(args.output), { pythonExecutable: args.python });
  if (!checked.ok) fail("ARTIFACT_VERIFY_FAILED", checked.errors.join(","));
  return printResult({ ok: true, outputDirectory: path.resolve(args.output), ...checked });
}

function verifySource(args) {
  const source = path.resolve(args.source ?? path.join(args.output, "source"));
  const checked = verifyNistUr5SourceDirectory(source);
  return printResult({ ok: true, sourceDirectory: source,
    verificationLevel: checked.verificationLevel,
    sourceManifestHash: checked.manifest.manifestHash,
    sourceManifestFileSha256: checked.manifestFileSha256,
    sourceRoot: checked.sourceRoot,
    verifiedRemoteObjectCount: checked.verifiedRemoteObjectCount,
    verifiedRemoteBytes: checked.verifiedRemoteBytes });
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
      verifyNistUr5SourceDirectory(candidate);
      renameSync(candidate, path.join(staging, "source"));
      sourceDirectory = path.join(staging, "source");
      sourceReady = true;
    } else {
      const acquired = await acquirePinnedNistUr5Source(path.join(staging, "source"),
        { onProgress: progress });
      sourceDirectory = acquired.sourceDirectory;
      sourceReady = true;
    }
    progress({ phase: "FULL_CONTENT_REPLAY" });
    const report = buildNistUr5AccuracyDegradationFromSource(sourceDirectory,
      { pythonExecutable: args.python });
    const reportCheck = verifyNistUr5AccuracyDegradationReport(report);
    if (!reportCheck.ok) fail("REPORT_INVALID", reportCheck.errors.join(","));
    const replayCheck = verifyNistUr5AccuracyDegradationWithSource(report, sourceDirectory,
      { pythonExecutable: args.python });
    if (!replayCheck.ok || replayCheck.verificationLevel !== "FULL_SOURCE_REDERIVED") {
      fail("SOURCE_REPLAY_FAILED", replayCheck.errors.join(","));
    }
    const reportBytes = canonicalBytes(report);
    const receipt = buildNistUr5AccuracyDegradationRunReceipt(report, reportBytes);
    const receiptBytes = canonicalBytes(receipt);
    if (!verifyNistUr5AccuracyDegradationRunReceipt(receipt, reportBytes).ok) {
      fail("RECEIPT_INVALID");
    }
    writePrivate(path.join(staging, "nist-ur5-accuracy-degradation.json"), reportBytes);
    writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
    publishNistUr5AccuracyDegradationArtifactDirectory(staging, target);
    targetClaimed = true;
    const published = verifyNistUr5AccuracyDegradationArtifactDirectory(target,
      { pythonExecutable: args.python });
    if (!published.ok) fail("PUBLISHED_ARTIFACT_INVALID", published.errors.join(","));
    return printResult({ ok: true, outputDirectory: target, doi: NIST_UR5_DOI,
      remoteObjects: NIST_UR5_ACCURACY_CONSTANTS.expectedRemoteObjectCount,
      remoteBytes: NIST_UR5_ACCURACY_CONSTANTS.expectedRemoteBytes,
      controllerConditionTraces: 18,
      controllerSampleRows: NIST_UR5_ACCURACY_CONSTANTS.expectedTraceRows,
      externalPositionDeviationRecords: 6,
      artifactHash: report.artifactHash,
      reportFileSha256: published.reportFileSha256,
      receiptHash: receipt.receiptHash,
      receiptFileSha256: published.receiptFileSha256,
      sourceManifestHash: report.sourceReplay.sourceManifestHash,
      sourceManifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      verificationLevel: published.verificationLevel,
      independentOutcomeRecords: 0, recoveryRecords: 0, delegationRecords: 0,
      authorizedTrainingRows: 0, networkContributionRecords: 0,
      CEURecords: 0, authorityDelta: 0 });
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
    "node scripts/acquire-nist-ur5-accuracy-degradation.mjs acquire [--output <new-dir>] [--python <path>]",
    "node scripts/acquire-nist-ur5-accuracy-degradation.mjs acquire --source-candidate <dir> [--output <new-dir>]",
    "node scripts/acquire-nist-ur5-accuracy-degradation.mjs verify [--output <artifact-dir>] [--python <path>]",
    "node scripts/acquire-nist-ur5-accuracy-degradation.mjs verify-source --source <source-dir>",
  ], boundary: "Full 20-object official NIST closure; mechanical condition evidence, not task outcomes or delegated training." });
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
