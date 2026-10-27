import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { canonicalizeStrict } from "../src/canonical.js";
import { trainBehaviorModel } from "../src/outsider-experience.js";
import {
  buildGovernedBehaviorPreregistration,
  governedBehaviorForecast,
  trainGovernedBehaviorModel,
  verifyGovernedBehaviorTraining,
  verifyGovernedBehaviorTrainingAgainstRecords,
} from "../src/outsider-governed-behavior-model.js";

function seal(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function resealTrainingReport(report) {
  const copy = structuredClone(report);
  delete copy.model.modelHash;
  copy.model.modelHash = seal("outsider/governed-logistic-behavior-model/v2", copy.model);
  delete copy.trainingReportHash;
  copy.trainingReportHash = seal("outsider/governed-behavior-training/v2", copy);
  return copy;
}

function resealModel(model) {
  const copy = structuredClone(model);
  delete copy.modelHash;
  copy.modelHash = seal("outsider/governed-logistic-behavior-model/v2", copy);
  return copy;
}

function setPath(object, path, value) {
  const keys = path.split(".");
  const leaf = keys.pop();
  let cursor = object;
  for (const key of keys) cursor = cursor[key];
  cursor[leaf] = value;
}

function leafPaths(object, target, prefix = []) {
  if (Object.is(object, target)) return [prefix.join(".")];
  if (!object || typeof object !== "object" || Array.isArray(object)) return [];
  return Object.entries(object).flatMap(([key, value]) =>
    leafPaths(value, target, [...prefix, key]));
}

function at(index) {
  return new Date(Date.UTC(2026, 0, 1, 0, index, 0)).toISOString();
}

function record(index, {
  label = index % 2 === 0,
  domain = index < 16 ? "domain-a" : "domain-b",
  roots = [`root-${index}`],
  costUsd = label ? 9 : 1,
  costVsPeer = label ? 2 : 0.5,
} = {}) {
  return {
    schema: "outsider/experience/v1",
    executor: { id: `executor-${index}`, kind: "agent" },
    world: { kind: domain, reversible: !label, externality: label },
    claim: { id: `task-${index}` },
    taskId: `task-${index}`,
    features: {
      nSteps: label ? 20 : 2,
      costUsd,
      costVsPeer,
      claimedPass: label,
      claimedDone: label,
      ranTestClaim: !label,
    },
    labels: {
      fakedSuccess: label,
      neededCorrection: label,
      escalated: false,
      gatedIrreversible: false,
    },
    signalsSeen: [],
    stateHash: `state-${index}`,
    governance: { observedAt: at(index), correlationRoots: roots, domainId: domain },
  };
}

function prereg(overrides = {}) {
  return buildGovernedBehaviorPreregistration({
    registeredAt: "2025-12-31T00:00:00.000Z",
    minRecords: 20,
    minComponents: 10,
    minClassPerSplit: 2,
    epochs: 100,
    ...overrides,
  });
}

function assertClose(actual, expected, tolerance = 1e-12, message = undefined) {
  assert.equal(Number.isFinite(actual), true, message);
  assert.equal(Number.isFinite(expected), true, message);
  assert.ok(Math.abs(actual - expected) <= tolerance,
    message ?? `${actual} differs from ${expected} by more than ${tolerance}`);
}

test("governed v2 preserves roots and time, calibrates separately, and holds out a domain", () => {
  const result = trainGovernedBehaviorModel(
    Array.from({ length: 20 }, (_, index) => record(index)),
    { preregistration: prereg() });
  assert.equal(result.trained, true);
  assert.equal(result.split.rowRandomSplitUsed, false);
  assert.deepEqual(result.split.rootOverlap,
    { trainCalibration: 0, trainTest: 0, calibrationTest: 0 });
  assert.equal(result.split.strictTemporalOrderEstablished, true);
  assert.deepEqual(result.split.heldOutDomains, ["domain-b"]);
  assert.deepEqual(result.split.testDomainsSeenDuringLearning, []);
  assert.equal(result.split.allTestDomainsAbsentFromLearning, true);
  assert.equal(result.split.summaries.train.rows, 12);
  assert.equal(result.split.summaries.calibration.rows, 4);
  assert.equal(result.split.summaries.test.rows, 4);
  assert.equal(result.split.summaries.test.positiveBearingComponents, 2);
  assert.equal(result.split.summaries.test.negativeBearingComponents, 2);
  assert.equal(result.split.summaries.test.declaredKnownRootConnectedComponents, 4);
  assert.equal(result.split.summaries.test.effectiveIndependentComponentCount, null);
  assert.equal(result.holdout.testRowsUsedForFitting, false);
  assert.equal(result.holdout.testRowsUsedForCalibration, false);
  assert.equal(result.holdout.calibratedMetrics.weighting,
    "ROW_WEIGHTED_DESCRIPTIVE_METRIC_NOT_CLUSTER_BALANCED");
  assert.equal(result.holdout.calibratedMetrics.clusterRobustInferenceEstablished, false);
  assert.equal(result.holdout.calibratedComponentBalancedMetrics.weighting,
    "EQUAL_TOTAL_WEIGHT_PER_DECLARED_KNOWN_ROOT_CONNECTED_COMPONENT_DESCRIPTIVE");
  assert.equal(result.holdout.calibratedComponentBalancedMetrics.eachComponentTotalWeight, 0.25);
  assert.equal(result.holdout.calibratedComponentBalancedMetrics
    .eachObservedComponentHasEqualMarginalRowWeight, true);
  assert.equal(result.holdout.calibratedComponentBalancedMetrics
    .aucUsesClassConditionalWeightNormalization, true);
  assert.equal(result.holdout.calibratedComponentBalancedMetrics
    .equalPairwiseAucContributionPerComponentEstablished, false);
  assert.equal(result.holdout.calibratedComponentBalancedMetrics.confidenceInterval, null);
  assert.equal(result.holdout.calibratedComponentBalancedMetrics
    .newComponentGeneralizationEstablished, false);
  assert.equal(result.holdout.estimandContract.randomRow.populationInferenceEstablished, false);
  assert.equal(result.holdout.estimandContract.observedKnownCorrelationComponents
    .empiricalFunctionalOnly, true);
  assert.equal(result.holdout.estimandContract.newKnownCorrelationComponent.estimate, null);
  assert.equal(result.holdout.estimandContract.newKnownCorrelationComponent
    .newComponentGeneralizationEstablished, false);
  assert.equal(result.holdout.estimandContract.newDomain.estimate, null);
  assert.equal(result.holdout.estimandContract.newDomain.transportEstablished, false);
  assert.equal(result.holdout.estimandContract.globalBoundaries.priceUseEligible, false);
  assert.equal(result.holdout.effectiveIndependentComponentCount, null);
  assert.equal(result.holdout.calibratedReliabilityBinsDescriptiveRowWeighted.every((bin) =>
    bin.naiveRowWilson95IgnoringWithinComponentDependence === null
      && bin.clusterRobustInterval === null
      && bin.clusterRobustInferenceEstablished === false
      && !Object.hasOwn(bin, "observedRateWilson95")), true);
  assert.equal(result.modelCard.missingCostImputedAsZero, false);
  assert.equal(result.modelCard.missingCostVsPeerImputedAsOne, false);
  assert.equal(result.modelCard.completedRunFeaturesAreProspectivePreActionFeatures, false);
  assert.equal(result.modelCard.knownCorrelationRootLeakageAcrossSplitsPrevented, true);
  assert.equal(Object.hasOwn(result.modelCard, "featureLeakageAcrossRowsPrevented"), false);
  assert.equal(result.modelCard.clusterRobustInferenceEstablished, false);
  assert.equal(result.modelCard.labelDefinitionFeatureOverlapExcluded, false);
  assert.equal(result.modelCard.sourceTruthReplayedByThisTrainer, false);
  assert.equal(result.preregistration.externalTimestampAuthorityVerified, false);
  assert.equal(result.preregistration.outcomeBlindCreationVerified, false);
  assert.equal(result.governance.preActionUseEligible, false);
  assert.equal(result.governance.responsibilityUseEligible, false);
  assert.equal(result.governance.operationalAuthorityGranted, false);
  const checked = verifyGovernedBehaviorTraining(result);
  assert.equal(checked.ok, true);
  assert.equal(checked.calibrationAndTestSeparated, true);
  assert.equal(checked.domainPartitionInternallyConsistent, true);
  assert.equal(checked.domainAssignmentsSourceReverified, false);
  assert.equal(checked.metricArithmeticInternallyConsistent, true);
  assert.equal(checked.metricValuesSourceRecomputed, false);
  assert.equal(checked.componentBalancedDescriptiveMetricsDisclosed, true);
  assert.equal(checked.componentBalancedMetricValuesSourceRecomputed, false);
  assert.equal(checked.newKnownCorrelationComponentGeneralizationEstablished, false);
  assert.equal(checked.newDomainTransportEstablished, false);
  const full = verifyGovernedBehaviorTrainingAgainstRecords(result,
    Array.from({ length: 20 }, (_, index) => record(index)));
  assert.equal(full.ok, true);
  assert.equal(full.verificationLevel, "FULL_SOURCE_RECORD_RETRAIN_AND_EXACT_REPORT_COMPARE");
  assert.equal(full.sourceRecordsReverified, true);
  assert.equal(full.modelRetrained, true);
  assert.equal(full.domainAssignmentsSourceReverified, true);
  assert.equal(full.metricValuesSourceRecomputed, true);
  assert.equal(full.componentBalancedMetricValuesSourceRecomputed, true);
  assert.equal(full.componentBalancedMetricsExactReportCompared, true);
  assert.equal(full.holdoutEstimandContractReverified, true);

  const forecast = governedBehaviorForecast(result.model, record(40,
    { domain: "domain-c", label: true }));
  assert.equal(forecast.probability >= 0 && forecast.probability <= 1, true);
  assert.equal(forecast.completedRunRetrospectiveOnly, true);
  assert.equal(forecast.contractMutationEligible, false);
  assert.equal(forecast.priceUseEligible, false);
  assert.equal(forecast.responsibilityUseEligible, false);
});

test("preregistration is mandatory, hash-bound, and earlier than every outcome", () => {
  const rows = Array.from({ length: 20 }, (_, index) => record(index));
  assert.equal(trainGovernedBehaviorModel(rows).reasonCode,
    "PREREGISTRATION_INVALID_OR_MISSING");

  const tampered = structuredClone(prereg());
  tampered.configuration.seed += 1;
  assert.equal(trainGovernedBehaviorModel(rows, { preregistration: tampered }).reasonCode,
    "PREREGISTRATION_INVALID_OR_MISSING");

  const late = prereg({ registeredAt: at(10) });
  assert.equal(trainGovernedBehaviorModel(rows, { preregistration: late }).reasonCode,
    "PREREGISTRATION_NOT_BEFORE_ALL_OUTCOMES");

  assert.throws(() => prereg({ requireOutOfDomainHoldout: "yes" }),
    /PREREGISTRATION_INVALID/u);
});

test("missing values are rejected rather than mapped to plausible numeric values", () => {
  const rows = Array.from({ length: 20 }, (_, index) => record(index));
  rows[3].features.costUsd = null;
  assert.equal(trainGovernedBehaviorModel(rows, { preregistration: prereg() }).reasonCode,
    "FEATURE_MISSINGNESS_NOT_EXPLICITLY_MODELLED");

  const peers = Array.from({ length: 20 }, (_, index) => record(index));
  peers[5].features.costVsPeer = null;
  assert.equal(trainGovernedBehaviorModel(peers, { preregistration: prereg() }).reasonCode,
    "FEATURE_MISSINGNESS_NOT_EXPLICITLY_MODELLED");

  const labels = Array.from({ length: 20 }, (_, index) => record(index));
  labels[7].labels.fakedSuccess = null;
  assert.equal(trainGovernedBehaviorModel(labels, { preregistration: prereg() }).reasonCode,
    "LABEL_NOT_BOOLEAN");

  const trained = trainGovernedBehaviorModel(
    Array.from({ length: 20 }, (_, index) => record(index)),
    { preregistration: prereg() });
  const missingForecast = record(40, { domain: "domain-c" });
  missingForecast.features.costUsd = null;
  assert.throws(() => governedBehaviorForecast(trained.model, missingForecast),
    /FEATURE_MISSINGNESS_NOT_EXPLICITLY_MODELLED/u);

  const duplicated = Array.from({ length: 20 }, (_, index) => record(index));
  duplicated[19] = structuredClone(duplicated[18]);
  assert.equal(trainGovernedBehaviorModel(duplicated,
    { preregistration: prereg() }).reasonCode, "DUPLICATE_RECORD_HASH");
});

test("known-root connected components cannot be torn across temporal splits", () => {
  const rows = Array.from({ length: 20 }, (_, index) => record(index));
  rows[0].governance.correlationRoots = ["bridge-a"];
  rows[10].governance.correlationRoots = ["bridge-a", "bridge-b"];
  rows[19].governance.correlationRoots = ["bridge-b"];
  const result = trainGovernedBehaviorModel(rows, { preregistration: prereg() });
  assert.equal(result.trained, false);
  assert.ok(["STRICT_TEMPORAL_SPLIT_UNAVAILABLE",
    "INDEPENDENT_COMPONENT_COUNT_INSUFFICIENT",
    "RARE_CLASS_SPLIT_SUPPORT_INSUFFICIENT"].includes(result.reasonCode));
  assert.equal(result.governance.responsibilityUseEligible, false);
});

test("out-of-domain and rare-class safeguards fail closed", () => {
  const sameDomain = Array.from({ length: 20 }, (_, index) =>
    record(index, { domain: "one-domain" }));
  assert.equal(trainGovernedBehaviorModel(sameDomain,
    { preregistration: prereg() }).reasonCode, "OUT_OF_DOMAIN_HOLDOUT_UNAVAILABLE");

  const mixedTest = Array.from({ length: 20 }, (_, index) =>
    record(index, { domain: index < 16 || index === 19 ? "domain-a" : "domain-b" }));
  assert.equal(trainGovernedBehaviorModel(mixedTest,
    { preregistration: prereg() }).reasonCode, "OUT_OF_DOMAIN_HOLDOUT_UNAVAILABLE");

  const rareTest = Array.from({ length: 20 }, (_, index) => record(index));
  for (let index = 16; index < 20; index += 1) {
    rareTest[index] = record(index, { label: index === 16 });
  }
  assert.equal(trainGovernedBehaviorModel(rareTest,
    { preregistration: prereg() }).reasonCode, "RARE_CLASS_SPLIT_SUPPORT_INSUFFICIENT");
});

test("five correlated rows cannot impersonate five independent rare-class supports", () => {
  const rows = Array.from({ length: 60 }, (_, index) => {
    const component = Math.floor(index / 5);
    return record(index, {
      label: component % 2 === 0,
      domain: component < 10 ? "learning-domain" : "held-out-domain",
      roots: [`cluster-${component}`],
    });
  });
  const result = trainGovernedBehaviorModel(rows, {
    preregistration: prereg({
      minRecords: 60,
      minComponents: 12,
      minClassPerSplit: 2,
      calibrationFrac: 0.34,
      testFrac: 0.2,
    }),
  });
  assert.equal(result.trained, false);
  assert.equal(result.reasonCode, "RARE_CLASS_SPLIT_SUPPORT_INSUFFICIENT");
  assert.equal(result.accounting.summaries.test.rows, 10);
  assert.equal(result.accounting.summaries.test.positives, 5);
  assert.equal(result.accounting.summaries.test.negatives, 5);
  assert.equal(result.accounting.summaries.test.components, 2);
  assert.equal(result.accounting.summaries.test.positiveBearingComponents, 1);
  assert.equal(result.accounting.summaries.test.negativeBearingComponents, 1);
});

test("one component duplicated 100 times cannot dominate component-balanced holdout metrics", () => {
  const baseRows = Array.from({ length: 20 }, (_, index) => record(index));
  const base = trainGovernedBehaviorModel(baseRows, { preregistration: prereg() });
  assert.equal(base.trained, true);

  const imbalancedRows = [...baseRows];
  for (let offset = 0; offset < 100; offset += 1) {
    imbalancedRows.push(record(20 + offset, {
      label: false,
      domain: "domain-b",
      roots: ["root-19"],
    }));
  }
  const imbalanced = trainGovernedBehaviorModel(
    imbalancedRows, { preregistration: prereg() });
  assert.equal(imbalanced.trained, true);
  assert.equal(imbalanced.split.summaries.test.components, 4);
  assert.equal(imbalanced.split.summaries.test.rows, 104);
  assert.equal(imbalanced.split.summaries.test.maximumRowsInOneComponent, 101);
  assert.equal(imbalanced.holdout.calibratedComponentBalancedMetrics
    .eachComponentTotalWeight, 0.25);

  for (const key of ["auc", "logloss", "brier", "expectedCalibrationError10Bins"]) {
    assertClose(imbalanced.holdout.calibratedComponentBalancedMetrics[key],
      base.holdout.calibratedComponentBalancedMetrics[key], 1e-12, key);
  }
  assert.ok(Math.abs(imbalanced.holdout.trainingPrevalenceBaselineMetrics
    .expectedCalibrationError10Bins
    - base.holdout.trainingPrevalenceBaselineMetrics.expectedCalibrationError10Bins) > 0.1,
  "the legacy random-row description should visibly reflect the 100 added rows");

  const full = verifyGovernedBehaviorTrainingAgainstRecords(imbalanced, imbalancedRows);
  assert.equal(full.ok, true);
  assert.equal(full.componentBalancedMetricValuesSourceRecomputed, true);
  assert.equal(full.componentBalancedMetricsExactReportCompared, true);
});

test("coherent-looking report mutations fail hash and governance verification", () => {
  const rows = Array.from({ length: 20 }, (_, index) => record(index));
  const result = trainGovernedBehaviorModel(
    rows,
    { preregistration: prereg() });
  assert.equal(result.trained, true);

  const metric = structuredClone(result);
  metric.holdout.calibratedMetrics.logloss = 0;
  assert.equal(verifyGovernedBehaviorTraining(metric).ok, false);

  const authority = structuredClone(result);
  authority.governance.responsibilityUseEligible = true;
  assert.equal(verifyGovernedBehaviorTraining(authority).ok, false);

  const fakeClusterInference = structuredClone(result);
  fakeClusterInference.modelCard.clusterRobustInferenceEstablished = true;
  assert.match(verifyGovernedBehaviorTraining(
    resealTrainingReport(fakeClusterInference)).error,
  /FIXED_FALSE_BOUNDARY_INVALID:modelCard\.clusterRobustInferenceEstablished/u);

  const fakeComponentSupport = structuredClone(result);
  fakeComponentSupport.split.summaries.test.positiveBearingComponents = 0;
  fakeComponentSupport.model.splitBindingHash = seal(
    "outsider/governed-behavior-split-binding/v1", fakeComponentSupport.split.summaries);
  assert.match(verifyGovernedBehaviorTraining(
    resealTrainingReport(fakeComponentSupport)).error, /SUMMARY_DERIVATION_INVALID:TEST/u);

  const model = structuredClone(result);
  model.model.priceUseEligible = true;
  assert.equal(verifyGovernedBehaviorTraining(model).ok, false);

  const driftedRows = structuredClone(rows);
  driftedRows[0].features.nSteps += 1;
  assert.equal(verifyGovernedBehaviorTrainingAgainstRecords(result, driftedRows).ok, false);
});

test("coherent reseals cannot promote any fixed truth or semantic boundary", () => {
  const rows = Array.from({ length: 20 }, (_, index) => record(index));
  const result = trainGovernedBehaviorModel(rows, { preregistration: prereg() });
  assert.equal(result.trained, true);
  const falseToTruePaths = leafPaths(result, false);
  assert.ok(falseToTruePaths.length >= 47);
  for (const path of falseToTruePaths) {
    const attack = structuredClone(result);
    assert.equal(path.split(".").reduce((value, key) => value[key], attack), false, path);
    setPath(attack, path, true);
    const resealed = resealTrainingReport(attack);
    assert.equal(verifyGovernedBehaviorTraining(resealed).ok, false, path);
    assert.equal(verifyGovernedBehaviorTrainingAgainstRecords(resealed, rows).ok, false, path);
  }

  const stringPromotions = [
    ["split.assignmentUnit", "ROW_RANDOM"],
    ["split.ordering", "RANDOM"],
    ["calibration.method", "SELF_CALIBRATED_ON_TEST"],
    ["calibration.calibratorFitWeighting", "CLUSTER_BALANCED"],
    ["model.featureTemporality", "PROSPECTIVE_PRE_ACTION"],
    ["model.intendedUse", "PRICE_AND_RESPONSIBILITY"],
    ["modelCard.modelFamily", "PRODUCTION_ACTUARIAL_MODEL"],
    ["modelCard.trainingPopulation", "AUTHENTICATED_REAL_WORLD"],
    ["modelCard.temporalHoldout", "PROSPECTIVE"],
    ["modelCard.trainingObjectiveWeighting", "CLUSTER_BALANCED"],
    ["modelCard.calibrationObjectiveWeighting", "CLUSTER_BALANCED"],
    ["modelCard.holdoutMetricsWeighting", "CLUSTER_ROBUST_INFERENCE"],
  ];
  for (const [path, promoted] of stringPromotions) {
    const attack = structuredClone(result);
    setPath(attack, path, promoted);
    const resealed = resealTrainingReport(attack);
    assert.equal(verifyGovernedBehaviorTraining(resealed).ok, false, path);
    assert.equal(verifyGovernedBehaviorTrainingAgainstRecords(resealed, rows).ok, false, path);
  }
});

test("structure verification derives OOD, support, performance, shape, and exact schemas", () => {
  const rows = Array.from({ length: 20 }, (_, index) => record(index));
  const result = trainGovernedBehaviorModel(rows, { preregistration: prereg() });
  assert.equal(result.trained, true);
  const rejected = (attack, label) => {
    const resealed = resealTrainingReport(attack);
    assert.equal(verifyGovernedBehaviorTraining(resealed).ok, false, label);
    assert.equal(verifyGovernedBehaviorTrainingAgainstRecords(resealed, rows).ok, false, label);
  };

  const fakeHeldOut = structuredClone(result);
  fakeHeldOut.split.heldOutDomains = ["fake-domain"];
  rejected(fakeHeldOut, "heldOutDomains must derive from summary domains");

  const fakeSummaryDomain = structuredClone(result);
  fakeSummaryDomain.split.summaries.test.domains = ["fake-domain"];
  fakeSummaryDomain.model.splitBindingHash = seal(
    "outsider/governed-behavior-split-binding/v1", fakeSummaryDomain.split.summaries);
  rejected(fakeSummaryDomain, "summary domains must derive from component support");

  const impossibleSupport = structuredClone(result);
  impossibleSupport.split.summaries.test.positiveBearingComponents = 999;
  impossibleSupport.model.splitBindingHash = seal(
    "outsider/governed-behavior-split-binding/v1", impossibleSupport.split.summaries);
  rejected(impossibleSupport, "class-bearing support cannot exceed components");

  const unusableModel = structuredClone(result);
  unusableModel.model.underlyingLogistic.weights = [];
  rejected(unusableModel, "verified model must have usable numeric shape");

  const impossibleAuc = structuredClone(result);
  impossibleAuc.holdout.calibratedMetrics.auc = 999;
  rejected(impossibleAuc, "AUC range");

  const impossibleBrier = structuredClone(result);
  impossibleBrier.holdout.uncalibratedMetrics.brier = -1;
  rejected(impossibleBrier, "Brier range");

  const fabricatedComponentInterval = structuredClone(result);
  fabricatedComponentInterval.holdout.calibratedComponentBalancedMetrics
    .confidenceInterval = { lower: 0, upper: 1 };
  rejected(fabricatedComponentInterval, "component-balanced description cannot invent a CI");

  const promotedComponentEstimand = structuredClone(result);
  promotedComponentEstimand.holdout.estimandContract.newKnownCorrelationComponent
    .newComponentGeneralizationEstablished = true;
  rejected(promotedComponentEstimand, "equal component weights do not establish exchangeability");

  const promotedDomainEstimand = structuredClone(result);
  promotedDomainEstimand.holdout.estimandContract.newDomain.transportEstablished = true;
  rejected(promotedDomainEstimand, "an OOD split does not establish new-domain transport");

  const unknownComponentMetricField = structuredClone(result);
  unknownComponentMetricField.holdout.calibratedComponentBalancedMetrics
    .priceUseEligible = true;
  rejected(unknownComponentMetricField, "unknown component metric field");

  const wrongBaseline = structuredClone(result);
  wrongBaseline.holdout.trainingPrevalenceBaselineProbability = 0.9;
  rejected(wrongBaseline, "baseline must derive from train labels");

  const impossibleBinRows = structuredClone(result);
  impossibleBinRows.holdout.calibratedReliabilityBinsDescriptiveRowWeighted[0].rows = 999;
  rejected(impossibleBinRows, "reliability rows must account to test rows");

  const duplicateBin = structuredClone(result);
  assert.ok(duplicateBin.holdout.calibratedReliabilityBinsDescriptiveRowWeighted.length >= 2);
  duplicateBin.holdout.calibratedReliabilityBinsDescriptiveRowWeighted[1].bin
    = duplicateBin.holdout.calibratedReliabilityBinsDescriptiveRowWeighted[0].bin;
  rejected(duplicateBin, "reliability bin indexes must be unique and ordered");

  const coherentlyResealedMetric = structuredClone(result);
  coherentlyResealedMetric.holdout.calibratedComponentBalancedMetrics.brier += 1e-6;
  const resealedMetric = resealTrainingReport(coherentlyResealedMetric);
  assert.equal(verifyGovernedBehaviorTraining(resealedMetric).ok, true,
    "structure-only verification must not pretend it replayed source metric values");
  const replayedMetric = verifyGovernedBehaviorTrainingAgainstRecords(resealedMetric, rows);
  assert.equal(replayedMetric.ok, false);
  assert.equal(replayedMetric.componentBalancedMetricValuesSourceRecomputed, false);
  assert.match(replayedMetric.error, /SOURCE_RECORD_RETRAIN_MISMATCH/u);

  for (const [path, value] of [
    ["readyToPrice", true],
    ["modelCard.priceUseEligible", true],
    ["governance.movesFunds", true],
    ["model.underwritingAuthority", true],
  ]) {
    const unknown = structuredClone(result);
    setPath(unknown, path, value);
    rejected(unknown, `unknown field:${path}`);
  }

  assert.doesNotThrow(() => governedBehaviorForecast(result.model,
    record(40, { domain: "domain-c" })));

  for (const [path, value] of [
    ["intendedUse", "PRICE_AND_RESPONSIBILITY"],
    ["featureTemporality", "PROSPECTIVE_PRE_ACTION"],
    ["priceUseEligible", true],
    ["underwritingAuthority", true],
  ]) {
    const promotedModel = structuredClone(result.model);
    setPath(promotedModel, path, value);
    assert.throws(() => governedBehaviorForecast(resealModel(promotedModel),
      record(40, { domain: "domain-c" })), /MODEL_BOUNDARY_INVALID/u, path);
  }
});

test("row-weighted baseline improvement flags are recomputed from frozen metrics", () => {
  const rows = Array.from({ length: 20 }, (_, index) => {
    if (index < 16) return record(index);
    const actualLabel = index % 2 === 0;
    const row = record(index, { label: !actualLabel, domain: "domain-b" });
    row.labels.fakedSuccess = actualLabel;
    return row;
  });
  const result = trainGovernedBehaviorModel(rows, { preregistration: prereg() });
  assert.equal(result.trained, true);
  assert.deepEqual(result.holdout.beatsTrainingPrevalenceBaseline,
    { logloss: false, brier: false });
  assert.equal(result.holdout.rowWeightedDescriptiveImprovementOnFrozenHoldout, false);
  const promoted = structuredClone(result);
  promoted.holdout.beatsTrainingPrevalenceBaseline = { logloss: true, brier: true };
  promoted.holdout.rowWeightedDescriptiveImprovementOnFrozenHoldout = true;
  const resealed = resealTrainingReport(promoted);
  assert.equal(verifyGovernedBehaviorTraining(resealed).ok, false);
  assert.equal(verifyGovernedBehaviorTrainingAgainstRecords(resealed, rows).ok, false);
});

test("legacy trainer remains callable but self-identifies its unsafe validation ceiling", () => {
  const result = trainBehaviorModel(
    Array.from({ length: 40 }, (_, index) => record(index,
      { domain: index < 32 ? "domain-a" : "domain-b" })),
    { minRecords: 40, epochs: 5 });
  assert.equal(result.trained, true);
  assert.equal(result.governance.randomRowSplitUsed, true);
  assert.equal(result.governance.correlationRootsPreserved, false);
  assert.equal(result.governance.temporalHoldoutEstablished, false);
  assert.equal(result.governance.retrospectiveExploratoryUseOnly, true);
  assert.equal(result.governance.responsibilityUseEligible, false);
  assert.equal(result.model.meta.validationGovernance.operationalAuthorityGranted, false);
});
