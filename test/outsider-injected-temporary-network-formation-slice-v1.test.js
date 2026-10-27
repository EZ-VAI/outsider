import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  OUTSIDER_FORMATION_CONTROL_LEDGER_V1_GENESIS,
  createFormationControlEventV1,
  createFormationControlLedgerSourcePinV1,
  createFormationControlLedgerV1,
} from "../src/outsider-formation-control-ledger-v1.js";
import { createOutcomeFormationTemporaryNetworkCoordinatorV1 }
  from "../src/outsider-outcome-formation-temporary-network-coordinator-v1.js";
import {
  formInjectedTemporaryNetworkV1,
} from "../src/outsider-injected-temporary-network-formation-slice-v1.js";
import { createSellerOwnedDurableCapacityEmitterAdapterV2 }
  from "../src/outsider-seller-owned-durable-one-use-capacity-emitter-v2.js";
import { createSellerOwnedHttpOneUseTenderEndpointV1 }
  from "../src/outsider-seller-owned-http-one-use-tender-endpoint-v1.js";
import { createSellerOwnedOneUseCapacityEmitterV1 }
  from "../src/outsider-seller-owned-one-use-capacity-emitter-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const alias = (prefix, label) => `${prefix}_${h(label).slice(7, 39)}`;
const ledgerId = (label) => `ledger_${h(label).slice(7, 39)}`;
const ROLE = Object.freeze({
  RESOURCE: "PRIMARY",
  RECOVERY: "RECOVERY",
  EVIDENCE: "INDEPENDENT_WITNESS",
});

const fixture = createTemporaryNetworkV2MultiSlotFixture({
  fixtureLabel: "injected-e2e-formation",
  observedAt: "2026-09-02T15:30:00.000Z",
  formationDeadline: "2026-09-02T16:30:00.000Z",
});

function controlReplay() {
  const tender = fixture.tender;
  const id = alias("ledger", "injected-e2e-control");
  const opened = createFormationControlEventV1({
    ledgerId: id,
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
    eventType: "FORMATION_OPENED",
    ordinal: 1,
    previousOccurrenceHash: OUTSIDER_FORMATION_CONTROL_LEDGER_V1_GENESIS,
    recordedAt: "2026-09-02T12:00:30.000Z",
    occurrenceNonceHash: h("injected-e2e-control-open"),
    payload: { formationDeadline: tender.formationDeadline },
  });
  const source = {
    ledgerId: id,
    tender,
    expectedTenderHash: tender.tenderHash,
    observedAt: fixture.observedAt,
    events: [opened],
    expectedOccurrenceCount: 1,
    expectedHeadHash: opened.occurrenceHash,
  };
  const record = createFormationControlLedgerV1(source);
  return {
    record,
    source,
    expectedSourceHash: createFormationControlLedgerSourcePinV1(source),
    expectedLedgerHash: record.ledgerHash,
  };
}

const coordinatorSource = {
  observedAt: fixture.observedAt,
  slotReplays: fixture.slotReplays,
  controlLedgerReplay: controlReplay(),
  privateProjectionNonce: h("injected-e2e-coordinator-private").slice(7),
};
const coordinator = createOutcomeFormationTemporaryNetworkCoordinatorV1(
  coordinatorSource);

function privateDirectories(t) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-injected-e2e-v1-")));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return Object.fromEntries(fixture.slots.map((slot) => [
    slot.requirementKind,
    path.join(parent, slot.requirementKind.toLowerCase()),
  ]));
}

function alternateWitnessRoute(requirementKind) {
  if (requirementKind === "RESOURCE") {
    return fixture.routeDiscovery.byKind.EVIDENCE;
  }
  if (requirementKind === "EVIDENCE") {
    return fixture.routeDiscovery.byKind.RECOVERY;
  }
  return fixture.routeDiscovery.byKind.RESOURCE;
}

