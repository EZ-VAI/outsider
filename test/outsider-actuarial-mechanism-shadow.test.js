import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import {
  ACTUARIAL_MECHANISM_FACTORS,
  ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH,
  betaBinomialPmf,
  betaQuantile,
  buildActuarialMechanismShadowReport,
  calculateDisclosedRootProxySensitivity,
  compactActuarialMechanismShadowReport,
  verifyActuarialMechanismShadowReport,
  verifyCompactActuarialMechanismShadowReport,
} from "../src/outsider-actuarial-mechanism-shadow.js";
import {
  CUAREWARDBENCH_WAVE3_PIN,
  PUBLIC_AGENT_WAVE3_CANONICAL_GENERATED_AT,
  verifyPublicAgentWave3Source,
} from "../src/outsider-public-agent-wave3.js";

const WAVE3_SOURCE = fileURLToPath(new URL(
  "../artifacts/public-agent-wave3-20260821/source/cuarewardbench/", import.meta.url,
));

const hash = (digit) => `sha256:${digit.repeat(64)}`;

function agentRecord({ id, root, outcome = true, kind = "benchmark-resolved",
  calls = 2, results = 2, errors = 0 } = {}) {
  return {
    recordHash: hash(id),
    dataset: { id: "fixture/agent", sourceClass: "benchmark-agent-rollout" },
    roots: { correlationRoots: [hash(root)] },
    episode: { stepCount: 8, toolCallCount: calls, toolResultCount: results,
      errorCount: errors, userTurnCount: 2, agentTurnCount: 4, durationMs: null },
    labels: { nativeOutcomeKind: kind, nativeOutcomeValue: outcome,
      provenance: "fixture-benchmark", independentAdjudication: false,
      economicLossObserved: false, lossMinorUnits: null, currency: null },
    detectorOutputs: {},
    useBoundary: { economicLossObserved: false, lossMinorUnits: null, currency: null,
      exposureDenominatorObserved: false,
      permits: { PRICE: false, GUARANTEE: false, SETTLE: false } },
  };
}

function reportFor(records) {
  return buildActuarialMechanismShadowReport({ corpora: [{
    corpusId: "fixture", kind: "PUBLIC_AGENT",
    sourceReplayClass: "FULL_SOURCE_REPRODUCED", records,
  }], horizon: 20, confidence: 0.95 });
}

test("factor dictionary is versioned and does not fill the historical 36-factor schema", () => {
  assert.equal(ACTUARIAL_MECHANISM_FACTORS.length, 10);
  assert.match(ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH, /^sha256:[a-f0-9]{64}$/);
  assert.ok(ACTUARIAL_MECHANISM_FACTORS.every((factor) =>
    factor.historical36Mapping === null
    && factor.missingPolicy === "EXPLICIT_NULL_WITH_REASON_NO_IMPUTATION"));
});

test("public agent projection separates mechanism, proxy consequence, and economic loss", () => {
  const report = reportFor([agentRecord({ id: "1", root: "a", outcome: false })]);
  const row = report.observations[0];
  assert.equal(row.factors.trajectory_step_count.value, 8);
  assert.equal(row.factors.tool_result_pairing_ratio.value, 1);
  assert.equal(row.factors.trajectory_duration_ms.status, "MISSING");
  assert.equal(row.factors.trajectory_duration_ms.value, null);
  assert.equal(row.consequence.target, "TASK_FAILURE_PROXY");
  assert.equal(row.consequence.event, true);
  assert.equal(row.consequence.economicLoss, false);
  assert.equal(row.economicLoss.observed, false);
  assert.equal(row.economicLoss.monetaryTVaR, null);
  assert.deepEqual(row.authority,
    { PRICE: false, coverage: false, GUARANTEE: false, SETTLE: false });
});

