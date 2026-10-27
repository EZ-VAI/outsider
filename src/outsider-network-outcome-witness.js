/*
 * Source-byte-replayed, externally pinned outcome-witness evidence.
 *
 * The witness is a second typed ActorIdentityEnvelope: an observation
 * deployment, not the action actor and not the transport signer.  Different
 * keys or subjects are only collision checks.  Scoped independence is accepted
 * only from a separately pinned relationship-registry issuer and still cannot
 * create outcome truth, causal attribution, authority, closure, CEU, training,
 * action, or economics.
 */

import {
  createHash, createPrivateKey, createPublicKey, generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyActorIdentityEnvelope } from "./outsider-actor-identity-envelope.js";
import { NETWORK_ACTION_OUTCOME_V2_OBSERVATION_STATUSES } from
  "./outsider-network-intake.js";

const ArrayConstructor = Array;
const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const ArraySort = Function.prototype.call.bind(Array.prototype.sort);
const ArrayBufferIsView = ArrayBuffer.isView;
const ArrayBufferPrototype = ArrayBuffer.prototype;
const BufferByteLength = Buffer.byteLength;
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferPrototype = Buffer.prototype;
const BufferToString = Function.prototype.call.bind(Buffer.prototype.toString);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const JSONParse = JSON.parse;
const MapConstructor = Map;
const MapGet = Function.prototype.call.bind(Map.prototype.get);
const MapHas = Function.prototype.call.bind(Map.prototype.has);
const MapSet = Function.prototype.call.bind(Map.prototype.set);
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
const ReflectOwnKeys = Reflect.ownKeys;
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetConstructor = Set;
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const TypeErrorConstructor = TypeError;
const TypedArrayPrototype = ObjectGetPrototypeOf(Uint8Array.prototype);
const TypedArrayBuffer = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(TypedArrayPrototype, "buffer").get);
const TypedArrayByteLength = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(TypedArrayPrototype, "byteLength").get);
const Uint8ArrayConstructor = Uint8Array;
const Uint8ArrayPrototype = Uint8Array.prototype;
const Uint8ArraySet = Function.prototype.call.bind(Uint8Array.prototype.set);
const IntrinsicProbePublicKey = generateKeyPairSync("ed25519").publicKey;
const IntrinsicPublicKeyPrototype = ObjectGetPrototypeOf(IntrinsicProbePublicKey);
const IntrinsicAsymmetricKeyPrototype = ObjectGetPrototypeOf(
  IntrinsicPublicKeyPrototype);
const KeyObjectAsymmetricKeyType = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(IntrinsicAsymmetricKeyPrototype,
    "asymmetricKeyType").get);
const KeyObjectExport = Function.prototype.call.bind(
  ObjectGetOwnPropertyDescriptor(IntrinsicPublicKeyPrototype, "export").value);
const CryptoHashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const CryptoHashUpdate = Function.prototype.call.bind(CryptoHashPrototype.update);
const CryptoHashDigest = Function.prototype.call.bind(CryptoHashPrototype.digest);

export const OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS = ObjectFreeze({
  sourceManifest: "outsider/outcome-witness-source-manifest/v1",
  adapterDescriptor: "outsider/outcome-witness-adapter-descriptor/v1",
  adapterOutput: "outsider/outcome-witness-adapter-output/v1",
  replayReceipt: "outsider/outcome-witness-source-replay-receipt/v1",
  relationshipReview: "outsider/outcome-witness-relationship-review/v1",
  trustPolicy: "outsider/outcome-witness-trust-policy/v1",
  envelope: "outsider/outcome-witness-envelope/v1",
  verification: "outsider/outcome-witness-verification/v1",
});

export const OUTSIDER_NETWORK_OUTCOME_WITNESS_SOURCE_CLASSES = ObjectFreeze([
  "AFFECTED_PARTY_DIRECT_REPORT",
  "CONFORMANCE_FIXTURE",
  "INDEPENDENT_ADJUDICATION",
  "INDEPENDENT_INSTRUMENT_READBACK",
  "RESOURCE_OWNER_READBACK",
]);

export const OUTSIDER_NETWORK_OUTCOME_WITNESS_ROLES = ObjectFreeze([
  "AFFECTED_PARTY_REPORTER",
  "CONFORMANCE_FIXTURE",
  "INDEPENDENT_ADJUDICATOR",
  "INDEPENDENT_INSTRUMENT_OPERATOR",
  "RESOURCE_OWNER_READBACK",
]);

export const OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES = ObjectFreeze([
  "ADJUDICATION_CONTROL",
  "COMMON_CONTROL",
  "COMMON_FUNDING",
  "COMMON_OPERATOR",
  "DATA_SOURCE_CONTROL",
  "INSTRUMENT_CONTROL",
]);

export const OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS = ObjectFreeze({
  JSON_OBSERVATION_V1: "OUTSIDER_BUILTIN_OUTCOME_OBSERVATION_JSON_V1",
});

