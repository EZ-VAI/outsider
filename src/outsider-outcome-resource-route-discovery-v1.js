/*
 * Outcome Formation Engine: transaction-surface route discovery v1.
 *
 * A discovered route is only an opaque, requirement-scoped reference to a
 * transaction surface that already exists outside Outsider.  It is not a
 * provider enrollment, identity claim, contact target, authorization,
 * capacity reservation, quote, or permission to perform network I/O.  This
 * module is pure and deterministic: it performs no scraping, login, contact,
 * filesystem access, network access, secret handling, ranking, or action.
 *
 * Repeated observations are retained as occurrences while semantically equal
 * requirement-scoped routes are deduplicated by routeObjectHash.  Lifecycle
 * descendants are append-only and must bind an exact in-snapshot predecessor.
 * Missing mandatory route coverage declines rather than creating a human
 * operations queue.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOutsiderOutcomeTenderV1 } from "./outsider-outcome-tender-v1.js";

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const MapConstructor = Map;
const MapPrototype = Map.prototype;
const MapGet = Function.prototype.call.bind(MapPrototype.get);
const MapHas = Function.prototype.call.bind(MapPrototype.has);
const MapSet = Function.prototype.call.bind(MapPrototype.set);
const MapEntries = Function.prototype.call.bind(MapPrototype.entries);
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const MapIteratorPrototype = ObjectGetPrototypeOf(new MapConstructor().entries());
const MapIteratorNext = Function.prototype.call.bind(MapIteratorPrototype.next);
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const TypeErrorConstructor = TypeError;
const HashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);

const PREFIX = "OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const OCCURRENCE_ID = /^routeocc_[a-f0-9]{32}$/u;
const REQUIREMENT_ID = /^(?:resource|evidence|recovery)_[a-f0-9]{32}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;

export const OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS
  = ObjectFreeze({
    routeObject: "outsider/outcome-formation-requirement-scoped-route-object/v1",
    routeOccurrence:
      "outsider/outcome-formation-transaction-surface-route-occurrence/v1",
    routeCandidate:
      "outsider/outcome-formation-transaction-surface-route-candidate/v1",
    routeCandidateVerification:
      "outsider/outcome-formation-route-candidate-verification/v1",
    discoverySnapshot:
      "outsider/outcome-formation-route-discovery-snapshot/v1",
    discoverySnapshotVerification:
      "outsider/outcome-formation-route-discovery-snapshot-verification/v1",
    fanoutPlan:
      "outsider/outcome-formation-zero-human-reference-fanout-plan/v1",
  });

export const OUTSIDER_OUTCOME_RESOURCE_ROUTE_KINDS = ObjectFreeze([
  "USER_HELD_ACCOUNT",
  "OFFICIAL_API",
  "APPROVED_MCP",
  "MARKETPLACE_BUYER_ENTRY",
  "PROVIDER_OWNED_PUBLIC_ENTRY",
  "STANDING_CAPACITY_GRANT",
]);

export const OUTSIDER_OUTCOME_RESOURCE_REQUIREMENT_KINDS = ObjectFreeze([
  "RESOURCE", "EVIDENCE", "RECOVERY",
]);

export const OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_LIMITS
  = ObjectFreeze({
    maximumCandidateOccurrences: 512,
    maximumOccurrencesPerRouteObject: 64,
    maximumLifecycleRevision: 1_000_000,
    maximumTtlMs: 24 * 60 * 60 * 1_000,
  });

export const OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_BOUNDARY = deepFreeze({
  position:
    "ZERO_INTERNAL_OPS_EXISTING_TRANSACTION_SURFACE_REFERENCE_DISCOVERY_ONLY",
  providerMarketplaceCreated: false,
  providerEnrollmentPerformed: false,
  transactionSurfacesReferencedOnly: true,
  supportedRouteKinds: OUTSIDER_OUTCOME_RESOURCE_ROUTE_KINDS,
  exactTenderRecordRederivationRequired: true,
  typedGraphAndRequirementCrossBindingRequired: true,
  occurrenceCensusSeparateFromObjectDedup: true,
  appendOnlyLifecycleLinksRequired: true,
  ttlEnforced: true,
  revocationEnforced: true,
  supersessionEnforced: true,
  sourceReferencesOpaqueExactHashesOnly: true,
  opaqueReferencePreimagePrivacyVerified: false,
  opaqueReferencesRequireDomainSeparatedHighEntropyPreimages: true,
  sourceObjectsReplayedByThisModule: false,
  sourceReviewReferencesReplayPerformed: false,
  rightsEstablished: false,
  privacyEstablished: false,
  resourceOwnerAuthorityEstablished: false,
  routeReferenceIsContactability: false,
  routeReferenceIsAuthorization: false,
  routeReferenceIsCapacity: false,
  providerIdentityIncluded: false,
  providerContactTargetIncluded: false,
  urlsIncluded: false,
  localPathsIncluded: false,
  freeFormTextIncluded: false,
  piiIncluded: false,
  secretsIncluded: false,
  credentialsIncluded: false,
  loginPerformed: false,
  scrapingPerformed: false,
  filesystemIoPerformed: false,
  networkIoPerformed: false,
  providerContactPerformed: false,
  tenderSent: false,
  quoteRequested: false,
  capacityReserved: false,
  identityInferencePerformed: false,
  ipIdentityUsed: false,
  deviceIdentityUsed: false,
  baseModelIdentityUsed: false,
  globalScoreCreatedOrUsed: false,
  routeSelectionUsesScore: false,
  routeSelectionBasis:
    "EXACT_REQUIREMENT_SCOPE_CURRENT_REFERENCE_THEN_ROUTE_KIND_AND_HASH",
  outsiderStaffInterventionsAllowed: 0,
  internalHumanFallbackPermitted: false,
  externalRouteZeroInternalOpsEstablished: false,
  unavailableDisposition: "DECLINE_NOT_HUMAN_QUEUE",
  structuralConformanceMintsAuthority: false,
  vendorClaimsAcceptedAsAuthority: false,
  serverAcknowledgmentsAcceptedAsIndependentOutcomeTruth: false,
  decision: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
  enabledCapabilities: 0,
  provenAuthorities: 0,
  enabledCapabilitiesSubsetOfProvenAuthority: true,
  consequenceReach: "NONE",
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
});

const SOURCE_REFERENCE_FIELDS = ObjectFreeze([
  "transactionSurfaceRefHash",
  "sourceArtifactHash",
  "sourceRevisionHash",
  "sourceRecordHash",
  "sourceReplayReceiptHash",
  "rightsReviewRefHash",
  "privacyReviewRefHash",
  "resourceOwnerAuthorityRefHash",
  "contactabilityEvidenceRefHash",
  "capacityEvidenceRefHash",
  "providerPatternProjectionHash",
  "networkIntakeManifestHash",
  "networkNodeConformanceHash",
  "federatedHandoffHash",
  "standingCapacityGrantHash",
]);

const CANDIDATE_SOURCE_FIELDS = ObjectFreeze([
  "occurrenceId", "requirementKind", "requirementId", "routeKind",
  "observedAt", "validUntil", "sourceReference", "lifecycle",
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

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)) {
    return value;
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value);
    }
  }
  return ObjectFreeze(value);
}

function rejectTree(value, seen = new SetConstructor(), depth = 0,
  budget = { nodes: 0, keys: 0 }) {
  if (value === null || typeof value !== "object") return;
  if (depth > 160) fail("VALUE_TOO_DEEP");
  budget.nodes += 1;
  if (budget.nodes > 100_000) fail("VALUE_TREE_NODE_BUDGET_EXCEEDED");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  budget.keys += keys.length;
  if (budget.keys > 500_000) fail("VALUE_TREE_KEY_BUDGET_EXCEEDED");
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) fail("ACCESSOR_FORBIDDEN");
    rejectTree(descriptor.value, seen, depth + 1, budget);
  }
  SetDelete(seen, value);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, fields[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  canonicalizeStrict(value);
  return value;
}

function denseArray(value, code, maximum) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
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
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function oneOf(value, values, code) {
  for (let index = 0; index < values.length; index += 1) {
    if (value === values[index]) return value;
  }
  fail(`${code}_INVALID`);
}

function iso(value, code) {
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)
    || !NumberIsFinite(DateParse(value))
    || DateToISOString(new DateConstructor(value)) !== value) fail(`${code}_INVALID`);
  return value;
}

function safeInteger(value, minimum, maximum, code) {
  if (!NumberIsSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function verifiedTender(tender) {
  const descriptor = tender === null || typeof tender !== "object"
    ? null : ObjectGetOwnPropertyDescriptor(tender, "tenderHash");
  if (!descriptor || !ObjectHasOwn(descriptor, "value")) fail("TENDER_HASH_REQUIRED");
  const verification = verifyOutsiderOutcomeTenderV1(tender, {
    expectedTenderHash: descriptor.value,
  });
  if (verification.ok !== true) fail("TENDER_SOURCE_REPLAY_FAILED");
  return tender;
}

function requirementBinding(tender, kind, id) {
  oneOf(kind, OUTSIDER_OUTCOME_RESOURCE_REQUIREMENT_KINDS, "REQUIREMENT_KIND");
  if (typeof id !== "string" || !RegExpTest(REQUIREMENT_ID, id)) {
    fail("REQUIREMENT_ID_INVALID");
  }
  let rows;
  let setHash;
  if (kind === "RESOURCE") {
    rows = tender.resourceRequirements.items;
    setHash = tender.resourceRequirements.requirementSetHash;
  } else if (kind === "EVIDENCE") {
    rows = tender.evidenceRequirements.items;
    setHash = tender.evidenceRequirements.requirementSetHash;
  } else {
    rows = tender.recoveryRequirements.items;
    setHash = tender.recoveryRequirements.requirementSetHash;
  }
  let selected = null;
  let matches = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const rowId = kind === "RESOURCE" ? rows[index].resourceRequirementId
      : kind === "EVIDENCE" ? rows[index].evidenceRequirementId
        : rows[index].recoveryRequirementId;
    if (rowId === id) {
      selected = rows[index];
      matches += 1;
    }
  }
  if (matches !== 1) fail("REQUIREMENT_NOT_EXACTLY_PRESENT_IN_TENDER");
  const classCode = kind === "RESOURCE" ? selected.resourceClassCode
    : kind === "EVIDENCE" ? selected.evidenceClassCode
      : selected.resourceClassCode;
  const scopeRefHash = kind === "RESOURCE" ? selected.capabilityRefHash
    : kind === "EVIDENCE" ? selected.evidenceRequirementRefHash
      : selected.recoveryOutcomeRefHash;
  const dueBy = kind === "RESOURCE" ? selected.requiredBy
    : kind === "EVIDENCE" ? selected.dueBy : selected.completionDeadline;
  return {
    requirementKind: kind,
    requirementId: id,
    requirementClassCode: classCode,
    requirementScopeRefHash: scopeRefHash,
    requirementSetHash: setHash,
    requirementObjectHash: digest(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: tender.tenderHash, requirementKind: kind,
        requirementSetHash: setHash, requirement: selected,
      }),
    dueBy,
    mandatory: selected.mandatory,
  };
}

function allRequirementBindings(tender) {
  const rows = [];
  for (let index = 0; index < tender.resourceRequirements.items.length; index += 1) {
    append(rows, requirementBinding(tender, "RESOURCE",
      tender.resourceRequirements.items[index].resourceRequirementId));
  }
  for (let index = 0; index < tender.evidenceRequirements.items.length; index += 1) {
    append(rows, requirementBinding(tender, "EVIDENCE",
      tender.evidenceRequirements.items[index].evidenceRequirementId));
  }
  for (let index = 0; index < tender.recoveryRequirements.items.length; index += 1) {
    append(rows, requirementBinding(tender, "RECOVERY",
      tender.recoveryRequirements.items[index].recoveryRequirementId));
  }
  ArraySort(rows, (left, right) => {
    const leftKey = `${left.requirementKind}:${left.requirementId}`;
    const rightKey = `${right.requirementKind}:${right.requirementId}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  return rows;
}

function normalizeSourceReference(value, routeKind) {
  exactObject(value, SOURCE_REFERENCE_FIELDS, "SOURCE_REFERENCE");
  const normalized = {
    transactionSurfaceRefHash: hash(value.transactionSurfaceRefHash,
      "TRANSACTION_SURFACE_REF_HASH"),
    sourceArtifactHash: hash(value.sourceArtifactHash, "SOURCE_ARTIFACT_HASH"),
    sourceRevisionHash: hash(value.sourceRevisionHash, "SOURCE_REVISION_HASH"),
    sourceRecordHash: hash(value.sourceRecordHash, "SOURCE_RECORD_HASH"),
    sourceReplayReceiptHash: nullableHash(value.sourceReplayReceiptHash,
      "SOURCE_REPLAY_RECEIPT_HASH"),
    rightsReviewRefHash: nullableHash(value.rightsReviewRefHash,
      "RIGHTS_REVIEW_REF_HASH"),
    privacyReviewRefHash: nullableHash(value.privacyReviewRefHash,
      "PRIVACY_REVIEW_REF_HASH"),
    resourceOwnerAuthorityRefHash: nullableHash(value.resourceOwnerAuthorityRefHash,
      "RESOURCE_OWNER_AUTHORITY_REF_HASH"),
    contactabilityEvidenceRefHash: nullableHash(value.contactabilityEvidenceRefHash,
      "CONTACTABILITY_EVIDENCE_REF_HASH"),
    capacityEvidenceRefHash: nullableHash(value.capacityEvidenceRefHash,
      "CAPACITY_EVIDENCE_REF_HASH"),
    providerPatternProjectionHash: nullableHash(value.providerPatternProjectionHash,
      "PROVIDER_PATTERN_PROJECTION_HASH"),
    networkIntakeManifestHash: nullableHash(value.networkIntakeManifestHash,
      "NETWORK_INTAKE_MANIFEST_HASH"),
    networkNodeConformanceHash: nullableHash(value.networkNodeConformanceHash,
      "NETWORK_NODE_CONFORMANCE_HASH"),
    federatedHandoffHash: nullableHash(value.federatedHandoffHash,
      "FEDERATED_HANDOFF_HASH"),
    standingCapacityGrantHash: nullableHash(value.standingCapacityGrantHash,
      "STANDING_CAPACITY_GRANT_HASH"),
  };
  if (routeKind === "STANDING_CAPACITY_GRANT"
    && normalized.standingCapacityGrantHash === null) {
    fail("STANDING_CAPACITY_GRANT_REFERENCE_REQUIRED");
  }
  return normalized;
}

function normalizeLifecycle(value, observedAt, validUntil) {
  exactObject(value, ["revision", "predecessorCandidateHash",
    "supersedesCandidateHash", "revokedAt", "revocationRefHash"], "LIFECYCLE");
  const revision = safeInteger(value.revision, 0,
    OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_LIMITS.maximumLifecycleRevision,
    "LIFECYCLE_REVISION");
  const predecessorCandidateHash = nullableHash(value.predecessorCandidateHash,
    "PREDECESSOR_CANDIDATE_HASH");
  const supersedesCandidateHash = nullableHash(value.supersedesCandidateHash,
    "SUPERSEDES_CANDIDATE_HASH");
  if (revision === 0 && (predecessorCandidateHash !== null
    || supersedesCandidateHash !== null)) fail("GENESIS_LIFECYCLE_LINKS_MUST_BE_NULL");
  if (revision > 0 && (predecessorCandidateHash === null
    || predecessorCandidateHash !== supersedesCandidateHash)) {
    fail("DESCENDANT_EXACT_PREDECESSOR_AND_SUPERSESSION_REQUIRED");
  }
  const revokedAt = value.revokedAt === null ? null : iso(value.revokedAt, "REVOKED_AT");
  const revocationRefHash = nullableHash(value.revocationRefHash,
    "REVOCATION_REF_HASH");
  if ((revokedAt === null) !== (revocationRefHash === null)) {
    fail("REVOCATION_TIME_AND_REFERENCE_MUST_COINCIDE");
  }
  if (revokedAt !== null && (DateParse(revokedAt) < DateParse(observedAt)
    || DateParse(revokedAt) > DateParse(validUntil))) {
    fail("REVOCATION_OUTSIDE_OCCURRENCE_WINDOW");
  }
  return { revision, predecessorCandidateHash, supersedesCandidateHash,
    revokedAt, revocationRefHash };
}

function routeCandidateBody(tender, source) {
  exactObject(source, CANDIDATE_SOURCE_FIELDS, "CANDIDATE_SOURCE");
  const routeKind = oneOf(source.routeKind, OUTSIDER_OUTCOME_RESOURCE_ROUTE_KINDS,
    "ROUTE_KIND");
  if (typeof source.occurrenceId !== "string"
    || !RegExpTest(OCCURRENCE_ID, source.occurrenceId)) fail("OCCURRENCE_ID_INVALID");
  const observedAt = iso(source.observedAt, "OBSERVED_AT");
  const validUntil = iso(source.validUntil, "VALID_UNTIL");
  const observedAtMs = DateParse(observedAt);
  const validUntilMs = DateParse(validUntil);
  if (observedAtMs < DateParse(tender.compiledAt)
    || observedAtMs >= DateParse(tender.formationDeadline)) {
    fail("OBSERVATION_OUTSIDE_TENDER_FORMATION_WINDOW");
  }
  if (validUntilMs <= observedAtMs
    || validUntilMs > DateParse(tender.formationDeadline)
    || validUntilMs - observedAtMs
      > OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_LIMITS.maximumTtlMs) {
    fail("TTL_OUTSIDE_TENDER_FORMATION_WINDOW");
  }
  const requirement = requirementBinding(tender, source.requirementKind,
    source.requirementId);
  const sourceReference = normalizeSourceReference(source.sourceReference, routeKind);
  const lifecycle = normalizeLifecycle(source.lifecycle, observedAt, validUntil);
  const routeObjectBody = {
    schema: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS.routeObject,
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    requirementKind: requirement.requirementKind,
    requirementId: requirement.requirementId,
    requirementObjectHash: requirement.requirementObjectHash,
    routeKind,
    transactionSurfaceRefHash: sourceReference.transactionSurfaceRefHash,
    objectIdentitySemantics:
      "EXACT_TENDER_REQUIREMENT_SCOPED_TRANSACTION_SURFACE_NOT_PROVIDER_IDENTITY",
  };
  const routeObject = {
    ...routeObjectBody,
    routeObjectHash: digest(
      OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS.routeObject,
      routeObjectBody),
  };
  const occurrenceBody = {
    schema: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS.routeOccurrence,
    occurrenceId: source.occurrenceId,
    routeObjectHash: routeObject.routeObjectHash,
    observedAt,
    validUntil,
    ttlMs: validUntilMs - observedAtMs,
    sourceArtifactHash: sourceReference.sourceArtifactHash,
    sourceRevisionHash: sourceReference.sourceRevisionHash,
    sourceRecordHash: sourceReference.sourceRecordHash,
    occurrenceSemantics: "OBSERVATION_CENSUS_EVENT_NOT_DISTINCT_PROVIDER_ASSERTION",
  };
  const routeOccurrence = {
    ...occurrenceBody,
    occurrenceHash: digest(
      OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS.routeOccurrence,
      occurrenceBody),
  };
  return {
    schema: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS.routeCandidate,
    schemaVersion: "1.0.0",
    candidateClass: "DISCOVERED_TRANSACTION_SURFACE_REFERENCE_HOLD_ONLY",
    tenderBinding: {
      tenderHash: tender.tenderHash,
      workOrderHash: tender.workOrderHash,
      typedGraphHash: tender.typedGraph.typedGraphHash,
      episodeHash: tender.typedGraph.episode.episodeHash,
      attemptHash: tender.typedGraph.attempt.attemptHash,
      tenderRecordRederived: true,
      exactRequirementCrossBinding: true,
    },
    requirementBinding: requirement,
    routeKind,
    routeObject,
    routeOccurrence,
    sourceReference: {
      ...sourceReference,
      referenceSemantics:
        "OPAQUE_EXACT_EXTERNAL_SOURCE_RECORD_REFERENCE_NOT_REPLAYED_OBJECT",
      sourceObjectReplayed: false,
      referencePresenceEstablishesRights: false,
      referencePresenceEstablishesPrivacy: false,
      referencePresenceEstablishesOwnerAuthority: false,
      referencePresenceEstablishesContactability: false,
      referencePresenceEstablishesCapacity: false,
      opaqueReferencePreimagePrivacyVerified: false,
      opaqueReferencesRequireDomainSeparatedHighEntropyPreimages: true,
    },
    lifecycle: {
      ...lifecycle,
      appendOnlyDescendantRequired: lifecycle.revision > 0,
      exactPredecessorValidatedOnlyWithinSnapshot: false,
      lifecycleExternalHeadReplayed: false,
    },
    discoveryState: {
      state: "DISCOVERED_REFERENCE",
      referenceDiscovered: true,
      referenceObservationCallerSupplied: true,
      objectDedupKeyCreated: true,
      sourceReplayState: "OPAQUE_REFERENCE_ONLY_UNVERIFIED",
      rightsState: "UNRESOLVED",
      privacyState: "UNRESOLVED",
      resourceOwnerAuthorityState: "UNRESOLVED",
      contactabilityState: "UNVERIFIED",
      authorizationState: "UNVERIFIED",
      capacityState: "UNVERIFIED",
      sendable: false,
      contactable: false,
      authorized: false,
      capacityAvailable: false,
    },
    identityBoundary: {
      providerIdentityCreated: false,
      occurrencesLinkedAsSameProvider: false,
      ipDeviceOrModelIdentityUsed: false,
      globalScoreCreatedOrUsed: false,
    },
    decision: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    boundary: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_BOUNDARY,
  };
}

/** Build one immutable, requirement-scoped discovery occurrence. */
export function createOutcomeResourceRouteCandidateV1(input = {}) {
  rejectTree(input);
  exactObject(input, ["tender", "candidateSource"], "CREATE_CANDIDATE_INPUT");
  const tender = verifiedTender(input.tender);
  const body = routeCandidateBody(tender, input.candidateSource);
  return deepFreeze({ ...body, candidateHash: digest(
    OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS.routeCandidate, body) });
}

