/*
 * Outcome Formation Engine: three-slot shadow runner v1.
 *
 * This module composes exactly one RESOURCE, EVIDENCE, and RECOVERY mailbox
 * shadow append against an exactly replayed coordinator and formation-control
 * ledger.  It performs no live I/O.  Its only possible effects are three
 * module-private in-memory shadow-spool appends.  Those appends are not an
 * atomic transaction: any partial history remains explicit and can never mint
 * a real-world promise, authority, capacity, price, guarantee, or settlement.
 */

import { Buffer } from "node:buffer";
import { createHash, createPublicKey } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES,
  verifyFormationControlLedgerV1,
} from "./outsider-formation-control-ledger-v1.js";
import {
  OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_STATES,
  verifyOutcomeFormationTemporaryNetworkCoordinatorV1,
} from "./outsider-outcome-formation-temporary-network-coordinator-v1.js";
import {
  OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS,
  verifyTransactionSurfaceAdapterContractV1,
} from "./outsider-transaction-surface-adapter-contract-v1.js";
import {
  OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1,
  verifyPermissionedTransactionInterfaceSourceReplayV1,
} from "./outsider-permissioned-transaction-interface-source-replay-v1.js";
import {
  verifyResourceOwnerStandingTrustReplayV1,
} from "./outsider-resource-owner-standing-trust-replay-v1.js";
import {
  OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY,
  OUTSIDER_USER_HELD_MAILBOX_SHADOW_TRANSPORT_PROFILE_V1,
  appendUserHeldMailboxShadowSpoolV1,
  readUserHeldMailboxShadowSpoolV1,
} from "./outsider-user-held-mailbox-shadow-driver-v1.js";

const uncurryThis = (method) => Function.prototype.call.bind(method);
const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = uncurryThis(Array.prototype.sort);
const BufferAlloc = Buffer.alloc;
const BufferByteLength = Buffer.byteLength;
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferToString = uncurryThis(Buffer.prototype.toString);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = uncurryThis(Date.prototype.toISOString);
const ErrorConstructor = Error;
const ErrorPrototype = Error.prototype;
const FunctionPrototype = Function.prototype;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = uncurryThis(HashPrototype.digest);
const HashUpdate = uncurryThis(HashPrototype.update);
const JSONParse = JSON.parse;
const MapConstructor = Map;
const MapGet = uncurryThis(Map.prototype.get);
const MapHas = uncurryThis(Map.prototype.has);
const MapSet = uncurryThis(Map.prototype.set);
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
const SetDelete = uncurryThis(Set.prototype.delete);
const SetHas = uncurryThis(Set.prototype.has);
const SetPrototype = Set.prototype;
const MapPrototype = Map.prototype;
const RegExpPrototype = RegExp.prototype;
const StringConstructor = String;
const StringCharCodeAt = uncurryThis(String.prototype.charCodeAt);
const TypeErrorConstructor = TypeError;
const TypeErrorPrototype = TypeError.prototype;
const TypedArrayPrototype = ObjectGetPrototypeOf(Uint8Array.prototype);
const TypedArrayBuffer = uncurryThis(
  ObjectGetOwnPropertyDescriptor(TypedArrayPrototype, "buffer").get);
const TypedArrayByteLength = uncurryThis(
  ObjectGetOwnPropertyDescriptor(TypedArrayPrototype, "byteLength").get);
const TypedArraySet = uncurryThis(TypedArrayPrototype.set);
const SharedArrayBufferPrototype = typeof SharedArrayBuffer === "function"
  ? SharedArrayBuffer.prototype : null;

const SymbolIterator = Symbol.iterator;
const SymbolHasInstance = Symbol.hasInstance;
const ArrayIterator = uncurryThis(
  ObjectGetOwnPropertyDescriptor(ArrayPrototype, SymbolIterator).value);
const ArrayIteratorPrototype = ObjectGetPrototypeOf(ArrayIterator([]));
const IntrinsicPublicKeyPrototype = ObjectGetPrototypeOf(createPublicKey({
  key: BufferFrom(`302a300506032b6570032100${"00".repeat(32)}`, "hex"),
  format: "der",
  type: "spki",
}));

const PREFIX = "OUTSIDER_OUTCOME_FORMATION_SHADOW_RUNNER_V1_";
const SHADOW_PREFIX = "OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const PRIVATE_NONCE = /^[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MANDATORY_KINDS = ObjectFreeze(["RESOURCE", "EVIDENCE", "RECOVERY"]);
const KIND_RANK = ObjectFreeze({ RESOURCE: 0, EVIDENCE: 1, RECOVERY: 2 });
const MAX_SINGLE_BUFFER_BYTES = 1024 * 1024;
const MAX_AGGREGATE_BUFFER_BYTES = 256 * 1024 * 1024;
const MAX_SINGLE_STRING_BYTES = 1024 * 1024;
const MAX_AGGREGATE_STRING_BYTES = 320 * 1024 * 1024;
const MAX_ARRAY_ELEMENTS = 1_000_000;
const MAX_TREE_NODES = 3_000_000;
const MAX_TREE_KEYS = 8_000_000;
const MAX_TREE_DEPTH = 144;
const BUFFER_FORBIDDEN_OWN_KEYS = ObjectFreeze([
  "length", "byteLength", "byteOffset", "buffer", "set", "subarray",
  SymbolIterator,
]);

export const OUTSIDER_OUTCOME_FORMATION_SHADOW_RUNNER_V1_SCHEMAS
  = ObjectFreeze({
    result: "outsider/outcome-formation-three-slot-shadow-run/v1",
  });

export const OUTSIDER_OUTCOME_FORMATION_SHADOW_RUNNER_V1_LIMITS
  = ObjectFreeze({
    exactMandatoryCapabilityCount: 3,
    exactMandatoryRequestCount: 3,
    maximumSingleBufferBytes: MAX_SINGLE_BUFFER_BYTES,
    maximumAggregateBufferBytes: MAX_AGGREGATE_BUFFER_BYTES,
    maximumSingleStringBytes: MAX_SINGLE_STRING_BYTES,
    maximumAggregateStringBytes: MAX_AGGREGATE_STRING_BYTES,
    maximumAggregateArrayElements: MAX_ARRAY_ELEMENTS,
    maximumTreeNodes: MAX_TREE_NODES,
    maximumTreeKeys: MAX_TREE_KEYS,
    maximumTreeDepth: MAX_TREE_DEPTH,
  });

const ENABLED_CAPABILITY_TYPES = ObjectFreeze([
  OUTSIDER_USER_HELD_MAILBOX_SHADOW_DRIVER_V1_CAPABILITY,
]);

