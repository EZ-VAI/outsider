import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ANDRESG_RECOVERY_DISPOSITION, ANDRESG_RECOVERY_SCOPE,
  ANDRESG_RECOVERY_SOURCES,
  verifyAndresgRecoveryArtifactDirectory,
} from "../src/outsider-andresg-recovery-name-family.js";

const artifact = path.resolve(
  "artifacts/outsider-andresg-recovery-name-family-20260830-v1");
const report = JSON.parse(readFileSync(path.join(artifact, "report.json")));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function walkModes(root, prefix = "") {
  const target = prefix === "" ? root : path.join(root, prefix);
  const status = lstatSync(target);
  assert.equal(status.isSymbolicLink(), false);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600);
  if (!status.isDirectory()) return;
  for (const name of readdirSync(target)) {
    walkModes(root, prefix === "" ? name : `${prefix}/${name}`);
  }
}

test("official author discovery closes the literal recovery ID scope", () => {
  assert.equal(report.disposition, ANDRESG_RECOVERY_DISPOSITION);
  assert.equal(report.scope.kind, ANDRESG_RECOVERY_SCOPE);
  assert.equal(report.scope.authorFullListDatasets, 56);
  assert.equal(report.scope.literalRecoveryIdRepositories, 11);
  assert.equal(report.scope.fixedRevisionRepositories, 11);
  assert.equal(report.scope.completePinnedNoVideoObjects, 77);
  assert.equal(report.scope.completePinnedNoVideoBytes, 12_264_506);
  assert.equal(report.scope.selectedUniquePayloads, 57);
  assert.equal(report.scope.selectedUniquePayloadBytes, 12_217_566);
  assert.equal(report.scope.fullTreeEntries, 209);
  assert.equal(report.scope.fullTreeFiles, 99);
  assert.equal(report.scope.fullTreeDirectories, 110);
  assert.equal(report.scope.fullTreeFileBytes, 1_462_198_009);
  assert.equal(report.scope.declaredLiteralRecoveryNameScopeExhausted, true);
  assert.equal(report.scope.authorDatasetUniverseExhausted, false);
  assert.equal(report.scope.globalSourceUniverseExhausted, false);
  assert.equal(report.source.authorDiscovery.rawResponseBeforeAfterExact, true);
  assert.equal(report.source.authorDiscovery.selectedProjectionBeforeAfterExact,
    true);
  assert.equal(report.source.completeTreeSnapshots, 22);
  assert.equal(report.source.sources.length, 11);
  assert.deepEqual(report.source.sources.map((row) => row.revision),
    ANDRESG_RECOVERY_SOURCES.map((row) => row.revision));
  for (const row of report.source.sources) {
    assert.equal(row.publicAtAcquisition, true);
    assert.equal(row.gatedAtAcquisition, false);
    assert.equal(row.recordStableProjectionBeforeAfterExact, true);
    assert.equal(row.treeStableProjectionBeforeAfterExact, true);
    assert.equal(row.recordResponseBeforeAfterExact, true);
    assert.equal(row.treeResponseBeforeAfterExact, true);
  }
});

test("all eleven complete no-video repositories replay 210 episodes and 175611 rows", () => {
  const expected = {
    cube: [50, 32_170], recovery: [16, 12_737],
    new_positions: [16, 18_373], different_object: [16, 12_778],
    distractors: [16, 10_024], reduced_lighting: [16, 13_897],
    seed2000: [16, 13_230], seed_diff: [16, 16_838],
    seed_distractors: [16, 10_931], seed_light: [16, 16_273],
    seed_positions: [16, 18_360],
  };
  assert.equal(report.replay.family.repositoryCount, 11);
  assert.equal(report.replay.family.repositoryEpisodeOccurrences, 210);
  assert.equal(report.replay.family.repositoryFrameOccurrences, 175_611);
  assert.deepEqual(report.replay.schema.dataColumns,
    ["action", "observation.state", "timestamp", "frame_index",
      "episode_index", "index", "task_index"]);
  assert.equal(report.replay.schema.actionDimensions, 6);
  assert.equal(report.replay.schema.stateDimensions, 6);
  for (const [key, [episodes, frames]] of Object.entries(expected)) {
    const row = report.replay.repositories[key];
    assert.equal(row.episodes, episodes);
    assert.equal(row.frames, frames);
    assert.equal(row.rowGroups, episodes);
    assert.equal(row.uniqueTrajectoryHashes, episodes);
    assert.equal(row.finiteActionStateTimestampRows, frames);
    assert.deepEqual(row.nativeDataBoundaryFields, []);
    assert.deepEqual(row.nativeEpisodeBoundaryFields, []);
    assert.equal(row.publisherRobotType, "so_follower");
  }
  assert.equal(report.mechanics.finiteActionStateTimestampRepositoryFrameOccurrences,
    175_611);
  assert.equal(report.replay.task.taskPayloadSha256,
    "sha256:048baff29f66665f22642d0d7b272193858829ec3eacd2c324f759a2ea84a524");
  assert.equal(report.replay.task.taskPayloadProjected, false);
});

