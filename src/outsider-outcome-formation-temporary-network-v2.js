/*
 * Outcome Formation Engine: permissioned transaction composition v2.
 *
 * This append-only descendant replays one complete v1 temporary-network
 * source, one permissioned transaction-interface source, and one resource-
 * owner standing source. It performs no I/O. Source consistency, signatures,
 * and lifecycle replay never create authority, capacity, a send permission,
 * price, guarantee, settlement, or an outcome promise.
 */

import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1,
  verifyPermissionedTransactionInterfaceSourceReplayV1,
} from "./outsider-permissioned-transaction-interface-source-replay-v1.js";
import {
  verifyResourceOwnerStandingTrustReplayV1,
} from "./outsider-resource-owner-standing-trust-replay-v1.js";
import {
  verifyOutcomeFormationTemporaryNetworkV1,
} from "./outsider-outcome-formation-temporary-network-v1.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
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
const BUFFER_FORBIDDEN_OWN_KEYS = ObjectFreeze([
  "length", "byteLength", "byteOffset", "buffer", "set", "subarray",
  Symbol.iterator,
]);

const PREFIX = "OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const NONCE = /^[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

const MAX_SINGLE_BUFFER_BYTES = 1024 * 1024;
const MAX_AGGREGATE_BUFFER_BYTES = 64 * 1024 * 1024;
const MAX_SINGLE_STRING_BYTES = 1024 * 1024;
const MAX_AGGREGATE_STRING_BYTES = 96 * 1024 * 1024;
const MAX_ARRAY_LENGTH = 8_192;
const MAX_AGGREGATE_ARRAY_ELEMENTS = 200_000;
const MAX_TREE_NODES = 600_000;
const MAX_TREE_KEYS = 1_800_000;
const MAX_TREE_DEPTH = 112;

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_SCHEMAS
  = ObjectFreeze({
    network: "outsider/outcome-formation-temporary-resource-network/v2",
    verification:
      "outsider/outcome-formation-temporary-resource-network-verification/v2",
  });

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_LIMITS
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
    transactionReplaySlots: 1,
  });

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_STATES
  = ObjectFreeze({
    forming: "CONTINUE_AUTOMATED_FORMATION_HOLD",
    declined: "DECLINE_NOT_HUMAN_QUEUE",
  });

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_BOUNDARY
  = deepFreeze({
    position:
      "TEMPORARY_NETWORK_PERMISSIONED_TRANSACTION_OWNER_SOURCE_COMPOSITION_HOLD",
    versionedDescendantOfTemporaryNetworkV1: true,
    frozenV1ArtifactModified: false,
    transactionReplaySlots: 1,
    normalizedTransactionProfile:
      OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1,
    providerRegistrationRequired: false,
    liveIoPerformed: false,
    networkIoPerformed: false,
    providerContactPerformed: false,
    tenderSentByThisModule: false,
    credentialsAcceptedOrHandled: false,
    rawPrivateSourceBytesProjected: false,
    recipientThreadMessageOrSourceSystemIdentifiersProjected: false,
    sourceVerifierKeysProjected: false,
    individualPrivateSourceReplayHashesProjected: false,
    saltedAggregatePrivateDependencyCommitmentProjected: true,
    derivedTrustBooleansAcceptedAsInput: false,
    fullRawDependencyReplayRequired: true,
    outputOnlyOrResealedVerificationAccepted: false,
    aggregatePreflightBeforeDependencyVerification: true,
    typedGraphModel:
      "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT",
    occurrenceDenominatorsPreserved: true,
    occurrenceCensusSeparatedFromObjectDedup: true,
    externalNonOmissionEstablished: false,
    externalNonEquivocationEstablished: false,
    persistentNonceConsumptionEstablished: false,
    independentResourceOwnerTrustRootEstablished: false,
    resourceOwnerLegalIdentityEstablished: false,
    mailboxOwnershipIndependentlyEstablished: false,
    userHeldAuthorizationIndependentlyEstablished: false,
    transactionDriverPresent: false,
    sendAuthorized: false,
    externalRouteZeroInternalOpsEstablished: false,
    staffTouchLedgerSourceReplayed: false,
    anyOutsiderStaffTouchIsFormationFailure: true,
    internalHumanFallbackPermitted: false,
    unavailableDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    externalCapacityEstablished: false,
    capacityReserved: false,
    authorityEstablished: false,
    actionReady: false,
    executable: false,
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
  "observedAt", "temporaryNetworkV1Replay", "transactionInterfaceReplay",
  "resourceOwnerStandingReplay", "privateProjectionNonce",
]);
const TEMPORARY_V1_REPLAY_FIELDS = ObjectFreeze([
  "record", "source", "expectedTemporaryNetworkHash",
]);
const TRANSACTION_REPLAY_FIELDS = ObjectFreeze([
  "profile", "source", "expectedReplayHash",
]);
const OWNER_REPLAY_FIELDS = ObjectFreeze(["source", "expectedReplayHash"]);

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
      const bufferKeys = ReflectOwnKeys(value);
      budget.keys += bufferKeys.length;
      if (budget.keys > MAX_TREE_KEYS || bufferKeys.length !== length) {
        fail("DECORATED_SOURCE_BUFFER_FORBIDDEN");
      }
      for (let index = 0; index < bufferKeys.length; index += 1) {
        if (bufferKeys[index] !== StringConstructor(index)) {
          fail("DECORATED_SOURCE_BUFFER_FORBIDDEN");
        }
        const descriptor = ObjectGetOwnPropertyDescriptor(value,
          bufferKeys[index]);
        if (!descriptor || !ObjectHasOwn(descriptor, "value")
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

function requireFalse(value, fields, code) {
  for (let index = 0; index < fields.length; index += 1) {
    if (value[fields[index]] !== false) fail(code);
  }
}

function verifyV1(wrapper) {
  exactObject(wrapper, TEMPORARY_V1_REPLAY_FIELDS,
    "TEMPORARY_NETWORK_V1_REPLAY");
  const expected = hash(wrapper.expectedTemporaryNetworkHash,
    "EXPECTED_TEMPORARY_NETWORK_V1_HASH");
  const checked = verifyOutcomeFormationTemporaryNetworkV1(wrapper.record, {
    source: wrapper.source,
    expectedTemporaryNetworkHash: expected,
  });
  if (checked.ok !== true) {
    fail("TEMPORARY_NETWORK_V1_SOURCE_REPLAY_FAILED");
  }
  if (checked.allDependencySourcesRebuiltAndPinned !== true
    || checked.exactTenderGraphEpisodeAttemptCrossBindingVerified !== true
    || checked.responseAndExternalOccurrenceDenominatorsPreservedWithinSuppliedSources
      !== true) {
    fail("TEMPORARY_NETWORK_V1_REPLAY_FACTS_MISSING");
  }
  if (checked.temporaryNetworkHash !== expected
    || wrapper.record.temporaryNetworkHash !== expected
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false) {
    fail("TEMPORARY_NETWORK_V1_HASH_OR_HOLD_BOUNDARY_INVALID");
  }
  requireFalse(checked, ["externalCapacityEstablished", "capacityReserved",
    "externalRouteZeroInternalOpsEstablished", "authorityEstablished"],
  "TEMPORARY_NETWORK_V1_BOUNDARY_ROLLBACK");
  return { checked, record: wrapper.record, expectedHash: expected };
}

function verifyTransaction(wrapper) {
  exactObject(wrapper, TRANSACTION_REPLAY_FIELDS,
    "TRANSACTION_INTERFACE_REPLAY");
  if (wrapper.profile
      !== OUTSIDER_PERMISSIONED_TRANSACTION_INTERFACE_PROFILE_V1) {
    fail("TRANSACTION_INTERFACE_PROFILE_UNSUPPORTED");
  }
  const expected = hash(wrapper.expectedReplayHash,
    "EXPECTED_TRANSACTION_REPLAY_HASH");
  const checked = verifyPermissionedTransactionInterfaceSourceReplayV1(
    wrapper.source, expected);
  if (checked.ok !== true || checked.replayHash !== expected
    || checked.profile !== wrapper.profile
    || checked.rawSourceReplayPerformed !== true
    || checked.exactCanonicalSourceBytesReplayed !== true
    || checked.exactRfc822SourceBytesReplayed !== true
    || checked.typedGraphPathBoundExactly !== true
    || checked.permissionAppendOnlyLifecycleReplayed !== true
    || checked.permissionOccurrenceDenominatorReplayed !== true
    || checked.transportAppendOnlyOccurrenceChainReplayed !== true
    || checked.transportOccurrenceDenominatorReplayed !== true
    || checked.oneUseResponseLifecycleReplayed !== true
    || checked.ownerStandingSourceReplayed !== true
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false) {
    fail("TRANSACTION_INTERFACE_SOURCE_REPLAY_FAILED");
  }
  requireFalse(checked, ["ownerStandingCreatesAuthority",
    "adapterSourceSignatureCreatesAuthority",
    "permissionSourceDeclarationCreatesAuthority",
    "permissionSourceDeclarationCreatesSendAuthorization",
    "userHeldAuthorizationIndependentlyEstablished", "sendAuthorized",
    "externalCapacityEstablished", "capacityReserved",
    "providerContactPerformed", "networkRequestPerformed", "liveIoPerformed",
    "pricingPermitted", "guaranteeEstablished", "settlementPermitted"],
  "TRANSACTION_INTERFACE_BOUNDARY_ROLLBACK");
  return { checked, source: wrapper.source, expectedHash: expected };
}

function verifyOwner(wrapper) {
  exactObject(wrapper, OWNER_REPLAY_FIELDS, "RESOURCE_OWNER_STANDING_REPLAY");
  const expected = hash(wrapper.expectedReplayHash,
    "EXPECTED_OWNER_STANDING_REPLAY_HASH");
  const checked = verifyResourceOwnerStandingTrustReplayV1(wrapper.source,
    expected);
  if (checked.ok !== true || checked.replayHash !== expected
    || checked.rawSourceReplayPerformed !== true
    || checked.tenderSourceReplayed !== true
    || checked.typedGraphPathBoundExactly !== true
    || checked.oneUseResponseLifecycleReplayed !== true
    || checked.ownerRegistrySemanticsExactBytesReplayed !== true
    || checked.ownerAdoptionExactBytesReplayed !== true
    || checked.appendOnlyLifecycleReplayed !== true
    || checked.lifecycleOccurrenceDenominatorReplayed !== true
    || checked.rightsReviewExactBytesReplayed !== true
    || checked.privacyReviewExactBytesReplayed !== true
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false) {
    fail("RESOURCE_OWNER_STANDING_SOURCE_REPLAY_FAILED");
  }
  requireFalse(checked, ["rightsEstablished", "privacyEstablished",
    "networkOccurrenceRecorded", "externalNetworkCensusEvidenceEstablished",
    "independentResourceOwnerTrustAnchorReplayed",
    "resourceOwnerLegalIdentityEstablished", "resourceOwnerStandingEstablished",
    "externalCapacityEstablished", "capacityReserved", "authorityEstablished",
    "pricingPermitted", "guaranteeEstablished", "settlementPermitted",
    "providerContactPerformed", "networkRequestPerformed"],
  "RESOURCE_OWNER_STANDING_BOUNDARY_ROLLBACK");
  return { checked, source: wrapper.source, expectedHash: expected };
}

function selectedRows(record, transaction) {
  const rows = record.selectedRouteResponses;
  if (!ArrayIsArray(rows)) fail("V1_SELECTED_ROUTE_RESPONSES_INVALID");
  const matches = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.requirementKind === transaction.requirementKind
      && row.requirementId === transaction.requirementId
      && row.routeObjectHash === transaction.routeObjectHash
      && row.currentCandidateHash === transaction.currentCandidateHash) {
      append(matches, row);
    }
  }
  if (matches.length !== 1) {
    fail("TRANSACTION_ROUTE_NOT_EXACTLY_ONE_V1_SELECTED_ROUTE");
  }
  return matches[0];
}