function candidateVerificationFailure(error) {
  let message = `${PREFIX}UNTRUSTED_FAILURE`;
  try {
    if (error instanceof ErrorConstructor && typeof error.message === "string"
      && RegExpTest(/^OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_[A-Z0-9_]+$/u,
        error.message)) message = error.message;
  } catch { message = `${PREFIX}UNTRUSTED_FAILURE`; }
  return deepFreeze({
    schema: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS
      .routeCandidateVerification,
    ok: false,
    candidateRecordRederivedFromInput: false,
    externalSourceReplayVerified: false,
    exactTenderAndRequirementCrossBindingVerified: false,
    discoveredReferenceOnly: true,
    contactable: false,
    authorized: false,
    capacityAvailable: false,
    candidateHash: null,
    decision: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: message,
    boundary: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_BOUNDARY,
  });
}

/** Verify a candidate by rebuilding it from the complete caller-pinned source. */
export function verifyOutcomeResourceRouteCandidateV1(record, options = {}) {
  try {
    rejectTree(record);
    rejectTree(options);
    exactObject(options, ["source", "expectedCandidateHash"],
      "VERIFY_CANDIDATE_OPTIONS");
    const expected = createOutcomeResourceRouteCandidateV1(options.source);
    if (!same(record, expected)) fail("CANDIDATE_SOURCE_REBUILD_MISMATCH");
    if (expected.candidateHash !== hash(options.expectedCandidateHash,
      "EXPECTED_CANDIDATE_HASH")) fail("EXPECTED_CANDIDATE_HASH_MISMATCH");
    return deepFreeze({
      schema: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS
        .routeCandidateVerification,
      ok: true,
      candidateRecordRederivedFromInput: true,
      externalSourceReplayVerified: false,
      exactTenderAndRequirementCrossBindingVerified: true,
      discoveredReferenceOnly: true,
      contactable: false,
      authorized: false,
      capacityAvailable: false,
      candidateHash: expected.candidateHash,
      routeObjectHash: expected.routeObject.routeObjectHash,
      occurrenceHash: expected.routeOccurrence.occurrenceHash,
      decision: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      error: null,
      boundary: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_BOUNDARY,
    });
  } catch (error) {
    return candidateVerificationFailure(error);
  }
}

