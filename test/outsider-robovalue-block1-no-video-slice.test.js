import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ROBOVALUE_BLOCK1_DATASET_ID,
  ROBOVALUE_BLOCK1_DISPOSITION,
  ROBOVALUE_BLOCK1_GITHUB_COMMIT,
  ROBOVALUE_BLOCK1_REVISION,
  ROBOVALUE_BLOCK1_SCOPE,
  verifyRoboValueBlock1ArtifactDirectory,
} from "../src/outsider-robovalue-block1-no-video-slice.js";

const artifact = path.resolve(
  "artifacts/outsider-robovalue-block1-no-video-slice-20260829-v1");
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

test("fixed source mapping closes the complete block_1 no-video group", () => {
  assert.equal(report.disposition, ROBOVALUE_BLOCK1_DISPOSITION);
  assert.equal(report.scope.kind, ROBOVALUE_BLOCK1_SCOPE);
  assert.equal(report.scope.datasetId, ROBOVALUE_BLOCK1_DATASET_ID);
  assert.equal(report.scope.revision, ROBOVALUE_BLOCK1_REVISION);
  assert.equal(report.scope.sourceNativeGroup, "block_data/block_1");
  assert.equal(report.scope.completePinnedSourceNativeNoVideoGroupAcquired, true);
  assert.equal(report.scope.selectedFiles, 522);
  assert.equal(report.scope.selectedBytes, 45_362_943);
  assert.equal(report.scope.parquetFiles, 259);
  assert.equal(report.scope.parquetBytes, 41_568_105);
  assert.equal(report.scope.metadataFiles, 263);
  assert.equal(report.scope.metadataBytes, 3_794_838);
  assert.equal(report.scope.excludedVideoFiles, 777);
  assert.equal(report.scope.excludedVideoBytes, 3_406_736_817);
  assert.equal(report.scope.videoPayloadBytesAcquired, 0);
  assert.equal(report.scope.allModalitiesAcquired, false);
  assert.equal(report.scope.entireRoboValueRlDatasetAcquired, false);
  assert.equal(report.source.fixedSubtreeEntries, 1_308);
  assert.equal(report.source.fixedSubtreeFiles, 1_299);
  assert.equal(report.source.fixedSubtreeDirectories, 9);
  assert.equal(report.source.fixedSubtreeFileBytes, 3_452_099_760);
  assert.equal(report.source.apiUsedStorageBytes, 415_449_094_530);
  assert.equal(report.source.apiUsedStorageIsNotPinnedSubtreeByteCount, true);
  assert.equal(report.source.apiSiblingEntries, 98_630);
  assert.equal(report.source.recordResponseBeforeAfterExact, true);
  assert.equal(report.source.blockTreeBeforeAfterExact, true);
  assert.equal(report.source.githubCommit, ROBOVALUE_BLOCK1_GITHUB_COMMIT);
  assert.equal(report.source.githubCommitVerified, false);
  assert.equal(report.source.githubCommitVerificationReason, "unsigned");
  const manifest = JSON.parse(readFileSync(
    path.join(artifact, "source/source-manifest.json"), "utf8"));
  assert.equal(manifest.sourceObjects.length, 542);
  assert.equal(manifest.selectedNoVideoFiles, 522);
  assert.equal(manifest.githubEvidenceFiles, 7);
  assert.deepEqual(readFileSync(path.join(artifact,
    "source/metadata/hf-record-before.json")), readFileSync(path.join(artifact,
    "source/metadata/hf-record-after.json")));
});

