import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  STATE_BENCH_COMMIT,
  STATE_BENCH_REPOSITORY,
  STATE_BENCH_TRAINING_DISPOSITION,
  STATE_BENCH_TREE,
  verifyStateBenchTrainingArtifactDirectory,
} from "../src/outsider-state-bench-training-trajectories.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-state-bench-training-trajectories-20260829-v1",
);

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

test("the complete fixed STATE-Bench commit and 300 training trajectories replay", () => {
  const checked = verifyStateBenchTrainingArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;

  assert.equal(report.disposition, STATE_BENCH_TRAINING_DISPOSITION);
  assert.equal(report.source.repository, STATE_BENCH_REPOSITORY);
  assert.equal(report.source.commit, STATE_BENCH_COMMIT);
  assert.equal(report.source.tree, STATE_BENCH_TREE);
  assert.equal(report.source.commitSignatureVerifiedByGitHub, true);
  assert.equal(report.source.completeFixedCommitGitTreeReplayed, true);
  assert.equal(report.source.fixedCommitArchiveBytes, 1_251_382);
  assert.equal(report.source.fixedCommitArchiveSha256,
    "sha256:746646f24ab0ebd713ae28f0e96c1cc81cdbe9598171a2f7ed37953ce7a0b96a");

  assert.equal(report.replay.archiveMembers, 1_356);
  assert.equal(report.replay.gitTreeEntries, 1_355);
  assert.equal(report.replay.gitBlobFiles, 1_318);
  assert.equal(report.replay.gitDirectories, 37);
  assert.equal(report.replay.gitBlobBytes, 10_099_841);
  assert.equal(report.replay.allArchiveBlobsMatchPinnedGitOids, true);
  assert.equal(report.replay.trainingTrajectoryFiles, 300);
  assert.equal(report.replay.trainingTrajectoryBytes, 3_630_476);
  assert.deepEqual(report.replay.domainRows,
    { customer_support: 100, shopping_assistant: 100, travel: 100 });
  assert.equal(report.replay.messages, 2_319);
  assert.deepEqual(report.replay.messageRoles,
    { assistant: 860, system: 300, user: 1_159 });
  assert.equal(report.replay.minimumMessagesPerTrajectory, 4);
  assert.equal(report.replay.maximumMessagesPerTrajectory, 31);
  assert.equal(report.replay.embeddedToolCallsAndResults, 2_842);
  assert.equal(report.replay.toolNameVariants, 42);
  assert.equal(report.replay.resultStatusRows, 1_185);
  assert.equal(report.replay.resultStatusVariants, 25);
  assert.equal(report.replay.confirmTrueToolCalls, 324);
  assert.equal(report.replay.confirmFalseToolCalls, 364);
  assert.equal(report.replay.finalTaskDoneMarkerRows, 157);
  assert.equal(report.replay.rowsWithoutFinalTaskDoneMarker, 143);
  assert.equal(report.replay.perTrajectoryJudgeOutcomeRows, 0);
  assert.equal(report.replay.rewardRows, 0);
  assert.equal(report.replay.rawConversationToolArgumentsAndResultsProjected, false);

  assert.equal(report.completeness.completePublishedTrainingTrajectorySet, true);
  assert.equal(report.completeness.completeThreeDomainByOneHundredMatrix, true);
  assert.equal(report.completeness.completeFixedCommitRepository, true);
  assert.equal(report.completeness.completeBenchmarkEvaluationRuns, false);
  assert.equal(report.completeness.completeOpportunityOrAttemptCensus, false);
  assert.equal(report.completeness.sourceUniverseExhausted, false);
  assert.equal(report.denominators.SYNTHETIC_TRAINING_TRAJECTORY, 300);
  assert.equal(report.denominators.MESSAGE_RECORD_WITHIN_TRAJECTORY, 2_319);
  assert.equal(report.denominators.EMBEDDED_TOOL_CALL_RESULT_RECORD, 2_842);
  assert.equal(report.denominators.crossPopulationTotal, null);
  assert.equal(report.denominators.additionProhibited, true);

  assert.equal(report.outcome.taskDoneMarkerIsNotJudgeOutcome, true);
  assert.equal(report.outcome.independentOutcomeRows, 0);
  assert.equal(report.outcome.recoveryEpisodeRows, 0);
  assert.equal(report.rights.repositoryLicenseSpdx, "MIT");
  assert.equal(report.rights.licenseFileGitBlobReplayed, true);
  assert.equal(report.rights.agentLearningTrackUseOfTrainingTrajectoriesDocumented,
    true);
  assert.equal(report.rights.generalFoundationModelTrainingAuthorizationEstablished,
    false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.privacy.publisherDescribesDatasetAsSyntheticallyGenerated,
    true);
  assert.equal(report.privacy.systemDateRedactionMarkerRows, 300);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.privacy.rawProjectionRows, 0);
  for (const field of ["publisherEvaluatedOutcomeRows", "independentOutcomeRows",
    "realWorldOutcomeRows", "longitudinalOutcomeRows", "recoveryEpisodeRows",
    "preActionDelegationRows", "physicalEffectRows", "offlineTrainingRows",
    "productionTrainingRows", "networkAdmissionRows", "actorCreditRows",
    "ceuRows", "pricingRows", "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.boundary.autonomousActionAuthorized, false);
  assert.equal(report.artifactHash,
    "sha256:5ce2e8c73314585bdc692244c970554a56a427a4763670d0fdbc5bd56989163b");
  assert.equal(receipt.receiptHash,
    "sha256:edba3e0ad64411b5eb2dae7f2f74ffcb94c8cdb28e0289c09a2833da47d4962c");
});

test("raw trajectories stay private and the artifact is no-clobber", () => {
  const report = path.join(ARTIFACT, "report.json");
  const receipt = path.join(ARTIFACT, "run-receipt.json");
  const archive = path.join(ARTIFACT, "source/files/state-bench-5644.tar.gz");
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "source")).mode & 0o777, 0o700);
  assert.equal(lstatSync(report).mode & 0o777, 0o600);
  assert.equal(lstatSync(receipt).mode & 0o777, 0o600);
  assert.equal(lstatSync(archive).mode & 0o777, 0o600);
  const before = [sha256(report), sha256(receipt), sha256(archive)];
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-state-bench-training-trajectories.mjs",
      "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  assert.deepEqual([sha256(report), sha256(receipt), sha256(archive)], before);
});
