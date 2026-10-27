import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  SWE_SMITH_CROSS_FORMAT_DATASET_ID,
  SWE_SMITH_CROSS_FORMAT_DISPOSITION,
  SWE_SMITH_CROSS_FORMAT_REVISION,
  verifySweSmithCrossFormatArtifactDirectory,
} from "../src/outsider-swe-smith-cross-format-group.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-swe-smith-cross-format-group-20260829-v1",
);

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

test("fixed-revision SWE-smith cross-format groups replay with exact dedupe", () => {
  const checked = verifySweSmithCrossFormatArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true, checked.error);
  const { report, receipt } = checked;

  assert.equal(report.disposition, SWE_SMITH_CROSS_FORMAT_DISPOSITION);
  assert.equal(report.source.datasetId, SWE_SMITH_CROSS_FORMAT_DATASET_ID);
  assert.equal(report.source.revision, SWE_SMITH_CROSS_FORMAT_REVISION);
  assert.equal(report.source.public, true);
  assert.equal(report.source.gated, false);
  assert.equal(report.source.fullFixedRevisionTreeEntries, 35);
  assert.equal(report.source.fullFixedRevisionFiles, 34);
  assert.equal(report.source.fullFixedRevisionParquetFiles, 32);
  assert.equal(report.source.fullFixedRevisionFileBytes, 4_223_845_920);
  assert.equal(report.source.fixedTreeApiPages, 1);
  assert.equal(report.source.fixedTreeApiPageLimit, 1_000);
  assert.equal(report.source.fixedTreeApiPageReturnedEntries, 35);
  assert.equal(report.source.paginationTerminatedBelowLimit, true);
  assert.equal(report.source.fixedRevisionRecordUsedStorageBytes, 8_777_676_392);
  assert.equal(report.source.fullTreeInventoried, true);
  assert.equal(report.source.fullRepositoryPayloadAcquired, false);
  assert.equal(report.source.exactTrajIdColumnCensusAllPhysicalParquetPaths,
    true);
  assert.equal(report.source.selectedCompleteRowGroupsAcquired, true);
  assert.equal(report.source.sourceManifestHash,
    "sha256:4315ca1f8bc8594dae371e80904d476c85e66b3bf29e74bbacf9745ef6e5e7ef");
  assert.equal(report.source.sourceRoot,
    "sha256:9e3a8e2f1c100e1478f632f6e08f94efdee29aa58f2929ce3bce2f11aae80e3f");

  assert.deepEqual(report.representationInventory.cardPublishedRows,
    { ticks: 25_826, tool: 24_100, xml: 26_076 });
  assert.deepEqual(report.representationInventory.configuredPhysicalPaths,
    ["data/ticks-*", "data/tool-*", "data/xml-*"]);
  assert.equal(report.representationInventory.legacyUnconfiguredPhysicalPath,
    "data/train-*");
  assert.equal(report.representationInventory.physicalFilesPerRepresentation, 8);
  assert.equal(report.representationInventory.readmeFineTuningTrajectoryClaim,
    5_017);
  assert.equal(
    report.representationInventory.configuredPhysicalRowCountsAddableAsLogicalDenominator,
    false);
  assert.equal(report.representationInventory.legacyTrainRowsAddableToConfiguredRows,
    false);

  assert.equal(report.selection.sourceNativeGroupKey, "traj_id");
  assert.equal(report.selection.selectedLogicalGroups, 2);
  assert.equal(report.selection.selectedPhysicalRepresentationRows, 4);
  assert.deepEqual(report.selection.selectedFormats, ["ticks", "tool"]);
  assert.equal(report.selection.physicalParquetPathsClosed, 32);
  assert.equal(report.selection.exactSourceRangeBytes, 196_566_655);
  assert.equal(report.selection.acquisitionBudgetBytes, 300_000_000);
  assert.equal(report.selection.withinAcquisitionBudget, true);
  assert.equal(report.selection.completeAcrossFixedRevisionPhysicalParquetPaths,
    true);
  assert.equal(report.selection.sameTaskMixedOutcomeContrast, false);
  assert.equal(report.selection.chronologicalRetryGroup, false);
  assert.equal(report.selection.sourceUniverseExhaustedForTrajIdCensus, true);
  assert.equal(report.selection.sourceUniverseExhaustedForRawTrajectoryPayloads,
    false);

  assert.deepEqual(report.replay.crossFormat.physicalRowsByRepresentation,
    { ticks: 25_826, tool: 24_100, train: 26_076, xml: 26_076 });
  assert.deepEqual(report.replay.crossFormat.distinctTrajIdsByRepresentation,
    { ticks: 25_826, tool: 24_100, train: 23_821, xml: 23_821 });
  assert.equal(report.replay.crossFormat.toolTicksIntersection, 8_866);
  assert.equal(report.replay.crossFormat.toolXmlIntersection, 14_984);
  assert.equal(report.replay.crossFormat.ticksXmlIntersection, 0);
  assert.equal(report.replay.crossFormat.configuredTripleIntersection, 0);
  assert.equal(report.replay.crossFormat.configuredDistinctTrajIds, 49_897);
  assert.equal(report.replay.crossFormat.allPhysicalDistinctTrajIds, 49_897);
  assert.equal(report.replay.crossFormat.legacyTrainEqualsXmlTrajIds, true);
  assert.deepEqual(report.replay.crossFormat.toolShard4Profile,
    { other: 0, toolOnly: 197, toolTicks: 588,
      toolXmlAndLegacyTrain: 2_227 });

  assert.equal(report.replay.selectedLogicalGroupCount, 2);
  assert.equal(report.replay.selectedPhysicalRepresentationRows, 4);
  assert.equal(report.replay.sameInstanceContrast, false);
  assert.deepEqual(report.replay.selectedPublisherOutcomes,
    { resolved: 1, unresolved: 1 });
  assert.deepEqual(report.replay.selectedLogicalGroups.map((group) => ({
    trajectoryHash: group.trajectoryHash,
    instanceHash: group.instanceHash,
    publisherOutcome: group.publisherOutcome,
    rows: group.physicalRepresentations.map((item) => [item.format, item.rowIndex]),
  })), [
    {
      trajectoryHash:
        "sha256:00922d5017c4be2e2dc14788eb045586e3ba1cb6b0d89c8f40a4f755a70db6ef",
      instanceHash:
        "sha256:7e9cf9de3721e98b3af99dac7f9639884e980af304d836da16a27f3ba198e412",
      publisherOutcome: "unresolved", rows: [["ticks", 1_311], ["tool", 659]],
    },
    {
      trajectoryHash:
        "sha256:014ac4b3ac17adb9089181edb9c2136c539f983576689f140484c4759f3dcdc2",
      instanceHash:
        "sha256:5a59e10779cc79d8763aa1211f32f1bcad54ddb9a6300d302c3179737ee5ac87",
      publisherOutcome: "resolved", rows: [["ticks", 1_222], ["tool", 565]],
    },
  ]);

  assert.equal(report.denominators.FIXED_REVISION_CONFIGURED_DISTINCT_TRAJ_IDS,
    49_897);
  assert.equal(report.denominators.FIXED_REVISION_ALL_PHYSICAL_DISTINCT_TRAJ_IDS,
    49_897);
  assert.equal(report.denominators.configuredPhysicalRowsArithmeticOnly, 76_002);
  assert.equal(report.denominators.configuredPhysicalRowsAreLogicalDenominator,
    false);
  assert.equal(report.denominators.crossRepresentationAdditionProhibited, true);

  assert.equal(report.outcome.publisherHarnessOutcomeLogicalRows, 2);
  assert.equal(report.outcome.duplicatePhysicalOutcomeRepresentationRows, 4);
  assert.equal(report.outcome.outcomeDeduplicatedByTrajId, true);
  assert.equal(report.outcome.publisherResolutionIndependentlyRerun, false);
  assert.equal(report.outcome.publisherHarnessIndependentOfActingAgent, false);
  assert.equal(report.outcome.sameTaskContrastEstablished, false);
  assert.equal(report.outcome.recoveryEpisodeRows, 0);
  assert.equal(report.outcome.independentOutcomeRows, 0);

  assert.equal(report.rights.datasetCardLicenseClaim, "MIT");
  assert.equal(report.rights.datasetLicenseFilePresent, false);
  assert.equal(report.rights.rowLevelLicenseFieldPresent, false);
  assert.equal(report.rights.everySelectedRowLicenseIndependentlyVerifiedPermissive,
    false);
  assert.equal(report.rights.useSpecificTrainingAuthorizationEstablished, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.privacy.rawSourceRangesPrivate, true);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.privacy.rawTrajectoryProjectionRows, 0);
  for (const field of ["independentOutcomeRows", "realWorldOutcomeRows",
    "longitudinalOutcomeRows", "recoveryEpisodeRows", "preActionDelegationRows",
    "physicalEffectRows", "offlineTrainingRows", "productionTrainingRows",
    "networkAdmissionRows", "actorCreditRows", "ceuRows", "pricingRows",
    "authorityRows"]) assert.equal(report.boundary[field], 0, field);
  assert.equal(report.boundary.autonomousActionAuthorized, false);

  assert.equal(report.artifactHash,
    "sha256:d1d60ddb9fa0de7e2df28608f1d408c998ba07e4896c9bb180cef868cfdb5d06");
  assert.equal(receipt.receiptHash,
    "sha256:bec05d9843c6058c48cc09f674a7f8dcab8b545ab62bb4643f3491a07ce1929c");
});

test("raw ranges stay private and publication is no-clobber", () => {
  assertPrivateTree(ARTIFACT);
  const report = path.join(ARTIFACT, "report.json");
  const receipt = path.join(ARTIFACT, "run-receipt.json");
  const range = path.join(ARTIFACT, "source/ranges/data/tool-00004-of-00008.parquet",
    "000000000000-000031541683.bin");
  const before = [sha256(report), sha256(receipt), sha256(range)];
  const rangeBefore = lstatSync(range, { bigint: true });
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-swe-smith-cross-format-group.mjs", "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  const rangeAfter = lstatSync(range, { bigint: true });
  assert.deepEqual([sha256(report), sha256(receipt), sha256(range)], before);
  assert.equal(rangeAfter.size, rangeBefore.size);
  assert.equal(rangeAfter.mtimeNs, rangeBefore.mtimeNs);
});