export const OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY = deepFreeze({
  position: "CROSS_VENDOR_EVIDENCE_NETWORK_NOT_VENDOR_NATIVE_SAFETY_CONTROLLER",
  exactSourceBytesRequired: true,
  rawSourceBytesInNetworkProjection: false,
  adapterProjectionSpecificationAndSchemaPinned: true,
  adapterImplementationOrCodeClosureReplayed: false,
  callerSuppliedAdapterFunctionsAccepted: false,
  secondTypedActorIdentityRequired: true,
  transportSignerAcceptedAsWitness: false,
  distinctKeysAcceptedAsIndependence: false,
  externalRelationshipReviewRequired: true,
  relationshipReviewCreatorExportedByOutsider: false,
  vendorNativeSuccessAcceptedAsOutcomeTruth: false,
  rightsEstablishedByHashReference: false,
  privacyEstablishedByHashReference: false,
  organizationalIndependenceEstablished: false,
  independentOutcomeTruthEstablished: false,
  causalAttributionEstablished: false,
  obligationClosureEstablished: false,
  disposition: "QUARANTINED",
  status: "HOLD",
  authority: "NONE",
  actionReady: false,
  executable: false,
  automaticTraining: false,
  trainingRows: 0,
  causalExperienceUnits: 0,
  permitsPricing: false,
  permitsGuarantee: false,
  permitsSettlement: false,
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,191}$/u;
const CANONICAL_UTC
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/u;
const MAX_SOURCE_OBJECTS = 64;
const MAX_SOURCE_OBJECT_BYTES = 16 * 1024 * 1024;
const MAX_SOURCE_TOTAL_BYTES = 64 * 1024 * 1024;
const MAX_CORRELATION_ROOTS = 64;
const MAX_KEY_EPOCHS = 32;

const SOURCE_CLASS_ROLE = ObjectFreeze({
  AFFECTED_PARTY_DIRECT_REPORT: "AFFECTED_PARTY_REPORTER",
  CONFORMANCE_FIXTURE: "CONFORMANCE_FIXTURE",
  INDEPENDENT_ADJUDICATION: "INDEPENDENT_ADJUDICATOR",
  INDEPENDENT_INSTRUMENT_READBACK: "INDEPENDENT_INSTRUMENT_OPERATOR",
  RESOURCE_OWNER_READBACK: "RESOURCE_OWNER_READBACK",
});

const BYTE_VIEW_FORBIDDEN_OWN_OVERRIDES = ObjectFreeze([
  "buffer", "byteLength", "byteOffset", "length", "constructor", "toString",
  "valueOf", Symbol.iterator, Symbol.toPrimitive,
]);

function fail(code) {
  throw new TypeErrorConstructor(`OUTSIDER_NETWORK_OUTCOME_WITNESS_${code}`);
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

function rejectTree(value, seen = new SetConstructor(), depth = 0) {
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
    rejectTree(descriptor.value, seen, depth + 1);
  }
  SetDelete(seen, value);
}

function clone(value) {
  rejectTree(value);
  return deepFreeze(JSONParse(canonicalizeStrict(value)));
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || isProxy(value)
    || ArrayIsArray(value)) fail(`${code}_OBJECT_INVALID`);
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

function denseArray(value, code, maximum, { nonempty = false } = {}) {
  if (value === null || typeof value !== "object" || isProxy(value)
    || !ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum || (nonempty && value.length === 0)) {
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

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function includes(values, candidate) {
  for (let index = 0; index < values.length; index += 1) {
    if (values[index] === candidate) return true;
  }
  return false;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) fail(`${code}_INVALID`);
  return value;
}

function nullableHash(value, code) {
  return value === null ? null : hash(value, code);
}

function token(value, code) {
  if (typeof value !== "string" || !RegExpTest(TOKEN, value)) fail(`${code}_INVALID`);
  return value;
}

function canonicalTime(value, code) {
  if (typeof value !== "string" || !RegExpTest(CANONICAL_UTC, value)) {
    fail(`${code}_INVALID`);
  }
  const parsed = DateParse(value);
  if (!NumberIsFinite(parsed)
    || DateToISOString(new DateConstructor(parsed)) !== value) fail(`${code}_INVALID`);
  return value;
}

function digestBytes(value) {
  const state = createHash("sha256");
  CryptoHashUpdate(state, value);
  return `sha256:${CryptoHashDigest(state, "hex")}`;
}

function digest(domain, value) {
  if (value !== null && typeof value === "object" && !isProxy(value)
    && (ObjectGetPrototypeOf(value) === BufferPrototype
      || ObjectGetPrototypeOf(value) === Uint8ArrayPrototype)) {
    const state = createHash("sha256");
    CryptoHashUpdate(state, `${domain}\0`, "utf8");
    CryptoHashUpdate(state, value);
    return `sha256:${CryptoHashDigest(state, "hex")}`;
  }
  return digestBytes(`${domain}\0${typeof value === "string"
    ? value : canonicalizeStrict(value)}`);
}

function sortedHashSet(value, code, { nonempty = false,
  maximum = MAX_CORRELATION_ROOTS } = {}) {
  denseArray(value, code, maximum, { nonempty });
  const result = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    append(result, hash(value[index], `${code}_HASH`));
  }
  ArraySort(result);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return result;
}

function sortedTokens(value, allowed, code, { nonempty = false } = {}) {
  denseArray(value, code, allowed.length, { nonempty });
  const result = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    if (!includes(allowed, value[index])) fail(`${code}_VALUE_INVALID`);
    append(result, value[index]);
  }
  ArraySort(result);
  for (let index = 1; index < result.length; index += 1) {
    if (result[index] === result[index - 1]) fail(`${code}_DUPLICATE`);
  }
  return result;
}

function keyIdFromPublic(publicKeyPem) {
  const key = createPublicKey(publicKeyPem);
  if (KeyObjectAsymmetricKeyType(key) !== "ed25519") {
    fail("SIGNING_KEY_TYPE_INVALID");
  }
  return digestBytes(KeyObjectExport(key, { type: "spki", format: "der" }));
}

function keyIdFromPrivate(privateKeyPem) {
  const key = createPrivateKey(privateKeyPem);
  if (KeyObjectAsymmetricKeyType(key) !== "ed25519") {
    fail("SIGNING_KEY_TYPE_INVALID");
  }
  const publicKey = createPublicKey(key);
  return digestBytes(KeyObjectExport(publicKey, { type: "spki", format: "der" }));
}

function signHash(valueHash, privateKeyPem) {
  const value = cryptoSign(null, BufferFrom(valueHash, "utf8"),
    createPrivateKey(privateKeyPem)).toString("base64");
  return { algorithm: "Ed25519", keyId: keyIdFromPrivate(privateKeyPem), value };
}

function exactSignature(value, code) {
  exactObject(value, ["algorithm", "keyId", "value"], code);
  if (value.algorithm !== "Ed25519") fail(`${code}_ALGORITHM_INVALID`);
  const keyId = hash(value.keyId, `${code}_KEY_ID`);
  if (typeof value.value !== "string" || !RegExpTest(BASE64, value.value)) {
    fail(`${code}_VALUE_INVALID`);
  }
  const bytes = BufferFrom(value.value, "base64");
  if (bytes.length !== 64 || bytes.toString("base64") !== value.value) {
    fail(`${code}_VALUE_INVALID`);
  }
  return { algorithm: "Ed25519", keyId, value: value.value };
}

function verifySignedHash(valueHash, signature, publicKeyPem) {
  return cryptoVerify(null, BufferFrom(valueHash, "utf8"), createPublicKey(publicKeyPem),
    BufferFrom(signature.value, "base64"));
}

function normalizeTarget(value) {
  exactObject(value, ["claimHash", "wayHash", "worldHash", "episodeHash",
    "attemptHash", "executionEvidenceHash"], "TARGET");
  return {
    claimHash: hash(value.claimHash, "TARGET_CLAIM_HASH"),
    wayHash: hash(value.wayHash, "TARGET_WAY_HASH"),
    worldHash: hash(value.worldHash, "TARGET_WORLD_HASH"),
    episodeHash: hash(value.episodeHash, "TARGET_EPISODE_HASH"),
    attemptHash: hash(value.attemptHash, "TARGET_ATTEMPT_HASH"),
    executionEvidenceHash: hash(value.executionEvidenceHash,
      "TARGET_EXECUTION_EVIDENCE_HASH"),
  };
}

function normalizeHorizon(value) {
  exactObject(value, ["horizonId", "obligationHorizonCommitmentHash",
    "affectedPartyHorizonBindingHash"], "HORIZON");
  const obligationHorizonCommitmentHash = hash(value.obligationHorizonCommitmentHash,
    "OBLIGATION_HORIZON_COMMITMENT_HASH");
  const affectedPartyHorizonBindingHash = hash(value.affectedPartyHorizonBindingHash,
    "AFFECTED_PARTY_HORIZON_BINDING_HASH");
  if (obligationHorizonCommitmentHash === affectedPartyHorizonBindingHash) {
    fail("HORIZON_HASH_ROLE_COLLISION");
  }
  return { horizonId: token(value.horizonId, "HORIZON_ID"),
    obligationHorizonCommitmentHash, affectedPartyHorizonBindingHash };
}

