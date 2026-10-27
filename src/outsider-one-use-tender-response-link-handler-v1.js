/*
 * Outcome Formation Engine: provider-neutral one-use tender response link v1.
 *
 * A high-entropy bearer link displays one frozen order summary and accepts one
 * source response: DECLINE or a structured OFFER. The handler requires an
 * injected atomic compare-and-append store; eventually-consistent key/value
 * storage is not an admissible consume-once primitive. Raw response bytes stay
 * private. A hosted-page occurrence remains HOLD evidence and never creates
 * provider identity, owner authority, capacity, price truth, or an outcome.
 */

import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

const PREFIX = "OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^(?:resource|recovery|evidence)_[a-f0-9]{32}$/u;
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const RESPONSE_TOKEN = /^[A-Za-z0-9_-]{43,86}$/u;
const MAX_BODY_BYTES = 64 * 1024;
const MAX_QUOTE_MINOR = 1_000_000_000_000;
const PRIVATE_RESULTS = new WeakMap();

export const OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_SCHEMAS
  = Object.freeze({
    definition: "outsider/one-use-tender-response-link-definition/v1",
    event: "outsider/one-use-tender-response-link-event/v1",
    projection: "outsider/one-use-tender-response-link-projection/v1",
    privateSource: "outsider/one-use-tender-response-link-private-source/v1",
  });

