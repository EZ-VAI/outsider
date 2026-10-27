/*
 * Multivariable proxy-outcome sensitivity over source-replayed public corpora.
 *
 * This is deliberately not an economic-loss, causal, production-risk, or
 * pricing model. It asks only whether measured trajectory factors add
 * descriptive discrimination inside a source-specific proxy-outcome cohort.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "./canonical.js";
import {
  ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH,
  ACTUARIAL_MECHANISM_FACTORS,
  buildKnownSourceActuarialMechanismShadowReport,
  verifyActuarialMechanismShadowReport,
} from "./outsider-actuarial-mechanism-shadow.js";

export const FACTOR_PREDICTIVE_SHADOW_SCHEMA =
  "outsider/factor-predictive-shadow-report/v1";

/*
 * Predictors are governed separately from the measurement dictionary.  A
 * measured field is not automatically a legitimate predictor.  In
 * particular, post_error_recovery_observed is derived using the native outcome
 * and would leak the target back into the design matrix.
 */
export const FACTOR_PREDICTIVE_POLICY = Object.freeze({
  schema: "outsider/factor-predictive-policy/v1",
  useCase: "RETROSPECTIVE_WITHIN_DATASET_PROXY_DISCRIMINATION_ONLY",
  prospectivePredictionClaimed: false,
  factors: Object.freeze(ACTUARIAL_MECHANISM_FACTORS.map((factor) => Object.freeze({
    factorId: factor.id,
    predictorEligible: [
      "trajectory_step_count",
      "tool_call_count",
      "tool_result_pairing_ratio",
      "observed_error_event_rate",
      "agent_turn_fraction",
      "trajectory_duration_ms",
      "action_observation_pairing_ratio",
    ].includes(factor.id),
    directNativeOutcomeDerived: factor.id === "post_error_recovery_observed",
    availableBeforeExecution: false,
    temporalRole: factor.id === "post_error_recovery_observed"
      ? "POST_OUTCOME_DERIVATION_EXCLUDED"
      : "END_OF_TRAJECTORY_STRUCTURE_BEFORE_NATIVE_LABEL_JOIN",
    exclusionReason: factor.id === "post_error_recovery_observed"
      ? "DIRECT_NATIVE_OUTCOME_DERIVATION"
      : factor.id === "terminal_boundary_observed"
        ? "TERMINAL_BOUNDARY_MAY_ENCODE_OUTCOME_COMPLETION"
        : factor.id === "execution_control_mode"
          ? "NON_NUMERIC_CONTEXT_FIELD"
          : null,
  }))),
});

export const FACTOR_PREDICTIVE_POLICY_HASH = digest(
  "outsider/factor-predictive-policy/v1",
  FACTOR_PREDICTIVE_POLICY,
);

const PREDICTIVE_FACTOR_IDS = FACTOR_PREDICTIVE_POLICY.factors
  .filter((policy) => policy.predictorEligible)
  .map((policy) => policy.factorId);

function digest(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\0${canonicalizeStrict(value)}`)
    .digest("hex")}`;
}

function canonicalEqual(left, right) {
  try { return canonicalizeStrict(left) === canonicalizeStrict(right); } catch { return false; }
}

function hasExactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && canonicalEqual(Object.keys(value).sort(), [...keys].sort());
}

function isSha256(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

const implementationBytes = readFileSync(fileURLToPath(import.meta.url));
const canonicalizerBytes = readFileSync(fileURLToPath(new URL("./canonical.js", import.meta.url)));
export const FACTOR_PREDICTIVE_NUMERIC_RUNTIME = Object.freeze({
  node: process.versions.node,
  v8: process.versions.v8,
  numberModel: "ECMASCRIPT_IEEE754_BINARY64_MATH",
});
export const FACTOR_PREDICTIVE_IMPLEMENTATION_HASH = digest(
  "outsider/factor-predictive-shadow-implementation/v1",
  {
    moduleSha256: `sha256:${createHash("sha256").update(implementationBytes).digest("hex")}`,
    canonicalizerSha256:
      `sha256:${createHash("sha256").update(canonicalizerBytes).digest("hex")}`,
    numericRuntime: FACTOR_PREDICTIVE_NUMERIC_RUNTIME,
  },
);

function numericFactor(factor) {
  if (factor?.status !== "MEASURED") return null;
  if (typeof factor.value === "boolean") return factor.value ? 1 : 0;
  return typeof factor.value === "number" && Number.isFinite(factor.value)
    ? factor.value : null;
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function solveLinear(matrix, vector) {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let item = column; item <= size; item += 1) augmented[column][item] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const multiple = augmented[row][column];
      for (let item = column; item <= size; item += 1) {
        augmented[row][item] -= multiple * augmented[column][item];
      }
    }
  }
  return augmented.map((row) => row[size]);
}

