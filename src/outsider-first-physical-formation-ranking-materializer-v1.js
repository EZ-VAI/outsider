/*
 * Concrete first-physical-outcome -> Formation ranking materializer.
 *
 * This joins the current unified product projection and the current SparkFun
 * full-address public projection. Product, budget, and deadline constraints
 * are evaluated before the surviving routes are handed to the general ranking
 * bridge. Current Episode data has no independently established outcome rows,
 * so this version contributes exactly zero empirical or causal observations.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1 } from
  "./outsider-first-physical-outcome-production-composition-v1.js";
import { rankFormationCandidatesV1 } from
  "./outsider-formation-candidate-ranking-bridge-v1.js";

export const FIRST_PHYSICAL_FORMATION_RANKING_MATERIALIZER_V1_SCHEMA =
  "outsider/first-physical-formation-ranking-materializer/v1";

const UNIFIED_SCHEMA = "outsider/first-physical-outcome-unified-product/v1";
const EPISODE_SCHEMA = "outsider/outcome-product-episode-data-bridge-projection/v1";
const SPARKFUN_SCHEMA = "outsider/sparkfun-full-address-prepayment-public-projection/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;

const EXACT_PRODUCT = Object.freeze({
  condition: "NEW",
  connectorA: "USB_A_MALE",
  connectorB: "USB_C_MALE",
  dataRequired: true,
  fiveVoltPowerRequired: true,
  maximumLengthMm: 1100,
  minimumLengthMm: 900,
  quantity: 1,
});

const KNOWN_ROUTES = Object.freeze({
  ADAFRUIT_GUEST_SHOPPER: Object.freeze({ productId: "4474" }),
  SPARKFUN_MAGENTO_GUEST_CART: Object.freeze({
    catalogPath: "/usb-3-1-cable-a-to-c-3-foot.html",
    productId: "4636",
    sku: "CAB-14743",
    quantity: 1,
  }),
});

function fail(code) {
  throw new TypeError(`FIRST_PHYSICAL_FORMATION_RANKING_MATERIALIZER_V1_${code}`);
}

function object(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function selfHash(record, field, expectedSchema, code) {
  object(record, code);
  if (record.schema !== expectedSchema || record.schemaVersion !== "1.0.0") fail(code);
  const expected = hash(record[field], code);
  const body = { ...record };
  delete body[field];
  if (digest(record.schema, body) !== expected) fail(code);
  return expected;
}

function money(value, code) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,30})$/u.test(value)) fail(code);
  return BigInt(value);
}

function failureDomain(provider) {
  return digest("outsider/formation-seller-transaction-failure-domain/v1", {
    provider,
    scope: "PROVIDER_OWNED_TRANSACTION_SURFACE",
  });
}

function candidateRef(programHash, route) {
  return digest("outsider/first-physical-selected-route-candidate/v1", {
    programHash,
    route,
  });
}

function validateUnified(unified) {
  const unifiedResultHash = selfHash(unified, "unifiedResultHash", UNIFIED_SCHEMA,
    "UNIFIED_RESULT_INVALID");
  const product = object(unified.product, "UNIFIED_PRODUCT_INVALID");
  const response = object(product.productResponse, "UNIFIED_PRODUCT_RESPONSE_INVALID");
  const outcome = object(response.outcome, "UNIFIED_OUTCOME_INVALID");
  const episode = object(unified.episodeData, "EPISODE_DATA_INVALID");
  const episodeProjectionHash = selfHash(episode, "projectionHash", EPISODE_SCHEMA,
    "EPISODE_DATA_INVALID");
  if (hash(unified.programHash, "PROGRAM_HASH_INVALID") !== response.programHash
    || unified.programHash !== product.programHash
    || episode.expectedProgramHash !== unified.programHash
    || product.capacityReserved !== false || unified.paymentAttempted !== false
    || unified.orderSubmitted !== false || unified.outcomePromiseIssued !== false
    || episode.externalOutcomeEstablished !== false
    || outcome.statement !== OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1
    || !Array.isArray(outcome.acceptance) || outcome.acceptance.length !== 1
    || !same(outcome.acceptance[0].expected, EXACT_PRODUCT)) {
    fail("UNIFIED_BOUNDARY_OR_OUTCOME_INVALID");
  }
  const budget = object(outcome.budget, "UNIFIED_BUDGET_INVALID");
  if (budget.currency !== "USD") fail("UNIFIED_BUDGET_INVALID");
  money(budget.maximumAmountMinor, "UNIFIED_BUDGET_INVALID");
  if (typeof response.completionDeadline !== "string"
    || !Number.isFinite(Date.parse(response.completionDeadline))) {
    fail("UNIFIED_DEADLINE_INVALID");
  }
  const feeder = object(episode.episodeDataEngineFeeder, "EPISODE_FEEDER_INVALID");
  const reports = episode.episodeAttemptSetComposition?.reportOccurrences;
  if (!Array.isArray(reports)
    || feeder.independentOutcomeCount !== 0
    || feeder.independentRecoveryCount !== 0
    || feeder.authorizedTrainingRows !== 0
    || reports.some((row) => row.outcomeObservationStatus === "OBSERVED"
      || row.reportedOutcomeAcceptedAsIndependentTruth === true)) {
    /* Current Episode bridge cannot produce a candidate-bound complete outcome.
       A future truth-bearing successor needs a new explicit materializer version. */
    fail("UNSUPPORTED_COMPLETE_EPISODE_OUTCOME_INPUT");
  }
  if (!Array.isArray(product.selectedOrderScopedRoutes)
    || !Array.isArray(product.parallelUnselectedCandidateRoutes)) {
    fail("UNIFIED_ROUTES_INVALID");
  }
  return {
    unifiedResultHash,
    episodeProjectionHash,
    product,
    episode,
    budget,
    completionDeadline: response.completionDeadline,
    programHash: unified.programHash,
    reportOccurrenceCount: reports.length,
  };
}

