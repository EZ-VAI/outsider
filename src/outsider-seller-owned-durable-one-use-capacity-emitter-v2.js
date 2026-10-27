/*
 * Seller-owned durable one-use capacity emitter v2.
 *
 * This adapter puts a restart-safe local release boundary in front of the v1
 * seller source producer. It intentionally reuses the existing fsync-backed
 * durable endpoint-effect ledger mechanics rather than defining another file
 * ledger. The underlying SUBMIT_* names mean local source-bundle release in
 * this adapter; no endpoint or network is contacted.
 *
 * prepare() may generate and sign bytes internally, but returns only an opaque
 * prepared capability and a closed projection. release() first durably appends
 * SUBMIT_ATTEMPTED and only then returns the source bytes. If the process dies
 * after that append, a restart refuses another release. Availability may be
 * lost at that crash boundary; duplicate release is the fail-closed priority.
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
import { emitSellerOwnedOneUseCapacityReservationV1 }
  from "./outsider-seller-owned-one-use-capacity-emitter-v1.js";

const PREFIX = "OUTSIDER_SELLER_OWNED_DURABLE_ONE_USE_CAPACITY_EMITTER_V2_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const LEDGER_ID = /^ledger_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const ADAPTERS = new WeakMap();
const PREPARED = new WeakMap();

export const OUTSIDER_SELLER_OWNED_DURABLE_ONE_USE_CAPACITY_EMITTER_V2_SCHEMAS
  = Object.freeze({
    adapter: "outsider/seller-owned-durable-capacity-emitter-adapter/v2",
    preparation:
      "outsider/seller-owned-durable-capacity-emission-preparation/v2",
    release: "outsider/seller-owned-durable-capacity-emission-release/v2",
  });

export const OUTSIDER_SELLER_OWNED_DURABLE_ONE_USE_CAPACITY_EMITTER_V2_BOUNDARY
  = Object.freeze({
    position: "SELLER_OWNED_LOCAL_DURABLE_SOURCE_RELEASE_HOLD_ONLY",
    v1SellerSourceEmitterReused: true,
    durableEffectLedgerMechanicsReused: true,
    secondFilesystemLedgerCreated: false,
    ledgerEventNameMapping:
      "SUBMIT_RESERVED_AND_SUBMIT_ATTEMPTED_MEAN_LOCAL_SOURCE_BUNDLE_RELEASE_ONLY",
    privateLedgerRootProjected: false,
    privateLedgerRootMode: "0700",
    privateLedgerEntryMode: "0600",
    appendOnlyEntriesRequired: true,
    noClobberEntryCreationRequired: true,
    fsyncBeforeReleaseRequired: true,
    compareAndSwapHeadRequired: true,
    fullHeadReplayBeforeAppendRequired: true,
    exactTenderResponseProviderAndSourceBundleBound: true,
    sourceBytesReturnedBeforeDurableAttempt: false,
    sourceBytesReturnedAfterDurableAttempt: true,
    duplicateReleaseAfterRestartPermitted: false,
    crashAfterAttemptDisposition:
      "REFUSE_SECOND_RELEASE_EVEN_IF_FIRST_CALLER_DID_NOT_OBSERVE_BYTES",
    crashBeforeAttemptMayResume: true,
    processLifetimeClockTrusted: false,
    filesystemOwnerRollbackOrReplacementExcluded: false,
    externalNonEquivocationEstablished: false,
    callerPolicyReferenceEstablishesAuthority: false,
    sellerDeclarationIsIndependentWitness: false,
    independentWitnessReceiptPresent: false,
    networkIoPerformed: false,
    externalResourceContacted: false,
    legalIdentityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    outcomeEstablished: false,
    pricePresent: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
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
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
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

function adapterState(adapter) {
  if (adapter === null || typeof adapter !== "object"
    || !ADAPTERS.has(adapter)) fail("ADAPTER_CAPABILITY_INVALID");
  return ADAPTERS.get(adapter);
}

function preparedState(prepared) {
  if (prepared === null || typeof prepared !== "object"
    || !PREPARED.has(prepared)) fail("PREPARED_CAPABILITY_INVALID");
  return PREPARED.get(prepared);
}

const ADAPTER_FIELDS = Object.freeze([
  "directory", "ledgerId", "adapterInstanceRefHash",
  "sellerEmissionPolicyRefHash",
]);

export function createSellerOwnedDurableCapacityEmitterAdapterV2(input = {}) {
  exactObject(input, ADAPTER_FIELDS, "ADAPTER_INPUT");
  if (typeof input.directory !== "string" || input.directory.length < 1) {
    fail("LEDGER_DIRECTORY_INVALID");
  }
  if (typeof input.ledgerId !== "string" || !LEDGER_ID.test(input.ledgerId)) {
    fail("LEDGER_ID_INVALID");
  }
  hash(input.adapterInstanceRefHash, "ADAPTER_INSTANCE_REF_HASH");
  hash(input.sellerEmissionPolicyRefHash, "SELLER_EMISSION_POLICY_REF_HASH");
  const body = {
    schema:
      OUTSIDER_SELLER_OWNED_DURABLE_ONE_USE_CAPACITY_EMITTER_V2_SCHEMAS.adapter,
    schemaVersion: "2.0.0",
    recordClass: "SEALED_SELLER_OWNED_DURABLE_EMISSION_ADAPTER",
    ledgerId: input.ledgerId,
    adapterInstanceRefHash: input.adapterInstanceRefHash,
    sellerEmissionPolicyRefHash: input.sellerEmissionPolicyRefHash,
    ledgerDirectoryProjected: false,
    restartSafeDuplicateReleaseRefusalRequired: true,
    callerPolicyReferenceEstablishesAuthority: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  const adapter = Object.freeze({
    ...body,
    adapterHash: digest(
      OUTSIDER_SELLER_OWNED_DURABLE_ONE_USE_CAPACITY_EMITTER_V2_SCHEMAS
        .adapter, body),
  });
  ADAPTERS.set(adapter, {
    directory: input.directory,
    ledgerId: input.ledgerId,
    adapterInstanceRefHash: input.adapterInstanceRefHash,
    sellerEmissionPolicyRefHash: input.sellerEmissionPolicyRefHash,
    adapterHash: adapter.adapterHash,
  });
  return adapter;
}

const PREPARE_FIELDS = Object.freeze([
  "sellerEmitterCapability", "emissionInput", "admittedAt", "reservedAt",
]);

function eventBinding(state, emitted, emissionInput) {
  const manifest = emitted.publicProjection.sourceBundleManifest;
  const response = emissionInput.responses[0];
  if (response === null || typeof response !== "object"
    || response.responseHash !== manifest.oneUseResponseHash
    || emissionInput.expectedTenderHash !== manifest.tenderHash
    || response.providerRefHash !== manifest.providerRefHash) {
    fail("EMISSION_RESPONSE_TENDER_PROVIDER_BINDING_INVALID");
  }
  const exactBinding = {
    tenderHash: manifest.tenderHash,
    typedGraphHash: manifest.typedGraphHash,
    episodeHash: manifest.episodeHash,
    attemptHash: manifest.attemptHash,
    oneUseResponseHash: manifest.oneUseResponseHash,
    providerRefHash: manifest.providerRefHash,
    scopeHash: manifest.scopeHash,
    sourceBundleManifestHash: manifest.sourceBundleManifestHash,
  };
  return {
    effectIdHash: digest(
      "outsider/seller-owned-durable-capacity-emission-effect/v2",
      exactBinding),
    transactionBindingHash: digest(
      "outsider/seller-owned-durable-capacity-transaction-binding/v2",
      exactBinding),
    endpointBindingHash: digest(
      "outsider/seller-owned-local-emitter-binding/v2", {
        adapterHash: state.adapterHash,
        verifierContextHash: manifest.verifierContextHash,
      }),
    adapterInstanceRefHash: state.adapterInstanceRefHash,
    permissionGrantHash: state.sellerEmissionPolicyRefHash,
    oneUseNonceHash: hash(response.responseNonceHash, "RESPONSE_NONCE_HASH"),
    idempotencyKeyHash: digest(
      "outsider/seller-owned-durable-capacity-idempotency/v2", {
        oneUseResponseHash: manifest.oneUseResponseHash,
        sourceBundleManifestHash: manifest.sourceBundleManifestHash,
      }),
    bodyHash: manifest.sourceBundleManifestHash,
    effectDeadline: instant(response.expiresAt, "RESPONSE_EXPIRES_AT"),
    manifest,
  };
}

function eventFor(state, binding, eventType, recordedAt, previousHash) {
  return createDurableOneUseEndpointEffectEventV1({
    ledgerId: state.ledgerId,
    eventType,
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
    previousEffectEventHash: previousHash,
    occurrenceNonceHash: digest(
      "outsider/seller-owned-durable-capacity-emission-occurrence/v2", {
        effectIdHash: binding.effectIdHash,
        eventType,
        recordedAt,
      }),
    endpointReceiptHash: null,
    terminalEvidenceHash: null,
  });
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

function admitIntent(state, intent) {
  if (existsSync(state.directory)) return appendAtCurrentHead(state, intent);
  try {
    return initializeDurableOneUseEndpointEffectLedgerV1({
      directory: state.directory,
      ledgerId: state.ledgerId,
      genesisEvent: intent,
    });
  } catch (error) {
    /* A concurrent creator may have won. Never hide any other initialize
       failure and never overwrite an existing root. */
    if (!existsSync(state.directory)) throw error;
    return appendAtCurrentHead(state, intent);
  }
}

