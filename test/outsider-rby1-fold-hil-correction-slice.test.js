import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  RBY1_FOLD_HIL_DATASET_ID,
  RBY1_FOLD_HIL_DISPOSITION,
  RBY1_FOLD_HIL_REVISION,
  RBY1_FOLD_HIL_SCOPE,
  verifyRby1FoldHilArtifactDirectory,
} from "../src/outsider-rby1-fold-hil-correction-slice.js";

const artifact = path.resolve(
  "artifacts/outsider-rby1-fold-hil-correction-slice-20260829-v1");
const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));

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

test("fixed revision preserves the complete nine-file no-video closure", () => {
  assert.equal(report.disposition, RBY1_FOLD_HIL_DISPOSITION);
  assert.equal(report.scope.kind, RBY1_FOLD_HIL_SCOPE);
  assert.equal(report.scope.datasetId, RBY1_FOLD_HIL_DATASET_ID);
  assert.equal(report.scope.revision, RBY1_FOLD_HIL_REVISION);
  assert.equal(report.scope.completePinnedNoVideoClosureAcquired, true);
  assert.equal(report.scope.noVideoFiles, 9);
  assert.equal(report.scope.noVideoBytes, 12_020_956);
  assert.equal(report.scope.excludedVideoFiles, 84);
  assert.equal(report.scope.excludedVideoBytes, 3_886_601_917);
  assert.equal(report.scope.videoPayloadBytesAcquired, 0);
  assert.equal(report.scope.allModalitiesAcquired, false);
  assert.equal(report.source.fixedRevisionTreeEntries, 106);
  assert.equal(report.source.fixedRevisionFiles, 93);
  assert.equal(report.source.fixedRevisionDirectories, 13);
  assert.equal(report.source.fixedRevisionFileBytes, 3_898_622_873);
  assert.equal(report.source.apiUsedStorageBytes, 11_366_751_897);
  assert.equal(report.source.apiUsedStorageIsNotPinnedTreeByteCount, true);
  assert.deepEqual(report.source.excludedVideoFilesByCamera,
    { cam_high: 28, cam_left_wrist: 28, cam_right_wrist: 28 });
  assert.equal(report.source.recordBeforeAfterExact, true);
  assert.equal(report.source.treeBeforeAfterExact, true);
  assert.deepEqual(
    readFileSync(path.join(artifact, "source/metadata/dataset-record-before.json")),
    readFileSync(path.join(artifact, "source/metadata/dataset-record-after.json")));
  assert.deepEqual(
    readFileSync(path.join(artifact, "source/metadata/full-tree-before.json")),
    readFileSync(path.join(artifact, "source/metadata/full-tree-after.json")));
  const manifest = JSON.parse(readFileSync(
    path.join(artifact, "source/source-manifest.json"), "utf8"));
  assert.equal(manifest.sourceObjects.length, 13);
  assert.equal(manifest.selectedNoVideoFiles, 9);
});

