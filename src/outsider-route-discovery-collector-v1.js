/*
 * Outcome Formation Engine: source-replayed route-discovery collector v1.
 *
 * The async planning helper accepts an injected-capability position but never
 * inspects or invokes it in v1: no replayed permission/admission driver yet
 * proves authority to execute arbitrary code.  It snapshots the exact plan and
 * emits one deterministic NOT_INVOKED occurrence for every requested attempt.
 * The module contains no fetch, filesystem, browser, mailbox, URL, credential,
 * ambient-secret, or callback execution path.
 *
 * The replay builder deterministically converts accepted source-declared route
 * observations into the existing OutcomeResourceRouteCandidate/Discovery-
 * Snapshot source shape, retained only inside private replay.  Public output
 * contains counts, tender-scoped requirement status, and one nonce-salted
 * aggregate commitment.  Neither a structurally conforming adapter nor a
 * caller-retained collector transcript establishes permission, a credential lease,
 * rights/privacy clearance, external trust, contactability, owner authority,
 * capacity, zero internal operations, action, price, guarantee, or settlement.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_LIMITS,
  OUTSIDER_OUTCOME_RESOURCE_ROUTE_KINDS,
  createOutcomeResourceRouteDiscoverySnapshotV1,
  verifyOutcomeResourceRouteDiscoverySnapshotV1,
} from "./outsider-outcome-resource-route-discovery-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";
import {
  verifyTransactionSurfaceAdapterContractV1,
} from "./outsider-transaction-surface-adapter-contract-v1.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const BufferByteLength = Buffer.byteLength;
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const JSONParse = JSON.parse;
const MapConstructor = Map;
const MapGet = Function.prototype.call.bind(Map.prototype.get);
const MapHas = Function.prototype.call.bind(Map.prototype.has);
const MapSet = Function.prototype.call.bind(Map.prototype.set);
const MapSize = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(Map.prototype, "size").get);
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
const StringConstructor = String;
const StringStartsWith = Function.prototype.call.bind(String.prototype.startsWith);
const TypeErrorConstructor = TypeError;

const PREFIX = "OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const OCCURRENCE_ID = /^collectorocc_[a-f0-9]{32}$/u;
const ROUTE_OCCURRENCE_ID = /^routeocc_[a-f0-9]{32}$/u;
const REQUIREMENT_ID = /^(?:resource|evidence|recovery)_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

const MAX_ATTEMPT_OCCURRENCES = 512;
const MAX_OBSERVATIONS_PER_ATTEMPT = 64;
/* Stay below the downstream snapshot's nominal 512-candidate ceiling because
 * its full candidate form must also fit the strict 65,536-member canonical
 * serialization budget.  This local cap is intentionally tighter. */
const MAX_TOTAL_OBSERVATION_OCCURRENCES = 256;
const MAX_REPORTED_SIDE_EFFECTS = 1_000_000;
const MAX_ARRAY_LENGTH = 4_096;
const MAX_TREE_DEPTH = 96;
const MAX_TREE_NODES = 120_000;
const MAX_TREE_KEYS = 360_000;
const MAX_SINGLE_STRING_BYTES = 64 * 1_024;
const MAX_AGGREGATE_STRING_BYTES = 8 * 1_024 * 1_024;

export const OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_SCHEMAS = ObjectFreeze({
  attemptObject: "outsider/route-discovery-collector-attempt-object/v1",
  attemptOccurrence:
    "outsider/route-discovery-collector-attempt-occurrence/v1",
  collector: "outsider/route-discovery-collector-replay/v1",
  discoveryProjection:
    "outsider/route-discovery-collector-privacy-closed-summary/v1",
  sourcePin: "outsider/route-discovery-collector-private-source-pin/v1",
  verification: "outsider/route-discovery-collector-verification/v1",
});

export const OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_LIMITS = ObjectFreeze({
  maximumAttemptOccurrences: MAX_ATTEMPT_OCCURRENCES,
  maximumObservationsPerAttempt: MAX_OBSERVATIONS_PER_ATTEMPT,
  maximumTotalObservationOccurrences: MAX_TOTAL_OBSERVATION_OCCURRENCES,
  downstreamNominalMaximumCandidateOccurrences:
    OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_LIMITS
      .maximumCandidateOccurrences,
  maximumReportedSideEffects: MAX_REPORTED_SIDE_EFFECTS,
  maximumArrayLength: MAX_ARRAY_LENGTH,
  maximumTreeDepth: MAX_TREE_DEPTH,
  maximumTreeNodes: MAX_TREE_NODES,
  maximumTreeKeys: MAX_TREE_KEYS,
  maximumSingleStringBytes: MAX_SINGLE_STRING_BYTES,
  maximumAggregateStringBytes: MAX_AGGREGATE_STRING_BYTES,
});

export const OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_BOUNDARY = deepFreeze({
  position: "SOURCE_SPECIFIC_ROUTE_COLLECTION_SOURCE_REPLAY_HOLD_ONLY",
  exactAdapterContractSourceAndPinsRequired: true,
  sourceSpecificCollectorProfileRequired: true,
  injectedCollectorCallbackInvocationEnabled: false,
  actualCollectorCallbackInvocationCount: 0,
  builtInFetchPresent: false,
  builtInFilesystemIoPresent: false,
  builtInBrowserDriverPresent: false,
  builtInMailboxDriverPresent: false,
  arbitraryUrlAccepted: false,
  rawCredentialMaterialAccepted: false,
  privateIdentifierProjectionAllowed: false,
  rawSourceProjectionAllowed: false,
  fullDiscoverySnapshotProjected: false,
  privateReferencePreimagesProjected: false,
  unsaltedPrivateDerivedHashesProjected: false,
  privateDiscoveryBundleCommitmentSalted: true,
  publicDiscoveryProjectionContainsCountsAndTenderRequirementsOnly: true,
  ambientCredentialsAcceptedOrReadByThisModule: false,
  planningInputStrictCloneAndDeepFreezeRequired: true,
  sourceDeclaredCollectorInvocationIsNotNetworkIoProof: true,
  collectorResultIsSourceDeclarationOnly: true,
  callerPinnedSourceDeclaredFailuresRetained: true,
  logicalDeadlineUsesOnlySourceDeclaredTime: true,
  wallClockTimeoutClaimed: false,
  trustedTimeSourceReplayed: false,
  sideEffectCardinalityReportedNotIndependentlyObserved: true,
  everyCallerPinnedAttemptOccurrenceRetained: true,
  occurrenceCensusSeparatedFromAttemptObjectDedup: true,
  routeObservationOccurrenceCensusPreserved: true,
  adapterConformanceEstablishesPermission: false,
  sourceDeclaredCollectorSuccessEstablishesPermission: false,
  sourceDeclaredCollectorSuccessEstablishesRightsClearance: false,
  sourceDeclaredCollectorSuccessEstablishesPrivacyClearance: false,
  sourceDeclaredCollectorSuccessEstablishesExternalTrust: false,
  sourceDeclaredCollectorSuccessEstablishesContactability: false,
  sourceDeclaredCollectorSuccessEstablishesOwnerAuthority: false,
  sourceDeclaredCollectorSuccessEstablishesCapacity: false,
  sourceDeclaredCollectorSuccessEstablishesZeroInternalOps: false,
  sourceDeclaredCollectorSuccessEnablesAction: false,
  permissionEstablished: false,
  credentialLeaseEstablished: false,
  rightsCleared: false,
  privacyCleared: false,
  externalTrustEstablished: false,
  contactabilityEstablished: false,
  resourceOwnerAuthorityEstablished: false,
  externalCapacityEstablished: false,
  capacityReserved: false,
  zeroInternalOpsEstablished: false,
  providerContactPerformedByThisModule: false,
  tenderDeliveredByThisModule: false,
  internalHumanFallbackPermitted: false,
  humanQueueCreated: false,
  preDeadlineMissingInputDisposition: "CONTINUE_AUTOMATED_FORMATION_HOLD",
  priceEstablished: false,
  pricingPermitted: false,
  guaranteeEstablished: false,
  settlementPermitted: false,
  moneyMovementEnabled: false,
  enabledCapabilityCount: 0,
  provenAuthorityCount: 0,
  enabledCapabilitiesSubsetOfProvenAuthority: true,
  consequenceReach: "NONE",
  decisionState: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
});

