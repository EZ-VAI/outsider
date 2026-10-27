import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
} from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createExternalCapacityReservationRequestV1,
  createSellerOwnedCapacityReservationBundleV1,
  createSellerOwnedCapacityReservationSignerV1,
  createSellerOwnedCapacityReservationTerminalDescendantV1,
  verifyExternalCapacityReservationProtocolV1,
} from "../src/outsider-external-capacity-reservation-protocol-v1.js";
import {
  createSellerOwnedDurableCapacityReservationProducerV1,
  releaseSellerOwnedDurableCapacityReservationV1,
} from "../src/outsider-seller-owned-durable-capacity-reservation-producer-v1.js";
import { verifyDurableOneUseEndpointEffectLedgerV1 }
  from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import { verifyOneUseTenderResponseLifecycleV1 }
  from "../src/outsider-one-use-tender-response-lifecycle-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const sha = (bytes) => `sha256:${createHash("sha256")
  .update(bytes).digest("hex")}`;

const fixture = createTemporaryNetworkV2MultiSlotFixture({
  fixtureLabel: "external-capacity-reservation-protocol",
});
const slot = fixture.slots.find((item) => item.requirementKind === "RESOURCE");
const responseReplay = slot.mailbox.source.oneUseResponseReplay;
const providerRefHash = responseReplay.responses[0].providerRefHash;
const resourceOwnerRefHash
  = slot.mailbox.owner.envelope.principalEpochProjectionHash;

function signerFixture() {
  const pair = generateKeyPairSync("ed25519");
  return createSellerOwnedCapacityReservationSignerV1({
    sellerOwnerPrivateKeyPem: pair.privateKey.export({
      type: "pkcs8", format: "pem",
    }),
    sourceSystemRefHash: h("seller-owner-source-system"),
    resourceOwnerRefHash,
    providerRefHash,
    ownerSourceRevisionHash: h("seller-owner-source-revision"),
    rightsPrivacyPolicyRefHash:
      fixture.tender.authorizationBinding.rightsPrivacyPolicyRefHash,
    issuedAt: "2026-09-02T11:59:00.000Z",
    validFrom: "2026-09-02T12:00:00.000Z",
    validUntil: "2026-09-02T17:00:00.000Z",
    maximumLifecycleHeadAgeMs: 86_400_000,
  });
}

function requestSource(owner, overrides = {}) {
  return {
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
    reservationNonceHash: h("external-capacity-reservation-nonce"),
    ...overrides,
  };
}

function emissionInput(request, source, overrides = {}) {
  return {
    request,
    requestSource: source,
    reservationReceiptId: "reservation.external.0001",
    lifecycleStreamId: "reservation-stream.external.0001",
    reservedAt: "2026-09-02T13:31:00.000Z",
    headObservedAt: "2026-09-02T13:32:00.000Z",
    occurrenceNonceHash: h("external-capacity-reserved-occurrence"),
    ...overrides,
  };
}

function verifyInput(request, source, bundle, observedAt) {
  return {
    request,
    requestSource: source,
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
}

test("exact OFFER becomes only a source-declared reservation after the distinct owner-signed protocol",
  () => {
    const owner = signerFixture();
    const source = requestSource(owner);
    const request = createExternalCapacityReservationRequestV1(source);

    const offer = verifyOneUseTenderResponseLifecycleV1({
      tender: fixture.tender,
      expectedTenderHash: fixture.tender.tenderHash,
      responses: responseReplay.responses,
      occurrences: responseReplay.occurrences,
      expectedOccurrenceCount: responseReplay.expectedOccurrenceCount,
      expectedLifecycleHeadHash: responseReplay.expectedLifecycleHeadHash,
      observedAt: source.requestedAt,
    });
    assert.equal(offer.ok, true, offer.error);
    assert.equal(offer.currentResponseState, "OFFERED");
    assert.equal(offer.capacityReserved, false,
      "SIGNED_OFFER must never be treated as CAPACITY_RESERVED");
    assert.equal(request.signedOfferIsCapacityReservation, false);
    assert.equal(request.quantity, responseReplay.responses[0].quantity);
    assert.equal(request.serviceFrom,
      responseReplay.responses[0].serviceFrom);

    const emitted = createSellerOwnedCapacityReservationBundleV1(
      owner.signer, emissionInput(request, source));
    const checked = verifyExternalCapacityReservationProtocolV1(
      verifyInput(request, source, emitted.sourceBundle,
        "2026-09-02T13:33:00.000Z"));
    assert.equal(checked.ok, true, checked.error);
    assert.equal(checked.lifecycleState, "CAPACITY_RESERVED");
    assert.equal(checked.sourceDeclaredCapacityReservationCurrent, true);
    assert.equal(checked.exactProviderSlotQuantityAndTimeWindowVerified, true);
    assert.equal(checked.oneUseReservationNonceBound, true);
    assert.equal(checked.ownerSourceAndReservationKeyContinuityVerified, true);
    assert.equal(checked.resourceOwnerAuthorityEstablished, false);
    assert.equal(checked.externalCapacityEstablished, false);
    assert.equal(checked.capacityReserved, false,
      "a self-signed owner source is evidence, not independent capacity truth");
    assert.equal(checked.authority, "NONE");
  });

test("request/receipt splices across owner, provider, quantity, or nonce fail closed",
  () => {
    const owner = signerFixture();
    const source = requestSource(owner);
    const request = createExternalCapacityReservationRequestV1(source);
    const tamperedRequest = { ...request, quantity: request.quantity + 1 };
    assert.throws(() => createSellerOwnedCapacityReservationBundleV1(
      owner.signer, emissionInput(tamperedRequest, source)),
    /RESERVATION_REQUEST_REBUILD_FAILED/u);

    const otherOwner = signerFixture();
    assert.throws(() => createSellerOwnedCapacityReservationBundleV1(
      otherOwner.signer, emissionInput(request, source)),
    /REQUEST_NOT_BOUND_TO_SELLER_OWNER_SOURCE/u);

    const emitted = createSellerOwnedCapacityReservationBundleV1(
      owner.signer, emissionInput(request, source));
    const tamperedReceipt = Buffer.from(
      emitted.sourceBundle.reservationReceiptSourceBytes);
    tamperedReceipt[tamperedReceipt.length - 8] ^= 1;
    const failed = verifyExternalCapacityReservationProtocolV1({
      ...verifyInput(request, source, emitted.sourceBundle,
        "2026-09-02T13:33:00.000Z"),
      reservationReceiptSourceBytes: tamperedReceipt,
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.capacityReserved, false);
    assert.equal(failed.authority, "NONE");
  });

test("seller-side reservation bytes are released once only after durable nonce consumption",
  () => {
    const directory = realpathSync(mkdtempSync(join(tmpdir(),
      "outsider-capacity-reservation-v1-")));
    const ledgerDirectory = join(directory, "ledger");
    try {
      const owner = signerFixture();
      const source = requestSource(owner);
      const request = createExternalCapacityReservationRequestV1(source);
      const producerInput = {
        signer: owner.signer,
        directory: ledgerDirectory,
        ledgerId: "ledger_0123456789abcdef0123456789abcdef",
        adapterInstanceRefHash: h("durable-reservation-adapter"),
        sellerReservationPolicyRefHash: h("seller-reservation-policy"),
      };
      const firstProducer
        = createSellerOwnedDurableCapacityReservationProducerV1(producerInput);
      const input = emissionInput(request, source);
      const released = releaseSellerOwnedDurableCapacityReservationV1(
        firstProducer, input);
      assert.equal(released.publicProjection
        .durableSubmitAttemptPersistedBeforeBytesReturned, true);
      assert.equal(released.publicProjection.sourceBytesReleased, true);
      assert.equal(released.publicProjection.capacityReserved, false);

      const ledger = verifyDurableOneUseEndpointEffectLedgerV1({
        directory: ledgerDirectory,
        ledgerId: producerInput.ledgerId,
        expectedLocalHeadHash:
          released.publicProjection.durableLedgerHeadHash,
      });
      assert.equal(ledger.ok, true, ledger.error);
      assert.equal(ledger.head.entryCount, 3);
      assert.equal(ledger.head.nonceIndexCount, 1);
      assert.equal(ledger.head.transitionCounts.SUBMIT_ATTEMPTED, 1);

      const restarted
        = createSellerOwnedDurableCapacityReservationProducerV1(producerInput);
      assert.throws(() => releaseSellerOwnedDurableCapacityReservationV1(
        restarted, input),
      /DURABLE_RESERVATION_RELEASE_ALREADY_ATTEMPTED_REFUSING_DUPLICATE/u);
      const after = verifyDurableOneUseEndpointEffectLedgerV1({
        directory: ledgerDirectory,
        ledgerId: producerInput.ledgerId,
        expectedLocalHeadHash: null,
      });
      assert.equal(after.ok, true, after.error);
      assert.equal(after.head.entryCount, 3,
        "restart replay must append no duplicate occurrence");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

test("signed REVOKED and EXPIRED descendants terminate current reservation state",
  () => {
    const owner = signerFixture();
    const source = requestSource(owner);
    const request = createExternalCapacityReservationRequestV1(source);
    const initial = createSellerOwnedCapacityReservationBundleV1(
      owner.signer, emissionInput(request, source));

    const revoked = createSellerOwnedCapacityReservationTerminalDescendantV1(
      owner.signer, {
        request,
        requestSource: source,
        sourceBundle: initial.sourceBundle,
        eventState: "REVOKED",
        occurredAt: "2026-09-02T13:40:00.000Z",
        headObservedAt: "2026-09-02T13:41:00.000Z",
        occurrenceNonceHash: h("capacity-revoked-occurrence"),
      });
    const revokedCheck = verifyExternalCapacityReservationProtocolV1(
      verifyInput(request, source, revoked.sourceBundle,
        "2026-09-02T13:42:00.000Z"));
    assert.equal(revokedCheck.ok, true, revokedCheck.error);
    assert.equal(revokedCheck.lifecycleState, "REVOKED");
    assert.equal(revokedCheck.sourceDeclaredCapacityReservationCurrent, false);

    const expired = createSellerOwnedCapacityReservationTerminalDescendantV1(
      owner.signer, {
        request,
        requestSource: source,
        sourceBundle: initial.sourceBundle,
        eventState: "EXPIRED",
        occurredAt: "2026-09-02T16:00:00.000Z",
        headObservedAt: "2026-09-02T16:00:01.000Z",
        occurrenceNonceHash: h("capacity-expired-occurrence"),
      });
    const expiredCheck = verifyExternalCapacityReservationProtocolV1(
      verifyInput(request, source, expired.sourceBundle,
        "2026-09-02T17:01:00.000Z"));
    assert.equal(expiredCheck.ok, true, expiredCheck.error);
    assert.equal(expiredCheck.lifecycleState, "EXPIRED");
    assert.equal(expiredCheck.sourceDeclaredCapacityReservationCurrent, false);
    assert.equal(expiredCheck.ownerSourceCurrentAtObservedAt, false,
      "terminal history remains replayable after owner-source validity ends");
    assert.equal(expiredCheck.capacityReserved, false);
  });
