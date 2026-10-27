/*
 * Provider-neutral, one-use tender responses and source-replayed external
 * capacity reservation lifecycles.
 *
 * This module is capability-free. It performs no discovery, contact, network
 * request, pricing, payment, guarantee, settlement, action, or human fallback.
 * A response record is only a closed-shape statement. Cryptographic/source-
 * bundle consistency may become true inside the scope of a caller-pinned,
 * source-specific verifier context after exact canonical source bytes,
 * signatures, the complete occurrence denominator, and the signed lifecycle
 * head are replayed. Capacity remains false until a separately trusted
 * resource-owner registry/root is source-replayed. No layer here establishes
 * legal identity, authority, permission to act, or a guarantee.
 */

import {
  createHash,
  createPublicKey,
  verify as cryptoVerify,
} from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const BufferByteLength = Buffer.byteLength;
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferPrototype = Buffer.prototype;
const BufferEquals = Function.prototype.call.bind(BufferPrototype.equals);
const BufferToString = Function.prototype.call.bind(BufferPrototype.toString);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const JsonParse = JSON.parse;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetConstructor = Set;
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const SetSize = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(Set.prototype, "size").get);
const StringConstructor = String;
const TypeErrorConstructor = TypeError;
const HashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);

const PREFIX = "OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u;
const PUBLIC_CODE = /^[A-Z][A-Z0-9_]{0,127}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const STRICT_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const MAX_RESPONSE_OCCURRENCES = 4;
const MAX_EXTERNAL_EVENTS = 1_024;
const MAX_SOURCE_BYTES = 256 * 1_024;
const MAX_TOTAL_EVENT_SOURCE_BYTES = 4 * 1_024 * 1_024;
const MAX_INPUT_ARRAY_LENGTH = 4_096;
const MAX_TREE_NODES = 50_000;
const MAX_TREE_KEYS = 100_000;

export const OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS
  = ObjectFreeze({
    response: "outsider/outcome-formation-one-use-tender-response/v1",
    responseOccurrence:
      "outsider/outcome-formation-one-use-tender-response-occurrence/v1",
    responseVerification:
      "outsider/outcome-formation-one-use-tender-response-lifecycle-verification/v1",
    verifierContext:
      "outsider/outcome-formation-external-capacity-verifier-context/v1",
    capacityVerification:
      "outsider/outcome-formation-external-capacity-lifecycle-verification/v1",
  });

export const OUTSIDER_ONE_USE_TENDER_RESPONSE_STATES_V1 = ObjectFreeze([
  "OFFERED", "DECLINED", "EXPIRED", "REVOKED",
]);

export const OUTSIDER_EXTERNAL_CAPACITY_LIFECYCLE_STATES_V1 = ObjectFreeze([
  "RESERVED", "EXPIRED", "REVOKED",
]);

export const OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1
  = `sha256:${createHash("sha256")
    .update("outsider/outcome-formation-one-use-response-occurrence/genesis/v1",
      "utf8").digest("hex")}`;

export const OUTSIDER_EXTERNAL_CAPACITY_EVENT_GENESIS_V1
  = `sha256:${createHash("sha256")
    .update("outsider/external-capacity-lifecycle-event/genesis/v1", "utf8")
    .digest("hex")}`;

export const OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_BOUNDARY
  = deepFreeze({
    position:
      "SOURCE_REPLAYED_ONE_USE_RESPONSE_AND_EXTERNAL_CAPACITY_EVIDENCE_ONLY",
    tenderSourceReplayed: true,
    typedGraphAndEpisodeBoundExactly: true,
    discoveryRouteBindingsCallerSuppliedOnly: true,
    discoveryRouteSourceReplayedByThisModule: false,
    discoveryRouteReferenceEstablishesContactability: false,
    responseCreatesIdentity: false,
    responseCreatesAuthority: false,
    responseAloneCreatesCapacity: false,
    callerHashOrBooleanCreatesCapacity: false,
    genericSignatureCreatesIdentity: false,
    genericSignatureCreatesAuthority: false,
    genericSignatureCreatesCapacity: false,
    exactSourceSpecificReceiptRequired: true,
    pinnedVerifierContextRequired: true,
    independentlyReplayedResourceOwnerTrustRegistryAvailable: false,
    sourceSignedStandingClaimIsIndependentTrustAnchor: false,
    exactLifecycleOccurrenceDenominatorRequired: true,
    exactNonRevokedLifecycleHeadRequired: true,
    externalTransparencyAnchorEstablished: false,
    sourceNonEquivocationEstablished: false,
    sourceCompletenessBeyondPinnedHeadEstablished: false,
    objectDedupMayReduceOccurrenceDenominator: false,
    appendOnlyResponseDescendantsRequired: true,
    responseNonceGlobalFreshnessEstablished: false,
    responseNonceConsumptionPersisted: false,
    responseOccurrenceDenominatorExternallyAnchored: false,
    responseOccurrenceCompletenessBeyondCallerPinEstablished: false,
    rightsPrivacyPolicySourceReplayed: false,
    rightsEstablished: false,
    privacyEstablished: false,
    discoveryPerformed: false,
    providerContactPerformed: false,
    networkRequestPerformed: false,
    humanFallbackAllowed: false,
    pricingPerformed: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    legalIdentityEstablished: false,
    externalCapacityEstablished: false,
    authorityEstablished: false,
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    authority: "NONE",
  });

const INITIAL_REASON_CODES = deepFreeze({
  OFFERED: ["ONE_USE_OFFER_CREATED"],
  DECLINED: ["NO_CAPACITY", "SCOPE_UNSUPPORTED", "POLICY_DECLINED",
    "OTHER_DECLARED"],
});
const DESCENDANT_REASON_CODES = deepFreeze({
  EXPIRED: ["OFFER_WINDOW_EXPIRED"],
  REVOKED: ["CAPACITY_WITHDRAWN", "SCOPE_CHANGED", "POLICY_CHANGED",
    "OTHER_DECLARED"],
});

function fail(code) {
  throw new TypeErrorConstructor(`${PREFIX}${code}`);
}

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || SetHas(seen, value)
    || ObjectIsFrozen(value)) return value;
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

function rejectTree(value, seen = new SetConstructor(), depth = 0,
  budget = { nodes: 0, keys: 0 }) {
  if (value === null || typeof value !== "object") return;
  budget.nodes += 1;
  if (budget.nodes > MAX_TREE_NODES) fail("SOURCE_TREE_NODE_BUDGET_EXCEEDED");
  if (depth > 64 || isProxy(value)) fail("SOURCE_TREE_INVALID");
  if (SetHas(seen, value)) fail("SOURCE_CYCLE_FORBIDDEN");
  SetAdd(seen, value);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== ArrayPrototype
    && !BufferIsBuffer(value)) fail("SOURCE_PROTOTYPE_INVALID");
  if (BufferIsBuffer(value)) {
    SetDelete(seen, value);
    return;
  }
  if (ArrayIsArray(value) && value.length > MAX_INPUT_ARRAY_LENGTH) {
    fail("SOURCE_ARRAY_LENGTH_BUDGET_EXCEEDED");
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  budget.keys += keys.length;
  if (budget.keys > MAX_TREE_KEYS) fail("SOURCE_TREE_KEY_BUDGET_EXCEEDED");
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (typeof key !== "string" || !descriptor
      || !ObjectHasOwn(descriptor, "value")) fail("SOURCE_DESCRIPTOR_INVALID");
    if (!(ArrayIsArray(value) && key === "length")
      && descriptor.enumerable !== true) fail("SOURCE_DESCRIPTOR_INVALID");
    rejectTree(descriptor.value, seen, depth + 1, budget);
  }
  if (ArrayIsArray(value)) {
    if (keys.length !== value.length + 1) fail("SOURCE_ARRAY_INVALID");
    for (let index = 0; index < value.length; index += 1) {
      if (!ObjectHasOwn(descriptors, StringConstructor(index))) {
        fail("SOURCE_ARRAY_INVALID");
      }
    }
  }
  SetDelete(seen, value);
}

function exactObject(value, fields, code) {
  rejectTree(value);
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || BufferIsBuffer(value)) fail(`${code}_OBJECT_INVALID`);
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
  rejectTree(value);
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length < 1 || value.length > maximum) fail(`${code}_INVALID`);
  return value;
}