function constraint(state, reasonCode, evidenceRefHashes = []) {
  return { state, reasonCode, evidenceRefHashes: [...evidenceRefHashes].sort() };
}

function evaluation({ candidateRefHash, provider, role, constraints,
  projectionHash, facts, extraBlockers = [] }) {
  const required = Object.values(constraints).filter((item) =>
    item.state !== "NOT_APPLICABLE");
  const contradicted = required.some((item) => item.state === "FAIL");
  const proven = required.length > 0 && required.every((item) => item.state === "PASS");
  const blockers = [...new Set([
    ...required.filter((item) => item.state !== "PASS").map((item) => item.reasonCode),
    ...extraBlockers,
  ])].sort();
  return {
    candidateRefHash,
    provider,
    role,
    projectionHash,
    constraints,
    hardConstraintContradiction: contradicted,
    everyApplicableHardConstraintProven: proven,
    hardFilterDecision: contradicted ? "REJECT_HARD_CONSTRAINT"
      : proven ? "RANK_FOR_FORMATION" : "RANK_FOR_GAP_CLOSURE",
    materializedForRanking: !contradicted,
    commitmentEligible: false,
    commitmentBlockers: blockers,
    facts,
  };
}

function selectedRoute(context, provider) {
  const matches = context.product.selectedOrderScopedRoutes.filter((route) =>
    route.provider === provider);
  if (matches.length !== 1) fail("SELECTED_ROUTE_BINDING_INVALID");
  return matches[0];
}

function adafruitEvaluation(context) {
  const route = selectedRoute(context, "ADAFRUIT_GUEST_SHOPPER");
  if (route.role !== "PRIMARY" || route.productId !== KNOWN_ROUTES
    .ADAFRUIT_GUEST_SHOPPER.productId) fail("ADAFRUIT_ROUTE_INVALID");
  const ref = candidateRef(context.programHash, route);
  return evaluation({ candidateRefHash: ref, provider: route.provider,
    role: "PRIMARY", projectionHash: context.unifiedResultHash,
    constraints: {
      product: constraint("PASS", "FIXED_MILESTONE_PRODUCT_ROUTE_BOUND",
        [context.unifiedResultHash]),
      budget: constraint("UNKNOWN", "ADAFRUIT_ALL_IN_TOTAL_NOT_MATERIALIZED",
        [context.episodeProjectionHash]),
      deadline: constraint("UNKNOWN", "ADAFRUIT_STRUCTURED_ETA_NOT_MATERIALIZED",
        [context.episodeProjectionHash]),
    },
    facts: { detailedSellerProjectionAvailable: false },
    extraBlockers: ["CAPACITY_NOT_RESERVED"],
  });
}

