/*
 * Outcome Formation Engine: per-tender temporary resource network v1.
 *
 * This descendant composes four already-separated, source-replayable layers:
 * the immutable temporary-network North Star, the foundation-bound formation
 * evaluation, transaction-surface route discovery, and one-use response plus
 * optional external receipt lifecycles.  It performs no I/O and never turns a
 * discovered reference, caller-declared response, signature, receipt, server
 * acknowledgement, or structural conformance result into capacity or
 * authority.  A resource-owner trust registry is not yet independently
 * source-replayed, so even a cryptographically consistent external bundle is
 * an untrusted source declaration and the complete result remains HOLD.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyOutcomeFormationFoundationBoundEvaluationV1,
} from "./outsider-outcome-formation-foundation-replay-v1.js";
import {
  verifyOutcomeFormationTemporaryNetworkNorthStarV1,
} from "./outsider-outcome-formation-temporary-network-north-star-v1.js";
import {
  verifyOutcomeResourceRouteDiscoverySnapshotV1,
} from "./outsider-outcome-resource-route-discovery-v1.js";
import {
  verifyExternalCapacityReceiptLifecycleV1,
  verifyOneUseTenderResponseLifecycleV1,
} from "./outsider-one-use-tender-response-lifecycle-v1.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArrayMap = Function.prototype.call.bind(Array.prototype.map);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const BufferIsBuffer = Buffer.isBuffer;
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const MapConstructor = Map;
const MapGet = Function.prototype.call.bind(Map.prototype.get);
const MapHas = Function.prototype.call.bind(Map.prototype.has);
const MapSet = Function.prototype.call.bind(Map.prototype.set);
const NumberIsFinite = Number.isFinite;
const ObjectFreeze = Object.freeze;
const ObjectDefineProperty = Object.defineProperty;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
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

const PREFIX = "OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const NETWORK_ID = /^network_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_SELECTED_ROUTES = 512;
const MAX_EXTERNAL_LIFECYCLE_EVENTS_PER_SOURCE = 1_024;

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_LIMITS
  = ObjectFreeze({
    maximumSelectedRouteResponses: MAX_SELECTED_ROUTES,
    maximumExternalLifecycleEventsPerSource:
      MAX_EXTERNAL_LIFECYCLE_EVENTS_PER_SOURCE,
    maximumAggregateExternalSourceBytes: 64 * 1024 * 1024,
  });

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_SCHEMAS
  = ObjectFreeze({
    network: "outsider/outcome-formation-temporary-resource-network/v1",
    verification:
      "outsider/outcome-formation-temporary-resource-network-verification/v1",
  });

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES
  = ObjectFreeze({
    sourceDeclarations:
      "TEMPORARY_NETWORK_REFERENCES_AND_SOURCE_DECLARATIONS_REPLAYED_EXTERNAL_TRUST_HOLD",
    callerDeclarations:
      "TEMPORARY_NETWORK_REFERENCES_AND_CURRENT_CALLER_DECLARED_ONE_USE_RESPONSES_HOLD",
    forming:
      "TEMPORARY_NETWORK_INCOMPLETE_CONTINUE_AUTOMATED_FORMATION_HOLD",
    declined: "TEMPORARY_NETWORK_UNFORMED_DECLINED",
  });

export const OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_BOUNDARY
  = deepFreeze({
    position:
      "PER_TENDER_EPHEMERAL_EXTERNAL_RESOURCE_REFERENCE_NETWORK_HOLD_ONLY",
    oneTenderOneTemporaryNetwork: true,
    globalTenderToNetworkUniquenessEstablished: false,
    temporaryNetworkIdReplayProtectionEstablished: false,
    outsiderOwnsProviderInventory: false,
    providerEnrollmentPerformed: false,
    discoveryReferencesAreCapacity: false,
    callerDeclaredResponseIsAuthenticatedExternalResponse: false,
    sourceSignatureIsIndependentResourceOwnerTrust: false,
    externalReceiptIsAuthority: false,
    independentResourceOwnerTrustRegistryReplayed: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    legalIdentityEstablished: false,
    authorityEstablished: false,
    actionReady: false,
    executable: false,
    networkIoPerformed: false,
    providerContactPerformed: false,
    providerTenderSent: false,
    filesystemIoPerformed: false,
    outsiderStaffInterventionsInThisPureModule: 0,
    staffTouchLedgerSourceReplayed: false,
    anyOutsiderStaffTouchIsFormationFailure: true,
    externalRouteZeroInternalOpsEstablished: false,
    internalHumanFallbackPermitted: false,
    unavailableDisposition: "DECLINE_NOT_HUMAN_QUEUE",
    typedGraphModel:
      "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT",
    episodeScopeCount: 1,
    attemptOccurrenceDenominatorReduced: false,
    attemptGlobalCompletenessEstablished: false,
    responseOccurrenceDenominatorExternallyAnchored: false,
    responseCompletenessBeyondCallerPinEstablished: false,
    externalSourceNonEquivocationEstablished: false,
    externalSourceCompletenessBeyondPinnedHeadEstablished: false,
    aggregateExternalSourceBytePreflightEnforced: true,
    maximumAggregateExternalSourceBytes: 64 * 1024 * 1024,
    nonceGlobalFreshnessEstablished: false,
    nonceConsumptionPersisted: false,
    networkDissolutionErasesEpisodeAttemptHistory: false,
    networkDissolutionErasesOpenObligations: false,
    evidenceChallengeRecoveryAndResponsibilityPersistUntilValidClosure: true,
    atomicAllGatesUserPromiseRequired: true,
    partialPromisePermitted: false,
    manualPromiseOverridePermitted: false,
    userOutcomePromiseIssued: false,
    rightsPrivacyEstablished: false,
    domainSpecificCoreBranching: false,
    structuralConformanceMintsAuthority: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    cEnabledSubsetAProven: true,
    consequenceReach: "NONE",
    priceEstablished: false,
    guaranteeCreated: false,
    settlementPermitted: false,
    moneyMovementEnabled: false,
    decisionState: "HOLD",
    authority: "NONE",
  });

const INPUT_FIELDS = ObjectFreeze([
  "temporaryNetworkId", "observedAt", "northStarReplay",
  "foundationBoundEvaluationReplay", "routeDiscoveryReplay",
  "selectedRouteResponseSources",
]);
const NORTH_STAR_REPLAY_FIELDS = ObjectFreeze([
  "record", "source", "expectedNorthStarInvariantHash",
]);
const FOUNDATION_REPLAY_FIELDS = ObjectFreeze([
  "record", "source", "expectedFoundationBoundEvaluationHash",
]);
const DISCOVERY_REPLAY_FIELDS = ObjectFreeze([
  "record", "source", "expectedSnapshotHash",
]);
const SELECTED_RESPONSE_FIELDS = ObjectFreeze([
  "routeObjectHash", "currentCandidateHash", "responseLifecycleSource",
  "expectedResponseLifecycleVerificationHash",
  "externalCapacityLifecycleSource",
  "expectedExternalCapacityVerificationHash",
]);
const EXTERNAL_CAPACITY_SOURCE_FIELDS = ObjectFreeze([
  "tender", "expectedTenderHash", "responses", "responseOccurrences",
  "expectedResponseOccurrenceCount", "expectedResponseLifecycleHeadHash",
  "verifierContext", "expectedVerifierContextHash", "semanticsSourceBytes",
  "expectedSemanticsSourceHash", "standingSourceBytes",
  "expectedStandingSourceHash", "receiptSourceBytes",
  "expectedReceiptSourceHash", "lifecycleEventSourceBytes",
  "lifecycleHeadSourceBytes", "expectedLifecycleHeadSourceHash", "observedAt",
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

/* Validate only integration-owned containers. Dependency sources may contain
 * byte buffers or dependency-specific opaque objects and are validated by the
 * dependency verifier that owns their schema. */
