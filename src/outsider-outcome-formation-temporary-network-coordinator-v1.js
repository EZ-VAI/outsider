/*
 * Outcome Formation Engine: multi-slot temporary-network coordinator v1.
 *
 * This pure descendant composes one exactly replayed temporary-network v2
 * source for every mandatory RESOURCE, EVIDENCE, and RECOVERY requirement,
 * plus the exact per-tender formation-control ledger. It performs no I/O and
 * cannot create authority, capacity, action, price, guarantee, or settlement.
 */

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES,
  verifyFormationControlLedgerV1,
} from "./outsider-formation-control-ledger-v1.js";
import {
  verifyOutcomeFormationTemporaryNetworkV2,
} from "./outsider-outcome-formation-temporary-network-v2.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const BufferAlloc = Buffer.alloc;
const BufferByteLength = Buffer.byteLength;
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
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
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const TypeErrorConstructor = TypeError;
const TypedArrayPrototype = ObjectGetPrototypeOf(Uint8Array.prototype);
const TypedArrayByteLength = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(TypedArrayPrototype, "byteLength").get);
const TypedArraySet = Function.prototype.call.bind(TypedArrayPrototype.set);

const PREFIX
  = "OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MANDATORY_KINDS = ObjectFreeze(["RESOURCE", "EVIDENCE", "RECOVERY"]);
const BUFFER_FORBIDDEN_OWN_KEYS = ObjectFreeze([
  "length", "byteLength", "byteOffset", "buffer", "set", "subarray",
  Symbol.iterator,
]);

const MAX_SINGLE_BUFFER_BYTES = 1024 * 1024;
const MAX_AGGREGATE_BUFFER_BYTES = 192 * 1024 * 1024;
const MAX_SINGLE_STRING_BYTES = 1024 * 1024;
const MAX_AGGREGATE_STRING_BYTES = 256 * 1024 * 1024;
const MAX_ARRAY_LENGTH = 32_768;
const MAX_AGGREGATE_ARRAY_ELEMENTS = 750_000;
const MAX_TREE_NODES = 1_800_000;
const MAX_TREE_KEYS = 5_400_000;
const MAX_TREE_DEPTH = 128;
/* Exact upper bound of the frozen tender vocabulary: 64 RESOURCE,
   64 EVIDENCE, and 32 RECOVERY requirements. */
const MAX_TRANSACTION_SLOTS = 160;

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_SCHEMAS
  = ObjectFreeze({
    coordinator:
      "outsider/outcome-formation-temporary-network-coordinator/v1",
    verification:
      "outsider/outcome-formation-temporary-network-coordinator-verification/v1",
  });

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_STATES
  = ObjectFreeze({
    forming: "CONTINUE_AUTOMATED_FORMATION_HOLD",
    declined: "DECLINE_NOT_HUMAN_QUEUE",
  });

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_LIMITS
  = ObjectFreeze({
    maximumSingleBufferBytes: MAX_SINGLE_BUFFER_BYTES,
    maximumAggregateBufferBytes: MAX_AGGREGATE_BUFFER_BYTES,
    maximumSingleStringBytes: MAX_SINGLE_STRING_BYTES,
    maximumAggregateStringBytes: MAX_AGGREGATE_STRING_BYTES,
    maximumArrayLength: MAX_ARRAY_LENGTH,
    maximumAggregateArrayElements: MAX_AGGREGATE_ARRAY_ELEMENTS,
    maximumTreeNodes: MAX_TREE_NODES,
    maximumTreeKeys: MAX_TREE_KEYS,
    maximumTreeDepth: MAX_TREE_DEPTH,
    maximumTransactionSlots: MAX_TRANSACTION_SLOTS,
  });

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_BOUNDARY
  = deepFreeze({
    position: "MULTI_SLOT_TEMPORARY_NETWORK_FORMATION_COORDINATOR_HOLD",
    oneRawReplayedV2SlotPerMandatoryRequirement: true,
    mandatoryRequirementKinds: MANDATORY_KINDS,
    selectedV1RowBijectionRequired: true,
    exactSharedV1PredecessorRequired: true,
    exactControlLedgerSourceReplayRequired: true,
    derivedTrustBooleansAcceptedAsInput: false,
    outputOnlyOrResealedVerificationAccepted: false,
    aggregatePreflightBeforeDependencyVerification: true,
    providerRegistrationRequired: false,
    liveIoPerformed: false,
    networkIoPerformed: false,
    liveSearchingPerformed: false,
    providerContactPerformed: false,
    tenderSentByThisModule: false,
    credentialsAcceptedOrHandled: false,
    rawPrivateSourceBytesProjected: false,
    recipientThreadMessageSourceSystemOrKeyIdentifiersProjected: false,
    individualPrivateSourceReplayHashesProjected: false,
    saltedAggregatePrivateDependencyCommitmentProjected: true,
    providerRefInequalityUsedAsIndependenceProof: false,
    providerIdentityOrGlobalScoreCreated: false,
    identityByIpDeviceOrBaseModelForbidden: true,
    typedGraphModel:
      "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT",
    occurrenceDenominatorsPreserved: true,
    occurrenceCensusSeparatedFromObjectDedup: true,
    controlLedgerNonOmissionBeyondCallerPinEstablished: false,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    independentResourceOwnerTrustRootEstablished: false,
    transactionDriverPresent: false,
    resourceOwnerAuthorityEstablished: false,
    primaryExecutionCapacityReserved: false,
    recoveryCapacityReserved: false,
    independentWitnessCapacityReserved: false,
    independentWitnessIndependenceEstablished: false,
    maximumLossBoundEstablished: false,
    fundingAndCapitalSufficiencyEstablished: false,
    lawfulTransactionAndPaymentPathEstablished: false,
    trustedTimeEstablished: false,
    zeroStaffTouchCompletenessEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    authorityEstablished: false,
    sendAuthorized: false,
    actionReady: false,
    executable: false,
    internalHumanFallbackPermitted: false,
    humanQueueCreated: false,
    anyRecordedOutsiderStaffTouchPermanentlyDisqualifiesCommitment: true,
    incompleteAtOrAfterDeadlineDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    preDeadlineIncompleteDisposition: "CONTINUE_AUTOMATED_FORMATION_HOLD",
    userOutcomePromiseIssued: false,
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
  });