function fitLogistic(train, featureIds, ridge) {
  const means = featureIds.map((id) => train.reduce((sum, row) => sum + row.values[id], 0)
    / train.length);
  const scales = featureIds.map((id, index) => Math.sqrt(train.reduce((sum, row) =>
    sum + (row.values[id] - means[index]) ** 2, 0) / train.length) || 1);
  const vector = (row) => [1, ...featureIds.map((id, index) =>
    (row.values[id] - means[index]) / scales[index])];
  const positives = train.filter((row) => row.event).length;
  let weights = [Math.log((positives + 0.5) / (train.length - positives + 0.5)),
    ...featureIds.map(() => 0)];
  let converged = false; let iterations = 0; let maxUpdate = null;
  for (let iteration = 0; iteration < 40; iteration += 1) {
    const gradient = weights.map(() => 0);
    const information = weights.map(() => weights.map(() => 0));
    for (const row of train) {
      const x = vector(row);
      const probability = sigmoid(x.reduce((sum, value, index) =>
        sum + value * weights[index], 0));
      const variance = Math.max(1e-7, probability * (1 - probability));
      for (let left = 0; left < weights.length; left += 1) {
        gradient[left] += x[left] * ((row.event ? 1 : 0) - probability);
        for (let right = 0; right < weights.length; right += 1) {
          information[left][right] += variance * x[left] * x[right];
        }
      }
    }
    for (let index = 1; index < weights.length; index += 1) {
      gradient[index] -= ridge * weights[index];
      information[index][index] += ridge;
    }
    information[0][0] += 1e-8;
    const update = solveLinear(information, gradient);
    if (update === null) return null;
    weights = weights.map((weight, index) => weight + update[index]);
    maxUpdate = Math.max(...update.map(Math.abs));
    iterations = iteration + 1;
    if (maxUpdate < 1e-8) { converged = true; break; }
  }
  return { means, scales, weights, converged, iterations, maxUpdate,
    predict: (row) => sigmoid([1, ...featureIds.map((id, index) =>
      (row.values[id] - means[index]) / scales[index])]
      .reduce((sum, value, index) => sum + value * weights[index], 0)) };
}

function auc(rows) {
  const ordered = [...rows].sort((left, right) => left.probability - right.probability);
  const positives = ordered.filter((row) => row.event).length;
  const negatives = ordered.length - positives;
  if (positives === 0 || negatives === 0) return null;
  let positiveRanks = 0;
  for (let start = 0; start < ordered.length;) {
    let end = start + 1;
    while (end < ordered.length && ordered[end].probability === ordered[start].probability) end += 1;
    const averageRank = (start + 1 + end) / 2;
    for (let index = start; index < end; index += 1) {
      if (ordered[index].event) positiveRanks += averageRank;
    }
    start = end;
  }
  return (positiveRanks - positives * (positives + 1) / 2) / (positives * negatives);
}

function metrics(rows) {
  const epsilon = 1e-12;
  const positives = rows.filter((row) => row.event).length;
  const negatives = rows.length - positives;
  let brier = 0; let logLoss = 0; let truePositive = 0; let trueNegative = 0;
  for (const row of rows) {
    const target = row.event ? 1 : 0;
    const probability = Math.max(epsilon, Math.min(1 - epsilon, row.probability));
    brier += (probability - target) ** 2;
    logLoss -= target * Math.log(probability) + (1 - target) * Math.log(1 - probability);
    if (row.event && probability >= 0.5) truePositive += 1;
    if (!row.event && probability < 0.5) trueNegative += 1;
  }
  return {
    auc: auc(rows),
    sampleBrier: brier / rows.length,
    sampleLogLoss: logLoss / rows.length,
    balancedAccuracyAtPointFive: ((truePositive / positives) + (trueNegative / negatives)) / 2,
    calibrationClaimed: false,
  };
}

function deterministicFolds(groupIds, folds) {
  return new Map([...groupIds].sort((left, right) =>
    digest("outsider/factor-shadow-fold-order/v1", left)
      .localeCompare(digest("outsider/factor-shadow-fold-order/v1", right)))
    .map((id, index) => [id, index % folds]));
}

/**
 * Build dataset-scoped correlation components using disclosed roots only.
 * Neither the outcome, any measured factor, observationHash, nor source record
 * bytes participate in the component or fold key.
 */
