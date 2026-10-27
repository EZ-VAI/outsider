/*
 * Versioned, private, zero-I/O Sigstore trust-material replay prerequisite.
 *
 * This module authenticates exact TrustedRoot and SigningConfig target bytes
 * through a caller-supplied TUF role chain.  It verifies a
 * sequential root rotation with both predecessor and successor thresholds,
 * then verifies timestamp -> snapshot -> targets -> target hashes.  It also
 * fixes one Rekor v2 provider origin and POST path, binds the matching
 * TrustedRoot log key, and replays an M-of-N checkpoint-witness key policy.
 *
 * The bootstrap root, all metadata, target bytes, policy, pins, and replay
 * time are supplied by the caller.  Successful cryptography therefore proves
 * continuity only under that caller bootstrap.  It does not establish that
 * any byte was fetched from Sigstore, that a source or transport was
 * independent, that any witness is operationally independent, or that a live
 * Rekor service exists.  Sigstore's current schema has no witness-policy
 * field; the local v3 witness policy is not represented as a Sigstore/TUF
 * target.  No network, filesystem, publication, authority, or action path is
 * implemented here.
 */

import {
  constants as cryptoConstants,
  createHash,
  createPublicKey,
  Hash,
  verify as cryptoVerify,
  X509Certificate,
} from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";

const ArrayIsArray = Array.isArray;
const ArrayConstructor = Array;
const ArrayPrototype = Array.prototype;
const ArrayJoin = Function.prototype.call.bind(Array.prototype.join);
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const BufferAllocUnsafe = Buffer.allocUnsafe;
const BufferFrom = Buffer.from;
const BufferPrototype = Buffer.prototype;
const DateParse = Date.parse;
const DateConstructor = Date;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const FunctionHasInstance = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(Function.prototype, Symbol.hasInstance).value);
const HashDigest = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(Hash.prototype, "digest").value);
const HashUpdate = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(Hash.prototype, "update").value);
const JSONParse = JSON.parse;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const NumberNaN = Number.NaN;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
const ObjectCreate = Object.create;
const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors;
const ObjectGetPrototypeOf = Object.getPrototypeOf;
const ObjectHasOwn = Object.hasOwn;
const ObjectIsFrozen = Object.isFrozen;
const ObjectKeys = Object.keys;
const ObjectPrototype = Object.prototype;
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpExec = Function.prototype.call.bind(RegExp.prototype.exec);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringPrototype = String.prototype;
const StringConstructor = String;
const StringCharAt = Function.prototype.call.bind(StringPrototype.charAt);
const StringEndsWith = Function.prototype.call.bind(StringPrototype.endsWith);
const StringCharCodeAt = Function.prototype.call.bind(StringPrototype.charCodeAt);
const StringCodePointAt = Function.prototype.call.bind(StringPrototype.codePointAt);
const StringIncludes = Function.prototype.call.bind(StringPrototype.includes);
const StringSlice = Function.prototype.call.bind(StringPrototype.slice);
const TextDecoderConstructor = TextDecoder;
const TextDecoderDecode = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(TextDecoder.prototype, "decode").value);
const TypeErrorConstructor = TypeError;
const IntrinsicTypedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype);
const TypedArrayLength = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(IntrinsicTypedArrayPrototype, "length").get);
const TypedArrayByteLength = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(IntrinsicTypedArrayPrototype, "byteLength").get);
const TypedArraySet = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(IntrinsicTypedArrayPrototype, "set").value);
const URLConstructor = URL;
const URLHash = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URL.prototype, "hash").get);
const URLOrigin = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URL.prototype, "origin").get);
const URLPassword = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URL.prototype, "password").get);
const URLPathname = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URL.prototype, "pathname").get);
const URLProtocol = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URL.prototype, "protocol").get);
const URLSearch = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URL.prototype, "search").get);
const URLUsername = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(URL.prototype, "username").get);
const KeyProbe = createPublicKey(publicKeyImportOptions(BufferFrom(
  "302a300506032b65700321000000000000000000000000000000000000000000000000000000000000000000",
  "hex"), "der", "spki"));
const PublicKeyObjectPrototype = ObjectGetPrototypeOf(KeyProbe);
const AsymmetricKeyObjectPrototype = ObjectGetPrototypeOf(PublicKeyObjectPrototype);
const KeyAsymmetricKeyType = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(AsymmetricKeyObjectPrototype, "asymmetricKeyType").get);
const RSA_PKCS1_PSS_PADDING = cryptoConstants.RSA_PKCS1_PSS_PADDING;
const RSA_PSS_SALTLEN_DIGEST = cryptoConstants.RSA_PSS_SALTLEN_DIGEST;

const HASH = /^sha256:[a-f0-9]{64}$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
const HEX_SIGNATURE = /^(?:[a-f0-9]{2})+$/u;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const TUF_SPEC = /^1\.0(?:\.\d+)?$/u;
const RFC3339 = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?Z$/u;
const OPERATOR = /^[A-Za-z0-9](?:[A-Za-z0-9.-]{0,253}[A-Za-z0-9])?$/u;
const WITNESS_NAME = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/u;
const TUF_TARGET_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.?\/)\S{1,255}$/u;
const ENCODED_DOT_OR_SEPARATOR = /%(?:2e|2f|5c)/iu;
const TYPED_ERROR = /^EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_[A-Z0-9_:]+$/u;

const MAX_JSON_BYTES = 8 * 1024 * 1024;
const MAX_ROOT_ROTATIONS = 16;
const MAX_TUF_KEYS = 64;
const MAX_TUF_SIGNATURES = 80;
const MAX_METADATA_ENTRIES = 2048;
const MAX_TLOGS = 32;
const MAX_SERVICES = 32;
const MAX_WITNESSES = 16;
const MAX_CERTIFICATE_AUTHORITIES = 16;
const MAX_CERTIFICATE_CHAIN = 8;
const MAX_JSON_DEPTH = 96;
const MAX_JSON_MEMBERS = 100_000;
const MAX_TOTAL_RAW_BYTES = 64 * 1024 * 1024;
const MAX_CRYPTO_VERIFY_OPERATIONS = 48;
const MAX_VERIFIED_MESSAGE_BYTES = 16 * 1024 * 1024;
const MAX_PUBLIC_KEY_PARSE_OPERATIONS = 128;
const MAX_X509_PARSE_OPERATIONS = 64;
const MAX_X509_DER_BYTES = 2 * 1024 * 1024;
const MAX_TUF_CANONICAL_WORK = 32 * 1024 * 1024;
const BASE64_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/* Never let an inherited setter observe a caller value.  Descriptor and
   options records are null-prototype objects because WebIDL/Node option
   conversion reads optional names through ordinary property lookup. */
function defineOwnData(target, key, value) {
  const descriptor = ObjectCreate(null);
  descriptor.value = value;
  descriptor.writable = true;
  descriptor.enumerable = true;
  descriptor.configurable = true;
  ObjectDefineProperty(target, key, descriptor);
  return value;
}

function pushOwn(array, value) {
  const lengthDescriptor = ObjectGetOwnPropertyDescriptor(array, "length");
  const index = lengthDescriptor.value;
  defineOwnData(array, StringConstructor(index), value);
  return index + 1;
}

function newOperationBudget() {
  return {
    cryptoVerifyOperations: 0,
    verifiedMessageBytes: 0,
    publicKeyParseOperations: 0,
    x509ParseOperations: 0,
    x509DerBytes: 0,
    tufCanonicalWork: 0,
  };
}

function consumeOperation(budget, field, amount, maximum, code) {
  const descriptor = ObjectGetOwnPropertyDescriptor(budget, field);
  if (!descriptor || !ObjectHasOwn(descriptor, "value")
    || !NumberIsSafeInteger(descriptor.value) || descriptor.value < 0
    || !NumberIsSafeInteger(amount) || amount < 0
    || descriptor.value > maximum - amount) fail(`${code}_BUDGET_EXCEEDED`);
  defineOwnData(budget, field, descriptor.value + amount);
}

function publicKeyImportOptions(key, format, type) {
  const options = ObjectCreate(null);
  defineOwnData(options, "key", key);
  defineOwnData(options, "format", format);
  defineOwnData(options, "type", type);
  defineOwnData(options, "encoding", undefined);
  defineOwnData(options, "cipher", undefined);
  defineOwnData(options, "passphrase", undefined);
  return options;
}

function verificationKeyOptions(key, format, type, padding, saltLength, dsaEncoding) {
  const options = ObjectCreate(null);
  defineOwnData(options, "key", key);
  defineOwnData(options, "padding", padding);
  defineOwnData(options, "saltLength", saltLength);
  defineOwnData(options, "dsaEncoding", dsaEncoding);
  defineOwnData(options, "context", undefined);
  defineOwnData(options, "encoding", undefined);
  defineOwnData(options, "format", format);
  defineOwnData(options, "type", type);
  defineOwnData(options, "cipher", undefined);
  defineOwnData(options, "passphrase", undefined);
  return options;
}

function textDecoderOptions() {
  const options = ObjectCreate(null);
  defineOwnData(options, "fatal", true);
  defineOwnData(options, "ignoreBOM", false);
  return options;
}

function regexTest(pattern, value) {
  return RegExpExec(pattern, value) !== null;
}

function copyByteRange(bytes, start, end, code) {
  const length = TypedArrayLength(bytes);
  if (!NumberIsSafeInteger(start) || !NumberIsSafeInteger(end)
    || start < 0 || end < start || end > length) fail(`${code}_RANGE_INVALID`);
  const copy = BufferAllocUnsafe(end - start);
  for (let index = 0; index < end - start; index += 1) {
    copy[index] = bytes[start + index];
  }
  return copy;
}

export const EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_SCHEMAS
  = ObjectFreeze({
    policy:
      "outsider/episode-attempt-set-external-witness-trust-material-policy/v3",
    witnessPolicy:
      "outsider/rekor-checkpoint-witness-key-policy/v3",
    verification:
      "outsider/episode-attempt-set-external-witness-trust-material-verification/v3",
  });

