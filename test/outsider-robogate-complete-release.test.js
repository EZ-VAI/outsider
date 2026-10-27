import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ROBOGATE_DATASET_ID,
  ROBOGATE_DISPOSITION,
  ROBOGATE_GITHUB_COMMIT,
  ROBOGATE_REVISION,
  ROBOGATE_SCOPE,
  verifyRoboGateArtifactDirectory,
} from "../src/outsider-robogate-complete-release.js";

const artifact = path.resolve(
  "artifacts/outsider-robogate-complete-release-20260829-v1");
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

test("fixed source mapping closes the complete pinned RoboGate release", () => {
  assert.equal(report.disposition, ROBOGATE_DISPOSITION);
  assert.equal(report.scope.kind, ROBOGATE_SCOPE);
  assert.equal(report.scope.datasetId, ROBOGATE_DATASET_ID);
  assert.equal(report.scope.revision, ROBOGATE_REVISION);
  assert.equal(report.scope.completeFixedTreeAcquired, true);
  assert.equal(report.scope.completePublisherReleasePayloadReplayed, true);
  assert.equal(report.scope.fixedTreeEntries, 33);
  assert.equal(report.scope.fixedTreeFiles, 28);
  assert.equal(report.scope.fixedTreeDirectories, 5);
  assert.equal(report.scope.fixedTreeFileBytes, 14_835_474);
  assert.equal(report.scope.globalRoboGateSourceUniverseExhausted, false);
  assert.equal(report.source.recordResponseBeforeAfterExact, true);
  assert.equal(report.source.treeBeforeAfterExact, true);
  assert.equal(report.source.githubCommit, ROBOGATE_GITHUB_COMMIT);
  assert.equal(report.source.githubCommitVerified, false);
  assert.equal(report.source.githubCommitVerificationReason, "unsigned");
  assert.equal(report.source.hfGithubSharedJsonGitBlobLineageExact, true);
  const manifest = JSON.parse(readFileSync(
    path.join(artifact, "source/source-manifest.json"), "utf8"));
  assert.equal(manifest.sourceObjects.length, 37);
  assert.equal(manifest.parquetFiles, 6);
  assert.equal(manifest.jsonFiles, 20);
  assert.deepEqual(readFileSync(path.join(artifact,
    "source/metadata/hf-record-before.json")), readFileSync(path.join(artifact,
    "source/metadata/hf-record-after.json")));
  assert.deepEqual(readFileSync(path.join(artifact,
    "source/metadata/hf-tree-before.json")), readFileSync(path.join(artifact,
    "source/metadata/hf-tree-after.json")));
});

test("all physical tables replay without double-counting duplicated train rows", () => {
  assert.equal(report.replay.parquet.files, 6);
  assert.equal(report.corpus.parquetPhysicalRows, 80_000);
  assert.equal(report.corpus.trainPhysicalRows, 30_000);
  assert.equal(report.corpus.trainRowsExactDuplicatesOfSourceGroups, 30_000);
  assert.deepEqual(report.corpus.trainSegmentOrder,
    ["franka", "franka_boundary", "ur5e"]);
  assert.equal(report.corpus.sourceNativeUniqueExperimentRows, 50_000);
  assert.equal(report.corpus.sourceGroupSignatureOverlapRows, 0);
  assert.equal(report.corpus.jsonExperimentRows, 10_000);
  assert.equal(report.corpus.jsonRowsExactProjectionOfFrankaParquet, true);
  assert.equal(report.publisherSimulationOutcomes.publisherNativeSuccessRows,
    24_270);
  assert.equal(report.publisherSimulationOutcomes.publisherNativeFailureRows,
    25_730);
  assert.equal(report.publisherSimulationOutcomes.successFailureTypeConsistencyRows,
    50_000);
  assert.equal(report.replay.parquet.nonfiniteNumericValues, 0);
  assert.equal(report.replay.parquet.nullValues, 0);
});

