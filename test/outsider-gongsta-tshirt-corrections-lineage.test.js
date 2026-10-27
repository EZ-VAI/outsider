import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  GONGSTA_TSHIRT_DISPOSITION, GONGSTA_TSHIRT_SCOPE,
  GONGSTA_TSHIRT_SOURCE,
  verifyGongstaTshirtArtifactDirectory,
} from "../src/outsider-gongsta-tshirt-corrections-lineage.js";

const artifact = path.resolve(
  "artifacts/outsider-gongsta-tshirt-corrections-lineage-20260830-v1");
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

test("fixed official source closes the complete no-video repository scope", () => {
  assert.equal(report.disposition, GONGSTA_TSHIRT_DISPOSITION);
  assert.equal(report.scope.kind, GONGSTA_TSHIRT_SCOPE);
  assert.equal(report.scope.completePinnedNoVideoObjects, 40);
  assert.equal(report.scope.completePinnedNoVideoBytes, 23_179_179);
  assert.equal(report.scope.currentSemanticObjects, 29);
  assert.equal(report.scope.currentSemanticBytes, 21_634_892);
  assert.equal(report.scope.publisherBackupMetadataObjects, 11);
  assert.equal(report.scope.publisherBackupMetadataBytes, 1_544_287);
  assert.equal(report.scope.selectedUniquePayloads, 36);
  assert.equal(report.scope.selectedUniquePayloadBytes, 22_831_623);
  assert.equal(report.scope.fullTreeEntries, 570);
  assert.equal(report.scope.fullTreeFiles, 318);
  assert.equal(report.scope.fullTreeDirectories, 252);
  assert.equal(report.scope.fullTreeFileBytes, 2_833_179_487);
  assert.equal(report.scope.fullRepositoryAcquired, false);
  assert.equal(report.scope.globalUnderlyingExecutionCount, null);
  assert.equal(report.source.id, GONGSTA_TSHIRT_SOURCE.id);
  assert.equal(report.source.revision, GONGSTA_TSHIRT_SOURCE.revision);
  assert.equal(report.source.publicAtAcquisition, true);
  assert.equal(report.source.gatedAtAcquisition, false);
  assert.equal(report.source.recordStableProjectionBeforeAfterExact, true);
  assert.equal(report.source.treeStableProjectionBeforeAfterExact, true);
  assert.equal(report.source.completePaginatedTreeSnapshots, 2);
  assert.equal(report.source.pagesPerTreeSnapshot, 6);
});

test("physical rows and the metadata-selected canonical projection stay separate", () => {
  assert.equal(report.replay.data.dataFiles, 12);
  assert.equal(report.replay.data.physicalRows, 117_330);
  assert.equal(report.replay.data.physicalRowGroups, 224);
  assert.equal(report.replay.data.uniqueGlobalIndices, 111_888);
  assert.equal(report.replay.data.duplicateGlobalIndexKeys, 1_128);
  assert.equal(report.replay.data.duplicateIndexExtraRows, 5_442);
  assert.equal(report.replay.data.finiteActionStateTimestampRows, 117_330);
  assert.equal(report.replay.canonical.metadataEpisodes, 212);
  assert.equal(report.replay.canonical.metadataFrames, 111_888);
  assert.equal(report.replay.canonical.canonicalRows, 111_888);
  assert.equal(report.mechanics.actionDimensions, 28);
  assert.equal(report.mechanics.stateDimensions, 14);
  assert.equal(report.mechanics.physicalRowsAreNotAddedToCanonicalRows, true);
  assert.deepEqual(report.replay.schema.nativeDataBoundaryFields, []);
  assert.deepEqual(report.replay.schema.nativeEpisodeBoundaryFields, []);
});

test("episode 40 is twelve reset fragments plus one canonical projection, not attempts", () => {
  assert.equal(report.episode40.metadataSelectedFileIndex, 8);
  assert.equal(report.episode40.metadataSelectedRows, 178);
  assert.equal(report.episode40.physicalRowsAcrossFiles, 5_620);
  assert.deepEqual(report.episode40.physicalFileIndices, [7, 8]);
  assert.equal(report.episode40.fragmentPhysicalRows, 5_442);
  assert.equal(report.episode40.fragmentRowGroups, 12);
  assert.deepEqual(report.episode40.fragmentLengths,
    [601, 301, 367, 665, 88, 289, 1_128, 145, 495, 693, 327, 343]);
  assert.equal(report.episode40.distinctFragmentSemanticHashes, 12);
  assert.equal(report.episode40.overlappingGlobalIndexKeys, 1_128);
  assert.equal(report.episode40.overlapGlobalIndexFrom, 12_965);
  assert.equal(report.episode40.overlapGlobalIndexToExclusive, 14_093);
  assert.equal(report.episode40.sameFrameComparableRows, 2_013);
  assert.equal(report.episode40.sameFrameExactActionStateTimestampRows, 0);
  assert.equal(report.episode40.fragmentProfileRoot,
    "sha256:589cae2af3f3a03ee61e36e44c41a22624df8b4e1d50b4f48d1ed6f5c6344858");
  for (const fragment of report.episode40.fragmentProfiles) {
    assert.equal(fragment.frameFrom, 0);
    assert.equal(fragment.globalIndexFrom, 12_965);
  }
  assert.equal(report.episode40.fragmentsArePublisherLabeledAttempts, false);
  assert.equal(report.episode40.fragmentsArePublisherLabeledCorrections, false);
  assert.equal(report.episode40.fragmentsPromotedToAttempts, false);
  assert.equal(report.episode40.fragmentsPromotedToRecoveryEpisodes, false);
  assert.equal(report.episode40.fragmentOrderingEstablishesChronology, false);
  assert.equal(report.episode40.globalUnderlyingExecutionCount, null);
});

