/*
 * Private, zero-transport Attempt-set external-witness preparation and replay.
 *
 * This v2 successor closes an engineering gap left by the v1 opaque candidate:
 * the externally committed digest binds the freshly replayed local-head-v2
 * verification hash, every exact stored-entry byte commitment, and the complete
 * local head vector.  It also requires exact trust-policy and transport-policy
 * hashes and carries exact caller-supplied anchor/transport artifact bytes for
 * offline replay.
 *
 * The only built-in external-format verifier reused here is the Rekor v2
 * hashedrekord/checkpoint verifier in outsider-external-anchor.js.  A successful
 * synthetic or caller-policy replay proves only digest inclusion in one signed,
 * optionally cosigned checkpoint under the supplied keys.  It never proves how
 * those keys or bytes were obtained, operator or witness independence,
 * cross-checkpoint consistency, absence of a split view, WORM retention,
 * non-omission, or a durable external Attempt head.  Caller pins, an operator
 * self-signature, one checkpoint, and one timestamp are never promoted to an
 * independent fact.  This module has no network or filesystem write path.
 * It does not consume Sigstore's TUF-distributed TrustedRoot or SigningConfig,
 * does not verify the hashedrekord issuer signature, and has no claim of live
 * public-provider interoperability.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  ANCHOR_OPERATOR_RELATIONSHIPS,
  EXTERNAL_ANCHOR_PROFILES,
  captureExternalAnchorEvidence,
  createExternalAnchorTrustPolicy,
  verifyExternalAnchorEvidence,
} from "./outsider-external-anchor.js";
import {
  EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_GENESIS_ENTRY_HASH,
  verifyEpisodeAttemptSetLocalHeadV2,
} from "./outsider-episode-attempt-set-local-head-v2.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArrayConstructor = Array;
const BufferAllocUnsafe = Buffer.allocUnsafe;
const BufferByteLength = Buffer.byteLength;
const BufferCopy = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(Buffer.prototype, "copy").value);
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferPrototype = Buffer.prototype;
const BufferToString = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(Buffer.prototype, "toString").value);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const FunctionHasInstance = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(Function.prototype, Symbol.hasInstance).value);
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "digest").value);
const HashUpdate = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "update").value);
const IntrinsicTypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const TypedArrayLength = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(IntrinsicTypedArrayPrototype, "length").get);
const JSONParse = JSON.parse;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectDefineProperty = Object.defineProperty;
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
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const StringSlice = Function.prototype.call.bind(String.prototype.slice);
const TypeErrorConstructor = TypeError;
const URLConstructor = URL;
const URLPrototype = URL.prototype;
const URLHashGet = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(URLPrototype, "hash").get);
const URLOriginGet = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(URLPrototype, "origin").get);
const URLPasswordGet = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(URLPrototype, "password").get);
const URLPathnameGet = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(URLPrototype, "pathname").get);
const URLProtocolGet = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(URLPrototype, "protocol").get);
const URLSearchGet = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(URLPrototype, "search").get);
const URLUsernameGet = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(URLPrototype, "username").get);

const HASH = /^sha256:[a-f0-9]{64}$/u;
const HEX_32 = /^[a-f0-9]{64}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MEDIA_TYPE
  = /^[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,63}\/[A-Za-z0-9][A-Za-z0-9!#$&^_.+-]{0,63}$/u;
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const REGISTRY_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const BASE64
  = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const TYPED_ERROR
  = /^EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_[A-Z0-9_:]+$/u;

const MAX_RAW_BYTES = 1024 * 1024;
/* The local-head-v2 contract admits 100,000 entries.  These aggregate budgets
   are intentionally sized to carry that complete commitment vector rather
   than silently narrowing v2 to a smaller ancestry. */
const MAX_CANONICAL_BYTES = 64 * 1024 * 1024;
const MAX_SEMANTIC_STRING_CODE_UNITS = 5 * 1024 * 1024;
const MAX_LOCAL_DIRECTORY_CODE_UNITS = 4096;
const MAX_ENTRY_COMMITMENTS = 100_000;

export const EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_SCHEMAS = ObjectFreeze({
  headBinding: "outsider/episode-attempt-set-external-witness-head-binding/v2",
  transportPolicy:
    "outsider/episode-attempt-set-external-witness-transport-policy/v2",
  request: "outsider/episode-attempt-set-external-witness-request/v2",
  transportCapture:
    "outsider/episode-attempt-set-external-witness-transport-capture/v2",
  candidate: "outsider/episode-attempt-set-external-witness-candidate/v2",
  verification:
    "outsider/episode-attempt-set-external-witness-verification/v2",
});

