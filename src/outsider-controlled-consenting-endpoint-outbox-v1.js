/*
 * Outsider controlled consenting endpoint outbox v1.
 *
 * This is deliberately one small, source-specific TEST_OR_RESEARCH lane.  It
 * can submit one exact tender body to a construction-time loopback endpoint
 * after an exact signed consent replay and a durable SUBMIT_ATTEMPTED record.
 * Once that record exists, this module never submits the body again.  A
 * restarted instance may only read the fixed status route and append the
 * signed endpoint receipt.  It is not a provider adapter, supplier registry,
 * capacity reservation, outcome promise, or production authority source.
 */

import { Buffer } from "node:buffer";
import {
  createHash,
  createPublicKey,
  verify as cryptoVerify,
} from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { request as httpRequest } from "node:http";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1,
  verifyControlledEndpointConsentGrantSourceReplayV1,
} from "./outsider-controlled-endpoint-consent-grant-v1.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const POST_PATH = "/outsider/v1/tender-intents";
const STATUS_PATH = "/outsider/v1/tender-intents/status";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const LEDGER_ID = /^ledger_[a-f0-9]{32}$/u;
const PRIVATE_NONCE = /^[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_BODY_BYTES = 1024 * 1024;
const MAX_RECEIPT_BYTES = 128 * 1024;
const CAPABILITIES = new WeakMap();

export const OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_SCHEMAS
  = Object.freeze({
    laneBinding: "outsider/controlled-loopback-endpoint-lane-binding/v1",
    receipt: "outsider/controlled-endpoint-delivery-receipt/v1",
    result: "outsider/controlled-consenting-endpoint-outbox-result/v1",
  });

export const OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_BOUNDARY
  = Object.freeze({
    laneClass: "CONTROLLED_LOOPBACK_TEST_OR_RESEARCH_ONLY",
    hostname: "127.0.0.1",
    submitPath: POST_PATH,
    statusPath: STATUS_PATH,
    perOrderTargetAccepted: false,
    perOrderMethodAccepted: false,
    arbitraryUrlAccepted: false,
    callbackAccepted: false,
    browserOrSessionAccepted: false,
    ambientCredentialAccepted: false,
    providerRegistryPresent: false,
    humanQueueCreated: false,
    durableSubmitAttemptBeforeNetworkRequired: true,
    constructionTimeSignedEndpointBindingRequired: true,
    runtimeClockGateBeforeSubmitRequired: true,
    automaticPostRetryAfterSubmitAttempted: false,
    statusOnlyReconciliationAfterSubmitAttempted: true,
    statusReconciliationMayOutliveSubmitConsentWindow: true,
    endpointReceiptMeaning: "RECEIVED_FOR_COUNTERPARTY_REVIEW_ONLY",
    endpointReceiptEstablishesProviderAcceptance: false,
    endpointReceiptEstablishesCapacity: false,
    endpointReceiptCreatesStanding: false,
    trustedClockEstablished: false,
    externalProviderAuthorityEstablished: false,
    realProviderContactEstablished: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
  });

function fail(code) {
  throw new TypeError(`OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_${code}`);
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object"
    || Object.getPrototypeOf(value) !== Object.prototype) fail(`${code}_INVALID`);
  const keys = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (keys.length !== expected.length
    || keys.some((key, index) => key !== expected[index])) fail(`${code}_SHAPE`);
}

function capabilityState(capability) {
  if (capability === null || typeof capability !== "object"
    || !CAPABILITIES.has(capability)) fail("CAPABILITY_INVALID");
  return CAPABILITIES.get(capability);
}

function laneBindingMessage(payload) {
  return Buffer.from(
    `outsider/controlled-loopback-endpoint-lane-binding/v1\0${canonicalizeStrict(payload)}`,
    "utf8");
}

export function controlledLoopbackEndpointLaneBindingSigningMessageV1(
  payload = {}) {
  return laneBindingMessage(payload);
}