function fail(code) {
  throw new TypeErrorConstructor(
    `EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_${code}`);
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

export const EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_BOUNDARY
  = deepFreeze({
    position:
      "PRIVATE_OFFLINE_TUF_TRUST_MATERIAL_AND_REKOR_POLICY_REPLAY_HOLD_ONLY",
    predecessorExternalWitnessV2Modified: false,
    networkTransportImplemented: false,
    networkSubmissionPerformed: false,
    filesystemReadPerformed: false,
    filesystemWritePerformed: false,
    rawTufMetadataProjected: false,
    rawTrustedRootProjected: false,
    rawSigningConfigProjected: false,
    aggregateRawInputByteBudget: MAX_TOTAL_RAW_BYTES,
    replayOperationBudgetEnforced: true,
    cryptoVerifyOperationBudget: MAX_CRYPTO_VERIFY_OPERATIONS,
    verifiedMessageByteBudget: MAX_VERIFIED_MESSAGE_BYTES,
    publicKeyParseOperationBudget: MAX_PUBLIC_KEY_PARSE_OPERATIONS,
    x509ParseOperationBudget: MAX_X509_PARSE_OPERATIONS,
    x509DerByteBudget: MAX_X509_DER_BYTES,
    tufCanonicalWorkBudget: MAX_TUF_CANONICAL_WORK,
    rootRotationLimit: MAX_ROOT_ROTATIONS,
    tufKeyLimitPerRoot: MAX_TUF_KEYS,
    tufSignatureLimitPerEnvelope: MAX_TUF_SIGNATURES,
    certificateAuthorityLimitPerKind: MAX_CERTIFICATE_AUTHORITIES,
    certificateChainLimit: MAX_CERTIFICATE_CHAIN,
    callerBootstrapAcceptedAsIndependentTrustAnchor: false,
    callerPinsAcceptedAsExternalProvenance: false,
    callerReplayTimeAcceptedAsExternalTime: false,
    tufCryptographicContinuityCanBeReplayed: true,
    tufRootOldAndNewThresholdsRequired: true,
    tufRootChainAuthenticatedByDualThresholds: true,
    tufRollbackProtectionEstablished: false,
    tufLatestRootEstablished: false,
    tufPriorTrustedMetadataStateReplayed: false,
    tufFinalRootListedInSnapshotRequired: false,
    tufDuplicateKeyIdCountsAtMostOnce: true,
    tufThresholdCountsDistinctAuthorizedKeyIds: true,
    physicalCryptographicKeyIndependenceEstablished: false,
    tufSupportedKeyProfile:
      "ED25519_ECDSA_P256_RSA_PSS_SHA256_RSA_2048_TO_4096_EXPONENT_65537",
    genericTufKeyAlgorithmInteroperabilityEstablished: false,
    tufUnknownSignedExtensionsIncludedInSignatureBytes: true,
    tufUnknownSignedExtensionsProjected: false,
    tufKeyIdDerivationVerified: true,
    tufTargetLengthAndSha256Required: true,
    sigstoreTrustedRootV02SchemaRequired: true,
    sigstoreSigningConfigV02SchemaRequired: true,
    certificateChainPathValidationPerformed: false,
    nonEmptyCaTsaSemanticTrustEstablished: false,
    rekorV2ExactEndpointRequired: true,
    rekorLogIdSha256Spki32Required: true,
    rekorCheckpointSignedNoteTruncated4Required: true,
    rekorV2TrustRootIdSpecificationConflictAcknowledged: true,
    rekorV2TrustRootIdProfileInteroperabilityEstablished: false,
    witnessPolicyIsSigstoreSchema: false,
    sigstoreTufWitnessPolicyAvailable: false,
    witnessKeyPolicyMOfNCanBeReplayed: true,
    witnessSignaturesVerified: false,
    witnessOperationalIndependenceEstablished: false,
    officialSourceBytesEstablished: false,
    actualPublishedSigstoreTargetBytesReplayed: false,
    currentPublicSigningConfigSelectsRekorV2: false,
    verificationPublicationNetworkSafe: false,
    stableLinkagePrivateOnly: true,
    independentlySourcedBootstrapEstablished: false,
    sourceProvenanceEstablished: false,
    transportProvenanceEstablished: false,
    publicProviderInteroperabilityObserved: false,
    publicProviderLiveArtifactEstablished: false,
    independentWitnessEstablished: false,
    crossCheckpointConsistencyVerified: false,
    splitViewExcluded: false,
    nonEquivocationEstablished: false,
    durableExternalHeadEstablished: false,
    externalAnchorEstablished: false,
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

export const EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_PROOF_MATRIX
  = deepFreeze({
    callerBootstrapAndPins: {
      proves: ["EXACT_CALLER_BOOTSTRAP_AND_PIN_BYTE_REPLAY"],
      doesNotProve: [
        "SIGSTORE_ORIGIN_OR_INDEPENDENT_ACQUISITION",
        "CORRECT_OR_UNCOMPROMISED_BOOTSTRAP",
      ],
    },
    tufRootRotation: {
      proves: [
        "SEQUENTIAL_N_PLUS_ONE_ROOT_CHAIN",
        "EACH_SUCCESSOR_SIGNED_BY_DISTINCT_AUTHORIZED_KEYIDS_FOR_PREDECESSOR_AND_SUCCESSOR_ROOT_THRESHOLDS",
        "EACH_ROOT_KEY_ID_IS_SHA256_OF_ITS_FULL_OLPC_CANONICAL_KEY_OBJECT",
      ],
      doesNotProve: [
        "OUT_OF_BAND_BOOTSTRAP_AUTHENTICITY",
        "ABSENCE_OF_FREEZE_ATTACK",
        "LATEST_ROOT_OR_ROLLBACK_PROTECTION",
        "PRIOR_TRUSTED_TIMESTAMP_SNAPSHOT_OR_TARGETS_STATE",
        "PHYSICAL_CRYPTOGRAPHIC_KEY_INDEPENDENCE",
        "GENERIC_TUF_KEY_ALGORITHM_INTEROPERABILITY",
      ],
    },
    tufTargets: {
      proves: [
        "TIMESTAMP_SNAPSHOT_TARGETS_ROLE_THRESHOLD_SIGNATURES_UNDER_FINAL_CALLER_ROOT",
        "EXACT_TARGET_LENGTH_AND_SHA256_BINDING",
      ],
      doesNotProve: ["LIVE_FETCH", "EXTERNAL_TIME", "OFFICIAL_SOURCE_PROVENANCE"],
    },
    sigstoreTargets: {
      proves: [
        "TRUSTEDROOT_V02_AND_SIGNINGCONFIG_V02_SCHEMA_REPLAY",
        "EXACT_REKOR_V2_PROVIDER_ENDPOINT_LOG_ID_AND_CHECKPOINT_KEY_BINDING",
      ],
      doesNotProve: [
        "LIVE_PROVIDER",
        "PROVIDER_RESPONSE",
        "TRANSPORT_PROVENANCE",
        "OFFICIAL_REKOR_V2_TRUSTEDROOT_ID_PROFILE_INTEROPERABILITY",
        "CA_OR_TSA_CERTIFICATE_CHAIN_PATH_OR_ARTIFACT_TRUST",
      ],
    },
    witnessPolicy: {
      proves: [
        "VERSIONED_LOCAL_M_OF_N_DISTINCT_WITNESS_KEY_POLICY_REPLAY",
      ],
      doesNotProve: [
        "SIGSTORE_TUF_DISTRIBUTION_OF_WITNESS_POLICY",
        "WITNESS_SIGNATURE_OR_OPERATIONAL_INDEPENDENCE",
        "CONSISTENCY_OR_NON_EQUIVOCATION",
      ],
    },
  });

function fixedObject(value, expected, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_PROTOTYPE_INVALID`);
  }
  const result = {};
  for (let index = 0; index < expected.length; index += 1) {
    const key = expected[index];
    const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
    defineOwnData(result, key, descriptor.value);
  }
  return result;
}

function fixedArray(value, maximum, code) {
  if (!ArrayIsArray(value) || isProxy(value)
    || ObjectGetPrototypeOf(value) !== ArrayPrototype) fail(`${code}_ARRAY_INVALID`);
  const lengthDescriptor = ObjectGetOwnPropertyDescriptor(value, "length");
  if (!lengthDescriptor || !ObjectHasOwn(lengthDescriptor, "value")
    || !NumberIsSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0
    || lengthDescriptor.value > maximum) fail(`${code}_LENGTH_INVALID`);
  const length = lengthDescriptor.value;
  const result = new ArrayConstructor(length);
  for (let index = 0; index < length; index += 1) {
    const key = StringConstructor(index);
    const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) {
      fail(`${code}_DENSE_INVALID`);
    }
    defineOwnData(result, key, descriptor.value);
  }
  return result;
}

/* Build only the bounded shape of a trusted, locally rebuilt template. This
   never enumerates caller objects, so unknown metadata remains inert while
   every known field can still be compared without forwarding raw wrappers. */
function fixedProjection(value, template, code, depth = 0) {
  if (depth > MAX_JSON_DEPTH) fail(`${code}_DEPTH_INVALID`);
  if (template === null || typeof template !== "object") {
    if (value !== template) fail(`${code}_PRIMITIVE_INVALID`);
    return template;
  }
  if (ArrayIsArray(template)) {
    const items = fixedArray(value, template.length, `${code}_ARRAY`);
    if (items.length !== template.length) fail(`${code}_ARRAY_LENGTH_INVALID`);
    const result = new ArrayConstructor(items.length);
    for (let index = 0; index < items.length; index += 1) {
      defineOwnData(result, StringConstructor(index),
        fixedProjection(items[index], template[index], code, depth + 1));
    }
    return result;
  }
  const keys = ObjectKeys(template);
  const view = fixedObject(value, keys, `${code}_OBJECT`);
  const result = {};
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    defineOwnData(result, key,
      fixedProjection(view[key], template[key], code, depth + 1));
  }
  return result;
}

function exactCallerBufferLength(value, code) {
  /* util.types.isProxy is an internal-slot check and must precede every
     operation that could dispatch a Proxy trap, including getPrototypeOf. */
  if (isProxy(value) || value === null || typeof value !== "object") {
    fail(`${code}_BUFFER_REQUIRED`);
  }
  let prototype;
  let length;
  let byteLength;
  try {
    prototype = ObjectGetPrototypeOf(value);
    length = TypedArrayLength(value);
    byteLength = TypedArrayByteLength(value);
  } catch { fail(`${code}_BUFFER_REQUIRED`); }
  if (prototype !== BufferPrototype || length !== byteLength) {
    fail(`${code}_BUFFER_REQUIRED`);
  }
  if (!NumberIsSafeInteger(length) || length < 1 || length > MAX_JSON_BYTES) {
    fail(`${code}_SIZE_INVALID`);
  }
  if (ObjectHasOwn(value, "length") || ObjectHasOwn(value, "byteLength")) {
    fail(`${code}_BUFFER_DECORATION_INVALID`);
  }
  return length;
}

function rawBytes(value, code) {
  const length = exactCallerBufferLength(value, code);
  const copy = BufferAllocUnsafe(length);
  try { TypedArraySet(copy, value, 0); } catch { fail(`${code}_COPY_FAILED`); }
  return copy;
}

function callerBufferLength(value, code) {
  return exactCallerBufferLength(value, code);
}

function aggregateRawInputBytes(input) {
  let total = 0;
  const add = (value, code) => {
    const length = callerBufferLength(value, code);
    if (total > MAX_TOTAL_RAW_BYTES - length) fail("TOTAL_RAW_BYTES_EXCEEDED");
    total += length;
  };
  add(input.bootstrapRootBytes, "BOOTSTRAP_ROOT");
  const rotations = fixedArray(input.rootRotationBytes, MAX_ROOT_ROTATIONS,
    "ROOT_ROTATIONS");
  for (let index = 0; index < rotations.length; index += 1) {
    add(rotations[index], "ROTATED_ROOT");
  }
  add(input.timestampBytes, "TIMESTAMP");
  add(input.snapshotBytes, "SNAPSHOT");
  add(input.targetsBytes, "TARGETS");
  add(input.trustedRootBytes, "TRUSTED_ROOT_TARGET");
  add(input.signingConfigBytes, "SIGNING_CONFIG_TARGET");
  return { rotations, total };
}

function hashBytes(bytes) {
  const hash = createHash("sha256");
  HashUpdate(hash, bytes);
  return `sha256:${HashDigest(hash, "hex")}`;
}

function bytesToHex(bytes) {
  const alphabet = "0123456789abcdef";
  const length = TypedArrayLength(bytes);
  let result = "";
  for (let index = 0; index < length; index += 1) {
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

function digest(label, value) {
  const hash = createHash("sha256");
  HashUpdate(hash, `outsider:${label}:v3\0`, "utf8");
  HashUpdate(hash, canonicalizeStrict(value), "utf8");
  return `sha256:${HashDigest(hash, "hex")}`;
}

function strictHash(value, code) {
  if (typeof value !== "string" || value.length !== 71
    || !regexTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function strictBase64(value, code, expectedLength = null) {
  if (typeof value !== "string" || value.length < 4
    || value.length > MAX_JSON_BYTES * 2) fail(`${code}_INVALID`);
  if (expectedLength !== null) {
    const rounded = expectedLength + 2 - ((expectedLength + 2) % 3);
    if (value.length !== (rounded / 3) * 4) fail(`${code}_INVALID`);
  }
  if (!regexTest(BASE64, value)) fail(`${code}_INVALID`);
  const bytes = BufferFrom(value, "base64");
  if (bytesToBase64(bytes) !== value
    || (expectedLength !== null && TypedArrayLength(bytes) !== expectedLength)) {
    fail(`${code}_INVALID`);
  }
  return bytes;
}

function pemPublicKeyDer(value, code) {
  const begin = "-----BEGIN PUBLIC KEY-----";
  const end = "-----END PUBLIC KEY-----";
  if (typeof value !== "string" || value.length > 32_768
    || StringSlice(value, 0, begin.length) !== begin) fail(`${code}_PEM_INVALID`);
  let offset = begin.length;
  if (StringCharAt(value, offset) === "\r"
    && StringCharAt(value, offset + 1) === "\n") offset += 2;
  else if (StringCharAt(value, offset) === "\n") offset += 1;
  else fail(`${code}_PEM_INVALID`);
  let endOffset = -1;
  for (let index = offset; index + end.length <= value.length; index += 1) {
    if (StringSlice(value, index, index + end.length) === end) {
      endOffset = index;
      break;
    }
  }
  if (endOffset < offset) fail(`${code}_PEM_INVALID`);
  const suffix = StringSlice(value, endOffset + end.length);
  if (suffix !== "" && suffix !== "\n" && suffix !== "\r\n") {
    fail(`${code}_PEM_INVALID`);
  }
  let encoded = "";
  for (let index = offset; index < endOffset; index += 1) {
    const character = StringCharAt(value, index);
    if (character === "\n") continue;
    if (character === "\r" && StringCharAt(value, index + 1) === "\n") {
      index += 1;
      continue;
    }
    encoded += character;
  }
  return strictBase64(encoded, `${code}_PEM_BODY`);
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

function positiveDerIntegerBits(bytes, element, code) {
  let start = element.contentStart;
  if (start >= element.end) fail(`${code}_DER_INVALID`);
  const first = bytes[start];
  if (first === 0) {
    if (start + 1 >= element.end || bytes[start + 1] < 0x80) {
      fail(`${code}_DER_INVALID`);
    }
    start += 1;
  } else if ((first & 0x80) !== 0) fail(`${code}_DER_INVALID`);
  const significant = bytes[start];
  if (significant === 0) fail(`${code}_DER_INVALID`);
  let leadingZeroBits = 0;
  for (let mask = 0x80; (significant & mask) === 0; mask >>>= 1) {
    leadingZeroBits += 1;
  }
  return (element.end - start) * 8 - leadingZeroBits;
}

function smallPositiveDerInteger(bytes, element, code) {
  const bits = positiveDerIntegerBits(bytes, element, code);
  if (bits > 32) fail(`${code}_RANGE_INVALID`);
  let start = element.contentStart;
  if (bytes[start] === 0) start += 1;
  let value = 0;
  for (let index = start; index < element.end; index += 1) {
    value = value * 256 + bytes[index];
  }
  if (!NumberIsSafeInteger(value) || value < 3 || value > 0xffffffff
    || (value & 1) !== 1) fail(`${code}_RANGE_INVALID`);
  return value;
}

function spkiProfile(bytes, algorithm, rsaMode, code) {
  const byteLength = TypedArrayLength(bytes);
  const outer = derElement(bytes, 0, 0x30, code);
  if (outer.end !== byteLength) fail(`${code}_DER_INVALID`);
  const algorithmIdentifier = derElement(bytes, outer.contentStart, 0x30, code);
  const algorithmHex = bytesToHex(copyByteRange(bytes, algorithmIdentifier.start,
    algorithmIdentifier.end, `${code}_ALGORITHM_IDENTIFIER`));
  const bitString = derElement(bytes, algorithmIdentifier.end, 0x03, code);
  if (bitString.end !== outer.end || bitString.contentStart >= bitString.end
    || bytes[bitString.contentStart] !== 0) fail(`${code}_DER_INVALID`);
  if (algorithm === "ed25519") {
    if (algorithmHex !== "300506032b6570"
      || bitString.end - bitString.contentStart !== 33) fail(`${code}_PROFILE_INVALID`);
    return { keyType: "ed25519", rsaBits: null };
  }
  if (algorithm === "ecdsa") {
    if (algorithmHex !== "301306072a8648ce3d020106082a8648ce3d030107") {
      fail(`${code}_PROFILE_INVALID`);
    }
    const pointLength = bitString.end - bitString.contentStart - 1;
    const pointTag = bytes[bitString.contentStart + 1];
    if (!((pointLength === 65 && pointTag === 0x04)
      || (pointLength === 33 && (pointTag === 0x02 || pointTag === 0x03)))) {
      fail(`${code}_PROFILE_INVALID`);
    }
    return { keyType: "ec", rsaBits: null };
  }
  if (algorithmHex !== "300d06092a864886f70d0101010500") {
    fail(`${code}_PROFILE_INVALID`);
  }
  const rsaSequence = derElement(bytes, bitString.contentStart + 1, 0x30, code);
  if (rsaSequence.end !== bitString.end) fail(`${code}_DER_INVALID`);
  const modulus = derElement(bytes, rsaSequence.contentStart, 0x02, code);
  const exponent = derElement(bytes, modulus.end, 0x02, code);
  if (exponent.end !== rsaSequence.end) fail(`${code}_DER_INVALID`);
  const rsaBits = positiveDerIntegerBits(bytes, modulus, `${code}_MODULUS`);
  const exponentValue = smallPositiveDerInteger(bytes, exponent, `${code}_EXPONENT`);
  if (exponentValue !== 65537
    || (rsaMode === "exact2048" ? rsaBits !== 2048 : rsaBits < 2048 || rsaBits > 4096)) {
    fail(`${code}_PROFILE_INVALID`);
  }
  return { keyType: "rsa", rsaBits };
}

function rfc3339(value, code) {
  const milliseconds = typeof value === "string" ? DateParse(value) : NumberNaN;
  const normalized = typeof value === "string" && value.length === 20
    ? `${StringSlice(value, 0, -1)}.000Z` : value;
  if (typeof value !== "string" || !regexTest(RFC3339, value)
    || !NumberIsFinite(milliseconds)
    || DateToISOString(new DateConstructor(milliseconds)) !== normalized) fail(`${code}_INVALID`);
  return value;
}

function activeAt(range, time, code) {
  const view = fixedObject(range, ["start"], code);
  const start = rfc3339(view.start, `${code}_START`);
  const endDescriptor = ObjectGetOwnPropertyDescriptor(range, "end");
  let end = null;
  if (endDescriptor !== undefined) {
    if (!ObjectHasOwn(endDescriptor, "value") || endDescriptor.enumerable !== true) {
      fail(`${code}_END_FIELDS_INVALID`);
    }
    end = rfc3339(endDescriptor.value, `${code}_END`);
  }
  if (end !== null && DateParse(end) < DateParse(start)) fail(`${code}_ORDER_INVALID`);
  return DateParse(start) <= DateParse(time)
    && (end === null || DateParse(time) <= DateParse(end));
}

function httpsOrigin(value, code) {
  if (typeof value !== "string" || value.length > 2048) fail(`${code}_INVALID`);
  let parsed;
  try { parsed = new URLConstructor(value); } catch { fail(`${code}_INVALID`); }
  if (URLProtocol(parsed) !== "https:" || URLUsername(parsed) !== ""
    || URLPassword(parsed) !== "" || URLSearch(parsed) !== "" || URLHash(parsed) !== ""
    || URLPathname(parsed) !== "/" || URLOrigin(parsed) !== value) fail(`${code}_INVALID`);
  return value;
}

function httpsUrl(value, code) {
  if (typeof value !== "string" || value.length > 2048) fail(`${code}_INVALID`);
  let parsed;
  try { parsed = new URLConstructor(value); } catch { fail(`${code}_INVALID`); }
  if (URLProtocol(parsed) !== "https:" || URLUsername(parsed) !== ""
    || URLPassword(parsed) !== "" || URLSearch(parsed) !== "" || URLHash(parsed) !== "") {
    fail(`${code}_INVALID`);
  }
  return value;
}

function transparencyLogBaseUrl(value, code) {
  if (typeof value !== "string" || value.length < 1 || value.length > 2048
    || StringIncludes(value, "?") || StringIncludes(value, "#")) fail(`${code}_INVALID`);
  if (StringIncludes(value, "://")) {
    httpsUrl(value, code);
    return { value, keyName: StringSlice(value, "https://".length), isHttps: true };
  }
  let parsed;
  try { parsed = new URLConstructor(`https://${value}`); } catch { fail(`${code}_INVALID`); }
  if (URLProtocol(parsed) !== "https:" || URLUsername(parsed) !== ""
    || URLPassword(parsed) !== "" || URLSearch(parsed) !== "" || URLHash(parsed) !== ""
    || StringSlice(value, 0, 1) === "/") {
    fail(`${code}_INVALID`);
  }
  return { value, keyName: value, isHttps: false };
}

function safeTargetPath(value, code) {
  if (typeof value !== "string" || !regexTest(TUF_TARGET_PATH, value)
    || StringIncludes(value, "\\") || StringIncludes(value, "//")
    || StringEndsWith(value, "/") || regexTest(ENCODED_DOT_OR_SEPARATOR, value)) {
    fail(`${code}_INVALID`);
  }
  let segmentStart = 0;
  for (let index = 0; index <= value.length; index += 1) {
    if (index !== value.length && StringCharAt(value, index) !== "/") continue;
    const segment = StringSlice(value, segmentStart, index);
    if (segment === "." || segment === "..") fail(`${code}_INVALID`);
    segmentStart = index + 1;
  }
  return value;
}

function unicodeScalarString(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = StringCharCodeAt(value, index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      if (index + 1 >= value.length) return false;
      const next = StringCharCodeAt(value, index + 1);
      if (next < 0xdc00 || next > 0xdfff) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) return false;
  }
  return true;
}

/* Python's string ordering (used by securesystemslib) compares Unicode code
   points.  JavaScript's default Array#sort compares UTF-16 code units, which
   differs for some BMP/non-BMP key pairs, so use an explicit scalar comparator. */
function compareUnicodeScalarStrings(left, right) {
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    const leftPoint = StringCodePointAt(left, leftIndex);
    const rightPoint = StringCodePointAt(right, rightIndex);
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
    leftIndex += leftPoint > 0xffff ? 2 : 1;
    rightIndex += rightPoint > 0xffff ? 2 : 1;
  }
  if (leftIndex === left.length && rightIndex === right.length) return 0;
  return leftIndex === left.length ? -1 : 1;
}

/* TUF's JSON POUF uses the OLPC canonical JSON dialect: Unicode-scalar sorted
   object names, integers only, no whitespace, and only quote/backslash string
   escapes. LF, CR, other controls, U+2028/U+2029, and valid non-BMP scalars are
   therefore emitted literally into the UTF-8 signature input. Lone surrogates
   fail closed. This deliberately differs from Outsider's general JSON
   serializer for strings such as PEM text. Input is bounded,
   duplicate-name-rejected JSON.parse output. */
function tufCanonicalize(value, budget, depth = 0) {
  if (depth > MAX_JSON_DEPTH) fail("TUF_CANONICAL_DEPTH_INVALID");
  if (value === null) {
    consumeOperation(budget, "tufCanonicalWork", 4, MAX_TUF_CANONICAL_WORK,
      "TUF_CANONICAL_WORK");
    return "null";
  }
  if (value === true) {
    consumeOperation(budget, "tufCanonicalWork", 4, MAX_TUF_CANONICAL_WORK,
      "TUF_CANONICAL_WORK");
    return "true";
  }
  if (value === false) {
    consumeOperation(budget, "tufCanonicalWork", 5, MAX_TUF_CANONICAL_WORK,
      "TUF_CANONICAL_WORK");
    return "false";
  }
  if (typeof value === "string") {
    consumeOperation(budget, "tufCanonicalWork", value.length + 2,
      MAX_TUF_CANONICAL_WORK, "TUF_CANONICAL_WORK");
    if (!unicodeScalarString(value)) fail("TUF_CANONICAL_STRING_INVALID");
    let extraEscapes = 0;
    for (let index = 0; index < value.length; index += 1) {
      const character = StringCharAt(value, index);
      if (character === "\\" || character === "\"") extraEscapes += 1;
    }
    consumeOperation(budget, "tufCanonicalWork", extraEscapes,
      MAX_TUF_CANONICAL_WORK, "TUF_CANONICAL_WORK");
    let encoded = "\"";
    for (let index = 0; index < value.length; index += 1) {
      const character = StringCharAt(value, index);
      encoded += character === "\\" ? "\\\\" : character === "\"" ? "\\\"" : character;
    }
    return `${encoded}\"`;
  }
  if (typeof value === "number") {
    if (!NumberIsSafeInteger(value)) fail("TUF_CANONICAL_NUMBER_INVALID");
    const encoded = StringConstructor(value);
    consumeOperation(budget, "tufCanonicalWork", encoded.length,
      MAX_TUF_CANONICAL_WORK, "TUF_CANONICAL_WORK");
    return encoded;
  }
  if (ArrayIsArray(value)) {
    if (ObjectGetPrototypeOf(value) !== ArrayPrototype) fail("TUF_CANONICAL_ARRAY_INVALID");
    const lengthDescriptor = ObjectGetOwnPropertyDescriptor(value, "length");
    if (!lengthDescriptor || !NumberIsSafeInteger(lengthDescriptor.value)
      || lengthDescriptor.value < 0
      || lengthDescriptor.value > MAX_JSON_MEMBERS) fail("TUF_CANONICAL_ARRAY_INVALID");
    consumeOperation(budget, "tufCanonicalWork", lengthDescriptor.value + 2,
      MAX_TUF_CANONICAL_WORK, "TUF_CANONICAL_WORK");
    const encoded = new ArrayConstructor(lengthDescriptor.value);
    let outputLength = 2 + (lengthDescriptor.value > 0 ? lengthDescriptor.value - 1 : 0);
    for (let index = 0; index < lengthDescriptor.value; index += 1) {
      const descriptor = ObjectGetOwnPropertyDescriptor(value, StringConstructor(index));
      if (!descriptor || !ObjectHasOwn(descriptor, "value")) {
        fail("TUF_CANONICAL_ARRAY_INVALID");
      }
      const item = tufCanonicalize(descriptor.value, budget, depth + 1);
      outputLength += item.length;
      if (!NumberIsSafeInteger(outputLength)) fail("TUF_CANONICAL_WORK_BUDGET_EXCEEDED");
      defineOwnData(encoded, StringConstructor(index), item);
    }
    consumeOperation(budget, "tufCanonicalWork", outputLength,
      MAX_TUF_CANONICAL_WORK, "TUF_CANONICAL_WORK");
    return `[${ArrayJoin(encoded, ",")}]`;
  }
  if (value === null || typeof value !== "object" || isProxy(value)
    || ObjectGetPrototypeOf(value) !== ObjectPrototype) fail("TUF_CANONICAL_OBJECT_INVALID");
  const keys = ObjectKeys(value);
  if (keys.length > MAX_JSON_MEMBERS) fail("TUF_CANONICAL_OBJECT_INVALID");
  let keyCharacters = 0;
  for (let index = 0; index < keys.length; index += 1) {
    if (!unicodeScalarString(keys[index])) fail("TUF_CANONICAL_STRING_INVALID");
    keyCharacters += keys[index].length;
    if (!NumberIsSafeInteger(keyCharacters)) fail("TUF_CANONICAL_WORK_BUDGET_EXCEEDED");
  }
  let sortLevels = 1;
  let sortWidth = 1;
  while (sortWidth < keys.length) { sortWidth *= 2; sortLevels += 1; }
  consumeOperation(budget, "tufCanonicalWork",
    keyCharacters * sortLevels + keys.length + 2,
    MAX_TUF_CANONICAL_WORK, "TUF_CANONICAL_WORK");
  ArraySort(keys, compareUnicodeScalarStrings);
  const encoded = new ArrayConstructor(keys.length);
  let outputLength = 2 + (keys.length > 0 ? keys.length - 1 : 0);
  for (let index = 0; index < keys.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
    if (!descriptor || !ObjectHasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail("TUF_CANONICAL_OBJECT_INVALID");
    }
    const key = tufCanonicalize(keys[index], budget, depth + 1);
    const item = tufCanonicalize(descriptor.value, budget, depth + 1);
    const memberLength = key.length + 1 + item.length;
    consumeOperation(budget, "tufCanonicalWork", memberLength,
      MAX_TUF_CANONICAL_WORK, "TUF_CANONICAL_WORK");
    const member = `${key}:${item}`;
    outputLength += memberLength;
    if (!NumberIsSafeInteger(outputLength)) fail("TUF_CANONICAL_WORK_BUDGET_EXCEEDED");
    defineOwnData(encoded, StringConstructor(index), member);
  }
  consumeOperation(budget, "tufCanonicalWork", outputLength,
    MAX_TUF_CANONICAL_WORK, "TUF_CANONICAL_WORK");
  return `{${ArrayJoin(encoded, ",")}}`;
}

/* JSON.parse accepts duplicate object names.  TUF signatures authenticate a
   particular JSON object, so reject duplicate names before parsing rather than
   letting the runtime silently choose a final value. */
function rejectDuplicateJsonNames(text, code) {
  let offset = 0;
  let members = 0;
  const skip = () => {
    while (offset < text.length && regexTest(/[\x20\t\r\n]/u,
      StringCharAt(text, offset))) offset += 1;
  };
  const stringToken = () => {
    if (offset >= text.length || StringCharAt(text, offset) !== "\"") {
      fail(`${code}_JSON_INVALID`);
    }
    const start = offset;
    offset += 1;
    while (offset < text.length) {
      const char = StringCharAt(text, offset);
      if (char === "\"") {
        offset += 1;
        try { return JSONParse(StringSlice(text, start, offset)); }
        catch { fail(`${code}_JSON_INVALID`); }
      }
      if (char === "\\") {
        offset += 1;
        if (offset >= text.length) fail(`${code}_JSON_INVALID`);
        if (StringCharAt(text, offset) === "u") {
          if (!regexTest(/^[a-fA-F0-9]{4}$/u,
            StringSlice(text, offset + 1, offset + 5))) {
            fail(`${code}_JSON_INVALID`);
          }
          offset += 5;
        } else {
          if (!regexTest(/["\\/bfnrt]/u, StringCharAt(text, offset))) {
            fail(`${code}_JSON_INVALID`);
          }
          offset += 1;
        }
      } else {
        if (StringCharCodeAt(text, offset) < 0x20) fail(`${code}_JSON_INVALID`);
        offset += 1;
      }
    }
    fail(`${code}_JSON_INVALID`);
  };
  const value = (depth) => {
    if (depth > MAX_JSON_DEPTH) fail(`${code}_JSON_DEPTH_INVALID`);
    skip();
    if (StringCharAt(text, offset) === "{") {
      offset += 1;
      skip();
      const names = new SetConstructor();
      if (StringCharAt(text, offset) === "}") { offset += 1; return; }
      for (;;) {
        skip();
        const name = stringToken();
        members += 1;
        if (members > MAX_JSON_MEMBERS || SetHas(names, name)) {
          fail(`${code}_JSON_DUPLICATE_OR_BUDGET_INVALID`);
        }
        SetAdd(names, name);
        skip();
        if (StringCharAt(text, offset) !== ":") fail(`${code}_JSON_INVALID`);
        offset += 1;
        value(depth + 1);
        skip();
        if (StringCharAt(text, offset) === "}") { offset += 1; return; }
        if (StringCharAt(text, offset) !== ",") fail(`${code}_JSON_INVALID`);
        offset += 1;
      }
    }
    if (StringCharAt(text, offset) === "[") {
      offset += 1;
      skip();
      if (StringCharAt(text, offset) === "]") { offset += 1; return; }
      for (;;) {
        members += 1;
        if (members > MAX_JSON_MEMBERS) fail(`${code}_JSON_BUDGET_INVALID`);
        value(depth + 1);
        skip();
        if (StringCharAt(text, offset) === "]") { offset += 1; return; }
        if (StringCharAt(text, offset) !== ",") fail(`${code}_JSON_INVALID`);
        offset += 1;
      }
    }
    if (StringCharAt(text, offset) === "\"") { stringToken(); return; }
    const start = offset;
    while (offset < text.length && !regexTest(/[\x20\t\r\n,\]}]/u,
      StringCharAt(text, offset))) {
      offset += 1;
    }
    if (offset === start) fail(`${code}_JSON_INVALID`);
    try { JSONParse(StringSlice(text, start, offset)); }
    catch { fail(`${code}_JSON_INVALID`); }
  };
  value(0);
  skip();
  if (offset !== text.length) fail(`${code}_JSON_TRAILING_INVALID`);
}

function parseJsonBytes(value, code) {
  const bytes = rawBytes(value, code);
  let text;
  try {
    text = TextDecoderDecode(new TextDecoderConstructor("utf-8", textDecoderOptions()), bytes);
  }
  catch { fail(`${code}_UTF8_INVALID`); }
  if (text.length === 0 || StringCharCodeAt(text, 0) === 0xfeff) {
    fail(`${code}_UTF8_INVALID`);
  }
  rejectDuplicateJsonNames(text, code);
  let parsed;
  try { parsed = JSONParse(text); } catch { fail(`${code}_JSON_INVALID`); }
  return { bytes, parsed };
}

function keyObject(value, code) {
  const key = fixedObject(value, ["keytype", "scheme", "keyval"], code);
  const keyval = fixedObject(key.keyval, ["public"], `${code}_KEYVAL`);
  const supported = (key.keytype === "ed25519" && key.scheme === "ed25519")
    || (key.keytype === "ecdsa" && key.scheme === "ecdsa-sha2-nistp256")
    || (key.keytype === "rsa" && key.scheme === "rsassa-pss-sha256");
  if (!supported || typeof keyval.public !== "string" || keyval.public.length > 32_768) {
    fail(`${code}_ALGORITHM_INVALID`);
  }
  return { keytype: key.keytype, scheme: key.scheme, keyval: { public: keyval.public } };
}

function publicKeyForTuf(key, code, budget) {
  let der;
  if (key.keytype === "ed25519") {
    if (!regexTest(HEX_64, key.keyval.public)) fail(`${code}_KEY_INVALID`);
    const prefix = BufferFrom("302a300506032b6570032100", "hex");
    const raw = BufferFrom(key.keyval.public, "hex");
    der = BufferAllocUnsafe(TypedArrayLength(prefix) + TypedArrayLength(raw));
    TypedArraySet(der, prefix, 0);
    TypedArraySet(der, raw, TypedArrayLength(prefix));
  } else {
    der = pemPublicKeyDer(key.keyval.public, `${code}_KEY`);
  }
  const profile = spkiProfile(der, key.keytype, "minimum2048", `${code}_KEY`);
  consumeOperation(budget, "publicKeyParseOperations", 1,
    MAX_PUBLIC_KEY_PARSE_OPERATIONS, "PUBLIC_KEY_PARSE_OPERATION");
  let publicKey;
  try { publicKey = createPublicKey(publicKeyImportOptions(der, "der", "spki")); }
  catch { fail(`${code}_KEY_INVALID`); }
  if (KeyAsymmetricKeyType(publicKey) !== profile.keyType) {
    fail(`${code}_ALGORITHM_KEY_MISMATCH`);
  }
  return { key: der, format: "der", type: "spki",
    signatureLength: profile.rsaBits === null ? null : (profile.rsaBits + 7) >>> 3 };
}

function verifyTufSignature(key, verificationMaterial, signedBytes, signatureHex, budget) {
  if (typeof signatureHex !== "string" || signatureHex.length > 32_768
    || !regexTest(HEX_SIGNATURE, signatureHex)) return false;
  if (verificationMaterial.signatureLength !== null
    && signatureHex.length !== verificationMaterial.signatureLength * 2) return false;
  consumeOperation(budget, "cryptoVerifyOperations", 1,
    MAX_CRYPTO_VERIFY_OPERATIONS, "CRYPTO_VERIFY_OPERATION");
  consumeOperation(budget, "verifiedMessageBytes", TypedArrayLength(signedBytes),
    MAX_VERIFIED_MESSAGE_BYTES, "VERIFIED_MESSAGE_BYTE");
  const signature = BufferFrom(signatureHex, "hex");
  try {
    if (key.keytype === "ed25519") {
      return cryptoVerify(null, signedBytes,
        verificationKeyOptions(verificationMaterial.key, verificationMaterial.format,
          verificationMaterial.type, undefined, undefined, undefined), signature);
    }
    if (key.keytype === "ecdsa") {
      return cryptoVerify("sha256", signedBytes,
        verificationKeyOptions(verificationMaterial.key, verificationMaterial.format,
          verificationMaterial.type, undefined, undefined, "der"), signature);
    }
    return cryptoVerify("sha256", signedBytes,
      verificationKeyOptions(verificationMaterial.key, verificationMaterial.format,
        verificationMaterial.type, RSA_PKCS1_PSS_PADDING,
        RSA_PSS_SALTLEN_DIGEST, undefined), signature);
  } catch { return false; }
}

function rootRole(value, keys, code) {
  const role = fixedObject(value, ["keyids", "threshold"], code);
  const keyids = fixedArray(role.keyids, MAX_TUF_KEYS, `${code}_KEYIDS`);
  if (!NumberIsSafeInteger(role.threshold) || role.threshold < 1
    || role.threshold > keyids.length) fail(`${code}_THRESHOLD_INVALID`);
  const seen = new SetConstructor();
  for (let index = 0; index < keyids.length; index += 1) {
    const keyid = keyids[index];
    if (typeof keyid !== "string" || !regexTest(HEX_64, keyid)
      || SetHas(seen, keyid) || !ObjectHasOwn(keys, keyid)) fail(`${code}_KEYID_INVALID`);
    SetAdd(seen, keyid);
  }
  return { keyids, threshold: role.threshold };
}

function signedEnvelope(parsed, expectedType, specVersion, code, budget) {
  const envelope = fixedObject(parsed, ["signatures", "signed"], code);
  const signaturesRaw = fixedArray(envelope.signatures, MAX_TUF_SIGNATURES,
    `${code}_SIGNATURES`);
  if (signaturesRaw.length < 1) fail(`${code}_SIGNATURES_EMPTY`);
  const signatureKeyIds = new SetConstructor();
  const signatures = new ArrayConstructor(signaturesRaw.length);
  for (let index = 0; index < signaturesRaw.length; index += 1) {
    const value = signaturesRaw[index];
    const signature = fixedObject(value, ["keyid", "sig"], `${code}_SIGNATURE`);
    if (typeof signature.keyid !== "string" || !regexTest(HEX_64, signature.keyid)
      || typeof signature.sig !== "string") fail(`${code}_SIGNATURE_INVALID`);
    if (SetHas(signatureKeyIds, signature.keyid)) fail(`${code}_SIGNATURE_KEYID_DUPLICATE`);
    SetAdd(signatureKeyIds, signature.keyid);
    defineOwnData(signatures, StringConstructor(index), signature);
  }
  const signed = envelope.signed;
  if (signed === null || typeof signed !== "object" || ArrayIsArray(signed)
    || isProxy(signed)) fail(`${code}_SIGNED_INVALID`);
  const base = fixedObject(signed,
    expectedType === "root"
      ? ["_type", "spec_version", "version", "expires", "consistent_snapshot", "keys", "roles"]
      : expectedType === "targets"
        ? ["_type", "spec_version", "version", "expires", "targets"]
        : ["_type", "spec_version", "version", "expires", "meta"],
    `${code}_SIGNED`);
  if (base._type !== expectedType || base.spec_version !== specVersion
    || !NumberIsSafeInteger(base.version) || base.version < 1) fail(`${code}_HEADER_INVALID`);
  rfc3339(base.expires, `${code}_EXPIRES`);
  return { signatures, signed: base,
    signedBytes: BufferFrom(tufCanonicalize(signed, budget), "utf8") };
}

function parseRoot(value, specVersion, code, budget) {
  const parsed = parseJsonBytes(value, code);
  const envelope = signedEnvelope(parsed.parsed, "root", specVersion, code, budget);
  if (typeof envelope.signed.consistent_snapshot !== "boolean") {
    fail(`${code}_CONSISTENT_SNAPSHOT_INVALID`);
  }
  const keysView = envelope.signed.keys;
  if (keysView === null || typeof keysView !== "object" || ArrayIsArray(keysView)
    || isProxy(keysView) || ObjectGetPrototypeOf(keysView) !== ObjectPrototype) {
    fail(`${code}_KEYS_INVALID`);
  }
  const keyids = ObjectKeys(keysView);
  if (keyids.length < 1 || keyids.length > MAX_TUF_KEYS) fail(`${code}_KEYS_INVALID`);
  const keys = ObjectCreate(null);
  const verificationKeys = ObjectCreate(null);
  for (let index = 0; index < keyids.length; index += 1) {
    const keyid = keyids[index];
    const descriptor = ObjectGetOwnPropertyDescriptor(keysView, keyid);
    if (!descriptor || !ObjectHasOwn(descriptor, "value") || descriptor.enumerable !== true
      || !regexTest(HEX_64, keyid)) fail(`${code}_KEY_INVALID`);
    const key = keyObject(descriptor.value, `${code}_KEY`);
    const keyIdHash = createHash("sha256");
    HashUpdate(keyIdHash, tufCanonicalize(descriptor.value, budget), "utf8");
    if (HashDigest(keyIdHash, "hex") !== keyid) fail(`${code}_KEYID_DERIVATION_INVALID`);
    const verificationKey = publicKeyForTuf(key, `${code}_KEY`, budget);
    defineOwnData(keys, keyid, key);
    defineOwnData(verificationKeys, keyid, verificationKey);
  }
  const rolesView = fixedObject(envelope.signed.roles,
    ["root", "snapshot", "targets", "timestamp"], `${code}_ROLES`);
  const roles = {
    root: rootRole(rolesView.root, keys, `${code}_ROOT_ROLE`),
    snapshot: rootRole(rolesView.snapshot, keys, `${code}_SNAPSHOT_ROLE`),
    targets: rootRole(rolesView.targets, keys, `${code}_TARGETS_ROLE`),
    timestamp: rootRole(rolesView.timestamp, keys, `${code}_TIMESTAMP_ROLE`),
  };
  return { ...parsed, ...envelope, keys, verificationKeys, roles };
}

function thresholdCount(envelope, root, roleName, code, budget) {
  const role = root.roles[roleName];
  const authorized = new SetConstructor();
  for (let index = 0; index < role.keyids.length; index += 1) {
    SetAdd(authorized, role.keyids[index]);
  }
  const counted = new SetConstructor();
  let count = 0;
  for (let index = 0; index < envelope.signatures.length; index += 1) {
    const signature = envelope.signatures[index];
    if (!SetHas(authorized, signature.keyid) || SetHas(counted, signature.keyid)) continue;
    if (verifyTufSignature(root.keys[signature.keyid], root.verificationKeys[signature.keyid],
      envelope.signedBytes, signature.sig, budget)) {
      SetAdd(counted, signature.keyid);
      count += 1;
      if (count >= role.threshold) break;
    }
  }
  if (count < role.threshold) fail(`${code}_THRESHOLD_NOT_MET`);
  return count;
}

function metadataDescription(value, code) {
  const view = fixedObject(value, ["version"], code);
  if (!NumberIsSafeInteger(view.version) || view.version < 1) {
    fail(`${code}_VERSION_INVALID`);
  }
  const lengthDescriptor = ObjectGetOwnPropertyDescriptor(value, "length");
  const hashesDescriptor = ObjectGetOwnPropertyDescriptor(value, "hashes");
  const hasLength = lengthDescriptor !== undefined;
  const hasHashes = hashesDescriptor !== undefined;
  let length = null;
  let hashes = null;
  if (hasLength) {
    if (!ObjectHasOwn(lengthDescriptor, "value") || lengthDescriptor.enumerable !== true
      || !NumberIsSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 1
      || lengthDescriptor.value > MAX_JSON_BYTES) fail(`${code}_NUMBER_INVALID`);
    length = lengthDescriptor.value;
  }
  if (hasHashes) {
    if (!ObjectHasOwn(hashesDescriptor, "value") || hashesDescriptor.enumerable !== true) {
      fail(`${code}_HASHES_FIELDS_INVALID`);
    }
    hashes = fixedObject(hashesDescriptor.value, ["sha256"], `${code}_HASHES`);
    const hashKeys = ObjectKeys(hashesDescriptor.value);
    if (hashKeys.length !== 1 || hashKeys[0] !== "sha256") {
      fail(`${code}_HASHES_ALGORITHMS_INVALID`);
    }
    if (typeof hashes.sha256 !== "string"
      || !regexTest(HEX_64, hashes.sha256)) fail(`${code}_HASH_INVALID`);
  }
  return { version: view.version, length, hashes };
}

function verifyDescription(description, bytes, expectedVersion, code) {
  if (description.version !== expectedVersion) fail(`${code}_VERSION_MISMATCH`);
  const lengthVerified = description.length !== null;
  const sha256Verified = description.hashes !== null;
  if (lengthVerified && description.length !== TypedArrayLength(bytes)) {
    fail(`${code}_LENGTH_MISMATCH`);
  }
  if (sha256Verified
    && `sha256:${description.hashes.sha256}` !== hashBytes(bytes)) {
    fail(`${code}_HASH_MISMATCH`);
  }
  return { lengthVerified, sha256Verified };
}

function metadataMap(value, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value) || ObjectGetPrototypeOf(value) !== ObjectPrototype) {
    fail(`${code}_INVALID`);
  }
  const keys = ObjectKeys(value);
  if (keys.length < 1 || keys.length > MAX_METADATA_ENTRIES) fail(`${code}_SIZE_INVALID`);
  const result = ObjectCreate(null);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
    if (!descriptor || !ObjectHasOwn(descriptor, "value") || descriptor.enumerable !== true
      || typeof key !== "string" || key.length > 255) fail(`${code}_ENTRY_INVALID`);
    defineOwnData(result, key, metadataDescription(descriptor.value, `${code}_ENTRY`));
  }
  return result;
}

