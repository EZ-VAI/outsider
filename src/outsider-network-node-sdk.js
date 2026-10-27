/*
 * Outsider network Node SDK conformance projection.
 *
 * This module deliberately does not define another actor, delegation, episode,
 * or transport schema.  A node must replay an existing Network Intake
 * manifest and its exact hash-only lane payload.  The remaining fields are
 * declarations about adapters and references to vendor-native safety evidence.
 * They prove compatibility with quarantine transport only.
 */

import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  NETWORK_INTAKE_BOUNDARY,
  networkIntakeDigest,
  verifyNetworkIntakeManifest,
} from "./outsider-network-intake.js";
import {
  verifyProviderPatternReviewProjection,
} from "./outsider-provider-pattern-registry.js";

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const JSONParse = JSON.parse;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
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
const StringConstructor = String;
const ErrorConstructor = Error;
const TypeErrorConstructor = TypeError;

export const OUTSIDER_NETWORK_NODE_SDK_SCHEMAS = ObjectFreeze({
  source: "outsider/network-node-sdk-source/v1",
  conformance: "outsider/network-node-sdk-conformance/v1",
  verification: "outsider/network-node-sdk-verification/v1",
});

export const OUTSIDER_NETWORK_NODE_ADAPTER_KINDS = ObjectFreeze([
  "ACTOR_IDENTITY",
  "COMMAND_EFFECT",
  "DELEGATION_RESPONSIBILITY",
  "OBLIGATION_LIFECYCLE",
  "OUTCOME_RECOVERY",
  "PROSPECTIVE_CENSUS",
]);

export const OUTSIDER_NETWORK_NODE_ADAPTER_STATUSES = ObjectFreeze([
  "DECLARED_UNVERIFIED",
  "NOT_AVAILABLE",
  "NOT_APPLICABLE_FOR_LANE",
]);