function digestObject(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function digestBytes(value) {
  const state = createHash("sha256");
  HashUpdate(state, value);
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

function token(value, code, pattern = TOKEN) {
  if (typeof value !== "string" || !RegExpTest(pattern, value)) {
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

function safeInteger(value, minimum, maximum, code) {
  if (!NumberIsSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function allowed(value, list, code) {
  for (let index = 0; index < list.length; index += 1) {
    if (value === list[index]) return value;
  }
  fail(`${code}_INVALID`);
}

function tenderChecked(tender, expectedTenderHash) {
  hash(expectedTenderHash, "EXPECTED_TENDER_HASH");
  const checked = verifyOutsiderOutcomeTenderV1(tender,
    { expectedTenderHash });
  if (!checked.ok || checked.structuralTenderVerified !== true
    || checked.derivationVerified !== true || checked.selfHashVerified !== true
    || checked.expectedHashMatched !== true
    || checked.typedGraphReferencesPreserved !== true
    || checked.zeroInternalOpsVerified !== true
    || checked.authorizationEstablished !== false
    || checked.decisionState !== "HOLD" || checked.authority !== "NONE"
    || checked.actionReady !== false || checked.executable !== false) {
    fail("TENDER_SOURCE_REPLAY_FAILED");
  }
  return tender;
}

function tenderRequirement(tender, requirementKind, requirementId) {
  const kind = allowed(requirementKind, ["RESOURCE", "EVIDENCE", "RECOVERY"],
    "REQUIREMENT_KIND");
  token(requirementId, "REQUIREMENT_ID");
  const collection = kind === "RESOURCE"
    ? tender.resourceRequirements.items
    : kind === "EVIDENCE"
      ? tender.evidenceRequirements.items
      : tender.recoveryRequirements.items;
  const idField = kind === "RESOURCE" ? "resourceRequirementId"
    : kind === "EVIDENCE" ? "evidenceRequirementId" : "recoveryRequirementId";
  const requirementSetHash = kind === "RESOURCE"
    ? tender.resourceRequirements.requirementSetHash
    : kind === "EVIDENCE"
      ? tender.evidenceRequirements.requirementSetHash
      : tender.recoveryRequirements.requirementSetHash;
  let source = null;
  for (let index = 0; index < collection.length; index += 1) {
    if (collection[index][idField] === requirementId) {
      source = collection[index];
      break;
    }
  }
  if (source === null) fail("REQUIREMENT_NOT_IN_TENDER_KIND");
  const descriptor = kind === "RESOURCE" ? {
    requirementKind: kind,
    requirementId,
    requirementClassCode: source.resourceClassCode,
    requirementScopeRefHash: source.capabilityRefHash,
    quantity: source.quantity,
    unitCode: source.unitCode,
    regionRefHash: source.regionRefHash,
    dueBy: source.requiredBy,
    quantitySemantics: "EXACT_TENDER_RESOURCE_QUANTITY_AND_UNIT",
  } : kind === "EVIDENCE" ? {
    requirementKind: kind,
    requirementId,
    requirementClassCode: source.evidenceClassCode,
    requirementScopeRefHash: source.evidenceRequirementRefHash,
    quantity: 1,
    unitCode: "REQUIREMENT",
    regionRefHash: null,
    dueBy: source.dueBy,
    quantitySemantics: "ONE_EXACT_EVIDENCE_REQUIREMENT_SLOT",
  } : {
    requirementKind: kind,
    requirementId,
    requirementClassCode: source.resourceClassCode,
    requirementScopeRefHash: source.recoveryOutcomeRefHash,
    quantity: 1,
    unitCode: "REQUIREMENT",
    regionRefHash: null,
    dueBy: source.completionDeadline,
    quantitySemantics: "ONE_EXACT_RECOVERY_REQUIREMENT_SLOT",
  };
  return deepFreeze({
    ...descriptor,
    requirementSetHash,
    requirementObjectHash: digestObject(
      "outsider/outcome-formation-exact-tender-requirement/v1", {
        tenderHash: tender.tenderHash,
        requirementKind: kind,
        requirementSetHash,
        requirement: source,
      }),
  });
}

function scopeFor(tender, requirement, serviceFrom, serviceUntil,
  discoveryRouteObjectHash, discoveryCandidateHash) {
  return digestObject("outsider/outcome-formation-one-use-scope/v1", {
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    networkCompleteEpisodeJoinHash:
      tender.typedGraph.episode.networkCompleteEpisodeJoinHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
    requirementKind: requirement.requirementKind,
    requirementId: requirement.requirementId,
    requirementSetHash: requirement.requirementSetHash,
    requirementObjectHash: requirement.requirementObjectHash,
    requirementClassCode: requirement.requirementClassCode,
    requirementScopeRefHash: requirement.requirementScopeRefHash,
    quantity: requirement.quantity,
    unitCode: requirement.unitCode,
    regionRefHash: requirement.regionRefHash,
    dueBy: requirement.dueBy,
    quantitySemantics: requirement.quantitySemantics,
    serviceFrom,
    serviceUntil,
    discoveryRouteObjectHash,
    discoveryCandidateHash,
  });
}

const INITIAL_INPUT_FIELDS = ObjectFreeze([
  "tender", "expectedTenderHash", "providerRefHash", "requirementKind",
  "requirementId", "discoveryRouteObjectHash", "discoveryCandidateHash",
  "quantity", "unitCode", "serviceFrom", "serviceUntil", "responseState",
  "stateAt", "expiresAt", "reasonCode", "responseNonceHash",
  "sourceResponseRefHash",
]);

function fixedResponseBody(tender, requirement, input, serviceFrom, serviceUntil,
  responseState, stateAt, expiresAt, reasonCode) {
  const discoveryRouteObjectHash = hash(input.discoveryRouteObjectHash,
    "DISCOVERY_ROUTE_OBJECT_HASH");
  const discoveryCandidateHash = hash(input.discoveryCandidateHash,
    "DISCOVERY_CANDIDATE_HASH");
  return {
    schema: OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.response,
    schemaVersion: "1.0.0",
    recordClass: "PROVIDER_NEUTRAL_ONE_USE_TENDER_RESPONSE_REFERENCE",
    tenderHash: tender.tenderHash,
    typedGraphHash: tender.typedGraph.typedGraphHash,
    episodeHash: tender.typedGraph.episode.episodeHash,
    networkCompleteEpisodeJoinHash:
      tender.typedGraph.episode.networkCompleteEpisodeJoinHash,
    attemptHash: tender.typedGraph.attempt.attemptHash,
    providerRefHash: hash(input.providerRefHash, "PROVIDER_REF_HASH"),
    discoveryRouteObjectHash,
    discoveryCandidateHash,
    scopeHash: scopeFor(tender, requirement, serviceFrom, serviceUntil,
      discoveryRouteObjectHash, discoveryCandidateHash),
    requirementKind: requirement.requirementKind,
    requirementId: requirement.requirementId,
    requirementSetHash: requirement.requirementSetHash,
    requirementObjectHash: requirement.requirementObjectHash,
    requirementClassCode: requirement.requirementClassCode,
    requirementScopeRefHash: requirement.requirementScopeRefHash,
    quantity: requirement.quantity,
    unitCode: requirement.unitCode,
    regionRefHash: requirement.regionRefHash,
    dueBy: requirement.dueBy,
    quantitySemantics: requirement.quantitySemantics,
    serviceFrom,
    serviceUntil,
    evidencePlanHash: tender.evidenceRequirements.requirementSetHash,
    remedyPlanHash: tender.recoveryRequirements.requirementSetHash,
    responseState,
    stateAt,
    expiresAt,
    reasonCode,
    responseNonceHash: hash(input.responseNonceHash, "RESPONSE_NONCE_HASH"),
    sourceResponseRefHash: nullableHash(input.sourceResponseRefHash,
      "SOURCE_RESPONSE_REF_HASH"),
    oneUseOnly: true,
    standingCapacityCreated: false,
    discoveryRouteSourceReplayed: false,
    discoveryRouteContactabilityEstablished: false,
    callerDeclaredProviderResponseReference: true,
    externalProviderResponseSourceReplayed: false,
    externalProviderResponseAuthenticityEstablished: false,
    providerLegalIdentityEstablished: false,
    providerAuthorityEstablished: false,
    capacityReserved: false,
    pricePresent: false,
    pricingPerformed: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
}

export function createInitialOneUseTenderResponseV1(input = {}) {
  exactObject(input, INITIAL_INPUT_FIELDS, "INITIAL_RESPONSE_INPUT");
  const tender = tenderChecked(input.tender, input.expectedTenderHash);
  const requirement = tenderRequirement(tender, input.requirementKind,
    input.requirementId);
  if (input.quantity !== requirement.quantity
    || input.unitCode !== requirement.unitCode) {
    fail("RESPONSE_QUANTITY_OR_UNIT_NOT_EXACT_TENDER_REQUIREMENT");
  }
  const serviceFrom = iso(input.serviceFrom, "SERVICE_FROM");
  const serviceUntil = iso(input.serviceUntil, "SERVICE_UNTIL");
  const stateAt = iso(input.stateAt, "STATE_AT");
  const expiresAt = iso(input.expiresAt, "EXPIRES_AT");
  if (DateParse(serviceUntil) <= DateParse(serviceFrom)
    || DateParse(serviceFrom) < DateParse(stateAt)
    || DateParse(serviceUntil) > DateParse(requirement.dueBy)
    || DateParse(stateAt) < DateParse(tender.compiledAt)
    || DateParse(stateAt) > DateParse(tender.formationDeadline)
    || DateParse(expiresAt) <= DateParse(stateAt)
    || DateParse(expiresAt) < DateParse(serviceUntil)
    || DateParse(expiresAt) > DateParse(requirement.dueBy)) {
    fail("RESPONSE_TIME_WINDOW_INVALID");
  }
  const responseState = allowed(input.responseState, ["OFFERED", "DECLINED"],
    "INITIAL_RESPONSE_STATE");
  const reasonCode = allowed(input.reasonCode,
    INITIAL_REASON_CODES[responseState], "INITIAL_REASON_CODE");
  const base = fixedResponseBody(tender, requirement, input, serviceFrom,
    serviceUntil, responseState, stateAt, expiresAt, reasonCode);
  const body = {
    ...base,
    revision: 0,
    predecessorResponseHash: null,
    supersedesResponseHash: null,
    callerDeclaredLineageHeadAtCreation: true,
    appendOnlyDescendantRequiredForChange: true,
  };
  return deepFreeze({ ...body, responseHash: digestObject(
    OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.response, body) });
}

const RESPONSE_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "recordClass", "tenderHash", "typedGraphHash",
  "episodeHash", "networkCompleteEpisodeJoinHash", "attemptHash",
  "providerRefHash", "discoveryRouteObjectHash", "discoveryCandidateHash",
  "scopeHash", "requirementKind", "requirementId",
  "requirementSetHash", "requirementObjectHash", "requirementClassCode",
  "requirementScopeRefHash", "quantity", "unitCode", "regionRefHash", "dueBy",
  "quantitySemantics", "serviceFrom", "serviceUntil", "evidencePlanHash",
  "remedyPlanHash", "responseState", "stateAt", "expiresAt", "reasonCode",
  "responseNonceHash", "sourceResponseRefHash", "oneUseOnly",
  "standingCapacityCreated", "discoveryRouteSourceReplayed",
  "discoveryRouteContactabilityEstablished",
  "callerDeclaredProviderResponseReference",
  "externalProviderResponseSourceReplayed",
  "externalProviderResponseAuthenticityEstablished",
  "providerLegalIdentityEstablished",
  "providerAuthorityEstablished", "capacityReserved", "pricePresent",
  "pricingPerformed", "guaranteeEstablished", "settlementPermitted",
  "decisionState", "authority", "actionReady", "executable", "revision",
  "predecessorResponseHash", "supersedesResponseHash",
  "callerDeclaredLineageHeadAtCreation",
  "appendOnlyDescendantRequiredForChange", "responseHash",
]);

function assertFixedResponseState(record) {
  if (record.schema
      !== OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.response
    || record.schemaVersion !== "1.0.0"
    || record.recordClass
      !== "PROVIDER_NEUTRAL_ONE_USE_TENDER_RESPONSE_REFERENCE"
    || record.oneUseOnly !== true || record.standingCapacityCreated !== false
    || record.discoveryRouteSourceReplayed !== false
    || record.discoveryRouteContactabilityEstablished !== false
    || record.callerDeclaredProviderResponseReference !== true
    || record.externalProviderResponseSourceReplayed !== false
    || record.externalProviderResponseAuthenticityEstablished !== false
    || record.providerLegalIdentityEstablished !== false
    || record.providerAuthorityEstablished !== false
    || record.capacityReserved !== false || record.pricePresent !== false
    || record.pricingPerformed !== false || record.guaranteeEstablished !== false
    || record.settlementPermitted !== false || record.decisionState !== "HOLD"
    || record.authority !== "NONE" || record.actionReady !== false
    || record.executable !== false
    || record.callerDeclaredLineageHeadAtCreation !== true
    || record.appendOnlyDescendantRequiredForChange !== true) {
    fail("RESPONSE_FIXED_STATE_INVALID");
  }
}

function initialInputFromRecord(tender, record) {
  return {
    tender,
    expectedTenderHash: record.tenderHash,
    providerRefHash: record.providerRefHash,
    discoveryRouteObjectHash: record.discoveryRouteObjectHash,
    discoveryCandidateHash: record.discoveryCandidateHash,
    requirementKind: record.requirementKind,
    requirementId: record.requirementId,
    quantity: record.quantity,
    unitCode: record.unitCode,
    serviceFrom: record.serviceFrom,
    serviceUntil: record.serviceUntil,
    responseState: record.responseState,
    stateAt: record.stateAt,
    expiresAt: record.expiresAt,
    reasonCode: record.reasonCode,
    responseNonceHash: record.responseNonceHash,
    sourceResponseRefHash: record.sourceResponseRefHash,
  };
}

function verifyInitialResponse(record, tender) {
  exactObject(record, RESPONSE_FIELDS, "INITIAL_RESPONSE");
  assertFixedResponseState(record);
  if (record.revision !== 0 || record.predecessorResponseHash !== null
    || record.supersedesResponseHash !== null) fail("INITIAL_LINEAGE_INVALID");
  const rebuilt = createInitialOneUseTenderResponseV1(
    initialInputFromRecord(tender, record));
  if (!same(record, rebuilt)) fail("INITIAL_RESPONSE_SOURCE_REBUILD_FAILED");
  return rebuilt;
}

const DESCENDANT_INPUT_FIELDS = ObjectFreeze([
  "tender", "expectedTenderHash", "predecessorResponse", "responseState",
  "stateAt", "reasonCode", "responseNonceHash", "sourceResponseRefHash",
]);

export function createOneUseTenderResponseDescendantV1(input = {}) {
  exactObject(input, DESCENDANT_INPUT_FIELDS, "DESCENDANT_RESPONSE_INPUT");
  const tender = tenderChecked(input.tender, input.expectedTenderHash);
  const predecessor = verifyInitialResponse(input.predecessorResponse, tender);
  if (predecessor.responseState !== "OFFERED") {
    fail("ONLY_OFFERED_RESPONSE_MAY_HAVE_DESCENDANT");
  }
  const responseState = allowed(input.responseState, ["EXPIRED", "REVOKED"],
    "DESCENDANT_RESPONSE_STATE");
  const reasonCode = allowed(input.reasonCode,
    DESCENDANT_REASON_CODES[responseState], "DESCENDANT_REASON_CODE");
  const stateAt = iso(input.stateAt, "DESCENDANT_STATE_AT");
  if (responseState === "EXPIRED"
    ? DateParse(stateAt) < DateParse(predecessor.expiresAt)
    : DateParse(stateAt) < DateParse(predecessor.stateAt)
      || DateParse(stateAt) >= DateParse(predecessor.expiresAt)) {
    fail("DESCENDANT_STATE_TIME_INVALID");
  }
  const responseNonceHash = hash(input.responseNonceHash,
    "DESCENDANT_RESPONSE_NONCE_HASH");
  if (responseNonceHash === predecessor.responseNonceHash) {
    fail("DESCENDANT_RESPONSE_NONCE_REUSED");
  }
  const inheritedInput = {
    providerRefHash: predecessor.providerRefHash,
    discoveryRouteObjectHash: predecessor.discoveryRouteObjectHash,
    discoveryCandidateHash: predecessor.discoveryCandidateHash,
    responseNonceHash,
    sourceResponseRefHash: input.sourceResponseRefHash,
  };
  const requirement = tenderRequirement(tender, predecessor.requirementKind,
    predecessor.requirementId);
  const base = fixedResponseBody(tender, requirement, inheritedInput,
    predecessor.serviceFrom, predecessor.serviceUntil, responseState, stateAt,
    predecessor.expiresAt, reasonCode);
  const body = {
    ...base,
    revision: predecessor.revision + 1,
    predecessorResponseHash: predecessor.responseHash,
    supersedesResponseHash: predecessor.responseHash,
    callerDeclaredLineageHeadAtCreation: true,
    appendOnlyDescendantRequiredForChange: true,
  };
  return deepFreeze({ ...body, responseHash: digestObject(
    OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.response, body) });
}

function descendantInputFromRecord(tender, predecessor, record) {
  return {
    tender,
    expectedTenderHash: record.tenderHash,
    predecessorResponse: predecessor,
    responseState: record.responseState,
    stateAt: record.stateAt,
    reasonCode: record.reasonCode,
    responseNonceHash: record.responseNonceHash,
    sourceResponseRefHash: record.sourceResponseRefHash,
  };
}

function verifyDescendantResponse(record, tender, predecessor) {
  exactObject(record, RESPONSE_FIELDS, "DESCENDANT_RESPONSE");
  assertFixedResponseState(record);
  if (record.revision !== predecessor.revision + 1
    || record.predecessorResponseHash !== predecessor.responseHash
    || record.supersedesResponseHash !== predecessor.responseHash) {
    fail("DESCENDANT_LINEAGE_INVALID");
  }
  const rebuilt = createOneUseTenderResponseDescendantV1(
    descendantInputFromRecord(tender, predecessor, record));
  if (!same(record, rebuilt)) fail("DESCENDANT_RESPONSE_SOURCE_REBUILD_FAILED");
  return rebuilt;
}

const OCCURRENCE_INPUT_FIELDS = ObjectFreeze([
  "response", "ordinal", "previousOccurrenceHash", "recordedAt",
  "occurrenceNonceHash",
]);

export function createOneUseTenderResponseOccurrenceV1(input = {}) {
  exactObject(input, OCCURRENCE_INPUT_FIELDS, "RESPONSE_OCCURRENCE_INPUT");
  exactObject(input.response, RESPONSE_FIELDS, "OCCURRENCE_RESPONSE");
  assertFixedResponseState(input.response);
  const ordinal = safeInteger(input.ordinal, 1, MAX_RESPONSE_OCCURRENCES,
    "OCCURRENCE_ORDINAL");
  const recordedAt = iso(input.recordedAt, "OCCURRENCE_RECORDED_AT");
  if (DateParse(recordedAt) < DateParse(input.response.stateAt)) {
    fail("OCCURRENCE_PRECEDES_RESPONSE_STATE");
  }
  const body = {
    schema:
      OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.responseOccurrence,
    schemaVersion: "1.0.0",
    occurrencePolicy:
      "CONTENT_OBJECTS_MAY_DEDUP_EVERY_RESPONSE_OCCURRENCE_COUNTS",
    ordinal,
    previousOccurrenceHash: hash(input.previousOccurrenceHash,
      "PREVIOUS_OCCURRENCE_HASH"),
    responseHash: hash(input.response.responseHash, "OCCURRENCE_RESPONSE_HASH"),
    tenderHash: hash(input.response.tenderHash, "OCCURRENCE_TENDER_HASH"),
    providerRefHash: hash(input.response.providerRefHash,
      "OCCURRENCE_PROVIDER_REF_HASH"),
    responseState: allowed(input.response.responseState,
      OUTSIDER_ONE_USE_TENDER_RESPONSE_STATES_V1, "OCCURRENCE_RESPONSE_STATE"),
    recordedAt,
    occurrenceNonceHash: hash(input.occurrenceNonceHash,
      "OCCURRENCE_NONCE_HASH"),
    objectDedupAppliedToOccurrence: false,
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, occurrenceHash: digestObject(
    OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.responseOccurrence,
    body) });
}

const OCCURRENCE_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "occurrencePolicy", "ordinal",
  "previousOccurrenceHash", "responseHash", "tenderHash", "providerRefHash",
  "responseState", "recordedAt", "occurrenceNonceHash",
  "objectDedupAppliedToOccurrence", "authority", "actionReady", "executable",
  "occurrenceHash",
]);

function verifyOccurrence(record, response, expectedOrdinal, expectedPrevious) {
  exactObject(record, OCCURRENCE_FIELDS, "RESPONSE_OCCURRENCE");
  const rebuilt = createOneUseTenderResponseOccurrenceV1({
    response,
    ordinal: record.ordinal,
    previousOccurrenceHash: record.previousOccurrenceHash,
    recordedAt: record.recordedAt,
    occurrenceNonceHash: record.occurrenceNonceHash,
  });
  if (!same(record, rebuilt) || record.ordinal !== expectedOrdinal
    || record.previousOccurrenceHash !== expectedPrevious) {
    fail("RESPONSE_OCCURRENCE_SOURCE_REBUILD_FAILED");
  }
  return rebuilt;
}

function responseLifecycleFailure(error) {
  const message = error instanceof Error
    && RegExpTest(/^OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_[A-Z0-9_]+$/u,
      StringConstructor(error.message))
    ? error.message : `${PREFIX}UNTRUSTED_FAILURE`;
  return deepFreeze({
    schema:
      OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.responseVerification,
    ok: false,
    tenderSourceReplayed: false,
    typedGraphAndEpisodeBoundExactly: false,
    responseRecordsSourceRebuilt: false,
    appendOnlyLineageReplayed: false,
    responseOccurrenceDenominatorReplayed: false,
    responseLifecycleHeadMatchedCallerPin: false,
    responseNonceUniqueWithinSuppliedLifecycle: false,
    nonceGlobalFreshnessEstablished: false,
    nonceConsumptionPersisted: false,
    responseOccurrenceDenominatorExternallyAnchored: false,
    responseOccurrenceCompletenessBeyondCallerPinEstablished: false,
    currentCallerDeclaredOneUseOfferReference: false,
    capacityReserved: false,
    providerLegalIdentityEstablished: false,
    providerAuthorityEstablished: false,
    pricePresent: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: message,
    boundary: OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_BOUNDARY,
  });
}

const RESPONSE_VERIFY_INPUT_FIELDS = ObjectFreeze([
  "tender", "expectedTenderHash", "responses", "occurrences",
  "expectedOccurrenceCount", "expectedLifecycleHeadHash", "observedAt",
]);

export function verifyOneUseTenderResponseLifecycleV1(input = {}) {
  try {
    exactObject(input, RESPONSE_VERIFY_INPUT_FIELDS, "RESPONSE_VERIFY_INPUT");
    const tender = tenderChecked(input.tender, input.expectedTenderHash);
    const responses = denseArray(input.responses, "RESPONSES",
      MAX_RESPONSE_OCCURRENCES);
    const occurrences = denseArray(input.occurrences, "OCCURRENCES",
      MAX_RESPONSE_OCCURRENCES);
    const expectedOccurrenceCount = safeInteger(input.expectedOccurrenceCount,
      1, MAX_RESPONSE_OCCURRENCES, "EXPECTED_OCCURRENCE_COUNT");
    const expectedLifecycleHeadHash = hash(input.expectedLifecycleHeadHash,
      "EXPECTED_LIFECYCLE_HEAD_HASH");
    const observedAt = iso(input.observedAt, "OBSERVED_AT");
    if (occurrences.length !== expectedOccurrenceCount
      || responses.length > 2) fail("RESPONSE_OCCURRENCE_DENOMINATOR_MISMATCH");

    const verifiedResponses = [];
    const first = verifyInitialResponse(responses[0], tender);
    verifiedResponses.push(first);
    if (responses.length === 2) {
      verifiedResponses.push(verifyDescendantResponse(responses[1], tender, first));
    }
    let previous = OUTSIDER_ONE_USE_TENDER_RESPONSE_OCCURRENCE_GENESIS_V1;
    const nonceSet = new SetConstructor();
    const observedResponseHashes = new SetConstructor();
    let responseIndex = 0;
    for (let index = 0; index < occurrences.length; index += 1) {
      if (occurrences[index].responseHash
          !== verifiedResponses[responseIndex].responseHash) {
        if (responseIndex + 1 < verifiedResponses.length
          && occurrences[index].responseHash
            === verifiedResponses[responseIndex + 1].responseHash) {
          if (!SetHas(observedResponseHashes,
            verifiedResponses[responseIndex].responseHash)) {
            fail("RESPONSE_OBJECT_MISSING_FROM_OCCURRENCE_CENSUS");
          }
          responseIndex += 1;
        } else {
          fail("RESPONSE_OCCURRENCE_OBJECT_SEQUENCE_INVALID");
        }
      }
      const occurrence = verifyOccurrence(occurrences[index],
        verifiedResponses[responseIndex], index + 1, previous);
      if (SetHas(nonceSet, occurrence.occurrenceNonceHash)) {
        fail("RESPONSE_OCCURRENCE_REPLAY_DETECTED");
      }
      SetAdd(nonceSet, occurrence.occurrenceNonceHash);
      SetAdd(observedResponseHashes, occurrence.responseHash);
      if (index > 0
        && DateParse(occurrence.recordedAt)
          < DateParse(occurrences[index - 1].recordedAt)) {
        fail("RESPONSE_OCCURRENCE_TIME_ROLLBACK");
      }
      previous = occurrence.occurrenceHash;
    }
    if (responseIndex !== verifiedResponses.length - 1
      || SetSize(observedResponseHashes) !== verifiedResponses.length
      || occurrences[occurrences.length - 1].responseHash
        !== verifiedResponses[verifiedResponses.length - 1].responseHash) {
      fail("RESPONSE_HEAD_MISSING_FROM_OCCURRENCE_CENSUS");
    }
    if (previous !== expectedLifecycleHeadHash) {
      fail("RESPONSE_LIFECYCLE_HEAD_PIN_MISMATCH");
    }
    const head = verifiedResponses[verifiedResponses.length - 1];
    if (DateParse(observedAt)
      < DateParse(occurrences[occurrences.length - 1].recordedAt)) {
      fail("OBSERVED_BEFORE_RESPONSE_HEAD");
    }
    if (head.responseState === "OFFERED"
      && DateParse(observedAt) >= DateParse(head.expiresAt)) {
      fail("EXPIRED_OFFER_MISSING_APPEND_ONLY_DESCENDANT");
    }
    const currentCallerDeclaredOneUseOfferReference
      = head.responseState === "OFFERED";
    const body = {
      schema:
        OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.responseVerification,
      ok: true,
      tenderHash: tender.tenderHash,
      typedGraphHash: tender.typedGraph.typedGraphHash,
      episodeHash: tender.typedGraph.episode.episodeHash,
      networkCompleteEpisodeJoinHash:
        tender.typedGraph.episode.networkCompleteEpisodeJoinHash,
      attemptHash: tender.typedGraph.attempt.attemptHash,
      initialResponseHash: first.responseHash,
      currentResponseHash: head.responseHash,
      lifecycleHeadHash: previous,
      responseOccurrenceCount: occurrences.length,
      currentResponseState: head.responseState,
      providerRefHash: head.providerRefHash,
      discoveryRouteObjectHash: head.discoveryRouteObjectHash,
      discoveryCandidateHash: head.discoveryCandidateHash,
      scopeHash: head.scopeHash,
      requirementKind: head.requirementKind,
      requirementId: head.requirementId,
      requirementSetHash: head.requirementSetHash,
      requirementObjectHash: head.requirementObjectHash,
      requirementClassCode: head.requirementClassCode,
      requirementScopeRefHash: head.requirementScopeRefHash,
      quantity: head.quantity,
      unitCode: head.unitCode,
      regionRefHash: head.regionRefHash,
      dueBy: head.dueBy,
      quantitySemantics: head.quantitySemantics,
      serviceFrom: head.serviceFrom,
      serviceUntil: head.serviceUntil,
      evidencePlanHash: head.evidencePlanHash,
      remedyPlanHash: head.remedyPlanHash,
      offerExpiresAt: head.expiresAt,
      tenderSourceReplayed: true,
      typedGraphAndEpisodeBoundExactly: true,
      responseRecordsSourceRebuilt: true,
      appendOnlyLineageReplayed: true,
      responseOccurrenceDenominatorReplayed: true,
      objectDedupReducedOccurrenceDenominator: false,
      responseLifecycleHeadMatchedCallerPin: true,
      responseNonceUniqueWithinSuppliedLifecycle: true,
      nonceGlobalFreshnessEstablished: false,
      nonceConsumptionPersisted: false,
      responseOccurrenceDenominatorExternallyAnchored: false,
      responseOccurrenceCompletenessBeyondCallerPinEstablished: false,
      currentCallerDeclaredOneUseOfferReference,
      responseAloneCreatesCapacity: false,
      capacityReserved: false,
      providerLegalIdentityEstablished: false,
      providerAuthorityEstablished: false,
      pricePresent: false,
      guaranteeEstablished: false,
      settlementPermitted: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      error: null,
      boundary: OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_BOUNDARY,
    };
    return deepFreeze({ ...body, verificationHash: digestObject(
      OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.responseVerification,
      body) });
  } catch (error) {
    return responseLifecycleFailure(error);
  }
}

const CONTEXT_INPUT_FIELDS = ObjectFreeze([
  "verifierId", "verifierRevisionHash", "adapterArtifactHash",
  "sourceSystemId", "semanticsSchema", "standingSchema", "receiptSchema",
  "lifecycleEventSchema", "lifecycleHeadSchema", "sourcePublicKeyPem",
  "expectedSourceKeyId",
  "sourceTrustPolicyRefHash", "rightsPrivacyPolicyRefHash", "validFrom",
  "validUntil", "issuedAt", "maximumLifecycleHeadAgeMs",
]);

function publicKeyMaterial(publicKeyPem, expectedKeyId) {
  if (typeof publicKeyPem !== "string" || BufferByteLength(publicKeyPem, "utf8")
    > 16_384) fail("SOURCE_PUBLIC_KEY_INVALID");
  let key;
  try { key = createPublicKey(publicKeyPem); }
  catch { fail("SOURCE_PUBLIC_KEY_INVALID"); }
  if (key.asymmetricKeyType !== "ed25519") fail("SOURCE_PUBLIC_KEY_NOT_ED25519");
  const der = key.export({ type: "spki", format: "der" });
  const keyId = digestBytes(der);
  if (keyId !== hash(expectedKeyId, "EXPECTED_SOURCE_KEY_ID")) {
    fail("SOURCE_KEY_ID_MISMATCH");
  }
  return { key, keyId };
}

export function createExternalCapacityVerifierContextV1(input = {}) {
  exactObject(input, CONTEXT_INPUT_FIELDS, "VERIFIER_CONTEXT_INPUT");
  const material = publicKeyMaterial(input.sourcePublicKeyPem,
    input.expectedSourceKeyId);
  const validFrom = iso(input.validFrom, "CONTEXT_VALID_FROM");
  const validUntil = iso(input.validUntil, "CONTEXT_VALID_UNTIL");
  const issuedAt = iso(input.issuedAt, "CONTEXT_ISSUED_AT");
  if (DateParse(validUntil) <= DateParse(validFrom)
    || DateParse(issuedAt) > DateParse(validFrom)) {
    fail("VERIFIER_CONTEXT_VALIDITY_INVALID");
  }
  const body = {
    schema:
      OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.verifierContext,
    schemaVersion: "1.0.0",
    recordClass: "PINNED_SOURCE_SPECIFIC_EXTERNAL_CAPACITY_VERIFIER_CONTEXT",
    verifierId: token(input.verifierId, "VERIFIER_ID"),
    verifierRevisionHash: hash(input.verifierRevisionHash,
      "VERIFIER_REVISION_HASH"),
    adapterArtifactHash: hash(input.adapterArtifactHash,
      "ADAPTER_ARTIFACT_HASH"),
    sourceSystemId: token(input.sourceSystemId, "SOURCE_SYSTEM_ID"),
    semanticsSchema: token(input.semanticsSchema, "SEMANTICS_SCHEMA"),
    standingSchema: token(input.standingSchema, "STANDING_SCHEMA"),
    receiptSchema: token(input.receiptSchema, "RECEIPT_SCHEMA"),
    lifecycleEventSchema: token(input.lifecycleEventSchema,
      "LIFECYCLE_EVENT_SCHEMA"),
    lifecycleHeadSchema: token(input.lifecycleHeadSchema,
      "LIFECYCLE_HEAD_SCHEMA"),
    signatureAlgorithm: "ED25519",
    sourcePublicKeyPem: input.sourcePublicKeyPem,
    sourceKeyId: material.keyId,
    sourceTrustPolicyRefHash: hash(input.sourceTrustPolicyRefHash,
      "SOURCE_TRUST_POLICY_REF_HASH"),
    rightsPrivacyPolicyRefHash: hash(input.rightsPrivacyPolicyRefHash,
      "RIGHTS_PRIVACY_POLICY_REF_HASH"),
    validFrom,
    validUntil,
    issuedAt,
    maximumLifecycleHeadAgeMs: safeInteger(input.maximumLifecycleHeadAgeMs,
      0, 86_400_000, "MAXIMUM_LIFECYCLE_HEAD_AGE_MS"),
    contextIsSourceSpecific: true,
    callerPinRequired: true,
    genericSignatureMintsAuthority: false,
    legalIdentityEstablished: false,
    authorityEstablished: false,
    pricingAuthorityEstablished: false,
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, verifierContextHash: digestObject(
    OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.verifierContext,
    body) });
}

const CONTEXT_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "recordClass", "verifierId",
  "verifierRevisionHash", "adapterArtifactHash", "sourceSystemId",
  "semanticsSchema", "standingSchema", "receiptSchema",
  "lifecycleEventSchema", "lifecycleHeadSchema",
  "signatureAlgorithm", "sourcePublicKeyPem", "sourceKeyId",
  "sourceTrustPolicyRefHash", "rightsPrivacyPolicyRefHash", "validFrom",
  "validUntil", "issuedAt", "contextIsSourceSpecific", "callerPinRequired",
  "genericSignatureMintsAuthority", "legalIdentityEstablished",
  "authorityEstablished", "pricingAuthorityEstablished", "actionReady",
  "executable", "maximumLifecycleHeadAgeMs", "verifierContextHash",
]);

