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
import { materializeFirstPhysicalFormationRankingV1 } from
  "../src/outsider-first-physical-formation-ranking-materializer-v1.js";
import { runFirstPhysicalFormationDecisionV1 } from
  "../scripts/outsider-first-physical-formation-decision-runner-v1.mjs";

const h = (label) => `sha256:${createHash("sha256").update(label).digest("hex")}`;
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
const signed = (body, field) => ({ ...body, [field]: digest(body.schema, body) });

function episodeData() {
  return signed({
    schema: "outsider/outcome-product-episode-data-bridge-projection/v1",
    schemaVersion: "1.0.0",
    expectedProgramHash: h("program"),
    externalOutcomeEstablished: false,
    episodeDataEngineFeeder: { independentOutcomeCount: 0,
      independentRecoveryCount: 0, authorizedTrainingRows: 0 },
    episodeAttemptSetComposition: {
      reportOccurrences: Array.from({ length: 13 }, (_, index) => ({
        occurrenceIdentityHash: h(`occurrence:${index}`),
        outcomeObservationStatus: "MISSING",
        reportedOutcomeAcceptedAsIndependentTruth: false,
      })),
    },
  }, "projectionHash");
}

function unified() {
  const programHash = h("program");
  return signed({
    schema: "outsider/first-physical-outcome-unified-product/v1",
    schemaVersion: "1.0.0",
    programHash,
    paymentAttempted: false,
    orderSubmitted: false,
    outcomePromiseIssued: false,
    privateInputHash: h("do-not-project-private-input"),
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

function seller(total = "1817", budgetSatisfied = true) {
  return signed({
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
    destinationRefHash: h("do-not-project-destination"),
    privateMarker: "DO_NOT_PROJECT_CONTACT_OR_ADDRESS",
  }, "projectionHash");
}

function writeCanonical(file, value, mode = 0o600) {
  writeFileSync(file, `${canonicalizeStrict(value)}\n`, { mode });
}

function fixture(total = "1817", budgetSatisfied = true) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-formation-decision-v1-"));
  chmodSync(root, 0o700);
  const unifiedValue = unified();
  const sellerValue = seller(total, budgetSatisfied);
  const unifiedFile = path.join(root, "unified.json");
  const sellerFile = path.join(root, "seller.json");
  const outputDirectory = path.join(root, "product-state");
  writeCanonical(unifiedFile, unifiedValue);
  writeCanonical(sellerFile, sellerValue);
  return { root, unifiedValue, sellerValue, unifiedFile, sellerFile, outputDirectory };
}

test("persists a privacy-safe autonomous product state from the $18.17 seller fact", () => {
  const f = fixture();
  try {
    const materialization = materializeFirstPhysicalFormationRankingV1({
      unifiedResult: f.unifiedValue,
      sparkFunFullAddressProjection: f.sellerValue,
    });
    const first = runFirstPhysicalFormationDecisionV1({
      unifiedResultFile: f.unifiedFile,
      sellerProjectionFile: f.sellerFile,
      outputDirectory: f.outputDirectory,
    });
    const second = runFirstPhysicalFormationDecisionV1({
      unifiedResultFile: f.unifiedFile,
      sellerProjectionFile: f.sellerFile,
      outputDirectory: f.outputDirectory,
    });
    const state = first.productState;
    const persisted = readFileSync(first.file, "utf8");

    assert.equal(state.formationOperationalState, "CONTINUE_AUTONOMOUSLY");
    assert.equal(state.outcomePromiseState, "NOT_COMMITTED");
    assert.equal(state.paymentState, "AUTHORIZATION_REQUIRED");
    assert.equal(state.interaction.userActionRequiredNow, false);
    assert.equal(state.interaction.humanQueueCreated, false);
    assert.equal(state.interaction.employeeTouches, 0);
    assert.equal(state.interaction.userBabysitting, 0);
    assert.equal(state.observedSellerState.finalTotalMinor, "1817");
    assert.deepEqual(state.observedSellerState.selectedShippingMethod,
      { carrierCode: "shqups", methodCode: "GND",
        sourceQuotedAmountMinor: "1022" });
    assert.equal(state.observedSellerState.deadlineConstraintState, "UNKNOWN");
    assert.deepEqual(state.formationSearchOrder.PRIMARY.map((row) => row.provider),
      ["ADAFRUIT_GUEST_SHOPPER"]);
    assert.deepEqual(state.formationSearchOrder.RECOVERY.map((row) => row.provider),
      ["SPARKFUN_MAGENTO_GUEST_CART"]);
    assert.deepEqual(state.formationSearchOrder.WITNESS, []);
    assert.ok(state.commitmentBlockers.includes(
      "DELIVERY_DEADLINE_UNPROVEN_NO_STRUCTURED_ETA"));
    assert.ok(state.commitmentBlockers.includes("INDEPENDENT_WITNESS_NOT_ESTABLISHED"));
    assert.ok(state.commitmentBlockers.includes("PRIMARY_AND_RECOVERY_CAPACITY_NOT_RESERVED"));
    assert.equal(lstatSync(f.outputDirectory).mode & 0o777, 0o700);
    assert.equal(lstatSync(first.file).mode & 0o777, 0o600);
    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.equal(second.file, first.file);
    assert.equal(persisted, `${canonicalizeStrict(state)}\n`);
    assert.equal(persisted.includes("HOLD"), false);
    assert.equal(persisted.includes("DO_NOT_PROJECT_CONTACT_OR_ADDRESS"), false);
    assert.equal(persisted.includes(f.root), false);
    for (const forbidden of [f.unifiedValue.unifiedResultHash,
      f.unifiedValue.privateInputHash, f.sellerValue.projectionHash,
      f.sellerValue.destinationRefHash, materialization.materializationHash,
      materialization.ranking.rankingHash,
      ...materialization.hardConstraintEvaluations.map((row) => row.candidateRefHash)]) {
      assert.equal(persisted.includes(forbidden), false, forbidden);
    }
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("an over-budget seller remains autonomous and is removed from recovery ranking", () => {
  const f = fixture("2100", false);
  try {
    const result = runFirstPhysicalFormationDecisionV1({
      unifiedResultFile: f.unifiedFile,
      sellerProjectionFile: f.sellerFile,
      outputDirectory: f.outputDirectory,
    }).productState;
    assert.equal(result.formationOperationalState, "CONTINUE_AUTONOMOUSLY");
    assert.equal(result.outcomePromiseState, "NOT_COMMITTED");
    assert.equal(result.paymentState, "AUTHORIZATION_REQUIRED");
    assert.equal(result.interaction.userActionRequiredNow, false);
    assert.equal(result.observedSellerState.budgetConstraintState, "FAIL");
    assert.deepEqual(result.formationSearchOrder.RECOVERY, []);
    assert.ok(result.hardRejectedCandidates.some((row) =>
      row.provider === "SPARKFUN_MAGENTO_GUEST_CART"));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("rejects a non-private frozen input before creating product state", () => {
  const f = fixture();
  try {
    chmodSync(f.sellerFile, 0o644);
    assert.throws(() => runFirstPhysicalFormationDecisionV1({
      unifiedResultFile: f.unifiedFile,
      sellerProjectionFile: f.sellerFile,
      outputDirectory: f.outputDirectory,
    }), /SELLER_PROJECTION_FILE_INVALID/u);
    assert.throws(() => lstatSync(f.outputDirectory), /ENOENT/u);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