test("exact trajectory hashes are distinct but do not create paired chronology", () => {
  assert.equal(report.replay.family.trajectoryProfiles.length, 210);
  assert.equal(report.replay.family.uniqueExactTrajectoryHashes, 210);
  assert.equal(report.replay.family.trajectoryHashCollisions, 0);
  assert.equal(new Set(report.replay.family.trajectoryProfiles.map((row) =>
    row.trajectoryHash)).size, 210);
  assert.equal(report.linkedFamily.exactTrajectoryHashOverlapAcrossRepositories, 0);
  assert.equal(report.linkedFamily.conditionPairProfiles.length, 5);
  for (const pair of report.linkedFamily.conditionPairProfiles) {
    assert.equal(pair.defaultEpisodes, 16);
    assert.equal(pair.seed2000Episodes, 16);
    assert.equal(pair.exactTrajectoryHashOverlap, 0);
    assert.equal(pair.localEpisodeIndexUsedAsPairKey, false);
  }
  assert.equal(report.linkedFamily.localEpisodeIndexPromotedToCrossRepositoryPairKey,
    false);
  assert.equal(report.linkedFamily.repositoryTimestampsPromotedToTrajectoryChronology,
    false);
  assert.equal(report.linkedFamily.seedNamePromotedToExecutedRandomSeed, false);
  assert.equal(report.linkedFamily.conditionNamePromotedToObservedEnvironment, false);
  assert.equal(report.linkedFamily.exactRecordHashUniquenessEstablishesUnderlyingExecutionUniqueness,
    false);
  assert.equal(report.linkedFamily.globalUnderlyingExecutionCount, null);
});

test("recovery naming remains naming rather than outcome, effect, or attempt evidence", () => {
  assert.equal(report.repositoryNaming.allSelectedIdsContainLiteralRecovery, true);
  assert.equal(report.repositoryNaming.literalRecoveryNamingPromotedToNativeRecoveryField,
    false);
  assert.equal(report.repositoryNaming.literalRecoveryNamingPromotedToObservedRecovery,
    false);
  assert.equal(report.repositoryNaming.literalRecoveryNamingPromotedToOutcome,
    false);
  assert.deepEqual(report.outcome.directDataSuccessFailureOutcomeFields, []);
  assert.deepEqual(report.outcome.directEpisodeSuccessFailureOutcomeFields, []);
  assert.equal(report.outcome.publisherOutcomeLabelRows, 0);
  assert.equal(report.outcome.independentlyVerifiedOutcomeRows, 0);
  assert.equal(report.outcome.independentEffectRows, 0);
  assert.equal(report.outcome.completeCollectionAttemptCensusRows, 0);
  assert.deepEqual(report.recovery.byteNativeInterventionFields, []);
  assert.deepEqual(report.recovery.byteNativeRecoveryFields, []);
  assert.equal(report.recovery.repositoryNamingPromotedToRecovery, false);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
  assert.equal(report.recovery.causalRecoveryEffectRows, 0);
  assert.equal(report.execution.independentlyVerifiedPhysicalExecutionRows, 0);
  assert.equal(report.scope.globalUnderlyingExecutionCount, null);
});

test("video, sidecar, rights, privacy, and use populations remain closed", () => {
  assert.equal(report.videoInventory.physicalObjects, 22);
  assert.equal(report.videoInventory.physicalBytes, 1_449_933_503);
  assert.equal(report.videoInventory.uniquePayloadClaims, 22);
  assert.deepEqual(report.videoInventory.payloadOccurrenceCounts, { 1: 22 });
  assert.equal(report.videoInventory.rawVideoObjectsAcquired, 0);
  assert.equal(report.videoInventory.rawVideoBytesAcquired, 0);
  assert.equal(report.sidecarDrift.stateActionScalarStatsCount, 175_611);
  assert.equal(report.sidecarDrift.imageStatsCountOneModalityPerRepository, 32_299);
  assert.equal(report.sidecarDrift.imageStatsCountShortfallFromRepositoryFrames,
    143_312);
  assert.equal(report.sidecarDrift.imageStatsCountInterpretedAsMissingVisualFrames,
    false);
  assert.equal(report.privacy.noPiiOrSensitiveDataGuaranteed, false);
  assert.equal(report.rights.fixedTreeReadmeFiles, 11);
  assert.equal(report.rights.fixedTreeLicenseTextFiles, 0);
  assert.equal(report.rights.datasetRightsIndependentlyAdjudicated, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.deepEqual(report.boundary, {
    authorityRows: 0, authorizedTrainingRows: 0,
    autonomousActionAuthorized: false, ceuRows: 0,
    completeAttemptCensusRows: 0, independentEffectRows: 0,
    independentlyVerifiedOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0, networkAdmissionRows: 0,
    offlineTrainingRows: 0, productionTrainingRows: 0,
  });
  const manifest = JSON.parse(readFileSync(path.join(artifact,
    "source/source-manifest.json"), "utf8"));
  assert.equal(manifest.sourceObjects.length, 123);
  assert.equal(manifest.videoInventory.physicalEntries.length, 22);
  assert.equal(manifest.videoInventory.payloadProfiles.length, 22);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyAndresgRecoveryArtifactDirectory(artifact, {
    pythonExecutable: "/opt/anaconda3/bin/python",
  });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:1c752fcb974686ea159a82161dd06a8545da0821434009710733121c57ef16f9");
  assert.equal(checked.receipt.receiptHash,
    "sha256:e6dbf68014633803a83479485a3dbd59162188b4399467c54b0eafaf6fe0f090");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-andresg-recovery-name-family.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
