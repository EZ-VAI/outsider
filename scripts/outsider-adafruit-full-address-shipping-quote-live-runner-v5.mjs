#!/usr/bin/env node

/*
 * Provider-neutral, user-held Adafruit destination-quote runner v5.
 *
 * One private formation request selects a buyer-native route using generic
 * resource/interface fields.  This adapter compiles that route to Adafruit's
 * product 4474 (or another explicitly selected native resource), creates one
 * anonymous cookie session, and executes:
 *
 *   catalog -> isolated cart -> contact -> full address -> shipping rates
 *
 * The file grant is checked before any provider I/O.  Private values then move
 * through a factory-issued WeakMap grant and the source-specific WeakMap
 * contact/address grants.  No payment method, order submission, marketing
 * subscription, or shipping-method application is implemented.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  createOrderScopedBuyerNativeHttpsTransportV1,
} from "../src/outsider-order-scoped-buyer-native-https-transport-v1.js";
import {
  createAdafruitGuestShopperCommandBytesV1,
  issueAdafruitGuestShopperBuyerNativeCapabilityV1,
} from "../src/outsider-adafruit-guest-shopper-adapter-v1.js";
import {
  createAdafruitCheckoutContactCaptureCommandBytesV1,
  issueAdafruitCheckoutContactCaptureCapabilityV1,
  issueAdafruitPrivateCheckoutContactGrantV1,
} from "../src/outsider-adafruit-checkout-contact-capture-stage-v1.js";
import {
  createAdafruitFullAddressShippingQuoteCommandBytesV2,
  issueAdafruitFullAddressShippingQuoteCapabilityV2,
  issueAdafruitPrivateFullAddressShippingQuoteGrantV2,
} from "../src/outsider-adafruit-full-address-shipping-quote-stage-v2.js";
import {
  createBuyerNativeRouteEvidenceV1,
  OUTSIDER_BUYER_NATIVE_ROUTE_EVIDENCE_V1_SCHEMA,
  verifyBuyerNativeRouteEvidenceV1,
} from "../src/outsider-buyer-native-route-evidence-v1.js";

const PREFIX
  = "OUTSIDER_ADAFRUIT_FULL_ADDRESS_SHIPPING_QUOTE_LIVE_RUNNER_V5_";
export const OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_INPUT_SCHEMA_V5
  = "outsider/private-buyer-native-outcome-formation-run-request/v5";
export const OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_GRANT_SCHEMA_V5
  = "outsider/private-seller-origin-destination-quote-use-grant/v5";
export const OUTSIDER_PROVIDER_NEUTRAL_ACCEPTANCE_SPEC_SCHEMA_V5
  = "outsider/outcome-acceptance-spec/usb-cable/v5";
const PUBLIC_SCHEMA
  = "outsider/adafruit-full-address-shipping-quote-public-projection/v5";
const PRIVATE_MANIFEST_SCHEMA
  = "outsider/private-adafruit-full-address-shipping-quote-manifest/v5";
const ORIGIN = "https://www.adafruit.com";
const PROVIDER = "ADAFRUIT_GUEST_SHOPPER";
const INTERFACE_FAMILY = "BUYER_NATIVE_GUEST_CHECKOUT";
const PURPOSE = "DESTINATION_DELIVERABILITY_AND_ALL_IN_QUOTE_ONLY";
const PERMITTED_DISCLOSURES = Object.freeze([
  "CHECKOUT_CONTACT_EMAIL",
  "DESTINATION_FULL_ADDRESS",
  "DESTINATION_PHONE",
]);
const FORBIDDEN_ACTIONS = Object.freeze([
  "CROSS_ORIGIN_DISCLOSURE",
  "CROSS_PURPOSE_REUSE",
  "MARKETING_SUBSCRIPTION",
  "ORDER_SUBMISSION",
  "PAYMENT",
  "PII_PUBLIC_PROJECTION",
  "SHIPPING_METHOD_APPLICATION",
]);
const DEFAULT_PRIVATE_ROOT = path.join(process.cwd(), ".outsider", "private");
const MAX_PRIVATE_FILE_BYTES = 64 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const RUN_GRANTS = new WeakMap();
const CONSUMED_RUN_GRANTS = new WeakSet();

export const OUTSIDER_ADAFRUIT_FULL_ADDRESS_SHIPPING_QUOTE_RUNNER_V5_BOUNDARY
  = Object.freeze({
    inputModel: "PROVIDER_NEUTRAL_OUTCOME_AND_ROUTE_BINDING",
    compiledProvider: PROVIDER,
    compiledSellerOrigin: ORIGIN,
    supportedInterfaceFamily: INTERFACE_FAMILY,
    machineToMachine: true,
    interactiveBrowserActions: 0,
    modelCalls: 0,
    employeeTouches: 0,
    oneProcessCookieSession: true,
    exactInputBytesRequired: true,
    sellerOriginPurposeGrantRequired: true,
    privateRunGrantStorage: "WEAKMAP",
    sourceSpecificContactGrantStorage: "WEAKMAP",
    sourceSpecificDestinationGrantStorage: "WEAKMAP",
    permittedMethods: Object.freeze(["GET", "POST"]),
    permittedPaths: Object.freeze([
      "/product/{nativeResourceId}",
      "/shopping_cart",
      "/added",
      "/checkout",
    ]),
    exactRequestBodyPersisted: false,
    requestBodyHashPersisted: true,
    exactResponseBytesPrivate0600: true,
    rawPrivateInputProjected: false,
    paymentEndpointAllowed: false,
    paymentInputAccepted: false,
    paymentPerformed: false,
    orderEndpointAllowed: false,
    orderSubmitted: false,
    marketingSubscriptionAllowed: false,
    shippingMethodApplied: false,
    cartEstablishesCapacity: false,
    capacityReserved: false,
    independentOutcomeTruthEstablished: false,
    userResultCommitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return bytesHash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
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

function privateText(value, code, maximum = 256) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum
    || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function sellerOrigin(value, code) {
  if (typeof value !== "string") fail(`${code}_INVALID`);
  let parsed;
  try { parsed = new URL(value); } catch { fail(`${code}_INVALID`); }
  if (parsed.protocol !== "https:" || parsed.username !== ""
    || parsed.password !== "" || parsed.pathname !== "/"
    || parsed.search !== "" || parsed.hash !== "" || parsed.port !== "") {
    fail(`${code}_INVALID`);
  }
  return parsed.origin;
}

function exactStringArray(value, expected, code) {
  if (!Array.isArray(value)
    || canonicalizeStrict(value) !== canonicalizeStrict(expected)) {
    fail(`${code}_INVALID`);
  }
  return Object.freeze([...value]);
}

export function normalizeProviderNeutralRouteQuoteInputV5(value) {
  exact(value, ["schema", "schemaVersion", "outcome", "selectedRoute",
    "destination", "formationExpiresAt", "authorizations"], "INPUT");
  exact(value.outcome, ["acceptanceSpec", "budget", "completionDeadline"],
    "OUTCOME");
  exact(value.outcome.acceptanceSpec, ["schema", "schemaVersion",
    "connectorFrom", "connectorTo", "minimumLengthMillimeters",
    "dataTransferRequired", "powerTransferRequired",
    "requiredNominalVoltageVolts"], "ACCEPTANCE_SPEC");
  exact(value.outcome.budget, ["currency", "maximumAmountMinor"],
    "BUDGET");
  exact(value.selectedRoute, ["routeRole", "sellerOrigin",
    "interfaceFamily", "nativeResourceId", "quantity"], "SELECTED_ROUTE");
  exact(value.destination, ["firstName", "lastName", "email", "telephone",
    "countryCode", "region", "city", "postalCode", "streetLines",
    "providerAddressBinding"], "DESTINATION");
  exact(value.destination.providerAddressBinding, ["countryId", "regionId"],
    "PROVIDER_ADDRESS_BINDING");
  exact(value.authorizations, ["payment", "order", "marketing"],
    "AUTHORIZATIONS");
  if (value.schema !== OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_INPUT_SCHEMA_V5
    || value.schemaVersion !== "5.0.0"
    || typeof value.outcome.budget.currency !== "string"
    || !/^[A-Z]{3}$/u.test(value.outcome.budget.currency)
    || typeof value.outcome.budget.maximumAmountMinor !== "string"
    || !/^[1-9]\d{0,30}$/u.test(value.outcome.budget.maximumAmountMinor)
    || typeof value.selectedRoute.interfaceFamily !== "string"
    || !/^[A-Z][A-Z0-9_]{2,63}$/u.test(value.selectedRoute.interfaceFamily)
    || !["PRIMARY", "RECOVERY"].includes(value.selectedRoute.routeRole)
    || typeof value.selectedRoute.nativeResourceId !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u
      .test(value.selectedRoute.nativeResourceId)
    || !Number.isSafeInteger(value.selectedRoute.quantity)
    || value.selectedRoute.quantity < 1 || value.selectedRoute.quantity > 99
    || typeof value.destination.countryCode !== "string"
    || !/^[A-Z]{2}$/u.test(value.destination.countryCode)
    || !Array.isArray(value.destination.streetLines)
    || value.destination.streetLines.length < 1
    || value.destination.streetLines.length > 2
    || value.authorizations.payment !== false
    || value.authorizations.order !== false
    || value.authorizations.marketing !== false) fail("INPUT_INVALID");
  const acceptanceSpec = value.outcome.acceptanceSpec;
  if (acceptanceSpec.schema
      !== OUTSIDER_PROVIDER_NEUTRAL_ACCEPTANCE_SPEC_SCHEMA_V5
    || acceptanceSpec.schemaVersion !== "5.0.0"
    || acceptanceSpec.connectorFrom !== "USB_TYPE_A"
    || acceptanceSpec.connectorTo !== "USB_TYPE_C"
    || !Number.isSafeInteger(acceptanceSpec.minimumLengthMillimeters)
    || acceptanceSpec.minimumLengthMillimeters < 1
    || acceptanceSpec.minimumLengthMillimeters > 100_000
    || acceptanceSpec.dataTransferRequired !== true
    || acceptanceSpec.powerTransferRequired !== true
    || acceptanceSpec.requiredNominalVoltageVolts !== 5) {
    fail("ACCEPTANCE_SPEC_INVALID");
  }
  const completionDeadline = instant(value.outcome.completionDeadline,
    "COMPLETION_DEADLINE");
  const formationExpiresAt = instant(value.formationExpiresAt,
    "FORMATION_EXPIRES_AT");
  if (Date.parse(formationExpiresAt) >= Date.parse(completionDeadline)) {
    fail("FORMATION_MUST_EXPIRE_BEFORE_COMPLETION");
  }
  const destination = {
    firstName: privateText(value.destination.firstName, "FIRST_NAME", 128),
    lastName: privateText(value.destination.lastName, "LAST_NAME", 128),
    email: privateText(value.destination.email, "EMAIL", 254),
    telephone: privateText(value.destination.telephone, "TELEPHONE", 64),
    countryCode: value.destination.countryCode,
    region: privateText(value.destination.region, "REGION", 128),
    city: privateText(value.destination.city, "CITY", 128),
    postalCode: privateText(value.destination.postalCode, "POSTAL_CODE", 32),
    streetLines: Object.freeze(value.destination.streetLines.map((line) =>
      privateText(line, "STREET_LINE", 256))),
    providerAddressBinding: Object.freeze({
      countryId: privateText(value.destination.providerAddressBinding.countryId,
        "PROVIDER_COUNTRY_ID", 128),
      regionId: privateText(value.destination.providerAddressBinding.regionId,
        "PROVIDER_REGION_ID", 128),
    }),
  };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(destination.email)
    || !/[0-9]/u.test(destination.telephone)) fail("CONTACT_INVALID");
  return Object.freeze({
    schema: value.schema,
    schemaVersion: value.schemaVersion,
    outcome: Object.freeze({
      acceptanceSpec: Object.freeze({ ...acceptanceSpec }),
      budget: Object.freeze({ ...value.outcome.budget }),
      completionDeadline,
    }),
    selectedRoute: Object.freeze({ ...value.selectedRoute,
      sellerOrigin: sellerOrigin(value.selectedRoute.sellerOrigin,
        "SELLER_ORIGIN") }),
    destination: Object.freeze(destination),
    formationExpiresAt,
    authorizations: Object.freeze({ ...value.authorizations }),
  });
}

function decodeHtml(value) {
  return value.replaceAll("&#39;", "'").replaceAll("&quot;", "\"")
    .replaceAll("&amp;", "&").replaceAll("&nbsp;", " ");
}

function evaluateExactCatalogSpec(receipt, sourceOccurrenceHash,
  acceptanceSpec) {
  if (receipt === null || typeof receipt !== "object"
    || !Array.isArray(receipt.exchanges) || receipt.exchanges.length !== 1) {
    fail("CATALOG_SPEC_SOURCE_INVALID");
  }
  const source = receipt.exchanges[0];
  if (typeof source.bodyBase64 !== "string"
    || typeof source.bodyBytesHash !== "string"
    || !HASH.test(source.bodyBytesHash)) fail("CATALOG_SPEC_SOURCE_INVALID");
  const body = Buffer.from(source.bodyBase64, "base64");
  if (body.toString("base64") !== source.bodyBase64
    || body.length !== source.bodyBytes
    || bytesHash(body) !== source.bodyBytesHash) {
    fail("CATALOG_SPEC_SOURCE_BYTES_INVALID");
  }
  const text = decodeHtml(body.toString("utf8").replace(/<[^>]*>/gu, " "))
    .replace(/\s+/gu, " ");
  const connectorFromObserved
    = /(?:USB\s+Type\s+A|USB[- ]A|classic USB type A)/iu.test(text);
  const connectorToObserved
    = /(?:USB\s+Type\s+C|USB[- ]C|type C connector)/iu.test(text);
  const observedApproxLengthMillimeters = /(?:about one meter|1 meter)/iu
    .test(text) ? 1000 : /(?:3 feet|3 ft|3-foot|3 foot)/iu.test(text)
      ? 914 : null;
  const dataTransferObserved
    = /(?:transmitting|transmit|transfer(?:ring)?)\s+data/iu.test(text)
      || /data\s+and\s+power/iu.test(text);
  const powerTransferObserved
    = /(?:data\s+and\s+power|5V\s+power|power\s+delivery)/iu.test(text);
  const nominalVoltageVoltsObserved = /(?:force it to\s*)?5V\b/iu.test(text)
    ? 5 : null;
  const checks = Object.freeze([
    Object.freeze({ criterion: "CONNECTOR_FROM", expected: "USB_TYPE_A",
      satisfied: connectorFromObserved }),
    Object.freeze({ criterion: "CONNECTOR_TO", expected: "USB_TYPE_C",
      satisfied: connectorToObserved }),
    Object.freeze({ criterion: "MINIMUM_LENGTH_MILLIMETERS",
      expected: acceptanceSpec.minimumLengthMillimeters,
      observed: observedApproxLengthMillimeters,
      satisfied: observedApproxLengthMillimeters !== null
        && observedApproxLengthMillimeters
          >= acceptanceSpec.minimumLengthMillimeters }),
    Object.freeze({ criterion: "DATA_TRANSFER", expected: true,
      satisfied: dataTransferObserved }),
    Object.freeze({ criterion: "POWER_TRANSFER", expected: true,
      satisfied: powerTransferObserved }),
    Object.freeze({ criterion: "NOMINAL_VOLTAGE_VOLTS", expected: 5,
      observed: nominalVoltageVoltsObserved,
      satisfied: nominalVoltageVoltsObserved === 5 }),
  ]);
  const acceptanceSpecRefHash = digest(acceptanceSpec.schema, acceptanceSpec);
  const bodyValue = {
    schema: "outsider/exact-source-outcome-spec-evaluation/v5",
    schemaVersion: "5.0.0",
    evaluator: "ADAFRUIT_PRODUCT_HTML_EXACT_SOURCE_V1",
    nativeResourceId: receipt.product?.productId ?? null,
    acceptanceSpec,
    acceptanceSpecRefHash,
    sourceOccurrenceHash,
    sourceBodyBytes: body.length,
    sourceBodyBytesHash: source.bodyBytesHash,
    checks,
    accepted: checks.every((entry) => entry.satisfied),
    sourceOccurrenceOnly: true,
    independentOutcomeTruthEstablished: false,
  };
  return Object.freeze({ ...bodyValue,
    evaluationHash: digest(bodyValue.schema, bodyValue) });
}

export function normalizeProviderNeutralRouteQuoteGrantV5(value,
  inputBytesHash) {
  exact(value, ["schema", "schemaVersion", "supplierOrigin", "purpose",
    "permittedDisclosures", "forbiddenActions", "inputBytesHash",
    "authorizedAt", "expiresAt", "oneUse"], "FILE_GRANT");
  if (value.schema !== OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_GRANT_SCHEMA_V5
    || value.schemaVersion !== "5.0.0"
    || value.purpose !== PURPOSE || value.inputBytesHash !== inputBytesHash
    || value.oneUse !== true) fail("FILE_GRANT_INVALID");
  const permittedDisclosures = exactStringArray(value.permittedDisclosures,
    PERMITTED_DISCLOSURES, "PERMITTED_DISCLOSURES");
  const forbiddenActions = exactStringArray(value.forbiddenActions,
    FORBIDDEN_ACTIONS, "FORBIDDEN_ACTIONS");
  const authorizedAt = instant(value.authorizedAt, "GRANT_AUTHORIZED_AT");
  const expiresAt = instant(value.expiresAt, "GRANT_EXPIRES_AT");
  if (Date.parse(authorizedAt) >= Date.parse(expiresAt)) {
    fail("FILE_GRANT_INTERVAL_INVALID");
  }
  return Object.freeze({ ...value,
    supplierOrigin: sellerOrigin(value.supplierOrigin, "SUPPLIER_ORIGIN"),
    permittedDisclosures, forbiddenActions, authorizedAt, expiresAt });
}

function privateCanonical(file, code) {
  if (typeof file !== "string" || file === "") fail(`${code}_REQUIRED`);
  const absolute = path.resolve(file);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 3
    || info.size > MAX_PRIVATE_FILE_BYTES) fail(`${code}_NOT_PRIVATE`);
  const bytes = readFileSync(absolute);
  if (bytes.at(-1) !== 0x0a) fail(`${code}_PARTIAL`);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail(`${code}_NOT_CANONICAL`);
  }
  return Object.freeze({ absolute, bytes, bytesHash: bytesHash(bytes), value });
}

export function issueAdafruitPurposeBoundPrivateRunGrantV5(input = {}) {
  exact(input, ["inputRecord", "grantRecord"], "RUN_GRANT_INPUT");
  const inputRecord = input.inputRecord;
  const grantRecord = input.grantRecord;
  if (inputRecord === null || typeof inputRecord !== "object"
    || !Buffer.isBuffer(inputRecord.bytes)
    || bytesHash(inputRecord.bytes) !== inputRecord.bytesHash
    || grantRecord === null || typeof grantRecord !== "object"
    || !Buffer.isBuffer(grantRecord.bytes)
    || bytesHash(grantRecord.bytes) !== grantRecord.bytesHash) {
    fail("RUN_GRANT_RECORD_INVALID");
  }
  const normalizedInput = normalizeProviderNeutralRouteQuoteInputV5(
    inputRecord.value);
  const normalizedGrant = normalizeProviderNeutralRouteQuoteGrantV5(
    grantRecord.value, inputRecord.bytesHash);
  if (normalizedGrant.expiresAt !== normalizedInput.formationExpiresAt
    || normalizedGrant.supplierOrigin
      !== normalizedInput.selectedRoute.sellerOrigin) {
    fail("RUN_GRANT_BINDING_INVALID");
  }
  const grant = Object.freeze({
    schema: "outsider/private-adafruit-purpose-bound-run-grant/v5",
    schemaVersion: "5.0.0",
    inputBytesHash: inputRecord.bytesHash,
    fileGrantBytesHash: grantRecord.bytesHash,
    supplierOrigin: ORIGIN,
    purpose: PURPOSE,
    authorizedAt: normalizedGrant.authorizedAt,
    expiresAt: normalizedGrant.expiresAt,
    oneUse: true,
    rawPrivateInputProjected: false,
  });
  RUN_GRANTS.set(grant, Object.freeze({ input: normalizedInput,
    inputRecord, grant: normalizedGrant, grantRecord }));
  return grant;
}

function compileAdafruitRoute(input) {
  if (input.selectedRoute.sellerOrigin !== ORIGIN
    || input.selectedRoute.interfaceFamily !== INTERFACE_FAMILY
    || !/^[1-9]\d{0,9}$/u.test(input.selectedRoute.nativeResourceId)
    || input.outcome.budget.currency !== "USD"
    || input.destination.countryCode !== "US"
    || input.destination.region !== "Massachusetts"
    || input.destination.providerAddressBinding.countryId !== "223"
    || input.destination.providerAddressBinding.regionId !== "32") {
    fail("ADAFRUIT_ROUTE_COMPILATION_UNSUPPORTED");
  }
  return Object.freeze({ productId: input.selectedRoute.nativeResourceId,
    quantity: input.selectedRoute.quantity });
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("PRIVATE_DIRECTORY_INVALID");
}

function syncDirectory(directory) {
  let descriptor;
  try { descriptor = openSync(directory, "r"); fsyncSync(descriptor); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  chmodSync(file, 0o600);
  syncDirectory(path.dirname(file));
  return Object.freeze({ file, bytes: bytes.length, hash: bytesHash(bytes) });
}

function artifactInventory(root, relative = "") {
  const directory = path.join(root, relative);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0) fail("ARTIFACT_DIRECTORY_NOT_PRIVATE");
  const output = [];
  for (const name of readdirSync(directory).sort()) {
    const childRelative = relative === "" ? name : path.join(relative, name);
    const child = path.join(root, childRelative);
    const childInfo = lstatSync(child);
    if (childInfo.isSymbolicLink()) fail("ARTIFACT_SYMLINK_FORBIDDEN");
    if (childInfo.isDirectory()) {
      output.push(...artifactInventory(root, childRelative));
    } else {
      if (!childInfo.isFile() || (childInfo.mode & 0o077) !== 0) {
        fail("ARTIFACT_FILE_NOT_PRIVATE");
      }
      const bytes = readFileSync(child);
      output.push(Object.freeze({ relativePath: childRelative,
        bytes: bytes.length, bytesHash: bytesHash(bytes) }));
    }
  }
  return output;
}

function stageCommand(nonce, label, requestBytes, expiresAt, previous) {
  return Object.freeze({
    operationNonce: `adafruit-v5-${label}-${nonce}`,
    requestBytes,
    expiresAt,
    expectedPreviousOccurrenceHash: previous,
    triggerOccurrenceHash: null,
  });
}

function stageClaim(stageId, operation, result) {
  const projection = result.publicProjection;
  const summary = {
    stageId,
    operation,
    operationState: projection.operationState,
    runtimeState: projection.runtimeState,
    sourceState: projection.sourceState,
    sourceOccurrenceHash: projection.sourceOccurrenceHash,
    sourceBytesHash: projection.sourceBytesHash,
    sourceBytesLength: 0,
    retryPermitted: projection.retryPermitted,
  };
  if (projection.operationState !== "SOURCE_OCCURRENCE_OBSERVED") {
    return Object.freeze({ summary: Object.freeze(summary), receipt: null });
  }
  const claim = claimBuyerNativeTransactionSourceOccurrenceV1(result);
  let receipt;
  try { receipt = JSON.parse(claim.sourceBytes.toString("utf8")); }
  catch { fail("SOURCE_RECEIPT_JSON_INVALID"); }
  summary.sourceBytesLength = claim.sourceBytes.length;
  return Object.freeze({ summary: Object.freeze(summary), receipt });
}

function validateOutboundRequest(input, counters) {
  const parsed = new URL(String(input.url));
  const method = input.init?.method;
  if (!['GET', 'POST'].includes(method)) fail("OUTBOUND_METHOD_FORBIDDEN");
  const boundedCheckoutStep = method === "GET"
    && parsed.pathname === "/checkout"
    && /^\?step=[123]$/u.test(parsed.search);
  if (parsed.origin !== ORIGIN || parsed.hash !== ""
    || (parsed.search !== "" && !boundedCheckoutStep)) {
    fail("OUTBOUND_URL_FORBIDDEN");
  }
  const productPath = `/product/${input.productId}`;
  if (method === "GET"
    && ![productPath, "/shopping_cart", "/checkout"].includes(
      parsed.pathname)) fail("OUTBOUND_GET_PATH_FORBIDDEN");
  if (method === "POST" && !["/added", "/checkout"].includes(parsed.pathname)) {
    fail("OUTBOUND_POST_PATH_FORBIDDEN");
  }
  if (/payment|place[-_]?order|submit[-_]?order|\/orders?(?:$|\/)/iu
    .test(parsed.pathname)) fail("PAYMENT_OR_ORDER_ENDPOINT_FORBIDDEN");
  if (method === "POST") {
    const body = new URLSearchParams(Buffer.from(input.init.body).toString("utf8"));
    const action = body.get("action");
    if (parsed.pathname === "/added" && action !== "add_product") {
      fail("CART_ACTION_FORBIDDEN");
    }
    if (parsed.pathname === "/checkout"
      && !["save_one", "save_two"].includes(action)) {
      fail("CHECKOUT_ACTION_FORBIDDEN");
    }
    for (const [name, value] of body) {
      if (/payment|card|cvv|cvc|place[-_]?order|submit[-_]?order/iu.test(name)) {
        fail("PAYMENT_OR_ORDER_FIELD_FORBIDDEN");
      }
      if (/marketing|newsletter|subscribe|opt[-_]?in/iu.test(name)
        && value !== "" && !/^(?:0|false|off|no)$/iu.test(value)) {
        fail("MARKETING_SUBSCRIPTION_FORBIDDEN");
      }
    }
  }
  counters.liveHttpRequestCount += 1;
  if (method === "GET") counters.getRequestCount += 1;
  else counters.postRequestCount += 1;
}

function readCanonicalArtifact(file, schema, code) {
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0) {
    fail(`${code}_NOT_PRIVATE`);
  }
  const bytes = readFileSync(file);
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail(`${code}_JSON_INVALID`); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")
    || value.schema !== schema) fail(`${code}_INVALID`);
  return Object.freeze({ file, bytes: bytes.length, hash: bytesHash(bytes),
    value });
}

function reconcileCompleted(runDirectory, privateState) {
  const publicArtifact = readCanonicalArtifact(path.join(runDirectory,
    "public-projection.v5.json"), PUBLIC_SCHEMA, "RECONCILE_PROJECTION");
  const manifestArtifact = readCanonicalArtifact(path.join(runDirectory,
    "private-manifest.v5.json"), PRIVATE_MANIFEST_SCHEMA,
  "RECONCILE_MANIFEST");
  const projection = publicArtifact.value;
  const privateManifest = manifestArtifact.value;
  const { projectionHash, ...projectionBody } = projection;
  const { manifestHash, ...manifestBody } = privateManifest;
  if (projectionHash !== digest(PUBLIC_SCHEMA, projectionBody)
    || manifestHash !== digest(PRIVATE_MANIFEST_SCHEMA, manifestBody)
    || privateManifest.projectionHash !== projectionHash
    || privateManifest.inputBytesHash !== privateState.inputRecord.bytesHash
    || privateManifest.fileGrantBytesHash
      !== privateState.grantRecord.bytesHash) fail("RECONCILE_BINDING_INVALID");
  let routeEvidence = null;
  let routeEvidenceArtifact = null;
  if (privateManifest.routeEvidenceHash !== null) {
    routeEvidenceArtifact = readCanonicalArtifact(path.join(runDirectory,
      "route-evidence.v1.json"),
    OUTSIDER_BUYER_NATIVE_ROUTE_EVIDENCE_V1_SCHEMA,
    "RECONCILE_ROUTE_EVIDENCE");
    routeEvidence = verifyBuyerNativeRouteEvidenceV1(
      routeEvidenceArtifact.value);
    if (routeEvidence.evidenceHash !== privateManifest.routeEvidenceHash) {
      fail("RECONCILE_ROUTE_EVIDENCE_BINDING_INVALID");
    }
  }
  return Object.freeze({ runDirectory, projection: Object.freeze(projection),
    publicArtifact, privateManifest: Object.freeze(privateManifest),
    privateManifestArtifact: manifestArtifact, routeEvidence,
    routeEvidenceArtifact, reconciled: true });
}

export async function executeAdafruitFullAddressShippingQuoteLiveV5(
  options = {}) {
  const privateState = RUN_GRANTS.get(options.purposeGrant);
  if (privateState === undefined) fail("RUN_GRANT_NOT_FACTORY_ISSUED");
  if (CONSUMED_RUN_GRANTS.has(options.purposeGrant)) {
    fail("RUN_GRANT_ALREADY_CONSUMED");
  }
  const observedAt = instant(options.observedAt ?? new Date().toISOString(),
    "OBSERVED_AT");
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!/^[a-f0-9]{32}$/u.test(nonce)) fail("NONCE_INVALID");
  const privateRoot = path.resolve(options.privateRoot ?? DEFAULT_PRIVATE_ROOT);
  const runDirectory = path.join(privateRoot,
    `adafruit-full-address-quote-v5-${observedAt.slice(0, 10)
      .replaceAll("-", "")}-${nonce}`);
  if (options.reconcileOnly === true) {
    if (!existsSync(runDirectory)) fail("RECONCILE_RUN_MISSING");
    return reconcileCompleted(runDirectory, privateState);
  }
  if (options.reconcileOnly !== undefined && options.reconcileOnly !== false) {
    fail("RECONCILE_ONLY_INVALID");
  }
  if (Date.parse(observedAt) < Date.parse(privateState.grant.authorizedAt)
    || Date.parse(observedAt) >= Date.parse(privateState.grant.expiresAt)) {
    fail("RUN_GRANT_NOT_ACTIVE");
  }
  const input = privateState.input;
  const product = compileAdafruitRoute(input);
  ensurePrivateDirectory(privateRoot);
  if (existsSync(runDirectory)) fail("RUN_DIRECTORY_ALREADY_EXISTS");
  const grantUseDirectory = path.join(privateRoot, "adafruit-grant-use-v5");
  ensurePrivateDirectory(grantUseDirectory);
  const grantUseBody = {
    schema: "outsider/private-seller-origin-quote-grant-use/v5",
    schemaVersion: "5.0.0",
    observedAt,
    nonceHash: digest("outsider/private-adafruit-run-nonce/v5", nonce),
    inputBytesHash: privateState.inputRecord.bytesHash,
    fileGrantBytesHash: privateState.grantRecord.bytesHash,
    sellerOrigin: ORIGIN,
    purpose: PURPOSE,
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  let grantUseArtifact;
  try {
    grantUseArtifact = writeOnce(path.join(grantUseDirectory,
      `${privateState.grantRecord.bytesHash.slice(7)}.json`), {
      ...grantUseBody,
      claimHash: digest(grantUseBody.schema, grantUseBody),
    });
  } catch (error) {
    if (error?.code === "EEXIST") fail("FILE_GRANT_ALREADY_USED");
    throw error;
  }
  CONSUMED_RUN_GRANTS.add(options.purposeGrant);
  ensurePrivateDirectory(runDirectory);
  const runtimeDirectory = path.join(runDirectory, "runtime");
  ensurePrivateDirectory(runtimeDirectory);
  const counters = {
    liveHttpRequestCount: 0,
    getRequestCount: 0,
    postRequestCount: 0,
    cartPostCount: 0,
    contactPostCount: 0,
    addressQuotePostCount: 0,
    boundedCheckoutRedirectCount: 0,
    shippingMethodApplyAttemptCount: 0,
    paymentEndpointAttemptCount: 0,
    orderEndpointAttemptCount: 0,
    marketingSubscriptionAttemptCount: 0,
    modelCallCount: 0,
    interactiveBrowserActionCount: 0,
    employeeTouchCount: 0,
  };
  const rawFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof rawFetch !== "function") fail("FETCH_IMPL_INVALID");
  const countedFetch = async (url, init) => {
    validateOutboundRequest({ url, init, productId: product.productId },
      counters);
    const pathname = new URL(String(url)).pathname;
    if (init.method === "POST" && pathname === "/added") {
      counters.cartPostCount += 1;
    } else if (init.method === "POST" && pathname === "/checkout") {
      const action = new URLSearchParams(Buffer.from(init.body).toString("utf8"))
        .get("action");
      if (action === "save_one") counters.contactPostCount += 1;
      else if (action === "save_two") counters.addressQuotePostCount += 1;
    }
    return rawFetch(url, init);
  };
  const transport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: path.join(runDirectory, "https-state"),
    orderRefHash: digest("outsider/adafruit-full-address-live-http-order/v5",
      { nonce, inputBytesHash: privateState.inputRecord.bytesHash }),
    allowedOrigins: [ORIGIN],
    timeoutMs: options.timeoutMs ?? 20_000,
    maximumResponseBytes: 768 * 1024,
  }, { fetchImpl: countedFetch, clock: () => Date.parse(observedAt) });
  const boundedCheckoutStepTransport = async (request) => {
    let current = request;
    for (let hop = 0; hop < 3; hop += 1) {
      const response = await transport(current);
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        return response;
      }
      const rawLocation = response.headers?.location ?? null;
      const location = Array.isArray(rawLocation) ? rawLocation[0]
        : rawLocation;
      let target;
      try { target = new URL(location, current.url); }
      catch { fail("CHECKOUT_STEP_REDIRECT_INVALID"); }
      const currentUrl = new URL(current.url);
      const boundedCheckoutTarget = target.origin === ORIGIN
        && target.pathname === "/checkout"
        && /^\?step=[123]$/u.test(target.search) && target.hash === "";
      if (!boundedCheckoutTarget
        && currentUrl.pathname !== "/checkout"
        && target.pathname !== "/checkout") return response;
      if (!boundedCheckoutTarget) {
        fail("CHECKOUT_STEP_REDIRECT_FORBIDDEN");
      }
      counters.boundedCheckoutRedirectCount += 1;
      current = Object.freeze({
        ...current,
        step: `${request.step}_CHECKOUT_STEP_REDIRECT_${hop + 1}`,
        method: "GET",
        url: target.href,
        headers: Object.freeze({ accept: "text/html" }),
        bodyBytes: null,
      });
    }
    fail("CHECKOUT_STEP_REDIRECT_LIMIT_EXCEEDED");
  };
  const ref = (label) => digest("outsider/adafruit-live-ref/v5", {
    nonce,
    inputBytesHash: privateState.inputRecord.bytesHash,
    label,
  });
  const outcomeIntentRefHash = digest("outsider/outcome-intent/v5", {
    acceptanceSpecRefHash: digest(input.outcome.acceptanceSpec.schema,
      input.outcome.acceptanceSpec),
    budget: input.outcome.budget,
    completionDeadline: input.outcome.completionDeadline,
  });
  const acceptanceSpecRefHash = digest(input.outcome.acceptanceSpec.schema,
    input.outcome.acceptanceSpec);
  const maximumLossConstraintRefHash = digest(
    "outsider/maximum-loss-constraint/v5", input.outcome.budget);
  const recoveryOptionRefHash = digest("outsider/recovery-option-ref/v5", {
    outcomeIntentRefHash,
    selectedRoute: input.selectedRoute,
  });
  const destinationRefHash = digest("outsider/private-destination/v5",
    input.destination);
  const contactRefHash = digest("outsider/private-contact/v5", {
    destinationRefHash,
    email: input.destination.email,
    telephone: input.destination.telephone,
  });
  const accountRefHash = ref("guest-account");
  const nodeRefHash = ref("adafruit-node");
  const revalidateImpl = async (entry) => Object.freeze({
    active: true,
    capabilityRefHash: entry.capabilityRefHash,
    accountRefHash: entry.accountRefHash,
    observedAt: entry.observedAt,
    expiresAt: input.formationExpiresAt,
  });
  const createRuntime = (label, capability) =>
    createBuyerNativeTransactionRouteRuntimeV1({
      journalDirectory: runtimeDirectory,
      journalId: `transaction_${ref(`${label}-transaction`).slice(7, 39)}`,
      transactionRefHash: ref(`${label}-transaction`),
      outcomeIntentRefHash,
      routeRole: input.selectedRoute.routeRole,
      formationExpiresAt: input.formationExpiresAt,
    }, { capability, clock: () => observedAt });
  const stages = [];
  const appendStage = (stageId, operation, result) => {
    const claimed = stageClaim(stageId, operation, result);
    stages.push(claimed.summary);
    return claimed;
  };
  let exactSpecEvaluation = null;
  const finish = (runState, nextGate, finalQuote = null) => {
    const allInTotalMinor = finalQuote?.allInTotalMinor ?? null;
    const budgetSatisfied = Number.isSafeInteger(allInTotalMinor)
      && BigInt(allInTotalMinor)
        <= BigInt(input.outcome.budget.maximumAmountMinor);
    const body = {
      schema: PUBLIC_SCHEMA,
      schemaVersion: "5.0.0",
      schemaLineage: Object.freeze({
        revision: 1,
        rejectedPredecessorInputSchema:
          "outsider/private-sparkfun-full-address-prepayment-run-request/v1",
        predecessorSemanticDisposition:
          "REJECTED_WRONG_PROVIDER_SHAPED_INPUT",
        inPlaceMutationAllowed: false,
      }),
      observedAt,
      provider: PROVIDER,
      selectedRoute: Object.freeze({ ...input.selectedRoute }),
      routeCompiledProduct: product,
      acceptanceSpec: input.outcome.acceptanceSpec,
      acceptanceSpecRefHash,
      maximumLossConstraintRefHash,
      recoveryOptionRefHash,
      exactSpecEvaluation,
      outcomeIntentRefHash,
      routeRole: input.selectedRoute.routeRole,
      destinationRefHash,
      contactRefHash,
      budget: input.outcome.budget,
      completionDeadline: input.outcome.completionDeadline,
      stages: Object.freeze([...stages]),
      quote: finalQuote,
      allInTotalMinor,
      allInTotalProven: finalQuote?.allInTotalProven === true,
      budgetSatisfied,
      structuredEtaObserved: finalQuote?.structuredEtaObserved === true,
      deliveryDeadlineProven:
        finalQuote?.deliveryDeadlineProven === true,
      runState,
      nextGate,
      counters: Object.freeze({ ...counters }),
      executionClass: options.fetchImpl === undefined
        ? "LIVE_PROVIDER_HTTPS" : "INJECTED_HTTPS_TRANSPORT",
      sellerOriginPurposeGrantBound: true,
      factoryHeldPrivateRunGrant: true,
      factoryHeldContactGrant: true,
      factoryHeldDestinationGrant: true,
      rawPrivateInputProjected: false,
      rawContactProjected: false,
      rawAddressProjected: false,
      exactRequestBodyPersisted: false,
      requestBodyHashPersisted: true,
      exactResponseBytesPrivate0600: true,
      contactSubmitted: counters.contactPostCount === 1,
      fullAddressSubmitted: counters.addressQuotePostCount === 1,
      shippingMethodApplied: false,
      paymentAuthorized: false,
      paymentMethodSelected: false,
      paymentPerformed: false,
      orderAuthorized: false,
      orderSubmitted: false,
      marketingAuthorized: false,
      marketingSubscriptionPerformed: false,
      cartEstablishesCapacity: false,
      capacityReserved: false,
      independentOutcomeTruthEstablished: false,
      userResultCommitted: false,
      authority: "NONE",
      decisionState: "HOLD",
    };
    const projection = Object.freeze({ ...body,
      projectionHash: digest(PUBLIC_SCHEMA, body) });
    const publicArtifact = writeOnce(path.join(runDirectory,
      "public-projection.v5.json"), projection);
    let routeEvidence = null;
    let routeEvidenceArtifact = null;
    if (finalQuote !== null && stages.length === 6) {
      const catalogStage = stages[0];
      const finalStage = stages.at(-1);
      const sourceDeliveryDate = finalQuote.sourceDeliveryDate;
      routeEvidence = createBuyerNativeRouteEvidenceV1({
        routeProposalRefHash: projection.projectionHash,
        occurrenceRefHash: finalStage.sourceOccurrenceHash,
        recoveryOptionRefHash,
        observedAt,
        validUntil: input.formationExpiresAt,
        sourceReplayReceiptHash: finalStage.sourceBytesHash,
        facts: {
          specification: {
            sourceOccurrenceRefHash: catalogStage.sourceOccurrenceHash,
            frozenPredicateHash: acceptanceSpecRefHash,
            evaluationRefHash: exactSpecEvaluation.evaluationHash,
            status: exactSpecEvaluation.accepted ? "MATCH" : "MISMATCH",
          },
          allInPrice: {
            sourceOccurrenceRefHash: finalStage.sourceOccurrenceHash,
            constraintRefHash: maximumLossConstraintRefHash,
            currency: input.outcome.budget.currency,
            allInMinorUnits: finalQuote.allInTotalMinor,
            includesItemTaxShippingAndFees:
              finalQuote.allInTotalProven === true,
            status: finalQuote.allInTotalProven === true ? "COMPLETE"
              : finalQuote.allInTotalMinor === null ? "UNAVAILABLE"
                : "PARTIAL",
          },
          eta: {
            sourceOccurrenceRefHash: finalStage.sourceOccurrenceHash,
            completionDeadline: input.outcome.completionDeadline,
            estimatedCompletionAt: typeof sourceDeliveryDate === "string"
              ? `${sourceDeliveryDate}T23:59:59.999Z` : null,
            status: finalQuote.structuredEtaObserved === true
              ? "STRUCTURED" : "UNAVAILABLE",
          },
          capacity: {
            sourceOccurrenceRefHash: finalStage.sourceOccurrenceHash,
            capacityLifecycleRefHash: null,
            capacityLifecycleHeadHash: null,
            reservedFrom: null,
            reservedUntil: null,
            status: "UNRESERVED",
            sourceClass: "SELLER_SERVER_ACK_ONLY",
          },
        },
      });
      routeEvidenceArtifact = writeOnce(path.join(runDirectory,
        "route-evidence.v1.json"), routeEvidence);
    }
    const inventory = artifactInventory(runDirectory);
    const manifestBody = {
      schema: PRIVATE_MANIFEST_SCHEMA,
      schemaVersion: "5.0.0",
      observedAt,
      projectionHash: projection.projectionHash,
      inputBytesHash: privateState.inputRecord.bytesHash,
      fileGrantBytesHash: privateState.grantRecord.bytesHash,
      grantUseClaimBytesHash: grantUseArtifact.hash,
      routeEvidenceHash: routeEvidence?.evidenceHash ?? null,
      artifactInventory: Object.freeze(inventory),
      artifactCount: inventory.length,
      artifactBytes: inventory.reduce((sum, entry) => sum + entry.bytes, 0),
      exactSourceArtifactsRemainPrivate0600: true,
      exactRequestBodiesPersisted: false,
      requestBodyHashesPersisted: true,
      fullAddressSubmitted: projection.fullAddressSubmitted,
      shippingMethodApplied: false,
      paymentPerformed: false,
      orderSubmitted: false,
      marketingSubscriptionPerformed: false,
      capacityReserved: false,
      userResultCommitted: false,
    };
    const privateManifest = Object.freeze({ ...manifestBody,
      manifestHash: digest(PRIVATE_MANIFEST_SCHEMA, manifestBody) });
    const privateManifestArtifact = writeOnce(path.join(runDirectory,
      "private-manifest.v5.json"), privateManifest);
    return Object.freeze({ runDirectory, projection, publicArtifact,
      privateManifest, privateManifestArtifact, routeEvidence,
      routeEvidenceArtifact, reconciled: false });
  };

  const cartCapability = issueAdafruitGuestShopperBuyerNativeCapabilityV1({
    capabilityRefHash: ref("cart-capability"),
    accountRefHash,
    nodeRefHash,
    issuedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    ...product,
  }, { httpsRequestImpl: boundedCheckoutStepTransport, revalidateImpl });
  const cartRuntime = createRuntime("cart", cartCapability);
  const cartCommandBytes = createAdafruitGuestShopperCommandBytesV1(product);
  const catalogResult = await cartRuntime.quote(stageCommand(nonce,
    "catalog", cartCommandBytes, input.formationExpiresAt, null));
  const catalog = appendStage("01_CATALOG_QUOTE", "QUOTE", catalogResult);
  if (catalog.receipt === null
    || catalogResult.publicProjection.sourceState !== "QUOTE_AVAILABLE") {
    return finish("UNAVAILABLE_HOLD", "CATALOG_UNAVAILABLE");
  }
  exactSpecEvaluation = evaluateExactCatalogSpec(catalog.receipt,
    catalogResult.publicProjection.sourceOccurrenceHash,
    input.outcome.acceptanceSpec);
  if (!exactSpecEvaluation.accepted) {
    return finish("SPEC_REJECTED_HOLD", "DISCOVER_AN_EXACT_SPEC_ROUTE");
  }
  const cartResult = await cartRuntime.hold(stageCommand(nonce,
    "cart", cartCommandBytes, input.formationExpiresAt,
    catalogResult.publicProjection.sourceOccurrenceHash));
  const cart = appendStage("02_ISOLATED_GUEST_CART", "HOLD", cartResult);
  if (cart.receipt === null
    || cartResult.publicProjection.sourceState !== "CART_READY") {
    return finish("UNAVAILABLE_HOLD", "ISOLATED_CART_NOT_READY");
  }

  const contactGrant = issueAdafruitPrivateCheckoutContactGrantV1({
    contactRefHash,
    authorizedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    email: input.destination.email,
  });
  const contactCapability = issueAdafruitCheckoutContactCaptureCapabilityV1({
    capabilityRefHash: ref("contact-capability"),
    accountRefHash,
    nodeRefHash,
    issuedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    ...product,
    contactGrant,
  }, { httpsRequestImpl: boundedCheckoutStepTransport, revalidateImpl });
  const contactRuntime = createRuntime("contact", contactCapability);
  const contactCommandBytes
    = createAdafruitCheckoutContactCaptureCommandBytesV1(product);
  const contactQuoteResult = await contactRuntime.quote(stageCommand(nonce,
    "contact-form", contactCommandBytes, input.formationExpiresAt, null));
  const contactQuote = appendStage("03_CONTACT_FORM", "QUOTE",
    contactQuoteResult);
  if (contactQuote.receipt === null
    || contactQuoteResult.publicProjection.sourceState !== "QUOTE_AVAILABLE") {
    return finish("UNAVAILABLE_HOLD", "CONTACT_FORM_NOT_AVAILABLE");
  }
  const contactResult = await contactRuntime.hold(stageCommand(nonce,
    "contact-submit", contactCommandBytes, input.formationExpiresAt,
    contactQuoteResult.publicProjection.sourceOccurrenceHash));
  const contact = appendStage("04_CONTACT_SUBMIT", "HOLD", contactResult);
  if (contact.receipt === null
    || contactResult.publicProjection.sourceState !== "HOLD_ACKNOWLEDGED") {
    return finish("UNAVAILABLE_HOLD", "ADDRESS_FORM_NOT_AVAILABLE");
  }

  const destinationGrant = issueAdafruitPrivateFullAddressShippingQuoteGrantV2({
    destinationRefHash,
    authorizedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    firstName: input.destination.firstName,
    lastName: input.destination.lastName,
    telephone: input.destination.telephone,
    countryCode: input.destination.countryCode,
    region: input.destination.region,
    city: input.destination.city,
    postalCode: input.destination.postalCode,
    streetLines: [...input.destination.streetLines],
    providerCountryId: input.destination.providerAddressBinding.countryId,
    providerRegionId: input.destination.providerAddressBinding.regionId,
    completionDeadline: input.outcome.completionDeadline,
  });
  const addressCapability = issueAdafruitFullAddressShippingQuoteCapabilityV2({
    capabilityRefHash: ref("address-capability"),
    accountRefHash,
    nodeRefHash,
    issuedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    ...product,
    contactRefHash,
    destinationGrant,
  }, { httpsRequestImpl: boundedCheckoutStepTransport, revalidateImpl });
  const addressRuntime = createRuntime("address", addressCapability);
  const addressCommandBytes
    = createAdafruitFullAddressShippingQuoteCommandBytesV2(product);
  const addressQuoteResult = await addressRuntime.quote(stageCommand(nonce,
    "address-form", addressCommandBytes, input.formationExpiresAt, null));
  const addressQuote = appendStage("05_FULL_ADDRESS_FORM", "QUOTE",
    addressQuoteResult);
  if (addressQuote.receipt === null
    || addressQuoteResult.publicProjection.sourceState !== "QUOTE_AVAILABLE") {
    return finish("UNAVAILABLE_HOLD", "FULL_ADDRESS_FORM_NOT_AVAILABLE");
  }
  const addressResult = await addressRuntime.hold(stageCommand(nonce,
    "address-quote", addressCommandBytes, input.formationExpiresAt,
    addressQuoteResult.publicProjection.sourceOccurrenceHash));
  const address = appendStage("06_DESTINATION_SHIPPING_QUOTE", "HOLD",
    addressResult);
  if (address.receipt === null
    || addressResult.publicProjection.sourceState !== "HOLD_ACKNOWLEDGED") {
    return finish("UNAVAILABLE_HOLD", "DESTINATION_QUOTE_NOT_AVAILABLE");
  }
  return finish("DESTINATION_QUOTE_OBSERVED_NO_CAPACITY_HOLD",
    "RESOURCE_OWNER_CAPACITY_AND_SEPARATE_PAYMENT_ORDER_AUTHORIZATION",
    address.receipt.normalized.quote);
}

export async function runAdafruitFullAddressShippingQuoteLiveV5(options = {}) {
  const inputRecord = privateCanonical(options.inputFile, "INPUT_FILE");
  const grantRecord = privateCanonical(options.grantFile, "GRANT_FILE");
  const purposeGrant = issueAdafruitPurposeBoundPrivateRunGrantV5({
    inputRecord,
    grantRecord,
  });
  return executeAdafruitFullAddressShippingQuoteLiveV5({
    purposeGrant,
    privateRoot: options.privateRoot,
    observedAt: options.observedAt,
    nonce: options.nonce,
    timeoutMs: options.timeoutMs,
    fetchImpl: options.fetchImpl,
    reconcileOnly: options.reconcileOnly,
  });
}

function parseCli(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const known = new Set(["--live-no-payment-no-order", "--reconcile-only",
    "--input", "--grant", "--private-root", "--nonce"]);
  const output = { help: false, confirmed: false, reconcileOnly: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!known.has(flag)) fail("ARGUMENT_INVALID");
    if (flag === "--live-no-payment-no-order") {
      output.confirmed = true;
      continue;
    }
    if (flag === "--reconcile-only") {
      output.reconcileOnly = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      fail("ARGUMENT_VALUE_REQUIRED");
    }
    if (flag === "--input") output.inputFile = value;
    if (flag === "--grant") output.grantFile = value;
    if (flag === "--private-root") output.privateRoot = value;
    if (flag === "--nonce") output.nonce = value;
    index += 1;
  }
  if (!output.confirmed && !output.reconcileOnly) {
    fail("LIVE_NO_PAYMENT_NO_ORDER_CONFIRMATION_REQUIRED");
  }
  if (output.inputFile === undefined || output.grantFile === undefined) {
    fail("INPUT_AND_GRANT_REQUIRED");
  }
  if (output.reconcileOnly && output.nonce === undefined) {
    fail("RECONCILE_NONCE_REQUIRED");
  }
  return output;
}

async function main(argv) {
  const options = parseCli(argv);
  if (options.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/outsider-adafruit-full-address-shipping-quote-live-runner-v5.mjs \\",
      "    --live-no-payment-no-order --input MODE_0600_PROVIDER_NEUTRAL_JSON \\",
      "    --grant MODE_0600_SELLER_PURPOSE_GRANT [--private-root MODE_0700_DIR]",
      "",
      "Reconcile without provider I/O:",
      "  ... --reconcile-only --input FILE --grant FILE --private-root DIR --nonce HEX32",
      "",
    ].join("\n"));
    return;
  }
  const result = await runAdafruitFullAddressShippingQuoteLiveV5(options);
  process.stdout.write(`${canonicalizeStrict({
    runDirectory: result.runDirectory,
    publicProjection: result.projection,
    publicProjectionFile: result.publicArtifact.file,
    privateManifestFile: result.privateManifestArtifact.file,
    reconciled: result.reconciled,
  })}\n`);
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
