import assert from "node:assert/strict";
import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  FR3_RECOVERY_CARD_LICENSE,
  FR3_RECOVERY_DATASET_ID,
  FR3_RECOVERY_DISPOSITION,
  FR3_RECOVERY_REVISION,
  verifyFr3RecoveryArtifactDirectory,
} from "../src/outsider-fr3-pickplace-recovery-no-video.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-fr3-pickplace-recovery-no-video-20260830-v1");
let cached;
function artifact() {
  cached ??= verifyFr3RecoveryArtifactDirectory(ARTIFACT);
  assert.equal(cached.ok, true, cached.error);
  return cached;
}
function assertPrivateTree(target) {
  const status = lstatSync(target);
  assert.equal(status.isSymbolicLink(), false, target);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600, target);
  if (status.isDirectory()) {
    for (const name of readdirSync(target)) assertPrivateTree(path.join(target, name));
  }
}

test("fixed FR3 semantic no-video closure replays all 350 trajectories and source drift", () => {
  const checked = artifact();
  assert.equal(checked.verificationLevel,
    "FIXED_REPOSITORY_COMPLETE_SEMANTIC_NO_VIDEO_SOURCE_REDERIVED");
  const { report, receipt } = checked;
  assert.equal(report.disposition, FR3_RECOVERY_DISPOSITION);
  assert.equal(report.source.datasetId, FR3_RECOVERY_DATASET_ID);
  assert.equal(report.source.revision, FR3_RECOVERY_REVISION);
  assert.equal(report.source.public, true);
  assert.equal(report.source.gated, false);
  assert.equal(report.source.disabled, false);
  assert.equal(report.source.recordBeforeAfterByteIdentical, true);
  assert.equal(report.source.treeBeforeAfterByteIdentical, true);
  assert.equal(report.source.fixedTreeEntries, 20);
  assert.equal(report.source.fixedTreeFiles, 10);
  assert.equal(report.source.fixedTreeDirectories, 10);
  assert.equal(report.source.fixedTreeBytes, 392_532_957);
  assert.equal(report.source.fixedTreeLfsFiles, 6);
  assert.equal(report.source.fixedTreeXetFiles, 6);
  assert.equal(report.source.fixedTreeRoot,
    "sha256:244537459dd0f425305424f4940f4c2709aa6ec3d5248082bbc2e4a16ca37a96");
  assert.equal(report.source.recordUsedStorageBytes, 392_510_071);
  assert.equal(report.source.selectedSemanticNoVideoFiles, 7);
  assert.equal(report.source.selectedSemanticNoVideoBytes, 5_643_907);
  assert.equal(report.source.selectedSemanticNoVideoClosureComplete, true);
  assert.equal(report.source.inventoryOnlyVideoFiles, 3);
  assert.equal(report.source.inventoryOnlyVideoBytes, 386_889_050);
  assert.equal(report.source.videoPayloadsAcquired, 0);
  assert.deepEqual(report.source.inventoryOnlyVideos.map((item) => item.bytes),
    [107_766_569, 200_684_827, 78_437_654]);
  assert.equal(report.source.sourceManifestHash,
    "sha256:907ad5783c9c4b134c2c6984a5034b26a04f41d74b814cbf309837e96e2f6b9f");
  assert.equal(report.source.sourceManifestFileSha256,
    "sha256:bffd9ca5ab70b31d0744cb4055cac86f90fcf97788f7c35efbd01c5b8351cca9");
  assert.equal(report.source.sourceRoot,
    "sha256:fddfbbe8b9ad677517ab0fdb8a08d45b3406545ee0b8ba48abdac975c5b052b8");

  const replay = report.semanticNoVideoReplay;
  assert.equal(replay.info.codebaseVersion, "v3.0");
  assert.equal(replay.info.robotType, "FR3WMS");
  assert.equal(replay.info.episodes, 350);
  assert.equal(replay.info.frames, 70_915);
  assert.equal(replay.info.tasks, 1);
  assert.equal(replay.info.fps, 30);
  assert.equal(replay.info.actionDimensions, 7);
  assert.equal(replay.info.stateDimensions, 7);
  assert.equal(replay.info.task,
    "Pick up the object and place it at the target location.");
  assert.equal(replay.parquet.dataRows, 70_915);
  assert.equal(replay.parquet.dataColumns, 7);
  assert.equal(replay.parquet.dataRowGroups, 1);
  assert.equal(replay.parquet.episodesRows, 350);
  assert.equal(replay.parquet.episodesColumns, 107);
  assert.equal(replay.parquet.episodesRowGroups, 1);
  assert.equal(replay.parquet.tasksRows, 1);
  assert.equal(replay.parquet.tasksColumns, 2);
  assert.deepEqual(replay.parquet.dataColumnNames,
    ["action", "observation.state", "timestamp", "frame_index",
      "episode_index", "index", "task_index"]);
  assert.equal(replay.parquet.dataSchemaRoot,
    "sha256:02e8fd55a31f3fbb500a449ecefecf3cf0f3d3b1907b60af13ac1009cb07dd02");
  assert.equal(replay.parquet.episodesSchemaRoot,
    "sha256:7de169cf50ea279890c640adcf5d934fcb0cb900e5253253fbb326c4c3476b79");
  assert.equal(replay.episodeReplay.episodeIndicesContiguous, true);
  assert.equal(replay.episodeReplay.globalIndicesContiguous, true);
  assert.equal(replay.episodeReplay.frameIndicesResetAndContiguous, true);
  assert.equal(replay.episodeReplay.timestampsMatchThirtyFps, true);
  assert.deepEqual({ ...replay.episodeReplay.episodeLengths,
    histogram: undefined, histogramRoot: undefined }, {
    minimum: 156, maximum: 389, distinctValues: 108, repeatedValues: 88,
    singletonValues: 20, episodesWithRepeatedLength: 330,
    histogram: undefined, histogramRoot: undefined,
  });
  assert.equal(replay.episodeReplay.episodeLengths.histogramRoot,
    "sha256:2883b7319a1915f59fd629f5d8ff951667984ead81eddbf176b5820c06c7522d");
  assert.equal(Object.values(replay.episodeReplay.episodeLengths.histogram)
    .reduce((sum, count) => sum + count, 0), 350);
  assert.equal(replay.episodeReplay.canonicalTrajectoryDuplicateGroupCount, 0);
  assert.deepEqual(replay.episodeReplay.canonicalTrajectoryDuplicateGroups, []);
  assert.equal(replay.episodeReplay.canonicalTrajectorySetRoot,
    "sha256:89b4e5ea4002efbb5013d06e29340026a537e6ce6966b89e0b32f60b1686333c");

  const logical = replay.logicalFileIndexReplay;
  assert.equal(logical.dataFileIndexRuns.length, 12);
  assert.deepEqual(logical.dataFileIndexRuns.map((item) => item.fileIndex),
    [0, 1, 2, 3, 4, 0, 1, 2, 3, 0, 1, 2]);
  assert.equal(logical.episodeMetadataFileIndexRuns.length, 6);
  assert.deepEqual(logical.episodeMetadataFileIndexRuns.map((item) => item.fileIndex),
    [0, 1, 2, 0, 1, 2]);
  assert.equal(logical.frontVideo.logicalFileIndexRuns.length, 1);
  assert.equal(logical.topVideo.logicalFileIndexRuns.length, 2);
  assert.deepEqual(logical.frontVideo.durationMismatchEpisodeIndices,
    [2, 121, 132, 292, 337]);
  assert.deepEqual(logical.topVideo.durationMismatchEpisodeIndices,
    [2, 121, 132, 292, 337]);
  assert.deepEqual(logical.frontVideo.nonzeroSameFileGaps.map((item) => item.episodeIndex),
    [100, 249]);
  assert.deepEqual(logical.topVideo.logicalFileResets,
    [{ episodeIndex: 270, fromFileIndex: 0, fromTimestamp: 0, toFileIndex: 1 }]);

  const stats = replay.statisticsReplay;
  assert.equal(stats.allGlobalStatsValuesFinite, true);
  assert.equal(stats.globalKinematic.action.minExact, true);
  assert.equal(stats.globalKinematic.action.maxExact, true);
  assert.equal(stats.globalKinematic["observation.state"].minExact, true);
  assert.equal(stats.globalKinematic["observation.state"].maxExact, true);
  assert.ok(stats.globalKinematic.action.maximumMeanAbsoluteDifference < 0.000_002);
  assert.ok(stats.globalKinematic.action.maximumStdAbsoluteDifference < 0.000_3);
  assert.equal(stats.globalScalar.index.claimed.max, 32_575);
  assert.equal(stats.globalScalar.index.actual.max, 70_914);
  assert.equal(stats.globalScalar.index.actual.mean, 35_457);
  assert.equal(stats.globalScalar.episode_index.claimed.max, 179);
  assert.equal(stats.globalScalar.episode_index.actual.max, 349);
  assert.equal(stats.episodeKinematicMinMaxExact, true);
  assert.equal(stats.episodeTimestampFrameTaskMinMaxExact, true);
  assert.equal(stats.episodeIndexStatsMismatchEpisodes, 170);
  assert.equal(stats.globalIndexStatsMismatchEpisodes, 170);
  assert.deepEqual(stats.episodeIndexOffsetCounts,
    { 0: 180, 180: 30, 209: 10, 210: 40, 220: 10, 270: 80 });
  assert.deepEqual(stats.globalIndexOffsetCounts,
    { 0: 180, 32576: 30, 38961: 10, 39194: 40, 41101: 10, 52081: 80 });
  assert.equal(stats.imageStatsParsedButPixelsUnavailable, true);

  const adjacency = replay.kinematicAdjacency;
  assert.equal(adjacency.sameFrameComparisons, 70_915);
  assert.equal(adjacency.sameFrameExactAllDimensions, 675);
  assert.equal(adjacency.sameFrameWithinOneEminus4AllDimensions, 13_398);
  assert.equal(adjacency.actionToNextStateComparisons, 70_565);
  assert.equal(adjacency.actionToNextStateExactAllDimensions, 4);
  assert.equal(adjacency.actionToNextStateWithinOneEminus4AllDimensions, 33);
  assert.equal(adjacency.stateActionContinuityEstablishesCausalActionEffect, false);

  const drift = report.sourceDiscrepancies;
  assert.equal(drift.physicalDataParquetFiles, 1);
  assert.equal(drift.logicalDataFileIndicesReferenced, 5);
  assert.equal(drift.logicalDataFileIndexRuns, 12);
  assert.equal(drift.infoDataPathWouldReferenceAbsentPhysicalFiles, true);
  assert.equal(drift.physicalEpisodeMetadataParquetFiles, 1);
  assert.equal(drift.logicalEpisodeMetadataFileIndicesReferenced, 3);
  assert.equal(drift.logicalEpisodeMetadataFileIndexRuns, 6);
  assert.equal(drift.mergedPhysicalParquetsRetainPreMergeLogicalFileIndices, true);
  assert.equal(drift.globalStatsIndexAndEpisodeFieldsAreStaleOrIncoherent, true);
  assert.equal(drift.episodeStatsEpisodeIndexMismatchEpisodes, 170);
  assert.equal(drift.episodeStatsGlobalIndexMismatchEpisodes, 170);
  assert.equal(drift.videoReferenceDurationMismatchEpisodes, 5);
  assert.equal(drift.videoReferenceNonzeroSameFileGaps, 2);
  assert.equal(drift.discrepanciesPreservedNotSilentlyRepaired, true);

  const boundary = report.publisherNamingBoundary;
  assert.equal(boundary.repositoryNameContainsRecovery, true);
  assert.equal(boundary.genericReadmeContainsRecovery, false);
  assert.deepEqual(boundary.dataOrMetadataOutcomeFields, []);
  assert.equal(boundary.publisherNamedTrajectoryEpisodes, 350);
  assert.equal(boundary.publisherRobotTypeClaim, "FR3WMS");
  assert.equal(boundary.sourceNativeOutcomeRows, 0);
  assert.equal(boundary.independentOutcomeRows, 0);
  assert.equal(boundary.sourceNativeRecoveryInterventionRows, 0);
  assert.equal(boundary.recoveryEffectRows, 0);
  assert.equal(boundary.attemptCensusRows, 0);
  assert.equal(boundary.physicalWitnessRows, 0);
  assert.equal(boundary.repositoryNameDoesNotEstablishRecoverySemantics, true);

  const rights = report.rightsPrivacyAndUse;
  assert.equal(rights.rights.datasetCardLicenseClaim, FR3_RECOVERY_CARD_LICENSE);
  assert.equal(rights.rights.readmeLicenseClaim, FR3_RECOVERY_CARD_LICENSE);
  assert.equal(rights.rights.repositoryLicenseFilePresent, false);
  assert.equal(rights.rights.rightsDisposition, "FAIL_CLOSED");
  assert.equal(rights.rights.authorizedTrainingRows, 0);
  assert.equal(rights.privacy.rawSourcePrivate, true);
  assert.equal(rights.privacy.noPiiGuaranteed, false);
  assert.equal(rights.privacy.videoPixelsAcquired, false);
  assert.equal(rights.use.quarantineEvaluationOnly, true);
  assert.equal(rights.use.networkAdmissionRows, 0);
  assert.equal(rights.use.authorityRows, 0);
  for (const [key, value] of Object.entries(report.zeroClaimBoundary)) {
    assert.equal(value, key === "autonomousActionAuthorized" ? false : 0, key);
  }
  assert.equal(receipt.trajectoryEpisodes, 350);
  assert.equal(receipt.trajectoryFrames, 70_915);
  assert.equal(receipt.attemptCensusRows, 0);
  assert.equal(receipt.recoveryEffectRows, 0);
  assert.equal(receipt.physicalWitnessRows, 0);
  assert.equal(receipt.receiptWrittenLast, true);
  assert.equal(receipt.noClobber, true);
  assert.equal(report.artifactHash,
    "sha256:7716bfd5233db08d10c2cadc9f358ae6b3fb3c762188ccfdb73fc4e3f99cab96");
  assert.equal(receipt.receiptHash,
    "sha256:6c0ed9de37fae9c59b0546859dacc974800f5f3f99e698dfce33500ed8236ad7");
});

test("artifact is private and receipt-bound to the complete semantic source replay", () => {
  const checked = artifact(); assertPrivateTree(ARTIFACT);
  assert.match(checked.report.artifactHash, /^sha256:[a-f0-9]{64}$/u);
  assert.match(checked.receipt.receiptHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(checked.receipt.reportHash, checked.report.artifactHash);
  assert.equal(checked.receipt.sourceManifestHash,
    checked.report.source.sourceManifestHash);
  assert.equal(checked.receipt.sourceRoot, checked.report.source.sourceRoot);
  assert.equal(checked.report.source.sourceManifestFileSha256,
    "sha256:bffd9ca5ab70b31d0744cb4055cac86f90fcf97788f7c35efbd01c5b8351cca9");
  assert.equal(checked.reportFileSha256,
    "sha256:ef179845fa539b24e90cffcb1b50b93c76ea6601075dbfa637ec40ffe12d7969");
  assert.equal(checked.receiptFileSha256,
    "sha256:d2ff2187882a85ac93fde480230f23a39688f6a97c2216c3c2a9ca4759eb9c01");
});
