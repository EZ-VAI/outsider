import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  ORCHARD_DATASET_ID,
  ORCHARD_REVISION,
  ORCHARD_SWE_SHARD14_DISPOSITION,
  ORCHARD_SWE_SHARD14_SCOPE,
  verifyOrchardSweShard14ArtifactDirectory,
} from "../src/outsider-orchard-swe-shard14.js";

const artifact = path.resolve(
  "artifacts/outsider-orchard-swe-shard14-20260829-v1");
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

test("one exact bounded physical shard is preserved without population claims", () => {
  assert.equal(report.disposition, ORCHARD_SWE_SHARD14_DISPOSITION);
  assert.equal(report.scope.kind, ORCHARD_SWE_SHARD14_SCOPE);
  assert.equal(report.scope.datasetId, ORCHARD_DATASET_ID);
  assert.equal(report.scope.revision, ORCHARD_REVISION);
  assert.equal(report.scope.physicalShardPath,
    "swe/train/data-00014-of-00019.parquet");
  assert.equal(report.scope.physicalShardBytes, 283_683_745);
  assert.equal(report.scope.physicalShardSha256,
    "sha256:0d5dac902a57530a9de2dbb7a4b3a8161cf7b53f65ad017c7c7e0fe2997d1aad");
  assert.equal(report.scope.completePhysicalShardAcquired, true);
  assert.equal(report.scope.randomRowSamplingApplied, false);
  assert.equal(report.scope.fullRebenchUnresolvedPopulationClaimed, false);
  assert.equal(report.scope.fullOrchardSwePopulationClaimed, false);
  assert.equal(report.source.fixedRevisionTreeEntries, 28);
  assert.equal(report.source.fixedRevisionFiles, 24);
  assert.equal(report.source.fixedRevisionDirectories, 4);
  assert.equal(report.source.physicalParquetFilesUnder300DecimalMB, 1);
  assert.equal(report.source.recordAndTreeStateStable, true);
  assert.deepEqual(
    readFileSync(path.join(artifact, "source/metadata/dataset-record-before.json")),
    readFileSync(path.join(artifact, "source/metadata/dataset-record-after.json")));
  assert.deepEqual(
    readFileSync(path.join(artifact, "source/metadata/full-tree-before.json")),
    readFileSync(path.join(artifact, "source/metadata/full-tree-after.json")));
});

test("all Parquet rows, messages, and tool calls replay as inert data", () => {
  assert.equal(report.replay.parquetRows, 5_641);
  assert.equal(report.replay.parquetRowGroups, 3);
  assert.deepEqual(report.replay.rowGroupRows, [1_936, 1_936, 1_769]);
  assert.deepEqual(report.replay.parquetRootColumns,
    ["tools", "messages", "metadata"]);
  assert.equal(report.replay.messageRows, 231_802);
  assert.deepEqual(report.replay.messageRoleRows, {
    assistant: 110_256, system: 5_641, tool: 110_256, user: 5_649,
  });
  assert.equal(report.replay.messageContentUtf8Bytes, 233_593_176);
  assert.equal(report.replay.toolCallRows, 110_256);
  assert.deepEqual(report.replay.toolCallFunctionRows, { bash: 110_256 });
  assert.equal(report.replay.toolArgumentJsonDocumentsParsed, 110_256);
  assert.equal(report.replay.toolArgumentUtf8Bytes, 34_955_034);
  assert.equal(report.replay.toolResponseRows, 110_256);
  assert.equal(report.replay.duplicateToolCallIdsWithinTrajectory, 0);
  assert.equal(report.replay.unmatchedToolCallOrResponseIds, 0);
  assert.equal(report.replay.downloadedCommandsCodeTestsOrToolArgumentsExecuted,
    false);
  assert.equal(report.replay.rawContentProjected, false);
});