test("released evaluation and integrity documents replay as publisher evidence", () => {
  assert.equal(report.evaluations.publisherEvaluationRunFiles, 10);
  assert.equal(report.evaluations.publisherEvaluationEpisodeRows, 680);
  assert.equal(report.evaluations.mainRunFiles, 6);
  assert.equal(report.evaluations.mainFailedRows, 408);
  assert.equal(report.evaluations.mainPassedRows, 0);
  assert.equal(report.evaluations.controlRunFiles, 4);
  assert.equal(report.evaluations.controlPassedRows, 204);
  assert.equal(report.evaluations.controlFailedRows, 68);
  assert.equal(report.evaluations.resultHashesReproduced, 10);
  assert.equal(report.evaluations.episodeHashesReproduced, 10);
  assert.equal(report.evaluations.qualificationDocumentHashesReproduced, 2);
  assert.equal(report.evaluations.validationDocumentHashesReproduced, 6);
  assert.equal(report.evaluations.validationResultAndHarnessHashJoinsExact, 6);
  assert.equal(report.evaluations.identicalScenarioOrderAcrossRuns, true);
  assert.equal(report.evaluations.byteNativeHarnessSimulator, "NVIDIA Isaac Sim");
  assert.equal(report.evaluations.publisherModeString, "real");
  assert.equal(report.evaluations.publisherModeStringInterpretedAsRealRobot, false);
  assert.equal(report.evaluations.publisherHarnessValidationIsIndependentOutcomeWitness,
    false);
  assert.equal(report.evaluations.rawActionValuesPresent, false);
  assert.equal(report.evaluations.rawImageFramesPresent, false);
});

test("documentation drift remains explicit and pinned bytes take precedence", () => {
  assert.equal(report.documentationDrift.readmeUr10eSuccessRateClaim, 0);
  assert.equal(report.documentationDrift.pinnedByteUr10eSuccessRate, 0.616);
  assert.equal(report.documentationDrift.pinnedByteUr10eSuccessRows, 6_160);
  assert.equal(report.documentationDrift.readmeUr10eClaimMatchesPinnedBytes, false);
  assert.equal(report.documentationDrift.readmeUr3eSuccessRateClaim, 0.1);
  assert.equal(report.documentationDrift.pinnedByteUr3eSuccessRate, 0.0961);
  assert.equal(report.documentationDrift.pinnedBytesTakePrecedence, true);
  assert.equal(report.documentationDrift.silentNormalizationApplied, false);
  assert.equal(report.documentationDrift.dictionaryMetadataShaClaimSemanticTargetSpecified,
    false);
});

test("simulation, outcome, recovery, privacy, rights, and authority stay layered", () => {
  assert.equal(report.execution.simulatedExperimentRows, 50_000);
  assert.equal(report.execution.realRobotExecutionRows, 0);
  assert.equal(report.execution.independentlyVerifiedPhysicalExecutionRows, 0);
  assert.equal(report.outcome.publisherNativeSimulationOutcomeRows, 50_000);
  assert.equal(report.outcome.publisherHarnessScoredEvaluationOutcomeRows, 680);
  assert.equal(report.outcome.independentlyVerifiedOutcomeRows, 0);
  assert.equal(report.outcome.independentEffectRows, 0);
  assert.equal(report.outcome.completeCollectionAttemptCensusRows, 0);
  assert.equal(report.recovery.sourceNativeFailureModeRows, 25_730);
  assert.equal(report.recovery.sourceNativeRecoveryExecutionRows, 0);
  assert.equal(report.recovery.pairedFailureToRecoveryRows, 0);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
  assert.equal(report.privacy.rawVisualBytes, 0);
  assert.equal(report.privacy.noPiiOrSensitiveDataGuaranteed, false);
  assert.equal(report.rights.datasetCardLicenseClaim, "MIT");
  assert.equal(report.rights.linkedGithubApiLicense, "MIT");
  assert.equal(report.rights.fixedHfTreeLicenseFilePresent, false);
  assert.equal(report.rights.datasetContentRightsIndependentlyAdjudicated, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.deepEqual(report.boundary, {
    authorityRows: 0, authorizedTrainingRows: 0,
    autonomousActionAuthorized: false, ceuRows: 0,
    completeAttemptCensusRows: 0, independentEffectRows: 0,
    independentlyVerifiedOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0, networkAdmissionRows: 0,
    offlineTrainingRows: 0, productionTrainingRows: 0,
  });
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyRoboGateArtifactDirectory(artifact,
    { pythonExecutable: "/opt/anaconda3/bin/python" });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:3d0f011f5049e5164a82f0847e800ea0717c0e5d5689e8f9f671e970e1210066");
  assert.equal(checked.receipt.receiptHash,
    "sha256:f9a56bf2fdb5c20a01014eed29248b017d1dec36853a5b3f7db350a214200cae");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-robogate-complete-release.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