export const OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_FAILURE_CODES_V1
  = ObjectFreeze([
    "ADAPTER_CAPABILITY_UNSUPPORTED",
    "EXECUTION_AUTHORITY_UNPROVEN",
    "PERMISSION_INPUT_MISSING",
    "CREDENTIAL_LEASE_INPUT_MISSING",
    "RIGHTS_INPUT_MISSING",
    "PRIVACY_INPUT_MISSING",
    "EXTERNAL_TRUST_INPUT_MISSING",
    "LOGICAL_DEADLINE_EXCEEDED",
    "SIDE_EFFECT_CARDINALITY_EXCEEDED",
    "SOURCE_UNAVAILABLE",
    "SOURCE_PERMISSION_DENIED",
    "SOURCE_RIGHTS_RESTRICTED",
    "SOURCE_PRIVACY_RESTRICTED",
    "SOURCE_TRANSPORT_UNAVAILABLE",
    "SOURCE_TIMEOUT",
    "SOURCE_RATE_LIMITED",
    "SOURCE_MALFORMED",
    "SOURCE_OTHER_DECLARED",
  ]);

const REQUIREMENT_KINDS = ObjectFreeze(["RESOURCE", "EVIDENCE", "RECOVERY"]);
const PLAN_FIELDS = ObjectFreeze([
  "tender", "asOf", "adapterReplay", "collectorProfile",
  "collectionRequests", "privateProjectionNonce",
]);
const SOURCE_FIELDS = ObjectFreeze([
  "tender", "asOf", "adapterReplay", "collectorProfile",
  "expectedAttemptOccurrenceCount", "collectorAttempts",
  "actualCollectorCallbackInvocationCount", "privateProjectionNonce",
]);
const ADAPTER_REPLAY_FIELDS = ObjectFreeze([
  "record", "source", "expectedSourceHash", "expectedContractHash",
]);
const COLLECTOR_PROFILE_FIELDS = ObjectFreeze([
  "collectorImplementationHash", "adapterImplementationHash",
  "transportProfileRefHash", "capability",
  "maximumAttemptOccurrences", "maximumObservationsPerAttempt",
  "maximumSideEffectsPerAttempt",
]);
const REQUEST_FIELDS = ObjectFreeze([
  "collectorOccurrenceId", "requirementKind", "requirementId",
  "transportProfileRefHash", "sourceArtifactHash", "sourceRevisionHash",
  "sourceReplayReceiptHash", "permissionReplayRefHash",
  "credentialLeaseReplayRefHash", "rightsReviewRefHash",
  "privacyReviewRefHash", "externalTrustRefHash", "requestedAt",
  "logicalDeadline", "routeValidUntil", "idempotencyKeyHash", "nonceHash",
  "maximumObservationCount",
]);
const OBSERVATION_FIELDS = ObjectFreeze([
  "occurrenceId", "routeKind", "transactionSurfaceRefHash",
  "sourceRecordHash", "observedAt", "standingCapacityGrantHash",
  "lifecycle",
]);
const LIFECYCLE_FIELDS = ObjectFreeze([
  "revision", "predecessorCandidateHash", "supersedesCandidateHash",
  "revokedAt", "revocationRefHash",
]);
const ATTEMPT_FIELDS = ObjectFreeze([
  "request", "sourceDeclaredCollectorInvoked",
  "sourceDeclarationStructurallyAccepted", "sourceDeclaredOutcome",
  "failureCode", "sourceDeclaredCompletedAt",
  "sourceDeclaredCompletionTimeBasis", "sourceDeclaredSideEffectCount",
  "sourceDeclaredSideEffectWithinLimit",
  "observationSources",
]);
const VERIFY_OPTIONS_FIELDS = ObjectFreeze([
  "source", "expectedSourceHash", "expectedCollectorHash",
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

function hostilePreflight(value) {
  const seen = new SetConstructor();
  const budget = { nodes: 0, keys: 0, stringBytes: 0, arrayElements: 0 };

  function walk(current, depth) {
    if (depth > MAX_TREE_DEPTH) fail("VALUE_TREE_TOO_DEEP");
    if (current === null || typeof current === "boolean") return;
    if (typeof current === "string") {
      const bytes = BufferByteLength(current, "utf8");
      if (bytes > MAX_SINGLE_STRING_BYTES) fail("VALUE_STRING_TOO_LARGE");
      budget.stringBytes += bytes;
      if (budget.stringBytes > MAX_AGGREGATE_STRING_BYTES) {
        fail("VALUE_STRING_BUDGET_EXCEEDED");
      }
      return;
    }
    if (typeof current === "number") {
      if (!NumberIsFinite(current) || !NumberIsSafeInteger(current)
        || ObjectIs(current, -0)) fail("VALUE_NUMBER_INVALID");
      return;
    }
    if (typeof current !== "object") fail("VALUE_TYPE_INVALID");
    if (isProxy(current)) fail("VALUE_PROXY_FORBIDDEN");
    if (SetHas(seen, current)) fail("VALUE_SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
    SetAdd(seen, current);
    budget.nodes += 1;
    if (budget.nodes > MAX_TREE_NODES) fail("VALUE_NODE_BUDGET_EXCEEDED");

    const prototype = ObjectGetPrototypeOf(current);
    const descriptors = ObjectGetOwnPropertyDescriptors(current);
    const keys = ReflectOwnKeys(descriptors);
    budget.keys += keys.length;
    if (budget.keys > MAX_TREE_KEYS) fail("VALUE_KEY_BUDGET_EXCEEDED");

    if (ArrayIsArray(current)) {
      budget.arrayElements += current.length;
      if (prototype !== ArrayPrototype || current.length > MAX_ARRAY_LENGTH
        || budget.arrayElements > MAX_TREE_NODES
        || keys.length !== current.length + 1) fail("DENSE_ARRAY_REQUIRED");
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = descriptors[StringConstructor(index)];
        if (!descriptor || !ObjectHasOwn(descriptor, "value")
          || descriptor.enumerable !== true) fail("DENSE_ARRAY_REQUIRED");
        walk(descriptor.value, depth + 1);
      }
      return;
    }
    if (prototype !== ObjectPrototype && prototype !== null) {
      fail("PLAIN_OBJECT_REQUIRED");
    }
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = descriptors[key];
      if (typeof key !== "string" || !descriptor
        || !ObjectHasOwn(descriptor, "value")
        || descriptor.enumerable !== true) fail("DATA_FIELDS_REQUIRED");
      walk(descriptor.value, depth + 1);
    }
  }
  walk(value, 0);
}

function snapshotStrict(value) {
  hostilePreflight(value);
  return deepFreeze(JSONParse(canonicalizeStrict(value)));
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
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
      || !ObjectHasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(`${code}_FIELDS_INVALID`);
    }
  }
  return value;
}

function denseArray(value, code, maximum) {
  if (!ArrayIsArray(value) || isProxy(value)
    || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  if (keys.length !== value.length + 1) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[StringConstructor(index)];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function iso(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)
    || !NumberIsFinite(DateParse(value))
    || DateToISOString(new DateConstructor(value)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function integer(value, minimum, maximum, code) {
  if (!NumberIsSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function oneOf(value, values, code) {
  for (let index = 0; index < values.length; index += 1) {
    if (value === values[index]) return value;
  }
  fail(`${code}_INVALID`);
}

function includes(values, candidate) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === candidate) return true;
  }
  return false;
}

function nullableFailureCode(value, code) {
  return value === null ? null : oneOf(value,
    OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_FAILURE_CODES_V1, code);
}

function verifiedTender(tender) {
  const descriptor = tender === null || typeof tender !== "object"
    ? null : ObjectGetOwnPropertyDescriptor(tender, "tenderHash");
  if (!descriptor || !ObjectHasOwn(descriptor, "value")) {
    fail("TENDER_HASH_REQUIRED");
  }
  const checked = verifyOutsiderOutcomeTenderV1(tender, {
    expectedTenderHash: descriptor.value,
  });
  if (checked.ok !== true || checked.structuralTenderVerified !== true
    || checked.derivationVerified !== true || checked.selfHashVerified !== true
    || checked.expectedHashMatched !== true
    || checked.typedGraphReferencesPreserved !== true
    || checked.zeroInternalOpsVerified !== true
    || checked.authorizationEstablished !== false
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false
    || tender.zeroInternalOps.outsiderStaffInterventionsAllowed !== 0
    || tender.zeroInternalOps.humanQueueFallbackAllowed !== false) {
    fail("TENDER_SOURCE_REPLAY_FAILED");
  }
  return tender;
}

function requirementBinding(tender, kind, id) {
  oneOf(kind, REQUIREMENT_KINDS, "REQUIREMENT_KIND");
  if (typeof id !== "string" || !RegExpTest(REQUIREMENT_ID, id)) {
    fail("REQUIREMENT_ID_INVALID");
  }
  let rows;
  let requirementSetHash;
  if (kind === "RESOURCE") {
    rows = tender.resourceRequirements.items;
    requirementSetHash = tender.resourceRequirements.requirementSetHash;
  } else if (kind === "EVIDENCE") {
    rows = tender.evidenceRequirements.items;
    requirementSetHash = tender.evidenceRequirements.requirementSetHash;
  } else {
    rows = tender.recoveryRequirements.items;
    requirementSetHash = tender.recoveryRequirements.requirementSetHash;
  }
  let selected = null;
  let matchCount = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const rowId = kind === "RESOURCE" ? rows[index].resourceRequirementId
      : kind === "EVIDENCE" ? rows[index].evidenceRequirementId
        : rows[index].recoveryRequirementId;
    if (rowId === id) {
      selected = rows[index];
      matchCount += 1;
    }
  }
  if (matchCount !== 1) fail("REQUIREMENT_NOT_EXACTLY_PRESENT_IN_TENDER");
  const requirementClassCode = kind === "RESOURCE"
    ? selected.resourceClassCode
    : kind === "EVIDENCE" ? selected.evidenceClassCode
      : selected.resourceClassCode;
  const requirementScopeRefHash = kind === "RESOURCE"
    ? selected.capabilityRefHash
    : kind === "EVIDENCE" ? selected.evidenceRequirementRefHash
      : selected.recoveryOutcomeRefHash;
  const dueBy = kind === "RESOURCE" ? selected.requiredBy
    : kind === "EVIDENCE" ? selected.dueBy : selected.completionDeadline;
  return {
    requirementKind: kind,
    requirementId: id,
    requirementClassCode,
    requirementScopeRefHash,
    requirementSetHash,
    requirementObjectHash: digest(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: tender.tenderHash,
        requirementKind: kind,
        requirementSetHash,
        requirement: selected,
      }),
    dueBy,
    mandatory: selected.mandatory,
  };
}

