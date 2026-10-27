/*
 * Outcome Formation Engine: generic one-use transaction-surface runtime v1.
 *
 * The core does not know a provider, URL, mailbox, browser, or credential. A
 * source-specific adapter claims one opaque, order-scoped discovery candidate,
 * revalidates the exact contact grant, and performs at most one tender effect.
 * The runtime writes the existing durable one-use effect ledger before calling
 * that adapter and turns exact external source bytes into an occurrence census.
 *
 * This is an execution seam, not a provider registry or an interpretation
 * layer. Delivery and counterparty bytes remain evidence sources; they are not
 * promoted here into acceptance, capacity, price, authority, or outcome truth.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
} from "./outsider-durable-one-use-endpoint-effect-ledger-v1.js";
import { verifyTransactionSurfaceAdapterContractV1 }
  from "./outsider-transaction-surface-adapter-contract-v1.js";

const PREFIX = "OUTSIDER_TRANSACTION_SURFACE_ONE_USE_ROUTE_RUNTIME_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
const LEDGER_ID = /^ledger_[a-f0-9]{32}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const MAX_TENDER_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const MAX_TOTAL_SOURCE_BYTES = 8 * 1024 * 1024;
const MAX_SOURCE_OCCURRENCES = 64;

const ADAPTER_STATES = new WeakMap();
const RESULT_STATES = new WeakMap();

export const OUTSIDER_TRANSACTION_SURFACE_ONE_USE_ROUTE_RUNTIME_V1_SCHEMAS
  = Object.freeze({
    adapterCapability:
      "outsider/transaction-surface-one-use-route-adapter-capability/v1",
    result: "outsider/transaction-surface-one-use-route-result/v1",
    sourceOccurrence:
      "outsider/transaction-surface-one-use-route-source-occurrence/v1",
    privateSources:
      "outsider/transaction-surface-one-use-route-private-sources/v1",
  });

export const OUTSIDER_TRANSACTION_SURFACE_ONE_USE_ROUTE_SOURCE_KINDS_V1
  = Object.freeze([
    "CONTACT_AUTHORITY_REVALIDATION",
    "DELIVERY_RECEIPT",
    "COUNTERPARTY_RESPONSE",
    "RESERVATION_RECEIPT",
    "TRANSPORT_FAILURE_RECEIPT",
  ]);

export const OUTSIDER_TRANSACTION_SURFACE_ONE_USE_ROUTE_RUNTIME_V1_BOUNDARY
  = Object.freeze({
    position: "ORDER_SCOPED_SOURCE_SPECIFIC_TRANSACTION_EXECUTION_HOLD",
    providerRegistryCreated: false,
    providerEnrollmentRequired: false,
    exactAdapterPassedPerInvocation: true,
    sourceSpecificPrivateCandidateClaimRequired: true,
    rawRouteAcceptedByCore: false,
    rawUrlAcceptedByCore: false,
    credentialsAcceptedByCore: false,
    genericBrowserDriverPresent: false,
    exactContactGrantRevalidatedByAdapter: true,
    durableIntentReservedAndAttemptedBeforeAdapterEffect: true,
    maximumAdapterSubmitCallsPerEffect: 1,
    automaticRetryAfterSubmitAttempted: false,
    occurrenceCensusSeparatedFromObjectDedup: true,
    rawSourceBytesProjected: false,
    rawCandidateProjected: false,
    rawRouteProjected: false,
    deliveryReceiptIsAcceptance: false,
    counterpartyResponseIsAutomaticallyAcceptance: false,
    reservationReceiptIsAutomaticallyCapacity: false,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
    outcomeEstablished: false,
    paymentPerformed: false,
    settlementPermitted: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(code);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function identifier(value, code, pattern = ID) {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function byteHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function includes(array, value) {
  return Array.isArray(array) && array.includes(value);
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || Buffer.isBuffer(value)) return value;
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value))) {
    if (Object.hasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}

function contractCapability(record, capability) {
  const declaration = record.capabilityDeclarations.find((item) =>
    item.capability === capability);
  if (declaration === undefined) fail("CONTRACT_CAPABILITY_MISSING");
  return declaration;
}

function sourceKind(value) {
  if (!OUTSIDER_TRANSACTION_SURFACE_ONE_USE_ROUTE_SOURCE_KINDS_V1
    .includes(value)) fail("SOURCE_KIND_INVALID");
  return value;
}

function normalizeOccurrences(value, windowStart, windowEnd, allowedKinds,
  code) {
  if (!Array.isArray(value) || value.length < 1
    || value.length > MAX_SOURCE_OCCURRENCES) fail(`${code}_INVALID`);
  const occurrences = [];
  let totalBytes = 0;
  let priorTime = Date.parse(windowStart);
  for (let index = 0; index < value.length; index += 1) {
    exact(value[index], ["sourceKind", "observedAt", "bytes"],
      `${code}_OCCURRENCE_INVALID`);
    const kind = sourceKind(value[index].sourceKind);
    if (!allowedKinds.includes(kind)) fail(`${code}_SOURCE_KIND_FORBIDDEN`);
    const observedAt = instant(value[index].observedAt,
      `${code}_OBSERVED_AT_INVALID`);
    const observedMs = Date.parse(observedAt);
    if (observedMs < Date.parse(windowStart)
      || observedMs > Date.parse(windowEnd) || observedMs < priorTime) {
      fail(`${code}_OCCURRENCE_TIME_INVALID`);
    }
    if (!Buffer.isBuffer(value[index].bytes)
      || value[index].bytes.length < 1
      || value[index].bytes.length > MAX_SOURCE_BYTES) {
      fail(`${code}_BYTES_INVALID`);
    }
    totalBytes += value[index].bytes.length;
    if (totalBytes > MAX_TOTAL_SOURCE_BYTES) fail(`${code}_BYTES_INVALID`);
    occurrences.push({ sourceKind: kind, observedAt,
      bytes: Buffer.from(value[index].bytes) });
    priorTime = observedMs;
  }
  return occurrences;
}

function publicOccurrenceCensus(occurrences, transactionBindingHash) {
  const publicOccurrences = [];
  const objectHashes = new Set();
  let head = digest(
    "outsider/transaction-surface-one-use-route-source-genesis/v1", {
      transactionBindingHash,
    });
  let totalBytes = 0;
  for (let index = 0; index < occurrences.length; index += 1) {
    const sourceHash = byteHash(occurrences[index].bytes);
    objectHashes.add(sourceHash);
    totalBytes += occurrences[index].bytes.length;
    const body = {
      schema:
        OUTSIDER_TRANSACTION_SURFACE_ONE_USE_ROUTE_RUNTIME_V1_SCHEMAS
          .sourceOccurrence,
      occurrenceIndex: index,
      sourceKind: occurrences[index].sourceKind,
      observedAt: occurrences[index].observedAt,
      sourceByteLength: occurrences[index].bytes.length,
      sourceHash,
      previousOccurrenceHash: head,
      rawSourceBytesProjected: false,
      interpretationEstablished: false,
    };
    const occurrenceHash = digest(body.schema, body);
    publicOccurrences.push({ ...body, occurrenceHash });
    head = occurrenceHash;
  }
  return {
    occurrences: publicOccurrences,
    occurrenceCount: publicOccurrences.length,
    uniqueSourceObjectCount: objectHashes.size,
    repeatedSourceOccurrenceCount:
      publicOccurrences.length - objectHashes.size,
    exactSourceByteCount: totalBytes,
    lifecycleHeadHash: head,
  };
}

function clockInstant(state, code) {
  let value;
  try { value = state.clock(); } catch { fail(`${code}_FAILED`); }
  return instant(value, `${code}_INVALID`);
}

function bindingFor(input, adapter, tenderBodyHash) {
  const body = {
    programHash: hash(input.programHash, "PROGRAM_HASH_INVALID"),
    tenderHash: hash(input.tenderHash, "TENDER_HASH_INVALID"),
    workOrderHash: hash(input.workOrderHash, "WORK_ORDER_HASH_INVALID"),
    typedGraphHash: hash(input.typedGraphHash, "TYPED_GRAPH_HASH_INVALID"),
    requirementKind: identifier(input.requirementKind,
      "REQUIREMENT_KIND_INVALID", /^(?:RESOURCE|RECOVERY|EVIDENCE)$/u),
    requirementId: identifier(input.requirementId, "REQUIREMENT_ID_INVALID"),
    discoveryOccurrenceId: identifier(input.discoveryOccurrenceId,
      "DISCOVERY_OCCURRENCE_ID_INVALID"),
    candidateRefHash: hash(input.candidateRefHash,
      "CANDIDATE_REF_HASH_INVALID"),
    contractHash: adapter.contract.contractHash,
    transportProfileRefHash: adapter.transportProfileRefHash,
    tenderBodyHash,
    authorityGrantHash: hash(input.authorityGrantHash,
      "AUTHORITY_GRANT_HASH_INVALID"),
    effectDeadline: instant(input.effectDeadline,
      "EFFECT_DEADLINE_INVALID"),
  };
  const transactionBindingHash = digest(
    "outsider/transaction-surface-one-use-route-transaction-binding/v1", body);
  const endpointBindingHash = digest(
    "outsider/transaction-surface-one-use-route-endpoint-binding/v1", {
      candidateRefHash: body.candidateRefHash,
      contractHash: body.contractHash,
      transportProfileRefHash: body.transportProfileRefHash,
    });
  const oneUseNonceHash = digest(
    "outsider/transaction-surface-one-use-route-nonce/v1", {
      transactionBindingHash,
    });
  const idempotencyKey = `outsider-surface-${digest(
    "outsider/transaction-surface-one-use-route-idempotency/v1", {
      transactionBindingHash,
    }).slice(7)}`;
  const idempotencyKeyHash = digest(
    "outsider/transaction-surface-one-use-route-idempotency-key/v1",
    idempotencyKey);
  const effectIdHash = digest(
    "outsider/transaction-surface-one-use-route-effect/v1", {
      transactionBindingHash, endpointBindingHash,
    });
  return { body, transactionBindingHash, endpointBindingHash,
    oneUseNonceHash, idempotencyKey, idempotencyKeyHash, effectIdHash };
}

function event(binding, state, ledger, eventType, recordedAt,
  previousEffectEventHash, evidenceHash = null) {
  const terminal = eventType === "REVOKED_BEFORE_SUBMIT"
    || eventType === "EXPIRED_BEFORE_SUBMIT"
    || eventType === "AMBIGUOUS_NO_RETRY_HOLD";
  return createDurableOneUseEndpointEffectEventV1({
    ledgerId: ledger.ledgerId,
    eventType,
    effectIdHash: binding.effectIdHash,
    transactionBindingHash: binding.transactionBindingHash,
    endpointBindingHash: binding.endpointBindingHash,
    adapterInstanceRefHash: state.adapterInstanceRefHash,
    permissionGrantHash: binding.body.authorityGrantHash,
    oneUseNonceHash: binding.oneUseNonceHash,
    idempotencyKeyHash: binding.idempotencyKeyHash,
    bodyHash: binding.body.tenderBodyHash,
    effectDeadline: binding.body.effectDeadline,
    recordedAt,
    previousEffectEventHash,
    occurrenceNonceHash: digest(
      "outsider/transaction-surface-one-use-route-ledger-occurrence/v1", {
        transactionBindingHash: binding.transactionBindingHash,
        eventType,
      }),
    endpointReceiptHash: eventType === "ENDPOINT_RECEIPT_OBSERVED"
      ? evidenceHash : null,
    terminalEvidenceHash: terminal ? evidenceHash : null,
  });
}

function appendEvent(ledger, verification, nextEvent) {
  return appendDurableOneUseEndpointEffectLedgerV1({
    directory: ledger.directory,
    ledgerId: ledger.ledgerId,
    event: nextEvent,
    expectedLocalHeadHash: verification.head.headHash,
  });
}

function projectResult(adapter, binding, ledgerVerification, occurrences,
  state, counts) {
  const census = publicOccurrenceCensus(occurrences,
    binding.transactionBindingHash);
  const kinds = new Set(occurrences.map((item) => item.sourceKind));
  const body = {
    schema:
      OUTSIDER_TRANSACTION_SURFACE_ONE_USE_ROUTE_RUNTIME_V1_SCHEMAS.result,
    schemaVersion: "1.0.0",
    recordClass: "ORDER_SCOPED_TRANSACTION_SURFACE_ONE_USE_ROUTE",
    programHash: binding.body.programHash,
    tenderHash: binding.body.tenderHash,
    workOrderHash: binding.body.workOrderHash,
    typedGraphHash: binding.body.typedGraphHash,
    requirementKind: binding.body.requirementKind,
    requirementId: binding.body.requirementId,
    discoveryOccurrenceId: binding.body.discoveryOccurrenceId,
    candidateRefHash: binding.body.candidateRefHash,
    adapterContractHash: adapter.contract.contractHash,
    adapterImplementationHash:
      adapter.contract.adapterClosure.adapterImplementationHash,
    transportProfileRefHash: adapter.transportProfileRefHash,
    transportFamily: adapter.transportFamily,
    transactionBindingHash: binding.transactionBindingHash,
    endpointBindingHash: binding.endpointBindingHash,
    tenderBodyHash: binding.body.tenderBodyHash,
    authorityGrantHash: binding.body.authorityGrantHash,
    oneUseNonceHash: binding.oneUseNonceHash,
    idempotencyKeyHash: binding.idempotencyKeyHash,
    effectIdHash: binding.effectIdHash,
    effectDeadline: binding.body.effectDeadline,
    state,
    adapterCandidateClaimCount: counts.claim,
    adapterAuthorityRevalidationCallCount: counts.authorize,
    adapterSubmitCallCount: counts.submit,
    durableEffectOccurrenceCount:
      ledgerVerification.head.exactOccurrenceCount,
    durableEffectLedgerHeadHash: ledgerVerification.head.headHash,
    sourceOccurrenceCount: census.occurrenceCount,
    uniqueSourceObjectCount: census.uniqueSourceObjectCount,
    repeatedSourceOccurrenceCount: census.repeatedSourceOccurrenceCount,
    exactSourceByteCount: census.exactSourceByteCount,
    sourceLifecycleHeadHash: census.lifecycleHeadHash,
    sourceOccurrences: census.occurrences,
    contactAuthorityRevalidationSourceObserved:
      kinds.has("CONTACT_AUTHORITY_REVALIDATION"),
    deliveryReceiptObserved: kinds.has("DELIVERY_RECEIPT"),
    counterpartyResponseObserved: kinds.has("COUNTERPARTY_RESPONSE"),
    reservationReceiptObserved: kinds.has("RESERVATION_RECEIPT"),
    transportFailureReceiptObserved: kinds.has("TRANSPORT_FAILURE_RECEIPT"),
    sourceSpecificAdapterInvoked: true,
    exactAdapterPassedPerInvocation: true,
    providerRegistryCreated: false,
    providerEnrollmentRequired: false,
    rawCandidateProjected: false,
    rawRouteProjected: false,
    rawSourceBytesProjected: false,
    credentialsProjected: false,
    contactAuthorityDecisionIsResourceOwnerAuthority: false,
    deliveryReceiptIsAcceptance: false,
    counterpartyResponseRequiresSeparateSemanticReplay: true,
    reservationReceiptRequiresSeparateCapacityReplay: true,
    providerAcceptanceEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    outcomeEstablished: false,
    paymentPerformed: false,
    settlementPermitted: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
    boundary:
      OUTSIDER_TRANSACTION_SURFACE_ONE_USE_ROUTE_RUNTIME_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, routeRuntimeHash: digest(body.schema, body) });
}

function storeResult(publicProjection, privateState) {
  const result = Object.freeze({ publicProjection });
  RESULT_STATES.set(result, { consumed: false, ...privateState });
  return result;
}

/**
 * Bind one exact source-specific implementation to one verified transport
 * profile. The capability is passed directly to a run; it is never registered.
 */
