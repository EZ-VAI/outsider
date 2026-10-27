/**
 * AUDITED_DRAFT_NOT_INTEGRATED.
 *
 * Capability-free structural contract for a future dedicated-OS-identity
 * lifecycle broker.  This module has no filesystem, path, operating-system,
 * process, network, native-addon, transport, signature, or deletion
 * capability.  Unknown caller fields are never enumerated and are not copied.
 * The sole production invocation is a zero-argument fixed typed HOLD.
 */

import { isProxy as nodeIsProxy } from "node:util/types";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const MaximumSafeInteger = Number.MAX_SAFE_INTEGER;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectCreate = Object.create;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectPrototype = Object.prototype;
const RegExpExec = Function.prototype.call.bind(RegExp.prototype.exec);
const SetConstructor = Set;
const SetPrototypeAdd = Function.prototype.call.bind(Set.prototype.add);
const SetPrototypeHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const StringToUpperCase = Function.prototype.call.bind(
  String.prototype.toUpperCase,
);
const TypeErrorConstructor = TypeError;
const IsProxy = nodeIsProxy;

const CONTRACT_PREFIX = "AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1";
const PRODUCTION_HOLD_CODE =
  `${CONTRACT_PREFIX}_AUDITED_DRAFT_NOT_INTEGRATED_HOLD`;

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CAPTURE_ID = /^snapshot_[a-f0-9]{32}$/u;
const OPERATION_ID = /^op_[a-f0-9]{32}$/u;
const PURGE_ID = /^purge_[a-f0-9]{32}$/u;
const BARRIER_ID = /^barrier_[a-f0-9]{32}$/u;
const DESCENDANT_ID = /^desc_[a-f0-9]{32}$/u;
const FIXED_ID = /^[A-Z][A-Z0-9_]{0,127}$/u;

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_LIMITS
  = ObjectFreeze({
    maximumRpcFrameBytes: 1_048_576,
    maximumStringCodeUnits: 512,
    maximumActiveLeasesInStructuralModel: 100_000,
    maximumDescendants: 100_000,
    descendantPageRows: 512,
    maximumCanonicalCensusBytesDeclared: 64 * 1024 * 1024,
    fixedRawRoleCount: 5,
  });

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS
  = ObjectFreeze({
    rpcRequest:
      "outsider/autonomous-work-order-lifecycle-broker-rpc-request/v1",
    rpcResponse:
      "outsider/autonomous-work-order-lifecycle-broker-rpc-response/v1",
    provisioning:
      "outsider/autonomous-work-order-lifecycle-broker-provisioning/v1",
    stateModel:
      "outsider/autonomous-work-order-lifecycle-broker-state-model/v1",
    stateEvent:
      "outsider/autonomous-work-order-lifecycle-broker-state-event/v1",
    barrier:
      "outsider/autonomous-work-order-lifecycle-drain-barrier/v1",
    zeroLeaseProof:
      "outsider/autonomous-work-order-lifecycle-zero-lease-proof/v1",
    registeredRawOperation:
      "outsider/autonomous-work-order-lifecycle-registered-raw-operation/v1",
    rawOperationJournalEntry:
      "outsider/autonomous-work-order-lifecycle-raw-operation-journal-entry/v1",
    descendantCensus:
      "outsider/autonomous-work-order-lifecycle-descendant-census/v1",
    purgeIntent:
      "outsider/autonomous-work-order-github-discovery-purge-intent/v3",
    purgeIntentBinding:
      "outsider/autonomous-work-order-lifecycle-purge-intent-binding/v1",
    deleteOperation:
      "outsider/autonomous-work-order-github-discovery-delete-operation/v1",
    executionReceipt:
      "outsider/autonomous-work-order-github-discovery-purge-execution-receipt/v1",
  });

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROTOCOL_V1
  = ObjectFreeze({
    protocol: "outsider/autonomous-work-order-lifecycle-broker-rpc/v1",
    protocolVersion: 1,
    framing: "UINT32_BE_LENGTH_PLUS_CANONICAL_UTF8_JSON",
    automaticVersionNegotiation: false,
    downgradeAllowed: false,
    callerPathAccepted: false,
    callerLeafNameAccepted: false,
    callerRawBytesAccepted: false,
    fileDescriptorAccepted: false,
    fileDescriptorReturned: false,
    descriptorTransferAllowed: false,
    unknownCallerFieldsEnumerated: false,
    unknownCallerFieldsForwarded: false,
    unknownCallerFieldsAffectModel: false,
    duplicateJsonKeysAccepted: false,
    productionTransportImplemented: false,
  });

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RPC_OPERATIONS_V1
  = ObjectFreeze([
    "CAPABILITIES",
    "INSPECT_CAPTURE_LIFECYCLE",
    "INSPECT_OPERATION",
    "REGISTER_CAPTURE",
    "RUN_REGISTERED_RAW_OPERATION",
    "RESERVE_DESCENDANT",
    "SEAL_DESCENDANT",
    "ABORT_DESCENDANT",
    "PREPARE_PURGE_DRAIN",
    "CERTIFY_ZERO",
    "RECORD_ELIGIBILITY",
    "SEAL_CENSUS",
    "COMMIT_PURGE_INTENT_AFTER_DRAIN",
    "RESUME_EXACT_PURGE",
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_READ_ONLY_RPC_OPERATIONS_V1
  = ObjectFreeze([
    "CAPABILITIES",
    "INSPECT_CAPTURE_LIFECYCLE",
    "INSPECT_OPERATION",
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_REGISTERED_RAW_OPERATIONS_V1
  = ObjectFreeze([
    "ACQUISITION_STRUCTURAL_REPLAY",
    "NETWORK_SAFE_PROJECTION_DERIVATION",
    "PRIVATE_BUNDLE_STRUCTURAL_VERIFICATION",
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RAW_SUBJECT_KINDS_V1
  = ObjectFreeze([
    "ACQUISITION_CAPTURE",
    "REGISTERED_DESCENDANT",
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RAW_ROLES_V1
  = ObjectFreeze([
    "ISSUE_BEFORE",
    "COMMENTS_SCAN_A",
    "ISSUE_MID",
    "COMMENTS_SCAN_B",
    "ISSUE_AFTER",
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RAW_LEAF_TABLE_V1
  = ObjectFreeze([
    ObjectFreeze({
      ordinal: 1,
      role: "ISSUE_BEFORE",
      leaf: "issue-before.json",
    }),
    ObjectFreeze({
      ordinal: 2,
      role: "COMMENTS_SCAN_A",
      leaf: "comments-scan-a.json",
    }),
    ObjectFreeze({
      ordinal: 3,
      role: "ISSUE_MID",
      leaf: "issue-mid.json",
    }),
    ObjectFreeze({
      ordinal: 4,
      role: "COMMENTS_SCAN_B",
      leaf: "comments-scan-b.json",
    }),
    ObjectFreeze({
      ordinal: 5,
      role: "ISSUE_AFTER",
      leaf: "issue-after.json",
    }),
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_LEASE_KINDS_V1
  = ObjectFreeze([
    "RAW_READ",
    "RAW_WRITE",
    "DERIVE",
    "PUBLISH",
    "DESCENDANT_WRITE",
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_JOURNAL_EVENTS_V1
  = ObjectFreeze([
    "GENESIS",
    "CAPTURE_GATE_BOUND",
    "LEASE_GRANTED",
    "LEASE_RELEASED",
    "DRAIN_BARRIER",
    "ZERO_LEASES_PROOF",
    "V3_PURGE_INTENT_BOUND",
    "PURGE_RECEIPT_BOUND",
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DUAL_JOURNAL_V1
  = ObjectFreeze({
    rawOperationJournal: ObjectFreeze({
      schema:
        AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS
          .rawOperationJournalEntry,
      journalVersion: 1,
      exactEntryFields: ObjectFreeze([
        "schema",
        "journalVersion",
        "sequence",
        "previousEntryHash",
        "requestId",
        "requestHash",
        "eventKind",
        "captureDirectoryId",
        "expectedLifecycleRegistryHeadHash",
        "payload",
        "entryHash",
      ]),
      canonicalBytesRequired: true,
      domainSeparatedHashRequired: true,
      continuousSequenceRequired: true,
      noClobberCommitRequired: true,
      directoryFsyncRequired: true,
      postCommitReplayRequired: true,
      implemented: false,
    }),
    lifecycleRegistry: ObjectFreeze({
      schema:
        "outsider/autonomous-work-order-github-discovery-lifecycle-registry-entry/v3",
      existingV3BytesRemainUnmodified: true,
      implemented: false,
    }),
    mutatingRpcExpectedGateJournalHeadHashRequired: true,
    mutatingRpcExpectedLifecycleRegistryHeadHashRequired: true,
    readOnlyRpcOperationsMayUseNullCasHeads:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_READ_ONLY_RPC_OPERATIONS_V1,
    everyOtherRpcOperationRequiresBothCasHeads: true,
    callerHeadsAreConcurrencyTokensOnly: true,
    callerHeadsAreIndependentProvenance: false,
    exactCrossJournalCasImplemented: false,
  });

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_REQUIRED_STATES_V1
  = ObjectFreeze([
    "REGISTER_CAPTURE_BEFORE_CAPTURE_DIRECTORY_OR_FIRST_GET",
    "DRAIN_BARRIER_DURABLE",
    "ZERO_DURABLE_LEASES_VERIFIED",
    "PURGE_ELIGIBILITY_FROM_VERIFIED_CONTROL_SOURCE",
    "PURGE_INTENT_DURABLE",
    "FINITE_DESCENDANT_CASCADE_DURABLE",
    "EXACT_NONRECURSIVE_DELETE",
    "PURGE_RECEIPT_DURABLE",
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_SUBSTATES_V1
  = ObjectFreeze([
    "UNREGISTERED",
    "REGISTERED_OPEN",
    "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED",
    "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED",
    "PURGE_ELIGIBILITY_STRUCTURAL_DECLARATION_ACCEPTED",
    "DESCENDANT_CENSUS_STRUCTURAL_DECLARATION_ACCEPTED",
    "PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED_RAW_FORBIDDEN",
    "DESCENDANT_CASCADE_STRUCTURAL_DECLARATION_ACCEPTED",
    "RAW_PREFIX_0_STRUCTURAL_DECLARATION_ACCEPTED",
    "RAW_PREFIX_1_STRUCTURAL_DECLARATION_ACCEPTED",
    "RAW_PREFIX_2_STRUCTURAL_DECLARATION_ACCEPTED",
    "RAW_PREFIX_3_STRUCTURAL_DECLARATION_ACCEPTED",
    "RAW_PREFIX_4_STRUCTURAL_DECLARATION_ACCEPTED",
    "RAW_PREFIX_5_STRUCTURAL_DECLARATION_ACCEPTED",
    "RAW_ABSENCE_STRUCTURAL_DECLARATION_ACCEPTED",
    "PURGE_RECEIPT_STRUCTURAL_DECLARATION_ACCEPTED_NO_AUTHORITY",
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_STATE_EVENTS_V1
  = ObjectFreeze([
    "CAPTURE_GATE_BOUND",
    "LEASE_GRANTED",
    "LEASE_RELEASED",
    "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED",
    "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED",
    "PURGE_ELIGIBILITY_STRUCTURAL_DECLARATION_ACCEPTED",
    "DESCENDANT_CENSUS_STRUCTURAL_DECLARATION_ACCEPTED",
    "V3_PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED",
    "DESCENDANT_CASCADE_STRUCTURAL_DECLARATION_ACCEPTED",
    "RAW_PREFIX_ADVANCE_STRUCTURAL_DECLARATION_ACCEPTED",
    "RAW_ABSENCE_STRUCTURAL_DECLARATION_ACCEPTED",
    "PURGE_RECEIPT_STRUCTURAL_DECLARATION_ACCEPTED_NO_AUTHORITY",
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DESCENDANT_TYPES_V1
  = ObjectFreeze([
    "PRIVATE_GITHUB_DISCOVERY_SNAPSHOT_BUNDLE",
    "NETWORK_SAFE_GITHUB_DISCOVERY_PROJECTION",
    "PRIVATE_DISPUTE_REVIEW_SOURCE_BUNDLE",
  ]);

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_OS_REQUIREMENTS_V1
  = ObjectFreeze({
    common: ObjectFreeze({
      dedicatedOsIdentityRequired: true,
      callerAndBrokerIdentityMustDiffer: true,
      trustedParentOwnedByAdministrator: true,
      trustedParentWritableByCaller: false,
      rawRootMode: "0700",
      captureDirectoryMode: "0700",
      rawLeafMode: "0600",
      additionalAclAllowed: false,
      rawRootAndCaptureSameDeviceRequired: true,
      networkFilesystemAllowed: false,
      rootDescriptorHeldForBrokerLifetime: true,
      captureMustBeTrustedRootDirectChild: true,
      runtimeCallerPathAllowed: false,
      rawDescriptorExportAllowed: false,
      staleLeaseAutomaticResolutionAllowed: false,
      recursiveDeleteAllowed: false,
      globTargetDiscoveryAllowed: false,
      directoryDeleteAllowed: false,
    }),
    linux: ObjectFreeze({
      preferredResolutionPrimitive: "openat2",
      requiredResolveFlags: ObjectFreeze([
        "RESOLVE_BENEATH",
        "RESOLVE_NO_SYMLINKS",
        "RESOLVE_NO_MAGICLINKS",
        "RESOLVE_NO_XDEV",
      ]),
      oneComponentOpenatFallbackAllowedOnlyAfterProvisioningProof: true,
      exactLeafDeletePrimitive: "unlinkat",
      unlinkatFlags: 0,
      serviceManager: "systemd",
      peerCredentialPrimitive: "SO_PEERCRED",
    }),
    darwin: ObjectFreeze({
      preferredResolutionPrimitive: "one-component-openat",
      openat2Available: false,
      nofollowAndExclusiveDirectoryOwnershipRequired: true,
      exactLeafDeletePrimitive: "unlinkat",
      unlinkatFlags: 0,
      strongFileFlushWhenApplicable: "F_FULLFSYNC",
      serviceManager: "launchd",
      peerCredentialPrimitive: "getpeereid-or-platform-peer-credential",
    }),
  });

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_PROVISIONING_REQUIREMENTS_V1
  = ObjectFreeze({
    status: "MODEL_ONLY_NOT_PROVISIONED",
    linuxSocket: "/run/outsider-lifecycle/broker.sock",
    linuxRawRoot: "/var/lib/outsider/raw",
    linuxLifecycleRoot: "/var/lib/outsider/lifecycle",
    darwinSocket: "/var/run/outsider-lifecycle.sock",
    darwinRawRoot: "/Library/Application Support/Outsider/raw",
    darwinLifecycleRoot:
      "/Library/Application Support/Outsider/lifecycle",
    workspaceOwnedRawRootAllowed: false,
    administrativeProvisioningRequired: true,
    externalLifecycleServiceRequired: true,
    independentlyProvisionedTrustPolicyRequired: true,
    signedNativeArtifactRequired: true,
    productionProvisioningPerformed: false,
  });

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_ZERO_LEASE_REQUIREMENTS_V1
  = ObjectFreeze({
    activeLeaseCount: 0,
    activeLeaseIdsMustBeExactEmptyArray: true,
    activeLeaseSetMustBeEmpty: true,
    activeLeaseSetHashMustBindEmptySet: true,
    lastLeaseTransitionSequenceRequired: true,
    rawLeafFdCount: 0,
    trustedWorkerSetEmpty: true,
    rawFdExportEverAllowed: false,
    callerDeclarationUsed: true,
    activeLeaseSetHashBindingEstablished: false,
    staleLeaseAutomaticResolutionAllowed: false,
    drainBarrierIsDeleteAuthorization: false,
    structuralDeclarationIsDurableProof: false,
  });

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DRAIN_BARRIER_REQUIREMENTS_V1
  = ObjectFreeze({
    barrierIdRequired: true,
    captureBindingHashRequired: true,
    rawPlanHashRequired: true,
    expectedEligibilityEntryHashRequired: true,
    expectedDescendantCensusHashRequired: true,
    readerAdmissionClosed: true,
    isPurgeIntent: false,
    deletionAuthorityEstablished: false,
    pidIsLivenessAuthority: false,
    localClockIsLivenessAuthority: false,
    reversibleInProtocolV1: false,
    structuralDeclarationIsDurableBarrier: false,
  });

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RECOVERY_TABLE_V1
  = ObjectFreeze([
    ObjectFreeze({
      committedPrefix: 0,
      absentOrdinals: ObjectFreeze([]),
      exactPresentOrdinals: ObjectFreeze([1, 2, 3, 4, 5]),
      nextOrdinal: 1,
    }),
    ObjectFreeze({
      committedPrefix: 1,
      absentOrdinals: ObjectFreeze([1]),
      exactPresentOrdinals: ObjectFreeze([2, 3, 4, 5]),
      nextOrdinal: 2,
    }),
    ObjectFreeze({
      committedPrefix: 2,
      absentOrdinals: ObjectFreeze([1, 2]),
      exactPresentOrdinals: ObjectFreeze([3, 4, 5]),
      nextOrdinal: 3,
    }),
    ObjectFreeze({
      committedPrefix: 3,
      absentOrdinals: ObjectFreeze([1, 2, 3]),
      exactPresentOrdinals: ObjectFreeze([4, 5]),
      nextOrdinal: 4,
    }),
    ObjectFreeze({
      committedPrefix: 4,
      absentOrdinals: ObjectFreeze([1, 2, 3, 4]),
      exactPresentOrdinals: ObjectFreeze([5]),
      nextOrdinal: 5,
    }),
    ObjectFreeze({
      committedPrefix: 5,
      absentOrdinals: ObjectFreeze([1, 2, 3, 4, 5]),
      exactPresentOrdinals: ObjectFreeze([]),
      nextOrdinal: null,
    }),
  ]);

const RPC_OPERATION_COUNT = 14;
const RAW_ROLE_COUNT = 5;
const MAX_DESCENDANTS =
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_LIMITS
    .maximumDescendants;
const MAX_ACTIVE_LEASES =
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_LIMITS
    .maximumActiveLeasesInStructuralModel;
const RAW_PREFIX_SUBSTATES = ObjectFreeze([
  "RAW_PREFIX_0_STRUCTURAL_DECLARATION_ACCEPTED",
  "RAW_PREFIX_1_STRUCTURAL_DECLARATION_ACCEPTED",
  "RAW_PREFIX_2_STRUCTURAL_DECLARATION_ACCEPTED",
  "RAW_PREFIX_3_STRUCTURAL_DECLARATION_ACCEPTED",
  "RAW_PREFIX_4_STRUCTURAL_DECLARATION_ACCEPTED",
  "RAW_PREFIX_5_STRUCTURAL_DECLARATION_ACCEPTED",
]);

function fail(code) {
  throw new TypeErrorConstructor(`${CONTRACT_PREFIX}_${code}`);
}

function defineOwnData(target, key, value) {
  const descriptor = ObjectCreate(null);
  descriptor.value = value;
  descriptor.writable = true;
  descriptor.enumerable = true;
  descriptor.configurable = true;
  ObjectDefineProperty(target, key, descriptor);
}

function fixedRecord(value, code) {
  if (value === null || typeof value !== "object" || IsProxy(value)
    || ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ObjectPrototype) {
    fail(`${code}_RECORD_INVALID`);
  }
  return value;
}

function dataField(record, name, code) {
  const descriptor = ObjectGetOwnPropertyDescriptor(record, name);
  if (!descriptor || !ObjectHasOwn(descriptor, "value")
    || descriptor.enumerable !== true) {
    fail(`${code}_${StringToUpperCase(name)}_FIELD_INVALID`);
  }
  return descriptor.value;
}

function fixedArray(value, minimum, maximum, code) {
  if (value === null || typeof value !== "object" || IsProxy(value)
    || !ArrayIsArray(value)
    || ObjectGetPrototypeOf(value) !== ArrayPrototype) {
    fail(`${code}_ARRAY_INVALID`);
  }
  const lengthDescriptor = ObjectGetOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !ObjectHasOwn(lengthDescriptor, "value")) {
    fail(`${code}_LENGTH_INVALID`);
  }
  const length = lengthDescriptor.value;
  if (!NumberIsSafeInteger(length) || length < minimum || length > maximum) {
    fail(`${code}_LENGTH_INVALID`);
  }
  return length;
}

function arrayDataField(value, index, code) {
  const descriptor = ObjectGetOwnPropertyDescriptor(
    value,
    StringConstructor(index),
  );
  if (!descriptor || !ObjectHasOwn(descriptor, "value")
    || descriptor.enumerable !== true) {
    fail(`${code}_ELEMENT_INVALID`);
  }
  return descriptor.value;
}

function boundedString(value, maximum, code) {
  if (typeof value !== "string" || value.length < 1
    || value.length > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function patternString(value, pattern, code) {
  boundedString(
    value,
    AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_LIMITS
      .maximumStringCodeUnits,
    code,
  );
  if (RegExpExec(pattern, value) === null) fail(`${code}_INVALID`);
  return value;
}

function hash(value, code) {
  return patternString(value, HASH, code);
}

function captureId(value, code = "CAPTURE_ID") {
  return patternString(value, CAPTURE_ID, code);
}

function operationId(value, code = "OPERATION_ID") {
  return patternString(value, OPERATION_ID, code);
}

function safeInteger(value, minimum, maximum, code) {
  if (!NumberIsSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function enumValue(value, values, code) {
  if (typeof value !== "string") fail(`${code}_INVALID`);
  for (let index = 0; index < values.length; index += 1) {
    if (value === values[index]) return value;
  }
  fail(`${code}_INVALID`);
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function isReadOnlyRpcOperation(operation) {
  for (let index = 0;
    index
      < AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_READ_ONLY_RPC_OPERATIONS_V1
        .length;
    index += 1) {
    if (operation
      === AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_READ_ONLY_RPC_OPERATIONS_V1[
        index]) return true;
  }
  return false;
}

function structuralClassification(model) {
  defineOwnData(model, "classificationIsExecutionAuthority", false);
  defineOwnData(model, "observationsIndependentlyVerified", false);
  defineOwnData(model, "externalDurabilityEstablished", false);
  defineOwnData(model, "durableZeroLeaseProofEstablished", false);
  defineOwnData(model, "permitsIo", false);
  defineOwnData(model, "permitsDelete", false);
  return ObjectFreeze(model);
}

function stateModel(substate, activeLeaseCount, committedRawPrefix,
  postIntentRawForbidden) {
  return ObjectFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS.stateModel,
    structuralModelOnly: true,
    substate,
    activeLeaseCount,
    committedRawPrefix,
    postIntentRawForbidden,
    simulatedOrderingState: true,
    orderingOnlyNoCrossEvidenceBinding: true,
    crossEventEvidenceBindingEstablished: false,
    durableDrainBarrierEstablished: false,
    durableZeroLeaseProofEstablished: false,
    verifiedPurgeEligibilityEstablished: false,
    durableDescendantCensusEstablished: false,
    durablePurgeIntentEstablished: false,
    durableDescendantCascadeEstablished: false,
    exactNonrecursiveDeleteEstablished: false,
    rawAbsenceVerifiedEstablished: false,
    durablePurgeReceiptEstablished: false,
    lifecycleChainCompletionEstablished: false,
    externalDurabilityEstablished: false,
    executionAuthorized: false,
  });
}

function validateStateModel(value) {
  const record = fixedRecord(value, "STATE_MODEL");
  if (dataField(record, "schema", "STATE_MODEL")
      !== AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS
        .stateModel
    || dataField(record, "structuralModelOnly", "STATE_MODEL") !== true
    || dataField(record, "externalDurabilityEstablished", "STATE_MODEL")
      !== false
    || dataField(record, "executionAuthorized", "STATE_MODEL") !== false
    || dataField(record, "simulatedOrderingState", "STATE_MODEL") !== true
    || dataField(record, "orderingOnlyNoCrossEvidenceBinding", "STATE_MODEL")
      !== true
    || dataField(record, "crossEventEvidenceBindingEstablished", "STATE_MODEL")
      !== false
    || dataField(record, "durableDrainBarrierEstablished", "STATE_MODEL")
      !== false
    || dataField(record, "durableZeroLeaseProofEstablished", "STATE_MODEL")
      !== false
    || dataField(record, "verifiedPurgeEligibilityEstablished", "STATE_MODEL")
      !== false
    || dataField(record, "durableDescendantCensusEstablished", "STATE_MODEL")
      !== false
    || dataField(record, "durablePurgeIntentEstablished", "STATE_MODEL")
      !== false
    || dataField(record, "durableDescendantCascadeEstablished", "STATE_MODEL")
      !== false
    || dataField(record, "exactNonrecursiveDeleteEstablished", "STATE_MODEL")
      !== false
    || dataField(record, "rawAbsenceVerifiedEstablished", "STATE_MODEL")
      !== false
    || dataField(record, "durablePurgeReceiptEstablished", "STATE_MODEL")
      !== false
    || dataField(record, "lifecycleChainCompletionEstablished", "STATE_MODEL")
      !== false) {
    fail("STATE_MODEL_BOUNDARY_INVALID");
  }
  const substate = enumValue(
    dataField(record, "substate", "STATE_MODEL"),
    AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_SUBSTATES_V1,
    "STATE_MODEL_SUBSTATE",
  );
  const activeLeaseCount = safeInteger(
    dataField(record, "activeLeaseCount", "STATE_MODEL"),
    0,
    MAX_ACTIVE_LEASES,
    "STATE_MODEL_ACTIVE_LEASE_COUNT",
  );
  const committedRawPrefix = safeInteger(
    dataField(record, "committedRawPrefix", "STATE_MODEL"),
    0,
    RAW_ROLE_COUNT,
    "STATE_MODEL_COMMITTED_RAW_PREFIX",
  );
  const postIntentRawForbidden =
    dataField(record, "postIntentRawForbidden", "STATE_MODEL");
  if (typeof postIntentRawForbidden !== "boolean") {
    fail("STATE_MODEL_RAW_FORBIDDEN_INVALID");
  }

  let expectedCommittedRawPrefix = 0;
  let expectedPostIntentRawForbidden = false;
  const nonzeroLeasesAllowed = substate === "REGISTERED_OPEN"
    || substate === "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED";
  if (substate
      === "PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED_RAW_FORBIDDEN"
    || substate === "DESCENDANT_CASCADE_STRUCTURAL_DECLARATION_ACCEPTED") {
    expectedPostIntentRawForbidden = true;
  }
  for (let index = 0; index < RAW_PREFIX_SUBSTATES.length; index += 1) {
    if (substate === RAW_PREFIX_SUBSTATES[index]) {
      expectedCommittedRawPrefix = index;
      expectedPostIntentRawForbidden = true;
    }
  }
  if (substate === "RAW_ABSENCE_STRUCTURAL_DECLARATION_ACCEPTED"
    || substate
      === "PURGE_RECEIPT_STRUCTURAL_DECLARATION_ACCEPTED_NO_AUTHORITY") {
    expectedCommittedRawPrefix = RAW_ROLE_COUNT;
    expectedPostIntentRawForbidden = true;
  }
  if ((!nonzeroLeasesAllowed && activeLeaseCount !== 0)
    || committedRawPrefix !== expectedCommittedRawPrefix
    || postIntentRawForbidden !== expectedPostIntentRawForbidden) {
    fail("STATE_MODEL_REACHABILITY_INVARIANT_HOLD");
  }
  return ObjectFreeze({
    substate,
    activeLeaseCount,
    committedRawPrefix,
    postIntentRawForbidden,
  });
}

function validateDrainBarrier(value) {
  const record = fixedRecord(value, "DRAIN_BARRIER");
  if (dataField(record, "schema", "DRAIN_BARRIER")
      !== AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS.barrier
    || dataField(record, "structuralModelOnly", "DRAIN_BARRIER") !== true) {
    fail("DRAIN_BARRIER_SCHEMA_INVALID");
  }
  const barrierId = patternString(dataField(record, "barrierId",
    "DRAIN_BARRIER"), BARRIER_ID, "BARRIER_ID");
  const captureBindingHash = hash(dataField(record, "captureBindingHash",
    "DRAIN_BARRIER"), "CAPTURE_BINDING_HASH");
  const rawPlanHash = hash(dataField(record, "rawPlanHash", "DRAIN_BARRIER"),
    "RAW_PLAN_HASH");
  const expectedEligibilityEntryHash = hash(dataField(record,
    "expectedEligibilityEntryHash", "DRAIN_BARRIER"),
  "EXPECTED_ELIGIBILITY_ENTRY_HASH");
  const expectedDescendantCensusHash = hash(dataField(record,
    "expectedDescendantCensusHash", "DRAIN_BARRIER"),
  "EXPECTED_DESCENDANT_CENSUS_HASH");
  if (dataField(record, "readerAdmissionClosed", "DRAIN_BARRIER") !== true
    || dataField(record, "isPurgeIntent", "DRAIN_BARRIER") !== false
    || dataField(record, "deletionAuthorityEstablished", "DRAIN_BARRIER")
      !== false
    || dataField(record, "pidIsLivenessAuthority", "DRAIN_BARRIER") !== false
    || dataField(record, "localClockIsLivenessAuthority", "DRAIN_BARRIER")
      !== false
    || dataField(record, "durableZeroLeaseProofEstablished", "DRAIN_BARRIER")
      !== false
    || dataField(record, "externalDurabilityEstablished", "DRAIN_BARRIER")
      !== false) {
    fail("DRAIN_BARRIER_BOUNDARY_INVALID");
  }
  return ObjectFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS.barrier,
    structuralModelOnly: true,
    barrierId,
    captureBindingHash,
    rawPlanHash,
    expectedEligibilityEntryHash,
    expectedDescendantCensusHash,
    readerAdmissionClosed: true,
    isPurgeIntent: false,
    deletionAuthorityEstablished: false,
    pidIsLivenessAuthority: false,
    localClockIsLivenessAuthority: false,
    durableZeroLeaseProofEstablished: false,
    externalDurabilityEstablished: false,
  });
}

function validateZeroLeaseProof(value) {
  const record = fixedRecord(value, "ZERO_LEASE_PROOF");
  if (dataField(record, "schema", "ZERO_LEASE_PROOF")
      !== AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS
        .zeroLeaseProof
    || dataField(record, "structuralModelOnly", "ZERO_LEASE_PROOF")
      !== true) {
    fail("ZERO_LEASE_PROOF_SCHEMA_INVALID");
  }
  const capture = captureId(dataField(record, "captureId",
    "ZERO_LEASE_PROOF"));
  const barrierEntryHash = hash(dataField(record, "barrierEntryHash",
    "ZERO_LEASE_PROOF"), "BARRIER_ENTRY_HASH");
  const activeLeaseIds = dataField(record, "activeLeaseIds",
    "ZERO_LEASE_PROOF");
  fixedArray(activeLeaseIds, 0, 0, "ACTIVE_LEASE_IDS");
  const activeLeaseSetHash = hash(dataField(record, "activeLeaseSetHash",
    "ZERO_LEASE_PROOF"), "ACTIVE_LEASE_SET_HASH");
  const lastLeaseTransitionSequence = safeInteger(dataField(record,
    "lastLeaseTransitionSequence", "ZERO_LEASE_PROOF"), 0,
  MaximumSafeInteger, "LAST_LEASE_TRANSITION_SEQUENCE");
  if (dataField(record, "activeLeaseCount", "ZERO_LEASE_PROOF") !== 0
    || dataField(record, "rawLeafFdCount", "ZERO_LEASE_PROOF") !== 0
    || dataField(record, "trustedWorkerSetEmpty", "ZERO_LEASE_PROOF")
      !== true
    || dataField(record, "rawFdExportEverAllowed", "ZERO_LEASE_PROOF")
      !== false
    || dataField(record, "callerDeclarationUsed", "ZERO_LEASE_PROOF")
      !== true
    || dataField(record, "activeLeaseSetHashRecomputed", "ZERO_LEASE_PROOF")
      !== false
    || dataField(record, "activeLeaseSetHashBindingEstablished",
      "ZERO_LEASE_PROOF") !== false
    || dataField(record, "durableZeroLeaseProofEstablished",
      "ZERO_LEASE_PROOF") !== false
    || dataField(record, "externalDurabilityEstablished", "ZERO_LEASE_PROOF")
      !== false) {
    fail("ZERO_LEASE_PROOF_BOUNDARY_INVALID");
  }
  return ObjectFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS
        .zeroLeaseProof,
    structuralModelOnly: true,
    captureId: capture,
    barrierEntryHash,
    activeLeaseIds: ObjectFreeze([]),
    activeLeaseCount: 0,
    activeLeaseSetHash,
    lastLeaseTransitionSequence,
    rawLeafFdCount: 0,
    trustedWorkerSetEmpty: true,
    rawFdExportEverAllowed: false,
    callerDeclarationUsed: true,
    activeLeaseSetHashRecomputed: false,
    activeLeaseSetHashBindingEstablished: false,
    durableZeroLeaseProofEstablished: false,
    externalDurabilityEstablished: false,
    permitsDelete: false,
  });
}

function validateStateEvent(value) {
  const record = fixedRecord(value, "STATE_EVENT");
  if (dataField(record, "schema", "STATE_EVENT")
      !== AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS
        .stateEvent
    || dataField(record, "structuralModelOnly", "STATE_EVENT") !== true
    || dataField(record, "structuralOrderingOnly", "STATE_EVENT") !== true
    || dataField(record, "crossEventEvidenceBindingEstablished", "STATE_EVENT")
      !== false
    || dataField(record, "durableZeroLeaseProofEstablished", "STATE_EVENT")
      !== false) {
    fail("STATE_EVENT_SCHEMA_INVALID");
  }
  const type = enumValue(
    dataField(record, "type", "STATE_EVENT"),
    AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_STATE_EVENTS_V1,
    "STATE_EVENT_TYPE",
  );
  const ordinal = dataField(record, "ordinal", "STATE_EVENT");
  if (ordinal !== null) {
    safeInteger(ordinal, 1, RAW_ROLE_COUNT, "STATE_EVENT_ORDINAL");
  }
  const barrierValue = dataField(record, "barrier", "STATE_EVENT");
  const barrier = barrierValue === null
    ? null : validateDrainBarrier(barrierValue);
  const zeroLeaseProofValue = dataField(record, "zeroLeaseProof",
    "STATE_EVENT");
  const zeroLeaseProof = zeroLeaseProofValue === null
    ? null : validateZeroLeaseProof(zeroLeaseProofValue);
  if (type === "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED"
    && barrier === null) {
    fail("STATE_EVENT_DRAIN_BARRIER_REQUIRED");
  }
  if (type !== "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED"
    && barrier !== null) {
    fail("STATE_EVENT_DRAIN_BARRIER_UNEXPECTED");
  }
  if (type === "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED"
    && zeroLeaseProof === null) {
    fail("STATE_EVENT_ZERO_LEASE_PROOF_REQUIRED");
  }
  if (type !== "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED"
    && zeroLeaseProof !== null) {
    fail("STATE_EVENT_ZERO_LEASE_PROOF_UNEXPECTED");
  }
  if (type === "RAW_PREFIX_ADVANCE_STRUCTURAL_DECLARATION_ACCEPTED"
    && ordinal === null) {
    fail("STATE_EVENT_ORDINAL_REQUIRED");
  }
  if (type !== "RAW_PREFIX_ADVANCE_STRUCTURAL_DECLARATION_ACCEPTED"
    && ordinal !== null) {
    fail("STATE_EVENT_ORDINAL_UNEXPECTED");
  }
  return ObjectFreeze({
    type,
    ordinal,
    barrier,
    zeroLeaseProof,
    structuralOrderingOnly: true,
    crossEventEvidenceBindingEstablished: false,
    durableZeroLeaseProofEstablished: false,
  });
}

export function createAutonomousWorkOrderLifecycleBrokerRpcRequestModelV1(
  input,
) {
  const record = fixedRecord(input, "RPC_REQUEST");
  const operation = enumValue(
    dataField(record, "operation", "RPC_REQUEST"),
    AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RPC_OPERATIONS_V1,
    "RPC_OPERATION",
  );
  const id = operationId(dataField(record, "requestId", "RPC_REQUEST"),
    "REQUEST_ID");
  const expectedGateJournalHeadHash = nullableHash(
    dataField(record, "expectedGateJournalHeadHash", "RPC_REQUEST"),
    "EXPECTED_GATE_JOURNAL_HEAD_HASH",
  );
  const expectedLifecycleRegistryHeadHash = nullableHash(
    dataField(record, "expectedLifecycleRegistryHeadHash", "RPC_REQUEST"),
    "EXPECTED_LIFECYCLE_REGISTRY_HEAD_HASH",
  );
  const readOnlyOperation = isReadOnlyRpcOperation(operation);
  const dualJournalCasFieldsStructurallyPresent =
    expectedGateJournalHeadHash !== null
    && expectedLifecycleRegistryHeadHash !== null;
  if ((expectedGateJournalHeadHash === null)
    !== (expectedLifecycleRegistryHeadHash === null)) {
    fail("RPC_REQUEST_DUAL_JOURNAL_CAS_PAIR_REQUIRED");
  }
  if (!readOnlyOperation && !dualJournalCasFieldsStructurallyPresent) {
    fail("RPC_REQUEST_MUTATING_DUAL_JOURNAL_CAS_REQUIRED");
  }
  const expectedCaptureBindingHash = nullableHash(
    dataField(record, "expectedCaptureBindingHash", "RPC_REQUEST"),
    "EXPECTED_CAPTURE_BINDING_HASH",
  );
  const expectedRawPlanHash = nullableHash(
    dataField(record, "expectedRawPlanHash", "RPC_REQUEST"),
    "EXPECTED_RAW_PLAN_HASH",
  );
  const declaredBodyHash = hash(
    dataField(record, "declaredBodyHash", "RPC_REQUEST"),
    "DECLARED_BODY_HASH",
  );
  const declaredRequestHash = hash(
    dataField(record, "declaredRequestHash", "RPC_REQUEST"),
    "DECLARED_REQUEST_HASH",
  );
  return ObjectFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS.rpcRequest,
    protocolVersion: 1,
    operation,
    requestId: id,
    expectedGateJournalHeadHash,
    expectedLifecycleRegistryHeadHash,
    expectedCaptureBindingHash,
    expectedRawPlanHash,
    declaredBodyHash,
    declaredRequestHash,
    readOnlyOperation,
    dualJournalCasRequired: !readOnlyOperation,
    dualJournalCasFieldsStructurallyPresent,
    callerBodyInspected: false,
    callerHashesRecomputed: false,
    callerHeadHashesRecomputed: false,
    durableZeroLeaseProofEstablished: false,
    structuralModelOnly: true,
    externalDurabilityEstablished: false,
    executionAuthorized: false,
  });
}

export function createAutonomousWorkOrderLifecycleBrokerRegisteredRawOperationModelV1(
  input,
) {
  const record = fixedRecord(input, "REGISTERED_RAW_OPERATION_INPUT");
  const operationKind = enumValue(dataField(record, "operationKind",
    "REGISTERED_RAW_OPERATION_INPUT"),
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_REGISTERED_RAW_OPERATIONS_V1,
  "REGISTERED_RAW_OPERATION_KIND");
  const subjectKind = enumValue(dataField(record, "subjectKind",
    "REGISTERED_RAW_OPERATION_INPUT"),
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_RAW_SUBJECT_KINDS_V1,
  "REGISTERED_RAW_SUBJECT_KIND");
  const descendantIdValue = dataField(record, "descendantId",
    "REGISTERED_RAW_OPERATION_INPUT");
  const expectedDescendantReceiptHashValue = dataField(record,
    "expectedDescendantReceiptHash", "REGISTERED_RAW_OPERATION_INPUT");
  let descendant = null;
  let expectedDescendantReceiptHash = null;
  if (subjectKind === "REGISTERED_DESCENDANT") {
    descendant = patternString(descendantIdValue, DESCENDANT_ID,
      "REGISTERED_RAW_DESCENDANT_ID");
    expectedDescendantReceiptHash = hash(
      expectedDescendantReceiptHashValue,
      "EXPECTED_DESCENDANT_RECEIPT_HASH",
    );
  } else if (descendantIdValue !== null
    || expectedDescendantReceiptHashValue !== null) {
    fail("REGISTERED_RAW_ACQUISITION_DESCENDANT_FIELDS_INVALID");
  }
  return ObjectFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS
        .registeredRawOperation,
    structuralModelOnly: true,
    operationKind,
    subjectKind,
    descendantId: descendant,
    expectedDescendantReceiptHash,
    rawBytesReturned: false,
    rawPathReturned: false,
    rawDescriptorReturned: false,
    rawStreamReturned: false,
    internalBufferClearanceEstablished: false,
    durableZeroLeaseProofEstablished: false,
    externalDurabilityEstablished: false,
    executionAuthorized: false,
    decisionState: "HOLD",
    authority: "NONE",
  });
}

export function createAutonomousWorkOrderLifecycleBrokerZeroLeaseProofModelV1(
  input,
) {
  const record = fixedRecord(input, "ZERO_LEASE_INPUT");
  const capture = captureId(
    dataField(record, "captureId", "ZERO_LEASE_INPUT"),
  );
  const activeLeaseSetHash = hash(
    dataField(record, "activeLeaseSetHash", "ZERO_LEASE_INPUT"),
    "ACTIVE_LEASE_SET_HASH",
  );
  const barrierEntryHash = hash(dataField(record, "barrierEntryHash",
    "ZERO_LEASE_INPUT"), "BARRIER_ENTRY_HASH");
  const activeLeaseIds = dataField(record, "activeLeaseIds",
    "ZERO_LEASE_INPUT");
  fixedArray(activeLeaseIds, 0, 0, "ACTIVE_LEASE_IDS");
  const lastLeaseTransitionSequence = safeInteger(dataField(record,
    "lastLeaseTransitionSequence", "ZERO_LEASE_INPUT"), 0,
  MaximumSafeInteger, "LAST_LEASE_TRANSITION_SEQUENCE");
  if (dataField(record, "activeLeaseCount", "ZERO_LEASE_INPUT") !== 0
    || dataField(record, "rawLeafFdCount", "ZERO_LEASE_INPUT") !== 0
    || dataField(record, "trustedWorkerSetEmpty", "ZERO_LEASE_INPUT")
      !== true
    || dataField(record, "rawFdExportEverAllowed", "ZERO_LEASE_INPUT")
      !== false
    || dataField(record, "callerDeclarationUsed", "ZERO_LEASE_INPUT")
      !== true) {
    fail("ZERO_LEASE_INPUT_NOT_ZERO");
  }
  return ObjectFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS
        .zeroLeaseProof,
    structuralModelOnly: true,
    captureId: capture,
    barrierEntryHash,
    activeLeaseIds: ObjectFreeze([]),
    activeLeaseSetHash,
    activeLeaseCount: 0,
    lastLeaseTransitionSequence,
    rawLeafFdCount: 0,
    trustedWorkerSetEmpty: true,
    rawFdExportEverAllowed: false,
    callerDeclarationUsed: true,
    activeLeaseSetHashRecomputed: false,
    activeLeaseSetHashBindingEstablished: false,
    durableZeroLeaseProofEstablished: false,
    externalDurabilityEstablished: false,
    permitsDelete: false,
  });
}

export function createAutonomousWorkOrderLifecycleBrokerDrainBarrierModelV1(
  input,
) {
  const record = fixedRecord(input, "DRAIN_BARRIER_INPUT");
  const output = ObjectFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS.barrier,
    structuralModelOnly: true,
    barrierId: patternString(dataField(record, "barrierId",
      "DRAIN_BARRIER_INPUT"), BARRIER_ID, "BARRIER_ID"),
    captureBindingHash: hash(dataField(record, "captureBindingHash",
      "DRAIN_BARRIER_INPUT"), "CAPTURE_BINDING_HASH"),
    rawPlanHash: hash(dataField(record, "rawPlanHash",
      "DRAIN_BARRIER_INPUT"), "RAW_PLAN_HASH"),
    expectedEligibilityEntryHash: hash(dataField(record,
      "expectedEligibilityEntryHash", "DRAIN_BARRIER_INPUT"),
    "EXPECTED_ELIGIBILITY_ENTRY_HASH"),
    expectedDescendantCensusHash: hash(dataField(record,
      "expectedDescendantCensusHash", "DRAIN_BARRIER_INPUT"),
    "EXPECTED_DESCENDANT_CENSUS_HASH"),
    readerAdmissionClosed: true,
    isPurgeIntent: false,
    deletionAuthorityEstablished: false,
    pidIsLivenessAuthority: false,
    localClockIsLivenessAuthority: false,
    durableZeroLeaseProofEstablished: false,
    externalDurabilityEstablished: false,
  });
  return validateDrainBarrier(output);
}

export function createAutonomousWorkOrderLifecycleBrokerPurgeIntentBindingModelV1(
  input,
) {
  const record = fixedRecord(input, "PURGE_INTENT_BINDING");
  const model = {
    schema:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS
        .purgeIntentBinding,
    structuralModelOnly: true,
    purgeId: patternString(dataField(record, "purgeId",
      "PURGE_INTENT_BINDING"), PURGE_ID, "PURGE_ID"),
    captureId: captureId(dataField(record, "captureId",
      "PURGE_INTENT_BINDING")),
    rootCapabilityId: patternString(dataField(record, "rootCapabilityId",
      "PURGE_INTENT_BINDING"), FIXED_ID, "ROOT_CAPABILITY_ID"),
    brokerBuildHash: hash(dataField(record, "brokerBuildHash",
      "PURGE_INTENT_BINDING"), "BROKER_BUILD_HASH"),
    rawPlanProfileHash: hash(dataField(record, "rawPlanProfileHash",
      "PURGE_INTENT_BINDING"), "RAW_PLAN_PROFILE_HASH"),
    barrierReceiptHash: hash(dataField(record, "barrierReceiptHash",
      "PURGE_INTENT_BINDING"), "BARRIER_RECEIPT_HASH"),
    zeroLeaseReceiptHash: hash(dataField(record, "zeroLeaseReceiptHash",
      "PURGE_INTENT_BINDING"), "ZERO_LEASE_RECEIPT_HASH"),
    eligibilityReceiptHash: hash(dataField(record, "eligibilityReceiptHash",
      "PURGE_INTENT_BINDING"), "ELIGIBILITY_RECEIPT_HASH"),
    censusManifestHash: hash(dataField(record, "censusManifestHash",
      "PURGE_INTENT_BINDING"), "CENSUS_MANIFEST_HASH"),
    previousExternalHead: hash(dataField(record, "previousExternalHead",
      "PURGE_INTENT_BINDING"), "PREVIOUS_EXTERNAL_HEAD"),
    declaredIntentHash: hash(dataField(record, "declaredIntentHash",
      "PURGE_INTENT_BINDING"), "DECLARED_INTENT_HASH"),
    declaredHashesRecomputed: false,
    durableZeroLeaseProofEstablished: false,
    issuerSignatureVerified: false,
    currentExternalHeadVerified: false,
    externalDurabilityEstablished: false,
    permitsDelete: false,
  };
  return ObjectFreeze(model);
}

export function createAutonomousWorkOrderLifecycleBrokerStateModelV1() {
  return stateModel("UNREGISTERED", 0, 0, false);
}

export function createAutonomousWorkOrderLifecycleBrokerStateEventV1(input) {
  const record = fixedRecord(input, "STATE_EVENT_INPUT");
  const type = enumValue(
    dataField(record, "type", "STATE_EVENT_INPUT"),
    AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_STATE_EVENTS_V1,
    "STATE_EVENT_TYPE",
  );
  const ordinal = dataField(record, "ordinal", "STATE_EVENT_INPUT");
  if (ordinal !== null) {
    safeInteger(ordinal, 1, RAW_ROLE_COUNT, "STATE_EVENT_ORDINAL");
  }
  const barrierValue = dataField(
    record,
    "barrier",
    "STATE_EVENT_INPUT",
  );
  const barrier = barrierValue === null
    ? null : validateDrainBarrier(barrierValue);
  const zeroLeaseProofValue = dataField(
    record,
    "zeroLeaseProof",
    "STATE_EVENT_INPUT",
  );
  const zeroLeaseProof = zeroLeaseProofValue === null
    ? null : validateZeroLeaseProof(zeroLeaseProofValue);
  const output = ObjectFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS.stateEvent,
    structuralModelOnly: true,
    type,
    ordinal,
    barrier,
    zeroLeaseProof,
    structuralOrderingOnly: true,
    crossEventEvidenceBindingEstablished: false,
    durableZeroLeaseProofEstablished: false,
  });
  validateStateEvent(output);
  return output;
}

export function reduceAutonomousWorkOrderLifecycleBrokerStateModelV1(
  current,
  event,
) {
  const state = validateStateModel(current);
  const nextEvent = validateStateEvent(event);
  let nextState = state.substate;
  let leases = state.activeLeaseCount;
  let prefix = state.committedRawPrefix;
  let rawForbidden = state.postIntentRawForbidden;

  if (nextEvent.type === "LEASE_GRANTED") {
    if (state.substate !== "REGISTERED_OPEN" || leases >= MAX_ACTIVE_LEASES) {
      fail("STATE_TRANSITION_LEASE_GRANT_HOLD");
    }
    leases += 1;
  } else if (nextEvent.type === "LEASE_RELEASED") {
    if ((state.substate !== "REGISTERED_OPEN"
        && state.substate
          !== "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED")
      || leases < 1) {
      fail("STATE_TRANSITION_LEASE_RELEASE_HOLD");
    }
    leases -= 1;
  } else if (nextEvent.type === "CAPTURE_GATE_BOUND"
    && state.substate === "UNREGISTERED") {
    nextState = "REGISTERED_OPEN";
  } else if (nextEvent.type
      === "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED"
    && state.substate === "REGISTERED_OPEN") {
    nextState = "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED";
  } else if (nextEvent.type
      === "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED"
    && state.substate === "DRAIN_BARRIER_STRUCTURAL_DECLARATION_ACCEPTED"
    && leases === 0) {
    nextState = "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED";
  } else if (nextEvent.type
      === "PURGE_ELIGIBILITY_STRUCTURAL_DECLARATION_ACCEPTED"
    && state.substate === "ZERO_LEASES_STRUCTURAL_DECLARATION_ACCEPTED") {
    nextState = "PURGE_ELIGIBILITY_STRUCTURAL_DECLARATION_ACCEPTED";
  } else if (nextEvent.type
      === "DESCENDANT_CENSUS_STRUCTURAL_DECLARATION_ACCEPTED"
    && state.substate
      === "PURGE_ELIGIBILITY_STRUCTURAL_DECLARATION_ACCEPTED") {
    nextState = "DESCENDANT_CENSUS_STRUCTURAL_DECLARATION_ACCEPTED";
  } else if (nextEvent.type
      === "V3_PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED"
    && state.substate
      === "DESCENDANT_CENSUS_STRUCTURAL_DECLARATION_ACCEPTED") {
    nextState =
      "PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED_RAW_FORBIDDEN";
    rawForbidden = true;
  } else if (nextEvent.type
      === "DESCENDANT_CASCADE_STRUCTURAL_DECLARATION_ACCEPTED"
    && state.substate
      === "PURGE_INTENT_STRUCTURAL_DECLARATION_ACCEPTED_RAW_FORBIDDEN") {
    nextState = "DESCENDANT_CASCADE_STRUCTURAL_DECLARATION_ACCEPTED";
  } else if (nextEvent.type
      === "RAW_PREFIX_ADVANCE_STRUCTURAL_DECLARATION_ACCEPTED"
    && (state.substate
        === "DESCENDANT_CASCADE_STRUCTURAL_DECLARATION_ACCEPTED"
      || state.substate === RAW_PREFIX_SUBSTATES[prefix])
    && nextEvent.ordinal === prefix + 1) {
    prefix += 1;
    nextState = RAW_PREFIX_SUBSTATES[prefix];
  } else if (nextEvent.type
      === "RAW_ABSENCE_STRUCTURAL_DECLARATION_ACCEPTED"
    && state.substate === RAW_PREFIX_SUBSTATES[RAW_ROLE_COUNT]
    && prefix === RAW_ROLE_COUNT) {
    nextState = "RAW_ABSENCE_STRUCTURAL_DECLARATION_ACCEPTED";
  } else if (nextEvent.type
      === "PURGE_RECEIPT_STRUCTURAL_DECLARATION_ACCEPTED_NO_AUTHORITY"
    && state.substate === "RAW_ABSENCE_STRUCTURAL_DECLARATION_ACCEPTED") {
    nextState =
      "PURGE_RECEIPT_STRUCTURAL_DECLARATION_ACCEPTED_NO_AUTHORITY";
  } else {
    fail("STATE_TRANSITION_HOLD");
  }

  return stateModel(nextState, leases, prefix, rawForbidden);
}

export function classifyAutonomousWorkOrderLifecycleBrokerIdempotencyV1(
  input,
) {
  const record = fixedRecord(input, "IDEMPOTENCY_INPUT");
  const storedOperationId = dataField(record, "storedOperationId",
    "IDEMPOTENCY_INPUT");
  const storedRequestHash = dataField(record, "storedRequestHash",
    "IDEMPOTENCY_INPUT");
  const storedCommitState = dataField(record, "storedCommitState",
    "IDEMPOTENCY_INPUT");
  const candidateOperationId = operationId(dataField(record,
    "candidateOperationId", "IDEMPOTENCY_INPUT"), "CANDIDATE_OPERATION_ID");
  const candidateRequestHash = hash(dataField(record, "candidateRequestHash",
    "IDEMPOTENCY_INPUT"), "CANDIDATE_REQUEST_HASH");

  if (storedOperationId === null && storedRequestHash === null
    && storedCommitState === null) {
    return structuralClassification({
      classification: "NEW_OPERATION_ID",
      retryAllowedOnlyWithSameOperationId: false,
      recoveryRequired: false,
      structuralModelOnly: true,
    });
  }
  operationId(storedOperationId, "STORED_OPERATION_ID");
  hash(storedRequestHash, "STORED_REQUEST_HASH");
  enumValue(storedCommitState, ObjectFreeze([
    "PENDING", "COMMITTED", "REJECTED", "COMMIT_UNKNOWN",
  ]), "STORED_COMMIT_STATE");

  let classification;
  let recoveryRequired = false;
  if (storedOperationId !== candidateOperationId) {
    classification = "NEW_OPERATION_ID";
  } else if (storedRequestHash !== candidateRequestHash) {
    classification = "OPERATION_ID_REUSE_HOLD";
  } else if (storedCommitState === "COMMITTED") {
    classification = "REPLAY_COMMITTED";
  } else if (storedCommitState === "REJECTED") {
    classification = "REPLAY_REJECTED";
  } else if (storedCommitState === "COMMIT_UNKNOWN") {
    classification = "RECOVER_SAME_OPERATION_ID_REQUIRED";
    recoveryRequired = true;
  } else {
    classification = "PENDING_HOLD";
    recoveryRequired = true;
  }
  return structuralClassification({
    classification,
    retryAllowedOnlyWithSameOperationId: recoveryRequired,
    recoveryRequired,
    structuralModelOnly: true,
  });
}

const COMMIT_UNKNOWN_PHASES = ObjectFreeze([
  "REGISTER_CAPTURE",
  "LEASE_GRANT",
  "LEASE_RELEASE",
  "DRAIN_BARRIER",
  "PURGE_INTENT",
  "RAW_DELETE",
  "PURGE_RECEIPT",
]);
const EXTERNAL_OBSERVATIONS = ObjectFreeze([
  "NOT_FOUND",
  "PREPARED",
  "COMMITTED",
  "REJECTED",
  "UNREACHABLE",
]);
const LOCAL_OBSERVATIONS = ObjectFreeze([
  "NONE",
  "EXACT_PRESENT",
  "ABSENT",
  "DIVERGED",
  "IO_UNKNOWN",
  "RECEIPT_EXACT",
]);

export function classifyAutonomousWorkOrderLifecycleBrokerCommitUnknownV1(
  input,
) {
  const record = fixedRecord(input, "COMMIT_UNKNOWN_INPUT");
  const phase = enumValue(dataField(record, "phase", "COMMIT_UNKNOWN_INPUT"),
    COMMIT_UNKNOWN_PHASES, "COMMIT_UNKNOWN_PHASE");
  const externalObservation = enumValue(dataField(record,
    "externalObservation", "COMMIT_UNKNOWN_INPUT"), EXTERNAL_OBSERVATIONS,
  "EXTERNAL_OBSERVATION");
  const localObservation = enumValue(dataField(record, "localObservation",
    "COMMIT_UNKNOWN_INPUT"), LOCAL_OBSERVATIONS, "LOCAL_OBSERVATION");

  let classification = "HOLD_RECOVERY_REQUIRED";
  let sameOperationIdMayBeReplayed = false;
  if (localObservation === "DIVERGED"
    || localObservation === "IO_UNKNOWN") {
    classification = "LOCAL_OBSERVATION_UNSAFE_HOLD";
  } else if (externalObservation === "COMMITTED") {
    const compatibleCommittedObservation = phase === "RAW_DELETE"
      ? localObservation === "ABSENT"
      : localObservation === "RECEIPT_EXACT";
    classification = compatibleCommittedObservation
      ? "RECOVER_COMMITTED" : "EXTERNAL_LOCAL_CONFLICT_HOLD";
  } else if (externalObservation === "REJECTED") {
    const compatibleRejectedObservation = phase === "RAW_DELETE"
      ? localObservation === "EXACT_PRESENT" || localObservation === "NONE"
      : localObservation === "NONE";
    classification = compatibleRejectedObservation
      ? "RECOVER_REJECTED" : "EXTERNAL_LOCAL_CONFLICT_HOLD";
  } else if (externalObservation === "PREPARED"
    && phase === "RAW_DELETE"
    && (localObservation === "EXACT_PRESENT"
      || localObservation === "ABSENT")) {
    classification = "INSPECT_FIXED_LEAF_BEFORE_RESUME";
  } else if (externalObservation === "PREPARED") {
    classification = "EXTERNAL_LOCAL_CONFLICT_HOLD";
  } else if (externalObservation === "NOT_FOUND"
    && localObservation === "NONE") {
    classification = "REPLAY_SAME_OPERATION_ID_ONLY";
    sameOperationIdMayBeReplayed = true;
  } else if (externalObservation === "NOT_FOUND") {
    classification = "LOCAL_EXTERNAL_DIVERGENCE_HOLD";
  }
  return structuralClassification({
    classification,
    sameOperationIdMayBeReplayed,
    blindRetryAllowed: false,
    recoveryRequired: classification !== "RECOVER_COMMITTED"
      && classification !== "RECOVER_REJECTED",
    structuralModelOnly: true,
  });
}

const RAW_EXTERNAL_STATES = ObjectFreeze([
  "NOT_STARTED", "PREPARED", "COMMITTED",
]);
const RAW_LOCAL_STATES = ObjectFreeze([
  "EXACT_PRESENT", "ABSENT", "DIVERGED", "DIRECTORY", "IO_UNKNOWN",
]);

export function classifyAutonomousWorkOrderLifecycleBrokerRawPrefixRecoveryV1(
  input,
) {
  const record = fixedRecord(input, "RAW_PREFIX_RECOVERY_INPUT");
  const externalRows = dataField(record, "externalRows",
    "RAW_PREFIX_RECOVERY_INPUT");
  const localRows = dataField(record, "localRows",
    "RAW_PREFIX_RECOVERY_INPUT");
  fixedArray(externalRows, RAW_ROLE_COUNT, RAW_ROLE_COUNT,
    "RAW_EXTERNAL_ROWS");
  fixedArray(localRows, RAW_ROLE_COUNT, RAW_ROLE_COUNT, "RAW_LOCAL_ROWS");

  let committedPrefix = 0;
  let preparedOrdinal = null;
  let sawNonCommitted = false;
  for (let index = 0; index < RAW_ROLE_COUNT; index += 1) {
    const ordinal = index + 1;
    const external = enumValue(arrayDataField(externalRows, index,
      "RAW_EXTERNAL_ROWS"), RAW_EXTERNAL_STATES, "RAW_EXTERNAL_STATE");
    const local = enumValue(arrayDataField(localRows, index,
      "RAW_LOCAL_ROWS"), RAW_LOCAL_STATES, "RAW_LOCAL_STATE");
    if (local === "DIRECTORY") {
      return structuralClassification({
        classification: "DIRECTORY_TARGET_NONRECURSIVE_HOLD",
        committedPrefix,
        preparedOrdinal,
        nextOrdinal: null,
        postIntentRawForbidden: true,
        recursiveDeleteForbidden: true,
        structuralModelOnly: true,
      });
    }
    if (external === "COMMITTED") {
      if (sawNonCommitted || local !== "ABSENT") {
        return structuralClassification({
          classification: local === "EXACT_PRESENT"
            ? "FILESYSTEM_ROLLBACK_HOLD" : "NON_PREFIX_DIVERGENCE_HOLD",
          committedPrefix,
          preparedOrdinal,
          nextOrdinal: null,
          postIntentRawForbidden: true,
          structuralModelOnly: true,
        });
      }
      committedPrefix = ordinal;
    } else {
      sawNonCommitted = true;
      if (external === "PREPARED") {
        if (preparedOrdinal !== null || ordinal !== committedPrefix + 1) {
          return structuralClassification({
            classification: "NON_PREFIX_DIVERGENCE_HOLD",
            committedPrefix,
            preparedOrdinal,
            nextOrdinal: null,
            postIntentRawForbidden: true,
            structuralModelOnly: true,
          });
        }
        preparedOrdinal = ordinal;
        if (local === "DIVERGED") {
          return structuralClassification({
            classification: "IDENTITY_DIVERGED_HOLD",
            committedPrefix,
            preparedOrdinal,
            nextOrdinal: null,
            postIntentRawForbidden: true,
            structuralModelOnly: true,
          });
        }
        if (local === "IO_UNKNOWN") {
          return structuralClassification({
            classification: "LOCAL_COMMIT_UNKNOWN",
            committedPrefix,
            preparedOrdinal,
            nextOrdinal: ordinal,
            postIntentRawForbidden: true,
            structuralModelOnly: true,
          });
        }
      } else if (local !== "EXACT_PRESENT") {
        return structuralClassification({
          classification: local === "IO_UNKNOWN"
            ? "LOCAL_COMMIT_UNKNOWN" : "NON_PREFIX_DIVERGENCE_HOLD",
          committedPrefix,
          preparedOrdinal,
          nextOrdinal: null,
          postIntentRawForbidden: true,
          structuralModelOnly: true,
        });
      }
    }
  }

  let classification;
  let nextOrdinal;
  if (preparedOrdinal !== null) {
    const preparedLocal = arrayDataField(localRows, preparedOrdinal - 1,
      "RAW_LOCAL_ROWS");
    classification = preparedLocal === "ABSENT"
      ? "RECOVER_PREPARED_AS_COMMITTED"
      : "RETRY_EXACT_PREPARED_DELETE";
    nextOrdinal = preparedOrdinal;
  } else if (committedPrefix === RAW_ROLE_COUNT) {
    classification = "RAW_ABSENCE_VERIFICATION_REQUIRED";
    nextOrdinal = null;
  } else {
    classification = "PREPARE_NEXT_ORDINAL";
    nextOrdinal = committedPrefix + 1;
  }
  return structuralClassification({
    classification,
    committedPrefix,
    preparedOrdinal,
    nextOrdinal,
    postIntentRawForbidden: true,
    structuralModelOnly: true,
  });
}

function descendantRow(value, expectedSequence) {
  const record = fixedRecord(value, "DESCENDANT_ROW");
  const sequence = safeInteger(dataField(record, "sequence",
    "DESCENDANT_ROW"), 1, MAX_DESCENDANTS, "DESCENDANT_SEQUENCE");
  if (sequence !== expectedSequence) fail("DESCENDANT_SEQUENCE_GAP");
  const id = patternString(dataField(record, "descendantId",
    "DESCENDANT_ROW"), DESCENDANT_ID, "DESCENDANT_ID");
  const descendantType = enumValue(dataField(record, "descendantType",
    "DESCENDANT_ROW"),
  AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_DESCENDANT_TYPES_V1,
  "DESCENDANT_TYPE");
  const terminalState = enumValue(dataField(record, "terminalState",
    "DESCENDANT_ROW"), ObjectFreeze(["SEALED", "ABORTED"]),
  "DESCENDANT_TERMINAL_STATE");
  const subjectHash = hash(dataField(record, "subjectHash",
    "DESCENDANT_ROW"), "DESCENDANT_SUBJECT_HASH");
  const creationReceiptHash = hash(dataField(record, "creationReceiptHash",
    "DESCENDANT_ROW"), "DESCENDANT_CREATION_RECEIPT_HASH");
  const contentHashValue = dataField(record, "contentHash",
    "DESCENDANT_ROW");
  const contentHash = contentHashValue === null
    ? null : hash(contentHashValue, "DESCENDANT_CONTENT_HASH");
  if ((terminalState === "SEALED" && contentHash === null)
    || (terminalState === "ABORTED" && contentHash !== null)) {
    fail("DESCENDANT_CONTENT_TERMINAL_MISMATCH");
  }
  const producerReceiptHash = hash(dataField(record, "producerReceiptHash",
    "DESCENDANT_ROW"), "DESCENDANT_PRODUCER_RECEIPT_HASH");
  return ObjectFreeze({
    sequence,
    descendantId: id,
    descendantType,
    terminalState,
    subjectHash,
    creationReceiptHash,
    contentHash,
    producerReceiptHash,
  });
}

export function createAutonomousWorkOrderLifecycleBrokerDescendantCensusModelV1(
  input,
) {
  const record = fixedRecord(input, "DESCENDANT_CENSUS_INPUT");
  const capture = captureId(dataField(record, "captureId",
    "DESCENDANT_CENSUS_INPUT"));
  const highWatermark = safeInteger(dataField(record, "highWatermark",
    "DESCENDANT_CENSUS_INPUT"), 0, MAX_DESCENDANTS,
  "DESCENDANT_HIGH_WATERMARK");
  const rowsInput = dataField(record, "rows", "DESCENDANT_CENSUS_INPUT");
  const length = fixedArray(rowsInput, highWatermark, highWatermark,
    "DESCENDANT_ROWS");
  const rows = [];
  const seenDescendantIds = new SetConstructor();
  for (let index = 0; index < length; index += 1) {
    const row = descendantRow(
      arrayDataField(rowsInput, index, "DESCENDANT_ROWS"),
      index + 1,
    );
    const rowId = dataField(row, "descendantId", "DESCENDANT_ROW_MODEL");
    if (SetPrototypeHas(seenDescendantIds, rowId)) {
      fail("DESCENDANT_ID_DUPLICATE");
    }
    SetPrototypeAdd(seenDescendantIds, rowId);
    defineOwnData(rows, StringConstructor(index), row);
  }
  ObjectFreeze(rows);
  return ObjectFreeze({
    schema:
      AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_SCHEMAS
        .descendantCensus,
    structuralModelOnly: true,
    captureId: capture,
    highWatermark,
    rowCount: length,
    rows,
    continuousSequenceStructurallyVerified: true,
    uniqueDescendantIdsStructurallyVerified: true,
    allRowsTerminalStructurallyVerified: true,
    censusHash: null,
    censusHashComputed: false,
    producerRegistrationCompletenessEstablished: false,
    globalDescendantCensusCompletenessEstablished: false,
    durableZeroLeaseProofEstablished: false,
    externalDurabilityEstablished: false,
    permitsPurgeIntent: false,
  });
}

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_BOUNDARY
  = ObjectFreeze({
    status: "AUDITED_DRAFT_NOT_INTEGRATED",
    decisionState: "HOLD",
    disposition: "STRUCTURAL_MODEL_ONLY",
    structuralModelOnly: true,
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledConsequenceUnits: 0,
    consequenceReach: "NONE",
    networkConsequenceReach: "NONE",

    rpcOperationCount: RPC_OPERATION_COUNT,
    rawRoleCount: RAW_ROLE_COUNT,
    productionEntryPointCount: 1,
    productionEntryPointZeroArgument: true,
    productionEntryPointFixedTypedHold: true,
    productionEntryPointInspectsInput: false,

    fixedDescriptorProjectionOnly: true,
    callerObjectsEnumerated: false,
    unknownCallerFieldsEnumerated: false,
    unknownCallerFieldsForwarded: false,
    proxyInputsRejectedBeforeDescriptorAccess: true,
    inputBudgetsFinite: true,
    callerHashesRecomputed: false,
    localStructuralHashComputed: false,
    localStructuralCommitmentIsExternalEvidence: false,

    filesystemImportPresent: false,
    pathImportPresent: false,
    operatingSystemImportPresent: false,
    processImportPresent: false,
    networkImportPresent: false,
    nativeAddonImportPresent: false,
    transportCapabilityPresent: false,
    signatureCapabilityPresent: false,
    filesystemCapabilityPresent: false,
    deletionCapabilityPresent: false,
    recursiveDeleteCapabilityPresent: false,
    callerPathAccepted: false,
    callerLeafNameAccepted: false,
    callerRawBytesAccepted: false,
    rawDescriptorAccepted: false,
    rawDescriptorReturned: false,
    descriptorTransferAllowed: false,

    productionBrokerImplemented: false,
    productionBrokerProvisioned: false,
    dedicatedOsIdentityProvisioned: false,
    trustedRootProvisioned: false,
    stableAncestorHandleEstablished: false,
    nofollowRelativeLeafOperationEstablished: false,
    sameUserRaceExclusionEstablished: false,
    exactNonrecursiveDeleteIntegrated: false,
    automaticLocalDeleteEnabled: false,

    sharedExternalLifecycleHeadEstablished: false,
    dualJournalCasVerificationIntegrated: false,
    registryHeadIsIndependentExternalWitness: false,
    ownerRollbackResistanceEstablished: false,
    externalDurabilityEstablished: false,
    externalSignatureVerified: false,
    nonEquivocationEstablished: false,

    captureRegistrationIntegrated: false,
    captureRegistrationBeforeFirstGetEstablished: false,
    runRegisteredRawOperationIntegrated: false,
    rawFdExportEverAllowed: false,
    staleLeaseAutomaticResolutionAllowed: false,
    drainBarrierIntegrated: false,
    drainBarrierIsDeleteAuthorization: false,
    zeroDurableLeasesEstablished: false,
    durableZeroLeaseProofEstablished: false,
    crossEventEvidenceBindingEstablished: false,
    lifecycleChainCompletionEstablished: false,
    stateReceiptSuccessEstablished: false,
    classificationIsExecutionAuthority: false,
    observationsIndependentlyVerified: false,
    verifiedPurgeEligibilityIntegrated: false,
    purgeIntentIntegrated: false,
    tombstoneCascadeIntegrated: false,
    crashResumeIntegrated: false,
    incompleteRawCensusIntegrated: false,
    globalDescendantCensusCompletenessEstablished: false,
    producerRegistrationCompletenessEstablished: false,

    currentGithubAcquisitionIntegrated: false,
    currentGithubPublicationIntegrated: false,
    currentDisputeReviewSourceBundleIntegrated: false,
    currentProductionConsumersUseSameExternalHead: false,
    existingAcquisitionAndPublicationKillGatesLifted: false,

    secureEraseEstablished: false,
    physicalMediaErasureEstablished: false,
    backupOrRemoteCopyDeletionEstablished: false,
    rightsClearanceEstablished: false,
    privacyClearanceEstablished: false,
    sourceReplayVerified: false,
    directParticipantConfirmationEstablished: false,
    networkOrderEstablished: false,
    rightsPrivacyAdjudicationEstablished: false,
    independentOutcomeEstablished: false,
    outcomeTruthEstablished: false,
    causalAttributionEstablished: false,
    recoveryEstablished: false,
    closureEstablished: false,
    nativeSafetyUnconditionalVetoPreserved: true,
    outsiderCanOverrideNativeSafetyVeto: false,

    stage1EngineeringGateSatisfied: false,
    stage1ExternalFactGateSatisfied: false,
    stage1EngineeringGatePassed: false,
    stage1ExternalFactGatePassed: false,
    stage1Complete: false,
    stage2Permitted: false,

    actionAuthorized: false,
    actionAdmissions: 0,
    actionUnits: 0,
    automaticTraining: false,
    productionTrainingAuthorized: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    CEU: 0,
    actorCredit: false,
    pricingAuthorized: false,
    pricingUnits: 0,
    guaranteeEstablished: false,
    guaranteeUnits: 0,
    insuranceEstablished: false,
    insuranceUnits: 0,
    settlementAuthorized: false,
    settlementUnits: 0,
    custodyEstablished: false,
    custodyUnits: 0,
    fundsVerified: false,
    platformAdvanceEnabled: false,
    moneyMovementEnabled: false,
    moneyMovementUnits: 0,
  });

export const AUTONOMOUS_WORK_ORDER_LIFECYCLE_BROKER_CONTRACT_V1_PRODUCTION_HOLD_CODE
  = PRODUCTION_HOLD_CODE;

export function invokeAutonomousWorkOrderLifecycleProductionBrokerV1() {
  throw new TypeErrorConstructor(PRODUCTION_HOLD_CODE);
}