function adapterContext(value, asOf) {
  exactObject(value, ADAPTER_REPLAY_FIELDS, "ADAPTER_REPLAY");
  const checked = verifyTransactionSurfaceAdapterContractV1(value.record, {
    source: value.source,
    expectedSourceHash: hash(value.expectedSourceHash,
      "ADAPTER_EXPECTED_SOURCE_HASH"),
    expectedContractHash: hash(value.expectedContractHash,
      "ADAPTER_EXPECTED_CONTRACT_HASH"),
  });
  if (checked.ok !== true || checked.sourceRebuildVerified !== true
    || checked.exactPrivateSourceHashVerified !== true
    || checked.exactContractHashVerified !== true
    || checked.structuralConformanceVerified !== true
    || checked.permissionEstablished !== false
    || checked.resourceOwnerAuthorityEstablished !== false
    || checked.externalCapacityEstablished !== false
    || checked.actionAuthorized !== false || checked.decisionState !== "HOLD"
    || checked.authority !== "NONE" || checked.actionReady !== false
    || checked.executable !== false) fail("ADAPTER_CONTRACT_REPLAY_FAILED");
  if (DateParse(value.record.observedAt) > DateParse(asOf)) {
    fail("ADAPTER_CONTRACT_OBSERVED_AFTER_COLLECTION_AS_OF");
  }
  let routeCapability = null;
  for (let index = 0;
    index < value.record.capabilityDeclarations.length; index += 1) {
    if (value.record.capabilityDeclarations[index].capability
      === "PERMITTED_ROUTE_DISCOVERY") {
      routeCapability = value.record.capabilityDeclarations[index];
    }
  }
  if (routeCapability === null) fail("ADAPTER_ROUTE_CAPABILITY_UNDECLARED");
  return { record: value.record, checked, routeCapability };
}

function normalizeCollectorProfile(value, adapter) {
  exactObject(value, COLLECTOR_PROFILE_FIELDS, "COLLECTOR_PROFILE");
  const profile = {
    collectorImplementationHash: hash(value.collectorImplementationHash,
      "COLLECTOR_IMPLEMENTATION_HASH"),
    adapterImplementationHash: hash(value.adapterImplementationHash,
      "COLLECTOR_ADAPTER_IMPLEMENTATION_HASH"),
    transportProfileRefHash: hash(value.transportProfileRefHash,
      "COLLECTOR_TRANSPORT_PROFILE_REF_HASH"),
    capability: oneOf(value.capability, ["PERMITTED_ROUTE_DISCOVERY"],
      "COLLECTOR_CAPABILITY"),
    maximumAttemptOccurrences: integer(value.maximumAttemptOccurrences, 0,
      MAX_ATTEMPT_OCCURRENCES, "COLLECTOR_MAXIMUM_ATTEMPT_OCCURRENCES"),
    maximumObservationsPerAttempt: integer(value.maximumObservationsPerAttempt,
      1, MAX_OBSERVATIONS_PER_ATTEMPT,
      "COLLECTOR_MAXIMUM_OBSERVATIONS_PER_ATTEMPT"),
    maximumSideEffectsPerAttempt: integer(value.maximumSideEffectsPerAttempt,
      0, 1, "COLLECTOR_MAXIMUM_SIDE_EFFECTS_PER_ATTEMPT"),
  };
  if (profile.adapterImplementationHash
    !== adapter.record.adapterClosure.adapterImplementationHash) {
    fail("COLLECTOR_ADAPTER_IMPLEMENTATION_HASH_MISMATCH");
  }
  let transportPresent = false;
  for (let index = 0;
    index < adapter.record.supportedTransportProfiles.length; index += 1) {
    if (adapter.record.supportedTransportProfiles[index]
      .transportProfileRefHash === profile.transportProfileRefHash) {
      transportPresent = true;
    }
  }
  if (!transportPresent) fail("COLLECTOR_TRANSPORT_PROFILE_NOT_IN_ADAPTER");
  if (profile.maximumSideEffectsPerAttempt
    !== adapter.routeCapability.maximumSideEffectsPerTender) {
    fail("COLLECTOR_SIDE_EFFECT_LIMIT_NOT_EXACT_ADAPTER_LIMIT");
  }
  return profile;
}

function normalizeRequest(value, tender, asOf, profile) {
  exactObject(value, REQUEST_FIELDS, "COLLECTION_REQUEST");
  if (typeof value.collectorOccurrenceId !== "string"
    || !RegExpTest(OCCURRENCE_ID, value.collectorOccurrenceId)) {
    fail("COLLECTOR_OCCURRENCE_ID_INVALID");
  }
  const requirement = requirementBinding(tender, value.requirementKind,
    value.requirementId);
  const requestedAt = iso(value.requestedAt, "REQUESTED_AT");
  const logicalDeadline = iso(value.logicalDeadline, "LOGICAL_DEADLINE");
  const routeValidUntil = iso(value.routeValidUntil, "ROUTE_VALID_UNTIL");
  if (DateParse(requestedAt) < DateParse(tender.compiledAt)
    || DateParse(requestedAt) > DateParse(asOf)
    || DateParse(logicalDeadline) <= DateParse(requestedAt)
    || DateParse(logicalDeadline) > DateParse(tender.formationDeadline)
    || DateParse(routeValidUntil) < DateParse(logicalDeadline)
    || DateParse(routeValidUntil) > DateParse(tender.formationDeadline)) {
    fail("COLLECTION_REQUEST_TIME_WINDOW_INVALID");
  }
  if (value.transportProfileRefHash !== profile.transportProfileRefHash) {
    fail("COLLECTION_REQUEST_TRANSPORT_PROFILE_MISMATCH");
  }
  const maximumObservationCount = integer(value.maximumObservationCount, 1,
    profile.maximumObservationsPerAttempt,
    "COLLECTION_REQUEST_MAXIMUM_OBSERVATION_COUNT");
  return {
    collectorOccurrenceId: value.collectorOccurrenceId,
    requirementKind: requirement.requirementKind,
    requirementId: requirement.requirementId,
    transportProfileRefHash: hash(value.transportProfileRefHash,
      "REQUEST_TRANSPORT_PROFILE_REF_HASH"),
    sourceArtifactHash: hash(value.sourceArtifactHash,
      "REQUEST_SOURCE_ARTIFACT_HASH"),
    sourceRevisionHash: hash(value.sourceRevisionHash,
      "REQUEST_SOURCE_REVISION_HASH"),
    sourceReplayReceiptHash: nullableHash(value.sourceReplayReceiptHash,
      "REQUEST_SOURCE_REPLAY_RECEIPT_HASH"),
    permissionReplayRefHash: nullableHash(value.permissionReplayRefHash,
      "REQUEST_PERMISSION_REPLAY_REF_HASH"),
    credentialLeaseReplayRefHash: nullableHash(
      value.credentialLeaseReplayRefHash,
      "REQUEST_CREDENTIAL_LEASE_REPLAY_REF_HASH"),
    rightsReviewRefHash: nullableHash(value.rightsReviewRefHash,
      "REQUEST_RIGHTS_REVIEW_REF_HASH"),
    privacyReviewRefHash: nullableHash(value.privacyReviewRefHash,
      "REQUEST_PRIVACY_REVIEW_REF_HASH"),
    externalTrustRefHash: nullableHash(value.externalTrustRefHash,
      "REQUEST_EXTERNAL_TRUST_REF_HASH"),
    requestedAt,
    logicalDeadline,
    routeValidUntil,
    idempotencyKeyHash: hash(value.idempotencyKeyHash,
      "REQUEST_IDEMPOTENCY_KEY_HASH"),
    nonceHash: hash(value.nonceHash, "REQUEST_NONCE_HASH"),
    maximumObservationCount,
  };
}