const SOURCE_FIELDS = ObjectFreeze([
  "observedAt", "slotReplays", "controlLedgerReplay",
  "privateProjectionNonce",
]);
const SLOT_FIELDS = ObjectFreeze(["source", "expectedTemporaryNetworkHash"]);
const CONTROL_FIELDS = ObjectFreeze([
  "record", "source", "expectedSourceHash", "expectedLedgerHash",
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
  if (value === null || typeof value !== "object" || BufferIsBuffer(value)
    || SetHas(seen, value) || ObjectIsFrozen(value)) return value;
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

function clonePreflight(untrusted) {
  const budget = { buffers: 0, bytes: 0, strings: 0, stringBytes: 0,
    arrayElements: 0, nodes: 0, keys: 0 };
  const active = new SetConstructor();

  function visit(value, depth) {
    if (depth > MAX_TREE_DEPTH) fail("INPUT_TREE_TOO_DEEP");
    if (typeof value === "string") {
      const bytes = BufferByteLength(value, "utf8");
      budget.strings += 1;
      budget.stringBytes += bytes;
      if (bytes > MAX_SINGLE_STRING_BYTES) fail("STRING_BYTE_LIMIT_EXCEEDED");
      if (budget.stringBytes > MAX_AGGREGATE_STRING_BYTES) {
        fail("AGGREGATE_STRING_BYTE_LIMIT_EXCEEDED");
      }
      return value;
    }
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!NumberIsFinite(value) || ObjectIs(value, -0)) fail("NUMBER_INVALID");
      return value;
    }
    if (typeof value !== "object") fail("INPUT_VALUE_TYPE_FORBIDDEN");
    if (isProxy(value)) fail("PROXY_FORBIDDEN");
    if (SetHas(active, value)) fail("CYCLIC_OBJECT_FORBIDDEN");
    budget.nodes += 1;
    if (budget.nodes > MAX_TREE_NODES) fail("TREE_NODE_LIMIT_EXCEEDED");

    if (BufferIsBuffer(value)) {
      for (let index = 0; index < BUFFER_FORBIDDEN_OWN_KEYS.length; index += 1) {
        if (ObjectGetOwnPropertyDescriptor(value,
          BUFFER_FORBIDDEN_OWN_KEYS[index])) {
          fail("DECORATED_SOURCE_BUFFER_FORBIDDEN");
        }
      }
      const length = TypedArrayByteLength(value);
      budget.buffers += 1;
      budget.bytes += length;
      if (length > MAX_SINGLE_BUFFER_BYTES) {
        fail("SINGLE_BUFFER_BYTE_LIMIT_EXCEEDED");
      }
      if (budget.bytes > MAX_AGGREGATE_BUFFER_BYTES) {
        fail("AGGREGATE_BUFFER_BYTE_LIMIT_EXCEEDED");
      }
      const keys = ReflectOwnKeys(value);
      budget.keys += keys.length;
      if (keys.length !== length || budget.keys > MAX_TREE_KEYS) {
        fail("DECORATED_SOURCE_BUFFER_FORBIDDEN");
      }
      for (let index = 0; index < keys.length; index += 1) {
        const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
        if (keys[index] !== StringConstructor(index) || !descriptor
          || !ObjectHasOwn(descriptor, "value")
          || descriptor.enumerable !== true) {
          fail("DECORATED_SOURCE_BUFFER_FORBIDDEN");
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
    const descriptors = ObjectGetOwnPropertyDescriptors(value);
    const keys = ReflectOwnKeys(descriptors);
    budget.keys += keys.length;
    if (budget.keys > MAX_TREE_KEYS) fail("TREE_KEY_LIMIT_EXCEEDED");
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = descriptors[key];
      if (typeof key !== "string") fail("SYMBOL_KEY_FORBIDDEN");
      if (!descriptor || !ObjectHasOwn(descriptor, "value")) {
        fail("ACCESSOR_FORBIDDEN");
      }
      if ((!array || key !== "length") && descriptor.enumerable !== true) {
        fail("NON_ENUMERABLE_FIELD_FORBIDDEN");
      }
      if (key === "__proto__" || key === "prototype"
        || key === "constructor") fail("DANGEROUS_KEY_FORBIDDEN");
    }

    SetAdd(active, value);
    if (array) {
      if (!NumberIsSafeInteger(value.length) || value.length > MAX_ARRAY_LENGTH) {
        fail("ARRAY_LENGTH_LIMIT_EXCEEDED");
      }
      budget.arrayElements += value.length;
      if (budget.arrayElements > MAX_AGGREGATE_ARRAY_ELEMENTS) {
        fail("AGGREGATE_ARRAY_ELEMENT_LIMIT_EXCEEDED");
      }
      if (keys.length !== value.length + 1
        || !ObjectHasOwn(descriptors, "length")) {
        fail("SPARSE_OR_DECORATED_ARRAY_FORBIDDEN");
      }
      const result = [];
      for (let index = 0; index < value.length; index += 1) {
        const key = StringConstructor(index);
        if (!ObjectHasOwn(descriptors, key)) {
          fail("SPARSE_OR_DECORATED_ARRAY_FORBIDDEN");
        }
        append(result, visit(descriptors[key].value, depth + 1));
      }
      SetDelete(active, value);
      return result;
    }

    const result = ObjectCreate(ObjectPrototype);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      ObjectDefineProperty(result, key, {
        value: visit(descriptors[key].value, depth + 1),
        enumerable: true, writable: true, configurable: true,
      });
    }
    SetDelete(active, value);
    return result;
  }

  return { source: visit(untrusted, 0), budget };
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || BufferIsBuffer(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    let expected = false;
    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
      if (key === fields[fieldIndex]) expected = true;
    }
    if (typeof key !== "string" || !expected || !descriptor
      || !ObjectHasOwn(descriptor, "value")
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

function digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, BufferFrom(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
  return `sha256:${HashDigest(state, "hex")}`;
}

function same(left, right) {
  return isDeepStrictEqual(left, right);
}

function requirementKey(kind, id) {
  return `${kind}:${id}`;
}

function mandatoryKind(kind) {
  for (let index = 0; index < MANDATORY_KINDS.length; index += 1) {
    if (MANDATORY_KINDS[index] === kind) return true;
  }
  return false;
}

function requireFalse(value, fields, code) {
  for (let index = 0; index < fields.length; index += 1) {
    if (value[fields[index]] !== false) fail(code);
  }
}

function verifySlot(wrapper) {
  exactObject(wrapper, SLOT_FIELDS, "SLOT_REPLAY");
  const expected = hash(wrapper.expectedTemporaryNetworkHash,
    "EXPECTED_V2_TEMPORARY_NETWORK_HASH");
  const checked = verifyOutcomeFormationTemporaryNetworkV2(wrapper.source,
    expected);
  if (checked.ok !== true || checked.temporaryNetworkHash !== expected
    || checked.fullRawDependencyReplayPerformed !== true
    || checked.exactTypedGraphAndTransactionCrossBindingVerified !== true
    || checked.normalizedTransactionSlot?.slotCount !== 1
    || checked.normalizedTransactionSlot
      .transactionOccurrenceDenominatorsPreserved !== true
    || checked.replayBoundary?.temporaryNetworkV1SourceRebuiltAndPinned !== true
    || checked.replayBoundary
      .transactionInterfaceRawSourceRebuiltAndPinned !== true
    || checked.replayBoundary
      .resourceOwnerStandingRawSourceRebuiltAndPinned !== true
    || checked.replayBoundary
      .exactTenderGraphEpisodeAttemptRequirementRouteProviderResponseCrossBound
        !== true
    || checked.replayBoundary.derivedTrustBooleansAcceptedAsInput !== false
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false) {
    fail("V2_SLOT_SOURCE_REPLAY_FAILED");
  }
  requireFalse(checked, ["independentResourceOwnerTrustRootEstablished",
    "externalCapacityEstablished", "capacityReserved", "authorityEstablished",
    "sendAuthorized", "providerContactPerformed", "liveIoPerformed",
    "pricingPermitted", "guaranteeEstablished", "settlementPermitted"],
  "V2_SLOT_BOUNDARY_ROLLBACK");
  return { wrapper, checked, expected };
}

function verifyControl(wrapper) {
  exactObject(wrapper, CONTROL_FIELDS, "CONTROL_LEDGER_REPLAY");
  const expectedSourceHash = hash(wrapper.expectedSourceHash,
    "EXPECTED_CONTROL_SOURCE_HASH");
  const expectedLedgerHash = hash(wrapper.expectedLedgerHash,
    "EXPECTED_CONTROL_LEDGER_HASH");
  const checked = verifyFormationControlLedgerV1(wrapper.record, {
    source: wrapper.source,
    expectedSourceHash,
    expectedLedgerHash,
  });
  if (checked.ok !== true || checked.exactSourceReplayVerified !== true
    || checked.callerSourcePinMatched !== true
    || checked.ledgerRecordRebuilt !== true
    || checked.expectedLedgerHashMatched !== true
    || checked.appendOnlyPredecessorAndHeadVerified !== true
    || checked.occurrenceDenominatorReplayed !== true
    || checked.nonceLifecycleReplayed !== true
    || checked.staffTouchAccountingReplayed !== true
    || checked.outputOnlyVerificationPermitted !== false
    || checked.formationCommitmentAuthorized !== false
    || checked.capacityReserved !== false
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false) {
    fail("CONTROL_LEDGER_SOURCE_REPLAY_FAILED");
  }
  return { wrapper, checked, expectedSourceHash, expectedLedgerHash };
}

function sharedPredecessor(slots, observedAt) {
  const first = slots[0].wrapper.source.temporaryNetworkV1Replay;
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    if (!same(slot.wrapper.source.temporaryNetworkV1Replay, first)
      || slot.wrapper.source.observedAt !== observedAt
      || slot.checked.observedAt !== observedAt
      || slot.checked.lineage.predecessorTemporaryNetworkHash
        !== first.expectedTemporaryNetworkHash
      || slot.checked.lineage.supersedesTemporaryNetworkHash
        !== first.expectedTemporaryNetworkHash
      || slot.checked.lineage.predecessorSourceRebuiltAndPinned !== true) {
      fail("SLOTS_DO_NOT_SHARE_EXACT_V1_PREDECESSOR");
    }
  }
  return first;
}

function graphBinding(slots, tender, control) {
  const expected = {
    tenderHash: tender.tenderHash,
    workOrderHash: tender.workOrderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    principalEpochProjectionHash:
      tender.typedGraph.principalEpoch.principalEpochProjectionHash,
    accountableDeploymentSubjectHash:
      tender.typedGraph.accountableDeployment.accountableDeploymentSubjectHash,
    runtimeInstanceHash: tender.typedGraph.runtime.runtimeInstanceHash,
    embodimentRevisionHash:
      tender.typedGraph.embodiment.embodimentRevisionHash,
    delegationEdgeHash: tender.typedGraph.delegation.delegationEdgeHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    networkCompleteEpisodeJoinHash:
      tender.typedGraph.episode.networkCompleteEpisodeJoinHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
  };
  const ledger = control.wrapper.record.tenderBinding;
  if (!same(control.wrapper.source.tender, tender)
    || control.wrapper.source.expectedTenderHash !== tender.tenderHash
    || control.checked.tenderHash !== expected.tenderHash
    || control.checked.typedGraphHash !== expected.typedGraphHash
    || control.checked.episodeHash !== expected.episodeHash
    || control.checked.attemptHash !== expected.attemptHash
    || ledger.tenderHash !== expected.tenderHash
    || ledger.workOrderHash !== expected.workOrderHash
    || ledger.typedGraphHash !== expected.typedGraphHash
    || ledger.principalEpochProjectionHash
      !== expected.principalEpochProjectionHash
    || ledger.accountableDeploymentSubjectHash
      !== expected.accountableDeploymentSubjectHash
    || ledger.runtimeInstanceHash !== expected.runtimeInstanceHash
    || ledger.embodimentRevisionHash !== expected.embodimentRevisionHash
    || ledger.delegationEdgeHash !== expected.delegationEdgeHash
    || ledger.episodeHash !== expected.episodeHash
    || ledger.networkCompleteEpisodeJoinHash
      !== expected.networkCompleteEpisodeJoinHash
    || ledger.attemptHash !== expected.attemptHash
    || ledger.exactTenderSourceReplayed !== true) {
    fail("CONTROL_TENDER_TYPED_GRAPH_EPISODE_ATTEMPT_SPLICE");
  }
  for (let index = 0; index < slots.length; index += 1) {
    const binding = slots[index].checked.tenderBinding;
    if (binding.tenderHash !== expected.tenderHash
      || binding.workOrderHash !== expected.workOrderHash
      || binding.typedGraphHash !== expected.typedGraphHash
      || binding.principalEpochProjectionHash
        !== expected.principalEpochProjectionHash
      || binding.accountableDeploymentSubjectHash
        !== expected.accountableDeploymentSubjectHash
      || binding.runtimeInstanceHash !== expected.runtimeInstanceHash
      || binding.embodimentRevisionHash !== expected.embodimentRevisionHash
      || binding.delegationEdgeHash !== expected.delegationEdgeHash
      || binding.episodeHash !== expected.episodeHash
      || binding.attemptHash !== expected.attemptHash
      || binding.exactTypedGraphPathCrossBoundAcrossAllSources !== true) {
      fail("SLOT_TENDER_TYPED_GRAPH_EPISODE_ATTEMPT_SPLICE");
    }
  }
  return expected;
}

function mandatoryCoverage(v1Record) {
  const coverage = v1Record.requirementCoverage;
  const selected = v1Record.selectedRouteResponses;
  if (!ArrayIsArray(coverage) || !ArrayIsArray(selected)) {
    fail("V1_REQUIREMENT_COVERAGE_INVALID");
  }
  const mandatory = [];
  for (let index = 0; index < coverage.length; index += 1) {
    const row = coverage[index];
    if (row.mandatory === true) {
      if (!mandatoryKind(row.requirementKind)) {
        fail("MANDATORY_REQUIREMENT_KIND_UNSUPPORTED");
      }
      append(mandatory, row);
    }
  }
  if (mandatory.length < 3 || mandatory.length > MAX_TRANSACTION_SLOTS
    || v1Record.coverageSummary.mandatoryRequirementCount !== mandatory.length
    || v1Record.coverageSummary.selectedRouteResponseCount !== selected.length
    || selected.length !== mandatory.length) {
    fail("MANDATORY_REQUIREMENT_SELECTED_ROW_COUNT_MISMATCH");
  }
  return { mandatory, selected };
}

function findExactly(rows, predicate, code) {
  let match = null;
  let count = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (predicate(rows[index])) {
      match = rows[index];
      count += 1;
    }
  }
  if (count !== 1) fail(code);
  return match;
}

function slotBijection(slots, v1Record) {
  const { mandatory, selected } = mandatoryCoverage(v1Record);
  if (slots.length !== mandatory.length) {
    fail("SLOT_COUNT_NOT_MANDATORY_REQUIREMENT_COUNT");
  }
  const projections = [];
  let permissionOccurrences = 0;
  let responseOccurrences = 0;
  let transportOccurrences = 0;
  let inboundOccurrences = 0;
  let ownerOccurrences = 0;
  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index].checked.normalizedTransactionSlot;
    const coverage = findExactly(mandatory, (row) =>
      row.requirementKind === slot.requirementKind
        && row.requirementId === slot.requirementId,
    "SLOT_NOT_EXACTLY_ONE_MANDATORY_REQUIREMENT");
    const selectedRow = findExactly(selected, (row) =>
      row.requirementKind === slot.requirementKind
        && row.requirementId === slot.requirementId,
    "SLOT_NOT_EXACTLY_ONE_SELECTED_V1_ROW");
    if (coverage.requirementObjectHash !== slot.requirementObjectHash
      || coverage.selectedRouteObjectHash !== slot.routeObjectHash
      || coverage.selectedCurrentCandidateHash !== slot.currentCandidateHash
      || selectedRow.requirementObjectHash !== slot.requirementObjectHash
      || selectedRow.routeKind !== slot.routeKind
      || selectedRow.routeObjectHash !== slot.routeObjectHash
      || selectedRow.currentCandidateHash !== slot.currentCandidateHash
      || selectedRow.providerRefHash !== slot.providerRefHash
      || selectedRow.responseState !== slot.sourceDeclaredResponseState
      || selectedRow.responseOccurrenceCount
        !== slot.oneUseResponseOccurrenceCount) {
      fail("SLOT_REQUIREMENT_ROUTE_PROVIDER_RESPONSE_SPLICE");
    }
    const key = requirementKey(slot.requirementKind, slot.requirementId);
    for (let prior = 0; prior < projections.length; prior += 1) {
      if (projections[prior].requirementKey === key
        || projections[prior].routeObjectHash === slot.routeObjectHash
        || projections[prior].currentCandidateHash === slot.currentCandidateHash) {
        fail("DUPLICATE_REQUIREMENT_ROUTE_OR_CANDIDATE_SLOT");
      }
    }
    append(projections, {
      requirementKey: key,
      requirementKind: slot.requirementKind,
      requirementId: slot.requirementId,
      requirementObjectHash: slot.requirementObjectHash,
      routeKind: slot.routeKind,
      routeObjectHash: slot.routeObjectHash,
      currentCandidateHash: slot.currentCandidateHash,
      providerRefHash: slot.providerRefHash,
      sourceDeclaredResponseState: slot.sourceDeclaredResponseState,
      sourceDeclaredPathCurrent: slot.sourceDeclaredPathCurrent,
      permissionLifecycleOccurrenceCount:
        slot.permissionLifecycleOccurrenceCount,
      oneUseResponseOccurrenceCount: slot.oneUseResponseOccurrenceCount,
      transportOccurrenceCount: slot.transportOccurrenceCount,
      inboundOccurrenceCount: slot.inboundOccurrenceCount,
      ownerLifecycleOccurrenceCount: slot.ownerLifecycleOccurrenceCount,
    });
    permissionOccurrences += slot.permissionLifecycleOccurrenceCount;
    responseOccurrences += slot.oneUseResponseOccurrenceCount;
    transportOccurrences += slot.transportOccurrenceCount;
    inboundOccurrences += slot.inboundOccurrenceCount;
    ownerOccurrences += slot.ownerLifecycleOccurrenceCount;
  }
  ArraySort(projections, (left, right) => left.requirementKey < right.requirementKey
    ? -1 : left.requirementKey > right.requirementKey ? 1 : 0);
  for (let index = 0; index < mandatory.length; index += 1) {
    const row = mandatory[index];
    findExactly(projections, (projection) =>
      projection.requirementKind === row.requirementKind
        && projection.requirementId === row.requirementId,
    "MANDATORY_REQUIREMENT_WITHOUT_EXACTLY_ONE_SLOT");
  }
  return { projections, permissionOccurrences, responseOccurrences,
    transportOccurrences, inboundOccurrences, ownerOccurrences };
}

