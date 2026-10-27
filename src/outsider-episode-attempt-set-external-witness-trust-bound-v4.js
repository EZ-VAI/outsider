/*
 * Private HOLD-only binding between the full-ancestry external-witness v2
 * replay and the caller-bootstrap Sigstore/TUF trust-material v3 replay.
 *
 * This module adds no transport, publication, or filesystem write path.  It
 * freshly invokes both parents and then proves only a private, deterministic
 * crosswalk: exact Rekor endpoint/method/redirect policy, one P-256 SPKI
 * commitment, the checkpoint origin, and the ordered local witness key policy.
 * The v2 parent may read its caller-selected local-head directory while doing
 * its required fresh ancestry replay.  Neither that read nor any successful
 * cryptography establishes independent provenance, a live public provider,
 * operational independence, non-equivocation, or a durable external head.
 * Raw parent records, PEM/DER, TUF metadata, proof bytes, entry commitments,
 * wire bytes, and filesystem paths are never projected by this module.
 */

import { createHash, createPublicKey } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyEpisodeAttemptSetExternalWitnessCandidateV2,
} from "./outsider-episode-attempt-set-external-witness-v2.js";
import {
  createEpisodeAttemptSetExternalWitnessKeyPolicyV3,
  replayEpisodeAttemptSetExternalWitnessTrustMaterialV3,
} from "./outsider-episode-attempt-set-external-witness-trust-material-v3.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const BufferByteLength = Buffer.byteLength;
const BufferFrom = Buffer.from;
const BufferPrototype = Buffer.prototype;
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "digest").value);
const HashUpdate = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(HashPrototype, "update").value);
const IntrinsicTypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const TypedArrayLength = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(IntrinsicTypedArrayPrototype, "length").get);
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectCreate = Object.create;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpExec = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(RegExp.prototype, "exec").value);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const StringCharAt = Function.prototype.call.bind(String.prototype.charAt);
const StringIncludes = Function.prototype.call.bind(String.prototype.includes);
const StringSlice = Function.prototype.call.bind(String.prototype.slice);
const TypeErrorConstructor = TypeError;
const URLConstructor = URL;
const URLPrototype = URL.prototype;
const URLHash = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "hash").get);
const URLHost = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "host").get);
const URLOrigin = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "origin").get);
const URLPassword = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "password").get);
const URLPathname = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "pathname").get);
const URLProtocol = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "protocol").get);
const URLSearch = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "search").get);
const URLUsername = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URLPrototype, "username").get);

function defineOwnData(target, key, value) {
  const descriptor = ObjectCreate(null);
  descriptor.value = value;
  descriptor.writable = true;
  descriptor.enumerable = true;
  descriptor.configurable = true;
  ObjectDefineProperty(target, key, descriptor);
  return value;
}

function publicKeyImportOptions(key, format, type) {
  const options = ObjectCreate(null);
  defineOwnData(options, "key", key);
  defineOwnData(options, "format", format);
  defineOwnData(options, "type", type);
  return options;
}

const HASH = /^sha256:[a-f0-9]{64}$/u;
const BASE64
  = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const PROVIDER_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const OPERATOR = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$/u;
const TYPED_ERROR
  = /^EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_[A-Z0-9_:]+$/u;
const PARENT_V2_CONTEXT_FIELDS = ["localHead", "trustPolicy",
  "expectedTrustPolicyHash", "transportPolicy", "expectedTransportPolicyHash",
  "expectedRequestHash", "expectedCandidateHash", "expectedAnchorEvidenceHash",
  "expectedTransportProofByteHash"];
const PARENT_V2_LOCAL_HEAD_FIELDS = ["directory", "registryId", "expectedLocalHeadHash"];
const PARENT_V2_TRUST_POLICY_FIELDS = ["schema", "provider", "profile",
  "trustMaterial", "requirements", "policyHash"];
const PARENT_V2_PROVIDER_FIELDS = ["providerId", "operatorRelationship",
  "relationshipAuthority"];
const PARENT_V2_RELATIONSHIP_AUTHORITY_FIELDS = ["basis", "evidenceHash"];
const PARENT_V2_PROFILE_FIELDS = ["kind", "endpointOrigin"];
const PARENT_V2_TRUST_MATERIAL_FIELDS = ["kind", "origin", "logPublicKeyPem",
  "witnesses"];
const PARENT_V2_WITNESS_FIELDS = ["name", "operatorId", "operatorRelationship",
  "relationshipEvidenceHash", "publicKeyPem"];
const PARENT_V2_REQUIREMENTS_FIELDS = ["existenceTimeRequired",
  "inclusionProofRequired", "appendOnlyConsistencyRequired", "independentWitnessQuorum"];
const PARENT_V2_TRANSPORT_POLICY_FIELDS = ["schema", "policyClass", "endpointOrigin",
  "method", "endpointPath", "endpointUrl", "redirectPolicy", "requestMediaType",
  "responseMediaType", "tlsRequired", "minimumTlsPolicy",
  "opaqueTransportProofMediaType", "exactProofBytesRequired",
  "transportProofCryptographicVerifierImplemented",
  "callerSuppliedProofIsTransportProvenance", "networkSubmissionImplemented",
  "decisionState", "authority", "policyHash"];
const MAX_WITNESSES = 16;
const MAX_PEM_BYTES = 16 * 1024;
const MAX_EXACT_SPKI_DER_BYTES = 64 * 1024;
const MAX_PUBLIC_KEY_PARSE_OPERATIONS = 1 + 2 * MAX_WITNESSES;
const MAX_POLICY_CANONICAL_BYTES = 64 * 1024;
const BASE64_ALPHABET
  = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export const EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_SCHEMAS
  = ObjectFreeze({
    record: "outsider/episode-attempt-set-external-witness-trust-bound-record/v4",
    bindingPolicy:
      "outsider/episode-attempt-set-external-witness-trust-bound-binding-policy/v4",
    verification:
      "outsider/episode-attempt-set-external-witness-trust-bound-verification/v4",
  });

function fail(code) {
  throw new TypeErrorConstructor(
    `EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_${code}`);
}

