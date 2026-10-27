import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
} from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_BOUNDARY,
  OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_SCHEMAS,
  OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1,
  controlledEndpointConsentGrantSigningMessageV1,
  createControlledEndpointConsentGrantSourceReplayV1,
  verifyControlledEndpointConsentGrantSourceReplayV1,
} from "../src/outsider-controlled-endpoint-consent-grant-v1.js";

const h = (label) => `sha256:${createHash("sha256").update(label)
  .digest("hex")}`;

function keyId(publicKey) {
  return `sha256:${createHash("sha256").update(publicKey.export({
    type: "spki", format: "der",
  })).digest("hex")}`;
}

function fixture(label = "consent", options = {}) {
  const keys = options.keys ?? generateKeyPairSync("ed25519");
  const controllerKeyIdHash = keyId(keys.publicKey);
  const payload = {
    schema: OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_SCHEMAS.grant,
    schemaVersion: "1.0.0",
    grantIdHash: h(`${label}:grant`),
    laneProfileHash:
      OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1.laneProfileHash,
    controllerKeyIdHash,
    tenderHash: h(`${label}:tender`),
    typedGraphHash: h(`${label}:graph`),
    episodeHash: h(`${label}:episode`),
    attemptHash: h(`${label}:attempt`),
    requirementKind: options.requirementKind ?? "RESOURCE",
    requirementId: `${label}_requirement`,
    requirementObjectHash: h(`${label}:requirement`),
    resourceOwnerRefHash: h(`${label}:owner`),
    providerRefHash: h(`${label}:provider`),
    requestBodyHash: h(`${label}:body`),
    oneUseNonceHash: h(`${label}:nonce`),
    idempotencyKeyHash: h(`${label}:idempotency`),
    allowedOperations: ["ONE_USE_TENDER_SUBMIT", "DELIVERY_STATUS_READ"],
    consentPurpose: "RECEIVE_EXACT_TENDER_ONLY",
    maxAcceptedTenderObjects: 1,
    validFrom: "2026-09-03T12:00:00.000Z",
    expiresAt: "2026-09-03T13:00:00.000Z",
    formationDeadline: "2026-09-03T14:00:00.000Z",
    termsRevisionHash: h(`${label}:terms`),
    issuedAt: "2026-09-03T11:59:00.000Z",
  };
  const signature = sign(null,
    controlledEndpointConsentGrantSigningMessageV1(payload), keys.privateKey)
    .toString("base64");
  const grantSourceBytes = Buffer.from(canonicalizeStrict({
    payload, signature,
  }), "utf8");
  const source = {
    controllerPublicKeyPem: keys.publicKey.export({
      type: "spki", format: "pem",
    }).toString(),
    expectedControllerKeyIdHash: controllerKeyIdHash,
    grantSourceBytes,
    expectedGrantSourceHash:
      `sha256:${createHash("sha256").update(grantSourceBytes).digest("hex")}`,
    observedAt: options.observedAt ?? "2026-09-03T12:30:00.000Z",
    privateProjectionNonce: createHash("sha256")
      .update(`${label}:private`).digest("hex"),
  };
  return { keys, payload, source };
}

function clone(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(clone);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(
      ([key, item]) => [key, clone(item)]));
  }
  return value;
}

function assertNoAuthority(value) {
  assert.equal(value.decisionState, "HOLD");
  assert.equal(value.authority, "NONE");
  assert.equal(value.actionReady, false);
  assert.equal(value.executable, false);
  assert.equal(value.liveIoPerformed, false);
  assert.equal(value.endpointContactPerformed, false);
  assert.equal(value.tenderSubmitted, false);
  assert.equal(value.resourceOwnerLegalIdentityEstablished, false);
  assert.equal(value.resourceOwnerAuthorityEstablished, false);
  assert.equal(value.providerAcceptance, false);
  assert.equal(value.externalCapacityEstablished, false);
  assert.equal(value.capacityReserved, false);
  assert.equal(value.standingCreated, false);
  assert.equal(value.priceEstablished, false);
  assert.equal(value.userOutcomePromiseIssued, false);
  assert.equal(value.guaranteeEstablished, false);
  assert.equal(value.settlementPermitted, false);
  assert.deepEqual(value.enabledCapabilities, []);
  assert.deepEqual(value.provenAuthorityCapabilities, []);
  assert.equal(value.enabledCapabilitiesSubsetOfProvenAuthority, true);
  assert.equal(value.consequenceReach, "NONE");
}

