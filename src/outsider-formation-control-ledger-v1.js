/*
 * Outsider Outcome Formation Engine: persistent formation-control ledger v1.
 *
 * This is a pure, append-only, capability-free control ledger.  It replays one
 * tender-scoped occurrence stream for formation deadlines, one-use nonce
 * reservations/consumptions, idempotency observations, cancellation,
 * revocation, and Outsider staff touches.  Semantic objects may repeat, but
 * every occurrence remains in the denominator and in the predecessor chain.
 *
 * The returned record is a privacy-safe aggregate projection.  Event payloads,
 * nonce hashes, idempotency keys, and staff references remain only in the
 * caller-owned source.  Verification therefore requires that exact source,
 * an independently retained caller source pin, and the expected output hash;
 * an output record alone is never verifiable.
 *
 * Nothing in this module performs I/O, creates authority or capacity, permits
 * action, moves money, or establishes formation completeness.  Before the
 * formation deadline the only non-terminal disposition is automated HOLD.  At
 * or after the deadline an incomplete tender is declined without a human queue.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const MapConstructor = Map;
const MapForEach = Function.prototype.call.bind(Map.prototype.forEach);
const MapGet = Function.prototype.call.bind(Map.prototype.get);
const MapHas = Function.prototype.call.bind(Map.prototype.has);
const MapSet = Function.prototype.call.bind(Map.prototype.set);
const MapSizeGetter = Object.getOwnPropertyDescriptor(Map.prototype, "size").get;
const MapSize = Function.prototype.call.bind(MapSizeGetter);
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIs = Object.is;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const SetSizeGetter = ObjectGetOwnPropertyDescriptor(Set.prototype, "size").get;
const SetSize = Function.prototype.call.bind(SetSizeGetter);
const StringConstructor = String;
const TypeErrorConstructor = TypeError;

const PREFIX = "OUTSIDER_FORMATION_CONTROL_LEDGER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const LEDGER_ID = /^ledger_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_EVENTS = 1_024;
const MAX_TREE_DEPTH = 64;
const MAX_TREE_NODES = 50_000;
const MAX_TREE_KEYS = 65_000;
const MAX_STRING_CODE_UNITS = 16_384;
const MAX_AGGREGATE_STRING_CODE_UNITS = 8 * 1_024 * 1_024;

export const OUTSIDER_FORMATION_CONTROL_LEDGER_V1_SCHEMAS
  = ObjectFreeze({
    event: "outsider/outcome-formation-control-event/v1",
    ledger: "outsider/outcome-formation-control-ledger/v1",
    sourcePin: "outsider/outcome-formation-control-ledger-source-pin/v1",
    verification:
      "outsider/outcome-formation-control-ledger-verification/v1",
  });

export const OUTSIDER_FORMATION_CONTROL_LEDGER_V1_LIMITS
  = ObjectFreeze({
    maximumEvents: MAX_EVENTS,
    maximumTreeDepth: MAX_TREE_DEPTH,
    maximumTreeNodes: MAX_TREE_NODES,
    maximumTreeKeys: MAX_TREE_KEYS,
    maximumStringCodeUnits: MAX_STRING_CODE_UNITS,
    maximumAggregateStringCodeUnits: MAX_AGGREGATE_STRING_CODE_UNITS,
  });

export const OUTSIDER_FORMATION_CONTROL_LEDGER_V1_EVENT_TYPES
  = ObjectFreeze([
    "FORMATION_OPENED",
    "NONCE_RESERVED",
    "NONCE_CONSUMED",
    "IDEMPOTENCY_OBSERVED",
    "FORMATION_CANCELLED",
    "FORMATION_REVOKED",
    "OUTSIDER_STAFF_TOUCH_RECORDED",
  ]);

export const OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES
  = ObjectFreeze({
    forming: "CONTINUE_AUTOMATED_FORMATION_HOLD",
    deadlineDecline: "DECLINE_NOT_HUMAN_QUEUE",
    cancelled: "FORMATION_CANCELLED_NO_RESURRECTION_HOLD",
    revoked: "FORMATION_REVOKED_NO_RESURRECTION_HOLD",
    staffTouch:
      "OUTSIDER_STAFF_TOUCH_PERMANENTLY_DISQUALIFIED_HOLD",
  });

export const OUTSIDER_FORMATION_CONTROL_LEDGER_V1_GENESIS
  = `sha256:${createHash("sha256")
    .update("outsider/outcome-formation-control-occurrence/genesis/v1", "utf8")
    .digest("hex")}`;

export const OUTSIDER_FORMATION_CONTROL_LEDGER_V1_BOUNDARY = deepFreeze({
  position: "PERSISTENT_PER_TENDER_FORMATION_CONTROL_LEDGER_HOLD_ONLY",
  sourceReplayRequired: true,
  exactCallerSourcePinRequired: true,
  outputOnlyVerificationPermitted: false,
  appendOnlyExactPredecessorAndHeadRequired: true,
  occurrenceCensusSeparateFromObjectDedup: true,
  missingOccurrenceMayBeDeduplicated: false,
  globalSourceNonEquivocationEstablished: false,
  sourceCompletenessBeyondCallerPinEstablished: false,
  externallyAnchoredHeadEstablished: false,
  globalLedgerIdUniquenessEstablished: false,
  oneUseNonceReservationPersistedWithinPinnedSource: true,
  oneUseNonceConsumptionPersistedWithinPinnedSource: true,
  nonceGlobalFreshnessEstablished: false,
  cancellationAndRevocationAreIrreversibleWithinLedger: true,
  resurrectionPermitted: false,
  outsiderStaffTouchesAllowed: 0,
  anyOutsiderStaffTouchPermanentlyDisqualifiesCommitment: true,
  staffTouchMayBeClearedOrOverridden: false,
  internalHumanFallbackPermitted: false,
  humanQueueCreated: false,
  incompleteBeforeDeadlineDisposition:
    "CONTINUE_AUTOMATED_FORMATION_HOLD",
  incompleteAtOrAfterDeadlineDisposition: "DECLINE_NOT_HUMAN_QUEUE",
  observedAtIsCallerSupplied: true,
  trustedClockOrExternalTimeAnchorEstablished: false,
  privateEventPayloadsProjected: false,
  nonceHashesProjected: false,
  idempotencyKeysProjected: false,
  staffActorReferencesProjected: false,
  staffTouchTimestampsProjected: false,
  typedGraphModel:
    "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT",
  createsIdentity: false,
  createsDelegation: false,
  createsEpisode: false,
  createsAttempt: false,
  formationCompletenessEstablished: false,
  resourceOwnerAuthorityEstablished: false,
  capacityReserved: false,
  providerContactPerformed: false,
  networkIoPerformed: false,
  filesystemIoPerformed: false,
  priceEstablished: false,
  guaranteeCreated: false,
  settlementPermitted: false,
  custodyEstablished: false,
  moneyMovementEnabled: false,
  enabledCapabilityCount: 0,
  provenAuthorityCount: 0,
  cEnabledSubsetAProven: true,
  consequenceReach: "NONE",
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
});

const EVENT_INPUT_FIELDS = ObjectFreeze([
  "ledgerId", "tenderHash", "typedGraphHash", "episodeHash", "attemptHash",
  "eventType", "ordinal", "previousOccurrenceHash", "recordedAt",
  "occurrenceNonceHash", "payload",
]);
const EVENT_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "recordClass", "ledgerId", "tenderHash",
  "typedGraphHash", "episodeHash", "attemptHash", "eventType", "payload",
  "eventObjectHash", "ordinal", "previousOccurrenceHash", "recordedAt",
  "occurrenceNonceHash", "objectDedupAppliedToOccurrence", "decisionState",
  "authority", "actionReady", "executable", "occurrenceHash",
]);
const SOURCE_FIELDS = ObjectFreeze([
  "ledgerId", "tender", "expectedTenderHash", "observedAt", "events",
  "expectedOccurrenceCount", "expectedHeadHash",
]);
const VERIFY_OPTIONS_FIELDS = ObjectFreeze([
  "source", "expectedSourceHash", "expectedLedgerHash",
]);

const NONCE_PURPOSE_CODES = ObjectFreeze([
  "FORMATION_CONTROL", "RESOURCE_TENDER", "RESOURCE_RESPONSE",
  "SOURCE_REPLAY",
]);
const CANCELLATION_REASON_CODES = ObjectFreeze([
  "PRINCIPAL_CANCELLED", "DELEGATION_CANCELLED", "FORMATION_SUPERSEDED",
  "POLICY_CANCELLED", "OTHER_CONTROLLED",
]);
const REVOCATION_REASON_CODES = ObjectFreeze([
  "DELEGATION_REVOKED", "RESOURCE_OWNER_REVOKED", "RIGHTS_REVOKED",
  "POLICY_REVOKED", "OTHER_CONTROLLED",
]);
const STAFF_TOUCH_CLASS_CODES = ObjectFreeze([
  "MANUAL_SOURCING", "MANUAL_COORDINATION", "MANUAL_VERIFICATION",
  "MANUAL_RECOVERY", "MANUAL_OVERRIDE", "OTHER_INTERNAL_TOUCH",
]);

function fail(code) {
  throw new TypeErrorConstructor(`${PREFIX}${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, writable: true, enumerable: true, configurable: true,
  });
  return array;
}

function define(target, key, value) {
  ObjectDefineProperty(target, key, {
    value, writable: true, enumerable: true, configurable: true,
  });
}

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)
    || SetHas(seen, value)) return value;
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return ObjectFreeze(value);
}

/* Copy before semantic reads.  Shared references, accessors, proxies, symbols,
 * sparse/decorated arrays, exotic prototypes, and over-budget sources fail
 * closed, so later replay cannot observe a different hostile JS value. */
