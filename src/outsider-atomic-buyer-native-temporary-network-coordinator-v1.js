/*
 * Atomic buyer-native temporary-network coordinator v1.
 *
 * Three account-local routes are composed per outcome: PRIMARY, RECOVERY and
 * INDEPENDENT_WITNESS. Preparation performs provider-native quote/readiness
 * work only. A separate principal approval is required before reserve/commit.
 * CART_READY is deliberately not HOLD or RESERVED. Only three exact RESERVED
 * route states permit the PRIMARY commit call. An explicit PRIMARY failure is
 * the only transition that may activate the already-reserved RECOVERY route.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, openSync, readFileSync,
  statSync, writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import {
  createBuyerNativeTransactionRouteRuntimeV1,
} from "./outsider-buyer-native-transaction-capability-v1.js";

const PREFIX = "OUTSIDER_ATOMIC_BUYER_NATIVE_TEMPORARY_NETWORK_COORDINATOR_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const NETWORK_ID = /^network_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const AMOUNT = /^(?:0|[1-9]\d{0,30})$/u;
const MAX_REQUEST_BYTES = 1024 * 1024;

const AUTHORITIES = new WeakMap();
const APPROVALS = new WeakMap();
const COORDINATORS = new WeakMap();

export const OUTSIDER_ATOMIC_BUYER_NATIVE_TEMPORARY_NETWORK_COORDINATOR_V1_SCHEMAS
  = Object.freeze({
    authority: "outsider/current-user-transaction-authority/v1",
    paymentApproval: "outsider/principal-payment-and-loss-authorization/v1",
    approvalMarker:
      "outsider/atomic-buyer-native-network-principal-approval-marker/v1",
    coordinator:
      "outsider/atomic-buyer-native-temporary-network-coordinator/v1",
    preparation:
      "outsider/atomic-buyer-native-network-preparation-result/v1",
    commitResult:
      "outsider/atomic-buyer-native-network-commit-result/v1",
  });

export const OUTSIDER_ATOMIC_BUYER_NATIVE_TEMPORARY_NETWORK_COORDINATOR_V1_STATES
  = Object.freeze([
    "READY_FOR_PRINCIPAL_PAYMENT_APPROVAL",
    "NEEDS_ADDRESS_AND_PAYMENT",
    "UNAVAILABLE",
    "PARTIAL_RESERVE_CANCELLED",
    "PARTIAL_RESERVE_CANCEL_AMBIGUOUS_HOLD",
    "PRIMARY_COMMIT_AMBIGUOUS_HOLD",
    "PRIMARY_COMMITTED_STATUS_HOLD",
    "PRIMARY_SOURCE_DECLARED_FULFILLED_AWAITING_INDEPENDENT_WITNESS",
    "RECOVERY_ACTIVE",
    "RECOVERY_SOURCE_DECLARED_FULFILLED_AWAITING_INDEPENDENT_WITNESS",
  ]);

export const OUTSIDER_ATOMIC_BUYER_NATIVE_TEMPORARY_NETWORK_COORDINATOR_V1_BOUNDARY
  = Object.freeze({
    position: "ATOMIC_BUYER_NATIVE_THREE_SLOT_TEMPORARY_NETWORK",
    requiredSlots: Object.freeze([
      "PRIMARY", "RECOVERY", "INDEPENDENT_WITNESS",
    ]),
    providerRegistryRequired: false,
    accountLocalCapabilitiesInjected: true,
    preparationEffects: Object.freeze(["QUOTE", "OPTIONAL_CART", "STATUS"]),
    preparationCallsCommit: false,
    principalPaymentApprovalRequired: true,
    maximumLossAuthorizationRequired: true,
    deliveryAddressAuthorizationRequired: true,
    paymentMethodAuthorizationRequired: true,
    allThreeReservationStatesRequiredBeforePrimaryCommit: true,
    cartReadyCountsAsHold: false,
    cartReadyCountsAsReservation: false,
    cartReadyCountsAsCommit: false,
    partialReservationCompensatedWithCancel: true,
    recoveryPreReserved: true,
    recoveryRequiresExplicitPrimaryFailureOccurrence: true,
    providerSourceStateEstablishesIndependentOutcome: false,
    independentWitnessObservationStillRequiredForOutcome: true,
    userResultCommittedByThisCoordinator: false,
    internalHumanFallbackPermitted: false,
    paymentPerformedByCoordinator: false,
    injectedAuthorityFactoryMintsLegalAuthority: false,
    currentAuthorityMustRevalidateBeforeEveryCoordinatorEntry: true,
    authority: "CURRENT_USER_TRANSACTION_AUTHORITY_ONLY",
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
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
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function assertDeepFrozen(value, seen = new Set()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  if (!Object.isFrozen(value)) fail("ARTIFACT_NOT_DEEPLY_FROZEN");
  seen.add(value);
  for (const item of Object.values(value)) assertDeepFrozen(item, seen);
}

export function pinAtomicBuyerNativeFrozenArtifactV1(kind, value) {
  if (kind !== "OUTCOME" && kind !== "TENDER") fail("ARTIFACT_KIND_INVALID");
  assertDeepFrozen(value);
  canonicalizeStrict(value);
  return digest(`outsider/atomic-buyer-native-frozen-${kind.toLowerCase()}/v1`,
    value);
}

function validateMoney(value, code) {
  if (typeof value !== "string" || !AMOUNT.test(value)) fail(`${code}_INVALID`);
  return value;
}

/** Account-local proof that this principal currently permits formation I/O. */
export function issueCurrentUserTransactionAuthorityV1(input = {},
  dependencies = {}) {
  exact(input, ["authorityRefHash", "principalEpochRefHash", "outcomeHash",
    "tenderHash", "issuedAt", "expiresAt"], "AUTHORITY_INPUT");
  exact(dependencies, ["revalidateImpl"], "AUTHORITY_DEPENDENCIES");
  if (typeof dependencies.revalidateImpl !== "function") {
    fail("AUTHORITY_REVALIDATE_IMPL_INVALID");
  }
  const issuedAt = instant(input.issuedAt, "AUTHORITY_ISSUED_AT");
  const expiresAt = instant(input.expiresAt, "AUTHORITY_EXPIRES_AT");
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) fail("AUTHORITY_INTERVAL_INVALID");
  const body = {
    schema:
      OUTSIDER_ATOMIC_BUYER_NATIVE_TEMPORARY_NETWORK_COORDINATOR_V1_SCHEMAS
        .authority,
    schemaVersion: "1.0.0",
    authorityRefHash: hash(input.authorityRefHash, "AUTHORITY_REF_HASH"),
    principalEpochRefHash: hash(input.principalEpochRefHash,
      "PRINCIPAL_EPOCH_REF_HASH"),
    outcomeHash: hash(input.outcomeHash, "AUTHORITY_OUTCOME_HASH"),
    tenderHash: hash(input.tenderHash, "AUTHORITY_TENDER_HASH"),
    issuedAt,
    expiresAt,
    formationOperationsAuthorized: true,
    commitWithoutSeparatePaymentAuthorization: false,
    ambientCredentialsAccepted: false,
  };
  const authority = Object.freeze({ ...body,
    authorityBindingHash: digest(body.schema, body) });
  AUTHORITIES.set(authority, dependencies.revalidateImpl);
  return authority;
}