export function deriveOutcomeBlindPredictiveGroups(observations) {
  if (!Array.isArray(observations) || observations.length === 0
    || observations.some((row) => typeof row?.datasetId !== "string"
      || row.datasetId.length === 0 || !Array.isArray(row.correlationRoots)
      || row.correlationRoots.length === 0
      || row.correlationRoots.some((root) => typeof root !== "string" || root.length === 0))) {
    throw new Error("FACTOR_PREDICTIVE_GROUP_INPUT_INVALID");
  }
  const parent = observations.map((_, index) => index);
  const find = (index) => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor];
    while (parent[index] !== index) {
      const next = parent[index];
      parent[index] = cursor;
      index = next;
    }
    return cursor;
  };
  const union = (left, right) => {
    const a = find(left); const b = find(right);
    if (a !== b) parent[b] = a;
  };
  const rootOwner = new Map();
  observations.forEach((row, index) => {
    for (const root of new Set(row.correlationRoots)) {
      const scoped = `${row.datasetId}\0${root}`;
      if (rootOwner.has(scoped)) union(index, rootOwner.get(scoped));
      else rootOwner.set(scoped, index);
    }
  });
  const componentRoots = new Map();
  observations.forEach((row, index) => {
    const component = find(index);
    if (!componentRoots.has(component)) componentRoots.set(component, new Set());
    for (const root of new Set(row.correlationRoots)) {
      componentRoots.get(component).add(`${row.datasetId}\0${root}`);
    }
  });
  const componentIds = new Map([...componentRoots.entries()].map(([component, roots]) => [
    component,
    digest("outsider/factor-shadow-outcome-blind-disclosed-root-component/v1",
      [...roots].sort()),
  ]));
  return observations.map((_, index) => componentIds.get(find(index)));
}