function fail(code) {
  throw new TypeErrorConstructor(`EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_${code}`);
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

export const EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_BOUNDARY = deepFreeze({
  position:
    "PRIVATE_EXACT_POLICY_AND_ARTIFACT_REKOR_REPLAY_OVER_FULL_LOCAL_ANCESTRY_HOLD_ONLY",
  predecessorCandidateV1Promoted: false,
  freshLocalHeadV2FullAncestryReplayRequired: true,
  completeHeadVectorPrivatelyBound: true,
  everyEntryByteCommitmentPrivatelyBound: true,
  externalDisclosureDigestOnly: true,
  fullHeadVectorNetworkProjected: false,
  entryByteCommitmentsNetworkProjected: false,
  rawEntryOrCompositionBytesNetworkProjected: false,
  requestPublicationNetworkSafe: false,
  candidatePublicationNetworkSafe: false,
  verificationPublicationNetworkSafe: false,
  rawAnchorArtifactPrivateOnly: true,
  rawTransportProofPrivateOnly: true,
  networkTransportImplemented: false,
  networkSubmissionPerformed: false,
  trustPolicyHashRequired: true,
  trustPolicyExactReplayRequired: true,
  transportPolicyHashRequired: true,
  transportPolicyExactReplayRequired: true,
  anchorEvidenceHashRequired: true,
  transportProofByteHashRequired: true,
  callerPinsAreExternalProvenance: false,
  callerSuppliedTrustPolicyIsExternalPinProvenance: false,
  callerSuppliedTransportProofIsTransportProvenance: false,
  callerCaptureTimeIsExternalTimeEvidence: false,
  operatorSelfSignatureIsIndependentWitness: false,
  singleTimestampIsNonEquivocationProof: false,
  singleSignedCheckpointIsNonEquivocationProof: false,
  checkpointCosignatureCountIsWitnessIndependenceProof: false,
  crossCheckpointConsistencyRequiredForFuturePromotion: true,
  splitViewExclusionRequiredForFuturePromotion: true,
  independentlySourcedTrustRegistryRequiredForFuturePromotion: true,
  independentlyAcquiredArtifactRequiredForFuturePromotion: true,
  builtInRekorV2DigestInclusionReplayAvailable: true,
  hashedRekordIssuerSignatureVerified: false,
  sigstoreTufTrustedRootReplayVerified: false,
  sigstoreSigningConfigReplayVerified: false,
  publicProviderInteroperabilityObserved: false,
  publicProviderLiveArtifactEstablished: false,
  providerAuthenticatedExistenceTimeEstablished: false,
  providerProofTimeVerified: false,
  independentlySourcedTrustPolicyEstablished: false,
  transportProvenanceEstablished: false,
  independentWitnessEstablished: false,
  externalHeadPinVerified: false,
  externalAnchorEstablished: false,
  wormStorageEstablished: false,
  nonOmissionProofEstablished: false,
  longTermMonitoringEstablished: false,
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
  status: "PARTIAL",
  decisionState: "HOLD",
  disposition: "QUARANTINED",
});

export const EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_PROOF_MATRIX = deepFreeze({
  localHeadV2: {
    proves: [
      "TWO_PASS_STABLE_EXACT_ENTRY_BYTES_IN_ONE_OBSERVED_PRIVATE_DIRECTORY",
      "EVERY_STORED_V1_COMPOSITION_FROM_LOCAL_GENESIS",
      "ONE_STRUCTURAL_HEAD_IN_THAT_OBSERVED_DIRECTORY",
    ],
    doesNotProve: [
      "SECOND_ROOT_OR_PARALLEL_GENESIS_EXCLUSION",
      "OWNER_ROLLBACK_OR_DIRECTORY_REPLACEMENT_EXCLUSION",
      "EXTERNAL_DURABILITY_OR_NON_EQUIVOCATION",
    ],
  },
  externalHeadCandidateV1: {
    proves: [
      "FRESH_LOCAL_HEAD_V2_REPLAY",
      "EXACT_CALLER_SUPPLIED_OPAQUE_ARTIFACT_BYTES_AND_HASH",
    ],
    doesNotProve: [
      "TRUST_POLICY_OR_TRANSPORT_PROVENANCE",
      "CRYPTOGRAPHIC_PROVIDER_RESPONSE",
      "INDEPENDENT_EXTERNAL_HEAD",
    ],
  },
  externalAnchorV1: {
    proves: [
      "REKOR_V2_DIGEST_INCLUSION_AND_SIGNED_CHECKPOINT_UNDER_CALLER_KEYS",
      "CONFIGURED_CHECKPOINT_COSIGNATURES_UNDER_CALLER_KEYS",
    ],
    doesNotProve: [
      "TRUST_KEY_OR_OPERATOR_INDEPENDENCE",
      "CROSS_CHECKPOINT_CONSISTENCY_OR_SPLIT_VIEW_EXCLUSION",
      "ATTEMPT_SET_ANCESTRY_BINDING_WITH_ITS_CENSUS_ONLY_CONSTRUCTOR",
    ],
  },
  networkLifecycleCheckpointAndRekor: {
    proves: [
      "LOCAL_SOURCE_PAGE_TO_LIFECYCLE_CHECKPOINT_REPLAY",
      "LIFECYCLE_STATEMENT_SIGNATURE_SET_INCLUSION_AND_SIGNED_CHECKPOINT_UNDER_CALLER_POLICY",
    ],
    doesNotProve: [
      "INJECTED_TRANSPORT_PROVENANCE",
      "EXTERNALLY_SOURCED_TRUST_POLICY",
      "NON_EQUIVOCATION_OR_WORM_RETENTION",
    ],
  },
  attemptSetExternalWitnessV2: {
    provesWhenVerificationOk: [
      "FRESH_FULL_LOCAL_ANCESTRY_AND_COMPLETE_HEAD_VECTOR_BINDING",
      "EVERY_EXACT_ENTRY_BYTE_COMMITMENT_BOUND_TO_THE_EXTERNAL_SUBJECT_DIGEST",
      "EXACT_TRUST_AND_TRANSPORT_POLICY_HASH_REPLAY",
      "EXACT_ANCHOR_AND_OPAQUE_TRANSPORT_ARTIFACT_BYTE_REPLAY",
      "ONE_REKOR_V2_SIGNED_CHECKPOINT_INCLUSION_AND_CONFIGURED_COSIGNATURE_QUORUM_UNDER_CALLER_KEYS",
    ],
    stillDoesNotProve: [
      "INDEPENDENTLY_SOURCED_TRUST_OR_ACQUISITION",
      "OPERATOR_OR_WITNESS_RELATIONSHIP_INDEPENDENCE",
      "CROSS_CHECKPOINT_CONSISTENCY_SPLIT_VIEW_EXCLUSION_OR_NON_EQUIVOCATION",
      "DURABLE_EXTERNAL_HEAD_STAGE1_GATE_OR_STAGE2_PERMISSION",
    ],
  },
});

function ownDataValue(object, key, code) {
  const descriptor = ObjectGetOwnPropertyDescriptor(object, key);
  if (!descriptor || !ObjectHasOwn(descriptor, "value")
    || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  if (typeof descriptor.value === "string"
    && descriptor.value.length > MAX_SEMANTIC_STRING_CODE_UNITS) {
    fail(`${code}_FIELD_SIZE_INVALID`);
  }
  return descriptor.value;
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object") fail(`${code}_OBJECT_INVALID`);
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (ArrayIsArray(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  /* Never enumerate caller keys.  Any own-key census, including For-In's
     internal [[OwnPropertyKeys]], may materialize an attacker-wide list before
     JavaScript can stop.  Only the fixed semantic fields are read; every
     unknown enumerable, hidden, symbol, or inherited property is inert. */
  for (let index = 0; index < fields.length; index += 1) {
    ownDataValue(value, fields[index], code);
  }
  return value;
}

function fixedObjectView(value, fields, code) {
  exactObject(value, fields, code);
  const output = {};
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    ObjectDefineProperty(output, field, {
      value: ownDataValue(value, field, code),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return output;
}

function fixedArrayView(value, maximum, code, itemNormalizer) {
  if (value === null || typeof value !== "object") fail(`${code}_ARRAY_INVALID`);
  if (isProxy(value)) fail("PROXY_FORBIDDEN");
  if (!ArrayIsArray(value)
    || ObjectGetPrototypeOf(value) !== ArrayPrototype) fail(`${code}_ARRAY_INVALID`);
  const lengthDescriptor = ObjectGetOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !ObjectHasOwn(lengthDescriptor, "value")
    || !NumberIsSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0
    || lengthDescriptor.value > maximum) fail(`${code}_ARRAY_INVALID`);
  const output = new ArrayConstructor(lengthDescriptor.value);
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const key = StringConstructor(index);
    const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_ARRAY_INVALID`);
    ObjectDefineProperty(output, key, {
      value: itemNormalizer(descriptor.value, index),
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  return output;
}

function cloneInternal(value) {
  let encoded;
  try { encoded = canonicalizeStrict(value); }
  catch { fail("CANONICAL_DATA_REQUIRED"); }
  if (BufferByteLength(encoded, "utf8") > MAX_CANONICAL_BYTES) {
    fail("CANONICAL_BYTE_BUDGET_EXCEEDED");
  }
  let parsed;
  try { parsed = JSONParse(encoded); }
  catch { fail("CANONICAL_DATA_REQUIRED"); }
  return deepFreeze(parsed);
}

/* Compare a schema-guided semantic view to a trusted constructor result.  The
   expected side supplies the only key traversal; caller objects are never
   enumerated or coerced, and every leaf comparison is strict. */
function sameFixedShape(actual, expected) {
  if (expected === null || typeof expected !== "object") return actual === expected;
  if (ArrayIsArray(expected)) {
    if (!ArrayIsArray(actual) || actual.length !== expected.length) return false;
    for (let index = 0; index < expected.length; index += 1) {
      if (!sameFixedShape(actual[index], expected[index])) return false;
    }
    return true;
  }
  if (actual === null || typeof actual !== "object" || ArrayIsArray(actual)
    || isProxy(actual)) return false;
  const keys = ObjectKeys(expected);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (!ObjectHasOwn(actual, key)
      || !sameFixedShape(actual[key], expected[key])) return false;
  }
  return true;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
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

function mediaType(value, code) {
  if (typeof value !== "string" || !RegExpTest(MEDIA_TYPE, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `outsider:${domain}:v2\0`, "utf8");
  HashUpdate(state, typeof value === "string" ? value : canonicalizeStrict(value), "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

/* outsider-external-anchor/v1 hashes its request body without a domain. */
function parentDigest(value) {
  const state = createHash("sha256");
  HashUpdate(state, canonicalizeStrict(value), "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function localHeadV2Digest(domain, value) {
  const state = createHash("sha256");
  HashUpdate(state, `${domain}\0${canonicalizeStrict(value)}`, "utf8");
  return `sha256:${HashDigest(state, "hex")}`;
}

function byteDigest(bytes) {
  const state = createHash("sha256");
  HashUpdate(state, bytes);
  return `sha256:${HashDigest(state, "hex")}`;
}

function strictBytes(value, code) {
  if (isProxy(value) || !BufferIsBuffer(value)
    || ObjectGetPrototypeOf(value) !== BufferPrototype
    || ObjectHasOwn(value, "length") || ObjectHasOwn(value, "byteLength")) {
    fail(`${code}_BUFFER_REQUIRED`);
  }
  let length;
  try { length = TypedArrayLength(value); }
  catch { fail(`${code}_LENGTH_INVALID`); }
  if (!NumberIsSafeInteger(length) || length < 1 || length > MAX_RAW_BYTES) {
    fail(`${code}_SIZE_INVALID`);
  }
  const copy = BufferAllocUnsafe(length);
  const copied = BufferCopy(value, copy, 0, 0, length);
  if (copied !== length || TypedArrayLength(copy) !== length) fail(`${code}_COPY_INVALID`);
  return copy;
}

function strictBase64(value, code) {
  if (typeof value !== "string" || value.length < 4
    || value.length > MAX_RAW_BYTES * 2 || !RegExpTest(BASE64, value)) {
    fail(`${code}_INVALID`);
  }
  const bytes = BufferFrom(value, "base64");
  if (TypedArrayLength(bytes) < 1 || TypedArrayLength(bytes) > MAX_RAW_BYTES
    || BufferToString(bytes, "base64") !== value) fail(`${code}_INVALID`);
  return bytes;
}

function httpsOrigin(value, code) {
  if (typeof value !== "string" || value.length < 9 || value.length > 2048) {
    fail(`${code}_INVALID`);
  }
  let parsed;
  try { parsed = new URLConstructor(value); }
  catch { fail(`${code}_INVALID`); }
  if (URLProtocolGet(parsed) !== "https:" || URLOriginGet(parsed) !== value
    || URLUsernameGet(parsed) !== "" || URLPasswordGet(parsed) !== ""
    || URLPathnameGet(parsed) !== "/" || URLSearchGet(parsed) !== ""
    || URLHashGet(parsed) !== "") {
    fail(`${code}_INVALID`);
  }
  return value;
}

function localContext(value, code) {
  const view = fixedObjectView(value,
    ["directory", "registryId", "expectedLocalHeadHash"], code);
  if (typeof view.directory !== "string" || view.directory.length < 1
    || view.directory.length > MAX_LOCAL_DIRECTORY_CODE_UNITS
    || typeof view.registryId !== "string"
    || !RegExpTest(REGISTRY_ID, view.registryId)) fail(`${code}_INVALID`);
  return {
    directory: view.directory,
    registryId: view.registryId,
    expectedLocalHeadHash: hash(view.expectedLocalHeadHash,
      `${code}_EXPECTED_LOCAL_HEAD_HASH`),
  };
}

function replayLocalHead(context) {
  const verified = verifyEpisodeAttemptSetLocalHeadV2(context);
  if (verified?.ok !== true
    || verified.expectedLocalHeadHashProvided !== true
    || verified.expectedLocalHeadHashMatched !== true
    || verified.fullAncestryReplayVerified !== true
    || verified.everyStoredV1CompositionDerivationVerified !== true
    || verified.everyStoredV1ImmediatePrefixVerified !== true
    || verified.exactStoredEntrySetReplayed !== true
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
    || !RegExpTest(HASH, StringConstructor(verified.verificationHash))
    || !ArrayIsArray(verified.entryByteCommitments)
    || verified.entryByteCommitments.length < 1
    || verified.entryByteCommitments.length > MAX_ENTRY_COMMITMENTS
    || verified.entryByteCommitments.length !== head.entryCount) {
    fail("LOCAL_HEAD_V2_REPLAY_SHAPE_INVALID");
  }
  return verified;
}

function normalizeTrustPolicy(value, expectedHash) {
  const top = fixedObjectView(value, ["schema", "provider", "profile",
    "trustMaterial", "requirements", "policyHash"], "TRUST_POLICY");
  const provider = fixedObjectView(top.provider,
    ["providerId", "operatorRelationship", "relationshipAuthority"],
    "TRUST_POLICY_PROVIDER");
  const relationshipAuthority = fixedObjectView(provider.relationshipAuthority,
    ["basis", "evidenceHash"],
    "TRUST_POLICY_RELATIONSHIP_AUTHORITY");
  const profile = fixedObjectView(top.profile, ["kind", "endpointOrigin"],
    "TRUST_POLICY_PROFILE");
  const requirements = fixedObjectView(top.requirements,
    ["existenceTimeRequired", "inclusionProofRequired",
    "appendOnlyConsistencyRequired", "independentWitnessQuorum"],
    "TRUST_POLICY_REQUIREMENTS");
  const trustMaterialTop = fixedObjectView(top.trustMaterial,
    ["kind", "origin", "logPublicKeyPem", "witnesses"],
    "TRUST_POLICY_REKOR_TRUST_MATERIAL");
  const witnesses = fixedArrayView(trustMaterialTop.witnesses, 16,
    "TRUST_POLICY_REKOR_WITNESSES", (item) => fixedObjectView(item,
      ["name", "operatorId", "operatorRelationship", "relationshipEvidenceHash",
        "publicKeyPem"], "TRUST_POLICY_REKOR_WITNESS"));
  const trustMaterial = {
    kind: trustMaterialTop.kind,
    origin: trustMaterialTop.origin,
    logPublicKeyPem: trustMaterialTop.logPublicKeyPem,
    witnesses,
  };
  const policy = {
    schema: top.schema,
    provider: {
      providerId: provider.providerId,
      operatorRelationship: provider.operatorRelationship,
      relationshipAuthority,
    },
    profile,
    trustMaterial,
    requirements,
    policyHash: top.policyHash,
  };
  if (relationshipAuthority.basis
      !== "OUT_OF_RECORD_POLICY_ASSERTION_NOT_RECEIPT_SELF_REPORT"
    || hash(relationshipAuthority.evidenceHash,
      "TRUST_POLICY_RELATIONSHIP_EVIDENCE_HASH")
      !== relationshipAuthority.evidenceHash
    || trustMaterial.kind !== "REKOR_V2_CHECKPOINT_TRUST"
    || typeof trustMaterial.origin !== "string"
    || typeof trustMaterial.logPublicKeyPem !== "string") {
    fail("TRUST_POLICY_TRUST_MATERIAL_INVALID");
  }
  for (let index = 0; index < witnesses.length; index += 1) {
    const witness = witnesses[index];
    if (typeof witness.name !== "string" || typeof witness.operatorId !== "string"
      || !RegExpTest(PROVIDER_ID, witness.operatorId)
      || witness.operatorRelationship
        !== ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER
      || hash(witness.relationshipEvidenceHash,
        "TRUST_POLICY_WITNESS_RELATIONSHIP_EVIDENCE_HASH")
        !== witness.relationshipEvidenceHash
      || typeof witness.publicKeyPem !== "string") {
      fail("TRUST_POLICY_WITNESS_INVALID");
    }
  }
  const pinned = hash(expectedHash, "EXPECTED_TRUST_POLICY_HASH");
  if (policy.policyHash !== pinned
    || policy.profile.kind !== EXTERNAL_ANCHOR_PROFILES.REKOR_V2
    || policy.provider.operatorRelationship
      !== ANCHOR_OPERATOR_RELATIONSHIPS.INDEPENDENT_PROVIDER
    || typeof policy.provider.providerId !== "string"
    || !RegExpTest(PROVIDER_ID, policy.provider.providerId)
    || policy.profile.endpointOrigin === null
    || !NumberIsSafeInteger(policy.requirements.independentWitnessQuorum)
    || policy.requirements.independentWitnessQuorum < 1) {
    fail("TRUST_POLICY_PROFILE_OR_PIN_INVALID");
  }
  httpsOrigin(policy.profile.endpointOrigin, "TRUST_POLICY_ENDPOINT_ORIGIN");
  let rebuilt;
  try {
    rebuilt = createExternalAnchorTrustPolicy({
      providerId: policy.provider.providerId,
      operatorRelationship: policy.provider.operatorRelationship,
      profile: policy.profile.kind,
      endpointOrigin: policy.profile.endpointOrigin,
      relationshipEvidenceHash: policy.provider.relationshipAuthority.evidenceHash,
      trustMaterial: policy.trustMaterial,
      independentWitnessQuorum: policy.requirements.independentWitnessQuorum,
    });
  } catch { fail("TRUST_POLICY_PARENT_REPLAY_FAILED"); }
  if (!sameFixedShape(policy, rebuilt)) fail("TRUST_POLICY_PARENT_REPLAY_MISMATCH");
  return cloneInternal(rebuilt);
}

function transportPolicyBody(endpointOrigin, proofMediaType) {
  return {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_SCHEMAS.transportPolicy,
    policyClass: "EXACT_HTTPS_POST_CAPTURE_REQUIREMENTS_NO_TRANSPORT_IMPLEMENTATION",
    endpointOrigin,
    endpointPath: "/api/v2/log/entries",
    endpointUrl: `${endpointOrigin}/api/v2/log/entries`,
    method: "POST",
    redirectPolicy: "ERROR",
    requestMediaType: "application/json",
    responseMediaType: "application/json",
    tlsRequired: true,
    minimumTlsPolicy: "TLS_1_2_OR_STRONGER",
    opaqueTransportProofMediaType: proofMediaType,
    exactProofBytesRequired: true,
    transportProofCryptographicVerifierImplemented: false,
    callerSuppliedProofIsTransportProvenance: false,
    networkSubmissionImplemented: false,
    decisionState: "HOLD",
    authority: "NONE",
  };
}

export function createEpisodeAttemptSetExternalWitnessTransportPolicyV2(input = {}) {
  const view = fixedObjectView(input,
    ["endpointOrigin", "opaqueTransportProofMediaType"],
    "TRANSPORT_POLICY_INPUT");
  const body = transportPolicyBody(
    httpsOrigin(view.endpointOrigin, "TRANSPORT_POLICY_ENDPOINT_ORIGIN"),
    mediaType(view.opaqueTransportProofMediaType, "TRANSPORT_PROOF_MEDIA_TYPE"));
  return deepFreeze({ ...body, policyHash: digest("external-witness-transport-policy", body) });
}

function normalizeTransportPolicy(value, expectedHash) {
  const policy = fixedObjectView(value,
    ["schema", "policyClass", "endpointOrigin", "method",
    "endpointPath", "endpointUrl", "redirectPolicy", "requestMediaType",
    "responseMediaType", "tlsRequired",
    "minimumTlsPolicy", "opaqueTransportProofMediaType", "exactProofBytesRequired",
    "transportProofCryptographicVerifierImplemented",
    "callerSuppliedProofIsTransportProvenance", "networkSubmissionImplemented",
    "decisionState", "authority", "policyHash"], "TRANSPORT_POLICY");
  const expected = createEpisodeAttemptSetExternalWitnessTransportPolicyV2({
    endpointOrigin: policy.endpointOrigin,
    opaqueTransportProofMediaType: policy.opaqueTransportProofMediaType,
  });
  if (!sameFixedShape(policy, expected)
    || policy.policyHash !== hash(expectedHash, "EXPECTED_TRANSPORT_POLICY_HASH")) {
    fail("TRANSPORT_POLICY_REPLAY_OR_PIN_INVALID");
  }
  return expected;
}

function externalFacts() {
  return {
    independentlySourcedTrustPolicyEstablished: false,
    trustPolicyExternalPinProvenanceEstablished: false,
    independentlyObtainedAnchorArtifactEstablished: false,
    hashedRekordIssuerSignatureVerified: false,
    sigstoreTufTrustedRootReplayVerified: false,
    sigstoreSigningConfigReplayVerified: false,
    publicProviderInteroperabilityObserved: false,
    publicProviderLiveArtifactEstablished: false,
    providerAuthenticatedExistenceTimeEstablished: false,
    providerProofTimeVerified: false,
    transportProvenanceEstablished: false,
    providerIdentityEstablished: false,
    providerResponseEstablished: false,
    operatorIndependenceEstablished: false,
    witnessOperatorIndependenceEstablished: false,
    independentPinProvenanceEstablished: false,
    externalHeadPinVerified: false,
    externalAnchorEstablished: false,
    durableExternalHeadEstablished: false,
    independentWitnessEstablished: false,
    wormStorageEstablished: false,
    nonOmissionProofEstablished: false,
    longTermMonitoringEstablished: false,
    crossCheckpointConsistencyVerified: false,
    splitViewExcluded: false,
    nonEquivocationEstablished: false,
    ownerRollbackOrDirectoryReplacementExcluded: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    durableAppendOnlyHistoryEstablished: false,
    globalAttemptAndReportDenominatorComplete: false,
  };
}

function headBindingFromReplay(verified) {
  const head = verified.head;
  /* `verified` is the fresh local-head verifier's own result, never a caller
     projection.  Canonical cloning here therefore cannot enumerate attacker
     metadata and gives this module an immutable private commitment vector. */
  const commitments = cloneInternal(verified.entryByteCommitments);
  const body = {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_SCHEMAS.headBinding,
    bindingClass:
      "PRIVATE_LOCAL_HEAD_V2_FULL_ANCESTRY_AND_EXACT_ENTRY_BYTE_COMMITMENT_VECTOR",
    localHeadVerificationHash: verified.verificationHash,
    localHeadHash: head.headHash,
    localHeadSchema: head.schema,
    registryId: head.registryId,
    episodeHash: head.episodeHash,
    genesisEntryHash: EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_GENESIS_ENTRY_HASH,
    headSequence: head.headSequence,
    headCompositionRevision: head.headCompositionRevision,
    headCompositionHash: head.headCompositionHash,
    headEntryHash: head.headEntryHash,
    entrySetRoot: head.entrySetRoot,
    entryCount: head.entryCount,
    attemptCount: head.attemptCount,
    reportOccurrenceCount: head.reportOccurrenceCount,
    entryByteCommitments: commitments,
    fullAncestryReplayVerified: true,
    fullAncestryScope: verified.fullAncestryScope,
    everyStoredV1CompositionDerivationVerified: true,
    everyStoredV1ImmediatePrefixVerified: true,
    exactStoredEntrySetReplayed: true,
    twoPassEntrySnapshotStabilityVerified: true,
    oneObservedLocalRegistryOnly: true,
    externalFactEstablishedByBinding: false,
  };
  return deepFreeze({ ...body, headBindingHash: digest("external-witness-head-binding", body) });
}

function externalAnchorRequest(subjectHash, trustPolicyHash) {
  const digestHex = StringSlice(subjectHash, "sha256:".length);
  const body = {
    schema: "outsider/external-anchor-request/v1",
    profile: {
      kind: EXTERNAL_ANCHOR_PROFILES.REKOR_V2,
      specification: "SIGSTORE_REKOR_V2_HASHEDREKORD_0.0.2",
    },
    anchorCommitmentHash: subjectHash,
    anchorPolicyHash: trustPolicyHash,
    subjectDigest: { algorithm: "SHA-256", digestHex },
    disclosure: {
      outboundRunData: false,
      content: "COMMITMENT_DIGEST_ONLY_NO_PROMPT_PATH_OUTPUT_OR_EVENT_DATA",
      irreversibleDisclosure: "PUBLIC_DIGEST_SIGNATURE_AND_KEY_OR_CERTIFICATE",
    },
    expectedReceiptMediaType: "application/json",
    wire: {
      mediaType: "application/json",
      apiVersion: "2",
      kind: "hashedrekord",
      artifactDigestAlgorithm: "SHA2_256",
      artifactDigestBase64: BufferToString(BufferFrom(digestHex, "hex"), "base64"),
      issuerSignatureAndVerifierRequired: true,
      networkSubmissionPerformed: false,
    },
  };
  return deepFreeze({ ...body, requestHash: parentDigest(body) });
}

function requestBody(verified, requestedAt, trustPolicy, transportPolicy) {
  const headBinding = headBindingFromReplay(verified);
  const subject = {
    schema: "outsider/episode-attempt-set-external-witness-subject/v2",
    kind: "FULL_LOCAL_HEAD_V2_ANCESTRY_BINDING_COMMITMENT",
    algorithm: "SHA-256",
    digestHex: StringSlice(headBinding.headBindingHash, "sha256:".length),
    headBindingHash: headBinding.headBindingHash,
  };
  return {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_SCHEMAS.request,
    requestClass:
      "PRIVATE_FULL_ANCESTRY_DIGEST_ONLY_REKOR_WITNESS_REQUEST_HOLD_ONLY",
    requestedAt,
    requestedAtIsExternalTimeEvidence: false,
    headBinding,
    subject,
    trustPolicyBinding: {
      policyHash: trustPolicy.policyHash,
      profile: trustPolicy.profile.kind,
      providerId: trustPolicy.provider.providerId,
      endpointOrigin: trustPolicy.profile.endpointOrigin,
      requiredCheckpointCosignatureQuorum:
        trustPolicy.requirements.independentWitnessQuorum,
      exactPolicyRequiredAtReplay: true,
      independentlySourcedPolicyEstablished: false,
      relationshipClaimsEstablished: false,
    },
    transportPolicyBinding: {
      policyHash: transportPolicy.policyHash,
      endpointOrigin: transportPolicy.endpointOrigin,
      endpointPath: transportPolicy.endpointPath,
      endpointUrl: transportPolicy.endpointUrl,
      method: transportPolicy.method,
      redirectPolicy: transportPolicy.redirectPolicy,
      requestMediaType: transportPolicy.requestMediaType,
      responseMediaType: transportPolicy.responseMediaType,
      opaqueTransportProofMediaType: transportPolicy.opaqueTransportProofMediaType,
      exactPolicyRequiredAtReplay: true,
      transportProvenanceEstablished: false,
    },
    externalAnchorRequest: externalAnchorRequest(
      headBinding.headBindingHash, trustPolicy.policyHash),
    disclosure: {
      externallyCommittedDigestOnly: true,
      headBindingIncludedInExternalWire: false,
      registryIdIncludedInExternalWire: false,
      episodeHashIncludedInExternalWire: false,
      headHashesIncludedInExternalWire: false,
      entryByteCommitmentsIncludedInExternalWire: false,
      countsIncludedInExternalWire: false,
      entryOrCompositionBytesIncludedInExternalWire: false,
      rawAnchorArtifactIncludedInRequest: false,
      rawTransportProofIncludedInRequest: false,
    },
    predecessorCandidateV1: {
      consumed: false,
      promoted: false,
      reason:
        "OPAQUE_CALLER_BYTES_CANNOT_BE_UPGRADED_WITHOUT_NEW_EXACT_POLICY_AND_ACQUISITION_EVIDENCE",
    },
    requestPublicationNetworkSafe: false,
    networkSubmissionPerformed: false,
    externalFacts: externalFacts(),
    status: "PARTIAL",
    decisionState: "HOLD",
    disposition: "QUARANTINED",
    authority: "NONE",
    boundary: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_BOUNDARY,
  };
}

function makeRequest(verified, requestedAt, trustPolicy, transportPolicy) {
  const body = requestBody(verified, requestedAt, trustPolicy, transportPolicy);
  return deepFreeze({ ...body, requestHash: digest("external-witness-request", body) });
}

export function createEpisodeAttemptSetExternalWitnessRequestV2(input = {}) {
  const view = fixedObjectView(input, ["localHead", "requestedAt", "trustPolicy",
    "expectedTrustPolicyHash", "transportPolicy", "expectedTransportPolicyHash"],
    "CREATE_REQUEST_INPUT");
  const local = localContext(view.localHead, "CREATE_REQUEST_LOCAL_HEAD");
  const requestedAt = canonicalTime(view.requestedAt, "REQUESTED_AT");
  const trustPolicy = normalizeTrustPolicy(view.trustPolicy,
    view.expectedTrustPolicyHash);
  const transportPolicy = normalizeTransportPolicy(view.transportPolicy,
    view.expectedTransportPolicyHash);
  if (transportPolicy.endpointOrigin !== trustPolicy.profile.endpointOrigin) {
    fail("TRUST_AND_TRANSPORT_ENDPOINT_MISMATCH");
  }
  return makeRequest(replayLocalHead(local), requestedAt, trustPolicy, transportPolicy);
}

function normalizeExternalAnchorRequest(value) {
  const top = fixedObjectView(value, ["schema", "profile", "anchorCommitmentHash",
    "anchorPolicyHash", "subjectDigest", "disclosure",
    "expectedReceiptMediaType", "wire", "requestHash"],
  "EXTERNAL_ANCHOR_REQUEST");
  return {
    ...top,
    profile: fixedObjectView(top.profile, ["kind", "specification"],
      "EXTERNAL_ANCHOR_REQUEST_PROFILE"),
    subjectDigest: fixedObjectView(top.subjectDigest,
      ["algorithm", "digestHex"], "EXTERNAL_ANCHOR_REQUEST_SUBJECT_DIGEST"),
    disclosure: fixedObjectView(top.disclosure,
      ["outboundRunData", "content", "irreversibleDisclosure"],
      "EXTERNAL_ANCHOR_REQUEST_DISCLOSURE"),
    wire: fixedObjectView(top.wire, ["mediaType", "apiVersion", "kind",
      "artifactDigestAlgorithm", "artifactDigestBase64",
      "issuerSignatureAndVerifierRequired", "networkSubmissionPerformed"],
    "EXTERNAL_ANCHOR_REQUEST_WIRE"),
  };
}

function assertRequestStatic(value) {
  const top = fixedObjectView(value, ["schema", "requestClass", "requestedAt",
    "requestedAtIsExternalTimeEvidence", "headBinding", "subject",
    "trustPolicyBinding", "transportPolicyBinding", "externalAnchorRequest",
    "disclosure", "predecessorCandidateV1", "requestPublicationNetworkSafe",
    "networkSubmissionPerformed", "externalFacts", "status", "decisionState",
    "disposition", "authority", "boundary", "requestHash"], "REQUEST");
  const headBindingTop = fixedObjectView(top.headBinding,
    ["schema", "bindingClass",
    "localHeadVerificationHash", "localHeadHash", "localHeadSchema", "registryId",
    "episodeHash", "genesisEntryHash", "headSequence", "headCompositionRevision",
    "headCompositionHash", "headEntryHash", "entrySetRoot", "entryCount",
    "attemptCount", "reportOccurrenceCount", "entryByteCommitments",
    "fullAncestryReplayVerified", "fullAncestryScope",
    "everyStoredV1CompositionDerivationVerified",
    "everyStoredV1ImmediatePrefixVerified", "exactStoredEntrySetReplayed",
    "twoPassEntrySnapshotStabilityVerified", "oneObservedLocalRegistryOnly",
    "externalFactEstablishedByBinding", "headBindingHash"], "HEAD_BINDING");
  const commitments = fixedArrayView(headBindingTop.entryByteCommitments,
    MAX_ENTRY_COMMITMENTS, "HEAD_BINDING_ENTRY_COMMITMENTS",
    (item) => fixedObjectView(item,
      ["sequence", "byteLength", "byteHash", "entryHash", "compositionHash"],
      "HEAD_BINDING_ENTRY_COMMITMENT"));
  if (commitments.length < 1) {
    fail("HEAD_BINDING_ENTRY_COMMITMENTS_INVALID");
  }
  for (let index = 0; index < commitments.length; index += 1) {
    const commitment = commitments[index];
    if (commitment.sequence !== index + 1
      || !NumberIsSafeInteger(commitment.byteLength) || commitment.byteLength < 1
      || typeof commitment.byteHash !== "string"
      || !RegExpTest(HASH, commitment.byteHash)
      || typeof commitment.entryHash !== "string"
      || !RegExpTest(HASH, commitment.entryHash)
      || typeof commitment.compositionHash !== "string"
      || !RegExpTest(HASH, commitment.compositionHash)) {
      fail("HEAD_BINDING_ENTRY_COMMITMENT_INVALID");
    }
  }
  const request = {
    ...top,
    headBinding: { ...headBindingTop, entryByteCommitments: commitments },
    subject: fixedObjectView(top.subject,
      ["schema", "kind", "algorithm", "digestHex", "headBindingHash"], "SUBJECT"),
    trustPolicyBinding: fixedObjectView(top.trustPolicyBinding,
      ["policyHash", "profile", "providerId", "endpointOrigin",
        "requiredCheckpointCosignatureQuorum", "exactPolicyRequiredAtReplay",
        "independentlySourcedPolicyEstablished", "relationshipClaimsEstablished"],
      "TRUST_POLICY_BINDING"),
    transportPolicyBinding: fixedObjectView(top.transportPolicyBinding,
      ["policyHash", "endpointOrigin", "endpointPath", "endpointUrl", "method",
        "redirectPolicy", "requestMediaType", "responseMediaType",
        "opaqueTransportProofMediaType", "exactPolicyRequiredAtReplay",
        "transportProvenanceEstablished"], "TRANSPORT_POLICY_BINDING"),
    externalAnchorRequest: normalizeExternalAnchorRequest(top.externalAnchorRequest),
    disclosure: fixedObjectView(top.disclosure,
      ["externallyCommittedDigestOnly", "headBindingIncludedInExternalWire",
        "registryIdIncludedInExternalWire", "episodeHashIncludedInExternalWire",
        "headHashesIncludedInExternalWire", "entryByteCommitmentsIncludedInExternalWire",
        "countsIncludedInExternalWire", "entryOrCompositionBytesIncludedInExternalWire",
        "rawAnchorArtifactIncludedInRequest", "rawTransportProofIncludedInRequest"],
      "DISCLOSURE"),
    predecessorCandidateV1: fixedObjectView(top.predecessorCandidateV1,
      ["consumed", "promoted", "reason"], "PREDECESSOR_CANDIDATE"),
    externalFacts: fixedObjectView(top.externalFacts, ObjectKeys(externalFacts()),
      "EXTERNAL_FACTS"),
    boundary: fixedObjectView(top.boundary,
      ObjectKeys(EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_BOUNDARY),
      "REQUEST_BOUNDARY"),
  };
  const binding = request.headBinding;
  const { headBindingHash, ...bindingBody } = binding;
  const { requestHash, ...body } = request;
  const expectedExternal = externalAnchorRequest(binding.headBindingHash,
    request.trustPolicyBinding.policyHash);
  if (request.schema !== EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_SCHEMAS.request
    || request.requestClass
      !== "PRIVATE_FULL_ANCESTRY_DIGEST_ONLY_REKOR_WITNESS_REQUEST_HOLD_ONLY"
    || !canonicalTime(request.requestedAt, "REQUESTED_AT")
    || request.requestedAtIsExternalTimeEvidence !== false
    || binding.schema
      !== EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_SCHEMAS.headBinding
    || binding.bindingClass
      !== "PRIVATE_LOCAL_HEAD_V2_FULL_ANCESTRY_AND_EXACT_ENTRY_BYTE_COMMITMENT_VECTOR"
    || !hash(binding.localHeadVerificationHash, "LOCAL_HEAD_VERIFICATION_HASH")
    || !hash(binding.localHeadHash, "LOCAL_HEAD_HASH")
    || typeof binding.localHeadSchema !== "string"
    || typeof binding.registryId !== "string" || !RegExpTest(REGISTRY_ID, binding.registryId)
    || !hash(binding.episodeHash, "EPISODE_HASH")
    || binding.genesisEntryHash
      !== EPISODE_ATTEMPT_SET_LOCAL_HEAD_V2_GENESIS_ENTRY_HASH
    || !NumberIsSafeInteger(binding.headSequence) || binding.headSequence < 1
    || binding.headSequence !== binding.entryCount
    || !NumberIsSafeInteger(binding.headCompositionRevision)
    || binding.headCompositionRevision < 0
    || binding.headCompositionRevision !== binding.headSequence - 1
    || !hash(binding.headCompositionHash, "HEAD_COMPOSITION_HASH")
    || !hash(binding.headEntryHash, "HEAD_ENTRY_HASH")
    || !hash(binding.entrySetRoot, "ENTRY_SET_ROOT")
    || !NumberIsSafeInteger(binding.entryCount) || binding.entryCount < 1
    || binding.entryCount !== binding.entryByteCommitments.length
    || !NumberIsSafeInteger(binding.attemptCount) || binding.attemptCount < 1
    || !NumberIsSafeInteger(binding.reportOccurrenceCount)
    || binding.reportOccurrenceCount < 0
    || binding.headEntryHash
      !== binding.entryByteCommitments[binding.entryByteCommitments.length - 1].entryHash
    || binding.headCompositionHash
      !== binding.entryByteCommitments[binding.entryByteCommitments.length - 1]
        .compositionHash
    || binding.entrySetRoot !== localHeadV2Digest(
      "outsider/episode-attempt-set-local-head-entry-set/v2", {
        schema: "outsider/episode-attempt-set-local-head-entry-set/v2",
        byteCommitments: binding.entryByteCommitments,
      })
    || binding.fullAncestryReplayVerified !== true
    || typeof binding.fullAncestryScope !== "string"
    || binding.everyStoredV1CompositionDerivationVerified !== true
    || binding.everyStoredV1ImmediatePrefixVerified !== true
    || binding.exactStoredEntrySetReplayed !== true
    || binding.twoPassEntrySnapshotStabilityVerified !== true
    || binding.oneObservedLocalRegistryOnly !== true
    || binding.externalFactEstablishedByBinding !== false
    || headBindingHash !== digest("external-witness-head-binding", bindingBody)
    || request.subject.schema
      !== "outsider/episode-attempt-set-external-witness-subject/v2"
    || request.subject.kind !== "FULL_LOCAL_HEAD_V2_ANCESTRY_BINDING_COMMITMENT"
    || request.subject.algorithm !== "SHA-256"
    || typeof request.subject.digestHex !== "string"
    || !RegExpTest(HEX_32, request.subject.digestHex)
    || request.subject.headBindingHash !== headBindingHash
    || request.subject.digestHex !== StringSlice(headBindingHash, "sha256:".length)
    || request.trustPolicyBinding.profile !== EXTERNAL_ANCHOR_PROFILES.REKOR_V2
    || !hash(request.trustPolicyBinding.policyHash, "TRUST_POLICY_HASH")
    || typeof request.trustPolicyBinding.providerId !== "string"
    || !RegExpTest(PROVIDER_ID, request.trustPolicyBinding.providerId)
    || httpsOrigin(request.trustPolicyBinding.endpointOrigin,
      "TRUST_POLICY_BINDING_ENDPOINT") !== request.trustPolicyBinding.endpointOrigin
    || !NumberIsSafeInteger(
      request.trustPolicyBinding.requiredCheckpointCosignatureQuorum)
    || request.trustPolicyBinding.requiredCheckpointCosignatureQuorum < 1
    || request.trustPolicyBinding.exactPolicyRequiredAtReplay !== true
    || request.trustPolicyBinding.independentlySourcedPolicyEstablished !== false
    || request.trustPolicyBinding.relationshipClaimsEstablished !== false
    || !hash(request.transportPolicyBinding.policyHash, "TRANSPORT_POLICY_HASH")
    || request.transportPolicyBinding.endpointOrigin
      !== request.trustPolicyBinding.endpointOrigin
    || request.transportPolicyBinding.endpointPath !== "/api/v2/log/entries"
    || request.transportPolicyBinding.endpointUrl
      !== `${request.transportPolicyBinding.endpointOrigin}/api/v2/log/entries`
    || request.transportPolicyBinding.method !== "POST"
    || request.transportPolicyBinding.redirectPolicy !== "ERROR"
    || request.transportPolicyBinding.requestMediaType !== "application/json"
    || request.transportPolicyBinding.responseMediaType !== "application/json"
    || mediaType(request.transportPolicyBinding.opaqueTransportProofMediaType,
      "TRANSPORT_PROOF_MEDIA_TYPE")
      !== request.transportPolicyBinding.opaqueTransportProofMediaType
    || request.transportPolicyBinding.exactPolicyRequiredAtReplay !== true
    || request.transportPolicyBinding.transportProvenanceEstablished !== false
    || !sameFixedShape(request.externalAnchorRequest, expectedExternal)
    || request.disclosure.externallyCommittedDigestOnly !== true
    || request.disclosure.headBindingIncludedInExternalWire !== false
    || request.disclosure.registryIdIncludedInExternalWire !== false
    || request.disclosure.episodeHashIncludedInExternalWire !== false
    || request.disclosure.headHashesIncludedInExternalWire !== false
    || request.disclosure.entryByteCommitmentsIncludedInExternalWire !== false
    || request.disclosure.countsIncludedInExternalWire !== false
    || request.disclosure.entryOrCompositionBytesIncludedInExternalWire !== false
    || request.disclosure.rawAnchorArtifactIncludedInRequest !== false
    || request.disclosure.rawTransportProofIncludedInRequest !== false
    || request.predecessorCandidateV1.consumed !== false
    || request.predecessorCandidateV1.promoted !== false
    || request.predecessorCandidateV1.reason
      !== "OPAQUE_CALLER_BYTES_CANNOT_BE_UPGRADED_WITHOUT_NEW_EXACT_POLICY_AND_ACQUISITION_EVIDENCE"
    || request.requestPublicationNetworkSafe !== false
    || request.networkSubmissionPerformed !== false
    || !sameFixedShape(request.externalFacts, externalFacts())
    || request.status !== "PARTIAL" || request.decisionState !== "HOLD"
    || request.disposition !== "QUARANTINED" || request.authority !== "NONE"
    || !sameFixedShape(request.boundary,
      EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_BOUNDARY)
    || requestHash !== digest("external-witness-request", body)) {
    fail("REQUEST_INVALID");
  }
  return request;
}

function transportCaptureBody(request, evidence, proofBytes, proofMediaType,
  observedAtLocally) {
  return {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_SCHEMAS.transportCapture,
    captureClass:
      "CALLER_SUPPLIED_OPAQUE_TRANSPORT_PROOF_BYTES_EXACT_REPLAY_NO_PROVENANCE",
    observedAtLocally,
    observedAtIsExternalTimeEvidence: false,
    requestHash: request.requestHash,
    externalAnchorRequestHash: request.externalAnchorRequest.requestHash,
    externalAnchorEvidenceHash: evidence.evidenceHash,
    endpointOrigin: request.transportPolicyBinding.endpointOrigin,
    endpointPath: request.transportPolicyBinding.endpointPath,
    endpointUrl: request.transportPolicyBinding.endpointUrl,
    method: "POST",
    redirectPolicy: "ERROR",
    anchorArtifactHash: evidence.artifact.artifactHash,
    proof: {
      mediaType: proofMediaType,
      bytesBase64: BufferToString(proofBytes, "base64"),
      byteLength: TypedArrayLength(proofBytes),
      byteHash: byteDigest(proofBytes),
      exactBytesEncodedInPrivateRecord: true,
      cryptographicVerificationPerformed: false,
      networkProjectionPermitted: false,
    },
    networkTransportObservedByThisModule: false,
    transportProvenanceEstablished: false,
    providerIdentityEstablished: false,
    providerResponseEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
  };
}

function makeTransportCapture(request, evidence, proofBytes, proofMediaType,
  observedAtLocally) {
  const body = transportCaptureBody(request, evidence, proofBytes, proofMediaType,
    observedAtLocally);
  return deepFreeze({ ...body, captureHash: digest("external-witness-transport-capture", body) });
}

function candidateBody(request, evidence, transportCapture) {
  return {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_SCHEMAS.candidate,
    candidateClass:
      "PRIVATE_EXACT_REKOR_AND_TRANSPORT_ARTIFACT_INPUTS_NO_EXTERNAL_PROVENANCE",
    request,
    externalAnchorEvidence: evidence,
    transportCapture,
    rawAnchorArtifactPrivateOnly: true,
    rawTransportProofPrivateOnly: true,
    privateStoragePermissionsEstablished: false,
    candidatePublicationNetworkSafe: false,
    networkSubmissionPerformed: false,
    externalFacts: externalFacts(),
    result: "EXACT_INPUTS_CAPTURED_EXTERNAL_FACT_NOT_ESTABLISHED",
    status: "PARTIAL",
    decisionState: "HOLD",
    disposition: "QUARANTINED",
    authority: "NONE",
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
    boundary: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_BOUNDARY,
  };
}

function makeCandidate(request, evidence, transportCapture) {
  const body = candidateBody(request, evidence, transportCapture);
  return deepFreeze({ ...body, candidateHash: digest("external-witness-candidate", body) });
}

export function captureEpisodeAttemptSetExternalWitnessCandidateV2(input = {}) {
  const view = fixedObjectView(input, ["request", "providerId", "anchorArtifactBytes",
    "receivedAtLocallyObserved", "transportProofBytes", "transportProofMediaType"],
    "CAPTURE_INPUT");
  const request = assertRequestStatic(view.request);
  if (typeof view.providerId !== "string"
    || !RegExpTest(PROVIDER_ID, view.providerId)
    || view.providerId !== request.trustPolicyBinding.providerId) {
    fail("PROVIDER_ID_MISMATCH");
  }
  const receivedAt = canonicalTime(view.receivedAtLocallyObserved,
    "RECEIVED_AT_LOCALLY_OBSERVED");
  if (DateParse(receivedAt) < DateParse(request.requestedAt)) {
    fail("LOCAL_CAPTURE_PRECEDES_REQUEST");
  }
  const artifactBytes = strictBytes(view.anchorArtifactBytes, "ANCHOR_ARTIFACT_BYTES");
  const transportProofBytes = strictBytes(view.transportProofBytes,
    "TRANSPORT_PROOF_BYTES");
  const proofMediaType = mediaType(view.transportProofMediaType,
    "TRANSPORT_PROOF_MEDIA_TYPE");
  if (proofMediaType !== request.transportPolicyBinding.opaqueTransportProofMediaType) {
    fail("TRANSPORT_PROOF_MEDIA_TYPE_MISMATCH");
  }
  let evidence;
  try {
    evidence = captureExternalAnchorEvidence({
      request: request.externalAnchorRequest,
      providerId: view.providerId,
      artifact: artifactBytes,
      artifactMediaType: "application/json",
      receivedAtLocal: receivedAt,
    });
  } catch { fail("PARENT_ANCHOR_EVIDENCE_CAPTURE_FAILED"); }
  const transportCapture = makeTransportCapture(request, evidence,
    transportProofBytes, proofMediaType, receivedAt);
  return makeCandidate(request, cloneInternal(evidence), transportCapture);
}

function normalizeAnchorEvidence(value) {
  const top = fixedObjectView(value, ["schema", "requestHash", "profile",
    "providerId", "receivedAtLocal", "localTimeAuthority", "artifact",
    "evidenceHash"], "ANCHOR_EVIDENCE");
  return {
    ...top,
    artifact: fixedObjectView(top.artifact,
      ["mediaType", "bytesBase64", "byteLength", "artifactHash"],
      "ANCHOR_EVIDENCE_ARTIFACT"),
  };
}

function assertEvidenceReplay(candidate) {
  const evidence = candidate.externalAnchorEvidence;
  const bytes = strictBase64(evidence.artifact.bytesBase64,
    "ANCHOR_EVIDENCE_ARTIFACT_BASE64");
  let rebuilt;
  try {
    rebuilt = captureExternalAnchorEvidence({
      request: candidate.request.externalAnchorRequest,
      providerId: evidence.providerId,
      artifact: bytes,
      artifactMediaType: evidence.artifact.mediaType,
      receivedAtLocal: evidence.receivedAtLocal,
    });
  } catch { fail("ANCHOR_EVIDENCE_PARENT_REPLAY_FAILED"); }
  if (!sameFixedShape(evidence, rebuilt)) fail("ANCHOR_EVIDENCE_REPLAY_MISMATCH");
  return { evidence, bytes };
}

function normalizeTransportCapture(value) {
  const top = fixedObjectView(value, ["schema", "captureClass",
    "observedAtLocally", "observedAtIsExternalTimeEvidence", "requestHash",
    "externalAnchorRequestHash", "externalAnchorEvidenceHash", "endpointOrigin",
    "method", "redirectPolicy", "endpointPath", "endpointUrl",
    "anchorArtifactHash", "proof", "networkTransportObservedByThisModule",
    "transportProvenanceEstablished", "providerIdentityEstablished",
    "providerResponseEstablished", "decisionState", "authority", "captureHash"],
  "TRANSPORT_CAPTURE");
  return {
    ...top,
    proof: fixedObjectView(top.proof,
      ["mediaType", "bytesBase64", "byteLength", "byteHash",
        "exactBytesEncodedInPrivateRecord", "cryptographicVerificationPerformed",
        "networkProjectionPermitted"], "TRANSPORT_CAPTURE_PROOF"),
  };
}

function assertTransportCaptureReplay(candidate) {
  const capture = candidate.transportCapture;
  const proofBytes = strictBase64(capture.proof.bytesBase64,
    "TRANSPORT_CAPTURE_PROOF_BASE64");
  const proofMediaType = mediaType(capture.proof.mediaType,
    "TRANSPORT_CAPTURE_PROOF_MEDIA_TYPE");
  if (proofMediaType
      !== candidate.request.transportPolicyBinding.opaqueTransportProofMediaType) {
    fail("TRANSPORT_CAPTURE_PROOF_MEDIA_TYPE_MISMATCH");
  }
  const observedAt = canonicalTime(capture.observedAtLocally,
    "TRANSPORT_CAPTURE_OBSERVED_AT_LOCALLY");
  const expected = makeTransportCapture(candidate.request,
    candidate.externalAnchorEvidence, proofBytes, proofMediaType, observedAt);
  if (!sameFixedShape(capture, expected)) fail("TRANSPORT_CAPTURE_REPLAY_MISMATCH");
  return { capture, proofBytes };
}

function assertCandidate(value) {
  const top = fixedObjectView(value, ["schema", "candidateClass", "request",
    "externalAnchorEvidence", "transportCapture", "rawAnchorArtifactPrivateOnly",
    "rawTransportProofPrivateOnly", "privateStoragePermissionsEstablished",
    "candidatePublicationNetworkSafe", "networkSubmissionPerformed", "externalFacts",
    "result", "status", "decisionState", "disposition", "authority",
    "enabledCapabilityCount", "provenAuthorityCount",
    "enabledCapabilitiesSubsetOfProvenAuthority", "consequenceReach", "actionReady",
    "actionAuthorized", "actionAdmissions", "executable", "automaticTraining",
    "productionTrainingAuthorized", "trainingRows", "causalExperienceUnits",
    "actorCredit", "moneyMovementEnabled", "custodyEstablished", "fundsVerified",
    "platformAdvanceEnabled", "pricingAuthorized", "permitsPricing",
    "guaranteeEstablished", "permitsGuarantee", "insuranceEstablished",
    "permitsInsurance", "settlementAuthorized", "permitsSettlement", "boundary",
    "candidateHash"], "CANDIDATE");
  const request = assertRequestStatic(top.request);
  const candidate = {
    ...top,
    request,
    externalAnchorEvidence: normalizeAnchorEvidence(top.externalAnchorEvidence),
    transportCapture: normalizeTransportCapture(top.transportCapture),
    externalFacts: fixedObjectView(top.externalFacts, ObjectKeys(externalFacts()),
      "CANDIDATE_EXTERNAL_FACTS"),
    boundary: fixedObjectView(top.boundary,
      ObjectKeys(EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_BOUNDARY),
      "CANDIDATE_BOUNDARY"),
  };
  const evidence = assertEvidenceReplay(candidate);
  const transport = assertTransportCaptureReplay(candidate);
  const { candidateHash, ...body } = candidate;
  if (candidate.schema
      !== EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_SCHEMAS.candidate
    || candidate.candidateClass
      !== "PRIVATE_EXACT_REKOR_AND_TRANSPORT_ARTIFACT_INPUTS_NO_EXTERNAL_PROVENANCE"
    || candidate.rawAnchorArtifactPrivateOnly !== true
    || candidate.rawTransportProofPrivateOnly !== true
    || candidate.privateStoragePermissionsEstablished !== false
    || candidate.candidatePublicationNetworkSafe !== false
    || candidate.networkSubmissionPerformed !== false
    || !sameFixedShape(candidate.externalFacts, externalFacts())
    || candidate.result !== "EXACT_INPUTS_CAPTURED_EXTERNAL_FACT_NOT_ESTABLISHED"
    || candidate.status !== "PARTIAL" || candidate.decisionState !== "HOLD"
    || candidate.disposition !== "QUARANTINED" || candidate.authority !== "NONE"
    || candidate.enabledCapabilityCount !== 0 || candidate.provenAuthorityCount !== 0
    || candidate.enabledCapabilitiesSubsetOfProvenAuthority !== true
    || candidate.consequenceReach !== "NONE" || candidate.actionReady !== false
    || candidate.actionAuthorized !== false || candidate.actionAdmissions !== 0
    || candidate.executable !== false || candidate.automaticTraining !== false
    || candidate.productionTrainingAuthorized !== false || candidate.trainingRows !== 0
    || candidate.causalExperienceUnits !== 0 || candidate.actorCredit !== false
    || candidate.moneyMovementEnabled !== false || candidate.custodyEstablished !== false
    || candidate.fundsVerified !== false || candidate.platformAdvanceEnabled !== false
    || candidate.pricingAuthorized !== false || candidate.permitsPricing !== false
    || candidate.guaranteeEstablished !== false || candidate.permitsGuarantee !== false
    || candidate.insuranceEstablished !== false || candidate.permitsInsurance !== false
    || candidate.settlementAuthorized !== false || candidate.permitsSettlement !== false
    || !sameFixedShape(candidate.boundary,
      EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_BOUNDARY)
    || !hash(candidateHash, "CANDIDATE_HASH")
    || candidateHash !== digest("external-witness-candidate", body)) {
    fail("CANDIDATE_INVALID");
  }
  return { candidate, request, evidence, transport };
}

function verificationBoundaryFields() {
  return {
    callerPinsAcceptedAsExternalProvenance: false,
    operatorSelfSignatureAcceptedAsIndependentWitness: false,
    singleTimestampAcceptedAsNonEquivocationProof: false,
    singleSignedCheckpointAcceptedAsNonEquivocationProof: false,
    checkpointCosignatureCountAcceptedAsWitnessIndependenceProof: false,
    independentlySourcedTrustPolicyEstablished: false,
    trustPolicyExternalPinProvenanceEstablished: false,
    independentlyObtainedAnchorArtifactEstablished: false,
    hashedRekordIssuerSignatureVerified: false,
    sigstoreTufTrustedRootReplayVerified: false,
    sigstoreSigningConfigReplayVerified: false,
    publicProviderInteroperabilityObserved: false,
    publicProviderLiveArtifactEstablished: false,
    providerAuthenticatedExistenceTimeEstablished: false,
    providerProofTimeVerified: false,
    transportProvenanceEstablished: false,
    providerIdentityEstablished: false,
    providerResponseEstablished: false,
    operatorIndependenceEstablished: false,
    witnessOperatorIndependenceEstablished: false,
    independentPinProvenanceEstablished: false,
    externalHeadPinVerified: false,
    externalAnchorEstablished: false,
    durableExternalHeadEstablished: false,
    independentWitnessEstablished: false,
    wormStorageEstablished: false,
    nonOmissionProofEstablished: false,
    longTermMonitoringEstablished: false,
    crossCheckpointConsistencyVerified: false,
    splitViewExcluded: false,
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
    status: "PARTIAL",
    decisionState: "HOLD",
    disposition: "QUARANTINED",
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
    verificationPublicationNetworkSafe: false,
    boundary: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_BOUNDARY,
  };
}

function sanitizedFailure(error) {
  const fallback = "EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_UNTRUSTED_FAILURE";
  try {
    if (error === null || typeof error !== "object" || isProxy(error)
      || FunctionHasInstance(ErrorConstructor, error) !== true) return fallback;
    const descriptor = ObjectGetOwnPropertyDescriptor(error, "message");
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || typeof descriptor.value !== "string") return fallback;
    return RegExpTest(TYPED_ERROR, descriptor.value) ? descriptor.value : fallback;
  } catch { return fallback; }
}

function verificationFailure(error) {
  return deepFreeze({
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_SCHEMAS.verification,
    ok: false,
    replayClass: "OFFLINE_PRIVATE_REPLAY_FAILED_HOLD_ONLY",
    error: sanitizedFailure(error),
    localHeadFreshFullAncestryReplayVerified: false,
    everyEntryByteCommitmentBoundAndReplayed: false,
    completeHeadVectorBoundAndReplayed: false,
    exactTrustPolicyReplayed: false,
    exactTransportPolicyReplayed: false,
    exactAnchorArtifactBytesReplayed: false,
    exactTransportProofBytesReplayed: false,
    anchorArtifactDigestInSignedCheckpointVerifiedUnderCallerPolicy: false,
    signedCheckpointVerifiedUnderCallerPolicy: false,
    checkpointCosignatureQuorumCryptographicallyVerified: false,
    checkpointCosignaturesVerified: 0,
    transportProofCryptographicVerificationPerformed: false,
    networkOrTransportPerformed: false,
    rawAnchorArtifactProjected: false,
    rawTransportProofProjected: false,
    privateStoragePermissionsEstablished: false,
    ...verificationBoundaryFields(),
  });
}

export function verifyEpisodeAttemptSetExternalWitnessCandidateV2(
  record, context = {}) {
  try {
    const view = fixedObjectView(context,
      ["localHead", "trustPolicy", "expectedTrustPolicyHash",
      "transportPolicy", "expectedTransportPolicyHash", "expectedRequestHash",
      "expectedCandidateHash", "expectedAnchorEvidenceHash",
      "expectedTransportProofByteHash"], "VERIFY_CONTEXT");
    const local = localContext(view.localHead, "VERIFY_LOCAL_HEAD");
    const trustPolicy = normalizeTrustPolicy(view.trustPolicy,
      view.expectedTrustPolicyHash);
    const transportPolicy = normalizeTransportPolicy(view.transportPolicy,
      view.expectedTransportPolicyHash);
    if (transportPolicy.endpointOrigin !== trustPolicy.profile.endpointOrigin) {
      fail("TRUST_AND_TRANSPORT_ENDPOINT_MISMATCH");
    }
    const expectedRequestHash = hash(view.expectedRequestHash,
      "EXPECTED_REQUEST_HASH");
    const expectedCandidateHash = hash(view.expectedCandidateHash,
      "EXPECTED_CANDIDATE_HASH");
    const expectedEvidenceHash = hash(view.expectedAnchorEvidenceHash,
      "EXPECTED_ANCHOR_EVIDENCE_HASH");
    const expectedTransportProofByteHash = hash(
      view.expectedTransportProofByteHash,
      "EXPECTED_TRANSPORT_PROOF_BYTE_HASH");
    const checked = assertCandidate(record);
    if (checked.request.requestHash !== expectedRequestHash
      || checked.candidate.candidateHash !== expectedCandidateHash
      || checked.evidence.evidence.evidenceHash !== expectedEvidenceHash
      || checked.transport.capture.proof.byteHash !== expectedTransportProofByteHash) {
      fail("EXPECTED_PIN_MISMATCH");
    }
    const replayed = replayLocalHead(local);
    const rebuiltRequest = makeRequest(replayed, checked.request.requestedAt,
      trustPolicy, transportPolicy);
    if (!sameFixedShape(checked.request, rebuiltRequest)) {
      fail("REQUEST_FRESH_REPLAY_MISMATCH");
    }
    const rebuiltTransport = makeTransportCapture(rebuiltRequest,
      checked.evidence.evidence, checked.transport.proofBytes,
      checked.transport.capture.proof.mediaType,
      checked.transport.capture.observedAtLocally);
    const rebuiltCandidate = makeCandidate(rebuiltRequest,
      checked.evidence.evidence, rebuiltTransport);
    if (!sameFixedShape(checked.candidate, rebuiltCandidate)) {
      fail("CANDIDATE_REPLAY_MISMATCH");
    }
    const anchor = verifyExternalAnchorEvidence({
      request: rebuiltRequest.externalAnchorRequest,
      evidence: checked.evidence.evidence,
      trustPolicy,
    });
    if (anchor?.ok !== true || anchor.builtInCryptographicVerification !== true
      || anchor.cryptographicArtifactVerified !== true
      || anchor.operatorIndependenceEstablished !== false
      || anchor.proof?.inclusionProofVerified !== true
      || anchor.proof.checkpointSignatureVerified !== true
      || !NumberIsSafeInteger(anchor.proof.witnessSignaturesVerified)
      || anchor.proof.witnessSignaturesVerified
        < trustPolicy.requirements.independentWitnessQuorum
      || anchor.proof.witnessOperatorIndependenceEstablished !== false) {
      fail("REKOR_PARENT_CRYPTO_REPLAY_FAILED");
    }
    const body = {
      schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_V2_SCHEMAS.verification,
      ok: true,
      replayClass:
        "FULL_LOCAL_ANCESTRY_AND_SINGLE_REKOR_CHECKPOINT_CRYPTO_REPLAY_HOLD_ONLY",
      candidateHash: rebuiltCandidate.candidateHash,
      requestHash: rebuiltRequest.requestHash,
      headBindingHash: rebuiltRequest.headBinding.headBindingHash,
      localHeadHash: rebuiltRequest.headBinding.localHeadHash,
      localHeadVerificationHash:
        rebuiltRequest.headBinding.localHeadVerificationHash,
      trustPolicyHash: trustPolicy.policyHash,
      transportPolicyHash: transportPolicy.policyHash,
      anchorEvidenceHash: checked.evidence.evidence.evidenceHash,
      anchorArtifactHash: checked.evidence.evidence.artifact.artifactHash,
      transportCaptureHash: rebuiltTransport.captureHash,
      transportProofByteHash: rebuiltTransport.proof.byteHash,
      localHeadFreshFullAncestryReplayVerified: true,
      everyEntryByteCommitmentBoundAndReplayed: true,
      completeHeadVectorBoundAndReplayed: true,
      exactTrustPolicyReplayed: true,
      exactTransportPolicyReplayed: true,
      exactAnchorArtifactBytesReplayed: true,
      exactTransportProofBytesReplayed: true,
      anchorArtifactDigestInSignedCheckpointVerifiedUnderCallerPolicy: true,
      signedCheckpointVerifiedUnderCallerPolicy: true,
      checkpointCosignatureQuorumCryptographicallyVerified: true,
      checkpointCosignaturesVerified: anchor.proof.witnessSignaturesVerified,
      transportProofCryptographicVerificationPerformed: false,
      networkOrTransportPerformed: false,
      rawAnchorArtifactProjected: false,
      rawTransportProofProjected: false,
      privateStoragePermissionsEstablished: false,
      ...verificationBoundaryFields(),
    };
    return deepFreeze({ ...body, verificationHash: digest(
      "external-witness-verification", body) });
  } catch (error) {
    return verificationFailure(error);
  }
}