export const OUTSIDER_NETWORK_NODE_SDK_BOUNDARY = deepFreeze({
  positioning:
    "CROSS_VENDOR_EVIDENCE_RESPONSIBILITY_NETWORK_NOT_VENDOR_NATIVE_SAFETY_CONTROLLER",
  disposition: "QUARANTINED",
  compatibilityOnly: true,
  sourceReplayRequired: true,
  vendorNativeSafetyRefsAreEvidenceReferencesOnly: true,
  vendorSafetyEffectivenessEstablished: false,
  actorIdentityEstablished: false,
  identityContinuityEstablished: false,
  delegationAuthorityEstablished: false,
  outcomeTruthEstablished: false,
  causalAttributionEstablished: false,
  obligationClosureEstablished: false,
  automaticTraining: false,
  trainingRows: 0,
  permitsCuratePromotion: false,
  authority: "NONE",
  actionReady: false,
  executable: false,
  causalExperienceUnits: 0,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
  productionReady: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const SCHEMA_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/@-]{0,255}$/u;
const CONTROL_CLASS = /^[A-Z][A-Z0-9_]{0,127}$/u;
const MAX_SAFETY_REFS = 128;

const REQUIRED_BY_LANE = deepFreeze({
  DELEGATION_RESPONSIBILITY: ["ACTOR_IDENTITY", "DELEGATION_RESPONSIBILITY"],
  ACTION_OUTCOME: ["ACTOR_IDENTITY", "COMMAND_EFFECT", "OUTCOME_RECOVERY",
    "OBLIGATION_LIFECYCLE"],
  PROSPECTIVE_CENSUS: ["PROSPECTIVE_CENSUS"],
});

function fail(code) {
  throw new TypeErrorConstructor(`OUTSIDER_NETWORK_NODE_SDK_${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, writable: true, enumerable: true, configurable: true,
  });
  return array;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)) return value;
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return ObjectFreeze(value);
}

function rejectProxyAccessorTree(value, seen = new SetConstructor(), depth = 0) {
  if (value === null || typeof value !== "object") return;
  if (depth > 96) fail("VALUE_TOO_DEEP");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (SetHas(seen, value)) fail("SHARED_OR_CYCLIC_OBJECT_FORBIDDEN");
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")) fail("ACCESSOR_FORBIDDEN");
    rejectProxyAccessorTree(descriptor.value, seen, depth + 1);
  }
  SetDelete(seen, value);
}

function canonicalClone(value) {
  rejectProxyAccessorTree(value);
  return deepFreeze(JSONParse(canonicalizeStrict(value)));
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) fail(`${code}_OBJECT_INVALID`);
  const keys = ReflectOwnKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, fields[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function denseArray(value, code, maximum, exactLength = null) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum || (exactLength !== null && value.length !== exactLength)) {
    fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_DENSE_ARRAY_REQUIRED`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function nullableSchema(value, code) {
  if (value === null) return null;
  if (typeof value !== "string" || !RegExpTest(SCHEMA_TOKEN, value)) fail(`${code}_INVALID`);
  return value;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function includes(values, candidate) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === candidate) return true;
  }
  return false;
}

function normalizeAdapterDeclarations(value, lane) {
  denseArray(value, "ADAPTER_DECLARATIONS", OUTSIDER_NETWORK_NODE_ADAPTER_KINDS.length,
    OUTSIDER_NETWORK_NODE_ADAPTER_KINDS.length);
  const normalized = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["kind", "status", "artifactSchema", "adapterImplementationHash",
      "conformanceEvidenceRefHash"], "ADAPTER_DECLARATION");
    if (!includes(OUTSIDER_NETWORK_NODE_ADAPTER_KINDS, row.kind)) {
      fail("ADAPTER_KIND_INVALID");
    }
    if (!includes(OUTSIDER_NETWORK_NODE_ADAPTER_STATUSES, row.status)) {
      fail("ADAPTER_STATUS_INVALID");
    }
    const declared = row.status === "DECLARED_UNVERIFIED";
    const artifactSchema = nullableSchema(row.artifactSchema, "ADAPTER_ARTIFACT_SCHEMA");
    const adapterImplementationHash = nullableHash(row.adapterImplementationHash,
      "ADAPTER_IMPLEMENTATION_HASH");
    const conformanceEvidenceRefHash = nullableHash(row.conformanceEvidenceRefHash,
      "ADAPTER_CONFORMANCE_EVIDENCE_REF_HASH");
    if (declared !== (artifactSchema !== null && adapterImplementationHash !== null
      && conformanceEvidenceRefHash !== null)) {
      fail("ADAPTER_DECLARATION_REFERENCE_STATE_INVALID");
    }
    if (!declared && (artifactSchema !== null || adapterImplementationHash !== null
      || conformanceEvidenceRefHash !== null)) {
      fail("ADAPTER_NON_DECLARED_REFERENCES_MUST_BE_NULL");
    }
    if (row.status === "NOT_APPLICABLE_FOR_LANE"
      && includes(REQUIRED_BY_LANE[lane], row.kind)) {
      fail("REQUIRED_LANE_ADAPTER_CANNOT_BE_NOT_APPLICABLE");
    }
    append(normalized, { kind: row.kind, status: row.status, artifactSchema,
      adapterImplementationHash, conformanceEvidenceRefHash });
  }
  ArraySort(normalized, (left, right) => left.kind < right.kind ? -1
    : left.kind > right.kind ? 1 : 0);
  for (let index = 0; index < OUTSIDER_NETWORK_NODE_ADAPTER_KINDS.length; index += 1) {
    if (normalized[index].kind !== OUTSIDER_NETWORK_NODE_ADAPTER_KINDS[index]) {
      fail("ALL_SIX_ADAPTER_ROWS_REQUIRED_EXACTLY_ONCE");
    }
  }
  return normalized;
}

