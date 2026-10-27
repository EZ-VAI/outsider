/*
 * Local, commitment-only checkpoints for the network lifecycle export.
 *
 * This module never fetches, submits, signs, or anchors anything.  It replays a
 * complete, unfiltered `outsider/network-quarantine-export/v1` page sequence,
 * seals only the registry/count/tail and the exact export-page byte set, and
 * prepares a digest-only local outbox request.  A caller-pinned checkpoint hash
 * prevents silent local resealing relative to that pin; it is not an external
 * timestamp, an independent witness, WORM storage, or proof that the exporter
 * did not omit events before producing ordinal 1.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";
import { canonicalizeStrict } from "./canonical.js";
import {
  NETWORK_INTAKE_BOUNDARY,
  NETWORK_INTAKE_LANES,
  encodeNetworkIntakePayload,
  networkIntakeDigest,
} from "./outsider-network-intake.js";

const ArrayIsArray = Array.isArray;
const ArrayIncludes = Function.prototype.call.bind(Array.prototype.includes);
const ArrayJoin = Function.prototype.call.bind(Array.prototype.join);
const ArrayMap = Function.prototype.call.bind(Array.prototype.map);
const ArrayPrototype = Array.prototype;
const ArrayPush = Function.prototype.call.bind(Array.prototype.push);
const ArraySome = Function.prototype.call.bind(Array.prototype.some);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferPrototype = Buffer.prototype;
const BufferEquals = Function.prototype.call.bind(BufferPrototype.equals);
const BufferToString = Function.prototype.call.bind(BufferPrototype.toString);
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const JsonParse = JSON.parse;
const JsonStringify = JSON.stringify;
const MapConstructor = Map;
const MapForEach = Function.prototype.call.bind(Map.prototype.forEach);
const MapGet = Function.prototype.call.bind(Map.prototype.get);
const MapHas = Function.prototype.call.bind(Map.prototype.has);
const MapSet = Function.prototype.call.bind(Map.prototype.set);
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Function.prototype.call.bind(Object.prototype.hasOwnProperty);
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const SetConstructor = Set;
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringSlice = Function.prototype.call.bind(String.prototype.slice);
const StringStartsWith = Function.prototype.call.bind(String.prototype.startsWith);
const HashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "update").value);
const HashDigest = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "digest").value);

const HASH = /^sha256:[a-f0-9]{64}$/u;
const REGISTRY_ID = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u;
const SUBMISSION_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/u;
const REASON_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const EVENT_TYPE
  = /^(?:RESERVED|QUARANTINED|EXPIRED_UNUSED|REVOKED|PURGED|REJECTED_[A-Z0-9_]+)$/u;
const MAX_SOURCE_PAGES = 100_000;
const MAX_PAGE_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024;
const MAX_TREE_DEPTH = 96;
const MAX_TREE_NODES = 2_000_000;

export const NETWORK_LIFECYCLE_HEAD_SCHEMAS = ObjectFreeze({
  exportPage: "outsider/network-quarantine-export/v1",
  event: "outsider/network-intake-event/v2",
  checkpoint: "outsider/network-lifecycle-head-checkpoint/v1",
  outboxRequest: "outsider/network-lifecycle-head-anchor-outbox-request/v1",
  verification: "outsider/network-lifecycle-head-checkpoint-verification/v1",
});

export const NETWORK_LIFECYCLE_EVENT_GENESIS = `sha256:${createHash("sha256")
  .update("outsider/network-intake-events/genesis/v1", "utf8").digest("hex")}`;

export const NETWORK_LIFECYCLE_HEAD_USE_BOUNDARY = deepFreeze({
  authority: "NONE",
  authorityGrants: 0,
  actionAuthorized: false,
  actionAdmissions: 0,
  productionTrainingAuthorized: false,
  trainingRows: 0,
  causalExperienceUnits: 0,
  pricingAuthorized: false,
  guaranteeEstablished: false,
  settlementAuthorized: false,
});

const SOURCE_USE_BOUNDARY = deepFreeze({
  ...NETWORK_INTAKE_BOUNDARY,
  disposition: "QUARANTINED",
  automaticTraining: false,
  trainingRows: 0,
  authorityGrants: 0,
  actionAdmissions: 0,
  ceuUnits: 0,
  permitsAuthority: false,
  permitsAction: false,
  permitsCeu: false,
  permitsCuratePromotion: false,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
});

function fail(code) {
  throw new Error(`NETWORK_LIFECYCLE_HEAD_${code}`);
}

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || SetHas(seen, value)) return value;
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  for (const key of ReflectOwnKeys(descriptors)) {
    const descriptor = descriptors[key];
    if (descriptor && "value" in descriptor) deepFreeze(descriptor.value, seen);
  }
  return ObjectFreeze(value);
}

function inspectDataTree(value, { requireFrozen = false } = {}, state = {
  depth: 0, counter: { nodes: 0 }, active: new SetConstructor(),
}) {
  state.counter.nodes += 1;
  if (state.counter.nodes > MAX_TREE_NODES) fail("SOURCE_TREE_TOO_LARGE");
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!NumberIsFinite(value)) fail("SOURCE_NUMBER_INVALID");
    return;
  }
  if (typeof value !== "object" || isProxy(value)) fail("SOURCE_VALUE_INVALID");
  if (state.depth > MAX_TREE_DEPTH) fail("SOURCE_TREE_TOO_DEEP");
  if (SetHas(state.active, value)) fail("SOURCE_CYCLE_FORBIDDEN");
  if (requireFrozen && !ObjectIsFrozen(value)) fail("IN_MEMORY_PAGE_NOT_DEEPLY_FROZEN");
  const prototype = ObjectGetPrototypeOf(value);
  const array = ArrayIsArray(value);
  if (array ? prototype !== ArrayPrototype
    : prototype !== ObjectPrototype && prototype !== null) fail("SOURCE_PROTOTYPE_INVALID");
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (const key of keys) {
    if (typeof key !== "string") fail("SOURCE_SYMBOL_FORBIDDEN");
    const descriptor = descriptors[key];
    if (!(descriptor && "value" in descriptor)) fail("SOURCE_ACCESSOR_FORBIDDEN");
    if (!(array && key === "length") && descriptor.enumerable !== true) {
      fail("SOURCE_HIDDEN_PROPERTY_FORBIDDEN");
    }
    if (requireFrozen && (descriptor.configurable !== false || descriptor.writable !== false)) {
      fail("IN_MEMORY_PAGE_NOT_DEEPLY_FROZEN");
    }
  }
  if (array) {
    if (!ObjectHasOwn(descriptors, "length")) {
      fail("SOURCE_ARRAY_INVALID");
    }
    for (let index = 0; index < value.length; index += 1) {
      if (!ObjectHasOwn(descriptors, String(index))) {
        fail("SOURCE_SPARSE_ARRAY_FORBIDDEN");
      }
    }
    if (keys.length !== value.length + 1) fail("SOURCE_ARRAY_EXTRA_PROPERTY_FORBIDDEN");
  }
  SetAdd(state.active, value);
  for (const key of keys) {
    if (key === "length" && array) continue;
    inspectDataTree(descriptors[key].value, { requireFrozen }, {
      depth: state.depth + 1, counter: state.counter, active: state.active,
    });
  }
  SetDelete(state.active, value);
}

function cloneDataTree(value, { requireFrozen = false } = {}) {
  inspectDataTree(value, { requireFrozen });
  let encoded;
  try { encoded = JsonStringify(value); }
  catch { fail("SOURCE_JSON_INVALID"); }
  if (typeof encoded !== "string") fail("SOURCE_JSON_INVALID");
  let clone;
  try { clone = JsonParse(encoded); }
  catch { fail("SOURCE_JSON_INVALID"); }
  inspectDataTree(clone);
  return deepFreeze(clone);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) fail(`${code}_OBJECT_INVALID`);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  if (ArraySome(keys, (key) => typeof key !== "string")
    || ArrayJoin(ArraySort(keys), "\0")
      !== ArrayJoin(ArraySort([...fields]), "\0")) {
    fail(`${code}_SHAPE_INVALID`);
  }
  for (const key of keys) {
    if (!("value" in descriptors[key]) || descriptors[key].enumerable !== true) {
      fail(`${code}_DESCRIPTOR_INVALID`);
    }
  }
}

function optionsObject(value, allowedFields, code) {
  if (value === undefined) return {};
  if (value === null || typeof value !== "object" || ArrayIsArray(value) || isProxy(value)) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) fail(`${code}_OBJECT_INVALID`);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  const allowed = new SetConstructor();
  for (let index = 0; index < allowedFields.length; index += 1) {
    SetAdd(allowed, allowedFields[index]);
  }
  const result = {};
  for (const key of keys) {
    if (typeof key !== "string" || !SetHas(allowed, key)) fail(`${code}_SHAPE_INVALID`);
    const descriptor = descriptors[key];
    if (!(descriptor && "value" in descriptor) || descriptor.enumerable !== true) {
      fail(`${code}_DESCRIPTOR_INVALID`);
    }
    result[key] = descriptor.value;
  }
  return result;
}

function arrayDataValues(value, code, { requireFrozen = false } = {}) {
  if (!ArrayIsArray(value) || isProxy(value)
    || requireFrozen && !ObjectIsFrozen(value)) fail(`${code}_INVALID`);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  if (!ObjectHasOwn(descriptors, "length") || keys.length !== value.length + 1) {
    fail(`${code}_INVALID`);
  }
  const result = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!(descriptor && "value" in descriptor) || descriptor.enumerable !== true) {
      fail(`${code}_DESCRIPTOR_INVALID`);
    }
    ArrayPush(result, descriptor.value);
  }
  return result;
}

function canonicalTime(value, code) {
  if (typeof value !== "string" || !CANONICAL_UTC.test(value)
    || !NumberIsFinite(DateParse(value))
    || DateToISOString(new Date(DateParse(value))) !== value) fail(`${code}_INVALID`);
  return value;
}

function localDigest(domain, value) {
  const input = typeof value === "string" ? value : canonicalizeStrict(value);
  const state = createHash("sha256");
  HashUpdate(state, `outsider:network-lifecycle-head:${domain}:v1\0${input}`, "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function byteDigest(value) {
  const state = createHash("sha256");
  HashUpdate(state, value);
  return `sha256:${HashDigest(state, "hex")}`;
}

function equalCanonical(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function normalizeRawPages(exportPageBytes) {
  if (!ArrayIsArray(exportPageBytes) || isProxy(exportPageBytes)
    || exportPageBytes.length < 1 || exportPageBytes.length > MAX_SOURCE_PAGES) {
    fail("SOURCE_PAGES_INVALID");
  }
  const pageSources = arrayDataValues(exportPageBytes, "SOURCE_PAGES");
  const bytes = [];
  const pages = [];
  let totalBytes = 0;
  for (let index = 0; index < pageSources.length; index += 1) {
    const source = pageSources[index];
    if (isProxy(source) || !BufferIsBuffer(source)) fail("SOURCE_PAGE_BYTES_REQUIRED");
    const copy = BufferFrom(source);
    if (copy.length < 3 || copy.length > MAX_PAGE_BYTES) fail("SOURCE_PAGE_BYTES_INVALID");
    totalBytes += copy.length;
    if (totalBytes > MAX_TOTAL_BYTES) fail("SOURCE_TOTAL_BYTES_INVALID");
    const text = BufferToString(copy, "utf8");
    if (!BufferEquals(BufferFrom(text, "utf8"), copy)) fail("SOURCE_PAGE_UTF8_INVALID");
    let parsed;
    try { parsed = JsonParse(text); }
    catch { fail("SOURCE_PAGE_JSON_INVALID"); }
    /* The gateway emits one JSON.stringify record plus LF.  Equality rejects
       duplicate JSON keys, alternate number encodings, and cursor-page byte
       substitution hidden behind semantically equivalent JSON. */
    if (`${JsonStringify(parsed)}\n` !== text) fail("SOURCE_PAGE_BYTES_NOT_EXACT_GATEWAY_JSON");
    inspectDataTree(parsed);
    ArrayPush(bytes, copy);
    ArrayPush(pages, deepFreeze(parsed));
  }
  ObjectFreeze(pages);
  ObjectFreeze(bytes);
  return ObjectFreeze({ representation: "EXACT_GATEWAY_RESPONSE_BYTES", pages, bytes,
    totalBytes });
}