function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || BufferIsBuffer(value) || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  const expected = new SetConstructor(fields);
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
    const descriptor = ObjectGetOwnPropertyDescriptor(value,
      StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
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
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)
    || !NumberIsFinite(DateParse(value))
    || DateToISOString(new DateConstructor(value)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function networkId(value) {
  if (typeof value !== "string" || !RegExpTest(NETWORK_ID, value)) {
    fail("TEMPORARY_NETWORK_ID_INVALID");
  }
  return value;
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function same(left, right) {
  try {
    return canonicalizeStrict(left) === canonicalizeStrict(right);
  } catch {
    fail("CANONICAL_COMPARISON_FAILED");
  }
}

function requirementKey(kind, id) {
  return `${kind}:${id}`;
}

function checkedBufferLength(value, code) {
  if (isProxy(value) || !BufferIsBuffer(value)) {
    fail(`${code}_BUFFER_REQUIRED`);
  }
  return value.length;
}

/* Enforce one aggregate byte budget before invoking any signature verifier.
 * Dependency-specific per-document and per-lifecycle limits still apply. */
function preflightExternalSourceBytes(selectedSources) {
  let total = 0;
  for (let index = 0; index < selectedSources.length; index += 1) {
    const selected = exactObject(selectedSources[index],
      SELECTED_RESPONSE_FIELDS, "SELECTED_ROUTE_RESPONSE_PREFLIGHT");
    const source = selected.externalCapacityLifecycleSource;
    if (source === null) continue;
    exactObject(source, EXTERNAL_CAPACITY_SOURCE_FIELDS,
      "EXTERNAL_CAPACITY_SOURCE_PREFLIGHT");
    const fixedBuffers = [source.semanticsSourceBytes,
      source.standingSourceBytes, source.receiptSourceBytes,
      source.lifecycleHeadSourceBytes];
    for (let bufferIndex = 0; bufferIndex < fixedBuffers.length;
      bufferIndex += 1) {
      total += checkedBufferLength(fixedBuffers[bufferIndex],
        "EXTERNAL_SOURCE_PREFLIGHT");
      if (total > OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_LIMITS
        .maximumAggregateExternalSourceBytes) {
        fail("AGGREGATE_EXTERNAL_SOURCE_BYTES_EXCEEDED");
      }
    }
    denseArray(source.lifecycleEventSourceBytes,
      "EXTERNAL_LIFECYCLE_EVENT_SOURCE_BYTES_PREFLIGHT",
      MAX_EXTERNAL_LIFECYCLE_EVENTS_PER_SOURCE);
    for (let eventIndex = 0;
      eventIndex < source.lifecycleEventSourceBytes.length; eventIndex += 1) {
      total += checkedBufferLength(source.lifecycleEventSourceBytes[eventIndex],
        "EXTERNAL_EVENT_SOURCE_PREFLIGHT");
      if (total > OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_LIMITS
        .maximumAggregateExternalSourceBytes) {
        fail("AGGREGATE_EXTERNAL_SOURCE_BYTES_EXCEEDED");
      }
    }
  }
  return total;
}

function fixedHoldCheck(value, code) {
  if (value.ok !== true || value.decisionState !== "HOLD"
    || value.authority !== "NONE" || value.actionReady !== false
    || value.executable !== false) fail(code);
  return value;
}

function verifyNorthStar(wrapper) {
  exactObject(wrapper, NORTH_STAR_REPLAY_FIELDS, "NORTH_STAR_REPLAY");
  const expected = hash(wrapper.expectedNorthStarInvariantHash,
    "EXPECTED_NORTH_STAR_INVARIANT_HASH");
  const checked = verifyOutcomeFormationTemporaryNetworkNorthStarV1(
    wrapper.record, { source: wrapper.source,
      expectedNorthStarInvariantHash: expected });
  fixedHoldCheck(checked, "NORTH_STAR_SOURCE_REPLAY_FAILED");
  if (checked.northStarInvariantHash !== expected
    || checked.exactSourceVerified !== true || checked.sourceRebuilt !== true
    || checked.permanentInvariantContractVerified !== true
    || checked.domainAgnosticCoreContractVerified !== true
    || wrapper.record.topology.networkDissolutionErasesEpisodeAttemptHistory
      !== false
    || wrapper.record.topology.networkDissolutionErasesOpenObligations !== false
    || wrapper.record.topology
      .evidenceChallengeRecoveryAndResponsibilityPersistUntilValidClosure
      !== true
    || wrapper.record.commitmentGate.userOutcomePromiseFormationMode
      !== "ATOMIC_ALL_REQUIRED_GATES"
    || wrapper.record.commitmentGate.partialPromiseOnIncompleteFormationAllowed
      !== false
    || wrapper.record.commitmentGate.manualOverrideAllowed !== false
    || wrapper.record.commitmentGate.atFormationDeadlineDisposition
      !== "DECLINE_NOT_HUMAN_QUEUE") {
    fail("NORTH_STAR_SOURCE_REPLAY_FAILED");
  }
  return checked;
}

function verifyFoundation(wrapper) {
  exactObject(wrapper, FOUNDATION_REPLAY_FIELDS,
    "FOUNDATION_BOUND_EVALUATION_REPLAY");
  const expected = hash(wrapper.expectedFoundationBoundEvaluationHash,
    "EXPECTED_FOUNDATION_BOUND_EVALUATION_HASH");
  const checked = verifyOutcomeFormationFoundationBoundEvaluationV1(
    wrapper.record, { source: wrapper.source,
      expectedFoundationBoundEvaluationHash: expected });
  fixedHoldCheck(checked, "FOUNDATION_BOUND_EVALUATION_SOURCE_REPLAY_FAILED");
  if (checked.foundationBoundEvaluationHash !== expected
    || checked.sourceRecordsReplayed !== true
    || checked.engineEvaluationRederived !== true
    || checked.expectedHashMatched !== true
    || checked.holdBoundaryVerified !== true) {
    fail("FOUNDATION_BOUND_EVALUATION_SOURCE_REPLAY_FAILED");
  }
  return checked;
}

function verifyDiscovery(wrapper) {
  exactObject(wrapper, DISCOVERY_REPLAY_FIELDS, "ROUTE_DISCOVERY_REPLAY");
  const expected = hash(wrapper.expectedSnapshotHash,
    "EXPECTED_DISCOVERY_SNAPSHOT_HASH");
  const checked = verifyOutcomeResourceRouteDiscoverySnapshotV1(
    wrapper.record, { source: wrapper.source, expectedSnapshotHash: expected });
  if (checked.ok !== true || checked.decision !== "HOLD"
    || checked.authority !== "NONE" || checked.actionReady !== false
    || checked.executable !== false || checked.snapshotHash !== expected
    || checked.snapshotRecordRederivedFromInput !== true
    || checked.exactTenderAndRequirementCrossBindingVerified !== true
    || checked.occurrenceCensusVerified !== true
    || checked.objectDedupVerified !== true
    || checked.inSnapshotReferenceLifecycleReplayed !== true
    || checked.externalSourceReplayVerified !== false
    || checked.externalRouteZeroInternalOpsEstablished !== false) {
    fail("ROUTE_DISCOVERY_SOURCE_REPLAY_FAILED");
  }
  return checked;
}

function findExactly(rows, predicate, code) {
  let found = null;
  let count = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (predicate(rows[index])) {
      found = rows[index];
      count += 1;
    }
  }
  if (count !== 1) fail(code);
  return found;
}

function responseSourceMatchesExternal(responseSource, externalSource) {
  return same(responseSource.tender, externalSource.tender)
    && responseSource.expectedTenderHash === externalSource.expectedTenderHash
    && same(responseSource.responses, externalSource.responses)
    && same(responseSource.occurrences, externalSource.responseOccurrences)
    && responseSource.expectedOccurrenceCount
      === externalSource.expectedResponseOccurrenceCount
    && responseSource.expectedLifecycleHeadHash
      === externalSource.expectedResponseLifecycleHeadHash
    && responseSource.observedAt === externalSource.observedAt;
}

function selectedResponseRow(source, tender, snapshot, observedAt) {
  exactObject(source, SELECTED_RESPONSE_FIELDS, "SELECTED_ROUTE_RESPONSE");
  const routeObjectHash = hash(source.routeObjectHash, "ROUTE_OBJECT_HASH");
  const currentCandidateHash = hash(source.currentCandidateHash,
    "CURRENT_CANDIDATE_HASH");
  const routeObject = findExactly(snapshot.routeObjects,
    (row) => row.routeObjectHash === routeObjectHash,
    "SELECTED_ROUTE_OBJECT_NOT_EXACTLY_PRESENT");
  if (routeObject.currentReferenceAvailable !== true
    || routeObject.currentCandidateHash !== currentCandidateHash) {
    fail("SELECTED_ROUTE_NOT_CURRENT_DISCOVERY_REFERENCE");
  }
  const candidate = findExactly(snapshot.candidateOccurrences,
    (row) => row.candidateHash === currentCandidateHash,
    "SELECTED_CURRENT_CANDIDATE_NOT_EXACTLY_PRESENT");
  if (candidate.routeObject.routeObjectHash !== routeObjectHash) {
    fail("SELECTED_ROUTE_CANDIDATE_SPLICE");
  }
  const requirement = findExactly(snapshot.requirementBindings,
    (row) => row.requirementKind === routeObject.requirementKind
      && row.requirementId === routeObject.requirementId,
    "SELECTED_ROUTE_REQUIREMENT_NOT_EXACTLY_PRESENT");

  const expectedResponseHash = hash(
    source.expectedResponseLifecycleVerificationHash,
    "EXPECTED_RESPONSE_LIFECYCLE_VERIFICATION_HASH");
  const responseCheck = verifyOneUseTenderResponseLifecycleV1(
    source.responseLifecycleSource);
  fixedHoldCheck(responseCheck, "RESPONSE_LIFECYCLE_SOURCE_REPLAY_FAILED");
  if (responseCheck.verificationHash !== expectedResponseHash
    || source.responseLifecycleSource.observedAt !== observedAt
    || !same(source.responseLifecycleSource.tender, tender)
    || source.responseLifecycleSource.expectedTenderHash !== tender.tenderHash
    || responseCheck.tenderSourceReplayed !== true
    || responseCheck.responseRecordsSourceRebuilt !== true
    || responseCheck.appendOnlyLineageReplayed !== true
    || responseCheck.responseOccurrenceDenominatorReplayed !== true
    || responseCheck.responseLifecycleHeadMatchedCallerPin !== true
    || responseCheck.tenderHash !== tender.tenderHash
    || responseCheck.typedGraphHash !== tender.typedGraph.typedGraphHash
    || responseCheck.episodeHash !== tender.typedGraph.episode.episodeHash
    || responseCheck.networkCompleteEpisodeJoinHash
      !== tender.typedGraph.episode.networkCompleteEpisodeJoinHash
    || responseCheck.attemptHash !== tender.typedGraph.attempt.attemptHash
    || responseCheck.requirementKind !== requirement.requirementKind
    || responseCheck.requirementId !== requirement.requirementId
    || responseCheck.discoveryRouteObjectHash !== routeObjectHash
    || responseCheck.discoveryCandidateHash !== currentCandidateHash
    || responseCheck.requirementObjectHash !== requirement.requirementObjectHash
    || responseCheck.requirementSetHash !== requirement.requirementSetHash
    || responseCheck.requirementClassCode
      !== requirement.requirementClassCode
    || responseCheck.requirementScopeRefHash
      !== requirement.requirementScopeRefHash
    || responseCheck.dueBy !== requirement.dueBy
    || responseCheck.evidencePlanHash
      !== tender.evidenceRequirements.requirementSetHash
    || responseCheck.remedyPlanHash
      !== tender.recoveryRequirements.requirementSetHash
    || responseCheck.capacityReserved !== false
    || responseCheck.providerAuthorityEstablished !== false) {
    fail("RESPONSE_LIFECYCLE_OR_REQUIREMENT_CROSS_BINDING_FAILED");
  }

  let external = null;
  if (source.externalCapacityLifecycleSource === null) {
    if (source.expectedExternalCapacityVerificationHash !== null) {
      fail("ABSENT_EXTERNAL_CAPACITY_SOURCE_HASH_MUST_BE_NULL");
    }
  } else {
    const expectedExternalHash = hash(
      source.expectedExternalCapacityVerificationHash,
      "EXPECTED_EXTERNAL_CAPACITY_VERIFICATION_HASH");
    if (source.externalCapacityLifecycleSource.observedAt !== observedAt
      || !responseSourceMatchesExternal(source.responseLifecycleSource,
        source.externalCapacityLifecycleSource)) {
      fail("EXTERNAL_CAPACITY_RESPONSE_SOURCE_SPLICE");
    }
    external = verifyExternalCapacityReceiptLifecycleV1(
      source.externalCapacityLifecycleSource);
    fixedHoldCheck(external, "EXTERNAL_CAPACITY_SOURCE_REPLAY_FAILED");
    if (external.verificationHash !== expectedExternalHash
      || external.tenderHash !== responseCheck.tenderHash
      || external.typedGraphHash !== responseCheck.typedGraphHash
      || external.episodeHash !== responseCheck.episodeHash
      || external.attemptHash !== responseCheck.attemptHash
      || external.oneUseResponseHash !== responseCheck.initialResponseHash
      || external.responseLifecycleHeadHash !== responseCheck.lifecycleHeadHash
      || external.discoveryRouteObjectHash !== routeObjectHash
      || external.discoveryCandidateHash !== currentCandidateHash
      || external.requirementObjectHash !== requirement.requirementObjectHash
      || external.tenderAndResponseSourcesReplayed !== true
      || external.sourceBundleCryptographicallyConsistent !== true
      || external.independentResourceOwnerTrustAnchorReplayed !== false
      || external.trustAnchorUnestablished !== true
      || external.externalCapacityEstablished !== false
      || external.capacityReserved !== false
      || external.authorityEstablished !== false) {
      fail("EXTERNAL_CAPACITY_SOURCE_REPLAY_OR_BOUNDARY_FAILED");
    }
  }

  return {
    requirementKey: requirementKey(requirement.requirementKind,
      requirement.requirementId),
    requirementKind: requirement.requirementKind,
    requirementId: requirement.requirementId,
    requirementClassCode: requirement.requirementClassCode,
    requirementObjectHash: requirement.requirementObjectHash,
    mandatory: requirement.mandatory,
    routeKind: routeObject.routeKind,
    routeObjectHash,
    currentCandidateHash,
    routeAndCandidateHashesCrossBoundAcrossReplayedModules: true,
    routeAssociationExternallyEstablished: false,
    routeReferenceCurrentWithinKnownTtlAtObservedAt:
      DateParse(observedAt) < DateParse(candidate.routeOccurrence.validUntil)
        && (candidate.lifecycle.revokedAt === null
          || DateParse(candidate.lifecycle.revokedAt) > DateParse(observedAt)),
    responseLifecycleVerificationHash: responseCheck.verificationHash,
    responseLifecycleHeadHash: responseCheck.lifecycleHeadHash,
    responseOccurrenceCount: responseCheck.responseOccurrenceCount,
    responseState: responseCheck.currentResponseState,
    providerRefHash: responseCheck.providerRefHash,
    oneUseScopeHash: responseCheck.scopeHash,
    oneUseOnly: true,
    currentCallerDeclaredOneUseResponseReference:
      responseCheck.currentCallerDeclaredOneUseOfferReference === true,
    responseSourceAuthenticityEstablished: false,
    externalCapacityBundleSupplied: external !== null,
    externalCapacityVerificationHash:
      external === null ? null : external.verificationHash,
    externalSourceSystemIdPrivate:
      external === null ? null : external.sourceSystemId,
    externalLifecycleStreamIdPrivate:
      external === null ? null : external.lifecycleStreamId,
    externalLifecycleState:
      external === null ? null : external.externalLifecycleState,
    externalLifecycleOccurrenceCount:
      external === null ? 0 : external.externalLifecycleOccurrenceCount,
    exactExternalSourceByteCount:
      external === null ? 0 : external.exactExternalSourceByteCount,
    sourceBundleCryptographicallyConsistent:
      external === null ? false : external.sourceBundleCryptographicallyConsistent,
    sourceDeclaredReservationCurrent:
      external === null ? false : external.sourceDeclaredReservationCurrent,
    ownerStandingClaimSigned:
      external === null ? false : external.ownerStandingClaimSigned,
    ownerStandingClaimIsIndependentTrustAnchor: false,
    independentResourceOwnerTrustAnchorReplayed: false,
    trustAnchorUnestablished: true,
    externalCapacityEstablished: false,
    capacityReserved: false,
    providerLegalIdentityEstablished: false,
    providerAuthorityEstablished: false,
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
}

function firstPrimaryResourceRequirement(tender) {
  const items = tender.resourceRequirements.items;
  for (let index = 0; index < items.length; index += 1) {
    if (items[index].mandatory === true) return items[index];
  }
  return items.length === 0 ? null : items[0];
}

function assessFoundationOneUse(wrapper, selectedByRequirement, tender,
  observedAt) {
  const evaluation = wrapper.record.formationEvaluation;
  const assessment = evaluation.oneUseAssessment;
  const owner = wrapper.source.ownerMandate;
  const provider = wrapper.source.providerAcceptance;
  const structural = assessment.structuralVerificationOk === true
    && assessment.crossBoundToTender === true;
  const ownerExact = structural && owner !== null
    && owner.tenderHash === tender.tenderHash
    && owner.scopeHash === tender.exactOutcome.exactOutcomeHash
    && owner.evidencePlanHash
      === tender.evidenceRequirements.requirementSetHash
    && owner.remedyPlanHash
      === tender.recoveryRequirements.requirementSetHash
    && owner.response === "ACCEPT"
    && DateParse(observedAt) < DateParse(owner.expiresAt);
  const providerExact = structural && provider !== null
    && provider.tenderHash === tender.tenderHash
    && provider.scopeHash === tender.exactOutcome.exactOutcomeHash
    && provider.evidencePlanHash
      === tender.evidenceRequirements.requirementSetHash
    && provider.remedyPlanHash
      === tender.recoveryRequirements.requirementSetHash
    && provider.response === "ACCEPT"
    && DateParse(observedAt) < DateParse(provider.expiresAt);
  const primary = firstPrimaryResourceRequirement(tender);
  const primaryRow = primary === null ? null
    : MapGet(selectedByRequirement,
      requirementKey("RESOURCE", primary.resourceRequirementId)) ?? null;
  const primaryProviderRefMatched = primary === null
    ? true : providerExact && primaryRow !== null
      && primaryRow.providerRefHash === provider.providerRefHash;
  return {
    foundationBoundEvaluationSourceReplayed: true,
    foundationBoundEvaluationHash: wrapper.record.foundationBoundEvaluationHash,
    outcomeLevelOwnerMandateStructurallyVerifiedAndCrossBound: ownerExact,
    outcomeLevelProviderAcceptanceStructurallyVerifiedAndCrossBound:
      providerExact,
    outcomeLevelOneUseRecordsExternallyAuthenticated: false,
    primaryResourceRequirementId:
      primary === null ? null : primary.resourceRequirementId,
    primaryResourceResponsePresent: primary === null ? true : primaryRow !== null,
    primaryResourceResponseProviderRefMatchesOutcomeLevelAcceptance:
      primaryProviderRefMatched,
    foundationCapacityReceiptReferencePresent:
      assessment.capacityReservationReceiptPresent === true,
    foundationCapacityReceiptAuthenticityEstablished: false,
    outcomeLevelReferenceCrossBindingSatisfied:
      ownerExact && providerExact && primaryProviderRefMatched,
    perRequirementProviderAcceptanceClosureEstablished: false,
    primaryProviderAcceptanceBindsResponseQuantityServiceWindowAndScope: false,
    evidenceProviderAcceptanceExternallyAuthenticated: false,
    recoveryProviderAcceptanceExternallyAuthenticated: false,
    ownerMandateOrProviderAcceptanceMintsAuthority: false,
    authority: "NONE",
  };
}

function requirementCoverage(snapshot, selectedByRequirement, observedAt,
  formationDeadlineReached) {
  const rows = [];
  let mandatoryCount = 0;
  let mandatoryRouteGapCount = 0;
  let mandatoryResponseGapCount = 0;
  let mandatoryExternalDeclarationCount = 0;
  let mandatoryExternalContradictionCount = 0;
  for (let index = 0; index < snapshot.requirementBindings.length; index += 1) {
    const requirement = snapshot.requirementBindings[index];
    const key = requirementKey(requirement.requirementKind,
      requirement.requirementId);
    const fanout = findExactly(snapshot.fanoutPlan.requirements,
      (row) => row.requirementKind === requirement.requirementKind
        && row.requirementId === requirement.requirementId,
      "FANOUT_REQUIREMENT_BINDING_MISSING");
    const selected = MapGet(selectedByRequirement, key) ?? null;
    let routeCurrentWithinKnownTtl = false;
    for (let candidateIndex = 0;
      candidateIndex < fanout.currentCandidateHashes.length;
      candidateIndex += 1) {
      for (let sourceIndex = 0;
        sourceIndex < snapshot.candidateOccurrences.length; sourceIndex += 1) {
        const candidate = snapshot.candidateOccurrences[sourceIndex];
        if (candidate.candidateHash
            === fanout.currentCandidateHashes[candidateIndex]
          && DateParse(observedAt)
            < DateParse(candidate.routeOccurrence.validUntil)
          && (candidate.lifecycle.revokedAt === null
            || DateParse(candidate.lifecycle.revokedAt) > DateParse(observedAt))) {
          routeCurrentWithinKnownTtl = true;
        }
      }
    }
    const routeCurrent = fanout.currentRouteReferenceAvailable === true
      && routeCurrentWithinKnownTtl && !formationDeadlineReached;
    const responseCurrent = selected !== null
      && selected.currentCallerDeclaredOneUseResponseReference === true
      && selected.routeReferenceCurrentWithinKnownTtlAtObservedAt === true
      && !formationDeadlineReached;
    const externalCurrent = selected !== null
      && selected.externalCapacityBundleSupplied === true
      && selected.sourceDeclaredReservationCurrent === true;
    const externalContradiction = selected !== null
      && selected.externalCapacityBundleSupplied === true
      && selected.sourceDeclaredReservationCurrent !== true;
    if (requirement.mandatory === true) {
      mandatoryCount += 1;
      if (!routeCurrent) mandatoryRouteGapCount += 1;
      if (!responseCurrent) mandatoryResponseGapCount += 1;
      if (externalCurrent) mandatoryExternalDeclarationCount += 1;
      if (externalContradiction) mandatoryExternalContradictionCount += 1;
    }
    append(rows, {
      requirementKind: requirement.requirementKind,
      requirementId: requirement.requirementId,
      requirementClassCode: requirement.requirementClassCode,
      requirementObjectHash: requirement.requirementObjectHash,
      mandatory: requirement.mandatory,
      currentDiscoveredRouteReferenceAvailable: routeCurrent,
      discoverySnapshotReferenceWasCurrentAtSnapshot:
        fanout.currentRouteReferenceAvailable === true,
      routeReferenceCurrentWithinKnownTtlAtObservedAt:
        routeCurrentWithinKnownTtl && !formationDeadlineReached,
      selectedRouteObjectHash: selected === null ? null
        : selected.routeObjectHash,
      selectedCurrentCandidateHash: selected === null ? null
        : selected.currentCandidateHash,
      oneUseResponseLifecycleReplayed: selected !== null,
      responseLifecycleHeadHash: selected === null ? null
        : selected.responseLifecycleHeadHash,
      responseState: selected === null ? null : selected.responseState,
      currentCallerDeclaredOneUseResponseReference: responseCurrent,
      responseSourceAuthenticityEstablished: false,
      externalCapacityBundleSupplied:
        selected !== null && selected.externalCapacityBundleSupplied,
      externalSourceDeclarationCurrent: externalCurrent,
      externalSourceDeclarationContradictsCurrentReservation:
        externalContradiction,
      independentResourceOwnerTrustAnchorReplayed: false,
      capacityReserved: false,
      authority: "NONE",
    });
  }
  return {
    rows,
    mandatoryRequirementCount: mandatoryCount,
    mandatoryRouteGapCount,
    mandatoryResponseGapCount,
    mandatoryExternalDeclarationCount,
    mandatoryExternalContradictionCount,
    allMandatoryRequirementsHaveCurrentRouteReferences:
      mandatoryRouteGapCount === 0,
    allMandatoryRequirementsHaveCurrentCallerDeclaredOneUseResponses:
      mandatoryResponseGapCount === 0,
    allMandatoryRequirementsHaveCurrentExternalSourceDeclarations:
      mandatoryCount > 0
        && mandatoryExternalDeclarationCount === mandatoryCount,
  };
}

function gaps(coverage, foundationOneUse, formationDeadlineReached) {
  const result = [];
  if (formationDeadlineReached) {
    append(result, "FORMATION_DEADLINE_REACHED_AUTOMATIC_DECLINE");
  }
  if (coverage.mandatoryRouteGapCount > 0) {
    append(result, "MANDATORY_CURRENT_ROUTE_REFERENCE_MISSING");
  }
  if (coverage.mandatoryResponseGapCount > 0) {
    append(result, "MANDATORY_CURRENT_ONE_USE_RESPONSE_REFERENCE_MISSING");
  }
  if (coverage.mandatoryExternalContradictionCount > 0) {
    append(result, "SUPPLIED_EXTERNAL_RESERVATION_DECLARATION_NOT_CURRENT");
  }
  if (!foundationOneUse
    .outcomeLevelOwnerMandateStructurallyVerifiedAndCrossBound) {
    append(result, "OUTCOME_LEVEL_OWNER_ONE_USE_MANDATE_MISSING_OR_MISMATCHED");
  }
  if (!foundationOneUse
    .outcomeLevelProviderAcceptanceStructurallyVerifiedAndCrossBound) {
    append(result,
      "OUTCOME_LEVEL_PROVIDER_ONE_USE_ACCEPTANCE_MISSING_OR_MISMATCHED");
  }
  if (!foundationOneUse
    .primaryResourceResponseProviderRefMatchesOutcomeLevelAcceptance) {
    append(result, "PRIMARY_RESOURCE_RESPONSE_PROVIDER_REFERENCE_MISMATCH");
  }
  append(result,
    "PER_REQUIREMENT_PROVIDER_ACCEPTANCE_AUTHENTICITY_NOT_ESTABLISHED");
  append(result, "INDEPENDENT_EVIDENCE_ORGANIZATIONAL_STANDING_NOT_ESTABLISHED");
  append(result, "ALTERNATE_RECOVERY_INDEPENDENCE_NOT_ESTABLISHED");
  append(result, "DURABLE_OBLIGATION_SEMANTIC_REPLAY_NOT_ESTABLISHED");
  append(result, "RIGHTS_PRIVACY_SOURCE_REPLAY_NOT_ESTABLISHED");
  append(result, "DISCOVERY_EXTERNAL_SOURCE_OBJECTS_NOT_REPLAYED");
  append(result, "ROUTE_TO_RESPONSE_ASSOCIATIONS_NOT_EXTERNALLY_ESTABLISHED");
  append(result, "RESOURCE_OWNER_TRUST_REGISTRY_NOT_REPLAYED");
  append(result, "EXTERNAL_CAPACITY_NOT_ESTABLISHED");
  append(result, "EXTERNAL_ROUTE_ZERO_INTERNAL_OPS_NOT_ESTABLISHED");
  append(result, "GLOBAL_ATTEMPT_CENSUS_COMPLETENESS_NOT_ESTABLISHED");
  append(result, "RESPONSE_OCCURRENCE_DENOMINATOR_NOT_EXTERNALLY_ANCHORED");
  append(result, "EXTERNAL_SOURCE_NON_EQUIVOCATION_NOT_ESTABLISHED");
  append(result, "EXTERNAL_SOURCE_COMPLETENESS_BEYOND_PINNED_HEAD_UNPROVEN");
  append(result, "ONE_USE_NONCE_GLOBAL_FRESHNESS_AND_CONSUMPTION_UNPROVEN");
  append(result, "GLOBAL_TENDER_TO_NETWORK_UNIQUENESS_NOT_ESTABLISHED");
  append(result, "STAFF_TOUCH_LEDGER_NOT_SOURCE_REPLAYED");
  append(result, "AUTHORITY_AND_ACTION_ADMISSION_NOT_ESTABLISHED");
  append(result, "PRICE_GUARANTEE_SETTLEMENT_DEFERRED");
  append(result, "ATOMIC_USER_OUTCOME_PROMISE_GATES_INCOMPLETE");
  return result;
}

/**
 * Compose one per-tender temporary network from exact dependency sources.
 * The output contains only derived references and verification facts; raw
 * external source bytes and private transaction-surface references stay in the
 * caller-owned source bundle.
 */
export function createOutcomeFormationTemporaryNetworkV1(input = {}) {
  exactObject(input, INPUT_FIELDS, "CREATE_INPUT");
  const id = networkId(input.temporaryNetworkId);
  const observedAt = instant(input.observedAt, "OBSERVED_AT");
  const northStar = verifyNorthStar(input.northStarReplay);
  const foundation = verifyFoundation(input.foundationBoundEvaluationReplay);
  const discovery = verifyDiscovery(input.routeDiscoveryReplay);
  const foundationSource = input.foundationBoundEvaluationReplay.source;
  const discoverySource = input.routeDiscoveryReplay.source;
  const tender = foundationSource.tender;
  if (!same(tender, discoverySource.tender)
    || foundationSource.expectedTenderHash !== tender.tenderHash
    || input.foundationBoundEvaluationReplay.record.formationEvaluation
      .tenderAssessment.expectedTenderHash !== tender.tenderHash
    || input.routeDiscoveryReplay.record.tenderBinding.tenderHash
      !== tender.tenderHash
    || foundationSource.evaluatedAt !== observedAt
    || DateParse(discoverySource.asOf) > DateParse(observedAt)) {
    fail("FOUNDATION_DISCOVERY_TENDER_OR_TIME_SPLICE");
  }
  const formationDeadlineReached
    = DateParse(observedAt) >= DateParse(tender.formationDeadline);

  denseArray(input.selectedRouteResponseSources, "SELECTED_ROUTE_RESPONSES",
    MAX_SELECTED_ROUTES);
  const exactTenderRequirementCount = tender.resourceRequirements.items.length
    + tender.evidenceRequirements.items.length
    + tender.recoveryRequirements.items.length;
  if (input.selectedRouteResponseSources.length > exactTenderRequirementCount) {
    fail("SELECTED_ROUTE_RESPONSE_COUNT_EXCEEDS_TENDER_REQUIREMENT_COUNT");
  }
  const aggregateExternalSourceByteCountPreflight
    = preflightExternalSourceBytes(input.selectedRouteResponseSources);
  const selectedRows = [];
  const selectedByRequirement = new MapConstructor();
  const routeHashes = new SetConstructor();
  const candidateHashes = new SetConstructor();
  const responseHashes = new SetConstructor();
  const responseNonces = new SetConstructor();
  const occurrenceNonces = new SetConstructor();
  const externalStreams = new SetConstructor();
  let totalResponseOccurrences = 0;
  let totalExternalOccurrences = 0;
  let totalExternalSourceBytes = 0;
  for (let index = 0; index < input.selectedRouteResponseSources.length;
    index += 1) {
    const source = input.selectedRouteResponseSources[index];
    const row = selectedResponseRow(source, tender,
      input.routeDiscoveryReplay.record, observedAt);
    if (MapHas(selectedByRequirement, row.requirementKey)
      || SetHas(routeHashes, row.routeObjectHash)
      || SetHas(candidateHashes, row.currentCandidateHash)
      || SetHas(responseHashes, row.responseLifecycleHeadHash)) {
      fail("DUPLICATE_SELECTED_ROUTE_RESPONSE_BINDING");
    }
    MapSet(selectedByRequirement, row.requirementKey, row);
    SetAdd(routeHashes, row.routeObjectHash);
    SetAdd(candidateHashes, row.currentCandidateHash);
    SetAdd(responseHashes, row.responseLifecycleHeadHash);
    const lifecycle = source.responseLifecycleSource;
    for (let responseIndex = 0; responseIndex < lifecycle.responses.length;
      responseIndex += 1) {
      const nonce = lifecycle.responses[responseIndex].responseNonceHash;
      if (SetHas(responseNonces, nonce)) fail("RESPONSE_NONCE_REUSED_IN_NETWORK");
      SetAdd(responseNonces, nonce);
    }
    for (let occurrenceIndex = 0;
      occurrenceIndex < lifecycle.occurrences.length; occurrenceIndex += 1) {
      const nonce = lifecycle.occurrences[occurrenceIndex].occurrenceNonceHash;
      if (SetHas(occurrenceNonces, nonce)) {
        fail("RESPONSE_OCCURRENCE_NONCE_REUSED_IN_NETWORK");
      }
      SetAdd(occurrenceNonces, nonce);
    }
    if (row.externalCapacityBundleSupplied) {
      const streamKey = `${row.externalSourceSystemIdPrivate}:${
        row.externalLifecycleStreamIdPrivate}`;
      if (SetHas(externalStreams, streamKey)) {
        fail("EXTERNAL_LIFECYCLE_STREAM_REUSED_IN_NETWORK");
      }
      SetAdd(externalStreams, streamKey);
    }
    totalResponseOccurrences += row.responseOccurrenceCount;
    totalExternalOccurrences += row.externalLifecycleOccurrenceCount;
    totalExternalSourceBytes += row.exactExternalSourceByteCount;
    append(selectedRows, row);
  }
  ArraySort(selectedRows,
    (left, right) => left.requirementKey < right.requirementKey
      ? -1 : left.requirementKey > right.requirementKey ? 1 : 0);

  const coverage = requirementCoverage(input.routeDiscoveryReplay.record,
    selectedByRequirement, observedAt, formationDeadlineReached);
  const foundationOneUse = assessFoundationOneUse(
    input.foundationBoundEvaluationReplay, selectedByRequirement, tender,
    observedAt);
  const referenceFormationIncomplete = coverage.mandatoryRouteGapCount > 0
    || coverage.mandatoryResponseGapCount > 0
    || coverage.mandatoryExternalContradictionCount > 0
    || !foundationOneUse.outcomeLevelReferenceCrossBindingSatisfied;
  /* This v1 cannot satisfy the atomic promise gate because independent owner
     trust, actual capacity, durable authority, transaction legality, and
     external zero-ops are deliberately unresolved. At the deadline it must
     therefore decline even if every reference and source declaration exists. */
  const atomicPromiseGateSatisfied = false;
  const mustDecline = formationDeadlineReached
    && !atomicPromiseGateSatisfied;
  const allExternalDeclarations = coverage
    .allMandatoryRequirementsHaveCurrentExternalSourceDeclarations;
  const strongestState = mustDecline
    ? OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES.declined
    : referenceFormationIncomplete
      ? OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES.forming
      : allExternalDeclarations
      ? OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES
        .sourceDeclarations
      : OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_STATES
        .callerDeclarations;
  const disposition = mustDecline ? "DECLINE_NOT_HUMAN_QUEUE"
    : "CONTINUE_AUTOMATED_FORMATION_HOLD";
  const selectedProjection = ArrayMap(selectedRows, (row) => ({
    requirementKind: row.requirementKind,
    requirementId: row.requirementId,
    requirementObjectHash: row.requirementObjectHash,
    routeObjectHash: row.routeObjectHash,
    currentCandidateHash: row.currentCandidateHash,
    responseLifecycleHeadHash: row.responseLifecycleHeadHash,
    externalCapacityVerificationHash: row.externalCapacityVerificationHash,
  }));
  const publicSelectedRows = ArrayMap(selectedRows, (row) => {
    const {
      requirementKey: internalRequirementKey,
      externalSourceSystemIdPrivate,
      externalLifecycleStreamIdPrivate,
      ...publicRow
    } = row;
    void internalRequirementKey;
    void externalSourceSystemIdPrivate;
    void externalLifecycleStreamIdPrivate;
    return publicRow;
  });
  const topologyBody = {
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
    selectedRouteResponseProjection: selectedProjection,
  };
  const body = {
    schema: OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_SCHEMAS.network,
    schemaVersion: "1.0.0",
    recordClass:
      "PER_TENDER_EPHEMERAL_EXTERNAL_RESOURCE_REFERENCE_NETWORK_HOLD_ONLY",
    temporaryNetworkId: id,
    observedAt,
    invariantReplay: {
      northStarInvariantHash: northStar.northStarInvariantHash,
      exactSourceRebuiltAndPinned: true,
      oneTenderOneNetworkInvariantVerified: true,
      domainAgnosticCoreInvariantVerified: true,
      durableResponsibilityContinuityInvariantVerified: true,
      atomicAllGatesPromiseInvariantVerified: true,
      deadlineAutomaticDeclineInvariantVerified: true,
    },
    foundationReplay: {
      foundationBoundEvaluationHash: foundation.foundationBoundEvaluationHash,
      sourceRecordsReplayed: true,
      engineEvaluationRederived: true,
      allRequiredFormationFoundationsReplayed: false,
      externalTrustStillRequired: true,
    },
    discoveryReplay: {
      snapshotHash: discovery.snapshotHash,
      fanoutPlanHash: discovery.fanoutPlanHash,
      callerInputRederivedAndPinned: true,
      externalSourceReplayVerified: false,
      occurrenceCensusVerified: true,
      uniqueRouteObjectCount: discovery.uniqueRouteObjectCount,
      totalRouteOccurrenceCount: discovery.totalOccurrenceCount,
      discoveryDisposition: discovery.disposition,
    },
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
      currentAttemptHash: tender.typedGraph.attempt.attemptHash,
      exactTenderSharedByAllDependencySources: true,
    },
    networkTopology: {
      formationUnit: "ONE_TENDER_ONE_TEMPORARY_NETWORK",
      networkScopeHash: digest(
        "outsider/outcome-formation-temporary-resource-network-scope/v1",
        topologyBody),
      oneEpisodeScope: true,
      episodeScopeCount: 1,
      currentAttemptExactlyBound: true,
      responseOccurrenceDenominatorReduced: false,
      globalAttemptCensusCompletenessEstablished: false,
      networkPersistsAfterOrderClosure: false,
      networkDissolutionErasesEpisodeAttemptHistory: false,
      networkDissolutionErasesOpenObligations: false,
      evidenceChallengeRecoveryAndResponsibilityPersistUntilValidClosure: true,
      standingCapacityCreated: false,
      crossTenderReuseAllowed: false,
      providerIdentityOrGlobalScoreCreated: false,
      globalTenderToNetworkUniquenessEstablished: false,
      temporaryNetworkIdReplayProtectionEstablished: false,
    },
    selectedRouteResponses: publicSelectedRows,
    requirementCoverage: coverage.rows,
    coverageSummary: {
      mandatoryRequirementCount: coverage.mandatoryRequirementCount,
      selectedRouteResponseCount: selectedRows.length,
      mandatoryRouteGapCount: coverage.mandatoryRouteGapCount,
      mandatoryResponseGapCount: coverage.mandatoryResponseGapCount,
      mandatoryExternalDeclarationCount:
        coverage.mandatoryExternalDeclarationCount,
      mandatoryExternalContradictionCount:
        coverage.mandatoryExternalContradictionCount,
      allMandatoryRequirementsHaveCurrentRouteReferences:
        coverage.allMandatoryRequirementsHaveCurrentRouteReferences,
      allMandatoryRequirementsHaveCurrentCallerDeclaredOneUseResponses:
        coverage.allMandatoryRequirementsHaveCurrentCallerDeclaredOneUseResponses,
      allMandatoryRequirementsHaveCurrentExternalSourceDeclarations:
        coverage.allMandatoryRequirementsHaveCurrentExternalSourceDeclarations,
      totalResponseOccurrenceCount: totalResponseOccurrences,
      totalExternalLifecycleOccurrenceCount: totalExternalOccurrences,
      totalExactExternalSourceByteCount: totalExternalSourceBytes,
      aggregateExternalSourceByteCountPreflight,
      aggregateExternalSourceByteCountMatchedVerifiedBundles:
        aggregateExternalSourceByteCountPreflight === totalExternalSourceBytes,
      maximumAggregateExternalSourceBytes:
        OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_LIMITS
          .maximumAggregateExternalSourceBytes,
      responseAndExternalOccurrenceDenominatorsPreservedWithinSuppliedSources:
        true,
      responseOccurrenceDenominatorExternallyAnchored: false,
      responseCompletenessBeyondCallerPinEstablished: false,
      externalSourceNonEquivocationEstablished: false,
      externalSourceCompletenessBeyondPinnedHeadEstablished: false,
      nonceUniquenessWithinThisNetworkSourceVerified: true,
      nonceGlobalFreshnessEstablished: false,
      nonceConsumptionPersisted: false,
      occurrenceMultiplicityUsedAsProviderIdentityOrScore: false,
      independentEvidenceOrganizationalStandingEstablished: false,
      alternateRecoveryIndependenceEstablished: false,
      providerReferenceEqualityOrInequalityUsedToInferIndependence: false,
    },
    foundationOneUseCrossBinding: foundationOneUse,
    formationDeadline: {
      deadline: tender.formationDeadline,
      reached: formationDeadlineReached,
      beforeDeadlineDisposition: formationDeadlineReached ? null
        : "CONTINUE_AUTOMATED_FORMATION",
      atDeadlineDisposition: formationDeadlineReached
        ? "DECLINE_NOT_HUMAN_QUEUE" : null,
      manualOverridePermitted: false,
    },
    atomicCommitmentGate: {
      formationMode: "ATOMIC_ALL_REQUIRED_GATES",
      explicitResourceOwnerAuthorityEstablished: false,
      everyMandatoryPrimaryResourceCapacityEstablished: false,
      everyMandatoryRecoveryResourceCapacityEstablished: false,
      everyMandatoryIndependentEvidenceResourceCapacityEstablished: false,
      maximumConsequenceAndLiabilityEnvelopeEstablished: false,
      promisedFinancialRemedyFundingCapacityEstablished: false,
      lawfulTransactionPathEstablished: false,
      externalRouteZeroInternalOpsEstablished: false,
      allRequiredGatesSatisfied: false,
      referenceFormationIncomplete,
      partialPromisePermitted: false,
      manualOverridePermitted: false,
      userOutcomePromiseIssued: false,
    },
    durableResponsibilityContinuity: {
      northStarPersistenceInvariantSourceReplayed: true,
      networkDissolutionErasesEpisodeAttemptHistory: false,
      networkDissolutionErasesOpenObligations: false,
      evidenceChallengeRecoveryAndResponsibilityPersistUntilValidClosure: true,
      durableObligationSemanticStateSourceReplayed: false,
      independentOutcomeTruthEstablished: false,
      validObligationClosureEstablished: false,
    },
    zeroInternalOpsBoundary: {
      thisPureModuleStaffInterventionCount: 0,
      staffTouchLedgerSourceReplayed: false,
      anyOutsiderStaffTouchIsFormationFailure: true,
      staffTouchFailureMustBeRecordedAgainstTender: true,
      externalRouteZeroInternalOpsEstablished: false,
      internalHumanFallbackPermitted: false,
      humanQueueCreated: false,
      declineInsteadOfHumanQueue: mustDecline,
      networkIoPerformed: false,
      providerContactPerformed: false,
      tenderSent: false,
      postFulfillmentStandingInvitationPerformed: false,
      invitationAloneCreatesStandingCapacity: false,
    },
    externalTrustBoundary: {
      discoveredReferencesAreCapacity: false,
      callerDeclaredResponsesAreAuthenticatedExternalResponses: false,
      signedSourceBundlesMintResourceOwnerStanding: false,
      independentResourceOwnerTrustRegistryReplayed: false,
      externalCapacityEstablished: false,
      capacityReserved: false,
      legalIdentityEstablished: false,
      providerAuthorityEstablished: false,
      independentEvidenceOrganizationalStandingEstablished: false,
      alternateRecoveryIndependenceEstablished: false,
      rightsPrivacySourceReplayEstablished: false,
      rawExternalSourceSystemIdentifierProjected: false,
      rawExternalLifecycleStreamIdentifierProjected: false,
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
      authority: "NONE",
      actionReady: false,
      executable: false,
    },
    economicBoundary: {
      price: null,
      priceEstablished: false,
      pricingPermitted: false,
      guarantee: null,
      guaranteeCreated: false,
      settlement: null,
      settlementPermitted: false,
      custodyEstablished: false,
      moneyMovementEnabled: false,
    },
    gapCodes: gaps(coverage, foundationOneUse, formationDeadlineReached),
    disposition,
    strongestState,
    result: strongestState,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    price: null,
    guarantee: null,
    settlement: null,
    boundary: OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, temporaryNetworkHash: digest(
    OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_SCHEMAS.network, body) });
}

