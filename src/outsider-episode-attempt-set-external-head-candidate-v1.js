/*
 * Private, HOLD-only intake for a future externally observed Attempt-set head.
 *
 * This module deliberately has no transport and no trust-policy input. It
 * freshly replays one local v2 Attempt-set registry, prepares a digest-only
 * subject request, and can encode exact caller-supplied candidate artifact
 * bytes in the returned in-memory record for later review. Caller-supplied
 * bytes, hashes, media types, local
 * timestamps, and expected-head tokens are never external provenance. An
 * opaque artifact is not treated as a provider response, a cryptographic
 * anchor, durable storage, an independent pin, or non-equivocation evidence.
 *
 * A future successor may consume this exact-byte candidate only after a
 * separately governed acquisition path supplies independently obtained bytes,
 * independently sourced trust material, subject-binding verification, and
 * durability/non-equivocation evidence. Nothing here performs a network write
 * or upgrades Stage 1.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyEpisodeAttemptSetLocalHeadV2,
} from "./outsider-episode-attempt-set-local-head-v2.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const BufferByteLength = Buffer.byteLength;
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferPrototype = Buffer.prototype;
const IntrinsicTypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const TypedArrayLength = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(IntrinsicTypedArrayPrototype, "length").get);
const BufferToString = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(BufferPrototype, "toString").value);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const FunctionHasInstance = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(Function.prototype, Symbol.hasInstance).value);
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "update").value);
const HashDigest = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "digest").value);
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const JSONParse = JSON.parse;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectKeys = Object.keys;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetConstructor = Set;
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const StringSlice = Function.prototype.call.bind(String.prototype.slice);
const TypeErrorConstructor = TypeError;

const HASH = /^sha256:[a-f0-9]{64}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MEDIA_TYPE = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,63}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,63}$/u;
const REGISTRY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const TYPED_ERROR
  = /^EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_[A-Z0-9_:]+$/u;
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const MAX_TREE_DEPTH = 96;
const MAX_TREE_NODES = 50_000;
const MAX_TOP_LEVEL_OWN_KEYS = 64;
const MAX_OBJECT_OWN_KEYS = 256;
const MAX_ARRAY_LENGTH = 10_000;
const MAX_TOTAL_OWN_KEYS = 50_000;
const MAX_SCALAR_COUNT = 20_000;
const MAX_STRING_CODE_UNITS = 6 * 1024 * 1024;
const MAX_TOTAL_STRING_BYTES = 12 * 1024 * 1024;
const MAX_CANONICAL_BYTES = 8 * 1024 * 1024;
const MAX_LOCAL_DIRECTORY_CODE_UNITS = 4096;

export const EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_SCHEMAS
  = ObjectFreeze({
    request: "outsider/episode-attempt-set-external-head-candidate-request/v1",
    candidate: "outsider/episode-attempt-set-external-head-candidate/v1",
    verification:
      "outsider/episode-attempt-set-external-head-candidate-verification/v1",
  });

function fail(code) {
  throw new TypeErrorConstructor(
    `EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_${code}`);
}

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || ObjectIsFrozen(value)
    || SetHas(seen, value)) return value;
  SetAdd(seen, value);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = descriptors[keys[index]];
    if (descriptor && ObjectHasOwn(descriptor, "value")) {
      deepFreeze(descriptor.value, seen);
    }
  }
  return ObjectFreeze(value);
}

export const EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_BOUNDARY
  = deepFreeze({
    position:
      "PRIVATE_EXACT_BYTE_EXTERNAL_HEAD_CANDIDATE_INTAKE_HOLD_ONLY",
    frozenLocalHeadV2Mutated: false,
    freshLocalHeadV2FullAncestryReplayRequired: true,
    digestOnlySubjectRequest: true,
    registryIdProjected: false,
    registryIdHashProjected: false,
    directoryPathProjected: false,
    entryBytesProjected: false,
    compositionBytesProjected: false,
    additionalLocalHeadHashesProjected: false,
    localHeadCountsProjected: false,
    requestPublicationNetworkSafe: false,
    rawArtifactCarriedInCallerSuppliedPrivateRecord: true,
    privateStoragePermissionsEstablished: false,
    rawArtifactNetworkProjectionPermitted: false,
    artifactReferenceFieldsNetworkProjectionPermitted: false,
    candidatePublicationNetworkSafe: false,
    verificationPublicationNetworkSafe: false,
    transportImplemented: false,
    networkSubmissionPerformed: false,
    callerExpectedHeadHashIsConcurrencyTokenOnly: true,
    callerExpectedHeadHashIsExternalPinProvenance: false,
    callerArtifactBytesAreExternalSourceProvenance: false,
    callerArtifactHashIsIndependentPin: false,
    callerLocalCaptureTimeIsExternalTimeEvidence: false,
    opaqueArtifactIsProviderResponseEvidence: false,
    cryptographicSubjectBindingVerified: false,
    independentlyObtainedArtifactBytesEstablished: false,
    independentlySourcedTrustPolicyEstablished: false,
    externalHeadPinVerified: false,
    externalAnchorEstablished: false,
    independentWitnessEstablished: false,
    wormStorageEstablished: false,
    nonOmissionProofEstablished: false,
    nonEquivocationEstablished: false,
    ownerRollbackOrDirectoryReplacementExcluded: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    durableAppendOnlyHistoryEstablished: false,
    globalAttemptAndReportDenominatorComplete: false,
    promotionRequiresIndependentAcquisitionReceipt: true,
    promotionRequiresIndependentlySourcedTrustMaterial: true,
    promotionRequiresCryptographicSubjectBinding: true,
    promotionRequiresDurabilityEvidence: true,
    promotionRequiresNonEquivocationEvidence: true,
    stage1EngineeringGatePassed: false,
    stage1ExternalFactGatePassed: false,
    stage1Complete: false,
    stage2Permitted: false,
    authority: "NONE",
    authorityGrants: 0,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    actionReady: false,
    actionAuthorized: false,
    actionAdmissions: 0,
    executable: false,
    automaticTraining: false,
    productionTrainingAuthorized: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    moneyMovementEnabled: false,
    custodyEstablished: false,
    fundsVerified: false,
    platformAdvanceEnabled: false,
    pricingAuthorized: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    insuranceEstablished: false,
    permitsInsurance: false,
    settlementAuthorized: false,
    permitsSettlement: false,
    decisionState: "HOLD",
    disposition: "QUARANTINED",
  });

function rejectTree(value, seen = new SetConstructor(), depth = 0,
  budget = { nodes: 0, ownKeys: 0, scalars: 0, stringBytes: 0, rawBytes: 0 }) {
  if (value === null) {
    budget.scalars += 1;
    if (budget.scalars > MAX_SCALAR_COUNT) fail("VALUE_SCALAR_BUDGET_EXCEEDED");
    return;
  }
  const type = typeof value;
  if (type === "string") {
    budget.scalars += 1;
    if (budget.scalars > MAX_SCALAR_COUNT) fail("VALUE_SCALAR_BUDGET_EXCEEDED");
    if (value.length > MAX_STRING_CODE_UNITS) fail("VALUE_STRING_TOO_LARGE");
    const bytes = BufferByteLength(value, "utf8");
    budget.stringBytes += bytes;
    if (!NumberIsSafeInteger(budget.stringBytes)
      || budget.stringBytes > MAX_TOTAL_STRING_BYTES) {
      fail("VALUE_STRING_BYTE_BUDGET_EXCEEDED");
    }
    return;
  }
  if (type === "number" || type === "boolean") {
    budget.scalars += 1;
    if (budget.scalars > MAX_SCALAR_COUNT) fail("VALUE_SCALAR_BUDGET_EXCEEDED");
    if (type === "number" && !NumberIsFinite(value)) fail("VALUE_NUMBER_INVALID");
    return;
  }
  if (type !== "object") fail("VALUE_SCALAR_TYPE_INVALID");
  if (depth > MAX_TREE_DEPTH) fail("VALUE_TOO_DEEP");
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (BufferIsBuffer(value)) {
    if (ObjectGetPrototypeOf(value) !== BufferPrototype
      || ObjectHasOwn(value, "length")) fail("VALUE_BUFFER_SHAPE_INVALID");
    let length;
    try { length = TypedArrayLength(value); }
    catch { fail("VALUE_BUFFER_LENGTH_INVALID"); }
    if (!NumberIsSafeInteger(length) || length < 0
      || length > MAX_ARTIFACT_BYTES) fail("VALUE_RAW_BYTE_BUDGET_EXCEEDED");
    budget.rawBytes += length;
    if (!NumberIsSafeInteger(budget.rawBytes)
      || budget.rawBytes > MAX_ARTIFACT_BYTES) fail("VALUE_RAW_BYTE_BUDGET_EXCEEDED");
    return;
  }
  budget.nodes += 1;
  if (budget.nodes > MAX_TREE_NODES) fail("VALUE_TREE_TOO_LARGE");
  if (SetHas(seen, value)) fail("CYCLIC_OBJECT_FORBIDDEN");
  const prototype = ObjectGetPrototypeOf(value);
  const array = ArrayIsArray(value);
  if (array ? prototype !== ArrayPrototype
    : prototype !== ObjectPrototype && prototype !== null) {
    fail("VALUE_PROTOTYPE_INVALID");
  }
  if (array && (!NumberIsSafeInteger(value.length)
    || value.length > MAX_ARRAY_LENGTH)) fail("VALUE_ARRAY_LENGTH_BUDGET_EXCEEDED");
  /* Enumerate names before allocating the much larger descriptor table. This
     does not make hostile enumeration free, but it bounds descriptor work and
     recursive traversal before any canonical encoding is attempted. */
  const keys = ReflectOwnKeys(value);
  if (depth === 0 && !array && keys.length > MAX_TOP_LEVEL_OWN_KEYS) {
    fail("VALUE_TOP_LEVEL_OWN_KEY_BUDGET_EXCEEDED");
  }
  if (!array && keys.length > MAX_OBJECT_OWN_KEYS) {
    fail("VALUE_OBJECT_OWN_KEY_BUDGET_EXCEEDED");
  }
  if (array && keys.length > value.length + 1) fail("VALUE_ARRAY_SHAPE_INVALID");
  budget.ownKeys += keys.length;
  if (!NumberIsSafeInteger(budget.ownKeys)
    || budget.ownKeys > MAX_TOTAL_OWN_KEYS) fail("VALUE_TOTAL_OWN_KEY_BUDGET_EXCEEDED");
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== "string") fail("VALUE_SYMBOL_FORBIDDEN");
    budget.scalars += 1;
    if (budget.scalars > MAX_SCALAR_COUNT) fail("VALUE_SCALAR_BUDGET_EXCEEDED");
    if (key.length > MAX_STRING_CODE_UNITS) fail("VALUE_KEY_STRING_TOO_LARGE");
    budget.stringBytes += BufferByteLength(key, "utf8");
    if (!NumberIsSafeInteger(budget.stringBytes)
      || budget.stringBytes > MAX_TOTAL_STRING_BYTES) {
      fail("VALUE_STRING_BYTE_BUDGET_EXCEEDED");
    }
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  SetAdd(seen, value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = descriptors[key];
    if (!descriptor
      || !ObjectHasOwn(descriptor, "value")) fail("VALUE_ACCESSOR_OR_SYMBOL_FORBIDDEN");
    if (!(array && key === "length")
      && descriptor.enumerable !== true) fail("VALUE_HIDDEN_PROPERTY_FORBIDDEN");
    if (!(array && key === "length")) {
      rejectTree(descriptor.value, seen, depth + 1, budget);
    }
  }
  if (array) {
    if (keys.length !== value.length + 1) fail("VALUE_ARRAY_SHAPE_INVALID");
    for (let index = 0; index < value.length; index += 1) {
      if (!ObjectHasOwn(descriptors, StringConstructor(index))) {
        fail("VALUE_SPARSE_ARRAY_FORBIDDEN");
      }
    }
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
      || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function clone(value) {
  rejectTree(value);
  let encoded;
  try { encoded = canonicalizeStrict(value); }
  catch { fail("CANONICAL_DATA_REQUIRED"); }
  if (BufferByteLength(encoded, "utf8") > MAX_CANONICAL_BYTES) {
    fail("CANONICAL_BYTE_BUDGET_EXCEEDED");
  }
  let parsed;
  try { parsed = JSONParse(encoded); }
  catch { fail("CANONICAL_DATA_REQUIRED"); }
  rejectTree(parsed);
  return deepFreeze(parsed);
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

function canonicalTime(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)) {
    fail(`${code}_INVALID`);
  }
  const epoch = DateParse(value);
  if (!NumberIsFinite(epoch)
    || DateToISOString(new DateConstructor(epoch)) !== value) fail(`${code}_INVALID`);
  return value;
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `outsider:${domain}:v1\0`, "utf8");
  HashUpdate(state, typeof value === "string" ? value : canonicalizeStrict(value), "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function byteDigest(value) {
  const state = createHash("sha256");
  HashUpdate(state, value);
  return `sha256:${HashDigest(state, "hex")}`;
}

