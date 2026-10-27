/*
 * Outcome Formation Engine: user-held mailbox shadow driver v1.
 *
 * This module is a horizontal, source-specific transport test substrate.  Its
 * sole effect is appending one already source-replay-valid mailbox lifecycle
 * to a module-private in-memory spool.  It has no filesystem, network, DNS,
 * browser, OS mail-client, callback, path, credential, or ambient-session
 * interface.  A module-issued bearer capability proves only authority to
 * append to this shadow spool; it is not mailbox, account, send, recipient,
 * provider, owner, capacity, price, guarantee, settlement, or action
 * authority.
 */

import { Buffer } from "node:buffer";
import { createHash, createPublicKey } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS,
  verifyTransactionSurfaceAdapterContractV1,
} from "./outsider-transaction-surface-adapter-contract-v1.js";
import {
  OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1,
  OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS,
  verifyPermissionedTransactionInterfaceSourceReplayV1,
} from "./outsider-permissioned-transaction-interface-source-replay-v1.js";

const uncurryThis = (method) => Function.prototype.call.bind(method);
const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const SymbolIterator = Symbol.iterator;
const BufferAlloc = Buffer.alloc;
const BufferByteLength = Buffer.byteLength;
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferToString = uncurryThis(Buffer.prototype.toString);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = uncurryThis(Date.prototype.toISOString);
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = uncurryThis(HashPrototype.digest);
const HashUpdate = uncurryThis(HashPrototype.update);
const JSONParse = JSON.parse;
const MapConstructor = Map;
const MapGet = uncurryThis(Map.prototype.get);
const MapHas = uncurryThis(Map.prototype.has);
const MapSet = uncurryThis(Map.prototype.set);
const MapSize = uncurryThis(
  Object.getOwnPropertyDescriptor(Map.prototype, "size").get);
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectCreate = Object.create;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIs = Object.is;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ObjectConstructor = Object;
const ReflectObject = Reflect;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = uncurryThis(RegExp.prototype.test);
const SetAdd = uncurryThis(Set.prototype.add);
const SetConstructor = Set;
const SetHas = uncurryThis(Set.prototype.has);
const SetPrototype = Set.prototype;
const MapPrototype = Map.prototype;
const RegExpPrototype = RegExp.prototype;
const StringConstructor = String;
const TypeErrorConstructor = TypeError;
const TypedArrayPrototype = ObjectGetPrototypeOf(Uint8Array.prototype);
const TypedArrayBuffer = uncurryThis(
  ObjectGetOwnPropertyDescriptor(TypedArrayPrototype, "buffer").get);
const TypedArrayByteLength = uncurryThis(
  ObjectGetOwnPropertyDescriptor(TypedArrayPrototype, "byteLength").get);
const TypedArraySet = uncurryThis(TypedArrayPrototype.set);
const WeakMapConstructor = WeakMap;
const WeakMapGet = uncurryThis(WeakMap.prototype.get);
const WeakMapHas = uncurryThis(WeakMap.prototype.has);
const WeakMapSet = uncurryThis(WeakMap.prototype.set);
const SharedArrayBufferPrototype = typeof SharedArrayBuffer === "function"
  ? SharedArrayBuffer.prototype : null;

const ArrayIteratorDescriptorAtImport = ObjectGetOwnPropertyDescriptor(
  ArrayPrototype, SymbolIterator);
const ArrayIterator = uncurryThis(ArrayIteratorDescriptorAtImport.value);
const ArrayIteratorPrototype = ObjectGetPrototypeOf(ArrayIterator([]));
const IntrinsicPublicKeyPrototype = ObjectGetPrototypeOf(createPublicKey({
  key: BufferFrom(`302a300506032b6570032100${"00".repeat(32)}`, "hex"),
  format: "der",
  type: "spki",
}));

function dependencyIntrinsic(owner, key, label) {
  const descriptor = ObjectGetOwnPropertyDescriptor(owner, key);
  return ObjectFreeze({ owner, key, label,
    configurable: descriptor.configurable,
    enumerable: descriptor.enumerable,
    hasValue: ObjectHasOwn(descriptor, "value"),
    writable: descriptor.writable,
    value: descriptor.value,
    get: descriptor.get,
    set: descriptor.set });
}