function sparkFunEvaluation(context, projection) {
  const projectionHash = selfHash(projection, "projectionHash", SPARKFUN_SCHEMA,
    "SPARKFUN_PROJECTION_INVALID");
  const route = selectedRoute(context, "SPARKFUN_MAGENTO_GUEST_CART");
  const expected = KNOWN_ROUTES.SPARKFUN_MAGENTO_GUEST_CART;
  if (route.role !== "RECOVERY" || route.sku !== expected.sku
    || !same(projection.product, expected)
    || projection.completionDeadline !== context.completionDeadline
    || projection.budget?.currency !== context.budget.currency
    || projection.budget?.maximumAmountMinor !== context.budget.maximumAmountMinor
    || projection.provider !== route.provider
    || projection.providerSourceEstablishesCapacity !== false
    || projection.capacityReserved !== false || projection.paymentPerformed !== false
    || projection.orderSubmitted !== false || projection.userResultCommitted !== false) {
    fail("SPARKFUN_UNIFIED_BINDING_INVALID");
  }
  const maximum = money(context.budget.maximumAmountMinor, "UNIFIED_BUDGET_INVALID");
  const total = projection.finalTotalMinor === null ? null
    : money(projection.finalTotalMinor, "SPARKFUN_TOTAL_INVALID");
  const budgetState = total === null ? "UNKNOWN"
    : total <= maximum && projection.budgetSatisfied === true ? "PASS" : "FAIL";
  const deadlineState = projection.structuredEtaAvailable === true
    && projection.deliveryDeadlineProven === true ? "PASS" : "UNKNOWN";
  const method = projection.selectedShippingMethod;
  if (method !== null) object(method, "SPARKFUN_SHIPPING_METHOD_INVALID");
  return evaluation({ candidateRefHash: projectionHash, provider: projection.provider,
    role: "RECOVERY", projectionHash,
    constraints: {
      product: constraint("PASS", "FIXED_MILESTONE_PRODUCT_ROUTE_BOUND",
        [projectionHash, context.unifiedResultHash]),
      budget: constraint(budgetState, budgetState === "PASS"
        ? "FULL_ADDRESS_TOTAL_WITHIN_MAXIMUM"
        : budgetState === "FAIL" ? "FULL_ADDRESS_TOTAL_EXCEEDS_MAXIMUM"
          : "FULL_ADDRESS_TOTAL_NOT_AVAILABLE", [projectionHash]),
      deadline: constraint(deadlineState, deadlineState === "PASS"
        ? "STRUCTURED_ETA_MEETS_DEADLINE"
        : "DELIVERY_DEADLINE_UNPROVEN_NO_STRUCTURED_ETA", [projectionHash]),
    },
    facts: {
      currency: context.budget.currency,
      maximumAmountMinor: context.budget.maximumAmountMinor,
      finalTotalMinor: projection.finalTotalMinor,
      selectedShippingMethod: method === null ? null : {
        carrierCode: method.carrierCode,
        methodCode: method.methodCode,
        sourceQuotedAmountMinor: method.sourceQuotedAmountMinor,
      },
      readyForPaymentAuthorization: projection.readyForPaymentAuthorization === true,
      structuredEtaAvailable: projection.structuredEtaAvailable === true,
      deliveryDeadlineProven: projection.deliveryDeadlineProven === true,
      sameProgramOrEpisodeHashCarriedBySellerProjection: false,
      bindingBasis:
        "EXACT_FIXED_PRODUCT_ROUTE_BUDGET_AND_DEADLINE_NO_SHARED_EPISODE_HASH",
    },
    extraBlockers: ["CAPACITY_NOT_RESERVED",
      "SELLER_PROJECTION_TO_UNIFIED_EPISODE_EXACT_HASH_BINDING_UNPROVEN"],
  });
}