function normalizeObservation(value) {
  exactObject(value, ["role", "observationStatus", "observedAt",
    "normalizedObservationHash", "consequenceReportHash",
    "affectedPartyReportSetHash", "recoveryEvidenceSetHash"], "OBSERVATION");
  if (!includes(OUTSIDER_NETWORK_OUTCOME_WITNESS_ROLES, value.role)) {
    fail("OBSERVATION_ROLE_INVALID");
  }
  if (!includes(NETWORK_ACTION_OUTCOME_V2_OBSERVATION_STATUSES,
    value.observationStatus)) fail("OBSERVATION_STATUS_INVALID");
  const consequenceReportHash = nullableHash(value.consequenceReportHash,
    "CONSEQUENCE_REPORT_HASH");
  const affectedPartyReportSetHash = nullableHash(value.affectedPartyReportSetHash,
    "AFFECTED_PARTY_REPORT_SET_HASH");
  const recoveryEvidenceSetHash = nullableHash(value.recoveryEvidenceSetHash,
    "RECOVERY_EVIDENCE_SET_HASH");
  if (value.observationStatus === "OBSERVED") {
    if (consequenceReportHash === null || affectedPartyReportSetHash === null) {
      fail("OBSERVED_EVIDENCE_REQUIRED");
    }
  } else if (consequenceReportHash !== null || affectedPartyReportSetHash !== null
    || recoveryEvidenceSetHash !== null) fail("UNOBSERVED_EVIDENCE_MUST_BE_NULL");
  return {
    role: value.role,
    observationStatus: value.observationStatus,
    observedAt: canonicalTime(value.observedAt, "OBSERVED_AT"),
    normalizedObservationHash: hash(value.normalizedObservationHash,
      "NORMALIZED_OBSERVATION_HASH"),
    consequenceReportHash,
    affectedPartyReportSetHash,
    recoveryEvidenceSetHash,
  };
}

function copySourceBytes(value) {
  if (value === null || typeof value !== "object") {
    fail("SOURCE_OBJECT_BYTES_REQUIRED");
  }
  // util.types.isProxy does not enter a Proxy.  It must stay before every
  // prototype check, byte-view predicate, intrinsic copy, or user property read.
  if (isProxy(value)) fail("SOURCE_OBJECT_BYTES_PROXY_FORBIDDEN");
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== BufferPrototype && prototype !== Uint8ArrayPrototype) {
    fail("SOURCE_OBJECT_BYTES_EXOTIC_FORBIDDEN");
  }
  for (let index = 0; index < BYTE_VIEW_FORBIDDEN_OWN_OVERRIDES.length; index += 1) {
    if (ObjectGetOwnPropertyDescriptor(value,
      BYTE_VIEW_FORBIDDEN_OWN_OVERRIDES[index])) {
      fail("SOURCE_OBJECT_BYTES_OWN_OVERRIDE_FORBIDDEN");
    }
  }
  // These predicates run only after proxy/exotic/override rejection.
  if (!ArrayBufferIsView(value)
    || (prototype === BufferPrototype && !BufferIsBuffer(value))
    || (prototype === Uint8ArrayPrototype && BufferIsBuffer(value))) {
    fail("SOURCE_OBJECT_BYTES_REQUIRED");
  }
  const backing = TypedArrayBuffer(value);
  if (isProxy(backing) || ObjectGetPrototypeOf(backing) !== ArrayBufferPrototype) {
    fail("SOURCE_OBJECT_SHARED_OR_EXOTIC_BUFFER_FORBIDDEN");
  }
  const byteLength = TypedArrayByteLength(value);
  const copied = new Uint8ArrayConstructor(byteLength);
  Uint8ArraySet(copied, value);
  return copied;
}

function sourceObject(value) {
  exactObject(value, ["objectId", "immutableVersion", "bytes"], "SOURCE_OBJECT_INPUT");
  const bytesDescriptor = ObjectGetOwnPropertyDescriptor(value, "bytes");
  const copied = copySourceBytes(bytesDescriptor.value);
  const copiedLength = TypedArrayByteLength(copied);
  if (copiedLength < 1 || copiedLength > MAX_SOURCE_OBJECT_BYTES) {
    fail("SOURCE_OBJECT_BYTES_INVALID");
  }
  return { objectId: token(value.objectId, "SOURCE_OBJECT_ID"),
    immutableVersion: token(value.immutableVersion, "SOURCE_OBJECT_VERSION"),
    byteLength: copiedLength,
    byteHash: digest("outsider/outcome-witness-source-object-bytes/v1", copied) };
}

export function createOutsiderOutcomeWitnessSourceManifest(input = {}) {
  exactObject(input, ["sourceId", "sourceClass", "objects", "rightsReviewHash",
    "privacyReviewHash", "retentionDays"], "SOURCE_MANIFEST_INPUT");
  if (!includes(OUTSIDER_NETWORK_OUTCOME_WITNESS_SOURCE_CLASSES, input.sourceClass)) {
    fail("SOURCE_CLASS_INVALID");
  }
  denseArray(input.objects, "SOURCE_OBJECTS", MAX_SOURCE_OBJECTS, { nonempty: true });
  const objects = new ArrayConstructor();
  for (let index = 0; index < input.objects.length; index += 1) {
    append(objects, sourceObject(input.objects[index]));
  }
  ArraySort(objects, (left, right) => left.objectId < right.objectId ? -1
    : left.objectId > right.objectId ? 1 : 0);
  let totalBytes = 0;
  for (let index = 0; index < objects.length; index += 1) {
    if (index > 0 && objects[index].objectId === objects[index - 1].objectId) {
      fail("SOURCE_OBJECT_ID_DUPLICATE");
    }
    totalBytes += objects[index].byteLength;
  }
  if (totalBytes > MAX_SOURCE_TOTAL_BYTES) fail("SOURCE_TOTAL_BYTES_INVALID");
  if (!NumberIsSafeInteger(input.retentionDays) || input.retentionDays < 1
    || input.retentionDays > 3650) fail("RETENTION_DAYS_INVALID");
  const body = {
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.sourceManifest,
    schemaVersion: "1.0.0",
    sourceId: token(input.sourceId, "SOURCE_ID"),
    sourceClass: input.sourceClass,
    objects,
    integrity: {
      objectCount: objects.length,
      totalBytes,
      exactObjectVersionLengthAndByteReplayRequired: true,
      immutableSnapshotDeclared: true,
    },
    rightsReviewHash: hash(input.rightsReviewHash, "RIGHTS_REVIEW_HASH"),
    privacyReviewHash: hash(input.privacyReviewHash, "PRIVACY_REVIEW_HASH"),
    retentionDays: input.retentionDays,
    rawSourceBytesInManifest: false,
    boundary: OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY,
  };
  return deepFreeze({ ...body, sourceManifestHash: digest(
    OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.sourceManifest, body) });
}

function sourceManifestInput(manifest, sourceObjects) {
  return {
    sourceId: manifest.sourceId,
    sourceClass: manifest.sourceClass,
    objects: sourceObjects,
    rightsReviewHash: manifest.rightsReviewHash,
    privacyReviewHash: manifest.privacyReviewHash,
    retentionDays: manifest.retentionDays,
  };
}