function contextInputFromRecord(record) {
  return {
    verifierId: record.verifierId,
    verifierRevisionHash: record.verifierRevisionHash,
    adapterArtifactHash: record.adapterArtifactHash,
    sourceSystemId: record.sourceSystemId,
    semanticsSchema: record.semanticsSchema,
    standingSchema: record.standingSchema,
    receiptSchema: record.receiptSchema,
    lifecycleEventSchema: record.lifecycleEventSchema,
    lifecycleHeadSchema: record.lifecycleHeadSchema,
    sourcePublicKeyPem: record.sourcePublicKeyPem,
    expectedSourceKeyId: record.sourceKeyId,
    sourceTrustPolicyRefHash: record.sourceTrustPolicyRefHash,
    rightsPrivacyPolicyRefHash: record.rightsPrivacyPolicyRefHash,
    validFrom: record.validFrom,
    validUntil: record.validUntil,
    issuedAt: record.issuedAt,
    maximumLifecycleHeadAgeMs: record.maximumLifecycleHeadAgeMs,
  };
}

export function verifyExternalCapacityVerifierContextV1(record, options = {}) {
  try {
    exactObject(options, ["expectedVerifierContextHash"],
      "VERIFIER_CONTEXT_OPTIONS");
    exactObject(record, CONTEXT_FIELDS, "VERIFIER_CONTEXT");
    const expected = hash(options.expectedVerifierContextHash,
      "EXPECTED_VERIFIER_CONTEXT_HASH");
    const rebuilt = createExternalCapacityVerifierContextV1(
      contextInputFromRecord(record));
    if (!same(record, rebuilt) || rebuilt.verifierContextHash !== expected) {
      fail("VERIFIER_CONTEXT_SOURCE_REBUILD_OR_PIN_FAILED");
    }
    return deepFreeze({ ok: true, context: rebuilt, error: null });
  } catch (error) {
    const message = error instanceof Error
      && RegExpTest(
        /^OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_[A-Z0-9_]+$/u,
        StringConstructor(error.message))
      ? error.message : `${PREFIX}UNTRUSTED_FAILURE`;
    return deepFreeze({ ok: false, context: null, error: message });
  }
}

