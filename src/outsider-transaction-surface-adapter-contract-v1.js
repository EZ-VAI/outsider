/*
 * Outcome Formation Engine: transaction-surface adapter contract v1.
 *
 * This pure module describes the exact structural boundary a source-specific
 * transaction adapter must expose before an execution layer may even consider
 * using it.  It performs no discovery, delivery, observation, reservation,
 * cancellation, revocation, credential handling, browser automation, network
 * access, filesystem access, pricing, or settlement.
 *
 * A conforming artifact is only a caller-pinned description.  Implementation
 * hashes, package hashes, transport profiles, input contracts, and capability
 * declarations do not establish that the adapter is installed, reachable,
 * permitted, controlled by an owner, supplied with a valid credential lease,
 * able to contact a resource, or able to reserve capacity.  Those facts must
 * arrive through separately replayed sources at the execution boundary.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArrayMap = Function.prototype.call.bind(Array.prototype.map);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const BufferByteLength = Buffer.byteLength;
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const MapConstructor = Map;
const MapGet = Function.prototype.call.bind(Map.prototype.get);
const MapHas = Function.prototype.call.bind(Map.prototype.has);
const MapSet = Function.prototype.call.bind(Map.prototype.set);
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
const TypeErrorConstructor = TypeError;

const PREFIX = "OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

const MAX_TRANSPORT_PROFILES = 32;
const MAX_ARRAY_LENGTH = 256;
const MAX_TREE_DEPTH = 48;
const MAX_TREE_NODES = 8_192;
const MAX_TREE_KEYS = 32_768;
const MAX_SINGLE_STRING_BYTES = 4_096;
const MAX_AGGREGATE_STRING_BYTES = 256 * 1_024;
const MAX_SIDE_EFFECTS_PER_TENDER = 5;

export const OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS
  = ObjectFreeze({
    transportProfile:
      "outsider/transaction-surface-versioned-transport-profile/v1",
    capabilityDeclaration:
      "outsider/transaction-surface-adapter-capability-declaration/v1",
    inputContracts:
      "outsider/transaction-surface-adapter-input-contracts/v1",
    contract: "outsider/transaction-surface-adapter-contract/v1",
    sourcePin: "outsider/transaction-surface-adapter-contract-source-pin/v1",
    verification:
      "outsider/transaction-surface-adapter-contract-verification/v1",
  });

export const OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_LIMITS
  = ObjectFreeze({
    maximumTransportProfiles: MAX_TRANSPORT_PROFILES,
    maximumArrayLength: MAX_ARRAY_LENGTH,
    maximumTreeDepth: MAX_TREE_DEPTH,
    maximumTreeNodes: MAX_TREE_NODES,
    maximumTreeKeys: MAX_TREE_KEYS,
    maximumSingleStringBytes: MAX_SINGLE_STRING_BYTES,
    maximumAggregateStringBytes: MAX_AGGREGATE_STRING_BYTES,
    maximumSideEffectsPerTender: MAX_SIDE_EFFECTS_PER_TENDER,
  });

export const OUTSIDER_TRANSACTION_SURFACE_TRANSPORT_FAMILIES_V1
  = ObjectFreeze([
    "USER_HELD_ACCOUNT_API",
    "OFFICIAL_PROVIDER_API",
    "APPROVED_MCP",
    "MARKETPLACE_BUYER_API",
    "PROVIDER_OWNED_TRANSACTION_API",
    "PERMISSIONED_MAILBOX",
  ]);

export const OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1 = ObjectFreeze([
  "PERMITTED_ROUTE_DISCOVERY",
  "STRUCTURED_QUOTE_REQUEST",
  "STRICT_QUOTE_OBSERVATION",
  "ONE_USE_TENDER_DELIVERY",
  "STRICT_RESPONSE_OBSERVATION",
  "CAPACITY_RESERVATION_REQUEST",
  "RESERVATION_CANCELLATION",
  "PERMISSION_REVOCATION",
]);

const EFFECT_CAPABILITIES = ObjectFreeze([
  "STRUCTURED_QUOTE_REQUEST",
  "ONE_USE_TENDER_DELIVERY",
  "CAPACITY_RESERVATION_REQUEST",
  "RESERVATION_CANCELLATION",
  "PERMISSION_REVOCATION",
]);

export const OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_BOUNDARY
  = deepFreeze({
    position:
      "SOURCE_SPECIFIC_TRANSACTION_ADAPTER_STRUCTURAL_CONFORMANCE_HOLD_ONLY",
    sourceSpecificAdapterDescription: true,
    domainAgnosticCoreContract: true,
    providerEnrollmentRequired: false,
    genericArbitraryUrlDriverPermitted: false,
    genericBrowserDriverPermitted: false,
    transportProfileAllowlistRequired: true,
    exactImplementationHashRequired: true,
    exactPackageProfileHashRequired: true,
    versionedTransportProfilesRequired: true,
    permissionInputContractRequired: true,
    credentialLeaseInputContractRequired: true,
    rightsInputContractRequired: true,
    privacyInputContractRequired: true,
    oneUseIdempotencyNonceAndDeadlineRequired: true,
    finiteSideEffectCardinalityRequired: true,
    durableSideEffectLedgerRequiredAtExecutionBoundary: true,
    contractArtifactEnforcesRuntimeSideEffectLedger: false,
    rawCredentialMaterialAccepted: false,
    credentialLocatorProjected: false,
    rawTransactionSourceProjected: false,
    privateAdapterInstanceIdentifierProjected: false,
    privateProjectionNonceProjected: false,
    structuralConformanceMintsRights: false,
    structuralConformanceMintsOwnerAuthority: false,
    structuralConformanceEstablishesMailboxOwnership: false,
    structuralConformanceEstablishesAccountOwnership: false,
    structuralConformanceEstablishesContactability: false,
    structuralConformanceEstablishesCapacity: false,
    structuralConformanceEstablishesZeroInternalOps: false,
    structuralConformanceEnablesAction: false,
    structuralConformanceEnablesPricing: false,
    structuralConformanceEnablesGuarantee: false,
    structuralConformanceEnablesSettlement: false,
    permissionEstablished: false,
    credentialLeaseEstablished: false,
    rightsEstablished: false,
    privacyEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    mailboxOwnershipEstablished: false,
    accountOwnershipEstablished: false,
    contactabilityEstablished: false,
    externalCapacityEstablished: false,
    zeroInternalOpsEstablished: false,
    networkIoPerformed: false,
    filesystemIoPerformed: false,
    browserAutomationPerformed: false,
    providerContactPerformed: false,
    tenderDelivered: false,
    responseObserved: false,
    capacityReserved: false,
    cancellationPerformed: false,
    revocationPerformed: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    authority: "NONE",
    decisionState: "HOLD",
    decision: "HOLD",
    actionReady: false,
    executable: false,
  });

const SOURCE_FIELDS = ObjectFreeze([
  "observedAt",
  "privateAdapterInstanceRefHash",
  "privateProjectionNonce",
  "adapterClosure",
  "supportedTransportProfiles",
  "inputContracts",
  "oneUseControls",
  "capabilityDeclarations",
  "maximumAggregateSideEffectsPerTender",
]);
const ADAPTER_CLOSURE_FIELDS = ObjectFreeze([
  "adapterImplementationHash", "adapterPackageProfileHash",
]);
const TRANSPORT_PROFILE_FIELDS = ObjectFreeze([
  "transportProfileRefHash", "transportFamily", "profileVersion",
  "requestSchemaHash", "responseSchemaHash", "lifecycleSchemaHash",
  "strictFiniteResponseGrammarRequired", "naturalLanguageResponseAccepted",
  "serverAcknowledgementIsAcceptance", "deliveryReceiptIsAcceptance",
  "arbitraryUrlExecutionPermitted", "genericBrowserDriverPermitted",
]);
const INPUT_CONTRACTS_FIELDS = ObjectFreeze([
  "permission", "credentialLease", "rights", "privacy",
]);
const PERMISSION_FIELDS = ObjectFreeze([
  "inputSchemaHash", "replayVerifierImplementationHash",
  "lifecycleHeadSchemaHash", "appendOnlyLifecycleRequired",
  "currentGrantRequiredAtEachEffect", "revocationFailClosed",
  "callerDeclarationAloneSufficient",
]);
const CREDENTIAL_LEASE_FIELDS = ObjectFreeze([
  "inputSchemaHash", "replayVerifierImplementationHash",
  "leaseReceiptSchemaHash", "finiteExpiryRequired", "exactScopeRequired",
  "revalidationAtEachCredentialedEffect", "rawCredentialMaterialProjected",
  "callerDeclarationAloneSufficient",
]);
const RIGHTS_FIELDS = ObjectFreeze([
  "inputSchemaHash", "replayVerifierImplementationHash",
  "reviewReceiptSchemaHash", "sourceRevisionPinRequired",
  "purposeAndJurisdictionBound", "revocationReplayRequired",
  "callerDeclarationAloneSufficient",
]);
const PRIVACY_FIELDS = ObjectFreeze([
  "inputSchemaHash", "replayVerifierImplementationHash",
  "reviewReceiptSchemaHash", "dataMinimizationRequired",
  "privateIdentifierProjectionAllowed", "rawSourceProjectionAllowed",
  "callerDeclarationAloneSufficient",
]);
const ONE_USE_CONTROL_FIELDS = ObjectFreeze([
  "oneTenderScopeRequired", "idempotencyKeyHashRequired",
  "idempotencyObservedBeforeEffectRequired", "nonceHashRequired",
  "nonceReservationBeforeEffectRequired", "nonceSingleConsumptionRequired",
  "consumedNonceReplayRejected", "exactFormationDeadlineRequired",
  "newFormationEffectsAfterDeadlineForbidden",
  "lateResponseCannotFormCommitment",
  "reservationRequiresExplicitBoundResponse",
  "cancellationRequiresReservationBinding",
  "revocationRequiresPermissionLifecycleBinding",
  "cancellationAndRevocationIdempotent", "terminalStateCannotReopen",
  "standingCapacityInferred",
]);
const CAPABILITY_FIELDS = ObjectFreeze([
  "capability", "supported", "transportProfileRefHashes",
  "maximumSideEffectsPerTender",
]);
const VERIFY_INPUT_FIELDS = ObjectFreeze([
  "source", "expectedSourceHash", "expectedContractHash",
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

/* This runs before canonicalization or hashing.  It rejects proxies without
 * touching their traps, accessors without invoking them, exotic containers,
 * sparse/decorated arrays, shared/cyclic graphs, and oversized trees. */