function missingPrerequisite(request) {
  if (request.permissionReplayRefHash === null) {
    return "PERMISSION_INPUT_MISSING";
  }
  if (request.credentialLeaseReplayRefHash === null) {
    return "CREDENTIAL_LEASE_INPUT_MISSING";
  }
  if (request.rightsReviewRefHash === null) return "RIGHTS_INPUT_MISSING";
  if (request.privacyReviewRefHash === null) return "PRIVACY_INPUT_MISSING";
  if (request.externalTrustRefHash === null) {
    return "EXTERNAL_TRUST_INPUT_MISSING";
  }
  return null;
}

function normalizeLifecycle(value) {
  exactObject(value, LIFECYCLE_FIELDS, "OBSERVATION_LIFECYCLE");
  return {
    revision: integer(value.revision, 0,
      OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_LIMITS
        .maximumLifecycleRevision,
      "OBSERVATION_LIFECYCLE_REVISION"),
    predecessorCandidateHash: nullableHash(value.predecessorCandidateHash,
      "OBSERVATION_PREDECESSOR_CANDIDATE_HASH"),
    supersedesCandidateHash: nullableHash(value.supersedesCandidateHash,
      "OBSERVATION_SUPERSEDES_CANDIDATE_HASH"),
    revokedAt: value.revokedAt === null ? null
      : iso(value.revokedAt, "OBSERVATION_REVOKED_AT"),
    revocationRefHash: nullableHash(value.revocationRefHash,
      "OBSERVATION_REVOCATION_REF_HASH"),
  };
}

function normalizeObservation(value, request, completedAt) {
  exactObject(value, OBSERVATION_FIELDS, "COLLECTOR_OBSERVATION");
  if (typeof value.occurrenceId !== "string"
    || !RegExpTest(ROUTE_OCCURRENCE_ID, value.occurrenceId)) {
    fail("ROUTE_OBSERVATION_OCCURRENCE_ID_INVALID");
  }
  const observedAt = iso(value.observedAt, "ROUTE_OBSERVATION_OBSERVED_AT");
  if (DateParse(observedAt) < DateParse(request.requestedAt)
    || DateParse(observedAt) > DateParse(completedAt)
    || DateParse(observedAt) >= DateParse(request.routeValidUntil)) {
    fail("ROUTE_OBSERVATION_TIME_INVALID");
  }
  const routeKind = oneOf(value.routeKind,
    OUTSIDER_OUTCOME_RESOURCE_ROUTE_KINDS, "ROUTE_OBSERVATION_KIND");
  const standingCapacityGrantHash = nullableHash(
    value.standingCapacityGrantHash,
    "ROUTE_OBSERVATION_STANDING_CAPACITY_GRANT_HASH");
  if (routeKind === "STANDING_CAPACITY_GRANT"
    && standingCapacityGrantHash === null) {
    fail("ROUTE_OBSERVATION_STANDING_GRANT_REQUIRED");
  }
  return {
    occurrenceId: value.occurrenceId,
    requirementKind: request.requirementKind,
    requirementId: request.requirementId,
    routeKind,
    observedAt,
    validUntil: request.routeValidUntil,
    sourceReference: {
      transactionSurfaceRefHash: hash(value.transactionSurfaceRefHash,
        "ROUTE_OBSERVATION_TRANSACTION_SURFACE_REF_HASH"),
      sourceArtifactHash: request.sourceArtifactHash,
      sourceRevisionHash: request.sourceRevisionHash,
      sourceRecordHash: hash(value.sourceRecordHash,
        "ROUTE_OBSERVATION_SOURCE_RECORD_HASH"),
      sourceReplayReceiptHash: request.sourceReplayReceiptHash,
      rightsReviewRefHash: request.rightsReviewRefHash,
      privacyReviewRefHash: request.privacyReviewRefHash,
      resourceOwnerAuthorityRefHash: null,
      contactabilityEvidenceRefHash: null,
      capacityEvidenceRefHash: null,
      providerPatternProjectionHash: null,
      networkIntakeManifestHash: null,
      networkNodeConformanceHash: null,
      federatedHandoffHash: null,
      standingCapacityGrantHash,
    },
    lifecycle: normalizeLifecycle(value.lifecycle),
  };
}

function notInvokedAttempt(request, failureCode) {
  return {
    request,
    sourceDeclaredCollectorInvoked: false,
    sourceDeclarationStructurallyAccepted: true,
    sourceDeclaredOutcome: "NOT_INVOKED",
    failureCode,
    sourceDeclaredCompletedAt: request.requestedAt,
    sourceDeclaredCompletionTimeBasis: "REQUEST_FALLBACK_NO_TRUSTED_TIME",
    sourceDeclaredSideEffectCount: 0,
    sourceDeclaredSideEffectWithinLimit: true,
    observationSources: [],
  };
}

/**
 * Build a source-specific collection plan.  The injected-capability position
 * is intentionally untouched: v1 has no replayed execution admission capable
 * of authorizing a callback.  Every request is therefore NOT_INVOKED.
 */
export async function runRouteDiscoveryCollectorV1(plan, injectedCapability) {
  const frozenPlan = snapshotStrict(plan);
  exactObject(frozenPlan, PLAN_FIELDS, "RUN_PLAN");
  const tender = verifiedTender(frozenPlan.tender);
  const asOf = iso(frozenPlan.asOf, "RUN_AS_OF");
  if (DateParse(asOf) < DateParse(tender.compiledAt)
    || DateParse(asOf) >= DateParse(tender.formationDeadline)) {
    fail("RUN_AS_OF_OUTSIDE_FORMATION_WINDOW");
  }
  const adapter = adapterContext(frozenPlan.adapterReplay, asOf);
  const profile = normalizeCollectorProfile(frozenPlan.collectorProfile,
    adapter);
  hash(frozenPlan.privateProjectionNonce, "PRIVATE_PROJECTION_NONCE");
  denseArray(frozenPlan.collectionRequests, "COLLECTION_REQUESTS",
    profile.maximumAttemptOccurrences);

  const requests = [];
  const occurrenceIds = new SetConstructor();
  const nonces = new SetConstructor();
  for (let index = 0; index < frozenPlan.collectionRequests.length; index += 1) {
    const request = normalizeRequest(frozenPlan.collectionRequests[index],
      tender, asOf, profile);
    if (SetHas(occurrenceIds, request.collectorOccurrenceId)) {
      fail("COLLECTOR_OCCURRENCE_ID_DUPLICATE");
    }
    SetAdd(occurrenceIds, request.collectorOccurrenceId);
    if (SetHas(nonces, request.nonceHash)) fail("COLLECTOR_NONCE_DUPLICATE");
    SetAdd(nonces, request.nonceHash);
    append(requests, request);
  }
  const adapterCapabilitySupported = adapter.routeCapability.supported === true
    && includes(adapter.routeCapability.transportProfileRefHashes,
      profile.transportProfileRefHash);
  const attempts = [];
  for (let index = 0; index < requests.length; index += 1) {
    const request = requests[index];
    if (!adapterCapabilitySupported) {
      append(attempts, notInvokedAttempt(request,
        "ADAPTER_CAPABILITY_UNSUPPORTED"));
      continue;
    }
    const prerequisiteFailure = missingPrerequisite(request);
    if (prerequisiteFailure !== null) {
      append(attempts, notInvokedAttempt(request, prerequisiteFailure));
      continue;
    }
    append(attempts, notInvokedAttempt(request,
      "EXECUTION_AUTHORITY_UNPROVEN"));
  }
  return snapshotStrict({
    tender,
    asOf,
    adapterReplay: frozenPlan.adapterReplay,
    collectorProfile: profile,
    expectedAttemptOccurrenceCount: attempts.length,
    collectorAttempts: attempts,
    actualCollectorCallbackInvocationCount: 0,
    privateProjectionNonce: frozenPlan.privateProjectionNonce,
  });
}

