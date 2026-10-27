import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  HAPTAL_MISALIGNMENT_DATASET_ID,
  HAPTAL_MISALIGNMENT_DISPOSITION,
  HAPTAL_MISALIGNMENT_LICENSE,
  HAPTAL_MISALIGNMENT_REVISION,
  verifyHaptalMisalignmentArtifactDirectory,
} from "../src/outsider-haptal-misalignment-failure-full-repo.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-haptal-misalignment-failure-full-repo-20260829-v1");

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function assertPrivateTree(root) {
  const status = lstatSync(root);
  assert.equal(status.isSymbolicLink(), false, root);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600, root);
  if (status.isDirectory()) {
    for (const name of readdirSync(root)) assertPrivateTree(path.join(root, name));
  }
}

test("full Haptal revision replays 150 synthetic episodes without promoting publisher labels", () => {
  const checked = verifyHaptalMisalignmentArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FULL_FIXED_REPOSITORY_AND_PARQUET_SOURCE_REDERIVED");
  const { report, receipt } = checked;

  assert.equal(report.disposition, HAPTAL_MISALIGNMENT_DISPOSITION);
  assert.equal(report.source.datasetId, HAPTAL_MISALIGNMENT_DATASET_ID);
  assert.equal(report.source.revision, HAPTAL_MISALIGNMENT_REVISION);
  assert.equal(report.source.public, true);
  assert.equal(report.source.gated, false);
  assert.equal(report.source.disabled, false);
  assert.equal(report.source.recordBeforeAfterByteIdentical, true);
  assert.equal(report.source.treeBeforeAfterByteIdentical, true);
  assert.equal(report.source.fixedTreeFiles, 7);
  assert.equal(report.source.fixedTreeDirectories, 0);
  assert.equal(report.source.fixedTreeBytes, 14_445_458);
  assert.equal(report.source.fixedTreeLfsFiles, 1);
  assert.equal(report.source.fixedTreeXetFiles, 1);
  assert.equal(report.source.fixedTreeRoot,
    "sha256:def85c9d272d6044f669231d117f9721d0c1d72c9b896e629816ca5560c45fdd");
  assert.equal(report.source.recordUsedStorageBytes, 201_772_598);
  assert.equal(report.source.recordUsedStorageIsNotCurrentTreeBytes, true);
  assert.equal(report.source.completeFixedRepositoryPayloadAcquired, true);
  assert.equal(report.source.sourceManifestHash,
    "sha256:834fbc8c38adba0ad57016a52d52be2d52310fbc147d2f8bb320f93aa2452e64");
  assert.equal(report.source.sourceRoot,
    "sha256:e604f72397cb6f7f38b7e611f334d0d11a2e33b79b63c8b2f9de174a49cc6305");

  assert.equal(report.parquetReplay.episodes.rows, 51_172);
  assert.equal(report.parquetReplay.episodes.columns.length, 38);
  assert.equal(report.parquetReplay.episodes.combinedColumnRoot,
    "sha256:874598d7f05b0aa61f465131bdab2e312ecf38dd5601e82e48cfa5082a28c619");
  assert.equal(report.parquetReplay.labels.rows, 150);
  assert.equal(report.parquetReplay.labels.columns.length, 6);
  assert.equal(report.parquetReplay.labels.combinedColumnRoot,
    "sha256:a23fe083f16d924c894121057de065e946ce2cb3bf1cbd937f70894edf707bb3");
  assert.equal(report.parquetReplay.episodes.columnDetails.episode_id.dictionaryValues,
    150);
  assert.equal(report.parquetReplay.episodes.columnDetails.timestep.dictionaryValues,
    525);
  assert.equal(report.parquetReplay.episodes.columnDetails.joint_0_pos.nulls, 0);
  assert.equal(report.parquetReplay.episodes.columnDetails.joint_7_pos.nulls,
    15_398);
  assert.equal(report.parquetReplay.episodes.columnDetails.joint_13_vel.nulls,
    15_398);
  assert.equal(report.parquetReplay.labels.columnDetails.logged_success.nulls, 0);
  assert.equal(report.parquetReplay.labels.columnDetails.actually_succeeded.physicalType,
    0);
  assert.equal(report.parquetReplay.allPhysicalColumnsDecodedFromCurrentBytes, true);
  assert.equal(report.parquetReplay.allDictionaryAndDataPagesDecoded, true);
  assert.equal(report.parquetReplay.allSnappyBlocksDecoded, true);
  assert.equal(report.parquetReplay.sourceCodeOrParquetEmbeddedCodeExecuted, false);

  const census = report.sourceNativeCensus;
  assert.equal(census.syntheticEpisodes, 150);
  assert.equal(census.syntheticTimestepRows, 51_172);
  assert.equal(census.labelRows, 150);
  assert.equal(census.uniqueEpisodeIds, 150);
  assert.equal(census.minimumTimesteps, 175);
  assert.equal(census.maximumTimesteps, 525);
  assert.equal(census.episodeRowsContiguous, true);
  assert.equal(census.timestepsZeroBasedContiguous, true);
  assert.equal(census.episodeLabelIdSetsIdentical, true);
  assert.equal(census.episodeAndLabelOrderIdentical, true);
  assert.equal(census.episodeSummaryRoot,
    "sha256:6d72ff2d2e49dcb0cc61df5a6714ef5a44c90ed5a4d96e9b56aa249e2037da3a");
  assert.deepEqual(census.failureModeCounts, {
    incomplete_insertion: 22, misplaced_target: 23, none: 60,
    phantom_grasp: 23, premature_success: 22,
  });
  assert.deepEqual(census.publisherOutcomeCounts, { false: 90, true: 60 });
  assert.deepEqual(census.splitCounts, { test: 40, train: 110 });
  assert.deepEqual(census.splitOutcomeCounts, {
    "test/failure": 25, "test/success": 15,
    "train/failure": 65, "train/success": 45,
  });
  assert.deepEqual(census.baseDatasetCounts, {
    "lerobot/aloha_sim_insertion_human": 38,
    "lerobot/aloha_sim_transfer_cube_human": 42,
    "lerobot/xarm_lift_medium_replay": 38,
    "lerobot/xarm_push_medium_replay": 32,
  });
  assert.deepEqual(census.failureModeTimestepRows, {
    incomplete_insertion: 7_903, misplaced_target: 8_002, none: 20_949,
    phantom_grasp: 8_279, premature_success: 6_039,
  });
  assert.deepEqual(census.splitTimestepRows, { test: 12_843, train: 38_329 });
  assert.equal(census.xarmPaddedTimestepRows, 15_398);
  assert.equal(census.extraJointNullCells, 215_572);
  assert.equal(census.targetConstantEpisodes, 150);
  assert.equal(census.allLoggedSuccessPublisherFlagsTrue, true);
  assert.equal(census.actuallySucceededMatchesInjectedClassForAllLabels, true);
  assert.equal(census.episodeIdPrefixRevealsFailureModeRows, 150);
  assert.equal(census.episodeIdPrefixPerfectlyRevealsActuallySucceededRows, 150);

  const drift = report.documentationAndGeneratorDrift;
  assert.equal(drift.readmeClaimedEpisodes, 2_000);
  assert.equal(drift.generatorConfiguredEpisodes, 2_000);
  assert.equal(drift.currentSourceNativeSyntheticEpisodes, 150);
  assert.equal(drift.readmeClaimedTimestepRows, 678_291);
  assert.equal(drift.currentSourceNativeSyntheticTimestepRows, 51_172);
  assert.equal(drift.readmeClaimedTrainEpisodes, 1_600);
  assert.equal(drift.currentTrainEpisodes, 110);
  assert.equal(drift.readmeClaimedTestEpisodes, 400);
  assert.equal(drift.currentTestEpisodes, 40);
  assert.equal(drift.currentBytesMatchReadmeDenominators, false);
  assert.equal(drift.currentBytesMatchIncludedGeneratorDenominator, false);
  assert.equal(drift.current150EpisodeSelectionCodePresent, false);
  assert.equal(drift.readmeHeadingVersionClaim, "v1.1");
  assert.equal(drift.readmeCitationVersionClaim, "v1.0");
  assert.equal(drift.generatorSeriesVersionClaim, "v2");
  assert.equal(drift.readmeLoadExampleMatchesCurrentDatasetId, false);
  assert.equal(drift.cardSizeCategoryClaim, "1K<n<10K");
  assert.equal(drift.apiTagSizeCategoryClaim, "10K<n<100K");
  assert.equal(drift.gitattributesHistoricalEpisodeShardPatterns, 20);
  assert.equal(drift.historicalEpisodeShardFilesPresentAtFixedRevision, 0);

  const synthetic = report.syntheticGenerationBoundary;
  assert.equal(synthetic.sourceNativeSyntheticTrajectoryEpisodes, 150);
  assert.equal(synthetic.publisherInjectedLabelRows, 150);
  assert.equal(synthetic.publisherGeneratedLoggedSuccessFlags, 150);
  assert.equal(synthetic.loggedSuccessFlagsObservedFromRobotTelemetry, 0);
  assert.equal(synthetic.currentRepositoryUpstreamTrajectoryBytes, 0);
  assert.equal(synthetic.includedGeneratorReadsUpstreamTrajectoryFiles, false);
  assert.equal(synthetic.upstreamDerivationIndependentlyReproduced, false);
  assert.equal(synthetic.physicsGroundingIndependentlyEstablished, false);
  assert.equal(synthetic.allSignalsSynthetic, true);
  assert.equal(synthetic.syntheticEpisodesArePhysicalExecutions, false);
  assert.equal(synthetic.syntheticActuallySucceededIsRealWorldOutcome, false);

  const integrity = report.benchmarkIntegrity;
  assert.equal(integrity.episodeIdContainsInjectedClassPrefixRows, 150);
  assert.equal(integrity.episodeIdPrefixPerfectlyRevealsTargetRows, 150);
  assert.equal(integrity.predictionTargetLeakPresent, true);
  assert.equal(integrity.labelsHiddenButTargetStillLeakedByEpisodeId, true);
  assert.equal(integrity.baselineExecutedDuringReplay, false);
  assert.equal(integrity.baselineResultsIndependentlyReproduced, false);
  assert.equal(integrity.scorer.missingPredictionsExcludedFromMetricDenominator,
    true);
  assert.equal(integrity.scorer.exactTestPredictionCensusRequired, false);
  assert.equal(integrity.scorer.duplicatePredictionIdsRejected, false);
  assert.equal(integrity.scorer.extraPredictionIdsRejected, false);
  assert.equal(integrity.scorer.strictStringBooleanParsing, false);
  assert.equal(integrity.scorer.headlineMetricDenominatorGameableByPartialSubmission,
    true);

  assert.equal(report.rightsPrivacyAndUse.rights.datasetCardLicenseClaim,
    HAPTAL_MISALIGNMENT_LICENSE);
  assert.equal(report.rightsPrivacyAndUse.rights.repositoryLicenseFilePresent,
    false);
  assert.equal(report.rightsPrivacyAndUse.rights.upstreamBaseDatasetBytesPresent,
    false);
  assert.equal(report.rightsPrivacyAndUse.rights.authorizedTrainingRows, 0);
  assert.equal(report.rightsPrivacyAndUse.privacy.rawSourcePrivate, true);
  assert.equal(report.rightsPrivacyAndUse.privacy.noPiiGuaranteed, false);
  assert.equal(report.rightsPrivacyAndUse.privacy.rawEpisodeIdsOrSignalRowsProjectedIntoReport,
    false);
  for (const field of ["physicalSourceEpisodes", "robotTelemetrySuccessRows",
    "independentOutcomeRows", "realWorldOutcomeRows", "physicalEffectRows",
    "completePhysicalEpisodeRows", "retryRows", "recoveryRows",
    "longitudinalRows", "delegationRows", "authorizedTrainingRows",
    "networkAdmissionRows", "actorCreditRows", "ceuRows", "authorityDelta"]) {
    assert.equal(report.zeroClaimBoundary[field], 0, field);
  }
  assert.equal(report.zeroClaimBoundary.autonomousActionAuthorized, false);
  assert.equal(report.artifactHash,
    "sha256:7211ec1c6df878c67023d88ccdd59f16a7768d893c74a5f977d717ebc30902e0");
  assert.equal(receipt.receiptHash,
    "sha256:a5fac75b1028a293747a9a371461599327186a2c3a8de3276be77259e9924853");
});