function canonicalLaneBinding(config) {
  if (!Buffer.isBuffer(config.laneBindingSourceBytes)
    || config.laneBindingSourceBytes.length < 1
    || config.laneBindingSourceBytes.length > MAX_RECEIPT_BYTES
    || byteHash(config.laneBindingSourceBytes)
      !== config.expectedLaneBindingSourceHash) fail("LANE_BINDING_SOURCE_INVALID");
  let envelope;
  const text = config.laneBindingSourceBytes.toString("utf8");
  try {
    envelope = JSON.parse(text);
    if (canonicalizeStrict(envelope) !== text) fail("LANE_BINDING_NOT_CANONICAL");
  } catch { fail("LANE_BINDING_SOURCE_INVALID"); }
  const payload = envelope?.payload;
  exactObject(payload, ["schema", "schemaVersion", "laneProfileHash",
    "controllerKeyIdHash", "loopbackPort", "adapterInstanceRefHash",
    "endpointProviderRefHash", "issuedAt", "validFrom", "expiresAt"],
  "LANE_BINDING_PAYLOAD");
  if (payload.schema
      !== OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_SCHEMAS.laneBinding
    || payload.schemaVersion !== "1.0.0"
    || payload.laneProfileHash
      !== OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1.laneProfileHash
    || !Number.isSafeInteger(payload.loopbackPort)
    || payload.loopbackPort < 1 || payload.loopbackPort > 65_535) {
    fail("LANE_BINDING_SEMANTICS_INVALID");
  }
  hash(payload.controllerKeyIdHash, "LANE_CONTROLLER_KEY_ID_INVALID");
  hash(payload.adapterInstanceRefHash, "ADAPTER_INSTANCE_HASH_INVALID");
  hash(payload.endpointProviderRefHash, "ENDPOINT_PROVIDER_HASH_INVALID");
  const issuedAt = instant(payload.issuedAt, "LANE_ISSUED_AT_INVALID");
  const validFrom = instant(payload.validFrom, "LANE_VALID_FROM_INVALID");
  const expiresAt = instant(payload.expiresAt, "LANE_EXPIRES_AT_INVALID");
  if (Date.parse(issuedAt) > Date.parse(validFrom)
    || Date.parse(validFrom) >= Date.parse(expiresAt)) {
    fail("LANE_BINDING_VALIDITY_INVALID");
  }
  let key;
  try { key = createPublicKey(config.controllerPublicKeyPem); }
  catch { fail("LANE_CONTROLLER_KEY_INVALID"); }
  const keyIdHash = byteHash(key.export({ type: "spki", format: "der" }));
  if (keyIdHash !== payload.controllerKeyIdHash
    || typeof envelope.signature !== "string"
    || !cryptoVerify(null, laneBindingMessage(payload), key,
      Buffer.from(envelope.signature, "base64"))) {
    fail("LANE_BINDING_SIGNATURE_INVALID");
  }
  return { payload: { ...payload, issuedAt, validFrom, expiresAt }, key,
    sourceHash: config.expectedLaneBindingSourceHash };
}

function canonicalConsent(state, input, options = {}) {
  exactObject(input, ["consentSource", "expectedConsentReplayHash",
    "privateTenderEnvelopeBytes"], "OPERATION_INPUT");
  const expected = hash(input.expectedConsentReplayHash,
    "EXPECTED_CONSENT_REPLAY_HASH_INVALID");
  const replay = verifyControlledEndpointConsentGrantSourceReplayV1(
    input.consentSource, expected);
  if (!replay.ok || replay.replayHash !== expected
    || replay.laneProfile.profileCode !== "CONTROLLED_CONSENTING_ENDPOINT_JSON_V1"
    || replay.laneProfile.laneProfileHash
      !== OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1.laneProfileHash
    || !replay.callerPinnedLaneScopedReceiveConsentCurrent) {
    fail("CONSENT_REPLAY_NOT_CURRENT");
  }
  if (!Buffer.isBuffer(input.privateTenderEnvelopeBytes)
    || input.privateTenderEnvelopeBytes.length < 1
    || input.privateTenderEnvelopeBytes.length > MAX_BODY_BYTES) {
    fail("TENDER_BODY_INVALID");
  }
  const bytes = Buffer.from(input.privateTenderEnvelopeBytes);
  let envelope;
  try {
    envelope = JSON.parse(input.consentSource.grantSourceBytes.toString("utf8"));
  } catch { fail("CONSENT_PRIVATE_SOURCE_INVALID"); }
  const payload = envelope?.payload;
  if (payload === null || typeof payload !== "object"
    || byteHash(bytes) !== payload.requestBodyHash
    || payload.laneProfileHash
      !== OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1.laneProfileHash) {
    fail("CONSENT_BODY_OR_LANE_BINDING_MISMATCH");
  }
  const recordedAt = new Date().toISOString();
  if (options.allowPostSubmitReconciliation !== true
    && (Date.parse(recordedAt) < Date.parse(payload.validFrom)
      || Date.parse(recordedAt) >= Date.parse(payload.expiresAt)
      || Date.parse(recordedAt) >= Date.parse(payload.formationDeadline)
      || Date.parse(recordedAt) < Date.parse(state.laneBinding.payload.validFrom)
      || Date.parse(recordedAt) >= Date.parse(state.laneBinding.payload.expiresAt))) {
    fail("CONSENT_NOT_CURRENT_AT_OPERATION");
  }
  if (payload.controllerKeyIdHash
      !== state.laneBinding.payload.controllerKeyIdHash
    || payload.providerRefHash
      !== state.laneBinding.payload.endpointProviderRefHash
    || input.consentSource.controllerPublicKeyPem
      !== state.controllerPublicKeyPem) fail("CONSENT_ENDPOINT_BINDING_MISMATCH");
  const binding = {
    effectIdHash: digest("outsider/controlled-endpoint-effect/v1", {
      grantIdHash: payload.grantIdHash,
      ledgerTenderHash: payload.tenderHash,
      requestBodyHash: payload.requestBodyHash,
    }),
    transactionBindingHash: digest(
      "outsider/controlled-endpoint-transaction-binding/v1", {
        tenderHash: payload.tenderHash,
        typedGraphHash: payload.typedGraphHash,
        episodeHash: payload.episodeHash,
        attemptHash: payload.attemptHash,
        requirementKind: payload.requirementKind,
        requirementId: payload.requirementId,
        requirementObjectHash: payload.requirementObjectHash,
      }),
    permissionGrantHash: payload.grantIdHash,
    oneUseNonceHash: payload.oneUseNonceHash,
    idempotencyKeyHash: payload.idempotencyKeyHash,
    bodyHash: payload.requestBodyHash,
    effectDeadline: payload.expiresAt,
    requirementKind: payload.requirementKind,
    consentReplayHash: expected,
    controllerPublicKeyPem: input.consentSource.controllerPublicKeyPem,
  };
  return { replay, payload, bytes, recordedAt, binding };
}