function normalizeFrozenPages(frozenPages) {
  if (!ArrayIsArray(frozenPages) || isProxy(frozenPages)
    || frozenPages.length < 1 || frozenPages.length > MAX_SOURCE_PAGES
    || !ObjectIsFrozen(frozenPages)) fail("FROZEN_SOURCE_PAGES_INVALID");
  inspectDataTree(frozenPages, { requireFrozen: true });
  const pageSources = arrayDataValues(frozenPages, "FROZEN_SOURCE_PAGES",
    { requireFrozen: true });
  const pages = [];
  const bytes = [];
  let totalBytes = 0;
  for (let index = 0; index < pageSources.length; index += 1) {
    const page = cloneDataTree(pageSources[index], { requireFrozen: true });
    const encoded = BufferFrom(`${JsonStringify(page)}\n`, "utf8");
    if (encoded.length > MAX_PAGE_BYTES) fail("SOURCE_PAGE_BYTES_INVALID");
    totalBytes += encoded.length;
    if (totalBytes > MAX_TOTAL_BYTES) fail("SOURCE_TOTAL_BYTES_INVALID");
    ArrayPush(pages, page);
    ArrayPush(bytes, encoded);
  }
  ObjectFreeze(pages);
  ObjectFreeze(bytes);
  return ObjectFreeze({ representation: "IN_MEMORY_EXACT_FROZEN_JSON_PAGES", pages, bytes,
    totalBytes });
}