const SOURCE_KINDS = ObjectFreeze(["SEMANTICS", "STANDING", "RECEIPT",
  "LIFECYCLE_EVENT", "LIFECYCLE_HEAD"]);

export function externalCapacitySourceSigningMessageV1(kind, payload) {
  const normalizedKind = allowed(kind, SOURCE_KINDS, "SOURCE_KIND");
  rejectTree(payload);
  const canonical = canonicalizeStrict(payload);
  return BufferFrom(
    `outsider/external-capacity-source/${normalizedKind.toLowerCase()}/v1\0${canonical}`,
    "utf8");
}

function canonicalSourceEnvelope(bytes, code) {
  if (!BufferIsBuffer(bytes) || bytes.length < 2
    || bytes.length > MAX_SOURCE_BYTES) fail(`${code}_BYTES_INVALID`);
  const copy = BufferFrom(bytes);
  const text = BufferToString(copy, "utf8");
  if (!BufferEquals(BufferFrom(text, "utf8"), copy)) fail(`${code}_UTF8_INVALID`);
  let value;
  try { value = JsonParse(text); } catch { fail(`${code}_JSON_INVALID`); }
  exactObject(value, ["payload", "signature"], `${code}_ENVELOPE`);
  if (canonicalizeStrict(value) !== text) fail(`${code}_NOT_EXACT_CANONICAL_JSON`);
  return { value: deepFreeze(value), bytes: copy, byteHash: digestBytes(copy) };
}

