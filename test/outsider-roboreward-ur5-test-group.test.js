import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ROBOREWARD_UR5_DATASET_ID,
  ROBOREWARD_UR5_DISPOSITION,
  ROBOREWARD_UR5_GROUP,
  ROBOREWARD_UR5_REVISION,
  ROBOREWARD_UR5_SCOPE,
  verifyRoboRewardUr5ArtifactDirectory,
} from "../src/outsider-roboreward-ur5-test-group.js";

const artifact = path.resolve(
  "artifacts/outsider-roboreward-ur5-test-group-20260830-v1");
const reportBytes = readFileSync(path.join(artifact, "report.json"));
const report = JSON.parse(reportBytes);

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

test("fixed source mapping closes one complete source-native test group", () => {
  assert.equal(report.disposition, ROBOREWARD_UR5_DISPOSITION);
  assert.equal(report.scope.kind, ROBOREWARD_UR5_SCOPE);
  assert.equal(report.scope.datasetId, ROBOREWARD_UR5_DATASET_ID);
  assert.equal(report.scope.revision, ROBOREWARD_UR5_REVISION);
  assert.equal(report.scope.sourceNativeGroup, ROBOREWARD_UR5_GROUP);
  assert.equal(report.scope.completePinnedSourceNativeGroupAcquired, true);
  assert.equal(report.scope.completePinnedTestMetadataAcquired, true);
  assert.equal(report.scope.selectedFiles, 103);
  assert.equal(report.scope.selectedBytes, 76_659_779);
  assert.equal(report.scope.groupVideoFiles, 100);
  assert.equal(report.scope.groupVideoBytes, 75_317_206);
  assert.equal(report.scope.completeFullDatasetPayloadAcquired, false);
  assert.equal(report.scope.globalRoboRewardSourceUniverseExhausted, false);
  assert.equal(report.source.apiSiblingInventoryFiles, 54_140);
  assert.equal(report.source.apiVideoInventoryFiles, 54_135);
  assert.deepEqual(report.source.splitVideoInventory,
    { test: 2_831, train: 45_072, val: 6_232 });
  assert.equal(report.source.recordBeforeAfterExact, true);
  assert.equal(report.source.rootTreeBeforeAfterExact, true);
  assert.equal(report.source.testTreeBeforeAfterExact, true);
  assert.equal(report.source.groupTreeBeforeAfterExact, true);
  const manifest = JSON.parse(readFileSync(
    path.join(artifact, "source/source-manifest.json"), "utf8"));
  assert.equal(manifest.sourceObjects.length, 111);
  assert.equal(manifest.completePinnedSourceNativeGroupAcquired, true);
  assert.equal(manifest.completePinnedTestMetadataAcquired, true);
});

test("complete test metadata and all 100 group rows replay exactly", () => {
  assert.equal(report.replay.metadata.rows, 2_831);
  assert.equal(report.replay.metadata.exactSchemaRows, 2_831);
  assert.equal(report.replay.metadata.uniqueFileNames, 2_831);
  assert.equal(report.replay.metadata.uniqueTaskStrings, 1_043);
  assert.equal(report.replay.metadata.sourceDatasets, 23);
  assert.deepEqual(report.replay.metadata.rewardCounts,
    { "1": 689, "2": 641, "3": 556, "4": 418, "5": 527 });
  assert.equal(report.replay.metadata.gpt5MiniCheckStringRows, 1_831);
  assert.equal(report.replay.metadata.gpt5MiniCheckNullRows, 1_000);
  assert.equal(report.replay.metadata.rowSignatureRoot,
    "sha256:44e26a058f32c62f3c8f30e5b53024de7fee3e6351c12ad8f12e210b1b48530f");
  assert.equal(report.replay.group.rows, 100);
  assert.equal(report.replay.group.treePathCrosswalkExact, true);
  assert.deepEqual(report.replay.group.rewardCounts,
    { "1": 20, "2": 20, "3": 20, "4": 20, "5": 20 });
  assert.equal(report.replay.group.uniqueTaskStrings, 31);
  assert.equal(report.replay.group.gpt5MiniCheckAnswerTrueRows, 100);
  assert.equal(report.replay.group.originalSplitTrainPathRows, 91);
  assert.equal(report.replay.group.originalSplitTestPathRows, 9);
});

