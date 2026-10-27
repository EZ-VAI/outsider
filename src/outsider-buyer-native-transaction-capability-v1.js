/*
 * Outcome Formation Engine: buyer-native transaction capability v1.
 *
 * A provider-specific adapter injects an account-local request closure. The
 * runtime never accepts ambient credentials, URLs, browser sessions, or a
 * provider registry. It gives the formation engine one uniform route:
 * QUOTE -> HOLD/RESERVE -> COMMIT -> STATUS -> CANCEL, with RECOVER as the
 * explicit commit operation for a separately reserved recovery route.
 *
 * Exact provider bytes are retained as private source occurrences. Inventory,
 * quote, checkout, status, cancellation, and recovery receipts remain source
 * declarations: none establish owner authority, capacity, independent outcome,
 * payment, or a user-facing result commitment by themselves.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync,
  readFileSync, renameSync, statSync, unlinkSync, writeSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const JOURNAL_ID = /^transaction_[a-f0-9]{32}$/u;
const NONCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,255}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_SOURCE_BYTES = 1024 * 1024;
const MAX_EVENTS = 16_384;

const CAPABILITIES = new WeakMap();
const RUNTIMES = new WeakMap();
const PRIVATE_RESULTS = new WeakMap();

export const OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
  = Object.freeze({
    capability: "outsider/buyer-native-transaction-account-capability/v1",
    runtime: "outsider/buyer-native-transaction-route-runtime/v1",
    event: "outsider/buyer-native-transaction-private-event/v1",
    responseHandle:
      "outsider/buyer-native-transaction-private-response-handle/v1",
    responseHandleV1:
      "outsider/buyer-native-transaction-private-response-handle/v1",
    responseHandleV2:
      "outsider/buyer-native-transaction-private-response-handle/v2",
    responseHandleCurrent:
      "outsider/buyer-native-transaction-private-response-handle/v2",
    sourceOccurrence:
      "outsider/buyer-native-transaction-source-occurrence/v1",
    result: "outsider/buyer-native-transaction-operation-result/v1",
    privateSourceClaim:
      "outsider/buyer-native-transaction-private-source-claim/v1",
    sourceOccurrenceSinkReceipt:
      "outsider/buyer-native-transaction-source-occurrence-sink-receipt/v1",
  });

export const OUTSIDER_BUYER_NATIVE_TRANSACTION_OPERATIONS_V1
  = Object.freeze([
    "QUOTE", "HOLD", "RESERVE", "COMMIT", "STATUS", "CANCEL", "RECOVER",
  ]);

export const OUTSIDER_BUYER_NATIVE_TRANSACTION_ROUTE_ROLES_V1
  = Object.freeze(["PRIMARY", "RECOVERY", "INDEPENDENT_WITNESS"]);

export const OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_BOUNDARY
  = Object.freeze({
    position: "BUYER_ACCOUNT_NATIVE_TRANSACTION_EXECUTION_SOURCE_OCCURRENCES",
    providerRegistryRequired: false,
    providerEnrollmentRequired: false,
    accountLocalCapabilityInjected: true,
    ambientCredentialsAccepted: false,
    rawCredentialInputAccepted: false,
    credentialLocatorInputAccepted: false,
    arbitraryUrlInputAccepted: false,
    browserSessionInputAccepted: false,
    exactFiniteExpiryRequired: true,
    deterministicIdempotencyRequired: true,
    durableAttemptBeforeExternalEffect: true,
    ambiguousAttemptRetried: false,
    coldReplaySupported: true,
    legacyInlineBase64ResponseHandleV1ReadOnlyReplaySupported: true,
    currentResponseHandleVersion: 2,
    currentResponseHandleRawSourceStoredSeparately0600: true,
    responseHandleDigestBindsSourceBytesHashAndLengthNotRawBytes: true,
    configuredSourceOccurrenceSinkIsFailClosed: true,
    sinkReceivesIndependentPrivateClaimView: true,
    callerPrivateClaimConsumedBySink: false,
    primaryAndRecoveryRoutesExplicit: true,
    recoveryRequiresPrimaryFailureOccurrenceBinding: true,
    primaryFailureOccurrenceVerifiedByThisModule: false,
    capabilityInjectionMintsAuthority: false,
    publishedInventoryIsSourceOccurrenceOnly: true,
    checkoutReceiptIsSourceOccurrenceOnly: true,
    providerAcknowledgementEstablishesOwnerAuthority: false,
    genericProviderAcknowledgementEstablishesCapacity: false,
    exactAccountNativeReservationReceiptMayEstablishOperationalCapacity: true,
    providerAcknowledgementEstablishesIndependentOutcome: false,
    providerAcknowledgementAuthorizesPayment: false,
    sourceOccurrenceMintsAuthority: false,
    capacityReservedFromInventoryOrCheckoutReceipt: false,
    resourceOwnerAuthorityEstablished: false,
    independentOutcomeEstablished: false,
    paymentPerformed: false,
    settlementPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

const RESPONSE_STATES = Object.freeze({
  QUOTE: Object.freeze(["QUOTE_AVAILABLE", "REJECTED"]),
  HOLD: Object.freeze(["CART_READY", "HOLD_ACKNOWLEDGED", "REJECTED"]),
  RESERVE: Object.freeze(["RESERVATION_ACKNOWLEDGED", "REJECTED"]),
  COMMIT: Object.freeze(["COMMIT_ACKNOWLEDGED", "REJECTED"]),
  STATUS: Object.freeze([
    "STATE_OBSERVED", "CART_READY", "PENDING", "IN_PROGRESS", "FULFILLED",
    "FAILED", "CANCELLED", "REJECTED",
  ]),
  CANCEL: Object.freeze(["CANCELLATION_ACKNOWLEDGED", "REJECTED"]),
  RECOVER: Object.freeze(["RECOVERY_COMMIT_ACKNOWLEDGED", "REJECTED"]),
});

const RECORD_CLASSES = Object.freeze({
  QUOTE: Object.freeze(["PUBLISHED_INVENTORY", "QUOTE"]),
  HOLD: Object.freeze(["HOLD_RECEIPT", "CHECKOUT_RECEIPT"]),
  RESERVE: Object.freeze(["RESERVATION_RECEIPT", "CHECKOUT_RECEIPT"]),
  COMMIT: Object.freeze(["COMMIT_RECEIPT", "CHECKOUT_RECEIPT"]),
  STATUS: Object.freeze(["STATUS_RECEIPT"]),
  CANCEL: Object.freeze(["CANCELLATION_RECEIPT"]),
  RECOVER: Object.freeze(["RECOVERY_RECEIPT", "CHECKOUT_RECEIPT"]),
});

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (const field of fields) {
    if (!Object.hasOwn(value, field)) fail(`${code}_FIELDS_INVALID`);
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

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function roleState(role, state) {
  return `${role}_${state}`;
}

function ensurePrivateDirectory(directory) {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const info = statSync(directory);
  if (!info.isDirectory() || (info.mode & 0o077) !== 0) {
    fail("JOURNAL_DIRECTORY_NOT_PRIVATE");
  }
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function sealEvent(body) {
  return Object.freeze({ ...body,
    eventHash: digest(OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
      .event, body) });
}

function appendEvent(state, eventBody) {
  const event = sealEvent(eventBody);
  let descriptor;
  try {
    descriptor = openSync(state.journalPath, "a", 0o600);
    chmodSync(state.journalPath, 0o600);
    writeAll(descriptor, Buffer.from(`${canonicalizeStrict(event)}\n`, "utf8"));
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  fsyncDirectory(state.journalDirectory);
  return event;
}

function readEvents(state) {
  if (!existsSync(state.journalPath)) return [];
  const info = statSync(state.journalPath);
  if (!info.isFile() || (info.mode & 0o077) !== 0) fail("JOURNAL_NOT_PRIVATE");
  const text = readFileSync(state.journalPath, "utf8");
  if (text.length === 0 || !text.endsWith("\n")) fail("JOURNAL_TRUNCATED");
  const lines = text.slice(0, -1).split("\n");
  if (lines.length > MAX_EVENTS) fail("JOURNAL_EVENT_LIMIT_EXCEEDED");
  let previous = null;
  const events = [];
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try { event = JSON.parse(lines[index]); } catch { fail("JOURNAL_JSON_INVALID"); }
    if (canonicalizeStrict(event) !== lines[index]
      || event?.schema
        !== OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.event
      || event.schemaVersion !== "1.0.0" || event.sequence !== index + 1
      || event.previousEventHash !== previous
      || typeof event.eventType !== "string") fail("JOURNAL_CHAIN_INVALID");
    const { eventHash, ...body } = event;
    if (eventHash !== digest(event.schema, body)) fail("JOURNAL_HASH_INVALID");
    previous = eventHash;
    events.push(Object.freeze(event));
  }
  return events;
}

function runtimeBinding(state) {
  return {
    transactionRefHash: state.transactionRefHash,
    outcomeIntentRefHash: state.outcomeIntentRefHash,
    routeRole: state.routeRole,
    formationExpiresAt: state.formationExpiresAt,
    capabilityRefHash: state.capability.capabilityRefHash,
    accountRefHash: state.capability.accountRefHash,
    nodeRefHash: state.capability.nodeRefHash,
  };
}

function initialJournal(state) {
  const events = readEvents(state);
  const binding = runtimeBinding(state);
  if (events.length === 0) {
    appendEvent(state, {
      schema: OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.event,
      schemaVersion: "1.0.0",
      sequence: 1,
      previousEventHash: null,
      eventType: "RUNTIME_OPENED",
      recordedAt: instant(state.clock(), "CLOCK"),
      binding,
    });
    return;
  }
  if (events[0].eventType !== "RUNTIME_OPENED"
    || canonicalizeStrict(events[0].binding) !== canonicalizeStrict(binding)) {
    fail("COLD_REPLAY_BINDING_MISMATCH");
  }
}

function transitionAllowed(current, operation, role) {
  const prefix = `${role}_`;
  if (!current.startsWith(prefix)) return false;
  const state = current.slice(prefix.length);
  if (operation === "QUOTE") return state === "UNFORMED" || state === "QUOTED";
  if (operation === "HOLD") return state === "QUOTED";
  if (operation === "RESERVE") {
    return state === "QUOTED" || state === "HELD" || state === "CART_READY";
  }
  if (operation === "COMMIT") {
    return role === "PRIMARY" && (state === "HELD" || state === "RESERVED");
  }
  if (operation === "RECOVER") {
    return role === "RECOVERY" && (state === "HELD" || state === "RESERVED");
  }
  if (operation === "STATUS") {
    return ["QUOTED", "HELD", "CART_READY", "RESERVED", "COMMITTED", "PENDING",
      "IN_PROGRESS", "FAILED"].includes(state);
  }
  if (operation === "CANCEL") {
    return ["QUOTED", "HELD", "CART_READY", "RESERVED", "COMMITTED", "PENDING",
      "IN_PROGRESS", "FAILED"].includes(state);
  }
  return false;
}

function nextRuntimeState(current, operation, sourceState, role) {
  if (sourceState === "REJECTED" || sourceState === "STATE_OBSERVED") {
    return current;
  }
  if (sourceState === "CART_READY") return roleState(role, "CART_READY");
  if (operation === "QUOTE") return roleState(role, "QUOTED");
  if (operation === "HOLD") return roleState(role, "HELD");
  if (operation === "RESERVE") return roleState(role, "RESERVED");
  if (operation === "COMMIT" || operation === "RECOVER") {
    return roleState(role, "COMMITTED");
  }
  if (operation === "CANCEL" || sourceState === "CANCELLED") {
    return roleState(role, "SOURCE_DECLARED_CANCELLED");
  }
  if (sourceState === "PENDING") return roleState(role, "PENDING");
  if (sourceState === "IN_PROGRESS") return roleState(role, "IN_PROGRESS");
  if (sourceState === "FULFILLED") {
    return roleState(role, "SOURCE_DECLARED_FULFILLED");
  }
  if (sourceState === "FAILED") return roleState(role, "FAILED");
  fail("SOURCE_STATE_TRANSITION_INVALID");
}

function replay(state) {
  const events = readEvents(state);
  if (events.length === 0 || events[0].eventType !== "RUNTIME_OPENED") {
    fail("RUNTIME_JOURNAL_MISSING");
  }
  if (canonicalizeStrict(events[0].binding)
    !== canonicalizeStrict(runtimeBinding(state))) fail("RUNTIME_BINDING_INVALID");
  const effects = new Map();
  const nonceIndex = new Map();
  let runtimeState = roleState(state.routeRole, "UNFORMED");
  let latestOccurrenceHash = null;
  let stateExpiresAt = null;
  for (let index = 1; index < events.length; index += 1) {
    const event = events[index];
    if (event.eventType === "OPERATION_ATTEMPTED") {
      if (effects.has(event.effectIdHash)
        || nonceIndex.has(event.operationNonceHash)) fail("EFFECT_REPLAY_INVALID");
      effects.set(event.effectIdHash, { attempt: event, terminal: null });
      nonceIndex.set(event.operationNonceHash, event.effectIdHash);
      continue;
    }
    const effect = effects.get(event.effectIdHash);
    if (effect === undefined || effect.terminal !== null) fail("EFFECT_REPLAY_INVALID");
    if (event.eventType === "AMBIGUOUS_NO_RETRY_HOLD") {
      effect.terminal = event;
      continue;
    }
    if (event.eventType !== "SOURCE_OCCURRENCE_OBSERVED"
      || event.previousRuntimeState !== runtimeState
      || event.previousSourceOccurrenceHash !== latestOccurrenceHash) {
      fail("SOURCE_OCCURRENCE_REPLAY_INVALID");
    }
    const expectedState = nextRuntimeState(runtimeState, event.operation,
      event.sourceState, state.routeRole);
    if (event.runtimeState !== expectedState) fail("RUNTIME_STATE_REPLAY_INVALID");
    runtimeState = expectedState;
    latestOccurrenceHash = event.sourceOccurrenceHash;
    if (!["REJECTED", "STATE_OBSERVED"].includes(event.sourceState)) {
      stateExpiresAt = event.stateExpiresAt;
    }
    effect.terminal = event;
  }
  return { events, effects, nonceIndex, runtimeState,
    latestOccurrenceHash, stateExpiresAt,
    headHash: events.at(-1).eventHash };
}

function normalizeCommand(value, operation) {
  exact(value, ["operationNonce", "requestBytes", "expiresAt",
    "expectedPreviousOccurrenceHash", "triggerOccurrenceHash"], "COMMAND");
  if (typeof value.operationNonce !== "string" || !NONCE.test(value.operationNonce)) {
    fail("OPERATION_NONCE_INVALID");
  }
  if (!Buffer.isBuffer(value.requestBytes) || value.requestBytes.length < 1
    || value.requestBytes.length > MAX_SOURCE_BYTES) fail("REQUEST_BYTES_INVALID");
  const expected = value.expectedPreviousOccurrenceHash === null ? null
    : hash(value.expectedPreviousOccurrenceHash, "EXPECTED_PREVIOUS_OCCURRENCE_HASH");
  const trigger = value.triggerOccurrenceHash === null ? null
    : hash(value.triggerOccurrenceHash, "TRIGGER_OCCURRENCE_HASH");
  if ((operation === "RECOVER") !== (trigger !== null)) {
    fail("RECOVERY_TRIGGER_BINDING_INVALID");
  }
  return {
    operationNonce: value.operationNonce,
    operationNonceHash: digest("outsider/buyer-native-operation-nonce/v1",
      value.operationNonce),
    requestBytes: Buffer.from(value.requestBytes),
    requestBytesHash: bytesHash(value.requestBytes),
    expiresAt: instant(value.expiresAt, "OPERATION_EXPIRES_AT"),
    expectedPreviousOccurrenceHash: expected,
    triggerOccurrenceHash: trigger,
  };
}

function effectFor(state, operation, command) {
  const body = {
    transactionRefHash: state.transactionRefHash,
    routeRole: state.routeRole,
    operation,
    operationNonceHash: command.operationNonceHash,
    requestBytesHash: command.requestBytesHash,
    operationExpiresAt: command.expiresAt,
    expectedPreviousOccurrenceHash: command.expectedPreviousOccurrenceHash,
    triggerOccurrenceHash: command.triggerOccurrenceHash,
  };
  const effectIdHash = digest("outsider/buyer-native-transaction-effect/v1", body);
  return { effectIdHash,
    idempotencyKey: digest("outsider/buyer-native-provider-idempotency/v1", body) };
}

function normalizeResponse(value, operation) {
  exact(value, ["sourceBytes", "sourceState", "sourceExpiresAt",
    "sourceRecordClass"], "DRIVER_RESPONSE");
  if (!Buffer.isBuffer(value.sourceBytes) || value.sourceBytes.length < 1
    || value.sourceBytes.length > MAX_SOURCE_BYTES) fail("SOURCE_BYTES_INVALID");
  if (!RESPONSE_STATES[operation].includes(value.sourceState)) {
    fail("SOURCE_STATE_INVALID");
  }
  if (!RECORD_CLASSES[operation].includes(value.sourceRecordClass)) {
    fail("SOURCE_RECORD_CLASS_INVALID");
  }
  if (["QUOTE", "HOLD", "RESERVE"].includes(operation)
    && value.sourceState !== "REJECTED" && value.sourceExpiresAt === null) {
    fail("FINITE_SOURCE_EXPIRY_REQUIRED");
  }
  if (value.sourceState === "CART_READY" && value.sourceExpiresAt === null) {
    fail("FINITE_SOURCE_EXPIRY_REQUIRED");
  }
  return {
    sourceBytes: Buffer.from(value.sourceBytes),
    sourceState: value.sourceState,
    sourceExpiresAt: value.sourceExpiresAt === null ? null
      : instant(value.sourceExpiresAt, "SOURCE_EXPIRES_AT"),
    sourceRecordClass: value.sourceRecordClass,
  };
}

function handlePath(state, effectIdHash) {
  return path.join(state.responseDirectory, `${effectIdHash.slice(7)}.json`);
}

function sourceObjectPath(state, effectIdHash) {
  return path.join(state.responseDirectory,
    `${effectIdHash.slice(7)}.source-v2.bin`);
}

function persistPrivateBytes(target, bytes) {
  if (existsSync(target)) {
    const info = lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
      || !readFileSync(target).equals(bytes)) fail("RESPONSE_SOURCE_OBJECT_MISMATCH");
    return;
  }
  const temporary = `${target}.${process.pid}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, target);
    chmodSync(target, 0o600);
    fsyncDirectory(path.dirname(target));
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

function persistResponseHandle(state, operation, effectIdHash, response) {
  const sourceBytesHash = bytesHash(response.sourceBytes);
  const sourceBytesLength = response.sourceBytes.length;
  const body = {
    schema:
      OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.responseHandleV2,
    schemaVersion: "2.0.0",
    schemaLineage: {
      revision: 1,
      predecessorSchema:
        OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.responseHandleV1,
      supersedesSchema:
        OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.responseHandleV1,
      inPlaceMutationAllowed: false,
    },
    transactionRefHash: state.transactionRefHash,
    routeRole: state.routeRole,
    operation,
    effectIdHash,
    sourceObjectRefHash: digest(
      "outsider/buyer-native-transaction-private-response-source-object/v2", {
        transactionRefHash: state.transactionRefHash,
        effectIdHash,
        sourceBytesHash,
        sourceBytesLength,
      }),
    sourceBytesHash,
    sourceBytesLength,
    sourceState: response.sourceState,
    sourceExpiresAt: response.sourceExpiresAt,
    sourceRecordClass: response.sourceRecordClass,
  };
  const handle = { ...body, handleHash: digest(body.schema, body) };
  const target = handlePath(state, effectIdHash);
  if (existsSync(target)) return readResponseHandle(state, operation, effectIdHash);
  persistPrivateBytes(sourceObjectPath(state, effectIdHash),
    response.sourceBytes);
  const temporary = `${target}.${process.pid}.tmp`;
  let descriptor;
  try {
    descriptor = openSync(temporary, "wx", 0o600);
    writeAll(descriptor, Buffer.from(canonicalizeStrict(handle), "utf8"));
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, target);
    chmodSync(target, 0o600);
    fsyncDirectory(state.responseDirectory);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    if (existsSync(temporary)) unlinkSync(temporary);
  }
  return readResponseHandle(state, operation, effectIdHash);
}

function readResponseHandle(state, operation, effectIdHash) {
  const target = handlePath(state, effectIdHash);
  if (!existsSync(target)) return null;
  const info = lstatSync(target);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    fail("RESPONSE_HANDLE_NOT_PRIVATE");
  }
  const text = readFileSync(target, "utf8");
  let handle;
  try { handle = JSON.parse(text); } catch { fail("RESPONSE_HANDLE_INVALID"); }
  if (handle.schema
      === OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
        .responseHandleV1) {
    exact(handle, ["schema", "schemaVersion", "transactionRefHash",
      "routeRole", "operation", "effectIdHash", "sourceBytesBase64",
      "sourceBytesHash", "sourceState", "sourceExpiresAt",
      "sourceRecordClass", "handleHash"], "RESPONSE_HANDLE_V1");
  } else if (handle.schema
      === OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
        .responseHandleV2) {
    exact(handle, ["schema", "schemaVersion", "schemaLineage",
      "transactionRefHash", "routeRole", "operation", "effectIdHash",
      "sourceObjectRefHash", "sourceBytesHash", "sourceBytesLength",
      "sourceState", "sourceExpiresAt", "sourceRecordClass", "handleHash"],
    "RESPONSE_HANDLE_V2");
  } else {
    fail("RESPONSE_HANDLE_SCHEMA_INVALID");
  }
  if (canonicalizeStrict(handle) !== text
    || handle.transactionRefHash !== state.transactionRefHash
    || handle.routeRole !== state.routeRole || handle.operation !== operation
    || handle.effectIdHash !== effectIdHash) fail("RESPONSE_HANDLE_BINDING_INVALID");
  const { handleHash, ...body } = handle;
  if (handleHash !== digest(handle.schema, body)) fail("RESPONSE_HANDLE_HASH_INVALID");
  let bytes;
  if (handle.schema
      === OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
        .responseHandleV1
    && handle.schemaVersion === "1.0.0") {
    bytes = Buffer.from(handle.sourceBytesBase64, "base64");
    if (bytes.toString("base64") !== handle.sourceBytesBase64) {
      fail("RESPONSE_HANDLE_BYTES_INVALID");
    }
  } else if (handle.schema
      === OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
        .responseHandleV2
    && handle.schemaVersion === "2.0.0") {
    exact(handle.schemaLineage, ["revision", "predecessorSchema",
      "supersedesSchema", "inPlaceMutationAllowed"],
    "RESPONSE_HANDLE_SCHEMA_LINEAGE");
    if (handle.schemaLineage.revision !== 1
      || handle.schemaLineage.predecessorSchema
        !== OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
          .responseHandleV1
      || handle.schemaLineage.supersedesSchema
        !== OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
          .responseHandleV1
      || handle.schemaLineage.inPlaceMutationAllowed !== false
      || !Number.isSafeInteger(handle.sourceBytesLength)
      || handle.sourceBytesLength < 1
      || handle.sourceBytesLength > MAX_SOURCE_BYTES
      || handle.sourceObjectRefHash !== digest(
        "outsider/buyer-native-transaction-private-response-source-object/v2", {
          transactionRefHash: state.transactionRefHash,
          effectIdHash,
          sourceBytesHash: handle.sourceBytesHash,
          sourceBytesLength: handle.sourceBytesLength,
        })) fail("RESPONSE_HANDLE_V2_BINDING_INVALID");
    const sourceTarget = sourceObjectPath(state, effectIdHash);
    if (!existsSync(sourceTarget)) fail("RESPONSE_SOURCE_OBJECT_INVALID");
    const sourceInfo = lstatSync(sourceTarget);
    if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()
      || (sourceInfo.mode & 0o077) !== 0
      || sourceInfo.size !== handle.sourceBytesLength) {
      fail("RESPONSE_SOURCE_OBJECT_INVALID");
    }
    bytes = readFileSync(sourceTarget);
  } else fail("RESPONSE_HANDLE_SCHEMA_INVALID");
  if (bytes.length < 1 || bytes.length > MAX_SOURCE_BYTES
    || bytesHash(bytes) !== handle.sourceBytesHash) {
    fail("RESPONSE_HANDLE_BYTES_INVALID");
  }
  return { ...handle, sourceBytes: bytes };
}

function publicResult(state, event, replayed, sourceBytes = null) {
  const observed = event.eventType === "SOURCE_OCCURRENCE_OBSERVED";
  const operationalReservation = observed && event.operation === "RESERVE"
    && event.sourceState === "RESERVATION_ACKNOWLEDGED"
    && event.sourceRecordClass === "RESERVATION_RECEIPT";
  const projection = Object.freeze({
    schema: OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.result,
    schemaVersion: "1.0.0",
    transactionRefHash: state.transactionRefHash,
    outcomeIntentRefHash: state.outcomeIntentRefHash,
    routeRole: state.routeRole,
    operation: event.operation,
    operationState: event.eventType,
    runtimeState: event.runtimeState,
    effectIdHash: event.effectIdHash,
    idempotencyKeyHash: event.idempotencyKeyHash,
    sourceOccurrenceHash: observed ? event.sourceOccurrenceHash : null,
    sourceBytesHash: observed ? event.sourceBytesHash : null,
    sourceState: observed ? event.sourceState : null,
    sourceRecordClass: observed ? event.sourceRecordClass : null,
    sourceExpiresAt: observed ? event.sourceExpiresAt : null,
    replayed,
    retryPermitted: false,
    sourceOccurrenceOnly: observed,
    sourceDeclarationOnly: observed,
    publishedInventoryEstablishesCapacity: false,
    checkoutReceiptEstablishesCapacity: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: operationalReservation,
    independentOutcomeEstablished: false,
    paymentPerformed: false,
    userResultCommitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
  const result = Object.freeze({ publicProjection: projection });
  if (observed && Buffer.isBuffer(sourceBytes)) {
    PRIVATE_RESULTS.set(result, { consumed: false, bytes: Buffer.from(sourceBytes),
      sourceOccurrenceHash: event.sourceOccurrenceHash,
      sourceBytesHash: event.sourceBytesHash,
      establishesOperationalCapacity: operationalReservation });
  }
  return result;
}

function appendAmbiguous(state, snapshot, attempt) {
  const event = appendEvent(state, {
    schema: OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.event,
    schemaVersion: "1.0.0",
    sequence: snapshot.events.length + 1,
    previousEventHash: snapshot.headHash,
    eventType: "AMBIGUOUS_NO_RETRY_HOLD",
    recordedAt: instant(state.clock(), "CLOCK"),
    operation: attempt.operation,
    effectIdHash: attempt.effectIdHash,
    idempotencyKeyHash: attempt.idempotencyKeyHash,
    runtimeState: snapshot.runtimeState,
  });
  return publicResult(state, event, false);
}

function finalizeHandle(state, snapshot, attempt, handle, replayed) {
  const response = normalizeResponse({
    sourceBytes: handle.sourceBytes,
    sourceState: handle.sourceState,
    sourceExpiresAt: handle.sourceExpiresAt,
    sourceRecordClass: handle.sourceRecordClass,
  }, attempt.operation);
  const recordedAt = instant(state.clock(), "CLOCK");
  if (response.sourceExpiresAt !== null
    && Date.parse(response.sourceExpiresAt) <= Date.parse(attempt.recordedAt)) {
    return appendAmbiguous(state, snapshot, attempt);
  }
  const runtimeState = nextRuntimeState(snapshot.runtimeState,
    attempt.operation, response.sourceState, state.routeRole);
  const stateExpiresAt = ["REJECTED", "STATE_OBSERVED"].includes(
    response.sourceState)
    ? snapshot.stateExpiresAt : response.sourceExpiresAt;
  const occurrenceBody = {
    transactionRefHash: state.transactionRefHash,
    outcomeIntentRefHash: state.outcomeIntentRefHash,
    routeRole: state.routeRole,
    operation: attempt.operation,
    effectIdHash: attempt.effectIdHash,
    sourceBytesHash: handle.sourceBytesHash,
    sourceState: response.sourceState,
    sourceRecordClass: response.sourceRecordClass,
    sourceExpiresAt: response.sourceExpiresAt,
    observedAt: recordedAt,
    previousSourceOccurrenceHash: snapshot.latestOccurrenceHash,
  };
  const sourceOccurrenceHash = digest(
    OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.sourceOccurrence,
    occurrenceBody);
  const event = appendEvent(state, {
    schema: OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.event,
    schemaVersion: "1.0.0",
    sequence: snapshot.events.length + 1,
    previousEventHash: snapshot.headHash,
    eventType: "SOURCE_OCCURRENCE_OBSERVED",
    recordedAt,
    operation: attempt.operation,
    effectIdHash: attempt.effectIdHash,
    idempotencyKeyHash: attempt.idempotencyKeyHash,
    responseHandleHash: handle.handleHash,
    sourceOccurrenceHash,
    sourceBytesHash: handle.sourceBytesHash,
    sourceState: response.sourceState,
    sourceRecordClass: response.sourceRecordClass,
    sourceExpiresAt: response.sourceExpiresAt,
    previousSourceOccurrenceHash: snapshot.latestOccurrenceHash,
    previousRuntimeState: snapshot.runtimeState,
    runtimeState,
    stateExpiresAt,
  });
  return publicResult(state, event, replayed, response.sourceBytes);
}

async function deliverSourceOccurrenceToSink(state, result) {
  if (state.capabilityState.sourceOccurrenceSink === null
    || result.publicProjection.sourceOccurrenceOnly !== true) return result;
  const privateState = PRIVATE_RESULTS.get(result);
  if (privateState === undefined || privateState.consumed) {
    fail("SOURCE_OCCURRENCE_SINK_PRIVATE_VIEW_UNAVAILABLE");
  }
  /* The sink receives an independently claimable factory-issued view. It must
     never consume the caller's one-use private source claim. */
  const sinkResult = Object.freeze({
    publicProjection: result.publicProjection,
  });
  PRIVATE_RESULTS.set(sinkResult, {
    consumed: false,
    bytes: Buffer.from(privateState.bytes),
    sourceOccurrenceHash: privateState.sourceOccurrenceHash,
    sourceBytesHash: privateState.sourceBytesHash,
    establishesOperationalCapacity:
      privateState.establishesOperationalCapacity,
  });
  let receipt;
  try {
    receipt = await state.capabilityState.sourceOccurrenceSink(sinkResult);
  } catch {
    fail("SOURCE_OCCURRENCE_SINK_FAILED");
  }
  exact(receipt, ["schema", "schemaVersion", "accepted",
    "sourceOccurrenceHash", "duplicateDelivery"],
  "SOURCE_OCCURRENCE_SINK_RECEIPT");
  if (receipt.schema
      !== OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS
        .sourceOccurrenceSinkReceipt
    || receipt.schemaVersion !== "1.0.0" || receipt.accepted !== true
    || receipt.sourceOccurrenceHash
      !== result.publicProjection.sourceOccurrenceHash
    || typeof receipt.duplicateDelivery !== "boolean") {
    fail("SOURCE_OCCURRENCE_SINK_RECEIPT_INVALID");
  }
  return result;
}