function targetMap(value, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || isProxy(value) || ObjectGetPrototypeOf(value) !== ObjectPrototype) {
    fail(`${code}_INVALID`);
  }
  const paths = ObjectKeys(value);
  if (paths.length < 1 || paths.length > MAX_METADATA_ENTRIES) fail(`${code}_SIZE_INVALID`);
  const result = ObjectCreate(null);
  for (let index = 0; index < paths.length; index += 1) {
    const targetPath = safeTargetPath(paths[index], `${code}_PATH`);
    const descriptor = ObjectGetOwnPropertyDescriptor(value, targetPath);
    if (!descriptor || !ObjectHasOwn(descriptor, "value") || descriptor.enumerable !== true) {
      fail(`${code}_ENTRY_INVALID`);
    }
    const target = fixedObject(descriptor.value, ["length", "hashes"], `${code}_ENTRY`);
    if (!NumberIsSafeInteger(target.length) || target.length < 1
      || target.length > MAX_JSON_BYTES) fail(`${code}_LENGTH_INVALID`);
    const hashes = fixedObject(target.hashes, ["sha256"], `${code}_HASHES`);
    const hashKeys = ObjectKeys(target.hashes);
    if (hashKeys.length !== 1 || hashKeys[0] !== "sha256") {
      fail(`${code}_HASHES_ALGORITHMS_INVALID`);
    }
    if (typeof hashes.sha256 !== "string" || !regexTest(HEX_64, hashes.sha256)) {
      fail(`${code}_HASH_INVALID`);
    }
    defineOwnData(result, targetPath, { length: target.length, hashes });
  }
  return result;
}

