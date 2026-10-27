/*
 * Formation candidate ranking bridge v1.
 *
 * This is a search-order mechanism, not an admission or commitment mechanism.
 * It composes existing Outsider data grouping, actuarial, model-evaluation, and
 * causal-proof math while keeping every authority-bearing state outside the
 * score.  A top-ranked candidate is still only a candidate.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { betaQuantile } from "./outsider-actuarial-mechanism-shadow.js";
import { deriveOutcomeBlindPredictiveGroups } from
  "./outsider-factor-predictive-shadow.js";
import { validateCausalProof } from "./outsider-kernel-store.js";
import {
  auc,
  calibrationError,
  logloss,
  predictFromRaw,
} from "./outsider-model.js";

export const FORMATION_CANDIDATE_RANKING_BRIDGE_V1_SCHEMA =
  "outsider/formation-candidate-ranking-bridge/v1";

export const FORMATION_CANDIDATE_RANKING_ROLES_V1 = Object.freeze([
  "PRIMARY",
  "RECOVERY",
  "WITNESS",
]);

export const FORMATION_CANDIDATE_RANKING_POLICY_V1 = Object.freeze({
  schema: "outsider/formation-candidate-ranking-policy/v1",
  version: "1.0.0",
  empiricalPrior: "JEFFREYS_BETA_HALF_HALF",
  empiricalLowerCredibleQuantile: 0.05,
  noModelWeights: Object.freeze({ empirical: 0.9, causal: 0.1, model: 0 }),
  promotedModelWeights: Object.freeze({ empirical: 0.75, causal: 0.1, model: 0.15 }),
  failureDomainMultipliers: Object.freeze({
    PRIMARY: 1,
    DISTINCT: 1,
    UNKNOWN: 0.75,
    OVERLAP: 0.5,
  }),
  modelPromotionGate: Object.freeze({
    minimumHoldoutRows: 20,
    minimumAucIncrementOverBaseline: 0.02,
    requireLowerLoglossThanBaseline: true,
    maximumCalibrationError: 0.1,
    groupDisjointHoldoutRequired: true,
    outcomeBlindRandomAuditReserveExcludedRequired: true,
  }),
  decisionEffect: "SEARCH_ORDER_ONLY",
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const OUTCOMES = new Set(["SUCCESS", "FAILURE", "AMBIGUOUS"]);
const ROLE_SET = new Set(FORMATION_CANDIDATE_RANKING_ROLES_V1);
const MAX_CANDIDATES = 10_000;
const MAX_OBSERVATIONS_PER_CANDIDATE = 100_000;
const MAX_CAUSAL_PROOFS_PER_CANDIDATE = 1_000;

function fail(code) {
  throw new Error(`FORMATION_CANDIDATE_RANKING_V1_${code}`);
}

function plain(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exact(value, keys, code) {
  if (!plain(value)
    || Object.keys(value).sort().join("\0") !== [...keys].sort().join("\0")) fail(code);
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function rounded(value) {
  return Number(value.toFixed(12));
}

function uniqueHashes(values, code, maximum = 10_000) {
  if (!Array.isArray(values) || values.length > maximum) fail(code);
  const normalized = values.map((value) => hash(value, code)).sort();
  if (new Set(normalized).size !== normalized.length) fail(`${code}_DUPLICATE`);
  return normalized;
}

function validateSerializedModel(model) {
  exact(model, ["schema", "featureNames", "weights", "bias", "standardizer", "meta"],
    "MODEL_SCHEMA_INVALID");
  if (model.schema !== "outsider/logistic-model/v1"
    || !Array.isArray(model.featureNames) || model.featureNames.length === 0
    || new Set(model.featureNames).size !== model.featureNames.length
    || model.featureNames.some((name) => typeof name !== "string" || name.length === 0)
    || !Array.isArray(model.weights) || model.weights.length !== model.featureNames.length
    || model.weights.some((value) => !Number.isFinite(value))
    || !Number.isFinite(model.bias)) fail("MODEL_SCHEMA_INVALID");
  exact(model.standardizer, ["mean", "std"], "MODEL_STANDARDIZER_INVALID");
  if (!Array.isArray(model.standardizer.mean) || !Array.isArray(model.standardizer.std)
    || model.standardizer.mean.length !== model.featureNames.length
    || model.standardizer.std.length !== model.featureNames.length
    || model.standardizer.mean.some((value) => !Number.isFinite(value))
    || model.standardizer.std.some((value) => !Number.isFinite(value) || value <= 0)) {
    fail("MODEL_STANDARDIZER_INVALID");
  }
}

function validateProbabilities(values, length, code) {
  if (!Array.isArray(values) || values.length !== length
    || values.some((value) => !Number.isFinite(value) || value < 0 || value > 1)) fail(code);
}

function evaluateModelCard(modelCard) {
  if (modelCard === null) return {
    status: "KEEP_BASELINE",
    blockers: ["NO_FROZEN_MODEL_CARD"],
    modelRefHash: null,
    modelArtifactHash: null,
    holdout: null,
  };
  exact(modelCard, ["modelRefHash", "trainingSourceReplayReceiptHash",
    "serializedModel", "holdout"], "MODEL_CARD_SCHEMA_INVALID");
  hash(modelCard.modelRefHash, "MODEL_REF_HASH_INVALID");
  hash(modelCard.trainingSourceReplayReceiptHash,
    "MODEL_TRAINING_SOURCE_REPLAY_RECEIPT_HASH_INVALID");
  validateSerializedModel(modelCard.serializedModel);
  const holdout = modelCard.holdout;
  exact(holdout, ["splitRootHash", "sourceReplayReceiptHash", "groupDisjoint",
    "outcomeBlindRandomAuditReserveExcluded", "predictions", "baselinePredictions",
    "labels"], "MODEL_HOLDOUT_SCHEMA_INVALID");
  hash(holdout.splitRootHash, "MODEL_SPLIT_ROOT_HASH_INVALID");
  hash(holdout.sourceReplayReceiptHash, "MODEL_HOLDOUT_REPLAY_RECEIPT_HASH_INVALID");
  if (!Array.isArray(holdout.labels)
    || holdout.labels.some((value) => typeof value !== "boolean")) {
    fail("MODEL_HOLDOUT_LABELS_INVALID");
  }
  validateProbabilities(holdout.predictions, holdout.labels.length,
    "MODEL_HOLDOUT_PREDICTIONS_INVALID");
  validateProbabilities(holdout.baselinePredictions, holdout.labels.length,
    "MODEL_HOLDOUT_BASELINE_INVALID");
  const labels = holdout.labels.map((value) => value ? 1 : 0);
  const modelAuc = auc(holdout.predictions, labels);
  const baselineAuc = auc(holdout.baselinePredictions, labels);
  const metrics = {
    rows: labels.length,
    positives: labels.filter(Boolean).length,
    negatives: labels.filter((value) => !value).length,
    model: {
      auc: modelAuc === null ? null : rounded(modelAuc),
      logloss: labels.length === 0 ? null : rounded(logloss(holdout.predictions, labels)),
      calibrationError: labels.length === 0
        ? null : rounded(calibrationError(holdout.predictions, labels)),
    },
    baseline: {
      auc: baselineAuc === null ? null : rounded(baselineAuc),
      logloss: labels.length === 0
        ? null : rounded(logloss(holdout.baselinePredictions, labels)),
      calibrationError: labels.length === 0
        ? null : rounded(calibrationError(holdout.baselinePredictions, labels)),
    },
  };
  const gate = FORMATION_CANDIDATE_RANKING_POLICY_V1.modelPromotionGate;
  const blockers = [];
  if (labels.length < gate.minimumHoldoutRows) blockers.push("HOLDOUT_TOO_SMALL");
  if (metrics.positives === 0 || metrics.negatives === 0) blockers.push("HOLDOUT_ONE_CLASS");
  if (holdout.groupDisjoint !== true) blockers.push("HOLDOUT_NOT_GROUP_DISJOINT");
  if (holdout.outcomeBlindRandomAuditReserveExcluded !== true) {
    blockers.push("OUTCOME_BLIND_RANDOM_AUDIT_RESERVE_NOT_EXCLUDED");
  }
  if (modelAuc === null || baselineAuc === null
    || modelAuc - baselineAuc < gate.minimumAucIncrementOverBaseline) {
    blockers.push("AUC_INCREMENT_GATE_NOT_MET");
  }
  if (metrics.model.logloss === null || metrics.baseline.logloss === null
    || metrics.model.logloss >= metrics.baseline.logloss) {
    blockers.push("LOGLOSS_NOT_BETTER_THAN_BASELINE");
  }
  if (metrics.model.calibrationError === null
    || metrics.model.calibrationError > gate.maximumCalibrationError) {
    blockers.push("CALIBRATION_GATE_NOT_MET");
  }
  return {
    status: blockers.length === 0
      ? "PROMOTED_FOR_SEARCH_RANKING_ONLY" : "KEEP_BASELINE",
    blockers,
    modelRefHash: modelCard.modelRefHash,
    modelArtifactHash: digest("outsider/formation-ranking-model-artifact/v1",
      modelCard.serializedModel),
    trainingSourceReplayReceiptHash: modelCard.trainingSourceReplayReceiptHash,
    holdout: {
      splitRootHash: holdout.splitRootHash,
      sourceReplayReceiptHash: holdout.sourceReplayReceiptHash,
      groupDisjoint: holdout.groupDisjoint === true,
      outcomeBlindRandomAuditReserveExcluded:
        holdout.outcomeBlindRandomAuditReserveExcluded === true,
      metrics,
    },
  };
}

function empiricalComponent(candidate) {
  const observations = candidate.empiricalObservations;
  if (!Array.isArray(observations) || observations.length > MAX_OBSERVATIONS_PER_CANDIDATE) {
    fail("EMPIRICAL_OBSERVATIONS_INVALID");
  }
  const seen = new Set();
  for (const observation of observations) {
    exact(observation, ["observationRefHash", "datasetId", "correlationRoots",
      "sourceReplayReceiptHash", "outcome", "independentOfProvider"],
    "EMPIRICAL_OBSERVATION_SCHEMA_INVALID");
    const ref = hash(observation.observationRefHash, "OBSERVATION_REF_HASH_INVALID");
    if (seen.has(ref)) fail("DUPLICATE_OBSERVATION_REF_HASH");
    seen.add(ref);
    hash(observation.sourceReplayReceiptHash, "OBSERVATION_REPLAY_RECEIPT_HASH_INVALID");
    if (typeof observation.datasetId !== "string" || observation.datasetId.length === 0
      || observation.datasetId.length > 256 || !OUTCOMES.has(observation.outcome)
      || typeof observation.independentOfProvider !== "boolean") {
      fail("EMPIRICAL_OBSERVATION_VALUE_INVALID");
    }
    uniqueHashes(observation.correlationRoots, "CORRELATION_ROOTS_INVALID", 1_000);
    if (observation.correlationRoots.length === 0) fail("CORRELATION_ROOTS_REQUIRED");
  }
  if (observations.length === 0) return {
    suppliedObservations: 0,
    outcomeBlindCorrelationComponents: 0,
    successes: 0,
    failures: 0,
    ambiguous: 0,
    conservativeSuccessLowerBound: rounded(betaQuantile(0.05, 0.5, 0.5)),
  };
  const groupIds = deriveOutcomeBlindPredictiveGroups(observations);
  const groups = new Map();
  observations.forEach((observation, index) => {
    const id = groupIds[index];
    if (!groups.has(id)) groups.set(id, []);
    groups.get(id).push(observation);
  });
  let successes = 0; let failures = 0; let ambiguous = 0;
  for (const rows of groups.values()) {
    const witnessNotIndependent = candidate.role === "WITNESS"
      && rows.some((row) => row.independentOfProvider !== true);
    if (rows.some((row) => row.outcome === "FAILURE")) failures += 1;
    else if (witnessNotIndependent || rows.some((row) => row.outcome === "AMBIGUOUS")) {
      ambiguous += 1;
    } else successes += 1;
  }
  return {
    suppliedObservations: observations.length,
    outcomeBlindCorrelationComponents: groups.size,
    successes,
    failures,
    ambiguous,
    conservativeSuccessLowerBound: rounded(betaQuantile(0.05,
      successes + 0.5, failures + ambiguous + 0.5)),
  };
}

function causalComponent(candidate) {
  if (!Array.isArray(candidate.causalEvidence)
    || candidate.causalEvidence.length > MAX_CAUSAL_PROOFS_PER_CANDIDATE) {
    fail("CAUSAL_EVIDENCE_INVALID");
  }
  const seen = new Set();
  let complete = 0;
  const rejectedReasonCounts = new Map();
  for (const evidence of candidate.causalEvidence) {
    exact(evidence, ["evidenceRefHash", "sourceReplayReceiptHash", "events"],
      "CAUSAL_EVIDENCE_SCHEMA_INVALID");
    const ref = hash(evidence.evidenceRefHash, "CAUSAL_EVIDENCE_REF_HASH_INVALID");
    if (seen.has(ref)) fail("DUPLICATE_CAUSAL_EVIDENCE_REF_HASH");
    seen.add(ref);
    hash(evidence.sourceReplayReceiptHash, "CAUSAL_REPLAY_RECEIPT_HASH_INVALID");
    if (!Array.isArray(evidence.events)) fail("CAUSAL_EVENTS_INVALID");
    const checked = validateCausalProof(evidence.events);
    if (checked.complete) complete += 1;
    else for (const reason of checked.errors) {
      const key = digest("outsider/formation-ranking-causal-rejection/v1", reason);
      rejectedReasonCounts.set(key, (rejectedReasonCounts.get(key) ?? 0) + 1);
    }
  }
  const supplied = candidate.causalEvidence.length;
  return {
    suppliedProofs: supplied,
    completeProofs: complete,
    completenessRatio: supplied === 0 ? 0 : rounded(complete / supplied),
    rejectedReasonCounts: [...rejectedReasonCounts.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([reasonHash, count]) => ({ reasonHash, count })),
  };
}

function failureDomainComponent(candidate, avoidFailureDomainRefHashes) {
  const roots = uniqueHashes(candidate.failureDomainRefHashes,
    "FAILURE_DOMAIN_REF_HASHES_INVALID", 1_000);
  if (candidate.role === "PRIMARY") return {
    suppliedFailureDomainRefCount: roots.length,
    avoidedFailureDomainOverlapCount: 0,
    separationState: "PRIMARY_NOT_APPLICABLE",
    multiplier: 1,
  };
  const avoid = new Set(avoidFailureDomainRefHashes);
  const overlap = roots.filter((root) => avoid.has(root)).length;
  const separationState = roots.length === 0 ? "UNKNOWN" : overlap > 0 ? "OVERLAP" : "DISTINCT";
  return {
    suppliedFailureDomainRefCount: roots.length,
    avoidedFailureDomainOverlapCount: overlap,
    separationState,
    multiplier: FORMATION_CANDIDATE_RANKING_POLICY_V1
      .failureDomainMultipliers[separationState],
  };
}

function rankCandidate(candidate, modelCard, modelEvaluation, avoidFailureDomainRefHashes) {
  exact(candidate, ["candidateRefHash", "role", "failureDomainRefHashes",
    "empiricalObservations", "causalEvidence", "modelFeatureVector"],
  "CANDIDATE_SCHEMA_INVALID");
  hash(candidate.candidateRefHash, "CANDIDATE_REF_HASH_INVALID");
  if (!ROLE_SET.has(candidate.role)) fail("CANDIDATE_ROLE_INVALID");
  const empirical = empiricalComponent(candidate);
  const causal = causalComponent(candidate);
  const failureDomain = failureDomainComponent(candidate, avoidFailureDomainRefHashes);
  const modelPromoted = modelEvaluation.status === "PROMOTED_FOR_SEARCH_RANKING_ONLY";
  let modelProbability = null;
  if (modelPromoted) {
    if (!Array.isArray(candidate.modelFeatureVector)
      || candidate.modelFeatureVector.length !== modelCard.serializedModel.featureNames.length
      || candidate.modelFeatureVector.some((value) => !Number.isFinite(value))) {
      fail("CANDIDATE_MODEL_FEATURE_VECTOR_INVALID");
    }
    modelProbability = rounded(predictFromRaw(modelCard.serializedModel,
      candidate.modelFeatureVector));
  } else if (candidate.modelFeatureVector !== null
    && (!Array.isArray(candidate.modelFeatureVector)
      || candidate.modelFeatureVector.some((value) => !Number.isFinite(value)))) {
    fail("CANDIDATE_MODEL_FEATURE_VECTOR_INVALID");
  }
  const weights = modelPromoted
    ? FORMATION_CANDIDATE_RANKING_POLICY_V1.promotedModelWeights
    : FORMATION_CANDIDATE_RANKING_POLICY_V1.noModelWeights;
  const unseparatedScore = weights.empirical * empirical.conservativeSuccessLowerBound
    + weights.causal * causal.completenessRatio
    + weights.model * (modelProbability ?? 0);
  const score = rounded(unseparatedScore * failureDomain.multiplier);
  const explanationCodes = [
    "EMPIRICAL_JEFFREYS_LOWER_BOUND_FROM_OUTCOME_BLIND_COMPONENTS",
    causal.suppliedProofs === 0 ? "NO_CAUSAL_PROOF_CONTRIBUTION"
      : "EXISTING_CAUSAL_PROOF_VALIDATOR_CONTRIBUTION",
    modelPromoted ? "BOUNDED_PROMOTED_MODEL_CONTRIBUTION"
      : "MODEL_KEEP_BASELINE_NO_CONTRIBUTION",
    `FAILURE_DOMAIN_${failureDomain.separationState}`,
    "RANKING_DOES_NOT_ESTABLISH_AUTHORITY_CAPACITY_OR_OUTCOME",
  ];
  return {
    candidateRefHash: candidate.candidateRefHash,
    role: candidate.role,
    rankingScore: score,
    components: {
      empirical,
      causal,
      model: {
        status: modelEvaluation.status,
        contributed: modelPromoted,
        probability: modelProbability,
        weight: weights.model,
      },
      failureDomain,
    },
    explanationCodes,
  };
}

/**
 * Rank already-discovered candidates. The result may only be used to decide
 * which source to try first; it never filters a hard requirement or mutates an
 * authority/capacity/outcome record.
 */
