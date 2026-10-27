/*
 * Cloudflare-native SparkFun/Magento deterministic executor v1.
 *
 * This is a versioned production descendant of the proven local
 * SparkFun full-address prepayment route.  A Formation Job carries only
 * hashes and the frozen PrincipalEpoch -> ... -> Attempt graph references.
 * The exact private parameter envelope is supplied out-of-band as one
 * provider-specific Worker secret and is hash-checked before any provider
 * request.  The executor can prepare a guest cart and shipping quote, but it
 * has no payment-information or order endpoint in its finite route table.
 *
 * Durable state is intentionally independent of the outer Formation Job
 * ledger.  An attempt is claimed before the first provider request, exact
 * request/response bytes are retained only in the private executor store, and
 * an observed orphaned attempt becomes effect-unknown / do-not-retry.  This
 * avoids duplicating a cart effect after an isolate restart.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS,
} from "./outsider-buyer-native-transaction-capability-v1.js";
import {
  formationJobIdentityV1,
} from "./outsider-formation-job-worker-v1.js";

const PREFIX = "OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_";
const ADAPTER_ID = "sparkfun-magento-cloudflare-no-payment";
const ADAPTER_VERSION = "1.0.0";
const PROVIDER = "SPARKFUN_MAGENTO_GUEST_CART";
const ORIGIN = "https://www.sparkfun.com";
const GUEST_CARTS_PATH = "/rest/V1/guest-carts";
const PRIVATE_ENVELOPE_SCHEMA
  = "outsider/private-sparkfun-full-address-prepayment-run-request/v1";
const PLAN_SCHEMA = "outsider/cloudflare-sparkfun-executor-plan/v1";
const REGISTRATION_SCHEMA
  = "outsider/cloudflare-sparkfun-executor-registration/v1";
const INVOCATION_SCHEMA = "outsider/formation-executor-invocation/v1";
const PRIVATE_EXCHANGE_SCHEMA
  = "outsider/cloudflare-sparkfun-private-https-exchange/v1";
const PRIVATE_RECEIPT_SCHEMA
  = "outsider/cloudflare-sparkfun-private-source-receipt/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_ENVELOPE_BYTES = 64 * 1024;
const MAX_INVOCATION_BYTES = 16 * 1024;
const MAX_RESPONSE_BYTES = 768 * 1024;
const REQUEST_TIMEOUT_MS = 20_000;
const CART_ID = /^[A-Za-z0-9_-]{16,128}$/u;

export const OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_SCHEMAS
  = Object.freeze({
    plan: PLAN_SCHEMA,
    registration: REGISTRATION_SCHEMA,
    invocation: INVOCATION_SCHEMA,
    privateEnvelope: PRIVATE_ENVELOPE_SCHEMA,
    sourceOccurrence:
      OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.sourceOccurrence,
  });

export const OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_BOUNDARY
  = Object.freeze({
    position: "CLOUDFLARE_SERVICE_BOUND_DETERMINISTIC_SELLER_EXECUTOR",
    provider: PROVIDER,
    transport: "DIRECT_PROVIDER_HTTPS",
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    oneExactRegistrationPerDeployment: true,
    exactPlanHashRequired: true,
    formationJobAndTypedGraphBindingRequired: true,
    privateEnvelopeSource: "PROVIDER_SPECIFIC_WORKER_SECRET_BASE64",
    privateEnvelopeHashCheckedBeforeEffect: true,
    privateEnvelopeProjected: false,
    privateProviderBytesProjected: false,
    durableAttemptBeforeExternalEffect: true,
    exactPrivateExchangeChunksRetained: true,
    coldReplaySupported: true,
    orphanedAttemptRetried: false,
    finiteProviderOrigin: ORIGIN,
    arbitraryUrlAccepted: false,
    promptAccepted: false,
    executableCodeAccepted: false,
    modelCalls: 0,
    browserClicks: 0,
    employeeTouches: 0,
    manualQueueAvailable: false,
    paymentMaterialAccepted: false,
    paymentEndpointAllowed: false,
    orderEndpointAllowed: false,
    paymentPerformed: false,
    orderSubmitted: false,
    capacityReserved: false,
    authorityMinted: false,
    sourceOccurrenceUpgradedToIndependentOutcomeTruth: false,
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function text(value, code, maximum = 256) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum
    || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function optionalText(value, code, maximum = 256) {
  return value === null ? null : text(value, code, maximum);
}

function bytesHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function digest(domain, value) {
  return bytesHash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function decodeBase64Exact(value, code) {
  if (typeof value !== "string" || value.length < 4
    || value.length > Math.ceil(MAX_ENVELOPE_BYTES / 3) * 4 + 4
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
      .test(value)) fail(`${code}_INVALID`);
  const bytes = Buffer.from(value, "base64");
  if (bytes.length < 3 || bytes.length > MAX_ENVELOPE_BYTES
    || bytes.toString("base64") !== value) fail(`${code}_INVALID`);
  return bytes;
}

function normalizeEnvelopeBytes(bytes) {
  if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
  if (bytes.length < 3 || bytes.length > MAX_ENVELOPE_BYTES
    || bytes.at(-1) !== 0x0a) fail("PRIVATE_ENVELOPE_BYTES_INVALID");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("PRIVATE_ENVELOPE_JSON_INVALID"); }
  exact(value, ["schema", "schemaVersion", "product", "destination",
    "budget", "completionDeadline", "formationExpiresAt",
    "paymentAuthorized", "orderAuthorized"], "PRIVATE_ENVELOPE");
  exact(value.product, ["catalogPath", "productId", "sku", "quantity"],
    "PRODUCT");
  exact(value.destination, ["firstName", "lastName", "email", "telephone",
    "countryCode", "regionId", "region", "regionCode", "city",
    "postalCode", "streetLines"], "DESTINATION");
  exact(value.budget, ["currency", "maximumAmountMinor"], "BUDGET");
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")
    || value.schema !== PRIVATE_ENVELOPE_SCHEMA
    || value.schemaVersion !== "1.0.0"
    || typeof value.product.catalogPath !== "string"
    || !/^\/[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?\.html$/u
      .test(value.product.catalogPath)
    || typeof value.product.productId !== "string"
    || !/^[1-9]\d{0,9}$/u.test(value.product.productId)
    || typeof value.product.sku !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/u.test(value.product.sku)
    || !Number.isSafeInteger(value.product.quantity)
    || value.product.quantity < 1 || value.product.quantity > 99
    || value.destination.countryCode !== value.destination.countryCode
      .toUpperCase()
    || !/^[A-Z]{2}$/u.test(value.destination.countryCode)
    || typeof value.destination.postalCode !== "string"
    || value.destination.postalCode !== value.destination.postalCode.trim()
    || !/^[A-Za-z0-9][A-Za-z0-9 .-]{0,31}$/u
      .test(value.destination.postalCode)
    || value.destination.regionId !== null
      && (!Number.isSafeInteger(value.destination.regionId)
        || value.destination.regionId < 1)
    || !Array.isArray(value.destination.streetLines)
    || value.destination.streetLines.length < 1
    || value.destination.streetLines.length > 4
    || value.budget.currency !== "USD"
    || typeof value.budget.maximumAmountMinor !== "string"
    || !/^[1-9]\d{0,30}$/u.test(value.budget.maximumAmountMinor)
    || value.paymentAuthorized !== false || value.orderAuthorized !== false) {
    fail("PRIVATE_ENVELOPE_BINDING_INVALID");
  }
  for (const [field, maximum] of [["firstName", 128], ["lastName", 128],
    ["email", 254], ["telephone", 64], ["city", 128]]) {
    text(value.destination[field], `DESTINATION_${field.toUpperCase()}`,
      maximum);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.destination.email)
    || !/[0-9]/u.test(value.destination.telephone)) fail("CONTACT_INVALID");
  optionalText(value.destination.region, "DESTINATION_REGION", 128);
  optionalText(value.destination.regionCode, "DESTINATION_REGION_CODE", 32);
  value.destination.streetLines.forEach((line) =>
    text(line, "DESTINATION_STREET_LINE", 256));
  const completionDeadline = instant(value.completionDeadline,
    "COMPLETION_DEADLINE");
  const formationExpiresAt = instant(value.formationExpiresAt,
    "FORMATION_EXPIRES_AT");
  if (Date.parse(formationExpiresAt) >= Date.parse(completionDeadline)) {
    fail("FORMATION_MUST_EXPIRE_BEFORE_COMPLETION");
  }
  return Object.freeze({ bytes: Buffer.from(bytes),
    bytesHash: bytesHash(bytes), value: Object.freeze({ ...value,
      product: Object.freeze({ ...value.product }),
      destination: Object.freeze({ ...value.destination,
        streetLines: Object.freeze([...value.destination.streetLines]) }),
      budget: Object.freeze({ ...value.budget }), completionDeadline,
      formationExpiresAt }) });
}

function normalizeRegistration(value) {
  exact(value, ["schema", "schemaVersion", "adapterId", "adapterVersion",
    "planHash", "orderId", "outcomeProgramHash", "parameterEnvelopeHash",
    "graphRefs", "issuedAt", "expiresAt"], "REGISTRATION");
  if (value.schema !== REGISTRATION_SCHEMA || value.schemaVersion !== "1.0.0"
    || value.adapterId !== ADAPTER_ID
    || value.adapterVersion !== ADAPTER_VERSION) fail("REGISTRATION_BINDING_INVALID");
  const identity = formationJobIdentityV1({
    schema: "outsider/formation-job/v1",
    orderId: value.orderId,
    planHash: value.planHash,
    adapterBinding: { adapterId: value.adapterId,
      adapterVersion: value.adapterVersion },
    outcomeProgramHash: value.outcomeProgramHash,
    parameterEnvelopeHash: value.parameterEnvelopeHash,
    graphRefs: value.graphRefs,
    issuedAt: value.issuedAt,
    expiresAt: value.expiresAt,
  });
  return Object.freeze({ ...value, graphRefs: identity.job.graphRefs,
    issuedAt: identity.job.issuedAt, expiresAt: identity.job.expiresAt });
}

/**
 * Compile one exact, deployable job/registration pair.  The returned secret is
 * private deployment material and must be piped only to `wrangler secret put`.
 */