function sourcePages({ exportPageBytes = null, frozenPages = null } = {}) {
  if ((exportPageBytes === null) === (frozenPages === null)) {
    fail("EXACTLY_ONE_SOURCE_REPRESENTATION_REQUIRED");
  }
  return exportPageBytes !== null ? normalizeRawPages(exportPageBytes)
    : normalizeFrozenPages(frozenPages);
}

function cursorFor(event) {
  return BufferToString(BufferFrom(
    JsonStringify({ ordinal: event.ordinal, eventHash: event.eventHash }), "utf8"),
  "base64url");
}

function assertHash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function assertNullableHash(value, code) {
  if (value !== null) assertHash(value, code);
  return value;
}

function assertEvent(event, expectedOrdinal, expectedPrevious, registryId) {
  exactObject(event, ["schema", "ordinal", "previousEventHash", "reservationHash",
    "manifestHash", "lane", "clientSubmissionId", "challengeServerKeyId", "registryId",
    "retentionPolicyVersion", "appliedRetentionDays", "retentionUntil", "eventType",
    "objectIdentityHash", "occurrenceIdentityHash", "stableOccurrenceSubjectHash",
    "semanticSubjectHash", "censusSlotHash", "occurredAt", "disposition", "reasonCode",
    "eventHash"], "EVENT");
  if (event.schema !== NETWORK_LIFECYCLE_HEAD_SCHEMAS.event
    || event.ordinal !== expectedOrdinal || !NumberIsSafeInteger(event.ordinal)
    || event.previousEventHash !== expectedPrevious
    || event.registryId !== registryId
    || typeof event.registryId !== "string" || !REGISTRY_ID.test(event.registryId)
    || !ArrayIncludes(NETWORK_INTAKE_LANES, event.lane)
    || typeof event.clientSubmissionId !== "string" || !SUBMISSION_ID.test(event.clientSubmissionId)
    || event.retentionPolicyVersion !== "outsider/network-retention-policy/v1"
    || !NumberIsSafeInteger(event.appliedRetentionDays)
    || event.appliedRetentionDays < 1 || event.appliedRetentionDays > 3650
    || typeof event.eventType !== "string" || !EVENT_TYPE.test(event.eventType)
    || event.disposition !== "QUARANTINED"
    || event.reasonCode !== null
      && (typeof event.reasonCode !== "string" || !REASON_CODE.test(event.reasonCode))) {
    fail("EVENT_FIELD_INVALID");
  }
  for (const [value, code] of [[event.previousEventHash, "EVENT_PREVIOUS_HASH"],
    [event.reservationHash, "EVENT_RESERVATION_HASH"],
    [event.manifestHash, "EVENT_MANIFEST_HASH"],
    [event.challengeServerKeyId, "EVENT_CHALLENGE_KEY_HASH"],
    [event.objectIdentityHash, "EVENT_OBJECT_HASH"],
    [event.occurrenceIdentityHash, "EVENT_OCCURRENCE_HASH"],
    [event.stableOccurrenceSubjectHash, "EVENT_STABLE_SUBJECT_HASH"],
    [event.semanticSubjectHash, "EVENT_SEMANTIC_SUBJECT_HASH"],
    [event.eventHash, "EVENT_HASH"]]) assertHash(value, code);
  assertNullableHash(event.censusSlotHash, "EVENT_CENSUS_SLOT_HASH");
  canonicalTime(event.retentionUntil, "EVENT_RETENTION_UNTIL");
  canonicalTime(event.occurredAt, "EVENT_OCCURRED_AT");
  const { eventHash, ...body } = event;
  if (eventHash !== networkIntakeDigest("lifecycle-event", body)) fail("EVENT_HASH_MISMATCH");
}

