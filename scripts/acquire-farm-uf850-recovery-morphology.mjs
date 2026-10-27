#!/usr/bin/env node

import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  FARM_DATASET_ID,
  FARM_REVISION,
  acquirePinnedFarmUf850Source,
  buildFarmUf850Receipt,
  buildFarmUf850ReportFromSource,
  publishFarmUf850ArtifactDirectory,
  verifyFarmUf850ArtifactDirectory,
  verifyFarmUf850Receipt,
  verifyFarmUf850Report,
  verifyFarmUf850ReportWithSource,
  verifyFarmUf850SourceDirectory,
} from "../src/outsider-farm-uf850-recovery-morphology.js";

const DEFAULT_OUTPUT = "artifacts/outsider-farm-uf850-recovery-morphology-20260829-v1";

function fail(code, detail = null) {
  throw new Error(detail === null ? `FARM_UF850_CLI_${code}`
    : `FARM_UF850_CLI_${code}:${detail}`);
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
      "  node scripts/acquire-farm-uf850-recovery-morphology.mjs [--output <new-dir>]",
      "",
      `Pins ${FARM_DATASET_ID}@${FARM_REVISION}.`,
      "Enumerates the complete 66-episode historical revision before and after acquisition.",
      "Downloads README, .gitattributes, meta/*, and all 66 Parquet episodes",
      "(72 files / 3,002,236 bytes); excludes all 132 MP4 objects.",
      "Publisher task strings establish nine within-episode recovery morphologies only.",
      "No physical object outcome, independent witness, complete attempt census, training,",
      "network admission, CEU, pricing, or execution authority is created.",
    ].join("\n") + "\n");
    return { ok: true, help: true };
  }
  const target = targetInsideWorkspace(args.output);
  if (existsSync(target)) fail("OUTPUT_EXISTS", target);
  requireSafeParent(path.dirname(target));
  const checkpoint = `${target}.source-checkpoint`;
  let sourceAcquiredThisRun = false;
  if (existsSync(checkpoint)) {
    const checked = verifyFarmUf850SourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_PINNED_NO_VIDEO_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_INVALID", checked.error);
    }
  } else {
    process.stderr.write("Acquiring pinned FARM UF850 complete no-video closure...\n");
    await acquirePinnedFarmUf850Source(checkpoint);
    sourceAcquiredThisRun = true;
    const checked = verifyFarmUf850SourceDirectory(checkpoint);
    if (!checked.ok || checked.verificationLevel !== "FULL_PINNED_NO_VIDEO_SOURCE_REPLAY") {
      fail("SOURCE_CHECKPOINT_REPLAY_FAILED", checked.error);
    }
  }
  const staging = path.join(path.dirname(target),
    `.${path.basename(target)}.staging-${process.pid}-${randomBytes(8).toString("hex")}`);
  mkdirSync(staging, { mode: 0o700 });
  chmodSync(staging, 0o700);
  process.stderr.write("Building full-source-rederived FARM morphology report...\n");
  const report = buildFarmUf850ReportFromSource(checkpoint);
  const standalone = verifyFarmUf850Report(report);
  if (!standalone.ok) fail("STANDALONE_REPORT_INVALID", standalone.error);
  const replay = verifyFarmUf850ReportWithSource(report, checkpoint);
  if (!replay.ok || replay.verificationLevel !== "FULL_PINNED_NO_VIDEO_SOURCE_REDERIVED") {
    fail("FULL_SOURCE_REPLAY_FAILED", replay.error);
  }
  const reportBytes = canonicalBytes(report);
  const receipt = buildFarmUf850Receipt(report, reportBytes);
  const receiptBytes = canonicalBytes(receipt);
  if (!verifyFarmUf850Receipt(receipt, report, reportBytes).ok) fail("RECEIPT_INVALID");
  writePrivate(path.join(staging, "report.json"), reportBytes);
  renameSync(checkpoint, path.join(staging, "source"));
  writePrivate(path.join(staging, "run-receipt.json"), receiptBytes);
  publishFarmUf850ArtifactDirectory(staging, target);
  const artifact = verifyFarmUf850ArtifactDirectory(target);
  if (!artifact.ok) fail("PUBLISHED_ARTIFACT_INVALID", artifact.error);
  const result = { ok: true, outputDirectory: target, sourceAcquiredThisRun,
    datasetId: FARM_DATASET_ID, pinnedRevision: FARM_REVISION,
    selectedNoVideoFiles: 72, selectedNoVideoBytes: 3_002_236,
    excludedVideoFiles: 132, excludedVideoBytes: 229_556_112,
    keptRealRobotEpisodes: 66, frames: 25_803, taskDescriptions: 17,
    publisherRecoveryMorphologyEpisodes: 9,
    publisherExcludedEarlyDemosClaim: 41,
    completeAttemptCensusEstablished: false,
    artifactHash: report.artifactHash, receiptHash: receipt.receiptHash,
    reportFileSha256: artifact.reportFileSha256,
    receiptFileSha256: artifact.receiptFileSha256,
    sourceRoot: report.source.sourceRoot,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: report.source.sourceManifestFileSha256,
    verificationLevel: artifact.verificationLevel,
    independentOutcomeUnits: 0, verifiedRecoveryEffectUnits: 0,
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