function verifyTarget(target, bytes, code) {
  if (target.length !== TypedArrayLength(bytes)
    || `sha256:${target.hashes.sha256}` !== hashBytes(bytes)) fail(`${code}_MISMATCH`);
}

function publicSigstoreKey(value, code, budget) {
  const view = fixedObject(value, ["rawBytes", "keyDetails", "validFor"], code);
  const der = strictBase64(view.rawBytes, `${code}_RAW_BYTES`);
  if (view.keyDetails !== "PKIX_ED25519"
    && view.keyDetails !== "PKIX_ECDSA_P256_SHA_256"
    && view.keyDetails !== "PKIX_RSA_PKCS1V15_2048_SHA256") {
    fail(`${code}_DETAILS_INVALID`);
  }
  const algorithm = view.keyDetails === "PKIX_ED25519" ? "ed25519"
    : view.keyDetails === "PKIX_ECDSA_P256_SHA_256" ? "ecdsa" : "rsa";
  const profile = spkiProfile(der, algorithm, "exact2048", code);
  consumeOperation(budget, "publicKeyParseOperations", 1,
    MAX_PUBLIC_KEY_PARSE_OPERATIONS, "PUBLIC_KEY_PARSE_OPERATION");
  let key;
  try { key = createPublicKey(publicKeyImportOptions(der, "der", "spki")); }
  catch { fail(`${code}_DER_INVALID`); }
  if (KeyAsymmetricKeyType(key) !== profile.keyType) {
    fail(`${code}_DETAILS_KEY_MISMATCH`);
  }
  return { rawBytes: view.rawBytes, keyDetails: view.keyDetails,
    validFor: view.validFor, der };
}

