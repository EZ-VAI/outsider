import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  AUTORESEARCH_DATASET_ID,
  AUTORESEARCH_MODEL,
  AUTORESEARCH_OPUS_DISPOSITION,
  AUTORESEARCH_REVISION,
  verifyAutoResearchOpusArtifactDirectory,
} from "../src/outsider-autoresearch-opus-optimization-group.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-autoresearch-opus-optimization-group-20260829-v1");

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

test("fixed AutoResearchEval Opus optimization group replays current bytes and README drift", () => {
  const checked = verifyAutoResearchOpusArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel, "FULL_SELECTED_SOURCE_REDERIVED");
  const { report, receipt } = checked;

  assert.equal(report.disposition, AUTORESEARCH_OPUS_DISPOSITION);
  assert.equal(report.source.datasetId, AUTORESEARCH_DATASET_ID);
  assert.equal(report.source.revision, AUTORESEARCH_REVISION);
  assert.equal(report.selection.model, AUTORESEARCH_MODEL);
  assert.equal(report.source.public, true);
  assert.equal(report.source.gated, false);
  assert.equal(report.source.exactRecordSiblingPaths, 809);
  assert.equal(report.source.fixedRevisionUsedStorageBytes, 197_733_921);
  assert.equal(report.source.exactRecordSiblingPathRoot,
    "sha256:7d21d70b0626a10169054d54a0597eb47bfdedd8743f71add2fdf912ad599832");
  assert.equal(report.source.fullTreeEntries, 829);
  assert.equal(report.source.fullTreeFiles, 809);
  assert.equal(report.source.fullTreeDirectories, 20);
  assert.equal(report.source.fullTreeDeclaredFileBytes, 721_929_474);
  assert.equal(report.source.fullTreeLfsFiles, 8);
  assert.equal(report.source.fullTreeXetFiles, 8);
  assert.equal(report.source.fullTreeRoot,
    "sha256:54492710ef829a3bf3483875d1b57b4ae6779cb14c38b816c3b54b11071a34f3");
  assert.equal(report.source.selectedTreeRoot,
    "sha256:082682da31fb5aabad1c8168dea8b2329e2c33a271dd03771328a03fa7640293");
  assert.equal(report.source.completeRecordAndFullTreeInventoried, true);
  assert.equal(report.source.fullRepositoryPayloadAcquired, false);
  assert.equal(report.source.materialRecordAndTreeStateStable, true);

  assert.equal(report.selection.completeOptimizationRolloutsAcquired, true);
  assert.equal(report.selection.completeOptimizationTasksAcquired, true);
  assert.equal(report.selection.completeOptimizationTaskListAcquired, true);
  assert.equal(report.selection.completeSelectedModelDirectoryAcquired, true);
  assert.equal(report.selection.currentOptimizationTaskRows, 30);
  assert.equal(report.selection.currentOptimizationModelRows, 8);
  assert.equal(report.selection.currentOptimizationRolloutRows, 240);
  assert.equal(report.selection.selectedSourceNativeAttemptRows, 30);
  assert.equal(report.selection.selectedTrajectoryFiles, 30);
  assert.equal(report.selection.selectedTrajectoryBytes, 13_656_864);
  assert.equal(report.selection.selectedSourcePayloadBytes, 13_909_158);
  assert.equal(report.selection.completeCurrentModelTaskCrossProduct, true);
  assert.equal(report.selection.representativenessEstablished, false);
  assert.equal(report.selection.fullDatasetPayloadExhausted, false);

  assert.deepEqual(report.replay.currentOptimizationModels, {
    "codex-gpt5mini": 30, "deepseek-v4-pro": 30,
    "gemini-3.5-flash": 30, "glm-5.2": 30, "minimax-m3": 30,
    "opus-4.8": 30, "qwen3.7-max": 30, "sonnet-5": 30,
  });
  assert.deepEqual(report.replay.currentOptimizationStatuses,
    { agent_error: 23, killed: 12, success: 188, timeout: 17 });
  assert.deepEqual(report.replay.selectedStatuses,
    { agent_error: 7, killed: 2, success: 17, timeout: 4 });
  assert.deepEqual(report.replay.selectedReturnCodes,
    { "-1": 4, "0": 17, "1": 7, "137": 2 });
  assert.equal(report.replay.cleanManifestRows, 800);
  assert.equal(report.replay.optimizationCleanManifestRows, 240);
  assert.equal(report.replay.selectedCleanManifestRows, 30);
  assert.equal(report.replay.selectedPreCleanRawLinesClaim, 17_507);
  assert.equal(report.replay.selectedCurrentTrajectoryJsonRows, 15_148);
  assert.deepEqual(report.replay.selectedTrajectoryTypeCounts,
    { assistant: 6_997, result: 36, tool_progress: 4_077, user: 4_038 });
  assert.equal(report.replay.rolloutsTasksManifestTrajectoryClosureVerified, true);
  assert.equal(report.replay.trajectoryPayloadsExecutedDuringReplay, false);
  assert.equal(report.replay.rawTrajectoryContentProjected, false);

  assert.deepEqual(report.documentationDrift, {
    currentBytesOptimizationNonSuccess: 52,
    currentBytesOptimizationRollouts: 240,
    currentBytesOptimizationSuccess: 188,
    currentBytesOptimizationTasks: 30,
    currentBytesSupersedeNarrativeCountsForThisArtifact: true,
    readmeClaimsOptimizationNonSuccess: 52,
    readmeClaimsOptimizationRollouts: 247,
    readmeClaimsOptimizationSuccess: 195,
    readmeClaimsOptimizationTasks: 31,
    readmeTaskAndRolloutDenominatorsMatchCurrentBytes: false,
  });
  assert.equal(report.semantics.statusMeaning,
    "PUBLISHER_SANDBOX_HARNESS_STATUS");
  assert.equal(report.semantics.successIsIndependentOutcome, false);
  assert.equal(report.semantics.nonSuccessIsObservedRealWorldFailure, false);
  assert.equal(report.semantics.rowsAreRetriesOfOneTaskExecution, false);
  assert.equal(report.semantics.chronologicalRecoverySequenceEstablished, false);
  assert.equal(report.semantics.preCleanRawLinesAreCurrentPhysicalJsonRows, false);
  assert.equal(report.semantics.cleanStepsMatchCurrentPhysicalJsonRows, true);

  assert.equal(report.outcome.publisherHarnessStatusRows, 30);
  assert.equal(report.outcome.publisherHarnessSuccessRows, 17);
  assert.equal(report.outcome.publisherHarnessNonSuccessRows, 13);
  assert.equal(report.outcome.publisherOutcomesIndependentlyRerun, false);
  assert.equal(report.rights.datasetCardLicenseClaim, "CC-BY-4.0");
  assert.equal(report.rights.datasetApiLicenseTagPresent, true);
  assert.equal(report.rights.datasetLicenseFilePresent, false);
  assert.equal(report.rights.upstreamTaskRightsEstablished, false);
  assert.equal(report.rights.cardClaimExtrapolatedToUpstreamTasks, false);
  assert.equal(report.rights.rightsDisposition, "FAIL_CLOSED");
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.privacy.rawMessagesCommandsCodeOutputsProjected, false);
  assert.equal(report.privacy.rawProjectionRows, 0);
  for (const field of ["independentOutcomeRows", "physicalEffectRows",
    "realWorldOutcomeRows", "longitudinalOutcomeRows", "recoveryEpisodeRows",
    "retrySequenceRows", "preActionDelegationRows", "offlineTrainingRows",
    "productionTrainingRows", "networkAdmissionRows", "actorCreditRows",
    "ceuRows", "pricingRows", "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.boundary.autonomousActionAuthorized, false);

  assert.equal(report.source.sourceManifestHash,
    "sha256:080cd999c974c8d6dc199aa7618087f4030733d54fd36d97644e3826382dbf0e");
  assert.equal(report.source.sourceRoot,
    "sha256:4b34850f3724e1cde6b3d3ad48ec0d005827eac270e189e1ae4929d3501bb4c1");
  assert.equal(report.artifactHash,
    "sha256:49132278ad10b9833792348fb8721420bc84df8e4ddbfc3f7636e0a14c58ae4e");
  assert.equal(receipt.receiptHash,
    "sha256:e460abcdc933bd0948b8518d2ca874a09f54d65ef9d872d313bfa7a705c82f98");
});

test("raw trajectories stay private and publication is no-clobber", () => {
  assertPrivateTree(ARTIFACT);
  const report = path.join(ARTIFACT, "report.json");
  const receipt = path.join(ARTIFACT, "run-receipt.json");
  const raw = path.join(ARTIFACT,
    "source/files/optimization/trajectories/opus-4.8/W2885828982.jsonl");
  const before = [sha256(report), sha256(receipt), sha256(raw)];
  const rawBefore = lstatSync(raw, { bigint: true });
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-autoresearch-opus-optimization-group.mjs",
      "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  const rawAfter = lstatSync(raw, { bigint: true });
  assert.deepEqual([sha256(report), sha256(receipt), sha256(raw)], before);
  assert.equal(rawAfter.size, rawBefore.size);
  assert.equal(rawAfter.mtimeNs, rawBefore.mtimeNs);
});

