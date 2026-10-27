import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  buildFormationDecisionSupportV1,
  rankFormationCandidatesV1,
} from "../src/outsider-formation-candidate-ranking-bridge-v1.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;

function recoveryDecisionInput() {
  return {
    formationPlanHash: h("synthetic-cost-plan"),
    hardConstraintEvaluations: [{
      candidateRefHash: h("synthetic-recovery-candidate"),
      provider: "SYNTHETIC_RECOVERY_PROVIDER", role: "RECOVERY",
      materializedForRanking: true, hardFilterDecision: "CONTINUE_FORMATION",
      constraints: { product: { state: "PASS" }, budget: { state: "PASS" },
        deadline: { state: "UNKNOWN" } },
      facts: { currency: "USD", finalTotalMinor: "1817", structuredEtaAvailable: false },
    }],
  };
}

function syntheticCostEvidence(input, overrides = {}) {
  const cost = (amountMinor) => ({ amountMinor,
    evidenceRefHashes: [h(`synthetic-source:${amountMinor}`)] });
  return {
    formationPlanHash: input.formationPlanHash,
    candidateCosts: [{ candidateRefHash: input.hardConstraintEvaluations[0].candidateRefHash,
      currency: "USD", ordinaryRecoveryAtFailure: cost("2000"),
      reservationFee: cost("100"), unusedReservationRelease: cost("0"),
      reservedRecoveryExercise: cost("1500"), ...overrides }],
  };
}

test("decision support carries existing quotes while separately acquiring ETA and reservation capability", () => {
  const result = buildFormationDecisionSupportV1(recoveryDecisionInput());
  const route = result.routeProgress[0];
  const comparison = result.recoveryCostComparisons[0];
  assert.equal(route.observedFinalTotalMinor, "1817");
  assert.equal(route.nextActions.includes("ACQUIRE_SELLER_FINAL_ALL_IN_TOTAL"), false);
  assert.ok(route.nextActions.includes("ACQUIRE_STRUCTURED_DESTINATION_ETA"));
  assert.ok(route.nextActions.includes("DISCOVER_OWNER_RESERVATION_TERMS"));
  assert.ok(route.nextActions.includes("DISCOVER_RESERVABLE_ALTERNATIVE_IF_OWNER_CANNOT_RESERVE"));
  assert.equal(route.quoteAcquisitionDependsOnReservationInterface, false);
  assert.equal(route.ownerReservationInterfaceAvailable, null);
  assert.equal(comparison.observedReplacementQuoteMinor, "1817");
  assert.equal(comparison.quoteFreshness, "NOT_REVALIDATED");
  assert.equal(comparison.ordinaryRecovery.primaryFailsCostMinor, null);
  assert.equal(comparison.reservedRecovery.primarySucceedsCostMinor, null);
  assert.equal(comparison.preferredStrategy, null);
  assert.equal(result.boundary.missingCostsBlockFactAcquisition, false);
});

test("ETA next-quote recommendations enter machine actions without promoting source dates or capacity", () => {
  const input = recoveryDecisionInput();
  const row = input.hardConstraintEvaluations[0];
  row.facts = { etaQuotePlanning: { observedCurrentTotalMinor: 1395,
    sourceObservedAt: "2026-09-05T02:31:07.861Z",
    nextActions: ["SEARCH_DEADLINE_FEASIBLE_SUPPLIER_WITHIN_BUDGET",
      "REQUEST_DESTINATION_DATE_FOR_BUDGET_FEASIBLE_SERVICE"] } };
  row.constraints.budget.state = "UNKNOWN";
  const result = buildFormationDecisionSupportV1(input);
  const route = result.routeProgress[0];
  assert.equal(route.observedFinalTotalMinor, "1395");
  assert.deepEqual(route.nextActions.slice(0, 2), row.facts.etaQuotePlanning.nextActions);
  assert.equal(route.nextActions.includes("ACQUIRE_SELLER_FINAL_ALL_IN_TOTAL"), false);
  assert.equal(route.structuredEtaObserved, false);
  assert.equal(route.deadlineConstraintState, "UNKNOWN");
  assert.equal(route.capacityState, "OWNER_RESERVATION_NOT_ESTABLISHED");
  assert.equal(result.boundary.changesHardAdmission, false);
});

