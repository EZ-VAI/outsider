/*
 * Seller-owned HTTP one-use tender response endpoint v1.
 *
 * This is a fixed, injected HTTP-handler contract, not a live server. One
 * endpoint capability is admitted for one exact tender/response/provider/
 * scope/nonce/expiry tuple. Seller evidence, reservation terms, and the
 * witness request are sealed at construction and cannot be supplied by the
 * remote caller. The handler composes the existing seller source emitter and
 * its durable v2 release adapter; it creates no verifier or ledger.
 */

import { createHash } from "node:crypto";
import { isProxy } from "node:util/types";

import { canonicalizeStrict } from "./canonical.js";
import {
  prepareSellerOwnedDurableCapacityEmissionV2,
  releaseSellerOwnedDurableCapacityEmissionV2,
} from "./outsider-seller-owned-durable-one-use-capacity-emitter-v2.js";
import { verifyOneUseTenderResponseLifecycleV1 }
  from "./outsider-one-use-tender-response-lifecycle-v1.js";

const PREFIX = "OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_";
const POST_PATH = "/outsider/v1/one-use-tender-responses";
const MEDIA_TYPE = "application/json";
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const ENDPOINTS = new WeakMap();

export const OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_SCHEMAS
  = Object.freeze({
    endpoint: "outsider/seller-owned-http-one-use-tender-endpoint/v1",
    request: "outsider/seller-owned-http-one-use-tender-request/v1",
    response: "outsider/seller-owned-http-one-use-tender-response/v1",
    error: "outsider/seller-owned-http-one-use-tender-error/v1",
  });