export const OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_BOUNDARY
  = Object.freeze({
    position: "UNREGISTERED_SELLER_ONE_USE_STRUCTURED_RESPONSE_SOURCE_HOLD",
    registrationRequired: false,
    highEntropyBearerTokenRequired: true,
    rawTokenStored: false,
    rawTokenProjected: false,
    frozenOrderSummaryDisplayed: true,
    allowedResponseChoices: Object.freeze(["DECLINE", "OFFER"]),
    offerRequiresQuoteWindowAndResponsibilityAcceptance: true,
    atomicCompareAndAppendRequired: true,
    eventuallyConsistentKvConsumeOncePermitted: false,
    maximumResponseEffects: 1,
    rawResponseStoredPrivately: true,
    persistedPrivateResponseReplayAvailable: true,
    persistedPrivateResponseReplayRequiresAuthenticatedIngress: true,
    appendOnlyResponseHistory: true,
    repeatedResponseFailsClosed: true,
    expiredResponseFailsClosed: true,
    revokedResponseFailsClosed: true,
    hostedPageOccurrenceIsProviderIdentity: false,
    hostedPageOccurrenceIsOwnerAuthority: false,
    hostedPageOccurrenceIsCapacity: false,
    hostedPageOccurrenceIsPriceTruth: false,
    hostedPageOccurrenceIsOutcomeTruth: false,
    paymentPerformed: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) fail(code);
  return value;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)
    || Buffer.isBuffer(value)) return value;
  for (const descriptor of Object.values(
    Object.getOwnPropertyDescriptors(value))) {
    if (Object.hasOwn(descriptor, "value")) deepFreeze(descriptor.value);
  }
  return Object.freeze(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

function boundedString(value, maximum, code) {
  if (typeof value !== "string" || value.trim() !== value || value.length < 1
    || Buffer.byteLength(value, "utf8") > maximum
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) {
    fail(code);
  }
  return value;
}

function decodeUtf8(bytes, code) {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { fail(code); }
}

function tokenBytes(value) {
  if (typeof value !== "string" || !RESPONSE_TOKEN.test(value)) {
    fail("RESPONSE_TOKEN_INVALID");
  }
  let bytes;
  try { bytes = Buffer.from(value, "base64url"); }
  catch { fail("RESPONSE_TOKEN_INVALID"); }
  if (bytes.length < 32 || bytes.length > 64
    || bytes.toString("base64url") !== value) fail("RESPONSE_TOKEN_INVALID");
  return bytes;
}

export function oneUseTenderResponseTokenHashV1(responseToken) {
  const bytes = tokenBytes(responseToken);
  return digest("outsider/one-use-tender-response-link-token/v1",
    bytes.toString("base64"));
}

function normalizeDefinition(value) {
  exact(value, ["schema", "schemaVersion", "tenderHash", "requirementKind",
    "requirementId", "issuedAt", "expiresAt", "summary",
    "acceptedCurrencyCodes", "responsibilityTermsText",
    "responsibilityTermsHash", "tokenHash", "definitionHash"],
  "DEFINITION_INVALID");
  exact(value.summary, ["title", "outcome", "quantity", "dueBy",
    "supplierInstructions"], "SUMMARY_INVALID");
  if (value.schema
      !== OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_SCHEMAS.definition
    || value.schemaVersion !== "1.0.0"
    || !["RESOURCE", "RECOVERY", "EVIDENCE"].includes(value.requirementKind)
    || typeof value.requirementId !== "string" || !ID.test(value.requirementId)
    || !Array.isArray(value.acceptedCurrencyCodes)
    || value.acceptedCurrencyCodes.length < 1
    || value.acceptedCurrencyCodes.length > 16) fail("DEFINITION_INVALID");
  hash(value.tenderHash, "TENDER_HASH_INVALID");
  hash(value.tokenHash, "TOKEN_HASH_INVALID");
  hash(value.responsibilityTermsHash, "RESPONSIBILITY_TERMS_HASH_INVALID");
  const issuedAt = instant(value.issuedAt, "ISSUED_AT_INVALID");
  const expiresAt = instant(value.expiresAt, "EXPIRES_AT_INVALID");
  const dueBy = instant(value.summary.dueBy, "DUE_BY_INVALID");
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)
    || Date.parse(dueBy) < Date.parse(expiresAt)) fail("TIME_WINDOW_INVALID");
  boundedString(value.summary.title, 240, "SUMMARY_TITLE_INVALID");
  boundedString(value.summary.outcome, 4_096, "SUMMARY_OUTCOME_INVALID");
  boundedString(value.summary.quantity, 240, "SUMMARY_QUANTITY_INVALID");
  boundedString(value.summary.supplierInstructions, 2_048,
    "SUMMARY_INSTRUCTIONS_INVALID");
  boundedString(value.responsibilityTermsText, 16_384,
    "RESPONSIBILITY_TERMS_TEXT_INVALID");
  if (bytesHash(Buffer.from(value.responsibilityTermsText, "utf8"))
      !== value.responsibilityTermsHash) {
    fail("RESPONSIBILITY_TERMS_CONTENT_HASH_MISMATCH");
  }
  const currencies = [...value.acceptedCurrencyCodes];
  if (currencies.some((currency) => typeof currency !== "string"
      || !CURRENCY.test(currency))
    || new Set(currencies).size !== currencies.length
    || [...currencies].sort().some((currency, index) =>
      currency !== currencies[index])) fail("CURRENCY_SET_INVALID");
  const body = { ...value };
  delete body.definitionHash;
  if (digest(value.schema, body) !== value.definitionHash) {
    fail("DEFINITION_HASH_INVALID");
  }
  return value;
}

/** Compile a deployable definition without retaining or returning the token. */
export function createOneUseTenderResponseLinkDefinitionV1(input = {}) {
  exact(input, ["tenderHash", "requirementKind", "requirementId", "issuedAt",
    "expiresAt", "summary", "acceptedCurrencyCodes",
    "responsibilityTermsText", "responsibilityTermsHash", "responseToken"],
  "INPUT_INVALID");
  const tokenHash = oneUseTenderResponseTokenHashV1(input.responseToken);
  const body = {
    schema:
      OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_SCHEMAS.definition,
    schemaVersion: "1.0.0",
    tenderHash: input.tenderHash,
    requirementKind: input.requirementKind,
    requirementId: input.requirementId,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    summary: input.summary === null || typeof input.summary !== "object"
      ? input.summary : { ...input.summary },
    acceptedCurrencyCodes: Array.isArray(input.acceptedCurrencyCodes)
      ? [...input.acceptedCurrencyCodes] : input.acceptedCurrencyCodes,
    responsibilityTermsText: input.responsibilityTermsText,
    responsibilityTermsHash: input.responsibilityTermsHash,
    tokenHash,
  };
  return deepFreeze(normalizeDefinition({ ...body,
    definitionHash: digest(body.schema, body) }));
}