function validateCandidateSet(candidates, asOf) {
  const candidateHashes = new SetConstructor();
  const occurrenceIds = new SetConstructor();
  const byHash = new MapConstructor();
  const childByParent = new MapConstructor();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (SetHas(candidateHashes, candidate.candidateHash)) {
      fail("DUPLICATE_CANDIDATE_OCCURRENCE");
    }
    SetAdd(candidateHashes, candidate.candidateHash);
    if (SetHas(occurrenceIds, candidate.routeOccurrence.occurrenceId)) {
      fail("DUPLICATE_OCCURRENCE_ID");
    }
    SetAdd(occurrenceIds, candidate.routeOccurrence.occurrenceId);
    MapSet(byHash, candidate.candidateHash, candidate);
    if (DateParse(candidate.routeOccurrence.observedAt) > DateParse(asOf)) {
      fail("FUTURE_OBSERVATION_IN_SNAPSHOT");
    }
  }
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate.lifecycle.revision === 0) continue;
    const parentHash = candidate.lifecycle.predecessorCandidateHash;
    const parent = MapGet(byHash, parentHash);
    if (!parent) fail("LIFECYCLE_PREDECESSOR_NOT_IN_SNAPSHOT");
    if (parent.lifecycle.revokedAt !== null) {
      fail("REVOKED_ROUTE_CANNOT_BE_RESURRECTED_BY_DESCENDANT");
    }
    if (parent.routeObject.routeObjectHash !== candidate.routeObject.routeObjectHash
      || parent.lifecycle.revision + 1 !== candidate.lifecycle.revision
      || DateParse(parent.routeOccurrence.observedAt)
        > DateParse(candidate.routeOccurrence.observedAt)) {
      fail("LIFECYCLE_PREDECESSOR_SCOPE_OR_REVISION_SPLICE");
    }
    if (MapHas(childByParent, parentHash)) fail("LIFECYCLE_FORK_FORBIDDEN");
    MapSet(childByParent, parentHash, candidate.candidateHash);
  }
  return childByParent;
}