/** One explicit approval for address, payment ceiling and maximum loss. */
export function issuePrincipalPaymentAndLossAuthorizationV1(input = {}) {
  exact(input, ["approvalRefHash", "transactionAuthorityRefHash",
    "principalEpochRefHash", "outcomeHash", "tenderHash", "currency",
    "authorizedAmountMinor", "maximumLossMinor", "deliveryAddressRefHash",
    "paymentMethodRefHash", "issuedAt", "expiresAt", "paymentAuthorized"],
  "PAYMENT_APPROVAL_INPUT");
  if (input.paymentAuthorized !== true) fail("PAYMENT_NOT_AUTHORIZED");
  if (typeof input.currency !== "string" || !CURRENCY.test(input.currency)) {
    fail("PAYMENT_CURRENCY_INVALID");
  }
  const issuedAt = instant(input.issuedAt, "PAYMENT_APPROVAL_ISSUED_AT");
  const expiresAt = instant(input.expiresAt, "PAYMENT_APPROVAL_EXPIRES_AT");
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) fail("PAYMENT_APPROVAL_INTERVAL_INVALID");
  const body = {
    schema:
      OUTSIDER_ATOMIC_BUYER_NATIVE_TEMPORARY_NETWORK_COORDINATOR_V1_SCHEMAS
        .paymentApproval,
    schemaVersion: "1.0.0",
    approvalRefHash: hash(input.approvalRefHash, "APPROVAL_REF_HASH"),
    transactionAuthorityRefHash: hash(input.transactionAuthorityRefHash,
      "APPROVAL_TRANSACTION_AUTHORITY_REF_HASH"),
    principalEpochRefHash: hash(input.principalEpochRefHash,
      "APPROVAL_PRINCIPAL_EPOCH_REF_HASH"),
    outcomeHash: hash(input.outcomeHash, "APPROVAL_OUTCOME_HASH"),
    tenderHash: hash(input.tenderHash, "APPROVAL_TENDER_HASH"),
    currency: input.currency,
    authorizedAmountMinor: validateMoney(input.authorizedAmountMinor,
      "AUTHORIZED_AMOUNT_MINOR"),
    maximumLossMinor: validateMoney(input.maximumLossMinor,
      "AUTHORIZED_MAXIMUM_LOSS_MINOR"),
    deliveryAddressRefHash: hash(input.deliveryAddressRefHash,
      "DELIVERY_ADDRESS_REF_HASH"),
    paymentMethodRefHash: hash(input.paymentMethodRefHash,
      "PAYMENT_METHOD_REF_HASH"),
    issuedAt,
    expiresAt,
    paymentAuthorized: true,
    recoveryWithinMaximumLossAuthorized: true,
    credentialMaterialProjected: false,
  };
  const approval = Object.freeze({ ...body,
    approvalBindingHash: digest(body.schema, body) });
  APPROVALS.set(approval, { consumed: false });
  return approval;
}