test("backup lineage and sidecar drift are replayed without silent normalization", () => {
  assert.equal(report.lineage.backupMetadataEpisodes, 153);
  assert.equal(report.lineage.backupMetadataFrames, 68_492);
  assert.equal(report.lineage.backupIsExactContiguousEpisodeIndexPrefix, true);
  assert.equal(report.lineage.backupWholeRowsExact, 121);
  assert.equal(report.lineage.backupRowsDifferingOnlyInThreeVideoEndTimestamps, 32);
  assert.equal(report.lineage.backupRowsExactAfterExcludingVideoEndTimestamps, 153);
  assert.equal(report.lineage.backupRepresentsSeparateTrajectoryPayload, false);
  assert.equal(report.lineage.backupDataParquetObjects, 0);
  assert.equal(report.lineage.publisherBackupDirectoryNameEstablishesCreationChronology,
    false);
  assert.equal(report.sidecarDrift.infoFrameDenominator, 111_888);
  assert.equal(report.sidecarDrift.globalStateActionScalarStatsDenominator, 111_888);
  assert.equal(report.sidecarDrift.physicalParquetRowDenominator, 117_330);
  assert.equal(report.sidecarDrift.imageStatsCountPerModality, 25_958);
  assert.equal(report.sidecarDrift.imageStatsCountShortfallFromCanonicalFrames,
    85_930);
  assert.deepEqual(report.sidecarDrift.episodeImageCountMismatchRowsPerModality, {
    "observation.images.left_wrist": 204,
    "observation.images.right_wrist": 204,
    "observation.images.top": 204,
  });
  assert.equal(report.sidecarDrift.imageStatsCountInterpretedAsMissingVisualFrames,
    false);
  assert.equal(report.sidecarDrift.imageStatsSemanticsIndependentlyAdjudicated,
    false);
  assert.equal(report.sidecarDrift.silentNormalizationApplied, false);
});

test("video identity, privacy, rights, outcome, and recovery remain typed and closed", () => {
  assert.equal(report.videoInventory.physicalObjects, 278);
  assert.equal(report.videoInventory.physicalBytes, 2_810_000_308);
  assert.equal(report.videoInventory.uniquePayloadClaims, 84);
  assert.equal(report.videoInventory.uniquePayloadClaimBytes, 2_396_321_227);
  assert.deepEqual(report.videoInventory.payloadOccurrenceCounts,
    { 1: 75, 8: 3, 11: 2, 12: 1, 48: 2, 49: 1 });
  assert.equal(report.videoInventory.currentCanonicalPathObjects, 40);
  assert.equal(report.videoInventory.publisherTemporaryPathObjects, 238);
  assert.equal(report.videoInventory.publisherTemporaryEpisode40PhysicalObjects,
    208);
  assert.equal(report.videoInventory.publisherTemporaryEpisode40UniquePayloadClaims,
    14);
  assert.equal(report.videoInventory.temporaryPathsEstablishTrajectoryAttemptCount,
    false);
  assert.equal(report.videoInventory.rawVideoObjectsAcquired, 0);
  assert.equal(report.videoInventory.rawVideoBytesAcquired, 0);
  assert.equal(report.repositoryNaming.nameContainsCorrections, true);
  assert.equal(report.repositoryNaming.correctionsNamingPromotedToNativeIntervention,
    false);
  assert.equal(report.outcome.publisherOutcomeLabelRows, 0);
  assert.equal(report.outcome.independentlyVerifiedOutcomeRows, 0);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
  assert.equal(report.recovery.completeAttemptCensusRows, 0);
  assert.equal(report.execution.independentlyVerifiedPhysicalExecutionRows, 0);
  assert.equal(report.privacy.noPiiOrSensitiveDataGuaranteed, false);
  assert.equal(report.rights.datasetCardLicenseClaim, "apache-2.0");
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
  assert.equal(manifest.sourceObjects.length, 54);
  assert.equal(manifest.videoInventory.physicalEntries.length, 278);
  assert.equal(manifest.videoInventory.payloadProfiles.length, 84);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyGongstaTshirtArtifactDirectory(artifact, {
    pythonExecutable: "/opt/anaconda3/bin/python",
  });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:5816475e261eeb01d0589ebbbba82183546cf51fa4ebe587555aa155716d6870");
  assert.equal(checked.receipt.receiptHash,
    "sha256:9698c576150076ec1514b9655f6eb2396be0777ef361c28a50bf10e1e9b57df4");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-gongsta-tshirt-corrections-lineage.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