function normalizeNativeSafetyEvidenceRefs(value) {
  denseArray(value, "NATIVE_SAFETY_EVIDENCE_REFS", MAX_SAFETY_REFS);
  const normalized = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["controlClass", "vendorEvidenceRefHash", "referenceSemantics",
      "effectivenessEstablished", "outsiderAuthorityEstablished"],
    "NATIVE_SAFETY_EVIDENCE_REF");
    if (typeof row.controlClass !== "string"
      || !RegExpTest(CONTROL_CLASS, row.controlClass)) fail("CONTROL_CLASS_INVALID");
    if (row.referenceSemantics !== "VENDOR_NATIVE_SAFETY_EVIDENCE_REFERENCE_ONLY"
      || row.effectivenessEstablished !== false
      || row.outsiderAuthorityEstablished !== false) {
      fail("NATIVE_SAFETY_REFERENCE_MUST_REMAIN_EVIDENCE_ONLY");
    }
    append(normalized, { controlClass: row.controlClass,
      vendorEvidenceRefHash: hash(row.vendorEvidenceRefHash, "VENDOR_EVIDENCE_REF_HASH"),
      referenceSemantics: "VENDOR_NATIVE_SAFETY_EVIDENCE_REFERENCE_ONLY",
      effectivenessEstablished: false, outsiderAuthorityEstablished: false });
  }
  ArraySort(normalized, (left, right) => left.controlClass < right.controlClass ? -1
    : left.controlClass > right.controlClass ? 1
      : left.vendorEvidenceRefHash < right.vendorEvidenceRefHash ? -1
        : left.vendorEvidenceRefHash > right.vendorEvidenceRefHash ? 1 : 0);
  for (let index = 1; index < normalized.length; index += 1) {
    if (normalized[index].controlClass === normalized[index - 1].controlClass
      && normalized[index].vendorEvidenceRefHash
        === normalized[index - 1].vendorEvidenceRefHash) {
      fail("NATIVE_SAFETY_EVIDENCE_REF_DUPLICATE");
    }
  }
  return normalized;
}

function checkedManifest(record, payload) {
  const checked = verifyNetworkIntakeManifest(record, { payload });
  if (!checked.ok) fail(`NETWORK_MANIFEST_INVALID:${checked.error}`);
  return canonicalClone(record);
}

function checkedProviderReview(record) {
  if (record === null) return null;
  const checked = verifyProviderPatternReviewProjection(record);
  if (!checked.ok) fail(`PROVIDER_PATTERN_REVIEW_INVALID:${checked.error}`);
  return canonicalClone(record);
}

function sourceBody(input) {
  exactObject(input, ["sdkReleaseHash", "nodeSoftwareRevisionHash",
    "providerPatternReview", "networkManifest", "payload", "adapterDeclarations",
    "nativeSafetyEvidenceRefs"], "SOURCE_INPUT");
  const networkManifest = checkedManifest(input.networkManifest, input.payload);
  const payload = canonicalClone(input.payload);
  const lane = networkManifest.lane;
  const adapterDeclarations = normalizeAdapterDeclarations(input.adapterDeclarations, lane);
  return {
    schema: OUTSIDER_NETWORK_NODE_SDK_SCHEMAS.source,
    schemaVersion: "1.0.0",
    sourceClass: "NODE_ADAPTER_REFERENCE_DECLARATION_QUARANTINE_ONLY",
    sdkReleaseHash: hash(input.sdkReleaseHash, "SDK_RELEASE_HASH"),
    nodeSoftwareRevisionHash: hash(input.nodeSoftwareRevisionHash,
      "NODE_SOFTWARE_REVISION_HASH"),
    providerPatternReview: checkedProviderReview(input.providerPatternReview),
    networkManifest,
    payload,
    adapterDeclarations,
    nativeSafetyEvidenceRefs: normalizeNativeSafetyEvidenceRefs(
      input.nativeSafetyEvidenceRefs),
    boundary: OUTSIDER_NETWORK_NODE_SDK_BOUNDARY,
  };
}

export function createOutsiderNetworkNodeSdkSource(input = {}) {
  rejectProxyAccessorTree(input);
  canonicalizeStrict(input);
  const body = sourceBody(input);
  return deepFreeze({ ...body, sourceHash: networkIntakeDigest(
    OUTSIDER_NETWORK_NODE_SDK_SCHEMAS.source, body) });
}