test("raw synthetic signals and source code stay private and publication is no-clobber", () => {
  assertPrivateTree(ARTIFACT);
  const reportFile = path.join(ARTIFACT, "report.json");
  const receiptFile = path.join(ARTIFACT, "run-receipt.json");
  const episodesFile = path.join(ARTIFACT, "source/files/episodes.parquet");
  const labelsFile = path.join(ARTIFACT, "source/files/labels.parquet");
  const generatorFile = path.join(ARTIFACT,
    "source/files/generate_misalignment_dataset.py");
  const baselineFile = path.join(ARTIFACT, "source/files/baseline.py");
  const scorerFile = path.join(ARTIFACT, "source/files/score.py");
  const reportText = readFileSync(reportFile, "utf8");
  assert.doesNotMatch(reportText, /misplaced_target_0061/u);
  assert.equal(sha256(episodesFile),
    "dbb7b0c57743ecd2f80b15ebf6cc894f5e6370d51ea297a9fedfb4f0a9fef5a4");
  assert.equal(sha256(labelsFile),
    "908c2c8875aa3a866e705b301c5dc8daa87eb170397de01c9f730225e2b68588");
  const before = [reportFile, receiptFile, episodesFile, labelsFile,
    generatorFile, baselineFile, scorerFile].map(sha256);
  const episodeBefore = lstatSync(episodesFile, { bigint: true });
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-haptal-misalignment-failure-full-repo.mjs",
      "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  const episodeAfter = lstatSync(episodesFile, { bigint: true });
  assert.deepEqual([reportFile, receiptFile, episodesFile, labelsFile,
    generatorFile, baselineFile, scorerFile].map(sha256), before);
  assert.equal(episodeAfter.size, episodeBefore.size);
  assert.equal(episodeAfter.mtimeNs, episodeBefore.mtimeNs);
});