function normalizeAttempt(value, tender, asOf, profile,
  adapterCapabilitySupported) {
  exactObject(value, ATTEMPT_FIELDS, "COLLECTOR_ATTEMPT");
  const request = normalizeRequest(value.request, tender, asOf, profile);
  if (typeof value.sourceDeclaredCollectorInvoked !== "boolean"
    || typeof value.sourceDeclarationStructurallyAccepted !== "boolean"
    || typeof value.sourceDeclaredSideEffectWithinLimit !== "boolean") {
    fail("COLLECTOR_ATTEMPT_BOOLEAN_INVALID");
  }
  const sourceDeclaredOutcome = oneOf(value.sourceDeclaredOutcome,
    ["SUCCEEDED", "FAILED", "NOT_INVOKED"],
    "COLLECTOR_ATTEMPT_SOURCE_DECLARED_OUTCOME");
  const failureCode = nullableFailureCode(value.failureCode,
    "COLLECTOR_ATTEMPT_FAILURE_CODE");
  const sourceDeclaredCompletedAt = iso(value.sourceDeclaredCompletedAt,
    "COLLECTOR_ATTEMPT_SOURCE_DECLARED_COMPLETED_AT");
  if (DateParse(sourceDeclaredCompletedAt)
    < DateParse(request.requestedAt)) {
    fail("SOURCE_DECLARED_COMPLETION_BEFORE_REQUEST");
  }
  if (DateParse(sourceDeclaredCompletedAt) > DateParse(asOf)) {
    fail("SOURCE_DECLARED_COMPLETION_AFTER_AS_OF");
  }
  const sourceDeclaredCompletionTimeBasis = oneOf(
    value.sourceDeclaredCompletionTimeBasis, [
    "REQUEST_FALLBACK_NO_TRUSTED_TIME",
    "COLLECTOR_DECLARATION_NO_TRUSTED_TIME",
  ], "COLLECTOR_ATTEMPT_COMPLETION_TIME_SOURCE");
  const sourceDeclaredSideEffectCount
    = value.sourceDeclaredSideEffectCount === null
      ? null : integer(value.sourceDeclaredSideEffectCount, 0,
      MAX_REPORTED_SIDE_EFFECTS, "COLLECTOR_ATTEMPT_SIDE_EFFECT_COUNT");
  denseArray(value.observationSources, "COLLECTOR_ATTEMPT_OBSERVATIONS",
    request.maximumObservationCount);
  const observations = [];
  for (let index = 0; index < value.observationSources.length; index += 1) {
    const source = value.observationSources[index];
    /* Rebuild the observation source through its inverse projection. */
    exactObject(source, [
      "occurrenceId", "requirementKind", "requirementId", "routeKind",
      "observedAt", "validUntil", "sourceReference", "lifecycle",
    ], "OBSERVATION_SOURCE");
    if (source.requirementKind !== request.requirementKind
      || source.requirementId !== request.requirementId
      || source.validUntil !== request.routeValidUntil
      || source.sourceReference.sourceArtifactHash !== request.sourceArtifactHash
      || source.sourceReference.sourceRevisionHash !== request.sourceRevisionHash
      || source.sourceReference.sourceReplayReceiptHash
        !== request.sourceReplayReceiptHash
      || source.sourceReference.rightsReviewRefHash !== request.rightsReviewRefHash
      || source.sourceReference.privacyReviewRefHash
        !== request.privacyReviewRefHash) {
      fail("OBSERVATION_SOURCE_REQUEST_BINDING_MISMATCH");
    }
    const rawObservation = {
      occurrenceId: source.occurrenceId,
      routeKind: source.routeKind,
      transactionSurfaceRefHash:
        source.sourceReference.transactionSurfaceRefHash,
      sourceRecordHash: source.sourceReference.sourceRecordHash,
      observedAt: source.observedAt,
      standingCapacityGrantHash:
        source.sourceReference.standingCapacityGrantHash,
      lifecycle: source.lifecycle,
    };
    const rebuilt = normalizeObservation(rawObservation, request,
      sourceDeclaredCompletedAt);
    if (!same(source, rebuilt)) fail("OBSERVATION_SOURCE_REBUILD_MISMATCH");
    append(observations, rebuilt);
  }
  const prerequisiteFailure = missingPrerequisite(request);
  if (sourceDeclaredOutcome === "SUCCEEDED") {
    if (!adapterCapabilitySupported || !value.sourceDeclaredCollectorInvoked
      || !value.sourceDeclarationStructurallyAccepted
      || failureCode !== null || prerequisiteFailure !== null
      || sourceDeclaredSideEffectCount === null
      || sourceDeclaredSideEffectCount > profile.maximumSideEffectsPerAttempt
      || value.sourceDeclaredSideEffectWithinLimit !== true
      || sourceDeclaredCompletionTimeBasis
        !== "COLLECTOR_DECLARATION_NO_TRUSTED_TIME"
      || DateParse(sourceDeclaredCompletedAt)
        > DateParse(request.logicalDeadline)) {
      fail("COLLECTOR_SUCCESS_STATE_INVALID");
    }
  } else if (sourceDeclaredOutcome === "NOT_INVOKED") {
    if (value.sourceDeclaredCollectorInvoked
      || value.sourceDeclarationStructurallyAccepted !== true
      || failureCode === null
      || sourceDeclaredCompletedAt !== request.requestedAt
      || sourceDeclaredCompletionTimeBasis
        !== "REQUEST_FALLBACK_NO_TRUSTED_TIME"
      || sourceDeclaredSideEffectCount !== 0
      || value.sourceDeclaredSideEffectWithinLimit !== true
      || observations.length !== 0) fail("COLLECTOR_NOT_INVOKED_STATE_INVALID");
    const expectedPrerequisiteFailure = missingPrerequisite(request);
    if (!adapterCapabilitySupported) {
      if (failureCode !== "ADAPTER_CAPABILITY_UNSUPPORTED") {
        fail("COLLECTOR_NOT_INVOKED_REASON_INVALID");
      }
    } else if (expectedPrerequisiteFailure !== null) {
      if (failureCode !== expectedPrerequisiteFailure) {
        fail("COLLECTOR_NOT_INVOKED_REASON_INVALID");
      }
    } else if (failureCode !== "EXECUTION_AUTHORITY_UNPROVEN") {
      fail("COLLECTOR_NOT_INVOKED_REASON_INVALID");
    }
  } else {
    if (!adapterCapabilitySupported || missingPrerequisite(request) !== null
      || !value.sourceDeclaredCollectorInvoked || failureCode === null
      || observations.length !== 0) fail("COLLECTOR_FAILURE_STATE_INVALID");
    if (value.sourceDeclarationStructurallyAccepted) {
      if (sourceDeclaredCompletionTimeBasis
          !== "COLLECTOR_DECLARATION_NO_TRUSTED_TIME"
        || sourceDeclaredSideEffectCount === null) {
        fail("COLLECTOR_ACCEPTED_FAILURE_STATE_INVALID");
      }
      const cardinalityWithin = sourceDeclaredSideEffectCount
        <= profile.maximumSideEffectsPerAttempt;
      if (value.sourceDeclaredSideEffectWithinLimit !== cardinalityWithin) {
        fail("COLLECTOR_ACCEPTED_FAILURE_CARDINALITY_STATE_INVALID");
      }
      if (failureCode === "SIDE_EFFECT_CARDINALITY_EXCEEDED") {
        if (cardinalityWithin
          || DateParse(sourceDeclaredCompletedAt)
            > DateParse(request.logicalDeadline)) {
          fail("COLLECTOR_CARDINALITY_FAILURE_STATE_INVALID");
        }
      } else if (failureCode === "LOGICAL_DEADLINE_EXCEEDED") {
        if (!cardinalityWithin
          || DateParse(sourceDeclaredCompletedAt)
            <= DateParse(request.logicalDeadline)) {
          fail("COLLECTOR_LOGICAL_DEADLINE_FAILURE_STATE_INVALID");
        }
      } else if (!StringStartsWith(failureCode, "SOURCE_")
        || !cardinalityWithin
        || DateParse(sourceDeclaredCompletedAt)
          > DateParse(request.logicalDeadline)) {
        fail("COLLECTOR_SOURCE_FAILURE_STATE_INVALID");
      }
    } else if (sourceDeclaredCompletedAt !== request.requestedAt
      || sourceDeclaredCompletionTimeBasis
        !== "REQUEST_FALLBACK_NO_TRUSTED_TIME"
      || sourceDeclaredSideEffectCount !== null
      || value.sourceDeclaredSideEffectWithinLimit !== false) {
      fail("COLLECTOR_UNACCEPTED_FAILURE_STATE_INVALID");
    }
  }
  return {
    request,
    sourceDeclaredCollectorInvoked: value.sourceDeclaredCollectorInvoked,
    sourceDeclarationStructurallyAccepted:
      value.sourceDeclarationStructurallyAccepted,
    sourceDeclaredOutcome,
    failureCode,
    sourceDeclaredCompletedAt,
    sourceDeclaredCompletionTimeBasis,
    sourceDeclaredSideEffectCount,
    sourceDeclaredSideEffectWithinLimit:
      value.sourceDeclaredSideEffectWithinLimit,
    observationSources: observations,
  };
}