test("disclosed roots produce descriptive components without an effective-exposure bound", () => {
  const report = reportFor([
    agentRecord({ id: "1", root: "a", outcome: false }),
    agentRecord({ id: "2", root: "a", outcome: true }),
    agentRecord({ id: "3", root: "b", outcome: false }),
  ]);
  assert.equal(report.measurement.rows, 3);
  assert.equal(report.measurement.disclosedRootComponents, 2);
  assert.equal(report.measurement.correlationRootCompletenessEstablished, false);
  assert.equal(report.measurement.effectiveExposureBoundClaimed, false);
  assert.equal(report.measurement.sourceFactorCoverage[0].corpusId, "fixture");
  assert.equal(report.measurement.sourceFactorCoverage[0].rows, 3);
  assert.equal(report.observations[0].disclosedCorrelationComponentSize, 2);
  assert.equal(report.observations[0].correlationRootScope,
    "DATASET_LOCAL_BY_ADAPTER_CONSTRUCTION");
  assert.equal(report.observations[0].disclosedComponentEqualWeight, 0.5);
  assert.equal(report.consequenceModels.length, 0);
  const model = calculateDisclosedRootProxySensitivity({ observations: [
    { disclosedComponentId: "a", event: true },
    { disclosedComponentId: "a", event: false },
    { disclosedComponentId: "b", event: true },
  ], horizon: 20, confidence: 0.95 });
  assert.equal(model.nominalRows, 3);
  assert.equal(model.disclosedRootComponents, 2);
  assert.equal(model.componentWeightTotal, 2);
  assert.equal(model.correlationRootCompletenessEstablished, false);
  assert.equal(model.unobservedCrossComponentDependenceModeled, false);
  assert.equal(model.effectiveExposureBoundClaimed, false);
  assert.equal(model.realWorldFrequencyEstimated, false);
  assert.equal(model.fractionalWeightProxyEvents, 1.5);
  assert.equal(model.fractionalWeightQuasiPosterior.alpha, 2);
  assert.equal(model.fractionalWeightQuasiPosterior.beta, 1);
  assert.equal(model.fractionalWeightQuasiPosterior.probabilityPosteriorClaimed, false);
  assert.equal(model.quasiPredictiveTailSensitivity.measure,
    "NON_MONETARY_PROXY_EVENT_COUNT_SENSITIVITY");
  assert.equal(model.quasiPredictiveTailSensitivity.dollars, null);
  assert.equal(model.quasiPredictiveTailSensitivity.betaBinomialPredictiveClaimed, false);
  assert.equal(model.disclosedComponentHoldoutSensitivity.method,
    "LEAVE_ONE_DISCLOSED_ROOT_COMPONENT_OUT");
  assert.equal(model.buhlmannStraub.status, "ABSTAIN");
  assert.equal(model.buhlmannStraub.estimator, null);
  assert.equal("perfectDependenceExposureLowerBound" in model, false);
});

test("zero tool calls produce explicit missingness rather than a fabricated zero ratio", () => {
  const report = reportFor([agentRecord({ id: "1", root: "a", calls: 0, results: 0 })]);
  const row = report.observations[0];
  assert.equal(row.factors.tool_result_pairing_ratio.status, "MISSING");
  assert.equal(row.factors.tool_result_pairing_ratio.missingReason, "NO_TOOL_CALL_DENOMINATOR");
  assert.equal(row.factors.observed_error_event_rate.status, "MISSING");
  assert.equal(row.factors.observed_error_event_rate.missingReason, "NO_TOOL_RESULT_DENOMINATOR");
});

test("DROID reward stays non-causal and non-loss while action-observation coverage is measured", () => {
  const droid = {
    episodeHash: hash("d"),
    source: { datasetId: "r2d2_faceblur", datasetVersion: "1.0.0",
      datasetManifestHash: hash("a") },
    instrument: { extractorImplementationHash: hash("b") },
    steps: [
      { action: { kind: "robot-action" }, observation: { features: {} },
        outcome: { features: { reward: 1 } }, boundary: { isTerminal: false } },
      { action: { kind: "robot-action" }, observation: { features: {} },
        outcome: { features: { reward: 1 } }, boundary: { isTerminal: true } },
    ],
  };
  const report = buildActuarialMechanismShadowReport({ corpora: [{
    corpusId: "droid", kind: "DROID", sourceReplayClass: "FULL_SOURCE_REPRODUCED",
    records: [droid],
  }] });
  const row = report.observations[0];
  assert.equal(row.factors.action_observation_pairing_ratio.value, 1);
  assert.equal(row.factors.terminal_boundary_observed.value, true);
  assert.equal(row.consequence.status, "MISSING");
  assert.match(row.consequence.reason, /WITHOUT_ADJUDICATED_OUTCOME/);
  assert.equal(report.consequenceModels.length, 0);
});