function controlBinding(control, observedAt, tender) {
  const record = control.wrapper.record;
  if (record.observedAt !== observedAt
    || control.wrapper.source.observedAt !== observedAt
    || record.formationDeadline.deadline !== tender.formationDeadline
    || record.formationDeadline.reached
      !== (DateParse(observedAt) >= DateParse(tender.formationDeadline))
    || record.appendOnlyControl.expectedHeadMatched !== true
    || record.appendOnlyControl.exactPredecessorChainReplayed !== true
    || record.appendOnlyControl.noResurrectionVerified !== true
    || record.occurrenceCensus.expectedOccurrenceCount
      !== control.wrapper.source.expectedOccurrenceCount
    || record.occurrenceCensus.totalOccurrenceCount
      !== control.wrapper.source.expectedOccurrenceCount
    || record.occurrenceCensus.occurrenceDenominatorReplayed !== true
    || record.zeroInternalOps.outsiderStaffTouchesAllowed !== 0
    || record.zeroInternalOps.internalHumanFallbackPermitted !== false
    || record.zeroInternalOps.humanQueueCreated !== false
    || record.controlDecision.formationCommitmentAuthorized !== false
    || record.controlDecision.manualOverridePermitted !== false
    || record.controlDecision.humanQueueFallbackAllowed !== false) {
    fail("CONTROL_LEDGER_BINDING_OR_BOUNDARY_INVALID");
  }
  const terminal = record.controlDecision.permanentlyDisqualifiedFromCommitment;
  const expectedDisposition = terminal
    ? OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_STATES.declined
    : OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_STATES.forming;
  if (record.controlDecision.disposition !== expectedDisposition
    || (record.zeroInternalOps.anyOutsiderStaffTouchRecorded === true
      && record.controlDecision.controlState
        !== OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.staffTouch)
    || (record.appendOnlyControl.revoked === true
      && record.zeroInternalOps.anyOutsiderStaffTouchRecorded !== true
      && record.controlDecision.controlState
        !== OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.revoked)
    || (record.appendOnlyControl.cancelled === true
      && record.appendOnlyControl.revoked !== true
      && record.zeroInternalOps.anyOutsiderStaffTouchRecorded !== true
      && record.controlDecision.controlState
        !== OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.cancelled)
    || (record.zeroInternalOps.anyOutsiderStaffTouchRecorded !== true
      && record.appendOnlyControl.revoked !== true
      && record.appendOnlyControl.cancelled !== true
      && record.formationDeadline.reached === true
      && record.controlDecision.controlState
        !== OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.deadlineDecline)
    || (record.controlDecision.permanentlyDisqualifiedFromCommitment !== true
      && record.controlDecision.controlState
        !== OUTSIDER_FORMATION_CONTROL_LEDGER_V1_STATES.forming)) {
    fail("CONTROL_STATE_PRECEDENCE_OR_DISPOSITION_INVALID");
  }
  return { record, terminal, disposition: expectedDisposition };
}