export function compileCloudflareSparkFunExecutorDeploymentV1(input = {}) {
  exact(input, ["orderId", "outcomeProgramHash", "graphRefs",
    "privateEnvelopeBytes", "issuedAt", "expiresAt"], "COMPILER_INPUT");
  const envelope = normalizeEnvelopeBytes(input.privateEnvelopeBytes);
  const issuedAt = instant(input.issuedAt, "ISSUED_AT");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT");
  if (Date.parse(issuedAt) >= Date.parse(expiresAt)
    || Date.parse(expiresAt) > Date.parse(envelope.value.formationExpiresAt)) {
    fail("EXPIRY_BINDING_INVALID");
  }
  const graphRefs = formationJobIdentityV1({
    schema: "outsider/formation-job/v1",
    orderId: input.orderId,
    planHash: `sha256:${"0".repeat(64)}`,
    adapterBinding: { adapterId: ADAPTER_ID, adapterVersion: ADAPTER_VERSION },
    outcomeProgramHash: input.outcomeProgramHash,
    parameterEnvelopeHash: envelope.bytesHash,
    graphRefs: input.graphRefs,
    issuedAt,
    expiresAt,
  }).job.graphRefs;
  const planBody = {
    schema: PLAN_SCHEMA,
    schemaVersion: "1.0.0",
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    orderId: input.orderId,
    outcomeProgramHash: input.outcomeProgramHash,
    parameterEnvelopeHash: envelope.bytesHash,
    graphRefs,
    issuedAt,
    expiresAt,
    provider: PROVIDER,
    route: "CATALOG_CART_FULL_ADDRESS_SHIPPING_PREPAYMENT",
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  const planHash = digest(PLAN_SCHEMA, planBody);
  const job = formationJobIdentityV1({
    schema: "outsider/formation-job/v1",
    orderId: input.orderId,
    planHash,
    adapterBinding: { adapterId: ADAPTER_ID, adapterVersion: ADAPTER_VERSION },
    outcomeProgramHash: input.outcomeProgramHash,
    parameterEnvelopeHash: envelope.bytesHash,
    graphRefs,
    issuedAt,
    expiresAt,
  }).job;
  const registration = normalizeRegistration({
    schema: REGISTRATION_SCHEMA,
    schemaVersion: "1.0.0",
    adapterId: ADAPTER_ID,
    adapterVersion: ADAPTER_VERSION,
    planHash,
    orderId: job.orderId,
    outcomeProgramHash: job.outcomeProgramHash,
    parameterEnvelopeHash: job.parameterEnvelopeHash,
    graphRefs: job.graphRefs,
    issuedAt: job.issuedAt,
    expiresAt: job.expiresAt,
  });
  return Object.freeze({ job, registration,
    privateEnvelopeSecretBase64: envelope.bytes.toString("base64") });
}

/**
 * Validate deploy-time public registration and private secret as one binding.
 * The returned projection deliberately contains no decoded private material.
 */
export function validateCloudflareSparkFunExecutorDeploymentV1(input = {}) {
  exact(input, ["registration", "privateEnvelopeSecretBase64"],
    "DEPLOYMENT_VALIDATION_INPUT");
  const selectedRegistration = normalizeRegistration(input.registration);
  const envelope = normalizeEnvelopeBytes(decodeBase64Exact(
    input.privateEnvelopeSecretBase64, "PRIVATE_ENVELOPE_SECRET"));
  if (envelope.bytesHash !== selectedRegistration.parameterEnvelopeHash
    || Date.parse(selectedRegistration.expiresAt)
      > Date.parse(envelope.value.formationExpiresAt)) {
    fail("PRIVATE_ENVELOPE_HASH_MISMATCH");
  }
  return Object.freeze({
    adapterId: selectedRegistration.adapterId,
    adapterVersion: selectedRegistration.adapterVersion,
    planHash: selectedRegistration.planHash,
    parameterEnvelopeHash: selectedRegistration.parameterEnvelopeHash,
    privateEnvelopeProjected: false,
    configurationReady: true,
  });
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function unavailable(jobHash, reasonCode) {
  return Object.freeze({
    state: "UNAVAILABLE",
    reasonCode,
    resultHash: digest("outsider/cloudflare-sparkfun-unavailable/v1", {
      jobHash, reasonCode,
    }),
    sourceOccurrenceHashes: Object.freeze([]),
    externalEffect: "NONE",
    retryDisposition: "DO_NOT_RETRY",
  });
}

function interrupted(jobHash) {
  return Object.freeze({
    state: "HOLD",
    reasonCode: "SPARKFUN_EXECUTION_INTERRUPTED_EFFECT_UNKNOWN",
    resultHash: digest("outsider/cloudflare-sparkfun-interrupted/v1", {
      jobHash,
    }),
    sourceOccurrenceHashes: Object.freeze([]),
    externalEffect: "UNKNOWN",
    retryDisposition: "DO_NOT_RETRY",
  });
}

function moneyMinor(value, code) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) fail(`${code}_INVALID`);
  const minor = Math.round(amount * 100);
  if (Math.abs(amount * 100 - minor) > 1e-7) fail(`${code}_PRECISION_INVALID`);
  return BigInt(minor);
}