function replaySourceManifest(manifest, sourceObjects) {
  rejectTree(manifest);
  exactObject(manifest, ["schema", "schemaVersion", "sourceId", "sourceClass",
    "objects", "integrity", "rightsReviewHash", "privacyReviewHash", "retentionDays",
    "rawSourceBytesInManifest", "boundary", "sourceManifestHash"], "SOURCE_MANIFEST");
  if (manifest.schema !== OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.sourceManifest
    || manifest.schemaVersion !== "1.0.0" || manifest.rawSourceBytesInManifest !== false
    || !same(manifest.boundary, OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY)) {
    fail("SOURCE_MANIFEST_STATE_INVALID");
  }
  denseArray(sourceObjects, "SOURCE_REPLAY_OBJECTS", MAX_SOURCE_OBJECTS,
    { nonempty: true });
  const rebuilt = createOutsiderOutcomeWitnessSourceManifest(
    sourceManifestInput(manifest, sourceObjects));
  if (!same(manifest, rebuilt)) fail("SOURCE_MANIFEST_BYTE_REPLAY_INVALID");
  return rebuilt;
}

const ADAPTER_OUTPUT_CONTRACT = deepFreeze({
  schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.adapterOutput,
  fields: ["schema", "target", "horizon", "observation"],
  rawSourceBytesInOutput: false,
  outcomeTruthEstablished: false,
});
const ADAPTER_OUTPUT_CONTRACT_HASH = digest(
  "outsider/outcome-witness-adapter-output-contract/v1", ADAPTER_OUTPUT_CONTRACT);

const BUILT_IN_JSON_OBSERVATION_PROJECTION_SPECIFICATION = deepFreeze({
  adapterId:
    OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS.JSON_OBSERVATION_V1,
  adapterVersion: "1.0.0",
  specificationClass: "RESTRICTED_SINGLE_OBJECT_JSON_PROJECTION",
  sourceSelection: { exactObjectCount: 1, objectOrdinal: 0 },
  decode: { characterEncoding: "UTF-8", serialization: "JSON" },
  outputProjection: {
    schema: "ADAPTER_OUTPUT_CONTRACT_SCHEMA",
    target: "REPLAY_TARGET",
    horizon: "REPLAY_HORIZON",
    observation: "SOURCE_OBJECT_0_JSON_ROOT",
  },
  outputContractHash: ADAPTER_OUTPUT_CONTRACT_HASH,
  callerSuppliedFunctionsAccepted: false,
  implementationOrCodeClosureReplayed: false,
});
const BUILT_IN_JSON_OBSERVATION_PROJECTION_SPECIFICATION_HASH = digest(
  "outsider/outcome-witness-adapter-projection-specification/v1",
  BUILT_IN_JSON_OBSERVATION_PROJECTION_SPECIFICATION);

function builtInAdapterDefinition(adapterId) {
  if (adapterId
    !== OUTSIDER_NETWORK_OUTCOME_WITNESS_BUILT_IN_ADAPTER_IDS.JSON_OBSERVATION_V1) {
    fail("ADAPTER_NOT_MODULE_BUILT_IN");
  }
  return {
    adapterVersion: BUILT_IN_JSON_OBSERVATION_PROJECTION_SPECIFICATION.adapterVersion,
    projectionSpecification:
      BUILT_IN_JSON_OBSERVATION_PROJECTION_SPECIFICATION,
    projectionSpecificationHash:
      BUILT_IN_JSON_OBSERVATION_PROJECTION_SPECIFICATION_HASH,
  };
}

function replayBuiltInAdapter(adapterId, objects, target, horizon) {
  builtInAdapterDefinition(adapterId);
  if (objects.length !== 1) fail("BUILT_IN_ADAPTER_SOURCE_OBJECT_COUNT_INVALID");
  const observation = JSONParse(BufferToString(BufferFrom(objects[0].bytes), "utf8"));
  return {
    schema: ADAPTER_OUTPUT_CONTRACT.schema,
    target,
    horizon,
    observation,
  };
}

export function createOutsiderOutcomeWitnessAdapterDescriptor(input = {}) {
  exactObject(input, ["adapterId", "adapterVersion", "sourceClass", "sourceSchema",
    "instrumentHash"], "ADAPTER_DESCRIPTOR_INPUT");
  if (!includes(OUTSIDER_NETWORK_OUTCOME_WITNESS_SOURCE_CLASSES, input.sourceClass)) {
    fail("ADAPTER_SOURCE_CLASS_INVALID");
  }
  const definition = builtInAdapterDefinition(input.adapterId);
  if (input.adapterVersion !== definition.adapterVersion) {
    fail("ADAPTER_BUILT_IN_VERSION_INVALID");
  }
  rejectTree(input.sourceSchema);
  const body = {
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.adapterDescriptor,
    schemaVersion: "1.0.0",
    adapterId: token(input.adapterId, "ADAPTER_ID"),
    adapterVersion: token(input.adapterVersion, "ADAPTER_VERSION"),
    sourceClass: input.sourceClass,
    sourceSchemaHash: digest("outsider/outcome-witness-adapter-source-schema/v1",
      input.sourceSchema),
    projectionSpecification: definition.projectionSpecification,
    projectionSpecificationHash: definition.projectionSpecificationHash,
    adapterProjectionSpecificationReplayed: true,
    adapterImplementationOrCodeClosureReplayed: false,
    callerSuppliedAdapterFunctionAccepted: false,
    instrumentHash: hash(input.instrumentHash, "INSTRUMENT_HASH"),
    outputContractHash: ADAPTER_OUTPUT_CONTRACT_HASH,
    registrationScope: "EXPLICIT_LOCAL_REGISTRY_ONLY",
    nodeSdkDeclarationAcceptedAsRegistration: false,
    boundary: OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY,
  };
  return deepFreeze({ ...body, adapterDescriptorHash: digest(
    OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.adapterDescriptor, body) });
}

function replayIdentity(value) {
  exactObject(value, ["source", "envelope"], "WITNESS_IDENTITY");
  const checked = verifyActorIdentityEnvelope(value.envelope, {
    source: value.source,
    expectedSourceHash: value.source.sourceHash,
    expectedEnvelopeHash: value.envelope.actorIdentityEnvelopeHash,
  });
  if (!checked.ok || checked.sourceReplayComplete !== true) {
    fail(`WITNESS_IDENTITY_REPLAY_INVALID:${checked.error ?? "UNTRUSTED"}`);
  }
  const envelope = value.envelope;
  return {
    source: value.source,
    envelope,
    projection: {
      actorIdentityEnvelopeHash: envelope.actorIdentityEnvelopeHash,
      actorSubjectHash: envelope.actorSubjectHash,
      attemptActorSubjectHash: envelope.attemptActorSubjectHash,
      principalEpochProjectionHash: envelope.principalEpochProjectionHash,
      deploymentLineageProjectionHash: envelope.deploymentLineageProjectionHash,
      runtimeInstanceHash: envelope.runtimeInstance.runtimeInstanceHash,
      controllerKeyRefHash: envelope.principalEpoch.controllerKeyRefHash,
      providerRootHash: envelope.deploymentRevision.providerRootHash,
      trustDomainRefHash: envelope.principalEpoch.trustDomainRefHash,
    },
  };
}