test("all 259 parquet episodes replay mechanics, indices, and metadata joins", () => {
  assert.equal(report.replay.parquet.files, 259);
  assert.equal(report.replay.parquet.rowGroups, 259);
  assert.equal(report.replay.parquet.rows, 210_121);
  assert.equal(report.replay.parquet.lengthMin, 435);
  assert.equal(report.replay.parquet.lengthMax, 1_522);
  assert.equal(report.replay.parquet.schemaUniform, true);
  assert.equal(report.replay.parquet.schemaSha256,
    "sha256:08a48182362c0e2ec62ce39fc2e5f3493f0655fc528de52976c5329a0f2a9281");
  assert.equal(report.mechanics.publisherRobotType, "x_humanoid");
  assert.equal(report.mechanics.stateDimensions, 32);
  assert.equal(report.mechanics.actionDimensions, 16);
  assert.equal(report.mechanics.allStateActionValuesFinite, true);
  assert.deepEqual(report.mechanics.actionEqualsMasterStateEpisodes, {
    left_arm: 259, left_gripper: 259, right_arm: 259, right_gripper: 259,
  });
  assert.equal(report.completeness.globalIndexExact, true);
  assert.equal(report.completeness.frameIndicesExactWithinEpisode, true);
  assert.equal(report.completeness.episodeIndicesExact, true);
  assert.equal(report.completeness.taskIndicesExact, true);
  assert.equal(report.completeness.timestampCadenceAt30FpsWithin2e6, true);
  assert.equal(report.replay.metadata.episodeRows, 259);
  assert.equal(report.replay.metadata.episodeStatsRows, 259);
  assert.equal(report.replay.metadata.shardRows, 259);
  assert.equal(report.replay.metadata.parquetPathsExact, true);
  assert.equal(report.replay.metadata.videoPathsExact, true);
  assert.equal(report.completeness.sourceNativeEpisodeProfileSha256,
    "sha256:492edefc909d4c95ae6cbebbb028af0b2f8f8af140c6a549942b3dbcb2c6629f");
});

test("byte-native quality wins over all stale sidecars without coercion", () => {
  assert.deepEqual(report.annotations.byteNativeFields, [
    "value_reward", "discounted_value_return", "y_pressed", "quality",
    "remain_time", "return_to_go", "predict_value_function",
    "predict_remain_time", "predict_return_to_go",
  ]);
  assert.equal(report.annotations.allRowsReplayedPerField, 210_121);
  assert.equal(report.annotations.qualityParquetType, "int64");
  assert.equal(report.annotations.qualityInfoDeclaredType, "bool");
  assert.deepEqual(report.annotations.qualityValueCounts,
    { "0.0": 87_394, "1.0": 27_227, "2.0": 95_500 });
  assert.equal(report.annotations.qualityEpisodesContainingAllThreeClasses, 259);
  assert.equal(report.annotations.qualityTransitions, 6_571);
  assert.equal(report.sidecarDrift.qualitySidecarsDeclareAllOneEpisodes, 259);
  assert.equal(report.sidecarDrift.qualityActualAllOneEpisodes, 0);
  assert.deepEqual(report.sidecarDrift.qualityActualEpisode0Counts,
    { "0": 350, "1": 96, "2": 420 });
  assert.equal(report.sidecarDrift.shardStatsCopiesExactlyEqualEpisodeStatsRows,
    259);
  assert.equal(report.sidecarDrift.qualitySidecarRowsMatchingWithin1e5, 0);
  assert.equal(report.sidecarDrift.qualitySidecarMaxAbsoluteError, 1);
  assert.deepEqual(report.sidecarDrift.parquetFieldsMissingFromEpisodeStatsSidecars,
    ["predict_remain_time", "predict_return_to_go", "predict_value_function",
      "remain_time", "return_to_go"]);
  assert.deepEqual(report.sidecarDrift.meaningfulInfoParquetTypeDrift.quality,
    { info: "bool", parquet: "int64" });
  assert.equal(report.sidecarDrift.parquetBytesTakePrecedenceOverStaleSidecars,
    true);
  assert.equal(report.sidecarDrift.silentCoercionApplied, false);
});