function parseCatalog(source, expectedProductId, expectedSku) {
  let item = null;
  for (const match of source.matchAll(
    /<script\b[^>]*\btype=["']text\/x-magento-init["'][^>]*>([\s\S]*?)<\/script>/giu,
  )) {
    let block;
    try { block = JSON.parse(match[1]); } catch { continue; }
    const candidate = block?.["*"]?.["Magento_Catalog/js/product/view/provider"]
      ?.data?.items?.[expectedProductId];
    if (String(candidate?.id) === expectedProductId) { item = candidate; break; }
  }
  let context = null;
  const contextMatch = source.match(
    /magentoStorefrontEvents\.context\.setProduct\((\{[^\n]+\})\)/u,
  );
  if (contextMatch !== null) {
    try { context = JSON.parse(contextMatch[1]); } catch {}
  }
  const price = Number(item?.price_info?.final_price);
  const name = item?.name;
  const currency = item?.currency_code;
  const inStock = (item?.is_salable === "1" || item?.is_salable === true)
    && item?.is_available === true;
  if (typeof name !== "string" || name.trim() === "" || currency !== "USD"
    || !Number.isFinite(price) || price <= 0
    || context?.productId !== Number(expectedProductId)
    || context?.sku !== expectedSku) fail("CATALOG_PRODUCT_INVALID");
  return Object.freeze({ name: name.trim(), currency, unitPrice: price,
    inStock, sourceUpdatedAt: typeof context.updatedAt === "string"
      ? context.updatedAt : null });
}

function parseCart(value, envelope) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.is_active !== true || !Array.isArray(value.items)
    || value.items.length !== 1 || value.items_count !== 1
    || Number(value.items_qty) !== envelope.product.quantity) {
    fail("CART_SOURCE_INVALID");
  }
  const item = value.items[0];
  if (item?.sku !== envelope.product.sku
    || Number(item.qty) !== envelope.product.quantity
    || !Number.isFinite(Number(item.price))) fail("EXACT_CART_ITEM_NOT_OBSERVED");
  return Object.freeze({ itemId: Number(item.item_id),
    unitPrice: Number(item.price) });
}