function assertObjectIdentity(object, expectedHash) {
  const encoded = encodeNetworkIntakePayload(object);
  const actual = networkIntakeDigest("outsider/network-intake-object/v1", {
    payloadByteHash: encoded.payloadByteHash,
    payloadSemanticHash: encoded.payloadSemanticHash,
    payloadBytes: encoded.payloadBytes,
  });
  if (actual !== expectedHash) fail("EXPORTED_OBJECT_IDENTITY_MISMATCH");
}

function eventBinding(event) {
  return {
    manifestHash: event.manifestHash,
    lane: event.lane,
    clientSubmissionId: event.clientSubmissionId,
    challengeServerKeyId: event.challengeServerKeyId,
    registryId: event.registryId,
    retentionPolicyVersion: event.retentionPolicyVersion,
    appliedRetentionDays: event.appliedRetentionDays,
    retentionUntil: event.retentionUntil,
    objectIdentityHash: event.objectIdentityHash,
    occurrenceIdentityHash: event.occurrenceIdentityHash,
    stableOccurrenceSubjectHash: event.stableOccurrenceSubjectHash,
    semanticSubjectHash: event.semanticSubjectHash,
    censusSlotHash: event.censusSlotHash,
  };
}

function advanceLifecycle(event, state, bindings) {
  const current = MapGet(state, event.reservationHash) ?? null;
  const binding = eventBinding(event);
  if (event.eventType === "RESERVED") {
    if (current !== null || MapHas(bindings, event.reservationHash)) {
      fail("EVENT_REPLAY_INVALID");
    }
    if (DateParse(event.retentionUntil) <= DateParse(event.occurredAt)) {
      fail("EVENT_RETENTION_EPOCH_INVALID");
    }
    MapSet(bindings, event.reservationHash, binding);
    MapSet(state, event.reservationHash, "OPEN");
    return;
  }
  if (!MapHas(bindings, event.reservationHash)
    || !equalCanonical(MapGet(bindings, event.reservationHash), binding)) {
    fail("EVENT_BINDING_DRIFT");
  }
  if (event.eventType === "QUARANTINED") {
    if (current !== "OPEN") fail("EVENT_REPLAY_INVALID");
    MapSet(state, event.reservationHash, "SETTLED");
  } else if (event.eventType === "EXPIRED_UNUSED"
    || StringStartsWith(event.eventType, "REJECTED_")) {
    if (current !== "OPEN") fail("EVENT_REPLAY_INVALID");
    MapSet(state, event.reservationHash, event.eventType);
  } else if (event.eventType === "REVOKED") {
    if (current !== "OPEN" && current !== "SETTLED") fail("EVENT_REPLAY_INVALID");
    MapSet(state, event.reservationHash, "REVOKED");
  } else if (event.eventType === "PURGED") {
    if (current !== "SETTLED" && current !== "REVOKED"
      && current !== "EXPIRED_UNUSED" && !StringStartsWith(String(current), "REJECTED_")) {
      fail("EVENT_REPLAY_INVALID");
    }
    MapSet(state, event.reservationHash, "PURGED");
  } else fail("EVENT_REPLAY_INVALID");
}