test("reward, predictions, source paths, outcome, and recovery remain layered", () => {
  assert.deepEqual(report.valueSignals.scalarSummaries.value_reward.valueCounts,
    { "-0.10000000149011612": 209_862, "100.0": 259 });
  assert.deepEqual(report.valueSignals.scalarSummaries.y_pressed.valueCounts,
    { "0.0": 210_121 });
  assert.deepEqual(report.valueSignals.scalarSummaries.return_to_go.valueCounts,
    { "0.0": 210_121 });
  assert.equal(report.valueSignals.positiveTerminalRewardEpisodes, 259);
  assert.equal(report.valueSignals.remainTimeEqualsEpisodeLengthMinusFrameEpisodes,
    259);
  for (const field of ["predict_value_function", "predict_remain_time",
    "predict_return_to_go"]) {
    assert.equal(report.valueSignals.scalarSummaries[field].finiteValues, 210_121);
  }
  assert.equal(report.annotations.qualityIsTaskOutcome, false);
  assert.equal(report.annotations.predictedValueFieldsAreIndependentOutcomes, false);
  assert.equal(report.outcome.publisherNativeExplicitSuccessFailureOutcomeRows, 0);
  assert.equal(report.outcome.independentlyVerifiedOutcomeRows, 0);
  assert.equal(report.outcome.independentEffectRows, 0);
  assert.equal(report.outcome.sourcePathSuccessSegmentRows, 259);
  assert.equal(report.outcome.sourcePathPromotedToIndependentOutcome, false);
  assert.equal(report.outcome.completeCollectionAttemptCensusEstablished, false);
  assert.equal(report.recovery.selectedBlock1SourceNativeRecoveryLabelRows, 0);
  assert.equal(report.recovery.pairedFailureToCorrectionRows, 0);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
  assert.equal(report.recovery.selectedCuratedGroupIsRecoveryCensus, false);
});

test("execution, privacy, rights, active content, and authority fail closed", () => {
  assert.equal(report.execution.publisherDatasetCardClaimsRealRobotExperience, true);
  assert.equal(report.execution.byteNativeStateActionTelemetryFrames, 210_121);
  assert.equal(report.execution.independentlyVerifiedPhysicalExecutionFrames, 0);
  assert.equal(report.execution.independentVisualWitnessFrames, 0);
  assert.equal(report.execution.downloadedPublisherCodeExecuted, false);
  assert.equal(report.privacy.videosExcluded, true);
  assert.equal(report.privacy.rawVisualBytes, 0);
  assert.equal(report.privacy.absolutePublisherLocalTrajectoryPathRows, 259);
  assert.equal(report.privacy.uniquePublisherLocalTrajectoryPaths, 259);
  assert.equal(report.privacy.noPiiOrSensitiveDataGuaranteed, false);
  assert.equal(report.activeContent.downloadedPublisherCodeFiles, 6);
  assert.equal(report.activeContent.downloadedPublisherCodeExecuted, 0);
  assert.equal(report.rights.datasetApiLicenseClaim, null);
  assert.equal(report.rights.datasetReadmeRedirectsToGithubLicenseFile, true);
  assert.equal(report.rights.githubApiDetectedLicense, null);
  assert.equal(report.rights.githubRootLicenseFilePresent, false);
  assert.deepEqual(report.rights.vendoredLicenseFiles,
    ["lerobot_2_1/LICENSE", "openpi/LICENSE"]);
  assert.equal(report.rights.vendoredLicensesAdjudicateDatasetRights, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.rights.redistributionAuthorizedByThisArtifact, false);
  assert.deepEqual(report.boundary, {
    authorityRows: 0, authorizedTrainingRows: 0,
    autonomousActionAuthorized: false, ceuRows: 0,
    completeAttemptCensusRows: 0, independentEffectRows: 0,
    independentlyVerifiedOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0, networkAdmissionRows: 0,
    offlineTrainingRows: 0, productionTrainingRows: 0,
  });
  const text = reportBytes.toString("utf8");
  assert.doesNotMatch(text, /\/mnt\/dataset|trajectory[.]hdf5/u);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyRoboValueBlock1ArtifactDirectory(artifact,
    { pythonExecutable: "/opt/anaconda3/bin/python" });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:4f3b9a8cf4df0fb5724e44cf7346567329e607afa47aacf0f25f7e1b8c9800c5");
  assert.equal(checked.receipt.receiptHash,
    "sha256:99be9fde8bb6263b47d9acea6f907cba4ff9528e7eb66c4e26b7f07570bcd7c4");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-robovalue-block1-no-video-slice.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