/** Pure math helper; it establishes no source trust or product authority. */
export function evaluateProxyFactorCohort({ rows, folds = 5, ridge = 1 } = {}) {
  if (!Array.isArray(rows) || rows.length < 2 || !Number.isSafeInteger(folds) || folds < 2
    || !(ridge > 0) || rows.some((row) => typeof row?.groupId !== "string"
      || typeof row?.event !== "boolean" || !row.values || typeof row.values !== "object")) {
    throw new Error("FACTOR_PREDICTIVE_COHORT_INPUT_INVALID");
  }
  const groupIds = new Set(rows.map((row) => row.groupId));
  const factorCoverage = PREDICTIVE_FACTOR_IDS.map((factorId) => {
    const measured = rows.filter((row) => Number.isFinite(row.values[factorId]));
    return { factorId, measuredRows: measured.length, missingRows: rows.length - measured.length,
      distinctValues: new Set(measured.map((row) => row.values[factorId])).size };
  });
  const positives = rows.filter((row) => row.event).length;
  const blockers = [];
  if (rows.length < 40) blockers.push("FEWER_THAN_40_ROWS");
  if (groupIds.size < folds) blockers.push("FEWER_DISCLOSED_COMPONENTS_THAN_FOLDS");
  if (positives === 0 || positives === rows.length) blockers.push("OUTCOME_HAS_ONE_CLASS");
  if (blockers.length > 0) return { status: "ABSTAIN", rows: rows.length,
    disclosedRootComponents: groupIds.size, positives, negatives: rows.length - positives,
    featureCoverage: factorCoverage, selectedFactorIds: [], blockers,
    foldFeatureSelectionUsesTrainingRowsOnly: true,
    retrospectiveTrajectoryFeaturesOnly: true,
    sourceRowsIndependentClaimed: false, causalEffectClaimed: false,
    externalValidationClaimed: false };

  const foldByGroup = deterministicFolds(groupIds, folds);
  const scored = []; const coefficients = [];
  const selectedAcrossFolds = new Set();
  for (let fold = 0; fold < folds; fold += 1) {
    const train = rows.filter((row) => foldByGroup.get(row.groupId) !== fold);
    const test = rows.filter((row) => foldByGroup.get(row.groupId) === fold);
    const trainPositives = train.filter((row) => row.event).length;
    if (test.length === 0 || trainPositives === 0 || trainPositives === train.length) {
      return { status: "ABSTAIN", rows: rows.length,
        disclosedRootComponents: groupIds.size, positives, negatives: rows.length - positives,
        featureCoverage: factorCoverage, selectedFactorIds: [],
        blockers: ["DETERMINISTIC_GROUP_FOLD_HAS_NO_TRAINING_CLASS_VARIATION"],
        foldFeatureSelectionUsesTrainingRowsOnly: true,
        retrospectiveTrajectoryFeaturesOnly: true,
        sourceRowsIndependentClaimed: false, causalEffectClaimed: false,
        externalValidationClaimed: false };
    }
    const featureIds = PREDICTIVE_FACTOR_IDS.filter((factorId) => {
      const values = train.map((row) => row.values[factorId]);
      return values.every(Number.isFinite) && new Set(values).size >= 2;
    });
    if (featureIds.length === 0 || test.some((row) =>
      featureIds.some((factorId) => !Number.isFinite(row.values[factorId])))) {
      return { status: "ABSTAIN", rows: rows.length,
        disclosedRootComponents: groupIds.size, positives, negatives: rows.length - positives,
        featureCoverage: factorCoverage, selectedFactorIds: [],
        blockers: [featureIds.length === 0
          ? "NO_TRAINING_FOLD_COMPLETE_NONCONSTANT_ELIGIBLE_FACTOR"
          : "OOF_TEST_ROW_MISSING_TRAINING_SELECTED_FACTOR"],
        foldFeatureSelectionUsesTrainingRowsOnly: true,
        retrospectiveTrajectoryFeaturesOnly: true,
        sourceRowsIndependentClaimed: false, causalEffectClaimed: false,
        externalValidationClaimed: false };
    }
    featureIds.forEach((factorId) => selectedAcrossFolds.add(factorId));
    const fit = fitLogistic(train, featureIds, ridge);
    if (fit === null || !fit.converged) {
      return { status: "ABSTAIN", rows: rows.length,
        disclosedRootComponents: groupIds.size, positives, negatives: rows.length - positives,
        featureCoverage: factorCoverage, selectedFactorIds: [...selectedAcrossFolds].sort(),
        blockers: [fit === null ? "LOGISTIC_INFORMATION_MATRIX_SINGULAR"
          : "LOGISTIC_FIT_DID_NOT_CONVERGE"],
        foldFeatureSelectionUsesTrainingRowsOnly: true,
        retrospectiveTrajectoryFeaturesOnly: true,
        sourceRowsIndependentClaimed: false, causalEffectClaimed: false,
        externalValidationClaimed: false };
    }
    const baseProbability = (trainPositives + 0.5) / (train.length + 1);
    for (const row of test) scored.push({ event: row.event,
      groupId: row.groupId, probability: fit.predict(row), baselineProbability: baseProbability });
    coefficients.push({ fold, trainRows: train.length, testRows: test.length,
      trainPositives, testPositives: test.filter((row) => row.event).length,
      selectedFactorIds: featureIds, converged: fit.converged, iterations: fit.iterations,
      finalMaxUpdate: fit.maxUpdate, intercept: fit.weights[0],
      standardized: Object.fromEntries(
        featureIds.map((id, index) => [id, fit.weights[index + 1]])) });
  }
  if (scored.length !== rows.length) throw new Error("FACTOR_PREDICTIVE_OOF_INCOMPLETE");
  const modelMetrics = metrics(scored);
  const baselineMetrics = metrics(scored.map((row) => ({ event: row.event,
    probability: row.baselineProbability })));
  return {
    status: "DESCRIPTIVE_INTERNAL_DISCLOSED_GROUP_HOLDOUT",
    rows: rows.length,
    disclosedRootComponents: groupIds.size,
    positives,
    negatives: rows.length - positives,
    folds,
    ridge,
    featureCoverage: factorCoverage,
    selectedFactorIds: [...selectedAcrossFolds].sort(),
    outOfFold: modelMetrics,
    jeffreysSmoothedTrainingFoldPrevalenceOutOfFold: baselineMetrics,
    descriptiveIncrement: {
      auc: modelMetrics.auc - baselineMetrics.auc,
      sampleBrier: modelMetrics.sampleBrier - baselineMetrics.sampleBrier,
      sampleLogLoss: modelMetrics.sampleLogLoss - baselineMetrics.sampleLogLoss,
    },
    foldStandardizedCoefficients: coefficients,
    predictionSetHash: digest("outsider/factor-shadow-oof-prediction-set/v1",
      scored.map((row) => ({ groupId: row.groupId, event: row.event,
        probability: row.probability, baselineProbability: row.baselineProbability }))
        .sort((left, right) => canonicalizeStrict(left).localeCompare(canonicalizeStrict(right)))),
    foldFeatureSelectionUsesTrainingRowsOnly: true,
    retrospectiveTrajectoryFeaturesOnly: true,
    correlationRootCompletenessEstablished: false,
    sourceRowsIndependentClaimed: false,
    causalEffectClaimed: false,
    externalValidationClaimed: false,
    realWorldFrequencyEstimated: false,
  };
}

function rowForModel(observation, groupId) {
  return {
    groupId,
    event: observation.consequence.event,
    syntheticOrSimulated: observation.reliability.syntheticOrSimulated === true,
    independentAdjudication: observation.consequence.independentAdjudication === true,
    nativeLabelClass: observation.reliability.nativeLabelClass,
    values: Object.fromEntries(PREDICTIVE_FACTOR_IDS.map((factorId) =>
      [factorId, numericFactor(observation.factors[factorId])])),
  };
}