function hostilePreflight(value) {
  const seen = new SetConstructor();
  const budget = { nodes: 0, keys: 0, stringBytes: 0 };

  function walk(current, depth) {
    if (depth > MAX_TREE_DEPTH) fail("SOURCE_TREE_TOO_DEEP");
    if (current === null || typeof current === "boolean") return;
    if (typeof current === "string") {
      const bytes = BufferByteLength(current, "utf8");
      if (bytes > MAX_SINGLE_STRING_BYTES) fail("SOURCE_STRING_TOO_LARGE");
      budget.stringBytes += bytes;
      if (budget.stringBytes > MAX_AGGREGATE_STRING_BYTES) {
        fail("SOURCE_STRING_BUDGET_EXCEEDED");
      }
      return;
    }
    if (typeof current === "number") {
      if (!NumberIsFinite(current) || !NumberIsSafeInteger(current)
        || ObjectIs(current, -0)) fail("SOURCE_NUMBER_INVALID");
      return;
    }
    if (typeof current !== "object") fail("SOURCE_VALUE_TYPE_INVALID");
    if (isProxy(current)) fail("SOURCE_PROXY_FORBIDDEN");
    if (SetHas(seen, current)) fail("SOURCE_SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
    SetAdd(seen, current);
    budget.nodes += 1;
    if (budget.nodes > MAX_TREE_NODES) fail("SOURCE_TREE_NODE_BUDGET_EXCEEDED");

    const prototype = ObjectGetPrototypeOf(current);
    const descriptors = ObjectGetOwnPropertyDescriptors(current);
    const keys = ReflectOwnKeys(descriptors);
    budget.keys += keys.length;
    if (budget.keys > MAX_TREE_KEYS) fail("SOURCE_TREE_KEY_BUDGET_EXCEEDED");

    if (ArrayIsArray(current)) {
      if (prototype !== ArrayPrototype || current.length > MAX_ARRAY_LENGTH
        || keys.length !== current.length + 1) {
        fail("SOURCE_DENSE_ARRAY_REQUIRED");
      }
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !ObjectHasOwn(lengthDescriptor, "value")) {
        fail("SOURCE_DENSE_ARRAY_REQUIRED");
      }
      for (let index = 0; index < current.length; index += 1) {
        const descriptor = descriptors[StringConstructor(index)];
        if (!descriptor || !ObjectHasOwn(descriptor, "value")
          || descriptor.enumerable !== true) fail("SOURCE_DENSE_ARRAY_REQUIRED");
        walk(descriptor.value, depth + 1);
      }
      return;
    }

    if (prototype !== ObjectPrototype && prototype !== null) {
      fail("SOURCE_PLAIN_OBJECT_REQUIRED");
    }
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = descriptors[key];
      if (typeof key !== "string" || !descriptor
        || !ObjectHasOwn(descriptor, "value")
        || descriptor.enumerable !== true) fail("SOURCE_DATA_FIELDS_REQUIRED");
      walk(descriptor.value, depth + 1);
    }
  }

  walk(value, 0);
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

