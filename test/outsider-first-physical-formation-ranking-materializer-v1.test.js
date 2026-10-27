import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1 } from
  "../src/outsider-first-physical-outcome-production-composition-v1.js";
import { materializeFirstPhysicalFormationRankingV1 } from
  "../src/outsider-first-physical-formation-ranking-materializer-v1.js";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;

function signed(body, field) {
  return { ...body, [field]: digest(body.schema, body) };
}

function episodeData() {
  return signed({
    schema: "outsider/outcome-product-episode-data-bridge-projection/v1",
    schemaVersion: "1.0.0",
    expectedProgramHash: h("program"),
    externalOutcomeEstablished: false,
    episodeDataEngineFeeder: {
      independentOutcomeCount: 0,
      independentRecoveryCount: 0,
      authorizedTrainingRows: 0,
    },
    episodeAttemptSetComposition: {
      reportOccurrences: Array.from({ length: 13 }, (_, index) => ({
        occurrenceIdentityHash: h(`occurrence:${index}`),
        outcomeObservationStatus: "MISSING",
        reportedOutcomeAcceptedAsIndependentTruth: false,
      })),
    },
  }, "projectionHash");
}

function target() {
  return {
    provider: "TARGET_REDSKY_READ_ONLY_CANDIDATE",
    stageState: "REJECTED_FROM_ATOMIC_SELECTION",
    exactAcceptanceSatisfied: false,
    allInBudgetProven: false,
    deliveryDeadlineProven: false,
    commitBlockers: ["EXPLICIT_5V_SOURCE_STATEMENT_MISSING",
      "ALL_IN_TOTAL_NOT_PROVEN"],
  };
}

function bestBuy() {
  return {
    provider: "BEST_BUY_US_WEB_SOURCE_PINNED_CANDIDATE",
    stageState: "REJECTED_FROM_ATOMIC_SELECTION_HOLD",
    exactAcceptanceSatisfied: false,
    withinMaximumAmount: true,
    deliveryDeadlineProven: false,
    surplusAuthorizationPresent: false,
    commitBlockers: ["SURPLUS_CABLE_REQUIRES_SEPARATE_AUTHORIZATION",
      "SOURCE_ETA_IS_NOT_BINDING_UNTIL_ORDER"],
  };
}

function unified() {
  const programHash = h("program");
  const body = {
    schema: "outsider/first-physical-outcome-unified-product/v1",
    schemaVersion: "1.0.0",
    programHash,
    paymentAttempted: false,
    orderSubmitted: false,
    outcomePromiseIssued: false,
    product: {
      programHash,
      capacityReserved: false,
      productResponse: {
        programHash,
        completionDeadline: "2026-09-11T03:59:59.999Z",
        outcome: {
          statement: OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1,
          budget: { currency: "USD", maximumAmountMinor: "2000" },
          acceptance: [{ expected: {
            condition: "NEW", connectorA: "USB_A_MALE",
            connectorB: "USB_C_MALE", dataRequired: true,
            fiveVoltPowerRequired: true, maximumLengthMm: 1100,
            minimumLengthMm: 900, quantity: 1,
          } }],
        },
      },
      selectedOrderScopedRoutes: [
        { role: "PRIMARY", provider: "ADAFRUIT_GUEST_SHOPPER", productId: "4474" },
        { role: "RECOVERY", provider: "SPARKFUN_MAGENTO_GUEST_CART",
          sku: "CAB-14743" },
        { role: "INDEPENDENT_WITNESS",
          provider: "INJECTED_WITNESS_READINESS_SOURCE" },
      ],
      parallelUnselectedCandidateRoutes: [target(), bestBuy()],
    },
    episodeData: episodeData(),
  };
  return signed(body, "unifiedResultHash");
}

function sparkfun(total = "1817", budgetSatisfied = true) {
  const body = {
    schema: "outsider/sparkfun-full-address-prepayment-public-projection/v1",
    schemaVersion: "1.0.0",
    provider: "SPARKFUN_MAGENTO_GUEST_CART",
    product: { catalogPath: "/usb-3-1-cable-a-to-c-3-foot.html",
      productId: "4636", sku: "CAB-14743", quantity: 1 },
    budget: { currency: "USD", maximumAmountMinor: "2000" },
    completionDeadline: "2026-09-11T03:59:59.999Z",
    finalTotalMinor: total,
    budgetSatisfied,
    selectedShippingMethod: { carrierCode: "shqups", methodCode: "GND",
      sourceQuotedAmountMinor: "1022" },
    readyForPaymentAuthorization: true,
    structuredEtaAvailable: false,
    deliveryDeadlineProven: false,
    providerSourceEstablishesCapacity: false,
    capacityReserved: false,
    paymentPerformed: false,
    orderSubmitted: false,
    userResultCommitted: false,
  };
  return signed(body, "projectionHash");
}