function samplingBoundary(datasetId) {
  if (datasetId === "nebius/SWE-rebench-openhands-trajectories") {
    return {
      design: "STRATIFIED_EQUAL_CLASS_RESEARCH_SLICE",
      populationPrevalenceEligible: false,
      calibrationEligible: false,
    };
  }
  return {
    design: "PUBLIC_CONVENIENCE_OR_BENCHMARK_SAMPLE",
    populationPrevalenceEligible: false,
    calibrationEligible: false,
  };
}

const FIXED_INTERPRETATION = Object.freeze({
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
});

const FIXED_AUTHORITY = Object.freeze({ PRICE: false, coverage: false,
  GUARANTEE: false, SETTLE: false, automaticTraining: false, deployModel: false });

const FIXED_READINESS = Object.freeze({ ready: false, blockers: Object.freeze([
  "NO_EXTERNAL_TEMPORAL_CUSTOMER_HOLDOUT",
  "DISCLOSED_CORRELATION_ROOTS_ARE_INCOMPLETE",
  "RETROSPECTIVE_END_OF_TRAJECTORY_FACTORS_NOT_PRE_ACTION_RISK_FEATURES",
  "PROXY_OUTCOMES_ARE_NOT_ECONOMIC_LOSS",
  "NO_PRODUCTION_EXPOSURE_DENOMINATOR_OR_SEVERITY",
]) });

export async function buildKnownSourceFactorPredictiveShadow(options = {}) {
  const actuarial = await buildKnownSourceActuarialMechanismShadowReport(options);
  const structural = verifyActuarialMechanismShadowReport(actuarial);
  if (!structural.ok || actuarial.sourceAdmission.mode !== "KNOWN_SOURCE_REPLAYED_IN_PROCESS"
    || actuarial.sourceAdmission.sourceArtifactsReplayedInBuildProcess !== true) {
    throw new Error("FACTOR_PREDICTIVE_SOURCE_REPLAY_FAILED");
  }
  const modelObservations = actuarial.observations.filter((row) =>
    row.consequence.status === "OBSERVED_NATIVE_PROXY"
    && row.reliability.sourceReplayClassClaimed === "FULL_SOURCE_REPRODUCED");
  const outcomeBlindGroupIds = deriveOutcomeBlindPredictiveGroups(modelObservations);
  const cohorts = new Map();
  modelObservations.forEach((observation, index) => {
    const key = `${observation.datasetId}\0${observation.consequence.target}`;
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(rowForModel(observation, outcomeBlindGroupIds[index]));
  });
  const evaluations = [...cohorts.entries()].map(([key, rows]) => {
    const [datasetId, target] = key.split("\0");
    return { datasetId, target, samplingBoundary: samplingBoundary(datasetId),
      evidenceBoundary: {
        syntheticOrSimulatedRows: rows.filter((row) => row.syntheticOrSimulated).length,
        independentlyAdjudicatedRows: rows.filter((row) => row.independentAdjudication).length,
        nativeLabelClasses: [...new Set(rows.map((row) => row.nativeLabelClass))].sort(),
        economicLossRows: 0,
        monetarySeverityRows: 0,
        foldAssignmentUsesOnlyDatasetScopedDisclosedRoots: true,
        foldAssignmentUsesOutcomeOrFactorValues: false,
        disclosedRootOutcomeIndependenceExternallyVerified: false,
      },
      ...evaluateProxyFactorCohort({ rows }) };
  }).sort((left, right) => `${left.datasetId}\0${left.target}`
    .localeCompare(`${right.datasetId}\0${right.target}`));
  const body = {
    schema: FACTOR_PREDICTIVE_SHADOW_SCHEMA,
    schemaVersion: "1.0.0",
    mode: "SOURCE_SPECIFIC_PROXY_FACTOR_SENSITIVITY_ONLY",
    sourceBinding: {
      actuarialReportHash: actuarial.reportHash,
      factorSchemaHash: ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH,
      predictorPolicyHash: FACTOR_PREDICTIVE_POLICY_HASH,
      evaluatorImplementationHash: FACTOR_PREDICTIVE_IMPLEMENTATION_HASH,
      numericRuntime: FACTOR_PREDICTIVE_NUMERIC_RUNTIME,
      knownSourceReplayCompletedInBuildProcess: true,
      sourceArtifactsReverifiedByPersistedReportVerifier: false,
      replayReceiptHashes: actuarial.sourceAdmission.verificationReceipts
        .map((receipt) => receipt.receiptHash).sort(),
    },
    rowsObserved: actuarial.measurement.rows,
    nativeProxyRows: actuarial.consequenceModelAdmission.observedNativeProxyRows,
    cohorts: evaluations,
    evaluatedCohorts: evaluations.filter((item) => item.status
      === "DESCRIPTIVE_INTERNAL_DISCLOSED_GROUP_HOLDOUT").length,
    abstainedCohorts: evaluations.filter((item) => item.status === "ABSTAIN").length,
    interpretation: FIXED_INTERPRETATION,
    authority: FIXED_AUTHORITY,
    readiness: FIXED_READINESS,
  };
  return Object.freeze({ ...body,
    reportHash: digest(FACTOR_PREDICTIVE_SHADOW_SCHEMA, body) });
}