function cloneBytes(value, code, nullable = false) {
  if (nullable && value === null) return null;
  if (!Buffer.isBuffer(value) || value.length < 1
    || value.length > MAX_REQUEST_BYTES) fail(`${code}_INVALID`);
  return Buffer.from(value);
}

function routePlan(value, role) {
  exact(value, ["quoteBytes", "holdBytes", "readinessStatusBytes",
    "reserveBytes", "commitBytes", "executionStatusBytes", "cancelBytes",
    "recoverBytes"], `${role}_ROUTE_PLAN`);
  const plan = {
    quoteBytes: cloneBytes(value.quoteBytes, `${role}_QUOTE_BYTES`),
    holdBytes: cloneBytes(value.holdBytes, `${role}_HOLD_BYTES`, true),
    readinessStatusBytes: cloneBytes(value.readinessStatusBytes,
      `${role}_READINESS_STATUS_BYTES`),
    reserveBytes: cloneBytes(value.reserveBytes, `${role}_RESERVE_BYTES`),
    commitBytes: cloneBytes(value.commitBytes, `${role}_COMMIT_BYTES`, true),
    executionStatusBytes: cloneBytes(value.executionStatusBytes,
      `${role}_EXECUTION_STATUS_BYTES`, true),
    cancelBytes: cloneBytes(value.cancelBytes, `${role}_CANCEL_BYTES`),
    recoverBytes: cloneBytes(value.recoverBytes, `${role}_RECOVER_BYTES`, true),
  };
  if (role === "PRIMARY"
    && (plan.commitBytes === null || plan.executionStatusBytes === null
      || plan.recoverBytes !== null)) fail("PRIMARY_ROUTE_PLAN_INVALID");
  if (role === "RECOVERY"
    && (plan.recoverBytes === null || plan.executionStatusBytes === null
      || plan.commitBytes !== null)) fail("RECOVERY_ROUTE_PLAN_INVALID");
  if (role === "INDEPENDENT_WITNESS"
    && (plan.commitBytes !== null || plan.executionStatusBytes !== null
      || plan.recoverBytes !== null)) fail("WITNESS_ROUTE_PLAN_INVALID");
  return Object.freeze(plan);
}

function ensurePrivateDirectory(directory) {
  const info = statSync(directory);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) {
    fail("JOURNAL_DIRECTORY_NOT_PRIVATE");
  }
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function markerPath(state) {
  return path.join(state.journalDirectory,
    `${state.networkId}.principal-approval.json`);
}