function strictArtifactBytes(value, code) {
  if (isProxy(value) || !BufferIsBuffer(value)
    || ObjectGetPrototypeOf(value) !== BufferPrototype
    || ObjectHasOwn(value, "length")) fail(`${code}_BUFFER_REQUIRED`);
  let length;
  try { length = TypedArrayLength(value); }
  catch { fail(`${code}_LENGTH_INVALID`); }
  if (!NumberIsSafeInteger(length) || length < 1
    || length > MAX_ARTIFACT_BYTES) fail(`${code}_SIZE_INVALID`);
  const copy = BufferFrom(value);
  let copyLength;
  try { copyLength = TypedArrayLength(copy); }
  catch { fail(`${code}_COPY_LENGTH_INVALID`); }
  if (ObjectGetPrototypeOf(copy) !== BufferPrototype
    || ObjectHasOwn(copy, "length") || copyLength !== length) {
    fail(`${code}_COPY_INVALID`);
  }
  return copy;
}

function strictBase64(value, code) {
  if (typeof value !== "string" || value.length < 4
    || value.length > MAX_ARTIFACT_BYTES * 2 || !RegExpTest(BASE64, value)) {
    fail(`${code}_INVALID`);
  }
  const bytes = BufferFrom(value, "base64");
  if (bytes.length < 1 || bytes.length > MAX_ARTIFACT_BYTES
    || BufferToString(bytes, "base64") !== value) fail(`${code}_INVALID`);
  return bytes;
}