test("robot directory membership is not promoted into a success outcome", () => {
  const robot = {
    recordHash: hash("9"), dataset: { id: "kantine/BotFails" },
    correlation: { datasetRoot: hash("a"), taskRoot: hash("b") },
    collection: { executionMode: "TELEOPERATION", fps: 30 },
    truth: { provenance: "DIRECTORY_SPLIT_MEMBERSHIP",
      value: "NOMINAL_TRAIN_DEMONSTRATION" },
    commitments: { declaredFrameCount: 300 },
    evidenceBoundary: { pricingEligible: false, establishesLossOrLiability: false },
  };
  const report = buildActuarialMechanismShadowReport({ corpora: [{
    corpusId: "robot", kind: "PUBLIC_ROBOTICS",
    sourceReplayClass: "FULL_SOURCE_REPRODUCED", records: [robot],
  }] });
  assert.equal(report.observations[0].consequence.status, "MISSING");
  assert.equal(report.observations[0].factors.trajectory_duration_ms.value, 10_000);
});

test("admissibility boundaries reject a corpus that claims price eligibility", () => {
  const record = agentRecord({ id: "1", root: "a" });
  record.useBoundary.permits.PRICE = true;
  assert.throws(() => reportFor([record]), /AGENT_LOSS_BOUNDARY_INVALID/);
});

test("admissibility boundaries reject a hidden monetary amount even when observed=false", () => {
  const record = agentRecord({ id: "1", root: "a" });
  record.labels.lossMinorUnits = 100;
  assert.throws(() => reportFor([record]), /AGENT_LOSS_BOUNDARY_INVALID/);
});

test("self-declared proxy rows remain measurements but cannot enter sensitivity models", () => {
  const record = agentRecord({ id: "1", root: "a", outcome: false });
  const report = buildActuarialMechanismShadowReport({ corpora: [{
    corpusId: "unverified", kind: "PUBLIC_AGENT",
    sourceReplayClass: "DECLARED_UNVERIFIED", records: [record],
  }] });
  assert.equal(report.observations.length, 1);
  assert.equal(report.consequenceModels.length, 0);
  assert.equal(report.consequenceModelAdmission.observedNativeProxyRows, 1);
  assert.equal(report.consequenceModelAdmission.admittedProxyRows, 0);
  assert.equal(report.consequenceModelAdmission.excludedProxyRows, 1);
  assert.deepEqual(report.consequenceModelAdmission.excludedBySourceReplayClass,
    { DECLARED_UNVERIFIED: 1 });
});

test("a caller cannot self-promote arbitrary records by claiming full-source replay", () => {
  const report = reportFor([agentRecord({ id: "1", root: "a", outcome: false })]);
  assert.equal(report.sourceAdmission.mode, "CALLER_ASSERTED_MEASUREMENT_ONLY");
  assert.equal(report.sourceAdmission.sourceArtifactsReplayedInBuildProcess, false);
  assert.equal(report.sourceAdmission.modelAdmissionAuthorizedByPrivateReplayPath, false);
  assert.equal(report.consequenceModelAdmission.admittedProxyRows, 0);
  assert.equal(report.consequenceModels.length, 0);
  const verification = verifyActuarialMechanismShadowReport(report);
  assert.equal(verification.ok, true);
  assert.equal(verification.sourceArtifactsReverified, false);
});