function laneBinding(state, privateBinding) {
  return {
    ...privateBinding,
    endpointBindingHash: digest("outsider/controlled-loopback-endpoint/v1", {
      laneProfileHash:
        OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1.laneProfileHash,
      loopbackPort: state.laneBinding.payload.loopbackPort,
      submitPath: POST_PATH,
      statusPath: STATUS_PATH,
    }),
    adapterInstanceRefHash: state.laneBinding.payload.adapterInstanceRefHash,
  };
}

function event(state, binding, type, previousEffectEventHash, recordedAt,
  endpointReceiptHash = null, terminalEvidenceHash = null) {
  return createDurableOneUseEndpointEffectEventV1({
    ledgerId: state.ledgerId,
    eventType: type,
    effectIdHash: binding.effectIdHash,
    transactionBindingHash: binding.transactionBindingHash,
    endpointBindingHash: binding.endpointBindingHash,
    adapterInstanceRefHash: binding.adapterInstanceRefHash,
    permissionGrantHash: binding.permissionGrantHash,
    oneUseNonceHash: binding.oneUseNonceHash,
    idempotencyKeyHash: binding.idempotencyKeyHash,
    bodyHash: binding.bodyHash,
    effectDeadline: binding.effectDeadline,
    recordedAt,
    previousEffectEventHash,
    occurrenceNonceHash: digest("outsider/controlled-endpoint-occurrence/v1", {
      ledgerId: state.ledgerId, effectIdHash: binding.effectIdHash,
      type, previousEffectEventHash, recordedAt,
    }),
    endpointReceiptHash,
    terminalEvidenceHash,
  });
}

function replayWithLastEvent(state) {
  const verification = verifyDurableOneUseEndpointEffectLedgerV1({
    directory: state.ledgerDirectory,
    ledgerId: state.ledgerId,
    expectedLocalHeadHash: null,
  });
  if (!verification.ok) fail("DURABLE_LEDGER_REPLAY_FAILED");
  const names = readdirSync(path.join(state.ledgerDirectory, "entries")).sort();
  const stored = JSON.parse(readFileSync(path.join(state.ledgerDirectory,
    "entries", names[names.length - 1]), "utf8"));
  if (stored.entryHash !== verification.head.headEntryHash
    || stored.eventHash !== stored.event?.eventHash) fail("LEDGER_HEAD_SPLICE");
  const stable = verifyDurableOneUseEndpointEffectLedgerV1({
    directory: state.ledgerDirectory,
    ledgerId: state.ledgerId,
    expectedLocalHeadHash: verification.head.headHash,
  });
  if (!stable.ok) fail("DURABLE_LEDGER_CHANGED_DURING_READ");
  return { verification: stable, event: stored.event };
}