function selectedSourceRows(v1Source, transaction) {
  const rows = v1Source.selectedRouteResponseSources;
  if (!ArrayIsArray(rows)) fail("V1_SELECTED_ROUTE_RESPONSE_SOURCES_INVALID");
  const matches = [];
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index].routeObjectHash === transaction.routeObjectHash
      && rows[index].currentCandidateHash === transaction.currentCandidateHash) {
      append(matches, rows[index]);
    }
  }
  if (matches.length !== 1) {
    fail("TRANSACTION_ROUTE_SOURCE_NOT_EXACTLY_ONE_V1_SELECTED_ROUTE");
  }
  return matches[0];
}

function exactGraphCrossBinding(v1, transaction, owner) {
  const binding = v1.record.tenderBinding;
  const triples = [
    [binding.tenderHash, transaction.tenderHash, owner.tenderHash],
    [binding.typedGraphHash, transaction.typedGraphHash, owner.typedGraphHash],
    [binding.principalEpochProjectionHash,
      transaction.principalEpochProjectionHash,
      owner.principalEpochProjectionHash],
    [binding.accountableDeploymentSubjectHash,
      transaction.accountableDeploymentSubjectHash,
      owner.accountableDeploymentSubjectHash],
    [binding.runtimeInstanceHash, transaction.runtimeInstanceHash,
      owner.runtimeInstanceHash],
    [binding.embodimentRevisionHash, transaction.embodimentRevisionHash,
      owner.embodimentRevisionHash],
    [binding.delegationEdgeHash, transaction.delegationEdgeHash,
      owner.delegationEdgeHash],
    [binding.episodeHash, transaction.episodeHash, owner.episodeHash],
    [binding.currentAttemptHash, transaction.attemptHash, owner.attemptHash],
  ];
  for (let index = 0; index < triples.length; index += 1) {
    if (triples[index][0] !== triples[index][1]
      || triples[index][1] !== triples[index][2]) {
      fail("TENDER_TYPED_GRAPH_EPISODE_ATTEMPT_SPLICE");
    }
  }
}