export function createTransactionSurfaceOneUseRouteAdapterV1(input = {}) {
  exact(input, ["contractRecord", "contractSource", "expectedSourceHash",
    "expectedContractHash", "transportProfileRefHash", "clock",
    "claimCandidate", "revalidateExact", "submitExact"], "INPUT_INVALID");
  hash(input.expectedSourceHash, "EXPECTED_SOURCE_HASH_INVALID");
  hash(input.expectedContractHash, "EXPECTED_CONTRACT_HASH_INVALID");
  hash(input.transportProfileRefHash, "TRANSPORT_PROFILE_REF_HASH_INVALID");
  for (const field of ["clock", "claimCandidate", "revalidateExact",
    "submitExact"]) {
    if (typeof input[field] !== "function") fail(`${field.toUpperCase()}_INVALID`);
  }
  const verification = verifyTransactionSurfaceAdapterContractV1(
    input.contractRecord, {
      source: input.contractSource,
      expectedSourceHash: input.expectedSourceHash,
      expectedContractHash: input.expectedContractHash,
    });
  if (!verification.ok
    || input.contractRecord.contractHash !== input.expectedContractHash) {
    fail("CONTRACT_REPLAY_FAILED");
  }
  const profile = input.contractRecord.supportedTransportProfiles.find((item) =>
    item.transportProfileRefHash === input.transportProfileRefHash);
  if (profile === undefined) fail("TRANSPORT_PROFILE_NOT_IN_CONTRACT");
  const tenderDelivery = contractCapability(input.contractRecord,
    "ONE_USE_TENDER_DELIVERY");
  if (!tenderDelivery.supported
    || !includes(tenderDelivery.transportProfileRefHashes,
      input.transportProfileRefHash)
    || tenderDelivery.maximumSideEffectsPerTender !== 1) {
    fail("ONE_USE_TENDER_DELIVERY_NOT_SUPPORTED_BY_PROFILE");
  }
  const responseObservation = contractCapability(input.contractRecord,
    "STRICT_RESPONSE_OBSERVATION");
  hash(input.contractSource.privateAdapterInstanceRefHash,
    "ADAPTER_INSTANCE_REF_HASH_INVALID");
  const capability = deepFreeze({
    schema:
      OUTSIDER_TRANSACTION_SURFACE_ONE_USE_ROUTE_RUNTIME_V1_SCHEMAS
        .adapterCapability,
    schemaVersion: "1.0.0",
    contractHash: input.contractRecord.contractHash,
    adapterImplementationHash:
      input.contractRecord.adapterClosure.adapterImplementationHash,
    transportProfileRefHash: input.transportProfileRefHash,
    transportFamily: profile.transportFamily,
    strictResponseObservationSupported: responseObservation.supported
      && includes(responseObservation.transportProfileRefHashes,
        input.transportProfileRefHash),
    oneUseTenderDeliverySupported: true,
    providerRegistryEntry: false,
    rawRouteProjected: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
  ADAPTER_STATES.set(capability, {
    contract: input.contractRecord,
    transportProfileRefHash: input.transportProfileRefHash,
    transportFamily: profile.transportFamily,
    strictResponseObservationSupported:
      capability.strictResponseObservationSupported,
    adapterInstanceRefHash:
      input.contractSource.privateAdapterInstanceRefHash,
    clock: input.clock,
    claimCandidate: input.claimCandidate,
    revalidateExact: input.revalidateExact,
    submitExact: input.submitExact,
  });
  return capability;
}

/** Drive one exact candidate through one source-specific transaction adapter. */
export async function driveTransactionSurfaceOneUseTenderRouteV1(
  capability, input = {}) {
  const adapter = ADAPTER_STATES.get(capability);
  if (adapter === undefined) fail("ADAPTER_NOT_FACTORY_ISSUED");
  exact(input, ["candidateLease", "candidateRefHash", "programHash",
    "tenderHash", "workOrderHash", "typedGraphHash", "requirementKind",
    "requirementId", "discoveryOccurrenceId", "tenderBytes",
    "authorityGrantHash", "effectDeadline", "expectedContractHash",
    "expectedTransportProfileRefHash", "ledger"], "DRIVE_INPUT_INVALID");
  exact(input.ledger, ["directory", "ledgerId"], "LEDGER_INPUT_INVALID");
  if (typeof input.ledger.directory !== "string"
    || input.ledger.directory.length < 1) fail("LEDGER_DIRECTORY_INVALID");
  identifier(input.ledger.ledgerId, "LEDGER_ID_INVALID", LEDGER_ID);
  if (input.expectedContractHash !== adapter.contract.contractHash
    || input.expectedTransportProfileRefHash
      !== adapter.transportProfileRefHash) fail("ADAPTER_PIN_MISMATCH");
  if (!Buffer.isBuffer(input.tenderBytes) || input.tenderBytes.length < 1
    || input.tenderBytes.length > MAX_TENDER_BYTES) fail("TENDER_BYTES_INVALID");
  const tenderBytes = Buffer.from(input.tenderBytes);
  const tenderBodyHash = byteHash(tenderBytes);
  const binding = bindingFor(input, adapter, tenderBodyHash);
  const counts = { claim: 0, authorize: 0, submit: 0 };
  let claim;
  try {
    counts.claim += 1;
    claim = await adapter.claimCandidate(input.candidateLease, deepFreeze({
      candidateRefHash: binding.body.candidateRefHash,
      transactionBindingHash: binding.transactionBindingHash,
      effectDeadline: binding.body.effectDeadline,
    }));
  } catch { tenderBytes.fill(0); fail("CANDIDATE_CLAIM_FAILED"); }
  exact(claim, ["candidateRefHash", "expiresAt", "route"],
    "CANDIDATE_CLAIM_RESULT_INVALID");
  if (claim.candidateRefHash !== binding.body.candidateRefHash
    || claim.route === null || typeof claim.route !== "object") {
    tenderBytes.fill(0); fail("CANDIDATE_CLAIM_BINDING_INVALID");
  }
  const candidateExpiresAt = instant(claim.expiresAt,
    "CANDIDATE_EXPIRES_AT_INVALID");
  if (Date.parse(candidateExpiresAt) < Date.parse(binding.body.effectDeadline)) {
    tenderBytes.fill(0); fail("CANDIDATE_EXPIRES_BEFORE_EFFECT_DEADLINE");
  }

  const admittedAt = clockInstant(adapter, "ADMITTED_AT");
  if (Date.parse(admittedAt) >= Date.parse(binding.body.effectDeadline)) {
    tenderBytes.fill(0); fail("EFFECT_DEADLINE_ALREADY_REACHED");
  }
  const intent = event(binding, adapter, input.ledger, "INTENT_ADMITTED",
    admittedAt, null);
  let ledgerVerification = initializeDurableOneUseEndpointEffectLedgerV1({
    directory: input.ledger.directory,
    ledgerId: input.ledger.ledgerId,
    genesisEvent: intent,
  });

  let authorization;
  try {
    counts.authorize += 1;
    authorization = await adapter.revalidateExact({
      route: claim.route,
      transactionBindingHash: binding.transactionBindingHash,
      authorityGrantHash: binding.body.authorityGrantHash,
      effectDeadline: binding.body.effectDeadline,
    });
  } catch { tenderBytes.fill(0); fail("CONTACT_AUTHORITY_REVALIDATION_FAILED"); }
  exact(authorization, ["transactionBindingHash", "decision", "evaluatedAt",
    "validUntil", "sourceOccurrences"], "AUTHORIZATION_RESULT_INVALID");
  if (authorization.transactionBindingHash !== binding.transactionBindingHash
    || !["AUTHORIZED", "REVOKED"].includes(authorization.decision)) {
    tenderBytes.fill(0); fail("AUTHORIZATION_BINDING_INVALID");
  }
  const evaluatedAt = instant(authorization.evaluatedAt,
    "AUTHORIZATION_EVALUATED_AT_INVALID");
  const authOccurrences = normalizeOccurrences(authorization.sourceOccurrences,
    admittedAt, evaluatedAt, ["CONTACT_AUTHORITY_REVALIDATION"],
    "AUTHORIZATION_SOURCES");
  const authorizationEvidenceHash = publicOccurrenceCensus(authOccurrences,
    binding.transactionBindingHash).lifecycleHeadHash;
  const terminalAt = clockInstant(adapter, "AUTHORIZATION_TERMINAL_AT");
  if (Date.parse(terminalAt) < Date.parse(evaluatedAt)) {
    tenderBytes.fill(0); fail("CLOCK_MOVED_BACKWARDS");
  }
  if (authorization.decision !== "AUTHORIZED") {
    if (authorization.validUntil !== null) {
      tenderBytes.fill(0); fail("AUTHORIZATION_VALID_UNTIL_INVALID");
    }
    const terminalEvent = event(binding, adapter, input.ledger,
      "REVOKED_BEFORE_SUBMIT", terminalAt, intent.eventHash,
      authorizationEvidenceHash);
    ledgerVerification = appendEvent(input.ledger, ledgerVerification,
      terminalEvent);
    tenderBytes.fill(0);
    const state = "REVOKED_BEFORE_EFFECT";
    const projection = projectResult(adapter, binding, ledgerVerification,
      authOccurrences, state, counts);
    return storeResult(projection, { occurrences: authOccurrences,
      transactionBindingHash: binding.transactionBindingHash });
  }
  const validUntil = instant(authorization.validUntil,
    "AUTHORIZATION_VALID_UNTIL_INVALID");
  if (Date.parse(validUntil) <= Date.parse(evaluatedAt)) {
    tenderBytes.fill(0); fail("AUTHORIZATION_NOT_CURRENT");
  }
  if (Date.parse(terminalAt) >= Date.parse(binding.body.effectDeadline)) {
    const expired = event(binding, adapter, input.ledger,
      "EXPIRED_BEFORE_SUBMIT", terminalAt, intent.eventHash,
      authorizationEvidenceHash);
    ledgerVerification = appendEvent(input.ledger, ledgerVerification, expired);
    tenderBytes.fill(0);
    const projection = projectResult(adapter, binding, ledgerVerification,
      authOccurrences, "EXPIRED_BEFORE_EFFECT", counts);
    return storeResult(projection, { occurrences: authOccurrences,
      transactionBindingHash: binding.transactionBindingHash });
  }

  const reserved = event(binding, adapter, input.ledger, "SUBMIT_RESERVED",
    terminalAt, intent.eventHash);
  ledgerVerification = appendEvent(input.ledger, ledgerVerification, reserved);
  const attemptedAt = clockInstant(adapter, "ATTEMPTED_AT");
  if (Date.parse(attemptedAt) < Date.parse(terminalAt)
    || Date.parse(attemptedAt) >= Date.parse(binding.body.effectDeadline)) {
    tenderBytes.fill(0); fail("ATTEMPT_TIME_INVALID");
  }
  if (Date.parse(validUntil) <= Date.parse(attemptedAt)) {
    const noLongerCurrent = event(binding, adapter, input.ledger,
      "REVOKED_BEFORE_SUBMIT", attemptedAt, reserved.eventHash,
      authorizationEvidenceHash);
    ledgerVerification = appendEvent(input.ledger, ledgerVerification,
      noLongerCurrent);
    tenderBytes.fill(0);
    const projection = projectResult(adapter, binding, ledgerVerification,
      authOccurrences, "CONTACT_AUTHORITY_NOT_CURRENT_BEFORE_EFFECT", counts);
    return storeResult(projection, { occurrences: authOccurrences,
      transactionBindingHash: binding.transactionBindingHash });
  }
  const attempted = event(binding, adapter, input.ledger, "SUBMIT_ATTEMPTED",
    attemptedAt, reserved.eventHash);
  ledgerVerification = appendEvent(input.ledger, ledgerVerification, attempted);

  let submitted;
  let submitOccurrences = [];
  let completedAt = null;
  let submitFailed = false;
  try {
    counts.submit += 1;
    submitted = await adapter.submitExact({
      route: claim.route,
      tenderBytes,
      tenderBodyHash,
      transactionBindingHash: binding.transactionBindingHash,
      authorityGrantHash: binding.body.authorityGrantHash,
      effectDeadline: binding.body.effectDeadline,
      idempotencyKey: binding.idempotencyKey,
      oneUseNonceHash: binding.oneUseNonceHash,
    });
  } catch {
    submitFailed = true;
  } finally {
    tenderBytes.fill(0);
  }
  if (!submitFailed) {
    try {
      exact(submitted, ["transactionBindingHash", "completedAt",
        "attemptedEffectCount", "sourceOccurrences"],
      "SUBMIT_RESULT_INVALID");
      if (submitted.transactionBindingHash !== binding.transactionBindingHash
        || submitted.attemptedEffectCount !== 1) {
        fail("SUBMIT_BINDING_INVALID");
      }
      completedAt = instant(submitted.completedAt,
        "SUBMIT_COMPLETED_AT_INVALID");
      if (Date.parse(completedAt) < Date.parse(attemptedAt)) {
        fail("SUBMIT_COMPLETED_AT_INVALID");
      }
      submitOccurrences = normalizeOccurrences(submitted.sourceOccurrences,
        attemptedAt, completedAt,
        ["DELIVERY_RECEIPT", "COUNTERPARTY_RESPONSE",
          "RESERVATION_RECEIPT", "TRANSPORT_FAILURE_RECEIPT"],
        "SUBMIT_SOURCES");
      if (!submitOccurrences.some((item) =>
        item.sourceKind === "DELIVERY_RECEIPT"
        || item.sourceKind === "COUNTERPARTY_RESPONSE"
        || item.sourceKind === "RESERVATION_RECEIPT")) {
        fail("EXTERNAL_RECEIPT_SOURCE_REQUIRED");
      }
      if (!adapter.strictResponseObservationSupported
        && submitOccurrences.some((item) =>
          item.sourceKind === "COUNTERPARTY_RESPONSE")) {
        fail("STRICT_RESPONSE_OBSERVATION_NOT_SUPPORTED");
      }
    } catch {
      submitFailed = true;
    }
  }
  if (!submitFailed) {
    const allOccurrences = [...authOccurrences, ...submitOccurrences];
    const sourceCensus = publicOccurrenceCensus(allOccurrences,
      binding.transactionBindingHash);
    const receivedAt = clockInstant(adapter, "RECEIVED_AT");
    if (Date.parse(receivedAt) < Date.parse(completedAt)) {
      fail("CLOCK_MOVED_BACKWARDS");
    }
    const receipt = event(binding, adapter, input.ledger,
      "ENDPOINT_RECEIPT_OBSERVED", receivedAt, attempted.eventHash,
      sourceCensus.lifecycleHeadHash);
    ledgerVerification = appendEvent(input.ledger, ledgerVerification, receipt);
    const projection = projectResult(adapter, binding, ledgerVerification,
      allOccurrences, "SOURCE_RECEIPTS_OBSERVED_HOLD", counts);
    return storeResult(projection, { occurrences: allOccurrences,
      transactionBindingHash: binding.transactionBindingHash });
  }
  {
    const failedAt = clockInstant(adapter, "AMBIGUOUS_AT");
    if (Date.parse(failedAt) < Date.parse(attemptedAt)
      || (completedAt !== null
        && Date.parse(failedAt) < Date.parse(completedAt))) {
      fail("AMBIGUOUS_TIME_INVALID");
    }
    const failureBytes = Buffer.from(canonicalizeStrict({
      schema: "outsider/transaction-surface-submit-failure-receipt/v1",
      transactionBindingHash: binding.transactionBindingHash,
      disposition: "AMBIGUOUS_AFTER_DURABLE_SUBMIT_ATTEMPT_NO_RETRY",
    }), "utf8");
    const failureOccurrence = { sourceKind: "TRANSPORT_FAILURE_RECEIPT",
      observedAt: failedAt, bytes: failureBytes };
    const allOccurrences = [...authOccurrences, ...submitOccurrences,
      failureOccurrence];
    const sourceCensus = publicOccurrenceCensus(allOccurrences,
      binding.transactionBindingHash);
    const ambiguous = event(binding, adapter, input.ledger,
      "AMBIGUOUS_NO_RETRY_HOLD", failedAt, attempted.eventHash,
      sourceCensus.lifecycleHeadHash);
    ledgerVerification = appendEvent(input.ledger, ledgerVerification,
      ambiguous);
    const projection = projectResult(adapter, binding, ledgerVerification,
      allOccurrences, "AMBIGUOUS_NO_RETRY_HOLD", counts);
    return storeResult(projection, { occurrences: allOccurrences,
      transactionBindingHash: binding.transactionBindingHash });
  }
}

/** Claim exact source bytes once for source-specific semantic/lifecycle replay. */
export function claimTransactionSurfaceOneUseRouteSourcesV1(result) {
  const state = RESULT_STATES.get(result);
  if (state === undefined || state.consumed) {
    fail("PRIVATE_RESULT_INVALID_OR_REPLAYED");
  }
  state.consumed = true;
  return Object.freeze({
    schema:
      OUTSIDER_TRANSACTION_SURFACE_ONE_USE_ROUTE_RUNTIME_V1_SCHEMAS
        .privateSources,
    schemaVersion: "1.0.0",
    transactionBindingHash: state.transactionBindingHash,
    sourceOccurrences: state.occurrences.map((item, occurrenceIndex) => ({
      occurrenceIndex,
      sourceKind: item.sourceKind,
      observedAt: item.observedAt,
      bytes: Buffer.from(item.bytes),
    })),
    occurrenceCensusSeparatedFromObjectDedup: true,
    interpretationPerformed: false,
  });
}
