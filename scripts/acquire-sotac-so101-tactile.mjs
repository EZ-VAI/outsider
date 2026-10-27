#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  SOTAC_DATASET_ID,
  SOTAC_REVISION,
  acquirePinnedSotacSo101Source,
  buildSotacSo101RunReceipt,
  buildSotacSo101TactileFromSource,
  publishSotacSo101ArtifactDirectory,
  verifySotacSo101ArtifactDirectory,
  verifySotacSo101RunReceipt,
  verifySotacSo101SourceDirectory,
  verifySotacSo101TactileReport,
  verifySotacSo101TactileWithSource,
} from "../src/outsider-sotac-so101-tactile.js";
import { canonicalizeStrict } from "../src/canonical.js";

const DEFAULT_OUTPUT = "artifacts/outsider-sotac-so101-tactile-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `SOTAC_SO101_CLI_${code}`
    : `SOTAC_SO101_CLI_${code}:${detail}`);
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function parseArgs(argv) {
  const parsed = { command: "acquire", output: DEFAULT_OUTPUT,
    source: null, sourceCandidate: null, python: ".venv/bin/python" };
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

function pathInsideWorkspace(value, allowExisting = true) {
  const workspace = path.resolve(process.cwd());
  const target = path.resolve(value);
  const relative = path.relative(workspace, target);
  if (relative === "" || relative === ".." || relative.startsWith(`..${path.sep}`)
    || path.isAbsolute(relative) || target === path.parse(target).root
    || !allowExisting && existsSync(target)) fail("PATH_INVALID", target);
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

function printResult(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
  return value;
}

function verifyArtifact(output, python) {
  const checked = verifySotacSo101ArtifactDirectory(path.resolve(output),
    { pythonExecutable: python });
  if (!checked.ok) fail("ARTIFACT_VERIFY_FAILED", checked.errors.join(","));
  return printResult({ ok: true, outputDirectory: path.resolve(output), ...checked });
}

function verifySource(source) {
  const checked = verifySotacSo101SourceDirectory(path.resolve(source));
  return printResult({ ok: true, sourceDirectory: checked.sourceDirectory,
    verificationLevel: checked.verificationLevel,
    sourceManifestHash: checked.manifest.manifestHash,
    sourceManifestFileSha256: checked.manifestFileSha256,
    sourceRoot: checked.sourceRoot,
    treeSnapshotHash: checked.treeSnapshotHash });
}

async function acquire(args) {
  const target = pathInsideWorkspace(args.output, false);
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
      verifySotacSo101SourceDirectory(candidate);
      sourceDirectory = candidate;
    } else {
      const acquired = await acquirePinnedSotacSo101Source(path.join(staging, "source"));
      sourceDirectory = acquired.sourceDirectory;
      sourceReady = true;
    }
    const report = buildSotacSo101TactileFromSource(sourceDirectory,
      { pythonExecutable: args.python });
    const standalone = verifySotacSo101TactileReport(report);
    if (!standalone.ok) fail("REPORT_INVALID", standalone.errors.join(","));
    const replay = verifySotacSo101TactileWithSource(report, sourceDirectory,
      { pythonExecutable: args.python });
    if (!replay.ok || replay.verificationLevel !== "FULL_SOURCE_REDERIVED") {
      fail("SOURCE_REPLAY_FAILED", replay.errors.join(","));
    }
    if (args.sourceCandidate !== null) {
      renameSync(sourceDirectory, path.join(staging, "source"));
      sourceDirectory = path.join(staging, "source");
      sourceReady = true;
    }
    const reportBytes = canonicalBytes(report);
    const receipt = buildSotacSo101RunReceipt(report, reportBytes);
    const receiptBytes = canonicalBytes(receipt);
    if (!verifySotacSo101RunReceipt(receipt, reportBytes).ok) fail("RECEIPT_INVALID");
    writePrivate(path.join(staging, "sotac-so101-tactile.json"), reportBytes);
    writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
    publishSotacSo101ArtifactDirectory(staging, target);
    targetClaimed = true;
    const published = verifySotacSo101ArtifactDirectory(target,
      { pythonExecutable: args.python });
    if (!published.ok) fail("PUBLISHED_ARTIFACT_INVALID", published.errors.join(","));
    return printResult({ ok: true, outputDirectory: target,
      datasetId: SOTAC_DATASET_ID, revision: SOTAC_REVISION,
      artifactHash: report.artifactHash,
      reportFileSha256: published.reportFileSha256,
      receiptHash: receipt.receiptHash,
      sourceManifestHash: report.sourceReplay.sourceManifestHash,
      sourceManifestFileSha256: report.sourceReplay.sourceManifestFileSha256,
      sourceRoot: report.sourceReplay.sourceRoot,
      verificationLevel: published.verificationLevel,
      curatedEpisodes: report.population.curatedRealRobotTeleopEpisodes,
      mainFrames30Hz: report.population.mainTableFrames30Hz,
      rawDualFingerTimesteps: report.tactileEvidence.rawSidecars.dualFingerTimesteps,
      cameraBytesFetched: 0, independentOutcomeRecords: 0,
      independentRecoveryRecords: 0, delegationRecords: 0,
      authorizedTrainingRows: 0, networkContributionRecords: 0,
      CEURecords: 0, authorityDelta: 0 });
  } catch (error) {
    if (!sourceReady && !targetClaimed && !existsSync(target) && existsSync(staging)) {
      rmSync(staging, { recursive: true, force: true });
    }
    throw error;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) return printResult({ ok: true, usage: [
    "node scripts/acquire-sotac-so101-tactile.mjs acquire [--output <new-dir>] [--python <path>]",
    "node scripts/acquire-sotac-so101-tactile.mjs acquire --source-candidate <dir> [--output <new-dir>]",
    "node scripts/acquire-sotac-so101-tactile.mjs verify [--output <artifact-dir>] [--python <path>]",
    "node scripts/acquire-sotac-so101-tactile.mjs verify-source --source <source-dir>",
  ], boundary: "Full fixed-revision curated no-video closure; not a failure census or independent outcome source." });
  if (args.command === "verify") return verifyArtifact(args.output, args.python);
  if (args.command === "verify-source") {
    return verifySource(args.source ?? path.join(args.output, "source"));
  }
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