function endpointFor(slot, directory) {
  const mailbox = slot.mailbox;
  const responseReplay = mailbox.source.oneUseResponseReplay;
  const initial = responseReplay.responses[0];
  const external = mailbox.ownerStanding.source.externalStandingReplay;
  const sellerEmitterCapability = createSellerOwnedOneUseCapacityEmitterV1({
    verifierContext: external.verifierContext,
    expectedVerifierContextHash: external.expectedVerifierContextHash,
    sellerPrivateKeyPem: mailbox.standingKey.privateKeyPem,
  });
  const durableEmitterAdapter
    = createSellerOwnedDurableCapacityEmitterAdapterV2({
      directory,
      ledgerId: ledgerId(`injected-e2e-${slot.requirementKind}`),
      adapterInstanceRefHash:
        h(`injected-e2e-adapter-${slot.requirementKind}`),
      sellerEmissionPolicyRefHash:
        h(`injected-e2e-policy-${slot.requirementKind}`),
    });
  const witnessRoute = alternateWitnessRoute(slot.requirementKind);
  return createSellerOwnedHttpOneUseTenderEndpointV1({
    sellerEmitterCapability,
    durableEmitterAdapter,
    expectedTenderHash: fixture.tender.tenderHash,
    expectedInitialResponseHash: initial.responseHash,
    expectedProviderRefHash: initial.providerRefHash,
    expectedScopeHash: initial.scopeHash,
    expectedResponseNonceHash: initial.responseNonceHash,
    expectedResponseExpiresAt: initial.expiresAt,
    expectedHttpRequestNonceHash:
      h(`injected-e2e-http-nonce-${slot.requirementKind}`),
    validFrom: "2026-09-02T15:00:00.000Z",
    validUntil: "2026-09-02T16:30:00.000Z",
    emissionObservedAt: "2026-09-02T15:30:00.000Z",
    sellerEmissionTerms: {
      sourceEvidence: {
        semanticsEvidenceRefHash:
          h(`injected-semantics-${slot.requirementKind}`),
        resourceOwnerRefHash:
          mailbox.owner.envelope.principalEpochProjectionHash,
        standingEvidenceRefHash:
          h(`injected-standing-${slot.requirementKind}`),
        semanticsValidFrom: "2026-09-02T00:00:00.000Z",
        semanticsValidUntil: "2026-09-03T00:00:00.000Z",
        semanticsIssuedAt: "2026-09-02T00:00:00.000Z",
        standingValidFrom: "2026-09-02T12:00:00.000Z",
        standingValidUntil: "2026-09-02T17:00:00.000Z",
        standingIssuedAt: "2026-09-02T11:59:00.000Z",
      },
      reservation: {
        sourceReceiptId: `reservation.injected-${slot.requirementKind}`,
        lifecycleStreamId: `stream.injected-${slot.requirementKind}`,
        reservedFrom: "2026-09-02T15:00:00.000Z",
        reservedUntil: "2026-09-02T16:00:00.000Z",
        receiptIssuedAt: "2026-09-02T12:10:00.000Z",
        eventOccurredAt: "2026-09-02T12:11:00.000Z",
        occurrenceIdentityHash:
          h(`injected-event-${slot.requirementKind}`),
        lifecycleHeadObservedAt: "2026-09-02T15:29:00.000Z",
      },
      witnessRequest: {
        witnessRouteObjectHash: witnessRoute.object.routeObjectHash,
        witnessCandidateHash: witnessRoute.candidate.candidateHash,
        witnessRequirementRefHash:
          fixture.tender.evidenceRequirements.requirementSetHash,
        witnessControllerSeparationPolicyRefHash:
          h(`injected-witness-policy-${slot.requirementKind}`),
        requestedAt: "2026-09-02T15:29:10.000Z",
        observationDeadline: "2026-09-02T17:30:00.000Z",
      },
    },
  });
}

function httpRequestFor(slot, overrides = {}) {
  const replay = slot.mailbox.source.oneUseResponseReplay;
  const body = {
    schema: "outsider/seller-owned-http-one-use-tender-request/v1",
    schemaVersion: "1.0.0",
    requestClass: "EXACT_ONE_USE_TENDER_RESPONSE_REQUEST",
    httpRequestNonceHash:
      h(`injected-e2e-http-nonce-${slot.requirementKind}`),
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    responses: replay.responses,
    responseOccurrences: replay.occurrences,
    expectedResponseOccurrenceCount: replay.expectedOccurrenceCount,
    expectedResponseLifecycleHeadHash: replay.expectedLifecycleHeadHash,
    ...overrides,
  };
  return {
    method: "POST",
    path: "/outsider/v1/one-use-tender-responses",
    contentType: "application/json",
    bodyBytes: Buffer.from(canonicalizeStrict(body), "utf8"),
    receivedAt: "2026-09-02T15:30:10.000Z",
  };
}

function invocations(directories, requestOverrides = {}) {
  return fixture.slots.map((slot) => {
    const external = slot.mailbox.ownerStanding.source.externalStandingReplay;
    return {
      role: ROLE[slot.requirementKind],
      endpoint: endpointFor(slot, directories[slot.requirementKind]),
      httpRequest: httpRequestFor(slot,
        requestOverrides[slot.requirementKind] ?? {}),
      verifierContext: external.verifierContext,
      expectedVerifierContextHash: external.expectedVerifierContextHash,
    };
  });
}