function exactDependencySourceCrossBinding(source, v1, transaction, owner) {
  const v1Source = source.temporaryNetworkV1Replay.source;
  const transactionSource = source.transactionInterfaceReplay.source;
  const ownerSource = source.resourceOwnerStandingReplay.source;
  const v1Tender = v1Source.foundationBoundEvaluationReplay.source.tender;

  if (!same(v1Tender, transactionSource.tender)
    || !same(v1Tender, ownerSource.tender)
    || !same(v1Source.routeDiscoveryReplay,
      transactionSource.routeDiscoveryReplay)
    || transaction.routeDiscoverySnapshotHash
      !== v1.record.discoveryReplay.snapshotHash
    || !same(transactionSource.ownerStandingReplay.source, ownerSource)
    || transactionSource.ownerStandingReplay.expectedReplayHash
      !== source.resourceOwnerStandingReplay.expectedReplayHash
    || transaction.ownerActorIdentityEnvelopeHash
      !== owner.ownerActorIdentityEnvelopeHash
    || transaction.accountableActorIdentityEnvelopeHash
      !== owner.accountableActorIdentityEnvelopeHash
    || transaction.resourceOwnerRefHash !== owner.resourceOwnerRefHash
    || transaction.providerRefHash !== owner.providerRefHash) {
    fail("DEPENDENCY_RAW_SOURCE_OR_ACTOR_OWNER_SPLICE");
  }

  const selected = selectedRows(v1.record, transaction);
  const selectedSource = selectedSourceRows(v1Source, transaction);
  const transactionResponse = transactionSource.oneUseResponseReplay;
  const ownerResponse = ownerSource.oneUseResponseReplay;
  const normalizedResponseSource = {
    tender: transactionSource.tender,
    expectedTenderHash: transactionSource.expectedTenderHash,
    responses: transactionResponse.responses,
    occurrences: transactionResponse.occurrences,
    expectedOccurrenceCount: transactionResponse.expectedOccurrenceCount,
    expectedLifecycleHeadHash: transactionResponse.expectedLifecycleHeadHash,
    observedAt: transactionSource.observedAt,
  };
  const initial = transactionResponse.responses[0];
  if (!same(selectedSource.responseLifecycleSource, normalizedResponseSource)
    || !same(transactionResponse.responses, ownerResponse.responses)
    || !same(transactionResponse.occurrences, ownerResponse.occurrences)
    || transactionResponse.expectedOccurrenceCount
      !== ownerResponse.expectedOccurrenceCount
    || transactionResponse.expectedLifecycleHeadHash
      !== ownerResponse.expectedLifecycleHeadHash
    || selected.requirementObjectHash !== transaction.requirementObjectHash
    || selected.responseLifecycleHeadHash
      !== transactionResponse.expectedLifecycleHeadHash
    || selected.responseOccurrenceCount
      !== transactionResponse.expectedOccurrenceCount
    || selected.responseState !== transaction.sourceDeclaredOneUseResponseState
    || selected.providerRefHash !== transaction.providerRefHash
    || selected.oneUseScopeHash !== initial.scopeHash
    || owner.oneUseResponseHash !== initial.responseHash
    || owner.oneUseResponseLifecycleHeadHash
      !== transactionResponse.expectedLifecycleHeadHash
    || owner.scopeHash !== initial.scopeHash
    || owner.lifecycleEventCount !== ownerSource.expectedLifecycleEventCount
    || transaction.permissionLifecycleEventCount
      !== transactionSource.expectedPermissionLifecycleEventCount
    || transaction.inboundOccurrenceCount
      !== transactionSource.expectedInboundMessageOccurrenceCount
    || transaction.transportOccurrenceCount
      !== transactionSource.expectedTransportOccurrenceCount) {
    fail("REQUIREMENT_RESPONSE_OWNER_OR_OCCURRENCE_SPLICE");
  }
  return { selected, selectedSource, initial };
}