function sourceInput(source) {
  return {
    sdkReleaseHash: source.sdkReleaseHash,
    nodeSoftwareRevisionHash: source.nodeSoftwareRevisionHash,
    providerPatternReview: source.providerPatternReview,
    networkManifest: source.networkManifest,
    payload: source.payload,
    adapterDeclarations: source.adapterDeclarations,
    nativeSafetyEvidenceRefs: source.nativeSafetyEvidenceRefs,
  };
}

function replaySource(source, expectedSourceHash) {
  rejectProxyAccessorTree(source);
  canonicalizeStrict(source);
  exactObject(source, ["schema", "schemaVersion", "sourceClass", "sdkReleaseHash",
    "nodeSoftwareRevisionHash", "providerPatternReview", "networkManifest", "payload",
    "adapterDeclarations", "nativeSafetyEvidenceRefs", "boundary", "sourceHash"],
  "SOURCE");
  if (source.schema !== OUTSIDER_NETWORK_NODE_SDK_SCHEMAS.source
    || source.schemaVersion !== "1.0.0"
    || source.sourceClass !== "NODE_ADAPTER_REFERENCE_DECLARATION_QUARANTINE_ONLY"
    || !same(source.boundary, OUTSIDER_NETWORK_NODE_SDK_BOUNDARY)) {
    fail("SOURCE_STATE_INVALID");
  }
  const rebuilt = createOutsiderNetworkNodeSdkSource(sourceInput(source));
  if (!same(source, rebuilt)) fail("SOURCE_REPLAY_INVALID");
  if (rebuilt.sourceHash !== hash(expectedSourceHash, "EXPECTED_SOURCE_HASH")) {
    fail("EXPECTED_SOURCE_HASH_MISMATCH");
  }
  return rebuilt;
}

function coverageDeclaration(source) {
  let declaredUnverified = 0;
  let notAvailable = 0;
  let notApplicableForLane = 0;
  let laneMinimumAdapterReferencesDeclared = true;
  let completeEpisodeAdapterSetDeclared = true;
  const required = REQUIRED_BY_LANE[source.networkManifest.lane];
  for (let index = 0; index < source.adapterDeclarations.length; index += 1) {
    const row = source.adapterDeclarations[index];
    if (row.status === "DECLARED_UNVERIFIED") declaredUnverified += 1;
    else {
      completeEpisodeAdapterSetDeclared = false;
      if (row.status === "NOT_AVAILABLE") notAvailable += 1;
      else notApplicableForLane += 1;
    }
    if (includes(required, row.kind) && row.status !== "DECLARED_UNVERIFIED") {
      laneMinimumAdapterReferencesDeclared = false;
    }
  }
  return {
    totalExplicitAdapterRows: OUTSIDER_NETWORK_NODE_ADAPTER_KINDS.length,
    declaredUnverified,
    notAvailable,
    notApplicableForLane,
    laneMinimumAdapterReferencesDeclared,
    completeEpisodeAdapterSetDeclared,
    adapterFunctionalityVerified: false,
    completeEpisodeCaptureVerified: false,
  };
}

