/*
 * Generic live PERMISSIONED_MAILBOX transport for one exact tender.
 *
 * Account credentials never enter this module. The caller injects closures
 * that send and receive through its account-native interface. Before that
 * closure can be called, the exact tender bytes, recipient, authority grant,
 * deadline, nonce, and idempotency key are bound into the existing fsync-backed
 * one-use effect ledger. SUBMIT_ATTEMPTED is durable before send; a restart may
 * observe a response but may never repeat the outbound send.
 *
 * Returned acknowledgement and response bytes are transport source material.
 * They do not establish acceptance, capacity, price, or outcome. Response bytes
 * are intentionally left uninterpreted for the existing permissioned mailbox
 * source-replay path.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
  replayDurableOneUseEndpointEffectStatesSinceV1,
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const PREFIX = "OUTSIDER_PERMISSIONED_MAILBOX_ONE_USE_TENDER_TRANSPORT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const LEDGER_ID = /^ledger_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_TENDER_BYTES = 8 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const MAX_RECIPIENT_BYTES = 4096;
const MAX_IDEMPOTENCY_BYTES = 4096;
const ISSUED_TRANSPORT_BINDINGS = new WeakMap();

export const OUTSIDER_PERMISSIONED_MAILBOX_ONE_USE_TENDER_TRANSPORT_V1_BOUNDARY
  = Object.freeze({
    transportFamily: "PERMISSIONED_MAILBOX",
    providerOrDomainSpecific: false,
    credentialsAcceptedByCore: false,
    credentialsRemainInsideCallerClosure: true,
    maximumOutboundSendsPerBoundEffect: 1,
    durableSubmitAttemptRequiredBeforeOutboundSend: true,
    restartMayReceiveButNeverResend: true,
    responseBytesExposedForSourceReplay: true,
    acknowledgementIsAcceptance: false,
    acknowledgementIsCapacity: false,
    responseBytesAreAutomaticallyTrusted: false,
    humanQueueCreated: false,
    paymentPerformed: false,
  });

export const OUTSIDER_PERMISSIONED_MAILBOX_ONE_USE_TENDER_CAPABILITIES_V1
  = Object.freeze([
    "ONE_USE_TENDER_DELIVERY",
    "STRICT_RESPONSE_OBSERVATION",
  ]);

export const OUTSIDER_PERMISSIONED_MAILBOX_ONE_USE_TENDER_TRANSPORT_BINDING_V1
  = "outsider/permissioned-mailbox-one-use-transport-binding/v1";

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function boundedBytes(value, maximum, code) {
  let bytes;
  try { bytes = Buffer.from(value); } catch { fail(`${code}_INVALID`); }
  if (bytes.length < 1 || bytes.length > maximum) fail(`${code}_INVALID`);
  return bytes;
}

function boundedString(value, maximum, code) {
  if (typeof value !== "string" || value.length < 1
    || Buffer.byteLength(value, "utf8") > maximum
    || /[\u0000\r\n]/u.test(value)) fail(`${code}_INVALID`);
  return value;
}

function normalizeInput(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    fail("DELIVERY_INPUT_INVALID");
  }
  const tenderBytes = boundedBytes(input.tenderBytes, MAX_TENDER_BYTES,
    "TENDER_BYTES");
  const recipient = boundedString(input.recipient, MAX_RECIPIENT_BYTES,
    "RECIPIENT");
  const idempotencyKey = boundedString(input.idempotencyKey,
    MAX_IDEMPOTENCY_BYTES, "IDEMPOTENCY_KEY");
  const effectDeadline = instant(input.effectDeadline,
    "EFFECT_DEADLINE_INVALID");
  const bodyHash = bytesHash(tenderBytes);
  const idempotencyKeyHash = digest(
    "outsider/permissioned-mailbox-idempotency-key/v1", idempotencyKey);
  const recipientAddressHash = digest(
    "outsider/permissioned-mailbox-recipient-address/v1", recipient);
  const binding = {
    tenderHash: hash(input.tenderHash, "TENDER_HASH_INVALID"),
    bodyHash,
    recipientAddressHash,
    recipientMailboxRefHash: hash(input.recipientMailboxRefHash,
      "RECIPIENT_MAILBOX_REF_HASH_INVALID"),
    authorityGrantHash: hash(input.authorityGrantHash,
      "AUTHORITY_GRANT_HASH_INVALID"),
    effectDeadline,
    oneUseNonceHash: hash(input.oneUseNonceHash,
      "ONE_USE_NONCE_HASH_INVALID"),
    idempotencyKeyHash,
  };
  if (input.expectedTenderBodyHash !== undefined
    && input.expectedTenderBodyHash !== bodyHash) {
    fail("TENDER_BODY_HASH_MISMATCH");
  }
  if (input.expectedIdempotencyKeyHash !== undefined
    && input.expectedIdempotencyKeyHash !== idempotencyKeyHash) {
    fail("IDEMPOTENCY_KEY_HASH_MISMATCH");
  }
  const transactionBindingHash = digest(
    "outsider/permissioned-mailbox-one-use-transaction-binding/v1", binding);
  const endpointBindingHash = digest(
    "outsider/permissioned-mailbox-exact-recipient-binding/v1", {
      recipientAddressHash,
      recipientMailboxRefHash: binding.recipientMailboxRefHash,
    });
  const effectIdHash = digest(
    "outsider/permissioned-mailbox-one-use-effect/v1", {
      transactionBindingHash,
      endpointBindingHash,
    });
  return Object.freeze({
    tenderBytes,
    recipient,
    idempotencyKey,
    binding: Object.freeze(binding),
    transactionBindingHash,
    endpointBindingHash,
    effectIdHash,
  });
}

function event(config, delivery, eventType, recordedAt, previous, evidence) {
  return createDurableOneUseEndpointEffectEventV1({
    ledgerId: config.ledgerId,
    eventType,
    effectIdHash: delivery.effectIdHash,
    transactionBindingHash: delivery.transactionBindingHash,
    endpointBindingHash: delivery.endpointBindingHash,
    adapterInstanceRefHash: config.adapterInstanceRefHash,
    permissionGrantHash: delivery.binding.authorityGrantHash,
    oneUseNonceHash: delivery.binding.oneUseNonceHash,
    idempotencyKeyHash: delivery.binding.idempotencyKeyHash,
    bodyHash: delivery.binding.bodyHash,
    effectDeadline: delivery.binding.effectDeadline,
    recordedAt,
    previousEffectEventHash: previous,
    occurrenceNonceHash: digest(
      "outsider/permissioned-mailbox-effect-occurrence/v1", {
        effectIdHash: delivery.effectIdHash,
        eventType,
        previousEffectEventHash: previous,
      }),
    endpointReceiptHash: eventType === "ENDPOINT_RECEIPT_OBSERVED"
      ? evidence : null,
    terminalEvidenceHash: ["REVOKED_BEFORE_SUBMIT",
      "EXPIRED_BEFORE_SUBMIT", "AMBIGUOUS_NO_RETRY_HOLD"]
      .includes(eventType) ? evidence : null,
  });
}

function append(config, head, next) {
  return appendDurableOneUseEndpointEffectLedgerV1({
    directory: config.directory,
    ledgerId: config.ledgerId,
    event: next,
    expectedLocalHeadHash: head.head.headHash,
  });
}

function readEffect(config, delivery) {
  const verification = verifyDurableOneUseEndpointEffectLedgerV1({
    directory: config.directory,
    ledgerId: config.ledgerId,
    expectedLocalHeadHash: null,
  });
  if (verification.ok !== true) fail("LEDGER_REPLAY_INVALID");
  const replay = replayDurableOneUseEndpointEffectStatesSinceV1({
    directory: config.directory,
    ledgerId: config.ledgerId,
    expectedAncestorHeadHash: verification.head.headHash,
    effectIdHashes: [delivery.effectIdHash],
  });
  const effect = replay.effects[0];
  if (effect === null) fail("BOUND_EFFECT_NOT_FOUND");
  const first = effect.firstEvent;
  const expected = {
    transactionBindingHash: delivery.transactionBindingHash,
    endpointBindingHash: delivery.endpointBindingHash,
    adapterInstanceRefHash: config.adapterInstanceRefHash,
    permissionGrantHash: delivery.binding.authorityGrantHash,
    oneUseNonceHash: delivery.binding.oneUseNonceHash,
    idempotencyKeyHash: delivery.binding.idempotencyKeyHash,
    bodyHash: delivery.binding.bodyHash,
    effectDeadline: delivery.binding.effectDeadline,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (first[key] !== value) fail("DURABLE_BINDING_MISMATCH");
  }
  return { head: replay.verification, effect };
}

async function authority(config, delivery, phase, observedAt) {
  const result = await config.revalidateAuthority(Object.freeze({
    phase,
    observedAt,
    binding: delivery.binding,
    transactionBindingHash: delivery.transactionBindingHash,
    endpointBindingHash: delivery.endpointBindingHash,
  }));
  if (result === null || typeof result !== "object"
    || typeof result.authorized !== "boolean"
    || result.authorityGrantHash !== delivery.binding.authorityGrantHash) {
    fail("AUTHORITY_REVALIDATION_INVALID");
  }
  const validUntil = instant(result.validUntil,
    "AUTHORITY_VALID_UNTIL_INVALID");
  return result.authorized === true
    && Date.parse(observedAt) < Date.parse(validUntil)
    && Date.parse(observedAt) < Date.parse(delivery.binding.effectDeadline);
}

function publicResult(delivery, head, state, extra = {}) {
  return Object.freeze({
    schema: "outsider/permissioned-mailbox-one-use-tender-result/v1",
    schemaVersion: "1.0.0",
    transportFamily: "PERMISSIONED_MAILBOX",
    state,
    tenderHash: delivery.binding.tenderHash,
    tenderBodyHash: delivery.binding.bodyHash,
    recipientMailboxRefHash: delivery.binding.recipientMailboxRefHash,
    recipientAddressHash: delivery.binding.recipientAddressHash,
    authorityGrantHash: delivery.binding.authorityGrantHash,
    effectDeadline: delivery.binding.effectDeadline,
    idempotencyKeyHash: delivery.binding.idempotencyKeyHash,
    effectIdHash: delivery.effectIdHash,
    ledgerHeadHash: head.head.headHash,
    sendAcknowledgementIsAcceptance: false,
    sendAcknowledgementIsCapacity: false,
    capacityReserved: false,
    outcomeEstablished: false,
    humanQueueCreated: false,
    paymentPerformed: false,
    ...extra,
  });
}

function pause(delivery, head, reason, retryAfter = null, extra = {}) {
  return publicResult(delivery, head, "PAUSED_RETRYABLE", {
    retry: Object.freeze({ reason, retryAfter }),
    responseBytes: null,
    responseSourceReplayRequired: true,
    ...extra,
  });
}

/**
 * `sendExact` and `receiveExact` are account-native edge closures. They may
 * close over credentials; those credentials are never returned or persisted.
 */