test("all frame telemetry and episode joins replay from publisher bytes", () => {
  assert.equal(report.replay.parquet.dataRows, 81_813);
  assert.equal(report.replay.parquet.episodeRows, 40);
  assert.equal(report.replay.parquet.taskRows, 1);
  assert.deepEqual(report.replay.parquet.dataColumns, [
    "observation.state", "action", "observation.is_intervention",
    "timestamp", "frame_index", "episode_index", "index", "task_index",
  ]);
  assert.equal(report.mechanics.robotType, "rby1");
  assert.equal(report.mechanics.frames, 81_813);
  assert.equal(report.mechanics.fps, 30);
  assert.equal(report.mechanics.stateDimensions, 26);
  assert.equal(report.mechanics.actionDimensions, 26);
  assert.equal(report.mechanics.perDimensionTelemetry.length, 26);
  assert.equal(report.mechanics.motorNamesExactAcrossStateAndAction, true);
  assert.equal(report.mechanics.nonfiniteStateValues, 0);
  assert.equal(report.mechanics.nonfiniteActionValues, 0);
  assert.equal(report.replay.telemetry.globalIndexExact, true);
  assert.equal(report.replay.telemetry.episodeIndicesExact, true);
  assert.equal(report.replay.telemetry.frameIndicesExactWithinEpisode, true);
  assert.deepEqual(report.replay.telemetry.taskIndexValues, [0]);
  assert.ok(report.replay.telemetry.timestampCadenceMaxAbsoluteError < 7.2e-6);
  assert.equal(report.replay.telemetry.telemetryRowProjectionRoot,
    "sha256:a5252d29b1f584a40f72a18aec310fa817111165ddeaf9ce3acc9def6c5dfc2f");
  assert.equal(report.replay.episodes.lengthSum, 81_813);
  assert.equal(report.replay.episodes.lengthMin, 40);
  assert.equal(report.replay.episodes.lengthMax, 7_360);
  assert.equal(report.replay.episodes.computedLengthsEqualMetadata, true);
  assert.equal(report.replay.episodes.fromIndicesExact, true);
  assert.equal(report.replay.episodes.toIndicesExact, true);
  assert.equal(report.replay.episodes.episodeProfileRoot,
    "sha256:ff453e0f713d3433aa476deaf1f159c695a972755b00a5cc3a91b5a4554e16a8");
});

test("byte-native intervention and estimator annotations remain distinct", () => {
  assert.equal(report.intervention.byteNativeFieldName,
    "observation.is_intervention");
  assert.equal(report.intervention.byteNativeInterventionRows, 81_813);
  assert.equal(report.intervention.byteNativeNonInterventionRows, 0);
  assert.equal(report.intervention.byteNativeOtherValueRows, 0);
  assert.equal(report.intervention.byteNativeInterventionEpisodes, 40);
  assert.equal(report.intervention.allPublishedFramesMarkedInterventionByBytes,
    true);
  assert.equal(report.intervention.independentlyVerifiedInterventionRows, 0);
  assert.equal(report.intervention.interventionAutomaticallyMeansRecovery, false);
  assert.equal(report.annotations.stageProgressPredictionRows, 81_813);
  assert.equal(report.annotations.relativeAdvantagePredictionRows, 81_813);
  assert.equal(report.annotations.absoluteAdvantagePredictionRows, 81_813);
  assert.equal(report.annotations.eachAnnotationSetCrosswalksOneToOneWithFrames,
    true);
  assert.equal(report.annotations.horizonFrames, 50);
  assert.ok(report.annotations.relativeFormulaMaxAbsoluteResidual <= 0.0001000001);
  assert.equal(report.annotations.publisherApproximateP70Threshold, 0.032);
  assert.ok(Math.abs(report.annotations.byteEmpiricalP70Linear - 0.032024) < 1e-12);
  assert.equal(report.annotations.relativeAbovePublisherThresholdRows, 24_553);
  assert.equal(report.annotations.relativeEqualPublisherThresholdRows, 4);
  assert.equal(report.annotations.modelPredictionIsOutcomeLabel, false);
  assert.equal(report.annotations.modelPredictionIsIndependentWitness, false);
  assert.equal(report.replay.annotations.annotationProjectionRoot,
    "sha256:d9bc56cb404fa993f15c569508355ce4f3b6e70c8af21a0d37c4fd5efea4f840");
});