function parallelEvaluation(context, candidate) {
  object(candidate, "PARALLEL_CANDIDATE_INVALID");
  const ref = digest("outsider/first-physical-parallel-candidate/v1", {
    programHash: context.programHash,
    candidate,
  });
  if (candidate.provider === "TARGET_REDSKY_READ_ONLY_CANDIDATE") {
    return evaluation({ candidateRefHash: ref, provider: candidate.provider,
      role: "RECOVERY", projectionHash: context.unifiedResultHash,
      constraints: {
        product: constraint(candidate.exactAcceptanceSatisfied === true ? "PASS" : "FAIL",
          candidate.exactAcceptanceSatisfied === true ? "EXACT_PRODUCT_ACCEPTED"
            : "EXACT_PRODUCT_ACCEPTANCE_FAILED", [context.unifiedResultHash]),
        budget: constraint(candidate.allInBudgetProven === true ? "PASS" : "UNKNOWN",
          candidate.allInBudgetProven === true ? "ALL_IN_TOTAL_WITHIN_MAXIMUM"
            : "ALL_IN_TOTAL_NOT_PROVEN", [context.unifiedResultHash]),
        deadline: constraint(candidate.deliveryDeadlineProven === true ? "PASS" : "UNKNOWN",
          candidate.deliveryDeadlineProven === true ? "DELIVERY_DEADLINE_PROVEN"
            : "DELIVERY_DATE_NOT_BINDING", [context.unifiedResultHash]),
      }, facts: { stageState: candidate.stageState },
      extraBlockers: candidate.commitBlockers ?? [],
    });
  }
  if (candidate.provider === "BEST_BUY_US_WEB_SOURCE_PINNED_CANDIDATE") {
    return evaluation({ candidateRefHash: ref, provider: candidate.provider,
      role: "RECOVERY", projectionHash: context.unifiedResultHash,
      constraints: {
        product: constraint(candidate.exactAcceptanceSatisfied === true ? "PASS" : "FAIL",
          candidate.exactAcceptanceSatisfied === true ? "EXACT_PRODUCT_ACCEPTED"
            : "EXACT_QUANTITY_SURPLUS_AUTHORIZATION_REQUIRED",
        [context.unifiedResultHash]),
        budget: constraint(candidate.withinMaximumAmount === true ? "PASS" : "UNKNOWN",
          candidate.withinMaximumAmount === true ? "DISPLAYED_TOTAL_WITHIN_MAXIMUM"
            : "DISPLAYED_TOTAL_NOT_PROVEN", [context.unifiedResultHash]),
        deadline: constraint(candidate.deliveryDeadlineProven === true ? "PASS" : "UNKNOWN",
          candidate.deliveryDeadlineProven === true ? "DELIVERY_DEADLINE_PROVEN"
            : "SOURCE_ETA_NOT_BINDING_UNTIL_ORDER", [context.unifiedResultHash]),
      }, facts: { stageState: candidate.stageState,
        surplusAuthorizationPresent: candidate.surplusAuthorizationPresent === true },
      extraBlockers: candidate.commitBlockers ?? [],
    });
  }
  return null;
}

function rankingCandidate(row) {
  return {
    candidateRefHash: row.candidateRefHash,
    role: row.role,
    failureDomainRefHashes: [failureDomain(row.provider)],
    empiricalObservations: [],
    causalEvidence: [],
    modelFeatureVector: null,
  };
}

