import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createSellerOwnedDurableCapacityEmitterAdapterV2,
  prepareSellerOwnedDurableCapacityEmissionV2,
  releaseSellerOwnedDurableCapacityEmissionV2,
} from "../src/outsider-seller-owned-durable-one-use-capacity-emitter-v2.js";
import { createSellerOwnedOneUseCapacityEmitterV1 }
  from "../src/outsider-seller-owned-one-use-capacity-emitter-v1.js";
import { verifyDurableOneUseEndpointEffectLedgerV1 }
  from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const LEDGER_ID = "ledger_abcdef0123456789abcdef0123456789";
const fixture = createTemporaryNetworkV2MultiSlotFixture({
  fixtureLabel: "durable-seller-capacity-emitter",
});
const slot = fixture.slots.find((item) => item.requirementKind === "RESOURCE");
const responseReplay = slot.mailbox.source.oneUseResponseReplay;
const externalReplay = slot.mailbox.ownerStanding.source.externalStandingReplay;
const witnessRoute = fixture.routeDiscovery.byKind.EVIDENCE;

function privateTarget(t) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-seller-capacity-v2-")));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return path.join(parent, "ledger");
}

function sellerEmitter() {
  return createSellerOwnedOneUseCapacityEmitterV1({
    verifierContext: externalReplay.verifierContext,
    expectedVerifierContextHash: externalReplay.expectedVerifierContextHash,
    sellerPrivateKeyPem: slot.mailbox.standingKey.privateKeyPem,
  });
}

function durableAdapter(directory) {
  return createSellerOwnedDurableCapacityEmitterAdapterV2({
    directory,
    ledgerId: LEDGER_ID,
    adapterInstanceRefHash: h("durable-seller-adapter-instance"),
    sellerEmissionPolicyRefHash: h("seller-local-emission-policy"),
  });
}

function emissionInput() {
  return {
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    responses: responseReplay.responses,
    responseOccurrences: responseReplay.occurrences,
    expectedResponseOccurrenceCount: responseReplay.expectedOccurrenceCount,
    expectedResponseLifecycleHeadHash:
      responseReplay.expectedLifecycleHeadHash,
    observedAt: "2026-09-02T15:30:00.000Z",
    sourceEvidence: {
      semanticsEvidenceRefHash: h("durable-seller-semantics-evidence"),
      resourceOwnerRefHash:
        slot.mailbox.owner.envelope.principalEpochProjectionHash,
      standingEvidenceRefHash: h("durable-seller-standing-evidence"),
      semanticsValidFrom: "2026-09-02T00:00:00.000Z",
      semanticsValidUntil: "2026-09-03T00:00:00.000Z",
      semanticsIssuedAt: "2026-09-02T00:00:00.000Z",
      standingValidFrom: "2026-09-02T12:00:00.000Z",
      standingValidUntil: "2026-09-02T17:00:00.000Z",
      standingIssuedAt: "2026-09-02T11:59:00.000Z",
    },
    reservation: {
      sourceReceiptId: "reservation.durable-seller.0001",
      lifecycleStreamId: "reservation-stream.durable-seller.0001",
      reservedFrom: "2026-09-02T15:00:00.000Z",
      reservedUntil: "2026-09-02T16:00:00.000Z",
      receiptIssuedAt: "2026-09-02T12:10:00.000Z",
      eventOccurredAt: "2026-09-02T12:11:00.000Z",
      occurrenceIdentityHash: h("durable-seller-event-0001"),
      lifecycleHeadObservedAt: "2026-09-02T15:29:00.000Z",
    },
    witnessRequest: {
      witnessRouteObjectHash: witnessRoute.object.routeObjectHash,
      witnessCandidateHash: witnessRoute.candidate.candidateHash,
      witnessRequirementRefHash:
        fixture.tender.evidenceRequirements.requirementSetHash,
      witnessControllerSeparationPolicyRefHash:
        h("durable-independent-witness-separation-policy"),
      requestedAt: "2026-09-02T15:29:10.000Z",
      observationDeadline: "2026-09-02T17:30:00.000Z",
    },
  };
}

