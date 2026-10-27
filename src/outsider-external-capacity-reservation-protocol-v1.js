/*
 * External capacity-reservation protocol v1.
 *
 * This is the narrow protocol seam after an exact, source-replayed OFFERED
 * response. A buyer request binds the frozen tender graph, provider/resource
 * slot, exact quantity and service window, one-use nonce, request expiry, and
 * a seller-published resource-owner source. A seller-side Ed25519 capability
 * can emit an exact RESERVED lifecycle and terminal REVOKED/EXPIRED
 * descendants. The buyer verifier replays every source byte and occurrence.
 *
 * A self-signed owner source proves only cryptographic continuity with that
 * source. It does not prove legal owner identity, owner authority, capacity
 * truth, permission to act, price, guarantee, settlement, or outcome. Thus a
 * verified protocol can report SOURCE_DECLARED_CAPACITY_RESERVED while the
 * authoritative capacityReserved field remains false until a separately
 * trusted owner-adoption/root path is replayed.
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as cryptoSign,
  verify as cryptoVerify,
} from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import { verifyOneUseTenderResponseLifecycleV1 }
  from "./outsider-one-use-tender-response-lifecycle-v1.js";

const PREFIX = "OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const STRICT_BASE64
  = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
const SIGNERS = new WeakMap();
const MAX_SOURCE_BYTES = 512 * 1024;
const MAX_LIFECYCLE_EVENTS = 2;

export const OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS
  = Object.freeze({
    ownerSource: "outsider/external-capacity-resource-owner-source/v1",
    ownerSourceProjection:
      "outsider/external-capacity-resource-owner-source-projection/v1",
    request: "outsider/external-capacity-reservation-request/v1",
    receipt: "outsider/external-capacity-reservation-receipt/v1",
    lifecycleEvent:
      "outsider/external-capacity-reservation-lifecycle-event/v1",
    lifecycleHead:
      "outsider/external-capacity-reservation-lifecycle-head/v1",
    sourceBundleManifest:
      "outsider/external-capacity-reservation-source-bundle-manifest/v1",
    emission: "outsider/external-capacity-reservation-emission/v1",
    verification: "outsider/external-capacity-reservation-verification/v1",
  });

export const OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_STATES
  = Object.freeze(["CAPACITY_RESERVED", "REVOKED", "EXPIRED"]);

export const OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_EVENT_GENESIS_V1
  = `sha256:${createHash("sha256")
    .update("outsider/external-capacity-reservation-event/genesis/v1", "utf8")
    .digest("hex")}`;

export const OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_BOUNDARY
  = Object.freeze({
    position:
      "EXACT_OWNER_SOURCE_DECLARED_CAPACITY_RESERVATION_PROTOCOL_HOLD_ONLY",
    exactOfferedResponseReplayRequired: true,
    signedOfferIsCapacityReservation: false,
    exactTenderTypedGraphEpisodeAttemptBound: true,
    exactProviderResourceSlotQuantityAndWindowBound: true,
    ownerSourceHashAndKeyBound: true,
    oneUseReservationNonceRequired: true,
    appendOnlyReservationLifecycleRequired: true,
    revocationAndExpirySupported: true,
    completeOccurrenceDenominatorRequired: true,
    sellerPrivateKeyProjected: false,
    sellerOwnerSourceSelfSignatureVerified: true,
    selfSignedOwnerSourceEstablishesLegalIdentity: false,
    selfSignedOwnerSourceEstablishesOwnerAuthority: false,
    sellerSignatureEstablishesCapacityTruth: false,
    independentOwnerTrustAnchorReplayed: false,
    externalNonEquivocationEstablished: false,
    sourceCompletenessBeyondPinnedHeadEstablished: false,
    durableOneUseReleaseProvidedByThisModule: false,
    networkIoPerformed: false,
    providerRegistryRequired: false,
    humanQueueCreated: false,
    internalHumanFallbackPermitted: false,
    paymentPerformed: false,
    pricePresent: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${code}_OBJECT_INVALID`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length) fail(`${code}_FIELDS_INVALID`);
  for (let index = 0; index < fields.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, fields[index]);
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function denseArray(value, code, minimum = 1, maximum = MAX_LIFECYCLE_EVENTS) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length < minimum || value.length > maximum) {
    fail(`${code}_INVALID`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== value.length + 1) {
    fail(`${code}_INVALID`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !Object.hasOwn(descriptor, "value")
      || descriptor.enumerable !== true) fail(`${code}_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function token(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function safeInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function allowed(value, values, code) {
  if (!values.includes(value)) fail(`${code}_INVALID`);
  return value;
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256Bytes(Buffer.from(
    `${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function publicKey(publicKeyPem, expectedKeyId, code) {
  if (typeof publicKeyPem !== "string"
    || Buffer.byteLength(publicKeyPem, "utf8") > 16_384) {
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

function signingMessage(kind, payload) {
  const selected = allowed(kind,
    ["OWNER_SOURCE", "RECEIPT", "LIFECYCLE_EVENT", "LIFECYCLE_HEAD"],
    "SIGNING_KIND");
  return Buffer.from(
    `outsider/external-capacity-reservation/${selected.toLowerCase()}/v1\0${canonicalizeStrict(payload)}`,
    "utf8");
}

export function externalCapacityReservationSigningMessageV1(kind, payload) {
  return signingMessage(kind, payload);
}

function signedSource(kind, payload, state) {
  const signature = cryptoSign(null, signingMessage(kind, payload),
    state.privateKey);
  return Buffer.from(canonicalizeStrict({
    payload,
    signature: {
      algorithm: "ED25519",
      keyId: state.ownerKeyId,
      valueBase64: signature.toString("base64"),
    },
  }), "utf8");
}

function sourceEnvelope(bytes, expectedHash, code) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2
    || bytes.length > MAX_SOURCE_BYTES) fail(`${code}_BYTES_INVALID`);
  const copy = Buffer.from(bytes);
  if (sha256Bytes(copy) !== hash(expectedHash, `${code}_EXPECTED_HASH`)) {
    fail(`${code}_HASH_PIN_MISMATCH`);
  }
  const text = copy.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(copy)) fail(`${code}_UTF8_INVALID`);
  let value;
  try { value = JSON.parse(text); } catch { fail(`${code}_JSON_INVALID`); }
  exactObject(value, ["payload", "signature"], `${code}_ENVELOPE`);
  if (canonicalizeStrict(value) !== text) fail(`${code}_NOT_CANONICAL_JSON`);
  return { bytes: copy, hash: sha256Bytes(copy), value };
}

function verifySignature(envelope, key, keyId, kind, code) {
  exactObject(envelope.value.signature,
    ["algorithm", "keyId", "valueBase64"], `${code}_SIGNATURE`);
  const signature = envelope.value.signature;
  if (signature.algorithm !== "ED25519" || signature.keyId !== keyId
    || typeof signature.valueBase64 !== "string"
    || !STRICT_BASE64.test(signature.valueBase64)) {
    fail(`${code}_SIGNATURE_INVALID`);
  }
  const signatureBytes = Buffer.from(signature.valueBase64, "base64");
  if (signatureBytes.length !== 64
    || signatureBytes.toString("base64") !== signature.valueBase64
    || !cryptoVerify(null, signingMessage(kind, envelope.value.payload), key,
      signatureBytes)) fail(`${code}_SIGNATURE_INVALID`);
}

const OWNER_SOURCE_FIELDS = Object.freeze([
  "schema", "schemaVersion", "recordClass", "sourceSystemRefHash",
  "resourceOwnerRefHash", "providerRefHash", "ownerSourceRevisionHash",
  "rightsPrivacyPolicyRefHash", "ownerPublicKeyPem", "ownerKeyId", "issuedAt",
  "validFrom", "validUntil", "maximumLifecycleHeadAgeMs", "sourceState",
  "selfSignatureEstablishesLegalOwnerIdentity",
  "selfSignatureEstablishesOwnerAuthority", "capacityReserved", "authority",
]);

function verifyOwnerSource(bytes, expectedHash, observedAt = null) {
  const envelope = sourceEnvelope(bytes, expectedHash, "OWNER_SOURCE");
  const payload = envelope.value.payload;
  exactObject(payload, OWNER_SOURCE_FIELDS, "OWNER_SOURCE_PAYLOAD");
  if (payload.schema
      !== OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.ownerSource
    || payload.schemaVersion !== "1.0.0"
    || payload.recordClass !== "SELLER_PUBLISHED_RESOURCE_OWNER_SOURCE"
    || payload.sourceState !== "SOURCE_DECLARED_ACTIVE"
    || payload.selfSignatureEstablishesLegalOwnerIdentity !== false
    || payload.selfSignatureEstablishesOwnerAuthority !== false
    || payload.capacityReserved !== false || payload.authority !== "NONE") {
    fail("OWNER_SOURCE_FIXED_STATE_INVALID");
  }
  hash(payload.sourceSystemRefHash, "OWNER_SOURCE_SYSTEM_REF_HASH");
  hash(payload.resourceOwnerRefHash, "RESOURCE_OWNER_REF_HASH");
  hash(payload.providerRefHash, "OWNER_PROVIDER_REF_HASH");
  hash(payload.ownerSourceRevisionHash, "OWNER_SOURCE_REVISION_HASH");
  hash(payload.rightsPrivacyPolicyRefHash, "OWNER_RIGHTS_PRIVACY_POLICY_REF_HASH");
  const material = publicKey(payload.ownerPublicKeyPem, payload.ownerKeyId,
    "OWNER_SOURCE");
  const issuedAt = instant(payload.issuedAt, "OWNER_SOURCE_ISSUED_AT");
  const validFrom = instant(payload.validFrom, "OWNER_SOURCE_VALID_FROM");
  const validUntil = instant(payload.validUntil, "OWNER_SOURCE_VALID_UNTIL");
  if (Date.parse(validUntil) <= Date.parse(validFrom)
    || Date.parse(issuedAt) > Date.parse(validFrom)) {
    fail("OWNER_SOURCE_VALIDITY_INVALID");
  }
  safeInteger(payload.maximumLifecycleHeadAgeMs, 0, 86_400_000,
    "OWNER_SOURCE_MAXIMUM_HEAD_AGE_MS");
  if (observedAt !== null) {
    const at = instant(observedAt, "OWNER_SOURCE_OBSERVED_AT");
    if (Date.parse(at) < Date.parse(validFrom)
      || Date.parse(at) >= Date.parse(validUntil)) {
      fail("OWNER_SOURCE_NOT_CURRENT");
    }
  }
  verifySignature(envelope, material.key, material.keyId, "OWNER_SOURCE",
    "OWNER_SOURCE");
  return { envelope, payload, key: material.key };
}

const SIGNER_INPUT_FIELDS = Object.freeze([
  "sellerOwnerPrivateKeyPem", "sourceSystemRefHash", "resourceOwnerRefHash",
  "providerRefHash", "ownerSourceRevisionHash", "rightsPrivacyPolicyRefHash",
  "issuedAt", "validFrom", "validUntil", "maximumLifecycleHeadAgeMs",
]);

export function createSellerOwnedCapacityReservationSignerV1(input = {}) {
  exactObject(input, SIGNER_INPUT_FIELDS, "SIGNER_INPUT");
  if (typeof input.sellerOwnerPrivateKeyPem !== "string"
    || Buffer.byteLength(input.sellerOwnerPrivateKeyPem, "utf8") > 16_384) {
    fail("SELLER_OWNER_PRIVATE_KEY_INVALID");
  }
  let privateKey;
  try { privateKey = createPrivateKey(input.sellerOwnerPrivateKeyPem); }
  catch { fail("SELLER_OWNER_PRIVATE_KEY_INVALID"); }
  if (privateKey.asymmetricKeyType !== "ed25519") {
    fail("SELLER_OWNER_PRIVATE_KEY_NOT_ED25519");
  }
  const derivedPublicKey = createPublicKey(privateKey);
  const ownerPublicKeyPem = derivedPublicKey.export({
    type: "spki", format: "pem",
  });
  const ownerKeyId = sha256Bytes(derivedPublicKey.export({
    type: "spki", format: "der",
  }));
  const issuedAt = instant(input.issuedAt, "OWNER_SOURCE_ISSUED_AT");
  const validFrom = instant(input.validFrom, "OWNER_SOURCE_VALID_FROM");
  const validUntil = instant(input.validUntil, "OWNER_SOURCE_VALID_UNTIL");
  if (Date.parse(validUntil) <= Date.parse(validFrom)
    || Date.parse(issuedAt) > Date.parse(validFrom)) {
    fail("OWNER_SOURCE_VALIDITY_INVALID");
  }
  const state = {
    privateKey,
    ownerKeyId,
    resourceOwnerRefHash: hash(input.resourceOwnerRefHash,
      "RESOURCE_OWNER_REF_HASH"),
    providerRefHash: hash(input.providerRefHash, "PROVIDER_REF_HASH"),
  };
  const ownerPayload = {
    schema:
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.ownerSource,
    schemaVersion: "1.0.0",
    recordClass: "SELLER_PUBLISHED_RESOURCE_OWNER_SOURCE",
    sourceSystemRefHash: hash(input.sourceSystemRefHash,
      "SOURCE_SYSTEM_REF_HASH"),
    resourceOwnerRefHash: state.resourceOwnerRefHash,
    providerRefHash: state.providerRefHash,
    ownerSourceRevisionHash: hash(input.ownerSourceRevisionHash,
      "OWNER_SOURCE_REVISION_HASH"),
    rightsPrivacyPolicyRefHash: hash(input.rightsPrivacyPolicyRefHash,
      "RIGHTS_PRIVACY_POLICY_REF_HASH"),
    ownerPublicKeyPem,
    ownerKeyId,
    issuedAt,
    validFrom,
    validUntil,
    maximumLifecycleHeadAgeMs: safeInteger(
      input.maximumLifecycleHeadAgeMs, 0, 86_400_000,
      "MAXIMUM_LIFECYCLE_HEAD_AGE_MS"),
    sourceState: "SOURCE_DECLARED_ACTIVE",
    selfSignatureEstablishesLegalOwnerIdentity: false,
    selfSignatureEstablishesOwnerAuthority: false,
    capacityReserved: false,
    authority: "NONE",
  };
  const ownerSourceBytes = signedSource("OWNER_SOURCE", ownerPayload, state);
  const ownerSourceHash = sha256Bytes(ownerSourceBytes);
  const signer = Object.freeze({
    schema:
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS
        .ownerSourceProjection,
    ownerSourceHash,
    resourceOwnerRefHash: state.resourceOwnerRefHash,
    providerRefHash: state.providerRefHash,
    ownerKeyId,
    privateKeyProjected: false,
    authority: "NONE",
  });
  SIGNERS.set(signer, { ...state, ownerSourceHash,
    ownerSourceBytes: Buffer.from(ownerSourceBytes), ownerPayload });
  return {
    signer,
    ownerSourceBytes: Buffer.from(ownerSourceBytes),
    publicProjection: Object.freeze({
      schema:
        OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS
          .ownerSourceProjection,
      ownerSourceHash,
      sourceSystemRefHash: ownerPayload.sourceSystemRefHash,
      resourceOwnerRefHash: ownerPayload.resourceOwnerRefHash,
      providerRefHash: ownerPayload.providerRefHash,
      ownerKeyId,
      validFrom,
      validUntil,
      sellerPrivateKeyProjected: false,
      selfSignedOwnerSourceEstablishesOwnerAuthority: false,
      capacityReserved: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
    }),
  };
}

function signerState(signer) {
  if (signer === null || typeof signer !== "object" || !SIGNERS.has(signer)) {
    fail("SIGNER_CAPABILITY_INVALID");
  }
  return SIGNERS.get(signer);
}

const REQUEST_SOURCE_FIELDS = Object.freeze([
  "tender", "expectedTenderHash", "responses", "responseOccurrences",
  "expectedResponseOccurrenceCount", "expectedResponseLifecycleHeadHash",
  "ownerSourceBytes", "expectedOwnerSourceHash", "requestedAt",
  "requestExpiresAt", "reservationNonceHash",
]);

const REQUEST_FIELDS = Object.freeze([
  "schema", "schemaVersion", "recordClass", "tenderHash", "typedGraphHash",
  "episodeHash", "networkCompleteEpisodeJoinHash", "attemptHash",
  "offerResponseHash", "offerLifecycleHeadHash", "offerResponseNonceHash",
  "providerRefHash", "discoveryRouteObjectHash", "discoveryCandidateHash",
  "resourceOwnerRefHash", "ownerSourceHash", "ownerSourceKeyId", "scopeHash",
  "requirementKind", "requirementId", "requirementSetHash",
  "requirementObjectHash", "requirementClassCode", "requirementScopeRefHash",
  "quantity", "unitCode", "regionRefHash", "dueBy", "quantitySemantics",
  "serviceFrom", "serviceUntil", "evidencePlanHash", "remedyPlanHash",
  "reservationNonceHash", "requestedAt", "requestExpiresAt", "oneUseOnly",
  "signedOfferIsCapacityReservation", "ownerSourceEstablishesAuthority",
  "capacityReserved", "paymentPermitted", "decisionState", "authority",
  "actionReady", "executable", "reservationRequestHash",
]);

function offerReplay(source, observedAt) {
  return verifyOneUseTenderResponseLifecycleV1({
    tender: source.tender,
    expectedTenderHash: source.expectedTenderHash,
    responses: source.responses,
    occurrences: source.responseOccurrences,
    expectedOccurrenceCount: source.expectedResponseOccurrenceCount,
    expectedLifecycleHeadHash: source.expectedResponseLifecycleHeadHash,
    observedAt,
  });
}

export function createExternalCapacityReservationRequestV1(source = {}) {
  exactObject(source, REQUEST_SOURCE_FIELDS, "REQUEST_SOURCE");
  const requestedAt = instant(source.requestedAt, "REQUESTED_AT");
  const offer = offerReplay(source, requestedAt);
  if (!offer.ok || offer.currentResponseState !== "OFFERED"
    || offer.currentCallerDeclaredOneUseOfferReference !== true
    || offer.capacityReserved !== false || offer.authority !== "NONE") {
    fail("CURRENT_SOURCE_REPLAYED_OFFER_REQUIRED");
  }
  const owner = verifyOwnerSource(source.ownerSourceBytes,
    source.expectedOwnerSourceHash, requestedAt);
  if (owner.payload.providerRefHash !== offer.providerRefHash) {
    fail("OWNER_SOURCE_PROVIDER_MISMATCH");
  }
  if (Date.parse(owner.payload.validUntil) < Date.parse(offer.serviceUntil)) {
    fail("OWNER_SOURCE_DOES_NOT_COVER_SERVICE_WINDOW");
  }
  const requestExpiresAt = instant(source.requestExpiresAt,
    "REQUEST_EXPIRES_AT");
  if (Date.parse(requestExpiresAt) <= Date.parse(requestedAt)
    || Date.parse(requestExpiresAt) > Date.parse(offer.offerExpiresAt)
    || Date.parse(requestExpiresAt) > Date.parse(offer.serviceFrom)) {
    fail("REQUEST_WINDOW_INVALID");
  }
  const initial = source.responses[0];
  if (initial === null || typeof initial !== "object") {
    fail("INITIAL_OFFER_RESPONSE_INVALID");
  }
  const body = {
    schema: OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.request,
    schemaVersion: "1.0.0",
    recordClass: "BUYER_REQUEST_FOR_EXACT_EXTERNAL_CAPACITY_RESERVATION",
    tenderHash: offer.tenderHash,
    typedGraphHash: offer.typedGraphHash,
    episodeHash: offer.episodeHash,
    networkCompleteEpisodeJoinHash: offer.networkCompleteEpisodeJoinHash,
    attemptHash: offer.attemptHash,
    offerResponseHash: offer.initialResponseHash,
    offerLifecycleHeadHash: offer.lifecycleHeadHash,
    offerResponseNonceHash: hash(initial.responseNonceHash,
      "OFFER_RESPONSE_NONCE_HASH"),
    providerRefHash: offer.providerRefHash,
    discoveryRouteObjectHash: offer.discoveryRouteObjectHash,
    discoveryCandidateHash: offer.discoveryCandidateHash,
    resourceOwnerRefHash: owner.payload.resourceOwnerRefHash,
    ownerSourceHash: owner.envelope.hash,
    ownerSourceKeyId: owner.payload.ownerKeyId,
    scopeHash: offer.scopeHash,
    requirementKind: offer.requirementKind,
    requirementId: offer.requirementId,
    requirementSetHash: offer.requirementSetHash,
    requirementObjectHash: offer.requirementObjectHash,
    requirementClassCode: offer.requirementClassCode,
    requirementScopeRefHash: offer.requirementScopeRefHash,
    quantity: offer.quantity,
    unitCode: offer.unitCode,
    regionRefHash: offer.regionRefHash,
    dueBy: offer.dueBy,
    quantitySemantics: offer.quantitySemantics,
    serviceFrom: offer.serviceFrom,
    serviceUntil: offer.serviceUntil,
    evidencePlanHash: offer.evidencePlanHash,
    remedyPlanHash: offer.remedyPlanHash,
    reservationNonceHash: hash(source.reservationNonceHash,
      "RESERVATION_NONCE_HASH"),
    requestedAt,
    requestExpiresAt,
    oneUseOnly: true,
    signedOfferIsCapacityReservation: false,
    ownerSourceEstablishesAuthority: false,
    capacityReserved: false,
    paymentPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return Object.freeze({ ...body, reservationRequestHash: digest(
    OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.request,
    body) });
}

function rebuildRequest(request, requestSource) {
  exactObject(request, REQUEST_FIELDS, "RESERVATION_REQUEST");
  const rebuilt = createExternalCapacityReservationRequestV1(requestSource);
  if (!same(request, rebuilt)) fail("RESERVATION_REQUEST_REBUILD_FAILED");
  return rebuilt;
}

function reservationBindings(request) {
  return {
    reservationRequestHash: request.reservationRequestHash,
    tenderHash: request.tenderHash,
    typedGraphHash: request.typedGraphHash,
    episodeHash: request.episodeHash,
    networkCompleteEpisodeJoinHash: request.networkCompleteEpisodeJoinHash,
    attemptHash: request.attemptHash,
    offerResponseHash: request.offerResponseHash,
    offerLifecycleHeadHash: request.offerLifecycleHeadHash,
    offerResponseNonceHash: request.offerResponseNonceHash,
    providerRefHash: request.providerRefHash,
    resourceOwnerRefHash: request.resourceOwnerRefHash,
    ownerSourceHash: request.ownerSourceHash,
    ownerSourceKeyId: request.ownerSourceKeyId,
    scopeHash: request.scopeHash,
    requirementKind: request.requirementKind,
    requirementId: request.requirementId,
    requirementSetHash: request.requirementSetHash,
    requirementObjectHash: request.requirementObjectHash,
    requirementClassCode: request.requirementClassCode,
    requirementScopeRefHash: request.requirementScopeRefHash,
    quantity: request.quantity,
    unitCode: request.unitCode,
    regionRefHash: request.regionRefHash,
    quantitySemantics: request.quantitySemantics,
    serviceFrom: request.serviceFrom,
    serviceUntil: request.serviceUntil,
    reservationNonceHash: request.reservationNonceHash,
  };
}

const EMISSION_INPUT_FIELDS = Object.freeze([
  "request", "requestSource", "reservationReceiptId", "lifecycleStreamId",
  "reservedAt", "headObservedAt", "occurrenceNonceHash",
]);
const RECEIPT_FIELDS = Object.freeze([
  "schema", "schemaVersion", "recordClass", "sourceSystemRefHash",
  "reservationReceiptId", "lifecycleStreamId", "reservationRequestHash",
  "tenderHash", "typedGraphHash", "episodeHash",
  "networkCompleteEpisodeJoinHash", "attemptHash", "offerResponseHash",
  "offerLifecycleHeadHash", "offerResponseNonceHash", "providerRefHash",
  "resourceOwnerRefHash", "ownerSourceHash", "ownerSourceKeyId", "scopeHash",
  "requirementKind", "requirementId", "requirementSetHash",
  "requirementObjectHash", "requirementClassCode", "requirementScopeRefHash",
  "quantity", "unitCode", "regionRefHash", "quantitySemantics",
  "serviceFrom", "serviceUntil", "reservationNonceHash", "reservedAt",
  "reservationExpiresAt", "reservationState",
  "sourceDeclarationEstablishesOwnerAuthority",
  "sourceDeclarationEstablishesCapacityTruth", "authority",
]);
const EVENT_FIELDS = Object.freeze([
  "schema", "schemaVersion", "sourceSystemRefHash", "lifecycleStreamId",
  "reservationReceiptSourceHash", "reservationRequestHash", "tenderHash",
  "offerResponseHash", "providerRefHash", "resourceOwnerRefHash",
  "ownerSourceHash", "scopeHash", "requirementKind", "requirementId",
  "quantity", "unitCode", "serviceFrom", "serviceUntil",
  "reservationNonceHash", "ordinal", "previousEventSourceHash", "eventState",
  "occurredAt", "occurrenceNonceHash",
]);
const HEAD_FIELDS = Object.freeze([
  "schema", "schemaVersion", "sourceSystemRefHash", "lifecycleStreamId",
  "reservationReceiptSourceHash", "reservationRequestHash", "tenderHash",
  "offerResponseHash", "providerRefHash", "resourceOwnerRefHash",
  "ownerSourceHash", "scopeHash", "eventCount", "coveredFromOrdinal",
  "coveredToOrdinal", "headEventSourceHash", "currentState", "observedAt",
  "occurrencePolicy",
]);

function bundleProjection(request, receiptHash, eventHashes, headHash,
  currentState) {
  const manifestBody = {
    schema:
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS
        .sourceBundleManifest,
    schemaVersion: "1.0.0",
    reservationRequestHash: request.reservationRequestHash,
    tenderHash: request.tenderHash,
    offerResponseHash: request.offerResponseHash,
    providerRefHash: request.providerRefHash,
    resourceOwnerRefHash: request.resourceOwnerRefHash,
    ownerSourceHash: request.ownerSourceHash,
    scopeHash: request.scopeHash,
    requirementKind: request.requirementKind,
    requirementId: request.requirementId,
    quantity: request.quantity,
    unitCode: request.unitCode,
    serviceFrom: request.serviceFrom,
    serviceUntil: request.serviceUntil,
    reservationNonceHash: request.reservationNonceHash,
    reservationReceiptSourceHash: receiptHash,
    lifecycleEventSourceHashes: eventHashes,
    lifecycleHeadSourceHash: headHash,
    exactSourceDocumentCount: 2 + eventHashes.length,
    currentSourceDeclaredState: currentState,
    independentOwnerTrustAnchorReplayed: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    decisionState: "HOLD",
    authority: "NONE",
  };
  return Object.freeze({ ...manifestBody, sourceBundleManifestHash: digest(
    OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS
      .sourceBundleManifest, manifestBody) });
}

export function createSellerOwnedCapacityReservationBundleV1(
  signer, input = {}) {
  const state = signerState(signer);
  exactObject(input, EMISSION_INPUT_FIELDS, "EMISSION_INPUT");
  const request = rebuildRequest(input.request, input.requestSource);
  if (request.ownerSourceHash !== state.ownerSourceHash
    || request.ownerSourceKeyId !== state.ownerKeyId
    || request.resourceOwnerRefHash !== state.resourceOwnerRefHash
    || request.providerRefHash !== state.providerRefHash) {
    fail("REQUEST_NOT_BOUND_TO_SELLER_OWNER_SOURCE");
  }
  const reservedAt = instant(input.reservedAt, "RESERVED_AT");
  const headObservedAt = instant(input.headObservedAt, "HEAD_OBSERVED_AT");
  if (Date.parse(reservedAt) < Date.parse(request.requestedAt)
    || Date.parse(reservedAt) >= Date.parse(request.requestExpiresAt)
    || Date.parse(reservedAt) > Date.parse(request.serviceFrom)
    || Date.parse(headObservedAt) < Date.parse(reservedAt)) {
    fail("RESERVATION_ISSUANCE_TIME_INVALID");
  }
  const bindings = reservationBindings(request);
  const receiptPayload = {
    schema: OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.receipt,
    schemaVersion: "1.0.0",
    recordClass: "SELLER_OWNER_SOURCE_DECLARED_EXACT_CAPACITY_RESERVATION",
    sourceSystemRefHash: state.ownerPayload.sourceSystemRefHash,
    reservationReceiptId: token(input.reservationReceiptId,
      "RESERVATION_RECEIPT_ID"),
    lifecycleStreamId: token(input.lifecycleStreamId, "LIFECYCLE_STREAM_ID"),
    ...bindings,
    reservedAt,
    reservationExpiresAt: request.serviceUntil,
    reservationState: "CAPACITY_RESERVED",
    sourceDeclarationEstablishesOwnerAuthority: false,
    sourceDeclarationEstablishesCapacityTruth: false,
    authority: "NONE",
  };
  const reservationReceiptSourceBytes = signedSource("RECEIPT",
    receiptPayload, state);
  const receiptHash = sha256Bytes(reservationReceiptSourceBytes);
  const eventPayload = {
    schema:
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.lifecycleEvent,
    schemaVersion: "1.0.0",
    sourceSystemRefHash: state.ownerPayload.sourceSystemRefHash,
    lifecycleStreamId: receiptPayload.lifecycleStreamId,
    reservationReceiptSourceHash: receiptHash,
    reservationRequestHash: request.reservationRequestHash,
    tenderHash: request.tenderHash,
    offerResponseHash: request.offerResponseHash,
    providerRefHash: request.providerRefHash,
    resourceOwnerRefHash: request.resourceOwnerRefHash,
    ownerSourceHash: request.ownerSourceHash,
    scopeHash: request.scopeHash,
    requirementKind: request.requirementKind,
    requirementId: request.requirementId,
    quantity: request.quantity,
    unitCode: request.unitCode,
    serviceFrom: request.serviceFrom,
    serviceUntil: request.serviceUntil,
    reservationNonceHash: request.reservationNonceHash,
    ordinal: 1,
    previousEventSourceHash:
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_EVENT_GENESIS_V1,
    eventState: "CAPACITY_RESERVED",
    occurredAt: reservedAt,
    occurrenceNonceHash: hash(input.occurrenceNonceHash,
      "OCCURRENCE_NONCE_HASH"),
  };
  const lifecycleEventSourceBytes = [signedSource("LIFECYCLE_EVENT",
    eventPayload, state)];
  const eventHash = sha256Bytes(lifecycleEventSourceBytes[0]);
  const headPayload = {
    schema:
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.lifecycleHead,
    schemaVersion: "1.0.0",
    sourceSystemRefHash: state.ownerPayload.sourceSystemRefHash,
    lifecycleStreamId: receiptPayload.lifecycleStreamId,
    reservationReceiptSourceHash: receiptHash,
    reservationRequestHash: request.reservationRequestHash,
    tenderHash: request.tenderHash,
    offerResponseHash: request.offerResponseHash,
    providerRefHash: request.providerRefHash,
    resourceOwnerRefHash: request.resourceOwnerRefHash,
    ownerSourceHash: request.ownerSourceHash,
    scopeHash: request.scopeHash,
    eventCount: 1,
    coveredFromOrdinal: 1,
    coveredToOrdinal: 1,
    headEventSourceHash: eventHash,
    currentState: "CAPACITY_RESERVED",
    observedAt: headObservedAt,
    occurrencePolicy:
      "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR",
  };
  const lifecycleHeadSourceBytes = signedSource("LIFECYCLE_HEAD", headPayload,
    state);
  const manifest = bundleProjection(request, receiptHash, [eventHash],
    sha256Bytes(lifecycleHeadSourceBytes), "CAPACITY_RESERVED");
  const emissionBody = {
    schema:
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.emission,
    schemaVersion: "1.0.0",
    recordClass: "SELLER_OWNER_SOURCE_DECLARED_RESERVATION_EMISSION",
    sourceBundleManifest: manifest,
    sourceDeclaredCapacityReservationCurrent: true,
    signedOfferAloneWouldSatisfyReservationProtocol: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    durableOneUseReleaseEstablished: false,
    paymentPerformed: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    boundary: OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_BOUNDARY,
  };
  return {
    sourceBundle: {
      reservationReceiptSourceBytes: Buffer.from(
        reservationReceiptSourceBytes),
      lifecycleEventSourceBytes:
        lifecycleEventSourceBytes.map((bytes) => Buffer.from(bytes)),
      lifecycleHeadSourceBytes: Buffer.from(lifecycleHeadSourceBytes),
    },
    publicProjection: Object.freeze({ ...emissionBody, emissionHash: digest(
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.emission,
      emissionBody) }),
  };
}

function verificationFailure(error) {
  const message = error instanceof Error
    && /^OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_[A-Z0-9_]+$/u
      .test(String(error.message))
    ? error.message : `${PREFIX}UNTRUSTED_FAILURE`;
  return Object.freeze({
    schema:
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.verification,
    ok: false,
    exactOfferAndRequestReplayed: false,
    ownerSourceSelfSignatureVerified: false,
    reservationReceiptSignatureVerified: false,
    lifecycleOccurrenceDenominatorReplayed: false,
    sourceDeclaredCapacityReservationCurrent: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    error: message,
    boundary: OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_BOUNDARY,
  });
}

const VERIFY_INPUT_FIELDS = Object.freeze([
  "request", "requestSource", "reservationReceiptSourceBytes",
  "expectedReservationReceiptSourceHash", "lifecycleEventSourceBytes",
  "expectedLifecycleEventSourceHashes", "lifecycleHeadSourceBytes",
  "expectedLifecycleHeadSourceHash", "observedAt",
]);

function verifyReceipt(payload, request, sourceSystemRefHash) {
  exactObject(payload, RECEIPT_FIELDS, "RECEIPT_PAYLOAD");
  const expected = {
    schema: OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.receipt,
    schemaVersion: "1.0.0",
    recordClass: "SELLER_OWNER_SOURCE_DECLARED_EXACT_CAPACITY_RESERVATION",
    sourceSystemRefHash,
    reservationReceiptId: payload.reservationReceiptId,
    lifecycleStreamId: payload.lifecycleStreamId,
    ...reservationBindings(request),
    reservedAt: payload.reservedAt,
    reservationExpiresAt: request.serviceUntil,
    reservationState: "CAPACITY_RESERVED",
    sourceDeclarationEstablishesOwnerAuthority: false,
    sourceDeclarationEstablishesCapacityTruth: false,
    authority: "NONE",
  };
  token(payload.reservationReceiptId, "RESERVATION_RECEIPT_ID");
  token(payload.lifecycleStreamId, "LIFECYCLE_STREAM_ID");
  const reservedAt = instant(payload.reservedAt, "RECEIPT_RESERVED_AT");
  if (!same(payload, expected)
    || Date.parse(reservedAt) < Date.parse(request.requestedAt)
    || Date.parse(reservedAt) >= Date.parse(request.requestExpiresAt)
    || Date.parse(reservedAt) > Date.parse(request.serviceFrom)) {
    fail("RECEIPT_BINDING_OR_TIME_INVALID");
  }
  return payload;
}

function eventFixedBindings(receipt, request) {
  return {
    sourceSystemRefHash: receipt.sourceSystemRefHash,
    lifecycleStreamId: receipt.lifecycleStreamId,
    reservationRequestHash: request.reservationRequestHash,
    tenderHash: request.tenderHash,
    offerResponseHash: request.offerResponseHash,
    providerRefHash: request.providerRefHash,
    resourceOwnerRefHash: request.resourceOwnerRefHash,
    ownerSourceHash: request.ownerSourceHash,
    scopeHash: request.scopeHash,
    requirementKind: request.requirementKind,
    requirementId: request.requirementId,
    quantity: request.quantity,
    unitCode: request.unitCode,
    serviceFrom: request.serviceFrom,
    serviceUntil: request.serviceUntil,
    reservationNonceHash: request.reservationNonceHash,
  };
}

function verifyProtocol(input) {
  exactObject(input, VERIFY_INPUT_FIELDS, "VERIFY_INPUT");
  const observedAt = instant(input.observedAt, "OBSERVED_AT");
  const request = rebuildRequest(input.request, input.requestSource);
  /* Historical reservation evidence remains replayable after an owner-source
     validity interval ends. Request reconstruction already proves that the
     source was current when the reservation was requested and that it covered
     the complete service window. Currentness at this observation is reported,
     not used to erase valid terminal history. */
  const owner = verifyOwnerSource(input.requestSource.ownerSourceBytes,
    input.requestSource.expectedOwnerSourceHash, null);
  const ownerSourceCurrentAtObservedAt
    = Date.parse(owner.payload.validFrom) <= Date.parse(observedAt)
      && Date.parse(observedAt) < Date.parse(owner.payload.validUntil);
  const receiptEnvelope = sourceEnvelope(input.reservationReceiptSourceBytes,
    input.expectedReservationReceiptSourceHash, "RECEIPT_SOURCE");
  verifySignature(receiptEnvelope, owner.key, owner.payload.ownerKeyId,
    "RECEIPT", "RECEIPT_SOURCE");
  const receipt = verifyReceipt(receiptEnvelope.value.payload, request,
    owner.payload.sourceSystemRefHash);

  const events = denseArray(input.lifecycleEventSourceBytes,
    "LIFECYCLE_EVENT_SOURCE_BYTES");
  const expectedEventHashes = denseArray(input.expectedLifecycleEventSourceHashes,
    "EXPECTED_LIFECYCLE_EVENT_HASHES");
  if (events.length !== expectedEventHashes.length) {
    fail("LIFECYCLE_EVENT_DENOMINATOR_MISMATCH");
  }
  let previous = OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_EVENT_GENESIS_V1;
  let previousState = null;
  let previousTime = null;
  const occurrenceNonces = new Set();
  const eventHashes = [];
  for (let index = 0; index < events.length; index += 1) {
    const envelope = sourceEnvelope(events[index], expectedEventHashes[index],
      "LIFECYCLE_EVENT_SOURCE");
    verifySignature(envelope, owner.key, owner.payload.ownerKeyId,
      "LIFECYCLE_EVENT", "LIFECYCLE_EVENT_SOURCE");
    const event = envelope.value.payload;
    exactObject(event, EVENT_FIELDS, "LIFECYCLE_EVENT_PAYLOAD");
    const expectedBindings = eventFixedBindings(receipt, request);
    for (const [field, value] of Object.entries(expectedBindings)) {
      if (event[field] !== value) fail("LIFECYCLE_EVENT_BINDING_MISMATCH");
    }
    if (event.schema
        !== OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS
          .lifecycleEvent
      || event.schemaVersion !== "1.0.0"
      || event.reservationReceiptSourceHash !== receiptEnvelope.hash
      || event.ordinal !== index + 1
      || event.previousEventSourceHash !== previous) {
      fail("LIFECYCLE_EVENT_CHAIN_INVALID");
    }
    const eventState = allowed(event.eventState,
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_STATES,
      "LIFECYCLE_EVENT_STATE");
    const occurredAt = instant(event.occurredAt,
      "LIFECYCLE_EVENT_OCCURRED_AT");
    const nonce = hash(event.occurrenceNonceHash,
      "LIFECYCLE_EVENT_OCCURRENCE_NONCE_HASH");
    if (occurrenceNonces.has(nonce)) fail("LIFECYCLE_EVENT_NONCE_REUSED");
    occurrenceNonces.add(nonce);
    if (index === 0) {
      if (eventState !== "CAPACITY_RESERVED"
        || occurredAt !== receipt.reservedAt) {
        fail("LIFECYCLE_GENESIS_INVALID");
      }
    } else {
      if (previousState !== "CAPACITY_RESERVED"
        || !["REVOKED", "EXPIRED"].includes(eventState)) {
        fail("LIFECYCLE_TRANSITION_INVALID");
      }
      if (eventState === "REVOKED"
        && Date.parse(occurredAt) >= Date.parse(receipt.reservationExpiresAt)) {
        fail("REVOCATION_AT_OR_AFTER_EXPIRY_INVALID");
      }
      if (eventState === "EXPIRED"
        && Date.parse(occurredAt) < Date.parse(receipt.reservationExpiresAt)) {
        fail("EXPIRY_BEFORE_RESERVATION_END_INVALID");
      }
    }
    if (previousTime !== null
      && Date.parse(occurredAt) < Date.parse(previousTime)) {
      fail("LIFECYCLE_TIME_ROLLBACK");
    }
    previous = envelope.hash;
    previousState = eventState;
    previousTime = occurredAt;
    eventHashes.push(envelope.hash);
  }

  const headEnvelope = sourceEnvelope(input.lifecycleHeadSourceBytes,
    input.expectedLifecycleHeadSourceHash, "LIFECYCLE_HEAD_SOURCE");
  verifySignature(headEnvelope, owner.key, owner.payload.ownerKeyId,
    "LIFECYCLE_HEAD", "LIFECYCLE_HEAD_SOURCE");
  const head = headEnvelope.value.payload;
  exactObject(head, HEAD_FIELDS, "LIFECYCLE_HEAD_PAYLOAD");
  if (head.schema
      !== OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS
        .lifecycleHead
    || head.schemaVersion !== "1.0.0"
    || head.sourceSystemRefHash !== owner.payload.sourceSystemRefHash
    || head.lifecycleStreamId !== receipt.lifecycleStreamId
    || head.reservationReceiptSourceHash !== receiptEnvelope.hash
    || head.reservationRequestHash !== request.reservationRequestHash
    || head.tenderHash !== request.tenderHash
    || head.offerResponseHash !== request.offerResponseHash
    || head.providerRefHash !== request.providerRefHash
    || head.resourceOwnerRefHash !== request.resourceOwnerRefHash
    || head.ownerSourceHash !== request.ownerSourceHash
    || head.scopeHash !== request.scopeHash
    || head.eventCount !== events.length
    || head.coveredFromOrdinal !== 1 || head.coveredToOrdinal !== events.length
    || head.headEventSourceHash !== previous
    || head.currentState !== previousState
    || head.occurrencePolicy
      !== "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR") {
    fail("LIFECYCLE_HEAD_BINDING_OR_DENOMINATOR_INVALID");
  }
  const headObservedAt = instant(head.observedAt, "HEAD_OBSERVED_AT");
  if (Date.parse(headObservedAt) < Date.parse(previousTime)
    || Date.parse(headObservedAt) > Date.parse(observedAt)
    || Date.parse(observedAt) - Date.parse(headObservedAt)
      > owner.payload.maximumLifecycleHeadAgeMs) {
    fail("LIFECYCLE_HEAD_TIME_INVALID");
  }
  if (previousState === "CAPACITY_RESERVED"
    && Date.parse(observedAt) >= Date.parse(receipt.reservationExpiresAt)) {
    fail("EXPIRED_RESERVATION_MISSING_APPEND_ONLY_DESCENDANT");
  }
  if (Date.parse(observedAt) < Date.parse(receipt.reservedAt)) {
    fail("OBSERVED_BEFORE_RESERVATION");
  }
  const sourceDeclaredCurrent = previousState === "CAPACITY_RESERVED"
    && Date.parse(observedAt) < Date.parse(receipt.reservationExpiresAt);
  const body = {
    schema:
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.verification,
    schemaVersion: "1.0.0",
    ok: true,
    reservationRequestHash: request.reservationRequestHash,
    tenderHash: request.tenderHash,
    typedGraphHash: request.typedGraphHash,
    episodeHash: request.episodeHash,
    attemptHash: request.attemptHash,
    offerResponseHash: request.offerResponseHash,
    offerLifecycleHeadHash: request.offerLifecycleHeadHash,
    providerRefHash: request.providerRefHash,
    resourceOwnerRefHash: request.resourceOwnerRefHash,
    ownerSourceHash: request.ownerSourceHash,
    scopeHash: request.scopeHash,
    requirementKind: request.requirementKind,
    requirementId: request.requirementId,
    requirementObjectHash: request.requirementObjectHash,
    quantity: request.quantity,
    unitCode: request.unitCode,
    serviceFrom: request.serviceFrom,
    serviceUntil: request.serviceUntil,
    reservationNonceHash: request.reservationNonceHash,
    observedAt,
    reservationReceiptSourceHash: receiptEnvelope.hash,
    lifecycleHeadSourceHash: headEnvelope.hash,
    lifecycleOccurrenceCount: events.length,
    lifecycleState: previousState,
    exactOfferAndRequestReplayed: true,
    signedOfferAloneWouldSatisfyReservationProtocol: false,
    ownerSourceSelfSignatureVerified: true,
    ownerSourceAndReservationKeyContinuityVerified: true,
    ownerSourceCurrentAtObservedAt,
    reservationReceiptSignatureVerified: true,
    exactProviderSlotQuantityAndTimeWindowVerified: true,
    oneUseReservationNonceBound: true,
    lifecycleOccurrenceDenominatorReplayed: true,
    objectDedupReducedOccurrenceDenominator: false,
    lifecycleHeadSignatureVerified: true,
    lifecycleHeadCurrentAtObservedAt: true,
    sourceDeclaredCapacityReservationCurrent: sourceDeclaredCurrent,
    sourceDeclaredCapacityReservationState: previousState,
    selfSignedOwnerSourceEstablishesLegalIdentity: false,
    independentOwnerTrustAnchorReplayed: false,
    resourceOwnerAuthorityEstablished: false,
    sourceSignatureEstablishesCapacityTruth: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    externalNonEquivocationEstablished: false,
    sourceCompletenessBeyondPinnedHeadEstablished: false,
    paymentPerformed: false,
    pricePresent: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    coordinatorDisposition:
      sourceDeclaredCurrent
        ? "SOURCE_DECLARED_RESERVATION_AWAIT_OWNER_TRUST_AND_OTHER_GATES"
        : "RESERVATION_NOT_CURRENT_HOLD_OR_REFORM_ROUTE",
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "NONE",
    error: null,
    boundary: OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_BOUNDARY,
  };
  return Object.freeze({ ...body, verificationHash: digest(
    OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.verification,
    body) });
}