test("materializes the real $18.17 SparkFun route after hard filters with zero invented outcomes", () => {
  const result = materializeFirstPhysicalFormationRankingV1({
    unifiedResult: unified(),
    sparkFunFullAddressProjection: sparkfun(),
  });
  const sparkfunEvaluation = result.hardConstraintEvaluations.find((row) =>
    row.provider === "SPARKFUN_MAGENTO_GUEST_CART");
  const targetEvaluation = result.hardConstraintEvaluations.find((row) =>
    row.provider === "TARGET_REDSKY_READ_ONLY_CANDIDATE");
  const bestBuyEvaluation = result.hardConstraintEvaluations.find((row) =>
    row.provider === "BEST_BUY_US_WEB_SOURCE_PINNED_CANDIDATE");

  assert.equal(sparkfunEvaluation.constraints.product.state, "PASS");
  assert.equal(sparkfunEvaluation.constraints.budget.state, "PASS");
  assert.equal(sparkfunEvaluation.constraints.deadline.state, "UNKNOWN");
  assert.equal(sparkfunEvaluation.hardFilterDecision, "RANK_FOR_GAP_CLOSURE");
  assert.equal(targetEvaluation.hardFilterDecision, "REJECT_HARD_CONSTRAINT");
  assert.equal(bestBuyEvaluation.hardFilterDecision, "REJECT_HARD_CONSTRAINT");
  assert.equal(result.materializedRealityFacts.sparkFunFinalTotalMinor, "1817");
  assert.deepEqual(result.materializedRealityFacts.sparkFunSelectedShippingMethod, {
    carrierCode: "shqups", methodCode: "GND", sourceQuotedAmountMinor: "1022",
  });
  assert.equal(result.materializedRealityFacts.sparkFunStructuredEtaAvailable, false);
  assert.equal(result.rankingEvidence.episodeReportOccurrenceCount, 13);
  assert.equal(result.rankingEvidence.completeCandidateBoundEpisodeOutcomeObservationCount, 0);
  assert.equal(result.rankingEvidence.empiricalObservationsMaterialized, 0);
  assert.equal(result.ranking.rankings.PRIMARY.length, 1);
  assert.equal(result.ranking.rankings.RECOVERY.length, 1);
  assert.equal(result.ranking.rankings.WITNESS.length, 0);
  assert.equal(result.ranking.rankings.RECOVERY[0].components.empirical
    .suppliedObservations, 0);
  assert.ok(result.commitmentBlockers.includes(
    "DELIVERY_DEADLINE_UNPROVEN_NO_STRUCTURED_ETA"));
  assert.ok(result.commitmentBlockers.includes("INDEPENDENT_WITNESS_NOT_ESTABLISHED"));
  assert.equal(result.outcomeCommitEligible, false);
  assert.equal(result.boundary.paymentAttempted, false);
  assert.equal(result.boundary.orderSubmitted, false);
  assert.equal(result.boundary.employeeTouches, 0);
});

test("a known over-budget full-address total is filtered before ranking", () => {
  const result = materializeFirstPhysicalFormationRankingV1({
    unifiedResult: unified(),
    sparkFunFullAddressProjection: sparkfun("2100", false),
  });
  const sparkfunEvaluation = result.hardConstraintEvaluations.find((row) =>
    row.provider === "SPARKFUN_MAGENTO_GUEST_CART");
  assert.equal(sparkfunEvaluation.constraints.budget.state, "FAIL");
  assert.equal(sparkfunEvaluation.materializedForRanking, false);
  assert.equal(result.ranking.rankings.RECOVERY.length, 0);
});

test("tampered unified or pseudo-complete Episode data fails closed", () => {
  const tampered = unified();
  tampered.product.productResponse.outcome.budget.maximumAmountMinor = "9999";
  assert.throws(() => materializeFirstPhysicalFormationRankingV1({
    unifiedResult: tampered,
    sparkFunFullAddressProjection: sparkfun(),
  }), /UNIFIED_RESULT_INVALID/u);

  const pseudoComplete = unified();
  pseudoComplete.episodeData.episodeDataEngineFeeder.independentOutcomeCount = 1;
  const episodeBody = { ...pseudoComplete.episodeData };
  delete episodeBody.projectionHash;
  pseudoComplete.episodeData = signed(episodeBody, "projectionHash");
  const unifiedBody = { ...pseudoComplete };
  delete unifiedBody.unifiedResultHash;
  const resigned = signed(unifiedBody, "unifiedResultHash");
  assert.throws(() => materializeFirstPhysicalFormationRankingV1({
    unifiedResult: resigned,
    sparkFunFullAddressProjection: sparkfun(),
  }), /UNSUPPORTED_COMPLETE_EPISODE_OUTCOME_INPUT/u);
});