function prepare(adapter) {
  return prepareSellerOwnedDurableCapacityEmissionV2(adapter, {
    sellerEmitterCapability: sellerEmitter(),
    emissionInput: emissionInput(),
    admittedAt: "2026-09-02T15:30:01.000Z",
    reservedAt: "2026-09-02T15:30:02.000Z",
  });
}

test("source bytes are released only after the durable attempt and files are private",
  (t) => {
    const directory = privateTarget(t);
    const prepared = prepare(durableAdapter(directory));
    assert.equal(prepared.prepared.sourceBytesAvailableThroughThisObject,
      false);
    assert.equal(prepared.publicProjection.sourceBytesReleased, false);

    const released = releaseSellerOwnedDurableCapacityEmissionV2(
      prepared.prepared, { attemptedAt: "2026-09-02T15:30:03.000Z" });
    assert.equal(released.publicProjection
      .durableReleaseAttemptPersistedBeforeBytesReturned, true);
    assert.equal(released.publicProjection.capacityReserved, false);
    assert.equal(Buffer.isBuffer(released.sourceBundle.receiptSourceBytes), true);

    const replay = verifyDurableOneUseEndpointEffectLedgerV1({
      directory, ledgerId: LEDGER_ID,
      expectedLocalHeadHash: released.publicProjection.durableLedgerHeadHash,
    });
    assert.equal(replay.ok, true, replay.error);
    assert.equal(replay.head.entryCount, 3);
    assert.equal(replay.head.transitionCounts.SUBMIT_ATTEMPTED, 1);
    assert.equal(statSync(directory).mode & 0o777, 0o700);
    for (const name of readdirSync(path.join(directory, "entries"))) {
      assert.equal(statSync(path.join(directory, "entries", name)).mode & 0o777,
        0o600);
    }
  });

test("a restart after durable preparation resumes and performs one release", (t) => {
  const directory = privateTarget(t);
  const firstProcess = prepare(durableAdapter(directory));
  assert.equal(firstProcess.publicProjection.intentWasRestartReplay, false);
  assert.equal(firstProcess.publicProjection.reservationWasRestartReplay, false);

  const restarted = prepare(durableAdapter(directory));
  assert.equal(restarted.publicProjection.intentWasRestartReplay, true);
  assert.equal(restarted.publicProjection.reservationWasRestartReplay, true);
  const released = releaseSellerOwnedDurableCapacityEmissionV2(
    restarted.prepared, { attemptedAt: "2026-09-02T15:30:03.000Z" });
  assert.equal(released.publicProjection.sourceBytesReleased, true);
  const replay = verifyDurableOneUseEndpointEffectLedgerV1({
    directory, ledgerId: LEDGER_ID,
    expectedLocalHeadHash: released.publicProjection.durableLedgerHeadHash,
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.head.entryCount, 3);
});

test("a crash after durable attempt causes every restarted release to refuse",
  (t) => {
    const directory = privateTarget(t);
    const first = prepare(durableAdapter(directory));
    /* Model a process dying after release() durably appends but before its
       returned bytes are observed: deliberately discard the return value. */
    releaseSellerOwnedDurableCapacityEmissionV2(first.prepared, {
      attemptedAt: "2026-09-02T15:30:03.000Z",
    });

    const restarted = prepare(durableAdapter(directory));
    assert.throws(() => releaseSellerOwnedDurableCapacityEmissionV2(
      restarted.prepared, { attemptedAt: "2026-09-02T15:30:03.000Z" }),
    /DURABLE_RELEASE_ALREADY_ATTEMPTED_REFUSING_DUPLICATE/u);
    const replay = verifyDurableOneUseEndpointEffectLedgerV1({
      directory, ledgerId: LEDGER_ID, expectedLocalHeadHash: null,
    });
    assert.equal(replay.ok, true);
    assert.equal(replay.head.entryCount, 3);
    assert.equal(replay.head.transitionCounts.SUBMIT_ATTEMPTED, 1);
  });