function currentStatus(candidate, asOf, childByParent) {
  const asOfMs = DateParse(asOf);
  if (candidate.lifecycle.revokedAt !== null
    && DateParse(candidate.lifecycle.revokedAt) <= asOfMs) return "REVOKED";
  if (asOfMs >= DateParse(candidate.routeOccurrence.validUntil)) return "EXPIRED";
  if (MapHas(childByParent, candidate.candidateHash)) return "SUPERSEDED";
  return "CURRENT_DISCOVERED_REFERENCE";
}

function buildRouteObjects(candidates, asOf, childByParent) {
  const groups = new MapConstructor();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const key = candidate.routeObject.routeObjectHash;
    if (!MapHas(groups, key)) MapSet(groups, key, []);
    append(MapGet(groups, key), candidate);
  }
  const result = [];
  const iterator = MapEntries(groups);
  for (let step = MapIteratorNext(iterator); step.done !== true;
    step = MapIteratorNext(iterator)) {
    const routeObjectHash = step.value[0];
    const rows = step.value[1];
    if (rows.length
      > OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_LIMITS
        .maximumOccurrencesPerRouteObject) fail("ROUTE_OBJECT_OCCURRENCE_LIMIT_EXCEEDED");
    ArraySort(rows, (left, right) => (
      left.candidateHash < right.candidateHash ? -1
        : left.candidateHash > right.candidateHash ? 1 : 0));
    const current = [];
    for (let index = 0; index < rows.length; index += 1) {
      if (currentStatus(rows[index], asOf, childByParent)
        === "CURRENT_DISCOVERED_REFERENCE") append(current, rows[index]);
    }
    ArraySort(current, (left, right) => (
      left.candidateHash < right.candidateHash ? -1
        : left.candidateHash > right.candidateHash ? 1 : 0));
    const occurrenceHashes = [];
    for (let index = 0; index < rows.length; index += 1) {
      append(occurrenceHashes, rows[index].routeOccurrence.occurrenceHash);
    }
    append(result, {
      routeObjectHash,
      requirementKind: rows[0].requirementBinding.requirementKind,
      requirementId: rows[0].requirementBinding.requirementId,
      requirementObjectHash: rows[0].requirementBinding.requirementObjectHash,
      routeKind: rows[0].routeKind,
      occurrenceCount: rows.length,
      occurrenceHashes,
      currentCandidateHash: current.length > 0 ? current[0].candidateHash : null,
      currentReferenceAvailable: current.length > 0,
      currentOccurrenceCount: current.length,
      currentRepresentativeSelection:
        "LEXICOGRAPHIC_CANDIDATE_HASH_NOT_SCORE_OR_PROVIDER_IDENTITY",
      objectIsProviderIdentity: false,
      occurrenceMultiplicityUsedForRanking: false,
    });
  }
  ArraySort(result, (left, right) => (
    left.routeObjectHash < right.routeObjectHash ? -1
      : left.routeObjectHash > right.routeObjectHash ? 1 : 0));
  return result;
}