function formationInput(slotInvocations, observedAt = fixture.observedAt) {
  return {
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    coordinatorReplay: {
      source: coordinatorSource,
      expectedCoordinatorHash: coordinator.coordinatorHash,
    },
    slotInvocations,
    observedAt,
  };
}

test("primary, recovery, and witness seller capabilities form in parallel but cannot atomically commit",
  async (t) => {
    const result = await formInjectedTemporaryNetworkV1(formationInput(
      invocations(privateDirectories(t))));
    assert.equal(result.parallelFormationAttempted, true);
    assert.equal(result.parallelDispatchCount, 3);
    assert.equal(result.allRolesStructurallyPresent, true);
    assert.equal(result.allSellerEndpointsReturnedSignedSources, true);
    assert.equal(result.allReturnedSourceBundlesCryptographicallyConsistent,
      true);
    assert.equal(result.allSourceDeclaredReservationsCurrent, true);
    assert.equal(result.distinctProviderRefCount, 3);
    assert.equal(result.distinctResourceOwnerRefCount, 3);
    assert.equal(result.distinctSellerSourceKeyCount, 3);
    assert.equal(result.distinctRouteObjectCount, 3);
    assert.equal(result.threeSlotStructuralSeparationObserved, true);
    assert.equal(result.hashKeyRouteOrOwnerInequalityProvesIndependentControl,
      false);
    assert.equal(result.externalResourceOwnerTrustEstablished, false);
    assert.equal(result.primaryCapacityReserved, false);
    assert.equal(result.recoveryCapacityReserved, false);
    assert.equal(result.independentWitnessReceiptPresent, false);
    assert.equal(result.atomicCommitmentGateSatisfied, false);
    assert.equal(result.atomicCommit, false);
    assert.equal(result.userOutcomePromiseIssued, false);
    assert.equal(result.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
    assert.equal(result.humanQueueCreated, false);
    assert.equal(result.authority, "NONE");
  });

test("missing slot and nonce splice hold before the deadline and decline without a human queue at it",
  async (t) => {
    const directories = privateDirectories(t);
    const all = invocations(directories);
    const missing = await formInjectedTemporaryNetworkV1(
      formationInput(all.slice(0, 2)));
    assert.equal(missing.allRolesStructurallyPresent, false);
    assert.equal(missing.missingRoles.length, 1);
    assert.equal(missing.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
    assert.equal(missing.atomicCommit, false);

    const spliceDirectories = privateDirectories(t);
    const spliced = await formInjectedTemporaryNetworkV1(formationInput(
      invocations(spliceDirectories, {
        RECOVERY: { httpRequestNonceHash: h("spliced-http-nonce") },
      })));
    assert.equal(spliced.allSellerEndpointsReturnedSignedSources, false);
    assert.equal(spliced.slots.find((item) => item.role === "RECOVERY")
      .endpointStatusCode, 400);
    assert.equal(spliced.atomicCommit, false);

    const deadlineDirectories = privateDirectories(t);
    const declined = await formInjectedTemporaryNetworkV1(formationInput(
      invocations(deadlineDirectories).slice(0, 2),
      fixture.tender.formationDeadline));
    assert.equal(declined.disposition, "DECLINE_NOT_HUMAN_QUEUE");
    assert.equal(declined.humanQueueCreated, false);
    assert.equal(declined.atomicCommit, false);
  });

test("restart replay of already released seller slots is HOLD and never re-emits or commits",
  async (t) => {
    const directories = privateDirectories(t);
    const first = await formInjectedTemporaryNetworkV1(formationInput(
      invocations(directories)));
    assert.equal(first.allSellerEndpointsReturnedSignedSources, true);

    const restarted = await formInjectedTemporaryNetworkV1(formationInput(
      invocations(directories)));
    assert.equal(restarted.allSellerEndpointsReturnedSignedSources, false);
    assert.equal(restarted.slots.every((item) =>
      item.endpointStatusCode === 409), true);
    assert.equal(restarted.slots.every((item) =>
      item.endpointReturnedSignedSources === false), true);
    assert.equal(restarted.disposition, "CONTINUE_AUTOMATED_FORMATION_HOLD");
    assert.equal(restarted.atomicCommit, false);
    assert.equal(restarted.userOutcomePromiseIssued, false);
  });

