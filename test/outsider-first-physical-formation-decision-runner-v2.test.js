import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1 } from
  "../src/outsider-first-physical-outcome-production-composition-v1.js";
import { materializeFirstPhysicalFormationRankingV2 } from
  "../src/outsider-first-physical-formation-ranking-materializer-v2.js";
import { runFirstPhysicalFormationDecisionV2 } from
  "../scripts/outsider-first-physical-formation-decision-runner-v2.mjs";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
const signed = (body, field) => ({ ...body, [field]: digest(body.schema, body) });
const targetSigned = (body) => ({ ...body, projectionHash: `sha256:${createHash("sha256")
  .update(canonicalizeStrict(body)).digest("hex")}` });

function episodeData() {
  return signed({
    schema: "outsider/outcome-product-episode-data-bridge-projection/v1",
    schemaVersion: "1.0.0",
    expectedProgramHash: h("program-v2"),
    externalOutcomeEstablished: false,
    episodeDataEngineFeeder: { independentOutcomeCount: 0,
      independentRecoveryCount: 0, authorizedTrainingRows: 0 },
    episodeAttemptSetComposition: {
      reportOccurrences: Array.from({ length: 13 }, (_, index) => ({
        occurrenceIdentityHash: h(`occurrence-v2:${index}`),
        outcomeObservationStatus: "MISSING",
        reportedOutcomeAcceptedAsIndependentTruth: false,
      })),
    },
  }, "projectionHash");
}

function unified() {
  const programHash = h("program-v2");
  return signed({
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
          acceptance: [{ expected: { condition: "NEW", connectorA: "USB_A_MALE",
            connectorB: "USB_C_MALE", dataRequired: true,
            fiveVoltPowerRequired: true, maximumLengthMm: 1100,
            minimumLengthMm: 900, quantity: 1 } }],
        },
      },
      selectedOrderScopedRoutes: [
        { role: "PRIMARY", provider: "ADAFRUIT_GUEST_SHOPPER", productId: "4474" },
        { role: "RECOVERY", provider: "SPARKFUN_MAGENTO_GUEST_CART",
          sku: "CAB-14743" },
        { role: "INDEPENDENT_WITNESS", provider: "INJECTED_WITNESS_READINESS_SOURCE" },
      ],
      parallelUnselectedCandidateRoutes: [
        { provider: "TARGET_REDSKY_READ_ONLY_CANDIDATE",
          stageState: "REJECTED_FROM_ATOMIC_SELECTION",
          exactAcceptanceSatisfied: false, allInBudgetProven: false,
          deliveryDeadlineProven: false,
          commitBlockers: ["EXPLICIT_5V_SOURCE_STATEMENT_MISSING"] },
        { provider: "BEST_BUY_US_WEB_SOURCE_PINNED_CANDIDATE",
          stageState: "REJECTED_FROM_ATOMIC_SELECTION_HOLD",
          exactAcceptanceSatisfied: false, withinMaximumAmount: true,
          deliveryDeadlineProven: false, surplusAuthorizationPresent: false,
          commitBlockers: ["SURPLUS_CABLE_REQUIRES_SEPARATE_AUTHORIZATION"] },
      ],
    },
    episodeData: episodeData(),
  }, "unifiedResultHash");
}

function sparkfun() {
  return signed({
    schema: "outsider/sparkfun-full-address-prepayment-public-projection/v1",
    schemaVersion: "1.0.0",
    provider: "SPARKFUN_MAGENTO_GUEST_CART",
    observedAt: "2026-09-04T17:38:52.434Z",
    product: { catalogPath: "/usb-3-1-cable-a-to-c-3-foot.html",
      productId: "4636", sku: "CAB-14743", quantity: 1 },
    budget: { currency: "USD", maximumAmountMinor: "2000" },
    completionDeadline: "2026-09-11T03:59:59.999Z",
    finalTotalMinor: "1817",
    budgetSatisfied: true,
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
  }, "projectionHash");
}