function assertItem(item, event, generatedAt) {
  exactObject(item, ["event", "object", "derivedState", "retention"], "ITEM");
  exactObject(item.derivedState, ["reservationStatus"], "ITEM_DERIVED_STATE");
  exactObject(item.retention, ["retentionUntil", "payloadTombstoned", "tombstonedAt"],
    "ITEM_RETENTION");
  const status = item.derivedState.reservationStatus;
  if (typeof status !== "string"
    || !/^(?:OPEN|SETTLED|REVOKED|PURGED|EXPIRED_UNUSED|REJECTED_[A-Z0-9_]+)$/u.test(status)
    || item.retention.retentionUntil !== event.retentionUntil
    || typeof item.retention.payloadTombstoned !== "boolean"
    || item.retention.tombstonedAt !== null
      && canonicalTime(item.retention.tombstonedAt, "ITEM_TOMBSTONED_AT")
        !== item.retention.tombstonedAt
    || item.retention.payloadTombstoned !== (item.retention.tombstonedAt !== null)) {
    fail("ITEM_DERIVED_FIELD_INVALID");
  }
  if (item.object !== null) {
    if (event.eventType !== "QUARANTINED" || item.retention.payloadTombstoned
      || status !== "SETTLED" || DateParse(item.retention.retentionUntil) <= DateParse(generatedAt)) {
      fail("EXPORTED_OBJECT_VISIBILITY_INVALID");
    }
    assertObjectIdentity(item.object, event.objectIdentityHash);
  } else if (event.eventType === "QUARANTINED" && status === "SETTLED"
    && !item.retention.payloadTombstoned
    && DateParse(item.retention.retentionUntil) > DateParse(generatedAt)) {
    fail("EXPORTED_OBJECT_MISSING");
  }
  if (status === "PURGED"
    ? DateParse(item.retention.retentionUntil) > DateParse(generatedAt)
    : DateParse(item.retention.retentionUntil) <= DateParse(generatedAt)) {
    fail("ITEM_RETENTION_STATE_INVALID");
  }
  return status;
}