function attemptMaterial(tender, profile, attempt) {
  const requirement = requirementBinding(tender,
    attempt.request.requirementKind, attempt.request.requirementId);
  const privateObjectIdentity = {
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    requirementKind: requirement.requirementKind,
    requirementId: requirement.requirementId,
    requirementObjectHash: requirement.requirementObjectHash,
    collectorImplementationHash: profile.collectorImplementationHash,
    adapterImplementationHash: profile.adapterImplementationHash,
    transportProfileRefHash: profile.transportProfileRefHash,
    sourceArtifactHash: attempt.request.sourceArtifactHash,
    sourceRevisionHash: attempt.request.sourceRevisionHash,
    sourceReplayReceiptHash: attempt.request.sourceReplayReceiptHash,
    permissionReplayRefHash: attempt.request.permissionReplayRefHash,
    credentialLeaseReplayRefHash:
      attempt.request.credentialLeaseReplayRefHash,
    rightsReviewRefHash: attempt.request.rightsReviewRefHash,
    privacyReviewRefHash: attempt.request.privacyReviewRefHash,
    externalTrustRefHash: attempt.request.externalTrustRefHash,
    logicalDeadline: attempt.request.logicalDeadline,
    routeValidUntil: attempt.request.routeValidUntil,
    maximumObservationCount: attempt.request.maximumObservationCount,
    maximumSideEffectsPerAttempt: profile.maximumSideEffectsPerAttempt,
  };
  const privateAttemptObjectHash = digest(
    "outsider/route-discovery-collector-private-attempt-object-identity/v1",
    privateObjectIdentity);
  const privateAttemptOccurrenceHash = digest(
    "outsider/route-discovery-collector-private-attempt-occurrence-identity/v1",
    { privateAttemptObjectHash, attempt });
  const publicObject = {
    schema: OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_SCHEMAS.attemptObject,
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
    requirementKind: requirement.requirementKind,
    requirementId: requirement.requirementId,
    requirementObjectHash: requirement.requirementObjectHash,
    collectorImplementationHash: profile.collectorImplementationHash,
    adapterImplementationHash: profile.adapterImplementationHash,
    transportProfileRefHash: profile.transportProfileRefHash,
    logicalDeadline: attempt.request.logicalDeadline,
    routeValidUntil: attempt.request.routeValidUntil,
    maximumObservationCount: attempt.request.maximumObservationCount,
    maximumSideEffectsPerAttempt: profile.maximumSideEffectsPerAttempt,
    idempotencySemantics:
      "CALLER_PINNED_ONE_USE_KEY_NOT_DURABLY_CONSUMED_BY_THIS_MODULE",
  };
  const publicOccurrence = {
    schema: OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_SCHEMAS.attemptOccurrence,
    requestedAt: attempt.request.requestedAt,
    sourceDeclaredCompletedAt: attempt.sourceDeclaredCompletedAt,
    sourceDeclaredCompletionTimeBasis:
      attempt.sourceDeclaredCompletionTimeBasis,
    trustedTimeEstablished: false,
    sourceDeclaredCollectorInvoked: attempt.sourceDeclaredCollectorInvoked,
    sourceDeclarationStructurallyAccepted:
      attempt.sourceDeclarationStructurallyAccepted,
    sourceDeclaredOutcome: attempt.sourceDeclaredOutcome,
    actualCollectorInvoked: false,
    actualNetworkIoEstablished: false,
    failureCode: attempt.failureCode,
    sourceDeclaredSideEffectCount: attempt.sourceDeclaredSideEffectCount,
    sourceDeclaredSideEffectCountIsIndependentTruth: false,
    sourceDeclaredSideEffectWithinLimit:
      attempt.sourceDeclaredSideEffectWithinLimit,
    actualSideEffectCardinalityEstablished: false,
    sourceDeclaredObservationCount: attempt.observationSources.length,
    permissionReferencePresent:
      attempt.request.permissionReplayRefHash !== null,
    credentialLeaseReferencePresent:
      attempt.request.credentialLeaseReplayRefHash !== null,
    rightsReviewReferencePresent: attempt.request.rightsReviewRefHash !== null,
    privacyReviewReferencePresent: attempt.request.privacyReviewRefHash !== null,
    externalTrustReferencePresent: attempt.request.externalTrustRefHash !== null,
    permissionEstablished: false,
    credentialLeaseEstablished: false,
    rightsCleared: false,
    privacyCleared: false,
    externalTrustEstablished: false,
    contactabilityEstablished: false,
    ownerAuthorityEstablished: false,
    capacityEstablished: false,
    actionAuthorized: false,
  };
  return {
    privateAttemptObjectHash,
    privateAttemptOccurrenceHash,
    publicProjection: { ...publicObject, occurrence: publicOccurrence },
  };
}

function buildAttemptCensus(materials) {
  const objectCounts = new MapConstructor();
  let sourceDeclaredInvoked = 0;
  let sourceDeclaredSucceeded = 0;
  let sourceDeclaredFailed = 0;
  let sourceDeclaredNotInvoked = 0;
  let sourceDeclaredObservationCount = 0;
  let unknownReportedSideEffectCount = 0;
  let cardinalityViolationCount = 0;
  for (let index = 0; index < materials.length; index += 1) {
    const occurrence = materials[index].publicProjection.occurrence;
    if (occurrence.sourceDeclaredCollectorInvoked) {
      sourceDeclaredInvoked += 1;
    }
    if (occurrence.sourceDeclaredOutcome === "SUCCEEDED") {
      sourceDeclaredSucceeded += 1;
    } else if (occurrence.sourceDeclaredOutcome === "FAILED") {
      sourceDeclaredFailed += 1;
    } else sourceDeclaredNotInvoked += 1;
    sourceDeclaredObservationCount +=
      occurrence.sourceDeclaredObservationCount;
    if (occurrence.sourceDeclaredSideEffectCount === null) {
      unknownReportedSideEffectCount += 1;
    }
    if (occurrence.failureCode
      === "SIDE_EFFECT_CARDINALITY_EXCEEDED") cardinalityViolationCount += 1;
    const hashValue = materials[index].privateAttemptObjectHash;
    MapSet(objectCounts, hashValue,
      (MapHas(objectCounts, hashValue) ? MapGet(objectCounts, hashValue) : 0) + 1);
  }
  const uniqueAttemptObjectCount = MapSize(objectCounts);
  return {
    totalAttemptOccurrenceCount: materials.length,
    uniqueAttemptObjectCount,
    repeatedAttemptObjectOccurrenceCount: materials.length
      - uniqueAttemptObjectCount,
    sourceDeclaredInvokedOccurrenceCount: sourceDeclaredInvoked,
    sourceDeclaredSucceededOccurrenceCount: sourceDeclaredSucceeded,
    sourceDeclaredFailedOccurrenceCount: sourceDeclaredFailed,
    sourceDeclaredNotInvokedOccurrenceCount: sourceDeclaredNotInvoked,
    actualCollectorInvocationOccurrenceCount: 0,
    actualNetworkIoOccurrenceCount: 0,
    sourceDeclaredObservationCount,
    unknownReportedSideEffectOccurrenceCount: unknownReportedSideEffectCount,
    reportedCardinalityViolationOccurrenceCount: cardinalityViolationCount,
    occurrenceCensusPreserved: true,
    attemptObjectDedupPerformedSeparately: true,
    objectDedupDoesNotReduceAttemptDenominator: true,
    externalAttemptNonOmissionEstablished: false,
    actualSideEffectCardinalityEstablished: false,
  };
}