function zeroInternalOpsContract(source, v1, transaction) {
  const tender = source.temporaryNetworkV1Replay.source
    .foundationBoundEvaluationReplay.source.tender;
  const zero = tender.zeroInternalOps;
  const boundary = v1.record.zeroInternalOpsBoundary;
  if (zero.outsiderStaffInterventionsAllowed !== 0
    || zero.internalManualSourcingAllowed !== false
    || zero.internalManualCoordinationAllowed !== false
    || zero.internalManualVerificationAllowed !== false
    || zero.internalManualRecoveryAllowed !== false
    || zero.humanQueueFallbackAllowed !== false
    || zero.failureDisposition !== "DECLINE_NOT_HUMAN_QUEUE"
    || boundary.thisPureModuleStaffInterventionCount !== 0
    || boundary.anyOutsiderStaffTouchIsFormationFailure !== true
    || boundary.internalHumanFallbackPermitted !== false
    || boundary.humanQueueCreated !== false
    || transaction.boundary.outsiderStaffInterventionsAllowed !== 0
    || transaction.boundary.internalHumanFallbackPermitted !== false) {
    fail("ZERO_INTERNAL_OPS_OR_HUMAN_FALLBACK_DISQUALIFIED");
  }
}

function buildReplay(untrustedSource) {
  const preflight = clonePreflight(untrustedSource);
  const source = preflight.source;
  exactObject(source, SOURCE_FIELDS, "SOURCE");
  exactObject(source.temporaryNetworkV1Replay, TEMPORARY_V1_REPLAY_FIELDS,
    "TEMPORARY_NETWORK_V1_REPLAY");
  exactObject(source.transactionInterfaceReplay, TRANSACTION_REPLAY_FIELDS,
    "TRANSACTION_INTERFACE_REPLAY");
  exactObject(source.resourceOwnerStandingReplay, OWNER_REPLAY_FIELDS,
    "RESOURCE_OWNER_STANDING_REPLAY");
  const observedAt = instant(source.observedAt, "OBSERVED_AT");
  if (typeof source.privateProjectionNonce !== "string"
    || !RegExpTest(NONCE, source.privateProjectionNonce)) {
    fail("PRIVATE_PROJECTION_NONCE_INVALID");
  }

  const v1 = verifyV1(source.temporaryNetworkV1Replay);
  const transaction = verifyTransaction(source.transactionInterfaceReplay);
  const owner = verifyOwner(source.resourceOwnerStandingReplay);
  if (v1.record.observedAt !== observedAt
    || source.temporaryNetworkV1Replay.source.observedAt !== observedAt
    || transaction.checked.observedAt !== observedAt
    || transaction.source.observedAt !== observedAt
    || owner.checked.observedAt !== observedAt
    || owner.source.observedAt !== observedAt) {
    fail("DEPENDENCY_OBSERVED_AT_SPLICE");
  }
  exactGraphCrossBinding(v1, transaction.checked, owner.checked);
  const crossBinding = exactDependencySourceCrossBinding(source, v1,
    transaction.checked, owner.checked);
  zeroInternalOpsContract(source, v1, transaction.checked);

  const formationDeadline = instant(
    source.temporaryNetworkV1Replay.source.foundationBoundEvaluationReplay
      .source.tender.formationDeadline,
    "FORMATION_DEADLINE");
  const deadlineReached = DateParse(observedAt) >= DateParse(formationDeadline);
  const expectedDisposition = deadlineReached
    ? OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_STATES.declined
    : OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_STATES.forming;
  if (v1.record.disposition !== expectedDisposition) {
    fail("V1_DEADLINE_DISPOSITION_SPLICE");
  }

  const transactionPathCurrent
    = transaction.checked.sourceDeclaredPermissionCurrentAtObservedAt === true
    && transaction.checked.sourceDeclaredResponseCurrent === true
    && owner.checked.sourceDeclaredOwnerStandingCurrent === true
    && crossBinding.selected.routeReferenceCurrentWithinKnownTtlAtObservedAt
      === true
    && crossBinding.selected.currentCallerDeclaredOneUseResponseReference
      === true;
  /* Even a current source-declared path is not an executable route. The
     independent trust root, persistent nonce ledger, transaction driver,
     capacity, authority, and staff-touch ledger remain absent. */
  const atomicCommitmentGateSatisfied = false;
  const disposition = expectedDisposition;
  const privateDependencyBundleCommitmentHash = digest(
    "outsider/outcome-formation-temporary-network-v2-private-dependencies/v1", {
      privateProjectionNonce: source.privateProjectionNonce,
      temporaryNetworkV1Hash: v1.expectedHash,
      transactionReplayHash: transaction.expectedHash,
      ownerStandingReplayHash: owner.expectedHash,
      transactionPrivateSourceBundleCommitmentHash:
        transaction.checked.privateSourceBundleCommitmentHash,
      ownerLifecycleHeadSourceHash: owner.checked.lifecycleHeadSourceHash,
      observedAt,
    });

  const gapCodes = [
    "INDEPENDENT_RESOURCE_OWNER_TRUST_ROOT_NOT_ESTABLISHED",
    "RESOURCE_OWNER_LEGAL_IDENTITY_NOT_ESTABLISHED",
    "USER_HELD_MAILBOX_AUTHORITY_NOT_ESTABLISHED",
    "TRANSACTION_DRIVER_NOT_PRESENT",
    "PERSISTENT_NONCE_CONSUMPTION_NOT_ESTABLISHED",
    "EXTERNAL_NON_OMISSION_AND_NON_EQUIVOCATION_NOT_ESTABLISHED",
    "EXTERNAL_CAPACITY_NOT_ESTABLISHED",
    "STAFF_TOUCH_LEDGER_NOT_SOURCE_REPLAYED",
    "AUTHORITY_AND_ACTION_ADMISSION_NOT_ESTABLISHED",
    "PRICE_GUARANTEE_SETTLEMENT_DEFERRED",
    "ATOMIC_USER_OUTCOME_PROMISE_GATES_INCOMPLETE",
  ];
  if (!transactionPathCurrent) {
    append(gapCodes, "CURRENT_TRANSACTION_SOURCE_DECLARATION_PATH_INCOMPLETE");
  }
  if (deadlineReached) append(gapCodes, "FORMATION_DEADLINE_REACHED_DECLINED");

  const body = {
    schema: OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_SCHEMAS.network,
    schemaVersion: "2.0.0",
    ok: true,
    lineage: {
      revision: 2,
      predecessorTemporaryNetworkHash: v1.expectedHash,
      supersedesTemporaryNetworkHash: v1.expectedHash,
      predecessorSourceRebuiltAndPinned: true,
    },
    temporaryNetworkId: v1.record.temporaryNetworkId,
    observedAt,
    formationDeadline,
    deadlineReached,
    fullRawDependencyReplayPerformed: true,
    exactTypedGraphAndTransactionCrossBindingVerified: true,
    tenderBinding: {
      tenderHash: transaction.checked.tenderHash,
      workOrderHash: transaction.checked.workOrderHash,
      typedGraphHash: transaction.checked.typedGraphHash,
      principalEpochProjectionHash:
        transaction.checked.principalEpochProjectionHash,
      accountableDeploymentSubjectHash:
        transaction.checked.accountableDeploymentSubjectHash,
      runtimeInstanceHash: transaction.checked.runtimeInstanceHash,
      embodimentRevisionHash: transaction.checked.embodimentRevisionHash,
      delegationEdgeHash: transaction.checked.delegationEdgeHash,
      episodeHash: transaction.checked.episodeHash,
      attemptHash: transaction.checked.attemptHash,
      exactTypedGraphPathCrossBoundAcrossAllSources: true,
    },
    normalizedTransactionSlot: {
      slotCount: 1,
      profile: source.transactionInterfaceReplay.profile,
      requirementKind: transaction.checked.requirementKind,
      requirementId: transaction.checked.requirementId,
      requirementObjectHash: transaction.checked.requirementObjectHash,
      routeKind: transaction.checked.routeKind,
      routeObjectHash: transaction.checked.routeObjectHash,
      currentCandidateHash: transaction.checked.currentCandidateHash,
      providerRefHash: transaction.checked.providerRefHash,
      sourceDeclaredResponseState:
        transaction.checked.sourceDeclaredOneUseResponseState,
      sourceDeclaredPathCurrent: transactionPathCurrent,
      exactRawSourceAndOwnerContextCrossBound: true,
      permissionLifecycleOccurrenceCount:
        transaction.checked.permissionLifecycleEventCount,
      permissionLifecycleDistinctObjectCount:
        transaction.checked.permissionLifecycleDistinctObjectCount,
      oneUseResponseOccurrenceCount:
        source.transactionInterfaceReplay.source.oneUseResponseReplay
          .expectedOccurrenceCount,
      transportOccurrenceCount: transaction.checked.transportOccurrenceCount,
      transportDistinctObjectCount:
        transaction.checked.transportDistinctObjectCount,
      inboundOccurrenceCount: transaction.checked.inboundOccurrenceCount,
      strictChallengeReplyOccurrenceCount:
        transaction.checked.strictChallengeReplyOccurrenceCount,
      ownerLifecycleOccurrenceCount: owner.checked.lifecycleEventCount,
      ownerLifecycleDistinctObjectCount:
        owner.checked.lifecycleDistinctObjectCount,
      transactionOccurrenceDenominatorsPreserved: true,
      objectDedupReducedOccurrenceDenominator: false,
    },
    replayBoundary: {
      temporaryNetworkV1SourceRebuiltAndPinned: true,
      transactionInterfaceRawSourceRebuiltAndPinned: true,
      resourceOwnerStandingRawSourceRebuiltAndPinned: true,
      exactOwnerStandingSourceAndContextCrossBound: true,
      exactTenderGraphEpisodeAttemptRequirementRouteProviderResponseCrossBound:
        true,
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
      zeroInternalOpsTenderContractReplayed: true,
      thisPureModuleStaffInterventionCount: 0,
      staffTouchLedgerSourceReplayed: false,
      absenceOfStaffTouchIndependentlyEstablished: false,
      anyOutsiderStaffTouchIsFormationFailure: true,
      internalHumanFallbackPermitted: false,
      humanQueueCreated: false,
      declineInsteadOfHumanQueue: deadlineReached,
      providerRegistrationPerformed: false,
      providerContactPerformed: false,
      tenderSentByThisModule: false,
      liveIoPerformed: false,
    },
    atomicCommitmentGate: {
      sourceDeclaredTransactionPathCurrent: transactionPathCurrent,
      independentResourceOwnerTrustRootEstablished: false,
      userHeldMailboxAuthorityEstablished: false,
      transactionDriverPresent: false,
      persistentNonceConsumptionEstablished: false,
      externalRouteZeroInternalOpsEstablished: false,
      externalCapacityEstablished: false,
      capacityReserved: false,
      lawfulTransactionPathEstablished: false,
      atomicCommitmentGateSatisfied,
      partialPromisePermitted: false,
      manualOverridePermitted: false,
      userOutcomePromiseIssued: false,
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
    disposition,
    strongestState: disposition,
    result: disposition,
    independentResourceOwnerTrustRootEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    authorityEstablished: false,
    sendAuthorized: false,
    providerContactPerformed: false,
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
    boundary: OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_BOUNDARY,
  };
  return deepFreeze({ ...body, temporaryNetworkHash: digest(
    OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_SCHEMAS.network, body) });
}

function failure(error) {
  let message = `${PREFIX}UNTRUSTED_FAILURE`;
  try {
    if (error instanceof ErrorConstructor && typeof error.message === "string"
      && RegExpTest(
        /^OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_[A-Z0-9_]+$/u,
        error.message)) message = error.message;
  } catch { message = `${PREFIX}UNTRUSTED_FAILURE`; }
  return deepFreeze({
    schema:
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_SCHEMAS.verification,
    schemaVersion: "2.0.0",
    ok: false,
    fullRawDependencyReplayPerformed: false,
    exactTypedGraphAndTransactionCrossBindingVerified: false,
    derivedTrustBooleansAcceptedAsInput: false,
    independentResourceOwnerTrustRootEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    sendAuthorized: false,
    providerContactPerformed: false,
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
    boundary: OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V2_BOUNDARY,
  });
}

/** Build v2 only by replaying the complete caller-pinned dependency sources. */
export function createOutcomeFormationTemporaryNetworkV2(source = {}) {
  return buildReplay(source);
}

/** Verification never accepts a derived record; it fully rebuilds raw sources. */
export function verifyOutcomeFormationTemporaryNetworkV2(source = {},
  expectedTemporaryNetworkHash = null) {
  try {
    const expected = hash(expectedTemporaryNetworkHash,
      "EXPECTED_TEMPORARY_NETWORK_HASH");
    const rebuilt = buildReplay(source);
    if (rebuilt.temporaryNetworkHash !== expected) {
      fail("EXPECTED_TEMPORARY_NETWORK_HASH_MISMATCH");
    }
    return rebuilt;
  } catch (error) {
    return failure(error);
  }
}

export const createTemporaryOutcomeNetworkV2
  = createOutcomeFormationTemporaryNetworkV2;
export const verifyTemporaryOutcomeNetworkV2
  = verifyOutcomeFormationTemporaryNetworkV2;