function parseTotals(value, envelope, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || value.quote_currency_code !== "USD"
    || Number(value.items_qty) !== envelope.product.quantity) fail(`${code}_INVALID`);
  const normalized = {
    currency: "USD",
    subtotal: Number(value.subtotal),
    shippingAmount: Number(value.shipping_amount ?? 0),
    taxAmount: Number(value.tax_amount ?? 0),
    grandTotal: Number(value.grand_total),
    itemsQuantity: Number(value.items_qty),
  };
  for (const [field, amount] of Object.entries(normalized)) {
    if (field !== "currency" && (!Number.isFinite(amount) || amount < 0)) {
      fail(`${code}_${field.toUpperCase()}_INVALID`);
    }
  }
  return Object.freeze(normalized);
}

function methodCode(value, code) {
  if (typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function parseRates(value) {
  if (!Array.isArray(value) || value.length > 128) fail("RATES_INVALID");
  const seen = new Set();
  return Object.freeze(value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)
      || typeof entry.available !== "boolean") fail("RATE_INVALID");
    const carrierCode = methodCode(entry.carrier_code, "CARRIER_CODE");
    const method = methodCode(entry.method_code, "METHOD_CODE");
    const key = `${carrierCode}\0${method}`;
    if (seen.has(key)) fail("RATE_DUPLICATE");
    seen.add(key);
    const amount = entry.available ? Number(entry.amount) : null;
    if (entry.available && (!Number.isFinite(amount) || amount < 0)) {
      fail("RATE_AMOUNT_INVALID");
    }
    return Object.freeze({ carrierCode, methodCode: method,
      carrierTitle: typeof entry.carrier_title === "string"
        ? entry.carrier_title : null,
      methodTitle: typeof entry.method_title === "string"
        ? entry.method_title : null,
      available: entry.available, amount });
  }));
}

function parsePaymentMethods(value) {
  if (!Array.isArray(value) || value.length > 128) {
    fail("PAYMENT_METHODS_SOURCE_INVALID");
  }
  const seen = new Set();
  return Object.freeze(value.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail("PAYMENT_METHOD_SOURCE_INVALID");
    }
    const code = methodCode(entry.code, "PAYMENT_METHOD_CODE");
    if (seen.has(code)) fail("PAYMENT_METHOD_DUPLICATE");
    seen.add(code);
    return Object.freeze({ code, title: typeof entry.title === "string"
      ? entry.title : null });
  }));
}

function magentoAddress(destination) {
  const value = {
    country_id: destination.countryCode,
    street: [...destination.streetLines],
    postcode: destination.postalCode,
    city: destination.city,
    firstname: destination.firstName,
    lastname: destination.lastName,
    email: destination.email,
    telephone: destination.telephone,
  };
  if (destination.regionId !== null) value.region_id = destination.regionId;
  if (destination.region !== null) value.region = destination.region;
  if (destination.regionCode !== null) value.region_code = destination.regionCode;
  return value;
}

function setCookieLines(headers) {
  if (typeof headers?.getSetCookie === "function") {
    const values = headers.getSetCookie();
    if (Array.isArray(values)) return values.map(String);
  }
  const combined = headers?.get?.("set-cookie");
  return combined === null || combined === undefined ? []
    : String(combined).split(/,(?=\s*[^;,=\s]+=)/u).map((line) => line.trim());
}

function applyCookies(jar, lines) {
  for (const line of lines) {
    const first = line.split(";", 1)[0];
    const offset = first.indexOf("=");
    if (offset < 1) continue;
    const name = first.slice(0, offset).trim();
    const value = first.slice(offset + 1).trim();
    if (/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u.test(name)
      && !/[;\u0000-\u001f\u007f]/u.test(value)) jar.set(name, value);
  }
}