export function prepareSellerOwnedDurableCapacityEmissionV2(
  adapter, input = {}) {
  const state = adapterState(adapter);
  exactObject(input, PREPARE_FIELDS, "PREPARE_INPUT");
  const admittedAt = instant(input.admittedAt, "ADMITTED_AT");
  const reservedAt = instant(input.reservedAt, "RESERVED_AT");
  if (Date.parse(reservedAt) < Date.parse(admittedAt)) {
    fail("PREPARATION_TIME_ROLLBACK");
  }
  const emitted = emitSellerOwnedOneUseCapacityReservationV1(
    input.sellerEmitterCapability, input.emissionInput);
  const binding = eventBinding(state, emitted, input.emissionInput);
  const intent = eventFor(state, binding, "INTENT_ADMITTED", admittedAt, null);
  const admitted = admitIntent(state, intent);
  const reservedEvent = eventFor(state, binding, "SUBMIT_RESERVED", reservedAt,
    intent.eventHash);
  const reserved = appendAtCurrentHead(state, reservedEvent);
  const projectionBody = {
    schema: OUTSIDER_SELLER_OWNED_DURABLE_ONE_USE_CAPACITY_EMITTER_V2_SCHEMAS
      .preparation,
    schemaVersion: "2.0.0",
    recordClass: "DURABLY_PREPARED_SELLER_SOURCE_BUNDLE_RELEASE",
    adapterHash: state.adapterHash,
    tenderHash: binding.manifest.tenderHash,
    oneUseResponseHash: binding.manifest.oneUseResponseHash,
    providerRefHash: binding.manifest.providerRefHash,
    scopeHash: binding.manifest.scopeHash,
    sourceBundleManifestHash: binding.manifest.sourceBundleManifestHash,
    effectIdHash: binding.effectIdHash,
    durableLedgerHeadHash: reserved.head.headHash,
    intentWasRestartReplay: admitted.idempotentReplay === true,
    reservationWasRestartReplay: reserved.idempotentReplay === true,
    sourceBytesReleased: false,
    capacityReserved: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  const projection = Object.freeze({
    ...projectionBody,
    preparationHash: digest(
      OUTSIDER_SELLER_OWNED_DURABLE_ONE_USE_CAPACITY_EMITTER_V2_SCHEMAS
        .preparation, projectionBody),
  });
  const prepared = Object.freeze({
    schema: projection.schema,
    preparationHash: projection.preparationHash,
    sourceBytesAvailableThroughThisObject: false,
  });
  PREPARED.set(prepared, {
    adapterState: state,
    emitted,
    binding,
    reservedEvent,
    projection,
    released: false,
  });
  return { prepared, publicProjection: projection };
}

const RELEASE_FIELDS = Object.freeze(["attemptedAt"]);

export function releaseSellerOwnedDurableCapacityEmissionV2(
  prepared, input = {}) {
  const preparedValue = preparedState(prepared);
  exactObject(input, RELEASE_FIELDS, "RELEASE_INPUT");
  const attemptedAt = instant(input.attemptedAt, "ATTEMPTED_AT");
  if (preparedValue.released) fail("PREPARED_CAPABILITY_ALREADY_RELEASED");
  if (Date.parse(attemptedAt)
      < Date.parse(preparedValue.reservedEvent.recordedAt)) {
    fail("RELEASE_TIME_ROLLBACK");
  }
  const attemptedEvent = eventFor(preparedValue.adapterState,
    preparedValue.binding, "SUBMIT_ATTEMPTED", attemptedAt,
    preparedValue.reservedEvent.eventHash);
  const durableAttempt = appendAtCurrentHead(
    preparedValue.adapterState, attemptedEvent);
  if (durableAttempt.idempotentReplay === true) {
    fail("DURABLE_RELEASE_ALREADY_ATTEMPTED_REFUSING_DUPLICATE");
  }
  preparedValue.released = true;
  const v1Projection = preparedValue.emitted.publicProjection;
  const body = {
    schema: OUTSIDER_SELLER_OWNED_DURABLE_ONE_USE_CAPACITY_EMITTER_V2_SCHEMAS
      .release,
    schemaVersion: "2.0.0",
    recordClass: "DURABLE_ATTEMPT_BEFORE_SELLER_SOURCE_BUNDLE_RELEASE",
    adapterHash: preparedValue.adapterState.adapterHash,
    preparationHash: preparedValue.projection.preparationHash,
    tenderHash: preparedValue.binding.manifest.tenderHash,
    oneUseResponseHash: preparedValue.binding.manifest.oneUseResponseHash,
    providerRefHash: preparedValue.binding.manifest.providerRefHash,
    scopeHash: preparedValue.binding.manifest.scopeHash,
    sourceBundleManifestHash:
      preparedValue.binding.manifest.sourceBundleManifestHash,
    witnessChallengeHash: v1Projection.witnessChallenge.witnessChallengeHash,
    capacityReplayVerificationHash:
      v1Projection.capacityReplayVerificationHash,
    durableLedgerHeadHash: durableAttempt.head.headHash,
    durableReleaseAttemptPersistedBeforeBytesReturned: true,
    duplicateReleaseAfterRestartPermitted: false,
    sourceBytesReleased: true,
    sellerDeclarationIsIndependentWitness: false,
    independentWitnessReceiptPresent: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    outcomeEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary:
      OUTSIDER_SELLER_OWNED_DURABLE_ONE_USE_CAPACITY_EMITTER_V2_BOUNDARY,
  };
  const publicProjection = Object.freeze({
    ...body,
    releaseHash: digest(
      OUTSIDER_SELLER_OWNED_DURABLE_ONE_USE_CAPACITY_EMITTER_V2_SCHEMAS
        .release, body),
  });
  const source = preparedValue.emitted.sourceBundle;
  return {
    sourceBundle: {
      semanticsSourceBytes: Buffer.from(source.semanticsSourceBytes),
      standingSourceBytes: Buffer.from(source.standingSourceBytes),
      receiptSourceBytes: Buffer.from(source.receiptSourceBytes),
      lifecycleEventSourceBytes:
        source.lifecycleEventSourceBytes.map((bytes) => Buffer.from(bytes)),
      lifecycleHeadSourceBytes: Buffer.from(source.lifecycleHeadSourceBytes),
    },
    v1PublicProjection: v1Projection,
    publicProjection,
  };
}