function buildReplay(untrustedSource) {
  const preflight = clonePreflight(untrustedSource);
  const source = preflight.source;
  exactObject(source, SOURCE_FIELDS, "SOURCE");
  const observedAt = instant(source.observedAt, "OBSERVED_AT");
  if (typeof source.privateProjectionNonce !== "string"
    || !RegExpTest(NONCE, source.privateProjectionNonce)) {
    fail("PRIVATE_PROJECTION_NONCE_INVALID");
  }
  if (!ArrayIsArray(source.slotReplays) || source.slotReplays.length < 3
    || source.slotReplays.length > MAX_TRANSACTION_SLOTS) {
    fail("SLOT_REPLAYS_COUNT_INVALID");
  }
  const slots = [];
  for (let index = 0; index < source.slotReplays.length; index += 1) {
    append(slots, verifySlot(source.slotReplays[index]));
  }
  const control = verifyControl(source.controlLedgerReplay);
  const predecessor = sharedPredecessor(slots, observedAt);
  const v1Record = predecessor.record;
  const tender = predecessor.source.foundationBoundEvaluationReplay.source.tender;
  const typedGraph = graphBinding(slots, tender, control);
  const coverage = slotBijection(slots, v1Record);
  const controlState = controlBinding(control, observedAt, tender);

  const deadlineReached = DateParse(observedAt)
    >= DateParse(tender.formationDeadline);
  for (let index = 0; index < slots.length; index += 1) {
    const expectedV2Disposition = deadlineReached
      ? "DECLINE_NOT_HUMAN_QUEUE" : "CONTINUE_AUTOMATED_FORMATION_HOLD";
    if (slots[index].checked.disposition !== expectedV2Disposition
      || slots[index].checked.deadlineReached !== deadlineReached) {
      fail("V2_SLOT_DEADLINE_DISPOSITION_SPLICE");
    }
  }

  const privatePins = [];
  for (let index = 0; index < slots.length; index += 1) {
    append(privatePins, {
      requirementKey: requirementKey(
        slots[index].checked.normalizedTransactionSlot.requirementKind,
        slots[index].checked.normalizedTransactionSlot.requirementId),
      temporaryNetworkV2Hash: slots[index].expected,
    });
  }
  ArraySort(privatePins, (left, right) => left.requirementKey < right.requirementKey
    ? -1 : left.requirementKey > right.requirementKey ? 1 : 0);
  const privateDependencyBundleCommitmentHash = digest(
    "outsider/outcome-formation-temporary-network-coordinator-private-dependencies/v1",
    {
      privateProjectionNonce: source.privateProjectionNonce,
      predecessorTemporaryNetworkHash: predecessor.expectedTemporaryNetworkHash,
      slots: privatePins,
      controlSourceHash: control.expectedSourceHash,
      controlLedgerHash: control.expectedLedgerHash,
      observedAt,
    });

  let anySourceDeclaredPathCurrent = false;
  let allSourceDeclaredPathsCurrent = true;
  let resourceRequirementSlotCount = 0;
  let evidenceRequirementSlotCount = 0;
  let recoveryRequirementSlotCount = 0;
  for (let index = 0; index < coverage.projections.length; index += 1) {
    const row = coverage.projections[index];
    if (row.sourceDeclaredPathCurrent === true) {
      anySourceDeclaredPathCurrent = true;
    } else {
      allSourceDeclaredPathsCurrent = false;
    }
    if (row.requirementKind === "RESOURCE") resourceRequirementSlotCount += 1;
    else if (row.requirementKind === "EVIDENCE") {
      evidenceRequirementSlotCount += 1;
    } else if (row.requirementKind === "RECOVERY") {
      recoveryRequirementSlotCount += 1;
    }
  }
  const gapCodes = [
    "INDEPENDENT_RESOURCE_OWNER_TRUST_ROOT_NOT_ESTABLISHED",
    "TRANSACTION_DRIVER_NOT_PRESENT",
    "EXTERNAL_NON_OMISSION_AND_NON_EQUIVOCATION_NOT_ESTABLISHED",
    "EXTERNAL_CAPACITY_NOT_ESTABLISHED",
    "AUTHORITY_AND_ACTION_ADMISSION_NOT_ESTABLISHED",
    "PRICE_GUARANTEE_SETTLEMENT_DEFERRED",
    "ATOMIC_USER_OUTCOME_PROMISE_GATES_INCOMPLETE",
  ];
  if (!allSourceDeclaredPathsCurrent) {
    append(gapCodes, "MANDATORY_SOURCE_DECLARATION_PATH_INCOMPLETE");
  }
  if (controlState.terminal) {
    append(gapCodes, "FORMATION_CONTROL_TERMINAL_OR_DEADLINE_DECLINE");
  }

  const body = {
    schema:
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_SCHEMAS
        .coordinator,
    schemaVersion: "1.0.0",
    ok: true,
    lineage: {
      revision: 1,
      composedTemporaryNetworkVersion: 2,
      predecessorTemporaryNetworkHash:
        predecessor.expectedTemporaryNetworkHash,
      sharedPredecessorSourceRebuiltAndPinned: true,
    },
    observedAt,
    formationDeadline: tender.formationDeadline,
    deadlineReached,
    tenderBinding: {
      ...typedGraph,
      exactTenderSharedByAllSlotsAndControlLedger: true,
    },
    mandatoryNetworkCoverage: {
      mandatoryRequirementCount: coverage.projections.length,
      transactionSlotCount: coverage.projections.length,
      selectedV1RouteResponseCount: v1Record.selectedRouteResponses.length,
      resourceRequirementSlotCount,
      evidenceRequirementSlotCount,
      recoveryRequirementSlotCount,
      mandatoryRequirementToV2SlotToSelectedV1RowBijectionVerified: true,
      duplicateRequirementRouteOrCandidateSlotsAccepted: false,
      providerRefInequalityUsedAsIndependenceProof: false,
      slots: coverage.projections,
    },
    transactionOccurrenceCensus: {
      permissionLifecycleOccurrenceCount: coverage.permissionOccurrences,
      oneUseResponseOccurrenceCount: coverage.responseOccurrences,
      transportOccurrenceCount: coverage.transportOccurrences,
      inboundOccurrenceCount: coverage.inboundOccurrences,
      ownerLifecycleOccurrenceCount: coverage.ownerOccurrences,
      allSuppliedSlotDenominatorsReplayed: true,
      occurrenceCensusSeparatedFromObjectDedup: true,
      globalCompletenessBeyondCallerPinsEstablished: false,
    },
    control: {
      exactRawControlLedgerSourceRebuiltAndPinned: true,
      appendOnlyPredecessorAndHeadReplayed: true,
      occurrenceDenominatorReplayed: true,
      nonceLifecycleReplayed: true,
      staffTouchAccountingReplayed: true,
      controlOccurrenceCount:
        controlState.record.occurrenceCensus.totalOccurrenceCount,
      outsiderStaffTouchOccurrenceCount:
        controlState.record.zeroInternalOps.outsiderStaffTouchOccurrenceCount,
      anyOutsiderStaffTouchRecorded:
        controlState.record.zeroInternalOps.anyOutsiderStaffTouchRecorded,
      cancelled: controlState.record.appendOnlyControl.cancelled,
      revoked: controlState.record.appendOnlyControl.revoked,
      permanentlyDisqualifiedFromCommitment: controlState.terminal,
      controlState: controlState.record.controlDecision.controlState,
      externalNonOmissionEstablished: false,
      externalNonEquivocationEstablished: false,
    },
    formationAssessment: {
      anyMandatorySourceDeclaredPathCurrent: anySourceDeclaredPathCurrent,
      allMandatorySourceDeclaredPathsCurrent: allSourceDeclaredPathsCurrent,
      structuralMultiSlotCoverageComplete: true,
      structuralCoverageMintsAuthorityOrCapacity: false,
      resourceOwnerAuthorityEstablished: false,
      primaryExecutionCapacityReserved: false,
      recoveryCapacityReserved: false,
      independentWitnessCapacityReserved: false,
      independentWitnessIndependenceEstablished: false,
      maximumLossBoundEstablished: false,
      fundingAndCapitalSufficiencyEstablished: false,
      lawfulTransactionAndPaymentPathEstablished: false,
      trustedTimeEstablished: false,
      externalNonOmissionEstablished: false,
      externalNonEquivocationEstablished: false,
      zeroStaffTouchCompletenessEstablished: false,
      independentResourceOwnerTrustRootEstablished: false,
      transactionDriverPresent: false,
      externalCapacityEstablished: false,
      capacityReserved: false,
      authorityEstablished: false,
      atomicCommitmentGateSatisfied: false,
      userOutcomePromiseIssued: false,
    },
    atomicCommitmentGate: {
      exactMandatoryRequirementSlotBijectionReplayed: true,
      allMandatorySourceDeclaredPathsCurrent:
        allSourceDeclaredPathsCurrent,
      resourceOwnerAuthorityEstablished: false,
      primaryExecutionCapacityReserved: false,
      recoveryCapacityReserved: false,
      independentWitnessCapacityReserved: false,
      independentWitnessIndependenceEstablished: false,
      maximumLossBoundEstablished: false,
      fundingAndCapitalSufficiencyEstablished: false,
      lawfulTransactionAndPaymentPathEstablished: false,
      trustedTimeEstablished: false,
      externalNonOmissionEstablished: false,
      externalNonEquivocationEstablished: false,
      zeroStaffTouchCompletenessEstablished: false,
      transactionDriverPresent: false,
      authorityAndActionAdmissionEstablished: false,
      atomicCommitmentGateSatisfied: false,
      partialPromisePermitted: false,
      manualOverridePermitted: false,
      userOutcomePromiseIssued: false,
    },
    replayBoundary: {
      fullRawV2SlotSourcesRebuiltAndPinned: true,
      exactSharedV1PredecessorVerified: true,
      exactControlLedgerSourceRebuiltAndPinned: true,
      derivedTrustBooleansAcceptedAsInput: false,
      privateDependencyBundleCommitmentHash,
      individualPrivateSourceReplayHashesProjected: false,
      rawPrivateSourceBytesProjected: false,
      recipientThreadMessageSourceSystemOrKeyIdentifiersProjected: false,
      aggregatePreflightPerformedBeforeDependencyVerification: true,
      exactSourceBufferCount: preflight.budget.buffers,
      exactSourceByteCount: preflight.budget.bytes,
      aggregateArrayElementCount: preflight.budget.arrayElements,
    },
    zeroInternalOpsBoundary: {
      outsiderStaffInterventionsAllowed: 0,
      recordedStaffTouchPermanentlyDisqualifiesCommitment: true,
      internalHumanFallbackPermitted: false,
      humanQueueCreated: false,
      declineInsteadOfHumanQueue:
        controlState.disposition === "DECLINE_NOT_HUMAN_QUEUE",
      providerRegistrationPerformed: false,
      providerContactPerformed: false,
      liveSearchingPerformed: false,
      tenderSentByThisModule: false,
      liveIoPerformed: false,
    },
    authorityBoundary: {
      enabledCapabilities: [],
      provenAuthorities: [],
      enabledCapabilityCount: 0,
      provenAuthorityCount: 0,
      enabledCapabilitiesSubsetOfProvenAuthority: true,
      consequenceReach: "NONE",
      authority: "NONE",
      actionReady: false,
      executable: false,
    },
    economicBoundary: {
      price: null,
      priceEstablished: false,
      pricingPermitted: false,
      guarantee: null,
      guaranteeEstablished: false,
      settlement: null,
      settlementPermitted: false,
      custodyEstablished: false,
      moneyMovementEnabled: false,
    },
    gapCodes,
    disposition: controlState.disposition,
    strongestState: controlState.disposition,
    result: controlState.disposition,
    independentResourceOwnerTrustRootEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    authorityEstablished: false,
    sendAuthorized: false,
    providerContactPerformed: false,
    liveSearchingPerformed: false,
    liveIoPerformed: false,
    pricingPermitted: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    price: null,
    guarantee: null,
    settlement: null,
    boundary:
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, coordinatorHash: digest(
    OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_SCHEMAS
      .coordinator, body) });
}