function statusCensus(candidates, asOf, childByParent, routeObjects) {
  let current = 0;
  let expired = 0;
  let revoked = 0;
  let superseded = 0;
  for (let index = 0; index < candidates.length; index += 1) {
    const status = currentStatus(candidates[index], asOf, childByParent);
    if (status === "CURRENT_DISCOVERED_REFERENCE") current += 1;
    else if (status === "EXPIRED") expired += 1;
    else if (status === "REVOKED") revoked += 1;
    else superseded += 1;
  }
  return {
    totalOccurrenceCount: candidates.length,
    currentOccurrenceCount: current,
    expiredOccurrenceCount: expired,
    revokedOccurrenceCount: revoked,
    supersededOccurrenceCount: superseded,
    uniqueRouteObjectCount: routeObjects.length,
    repeatedObjectOccurrenceCount: candidates.length - routeObjects.length,
    occurrenceCensusPreserved: true,
    objectDedupPerformedSeparately: true,
    objectMultiplicityUsedAsProviderIdentity: false,
    objectMultiplicityUsedForRanking: false,
  };
}

function buildFanoutPlan(tender, requirementBindings, routeObjects) {
  const requirements = [];
  let unavailableMandatoryRequirementClassCount = 0;
  let optionalUnavailableCount = 0;
  for (let index = 0; index < requirementBindings.length; index += 1) {
    const requirement = requirementBindings[index];
    const available = [];
    for (let routeIndex = 0; routeIndex < routeObjects.length; routeIndex += 1) {
      const route = routeObjects[routeIndex];
      if (route.requirementObjectHash === requirement.requirementObjectHash
        && route.currentReferenceAvailable === true) append(available, route);
    }
    ArraySort(available, (left, right) => {
      const leftKey = `${left.routeKind}:${left.routeObjectHash}`;
      const rightKey = `${right.routeKind}:${right.routeObjectHash}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
    const routeKinds = [];
    const routeKindSet = new SetConstructor();
    for (let routeIndex = 0; routeIndex < available.length; routeIndex += 1) {
      if (!SetHas(routeKindSet, available[routeIndex].routeKind)) {
        SetAdd(routeKindSet, available[routeIndex].routeKind);
        append(routeKinds, available[routeIndex].routeKind);
      }
    }
    ArraySort(routeKinds);
    const availableReference = available.length > 0;
    if (!availableReference && requirement.mandatory === true) {
      unavailableMandatoryRequirementClassCount += 1;
    } else if (!availableReference) optionalUnavailableCount += 1;
    const currentRouteObjectHashes = [];
    const currentCandidateHashes = [];
    for (let routeIndex = 0; routeIndex < available.length; routeIndex += 1) {
      append(currentRouteObjectHashes, available[routeIndex].routeObjectHash);
      append(currentCandidateHashes, available[routeIndex].currentCandidateHash);
    }
    append(requirements, {
      requirementKind: requirement.requirementKind,
      requirementId: requirement.requirementId,
      requirementClassCode: requirement.requirementClassCode,
      requirementObjectHash: requirement.requirementObjectHash,
      mandatory: requirement.mandatory,
      currentRouteReferenceAvailable: availableReference,
      currentRouteObjectHashes,
      currentCandidateHashes,
      routeKindsPresent: routeKinds,
      selectionBasis:
        "EXACT_REQUIREMENT_SCOPE_CURRENT_REFERENCE_THEN_ROUTE_KIND_AND_HASH",
      scoreUsed: false,
      occurrenceCountUsedAsRank: false,
      contactabilityVerified: false,
      rightsAndPrivacyVerified: false,
      resourceOwnerAuthorityVerified: false,
      capacityVerified: false,
      tenderSendAuthorized: false,
    });
  }
  const declined = unavailableMandatoryRequirementClassCount > 0;
  let fanoutCandidateCount = 0;
  for (let index = 0; index < requirements.length; index += 1) {
    fanoutCandidateCount += requirements[index].currentCandidateHashes.length;
  }
  const body = {
    schema: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS.fanoutPlan,
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    requirements,
    unavailableMandatoryRequirementClassCount,
    optionalUnavailableCount,
    allMandatoryRequirementClassesHaveCurrentRouteReference: !declined,
    fanoutMode: "ZERO_INTERNAL_HUMAN_REFERENCE_PLAN_ONLY",
    fanoutCandidateCount,
    thisPureModuleStaffInterventionCount: 0,
    externalRouteZeroInternalOpsEstablished: false,
    contactPerformed: false,
    tenderSent: false,
    disposition: declined ? "DECLINE_NOT_HUMAN_QUEUE"
      : "HOLD_FOR_EXTERNAL_RIGHTS_AUTHORITY_CONTACTABILITY_AND_CAPACITY_REPLAY",
    result: declined ? "MANDATORY_ROUTE_CLASS_UNAVAILABLE_DECLINE"
      : "CURRENT_DISCOVERED_REFERENCE_FANOUT_PLAN_HOLD",
    decision: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return { ...body, fanoutPlanHash: digest(
    OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS.fanoutPlan, body) };
}

/**
 * Build one caller-input-rederivable discovery snapshot and deterministic reference
 * fanout plan.  No route in the plan is sendable by this module.
 */
export function createOutcomeResourceRouteDiscoverySnapshotV1(input = {}) {
  rejectTree(input);
  exactObject(input, ["tender", "asOf", "candidateSources"],
    "CREATE_SNAPSHOT_INPUT");
  const tender = verifiedTender(input.tender);
  const asOf = iso(input.asOf, "SNAPSHOT_AS_OF");
  if (DateParse(asOf) < DateParse(tender.compiledAt)
    || DateParse(asOf) >= DateParse(tender.formationDeadline)) {
    fail("SNAPSHOT_AS_OF_OUTSIDE_FORMATION_WINDOW");
  }
  denseArray(input.candidateSources, "CANDIDATE_SOURCES",
    OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_LIMITS.maximumCandidateOccurrences);
  const candidates = new ArrayConstructor();
  for (let index = 0; index < input.candidateSources.length; index += 1) {
    append(candidates, createOutcomeResourceRouteCandidateV1({
      tender, candidateSource: input.candidateSources[index],
    }));
  }
  ArraySort(candidates, (left, right) => (
    left.candidateHash < right.candidateHash ? -1
      : left.candidateHash > right.candidateHash ? 1 : 0));
  const childByParent = validateCandidateSet(candidates, asOf);
  const routeObjects = buildRouteObjects(candidates, asOf, childByParent);
  const requirements = allRequirementBindings(tender);
  const fanoutPlan = buildFanoutPlan(tender, requirements, routeObjects);
  const census = statusCensus(candidates, asOf, childByParent, routeObjects);
  const declined = fanoutPlan.disposition === "DECLINE_NOT_HUMAN_QUEUE";
  const body = {
    schema: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS.discoverySnapshot,
    schemaVersion: "1.0.0",
    snapshotClass:
      "CALLER_INPUT_REDERIVED_TRANSACTION_SURFACE_REFERENCE_DISCOVERY_HOLD_ONLY",
    asOf,
    tenderBinding: {
      tenderHash: tender.tenderHash,
      workOrderHash: tender.workOrderHash,
      typedGraphHash: tender.typedGraph.typedGraphHash,
      episodeHash: tender.typedGraph.episode.episodeHash,
      attemptHash: tender.typedGraph.attempt.attemptHash,
      tenderRecordRederived: true,
      exactRequirementCrossBinding: true,
    },
    requirementBindings: requirements,
    candidateOccurrences: candidates,
    routeObjects,
    occurrenceCensus: census,
    inSnapshotLifecycle: {
      exactInSnapshotPredecessorsVerified: true,
      lifecycleForksRejected: true,
      expiredExcludedFromCurrent: true,
      revokedExcludedFromCurrent: true,
      supersededExcludedFromCurrent: true,
      externalLifecycleHeadReplayed: false,
    },
    fanoutPlan,
    discoveryBoundary: {
      callerPinnedInputRederivationRequiredForVerification: true,
      externalSourceReplayVerified: false,
      allCurrentRoutesRemainDiscoveredReferencesOnly: true,
      opaqueReferencePreimagePrivacyVerified: false,
      rightsAndPrivacyRemainUnresolved: true,
      resourceOwnerAuthorityRemainsUnresolved: true,
      contactabilityRemainsUnverified: true,
      capacityRemainsUnverified: true,
      contactPerformed: false,
      networkIoPerformed: false,
      thisPureModuleStaffInterventionCount: 0,
      externalRouteZeroInternalOpsEstablished: false,
      humanQueueCreated: false,
    },
    result: declined ? "MANDATORY_ROUTE_CLASS_UNAVAILABLE_DECLINE"
      : "CURRENT_DISCOVERED_REFERENCE_FANOUT_PLAN_HOLD",
    disposition: fanoutPlan.disposition,
    decision: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    boundary: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, snapshotHash: digest(
    OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS.discoverySnapshot, body) });
}

function snapshotVerificationFailure(error) {
  let message = `${PREFIX}UNTRUSTED_FAILURE`;
  try {
    if (error instanceof ErrorConstructor && typeof error.message === "string"
      && RegExpTest(/^OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_[A-Z0-9_]+$/u,
        error.message)) message = error.message;
  } catch { message = `${PREFIX}UNTRUSTED_FAILURE`; }
  return deepFreeze({
    schema: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS
      .discoverySnapshotVerification,
    ok: false,
    snapshotRecordRederivedFromInput: false,
    externalSourceReplayVerified: false,
    exactTenderAndRequirementCrossBindingVerified: false,
    occurrenceCensusVerified: false,
    objectDedupVerified: false,
    inSnapshotReferenceLifecycleReplayed: false,
    deterministicZeroHumanReferencePlanDerived: false,
    externalRouteZeroInternalOpsEstablished: false,
    snapshotHash: null,
    result: "HOLD",
    disposition: "DECLINE_NOT_HUMAN_QUEUE",
    decision: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: message,
    boundary: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_BOUNDARY,
  });
}

/** Verify a snapshot only by rebuilding from the complete pinned source. */
export function verifyOutcomeResourceRouteDiscoverySnapshotV1(record, options = {}) {
  try {
    rejectTree(record);
    rejectTree(options);
    exactObject(options, ["source", "expectedSnapshotHash"],
      "VERIFY_SNAPSHOT_OPTIONS");
    const expected = createOutcomeResourceRouteDiscoverySnapshotV1(options.source);
    if (!same(record, expected)) fail("SNAPSHOT_SOURCE_REBUILD_MISMATCH");
    if (expected.snapshotHash !== hash(options.expectedSnapshotHash,
      "EXPECTED_SNAPSHOT_HASH")) fail("EXPECTED_SNAPSHOT_HASH_MISMATCH");
    return deepFreeze({
      schema: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_SCHEMAS
        .discoverySnapshotVerification,
      ok: true,
      snapshotRecordRederivedFromInput: true,
      externalSourceReplayVerified: false,
      exactTenderAndRequirementCrossBindingVerified: true,
      occurrenceCensusVerified: true,
      objectDedupVerified: true,
      inSnapshotReferenceLifecycleReplayed: true,
      deterministicZeroHumanReferencePlanDerived: true,
      externalRouteZeroInternalOpsEstablished: false,
      snapshotHash: expected.snapshotHash,
      fanoutPlanHash: expected.fanoutPlan.fanoutPlanHash,
      totalOccurrenceCount: expected.occurrenceCensus.totalOccurrenceCount,
      uniqueRouteObjectCount: expected.occurrenceCensus.uniqueRouteObjectCount,
      result: expected.result,
      disposition: expected.disposition,
      decision: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      error: null,
      boundary: OUTSIDER_OUTCOME_RESOURCE_ROUTE_DISCOVERY_V1_BOUNDARY,
    });
  } catch (error) {
    return snapshotVerificationFailure(error);
  }
}

export const createRouteCandidateV1 = createOutcomeResourceRouteCandidateV1;
export const verifyRouteCandidateV1 = verifyOutcomeResourceRouteCandidateV1;
export const createDiscoverySnapshotV1
  = createOutcomeResourceRouteDiscoverySnapshotV1;
export const verifyDiscoverySnapshotV1
  = verifyOutcomeResourceRouteDiscoverySnapshotV1;