function mediaType(value) {
  if (typeof value !== "string" || !RegExpTest(MEDIA_TYPE, value)) {
    fail("ARTIFACT_MEDIA_TYPE_INVALID");
  }
  return value;
}

function registryId(value) {
  if (typeof value !== "string" || !RegExpTest(REGISTRY_ID, value)) {
    fail("REGISTRY_ID_INVALID");
  }
  return value;
}

function localContext(value, code) {
  exactObject(value, ["directory", "registryId", "expectedLocalHeadHash"], code);
  if (typeof value.directory !== "string" || value.directory.length < 1
    || value.directory.length > MAX_LOCAL_DIRECTORY_CODE_UNITS) {
    fail(`${code}_DIRECTORY_INVALID`);
  }
  return {
    directory: value.directory,
    registryId: registryId(value.registryId),
    expectedLocalHeadHash: hash(value.expectedLocalHeadHash,
      `${code}_EXPECTED_LOCAL_HEAD_HASH`),
  };
}

function replayLocalHead(context) {
  const verified = verifyEpisodeAttemptSetLocalHeadV2(context);
  if (verified?.ok !== true
    || verified.expectedLocalHeadHashProvided !== true
    || verified.expectedLocalHeadHashMatched !== true
    || verified.fullAncestryReplayVerified !== true
    || verified.twoPassEntrySnapshotStabilityVerified !== true
    || verified.localUniqueHeadStructuralHistoryEstablished !== true
    || verified.expectedLocalHeadHashIsConcurrencyTokenOnly !== true
    || verified.externalHeadPinVerified !== false
    || verified.independentExternalProvenanceEstablished !== false
    || verified.parallelGenesisExclusionEstablished !== false
    || verified.forkExclusionEstablished !== false
    || verified.ownerRollbackOrDirectoryReplacementExcluded !== false
    || verified.durableAppendOnlyHistoryEstablished !== false
    || verified.decisionState !== "HOLD" || verified.authority !== "NONE") {
    fail("LOCAL_HEAD_V2_FRESH_REPLAY_FAILED");
  }
  const head = verified.head;
  if (!head || head.registryId !== context.registryId
    || head.headHash !== context.expectedLocalHeadHash
    || !RegExpTest(HASH, StringConstructor(head.episodeHash))
    || !RegExpTest(HASH, StringConstructor(head.headCompositionHash))
    || !RegExpTest(HASH, StringConstructor(head.headEntryHash))
    || !RegExpTest(HASH, StringConstructor(head.entrySetRoot))
    || !NumberIsSafeInteger(head.entryCount) || head.entryCount < 1
    || !NumberIsSafeInteger(head.attemptCount) || head.attemptCount < 1
    || !NumberIsSafeInteger(head.reportOccurrenceCount)
    || head.reportOccurrenceCount < 0) fail("LOCAL_HEAD_V2_REPLAY_SHAPE_INVALID");
  return verified;
}