export function materializeFirstPhysicalFormationRankingV1(input = {}) {
  object(input, "INPUT_INVALID");
  if (Reflect.ownKeys(input).length !== 2
    || !Object.hasOwn(input, "unifiedResult")
    || !Object.hasOwn(input, "sparkFunFullAddressProjection")) fail("INPUT_INVALID");
  const context = validateUnified(input.unifiedResult);
  const evaluations = [
    adafruitEvaluation(context),
    sparkFunEvaluation(context, input.sparkFunFullAddressProjection),
    ...context.product.parallelUnselectedCandidateRoutes
      .map((candidate) => parallelEvaluation(context, candidate)).filter(Boolean),
  ];
  const primary = evaluations.find((row) => row.role === "PRIMARY"
    && row.materializedForRanking);
  const avoid = primary === undefined ? [] : [failureDomain(primary.provider)];
  const ranking = rankFormationCandidatesV1({
    formationPlanHash: context.programHash,
    avoidFailureDomainRefHashes: avoid,
    modelCard: null,
    candidates: evaluations.filter((row) => row.materializedForRanking)
      .map(rankingCandidate),
  });
  const sparkfun = evaluations.find((row) =>
    row.provider === "SPARKFUN_MAGENTO_GUEST_CART");
  const blockers = [...new Set([
    ...evaluations.filter((row) => row.materializedForRanking)
      .flatMap((row) => row.commitmentBlockers),
    "INDEPENDENT_WITNESS_NOT_ESTABLISHED",
    "PRIMARY_AND_RECOVERY_CAPACITY_NOT_RESERVED",
    "NO_COMPLETE_EPISODE_OUTCOME_HISTORY_FOR_RANKING",
    "SEPARATE_PAYMENT_AUTHORIZATION_NOT_PRESENT",
  ])].sort();
  const body = {
    schema: FIRST_PHYSICAL_FORMATION_RANKING_MATERIALIZER_V1_SCHEMA,
    schemaVersion: "1.0.0",
    formationPlanHash: context.programHash,
    sourceBindings: {
      unifiedResultHash: context.unifiedResultHash,
      episodeDataProjectionHash: context.episodeProjectionHash,
      sparkFunFullAddressProjectionHash: sparkfun.projectionHash,
    },
    hardConstraintEvaluations: evaluations,
    rankingEvidence: {
      episodeReportOccurrenceCount: context.reportOccurrenceCount,
      completeCandidateBoundEpisodeOutcomeObservationCount: 0,
      empiricalObservationsMaterialized: 0,
      causalProofsMaterialized: 0,
      modelDecision: "KEEP_BASELINE",
    },
    ranking,
    materializedRealityFacts: {
      sparkFunFinalTotalMinor: sparkfun.facts.finalTotalMinor,
      sparkFunCurrency: sparkfun.facts.currency,
      sparkFunSelectedShippingMethod: sparkfun.facts.selectedShippingMethod,
      sparkFunBudgetConstraintState: sparkfun.constraints.budget.state,
      sparkFunDeadlineConstraintState: sparkfun.constraints.deadline.state,
      sparkFunStructuredEtaAvailable: sparkfun.facts.structuredEtaAvailable,
    },
    formationDisposition: "HOLD_CONTINUE_MACHINE_FORMATION",
    outcomeCommitEligible: false,
    commitmentBlockers: blockers,
    nextMachineSearchObjectives: [
      "ACQUIRE_STRUCTURED_DELIVERY_ETA_OR_FIND_DEADLINE_PROVEN_ROUTE",
      "ACQUIRE_PRIMARY_AND_RECOVERY_CAPACITY_RESERVATIONS",
      "ACQUIRE_INDEPENDENT_OUTCOME_WITNESS_ROUTE",
      "BIND_SELLER_ROUTE_TO_THE_SAME_UNIFIED_EPISODE_AND_ATTEMPT",
    ],
    boundary: {
      hardConstraintsEvaluatedBeforeRanking: true,
      hardConstraintFailureCanBeOverriddenByScore: false,
      onlyCompleteCandidateBoundIndependentEpisodeOutcomesEnterEmpiricalEvidence: true,
      providerQuoteOrCartCountsAsCompletedOutcome: false,
      rankingCreatesAuthority: false,
      rankingProvesCapacity: false,
      rankingProvesOutcomeTruth: false,
      paymentAttempted: false,
      orderSubmitted: false,
      employeeTouches: 0,
      humanQueueCreated: false,
    },
  };
  return deepFreeze({ ...body,
    materializationHash: digest(FIRST_PHYSICAL_FORMATION_RANKING_MATERIALIZER_V1_SCHEMA,
      body) });
}