function appendEvent(state, previous, next) {
  return appendDurableOneUseEndpointEffectLedgerV1({
    directory: state.ledgerDirectory,
    ledgerId: state.ledgerId,
    event: next,
    expectedLocalHeadHash: previous.verification.head.headHash,
  });
}

function publicResult(state, stage, verification, binding, io = {}) {
  const transitions = verification.head.transitionCounts;
  let enabled = [];
  if (stage === "DURABLY_ADMITTED_HOLD") {
    enabled = ["CONTROLLED_LOOPBACK_TENDER_SUBMIT",
      "CONTROLLED_LOOPBACK_DELIVERY_STATUS_READ"];
  } else if (stage === "SUBMIT_ATTEMPTED_COMMIT_UNKNOWN_HOLD") {
    enabled = ["CONTROLLED_LOOPBACK_DELIVERY_STATUS_READ"];
  }
  const privateCommitmentHash = digest(
    "outsider/controlled-endpoint-outbox-private-projection/v1", {
      privateProjectionNonce: state.privateProjectionNonce,
      effectIdHash: binding.effectIdHash,
      consentReplayHash: binding.consentReplayHash,
      localHeadHash: verification.head.headHash,
    });
  return Object.freeze({
    schema: OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_SCHEMAS.result,
    schemaVersion: "1.0.0",
    ok: true,
    stage,
    laneClass: "CONTROLLED_LOOPBACK_TEST_OR_RESEARCH_ONLY",
    requirementKind: binding.requirementKind,
    durableOccurrenceCount: verification.head.exactOccurrenceCount,
    submitAttemptOccurrenceCount: transitions.SUBMIT_ATTEMPTED,
    endpointReceiptOccurrenceCount: transitions.ENDPOINT_RECEIPT_OBSERVED,
    controlledTestEndpointNetworkIoPerformedByThisCall: io.network === true,
    controlledTestEndpointPostPerformedByThisCall: io.post === true,
    controlledTestEndpointStatusReadPerformedByThisCall: io.status === true,
    automaticPostRetryPerformed: false,
    statusOnlyReconciliationRequired:
      transitions.SUBMIT_ATTEMPTED === 1
      && transitions.ENDPOINT_RECEIPT_OBSERVED === 0,
    endpointReceiptMeaning: transitions.ENDPOINT_RECEIPT_OBSERVED === 1
      ? "RECEIVED_FOR_COUNTERPARTY_REVIEW_ONLY" : null,
    enabledCapabilities: Object.freeze(enabled),
    provenAuthorityCapabilities: Object.freeze([...enabled]),
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    capabilityAuthorityScope: "CONTROLLED_LOOPBACK_TEST_OR_RESEARCH_ONLY",
    consequenceReach: enabled.length === 0 ? "NONE"
      : "ONE_EXACT_BODY_TO_ONE_CONSTRUCTION_TIME_LOOPBACK_ENDPOINT",
    privateBindingHandlesProjected: false,
    privateProjectionCommitmentHash: privateCommitmentHash,
    trustedClockEstablished: false,
    staffTouchDenominatorComplete: false,
    outsiderStaffTouchCount: null,
    zeroInternalOpsEstablished: false,
    providerRegistryPresent: false,
    humanQueueCreated: false,
    realProviderContactEstablished: false,
    providerAcceptance: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    standingCreated: false,
    userOutcomePromiseIssued: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    moneyMovementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_BOUNDARY,
  });
}

function httpExchange(state, method, requestPath, headers, body = null) {
  return new Promise((resolve) => {
    const request = httpRequest({
      hostname: "127.0.0.1",
      port: state.laneBinding.payload.loopbackPort,
      method,
      path: requestPath,
      headers,
      agent: false,
    }, (response) => {
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > MAX_RECEIPT_BYTES) request.destroy();
        else chunks.push(Buffer.from(chunk));
      });
      response.on("end", () => resolve({
        statusCode: response.statusCode ?? 0,
        bytes: Buffer.concat(chunks),
      }));
    });
    request.once("error", () => resolve({ statusCode: 0, bytes: Buffer.alloc(0) }));
    request.setTimeout(2_000, () => request.destroy());
    if (body !== null) request.write(body);
    request.end();
  });
}

