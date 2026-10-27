#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ROBOFAC_CODE_COMMIT,
  ROBOFAC_DATASET_ID,
  ROBOFAC_DATASET_REVISION,
  acquireRoboFacRealPullCubeSource,
  publishRoboFacRealPullCubeArtifact,
  verifyRoboFacRealPullCubeSource,
} from "../src/outsider-robofac-real-pullcube.js";

function fail(message) {
  throw new Error(`ROBOFAC_ACQUIRER_${message}`);
}

function parseArgs(argv) {
  let target = null;
  let checkpoint = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--target" && target === null && index + 1 < argv.length) {
      target = argv[++index];
    } else if (argv[index] === "--resume-checkpoint" && checkpoint === null
      && index + 1 < argv.length) checkpoint = argv[++index];
    else fail("USAGE: node scripts/acquire-robofac-real-pullcube.mjs "
      + "[--target DIR] [--resume-checkpoint EXISTING_SOURCE_DIR]");
  }
  return { target, checkpoint };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const parsed = parseArgs(process.argv.slice(2));
const target = path.resolve(parsed.target ?? path.join(root, "artifacts",
  "outsider-robofac-real-pullcube-20260829-v1"));

if (existsSync(target)) fail(`TARGET_EXISTS:${target}`);
const checkpoint = parsed.checkpoint === null
  ? path.join(path.dirname(target),
    `.outsider-robofac-real-pullcube-source-${process.pid}-${Date.now()}`)
  : path.resolve(parsed.checkpoint);
if (parsed.checkpoint === null && existsSync(checkpoint)) {
  fail(`CHECKPOINT_EXISTS:${checkpoint}`);
}
if (parsed.checkpoint !== null && !existsSync(checkpoint)) {
  fail(`CHECKPOINT_MISSING:${checkpoint}`);
}

try {
  const acquired = parsed.checkpoint === null
    ? await acquireRoboFacRealPullCubeSource({ directory: checkpoint })
    : verifyRoboFacRealPullCubeSource(checkpoint).manifest;
  const verified = verifyRoboFacRealPullCubeSource(checkpoint);
  const published = publishRoboFacRealPullCubeArtifact({
    sourceDirectory: checkpoint, targetDirectory: target,
  });
  process.stdout.write(`${JSON.stringify({
    ok: true, dataset: ROBOFAC_DATASET_ID, revision: ROBOFAC_DATASET_REVISION,
    codeCommit: ROBOFAC_CODE_COMMIT, target,
    selectedFiles: acquired.selection.files, selectedBytes: acquired.selection.bytes,
    sourceRoot: verified.sourceRoot, sourceManifestHash: verified.manifestHash,
    treeSnapshotHash: verified.treeSnapshotHash,
    repositoryEntries: verified.profile.entries,
    repositoryFiles: verified.profile.files,
    repositoryDirectories: verified.profile.directories,
    repositoryBytes: verified.profile.bytes,
    treePages: verified.profile.pages,
    artifactHash: published.report.artifactHash,
    receiptHash: published.receipt.receiptHash,
    publishedExecutions: published.report.outcomesAndRecovery.selectedPublishedExecutions,
    publisherFailureLabels: published.report.outcomesAndRecovery.publisherFailureLabels,
    publisherSuccessReferenceLabels:
      published.report.outcomesAndRecovery.publisherSuccessReferenceLabels,
    correctionInstructionsExecuted:
      published.report.outcomesAndRecovery.correctionInstructionsExecuted,
    recoveryOutcomeUnits: published.report.outcomesAndRecovery.recoveryOutcomeUnits,
    independentOutcomeUnits: published.report.outcomesAndRecovery.independentOutcomeUnits,
    boundary: published.report.boundary,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, target, checkpoint,
    checkpointPreserved: existsSync(checkpoint),
    error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
  process.exitCode = 1;
}