function privacyClosedDiscoveryProjection(discoverySnapshot) {
  const mandatoryRequirements = [];
  const requirements = discoverySnapshot.fanoutPlan.requirements;
  for (let index = 0; index < requirements.length; index += 1) {
    const requirement = requirements[index];
    if (requirement.mandatory !== true) continue;
    append(mandatoryRequirements, {
      requirementKind: requirement.requirementKind,
      requirementId: requirement.requirementId,
      requirementObjectHash: requirement.requirementObjectHash,
      mandatory: true,
      sourceDeclaredCurrentRouteReferenceAvailable:
        requirement.currentRouteReferenceAvailable,
      sourceDeclaredCurrentRouteObjectCount:
        requirement.currentRouteObjectHashes.length,
      sourceDeclaredCurrentCandidateCount:
        requirement.currentCandidateHashes.length,
      sourceDeclaredCurrentRouteKindCount:
        requirement.routeKindsPresent.length,
      sourceDeclarationsExternallyTrusted: false,
      contactabilityEstablished: false,
      resourceOwnerAuthorityEstablished: false,
      externalCapacityEstablished: false,
    });
  }
  const census = discoverySnapshot.occurrenceCensus;
  return {
    schema: OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_SCHEMAS
      .discoveryProjection,
    mandatoryRequirements,
    sourceDeclaredOccurrenceCensus: {
      totalOccurrenceCount: census.totalOccurrenceCount,
      currentOccurrenceCount: census.currentOccurrenceCount,
      expiredOccurrenceCount: census.expiredOccurrenceCount,
      revokedOccurrenceCount: census.revokedOccurrenceCount,
      supersededOccurrenceCount: census.supersededOccurrenceCount,
      uniqueRouteObjectCount: census.uniqueRouteObjectCount,
      repeatedObjectOccurrenceCount: census.repeatedObjectOccurrenceCount,
      occurrenceCensusPreserved: true,
      objectDedupPerformedSeparately: true,
    },
    sourceDeclaredUnavailableMandatoryRequirementCount:
      discoverySnapshot.fanoutPlan
        .unavailableMandatoryRequirementClassCount,
    sourceDeclaredAllMandatoryRequirementsHaveCurrentRouteReference:
      discoverySnapshot.fanoutPlan
        .allMandatoryRequirementClassesHaveCurrentRouteReference,
    exactPrivateDiscoverySnapshotReplayedInternally: true,
    fullDiscoverySnapshotProjected: false,
    privateReferencePreimagesProjected: false,
    unsaltedPrivateDerivedHashesProjected: false,
    sourceDeclarationsExternallyTrusted: false,
    contactabilityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    actionAuthorized: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
}

function privateDiscoveryBundleCommitment(snapshot, discoverySource,
  discoverySnapshot, materials, privateProjectionNonce) {
  const attemptIdentities = [];
  for (let index = 0; index < materials.length; index += 1) {
    append(attemptIdentities, {
      privateAttemptObjectHash: materials[index].privateAttemptObjectHash,
      privateAttemptOccurrenceHash:
        materials[index].privateAttemptOccurrenceHash,
    });
  }
  ArraySort(attemptIdentities, (left, right) => (
    left.privateAttemptOccurrenceHash < right.privateAttemptOccurrenceHash
      ? -1 : left.privateAttemptOccurrenceHash
        > right.privateAttemptOccurrenceHash ? 1 : 0));
  const exactPrivateSourceHash = digest(
    OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_SCHEMAS.sourcePin, snapshot);
  const exactDerivedDiscoverySourceHash = digest(
    "outsider/route-discovery-collector-derived-snapshot-source/v1",
    discoverySource);
  return digest(
    "outsider/route-discovery-collector-private-discovery-bundle/v1", {
      privateProjectionNonce,
      exactPrivateSourceHash,
      exactDerivedDiscoverySourceHash,
      exactDerivedDiscoverySnapshotHash: discoverySnapshot.snapshotHash,
      attemptIdentities,
    });
}

function sourceSnapshot(source) {
  const snapshot = snapshotStrict(source);
  exactObject(snapshot, SOURCE_FIELDS, "SOURCE");
  return snapshot;
}

export function createRouteDiscoveryCollectorSourcePinV1(source) {
  const snapshot = sourceSnapshot(source);
  return digest(OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_SCHEMAS.sourcePin,
    snapshot);
}

export function createRouteDiscoveryCollectorV1(source) {
  const snapshot = sourceSnapshot(source);
  const tender = verifiedTender(snapshot.tender);
  const asOf = iso(snapshot.asOf, "AS_OF");
  if (DateParse(asOf) < DateParse(tender.compiledAt)
    || DateParse(asOf) >= DateParse(tender.formationDeadline)) {
    fail("AS_OF_OUTSIDE_FORMATION_WINDOW");
  }
  const adapter = adapterContext(snapshot.adapterReplay, asOf);
  const profile = normalizeCollectorProfile(snapshot.collectorProfile,
    adapter);
  const adapterCapabilitySupported = adapter.routeCapability.supported === true
    && includes(adapter.routeCapability.transportProfileRefHashes,
      profile.transportProfileRefHash);
  const privateProjectionNonce = hash(snapshot.privateProjectionNonce,
    "PRIVATE_PROJECTION_NONCE");
  if (snapshot.actualCollectorCallbackInvocationCount !== 0) {
    fail("ACTUAL_COLLECTOR_CALLBACK_INVOCATION_FORBIDDEN");
  }
  denseArray(snapshot.collectorAttempts, "COLLECTOR_ATTEMPTS",
    profile.maximumAttemptOccurrences);
  const expectedAttemptOccurrenceCount = integer(
    snapshot.expectedAttemptOccurrenceCount, 0,
    profile.maximumAttemptOccurrences, "EXPECTED_ATTEMPT_OCCURRENCE_COUNT");
  if (snapshot.collectorAttempts.length !== expectedAttemptOccurrenceCount) {
    fail("ATTEMPT_OCCURRENCE_DENOMINATOR_MISMATCH");
  }

  const occurrenceIds = new SetConstructor();
  const nonces = new SetConstructor();
  const attemptMaterials = [];
  const publicAttempts = [];
  const candidateSources = [];
  let totalObservationOccurrenceCount = 0;
  for (let index = 0; index < snapshot.collectorAttempts.length; index += 1) {
    const normalized = normalizeAttempt(snapshot.collectorAttempts[index],
      tender, asOf, profile, adapterCapabilitySupported);
    if (SetHas(occurrenceIds, normalized.request.collectorOccurrenceId)) {
      fail("COLLECTOR_OCCURRENCE_ID_DUPLICATE");
    }
    SetAdd(occurrenceIds, normalized.request.collectorOccurrenceId);
    if (SetHas(nonces, normalized.request.nonceHash)) {
      fail("COLLECTOR_NONCE_DUPLICATE");
    }
    SetAdd(nonces, normalized.request.nonceHash);
    totalObservationOccurrenceCount += normalized.observationSources.length;
    if (totalObservationOccurrenceCount > MAX_TOTAL_OBSERVATION_OCCURRENCES) {
      fail("TOTAL_OBSERVATION_OCCURRENCE_LIMIT_EXCEEDED");
    }
    const material = attemptMaterial(tender, profile, normalized);
    append(attemptMaterials, material);
    append(publicAttempts, material.publicProjection);
    if (normalized.sourceDeclaredOutcome === "SUCCEEDED") {
      for (let observationIndex = 0;
        observationIndex < normalized.observationSources.length;
        observationIndex += 1) {
        append(candidateSources,
          normalized.observationSources[observationIndex]);
      }
    }
  }
  ArraySort(publicAttempts, (left, right) => {
    const leftCanonical = canonicalizeStrict(left);
    const rightCanonical = canonicalizeStrict(right);
    return leftCanonical < rightCanonical ? -1
      : leftCanonical > rightCanonical ? 1 : 0;
  });

  const discoverySource = { tender, asOf, candidateSources };
  const discoverySnapshot = createOutcomeResourceRouteDiscoverySnapshotV1(
    discoverySource);
  const checkedDiscovery = verifyOutcomeResourceRouteDiscoverySnapshotV1(
    discoverySnapshot, {
      source: discoverySource,
      expectedSnapshotHash: discoverySnapshot.snapshotHash,
    });
  if (checkedDiscovery.ok !== true
    || checkedDiscovery.snapshotRecordRederivedFromInput !== true
    || checkedDiscovery.exactTenderAndRequirementCrossBindingVerified !== true
    || checkedDiscovery.occurrenceCensusVerified !== true
    || checkedDiscovery.objectDedupVerified !== true
    || checkedDiscovery.externalSourceReplayVerified !== false
    || checkedDiscovery.externalRouteZeroInternalOpsEstablished !== false
    || checkedDiscovery.decision !== "HOLD"
    || checkedDiscovery.authority !== "NONE"
    || checkedDiscovery.actionReady !== false
    || checkedDiscovery.executable !== false) {
    fail("DISCOVERY_SNAPSHOT_REPLAY_FAILED");
  }
  const discoveryProjection = privacyClosedDiscoveryProjection(
    discoverySnapshot);
  const attemptCensus = buildAttemptCensus(attemptMaterials);
  const privateDiscoveryBundleCommitmentHash
    = privateDiscoveryBundleCommitment(snapshot, discoverySource,
      discoverySnapshot, attemptMaterials, privateProjectionNonce);
  const adapterCapabilityDeclared = adapterCapabilitySupported;
  const body = {
    schema: OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_SCHEMAS.collector,
    schemaVersion: "1.0.0",
    recordClass: "SOURCE_SPECIFIC_ROUTE_COLLECTION_SOURCE_REPLAY_HOLD_ONLY",
    asOf,
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
      embodimentPresent: tender.typedGraph.embodiment.present,
      delegationEdgeHash: tender.typedGraph.delegation.delegationEdgeHash,
      episodeHash: tender.typedGraph.episode.episodeHash,
      attemptHash: tender.typedGraph.attempt.attemptHash,
      fullTypedGraphBindingPreserved: true,
    },
    adapterBinding: {
      contractHash: adapter.record.contractHash,
      adapterImplementationHash:
        adapter.record.adapterClosure.adapterImplementationHash,
      adapterPackageProfileHash:
        adapter.record.adapterClosure.adapterPackageProfileHash,
      exactSourceAndPinsReplayed: true,
      structuralConformanceVerified: true,
      structuralConformanceEstablishesPermission: false,
      structuralConformanceEnablesAction: false,
    },
    collectorBinding: {
      collectorImplementationHash: profile.collectorImplementationHash,
      adapterImplementationHash: profile.adapterImplementationHash,
      transportProfileRefHash: profile.transportProfileRefHash,
      capability: "PERMITTED_ROUTE_DISCOVERY",
      adapterCapabilityDeclared,
      maximumAttemptOccurrences: profile.maximumAttemptOccurrences,
      maximumObservationsPerAttempt: profile.maximumObservationsPerAttempt,
      maximumTotalObservationOccurrences:
        MAX_TOTAL_OBSERVATION_OCCURRENCES,
      maximumSideEffectsPerAttempt: profile.maximumSideEffectsPerAttempt,
      actualCollectorCallbackInvocationCount: 0,
      callbackExecutionEnabled: false,
      collectorImplementationLoadedOrInvokedEstablished: false,
      collectorNetworkIoEstablished: false,
      collectorPermissionEstablished: false,
    },
    collectorAttemptOccurrences: publicAttempts,
    attemptCensus,
    discoveryProjection,
    privateDiscoveryBundleCommitmentHash,
    privateDiscoveryBundleCommitmentSalted: true,
    privateReferencePreimagesProjected: false,
    unsaltedPrivateDerivedHashesProjected: false,
    exactAttemptOccurrenceDenominatorReplayed: true,
    occurrenceCensusSeparatedFromObjectDedup: true,
    acceptedSourceDeclaredRouteObservationCount: candidateSources.length,
    sourceDeclaredObservationsAreExternallyTrusted: false,
    actualCollectorCallbackInvocationCount: 0,
    actualCollectorInvoked: false,
    actualNetworkIoEstablished: false,
    permissionEstablished: false,
    credentialLeaseEstablished: false,
    rightsCleared: false,
    privacyCleared: false,
    externalTrustEstablished: false,
    contactabilityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    zeroInternalOpsEstablished: false,
    actualSideEffectCardinalityEstablished: false,
    actionAuthorized: false,
    humanQueueCreated: false,
    internalHumanFallbackPermitted: false,
    disposition: "CONTINUE_AUTOMATED_FORMATION_HOLD",
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    moneyMovementEnabled: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_BOUNDARY,
  };
  return deepFreeze({
    ...body,
    collectorHash: digest(
      OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_SCHEMAS.collector, body),
  });
}