function externalFacts() {
  return {
    artifactRepresentsProviderResponseEstablished: false,
    cryptographicSubjectBindingVerified: false,
    independentlyObtainedArtifactBytesEstablished: false,
    independentlySourcedTrustPolicyEstablished: false,
    independentPinProvenanceEstablished: false,
    externalHeadPinVerified: false,
    externalAnchorEstablished: false,
    durableExternalHeadEstablished: false,
    independentWitnessEstablished: false,
    wormStorageEstablished: false,
    nonOmissionProofEstablished: false,
    nonEquivocationEstablished: false,
    ownerRollbackOrDirectoryReplacementExcluded: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    durableAppendOnlyHistoryEstablished: false,
    globalAttemptAndReportDenominatorComplete: false,
  };
}

function requestBody(verified, requestedAt) {
  const head = verified.head;
  return {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_SCHEMAS.request,
    requestClass:
      "LOCAL_HEAD_DIGEST_ONLY_FUTURE_EXTERNAL_ACQUISITION_REQUEST_HOLD_ONLY",
    requestedAt,
    requestedAtIsExternalTimeEvidence: false,
    subject: {
      kind: "EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_HASH",
      algorithm: "SHA-256",
      digestHex: StringSlice(head.headHash, "sha256:".length),
    },
    localReplayScope: {
      fullAncestryReplayVerifiedInOneObservedLocalRegistry: true,
      oneObservedLocalRegistryOnly: true,
      localHeadOnly: true,
    },
    disclosure: {
      digestOnly: true,
      onlySubjectDigestIncluded: true,
      registryIdIncluded: false,
      registryIdHashIncluded: false,
      directoryPathIncluded: false,
      entryBytesIncluded: false,
      compositionBytesIncluded: false,
      additionalLocalHeadHashesIncluded: false,
      localHeadCountsIncluded: false,
      reportOrEventBytesIncluded: false,
      rawArtifactIncluded: false,
    },
    requestPublicationNetworkSafe: false,
    providerProfileSelected: false,
    trustPolicySelected: false,
    networkSubmissionPerformed: false,
    artifactPresent: false,
    externalFacts: externalFacts(),
    decisionState: "HOLD",
    authority: "NONE",
    useBoundary: EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_BOUNDARY,
  };
}