function snapshotStrict(value, state = {
  nodes: 0, keys: 0, stringCodeUnits: 0, seen: new SetConstructor(),
}, depth = 0) {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    if (value.length > MAX_STRING_CODE_UNITS) fail("STRING_BUDGET_EXCEEDED");
    state.stringCodeUnits += value.length;
    if (state.stringCodeUnits > MAX_AGGREGATE_STRING_CODE_UNITS) {
      fail("AGGREGATE_STRING_BUDGET_EXCEEDED");
    }
    return value;
  }
  if (typeof value === "number") {
    if (!NumberIsFinite(value) || ObjectIs(value, -0)) {
      fail("NUMBER_INVALID");
    }
    return value;
  }
  if (typeof value !== "object") fail("SOURCE_VALUE_TYPE_INVALID");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (depth > MAX_TREE_DEPTH) fail("TREE_DEPTH_BUDGET_EXCEEDED");
  if (SetHas(state.seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(state.seen, value);
  state.nodes += 1;
  if (state.nodes > MAX_TREE_NODES) fail("TREE_NODE_BUDGET_EXCEEDED");
  const array = ArrayIsArray(value);
  const prototype = ObjectGetPrototypeOf(value);
  if ((array && prototype !== ArrayPrototype)
    || (!array && prototype !== ObjectPrototype && prototype !== null)) {
    fail("SOURCE_PROTOTYPE_INVALID");
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  state.keys += keys.length;
  if (state.keys > MAX_TREE_KEYS) fail("TREE_KEY_BUDGET_EXCEEDED");
  for (let index = 0; index < keys.length; index += 1) {
    if (typeof keys[index] !== "string") fail("SOURCE_DESCRIPTOR_INVALID");
    state.stringCodeUnits += keys[index].length;
    if (state.stringCodeUnits > MAX_AGGREGATE_STRING_CODE_UNITS) {
      fail("AGGREGATE_STRING_BUDGET_EXCEEDED");
    }
  }
  if (array) {
    const lengthDescriptor = descriptors.length;
    if (!lengthDescriptor || !ObjectHasOwn(lengthDescriptor, "value")
      || !NumberIsSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0 || lengthDescriptor.value > MAX_EVENTS
      || keys.length !== lengthDescriptor.value + 1) {
      fail("ARRAY_INVALID");
    }
    const result = [];
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = descriptors[StringConstructor(index)];
      if (!descriptor || !ObjectHasOwn(descriptor, "value")
        || descriptor.enumerable !== true) fail("ARRAY_INVALID");
      append(result, snapshotStrict(descriptor.value, state, depth + 1));
    }
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (key !== "length" && (typeof key !== "string"
        || !RegExpTest(/^(?:0|[1-9]\d*)$/u, key))) fail("ARRAY_INVALID");
    }
    return result;
  }
  const result = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !descriptor
      || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail("SOURCE_DESCRIPTOR_INVALID");
    define(result, key, snapshotStrict(descriptor.value, state, depth + 1));
  }
  return result;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || ObjectGetPrototypeOf(value) !== ObjectPrototype) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  const expected = new SetConstructor();
  for (let index = 0; index < fields.length; index += 1) {
    SetAdd(expected, fields[index]);
  }
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !SetHas(expected, key) || !descriptor
      || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function denseEvents(value) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length < 1 || value.length > MAX_EVENTS) fail("EVENTS_INVALID");
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function ledgerId(value) {
  if (typeof value !== "string" || !RegExpTest(LEDGER_ID, value)) {
    fail("LEDGER_ID_INVALID");
  }
  return value;
}