function target() {
  return targetSigned({
    schema: "outsider/target-redsky-formation-candidate/v2",
    adapter: { headerProfile: "TARGET_PUBLIC_WEB_FIXED_2026_09",
      mode: "PUBLIC_BROWSER_EQUIVALENT_READ_ONLY",
      permittedEffects: ["GET_PUBLIC_PDP", "GET_PUBLIC_FULFILLMENT"],
      provider: "target" },
    observedAt: "2026-09-04T15:00:00.000Z",
    requestedDeliveryDate: "2026-09-10",
    product: {
      acceptanceGaps: ["EXPLICIT_5V_SOURCE_STATEMENT_MISSING"],
      chargingClaimed: true,
      currency: "USD",
      dataTransferClaimed: true,
      destinationConnector: "USB_C_MALE",
      exactAcceptanceSatisfied: false,
      explicit5vClaim: false,
      itemThresholdMinor: 3500,
      itemThresholdSatisfied: false,
      lengthFeet: 3,
      lengthMeters: 0.9144,
      quantity: 1,
      sourceConnector: "USB_A_MALE",
      standardShippingRouteState: "BUDGET_INFEASIBLE",
      tcin: "91252434",
      title: "3ft USB-A to USB-C cable",
      unitPriceMinor: 599,
      upc: "810212674155",
    },
    fulfillment: {
      availableToPromiseQuantity: 10,
      availabilityStatus: "IN_STOCK",
      oneDayFeeMinor: 799,
      scheduledDeliveryFeeMinor: 999,
      selectedSourceService: { minDeliveryDate: "2026-09-06",
        maxDeliveryDate: "2026-09-06", shippingMethodId: "STANDARD" },
      sourceAtpSatisfiesQuantity: true,
      sourceDateMeetsRequestedDeadline: true,
    },
    checkoutAccess: { accountAuthorityPresent: false,
      guestCheckoutAvailable: false,
      officialPolicySource: "https://www.target.com/help/article/000062293",
      targetAccountRequired: true },
    priceBoundary: { allInBudgetProven: false,
      itemPlusScheduledDeliveryFeeBeforeTaxMinor: 1598,
      maximumAmountMinor: "2000", taxAndAddressBoundFeesProven: false },
    formationDecision: {
      blockers: ["EXPLICIT_5V_SOURCE_STATEMENT_MISSING",
        "FULL_ADDRESS_DELIVERABILITY_NOT_PROVEN", "ALL_IN_TOTAL_NOT_PROVEN",
        "CAPACITY_NOT_RESERVED", "TARGET_ACCOUNT_AUTHORITY_REQUIRED"],
      capacityReserved: false,
      commitEligible: false,
      primaryEligible: false,
      recoveryEligible: false,
      role: "OBSERVATION_ONLY",
    },
    sourceOccurrences: {
      fulfillment: { byteLength: 100, bytesHash: h("target-fulfillment-bytes"),
        occurrenceHash: h("target-fulfillment-occurrence") },
      pdp: { byteLength: 200, bytesHash: h("target-pdp-bytes"),
        occurrenceHash: h("target-pdp-occurrence") },
    },
    privacyBoundary: { contactProjected: false, coordinatesProjected: false,
      postalCodeProjected: false, streetAddressProjected: false },
    privateMarker: "DO_NOT_PROJECT_TARGET_SOURCE_PRIVATE_DATA",
  });
}

function writeCanonical(file, value, mode = 0o600) {
  writeFileSync(file, `${canonicalizeStrict(value)}\n`, { mode });
}

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-formation-decision-v2-"));
  chmodSync(root, 0o700);
  const values = { unified: unified(), sparkfun: sparkfun(), target: target() };
  const files = Object.fromEntries(Object.entries(values).map(([name, value]) => {
    const file = path.join(root, `${name}.json`);
    writeCanonical(file, value);
    return [name, file];
  }));
  return { root, values, files, outputDirectory: path.join(root, "product-state") };
}