function checkpointKeyIdDigest(origin, keyDetails, der) {
  const hash = createHash("sha256");
  if (keyDetails === "PKIX_ED25519") {
    if (TypedArrayLength(der) !== 44
      || bytesToHex(copyByteRange(der, 0, 12, "TRUSTED_ROOT_ED25519_SPKI_PREFIX"))
        !== "302a300506032b6570032100") {
      fail("TRUSTED_ROOT_ED25519_SPKI_INVALID");
    }
    HashUpdate(hash, origin, "utf8");
    HashUpdate(hash, "\n", "utf8");
    HashUpdate(hash, BufferFrom("01", "hex"));
    HashUpdate(hash, copyByteRange(der, 12, TypedArrayLength(der),
      "TRUSTED_ROOT_ED25519_RAW_KEY"));
    return HashDigest(hash);
  }
  if (keyDetails === "PKIX_ECDSA_P256_SHA_256") {
    HashUpdate(hash, der);
    return HashDigest(hash);
  }
  HashUpdate(hash, origin, "utf8");
  HashUpdate(hash, "\n", "utf8");
  HashUpdate(hash, BufferFrom("ff", "hex"));
  HashUpdate(hash, "PKIX-RSA-PKCS#1v1.5", "utf8");
  HashUpdate(hash, der);
  return HashDigest(hash);
}

function validateCertificateAuthorities(value, code, budget) {
  const authorities = fixedArray(value, MAX_CERTIFICATE_AUTHORITIES, code);
  for (let index = 0; index < authorities.length; index += 1) {
    const authority = fixedObject(authorities[index],
      ["subject", "uri", "certChain", "validFor", "operator"], `${code}_AUTHORITY`);
    const subject = fixedObject(authority.subject, ["organization", "commonName"],
      `${code}_SUBJECT`);
    if (typeof subject.organization !== "string" || subject.organization.length < 1
      || subject.organization.length > 512 || typeof subject.commonName !== "string"
      || subject.commonName.length < 1 || subject.commonName.length > 512) {
      fail(`${code}_SUBJECT_INVALID`);
    }
    httpsUrl(authority.uri, `${code}_URI`);
    const chain = fixedObject(authority.certChain, ["certificates"], `${code}_CHAIN`);
    const certificates = fixedArray(chain.certificates, MAX_CERTIFICATE_CHAIN,
      `${code}_CERTIFICATES`);
    if (certificates.length < 1) fail(`${code}_CERTIFICATES_EMPTY`);
    for (let certIndex = 0; certIndex < certificates.length; certIndex += 1) {
      const certificate = fixedObject(certificates[certIndex], ["rawBytes"],
        `${code}_CERTIFICATE`);
      const der = strictBase64(certificate.rawBytes, `${code}_CERTIFICATE_BYTES`);
      consumeOperation(budget, "x509ParseOperations", 1,
        MAX_X509_PARSE_OPERATIONS, "X509_PARSE_OPERATION");
      consumeOperation(budget, "x509DerBytes", TypedArrayLength(der),
        MAX_X509_DER_BYTES, "X509_DER_BYTE");
      try { new X509Certificate(der); } catch { fail(`${code}_CERTIFICATE_DER_INVALID`); }
    }
    activeAt(authority.validFor, "1970-01-01T00:00:00Z", `${code}_VALID_FOR`);
    if (typeof authority.operator !== "string" || !regexTest(OPERATOR, authority.operator)) {
      fail(`${code}_OPERATOR_INVALID`);
    }
  }
  return authorities.length;
}

function validateTransparencyLogs(value, code, time, budget, selectionPolicy = null) {
  const logs = fixedArray(value, MAX_TLOGS, code);
  if (selectionPolicy !== null && logs.length < 1) fail(`${code}_EMPTY`);
  let selected = null;
  for (let index = 0; index < logs.length; index += 1) {
    const entry = fixedObject(logs[index], ["baseUrl", "hashAlgorithm", "publicKey",
      "logId", "operator"], `${code}_LOG`);
    const base = transparencyLogBaseUrl(entry.baseUrl, `${code}_BASE_URL`);
    const baseUrl = base.value;
    if (entry.hashAlgorithm !== "SHA2_256" || typeof entry.operator !== "string"
      || !regexTest(OPERATOR, entry.operator)) fail(`${code}_FIELDS_INVALID`);
    const publicKey = publicSigstoreKey(entry.publicKey, `${code}_KEY`, budget);
    const isActive = activeAt(publicKey.validFor, time, `${code}_VALID_FOR`);
    const logId = fixedObject(entry.logId, ["keyId"], `${code}_LOG_ID`);
    const checkpointDescriptor = ObjectGetOwnPropertyDescriptor(logs[index],
      "checkpointKeyId");
    let checkpointId = null;
    if (checkpointDescriptor !== undefined) {
      if (!ObjectHasOwn(checkpointDescriptor, "value")
        || checkpointDescriptor.enumerable !== true) fail(`${code}_CHECKPOINT_ID_FIELDS_INVALID`);
      checkpointId = fixedObject(checkpointDescriptor.value, ["keyId"],
        `${code}_CHECKPOINT_ID`);
    }
    const logIdBytes = strictBase64(logId.keyId, `${code}_LOG_ID_BYTES`, 32);
    const checkpointIdBytes = checkpointId === null ? null
      : strictBase64(checkpointId.keyId, `${code}_CHECKPOINT_ID_BYTES`, 4);
    const logIdHash = createHash("sha256");
    HashUpdate(logIdHash, publicKey.der);
    const derivedLogId = HashDigest(logIdHash);
    const derivedCheckpointDigest = checkpointKeyIdDigest(
      base.keyName, publicKey.keyDetails, publicKey.der);
    const derivedLogIdBase64 = bytesToBase64(derivedLogId);
    const derivedCheckpointIdBase64 = bytesToBase64(
      copyByteRange(derivedCheckpointDigest, 0, 4, `${code}_CHECKPOINT_HINT`));
    if (bytesToBase64(logIdBytes) !== derivedLogIdBase64
      || (checkpointIdBytes !== null
        && bytesToBase64(checkpointIdBytes) !== derivedCheckpointIdBase64)) {
      fail(`${code}_ID_INVALID`);
    }
    const pinnedTuple = selectionPolicy !== null
      && base.isHttps && baseUrl === selectionPolicy.rekor.endpointOrigin
      && entry.operator === selectionPolicy.rekor.operator
      && derivedLogIdBase64 === selectionPolicy.rekor.logIdBase64 && isActive;
    if (pinnedTuple && checkpointIdBytes === null) {
      fail(`${code}_PINNED_LOG_CHECKPOINT_ID_REQUIRED`);
    }
    if (pinnedTuple
      && derivedCheckpointIdBase64 === selectionPolicy.rekor.checkpointKeyIdBase64
      && checkpointIdBytes !== null) {
      if (selected !== null) fail(`${code}_AMBIGUOUS`);
      selected = { baseUrl, operator: entry.operator, logIdBase64: derivedLogIdBase64,
        checkpointKeyIdBase64: derivedCheckpointIdBase64,
        publicKeyHash: hashBytes(publicKey.der), keyDetails: publicKey.keyDetails };
    }
  }
  if (selectionPolicy !== null && selected === null) fail(`${code}_PINNED_LOG_NOT_FOUND`);
  return selected;
}

