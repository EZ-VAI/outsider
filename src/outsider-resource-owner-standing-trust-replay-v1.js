/*
 * Resource-owner standing/trust source replay v1.
 *
 * This is a private-source-in, closed-projection-out HOLD layer. It replays an
 * already-compiled tender, the exact typed actor graph, a separate owner
 * identity reference graph, a one-use response, a source-signed standing
 * declaration, an append-only owner-registry lifecycle, exact rights/privacy
 * review bytes, and one quarantined network-intake occurrence. No signature,
 * transport receipt, actor envelope, or source-signed head establishes legal
 * owner identity, owner authority, capacity, permission to act, or money
 * movement. The current network intake has no owner-standing lane and the
 * current lifecycle checkpoint has no per-event membership proof; both gaps
 * remain explicit.
 */

import {
  createHash,
  createPublicKey,
  verify as cryptoVerify,
} from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyActorIdentityEnvelope }
  from "./outsider-actor-identity-envelope.js";
import {
  NETWORK_INTAKE_BOUNDARY,
  NETWORK_INTAKE_PAYLOAD_SCHEMAS,
  networkIntakeDigest,
  verifyNetworkIntakeChallenge,
  verifyNetworkIntakeManifest,
  verifyNetworkIntakePayloadEnvelope,
  verifyNetworkIntakeReceipt,
  verifyNetworkIntakeReservation,
} from "./outsider-network-intake.js";
import { NETWORK_LIFECYCLE_HEAD_SCHEMAS }
  from "./outsider-network-lifecycle-head-checkpoint.js";
import { networkQuarantineSourceReviewFileHash }
  from "./outsider-network-quarantine-source-review.js";
import {
  externalCapacitySourceSigningMessageV1,
  verifyExternalCapacityVerifierContextV1,
  verifyOneUseTenderResponseLifecycleV1,
} from "./outsider-one-use-tender-response-lifecycle-v1.js";
import { verifyOutsiderOutcomeTenderV1 }
  from "./outsider-outcome-tender-v1.js";

const ArrayIsArray = Array.isArray;
const ArrayPrototype = Array.prototype;
const BufferByteLength = Buffer.byteLength;
const BufferEquals = Function.prototype.call.bind(Buffer.prototype.equals);
const BufferFrom = Buffer.from;
const BufferIsBuffer = Buffer.isBuffer;
const BufferToString = Function.prototype.call.bind(Buffer.prototype.toString);
const DateConstructor = Date;
const DateParse = Date.parse;
const DateToISOString = Function.prototype.call.bind(Date.prototype.toISOString);
const ErrorConstructor = Error;
const JSONParse = JSON.parse;
const NumberIsFinite = Number.isFinite;
const NumberIsSafeInteger = Number.isSafeInteger;
const ObjectCreate = Object.create;
const ObjectDefineProperty = Object.defineProperty;
const ObjectFreeze = Object.freeze;
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
const SetSize = Function.prototype.call.bind(
  Object.getOwnPropertyDescriptor(Set.prototype, "size").get);
const StringConstructor = String;
const TypeErrorConstructor = TypeError;
const HashPrototype = ObjectGetPrototypeOf(createHash("sha256"));
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);

const PREFIX = "OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const STRICT_BASE64
  = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const MAX_SOURCE_BUFFERS = 2_048;
const MAX_SINGLE_SOURCE_BYTES = 1024 * 1024;
const MAX_AGGREGATE_SOURCE_BYTES = 16 * 1024 * 1024;
const MAX_SINGLE_STRING_BYTES = 1024 * 1024;
const MAX_AGGREGATE_STRING_BYTES = 32 * 1024 * 1024;
const MAX_ARRAY_LENGTH = 4_096;
const MAX_AGGREGATE_ARRAY_ELEMENTS = 100_000;
const MAX_TREE_NODES = 250_000;
const MAX_TREE_KEYS = 750_000;
const MAX_TREE_DEPTH = 96;
const MAX_LIFECYCLE_EVENTS = 1_024;

export const OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS
  = ObjectFreeze({
    context: "outsider/resource-owner-standing-trust-verifier-context/v1",
    semantics: "outsider/resource-owner-standing-registry-semantics/v1",
    adoption: "outsider/resource-owner-standing-adoption/v1",
    lifecycleEvent: "outsider/resource-owner-standing-lifecycle-event/v1",
    lifecycleHead: "outsider/resource-owner-standing-lifecycle-head/v1",
    rightsReview: "outsider/resource-owner-standing-rights-review/v1",
    privacyReview: "outsider/resource-owner-standing-privacy-review/v1",
    replay: "outsider/resource-owner-standing-trust-source-replay/v1",
  });

export const OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_LIMITS
  = ObjectFreeze({
    maximumSingleSourceBytes: MAX_SINGLE_SOURCE_BYTES,
    maximumAggregateSourceBytes: MAX_AGGREGATE_SOURCE_BYTES,
    maximumLifecycleEvents: MAX_LIFECYCLE_EVENTS,
    maximumArrayLength: MAX_ARRAY_LENGTH,
    maximumAggregateArrayElements: MAX_AGGREGATE_ARRAY_ELEMENTS,
    maximumTreeNodes: MAX_TREE_NODES,
    maximumTreeKeys: MAX_TREE_KEYS,
  });

export const OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_BOUNDARY
  = deepFreeze({
    position:
      "SOURCE_DECLARATIONS_REPLAYED_INDEPENDENT_OWNER_TRUST_ROOT_UNESTABLISHED_HOLD",
    privateRawSourceInputMayContainSensitiveMaterial: true,
    rawSourceBytesProjected: false,
    sourcePathsProjected: false,
    sourceSystemIdsProjected: false,
    publicKeysProjected: false,
    exactCanonicalSourceBytesRequired: true,
    rawSourceReplayRequiredForVerification: true,
    outputOnlyVerificationAccepted: false,
    sourceSignaturesEstablishLegalOwnerIdentity: false,
    sourceSignaturesEstablishOwnerAuthority: false,
    actorIdentityReferenceEstablishesLegalOwnerIdentity: false,
    networkTransportReceiptEstablishesOwnerStanding: false,
    networkIntakeServerTrustPolicyExternallyPinned: false,
    networkIntakeAudienceExternallyPinned: false,
    ownerStandingNetworkIntakeLaneAvailable: false,
    prospectiveCensusLaneUsedForOccurrenceOnly: true,
    callerScopedNetworkTransportConsistencyMayBeChecked: true,
    networkOccurrenceRecorded: false,
    externalNetworkCensusEvidenceEstablished: false,
    occurrenceCensusSeparatedFromObjectDedup: true,
    objectDedupMayReduceOccurrenceDenominator: false,
    appendOnlyLifecycleRequired: true,
    preActionRegistrationBindsGenesisAdoptedEvent: true,
    preActionRegistrationMustPrecedeIntakeManifestAndReceipt: true,
    currentLifecycleHeadReplayedSeparatelyFromPreActionRegistration: true,
    currentSourceSignedHeadRequired: true,
    sourceSignedHeadIsIndependentExternalAnchor: false,
    networkLifecycleCheckpointSchema:
      NETWORK_LIFECYCLE_HEAD_SCHEMAS.checkpoint,
    networkLifecycleSingleEventMembershipProofAvailable: false,
    externalTransparencyAnchorEstablished: false,
    sourceNonEquivocationEstablished: false,
    sourceCompletenessBeyondPinnedHeadEstablished: false,
    rightsReviewBytesMayBeReplayed: true,
    privacyReviewBytesMayBeReplayed: true,
    rightsReviewSemanticsAdjudicated: false,
    privacyReviewSemanticsAdjudicated: false,
    rightsEstablished: false,
    privacyEstablished: false,
    independentResourceOwnerTrustAnchorReplayed: false,
    resourceOwnerLegalIdentityEstablished: false,
    resourceOwnerStandingEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    authorityEstablished: false,
    providerContactPerformed: false,
    networkRequestPerformed: false,
    liveActionAvailable: false,
    pricePresent: false,
    pricingPermitted: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
  });

const SOURCE_KINDS = ObjectFreeze([
  "SEMANTICS", "ADOPTION", "LIFECYCLE_EVENT", "LIFECYCLE_HEAD",
  "RIGHTS_REVIEW", "PRIVACY_REVIEW",
]);
const LIFECYCLE_STATES = ObjectFreeze(["ADOPTED", "REVOKED", "EXPIRED"]);
export const OUTSIDER_RESOURCE_OWNER_STANDING_EVENT_GENESIS_V1
  = sha256Bytes(BufferFrom(
    "outsider/resource-owner-standing-lifecycle-event/genesis/v1", "utf8"));

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