function regexTest(pattern, value) {
  return RegExpExec(pattern, value) !== null;
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

export const EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_BOUNDARY
  = deepFreeze({
    position:
      "PRIVATE_TWO_PARENT_ATTEMPT_TUF_REKOR_TRUST_CROSSWALK_REPLAY_HOLD_ONLY",
    predecessorV2OrV3ProtocolsMutated: false,
    bothParentsFreshReplayRequired: true,
    externalWitnessV2ContextSnapshottedBeforeParentReplay: true,
    sameFrozenV2ContextSnapshotUsedByParentAndCrosswalk: true,
    callerContextPostSnapshotMutationAffectsCrosswalk: false,
    externalWitnessV2FullAncestryReplayRequired: true,
    trustMaterialV3TufReplayRequired: true,
    p256LogKeyCrosswalkOnly: true,
    exactSpkiDerCommittedWithoutMathematicalKeyCanonicalization: true,
    mathematicalPublicKeyCanonicalizationEstablished: false,
    genericLogKeyProfileInteroperabilityEstablished: false,
    exactEndpointPathMethodAndRedirectCrosswalkRequired: true,
    checkpointOriginMustEqualEndpointHostPort: true,
    exactOrderedWitnessNameOperatorEd25519SpkiAndQuorumCrosswalkRequired: true,
    maximumWitnessCount: MAX_WITNESSES,
    fixedKnownOwnDataDescriptorsRequired: true,
    callerUnknownMetadataEnumerated: false,
    callerUnknownMetadataSemanticallyActive: false,
    crosswalkOperationBudgetEnforced: true,
    nestedWitnessPolicyReplayIncludedInCrosswalkBudget: true,
    sanitizedTypedErrorsOnly: true,
    callerProviderOperatorMappingIsExternalProvenance: false,
    parentV2LocalHeadFilesystemReadRequired: true,
    compositeCallMayPerformParentFilesystemRead: true,
    v4AddsNoNetworkOrFilesystemIoBeyondFreshParents: true,
    networkOrFilesystemWriteImplemented: false,
    networkOrTransportImplemented: false,
    parentV2PostImportKeyObjectPrototypeIsolationEstablished: false,
    parentV2PostImportBufferPrototypeIsolationEstablished: false,
    compositePostImportPrototypeIsolationEstablished: false,
    publicationImplemented: false,
    rawParentRecordsProjected: false,
    rawAnchorOrTransportProofBytesProjected: false,
    rawTufMetadataOrTargetBytesProjected: false,
    rawPemOrDerBytesProjected: false,
    localDirectoryPathsProjected: false,
    localEntryCommitmentsProjected: false,
    wireBytesProjected: false,
    independentlySourcedTrustMaterialEstablished: false,
    independentBootstrapEstablished: false,
    externalSourceProvenanceEstablished: false,
    transportProvenanceEstablished: false,
    publicProviderLiveArtifactEstablished: false,
    providerIdentityEstablished: false,
    providerResponseEstablished: false,
    operatorIndependenceEstablished: false,
    witnessOperationalIndependenceEstablished: false,
    independentWitnessEstablished: false,
    externalAnchorEstablished: false,
    durableExternalHeadEstablished: false,
    crossCheckpointConsistencyVerified: false,
    splitViewExcluded: false,
    nonEquivocationEstablished: false,
    wormStorageEstablished: false,
    sourceReplayVerified: false,
    directParticipantConfirmationEstablished: false,
    rightsPrivacyAdjudicationEstablished: false,
    networkOrderEstablished: false,
    independentOutcomeTruthEstablished: false,
    causalAttributionEstablished: false,
    recoveryExternallyVerified: false,
    obligationClosureEstablished: false,
    nativeSafetyUnconditionalVetoPreserved: true,
    outsiderCanOverrideNativeSafetyVeto: false,
    stage1EngineeringGatePassed: false,
    stage1ExternalFactGatePassed: false,
    stage1Complete: false,
    stage2Eligible: false,
    stage2Permitted: false,
    authority: "NONE",
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    actionReady: false,
    actionAuthorized: false,
    executable: false,
    automaticTraining: false,
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
  });

export const EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_PROOF_MATRIX
  = deepFreeze({
    freshParentReplay: {
      externalWitnessV2: "REQUIRED_IN_SAME_CALL",
      trustMaterialV3: "REQUIRED_IN_SAME_CALL",
      staleParentVerificationObjectsAccepted: false,
      externalWitnessV2ContextSnapshot:
        "ONE_FROZEN_FIXED_DESCRIPTOR_SNAPSHOT_SHARED_BY_PARENT_AND_CROSSWALK",
    },
    privateCrosswalk: {
      endpointPathMethodRedirect: "EXACT",
      logKey: "P256_SPKI_DER_SHA256_AND_TRUNCATED_CHECKPOINT_ID",
      checkpointOrigin: "EXACT_ENDPOINT_HOST_PORT",
      witnesses: "EXACT_ORDERED_NAME_OPERATOR_ED25519_SPKI_AND_QUORUM_MAX_16",
      providerOperatorIdentity: "CALLER_ASSERTED_MAPPING_ONLY",
    },
    positiveEngineeringClaims: {
      twoParentReplayCanBeBound: true,
      exactPrivateCrosswalkCanBeReplayed: true,
      rawOrPathProjectionRequired: false,
    },
    externalFactClaims: {
      independentTrustProvenance: false,
      providerOrOperatorIndependence: false,
      witnessOperationalIndependence: false,
      crossCheckpointConsistency: false,
      nonEquivocation: false,
      durableExternalHead: false,
      stage1Complete: false,
      stage2Permitted: false,
    },
  });

function exactObject(value, fields, code) {
  if (isProxy(value) || value === null || typeof value !== "object"
    || ArrayIsArray(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  /* Do not enumerate caller objects. A wide unknown-key set must remain inert
     instead of being materialized before a budget check can run. */
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, fields[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function ownData(value, key, code) {
  if (isProxy(value) || value === null || typeof value !== "object") {
    fail(`${code}_OBJECT_INVALID`);
  }
  const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
  if (!descriptor || !ObjectHasOwn(descriptor, "value")
    || descriptor.enumerable !== true) fail(`${code}_FIELD_INVALID`);
  return descriptor.value;
}

function fixedObjectView(value, fields, code) {
  const source = exactObject(value, fields, code);
  const output = {};
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    defineOwnData(output, field, ownData(source, field, code));
  }
  return output;
}

function fixedArray(value, maximum, code) {
  if (isProxy(value) || value === null || typeof value !== "object"
    || !ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype) {
    fail(`${code}_ARRAY_INVALID`);
  }
  const lengthDescriptor = ObjectGetOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !ObjectHasOwn(lengthDescriptor, "value")
    || !NumberIsSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0
    || lengthDescriptor.value > maximum) {
    fail(`${code}_ARRAY_INVALID`);
  }
  for (let index = 0; index < lengthDescriptor.value; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_ARRAY_INVALID`);
  }
  return { value, length: lengthDescriptor.value };
}

function primitiveString(value, maximum, code, minimum = 0) {
  if (typeof value !== "string" || value.length < minimum || value.length > maximum) {
    fail(`${code}_STRING_INVALID`);
  }
  return value;
}

function primitiveBoolean(value, code) {
  if (typeof value !== "boolean") fail(`${code}_BOOLEAN_INVALID`);
  return value;
}

function primitiveSafeInteger(value, minimum, maximum, code) {
  if (!NumberIsSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INTEGER_INVALID`);
  }
  return value;
}

/* Snapshot every v2 context field before invoking the parent.  Both the
   parent replay and the later crosswalk consume this one frozen object, so a
   parent-layer hook that mutates the original caller graph cannot create an
   A-then-B binding. Unknown metadata is never enumerated or copied. */
function snapshotExternalWitnessV2Context(value) {
  const context = fixedObjectView(value, PARENT_V2_CONTEXT_FIELDS,
    "PARENT_V2_CONTEXT");
  const localView = fixedObjectView(context.localHead, PARENT_V2_LOCAL_HEAD_FIELDS,
    "PARENT_V2_LOCAL_HEAD");
  const localHead = {
    directory: primitiveString(localView.directory, 4096,
      "PARENT_V2_LOCAL_HEAD_DIRECTORY", 1),
    registryId: primitiveString(localView.registryId, 128,
      "PARENT_V2_LOCAL_HEAD_REGISTRY_ID", 1),
    expectedLocalHeadHash: hash(localView.expectedLocalHeadHash,
      "PARENT_V2_LOCAL_HEAD_EXPECTED_HASH"),
  };
  const trust = fixedObjectView(context.trustPolicy, PARENT_V2_TRUST_POLICY_FIELDS,
    "PARENT_V2_TRUST_POLICY");
  const providerView = fixedObjectView(trust.provider, PARENT_V2_PROVIDER_FIELDS,
    "PARENT_V2_PROVIDER");
  const relationshipView = fixedObjectView(providerView.relationshipAuthority,
    PARENT_V2_RELATIONSHIP_AUTHORITY_FIELDS, "PARENT_V2_RELATIONSHIP_AUTHORITY");
  const relationshipAuthority = {
    basis: primitiveString(relationshipView.basis, 256,
      "PARENT_V2_RELATIONSHIP_AUTHORITY_BASIS", 1),
    evidenceHash: hash(relationshipView.evidenceHash,
      "PARENT_V2_RELATIONSHIP_AUTHORITY_EVIDENCE_HASH"),
  };
  const provider = {
    providerId: primitiveString(providerView.providerId, 128,
      "PARENT_V2_PROVIDER_ID", 1),
    operatorRelationship: primitiveString(providerView.operatorRelationship, 128,
      "PARENT_V2_PROVIDER_RELATIONSHIP", 1),
    relationshipAuthority,
  };
  const profileView = fixedObjectView(trust.profile, PARENT_V2_PROFILE_FIELDS,
    "PARENT_V2_PROFILE");
  const profile = {
    kind: primitiveString(profileView.kind, 128, "PARENT_V2_PROFILE_KIND", 1),
    endpointOrigin: primitiveString(profileView.endpointOrigin, 2048,
      "PARENT_V2_PROFILE_ENDPOINT_ORIGIN", 1),
  };
  const materialView = fixedObjectView(trust.trustMaterial,
    PARENT_V2_TRUST_MATERIAL_FIELDS, "PARENT_V2_TRUST_MATERIAL");
  const materialKind = primitiveString(materialView.kind, 128,
    "PARENT_V2_TRUST_MATERIAL_KIND", 1);
  const materialOrigin = primitiveString(materialView.origin, 2048,
    "PARENT_V2_TRUST_MATERIAL_ORIGIN", 1);
  const logPublicKeyPem = primitiveString(materialView.logPublicKeyPem, MAX_PEM_BYTES,
    "PARENT_V2_TRUST_MATERIAL_LOG_KEY_PEM", 32);
  if (BufferByteLength(logPublicKeyPem, "utf8") > MAX_PEM_BYTES) {
    fail("PARENT_V2_TRUST_MATERIAL_LOG_KEY_PEM_BYTE_LENGTH_INVALID");
  }
  const rawWitnesses = fixedArray(materialView.witnesses, MAX_WITNESSES,
    "PARENT_V2_WITNESSES");
  const witnesses = [];
  for (let index = 0; index < rawWitnesses.length; index += 1) {
    const witnessView = fixedObjectView(ownData(
      rawWitnesses.value, StringConstructor(index), "PARENT_V2_WITNESSES"),
    PARENT_V2_WITNESS_FIELDS, "PARENT_V2_WITNESS");
    const witnessPem = primitiveString(witnessView.publicKeyPem, MAX_PEM_BYTES,
      "PARENT_V2_WITNESS_PUBLIC_KEY_PEM", 32);
    if (BufferByteLength(witnessPem, "utf8") > MAX_PEM_BYTES) {
      fail("PARENT_V2_WITNESS_PUBLIC_KEY_PEM_BYTE_LENGTH_INVALID");
    }
    defineOwnData(witnesses, StringConstructor(index), {
      name: primitiveString(witnessView.name, 128, "PARENT_V2_WITNESS_NAME", 1),
      operatorId: primitiveString(witnessView.operatorId, 128,
        "PARENT_V2_WITNESS_OPERATOR_ID", 1),
      operatorRelationship: primitiveString(witnessView.operatorRelationship, 128,
        "PARENT_V2_WITNESS_OPERATOR_RELATIONSHIP", 1),
      relationshipEvidenceHash: hash(witnessView.relationshipEvidenceHash,
        "PARENT_V2_WITNESS_RELATIONSHIP_EVIDENCE_HASH"),
      publicKeyPem: witnessPem,
    });
  }
  const requirementsView = fixedObjectView(trust.requirements,
    PARENT_V2_REQUIREMENTS_FIELDS, "PARENT_V2_REQUIREMENTS");
  const requirements = {
    existenceTimeRequired: primitiveBoolean(requirementsView.existenceTimeRequired,
      "PARENT_V2_REQUIREMENTS_EXISTENCE_TIME"),
    inclusionProofRequired: primitiveBoolean(requirementsView.inclusionProofRequired,
      "PARENT_V2_REQUIREMENTS_INCLUSION_PROOF"),
    appendOnlyConsistencyRequired: primitiveBoolean(
      requirementsView.appendOnlyConsistencyRequired,
      "PARENT_V2_REQUIREMENTS_APPEND_ONLY_CONSISTENCY"),
    independentWitnessQuorum: primitiveSafeInteger(
      requirementsView.independentWitnessQuorum, 1, MAX_WITNESSES,
      "PARENT_V2_REQUIREMENTS_WITNESS_QUORUM"),
  };
  const transportView = fixedObjectView(context.transportPolicy,
    PARENT_V2_TRANSPORT_POLICY_FIELDS, "PARENT_V2_TRANSPORT_POLICY");
  const transportPolicy = {
    schema: primitiveString(transportView.schema, 512,
      "PARENT_V2_TRANSPORT_SCHEMA", 1),
    policyClass: primitiveString(transportView.policyClass, 512,
      "PARENT_V2_TRANSPORT_POLICY_CLASS", 1),
    endpointOrigin: primitiveString(transportView.endpointOrigin, 2048,
      "PARENT_V2_TRANSPORT_ENDPOINT_ORIGIN", 1),
    method: primitiveString(transportView.method, 32,
      "PARENT_V2_TRANSPORT_METHOD", 1),
    endpointPath: primitiveString(transportView.endpointPath, 2048,
      "PARENT_V2_TRANSPORT_ENDPOINT_PATH", 1),
    endpointUrl: primitiveString(transportView.endpointUrl, 4096,
      "PARENT_V2_TRANSPORT_ENDPOINT_URL", 1),
    redirectPolicy: primitiveString(transportView.redirectPolicy, 64,
      "PARENT_V2_TRANSPORT_REDIRECT_POLICY", 1),
    requestMediaType: primitiveString(transportView.requestMediaType, 128,
      "PARENT_V2_TRANSPORT_REQUEST_MEDIA_TYPE", 1),
    responseMediaType: primitiveString(transportView.responseMediaType, 128,
      "PARENT_V2_TRANSPORT_RESPONSE_MEDIA_TYPE", 1),
    tlsRequired: primitiveBoolean(transportView.tlsRequired,
      "PARENT_V2_TRANSPORT_TLS_REQUIRED"),
    minimumTlsPolicy: primitiveString(transportView.minimumTlsPolicy, 128,
      "PARENT_V2_TRANSPORT_MINIMUM_TLS_POLICY", 1),
    opaqueTransportProofMediaType: primitiveString(
      transportView.opaqueTransportProofMediaType, 128,
      "PARENT_V2_TRANSPORT_PROOF_MEDIA_TYPE", 1),
    exactProofBytesRequired: primitiveBoolean(transportView.exactProofBytesRequired,
      "PARENT_V2_TRANSPORT_EXACT_PROOF_BYTES"),
    transportProofCryptographicVerifierImplemented: primitiveBoolean(
      transportView.transportProofCryptographicVerifierImplemented,
      "PARENT_V2_TRANSPORT_CRYPTO_VERIFIER"),
    callerSuppliedProofIsTransportProvenance: primitiveBoolean(
      transportView.callerSuppliedProofIsTransportProvenance,
      "PARENT_V2_TRANSPORT_CALLER_PROVENANCE"),
    networkSubmissionImplemented: primitiveBoolean(transportView.networkSubmissionImplemented,
      "PARENT_V2_TRANSPORT_NETWORK_SUBMISSION"),
    decisionState: primitiveString(transportView.decisionState, 64,
      "PARENT_V2_TRANSPORT_DECISION_STATE", 1),
    authority: primitiveString(transportView.authority, 64,
      "PARENT_V2_TRANSPORT_AUTHORITY", 1),
    policyHash: hash(transportView.policyHash, "PARENT_V2_TRANSPORT_POLICY_HASH"),
  };
  return deepFreeze({
    localHead,
    trustPolicy: {
      schema: primitiveString(trust.schema, 512, "PARENT_V2_TRUST_SCHEMA", 1),
      provider,
      profile,
      trustMaterial: {
        kind: materialKind,
        origin: materialOrigin,
        logPublicKeyPem,
        witnesses,
      },
      requirements,
      policyHash: hash(trust.policyHash, "PARENT_V2_TRUST_POLICY_HASH"),
    },
    expectedTrustPolicyHash: hash(context.expectedTrustPolicyHash,
      "PARENT_V2_CONTEXT_EXPECTED_TRUST_POLICY_HASH"),
    transportPolicy,
    expectedTransportPolicyHash: hash(context.expectedTransportPolicyHash,
      "PARENT_V2_CONTEXT_EXPECTED_TRANSPORT_POLICY_HASH"),
    expectedRequestHash: hash(context.expectedRequestHash,
      "PARENT_V2_CONTEXT_EXPECTED_REQUEST_HASH"),
    expectedCandidateHash: hash(context.expectedCandidateHash,
      "PARENT_V2_CONTEXT_EXPECTED_CANDIDATE_HASH"),
    expectedAnchorEvidenceHash: hash(context.expectedAnchorEvidenceHash,
      "PARENT_V2_CONTEXT_EXPECTED_ANCHOR_EVIDENCE_HASH"),
    expectedTransportProofByteHash: hash(context.expectedTransportProofByteHash,
      "PARENT_V2_CONTEXT_EXPECTED_TRANSPORT_PROOF_BYTE_HASH"),
  });
}

function projectLike(value, template, code, depth = 0) {
  if (depth > 24) fail(`${code}_DEPTH_INVALID`);
  if (template === null || typeof template !== "object") {
    if (value !== template) fail(`${code}_VALUE_INVALID`);
    return value;
  }
  if (ArrayIsArray(template)) {
    const fixed = fixedArray(value, template.length, code);
    if (fixed.length !== template.length) fail(`${code}_LENGTH_INVALID`);
    const output = [];
    for (let index = 0; index < template.length; index += 1) {
      defineOwnData(output, StringConstructor(index), projectLike(
        ownData(value, StringConstructor(index), code), template[index], code, depth + 1));
    }
    return output;
  }
  const fields = ReflectOwnKeys(template);
  exactObject(value, fields, code);
  const output = {};
  for (let index = 0; index < fields.length; index += 1) {
    const key = fields[index];
    defineOwnData(output, key, projectLike(ownData(value, key, code), template[key],
      code, depth + 1));
  }
  return output;
}

function hash(value, code) {
  if (typeof value !== "string" || !regexTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  const canonical = canonicalizeStrict(value);
  if (BufferByteLength(canonical, "utf8") > MAX_POLICY_CANONICAL_BYTES) {
    fail("POLICY_CANONICAL_BUDGET_EXCEEDED");
  }
  const instance = createHash("sha256");
  HashUpdate(instance, `${domain}\0${canonical}`, "utf8");
  return `sha256:${HashDigest(instance, "hex")}`;
}

function byteCommitment(bytes) {
  const instance = createHash("sha256");
  HashUpdate(instance, bytes);
  const digestBytes = HashDigest(instance);
  const hex = bytesToHex(digestBytes);
  const firstFour = BufferFrom(StringSlice(hex, 0, 8), "hex");
  return {
    hash: `sha256:${hex}`,
    logIdBase64: bytesToBase64(digestBytes),
    checkpointKeyIdBase64: bytesToBase64(firstFour),
  };
}

function newCrosswalkBudget() {
  const budget = ObjectCreate(null);
  defineOwnData(budget, "publicKeyParseOperations", 0);
  defineOwnData(budget, "exactSpkiDerBytes", 0);
  defineOwnData(budget, "witnessesMapped", 0);
  defineOwnData(budget, "nestedWitnessPolicyReplayPublicKeyParseOperations", 0);
  return budget;
}

function consumeKeyBudget(budget, bytes, witness, nestedWitnessPolicyReplay = false) {
  const parseOperations = ownData(budget, "publicKeyParseOperations",
    "INTERNAL_CROSSWALK_BUDGET") + 1;
  const exactBytes = ownData(budget, "exactSpkiDerBytes",
    "INTERNAL_CROSSWALK_BUDGET") + bytes;
  const witnessesMapped = ownData(budget, "witnessesMapped",
    "INTERNAL_CROSSWALK_BUDGET") + (witness ? 1 : 0);
  const nestedReplayOperations = ownData(budget,
    "nestedWitnessPolicyReplayPublicKeyParseOperations",
    "INTERNAL_CROSSWALK_BUDGET") + (nestedWitnessPolicyReplay ? 1 : 0);
  if (!NumberIsSafeInteger(parseOperations) || !NumberIsSafeInteger(exactBytes)
    || !NumberIsSafeInteger(witnessesMapped)
    || !NumberIsSafeInteger(nestedReplayOperations)
    || parseOperations > MAX_PUBLIC_KEY_PARSE_OPERATIONS
    || exactBytes > MAX_EXACT_SPKI_DER_BYTES
    || witnessesMapped > MAX_WITNESSES
    || nestedReplayOperations > MAX_WITNESSES) fail("CROSSWALK_BUDGET_EXCEEDED");
  defineOwnData(budget, "publicKeyParseOperations", parseOperations);
  defineOwnData(budget, "exactSpkiDerBytes", exactBytes);
  defineOwnData(budget, "witnessesMapped", witnessesMapped);
  defineOwnData(budget, "nestedWitnessPolicyReplayPublicKeyParseOperations",
    nestedReplayOperations);
}

function exactInternalBufferLength(value, code) {
  if (isProxy(value) || value === null || typeof value !== "object") {
    fail(`${code}_BUFFER_INVALID`);
  }
  let prototype;
  let length;
  try {
    prototype = ObjectGetPrototypeOf(value);
    length = TypedArrayLength(value);
  } catch { fail(`${code}_BUFFER_INVALID`); }
  if (prototype !== BufferPrototype || !NumberIsSafeInteger(length) || length < 1
    || length > 4096 || ObjectHasOwn(value, "length")
    || ObjectHasOwn(value, "byteLength")) fail(`${code}_BUFFER_INVALID`);
  return length;
}

function bytesToHex(bytes, start = 0, end = TypedArrayLength(bytes)) {
  const alphabet = "0123456789abcdef";
  let result = "";
  for (let index = start; index < end; index += 1) {
    result += alphabet[bytes[index] >>> 4] + alphabet[bytes[index] & 0x0f];
  }
  return result;
}

function bytesToBase64(bytes) {
  const length = TypedArrayLength(bytes);
  let result = "";
  for (let index = 0; index < length; index += 3) {
    const first = bytes[index];
    const secondPresent = index + 1 < length;
    const thirdPresent = index + 2 < length;
    const second = secondPresent ? bytes[index + 1] : 0;
    const third = thirdPresent ? bytes[index + 2] : 0;
    result += BASE64_ALPHABET[first >>> 2];
    result += BASE64_ALPHABET[((first & 0x03) << 4) | (second >>> 4)];
    result += secondPresent
      ? BASE64_ALPHABET[((second & 0x0f) << 2) | (third >>> 6)] : "=";
    result += thirdPresent ? BASE64_ALPHABET[third & 0x3f] : "=";
  }
  return result;
}

function strictBase64(value, maximum, code) {
  if (typeof value !== "string" || value.length < 4
    || value.length > maximum * 2 || !regexTest(BASE64, value)) {
    fail(`${code}_INVALID`);
  }
  const bytes = BufferFrom(value, "base64");
  const length = exactInternalBufferLength(bytes, code);
  if (length > maximum || bytesToBase64(bytes) !== value) fail(`${code}_INVALID`);
  return bytes;
}

function pemPublicKeyDer(pem, code) {
  const begin = "-----BEGIN PUBLIC KEY-----";
  const end = "-----END PUBLIC KEY-----";
  if (typeof pem !== "string" || pem.length < 32
    || BufferByteLength(pem, "utf8") > MAX_PEM_BYTES || StringIncludes(pem, "\0")
    || StringSlice(pem, 0, begin.length) !== begin) {
    fail(`${code}_PEM_INVALID`);
  }
  let offset = begin.length;
  if (StringCharAt(pem, offset) === "\r"
    && StringCharAt(pem, offset + 1) === "\n") offset += 2;
  else if (StringCharAt(pem, offset) === "\n") offset += 1;
  else fail(`${code}_PEM_INVALID`);
  let endOffset = -1;
  for (let index = offset; index + end.length <= pem.length; index += 1) {
    if (StringSlice(pem, index, index + end.length) === end) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < offset) fail(`${code}_PEM_INVALID`);
  const suffix = StringSlice(pem, endOffset + end.length);
  if (suffix !== "" && suffix !== "\n" && suffix !== "\r\n") {
    fail(`${code}_PEM_INVALID`);
  }
  let encoded = "";
  for (let index = offset; index < endOffset; index += 1) {
    const character = StringCharAt(pem, index);
    if (character === "\n") continue;
    if (character === "\r" && StringCharAt(pem, index + 1) === "\n") {
      index += 1;
      continue;
    }
    encoded += character;
  }
  return strictBase64(encoded, 4096, `${code}_PEM_BODY`);
}

function derElement(bytes, offset, expectedTag, code) {
  const byteLength = TypedArrayLength(bytes);
  if (!NumberIsSafeInteger(offset) || offset < 0 || offset + 2 > byteLength
    || bytes[offset] !== expectedTag) fail(`${code}_DER_INVALID`);
  const lengthByte = bytes[offset + 1];
  let contentLength;
  let contentStart;
  if (lengthByte < 0x80) {
    contentLength = lengthByte;
    contentStart = offset + 2;
  } else {
    const octets = lengthByte & 0x7f;
    if (octets < 1 || octets > 4 || offset + 2 + octets > byteLength
      || bytes[offset + 2] === 0) fail(`${code}_DER_INVALID`);
    contentLength = 0;
    for (let index = 0; index < octets; index += 1) {
      contentLength = contentLength * 256 + bytes[offset + 2 + index];
    }
    if (!NumberIsSafeInteger(contentLength) || contentLength < 0x80) {
      fail(`${code}_DER_INVALID`);
    }
    contentStart = offset + 2 + octets;
  }
  const end = contentStart + contentLength;
  if (!NumberIsSafeInteger(end) || end > byteLength) fail(`${code}_DER_INVALID`);
  return { start: offset, contentStart, end };
}

function requireSpkiProfile(bytes, profile, code) {
  const byteLength = TypedArrayLength(bytes);
  const outer = derElement(bytes, 0, 0x30, code);
  if (outer.end !== byteLength) fail(`${code}_DER_INVALID`);
  const algorithm = derElement(bytes, outer.contentStart, 0x30, code);
  const algorithmHex = bytesToHex(bytes, algorithm.start, algorithm.end);
  const bitString = derElement(bytes, algorithm.end, 0x03, code);
  if (bitString.end !== outer.end || bitString.contentStart >= bitString.end
    || bytes[bitString.contentStart] !== 0) fail(`${code}_DER_INVALID`);
  if (profile === "ed25519") {
    if (algorithmHex !== "300506032b6570"
      || bitString.end - bitString.contentStart !== 33) {
      fail(`${code}_PROFILE_INVALID`);
    }
    return;
  }
  if (profile !== "p256"
    || algorithmHex !== "301306072a8648ce3d020106082a8648ce3d030107") {
    fail(`${code}_PROFILE_INVALID`);
  }
  const pointLength = bitString.end - bitString.contentStart - 1;
  const pointTag = bytes[bitString.contentStart + 1];
  if (!((pointLength === 65 && pointTag === 0x04)
    || (pointLength === 33 && (pointTag === 0x02 || pointTag === 0x03)))) {
    fail(`${code}_PROFILE_INVALID`);
  }
}

function exactSpkiDerFromPem(pem, expectedProfile, budget, witness, code) {
  const der = pemPublicKeyDer(pem, code);
  requireSpkiProfile(der, expectedProfile, code);
  try { createPublicKey(publicKeyImportOptions(der, "der", "spki")); }
  catch { fail(`${code}_DER_INVALID`); }
  const length = exactInternalBufferLength(der, code);
  consumeKeyBudget(budget, length, witness);
  return der;
}

function endpointOrigin(value, code) {
  if (typeof value !== "string" || value.length < 9 || value.length > 2048) {
    fail(`${code}_INVALID`);
  }
  let parsed;
  try { parsed = new URLConstructor(value); } catch { fail(`${code}_INVALID`); }
  if (URLProtocol(parsed) !== "https:" || URLOrigin(parsed) !== value
    || URLUsername(parsed) !== "" || URLPassword(parsed) !== ""
    || URLPathname(parsed) !== "/" || URLSearch(parsed) !== ""
    || URLHash(parsed) !== "") fail(`${code}_INVALID`);
  return { value, host: URLHost(parsed) };
}

const FIXED_REQUIREMENTS = deepFreeze({
  profile: "SIGSTORE_REKOR_V2_HASHEDREKORD_0.0.2",
  endpointPath: "/api/v2/log/entries",
  method: "POST",
  redirectPolicy: "ERROR",
  logKeyDetails: "PKIX_ECDSA_P256_SHA_256",
  logKeyMapping:
    "EXACT_SPKI_DER_SHA256_LOG_ID_AND_TRUNCATED_CHECKPOINT_ID",
  checkpointOriginMapping: "V2_ORIGIN_EQUALS_REKOR_ENDPOINT_HOST_PORT",
  witnessMapping: "EXACT_ORDERED_NAME_OPERATOR_ED25519_SPKI_AND_QUORUM",
  maximumWitnessCount: MAX_WITNESSES,
  bothParentsFreshReplayRequired: true,
});

const PARENT_PIN_FIELDS = ["externalWitnessV2VerificationHash",
  "trustMaterialV3VerificationHash", "externalWitnessTrustPolicyHash",
  "externalWitnessTransportPolicyHash", "trustMaterialV3PolicyHash",
  "localWitnessPolicyV3Hash"];
const PROVIDER_MAPPING_FIELDS = ["externalWitnessProviderId", "sigstoreOperator",
  "basis", "evidenceHash", "externalProvenanceEstablished"];
const POLICY_BODY_FIELDS = ["schema", "policyClass", "parentPins",
  "providerOperatorMapping", "requirements", "callerMappingIsExternalProvenance",
  "status", "decisionState", "authority", "boundary"];
const POLICY_FIELDS = ["schema", "policyClass", "parentPins",
  "providerOperatorMapping", "requirements", "callerMappingIsExternalProvenance",
  "status", "decisionState", "authority", "boundary", "policyHash"];

function bindingPolicyBody(input) {
  const top = exactObject(input, POLICY_BODY_FIELDS, "BINDING_POLICY_INPUT");
  const pins = exactObject(ownData(top, "parentPins", "BINDING_POLICY_INPUT"),
    PARENT_PIN_FIELDS, "BINDING_POLICY_PARENT_PINS");
  const mapping = exactObject(ownData(top, "providerOperatorMapping",
    "BINDING_POLICY_INPUT"), PROVIDER_MAPPING_FIELDS,
  "BINDING_POLICY_PROVIDER_OPERATOR_MAPPING");
  const externalWitnessProviderId = ownData(mapping, "externalWitnessProviderId",
    "BINDING_POLICY_PROVIDER_OPERATOR_MAPPING");
  const sigstoreOperator = ownData(mapping, "sigstoreOperator",
    "BINDING_POLICY_PROVIDER_OPERATOR_MAPPING");
  if (typeof externalWitnessProviderId !== "string"
    || !regexTest(PROVIDER_ID, externalWitnessProviderId)
    || typeof sigstoreOperator !== "string" || !regexTest(OPERATOR, sigstoreOperator)
    || ownData(mapping, "basis", "BINDING_POLICY_PROVIDER_OPERATOR_MAPPING")
      !== "CALLER_ASSERTED_IDENTIFIER_CROSSWALK_NOT_EXTERNAL_PROVENANCE"
    || ownData(mapping, "externalProvenanceEstablished",
      "BINDING_POLICY_PROVIDER_OPERATOR_MAPPING") !== false) {
    fail("BINDING_POLICY_PROVIDER_OPERATOR_MAPPING_INVALID");
  }
  const evidenceHash = hash(ownData(mapping, "evidenceHash",
    "BINDING_POLICY_PROVIDER_OPERATOR_MAPPING"), "MAPPING_EVIDENCE_HASH");
  projectLike(ownData(top, "requirements", "BINDING_POLICY_INPUT"),
    FIXED_REQUIREMENTS, "BINDING_POLICY_REQUIREMENTS");
  projectLike(ownData(top, "boundary", "BINDING_POLICY_INPUT"),
    EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_BOUNDARY,
    "BINDING_POLICY_BOUNDARY");
  if (ownData(top, "schema", "BINDING_POLICY_INPUT")
      !== EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_SCHEMAS.bindingPolicy
    || ownData(top, "policyClass", "BINDING_POLICY_INPUT")
      !== "EXACT_TWO_PARENT_REPLAY_AND_PRIVATE_TRUST_CROSSWALK_HOLD_ONLY"
    || ownData(top, "callerMappingIsExternalProvenance", "BINDING_POLICY_INPUT")
      !== false || ownData(top, "status", "BINDING_POLICY_INPUT") !== "PARTIAL"
    || ownData(top, "decisionState", "BINDING_POLICY_INPUT") !== "HOLD"
    || ownData(top, "authority", "BINDING_POLICY_INPUT") !== "NONE") {
    fail("BINDING_POLICY_FIXED_FIELDS_INVALID");
  }
  const validatedPins = {};
  for (let index = 0; index < PARENT_PIN_FIELDS.length; index += 1) {
    const field = PARENT_PIN_FIELDS[index];
    defineOwnData(validatedPins, field, hash(ownData(pins, field,
      "BINDING_POLICY_PARENT_PINS"), `PARENT_PIN_${field}`));
  }
  return {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_SCHEMAS.bindingPolicy,
    policyClass: "EXACT_TWO_PARENT_REPLAY_AND_PRIVATE_TRUST_CROSSWALK_HOLD_ONLY",
    parentPins: validatedPins,
    providerOperatorMapping: {
      externalWitnessProviderId,
      sigstoreOperator,
      basis: "CALLER_ASSERTED_IDENTIFIER_CROSSWALK_NOT_EXTERNAL_PROVENANCE",
      evidenceHash,
      externalProvenanceEstablished: false,
    },
    requirements: FIXED_REQUIREMENTS,
    callerMappingIsExternalProvenance: false,
    status: "PARTIAL",
    decisionState: "HOLD",
    authority: "NONE",
    boundary: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_BOUNDARY,
  };
}

function buildBindingPolicy(input) {
  const body = bindingPolicyBody(input);
  return deepFreeze({ ...body, policyHash: digest("external-witness-trust-binding-policy",
    body) });
}

export function createEpisodeAttemptSetExternalWitnessTrustBindingPolicyV4(
  input = {}) {
  return buildBindingPolicy(input);
}

function replayBindingPolicy(value, expectedHash) {
  const top = exactObject(value, POLICY_FIELDS, "BINDING_POLICY");
  const input = {};
  for (let index = 0; index < POLICY_BODY_FIELDS.length; index += 1) {
    const field = POLICY_BODY_FIELDS[index];
    defineOwnData(input, field, ownData(top, field, "BINDING_POLICY"));
  }
  const rebuilt = buildBindingPolicy(input);
  const projected = projectLike(value, rebuilt, "BINDING_POLICY_REBUILT_VIEW");
  if (canonicalizeStrict(projected) !== canonicalizeStrict(rebuilt)
    || rebuilt.policyHash !== hash(expectedHash, "EXPECTED_BINDING_POLICY_HASH")) {
    fail("BINDING_POLICY_REPLAY_OR_PIN_INVALID");
  }
  return rebuilt;
}

function fixedNegativeFacts() {
  return {
    callerMappingIsExternalProvenance: false,
    callerBootstrapAcceptedAsIndependentTrustAnchor: false,
    callerPinsAcceptedAsExternalProvenance: false,
    independentlySourcedTrustMaterialEstablished: false,
    independentBootstrapEstablished: false,
    officialSourceBytesEstablished: false,
    actualPublishedSigstoreTargetBytesReplayed: false,
    currentPublicSigningConfigSelectsRekorV2: false,
    rekorV2TrustRootIdSpecificationConflictAcknowledged: true,
    rekorV2TrustRootIdProfileInteroperabilityEstablished: false,
    sourceProvenanceEstablished: false,
    transportProvenanceEstablished: false,
    publicProviderInteroperabilityObserved: false,
    publicProviderLiveArtifactEstablished: false,
    providerIdentityEstablished: false,
    providerResponseEstablished: false,
    operatorIndependenceEstablished: false,
    witnessOperatorIndependenceEstablished: false,
    witnessOperationalIndependenceEstablished: false,
    physicalCryptographicKeyIndependenceEstablished: false,
    organizationalIndependenceEstablished: false,
    mathematicalPublicKeyCanonicalizationEstablished: false,
    independentWitnessEstablished: false,
    independentPinProvenanceEstablished: false,
    externalHeadPinVerified: false,
    externalAnchorEstablished: false,
    durableExternalHeadEstablished: false,
    crossCheckpointConsistencyVerified: false,
    splitViewExcluded: false,
    nonEquivocationEstablished: false,
    nonOmissionProofEstablished: false,
    longTermMonitoringEstablished: false,
    wormStorageEstablished: false,
    ownerRollbackOrDirectoryReplacementExcluded: false,
    parallelGenesisExclusionEstablished: false,
    forkExclusionEstablished: false,
    durableAppendOnlyHistoryEstablished: false,
    tufRollbackProtectionEstablished: false,
    tufLatestRootEstablished: false,
    tufPriorTrustedMetadataStateReplayed: false,
    crossParentTemporalAtomicityEstablished: false,
    storageDurabilityEstablished: false,
    globalAttemptAndReportDenominatorComplete: false,
    sourceReplayVerified: false,
    directParticipantConfirmationEstablished: false,
    rightsPrivacyAdjudicationEstablished: false,
    networkOrderEstablished: false,
    independentOutcomeTruthEstablished: false,
    causalAttributionEstablished: false,
    recoveryExternallyVerified: false,
    obligationClosureEstablished: false,
    nativeSafetyUnconditionalVetoPreserved: true,
    outsiderCanOverrideNativeSafetyVeto: false,
    stage1EngineeringGatePassed: false,
    stage1ExternalFactGatePassed: false,
    stage1Complete: false,
    stage2Eligible: false,
    stage2Permitted: false,
    status: "PARTIAL",
    decisionState: "HOLD",
    disposition: "QUARANTINED",
    authority: "NONE",
    authorityEstablished: false,
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
    capitalAvailabilityEstablished: false,
    pricingAuthorized: false,
    permitsPricing: false,
    guaranteeEstablished: false,
    permitsGuarantee: false,
    insuranceEstablished: false,
    permitsInsurance: false,
    settlementAuthorized: false,
    permitsSettlement: false,
    externalContractAcceptanceEstablished: false,
    externalAdoptionEstablished: false,
    verificationPublicationNetworkSafe: false,
    verificationPublicationAuthorized: false,
  };
}

function sanitizedFailure(error) {
  const fallback
    = "EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_UNTRUSTED_FAILURE";
  try {
    if (isProxy(error) || error === null || typeof error !== "object") return fallback;
    const descriptor = ObjectGetOwnPropertyDescriptor(error, "message");
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || typeof descriptor.value !== "string" || descriptor.value.length > 512) {
      return fallback;
    }
    return regexTest(TYPED_ERROR, descriptor.value) ? descriptor.value : fallback;
  } catch { return fallback; }
}

function verificationFailure(error) {
  return deepFreeze({
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_SCHEMAS.verification,
    ok: false,
    replayClass: "TWO_PARENT_TRUST_CROSSWALK_REPLAY_FAILED_HOLD_ONLY",
    error: sanitizedFailure(error),
    bothParentsFreshReplayVerified: false,
    externalWitnessV2ContextSnapshotUsed: false,
    parentAndCrosswalkSameV2ContextSnapshotVerified: false,
    attemptFullAncestryAndHeadBindingVerified: false,
    exactEndpointAndTransportPolicyMapped: false,
    exactTufSelectedLogKeyCommitmentMapped: false,
    exactLocalWitnessKeyPolicyMapped: false,
    tufTrustedRootAndSigningConfigReplayVerifiedUnderCallerBootstrap: false,
    crosswalkOperationBudgetEnforced: true,
    nestedWitnessPolicyReplayIncludedInCrosswalkBudget: true,
    parentV2LocalHeadFilesystemReadRequired: true,
    compositeCallMayPerformParentFilesystemRead: true,
    v4AddsNoNetworkOrFilesystemIoBeyondFreshParents: true,
    networkOrFilesystemWritePerformed: false,
    networkOrTransportPerformed: false,
    parentV2PostImportKeyObjectPrototypeIsolationEstablished: false,
    parentV2PostImportBufferPrototypeIsolationEstablished: false,
    compositePostImportPrototypeIsolationEstablished: false,
    rawParentRecordsProjected: false,
    rawAnchorOrTransportProofBytesProjected: false,
    rawTufMetadataOrTargetBytesProjected: false,
    rawPemOrDerBytesProjected: false,
    localDirectoryPathsProjected: false,
    localEntryCommitmentsProjected: false,
    wireBytesProjected: false,
    ...fixedNegativeFacts(),
    boundary: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_BOUNDARY,
  });
}

function requireParentV2(verification, pins) {
  if (ownData(verification, "ok", "PARENT_V2") !== true
    || ownData(verification, "verificationHash", "PARENT_V2")
      !== pins.externalWitnessV2VerificationHash
    || ownData(verification, "trustPolicyHash", "PARENT_V2")
      !== pins.externalWitnessTrustPolicyHash
    || ownData(verification, "transportPolicyHash", "PARENT_V2")
      !== pins.externalWitnessTransportPolicyHash
    || ownData(verification, "localHeadFreshFullAncestryReplayVerified", "PARENT_V2")
      !== true
    || ownData(verification, "everyEntryByteCommitmentBoundAndReplayed", "PARENT_V2")
      !== true
    || ownData(verification, "completeHeadVectorBoundAndReplayed", "PARENT_V2")
      !== true
    || ownData(verification, "exactTrustPolicyReplayed", "PARENT_V2") !== true
    || ownData(verification, "exactTransportPolicyReplayed", "PARENT_V2") !== true
    || ownData(verification, "signedCheckpointVerifiedUnderCallerPolicy", "PARENT_V2")
      !== true
    || ownData(verification, "networkOrTransportPerformed", "PARENT_V2") !== false
    || ownData(verification, "externalAnchorEstablished", "PARENT_V2") !== false
    || ownData(verification, "durableExternalHeadEstablished", "PARENT_V2") !== false
    || ownData(verification, "nonEquivocationEstablished", "PARENT_V2") !== false
    || ownData(verification, "stage1Complete", "PARENT_V2") !== false
    || ownData(verification, "stage2Permitted", "PARENT_V2") !== false
    || ownData(verification, "authority", "PARENT_V2") !== "NONE") {
    fail("EXTERNAL_WITNESS_V2_PARENT_REPLAY_FAILED");
  }
}

function requireParentV3(verification, pins) {
  if (ownData(verification, "ok", "PARENT_V3") !== true
    || ownData(verification, "verificationHash", "PARENT_V3")
      !== pins.trustMaterialV3VerificationHash
    || ownData(verification, "policyHash", "PARENT_V3")
      !== pins.trustMaterialV3PolicyHash
    || ownData(verification, "witnessPolicyHash", "PARENT_V3")
      !== pins.localWitnessPolicyV3Hash
    || ownData(verification, "sigstoreTufTrustedRootReplayVerified", "PARENT_V3")
      !== true
    || ownData(verification, "sigstoreSigningConfigReplayVerified", "PARENT_V3")
      !== true
    || ownData(verification, "exactRekorProviderEndpointVerified", "PARENT_V3")
      !== true
    || ownData(verification, "exactRekorLogIdVerified", "PARENT_V3") !== true
    || ownData(verification, "exactRekorCheckpointKeyVerified", "PARENT_V3") !== true
    || ownData(verification, "witnessMOfNKeyPolicyReplayed", "PARENT_V3") !== true
    || ownData(verification, "networkOrFilesystemIoPerformed", "PARENT_V3") !== false
    || ownData(verification, "externalAnchorEstablished", "PARENT_V3") !== false
    || ownData(verification, "durableExternalHeadEstablished", "PARENT_V3") !== false
    || ownData(verification, "nonEquivocationEstablished", "PARENT_V3") !== false
    || ownData(verification, "stage1Complete", "PARENT_V3") !== false
    || ownData(verification, "stage2Permitted", "PARENT_V3") !== false
    || ownData(verification, "authority", "PARENT_V3") !== "NONE") {
    fail("TRUST_MATERIAL_V3_PARENT_REPLAY_FAILED");
  }
}

function externalWitnessPolicyViews(context) {
  const trust = exactObject(ownData(context, "trustPolicy", "PARENT_V2_CONTEXT"),
    ["schema", "provider", "profile", "trustMaterial", "requirements", "policyHash"],
    "PARENT_V2_TRUST_POLICY");
  const provider = exactObject(ownData(trust, "provider", "PARENT_V2_TRUST_POLICY"),
    ["providerId", "operatorRelationship", "relationshipAuthority"],
    "PARENT_V2_PROVIDER");
  const profile = exactObject(ownData(trust, "profile", "PARENT_V2_TRUST_POLICY"),
    ["kind", "endpointOrigin"], "PARENT_V2_PROFILE");
  const material = exactObject(ownData(trust, "trustMaterial", "PARENT_V2_TRUST_POLICY"),
    ["kind", "origin", "logPublicKeyPem", "witnesses"], "PARENT_V2_TRUST_MATERIAL");
  const requirements = exactObject(ownData(trust, "requirements",
    "PARENT_V2_TRUST_POLICY"), ["existenceTimeRequired", "inclusionProofRequired",
    "appendOnlyConsistencyRequired", "independentWitnessQuorum"],
  "PARENT_V2_REQUIREMENTS");
  const transport = exactObject(ownData(context, "transportPolicy", "PARENT_V2_CONTEXT"),
    ["schema", "policyClass", "endpointOrigin", "method", "endpointPath", "endpointUrl",
      "redirectPolicy", "requestMediaType", "responseMediaType", "tlsRequired",
      "minimumTlsPolicy", "opaqueTransportProofMediaType", "exactProofBytesRequired",
      "transportProofCryptographicVerifierImplemented",
      "callerSuppliedProofIsTransportProvenance", "networkSubmissionImplemented",
      "decisionState", "authority", "policyHash"], "PARENT_V2_TRANSPORT_POLICY");
  return { trust, provider, profile, material, requirements, transport };
}

function mappedWitnessPolicy(views, providerOrigin, providerOperator, budget) {
  const raw = fixedArray(ownData(views.material, "witnesses", "PARENT_V2_TRUST_MATERIAL"),
    MAX_WITNESSES, "PARENT_V2_WITNESSES");
  const quorum = ownData(views.requirements, "independentWitnessQuorum",
    "PARENT_V2_REQUIREMENTS");
  if (!NumberIsSafeInteger(quorum) || quorum < 1 || quorum > raw.length) {
    fail("WITNESS_QUORUM_INVALID");
  }
  const witnesses = [];
  for (let index = 0; index < raw.length; index += 1) {
    const witness = exactObject(ownData(raw.value, StringConstructor(index),
      "PARENT_V2_WITNESSES"), ["name", "operatorId", "operatorRelationship",
      "relationshipEvidenceHash", "publicKeyPem"], "PARENT_V2_WITNESS");
    if (ownData(witness, "operatorRelationship", "PARENT_V2_WITNESS")
        !== "INDEPENDENT_PROVIDER"
      || hash(ownData(witness, "relationshipEvidenceHash", "PARENT_V2_WITNESS"),
        "WITNESS_RELATIONSHIP_EVIDENCE_HASH")
        !== ownData(witness, "relationshipEvidenceHash", "PARENT_V2_WITNESS")) {
      fail("WITNESS_RELATIONSHIP_MAPPING_INVALID");
    }
    const der = exactSpkiDerFromPem(ownData(witness, "publicKeyPem",
      "PARENT_V2_WITNESS"), "ed25519", budget, true, "WITNESS_PUBLIC_KEY");
    /* The fresh v3 creator below parses each mapped DER once more. Reserve
       that nested work before invoking it so v4's aggregate budget describes
       the actual composite path, not only this module's first pass. */
    consumeKeyBudget(budget, exactInternalBufferLength(der,
      "WITNESS_PUBLIC_KEY_NESTED_REPLAY"), false, true);
    defineOwnData(witnesses, StringConstructor(index), {
      name: ownData(witness, "name", "PARENT_V2_WITNESS"),
      operator: ownData(witness, "operatorId", "PARENT_V2_WITNESS"),
      publicKey: {
        keyDetails: "PKIX_ED25519",
        rawBytes: bytesToBase64(der),
      },
    });
  }
  let policy;
  try {
    policy = createEpisodeAttemptSetExternalWitnessKeyPolicyV3({
      providerOrigin,
      providerOperator,
      quorum,
      witnesses,
    });
  } catch { fail("FRESH_WITNESS_POLICY_V3_REPLAY_FAILED"); }
  return policy;
}

const V3_REKOR_FIELDS = ["endpointOrigin", "endpointPath", "endpointUrl", "method",
  "redirectPolicy", "operator", "trustedRootIdProfile",
  "trustedRootIdSpecificationConflictAcknowledged",
  "trustedRootIdProfileInteroperabilityEstablished", "logIdBase64",
  "checkpointKeyIdBase64", "publicKeyHash", "publicKeyDetails",
  "signingConfigSelector", "signingConfigRequiredDistinctOperatorCount",
  "signingConfigEligibleDistinctOperatorCount"];

function crosswalk(policy, v2Context, v2, v3, budget) {
  const views = externalWitnessPolicyViews(v2Context);
  const rekor = exactObject(ownData(v3, "rekor", "PARENT_V3"), V3_REKOR_FIELDS,
    "PARENT_V3_REKOR");
  const endpoint = endpointOrigin(ownData(views.profile, "endpointOrigin",
    "PARENT_V2_PROFILE"), "EXTERNAL_WITNESS_ENDPOINT_ORIGIN");
  const transportOrigin = ownData(views.transport, "endpointOrigin",
    "PARENT_V2_TRANSPORT_POLICY");
  const rekorOrigin = ownData(rekor, "endpointOrigin", "PARENT_V3_REKOR");
  if (ownData(views.profile, "kind", "PARENT_V2_PROFILE")
      !== "SIGSTORE_REKOR_V2_HASHEDREKORD"
    || endpoint.value !== transportOrigin || endpoint.value !== rekorOrigin
    || ownData(views.transport, "endpointPath", "PARENT_V2_TRANSPORT_POLICY")
      !== FIXED_REQUIREMENTS.endpointPath
    || ownData(rekor, "endpointPath", "PARENT_V3_REKOR")
      !== FIXED_REQUIREMENTS.endpointPath
    || ownData(views.transport, "method", "PARENT_V2_TRANSPORT_POLICY")
      !== FIXED_REQUIREMENTS.method
    || ownData(rekor, "method", "PARENT_V3_REKOR") !== FIXED_REQUIREMENTS.method
    || ownData(views.transport, "redirectPolicy", "PARENT_V2_TRANSPORT_POLICY")
      !== FIXED_REQUIREMENTS.redirectPolicy
    || ownData(rekor, "redirectPolicy", "PARENT_V3_REKOR")
      !== FIXED_REQUIREMENTS.redirectPolicy
    || ownData(views.transport, "endpointUrl", "PARENT_V2_TRANSPORT_POLICY")
      !== `${endpoint.value}${FIXED_REQUIREMENTS.endpointPath}`
    || ownData(rekor, "endpointUrl", "PARENT_V3_REKOR")
      !== `${endpoint.value}${FIXED_REQUIREMENTS.endpointPath}`
    || ownData(views.material, "kind", "PARENT_V2_TRUST_MATERIAL")
      !== "REKOR_V2_CHECKPOINT_TRUST"
    || ownData(views.material, "origin", "PARENT_V2_TRUST_MATERIAL") !== endpoint.host) {
    fail("EXACT_ENDPOINT_OR_CHECKPOINT_ORIGIN_CROSSWALK_INVALID");
  }

  const mapping = policy.providerOperatorMapping;
  const providerId = ownData(views.provider, "providerId", "PARENT_V2_PROVIDER");
  const operator = ownData(rekor, "operator", "PARENT_V3_REKOR");
  if (providerId !== mapping.externalWitnessProviderId
    || operator !== mapping.sigstoreOperator) {
    fail("PROVIDER_OPERATOR_MAPPING_INVALID");
  }

  const logDer = exactSpkiDerFromPem(ownData(views.material, "logPublicKeyPem",
    "PARENT_V2_TRUST_MATERIAL"), "p256", budget, false, "LOG_PUBLIC_KEY");
  const commitment = byteCommitment(logDer);
  if (ownData(rekor, "publicKeyDetails", "PARENT_V3_REKOR")
      !== FIXED_REQUIREMENTS.logKeyDetails
    || ownData(rekor, "publicKeyHash", "PARENT_V3_REKOR") !== commitment.hash
    || ownData(rekor, "logIdBase64", "PARENT_V3_REKOR") !== commitment.logIdBase64
    || ownData(rekor, "checkpointKeyIdBase64", "PARENT_V3_REKOR")
      !== commitment.checkpointKeyIdBase64) {
    fail("P256_LOG_KEY_COMMITMENT_CROSSWALK_INVALID");
  }

  const witnessPolicy = mappedWitnessPolicy(views, endpoint.value, operator, budget);
  if (ownData(witnessPolicy, "policyHash", "FRESH_WITNESS_POLICY_V3")
      !== policy.parentPins.localWitnessPolicyV3Hash
    || ownData(witnessPolicy, "policyHash", "FRESH_WITNESS_POLICY_V3")
      !== ownData(v3, "witnessPolicyHash", "PARENT_V3")
    || ownData(witnessPolicy, "quorum", "FRESH_WITNESS_POLICY_V3")
      !== ownData(v3, "witnessQuorum", "PARENT_V3")
    || ownData(witnessPolicy, "witnessCount", "FRESH_WITNESS_POLICY_V3")
      !== ownData(v3, "witnessKeyCount", "PARENT_V3")) {
    fail("EXACT_ORDERED_WITNESS_POLICY_CROSSWALK_INVALID");
  }
  return {
    rekor: {
      endpointOrigin: endpoint.value,
      endpointPath: FIXED_REQUIREMENTS.endpointPath,
      endpointUrl: `${endpoint.value}${FIXED_REQUIREMENTS.endpointPath}`,
      method: FIXED_REQUIREMENTS.method,
      redirectPolicy: FIXED_REQUIREMENTS.redirectPolicy,
      externalWitnessProviderId: providerId,
      sigstoreOperator: operator,
      exactSpkiDerHash: commitment.hash,
      logIdBase64: commitment.logIdBase64,
      checkpointKeyIdBase64: commitment.checkpointKeyIdBase64,
      keyDetails: FIXED_REQUIREMENTS.logKeyDetails,
    },
    witnessPolicyHash: witnessPolicy.policyHash,
    witnessQuorum: witnessPolicy.quorum,
    witnessCount: witnessPolicy.witnessCount,
  };
}

export function replayEpisodeAttemptSetExternalWitnessTrustBoundV4(
  record, context = {}) {
  try {
    const input = exactObject(record, ["schema", "bindingPolicy",
      "externalWitnessCandidateV2", "trustMaterialRecordV3"], "RECORD");
    const replayContext = exactObject(context, ["externalWitnessV2", "trustMaterialV3",
      "expectedBindingPolicyHash"], "CONTEXT");
    if (ownData(input, "schema", "RECORD")
      !== EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_SCHEMAS.record) {
      fail("RECORD_SCHEMA_INVALID");
    }
    const externalWitnessContext = snapshotExternalWitnessV2Context(ownData(
      replayContext, "externalWitnessV2", "CONTEXT"));
    const trustMaterialContext = exactObject(ownData(replayContext,
      "trustMaterialV3", "CONTEXT"), ["expectedPolicyHash"],
    "PARENT_V3_CONTEXT");
    const policy = replayBindingPolicy(ownData(input, "bindingPolicy", "RECORD"),
      ownData(replayContext, "expectedBindingPolicyHash", "CONTEXT"));
    const pins = policy.parentPins;
    if (hash(ownData(externalWitnessContext, "expectedTrustPolicyHash",
      "PARENT_V2_CONTEXT"), "CONTEXT_EXTERNAL_WITNESS_TRUST_POLICY_HASH")
        !== pins.externalWitnessTrustPolicyHash
      || hash(ownData(externalWitnessContext, "expectedTransportPolicyHash",
        "PARENT_V2_CONTEXT"), "CONTEXT_EXTERNAL_WITNESS_TRANSPORT_POLICY_HASH")
        !== pins.externalWitnessTransportPolicyHash
      || hash(ownData(trustMaterialContext, "expectedPolicyHash", "PARENT_V3_CONTEXT"),
        "CONTEXT_TRUST_MATERIAL_POLICY_HASH") !== pins.trustMaterialV3PolicyHash) {
      fail("PARENT_CONTEXT_PIN_CROSSWALK_INVALID");
    }

    let v2;
    let v3;
    try {
      v2 = verifyEpisodeAttemptSetExternalWitnessCandidateV2(
        ownData(input, "externalWitnessCandidateV2", "RECORD"), externalWitnessContext);
    } catch { fail("EXTERNAL_WITNESS_V2_PARENT_CALL_FAILED"); }
    try {
      v3 = replayEpisodeAttemptSetExternalWitnessTrustMaterialV3(
        ownData(input, "trustMaterialRecordV3", "RECORD"), trustMaterialContext);
    } catch { fail("TRUST_MATERIAL_V3_PARENT_CALL_FAILED"); }
    requireParentV2(v2, pins);
    requireParentV3(v3, pins);

    const budget = newCrosswalkBudget();
    const bound = crosswalk(policy, externalWitnessContext, v2, v3, budget);
    const body = {
      schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_SCHEMAS.verification,
      ok: true,
      replayClass: "TWO_PARENT_ATTEMPT_TUF_REKOR_TRUST_CROSSWALK_REPLAY_HOLD_ONLY",
      bindingPolicyHash: policy.policyHash,
      externalWitnessV2VerificationHash: ownData(v2, "verificationHash", "PARENT_V2"),
      trustMaterialV3VerificationHash: ownData(v3, "verificationHash", "PARENT_V3"),
      candidateHash: ownData(v2, "candidateHash", "PARENT_V2"),
      requestHash: ownData(v2, "requestHash", "PARENT_V2"),
      headBindingHash: ownData(v2, "headBindingHash", "PARENT_V2"),
      localHeadHash: ownData(v2, "localHeadHash", "PARENT_V2"),
      localHeadVerificationHash: ownData(v2, "localHeadVerificationHash", "PARENT_V2"),
      externalWitnessTrustPolicyHash: ownData(v2, "trustPolicyHash", "PARENT_V2"),
      externalWitnessTransportPolicyHash: ownData(v2, "transportPolicyHash", "PARENT_V2"),
      trustMaterialV3PolicyHash: ownData(v3, "policyHash", "PARENT_V3"),
      witnessPolicyV3Hash: bound.witnessPolicyHash,
      trustedRootTargetHash: ownData(v3, "trustedRootTargetHash", "PARENT_V3"),
      signingConfigTargetHash: ownData(v3, "signingConfigTargetHash", "PARENT_V3"),
      rekorBinding: bound.rekor,
      witnessQuorum: bound.witnessQuorum,
      witnessCount: bound.witnessCount,
      bothParentsFreshReplayVerified: true,
      externalWitnessV2ContextSnapshotUsed: true,
      parentAndCrosswalkSameV2ContextSnapshotVerified: true,
      attemptFullAncestryAndHeadBindingVerified: true,
      exactEndpointAndTransportPolicyMapped: true,
      exactTufSelectedLogKeyCommitmentMapped: true,
      exactLocalWitnessKeyPolicyMapped: true,
      tufTrustedRootAndSigningConfigReplayVerifiedUnderCallerBootstrap: true,
      crosswalkOperationBudgetEnforced: true,
      nestedWitnessPolicyReplayIncludedInCrosswalkBudget: true,
      crosswalkOperationUsage: {
        publicKeyParseOperations: ownData(budget, "publicKeyParseOperations",
          "INTERNAL_CROSSWALK_BUDGET"),
        exactSpkiDerBytes: ownData(budget, "exactSpkiDerBytes",
          "INTERNAL_CROSSWALK_BUDGET"),
        witnessesMapped: ownData(budget, "witnessesMapped",
          "INTERNAL_CROSSWALK_BUDGET"),
        nestedWitnessPolicyReplayPublicKeyParseOperations: ownData(budget,
          "nestedWitnessPolicyReplayPublicKeyParseOperations",
          "INTERNAL_CROSSWALK_BUDGET"),
      },
      parentV2LocalHeadFilesystemReadRequired: true,
      compositeCallMayPerformParentFilesystemRead: true,
      v4AddsNoNetworkOrFilesystemIoBeyondFreshParents: true,
      networkOrFilesystemWritePerformed: false,
      networkOrTransportPerformed: false,
      parentV2PostImportKeyObjectPrototypeIsolationEstablished: false,
      parentV2PostImportBufferPrototypeIsolationEstablished: false,
      compositePostImportPrototypeIsolationEstablished: false,
      rawParentRecordsProjected: false,
      rawAnchorOrTransportProofBytesProjected: false,
      rawTufMetadataOrTargetBytesProjected: false,
      rawPemOrDerBytesProjected: false,
      localDirectoryPathsProjected: false,
      localEntryCommitmentsProjected: false,
      wireBytesProjected: false,
      ...fixedNegativeFacts(),
      boundary: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_BOUND_V4_BOUNDARY,
    };
    return deepFreeze({ ...body, verificationHash: digest(
      "external-witness-trust-bound-verification", body) });
  } catch (error) {
    return verificationFailure(error);
  }
}