export function verifyExternalCapacityReservationProtocolV1(input = {}) {
  try { return verifyProtocol(input); }
  catch (error) { return verificationFailure(error); }
}

function verificationInputForBundle(request, requestSource, bundle,
  observedAt) {
  return {
    request,
    requestSource,
    reservationReceiptSourceBytes: bundle.reservationReceiptSourceBytes,
    expectedReservationReceiptSourceHash:
      sha256Bytes(bundle.reservationReceiptSourceBytes),
    lifecycleEventSourceBytes: bundle.lifecycleEventSourceBytes,
    expectedLifecycleEventSourceHashes:
      bundle.lifecycleEventSourceBytes.map(sha256Bytes),
    lifecycleHeadSourceBytes: bundle.lifecycleHeadSourceBytes,
    expectedLifecycleHeadSourceHash:
      sha256Bytes(bundle.lifecycleHeadSourceBytes),
    observedAt,
  };
}

const TERMINAL_INPUT_FIELDS = Object.freeze([
  "request", "requestSource", "sourceBundle", "eventState", "occurredAt",
  "headObservedAt", "occurrenceNonceHash",
]);
const SOURCE_BUNDLE_FIELDS = Object.freeze([
  "reservationReceiptSourceBytes", "lifecycleEventSourceBytes",
  "lifecycleHeadSourceBytes",
]);

