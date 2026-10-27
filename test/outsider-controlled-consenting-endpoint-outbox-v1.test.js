import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_SCHEMAS,
  OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1,
  controlledEndpointConsentGrantSigningMessageV1,
  createControlledEndpointConsentGrantSourceReplayV1,
} from "../src/outsider-controlled-endpoint-consent-grant-v1.js";
import {
  OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_BOUNDARY,
  admitControlledEndpointTenderV1,
  controlledEndpointDeliveryReceiptSigningMessageV1,
  controlledLoopbackEndpointLaneBindingSigningMessageV1,
  createControlledConsentingEndpointOutboxV1,
  dispatchControlledEndpointTenderV1,
  reconcileControlledEndpointTenderV1,
  revokeControlledEndpointTenderV1,
} from "../src/outsider-controlled-consenting-endpoint-outbox-v1.js";
import {
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const h = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const bytesHash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const isoAfter = (milliseconds) => new Date(Date.now() + milliseconds)
  .toISOString();

function keyId(publicKey) {
  return bytesHash(publicKey.export({ type: "spki", format: "der" }));
}

function privateDirectory(t, label) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    `outsider-outbox-${label}-`)));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return path.join(parent, "ledger");
}

function consentFixture(label, keys, body, options = {}) {
  const payload = {
    schema: OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_SCHEMAS.grant,
    schemaVersion: "1.0.0",
    grantIdHash: h(`${label}:grant`),
    laneProfileHash:
      OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1.laneProfileHash,
    controllerKeyIdHash: keyId(keys.publicKey),
    tenderHash: h(`${label}:tender`),
    typedGraphHash: h(`${label}:graph`),
    episodeHash: h(`${label}:episode`),
    attemptHash: h(`${label}:attempt`),
    requirementKind: "RESOURCE",
    requirementId: `${label}_resource`,
    requirementObjectHash: h(`${label}:requirement`),
    resourceOwnerRefHash: h(`${label}:owner`),
    providerRefHash: h(`${label}:provider`),
    requestBodyHash: bytesHash(body),
    oneUseNonceHash: h(`${label}:nonce`),
    idempotencyKeyHash: h(`${label}:idempotency`),
    allowedOperations: ["ONE_USE_TENDER_SUBMIT", "DELIVERY_STATUS_READ"],
    consentPurpose: "RECEIVE_EXACT_TENDER_ONLY",
    maxAcceptedTenderObjects: 1,
    validFrom: isoAfter(-60_000),
    expiresAt: isoAfter(options.expiresAfterMs ?? 3_600_000),
    formationDeadline: isoAfter(7_200_000),
    termsRevisionHash: h(`${label}:terms`),
    issuedAt: isoAfter(-120_000),
  };
  const signature = sign(null,
    controlledEndpointConsentGrantSigningMessageV1(payload), keys.privateKey)
    .toString("base64");
  const grantSourceBytes = Buffer.from(canonicalizeStrict({ payload, signature }));
  const source = {
    controllerPublicKeyPem: keys.publicKey.export({
      type: "spki", format: "pem",
    }).toString(),
    expectedControllerKeyIdHash: payload.controllerKeyIdHash,
    grantSourceBytes,
    expectedGrantSourceHash: bytesHash(grantSourceBytes),
    observedAt: new Date().toISOString(),
    privateProjectionNonce: createHash("sha256")
      .update(`${label}:consent-private`).digest("hex"),
  };
  const replay = createControlledEndpointConsentGrantSourceReplayV1(source);
  assert.equal(replay.ok, true);
  return { payload, source, expectedConsentReplayHash: replay.replayHash };
}

