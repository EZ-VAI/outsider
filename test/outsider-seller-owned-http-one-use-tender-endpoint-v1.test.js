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
  createSellerOwnedHttpOneUseTenderEndpointV1,
  handleSellerOwnedHttpOneUseTenderRequestV1,
} from "../src/outsider-seller-owned-http-one-use-tender-endpoint-v1.js";
import { createSellerOwnedDurableCapacityEmitterAdapterV2 }
  from "../src/outsider-seller-owned-durable-one-use-capacity-emitter-v2.js";
import { createSellerOwnedOneUseCapacityEmitterV1 }
  from "../src/outsider-seller-owned-one-use-capacity-emitter-v1.js";
import { verifyExternalCapacityReceiptLifecycleV1 }
  from "../src/outsider-one-use-tender-response-lifecycle-v1.js";
import { createTemporaryNetworkV2MultiSlotFixture }
  from "./helpers/outsider-temporary-network-v2-fixture.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const sha = (bytes) => `sha256:${createHash("sha256")
  .update(bytes).digest("hex")}`;
const LEDGER_ID = "ledger_1234567890abcdef1234567890abcdef";
const fixture = createTemporaryNetworkV2MultiSlotFixture({
  fixtureLabel: "seller-http-endpoint",
});
const slot = fixture.slots.find((item) => item.requirementKind === "RESOURCE");
const responseReplay = slot.mailbox.source.oneUseResponseReplay;
const initial = responseReplay.responses[0];
const externalReplay = slot.mailbox.ownerStanding.source.externalStandingReplay;
const witnessRoute = fixture.routeDiscovery.byKind.EVIDENCE;

function privateTarget(t) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-seller-http-v1-")));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return path.join(parent, "ledger");
}

function endpoint(directory) {
  const sellerEmitterCapability = createSellerOwnedOneUseCapacityEmitterV1({
    verifierContext: externalReplay.verifierContext,
    expectedVerifierContextHash: externalReplay.expectedVerifierContextHash,
    sellerPrivateKeyPem: slot.mailbox.standingKey.privateKeyPem,
  });
  const durableEmitterAdapter
    = createSellerOwnedDurableCapacityEmitterAdapterV2({
      directory,
      ledgerId: LEDGER_ID,
      adapterInstanceRefHash: h("seller-http-durable-adapter"),
      sellerEmissionPolicyRefHash: h("seller-http-emission-policy"),
    });
  return createSellerOwnedHttpOneUseTenderEndpointV1({
    sellerEmitterCapability,
    durableEmitterAdapter,
    expectedTenderHash: fixture.tender.tenderHash,
    expectedInitialResponseHash: initial.responseHash,
    expectedProviderRefHash: initial.providerRefHash,
    expectedScopeHash: initial.scopeHash,
    expectedResponseNonceHash: initial.responseNonceHash,
    expectedResponseExpiresAt: initial.expiresAt,
    expectedHttpRequestNonceHash: h("seller-http-request-nonce"),
    validFrom: "2026-09-02T15:00:00.000Z",
    validUntil: "2026-09-02T16:30:00.000Z",
    emissionObservedAt: "2026-09-02T15:30:00.000Z",
    sellerEmissionTerms: {
      sourceEvidence: {
        semanticsEvidenceRefHash: h("seller-http-semantics-evidence"),
        resourceOwnerRefHash:
          slot.mailbox.owner.envelope.principalEpochProjectionHash,
        standingEvidenceRefHash: h("seller-http-standing-evidence"),
        semanticsValidFrom: "2026-09-02T00:00:00.000Z",
        semanticsValidUntil: "2026-09-03T00:00:00.000Z",
        semanticsIssuedAt: "2026-09-02T00:00:00.000Z",
        standingValidFrom: "2026-09-02T12:00:00.000Z",
        standingValidUntil: "2026-09-02T17:00:00.000Z",
        standingIssuedAt: "2026-09-02T11:59:00.000Z",
      },
      reservation: {
        sourceReceiptId: "reservation.seller-http.0001",
        lifecycleStreamId: "reservation-stream.seller-http.0001",
        reservedFrom: "2026-09-02T15:00:00.000Z",
        reservedUntil: "2026-09-02T16:00:00.000Z",
        receiptIssuedAt: "2026-09-02T12:10:00.000Z",
        eventOccurredAt: "2026-09-02T12:11:00.000Z",
        occurrenceIdentityHash: h("seller-http-capacity-event"),
        lifecycleHeadObservedAt: "2026-09-02T15:29:00.000Z",
      },
      witnessRequest: {
        witnessRouteObjectHash: witnessRoute.object.routeObjectHash,
        witnessCandidateHash: witnessRoute.candidate.candidateHash,
        witnessRequirementRefHash:
          fixture.tender.evidenceRequirements.requirementSetHash,
        witnessControllerSeparationPolicyRefHash:
          h("seller-http-witness-separation-policy"),
        requestedAt: "2026-09-02T15:29:10.000Z",
        observationDeadline: "2026-09-02T17:30:00.000Z",
      },
    },
  });
}

function requestBody(overrides = {}) {
  return {
    schema: "outsider/seller-owned-http-one-use-tender-request/v1",
    schemaVersion: "1.0.0",
    requestClass: "EXACT_ONE_USE_TENDER_RESPONSE_REQUEST",
    httpRequestNonceHash: h("seller-http-request-nonce"),
    tender: fixture.tender,
    expectedTenderHash: fixture.tender.tenderHash,
    responses: responseReplay.responses,
    responseOccurrences: responseReplay.occurrences,
    expectedResponseOccurrenceCount: responseReplay.expectedOccurrenceCount,
    expectedResponseLifecycleHeadHash:
      responseReplay.expectedLifecycleHeadHash,
    ...overrides,
  };
}

function request(body = requestBody(), overrides = {}) {
  return {
    method: "POST",
    path: "/outsider/v1/one-use-tender-responses",
    contentType: "application/json",
    bodyBytes: Buffer.from(canonicalizeStrict(body), "utf8"),
    receivedAt: "2026-09-02T15:30:10.000Z",
    ...overrides,
  };
}

test("the fixed HTTP handler durably releases the existing five signed source documents",
  (t) => {
    const result = handleSellerOwnedHttpOneUseTenderRequestV1(
      endpoint(privateTarget(t)), request());
    assert.equal(result.statusCode, 200);
    assert.equal(result.headers["cache-control"], "no-store");
    assert.equal(Number(result.headers["content-length"]),
      result.bodyBytes.length);
    const payload = JSON.parse(result.bodyBytes.toString("utf8"));
    assert.equal(payload.exactSourceDocumentCount, 5);
    assert.equal(payload.capacityReserved, false);
    assert.equal(payload.authority, "NONE");
    assert.equal(payload.sellerSignedSourcesAreIndependentWitness, false);
    assert.equal(payload.independentWitnessReceiptPresent, false);
    assert.equal(JSON.stringify(payload).includes("PRIVATE KEY"), false);

    const source = payload.sourceDocuments;
    const decoded = {
      semantics: Buffer.from(source.semantics, "base64"),
      standing: Buffer.from(source.standing, "base64"),
      receipt: Buffer.from(source.receipt, "base64"),
      events: source.lifecycleEvents.map((value) => Buffer.from(value, "base64")),
      head: Buffer.from(source.lifecycleHead, "base64"),
    };
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
      semanticsSourceBytes: decoded.semantics,
      expectedSemanticsSourceHash: sha(decoded.semantics),
      standingSourceBytes: decoded.standing,
      expectedStandingSourceHash: sha(decoded.standing),
      receiptSourceBytes: decoded.receipt,
      expectedReceiptSourceHash: sha(decoded.receipt),
      lifecycleEventSourceBytes: decoded.events,
      lifecycleHeadSourceBytes: decoded.head,
      expectedLifecycleHeadSourceHash: sha(decoded.head),
      observedAt: "2026-09-02T15:30:00.000Z",
    });
    assert.equal(replay.ok, true, replay.error);
    assert.equal(replay.sourceDeclaredReservationCurrent, true);
    assert.equal(replay.capacityReserved, false);
  });

test("method, canonical bytes, transport nonce, and exact response binding fail closed",
  (t) => {
    const target = endpoint(privateTarget(t));
    assert.equal(handleSellerOwnedHttpOneUseTenderRequestV1(target,
      request(requestBody(), { method: "GET" })).statusCode, 405);
    const noncanonical = request();
    noncanonical.bodyBytes = Buffer.concat([noncanonical.bodyBytes,
      Buffer.from(" ")]);
    assert.equal(handleSellerOwnedHttpOneUseTenderRequestV1(target,
      noncanonical).statusCode, 400);
    assert.equal(handleSellerOwnedHttpOneUseTenderRequestV1(target,
      request(requestBody({ httpRequestNonceHash: h("wrong-http-nonce") })))
      .statusCode, 400);
    const changed = JSON.parse(JSON.stringify(initial));
    changed.scopeHash = h("spliced-scope");
    assert.equal(handleSellerOwnedHttpOneUseTenderRequestV1(target,
      request(requestBody({ responses: [changed] }))).statusCode, 400);
  });

test("the same request is refused after a fresh endpoint process replays the durable attempt",
  (t) => {
    const directory = privateTarget(t);
    const first = handleSellerOwnedHttpOneUseTenderRequestV1(
      endpoint(directory), request());
    assert.equal(first.statusCode, 200);

    const restarted = handleSellerOwnedHttpOneUseTenderRequestV1(
      endpoint(directory), request());
    assert.equal(restarted.statusCode, 409);
    const payload = JSON.parse(restarted.bodyBytes.toString("utf8"));
    assert.equal(payload.errorCode, "ONE_USE_ALREADY_CONSUMED");
    assert.equal(payload.sourceDocumentsReturned, 0);
    assert.equal(payload.retryPermitted, false);
  });

