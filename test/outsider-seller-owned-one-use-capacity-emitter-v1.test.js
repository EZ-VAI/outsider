import assert from "node:assert/strict";
import { createHash, generateKeyPairSync } from "node:crypto";
import test from "node:test";

import {
  createSellerOwnedOneUseCapacityEmitterV1,
  emitSellerOwnedOneUseCapacityReservationV1,
} from "../src/outsider-seller-owned-one-use-capacity-emitter-v1.js";
import { verifyExternalCapacityReceiptLifecycleV1 }
  from "../src/outsider-one-use-tender-response-lifecycle-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const sha = (bytes) => `sha256:${createHash("sha256")
  .update(bytes).digest("hex")}`;

const fixture = createTemporaryNetworkV2MultiSlotFixture({
  fixtureLabel: "seller-capacity-emitter",
});
const slot = fixture.slots.find((item) => item.requirementKind === "RESOURCE");
const responseReplay = slot.mailbox.source.oneUseResponseReplay;
const externalReplay = slot.mailbox.ownerStanding.source.externalStandingReplay;
const witnessRoute = fixture.routeDiscovery.byKind.EVIDENCE;

function emitter(privateKeyPem = slot.mailbox.standingKey.privateKeyPem) {
  return createSellerOwnedOneUseCapacityEmitterV1({
    verifierContext: externalReplay.verifierContext,
    expectedVerifierContextHash: externalReplay.expectedVerifierContextHash,
    sellerPrivateKeyPem: privateKeyPem,
  });
}

function emissionInput(overrides = {}) {
  const base = {
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    responses: responseReplay.responses,
    responseOccurrences: responseReplay.occurrences,
    expectedResponseOccurrenceCount: responseReplay.expectedOccurrenceCount,
    expectedResponseLifecycleHeadHash:
      responseReplay.expectedLifecycleHeadHash,
    observedAt: "2026-09-02T15:30:00.000Z",
    sourceEvidence: {
      semanticsEvidenceRefHash: h("seller-semantics-evidence"),
      resourceOwnerRefHash:
        slot.mailbox.owner.envelope.principalEpochProjectionHash,
      standingEvidenceRefHash: h("seller-standing-evidence"),
      semanticsValidFrom: "2026-09-02T00:00:00.000Z",
      semanticsValidUntil: "2026-09-03T00:00:00.000Z",
      semanticsIssuedAt: "2026-09-02T00:00:00.000Z",
      standingValidFrom: "2026-09-02T12:00:00.000Z",
      standingValidUntil: "2026-09-02T17:00:00.000Z",
      standingIssuedAt: "2026-09-02T11:59:00.000Z",
    },
    reservation: {
      sourceReceiptId: "reservation.seller.0001",
      lifecycleStreamId: "reservation-stream.seller.0001",
      reservedFrom: "2026-09-02T15:00:00.000Z",
      reservedUntil: "2026-09-02T16:00:00.000Z",
      receiptIssuedAt: "2026-09-02T12:10:00.000Z",
      eventOccurredAt: "2026-09-02T12:11:00.000Z",
      occurrenceIdentityHash: h("seller-capacity-event-0001"),
      lifecycleHeadObservedAt: "2026-09-02T15:29:00.000Z",
    },
    witnessRequest: {
      witnessRouteObjectHash: witnessRoute.object.routeObjectHash,
      witnessCandidateHash: witnessRoute.candidate.candidateHash,
      witnessRequirementRefHash:
        fixture.tender.evidenceRequirements.requirementSetHash,
      witnessControllerSeparationPolicyRefHash:
        h("independent-witness-controller-separation-policy"),
      requestedAt: "2026-09-02T15:29:10.000Z",
      observationDeadline: "2026-09-02T17:30:00.000Z",
    },
  };
  return { ...base, ...overrides };
}

test("seller emits the existing five-source bundle plus an unanswered independent witness challenge",
  () => {
    const result = emitSellerOwnedOneUseCapacityReservationV1(
      emitter(), emissionInput());
    const projection = result.publicProjection;
    const sources = result.sourceBundle;

    assert.equal(projection.sourceBundleCryptographicallyConsistent, true);
    assert.equal(projection.sourceDeclaredReservationCurrent, true);
    assert.equal(projection.capacityReserved, false);
    assert.equal(projection.authority, "NONE");
    assert.equal(projection.witnessChallenge.sellerMayNotAnswerOwnChallenge,
      true);
    assert.equal(projection.witnessChallenge.independentWitnessReceiptPresent,
      false);
    assert.equal(projection.sourceBundleManifest.exactSourceDocumentCount, 5);
    assert.equal(projection.sourceBundleManifest.sourceHashes
      .semanticsSourceHash, sha(sources.semanticsSourceBytes));
    assert.equal(projection.sourceBundleManifest.sourceHashes
      .lifecycleHeadSourceHash, sha(sources.lifecycleHeadSourceBytes));
    assert.equal(JSON.stringify(projection).includes("PRIVATE KEY"), false);

    const replay = verifyExternalCapacityReceiptLifecycleV1({
      tender: fixture.tender,
      expectedTenderHash: fixture.tender.tenderHash,
      responses: responseReplay.responses,
      responseOccurrences: responseReplay.occurrences,
      expectedResponseOccurrenceCount: responseReplay.expectedOccurrenceCount,
      expectedResponseLifecycleHeadHash:
        responseReplay.expectedLifecycleHeadHash,
      verifierContext: externalReplay.verifierContext,
      expectedVerifierContextHash: externalReplay.expectedVerifierContextHash,
      semanticsSourceBytes: sources.semanticsSourceBytes,
      expectedSemanticsSourceHash: sha(sources.semanticsSourceBytes),
      standingSourceBytes: sources.standingSourceBytes,
      expectedStandingSourceHash: sha(sources.standingSourceBytes),
      receiptSourceBytes: sources.receiptSourceBytes,
      expectedReceiptSourceHash: sha(sources.receiptSourceBytes),
      lifecycleEventSourceBytes: sources.lifecycleEventSourceBytes,
      lifecycleHeadSourceBytes: sources.lifecycleHeadSourceBytes,
      expectedLifecycleHeadSourceHash: sha(sources.lifecycleHeadSourceBytes),
      observedAt: "2026-09-02T15:30:00.000Z",
    });
    assert.equal(replay.ok, true, replay.error);
    assert.equal(replay.sourceDeclaredReservationCurrent, true);
    assert.equal(replay.capacityReserved, false);
  });

test("the seller process will not emit the same one-use response twice", () => {
  const capability = emitter();
  emitSellerOwnedOneUseCapacityReservationV1(capability, emissionInput());
  assert.throws(() => emitSellerOwnedOneUseCapacityReservationV1(
    capability, emissionInput()),
  /RESPONSE_ALREADY_EMITTED_IN_THIS_PROCESS/u);
});

test("a mismatched seller key or provider route reused as witness is rejected",
  () => {
    const otherKey = generateKeyPairSync("ed25519").privateKey.export({
      type: "pkcs8", format: "pem",
    });
    assert.throws(() => emitter(otherKey),
      /SELLER_PRIVATE_KEY_CONTEXT_MISMATCH/u);

    const providerResponse = responseReplay.responses[0];
    assert.throws(() => emitSellerOwnedOneUseCapacityReservationV1(
      emitter(), emissionInput({
        witnessRequest: {
          ...emissionInput().witnessRequest,
          witnessRouteObjectHash: providerResponse.discoveryRouteObjectHash,
          witnessCandidateHash: providerResponse.discoveryCandidateHash,
        },
      })), /WITNESS_ROUTE_MUST_DIFFER_FROM_PROVIDER_ROUTE/u);
  });

