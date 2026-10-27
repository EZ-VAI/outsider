/*
 * Pure support for source-specific guest-cart adapters.
 *
 * This module does no I/O and accepts no URL from an outcome request. Vendor
 * adapters own their finite endpoint allowlists and inject an HTTPS closure
 * whose cookie/account state stays outside public projections.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_RESPONSE_BYTES = 768 * 1024;
const MAX_SOURCE_RECEIPT_BYTES = 1024 * 1024;

export function sourceSpecificCartFailV1(prefix, code) {
  const error = new TypeError(`${prefix}${code}`);
  error.outsiderCode = code;
  throw error;
}

export function exactSourceSpecificCartObjectV1(value, fields, prefix, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)) sourceSpecificCartFailV1(prefix, `${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    sourceSpecificCartFailV1(prefix, `${code}_FIELDS_INVALID`);
  }
  return value;
}

export function sourceSpecificCartHashV1(value, prefix, code) {
  if (typeof value !== "string" || !HASH.test(value)) {
    sourceSpecificCartFailV1(prefix, `${code}_INVALID`);
  }
  return value;
}

export function sourceSpecificCartInstantV1(value, prefix, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    sourceSpecificCartFailV1(prefix, `${code}_INVALID`);
  }
  return value;
}

export function sourceSpecificCartDigestV1(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

export function sourceSpecificCartBytesHashV1(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function createSourceSpecificCartCommandBytesV1(schema, provider,
  productId, quantity) {
  return Buffer.from(canonicalizeStrict({
    schema,
    schemaVersion: "1.0.0",
    provider,
    productId,
    quantity,
  }), "utf8");
}

export function validateSourceSpecificCartRequestV1(request, expected, prefix) {
  exactSourceSpecificCartObjectV1(request, [
    "schema", "transactionRefHash", "outcomeIntentRefHash", "routeRole",
    "operation", "effectIdHash", "idempotencyKey", "requestBytes",
    "expiresAt", "expectedPreviousOccurrenceHash", "triggerOccurrenceHash",
  ], prefix, "BUYER_NATIVE_REQUEST");
  if (request.schema !== "outsider/buyer-native-transaction-account-request/v1"
    || !["PRIMARY", "RECOVERY"].includes(request.routeRole)
    || !["QUOTE", "HOLD", "STATUS", "CANCEL"].includes(request.operation)
    || !Buffer.isBuffer(request.requestBytes)) {
    sourceSpecificCartFailV1(prefix, "BUYER_NATIVE_REQUEST_INVALID");
  }
  sourceSpecificCartHashV1(request.transactionRefHash, prefix,
    "TRANSACTION_REF_HASH");
  sourceSpecificCartHashV1(request.outcomeIntentRefHash, prefix,
    "OUTCOME_INTENT_REF_HASH");
  sourceSpecificCartHashV1(request.effectIdHash, prefix, "EFFECT_ID_HASH");
  sourceSpecificCartHashV1(request.idempotencyKey, prefix, "IDEMPOTENCY_KEY");
  sourceSpecificCartInstantV1(request.expiresAt, prefix, "REQUEST_EXPIRES_AT");
  let command;
  try { command = JSON.parse(request.requestBytes.toString("utf8")); }
  catch { sourceSpecificCartFailV1(prefix, "COMMAND_JSON_INVALID"); }
  exactSourceSpecificCartObjectV1(command, [
    "provider", "productId", "quantity", "schema", "schemaVersion",
  ], prefix, "COMMAND");
  if (canonicalizeStrict(command) !== request.requestBytes.toString("utf8")
    || command.schema !== expected.schema || command.schemaVersion !== "1.0.0"
    || command.provider !== expected.provider
    || command.productId !== expected.productId
    || command.quantity !== expected.quantity) {
    sourceSpecificCartFailV1(prefix, "COMMAND_BINDING_INVALID");
  }
  return request;
}

function selectedHeader(headers, name) {
  if (headers && typeof headers.get === "function") {
    const value = headers.get(name);
    return value === null || value === undefined ? null : String(value);
  }
  if (headers !== null && typeof headers === "object"
    && !Array.isArray(headers)) {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === name) return String(value);
    }
  }
  return null;
}

export function normalizeSourceSpecificHttpsResponseV1(raw, input, prefix) {
  exactSourceSpecificCartObjectV1(raw,
    ["status", "headers", "bodyBytes", "finalUrl"], prefix,
    "HTTPS_RESPONSE");
  if (!Number.isSafeInteger(raw.status) || raw.status < 100 || raw.status > 599
    || !Buffer.isBuffer(raw.bodyBytes)
    || raw.bodyBytes.length > MAX_RESPONSE_BYTES
    || typeof raw.finalUrl !== "string") {
    sourceSpecificCartFailV1(prefix, "HTTPS_RESPONSE_INVALID");
  }
  let expectedUrl;
  let finalUrl;
  try {
    expectedUrl = new URL(input.url);
    finalUrl = new URL(raw.finalUrl);
  } catch { sourceSpecificCartFailV1(prefix, "HTTPS_RESPONSE_URL_INVALID"); }
  if (expectedUrl.protocol !== "https:" || finalUrl.protocol !== "https:"
    || finalUrl.origin !== expectedUrl.origin
    || !input.allowedStatuses.includes(raw.status)) {
    sourceSpecificCartFailV1(prefix, "HTTPS_RESPONSE_NOT_ALLOWED");
  }
  return Object.freeze({
    step: input.step,
    method: input.method,
    url: input.url,
    requestBodyHash: input.bodyBytes === null ? null
      : sourceSpecificCartBytesHashV1(input.bodyBytes),
    status: raw.status,
    finalUrl: finalUrl.href,
    headers: Object.freeze({
      contentType: selectedHeader(raw.headers, "content-type"),
      date: selectedHeader(raw.headers, "date"),
      location: selectedHeader(raw.headers, "location"),
    }),
    bodyBytes: Buffer.from(raw.bodyBytes),
  });
}

export async function invokeSourceSpecificHttpsV1(requestExact, input, prefix) {
  const bodyBytes = input.bodyBytes === null ? null : Buffer.from(input.bodyBytes);
  const request = Object.freeze({
    schema: "outsider/source-specific-buyer-native-https-request/v1",
    schemaVersion: "1.0.0",
    provider: input.provider,
    sessionRefHash: input.sessionRefHash,
    operation: input.operation,
    step: input.step,
    method: input.method,
    url: input.url,
    headers: Object.freeze({ ...input.headers }),
    bodyBytes,
    redirectPolicy: "MANUAL_SAME_ORIGIN_ONLY",
    maximumResponseBytes: MAX_RESPONSE_BYTES,
  });
  let raw;
  try { raw = await requestExact(request); }
  catch { sourceSpecificCartFailV1(prefix, "HTTPS_TRANSPORT_FAILED"); }
  return normalizeSourceSpecificHttpsResponseV1(raw, {
    ...input,
    bodyBytes,
  }, prefix);
}

function exchangeSource(exchange) {
  return {
    step: exchange.step,
    method: exchange.method,
    url: exchange.url,
    requestBodyHash: exchange.requestBodyHash,
    status: exchange.status,
    finalUrl: exchange.finalUrl,
    headers: exchange.headers,
    bodyBytes: exchange.bodyBytes.length,
    bodyBytesHash: sourceSpecificCartBytesHashV1(exchange.bodyBytes),
    bodyBase64: exchange.bodyBytes.toString("base64"),
  };
}

export function createSourceSpecificCartReceiptBytesV1(input, prefix) {
  const body = {
    schema: input.schema,
    schemaVersion: "1.0.0",
    provider: input.provider,
    operation: input.operation,
    transactionRefHash: input.request.transactionRefHash,
    outcomeIntentRefHash: input.request.outcomeIntentRefHash,
    routeRole: input.request.routeRole,
    effectIdHash: input.request.effectIdHash,
    idempotencyKeyHash: input.request.idempotencyKey,
    product: input.product,
    lifecycleState: input.lifecycleState,
    nextGate: input.nextGate,
    normalized: input.normalized,
    exchanges: input.exchanges.map(exchangeSource),
    sourceOccurrenceOnly: true,
    cartEstablishesCapacity: false,
    cartAuthorizesPayment: false,
    cartCommitsUserResult: false,
    checkoutPerformed: false,
    addressSubmitted: false,
    paymentPerformed: false,
    orderSubmitted: false,
  };
  const sourceBytes = Buffer.from(canonicalizeStrict({ ...body,
    receiptHash: sourceSpecificCartDigestV1(input.schema, body),
  }), "utf8");
  if (sourceBytes.length < 1 || sourceBytes.length > MAX_SOURCE_RECEIPT_BYTES) {
    sourceSpecificCartFailV1(prefix, "SOURCE_RECEIPT_SIZE_INVALID");
  }
  return sourceBytes;
}

export function createSourceSpecificCartDriverResponseV1(input) {
  return Object.freeze({
    sourceBytes: input.sourceBytes,
    sourceState: input.sourceState,
    sourceExpiresAt: input.sourceExpiresAt,
    sourceRecordClass: input.sourceRecordClass,
  });
}