function replayExport(normalized) {
  const { pages, bytes } = normalized;
  let registryId = null;
  let advertisedCount = null;
  let advertisedTail = null;
  let previous = NETWORK_LIFECYCLE_EVENT_GENESIS;
  let ordinal = 0;
  let maximumGeneratedAt = null;
  const state = new MapConstructor();
  const bindings = new MapConstructor();
  const displayed = new MapConstructor();
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    const page = pages[pageIndex];
    exactObject(page, ["schema", "registryId", "generatedAt", "lane", "count", "items",
      "nextCursor", "eventChain", "derivedLedgerAudit", "occurrencePolicy", "useBoundary"],
    "EXPORT_PAGE");
    if (page.schema !== NETWORK_LIFECYCLE_HEAD_SCHEMAS.exportPage
      || typeof page.registryId !== "string" || !REGISTRY_ID.test(page.registryId)
      || page.lane !== null || !NumberIsSafeInteger(page.count) || page.count < 0
      || !ArrayIsArray(page.items) || page.count !== page.items.length
      || page.occurrencePolicy
        !== "CONTENT_IS_CAS_DEDUPLICATED_OCCURRENCES_ARE_NEVER_DEDUPLICATED"
      || !equalCanonical(page.useBoundary, SOURCE_USE_BOUNDARY)) {
      fail("EXPORT_PAGE_FIELD_INVALID");
    }
    canonicalTime(page.generatedAt, "EXPORT_GENERATED_AT");
    if (maximumGeneratedAt === null || DateParse(page.generatedAt) > DateParse(maximumGeneratedAt)) {
      maximumGeneratedAt = page.generatedAt;
    }
    exactObject(page.eventChain, ["eventCount", "tailHash", "appendOnlyReplayVerified"],
      "EXPORT_EVENT_CHAIN");
    if (!NumberIsSafeInteger(page.eventChain.eventCount) || page.eventChain.eventCount < 0
      || !HASH.test(String(page.eventChain.tailHash ?? ""))
      || page.eventChain.appendOnlyReplayVerified !== true) fail("EXPORT_EVENT_CHAIN_INVALID");
    if (page.derivedLedgerAudit === null || typeof page.derivedLedgerAudit !== "object"
      || ArrayIsArray(page.derivedLedgerAudit) || page.derivedLedgerAudit.verified !== true) {
      fail("EXPORT_DERIVED_AUDIT_INVALID");
    }
    if (registryId === null) {
      registryId = page.registryId;
      advertisedCount = page.eventChain.eventCount;
      advertisedTail = page.eventChain.tailHash;
    } else if (page.registryId !== registryId
      || page.eventChain.eventCount !== advertisedCount
      || page.eventChain.tailHash !== advertisedTail) fail("EXPORT_SNAPSHOT_DRIFT");
    if (page.count === 0 && (pageIndex !== pages.length - 1 || advertisedCount !== 0)) {
      fail("EXPORT_EMPTY_PAGE_INVALID");
    }
    for (let itemIndex = 0; itemIndex < page.items.length; itemIndex += 1) {
      const item = page.items[itemIndex];
      const event = item.event;
      ordinal += 1;
      assertEvent(event, ordinal, previous, registryId);
      const status = assertItem(item, event, page.generatedAt);
      const priorDisplay = MapGet(displayed, event.reservationHash);
      if (priorDisplay !== undefined && priorDisplay !== status) fail("DERIVED_STATE_PAGE_DRIFT");
      MapSet(displayed, event.reservationHash, status);
      advanceLifecycle(event, state, bindings);
      previous = event.eventHash;
    }
    const isFinal = pageIndex === pages.length - 1;
    if (isFinal) {
      if (page.nextCursor !== null) fail("EXPORT_FINAL_CURSOR_NOT_NULL");
    } else {
      if (page.items.length === 0 || typeof page.nextCursor !== "string"
        || page.nextCursor !== cursorFor(page.items[page.items.length - 1].event)) {
        fail("EXPORT_CURSOR_SPLICE");
      }
    }
  }
  if (ordinal !== advertisedCount || previous !== advertisedTail) fail("EXPORT_TAIL_MISMATCH");
  if (ordinal === 0 && (pages.length !== 1 || advertisedTail !== NETWORK_LIFECYCLE_EVENT_GENESIS)) {
    fail("EXPORT_EMPTY_CHAIN_INVALID");
  }
  MapForEach(displayed, (status, reservationHash) => {
    if (MapGet(state, reservationHash) !== status) fail("DERIVED_STATE_MISMATCH");
  });
  const pageCommitments = ArrayMap(bytes, (value, index) => ({
    page: index + 1,
    byteLength: value.length,
    byteHash: byteDigest(value),
  }));
  const exportSetRoot = localDigest("export-set", {
    schema: "outsider/network-lifecycle-export-set/v1",
    pageCount: bytes.length,
    exactByteCount: normalized.totalBytes,
    pageCommitments,
  });
  return deepFreeze({ registryId, eventCount: ordinal, tailHash: previous,
    coveredFromOrdinal: ordinal === 0 ? 0 : 1, coveredToOrdinal: ordinal,
    exportSetRoot, pageCount: pages.length, exactByteCount: normalized.totalBytes,
    representation: normalized.representation, maximumGeneratedAt });
}

function checkpointFromReplay(replay, createdAt) {
  canonicalTime(createdAt, "CHECKPOINT_CREATED_AT");
  if (DateParse(createdAt) < DateParse(replay.maximumGeneratedAt)) {
    fail("CHECKPOINT_PRECEDES_EXPORT");
  }
  const body = {
    schema: NETWORK_LIFECYCLE_HEAD_SCHEMAS.checkpoint,
    registryId: replay.registryId,
    eventCount: replay.eventCount,
    tailHash: replay.tailHash,
    coveredFromOrdinal: replay.coveredFromOrdinal,
    coveredToOrdinal: replay.coveredToOrdinal,
    exportSetRoot: replay.exportSetRoot,
    createdAt,
    localCheckpointOnly: true,
    selfSignaturePresent: false,
    externalAnchorEstablished: false,
    independentWitnessEstablished: false,
    wormStorageEstablished: false,
    nonOmissionProofEstablished: false,
    useBoundary: NETWORK_LIFECYCLE_HEAD_USE_BOUNDARY,
  };
  return deepFreeze({ ...body, checkpointHash: localDigest("checkpoint", body) });
}