test("source-native unresolved group and failure morphology remain publisher labels", () => {
  assert.deepEqual(report.replay.sourceValues, { "rebench-M2.5": 5_641 });
  assert.deepEqual(report.replay.modelValues, { "MiniMax-M2.5": 5_641 });
  assert.deepEqual(report.replay.verifyStatusValues, { unresolved: 5_641 });
  assert.equal(report.replay.uniqueInstanceIds, 1_687);
  assert.equal(report.replay.uniqueRepositories, 614);
  assert.deepEqual(report.replay.rowsPerInstance,
    { 1: 336, 2: 226, 3: 228, 4: 316, 5: 581 });
  assert.equal(report.replay.sampleIndexUniqueWithinInstance, true);
  assert.equal(report.replay.repositoryConsistentWithinInstance, true);
  assert.equal(report.failureMorphology.failToPassPassedRows, 1_319);
  assert.equal(report.failureMorphology.failToPassPassedItems, 4_294);
  assert.equal(report.failureMorphology.failToPassFailedRows, 5_318);
  assert.equal(report.failureMorphology.failToPassFailedItems, 18_271);
  assert.equal(report.failureMorphology.passToPassFailedRows, 1_083);
  assert.equal(report.failureMorphology.passToPassFailedItems, 33_153);
  assert.equal(report.failureMorphology.rowsQualifyingResolvedFromPublishedFailureLists,
    0);
  assert.equal(report.outcome.publisherVerifyStatusUnresolvedRows, 5_641);
  assert.equal(report.outcome.outcomeProducerIndependentFromExecutionHarness,
    false);
  assert.equal(report.outcome.independentlyVerifiedOutcomeRows, 0);
});

test("separate rollouts and partial test progress are not promoted to recovery", () => {
  assert.equal(report.recovery.repeatedInstanceSampleIndicesAreSeparateRolloutsNotRecoveryLinks,
    true);
  assert.equal(report.recovery.partialFailToPassSuccessPromotedToRecovery, false);
  assert.equal(report.recovery.publisherNativeRecoveryLabelRows, 0);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
  assert.equal(report.recovery.longitudinalRecoveryRows, 0);
  assert.equal(report.outcome.completePhysicalShardOutcomeCensusRows, 5_641);
  assert.equal(report.outcome.completePopulationAttemptCensusRows, 0);
  assert.equal(report.execution.physicalWorldExecutionRows, 0);
  assert.equal(report.execution.robotExecutionRows, 0);
});

test("privacy, upstream rights, and downstream authority fail closed", () => {
  assert.equal(report.privacy.publisherAnonymizedTrajectoryTextClaim, true);
  assert.equal(report.privacy.anonymizationCertified, false);
  assert.equal(report.privacy.noPiiOrSecretGuaranteed, false);
  assert.equal(report.privacy.selectedEmailPatternCandidates, 3_674);
  assert.equal(report.privacy.selectedAwsAccessKeyPatternCandidates, 6);
  assert.equal(report.privacy.selectedPrivateKeyHeaderPatternCandidates, 5);
  assert.equal(report.privacy.privacyPatternScanIsNotAnonymityProof, true);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.rights.datasetLicenseClaim, "MIT");
  assert.equal(report.rights.uniqueUpstreamRepositoriesInShard, 614);
  assert.equal(report.rights.upstreamRepositoryLicensesIndividuallyAdjudicated, 0);
  assert.equal(report.rights.redistributionAuthorizedByThisArtifact, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.boundary.productionTrainingRows, 0);
  assert.equal(report.boundary.networkAdmissionRows, 0);
  assert.equal(report.boundary.authorityRows, 0);
  assert.equal(report.boundary.ceuRows, 0);
  assert.equal(report.boundary.autonomousActionAuthorized, false);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyOrchardSweShard14ArtifactDirectory(artifact,
    { pythonExecutable: "/opt/anaconda3/bin/python" });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:729a93f10bdae7b83c6dca0df7fa59ad14d9b509a8f0deaa015fa5041b279a4d");
  assert.equal(checked.receipt.receiptHash,
    "sha256:4b4e5c6f0dfce1bee605185dc8469a8bf932124a7576a44b6ea2bcf9d02f7157");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-orchard-swe-shard14.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