function safeInteger(value, minimum = 0) {
  return Number.isSafeInteger(value) && value >= minimum;
}

function validMetricSet(value) {
  return hasExactKeys(value, ["auc", "sampleBrier", "sampleLogLoss",
    "balancedAccuracyAtPointFive", "calibrationClaimed"])
    && (value.auc === null || (Number.isFinite(value.auc) && value.auc >= 0 && value.auc <= 1))
    && Number.isFinite(value.sampleBrier) && value.sampleBrier >= 0 && value.sampleBrier <= 1
    && Number.isFinite(value.sampleLogLoss) && value.sampleLogLoss >= 0
    && Number.isFinite(value.balancedAccuracyAtPointFive)
    && value.balancedAccuracyAtPointFive >= 0
    && value.balancedAccuracyAtPointFive <= 1
    && value.calibrationClaimed === false;
}

function validFeatureCoverage(items, rows) {
  return Array.isArray(items) && items.length === PREDICTIVE_FACTOR_IDS.length
    && canonicalEqual(items.map((item) => item.factorId).sort(), [...PREDICTIVE_FACTOR_IDS].sort())
    && items.every((item) => hasExactKeys(item,
      ["factorId", "measuredRows", "missingRows", "distinctValues"])
      && PREDICTIVE_FACTOR_IDS.includes(item.factorId)
      && safeInteger(item.measuredRows) && safeInteger(item.missingRows)
      && item.measuredRows + item.missingRows === rows
      && safeInteger(item.distinctValues) && item.distinctValues <= item.measuredRows);
}