export function rankFormationCandidatesV1(input = {}) {
  exact(input, ["formationPlanHash", "avoidFailureDomainRefHashes", "modelCard",
    "candidates"], "INPUT_SCHEMA_INVALID");
  const formationPlanHash = hash(input.formationPlanHash, "FORMATION_PLAN_HASH_INVALID");
  const avoidFailureDomainRefHashes = uniqueHashes(input.avoidFailureDomainRefHashes,
    "AVOID_FAILURE_DOMAIN_REF_HASHES_INVALID", 10_000);
  if (!Array.isArray(input.candidates) || input.candidates.length > MAX_CANDIDATES) {
    fail("CANDIDATES_INVALID");
  }
  const candidateRefs = input.candidates.map((candidate) =>
    hash(candidate?.candidateRefHash, "CANDIDATE_REF_HASH_INVALID"));
  if (new Set(candidateRefs).size !== candidateRefs.length) fail("DUPLICATE_CANDIDATE_REF_HASH");
  const modelEvaluation = evaluateModelCard(input.modelCard);
  const scored = input.candidates.map((candidate) => rankCandidate(candidate,
    input.modelCard, modelEvaluation, avoidFailureDomainRefHashes));
  const rankings = Object.fromEntries(FORMATION_CANDIDATE_RANKING_ROLES_V1.map((role) => {
    const rows = scored.filter((candidate) => candidate.role === role)
      .sort((left, right) => right.rankingScore - left.rankingScore
        || left.candidateRefHash.localeCompare(right.candidateRefHash))
      .map((candidate, index) => ({ rank: index + 1, ...candidate }));
    return [role, rows];
  }));
  const body = {
    schema: FORMATION_CANDIDATE_RANKING_BRIDGE_V1_SCHEMA,
    schemaVersion: "1.0.0",
    formationPlanHash,
    policy: FORMATION_CANDIDATE_RANKING_POLICY_V1,
    avoidFailureDomainRefHashes,
    candidateCount: scored.length,
    modelEvaluation,
    rankings,
    boundary: {
      purpose: "FORMATION_SEARCH_ORDER_ONLY",
      candidateAdmissionChanged: false,
      grantsAuthority: false,
      provesCapacity: false,
      reservesCapacity: false,
      provesIndependentOutcomeTruth: false,
      createsCommitment: false,
      authorizesExecution: false,
      authorizesPayment: false,
      financialEffect: "none",
      modelScoreIsAuthority: false,
      modelScoreIsCapacity: false,
      modelScoreIsOutcomeTruth: false,
      sourceReplayReceiptReferencePresenceIsSourceReplayVerification: false,
      enabledCapabilitiesSubsetOfProvenAuthorityInvariantUnaffected: true,
    },
  };
  return deepFreeze({ ...body,
    rankingHash: digest(FORMATION_CANDIDATE_RANKING_BRIDGE_V1_SCHEMA, body) });
}