function strictSignature(value, context, kind, payload) {
  exactObject(value, ["algorithm", "keyId", "valueBase64"], "SOURCE_SIGNATURE");
  if (value.algorithm !== "ED25519" || value.keyId !== context.sourceKeyId
    || typeof value.valueBase64 !== "string"
    || !RegExpTest(STRICT_BASE64, value.valueBase64)) {
    fail("SOURCE_SIGNATURE_INVALID");
  }
  const bytes = BufferFrom(value.valueBase64, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== value.valueBase64) {
    fail("SOURCE_SIGNATURE_INVALID");
  }
  const material = publicKeyMaterial(context.sourcePublicKeyPem,
    context.sourceKeyId);
  if (!cryptoVerify(null, externalCapacitySourceSigningMessageV1(kind, payload),
    material.key, bytes)) fail("SOURCE_SIGNATURE_INVALID");
}

function withinContext(time, context, code) {
  const value = iso(time, code);
  if (DateParse(value) < DateParse(context.validFrom)
    || DateParse(value) >= DateParse(context.validUntil)) {
    fail(`${code}_OUTSIDE_CONTEXT_VALIDITY`);
  }
  return value;
}

const SEMANTICS_PAYLOAD_FIELDS = ObjectFreeze([
  "schema", "sourceSystemId", "verifierId", "verifierRevisionHash",
  "adapterArtifactHash", "receiptSchema", "lifecycleEventSchema",
  "lifecycleHeadSchema", "reservedStatusSemanticCode",
  "semanticsEvidenceRefHash", "validFrom", "validUntil", "issuedAt",
]);

