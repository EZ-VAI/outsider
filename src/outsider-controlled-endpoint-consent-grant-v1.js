/*
 * Controlled endpoint consent grant v1.
 *
 * This is the consent-contract half of a future durable transaction lane. It
 * replays one exact Ed25519-signed statement that a controller, under a
 * caller-pinned lane key, consents to receive one exact tender-slot payload.
 * It performs no I/O and grants no legal-owner authority, provider acceptance,
 * capacity, standing, price, promise, or action authority.
 */

import { Buffer } from "node:buffer";
import {
  createHash,
  createPublicKey,
  verify as cryptoVerify,
} from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";

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
const HashPrototype = Object.getPrototypeOf(createHash("sha256"));
const HashDigest = Function.prototype.call.bind(HashPrototype.digest);
const HashUpdate = Function.prototype.call.bind(HashPrototype.update);
const JSONParse = JSON.parse;
const NumberIsFinite = Number.isFinite;
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
const RegExpTest = Function.prototype.call.bind(RegExp.prototype.test);
const SetAdd = Function.prototype.call.bind(Set.prototype.add);
const SetConstructor = Set;
const SetDelete = Function.prototype.call.bind(Set.prototype.delete);
const SetHas = Function.prototype.call.bind(Set.prototype.has);
const StringConstructor = String;
const TypeErrorConstructor = TypeError;

const PREFIX = "OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const PRIVATE_NONCE = /^[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const STRICT_BASE64
  = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const MAX_SINGLE_SOURCE_BYTES = 256 * 1024;
const MAX_AGGREGATE_SOURCE_BYTES = 512 * 1024;
const MAX_SINGLE_STRING_BYTES = 64 * 1024;
const MAX_AGGREGATE_STRING_BYTES = 256 * 1024;
const MAX_TREE_NODES = 4_096;
const MAX_TREE_KEYS = 16_384;
const MAX_TREE_DEPTH = 32;
const MAX_GRANT_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
const REQUIREMENT_KINDS = ObjectFreeze([
  "RESOURCE", "EVIDENCE", "RECOVERY",
]);
const ALLOWED_OPERATIONS = ObjectFreeze([
  "ONE_USE_TENDER_SUBMIT", "DELIVERY_STATUS_READ",
]);

export const OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_SCHEMAS
  = ObjectFreeze({
    laneProfile: "outsider/controlled-endpoint-lane-profile/v1",
    grant: "outsider/controlled-endpoint-consent-grant/v1",
    replay: "outsider/controlled-endpoint-consent-grant-source-replay/v1",
  });

export const OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_LIMITS
  = ObjectFreeze({
    maximumSingleSourceBytes: MAX_SINGLE_SOURCE_BYTES,
    maximumAggregateSourceBytes: MAX_AGGREGATE_SOURCE_BYTES,
    maximumGrantWindowMs: MAX_GRANT_WINDOW_MS,
    maximumTreeNodes: MAX_TREE_NODES,
    maximumTreeKeys: MAX_TREE_KEYS,
    maximumTreeDepth: MAX_TREE_DEPTH,
  });

function fail(code) {
  throw new TypeErrorConstructor(`${PREFIX}${code}`);
}

function append(array, value) {
  ObjectDefineProperty(array, StringConstructor(array.length), {
    value, enumerable: true, writable: true, configurable: true,
  });
  return array;
}

