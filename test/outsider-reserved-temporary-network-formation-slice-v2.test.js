import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
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
  verifyIndependentOutcomeWitnessLifecycleV1,
} from "../src/outsider-independent-outcome-witness-lifecycle-v1.js";
import {
  createExternalCapacityReservationRequestV1,
  createSellerOwnedCapacityReservationBundleV1,
  createSellerOwnedCapacityReservationSignerV1,
  createSellerOwnedCapacityReservationTerminalDescendantV1,
  verifyExternalCapacityReservationProtocolV1,
} from "../src/outsider-external-capacity-reservation-protocol-v1.js";
import {
  OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_SCHEMAS,
} from "../src/outsider-injected-temporary-network-formation-slice-v1.js";
import {
  createReservedTemporaryNetworkFormationSliceV2,
  verifyReservedTemporaryNetworkFormationSliceV2,
} from "../src/outsider-reserved-temporary-network-formation-slice-v2.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const sha = (bytes) => `sha256:${createHash("sha256")
  .update(bytes).digest("hex")}`;
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
const ROLE = Object.freeze({
  RESOURCE: "PRIMARY",
  RECOVERY: "RECOVERY",
  EVIDENCE: "INDEPENDENT_WITNESS",
});

const fixture = createTemporaryNetworkV2MultiSlotFixture({
  fixtureLabel: "reserved-formation-v2",
  observedAt: "2026-09-02T14:30:00.000Z",
  formationDeadline: "2026-09-02T16:30:00.000Z",
});
const slotByRole = Object.fromEntries(fixture.slots.map((slot) => [
  ROLE[slot.requirementKind], slot,
]));
const primaryProviderRefHash = slotByRole.PRIMARY.mailbox.source
  .oneUseResponseReplay.responses[0].providerRefHash;
const witnessProviderRefHash = slotByRole.INDEPENDENT_WITNESS.mailbox.source
  .oneUseResponseReplay.responses[0].providerRefHash;
const witnessOwnerRefHash = h("reserved-v2-witness-owner");

function predecessorFormation() {
  const slots = Object.entries(slotByRole).map(([role, slot]) => {
    const response = slot.mailbox.source.oneUseResponseReplay.responses[0];
    return {
      role,
      requirementKind: slot.requirementKind,
      requirementId: slot.requirementId,
      providerRefHash: response.providerRefHash,
      oneUseResponseHash: response.responseHash,
      endpointReturnedSignedSources: true,
      sourceBundleCryptographicallyConsistent: true,
      sourceDeclaredReservationCurrent: true,
      capacityReserved: false,
      authority: "NONE",
    };
  });
  const body = {
    schema:
      OUTSIDER_INJECTED_TEMPORARY_NETWORK_FORMATION_SLICE_V1_SCHEMAS.formation,
    schemaVersion: "1.0.0",
    tenderHash: fixture.tender.tenderHash,
    slots,
    atomicCommitmentGateSatisfied: false,
    atomicCommit: false,
    userOutcomePromiseIssued: false,
    independentWitnessReceiptPresent: false,
    independentWitnessOutcomeTruthEstablished: false,
    externalResourceOwnerTrustEstablished: false,
    primaryCapacityReserved: false,
    recoveryCapacityReserved: false,
    disposition: "CONTINUE_AUTOMATED_FORMATION_HOLD",
    gapCodes: ["INDEPENDENT_WITNESS_RECEIPT_NOT_PRESENT"],
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return { ...body, formationHash: digest(body.schema, body) };
}

function witnessSource({ observedAt, withResult = false } = {}) {
  const pair = generateKeyPairSync("ed25519");
  const context = createIndependentOutcomeWitnessVerifierContextV1({
    sourceSystemId: "reserved.v2.witness.source",
    witnessOwnerRefHash,
    witnessControllerRefHash: h("reserved-v2-witness-controller"),
    observationPolicyRefHash: h("reserved-v2-witness-policy"),
    publicKeyPem: pair.publicKey.export({
      type: "spki", format: "pem",
    }).toString(),
  });
  const capability = createIndependentOutcomeWitnessSourceCapabilityV1({
    verifierContext: context,
    expectedVerifierContextHash: context.verifierContextHash,
    witnessPrivateKeyPem: pair.privateKey.export({
      type: "pkcs8", format: "pem",
    }).toString(),
  });
  const evidence = fixture.tender.evidenceRequirements.items[0];
  const reservationSourceBytes = emitIndependentOutcomeWitnessReservationV1(
    capability, {
      tender: fixture.tender,
      expectedTenderHash: fixture.tender.tenderHash,
      reservationId: "reservation.reserved-v2-witness.001",
      lifecycleStreamId: "stream.reserved-v2-witness.001",
      evidenceRequirementId: evidence.evidenceRequirementId,
      observationTarget: "PRIMARY_OUTCOME",
      recoveryRequirementId: null,
      recoveryOutcomeRefHash: null,
      primaryAttemptHash: fixture.tender.typedGraph.attempt.attemptHash,
      primaryProviderRefHash,
      primaryControllerRefHash: h("reserved-v2-primary-controller"),
      witnessProviderRefHash,
      reservationNonceHash: h("reserved-v2-witness-reservation-nonce"),
      observationOpensAt: "2026-09-02T15:00:00.000Z",
      observationClosesAt: "2026-09-02T17:30:00.000Z",
      expiresAt: "2026-09-02T18:00:00.000Z",
      reservedAt: "2026-09-02T14:00:00.000Z",
    });
  const resultReceiptSourceBytes = withResult
    ? emitIndependentOutcomeWitnessResultReceiptV1(capability, {
      reservationSourceBytes,
      observationStatus: "OBSERVED_SATISFIED",
      evidenceSourceClass: "WITNESS_DIRECT_OBSERVATION",
      observationEvidenceHashes: [h("reserved-v2-direct-observation")],
      resultReceiptNonceHash: h("reserved-v2-result-nonce"),
      observedAt: "2026-09-02T16:00:00.000Z",
      issuedAt: "2026-09-02T16:01:00.000Z",
    }) : null;
  const source = {
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    verifierContext: context,
    expectedVerifierContextHash: context.verifierContextHash,
    reservationSourceBytes,
    expectedReservationSourceHash: sha(reservationSourceBytes),
    resultReceiptSourceBytes,
    expectedResultReceiptSourceHash:
      resultReceiptSourceBytes ? sha(resultReceiptSourceBytes) : null,
    revocationSourceBytes: null,
    expectedRevocationSourceHash: null,
    observedAt,
  };
  const replay = verifyIndependentOutcomeWitnessLifecycleV1(source);
  assert.equal(replay.ok, true, replay.errorCode);
  return { source, replay };
}

function capacitySlot(role, observedAt, terminalState = null) {
  const slot = slotByRole[role];
  const responseReplay = slot.mailbox.source.oneUseResponseReplay;
  const response = responseReplay.responses[0];
  const pair = generateKeyPairSync("ed25519");
  const ownerRef = role === "INDEPENDENT_WITNESS"
    ? witnessOwnerRefHash : h(`reserved-v2-owner-${role}`);
  const owner = createSellerOwnedCapacityReservationSignerV1({
    sellerOwnerPrivateKeyPem: pair.privateKey.export({
      type: "pkcs8", format: "pem",
    }),
    sourceSystemRefHash: h(`reserved-v2-source-${role}`),
    resourceOwnerRefHash: ownerRef,
    providerRefHash: response.providerRefHash,
    ownerSourceRevisionHash: h(`reserved-v2-owner-revision-${role}`),
    rightsPrivacyPolicyRefHash:
      fixture.tender.authorizationBinding.rightsPrivacyPolicyRefHash,
    issuedAt: "2026-09-02T11:59:00.000Z",
    validFrom: "2026-09-02T12:00:00.000Z",
    validUntil: "2026-09-02T19:00:00.000Z",
    maximumLifecycleHeadAgeMs: 86_400_000,
  });
  const requestSource = {
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    responses: responseReplay.responses,
    responseOccurrences: responseReplay.occurrences,
    expectedResponseOccurrenceCount: responseReplay.expectedOccurrenceCount,
    expectedResponseLifecycleHeadHash:
      responseReplay.expectedLifecycleHeadHash,
    ownerSourceBytes: owner.ownerSourceBytes,
    expectedOwnerSourceHash: owner.publicProjection.ownerSourceHash,
    requestedAt: "2026-09-02T13:30:00.000Z",
    requestExpiresAt: "2026-09-02T14:00:00.000Z",
    reservationNonceHash: h(`reserved-v2-capacity-nonce-${role}`),
  };
  const request = createExternalCapacityReservationRequestV1(requestSource);
  const initial = createSellerOwnedCapacityReservationBundleV1(owner.signer, {
    request,
    requestSource,
    reservationReceiptId: `reservation.reserved-v2-${role}`,
    lifecycleStreamId: `stream.reserved-v2-${role}`,
    reservedAt: "2026-09-02T13:31:00.000Z",
    headObservedAt: "2026-09-02T13:32:00.000Z",
    occurrenceNonceHash: h(`reserved-v2-occurrence-${role}`),
  });
  const emitted = terminalState === null ? initial
    : createSellerOwnedCapacityReservationTerminalDescendantV1(owner.signer, {
      request,
      requestSource,
      sourceBundle: initial.sourceBundle,
      eventState: terminalState,
      occurredAt: terminalState === "EXPIRED"
        ? "2026-09-02T16:00:00.000Z"
        : "2026-09-02T13:40:00.000Z",
      headObservedAt: terminalState === "EXPIRED"
        ? "2026-09-02T16:00:01.000Z"
        : "2026-09-02T13:41:00.000Z",
      occurrenceNonceHash: h(`reserved-v2-terminal-${role}-${terminalState}`),
    });
  const bundle = emitted.sourceBundle;
  const verificationInput = {
    request,
    requestSource,
    reservationReceiptSourceBytes: bundle.reservationReceiptSourceBytes,
    expectedReservationReceiptSourceHash:
      sha(bundle.reservationReceiptSourceBytes),
    lifecycleEventSourceBytes: bundle.lifecycleEventSourceBytes,
    expectedLifecycleEventSourceHashes:
      bundle.lifecycleEventSourceBytes.map(sha),
    lifecycleHeadSourceBytes: bundle.lifecycleHeadSourceBytes,
    expectedLifecycleHeadSourceHash: sha(bundle.lifecycleHeadSourceBytes),
    observedAt,
  };
  const checked = verifyExternalCapacityReservationProtocolV1(
    verificationInput);
  assert.equal(checked.ok, true, checked.error);
  return { role, verificationInput,
    expectedVerificationHash: checked.verificationHash };
}

function formationInput({ observedAt = "2026-09-02T14:30:00.000Z",
  roles = ["PRIMARY", "RECOVERY", "INDEPENDENT_WITNESS"],
  terminalByRole = {}, withWitnessResult = false } = {}) {
  const predecessor = predecessorFormation();
  const witness = witnessSource({ observedAt, withResult: withWitnessResult });
  const witnessHoldGateInput = {
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    predecessorFormation: predecessor,
    expectedPredecessorFormationHash: predecessor.formationHash,
    witnessLifecycleSource: witness.source,
    expectedWitnessReplayHash: witness.replay.replayHash,
    observedAt,
  };
  const witnessHoldGate = attachIndependentWitnessToFormationHoldV1(
    witnessHoldGateInput);
  return {
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    predecessorFormation: predecessor,
    expectedPredecessorFormationHash: predecessor.formationHash,
    capacityReservationSlots: roles.map((role) =>
      capacitySlot(role, observedAt, terminalByRole[role] ?? null)),
    witnessHoldGate,
    witnessHoldGateInput,
    expectedWitnessHoldGateHash: witnessHoldGate.gateHash,
    observedAt,
  };
}

test("three exact source-declared reservations close structural Gate 4 evidence but never COMMIT",
  () => {
    const input = formationInput();
    const result = createReservedTemporaryNetworkFormationSliceV2(input);
    assert.equal(result.exactPredecessorContentHashReplayed, true);
    assert.equal(result.exactThreeSlotBijectionVerified, true);
    assert.equal(result.allSourceDeclaredReservationsCurrent, true);
    assert.equal(result.sourceDeclaredGate4EvidenceComplete, true);
    assert.equal(result.witnessCapacityAndObservationLifecycleCrossBindingVerified,
      true);
    assert.equal(result.independentWitnessResultReceiptPresent, false);
    assert.equal(result.witnessCapacityReservationSubstitutesForOutcomeTruth,
      false);
    assert.equal(result.resourceOwnerAuthorityEstablished, false);
    assert.equal(result.externalCapacityEstablished, false);
    assert.equal(result.capacityReserved, false);
    assert.equal(result.independentWitnessControlEstablished, false);
    assert.equal(result.independentWitnessOutcomeTruthEstablished, false);
    assert.equal(result.atomicCommitmentGateSatisfied, false);
    assert.equal(result.atomicCommit, false);
    assert.equal(result.userOutcomePromiseIssued, false);
    assert.equal(result.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
    assert.equal(result.humanQueueCreated, false);
    assert.equal(result.authority, "NONE");

    const replay = verifyReservedTemporaryNetworkFormationSliceV2(
      input, result.formationHash);
    assert.equal(replay.formationHash, result.formationHash);
  });

test("missing and revoked reservations remain HOLD before deadline and decline at it without human ops",
  () => {
    const missingInput = formationInput({
      roles: ["PRIMARY", "INDEPENDENT_WITNESS"],
    });
    const missing = createReservedTemporaryNetworkFormationSliceV2(
      missingInput);
    assert.equal(missing.exactThreeSlotBijectionVerified, false);
    assert.deepEqual(missing.missingRoles, ["RECOVERY"]);
    assert.equal(missing.allSourceDeclaredReservationsCurrent, false);
    assert.equal(missing.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
    assert.equal(missing.humanQueueCreated, false);

    const revoked = createReservedTemporaryNetworkFormationSliceV2(
      formationInput({ terminalByRole: { RECOVERY: "REVOKED" } }));
    assert.equal(revoked.sourceDeclaredRecoveryReservationCurrent, false);
    assert.equal(revoked.allSourceDeclaredReservationsCurrent, false);
    assert.equal(revoked.gapCodes.includes(
      "RECOVERY_SOURCE_DECLARED_RESERVATION_REVOKED"), true);
    assert.equal(revoked.atomicCommit, false);

    const atDeadline = createReservedTemporaryNetworkFormationSliceV2(
      formationInput({
        observedAt: fixture.tender.formationDeadline,
        roles: [],
      }));
    assert.equal(atDeadline.disposition, "DECLINE_NOT_HUMAN_QUEUE");
    assert.equal(atDeadline.humanQueueCreated, false);
    assert.equal(atDeadline.atomicCommit, false);
  });

test("a later witness result may be present while expired capacity and unproven truth keep the gate closed",
  () => {
    const terminalByRole = {
      PRIMARY: "EXPIRED",
      RECOVERY: "EXPIRED",
      INDEPENDENT_WITNESS: "EXPIRED",
    };
    const result = createReservedTemporaryNetworkFormationSliceV2(
      formationInput({
        observedAt: "2026-09-02T17:02:00.000Z",
        terminalByRole,
        withWitnessResult: true,
      }));
    assert.equal(result.independentWitnessResultReceiptPresent, true);
    assert.equal(result.witnessResultReceiptAcceptedAsOutcomeTruth, false);
    assert.equal(result.allSourceDeclaredReservationsCurrent, false);
    assert.equal(result.sourceDeclaredGate4EvidenceComplete, false);
    assert.equal(result.independentWitnessOutcomeTruthEstablished, false);
    assert.equal(result.capacityReserved, false);
    assert.equal(result.disposition, "DECLINE_NOT_HUMAN_QUEUE");
    assert.equal(result.atomicCommit, false);
  });

test("provider/offer splices and output-only witness gate edits fail source rebuild",
  () => {
    const input = formationInput();
    const first = input.capacityReservationSlots[0];
    const spliced = {
      ...input,
      capacityReservationSlots: [{
        ...first,
        verificationInput: {
          ...first.verificationInput,
          request: {
            ...first.verificationInput.request,
            providerRefHash: h("spliced-provider"),
          },
        },
      }, ...input.capacityReservationSlots.slice(1)],
    };
    assert.throws(() => createReservedTemporaryNetworkFormationSliceV2(
      spliced), /CAPACITY_RESERVATION_REPLAY_OR_GRAPH_BINDING_INVALID/u);

    const witnessOutputEdit = {
      ...input,
      witnessHoldGate: {
        ...input.witnessHoldGate,
        independentWitnessOutcomeTruthEstablished: true,
      },
    };
    assert.throws(() => createReservedTemporaryNetworkFormationSliceV2(
      witnessOutputEdit), /WITNESS_HOLD_GATE_REBUILD_OR_BOUNDARY_INVALID/u);
  });