function approvalMarker(state, approval) {
  const body = {
    schema:
      OUTSIDER_ATOMIC_BUYER_NATIVE_TEMPORARY_NETWORK_COORDINATOR_V1_SCHEMAS
        .approvalMarker,
    schemaVersion: "1.0.0",
    networkId: state.networkId,
    outcomeHash: state.outcomeHash,
    tenderHash: state.tenderHash,
    transactionAuthorityRefHash: state.authority.authorityRefHash,
    approvalRefHash: approval.approvalRefHash,
    approvalBindingHash: approval.approvalBindingHash,
    currency: approval.currency,
    authorizedAmountMinor: approval.authorizedAmountMinor,
    maximumLossMinor: approval.maximumLossMinor,
    deliveryAddressRefHash: approval.deliveryAddressRefHash,
    paymentMethodRefHash: approval.paymentMethodRefHash,
  };
  return { ...body, markerHash: digest(body.schema, body) };
}

function persistOrReplayApproval(state, approval) {
  const expected = approvalMarker(state, approval);
  const target = markerPath(state);
  if (existsSync(target)) {
    const info = statSync(target);
    if (!info.isFile() || (info.mode & 0o077) !== 0) fail("APPROVAL_MARKER_NOT_PRIVATE");
    let stored;
    const text = readFileSync(target, "utf8");
    try { stored = JSON.parse(text); } catch { fail("APPROVAL_MARKER_INVALID"); }
    if (canonicalizeStrict(stored) !== text
      || canonicalizeStrict(stored) !== canonicalizeStrict(expected)) {
      fail("PRINCIPAL_APPROVAL_REPLAY_MISMATCH");
    }
    return expected;
  }
  const privateState = APPROVALS.get(approval);
  if (privateState === undefined || privateState.consumed) {
    fail("PAYMENT_APPROVAL_NOT_FACTORY_ISSUED_OR_CONSUMED");
  }
  let descriptor;
  try {
    descriptor = openSync(target, "wx", 0o600);
    writeAll(descriptor, Buffer.from(canonicalizeStrict(expected), "utf8"));
    fsyncSync(descriptor);
    chmodSync(target, 0o600);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  let directoryDescriptor;
  try {
    directoryDescriptor = openSync(state.journalDirectory, "r");
    fsyncSync(directoryDescriptor);
  } finally {
    if (directoryDescriptor !== undefined) closeSync(directoryDescriptor);
  }
  privateState.consumed = true;
  return expected;
}

function operationNonce(state, role, phase) {
  return `operation-nonce-${digest("outsider/atomic-network-operation/v1", {
    networkId: state.networkId, role, phase,
  }).slice(7)}`;
}

function command(state, role, phase, bytes, previous, trigger = null) {
  return {
    operationNonce: operationNonce(state, role, phase),
    requestBytes: Buffer.from(bytes),
    expiresAt: state.formationExpiresAt,
    expectedPreviousOccurrenceHash: previous,
    triggerOccurrenceHash: trigger,
  };
}

function publicSlot(role, values) {
  return Object.freeze({
    routeRole: role,
    quoteState: values.quote?.publicProjection.sourceState ?? null,
    cartState: values.hold?.publicProjection.sourceState ?? null,
    statusState: values.status?.publicProjection.sourceState ?? null,
    runtimeState: values.latest?.publicProjection.runtimeState ?? `${role}_UNFORMED`,
    latestSourceOccurrenceHash:
      values.latest?.publicProjection.sourceOccurrenceHash ?? null,
    cartReady: values.cartReady,
    sourceAvailable: values.available,
    reserved: values.reserved ?? false,
    cancelled: values.cancelled ?? false,
  });
}

async function revalidateAuthority(state, now) {
  let value;
  try {
    value = await state.authorityRevalidate(Object.freeze({
      authorityRefHash: state.authority.authorityRefHash,
      principalEpochRefHash: state.authority.principalEpochRefHash,
      outcomeHash: state.outcomeHash,
      tenderHash: state.tenderHash,
      observedAt: now,
    }));
  } catch { fail("USER_TRANSACTION_AUTHORITY_REVALIDATION_FAILED"); }
  exact(value, ["active", "authorityRefHash", "observedAt", "expiresAt"],
    "AUTHORITY_REVALIDATION");
  if (value.active !== true
    || value.authorityRefHash !== state.authority.authorityRefHash
    || instant(value.observedAt, "AUTHORITY_REVALIDATION_OBSERVED_AT") !== now
    || Date.parse(instant(value.expiresAt,
      "AUTHORITY_REVALIDATION_EXPIRES_AT")) <= Date.parse(now)
    || Date.parse(value.expiresAt) > Date.parse(state.authority.expiresAt)) {
    fail("USER_TRANSACTION_AUTHORITY_NOT_CURRENT");
  }
}

async function prepareSlot(state, slot) {
  const quote = await slot.runtime.quote(command(state, slot.role,
    "PREPARE_QUOTE", slot.plan.quoteBytes, null));
  let latest = quote;
  let hold = null;
  if (quote.publicProjection.sourceState === "QUOTE_AVAILABLE"
    && slot.plan.holdBytes !== null) {
    hold = await slot.runtime.hold(command(state, slot.role,
      "PREPARE_CART_OR_HOLD", slot.plan.holdBytes,
      quote.publicProjection.sourceOccurrenceHash));
    latest = hold;
  }
  let status = null;
  if (latest.publicProjection.sourceOccurrenceHash !== null
    && latest.publicProjection.sourceState !== "REJECTED") {
    status = await slot.runtime.status(command(state, slot.role,
      "PREPARE_STATUS", slot.plan.readinessStatusBytes,
      latest.publicProjection.sourceOccurrenceHash));
    latest = status;
  }
  const states = [quote, hold, status].filter(Boolean)
    .map((result) => result.publicProjection.sourceState);
  const available = quote.publicProjection.sourceState === "QUOTE_AVAILABLE"
    && !states.includes("REJECTED")
    && latest.publicProjection.operationState === "SOURCE_OCCURRENCE_OBSERVED";
  return { role: slot.role, runtime: slot.runtime, plan: slot.plan,
    quote, hold, status, latest, available,
    cartReady: states.includes("CART_READY"), reserved: false,
    cancelled: false };
}

function preparationProjection(state, slots) {
  const unavailable = slots.some((slot) => !slot.available);
  const cartReady = slots.some((slot) => slot.cartReady);
  const networkState = unavailable ? "UNAVAILABLE"
    : cartReady ? "NEEDS_ADDRESS_AND_PAYMENT"
      : "READY_FOR_PRINCIPAL_PAYMENT_APPROVAL";
  return Object.freeze({
    schema:
      OUTSIDER_ATOMIC_BUYER_NATIVE_TEMPORARY_NETWORK_COORDINATOR_V1_SCHEMAS
        .preparation,
    schemaVersion: "1.0.0",
    networkId: state.networkId,
    outcomeHash: state.outcomeHash,
    tenderHash: state.tenderHash,
    networkState,
    slots: Object.freeze(slots.map((slot) => publicSlot(slot.role, slot))),
    quoteAndStatusParallelAcrossSlots: true,
    principalPaymentApprovalRequired: true,
    cartReadyCountsAsHold: false,
    cartReadyCountsAsReservation: false,
    reservationAttempted: false,
    primaryCommitCalled: false,
    userResultCommitted: false,
  });
}

async function cancelSlots(state, slots, phase) {
  return Promise.all(slots.map(async (slot) => {
    const previous = slot.reserve?.publicProjection.sourceOccurrenceHash
      ?? slot.latest.publicProjection.sourceOccurrenceHash;
    const cancel = await slot.runtime.cancel(command(state, slot.role,
      phase, slot.plan.cancelBytes, previous));
    return { ...slot, cancel,
      cancelled: cancel.publicProjection.sourceState
        === "CANCELLATION_ACKNOWLEDGED" };
  }));
}

function commitProjection(state, networkState, slots, extra = {}) {
  return Object.freeze({
    schema:
      OUTSIDER_ATOMIC_BUYER_NATIVE_TEMPORARY_NETWORK_COORDINATOR_V1_SCHEMAS
        .commitResult,
    schemaVersion: "1.0.0",
    networkId: state.networkId,
    outcomeHash: state.outcomeHash,
    tenderHash: state.tenderHash,
    networkState,
    slots: Object.freeze(slots.map((slot) => publicSlot(slot.role, slot))),
    principalPaymentApprovalConsumed:
      extra.principalPaymentApprovalConsumed ?? true,
    maximumLossBoundPresent: true,
    allThreeSlotsReservedBeforePrimaryCommit:
      slots.every((slot) => slot.reserved),
    primaryCommitCalled: extra.primaryCommitCalled ?? false,
    recoveryCalled: extra.recoveryCalled ?? false,
    recoveryTriggerOccurrenceHash: extra.recoveryTriggerOccurrenceHash ?? null,
    providerSourceStateEstablishesIndependentOutcome: false,
    independentWitnessObservationRequired: true,
    userResultCommitted: false,
  });
}

/** Compose three injected account-native capabilities into one atomic route. */
export function createAtomicBuyerNativeTemporaryNetworkCoordinatorV1(input = {},
  dependencies = {}) {
  exact(input, ["journalDirectory", "networkId", "frozenOutcome",
    "frozenTender", "expectedOutcomeHash", "expectedTenderHash",
    "formationExpiresAt", "commercialTerms", "routeRequests"],
  "COORDINATOR_INPUT");
  exact(dependencies, ["currentTransactionAuthority", "primaryCapability",
    "recoveryCapability", "independentWitnessCapability", "clock"],
  "COORDINATOR_DEPENDENCIES");
  if (typeof dependencies.clock !== "function") fail("CLOCK_INVALID");
  const authorityRevalidate = AUTHORITIES.get(
    dependencies.currentTransactionAuthority);
  if (authorityRevalidate === undefined) fail("USER_TRANSACTION_AUTHORITY_INVALID");
  if (typeof input.networkId !== "string" || !NETWORK_ID.test(input.networkId)) {
    fail("NETWORK_ID_INVALID");
  }
  if (typeof input.journalDirectory !== "string" || input.journalDirectory === "") {
    fail("JOURNAL_DIRECTORY_INVALID");
  }
  const journalDirectory = path.resolve(input.journalDirectory);
  ensurePrivateDirectory(journalDirectory);
  const outcomeHash = pinAtomicBuyerNativeFrozenArtifactV1("OUTCOME",
    input.frozenOutcome);
  const tenderHash = pinAtomicBuyerNativeFrozenArtifactV1("TENDER",
    input.frozenTender);
  if (outcomeHash !== hash(input.expectedOutcomeHash, "EXPECTED_OUTCOME_HASH")
    || tenderHash !== hash(input.expectedTenderHash, "EXPECTED_TENDER_HASH")) {
    fail("FROZEN_ARTIFACT_PIN_MISMATCH");
  }
  const authority = dependencies.currentTransactionAuthority;
  if (authority.outcomeHash !== outcomeHash || authority.tenderHash !== tenderHash) {
    fail("USER_TRANSACTION_AUTHORITY_BINDING_MISMATCH");
  }
  exact(input.commercialTerms,
    ["currency", "totalAmountMinor", "maximumLossMinor"], "COMMERCIAL_TERMS");
  if (typeof input.commercialTerms.currency !== "string"
    || !CURRENCY.test(input.commercialTerms.currency)) fail("CURRENCY_INVALID");
  const commercialTerms = Object.freeze({
    currency: input.commercialTerms.currency,
    totalAmountMinor: validateMoney(input.commercialTerms.totalAmountMinor,
      "TOTAL_AMOUNT_MINOR"),
    maximumLossMinor: validateMoney(input.commercialTerms.maximumLossMinor,
      "MAXIMUM_LOSS_MINOR"),
  });
  exact(input.routeRequests, ["primary", "recovery", "independentWitness"],
    "ROUTE_REQUESTS");
  const plans = {
    PRIMARY: routePlan(input.routeRequests.primary, "PRIMARY"),
    RECOVERY: routePlan(input.routeRequests.recovery, "RECOVERY"),
    INDEPENDENT_WITNESS: routePlan(input.routeRequests.independentWitness,
      "INDEPENDENT_WITNESS"),
  };
  const formationExpiresAt = instant(input.formationExpiresAt,
    "FORMATION_EXPIRES_AT");
  if (Date.parse(formationExpiresAt) > Date.parse(authority.expiresAt)) {
    fail("FORMATION_EXCEEDS_USER_AUTHORITY");
  }
  const state = {
    journalDirectory, networkId: input.networkId, outcomeHash, tenderHash,
    formationExpiresAt, commercialTerms, authority, authorityRevalidate,
    clock: dependencies.clock, busy: false,
  };
  const specs = [
    ["PRIMARY", dependencies.primaryCapability],
    ["RECOVERY", dependencies.recoveryCapability],
    ["INDEPENDENT_WITNESS", dependencies.independentWitnessCapability],
  ];
  state.slots = specs.map(([role, capability]) => {
    const suffix = digest("outsider/atomic-network-route-journal/v1", {
      networkId: state.networkId, role,
    }).slice(7, 39);
    return {
      role,
      plan: plans[role],
      runtime: createBuyerNativeTransactionRouteRuntimeV1({
        journalDirectory,
        journalId: `transaction_${suffix}`,
        transactionRefHash: digest("outsider/atomic-network-transaction/v1", {
          networkId: state.networkId, role,
        }),
        outcomeIntentRefHash: outcomeHash,
        routeRole: role,
        formationExpiresAt,
      }, { capability, clock: dependencies.clock }),
    };
  });

  async function runPreparation() {
    const now = instant(state.clock(), "CLOCK");
    if (Date.parse(now) >= Date.parse(state.formationExpiresAt)
      || Date.parse(now) >= Date.parse(state.authority.expiresAt)) {
      fail("FORMATION_OR_AUTHORITY_EXPIRED");
    }
    await revalidateAuthority(state, now);
    return Promise.all(state.slots.map((slot) => prepareSlot(state, slot)));
  }

  async function prepare() {
    if (state.busy) fail("CONCURRENT_COORDINATOR_OPERATION_FORBIDDEN");
    state.busy = true;
    try {
      const slots = await runPreparation();
      return preparationProjection(state, slots);
    } finally { state.busy = false; }
  }

  async function authorizeCommit(approval) {
    if (state.busy) fail("CONCURRENT_COORDINATOR_OPERATION_FORBIDDEN");
    state.busy = true;
    try {
      if (!APPROVALS.has(approval)) fail("PAYMENT_APPROVAL_INVALID");
      const now = instant(state.clock(), "CLOCK");
      if (approval.transactionAuthorityRefHash !== state.authority.authorityRefHash
        || approval.principalEpochRefHash !== state.authority.principalEpochRefHash
        || approval.outcomeHash !== state.outcomeHash
        || approval.tenderHash !== state.tenderHash
        || approval.currency !== state.commercialTerms.currency
        || BigInt(approval.authorizedAmountMinor)
          < BigInt(state.commercialTerms.totalAmountMinor)
        || BigInt(approval.maximumLossMinor)
          < BigInt(state.commercialTerms.maximumLossMinor)
        || Date.parse(approval.expiresAt) <= Date.parse(now)) {
        fail("PAYMENT_APPROVAL_SCOPE_INSUFFICIENT");
      }
      const prepared = await runPreparation();
      if (prepared.some((slot) => !slot.available)) {
        return commitProjection(state, "UNAVAILABLE", prepared,
          { principalPaymentApprovalConsumed: false });
      }
      const marker = persistOrReplayApproval(state, approval);
      let slots = await Promise.all(prepared.map(async (slot) => {
        const reserve = await slot.runtime.reserve(command(state, slot.role,
          `RESERVE:${marker.markerHash}`, slot.plan.reserveBytes,
          slot.latest.publicProjection.sourceOccurrenceHash));
        return { ...slot, reserve, latest: reserve,
          reserved: reserve.publicProjection.sourceState
            === "RESERVATION_ACKNOWLEDGED"
            && reserve.publicProjection.runtimeState === `${slot.role}_RESERVED`
            && reserve.publicProjection.capacityReserved === true };
      }));
      if (!slots.every((slot) => slot.reserved)) {
        slots = await cancelSlots(state, slots,
          `PARTIAL_RESERVE_CANCEL:${marker.markerHash}`);
        const allCancelled = slots.every((slot) => slot.cancelled);
        return commitProjection(state, allCancelled
          ? "PARTIAL_RESERVE_CANCELLED"
          : "PARTIAL_RESERVE_CANCEL_AMBIGUOUS_HOLD", slots);
      }
      const primary = slots.find((slot) => slot.role === "PRIMARY");
      const recovery = slots.find((slot) => slot.role === "RECOVERY");
      const primaryCommit = await primary.runtime.commit(command(state,
        "PRIMARY", `PRIMARY_COMMIT:${marker.markerHash}`,
        primary.plan.commitBytes,
        primary.reserve.publicProjection.sourceOccurrenceHash));
      primary.latest = primaryCommit;
      if (primaryCommit.publicProjection.sourceState !== "COMMIT_ACKNOWLEDGED") {
        if (primaryCommit.publicProjection.sourceState === "REJECTED") {
          slots = await cancelSlots(state, slots,
            `COMMIT_REJECTED_CANCEL:${marker.markerHash}`);
          return commitProjection(state,
            slots.every((slot) => slot.cancelled)
              ? "PARTIAL_RESERVE_CANCELLED"
              : "PARTIAL_RESERVE_CANCEL_AMBIGUOUS_HOLD", slots,
          { primaryCommitCalled: true });
        }
        return commitProjection(state, "PRIMARY_COMMIT_AMBIGUOUS_HOLD", slots,
          { primaryCommitCalled: true });
      }
      const primaryStatus = await primary.runtime.status(command(state,
        "PRIMARY", `PRIMARY_EXECUTION_STATUS:${marker.markerHash}`,
        primary.plan.executionStatusBytes,
        primaryCommit.publicProjection.sourceOccurrenceHash));
      primary.latest = primaryStatus;
      if (primaryStatus.publicProjection.sourceState === "FAILED") {
        const recoveryRun = await recovery.runtime.recover(command(state,
          "RECOVERY", `RECOVERY_ACTIVATE:${marker.markerHash}`,
          recovery.plan.recoverBytes,
          recovery.reserve.publicProjection.sourceOccurrenceHash,
          primaryStatus.publicProjection.sourceOccurrenceHash));
        recovery.latest = recoveryRun;
        if (recoveryRun.publicProjection.sourceState
          === "RECOVERY_COMMIT_ACKNOWLEDGED") {
          const recoveryStatus = await recovery.runtime.status(command(state,
            "RECOVERY", `RECOVERY_EXECUTION_STATUS:${marker.markerHash}`,
            recovery.plan.executionStatusBytes,
            recoveryRun.publicProjection.sourceOccurrenceHash));
          recovery.latest = recoveryStatus;
          return commitProjection(state,
            recoveryStatus.publicProjection.sourceState === "FULFILLED"
              ? "RECOVERY_SOURCE_DECLARED_FULFILLED_AWAITING_INDEPENDENT_WITNESS"
              : "RECOVERY_ACTIVE", slots,
          { primaryCommitCalled: true, recoveryCalled: true,
            recoveryTriggerOccurrenceHash:
              primaryStatus.publicProjection.sourceOccurrenceHash });
        }
        return commitProjection(state, "RECOVERY_ACTIVE", slots,
          { primaryCommitCalled: true, recoveryCalled: true,
            recoveryTriggerOccurrenceHash:
              primaryStatus.publicProjection.sourceOccurrenceHash });
      }
      const networkState = primaryStatus.publicProjection.sourceState
        === "FULFILLED"
        ? "PRIMARY_SOURCE_DECLARED_FULFILLED_AWAITING_INDEPENDENT_WITNESS"
        : "PRIMARY_COMMITTED_STATUS_HOLD";
      return commitProjection(state, networkState, slots,
        { primaryCommitCalled: true });
    } finally { state.busy = false; }
  }

  const body = {
    schema:
      OUTSIDER_ATOMIC_BUYER_NATIVE_TEMPORARY_NETWORK_COORDINATOR_V1_SCHEMAS
        .coordinator,
    schemaVersion: "1.0.0",
    networkId: state.networkId,
    outcomeHash: state.outcomeHash,
    tenderHash: state.tenderHash,
    formationExpiresAt: state.formationExpiresAt,
    currentTransactionAuthorityRefHash: state.authority.authorityRefHash,
    routeRoles: Object.freeze(state.slots.map(({ role }) => role)),
    boundary:
      OUTSIDER_ATOMIC_BUYER_NATIVE_TEMPORARY_NETWORK_COORDINATOR_V1_BOUNDARY,
  };
  const coordinator = Object.freeze({ ...body,
    coordinatorBindingHash: digest(body.schema, body), prepare, authorizeCommit });
  COORDINATORS.set(coordinator, state);
  return coordinator;
}

export function inspectAtomicBuyerNativeTemporaryNetworkCoordinatorV1(value) {
  if (!COORDINATORS.has(value)) fail("COORDINATOR_NOT_FACTORY_ISSUED");
  return value;
}
