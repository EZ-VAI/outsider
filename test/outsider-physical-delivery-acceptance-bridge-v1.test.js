import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createIndependentOutcomeWitnessSourceCapabilityV1,
  createIndependentOutcomeWitnessVerifierContextV1,
  emitIndependentOutcomeWitnessReservationV1,
  emitIndependentOutcomeWitnessResultReceiptV1,
  verifyIndependentOutcomeWitnessLifecycleV1,
} from "../src/outsider-independent-outcome-witness-lifecycle-v1.js";
import {
  createPhysicalCarrierDeliveryOccurrenceV1,
  createPhysicalDeliveryIndependentInspectionV1,
  evaluatePhysicalDeliveryAcceptanceV1,
} from "../src/outsider-physical-delivery-acceptance-bridge-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const sha256Bytes = (bytes) => `sha256:${createHash("sha256")
  .update(bytes).digest("hex")}`;
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;

let fixtureSequence = 0;

function setup() {
  fixtureSequence += 1;
  const fixture = createTemporaryNetworkV2MultiSlotFixture({
    fixtureLabel: `physical-delivery-acceptance-${fixtureSequence}`,
    observedAt: "2026-09-02T15:30:00.000Z",
    formationDeadline: "2026-09-02T16:30:00.000Z",
  });
  const primaryProviderRefHash = fixture.slots.find((slot) =>
    slot.requirementKind === "RESOURCE")
    .mailbox.source.oneUseResponseReplay.responses[0].providerRefHash;
  const witnessProviderRefHash = fixture.slots.find((slot) =>
    slot.requirementKind === "EVIDENCE")
    .mailbox.source.oneUseResponseReplay.responses[0].providerRefHash;
  const primaryControllerRefHash = h("physical-primary-controller");
  const witnessControllerRefHash = h("physical-witness-controller");
  const productBody = {
    schema: "outsider/first-physical-formation-product-state/v2",
    schemaVersion: "2.0.0",
    product: {
      exactItem: {
        condition: "NEW",
        connectorA: "USB_A_MALE",
        connectorB: "USB_C_MALE",
        dataRequired: true,
        fiveVoltPowerRequired: true,
        maximumLengthMm: 1100,
        minimumLengthMm: 900,
        quantity: 1,
      },
      outcomeKind: "PHYSICAL_GOODS_DELIVERY",
    },
  };
  const productState = {
    ...productBody,
    productStateHash: digest(productBody.schema, productBody),
  };
  const keys = generateKeyPairSync("ed25519");
  const context = createIndependentOutcomeWitnessVerifierContextV1({
    sourceSystemId: "physical.witness.native.endpoint",
    witnessOwnerRefHash: h("physical-witness-owner"),
    witnessControllerRefHash,
    observationPolicyRefHash: h("physical-inspection-policy"),
    publicKeyPem: keys.publicKey.export({ type: "spki", format: "pem" })
      .toString(),
  });
  const capability = createIndependentOutcomeWitnessSourceCapabilityV1({
    verifierContext: context,
    expectedVerifierContextHash: context.verifierContextHash,
    witnessPrivateKeyPem: keys.privateKey.export({
      type: "pkcs8", format: "pem",
    }).toString(),
  });
  const evidence = fixture.tender.evidenceRequirements.items[0];
  const reservationSourceBytes = emitIndependentOutcomeWitnessReservationV1(
    capability, {
      tender: fixture.tender,
      expectedTenderHash: fixture.tender.tenderHash,
      reservationId: "reservation.physical.acceptance.001",
      lifecycleStreamId: "stream.physical.acceptance.001",
      evidenceRequirementId: evidence.evidenceRequirementId,
      observationTarget: "PRIMARY_OUTCOME",
      recoveryRequirementId: null,
      recoveryOutcomeRefHash: null,
      primaryAttemptHash: fixture.tender.typedGraph.attempt.attemptHash,
      primaryProviderRefHash,
      primaryControllerRefHash,
      witnessProviderRefHash,
      reservationNonceHash: h("physical-reservation-nonce"),
      observationOpensAt: "2026-09-02T16:31:00.000Z",
      observationClosesAt: "2026-09-02T17:50:00.000Z",
      expiresAt: "2026-09-02T18:00:00.000Z",
      reservedAt: "2026-09-02T15:31:00.000Z",
    });

  function carrier(overrides = {}) {
    return createPhysicalCarrierDeliveryOccurrenceV1({
      tender: fixture.tender,
      expectedTenderHash: fixture.tender.tenderHash,
      frozenProductStateHash: productState.productStateHash,
      deliveryExecutorProviderRefHash: primaryProviderRefHash,
      deliveryExecutorControllerRefHash: primaryControllerRefHash,
      sourceOccurrenceRefHash: h("carrier-occurrence"),
      sourceArtifactHash: h("carrier-artifact"),
      sourceReplayReceiptHash: h("carrier-replay"),
      deliveryStatus: "DELIVERED",
      deliveredAt: "2026-09-02T16:40:00.000Z",
      observedAt: "2026-09-02T16:41:00.000Z",
      ...overrides,
    });
  }

  function inspection(overrides = {}) {
    const checks = {
      connectorA: { observedValue: "USB_A_MALE",
        evidenceRefHash: h("inspect-connector-a") },
      connectorB: { observedValue: "USB_C_MALE",
        evidenceRefHash: h("inspect-connector-b") },
      dataTransferSucceeded: { observedValue: true,
        evidenceRefHash: h("inspect-data") },
      nominalFiveVoltObserved: { observedValue: true,
        evidenceRefHash: h("inspect-5v") },
      quantity: { observedValue: 1,
        evidenceRefHash: h("inspect-quantity") },
      condition: { observedValue: "NEW",
        evidenceRefHash: h("inspect-condition") },
      ...(overrides.checks ?? {}),
    };
    return createPhysicalDeliveryIndependentInspectionV1({
      tender: fixture.tender,
      expectedTenderHash: fixture.tender.tenderHash,
      frozenProductStateHash: productState.productStateHash,
      witnessProviderRefHash,
      witnessControllerRefHash,
      evidenceSourceClass: "INDEPENDENT_INSTRUMENT_OBSERVATION",
      inspectedAt: "2026-09-02T17:00:00.000Z",
      ...overrides,
      checks,
    });
  }

  function witnessLifecycle(item) {
    const resultReceiptSourceBytes
      = emitIndependentOutcomeWitnessResultReceiptV1(capability, {
        reservationSourceBytes,
        observationStatus: "OBSERVED_SATISFIED",
        evidenceSourceClass: item.evidenceSourceClass,
        observationEvidenceHashes: [item.inspectionHash],
        resultReceiptNonceHash: h("physical-result-nonce"),
        observedAt: item.inspectedAt,
        issuedAt: "2026-09-02T17:01:00.000Z",
      });
    const source = {
      tender: fixture.tender,
      expectedTenderHash: fixture.tender.tenderHash,
      verifierContext: context,
      expectedVerifierContextHash: context.verifierContextHash,
      reservationSourceBytes,
      expectedReservationSourceHash: sha256Bytes(reservationSourceBytes),
      resultReceiptSourceBytes,
      expectedResultReceiptSourceHash: sha256Bytes(resultReceiptSourceBytes),
      revocationSourceBytes: null,
      expectedRevocationSourceHash: null,
      observedAt: "2026-09-02T17:02:00.000Z",
    };
    return {
      source,
      replay: verifyIndependentOutcomeWitnessLifecycleV1(source),
    };
  }

  function evaluate(delivery, item = null, lifecycle = null) {
    return evaluatePhysicalDeliveryAcceptanceV1({
      tender: fixture.tender,
      expectedTenderHash: fixture.tender.tenderHash,
      frozenProductState: productState,
      expectedProductStateHash: productState.productStateHash,
      carrierDeliveryOccurrence: delivery,
      expectedCarrierOccurrenceHash: delivery.carrierOccurrenceHash,
      independentInspection: item,
      expectedInspectionHash: item?.inspectionHash ?? null,
      witnessLifecycleSource: lifecycle?.source ?? null,
      expectedWitnessReplayHash: lifecycle?.replay.replayHash ?? null,
      evaluatedAt: "2026-09-02T17:02:00.000Z",
    });
  }

  return { carrier, inspection, witnessLifecycle, evaluate,
    witnessProviderRefHash, witnessControllerRefHash };
}

test("carrier DELIVERED alone remains HOLD and cannot establish acceptance", () => {
  const value = setup();
  const result = value.evaluate(value.carrier());
  assert.equal(result.ok, true);
  assert.equal(result.carrierDeliveredStatusObserved, true);
  assert.equal(result.carrierDeliveredStatusEstablishesAcceptance, false);
  assert.equal(result.independentInspectionPresent, false);
  assert.equal(result.deliveryAcceptanceEvidenceComplete, false);
  assert.equal(result.deliveryAcceptanceEstablished, false);
  assert.equal(result.gapCodes.includes(
    "INDEPENDENT_INSPECTION_NOT_PRESENT"), true);
});

test("delivery plus six signed inspection checks forms a bound evidence package",
  () => {
    const value = setup();
    const inspection = value.inspection();
    const lifecycle = value.witnessLifecycle(inspection);
    const result = value.evaluate(value.carrier(), inspection, lifecycle);
    assert.equal(result.ok, true);
    assert.equal(result.sameFrozenOutcomeEpisodeAttemptBound, true);
    assert.equal(result.allFrozenProductInspectionChecksObservedSatisfied, true);
    assert.equal(result.inspectionBoundIntoSignedWitnessResult, true);
    assert.equal(result.independentWitnessStructurallyDistinctFromExecutor, true);
    assert.equal(result.deliveryAcceptanceEvidenceComplete, true);
    assert.equal(result.deliveryAcceptanceEstablished, false);
    assert.equal(result.independentOutcomeTruthEstablished, false);
    assert.equal(result.gapCodes.includes(
      "INDEPENDENT_OUTCOME_TRUTH_NOT_ESTABLISHED"), true);
    assert.equal(result.decisionState, "HOLD");
    assert.equal(result.authority, "NONE");
  });

test("delivery executor cannot be reused as the independent witness", () => {
  const value = setup();
  const inspection = value.inspection();
  const lifecycle = value.witnessLifecycle(inspection);
  const delivery = value.carrier({
    deliveryExecutorProviderRefHash: value.witnessProviderRefHash,
    deliveryExecutorControllerRefHash: value.witnessControllerRefHash,
  });
  const result = value.evaluate(delivery, inspection, lifecycle);
  assert.equal(result.ok, true);
  assert.equal(result.independentWitnessStructurallyDistinctFromExecutor, false);
  assert.equal(result.deliveryAcceptanceEvidenceComplete, false);
  assert.equal(result.gapCodes.includes(
    "DELIVERY_EXECUTOR_IS_INDEPENDENT_WITNESS"), true);
});

test("a failed data-transfer inspection cannot satisfy the frozen product", () => {
  const value = setup();
  const inspection = value.inspection({
    checks: { dataTransferSucceeded: { observedValue: false,
      evidenceRefHash: h("inspect-data-failed") } },
  });
  const lifecycle = value.witnessLifecycle(inspection);
  const result = value.evaluate(value.carrier(), inspection, lifecycle);
  assert.equal(result.ok, true);
  assert.equal(result.allFrozenProductInspectionChecksObservedSatisfied, false);
  assert.equal(result.deliveryAcceptanceEvidenceComplete, false);
  assert.equal(result.gapCodes.includes(
    "INSPECTION_DATATRANSFERSUCCEEDED_NOT_SATISFIED"), true);
});