test("caller-asserted rows cannot create a model or correlation bridge", () => {
  const first = agentRecord({ id: "1", root: "a", outcome: false });
  const second = agentRecord({ id: "2", root: "b", outcome: true });
  const bridge = agentRecord({ id: "3", root: "c", outcome: false });
  bridge.roots.correlationRoots = [hash("a"), hash("b")];
  const report = buildActuarialMechanismShadowReport({ corpora: [
    { corpusId: "trusted", kind: "PUBLIC_AGENT",
      sourceReplayClass: "FULL_SOURCE_REPRODUCED", records: [first, second] },
    { corpusId: "unverified", kind: "PUBLIC_AGENT",
      sourceReplayClass: "DECLARED_UNVERIFIED", records: [bridge] },
  ] });
  assert.equal(report.consequenceModels.length, 0);
  assert.equal(report.consequenceModelAdmission.modelDisclosedRootComponents, 0);
  assert.equal(report.consequenceModelAdmission.excludedProxyRows, 3);
  assert.equal(report.consequenceModelAdmission.modelCorrelationGraphBuiltOnlyFromAdmittedRows,
    true);
});

test("duplicate source records are rejected before statistics", () => {
  const record = agentRecord({ id: "1", root: "a" });
  assert.throws(() => reportFor([record, structuredClone(record)]),
    /DUPLICATE_SOURCE_RECORD/);
});

test("missing correlation roots collapse to a conservative dataset fallback component", () => {
  const first = agentRecord({ id: "1", root: "a" });
  const second = agentRecord({ id: "2", root: "b" });
  first.roots.correlationRoots = [];
  second.roots.correlationRoots = [];
  const report = reportFor([first, second]);
  assert.equal(report.measurement.disclosedRootComponents, 1);
  assert.equal(report.measurement.largestDisclosedRootComponent, 2);
});

test("beta utilities produce normalized predictive mass and calibrated quantiles", () => {
  assert.ok(Math.abs(betaQuantile(0.025, 1, 1) - 0.025) < 1e-10);
  assert.ok(Math.abs(betaQuantile(0.975, 1, 1) - 0.975) < 1e-10);
  const pmf = betaBinomialPmf(100, 2.5, 4.5);
  assert.equal(pmf.length, 101);
  assert.ok(Math.abs(pmf.reduce((sum, value) => sum + value, 0) - 1) < 1e-12);
});

test("production PRICE and coverage remain false with explicit blockers", () => {
  const report = reportFor([agentRecord({ id: "1", root: "a" })]);
  assert.equal(report.authority.PRICE, false);
  assert.equal(report.authority.coverage, false);
  assert.equal(report.productionReadiness.ready, false);
  assert.ok(report.productionReadiness.blockers.includes(
    "NO_ADJUDICATED_ECONOMIC_LOSS_SEVERITY"));
  assert.equal(report.interpretation.benchmarkOutcomeUsedAsEconomicLoss, false);
  assert.equal(report.interpretation.buhlmannStraubEqualsFullBetaBinomialClaimed, false);
  assert.equal(report.measurement.crossDatasetIndependenceClaimed, false);
  assert.equal(report.interpretation.componentWeightedPosteriorIsTrueFrequencyEstimate, false);
  assert.equal(report.interpretation.disclosedRootComponentsAreEffectiveExposureLowerBound,
    false);
});

