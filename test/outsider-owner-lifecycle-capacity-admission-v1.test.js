import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  createBuyerNativeRouteEvidenceV1,
} from "../src/outsider-buyer-native-route-evidence-v1.js";
import {
  OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS,
  appendAgentNeutralRouteProposalV1,
} from "../src/outsider-agent-neutral-route-proposal-registry-v1.js";
import {
  createExternalCapacityReservationRequestV1,
  createSellerOwnedCapacityReservationBundleV1,
  createSellerOwnedCapacityReservationSignerV1,
  createSellerOwnedCapacityReservationTerminalDescendantV1,
} from "../src/outsider-external-capacity-reservation-protocol-v1.js";
import {
  OUTSIDER_OWNER_LIFECYCLE_CAPACITY_ADMISSION_V1_BOUNDARY,
  admitOwnerLifecycleCapacityToRouteEvidenceV1,
  mapOwnerLifecycleCapacityAdmissionToRecoveryCandidateV1,
  selectOwnerLifecycleCapacityAdmissionsForRecoveryV1,
} from "../src/outsider-owner-lifecycle-capacity-admission-v1.js";
import { createOutcomeOsLifecycleRuntimeV1 }
  from "../src/outsider-outcome-os-lifecycle-v1.js";
import { prepareRecoveryOptionPortfolioV2 }
  from "../src/outsider-recovery-option-portfolio-v2.js";
