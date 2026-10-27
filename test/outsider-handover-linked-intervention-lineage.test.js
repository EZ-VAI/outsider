import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  HANDOVER_LINKED_DISPOSITION, HANDOVER_LINKED_SCOPE,
  HANDOVER_LINKED_SOURCES,
  verifyHandoverLinkedArtifactDirectory,
} from "../src/outsider-handover-linked-intervention-lineage.js";

const artifact = path.resolve(
  "artifacts/outsider-handover-linked-intervention-lineage-20260830-v1");
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

test("three fixed official sources close the complete no-video linked family", () => {
  assert.equal(report.disposition, HANDOVER_LINKED_DISPOSITION);
  assert.equal(report.scope.kind, HANDOVER_LINKED_SCOPE);
  assert.equal(report.scope.repositoryCount, 3);
  assert.equal(report.scope.fixedRevisionCount, 3);
  assert.equal(report.scope.completePinnedNoVideoObjects, 18);
  assert.equal(report.scope.completePinnedNoVideoBytes, 101_137_598);
  assert.equal(report.scope.selectedUniquePayloads, 11);
  assert.equal(report.scope.selectedUniquePayloadBytes, 99_688_595);
  assert.equal(report.scope.repositoryEpisodeOccurrences, 619);
  assert.equal(report.scope.repositoryFrameOccurrences, 586_717);
  assert.equal(report.scope.byteLinkedEpisodeKeys, 208);
  assert.equal(report.scope.byteLinkedFrameKeys, 197_088);
  assert.equal(report.scope.globalUnderlyingExecutionCount, null);
  assert.equal(report.scope.fullTreeEntries, 183);
  assert.equal(report.scope.fullTreeFiles, 147);
  assert.equal(report.scope.fullTreeDirectories, 36);
  assert.equal(report.source.sources.length, 3);
  assert.equal(report.source.officialRecordIdInputDiscrepancyCount, 1);
  assert.equal(report.source.sources[0].id,
    "Jiacheng0603/handover_lerobot_dataset_208trajs_pi05_task_cmd_crop_intervention");
  assert.equal(report.source.sources[0].requestedIdMatchesOfficialRecordId, false);
  assert.deepEqual(report.source.sources.map((row) => row.revision),
    HANDOVER_LINKED_SOURCES.map((row) => row.revision));
  for (const row of report.source.sources) {
    assert.equal(row.publicAtAcquisition, true);
    assert.equal(row.gatedAtAcquisition, false);
    assert.equal(row.recordStableProjectionBeforeAfterExact, true);
    assert.equal(row.treeStableProjectionBeforeAfterExact, true);
    assert.equal(row.recordResponseBeforeAfterExact, true);
    assert.equal(row.treeResponseBeforeAfterExact, false);
    assert.equal(row.treeRawDriftReason, "mutable_expanded_tree_metadata_only");
  }
});

test("A and B crosswalk every row and differ only in native intervention", () => {
  const pair = report.linkedFamily.absolutePair;
  assert.equal(pair.episodeRowsCrosswalked, 208);
  assert.equal(pair.frameRowsCrosswalked, 197_088);
  assert.equal(pair.supportObjectsExactByteIdentical, 5);
  assert.equal(pair.onlyDifferingField, "observation.intervention");
  for (const field of ["observation.state", "action", "timestamp",
    "frame_index", "episode_index", "index", "task_index"]) {
    assert.deepEqual(pair.fieldComparisons[field], {
      differentRows: 0, differentValues: 0, exact: true,
      maxAbsoluteDifference: 0,
    });
  }
  assert.deepEqual(pair.fieldComparisons["observation.intervention"], {
    differentRows: 197_088, differentValues: 197_088, exact: false,
    maxAbsoluteDifference: 1,
  });
  assert.deepEqual(report.intervention.perRepository.intervention.valueCounts,
    { 1: 197_088 });
  assert.deepEqual(report.intervention.perRepository.no_intervention.valueCounts,
    { 0: 197_088 });
  assert.equal(report.sidecarDrift.noInterventionEpisodeSidecarMismatchRows, 208);
  assert.deepEqual(report.sidecarDrift.intervention.no_intervention.globalMismatchFields,
    ["min", "max", "mean"]);
  assert.equal(report.sidecarDrift.byteNativeParquetValuesTakePrecedence, true);
  assert.equal(report.sidecarDrift.silentNormalizationApplied, false);
});

