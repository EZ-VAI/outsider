import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "../src/canonical.js";
import { ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH }
  from "../src/outsider-actuarial-mechanism-shadow.js";
import {
  FACTOR_PREDICTIVE_SHADOW_SCHEMA,
  FACTOR_PREDICTIVE_IMPLEMENTATION_HASH,
  FACTOR_PREDICTIVE_NUMERIC_RUNTIME,
  FACTOR_PREDICTIVE_POLICY_HASH,
  deriveOutcomeBlindPredictiveGroups,
  evaluateProxyFactorCohort,
  verifyFactorPredictiveShadowReport,
} from "../src/outsider-factor-predictive-shadow.js";

function syntheticRows() {
  return Array.from({ length: 20 }, (_, group) => Array.from({ length: 5 }, (_, step) => ({
    groupId: `group-${group}`,
    event: step >= 3,
    values: { trajectory_step_count: step },
  }))).flat();
}

function seal(body) {
  return { ...body, reportHash: `sha256:${createHash("sha256")
    .update(`${FACTOR_PREDICTIVE_SHADOW_SCHEMA}\0${canonicalizeStrict(body)}`).digest("hex")}` };
}

test("group-held-out multivariable sensitivity is deterministic and improves on intercept only", () => {
  const first = evaluateProxyFactorCohort({ rows: syntheticRows() });
  const second = evaluateProxyFactorCohort({ rows: syntheticRows() });
  assert.deepEqual(first, second);
  assert.equal(first.status, "DESCRIPTIVE_INTERNAL_DISCLOSED_GROUP_HOLDOUT");
  assert.deepEqual(first.selectedFactorIds, ["trajectory_step_count"]);
  assert.equal(first.disclosedRootComponents, 20);
  assert.ok(first.outOfFold.auc > 0.99);
  assert.ok(first.outOfFold.sampleBrier
    < first.jeffreysSmoothedTrainingFoldPrevalenceOutOfFold.sampleBrier);
  assert.equal(first.outOfFold.calibrationClaimed, false);
  assert.equal(first.correlationRootCompletenessEstablished, false);
  assert.equal(first.sourceRowsIndependentClaimed, false);
  assert.equal(first.causalEffectClaimed, false);
  assert.equal(first.realWorldFrequencyEstimated, false);
  assert.equal(first.foldFeatureSelectionUsesTrainingRowsOnly, true);
  assert.equal(first.retrospectiveTrajectoryFeaturesOnly, true);
  assert.match(first.predictionSetHash, /^sha256:[a-f0-9]{64}$/);
  assert.ok(first.foldStandardizedCoefficients.every((fold) => fold.converged));
});

test("fold groups depend only on dataset-scoped disclosed roots, never target or factors", () => {
  const base = [
    { datasetId: "dataset", correlationRoots: ["root-a"], consequence: { event: false },
      factors: { trajectory_step_count: { value: 1 } }, observationHash: "old-a" },
    { datasetId: "dataset", correlationRoots: ["root-a", "root-b"],
      consequence: { event: true }, factors: { trajectory_step_count: { value: 2 } },
      observationHash: "old-b" },
    { datasetId: "dataset", correlationRoots: ["root-c"], consequence: { event: false },
      factors: { trajectory_step_count: { value: 3 } }, observationHash: "old-c" },
  ];
  const changed = structuredClone(base);
  changed[0].consequence.event = true;
  changed[0].factors.trajectory_step_count.value = 999;
  changed[0].observationHash = "changed-by-outcome";
  assert.deepEqual(deriveOutcomeBlindPredictiveGroups(base),
    deriveOutcomeBlindPredictiveGroups(changed));
  const groups = deriveOutcomeBlindPredictiveGroups(base);
  assert.equal(groups[0], groups[1]);
  assert.notEqual(groups[0], groups[2]);
});

test("direct outcome-derived recovery field is never eligible as a predictor", () => {
  const rows = Array.from({ length: 50 }, (_, index) => ({
    groupId: `group-${index}`,
    event: index % 2 === 0,
    values: {
      trajectory_step_count: 1,
      post_error_recovery_observed: index % 2 === 0 ? 1 : 0,
    },
  }));
  const result = evaluateProxyFactorCohort({ rows });
  assert.equal(result.status, "ABSTAIN");
  assert.ok(result.blockers.includes("NO_TRAINING_FOLD_COMPLETE_NONCONSTANT_ELIGIBLE_FACTOR"));
  assert.ok(!result.featureCoverage.some((item) =>
    item.factorId === "post_error_recovery_observed"));
});

test("insufficient disclosed components or one-class truth abstains", () => {
  const oneGroup = syntheticRows().map((row) => ({ ...row, groupId: "shared" }));
  const result = evaluateProxyFactorCohort({ rows: oneGroup });
  assert.equal(result.status, "ABSTAIN");
  assert.ok(result.blockers.includes("FEWER_DISCLOSED_COMPONENTS_THAN_FOLDS"));

  const oneClass = syntheticRows().map((row) => ({ ...row, event: true }));
  const oneClassResult = evaluateProxyFactorCohort({ rows: oneClass });
  assert.equal(oneClassResult.status, "ABSTAIN");
  assert.ok(oneClassResult.blockers.includes("OUTCOME_HAS_ONE_CLASS"));
});