const EVENT_FIELDS = Object.freeze(["schema", "schemaVersion", "ordinal",
  "eventType", "recordedAt", "tenderHash", "tokenHash", "definitionHash",
  "previousEventHash", "sourceBodyHash", "sourceByteLength",
  "privatePayload", "eventHash"]);

function buildEvent(definition, ordinal, eventType, recordedAt,
  previousEventHash, sourceBytes, privatePayload) {
  const body = {
    schema: OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_SCHEMAS.event,
    schemaVersion: "1.0.0",
    ordinal,
    eventType,
    recordedAt,
    tenderHash: definition.tenderHash,
    tokenHash: definition.tokenHash,
    definitionHash: definition.definitionHash,
    previousEventHash,
    sourceBodyHash: sourceBytes === null ? null : bytesHash(sourceBytes),
    sourceByteLength: sourceBytes === null ? 0 : sourceBytes.length,
    privatePayload,
  };
  return deepFreeze({ ...body, eventHash: digest(body.schema, body) });
}

function validateEvent(value, definition, ordinal, previous) {
  exact(value, EVENT_FIELDS, "EVENT_INVALID");
  const body = { ...value };
  delete body.eventHash;
  if (value.schema
      !== OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_SCHEMAS.event
    || value.schemaVersion !== "1.0.0" || value.ordinal !== ordinal
    || value.previousEventHash !== previous
    || value.tenderHash !== definition.tenderHash
    || value.tokenHash !== definition.tokenHash
    || value.definitionHash !== definition.definitionHash
    || !["LINK_ISSUED", "LINK_REVOKED", "RESPONSE_DECLINED",
      "RESPONSE_OFFERED"].includes(value.eventType)
    || !Number.isSafeInteger(value.sourceByteLength)
    || value.sourceByteLength < 0
    || digest(value.schema, body) !== value.eventHash) fail("EVENT_INVALID");
  instant(value.recordedAt, "EVENT_RECORDED_AT_INVALID");
  if (value.sourceBodyHash !== null) hash(value.sourceBodyHash,
    "EVENT_SOURCE_BODY_HASH_INVALID");
  if (ordinal === 1) {
    if (value.eventType !== "LINK_ISSUED" || value.recordedAt !== definition.issuedAt
      || value.sourceBodyHash !== null || value.sourceByteLength !== 0
      || value.privatePayload !== null) fail("GENESIS_EVENT_INVALID");
  } else {
    if (ordinal !== 2 || value.eventType === "LINK_ISSUED"
      || Date.parse(value.recordedAt) < Date.parse(definition.issuedAt)) {
      fail("TERMINAL_EVENT_INVALID");
    }
    const responseEvent = value.eventType.startsWith("RESPONSE_");
    if (!responseEvent) {
      exact(value.privatePayload, ["reasonCode"], "REVOKE_PAYLOAD_INVALID");
      if (value.eventType !== "LINK_REVOKED" || value.sourceBodyHash !== null
        || value.sourceByteLength !== 0
        || !["REQUESTER_REVOKED", "TENDER_SUPERSEDED", "POLICY_REVOKED"]
          .includes(value.privatePayload.reasonCode)) {
        fail("TERMINAL_EVENT_INVALID");
      }
    } else {
      exact(value.privatePayload, ["contentType", "sourceBodyBase64",
        "normalizedResponse"], "RESPONSE_PAYLOAD_INVALID");
      if (value.sourceBodyHash === null || value.sourceByteLength < 1
        || Date.parse(value.recordedAt) >= Date.parse(definition.expiresAt)
        || !["application/json", "application/x-www-form-urlencoded"]
          .includes(value.privatePayload.contentType)
        || typeof value.privatePayload.sourceBodyBase64 !== "string") {
        fail("TERMINAL_EVENT_INVALID");
      }
      const sourceBytes = Buffer.from(value.privatePayload.sourceBodyBase64,
        "base64");
      if (sourceBytes.toString("base64")
          !== value.privatePayload.sourceBodyBase64
        || sourceBytes.length !== value.sourceByteLength
        || bytesHash(sourceBytes) !== value.sourceBodyHash) {
        fail("RESPONSE_PAYLOAD_INVALID");
      }
      const normalized = parseResponse(definition,
        value.privatePayload.contentType, sourceBytes, value.recordedAt);
      const expectedEventType = normalized.choice === "OFFER"
        ? "RESPONSE_OFFERED" : "RESPONSE_DECLINED";
      if (value.eventType !== expectedEventType
        || canonicalizeStrict(normalized)
          !== canonicalizeStrict(value.privatePayload.normalizedResponse)) {
        fail("RESPONSE_PAYLOAD_INVALID");
      }
    }
  }
  return value;
}