test("C is an exact 203-episode prefix with byte-proven absolute-to-delta math", () => {
  const delta = report.linkedFamily.deltaCrosswalk;
  assert.equal(delta.selectionKind, "EXACT_CONTIGUOUS_PREFIX_OF_A_AND_B");
  assert.equal(delta.episodeRowsCrosswalked, 203);
  assert.equal(delta.frameRowsCrosswalked, 192_541);
  assert.deepEqual(delta.prefixFieldsExact, ["observation.state",
    "observation.intervention", "timestamp", "frame_index", "episode_index",
    "index", "task_index"]);
  assert.equal(delta.leftPositionExactRows, 192_541);
  assert.equal(delta.rightPositionExactRows, 192_541);
  assert.equal(delta.leftGripperExactRows, 192_541);
  assert.equal(delta.rightGripperExactRows, 192_541);
  assert.equal(delta.paddingExactRows, 192_541);
  assert.equal(delta.quaternionAbsoluteTolerance, 3e-7);
  assert.equal(delta.quaternionResults.left.rowsWithin3e7AbsoluteTolerance,
    192_541);
  assert.equal(delta.quaternionResults.right.rowsWithin3e7AbsoluteTolerance,
    192_541);
  assert.ok(delta.quaternionResults.left.maxAbsoluteError < 3e-7);
  assert.ok(delta.quaternionResults.right.maxAbsoluteError < 3e-7);
  assert.equal(delta.missingEpisodeRows, 4_547);
  assert.deepEqual(delta.missingEpisodes.map((row) => [row.episodeIndex, row.rows]),
    [[203, 1_005], [204, 913], [205, 775], [206, 950], [207, 904]]);
  assert.equal(delta.publisherReasonForMissingEpisodes, null);
  assert.deepEqual(delta.episodeMetadataOnlyDifferingFields, {
    "stats/action/max": 203, "stats/action/mean": 203,
    "stats/action/min": 203, "stats/action/q01": 203,
    "stats/action/q10": 203, "stats/action/q50": 203,
    "stats/action/q90": 203, "stats/action/q99": 203,
    "stats/action/std": 203,
  });
});

test("publisher intervention and success remain labels, not authority or outcomes", () => {
  assert.equal(report.intervention.interventionRepositoryPositiveRows, 389_629);
  assert.equal(report.intervention.noInterventionRepositoryZeroRows, 197_088);
  assert.equal(report.intervention.positiveSegments, 411);
  assert.equal(report.intervention.zeroSegments, 208);
  assert.equal(report.intervention.withinEpisodeTransitions, 0);
  assert.equal(report.intervention.boundaryTransitions, 0);
  assert.equal(report.intervention.publisherFieldEstablishesHumanAuthorizedIntervention,
    false);
  assert.equal(report.intervention.humanAuthorizedInterventionRows, 0);
  assert.equal(report.outcome.publisherEpisodeSidecarSuccessTrueOccurrences, 619);
  assert.equal(report.outcome.byteLinkedEpisodeKeysWithPublisherSuccessTrue, 208);
  assert.deepEqual(report.outcome.directDataSuccessFailureOutcomeFields, []);
  assert.equal(report.outcome.publisherSuccessIsIndependentOutcome, false);
  assert.equal(report.outcome.independentlyVerifiedOutcomeRows, 0);
  assert.equal(report.outcome.independentEffectRows, 0);
  assert.equal(report.outcome.completeCollectionAttemptCensusRows, 0);
  assert.equal(report.recovery.interventionFieldPromotedToRecovery, false);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
  assert.equal(report.execution.publisherRobotType, "offline_robot");
  assert.equal(report.execution.independentlyVerifiedPhysicalExecutionRows, 0);
  assert.equal(report.linkedFamily.byteLinkageEstablishesUnderlyingExecutionUniqueness,
    false);
});

test("video inventory, privacy, rights, and use boundaries remain typed and closed", () => {
  assert.equal(report.videoInventory.physicalObjects, 129);
  assert.equal(report.videoInventory.physicalBytes, 25_490_473_329);
  assert.equal(report.videoInventory.pathProfiles, 43);
  assert.equal(report.videoInventory.identicalPathProfilesAcrossThreeRepositories,
    40);
  assert.equal(report.videoInventory.differingPathProfilesAcrossThreeRepositories,
    3);
  assert.equal(report.videoInventory.uniquePayloadClaims, 46);
  assert.equal(report.videoInventory.uniquePayloadClaimBytes, 8_815_458_004);
  assert.deepEqual(report.videoInventory.payloadOccurrenceCounts,
    { 1: 3, 2: 3, 3: 40 });
  assert.equal(report.videoInventory.rawVideoObjectsAcquired, 0);
  assert.equal(report.videoInventory.rawVideoBytesAcquired, 0);
  assert.equal(report.videoInventory.selectedNoVideoBytesAddedToVideoInventoryBytes,
    false);
  assert.equal(report.videoInventory.combinedModalityByteTotalDefined, false);
  assert.equal(report.privacy.noPiiOrSensitiveDataGuaranteed, false);
  assert.equal(report.privacy.taskPayloadProjectedIntoReport, false);
  assert.deepEqual(report.rights.datasetCardLicenseClaims,
    { intervention: null, intervention_delta: null, no_intervention: null });
  assert.equal(report.rights.fixedTreeReadmeFiles, 0);
  assert.equal(report.rights.fixedTreeLicenseFiles, 0);
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
  const manifest = JSON.parse(readFileSync(path.join(artifact,
    "source/source-manifest.json"), "utf8"));
  assert.equal(manifest.sourceObjects.length, 30);
  assert.equal(manifest.videoInventory.physicalEntries.length, 129);
  assert.equal(manifest.videoInventory.pathProfiles.length, 43);
  assert.equal(manifest.videoInventory.payloadProfiles.length, 46);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyHandoverLinkedArtifactDirectory(artifact, {
    pythonExecutable: "/opt/anaconda3/bin/python",
  });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:24b5771e0fb8ad10d23f9de2509713d211bb88e74224463bfb42cd769408877d");
  assert.equal(checked.receipt.receiptHash,
    "sha256:165836c2db50618879683b9fd691c1a93a929ec2af6a384bdd737f303876e0af");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-handover-linked-intervention-lineage.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