function denseArray(value, code, maximum = MAX_ARRAY_LENGTH) {
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

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function iso(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)
    || !NumberIsFinite(DateParse(value))
    || DateToISOString(new DateConstructor(value)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function semver(value, code) {
  if (typeof value !== "string" || !RegExpTest(SEMVER, value)) {
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

function literal(value, expected, code) {
  if (value !== expected) fail(code);
  return value;
}

function boolean(value, code) {
  if (typeof value !== "boolean") fail(`${code}_INVALID`);
  return value;
}

function boundedInteger(value, minimum, maximum, code) {
  if (!NumberIsSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function normalizeAdapterClosure(value) {
  exactObject(value, ADAPTER_CLOSURE_FIELDS, "ADAPTER_CLOSURE");
  return {
    adapterImplementationHash: hash(value.adapterImplementationHash,
      "ADAPTER_IMPLEMENTATION_HASH"),
    adapterPackageProfileHash: hash(value.adapterPackageProfileHash,
      "ADAPTER_PACKAGE_PROFILE_HASH"),
  };
}

function normalizeTransportProfile(value) {
  exactObject(value, TRANSPORT_PROFILE_FIELDS, "TRANSPORT_PROFILE");
  const body = {
    schema: OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS
      .transportProfile,
    transportProfileRefHash: hash(value.transportProfileRefHash,
      "TRANSPORT_PROFILE_REF_HASH"),
    transportFamily: oneOf(value.transportFamily,
      OUTSIDER_TRANSACTION_SURFACE_TRANSPORT_FAMILIES_V1,
      "TRANSPORT_FAMILY"),
    profileVersion: semver(value.profileVersion, "TRANSPORT_PROFILE_VERSION"),
    requestSchemaHash: hash(value.requestSchemaHash,
      "TRANSPORT_REQUEST_SCHEMA_HASH"),
    responseSchemaHash: hash(value.responseSchemaHash,
      "TRANSPORT_RESPONSE_SCHEMA_HASH"),
    lifecycleSchemaHash: hash(value.lifecycleSchemaHash,
      "TRANSPORT_LIFECYCLE_SCHEMA_HASH"),
    strictFiniteResponseGrammarRequired: literal(
      value.strictFiniteResponseGrammarRequired, true,
      "TRANSPORT_STRICT_FINITE_RESPONSE_GRAMMAR_REQUIRED"),
    naturalLanguageResponseAccepted: literal(
      value.naturalLanguageResponseAccepted, false,
      "TRANSPORT_NATURAL_LANGUAGE_RESPONSE_FORBIDDEN"),
    serverAcknowledgementIsAcceptance: literal(
      value.serverAcknowledgementIsAcceptance, false,
      "TRANSPORT_SERVER_ACK_ACCEPTANCE_FORBIDDEN"),
    deliveryReceiptIsAcceptance: literal(value.deliveryReceiptIsAcceptance,
      false, "TRANSPORT_DELIVERY_RECEIPT_ACCEPTANCE_FORBIDDEN"),
    arbitraryUrlExecutionPermitted: literal(
      value.arbitraryUrlExecutionPermitted, false,
      "TRANSPORT_ARBITRARY_URL_EXECUTION_FORBIDDEN"),
    genericBrowserDriverPermitted: literal(value.genericBrowserDriverPermitted,
      false, "TRANSPORT_GENERIC_BROWSER_DRIVER_FORBIDDEN"),
  };
  return {
    ...body,
    transportProfileHash: digest(
      OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS
        .transportProfile,
      body),
  };
}

function normalizeTransportProfiles(value) {
  denseArray(value, "TRANSPORT_PROFILES", MAX_TRANSPORT_PROFILES);
  if (value.length === 0) fail("TRANSPORT_PROFILES_EMPTY");
  const normalized = [];
  for (let index = 0; index < value.length; index += 1) {
    append(normalized, normalizeTransportProfile(value[index]));
  }
  ArraySort(normalized, (left, right) => (
    left.transportProfileRefHash < right.transportProfileRefHash ? -1
      : left.transportProfileRefHash > right.transportProfileRefHash ? 1 : 0));
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index - 1].transportProfileRefHash
      === normalized[index].transportProfileRefHash) {
      fail("TRANSPORT_PROFILE_REF_HASH_DUPLICATE");
    }
  }
  return normalized;
}

function normalizePermissionInput(value) {
  exactObject(value, PERMISSION_FIELDS, "PERMISSION_INPUT_CONTRACT");
  return {
    inputSchemaHash: hash(value.inputSchemaHash,
      "PERMISSION_INPUT_SCHEMA_HASH"),
    replayVerifierImplementationHash: hash(
      value.replayVerifierImplementationHash,
      "PERMISSION_REPLAY_VERIFIER_IMPLEMENTATION_HASH"),
    lifecycleHeadSchemaHash: hash(value.lifecycleHeadSchemaHash,
      "PERMISSION_LIFECYCLE_HEAD_SCHEMA_HASH"),
    appendOnlyLifecycleRequired: literal(value.appendOnlyLifecycleRequired,
      true, "PERMISSION_APPEND_ONLY_LIFECYCLE_REQUIRED"),
    currentGrantRequiredAtEachEffect: literal(
      value.currentGrantRequiredAtEachEffect, true,
      "PERMISSION_CURRENT_GRANT_AT_EFFECT_REQUIRED"),
    revocationFailClosed: literal(value.revocationFailClosed, true,
      "PERMISSION_REVOCATION_MUST_FAIL_CLOSED"),
    callerDeclarationAloneSufficient: literal(
      value.callerDeclarationAloneSufficient, false,
      "PERMISSION_CALLER_DECLARATION_SUFFICIENT_FORBIDDEN"),
  };
}

function normalizeCredentialLeaseInput(value) {
  exactObject(value, CREDENTIAL_LEASE_FIELDS,
    "CREDENTIAL_LEASE_INPUT_CONTRACT");
  return {
    inputSchemaHash: hash(value.inputSchemaHash,
      "CREDENTIAL_LEASE_INPUT_SCHEMA_HASH"),
    replayVerifierImplementationHash: hash(
      value.replayVerifierImplementationHash,
      "CREDENTIAL_LEASE_REPLAY_VERIFIER_IMPLEMENTATION_HASH"),
    leaseReceiptSchemaHash: hash(value.leaseReceiptSchemaHash,
      "CREDENTIAL_LEASE_RECEIPT_SCHEMA_HASH"),
    finiteExpiryRequired: literal(value.finiteExpiryRequired, true,
      "CREDENTIAL_LEASE_FINITE_EXPIRY_REQUIRED"),
    exactScopeRequired: literal(value.exactScopeRequired, true,
      "CREDENTIAL_LEASE_EXACT_SCOPE_REQUIRED"),
    revalidationAtEachCredentialedEffect: literal(
      value.revalidationAtEachCredentialedEffect, true,
      "CREDENTIAL_LEASE_REVALIDATION_AT_EFFECT_REQUIRED"),
    rawCredentialMaterialProjected: literal(
      value.rawCredentialMaterialProjected, false,
      "CREDENTIAL_LEASE_RAW_MATERIAL_PROJECTION_FORBIDDEN"),
    callerDeclarationAloneSufficient: literal(
      value.callerDeclarationAloneSufficient, false,
      "CREDENTIAL_LEASE_CALLER_DECLARATION_SUFFICIENT_FORBIDDEN"),
  };
}

function normalizeRightsInput(value) {
  exactObject(value, RIGHTS_FIELDS, "RIGHTS_INPUT_CONTRACT");
  return {
    inputSchemaHash: hash(value.inputSchemaHash, "RIGHTS_INPUT_SCHEMA_HASH"),
    replayVerifierImplementationHash: hash(
      value.replayVerifierImplementationHash,
      "RIGHTS_REPLAY_VERIFIER_IMPLEMENTATION_HASH"),
    reviewReceiptSchemaHash: hash(value.reviewReceiptSchemaHash,
      "RIGHTS_REVIEW_RECEIPT_SCHEMA_HASH"),
    sourceRevisionPinRequired: literal(value.sourceRevisionPinRequired, true,
      "RIGHTS_SOURCE_REVISION_PIN_REQUIRED"),
    purposeAndJurisdictionBound: literal(value.purposeAndJurisdictionBound,
      true, "RIGHTS_PURPOSE_AND_JURISDICTION_BINDING_REQUIRED"),
    revocationReplayRequired: literal(value.revocationReplayRequired, true,
      "RIGHTS_REVOCATION_REPLAY_REQUIRED"),
    callerDeclarationAloneSufficient: literal(
      value.callerDeclarationAloneSufficient, false,
      "RIGHTS_CALLER_DECLARATION_SUFFICIENT_FORBIDDEN"),
  };
}

function normalizePrivacyInput(value) {
  exactObject(value, PRIVACY_FIELDS, "PRIVACY_INPUT_CONTRACT");
  return {
    inputSchemaHash: hash(value.inputSchemaHash, "PRIVACY_INPUT_SCHEMA_HASH"),
    replayVerifierImplementationHash: hash(
      value.replayVerifierImplementationHash,
      "PRIVACY_REPLAY_VERIFIER_IMPLEMENTATION_HASH"),
    reviewReceiptSchemaHash: hash(value.reviewReceiptSchemaHash,
      "PRIVACY_REVIEW_RECEIPT_SCHEMA_HASH"),
    dataMinimizationRequired: literal(value.dataMinimizationRequired, true,
      "PRIVACY_DATA_MINIMIZATION_REQUIRED"),
    privateIdentifierProjectionAllowed: literal(
      value.privateIdentifierProjectionAllowed, false,
      "PRIVACY_PRIVATE_IDENTIFIER_PROJECTION_FORBIDDEN"),
    rawSourceProjectionAllowed: literal(value.rawSourceProjectionAllowed,
      false, "PRIVACY_RAW_SOURCE_PROJECTION_FORBIDDEN"),
    callerDeclarationAloneSufficient: literal(
      value.callerDeclarationAloneSufficient, false,
      "PRIVACY_CALLER_DECLARATION_SUFFICIENT_FORBIDDEN"),
  };
}

function normalizeInputContracts(value) {
  exactObject(value, INPUT_CONTRACTS_FIELDS, "INPUT_CONTRACTS");
  const body = {
    schema:
      OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS.inputContracts,
    permission: normalizePermissionInput(value.permission),
    credentialLease: normalizeCredentialLeaseInput(value.credentialLease),
    rights: normalizeRightsInput(value.rights),
    privacy: normalizePrivacyInput(value.privacy),
  };
  return {
    ...body,
    inputContractsHash: digest(
      OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS.inputContracts,
      body),
  };
}

function normalizeOneUseControls(value) {
  exactObject(value, ONE_USE_CONTROL_FIELDS, "ONE_USE_CONTROLS");
  return {
    oneTenderScopeRequired: literal(value.oneTenderScopeRequired, true,
      "ONE_USE_ONE_TENDER_SCOPE_REQUIRED"),
    idempotencyKeyHashRequired: literal(value.idempotencyKeyHashRequired, true,
      "ONE_USE_IDEMPOTENCY_KEY_HASH_REQUIRED"),
    idempotencyObservedBeforeEffectRequired: literal(
      value.idempotencyObservedBeforeEffectRequired, true,
      "ONE_USE_IDEMPOTENCY_OBSERVATION_BEFORE_EFFECT_REQUIRED"),
    nonceHashRequired: literal(value.nonceHashRequired, true,
      "ONE_USE_NONCE_HASH_REQUIRED"),
    nonceReservationBeforeEffectRequired: literal(
      value.nonceReservationBeforeEffectRequired, true,
      "ONE_USE_NONCE_RESERVATION_BEFORE_EFFECT_REQUIRED"),
    nonceSingleConsumptionRequired: literal(value.nonceSingleConsumptionRequired,
      true, "ONE_USE_NONCE_SINGLE_CONSUMPTION_REQUIRED"),
    consumedNonceReplayRejected: literal(value.consumedNonceReplayRejected,
      true, "ONE_USE_CONSUMED_NONCE_REPLAY_REJECTION_REQUIRED"),
    exactFormationDeadlineRequired: literal(value.exactFormationDeadlineRequired,
      true, "ONE_USE_EXACT_FORMATION_DEADLINE_REQUIRED"),
    newFormationEffectsAfterDeadlineForbidden: literal(
      value.newFormationEffectsAfterDeadlineForbidden, true,
      "ONE_USE_NEW_EFFECTS_AFTER_DEADLINE_FORBIDDEN"),
    lateResponseCannotFormCommitment: literal(
      value.lateResponseCannotFormCommitment, true,
      "ONE_USE_LATE_RESPONSE_COMMITMENT_FORBIDDEN"),
    reservationRequiresExplicitBoundResponse: literal(
      value.reservationRequiresExplicitBoundResponse, true,
      "ONE_USE_RESERVATION_EXPLICIT_BOUND_RESPONSE_REQUIRED"),
    cancellationRequiresReservationBinding: literal(
      value.cancellationRequiresReservationBinding, true,
      "ONE_USE_CANCELLATION_RESERVATION_BINDING_REQUIRED"),
    revocationRequiresPermissionLifecycleBinding: literal(
      value.revocationRequiresPermissionLifecycleBinding, true,
      "ONE_USE_REVOCATION_PERMISSION_LIFECYCLE_BINDING_REQUIRED"),
    cancellationAndRevocationIdempotent: literal(
      value.cancellationAndRevocationIdempotent, true,
      "ONE_USE_CANCELLATION_REVOCATION_IDEMPOTENCY_REQUIRED"),
    terminalStateCannotReopen: literal(value.terminalStateCannotReopen, true,
      "ONE_USE_TERMINAL_STATE_REOPEN_FORBIDDEN"),
    standingCapacityInferred: literal(value.standingCapacityInferred, false,
      "ONE_USE_STANDING_CAPACITY_INFERENCE_FORBIDDEN"),
  };
}

function isEffectCapability(capability) {
  for (let index = 0; index < EFFECT_CAPABILITIES.length; index += 1) {
    if (EFFECT_CAPABILITIES[index] === capability) return true;
  }
  return false;
}

function profileRefSet(profiles) {
  const result = new SetConstructor();
  for (let index = 0; index < profiles.length; index += 1) {
    SetAdd(result, profiles[index].transportProfileRefHash);
  }
  return result;
}

function normalizeCapability(value, knownProfiles) {
  exactObject(value, CAPABILITY_FIELDS, "CAPABILITY_DECLARATION");
  const capability = oneOf(value.capability,
    OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1, "CAPABILITY_CODE");
  const supported = boolean(value.supported, "CAPABILITY_SUPPORTED");
  const references = denseArray(value.transportProfileRefHashes,
    "CAPABILITY_TRANSPORT_PROFILE_REFS", MAX_TRANSPORT_PROFILES);
  const normalizedReferences = [];
  for (let index = 0; index < references.length; index += 1) {
    const reference = hash(references[index],
      "CAPABILITY_TRANSPORT_PROFILE_REF_HASH");
    if (!SetHas(knownProfiles, reference)) {
      fail("CAPABILITY_TRANSPORT_PROFILE_REF_UNKNOWN");
    }
    append(normalizedReferences, reference);
  }
  ArraySort(normalizedReferences);
  for (let index = 1; index < normalizedReferences.length; index += 1) {
    if (normalizedReferences[index - 1] === normalizedReferences[index]) {
      fail("CAPABILITY_TRANSPORT_PROFILE_REF_DUPLICATE");
    }
  }
  if (supported && normalizedReferences.length === 0) {
    fail("SUPPORTED_CAPABILITY_TRANSPORT_PROFILE_REQUIRED");
  }
  if (!supported && normalizedReferences.length !== 0) {
    fail("UNSUPPORTED_CAPABILITY_TRANSPORT_PROFILE_FORBIDDEN");
  }
  const expectedMaximum = supported && isEffectCapability(capability) ? 1 : 0;
  const maximumSideEffectsPerTender = boundedInteger(
    value.maximumSideEffectsPerTender, 0, 1,
    "CAPABILITY_MAXIMUM_SIDE_EFFECTS_PER_TENDER");
  if (maximumSideEffectsPerTender !== expectedMaximum) {
    fail("CAPABILITY_SIDE_EFFECT_CARDINALITY_INVALID");
  }
  const body = {
    schema: OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS
      .capabilityDeclaration,
    capability,
    supported,
    transportProfileRefHashes: normalizedReferences,
    maximumSideEffectsPerTender,
    declarationOnly: true,
    actualPermissionEstablished: false,
    actualCapabilityEstablished: false,
    actionEnabled: false,
  };
  return {
    ...body,
    capabilityDeclarationHash: digest(
      OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS
        .capabilityDeclaration,
      body),
  };
}

function normalizeCapabilities(value, profiles) {
  denseArray(value, "CAPABILITY_DECLARATIONS",
    OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1.length);
  if (value.length !== OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1.length) {
    fail("CAPABILITY_DECLARATIONS_INCOMPLETE");
  }
  const knownProfiles = profileRefSet(profiles);
  const byCapability = new MapConstructor();
  for (let index = 0; index < value.length; index += 1) {
    const normalized = normalizeCapability(value[index], knownProfiles);
    if (MapHas(byCapability, normalized.capability)) {
      fail("CAPABILITY_DECLARATION_DUPLICATE");
    }
    MapSet(byCapability, normalized.capability, normalized);
  }
  const result = [];
  for (let index = 0;
    index < OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1.length;
    index += 1) {
    const capability = OUTSIDER_TRANSACTION_SURFACE_CAPABILITIES_V1[index];
    if (!MapHas(byCapability, capability)) {
      fail("CAPABILITY_DECLARATIONS_INCOMPLETE");
    }
    append(result, MapGet(byCapability, capability));
  }
  return result;
}

function sideEffectCardinality(capabilities, expectedAggregate) {
  let aggregate = 0;
  const byCapability = new MapConstructor();
  for (let index = 0; index < capabilities.length; index += 1) {
    const declaration = capabilities[index];
    MapSet(byCapability, declaration.capability,
      declaration.maximumSideEffectsPerTender);
    aggregate += declaration.maximumSideEffectsPerTender;
  }
  boundedInteger(expectedAggregate, 0, MAX_SIDE_EFFECTS_PER_TENDER,
    "MAXIMUM_AGGREGATE_SIDE_EFFECTS_PER_TENDER");
  if (aggregate !== expectedAggregate) {
    fail("AGGREGATE_SIDE_EFFECT_CARDINALITY_MISMATCH");
  }
  return {
    maximumAggregateSideEffectsPerTender: aggregate,
    maximumRouteDiscoverySideEffectsPerTender:
      MapGet(byCapability, "PERMITTED_ROUTE_DISCOVERY"),
    maximumQuoteRequestSideEffectsPerTender:
      MapGet(byCapability, "STRUCTURED_QUOTE_REQUEST"),
    maximumQuoteObservationSideEffectsPerTender:
      MapGet(byCapability, "STRICT_QUOTE_OBSERVATION"),
    maximumTenderDeliverySideEffectsPerTender:
      MapGet(byCapability, "ONE_USE_TENDER_DELIVERY"),
    maximumResponseObservationSideEffectsPerTender:
      MapGet(byCapability, "STRICT_RESPONSE_OBSERVATION"),
    maximumReservationRequestSideEffectsPerTender:
      MapGet(byCapability, "CAPACITY_RESERVATION_REQUEST"),
    maximumReservationCancellationSideEffectsPerTender:
      MapGet(byCapability, "RESERVATION_CANCELLATION"),
    maximumPermissionRevocationSideEffectsPerTender:
      MapGet(byCapability, "PERMISSION_REVOCATION"),
    occurrenceLedgerRequiredAtExecutionBoundary: true,
    objectDeduplicationCannotReduceOccurrenceCardinality: true,
    retriesCannotExceedDeclaredCardinality: true,
    contractArtifactPerformedSideEffectCount: 0,
    runtimeCardinalityEnforcedByThisArtifact: false,
  };
}

function capabilitySetHash(capabilities) {
  return digest("outsider/transaction-surface-adapter-capability-set/v1", {
    count: capabilities.length,
    capabilityDeclarationHashes: ArrayMap(capabilities,
      (value) => value.capabilityDeclarationHash),
  });
}

function transportProfileSetHash(profiles) {
  return digest("outsider/transaction-surface-transport-profile-set/v1", {
    count: profiles.length,
    transportProfileHashes: ArrayMap(profiles,
      (value) => value.transportProfileHash),
  });
}

function sourcePinFromPreflightedSource(source) {
  const canonicalSource = canonicalizeStrict(source);
  const body = {
    schema:
      OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS.sourcePin,
    schemaVersion: "1.0.0",
    sourceByteLength: BufferByteLength(canonicalSource, "utf8"),
    sourceHash: digest(
      "outsider/transaction-surface-adapter-contract-private-source/v1",
      source),
  };
  return deepFreeze(body);
}

export function createTransactionSurfaceAdapterContractSourcePinV1(source) {
  hostilePreflight(source);
  exactObject(source, SOURCE_FIELDS, "SOURCE");
  return sourcePinFromPreflightedSource(source);
}

export function createTransactionSurfaceAdapterContractV1(source) {
  hostilePreflight(source);
  exactObject(source, SOURCE_FIELDS, "SOURCE");
  iso(source.observedAt, "OBSERVED_AT");
  hash(source.privateAdapterInstanceRefHash,
    "PRIVATE_ADAPTER_INSTANCE_REF_HASH");
  hash(source.privateProjectionNonce, "PRIVATE_PROJECTION_NONCE");

  const adapterClosure = normalizeAdapterClosure(source.adapterClosure);
  const supportedTransportProfiles = normalizeTransportProfiles(
    source.supportedTransportProfiles);
  const inputContracts = normalizeInputContracts(source.inputContracts);
  const oneUseControls = normalizeOneUseControls(source.oneUseControls);
  const capabilityDeclarations = normalizeCapabilities(
    source.capabilityDeclarations, supportedTransportProfiles);
  const cardinality = sideEffectCardinality(capabilityDeclarations,
    source.maximumAggregateSideEffectsPerTender);

  const body = {
    schema: OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS.contract,
    schemaVersion: "1.0.0",
    recordClass: "SOURCE_SPECIFIC_TRANSACTION_SURFACE_ADAPTER_CONTRACT",
    observedAt: source.observedAt,
    adapterClosure,
    supportedTransportProfiles,
    transportProfileSetHash: transportProfileSetHash(
      supportedTransportProfiles),
    inputContracts,
    oneUseControls,
    capabilityDeclarations,
    capabilitySetHash: capabilitySetHash(capabilityDeclarations),
    sideEffectCardinality: cardinality,
    privateAdapterInstanceIdentifierProjected: false,
    privateProjectionNonceProjected: false,
    rawCredentialMaterialProjected: false,
    rawTransactionSourceProjected: false,
    sourceRebuildRequiredForVerification: true,
    outputOnlyOrResealedVerificationAccepted: false,
    structuralConformanceVerified: true,
    structuralConformanceMintsRights: false,
    structuralConformanceMintsOwnerAuthority: false,
    structuralConformanceEstablishesMailboxOwnership: false,
    structuralConformanceEstablishesAccountOwnership: false,
    structuralConformanceEstablishesContactability: false,
    structuralConformanceEstablishesCapacity: false,
    structuralConformanceEstablishesZeroInternalOps: false,
    permissionEstablished: false,
    credentialLeaseEstablished: false,
    rightsEstablished: false,
    privacyEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    mailboxOwnershipEstablished: false,
    accountOwnershipEstablished: false,
    contactabilityEstablished: false,
    externalCapacityEstablished: false,
    zeroInternalOpsEstablished: false,
    networkIoPerformed: false,
    filesystemIoPerformed: false,
    browserAutomationPerformed: false,
    providerContactPerformed: false,
    tenderDelivered: false,
    responseObserved: false,
    capacityReserved: false,
    cancellationPerformed: false,
    revocationPerformed: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    authority: "NONE",
    decisionState: "HOLD",
    decision: "HOLD",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_BOUNDARY,
  };
  return deepFreeze({
    ...body,
    contractHash: digest(
      OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS.contract,
      body),
  });
}

export function verifyTransactionSurfaceAdapterContractV1(record, input) {
  hostilePreflight(record);
  hostilePreflight(input);
  exactObject(input, VERIFY_INPUT_FIELDS, "VERIFY_INPUT");
  const expectedSourceHash = hash(input.expectedSourceHash,
    "EXPECTED_SOURCE_HASH");
  const expectedContractHash = hash(input.expectedContractHash,
    "EXPECTED_CONTRACT_HASH");
  const sourcePin = createTransactionSurfaceAdapterContractSourcePinV1(
    input.source);
  if (sourcePin.sourceHash !== expectedSourceHash) {
    fail("EXPECTED_SOURCE_HASH_MISMATCH");
  }
  const rebuilt = createTransactionSurfaceAdapterContractV1(input.source);
  if (rebuilt.contractHash !== expectedContractHash) {
    fail("EXPECTED_CONTRACT_HASH_MISMATCH");
  }
  if (!same(record, rebuilt)) fail("RECORD_SOURCE_REBUILD_MISMATCH");

  const body = {
    schema:
      OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS.verification,
    schemaVersion: "1.0.0",
    ok: true,
    hostilePreflightPassed: true,
    exactPrivateSourceHashVerified: true,
    sourceRebuildVerified: true,
    exactContractHashVerified: true,
    privateAdapterInstanceIdentifierProjected: false,
    privateProjectionNonceProjected: false,
    structuralConformanceVerified: true,
    structuralConformanceMintsRights: false,
    structuralConformanceMintsOwnerAuthority: false,
    structuralConformanceEstablishesMailboxOwnership: false,
    structuralConformanceEstablishesAccountOwnership: false,
    structuralConformanceEstablishesContactability: false,
    structuralConformanceEstablishesCapacity: false,
    structuralConformanceEstablishesZeroInternalOps: false,
    permissionEstablished: false,
    credentialLeaseEstablished: false,
    rightsEstablished: false,
    privacyEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    mailboxOwnershipEstablished: false,
    accountOwnershipEstablished: false,
    contactabilityEstablished: false,
    externalCapacityEstablished: false,
    zeroInternalOpsEstablished: false,
    liveIoPerformed: false,
    actionAuthorized: false,
    priceEstablished: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    contractHash: rebuilt.contractHash,
    authority: "NONE",
    decisionState: "HOLD",
    decision: "HOLD",
    actionReady: false,
    executable: false,
  };
  return deepFreeze({
    ...body,
    verificationHash: digest(
      OUTSIDER_TRANSACTION_SURFACE_ADAPTER_CONTRACT_V1_SCHEMAS.verification,
      body),
  });
}