function verificationFailure(error) {
  let message = `${PREFIX}UNTRUSTED_FAILURE`;
  try {
    if (error instanceof ErrorConstructor && typeof error.message === "string"
      && RegExpTest(/^OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_[A-Z0-9_]+$/u,
        error.message)) message = error.message;
  } catch {
    message = `${PREFIX}UNTRUSTED_FAILURE`;
  }
  return deepFreeze({
    schema: OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_SCHEMAS.verification,
    ok: false,
    exactPrivateSourceHashVerified: false,
    collectorRecordRebuiltFromSource: false,
    expectedCollectorHashMatched: false,
    exactAdapterContractSourceAndPinsReplayed: false,
    fullTypedGraphAndRequirementBindingsVerified: false,
    attemptOccurrenceDenominatorVerified: false,
    occurrenceCensusSeparateFromObjectDedupVerified: false,
    derivedDiscoverySnapshotReplayed: false,
    sourceDeclaredObservationsAreExternallyTrusted: false,
    actualCollectorCallbackInvocationCount: 0,
    actualCollectorInvoked: false,
    actualNetworkIoEstablished: false,
    permissionEstablished: false,
    credentialLeaseEstablished: false,
    rightsCleared: false,
    privacyCleared: false,
    externalTrustEstablished: false,
    contactabilityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    zeroInternalOpsEstablished: false,
    actualSideEffectCardinalityEstablished: false,
    actionAuthorized: false,
    internalHumanFallbackPermitted: false,
    humanQueueCreated: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    moneyMovementEnabled: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: message,
    boundary: OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_BOUNDARY,
  });
}

export function verifyRouteDiscoveryCollectorV1(record, options) {
  try {
    const checkedRecord = snapshotStrict(record);
    const checkedOptions = snapshotStrict(options);
    exactObject(checkedOptions, VERIFY_OPTIONS_FIELDS, "VERIFY_OPTIONS");
    const expectedSourceHash = hash(checkedOptions.expectedSourceHash,
      "EXPECTED_SOURCE_HASH");
    const source = sourceSnapshot(checkedOptions.source);
    const actualSourceHash = digest(
      OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_SCHEMAS.sourcePin, source);
    if (actualSourceHash !== expectedSourceHash) {
      fail("EXPECTED_SOURCE_HASH_MISMATCH");
    }
    const rebuilt = createRouteDiscoveryCollectorV1(source);
    if (!same(checkedRecord, rebuilt)) fail("COLLECTOR_SOURCE_REBUILD_MISMATCH");
    const expectedCollectorHash = hash(checkedOptions.expectedCollectorHash,
      "EXPECTED_COLLECTOR_HASH");
    if (rebuilt.collectorHash !== expectedCollectorHash) {
      fail("EXPECTED_COLLECTOR_HASH_MISMATCH");
    }
    return deepFreeze({
      schema: OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_SCHEMAS.verification,
      ok: true,
      exactPrivateSourceHashVerified: true,
      collectorRecordRebuiltFromSource: true,
      expectedCollectorHashMatched: true,
      exactAdapterContractSourceAndPinsReplayed: true,
      fullTypedGraphAndRequirementBindingsVerified: true,
      attemptOccurrenceDenominatorVerified: true,
      occurrenceCensusSeparateFromObjectDedupVerified: true,
      derivedDiscoverySnapshotReplayed: true,
      sourceDeclaredObservationsAreExternallyTrusted: false,
      actualCollectorCallbackInvocationCount: 0,
      actualCollectorInvoked: false,
      actualNetworkIoEstablished: false,
      permissionEstablished: false,
      credentialLeaseEstablished: false,
      rightsCleared: false,
      privacyCleared: false,
      externalTrustEstablished: false,
      contactabilityEstablished: false,
      resourceOwnerAuthorityEstablished: false,
      externalCapacityEstablished: false,
      capacityReserved: false,
      zeroInternalOpsEstablished: false,
      actualSideEffectCardinalityEstablished: false,
      actionAuthorized: false,
      internalHumanFallbackPermitted: false,
      humanQueueCreated: false,
      priceEstablished: false,
      guaranteeEstablished: false,
      settlementPermitted: false,
      moneyMovementEnabled: false,
      enabledCapabilityCount: 0,
      provenAuthorityCount: 0,
      enabledCapabilitiesSubsetOfProvenAuthority: true,
      consequenceReach: "NONE",
      collectorHash: rebuilt.collectorHash,
      totalAttemptOccurrenceCount:
        rebuilt.attemptCensus.totalAttemptOccurrenceCount,
      uniqueAttemptObjectCount: rebuilt.attemptCensus.uniqueAttemptObjectCount,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      error: null,
      boundary: OUTSIDER_ROUTE_DISCOVERY_COLLECTOR_V1_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