function receiptMessage(payload) {
  return Buffer.from(
    `outsider/controlled-endpoint-delivery-receipt/v1\0${canonicalizeStrict(payload)}`,
    "utf8");
}

export function controlledEndpointDeliveryReceiptSigningMessageV1(
  payload = {}) {
  return receiptMessage(payload);
}

function verifyReceipt(bytes, binding) {
  let envelope;
  try {
    const text = bytes.toString("utf8");
    envelope = JSON.parse(text);
    if (canonicalizeStrict(envelope) !== text) fail("RECEIPT_NOT_CANONICAL");
  } catch { fail("ENDPOINT_RECEIPT_INVALID"); }
  const payload = envelope?.payload;
  exactObject(payload, ["schema", "schemaVersion", "effectIdHash", "bodyHash",
    "idempotencyKeyHash", "state", "receivedAt", "providerAcceptance",
    "capacityReserved", "standingCreated"], "RECEIPT_PAYLOAD");
  if (payload.schema !== OUTSIDER_CONTROLLED_CONSENTING_ENDPOINT_OUTBOX_V1_SCHEMAS.receipt
    || payload.schemaVersion !== "1.0.0"
    || payload.effectIdHash !== binding.effectIdHash
    || payload.bodyHash !== binding.bodyHash
    || payload.idempotencyKeyHash !== binding.idempotencyKeyHash
    || payload.state !== "RECEIVED_FOR_COUNTERPARTY_REVIEW"
    || payload.providerAcceptance !== false
    || payload.capacityReserved !== false
    || payload.standingCreated !== false) fail("RECEIPT_SEMANTICS_MISMATCH");
  instant(payload.receivedAt, "RECEIPT_TIME_INVALID");
  if (typeof envelope.signature !== "string") fail("RECEIPT_SIGNATURE_INVALID");
  let key;
  try { key = createPublicKey(binding.controllerPublicKeyPem); }
  catch { fail("RECEIPT_KEY_INVALID"); }
  if (!cryptoVerify(null, receiptMessage(payload), key,
    Buffer.from(envelope.signature, "base64"))) fail("RECEIPT_SIGNATURE_INVALID");
  return { payload, receiptHash: byteHash(bytes) };
}

export function createControlledConsentingEndpointOutboxV1(config = {}) {
  exactObject(config, ["ledgerDirectory", "ledgerId",
    "laneBindingSourceBytes", "expectedLaneBindingSourceHash",
    "controllerPublicKeyPem", "privateProjectionNonce"], "CONFIG");
  if (typeof config.ledgerDirectory !== "string"
    || !LEDGER_ID.test(config.ledgerId)
    || !PRIVATE_NONCE.test(config.privateProjectionNonce)) fail("CONFIG_INVALID");
  hash(config.expectedLaneBindingSourceHash,
    "EXPECTED_LANE_BINDING_SOURCE_HASH_INVALID");
  const laneBinding = canonicalLaneBinding(config);
  const capability = Object.freeze(Object.create(null));
  CAPABILITIES.set(capability, Object.freeze({
    ledgerDirectory: config.ledgerDirectory,
    ledgerId: config.ledgerId,
    controllerPublicKeyPem: config.controllerPublicKeyPem,
    privateProjectionNonce: config.privateProjectionNonce,
    laneBinding,
  }));
  return capability;
}

export function admitControlledEndpointTenderV1(capability, input = {}) {
  const state = capabilityState(capability);
  const checked = canonicalConsent(state, input);
  const binding = laneBinding(state, checked.binding);
  const intent = event(state, binding, "INTENT_ADMITTED", null,
    checked.recordedAt);
  const initialized = initializeDurableOneUseEndpointEffectLedgerV1({
    directory: state.ledgerDirectory,
    ledgerId: state.ledgerId,
    genesisEvent: intent,
  });
  return publicResult(state, "DURABLY_ADMITTED_HOLD", initialized, binding);
}