export function createNetworkLifecycleHeadCheckpoint(input = {}) {
  const options = optionsObject(input, ["exportPageBytes", "frozenPages", "createdAt"],
    "CREATE_OPTIONS");
  const exportPageBytes = options.exportPageBytes ?? null;
  const frozenPages = options.frozenPages ?? null;
  const createdAt = options.createdAt;
  const normalized = sourcePages({ exportPageBytes, frozenPages });
  return checkpointFromReplay(replayExport(normalized), createdAt);
}

export function assertNetworkLifecycleHeadCheckpoint(value) {
  const checkpoint = cloneDataTree(value);
  exactObject(checkpoint, ["schema", "registryId", "eventCount", "tailHash",
    "coveredFromOrdinal", "coveredToOrdinal", "exportSetRoot", "createdAt",
    "localCheckpointOnly", "selfSignaturePresent", "externalAnchorEstablished",
    "independentWitnessEstablished", "wormStorageEstablished", "nonOmissionProofEstablished",
    "useBoundary", "checkpointHash"], "CHECKPOINT");
  const { checkpointHash, ...body } = checkpoint;
  if (body.schema !== NETWORK_LIFECYCLE_HEAD_SCHEMAS.checkpoint
    || typeof body.registryId !== "string" || !REGISTRY_ID.test(body.registryId)
    || !NumberIsSafeInteger(body.eventCount) || body.eventCount < 0
    || body.coveredFromOrdinal !== (body.eventCount === 0 ? 0 : 1)
    || body.coveredToOrdinal !== body.eventCount
    || body.localCheckpointOnly !== true || body.selfSignaturePresent !== false
    || body.externalAnchorEstablished !== false
    || body.independentWitnessEstablished !== false
    || body.wormStorageEstablished !== false || body.nonOmissionProofEstablished !== false
    || !equalCanonical(body.useBoundary, NETWORK_LIFECYCLE_HEAD_USE_BOUNDARY)
    || !HASH.test(String(body.tailHash ?? ""))
    || !HASH.test(String(body.exportSetRoot ?? ""))
    || !HASH.test(String(checkpointHash ?? ""))
    || localDigest("checkpoint", body) !== checkpointHash) fail("CHECKPOINT_INVALID");
  canonicalTime(body.createdAt, "CHECKPOINT_CREATED_AT");
  if (body.eventCount === 0 && body.tailHash !== NETWORK_LIFECYCLE_EVENT_GENESIS) {
    fail("CHECKPOINT_EMPTY_TAIL_INVALID");
  }
  return checkpoint;
}

export function createNetworkLifecycleAnchorOutboxRequest(input = {}) {
  const options = optionsObject(input, ["checkpoint"], "OUTBOX_CREATE_OPTIONS");
  const checkpoint = options.checkpoint;
  const checked = assertNetworkLifecycleHeadCheckpoint(checkpoint);
  const body = {
    schema: NETWORK_LIFECYCLE_HEAD_SCHEMAS.outboxRequest,
    checkpointHash: checked.checkpointHash,
    subjectDigest: {
      algorithm: "SHA-256",
      digestHex: StringSlice(checked.checkpointHash, "sha256:".length),
    },
    disclosure: "CHECKPOINT_DIGEST_ONLY_NO_EVENT_OBJECT_PAYLOAD_OR_EXPORT_PAGE_BYTES",
    rawEventsIncluded: false,
    rawObjectsIncluded: false,
    rawPayloadsIncluded: false,
    exportPageBytesIncluded: false,
    networkSubmissionPerformed: false,
    providerReceiptPresent: false,
    externalAnchorEstablished: false,
    useBoundary: NETWORK_LIFECYCLE_HEAD_USE_BOUNDARY,
  };
  return deepFreeze({ ...body, requestHash: localDigest("outbox-request", body) });
}