export function createPermissionedMailboxOneUseTenderTransportV1(input = {}) {
  if (input === null || typeof input !== "object"
    || typeof input.directory !== "string" || input.directory.length < 1
    || typeof input.ledgerId !== "string" || !LEDGER_ID.test(input.ledgerId)
    || typeof input.sendExact !== "function"
    || typeof input.receiveExact !== "function"
    || typeof input.revalidateAuthority !== "function"
    || typeof input.clock !== "function") fail("CONFIG_INVALID");
  const config = Object.freeze({
    directory: input.directory,
    ledgerId: input.ledgerId,
    adapterInstanceRefHash: hash(input.adapterInstanceRefHash,
      "ADAPTER_INSTANCE_REF_HASH_INVALID"),
    sendExact: input.sendExact,
    receiveExact: input.receiveExact,
    revalidateAuthority: input.revalidateAuthority,
    clock: input.clock,
  });

  async function observeResponse(delivery, currentHead, currentEvent,
    acknowledgementBytes = null) {
    let observed;
    try {
      observed = await config.receiveExact(Object.freeze({
        recipient: delivery.recipient,
        recipientMailboxRefHash: delivery.binding.recipientMailboxRefHash,
        tenderHash: delivery.binding.tenderHash,
        idempotencyKey: delivery.idempotencyKey,
        idempotencyKeyHash: delivery.binding.idempotencyKeyHash,
        effectDeadline: delivery.binding.effectDeadline,
        transactionBindingHash: delivery.transactionBindingHash,
      }));
    } catch {
      return pause(delivery, currentHead, "RESPONSE_OBSERVATION_UNAVAILABLE",
        null, { sendAcknowledgementBytes: acknowledgementBytes });
    }
    if (observed?.status === "PENDING") {
      const retryAfter = observed.retryAfter === null
        || observed.retryAfter === undefined ? null
        : instant(observed.retryAfter, "RECEIVE_RETRY_AFTER_INVALID");
      return pause(delivery, currentHead, "RESPONSE_NOT_YET_OBSERVED",
        retryAfter, { sendAcknowledgementBytes: acknowledgementBytes });
    }
    if (observed?.status !== "RESPONSE") {
      return pause(delivery, currentHead, "RESPONSE_OBSERVATION_INVALID",
        null, { sendAcknowledgementBytes: acknowledgementBytes });
    }
    const responseBytes = boundedBytes(observed.responseBytes,
      MAX_RESPONSE_BYTES, "RESPONSE_BYTES");
    const responseHash = bytesHash(responseBytes);
    const at = instant(config.clock(), "CLOCK_RESULT_INVALID");
    const receipt = event(config, delivery, "ENDPOINT_RECEIPT_OBSERVED", at,
      currentEvent.eventHash, responseHash);
    const completed = append(config, currentHead, receipt);
    return publicResult(delivery, completed, "RESPONSE_OBSERVED", {
      sendAcknowledgementBytes: acknowledgementBytes,
      responseBytes,
      responseSourceHash: responseHash,
      responseSourceReplayRequired: true,
      responseSemantics: "UNINTERPRETED_SOURCE_BYTES",
    });
  }

  async function drive(untrusted) {
    const delivery = normalizeInput(untrusted);
    let current;
    if (!existsSync(config.directory)) {
      const admittedAt = instant(config.clock(), "CLOCK_RESULT_INVALID");
      if (Date.parse(admittedAt)
        >= Date.parse(delivery.binding.effectDeadline)) {
        fail("DEADLINE_REACHED_BEFORE_ADMISSION");
      }
      if (!await authority(config, delivery, "ADMISSION", admittedAt)) {
        fail("AUTHORITY_NOT_CURRENT_AT_ADMISSION");
      }
      const admitted = event(config, delivery, "INTENT_ADMITTED", admittedAt,
        null, null);
      let head = initializeDurableOneUseEndpointEffectLedgerV1({
        directory: config.directory,
        ledgerId: config.ledgerId,
        genesisEvent: admitted,
      });
      const reservedAt = instant(config.clock(), "CLOCK_RESULT_INVALID");
      if (Date.parse(reservedAt)
        >= Date.parse(delivery.binding.effectDeadline)) {
        const expired = event(config, delivery, "EXPIRED_BEFORE_SUBMIT",
          reservedAt, admitted.eventHash, digest(
            "outsider/permissioned-mailbox-expired-before-submit/v1",
            delivery.effectIdHash));
        head = append(config, head, expired);
        return publicResult(delivery, head, "EXPIRED_BEFORE_SEND");
      }
      const reserved = event(config, delivery, "SUBMIT_RESERVED", reservedAt,
        admitted.eventHash, null);
      head = append(config, head, reserved);
      current = { head, effect: { currentEvent: reserved } };
    } else {
      current = readEffect(config, delivery);
    }

    const eventState = current.effect.currentEvent.eventType;
    if (eventState === "ENDPOINT_RECEIPT_OBSERVED") {
      return publicResult(delivery, current.head, "RESPONSE_ALREADY_OBSERVED", {
        responseBytes: null,
        responseSourceHash:
          current.effect.currentEvent.endpointReceiptHash,
        responseSourceReplayRequired: true,
      });
    }
    if (["REVOKED_BEFORE_SUBMIT", "EXPIRED_BEFORE_SUBMIT",
      "AMBIGUOUS_NO_RETRY_HOLD"].includes(eventState)) {
      return publicResult(delivery, current.head, eventState, {
        responseBytes: null,
        responseSourceReplayRequired: true,
      });
    }
    if (eventState === "SUBMIT_ATTEMPTED") {
      return observeResponse(delivery, current.head,
        current.effect.currentEvent);
    }
    if (!["INTENT_ADMITTED", "SUBMIT_RESERVED"].includes(eventState)) {
      fail("LEDGER_EFFECT_STATE_INVALID");
    }

    const attemptedAt = instant(config.clock(), "CLOCK_RESULT_INVALID");
    if (Date.parse(attemptedAt)
      >= Date.parse(delivery.binding.effectDeadline)) {
      const expired = event(config, delivery, "EXPIRED_BEFORE_SUBMIT",
        attemptedAt, current.effect.currentEvent.eventHash, digest(
          "outsider/permissioned-mailbox-expired-before-submit/v1",
          delivery.effectIdHash));
      const head = append(config, current.head, expired);
      return publicResult(delivery, head, "EXPIRED_BEFORE_SEND");
    }
    if (!await authority(config, delivery, "BEFORE_SEND", attemptedAt)) {
      const revoked = event(config, delivery, "REVOKED_BEFORE_SUBMIT",
        attemptedAt, current.effect.currentEvent.eventHash, digest(
          "outsider/permissioned-mailbox-authority-not-current/v1",
          delivery.effectIdHash));
      const head = append(config, current.head, revoked);
      return publicResult(delivery, head, "REVOKED_BEFORE_SEND");
    }
    const attempted = event(config, delivery, "SUBMIT_ATTEMPTED", attemptedAt,
      current.effect.currentEvent.eventHash, null);
    let head = append(config, current.head, attempted);
    let sent;
    try {
      sent = await config.sendExact(Object.freeze({
        recipient: delivery.recipient,
        recipientMailboxRefHash: delivery.binding.recipientMailboxRefHash,
        tenderBytes: Buffer.from(delivery.tenderBytes),
        tenderHash: delivery.binding.tenderHash,
        tenderBodyHash: delivery.binding.bodyHash,
        authorityGrantHash: delivery.binding.authorityGrantHash,
        idempotencyKey: delivery.idempotencyKey,
        idempotencyKeyHash: delivery.binding.idempotencyKeyHash,
        effectDeadline: delivery.binding.effectDeadline,
        transactionBindingHash: delivery.transactionBindingHash,
      }));
      if (sent === null || typeof sent !== "object"
        || sent.status !== "SENT") fail("SEND_RESULT_INVALID");
    } catch (error) {
      const evidence = digest(
        "outsider/permissioned-mailbox-ambiguous-send/v1", {
          effectIdHash: delivery.effectIdHash,
          errorName: error instanceof Error ? error.name : "Error",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      const reconciledAt = instant(config.clock(), "CLOCK_RESULT_INVALID");
      const ambiguous = event(config, delivery, "AMBIGUOUS_NO_RETRY_HOLD",
        reconciledAt, attempted.eventHash, evidence);
      head = append(config, head, ambiguous);
      return publicResult(delivery, head, "AMBIGUOUS_NO_RETRY_HOLD", {
        responseBytes: null,
        responseSourceReplayRequired: true,
      });
    }
    const acknowledgementBytes = sent.acknowledgementBytes === undefined
      || sent.acknowledgementBytes === null ? null
      : boundedBytes(sent.acknowledgementBytes, MAX_RESPONSE_BYTES,
        "SEND_ACKNOWLEDGEMENT_BYTES");
    return observeResponse(delivery, head, attempted,
      acknowledgementBytes);
  }

  const binding = Object.freeze({
    schema:
      OUTSIDER_PERMISSIONED_MAILBOX_ONE_USE_TENDER_TRANSPORT_BINDING_V1,
    schemaVersion: "1.0.0",
    transportFamily: "PERMISSIONED_MAILBOX",
    ledgerId: config.ledgerId,
    adapterInstanceRefHash: config.adapterInstanceRefHash,
    stateDirectoryRefHash: digest(
      "outsider/permissioned-mailbox-state-directory/v1",
      path.resolve(config.directory)),
  });
  const transportBindingHash = digest(binding.schema, binding);
  const transport = Object.freeze({
    transportFamily: "PERMISSIONED_MAILBOX",
    capabilities:
      OUTSIDER_PERMISSIONED_MAILBOX_ONE_USE_TENDER_CAPABILITIES_V1,
    transportBindingHash,
    drive,
  });
  ISSUED_TRANSPORT_BINDINGS.set(transport, Object.freeze({
    ...binding,
    transportBindingHash,
  }));
  return transport;
}

/** Return the privacy-closed binding of an exact factory-issued transport. */
export function inspectPermissionedMailboxOneUseTenderTransportV1(transport) {
  const binding = ISSUED_TRANSPORT_BINDINGS.get(transport);
  if (binding === undefined) fail("TRANSPORT_NOT_FACTORY_ISSUED");
  return binding;
}