test("one exact signed tender-slot consent replays under the frozen lane",
  () => {
    const f = fixture("valid");
    const value = createControlledEndpointConsentGrantSourceReplayV1(f.source);
    assert.equal(value.ok, true);
    assert.equal(value.ed25519SignatureVerified, true);
    assert.equal(value.callerPinnedLaneTrustRootMatched, true);
    assert.equal(value.callerPinnedTrustRootScope, "LANE_CONTROLLER_ONLY");
    assert.equal(value.trustRootIndependentlyEstablished, false);
    assert.equal(value.sourceDeclaredLaneConsentCurrentAtObservedAt, true);
    assert.equal(value.callerPinnedLaneScopedReceiveConsentCurrent, true);
    assert.equal(value.maxAcceptedTenderObjects, 1);
    assert.deepEqual(value.allowedOperations,
      ["ONE_USE_TENDER_SUBMIT", "DELIVERY_STATUS_READ"]);
    assert.equal(value.tenderSlotBinding.tenderHash, f.payload.tenderHash);
    assert.equal(value.tenderSlotBinding.requirementObjectHash,
      f.payload.requirementObjectHash);
    assert.equal(value.sourceOccurrenceCount, 1);
    assert.equal(value.distinctSourceObjectCount, 1);
    const verified = verifyControlledEndpointConsentGrantSourceReplayV1(
      f.source, value.replayHash);
    assert.deepEqual(verified, value);
    assertNoAuthority(value);
  });

test("expiration is exact and never resurrects action authority", () => {
  const atExpiry = fixture("expiry", {
    observedAt: "2026-09-03T13:00:00.000Z",
  });
  const value = createControlledEndpointConsentGrantSourceReplayV1(
    atExpiry.source);
  assert.equal(value.ok, true);
  assert.equal(value.sourceDeclaredLaneConsentCurrentAtObservedAt, false);
  assert.equal(value.callerPinnedLaneScopedReceiveConsentCurrent, false);
  assertNoAuthority(value);
});

test("signature, exact bytes, key pin, and replay pin fail closed", () => {
  const signed = fixture("tamper");
  const parsed = JSON.parse(signed.source.grantSourceBytes.toString("utf8"));
  parsed.payload.providerRefHash = h("different-provider");
  signed.source.grantSourceBytes = Buffer.from(canonicalizeStrict(parsed));
  signed.source.expectedGrantSourceHash = `sha256:${createHash("sha256")
    .update(signed.source.grantSourceBytes).digest("hex")}`;
  const tampered = createControlledEndpointConsentGrantSourceReplayV1;
  assert.throws(() => tampered(signed.source),
    /GRANT_SIGNATURE_VERIFICATION_FAILED/u);

  const wrongKey = fixture("wrong-key");
  wrongKey.source.expectedControllerKeyIdHash = h("wrong-key-id");
  assert.throws(() => createControlledEndpointConsentGrantSourceReplayV1(
    wrongKey.source), /CONTROLLER_KEY_ID_PIN_MISMATCH/u);

  const noncanonical = fixture("noncanonical");
  noncanonical.source.grantSourceBytes = Buffer.concat([
    noncanonical.source.grantSourceBytes, Buffer.from("\n", "utf8"),
  ]);
  noncanonical.source.expectedGrantSourceHash = `sha256:${createHash("sha256")
    .update(noncanonical.source.grantSourceBytes).digest("hex")}`;
  assert.throws(() => createControlledEndpointConsentGrantSourceReplayV1(
    noncanonical.source), /GRANT_SOURCE_NOT_EXACT_CANONICAL_BYTES/u);

  const pin = fixture("replay-pin");
  const failed = verifyControlledEndpointConsentGrantSourceReplayV1(pin.source,
    h("wrong-replay"));
  assert.equal(failed.ok, false);
  assert.match(failed.error, /EXPECTED_REPLAY_HASH_MISMATCH/u);
  assertNoAuthority(failed);
});