test("task-conditioned labels stay distinct from unique video payloads", () => {
  assert.equal(report.replay.video.physicalPaths, 100);
  assert.equal(report.replay.video.physicalPathBytes, 75_317_206);
  assert.equal(report.replay.video.uniquePayloads, 92);
  assert.equal(report.replay.video.uniquePayloadBytes, 67_673_551);
  assert.equal(report.replay.video.duplicatePhysicalPathCopies, 8);
  assert.equal(report.replay.video.duplicatePayloadGroups, 7);
  assert.equal(report.replay.video.maximumPathsPerPayload, 3);
  assert.deepEqual(report.replay.video.duplicateProfiles.map((entry) =>
    [entry.sourceIdentity.replace(/^berkeley_autolab_ur5_originalsplit_/u, ""),
      entry.physicalPaths, entry.rewards, entry.uniqueTaskHashes]), [
    ["test_index_6", 2, [1, 5], 2],
    ["train_index_180", 2, [3, 5], 2],
    ["train_index_327", 2, [1, 5], 2],
    ["train_index_391", 3, [1, 3, 4], 3],
    ["train_index_517", 2, [1, 3], 2],
    ["train_index_549", 2, [1, 2], 2],
    ["train_index_760", 2, [3, 5], 2],
  ]);
  assert.equal(report.taskConditionedLabels.samePayloadDifferentTaskGroups, 7);
  assert.equal(report.taskConditionedLabels.samePayloadDifferentTaskRows, 15);
  assert.equal(
    report.taskConditionedLabels.samePayloadSameTaskDifferentRewardConflictGroups, 0);
  assert.equal(report.videoIdentity.denominatorAdditionForbidden, true);
  assert.equal(report.denominators.TASK_CONDITIONED_REWARD_LABEL, 100);
  assert.equal(report.denominators.UNIQUE_VIDEO_EXECUTION_BYTES, 92);
});

test("all video containers replay without promoting visual bytes to outcomes", () => {
  assert.equal(report.replay.video.validMp4Containers, 100);
  assert.deepEqual(report.replay.video.majorBrandCounts, { isom: 100 });
  assert.deepEqual(report.replay.video.codecCounts, { avc1: 100 });
  assert.equal(report.replay.video.width, 640);
  assert.equal(report.replay.video.height, 480);
  assert.equal(report.replay.video.frameRate, 10);
  assert.equal(report.replay.video.physicalPathFrames, 7_546);
  assert.equal(report.replay.video.physicalPathDurationSeconds, 754.6);
  assert.equal(report.replay.video.uniquePayloadFrames, 6_737);
  assert.equal(report.replay.video.uniquePayloadDurationSeconds, 673.7);
  assert.equal(report.replay.video.audioTracks, 0);
  assert.equal(report.execution.publisherClaimedRealRobotVideoPathRows, 100);
  assert.equal(report.execution.independentlyVerifiedRealRobotExecutionRows, 0);
  assert.equal(report.execution.actionTelemetryRows, 0);
  assert.equal(report.execution.stateTelemetryRows, 0);
  assert.equal(report.outcome.publisherTaskConditionedProgressLabelRows, 100);
  assert.equal(report.outcome.independentlyVerifiedOutcomeRows, 0);
  assert.equal(report.outcome.independentEffectRows, 0);
  assert.equal(report.outcome.completeCollectionAttemptCensusRows, 0);
  assert.equal(report.recovery.attemptTokenPathRows, 49);
  assert.equal(report.recovery.attemptTokenEstablishesRetryChronology, false);
  assert.equal(report.recovery.pairedFailureToRecoveryRows, 0);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
});

test("privacy, upstream rights, active content, and authority fail closed", () => {
  assert.equal(report.privacy.rawVisualFiles, 100);
  assert.equal(report.privacy.rawVisualBytes, 75_317_206);
  assert.equal(report.privacy.rawVisualPayloadsPrivate, true);
  assert.equal(report.privacy.rawMetadataPrivate, true);
  assert.equal(report.privacy.noPiiOrSensitiveDataGuaranteed, false);
  assert.equal(report.privacy.rawTaskOrCheckTextProjectedIntoReport, false);
  assert.equal(report.activeContent.videoPayloadsExecuted, 0);
  assert.equal(report.activeContent.metadataTextExecuted, 0);
  assert.equal(report.rights.datasetCardLicenseClaim, "CC-BY-4.0");
  assert.equal(report.rights.fixedRecordLicenseFileCount, 0);
  assert.equal(report.rights.publisherReadmeNamesOpenXEmbodiment, true);
  assert.equal(report.rights.publisherReadmeNamesRoboArena, true);
  assert.equal(report.rights.upstreamCorpusRightsIndependentlyAdjudicated, false);
  assert.equal(report.rights.datasetCardClaimExtrapolatedToAllUpstreamVideoRights,
    false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.deepEqual(report.boundary, {
    authorityRows: 0, authorizedTrainingRows: 0,
    autonomousActionAuthorized: false, ceuRows: 0,
    completeAttemptCensusRows: 0, independentEffectRows: 0,
    independentlyVerifiedOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0, networkAdmissionRows: 0,
    offlineTrainingRows: 0, productionTrainingRows: 0,
  });
  assert.doesNotMatch(reportBytes.toString("utf8"),
    /Put the ranch bottle into the pot/u);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyRoboRewardUr5ArtifactDirectory(artifact);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:bf01b98e971c7b9d8f45e984f8ca0b397fc0259ade8679bc1c59ffa4fa88c834");
  assert.equal(checked.receipt.receiptHash,
    "sha256:245199a5d516d70722b1de398ae5f4928682fb607685411badec083288c3e496");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-roboreward-ur5-test-group.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