export async function dispatchControlledEndpointTenderV1(capability,
  input = {}) {
  const state = capabilityState(capability);
  const checked = canonicalConsent(state, input);
  const binding = laneBinding(state, checked.binding);
  let current = replayWithLastEvent(state);
  if (current.event.effectIdHash !== binding.effectIdHash) fail("EFFECT_BINDING_MISMATCH");
  if (current.event.eventType === "SUBMIT_ATTEMPTED") {
    return publicResult(state, "SUBMIT_ATTEMPTED_COMMIT_UNKNOWN_HOLD",
      current.verification, binding);
  }
  if (current.event.eventType === "INTENT_ADMITTED") {
    const reserved = event(state, binding, "SUBMIT_RESERVED",
      current.event.eventHash, checked.recordedAt);
    const reserveResult = appendEvent(state, current, reserved);
    current = { verification: reserveResult, event: reserved };
  } else if (current.event.eventType !== "SUBMIT_RESERVED") {
    fail("SUBMIT_STATE_INVALID");
  }
  const attempted = event(state, binding, "SUBMIT_ATTEMPTED",
    current.event.eventHash, checked.recordedAt);
  const attemptResult = appendEvent(state, current, attempted);
  const response = await httpExchange(state, "POST", POST_PATH, {
    "content-type": "application/json",
    "content-length": checked.bytes.length,
    "x-outsider-effect-id": binding.effectIdHash,
    "x-outsider-idempotency-key": binding.idempotencyKeyHash,
    "x-outsider-body-hash": binding.bodyHash,
  }, checked.bytes);
  if (response.statusCode === 201) {
    const receipt = verifyReceipt(response.bytes, binding);
    const receiptEvent = event(state, binding, "ENDPOINT_RECEIPT_OBSERVED",
      attempted.eventHash, checked.recordedAt, receipt.receiptHash);
    const observed = appendDurableOneUseEndpointEffectLedgerV1({
      directory: state.ledgerDirectory, ledgerId: state.ledgerId,
      event: receiptEvent, expectedLocalHeadHash: attemptResult.head.headHash,
    });
    return publicResult(state, "ENDPOINT_RECEIPT_OBSERVED_HOLD", observed,
      binding, { network: true, post: true });
  }
  return publicResult(state, "SUBMIT_ATTEMPTED_COMMIT_UNKNOWN_HOLD",
    attemptResult, binding, { network: true, post: true });
}

export async function reconcileControlledEndpointTenderV1(capability,
  input = {}) {
  const state = capabilityState(capability);
  const checked = canonicalConsent(state, input, {
    allowPostSubmitReconciliation: true,
  });
  const binding = laneBinding(state, checked.binding);
  const current = replayWithLastEvent(state);
  if (current.event.effectIdHash !== binding.effectIdHash
    || current.event.eventType !== "SUBMIT_ATTEMPTED") {
    fail("STATUS_RECONCILIATION_STATE_INVALID");
  }
  const response = await httpExchange(state, "GET", STATUS_PATH, {
    "x-outsider-effect-id": binding.effectIdHash,
    "x-outsider-idempotency-key": binding.idempotencyKeyHash,
    "x-outsider-body-hash": binding.bodyHash,
  });
  if (response.statusCode !== 200) {
    return publicResult(state, "SUBMIT_ATTEMPTED_COMMIT_UNKNOWN_HOLD",
      current.verification, binding, { network: true, status: true });
  }
  const receipt = verifyReceipt(response.bytes, binding);
  const receiptEvent = event(state, binding, "ENDPOINT_RECEIPT_OBSERVED",
    current.event.eventHash, checked.recordedAt, receipt.receiptHash);
  const observed = appendEvent(state, current, receiptEvent);
  return publicResult(state, "ENDPOINT_RECEIPT_OBSERVED_HOLD", observed,
    binding, { network: true, status: true });
}

export function revokeControlledEndpointTenderV1(capability, input = {}) {
  exactObject(input, ["consentSource", "expectedConsentReplayHash",
    "privateTenderEnvelopeBytes", "terminalEvidenceHash"],
  "REVOKE_INPUT");
  const state = capabilityState(capability);
  const checked = canonicalConsent(state, {
    consentSource: input.consentSource,
    expectedConsentReplayHash: input.expectedConsentReplayHash,
    privateTenderEnvelopeBytes: input.privateTenderEnvelopeBytes,
  });
  const binding = laneBinding(state, checked.binding);
  const current = replayWithLastEvent(state);
  if (current.event.effectIdHash !== binding.effectIdHash
    || (current.event.eventType !== "INTENT_ADMITTED"
      && current.event.eventType !== "SUBMIT_RESERVED")) fail("REVOKE_STATE_INVALID");
  const revoked = event(state, binding, "REVOKED_BEFORE_SUBMIT",
    current.event.eventHash, checked.recordedAt, null,
    hash(input.terminalEvidenceHash, "TERMINAL_EVIDENCE_HASH_INVALID"));
  const result = appendEvent(state, current, revoked);
  return publicResult(state, "REVOKED_BEFORE_SUBMIT_HOLD", result, binding);
}