function deepFreeze(value, seen = new SetConstructor()) {
  if (value === null || typeof value !== "object" || BufferIsBuffer(value)
    || ObjectIsFrozen(value) || SetHas(seen, value)) return value;
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

function sha256Bytes(value) {
  const state = createHash("sha256");
  HashUpdate(state, value);
  return `sha256:${HashDigest(state, "hex")}`;
}

function digest(domain, value) {
  return sha256Bytes(BufferFrom(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function frozenLaneProfile() {
  const body = {
    schema:
      OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_SCHEMAS.laneProfile,
    schemaVersion: "1.0.0",
    profileCode: "CONTROLLED_CONSENTING_ENDPOINT_JSON_V1",
    transportFamily: "CONTROLLED_CONSENTING_ENDPOINT",
    sourceSpecificAdapterRequired: true,
    fixedAtModuleRevision: true,
    perOrderTargetSelectionAccepted: false,
    perOrderTransportOverrideAccepted: false,
    interactiveAutomationSurfaceAccepted: false,
    ambientAuthorityMaterialAccepted: false,
    requestSchemaHash: sha256Bytes(BufferFrom(
      "outsider/controlled-endpoint-tender-request/v1", "utf8")),
    receiptSchemaHash: sha256Bytes(BufferFrom(
      "outsider/controlled-endpoint-delivery-receipt/v1", "utf8")),
    lifecycleSchemaHash: sha256Bytes(BufferFrom(
      "outsider/durable-one-use-endpoint-effect-event/v1", "utf8")),
    exactAllowedOperations: ALLOWED_OPERATIONS,
    maximumAcceptedTenderObjectsPerGrant: 1,
    strictFiniteResponseGrammarRequired: true,
    transportAcknowledgementIsAcceptance: false,
    deliveryReceiptIsAcceptance: false,
    naturalLanguageAcceptedAsConsent: false,
    supplyMembershipCreated: false,
    standingCreated: false,
    actionEnabled: false,
  };
  return deepFreeze({ ...body, laneProfileHash: digest(
    OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_SCHEMAS.laneProfile,
    body) });
}

export const OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1
  = frozenLaneProfile();

export const OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_BOUNDARY
  = deepFreeze({
    position: "CALLER_PINNED_LANE_CONSENT_SOURCE_REPLAY_HOLD_ONLY",
    sourceSpecificLaneProfileFrozen: true,
    exactOneTenderSlotRequired: true,
    exactCanonicalSignedSourceBytesRequired: true,
    signatureAlgorithm: "ED25519",
    callerPinnedTrustRootScope: "LANE_CONTROLLER_ONLY",
    callerPinEstablishesLegalOwnerIdentity: false,
    callerPinEstablishesResourceOwnerAuthority: false,
    laneConsentEstablishesProviderAcceptance: false,
    laneConsentEstablishesCapacity: false,
    laneConsentCreatesStanding: false,
    laneConsentEnablesTenderSubmission: false,
    rawSourceProjected: false,
    privateBindingHandlesProjected: false,
    perOrderExecutionSurfaceAccepted: false,
    ambientAuthorityMaterialAccepted: false,
    supplyDirectoryCreated: false,
    liveIoPerformed: false,
    endpointContactPerformed: false,
    enabledCapabilities: ObjectFreeze([]),
    provenAuthorityCapabilities: ObjectFreeze([]),
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    resourceOwnerAuthorityEstablished: false,
    providerAcceptance: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    standingCreated: false,
    priceEstablished: false,
    userOutcomePromiseIssued: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  });

function clonePreflight(untrusted) {
  const active = new SetConstructor();
  const budget = { nodes: 0, keys: 0, bytes: 0, strings: 0 };

  function visit(value, depth) {
    if (depth > MAX_TREE_DEPTH) fail("SOURCE_TREE_TOO_DEEP");
    if ((typeof value === "object" && value !== null)
      || typeof value === "function") {
      if (isProxy(value)) fail("SOURCE_PROXY_FORBIDDEN");
    }
    if (typeof value === "string") {
      const bytes = BufferByteLength(value, "utf8");
      if (bytes > MAX_SINGLE_STRING_BYTES) fail("SOURCE_STRING_TOO_LARGE");
      budget.strings += bytes;
      if (budget.strings > MAX_AGGREGATE_STRING_BYTES) {
        fail("SOURCE_STRING_BUDGET_EXCEEDED");
      }
      return value;
    }
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!NumberIsSafeInteger(value)) fail("SOURCE_NUMBER_INVALID");
      return value;
    }
    if (typeof value !== "object") fail("SOURCE_VALUE_TYPE_FORBIDDEN");
    if (SetHas(active, value)) fail("SOURCE_CYCLE_FORBIDDEN");
    SetAdd(active, value);
    budget.nodes += 1;
    if (budget.nodes > MAX_TREE_NODES) fail("SOURCE_NODE_BUDGET_EXCEEDED");

    if (BufferIsBuffer(value)) {
      if (value.length > MAX_SINGLE_SOURCE_BYTES) {
        fail("SOURCE_BUFFER_TOO_LARGE");
      }
      budget.bytes += value.length;
      if (budget.bytes > MAX_AGGREGATE_SOURCE_BYTES) {
        fail("SOURCE_BUFFER_BUDGET_EXCEEDED");
      }
      const copy = BufferFrom(value);
      SetDelete(active, value);
      return copy;
    }

    const array = ArrayIsArray(value);
    const prototype = ObjectGetPrototypeOf(value);
    if (prototype !== (array ? ArrayPrototype : ObjectPrototype)
      && prototype !== null) fail("SOURCE_NON_PLAIN_OBJECT_FORBIDDEN");
    const keys = ReflectOwnKeys(value);
    budget.keys += keys.length;
    if (budget.keys > MAX_TREE_KEYS) fail("SOURCE_KEY_BUDGET_EXCEEDED");
    if (array) {
      const lengthDescriptor = ObjectGetOwnPropertyDescriptor(value, "length");
      if (!lengthDescriptor || !ObjectHasOwn(lengthDescriptor, "value")
        || !NumberIsSafeInteger(lengthDescriptor.value)
        || lengthDescriptor.value < 0
        || keys.length !== lengthDescriptor.value + 1
        || keys[keys.length - 1] !== "length") {
        fail("SOURCE_ARRAY_SHAPE_INVALID");
      }
      const result = [];
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        if (keys[index] !== StringConstructor(index)) {
          fail("SOURCE_ARRAY_SHAPE_INVALID");
        }
        const descriptor = ObjectGetOwnPropertyDescriptor(value, keys[index]);
        if (!descriptor || !ObjectHasOwn(descriptor, "value")
          || descriptor.enumerable !== true) {
          fail("SOURCE_ARRAY_DESCRIPTOR_INVALID");
        }
        append(result, visit(descriptor.value, depth + 1));
      }
      SetDelete(active, value);
      return result;
    }
    const result = ObjectCreate(ObjectPrototype);
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
      if (typeof key !== "string" || key === "__proto__"
        || key === "prototype" || key === "constructor" || !descriptor
        || !ObjectHasOwn(descriptor, "value")
        || descriptor.enumerable !== true) {
        fail("SOURCE_OBJECT_FIELD_INVALID");
      }
      ObjectDefineProperty(result, key, {
        value: visit(descriptor.value, depth + 1),
        enumerable: true, writable: true, configurable: true,
      });
    }
    SetDelete(active, value);
    return result;
  }

  return { source: visit(untrusted, 0), budget };
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || ArrayIsArray(value)
    || BufferIsBuffer(value) || isProxy(value)) fail(`${code}_OBJECT_REQUIRED`);
  const prototype = ObjectGetPrototypeOf(value);
  if (prototype !== ObjectPrototype && prototype !== null) {
    fail(`${code}_PROTOTYPE_INVALID`);
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    const descriptor = ObjectGetOwnPropertyDescriptor(value, key);
    let allowed = false;
    for (let fieldIndex = 0; fieldIndex < fields.length; fieldIndex += 1) {
      if (key === fields[fieldIndex]) allowed = true;
    }
    if (typeof key !== "string" || !allowed || !descriptor
      || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
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
  if (typeof value !== "string" || !RegExpTest(UTC_INSTANT, value)) {
    fail(`${code}_INVALID`);
  }
  const parsed = DateParse(value);
  if (!NumberIsFinite(parsed)
    || DateToISOString(new DateConstructor(parsed)) !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function requirementKind(value) {
  for (let index = 0; index < REQUIREMENT_KINDS.length; index += 1) {
    if (value === REQUIREMENT_KINDS[index]) return value;
  }
  fail("REQUIREMENT_KIND_INVALID");
}

function exactOperations(value) {
  if (!ArrayIsArray(value) || ObjectGetPrototypeOf(value) !== ArrayPrototype
    || value.length !== ALLOWED_OPERATIONS.length) {
    fail("ALLOWED_OPERATIONS_INVALID");
  }
  const keys = ReflectOwnKeys(value);
  if (keys.length !== value.length + 1 || keys[keys.length - 1] !== "length") {
    fail("ALLOWED_OPERATIONS_INVALID");
  }
  const result = [];
  for (let index = 0; index < ALLOWED_OPERATIONS.length; index += 1) {
    const descriptor = ObjectGetOwnPropertyDescriptor(value,
      StringConstructor(index));
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || descriptor.enumerable !== true
      || descriptor.value !== ALLOWED_OPERATIONS[index]) {
      fail("ALLOWED_OPERATIONS_INVALID");
    }
    append(result, descriptor.value);
  }
  return result;
}

const GRANT_FIELDS = ObjectFreeze([
  "schema", "schemaVersion", "grantIdHash", "laneProfileHash",
  "controllerKeyIdHash", "tenderHash", "typedGraphHash", "episodeHash",
  "attemptHash", "requirementKind", "requirementId",
  "requirementObjectHash", "resourceOwnerRefHash", "providerRefHash",
  "requestBodyHash", "oneUseNonceHash", "idempotencyKeyHash",
  "allowedOperations", "consentPurpose", "maxAcceptedTenderObjects",
  "validFrom", "expiresAt", "formationDeadline", "termsRevisionHash",
  "issuedAt",
]);

function normalizeGrantPayload(untrusted) {
  const payload = clonePreflight(untrusted).source;
  exactObject(payload, GRANT_FIELDS, "GRANT_PAYLOAD");
  if (payload.schema
      !== OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_SCHEMAS.grant
    || payload.schemaVersion !== "1.0.0"
    || payload.laneProfileHash
      !== OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1.laneProfileHash
    || payload.consentPurpose !== "RECEIVE_EXACT_TENDER_ONLY"
    || payload.maxAcceptedTenderObjects !== 1) {
    fail("GRANT_SEMANTICS_INVALID");
  }
  const issuedAt = instant(payload.issuedAt, "GRANT_ISSUED_AT");
  const validFrom = instant(payload.validFrom, "GRANT_VALID_FROM");
  const expiresAt = instant(payload.expiresAt, "GRANT_EXPIRES_AT");
  const formationDeadline = instant(payload.formationDeadline,
    "GRANT_FORMATION_DEADLINE");
  if (DateParse(issuedAt) > DateParse(validFrom)
    || DateParse(validFrom) >= DateParse(expiresAt)
    || DateParse(expiresAt) > DateParse(formationDeadline)
    || DateParse(expiresAt) - DateParse(validFrom) > MAX_GRANT_WINDOW_MS) {
    fail("GRANT_VALIDITY_INVALID");
  }
  return {
    schema: payload.schema,
    schemaVersion: payload.schemaVersion,
    grantIdHash: hash(payload.grantIdHash, "GRANT_ID_HASH"),
    laneProfileHash: payload.laneProfileHash,
    controllerKeyIdHash: hash(payload.controllerKeyIdHash,
      "CONTROLLER_KEY_ID_HASH"),
    tenderHash: hash(payload.tenderHash, "TENDER_HASH"),
    typedGraphHash: hash(payload.typedGraphHash, "TYPED_GRAPH_HASH"),
    episodeHash: hash(payload.episodeHash, "EPISODE_HASH"),
    attemptHash: hash(payload.attemptHash, "ATTEMPT_HASH"),
    requirementKind: requirementKind(payload.requirementKind),
    requirementId: token(payload.requirementId, "REQUIREMENT_ID"),
    requirementObjectHash: hash(payload.requirementObjectHash,
      "REQUIREMENT_OBJECT_HASH"),
    resourceOwnerRefHash: hash(payload.resourceOwnerRefHash,
      "RESOURCE_OWNER_REF_HASH"),
    providerRefHash: hash(payload.providerRefHash, "PROVIDER_REF_HASH"),
    requestBodyHash: hash(payload.requestBodyHash, "REQUEST_BODY_HASH"),
    oneUseNonceHash: hash(payload.oneUseNonceHash, "ONE_USE_NONCE_HASH"),
    idempotencyKeyHash: hash(payload.idempotencyKeyHash,
      "IDEMPOTENCY_KEY_HASH"),
    allowedOperations: exactOperations(payload.allowedOperations),
    consentPurpose: payload.consentPurpose,
    maxAcceptedTenderObjects: payload.maxAcceptedTenderObjects,
    validFrom,
    expiresAt,
    formationDeadline,
    termsRevisionHash: hash(payload.termsRevisionHash, "TERMS_REVISION_HASH"),
    issuedAt,
  };
}

/** Exact domain-separated bytes signed by the lane controller. */
export function controlledEndpointConsentGrantSigningMessageV1(payload = {}) {
  const normalized = normalizeGrantPayload(payload);
  return BufferFrom(
    `outsider/controlled-endpoint-consent-grant/v1\0${canonicalizeStrict(normalized)}`,
    "utf8");
}

function publicKeyMaterial(publicKeyPem, expectedKeyIdHash) {
  if (typeof publicKeyPem !== "string"
    || BufferByteLength(publicKeyPem, "utf8") > 16_384) {
    fail("CONTROLLER_PUBLIC_KEY_INVALID");
  }
  let key;
  try { key = createPublicKey(publicKeyPem); }
  catch { fail("CONTROLLER_PUBLIC_KEY_INVALID"); }
  if (key.asymmetricKeyType !== "ed25519") {
    fail("CONTROLLER_PUBLIC_KEY_NOT_ED25519");
  }
  const keyIdHash = sha256Bytes(key.export({ type: "spki", format: "der" }));
  if (keyIdHash !== hash(expectedKeyIdHash,
    "EXPECTED_CONTROLLER_KEY_ID_HASH")) {
    fail("CONTROLLER_KEY_ID_PIN_MISMATCH");
  }
  return { key, keyIdHash };
}

function signatureBytes(value) {
  if (typeof value !== "string" || value.length !== 88
    || !RegExpTest(STRICT_BASE64, value)) fail("GRANT_SIGNATURE_INVALID");
  const bytes = BufferFrom(value, "base64");
  if (bytes.length !== 64 || BufferToString(bytes, "base64") !== value) {
    fail("GRANT_SIGNATURE_INVALID");
  }
  return bytes;
}

const SOURCE_FIELDS = ObjectFreeze([
  "controllerPublicKeyPem", "expectedControllerKeyIdHash",
  "grantSourceBytes", "expectedGrantSourceHash", "observedAt",
  "privateProjectionNonce",
]);

function canonicalGrantEnvelope(bytes, expectedHash) {
  if (!BufferIsBuffer(bytes) || bytes.length < 2
    || bytes.length > MAX_SINGLE_SOURCE_BYTES) fail("GRANT_SOURCE_BYTES_INVALID");
  const copy = BufferFrom(bytes);
  if (sha256Bytes(copy)
    !== hash(expectedHash, "EXPECTED_GRANT_SOURCE_HASH")) {
    fail("GRANT_SOURCE_HASH_PIN_MISMATCH");
  }
  const text = BufferToString(copy, "utf8");
  if (!BufferEquals(BufferFrom(text, "utf8"), copy)) {
    fail("GRANT_SOURCE_UTF8_INVALID");
  }
  let envelope;
  try { envelope = JSONParse(text); }
  catch { fail("GRANT_SOURCE_JSON_INVALID"); }
  if (canonicalizeStrict(envelope) !== text) {
    fail("GRANT_SOURCE_NOT_EXACT_CANONICAL_BYTES");
  }
  exactObject(envelope, ["payload", "signature"], "GRANT_ENVELOPE");
  return { envelope, copy };
}

function buildReplay(untrustedSource) {
  const preflight = clonePreflight(untrustedSource);
  const source = preflight.source;
  exactObject(source, SOURCE_FIELDS, "SOURCE");
  const observedAt = instant(source.observedAt, "OBSERVED_AT");
  if (typeof source.privateProjectionNonce !== "string"
    || !RegExpTest(PRIVATE_NONCE, source.privateProjectionNonce)) {
    fail("PRIVATE_PROJECTION_NONCE_INVALID");
  }
  const material = publicKeyMaterial(source.controllerPublicKeyPem,
    source.expectedControllerKeyIdHash);
  const grantEnvelope = canonicalGrantEnvelope(source.grantSourceBytes,
    source.expectedGrantSourceHash);
  const payload = normalizeGrantPayload(grantEnvelope.envelope.payload);
  if (payload.controllerKeyIdHash !== material.keyIdHash) {
    fail("GRANT_CONTROLLER_KEY_BINDING_MISMATCH");
  }
  if (!cryptoVerify(null,
    controlledEndpointConsentGrantSigningMessageV1(payload), material.key,
    signatureBytes(grantEnvelope.envelope.signature))) {
    fail("GRANT_SIGNATURE_VERIFICATION_FAILED");
  }
  if (DateParse(observedAt) < DateParse(payload.issuedAt)) {
    fail("GRANT_OBSERVED_BEFORE_ISSUED");
  }
  const current = DateParse(observedAt) >= DateParse(payload.validFrom)
    && DateParse(observedAt) < DateParse(payload.expiresAt);
  const saltedPrivateSourceCommitmentHash = digest(
    "outsider/controlled-endpoint-consent-private-source/v1", {
      privateProjectionNonce: source.privateProjectionNonce,
      controllerKeyIdHash: material.keyIdHash,
      grantSourceHash: source.expectedGrantSourceHash,
      grantIdHash: payload.grantIdHash,
      resourceOwnerRefHash: payload.resourceOwnerRefHash,
      providerRefHash: payload.providerRefHash,
      requestBodyHash: payload.requestBodyHash,
      oneUseNonceHash: payload.oneUseNonceHash,
      idempotencyKeyHash: payload.idempotencyKeyHash,
      termsRevisionHash: payload.termsRevisionHash,
    });
  const body = {
    schema: OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_SCHEMAS.replay,
    schemaVersion: "1.0.0",
    ok: true,
    strongestState:
      "CALLER_PINNED_LANE_RECEIVE_CONSENT_SOURCE_REPLAYED_HOLD",
    laneProfile: {
      profileCode:
        OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1.profileCode,
      laneProfileHash:
        OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_LANE_PROFILE_V1.laneProfileHash,
      sourceSpecificAdapterRequired: true,
      maximumAcceptedTenderObjectsPerGrant: 1,
    },
    tenderSlotBinding: {
      tenderHash: payload.tenderHash,
      typedGraphHash: payload.typedGraphHash,
      episodeHash: payload.episodeHash,
      attemptHash: payload.attemptHash,
      requirementKind: payload.requirementKind,
      requirementId: payload.requirementId,
      requirementObjectHash: payload.requirementObjectHash,
    },
    consentPurpose: payload.consentPurpose,
    allowedOperations: payload.allowedOperations,
    maxAcceptedTenderObjects: 1,
    observedAt,
    validFrom: payload.validFrom,
    expiresAt: payload.expiresAt,
    formationDeadline: payload.formationDeadline,
    exactSourceByteCount: grantEnvelope.copy.length,
    sourceOccurrenceCount: 1,
    distinctSourceObjectCount: 1,
    exactSourceReplayPerformed: true,
    exactCanonicalSourceBytesReplayed: true,
    ed25519SignatureVerified: true,
    callerPinnedLaneTrustRootMatched: true,
    callerPinnedTrustRootScope: "LANE_CONTROLLER_ONLY",
    trustRootIndependentlyEstablished: false,
    sourceDeclaredLaneConsentCurrentAtObservedAt: current,
    callerPinnedLaneScopedReceiveConsentCurrent: current,
    sourceDeclaredConsentMintsLegalOwnerAuthority: false,
    sourceDeclaredConsentMintsActionAuthority: false,
    deliveryAcknowledgementAcceptedAsProviderAcceptance: false,
    rawSourceProjected: false,
    controllerKeyProjected: false,
    privateBindingHandlesProjected: false,
    saltedPrivateSourceCommitmentHash,
    liveIoPerformed: false,
    endpointContactPerformed: false,
    tenderSubmitted: false,
    enabledCapabilities: [],
    provenAuthorityCapabilities: [],
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    resourceOwnerLegalIdentityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    providerAcceptance: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    standingCreated: false,
    priceEstablished: false,
    userOutcomePromiseIssued: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, replayHash: digest(
    OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_SCHEMAS.replay, body) });
}

function safeError(error) {
  try {
    if (error === null || typeof error !== "object" || isProxy(error)) {
      return `${PREFIX}UNTRUSTED_FAILURE`;
    }
    const descriptor = ObjectGetOwnPropertyDescriptor(error, "message");
    if (!descriptor || !ObjectHasOwn(descriptor, "value")
      || typeof descriptor.value !== "string"
      || descriptor.value.length > 256
      || !descriptor.value.startsWith(PREFIX)) {
      return `${PREFIX}UNTRUSTED_FAILURE`;
    }
    return descriptor.value;
  } catch { return `${PREFIX}UNTRUSTED_FAILURE`; }
}

function failure(error) {
  return deepFreeze({
    schema: OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_SCHEMAS.replay,
    schemaVersion: "1.0.0",
    ok: false,
    strongestState: "CONSENT_SOURCE_NOT_REPLAYED_HOLD",
    error: safeError(error),
    exactSourceReplayPerformed: false,
    ed25519SignatureVerified: false,
    callerPinnedLaneTrustRootMatched: false,
    sourceDeclaredLaneConsentCurrentAtObservedAt: false,
    callerPinnedLaneScopedReceiveConsentCurrent: false,
    rawSourceProjected: false,
    privateBindingHandlesProjected: false,
    liveIoPerformed: false,
    endpointContactPerformed: false,
    tenderSubmitted: false,
    enabledCapabilities: [],
    provenAuthorityCapabilities: [],
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    resourceOwnerLegalIdentityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    providerAcceptance: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    standingCreated: false,
    priceEstablished: false,
    userOutcomePromiseIssued: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    replayHash: null,
    boundary: OUTSIDER_CONTROLLED_ENDPOINT_CONSENT_GRANT_V1_BOUNDARY,
  });
}

/** Create a HOLD-only public projection from exact private source bytes. */
export function createControlledEndpointConsentGrantSourceReplayV1(
  source = {}) {
  return buildReplay(source);
}

/** Verification always rebuilds from raw source and matches one caller pin. */
export function verifyControlledEndpointConsentGrantSourceReplayV1(
  source = {}, expectedReplayHash = null) {
  try {
    const expected = hash(expectedReplayHash, "EXPECTED_REPLAY_HASH");
    const replay = buildReplay(source);
    if (replay.replayHash !== expected) {
      fail("EXPECTED_REPLAY_HASH_MISMATCH");
    }
    return replay;
  } catch (error) {
    return failure(error);
  }
}