function safeInteger(value, minimum, maximum, code) {
  if (!NumberIsSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)) {
    fail(`${code}_INVALID`);
  }
  const milliseconds = DateParse(value);
  if (!NumberIsFinite(milliseconds)
    || DateToISOString(new DateConstructor(milliseconds)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function allowed(value, values, code) {
  for (let index = 0; index < values.length; index += 1) {
    if (value === values[index]) return value;
  }
  fail(`${code}_INVALID`);
}

function digest(domain, value) {
  const instance = createHash("sha256");
  HashUpdate(instance, domain, "utf8");
  HashUpdate(instance, "\0", "utf8");
  HashUpdate(instance, canonicalizeStrict(value), "utf8");
  return `sha256:${HashDigest(instance, "hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function normalizePayload(eventType, payload) {
  if (eventType === "FORMATION_OPENED") {
    exactObject(payload, ["formationDeadline"], "OPENED_PAYLOAD");
    return { formationDeadline: instant(payload.formationDeadline,
      "FORMATION_DEADLINE") };
  }
  if (eventType === "NONCE_RESERVED") {
    exactObject(payload, ["nonceHash", "purposeCode", "reservationExpiresAt"],
      "NONCE_RESERVED_PAYLOAD");
    return {
      nonceHash: hash(payload.nonceHash, "NONCE_HASH"),
      purposeCode: allowed(payload.purposeCode, NONCE_PURPOSE_CODES,
        "NONCE_PURPOSE_CODE"),
      reservationExpiresAt: instant(payload.reservationExpiresAt,
        "RESERVATION_EXPIRES_AT"),
    };
  }
  if (eventType === "NONCE_CONSUMED") {
    exactObject(payload, ["nonceHash", "reservationOccurrenceHash"],
      "NONCE_CONSUMED_PAYLOAD");
    return {
      nonceHash: hash(payload.nonceHash, "NONCE_HASH"),
      reservationOccurrenceHash: hash(payload.reservationOccurrenceHash,
        "RESERVATION_OCCURRENCE_HASH"),
    };
  }
  if (eventType === "IDEMPOTENCY_OBSERVED") {
    exactObject(payload, ["idempotencyKeyHash", "objectHash"],
      "IDEMPOTENCY_PAYLOAD");
    return {
      idempotencyKeyHash: hash(payload.idempotencyKeyHash,
        "IDEMPOTENCY_KEY_HASH"),
      objectHash: hash(payload.objectHash, "IDEMPOTENCY_OBJECT_HASH"),
    };
  }
  if (eventType === "FORMATION_CANCELLED") {
    exactObject(payload, ["reasonCode"], "CANCELLED_PAYLOAD");
    return { reasonCode: allowed(payload.reasonCode,
      CANCELLATION_REASON_CODES, "CANCELLATION_REASON_CODE") };
  }
  if (eventType === "FORMATION_REVOKED") {
    exactObject(payload, ["reasonCode"], "REVOKED_PAYLOAD");
    return { reasonCode: allowed(payload.reasonCode,
      REVOCATION_REASON_CODES, "REVOCATION_REASON_CODE") };
  }
  exactObject(payload, ["staffActorRefHash", "touchClassCode"],
    "STAFF_TOUCH_PAYLOAD");
  return {
    staffActorRefHash: hash(payload.staffActorRefHash,
      "STAFF_ACTOR_REF_HASH"),
    touchClassCode: allowed(payload.touchClassCode, STAFF_TOUCH_CLASS_CODES,
      "STAFF_TOUCH_CLASS_CODE"),
  };
}

/** Build one immutable occurrence.  It is not authority and is not public. */
export function createFormationControlEventV1(input = {}) {
  const source = snapshotStrict(input);
  exactObject(source, EVENT_INPUT_FIELDS, "EVENT_INPUT");
  const eventType = allowed(source.eventType,
    OUTSIDER_FORMATION_CONTROL_LEDGER_V1_EVENT_TYPES, "EVENT_TYPE");
  const fixed = {
    ledgerId: ledgerId(source.ledgerId),
    tenderHash: hash(source.tenderHash, "TENDER_HASH"),
    typedGraphHash: hash(source.typedGraphHash, "TYPED_GRAPH_HASH"),
    episodeHash: hash(source.episodeHash, "EPISODE_HASH"),
    attemptHash: hash(source.attemptHash, "ATTEMPT_HASH"),
    eventType,
    payload: normalizePayload(eventType, source.payload),
  };
  const eventObjectHash = digest(
    "outsider/outcome-formation-control-semantic-object/v1", fixed);
  const ordinal = safeInteger(source.ordinal, 1, MAX_EVENTS,
    "EVENT_ORDINAL");
  const previousOccurrenceHash = hash(source.previousOccurrenceHash,
    "PREVIOUS_OCCURRENCE_HASH");
  const recordedAt = instant(source.recordedAt, "RECORDED_AT");
  const occurrenceNonceHash = hash(source.occurrenceNonceHash,
    "OCCURRENCE_NONCE_HASH");
  const body = {
    schema: OUTSIDER_FORMATION_CONTROL_LEDGER_V1_SCHEMAS.event,
    schemaVersion: "1.0.0",
    recordClass: "APPEND_ONLY_FORMATION_CONTROL_OCCURRENCE_NO_AUTHORITY",
    ...fixed,
    eventObjectHash,
    ordinal,
    previousOccurrenceHash,
    recordedAt,
    occurrenceNonceHash,
    objectDedupAppliedToOccurrence: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, occurrenceHash: digest(
    OUTSIDER_FORMATION_CONTROL_LEDGER_V1_SCHEMAS.event, body) });
}

function eventInputFromRecord(record) {
  return {
    ledgerId: record.ledgerId,
    tenderHash: record.tenderHash,
    typedGraphHash: record.typedGraphHash,
    episodeHash: record.episodeHash,
    attemptHash: record.attemptHash,
    eventType: record.eventType,
    ordinal: record.ordinal,
    previousOccurrenceHash: record.previousOccurrenceHash,
    recordedAt: record.recordedAt,
    occurrenceNonceHash: record.occurrenceNonceHash,
    payload: record.payload,
  };
}

function verifyEventRecord(record) {
  exactObject(record, EVENT_FIELDS, "EVENT");
  if (record.schema !== OUTSIDER_FORMATION_CONTROL_LEDGER_V1_SCHEMAS.event
    || record.schemaVersion !== "1.0.0"
    || record.recordClass
      !== "APPEND_ONLY_FORMATION_CONTROL_OCCURRENCE_NO_AUTHORITY"
    || record.objectDedupAppliedToOccurrence !== false
    || record.decisionState !== "HOLD" || record.authority !== "NONE"
    || record.actionReady !== false || record.executable !== false) {
    fail("EVENT_FIXED_STATE_INVALID");
  }
  const rebuilt = createFormationControlEventV1(eventInputFromRecord(record));
  if (!same(record, rebuilt)) fail("EVENT_SOURCE_REBUILD_FAILED");
  return rebuilt;
}

function checkedTender(tender, expectedTenderHash) {
  const expected = hash(expectedTenderHash, "EXPECTED_TENDER_HASH");
  const checked = verifyOutsiderOutcomeTenderV1(tender,
    { expectedTenderHash: expected });
  if (!checked.ok || checked.structuralTenderVerified !== true
    || checked.derivationVerified !== true || checked.selfHashVerified !== true
    || checked.expectedHashMatched !== true
    || checked.typedGraphReferencesPreserved !== true
    || checked.zeroInternalOpsVerified !== true
    || checked.authorizationEstablished !== false
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false
    || tender.zeroInternalOps.outsiderStaffInterventionsAllowed !== 0
    || tender.zeroInternalOps.humanQueueFallbackAllowed !== false
    || tender.zeroInternalOps.failureDisposition !== "DECLINE_NOT_HUMAN_QUEUE") {
    fail("TENDER_SOURCE_REPLAY_FAILED");
  }
  return tender;
}

function sourceSnapshot(input) {
  const source = snapshotStrict(input);
  exactObject(source, SOURCE_FIELDS, "SOURCE");
  denseEvents(source.events);
  ledgerId(source.ledgerId);
  hash(source.expectedTenderHash, "EXPECTED_TENDER_HASH");
  instant(source.observedAt, "OBSERVED_AT");
  safeInteger(source.expectedOccurrenceCount, 1, MAX_EVENTS,
    "EXPECTED_OCCURRENCE_COUNT");
  hash(source.expectedHeadHash, "EXPECTED_HEAD_HASH");
  return source;
}

/** Domain-separated caller-retained pin for the complete exact source tree. */
export function createFormationControlLedgerSourcePinV1(input = {}) {
  const source = sourceSnapshot(input);
  return digest(OUTSIDER_FORMATION_CONTROL_LEDGER_V1_SCHEMAS.sourcePin,
    source);
}

function eventTypeCounts() {
  return {
    formationOpened: 0,
    nonceReserved: 0,
    nonceConsumed: 0,
    idempotencyObserved: 0,
    formationCancelled: 0,
    formationRevoked: 0,
    outsiderStaffTouchRecorded: 0,
  };
}

function incrementType(counts, eventType) {
  if (eventType === "FORMATION_OPENED") counts.formationOpened += 1;
  else if (eventType === "NONCE_RESERVED") counts.nonceReserved += 1;
  else if (eventType === "NONCE_CONSUMED") counts.nonceConsumed += 1;
  else if (eventType === "IDEMPOTENCY_OBSERVED") {
    counts.idempotencyObserved += 1;
  } else if (eventType === "FORMATION_CANCELLED") {
    counts.formationCancelled += 1;
  } else if (eventType === "FORMATION_REVOKED") {
    counts.formationRevoked += 1;
  } else counts.outsiderStaffTouchRecorded += 1;
}

/** Replay a complete caller-owned control source into a public-safe aggregate. */
export function createFormationControlLedgerV1(input = {}) {
  const source = sourceSnapshot(input);
  const tender = checkedTender(source.tender, source.expectedTenderHash);
  const id = ledgerId(source.ledgerId);
  const observedAt = instant(source.observedAt, "OBSERVED_AT");
  const observedAtMs = DateParse(observedAt);
  const deadlineMs = DateParse(tender.formationDeadline);
  if (observedAtMs < DateParse(tender.compiledAt)) {
    fail("OBSERVED_BEFORE_TENDER_COMPILED");
  }
  if (source.events.length !== source.expectedOccurrenceCount) {
    fail("OCCURRENCE_DENOMINATOR_MISMATCH");
  }

  const binding = {
    ledgerId: id,
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
  };
  const counts = eventTypeCounts();
  const occurrenceNonces = new SetConstructor();
  const eventObjects = new SetConstructor();
  const idempotencyBindings = new MapConstructor();
  const idempotencyObjects = new SetConstructor();
  const nonceReservations = new MapConstructor();
  let previous = OUTSIDER_FORMATION_CONTROL_LEDGER_V1_GENESIS;
  let previousTimeMs = DateParse(tender.compiledAt);
  let openedAt = null;
  let cancelledAt = null;
  let revokedAt = null;
  let firstStaffTouchAt = null;
  let terminalLifecycle = null;
  for (let index = 0; index < source.events.length; index += 1) {
    const event = verifyEventRecord(source.events[index]);
    if (event.ledgerId !== binding.ledgerId
      || event.tenderHash !== binding.tenderHash
      || event.typedGraphHash !== binding.typedGraphHash
      || event.episodeHash !== binding.episodeHash
      || event.attemptHash !== binding.attemptHash) {
      fail("EVENT_TENDER_OR_TYPED_GRAPH_SPLICE");
    }
    if (event.ordinal !== index + 1
      || event.previousOccurrenceHash !== previous) {
      fail("APPEND_ONLY_PREDECESSOR_CHAIN_INVALID");
    }
    const eventTimeMs = DateParse(event.recordedAt);
    if (eventTimeMs < previousTimeMs || eventTimeMs > observedAtMs) {
      fail("EVENT_TIME_ORDER_INVALID");
    }
    if (SetHas(occurrenceNonces, event.occurrenceNonceHash)) {
      fail("OCCURRENCE_NONCE_REPLAY_DETECTED");
    }
    SetAdd(occurrenceNonces, event.occurrenceNonceHash);
    SetAdd(eventObjects, event.eventObjectHash);
    incrementType(counts, event.eventType);

    if (index === 0) {
      if (event.eventType !== "FORMATION_OPENED"
        || event.previousOccurrenceHash
          !== OUTSIDER_FORMATION_CONTROL_LEDGER_V1_GENESIS
        || event.payload.formationDeadline !== tender.formationDeadline
        || eventTimeMs >= deadlineMs) fail("GENESIS_OPEN_EVENT_INVALID");
      openedAt = event.recordedAt;
    } else if (event.eventType === "FORMATION_OPENED") {
      fail("FORMATION_REOPEN_OR_DUPLICATE_OPEN_FORBIDDEN");
    }

    if (terminalLifecycle !== null
      && event.eventType !== "IDEMPOTENCY_OBSERVED"
      && event.eventType !== "OUTSIDER_STAFF_TOUCH_RECORDED") {
      fail("TERMINAL_LIFECYCLE_DESCENDANT_FORBIDDEN");
    }

    if (event.eventType === "NONCE_RESERVED") {
      if (firstStaffTouchAt !== null) {
        fail("NONCE_RESERVATION_AFTER_STAFF_TOUCH_FORBIDDEN");
      }
      const expiresAtMs = DateParse(event.payload.reservationExpiresAt);
      if (eventTimeMs >= deadlineMs || expiresAtMs <= eventTimeMs
        || expiresAtMs > deadlineMs
        || MapHas(nonceReservations, event.payload.nonceHash)) {
        fail("NONCE_RESERVATION_INVALID_OR_REUSED");
      }
      MapSet(nonceReservations, event.payload.nonceHash, {
        occurrenceHash: event.occurrenceHash,
        recordedAtMs: eventTimeMs,
        expiresAtMs,
        consumedAt: null,
      });
    } else if (event.eventType === "NONCE_CONSUMED") {
      const reservation = MapGet(nonceReservations, event.payload.nonceHash);
      if (!reservation
        || event.payload.reservationOccurrenceHash
          !== reservation.occurrenceHash
        || reservation.consumedAt !== null
        || eventTimeMs < reservation.recordedAtMs
        || eventTimeMs >= reservation.expiresAtMs) {
        fail("NONCE_CONSUMPTION_INVALID_REPLAYED_OR_EXPIRED");
      }
      reservation.consumedAt = event.recordedAt;
    } else if (event.eventType === "IDEMPOTENCY_OBSERVED") {
      const existing = MapGet(idempotencyBindings,
        event.payload.idempotencyKeyHash);
      if (existing !== undefined && existing !== event.payload.objectHash) {
        fail("IDEMPOTENCY_KEY_OBJECT_SPLICE");
      }
      MapSet(idempotencyBindings, event.payload.idempotencyKeyHash,
        event.payload.objectHash);
      SetAdd(idempotencyObjects, event.payload.objectHash);
    } else if (event.eventType === "FORMATION_CANCELLED") {
      cancelledAt = event.recordedAt;
      terminalLifecycle = "CANCELLED";
    } else if (event.eventType === "FORMATION_REVOKED") {
      revokedAt = event.recordedAt;
      terminalLifecycle = "REVOKED";
    } else if (event.eventType === "OUTSIDER_STAFF_TOUCH_RECORDED"
      && firstStaffTouchAt === null) {
      firstStaffTouchAt = event.recordedAt;
    }
    previous = event.occurrenceHash;
    previousTimeMs = eventTimeMs;
  }
  if (previous !== source.expectedHeadHash) fail("HEAD_PIN_MISMATCH");

  let consumedReservationCount = 0;
  let liveUnconsumedReservationCount = 0;
  let expiredUnconsumedReservationCount = 0;
  MapForEach(nonceReservations, (reservation) => {
    if (reservation.consumedAt !== null) consumedReservationCount += 1;
    else if (observedAtMs < reservation.expiresAtMs) {
      liveUnconsumedReservationCount += 1;
    } else expiredUnconsumedReservationCount += 1;
  });

  const deadlineReached = observedAtMs >= deadlineMs;
  const staffTouched = counts.outsiderStaffTouchRecorded > 0;
  const cancelled = cancelledAt !== null;
  const revoked = revokedAt !== null;
  const permanentlyDisqualified = staffTouched || cancelled || revoked
    || deadlineReached;
  const controlState = staffTouched
    ? OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.staffTouch
    : revoked
      ? OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.revoked
      : cancelled
        ? OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.cancelled
        : deadlineReached
          ? OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.deadlineDecline
          : OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.forming;
  const disposition = permanentlyDisqualified
    ? "DECLINE_NOT_HUMAN_QUEUE"
    : "CONTINUE_AUTOMATED_FORMATION_HOLD";
  const uniqueEventObjectCount = SetSize(eventObjects);
  const uniqueIdempotencyKeyCount = MapSize(idempotencyBindings);
  const uniqueIdempotencyObjectCount = SetSize(idempotencyObjects);
  const body = {
    schema: OUTSIDER_FORMATION_CONTROL_LEDGER_V1_SCHEMAS.ledger,
    schemaVersion: "1.0.0",
    recordClass:
      "PUBLIC_SAFE_PER_TENDER_FORMATION_CONTROL_AGGREGATE_HOLD_ONLY",
    ledgerId: id,
    observedAt,
    tenderBinding: {
      tenderHash: tender.tenderHash,
      workOrderHash: tender.workOrderHash,
      typedGraphHash: tender.typedGraph.typedGraphHash,
      principalEpochProjectionHash:
        tender.typedGraph.principalEpoch.principalEpochProjectionHash,
      accountableDeploymentSubjectHash:
        tender.typedGraph.accountableDeployment
          .accountableDeploymentSubjectHash,
      runtimeInstanceHash: tender.typedGraph.runtime.runtimeInstanceHash,
      embodimentRevisionHash:
        tender.typedGraph.embodiment.embodimentRevisionHash,
      delegationEdgeHash: tender.typedGraph.delegation.delegationEdgeHash,
      episodeHash: tender.typedGraph.episode.episodeHash,
      networkCompleteEpisodeJoinHash:
        tender.typedGraph.episode.networkCompleteEpisodeJoinHash,
      attemptHash: tender.typedGraph.attempt.attemptHash,
      exactTenderSourceReplayed: true,
    },
    appendOnlyControl: {
      genesisHash: OUTSIDER_FORMATION_CONTROL_LEDGER_V1_GENESIS,
      currentHeadHash: previous,
      expectedHeadMatched: true,
      exactPredecessorChainReplayed: true,
      noResurrectionVerified: true,
      openedAt,
      cancelled,
      cancelledAt,
      revoked,
      revokedAt,
    },
    occurrenceCensus: {
      expectedOccurrenceCount: source.expectedOccurrenceCount,
      totalOccurrenceCount: source.events.length,
      occurrenceDenominatorReplayed: true,
      uniqueEventObjectCount,
      duplicateEventObjectOccurrenceCount:
        source.events.length - uniqueEventObjectCount,
      objectDedupAppliedToOccurrence: false,
      eventTypeCounts: counts,
      occurrenceNonceUniqueWithinPinnedSource: true,
      occurrenceCompletenessBeyondCallerPinEstablished: false,
      externallyAnchoredOccurrenceDenominator: false,
    },
    nonceLifecycle: {
      reservationOccurrenceCount: counts.nonceReserved,
      consumptionOccurrenceCount: counts.nonceConsumed,
      uniqueReservedNonceCount: MapSize(nonceReservations),
      consumedReservationCount,
      liveUnconsumedReservationCount,
      expiredUnconsumedReservationCount,
      usableReservationCount: permanentlyDisqualified
        ? 0 : liveUnconsumedReservationCount,
      everyConsumptionBoundToExactReservationOccurrence: true,
      duplicateReservationOrConsumptionAccepted: false,
      nonceHashesProjected: false,
      nonceGlobalFreshnessEstablished: false,
      noncePersistenceEstablishedWithinExactPinnedSource: true,
    },
    idempotencyCensus: {
      occurrenceCount: counts.idempotencyObserved,
      uniqueKeyCount: uniqueIdempotencyKeyCount,
      uniqueObjectCount: uniqueIdempotencyObjectCount,
      repeatedOccurrenceCount:
        counts.idempotencyObserved - uniqueIdempotencyKeyCount,
      objectDedupReductionCount:
        counts.idempotencyObserved - uniqueIdempotencyObjectCount,
      everyOccurrenceCounted: true,
      oneKeyMayBindMultipleObjects: false,
      idempotencyKeysProjected: false,
      objectHashesProjected: false,
    },
    formationDeadline: {
      deadline: tender.formationDeadline,
      reached: deadlineReached,
      formationCompletenessEstablishedByThisLedger: false,
      incompleteForThisControlDecision: true,
      beforeDeadlineDisposition: deadlineReached ? null
        : "CONTINUE_AUTOMATED_FORMATION_HOLD",
      atOrAfterDeadlineDisposition: deadlineReached
        ? "DECLINE_NOT_HUMAN_QUEUE" : null,
      manualExtensionPermitted: false,
      manualOverridePermitted: false,
      observedAtIsCallerSupplied: true,
      trustedClockOrExternalTimeAnchorEstablished: false,
    },
    zeroInternalOps: {
      outsiderStaffTouchesAllowed: 0,
      outsiderStaffTouchOccurrenceCount:
        counts.outsiderStaffTouchRecorded,
      anyOutsiderStaffTouchRecorded: staffTouched,
      staffTouchPermanentlyDisqualifiesCommitment: staffTouched,
      staffTouchMayBeClearedOrOverridden: false,
      internalHumanFallbackPermitted: false,
      humanQueueCreated: false,
      declineInsteadOfHumanQueue: disposition === "DECLINE_NOT_HUMAN_QUEUE",
    },
    controlDecision: {
      controlState,
      disposition,
      permanentlyDisqualifiedFromCommitment: permanentlyDisqualified,
      userOutcomePromiseIssued: false,
      formationCommitmentAuthorized: false,
      manualOverridePermitted: false,
      humanQueueFallbackAllowed: false,
    },
    sourceReplayBoundary: {
      exactSourceRequiredForVerification: true,
      callerSourcePinRequired: true,
      outputOnlyVerificationPermitted: false,
      privateSourceProjected: false,
      eventPayloadsProjected: false,
      sourcePinProjected: false,
      globalSourceNonEquivocationEstablished: false,
      sourceCompletenessBeyondCallerPinEstablished: false,
      externalHeadAnchorEstablished: false,
      opaqueReferencePreimagePrivacyEstablished: false,
    },
    authorityBoundary: {
      enabledCapabilities: [],
      provenAuthorities: [],
      enabledCapabilityCount: 0,
      provenAuthorityCount: 0,
      cEnabledSubsetAProven: true,
      consequenceReach: "NONE",
      structuralConformanceMintsAuthority: false,
      resourceOwnerAuthorityEstablished: false,
      capacityReserved: false,
      actionReady: false,
      executable: false,
      authority: "NONE",
    },
    economicBoundary: {
      price: null,
      priceEstablished: false,
      guarantee: null,
      guaranteeCreated: false,
      settlement: null,
      settlementPermitted: false,
      custodyEstablished: false,
      moneyMovementEnabled: false,
    },
    result: controlState,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    boundary: OUTSIDER_FORMATION_CONTROL_LEDGER_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, ledgerHash: digest(
    OUTSIDER_FORMATION_CONTROL_LEDGER_V1_SCHEMAS.ledger, body) });
}

function verificationFailure(error) {
  let message = `${PREFIX}UNTRUSTED_FAILURE`;
  try {
    if (error instanceof ErrorConstructor && typeof error.message === "string"
      && RegExpTest(/^OUTSIDER_FORMATION_CONTROL_LEDGER_V1_[A-Z0-9_]+$/u,
        error.message)) message = error.message;
  } catch {
    message = `${PREFIX}UNTRUSTED_FAILURE`;
  }
  return deepFreeze({
    schema: OUTSIDER_FORMATION_CONTROL_LEDGER_V1_SCHEMAS.verification,
    ok: false,
    exactSourceReplayVerified: false,
    callerSourcePinMatched: false,
    ledgerRecordRebuilt: false,
    expectedLedgerHashMatched: false,
    appendOnlyPredecessorAndHeadVerified: false,
    occurrenceDenominatorReplayed: false,
    nonceLifecycleReplayed: false,
    staffTouchAccountingReplayed: false,
    outputOnlyVerificationPermitted: false,
    formationCommitmentAuthorized: false,
    capacityReserved: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    error: message,
    boundary: OUTSIDER_FORMATION_CONTROL_LEDGER_V1_BOUNDARY,
  });
}

/** Verify only by exact source replay plus caller-retained source/output pins. */
export function verifyFormationControlLedgerV1(record, options = {}) {
  try {
    const checkedRecord = snapshotStrict(record);
    const checkedOptions = snapshotStrict(options);
    exactObject(checkedOptions, VERIFY_OPTIONS_FIELDS, "VERIFY_OPTIONS");
    const expectedSourceHash = hash(checkedOptions.expectedSourceHash,
      "EXPECTED_SOURCE_HASH");
    const source = sourceSnapshot(checkedOptions.source);
    const actualSourceHash = digest(
      OUTSIDER_FORMATION_CONTROL_LEDGER_V1_SCHEMAS.sourcePin, source);
    if (actualSourceHash !== expectedSourceHash) {
      fail("EXPECTED_SOURCE_HASH_MISMATCH");
    }
    const rebuilt = createFormationControlLedgerV1(source);
    if (!same(checkedRecord, rebuilt)) fail("LEDGER_SOURCE_REBUILD_FAILED");
    const expectedLedgerHash = hash(checkedOptions.expectedLedgerHash,
      "EXPECTED_LEDGER_HASH");
    if (rebuilt.ledgerHash !== expectedLedgerHash) {
      fail("EXPECTED_LEDGER_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: OUTSIDER_FORMATION_CONTROL_LEDGER_V1_SCHEMAS.verification,
      ok: true,
      exactSourceReplayVerified: true,
      callerSourcePinMatched: true,
      ledgerRecordRebuilt: true,
      expectedLedgerHashMatched: true,
      tenderHash: rebuilt.tenderBinding.tenderHash,
      typedGraphHash: rebuilt.tenderBinding.typedGraphHash,
      episodeHash: rebuilt.tenderBinding.episodeHash,
      attemptHash: rebuilt.tenderBinding.attemptHash,
      ledgerHash: rebuilt.ledgerHash,
      currentHeadHash: rebuilt.appendOnlyControl.currentHeadHash,
      occurrenceCount: rebuilt.occurrenceCensus.totalOccurrenceCount,
      controlState: rebuilt.controlDecision.controlState,
      disposition: rebuilt.controlDecision.disposition,
      appendOnlyPredecessorAndHeadVerified: true,
      occurrenceDenominatorReplayed: true,
      nonceLifecycleReplayed: true,
      staffTouchAccountingReplayed: true,
      outputOnlyVerificationPermitted: false,
      formationCommitmentAuthorized: false,
      capacityReserved: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      consequenceReach: "NONE",
      boundary: OUTSIDER_FORMATION_CONTROL_LEDGER_V1_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
