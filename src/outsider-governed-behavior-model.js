/*
 * Governed behavior-model trainer v2.
 *
 * The legacy trainBehaviorModel performs a deterministic random ROW split.  It
 * remains useful as an exploratory baseline, but repeated executor/task/world
 * roots can cross that split and make its metrics optimistic.  This trainer is
 * deliberately stricter:
 *
 *   - explicit timestamps, domains, and correlation roots are mandatory;
 *   - rows connected by ANY known root stay in one component;
 *   - components are split in strict time order into train/calibration/test;
 *   - every test domain must be absent from train/calibration by default;
 *   - every split must contain a minimum number of both classes;
 *   - standardization and fitting use train only, Platt calibration uses
 *     calibration only, and metrics are computed once on test;
 *   - frozen-test row metrics are accompanied by an equal-total-weight per
 *     known-root connected-component description; neither produces inference;
 *   - a model card records what remains unestablished.
 *
 * Completed-run features are not pre-action features.  Even a successful v2
 * training run is therefore a retrospective shadow diagnostic, never a PRICE,
 * contract, control, or responsibility-bearing decision.
 * See docs/GOVERNED-BEHAVIOR-COMPONENT-BALANCED-HOLDOUT.md for the exact
 * finite-holdout estimand and weighting boundaries.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { featurizeRecord, RECORD_FEATURE_NAMES } from "./outsider-features.js";
import {
  applyStandardizer, auc as aucOf, calibrationError, fitStandardizer,
  logloss as loglossOf, predictFromRaw, serializeModel, trainLogistic,
} from "./outsider-model.js";
import {
  supervisedExperienceModelInput, verifySupervisedExperienceV2,
} from "./outsider-supervised-experience.js";

export const GOVERNED_BEHAVIOR_TRAINING_SCHEMA
  = "outsider/governed-behavior-training/v2";
export const GOVERNED_BEHAVIOR_MODEL_SCHEMA
  = "outsider/governed-logistic-behavior-model/v2";

const SIGNALS = new Set([
  "fakedSuccess", "neededCorrection", "escalated", "gatedIrreversible",
]);
const HASH = /^sha256:[a-f0-9]{64}$/u;
const PREREGISTRATION_SCHEMA = "outsider/governed-behavior-preregistration/v1";
const SPLIT_ASSIGNMENT_UNIT = "CONNECTED_COMPONENT_OF_ANY_KNOWN_CORRELATION_ROOT";
const SPLIT_ORDERING = "STRICT_COMPONENT_INTERVAL_TIME_ORDER";
const MODEL_FEATURE_TEMPORALITY
  = "COMPLETED_RUN_RETROSPECTIVE_FEATURES_NOT_PROSPECTIVELY_FROZEN_PRE_ACTION_FEATURES";
const MODEL_INTENDED_USE = "RETROSPECTIVE_SHADOW_BEHAVIOR_DIAGNOSTIC";
const TRAINING_POPULATION_BOUNDARY
  = "CALLER_SUPPLIED_HASH_BOUND_SUPERVISED_RECORDS_SOURCE_AUTHENTICATION_NOT_ESTABLISHED";
const TEMPORAL_HOLDOUT_BOUNDARY = "STRICT_OUT_OF_TIME_CONNECTED_COMPONENT_SPLIT";
const ROW_WEIGHTED_OBJECTIVE = "ROW_WEIGHTED_NOT_CLUSTER_BALANCED";
const ROW_WEIGHTED_METRIC = "ROW_WEIGHTED_DESCRIPTIVE_METRIC_NOT_CLUSTER_BALANCED";
const ROW_WEIGHTED_HOLDOUT = "ROW_WEIGHTED_DESCRIPTIVE_NOT_CLUSTER_ROBUST";
const COMPONENT_BALANCED_METRIC
  = "EQUAL_TOTAL_WEIGHT_PER_DECLARED_KNOWN_ROOT_CONNECTED_COMPONENT_DESCRIPTIVE";
const COMPONENT_BALANCED_HOLDOUT
  = "COMPONENT_BALANCED_DESCRIPTIVE_NOT_CLUSTER_ROBUST_INFERENCE";
const REQUIRED_NEXT_EVIDENCE = Object.freeze([
  "PROSPECTIVELY_FROZEN_FEATURE_SNAPSHOTS_BEFORE_LABEL_HORIZON",
  "EXTERNALLY_TIMESTAMPED_OUTCOME_BLIND_PREREGISTRATION",
  "SOURCE_AUTHENTICATION_AND_TRAINING_PRIVACY_RIGHTS",
  "LABEL_DEFINITION_FEATURE_OVERLAP_AUDIT",
  "COMPLETE_CORRELATION_ROOT_ATTESTATION",
  "CLUSTER_BALANCED_OR_HIERARCHICAL_FIT_AND_CLUSTER_ROBUST_EVALUATION",
  "LARGER_MULTI_DOMAIN_PROSPECTIVE_HOLDOUT",
  "PARAMETER_AND_MODEL_FORM_UNCERTAINTY",
  "PREREGISTERED_DRIFT_AND_RECALIBRATION_POLICY",
  "INDEPENDENT_MODEL_AND_AFFECTED_PARTY_REVIEW",
]);
const FIXED_FALSE_BOUNDARY_PATHS = Object.freeze([
  "preregistration.externalTimestampAuthorityVerified",
  "preregistration.outcomeBlindCreationVerified",
  "preregistration.hyperparametersSelectedBeforeHoldoutViewedEstablished",
  "split.rowRandomSplitUsed",
  "calibration.clusterRobustCalibrationInferenceEstablished",
  "calibration.populationCalibrationEstablished",
  "holdout.testRowsUsedForFitting",
  "holdout.testRowsUsedForCalibration",
  "holdout.clusterRobustInferenceEstablished",
  "holdout.futurePopulationCalibrationEstablished",
  "holdout.estimandContract.randomRow.populationInferenceEstablished",
  "holdout.estimandContract.randomRow.exchangeabilityEstablished",
  "holdout.estimandContract.randomRow.causalInterpretationEstablished",
  "holdout.estimandContract.observedKnownCorrelationComponents.populationInferenceEstablished",
  "holdout.estimandContract.observedKnownCorrelationComponents.exchangeabilityEstablished",
  "holdout.estimandContract.observedKnownCorrelationComponents.causalInterpretationEstablished",
  "holdout.estimandContract.newKnownCorrelationComponent.populationInferenceEstablished",
  "holdout.estimandContract.newKnownCorrelationComponent.componentSamplingFrameEstablished",
  "holdout.estimandContract.newKnownCorrelationComponent.exchangeabilityEstablished",
  "holdout.estimandContract.newKnownCorrelationComponent.newComponentGeneralizationEstablished",
  "holdout.estimandContract.newKnownCorrelationComponent.causalInterpretationEstablished",
  "holdout.estimandContract.newDomain.targetDomainSpecified",
  "holdout.estimandContract.newDomain.domainExchangeabilityEstablished",
  "holdout.estimandContract.newDomain.transportEstablished",
  "holdout.estimandContract.newDomain.targetPopulationPerformanceEstablished",
  "holdout.estimandContract.newDomain.causalInterpretationEstablished",
  "holdout.estimandContract.globalBoundaries.targetTransferEstablished",
  "holdout.estimandContract.globalBoundaries.priceUseEligible",
  "holdout.estimandContract.globalBoundaries.responsibilityUseEligible",
  "holdout.estimandContract.globalBoundaries.operationalAuthorityGranted",
  "model.preActionUseEligible",
  "model.contractMutationEligible",
  "model.priceUseEligible",
  "model.responsibilityUseEligible",
  "modelCard.sourceTruthReplayedByThisTrainer",
  "modelCard.trainingRightsEstablished",
  "modelCard.privacyPermissionEstablished",
  "modelCard.externallyTimestampedPreregistrationEstablished",
  "modelCard.correlationRootCompletenessEstablished",
  "modelCard.missingCostImputedAsZero",
  "modelCard.missingCostVsPeerImputedAsOne",
  "modelCard.anyImplicitFeatureImputationPerformed",
  "modelCard.postOutcomeFeaturesUsedAsPreActionFeatures",
  "modelCard.completedRunFeaturesAreProspectivePreActionFeatures",
  "modelCard.labelDefinitionFeatureOverlapExcluded",
  "modelCard.clusterRobustInferenceEstablished",
  "modelCard.randomRowPopulationInferenceEstablished",
  "modelCard.newKnownCorrelationComponentGeneralizationEstablished",
  "modelCard.newDomainTransportEstablished",
  "modelCard.parameterUncertaintyQuantified",
  "modelCard.modelFormUncertaintyQuantified",
  "modelCard.dataRevisionUncertaintyQuantified",
  "modelCard.targetTransferUncertaintyQuantified",
  "modelCard.driftMonitorEstablished",
  "modelCard.independentReviewCompleted",
  "modelCard.operationalAuthorityGranted",
  "governance.rowRandomSplitUsed",
  "governance.sourceTruthReplayed",
  "governance.externallyTimestampedPreregistrationEstablished",
  "governance.preActionUseEligible",
  "governance.responsibilityUseEligible",
  "governance.operationalAuthorityGranted",
]);
const FIXED_TRUE_BOUNDARY_PATHS = Object.freeze([
  "preregistration.registeredBeforeEveryAdmittedRecordByDeclaredTimestamps",
  "split.strictTemporalOrderEstablished",
  "calibration.calibrationRowsUsedOnlyForCalibrator",
  "holdout.descriptiveCalibrationSummaryLimitedToThisFrozenHoldout",
  "holdout.estimandContract.frozenHoldoutOnly",
  "holdout.estimandContract.randomRow.descriptiveOnly",
  "holdout.estimandContract.observedKnownCorrelationComponents.descriptiveOnly",
  "holdout.estimandContract.observedKnownCorrelationComponents.empiricalFunctionalOnly",
  "holdout.estimandContract.newKnownCorrelationComponent.noPointEstimateProduced",
  "holdout.estimandContract.newDomain.noPointEstimateProduced",
  "modelCard.knownCorrelationRootsPreserved",
  "modelCard.knownCorrelationRootLeakageAcrossSplitsPrevented",
  "modelCard.rareClassBearingComponentGuardAppliedToEverySplit",
  "modelCard.calibrationSetSeparateFromTest",
  "modelCard.simpleTrainingPrevalenceBaselineCompared",
  "modelCard.aleatoricUncertaintyRepresentedByBernoulliProbability",
  "governance.failClosed",
  "governance.knownCorrelationRootsPreserved",
  "governance.strictTemporalOrderEstablished",
  "governance.calibrationSplitEstablished",
  "governance.retrospectiveShadowUseAdmitted",
]);

function pathValue(root, path) {
  return path.split(".").reduce((value, key) => value?.[key], root);
}

function exactObjectKeys(value, keys, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || canonicalizeStrict(Object.keys(value).sort()) !== canonicalizeStrict([...keys].sort())) {
    throw new Error(`EXACT_KEYS_INVALID:${code}`);
  }
}

function exactStringSet(value, code, { hashes = false, allowEmpty = false } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)
    || value.some((item) => typeof item !== "string" || item.length === 0
      || item.includes("\0") || (hashes && !HASH.test(item)))) {
    throw new Error(`STRING_SET_INVALID:${code}`);
  }
  const sorted = [...new Set(value)].sort();
  if (canonicalizeStrict(value) !== canonicalizeStrict(sorted)) {
    throw new Error(`STRING_SET_NOT_SORTED_UNIQUE:${code}`);
  }
  return sorted;
}

function disjoint(left, right) {
  const values = new Set(left);
  return right.every((value) => !values.has(value));
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function finite(value, code) {
  if (!Number.isFinite(value)) throw new Error(`GOVERNED_BEHAVIOR_${code}`);
  return value;
}

function blocked(reasonCode, detail, accounting = null) {
  return {
    schema: GOVERNED_BEHAVIOR_TRAINING_SCHEMA,
    schemaVersion: "2.0.0",
    trained: false,
    reasonCode,
    reason: detail,
    accounting,
    governance: {
      failClosed: true,
      rowRandomSplitUsed: false,
      knownCorrelationRootsPreserved: false,
      strictTemporalOrderEstablished: false,
      outOfDomainHoldoutEstablished: false,
      calibrationSplitEstablished: false,
      sourceTruthReplayed: false,
      externallyTimestampedPreregistrationEstablished: false,
      responsibilityUseEligible: false,
      operationalAuthorityGranted: false,
    },
  };
}

function timestamp(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null;
  const normalized = new Date(value).toISOString();
  return normalized === value ? normalized : null;
}

function featureContract(record) {
  const features = record?.features;
  const world = record?.world;
  const missing = [];
  if (!Number.isSafeInteger(features?.nSteps) || features.nSteps < 0) missing.push("nSteps");
  if (!Number.isFinite(features?.costUsd) || features.costUsd < 0) missing.push("costUsd");
  if (!Number.isFinite(features?.costVsPeer) || features.costVsPeer < 0) {
    missing.push("costVsPeer");
  }
  for (const key of ["claimedPass", "claimedDone", "ranTestClaim"]) {
    if (typeof features?.[key] !== "boolean") missing.push(key);
  }
  if (typeof world?.reversible !== "boolean") missing.push("world.reversible");
  if (typeof world?.externality !== "boolean") missing.push("world.externality");
  return { complete: missing.length === 0, missing };
}

function hashRoot(value) {
  if (typeof value !== "string" || value.length === 0 || value.includes("\0")) return null;
  return digest("outsider/governed-behavior-correlation-root/v1", value);
}

function normalizeV2(record, index) {
  const checked = verifySupervisedExperienceV2(record);
  if (!checked.ok) return { error: "SUPERVISED_EXPERIENCE_INVALID", detail: checked.error };
  const normalized = supervisedExperienceModelInput(record);
  const observedAt = timestamp(record.source?.observedAt);
  const groupKey = record.attestationCompatibility?.groupKey;
  const roots = groupKey && typeof groupKey === "object"
    ? Object.entries(groupKey).filter(([key]) => [
      "controllerImplementationHash", "wayHash", "claimRefHash", "worldRefHash",
      "authorityRefHash",
    ].includes(key)).map(([, value]) => hashRoot(value)).filter(Boolean)
    : [];
  const domain = normalized.world?.kind ?? normalized.worldKind ?? null;
  const featureCheck = featureContract(normalized);
  if (!observedAt || roots.length === 0 || typeof domain !== "string" || domain.length === 0) {
    return { error: "GOVERNANCE_METADATA_INCOMPLETE",
      detail: `record ${index} lacks canonical time, known roots, or domain` };
  }
  if (!featureCheck.complete) {
    return { error: "FEATURE_MISSINGNESS_NOT_EXPLICITLY_MODELLED",
      detail: `record ${index}:${featureCheck.missing.join(",")}` };
  }
  return {
    normalized,
    observedAt,
    observedAtMs: Date.parse(observedAt),
    roots: [...new Set(roots)].sort(),
    domain,
    recordHash: record.recordHash,
    sourceSchema: record.schema,
  };
}

function normalizeV1(record, index) {
  if (record?.schema !== "outsider/experience/v1") {
    return { error: "RECORD_SCHEMA_INVALID", detail: `record ${index}` };
  }
  const governance = record.governance;
  const observedAt = timestamp(governance?.observedAt);
  const roots = Array.isArray(governance?.correlationRoots)
    ? governance.correlationRoots.map(hashRoot).filter(Boolean) : [];
  const domain = governance?.domainId;
  const featureCheck = featureContract(record);
  if (!observedAt || roots.length === 0 || typeof domain !== "string" || domain.length === 0) {
    return { error: "GOVERNANCE_METADATA_INCOMPLETE",
      detail: `record ${index} requires governance.observedAt, correlationRoots, and domainId` };
  }
  if (!featureCheck.complete) {
    return { error: "FEATURE_MISSINGNESS_NOT_EXPLICITLY_MODELLED",
      detail: `record ${index}:${featureCheck.missing.join(",")}` };
  }
  return {
    normalized: record,
    observedAt,
    observedAtMs: Date.parse(observedAt),
    roots: [...new Set(roots)].sort(),
    domain,
    recordHash: digest("outsider/governed-behavior-input-record/v1", record),
    sourceSchema: record.schema,
  };
}

function normalizeRecords(records, signal) {
  if (!Array.isArray(records)) return { error: "RECORDS_NOT_ARRAY", detail: "input" };
  const entries = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const entry = record?.schema === "outsider/supervised-experience/v2"
      ? normalizeV2(record, index) : normalizeV1(record, index);
    if (entry.error) return entry;
    const label = entry.normalized?.labels?.[signal];
    if (typeof label !== "boolean") {
      return { error: "LABEL_NOT_BOOLEAN", detail: `record ${index}:${signal}` };
    }
    entries.push({ ...entry, label: label ? 1 : 0, originalIndex: index });
  }
  return { entries };
}

class UnionFind {
  constructor(size) {
    this.parent = [...Array(size).keys()];
    this.rank = new Array(size).fill(0);
  }
  find(value) {
    let cursor = value;
    while (this.parent[cursor] !== cursor) cursor = this.parent[cursor];
    while (this.parent[value] !== value) {
      const next = this.parent[value];
      this.parent[value] = cursor;
      value = next;
    }
    return cursor;
  }
  union(left, right) {
    let a = this.find(left), b = this.find(right);
    if (a === b) return;
    if (this.rank[a] < this.rank[b]) [a, b] = [b, a];
    this.parent[b] = a;
    if (this.rank[a] === this.rank[b]) this.rank[a] += 1;
  }
}

function connectedComponents(entries) {
  const union = new UnionFind(entries.length);
  const owner = new Map();
  entries.forEach((entry, index) => {
    for (const root of entry.roots) {
      if (owner.has(root)) union.union(index, owner.get(root));
      else owner.set(root, index);
    }
  });
  const components = new Map();
  entries.forEach((entry, index) => {
    const root = union.find(index);
    const rows = components.get(root) ?? [];
    rows.push(entry);
    components.set(root, rows);
  });
  return [...components.values()].map((rows) => {
    const rootHashes = [...new Set(rows.flatMap((row) => row.roots))].sort();
    const recordHashes = rows.map((row) => row.recordHash).sort();
    return {
      componentHash: digest("outsider/governed-behavior-component/v1",
        { rootHashes, recordHashes }),
      rows: rows.sort((a, b) => a.observedAtMs - b.observedAtMs
        || a.recordHash.localeCompare(b.recordHash)),
      rootHashes,
      recordHashes,
      domains: [...new Set(rows.map((row) => row.domain))].sort(),
      minimumObservedAt: rows.reduce((min, row) => row.observedAt < min
        ? row.observedAt : min, rows[0].observedAt),
      maximumObservedAt: rows.reduce((max, row) => row.observedAt > max
        ? row.observedAt : max, rows[0].observedAt),
    };
  }).sort((left, right) => left.minimumObservedAt.localeCompare(right.minimumObservedAt)
    || left.maximumObservedAt.localeCompare(right.maximumObservedAt)
    || left.componentHash.localeCompare(right.componentHash));
}

function splitComponents(components, calibrationFrac, testFrac) {
  const count = components.length;
  const testCount = Math.max(1, Math.floor(count * testFrac));
  const calibrationCount = Math.max(1, Math.floor(count * calibrationFrac));
  const trainCount = count - testCount - calibrationCount;
  if (trainCount < 1) return null;
  return {
    train: components.slice(0, trainCount),
    calibration: components.slice(trainCount, trainCount + calibrationCount),
    test: components.slice(trainCount + calibrationCount),
  };
}

function splitRows(components) {
  return components.flatMap((component) => component.rows.map((row) => ({
    ...row, componentHash: component.componentHash,
  })));
}

function splitSummary(name, components) {
  const rows = splitRows(components);
  const positives = rows.reduce((sum, row) => sum + row.label, 0);
  const allRoots = new Set(components.flatMap((component) => component.rootHashes));
  const positiveBearingComponents = components.filter((component) =>
    component.rows.some((row) => row.label === 1)).length;
  const negativeBearingComponents = components.filter((component) =>
    component.rows.some((row) => row.label === 0)).length;
  const componentSupport = components.map((component) => {
    const componentPositives = component.rows.reduce((sum, row) => sum + row.label, 0);
    return {
      componentHash: component.componentHash,
      rootHashes: [...component.rootHashes],
      recordHashes: [...component.recordHashes],
      rows: component.rows.length,
      positives: componentPositives,
      negatives: component.rows.length - componentPositives,
      domains: [...component.domains],
      minimumObservedAt: component.minimumObservedAt,
      maximumObservedAt: component.maximumObservedAt,
    };
  });
  return {
    name,
    components: components.length,
    declaredKnownRootConnectedComponents: components.length,
    effectiveIndependentComponentCount: null,
    independenceBeyondDeclaredKnownRootsEstablished: false,
    rows: rows.length,
    positives,
    negatives: rows.length - positives,
    positiveBearingComponents,
    negativeBearingComponents,
    mixedClassComponents: components.filter((component) => {
      const labels = new Set(component.rows.map((row) => row.label));
      return labels.size > 1;
    }).length,
    maximumRowsInOneComponent: Math.max(...components.map((component) =>
      component.rows.length)),
    knownCorrelationRoots: allRoots.size,
    domains: [...new Set(rows.map((row) => row.domain))].sort(),
    minimumObservedAt: rows.reduce((min, row) => row.observedAt < min
      ? row.observedAt : min, rows[0].observedAt),
    maximumObservedAt: rows.reduce((max, row) => row.observedAt > max
      ? row.observedAt : max, rows[0].observedAt),
    componentHashes: components.map((component) => component.componentHash),
    recordHashes: rows.map((row) => row.recordHash).sort(),
    componentSupport,
  };
}

function rootOverlap(left, right) {
  const roots = new Set(left.flatMap((component) => component.rootHashes));
  return new Set(right.flatMap((component) => component.rootHashes)
    .filter((root) => roots.has(root))).size;
}

function classGuard(summary, minimum) {
  return summary.positiveBearingComponents >= minimum
    && summary.negativeBearingComponents >= minimum;
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

function clip(value, epsilon = 1e-12) {
  return Math.min(1 - epsilon, Math.max(epsilon, value));
}

function logit(value) {
  const p = clip(value);
  return Math.log(p / (1 - p));
}

function plattCalibrator(scores, labels, options) {
  const raw = scores.map((score) => [logit(score)]);
  const standardizer = fitStandardizer(raw);
  const fitted = trainLogistic(applyStandardizer(raw, standardizer), labels, {
    l2: options.l2,
    lr: options.lr,
    epochs: options.epochs,
    seed: options.seed + 10_003,
  });
  return {
    method: "PLATT_LOGISTIC_ON_CALIBRATION_SPLIT_ONLY",
    weight: fitted.weights[0],
    bias: fitted.bias,
    inputStandardizer: standardizer,
  };
}

function applyPlatt(calibrator, probability) {
  const raw = logit(probability);
  const standardized = (raw - calibrator.inputStandardizer.mean[0])
    / calibrator.inputStandardizer.std[0];
  return sigmoid(calibrator.bias + calibrator.weight * standardized);
}

function brier(scores, labels) {
  return scores.reduce((sum, score, index) =>
    sum + (score - labels[index]) ** 2, 0) / scores.length;
}

function componentBalancedWeights(componentHashes) {
  if (!Array.isArray(componentHashes) || componentHashes.length === 0) {
    throw new Error("GOVERNED_BEHAVIOR_COMPONENT_BALANCED_WEIGHTS_INVALID");
  }
  const counts = new Map();
  for (const componentHash of componentHashes) {
    if (!HASH.test(componentHash ?? "")) {
      throw new Error("GOVERNED_BEHAVIOR_COMPONENT_BALANCED_WEIGHTS_INVALID");
    }
    counts.set(componentHash, (counts.get(componentHash) ?? 0) + 1);
  }
  const componentCount = counts.size;
  return {
    componentCount,
    weights: componentHashes.map((componentHash) =>
      1 / (componentCount * counts.get(componentHash))),
  };
}

function weightedMean(values, weights) {
  let weightedSum = 0, weightSum = 0;
  for (let index = 0; index < values.length; index += 1) {
    weightedSum += values[index] * weights[index];
    weightSum += weights[index];
  }
  return weightedSum / weightSum;
}

function weightedAuc(scores, labels, weights) {
  const rows = scores.map((score, index) => ({
    score, label: labels[index], weight: weights[index],
  })).sort((left, right) => left.score - right.score);
  const positiveWeight = rows.reduce((sum, row) =>
    sum + (row.label === 1 ? row.weight : 0), 0);
  const negativeWeight = rows.reduce((sum, row) =>
    sum + (row.label === 0 ? row.weight : 0), 0);
  if (!(positiveWeight > 0) || !(negativeWeight > 0)) return null;
  let concordantWeight = 0, lowerNegativeWeight = 0, index = 0;
  while (index < rows.length) {
    let end = index;
    let tiedPositiveWeight = 0, tiedNegativeWeight = 0;
    while (end < rows.length && rows[end].score === rows[index].score) {
      if (rows[end].label === 1) tiedPositiveWeight += rows[end].weight;
      else tiedNegativeWeight += rows[end].weight;
      end += 1;
    }
    concordantWeight += tiedPositiveWeight
      * (lowerNegativeWeight + 0.5 * tiedNegativeWeight);
    lowerNegativeWeight += tiedNegativeWeight;
    index = end;
  }
  return Math.min(1, Math.max(0,
    concordantWeight / (positiveWeight * negativeWeight)));
}

function weightedCalibrationError(scores, labels, weights, binCount = 10) {
  const bins = Array.from({ length: binCount }, () => ({
    weight: 0, weightedLabels: 0, weightedScores: 0,
  }));
  let totalWeight = 0;
  scores.forEach((score, index) => {
    const bin = bins[Math.min(binCount - 1, Math.floor(score * binCount))];
    const weight = weights[index];
    bin.weight += weight;
    bin.weightedLabels += weight * labels[index];
    bin.weightedScores += weight * score;
    totalWeight += weight;
  });
  const result = bins.reduce((sum, bin) => bin.weight === 0 ? sum
    : sum + (bin.weight / totalWeight)
      * Math.abs(bin.weightedLabels / bin.weight - bin.weightedScores / bin.weight), 0);
  return Math.min(1, Math.max(0, result));
}

function componentBalancedMetrics(scores, labels, componentHashes) {
  if (!Array.isArray(scores) || !Array.isArray(labels)
    || scores.length === 0 || labels.length !== scores.length
    || !scores.every((score) => Number.isFinite(score) && score >= 0 && score <= 1)
    || !labels.every((label) => label === 0 || label === 1)
    || !Array.isArray(componentHashes) || componentHashes.length !== scores.length) {
    throw new Error("GOVERNED_BEHAVIOR_COMPONENT_BALANCED_METRIC_INPUT_INVALID");
  }
  const { componentCount, weights } = componentBalancedWeights(componentHashes);
  const positiveCount = labels.reduce((sum, value) => sum + value, 0);
  return {
    auc: weightedAuc(scores, labels, weights),
    logloss: weightedMean(scores.map((score, index) => labels[index]
      ? -Math.log(clip(score)) : -Math.log(1 - clip(score))), weights),
    brier: weightedMean(scores.map((score, index) =>
      (score - labels[index]) ** 2), weights),
    expectedCalibrationError10Bins:
      weightedCalibrationError(scores, labels, weights, 10),
    rows: labels.length,
    positives: positiveCount,
    negatives: labels.length - positiveCount,
    weighting: COMPONENT_BALANCED_METRIC,
    declaredKnownRootConnectedComponents: componentCount,
    eachComponentTotalWeight: 1 / componentCount,
    withinComponentRowWeightFormula:
      "ONE_DIVIDED_BY_PRODUCT_OF_COMPONENT_COUNT_AND_ROWS_IN_COMPONENT",
    eachObservedComponentHasEqualMarginalRowWeight: true,
    aucUsesClassConditionalWeightNormalization: true,
    equalPairwiseAucContributionPerComponentEstablished: false,
    descriptiveOnly: true,
    confidenceInterval: null,
    effectiveIndependentComponentCount: null,
    clusterRobustInferenceEstablished: false,
    exchangeabilityEstablished: false,
    newComponentGeneralizationEstablished: false,
    domainTransportEstablished: false,
  };
}

function metrics(scores, labels, componentHashes) {
  if (!Array.isArray(componentHashes) || componentHashes.length !== scores.length) {
    throw new Error("GOVERNED_BEHAVIOR_METRIC_COMPONENT_BINDING_INVALID");
  }
  const components = new Set(componentHashes).size;
  return {
    auc: aucOf(scores, labels),
    logloss: loglossOf(scores, labels),
    brier: brier(scores, labels),
    expectedCalibrationError10Bins: calibrationError(scores, labels, 10),
    rows: labels.length,
    positives: labels.reduce((sum, value) => sum + value, 0),
    negatives: labels.length - labels.reduce((sum, value) => sum + value, 0),
    weighting: ROW_WEIGHTED_METRIC,
    declaredKnownRootConnectedComponents: components,
    effectiveIndependentComponentCount: null,
    clusterRobustInferenceEstablished: false,
  };
}

function reliabilityBins(scores, labels, componentHashes, binCount = 10) {
  if (!Array.isArray(componentHashes) || componentHashes.length !== scores.length) {
    throw new Error("GOVERNED_BEHAVIOR_RELIABILITY_COMPONENT_BINDING_INVALID");
  }
  const bins = Array.from({ length: binCount }, (_, index) => ({
    index, count: 0, probabilitySum: 0, positives: 0, componentHashes: [],
  }));
  scores.forEach((score, index) => {
    const bin = Math.min(binCount - 1, Math.floor(score * binCount));
    bins[bin].count += 1;
    bins[bin].probabilitySum += score;
    bins[bin].positives += labels[index];
    bins[bin].componentHashes.push(componentHashes[index]);
  });
  return bins.filter((bin) => bin.count > 0).map((bin) => ({
    bin: bin.index,
    rows: bin.count,
    meanPredictedProbability: bin.probabilitySum / bin.count,
    observedRate: bin.positives / bin.count,
    knownRootConnectedComponentsRepresented: new Set(bin.componentHashes).size,
    rowWeightedDescriptiveOnly: true,
    naiveRowWilson95IgnoringWithinComponentDependence: null,
    clusterRobustInterval: null,
    clusterRobustInferenceEstablished: false,
  }));
}

function holdoutEstimandContract() {
  return {
    schema: "outsider/governed-behavior-holdout-estimand-contract/v1",
    frozenHoldoutOnly: true,
    randomRow: {
      estimand:
        "ROW_WEIGHTED_DESCRIPTIVE_FUNCTIONAL_OVER_OBSERVED_FROZEN_HOLDOUT_ROWS",
      targetUnit: "ROW",
      reportedMetricPaths: ["holdout.trainingPrevalenceBaselineMetrics",
        "holdout.uncalibratedMetrics", "holdout.calibratedMetrics"],
      weighting: ROW_WEIGHTED_METRIC,
      descriptiveOnly: true,
      confidenceInterval: null,
      populationInferenceEstablished: false,
      exchangeabilityEstablished: false,
      causalInterpretationEstablished: false,
    },
    observedKnownCorrelationComponents: {
      estimand:
        "EQUAL_COMPONENT_MASS_DESCRIPTIVE_FUNCTIONAL_OVER_OBSERVED_FROZEN_HOLDOUT_COMPONENTS",
      targetUnit: SPLIT_ASSIGNMENT_UNIT,
      reportedMetricPaths: ["holdout.trainingPrevalenceBaselineComponentBalancedMetrics",
        "holdout.uncalibratedComponentBalancedMetrics",
        "holdout.calibratedComponentBalancedMetrics"],
      weighting: COMPONENT_BALANCED_METRIC,
      withinComponentWeighting:
        "ROW_WEIGHT_IS_ONE_OVER_PRODUCT_OF_COMPONENT_COUNT_AND_COMPONENT_ROW_COUNT",
      descriptiveOnly: true,
      empiricalFunctionalOnly: true,
      confidenceInterval: null,
      populationInferenceEstablished: false,
      exchangeabilityEstablished: false,
      causalInterpretationEstablished: false,
    },
    newKnownCorrelationComponent: {
      estimand:
        "EXPECTED_PREDICTIVE_PERFORMANCE_FOR_A_NEW_KNOWN_CORRELATION_COMPONENT",
      targetUnit: SPLIT_ASSIGNMENT_UNIT,
      reportedMetricPaths: [],
      estimate: null,
      confidenceInterval: null,
      noPointEstimateProduced: true,
      componentSamplingFrameEstablished: false,
      populationInferenceEstablished: false,
      exchangeabilityEstablished: false,
      newComponentGeneralizationEstablished: false,
      causalInterpretationEstablished: false,
    },
    newDomain: {
      estimand: "EXPECTED_PERFORMANCE_FOR_A_NEW_DOMAIN",
      targetUnit: "DOMAIN",
      reportedMetricPaths: [],
      estimate: null,
      confidenceInterval: null,
      noPointEstimateProduced: true,
      targetDomainSpecified: false,
      domainExchangeabilityEstablished: false,
      transportEstablished: false,
      targetPopulationPerformanceEstablished: false,
      causalInterpretationEstablished: false,
    },
    globalBoundaries: {
      targetTransferEstablished: false,
      priceUseEligible: false,
      responsibilityUseEligible: false,
      operationalAuthorityGranted: false,
    },
  };
}

function modelWithHash(body) {
  return { ...body, modelHash: digest(GOVERNED_BEHAVIOR_MODEL_SCHEMA, body) };
}

export function buildGovernedBehaviorPreregistration(options = {}) {
  const defaults = {
    signal: options.signal ?? "fakedSuccess",
    calibrationFrac: options.calibrationFrac ?? 0.2,
    testFrac: options.testFrac ?? 0.2,
    minRecords: options.minRecords ?? 60,
    minComponents: options.minComponents ?? 12,
    minClassPerSplit: options.minClassPerSplit ?? 3,
    requireOutOfDomainHoldout: options.requireOutOfDomainHoldout ?? true,
    l2: options.l2 ?? 1e-3,
    lr: options.lr ?? 0.2,
    epochs: options.epochs ?? 200,
    seed: options.seed ?? 13,
  };
  const allowed = new Set(["registeredAt", ...Object.keys(defaults)]);
  if (Object.keys(options).some((key) => !allowed.has(key))) {
    throw new Error("GOVERNED_BEHAVIOR_PREREGISTRATION_OPTIONS_UNKNOWN");
  }
  const registeredAt = timestamp(options.registeredAt);
  if (!registeredAt || !SIGNALS.has(defaults.signal)
    || !(defaults.calibrationFrac > 0 && defaults.calibrationFrac < 0.5)
    || !(defaults.testFrac > 0 && defaults.testFrac < 0.5)
    || defaults.calibrationFrac + defaults.testFrac >= 0.75
    || !Number.isSafeInteger(defaults.minRecords) || defaults.minRecords < 6
    || !Number.isSafeInteger(defaults.minComponents) || defaults.minComponents < 3
    || !Number.isSafeInteger(defaults.minClassPerSplit) || defaults.minClassPerSplit < 1
    || typeof defaults.requireOutOfDomainHoldout !== "boolean"
    || !Number.isFinite(defaults.l2) || defaults.l2 < 0
    || !Number.isFinite(defaults.lr) || defaults.lr <= 0
    || !Number.isSafeInteger(defaults.epochs) || defaults.epochs < 1
    || !Number.isSafeInteger(defaults.seed)) {
    throw new Error("GOVERNED_BEHAVIOR_PREREGISTRATION_INVALID");
  }
  const body = {
    schema: PREREGISTRATION_SCHEMA,
    schemaVersion: "1.0.0",
    registeredAt,
    configuration: defaults,
    featureContract: {
      requiredObservedFields: ["nSteps", "costUsd", "costVsPeer", "claimedPass",
        "claimedDone", "ranTestClaim", "world.reversible", "world.externality"],
      nullCostMeansZero: false,
      nullCostVsPeerMeansOne: false,
      implicitMissingValueImputationPermitted: false,
      featureTiming: "COMPLETED_RUN_POST_ACTION_RETROSPECTIVE_ONLY",
      preActionPredictionClaimed: false,
    },
    splitContract: {
      assignmentUnit: SPLIT_ASSIGNMENT_UNIT,
      strictTemporalOrderRequired: true,
      separateCalibrationSplitRequired: true,
      testNeverUsedForFitOrCalibration: true,
      rareClassMinimumAppliedToEverySplit: true,
      rareClassSupportUnit: "POSITIVE_AND_NEGATIVE_BEARING_CONNECTED_COMPONENT",
    },
    promotionBoundary: {
      externallyTimestampedPreregistrationEstablished: false,
      sourceTruthReplayed: false,
      trainingRightsEstablished: false,
      responsibilityUseEligible: false,
      operationalAuthorityGranted: false,
    },
  };
  return { ...body,
    preregistrationHash: digest(PREREGISTRATION_SCHEMA, body) };
}

function verifiedPreregistration(value) {
  try {
    if (value?.schema !== PREREGISTRATION_SCHEMA || value.schemaVersion !== "1.0.0"
      || !HASH.test(value.preregistrationHash ?? "")
      || typeof value.configuration !== "object" || value.configuration === null) return null;
    const rebuilt = buildGovernedBehaviorPreregistration({
      registeredAt: value.registeredAt,
      ...value.configuration,
    });
    if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(value)) return null;
    return value.configuration;
  } catch {
    return null;
  }
}

export function trainGovernedBehaviorModel(records, options = {}) {
  const allowed = new Set(["preregistration"]);
  const unknown = Object.keys(options).filter((key) => !allowed.has(key));
  if (unknown.length > 0) return blocked("OPTIONS_UNKNOWN", unknown.sort().join(","));
  const config = verifiedPreregistration(options.preregistration);
  if (!config) return blocked("PREREGISTRATION_INVALID_OR_MISSING",
    "a hash-valid governed preregistration is required");

  const normalized = normalizeRecords(records, config.signal);
  if (normalized.error) return blocked(normalized.error, normalized.detail);
  const entries = normalized.entries;
  if (entries.some((entry) => entry.observedAt <= options.preregistration.registeredAt)) {
    return blocked("PREREGISTRATION_NOT_BEFORE_ALL_OUTCOMES",
      "registeredAt must precede every admitted record observation");
  }
  if (entries.length < config.minRecords) {
    return blocked("RECORD_COUNT_INSUFFICIENT",
      `need at least ${config.minRecords}, have ${entries.length}`,
      { rows: entries.length });
  }
  const recordHashCounts = new Map();
  for (const entry of entries) {
    recordHashCounts.set(entry.recordHash, (recordHashCounts.get(entry.recordHash) ?? 0) + 1);
  }
  const duplicateRecordHashes = [...recordHashCounts.entries()]
    .filter(([, count]) => count > 1).map(([recordHash]) => recordHash).sort();
  if (duplicateRecordHashes.length > 0) {
    return blocked("DUPLICATE_RECORD_HASH",
      "exact duplicate supervised records cannot be multiplied as training weight",
      { rows: entries.length, duplicateRecordHashes });
  }
  const components = connectedComponents(entries);
  if (components.length < config.minComponents) {
    return blocked("INDEPENDENT_COMPONENT_COUNT_INSUFFICIENT",
      `need at least ${config.minComponents}, have ${components.length}`,
      { rows: entries.length, components: components.length });
  }
  const split = splitComponents(components, config.calibrationFrac, config.testFrac);
  if (!split) return blocked("SPLIT_COMPONENT_COUNT_INSUFFICIENT", "no train components");
  const summaries = {
    train: splitSummary("TRAIN", split.train),
    calibration: splitSummary("CALIBRATION", split.calibration),
    test: splitSummary("TEST", split.test),
  };
  const overlaps = {
    trainCalibration: rootOverlap(split.train, split.calibration),
    trainTest: rootOverlap(split.train, split.test),
    calibrationTest: rootOverlap(split.calibration, split.test),
  };
  if (Object.values(overlaps).some((value) => value !== 0)) {
    return blocked("CORRELATION_ROOT_LEAKAGE", "a known root crossed splits",
      { summaries, overlaps });
  }
  const strictTemporal = summaries.train.maximumObservedAt
      < summaries.calibration.minimumObservedAt
    && summaries.calibration.maximumObservedAt < summaries.test.minimumObservedAt;
  if (!strictTemporal) {
    return blocked("STRICT_TEMPORAL_SPLIT_UNAVAILABLE",
      "connected-component time intervals overlap split boundaries",
      { summaries, overlaps });
  }
  for (const summary of Object.values(summaries)) {
    if (!classGuard(summary, config.minClassPerSplit)) {
      return blocked("RARE_CLASS_SPLIT_SUPPORT_INSUFFICIENT",
        `${summary.name} needs at least ${config.minClassPerSplit} positive-bearing and negative-bearing connected components`,
        { summaries, overlaps });
    }
  }
  const learningDomains = new Set([
    ...summaries.train.domains, ...summaries.calibration.domains,
  ]);
  const heldOutDomains = summaries.test.domains.filter((domain) => !learningDomains.has(domain));
  const testDomainsSeenDuringLearning = summaries.test.domains
    .filter((domain) => learningDomains.has(domain));
  if (config.requireOutOfDomainHoldout
    && (heldOutDomains.length === 0 || testDomainsSeenDuringLearning.length > 0)) {
    return blocked("OUT_OF_DOMAIN_HOLDOUT_UNAVAILABLE",
      "every test domain must be absent from train and calibration",
      { summaries, overlaps, heldOutDomains, testDomainsSeenDuringLearning });
  }

  const trainRows = splitRows(split.train);
  const calibrationRows = splitRows(split.calibration);
  const testRows = splitRows(split.test);
  const XtrainRaw = trainRows.map((row) => featurizeRecord(row.normalized));
  const yTrain = trainRows.map((row) => row.label);
  const standardizer = fitStandardizer(XtrainRaw);
  const fitted = trainLogistic(applyStandardizer(XtrainRaw, standardizer), yTrain, {
    l2: config.l2, lr: config.lr, epochs: config.epochs, seed: config.seed,
  });
  const underlying = serializeModel(fitted, standardizer, RECORD_FEATURE_NAMES, {
    signal: config.signal,
    nTrain: trainRows.length,
    governedTrainingSchema: GOVERNED_BEHAVIOR_TRAINING_SCHEMA,
  });
  const calibrationUncalibrated = calibrationRows.map((row) =>
    predictFromRaw(underlying, featurizeRecord(row.normalized)));
  const yCalibration = calibrationRows.map((row) => row.label);
  const calibrator = plattCalibrator(calibrationUncalibrated, yCalibration, config);
  const testUncalibrated = testRows.map((row) =>
    predictFromRaw(underlying, featurizeRecord(row.normalized)));
  const testCalibrated = testUncalibrated.map((score) => applyPlatt(calibrator, score));
  const yTest = testRows.map((row) => row.label);
  const calibrationComponentHashes = calibrationRows.map((row) => row.componentHash);
  const testComponentHashes = testRows.map((row) => row.componentHash);
  const trainPrevalence = yTrain.reduce((sum, value) => sum + value, 0) / yTrain.length;
  const baselineScores = yTest.map(() => trainPrevalence);
  const baselineMetrics = metrics(baselineScores, yTest, testComponentHashes);
  const calibratedTestMetrics = metrics(testCalibrated, yTest, testComponentHashes);
  const baselineComponentBalancedMetrics = componentBalancedMetrics(
    baselineScores, yTest, testComponentHashes);
  const uncalibratedComponentBalancedMetrics = componentBalancedMetrics(
    testUncalibrated, yTest, testComponentHashes);
  const calibratedComponentBalancedMetrics = componentBalancedMetrics(
    testCalibrated, yTest, testComponentHashes);
  const beatsTrainingPrevalenceBaseline = {
    logloss: calibratedTestMetrics.logloss < baselineMetrics.logloss,
    brier: calibratedTestMetrics.brier < baselineMetrics.brier,
  };
  const componentBalancedBeatsTrainingPrevalenceBaseline = {
    logloss: calibratedComponentBalancedMetrics.logloss
      < baselineComponentBalancedMetrics.logloss,
    brier: calibratedComponentBalancedMetrics.brier
      < baselineComponentBalancedMetrics.brier,
  };

  const datasetBinding = {
    recordHashes: entries.map((entry) => entry.recordHash).sort(),
    sourceSchemas: [...new Set(entries.map((entry) => entry.sourceSchema))].sort(),
    knownCorrelationRootHashes: [...new Set(entries.flatMap((entry) => entry.roots))].sort(),
  };
  const modelBody = {
    schema: GOVERNED_BEHAVIOR_MODEL_SCHEMA,
    schemaVersion: "2.0.0",
    signal: config.signal,
    featureNames: [...RECORD_FEATURE_NAMES],
    featureTemporality: MODEL_FEATURE_TEMPORALITY,
    underlyingLogistic: underlying,
    calibrator,
    datasetBindingHash: digest("outsider/governed-behavior-dataset-binding/v1", datasetBinding),
    splitBindingHash: digest("outsider/governed-behavior-split-binding/v1", summaries),
    intendedUse: MODEL_INTENDED_USE,
    preActionUseEligible: false,
    contractMutationEligible: false,
    priceUseEligible: false,
    responsibilityUseEligible: false,
  };
  const model = modelWithHash(modelBody);
  const reportBody = {
    schema: GOVERNED_BEHAVIOR_TRAINING_SCHEMA,
    schemaVersion: "2.0.0",
    trained: true,
    signal: config.signal,
    records: entries.length,
    knownCorrelationComponents: components.length,
    configuration: config,
    preregistration: {
      registeredAt: options.preregistration.registeredAt,
      preregistrationHash: options.preregistration.preregistrationHash,
      registeredBeforeEveryAdmittedRecordByDeclaredTimestamps: true,
      externalTimestampAuthorityVerified: false,
      outcomeBlindCreationVerified: false,
      hyperparametersSelectedBeforeHoldoutViewedEstablished: false,
    },
    datasetBindingHash: model.datasetBindingHash,
    split: {
      assignmentUnit: SPLIT_ASSIGNMENT_UNIT,
      ordering: SPLIT_ORDERING,
      rowRandomSplitUsed: false,
      summaries,
      rootOverlap: overlaps,
      strictTemporalOrderEstablished: true,
      heldOutDomains,
      testDomainsSeenDuringLearning,
      allTestDomainsAbsentFromLearning:
        heldOutDomains.length > 0 && testDomainsSeenDuringLearning.length === 0,
    },
    model,
    calibration: {
      method: calibrator.method,
      calibrationRowsUsedOnlyForCalibrator: true,
      calibratorFitWeighting: ROW_WEIGHTED_OBJECTIVE,
      clusterRobustCalibrationInferenceEstablished: false,
      calibrationMetricsBefore:
        metrics(calibrationUncalibrated, yCalibration, calibrationComponentHashes),
      calibrationMetricsAfter: metrics(
        calibrationUncalibrated.map((score) => applyPlatt(calibrator, score)), yCalibration,
        calibrationComponentHashes),
      populationCalibrationEstablished: false,
    },
    holdout: {
      testRowsUsedForFitting: false,
      testRowsUsedForCalibration: false,
      trainingPrevalenceBaselineProbability: trainPrevalence,
      trainingPrevalenceBaselineMetrics: baselineMetrics,
      uncalibratedMetrics: metrics(testUncalibrated, yTest, testComponentHashes),
      calibratedMetrics: calibratedTestMetrics,
      beatsTrainingPrevalenceBaseline,
      rowWeightedDescriptiveImprovementOnFrozenHoldout:
        beatsTrainingPrevalenceBaseline.logloss && beatsTrainingPrevalenceBaseline.brier,
      trainingPrevalenceBaselineComponentBalancedMetrics:
        baselineComponentBalancedMetrics,
      uncalibratedComponentBalancedMetrics,
      calibratedComponentBalancedMetrics,
      componentBalancedBeatsTrainingPrevalenceBaseline,
      componentBalancedDescriptiveImprovementOnFrozenHoldout:
        componentBalancedBeatsTrainingPrevalenceBaseline.logloss
        && componentBalancedBeatsTrainingPrevalenceBaseline.brier,
      estimandContract: holdoutEstimandContract(),
      calibratedReliabilityBinsDescriptiveRowWeighted:
        reliabilityBins(testCalibrated, yTest, testComponentHashes),
      declaredKnownRootConnectedComponents: summaries.test.components,
      effectiveIndependentComponentCount: null,
      clusterRobustInferenceEstablished: false,
      descriptiveCalibrationSummaryLimitedToThisFrozenHoldout: true,
      futurePopulationCalibrationEstablished: false,
    },
    modelCard: {
      modelFamily: "L2_LOGISTIC_PLUS_PLATT_CALIBRATION",
      estimand: `P(${config.signal}=true | completed-run features)`,
      trainingPopulation: TRAINING_POPULATION_BOUNDARY,
      sourceTruthReplayedByThisTrainer: false,
      trainingRightsEstablished: false,
      privacyPermissionEstablished: false,
      externallyTimestampedPreregistrationEstablished: false,
      knownCorrelationRootsPreserved: true,
      correlationRootCompletenessEstablished: false,
      temporalHoldout: TEMPORAL_HOLDOUT_BOUNDARY,
      allTestDomainsAbsentFromLearning:
        heldOutDomains.length > 0 && testDomainsSeenDuringLearning.length === 0,
      knownCorrelationRootLeakageAcrossSplitsPrevented: true,
      missingCostImputedAsZero: false,
      missingCostVsPeerImputedAsOne: false,
      anyImplicitFeatureImputationPerformed: false,
      postOutcomeFeaturesUsedAsPreActionFeatures: false,
      completedRunFeaturesAreProspectivePreActionFeatures: false,
      labelDefinitionFeatureOverlapExcluded: false,
      rareClassBearingComponentGuardAppliedToEverySplit: true,
      trainingObjectiveWeighting: ROW_WEIGHTED_OBJECTIVE,
      calibrationObjectiveWeighting: ROW_WEIGHTED_OBJECTIVE,
      holdoutMetricsWeighting: ROW_WEIGHTED_HOLDOUT,
      componentBalancedHoldoutMetricsWeighting: COMPONENT_BALANCED_HOLDOUT,
      clusterRobustInferenceEstablished: false,
      randomRowPopulationInferenceEstablished: false,
      newKnownCorrelationComponentGeneralizationEstablished: false,
      newDomainTransportEstablished: false,
      calibrationSetSeparateFromTest: true,
      simpleTrainingPrevalenceBaselineCompared: true,
      aleatoricUncertaintyRepresentedByBernoulliProbability: true,
      parameterUncertaintyQuantified: false,
      modelFormUncertaintyQuantified: false,
      dataRevisionUncertaintyQuantified: false,
      targetTransferUncertaintyQuantified: false,
      driftMonitorEstablished: false,
      independentReviewCompleted: false,
      operationalAuthorityGranted: false,
      requiredNextEvidence: [...REQUIRED_NEXT_EVIDENCE],
    },
    governance: {
      failClosed: true,
      rowRandomSplitUsed: false,
      knownCorrelationRootsPreserved: true,
      strictTemporalOrderEstablished: true,
      allTestDomainsAbsentFromLearning:
        heldOutDomains.length > 0 && testDomainsSeenDuringLearning.length === 0,
      calibrationSplitEstablished: true,
      sourceTruthReplayed: false,
      externallyTimestampedPreregistrationEstablished: false,
      retrospectiveShadowUseAdmitted: true,
      preActionUseEligible: false,
      responsibilityUseEligible: false,
      operationalAuthorityGranted: false,
    },
  };
  return { ...reportBody,
    trainingReportHash: digest(GOVERNED_BEHAVIOR_TRAINING_SCHEMA, reportBody) };
}

function verifyExactReportSchema(report) {
  exactObjectKeys(report, ["schema", "schemaVersion", "trained", "signal", "records",
    "knownCorrelationComponents", "configuration", "preregistration", "datasetBindingHash",
    "split", "model", "calibration", "holdout", "modelCard", "governance",
    "trainingReportHash"], "REPORT");
  exactObjectKeys(report.configuration, ["signal", "calibrationFrac", "testFrac", "minRecords",
    "minComponents", "minClassPerSplit", "requireOutOfDomainHoldout", "l2", "lr", "epochs",
    "seed"], "CONFIGURATION");
  exactObjectKeys(report.preregistration, ["registeredAt", "preregistrationHash",
    "registeredBeforeEveryAdmittedRecordByDeclaredTimestamps",
    "externalTimestampAuthorityVerified", "outcomeBlindCreationVerified",
    "hyperparametersSelectedBeforeHoldoutViewedEstablished"], "PREREGISTRATION");
  exactObjectKeys(report.split, ["assignmentUnit", "ordering", "rowRandomSplitUsed", "summaries",
    "rootOverlap", "strictTemporalOrderEstablished", "heldOutDomains",
    "testDomainsSeenDuringLearning", "allTestDomainsAbsentFromLearning"], "SPLIT");
  exactObjectKeys(report.split.summaries, ["train", "calibration", "test"], "SUMMARIES");
  exactObjectKeys(report.split.rootOverlap,
    ["trainCalibration", "trainTest", "calibrationTest"], "ROOT_OVERLAP");
  for (const [name, summary] of Object.entries(report.split.summaries)) {
    exactObjectKeys(summary, ["name", "components", "declaredKnownRootConnectedComponents",
      "effectiveIndependentComponentCount", "independenceBeyondDeclaredKnownRootsEstablished",
      "rows", "positives", "negatives", "positiveBearingComponents",
      "negativeBearingComponents", "mixedClassComponents", "maximumRowsInOneComponent",
      "knownCorrelationRoots", "domains", "minimumObservedAt", "maximumObservedAt",
      "componentHashes", "recordHashes", "componentSupport"], `SUMMARY_${name}`);
    if (!Array.isArray(summary.componentSupport)) {
      throw new Error(`COMPONENT_SUPPORT_NOT_ARRAY:${name}`);
    }
    for (const component of summary.componentSupport) {
      exactObjectKeys(component, ["componentHash", "rootHashes", "recordHashes", "rows",
        "positives", "negatives", "domains", "minimumObservedAt", "maximumObservedAt"],
      `COMPONENT_${name}`);
    }
  }
  verifyExactGovernedModelSchema(report.model);
  exactObjectKeys(report.calibration, ["method", "calibrationRowsUsedOnlyForCalibrator",
    "calibratorFitWeighting", "clusterRobustCalibrationInferenceEstablished",
    "calibrationMetricsBefore", "calibrationMetricsAfter", "populationCalibrationEstablished"],
  "CALIBRATION");
  const metricKeys = ["auc", "logloss", "brier", "expectedCalibrationError10Bins", "rows",
    "positives", "negatives", "weighting", "declaredKnownRootConnectedComponents",
    "effectiveIndependentComponentCount", "clusterRobustInferenceEstablished"];
  for (const [name, metric] of [
    ["CALIBRATION_BEFORE", report.calibration.calibrationMetricsBefore],
    ["CALIBRATION_AFTER", report.calibration.calibrationMetricsAfter],
    ["BASELINE", report.holdout.trainingPrevalenceBaselineMetrics],
    ["TEST_UNCALIBRATED", report.holdout.uncalibratedMetrics],
    ["TEST_CALIBRATED", report.holdout.calibratedMetrics],
  ]) exactObjectKeys(metric, metricKeys, name);
  const componentBalancedMetricKeys = ["auc", "logloss", "brier",
    "expectedCalibrationError10Bins", "rows", "positives", "negatives", "weighting",
    "declaredKnownRootConnectedComponents", "eachComponentTotalWeight",
    "withinComponentRowWeightFormula", "eachObservedComponentHasEqualMarginalRowWeight",
    "aucUsesClassConditionalWeightNormalization",
    "equalPairwiseAucContributionPerComponentEstablished", "descriptiveOnly",
    "confidenceInterval", "effectiveIndependentComponentCount",
    "clusterRobustInferenceEstablished", "exchangeabilityEstablished",
    "newComponentGeneralizationEstablished", "domainTransportEstablished"];
  for (const [name, metric] of [
    ["COMPONENT_BALANCED_BASELINE",
      report.holdout.trainingPrevalenceBaselineComponentBalancedMetrics],
    ["COMPONENT_BALANCED_TEST_UNCALIBRATED",
      report.holdout.uncalibratedComponentBalancedMetrics],
    ["COMPONENT_BALANCED_TEST_CALIBRATED",
      report.holdout.calibratedComponentBalancedMetrics],
  ]) exactObjectKeys(metric, componentBalancedMetricKeys, name);
  exactObjectKeys(report.holdout, ["testRowsUsedForFitting", "testRowsUsedForCalibration",
    "trainingPrevalenceBaselineProbability", "trainingPrevalenceBaselineMetrics",
    "uncalibratedMetrics", "calibratedMetrics", "beatsTrainingPrevalenceBaseline",
    "rowWeightedDescriptiveImprovementOnFrozenHoldout",
    "trainingPrevalenceBaselineComponentBalancedMetrics",
    "uncalibratedComponentBalancedMetrics", "calibratedComponentBalancedMetrics",
    "componentBalancedBeatsTrainingPrevalenceBaseline",
    "componentBalancedDescriptiveImprovementOnFrozenHoldout", "estimandContract",
    "calibratedReliabilityBinsDescriptiveRowWeighted", "declaredKnownRootConnectedComponents",
    "effectiveIndependentComponentCount", "clusterRobustInferenceEstablished",
    "descriptiveCalibrationSummaryLimitedToThisFrozenHoldout",
    "futurePopulationCalibrationEstablished"], "HOLDOUT");
  exactObjectKeys(report.holdout.beatsTrainingPrevalenceBaseline,
    ["logloss", "brier"], "BASELINE_COMPARISON");
  exactObjectKeys(report.holdout.componentBalancedBeatsTrainingPrevalenceBaseline,
    ["logloss", "brier"], "COMPONENT_BALANCED_BASELINE_COMPARISON");
  exactObjectKeys(report.holdout.estimandContract,
    ["schema", "frozenHoldoutOnly", "randomRow", "observedKnownCorrelationComponents",
      "newKnownCorrelationComponent", "newDomain", "globalBoundaries"],
  "ESTIMAND_CONTRACT");
  exactObjectKeys(report.holdout.estimandContract.randomRow,
    ["estimand", "targetUnit", "reportedMetricPaths", "weighting", "descriptiveOnly",
      "confidenceInterval", "populationInferenceEstablished", "exchangeabilityEstablished",
      "causalInterpretationEstablished"], "ESTIMAND_RANDOM_ROW");
  exactObjectKeys(report.holdout.estimandContract.observedKnownCorrelationComponents,
    ["estimand", "targetUnit", "reportedMetricPaths", "weighting",
      "withinComponentWeighting", "descriptiveOnly", "confidenceInterval",
      "empiricalFunctionalOnly", "populationInferenceEstablished",
      "exchangeabilityEstablished", "causalInterpretationEstablished"],
  "ESTIMAND_OBSERVED_COMPONENTS");
  exactObjectKeys(report.holdout.estimandContract.newKnownCorrelationComponent,
    ["estimand", "targetUnit", "reportedMetricPaths", "estimate", "confidenceInterval",
      "noPointEstimateProduced", "componentSamplingFrameEstablished",
      "populationInferenceEstablished", "exchangeabilityEstablished",
      "newComponentGeneralizationEstablished", "causalInterpretationEstablished"],
  "ESTIMAND_NEW_COMPONENT");
  exactObjectKeys(report.holdout.estimandContract.newDomain,
    ["estimand", "targetUnit", "reportedMetricPaths", "estimate", "confidenceInterval",
      "noPointEstimateProduced", "targetDomainSpecified", "domainExchangeabilityEstablished",
      "transportEstablished", "targetPopulationPerformanceEstablished",
      "causalInterpretationEstablished"], "ESTIMAND_NEW_DOMAIN");
  exactObjectKeys(report.holdout.estimandContract.globalBoundaries,
    ["targetTransferEstablished", "priceUseEligible", "responsibilityUseEligible",
      "operationalAuthorityGranted"], "ESTIMAND_GLOBAL_BOUNDARIES");
  if (!Array.isArray(report.holdout.calibratedReliabilityBinsDescriptiveRowWeighted)) {
    throw new Error("RELIABILITY_NOT_ARRAY");
  }
  for (const bin of report.holdout.calibratedReliabilityBinsDescriptiveRowWeighted) {
    exactObjectKeys(bin, ["bin", "rows", "meanPredictedProbability", "observedRate",
      "knownRootConnectedComponentsRepresented", "rowWeightedDescriptiveOnly",
      "naiveRowWilson95IgnoringWithinComponentDependence", "clusterRobustInterval",
      "clusterRobustInferenceEstablished"], "RELIABILITY_BIN");
    if (bin.naiveRowWilson95IgnoringWithinComponentDependence !== null) {
      throw new Error("NAIVE_ROW_INTERVAL_MUST_BE_NULL");
    }
  }
  exactObjectKeys(report.modelCard, ["modelFamily", "estimand", "trainingPopulation",
    "sourceTruthReplayedByThisTrainer", "trainingRightsEstablished",
    "privacyPermissionEstablished", "externallyTimestampedPreregistrationEstablished",
    "knownCorrelationRootsPreserved", "correlationRootCompletenessEstablished",
    "temporalHoldout", "allTestDomainsAbsentFromLearning",
    "knownCorrelationRootLeakageAcrossSplitsPrevented", "missingCostImputedAsZero",
    "missingCostVsPeerImputedAsOne", "anyImplicitFeatureImputationPerformed",
    "postOutcomeFeaturesUsedAsPreActionFeatures",
    "completedRunFeaturesAreProspectivePreActionFeatures", "labelDefinitionFeatureOverlapExcluded",
    "rareClassBearingComponentGuardAppliedToEverySplit", "trainingObjectiveWeighting",
    "calibrationObjectiveWeighting", "holdoutMetricsWeighting",
    "componentBalancedHoldoutMetricsWeighting", "clusterRobustInferenceEstablished",
    "randomRowPopulationInferenceEstablished",
    "newKnownCorrelationComponentGeneralizationEstablished", "newDomainTransportEstablished",
    "calibrationSetSeparateFromTest",
    "simpleTrainingPrevalenceBaselineCompared", "aleatoricUncertaintyRepresentedByBernoulliProbability",
    "parameterUncertaintyQuantified", "modelFormUncertaintyQuantified",
    "dataRevisionUncertaintyQuantified", "targetTransferUncertaintyQuantified",
    "driftMonitorEstablished", "independentReviewCompleted", "operationalAuthorityGranted",
    "requiredNextEvidence"], "MODEL_CARD");
  exactObjectKeys(report.governance, ["failClosed", "rowRandomSplitUsed",
    "knownCorrelationRootsPreserved", "strictTemporalOrderEstablished",
    "allTestDomainsAbsentFromLearning", "calibrationSplitEstablished", "sourceTruthReplayed",
    "externallyTimestampedPreregistrationEstablished", "retrospectiveShadowUseAdmitted",
    "preActionUseEligible", "responsibilityUseEligible", "operationalAuthorityGranted"],
  "GOVERNANCE");
}

function verifyExactGovernedModelSchema(model) {
  exactObjectKeys(model, ["schema", "schemaVersion", "signal", "featureNames",
    "featureTemporality", "underlyingLogistic", "calibrator", "datasetBindingHash",
    "splitBindingHash", "intendedUse", "preActionUseEligible", "contractMutationEligible",
    "priceUseEligible", "responsibilityUseEligible", "modelHash"], "MODEL");
  exactObjectKeys(model.underlyingLogistic,
    ["schema", "featureNames", "weights", "bias", "standardizer", "meta"],
    "UNDERLYING_LOGISTIC");
  exactObjectKeys(model.underlyingLogistic.standardizer, ["mean", "std"],
    "UNDERLYING_STANDARDIZER");
  exactObjectKeys(model.underlyingLogistic.meta,
    ["signal", "nTrain", "governedTrainingSchema"], "UNDERLYING_META");
  exactObjectKeys(model.calibrator,
    ["method", "weight", "bias", "inputStandardizer"], "CALIBRATOR");
  exactObjectKeys(model.calibrator.inputStandardizer, ["mean", "std"],
    "CALIBRATOR_STANDARDIZER");
}

function verifyNumericModelStructure(model) {
  const size = RECORD_FEATURE_NAMES.length;
  const logistic = model.underlyingLogistic;
  const standardizer = logistic.standardizer;
  if (!Array.isArray(logistic.weights) || logistic.weights.length !== size
    || !logistic.weights.every(Number.isFinite) || !Number.isFinite(logistic.bias)
    || !Array.isArray(standardizer.mean) || standardizer.mean.length !== size
    || !standardizer.mean.every(Number.isFinite)
    || !Array.isArray(standardizer.std) || standardizer.std.length !== size
    || !standardizer.std.every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("UNDERLYING_LOGISTIC_NUMERIC_SHAPE_INVALID");
  }
  const calibrator = model.calibrator;
  if (!Number.isFinite(calibrator.weight) || !Number.isFinite(calibrator.bias)
    || !Array.isArray(calibrator.inputStandardizer.mean)
    || calibrator.inputStandardizer.mean.length !== 1
    || !calibrator.inputStandardizer.mean.every(Number.isFinite)
    || !Array.isArray(calibrator.inputStandardizer.std)
    || calibrator.inputStandardizer.std.length !== 1
    || !calibrator.inputStandardizer.std.every((value) => Number.isFinite(value) && value > 0)) {
    throw new Error("CALIBRATOR_NUMERIC_SHAPE_INVALID");
  }
}

function verifyGovernedModelSemanticBoundary(model) {
  verifyExactGovernedModelSchema(model);
  if (model.schema !== GOVERNED_BEHAVIOR_MODEL_SCHEMA
    || model.schemaVersion !== "2.0.0"
    || !SIGNALS.has(model.signal)
    || canonicalizeStrict(model.featureNames) !== canonicalizeStrict(RECORD_FEATURE_NAMES)
    || model.featureTemporality !== MODEL_FEATURE_TEMPORALITY
    || model.intendedUse !== MODEL_INTENDED_USE
    || model.preActionUseEligible !== false
    || model.contractMutationEligible !== false
    || model.priceUseEligible !== false
    || model.responsibilityUseEligible !== false
    || !HASH.test(model.datasetBindingHash)
    || !HASH.test(model.splitBindingHash)
    || model.underlyingLogistic.schema !== "outsider/logistic-model/v1"
    || canonicalizeStrict(model.underlyingLogistic.featureNames)
      !== canonicalizeStrict(RECORD_FEATURE_NAMES)
    || model.underlyingLogistic.meta.signal !== model.signal
    || !Number.isSafeInteger(model.underlyingLogistic.meta.nTrain)
    || model.underlyingLogistic.meta.nTrain < 1
    || model.underlyingLogistic.meta.governedTrainingSchema
      !== GOVERNED_BEHAVIOR_TRAINING_SCHEMA
    || model.calibrator.method !== "PLATT_LOGISTIC_ON_CALIBRATION_SPLIT_ONLY") {
    throw new Error("MODEL_SEMANTIC_BOUNDARY_INVALID");
  }
}

function verifySplitSummary(summary, expectedName) {
  if (summary.name !== expectedName || !Number.isSafeInteger(summary.components)
    || summary.components < 1 || !Number.isSafeInteger(summary.rows) || summary.rows < 1
    || summary.components > summary.rows || summary.componentSupport.length !== summary.components) {
    throw new Error(`SUMMARY_CARDINALITY_INVALID:${expectedName}`);
  }
  const componentHashes = [], recordHashes = [], rootHashes = [], domains = [];
  let positives = 0, negatives = 0, positiveBearing = 0, negativeBearing = 0, mixed = 0;
  let maximumRows = 0, minimumObservedAt = null, maximumObservedAt = null;
  for (const component of summary.componentSupport) {
    exactStringSet(component.rootHashes, `${expectedName}_ROOTS`, { hashes: true });
    exactStringSet(component.recordHashes, `${expectedName}_RECORDS`, { hashes: true });
    exactStringSet(component.domains, `${expectedName}_DOMAINS`);
    if (!HASH.test(component.componentHash)
      || component.componentHash !== digest("outsider/governed-behavior-component/v1",
        { rootHashes: component.rootHashes, recordHashes: component.recordHashes })
      || !Number.isSafeInteger(component.rows) || component.rows < 1
      || component.rows !== component.recordHashes.length
      || !Number.isSafeInteger(component.positives) || component.positives < 0
      || !Number.isSafeInteger(component.negatives) || component.negatives < 0
      || component.positives + component.negatives !== component.rows
      || timestamp(component.minimumObservedAt) !== component.minimumObservedAt
      || timestamp(component.maximumObservedAt) !== component.maximumObservedAt
      || component.minimumObservedAt > component.maximumObservedAt) {
      throw new Error(`COMPONENT_SUPPORT_INVALID:${expectedName}`);
    }
    componentHashes.push(component.componentHash);
    recordHashes.push(...component.recordHashes);
    rootHashes.push(...component.rootHashes);
    domains.push(...component.domains);
    positives += component.positives;
    negatives += component.negatives;
    if (component.positives > 0) positiveBearing += 1;
    if (component.negatives > 0) negativeBearing += 1;
    if (component.positives > 0 && component.negatives > 0) mixed += 1;
    maximumRows = Math.max(maximumRows, component.rows);
    minimumObservedAt = minimumObservedAt === null
      || component.minimumObservedAt < minimumObservedAt
      ? component.minimumObservedAt : minimumObservedAt;
    maximumObservedAt = maximumObservedAt === null
      || component.maximumObservedAt > maximumObservedAt
      ? component.maximumObservedAt : maximumObservedAt;
  }
  if (new Set(componentHashes).size !== componentHashes.length
    || new Set(recordHashes).size !== recordHashes.length
    || new Set(rootHashes).size !== rootHashes.length
    || canonicalizeStrict(summary.componentHashes) !== canonicalizeStrict(componentHashes)
    || canonicalizeStrict(summary.recordHashes) !== canonicalizeStrict([...recordHashes].sort())
    || canonicalizeStrict(summary.domains) !== canonicalizeStrict([...new Set(domains)].sort())
    || summary.declaredKnownRootConnectedComponents !== summary.components
    || summary.effectiveIndependentComponentCount !== null
    || summary.independenceBeyondDeclaredKnownRootsEstablished !== false
    || summary.positives !== positives || summary.negatives !== negatives
    || summary.positives + summary.negatives !== summary.rows
    || summary.positiveBearingComponents !== positiveBearing
    || summary.negativeBearingComponents !== negativeBearing
    || summary.mixedClassComponents !== mixed
    || mixed !== positiveBearing + negativeBearing - summary.components
    || summary.maximumRowsInOneComponent !== maximumRows
    || summary.knownCorrelationRoots !== rootHashes.length
    || summary.knownCorrelationRoots < summary.components
    || summary.minimumObservedAt !== minimumObservedAt
    || summary.maximumObservedAt !== maximumObservedAt) {
    throw new Error(`SUMMARY_DERIVATION_INVALID:${expectedName}`);
  }
  return { componentHashes, recordHashes, rootHashes, domains: summary.domains };
}

function verifyFixedBoundaryContract(report) {
  verifyExactReportSchema(report);
  verifyGovernedModelSemanticBoundary(report.model);
  verifyNumericModelStructure(report.model);
  for (const path of FIXED_FALSE_BOUNDARY_PATHS) {
    if (pathValue(report, path) !== false) {
      throw new Error(`FIXED_FALSE_BOUNDARY_INVALID:${path}`);
    }
  }
  for (const path of FIXED_TRUE_BOUNDARY_PATHS) {
    if (pathValue(report, path) !== true) {
      throw new Error(`FIXED_TRUE_BOUNDARY_INVALID:${path}`);
    }
  }
  const fixedStrings = [
    ["split.assignmentUnit", SPLIT_ASSIGNMENT_UNIT],
    ["split.ordering", SPLIT_ORDERING],
    ["calibration.method", "PLATT_LOGISTIC_ON_CALIBRATION_SPLIT_ONLY"],
    ["calibration.calibratorFitWeighting", ROW_WEIGHTED_OBJECTIVE],
    ["model.featureTemporality", MODEL_FEATURE_TEMPORALITY],
    ["model.intendedUse", MODEL_INTENDED_USE],
    ["modelCard.modelFamily", "L2_LOGISTIC_PLUS_PLATT_CALIBRATION"],
    ["modelCard.trainingPopulation", TRAINING_POPULATION_BOUNDARY],
    ["modelCard.temporalHoldout", TEMPORAL_HOLDOUT_BOUNDARY],
    ["modelCard.trainingObjectiveWeighting", ROW_WEIGHTED_OBJECTIVE],
    ["modelCard.calibrationObjectiveWeighting", ROW_WEIGHTED_OBJECTIVE],
    ["modelCard.holdoutMetricsWeighting", ROW_WEIGHTED_HOLDOUT],
    ["modelCard.componentBalancedHoldoutMetricsWeighting", COMPONENT_BALANCED_HOLDOUT],
  ];
  for (const [path, expected] of fixedStrings) {
    if (pathValue(report, path) !== expected) {
      throw new Error(`FIXED_STRING_BOUNDARY_INVALID:${path}`);
    }
  }
  if (report.model.schemaVersion !== "2.0.0"
    || report.model.signal !== report.configuration.signal
    || report.modelCard.estimand
      !== `P(${report.configuration.signal}=true | completed-run features)`
    || report.model.calibrator?.method !== "PLATT_LOGISTIC_ON_CALIBRATION_SPLIT_ONLY"
    || report.model.underlyingLogistic?.schema !== "outsider/logistic-model/v1"
    || report.model.underlyingLogistic?.meta?.signal !== report.configuration.signal
    || report.model.underlyingLogistic?.meta?.governedTrainingSchema
      !== GOVERNED_BEHAVIOR_TRAINING_SCHEMA
    || report.model.underlyingLogistic?.meta?.nTrain !== report.split.summaries.train.rows
    || canonicalizeStrict(report.model.featureNames)
      !== canonicalizeStrict(RECORD_FEATURE_NAMES)
    || canonicalizeStrict(report.model.underlyingLogistic.featureNames)
      !== canonicalizeStrict(RECORD_FEATURE_NAMES)
    || canonicalizeStrict(report.modelCard.requiredNextEvidence)
      !== canonicalizeStrict(REQUIRED_NEXT_EVIDENCE)
    || canonicalizeStrict(report.holdout.estimandContract)
      !== canonicalizeStrict(holdoutEstimandContract())) {
    throw new Error("FIXED_MODEL_CARD_OR_MODEL_BOUNDARY_INVALID");
  }
  const rebuiltPreregistration = buildGovernedBehaviorPreregistration({
    registeredAt: report.preregistration.registeredAt,
    ...report.configuration,
  });
  if (rebuiltPreregistration.preregistrationHash
      !== report.preregistration.preregistrationHash
    || report.datasetBindingHash !== report.model.datasetBindingHash
    || report.model.splitBindingHash
      !== digest("outsider/governed-behavior-split-binding/v1", report.split.summaries)) {
    throw new Error("FIXED_BINDING_CONTRACT_INVALID");
  }
  const summaries = report.split.summaries;
  const verifiedSummaries = {
    train: verifySplitSummary(summaries.train, "TRAIN"),
    calibration: verifySplitSummary(summaries.calibration, "CALIBRATION"),
    test: verifySplitSummary(summaries.test, "TEST"),
  };
  for (const [left, right] of [["train", "calibration"], ["train", "test"],
    ["calibration", "test"]]) {
    if (!disjoint(verifiedSummaries[left].componentHashes,
      verifiedSummaries[right].componentHashes)
      || !disjoint(verifiedSummaries[left].recordHashes,
        verifiedSummaries[right].recordHashes)
      || !disjoint(verifiedSummaries[left].rootHashes,
        verifiedSummaries[right].rootHashes)) {
      throw new Error(`SPLIT_COMPONENT_RECORD_OR_ROOT_OVERLAP:${left}:${right}`);
    }
  }
  const computedRootOverlap = {
    trainCalibration: 0,
    trainTest: 0,
    calibrationTest: 0,
  };
  if (canonicalizeStrict(report.split.rootOverlap)
      !== canonicalizeStrict(computedRootOverlap)) {
    throw new Error("SPLIT_ROOT_OVERLAP_DERIVATION_INVALID");
  }
  const expectedComponents = summaries.train.components + summaries.calibration.components
    + summaries.test.components;
  const expectedRows = summaries.train.rows + summaries.calibration.rows
    + summaries.test.rows;
  const learningDomains = new Set([...summaries.train.domains, ...summaries.calibration.domains]);
  const expectedHeldOutDomains = summaries.test.domains
    .filter((domain) => !learningDomains.has(domain)).sort();
  const expectedSeenTestDomains = summaries.test.domains
    .filter((domain) => learningDomains.has(domain)).sort();
  exactStringSet(report.split.heldOutDomains, "HELD_OUT_DOMAINS", { allowEmpty: true });
  exactStringSet(report.split.testDomainsSeenDuringLearning, "SEEN_TEST_DOMAINS",
    { allowEmpty: true });
  const expectedOutOfDomain = expectedHeldOutDomains.length > 0
    && expectedSeenTestDomains.length === 0;
  if (report.knownCorrelationComponents !== expectedComponents
    || report.records !== expectedRows
    || canonicalizeStrict(report.split.heldOutDomains)
      !== canonicalizeStrict(expectedHeldOutDomains)
    || canonicalizeStrict(report.split.testDomainsSeenDuringLearning)
      !== canonicalizeStrict(expectedSeenTestDomains)
    || (report.configuration.requireOutOfDomainHoldout && !expectedOutOfDomain)
    || report.split.allTestDomainsAbsentFromLearning !== expectedOutOfDomain
    || report.modelCard.allTestDomainsAbsentFromLearning !== expectedOutOfDomain
    || report.governance.allTestDomainsAbsentFromLearning !== expectedOutOfDomain) {
    throw new Error("FIXED_SPLIT_BOUNDARY_INVALID");
  }
  const metricBindings = [
    [report.calibration.calibrationMetricsBefore, summaries.calibration],
    [report.calibration.calibrationMetricsAfter, summaries.calibration],
    [report.holdout.trainingPrevalenceBaselineMetrics, summaries.test],
    [report.holdout.uncalibratedMetrics, summaries.test],
    [report.holdout.calibratedMetrics, summaries.test],
  ];
  for (const [metric, summary] of metricBindings) {
    if (![metric.auc, metric.logloss, metric.brier,
      metric.expectedCalibrationError10Bins].every(Number.isFinite)
      || metric.auc < 0 || metric.auc > 1
      || metric.logloss < 0
      || metric.brier < 0 || metric.brier > 1
      || metric.expectedCalibrationError10Bins < 0
      || metric.expectedCalibrationError10Bins > 1
      || metric.rows !== summary.rows || metric.positives !== summary.positives
      || metric.negatives !== summary.negatives
      || metric.declaredKnownRootConnectedComponents !== summary.components) {
      throw new Error("METRIC_SUMMARY_BINDING_INVALID");
    }
  }
  const componentBalancedMetricBindings = [
    [report.holdout.trainingPrevalenceBaselineComponentBalancedMetrics, summaries.test],
    [report.holdout.uncalibratedComponentBalancedMetrics, summaries.test],
    [report.holdout.calibratedComponentBalancedMetrics, summaries.test],
  ];
  for (const [metric, summary] of componentBalancedMetricBindings) {
    if (![metric.auc, metric.logloss, metric.brier,
      metric.expectedCalibrationError10Bins].every(Number.isFinite)
      || metric.auc < 0 || metric.auc > 1
      || metric.logloss < 0
      || metric.brier < 0 || metric.brier > 1
      || metric.expectedCalibrationError10Bins < 0
      || metric.expectedCalibrationError10Bins > 1
      || metric.rows !== summary.rows || metric.positives !== summary.positives
      || metric.negatives !== summary.negatives
      || metric.declaredKnownRootConnectedComponents !== summary.components
      || metric.eachComponentTotalWeight !== 1 / summary.components
      || metric.withinComponentRowWeightFormula
        !== "ONE_DIVIDED_BY_PRODUCT_OF_COMPONENT_COUNT_AND_ROWS_IN_COMPONENT"
      || metric.eachObservedComponentHasEqualMarginalRowWeight !== true
      || metric.aucUsesClassConditionalWeightNormalization !== true
      || metric.equalPairwiseAucContributionPerComponentEstablished !== false
      || metric.descriptiveOnly !== true
      || metric.confidenceInterval !== null
      || metric.effectiveIndependentComponentCount !== null
      || metric.clusterRobustInferenceEstablished !== false
      || metric.exchangeabilityEstablished !== false
      || metric.newComponentGeneralizationEstablished !== false
      || metric.domainTransportEstablished !== false
      || metric.weighting !== COMPONENT_BALANCED_METRIC) {
      throw new Error("COMPONENT_BALANCED_METRIC_BOUNDARY_INVALID");
    }
  }
  const expectedBeats = {
    logloss: report.holdout.calibratedMetrics.logloss
      < report.holdout.trainingPrevalenceBaselineMetrics.logloss,
    brier: report.holdout.calibratedMetrics.brier
      < report.holdout.trainingPrevalenceBaselineMetrics.brier,
  };
  const expectedComponentBalancedBeats = {
    logloss: report.holdout.calibratedComponentBalancedMetrics.logloss
      < report.holdout.trainingPrevalenceBaselineComponentBalancedMetrics.logloss,
    brier: report.holdout.calibratedComponentBalancedMetrics.brier
      < report.holdout.trainingPrevalenceBaselineComponentBalancedMetrics.brier,
  };
  const expectedTrainingPrevalence = summaries.train.positives / summaries.train.rows;
  const baselineLabels = [], baselineComponentHashes = [];
  for (const component of summaries.test.componentSupport) {
    baselineLabels.push(...new Array(component.positives).fill(1),
      ...new Array(component.negatives).fill(0));
    baselineComponentHashes.push(...new Array(component.rows).fill(component.componentHash));
  }
  const expectedBaselineMetrics = metrics(
    baselineLabels.map(() => expectedTrainingPrevalence), baselineLabels,
    baselineComponentHashes);
  const expectedComponentBalancedBaselineMetrics = componentBalancedMetrics(
    baselineLabels.map(() => expectedTrainingPrevalence), baselineLabels,
    baselineComponentHashes);
  if (canonicalizeStrict(report.holdout.beatsTrainingPrevalenceBaseline)
      !== canonicalizeStrict(expectedBeats)
    || report.holdout.rowWeightedDescriptiveImprovementOnFrozenHoldout
      !== (expectedBeats.logloss && expectedBeats.brier)
    || !Number.isFinite(report.holdout.trainingPrevalenceBaselineProbability)
    || report.holdout.trainingPrevalenceBaselineProbability !== expectedTrainingPrevalence
    || canonicalizeStrict(report.holdout.trainingPrevalenceBaselineMetrics)
      !== canonicalizeStrict(expectedBaselineMetrics)
    || canonicalizeStrict(report.holdout.componentBalancedBeatsTrainingPrevalenceBaseline)
      !== canonicalizeStrict(expectedComponentBalancedBeats)
    || report.holdout.componentBalancedDescriptiveImprovementOnFrozenHoldout
      !== (expectedComponentBalancedBeats.logloss && expectedComponentBalancedBeats.brier)
    || canonicalizeStrict(
      report.holdout.trainingPrevalenceBaselineComponentBalancedMetrics)
      !== canonicalizeStrict(expectedComponentBalancedBaselineMetrics)
    || report.holdout.declaredKnownRootConnectedComponents !== summaries.test.components) {
    throw new Error("HOLDOUT_ARITHMETIC_BOUNDARY_INVALID");
  }
  const binIndices = new Set();
  let reliabilityRows = 0;
  let reliabilityPositives = 0;
  let priorBinIndex = -1;
  for (const bin of report.holdout.calibratedReliabilityBinsDescriptiveRowWeighted) {
    const observedSuccesses = Math.round(bin.observedRate * bin.rows);
    if (!Number.isSafeInteger(bin.bin) || bin.bin < 0 || bin.bin > 9
      || binIndices.has(bin.bin)
      || bin.bin <= priorBinIndex
      || !Number.isSafeInteger(bin.rows) || bin.rows < 1
      || !Number.isSafeInteger(bin.knownRootConnectedComponentsRepresented)
      || bin.knownRootConnectedComponentsRepresented < 1
      || bin.knownRootConnectedComponentsRepresented > summaries.test.components
      || !Number.isFinite(bin.meanPredictedProbability)
      || bin.meanPredictedProbability < 0 || bin.meanPredictedProbability > 1
      || Math.min(9, Math.floor(bin.meanPredictedProbability * 10)) !== bin.bin
      || !Number.isFinite(bin.observedRate) || bin.observedRate < 0 || bin.observedRate > 1
      || observedSuccesses < 0 || observedSuccesses > bin.rows
      || Math.abs(observedSuccesses / bin.rows - bin.observedRate) > 1e-12
      || bin.naiveRowWilson95IgnoringWithinComponentDependence !== null
      || bin.clusterRobustInterval !== null
      || bin.clusterRobustInferenceEstablished !== false) {
      throw new Error("RELIABILITY_NUMERIC_BOUNDARY_INVALID");
    }
    binIndices.add(bin.bin);
    reliabilityRows += bin.rows;
    reliabilityPositives += observedSuccesses;
    priorBinIndex = bin.bin;
  }
  if (reliabilityRows !== summaries.test.rows
    || reliabilityPositives !== summaries.test.positives) {
    throw new Error("RELIABILITY_ROW_ACCOUNTING_INVALID");
  }
}

export function verifyGovernedBehaviorTraining(report) {
  try {
    if (report?.schema !== GOVERNED_BEHAVIOR_TRAINING_SCHEMA || report.trained !== true
      || report.schemaVersion !== "2.0.0" || !HASH.test(report.trainingReportHash ?? "")
      || report.model?.schema !== GOVERNED_BEHAVIOR_MODEL_SCHEMA
      || !HASH.test(report.model?.modelHash ?? "")) {
      throw new Error("REPORT_STRUCTURE_INVALID");
    }
    const { trainingReportHash, ...reportBody } = report;
    if (trainingReportHash !== digest(GOVERNED_BEHAVIOR_TRAINING_SCHEMA, reportBody)) {
      throw new Error("REPORT_HASH_INVALID");
    }
    const { modelHash, ...modelBody } = report.model;
    if (modelHash !== digest(GOVERNED_BEHAVIOR_MODEL_SCHEMA, modelBody)) {
      throw new Error("MODEL_HASH_INVALID");
    }
    verifyFixedBoundaryContract(report);
    if (report.split.rowRandomSplitUsed !== false
      || Object.values(report.split.rootOverlap).some((value) => value !== 0)
      || report.split.strictTemporalOrderEstablished !== true
      || report.governance.knownCorrelationRootsPreserved !== true
      || report.governance.calibrationSplitEstablished !== true
      || report.governance.preActionUseEligible !== false
      || report.governance.responsibilityUseEligible !== false
      || report.governance.operationalAuthorityGranted !== false
      || report.model.preActionUseEligible !== false
      || report.model.priceUseEligible !== false
      || report.model.responsibilityUseEligible !== false
      || report.model.contractMutationEligible !== false) {
      throw new Error("GOVERNANCE_BOUNDARY_INVALID");
    }
    const summaries = report.split.summaries;
    if (!(summaries.train.maximumObservedAt < summaries.calibration.minimumObservedAt
      && summaries.calibration.maximumObservedAt < summaries.test.minimumObservedAt)) {
      throw new Error("TEMPORAL_BOUNDARY_INVALID");
    }
    if (Object.values(summaries).some((summary) =>
      !Number.isSafeInteger(summary.components) || summary.components < 1
      || summary.declaredKnownRootConnectedComponents !== summary.components
      || summary.effectiveIndependentComponentCount !== null
      || summary.independenceBeyondDeclaredKnownRootsEstablished !== false
      || !classGuard(summary, report.configuration.minClassPerSplit))) {
      throw new Error("COMPONENT_SUPPORT_BOUNDARY_INVALID");
    }
    const metricBlocks = [
      report.calibration.calibrationMetricsBefore,
      report.calibration.calibrationMetricsAfter,
      report.holdout.trainingPrevalenceBaselineMetrics,
      report.holdout.uncalibratedMetrics,
      report.holdout.calibratedMetrics,
    ];
    if (metricBlocks.some((metric) =>
      metric?.weighting !== "ROW_WEIGHTED_DESCRIPTIVE_METRIC_NOT_CLUSTER_BALANCED"
      || metric.clusterRobustInferenceEstablished !== false
      || metric.effectiveIndependentComponentCount !== null)
      || report.calibration.clusterRobustCalibrationInferenceEstablished !== false
      || report.holdout.clusterRobustInferenceEstablished !== false
      || report.holdout.effectiveIndependentComponentCount !== null
      || report.modelCard.knownCorrelationRootLeakageAcrossSplitsPrevented !== true
      || Object.hasOwn(report.modelCard, "featureLeakageAcrossRowsPrevented")
      || report.modelCard.clusterRobustInferenceEstablished !== false) {
      throw new Error("DEPENDENCE_INFERENCE_BOUNDARY_INVALID");
    }
    const componentBalancedMetricBlocks = [
      report.holdout.trainingPrevalenceBaselineComponentBalancedMetrics,
      report.holdout.uncalibratedComponentBalancedMetrics,
      report.holdout.calibratedComponentBalancedMetrics,
    ];
    if (componentBalancedMetricBlocks.some((metric) =>
      metric?.weighting !== COMPONENT_BALANCED_METRIC
      || metric.eachObservedComponentHasEqualMarginalRowWeight !== true
      || metric.aucUsesClassConditionalWeightNormalization !== true
      || metric.equalPairwiseAucContributionPerComponentEstablished !== false
      || metric.descriptiveOnly !== true
      || metric.confidenceInterval !== null
      || metric.effectiveIndependentComponentCount !== null
      || metric.clusterRobustInferenceEstablished !== false
      || metric.exchangeabilityEstablished !== false
      || metric.newComponentGeneralizationEstablished !== false
      || metric.domainTransportEstablished !== false)) {
      throw new Error("COMPONENT_BALANCED_INFERENCE_BOUNDARY_INVALID");
    }
    const reliability = report.holdout.calibratedReliabilityBinsDescriptiveRowWeighted;
    if (!Array.isArray(reliability) || reliability.length === 0
      || reliability.some((bin) => bin.rowWeightedDescriptiveOnly !== true
        || bin.naiveRowWilson95IgnoringWithinComponentDependence !== null
        || Object.hasOwn(bin, "observedRateWilson95")
        || bin.clusterRobustInterval !== null
        || bin.clusterRobustInferenceEstablished !== false)) {
      throw new Error("RELIABILITY_INFERENCE_BOUNDARY_INVALID");
    }
    return {
      ok: true,
      verificationLevel: "HASHED_TRAINING_REPORT_STRUCTURE_AND_GOVERNANCE_BOUNDARY",
      sourceRecordsReverified: false,
      knownCorrelationRootsPreserved: true,
      strictTemporalOrderEstablished: true,
      calibrationAndTestSeparated: true,
      componentLevelRareClassSupportInternallyConsistent: true,
      componentClassSupportSourceReverified: false,
      domainPartitionInternallyConsistent: true,
      domainAssignmentsSourceReverified: false,
      metricArithmeticInternallyConsistent: true,
      metricValuesSourceRecomputed: false,
      componentBalancedMetricsInternallyBounded: true,
      componentBalancedMetricValuesSourceRecomputed: false,
      holdoutEstimandContractInternallyVerified: true,
      modelNumericShapeVerified: true,
      modelParametersSourceRetrained: false,
      rowWeightedMetricsDisclosed: true,
      componentBalancedDescriptiveMetricsDisclosed: true,
      clusterRobustInferenceEstablished: false,
      randomRowPopulationInferenceEstablished: false,
      newKnownCorrelationComponentGeneralizationEstablished: false,
      newDomainTransportEstablished: false,
      preActionUseEligible: false,
      responsibilityUseEligible: false,
      operationalAuthorityGranted: false,
      trainingReportHash,
      modelHash,
    };
  } catch (error) {
    return { ok: false, verificationLevel: "INVALID",
      sourceRecordsReverified: false, knownCorrelationRootsPreserved: false,
      strictTemporalOrderEstablished: false, calibrationAndTestSeparated: false,
      componentBalancedMetricValuesSourceRecomputed: false,
      newKnownCorrelationComponentGeneralizationEstablished: false,
      newDomainTransportEstablished: false,
      preActionUseEligible: false, responsibilityUseEligible: false,
      operationalAuthorityGranted: false,
      error: `GOVERNED_BEHAVIOR_${error instanceof Error ? error.message : String(error)}` };
  }
}

export function verifyGovernedBehaviorTrainingAgainstRecords(report, records) {
  const structure = verifyGovernedBehaviorTraining(report);
  if (!structure.ok) return structure;
  try {
    const preregistration = buildGovernedBehaviorPreregistration({
      registeredAt: report.preregistration.registeredAt,
      ...report.configuration,
    });
    if (preregistration.preregistrationHash !== report.preregistration.preregistrationHash) {
      throw new Error("PREREGISTRATION_BINDING_INVALID");
    }
    const rebuilt = trainGovernedBehaviorModel(records, { preregistration });
    if (!rebuilt.trained
      || canonicalizeStrict(rebuilt) !== canonicalizeStrict(report)) {
      throw new Error("SOURCE_RECORD_RETRAIN_MISMATCH");
    }
    return {
      ...structure,
      verificationLevel: "FULL_SOURCE_RECORD_RETRAIN_AND_EXACT_REPORT_COMPARE",
      sourceRecordsReverified: true,
      preregistrationReverified: true,
      featuresReextracted: true,
      connectedComponentsRecomputed: true,
      modelRetrained: true,
      modelParametersSourceRetrained: true,
      calibrationRefit: true,
      holdoutMetricsRecomputed: true,
      componentClassSupportSourceReverified: true,
      domainAssignmentsSourceReverified: true,
      metricValuesSourceRecomputed: true,
      componentBalancedMetricValuesSourceRecomputed: true,
      componentBalancedMetricsExactReportCompared: true,
      holdoutEstimandContractReverified: true,
    };
  } catch (error) {
    return {
      ok: false,
      verificationLevel: "FULL_SOURCE_RECORD_RETRAIN_FAILED",
      sourceRecordsReverified: false,
      preregistrationReverified: false,
      featuresReextracted: false,
      connectedComponentsRecomputed: false,
      modelRetrained: false,
      calibrationRefit: false,
      holdoutMetricsRecomputed: false,
      componentBalancedMetricValuesSourceRecomputed: false,
      componentBalancedMetricsExactReportCompared: false,
      holdoutEstimandContractReverified: false,
      preActionUseEligible: false,
      responsibilityUseEligible: false,
      operationalAuthorityGranted: false,
      error: `GOVERNED_BEHAVIOR_${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

export function governedBehaviorForecast(model, record) {
  const { modelHash, ...body } = model ?? {};
  if (model?.schema !== GOVERNED_BEHAVIOR_MODEL_SCHEMA || !HASH.test(modelHash ?? "")
    || modelHash !== digest(GOVERNED_BEHAVIOR_MODEL_SCHEMA, body)) {
    throw new Error("GOVERNED_BEHAVIOR_MODEL_INVALID");
  }
  try {
    verifyGovernedModelSemanticBoundary(model);
  } catch {
    throw new Error("GOVERNED_BEHAVIOR_MODEL_BOUNDARY_INVALID");
  }
  try {
    verifyNumericModelStructure(model);
  } catch {
    throw new Error("GOVERNED_BEHAVIOR_MODEL_NUMERIC_SHAPE_INVALID");
  }
  if (record?.schema === "outsider/supervised-experience/v2") {
    const checked = verifySupervisedExperienceV2(record);
    if (!checked.ok) throw new Error("GOVERNED_BEHAVIOR_RECORD_INVALID");
  }
  const normalized = record?.schema === "outsider/supervised-experience/v2"
    ? supervisedExperienceModelInput(record) : record;
  if (normalized?.schema !== "outsider/experience/v1") {
    throw new Error("GOVERNED_BEHAVIOR_RECORD_INVALID");
  }
  const featureCheck = featureContract(normalized);
  if (!featureCheck.complete) {
    throw new Error(`GOVERNED_BEHAVIOR_FEATURE_MISSINGNESS_NOT_EXPLICITLY_MODELLED:${
      featureCheck.missing.join(",")}`);
  }
  const raw = predictFromRaw(model.underlyingLogistic, featurizeRecord(normalized));
  const calibrated = applyPlatt(model.calibrator, raw);
  return {
    schema: "outsider/governed-behavior-forecast/v2",
    signal: model.signal,
    probability: finite(calibrated, "FORECAST_NONFINITE"),
    uncalibratedProbability: finite(raw, "FORECAST_NONFINITE"),
    intendedUse: model.intendedUse,
    completedRunRetrospectiveOnly: true,
    preActionUseEligible: false,
    contractMutationEligible: false,
    priceUseEligible: false,
    responsibilityUseEligible: false,
    uncertainty: {
      aleatoricRepresentation: "BERNOULLI_PROBABILITY",
      parameterInterval: null,
      modelFormInterval: null,
      transferInterval: null,
    },
    modelHash,
  };
}