const RECOVERY_COST_FIELDS = Object.freeze([
  "ordinaryRecoveryAtFailure", "reservationFee", "unusedReservationRelease",
  "reservedRecoveryExercise",
]);
const RECOVERY_COST_ACTIONS = Object.freeze({
  ordinaryRecoveryAtFailure: "ACQUIRE_ORDINARY_RECOVERY_FAILURE_TIME_COST",
  reservationFee: "ACQUIRE_OWNER_RESERVATION_FEE",
  unusedReservationRelease: "ACQUIRE_UNUSED_RESERVATION_RELEASE_COST",
  reservedRecoveryExercise: "ACQUIRE_RESERVED_RECOVERY_EXERCISE_COST",
});

function referencedCost(value) {
  if (value === null || value === undefined) return null;
  exact(value, ["amountMinor", "evidenceRefHashes"], "RECOVERY_COST_INVALID");
  if (typeof value.amountMinor !== "string"
    || !/^(0|[1-9][0-9]{0,17})$/u.test(value.amountMinor)) {
    fail("RECOVERY_COST_AMOUNT_INVALID");
  }
  if (uniqueHashes(value.evidenceRefHashes, "RECOVERY_COST_SOURCE_INVALID").length === 0) {
    fail("RECOVERY_COST_SOURCE_REQUIRED");
  }
  return value.amountMinor;
}