export function createSellerOwnedCapacityReservationTerminalDescendantV1(
  signer, input = {}) {
  const state = signerState(signer);
  exactObject(input, TERMINAL_INPUT_FIELDS, "TERMINAL_INPUT");
  exactObject(input.sourceBundle, SOURCE_BUNDLE_FIELDS, "SOURCE_BUNDLE");
  const request = rebuildRequest(input.request, input.requestSource);
  if (request.ownerSourceHash !== state.ownerSourceHash
    || request.ownerSourceKeyId !== state.ownerKeyId) {
    fail("TERMINAL_REQUEST_NOT_BOUND_TO_SIGNER");
  }
  const terminalState = allowed(input.eventState, ["REVOKED", "EXPIRED"],
    "TERMINAL_STATE");
  const occurredAt = instant(input.occurredAt, "TERMINAL_OCCURRED_AT");
  const priorHeadEnvelope = sourceEnvelope(
    input.sourceBundle.lifecycleHeadSourceBytes,
    sha256Bytes(input.sourceBundle.lifecycleHeadSourceBytes),
    "TERMINAL_PRIOR_HEAD_SOURCE");
  const replayAt = priorHeadEnvelope.value?.payload?.observedAt;
  const prior = verifyExternalCapacityReservationProtocolV1(
    verificationInputForBundle(request, input.requestSource,
      input.sourceBundle, replayAt));
  if (!prior.ok || prior.lifecycleState !== "CAPACITY_RESERVED"
    || prior.lifecycleOccurrenceCount !== 1
    || prior.sourceDeclaredCapacityReservationCurrent !== true) {
    fail("CURRENT_RESERVED_GENESIS_BUNDLE_REQUIRED");
  }
  if (terminalState === "REVOKED"
    && Date.parse(occurredAt) >= Date.parse(request.serviceUntil)) {
    fail("REVOCATION_AT_OR_AFTER_EXPIRY_INVALID");
  }
  if (terminalState === "EXPIRED"
    && Date.parse(occurredAt) < Date.parse(request.serviceUntil)) {
    fail("EXPIRY_BEFORE_RESERVATION_END_INVALID");
  }
  const headObservedAt = instant(input.headObservedAt,
    "TERMINAL_HEAD_OBSERVED_AT");
  if (Date.parse(headObservedAt) < Date.parse(occurredAt)) {
    fail("TERMINAL_HEAD_PRECEDES_EVENT");
  }
  const receiptHash = sha256Bytes(
    input.sourceBundle.reservationReceiptSourceBytes);
  const receiptEnvelope = sourceEnvelope(
    input.sourceBundle.reservationReceiptSourceBytes, receiptHash,
    "TERMINAL_RECEIPT_SOURCE");
  const receipt = receiptEnvelope.value.payload;
  const firstHash = sha256Bytes(input.sourceBundle.lifecycleEventSourceBytes[0]);
  const eventPayload = {
    schema:
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.lifecycleEvent,
    schemaVersion: "1.0.0",
    ...eventFixedBindings(receipt, request),
    reservationReceiptSourceHash: receiptHash,
    ordinal: 2,
    previousEventSourceHash: firstHash,
    eventState: terminalState,
    occurredAt,
    occurrenceNonceHash: hash(input.occurrenceNonceHash,
      "TERMINAL_OCCURRENCE_NONCE_HASH"),
  };
  /* Restore schema ordering/shape after the binding spread. */
  const secondEvent = {
    schema: eventPayload.schema,
    schemaVersion: eventPayload.schemaVersion,
    sourceSystemRefHash: eventPayload.sourceSystemRefHash,
    lifecycleStreamId: eventPayload.lifecycleStreamId,
    reservationReceiptSourceHash: eventPayload.reservationReceiptSourceHash,
    reservationRequestHash: eventPayload.reservationRequestHash,
    tenderHash: eventPayload.tenderHash,
    offerResponseHash: eventPayload.offerResponseHash,
    providerRefHash: eventPayload.providerRefHash,
    resourceOwnerRefHash: eventPayload.resourceOwnerRefHash,
    ownerSourceHash: eventPayload.ownerSourceHash,
    scopeHash: eventPayload.scopeHash,
    requirementKind: eventPayload.requirementKind,
    requirementId: eventPayload.requirementId,
    quantity: eventPayload.quantity,
    unitCode: eventPayload.unitCode,
    serviceFrom: eventPayload.serviceFrom,
    serviceUntil: eventPayload.serviceUntil,
    reservationNonceHash: eventPayload.reservationNonceHash,
    ordinal: eventPayload.ordinal,
    previousEventSourceHash: eventPayload.previousEventSourceHash,
    eventState: eventPayload.eventState,
    occurredAt: eventPayload.occurredAt,
    occurrenceNonceHash: eventPayload.occurrenceNonceHash,
  };
  const secondBytes = signedSource("LIFECYCLE_EVENT", secondEvent, state);
  const eventBytes = [Buffer.from(
    input.sourceBundle.lifecycleEventSourceBytes[0]), secondBytes];
  const secondHash = sha256Bytes(secondBytes);
  const headPayload = {
    schema:
      OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.lifecycleHead,
    schemaVersion: "1.0.0",
    sourceSystemRefHash: receipt.sourceSystemRefHash,
    lifecycleStreamId: receipt.lifecycleStreamId,
    reservationReceiptSourceHash: receiptHash,
    reservationRequestHash: request.reservationRequestHash,
    tenderHash: request.tenderHash,
    offerResponseHash: request.offerResponseHash,
    providerRefHash: request.providerRefHash,
    resourceOwnerRefHash: request.resourceOwnerRefHash,
    ownerSourceHash: request.ownerSourceHash,
    scopeHash: request.scopeHash,
    eventCount: 2,
    coveredFromOrdinal: 1,
    coveredToOrdinal: 2,
    headEventSourceHash: secondHash,
    currentState: terminalState,
    observedAt: headObservedAt,
    occurrencePolicy:
      "EVERY_SOURCE_EVENT_COUNTED_OBJECT_DEDUP_NEVER_REDUCES_DENOMINATOR",
  };
  const lifecycleHeadSourceBytes = signedSource("LIFECYCLE_HEAD", headPayload,
    state);
  const manifest = bundleProjection(request, receiptHash,
    [firstHash, secondHash], sha256Bytes(lifecycleHeadSourceBytes),
    terminalState);
  return {
    sourceBundle: {
      reservationReceiptSourceBytes: Buffer.from(
        input.sourceBundle.reservationReceiptSourceBytes),
      lifecycleEventSourceBytes: eventBytes.map((bytes) => Buffer.from(bytes)),
      lifecycleHeadSourceBytes: Buffer.from(lifecycleHeadSourceBytes),
    },
    publicProjection: Object.freeze({
      schema:
        OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_SCHEMAS.emission,
      sourceBundleManifest: manifest,
      sourceDeclaredCapacityReservationCurrent: false,
      sourceDeclaredCapacityReservationState: terminalState,
      externalNonEquivocationEstablished: false,
      resourceOwnerAuthorityEstablished: false,
      externalCapacityEstablished: false,
      capacityReserved: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      boundary: OUTSIDER_EXTERNAL_CAPACITY_RESERVATION_PROTOCOL_V1_BOUNDARY,
    }),
  };
}

/* The output is a buyer-side, raw-source-replayed coordinator evidence seam;
   accepting a caller boolean or an output-only projection is intentionally
   unsupported. */
export const verifyExternalCapacityReservationForFormationCoordinatorV1
  = verifyExternalCapacityReservationProtocolV1;
