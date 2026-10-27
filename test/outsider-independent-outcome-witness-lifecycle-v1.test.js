import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
} from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  attachIndependentWitnessToFormationHoldV1,
} from "../src/outsider-independent-witness-formation-hold-gate-v1.js";
import {
  createIndependentOutcomeWitnessSourceCapabilityV1,
  createIndependentOutcomeWitnessVerifierContextV1,
  emitIndependentOutcomeWitnessReservationV1,
  emitIndependentOutcomeWitnessResultReceiptV1,
  emitIndependentOutcomeWitnessRevocationV1,
  verifyIndependentOutcomeWitnessLifecycleV1,
} from "../src/outsider-independent-outcome-witness-lifecycle-v1.js";
import {
  OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_SCHEMAS,
} from "../src/outsider-injected-temporary-network-formation-slice-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const sha256Bytes = (bytes) => `sha256:${createHash("sha256")
  .update(bytes).digest("hex")}`;
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;

const fixture = createTemporaryNetworkV2MultiSlotFixture({
  fixtureLabel: "independent-witness-lifecycle",
  observedAt: "2026-09-02T15:30:00.000Z",
  formationDeadline: "2026-09-02T16:30:00.000Z",
});
const primaryProviderRefHash = fixture.slots.find((slot) =>
  slot.requirementKind === "RESOURCE")
  .mailbox.source.oneUseResponseReplay.responses[0].providerRefHash;
const witnessProviderRefHash = fixture.slots.find((slot) =>
  slot.requirementKind === "EVIDENCE")
  .mailbox.source.oneUseResponseReplay.responses[0].providerRefHash;
const evidence = fixture.tender.evidenceRequirements.items[0];

function source(reservationOverrides = {}) {
  const keys = generateKeyPairSync("ed25519");
  const publicKeyPem = keys.publicKey.export({
    type: "spki", format: "pem",
  }).toString();
  const privateKeyPem = keys.privateKey.export({
    type: "pkcs8", format: "pem",
  }).toString();
  const context = createIndependentOutcomeWitnessVerifierContextV1({
    sourceSystemId: "witness.owner.native.endpoint",
    witnessOwnerRefHash: h("witness-owner"),
    witnessControllerRefHash: h("witness-controller"),
    observationPolicyRefHash: h("witness-observation-policy"),
    publicKeyPem,
  });
  const capability = createIndependentOutcomeWitnessSourceCapabilityV1({
    verifierContext: context,
    expectedVerifierContextHash: context.verifierContextHash,
    witnessPrivateKeyPem: privateKeyPem,
  });
  const reservationSourceBytes = emitIndependentOutcomeWitnessReservationV1(
    capability, {
      tender: fixture.tender,
      expectedTenderHash: fixture.tender.tenderHash,
      reservationId: "reservation.witness.001",
      lifecycleStreamId: "stream.witness.001",
      evidenceRequirementId: evidence.evidenceRequirementId,
      observationTarget: "PRIMARY_OUTCOME",
      recoveryRequirementId: null,
      recoveryOutcomeRefHash: null,
      primaryAttemptHash: fixture.tender.typedGraph.attempt.attemptHash,
      primaryProviderRefHash,
      primaryControllerRefHash: h("primary-controller"),
      witnessProviderRefHash,
      reservationNonceHash: h("witness-reservation-nonce"),
      observationOpensAt: "2026-09-02T16:31:00.000Z",
      observationClosesAt: "2026-09-02T17:50:00.000Z",
      expiresAt: "2026-09-02T18:00:00.000Z",
      reservedAt: "2026-09-02T15:31:00.000Z",
      ...reservationOverrides,
    });
  return { context, capability, reservationSourceBytes };
}

function result(capability, reservationSourceBytes, overrides = {}) {
  return emitIndependentOutcomeWitnessResultReceiptV1(capability, {
    reservationSourceBytes,
    observationStatus: "OBSERVED_SATISFIED",
    evidenceSourceClass: "WITNESS_DIRECT_OBSERVATION",
    observationEvidenceHashes: [h("direct-observation")],
    resultReceiptNonceHash: h("result-receipt-nonce"),
    observedAt: "2026-09-02T17:00:00.000Z",
    issuedAt: "2026-09-02T17:01:00.000Z",
    ...overrides,
  });
}

function replayInput(sourceValue, resultReceiptSourceBytes = null,
  revocationSourceBytes = null,
  observedAt = "2026-09-02T17:02:00.000Z") {
  return {
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    verifierContext: sourceValue.context,
    expectedVerifierContextHash: sourceValue.context.verifierContextHash,
    reservationSourceBytes: sourceValue.reservationSourceBytes,
    expectedReservationSourceHash:
      sha256Bytes(sourceValue.reservationSourceBytes),
    resultReceiptSourceBytes,
    expectedResultReceiptSourceHash: resultReceiptSourceBytes
      ? sha256Bytes(resultReceiptSourceBytes) : null,
    revocationSourceBytes,
    expectedRevocationSourceHash: revocationSourceBytes
      ? sha256Bytes(revocationSourceBytes) : null,
    observedAt,
  };
}

function predecessorFormation() {
  const body = {
    schema:
      OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_SCHEMAS
        .formation,
    tenderHash: fixture.tender.tenderHash,
    slots: [
      {
        role: "PRIMARY",
        providerRefHash: primaryProviderRefHash,
        endpointReturnedSignedSources: true,
      },
      {
        role: "INDEPENDENT_WITNESS",
        providerRefHash: witnessProviderRefHash,
        endpointReturnedSignedSources: true,
      },
    ],
    atomicCommitmentGateSatisfied: false,
    atomicCommit: false,
    userOutcomePromiseIssued: false,
    independentWitnessReceiptPresent: false,
    independentWitnessOutcomeTruthEstablished: false,
    externalResourceOwnerTrustEstablished: false,
    primaryCapacityReserved: false,
    recoveryCapacityReserved: false,
    disposition: "DECLINE_NOT_HUMAN_QUEUE",
    gapCodes: [
      "INDEPENDENT_WITNESS_RECEIPT_NOT_PRESENT",
      "ATOMIC_COMMIT_PREMISES_INCOMPLETE",
    ],
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return {
    ...body,
    formationHash: digest(body.schema, body),
  };
}

test("replays an exact witness reservation without inventing capacity or independence",
  () => {
    const value = source();
    const replay = verifyIndependentOutcomeWitnessLifecycleV1(
      replayInput(value, null, null, "2026-09-02T16:40:00.000Z"));
    assert.equal(replay.ok, true);
    assert.equal(replay.reservationCurrent, true);
    assert.equal(replay.resultReceiptPresent, false);
    assert.equal(replay.exactTenderOutcomeAttemptOwnerWindowNonceAndExpiryReplayed,
      true);
    assert.equal(replay.structuralControllerAndProviderSeparationObserved, true);
    assert.equal(replay.structuralDistinctnessProvesIndependentControl, false);
    assert.equal(replay.independentControlEstablished, false);
    assert.equal(replay.independentOutcomeTruthEstablished, false);
    assert.equal(replay.capacityReserved, false);
    assert.equal(replay.authority, "NONE");
  });

test("a later signed result becomes present in the formation gate but cannot open COMMIT",
  () => {
    const value = source();
    const resultBytes = result(value.capability, value.reservationSourceBytes);
    const witnessLifecycleSource = replayInput(value, resultBytes);
    const replay = verifyIndependentOutcomeWitnessLifecycleV1(
      witnessLifecycleSource);
    assert.equal(replay.ok, true);
    assert.equal(replay.resultReceiptPresent, true);
    assert.equal(replay.witnessSourceDeclaredObservation,
      "OBSERVED_SATISFIED");
    assert.equal(replay.sourceSignatureContinuityVerified, true);
    assert.equal(replay.independentOutcomeTruthEstablished, false);

    const predecessor = predecessorFormation();
    const gate = attachIndependentWitnessToFormationHoldV1({
      tender: fixture.tender,
      expectedTenderHash: fixture.tender.tenderHash,
      predecessorFormation: predecessor,
      expectedPredecessorFormationHash: predecessor.formationHash,
      witnessLifecycleSource,
      expectedWitnessReplayHash: replay.replayHash,
      observedAt: witnessLifecycleSource.observedAt,
    });
    assert.equal(gate.independentWitnessReceiptPresent, true);
    assert.equal(gate.witnessObservationResponsibilityCurrent, true);
    assert.equal(gate.independentWitnessControlEstablished, false);
    assert.equal(gate.independentWitnessOutcomeTruthEstablished, false);
    assert.equal(gate.atomicCommitmentGateSatisfied, false);
    assert.equal(gate.atomicCommit, false);
    assert.equal(gate.userOutcomePromiseIssued, false);
    assert.equal(gate.decisionState, "HOLD");
    assert.equal(gate.authority, "NONE");
    assert.equal(gate.gapCodes.includes(
      "INDEPENDENT_WITNESS_RECEIPT_NOT_PRESENT"), false);
  });

test("provider self-report, server ACK, and model reward cannot be emitted as witness evidence",
  () => {
    for (const evidenceSourceClass of ["PROVIDER_SELF_REPORT",
      "SERVER_ACKNOWLEDGEMENT", "MODEL_REWARD"]) {
      const value = source();
      assert.throws(() => result(value.capability,
        value.reservationSourceBytes, { evidenceSourceClass }),
      /FORBIDDEN_OUTCOME_EVIDENCE_SOURCE_CLASS/u);
    }
  });

test("the same seam binds a recovery outcome to its exact recovery requirement",
  () => {
    const recovery = fixture.tender.recoveryRequirements.items[0];
    const value = source({
      observationTarget: "RECOVERY_OUTCOME",
      recoveryRequirementId: recovery.recoveryRequirementId,
      recoveryOutcomeRefHash: recovery.recoveryOutcomeRefHash,
    });
    const resultBytes = result(value.capability, value.reservationSourceBytes, {
      observationStatus: "OBSERVED_NOT_SATISFIED",
      evidenceSourceClass: "INDEPENDENT_INSTRUMENT_OBSERVATION",
    });
    const replay = verifyIndependentOutcomeWitnessLifecycleV1(
      replayInput(value, resultBytes));
    assert.equal(replay.ok, true);
    assert.equal(replay.observationTarget, "RECOVERY_OUTCOME");
    assert.equal(replay.recoveryRequirementId,
      recovery.recoveryRequirementId);
    assert.equal(replay.recoveryOutcomeTruthEstablished, false);

    const wrongRecovery = source({
      observationTarget: "PRIMARY_OUTCOME",
      recoveryRequirementId: null,
      recoveryOutcomeRefHash: null,
    });
    assert.throws(() => emitIndependentOutcomeWitnessReservationV1(
      wrongRecovery.capability, {
        tender: fixture.tender,
        expectedTenderHash: fixture.tender.tenderHash,
        reservationId: "reservation.witness.invalid-recovery",
        lifecycleStreamId: "stream.witness.invalid-recovery",
        evidenceRequirementId: evidence.evidenceRequirementId,
        observationTarget: "RECOVERY_OUTCOME",
        recoveryRequirementId: recovery.recoveryRequirementId,
        recoveryOutcomeRefHash: h("wrong-recovery-outcome"),
        primaryAttemptHash: fixture.tender.typedGraph.attempt.attemptHash,
        primaryProviderRefHash,
        primaryControllerRefHash: h("primary-controller"),
        witnessProviderRefHash,
        reservationNonceHash: h("invalid-recovery-reservation-nonce"),
        observationOpensAt: "2026-09-02T16:31:00.000Z",
        observationClosesAt: "2026-09-02T17:50:00.000Z",
        expiresAt: "2026-09-02T18:00:00.000Z",
        reservedAt: "2026-09-02T15:31:00.000Z",
      }), /RECOVERY_BINDING_MISMATCH/u);
  });

test("signed revocation is replayed and closes current observation responsibility",
  () => {
    const value = source();
    const resultBytes = result(value.capability, value.reservationSourceBytes);
    const revocationBytes = emitIndependentOutcomeWitnessRevocationV1(
      value.capability, {
        reservationSourceBytes: value.reservationSourceBytes,
        revocationNonceHash: h("revocation-nonce"),
        reasonCode: "OWNER_WITHDREW_OBSERVATION_CAPACITY",
        revokedAt: "2026-09-02T17:30:00.000Z",
      });
    const replay = verifyIndependentOutcomeWitnessLifecycleV1(replayInput(
      value, resultBytes, revocationBytes, "2026-09-02T17:31:00.000Z"));
    assert.equal(replay.ok, true);
    assert.equal(replay.resultReceiptPresent, true);
    assert.equal(replay.reservationRevoked, true);
    assert.equal(replay.reservationCurrent, false);
    assert.equal(replay.independentOutcomeTruthEstablished, false);

    const tampered = JSON.parse(resultBytes.toString("utf8"));
    tampered.payload.observationStatus = "OBSERVED_NOT_SATISFIED";
    const tamperedBytes = Buffer.from(canonicalizeStrict(tampered), "utf8");
    const rejected = verifyIndependentOutcomeWitnessLifecycleV1({
      ...replayInput(value, tamperedBytes),
      expectedResultReceiptSourceHash: sha256Bytes(tamperedBytes),
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.independentOutcomeTruthEstablished, false);
  });