function addKnownCosts(...values) {
  return values.some((value) => value === null) ? null
    : values.reduce((sum, value) => sum + BigInt(value), 0n).toString();
}

function costDifference(reserved, ordinary) {
  return reserved === null || ordinary === null ? null
    : (BigInt(reserved) - BigInt(ordinary)).toString();
}

/**
 * Continue fact acquisition alongside ranking. Costs describe conditional
 * incremental recovery spend; a current retail quote is never substituted for
 * a future failure-time quote, capacity right, or probability of success.
 */
export function buildFormationDecisionSupportV1({
  formationPlanHash, hardConstraintEvaluations, recoveryCostEvidence = null,
}) {
  hash(formationPlanHash, "FORMATION_PLAN_HASH_INVALID");
  if (!Array.isArray(hardConstraintEvaluations)) fail("DECISION_EVALUATIONS_INVALID");
  const evaluations = new Map(hardConstraintEvaluations.map((row) =>
    [hash(row.candidateRefHash, "CANDIDATE_REF_HASH_INVALID"), row]));
  const costs = new Map();
  if (recoveryCostEvidence !== null) {
    exact(recoveryCostEvidence, ["formationPlanHash", "candidateCosts"],
      "RECOVERY_COST_EVIDENCE_INVALID");
    if (recoveryCostEvidence.formationPlanHash !== formationPlanHash
      || !Array.isArray(recoveryCostEvidence.candidateCosts)
      || recoveryCostEvidence.candidateCosts.length > MAX_CANDIDATES) {
      fail("RECOVERY_COST_PLAN_BINDING_INVALID");
    }
    for (const row of recoveryCostEvidence.candidateCosts) {
      exact(row, ["candidateRefHash", "currency", ...RECOVERY_COST_FIELDS],
        "RECOVERY_COST_ROW_INVALID");
      const candidate = evaluations.get(row.candidateRefHash);
      if (!candidate || candidate.role !== "RECOVERY"
        || costs.has(row.candidateRefHash)) fail("RECOVERY_COST_CANDIDATE_BINDING_INVALID");
      if (!/^[A-Z]{3}$/u.test(row.currency ?? "")
        || (candidate.facts.currency && candidate.facts.currency !== row.currency)) {
        fail("RECOVERY_COST_CURRENCY_INVALID");
      }
      costs.set(row.candidateRefHash, { currency: row.currency,
        ...Object.fromEntries(RECOVERY_COST_FIELDS.map((field) =>
          [field, referencedCost(row[field])])) });
    }
  }
  const routeProgress = hardConstraintEvaluations.map((row) => {
    const rejected = row.hardFilterDecision === "REJECT_HARD_CONSTRAINT";
    const planning = row.facts.etaQuotePlanning ?? null;
    const nextActions = rejected ? ["FIND_SPECIFICATION_COMPLIANT_ALTERNATIVE"] : [
      ...(planning?.nextActions ?? []),
      ...(row.constraints.budget.state === "PASS" || planning?.observedCurrentTotalMinor != null
        ? [] : ["ACQUIRE_SELLER_FINAL_ALL_IN_TOTAL"]),
      ...(row.constraints.deadline.state === "PASS" || planning !== null
        ? [] : ["ACQUIRE_STRUCTURED_DESTINATION_ETA"]),
      "DISCOVER_OWNER_RESERVATION_TERMS",
      "DISCOVER_RESERVABLE_ALTERNATIVE_IF_OWNER_CANNOT_RESERVE",
      "ACQUIRE_OWNER_ISSUED_RESERVATION_THROUGH_AUTHORIZED_LIFECYCLE",
      "REFRESH_QUOTE_AND_ETA_BEFORE_NEW_TRANSACTION",
    ];
    return {
      provider: row.provider,
      role: row.role,
      searchEligible: !rejected,
      productConstraintState: row.constraints.product.state,
      budgetConstraintState: row.constraints.budget.state,
      deadlineConstraintState: row.constraints.deadline.state,
      observedFinalTotalMinor: row.facts.finalTotalMinor
        ?? (planning?.observedCurrentTotalMinor == null ? null
          : String(planning.observedCurrentTotalMinor)),
      sourceObservedAt: row.facts.observedAt ?? planning?.sourceObservedAt ?? null,
      quoteFreshness: "NOT_REVALIDATED",
      structuredEtaObserved: row.facts.structuredEtaAvailable === true
        || row.facts.sourceDateMeetsRequestedDeadline === true,
      capacityState: "OWNER_RESERVATION_NOT_ESTABLISHED",
      ownerReservationInterfaceAvailable: null,
      reservationTermsState: "ACQUIRE_FROM_RESOURCE_OWNER",
      quoteAcquisitionDependsOnReservationInterface: false,
      ...(planning === null ? {} : { shippingQuotePlanning: planning }),
      nextActions,
    };
  });
  const recoveryCostComparisons = hardConstraintEvaluations
    .filter((row) => row.role === "RECOVERY" && row.materializedForRanking)
    .map((row) => {
      const supplied = costs.get(row.candidateRefHash);
      const values = Object.fromEntries(RECOVERY_COST_FIELDS.map((field) =>
        [field, supplied?.[field] ?? null]));
      const unused = addKnownCosts(values.reservationFee, values.unusedReservationRelease);
      const exercised = addKnownCosts(values.reservationFee, values.reservedRecoveryExercise);
      const missingCostFields = RECOVERY_COST_FIELDS.filter((field) => values[field] === null);
      return {
        provider: row.provider,
        currency: supplied?.currency ?? row.facts.currency ?? null,
        observedReplacementQuoteMinor: row.facts.finalTotalMinor ?? null,
        sourceObservedAt: row.facts.observedAt ?? null,
        quoteFreshness: "NOT_REVALIDATED",
        observedQuoteIsFailureTimePrice: false,
        costScope: "INCREMENTAL_RECOVERY_SPEND_EXCLUDES_PRIMARY_AND_COMMON_VERIFICATION",
        sourceBasis: "SOURCE_REFERENCES_DO_NOT_ESTABLISH_SOURCE_REPLAY_OR_CAPACITY",
        comparisonState: missingCostFields.length === 0 ? "CONDITIONAL_COSTS_AVAILABLE"
          : "PARTIAL_CONTINUE_FACT_ACQUISITION",
        missingCostFields,
        ordinaryRecovery: { primarySucceedsCostMinor: "0",
          primaryFailsCostMinor: values.ordinaryRecoveryAtFailure },
        reservedRecovery: { reservationFeeMinor: values.reservationFee,
          unusedReleaseCostMinor: values.unusedReservationRelease,
          exerciseCostMinor: values.reservedRecoveryExercise,
          primarySucceedsCostMinor: unused, primaryFailsCostMinor: exercised },
        reservedMinusOrdinary: { primarySucceedsCostMinor: costDifference(unused, "0"),
          primaryFailsCostMinor: costDifference(exercised, values.ordinaryRecoveryAtFailure) },
        expectedCostMinor: null,
        preferredStrategy: null,
        nextActions: missingCostFields.map((field) => RECOVERY_COST_ACTIONS[field]),
      };
    });
  return deepFreeze({ routeProgress, recoveryCostComparisons,
    boundary: { decisionEffect: "FACT_ACQUISITION_ONLY", changesHardAdmission: false,
      establishesCapacity: false, authorizesPayment: false, createsCommitment: false,
      missingCostsBlockFactAcquisition: false } });
}