function validCohort(cohort) {
  const proxyTargets = new Set(["USER_DISSATISFACTION_PROXY", "TASK_FAILURE_PROXY",
    "EXECUTION_ANOMALY_PROXY"]);
  const samplingDesigns = new Set(["STRATIFIED_EQUAL_CLASS_RESEARCH_SLICE",
    "PUBLIC_CONVENIENCE_OR_BENCHMARK_SAMPLE"]);
  const commonKeys = ["datasetId", "target", "samplingBoundary", "evidenceBoundary",
    "status", "rows", "disclosedRootComponents", "positives", "negatives",
    "featureCoverage", "selectedFactorIds", "foldFeatureSelectionUsesTrainingRowsOnly",
    "retrospectiveTrajectoryFeaturesOnly", "sourceRowsIndependentClaimed",
    "causalEffectClaimed", "externalValidationClaimed"];
  const evaluatedKeys = [...commonKeys, "folds", "ridge", "outOfFold",
    "jeffreysSmoothedTrainingFoldPrevalenceOutOfFold", "descriptiveIncrement",
    "foldStandardizedCoefficients", "predictionSetHash",
    "correlationRootCompletenessEstablished", "realWorldFrequencyEstimated"];
  const abstainKeys = [...commonKeys, "blockers"];
  if (!cohort || !["ABSTAIN", "DESCRIPTIVE_INTERNAL_DISCLOSED_GROUP_HOLDOUT"]
    .includes(cohort.status)
    || !hasExactKeys(cohort, cohort.status === "ABSTAIN" ? abstainKeys : evaluatedKeys)
    || typeof cohort.datasetId !== "string" || cohort.datasetId.length === 0
    || !proxyTargets.has(cohort.target)
    || !hasExactKeys(cohort.samplingBoundary,
      ["design", "populationPrevalenceEligible", "calibrationEligible"])
    || !samplingDesigns.has(cohort.samplingBoundary.design)
    || cohort.samplingBoundary.populationPrevalenceEligible !== false
    || cohort.samplingBoundary.calibrationEligible !== false
    || !hasExactKeys(cohort.evidenceBoundary, ["syntheticOrSimulatedRows",
      "independentlyAdjudicatedRows", "nativeLabelClasses", "economicLossRows",
      "monetarySeverityRows", "foldAssignmentUsesOnlyDatasetScopedDisclosedRoots",
      "foldAssignmentUsesOutcomeOrFactorValues",
      "disclosedRootOutcomeIndependenceExternallyVerified"])
    || !safeInteger(cohort.evidenceBoundary.syntheticOrSimulatedRows)
    || !safeInteger(cohort.evidenceBoundary.independentlyAdjudicatedRows)
    || cohort.evidenceBoundary.syntheticOrSimulatedRows > cohort.rows
    || cohort.evidenceBoundary.independentlyAdjudicatedRows > cohort.rows
    || !Array.isArray(cohort.evidenceBoundary.nativeLabelClasses)
    || cohort.evidenceBoundary.nativeLabelClasses.some((item) => typeof item !== "string")
    || cohort.evidenceBoundary.economicLossRows !== 0
    || cohort.evidenceBoundary.monetarySeverityRows !== 0
    || cohort.evidenceBoundary.foldAssignmentUsesOnlyDatasetScopedDisclosedRoots !== true
    || cohort.evidenceBoundary.foldAssignmentUsesOutcomeOrFactorValues !== false
    || cohort.evidenceBoundary.disclosedRootOutcomeIndependenceExternallyVerified !== false
    || !safeInteger(cohort.rows, 2) || !safeInteger(cohort.disclosedRootComponents, 1)
    || cohort.disclosedRootComponents > cohort.rows || !safeInteger(cohort.positives)
    || !safeInteger(cohort.negatives) || cohort.positives + cohort.negatives !== cohort.rows
    || !validFeatureCoverage(cohort.featureCoverage, cohort.rows)
    || !Array.isArray(cohort.selectedFactorIds)
    || new Set(cohort.selectedFactorIds).size !== cohort.selectedFactorIds.length
    || cohort.selectedFactorIds.some((id) => !PREDICTIVE_FACTOR_IDS.includes(id))
    || cohort.selectedFactorIds.includes("post_error_recovery_observed")
    || cohort.foldFeatureSelectionUsesTrainingRowsOnly !== true
    || cohort.retrospectiveTrajectoryFeaturesOnly !== true
    || cohort.sourceRowsIndependentClaimed !== false
    || cohort.causalEffectClaimed !== false || cohort.externalValidationClaimed !== false) {
    return false;
  }
  if (cohort.status === "ABSTAIN") {
    return Array.isArray(cohort.blockers) && cohort.blockers.length > 0
      && cohort.blockers.every((blocker) => typeof blocker === "string" && blocker.length > 0);
  }
  return cohort.folds === 5 && cohort.ridge === 1
    && validMetricSet(cohort.outOfFold)
    && validMetricSet(cohort.jeffreysSmoothedTrainingFoldPrevalenceOutOfFold)
    && hasExactKeys(cohort.descriptiveIncrement, ["auc", "sampleBrier", "sampleLogLoss"])
    && Object.values(cohort.descriptiveIncrement).every(Number.isFinite)
    && Array.isArray(cohort.foldStandardizedCoefficients)
    && cohort.foldStandardizedCoefficients.length === cohort.folds
    && cohort.foldStandardizedCoefficients.every((item, index) =>
      hasExactKeys(item, ["fold", "trainRows", "testRows", "trainPositives",
        "testPositives", "selectedFactorIds", "converged", "iterations",
        "finalMaxUpdate", "intercept", "standardized"])
      && item.fold === index && safeInteger(item.trainRows, 1) && safeInteger(item.testRows, 1)
      && item.trainRows + item.testRows === cohort.rows
      && safeInteger(item.trainPositives) && item.trainPositives <= item.trainRows
      && safeInteger(item.testPositives) && item.testPositives <= item.testRows
      && Array.isArray(item.selectedFactorIds) && item.selectedFactorIds.length > 0
      && item.selectedFactorIds.every((id) => PREDICTIVE_FACTOR_IDS.includes(id))
      && !item.selectedFactorIds.includes("post_error_recovery_observed")
      && item.converged === true && safeInteger(item.iterations, 1) && item.iterations <= 40
      && Number.isFinite(item.finalMaxUpdate) && item.finalMaxUpdate >= 0
      && item.finalMaxUpdate < 1e-8 && Number.isFinite(item.intercept)
      && hasExactKeys(item.standardized, item.selectedFactorIds)
      && Object.values(item.standardized).every(Number.isFinite))
    && isSha256(cohort.predictionSetHash)
    && cohort.correlationRootCompletenessEstablished === false
    && cohort.realWorldFrequencyEstimated === false;
}

/**
 * Verifies only a report's sealed structure and fixed no-authority boundary.
 * It deliberately does not authenticate source replay or recompute metrics.
 */