function makeRequest(verified, requestedAt) {
  const body = requestBody(verified, requestedAt);
  return deepFreeze({ ...body, requestHash: digest(
    "episode-attempt-set-external-head-candidate-request", body) });
}

const REQUEST_FIELDS = ["schema", "requestClass", "requestedAt",
  "requestedAtIsExternalTimeEvidence", "subject", "localReplayScope", "disclosure",
  "requestPublicationNetworkSafe",
  "providerProfileSelected", "trustPolicySelected",
  "networkSubmissionPerformed", "artifactPresent", "externalFacts",
  "decisionState", "authority", "useBoundary", "requestHash"];

function assertRequest(value) {
  const request = clone(value);
  exactObject(request, REQUEST_FIELDS, "REQUEST");
  exactObject(request.subject, ["kind", "algorithm", "digestHex"],
    "REQUEST_SUBJECT");
  exactObject(request.localReplayScope,
    ["fullAncestryReplayVerifiedInOneObservedLocalRegistry",
      "oneObservedLocalRegistryOnly", "localHeadOnly"],
    "REQUEST_LOCAL_REPLAY_SCOPE");
  exactObject(request.disclosure, ["digestOnly", "onlySubjectDigestIncluded",
    "registryIdIncluded", "registryIdHashIncluded", "directoryPathIncluded",
    "entryBytesIncluded", "compositionBytesIncluded",
    "additionalLocalHeadHashesIncluded", "localHeadCountsIncluded",
    "reportOrEventBytesIncluded", "rawArtifactIncluded"], "REQUEST_DISCLOSURE");
  exactObject(request.externalFacts, ObjectKeys(externalFacts()),
    "REQUEST_EXTERNAL_FACTS");
  const { requestHash, ...body } = request;
  if (request.schema !== EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_SCHEMAS.request
    || request.requestClass
      !== "LOCAL_HEAD_DIGEST_ONLY_FUTURE_EXTERNAL_ACQUISITION_REQUEST_HOLD_ONLY"
    || !canonicalTime(request.requestedAt, "REQUESTED_AT")
    || request.requestedAtIsExternalTimeEvidence !== false
    || request.subject.kind !== "EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_HASH"
    || request.subject.algorithm !== "SHA-256"
    || !RegExpTest(/^[a-f0-9]{64}$/u, request.subject.digestHex)
    || request.localReplayScope
      .fullAncestryReplayVerifiedInOneObservedLocalRegistry !== true
    || request.localReplayScope.oneObservedLocalRegistryOnly !== true
    || request.localReplayScope.localHeadOnly !== true
    || request.disclosure.digestOnly !== true
    || request.disclosure.onlySubjectDigestIncluded !== true
    || request.disclosure.registryIdIncluded !== false
    || request.disclosure.registryIdHashIncluded !== false
    || request.disclosure.directoryPathIncluded !== false
    || request.disclosure.entryBytesIncluded !== false
    || request.disclosure.compositionBytesIncluded !== false
    || request.disclosure.additionalLocalHeadHashesIncluded !== false
    || request.disclosure.localHeadCountsIncluded !== false
    || request.disclosure.reportOrEventBytesIncluded !== false
    || request.disclosure.rawArtifactIncluded !== false
    || request.requestPublicationNetworkSafe !== false
    || request.providerProfileSelected !== false
    || request.trustPolicySelected !== false
    || request.networkSubmissionPerformed !== false
    || request.artifactPresent !== false
    || !same(request.externalFacts, externalFacts())
    || request.decisionState !== "HOLD" || request.authority !== "NONE"
    || !same(request.useBoundary,
      EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_BOUNDARY)
    || !hash(requestHash, "REQUEST_HASH")
    || requestHash !== digest(
      "episode-attempt-set-external-head-candidate-request", body)) {
    fail("REQUEST_INVALID");
  }
  return request;
}

export function createEpisodeAttemptSetExternalHeadCandidateRequestV1(input = {}) {
  rejectTree(input);
  exactObject(input, ["localHead", "requestedAt"], "CREATE_REQUEST_INPUT");
  const context = localContext(input.localHead, "CREATE_REQUEST_LOCAL_HEAD");
  const requestedAt = canonicalTime(input.requestedAt, "REQUESTED_AT");
  const verified = replayLocalHead(context);
  return makeRequest(verified, requestedAt);
}