test("curation and metadata discrepancies are preserved without recovery promotion", () => {
  assert.equal(report.taskIdentity.taskTableLabel, "fold the t-shirt");
  assert.deepEqual(report.taskIdentity.episodeMetadataTaskLabels,
    ["fold the t-shirts"]);
  assert.equal(report.taskIdentity.episodeMetadataMatchesTaskTable, false);
  assert.equal(report.taskIdentity.silentNormalizationApplied, false);
  assert.equal(report.mechanics.globalStateActionStatsExact, true);
  assert.equal(report.mechanics.episodeStateActionMinMaxAndCountExactRows, 40);
  assert.equal(report.mechanics.episodeStateActionMeanStdExactRows, 39);
  assert.equal(report.mechanics.episodeStateActionMeanMaximumAbsoluteError,
    0.003944404190633577);
  assert.equal(report.mechanics.episodeStateActionStdMaximumAbsoluteError,
    0.8497637859812165);
  assert.deepEqual(report.completeness.episodeMetadataNullCellsByField, {
    "meta/episodes/chunk_index": 39,
    "meta/episodes/file_index": 39,
  });
  assert.equal(report.curation.byteNativeVideoTimestampPositiveGapCountPerCamera,
    4);
  assert.equal(report.curation.byteNativeVideoTimestampPositiveGapSecondsPerCamera,
    122.93333333333335);
  assert.equal(report.curation.videoTimestampGapsInterpretedAsFailedAttempts,
    false);
  assert.equal(report.curation.handEditedMeansCompleteAttemptCensus, false);
  assert.equal(report.lineage.exactByteOrEpisodeLinkageToV10Established, false);
  assert.deepEqual(report.outcome.outcomeSuccessFailureRewardDoneSchemaFields, []);
  assert.equal(report.outcome.publisherNativeTaskOutcomeRows, 0);
  assert.equal(report.outcome.independentlyVerifiedOutcomeRows, 0);
  assert.equal(report.recovery.publisherReadmeRecoveredEpisodeClaim, true);
  assert.equal(report.recovery.sourceNativeRecoveryLabelRows, 0);
  assert.equal(report.recovery.pairedFailureToCorrectionRows, 0);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
  assert.equal(report.recovery.curatedCorrectionSetIsRecoveryCensus, false);
});

test("privacy, rights, training, effect, network, and authority fail closed", () => {
  assert.equal(report.execution.publisherClaimsRbY1RealRobotCollection, true);
  assert.equal(report.execution.independentlyVerifiedPhysicalExecutionFrames, 0);
  assert.equal(report.execution.independentVisualWitnessFrames, 0);
  assert.equal(report.privacy.videosExcluded, true);
  assert.equal(report.privacy.rawVisualBytes, 0);
  assert.equal(report.privacy.humanInTheLoopPublisherClaimPresent, true);
  assert.equal(report.privacy.operatorConsentEvidenceBytesAcquired, 0);
  assert.equal(report.privacy.noPiiOrSensitiveDataGuaranteed, false);
  assert.equal(report.rights.datasetCardLicenseClaim, "Apache-2.0");
  assert.equal(report.rights.readmeFrontMatterLicenseClaim, "apache-2.0");
  assert.equal(report.rights.repositoryLicenseFilePresent, false);
  assert.equal(report.rights.datasetContentRightsIndependentlyAdjudicated, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.rights.redistributionAuthorizedByThisArtifact, false);
  assert.equal(report.boundary.independentEffectRows, 0);
  assert.equal(report.boundary.completeAttemptCensusRows, 0);
  assert.equal(report.boundary.offlineTrainingRows, 0);
  assert.equal(report.boundary.productionTrainingRows, 0);
  assert.equal(report.boundary.networkAdmissionRows, 0);
  assert.equal(report.boundary.authorityRows, 0);
  assert.equal(report.boundary.ceuRows, 0);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyRby1FoldHilArtifactDirectory(artifact,
    { pythonExecutable: "/opt/anaconda3/bin/python" });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:340f89facade6fcf7830dc31d1a7b92ae36d9785a4b547c6bf79fb48a1a4c407");
  assert.equal(checked.receipt.receiptHash,
    "sha256:0d6864f6eb880adf4332534d5146c25f4ce7c6749f6394f1bb4b16565fd675be");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-rby1-fold-hil-correction-slice.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