function clonePreflight(value) {
  const active = new SetConstructor();
  const budget = { nodes: 0, keys: 0, buffers: 0, bytes: 0,
    strings: 0, arrayElements: 0 };
  function visit(current, depth) {
    if (typeof current === "string") {
      const bytes = BufferByteLength(current, "utf8");
      if (bytes > MAX_SINGLE_STRING_BYTES) fail("SOURCE_STRING_TOO_LARGE");
      budget.strings += bytes;
      if (budget.strings > MAX_AGGREGATE_STRING_BYTES) {
        fail("SOURCE_STRING_AGGREGATE_BUDGET_EXCEEDED");
      }
      return current;
    }
    if (current === null || typeof current === "boolean") return current;
    if (typeof current === "number") {
      if (!NumberIsFinite(current)) fail("SOURCE_NUMBER_INVALID");
      return current;
    }
    if (typeof current !== "object" || isProxy(current)) {
      fail("SOURCE_VALUE_INVALID");
    }
    if (depth > MAX_TREE_DEPTH || SetHas(active, current)) {
      fail("SOURCE_CYCLIC_OR_TOO_DEEP");
    }
    SetAdd(active, current);
    budget.nodes += 1;
    if (budget.nodes > MAX_TREE_NODES) fail("SOURCE_NODE_BUDGET_EXCEEDED");
    if (BufferIsBuffer(current)) {
      if (current.length < 2 || current.length > MAX_SINGLE_SOURCE_BYTES) {
        fail("SOURCE_BUFFER_SIZE_INVALID");
      }
      budget.buffers += 1;
      budget.bytes += current.length;
      if (budget.buffers > MAX_SOURCE_BUFFERS
        || budget.bytes > MAX_AGGREGATE_SOURCE_BYTES) {
        fail("SOURCE_BUFFER_AGGREGATE_BUDGET_EXCEEDED");
      }
      const copy = BufferFrom(current);
      SetDelete(active, current);
      return copy;
    }
    const array = ArrayIsArray(current);
    const prototype = ObjectGetPrototypeOf(current);
    if (array ? prototype !== ArrayPrototype : prototype !== ObjectPrototype) {
      fail("SOURCE_PROTOTYPE_INVALID");
    }
    const descriptors = ObjectGetOwnPropertyDescriptors(current);
    const keys = ReflectOwnKeys(descriptors);
    budget.keys += keys.length;
    if (budget.keys > MAX_TREE_KEYS) fail("SOURCE_KEY_BUDGET_EXCEEDED");
    if (array) {
      if (current.length > MAX_ARRAY_LENGTH) fail("SOURCE_ARRAY_TOO_LARGE");
      budget.arrayElements += current.length;
      if (budget.arrayElements > MAX_AGGREGATE_ARRAY_ELEMENTS) {
        fail("SOURCE_ARRAY_AGGREGATE_BUDGET_EXCEEDED");
      }
      if (keys.length !== current.length + 1
        || !ObjectHasOwn(descriptors, "length")) fail("SOURCE_ARRAY_INVALID");
      const output = [];
      for (let index = 0; index < current.length; index += 1) {
        const key = StringConstructor(index);
        const descriptor = descriptors[key];
        if (!descriptor || !ObjectHasOwn(descriptor, "value")
          || descriptor.enumerable !== true) fail("SOURCE_ARRAY_INVALID");
        append(output, visit(descriptor.value, depth + 1));
      }
      SetDelete(active, current);
      return output;
    }
    const output = ObjectCreate(ObjectPrototype);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = descriptors[key];
      if (typeof key !== "string" || !descriptor
        || !ObjectHasOwn(descriptor, "value")
        || descriptor.enumerable !== true) fail("SOURCE_DESCRIPTOR_INVALID");
      ObjectDefineProperty(output, key, {
        value: visit(descriptor.value, depth + 1),
        writable: true, enumerable: true, configurable: true,
      });
    }
    SetDelete(active, current);
    return output;
  }
  const clone = visit(value, 0);
  return { clone, budget: deepFreeze({ ...budget }) };
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || BufferIsBuffer(value) || isProxy(value)
    || ObjectGetPrototypeOf(value) !== ObjectPrototype) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  const keys = ReflectOwnKeys(descriptors);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = descriptors[fields[index]];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function denseArray(value, code, maximum = MAX_ARRAY_LENGTH) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length > maximum) fail(`${code}_ARRAY_INVALID`);
  const descriptors = ObjectGetOwnPropertyDescriptors(value);
  if (ReflectOwnKeys(descriptors).length !== value.length + 1) {
    fail(`${code}_ARRAY_INVALID`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[StringConstructor(index)];
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_ARRAY_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !RegExpTest(HASH, value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function token(value, code) {
  if (typeof value !== "string" || !RegExpTest(TOKEN, value)) {
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

function safeInteger(value, minimum, maximum, code) {
  if (!NumberIsSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function allowed(value, values, code) {
  for (let index = 0; index < values.length; index += 1) {
    if (value === values[index]) return value;
  }
  fail(`${code}_INVALID`);
}

function sha256Bytes(value) {
  const state = createHash("sha256");
  HashUpdate(state, value);
  return `sha256:${HashDigest(state, "hex")}`;
}

function digest(domain, value) {
  return sha256Bytes(BufferFrom(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function publicKeyMaterial(publicKeyPem, expectedKeyId, code) {
  if (typeof publicKeyPem !== "string"
    || BufferByteLength(publicKeyPem, "utf8") > 16_384) {
    fail(`${code}_PUBLIC_KEY_INVALID`);
  }
  let key;
  try { key = createPublicKey(publicKeyPem); }
  catch { fail(`${code}_PUBLIC_KEY_INVALID`); }
  if (key.asymmetricKeyType !== "ed25519") {
    fail(`${code}_PUBLIC_KEY_NOT_ED25519`);
  }
  const keyId = sha256Bytes(key.export({ type: "spki", format: "der" }));
  if (keyId !== hash(expectedKeyId, `${code}_EXPECTED_KEY_ID`)) {
    fail(`${code}_KEY_ID_MISMATCH`);
  }
  return { key, keyId };
}

const CONTEXT_INPUT_FIELDS = ObjectFreeze([
  "registryRefHash", "sourceSystemRefHash", "adapterArtifactHash",
  "semanticsSchema", "adoptionSchema", "lifecycleEventSchema",
  "lifecycleHeadSchema", "rightsReviewSchema", "privacyReviewSchema",
  "sourcePublicKeyPem", "expectedSourceKeyId", "validFrom", "validUntil",
  "issuedAt", "maximumLifecycleHeadAgeMs",
]);

export function createResourceOwnerStandingTrustVerifierContextV1(input = {}) {
  const checkedInput = clonePreflight(input).clone;
  exactObject(checkedInput, CONTEXT_INPUT_FIELDS, "CONTEXT_INPUT");
  const material = publicKeyMaterial(checkedInput.sourcePublicKeyPem,
    checkedInput.expectedSourceKeyId, "CONTEXT");
  const validFrom = instant(checkedInput.validFrom, "CONTEXT_VALID_FROM");
  const validUntil = instant(checkedInput.validUntil, "CONTEXT_VALID_UNTIL");
  const issuedAt = instant(checkedInput.issuedAt, "CONTEXT_ISSUED_AT");
  if (DateParse(validUntil) <= DateParse(validFrom)
    || DateParse(issuedAt) > DateParse(validFrom)) {
    fail("CONTEXT_VALIDITY_INVALID");
  }
  const body = {
    schema: OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.context,
    schemaVersion: "1.0.0",
    contextClass:
      "CALLER_PINNED_SOURCE_SPECIFIC_OWNER_REGISTRY_CONTEXT_HOLD_ONLY",
    registryRefHash: hash(checkedInput.registryRefHash, "CONTEXT_REGISTRY_REF_HASH"),
    sourceSystemRefHash: hash(checkedInput.sourceSystemRefHash,
      "CONTEXT_SOURCE_SYSTEM_REF_HASH"),
    adapterArtifactHash: hash(checkedInput.adapterArtifactHash,
      "CONTEXT_ADAPTER_ARTIFACT_HASH"),
    semanticsSchema: token(checkedInput.semanticsSchema, "CONTEXT_SEMANTICS_SCHEMA"),
    adoptionSchema: token(checkedInput.adoptionSchema, "CONTEXT_ADOPTION_SCHEMA"),
    lifecycleEventSchema: token(checkedInput.lifecycleEventSchema,
      "CONTEXT_EVENT_SCHEMA"),
    lifecycleHeadSchema: token(checkedInput.lifecycleHeadSchema,
      "CONTEXT_HEAD_SCHEMA"),
    rightsReviewSchema: token(checkedInput.rightsReviewSchema,
      "CONTEXT_RIGHTS_SCHEMA"),
    privacyReviewSchema: token(checkedInput.privacyReviewSchema,
      "CONTEXT_PRIVACY_SCHEMA"),
    signatureAlgorithm: "ED25519",
    sourcePublicKeyPem: checkedInput.sourcePublicKeyPem,
    sourceKeyId: material.keyId,
    validFrom,
    validUntil,
    issuedAt,
    maximumLifecycleHeadAgeMs: safeInteger(checkedInput.maximumLifecycleHeadAgeMs,
      0, 86_400_000, "CONTEXT_MAXIMUM_HEAD_AGE_MS"),
    callerPinRequired: true,
    sourceKeyEstablishesLegalOwnerIdentity: false,
    sourceKeyEstablishesOwnerAuthority: false,
    actionReady: false,
    executable: false,
  };
  return deepFreeze({ ...body, contextHash: digest(
    OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.context, body) });
}

const CONTEXT_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "contextClass", "registryRefHash",
  "sourceSystemRefHash", "adapterArtifactHash", "semanticsSchema",
  "adoptionSchema", "lifecycleEventSchema", "lifecycleHeadSchema",
  "rightsReviewSchema", "privacyReviewSchema", "signatureAlgorithm",
  "sourcePublicKeyPem", "sourceKeyId", "validFrom", "validUntil", "issuedAt",
  "maximumLifecycleHeadAgeMs", "callerPinRequired",
  "sourceKeyEstablishesLegalOwnerIdentity",
  "sourceKeyEstablishesOwnerAuthority", "actionReady", "executable",
  "contextHash",
]);

function contextInput(record) {
  return {
    registryRefHash: record.registryRefHash,
    sourceSystemRefHash: record.sourceSystemRefHash,
    adapterArtifactHash: record.adapterArtifactHash,
    semanticsSchema: record.semanticsSchema,
    adoptionSchema: record.adoptionSchema,
    lifecycleEventSchema: record.lifecycleEventSchema,
    lifecycleHeadSchema: record.lifecycleHeadSchema,
    rightsReviewSchema: record.rightsReviewSchema,
    privacyReviewSchema: record.privacyReviewSchema,
    sourcePublicKeyPem: record.sourcePublicKeyPem,
    expectedSourceKeyId: record.sourceKeyId,
    validFrom: record.validFrom,
    validUntil: record.validUntil,
    issuedAt: record.issuedAt,
    maximumLifecycleHeadAgeMs: record.maximumLifecycleHeadAgeMs,
  };
}

function checkedContext(record, expectedHash) {
  exactObject(record, CONTEXT_FIELDS, "CONTEXT");
  const rebuilt = createResourceOwnerStandingTrustVerifierContextV1(
    contextInput(record));
  if (!same(record, rebuilt)
    || rebuilt.contextHash !== hash(expectedHash, "EXPECTED_CONTEXT_HASH")) {
    fail("CONTEXT_REBUILD_OR_PIN_FAILED");
  }
  return rebuilt;
}

export function resourceOwnerStandingSourceSigningMessageV1(kind, payload) {
  const selected = allowed(kind, SOURCE_KINDS, "SOURCE_KIND");
  canonicalizeStrict(payload);
  return BufferFrom(
    `outsider/resource-owner-standing-source/${selected.toLowerCase()}/v1\0${canonicalizeStrict(payload)}`,
    "utf8");
}

function canonicalEnvelope(bytes, expectedHash, code) {
  if (!BufferIsBuffer(bytes) || bytes.length < 2
    || bytes.length > MAX_SINGLE_SOURCE_BYTES) fail(`${code}_BYTES_INVALID`);
  const copy = BufferFrom(bytes);
  if (sha256Bytes(copy) !== hash(expectedHash, `${code}_EXPECTED_HASH`)) {
    fail(`${code}_HASH_PIN_MISMATCH`);
  }
  const text = BufferToString(copy, "utf8");
  if (!BufferEquals(BufferFrom(text, "utf8"), copy)) fail(`${code}_UTF8_INVALID`);
  let value;
  try { value = JSONParse(text); }
  catch { fail(`${code}_JSON_INVALID`); }
  exactObject(value, ["payload", "signature"], `${code}_ENVELOPE`);
  if (canonicalizeStrict(value) !== text) fail(`${code}_NOT_EXACT_CANONICAL_JSON`);
  return { value: deepFreeze(value), bytes: copy, hash: sha256Bytes(copy) };
}

function verifySignature(envelope, context, kind, code) {
  const signature = envelope.value.signature;
  exactObject(signature, ["algorithm", "keyId", "valueBase64"],
    `${code}_SIGNATURE`);
  if (signature.algorithm !== "ED25519"
    || signature.keyId !== context.sourceKeyId
    || typeof signature.valueBase64 !== "string"
    || !RegExpTest(STRICT_BASE64, signature.valueBase64)) {
    fail(`${code}_SIGNATURE_INVALID`);
  }
  const signatureBytes = BufferFrom(signature.valueBase64, "base64");
  if (signatureBytes.length !== 64
    || BufferToString(signatureBytes, "base64") !== signature.valueBase64) {
    fail(`${code}_SIGNATURE_INVALID`);
  }
  const material = publicKeyMaterial(context.sourcePublicKeyPem,
    context.sourceKeyId, code);
  if (!cryptoVerify(null, resourceOwnerStandingSourceSigningMessageV1(
    kind, envelope.value.payload), material.key, signatureBytes)) {
    fail(`${code}_SIGNATURE_INVALID`);
  }
}

function verifyExternalStandingSignature(envelope, externalContext) {
  const signature = envelope.value.signature;
  exactObject(signature, ["algorithm", "keyId", "valueBase64"],
    "EXTERNAL_STANDING_SIGNATURE");
  if (signature.algorithm !== "ED25519"
    || signature.keyId !== externalContext.sourceKeyId
    || typeof signature.valueBase64 !== "string"
    || !RegExpTest(STRICT_BASE64, signature.valueBase64)) {
    fail("EXTERNAL_STANDING_SIGNATURE_INVALID");
  }
  const bytes = BufferFrom(signature.valueBase64, "base64");
  if (bytes.length !== 64
    || BufferToString(bytes, "base64") !== signature.valueBase64) {
    fail("EXTERNAL_STANDING_SIGNATURE_INVALID");
  }
  const material = publicKeyMaterial(externalContext.sourcePublicKeyPem,
    externalContext.sourceKeyId, "EXTERNAL_STANDING");
  if (!cryptoVerify(null, externalCapacitySourceSigningMessageV1(
    "STANDING", envelope.value.payload), material.key, bytes)) {
    fail("EXTERNAL_STANDING_SIGNATURE_INVALID");
  }
}

const IDENTITY_REPLAY_FIELDS = ObjectFreeze([
  "source", "envelope", "expectedSourceHash", "expectedEnvelopeHash",
]);

function replayIdentity(input, code) {
  exactObject(input, IDENTITY_REPLAY_FIELDS, `${code}_IDENTITY_REPLAY`);
  const checked = verifyActorIdentityEnvelope(input.envelope, {
    source: input.source,
    expectedSourceHash: input.expectedSourceHash,
    expectedEnvelopeHash: input.expectedEnvelopeHash,
  });
  if (!checked.ok || checked.sourceReplayComplete !== true
    || checked.externalAuthorityEstablished !== false
    || checked.decisionState !== "HOLD" || checked.actionReady !== false
    || checked.executable !== false) fail(`${code}_IDENTITY_REPLAY_FAILED`);
  return checked;
}

function bindTypedGraph(tender, actorReplay) {
  const envelope = actorReplay.envelope;
  const graph = tender.typedGraph;
  if (tender.authorizationBinding.actorIdentityEnvelopeHash
      !== envelope.actorIdentityEnvelopeHash
    || graph.principalEpoch.principalRefHash
      !== envelope.principalEpoch.principalRefHash
    || graph.principalEpoch.epochRefHash !== envelope.principalEpoch.epochRefHash
    || graph.principalEpoch.principalEpochProjectionHash
      !== envelope.principalEpochProjectionHash
    || graph.accountableDeployment.deploymentLineageRefHash
      !== envelope.deploymentLineage.deploymentLineageRefHash
    || graph.accountableDeployment.deploymentRevisionHash
      !== envelope.deploymentRevision.deploymentRevisionHash
    || graph.accountableDeployment.accountableDeploymentSubjectHash
      !== envelope.actorSubjectHash
    || graph.runtime.runtimeInstanceRefHash
      !== envelope.runtimeInstance.runtimeInstanceRefHash
    || graph.runtime.runtimeInstanceHash !== envelope.runtimeInstance.runtimeInstanceHash
    || graph.embodiment.present !== (envelope.embodimentRevision !== null)
    || graph.embodiment.deviceLineageRefHash
      !== (envelope.embodimentRevision?.deviceLineageRefHash ?? null)
    || graph.embodiment.embodimentRevisionHash
      !== (envelope.embodimentRevision?.embodimentRevisionHash ?? null)
    || graph.episode.episodeHash !== envelope.bindings.run.episodeHash
    || graph.attempt.attemptHash !== envelope.bindings.run.attemptHash
    || graph.attempt.attemptActorSubjectHash !== envelope.attemptActorSubjectHash) {
    fail("TYPED_GRAPH_ACTOR_BINDING_MISMATCH");
  }
  let delegationMatched = false;
  for (let index = 0; index < envelope.delegationEdges.length; index += 1) {
    if (envelope.delegationEdges[index].delegationEdgeHash
        === graph.delegation.delegationEdgeHash
      && envelope.delegationEdges[index].delegationEvidenceRefHash
        === graph.delegation.delegationEvidenceRefHash) {
      delegationMatched = true;
    }
  }
  if (!delegationMatched) fail("TYPED_GRAPH_DELEGATION_BINDING_MISMATCH");
  if (graph.graphPath
      !== "PRINCIPAL_EPOCH_TO_ACCOUNTABLE_DEPLOYMENT_TO_RUNTIME_OR_EMBODIMENT_TO_DELEGATION_TO_EPISODE_TO_ATTEMPT"
    || graph.ipAddressAcceptedAsIdentity !== false
    || graph.deviceAddressAcceptedAsIdentity !== false
    || graph.baseModelAcceptedAsIdentity !== false
    || graph.globalScoreCreated !== false) fail("TYPED_GRAPH_POLICY_MISMATCH");
}

const EXTERNAL_STANDING_FIELDS = ObjectFreeze([
  "schema", "sourceSystemId", "providerRefHash", "resourceOwnerRefHash",
  "discoveryRouteObjectHash", "discoveryCandidateHash", "scopeHash",
  "requirementKind", "requirementId", "requirementSetHash",
  "requirementObjectHash", "requirementClassCode", "requirementScopeRefHash",
  "quantity", "unitCode", "regionRefHash", "quantitySemantics", "validFrom",
  "validUntil", "issuedAt", "standingState", "standingEvidenceRefHash",
]);

function verifyExternalStandingPayload(payload, context, response, observedAt) {
  exactObject(payload, EXTERNAL_STANDING_FIELDS, "EXTERNAL_STANDING_PAYLOAD");
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
    || payload.quantity !== response.quantity || payload.unitCode !== response.unitCode
    || payload.regionRefHash !== response.regionRefHash
    || payload.quantitySemantics !== response.quantitySemantics
    || payload.standingState !== "SOURCE_DECLARED_ACTIVE") {
    fail("EXTERNAL_STANDING_SCOPE_BINDING_MISMATCH");
  }
  hash(payload.resourceOwnerRefHash, "EXTERNAL_RESOURCE_OWNER_REF_HASH");
  hash(payload.standingEvidenceRefHash, "EXTERNAL_STANDING_EVIDENCE_REF_HASH");
  const validFrom = instant(payload.validFrom, "EXTERNAL_STANDING_VALID_FROM");
  const validUntil = instant(payload.validUntil, "EXTERNAL_STANDING_VALID_UNTIL");
  const issuedAt = instant(payload.issuedAt, "EXTERNAL_STANDING_ISSUED_AT");
  if (DateParse(validUntil) <= DateParse(validFrom)
    || DateParse(validFrom) < DateParse(context.validFrom)
    || DateParse(validUntil) > DateParse(context.validUntil)
    || DateParse(issuedAt) < DateParse(context.issuedAt)
    || DateParse(observedAt) < DateParse(context.validFrom)
    || DateParse(observedAt) >= DateParse(context.validUntil)
    || DateParse(issuedAt) > DateParse(validFrom)
    || DateParse(validFrom) > DateParse(response.serviceFrom)
    || DateParse(validUntil) < DateParse(response.serviceUntil)) {
    fail("EXTERNAL_STANDING_VALIDITY_NOT_CURRENT");
  }
  return payload;
}

const SEMANTICS_FIELDS = ObjectFreeze([
  "schema", "sourceSystemRefHash", "registryRefHash", "adapterArtifactHash",
  "adoptionSchema", "lifecycleEventSchema", "lifecycleHeadSchema",
  "rightsReviewSchema", "privacyReviewSchema", "ownerKeyRoleSemanticCode",
  "occurrencePolicy", "validFrom", "validUntil", "issuedAt",
]);

function verifySemantics(payload, context, observedAt) {
  exactObject(payload, SEMANTICS_FIELDS, "SEMANTICS_PAYLOAD");
  if (payload.schema !== context.semanticsSchema
    || payload.sourceSystemRefHash !== context.sourceSystemRefHash
    || payload.registryRefHash !== context.registryRefHash
    || payload.adapterArtifactHash !== context.adapterArtifactHash
    || payload.adoptionSchema !== context.adoptionSchema
    || payload.lifecycleEventSchema !== context.lifecycleEventSchema
    || payload.lifecycleHeadSchema !== context.lifecycleHeadSchema
    || payload.rightsReviewSchema !== context.rightsReviewSchema
    || payload.privacyReviewSchema !== context.privacyReviewSchema
    || payload.ownerKeyRoleSemanticCode
      !== "SOURCE_KEY_SIGNS_REGISTRY_DECLARATIONS_NOT_LEGAL_OWNER_IDENTITY"
    || payload.occurrencePolicy
      !== "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR") {
    fail("SEMANTICS_CONTEXT_BINDING_MISMATCH");
  }
  const validFrom = instant(payload.validFrom, "SEMANTICS_VALID_FROM");
  const validUntil = instant(payload.validUntil, "SEMANTICS_VALID_UNTIL");
  const issuedAt = instant(payload.issuedAt, "SEMANTICS_ISSUED_AT");
  if (DateParse(validUntil) <= DateParse(validFrom)
    || DateParse(validFrom) < DateParse(context.validFrom)
    || DateParse(validUntil) > DateParse(context.validUntil)
    || DateParse(issuedAt) > DateParse(validFrom)
    || DateParse(observedAt) < DateParse(validFrom)
    || DateParse(observedAt) >= DateParse(validUntil)) {
    fail("SEMANTICS_VALIDITY_NOT_CURRENT");
  }
  return payload;
}

const ADOPTION_FIELDS = ObjectFreeze([
  "schema", "sourceSystemRefHash", "registryRefHash", "semanticsSourceHash",
  "resourceOwnerRefHash", "ownerActorIdentityEnvelopeHash",
  "ownerPrincipalEpochProjectionHash", "providerRefHash",
  "externalStandingSourceHash", "tenderHash", "typedGraphHash", "episodeHash",
  "attemptHash", "resourceOwnerAuthorizationRefHash", "scopeHash",
  "lifecycleStreamRefHash", "adoptedAt", "validUntil", "adoptionState",
]);

function verifyAdoption(payload, context, semanticsHash, tender, response,
  standing, standingHash, ownerReplay) {
  exactObject(payload, ADOPTION_FIELDS, "ADOPTION_PAYLOAD");
  if (payload.schema !== context.adoptionSchema
    || payload.sourceSystemRefHash !== context.sourceSystemRefHash
    || payload.registryRefHash !== context.registryRefHash
    || payload.semanticsSourceHash !== semanticsHash
    || payload.resourceOwnerRefHash !== standing.resourceOwnerRefHash
    || payload.resourceOwnerRefHash
      !== ownerReplay.envelope.principalEpochProjectionHash
    || payload.ownerActorIdentityEnvelopeHash
      !== ownerReplay.envelope.actorIdentityEnvelopeHash
    || payload.ownerPrincipalEpochProjectionHash
      !== ownerReplay.envelope.principalEpochProjectionHash
    || payload.providerRefHash !== response.providerRefHash
    || payload.externalStandingSourceHash !== standingHash
    || payload.tenderHash !== tender.tenderHash
    || payload.typedGraphHash !== tender.typedGraph.typedGraphHash
    || payload.episodeHash !== tender.typedGraph.episode.episodeHash
    || payload.attemptHash !== tender.typedGraph.attempt.attemptHash
    || payload.resourceOwnerAuthorizationRefHash
      !== tender.authorizationBinding.resourceOwnerAuthorizationRefHash
    || payload.scopeHash !== response.scopeHash
    || payload.adoptionState !== "SOURCE_DECLARED_ADOPTED") {
    fail("ADOPTION_BINDING_MISMATCH");
  }
  hash(payload.lifecycleStreamRefHash, "ADOPTION_LIFECYCLE_STREAM_REF_HASH");
  const adoptedAt = instant(payload.adoptedAt, "ADOPTION_ADOPTED_AT");
  const validUntil = instant(payload.validUntil, "ADOPTION_VALID_UNTIL");
  if (DateParse(validUntil) <= DateParse(adoptedAt)
    || DateParse(adoptedAt) < DateParse(standing.validFrom)
    || DateParse(validUntil) > DateParse(standing.validUntil)) {
    fail("ADOPTION_VALIDITY_INVALID");
  }
  if (ownerReplay.envelope.principalEpoch.controllerKeyRefHash
      !== context.sourceKeyId) {
    fail("OWNER_CONTROLLER_KEY_REFERENCE_BINDING_MISMATCH");
  }
  return payload;
}

const REVIEW_FIELDS = ObjectFreeze([
  "schema", "sourceSystemRefHash", "registryRefHash", "adoptionSourceHash",
  "reviewKind", "policyRefHash", "sourceArtifactRefHash", "reviewState",
  "reviewerIndependenceClaimed", "issuedAt", "validFrom", "validUntil",
]);

function verifyReview(payload, context, adoptionHash, tender, observedAt, kind) {
  exactObject(payload, REVIEW_FIELDS, `${kind}_PAYLOAD`);
  const expectedSchema = kind === "RIGHTS_REVIEW"
    ? context.rightsReviewSchema : context.privacyReviewSchema;
  const expectedKind = kind === "RIGHTS_REVIEW" ? "RIGHTS" : "PRIVACY";
  if (payload.schema !== expectedSchema
    || payload.sourceSystemRefHash !== context.sourceSystemRefHash
    || payload.registryRefHash !== context.registryRefHash
    || payload.adoptionSourceHash !== adoptionHash
    || payload.reviewKind !== expectedKind
    || payload.policyRefHash
      !== tender.authorizationBinding.rightsPrivacyPolicyRefHash
    || payload.reviewState
      !== "SOURCE_DECLARED_REVIEW_PRESENT_NOT_ADJUDICATED"
    || payload.reviewerIndependenceClaimed !== false) {
    fail(`${kind}_BINDING_MISMATCH`);
  }
  hash(payload.sourceArtifactRefHash, `${kind}_SOURCE_ARTIFACT_REF_HASH`);
  const validFrom = instant(payload.validFrom, `${kind}_VALID_FROM`);
  const validUntil = instant(payload.validUntil, `${kind}_VALID_UNTIL`);
  const issuedAt = instant(payload.issuedAt, `${kind}_ISSUED_AT`);
  if (DateParse(validUntil) <= DateParse(validFrom)
    || DateParse(validFrom) < DateParse(context.validFrom)
    || DateParse(validUntil) > DateParse(context.validUntil)
    || DateParse(issuedAt) > DateParse(validFrom)) {
    fail(`${kind}_VALIDITY_INVALID`);
  }
  return {
    payload,
    currentAtObservedAt: DateParse(validFrom) <= DateParse(observedAt)
      && DateParse(observedAt) < DateParse(validUntil),
  };
}

const EVENT_FIELDS = ObjectFreeze([
  "schema", "sourceSystemRefHash", "registryRefHash", "lifecycleStreamRefHash",
  "adoptionSourceHash", "ordinal", "previousEventSourceHash", "eventState",
  "occurredAt", "objectIdentityHash", "occurrenceIdentityHash",
]);

function verifyLifecycleEvents(bytesList, expectedHashes, expectedCount,
  context, adoption, adoptionHash) {
  denseArray(bytesList, "LIFECYCLE_EVENT_BYTES", MAX_LIFECYCLE_EVENTS);
  denseArray(expectedHashes, "LIFECYCLE_EVENT_HASHES", MAX_LIFECYCLE_EVENTS);
  safeInteger(expectedCount, 1, MAX_LIFECYCLE_EVENTS,
    "EXPECTED_LIFECYCLE_EVENT_COUNT");
  if (bytesList.length !== expectedCount || expectedHashes.length !== expectedCount) {
    fail("LIFECYCLE_EVENT_DENOMINATOR_MISMATCH");
  }
  let previous = OUTSIDER_RESOURCE_OWNER_STANDING_EVENT_GENESIS_V1;
  let state = null;
  let lastOccurredAt = null;
  let genesisEventSourceHash = null;
  let genesisOccurredAt = null;
  const occurrences = new SetConstructor();
  const objectIdentities = new SetConstructor();
  for (let index = 0; index < bytesList.length; index += 1) {
    const envelope = canonicalEnvelope(bytesList[index], expectedHashes[index],
      `LIFECYCLE_EVENT_${index + 1}`);
    verifySignature(envelope, context, "LIFECYCLE_EVENT",
      `LIFECYCLE_EVENT_${index + 1}`);
    const payload = envelope.value.payload;
    exactObject(payload, EVENT_FIELDS, `LIFECYCLE_EVENT_${index + 1}_PAYLOAD`);
    if (payload.schema !== context.lifecycleEventSchema
      || payload.sourceSystemRefHash !== context.sourceSystemRefHash
      || payload.registryRefHash !== context.registryRefHash
      || payload.lifecycleStreamRefHash !== adoption.lifecycleStreamRefHash
      || payload.adoptionSourceHash !== adoptionHash
      || payload.ordinal !== index + 1
      || payload.previousEventSourceHash !== previous) {
      fail("LIFECYCLE_EVENT_CHAIN_OR_BINDING_MISMATCH");
    }
    const eventState = allowed(payload.eventState, LIFECYCLE_STATES,
      "LIFECYCLE_EVENT_STATE");
    const occurredAt = instant(payload.occurredAt, "LIFECYCLE_EVENT_OCCURRED_AT");
    const objectIdentityHash = hash(payload.objectIdentityHash,
      "LIFECYCLE_EVENT_OBJECT_IDENTITY_HASH");
    const occurrenceIdentityHash = hash(payload.occurrenceIdentityHash,
      "LIFECYCLE_EVENT_OCCURRENCE_IDENTITY_HASH");
    const expectedObjectIdentityHash = networkIntakeDigest(
      "outsider/resource-owner-standing-lifecycle-object/v1", {
        sourceSystemRefHash: payload.sourceSystemRefHash,
        registryRefHash: payload.registryRefHash,
        lifecycleStreamRefHash: payload.lifecycleStreamRefHash,
        adoptionSourceHash: payload.adoptionSourceHash,
      });
    const expectedOccurrenceIdentityHash = networkIntakeDigest(
      "outsider/resource-owner-standing-lifecycle-occurrence/v1", {
        adoptionSourceHash: payload.adoptionSourceHash,
        ordinal: payload.ordinal,
        previousEventSourceHash: payload.previousEventSourceHash,
        eventState: payload.eventState,
        occurredAt: payload.occurredAt,
      });
    if (objectIdentityHash !== expectedObjectIdentityHash
      || occurrenceIdentityHash !== expectedOccurrenceIdentityHash) {
      fail("LIFECYCLE_EVENT_IDENTITY_DERIVATION_MISMATCH");
    }
    if (SetHas(occurrences, occurrenceIdentityHash)) {
      fail("LIFECYCLE_EVENT_OCCURRENCE_REPLAY_DETECTED");
    }
    SetAdd(occurrences, occurrenceIdentityHash);
    SetAdd(objectIdentities, objectIdentityHash);
    if (index === 0) {
      if (eventState !== "ADOPTED"
        || DateParse(occurredAt) < DateParse(adoption.adoptedAt)) {
        fail("LIFECYCLE_EVENT_GENESIS_INVALID");
      }
      genesisEventSourceHash = envelope.hash;
      genesisOccurredAt = occurredAt;
    } else if (index !== 1 || state !== "ADOPTED"
      || eventState !== "REVOKED" && eventState !== "EXPIRED") {
      fail("LIFECYCLE_TRANSITION_INVALID");
    }
    if (lastOccurredAt !== null
      && DateParse(occurredAt) < DateParse(lastOccurredAt)) {
      fail("LIFECYCLE_EVENT_TIME_ROLLBACK");
    }
    if (eventState === "EXPIRED"
      && DateParse(occurredAt) < DateParse(adoption.validUntil)) {
      fail("LIFECYCLE_EXPIRY_PRECEDES_VALID_UNTIL");
    }
    previous = envelope.hash;
    state = eventState;
    lastOccurredAt = occurredAt;
  }
  return { headEventSourceHash: previous, currentState: state, lastOccurredAt,
    genesisEventSourceHash, genesisOccurredAt, eventCount: bytesList.length,
    distinctObjectCount: SetSize(objectIdentities) };
}

const HEAD_FIELDS = ObjectFreeze([
  "schema", "sourceSystemRefHash", "registryRefHash", "lifecycleStreamRefHash",
  "adoptionSourceHash", "eventCount", "coveredFromOrdinal", "coveredToOrdinal",
  "headEventSourceHash", "currentState", "observedAt", "occurrencePolicy",
  "rightsReviewSourceHash", "privacyReviewSourceHash",
]);

function verifyLifecycleHead(payload, context, adoption, adoptionHash, replay,
  rightsHash, privacyHash, observedAt) {
  exactObject(payload, HEAD_FIELDS, "LIFECYCLE_HEAD_PAYLOAD");
  if (payload.schema !== context.lifecycleHeadSchema
    || payload.sourceSystemRefHash !== context.sourceSystemRefHash
    || payload.registryRefHash !== context.registryRefHash
    || payload.lifecycleStreamRefHash !== adoption.lifecycleStreamRefHash
    || payload.adoptionSourceHash !== adoptionHash
    || payload.eventCount !== replay.eventCount
    || payload.coveredFromOrdinal !== 1
    || payload.coveredToOrdinal !== replay.eventCount
    || payload.headEventSourceHash !== replay.headEventSourceHash
    || payload.currentState !== replay.currentState
    || payload.rightsReviewSourceHash !== rightsHash
    || payload.privacyReviewSourceHash !== privacyHash
    || payload.occurrencePolicy
      !== "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR") {
    fail("LIFECYCLE_HEAD_DENOMINATOR_OR_BINDING_MISMATCH");
  }
  const headObservedAt = instant(payload.observedAt, "LIFECYCLE_HEAD_OBSERVED_AT");
  if (DateParse(headObservedAt) < DateParse(replay.lastOccurredAt)
    || DateParse(headObservedAt) > DateParse(observedAt)
    || DateParse(observedAt) - DateParse(headObservedAt)
      > context.maximumLifecycleHeadAgeMs) fail("LIFECYCLE_HEAD_NOT_FRESH");
  return payload;
}

const NETWORK_INTAKE_FIELDS = ObjectFreeze([
  "manifest", "payload", "expectedManifestHash", "challenge", "reservation",
  "payloadEnvelope", "receipt", "challengeServerPublicKeyPem",
  "receiptServerPublicKeyPem", "expectedAudience", "expectedReservationHash",
  "expectedReceiptHash",
]);

function verifyIntake(input, semanticsBytes, adoptionBytes, rightsBytes,
  privacyBytes, semanticsHash, adoptionHash, standingHash,
  preActionEventSourceHash, preActionEventOccurredAt, response, tender,
  accountableActorReplay) {
  exactObject(input, NETWORK_INTAKE_FIELDS, "NETWORK_INTAKE_REPLAY");
  const manifestCreatedAt = instant(input.manifest.createdAt,
    "NETWORK_INTAKE_MANIFEST_CREATED_AT");
  const receiptReceivedAt = instant(input.receipt.receivedAt,
    "NETWORK_INTAKE_RECEIPT_RECEIVED_AT");
  const manifest = verifyNetworkIntakeManifest(input.manifest, {
    payload: input.payload,
    expectedManifestHash: input.expectedManifestHash,
  });
  const challenge = verifyNetworkIntakeChallenge(input.challenge, {
    serverPublicKeyPem: input.challengeServerPublicKeyPem,
    expectedAudience: input.expectedAudience,
    expectedManifestHash: input.expectedManifestHash,
    expectedTransportSignerKeyId: input.reservation.transportSignerKeyId,
    at: input.reservation.reservedAt,
  });
  const reservation = verifyNetworkIntakeReservation(input.reservation, {
    challenge: input.challenge,
    serverPublicKeyPem: input.challengeServerPublicKeyPem,
    expectedAudience: input.expectedAudience,
    expectedReservationHash: input.expectedReservationHash,
  });
  const payloadEnvelope = verifyNetworkIntakePayloadEnvelope(input.payloadEnvelope, {
    reservation: input.reservation,
    challenge: input.challenge,
    serverPublicKeyPem: input.challengeServerPublicKeyPem,
    expectedAudience: input.expectedAudience,
  });
  const receipt = verifyNetworkIntakeReceipt(input.receipt, {
    reservation: input.reservation,
    payloadEnvelope: input.payloadEnvelope,
    challenge: input.challenge,
    challengeServerPublicKeyPem: input.challengeServerPublicKeyPem,
    receiptServerPublicKeyPem: input.receiptServerPublicKeyPem,
    expectedAudience: input.expectedAudience,
  });
  if (!manifest.ok || !challenge.ok || !reservation.ok || !payloadEnvelope.ok
    || !receipt.ok || input.receipt.receiptHash
      !== hash(input.expectedReceiptHash, "EXPECTED_NETWORK_RECEIPT_HASH")) {
    fail("NETWORK_INTAKE_SOURCE_REPLAY_FAILED");
  }
  if (input.payload.preActionRegistrationReferenceHash
      !== preActionEventSourceHash) {
    fail("NETWORK_INTAKE_PRE_ACTION_REGISTRATION_BINDING_MISMATCH");
  }
  if (DateParse(preActionEventOccurredAt) > DateParse(manifestCreatedAt)
    || DateParse(preActionEventOccurredAt) > DateParse(receiptReceivedAt)) {
    fail("NETWORK_INTAKE_PRE_ACTION_REGISTRATION_AFTER_INTAKE");
  }
  if (input.manifest.lane !== "PROSPECTIVE_CENSUS"
    || input.manifest.payloadSchema
      !== NETWORK_INTAKE_PAYLOAD_SCHEMAS.PROSPECTIVE_CENSUS
    || input.manifest.source.sourceManifestHash
      !== networkQuarantineSourceReviewFileHash("SOURCE_MANIFEST", semanticsBytes)
    || input.manifest.source.instrumentHash
      !== networkQuarantineSourceReviewFileHash("INSTRUMENT", adoptionBytes)
    || input.manifest.source.rightsReviewHash
      !== networkQuarantineSourceReviewFileHash("RIGHTS_REVIEW", rightsBytes)
    || input.manifest.source.privacyReviewHash
      !== networkQuarantineSourceReviewFileHash("PRIVACY_REVIEW", privacyBytes)
    || input.payload.cohortCommitmentHash !== response.providerRefHash
    || input.payload.censusSlotCommitmentHash !== adoptionHash
    || input.payload.eligibilityRuleHash !== semanticsHash
    || input.payload.assignmentPolicyHash !== standingHash
    || input.payload.instrumentPlanHash !== input.manifest.source.instrumentHash
    || input.payload.externalTimeAnchorHash !== null
    || input.payload.prospectiveRegistrationEstablishedAtNetworkEdge !== false
    || input.payload.scientificCensusCompletenessEstablishedAtNetworkEdge
      !== false
    || input.manifest.subject.claimHash !== tender.workOrderHash
    || input.manifest.subject.wayHash
      !== accountableActorReplay.envelope.bindings.claimWayWorld.wayHash
    || input.manifest.subject.worldHash
      !== accountableActorReplay.envelope.bindings.claimWayWorld.worldHash
    || input.manifest.subject.episodeHash
      !== tender.typedGraph.episode.episodeHash
    || input.manifest.subject.attemptHash
      !== tender.typedGraph.attempt.attemptHash
    || input.manifest.subject.actorIdentityEnvelopeHash
      !== accountableActorReplay.envelope.actorIdentityEnvelopeHash
    || input.manifest.subject.accountableDeploymentSubjectHash
      !== tender.typedGraph.accountableDeployment.accountableDeploymentSubjectHash
    || input.manifest.subject.attemptActorSubjectHash
      !== tender.typedGraph.attempt.attemptActorSubjectHash
    || input.manifest.subject.cohortHash !== response.providerRefHash
    || input.manifest.subject.censusSlotHash !== adoptionHash
    || input.manifest.payload.objectIdentityHash
      === input.manifest.occurrenceIdentityHash
    || input.receipt.objectAlreadyPresent !== true
      && input.receipt.objectAlreadyPresent !== false
    || input.receipt.occurrenceRecorded !== true
    || input.receipt.networkDenominatorIncremented !== true
    || !same(input.receipt.useBoundary, NETWORK_INTAKE_BOUNDARY)) {
    fail("NETWORK_INTAKE_OWNER_OCCURRENCE_BINDING_MISMATCH");
  }
  return {
    manifestHash: input.manifest.manifestHash,
    receiptHash: input.receipt.receiptHash,
    objectIdentityHash: input.manifest.payload.objectIdentityHash,
    occurrenceIdentityHash: input.manifest.occurrenceIdentityHash,
    objectAlreadyPresent: input.receipt.objectAlreadyPresent,
  };
}

const SOURCE_FIELDS = ObjectFreeze([
  "tender", "expectedTenderHash", "accountableIdentityReplay",
  "ownerIdentityReplay", "oneUseResponseReplay", "externalStandingReplay",
  "registryContext", "expectedRegistryContextHash", "semanticsSourceBytes",
  "expectedSemanticsSourceHash", "adoptionSourceBytes",
  "expectedAdoptionSourceHash", "lifecycleEventSourceBytes",
  "expectedLifecycleEventSourceHashes", "expectedLifecycleEventCount",
  "lifecycleHeadSourceBytes", "expectedLifecycleHeadSourceHash",
  "rightsReviewSourceBytes", "expectedRightsReviewSourceHash",
  "privacyReviewSourceBytes", "expectedPrivacyReviewSourceHash",
  "networkIntakeReplay", "observedAt",
]);

const RESPONSE_REPLAY_FIELDS = ObjectFreeze([
  "responses", "occurrences", "expectedOccurrenceCount",
  "expectedLifecycleHeadHash",
]);
const EXTERNAL_STANDING_REPLAY_FIELDS = ObjectFreeze([
  "verifierContext", "expectedVerifierContextHash", "standingSourceBytes",
  "expectedStandingSourceHash",
]);

function buildReplay(untrustedSource) {
  const preflight = clonePreflight(untrustedSource);
  const source = preflight.clone;
  exactObject(source, SOURCE_FIELDS, "SOURCE");
  const observedAt = instant(source.observedAt, "OBSERVED_AT");

  const tenderCheck = verifyOutsiderOutcomeTenderV1(source.tender, {
    expectedTenderHash: source.expectedTenderHash,
  });
  if (!tenderCheck.ok || tenderCheck.typedGraphReferencesPreserved !== true
    || tenderCheck.authorizationEstablished !== false
    || tenderCheck.decisionState !== "HOLD") fail("TENDER_SOURCE_REPLAY_FAILED");

  const accountableIdentity = replayIdentity(source.accountableIdentityReplay,
    "ACCOUNTABLE");
  const ownerIdentity = replayIdentity(source.ownerIdentityReplay, "OWNER");
  bindTypedGraph(source.tender, source.accountableIdentityReplay);

  exactObject(source.oneUseResponseReplay, RESPONSE_REPLAY_FIELDS,
    "ONE_USE_RESPONSE_REPLAY");
  const response = verifyOneUseTenderResponseLifecycleV1({
    tender: source.tender,
    expectedTenderHash: source.expectedTenderHash,
    responses: source.oneUseResponseReplay.responses,
    occurrences: source.oneUseResponseReplay.occurrences,
    expectedOccurrenceCount:
      source.oneUseResponseReplay.expectedOccurrenceCount,
    expectedLifecycleHeadHash:
      source.oneUseResponseReplay.expectedLifecycleHeadHash,
    observedAt,
  });
  if (!response.ok || response.tenderSourceReplayed !== true
    || response.typedGraphAndEpisodeBoundExactly !== true
    || response.capacityReserved !== false || response.authority !== "NONE") {
    fail("ONE_USE_RESPONSE_SOURCE_REPLAY_FAILED");
  }

  exactObject(source.externalStandingReplay, EXTERNAL_STANDING_REPLAY_FIELDS,
    "EXTERNAL_STANDING_REPLAY");
  const externalContextCheck = verifyExternalCapacityVerifierContextV1(
    source.externalStandingReplay.verifierContext, {
      expectedVerifierContextHash:
        source.externalStandingReplay.expectedVerifierContextHash,
    });
  if (!externalContextCheck.ok) fail("EXTERNAL_CONTEXT_SOURCE_REPLAY_FAILED");
  if (externalContextCheck.context.rightsPrivacyPolicyRefHash
      !== source.tender.authorizationBinding.rightsPrivacyPolicyRefHash) {
    fail("EXTERNAL_CONTEXT_RIGHTS_PRIVACY_BINDING_MISMATCH");
  }
  const externalStandingEnvelope = canonicalEnvelope(
    source.externalStandingReplay.standingSourceBytes,
    source.externalStandingReplay.expectedStandingSourceHash,
    "EXTERNAL_STANDING_SOURCE");
  verifyExternalStandingSignature(externalStandingEnvelope,
    externalContextCheck.context);
  const externalStanding = verifyExternalStandingPayload(
    externalStandingEnvelope.value.payload, externalContextCheck.context,
    response, observedAt);

  const context = checkedContext(source.registryContext,
    source.expectedRegistryContextHash);
  const semanticsEnvelope = canonicalEnvelope(source.semanticsSourceBytes,
    source.expectedSemanticsSourceHash, "SEMANTICS_SOURCE");
  verifySignature(semanticsEnvelope, context, "SEMANTICS", "SEMANTICS_SOURCE");
  verifySemantics(semanticsEnvelope.value.payload, context, observedAt);

  const adoptionEnvelope = canonicalEnvelope(source.adoptionSourceBytes,
    source.expectedAdoptionSourceHash, "ADOPTION_SOURCE");
  verifySignature(adoptionEnvelope, context, "ADOPTION", "ADOPTION_SOURCE");
  const adoption = verifyAdoption(adoptionEnvelope.value.payload, context,
    semanticsEnvelope.hash, source.tender, response, externalStanding,
    externalStandingEnvelope.hash, source.ownerIdentityReplay);

  const rightsEnvelope = canonicalEnvelope(source.rightsReviewSourceBytes,
    source.expectedRightsReviewSourceHash, "RIGHTS_REVIEW_SOURCE");
  verifySignature(rightsEnvelope, context, "RIGHTS_REVIEW",
    "RIGHTS_REVIEW_SOURCE");
  const rightsReview = verifyReview(rightsEnvelope.value.payload, context,
    adoptionEnvelope.hash,
    source.tender, observedAt, "RIGHTS_REVIEW");
  const privacyEnvelope = canonicalEnvelope(source.privacyReviewSourceBytes,
    source.expectedPrivacyReviewSourceHash, "PRIVACY_REVIEW_SOURCE");
  verifySignature(privacyEnvelope, context, "PRIVACY_REVIEW",
    "PRIVACY_REVIEW_SOURCE");
  const privacyReview = verifyReview(privacyEnvelope.value.payload, context,
    adoptionEnvelope.hash,
    source.tender, observedAt, "PRIVACY_REVIEW");

  const eventReplay = verifyLifecycleEvents(source.lifecycleEventSourceBytes,
    source.expectedLifecycleEventSourceHashes,
    source.expectedLifecycleEventCount, context, adoption, adoptionEnvelope.hash);
  const headEnvelope = canonicalEnvelope(source.lifecycleHeadSourceBytes,
    source.expectedLifecycleHeadSourceHash, "LIFECYCLE_HEAD_SOURCE");
  verifySignature(headEnvelope, context, "LIFECYCLE_HEAD",
    "LIFECYCLE_HEAD_SOURCE");
  const head = verifyLifecycleHead(headEnvelope.value.payload, context, adoption,
    adoptionEnvelope.hash, eventReplay, rightsEnvelope.hash,
    privacyEnvelope.hash, observedAt);

  const intake = verifyIntake(source.networkIntakeReplay,
    source.semanticsSourceBytes, source.adoptionSourceBytes,
    source.rightsReviewSourceBytes, source.privacyReviewSourceBytes,
    semanticsEnvelope.hash, adoptionEnvelope.hash,
    externalStandingEnvelope.hash, eventReplay.genesisEventSourceHash,
    eventReplay.genesisOccurredAt, response, source.tender,
    source.accountableIdentityReplay);

  const externalStandingCurrent = DateParse(externalStanding.validFrom)
      <= DateParse(observedAt)
    && DateParse(observedAt) < DateParse(externalStanding.validUntil);
  const sourceDeclaredCurrent = head.currentState === "ADOPTED"
    && response.currentCallerDeclaredOneUseOfferReference === true
    && externalStandingCurrent
    && DateParse(observedAt) >= DateParse(adoption.adoptedAt)
    && DateParse(observedAt) < DateParse(adoption.validUntil)
    && rightsReview.currentAtObservedAt
    && privacyReview.currentAtObservedAt;
  const body = {
    schema: OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.replay,
    schemaVersion: "1.0.0",
    ok: true,
    strongestState:
      "SOURCE_DECLARATIONS_REPLAYED_EXTERNAL_OWNER_TRUST_ROOT_UNESTABLISHED_HOLD",
    tenderHash: source.tender.tenderHash,
    typedGraphHash: source.tender.typedGraph.typedGraphHash,
    principalEpochProjectionHash:
      source.tender.typedGraph.principalEpoch.principalEpochProjectionHash,
    accountableDeploymentSubjectHash:
      source.tender.typedGraph.accountableDeployment.accountableDeploymentSubjectHash,
    runtimeInstanceHash: source.tender.typedGraph.runtime.runtimeInstanceHash,
    embodimentRevisionHash:
      source.tender.typedGraph.embodiment.embodimentRevisionHash,
    delegationEdgeHash: source.tender.typedGraph.delegation.delegationEdgeHash,
    episodeHash: source.tender.typedGraph.episode.episodeHash,
    attemptHash: source.tender.typedGraph.attempt.attemptHash,
    accountableActorIdentityEnvelopeHash:
      accountableIdentity.actorIdentityEnvelopeHash,
    ownerActorIdentityEnvelopeHash: ownerIdentity.actorIdentityEnvelopeHash,
    resourceOwnerRefHash: externalStanding.resourceOwnerRefHash,
    providerRefHash: response.providerRefHash,
    scopeHash: response.scopeHash,
    oneUseResponseHash: response.initialResponseHash,
    oneUseResponseLifecycleHeadHash: response.lifecycleHeadHash,
    externalStandingSourceHash: externalStandingEnvelope.hash,
    registryContextHash: context.contextHash,
    registryRefHash: context.registryRefHash,
    sourceSystemRefHash: context.sourceSystemRefHash,
    semanticsSourceHash: semanticsEnvelope.hash,
    adoptionSourceHash: adoptionEnvelope.hash,
    rightsReviewSourceHash: rightsEnvelope.hash,
    privacyReviewSourceHash: privacyEnvelope.hash,
    lifecycleHeadSourceHash: headEnvelope.hash,
    preActionRegistrationReferenceHash: eventReplay.genesisEventSourceHash,
    preActionRegistrationGenesisOccurredAt: eventReplay.genesisOccurredAt,
    lifecycleEventCount: eventReplay.eventCount,
    lifecycleDistinctObjectCount: eventReplay.distinctObjectCount,
    networkIntakeManifestHash: intake.manifestHash,
    networkIntakeReceiptHash: intake.receiptHash,
    callerScopedNetworkObjectIdentityHash: intake.objectIdentityHash,
    callerScopedNetworkOccurrenceIdentityHash: intake.occurrenceIdentityHash,
    callerScopedReceiptDeclaredObjectAlreadyPresent: intake.objectAlreadyPresent,
    observedAt,
    exactSourceBufferCount: preflight.budget.buffers,
    exactSourceByteCount: preflight.budget.bytes,
    aggregateArrayElementCount: preflight.budget.arrayElements,
    rawSourceReplayPerformed: true,
    tenderSourceReplayed: true,
    accountableIdentityReferenceGraphReplayed: true,
    ownerIdentityReferenceGraphReplayed: true,
    typedGraphPathBoundExactly: true,
    ipAddressAcceptedAsIdentity: false,
    deviceAddressAcceptedAsIdentity: false,
    baseModelAcceptedAsIdentity: false,
    globalScoreCreated: false,
    oneUseResponseLifecycleReplayed: true,
    externalStandingExactBytesReplayed: true,
    externalStandingSignatureVerifiedForPinnedSource: true,
    externalStandingCurrentAtObservedAt: externalStandingCurrent,
    externalStandingSignatureEstablishedOwnerIdentity: false,
    ownerRegistrySemanticsExactBytesReplayed: true,
    ownerAdoptionExactBytesReplayed: true,
    ownerRegistrySignaturesVerifiedForPinnedSource: true,
    appendOnlyLifecycleReplayed: true,
    preActionRegistrationGenesisEventReplayed: true,
    preActionRegistrationPrecededIntakeManifestAndReceipt: true,
    currentLifecycleHeadReplayedSeparatelyFromPreActionRegistration: true,
    lifecycleOccurrenceDenominatorReplayed: true,
    lifecycleObjectDedupReducedOccurrenceDenominator: false,
    signedLifecycleHeadReplayedAndCallerPinned: true,
    lifecycleHeadFreshAtObservedAt: true,
    sourceDeclaredOwnerStandingCurrent: sourceDeclaredCurrent,
    rightsReviewExactBytesReplayed: true,
    privacyReviewExactBytesReplayed: true,
    rightsReviewCurrentAtObservedAt: rightsReview.currentAtObservedAt,
    privacyReviewCurrentAtObservedAt: privacyReview.currentAtObservedAt,
    rightsReviewKindSeparatedHashReplayed: true,
    privacyReviewKindSeparatedHashReplayed: true,
    rightsReviewSemanticsAdjudicated: false,
    privacyReviewSemanticsAdjudicated: false,
    rightsEstablished: false,
    privacyEstablished: false,
    networkIntakeChainSourceReplayed: false,
    callerScopedNetworkTransportConsistencyChecked: true,
    callerScopedReceiptSignatureConsistentWithCallerProvidedServerKey: true,
    callerScopedNetworkIntakeDisposition: "QUARANTINED",
    networkIntakeOwnerStandingLaneAvailable: false,
    prospectiveCensusLaneUsedForOccurrenceOnly: true,
    networkIntakeServerTrustPolicyExternallyPinned: false,
    networkIntakeAudienceExternallyPinned: false,
    networkOccurrenceRecorded: false,
    externalNetworkCensusEvidenceEstablished: false,
    occurrenceCensusSeparatedFromObjectDedup: true,
    networkLifecycleSingleEventMembershipProofEstablished: false,
    externalTransparencyAnchorEstablished: false,
    sourceNonEquivocationEstablished: false,
    sourceCompletenessBeyondPinnedHeadEstablished: false,
    independentResourceOwnerTrustAnchorReplayed: false,
    resourceOwnerLegalIdentityEstablished: false,
    resourceOwnerStandingEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    authorityEstablished: false,
    pricePresent: false,
    pricingPermitted: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    providerContactPerformed: false,
    networkRequestPerformed: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    result:
      "SOURCE_DECLARATIONS_REPLAYED_EXTERNAL_OWNER_TRUST_ROOT_UNESTABLISHED_HOLD",
    error: null,
    boundary: OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, replayHash: digest(
    OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.replay, body) });
}

function failure(error) {
  const message = error instanceof ErrorConstructor
    && RegExpTest(/^OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_[A-Z0-9_]+$/u,
      StringConstructor(error.message))
    ? error.message : `${PREFIX}UNTRUSTED_FAILURE`;
  return deepFreeze({
    schema: OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_SCHEMAS.replay,
    schemaVersion: "1.0.0",
    ok: false,
    strongestState:
      "SOURCE_DECLARATIONS_NOT_REPLAYED_OWNER_TRUST_HOLD",
    rawSourceReplayPerformed: false,
    typedGraphPathBoundExactly: false,
    ownerIdentityReferenceGraphReplayed: false,
    lifecycleOccurrenceDenominatorReplayed: false,
    signedLifecycleHeadReplayedAndCallerPinned: false,
    preActionRegistrationGenesisEventReplayed: false,
    preActionRegistrationPrecededIntakeManifestAndReceipt: false,
    currentLifecycleHeadReplayedSeparatelyFromPreActionRegistration: false,
    rightsReviewExactBytesReplayed: false,
    privacyReviewExactBytesReplayed: false,
    networkIntakeChainSourceReplayed: false,
    callerScopedNetworkTransportConsistencyChecked: false,
    callerScopedReceiptSignatureConsistentWithCallerProvidedServerKey: false,
    networkOccurrenceRecorded: false,
    externalNetworkCensusEvidenceEstablished: false,
    independentResourceOwnerTrustAnchorReplayed: false,
    resourceOwnerLegalIdentityEstablished: false,
    resourceOwnerStandingEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    authorityEstablished: false,
    pricePresent: false,
    pricingPermitted: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilityCount: 0,
    provenAuthorityCount: 0,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    result: "SOURCE_DECLARATIONS_NOT_REPLAYED_OWNER_TRUST_HOLD",
    replayHash: null,
    error: message,
    boundary: OUTSIDER_RESOURCE_OWNER_STANDING_TRUST_REPLAY_V1_BOUNDARY,
  });
}

/** Rebuild a HOLD replay from raw source records and exact source bytes. */
export function createResourceOwnerStandingTrustReplayV1(source = {}) {
  return buildReplay(source);
}

/**
 * Verification never accepts a previously derived replay as evidence. It
 * rebuilds from the full raw source input, then matches the caller pin.
 */
export function verifyResourceOwnerStandingTrustReplayV1(source = {},
  expectedReplayHash = null) {
  try {
    const expected = hash(expectedReplayHash, "EXPECTED_REPLAY_HASH");
    const rebuilt = buildReplay(source);
    if (rebuilt.replayHash !== expected) fail("EXPECTED_REPLAY_HASH_MISMATCH");
    return rebuilt;
  } catch (error) {
    return failure(error);
  }
}
