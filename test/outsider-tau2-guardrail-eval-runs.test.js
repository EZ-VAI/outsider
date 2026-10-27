import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  TAU2_GUARDRAIL_DATASET_ID,
  TAU2_GUARDRAIL_DISPOSITION,
  TAU2_GUARDRAIL_REVISION,
  verifyTau2GuardrailArtifactDirectory,
} from "../src/outsider-tau2-guardrail-eval-runs.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-tau2-guardrail-eval-runs-20260829-v1",
);

test("all published tau2 result runs and the main guardrail pair replay", () => {
  const checked = verifyTau2GuardrailArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;
  assert.equal(report.source.id, TAU2_GUARDRAIL_DATASET_ID);
  assert.equal(report.source.revision, TAU2_GUARDRAIL_REVISION);
  assert.equal(report.disposition, TAU2_GUARDRAIL_DISPOSITION);
  assert.equal(report.source.completePublishedResultFilesReplayed, true);
  assert.equal(report.source.omittedOnlyGitAttributes, true);
  assert.equal(report.replay.resultsFiles, 13);
  assert.equal(report.replay.simulations, 934);
  assert.equal(report.replay.messages, 29_836);
  assert.equal(report.replay.toolCalls, 8_311);
  assert.equal(report.replay.toolResults, 8_311);
  assert.equal(report.replay.allToolCallsAndResultsJoined, true);
  assert.equal(report.replay.publisherRewardOneRows, 286);
  assert.equal(report.replay.publisherRewardZeroRows, 647);
  assert.equal(report.replay.publisherRewardMissingRows, 1);
  assert.deepEqual(report.replay.terminationRows,
    { infrastructure_error: 1, max_steps: 14, too_many_errors: 23, user_stop: 896 });
  assert.equal(report.replay.zeroSimulationRunFiles, 3);
  assert.equal(report.comparison.taskDefinitionsExactMatch, true);
  assert.equal(report.comparison.configurationExceptPolicyExactMatch, true);
  assert.equal(report.comparison.baselinePolicyExactPrefixOfPatchedPolicy, true);
  assert.equal(report.comparison.appendedGuardrailBytes, 1_097);
  assert.equal(report.comparison.alignedTaskTrialPairs, 455);
  assert.equal(report.comparison.missingWithoutPatchPairs, 1);
  assert.deepEqual(report.comparison.baselineToPatchRewardTransitions,
    { "0->0": 269, "0->1": 43, "1->0": 49, "1->1": 94 });
  assert.equal(report.comparison.pairedNetRewardOneDifference, -6);
  assert.equal(report.comparison.causalEffectEstablished, false);
  assert.equal(report.comparison.guardrailImprovementClaimSupported, false);
  assert.equal(report.completeness.completeMainWithoutPatchRun, false);
  assert.equal(report.outcome.independentOutcomeRows, 0);
  assert.equal(report.outcome.recoveryEpisodeRows, 0);
  assert.equal(report.rights.trainingUseAuthorized, false);
  assert.equal(report.privacy.rawProjectionRows, 0);
  for (const field of ["independentOutcomeRows", "realWorldOutcomeRows",
    "longitudinalOutcomeRows", "recoveryEpisodeRows", "preActionDelegationRows",
    "physicalEffectRows", "offlineTrainingRows", "productionTrainingRows",
    "networkAdmissionRows", "actorCreditRows", "ceuRows", "pricingRows",
    "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.boundary.autonomousActionAuthorized, false);
  assert.equal(report.artifactHash,
    "sha256:0829da5b22f133010a5d9ddc3fa90d91c15e7636d64a2e3d3ebe3ca450d256df");
  assert.equal(receipt.receiptHash,
    "sha256:cc85082aa4d2155b83d8722b64af6ef6ac20e9b3021f5351ea7838db61f425c8");
});

test("the tau2 source stays private and acquisition is no-clobber", () => {
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "source")).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "report.json")).mode & 0o777, 0o600);
  assert.equal(lstatSync(path.join(ARTIFACT,
    "source/files/tau2-bench/gpt-4o-mini/with-patch/agent-lens-retail-policy/results.json"))
    .mode & 0o777, 0o600);
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-tau2-guardrail-eval-runs.mjs", "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  assert.equal(verifyTau2GuardrailArtifactDirectory(ARTIFACT).ok, true);
});