function conformanceBody(source) {
  const providerPatternReviewRef = source.providerPatternReview === null ? null : {
    registryHash: source.providerPatternReview.registryHash,
    entityId: source.providerPatternReview.entityId,
    projectionHash: source.providerPatternReview.projectionHash,
    semantics: "CONSERVATIVE_REQUIREMENTS_REFERENCE_NOT_CONTROL_OR_COVERAGE_PROOF",
  };
  const coverage = coverageDeclaration(source);
  return {
    schema: OUTSIDER_NETWORK_NODE_SDK_SCHEMAS.conformance,
    schemaVersion: "1.0.0",
    conformanceClass: "QUARANTINE_TRANSPORT_COMPATIBILITY_ONLY",
    sourceHash: source.sourceHash,
    sdkReleaseHash: source.sdkReleaseHash,
    nodeSoftwareRevisionHash: source.nodeSoftwareRevisionHash,
    networkProjection: {
      lane: source.networkManifest.lane,
      payloadSchema: source.networkManifest.payloadSchema,
      manifestHash: source.networkManifest.manifestHash,
      objectIdentityHash: source.networkManifest.payload.objectIdentityHash,
      occurrenceIdentityHash: source.networkManifest.occurrenceIdentityHash,
      typedSubject: source.networkManifest.subject,
      quarantineBoundary: NETWORK_INTAKE_BOUNDARY,
    },
    providerPatternReviewRef,
    adapterDeclarations: source.adapterDeclarations,
    nativeSafetyEvidenceRefs: source.nativeSafetyEvidenceRefs,
    coverageDeclaration: coverage,
    compatibilityChecks: {
      networkManifestAndExactPayloadReplayed: true,
      typedSubjectReusedFromNetworkManifest: true,
      allSixAdapterRowsExplicit: true,
      nativeSafetyReferencesRemainVendorEvidenceOnly: true,
      providerPatternReviewReplayed: source.providerPatternReview !== null,
      adapterFunctionalityVerified: false,
      vendorSafetyEffectivenessEstablished: false,
    },
    compatibilityResult: coverage.laneMinimumAdapterReferencesDeclared
      ? "QUARANTINE_TRANSPORT_COMPATIBLE_DECLARATIONS_UNVERIFIED"
      : "QUARANTINE_TRANSPORT_COMPATIBLE_ADAPTER_GAPS_DECLARED",
    decision: "HOLD",
    boundary: OUTSIDER_NETWORK_NODE_SDK_BOUNDARY,
  };
}

export function buildOutsiderNetworkNodeConformance(source) {
  rejectProxyAccessorTree(source);
  const sourceHashDescriptor = source === null || typeof source !== "object"
    ? null : ObjectGetOwnPropertyDescriptor(source, "sourceHash");
  if (!sourceHashDescriptor || !ObjectHasOwn(sourceHashDescriptor, "value")) {
    fail("SOURCE_HASH_REQUIRED");
  }
  const checked = replaySource(source, sourceHashDescriptor.value);
  const body = conformanceBody(checked);
  return deepFreeze({ ...body, conformanceHash: networkIntakeDigest(
    OUTSIDER_NETWORK_NODE_SDK_SCHEMAS.conformance, body) });
}

function verificationFailure(error) {
  return deepFreeze({
    schema: OUTSIDER_NETWORK_NODE_SDK_SCHEMAS.verification,
    ok: false,
    sourceReplayComplete: false,
    compatibilityOnly: true,
    conformanceHash: null,
    decision: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    error: error instanceof ErrorConstructor ? error.message : StringConstructor(error),
    boundary: OUTSIDER_NETWORK_NODE_SDK_BOUNDARY,
  });
}

export function verifyOutsiderNetworkNodeConformance(record, context = {}) {
  try {
    rejectProxyAccessorTree(record);
    canonicalizeStrict(record);
    rejectProxyAccessorTree(context);
    exactObject(context, ["source", "expectedSourceHash", "expectedConformanceHash"],
      "VERIFY_CONTEXT");
    const source = replaySource(context.source, context.expectedSourceHash);
    const expected = buildOutsiderNetworkNodeConformance(source);
    if (!same(record, expected)) fail("CONFORMANCE_REPLAY_INVALID");
    if (expected.conformanceHash !== hash(context.expectedConformanceHash,
      "EXPECTED_CONFORMANCE_HASH")) fail("EXPECTED_CONFORMANCE_HASH_MISMATCH");
    return deepFreeze({
      schema: OUTSIDER_NETWORK_NODE_SDK_SCHEMAS.verification,
      ok: true,
      sourceReplayComplete: true,
      compatibilityOnly: true,
      conformanceHash: expected.conformanceHash,
      decision: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      boundary: OUTSIDER_NETWORK_NODE_SDK_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure(error);
  }
}