function verifySemanticsPayload(payload, context, observedAt) {
  exactObject(payload, SEMANTICS_PAYLOAD_FIELDS, "SEMANTICS_PAYLOAD");
  if (payload.schema !== context.semanticsSchema
    || payload.sourceSystemId !== context.sourceSystemId
    || payload.verifierId !== context.verifierId
    || payload.verifierRevisionHash !== context.verifierRevisionHash
    || payload.adapterArtifactHash !== context.adapterArtifactHash
    || payload.receiptSchema !== context.receiptSchema
    || payload.lifecycleEventSchema !== context.lifecycleEventSchema
    || payload.lifecycleHeadSchema !== context.lifecycleHeadSchema
    || payload.reservedStatusSemanticCode
      !== "RESERVED_MEANS_CAPACITY_HELD_FOR_EXACT_TENDER_SCOPE") {
    fail("SEMANTICS_CONTEXT_BINDING_MISMATCH");
  }
  hash(payload.semanticsEvidenceRefHash, "SEMANTICS_EVIDENCE_REF_HASH");
  const validFrom = withinContext(payload.validFrom, context,
    "SEMANTICS_VALID_FROM");
  const validUntil = iso(payload.validUntil, "SEMANTICS_VALID_UNTIL");
  const issuedAt = withinContext(payload.issuedAt, context,
    "SEMANTICS_ISSUED_AT");
  if (DateParse(validUntil) <= DateParse(validFrom)
    || DateParse(validUntil) > DateParse(context.validUntil)
    || DateParse(issuedAt) > DateParse(validFrom)
    || DateParse(observedAt) < DateParse(validFrom)
    || DateParse(observedAt) >= DateParse(validUntil)) {
    fail("SEMANTICS_VALIDITY_NOT_CURRENT");
  }
  return payload;
}

const STANDING_PAYLOAD_FIELDS = ObjectFreeze([
  "schema", "sourceSystemId", "providerRefHash", "resourceOwnerRefHash",
  "discoveryRouteObjectHash", "discoveryCandidateHash",
  "scopeHash", "requirementKind", "requirementId", "requirementSetHash",
  "requirementObjectHash", "requirementClassCode", "requirementScopeRefHash",
  "quantity", "unitCode",
  "regionRefHash", "quantitySemantics", "validFrom",
  "validUntil", "issuedAt", "standingState", "standingEvidenceRefHash",
]);

function verifyStandingPayload(payload, context, response) {
  exactObject(payload, STANDING_PAYLOAD_FIELDS, "STANDING_PAYLOAD");
  if (payload.schema !== context.standingSchema
    || payload.sourceSystemId !== context.sourceSystemId
    || payload.providerRefHash !== response.providerRefHash
    || payload.discoveryRouteObjectHash !== response.discoveryRouteObjectHash
    || payload.discoveryCandidateHash !== response.discoveryCandidateHash
    || payload.scopeHash !== response.scopeHash
    || payload.requirementKind !== response.requirementKind
    || payload.requirementId !== response.requirementId
    || payload.requirementSetHash !== response.requirementSetHash
    || payload.requirementObjectHash !== response.requirementObjectHash
    || payload.requirementClassCode !== response.requirementClassCode
    || payload.requirementScopeRefHash !== response.requirementScopeRefHash
    || payload.quantity !== response.quantity
    || payload.unitCode !== response.unitCode
    || payload.regionRefHash !== response.regionRefHash
    || payload.quantitySemantics !== response.quantitySemantics
    || payload.standingState !== "SOURCE_DECLARED_ACTIVE") {
    fail("STANDING_SCOPE_BINDING_MISMATCH");
  }
  hash(payload.resourceOwnerRefHash, "RESOURCE_OWNER_REF_HASH");
  hash(payload.standingEvidenceRefHash, "STANDING_EVIDENCE_REF_HASH");
  const validFrom = withinContext(payload.validFrom, context,
    "STANDING_VALID_FROM");
  const validUntil = iso(payload.validUntil, "STANDING_VALID_UNTIL");
  const issuedAt = withinContext(payload.issuedAt, context,
    "STANDING_ISSUED_AT");
  if (DateParse(validUntil) <= DateParse(validFrom)
    || DateParse(validUntil) > DateParse(context.validUntil)
    || DateParse(issuedAt) > DateParse(validFrom)
    || DateParse(validFrom) > DateParse(response.serviceFrom)
    || DateParse(validUntil) < DateParse(response.serviceUntil)) {
    fail("STANDING_VALIDITY_DOES_NOT_COVER_RESPONSE");
  }
  return payload;
}

const RECEIPT_PAYLOAD_FIELDS = ObjectFreeze([
  "schema", "sourceSystemId", "sourceReceiptId", "lifecycleStreamId",
  "semanticsSourceHash", "standingSourceHash",
  "oneUseResponseHash", "tenderHash", "typedGraphHash", "episodeHash",
  "networkCompleteEpisodeJoinHash", "attemptHash", "providerRefHash",
  "discoveryRouteObjectHash", "discoveryCandidateHash",
  "scopeHash", "requirementKind", "requirementId", "requirementSetHash",
  "requirementObjectHash", "requirementClassCode", "requirementScopeRefHash",
  "quantity", "unitCode",
  "regionRefHash", "quantitySemantics",
  "reservedFrom", "reservedUntil", "issuedAt", "status",
]);

function verifyReceiptPayload(payload, context, response, semanticsSourceHash,
  standingSourceHash) {
  exactObject(payload, RECEIPT_PAYLOAD_FIELDS, "RECEIPT_PAYLOAD");
  if (payload.schema !== context.receiptSchema
    || payload.sourceSystemId !== context.sourceSystemId
    || payload.semanticsSourceHash !== semanticsSourceHash
    || payload.standingSourceHash !== standingSourceHash
    || payload.oneUseResponseHash !== response.initialResponseHash
    || payload.tenderHash !== response.tenderHash
    || payload.typedGraphHash !== response.typedGraphHash
    || payload.episodeHash !== response.episodeHash
    || payload.networkCompleteEpisodeJoinHash
      !== response.networkCompleteEpisodeJoinHash
    || payload.attemptHash !== response.attemptHash
    || payload.providerRefHash !== response.providerRefHash
    || payload.discoveryRouteObjectHash !== response.discoveryRouteObjectHash
    || payload.discoveryCandidateHash !== response.discoveryCandidateHash
    || payload.scopeHash !== response.scopeHash
    || payload.requirementKind !== response.requirementKind
    || payload.requirementId !== response.requirementId
    || payload.requirementSetHash !== response.requirementSetHash
    || payload.requirementObjectHash !== response.requirementObjectHash
    || payload.requirementClassCode !== response.requirementClassCode
    || payload.requirementScopeRefHash !== response.requirementScopeRefHash
    || payload.quantity !== response.quantity
    || payload.unitCode !== response.unitCode
    || payload.regionRefHash !== response.regionRefHash
    || payload.quantitySemantics !== response.quantitySemantics
    || payload.status !== "RESERVED") fail("RECEIPT_SCOPE_BINDING_MISMATCH");
  token(payload.sourceReceiptId, "SOURCE_RECEIPT_ID");
  token(payload.lifecycleStreamId, "LIFECYCLE_STREAM_ID");
  const reservedFrom = iso(payload.reservedFrom, "RECEIPT_RESERVED_FROM");
  const reservedUntil = iso(payload.reservedUntil, "RECEIPT_RESERVED_UNTIL");
  const issuedAt = withinContext(payload.issuedAt, context, "RECEIPT_ISSUED_AT");
  if (DateParse(reservedUntil) <= DateParse(reservedFrom)
    || DateParse(reservedFrom) > DateParse(response.serviceFrom)
    || DateParse(reservedUntil) < DateParse(response.serviceUntil)
    || DateParse(issuedAt) > DateParse(reservedFrom)) {
    fail("RECEIPT_CAPACITY_WINDOW_DOES_NOT_COVER_RESPONSE");
  }
  return payload;
}