function candidateBody(request, artifactBytes, artifactMediaType,
  receivedAtLocallyObserved) {
  return {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_SCHEMAS.candidate,
    candidateClass:
      "CALLER_SUPPLIED_EXACT_OPAQUE_ARTIFACT_BYTES_NO_EXTERNAL_PROVENANCE_HOLD_ONLY",
    receivedAtLocallyObserved,
    receivedAtIsExternalTimeEvidence: false,
    request,
    artifact: {
      mediaType: artifactMediaType,
      bytesBase64: BufferToString(artifactBytes, "base64"),
      byteLength: artifactBytes.length,
      byteHash: byteDigest(artifactBytes),
      exactBytesEncodedInRecord: true,
      callerMustTreatRecordAsPrivate: true,
      privateStoragePermissionsEstablished: false,
      networkProjectionPermitted: false,
    },
    intakeSource: {
      acquisitionClass: "CALLER_SUPPLIED_BYTES",
      networkTransportObservedByThisModule: false,
      transportProvenanceEstablished: false,
      providerIdentityEstablished: false,
      providerResponseEstablished: false,
      independentAcquisitionReceiptPresent: false,
      independentAcquisitionEstablished: false,
      trustPolicyPresent: false,
      trustPolicyProvenanceEstablished: false,
    },
    replayStatus: {
      requestSelfHashVerified: true,
      candidateArtifactByteHashRecorded: true,
      cryptographicArtifactVerificationPerformed: false,
      externalSourceReplayVerified: false,
    },
    privateStoragePermissionsEstablished: false,
    candidatePublicationNetworkSafe: false,
    externalFacts: externalFacts(),
    result: "EXACT_OPAQUE_CANDIDATE_BYTES_ENCODED_NO_EXTERNAL_FACT_ESTABLISHED",
    disposition: "QUARANTINED",
    decisionState: "HOLD",
    authority: "NONE",
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    moneyMovementEnabled: false,
    custodyEstablished: false,
    fundsVerified: false,
    platformAdvanceEnabled: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    insuranceEstablished: false,
    permitsInsurance: false,
    settlementAuthorized: false,
    permitsSettlement: false,
    boundary: EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_BOUNDARY,
  };
}

function makeCandidate(request, bytes, artifactMediaType,
  receivedAtLocallyObserved) {
  const body = candidateBody(request, bytes, artifactMediaType,
    receivedAtLocallyObserved);
  return deepFreeze({ ...body, candidateHash: digest(
    "episode-attempt-set-external-head-candidate", body) });
}

export function captureEpisodeAttemptSetExternalHeadCandidateV1(input = {}) {
  rejectTree(input);
  exactObject(input, ["request", "artifactBytes", "artifactMediaType",
    "receivedAtLocallyObserved"], "CAPTURE_INPUT");
  const request = assertRequest(input.request);
  const artifactBytes = strictArtifactBytes(input.artifactBytes, "ARTIFACT_BYTES");
  const artifactMediaType = mediaType(input.artifactMediaType);
  const receivedAt = canonicalTime(input.receivedAtLocallyObserved,
    "RECEIVED_AT_LOCALLY_OBSERVED");
  if (DateParse(receivedAt) < DateParse(request.requestedAt)) {
    fail("LOCAL_CAPTURE_PRECEDES_REQUEST");
  }
  return makeCandidate(request, artifactBytes, artifactMediaType, receivedAt);
}

const CANDIDATE_FIELDS = ["schema", "candidateClass",
  "receivedAtLocallyObserved", "receivedAtIsExternalTimeEvidence", "request",
  "artifact", "intakeSource", "replayStatus", "privateStoragePermissionsEstablished",
  "candidatePublicationNetworkSafe", "externalFacts", "result",
  "disposition", "decisionState", "authority", "enabledCapabilityCount",
  "provenAuthorityCount", "enabledCapabilitiesSubsetOfProvenAuthority",
  "consequenceReach", "actionReady", "executable", "automaticTraining",
  "trainingRows", "causalExperienceUnits", "actorCredit", "moneyMovementEnabled",
  "custodyEstablished", "fundsVerified", "platformAdvanceEnabled",
  "permitsPricing", "guaranteeEstablished", "permitsGuarantee",
  "insuranceEstablished", "permitsInsurance", "settlementAuthorized",
  "permitsSettlement", "boundary", "candidateHash"];