function failure(error) {
  let message = `${PREFIX}UNTRUSTED_FAILURE`;
  try {
    if (error instanceof ErrorConstructor && typeof error.message === "string"
      && RegExpTest(
        /^OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_[A-Z0-9_]+$/u,
        error.message)) message = error.message;
  } catch { message = `${PREFIX}UNTRUSTED_FAILURE`; }
  return deepFreeze({
    schema:
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_SCHEMAS
        .verification,
    schemaVersion: "1.0.0",
    ok: false,
    fullRawV2SlotSourcesRebuiltAndPinned: false,
    exactSharedV1PredecessorVerified: false,
    exactControlLedgerSourceRebuiltAndPinned: false,
    mandatoryRequirementSlotBijectionVerified: false,
    derivedTrustBooleansAcceptedAsInput: false,
    independentResourceOwnerTrustRootEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    authorityEstablished: false,
    sendAuthorized: false,
    providerContactPerformed: false,
    liveSearchingPerformed: false,
    liveIoPerformed: false,
    pricingPermitted: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    price: null,
    guarantee: null,
    settlement: null,
    error: message,
    boundary:
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_COORDINATOR_V1_BOUNDARY,
  });
}

/** Build only by replaying every raw v2 slot and the raw control ledger. */
export function createOutcomeFormationTemporaryNetworkCoordinatorV1(
  source = {}) {
  return buildReplay(source);
}

/** Verification rebuilds raw sources; an output record alone is insufficient. */
export function verifyOutcomeFormationTemporaryNetworkCoordinatorV1(
  source = {}, expectedCoordinatorHash = null) {
  try {
    const expected = hash(expectedCoordinatorHash, "EXPECTED_COORDINATOR_HASH");
    const rebuilt = buildReplay(source);
    if (rebuilt.coordinatorHash !== expected) {
      fail("EXPECTED_COORDINATOR_HASH_MISMATCH");
    }
    return rebuilt;
  } catch (error) {
    return failure(error);
  }
}

export const createTemporaryOutcomeNetworkCoordinatorV1
  = createOutcomeFormationTemporaryNetworkCoordinatorV1;
export const verifyTemporaryOutcomeNetworkCoordinatorV1
  = verifyOutcomeFormationTemporaryNetworkCoordinatorV1;