export const OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_BOUNDARY
  = Object.freeze({
    position: "SELLER_OWNED_INJECTED_HTTP_HANDLER_HOLD_ONLY",
    fixedMethod: "POST",
    fixedPath: POST_PATH,
    fixedMediaType: MEDIA_TYPE,
    liveServerCreated: false,
    injectedHandlerOnly: true,
    arbitraryPathAccepted: false,
    arbitraryCallbackAccepted: false,
    remoteSellerTermsAccepted: false,
    remotePrivateKeyAccepted: false,
    sellerPrivateKeyProjected: false,
    exactCanonicalRequestBytesRequired: true,
    exactTenderResponseProviderScopeNonceAndExpiryPinned: true,
    existingResponseLifecycleVerifierReused: true,
    existingFiveSourceDocumentContractReused: true,
    existingDurableReleaseAdapterReused: true,
    newVerifierCreated: false,
    newLedgerCreated: false,
    durableAttemptRequiredBeforeHttpBodyRelease: true,
    duplicateReleaseAfterCrashOrRestartPermitted: false,
    transportAcknowledgementIsOutcome: false,
    sellerSignedSourcesAreIndependentWitness: false,
    independentWitnessReceiptPresent: false,
    callerOrServerClockTrusted: false,
    filesystemOwnerRollbackOrReplacementExcluded: false,
    networkIoPerformedByThisModule: false,
    externalResourceContactedByThisModule: false,
    paymentInterfacePresent: false,
    legalIdentityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    outcomeEstablished: false,
    pricePresent: false,
    guaranteeEstablished: false,
    settlementPermitted: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
    enabledCapabilitiesSubsetOfProvenAuthority: true,
    consequenceReach: "ONE_ADMITTED_LOCAL_RESPONSE_BODY_ONLY",
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function exactObject(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || isProxy(value)) fail(`${code}_OBJECT_INVALID`);
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

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
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

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function canonicalClone(value, code) {
  let text;
  try { text = canonicalizeStrict(value); }
  catch { fail(`${code}_INVALID`); }
  if (Buffer.byteLength(text, "utf8") > MAX_REQUEST_BYTES) {
    fail(`${code}_TOO_LARGE`);
  }
  return JSON.parse(text);
}

function endpointState(endpoint) {
  if (endpoint === null || typeof endpoint !== "object"
    || !ENDPOINTS.has(endpoint)) fail("ENDPOINT_CAPABILITY_INVALID");
  return ENDPOINTS.get(endpoint);
}

const ENDPOINT_FIELDS = Object.freeze([
  "sellerEmitterCapability", "durableEmitterAdapter", "expectedTenderHash",
  "expectedInitialResponseHash", "expectedProviderRefHash",
  "expectedScopeHash", "expectedResponseNonceHash",
  "expectedResponseExpiresAt", "expectedHttpRequestNonceHash",
  "validFrom", "validUntil", "emissionObservedAt", "sellerEmissionTerms",
]);
const SELLER_TERMS_FIELDS = Object.freeze([
  "sourceEvidence", "reservation", "witnessRequest",
]);

export function createSellerOwnedHttpOneUseTenderEndpointV1(input = {}) {
  exactObject(input, ENDPOINT_FIELDS, "ENDPOINT_INPUT");
  exactObject(input.sellerEmissionTerms, SELLER_TERMS_FIELDS, "SELLER_TERMS");
  const pins = {
    expectedTenderHash: hash(input.expectedTenderHash,
      "EXPECTED_TENDER_HASH"),
    expectedInitialResponseHash: hash(input.expectedInitialResponseHash,
      "EXPECTED_INITIAL_RESPONSE_HASH"),
    expectedProviderRefHash: hash(input.expectedProviderRefHash,
      "EXPECTED_PROVIDER_REF_HASH"),
    expectedScopeHash: hash(input.expectedScopeHash, "EXPECTED_SCOPE_HASH"),
    expectedResponseNonceHash: hash(input.expectedResponseNonceHash,
      "EXPECTED_RESPONSE_NONCE_HASH"),
    expectedResponseExpiresAt: instant(input.expectedResponseExpiresAt,
      "EXPECTED_RESPONSE_EXPIRES_AT"),
    expectedHttpRequestNonceHash: hash(input.expectedHttpRequestNonceHash,
      "EXPECTED_HTTP_REQUEST_NONCE_HASH"),
  };
  const validFrom = instant(input.validFrom, "VALID_FROM");
  const validUntil = instant(input.validUntil, "VALID_UNTIL");
  const emissionObservedAt = instant(input.emissionObservedAt,
    "EMISSION_OBSERVED_AT");
  if (Date.parse(validUntil) <= Date.parse(validFrom)
    || Date.parse(validUntil) > Date.parse(pins.expectedResponseExpiresAt)
    || Date.parse(emissionObservedAt) < Date.parse(validFrom)
    || Date.parse(emissionObservedAt) >= Date.parse(validUntil)) {
    fail("ENDPOINT_VALIDITY_INVALID");
  }
  const sellerEmissionTerms = canonicalClone(input.sellerEmissionTerms,
    "SELLER_TERMS");
  const endpointBody = {
    schema: OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_SCHEMAS
      .endpoint,
    schemaVersion: "1.0.0",
    recordClass: "ONE_EXACT_SELLER_ADMISSION_INJECTED_HTTP_HANDLER",
    method: "POST",
    path: POST_PATH,
    mediaType: MEDIA_TYPE,
    expectedTenderHash: pins.expectedTenderHash,
    expectedInitialResponseHash: pins.expectedInitialResponseHash,
    expectedProviderRefHash: pins.expectedProviderRefHash,
    expectedScopeHash: pins.expectedScopeHash,
    expectedResponseNonceHash: pins.expectedResponseNonceHash,
    expectedResponseExpiresAt: pins.expectedResponseExpiresAt,
    expectedHttpRequestNonceHash: pins.expectedHttpRequestNonceHash,
    validFrom,
    validUntil,
    emissionObservedAt,
    sellerTermsSealed: true,
    sellerPrivateKeyProjected: false,
    liveServerCreated: false,
    capacityReserved: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  const endpoint = Object.freeze({
    ...endpointBody,
    endpointHash: digest(
      OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_SCHEMAS.endpoint,
      endpointBody),
  });
  ENDPOINTS.set(endpoint, {
    sellerEmitterCapability: input.sellerEmitterCapability,
    durableEmitterAdapter: input.durableEmitterAdapter,
    pins,
    validFrom,
    validUntil,
    emissionObservedAt,
    sellerEmissionTerms,
    endpointHash: endpoint.endpointHash,
  });
  return endpoint;
}

const HTTP_REQUEST_FIELDS = Object.freeze([
  "method", "path", "contentType", "bodyBytes", "receivedAt",
]);
const BODY_FIELDS = Object.freeze([
  "schema", "schemaVersion", "requestClass", "httpRequestNonceHash",
  "tender", "expectedTenderHash", "responses", "responseOccurrences",
  "expectedResponseOccurrenceCount", "expectedResponseLifecycleHeadHash",
]);

function response(statusCode, payload) {
  const bodyBytes = Buffer.from(canonicalizeStrict(payload), "utf8");
  return {
    statusCode,
    headers: Object.freeze({
      "content-type": "application/json",
      "cache-control": "no-store",
      "content-length": String(bodyBytes.length),
    }),
    bodyBytes,
    publicProjection: payload,
  };
}

function errorResponse(endpointHash, statusCode, errorCode) {
  const body = {
    schema: OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_SCHEMAS.error,
    schemaVersion: "1.0.0",
    recordClass: "FINITE_SELLER_ENDPOINT_ERROR",
    endpointHash,
    errorCode,
    sourceDocumentsReturned: 0,
    retryPermitted: false,
    humanQueueCreated: false,
    externalCapacityEstablished: false,
    capacityReserved: false,
    outcomeEstablished: false,
    decisionState: "HOLD",
    authority: "NONE",
    actionReady: false,
    executable: false,
  };
  return response(statusCode, Object.freeze({
    ...body,
    errorHash: digest(
      OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_SCHEMAS.error,
      body),
  }));
}

function parseRequestBody(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2
    || bytes.length > MAX_REQUEST_BYTES) fail("REQUEST_BODY_BYTES_INVALID");
  const copy = Buffer.from(bytes);
  const text = copy.toString("utf8");
  if (!Buffer.from(text, "utf8").equals(copy)) fail("REQUEST_BODY_UTF8_INVALID");
  let value;
  try { value = JSON.parse(text); }
  catch { fail("REQUEST_BODY_JSON_INVALID"); }
  exactObject(value, BODY_FIELDS, "REQUEST_BODY");
  if (canonicalizeStrict(value) !== text) fail("REQUEST_BODY_NOT_CANONICAL");
  if (value.schema
      !== OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_SCHEMAS.request
    || value.schemaVersion !== "1.0.0"
    || value.requestClass !== "EXACT_ONE_USE_TENDER_RESPONSE_REQUEST") {
    fail("REQUEST_BODY_SCHEMA_INVALID");
  }
  return value;
}

function requestMatchesAdmission(body, state) {
  const initial = body.responses?.[0];
  return body.httpRequestNonceHash === state.pins.expectedHttpRequestNonceHash
    && body.expectedTenderHash === state.pins.expectedTenderHash
    && body.tender?.tenderHash === state.pins.expectedTenderHash
    && initial?.responseHash === state.pins.expectedInitialResponseHash
    && initial?.providerRefHash === state.pins.expectedProviderRefHash
    && initial?.scopeHash === state.pins.expectedScopeHash
    && initial?.responseNonceHash === state.pins.expectedResponseNonceHash
    && initial?.expiresAt === state.pins.expectedResponseExpiresAt;
}

function addMilliseconds(instantValue, count) {
  return new Date(Date.parse(instantValue) + count).toISOString();
}

function isDurableDuplicate(error) {
  if (!(error instanceof Error) || typeof error.message !== "string") {
    return false;
  }
  return error.message.includes("RESPONSE_ALREADY_EMITTED_IN_THIS_PROCESS")
    || error.message.includes("DURABLE_RELEASE_ALREADY_ATTEMPTED")
    || error.message.includes("ONE_USE_NONCE_ALREADY_BOUND")
    || error.message.includes("IDEMPOTENCY_BODY_PAIR_ALREADY_BOUND")
    || error.message.includes("IDEMPOTENCY_KEY_BODY_SPLICE")
    || error.message.includes("SUBMIT_ATTEMPT_RETRY");
}

export function handleSellerOwnedHttpOneUseTenderRequestV1(
  endpoint, request = {}) {
  const state = endpointState(endpoint);
  try { exactObject(request, HTTP_REQUEST_FIELDS, "HTTP_REQUEST"); }
  catch { return errorResponse(state.endpointHash, 400, "HTTP_REQUEST_INVALID"); }
  if (request.method !== "POST") {
    return errorResponse(state.endpointHash, 405, "METHOD_NOT_ALLOWED");
  }
  if (request.path !== POST_PATH) {
    return errorResponse(state.endpointHash, 404, "PATH_NOT_FOUND");
  }
  if (request.contentType !== MEDIA_TYPE) {
    return errorResponse(state.endpointHash, 415, "MEDIA_TYPE_NOT_SUPPORTED");
  }
  let receivedAt;
  try { receivedAt = instant(request.receivedAt, "RECEIVED_AT"); }
  catch { return errorResponse(state.endpointHash, 400, "RECEIVED_AT_INVALID"); }
  const reservedAt = addMilliseconds(receivedAt, 1);
  const attemptedAt = addMilliseconds(receivedAt, 2);
  if (Date.parse(receivedAt) < Date.parse(state.validFrom)
    || Date.parse(receivedAt) >= Date.parse(state.validUntil)
    || Date.parse(attemptedAt) >= Date.parse(state.pins.expectedResponseExpiresAt)) {
    return errorResponse(state.endpointHash, 409, "ADMISSION_NOT_CURRENT");
  }
  let body;
  try { body = parseRequestBody(request.bodyBytes); }
  catch { return errorResponse(state.endpointHash, 400,
    "CANONICAL_REQUEST_BODY_REQUIRED"); }
  if (!requestMatchesAdmission(body, state)) {
    return errorResponse(state.endpointHash, 400,
      "EXACT_ADMISSION_BINDING_MISMATCH");
  }
  const lifecycle = verifyOneUseTenderResponseLifecycleV1({
    tender: body.tender,
    expectedTenderHash: body.expectedTenderHash,
    responses: body.responses,
    occurrences: body.responseOccurrences,
    expectedOccurrenceCount: body.expectedResponseOccurrenceCount,
    expectedLifecycleHeadHash: body.expectedResponseLifecycleHeadHash,
    observedAt: state.emissionObservedAt,
  });
  if (!lifecycle.ok || lifecycle.currentResponseState !== "OFFERED"
    || !lifecycle.currentCallerDeclaredOneUseOfferReference) {
    return errorResponse(state.endpointHash, 400,
      "OFFERED_RESPONSE_LIFECYCLE_INVALID");
  }
  const requestHash = digest(
    OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_SCHEMAS.request,
    body);
  try {
    const emissionInput = {
      tender: body.tender,
      expectedTenderHash: body.expectedTenderHash,
      responses: body.responses,
      responseOccurrences: body.responseOccurrences,
      expectedResponseOccurrenceCount: body.expectedResponseOccurrenceCount,
      expectedResponseLifecycleHeadHash:
        body.expectedResponseLifecycleHeadHash,
      observedAt: state.emissionObservedAt,
      sourceEvidence: state.sellerEmissionTerms.sourceEvidence,
      reservation: state.sellerEmissionTerms.reservation,
      witnessRequest: state.sellerEmissionTerms.witnessRequest,
    };
    const prepared = prepareSellerOwnedDurableCapacityEmissionV2(
      state.durableEmitterAdapter, {
        sellerEmitterCapability: state.sellerEmitterCapability,
        emissionInput,
        admittedAt: receivedAt,
        reservedAt,
      });
    const released = releaseSellerOwnedDurableCapacityEmissionV2(
      prepared.prepared, { attemptedAt });
    const source = released.sourceBundle;
    const payloadBody = {
      schema:
        OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_SCHEMAS.response,
      schemaVersion: "1.0.0",
      recordClass: "SELLER_SIGNED_SOURCE_DOCUMENT_RESPONSE",
      endpointHash: state.endpointHash,
      requestHash,
      tenderHash: lifecycle.tenderHash,
      oneUseResponseHash: lifecycle.initialResponseHash,
      providerRefHash: lifecycle.providerRefHash,
      scopeHash: lifecycle.scopeHash,
      sourceBundleManifest:
        released.v1PublicProjection.sourceBundleManifest,
      witnessChallenge: released.v1PublicProjection.witnessChallenge,
      durableRelease: released.publicProjection,
      sourceDocuments: {
        encoding: "base64",
        semantics: source.semanticsSourceBytes.toString("base64"),
        standing: source.standingSourceBytes.toString("base64"),
        receipt: source.receiptSourceBytes.toString("base64"),
        lifecycleEvents: source.lifecycleEventSourceBytes.map(
          (bytes) => bytes.toString("base64")),
        lifecycleHead: source.lifecycleHeadSourceBytes.toString("base64"),
      },
      exactSourceDocumentCount: 5,
      transportResponseEstablishesOutcome: false,
      sellerSignedSourcesAreIndependentWitness: false,
      independentWitnessReceiptPresent: false,
      externalCapacityEstablished: false,
      capacityReserved: false,
      outcomeEstablished: false,
      pricePresent: false,
      paymentPerformed: false,
      decisionState: "HOLD",
      authority: "NONE",
      actionReady: false,
      executable: false,
      boundary:
        OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_BOUNDARY,
    };
    return response(200, Object.freeze({
      ...payloadBody,
      responseHash: digest(
        OUTSIDER_SELLER_OWNED_HTTP_ONE_USE_TENDER_ENDPOINT_V1_SCHEMAS.response,
        payloadBody),
    }));
  } catch (error) {
    return isDurableDuplicate(error)
      ? errorResponse(state.endpointHash, 409, "ONE_USE_ALREADY_CONSUMED")
      : errorResponse(state.endpointHash, 500, "LOCAL_DURABILITY_HOLD");
  }
}