function assertCandidate(value) {
  const candidate = clone(value);
  exactObject(candidate, CANDIDATE_FIELDS, "CANDIDATE");
  exactObject(candidate.artifact, ["mediaType", "bytesBase64", "byteLength",
    "byteHash", "exactBytesEncodedInRecord", "callerMustTreatRecordAsPrivate",
    "privateStoragePermissionsEstablished", "networkProjectionPermitted"],
  "CANDIDATE_ARTIFACT");
  exactObject(candidate.intakeSource, ["acquisitionClass",
    "networkTransportObservedByThisModule", "transportProvenanceEstablished",
    "providerIdentityEstablished", "providerResponseEstablished",
    "independentAcquisitionReceiptPresent", "independentAcquisitionEstablished",
    "trustPolicyPresent", "trustPolicyProvenanceEstablished"],
  "CANDIDATE_INTAKE_SOURCE");
  exactObject(candidate.replayStatus, ["requestSelfHashVerified",
    "candidateArtifactByteHashRecorded", "cryptographicArtifactVerificationPerformed",
    "externalSourceReplayVerified"], "CANDIDATE_REPLAY_STATUS");
  exactObject(candidate.externalFacts, ObjectKeys(externalFacts()),
    "CANDIDATE_EXTERNAL_FACTS");
  const request = assertRequest(candidate.request);
  const bytes = strictBase64(candidate.artifact.bytesBase64,
    "CANDIDATE_ARTIFACT_BASE64");
  const { candidateHash, ...body } = candidate;
  if (candidate.schema
      !== EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_SCHEMAS.candidate
    || candidate.candidateClass
      !== "CALLER_SUPPLIED_EXACT_OPAQUE_ARTIFACT_BYTES_NO_EXTERNAL_PROVENANCE_HOLD_ONLY"
    || !canonicalTime(candidate.receivedAtLocallyObserved,
      "CANDIDATE_RECEIVED_AT")
    || DateParse(candidate.receivedAtLocallyObserved) < DateParse(request.requestedAt)
    || candidate.receivedAtIsExternalTimeEvidence !== false
    || mediaType(candidate.artifact.mediaType) !== candidate.artifact.mediaType
    || !NumberIsSafeInteger(candidate.artifact.byteLength)
    || candidate.artifact.byteLength !== bytes.length
    || candidate.artifact.byteHash !== byteDigest(bytes)
    || candidate.artifact.exactBytesEncodedInRecord !== true
    || candidate.artifact.callerMustTreatRecordAsPrivate !== true
    || candidate.artifact.privateStoragePermissionsEstablished !== false
    || candidate.artifact.networkProjectionPermitted !== false
    || candidate.intakeSource.acquisitionClass !== "CALLER_SUPPLIED_BYTES"
    || candidate.intakeSource.networkTransportObservedByThisModule !== false
    || candidate.intakeSource.transportProvenanceEstablished !== false
    || candidate.intakeSource.providerIdentityEstablished !== false
    || candidate.intakeSource.providerResponseEstablished !== false
    || candidate.intakeSource.independentAcquisitionReceiptPresent !== false
    || candidate.intakeSource.independentAcquisitionEstablished !== false
    || candidate.intakeSource.trustPolicyPresent !== false
    || candidate.intakeSource.trustPolicyProvenanceEstablished !== false
    || candidate.replayStatus.requestSelfHashVerified !== true
    || candidate.replayStatus.candidateArtifactByteHashRecorded !== true
    || candidate.replayStatus.cryptographicArtifactVerificationPerformed !== false
    || candidate.replayStatus.externalSourceReplayVerified !== false
    || candidate.privateStoragePermissionsEstablished !== false
    || candidate.candidatePublicationNetworkSafe !== false
    || !same(candidate.externalFacts, externalFacts())
    || candidate.result
      !== "EXACT_OPAQUE_CANDIDATE_BYTES_ENCODED_NO_EXTERNAL_FACT_ESTABLISHED"
    || candidate.disposition !== "QUARANTINED"
    || candidate.decisionState !== "HOLD" || candidate.authority !== "NONE"
    || candidate.enabledCapabilityCount !== 0
    || candidate.provenAuthorityCount !== 0
    || candidate.enabledCapabilitiesSubsetOfProvenAuthority !== true
    || candidate.consequenceReach !== "NONE"
    || candidate.actionReady !== false || candidate.executable !== false
    || candidate.automaticTraining !== false || candidate.trainingRows !== 0
    || candidate.causalExperienceUnits !== 0 || candidate.actorCredit !== false
    || candidate.moneyMovementEnabled !== false
    || candidate.custodyEstablished !== false || candidate.fundsVerified !== false
    || candidate.platformAdvanceEnabled !== false
    || candidate.permitsPricing !== false
    || candidate.guaranteeEstablished !== false
    || candidate.permitsGuarantee !== false
    || candidate.insuranceEstablished !== false
    || candidate.permitsInsurance !== false
    || candidate.settlementAuthorized !== false
    || candidate.permitsSettlement !== false
    || !same(candidate.boundary,
      EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_BOUNDARY)
    || !hash(candidateHash, "CANDIDATE_HASH")
    || candidateHash !== digest(
      "episode-attempt-set-external-head-candidate", body)) {
    fail("CANDIDATE_INVALID");
  }
  return { candidate, request, bytes };
}

function verificationBoundary() {
  return {
    independentPinProvenanceEstablished: false,
    externalHeadPinVerified: false,
    externalAnchorEstablished: false,
    durableExternalHeadEstablished: false,
    independentWitnessEstablished: false,
    wormStorageEstablished: false,
    nonOmissionProofEstablished: false,
    nonEquivocationEstablished: false,
    ownerRollbackOrDirectoryReplacementExcluded: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    durableAppendOnlyHistoryEstablished: false,
    globalAttemptAndReportDenominatorComplete: false,
    stage1EngineeringGatePassed: false,
    stage1ExternalFactGatePassed: false,
    stage1Complete: false,
    stage2Permitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    actorCredit: false,
    moneyMovementEnabled: false,
    custodyEstablished: false,
    fundsVerified: false,
    platformAdvanceEnabled: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    insuranceEstablished: false,
    permitsInsurance: false,
    settlementAuthorized: false,
    permitsSettlement: false,
    boundary: EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_BOUNDARY,
  };
}