function verificationFailure(error) {
  let message = `${PREFIX}UNTRUSTED_FAILURE`;
  try {
    if (error instanceof ErrorConstructor && typeof error.message === "string"
      && RegExpTest(
        /^OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_[A-Z0-9_]+$/u,
        error.message)) message = error.message;
  } catch { message = `${PREFIX}UNTRUSTED_FAILURE`; }
  return deepFreeze({
    schema:
      OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_SCHEMAS.verification,
    ok: false,
    allDependencySourcesRebuiltAndPinned: false,
    exactTenderGraphEpisodeAttemptCrossBindingVerified: false,
    mandatoryRouteAndResponseCoverageVerified: false,
    responseAndExternalOccurrenceDenominatorsPreservedWithinSuppliedSources:
      false,
    responseOccurrenceDenominatorExternallyAnchored: false,
    externalSourceNonEquivocationEstablished: false,
    externalSourceCompletenessBeyondPinnedHeadEstablished: false,
    nonceGlobalFreshnessEstablished: false,
    nonceConsumptionPersisted: false,
    independentResourceOwnerTrustRegistryReplayed: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    externalRouteZeroInternalOpsEstablished: false,
    authorityEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    consequenceReach: "NONE",
    price: null,
    guarantee: null,
    settlement: null,
    error: message,
    boundary: OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_BOUNDARY,
  });
}