function trustedRootV02(parsed, policy, time, budget) {
  const root = fixedObject(parsed,
    ["mediaType", "tlogs", "certificateAuthorities", "ctlogs", "timestampAuthorities"],
    "TRUSTED_ROOT");
  if (root.mediaType !== "application/vnd.dev.sigstore.trustedroot.v0.2+json") {
    fail("TRUSTED_ROOT_MEDIA_TYPE_INVALID");
  }
  validateCertificateAuthorities(root.certificateAuthorities, "TRUSTED_ROOT_CAS", budget);
  validateTransparencyLogs(root.ctlogs, "TRUSTED_ROOT_CTLOGS", time, budget);
  validateCertificateAuthorities(root.timestampAuthorities, "TRUSTED_ROOT_TSAS", budget);
  return validateTransparencyLogs(root.tlogs, "TRUSTED_ROOT_TLOGS", time, budget, policy);
}

function service(value, time, code) {
  const item = fixedObject(value, ["url", "majorApiVersion", "validFor", "operator"], code);
  if (typeof item.url !== "string" || item.url.length > 2048
    || !NumberIsSafeInteger(item.majorApiVersion) || item.majorApiVersion < 0
    || typeof item.operator !== "string" || !regexTest(OPERATOR, item.operator)) {
    fail(`${code}_FIELDS_INVALID`);
  }
  let parsed;
  try { parsed = new URLConstructor(item.url); } catch { fail(`${code}_URL_INVALID`); }
  if (URLProtocol(parsed) !== "https:" || URLUsername(parsed) !== ""
    || URLPassword(parsed) !== "" || URLSearch(parsed) !== "" || URLHash(parsed) !== "") {
    fail(`${code}_URL_INVALID`);
  }
  return { url: item.url, majorApiVersion: item.majorApiVersion,
    operator: item.operator, active: activeAt(item.validFor, time, `${code}_VALID_FOR`),
    start: item.validFor.start };
}

function serviceConfiguration(value, serviceCount, code) {
  const view = fixedObject(value, ["selector"], code);
  const countDescriptor = ObjectGetOwnPropertyDescriptor(value, "count");
  let count = null;
  if (countDescriptor !== undefined) {
    if (!ObjectHasOwn(countDescriptor, "value") || countDescriptor.enumerable !== true) {
      fail(`${code}_COUNT_FIELDS_INVALID`);
    }
    count = countDescriptor.value;
  }
  if (view.selector !== "ANY" && view.selector !== "ALL" && view.selector !== "EXACT") {
    fail(`${code}_SELECTOR_INVALID`);
  }
  if (view.selector === "EXACT") {
    if (count === null || !NumberIsSafeInteger(count)
      || count < 1 || count > serviceCount) fail(`${code}_COUNT_INVALID`);
  } else if (count !== null) fail(`${code}_COUNT_INVALID`);
  return { selector: view.selector, count };
}

function signingConfigV02(parsed, policy, time) {
  const config = fixedObject(parsed, ["mediaType", "caUrls", "oidcUrls", "rekorTlogUrls",
    "rekorTlogConfig", "tsaUrls", "tsaConfig"], "SIGNING_CONFIG");
  if (config.mediaType !== "application/vnd.dev.sigstore.signingconfig.v0.2+json") {
    fail("SIGNING_CONFIG_MEDIA_TYPE_INVALID");
  }
  const serviceGroups = [["CA", config.caUrls], ["OIDC", config.oidcUrls],
    ["TSA", config.tsaUrls]];
  let tsaServiceCount = 0;
  for (let groupIndex = 0; groupIndex < serviceGroups.length; groupIndex += 1) {
    const name = serviceGroups[groupIndex][0];
    const value = serviceGroups[groupIndex][1];
    const items = fixedArray(value, MAX_SERVICES, `SIGNING_CONFIG_${name}_URLS`);
    if (name === "TSA") tsaServiceCount = items.length;
    for (let index = 0; index < items.length; index += 1) {
      service(items[index], time, `SIGNING_CONFIG_${name}_SERVICE`);
    }
  }
  const rawServices = fixedArray(config.rekorTlogUrls, MAX_SERVICES,
    "SIGNING_CONFIG_REKOR_URLS");
  if (rawServices.length < 1) fail("SIGNING_CONFIG_REKOR_URLS_EMPTY");
  const services = new ArrayConstructor(rawServices.length);
  for (let index = 0; index < rawServices.length; index += 1) {
    defineOwnData(services, StringConstructor(index),
      service(rawServices[index], time, "SIGNING_CONFIG_REKOR_SERVICE"));
  }
  const selector = serviceConfiguration(config.rekorTlogConfig, services.length,
    "SIGNING_CONFIG_REKOR_CONFIG");
  serviceConfiguration(config.tsaConfig, tsaServiceCount,
    "SIGNING_CONFIG_TSA_CONFIG");
  const active = [];
  let highestApi = -1;
  for (let index = 0; index < services.length; index += 1) {
    const item = services[index];
    if (!item.active || item.majorApiVersion > 2) continue;
    pushOwn(active, item);
    if (item.majorApiVersion > highestApi) highestApi = item.majorApiVersion;
  }
  if (active.length < 1) fail("SIGNING_CONFIG_NO_COMPATIBLE_REKOR_SERVICE");
  if (highestApi !== 2) fail("SIGNING_CONFIG_REKOR_V2_NOT_HIGHEST_AVAILABLE");
  const perOperator = ObjectCreate(null);
  const operatorOrder = [];
  for (let index = 0; index < active.length; index += 1) {
    const item = active[index];
    if (item.majorApiVersion !== highestApi) continue;
    const previous = perOperator[item.operator];
    if (!previous || DateParse(item.start) > DateParse(previous.start)) {
      if (!previous) pushOwn(operatorOrder, item.operator);
      defineOwnData(perOperator, item.operator, item);
    } else if (DateParse(item.start) === DateParse(previous.start)
      && item.url !== previous.url) fail("SIGNING_CONFIG_OPERATOR_SERVICE_AMBIGUOUS");
  }
  let pinnedCount = 0;
  for (let index = 0; index < operatorOrder.length; index += 1) {
    const item = perOperator[operatorOrder[index]];
    if (item.url === policy.rekor.endpointOrigin && item.operator === policy.rekor.operator
      && item.majorApiVersion === 2) pinnedCount += 1;
  }
  if (pinnedCount !== 1) fail("SIGNING_CONFIG_PINNED_REKOR_NOT_ELIGIBLE");
  const requiredCount = selector.selector === "ANY" ? 1
    : selector.selector === "ALL" ? operatorOrder.length : selector.count;
  if (operatorOrder.length < requiredCount) fail("SIGNING_CONFIG_REKOR_SELECTOR_UNSATISFIED");
  return { selector: selector.selector, requiredCount,
    eligibleDistinctOperatorCount: operatorOrder.length, pinnedProviderEligible: true };
}

function witnessPolicyBody(input, budget) {
  const view = fixedObject(input, ["providerOrigin", "providerOperator", "quorum",
    "witnesses"], "WITNESS_POLICY_INPUT");
  const providerOrigin = httpsOrigin(view.providerOrigin, "WITNESS_POLICY_PROVIDER_ORIGIN");
  if (typeof view.providerOperator !== "string" || !regexTest(OPERATOR,
    view.providerOperator)) {
    fail("WITNESS_POLICY_PROVIDER_OPERATOR_INVALID");
  }
  const rawWitnesses = fixedArray(view.witnesses, MAX_WITNESSES, "WITNESS_POLICY_WITNESSES");
  if (!NumberIsSafeInteger(view.quorum) || view.quorum < 1
    || view.quorum > rawWitnesses.length) fail("WITNESS_POLICY_QUORUM_INVALID");
  const names = new SetConstructor();
  const operators = new SetConstructor();
  const keys = new SetConstructor();
  const witnesses = new ArrayConstructor(rawWitnesses.length);
  for (let index = 0; index < rawWitnesses.length; index += 1) {
    const value = rawWitnesses[index];
    const witness = fixedObject(value, ["name", "operator", "publicKey"],
      "WITNESS_POLICY_WITNESS");
    if (typeof witness.name !== "string" || !regexTest(WITNESS_NAME, witness.name)
      || typeof witness.operator !== "string" || !regexTest(OPERATOR, witness.operator)
      || witness.operator === view.providerOperator) fail("WITNESS_POLICY_WITNESS_INVALID");
    const key = fixedObject(witness.publicKey, ["keyDetails", "rawBytes"],
      "WITNESS_POLICY_WITNESS_KEY");
    const der = strictBase64(key.rawBytes, "WITNESS_POLICY_WITNESS_KEY_BYTES", 44);
    if (key.keyDetails !== "PKIX_ED25519") fail("WITNESS_POLICY_WITNESS_KEY_DETAILS_INVALID");
    if (TypedArrayLength(der) !== 44
      || bytesToHex(copyByteRange(der, 0, 12, "WITNESS_POLICY_ED25519_SPKI_PREFIX"))
        !== "302a300506032b6570032100") {
      fail("WITNESS_POLICY_WITNESS_KEY_DER_INVALID");
    }
    consumeOperation(budget, "publicKeyParseOperations", 1,
      MAX_PUBLIC_KEY_PARSE_OPERATIONS, "PUBLIC_KEY_PARSE_OPERATION");
    try { createPublicKey(publicKeyImportOptions(der, "der", "spki")); }
    catch { fail("WITNESS_POLICY_WITNESS_KEY_DER_INVALID"); }
    const keyHash = hashBytes(der);
    if (SetHas(names, witness.name) || SetHas(operators, witness.operator)
      || SetHas(keys, keyHash)) fail("WITNESS_POLICY_DUPLICATE_INDEPENDENCE_LABEL_INVALID");
    SetAdd(names, witness.name); SetAdd(operators, witness.operator); SetAdd(keys, keyHash);
    defineOwnData(witnesses, StringConstructor(index),
      { name: witness.name, operator: witness.operator,
        publicKey: { keyDetails: key.keyDetails, rawBytes: key.rawBytes, keyHash } });
  }
  return {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_SCHEMAS.witnessPolicy,
    policyClass:
      "LOCAL_VERSIONED_REKOR_CHECKPOINT_WITNESS_KEY_POLICY_NOT_SIGSTORE_SCHEMA_OR_PROVENANCE",
    providerOrigin,
    providerOperator: view.providerOperator,
    endpointPath: "/api/v2/log/entries",
    quorum: view.quorum,
    witnessCount: witnesses.length,
    witnesses,
    distinctWitnessNamesRequired: true,
    distinctWitnessOperatorLabelsRequired: true,
    distinctWitnessKeysRequired: true,
    operatorLabelsAreOperationalIndependenceEvidence: false,
    sigstoreSchema: false,
    sigstoreTufTarget: false,
    sourceProvenanceEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
  };
}

function buildWitnessPolicy(input, budget) {
  const body = witnessPolicyBody(input, budget);
  return deepFreeze({ ...body, policyHash: digest("rekor-witness-key-policy", body) });
}

export function createEpisodeAttemptSetExternalWitnessKeyPolicyV3(input = {}) {
  return buildWitnessPolicy(input, newOperationBudget());
}