function cookieHeader(jar) {
  return jar.size === 0 ? null
    : [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
}

function responseHeaders(response) {
  return Object.freeze({
    contentType: response.headers.get("content-type"),
    date: response.headers.get("date"),
    location: response.headers.get("location"),
  });
}

function jsonBytes(bytes, code) {
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
}

function validateStore(store) {
  if (store === null || typeof store !== "object"
    || ["read", "claim", "storePrivateExchange", "storePrivateOccurrence",
      "complete"].some((name) => typeof store[name] !== "function")) {
    fail("DURABLE_STORE_INVALID");
  }
  return store;
}

function createProviderTransport(state) {
  return async function providerRequest(step, method, path, body = null) {
    if (typeof path !== "string" || !path.startsWith("/")
      || path.includes("/payment-information")
      || /\/orders?(?:$|\/)/u.test(path)) fail("PROVIDER_ENDPOINT_FORBIDDEN");
    const url = `${ORIGIN}${path}`;
    const headers = { accept: path.endsWith(".html")
      ? "text/html" : "application/json" };
    if (body !== null) headers["content-type"] = "application/json";
    const cookie = cookieHeader(state.cookies);
    if (cookie !== null) headers.cookie = cookie;
    const requestBytes = body === null ? null
      : Buffer.from(canonicalizeStrict(body), "utf8");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    state.counters.liveHttpRequestCount += 1;
    if (method === "GET") state.counters.getRequestCount += 1;
    if (method === "POST") state.counters.postRequestCount += 1;
    let response;
    try {
      response = await state.fetchImpl(url, { method, headers,
        body: requestBytes, redirect: "manual", signal: controller.signal });
    } finally { clearTimeout(timeout); }
    const finalUrl = response.url === "" ? url : response.url;
    let parsedFinal;
    try { parsedFinal = new URL(finalUrl); } catch { fail("FINAL_URL_INVALID"); }
    const declaredLength = response.headers.get("content-length");
    if (declaredLength !== null && (!/^\d{1,9}$/u.test(declaredLength)
      || Number(declaredLength) > MAX_RESPONSE_BYTES)) fail("RESPONSE_TOO_LARGE");
    const responseBytes = Buffer.from(await response.arrayBuffer());
    if (responseBytes.length > MAX_RESPONSE_BYTES) fail("RESPONSE_TOO_LARGE");
    const privateSetCookies = setCookieLines(response.headers);
    const record = {
      schema: PRIVATE_EXCHANGE_SCHEMA,
      schemaVersion: "1.0.0",
      provider: PROVIDER,
      step,
      method,
      url,
      requestHeaders: headers,
      requestBodyBytesHash: requestBytes === null ? null : bytesHash(requestBytes),
      requestBodyBytes: requestBytes === null ? 0 : requestBytes.length,
      status: response.status,
      finalUrl,
      responseHeaders: responseHeaders(response),
      privateSetCookieLines: privateSetCookies,
      responseBodyBytesHash: bytesHash(responseBytes),
      responseBodyBytes: responseBytes.length,
    };
    const exchangeHash = digest(PRIVATE_EXCHANGE_SCHEMA, record);
    await state.store.storePrivateExchange({ exchangeHash, record,
      requestBytes, responseBytes });
    if (parsedFinal.origin !== ORIGIN || response.status !== 200
      || response.status >= 300 && response.status < 400) {
      fail("PROVIDER_RESPONSE_NOT_ALLOWED");
    }
    applyCookies(state.cookies, privateSetCookies);
    return Object.freeze({ exchangeHash, responseBytes,
      contentType: response.headers.get("content-type") });
  };
}

async function recordOccurrence(state, input) {
  const sourceBody = {
    schema: PRIVATE_RECEIPT_SCHEMA,
    schemaVersion: "1.0.0",
    provider: PROVIDER,
    jobHash: state.identity.jobHash,
    graphRefs: state.identity.job.graphRefs,
    stageId: input.stageId,
    operation: input.operation,
    product: state.envelope.product,
    normalized: input.normalized,
    exchangeHashes: input.exchangeHashes,
    sourceOccurrenceOnly: true,
    capacityReserved: false,
    independentOutcomeEstablished: false,
    paymentPerformed: false,
    orderSubmitted: false,
    userResultCommitted: false,
  };
  const sourceBytes = Buffer.from(canonicalizeStrict({ ...sourceBody,
    receiptHash: digest(PRIVATE_RECEIPT_SCHEMA, sourceBody) }), "utf8");
  const sourceBytesHash = bytesHash(sourceBytes);
  const observedAt = instant(state.clock(), "CLOCK");
  const effectIdHash = digest("outsider/cloudflare-sparkfun-effect/v1", {
    jobKey: state.identity.jobKey, stageId: input.stageId,
  });
  const occurrenceBody = {
    transactionRefHash: digest(
      "outsider/cloudflare-sparkfun-transaction/v1", {
        jobKey: state.identity.jobKey,
      }),
    outcomeIntentRefHash: state.identity.job.outcomeProgramHash,
    routeRole: "PRIMARY",
    operation: input.operation,
    effectIdHash,
    sourceBytesHash,
    sourceState: input.sourceState,
    sourceRecordClass: input.sourceRecordClass,
    sourceExpiresAt: state.identity.job.expiresAt,
    observedAt,
    previousSourceOccurrenceHash: state.previousOccurrenceHash,
  };
  const sourceOccurrenceHash = digest(
    OUTSIDER_BUYER_NATIVE_TRANSACTION_CAPABILITY_V1_SCHEMAS.sourceOccurrence,
    occurrenceBody);
  await state.store.storePrivateOccurrence({ sourceOccurrenceHash,
    occurrenceBody, sourceBytes });
  state.previousOccurrenceHash = sourceOccurrenceHash;
  state.sourceOccurrenceHashes.push(sourceOccurrenceHash);
  return sourceOccurrenceHash;
}

function resultFromProjection(projection, state, reasonCode) {
  return Object.freeze({
    state,
    reasonCode,
    resultHash: digest("outsider/cloudflare-sparkfun-result/v1", projection),
    sourceOccurrenceHashes: Object.freeze(
      [...projection.sourceOccurrenceHashes]),
    externalEffect: projection.counters.postRequestCount > 0
      ? "CONFIRMED" : projection.counters.liveHttpRequestCount > 0
        ? "READ_ONLY" : "NONE",
    retryDisposition: "DO_NOT_RETRY",
  });
}

async function executeProviderFlow(identity, envelope, store, dependencies) {
  const state = {
    identity, envelope, store,
    fetchImpl: dependencies.fetchImpl,
    clock: dependencies.clock,
    cookies: new Map(),
    sourceOccurrenceHashes: [],
    previousOccurrenceHash: null,
    counters: { liveHttpRequestCount: 0, getRequestCount: 0,
      postRequestCount: 0, paymentEndpointAttemptCount: 0,
      orderEndpointAttemptCount: 0, modelCallCount: 0,
      browserClickCount: 0, employeeTouchCount: 0 },
  };
  const request = createProviderTransport(state);
  const product = envelope.product;
  const catalogExchange = await request("CATALOG_GET", "GET",
    product.catalogPath);
  if (!/^text\/html(?:\s*;|\s*$)/iu.test(catalogExchange.contentType ?? "")) {
    fail("CATALOG_CONTENT_TYPE_INVALID");
  }
  const catalog = parseCatalog(catalogExchange.responseBytes.toString("utf8"),
    product.productId, product.sku);
  await recordOccurrence(state, { stageId: "01_CATALOG_QUOTE",
    operation: "QUOTE", sourceState: catalog.inStock
      ? "QUOTE_AVAILABLE" : "REJECTED",
    sourceRecordClass: "PUBLISHED_INVENTORY",
    normalized: { productId: product.productId, sku: product.sku,
      quantity: product.quantity, currency: catalog.currency,
      unitPrice: catalog.unitPrice, inStock: catalog.inStock,
      sourceUpdatedAt: catalog.sourceUpdatedAt },
    exchangeHashes: [catalogExchange.exchangeHash] });
  if (!catalog.inStock) {
    const projection = { schema: "outsider/cloudflare-sparkfun-public-result/v1",
      schemaVersion: "1.0.0", jobHash: identity.jobHash, provider: PROVIDER,
      sourceOccurrenceHashes: state.sourceOccurrenceHashes,
      finalTotalMinor: null, budgetSatisfied: false,
      readyForPaymentAuthorization: false, structuredEtaAvailable: false,
      deliveryDeadlineProven: false, counters: state.counters,
      privateEnvelopeProjected: false, paymentPerformed: false,
      orderSubmitted: false, capacityReserved: false };
    return resultFromProjection(projection, "UNAVAILABLE", "CATALOG_UNAVAILABLE");
  }

  const create = await request("GUEST_CART_CREATE_POST", "POST",
    GUEST_CARTS_PATH, {});
  const maskedCartId = jsonBytes(create.responseBytes, "GUEST_CART_CREATE");
  if (typeof maskedCartId !== "string" || !CART_ID.test(maskedCartId)) {
    fail("MASKED_CART_ID_INVALID");
  }
  const cartPath = `${GUEST_CARTS_PATH}/${encodeURIComponent(maskedCartId)}`;
  const add = await request("CART_ITEM_ADD_POST", "POST", `${cartPath}/items`,
    { cartItem: { qty: product.quantity, sku: product.sku } });
  const addedItem = jsonBytes(add.responseBytes, "CART_ITEM_ADD");
  if (addedItem?.sku !== product.sku
    || Number(addedItem.qty) !== product.quantity
    || !Number.isSafeInteger(Number(addedItem.item_id))) {
    fail("ADDED_ITEM_BINDING_INVALID");
  }
  const cartAfterAdd = await request("CART_GET_AFTER_ADD", "GET", cartPath);
  const cartNormalized = parseCart(jsonBytes(cartAfterAdd.responseBytes,
    "CART_AFTER_ADD"), envelope);
  const totalsAfterAdd = await request("TOTALS_GET_AFTER_ADD", "GET",
    `${cartPath}/totals`);
  const baseTotals = parseTotals(jsonBytes(totalsAfterAdd.responseBytes,
    "TOTALS_AFTER_ADD"), envelope, "TOTALS_AFTER_ADD");
  await recordOccurrence(state, { stageId: "02_ISOLATED_GUEST_CART",
    operation: "HOLD", sourceState: "CART_READY",
    sourceRecordClass: "CHECKOUT_RECEIPT",
    normalized: { productId: product.productId, sku: product.sku,
      quantity: product.quantity, itemId: cartNormalized.itemId,
      unitPrice: cartNormalized.unitPrice, subtotal: baseTotals.subtotal },
    exchangeHashes: [create.exchangeHash, add.exchangeHash,
      cartAfterAdd.exchangeHash, totalsAfterAdd.exchangeHash] });

  const destination = envelope.destination;
  const address = magentoAddress(destination);
  const cartBeforeRates = await request("CART_PREFLIGHT_GET_RATES", "GET",
    cartPath);
  parseCart(jsonBytes(cartBeforeRates.responseBytes, "CART_PREFLIGHT_RATES"),
    envelope);
  const ratesExchange = await request(
    "FULL_ADDRESS_SHIPPING_RATE_ESTIMATE_POST", "POST",
    `${cartPath}/estimate-shipping-methods`, { address });
  const rates = parseRates(jsonBytes(ratesExchange.responseBytes, "RATES"));
  await recordOccurrence(state, { stageId: "03_FULL_ADDRESS_SHIPPING_METHODS",
    operation: "QUOTE", sourceState: rates.some((rate) => rate.available)
      ? "QUOTE_AVAILABLE" : "REJECTED", sourceRecordClass: "QUOTE",
    normalized: { availableRateCount: rates.filter((rate) => rate.available).length,
      rates: rates.map((rate) => ({ carrierCode: rate.carrierCode,
        methodCode: rate.methodCode, available: rate.available,
        amount: rate.amount })), fullDeliveryAddressSubmitted: true,
      structuredEtaAvailable: false, deliveryDeadlineProven: false },
    exchangeHashes: [cartBeforeRates.exchangeHash, ratesExchange.exchangeHash] });
  const maximum = BigInt(envelope.budget.maximumAmountMinor);
  const subtotal = moneyMinor(baseTotals.subtotal, "SUBTOTAL");
  const feasible = rates.filter((rate) => rate.available
    && subtotal + moneyMinor(rate.amount, "RATE") <= maximum)
    .sort((left, right) => left.amount - right.amount
      || `${left.carrierCode}:${left.methodCode}`.localeCompare(
        `${right.carrierCode}:${right.methodCode}`));
  const selected = feasible[0];
  if (selected === undefined) {
    const projection = { schema: "outsider/cloudflare-sparkfun-public-result/v1",
      schemaVersion: "1.0.0", jobHash: identity.jobHash, provider: PROVIDER,
      sourceOccurrenceHashes: state.sourceOccurrenceHashes,
      finalTotalMinor: null, budgetSatisfied: false,
      readyForPaymentAuthorization: false, structuredEtaAvailable: false,
      deliveryDeadlineProven: false, counters: state.counters,
      privateEnvelopeProjected: false, paymentPerformed: false,
      orderSubmitted: false, capacityReserved: false };
    return resultFromProjection(projection, "UNAVAILABLE",
      "NO_SOURCE_OFFERED_METHOD_WITHIN_PRETAX_BUDGET");
  }

  const cartBeforeApply = await request("CART_PREFLIGHT_GET_APPLY", "GET",
    cartPath);
  parseCart(jsonBytes(cartBeforeApply.responseBytes, "CART_PREFLIGHT_APPLY"),
    envelope);
  const revalidate = await request(
    "FULL_ADDRESS_SHIPPING_RATE_REVALIDATE_POST", "POST",
    `${cartPath}/estimate-shipping-methods`, { address });
  const currentRates = parseRates(jsonBytes(revalidate.responseBytes,
    "REVALIDATED_RATES"));
  const current = currentRates.find((rate) => rate.available
    && rate.carrierCode === selected.carrierCode
    && rate.methodCode === selected.methodCode);
  if (current === undefined) fail("SELECTED_SHIPPING_METHOD_NOT_AVAILABLE");
  const shipping = await request("SHIPPING_INFORMATION_POST", "POST",
    `${cartPath}/shipping-information`, { addressInformation: {
      shipping_address: address, billing_address: { ...address },
      shipping_carrier_code: current.carrierCode,
      shipping_method_code: current.methodCode,
    } });
  const shippingSource = jsonBytes(shipping.responseBytes,
    "SHIPPING_INFORMATION");
  if (shippingSource === null || typeof shippingSource !== "object"
    || Array.isArray(shippingSource)) fail("SHIPPING_INFORMATION_INVALID");
  const paymentMethods = parsePaymentMethods(shippingSource.payment_methods);
  const preparedTotals = parseTotals(shippingSource.totals, envelope,
    "SHIPPING_INFORMATION_TOTALS");
  const cartAfterApply = await request("CART_GET_AFTER_SHIPPING_SELECTION",
    "GET", cartPath);
  parseCart(jsonBytes(cartAfterApply.responseBytes, "CART_AFTER_APPLY"),
    envelope);
  const totalsAfterApply = await request("TOTALS_GET_AFTER_SHIPPING_SELECTION",
    "GET", `${cartPath}/totals`);
  const finalTotals = parseTotals(jsonBytes(totalsAfterApply.responseBytes,
    "TOTALS_AFTER_APPLY"), envelope, "TOTALS_AFTER_APPLY");
  if (!same(preparedTotals, finalTotals)) fail("RECOMPUTED_TOTALS_MISMATCH");
  await recordOccurrence(state, { stageId: "04_APPLY_SHIPPING_AND_RECOMPUTE",
    operation: "HOLD", sourceState: paymentMethods.length > 0
      ? "CART_READY" : "HOLD_ACKNOWLEDGED",
    sourceRecordClass: "CHECKOUT_RECEIPT",
    normalized: { selectedShippingMethod: { carrierCode: current.carrierCode,
      methodCode: current.methodCode,
      sourceQuotedAmountMinor: moneyMinor(current.amount, "RATE").toString() },
      paymentMethodCount: paymentMethods.length, totals: finalTotals,
      fullDeliveryAddressSubmitted: true,
      readyForPaymentAuthorization: paymentMethods.length > 0,
      structuredEtaAvailable: false, deliveryDeadlineProven: false },
    exchangeHashes: [cartBeforeApply.exchangeHash, revalidate.exchangeHash,
      shipping.exchangeHash, cartAfterApply.exchangeHash,
      totalsAfterApply.exchangeHash] });

  const finalTotalMinor = moneyMinor(finalTotals.grandTotal,
    "FINAL_TOTAL").toString();
  const budgetSatisfied = BigInt(finalTotalMinor) <= maximum;
  const ready = paymentMethods.length > 0 && budgetSatisfied;
  const projection = {
    schema: "outsider/cloudflare-sparkfun-public-result/v1",
    schemaVersion: "1.0.0",
    jobHash: identity.jobHash,
    provider: PROVIDER,
    sourceOccurrenceHashes: state.sourceOccurrenceHashes,
    selectedShippingMethod: { carrierCode: current.carrierCode,
      methodCode: current.methodCode,
      sourceQuotedAmountMinor: moneyMinor(current.amount, "RATE").toString() },
    finalTotalMinor,
    budgetSatisfied,
    readyForPaymentAuthorization: ready,
    structuredEtaAvailable: false,
    deliveryDeadlineProven: false,
    counters: state.counters,
    privateEnvelopeProjected: false,
    paymentPerformed: false,
    orderSubmitted: false,
    capacityReserved: false,
  };
  const reasonCode = !budgetSatisfied ? "FINAL_TOTAL_EXCEEDS_BUDGET"
    : paymentMethods.length === 0 ? "PAYMENT_METHOD_UNAVAILABLE"
      : "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN";
  return resultFromProjection(projection, "HOLD", reasonCode);
}

/** Build the service-bound executor around one immutable registration. */
export function createCloudflareSparkFunExecutorV1(input = {}) {
  exact(input, ["registration", "privateEnvelopeSecretBase64", "store",
    "fetchImpl", "clock"], "EXECUTOR_INPUT");
  const registration = normalizeRegistration(input.registration);
  const store = validateStore(input.store);
  if (typeof input.fetchImpl !== "function" || typeof input.clock !== "function") {
    fail("DEPENDENCIES_INVALID");
  }
  let inFlight = null;

  async function handleInvocation(raw) {
    exact(raw, ["schema", "job", "jobHash", "jobKey"], "INVOCATION");
    if (raw.schema !== INVOCATION_SCHEMA) fail("INVOCATION_SCHEMA_INVALID");
    const identity = formationJobIdentityV1(raw.job);
    if (identity.jobHash !== raw.jobHash || identity.jobKey !== raw.jobKey) {
      fail("INVOCATION_HASH_MISMATCH");
    }
    const job = identity.job;
    const matches = job.adapterBinding.adapterId === registration.adapterId
      && job.adapterBinding.adapterVersion === registration.adapterVersion
      && job.planHash === registration.planHash
      && job.orderId === registration.orderId
      && job.outcomeProgramHash === registration.outcomeProgramHash
      && job.parameterEnvelopeHash === registration.parameterEnvelopeHash
      && same(job.graphRefs, registration.graphRefs)
      && job.issuedAt === registration.issuedAt
      && job.expiresAt === registration.expiresAt;
    if (!matches) return unavailable(identity.jobHash, "JOB_BINDING_MISMATCH");
    const now = instant(input.clock(), "CLOCK");
    if (Date.parse(now) < Date.parse(job.issuedAt)
      || Date.parse(now) >= Date.parse(job.expiresAt)) {
      return unavailable(identity.jobHash, "FORMATION_JOB_EXPIRED");
    }
    const secretBytes = decodeBase64Exact(input.privateEnvelopeSecretBase64,
      "PRIVATE_ENVELOPE_SECRET");
    const envelope = normalizeEnvelopeBytes(secretBytes);
    if (envelope.bytesHash !== job.parameterEnvelopeHash
      || Date.parse(job.expiresAt) > Date.parse(envelope.value.formationExpiresAt)) {
      return unavailable(identity.jobHash, "PRIVATE_ENVELOPE_HASH_MISMATCH");
    }
    const existing = await store.read();
    if (existing?.state === "COMPLETE") {
      return existing.jobHash === identity.jobHash ? existing.result
        : unavailable(identity.jobHash, "DURABLE_JOB_CONFLICT");
    }
    if (existing?.state === "RUNNING") {
      if (inFlight !== null) return inFlight;
      const result = interrupted(identity.jobHash);
      await store.complete({ jobHash: identity.jobHash, result,
        completedAt: now });
      return result;
    }
    const claim = await store.claim({ jobHash: identity.jobHash,
      jobKey: identity.jobKey, claimedAt: now });
    if (claim.status === "COMPLETE") return claim.result;
    if (claim.status === "CONFLICT") {
      return unavailable(identity.jobHash, "DURABLE_JOB_CONFLICT");
    }
    if (claim.status === "RUNNING") {
      if (inFlight !== null) return inFlight;
      const result = interrupted(identity.jobHash);
      await store.complete({ jobHash: identity.jobHash, result,
        completedAt: now });
      return result;
    }
    if (claim.status !== "CLAIMED") fail("DURABLE_CLAIM_INVALID");
    inFlight = (async () => {
      let result;
      try {
        result = await executeProviderFlow(identity, envelope.value, store, {
          fetchImpl: input.fetchImpl, clock: input.clock,
        });
      } catch {
        result = interrupted(identity.jobHash);
      }
      await store.complete({ jobHash: identity.jobHash, result,
        completedAt: instant(input.clock(), "CLOCK") });
      return result;
    })();
    try { return await inFlight; }
    finally { inFlight = null; }
  }

  return Object.freeze({
    handleInvocation,
    describe() {
      return Object.freeze({
        schema: REGISTRATION_SCHEMA,
        schemaVersion: "1.0.0",
        adapterId: registration.adapterId,
        adapterVersion: registration.adapterVersion,
        planHash: registration.planHash,
        parameterEnvelopeHash: registration.parameterEnvelopeHash,
        privateEnvelopeProjected: false,
        boundary: OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_BOUNDARY,
      });
    },
  });
}

/** In-memory reference store for focused tests only. */
export function createMemoryCloudflareSparkFunExecutorStoreV1() {
  let state = null;
  const exchanges = new Map();
  const occurrences = new Map();
  return Object.freeze({
    async read() { return state; },
    async claim(input) {
      if (state === null) {
        state = Object.freeze({ state: "RUNNING", ...input });
        return Object.freeze({ status: "CLAIMED" });
      }
      if (state.jobHash !== input.jobHash) {
        return Object.freeze({ status: "CONFLICT" });
      }
      return state.state === "COMPLETE"
        ? Object.freeze({ status: "COMPLETE", result: state.result })
        : Object.freeze({ status: "RUNNING" });
    },
    async storePrivateExchange(value) {
      exchanges.set(value.exchangeHash, value);
    },
    async storePrivateOccurrence(value) {
      occurrences.set(value.sourceOccurrenceHash, value);
    },
    async complete(value) {
      if (state === null || state.jobHash !== value.jobHash) {
        fail("DURABLE_COMPLETE_WITHOUT_CLAIM");
      }
      if (state.state === "COMPLETE") {
        if (state.result.resultHash !== value.result.resultHash) {
          fail("DURABLE_RESULT_CONFLICT");
        }
        return Object.freeze({ status: "EXISTING", result: state.result });
      }
      state = Object.freeze({ ...state, state: "COMPLETE",
        result: value.result, completedAt: value.completedAt });
      return Object.freeze({ status: "COMPLETED", result: state.result });
    },
    inspectForTest() {
      return Object.freeze({ state, exchangeCount: exchanges.size,
        occurrenceCount: occurrences.size,
        exchanges: Object.freeze([...exchanges.values()]),
        occurrences: Object.freeze([...occurrences.values()]) });
    },
  });
}

export const OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_LIMITS
  = Object.freeze({ maximumInvocationBytes: MAX_INVOCATION_BYTES,
    maximumPrivateEnvelopeBytes: MAX_ENVELOPE_BYTES,
    maximumProviderResponseBytes: MAX_RESPONSE_BYTES,
    providerRequestTimeoutMs: REQUEST_TIMEOUT_MS });