test("Target v2 enters as an independent seller input and fails product before ranking", () => {
  const f = fixture();
  try {
    const result = materializeFirstPhysicalFormationRankingV2({
      unifiedResult: f.values.unified,
      sparkFunFullAddressProjection: f.values.sparkfun,
      targetRedskyFormationCandidateProjection: f.values.target,
    });
    const targetRow = result.hardConstraintEvaluations.find((row) =>
      row.provider === "TARGET_REDSKY_READ_ONLY_CANDIDATE");
    assert.equal(targetRow.sourceKind, "INDEPENDENT_FROZEN_SELLER_PROJECTION_V2");
    assert.equal(targetRow.constraints.product.state, "FAIL");
    assert.equal(targetRow.constraints.product.reasonCode,
      "EXPLICIT_5V_SOURCE_STATEMENT_MISSING");
    assert.equal(targetRow.hardFilterDecision, "REJECT_HARD_CONSTRAINT");
    assert.equal(targetRow.materializedForRanking, false);
    assert.equal(result.boundary.targetProductHardFilterAppliedBeforeRanking, true);
    assert.equal(result.boundary.targetRankingScoreComputed, false);
    assert.equal(result.ranking.candidateCount, 2);
    assert.equal(Object.values(result.ranking.rankings).flat().some((row) =>
      row.candidateRefHash === f.values.target.projectionHash), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("persists one hash-free multi-source product state and replays it", () => {
  const f = fixture();
  try {
    const input = {
      unifiedResultFile: f.files.unified,
      sparkFunSellerProjectionFile: f.files.sparkfun,
      targetSellerProjectionFile: f.files.target,
      outputDirectory: f.outputDirectory,
    };
    const first = runFirstPhysicalFormationDecisionV2(input);
    const second = runFirstPhysicalFormationDecisionV2(input);
    const state = first.productState;
    const persisted = readFileSync(first.file, "utf8");
    assert.equal(state.formationOperationalState, "CONTINUE_AUTONOMOUSLY");
    assert.equal(state.outcomePromiseState, "NOT_COMMITTED");
    assert.equal(state.paymentState, "AUTHORIZATION_REQUIRED");
    assert.equal(state.interaction.userActionRequiredNow, false);
    assert.equal(state.interaction.employeeTouches, 0);
    const sparkfunProgress = state.routeProgress.find((row) =>
      row.provider === "SPARKFUN_MAGENTO_GUEST_CART");
    assert.equal(sparkfunProgress.observedFinalTotalMinor, "1817");
    assert.equal(sparkfunProgress.sourceObservedAt, "2026-09-04T17:38:52.434Z");
    assert.equal(sparkfunProgress.quoteFreshness, "NOT_REVALIDATED");
    assert.ok(sparkfunProgress.nextActions.includes("ACQUIRE_STRUCTURED_DESTINATION_ETA"));
    assert.ok(sparkfunProgress.nextActions.includes("DISCOVER_OWNER_RESERVATION_TERMS"));
    assert.equal(state.recoveryCostComparisons[0].ordinaryRecovery.primaryFailsCostMinor, null);
    assert.equal(state.decisionSupportBoundary.missingCostsBlockFactAcquisition, false);
    assert.ok(state.nextMachineSearchObjectives.includes("ACQUIRE_OWNER_RESERVATION_FEE"));
    assert.ok(state.nextMachineSearchObjectives.includes("DISCOVER_OWNER_RESERVATION_TERMS"));
    assert.equal(state.boundary.independentFrozenSellerProjectionCount, 2);
    assert.deepEqual(state.observedSellerStates.map((row) => row.provider),
      ["SPARKFUN_MAGENTO_GUEST_CART", "TARGET_REDSKY_READ_ONLY_CANDIDATE"]);
    const targetState = state.observedSellerStates[1];
    assert.equal(targetState.productConstraintState, "FAIL");
    assert.equal(targetState.productConstraintReasonCode,
      "EXPLICIT_5V_SOURCE_STATEMENT_MISSING");
    assert.equal(targetState.unitPriceMinor, 599);
    assert.equal(state.formationSearchOrder.RECOVERY.some((row) =>
      row.provider === "TARGET_REDSKY_READ_ONLY_CANDIDATE"), false);
    assert.ok(state.hardRejectedCandidates.some((row) =>
      row.provider === "TARGET_REDSKY_READ_ONLY_CANDIDATE"
      && row.sourceKind === "INDEPENDENT_FROZEN_SELLER_PROJECTION_V2"));
    assert.equal(lstatSync(f.outputDirectory).mode & 0o777, 0o700);
    assert.equal(lstatSync(first.file).mode & 0o777, 0o600);
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.equal(persisted, `${canonicalizeStrict(state)}\n`);
    assert.equal(persisted.includes("HOLD"), false);
    assert.equal(persisted.includes(f.root), false);
    assert.equal(persisted.includes("DO_NOT_PROJECT_TARGET_SOURCE_PRIVATE_DATA"), false);
    for (const forbidden of [f.values.unified.unifiedResultHash,
      f.values.sparkfun.projectionHash, f.values.target.projectionHash,
      f.values.target.sourceOccurrences.pdp.occurrenceHash,
      f.values.target.sourceOccurrences.fulfillment.occurrenceHash]) {
      assert.equal(persisted.includes(forbidden), false, forbidden);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("optional sourced recovery costs reach the persisted decision without changing admission or leaking references", () => {
  const f = fixture();
  try {
    const materialized = materializeFirstPhysicalFormationRankingV2({
      unifiedResult: f.values.unified,
      sparkFunFullAddressProjection: f.values.sparkfun,
      targetRedskyFormationCandidateProjection: f.values.target,
    });
    const costSource = h("synthetic-recovery-cost-source");
    const cost = (amountMinor) => ({ amountMinor, evidenceRefHashes: [costSource] });
    const evidence = {
      formationPlanHash: materialized.formationPlanHash,
      candidateCosts: [{ candidateRefHash: f.values.sparkfun.projectionHash,
        currency: "USD", ordinaryRecoveryAtFailure: cost("2000"),
        reservationFee: cost("100"), unusedReservationRelease: cost("0"),
        reservedRecoveryExercise: cost("1500") }],
    };
    const file = path.join(f.root, "synthetic-cost-evidence.json");
    writeCanonical(file, evidence);
    const result = runFirstPhysicalFormationDecisionV2({
      unifiedResultFile: f.files.unified,
      sparkFunSellerProjectionFile: f.files.sparkfun,
      targetSellerProjectionFile: f.files.target,
      recoveryCostEvidenceFile: file,
      outputDirectory: f.outputDirectory,
    });
    const state = result.productState;
    assert.deepEqual(state.recoveryCostComparisons[0].reservedMinusOrdinary,
      { primarySucceedsCostMinor: "100", primaryFailsCostMinor: "-400" });
    assert.equal(state.formationOperationalState, "CONTINUE_AUTONOMOUSLY");
    assert.equal(state.outcomePromiseState, "NOT_COMMITTED");
    assert.equal(state.paymentState, "AUTHORIZATION_REQUIRED");
    assert.equal(state.boundary.paymentAttempted, false);
    assert.equal(state.formationSearchOrder.RECOVERY.length, 1);
    assert.equal(state.nextMachineSearchObjectives.includes("ACQUIRE_OWNER_RESERVATION_FEE"), false);
    assert.equal(state.hardRejectedCandidates.length, 2);
    const persisted = readFileSync(result.file, "utf8");
    assert.equal(persisted.includes(costSource), false);
    assert.equal(persisted.includes(file), false);
    assert.equal(persisted.includes(f.values.sparkfun.projectionHash), false);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("rejects Target projection tampering and non-private inputs", () => {
  const f = fixture();
  try {
    const tampered = { ...f.values.target,
      product: { ...f.values.target.product, explicit5vClaim: true } };
    writeCanonical(f.files.target, tampered);
    assert.throws(() => runFirstPhysicalFormationDecisionV2({
      unifiedResultFile: f.files.unified,
      sparkFunSellerProjectionFile: f.files.sparkfun,
      targetSellerProjectionFile: f.files.target,
      outputDirectory: f.outputDirectory,
    }), /TARGET_PROJECTION_HASH_INVALID/u);
    writeCanonical(f.files.target, f.values.target);
    chmodSync(f.files.target, 0o644);
    assert.throws(() => runFirstPhysicalFormationDecisionV2({
      unifiedResultFile: f.files.unified,
      sparkFunSellerProjectionFile: f.files.sparkfun,
      targetSellerProjectionFile: f.files.target,
      outputDirectory: f.outputDirectory,
    }), /TARGET_SELLER_PROJECTION_FILE_INVALID/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