test("slot semantics and per-order surface additions are rejected", () => {
  const extraSource = fixture("extra-source");
  extraSource.source.endpointUrl = "https://example.invalid";
  assert.throws(() => createControlledEndpointConsentGrantSourceReplayV1(
    extraSource.source), /SOURCE_FIELDS_INVALID/u);

  const extraGrant = fixture("extra-grant");
  const parsed = JSON.parse(extraGrant.source.grantSourceBytes.toString("utf8"));
  parsed.payload.transportMethod = "POST";
  const signature = sign(null, Buffer.from(
    `outsider/controlled-endpoint-consent-grant/v1\0${canonicalizeStrict(parsed.payload)}`),
  extraGrant.keys.privateKey).toString("base64");
  extraGrant.source.grantSourceBytes = Buffer.from(canonicalizeStrict({
    payload: parsed.payload, signature,
  }));
  extraGrant.source.expectedGrantSourceHash = `sha256:${createHash("sha256")
    .update(extraGrant.source.grantSourceBytes).digest("hex")}`;
  assert.throws(() => createControlledEndpointConsentGrantSourceReplayV1(
    extraGrant.source), /GRANT_PAYLOAD_FIELDS_INVALID/u);

  const operations = fixture("operations");
  const operationsParsed = JSON.parse(
    operations.source.grantSourceBytes.toString("utf8"));
  operationsParsed.payload.allowedOperations.reverse();
  assert.throws(() => controlledEndpointConsentGrantSigningMessageV1(
    operationsParsed.payload), /ALLOWED_OPERATIONS_INVALID/u);
});

test("public projection closes private source and identity handles", () => {
  const f = fixture("privacy");
  const value = createControlledEndpointConsentGrantSourceReplayV1(f.source);
  const text = JSON.stringify(value);
  const privateValues = [
    f.source.controllerPublicKeyPem,
    f.source.expectedControllerKeyIdHash,
    f.source.expectedGrantSourceHash,
    f.source.privateProjectionNonce,
    f.payload.grantIdHash,
    f.payload.resourceOwnerRefHash,
    f.payload.providerRefHash,
    f.payload.requestBodyHash,
    f.payload.oneUseNonceHash,
    f.payload.idempotencyKeyHash,
    f.payload.termsRevisionHash,
  ];
  for (const privateValue of privateValues) {
    assert.equal(text.includes(privateValue), false, privateValue);
  }
  assert.match(value.saltedPrivateSourceCommitmentHash,
    /^sha256:[a-f0-9]{64}$/u);
  assert.equal(value.rawSourceProjected, false);
  assert.equal(value.controllerKeyProjected, false);
  assert.equal(value.privateBindingHandlesProjected, false);
  assertNoAuthority(value);
});

test("hostile root proxy is rejected without invoking its traps", () => {
  const f = fixture("proxy");
  let traps = 0;
  const hostile = new Proxy(f.source, {
    get() { traps += 1; throw new Error("must not run"); },
    ownKeys() { traps += 1; throw new Error("must not run"); },
  });
  assert.throws(() => createControlledEndpointConsentGrantSourceReplayV1(
    hostile), /SOURCE_PROXY_FORBIDDEN/u);
  assert.equal(traps, 0);
});

test("lane profile and boundary freeze the no-action consent half", () => {
  assert.equal(Object.isFrozen(
    OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1), true);
  assert.equal(OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1
    .sourceSpecificAdapterRequired, true);
  assert.equal(OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1
    .maximumAcceptedTenderObjectsPerGrant, 1);
  assert.equal(OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1
    .standingCreated, false);
  assert.equal(OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_BOUNDARY
    .callerPinnedTrustRootScope, "LANE_CONTROLLER_ONLY");
  assert.equal(OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_BOUNDARY
    .laneConsentEstablishesProviderAcceptance, false);
  assert.equal(OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_BOUNDARY
    .laneConsentEnablesTenderSubmission, false);
  assert.equal(OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_BOUNDARY
    .consequenceReach, "NONE");
  assert.equal(OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_BOUNDARY
    .authority, "NONE");
});