async function replay(state, definition) {
  let result;
  try { result = await state.store.read({ tokenHash: definition.tokenHash }); }
  catch { fail("STORE_READ_FAILED"); }
  if (result === null) return null;
  exact(result, ["headHash", "events"], "STORE_READ_RESULT_INVALID");
  if (!Array.isArray(result.events) || result.events.length < 1
    || result.events.length > 2) fail("STORE_EVENT_SET_INVALID");
  let previous = null;
  for (let index = 0; index < result.events.length; index += 1) {
    const checked = validateEvent(result.events[index], definition,
      index + 1, previous);
    previous = checked.eventHash;
  }
  if (result.headHash !== previous) fail("STORE_HEAD_MISMATCH");
  return { headHash: previous, events: result.events,
    current: result.events[result.events.length - 1] };
}

async function compareAndAppend(state, expectedHeadHash, event) {
  validateEvent(event, state.definition, event.ordinal, expectedHeadHash);
  let result;
  try {
    result = await state.store.compareAndAppend({
      tokenHash: state.definition.tokenHash,
      expectedHeadHash,
      event,
    });
  } catch { fail("STORE_COMPARE_AND_APPEND_FAILED"); }
  exact(result, ["status", "headHash"],
    "STORE_COMPARE_AND_APPEND_RESULT_INVALID");
  if (!["APPENDED", "CONFLICT"].includes(result.status)
    || (result.headHash !== null && !HASH.test(result.headHash))) {
    fail("STORE_COMPARE_AND_APPEND_RESULT_INVALID");
  }
  if (result.status === "APPENDED" && result.headHash !== event.eventHash) {
    fail("STORE_APPENDED_HEAD_MISMATCH");
  }
  return result;
}