import { prepareOutcomeOsV1 }
  from "../src/outsider-three-layer-outcome-product-contract-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const sha = (bytes) => `sha256:${createHash("sha256")
  .update(bytes).digest("hex")}`;

function setup() {
  const fixture = createTemporaryNetworkV2MultiSlotFixture({
    fixtureLabel: "owner-lifecycle-capacity-admission-v1",
  });
  const slot = fixture.slots.find((item) =>
    item.requirementKind === "RESOURCE");
  const replay = slot.mailbox.source.oneUseResponseReplay;
  const response = replay.responses[0];
  const pair = generateKeyPairSync("ed25519");
  const owner = createSellerOwnedCapacityReservationSignerV1({
    sellerOwnerPrivateKeyPem: pair.privateKey.export({
      type: "pkcs8", format: "pem",
    }),
    sourceSystemRefHash: h("source-system"),
    resourceOwnerRefHash:
      slot.mailbox.owner.envelope.principalEpochProjectionHash,
    providerRefHash: response.providerRefHash,
    ownerSourceRevisionHash: h("owner-source-revision"),
    rightsPrivacyPolicyRefHash:
      fixture.tender.authorizationBinding.rightsPrivacyPolicyRefHash,
    issuedAt: "2026-09-02T11:59:00.000Z",
    validFrom: "2026-09-02T12:00:00.000Z",
    validUntil: "2026-09-02T17:00:00.000Z",
    maximumLifecycleHeadAgeMs: 86_400_000,
  });
  const requestSource = {
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    responses: replay.responses,
    responseOccurrences: replay.occurrences,
    expectedResponseOccurrenceCount: replay.expectedOccurrenceCount,
    expectedResponseLifecycleHeadHash: replay.expectedLifecycleHeadHash,
    ownerSourceBytes: owner.ownerSourceBytes,
    expectedOwnerSourceHash: owner.publicProjection.ownerSourceHash,
    requestedAt: "2026-09-02T13:30:00.000Z",
    requestExpiresAt: "2026-09-02T14:00:00.000Z",
    reservationNonceHash: h("reservation-nonce"),
  };
  const request = createExternalCapacityReservationRequestV1(requestSource);
  const emission = createSellerOwnedCapacityReservationBundleV1(owner.signer, {
    request,
    requestSource,
    reservationReceiptId: "reservation.capacity.seam.0001",
    lifecycleStreamId: "reservation-stream.capacity.seam.0001",
    reservedAt: "2026-09-02T13:31:00.000Z",
    headObservedAt: "2026-09-02T13:32:00.000Z",
    occurrenceNonceHash: h("reserved-occurrence"),
  });
  const verificationInput = verificationFor(request, requestSource,
    emission.sourceBundle, "2026-09-02T13:33:00.000Z");
  const routeEvidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: response.discoveryRouteObjectHash,
    occurrenceRefHash: h("route-occurrence"),
    recoveryOptionRefHash: h("recovery-option"),
    observedAt: "2026-09-02T13:30:00.000Z",
    validUntil: "2026-09-02T16:00:00.000Z",
    sourceReplayReceiptHash: h("route-replay-receipt"),
    facts: {
      specification: {
        sourceOccurrenceRefHash: h("spec-occurrence"),
        frozenPredicateHash: h("predicate"),
        evaluationRefHash: h("evaluation"),
        status: "MATCH",
      },
      allInPrice: {
        sourceOccurrenceRefHash: h("price-occurrence"),
        constraintRefHash: h("maximum-loss"),
        currency: "USD",
        allInMinorUnits: 1_817,
        includesItemTaxShippingAndFees: true,
        status: "COMPLETE",
      },
      eta: {
        sourceOccurrenceRefHash: h("eta-occurrence"),
        completionDeadline: "2026-09-02T16:00:00.000Z",
        estimatedCompletionAt: "2026-09-02T15:45:00.000Z",
        status: "STRUCTURED",
      },
      capacity: {
        sourceOccurrenceRefHash: h("route-occurrence"),
        capacityLifecycleRefHash: null,
        capacityLifecycleHeadHash: null,
        reservedFrom: null,
        reservedUntil: null,
        status: "UNRESERVED",
        sourceClass: "SELLER_SERVER_ACK_ONLY",
      },
    },
  });
  return { fixture, response, owner, requestSource, request, emission,
    verificationInput, routeEvidence };
}

function verificationFor(request, requestSource, sourceBundle, observedAt) {
  return {
    request,
    requestSource,
    reservationReceiptSourceBytes:
      sourceBundle.reservationReceiptSourceBytes,
    expectedReservationReceiptSourceHash:
      sha(sourceBundle.reservationReceiptSourceBytes),
    lifecycleEventSourceBytes: sourceBundle.lifecycleEventSourceBytes,
    expectedLifecycleEventSourceHashes:
      sourceBundle.lifecycleEventSourceBytes.map(sha),
    lifecycleHeadSourceBytes: sourceBundle.lifecycleHeadSourceBytes,
    expectedLifecycleHeadSourceHash:
      sha(sourceBundle.lifecycleHeadSourceBytes),
    observedAt,
  };
}

function routeInput(record, overrides = {}) {
  return {
    routeProposalRefHash: record.routeProposalRefHash,
    occurrenceRefHash: record.occurrenceRefHash,
    recoveryOptionRefHash: record.recoveryOptionRefHash,
    observedAt: record.observedAt,
    validUntil: record.validUntil,
    sourceReplayReceiptHash: record.sourceReplayReceiptHash,
    facts: record.facts,
    ...overrides,
  };
}

function option(role, label, optionRefHash = h(`option:${label}`)) {
  return {
    optionRefHash,
    role,
    recoveryMechanismKind: "ROUTE_SUBSTITUTION",
    latestSafeExerciseAt: "2026-09-02T15:30:00.000Z",
    exerciseAuthorityRefHash: h(`authority:${label}`),
    exerciseInstructionRefHash: h(`instruction:${label}`),
    cancellationRefHash: h(`cancellation:${label}`),
    exclusiveExerciseSemantics: "SINGLE_WRITER_PRIMARY_XOR_RECOVERY",
    failureDomainRefHashes: [h(`failure-domain:${label}`)],
    failureDomainEvidenceRefHash: h(`failure-evidence:${label}`),
  };
}

function recoveryContext(state) {
  const graph = state.fixture.tender.typedGraph;
  const outcomeOs = prepareOutcomeOsV1({
    requestIdHash: h("request"),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h("outcome-definition"),
    acceptancePredicateHash: h("predicate"),
    formationDeadline: "2026-09-02T14:00:00.000Z",
    completionDeadline: "2026-09-02T16:00:00.000Z",
    maximumLossConstraintHash: h("maximum-loss"),
    typedGraphRefs: {
      principalEpochRefHash:
        graph.principalEpoch.principalEpochProjectionHash,
      accountableDeploymentRefHash:
        graph.accountableDeployment.accountableDeploymentSubjectHash,
      runtimeRefHash: graph.runtime.runtimeInstanceHash,
      embodimentRefHash: graph.embodiment.embodimentRevisionHash,
      delegationRefHash: graph.delegation.delegationEdgeHash,
      episodeRefHash: graph.episode.episodeHash,
      attemptRefHash: graph.attempt.attemptHash,
    },
  });
  const lifecycle = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = lifecycle.create({
    contractId: `contract_${h("contract").slice(7, 39)}`,
    outcomeOs,
    expectedOutcomeOsArtifactHash: outcomeOs.artifactHash,
    recordedAt: "2026-09-02T13:00:00.000Z",
    idempotencyKeyHash: h("contract-create"),
  });
  lifecycle.append({
    eventType: "CONTRACT_OPENED",
    recordedAt: "2026-09-02T13:01:00.000Z",
    idempotencyKeyHash: h("contract-open"),
    expectedHeadHash: created.head.headHash,
    payload: { openInstructionRefHash: h("open-instruction") },
  });
  const outcomeLifecycleEvents = lifecycle.exportEvents();
  const appended = appendAgentNeutralRouteProposalV1({
    outcomeLifecycleEvents,
    registryEvents: [],
    proposal: {
      recordedAt: state.routeEvidence.observedAt,
      idempotencyKeyHash: h("route-registry-append"),
      expectedRegistryHeadHash:
        OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS,
      routeProposalRefHash: state.routeEvidence.routeProposalRefHash,
      occurrenceRefHash: state.routeEvidence.occurrenceRefHash,
    },
  });
  return {
    outcomeLifecycleEvents,
    routeProposalRegistryEvents: appended.exportedEvents,
    recoveryPortfolio: prepareRecoveryOptionPortfolioV2({
      outcomeOs,
      observedAt: "2026-09-02T13:29:00.000Z",
      primaryOption: option("PRIMARY", "primary"),
      recoveryOptions: [option("RECOVERY", "recovery",
        state.routeEvidence.recoveryOptionRefHash)],
    }),
    evaluatedAt: "2026-09-02T13:34:00.000Z",
    frozenConstraints: {
      acceptancePredicateHash: outcomeOs.acceptancePredicateHash,
      maximumLossConstraintHash: outcomeOs.maximumLossConstraintHash,
      currency: "USD",
      maximumAllInMinorUnits: 2_000,
      completionDeadline: outcomeOs.completionDeadline,
    },
  };
}

test("a current exact owner lifecycle can emit the existing recovery CAPACITY fact",
  () => {
    const state = setup();
    const input = {
      routeEvidence: state.routeEvidence,
      capacityVerificationInput: state.verificationInput,
    };
    const admitted = admitOwnerLifecycleCapacityToRouteEvidenceV1(input);
    assert.equal(admitted.capacityEvidenceState, "CAPACITY_RESERVED");
    assert.equal(admitted.ownerLifecycleSourceReplayed, true);
    assert.equal(admitted.routeEvidence.facts.capacity.status, "RESERVED");
    assert.equal(admitted.routeEvidence.facts.capacity.sourceClass,
      "RESOURCE_OWNER_LIFECYCLE_SOURCE_REPLAY");
    assert.equal(admitted.routeEvidence.facts.capacity.reservedUntil,
      state.response.serviceUntil);
    assert.equal(admitted.routeEvidence.facts.capacity
      .capacityLifecycleRefHash,
    admitted.reservationReceiptSourceHash);
    assert.equal(admitted.rawSourceBytesProjected, false);
    assert.equal(admitted.resourceOwnerAuthorityEstablished, false);
    assert.equal(admitted.externalCapacityEstablishedByThisModule, false);
    assert.equal(admitted.independentOutcomeTruthEstablished, false);
    assert.equal(admitted.authorityMinted, false);
    assert.equal(admitted.outcomeCommitIssued, false);
    assert.equal(admitted.paymentPerformed, false);
    assert.equal(admitted.orderPerformed, false);
    assert.equal(admitted.authority, "NONE");
    assert.equal(admitted.actionReady, false);
    assert.equal(admitted.executable, false);

    const candidate = mapOwnerLifecycleCapacityAdmissionToRecoveryCandidateV1(
      input);
    assert.deepEqual(candidate.evidenceEvents.map((event) =>
      event.evidenceKind),
    ["SPECIFICATION", "ALL_IN_PRICE", "ETA", "CAPACITY"]);
    const capacity = candidate.evidenceEvents.at(-1);
    assert.equal(capacity.payload.status, "RESERVED");
    assert.equal(capacity.payload.sourceClass,
      "RESOURCE_OWNER_LIFECYCLE_SOURCE_REPLAY");
    assert.equal(OUTSIDER_OWNER_LIFECYCLE_CAPACITY_ADMISSION_V1_BOUNDARY
      .consequenceReach, "RECOVERY_PORTFOLIO_PLANNING_ONLY");

    const selection = selectOwnerLifecycleCapacityAdmissionsForRecoveryV1({
      ...recoveryContext(state),
      capacityAdmissionInputs: [input],
    });
    assert.equal(selection.admittedCandidateCount, 1);
    assert.equal(selection.portfolioPlanningSelectionMade, true);
    assert.equal(selection.capacityEstablishedByThisModule, false);
    assert.equal(selection.recoveryOptionHeld, false);
    assert.equal(selection.authorityMinted, false);
    assert.equal(selection.outcomeCommitIssued, false);
    assert.equal(selection.actionReady, false);
    assert.equal(selection.executable, false);
  });

test("cart, ATP, quote, generic ACK, and adapter-labelled RESERVED cannot enter",
  () => {
    const state = setup();
    for (const sourceClass of ["CART", "ATP", "QUOTE", "SERVER_ACK"]) {
      assert.throws(() => admitOwnerLifecycleCapacityToRouteEvidenceV1({
        routeEvidence: state.routeEvidence,
        capacityVerificationInput: { sourceClass, status: "RESERVED" },
      }), /CURRENT_OWNER_LIFECYCLE_RESERVATION_REPLAY_REQUIRED/u);
    }

    const claimed = createBuyerNativeRouteEvidenceV1(routeInput(
      state.routeEvidence, {
      facts: {
        ...state.routeEvidence.facts,
        capacity: {
          sourceOccurrenceRefHash: h("claimed-reserved"),
          capacityLifecycleRefHash: h("claimed-lifecycle"),
          capacityLifecycleHeadHash: h("claimed-head"),
          reservedFrom: "2026-09-02T13:30:00.000Z",
          reservedUntil: "2026-09-02T16:00:00.000Z",
          status: "RESERVED",
          sourceClass: "SELLER_SERVER_ACK_ONLY",
        },
      },
    }));
    assert.throws(() => admitOwnerLifecycleCapacityToRouteEvidenceV1({
      routeEvidence: claimed,
      capacityVerificationInput: state.verificationInput,
    }), /BASE_ROUTE_CAPACITY_MUST_BE_UNRESERVED/u);
  });

test("a signed REVOKED descendant releases the hold and closes admission", () => {
  const state = setup();
  const terminal = createSellerOwnedCapacityReservationTerminalDescendantV1(
    state.owner.signer, {
      request: state.request,
      requestSource: state.requestSource,
      sourceBundle: state.emission.sourceBundle,
      eventState: "REVOKED",
      occurredAt: "2026-09-02T13:34:00.000Z",
      headObservedAt: "2026-09-02T13:35:00.000Z",
      occurrenceNonceHash: h("revoked-occurrence"),
    });
  const revokedInput = verificationFor(state.request, state.requestSource,
    terminal.sourceBundle, "2026-09-02T13:36:00.000Z");
  assert.throws(() => admitOwnerLifecycleCapacityToRouteEvidenceV1({
    routeEvidence: state.routeEvidence,
    capacityVerificationInput: revokedInput,
  }), /CURRENT_OWNER_LIFECYCLE_RESERVATION_REPLAY_REQUIRED/u);
});

test("typed route splice and expired base evidence fail before planning", () => {
  const state = setup();
  const otherRoute = createBuyerNativeRouteEvidenceV1(routeInput(
    state.routeEvidence, {
    routeProposalRefHash: h("other-route"),
  }));
  assert.throws(() => admitOwnerLifecycleCapacityToRouteEvidenceV1({
    routeEvidence: otherRoute,
    capacityVerificationInput: state.verificationInput,
  }), /ROUTE_PROPOSAL_TO_RESERVATION_ROUTE_BINDING_INVALID/u);

  const stale = createBuyerNativeRouteEvidenceV1(routeInput(
    state.routeEvidence, {
    validUntil: "2026-09-02T13:32:00.000Z",
  }));
  assert.throws(() => admitOwnerLifecycleCapacityToRouteEvidenceV1({
    routeEvidence: stale,
    capacityVerificationInput: state.verificationInput,
  }), /BASE_ROUTE_EVIDENCE_NOT_CURRENT/u);
});