export const OUTSIDER_OUTCOME_FORMATION_SHADOW_RUNNER_V1_BOUNDARY
  = deepFreeze({
    position: "THREE_MODULE_PRIVATE_SHADOW_SPOOL_RUNNER_HOLD_ONLY",
    mode: "SHADOW_ONLY",
    allowedUse: "TEST_OR_RESEARCH",
    mandatoryRequirementKinds: MANDATORY_KINDS,
    exactOneResourceEvidenceAndRecoveryRequestRequired: true,
    exactCoordinatorRawSourceReplayRequired: true,
    exactControlLedgerRawSourceReplayRequired: true,
    requestNonceReservationAndIdempotencyControlBindingRequired: true,
    allMandatorySourceDeclaredPathsCurrentAtCoordinatorObservedAtRequired:
      true,
    eachSlotSourceDeclaredResponseAndOwnerStandingCurrentRequired: true,
    sourceDeclaredCurrentMintsAuthorityOrCapacity: false,
    terminalControlCheckedBeforeAnyAppendAttempt: true,
    allCloneableInputsPreflightedBeforeDependencyReplay: true,
    dependencyRealmGuardScope:
      "EXPLICIT_REACHABLE_LIVE_INTRINSIC_DESCRIPTOR_ALLOWLIST",
    completeDependencyRealmIntegrityEstablished: false,
    unguardedDependencyClosureDecision: "HOLD",
    exactlyThreeDistinctModuleIssuedCapabilitiesRequired: true,
    threeDistinctAdapterInstanceAndSourcePinsRequired: true,
    oneUsePermissionGrantReuseAcrossSlotsPermitted: false,
    credentialsAcceptedOrHandled: false,
    credentialLeaseEstablished: false,
    capabilityHandlesPubliclyProjected: false,
    privateRequestOrSourceHandlesPubliclyProjected: false,
    perSlotRouteCandidateTransactionOrReceiptHashesProjected: false,
    saltedAggregatePrivateRunCommitmentProjected: true,
    filesystemInterfacePresent: false,
    pathInterfacePresent: false,
    networkInterfacePresent: false,
    browserInterfacePresent: false,
    osMailClientInterfacePresent: false,
    callbackInterfacePresent: false,
    ambientCredentialInterfacePresent: false,
    liveIoPerformed: false,
    providerContactPerformed: false,
    realTenderDelivered: false,
    shadowTransportDriverPresent: true,
    realTransactionDriverPresent: false,
    crossSpoolAtomicAppendEstablished: false,
    partialShadowAppendHistoryPreserved: true,
    partialShadowAppendCanMintCommitment: false,
    rollbackOfPriorShadowOccurrencePermitted: false,
    enabledCapabilityTypes: ENABLED_CAPABILITY_TYPES,
    provenAuthorityCapabilityTypes: ENABLED_CAPABILITY_TYPES,
    maximumEnabledCapabilityBearerCount: 3,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    capabilityBearerAccountingSeparatesHistoricalEffectsFromRemainingBearers:
      true,
    consequenceReach:
      "AT_MOST_THREE_MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOLS_ONLY",
    processWideNonceFreshnessEstablished: false,
    processWideIdempotencyEstablished: false,
    durableOrExternalNonceFreshnessEstablished: false,
    durableOrExternalIdempotencyEstablished: false,
    staffTouchDenominatorComplete: false,
    zeroInternalOpsEstablished: false,
    outsiderStaffTouchCount: null,
    internalHumanFallbackPermitted: false,
    humanQueueCreated: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    independentWitnessCapacityReserved: false,
    recoveryCapacityReserved: false,
    atomicCommitmentGateSatisfied: false,
    userOutcomePromiseIssued: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    moneyMovementEnabled: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  });

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

/* Frozen replay dependencies still contain a small number of post-import live
 * intrinsic lookups.  This is an explicit reachable-surface gate, not a claim
 * of arbitrary realm integrity. */
const DEPENDENCY_INTRINSICS = ObjectFreeze([
  dependencyIntrinsic(FunctionPrototype, SymbolHasInstance,
    "FUNCTION_HAS_INSTANCE"),
  dependencyIntrinsic(ErrorConstructor, "prototype", "ERROR_PROTOTYPE"),
  dependencyIntrinsic(TypeErrorConstructor, "prototype",
    "TYPE_ERROR_PROTOTYPE"),
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
  dependencyIntrinsic(ObjectConstructor, "defineProperty",
    "OBJECT_DEFINE_PROPERTY"),
  dependencyIntrinsic(ObjectConstructor, "freeze", "OBJECT_FREEZE"),
  dependencyIntrinsic(ObjectConstructor, "getOwnPropertyDescriptor",
    "OBJECT_GET_OWN_PROPERTY_DESCRIPTOR"),
  dependencyIntrinsic(ObjectConstructor, "getOwnPropertyDescriptors",
    "OBJECT_GET_OWN_PROPERTY_DESCRIPTORS"),
  dependencyIntrinsic(ObjectConstructor, "getPrototypeOf",
    "OBJECT_GET_PROTOTYPE"),
  dependencyIntrinsic(ObjectConstructor, "hasOwn", "OBJECT_HAS_OWN"),
  dependencyIntrinsic(ObjectConstructor, "isFrozen", "OBJECT_IS_FROZEN"),
  dependencyIntrinsic(ReflectObject, "ownKeys", "REFLECT_OWN_KEYS"),
]);

const DEPENDENCY_CONSTRUCTOR_PARENTS = ObjectFreeze([
  ObjectFreeze({ constructor: ErrorConstructor,
    parent: ObjectGetPrototypeOf(ErrorConstructor), label: "ERROR" }),
  ObjectFreeze({ constructor: TypeErrorConstructor,
    parent: ObjectGetPrototypeOf(TypeErrorConstructor), label: "TYPE_ERROR" }),
]);

function assertDependencyRealmStable() {
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
  for (let index = 0; index < DEPENDENCY_CONSTRUCTOR_PARENTS.length;
    index += 1) {
    const expected = DEPENDENCY_CONSTRUCTOR_PARENTS[index];
    if (ObjectGetOwnPropertyDescriptor(expected.constructor,
      SymbolHasInstance) !== undefined
      || ObjectGetPrototypeOf(expected.constructor) !== expected.parent) {
      fail(`DEPENDENCY_CONSTRUCTOR_CHANGED_${expected.label}`);
    }
  }
}

function rawExactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || isProxy(value)
    || ArrayIsArray(value) || BufferIsBuffer(value)) {
    fail(`${code}_OBJECT_REQUIRED`);
  }
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_PROTOTYPE_INVALID`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  const descriptors = ObjectCreate(null);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
    let allowed = false;
    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
      if (key === fields[fieldIndex]) allowed = true;
    }
    if (typeof key !== "string" || !allowed || !descriptor
      || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
    ObjectDefineProperty(descriptors, key, {
      value: descriptor, enumerable: true, writable: false,
      configurable: false,
    });
  }
  return descriptors;
}

function exactObject(value, fields, code) {
  rawExactObject(value, fields, code);
  return value;
}

function capabilityVector(value) {
  if (value === null || typeof value !== "object" || isProxy(value)
    || !ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype) {
    fail("CAPABILITIES_ARRAY_REQUIRED");
  }
  const lengthDescriptor = ObjectGetOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !ObjectHasOwn(lengthDescriptor, "value")
    || lengthDescriptor.value !== 3) fail("CAPABILITIES_COUNT_INVALID");
  const keys = ReflectOwnKeys(value);
  if (keys.length !== 4) fail("CAPABILITIES_ARRAY_DECORATED");
  const result = [];
  for (let index = 0; index < 3; index += 1) {
    if (keys[index] !== StringConstructor(index)) {
      fail("CAPABILITIES_ARRAY_SPARSE_OR_REORDERED");
    }
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail("CAPABILITY_DESCRIPTOR_INVALID");
    const capability = descriptor.value;
    if ((typeof capability !== "object" && typeof capability !== "function")
      || capability === null || isProxy(capability)) {
      fail("CAPABILITY_IDENTITY_INVALID");
    }
    for (let prior = 0; prior < result.length; prior += 1) {
      if (result[prior] === capability) fail("CAPABILITIES_NOT_DISTINCT");
    }
    append(result, capability);
  }
  if (keys[3] !== "length") fail("CAPABILITIES_ARRAY_DECORATED");
  return result;
}

function cloneBundle(untrusted) {
  const active = new SetConstructor();
  const budget = { nodes: 0, keys: 0, arrayElements: 0,
    stringBytes: 0, bufferBytes: 0 };

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
    if (SetHas(active, value)) fail("CYCLIC_INPUT_FORBIDDEN");
    SetAdd(active, value);
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
      const keys = ReflectOwnKeys(value);
      if (keys.length !== length) fail("DECORATED_BUFFER_FORBIDDEN");
      for (let index = 0; index < keys.length; index += 1) {
        if (keys[index] !== StringConstructor(index)) {
          fail("DECORATED_BUFFER_FORBIDDEN");
        }
      }
      const copy = BufferAlloc(length);
      TypedArraySet(copy, value);
      SetDelete(active, value);
      return copy;
    }

    const array = ArrayIsArray(value);
    const prototype = ObjectGetPrototypeOf(value);
    if (prototype !== (array ? ArrayPrototype : ObjectPrototype)
      && prototype !== null) fail("NON_PLAIN_OBJECT_FORBIDDEN");
    let length = null;
    if (array) {
      const descriptor = ObjectGetOwnPropertyDescriptor(value, "length");
      if (!descriptor || !ObjectHasOwn(descriptor, "value")
        || !NumberIsSafeInteger(descriptor.value) || descriptor.value < 0) {
        fail("ARRAY_LENGTH_INVALID");
      }
      length = descriptor.value;
      budget.arrayElements += length;
      if (budget.arrayElements > MAX_ARRAY_ELEMENTS) {
        fail("ARRAY_BUDGET_EXCEEDED");
      }
    }
    const keys = ReflectOwnKeys(value);
    budget.keys += keys.length;
    if (budget.keys > MAX_TREE_KEYS) fail("TREE_KEY_LIMIT_EXCEEDED");
    if (array) {
      if (keys.length !== length + 1 || keys[keys.length - 1] !== "length") {
        fail("SPARSE_OR_DECORATED_ARRAY_FORBIDDEN");
      }
      const result = [];
      for (let index = 0; index < length; index += 1) {
        if (keys[index] !== StringConstructor(index)) {
          fail("SPARSE_OR_DECORATED_ARRAY_FORBIDDEN");
        }
        const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
        if (!descriptor || !ObjectHasOwn(descriptor, "value")
          || descriptor.enumerable !== true) fail("ARRAY_ACCESSOR_FORBIDDEN");
        append(result, visit(descriptor.value, depth + 1));
      }
      SetDelete(active, value);
      return result;
    }
    const result = ObjectCreate(ObjectPrototype);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || key === "__proto__"
        || key === "prototype" || key === "constructor" || !descriptor
        || !ObjectHasOwn(descriptor, "value")
        || descriptor.enumerable !== true) fail("OBJECT_FIELD_FORBIDDEN");
      ObjectDefineProperty(result, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: true, writable: true, configurable: true,
      });
    }
    SetDelete(active, value);
    return result;
  }

  return { value: visit(untrusted, 0), budget };
}

const INPUT_FIELDS = ObjectFreeze([
  "shadowCapabilities", "shadowAppendRequests", "coordinatorReplay",
  "controlLedgerReplay", "privateProjectionNonce",
]);

function preflightInput(untrusted) {
  const descriptors = rawExactObject(untrusted, INPUT_FIELDS, "INPUT");
  const capabilities = capabilityVector(descriptors.shadowCapabilities.value);
  const bundleInput = {
    shadowAppendRequests: descriptors.shadowAppendRequests.value,
    coordinatorReplay: descriptors.coordinatorReplay.value,
    controlLedgerReplay: descriptors.controlLedgerReplay.value,
    privateProjectionNonce: descriptors.privateProjectionNonce.value,
  };
  const cloned = cloneBundle(bundleInput);
  const value = cloned.value;
  if (!ArrayIsArray(value.shadowAppendRequests)
    || value.shadowAppendRequests.length !== 3) {
    fail("SHADOW_APPEND_REQUEST_COUNT_INVALID");
  }
  if (typeof value.privateProjectionNonce !== "string"
    || !RegExpTest(PRIVATE_NONCE, value.privateProjectionNonce)) {
    fail("PRIVATE_PROJECTION_NONCE_INVALID");
  }
  return { ...value, capabilities, budget: cloned.budget };
}

const COORDINATOR_REPLAY_FIELDS = ObjectFreeze([
  "source", "expectedCoordinatorHash",
]);
const CONTROL_REPLAY_FIELDS = ObjectFreeze([
  "record", "source", "expectedSourceHash", "expectedLedgerHash",
]);

function replayControlAndCoordinator(input) {
  const coordinatorReplay = exactObject(input.coordinatorReplay,
    COORDINATOR_REPLAY_FIELDS, "COORDINATOR_REPLAY");
  const controlReplay = exactObject(input.controlLedgerReplay,
    CONTROL_REPLAY_FIELDS, "CONTROL_LEDGER_REPLAY");
  hash(coordinatorReplay.expectedCoordinatorHash,
    "EXPECTED_COORDINATOR_HASH");
  hash(controlReplay.expectedSourceHash, "EXPECTED_CONTROL_SOURCE_HASH");
  hash(controlReplay.expectedLedgerHash, "EXPECTED_CONTROL_LEDGER_HASH");
  if (!isDeepStrictEqual(coordinatorReplay.source.controlLedgerReplay,
    controlReplay)) fail("COORDINATOR_CONTROL_SOURCE_SPLICE");
  const control = verifyFormationControlLedgerV1(controlReplay.record, {
    source: controlReplay.source,
    expectedSourceHash: controlReplay.expectedSourceHash,
    expectedLedgerHash: controlReplay.expectedLedgerHash,
  });
  if (control.ok !== true || control.exactSourceReplayVerified !== true
    || control.callerSourcePinMatched !== true
    || control.ledgerRecordRebuilt !== true
    || control.expectedLedgerHashMatched !== true
    || control.appendOnlyPredecessorAndHeadVerified !== true
    || control.occurrenceDenominatorReplayed !== true
    || control.nonceLifecycleReplayed !== true
    || control.staffTouchAccountingReplayed !== true
    || control.formationCommitmentAuthorized !== false
    || control.capacityReserved !== false || control.authority !== "NONE"
    || control.actionReady !== false || control.executable !== false) {
    fail("CONTROL_LEDGER_REPLAY_FAILED");
  }
  const coordinator = verifyOutcomeFormationTemporaryNetworkCoordinatorV1(
    coordinatorReplay.source, coordinatorReplay.expectedCoordinatorHash);
  if (coordinator.ok !== true
    || coordinator.coordinatorHash !== coordinatorReplay.expectedCoordinatorHash
    || coordinator.mandatoryNetworkCoverage
      .mandatoryRequirementToV2SlotToSelectedV1RowBijectionVerified !== true
    || coordinator.mandatoryNetworkCoverage.mandatoryRequirementCount !== 3
    || coordinator.mandatoryNetworkCoverage.transactionSlotCount !== 3
    || coordinator.mandatoryNetworkCoverage.resourceRequirementSlotCount !== 1
    || coordinator.mandatoryNetworkCoverage.evidenceRequirementSlotCount !== 1
    || coordinator.mandatoryNetworkCoverage.recoveryRequirementSlotCount !== 1
    || coordinator.control.exactRawControlLedgerSourceRebuiltAndPinned !== true
    || coordinator.atomicCommitmentGate.atomicCommitmentGateSatisfied !== false
    || coordinator.atomicCommitmentGate.userOutcomePromiseIssued !== false
    || coordinator.capacityReserved !== false
    || coordinator.authority !== "NONE" || coordinator.actionReady !== false
    || coordinator.executable !== false) fail("COORDINATOR_REPLAY_FAILED");
  if (control.tenderHash !== coordinator.tenderBinding.tenderHash
    || control.typedGraphHash !== coordinator.tenderBinding.typedGraphHash
    || control.episodeHash !== coordinator.tenderBinding.episodeHash
    || control.attemptHash !== coordinator.tenderBinding.attemptHash
    || control.controlState !== coordinator.control.controlState
    || control.disposition !== coordinator.disposition) {
    fail("COORDINATOR_CONTROL_BINDING_SPLICE");
  }
  return { coordinatorReplay, controlReplay, coordinator, control };
}

function terminalControlCode(replay) {
  const record = replay.controlReplay.record;
  if (record.zeroInternalOps.anyOutsiderStaffTouchRecorded === true) {
    return "CONTROL_STAFF_TOUCH_DISQUALIFIED";
  }
  if (record.appendOnlyControl.revoked === true) {
    return "CONTROL_REVOKED";
  }
  if (record.appendOnlyControl.cancelled === true) {
    return "CONTROL_CANCELLED";
  }
  if (record.formationDeadline.reached === true
    || replay.coordinator.deadlineReached === true) {
    return "FORMATION_DEADLINE_REACHED";
  }
  if (record.controlDecision.permanentlyDisqualifiedFromCommitment !== false
    || record.controlDecision.controlState
      !== OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.forming
    || replay.coordinator.control.permanentlyDisqualifiedFromCommitment !== false
    || replay.coordinator.disposition
      !== OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_STATES
        .forming) fail("NONTERMINAL_CONTROL_STATE_INVALID");
  return null;
}

function assertMandatorySourceDeclaredPathsCurrent(replay) {
  const coordinator = replay.coordinator;
  const slots = coordinator.mandatoryNetworkCoverage.slots;
  if (coordinator.formationAssessment.structuralMultiSlotCoverageComplete
      !== true
    || coordinator.formationAssessment
      .allMandatorySourceDeclaredPathsCurrent !== true
    || coordinator.atomicCommitmentGate
      .allMandatorySourceDeclaredPathsCurrent !== true
    || slots.length !== 3) {
    fail("MANDATORY_SOURCE_DECLARED_PATHS_NOT_CURRENT");
  }
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (slot.sourceDeclaredPathCurrent !== true
      || slot.sourceDeclaredResponseState !== "OFFERED") {
      fail("MANDATORY_SLOT_SOURCE_DECLARED_PATH_NOT_CURRENT");
    }
  }
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

function sameCanonical(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

const REQUEST_FIELDS = ObjectFreeze([
  "adapterContractReplay", "permissionedTransactionReplay", "invocation",
  "privateProjectionNonce",
]);
const ADAPTER_REPLAY_FIELDS = ObjectFreeze([
  "record", "source", "expectedSourceHash", "expectedContractHash",
]);
const TRANSACTION_REPLAY_FIELDS = ObjectFreeze([
  "source", "expectedReplayHash",
]);
const INVOCATION_FIELDS = ObjectFreeze([
  "invokedAt", "formationDeadline", "oneUseNonceHash", "idempotencyKeyHash",
]);

function replayRequest(request, capability, inputIndex) {
  exactObject(request, REQUEST_FIELDS, "SHADOW_APPEND_REQUEST");
  const adapter = exactObject(request.adapterContractReplay,
    ADAPTER_REPLAY_FIELDS, "ADAPTER_CONTRACT_REPLAY");
  const transactionReplay = exactObject(request.permissionedTransactionReplay,
    TRANSACTION_REPLAY_FIELDS, "PERMISSIONED_TRANSACTION_REPLAY");
  const invocation = exactObject(request.invocation, INVOCATION_FIELDS,
    "INVOCATION");
  hash(adapter.expectedSourceHash, "EXPECTED_ADAPTER_SOURCE_HASH");
  hash(adapter.expectedContractHash, "EXPECTED_ADAPTER_CONTRACT_HASH");
  hash(transactionReplay.expectedReplayHash, "EXPECTED_TRANSACTION_REPLAY_HASH");
  const transaction = verifyPermissionedTransactionInterfaceSourceReplayV1(
    transactionReplay.source, transactionReplay.expectedReplayHash);
  if (transaction.ok !== true
    || transaction.replayHash !== transactionReplay.expectedReplayHash
    || transaction.profile
      !== OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1
    || transaction.rawSourceReplayPerformed !== true
    || transaction.transportAppendOnlyOccurrenceChainReplayed !== true
    || transaction.transportOccurrenceDenominatorReplayed !== true
    || transaction.permissionAppendOnlyLifecycleReplayed !== true
    || transaction.sourceDeclaredPermissionCurrentAtObservedAt !== true
    || transaction.sourceDeclaredResponseCurrent !== true
    || transaction.sendAuthorized !== false || transaction.authority !== "NONE"
    || transaction.decisionState !== "HOLD"
    || transaction.liveIoPerformed !== false) {
    fail("PERMISSIONED_TRANSACTION_REPLAY_NOT_CURRENT_HOLD");
  }
  const checkedAdapter = verifyTransactionSurfaceAdapterContractV1(
    adapter.record, {
      source: adapter.source,
      expectedSourceHash: adapter.expectedSourceHash,
      expectedContractHash: adapter.expectedContractHash,
    });
  if (checkedAdapter.ok !== true || checkedAdapter.decisionState !== "HOLD"
    || checkedAdapter.actionAuthorized !== false
    || adapter.record.contractHash !== adapter.expectedContractHash
    || adapter.record.supportedTransportProfiles.length !== 1
    || !sameCanonical(adapter.record.supportedTransportProfiles[0],
      normalizedExpectedTransportProfile())
    || adapter.record.adapterClosure.adapterImplementationHash
      !== transactionReplay.source.adapterContext.adapterArtifactHash
    || adapter.record.adapterClosure.adapterPackageProfileHash
      !== transactionReplay.source.adapterContext.adapterRevisionHash
    || adapter.record.observedAt !== transactionReplay.source.observedAt
    || adapter.record.sideEffectCardinality
      .maximumAggregateSideEffectsPerTender !== 1) {
    fail("ADAPTER_CONTRACT_OR_PROFILE_SPLICE");
  }
  if (adapter.record.sideEffectCardinality
      .maximumTenderDeliverySideEffectsPerTender !== 1
    || checkedAdapter.permissionEstablished !== false
    || checkedAdapter.credentialLeaseEstablished !== false) {
    fail("ADAPTER_ONE_USE_OR_CREDENTIAL_BOUNDARY_INVALID");
  }
  let deliveryFound = false;
  let strictResponseFound = false;
  for (let index = 0; index < adapter.record.capabilityDeclarations.length;
    index += 1) {
    const declaration = adapter.record.capabilityDeclarations[index];
    const supported = declaration.capability === "PERMITTED_ROUTE_DISCOVERY"
      || declaration.capability === "ONE_USE_TENDER_DELIVERY"
      || declaration.capability === "STRICT_RESPONSE_OBSERVATION";
    const maximum = declaration.capability === "ONE_USE_TENDER_DELIVERY"
      ? 1 : 0;
    if (declaration.supported !== supported
      || declaration.maximumSideEffectsPerTender !== maximum
      || !sameCanonical(declaration.transportProfileRefHashes,
        supported
          ? [OUTSIDER_USER_HELD_MAILBOX_SHADOW_TRANSPORT_PROFILE_V1
            .transportProfileRefHash] : [])) {
      fail("ADAPTER_CAPABILITY_SET_NOT_EXACT");
    }
    if (declaration.capability === "ONE_USE_TENDER_DELIVERY") {
      deliveryFound = declaration.supported === true;
    } else if (declaration.capability === "STRICT_RESPONSE_OBSERVATION") {
      strictResponseFound = declaration.supported === true;
    }
  }
  if (!deliveryFound || !strictResponseFound) {
    fail("ADAPTER_CAPABILITY_PROFILE_SPLICE");
  }
  const invokedAt = instant(invocation.invokedAt, "INVOKED_AT");
  const deadline = instant(invocation.formationDeadline, "FORMATION_DEADLINE");
  if (invokedAt !== transactionReplay.source.observedAt
    || deadline !== transactionReplay.source.tender.formationDeadline) {
    fail("INVOCATION_TIME_OR_DEADLINE_SPLICE");
  }
  if (DateParse(invokedAt) >= DateParse(deadline)) {
    fail("FORMATION_DEADLINE_REACHED");
  }
  let envelope;
  try {
    envelope = JSONParse(BufferToString(
      transactionReplay.source.outboundMessageSourceBytes, "utf8"));
  } catch { fail("OUTBOUND_TENDER_JSON_INVALID"); }
  exactObject(envelope, ["payload", "signature"], "OUTBOUND_TENDER_ENVELOPE");
  const nonce = hash(envelope.payload.transportOccurrenceNonceHash,
    "OUTBOUND_ONE_USE_NONCE_HASH");
  const idempotency = hash(envelope.payload.idempotencyKeyHash,
    "OUTBOUND_IDEMPOTENCY_KEY_HASH");
  if (invocation.oneUseNonceHash !== nonce
    || invocation.idempotencyKeyHash !== idempotency) {
    fail("ONE_USE_CONTROL_SPLICE");
  }
  if (typeof request.privateProjectionNonce !== "string"
    || !RegExpTest(PRIVATE_NONCE, request.privateProjectionNonce)) {
    fail("REQUEST_PRIVATE_PROJECTION_NONCE_INVALID");
  }
  const source = transactionReplay.source;
  let exactTransportSourceByteCount
    = TypedArrayByteLength(source.routeObservationSourceBytes)
      + TypedArrayByteLength(source.outboundMessageSourceBytes)
      + TypedArrayByteLength(source.sendAcknowledgementSourceBytes)
      + TypedArrayByteLength(source.outboundRfc822Bytes)
      + TypedArrayByteLength(source.transportHeadSourceBytes);
  for (let index = 0; index < source.inboundMessageSourceBytes.length;
    index += 1) {
    exactTransportSourceByteCount += TypedArrayByteLength(
      source.inboundMessageSourceBytes[index]);
  }
  for (let index = 0; index < source.inboundRfc822Bytes.length; index += 1) {
    exactTransportSourceByteCount += TypedArrayByteLength(
      source.inboundRfc822Bytes[index]);
  }
  return { request, capability, inputIndex, transaction, nonce, idempotency,
    adapterSourceHash: adapter.expectedSourceHash,
    adapterContractHash: adapter.expectedContractHash,
    adapterPrivateInstanceRefHash: hash(
      adapter.source.privateAdapterInstanceRefHash,
      "ADAPTER_PRIVATE_INSTANCE_REF_HASH"),
    permissionIdHash: hash(envelope.payload.permissionIdHash,
      "OUTBOUND_PERMISSION_ID_HASH"),
    permissionGenesisSourceHash: hash(
      envelope.payload.permissionGenesisSourceHash,
      "OUTBOUND_PERMISSION_GENESIS_SOURCE_HASH"),
    transactionReplayHash: transactionReplay.expectedReplayHash,
    privateProjectionNonce: request.privateProjectionNonce,
    rfc822SourceCount: 1 + source.inboundRfc822Bytes.length,
    exactTransportSourceByteCount,
    shadowReceiptHash: null };
}

function bindRequests(input, replay) {
  const admissions = [];
  for (let index = 0; index < input.shadowAppendRequests.length; index += 1) {
    append(admissions, replayRequest(input.shadowAppendRequests[index],
      input.capabilities[index], index));
  }
  const coordinatorSlots = replay.coordinator.mandatoryNetworkCoverage.slots;
  const rawSlots = replay.coordinatorReplay.source.slotReplays;
  const usedKinds = new SetConstructor();
  const usedRawSlots = new SetConstructor();
  const usedNonces = new SetConstructor();
  const usedIdempotency = new SetConstructor();
  const usedAdapterSourcePins = new SetConstructor();
  const usedAdapterInstanceRefs = new SetConstructor();
  const usedPermissionIds = new SetConstructor();
  const usedPermissionGenesisPins = new SetConstructor();
  for (let index = 0; index < admissions.length; index += 1) {
    const admission = admissions[index];
    const transaction = admission.transaction;
    if (!ObjectHasOwn(KIND_RANK, transaction.requirementKind)
      || SetHas(usedKinds, transaction.requirementKind)) {
      fail("MANDATORY_REQUEST_KIND_BIJECTION_INVALID");
    }
    SetAdd(usedKinds, transaction.requirementKind);
    if (SetHas(usedNonces, admission.nonce)
      || SetHas(usedIdempotency, admission.idempotency)) {
      fail("RUN_LOCAL_ONE_USE_CONTROL_COLLISION");
    }
    SetAdd(usedNonces, admission.nonce);
    SetAdd(usedIdempotency, admission.idempotency);
    if (SetHas(usedAdapterSourcePins, admission.adapterSourceHash)
      || SetHas(usedAdapterInstanceRefs,
        admission.adapterPrivateInstanceRefHash)) {
      fail("ADAPTER_INSTANCE_OR_SOURCE_REUSED_ACROSS_MANDATORY_SLOTS");
    }
    SetAdd(usedAdapterSourcePins, admission.adapterSourceHash);
    SetAdd(usedAdapterInstanceRefs, admission.adapterPrivateInstanceRefHash);
    if (SetHas(usedPermissionIds, admission.permissionIdHash)
      || SetHas(usedPermissionGenesisPins,
        admission.permissionGenesisSourceHash)) {
      fail("ONE_USE_PERMISSION_GRANT_REUSED_ACROSS_MANDATORY_SLOTS");
    }
    SetAdd(usedPermissionIds, admission.permissionIdHash);
    SetAdd(usedPermissionGenesisPins, admission.permissionGenesisSourceHash);
    let slot = null;
    let slotCount = 0;
    for (let slotIndex = 0; slotIndex < coordinatorSlots.length;
      slotIndex += 1) {
      const candidate = coordinatorSlots[slotIndex];
      if (candidate.requirementKind === transaction.requirementKind
        && candidate.requirementId === transaction.requirementId) {
        slot = candidate;
        slotCount += 1;
      }
    }
    if (slotCount !== 1
      || slot.requirementObjectHash !== transaction.requirementObjectHash
      || slot.routeKind !== transaction.routeKind
      || slot.routeObjectHash !== transaction.routeObjectHash
      || slot.currentCandidateHash !== transaction.currentCandidateHash
      || slot.sourceDeclaredPathCurrent !== true
      || slot.sourceDeclaredResponseState
        !== transaction.sourceDeclaredOneUseResponseState
      || transaction.sourceDeclaredResponseCurrent !== true
      || transaction.sourceDeclaredPermissionCurrentAtObservedAt !== true
      || slot.permissionLifecycleOccurrenceCount
        !== transaction.permissionLifecycleEventCount
      || slot.transportOccurrenceCount !== transaction.transportOccurrenceCount
      || slot.inboundOccurrenceCount !== transaction.inboundOccurrenceCount
      || slot.oneUseResponseOccurrenceCount
        !== admission.request.permissionedTransactionReplay.source
          .oneUseResponseReplay.expectedOccurrenceCount) {
      fail("REQUEST_COORDINATOR_SLOT_BINDING_SPLICE");
    }
    let rawSlotIndex = -1;
    let rawSlotCount = 0;
    for (let slotIndex = 0; slotIndex < rawSlots.length; slotIndex += 1) {
      const transactionWrapper = rawSlots[slotIndex].source
        .transactionInterfaceReplay;
      if (transactionWrapper.expectedReplayHash
        === admission.transactionReplayHash) {
        rawSlotIndex = slotIndex;
        rawSlotCount += 1;
      }
    }
    if (rawSlotCount !== 1 || SetHas(usedRawSlots, rawSlotIndex)) {
      fail("REQUEST_RAW_COORDINATOR_SLOT_BIJECTION_INVALID");
    }
    const rawTransaction = rawSlots[rawSlotIndex].source
      .transactionInterfaceReplay;
    if (rawTransaction.profile
        !== OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1
      || !isDeepStrictEqual(rawTransaction.source,
        admission.request.permissionedTransactionReplay.source)) {
      fail("REQUEST_RAW_TRANSACTION_SOURCE_SPLICE");
    }
    const rawOwner = rawSlots[rawSlotIndex].source
      .resourceOwnerStandingReplay;
    const owner = verifyResourceOwnerStandingTrustReplayV1(
      rawOwner.source, rawOwner.expectedReplayHash);
    if (owner.ok !== true
      || owner.replayHash !== rawOwner.expectedReplayHash
      || owner.observedAt !== replay.coordinator.observedAt
      || owner.tenderHash !== transaction.tenderHash
      || owner.typedGraphHash !== transaction.typedGraphHash
      || owner.episodeHash !== transaction.episodeHash
      || owner.attemptHash !== transaction.attemptHash
      || owner.sourceDeclaredOwnerStandingCurrent !== true
      || owner.currentLifecycleHeadReplayedSeparatelyFromPreActionRegistration
        !== true
      || owner.externalStandingCurrentAtObservedAt !== true
      || owner.rightsReviewCurrentAtObservedAt !== true
      || owner.privacyReviewCurrentAtObservedAt !== true
      || owner.resourceOwnerStandingEstablished !== false
      || owner.externalCapacityEstablished !== false
      || owner.capacityReserved !== false
      || owner.authorityEstablished !== false
      || owner.decisionState !== "HOLD" || owner.authority !== "NONE"
      || owner.actionReady !== false || owner.executable !== false) {
      fail("REQUEST_OWNER_SOURCE_DECLARED_STANDING_NOT_CURRENT");
    }
    SetAdd(usedRawSlots, rawSlotIndex);
    const graph = replay.coordinator.tenderBinding;
    if (transaction.tenderHash !== graph.tenderHash
      || transaction.workOrderHash !== graph.workOrderHash
      || transaction.typedGraphHash !== graph.typedGraphHash
      || transaction.principalEpochProjectionHash
        !== graph.principalEpochProjectionHash
      || transaction.accountableDeploymentSubjectHash
        !== graph.accountableDeploymentSubjectHash
      || transaction.runtimeInstanceHash !== graph.runtimeInstanceHash
      || transaction.embodimentRevisionHash !== graph.embodimentRevisionHash
      || transaction.delegationEdgeHash !== graph.delegationEdgeHash
      || transaction.episodeHash !== graph.episodeHash
      || transaction.attemptHash !== graph.attemptHash) {
      fail("REQUEST_TYPED_GRAPH_SPLICE");
    }
    admission.coordinatorSlot = slot;
    admission.rawCoordinatorSlotIndex = rawSlotIndex;
  }
  if (usedKinds.size !== 3 || usedRawSlots.size !== 3) {
    fail("MANDATORY_REQUEST_BIJECTION_INCOMPLETE");
  }
  ArraySort(admissions, (left, right) =>
    KIND_RANK[left.transaction.requirementKind]
      - KIND_RANK[right.transaction.requirementKind]);
  return admissions;
}

function bindRequestControls(admissions, controlSource) {
  for (let index = 0; index < admissions.length; index += 1) {
    const admission = admissions[index];
    let reservation = null;
    let reservationCount = 0;
    let consumptionCount = 0;
    let idempotency = null;
    let idempotencyCount = 0;
    for (let eventIndex = 0; eventIndex < controlSource.events.length;
      eventIndex += 1) {
      const event = controlSource.events[eventIndex];
      if (event.eventType === "NONCE_RESERVED"
        && event.payload.nonceHash === admission.nonce) {
        reservation = event;
        reservationCount += 1;
      } else if (event.eventType === "NONCE_CONSUMED"
        && event.payload.nonceHash === admission.nonce) {
        consumptionCount += 1;
      } else if (event.eventType === "IDEMPOTENCY_OBSERVED"
        && event.payload.idempotencyKeyHash === admission.idempotency) {
        idempotency = event;
        idempotencyCount += 1;
      }
    }
    if (reservationCount !== 1 || consumptionCount !== 0
      || idempotencyCount !== 1
      || reservation.payload.purposeCode !== "RESOURCE_TENDER"
      || DateParse(reservation.recordedAt) > DateParse(admission.request
        .invocation.invokedAt)
      || DateParse(reservation.payload.reservationExpiresAt)
        <= DateParse(admission.request.invocation.invokedAt)
      || DateParse(idempotency.recordedAt) > DateParse(admission.request
        .invocation.invokedAt)
      || idempotency.payload.objectHash !== admission.transactionReplayHash) {
      fail("REQUEST_ONE_USE_CONTROL_LEDGER_BINDING_INVALID");
    }
    admission.controlReservationOccurrenceHash = reservation.occurrenceHash;
    admission.controlIdempotencyOccurrenceHash = idempotency.occurrenceHash;
  }
}

function assertCapabilityUnused(capability) {
  let empty = false;
  try { readUserHeldMailboxShadowSpoolV1(capability); }
  catch (error) {
    empty = exactNativeErrorMessage(error)
      === `${SHADOW_PREFIX}SHADOW_SPOOL_EMPTY`;
  }
  if (!empty) fail("MODULE_ISSUED_UNUSED_SHADOW_CAPABILITY_REQUIRED");
}

function exactAsciiErrorCode(value, prefix) {
  if (typeof value !== "string" || value.length <= prefix.length
    || value.length > 256) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (StringCharCodeAt(value, index) !== StringCharCodeAt(prefix, index)) {
      return false;
    }
  }
  for (let index = prefix.length; index < value.length; index += 1) {
    const code = StringCharCodeAt(value, index);
    if (!((code >= 65 && code <= 90) || (code >= 48 && code <= 57)
      || code === 95)) return false;
  }
  return true;
}

function exactNativeErrorMessage(error) {
  try {
    if (error === null || typeof error !== "object" || isProxy(error)) {
      return null;
    }
    const prototype = ObjectGetPrototypeOf(error);
    if (prototype !== ErrorPrototype && prototype !== TypeErrorPrototype) {
      return null;
    }
    const descriptor = ObjectGetOwnPropertyDescriptor(error, "message");
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || typeof descriptor.value !== "string") {
      return null;
    }
    return descriptor.value;
  } catch { return null; }
}

function safeErrorCode(error) {
  try {
    const message = exactNativeErrorMessage(error);
    if (exactAsciiErrorCode(message, PREFIX)
      || exactAsciiErrorCode(message, SHADOW_PREFIX)) return message;
  } catch { /* fixed fallback */ }
  return `${PREFIX}UNTRUSTED_FAILURE`;
}

function publicSlotRows(replay, admissions = null) {
  const rows = [];
  const slots = replay.coordinator.mandatoryNetworkCoverage.slots;
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    let admission = null;
    if (admissions !== null) {
      for (let admissionIndex = 0; admissionIndex < admissions.length;
        admissionIndex += 1) {
        if (admissions[admissionIndex].transaction.requirementKind
            === slot.requirementKind
          && admissions[admissionIndex].transaction.requirementId
            === slot.requirementId) admission = admissions[admissionIndex];
      }
    }
    append(rows, {
      requirementKind: slot.requirementKind,
      requirementId: slot.requirementId,
      requirementObjectHash: slot.requirementObjectHash,
      requestReplayAndBijectionVerified: admission !== null,
      appendState: admission?.appendState ?? "NOT_ATTEMPTED",
      shadowSpoolAppendOccurrenceCount:
        admission?.appendEffectOccurred === true ? 1 : 0,
      transportOccurrenceCount:
        admission?.appendEffectOccurred === true
          ? admission.transaction.transportOccurrenceCount : 0,
      transportDistinctObjectCount:
        admission?.appendEffectOccurred === true
          ? admission.transaction.transportDistinctObjectCount : 0,
      inboundOccurrenceCount:
        admission?.appendEffectOccurred === true
          ? admission.transaction.inboundOccurrenceCount : 0,
      permissionLifecycleOccurrenceCount:
        admission?.appendEffectOccurred === true
          ? admission.transaction.permissionLifecycleEventCount : 0,
      permissionLifecycleDistinctObjectCount:
        admission?.appendEffectOccurred === true
          ? admission.transaction.permissionLifecycleDistinctObjectCount : 0,
      oneUseResponseOccurrenceCount:
        admission?.appendEffectOccurred === true
          ? slot.oneUseResponseOccurrenceCount : 0,
      ownerLifecycleOccurrenceCount:
        admission?.appendEffectOccurred === true
          ? slot.ownerLifecycleOccurrenceCount : 0,
      rfc822SourceCount: admission?.appendEffectOccurred === true
        ? admission.rfc822SourceCount : 0,
      exactTransportSourceByteCount:
        admission?.appendEffectOccurred === true
          ? admission.exactTransportSourceByteCount : 0,
    });
  }
  ArraySort(rows, (left, right) =>
    KIND_RANK[left.requirementKind] - KIND_RANK[right.requirementKind]);
  return rows;
}

function privateRunPins(input, replay, admissions, errorCode) {
  const requestPins = [];
  if (admissions !== null) {
    for (let index = 0; index < admissions.length; index += 1) {
      const admission = admissions[index];
      append(requestPins, {
        requirementKind: admission.transaction.requirementKind,
        adapterSourceHash: admission.adapterSourceHash,
        adapterContractHash: admission.adapterContractHash,
        transactionReplayHash: admission.transactionReplayHash,
        privateProjectionNonce: admission.privateProjectionNonce,
        oneUseNonceHash: admission.nonce,
        idempotencyKeyHash: admission.idempotency,
        controlReservationOccurrenceHash:
          admission.controlReservationOccurrenceHash,
        controlIdempotencyOccurrenceHash:
          admission.controlIdempotencyOccurrenceHash,
        shadowReceiptHash: admission.shadowReceiptHash,
        appendState: admission.appendState ?? "NOT_ATTEMPTED",
        appendEffectOccurred: admission.appendEffectOccurred === true,
      });
    }
  }
  return {
    privateProjectionNonce: input.privateProjectionNonce,
    coordinatorHash: replay.coordinatorReplay.expectedCoordinatorHash,
    controlSourceHash: replay.controlReplay.expectedSourceHash,
    controlLedgerHash: replay.controlReplay.expectedLedgerHash,
    requestPins,
    errorCode,
  };
}

function resultRecord(input, replay, admissions, state) {
  const slots = publicSlotRows(replay, admissions);
  let appendOccurrences = 0;
  let transportOccurrences = 0;
  let transportDistinctObjects = 0;
  let inboundOccurrences = 0;
  let permissionOccurrences = 0;
  let permissionDistinctObjects = 0;
  let responseOccurrences = 0;
  let ownerOccurrences = 0;
  let rfc822Sources = 0;
  let exactTransportSourceBytes = 0;
  for (let index = 0; index < slots.length; index += 1) {
    appendOccurrences += slots[index].shadowSpoolAppendOccurrenceCount;
    transportOccurrences += slots[index].transportOccurrenceCount;
    transportDistinctObjects += slots[index].transportDistinctObjectCount;
    inboundOccurrences += slots[index].inboundOccurrenceCount;
    permissionOccurrences += slots[index].permissionLifecycleOccurrenceCount;
    permissionDistinctObjects
      += slots[index].permissionLifecycleDistinctObjectCount;
    responseOccurrences += slots[index].oneUseResponseOccurrenceCount;
    ownerOccurrences += slots[index].ownerLifecycleOccurrenceCount;
    rfc822Sources += slots[index].rfc822SourceCount;
    exactTransportSourceBytes += slots[index].exactTransportSourceByteCount;
  }
  const partial = appendOccurrences > 0 && appendOccurrences < 3;
  const allAppended = appendOccurrences === 3;
  const capabilityBearerStateProbed = admissions !== null;
  const remainingCapabilityBearers = capabilityBearerStateProbed
    ? 3 - appendOccurrences : null;
  const saltedPrivateRunCommitmentHash = digest(
    "outsider/outcome-formation-shadow-runner-private-run/v1",
    privateRunPins(input, replay, admissions, state.errorCode));
  const staffRecorded = replay.controlReplay.record.zeroInternalOps
    .anyOutsiderStaffTouchRecorded === true;
  return deepFreeze({
    schema: OUTSIDER_OUTCOME_FORMATION_SHADOW_RUNNER_V1_SCHEMAS.result,
    schemaVersion: "1.0.0",
    mode: "SHADOW_ONLY",
    allowedUse: "TEST_OR_RESEARCH",
    ok: allAppended && state.errorCode === null,
    shadowRunCompleted: allAppended && state.errorCode === null,
    resultState: allAppended && state.errorCode === null
      ? "THREE_MODULE_PRIVATE_SHADOW_SPOOLS_APPENDED_HOLD"
      : appendOccurrences === 0
        ? "NO_SHADOW_SPOOL_APPEND_HOLD"
        : "PARTIAL_SHADOW_SPOOL_APPEND_HISTORY_HOLD",
    error: state.errorCode,
    tenderBinding: {
      tenderHash: replay.coordinator.tenderBinding.tenderHash,
      workOrderHash: replay.coordinator.tenderBinding.workOrderHash,
      typedGraphHash: replay.coordinator.tenderBinding.typedGraphHash,
      principalEpochProjectionHash:
        replay.coordinator.tenderBinding.principalEpochProjectionHash,
      accountableDeploymentSubjectHash:
        replay.coordinator.tenderBinding.accountableDeploymentSubjectHash,
      runtimeInstanceHash: replay.coordinator.tenderBinding.runtimeInstanceHash,
      embodimentRevisionHash:
        replay.coordinator.tenderBinding.embodimentRevisionHash,
      delegationEdgeHash:
        replay.coordinator.tenderBinding.delegationEdgeHash,
      episodeHash: replay.coordinator.tenderBinding.episodeHash,
      attemptHash: replay.coordinator.tenderBinding.attemptHash,
    },
    controlGate: {
      exactRawControlLedgerSourceReplayedAndPinned: true,
      exactCoordinatorSourceReplayedAndPinned: true,
      requestNonceReservationAndIdempotencyBindingsVerified:
        admissions !== null,
      terminalOrDeadlinePreventedAllAppendAttempts:
        state.controlGatePrevented === true,
      callerPinnedControlLedgerRecordedStaffTouch: staffRecorded,
      callerPinnedControlLedgerCancelled:
        replay.controlReplay.record.appendOnlyControl.cancelled,
      callerPinnedControlLedgerRevoked:
        replay.controlReplay.record.appendOnlyControl.revoked,
      deadlineReached: replay.coordinator.deadlineReached,
      staffTouchDenominatorComplete: false,
      zeroInternalOpsEstablished: false,
      outsiderStaffTouchCount: null,
    },
    mandatoryShadowSlots: slots,
    occurrenceCensus: {
      mandatorySlotCount: 3,
      appendInvocationCount: state.appendInvocationCount,
      succeededAppendInvocationCount: appendOccurrences,
      failedAppendInvocationCount: state.rejectedAppendInvocationCount,
      rejectedAppendInvocationCount: state.rejectedAppendInvocationCount,
      unattemptedAppendCount: 3 - state.appendInvocationCount,
      shadowSpoolAppendOccurrenceCount: appendOccurrences,
      shadowSpoolDistinctObjectCount: appendOccurrences,
      appendedPermissionLifecycleOccurrenceCount: permissionOccurrences,
      appendedPermissionLifecycleDistinctObjectCount:
        permissionDistinctObjects,
      appendedOneUseResponseOccurrenceCount: responseOccurrences,
      appendedTransportOccurrenceCount: transportOccurrences,
      appendedTransportDistinctObjectCount: transportDistinctObjects,
      appendedInboundOccurrenceCount: inboundOccurrences,
      appendedOwnerLifecycleOccurrenceCount: ownerOccurrences,
      appendedRfc822SourceCount: rfc822Sources,
      appendedExactTransportSourceByteCount: exactTransportSourceBytes,
      allRunObservedShadowAppendOccurrencesPreserved: true,
      occurrenceCensusSeparatedFromObjectDedup: true,
      externalNonOmissionEstablished: false,
    },
    requestBijectionVerified: admissions !== null,
    exactResourceEvidenceRecoveryBijectionVerified: admissions !== null,
    allMandatorySourceDeclaredPathsCurrentAtCoordinatorObservedAtVerified:
      admissions !== null,
    eachSlotSourceDeclaredResponseCurrentAtCoordinatorObservedAtVerified:
      admissions !== null,
    eachSlotSourceDeclaredOwnerStandingCurrentAtCoordinatorObservedAtVerified:
      admissions !== null,
    sourceDeclaredCurrentMintsAuthorityOrCapacity: false,
    threeDistinctAdapterInstanceAndSourcePinsVerified: admissions !== null,
    oneUsePermissionIdsAndGenesisPinsDistinct: admissions !== null,
    oneUsePermissionGrantReuseAcrossSlotsPermitted: false,
    credentialsAcceptedOrHandled: false,
    credentialLeaseEstablished: false,
    allMandatoryShadowAppendsObserved: allAppended,
    partialShadowAppendOccurred: partial,
    partialShadowAppendHistoryPreserved: true,
    partialShadowAppendCanMintCommitment: false,
    rollbackOfPriorShadowOccurrencePerformed: false,
    crossSpoolAtomicAppendEstablished: false,
    atomicCommitmentGateSatisfied: false,
    userOutcomePromiseIssued: false,
    saltedPrivateRunCommitmentHash,
    individualPrivateSourceReplayHashesProjected: false,
    perSlotRouteCandidateTransactionOrReceiptHashesProjected: false,
    capabilityHandlesPubliclyProjected: false,
    enabledCapabilityTypes: ENABLED_CAPABILITY_TYPES,
    provenAuthorityCapabilityTypes: ENABLED_CAPABILITY_TYPES,
    capabilityBearerAccountingScope:
      "MODULE_INSTANCE_LOCAL_AFTER_THIS_RUN_ONLY",
    capabilityBearerStateProbed,
    validatedCapabilityBearerCountBeforeEffects:
      capabilityBearerStateProbed ? 3 : null,
    historicalConsumedCapabilityBearerCount: appendOccurrences,
    enabledCapabilityBearerCountAfterRun: remainingCapabilityBearers,
    provenAuthorityCapabilityBearerCountAfterRun:
      remainingCapabilityBearers,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    enabledCapabilityBearerSetEqualsProvenAuthorityBearerSetWhenProbed:
      capabilityBearerStateProbed,
    consequenceReach:
      "AT_MOST_THREE_MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOLS_ONLY",
    performedConsequenceReach: appendOccurrences === 0 ? "NONE"
      : appendOccurrences === 3
        ? "THREE_MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOLS_ONLY"
        : "PARTIAL_MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOLS_ONLY",
    remainingEnabledConsequenceReach: remainingCapabilityBearers === null
      ? "CAPABILITY_STATE_NOT_PROBED"
      : remainingCapabilityBearers === 0 ? "NONE"
        : remainingCapabilityBearers === 3
          ? "UP_TO_THREE_MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOLS_ONLY"
          : "REMAINING_MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOLS_ONLY",
    consequenceReachIncludesHistoricalEffectsAndRemainingEnabledBearers: true,
    processWideNonceFreshnessEstablished: false,
    processWideIdempotencyEstablished: false,
    durableOrExternalNonceFreshnessEstablished: false,
    durableOrExternalIdempotencyEstablished: false,
    outsiderStaffTouchCount: null,
    staffTouchDenominatorComplete: false,
    zeroInternalOpsEstablished: false,
    internalHumanFallbackPermitted: false,
    humanQueueCreated: false,
    liveIoPerformed: false,
    networkIoPerformed: false,
    filesystemIoPerformed: false,
    providerContactPerformed: false,
    realTenderDelivered: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    independentWitnessCapacityReserved: false,
    recoveryCapacityReserved: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    moneyMovementEnabled: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_OUTCOME_FORMATION_SHADOW_RUNNER_V1_BOUNDARY,
  });
}

function genericFailure(error) {
  return deepFreeze({
    schema: OUTSIDER_OUTCOME_FORMATION_SHADOW_RUNNER_V1_SCHEMAS.result,
    schemaVersion: "1.0.0",
    mode: "SHADOW_ONLY",
    allowedUse: "TEST_OR_RESEARCH",
    ok: false,
    shadowRunCompleted: false,
    resultState: "INPUT_OR_SOURCE_REPLAY_REJECTED_NO_APPEND_HOLD",
    error: safeErrorCode(error),
    saltedPrivateRunCommitmentHash: null,
    shadowSpoolAppendOccurrenceCount: 0,
    partialShadowAppendOccurred: false,
    crossSpoolAtomicAppendEstablished: false,
    atomicCommitmentGateSatisfied: false,
    userOutcomePromiseIssued: false,
    allMandatorySourceDeclaredPathsCurrentAtCoordinatorObservedAtVerified:
      false,
    eachSlotSourceDeclaredResponseCurrentAtCoordinatorObservedAtVerified:
      false,
    eachSlotSourceDeclaredOwnerStandingCurrentAtCoordinatorObservedAtVerified:
      false,
    sourceDeclaredCurrentMintsAuthorityOrCapacity: false,
    threeDistinctAdapterInstanceAndSourcePinsVerified: false,
    oneUsePermissionIdsAndGenesisPinsDistinct: false,
    oneUsePermissionGrantReuseAcrossSlotsPermitted: false,
    credentialsAcceptedOrHandled: false,
    credentialLeaseEstablished: false,
    enabledCapabilityTypes: ENABLED_CAPABILITY_TYPES,
    provenAuthorityCapabilityTypes: ENABLED_CAPABILITY_TYPES,
    capabilityBearerAccountingScope:
      "MODULE_INSTANCE_LOCAL_AFTER_THIS_RUN_ONLY",
    capabilityBearerStateProbed: false,
    validatedCapabilityBearerCountBeforeEffects: null,
    historicalConsumedCapabilityBearerCount: 0,
    enabledCapabilityBearerCountAfterRun: null,
    provenAuthorityCapabilityBearerCountAfterRun: null,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    enabledCapabilityBearerSetEqualsProvenAuthorityBearerSetWhenProbed: false,
    consequenceReach:
      "AT_MOST_THREE_MODULE_PRIVATE_IN_MEMORY_SHADOW_SPOOLS_ONLY",
    performedConsequenceReach: "NONE",
    remainingEnabledConsequenceReach: "CAPABILITY_STATE_NOT_PROBED",
    consequenceReachIncludesHistoricalEffectsAndRemainingEnabledBearers: true,
    outsiderStaffTouchCount: null,
    staffTouchDenominatorComplete: false,
    zeroInternalOpsEstablished: false,
    internalHumanFallbackPermitted: false,
    liveIoPerformed: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_OUTCOME_FORMATION_SHADOW_RUNNER_V1_BOUNDARY,
  });
}

/**
 * Run one three-slot, simulation-only shadow composition.  Every cloneable
 * input is snapshotted before replay.  Terminal control returns before any
 * append invocation.  Append-phase rejection returns an explicit partial
 * occurrence census; it never erases an append that already happened.
 */
export function runOutcomeFormationShadowV1(untrustedInput = {}) {
  try { assertDependencyRealmStable(); }
  catch (error) { return genericFailure(error); }
  let input;
  try { input = preflightInput(untrustedInput); }
  catch (error) { return genericFailure(error); }
  try {
    assertDependencyRealmStable();
    const replay = replayControlAndCoordinator(input);
    const terminalCode = terminalControlCode(replay);
    if (terminalCode !== null) {
      return resultRecord(input, replay, null, {
        errorCode: `${PREFIX}${terminalCode}`,
        controlGatePrevented: true,
        appendInvocationCount: 0,
        rejectedAppendInvocationCount: 0,
      });
    }
    assertMandatorySourceDeclaredPathsCurrent(replay);
    const admissions = bindRequests(input, replay);
    bindRequestControls(admissions, replay.controlReplay.source);
    for (let index = 0; index < admissions.length; index += 1) {
      assertCapabilityUnused(admissions[index].capability);
      admissions[index].appendState = "NOT_ATTEMPTED";
      admissions[index].appendEffectOccurred = false;
    }
    let appendInvocationCount = 0;
    let rejectedAppendInvocationCount = 0;
    let appendError = null;
    for (let index = 0; index < admissions.length; index += 1) {
      const admission = admissions[index];
      appendInvocationCount += 1;
      try {
        const receipt = appendUserHeldMailboxShadowSpoolV1(
          admission.capability, admission.request);
        admission.appendEffectOccurred = true;
        admission.appendState = "APPENDED";
        admission.shadowReceiptHash = receipt.receiptHash;
        if (receipt.requirementKind !== admission.transaction.requirementKind
          || receipt.requirementId !== admission.transaction.requirementId
          || receipt.requirementObjectHash
            !== admission.transaction.requirementObjectHash
          || receipt.shadowSpoolAppendOccurrenceCount !== 1
          || receipt.transportOccurrenceCount
            !== admission.transaction.transportOccurrenceCount
          || receipt.transportDistinctObjectCount
            !== admission.transaction.transportDistinctObjectCount
          || receipt.rfc822SourceCount !== admission.rfc822SourceCount
          || receipt.exactTransportSourceByteCount
            !== admission.exactTransportSourceByteCount
          || receipt.realMailboxAuthorityEstablished !== false
          || receipt.realTenderDelivered !== false
          || receipt.externalCapacityEstablished !== false
          || receipt.capacityReserved !== false
          || receipt.priceEstablished !== false
          || receipt.guaranteeEstablished !== false
          || receipt.settlementPermitted !== false
          || receipt.outsiderStaffTouchCount !== null
          || receipt.staffTouchDenominatorComplete !== false
          || receipt.zeroInternalOpsEstablished !== false
          || !sameCanonical(receipt.enabledCapabilities,
            ENABLED_CAPABILITY_TYPES)
          || !sameCanonical(receipt.provenAuthorityCapabilities,
            ENABLED_CAPABILITY_TYPES)
          || receipt.enabledCapabilitiesSubsetOfProvenAuthority !== true
          || receipt.decisionState !== "HOLD" || receipt.actionReady !== false
          || receipt.executable !== false) fail("SHADOW_RECEIPT_BOUNDARY_INVALID");
      } catch (error) {
        admission.appendState = admission.appendEffectOccurred
          ? "APPENDED_RECEIPT_REJECTED" : "APPEND_REJECTED";
        rejectedAppendInvocationCount += 1;
        appendError = safeErrorCode(error);
        break;
      }
    }
    return resultRecord(input, replay, admissions, {
      errorCode: appendError,
      controlGatePrevented: false,
      appendInvocationCount,
      rejectedAppendInvocationCount,
    });
  } catch (error) {
    return genericFailure(error);
  }
}

export const executeOutcomeFormationShadowRunnerV1
  = runOutcomeFormationShadowV1;
