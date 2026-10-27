import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  OPEN_SWE_BOUNDED_GROUP_DISPOSITION,
  OPEN_SWE_DATASET_ID,
  OPEN_SWE_REVISION,
  verifyOpenSweBoundedGroupArtifactDirectory,
} from "../src/outsider-open-swe-bounded-group.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-open-swe-bounded-group-20260829-v1",
);

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

test("fixed-revision Open-SWE same-instance mixed-outcome group replays", () => {
  const checked = verifyOpenSweBoundedGroupArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true, checked.error);
  const { report, receipt } = checked;

  assert.equal(report.disposition, OPEN_SWE_BOUNDED_GROUP_DISPOSITION);
  assert.equal(report.source.datasetId, OPEN_SWE_DATASET_ID);
  assert.equal(report.source.revision, OPEN_SWE_REVISION);
  assert.equal(report.source.public, true);
  assert.equal(report.source.gated, false);
  assert.equal(report.source.fullFixedRevisionTreeEntries, 235);
  assert.equal(report.source.fullFixedRevisionFiles, 212);
  assert.equal(report.source.fullFixedRevisionParquetFiles, 210);
  assert.equal(report.source.fullFixedRevisionFileBytes, 41_291_049_221);
  assert.equal(report.source.fixedTreeApiPages, 1);
  assert.equal(report.source.fixedTreeApiPageLimit, 1_000);
  assert.equal(report.source.fixedTreeApiPageReturnedEntries, 235);
  assert.equal(report.source.paginationTerminatedBelowLimit, true);
  assert.equal(report.source.fixedRevisionRecordUsedStorageBytes,
    291_721_693_100);
  assert.equal(report.source.fixedRevisionRowCountPublishedInRecord, null);
  assert.equal(report.source.fullTreeInventoried, true);
  assert.equal(report.source.fullRepositoryPayloadAcquired, false);

  assert.equal(report.loaderManifest.v11MinisweagentLogicalPath,
    "data/sweagent/qwen36_27b/*/*.parquet");
  assert.equal(report.loaderManifest.v11SweagentLogicalPath,
    "data/sweagent/qwen36_27b/*/*.parquet");
  assert.equal(report.loaderManifest.physicalMinisweagentPathPresent,
    "data/minisweagent/qwen36_27b");
  assert.equal(report.loaderManifest.minisweagentPointsAtSweagentPhysicalPath,
    true);
  assert.equal(report.loaderManifest.manifestMatchesPhysicalMinisweagentPath,
    false);
  assert.equal(report.loaderManifest.directLoadDatasetDenominatorTrusted, false);
  assert.equal(report.loaderManifest.readmeHistoricalBeforeFilteringTrajectories,
    207_489);
  assert.equal(report.loaderManifest.readmeCountsApplyToV11, false);

  assert.equal(report.selection.partition,
    "data/sweagent/qwen35_122b/swe-rebench-v2");
  assert.equal(report.selection.partitionPhysicalFiles, 9);
  assert.equal(report.selection.partitionPhysicalFileBytes, 1_931_533_044);
  assert.deepEqual(report.selection.completeFullParquetOrdinals, [1, 8]);
  assert.deepEqual(report.selection.closureProofParquetOrdinals,
    [0, 2, 3, 4, 5, 6, 7]);
  assert.equal(report.selection.completeFullParquetBytes, 263_596_615);
  assert.equal(report.selection.exactClosureProofRangeBytes, 18_526_381);
  assert.equal(report.selection.acquiredParquetSourceBytes, 282_122_996);
  assert.equal(report.selection.acquisitionBudgetBytes, 300_000_000);
  assert.equal(report.selection.withinAcquisitionBudget, true);
  assert.equal(report.selection.sourceNativeSameInstanceGroup, true);
  assert.equal(report.selection.completeWithinSelectedPartition, true);
  assert.equal(report.selection.completeAcrossOtherHarnessModelPartitions, false);
  assert.equal(report.selection.completeDataset, false);

  assert.equal(report.replay.partitionRows, 20_334);
  assert.deepEqual(report.replay.partitionPublisherOutcomes,
    { resolved: 7_348, unknown: 5_236, unresolved: 7_750 });
  assert.equal(report.replay.partitionFileProfiles.length, 9);
  assert.equal(report.replay.selectedInstanceHash,
    "sha256:d853cccbb7463117cf60af4626895f44c8baec42bad4eb78147f9d94b240b8b6");
  assert.equal(report.replay.selectedRepoHash,
    "sha256:8a5c7a643c0273a0a8b6b023177ba856eb59e4569b8d2e65fe0254df1ce72072");
  assert.equal(report.replay.selectedGroupRows, 2);
  assert.deepEqual(report.replay.selectedPublisherOutcomes,
    { resolved: 1, unresolved: 1 });
  assert.deepEqual(report.replay.selectedPhysicalFileOrdinals, [1, 8]);
  assert.deepEqual(report.replay.selectedRowIndexesWithinPhysicalFiles,
    [1_545, 157]);
  assert.deepEqual(report.replay.selectedLicenses, ["MIT"]);
  assert.deepEqual(report.replay.selectedLanguages, ["typescript"]);
  assert.deepEqual(report.replay.selectedTrajectoryHashes, [
    "sha256:cc28c82fd2c907a45fe2bb2981bc580e11cdd003ce3ab50e75c197342895360d",
    "sha256:f5fdc54b03c6d6a51ea8458c7fc542e0dfdf1aeaf1b882100787b7c17951c603",
  ]);
  assert.equal(report.replay.partitionClosureReplayed, true);
  assert.equal(report.replay.sameInstanceOccurrencesInOtherSevenPartitionFiles,
    0);
  assert.equal(report.replay.rawMessagesToolsReasoningPatchesProjected, false);

  assert.equal(report.denominators.PUBLISHER_NATIVE_PARTITION_TRAJECTORY,
    20_334);
  assert.equal(
    report.denominators.SELECTED_SAME_INSTANCE_TRAJECTORY_WITHIN_PARTITION, 2);
  assert.equal(report.denominators.fixedRevisionTrajectoryTotal, null);
  assert.equal(report.denominators.additionProhibited, true);
  assert.equal(report.outcome.publisherHarnessOutcomeRows, 2);
  assert.equal(report.outcome.publisherResolutionIndependentlyRerun, false);
  assert.equal(report.outcome.chronologicalRetryOrderEstablished, false);
  assert.equal(report.outcome.recoveryEpisodeRows, 0);
  assert.equal(report.outcome.independentOutcomeRows, 0);

  assert.equal(report.rights.datasetCardLicenseClaim, "CC-BY-4.0");
  assert.equal(report.rights.datasetLicenseFilePresent, false);
  assert.deepEqual(report.rights.selectedRowRepositoryLicenses, ["MIT"]);
  assert.equal(report.rights.everySelectedRowLicenseAllowed, true);
  assert.equal(report.rights.useSpecificTrainingAuthorizationEstablished, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.privacy.rawProjectionRows, 0);
  for (const field of ["independentOutcomeRows", "realWorldOutcomeRows",
    "longitudinalOutcomeRows", "recoveryEpisodeRows", "preActionDelegationRows",
    "physicalEffectRows", "offlineTrainingRows", "productionTrainingRows",
    "networkAdmissionRows", "actorCreditRows", "ceuRows", "pricingRows",
    "authorityRows"]) assert.equal(report.boundary[field], 0, field);
  assert.equal(report.boundary.autonomousActionAuthorized, false);

  assert.equal(report.artifactHash,
    "sha256:364fc57487d10430fa68fde71625b383bc92938da7de517a7f95caa452cd4418");
  assert.equal(receipt.receiptHash,
    "sha256:b5c95a47f087a4975913dbe2178e4e38d860709474a1d9d487bc36b73c796fbc");
});

test("raw trajectories stay private and publication is no-clobber", () => {
  const report = path.join(ARTIFACT, "report.json");
  const receipt = path.join(ARTIFACT, "run-receipt.json");
  const first = path.join(ARTIFACT, "source/files/data/sweagent/qwen35_122b",
    "swe-rebench-v2/train-00001-of-00009.parquet");
  const proof = path.join(ARTIFACT,
    "source/proof-ranges/0/000000000000.bin");
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "source")).mode & 0o777, 0o700);
  for (const file of [report, receipt, first, proof]) {
    assert.equal(lstatSync(file).mode & 0o777, 0o600);
  }
  const firstBefore = lstatSync(first, { bigint: true });
  const before = [sha256(report), sha256(receipt), sha256(proof)];
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-open-swe-bounded-group.mjs", "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  const firstAfter = lstatSync(first, { bigint: true });
  assert.deepEqual([sha256(report), sha256(receipt), sha256(proof)], before);
  assert.equal(firstAfter.size, firstBefore.size);
  assert.equal(firstAfter.mtimeNs, firstBefore.mtimeNs);
});