function now(state) {
  let value;
  try { value = state.clock(); } catch { fail("CLOCK_FAILED"); }
  return instant(value, "CLOCK_INVALID");
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function responsePage(definition) {
  const summary = definition.summary;
  const currencies = definition.acceptedCurrencyCodes.map((currency) =>
    `<option value="${currency}">${currency}</option>`).join("");
  return Buffer.from(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(summary.title)}</title></head>
<body><main><h1>${escapeHtml(summary.title)}</h1><p>${escapeHtml(summary.outcome)}</p><dl><dt>Quantity</dt><dd>${escapeHtml(summary.quantity)}</dd><dt>Required by</dt><dd>${escapeHtml(summary.dueBy)}</dd><dt>Respond by</dt><dd>${escapeHtml(definition.expiresAt)}</dd></dl><p>${escapeHtml(summary.supplierInstructions)}</p><h2>Responsibility terms</h2><pre>${escapeHtml(definition.responsibilityTermsText)}</pre><p>Terms commitment: ${definition.responsibilityTermsHash}</p>
<h2>Decline</h2><form method="post"><input type="hidden" name="tenderHash" value="${definition.tenderHash}"><input type="hidden" name="choice" value="DECLINE"><select name="reasonCode"><option>NO_CAPACITY</option><option>SCOPE_UNSUPPORTED</option><option>POLICY_DECLINED</option><option>OTHER_DECLARED</option></select><button type="submit">Decline</button></form>
<h2>Offer</h2><form method="post"><input type="hidden" name="tenderHash" value="${definition.tenderHash}"><input type="hidden" name="choice" value="OFFER"><label>Currency <select name="currencyCode">${currencies}</select></label><label>Total minor units <input name="totalMinorUnits" inputmode="numeric" required></label><label>Service from <input name="serviceFrom" required></label><label>Service until <input name="serviceUntil" required></label><label>Offer valid until <input name="offerExpiresAt" required></label><input type="hidden" name="responsibilityTermsHash" value="${definition.responsibilityTermsHash}"><label><input type="checkbox" name="responsibilityAccepted" value="true" required>I accept the displayed frozen responsibility terms</label><button type="submit">Submit offer</button></form></main></body></html>`, "utf8");
}

function headers(contentType) {
  return Object.freeze({
    "content-type": contentType,
    "cache-control": "no-store, max-age=0",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
  });
}

function publicProjection(definition, status, event = null) {
  const body = {
    schema:
      OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_SCHEMAS.projection,
    schemaVersion: "1.0.0",
    tenderHash: definition.tenderHash,
    requirementKind: definition.requirementKind,
    requirementId: definition.requirementId,
    definitionHash: definition.definitionHash,
    expiresAt: definition.expiresAt,
    status,
    responseOccurrenceObserved: event?.eventType?.startsWith("RESPONSE_")
      ?? false,
    responseOccurrenceHash: event?.eventHash ?? null,
    responseSourceHash: event?.sourceBodyHash ?? null,
    sourceDeclaredChoice: event?.eventType === "RESPONSE_OFFERED" ? "OFFER"
      : event?.eventType === "RESPONSE_DECLINED" ? "DECLINE" : null,
    rawTokenProjected: false,
    orderSummaryProjected: false,
    rawResponseProjected: false,
    respondentIdentityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    providerAcceptanceEstablished: false,
    capacityReserved: false,
    priceEstablished: false,
    outcomeEstablished: false,
    paymentPerformed: false,
    humanQueueCreated: false,
    authority: "NONE",
    decisionState: "HOLD",
    boundary: OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_BOUNDARY,
  };
  return deepFreeze({ ...body, projectionHash: digest(body.schema, body) });
}

function httpResult(definition, statusCode, status, bodyBytes, contentType,
  event = null, privateSource = null) {
  const result = Object.freeze({
    statusCode,
    headers: headers(contentType),
    bodyBytes,
    publicProjection: publicProjection(definition, status, event),
  });
  if (privateSource !== null) PRIVATE_RESULTS.set(result,
    { consumed: false, ...privateSource });
  return result;
}

function message(definition, statusCode, status, text, event = null) {
  return httpResult(definition, statusCode, status,
    Buffer.from(`${text}\n`, "utf8"), "text/plain; charset=utf-8", event);
}

function parseForm(bytes) {
  const text = decodeUtf8(bytes, "FORM_INVALID");
  const params = new URLSearchParams(text);
  const object = {};
  for (const [key, value] of params) {
    if (Object.hasOwn(object, key)) fail("FORM_DUPLICATE_FIELD");
    object[key] = value;
  }
  return object;
}

function parseResponse(definition, contentType, bodyBytes, observedAt) {
  if (!Buffer.isBuffer(bodyBytes) || bodyBytes.length < 1
    || bodyBytes.length > MAX_BODY_BYTES) fail("RESPONSE_BODY_INVALID");
  let value;
  if (contentType === "application/json") {
    try { value = JSON.parse(decodeUtf8(bodyBytes,
      "RESPONSE_JSON_INVALID")); }
    catch { fail("RESPONSE_JSON_INVALID"); }
  } else if (contentType === "application/x-www-form-urlencoded") {
    value = parseForm(bodyBytes);
  } else fail("RESPONSE_CONTENT_TYPE_INVALID");
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.tenderHash !== definition.tenderHash) {
    fail("RESPONSE_TENDER_BINDING_INVALID");
  }
  if (value?.choice === "DECLINE") {
    exact(value, ["tenderHash", "choice", "reasonCode"],
      "DECLINE_RESPONSE_INVALID");
    if (!["NO_CAPACITY", "SCOPE_UNSUPPORTED", "POLICY_DECLINED",
      "OTHER_DECLARED"].includes(value.reasonCode)) {
      fail("DECLINE_REASON_INVALID");
    }
    return { choice: "DECLINE", reasonCode: value.reasonCode };
  }
  if (value?.choice !== "OFFER") fail("RESPONSE_CHOICE_INVALID");
  let offer;
  if (contentType === "application/json") {
    exact(value, ["tenderHash", "choice", "quote", "serviceWindow",
      "offerExpiresAt", "responsibility"], "OFFER_RESPONSE_INVALID");
    exact(value.quote, ["currencyCode", "totalMinorUnits"],
      "OFFER_QUOTE_INVALID");
    exact(value.serviceWindow, ["from", "until"],
      "OFFER_WINDOW_INVALID");
    exact(value.responsibility, ["accepted", "termsHash"],
      "OFFER_RESPONSIBILITY_INVALID");
    offer = { currencyCode: value.quote.currencyCode,
      totalMinorUnits: value.quote.totalMinorUnits,
      serviceFrom: value.serviceWindow.from,
      serviceUntil: value.serviceWindow.until,
      offerExpiresAt: value.offerExpiresAt,
      responsibilityAccepted: value.responsibility.accepted,
      responsibilityTermsHash: value.responsibility.termsHash };
  } else {
    exact(value, ["tenderHash", "choice", "currencyCode", "totalMinorUnits",
      "serviceFrom", "serviceUntil", "offerExpiresAt",
      "responsibilityTermsHash",
      "responsibilityAccepted"], "OFFER_RESPONSE_INVALID");
    offer = { ...value,
      totalMinorUnits: /^\d{1,13}$/u.test(value.totalMinorUnits)
        ? Number(value.totalMinorUnits) : NaN,
      responsibilityAccepted: value.responsibilityAccepted === "true" };
  }
  if (value.tenderHash !== definition.tenderHash
    || !definition.acceptedCurrencyCodes.includes(offer.currencyCode)
    || !Number.isSafeInteger(offer.totalMinorUnits)
    || offer.totalMinorUnits < 0 || offer.totalMinorUnits > MAX_QUOTE_MINOR
    || offer.responsibilityAccepted !== true
    || offer.responsibilityTermsHash !== definition.responsibilityTermsHash) {
    fail("OFFER_BINDING_INVALID");
  }
  const serviceFrom = instant(offer.serviceFrom, "OFFER_SERVICE_FROM_INVALID");
  const serviceUntil = instant(offer.serviceUntil,
    "OFFER_SERVICE_UNTIL_INVALID");
  const offerExpiresAt = instant(offer.offerExpiresAt,
    "OFFER_EXPIRES_AT_INVALID");
  const stateAt = instant(observedAt, "OFFER_OBSERVED_AT_INVALID");
  if (Date.parse(serviceUntil) <= Date.parse(serviceFrom)
    || Date.parse(serviceFrom) < Date.parse(stateAt)
    || Date.parse(serviceUntil) > Date.parse(definition.summary.dueBy)
    || Date.parse(offerExpiresAt) < Date.parse(serviceUntil)
    || Date.parse(offerExpiresAt) > Date.parse(definition.summary.dueBy)) {
    fail("OFFER_WINDOW_INVALID");
  }
  return { choice: "OFFER", quote: { currencyCode: offer.currencyCode,
    totalMinorUnits: offer.totalMinorUnits }, serviceWindow: {
    from: serviceFrom, until: serviceUntil }, offerExpiresAt, responsibility: {
    accepted: true, termsHash: offer.responsibilityTermsHash } };
}

function tokenMatches(definition, token) {
  try {
    const actual = oneUseTenderResponseTokenHashV1(token);
    return actual === definition.tokenHash;
  } catch {
    return false;
  }
}

/** Build a handler around an atomic, strongly-consistent append primitive. */
export function createOneUseTenderResponseLinkHandlerV1(input = {}) {
  exact(input, ["definition", "store", "clock"], "HANDLER_INPUT_INVALID");
  const definition = normalizeDefinition(input.definition);
  if (input.store === null || typeof input.store !== "object"
    || typeof input.store.read !== "function"
    || typeof input.store.compareAndAppend !== "function"
    || typeof input.clock !== "function") fail("HANDLER_INPUT_INVALID");
  const state = { definition, store: input.store, clock: input.clock };

  async function initialize() {
    const event = buildEvent(definition, 1, "LINK_ISSUED",
      definition.issuedAt, null, null, null);
    const appended = await compareAndAppend(state, null, event);
    if (appended.status === "APPENDED") {
      return publicProjection(definition, "LINK_ISSUED", event);
    }
    const current = await replay(state, definition);
    if (current?.events[0]?.eventHash !== event.eventHash) {
      fail("LINK_INITIALIZATION_CONFLICT");
    }
    return publicProjection(definition, "LINK_ALREADY_ISSUED",
      current.current);
  }

  async function handle(request = {}) {
    exact(request, ["method", "token", "contentType", "bodyBytes"],
      "REQUEST_INVALID");
    if (!tokenMatches(definition, request.token)) {
      return message(definition, 404, "TOKEN_NOT_FOUND", "Not found");
    }
    const current = await replay(state, definition);
    if (current === null) {
      return message(definition, 404, "LINK_NOT_INITIALIZED", "Not found");
    }
    const observedAt = now(state);
    if (Date.parse(observedAt) < Date.parse(definition.issuedAt)) {
      return message(definition, 425, "LINK_NOT_YET_ACTIVE",
        "Link not yet active", current.current);
    }
    if (request.method === "GET") {
      if (request.contentType !== null || request.bodyBytes !== null) {
        fail("GET_BODY_FORBIDDEN");
      }
      if (current.current.eventType === "LINK_REVOKED") {
        return message(definition, 410, "LINK_REVOKED", "Link revoked",
          current.current);
      }
      if (current.current.eventType.startsWith("RESPONSE_")) {
        return message(definition, 410, "RESPONSE_ALREADY_RECORDED",
          "Response already recorded", current.current);
      }
      if (Date.parse(observedAt) >= Date.parse(definition.expiresAt)) {
        return message(definition, 410, "LINK_EXPIRED", "Link expired",
          current.current);
      }
      return httpResult(definition, 200, "AWAITING_RESPONSE",
        responsePage(definition), "text/html; charset=utf-8", current.current);
    }
    if (request.method !== "POST") {
      return message(definition, 405, "METHOD_NOT_ALLOWED",
        "Method not allowed", current.current);
    }
    if (current.current.eventType === "LINK_REVOKED") {
      return message(definition, 410, "LINK_REVOKED", "Link revoked",
        current.current);
    }
    if (current.current.eventType.startsWith("RESPONSE_")) {
      return message(definition, 409, "RESPONSE_ALREADY_RECORDED",
        "Response already recorded", current.current);
    }
    if (Date.parse(observedAt) >= Date.parse(definition.expiresAt)) {
      return message(definition, 410, "LINK_EXPIRED", "Link expired",
        current.current);
    }
    let normalized;
    try {
      normalized = parseResponse(definition, request.contentType,
        request.bodyBytes, observedAt);
    } catch {
      return message(definition, 400, "RESPONSE_INVALID",
        "Invalid response", current.current);
    }
    const sourceBytes = Buffer.from(request.bodyBytes);
    const event = buildEvent(definition, 2,
      normalized.choice === "OFFER" ? "RESPONSE_OFFERED"
        : "RESPONSE_DECLINED",
      observedAt, current.headHash, sourceBytes, {
        contentType: request.contentType,
        sourceBodyBase64: sourceBytes.toString("base64"),
        normalizedResponse: normalized,
      });
    const appended = await compareAndAppend(state, current.headHash, event);
    if (appended.status !== "APPENDED") {
      return message(definition, 409, "RESPONSE_CONFLICT",
        "Response already recorded");
    }
    return httpResult(definition, 201, "RESPONSE_SOURCE_RECORDED_HOLD",
      Buffer.from("Response recorded\n", "utf8"),
      "text/plain; charset=utf-8", event, {
        eventHash: event.eventHash,
        sourceBodyHash: event.sourceBodyHash,
        sourceBytes,
        normalizedResponse: normalized,
      });
  }

  async function revoke(request = {}) {
    exact(request, ["expectedTenderHash", "reasonCode"],
      "REVOKE_REQUEST_INVALID");
    if (request.expectedTenderHash !== definition.tenderHash
      || !["REQUESTER_REVOKED", "TENDER_SUPERSEDED", "POLICY_REVOKED"]
        .includes(request.reasonCode)) fail("REVOKE_REQUEST_INVALID");
    const current = await replay(state, definition);
    if (current === null) fail("LINK_NOT_INITIALIZED");
    if (current.current.eventType !== "LINK_ISSUED") {
      return publicProjection(definition, "REVOKE_NOT_APPLIED",
        current.current);
    }
    const revokedAt = now(state);
    if (Date.parse(revokedAt) < Date.parse(definition.issuedAt)) {
      return publicProjection(definition, "LINK_NOT_YET_ACTIVE",
        current.current);
    }
    const event = buildEvent(definition, 2, "LINK_REVOKED", revokedAt,
      current.headHash, null, { reasonCode: request.reasonCode });
    const appended = await compareAndAppend(state, current.headHash, event);
    if (appended.status === "APPENDED") {
      return publicProjection(definition, "LINK_REVOKED", event);
    }
    const afterConflict = await replay(state, definition);
    if (afterConflict === null) fail("REVOKE_CONFLICT_STATE_MISSING");
    return publicProjection(definition, "REVOKE_CONFLICT",
      afterConflict.current);
  }

  async function readPersistedPrivateResponseSource() {
    const current = await replay(state, definition);
    if (current === null) fail("LINK_NOT_INITIALIZED");
    if (current.current.eventType === "LINK_ISSUED") {
      const status = Date.parse(now(state)) >= Date.parse(definition.expiresAt)
        ? "LINK_EXPIRED_NO_RESPONSE" : "AWAITING_RESPONSE";
      return Object.freeze({ status, privateSource: null });
    }
    if (current.current.eventType === "LINK_REVOKED") {
      return Object.freeze({ status: "LINK_REVOKED_NO_RESPONSE",
        privateSource: null });
    }
    const payload = current.current.privatePayload;
    const sourceBytes = Buffer.from(payload.sourceBodyBase64, "base64");
    return Object.freeze({
      status: "RESPONSE_SOURCE_RECORDED_HOLD",
      privateSource: Object.freeze({
        schema:
          OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_SCHEMAS.privateSource,
        schemaVersion: "1.0.0",
        event: structuredClone(current.current),
        eventHash: current.current.eventHash,
        sourceBodyHash: current.current.sourceBodyHash,
        sourceByteLength: current.current.sourceByteLength,
        contentType: payload.contentType,
        sourceBytes,
        normalizedResponse: deepFreeze(structuredClone(
          payload.normalizedResponse)),
        responseOccurrenceOnly: true,
        providerIdentityEstablished: false,
        resourceOwnerAuthorityEstablished: false,
        capacityReserved: false,
        decisionState: "HOLD",
      }),
    });
  }

  return Object.freeze({ initialize, handle, revoke,
    readPersistedPrivateResponseSource });
}

/** Claim exact response bytes once for downstream source replay. */
export function claimOneUseTenderResponseLinkPrivateSourceV1(result) {
  const state = PRIVATE_RESULTS.get(result);
  if (state === undefined || state.consumed) fail("PRIVATE_SOURCE_UNAVAILABLE");
  state.consumed = true;
  return Object.freeze({
    schema:
      OUTSIDER_ONE_USE_TENDER_RESPONSE_LINK_HANDLER_V1_SCHEMAS.privateSource,
    schemaVersion: "1.0.0",
    eventHash: state.eventHash,
    sourceBodyHash: state.sourceBodyHash,
    sourceBytes: Buffer.from(state.sourceBytes),
    normalizedResponse: deepFreeze(structuredClone(state.normalizedResponse)),
    responseOccurrenceOnly: true,
    providerIdentityEstablished: false,
    resourceOwnerAuthorityEstablished: false,
    capacityReserved: false,
    decisionState: "HOLD",
  });
}