test("sealed report verification never upgrades proxy metrics into loss or authority", () => {
  const cohort = evaluateProxyFactorCohort({ rows: syntheticRows() });
  const body = {
    schema: FACTOR_PREDICTIVE_SHADOW_SCHEMA,
    schemaVersion: "1.0.0",
    mode: "SOURCE_SPECIFIC_PROXY_FACTOR_SENSITIVITY_ONLY",
    sourceBinding: {
      actuarialReportHash: `sha256:${"a".repeat(64)}`,
      factorSchemaHash: ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH,
      predictorPolicyHash: FACTOR_PREDICTIVE_POLICY_HASH,
      evaluatorImplementationHash: FACTOR_PREDICTIVE_IMPLEMENTATION_HASH,
      numericRuntime: FACTOR_PREDICTIVE_NUMERIC_RUNTIME,
      knownSourceReplayCompletedInBuildProcess: true,
      sourceArtifactsReverifiedByPersistedReportVerifier: false,
      replayReceiptHashes: ["c", "d", "e", "f", "0"]
        .map((character) => `sha256:${character.repeat(64)}`),
    },
    rowsObserved: 100,
    nativeProxyRows: 100,
    cohorts: [{ datasetId: "fixture", target: "TASK_FAILURE_PROXY",
      samplingBoundary: { design: "PUBLIC_CONVENIENCE_OR_BENCHMARK_SAMPLE",
        populationPrevalenceEligible: false, calibrationEligible: false },
      evidenceBoundary: { syntheticOrSimulatedRows: 0, independentlyAdjudicatedRows: 0,
        nativeLabelClasses: ["fixture"], economicLossRows: 0, monetarySeverityRows: 0,
        foldAssignmentUsesOnlyDatasetScopedDisclosedRoots: true,
        foldAssignmentUsesOutcomeOrFactorValues: false,
        disclosedRootOutcomeIndependenceExternallyVerified: false },
      ...cohort }],
    evaluatedCohorts: 1,
    abstainedCohorts: 0,
    interpretation: {
      factorsUsedAsCausalVariables: false,
      crossDatasetModelFit: false,
      modelSelectionExternallyPreRegistered: false,
      externalTemporalValidation: false,
      prospectivePredictionClaimed: false,
      preExecutionFeatureAvailabilityEstablished: false,
      directOutcomeDerivedFactorsEligible: false,
      economicLossModeled: false,
      monetarySeverityModeled: false,
      realWorldFrequencyEstimated: false,
      insuranceRiskEstimated: false,
    },
    authority: { PRICE: false, coverage: false, GUARANTEE: false, SETTLE: false,
      automaticTraining: false, deployModel: false },
    readiness: { ready: false, blockers: [
      "NO_EXTERNAL_TEMPORAL_CUSTOMER_HOLDOUT",
      "DISCLOSED_CORRELATION_ROOTS_ARE_INCOMPLETE",
      "RETROSPECTIVE_END_OF_TRAJECTORY_FACTORS_NOT_PRE_ACTION_RISK_FEATURES",
      "PROXY_OUTCOMES_ARE_NOT_ECONOMIC_LOSS",
      "NO_PRODUCTION_EXPOSURE_DENOMINATOR_OR_SEVERITY",
    ] },
  };
  const report = seal(body);
  assert.equal(verifyFactorPredictiveShadowReport(report).ok, true);
  assert.equal(verifyFactorPredictiveShadowReport(report).sourceArtifactsReverified, false);
  assert.equal(verifyFactorPredictiveShadowReport(report).metricDerivationVerified, false);

  const forged = structuredClone(report);
  forged.authority.PRICE = true;
  const { reportHash: ignored, ...forgedBody } = forged;
  forged.reportHash = seal(forgedBody).reportHash;
  assert.equal(verifyFactorPredictiveShadowReport(forged).ok, false);

  const frequencyForgery = structuredClone(report);
  frequencyForgery.cohorts[0].realWorldFrequencyEstimated = true;
  const { reportHash: ignoredAgain, ...frequencyBody } = frequencyForgery;
  frequencyForgery.reportHash = seal(frequencyBody).reportHash;
  assert.equal(verifyFactorPredictiveShadowReport(frequencyForgery).ok, false);

  const privilegeForgery = structuredClone(report);
  privilegeForgery.mode = "PRODUCTION_CAUSAL_INSURANCE_MODEL";
  privilegeForgery.sourceBinding.actuarialReportHash = "garbage";
  privilegeForgery.sourceBinding.knownSourceReplayCompletedInBuildProcess = false;
  privilegeForgery.interpretation.factorsUsedAsCausalVariables = true;
  privilegeForgery.interpretation.insuranceRiskEstimated = true;
  privilegeForgery.authority.quote = 123;
  privilegeForgery.readiness.ready = true;
  privilegeForgery.cohorts[0].outOfFold.auc = 1;
  const { reportHash: ignoredPrivilege, ...privilegeBody } = privilegeForgery;
  privilegeForgery.reportHash = seal(privilegeBody).reportHash;
  const rejected = verifyFactorPredictiveShadowReport(privilegeForgery);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.metricDerivationVerified, false);

  const lossTargetForgery = structuredClone(report);
  lossTargetForgery.cohorts[0].target = "ECONOMIC_LOSS_USD";
  const { reportHash: ignoredLossTarget, ...lossTargetBody } = lossTargetForgery;
  lossTargetForgery.reportHash = seal(lossTargetBody).reportHash;
  assert.equal(verifyFactorPredictiveShadowReport(lossTargetForgery).ok, false);
});