const EVENT_PAYLOAD_FIELDS = ObjectFreeze([
  "schema", "sourceSystemId", "lifecycleStreamId", "receiptSourceHash",
  "oneUseResponseHash", "tenderHash", "providerRefHash", "scopeHash",
  "ordinal", "previousEventSourceHash", "eventState", "occurredAt",
  "occurrenceIdentityHash",
]);

function verifyEventPayload(payload, context, response, receipt, receiptHash,
  ordinal, previousEventHash, priorState) {
  exactObject(payload, EVENT_PAYLOAD_FIELDS, "LIFECYCLE_EVENT_PAYLOAD");
  if (payload.schema !== context.lifecycleEventSchema
    || payload.sourceSystemId !== context.sourceSystemId
    || payload.lifecycleStreamId !== receipt.lifecycleStreamId
    || payload.receiptSourceHash !== receiptHash
    || payload.oneUseResponseHash !== response.initialResponseHash
    || payload.tenderHash !== response.tenderHash
    || payload.providerRefHash !== response.providerRefHash
    || payload.scopeHash !== response.scopeHash
    || payload.ordinal !== ordinal
    || payload.previousEventSourceHash !== previousEventHash) {
    fail("LIFECYCLE_EVENT_CHAIN_OR_BINDING_MISMATCH");
  }
  hash(payload.occurrenceIdentityHash, "EVENT_OCCURRENCE_IDENTITY_HASH");
  const eventState = allowed(payload.eventState,
    OUTSIDER_EXTERNAL_CAPACITY_LIFECYCLE_STATES_V1, "EVENT_STATE");
  const occurredAt = withinContext(payload.occurredAt, context,
    "EVENT_OCCURRED_AT");
  if (ordinal === 1) {
    if (eventState !== "RESERVED" || priorState !== null
      || DateParse(occurredAt) < DateParse(receipt.issuedAt)) {
      fail("LIFECYCLE_GENESIS_EVENT_INVALID");
    }
  } else if (priorState !== "RESERVED"
    || eventState !== "REVOKED" && eventState !== "EXPIRED") {
    fail("LIFECYCLE_TRANSITION_INVALID");
  }
  if (eventState === "EXPIRED"
    && DateParse(occurredAt) < DateParse(receipt.reservedUntil)) {
    fail("LIFECYCLE_EXPIRY_PRECEDES_RESERVATION_END");
  }
  return { state: eventState, occurredAt };
}

const HEAD_PAYLOAD_FIELDS = ObjectFreeze([
  "schema", "sourceSystemId", "lifecycleStreamId", "receiptSourceHash",
  "oneUseResponseHash", "tenderHash", "providerRefHash", "scopeHash",
  "eventCount", "coveredFromOrdinal", "coveredToOrdinal",
  "headEventSourceHash", "currentState", "observedAt", "occurrencePolicy",
]);

function externalCapacityFailure(error) {
  const message = error instanceof Error
    && RegExpTest(/^OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_[A-Z0-9_]+$/u,
      StringConstructor(error.message))
    ? error.message : `${PREFIX}UNTRUSTED_FAILURE`;
  return deepFreeze({
    schema:
      OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.capacityVerification,
    ok: false,
    tenderAndResponseSourcesReplayed: false,
    verifierContextSourceRebuiltAndPinned: false,
    rightsPrivacyPolicySourceReplayed: false,
    rightsEstablished: false,
    privacyEstablished: false,
    exactSourceSemanticsBytesReplayed: false,
    sourceSemanticsSignatureVerified: false,
    reservedStatusSemanticsCurrent: false,
    exactOwnerStandingBytesReplayed: false,
    ownerStandingClaimSigned: false,
    ownerStandingClaimCoversScopeAndInterval: false,
    ownerStandingClaimCurrentAtObservedAt: false,
    exactExternalReceiptBytesReplayed: false,
    receiptSignatureVerifiedForPinnedSource: false,
    receiptScopeQuantityTimeAndProviderCovered: false,
    externalLifecycleEventsReplayed: false,
    externalOccurrenceDenominatorReplayed: false,
    signedLifecycleHeadReplayedAndPinned: false,
    lifecycleHeadFreshAtObservedAt: false,
    nonRevocationAtPinnedHeadEstablished: false,
    externalTransparencyAnchorEstablished: false,
    sourceNonEquivocationEstablished: false,
    sourceCompletenessBeyondPinnedHeadEstablished: false,
    sourceBundleCryptographicallyConsistent: false,
    sourceDeclaredReservationCurrent: false,
    independentResourceOwnerTrustAnchorReplayed: false,
    trustAnchorUnestablished: true,
    externalCapacityEstablished: false,
    capacityReserved: false,
    providerLegalIdentityEstablished: false,
    authorityEstablished: false,
    pricePresent: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: message,
    boundary: OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_BOUNDARY,
  });
}

const CAPACITY_VERIFY_INPUT_FIELDS = ObjectFreeze([
  "tender", "expectedTenderHash", "responses", "responseOccurrences",
  "expectedResponseOccurrenceCount", "expectedResponseLifecycleHeadHash",
  "verifierContext", "expectedVerifierContextHash", "semanticsSourceBytes",
  "expectedSemanticsSourceHash", "standingSourceBytes",
  "expectedStandingSourceHash", "receiptSourceBytes", "expectedReceiptSourceHash",
  "lifecycleEventSourceBytes",
  "lifecycleHeadSourceBytes", "expectedLifecycleHeadSourceHash", "observedAt",
]);