/** Verify only by rebuilding the entire network from all full dependency sources. */
export function verifyOutcomeFormationTemporaryNetworkV1(record, options = {}) {
  try {
    exactObject(options, ["source", "expectedTemporaryNetworkHash"],
      "VERIFY_OPTIONS");
    const expectedHash = hash(options.expectedTemporaryNetworkHash,
      "EXPECTED_TEMPORARY_NETWORK_HASH");
    const rebuilt = createOutcomeFormationTemporaryNetworkV1(options.source);
    if (!same(record, rebuilt)) fail("SOURCE_REBUILD_MISMATCH");
    if (rebuilt.temporaryNetworkHash !== expectedHash) {
      fail("EXPECTED_TEMPORARY_NETWORK_HASH_MISMATCH");
    }
    return deepFreeze({
      schema:
        OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_SCHEMAS.verification,
      ok: true,
      allDependencySourcesRebuiltAndPinned: true,
      exactTenderGraphEpisodeAttemptCrossBindingVerified: true,
      mandatoryRouteAndResponseCoverageVerified:
        rebuilt.coverageSummary.mandatoryRouteGapCount === 0
          && rebuilt.coverageSummary.mandatoryResponseGapCount === 0,
      responseAndExternalOccurrenceDenominatorsPreservedWithinSuppliedSources:
        true,
      responseOccurrenceDenominatorExternallyAnchored: false,
      externalSourceNonEquivocationEstablished: false,
      externalSourceCompletenessBeyondPinnedHeadEstablished: false,
      nonceGlobalFreshnessEstablished: false,
      nonceConsumptionPersisted: false,
      northStarInvariantHash: rebuilt.invariantReplay.northStarInvariantHash,
      foundationBoundEvaluationHash:
        rebuilt.foundationReplay.foundationBoundEvaluationHash,
      discoverySnapshotHash: rebuilt.discoveryReplay.snapshotHash,
      temporaryNetworkHash: rebuilt.temporaryNetworkHash,
      disposition: rebuilt.disposition,
      strongestState: rebuilt.strongestState,
      independentResourceOwnerTrustRegistryReplayed: false,
      externalCapacityEstablished: false,
      capacityReserved: false,
      externalRouteZeroInternalOpsEstablished: false,
      authorityEstablished: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      consequenceReach: "NONE",
      price: null,
      guarantee: null,
      settlement: null,
      error: null,
      boundary: OUTSIDER_OUTCOME_FORMATION_TEMPORARY_NETWORK_V1_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}

export const createTemporaryOutcomeNetworkV1
  = createOutcomeFormationTemporaryNetworkV1;
export const verifyTemporaryOutcomeNetworkV1
  = verifyOutcomeFormationTemporaryNetworkV1;