function normalizeWitnessPolicy(value, expectedHash, budget) {
  const top = fixedObject(value, ["schema", "policyClass", "providerOrigin",
    "providerOperator", "endpointPath", "quorum", "witnessCount", "witnesses",
    "distinctWitnessNamesRequired", "distinctWitnessOperatorLabelsRequired",
    "distinctWitnessKeysRequired", "operatorLabelsAreOperationalIndependenceEvidence",
    "sigstoreSchema", "sigstoreTufTarget", "sourceProvenanceEstablished",
    "decisionState", "authority", "policyHash"], "WITNESS_POLICY");
  const replayWitnesses = fixedArray(top.witnesses, MAX_WITNESSES,
    "WITNESS_POLICY_WITNESSES");
  const witnesses = new ArrayConstructor(replayWitnesses.length);
  for (let index = 0; index < replayWitnesses.length; index += 1) {
    const witness = fixedObject(replayWitnesses[index], ["name", "operator", "publicKey"],
      "WITNESS_POLICY_WITNESS");
    const key = fixedObject(witness.publicKey, ["keyDetails", "rawBytes", "keyHash"],
      "WITNESS_POLICY_WITNESS_KEY");
    if (key.keyHash !== hashBytes(strictBase64(key.rawBytes,
      "WITNESS_POLICY_WITNESS_KEY_BYTES", 44))) fail("WITNESS_POLICY_KEY_HASH_INVALID");
    defineOwnData(witnesses, StringConstructor(index),
      { name: witness.name, operator: witness.operator,
        publicKey: { keyDetails: key.keyDetails, rawBytes: key.rawBytes } });
  }
  const rebuilt = buildWitnessPolicy({
    providerOrigin: top.providerOrigin,
    providerOperator: top.providerOperator,
    quorum: top.quorum,
    witnesses,
  }, budget);
  const projected = fixedProjection(value, rebuilt, "WITNESS_POLICY_REBUILT_VIEW");
  if (canonicalizeStrict(projected) !== canonicalizeStrict(rebuilt)
    || top.policyHash !== strictHash(expectedHash, "EXPECTED_WITNESS_POLICY_HASH")) {
    fail("WITNESS_POLICY_REPLAY_OR_PIN_INVALID");
  }
  return rebuilt;
}

function trustPolicyBody(input, budget) {
  const view = fixedObject(input, ["repositoryId", "tufSpecVersion", "updateStartTime",
    "bootstrapRootHash", "bootstrapRootVersion", "expectedFinalRootVersion",
    "expectedTimestampVersion", "expectedSnapshotVersion", "expectedTargetsVersion",
    "trustedRootTargetPath", "signingConfigTargetPath", "rekor", "witnessPolicy",
    "expectedWitnessPolicyHash"], "TRUST_MATERIAL_POLICY_INPUT");
  if (typeof view.repositoryId !== "string" || !regexTest(WITNESS_NAME, view.repositoryId)
    || typeof view.tufSpecVersion !== "string" || !regexTest(TUF_SPEC,
      view.tufSpecVersion)) {
    fail("TRUST_MATERIAL_POLICY_REPOSITORY_INVALID");
  }
  const updateStartTime = rfc3339(view.updateStartTime, "POLICY_UPDATE_START_TIME");
  const versions = [view.bootstrapRootVersion, view.expectedFinalRootVersion,
    view.expectedTimestampVersion, view.expectedSnapshotVersion, view.expectedTargetsVersion];
  for (let index = 0; index < versions.length; index += 1) {
    if (!NumberIsSafeInteger(versions[index]) || versions[index] < 1) {
      fail("TRUST_MATERIAL_POLICY_VERSION_INVALID");
    }
  }
  if (view.expectedFinalRootVersion < view.bootstrapRootVersion
    || view.expectedFinalRootVersion - view.bootstrapRootVersion > MAX_ROOT_ROTATIONS) {
    fail("TRUST_MATERIAL_POLICY_VERSION_INVALID");
  }
  const rekor = fixedObject(view.rekor, ["endpointOrigin", "operator", "logIdBase64",
    "checkpointKeyIdBase64"], "TRUST_MATERIAL_POLICY_REKOR");
  const endpointOrigin = httpsOrigin(rekor.endpointOrigin, "POLICY_REKOR_ENDPOINT_ORIGIN");
  if (typeof rekor.operator !== "string" || !regexTest(OPERATOR, rekor.operator)) {
    fail("POLICY_REKOR_OPERATOR_INVALID");
  }
  strictBase64(rekor.logIdBase64, "POLICY_REKOR_LOG_ID", 32);
  strictBase64(rekor.checkpointKeyIdBase64, "POLICY_REKOR_CHECKPOINT_KEY_ID", 4);
  const witnessPolicy = normalizeWitnessPolicy(view.witnessPolicy,
    view.expectedWitnessPolicyHash, budget);
  if (witnessPolicy.providerOrigin !== endpointOrigin
    || witnessPolicy.providerOperator !== rekor.operator) {
    fail("POLICY_REKOR_AND_WITNESS_MISMATCH");
  }
  return {
    schema: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_SCHEMAS.policy,
    policyClass:
      "EXACT_CALLER_PINNED_OFFLINE_SIGSTORE_TUF_AND_REKOR_V2_TRUST_MATERIAL_REPLAY_HOLD_ONLY",
    repositoryId: view.repositoryId,
    tuf: {
      specVersion: view.tufSpecVersion,
      updateStartTime,
      updateStartTimeIsExternalTimeEvidence: false,
      bootstrapRootHash: strictHash(view.bootstrapRootHash, "BOOTSTRAP_ROOT_HASH"),
      bootstrapRootVersion: view.bootstrapRootVersion,
      expectedFinalRootVersion: view.expectedFinalRootVersion,
      expectedTimestampVersion: view.expectedTimestampVersion,
      expectedSnapshotVersion: view.expectedSnapshotVersion,
      expectedTargetsVersion: view.expectedTargetsVersion,
      trustedRootTargetPath: safeTargetPath(view.trustedRootTargetPath,
        "TRUSTED_ROOT_TARGET_PATH"),
      signingConfigTargetPath: safeTargetPath(view.signingConfigTargetPath,
        "SIGNING_CONFIG_TARGET_PATH"),
      exactMetadataAndTargetBytesRequired: true,
      bootstrapSourceProvenanceEstablished: false,
    },
    rekor: {
      profile: "SIGSTORE_REKOR_V2_HASHEDREKORD_0.0.2",
      endpointOrigin,
      endpointPath: "/api/v2/log/entries",
      endpointUrl: `${endpointOrigin}/api/v2/log/entries`,
      method: "POST",
      redirectPolicy: "ERROR",
      apiMajorVersion: 2,
      operator: rekor.operator,
      trustedRootIdProfile:
        "LOCAL_CONFLICT_PROFILE_V0_2_LOG_ID_SHA256_SPKI_32_CHECKPOINT_SIGNED_NOTE_TRUNCATED_4",
      logIdBase64: rekor.logIdBase64,
      checkpointKeyIdBase64: rekor.checkpointKeyIdBase64,
    },
    schemas: {
      trustedRootMediaType: "application/vnd.dev.sigstore.trustedroot.v0.2+json",
      signingConfigMediaType: "application/vnd.dev.sigstore.signingconfig.v0.2+json",
      witnessPolicySchema:
        EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_SCHEMAS.witnessPolicy,
      witnessPolicyIsSigstoreSchema: false,
    },
    witnessPolicy,
    witnessPolicyHash: witnessPolicy.policyHash,
    callerPinsAreExternalProvenance: false,
    networkOrFilesystemIoImplemented: false,
    status: "PARTIAL",
    decisionState: "HOLD",
    authority: "NONE",
    boundary: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_BOUNDARY,
  };
}

function buildTrustMaterialPolicy(input, budget) {
  const body = trustPolicyBody(input, budget);
  return deepFreeze({ ...body, policyHash: digest("trust-material-policy", body) });
}

export function createEpisodeAttemptSetExternalWitnessTrustMaterialPolicyV3(input = {}) {
  return buildTrustMaterialPolicy(input, newOperationBudget());
}

function normalizeTrustPolicy(value, expectedHash, budget) {
  const top = fixedObject(value, ["schema", "policyClass", "repositoryId", "tuf", "rekor",
    "schemas", "witnessPolicy", "witnessPolicyHash", "callerPinsAreExternalProvenance",
    "networkOrFilesystemIoImplemented", "status", "decisionState", "authority", "boundary",
    "policyHash"], "TRUST_MATERIAL_POLICY");
  const tuf = fixedObject(top.tuf, ["specVersion", "updateStartTime",
    "updateStartTimeIsExternalTimeEvidence", "bootstrapRootHash", "bootstrapRootVersion",
    "expectedFinalRootVersion", "expectedTimestampVersion", "expectedSnapshotVersion",
    "expectedTargetsVersion", "trustedRootTargetPath", "signingConfigTargetPath",
    "exactMetadataAndTargetBytesRequired", "bootstrapSourceProvenanceEstablished"],
  "TRUST_MATERIAL_POLICY_TUF");
  const rekor = fixedObject(top.rekor, ["profile", "endpointOrigin", "endpointPath",
    "endpointUrl", "method", "redirectPolicy", "apiMajorVersion", "operator",
    "trustedRootIdProfile", "logIdBase64", "checkpointKeyIdBase64"],
  "TRUST_MATERIAL_POLICY_REKOR");
  fixedObject(top.schemas, ["trustedRootMediaType", "signingConfigMediaType",
    "witnessPolicySchema", "witnessPolicyIsSigstoreSchema"], "TRUST_MATERIAL_POLICY_SCHEMAS");
  const rebuilt = buildTrustMaterialPolicy({
    repositoryId: top.repositoryId,
    tufSpecVersion: tuf.specVersion,
    updateStartTime: tuf.updateStartTime,
    bootstrapRootHash: tuf.bootstrapRootHash,
    bootstrapRootVersion: tuf.bootstrapRootVersion,
    expectedFinalRootVersion: tuf.expectedFinalRootVersion,
    expectedTimestampVersion: tuf.expectedTimestampVersion,
    expectedSnapshotVersion: tuf.expectedSnapshotVersion,
    expectedTargetsVersion: tuf.expectedTargetsVersion,
    trustedRootTargetPath: tuf.trustedRootTargetPath,
    signingConfigTargetPath: tuf.signingConfigTargetPath,
    rekor: {
      endpointOrigin: rekor.endpointOrigin,
      operator: rekor.operator,
      logIdBase64: rekor.logIdBase64,
      checkpointKeyIdBase64: rekor.checkpointKeyIdBase64,
    },
    witnessPolicy: top.witnessPolicy,
    expectedWitnessPolicyHash: top.witnessPolicyHash,
  }, budget);
  const projected = fixedProjection(value, rebuilt, "TRUST_MATERIAL_POLICY_REBUILT_VIEW");
  if (canonicalizeStrict(projected) !== canonicalizeStrict(rebuilt)
    || top.policyHash !== strictHash(expectedHash, "EXPECTED_TRUST_MATERIAL_POLICY_HASH")) {
    fail("TRUST_MATERIAL_POLICY_REPLAY_OR_PIN_INVALID");
  }
  return rebuilt;
}

function falseFacts() {
  return {
    callerBootstrapAcceptedAsIndependentTrustAnchor: false,
    callerPinsAcceptedAsExternalProvenance: false,
    callerReplayTimeAcceptedAsExternalTime: false,
    officialSourceBytesEstablished: false,
    actualPublishedSigstoreTargetBytesReplayed: false,
    currentPublicSigningConfigSelectsRekorV2: false,
    rekorV2TrustRootIdSpecificationConflictAcknowledged: true,
    rekorV2TrustRootIdProfileInteroperabilityEstablished: false,
    independentlySourcedBootstrapEstablished: false,
    sourceProvenanceEstablished: false,
    transportProvenanceEstablished: false,
    sigstoreTufWitnessPolicyAvailable: false,
    witnessPolicyIsSigstoreSchema: false,
    witnessSignaturesVerified: false,
    witnessOperationalIndependenceEstablished: false,
    physicalCryptographicKeyIndependenceEstablished: false,
    genericTufKeyAlgorithmInteroperabilityEstablished: false,
    tufRollbackProtectionEstablished: false,
    tufLatestRootEstablished: false,
    tufPriorTrustedMetadataStateReplayed: false,
    publicProviderInteroperabilityObserved: false,
    publicProviderLiveArtifactEstablished: false,
    providerResponseEstablished: false,
    independentWitnessEstablished: false,
    crossCheckpointConsistencyVerified: false,
    splitViewExcluded: false,
    nonEquivocationEstablished: false,
    durableExternalHeadEstablished: false,
    externalAnchorEstablished: false,
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
  };
}

function failure(error) {
  let message = "EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_UNTRUSTED_FAILURE";
  try {
    if (error !== null && typeof error === "object" && !isProxy(error)
      && FunctionHasInstance(ErrorConstructor, error)) {
      const descriptor = ObjectGetOwnPropertyDescriptor(error, "message");
      if (descriptor && ObjectHasOwn(descriptor, "value")
        && typeof descriptor.value === "string" && descriptor.value.length <= 512
        && regexTest(TYPED_ERROR, descriptor.value)) {
        message = descriptor.value;
      }
    }
  } catch { /* fixed fallback */ }
  return deepFreeze({
    schema:
      EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_SCHEMAS.verification,
    ok: false,
    replayClass: "OFFLINE_TUF_TRUST_MATERIAL_REPLAY_FAILED_HOLD_ONLY",
    error: message,
    tufBootstrapSelfThresholdVerified: false,
    tufRootRotationOldAndNewThresholdsVerified: false,
    tufRootChainAuthenticatedByDualThresholds: false,
    tufRootRotationsVerified: 0,
    tufTimestampThresholdVerified: false,
    tufSnapshotThresholdVerified: false,
    tufTargetsThresholdVerified: false,
    tufMetadataVersionsAndExpiryReplayed: false,
    tufSnapshotBytesBoundByTimestampDescription: false,
    tufSnapshotLengthBoundByTimestampDescription: false,
    tufSnapshotSha256BoundByTimestampDescription: false,
    tufFinalRootBytesBoundBySnapshotDescription: false,
    tufTargetsBytesBoundBySnapshotDescription: false,
    tufTargetsLengthBoundBySnapshotDescription: false,
    tufTargetsSha256BoundBySnapshotDescription: false,
    tufUnknownSignedExtensionsIncludedInSignatureBytes: false,
    tufUnknownSignedExtensionsProjected: false,
    tufKeyIdDerivationVerified: false,
    tufThresholdCountsDistinctAuthorizedKeyIds: false,
    tufTargetLengthAndSha256Verified: false,
    sigstoreTufTrustedRootReplayVerified: false,
    sigstoreSigningConfigReplayVerified: false,
    exactRekorProviderEndpointVerified: false,
    exactRekorLogIdVerified: false,
    exactRekorCheckpointKeyVerified: false,
    witnessMOfNKeyPolicyReplayed: false,
    replayOperationBudgetEnforced: true,
    rawTrustMaterialProjected: false,
    verificationContainsStableMaterialHashes: false,
    verificationPublicationNetworkSafe: false,
    stableLinkagePrivateOnly: true,
    verificationPublicationAuthorized: false,
    networkOrFilesystemIoPerformed: false,
    ...falseFacts(),
    boundary: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_BOUNDARY,
  });
}

