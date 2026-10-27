/*
 * Seller-owned durable capacity-reservation producer v1.
 *
 * This restart-safe release boundary composes the generic external capacity
 * reservation protocol with the existing fsync/CAS durable one-use effect
 * ledger. It returns no signed reservation source bytes until a durable
 * SUBMIT_ATTEMPTED occurrence has consumed the exact reservation nonce. If a
 * process dies after that occurrence, an exact restart refuses a second
 * release. The ledger names describe local source-bundle release here; this
 * module performs no network I/O, external action, payment, or settlement.
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
  verifyDurableOneUseEndpointEffectLedgerV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import { createSellerOwnedCapacityReservationBundleV1 }
  from "./outsider-external-capacity-reservation-protocol-v1.js";

const PREFIX
  = "OUTSIDER_SELLER_OWNED_DURABLE_CAPACITY_RESERVATION_PRODUCER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const LEDGER_ID = /^ledger_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const PRODUCERS = new WeakMap();

export const
  OUTSIDER_SELLER_OWNED_DURABLE_CAPACITY_RESERVATION_PRODUCER_V1_SCHEMAS
  = Object.freeze({
    producer:
      "outsider/seller-owned-durable-capacity-reservation-producer/v1",
    release:
      "outsider/seller-owned-durable-capacity-reservation-release/v1",
  });

export const
  OUTSIDER_SELLER_OWNED_DURABLE_CAPACITY_RESERVATION_PRODUCER_V1_BOUNDARY
  = Object.freeze({
    position:
      "SELLER_OWNED_FSYNC_BACKED_ONE_USE_RESERVATION_SOURCE_RELEASE_HOLD_ONLY",
    externalReservationProtocolReused: true,
    durableEffectLedgerReused: true,
    secondLedgerImplementationCreated: false,
    exactRequestTenderOfferProviderOwnerSlotQuantityWindowBound: true,
    oneUseReservationNonceDurablyConsumedBeforeBytesReturned: true,
    sourceBytesReturnedBeforeDurableSubmitAttempt: false,
    duplicateReleaseAfterRestartPermitted: false,
    crashAfterAttemptDisposition:
      "REFUSE_SECOND_RELEASE_EVEN_IF_FIRST_CALLER_DID_NOT_OBSERVE_BYTES",
    crashBeforeAttemptMayResumeExactInput: true,
    privateLedgerRootMode: "0700",
    privateLedgerEntryMode: "0600",
    fsyncAndCompareAndSwapRequired: true,
    filesystemOwnerRollbackOrReplacementExcluded: false,
    secondRootForSameNonceExcluded: false,
    externalNonEquivocationEstablished: false,
    sellerOwnerPolicyReferenceEstablishesAuthority: false,
    selfSignedOwnerSourceEstablishesOwnerAuthority: false,
    sourceSignatureEstablishesCapacityTruth: false,
    networkIoPerformed: false,
    providerContactPerformed: false,
    paymentPerformed: false,
    pricePresent: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "ONE_CALLER_SELECTED_PRIVATE_LOCAL_LEDGER_ROOT_ONLY",
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, fields[index]);
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function producerState(producer) {
  if (producer === null || typeof producer !== "object"
    || !PRODUCERS.has(producer)) fail("PRODUCER_CAPABILITY_INVALID");
  return PRODUCERS.get(producer);
}

const PRODUCER_INPUT_FIELDS = Object.freeze([
  "signer", "directory", "ledgerId", "adapterInstanceRefHash",
  "sellerReservationPolicyRefHash",
]);

export function createSellerOwnedDurableCapacityReservationProducerV1(
  input = {}) {
  exactObject(input, PRODUCER_INPUT_FIELDS, "PRODUCER_INPUT");
  if (typeof input.directory !== "string" || input.directory.length < 1) {
    fail("LEDGER_DIRECTORY_INVALID");
  }
  if (typeof input.ledgerId !== "string" || !LEDGER_ID.test(input.ledgerId)) {
    fail("LEDGER_ID_INVALID");
  }
  if (input.signer === null || typeof input.signer !== "object") {
    fail("SELLER_SIGNER_CAPABILITY_INVALID");
  }
  const body = {
    schema:
      OUTSIDER_SELLER_OWNED_DURABLE_CAPACITY_RESERVATION_PRODUCER_V1_SCHEMAS
        .producer,
    schemaVersion: "1.0.0",
    recordClass: "SEALED_SELLER_OWNED_DURABLE_RESERVATION_PRODUCER",
    ledgerId: input.ledgerId,
    adapterInstanceRefHash: hash(input.adapterInstanceRefHash,
      "ADAPTER_INSTANCE_REF_HASH"),
    sellerReservationPolicyRefHash: hash(
      input.sellerReservationPolicyRefHash,
      "SELLER_RESERVATION_POLICY_REF_HASH"),
    signerPrivateMaterialProjected: false,
    ledgerDirectoryProjected: false,
    restartSafeOneUseRequired: true,
    sellerPolicyReferenceEstablishesAuthority: false,
    capacityReserved: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  const producer = Object.freeze({ ...body, producerHash: digest(
    OUTSIDER_SELLER_OWNED_DURABLE_CAPACITY_RESERVATION_PRODUCER_V1_SCHEMAS
      .producer, body) });
  PRODUCERS.set(producer, {
    signer: input.signer,
    directory: input.directory,
    ledgerId: input.ledgerId,
    adapterInstanceRefHash: body.adapterInstanceRefHash,
    sellerReservationPolicyRefHash: body.sellerReservationPolicyRefHash,
    producerHash: producer.producerHash,
  });
  return producer;
}

function currentLedger(state) {
  const checked = verifyDurableOneUseEndpointEffectLedgerV1({
    directory: state.directory,
    ledgerId: state.ledgerId,
    expectedLocalHeadHash: null,
  });
  if (!checked.ok) fail("DURABLE_LEDGER_REPLAY_FAILED");
  return checked;
}

function appendAtCurrentHead(state, event) {
  const current = currentLedger(state);
  return appendDurableOneUseEndpointEffectLedgerV1({
    directory: state.directory,
    ledgerId: state.ledgerId,
    event,
    expectedLocalHeadHash: current.head.headHash,
  });
}

function admitIntent(state, event) {
  if (existsSync(state.directory)) return appendAtCurrentHead(state, event);
  try {
    return initializeDurableOneUseEndpointEffectLedgerV1({
      directory: state.directory,
      ledgerId: state.ledgerId,
      genesisEvent: event,
    });
  } catch (error) {
    if (!existsSync(state.directory)) throw error;
    return appendAtCurrentHead(state, event);
  }
}

function eventFor(state, binding, eventType, recordedAt, previousHash) {
  return createDurableOneUseEndpointEffectEventV1({
    ledgerId: state.ledgerId,
    eventType,
    effectIdHash: binding.effectIdHash,
    transactionBindingHash: binding.transactionBindingHash,
    endpointBindingHash: binding.endpointBindingHash,
    adapterInstanceRefHash: state.adapterInstanceRefHash,
    permissionGrantHash: state.sellerReservationPolicyRefHash,
    oneUseNonceHash: binding.oneUseNonceHash,
    idempotencyKeyHash: binding.idempotencyKeyHash,
    bodyHash: binding.bodyHash,
    effectDeadline: binding.effectDeadline,
    recordedAt,
    previousEffectEventHash: previousHash,
    occurrenceNonceHash: digest(
      "outsider/seller-owned-durable-capacity-reservation-occurrence/v1", {
        effectIdHash: binding.effectIdHash,
        eventType,
        recordedAt,
      }),
    endpointReceiptHash: null,
    terminalEvidenceHash: null,
  });
}

export function releaseSellerOwnedDurableCapacityReservationV1(
  producer, input = {}) {
  const state = producerState(producer);
  /* The generic producer performs the exact request/source validation and
     yields deterministic Ed25519 source bytes for the exact input. */
  const emitted = createSellerOwnedCapacityReservationBundleV1(
    state.signer, input);
  const manifest = emitted.publicProjection.sourceBundleManifest;
  const request = input.request;
  const recordedAt = instant(input.reservedAt, "DURABLE_RECORDED_AT");
  const bindingObject = {
    reservationRequestHash: manifest.reservationRequestHash,
    tenderHash: manifest.tenderHash,
    offerResponseHash: manifest.offerResponseHash,
    providerRefHash: manifest.providerRefHash,
    resourceOwnerRefHash: manifest.resourceOwnerRefHash,
    ownerSourceHash: manifest.ownerSourceHash,
    scopeHash: manifest.scopeHash,
    requirementKind: manifest.requirementKind,
    requirementId: manifest.requirementId,
    quantity: manifest.quantity,
    unitCode: manifest.unitCode,
    serviceFrom: manifest.serviceFrom,
    serviceUntil: manifest.serviceUntil,
    reservationNonceHash: manifest.reservationNonceHash,
    sourceBundleManifestHash: manifest.sourceBundleManifestHash,
  };
  const binding = {
    effectIdHash: digest(
      "outsider/seller-owned-durable-capacity-reservation-effect/v1",
      bindingObject),
    transactionBindingHash: digest(
      "outsider/seller-owned-durable-capacity-reservation-transaction/v1",
      bindingObject),
    endpointBindingHash: digest(
      "outsider/seller-owned-capacity-reservation-local-release/v1", {
        producerHash: state.producerHash,
        ownerSourceHash: manifest.ownerSourceHash,
      }),
    oneUseNonceHash: hash(manifest.reservationNonceHash,
      "RESERVATION_NONCE_HASH"),
    idempotencyKeyHash: digest(
      "outsider/seller-owned-durable-capacity-reservation-idempotency/v1", {
        reservationRequestHash: manifest.reservationRequestHash,
        sourceBundleManifestHash: manifest.sourceBundleManifestHash,
      }),
    bodyHash: manifest.sourceBundleManifestHash,
    effectDeadline: instant(request.requestExpiresAt,
      "RESERVATION_REQUEST_EXPIRES_AT"),
  };
  const intent = eventFor(state, binding, "INTENT_ADMITTED", recordedAt, null);
  const admitted = admitIntent(state, intent);
  const reservedEvent = eventFor(state, binding, "SUBMIT_RESERVED", recordedAt,
    intent.eventHash);
  const reserved = appendAtCurrentHead(state, reservedEvent);
  const attemptedEvent = eventFor(state, binding, "SUBMIT_ATTEMPTED", recordedAt,
    reservedEvent.eventHash);
  const attempted = appendAtCurrentHead(state, attemptedEvent);
  if (attempted.idempotentReplay === true) {
    fail("DURABLE_RESERVATION_RELEASE_ALREADY_ATTEMPTED_REFUSING_DUPLICATE");
  }
  const body = {
    schema:
      OUTSIDER_SELLER_OWNED_DURABLE_CAPACITY_RESERVATION_PRODUCER_V1_SCHEMAS
        .release,
    schemaVersion: "1.0.0",
    recordClass: "DURABLE_ATTEMPT_BEFORE_RESERVATION_SOURCE_BYTES_RELEASE",
    producerHash: state.producerHash,
    reservationRequestHash: manifest.reservationRequestHash,
    tenderHash: manifest.tenderHash,
    offerResponseHash: manifest.offerResponseHash,
    providerRefHash: manifest.providerRefHash,
    resourceOwnerRefHash: manifest.resourceOwnerRefHash,
    ownerSourceHash: manifest.ownerSourceHash,
    scopeHash: manifest.scopeHash,
    requirementKind: manifest.requirementKind,
    requirementId: manifest.requirementId,
    quantity: manifest.quantity,
    unitCode: manifest.unitCode,
    serviceFrom: manifest.serviceFrom,
    serviceUntil: manifest.serviceUntil,
    reservationNonceHash: manifest.reservationNonceHash,
    sourceBundleManifestHash: manifest.sourceBundleManifestHash,
    durableLedgerHeadHash: attempted.head.headHash,
    intentWasRestartReplay: admitted.idempotentReplay === true,
    localReservationWasRestartReplay: reserved.idempotentReplay === true,
    durableSubmitAttemptPersistedBeforeBytesReturned: true,
    duplicateReleaseAfterRestartPermitted: false,
    sourceBytesReleased: true,
    sourceDeclaredCapacityReservationCurrent: true,
    selfSignedOwnerSourceEstablishesOwnerAuthority: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    paymentPerformed: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary:
      OUTSIDER_SELLER_OWNED_DURABLE_CAPACITY_RESERVATION_PRODUCER_V1_BOUNDARY,
  };
  return {
    sourceBundle: {
      reservationReceiptSourceBytes: Buffer.from(
        emitted.sourceBundle.reservationReceiptSourceBytes),
      lifecycleEventSourceBytes:
        emitted.sourceBundle.lifecycleEventSourceBytes.map(
          (bytes) => Buffer.from(bytes)),
      lifecycleHeadSourceBytes: Buffer.from(
        emitted.sourceBundle.lifecycleHeadSourceBytes),
    },
    protocolProjection: emitted.publicProjection,
    publicProjection: Object.freeze({ ...body, releaseHash: digest(
      OUTSIDER_SELLER_OWNED_DURABLE_CAPACITY_RESERVATION_PRODUCER_V1_SCHEMAS
        .release, body) }),
  };
}