function sameAttempt(attempt, operation, command, effect) {
  return attempt.operation === operation && attempt.effectIdHash === effect.effectIdHash
    && attempt.operationNonceHash === command.operationNonceHash
    && attempt.requestBytesHash === command.requestBytesHash
    && attempt.operationExpiresAt === command.expiresAt
    && attempt.expectedPreviousOccurrenceHash
      === command.expectedPreviousOccurrenceHash
    && attempt.triggerOccurrenceHash === command.triggerOccurrenceHash;
}

/** Inject an account/node-local closure. No credential material is accepted. */
export function issueBuyerNativeTransactionAccountCapabilityV1(input = {},
  dependencies = {}) {
  exact(input, ["capabilityRefHash", "accountRefHash", "nodeRefHash",
    "issuedAt", "expiresAt", "supportedOperations"], "CAPABILITY_INPUT");
  const dependencyKeys = Reflect.ownKeys(dependencies);
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies) || Buffer.isBuffer(dependencies)
    || dependencyKeys.some((key) => ![
      "requestImpl", "revalidateImpl", "sourceOccurrenceSink",
    ].includes(key))
    || !Object.hasOwn(dependencies, "requestImpl")
    || !Object.hasOwn(dependencies, "revalidateImpl")) {
    fail("CAPABILITY_DEPENDENCIES_FIELDS_INVALID");
  }
  if (typeof dependencies.requestImpl !== "function"
    || typeof dependencies.revalidateImpl !== "function"
    || (dependencies.sourceOccurrenceSink !== undefined
      && dependencies.sourceOccurrenceSink !== null
      && typeof dependencies.sourceOccurrenceSink !== "function")) {
    fail("CAPABILITY_DEPENDENCIES_INVALID");
  }
  if (!Array.isArray(input.supportedOperations)
    || input.supportedOperations.length < 1
    || new Set(input.supportedOperations).size !== input.supportedOperations.length
    || input.supportedOperations.some((value) =>
      !OUTSIDER_BUYER_NATIVE_TRANSACTION_OPERATIONS_V1.includes(value))) {
    fail("SUPPORTED_OPERATIONS_INVALID");
  }
  const issuedAt = instant(input.issuedAt, "CAPABILITY_ISSUED_AT");
  const expiresAt = instant(input.expiresAt, "CAPABILITY_EXPIRES_AT");
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) fail("CAPABILITY_INTERVAL_INVALID");
  const body = {
    schema: OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.capability,
    schemaVersion: "1.0.0",
    capabilityRefHash: hash(input.capabilityRefHash, "CAPABILITY_REF_HASH"),
    accountRefHash: hash(input.accountRefHash, "ACCOUNT_REF_HASH"),
    nodeRefHash: hash(input.nodeRefHash, "NODE_REF_HASH"),
    issuedAt,
    expiresAt,
    supportedOperations: Object.freeze([...input.supportedOperations]),
    accountLocalClosureInjected: true,
    ambientCredentialsAccepted: false,
    credentialMaterialProjected: false,
    authority: "NONE",
  };
  const capability = Object.freeze({ ...body,
    capabilityBindingHash: digest(body.schema, body) });
  CAPABILITIES.set(capability, Object.freeze({
    requestImpl: dependencies.requestImpl,
    revalidateImpl: dependencies.revalidateImpl,
    sourceOccurrenceSink: dependencies.sourceOccurrenceSink ?? null,
  }));
  return capability;
}