async function controlledEndpoint(t, keys) {
  const records = new Map();
  let postCount = 0;
  let statusCount = 0;
  const server = createServer((request, response) => {
    if (request.method === "POST"
      && request.url === "/outsider/v1/tender-intents") {
      postCount += 1;
      const chunks = [];
      request.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      request.on("end", () => {
        const body = Buffer.concat(chunks);
        const effectIdHash = request.headers["x-outsider-effect-id"];
        const idempotencyKeyHash
          = request.headers["x-outsider-idempotency-key"];
        const bodyHash = request.headers["x-outsider-body-hash"];
        assert.equal(bytesHash(body), bodyHash);
        const payload = {
          schema: "outsider/controlled-endpoint-delivery-receipt/v1",
          schemaVersion: "1.0.0",
          effectIdHash,
          bodyHash,
          idempotencyKeyHash,
          state: "RECEIVED_FOR_COUNTERPARTY_REVIEW",
          receivedAt: new Date().toISOString(),
          providerAcceptance: false,
          capacityReserved: false,
          standingCreated: false,
        };
        const signature = sign(null,
          controlledEndpointDeliveryReceiptSigningMessageV1(payload),
          keys.privateKey).toString("base64");
        records.set(idempotencyKeyHash,
          Buffer.from(canonicalizeStrict({ payload, signature })));
        // Simulate: the endpoint committed the idempotency object, then the
        // connection died before Outsider could persist the response.
        request.socket.destroy();
      });
      return;
    }
    if (request.method === "GET"
      && request.url === "/outsider/v1/tender-intents/status") {
      statusCount += 1;
      const key = request.headers["x-outsider-idempotency-key"];
      const receipt = records.get(key);
      if (!receipt) {
        response.writeHead(404).end();
        return;
      }
      response.writeHead(200, {
        "content-type": "application/json",
        "content-length": receipt.length,
      });
      response.end(receipt);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return {
    port: server.address().port,
    counts: () => ({ postCount, statusCount, acceptedObjectCount: records.size }),
  };
}

function operationInput(consent, body) {
  return {
    consentSource: consent.source,
    expectedConsentReplayHash: consent.expectedConsentReplayHash,
    privateTenderEnvelopeBytes: body,
  };
}

function outboxConfig(endpoint, directory, label, keys, providerRefHash) {
  const controllerPublicKeyPem = keys.publicKey.export({
    type: "spki", format: "pem",
  }).toString();
  const payload = {
    schema: "outsider/controlled-loopback-endpoint-lane-binding/v1",
    schemaVersion: "1.0.0",
    laneProfileHash:
      OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1.laneProfileHash,
    controllerKeyIdHash: keyId(keys.publicKey),
    loopbackPort: endpoint.port,
    adapterInstanceRefHash: h(`${label}:adapter-instance`),
    endpointProviderRefHash: providerRefHash,
    issuedAt: isoAfter(-120_000),
    validFrom: isoAfter(-60_000),
    expiresAt: isoAfter(7_200_000),
  };
  const signature = sign(null,
    controlledLoopbackEndpointLaneBindingSigningMessageV1(payload),
    keys.privateKey).toString("base64");
  const laneBindingSourceBytes = Buffer.from(canonicalizeStrict({
    payload, signature,
  }));
  return {
    ledgerDirectory: directory,
    ledgerId: `ledger_${createHash("sha256").update(label).digest("hex")
      .slice(0, 32)}`,
    laneBindingSourceBytes,
    expectedLaneBindingSourceHash: bytesHash(laneBindingSourceBytes),
    controllerPublicKeyPem,
    privateProjectionNonce: createHash("sha256")
      .update(`${label}:outbox-private`).digest("hex"),
  };
}

function assertExternalClaimsRemainFalse(result) {
  assert.equal(result.decisionState, "HOLD");
  assert.equal(result.authority, "NONE");
  assert.equal(result.actionReady, false);
  assert.equal(result.realProviderContactEstablished, false);
  assert.equal(result.providerAcceptance, false);
  assert.equal(result.externalCapacityEstablished, false);
  assert.equal(result.capacityReserved, false);
  assert.equal(result.standingCreated, false);
  assert.equal(result.userOutcomePromiseIssued, false);
  assert.equal(result.priceEstablished, false);
  assert.equal(result.guaranteeEstablished, false);
  assert.equal(result.settlementPermitted, false);
  assert.equal(result.moneyMovementPermitted, false);
  assert.equal(result.providerRegistryPresent, false);
  assert.equal(result.humanQueueCreated, false);
}

test("endpoint commit survives dropped response; restart reconciles without a second POST",
  async (t) => {
    const keys = generateKeyPairSync("ed25519");
    const endpoint = await controlledEndpoint(t, keys);
    const body = Buffer.from(canonicalizeStrict({
      schema: "outsider/controlled-endpoint-tender-request/v1",
      outcome: "bounded-test-outcome",
    }));
    const consent = consentFixture("crash", keys, body, {
      expiresAfterMs: 2_000,
    });
    const directory = privateDirectory(t, "crash");
    const config = outboxConfig(endpoint, directory, "crash", keys,
      consent.payload.providerRefHash);

    const firstProcess = createControlledConsentingEndpointOutboxV1(config);
    const admitted = admitControlledEndpointTenderV1(firstProcess,
      operationInput(consent, body));
    assert.equal(admitted.stage, "DURABLY_ADMITTED_HOLD");
    assert.deepEqual(admitted.enabledCapabilities,
      ["CONTROLLED_LOOPBACK_TENDER_SUBMIT",
        "CONTROLLED_LOOPBACK_DELIVERY_STATUS_READ"]);

    const uncertain = await dispatchControlledEndpointTenderV1(firstProcess,
      operationInput(consent, body));
    assert.equal(uncertain.stage, "SUBMIT_ATTEMPTED_COMMIT_UNKNOWN_HOLD");
    assert.equal(uncertain.submitAttemptOccurrenceCount, 1);
    assert.equal(uncertain.controlledTestEndpointPostPerformedByThisCall, true);
    assert.deepEqual(endpoint.counts(), {
      postCount: 1, statusCount: 0, acceptedObjectCount: 1,
    });

    // A new module capability represents a restarted process. Calling dispatch
    // again must observe durable SUBMIT_ATTEMPTED and perform zero second POST.
    const restarted = createControlledConsentingEndpointOutboxV1(config);
    const noRetry = await dispatchControlledEndpointTenderV1(restarted,
      operationInput(consent, body));
    assert.equal(noRetry.stage, "SUBMIT_ATTEMPTED_COMMIT_UNKNOWN_HOLD");
    assert.equal(noRetry.controlledTestEndpointPostPerformedByThisCall, false);
    assert.equal(endpoint.counts().postCount, 1);

    // Delivery-status authority survives the submit window so an uncertain
    // submit can still be reconciled after the receive-consent expiry.
    const untilExpired = Math.max(0,
      Date.parse(consent.payload.expiresAt) - Date.now() + 25);
    await new Promise((resolve) => setTimeout(resolve, untilExpired));
    const reconciled = await reconcileControlledEndpointTenderV1(restarted,
      operationInput(consent, body));
    assert.equal(reconciled.stage, "ENDPOINT_RECEIPT_OBSERVED_HOLD");
    assert.equal(reconciled.endpointReceiptMeaning,
      "RECEIVED_FOR_COUNTERPARTY_REVIEW_ONLY");
    assert.equal(reconciled.endpointReceiptOccurrenceCount, 1);
    assert.equal(reconciled.controlledTestEndpointStatusReadPerformedByThisCall,
      true);
    assert.deepEqual(reconciled.enabledCapabilities, []);
    assert.deepEqual(reconciled.provenAuthorityCapabilities, []);
    assert.deepEqual(endpoint.counts(), {
      postCount: 1, statusCount: 1, acceptedObjectCount: 1,
    });
    assertExternalClaimsRemainFalse(reconciled);

    const durable = verifyDurableOneUseEndpointEffectLedgerV1({
      directory,
      ledgerId: config.ledgerId,
      expectedLocalHeadHash: null,
    });
    assert.equal(durable.ok, true);
    assert.equal(durable.head.exactOccurrenceCount, 4);
    assert.equal(durable.head.transitionCounts.SUBMIT_ATTEMPTED, 1);
    assert.equal(durable.head.transitionCounts.ENDPOINT_RECEIPT_OBSERVED, 1);

    const serialized = JSON.stringify(reconciled);
    for (const privateValue of [
      consent.payload.requestBodyHash,
      consent.payload.oneUseNonceHash,
      consent.payload.idempotencyKeyHash,
      consent.payload.providerRefHash,
      consent.expectedConsentReplayHash,
      String(endpoint.port),
    ]) assert.equal(serialized.includes(privateValue), false);
  });

test("revocation before reservation is durable and makes zero network calls",
  async (t) => {
    const keys = generateKeyPairSync("ed25519");
    const endpoint = await controlledEndpoint(t, keys);
    const body = Buffer.from(canonicalizeStrict({
      schema: "outsider/controlled-endpoint-tender-request/v1",
      outcome: "revoked-test-outcome",
    }));
    const consent = consentFixture("revoke", keys, body);
    const directory = privateDirectory(t, "revoke");
    const config = outboxConfig(endpoint, directory, "revoke", keys,
      consent.payload.providerRefHash);
    const capability = createControlledConsentingEndpointOutboxV1(config);
    admitControlledEndpointTenderV1(capability,
      operationInput(consent, body));
    const revoked = revokeControlledEndpointTenderV1(capability, {
      ...operationInput(consent, body),
      terminalEvidenceHash: h("revoke:terminal-evidence"),
    });
    assert.equal(revoked.stage, "REVOKED_BEFORE_SUBMIT_HOLD");
    await assert.rejects(dispatchControlledEndpointTenderV1(capability,
      operationInput(consent, body)),
    /SUBMIT_STATE_INVALID/u);
    assert.deepEqual(endpoint.counts(), {
      postCount: 0, statusCount: 0, acceptedObjectCount: 0,
    });
    assertExternalClaimsRemainFalse(revoked);
  });

test("the signed construction lane fixes endpoint, adapter, provider, and runtime time",
  (t) => {
    const keys = generateKeyPairSync("ed25519");
    const body = Buffer.from(canonicalizeStrict({
      schema: "outsider/controlled-endpoint-tender-request/v1",
      outcome: "binding-test-outcome",
    }));
    const consent = consentFixture("binding", keys, body);
    const endpoint = { port: 41_234 };

    const wrongProvider = outboxConfig(endpoint,
      privateDirectory(t, "wrong-provider"), "wrong-provider", keys,
      h("another-endpoint-provider"));
    const wrongProviderCapability
      = createControlledConsentingEndpointOutboxV1(wrongProvider);
    assert.throws(() => admitControlledEndpointTenderV1(
      wrongProviderCapability, operationInput(consent, body)),
    /CONSENT_ENDPOINT_BINDING_MISMATCH/u);

    const tamperedPort = outboxConfig(endpoint,
      privateDirectory(t, "tampered-port"), "tampered-port", keys,
      consent.payload.providerRefHash);
    const parsed = JSON.parse(tamperedPort.laneBindingSourceBytes.toString());
    parsed.payload.loopbackPort += 1;
    tamperedPort.laneBindingSourceBytes
      = Buffer.from(canonicalizeStrict(parsed));
    tamperedPort.expectedLaneBindingSourceHash
      = bytesHash(tamperedPort.laneBindingSourceBytes);
    assert.throws(() => createControlledConsentingEndpointOutboxV1(
      tamperedPort), /LANE_BINDING_SIGNATURE_INVALID/u);

    const correct = outboxConfig(endpoint,
      privateDirectory(t, "runtime-time"), "runtime-time", keys,
      consent.payload.providerRefHash);
    const capability = createControlledConsentingEndpointOutboxV1(correct);
    assert.throws(() => admitControlledEndpointTenderV1(capability, {
      ...operationInput(consent, body),
      recordedAt: "2000-01-01T00:00:00.000Z",
    }), /OPERATION_INPUT_SHAPE/u);
  });

test("public boundary is one fixed test lane, never a supplier network", () => {
  assert.equal(OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_BOUNDARY
    .laneClass, "CONTROLLED_LOOPBACK_TEST_OR_RESEARCH_ONLY");
  assert.equal(OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_BOUNDARY
    .perOrderTargetAccepted, false);
  assert.equal(OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_BOUNDARY
    .providerRegistryPresent, false);
  assert.equal(OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_BOUNDARY
    .automaticPostRetryAfterSubmitAttempted, false);
  assert.equal(OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_BOUNDARY
    .constructionTimeSignedEndpointBindingRequired, true);
  assert.equal(OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_BOUNDARY
    .runtimeClockGateBeforeSubmitRequired, true);
  assert.equal(OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_BOUNDARY
    .endpointReceiptEstablishesProviderAcceptance, false);
});