const DEPENDENCY_INTRINSICS = ObjectFreeze([
  dependencyIntrinsic(ArrayPrototype, SymbolIterator, "ARRAY_ITERATOR"),
  dependencyIntrinsic(ArrayIteratorPrototype, "next", "ARRAY_ITERATOR_NEXT"),
  dependencyIntrinsic(ArrayPrototype, "push", "ARRAY_PUSH"),
  dependencyIntrinsic(ArrayPrototype, "find", "ARRAY_FIND"),
  dependencyIntrinsic(SetPrototype, "add", "SET_ADD"),
  dependencyIntrinsic(SetPrototype, "has", "SET_HAS"),
  dependencyIntrinsic(SetPrototype, "delete", "SET_DELETE"),
  dependencyIntrinsic(SetPrototype, "size", "SET_SIZE"),
  dependencyIntrinsic(MapPrototype, "get", "MAP_GET"),
  dependencyIntrinsic(MapPrototype, "has", "MAP_HAS"),
  dependencyIntrinsic(MapPrototype, "set", "MAP_SET"),
  dependencyIntrinsic(MapPrototype, "size", "MAP_SIZE"),
  dependencyIntrinsic(RegExpPrototype, "test", "REGEXP_TEST"),
  dependencyIntrinsic(RegExpPrototype, "exec", "REGEXP_EXEC"),
  dependencyIntrinsic(Buffer, "from", "BUFFER_FROM"),
  dependencyIntrinsic(Buffer, "isBuffer", "BUFFER_IS_BUFFER"),
  dependencyIntrinsic(Buffer, "concat", "BUFFER_CONCAT"),
  dependencyIntrinsic(HashPrototype, "update", "HASH_UPDATE"),
  dependencyIntrinsic(HashPrototype, "digest", "HASH_DIGEST"),
  dependencyIntrinsic(IntrinsicPublicKeyPrototype, "export",
    "PUBLIC_KEY_EXPORT"),
  dependencyIntrinsic(ArrayConstructor, "isArray", "ARRAY_IS_ARRAY"),
  dependencyIntrinsic(ObjectConstructor, "create", "OBJECT_CREATE"),
  dependencyIntrinsic(ObjectConstructor, "defineProperty", "OBJECT_DEFINE_PROPERTY"),
  dependencyIntrinsic(ObjectConstructor, "freeze", "OBJECT_FREEZE"),
  dependencyIntrinsic(ObjectConstructor, "getOwnPropertyDescriptor",
    "OBJECT_GET_OWN_PROPERTY_DESCRIPTOR"),
  dependencyIntrinsic(ObjectConstructor, "getOwnPropertyDescriptors",
    "OBJECT_GET_OWN_PROPERTY_DESCRIPTORS"),
  dependencyIntrinsic(ObjectConstructor, "getPrototypeOf", "OBJECT_GET_PROTOTYPE"),
  dependencyIntrinsic(ObjectConstructor, "hasOwn", "OBJECT_HAS_OWN"),
  dependencyIntrinsic(ObjectConstructor, "isFrozen", "OBJECT_IS_FROZEN"),
  dependencyIntrinsic(ReflectObject, "ownKeys", "REFLECT_OWN_KEYS"),
]);

const PREFIX = "OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const PRIVATE_NONCE = /^[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_TREE_DEPTH = 112;
const MAX_TREE_NODES = 350_000;
const MAX_TREE_KEYS = 1_000_000;
const MAX_ARRAY_ELEMENTS = 150_000;
const MAX_SINGLE_STRING_BYTES = 1024 * 1024;
const MAX_AGGREGATE_STRING_BYTES = 64 * 1024 * 1024;
const MAX_SINGLE_BUFFER_BYTES = 1024 * 1024;
const MAX_AGGREGATE_BUFFER_BYTES = 32 * 1024 * 1024;
const MAX_MODULE_INSTANCE_LOCAL_APPEND_OBJECTS = 4096;
const BUFFER_FORBIDDEN_OWN_KEYS = ObjectFreeze([
  "length", "byteLength", "byteOffset", "buffer", "set", "subarray",
  Symbol.iterator,
]);

export const OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_SCHEMAS
  = ObjectFreeze({
    transportProfile:
      "outsider/user-held-mailbox-shadow-transport-profile/v1",
    appendReceipt:
      "outsider/user-held-mailbox-shadow-spool-append-receipt/v1",
    privateReadback:
      "outsider/user-held-mailbox-shadow-spool-private-readback/v1",
  });

export const OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY
  = "SHADOW_SPOOL_APPEND";