test("compact receipt binds the full report without repeating row payloads", () => {
  const report = reportFor([agentRecord({ id: "1", root: "a" })]);
  const compact = compactActuarialMechanismShadowReport(report);
  assert.equal(compact.fullReportHash, report.reportHash);
  assert.equal(compact.observationSet.rows, 1);
  assert.match(compact.observationSet.observationSetHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal("observations" in compact, false);
  assert.match(compact.compactReportHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(verifyCompactActuarialMechanismShadowReport(compact, { fullReport: report }).ok,
    true);
});

test("report and compact verifiers reject stale authority and readiness tampering", () => {
  const report = reportFor([agentRecord({ id: "1", root: "a" })]);
  const forged = structuredClone(report);
  forged.authority.PRICE = true;
  forged.productionReadiness.ready = true;
  assert.equal(verifyActuarialMechanismShadowReport(forged).ok, false);
  assert.throws(() => compactActuarialMechanismShadowReport(forged),
    /COMPACT_REPORT_INVALID/);

  const compact = compactActuarialMechanismShadowReport(report);
  const forgedCompact = structuredClone(compact);
  forgedCompact.authority.PRICE = true;
  assert.equal(verifyCompactActuarialMechanismShadowReport(forgedCompact).ok, false);
});

test("Wave3 metadata replay is coverage-ledger only and contributes zero model rows", () => {
  const wave3 = verifyPublicAgentWave3Source(WAVE3_SOURCE,
    { generatedAt: PUBLIC_AGENT_WAVE3_CANONICAL_GENERATED_AT });
  assert.equal(wave3.verification.status, "PINNED_METADATA_ONLY_REPRODUCED");
  assert.equal(wave3.verification.records, 272);
  assert.equal(wave3.verification.taskCorrelationComponents, 122);
  assert.equal(wave3.verification.traceBytesAcquired, 0);
  assert.throws(() => buildActuarialMechanismShadowReport({ corpora: [{
    corpusId: "forbidden-wave3-metadata-as-model-rows",
    kind: "PUBLIC_AGENT",
    sourceReplayClass: wave3.verification.status,
    records: wave3.records,
  }] }), /ACTUARIAL_SHADOW_CORPUS_INVALID/);

  const report = buildActuarialMechanismShadowReport({
    corpora: [{ corpusId: "fixture", kind: "PUBLIC_AGENT",
      sourceReplayClass: "FULL_SOURCE_REPRODUCED",
      records: [agentRecord({ id: "1", root: "a", outcome: false })] }],
    deferredSources: [{
      datasetId: CUAREWARDBENCH_WAVE3_PIN.id,
      revision: CUAREWARDBENCH_WAVE3_PIN.revision,
      sourceKind: CUAREWARDBENCH_WAVE3_PIN.sourceKind,
      sourceReplayClass: wave3.verification.status,
      sourceCompleteness: wave3.verification.sourceCompleteness,
      status: "DEFERRED_METADATA_ONLY_NO_TRACE_BYTES",
      reason: "PINNED_METADATA_LABELS_ARE_NOT_TRAJECTORY_FACTORS_OR_OUTCOMES",
      metadataRows: wave3.verification.records,
      metadataTaskRoots: wave3.verification.taskCorrelationComponents,
      traceBytesAcquired: wave3.verification.traceBytesAcquired,
      trajectoryTruthUsableRows: wave3.summary.counts.trajectoryTruthUsableRows,
      metadataLabelsUsedAsFactors: false,
      outcomeRowsAdmitted: 0,
      recoveryRowsAdmitted: 0,
      causalExperienceUnits: wave3.summary.counts.causalExperienceUnits,
      economicLossRows: wave3.summary.counts.economicLossRows,
      pricingEligibleRows: wave3.summary.counts.pricingEligibleRows,
      trainingRowsAdmitted: 0,
      automaticTraining: wave3.summary.interpretation.automaticTraining,
    }],
  });
  const coverage = report.deferredSources.find((source) =>
    source.datasetId === CUAREWARDBENCH_WAVE3_PIN.id);
  assert.equal(report.measurement.rows, 1);
  assert.equal(report.observations.length, 1);
  assert.equal(report.consequenceModels.length, 0);
  assert.equal(coverage.metadataRows, 272);
  assert.equal(coverage.metadataTaskRoots, 122);
  assert.equal(coverage.traceBytesAcquired, 0);
  assert.equal(coverage.metadataLabelsUsedAsFactors, false);
  assert.equal(coverage.rows, 0);
  assert.equal(coverage.factorCoverage, "MISSING_NOT_INGESTED");
  assert.equal(coverage.outcomeRowsAdmitted, 0);
  assert.equal(coverage.recoveryRowsAdmitted, 0);
  assert.equal(coverage.economicLossRows, 0);
  assert.equal(coverage.trainingRowsAdmitted, 0);
  assert.equal(report.observations.some((row) =>
    row.datasetId === CUAREWARDBENCH_WAVE3_PIN.id), false);
});
