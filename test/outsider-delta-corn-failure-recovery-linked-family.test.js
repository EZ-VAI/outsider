import assert from "node:assert/strict";
import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DELTA_CORN_CARD_LICENSE,
  DELTA_CORN_DISPOSITION,
  DELTA_CORN_REPOSITORIES,
  verifyDeltaCornArtifactDirectory,
} from "../src/outsider-delta-corn-failure-recovery-linked-family.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-delta-corn-failure-recovery-linked-family-20260830-v1");
let cached;
function artifact() {
  cached ??= verifyDeltaCornArtifactDirectory(ARTIFACT);
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

test("three fixed Delta corn repositories replay full no-video and cam_high closures", () => {
  const checked = artifact();
  assert.equal(checked.verificationLevel,
    "THREE_FIXED_REPOSITORY_NO_VIDEO_PLUS_COMPLETE_CAM_HIGH_REDERIVED");
  const { report, receipt } = checked;
  assert.equal(report.disposition, DELTA_CORN_DISPOSITION);

  assert.equal(report.source.selectedRepositoryFiles, 78);
  assert.equal(report.source.selectedRepositoryBytes, 256_155_436);
  assert.equal(report.source.selectedNoVideoFiles, 48);
  assert.equal(report.source.selectedNoVideoBytes, 1_363_239);
  assert.equal(report.source.selectedCamHighFiles, 30);
  assert.equal(report.source.selectedCamHighBytes, 254_792_197);
  assert.equal(report.source.rawSourcePrivate, true);
  assert.equal(report.source.allSourceFilesMode, "0600");
  assert.equal(report.source.allSourceDirectoriesMode, "0700");
  assert.equal(report.source.sourceManifestHash,
    "sha256:eaff8a678bb4560426f2c9da170654a972bd3c34ac1cb7f73456395dadce2a8b");
  assert.equal(report.source.sourceManifestFileSha256,
    "sha256:dfec327934a37b01c48ea0b6ee2f38767bc80a4a2ab88871bd7ad199032786b6");
  assert.equal(report.source.sourceRoot,
    "sha256:100494cfc0e80bfdacd660daf3f54629c0a5eee26830a827cecfbb12b8bfb233");

  const treeRoots = {
    failure_10_1: "sha256:8632a042d7fdb48e0898f0d2d1455ed51cb9d5e381808d60219e55d2cfabb516",
    failure_10_2: "sha256:79b75263e47a6f21de537e0220e75d9e2b90171932a20e10b9efa098452e97b0",
    recovery_10_1: "sha256:67c668adba8880f4c7236e94c23b0a6d0702b8c09fc3cd7cdde6e4927ccee6e3",
  };
  const cameraBytes = {
    failure_10_1: {
      "observation.images.cam_high": 73_863_372,
      "observation.images.cam_high_depth": 74_747_731,
      "observation.images.cam_low": 55_702_965,
      "observation.images.cam_low_depth": 27_280_691,
      "observation.images.cam_right_wrist": 50_530_368,
    },
    failure_10_2: {
      "observation.images.cam_high": 74_767_538,
      "observation.images.cam_high_depth": 74_807_715,
      "observation.images.cam_low": 55_558_253,
      "observation.images.cam_low_depth": 27_032_193,
      "observation.images.cam_right_wrist": 50_653_626,
    },
    recovery_10_1: {
      "observation.images.cam_high": 106_161_287,
      "observation.images.cam_high_depth": 108_435_693,
      "observation.images.cam_low": 80_364_078,
      "observation.images.cam_low_depth": 41_941_646,
      "observation.images.cam_right_wrist": 70_239_341,
    },
  };
  assert.equal(report.source.repositories.length, 3);
  for (let index = 0; index < report.source.repositories.length; index += 1) {
    const actual = report.source.repositories[index]; const expected = DELTA_CORN_REPOSITORIES[index];
    assert.equal(actual.repositoryKey, expected.key);
    assert.equal(actual.datasetId, expected.datasetId);
    assert.equal(actual.revision, expected.revision);
    assert.equal(actual.public, true);
    assert.equal(actual.gated, false);
    assert.equal(actual.disabled, false);
    assert.equal(actual.recordBeforeAfterByteIdentical, true);
    assert.equal(actual.treeBeforeAfterByteIdentical, true);
    assert.equal(actual.recordUsedStorageBytes, 0);
    assert.equal(actual.fullTreeEntries, 76);
    assert.equal(actual.fullTreeFiles, 66);
    assert.equal(actual.fullTreeDirectories, 10);
    assert.equal(actual.fullTreeBytes, expected.fullTreeBytes);
    assert.equal(actual.fullTreeLfsFiles, 60);
    assert.equal(actual.fullTreeXetFiles, 60);
    assert.equal(actual.fullTreeRoot, treeRoots[expected.key]);
    assert.equal(actual.allFiveCameraInventoriesTerminal, true);
    assert.equal(actual.selectedFiles, 26);
    assert.equal(actual.selectedBytes, expected.selectedBytes);
    assert.equal(actual.selectedNoVideoFiles, 16);
    assert.equal(actual.selectedNoVideoBytes, expected.noVideoBytes);
    assert.equal(actual.selectedCamHighFiles, 10);
    assert.equal(actual.selectedCamHighBytes, expected.camHighBytes);
    for (const [camera, bytes] of Object.entries(cameraBytes[expected.key])) {
      assert.deepEqual(actual.completeFiveCameraInventory[camera],
        { bytes, files: 10, terminal: true });
    }
  }

  const census = report.sourceNativeCensus;
  assert.equal(census.sourceNativeEpisodeFiles, 30);
  assert.equal(census.sourceNativeFrameRows, 15_794);
  assert.equal(census.publisherFailureNamedRepositories, 2);
  assert.equal(census.publisherRecoveryNamedRepositories, 1);
  assert.equal(census.task, "put the corn in the box");
  assert.equal(census.robotType, "trossen_ai_stationary");
  assert.equal(census.fps, 30);
  assert.equal(census.actionDimensions, 14);
  assert.equal(census.stateDimensions, 14);
  assert.equal(census.typedPopulationsAreNonAdditiveForOutcomeOrRecoveryComparison, true);
  assert.equal(census.crossTotal, null);
  assert.deepEqual(census.typedPublisherPopulations.map((item) => ({
    key: item.repositoryKey, family: item.publisherFamily,
    ordinal: item.publisherOrdinal, episodes: item.sourceNativeEpisodes,
    frames: item.sourceNativeFrames,
  })), [
    { key: "failure_10_1", family: "failure", ordinal: "10_1", episodes: 10, frames: 4_618 },
    { key: "failure_10_2", family: "failure", ordinal: "10_2", episodes: 10, frames: 4_619 },
    { key: "recovery_10_1", family: "recovery", ordinal: "10_1", episodes: 10, frames: 6_557 },
  ]);

  const replay = report.parquetAndMetadataReplay;
  assert.equal(replay.allThirtyDataParquetsDecoded, true);
  assert.equal(replay.allThirtyEpisodeMetadataRowsDecoded, true);
  assert.equal(replay.allThirtyEpisodeStatsRowsDecoded, true);
  assert.equal(replay.metadataInfoAndTaskFilesDecoded, true);
  assert.equal(replay.parquetDecodedAsInertDataOnly, true);
  assert.equal(replay.downloadedInstructionsExecuted, false);
  assert.equal(replay.crossRepository.parquetSchemaRoot,
    "sha256:a1329ea0d99191b946ac4f64f45f8e166c7544b2bb7f69abeed3c6d197ea348d");
  assert.equal(replay.crossRepository.taskStringsExactAcrossRepositories, true);
  assert.equal(replay.crossRepository.robotAndSchemaExactAcrossRepositories, true);
  assert.deepEqual(replay.crossRepository.canonicalTrajectoryDuplicateGroups, []);
  assert.equal(replay.crossRepository.crossRepositoryExactCanonicalTrajectoryPairs, 0);
  assert.equal(replay.crossRepository.sameOrdinalCanonicalMatches, 0);
  assert.equal(replay.crossRepository.episodeOrdinalEstablishesPairing, false);
  assert.equal(replay.crossRepository.episodeOrdinalEstablishesChronology, false);

  const lengths = {
    failure_10_1: [432, 470, 431, 484, 417, 447, 485, 434, 530, 488],
    failure_10_2: [401, 383, 446, 438, 539, 504, 486, 450, 503, 469],
    recovery_10_1: [781, 649, 526, 640, 490, 553, 785, 787, 675, 671],
  };
  const trajectoryRoots = {
    failure_10_1: "sha256:0648869998e8cc60c588897f584a56d38e847c318d88f3dbd51aa0c50be640d7",
    failure_10_2: "sha256:d06fe9a48e432e8191010cfaf405a7095431a7e84fe1e9f41abeb9e0e4c8eeab",
    recovery_10_1: "sha256:af07e3e7c72965390967a7693116254ba673c86382872b7dbdbae3a29eed7f14",
  };
  const visualRoots = {
    failure_10_1: "sha256:27f804f987f7669977d503bfa370ff0c08bf0ef34ea873644304d33832248086",
    failure_10_2: "sha256:663022b0bfba4672c05adcc0fbb7e8976f2a432c294f0f07bcce40fe33eed137",
    recovery_10_1: "sha256:5dd762fdb06e12999027da46bf0df46c9be7766fc910a475cbbe4afc94b81edc",
  };
  const visualCounts = {
    failure_10_1: [100, 100, 100, 103, 100, 100, 103, 100, 110, 103],
    failure_10_2: [100, 100, 100, 100, 111, 106, 103, 100, 106, 100],
    recovery_10_1: [147, 128, 109, 127, 104, 114, 148, 148, 132, 131],
  };
  for (const row of replay.repositories) {
    assert.equal(row.episodes, 10);
    assert.equal(row.task, "put the corn in the box");
    assert.equal(row.robotType, "trossen_ai_stationary");
    assert.deepEqual(row.episodeLengths, lengths[row.repositoryKey]);
    assert.deepEqual(row.indexOffsetPattern, [0, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    assert.equal(row.indexContiguousWithinEpisodes, true);
    assert.equal(row.indexResetsAcrossEpisodes, true);
    assert.equal(row.globalIndicesContiguous, false);
    assert.equal(row.timestampsMatchThirtyFps, true);
    assert.equal(row.allValuesFinite, true);
    assert.equal(row.canonicalTrajectorySetRoot, trajectoryRoots[row.repositoryKey]);
    assert.equal(row.trajectoryRows.length, 10);
    assert.equal(new Set(row.trajectoryRows.map((item) => item.canonicalTrajectoryHash)).size, 10);
    assert.equal(row.kinematicMorphology.actionMinimumByDimension.length, 14);
    assert.equal(row.kinematicMorphology.actionMaximumByDimension.length, 14);
    assert.equal(row.kinematicMorphology.stateMinimumByDimension.length, 14);
    assert.equal(row.kinematicMorphology.meanAbsoluteActionDeltaByDimension.length, 14);
    assert.equal(Object.values(row.kinematicMorphology).flat().every(Number.isFinite), true);
    assert.equal(row.visualMorphology.visualMorphologyRoot, visualRoots[row.repositoryKey]);
    assert.deepEqual(row.visualMorphology.perEpisodeCamHigh
      .map((item) => item.sampledFramesPerCamera), visualCounts[row.repositoryKey]);
    assert.equal(row.visualMorphology.rawPixelsProjected, false);
    assert.equal(row.outcomeRewardDoneInterventionColumns.length, 0);
  }

  const videos = report.videoContainerReplay;
  assert.equal(videos.selectedCamHighVideos, 30);
  assert.equal(videos.selectedCamHighBytes, 254_792_197);
  assert.equal(videos.everyVideoSampleCountMatchesParquetRows, true);
  assert.equal(videos.allContainersStructurallyParsed, true);
  assert.equal(videos.compressedPixelsDecoded, false);
  assert.equal(videos.visualSemanticsIndependentlyReviewed, false);
  const containerRoots = {
    failure_10_1: "sha256:f8482e275947cd01236a0f7151ae7818280bb36296e75afc21c07fcf3787a408",
    failure_10_2: "sha256:e925a959b0193940a98b7e9c69e556af83dd52b366d984325fc44d81e9a1a4ae",
    recovery_10_1: "sha256:ccd1bffe843d64e7e715f0933bb133aae6792527d463efb1160624d559c972d6",
  };
  for (const row of videos.repositories) {
    const repo = DELTA_CORN_REPOSITORIES.find((item) => item.key === row.repositoryKey);
    assert.equal(row.videos, 10);
    assert.equal(row.videoBytes, repo.camHighBytes);
    assert.equal(row.totalSamples, repo.frames);
    assert.equal(row.containerProfileRoot, containerRoots[row.repositoryKey]);
    assert.equal(row.episodes.length, 10);
    for (const episode of row.episodes) {
      assert.equal(episode.codec, "av01");
      assert.equal(episode.width, 640);
      assert.equal(episode.height, 480);
      assert.equal(episode.samples, episode.frames);
      assert.ok(Math.abs(episode.durationSeconds - episode.frames / 30) < 0.000_001);
    }
  }
});

test("publisher family names remain non-causal and rights, privacy, and authority fail closed", () => {
  const { report, receipt } = artifact();
  const family = report.publisherFamilyBoundary;
  assert.equal(family.repositoryNameIsOnlyFailureRecoveryMembershipEvidence, true);
  assert.equal(family.genericReadmesContainFailureWord, false);
  assert.equal(family.genericReadmesContainRecoveryWord, false);
  assert.equal(family.genericReadmesContainSuccessWord, false);
  assert.equal(family.dataOutcomeRewardDoneInterventionFields, 0);
  assert.equal(family.metadataOutcomeRewardDoneInterventionFields, 0);
  assert.equal(family.publisherFamilyMembershipRows, 30);
  assert.equal(family.sourceNativeOutcomeRows, 0);
  assert.equal(family.independentOutcomeRows, 0);
  assert.equal(family.recoveryInterventionRows, 0);
  assert.equal(family.recoveryEffectRows, 0);
  assert.equal(family.physicalEffectRows, 0);
  assert.equal(family.realWorldOutcomeRows, 0);
  assert.equal(family.failureNamedDoesNotEstablishFailureOutcome, true);
  assert.equal(family.recoveryNamedDoesNotEstablishRecoveryInterventionOrEffect, true);

  const pairing = report.crossRepositoryIdentityAndPairing;
  assert.equal(pairing.taskAndRobotSchemaLineageShared, true);
  assert.equal(pairing.exactDataPayloadDuplicateGroups, 0);
  assert.equal(pairing.exactCamHighPayloadDuplicateGroups, 0);
  assert.equal(pairing.exactCanonicalTrajectoryPairs, 0);
  assert.equal(pairing.sameOrdinalCanonicalMatches, 0);
  assert.equal(pairing.sourceIdentityProvenEpisodePairs, 0);
  assert.equal(pairing.episodeOrdinalPairingAuthorized, false);
  assert.equal(pairing.crossRepositoryChronologyEstablished, false);
  assert.equal(pairing.pairedFailureRecoveryComparisons, 0);
  assert.equal(pairing.causalRecoveryComparisons, 0);

  const rights = report.rightsPrivacyAndUse;
  assert.equal(rights.rights.allCardClaimsApache20, true);
  assert.deepEqual(rights.rights.datasetCardLicenseClaims.map((item) => item.claim),
    [DELTA_CORN_CARD_LICENSE, DELTA_CORN_CARD_LICENSE, DELTA_CORN_CARD_LICENSE]);
  assert.equal(rights.rights.repositoryLicenseFilesPresent, 0);
  assert.equal(rights.rights.legalConclusionEstablished, false);
  assert.equal(rights.rights.rightsDisposition, "FAIL_CLOSED");
  assert.equal(rights.rights.authorizedTrainingRows, 0);
  assert.equal(rights.privacy.rawVisualAndTrajectorySourcePrivate, true);
  assert.equal(rights.privacy.noPiiGuaranteed, false);
  assert.equal(rights.privacy.rawFramesOrKinematicRowsProjectedIntoReport, false);
  assert.equal(rights.use.quarantineEvaluationOnly, true);
  assert.equal(rights.use.offlineTrainingRows, 0);
  assert.equal(rights.use.productionTrainingRows, 0);
  assert.equal(rights.use.networkAdmissionRows, 0);
  assert.equal(rights.use.authorityRows, 0);
  assert.equal(rights.use.ceuRows, 0);
  for (const [key, value] of Object.entries(report.zeroClaimBoundary)) {
    assert.equal(value, key === "autonomousActionAuthorized" ? false : 0, key);
  }

  assert.equal(report.artifactHash,
    "sha256:a41a67e5c6673d52d3b4a81d9a6e53438b36ec6733110905ed373dc4fb7025ea");
  assert.equal(receipt.receiptHash,
    "sha256:aa45f13a9ef8b8687733d2a7ba9fe2e5dbacbda4dc7b4411094fa02c5c422f67");
  assert.equal(receipt.reportHash, report.artifactHash);
  assert.equal(receipt.sourceManifestHash, report.source.sourceManifestHash);
  assert.equal(receipt.sourceRoot, report.source.sourceRoot);
  assert.equal(receipt.crossTotal, null);
  assert.equal(receipt.receiptWrittenLast, true);
  assert.equal(receipt.noClobber, true);
  assert.equal(receipt.sourceNativeOutcomeRows, 0);
  assert.equal(receipt.recoveryEffectRows, 0);
  assert.equal(receipt.authorizedTrainingRows, 0);
});

test("artifact bytes are private and exactly receipt-bound", () => {
  const checked = artifact();
  assertPrivateTree(ARTIFACT);
  assert.equal(checked.reportFileSha256,
    "sha256:6c86754bc07a1e2e91734284c2d3361533774e6eb3a8849a7aa317ac0dd54180");
  assert.equal(checked.receiptFileSha256,
    "sha256:415c56e2f823848ab46d5307e7017ad3137984f7597dbf3e93246099eb77ba63");
});

