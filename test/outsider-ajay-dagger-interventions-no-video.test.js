import assert from "node:assert/strict";
import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  AJAY_DAGGER_BASE_ID,
  AJAY_DAGGER_BASE_REVISION,
  AJAY_DAGGER_DERIVED_ID,
  AJAY_DAGGER_DERIVED_REVISION,
  AJAY_DAGGER_DISPOSITION,
  AJAY_DAGGER_RECEIPT_SCHEMA,
  AJAY_DAGGER_REPORT_SCHEMA,
  verifyAjayDaggerArtifactDirectory,
} from "../src/outsider-ajay-dagger-interventions-no-video.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-ajay-dagger-interventions-no-video-20260830-v1");
let cached;
function artifact() {
  cached ??= verifyAjayDaggerArtifactDirectory(ARTIFACT);
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

test("Ajay complete derived and fixed-base no-video sources replay native DAgger provenance", () => {
  const checked = artifact(); const { report, receipt } = checked;
  assert.equal(checked.verificationLevel,
    "FIXED_DERIVED_AND_BASE_COMPLETE_NO_VIDEO_SOURCE_REDERIVED");
  assert.equal(report.schema, AJAY_DAGGER_REPORT_SCHEMA);
  assert.equal(receipt.schema, AJAY_DAGGER_RECEIPT_SCHEMA);
  assert.equal(report.disposition, AJAY_DAGGER_DISPOSITION);
  assert.deepEqual(report.source.repositories.map((item) => item.datasetId),
    [AJAY_DAGGER_DERIVED_ID, AJAY_DAGGER_BASE_ID]);
  assert.deepEqual(report.source.repositories.map((item) => item.revision),
    [AJAY_DAGGER_DERIVED_REVISION, AJAY_DAGGER_BASE_REVISION]);
  assert.deepEqual(report.source.repositories.map((item) => item.inventory), [
    { entries: 3_585, files: 3_575, directories: 10, bytes: 740_445_997,
      noVideoFiles: 723, noVideoBytes: 35_490_892,
      parquetFiles: 713, parquetBytes: 30_305_026,
      inventoryOnlyVideoFiles: 2_852, inventoryOnlyVideoBytes: 704_955_105 },
    { entries: 2_989, files: 2_979, directories: 10, bytes: 649_845_522,
      noVideoFiles: 999, noVideoBytes: 36_355_488,
      parquetFiles: 495, parquetBytes: 23_731_772,
      inventoryOnlyVideoFiles: 1_980, inventoryOnlyVideoBytes: 613_490_034 },
  ]);
  assert.deepEqual(report.source.repositories.map((item) => item.treePagesBefore), [4, 3]);
  assert.deepEqual(report.source.repositories.map((item) => item.treePagesAfter), [4, 3]);
  assert.deepEqual(report.source.repositories.map((item) => item.treeBeforeAfterPageBytesIdentical),
    [true, true]);
  assert.deepEqual(report.source.repositories.map((item) => item.recordBeforeAfterByteIdentical),
    [true, true]);
  assert.deepEqual(report.source.repositories.map((item) => item.noVideoObjectsVerified),
    [723, 999]);
  assert.equal(report.source.selectedRemoteBytes, 71_846_380);
  assert.equal(report.source.completeDerivedNoVideo, true);
  assert.equal(report.source.completeFixedBaseNoVideo, true);
  assert.equal(report.source.videoPayloadFilesAcquired, 0);

  const replay = report.replay;
  assert.equal(replay.derived.episodes, 713);
  assert.equal(replay.derived.frames, 164_019);
  assert.equal(replay.derived.baseEpisodes, 495);
  assert.equal(replay.derived.baseFrames, 128_742);
  assert.equal(replay.derived.daggerWeightedEpisodes, 218);
  assert.equal(replay.derived.daggerWeightedFrames, 35_277);
  assert.equal(replay.derived.parquetFiles, 713);
  assert.equal(replay.derived.parquetBytes, 30_305_026);
  assert.equal(replay.derived.finiteStateVelocityActionValues, 6_888_798);
  assert.equal(replay.derived.episodeIndexContiguous, true);
  assert.equal(replay.derived.globalIndexContiguous, true);
  assert.equal(replay.derived.frameIndexResetContiguous, true);
  assert.equal(replay.derived.timestampsAtDeclared100Hz, true);
  assert.equal(replay.derived.columns.length, 32);
  assert.deepEqual(replay.semanticBoundary.outcomeColumns, []);
  assert.equal(replay.base.episodes, 495);
  assert.equal(replay.base.frames, 128_742);
  assert.equal(replay.base.derivedPrefixByteIdenticalParquetFiles, 495);
  assert.equal(replay.base.derivedPrefixByteIdenticalParquetBytes, 23_731_772);
  assert.equal(replay.base.derivedPrefixParquetMismatches, 0);
  assert.equal(replay.base.derivedPrefixEpisodesMetadataExact, true);
  assert.equal(replay.base.derivedPrefixEpisodeStatsExact, true);
  assert.equal(replay.base.episodeManifests, 495);
  assert.equal(replay.crosswalk.baseEpisodesAreNotAdditionalPopulation, true);
  assert.equal(replay.crosswalk.derivedAndBaseCrossTotal, null);

  const weighted = replay.derived.weightedInterventions;
  assert.equal(weighted.uniqueSegments, 84);
  assert.equal(weighted.uniqueFrames, 13_920);
  assert.equal(weighted.weightedEpisodes, 218);
  assert.equal(weighted.weightedFrames, 35_277);
  assert.deepEqual(weighted.placement, { uniqueSegments: 34, uniqueFrames: 6_483,
    weightedEpisodes: 68, weightedFrames: 12_966 });
  assert.deepEqual(weighted.routing, { uniqueSegments: 50, uniqueFrames: 7_437,
    weightedEpisodes: 150, weightedFrames: 22_311 });
  assert.equal(weighted.groups.length, 84);
  assert.equal(weighted.groups.filter((item) => item.taskIndex === 0).length, 34);
  assert.equal(weighted.groups.filter((item) => item.taskIndex === 1).length, 50);
  assert.equal(weighted.groups.every((item) => item.copyIndices.length === item.copies), true);
  assert.equal(weighted.copiesDifferOnlyInSyntheticEpisodeGlobalAndCopyIndices, true);
  assert.equal(weighted.groupRoot,
    "sha256:e1b7d36cb916f58b1dab59b110c38743fcbd2a09d76268ef9618edb790fff8cc");

  const denominators = report.typedDenominators;
  assert.deepEqual(denominators.derivedPopulation,
    { populationType: "DERIVED_WEIGHTED_TRAINING_INSTANCES", episodes: 713, frames: 164_019 });
  assert.equal(denominators.basePublisherPopulation.addToDerivedPopulation, false);
  assert.equal(denominators.publisherNativeInterventionFamily.segments, 84);
  assert.equal(denominators.publisherNativeInterventionFamily.frames, 13_920);
  assert.equal(denominators.publisherNativeInterventionFamily.provenanceFields.length, 9);
  assert.equal(denominators.weightedInterventionExposure.episodeInstances, 218);
  assert.equal(denominators.crossTotal, null);
  assert.equal(report.semanticBoundary.publisherActivelyInterveningHumanClaimRetained, true);
  assert.equal(report.semanticBoundary.weightedCopiesCollapsedByNativeProvenanceAndSemanticContent,
    true);
  assert.equal(report.semanticBoundary.baseRouteSegmentsAreNotAttemptsOrOutcomes, true);
  assert.equal(report.semanticBoundary.daggerInterventionDoesNotEstablishRecovery, true);
  for (const key of ["nativeOutcomeRows", "independentOutcomeRows", "recoveryEffectRows",
    "completeAttemptCensusRows", "independentPhysicalWitnessRows",
    "independentCausalEffectRows"]) assert.equal(report.semanticBoundary[key], 0, key);
  assert.equal(report.rightsPrivacyAndUse.rights.rightsDisposition, "FAIL_CLOSED");
  assert.equal(report.rightsPrivacyAndUse.rights.authorizedTrainingRows, 0);
  assert.equal(report.rightsPrivacyAndUse.privacy.noPiiGuaranteed, false);
  assert.equal(report.rightsPrivacyAndUse.use.quarantineEvaluationOnly, true);
  assert.equal(receipt.uniquePublisherInterventionSegments, 84);
  assert.equal(receipt.weightedInterventionEpisodeInstances, 218);
});

test("Ajay artifact is private and receipt-bound to all 1,722 selected source objects", () => {
  const checked = artifact(); assertPrivateTree(ARTIFACT);
  assert.equal(checked.report.source.acquisitionHash,
    "sha256:d02f30fe362c374251bdd33610fa7eb11eb44000d7c5cb211058dcdcb1349108");
  assert.equal(checked.report.source.replayHash,
    "sha256:35fc120081c40b6e082c24b2275ba36070c874c037f0dbde5daad410d69cea56");
  assert.equal(checked.report.source.sourceManifestHash,
    "sha256:f0993c0443c8bd5e49fadb297ae0f9313b7ea90d1f58e156d24a948ebfa801b9");
  assert.equal(checked.report.source.sourceManifestFileSha256,
    "sha256:393a3e0a727ac39bf7f0c7ff43b89a16c77d5ebaa61c5aaa12167c6474d522f9");
  assert.equal(checked.report.source.sourceRoot,
    "sha256:61fafd371073697836d34f9a4c41564e49f24929200402ef2e95f832d86ac988");
  assert.equal(checked.report.artifactHash,
    "sha256:e6c9cbf571ffa686b2ce4f9a8291d88756521d22847be09c05fde26eb3d37335");
  assert.equal(checked.receipt.reportHash, checked.report.artifactHash);
  assert.equal(checked.receipt.sourceRoot, checked.report.source.sourceRoot);
  assert.equal(checked.receipt.sourceManifestHash, checked.report.source.sourceManifestHash);
  assert.equal(checked.receipt.receiptHash,
    "sha256:70d9722a8735be2f73ae5347904ede5abd78a05cd43554704888421504944ad0");
  assert.equal(checked.receipt.receiptWrittenLast, true);
  assert.equal(checked.receipt.noClobber, true);
  assert.equal(checked.reportFileSha256,
    "sha256:124ac095741021c8119b8801187d4c93b88d9658d7c8bef7433f309923f445c3");
  assert.equal(checked.receiptFileSha256,
    "sha256:7c0d127671b93d28ce155840bdd32fcb975cd61c5ba3b585c55562c6e71be94a");
});