function sanitizedFailureMessage(error) {
  const fallback
    = "EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_UNTRUSTED_FAILURE";
  try {
    if (error === null || typeof error !== "object" || isProxy(error)
      || FunctionHasInstance(ErrorConstructor, error) !== true) return fallback;
    const descriptor = ObjectGetOwnPropertyDescriptor(error, "message");
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || typeof descriptor.value !== "string") return fallback;
    return RegExpTest(TYPED_ERROR, descriptor.value) ? descriptor.value : fallback;
  } catch {
    return fallback;
  }
}

function verificationFailure(error) {
  return deepFreeze({
    schema:
      EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_SCHEMAS.verification,
    ok: false,
    localHeadFreshFullAncestryReplayVerified: false,
    requestRebuiltFromFreshLocalHead: false,
    exactCandidateArtifactBytesReplayed: false,
    artifactByteHashMatched: false,
    rawArtifactBytesProjected: false,
    artifactReferenceFieldsPrivateOnly: true,
    artifactReferenceFieldsNetworkProjectionPermitted: false,
    verificationPublicationNetworkSafe: false,
    privateStoragePermissionsEstablished: false,
    directoryPathProjected: false,
    registryIdProjected: false,
    transportOrNetworkPerformed: false,
    artifactRepresentsProviderResponseEstablished: false,
    cryptographicSubjectBindingVerified: false,
    independentlyObtainedArtifactBytesEstablished: false,
    independentlySourcedTrustPolicyEstablished: false,
    error: sanitizedFailureMessage(error),
    ...verificationBoundary(),
  });
}

export function verifyEpisodeAttemptSetExternalHeadCandidateV1(
  record, context = {}) {
  try {
    rejectTree(record);
    rejectTree(context);
    exactObject(context, ["localHead", "expectedRequestHash",
      "expectedCandidateHash"], "VERIFY_CONTEXT");
    const local = localContext(context.localHead, "VERIFY_LOCAL_HEAD");
    const expectedRequestHash = hash(context.expectedRequestHash,
      "EXPECTED_REQUEST_HASH");
    const expectedCandidateHash = hash(context.expectedCandidateHash,
      "EXPECTED_CANDIDATE_HASH");
    const checked = assertCandidate(record);
    if (checked.request.requestHash !== expectedRequestHash
      || checked.candidate.candidateHash !== expectedCandidateHash) {
      fail("EXPECTED_HASH_MISMATCH");
    }
    const verified = replayLocalHead(local);
    const rebuiltRequest = makeRequest(verified, checked.request.requestedAt);
    if (!same(rebuiltRequest, checked.request)) fail("REQUEST_LOCAL_HEAD_BINDING_MISMATCH");
    const rebuilt = makeCandidate(rebuiltRequest, checked.bytes,
      checked.candidate.artifact.mediaType,
      checked.candidate.receivedAtLocallyObserved);
    if (!same(rebuilt, checked.candidate)) fail("CANDIDATE_REPLAY_MISMATCH");
    const body = {
      schema:
        EPISODE_ATTEMPT_SET_EXTERNAL_HEAD_CANDIDATE_V1_SCHEMAS.verification,
      ok: true,
      candidateHash: rebuilt.candidateHash,
      requestHash: rebuiltRequest.requestHash,
      localHeadHash: verified.head.headHash,
      episodeHash: verified.head.episodeHash,
      headCompositionHash: verified.head.headCompositionHash,
      headEntryHash: verified.head.headEntryHash,
      entrySetRoot: verified.head.entrySetRoot,
      entryCount: verified.head.entryCount,
      attemptCount: verified.head.attemptCount,
      reportOccurrenceCount: verified.head.reportOccurrenceCount,
      artifactMediaType: rebuilt.artifact.mediaType,
      artifactByteLength: rebuilt.artifact.byteLength,
      artifactByteHash: rebuilt.artifact.byteHash,
      localHeadFreshFullAncestryReplayVerified: true,
      requestRebuiltFromFreshLocalHead: true,
      exactCandidateArtifactBytesReplayed: true,
      artifactByteHashMatched: true,
      rawArtifactBytesProjected: false,
      artifactReferenceFieldsPrivateOnly: true,
      artifactReferenceFieldsNetworkProjectionPermitted: false,
      verificationPublicationNetworkSafe: false,
      privateStoragePermissionsEstablished: false,
      directoryPathProjected: false,
      registryIdProjected: false,
      transportOrNetworkPerformed: false,
      artifactRepresentsProviderResponseEstablished: false,
      cryptographicSubjectBindingVerified: false,
      independentlyObtainedArtifactBytesEstablished: false,
      independentlySourcedTrustPolicyEstablished: false,
      ...verificationBoundary(),
    };
    return deepFreeze({ ...body, verificationHash: digest(
      "episode-attempt-set-external-head-candidate-verification", body) });
  } catch (error) {
    return verificationFailure(error);
  }
}