/** Create or cold-reopen one primary or recovery transaction route. */
export function createBuyerNativeTransactionRouteRuntimeV1(input = {},
  dependencies = {}) {
  exact(input, ["journalDirectory", "journalId", "transactionRefHash",
    "outcomeIntentRefHash", "routeRole", "formationExpiresAt"],
  "RUNTIME_INPUT");
  exact(dependencies, ["capability", "clock"], "RUNTIME_DEPENDENCIES");
  const capabilityState = CAPABILITIES.get(dependencies.capability);
  if (capabilityState === undefined) fail("CAPABILITY_NOT_FACTORY_ISSUED");
  if (typeof dependencies.clock !== "function") fail("CLOCK_INVALID");
  if (typeof input.journalDirectory !== "string" || input.journalDirectory === "") {
    fail("JOURNAL_DIRECTORY_INVALID");
  }
  if (typeof input.journalId !== "string" || !JOURNAL_ID.test(input.journalId)) {
    fail("JOURNAL_ID_INVALID");
  }
  if (!OUTSIDER_BUYER_NATIVE_TRANSACTION_ROUTE_ROLES_V1.includes(input.routeRole)) {
    fail("ROUTE_ROLE_INVALID");
  }
  const journalDirectory = path.resolve(input.journalDirectory);
  ensurePrivateDirectory(journalDirectory);
  const responseDirectory = path.join(journalDirectory,
    `${input.journalId}.responses`);
  ensurePrivateDirectory(responseDirectory);
  const state = {
    journalDirectory,
    responseDirectory,
    journalPath: path.join(journalDirectory, `${input.journalId}.events.jsonl`),
    journalId: input.journalId,
    transactionRefHash: hash(input.transactionRefHash, "TRANSACTION_REF_HASH"),
    outcomeIntentRefHash: hash(input.outcomeIntentRefHash,
      "OUTCOME_INTENT_REF_HASH"),
    routeRole: input.routeRole,
    formationExpiresAt: instant(input.formationExpiresAt,
      "FORMATION_EXPIRES_AT"),
    capability: dependencies.capability,
    capabilityState,
    clock: dependencies.clock,
    busy: false,
  };
  initialJournal(state);

  async function execute(operation, rawCommand) {
    if (state.busy) fail("CONCURRENT_OPERATION_FORBIDDEN");
    state.busy = true;
    try {
      if (!state.capability.supportedOperations.includes(operation)) {
        fail("OPERATION_NOT_SUPPORTED_BY_CAPABILITY");
      }
      const command = normalizeCommand(rawCommand, operation);
      const effect = effectFor(state, operation, command);
      let snapshot = replay(state);
      const existing = snapshot.effects.get(effect.effectIdHash);
      if (existing !== undefined) {
        if (!sameAttempt(existing.attempt, operation, command, effect)) {
          fail("IDEMPOTENCY_BINDING_MISMATCH");
        }
        if (existing.terminal?.eventType === "SOURCE_OCCURRENCE_OBSERVED") {
          const handle = readResponseHandle(state, operation, effect.effectIdHash);
          if (handle === null
            || handle.handleHash !== existing.terminal.responseHandleHash) {
            fail("COLD_REPLAY_RESPONSE_HANDLE_MISSING");
          }
          return deliverSourceOccurrenceToSink(state,
            publicResult(state, existing.terminal, true, handle.sourceBytes));
        }
        if (existing.terminal?.eventType === "AMBIGUOUS_NO_RETRY_HOLD") {
          return publicResult(state, existing.terminal, true);
        }
        const recoveredHandle = readResponseHandle(state, operation,
          effect.effectIdHash);
        if (recoveredHandle !== null) {
          return deliverSourceOccurrenceToSink(state,
            finalizeHandle(state, snapshot, existing.attempt,
              recoveredHandle, true));
        }
        return appendAmbiguous(state, snapshot, existing.attempt);
      }
      const usedBy = snapshot.nonceIndex.get(command.operationNonceHash);
      if (usedBy !== undefined) fail("OPERATION_NONCE_REUSED");
      const now = instant(state.clock(), "CLOCK");
      if (Date.parse(now) >= Date.parse(command.expiresAt)
        || Date.parse(command.expiresAt) > Date.parse(state.formationExpiresAt)
        || Date.parse(now) >= Date.parse(state.formationExpiresAt)
        || Date.parse(now) >= Date.parse(state.capability.expiresAt)) {
        fail("OPERATION_EXPIRED");
      }
      if (snapshot.stateExpiresAt !== null
        && Date.parse(now) >= Date.parse(snapshot.stateExpiresAt)) {
        fail("PRIOR_SOURCE_STATE_EXPIRED");
      }
      if (command.expectedPreviousOccurrenceHash
        !== snapshot.latestOccurrenceHash) fail("SOURCE_ANCESTRY_MISMATCH");
      if (!transitionAllowed(snapshot.runtimeState, operation, state.routeRole)) {
        fail("OPERATION_STATE_TRANSITION_INVALID");
      }
      let revalidation;
      try {
        revalidation = await state.capabilityState.revalidateImpl(Object.freeze({
          capabilityRefHash: state.capability.capabilityRefHash,
          accountRefHash: state.capability.accountRefHash,
          nodeRefHash: state.capability.nodeRefHash,
          operation,
          observedAt: now,
        }));
      } catch { fail("CAPABILITY_REVALIDATION_FAILED"); }
      exact(revalidation, ["active", "capabilityRefHash", "accountRefHash",
        "observedAt", "expiresAt"], "CAPABILITY_REVALIDATION");
      if (revalidation.active !== true
        || revalidation.capabilityRefHash !== state.capability.capabilityRefHash
        || revalidation.accountRefHash !== state.capability.accountRefHash
        || instant(revalidation.observedAt, "REVALIDATION_OBSERVED_AT") !== now
        || Date.parse(instant(revalidation.expiresAt,
          "REVALIDATION_EXPIRES_AT")) <= Date.parse(now)
        || Date.parse(revalidation.expiresAt)
          > Date.parse(state.capability.expiresAt)) fail("CAPABILITY_INACTIVE");
      const attempt = appendEvent(state, {
        schema: OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.event,
        schemaVersion: "1.0.0",
        sequence: snapshot.events.length + 1,
        previousEventHash: snapshot.headHash,
        eventType: "OPERATION_ATTEMPTED",
        recordedAt: now,
        operation,
        effectIdHash: effect.effectIdHash,
        operationNonceHash: command.operationNonceHash,
        idempotencyKeyHash: effect.idempotencyKey,
        requestBytesHash: command.requestBytesHash,
        operationExpiresAt: command.expiresAt,
        expectedPreviousOccurrenceHash: command.expectedPreviousOccurrenceHash,
        triggerOccurrenceHash: command.triggerOccurrenceHash,
      });
      snapshot = replay(state);
      let rawResponse;
      try {
        rawResponse = await state.capabilityState.requestImpl(Object.freeze({
          schema: "outsider/buyer-native-transaction-account-request/v1",
          transactionRefHash: state.transactionRefHash,
          outcomeIntentRefHash: state.outcomeIntentRefHash,
          routeRole: state.routeRole,
          operation,
          effectIdHash: effect.effectIdHash,
          idempotencyKey: effect.idempotencyKey,
          requestBytes: Buffer.from(command.requestBytes),
          expiresAt: command.expiresAt,
          expectedPreviousOccurrenceHash:
            command.expectedPreviousOccurrenceHash,
          triggerOccurrenceHash: command.triggerOccurrenceHash,
        }));
      } catch {
        return appendAmbiguous(state, snapshot, attempt);
      }
      let response;
      try { response = normalizeResponse(rawResponse, operation); }
      catch { return appendAmbiguous(state, snapshot, attempt); }
      const handle = persistResponseHandle(state, operation,
        effect.effectIdHash, response);
      return deliverSourceOccurrenceToSink(state,
        finalizeHandle(state, snapshot, attempt, handle, false));
    } finally {
      state.busy = false;
    }
  }

  const body = {
    schema: OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.runtime,
    schemaVersion: "1.0.0",
    ...runtimeBinding(state),
    journalId: state.journalId,
    accountLocalCapabilityInjected: true,
    ambientCredentialsAccepted: false,
    providerRegistryRequired: false,
    authority: "NONE",
    boundary: OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_BOUNDARY,
  };
  const runtime = Object.freeze({ ...body,
    runtimeBindingHash: digest(body.schema, body),
    quote: (command) => execute("QUOTE", command),
    hold: (command) => execute("HOLD", command),
    reserve: (command) => execute("RESERVE", command),
    commit: (command) => execute("COMMIT", command),
    status: (command) => execute("STATUS", command),
    cancel: (command) => execute("CANCEL", command),
    recover: (command) => execute("RECOVER", command),
  });
  RUNTIMES.set(runtime, state);
  return runtime;
}

export function inspectBuyerNativeTransactionRouteRuntimeV1(runtime) {
  if (!RUNTIMES.has(runtime)) fail("RUNTIME_NOT_FACTORY_ISSUED");
  return runtime;
}

/** Claim exact private provider bytes once; never a capacity/outcome claim. */
export function claimBuyerNativeTransactionSourceOccurrenceV1(result) {
  const state = PRIVATE_RESULTS.get(result);
  if (state === undefined || state.consumed) {
    fail("PRIVATE_SOURCE_RESULT_INVALID_OR_REPLAYED");
  }
  state.consumed = true;
  return Object.freeze({
    schema:
      OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.privateSourceClaim,
    schemaVersion: "1.0.0",
    sourceOccurrenceHash: state.sourceOccurrenceHash,
    sourceBytesHash: state.sourceBytesHash,
    sourceBytes: Buffer.from(state.bytes),
    establishesCapacity: state.establishesOperationalCapacity,
    establishesOwnerAuthority: false,
    establishesIndependentOutcome: false,
    publicProjectionPermitted: false,
  });
}