test("conditional recovery spend compares sourced amounts without inferring probability or capacity", () => {
  const input = recoveryDecisionInput();
  input.recoveryCostEvidence = syntheticCostEvidence(input);
  const result = buildFormationDecisionSupportV1(input);
  const comparison = result.recoveryCostComparisons[0];
  assert.equal(comparison.comparisonState, "CONDITIONAL_COSTS_AVAILABLE");
  assert.equal(comparison.reservedRecovery.primarySucceedsCostMinor, "100");
  assert.equal(comparison.reservedRecovery.primaryFailsCostMinor, "1600");
  assert.deepEqual(comparison.reservedMinusOrdinary,
    { primarySucceedsCostMinor: "100", primaryFailsCostMinor: "-400" });
  assert.equal(comparison.expectedCostMinor, null);
  assert.equal(comparison.preferredStrategy, null);
  assert.equal(result.routeProgress[0].capacityState, "OWNER_RESERVATION_NOT_ESTABLISHED");
  assert.equal(result.boundary.authorizesPayment, false);
  assert.equal(result.boundary.changesHardAdmission, false);
  input.recoveryCostEvidence = syntheticCostEvidence(input, { reservationFee: null });
  const partial = buildFormationDecisionSupportV1(input).recoveryCostComparisons[0];
  assert.equal(partial.reservedRecovery.primaryFailsCostMinor, null);
  assert.deepEqual(partial.missingCostFields, ["reservationFee"]);
  assert.equal(partial.ordinaryRecovery.primaryFailsCostMinor, "2000");
});

test("recovery cost inputs reject unknown routes, missing source references, and currency mixing", () => {
  const input = recoveryDecisionInput();
  for (const [override, error] of [
    [{ candidateRefHash: h("other-route") }, /CANDIDATE_BINDING_INVALID/u],
    [{ currency: "EUR" }, /CURRENCY_INVALID/u],
    [{ reservationFee: { amountMinor: "10", evidenceRefHashes: [] } }, /SOURCE_REQUIRED/u],
    [{ reservationFee: { amountMinor: "-1", evidenceRefHashes: [h("cost")] } }, /AMOUNT_INVALID/u],
  ]) {
    assert.throws(() => buildFormationDecisionSupportV1({ ...input,
      recoveryCostEvidence: syntheticCostEvidence(input, override) }), error);
  }
  const wrongPlan = syntheticCostEvidence(input);
  wrongPlan.formationPlanHash = h("other-plan");
  assert.throws(() => buildFormationDecisionSupportV1({ ...input,
    recoveryCostEvidence: wrongPlan }), /PLAN_BINDING_INVALID/u);
});

function causalEvents(label) {
  const common = { runId: `run-${label}`, contractSeal: `seal-${label}` };
  const fingerprint = h(`fingerprint:${label}`);
  return [
    { ...common, seq: 1, type: "contract_compiled", successCriteria: 1 },
    { ...common, seq: 2, type: "contract_audited", passed: true },
    { ...common, seq: 3, type: "contract_frozen" },
    { ...common, seq: 4, type: "acceptance_finished", phase: "final", ran: true,
      passed: true, finalFingerprint: fingerprint },
    { ...common, seq: 5, type: "baseline_outcome_approval_audit", passed: true,
      baselineFingerprint: fingerprint },
    { ...common, seq: 6, type: "outcome_verdict", phase: "stop", passed: true,
      insufficient: false, source: "baseline-outcome-attestation",
      finalFingerprint: fingerprint },
  ];
}

function observation(candidate, index, outcome = "SUCCESS", overrides = {}) {
  return {
    observationRefHash: h(`${candidate}:observation:${index}`),
    datasetId: "source-replayed-formation-episodes-v1",
    correlationRoots: [h(`${candidate}:root:${index}`)],
    sourceReplayReceiptHash: h(`${candidate}:replay:${index}`),
    outcome,
    independentOfProvider: true,
    ...overrides,
  };
}

function candidate(label, role, {
  outcomes = ["SUCCESS"],
  roots = [h(`domain:${label}`)],
  causal = true,
  feature = 0,
  observations,
} = {}) {
  return {
    candidateRefHash: h(`candidate:${label}`),
    role,
    failureDomainRefHashes: roots,
    empiricalObservations: observations ?? outcomes.map((outcome, index) =>
      observation(label, index, outcome)),
    causalEvidence: causal ? [{
      evidenceRefHash: h(`${label}:causal`),
      sourceReplayReceiptHash: h(`${label}:causal-replay`),
      events: causalEvents(label),
    }] : [],
    modelFeatureVector: [feature],
  };
}

function promotedModelCard() {
  const labels = Array.from({ length: 20 }, (_, index) => index >= 10);
  return {
    modelRefHash: h("model:route-success"),
    trainingSourceReplayReceiptHash: h("model:training-replay"),
    serializedModel: {
      schema: "outsider/logistic-model/v1",
      featureNames: ["source_replayed_route_quality"],
      weights: [3],
      bias: 0,
      standardizer: { mean: [0], std: [1] },
      meta: { use: "FORMATION_SEARCH_ORDER_ONLY" },
    },
    holdout: {
      splitRootHash: h("model:group-disjoint-split"),
      sourceReplayReceiptHash: h("model:holdout-replay"),
      groupDisjoint: true,
      outcomeBlindRandomAuditReserveExcluded: true,
      predictions: labels.map((label) => label ? 0.95 : 0.05),
      baselinePredictions: labels.map(() => 0.5),
      labels,
    },
  };
}

