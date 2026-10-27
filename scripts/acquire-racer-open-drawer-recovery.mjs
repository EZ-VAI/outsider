#!/usr/bin/env node

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RACER_DATASET_ID,
  RACER_DATASET_REVISION,
  acquireRacerOpenDrawerSource,
  publishRacerOpenDrawerArtifact,
  verifyRacerOpenDrawerSource,
} from "../src/outsider-racer-open-drawer-recovery.js";

function fail(message) {
  throw new Error(`RACER_ACQUIRER_${message}`);
}

function argumentsOf(argv) {
  let target = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== "--target" || target !== null || index + 1 >= argv.length) {
      fail("USAGE: node scripts/acquire-racer-open-drawer-recovery.mjs [--target DIR]");
    }
    target = argv[index + 1];
    index += 1;
  }
  return { target };
}

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const parsed = argumentsOf(process.argv.slice(2));
const target = path.resolve(parsed.target ?? path.join(root, "artifacts",
  "outsider-racer-open-drawer-recovery-20260829-v1"));

if (existsSync(target)) fail(`TARGET_EXISTS:${target}`);
const parent = path.dirname(target);
const checkpoint = path.join(parent,
  `.outsider-racer-open-drawer-source-${process.pid}-${Date.now()}`);
if (existsSync(checkpoint)) fail(`CHECKPOINT_EXISTS:${checkpoint}`);

try {
  const acquired = await acquireRacerOpenDrawerSource({ directory: checkpoint });
  const sourceVerification = verifyRacerOpenDrawerSource(checkpoint);
  const published = publishRacerOpenDrawerArtifact({
    sourceDirectory: checkpoint,
    targetDirectory: target,
  });
  process.stdout.write(`${JSON.stringify({
    ok: true,
    dataset: RACER_DATASET_ID,
    revision: RACER_DATASET_REVISION,
    target,
    selectedFiles: acquired.selection.files,
    selectedBytes: acquired.selection.bytes,
    sourceRoot: sourceVerification.sourceRoot,
    sourceManifestHash: sourceVerification.manifestHash,
    artifactHash: published.report.artifactHash,
    manifestHash: published.manifest.manifestHash,
    admission: published.report.admission,
    completeSourceNativeGroup: published.report.slice.completeSourceNativeGroup,
    randomArchiveShardUsed: published.report.repositoryInventory.randomArchiveShardUsed,
    physicalRobotEpisode: published.report.truth.physicalRobotEpisode,
    independentOutcomeEstablished: published.report.truth.independentOutcomeEstablished,
    completeDatasetAttemptCensus:
      published.report.selectionAndCensus.completeDatasetAttemptCensus,
    pickleExecuted: published.report.safety.pickleExecuted,
    boundary: published.report.boundary,
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, target, checkpoint,
    checkpointPreserved: existsSync(checkpoint),
    error: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
  process.exitCode = 1;
}