function adapterOutput(value, target, horizon, expectedRole) {
  rejectTree(value);
  exactObject(value, ["schema", "target", "horizon", "observation"], "ADAPTER_OUTPUT");
  if (value.schema !== OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.adapterOutput) {
    fail("ADAPTER_OUTPUT_SCHEMA_INVALID");
  }
  const normalized = {
    schema: value.schema,
    target: normalizeTarget(value.target),
    horizon: normalizeHorizon(value.horizon),
    observation: normalizeObservation(value.observation),
  };
  if (!same(normalized.target, target) || !same(normalized.horizon, horizon)) {
    fail("ADAPTER_OUTPUT_TARGET_OR_HORIZON_MISMATCH");
  }
  if (normalized.observation.role !== expectedRole) fail("ADAPTER_OUTPUT_ROLE_MISMATCH");
  if (!same(value, normalized)) fail("ADAPTER_OUTPUT_CANONICAL_INVALID");
  return normalized;
}

export class OutsiderOutcomeWitnessAdapterRegistry {
  #entries = new MapConstructor();

  register(input = {}) {
    exactObject(input, ["descriptor", "sourceSchema"], "REGISTER_INPUT");
    const descriptor = input.descriptor;
    const rebuilt = createOutsiderOutcomeWitnessAdapterDescriptor({
      adapterId: descriptor.adapterId,
      adapterVersion: descriptor.adapterVersion,
      sourceClass: descriptor.sourceClass,
      sourceSchema: input.sourceSchema,
      instrumentHash: descriptor.instrumentHash,
    });
    if (!same(descriptor, rebuilt)) fail("ADAPTER_DESCRIPTOR_REPLAY_INVALID");
    if (MapHas(this.#entries, descriptor.adapterId)) fail("ADAPTER_ALREADY_REGISTERED");
    MapSet(this.#entries, descriptor.adapterId, {
      descriptor: rebuilt, sourceSchema: clone(input.sourceSchema),
    });
    return rebuilt;
  }

  replay(input = {}) {
    exactObject(input, ["adapterId", "sourceManifest", "sourceObjects", "target",
      "horizon", "witnessIdentity"], "REPLAY_INPUT");
    const entry = MapGet(this.#entries, token(input.adapterId, "ADAPTER_ID"));
    if (!entry) fail("ADAPTER_NOT_REGISTERED");
    const sourceManifest = replaySourceManifest(input.sourceManifest, input.sourceObjects);
    if (sourceManifest.sourceClass !== entry.descriptor.sourceClass) {
      fail("ADAPTER_SOURCE_CLASS_MISMATCH");
    }
    const target = normalizeTarget(input.target);
    const horizon = normalizeHorizon(input.horizon);
    const witness = replayIdentity(input.witnessIdentity);
    const copiedObjects = new ArrayConstructor();
    for (let index = 0; index < input.sourceObjects.length; index += 1) {
      const object = input.sourceObjects[index];
      const bytesDescriptor = ObjectGetOwnPropertyDescriptor(object, "bytes");
      append(copiedObjects, { objectId: object.objectId,
        immutableVersion: object.immutableVersion,
        bytes: copySourceBytes(bytesDescriptor.value) });
    }
    const rawOutput = replayBuiltInAdapter(entry.descriptor.adapterId, copiedObjects,
      clone(target), clone(horizon));
    const output = adapterOutput(rawOutput, target, horizon,
      SOURCE_CLASS_ROLE[sourceManifest.sourceClass]);
    const body = {
      schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.replayReceipt,
      schemaVersion: "1.0.0",
      replayClass: "FULL_EXACT_SOURCE_BYTES_AND_PINNED_ADAPTER_HOLD_ONLY",
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceClass: sourceManifest.sourceClass,
      sourceObjectCount: sourceManifest.integrity.objectCount,
      sourceTotalBytes: sourceManifest.integrity.totalBytes,
      adapterDescriptorHash: entry.descriptor.adapterDescriptorHash,
      instrumentHash: entry.descriptor.instrumentHash,
      target,
      witnessIdentity: witness.projection,
      horizon,
      observation: output.observation,
      sourceNativeReadback: {
        exactSourceBytesReplayed: true,
        adapterProjectionSpecificationAndSchemaReplayed: true,
        adapterImplementationOrCodeClosureReplayed: false,
        callerSuppliedAdapterFunctionUsed: false,
        rawSourceBytesInReceipt: false,
        nodeSdkDeclarationAcceptedAsAdapterProof: false,
        vendorSuccessAcceptedAsOutcomeTruth: false,
        sourceNativeReadbackComplete: true,
        independentOutcomeTruthEstablished: false,
      },
      boundary: OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY,
    };
    return deepFreeze({ ...body, replayReceiptHash: digest(
      OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.replayReceipt, body) });
  }
}

function normalizeKeyEpochs(value, code) {
  denseArray(value, `${code}_EPOCHS`, MAX_KEY_EPOCHS, { nonempty: true });
  const result = new ArrayConstructor();
  for (let index = 0; index < value.length; index += 1) {
    const row = value[index];
    exactObject(row, ["keyId", "publicKeyPem", "validFrom", "validUntil"],
      `${code}_EPOCH`);
    const keyId = hash(row.keyId, `${code}_KEY_ID`);
    const validFrom = canonicalTime(row.validFrom, `${code}_VALID_FROM`);
    const validUntil = canonicalTime(row.validUntil, `${code}_VALID_UNTIL`);
    if (DateParse(validUntil) <= DateParse(validFrom)
      || keyIdFromPublic(row.publicKeyPem) !== keyId) fail(`${code}_EPOCH_INVALID`);
    append(result, { keyId, publicKeyPem: row.publicKeyPem, validFrom, validUntil });
  }
  ArraySort(result, (left, right) => left.keyId < right.keyId ? -1
    : left.keyId > right.keyId ? 1
      : left.validFrom < right.validFrom ? -1 : left.validFrom > right.validFrom ? 1 : 0);
  for (let index = 1; index < result.length; index += 1) {
    const previous = result[index - 1];
    const current = result[index];
    if (previous.keyId === current.keyId && current.validFrom < previous.validUntil) {
      fail(`${code}_EPOCH_OVERLAP`);
    }
  }
  return result;
}

function selectEpoch(epochs, keyId, at, code) {
  const when = DateParse(canonicalTime(at, `${code}_AT`));
  let selected = null;
  let matches = 0;
  for (let index = 0; index < epochs.length; index += 1) {
    const epoch = epochs[index];
    if (epoch.keyId === keyId && when >= DateParse(epoch.validFrom)
      && when < DateParse(epoch.validUntil)) {
      selected = epoch;
      matches += 1;
    }
  }
  if (matches !== 1) fail(`${code}_NO_UNIQUE_VALID_EPOCH`);
  return selected;
}

function correlationRootSetHash(roots) {
  return digest("outsider/outcome-witness-correlation-root-set/v1", roots);
}

function normalizeTrustPolicy(value) {
  rejectTree(value);
  exactObject(value, ["schema", "expectedWitnessRegistryId",
    "expectedRelationshipRegistryId", "expectedActorIdentityEnvelopeHash",
    "expectedActorSubjectHash", "expectedActorCorrelationRootSetHash",
    "expectedWitnessIdentityEnvelopeHash", "expectedWitnessActorSubjectHash",
    "expectedWitnessPrincipalEpochProjectionHash",
    "expectedWitnessCorrelationRootSetHash", "expectedRelationshipReviewHash",
    "witnessSigningKeyEpochs", "relationshipReviewIssuer",
    "requiredRelationshipClasses", "validFrom", "validUntil", "policyHash"],
  "TRUST_POLICY");
  if (value.schema !== OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.trustPolicy) {
    fail("TRUST_POLICY_SCHEMA_INVALID");
  }
  exactObject(value.relationshipReviewIssuer, ["organizationHash", "keyEpochs"],
    "RELATIONSHIP_REVIEW_ISSUER");
  const validFrom = canonicalTime(value.validFrom, "POLICY_VALID_FROM");
  const validUntil = canonicalTime(value.validUntil, "POLICY_VALID_UNTIL");
  if (DateParse(validUntil) <= DateParse(validFrom)) fail("POLICY_VALIDITY_EMPTY");
  const body = {
    schema: value.schema,
    expectedWitnessRegistryId: token(value.expectedWitnessRegistryId,
      "EXPECTED_WITNESS_REGISTRY_ID"),
    expectedRelationshipRegistryId: token(value.expectedRelationshipRegistryId,
      "EXPECTED_RELATIONSHIP_REGISTRY_ID"),
    expectedActorIdentityEnvelopeHash: hash(value.expectedActorIdentityEnvelopeHash,
      "EXPECTED_ACTOR_IDENTITY_ENVELOPE_HASH"),
    expectedActorSubjectHash: hash(value.expectedActorSubjectHash,
      "EXPECTED_ACTOR_SUBJECT_HASH"),
    expectedActorCorrelationRootSetHash: hash(value.expectedActorCorrelationRootSetHash,
      "EXPECTED_ACTOR_CORRELATION_ROOT_SET_HASH"),
    expectedWitnessIdentityEnvelopeHash: hash(value.expectedWitnessIdentityEnvelopeHash,
      "EXPECTED_WITNESS_IDENTITY_ENVELOPE_HASH"),
    expectedWitnessActorSubjectHash: hash(value.expectedWitnessActorSubjectHash,
      "EXPECTED_WITNESS_ACTOR_SUBJECT_HASH"),
    expectedWitnessPrincipalEpochProjectionHash: hash(
      value.expectedWitnessPrincipalEpochProjectionHash,
      "EXPECTED_WITNESS_PRINCIPAL_EPOCH_PROJECTION_HASH"),
    expectedWitnessCorrelationRootSetHash: hash(
      value.expectedWitnessCorrelationRootSetHash,
      "EXPECTED_WITNESS_CORRELATION_ROOT_SET_HASH"),
    expectedRelationshipReviewHash: hash(value.expectedRelationshipReviewHash,
      "EXPECTED_RELATIONSHIP_REVIEW_HASH"),
    witnessSigningKeyEpochs: normalizeKeyEpochs(value.witnessSigningKeyEpochs,
      "WITNESS_SIGNING_KEY"),
    relationshipReviewIssuer: {
      organizationHash: hash(value.relationshipReviewIssuer.organizationHash,
        "RELATIONSHIP_REVIEW_ISSUER_ORGANIZATION_HASH"),
      keyEpochs: normalizeKeyEpochs(value.relationshipReviewIssuer.keyEpochs,
        "RELATIONSHIP_REVIEW_ISSUER_KEY"),
    },
    requiredRelationshipClasses: sortedTokens(value.requiredRelationshipClasses,
      OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES,
      "REQUIRED_RELATIONSHIP_CLASSES", { nonempty: true }),
    validFrom,
    validUntil,
  };
  for (let witnessIndex = 0;
    witnessIndex < body.witnessSigningKeyEpochs.length; witnessIndex += 1) {
    for (let issuerIndex = 0;
      issuerIndex < body.relationshipReviewIssuer.keyEpochs.length; issuerIndex += 1) {
      if (body.witnessSigningKeyEpochs[witnessIndex].keyId
        === body.relationshipReviewIssuer.keyEpochs[issuerIndex].keyId) {
        fail("TRUST_POLICY_WITNESS_RELATIONSHIP_ISSUER_KEY_ROLE_COLLISION");
      }
    }
  }
  const expectedPolicyHash = digest(OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.trustPolicy,
    body);
  if (value.policyHash !== expectedPolicyHash || !same(value, { ...body,
    policyHash: expectedPolicyHash })) fail("TRUST_POLICY_HASH_OR_CANONICAL_INVALID");
  return { ...body, policyHash: expectedPolicyHash };
}

function normalizeRelationshipParty(value, code) {
  exactObject(value, ["identityEnvelopeHash", "subjectHash", "correlationRootHashes"],
    code);
  const correlationRootHashes = sortedHashSet(value.correlationRootHashes,
    `${code}_CORRELATION_ROOTS`, { nonempty: true });
  return {
    identityEnvelopeHash: hash(value.identityEnvelopeHash, `${code}_IDENTITY_ENVELOPE_HASH`),
    subjectHash: hash(value.subjectHash, `${code}_SUBJECT_HASH`),
    correlationRootHashes,
  };
}

export function verifyOutsiderOutcomeWitnessRelationshipReview(record,
  { trustPolicy, at } = {}) {
  try {
    rejectTree(record);
    const policy = normalizeTrustPolicy(trustPolicy);
    const checkedAt = canonicalTime(at, "RELATIONSHIP_REVIEW_CHECKED_AT");
    exactObject(record, ["schema", "schemaVersion", "registryId", "reviewId",
      "actor", "witness", "relationshipClassesReviewed", "relationshipEvidenceSetHash",
      "finding", "issuedAt", "validFrom", "validUntil", "issuerOrganizationHash",
      "reviewHash", "signature"], "RELATIONSHIP_REVIEW");
    if (record.schema !== OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.relationshipReview
      || record.schemaVersion !== "1.0.0"
      || record.registryId !== policy.expectedRelationshipRegistryId) {
      fail("RELATIONSHIP_REVIEW_STATE_INVALID");
    }
    const actor = normalizeRelationshipParty(record.actor, "REVIEW_ACTOR");
    const witness = normalizeRelationshipParty(record.witness, "REVIEW_WITNESS");
    if (actor.identityEnvelopeHash !== policy.expectedActorIdentityEnvelopeHash
      || actor.subjectHash !== policy.expectedActorSubjectHash
      || witness.identityEnvelopeHash !== policy.expectedWitnessIdentityEnvelopeHash
      || witness.subjectHash !== policy.expectedWitnessActorSubjectHash
      || correlationRootSetHash(actor.correlationRootHashes)
        !== policy.expectedActorCorrelationRootSetHash
      || correlationRootSetHash(witness.correlationRootHashes)
        !== policy.expectedWitnessCorrelationRootSetHash) {
      fail("RELATIONSHIP_REVIEW_EXTERNAL_SUBJECT_PIN_MISMATCH");
    }
    for (let left = 0; left < actor.correlationRootHashes.length; left += 1) {
      if (includes(witness.correlationRootHashes, actor.correlationRootHashes[left])) {
        fail("RELATIONSHIP_REVIEW_CORRELATION_ROOT_COLLISION");
      }
    }
    const relationshipClassesReviewed = sortedTokens(record.relationshipClassesReviewed,
      OUTSIDER_NETWORK_OUTCOME_WITNESS_RELATIONSHIP_CLASSES,
      "RELATIONSHIP_CLASSES_REVIEWED", { nonempty: true });
    if (!same(relationshipClassesReviewed, policy.requiredRelationshipClasses)) {
      fail("RELATIONSHIP_REVIEW_REQUIRED_CLASS_SET_MISMATCH");
    }
    if (record.finding !== "NO_KNOWN_SHARED_CONTROL_WITHIN_DECLARED_SCOPE") {
      fail("RELATIONSHIP_REVIEW_FINDING_INVALID");
    }
    const issuedAt = canonicalTime(record.issuedAt, "RELATIONSHIP_REVIEW_ISSUED_AT");
    const validFrom = canonicalTime(record.validFrom, "RELATIONSHIP_REVIEW_VALID_FROM");
    const validUntil = canonicalTime(record.validUntil, "RELATIONSHIP_REVIEW_VALID_UNTIL");
    if (DateParse(validUntil) <= DateParse(validFrom)
      || DateParse(issuedAt) < DateParse(validFrom)
      || DateParse(issuedAt) >= DateParse(validUntil)
      || DateParse(checkedAt) < DateParse(validFrom)
      || DateParse(checkedAt) >= DateParse(validUntil)
      || DateParse(checkedAt) < DateParse(policy.validFrom)
      || DateParse(checkedAt) >= DateParse(policy.validUntil)) {
      fail("RELATIONSHIP_REVIEW_VALIDITY_INVALID");
    }
    const issuerOrganizationHash = hash(record.issuerOrganizationHash,
      "RELATIONSHIP_REVIEW_ISSUER_ORGANIZATION_HASH");
    if (issuerOrganizationHash !== policy.relationshipReviewIssuer.organizationHash
      || includes(actor.correlationRootHashes, issuerOrganizationHash)
      || includes(witness.correlationRootHashes, issuerOrganizationHash)) {
      fail("RELATIONSHIP_REVIEW_ISSUER_ROLE_COLLISION");
    }
    const body = {
      schema: record.schema,
      schemaVersion: "1.0.0",
      registryId: record.registryId,
      reviewId: token(record.reviewId, "RELATIONSHIP_REVIEW_ID"),
      actor,
      witness,
      relationshipClassesReviewed,
      relationshipEvidenceSetHash: hash(record.relationshipEvidenceSetHash,
        "RELATIONSHIP_EVIDENCE_SET_HASH"),
      finding: record.finding,
      issuedAt,
      validFrom,
      validUntil,
      issuerOrganizationHash,
    };
    const reviewHash = digest(
      OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.relationshipReview, body);
    if (record.reviewHash !== reviewHash
      || reviewHash !== policy.expectedRelationshipReviewHash) {
      fail("RELATIONSHIP_REVIEW_HASH_INVALID");
    }
    const signature = exactSignature(record.signature, "RELATIONSHIP_REVIEW_SIGNATURE");
    for (let index = 0; index < policy.witnessSigningKeyEpochs.length; index += 1) {
      if (signature.keyId === policy.witnessSigningKeyEpochs[index].keyId) {
        fail("RELATIONSHIP_REVIEW_WITNESS_SIGNING_KEY_ROLE_COLLISION");
      }
    }
    if (includes(actor.correlationRootHashes, signature.keyId)
      || includes(witness.correlationRootHashes, signature.keyId)) {
      fail("RELATIONSHIP_REVIEW_ISSUER_KEY_CORRELATION_ROLE_COLLISION");
    }
    const epoch = selectEpoch(policy.relationshipReviewIssuer.keyEpochs,
      signature.keyId, issuedAt, "RELATIONSHIP_REVIEW_ISSUER_KEY");
    if (!verifySignedHash(reviewHash, signature, epoch.publicKeyPem)
      || !same(record, { ...body, reviewHash, signature })) {
      fail("RELATIONSHIP_REVIEW_SIGNATURE_OR_CANONICAL_INVALID");
    }
    return deepFreeze({
      schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.verification,
      ok: true,
      stage: "RELATIONSHIP_REVIEW",
      relationshipReviewHash: reviewHash,
      relationshipReviewSourceReplayed: false,
      externalRelationshipIssuerKeyEpochPinned: true,
      independencePolicyVerifiedWithinScope: true,
      organizationalIndependenceEstablished: false,
      independentOutcomeTruthEstablished: false,
      status: "HOLD",
      authority: "NONE",
      boundary: OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure("RELATIONSHIP_REVIEW", error);
  }
}

function witnessEnvelopeBody(input, signingKeyId) {
  exactObject(input, ["replayReceipt", "witnessIdentity", "relationshipReviewHash",
    "witnessRegistryId", "signedAt"], "WITNESS_ENVELOPE_INPUT");
  const witness = replayIdentity(input.witnessIdentity);
  const receipt = input.replayReceipt;
  if (!same(receipt.witnessIdentity, witness.projection)
    || !same(receipt.boundary, OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY)) {
    fail("WITNESS_ENVELOPE_REPLAY_RECEIPT_IDENTITY_INVALID");
  }
  const signedAt = canonicalTime(input.signedAt, "WITNESS_ENVELOPE_SIGNED_AT");
  if (DateParse(signedAt) < DateParse(receipt.observation.observedAt)) {
    fail("WITNESS_ENVELOPE_SIGNED_BEFORE_OBSERVATION");
  }
  return {
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.envelope,
    schemaVersion: "1.0.0",
    envelopeClass: "SOURCE_BYTE_REPLAYED_SECOND_TYPED_ACTOR_WITNESS_HOLD_ONLY",
    witnessRegistryId: token(input.witnessRegistryId, "WITNESS_REGISTRY_ID"),
    target: receipt.target,
    witnessIdentity: witness.projection,
    sourceManifestHash: receipt.sourceManifestHash,
    adapterDescriptorHash: receipt.adapterDescriptorHash,
    instrumentHash: receipt.instrumentHash,
    replayReceiptHash: receipt.replayReceiptHash,
    horizon: receipt.horizon,
    observation: receipt.observation,
    relationshipReviewHash: hash(input.relationshipReviewHash,
      "RELATIONSHIP_REVIEW_HASH"),
    signedAt,
    signingKeyId,
    sourceByteReplayComplete: true,
    relationshipReviewVerifiedByEnvelopeCreator: false,
    independentOutcomeTruthEstablished: false,
    causalAttributionEstablished: false,
    obligationClosed: false,
    boundary: OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY,
  };
}

export function createOutsiderOutcomeWitnessEnvelope(input = {},
  { witnessPrivateKeyPem } = {}) {
  if (typeof witnessPrivateKeyPem !== "string") fail("WITNESS_SIGNING_KEY_REQUIRED");
  const signingKeyId = keyIdFromPrivate(witnessPrivateKeyPem);
  const body = witnessEnvelopeBody(input, signingKeyId);
  const envelopeHash = digest(OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.envelope, body);
  return deepFreeze({ ...body, envelopeHash,
    signature: signHash(envelopeHash, witnessPrivateKeyPem) });
}

function exactEnvelope(record) {
  rejectTree(record);
  exactObject(record, ["schema", "schemaVersion", "envelopeClass",
    "witnessRegistryId", "target", "witnessIdentity", "sourceManifestHash",
    "adapterDescriptorHash", "instrumentHash", "replayReceiptHash", "horizon",
    "observation", "relationshipReviewHash", "signedAt", "signingKeyId",
    "sourceByteReplayComplete", "relationshipReviewVerifiedByEnvelopeCreator",
    "independentOutcomeTruthEstablished", "causalAttributionEstablished",
    "obligationClosed", "boundary", "envelopeHash", "signature"], "WITNESS_ENVELOPE");
  if (record.schema !== OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.envelope
    || record.schemaVersion !== "1.0.0"
    || record.envelopeClass
      !== "SOURCE_BYTE_REPLAYED_SECOND_TYPED_ACTOR_WITNESS_HOLD_ONLY"
    || record.sourceByteReplayComplete !== true
    || record.relationshipReviewVerifiedByEnvelopeCreator !== false
    || record.independentOutcomeTruthEstablished !== false
    || record.causalAttributionEstablished !== false
    || record.obligationClosed !== false
    || !same(record.boundary, OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY)) {
    fail("WITNESS_ENVELOPE_STATE_INVALID");
  }
  return record;
}

function verificationFailure(stage, error) {
  return deepFreeze({
    schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.verification,
    ok: false,
    stage,
    sourceByteReplayComplete: false,
    secondTypedActorIdentityReplayed: false,
    independencePolicyVerifiedWithinScope: false,
    organizationalIndependenceEstablished: false,
    independentOutcomeTruthEstablished: false,
    status: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    automaticTraining: false,
    trainingRows: 0,
    causalExperienceUnits: 0,
    error: error instanceof Error ? error.message : StringConstructor(error),
    boundary: OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY,
  });
}

export function verifyOutsiderOutcomeWitnessEnvelope(record, context = {}) {
  try {
    exactEnvelope(record);
    exactObject(context, ["expectedEnvelopeHash", "witnessIdentity", "sourceReplay",
      "relationshipReview", "trustPolicy"], "WITNESS_VERIFY_CONTEXT");
    const policy = normalizeTrustPolicy(context.trustPolicy);
    const expectedEnvelopeHash = hash(context.expectedEnvelopeHash,
      "EXPECTED_WITNESS_ENVELOPE_HASH");
    const witness = replayIdentity(context.witnessIdentity);
    if (witness.envelope.actorIdentityEnvelopeHash
        !== policy.expectedWitnessIdentityEnvelopeHash
      || witness.envelope.actorSubjectHash !== policy.expectedWitnessActorSubjectHash
      || witness.envelope.principalEpochProjectionHash
        !== policy.expectedWitnessPrincipalEpochProjectionHash) {
      fail("WITNESS_IDENTITY_EXTERNAL_POLICY_PIN_MISMATCH");
    }
    const replay = context.sourceReplay;
    exactObject(replay, ["registry", "adapterId", "sourceManifest", "sourceObjects",
      "target", "horizon"], "SOURCE_REPLAY_CONTEXT");
    if (!(replay.registry instanceof OutsiderOutcomeWitnessAdapterRegistry)) {
      fail("SOURCE_REPLAY_REGISTRY_REQUIRED");
    }
    const receipt = replay.registry.replay({
      adapterId: replay.adapterId,
      sourceManifest: replay.sourceManifest,
      sourceObjects: replay.sourceObjects,
      target: replay.target,
      horizon: replay.horizon,
      witnessIdentity: context.witnessIdentity,
    });
    if (receipt.sourceManifestHash !== replay.sourceManifest.sourceManifestHash) {
      fail("SOURCE_REPLAY_MANIFEST_MISMATCH");
    }
    const reviewCheck = verifyOutsiderOutcomeWitnessRelationshipReview(
      context.relationshipReview, { trustPolicy: policy,
        at: receipt.observation.observedAt });
    if (!reviewCheck.ok || reviewCheck.independencePolicyVerifiedWithinScope !== true) {
      fail(`RELATIONSHIP_REVIEW_INVALID:${reviewCheck.error ?? "UNTRUSTED"}`);
    }
    if (record.witnessRegistryId !== policy.expectedWitnessRegistryId
      || record.relationshipReviewHash !== reviewCheck.relationshipReviewHash
      || record.relationshipReviewHash !== policy.expectedRelationshipReviewHash
      || !same(record.target, receipt.target)
      || !same(record.witnessIdentity, receipt.witnessIdentity)
      || record.sourceManifestHash !== receipt.sourceManifestHash
      || record.adapterDescriptorHash !== receipt.adapterDescriptorHash
      || record.instrumentHash !== receipt.instrumentHash
      || record.replayReceiptHash !== receipt.replayReceiptHash
      || !same(record.horizon, receipt.horizon)
      || !same(record.observation, receipt.observation)) {
      fail("WITNESS_ENVELOPE_SOURCE_OR_POLICY_BINDING_MISMATCH");
    }
    const signedAt = canonicalTime(record.signedAt, "WITNESS_ENVELOPE_SIGNED_AT");
    if (DateParse(signedAt) < DateParse(receipt.observation.observedAt)
      || DateParse(signedAt) < DateParse(policy.validFrom)
      || DateParse(signedAt) >= DateParse(policy.validUntil)) {
      fail("WITNESS_ENVELOPE_SIGNING_TIME_INVALID");
    }
    const signature = exactSignature(record.signature, "WITNESS_ENVELOPE_SIGNATURE");
    if (record.signingKeyId !== signature.keyId) fail("WITNESS_SIGNING_KEY_ID_MISMATCH");
    const epoch = selectEpoch(policy.witnessSigningKeyEpochs, signature.keyId,
      signedAt, "WITNESS_SIGNING_KEY");
    const { envelopeHash: ignoredEnvelopeHash, signature: ignoredSignature, ...body } = record;
    const envelopeHash = digest(OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.envelope, body);
    if (record.envelopeHash !== envelopeHash || record.envelopeHash !== expectedEnvelopeHash
      || !verifySignedHash(envelopeHash, signature, epoch.publicKeyPem)) {
      fail("WITNESS_ENVELOPE_HASH_OR_SIGNATURE_INVALID");
    }
    return deepFreeze({
      schema: OUTSIDER_NETWORK_OUTCOME_WITNESS_SCHEMAS.verification,
      ok: true,
      stage: "WITNESS_ENVELOPE",
      envelopeHash,
      replayReceiptHash: receipt.replayReceiptHash,
      sourceManifestHash: receipt.sourceManifestHash,
      sourceByteReplayComplete: true,
      adapterProjectionSpecificationAndSchemaReplayed: true,
      adapterImplementationOrCodeClosureReplayed: false,
      secondTypedActorIdentityReplayed: true,
      witnessKeyEpochExternallyPinned: true,
      relationshipReviewIssuerKeyEpochExternallyPinned: true,
      independencePolicyVerifiedWithinScope: true,
      organizationalIndependenceEstablished: false,
      independentOutcomeTruthEstablished: false,
      causalAttributionEstablished: false,
      obligationClosed: false,
      status: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      automaticTraining: false,
      trainingRows: 0,
      causalExperienceUnits: 0,
      boundary: OUTSIDER_NETWORK_OUTCOME_WITNESS_BOUNDARY,
    });
  } catch (error) {
    return verificationFailure("WITNESS_ENVELOPE", error);
  }
}