export function verifyFactorPredictiveShadowReport(report) {
  try {
    if (!hasExactKeys(report, ["schema", "schemaVersion", "mode", "sourceBinding",
      "rowsObserved", "nativeProxyRows", "cohorts", "evaluatedCohorts",
      "abstainedCohorts", "interpretation", "authority", "readiness", "reportHash"])
      || report.schema !== FACTOR_PREDICTIVE_SHADOW_SCHEMA
      || report.schemaVersion !== "1.0.0"
      || report.mode !== "SOURCE_SPECIFIC_PROXY_FACTOR_SENSITIVITY_ONLY"
      || !hasExactKeys(report.sourceBinding, ["actuarialReportHash", "factorSchemaHash",
        "predictorPolicyHash", "evaluatorImplementationHash", "numericRuntime",
        "knownSourceReplayCompletedInBuildProcess",
        "sourceArtifactsReverifiedByPersistedReportVerifier", "replayReceiptHashes"])
      || !isSha256(report.sourceBinding.actuarialReportHash)
      || report.sourceBinding.factorSchemaHash !== ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH
      || report.sourceBinding.predictorPolicyHash !== FACTOR_PREDICTIVE_POLICY_HASH
      || report.sourceBinding.evaluatorImplementationHash
        !== FACTOR_PREDICTIVE_IMPLEMENTATION_HASH
      || !canonicalEqual(report.sourceBinding.numericRuntime,
        FACTOR_PREDICTIVE_NUMERIC_RUNTIME)
      || report.sourceBinding.knownSourceReplayCompletedInBuildProcess !== true
      || report.sourceBinding.sourceArtifactsReverifiedByPersistedReportVerifier !== false
      || !Array.isArray(report.sourceBinding.replayReceiptHashes)
      || report.sourceBinding.replayReceiptHashes.length < 5
      || new Set(report.sourceBinding.replayReceiptHashes).size
        !== report.sourceBinding.replayReceiptHashes.length
      || report.sourceBinding.replayReceiptHashes.some((hash) => !isSha256(hash))
      || !safeInteger(report.rowsObserved, 1) || !safeInteger(report.nativeProxyRows)
      || report.nativeProxyRows > report.rowsObserved || !Array.isArray(report.cohorts)
      || !safeInteger(report.evaluatedCohorts) || !safeInteger(report.abstainedCohorts)
      || report.evaluatedCohorts + report.abstainedCohorts !== report.cohorts.length
      || report.cohorts.reduce((sum, cohort) => sum + (cohort?.rows ?? 0), 0)
        !== report.nativeProxyRows
      || new Set(report.cohorts.map((cohort) => `${cohort?.datasetId}\0${cohort?.target}`)).size
        !== report.cohorts.length
      || report.evaluatedCohorts !== report.cohorts.filter((cohort) =>
        cohort.status === "DESCRIPTIVE_INTERNAL_DISCLOSED_GROUP_HOLDOUT").length
      || report.abstainedCohorts !== report.cohorts.filter((cohort) =>
        cohort.status === "ABSTAIN").length
      || !report.cohorts.every(validCohort)
      || !canonicalEqual(report.interpretation, FIXED_INTERPRETATION)
      || !canonicalEqual(report.authority, FIXED_AUTHORITY)
      || !canonicalEqual(report.readiness, FIXED_READINESS)) {
      throw new Error("FACTOR_SHADOW_BOUNDARY_INVALID");
    }
    const { reportHash, ...body } = report;
    if (!isSha256(reportHash)
      || reportHash !== digest(FACTOR_PREDICTIVE_SHADOW_SCHEMA, body)) {
      throw new Error("FACTOR_SHADOW_HASH_INVALID");
    }
    return { ok: true, verificationLevel: "SELF_SEALED_STRUCTURE_ONLY",
      reportHashVerified: true, sourceArtifactsReverified: false,
      sourceReplayClaimAuthenticatedByThisVerifier: false,
      metricDerivationVerified: false, foldDerivationVerified: false,
      authorityBoundaryVerified: true };
  } catch (error) {
    return { ok: false, error: error.message, verificationLevel: "INVALID",
      sourceArtifactsReverified: false, metricDerivationVerified: false };
  }
}

/** Reopens all known sources, rebuilds the report, and compares exact bytes. */
export async function verifyKnownSourceFactorPredictiveShadowReport(report, options = {}) {
  const structural = verifyFactorPredictiveShadowReport(report);
  if (!structural.ok) return structural;
  try {
    const rebuilt = await buildKnownSourceFactorPredictiveShadow(options);
    if (!canonicalEqual(report, rebuilt)) throw new Error("FACTOR_SHADOW_SOURCE_REPLAY_MISMATCH");
    return { ok: true, verificationLevel: "FULL_KNOWN_SOURCE_REPRODUCED",
      reportHashVerified: true, sourceArtifactsReverified: true,
      sourceReplayClaimAuthenticatedByThisVerifier: true,
      metricDerivationVerified: true, foldDerivationVerified: true,
      authorityBoundaryVerified: true };
  } catch (error) {
    return { ok: false, error: error.message, verificationLevel: "INVALID",
      sourceArtifactsReverified: false, metricDerivationVerified: false };
  }
}