export function assertNetworkLifecycleAnchorOutboxRequest(value, optionsInput = {}) {
  const options = optionsObject(optionsInput, ["checkpoint"], "OUTBOX_ASSERT_OPTIONS");
  const checkpoint = options.checkpoint;
  const request = cloneDataTree(value);
  exactObject(request, ["schema", "checkpointHash", "subjectDigest", "disclosure",
    "rawEventsIncluded", "rawObjectsIncluded", "rawPayloadsIncluded",
    "exportPageBytesIncluded", "networkSubmissionPerformed", "providerReceiptPresent",
    "externalAnchorEstablished", "useBoundary", "requestHash"], "OUTBOX_REQUEST");
  exactObject(request.subjectDigest, ["algorithm", "digestHex"], "OUTBOX_SUBJECT_DIGEST");
  const { requestHash, ...body } = request;
  if (body.schema !== NETWORK_LIFECYCLE_HEAD_SCHEMAS.outboxRequest
    || !HASH.test(String(body.checkpointHash ?? ""))
    || body.subjectDigest.algorithm !== "SHA-256"
    || body.subjectDigest.digestHex !== StringSlice(body.checkpointHash, "sha256:".length)
    || body.disclosure
      !== "CHECKPOINT_DIGEST_ONLY_NO_EVENT_OBJECT_PAYLOAD_OR_EXPORT_PAGE_BYTES"
    || body.rawEventsIncluded !== false || body.rawObjectsIncluded !== false
    || body.rawPayloadsIncluded !== false || body.exportPageBytesIncluded !== false
    || body.networkSubmissionPerformed !== false || body.providerReceiptPresent !== false
    || body.externalAnchorEstablished !== false
    || !equalCanonical(body.useBoundary, NETWORK_LIFECYCLE_HEAD_USE_BOUNDARY)
    || !HASH.test(String(requestHash ?? ""))
    || localDigest("outbox-request", body) !== requestHash) fail("OUTBOX_REQUEST_INVALID");
  if (checkpoint !== undefined) {
    const checked = assertNetworkLifecycleHeadCheckpoint(checkpoint);
    if (body.checkpointHash !== checked.checkpointHash) fail("OUTBOX_CHECKPOINT_MISMATCH");
  }
  return request;
}

export function verifyNetworkLifecycleHeadCheckpoint(input = {}) {
  const options = optionsObject(input, ["exportPageBytes", "frozenPages", "checkpoint",
    "outboxRequest", "expectedCheckpointHash"], "VERIFY_OPTIONS");
  const exportPageBytes = options.exportPageBytes ?? null;
  const frozenPages = options.frozenPages ?? null;
  const checkpoint = options.checkpoint;
  const outboxRequest = options.outboxRequest;
  const expectedCheckpointHash = options.expectedCheckpointHash;
  if (typeof expectedCheckpointHash !== "string" || !HASH.test(expectedCheckpointHash)) {
    fail("CALLER_PINNED_CHECKPOINT_HASH_REQUIRED");
  }
  const checked = assertNetworkLifecycleHeadCheckpoint(checkpoint);
  if (checked.checkpointHash !== expectedCheckpointHash) fail("CALLER_PINNED_CHECKPOINT_MISMATCH");
  const request = assertNetworkLifecycleAnchorOutboxRequest(outboxRequest,
    { checkpoint: checked });
  const normalized = sourcePages({ exportPageBytes, frozenPages });
  const replay = replayExport(normalized);
  const rebuilt = checkpointFromReplay(replay, checked.createdAt);
  if (!equalCanonical(rebuilt, checked)) fail("CHECKPOINT_SOURCE_MISMATCH");
  const expectedRequest = createNetworkLifecycleAnchorOutboxRequest({ checkpoint: rebuilt });
  if (!equalCanonical(expectedRequest, request)) fail("OUTBOX_SOURCE_MISMATCH");
  const body = {
    schema: NETWORK_LIFECYCLE_HEAD_SCHEMAS.verification,
    checkpointHash: checked.checkpointHash,
    outboxRequestHash: request.requestHash,
    callerPinnedCheckpointHash: expectedCheckpointHash,
    registryId: replay.registryId,
    eventCount: replay.eventCount,
    tailHash: replay.tailHash,
    exportSetRoot: replay.exportSetRoot,
    source: {
      representation: replay.representation,
      pageCount: replay.pageCount,
      exactByteCount: replay.exactByteCount,
      exactGatewayResponseBytesReplayed:
        replay.representation === "EXACT_GATEWAY_RESPONSE_BYTES",
      inMemoryExactFrozenPagesReplayed:
        replay.representation === "IN_MEMORY_EXACT_FROZEN_JSON_PAGES",
    },
    localChecks: {
      eventOrdinalsAndPreviousHashesReplayed: true,
      eventHashesRecomputed: true,
      lifecycleTransitionsReplayed: true,
      paginationCursorsAndTailReplayed: true,
      exactExportSetRootRecomputed: true,
      checkpointMatchedCallerPinAndSource: true,
      outboxDigestOnlyBindingRecomputed: true,
    },
    limitations: {
      localCheckpointOnly: true,
      selfSignaturePresent: false,
      externalAnchorEstablished: false,
      independentWitnessEstablished: false,
      wormStorageEstablished: false,
      nonOmissionProofEstablished: false,
      serverNonEquivocationEstablished: false,
      serverCompletenessEstablished: false,
      generatedAtIsExternalTimeEvidence: false,
      derivedLedgerAuditIndependentlyReplayed: false,
      providerReceiptPresent: false,
      callerPinIsNotExternalEvidence: true,
    },
    useBoundary: NETWORK_LIFECYCLE_HEAD_USE_BOUNDARY,
  };
  return deepFreeze({ ...body, verificationHash: localDigest("verification", body) });
}