export function verifyExternalCapacityReceiptLifecycleV1(input = {}) {
  try {
    exactObject(input, CAPACITY_VERIFY_INPUT_FIELDS, "CAPACITY_VERIFY_INPUT");
    const response = verifyOneUseTenderResponseLifecycleV1({
      tender: input.tender,
      expectedTenderHash: input.expectedTenderHash,
      responses: input.responses,
      occurrences: input.responseOccurrences,
      expectedOccurrenceCount: input.expectedResponseOccurrenceCount,
      expectedLifecycleHeadHash: input.expectedResponseLifecycleHeadHash,
      observedAt: input.observedAt,
    });
    if (!response.ok) fail("RESPONSE_LIFECYCLE_SOURCE_REPLAY_FAILED");
    const contextCheck = verifyExternalCapacityVerifierContextV1(
      input.verifierContext,
      { expectedVerifierContextHash: input.expectedVerifierContextHash });
    if (!contextCheck.ok) fail("VERIFIER_CONTEXT_SOURCE_REPLAY_FAILED");
    const context = contextCheck.context;
    const observedAt = iso(input.observedAt, "CAPACITY_OBSERVED_AT");

    const semanticsSource = canonicalSourceEnvelope(input.semanticsSourceBytes,
      "SEMANTICS_SOURCE");
    if (semanticsSource.byteHash !== hash(input.expectedSemanticsSourceHash,
      "EXPECTED_SEMANTICS_SOURCE_HASH")) {
      fail("SEMANTICS_SOURCE_PIN_MISMATCH");
    }
    const semantics = verifySemanticsPayload(semanticsSource.value.payload,
      context, observedAt);
    strictSignature(semanticsSource.value.signature, context, "SEMANTICS",
      semantics);

    const standingSource = canonicalSourceEnvelope(input.standingSourceBytes,
      "STANDING_SOURCE");
    if (standingSource.byteHash !== hash(input.expectedStandingSourceHash,
      "EXPECTED_STANDING_SOURCE_HASH")) {
      fail("STANDING_SOURCE_PIN_MISMATCH");
    }
    const standing = verifyStandingPayload(standingSource.value.payload,
      context, response);
    strictSignature(standingSource.value.signature, context, "STANDING",
      standing);

    const receiptSource = canonicalSourceEnvelope(input.receiptSourceBytes,
      "RECEIPT_SOURCE");
    if (receiptSource.byteHash !== hash(input.expectedReceiptSourceHash,
      "EXPECTED_RECEIPT_SOURCE_HASH")) fail("RECEIPT_SOURCE_PIN_MISMATCH");
    const receipt = verifyReceiptPayload(receiptSource.value.payload, context,
      response, semanticsSource.byteHash, standingSource.byteHash);
    strictSignature(receiptSource.value.signature, context, "RECEIPT", receipt);
    if (DateParse(receipt.issuedAt) > DateParse(observedAt)) {
      fail("RECEIPT_FROM_FUTURE");
    }
    if (DateParse(standing.validFrom) > DateParse(receipt.reservedFrom)
      || DateParse(standing.validUntil) < DateParse(receipt.reservedUntil)) {
      fail("STANDING_CLAIM_DOES_NOT_COVER_RECEIPT_WINDOW");
    }
    const ownerStandingClaimCurrentAtObservedAt
      = DateParse(standing.validFrom) <= DateParse(observedAt)
        && DateParse(observedAt) < DateParse(standing.validUntil);

    const eventBytes = denseArray(input.lifecycleEventSourceBytes,
      "LIFECYCLE_EVENT_SOURCE_BYTES", MAX_EXTERNAL_EVENTS);
    let totalEventBytes = 0;
    let previousEventHash = OUTSIDER_EXTERNAL_CAPACITY_EVENT_GENESIS_V1;
    let currentState = null;
    let lastOccurredAt = null;
    const occurrenceIds = new SetConstructor();
    for (let index = 0; index < eventBytes.length; index += 1) {
      if (!BufferIsBuffer(eventBytes[index])) fail("EVENT_SOURCE_NOT_BYTES");
      totalEventBytes += eventBytes[index].length;
      if (totalEventBytes > MAX_TOTAL_EVENT_SOURCE_BYTES) {
        fail("EVENT_SOURCE_TOTAL_BYTES_EXCEEDED");
      }
      const eventSource = canonicalSourceEnvelope(eventBytes[index],
        "LIFECYCLE_EVENT_SOURCE");
      const event = verifyEventPayload(eventSource.value.payload, context,
        response, receipt, receiptSource.byteHash, index + 1,
        previousEventHash, currentState);
      strictSignature(eventSource.value.signature, context, "LIFECYCLE_EVENT",
        eventSource.value.payload);
      if (SetHas(occurrenceIds,
        eventSource.value.payload.occurrenceIdentityHash)) {
        fail("EXTERNAL_EVENT_OCCURRENCE_REPLAY_DETECTED");
      }
      SetAdd(occurrenceIds, eventSource.value.payload.occurrenceIdentityHash);
      if (lastOccurredAt !== null
        && DateParse(event.occurredAt) < DateParse(lastOccurredAt)) {
        fail("EXTERNAL_EVENT_TIME_ROLLBACK");
      }
      currentState = event.state;
      lastOccurredAt = event.occurredAt;
      previousEventHash = eventSource.byteHash;
    }

    const headSource = canonicalSourceEnvelope(input.lifecycleHeadSourceBytes,
      "LIFECYCLE_HEAD_SOURCE");
    if (headSource.byteHash !== hash(input.expectedLifecycleHeadSourceHash,
      "EXPECTED_LIFECYCLE_HEAD_SOURCE_HASH")) {
      fail("LIFECYCLE_HEAD_SOURCE_PIN_MISMATCH");
    }
    const head = headSource.value.payload;
    exactObject(head, HEAD_PAYLOAD_FIELDS, "LIFECYCLE_HEAD_PAYLOAD");
    if (head.schema !== context.lifecycleHeadSchema
      || head.sourceSystemId !== context.sourceSystemId
      || head.lifecycleStreamId !== receipt.lifecycleStreamId
      || head.receiptSourceHash !== receiptSource.byteHash
      || head.oneUseResponseHash !== response.initialResponseHash
      || head.tenderHash !== response.tenderHash
      || head.providerRefHash !== response.providerRefHash
      || head.scopeHash !== response.scopeHash
      || head.eventCount !== eventBytes.length
      || head.coveredFromOrdinal !== 1
      || head.coveredToOrdinal !== eventBytes.length
      || head.headEventSourceHash !== previousEventHash
      || head.currentState !== currentState
      || head.occurrencePolicy
        !== "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR") {
      fail("LIFECYCLE_HEAD_DENOMINATOR_OR_BINDING_MISMATCH");
    }
    const headObservedAt = withinContext(head.observedAt, context,
      "LIFECYCLE_HEAD_OBSERVED_AT");
    if (DateParse(headObservedAt) < DateParse(lastOccurredAt)
      || DateParse(headObservedAt) > DateParse(observedAt)
      || DateParse(observedAt) - DateParse(headObservedAt)
        > context.maximumLifecycleHeadAgeMs) {
      fail("LIFECYCLE_HEAD_TIME_INVALID");
    }
    strictSignature(headSource.value.signature, context, "LIFECYCLE_HEAD", head);

    const nonRevoked = currentState === "RESERVED";
    const withinReservationWindow = DateParse(receipt.reservedFrom)
      <= DateParse(observedAt)
      && DateParse(observedAt) < DateParse(receipt.reservedUntil);
    const sourceDeclaredReservationCurrent
      = response.currentCallerDeclaredOneUseOfferReference
      && nonRevoked && withinReservationWindow
      && ownerStandingClaimCurrentAtObservedAt;
    /* A caller-constructible context and its source key do not independently
       prove resource-owner standing. The present repository has no replayable
       owner trust registry for this provider-neutral contract, so capacity
       must remain false even when the complete source bundle is internally
       consistent. */
    const independentResourceOwnerTrustAnchorReplayed = false;
    const capacityReserved = false;
    const body = {
      schema:
        OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.capacityVerification,
      ok: true,
      tenderHash: response.tenderHash,
      typedGraphHash: response.typedGraphHash,
      episodeHash: response.episodeHash,
      attemptHash: response.attemptHash,
      oneUseResponseHash: response.initialResponseHash,
      responseLifecycleHeadHash: response.lifecycleHeadHash,
      providerRefHash: response.providerRefHash,
      discoveryRouteObjectHash: response.discoveryRouteObjectHash,
      discoveryCandidateHash: response.discoveryCandidateHash,
      scopeHash: response.scopeHash,
      requirementKind: response.requirementKind,
      requirementId: response.requirementId,
      requirementSetHash: response.requirementSetHash,
      requirementObjectHash: response.requirementObjectHash,
      requirementClassCode: response.requirementClassCode,
      requirementScopeRefHash: response.requirementScopeRefHash,
      quantity: response.quantity,
      unitCode: response.unitCode,
      regionRefHash: response.regionRefHash,
      dueBy: response.dueBy,
      quantitySemantics: response.quantitySemantics,
      evidencePlanHash: response.evidencePlanHash,
      remedyPlanHash: response.remedyPlanHash,
      verifierContextHash: context.verifierContextHash,
      semanticsSourceHash: semanticsSource.byteHash,
      standingSourceHash: standingSource.byteHash,
      receiptSourceHash: receiptSource.byteHash,
      lifecycleHeadSourceHash: headSource.byteHash,
      sourceSystemId: context.sourceSystemId,
      lifecycleStreamId: receipt.lifecycleStreamId,
      externalLifecycleState: currentState,
      responseOccurrenceCount: response.responseOccurrenceCount,
      externalLifecycleOccurrenceCount: eventBytes.length,
      exactExternalSourceByteCount:
        semanticsSource.bytes.length + standingSource.bytes.length
          + receiptSource.bytes.length + totalEventBytes + headSource.bytes.length,
      tenderAndResponseSourcesReplayed: true,
      verifierContextSourceRebuiltAndPinned: true,
      sourceSpecificVerifierRevisionPinned: true,
      rightsPrivacyPolicySourceReplayed: false,
      rightsEstablished: false,
      privacyEstablished: false,
      exactSourceSemanticsBytesReplayed: true,
      sourceSemanticsSignatureVerified: true,
      reservedStatusSemanticsCurrent: true,
      exactOwnerStandingBytesReplayed: true,
      ownerStandingClaimSigned: true,
      ownerStandingClaimCoversScopeAndInterval: true,
      ownerStandingClaimCurrentAtObservedAt,
      ownerStandingClaimIsIndependentTrustAnchor: false,
      exactExternalReceiptBytesReplayed: true,
      receiptSignatureVerifiedForPinnedSource: true,
      receiptScopeQuantityTimeAndProviderCovered: true,
      externalLifecycleEventsReplayed: true,
      externalOccurrenceDenominatorReplayed: true,
      objectDedupReducedOccurrenceDenominator: false,
      signedLifecycleHeadReplayedAndPinned: true,
      lifecycleHeadFreshAtObservedAt: true,
      nonRevocationAtPinnedHeadEstablished: nonRevoked,
      externalTransparencyAnchorEstablished: false,
      sourceNonEquivocationEstablished: false,
      sourceCompletenessBeyondPinnedHeadEstablished: false,
      reservationWindowCurrent: withinReservationWindow,
      sourceBundleCryptographicallyConsistent: true,
      sourceDeclaredReservationCurrent,
      independentResourceOwnerTrustAnchorReplayed,
      trustAnchorUnestablished: true,
      externalCapacityEstablished: capacityReserved,
      capacityReserved,
      capacityTruthScope:
        sourceDeclaredReservationCurrent
          ? "NONE_SOURCE_DECLARATION_CURRENT_INDEPENDENT_OWNER_TRUST_ANCHOR_UNESTABLISHED"
          : "NONE_EXTERNAL_LIFECYCLE_OR_RESPONSE_NOT_CURRENT",
      responseOrSignatureEstablishedProviderIdentity: false,
      providerLegalIdentityEstablished: false,
      responseOrSignatureEstablishedAuthority: false,
      authorityEstablished: false,
      pricePresent: false,
      pricingPerformed: false,
      guaranteeEstablished: false,
      settlementPermitted: false,
      humanFallbackAllowed: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      enabledCapabilityCount: 0,
      provenAuthorityCount: 0,
      enabledCapabilitiesSubsetOfProvenAuthority: true,
      consequenceReach: "NONE",
      error: null,
      boundary: OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_BOUNDARY,
    };
    return deepFreeze({ ...body, verificationHash: digestObject(
      OUTSIDER_ONE_USE_TENDER_RESPONSE_LIFECYCLE_V1_SCHEMAS.capacityVerification,
      body) });
  } catch (error) {
    return externalCapacityFailure(error);
  }
}

export const createOneUseTenderResponseV1
  = createInitialOneUseTenderResponseV1;
export const supersedeOneUseTenderResponseV1
  = createOneUseTenderResponseDescendantV1;
export const verifyOneUseTenderResponseAndCapacityV1
  = verifyExternalCapacityReceiptLifecycleV1;