test("ranks PRIMARY, RECOVERY, and WITNESS using existing evidence math without minting state", () => {
  const sharedDomain = h("domain:primary-selected");
  const correlatedWitness = [
    observation("witness-correlated", 0, "SUCCESS", {
      correlationRoots: [h("witness-shared-root")],
    }),
    observation("witness-correlated", 1, "SUCCESS", {
      correlationRoots: [h("witness-shared-root")],
    }),
  ];
  const result = rankFormationCandidatesV1({
    formationPlanHash: h("formation-plan"),
    avoidFailureDomainRefHashes: [sharedDomain],
    modelCard: promotedModelCard(),
    candidates: [
      candidate("primary-strong", "PRIMARY", {
        outcomes: ["SUCCESS", "SUCCESS", "SUCCESS"], feature: 1,
      }),
      candidate("primary-weak", "PRIMARY", {
        outcomes: ["SUCCESS", "FAILURE"], causal: false, feature: -1,
      }),
      candidate("recovery-overlap", "RECOVERY", {
        outcomes: ["SUCCESS", "SUCCESS"], roots: [sharedDomain], feature: 1,
      }),
      candidate("recovery-distinct", "RECOVERY", {
        outcomes: ["SUCCESS", "SUCCESS"], roots: [h("domain:recovery-distinct")],
        feature: 1,
      }),
      candidate("witness-independent", "WITNESS", {
        observations: correlatedWitness, feature: 1,
      }),
      candidate("witness-not-independent", "WITNESS", {
        observations: [observation("witness-not-independent", 0, "SUCCESS", {
          independentOfProvider: false,
        })], feature: 1,
      }),
    ],
  });

  assert.equal(result.modelEvaluation.status, "PROMOTED_FOR_SEARCH_RANKING_ONLY");
  assert.equal(result.rankings.PRIMARY[0].candidateRefHash, h("candidate:primary-strong"));
  assert.equal(result.rankings.RECOVERY[0].candidateRefHash,
    h("candidate:recovery-distinct"));
  assert.equal(result.rankings.RECOVERY[1].components.failureDomain.separationState,
    "OVERLAP");
  assert.equal(result.rankings.WITNESS[0].candidateRefHash,
    h("candidate:witness-independent"));
  assert.equal(result.rankings.WITNESS[0].components.empirical
    .outcomeBlindCorrelationComponents, 1,
  "two rows sharing a disclosed root contribute one evidence component");
  assert.equal(result.rankings.WITNESS[1].components.empirical.ambiguous, 1,
    "provider-controlled witness success is not counted as independent success");
  assert.equal(result.rankings.PRIMARY[0].components.causal.completeProofs, 1);
  assert.equal(result.boundary.purpose, "FORMATION_SEARCH_ORDER_ONLY");
  assert.equal(result.boundary.grantsAuthority, false);
  assert.equal(result.boundary.provesCapacity, false);
  assert.equal(result.boundary.reservesCapacity, false);
  assert.equal(result.boundary.provesIndependentOutcomeTruth, false);
  assert.equal(result.boundary.createsCommitment, false);
  assert.equal(result.boundary.authorizesExecution, false);
  assert.equal(result.boundary.authorizesPayment, false);
  assert.equal(result.boundary.financialEffect, "none");
  assert.equal(Object.isFrozen(result), true);
});

test("a model that misses fixed holdout gates stays baseline and cannot affect order", () => {
  const bad = promotedModelCard();
  bad.holdout.groupDisjoint = false;
  bad.holdout.predictions = bad.holdout.labels.map(() => 0.5);
  const left = candidate("tie-left", "PRIMARY", { causal: false, feature: -100 });
  const right = candidate("tie-right", "PRIMARY", { causal: false, feature: 100 });
  const result = rankFormationCandidatesV1({
    formationPlanHash: h("formation-plan-baseline"),
    avoidFailureDomainRefHashes: [],
    modelCard: bad,
    candidates: [right, left],
  });

  assert.equal(result.modelEvaluation.status, "KEEP_BASELINE");
  assert.ok(result.modelEvaluation.blockers.includes("HOLDOUT_NOT_GROUP_DISJOINT"));
  assert.ok(result.modelEvaluation.blockers.includes("AUC_INCREMENT_GATE_NOT_MET"));
  assert.equal(result.rankings.PRIMARY[0].components.model.contributed, false);
  assert.equal(result.rankings.PRIMARY[0].components.model.probability, null);
  assert.deepEqual(result.rankings.PRIMARY.map((row) => row.candidateRefHash),
    [left.candidateRefHash, right.candidateRefHash].sort(),
  "failed research model is ignored and the deterministic hash tie-break remains");
});

test("malformed evidence fails closed before producing a ranking", () => {
  const malformed = candidate("malformed", "PRIMARY");
  malformed.empiricalObservations[0].sourceReplayReceiptHash = "not-a-hash";
  assert.throws(() => rankFormationCandidatesV1({
    formationPlanHash: h("formation-plan-malformed"),
    avoidFailureDomainRefHashes: [],
    modelCard: null,
    candidates: [malformed],
  }), /OBSERVATION_REPLAY_RECEIPT_HASH_INVALID/u);
});