export function replayEpisodeAttemptSetExternalWitnessTrustMaterialV3(
  record, context = {}) {
  try {
    const budget = newOperationBudget();
    const input = fixedObject(record, ["policy", "bootstrapRootBytes", "rootRotationBytes",
      "timestampBytes", "snapshotBytes", "targetsBytes", "trustedRootBytes",
      "signingConfigBytes"], "REPLAY_RECORD");
    const pins = fixedObject(context, ["expectedPolicyHash"], "REPLAY_CONTEXT");
    const rawInput = aggregateRawInputBytes(input);
    const policy = normalizeTrustPolicy(input.policy, pins.expectedPolicyHash, budget);
    const bootstrap = parseRoot(input.bootstrapRootBytes, policy.tuf.specVersion,
      "BOOTSTRAP_ROOT", budget);
    if (hashBytes(bootstrap.bytes) !== policy.tuf.bootstrapRootHash
      || bootstrap.signed.version !== policy.tuf.bootstrapRootVersion) {
      fail("BOOTSTRAP_ROOT_PIN_OR_VERSION_MISMATCH");
    }
    const bootstrapThreshold = thresholdCount(bootstrap, bootstrap, "root",
      "BOOTSTRAP_ROOT_SELF_SIGNATURE", budget);
    let current = bootstrap;
    const rotations = rawInput.rotations;
    if (rotations.length !== policy.tuf.expectedFinalRootVersion
      - policy.tuf.bootstrapRootVersion) fail("ROOT_ROTATION_COUNT_MISMATCH");
    const rotationEvidence = [];
    for (let index = 0; index < rotations.length; index += 1) {
      const next = parseRoot(rotations[index], policy.tuf.specVersion, "ROTATED_ROOT", budget);
      if (next.signed.version !== current.signed.version + 1) {
        fail("ROOT_ROTATION_VERSION_NOT_SEQUENTIAL");
      }
      const oldThreshold = thresholdCount(next, current, "root",
        "ROOT_ROTATION_OLD_ROOT_SIGNATURE", budget);
      const newThreshold = thresholdCount(next, next, "root",
        "ROOT_ROTATION_NEW_ROOT_SIGNATURE", budget);
      pushOwn(rotationEvidence, { version: next.signed.version, rootHash: hashBytes(next.bytes),
        predecessorThresholdSignaturesVerified: oldThreshold,
        successorThresholdSignaturesVerified: newThreshold });
      current = next;
    }
    if (current.signed.version !== policy.tuf.expectedFinalRootVersion
      || DateParse(current.signed.expires) <= DateParse(policy.tuf.updateStartTime)) {
      fail("FINAL_ROOT_VERSION_OR_EXPIRY_INVALID");
    }
    const timestamp = parseJsonBytes(input.timestampBytes, "TIMESTAMP");
    const timestampEnvelope = signedEnvelope(timestamp.parsed, "timestamp",
      policy.tuf.specVersion, "TIMESTAMP", budget);
    const timestampThreshold = thresholdCount(timestampEnvelope, current, "timestamp",
      "TIMESTAMP_SIGNATURE", budget);
    if (timestampEnvelope.signed.version !== policy.tuf.expectedTimestampVersion
      || DateParse(timestampEnvelope.signed.expires) <= DateParse(policy.tuf.updateStartTime)) {
      fail("TIMESTAMP_VERSION_OR_EXPIRY_INVALID");
    }
    const timestampMeta = metadataMap(timestampEnvelope.signed.meta, "TIMESTAMP_META");
    if (!ObjectHasOwn(timestampMeta, "snapshot.json")
      || ObjectKeys(timestampMeta).length !== 1) fail("TIMESTAMP_SNAPSHOT_META_EXACT_INVALID");

    const snapshot = parseJsonBytes(input.snapshotBytes, "SNAPSHOT");
    const snapshotEnvelope = signedEnvelope(snapshot.parsed, "snapshot",
      policy.tuf.specVersion, "SNAPSHOT", budget);
    const snapshotDescriptionEvidence = verifyDescription(
      timestampMeta["snapshot.json"], snapshot.bytes,
      policy.tuf.expectedSnapshotVersion, "SNAPSHOT_DESCRIPTION");
    const snapshotThreshold = thresholdCount(snapshotEnvelope, current, "snapshot",
      "SNAPSHOT_SIGNATURE", budget);
    if (snapshotEnvelope.signed.version !== policy.tuf.expectedSnapshotVersion
      || DateParse(snapshotEnvelope.signed.expires) <= DateParse(policy.tuf.updateStartTime)) {
      fail("SNAPSHOT_VERSION_OR_EXPIRY_INVALID");
    }
    const snapshotMeta = metadataMap(snapshotEnvelope.signed.meta, "SNAPSHOT_META");
    if (!ObjectHasOwn(snapshotMeta, "targets.json")) fail("SNAPSHOT_TARGETS_META_MISSING");

    const targets = parseJsonBytes(input.targetsBytes, "TARGETS");
    const targetsEnvelope = signedEnvelope(targets.parsed, "targets",
      policy.tuf.specVersion, "TARGETS", budget);
    const targetsDescriptionEvidence = verifyDescription(
      snapshotMeta["targets.json"], targets.bytes,
      policy.tuf.expectedTargetsVersion, "TARGETS_DESCRIPTION");
    const targetsThreshold = thresholdCount(targetsEnvelope, current, "targets",
      "TARGETS_SIGNATURE", budget);
    if (targetsEnvelope.signed.version !== policy.tuf.expectedTargetsVersion
      || DateParse(targetsEnvelope.signed.expires) <= DateParse(policy.tuf.updateStartTime)) {
      fail("TARGETS_VERSION_OR_EXPIRY_INVALID");
    }
    const targetEntries = targetMap(targetsEnvelope.signed.targets, "TARGET_ENTRIES");
    if (!ObjectHasOwn(targetEntries, policy.tuf.trustedRootTargetPath)
      || !ObjectHasOwn(targetEntries, policy.tuf.signingConfigTargetPath)) {
      fail("SIGSTORE_TARGET_DESCRIPTION_MISSING");
    }
    const trustedRoot = parseJsonBytes(input.trustedRootBytes, "TRUSTED_ROOT_TARGET");
    const signingConfig = parseJsonBytes(input.signingConfigBytes, "SIGNING_CONFIG_TARGET");
    verifyTarget(targetEntries[policy.tuf.trustedRootTargetPath], trustedRoot.bytes,
      "TRUSTED_ROOT_TARGET");
    verifyTarget(targetEntries[policy.tuf.signingConfigTargetPath], signingConfig.bytes,
      "SIGNING_CONFIG_TARGET");
    const log = trustedRootV02(trustedRoot.parsed, policy,
      policy.tuf.updateStartTime, budget);
    const config = signingConfigV02(signingConfig.parsed, policy, policy.tuf.updateStartTime);
    const body = {
      schema:
        EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_SCHEMAS.verification,
      ok: true,
      replayClass:
        "CALLER_BOOTSTRAP_TUF_CHAIN_SIGSTORE_TARGET_AND_REKOR_POLICY_CRYPTO_REPLAY_HOLD_ONLY",
      totalRawInputBytes: rawInput.total,
      policyHash: policy.policyHash,
      repositoryId: policy.repositoryId,
      tufBootstrapRootHash: hashBytes(bootstrap.bytes),
      tufBootstrapRootVersion: bootstrap.signed.version,
      tufBootstrapSelfThresholdVerified: true,
      tufBootstrapSelfSignaturesVerified: bootstrapThreshold,
      tufRootRotationOldAndNewThresholdsVerified: true,
      tufRootChainAuthenticatedByDualThresholds: true,
      tufRootRotationsVerified: rotationEvidence.length,
      tufRootRotationEvidence: rotationEvidence,
      tufFinalRootHash: hashBytes(current.bytes),
      tufFinalRootVersion: current.signed.version,
      tufTimestampHash: hashBytes(timestamp.bytes),
      tufTimestampVersion: timestampEnvelope.signed.version,
      tufTimestampThresholdVerified: true,
      tufTimestampSignaturesVerified: timestampThreshold,
      tufSnapshotHash: hashBytes(snapshot.bytes),
      tufSnapshotVersion: snapshotEnvelope.signed.version,
      tufSnapshotThresholdVerified: true,
      tufSnapshotSignaturesVerified: snapshotThreshold,
      tufTargetsHash: hashBytes(targets.bytes),
      tufTargetsVersion: targetsEnvelope.signed.version,
      tufTargetsThresholdVerified: true,
      tufTargetsSignaturesVerified: targetsThreshold,
      tufMetadataVersionsAndExpiryReplayed: true,
      tufSnapshotBytesBoundByTimestampDescription:
        snapshotDescriptionEvidence.sha256Verified,
      tufSnapshotLengthBoundByTimestampDescription:
        snapshotDescriptionEvidence.lengthVerified,
      tufSnapshotSha256BoundByTimestampDescription:
        snapshotDescriptionEvidence.sha256Verified,
      tufFinalRootBytesBoundBySnapshotDescription: false,
      tufTargetsBytesBoundBySnapshotDescription:
        targetsDescriptionEvidence.sha256Verified,
      tufTargetsLengthBoundBySnapshotDescription:
        targetsDescriptionEvidence.lengthVerified,
      tufTargetsSha256BoundBySnapshotDescription:
        targetsDescriptionEvidence.sha256Verified,
      tufUnknownSignedExtensionsIncludedInSignatureBytes: true,
      tufUnknownSignedExtensionsProjected: false,
      tufKeyIdDerivationVerified: true,
      tufThresholdCountsDistinctAuthorizedKeyIds: true,
      tufTargetLengthAndSha256Verified: true,
      trustedRootTargetHash: hashBytes(trustedRoot.bytes),
      signingConfigTargetHash: hashBytes(signingConfig.bytes),
      sigstoreTufTrustedRootReplayVerified: true,
      sigstoreSigningConfigReplayVerified: true,
      exactRekorProviderEndpointVerified: true,
      exactRekorLogIdVerified: true,
      exactRekorCheckpointKeyVerified: true,
      rekor: {
        endpointOrigin: policy.rekor.endpointOrigin,
        endpointPath: policy.rekor.endpointPath,
        endpointUrl: policy.rekor.endpointUrl,
        method: policy.rekor.method,
        redirectPolicy: policy.rekor.redirectPolicy,
        operator: log.operator,
        trustedRootIdProfile: policy.rekor.trustedRootIdProfile,
        trustedRootIdSpecificationConflictAcknowledged: true,
        trustedRootIdProfileInteroperabilityEstablished: false,
        logIdBase64: log.logIdBase64,
        checkpointKeyIdBase64: log.checkpointKeyIdBase64,
        publicKeyHash: log.publicKeyHash,
        publicKeyDetails: log.keyDetails,
        signingConfigSelector: config.selector,
        signingConfigRequiredDistinctOperatorCount: config.requiredCount,
        signingConfigEligibleDistinctOperatorCount: config.eligibleDistinctOperatorCount,
      },
      witnessPolicyHash: policy.witnessPolicyHash,
      witnessMOfNKeyPolicyReplayed: true,
      witnessQuorum: policy.witnessPolicy.quorum,
      witnessKeyCount: policy.witnessPolicy.witnessCount,
      replayOperationBudgetEnforced: true,
      replayOperationUsage: {
        cryptoVerifyOperations: budget.cryptoVerifyOperations,
        verifiedMessageBytes: budget.verifiedMessageBytes,
        publicKeyParseOperations: budget.publicKeyParseOperations,
        x509ParseOperations: budget.x509ParseOperations,
        x509DerBytes: budget.x509DerBytes,
        tufCanonicalWork: budget.tufCanonicalWork,
      },
      rawTrustMaterialProjected: false,
      verificationContainsStableMaterialHashes: true,
      verificationPublicationNetworkSafe: false,
      stableLinkagePrivateOnly: true,
      verificationPublicationAuthorized: false,
      networkOrFilesystemIoPerformed: false,
      ...falseFacts(),
      boundary: EPISODE_ATTEMPT_SET_EXTERNAL_WITNESS_TRUST_MATERIAL_V3_BOUNDARY,
    };
    return deepFreeze({ ...body, verificationHash: digest("trust-material-verification", body) });
  } catch (error) {
    return failure(error);
  }
}