function fail(code) {
  throw new TypeErrorConstructor(`${PREFIX}${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, enumerable: true, writable: true, configurable: true,
  });
  return array;
}

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || BufferIsBuffer(value)
    || ObjectIsFrozen(value) || SetHas(seen, value)) return value;
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

function sha256Bytes(value) {
  const state = createHash("sha256");
  HashUpdate(state, value);
  return `sha256:${HashDigest(state, "hex")}`;
}

function digest(domain, value) {
  return sha256Bytes(BufferFrom(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

const REQUEST_SCHEMA_HASH = digest(
  "outsider/user-held-mailbox-shadow-request-schema/v1", {
    adapterProfile:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1,
    outboundSchema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .outboundTender,
    effect: OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY,
  });
const RESPONSE_SCHEMA_HASH = digest(
  "outsider/user-held-mailbox-shadow-response-schema/v1", {
    inboundSchema:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .inboundMessage,
    strictFiniteGrammar: true,
    naturalLanguageAccepted: false,
  });
const LIFECYCLE_SCHEMA_HASH = digest(
  "outsider/user-held-mailbox-shadow-lifecycle-schema/v1", {
    permissionEvent:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .permissionLifecycleEvent,
    permissionHead:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .permissionLifecycleHead,
    transportHead:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_SOURCE_REPLAY_V1_SCHEMAS
        .transportHead,
  });
const TRANSPORT_PROFILE_REF_HASH = digest(
  OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_SCHEMAS.transportProfile, {
    driver: "USER_HELD_MAILBOX_SHADOW_DRIVER_V1",
    adapterProfile:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1,
    requestSchemaHash: REQUEST_SCHEMA_HASH,
    responseSchemaHash: RESPONSE_SCHEMA_HASH,
    lifecycleSchemaHash: LIFECYCLE_SCHEMA_HASH,
  });

export const OUTSIDER_USER_HELD_MAILBOX_SHADOW_TRANSPORT_PROFILE_V1
  = deepFreeze({
    transportProfileRefHash: TRANSPORT_PROFILE_REF_HASH,
    transportFamily: "PERMISSIONED_MAILBOX",
    profileVersion: "1.0.0",
    requestSchemaHash: REQUEST_SCHEMA_HASH,
    responseSchemaHash: RESPONSE_SCHEMA_HASH,
    lifecycleSchemaHash: LIFECYCLE_SCHEMA_HASH,
    strictFiniteResponseGrammarRequired: true,
    naturalLanguageResponseAccepted: false,
    serverAcknowledgementIsAcceptance: false,
    deliveryReceiptIsAcceptance: false,
    arbitraryUrlExecutionPermitted: false,
    genericBrowserDriverPermitted: false,
  });

const ENABLED_CAPABILITIES = ObjectFreeze([
  OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY,
]);
const PROVEN_AUTHORITY = ObjectFreeze([
  OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY,
]);

export const OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_BOUNDARY
  = deepFreeze({
    position: "MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOL_ONLY",
    mode: "SHADOW_ONLY",
    allowedUse: "TEST_OR_RESEARCH",
    horizontalTransportSubstrate: true,
    domainSpecificTaskFieldsAccepted: false,
    filesystemInterfacePresent: false,
    pathInterfacePresent: false,
    networkInterfacePresent: false,
    dnsInterfacePresent: false,
    browserInterfacePresent: false,
    osMailClientInterfacePresent: false,
    callbackInterfacePresent: false,
    ambientCredentialInterfacePresent: false,
    rawCredentialMaterialAccepted: false,
    privateSpoolImplementation: "MODULE_PRIVATE_IN_MEMORY_SINGLE_ENTRY",
    maximumAppendOccurrencesPerCapability: 1,
    maximumModuleInstanceLocalAppendObjects:
      MAX_MODULE_INSTANCE_LOCAL_APPEND_OBJECTS,
    capabilityModuleIssuedAndIdentityChecked: true,
    serializedOrRecreatedCapabilityAccepted: false,
    moduleInstanceLocalNonceConsumptionTracked: true,
    moduleInstanceLocalIdempotencyTracked: true,
    processWideNonceFreshnessEstablished: false,
    processWideIdempotencyEstablished: false,
    nonceFreshnessDurableOrExternal: false,
    idempotencyDurableOrExternal: false,
    sourceReplayRequiredBeforeAppend: true,
    dependencyRealmGuardScope:
      "EXPLICIT_REACHABLE_LIVE_INTRINSIC_DESCRIPTOR_ALLOWLIST",
    completeDependencyRealmIntegrityEstablished: false,
    unguardedDependencyClosureDecision: "HOLD",
    rawSourceBytesPubliclyProjected: false,
    stablePrivateHandlePubliclyProjected: false,
    privateRawReadbackRequiresSameCapabilityObject: true,
    realMailboxAuthorityEstablished: false,
    realSendAuthorized: false,
    realTenderDelivered: false,
    providerContactPerformed: false,
    networkIoPerformed: false,
    filesystemIoPerformed: false,
    browserAutomationPerformed: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    outsiderStaffTouchCount: null,
    staffTouchDenominatorComplete: false,
    zeroInternalOpsEstablished: false,
    humanFallbackPermitted: false,
    enabledCapabilities: ENABLED_CAPABILITIES,
    provenAuthorityCapabilities: PROVEN_AUTHORITY,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOL_ONLY",
    externalAuthority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
  });

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || BufferIsBuffer(value)) fail(`${code}_OBJECT_REQUIRED`);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  const expected = new SetConstructor();
  for (let index = 0; index < fields.length; index += 1) {
    SetAdd(expected, fields[index]);
  }
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (typeof keys[index] !== "string" || !SetHas(expected, keys[index])
      || !descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)) {
    fail(`${code}_INVALID`);
  }
  const parsed = DateParse(value);
  if (!NumberIsFinite(parsed)
    || DateToISOString(new DateConstructor(parsed)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

/* The clone is the first operation on caller data.  It rejects proxies before
 * traps, accessors before invocation, exotic objects, hidden/decorated or
 * sparse arrays, shared/cyclic graphs, decorated/shared-memory buffers, and
 * oversized aggregate input before any source replay or hashing. */
function clonePreflight(untrusted) {
  const seen = new SetConstructor();
  const budget = {
    nodes: 0, keys: 0, arrayElements: 0,
    stringBytes: 0, bufferBytes: 0,
  };

  function visit(value, depth) {
    if (depth > MAX_TREE_DEPTH) fail("INPUT_TREE_TOO_DEEP");
    if ((typeof value === "object" && value !== null)
      || typeof value === "function") {
      if (isProxy(value)) fail("PROXY_FORBIDDEN");
    }
    if (typeof value === "string") {
      const bytes = BufferByteLength(value, "utf8");
      if (bytes > MAX_SINGLE_STRING_BYTES) fail("STRING_TOO_LARGE");
      budget.stringBytes += bytes;
      if (budget.stringBytes > MAX_AGGREGATE_STRING_BYTES) {
        fail("STRING_BUDGET_EXCEEDED");
      }
      return value;
    }
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!NumberIsFinite(value) || !NumberIsSafeInteger(value)
        || ObjectIs(value, -0)) fail("NUMBER_INVALID");
      return value;
    }
    if (typeof value !== "object") fail("VALUE_TYPE_FORBIDDEN");
    if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_INPUT_FORBIDDEN");
    SetAdd(seen, value);
    budget.nodes += 1;
    if (budget.nodes > MAX_TREE_NODES) fail("TREE_NODE_LIMIT_EXCEEDED");

    if (BufferIsBuffer(value)) {
      const backing = TypedArrayBuffer(value);
      if (SharedArrayBufferPrototype !== null
        && ObjectGetPrototypeOf(backing) === SharedArrayBufferPrototype) {
        fail("SHARED_MEMORY_BUFFER_FORBIDDEN");
      }
      const length = TypedArrayByteLength(value);
      if (length > MAX_SINGLE_BUFFER_BYTES) fail("BUFFER_TOO_LARGE");
      budget.bufferBytes += length;
      if (budget.bufferBytes > MAX_AGGREGATE_BUFFER_BYTES) {
        fail("BUFFER_BUDGET_EXCEEDED");
      }
      for (let index = 0; index < BUFFER_FORBIDDEN_OWN_KEYS.length; index += 1) {
        if (ObjectGetOwnPropertyDescriptor(value,
          BUFFER_FORBIDDEN_OWN_KEYS[index])) fail("DECORATED_BUFFER_FORBIDDEN");
      }
      const ownKeys = ReflectOwnKeys(value);
      if (ownKeys.length !== length) fail("DECORATED_BUFFER_FORBIDDEN");
      for (let index = 0; index < ownKeys.length; index += 1) {
        if (typeof ownKeys[index] !== "string"
          || ownKeys[index] !== StringConstructor(index)) {
          fail("DECORATED_BUFFER_FORBIDDEN");
        }
      }
      const copy = BufferAlloc(length);
      TypedArraySet(copy, value);
      return copy;
    }

    const array = ArrayIsArray(value);
    const prototype = ObjectGetPrototypeOf(value);
    if (prototype !== (array ? ArrayPrototype : ObjectPrototype)
      && prototype !== null) fail("NON_PLAIN_OBJECT_FORBIDDEN");
    if (array) {
      const lengthDescriptor = ObjectGetOwnPropertyDescriptor(value, "length");
      if (!lengthDescriptor || !ObjectHasOwn(lengthDescriptor, "value")
        || !NumberIsSafeInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0) fail("ARRAY_LENGTH_INVALID");
      budget.arrayElements += lengthDescriptor.value;
      if (budget.arrayElements > MAX_ARRAY_ELEMENTS) {
        fail("ARRAY_BUDGET_OR_SHAPE_INVALID");
      }
    }
    const keys = ReflectOwnKeys(value);
    budget.keys += keys.length;
    if (budget.keys > MAX_TREE_KEYS) fail("TREE_KEY_LIMIT_EXCEEDED");
    if (array) {
      const lengthDescriptor = ObjectGetOwnPropertyDescriptor(value, "length");
      const length = lengthDescriptor.value;
      if (keys.length !== length + 1) fail("ARRAY_BUDGET_OR_SHAPE_INVALID");
      const result = new ArrayConstructor();
      for (let index = 0; index < length; index += 1) {
        const key = StringConstructor(index);
        const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
        if (!descriptor || !ObjectHasOwn(descriptor, "value")
          || descriptor.enumerable !== true) fail("SPARSE_ARRAY_FORBIDDEN");
        append(result, visit(descriptor.value, depth + 1));
      }
      return result;
    }
    const result = ObjectCreate(ObjectPrototype);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || key === "__proto__"
        || key === "prototype" || key === "constructor"
        || !descriptor || !ObjectHasOwn(descriptor, "value")
        || descriptor.enumerable !== true) fail("OBJECT_FIELD_FORBIDDEN");
      ObjectDefineProperty(result, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: true, writable: true, configurable: true,
      });
    }
    return result;
  }

  return visit(untrusted, 0);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

/* Frozen dependencies retain a few constructor/iterator paths whose behavior
 * can consult realm prototypes after import.  Until hardened descendants are
 * issued, compare exact descriptors without invoking replacement accessors;
 * any realm drift fails before either dependency verifier runs. */
function assertDependencyReplayRealmStable() {
  for (let index = 0; index < DEPENDENCY_INTRINSICS.length; index += 1) {
    const expected = DEPENDENCY_INTRINSICS[index];
    const descriptor = ObjectGetOwnPropertyDescriptor(expected.owner,
      expected.key);
    if (!descriptor
      || descriptor.configurable !== expected.configurable
      || descriptor.enumerable !== expected.enumerable
      || ObjectHasOwn(descriptor, "value") !== expected.hasValue
      || descriptor.writable !== expected.writable
      || descriptor.value !== expected.value
      || descriptor.get !== expected.get
      || descriptor.set !== expected.set) {
      fail(`DEPENDENCY_INTRINSIC_CHANGED_${expected.label}`);
    }
  }
}

function canonicalEnvelopePayload(bytes, code) {
  if (!BufferIsBuffer(bytes)) fail(`${code}_BYTES_REQUIRED`);
  let parsed;
  try { parsed = JSONParse(BufferToString(bytes, "utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  exactObject(parsed, ["payload", "signature"], `${code}_ENVELOPE`);
  return parsed.payload;
}

function normalizedExpectedTransportProfile() {
  const body = {
    schema:
      OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS
        .transportProfile,
    ...OUTSIDER_USER_HELD_MAILBOX_SHADOW_TRANSPORT_PROFILE_V1,
  };
  return {
    ...body,
    transportProfileHash: digest(
      OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS
        .transportProfile,
      body),
  };
}

function checkedDriverContract(replay, transactionSource) {
  exactObject(replay, ["record", "source", "expectedSourceHash",
    "expectedContractHash"], "ADAPTER_CONTRACT_REPLAY");
  const checked = verifyTransactionSurfaceAdapterContractV1(replay.record, {
    source: replay.source,
    expectedSourceHash: replay.expectedSourceHash,
    expectedContractHash: replay.expectedContractHash,
  });
  if (checked.ok !== true || checked.decisionState !== "HOLD"
    || checked.actionAuthorized !== false
    || replay.record.contractHash !== replay.expectedContractHash
    || replay.record.supportedTransportProfiles.length !== 1
    || !same(replay.record.supportedTransportProfiles[0],
      normalizedExpectedTransportProfile())
    || replay.record.adapterClosure.adapterImplementationHash
      !== transactionSource.adapterContext.adapterArtifactHash
    || replay.record.adapterClosure.adapterPackageProfileHash
      !== transactionSource.adapterContext.adapterRevisionHash
    || replay.record.observedAt !== transactionSource.observedAt
    || replay.record.sideEffectCardinality
      .maximumAggregateSideEffectsPerTender !== 1) {
    fail("ADAPTER_CONTRACT_OR_PROFILE_SPLICE");
  }
  let delivery = null;
  let strictResponse = null;
  for (let index = 0; index < replay.record.capabilityDeclarations.length;
    index += 1) {
    const declaration = replay.record.capabilityDeclarations[index];
    const expectedSupported = declaration.capability
        === "PERMITTED_ROUTE_DISCOVERY"
      || declaration.capability === "ONE_USE_TENDER_DELIVERY"
      || declaration.capability === "STRICT_RESPONSE_OBSERVATION";
    const expectedMaximum = declaration.capability
        === "ONE_USE_TENDER_DELIVERY" ? 1 : 0;
    if (declaration.supported !== expectedSupported
      || declaration.maximumSideEffectsPerTender !== expectedMaximum
      || !same(declaration.transportProfileRefHashes,
        expectedSupported ? [TRANSPORT_PROFILE_REF_HASH] : [])) {
      fail("ADAPTER_CAPABILITY_SET_NOT_EXACT");
    }
    if (declaration.capability === "ONE_USE_TENDER_DELIVERY") {
      delivery = declaration;
    } else if (declaration.capability === "STRICT_RESPONSE_OBSERVATION") {
      strictResponse = declaration;
    }
  }
  if (!delivery || delivery.supported !== true
    || delivery.maximumSideEffectsPerTender !== 1
    || !same(delivery.transportProfileRefHashes,
      [TRANSPORT_PROFILE_REF_HASH])
    || !strictResponse || strictResponse.supported !== true
    || strictResponse.maximumSideEffectsPerTender !== 0
    || !same(strictResponse.transportProfileRefHashes,
      [TRANSPORT_PROFILE_REF_HASH])) {
    fail("ADAPTER_CAPABILITY_PROFILE_SPLICE");
  }
  return checked;
}

function checkedTransactionReplay(replay) {
  exactObject(replay, ["source", "expectedReplayHash"],
    "PERMISSIONED_TRANSACTION_REPLAY");
  const checked = verifyPermissionedTransactionInterfaceSourceReplayV1(
    replay.source, replay.expectedReplayHash);
  if (checked.ok !== true || checked.replayHash !== replay.expectedReplayHash
    || checked.profile
      !== OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1
    || checked.rawSourceReplayPerformed !== true
    || checked.transportAppendOnlyOccurrenceChainReplayed !== true
    || checked.transportOccurrenceDenominatorReplayed !== true
    || checked.permissionAppendOnlyLifecycleReplayed !== true
    || checked.sourceDeclaredPermissionCurrentAtObservedAt !== true
    || checked.sourceDeclaredResponseCurrent !== true
    || checked.sendAuthorized !== false || checked.authority !== "NONE"
    || checked.decisionState !== "HOLD" || checked.liveIoPerformed !== false) {
    fail("PERMISSIONED_TRANSACTION_SOURCE_REPLAY_NOT_CURRENT_HOLD");
  }
  return checked;
}

function transportInventory(source, checked) {
  const occurrenceBytes = [source.routeObservationSourceBytes,
    source.outboundMessageSourceBytes,
    source.sendAcknowledgementSourceBytes];
  const expectedHashes = [source.expectedRouteObservationSourceHash,
    source.expectedOutboundMessageSourceHash,
    source.expectedSendAcknowledgementSourceHash];
  const kinds = ["ROUTE_OBSERVATION", "OUTBOUND_TENDER",
    "SEND_ACKNOWLEDGEMENT"];
  for (let index = 0; index < source.inboundMessageSourceBytes.length;
    index += 1) {
    append(occurrenceBytes, source.inboundMessageSourceBytes[index]);
    append(expectedHashes, source.expectedInboundMessageSourceHashes[index]);
    append(kinds, "INBOUND_MESSAGE");
  }
  if (occurrenceBytes.length !== checked.transportOccurrenceCount) {
    fail("TRANSPORT_OCCURRENCE_DENOMINATOR_SPLICE");
  }
  const occurrenceSourceHashes = [];
  const occurrenceIdentityHashes = [];
  let sourceBytes = 0;
  for (let index = 0; index < occurrenceBytes.length; index += 1) {
    const actual = sha256Bytes(occurrenceBytes[index]);
    if (actual !== expectedHashes[index]) fail("TRANSPORT_SOURCE_HASH_SPLICE");
    const payload = canonicalEnvelopePayload(occurrenceBytes[index],
      `TRANSPORT_OCCURRENCE_${index + 1}`);
    if (payload.ordinal !== index + 1) fail("TRANSPORT_ORDINAL_SPLICE");
    append(occurrenceSourceHashes, actual);
    append(occurrenceIdentityHashes,
      hash(payload.occurrenceIdentityHash, "TRANSPORT_OCCURRENCE_IDENTITY_HASH"));
    sourceBytes += TypedArrayByteLength(occurrenceBytes[index]);
  }
  const rawHashes = [source.expectedOutboundRfc822Hash];
  const rawBytes = [source.outboundRfc822Bytes];
  for (let index = 0; index < source.inboundRfc822Bytes.length; index += 1) {
    append(rawHashes, source.expectedInboundRfc822Hashes[index]);
    append(rawBytes, source.inboundRfc822Bytes[index]);
  }
  for (let index = 0; index < rawBytes.length; index += 1) {
    if (sha256Bytes(rawBytes[index]) !== rawHashes[index]) {
      fail("RFC822_SOURCE_HASH_SPLICE");
    }
    sourceBytes += TypedArrayByteLength(rawBytes[index]);
  }
  if (sha256Bytes(source.transportHeadSourceBytes)
      !== source.expectedTransportHeadSourceHash) {
    fail("TRANSPORT_HEAD_SOURCE_HASH_SPLICE");
  }
  sourceBytes += TypedArrayByteLength(source.transportHeadSourceBytes);
  const body = {
    transportOccurrenceCount: occurrenceBytes.length,
    transportDistinctObjectCount: checked.transportDistinctObjectCount,
    occurrenceSourceHashes,
    occurrenceIdentityHashes,
    rfc822SourceCount: rawBytes.length,
    rfc822SourceHashes: rawHashes,
    transportHeadSourceHash: source.expectedTransportHeadSourceHash,
    exactTransportSourceByteCount: sourceBytes,
  };
  return deepFreeze({
    ...body,
    transportSourceBundleHash: digest(
      "outsider/user-held-mailbox-shadow-transport-source-bundle/v1", body),
  });
}

function outboundControls(source) {
  const outbound = canonicalEnvelopePayload(source.outboundMessageSourceBytes,
    "OUTBOUND_TENDER");
  return {
    idempotencyKeyHash: hash(outbound.idempotencyKeyHash,
      "OUTBOUND_IDEMPOTENCY_KEY_HASH"),
    oneUseNonceHash: hash(outbound.transportOccurrenceNonceHash,
      "OUTBOUND_ONE_USE_NONCE_HASH"),
  };
}

const REQUEST_FIELDS = ObjectFreeze([
  "adapterContractReplay", "permissionedTransactionReplay", "invocation",
  "privateProjectionNonce",
]);
const INVOCATION_FIELDS = ObjectFreeze([
  "invokedAt", "formationDeadline", "oneUseNonceHash", "idempotencyKeyHash",
]);

function buildAdmission(request) {
  exactObject(request, REQUEST_FIELDS, "REQUEST");
  exactObject(request.invocation, INVOCATION_FIELDS, "INVOCATION");
  const transaction = checkedTransactionReplay(
    request.permissionedTransactionReplay);
  checkedDriverContract(request.adapterContractReplay,
    request.permissionedTransactionReplay.source);
  const invokedAt = instant(request.invocation.invokedAt, "INVOKED_AT");
  const deadline = instant(request.invocation.formationDeadline,
    "FORMATION_DEADLINE");
  if (invokedAt !== request.permissionedTransactionReplay.source.observedAt
    || deadline
      !== request.permissionedTransactionReplay.source.tender.formationDeadline) {
    fail("INVOCATION_TIME_OR_DEADLINE_SPLICE");
  }
  if (DateParse(invokedAt) >= DateParse(deadline)) {
    fail("FORMATION_DEADLINE_REACHED");
  }
  const controls = outboundControls(
    request.permissionedTransactionReplay.source);
  if (request.invocation.oneUseNonceHash !== controls.oneUseNonceHash
    || request.invocation.idempotencyKeyHash !== controls.idempotencyKeyHash) {
    fail("ONE_USE_CONTROL_SPLICE");
  }
  if (typeof request.privateProjectionNonce !== "string"
    || !RegExpTest(PRIVATE_NONCE, request.privateProjectionNonce)) {
    fail("PRIVATE_PROJECTION_NONCE_INVALID");
  }
  const inventory = transportInventory(
    request.permissionedTransactionReplay.source, transaction);
  const saltedPrivateBindingCommitmentHash = digest(
    "outsider/user-held-mailbox-shadow-salted-private-binding/v1", {
      privateProjectionNonce: request.privateProjectionNonce,
      adapterContractSourceHash:
        request.adapterContractReplay.expectedSourceHash,
      adapterContractHash: request.adapterContractReplay.expectedContractHash,
      transactionReplayHash:
        request.permissionedTransactionReplay.expectedReplayHash,
      tenderHash: transaction.tenderHash,
      requirementObjectHash: transaction.requirementObjectHash,
      routeObjectHash: transaction.routeObjectHash,
      currentCandidateHash: transaction.currentCandidateHash,
      permissionedTransactionPrivateSourceBundleCommitmentHash:
        transaction.privateSourceBundleCommitmentHash,
      oneUseNonceHash: controls.oneUseNonceHash,
      idempotencyKeyHash: controls.idempotencyKeyHash,
      invokedAt,
      deadline,
      transportSourceBundleHash: inventory.transportSourceBundleHash,
    });
  return { transaction, controls, inventory, invokedAt, deadline,
    requestObjectHash: saltedPrivateBindingCommitmentHash,
    saltedPrivateBindingCommitmentHash };
}

function appendReceipt(admission) {
  const transaction = admission.transaction;
  const body = {
    schema:
      OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_SCHEMAS.appendReceipt,
    schemaVersion: "1.0.0",
    mode: "SHADOW_ONLY",
    allowedUse: "TEST_OR_RESEARCH",
    strongestState: "MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOL_APPENDED_HOLD",
    transportProfileRefHash: TRANSPORT_PROFILE_REF_HASH,
    exactPrivateBindingValuesRetainedInPrivateSpoolOnly: true,
    tenderHash: transaction.tenderHash,
    workOrderHash: transaction.workOrderHash,
    typedGraphHash: transaction.typedGraphHash,
    principalEpochProjectionHash: transaction.principalEpochProjectionHash,
    accountableDeploymentSubjectHash:
      transaction.accountableDeploymentSubjectHash,
    runtimeInstanceHash: transaction.runtimeInstanceHash,
    embodimentRevisionHash: transaction.embodimentRevisionHash,
    delegationEdgeHash: transaction.delegationEdgeHash,
    episodeHash: transaction.episodeHash,
    attemptHash: transaction.attemptHash,
    requirementKind: transaction.requirementKind,
    requirementId: transaction.requirementId,
    requirementObjectHash: transaction.requirementObjectHash,
    routeKind: transaction.routeKind,
    invokedAt: admission.invokedAt,
    formationDeadline: admission.deadline,
    transportOccurrenceCount: admission.inventory.transportOccurrenceCount,
    transportDistinctObjectCount:
      admission.inventory.transportDistinctObjectCount,
    rfc822SourceCount: admission.inventory.rfc822SourceCount,
    exactTransportSourceByteCount:
      admission.inventory.exactTransportSourceByteCount,
    saltedPrivateBindingCommitmentHash:
      admission.saltedPrivateBindingCommitmentHash,
    shadowSpoolAppendOccurrenceCount: 1,
    shadowSpoolDistinctObjectCount: 1,
    shadowTenderSourceAppended: true,
    exactSourceBytesAvailableOnlyThroughCapabilityGatedPrivateReadback: true,
    rawSourceBytesPubliclyProjected: false,
    privateProjectionNonceProjected: false,
    oneUseNonceProjected: false,
    idempotencyKeyProjected: false,
    stablePrivateHandlePubliclyProjected: false,
    moduleInstanceLocalNonceConsumed: true,
    moduleInstanceLocalIdempotencyObservedBeforeAppend: true,
    processWideNonceFreshnessEstablished: false,
    processWideIdempotencyEstablished: false,
    durableOrExternalNonceFreshnessEstablished: false,
    durableOrExternalIdempotencyEstablished: false,
    realMailboxAuthorityEstablished: false,
    realSendAuthorized: false,
    realTenderDelivered: false,
    providerContactPerformed: false,
    networkIoPerformed: false,
    filesystemIoPerformed: false,
    browserAutomationPerformed: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    outsiderStaffTouchCount: null,
    staffTouchDenominatorComplete: false,
    zeroInternalOpsEstablished: false,
    internalHumanFallbackPermitted: false,
    enabledCapabilities: ENABLED_CAPABILITIES,
    provenAuthorityCapabilities: PROVEN_AUTHORITY,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOL_ONLY",
    externalAuthority: "NONE",
    decisionState: "HOLD",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_BOUNDARY,
  };
  return deepFreeze({
    ...body,
    receiptHash: digest(
      OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_SCHEMAS.appendReceipt,
      body),
  });
}

const capabilityStates = new WeakMapConstructor();
const consumedNonceObjects = new MapConstructor();
const idempotencyObjects = new MapConstructor();

/** Create a non-serializable bearer for one private in-memory shadow append. */
export function createUserHeldMailboxShadowCapabilityV1() {
  const capability = ObjectCreate(null);
  ObjectDefineProperty(capability, "mode", {
    value: "SHADOW_ONLY", enumerable: true, writable: false,
    configurable: false,
  });
  ObjectDefineProperty(capability, "allowedUse", {
    value: "TEST_OR_RESEARCH", enumerable: true, writable: false,
    configurable: false,
  });
  ObjectDefineProperty(capability, "enabledCapability", {
    value: OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY,
    enumerable: true, writable: false, configurable: false,
  });
  ObjectFreeze(capability);
  WeakMapSet(capabilityStates, capability, {
    requestObjectHash: null, receipt: null, source: null,
    expectedReplayHash: null, adapterContractReplay: null,
    exactPrivateBindings: null, inventory: null,
  });
  return capability;
}

function capabilityState(capability) {
  if ((typeof capability !== "object" && typeof capability !== "function")
    || capability === null || !WeakMapHas(capabilityStates, capability)) {
    fail("MODULE_ISSUED_SHADOW_CAPABILITY_REQUIRED");
  }
  return WeakMapGet(capabilityStates, capability);
}

/**
 * Append one source-replay-valid lifecycle to the shadow spool.  An exact
 * duplicate is idempotent and returns the same public receipt; no second spool
 * occurrence is created.
 */
export function appendUserHeldMailboxShadowSpoolV1(capability,
  untrustedRequest = {}) {
  const state = capabilityState(capability);
  const request = clonePreflight(untrustedRequest);
  assertDependencyReplayRealmStable();
  const admission = buildAdmission(request);
  if (state.receipt !== null) {
    if (state.requestObjectHash === admission.requestObjectHash) {
      return state.receipt;
    }
    fail("CAPABILITY_ALREADY_CONSUMED");
  }
  if (MapHas(consumedNonceObjects, admission.controls.oneUseNonceHash)) {
    fail("ONE_USE_NONCE_ALREADY_CONSUMED");
  }
  if (MapHas(idempotencyObjects, admission.controls.idempotencyKeyHash)) {
    const prior = MapGet(idempotencyObjects,
      admission.controls.idempotencyKeyHash);
    if (prior !== admission.requestObjectHash) fail("IDEMPOTENCY_OBJECT_CONFLICT");
    fail("IDEMPOTENCY_KEY_ALREADY_BOUND_TO_OTHER_CAPABILITY");
  }
  if (MapSize(consumedNonceObjects)
      >= MAX_MODULE_INSTANCE_LOCAL_APPEND_OBJECTS
    || MapSize(idempotencyObjects)
      >= MAX_MODULE_INSTANCE_LOCAL_APPEND_OBJECTS) {
    fail("MODULE_INSTANCE_LOCAL_SPOOL_CAPACITY_REACHED");
  }
  const receipt = appendReceipt(admission);

  /* No await/callback/re-entrant seam exists between these writes. */
  MapSet(consumedNonceObjects, admission.controls.oneUseNonceHash,
    admission.requestObjectHash);
  MapSet(idempotencyObjects, admission.controls.idempotencyKeyHash,
    admission.requestObjectHash);
  state.requestObjectHash = admission.requestObjectHash;
  state.receipt = receipt;
  state.source = request.permissionedTransactionReplay.source;
  state.expectedReplayHash =
    request.permissionedTransactionReplay.expectedReplayHash;
  state.adapterContractReplay = request.adapterContractReplay;
  state.exactPrivateBindings = {
    adapterContractSourceHash:
      request.adapterContractReplay.expectedSourceHash,
    adapterContractHash: request.adapterContractReplay.expectedContractHash,
    permissionedTransactionReplayHash:
      request.permissionedTransactionReplay.expectedReplayHash,
    permissionedTransactionPrivateSourceBundleCommitmentHash:
      admission.transaction.privateSourceBundleCommitmentHash,
    routeObjectHash: admission.transaction.routeObjectHash,
    currentCandidateHash: admission.transaction.currentCandidateHash,
    transportSourceBundleHash: admission.inventory.transportSourceBundleHash,
  };
  state.inventory = admission.inventory;
  return receipt;
}

function privateTransportSources(source) {
  const occurrences = [];
  const fixed = [
    ["ROUTE_OBSERVATION", source.routeObservationSourceBytes,
      source.expectedRouteObservationSourceHash],
    ["OUTBOUND_TENDER", source.outboundMessageSourceBytes,
      source.expectedOutboundMessageSourceHash],
    ["SEND_ACKNOWLEDGEMENT", source.sendAcknowledgementSourceBytes,
      source.expectedSendAcknowledgementSourceHash],
  ];
  for (let index = 0; index < fixed.length; index += 1) {
    append(occurrences, {
      kind: fixed[index][0], ordinal: index + 1,
      sourceHash: fixed[index][2], sourceBytes: BufferFrom(fixed[index][1]),
    });
  }
  for (let index = 0; index < source.inboundMessageSourceBytes.length;
    index += 1) {
    append(occurrences, {
      kind: "INBOUND_MESSAGE", ordinal: index + 4,
      sourceHash: source.expectedInboundMessageSourceHashes[index],
      sourceBytes: BufferFrom(source.inboundMessageSourceBytes[index]),
    });
  }
  const rfc822 = [{
    direction: "OUTBOUND", sourceHash: source.expectedOutboundRfc822Hash,
    sourceBytes: BufferFrom(source.outboundRfc822Bytes),
  }];
  for (let index = 0; index < source.inboundRfc822Bytes.length; index += 1) {
    append(rfc822, {
      direction: "INBOUND",
      sourceHash: source.expectedInboundRfc822Hashes[index],
      sourceBytes: BufferFrom(source.inboundRfc822Bytes[index]),
    });
  }
  return {
    occurrences,
    rfc822,
    transportHead: {
      sourceHash: source.expectedTransportHeadSourceHash,
      sourceBytes: BufferFrom(source.transportHeadSourceBytes),
    },
  };
}

/** Private exact-byte readback.  Every call returns fresh buffer/object copies. */
export function readUserHeldMailboxShadowSpoolV1(capability) {
  const state = capabilityState(capability);
  if (state.receipt === null) fail("SHADOW_SPOOL_EMPTY");
  const source = clonePreflight(state.source);
  const adapterContractReplay = clonePreflight(state.adapterContractReplay);
  const transport = privateTransportSources(source);
  return {
    schema:
      OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_SCHEMAS.privateReadback,
    schemaVersion: "1.0.0",
    mode: "SHADOW_ONLY",
    allowedUse: "TEST_OR_RESEARCH",
    exposure: "PRIVATE_CAPABILITY_GATED_RAW_SOURCE_READBACK",
    receipt: state.receipt,
    adapterContractReplay,
    permissionedTransactionReplay: {
      source,
      expectedReplayHash: state.expectedReplayHash,
    },
    exactPrivateBindings: clonePreflight(state.exactPrivateBindings),
    transportOccurrenceSourceBytes: transport.occurrences,
    rfc822SourceBytes: transport.rfc822,
    transportHeadSourceBytes: transport.transportHead,
    publicProjectionPermitted: false,
    networkIoPerformed: false,
    filesystemIoPerformed: false,
    realTenderDelivered: false,
  };
}
