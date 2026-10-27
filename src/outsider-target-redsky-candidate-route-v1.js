/*
 * Target/RedSky read-only candidate route v1.
 *
 * This adapter observes one Target PDP quote and one postal fulfillment
 * status through Target-owned GET interfaces. It cannot create a cart,
 * submit an address, reserve source-declared ATP, pay, or place an order.
 * The exact response bodies are returned to the buyer-native runtime, which
 * stores them as private 0600 source objects before projecting hashes.
 */

import { canonicalizeStrict } from "./canonical.js";
import {
  issueBuyerNativeTransactionAccountCapabilityV1,
} from "./outsider-buyer-native-transaction-capability-v1.js";
import {
  invokeSourceSpecificHttpsV1,
  sourceSpecificCartDigestV1,
  sourceSpecificCartFailV1,
  sourceSpecificCartHashV1,
  sourceSpecificCartInstantV1,
} from "./outsider-source-specific-guest-cart-support-v1.js";

const PREFIX = "OUTSIDER_TARGET_REDSKY_CANDIDATE_ROUTE_V1_";
const PROVIDER = "TARGET_REDSKY_READ_ONLY_CANDIDATE";
const PDP_ORIGIN = "https://redsky.target.com";
const PDP_PATH = "/redsky_aggregations/v1/web/pdp_client_v1";
const FULFILLMENT_PATH
  = "/redsky_aggregations/v1/web/product_fulfillment_v1";
/* This is Target's public web-interface key observed in the pinned PDP, not
   an account secret or user credential. A rotated key fails the route closed. */
const TARGET_PUBLIC_WEB_INTERFACE_KEY
  = "9f36aeafbe60771e321a7cc95a78140772ab3e96";
const COMMAND_SCHEMA = "outsider/target-redsky-candidate-command/v1";
const DATE_ONLY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const CAPABILITIES = new WeakMap();

export const OUTSIDER_TARGET_REDSKY_CANDIDATE_ROUTE_V1_BOUNDARY
  = Object.freeze({
    provider: PROVIDER,
    routeClass: "BUYER_NATIVE_PUBLIC_WEB_GET",
    supportedOperations: Object.freeze(["QUOTE", "STATUS"]),
    productInterface: `${PDP_ORIGIN}${PDP_PATH}`,
    fulfillmentInterface: `${PDP_ORIGIN}${FULFILLMENT_PATH}`,
    publicWebInterfaceKeyIsAccountCredential: false,
    authenticatedAccountUsed: false,
    arbitraryUrlAccepted: false,
    httpMethods: Object.freeze(["GET"]),
    cartMutationImplemented: false,
    fullAddressAccepted: false,
    paymentInputAccepted: false,
    paymentPerformed: false,
    orderSubmissionImplemented: false,
    rawResponseBodiesPreservedPrivatelyByBuyerNativeRuntime: true,
    sourceAvailableToPromiseIsReservation: false,
    sourceDeliveryDateIsBindingCommitment: false,
    exactProductAcceptanceRequiredBeforeSelection: true,
    sellerVoltageStatementRequiredForFixedOutcome: true,
    sameDaySelectionRequiresTargetAccountAuthority: true,
    candidateObservationAltersAtomicNetworkState: false,
    capacityReserved: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  sourceSpecificCartFailV1(PREFIX, code);
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function tcin(value) {
  if (typeof value !== "string" || !/^[1-9]\d{7}$/u.test(value)) {
    fail("TCIN_INVALID");
  }
  return value;
}

function quantity(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 99) {
    fail("QUANTITY_INVALID");
  }
  return value;
}

function postalCode(value) {
  if (typeof value !== "string" || !/^\d{5}(?:-\d{4})?$/u.test(value)) {
    fail("POSTAL_CODE_INVALID");
  }
  return value;
}

function stateCode(value) {
  if (typeof value !== "string" || !/^[A-Z]{2}$/u.test(value)) {
    fail("STATE_INVALID");
  }
  return value;
}

function storeId(value, code) {
  if (typeof value !== "string" || !/^[1-9]\d{0,7}$/u.test(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function coordinate(value, minimum, maximum, code) {
  if (typeof value !== "number" || !Number.isFinite(value)
    || value < minimum || value > maximum) fail(`${code}_INVALID`);
  return value;
}

function dateOnly(value, code) {
  if (typeof value !== "string" || !DATE_ONLY.test(value)
    || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10)
      !== value) fail(`${code}_INVALID`);
  return value;
}

function moneyMinorText(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d{0,11})$/u.test(value)) {
    fail("MAXIMUM_AMOUNT_MINOR_INVALID");
  }
  return value;
}

function sourceJson(sourceBytes, code) {
  if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length < 2) {
    fail(`${code}_SOURCE_BYTES_INVALID`);
  }
  let value;
  try { value = JSON.parse(sourceBytes.toString("utf8")); }
  catch { fail(`${code}_SOURCE_JSON_INVALID`); }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail(`${code}_SOURCE_INVALID`);
  }
  return value;
}

function sourceText(value, code, maximum = 8_192) {
  if (typeof value !== "string" || value.length < 1
    || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u
      .test(value)) fail(`${code}_INVALID`);
  return value;
}

function stripMarkup(value) {
  return sourceText(value, "SOURCE_MARKUP")
    .replace(/<[^>]{1,256}>/gu, " ")
    .replace(/&(?:#39|#x27);/giu, "'")
    .replace(/&(?:#8482|trade);/giu, "™")
    .replace(/&amp;/giu, "&")
    .replace(/&bull;/giu, " ")
    .replace(/\s+/gu, " ").trim();
}

function dollarsToMinor(value, code) {
  const dollars = Number(value);
  const minor = Math.round(dollars * 100);
  if (!Number.isFinite(dollars) || dollars < 0
    || !Number.isSafeInteger(minor)
    || Math.abs(dollars - minor / 100) > 1e-9) fail(`${code}_INVALID`);
  return minor;
}

function sourceQuantity(value, code) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) fail(`${code}_INVALID`);
  return number;
}

function sourceStatus(value, code) {
  if (typeof value !== "string" || !/^[A-Z][A-Z0-9_]{1,63}$/u.test(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function sourceInstant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail(`${code}_INVALID`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function descriptionField(bullets, label) {
  const prefix = `${label}:`;
  const matches = bullets.filter((item) => item.startsWith(prefix));
  if (matches.length !== 1) fail("PDP_SPEC_FIELD_INVALID");
  return matches[0].slice(prefix.length).trim();
}

export function normalizeTargetRedskyPdpSourceV1(sourceBytes, input = {}) {
  exact(input, ["tcin", "quantity", "maximumAmountMinor"], "PDP_INPUT");
  const expectedTcin = tcin(input.tcin);
  const expectedQuantity = quantity(input.quantity);
  const maximumAmountMinor = moneyMinorText(input.maximumAmountMinor);
  const source = sourceJson(sourceBytes, "PDP");
  const product = source.data?.product;
  if (product === null || typeof product !== "object"
    || Array.isArray(product) || product.tcin !== expectedTcin) {
    fail("PDP_PRODUCT_BINDING_INVALID");
  }
  const item = product.item;
  const description = item?.product_description;
  if (item === null || typeof item !== "object" || Array.isArray(item)
    || description === null || typeof description !== "object"
    || Array.isArray(description)
    || !Array.isArray(description.bullet_descriptions)) {
    fail("PDP_PRODUCT_DESCRIPTION_INVALID");
  }
  const bullets = description.bullet_descriptions.map(stripMarkup);
  const lengthText = descriptionField(bullets, "Cable/Cord Length");
  const lengthMatch = /^(\d+(?:\.\d+)?) Feet$/u.exec(lengthText);
  if (lengthMatch === null) fail("PDP_LENGTH_INVALID");
  const lengthFeet = Number(lengthMatch[1]);
  const connectionType = descriptionField(bullets, "Connection Type");
  const connectionGender = descriptionField(bullets, "Connection Gender");
  const connectionType2 = descriptionField(bullets, "Connection Types 2");
  const claims = [description.downstream_description,
    ...(description.soft_bullets?.bullets ?? [])]
    .filter((value) => typeof value === "string").map(stripMarkup).join(" ");
  const price = product.price;
  if (price === null || typeof price !== "object" || Array.isArray(price)
    || typeof price.formatted_current_price !== "string") {
    fail("PDP_PRICE_INVALID");
  }
  const unitPriceMinor = dollarsToMinor(price.current_retail,
    "PDP_CURRENT_RETAIL");
  const formattedPriceMatch
    = /^\$(\d+(?:\.\d{2})?)$/u.exec(price.formatted_current_price);
  if (formattedPriceMatch === null
    || dollarsToMinor(formattedPriceMatch[1], "PDP_FORMATTED_PRICE")
      !== unitPriceMinor) fail("PDP_FORMATTED_PRICE_MISMATCH");
  const lengthMeters = lengthFeet * 0.3048;
  const minimumStandardShippingCartMinor = dollarsToMinor(
    item.cart_add_on_threshold, "PDP_CART_ADD_ON_THRESHOLD");
  if (product.free_shipping?.enabled !== false) {
    fail("PDP_FREE_SHIPPING_STATE_INVALID");
  }
  const shippingMinimumMet
    = unitPriceMinor >= minimumStandardShippingCartMinor;
  const standardShippingBudgetFeasible
    = BigInt(minimumStandardShippingCartMinor) <= BigInt(maximumAmountMinor);
  const chargingClaimed = /\bcharg(?:e|es|ed|ing)\b/iu.test(claims);
  const dataTransferClaimed = /\bdata\s+transfers?\b/iu.test(claims);
  const voltageExplicitlyStatedBySeller
    = /(?:^|[^\p{L}\p{N}])5\s*(?:v(?:olt(?:s|age)?)?)(?:[^\p{L}\p{N}]|$)/iu
      .test(claims);
  const connectorsMatch = connectionType.toUpperCase() === "USB-C"
    && connectionType2.toUpperCase() === "USB-A";
  const genderMatches = connectionGender.toUpperCase() === "MALE-TO-MALE";
  const lengthMatches = lengthMeters >= 0.9 && lengthMeters <= 1.1;
  const exactAcceptanceSatisfied = expectedQuantity === 1 && connectorsMatch
    && genderMatches && lengthMatches && chargingClaimed
    && dataTransferClaimed && voltageExplicitlyStatedBySeller;
  return deepFreeze({
    productId: expectedTcin,
    upc: sourceText(item.primary_barcode, "PDP_UPC", 64),
    title: stripMarkup(description.title),
    quantity: expectedQuantity,
    currency: "USD",
    currencyBasis: "TARGET_US_WEB_INTERFACE",
    unitPriceMinor,
    formattedUnitPrice: price.formatted_current_price,
    itemPriceWithinBudget: BigInt(unitPriceMinor) <= BigInt(maximumAmountMinor),
    minimumStandardShippingCartMinor,
    shippingMinimumMet,
    standardShippingBudgetFeasible,
    standardShippingRouteState: shippingMinimumMet
      ? "MINIMUM_MET_NOT_RESERVED"
      : standardShippingBudgetFeasible
        ? "MINIMUM_NOT_MET" : "BUDGET_INFEASIBLE",
    connectionType,
    connectionType2,
    connectionGender,
    connectorA: "USB_A_MALE",
    connectorB: "USB_C_MALE",
    lengthFeet,
    lengthMeters,
    chargingClaimed,
    dataTransferClaimed,
    voltageExplicitlyStatedBySeller,
    exactAcceptanceSatisfied,
    blockingAcceptanceGaps: exactAcceptanceSatisfied ? []
      : [...(!connectorsMatch ? ["CONNECTOR_MISMATCH"] : []),
        ...(!genderMatches ? ["CONNECTION_GENDER_MISMATCH"] : []),
        ...(!lengthMatches ? ["LENGTH_MISMATCH"] : []),
        ...(!chargingClaimed ? ["CHARGING_CLAIM_MISSING"] : []),
        ...(!dataTransferClaimed ? ["DATA_TRANSFER_CLAIM_MISSING"] : []),
        ...(!voltageExplicitlyStatedBySeller
          ? ["EXPLICIT_5V_SOURCE_STATEMENT_MISSING"] : [])],
    publishedQuoteEstablishesCapacity: false,
    capacityReserved: false,
    paymentPerformed: false,
    orderSubmitted: false,
  });
}

function normalizeService(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || typeof value.is_two_day_shipping !== "boolean"
    || typeof value.is_base_shipping_method !== "boolean") {
    fail("FULFILLMENT_SERVICE_INVALID");
  }
  return Object.freeze({
    shippingMethodId: sourceStatus(value.shipping_method_id,
      "SHIPPING_METHOD_ID"),
    shortDescription: sourceText(value.shipping_method_short_description,
      "SHIPPING_METHOD_DESCRIPTION", 256),
    serviceLevelDescription: sourceText(value.service_level_description,
      "SHIPPING_SERVICE_LEVEL", 256),
    isTwoDayShipping: value.is_two_day_shipping,
    isBaseShippingMethod: value.is_base_shipping_method,
    cutoff: sourceInstant(value.cutoff, "SHIPPING_CUTOFF"),
    minDeliveryDate: dateOnly(value.min_delivery_date,
      "MIN_DELIVERY_DATE"),
    maxDeliveryDate: dateOnly(value.max_delivery_date,
      "MAX_DELIVERY_DATE"),
  });
}

export function normalizeTargetRedskyFulfillmentSourceV1(sourceBytes,
  input = {}) {
  exact(input, ["tcin", "quantity", "requestedDeliveryDate"],
    "FULFILLMENT_INPUT");
  const expectedTcin = tcin(input.tcin);
  const expectedQuantity = quantity(input.quantity);
  const requestedDeliveryDate = dateOnly(input.requestedDeliveryDate,
    "REQUESTED_DELIVERY_DATE");
  const source = sourceJson(sourceBytes, "FULFILLMENT");
  const product = source.data?.product;
  const fulfillment = product?.fulfillment;
  const shipping = fulfillment?.shipping_options;
  if (product === null || typeof product !== "object"
    || Array.isArray(product) || product.tcin !== expectedTcin
    || fulfillment === null || typeof fulfillment !== "object"
    || Array.isArray(fulfillment) || shipping === null
    || typeof shipping !== "object" || Array.isArray(shipping)
    || !Array.isArray(shipping.services) || shipping.services.length > 32) {
    fail("FULFILLMENT_PRODUCT_BINDING_INVALID");
  }
  const services = shipping.services.map(normalizeService);
  const baseServices = services.filter((service) =>
    service.isBaseShippingMethod);
  const selectedService = [...(baseServices.length > 0 ? baseServices : services)]
    .sort((left, right) => left.maxDeliveryDate.localeCompare(
      right.maxDeliveryDate)
      || left.shippingMethodId.localeCompare(right.shippingMethodId))[0] ?? null;
  const payPerOrder = product.pay_per_order_charges;
  if (payPerOrder === null || typeof payPerOrder !== "object"
    || Array.isArray(payPerOrder)) fail("FULFILLMENT_FEE_SOURCE_INVALID");
  const oneDayFeeMinor = dollarsToMinor(payPerOrder.one_day,
    "ONE_DAY_FEE");
  const scheduledDeliveryFeeMinor = dollarsToMinor(
    payPerOrder.scheduled_delivery, "SCHEDULED_DELIVERY_FEE");
  const sourceAvailability = sourceStatus(shipping.availability_status,
    "SHIPPING_AVAILABILITY");
  const sourceAvailableToPromiseQuantity = sourceQuantity(
    shipping.available_to_promise_quantity, "SHIPPING_ATP_QUANTITY");
  const sourceAtpSatisfiesQuantity = sourceAvailability === "IN_STOCK"
    && sourceAvailableToPromiseQuantity >= expectedQuantity;
  const sourceDateMeetsRequestedDeadline = selectedService !== null
    && selectedService.maxDeliveryDate <= requestedDeliveryDate;
  return deepFreeze({
    productId: expectedTcin,
    quantity: expectedQuantity,
    sourceAvailability,
    sourceAvailableToPromiseQuantity,
    sourceAtpSatisfiesQuantity,
    services,
    selectedSourceService: selectedService,
    requestedDeliveryDate,
    sourceDateMeetsRequestedDeadline,
    oneDayFeeMinor,
    scheduledDeliveryFeeMinor,
    largestDisplayedFeeMinor: Math.max(oneDayFeeMinor,
      scheduledDeliveryFeeMinor),
    sourceAvailableToPromiseIsReservation: false,
    capacityReserved: false,
    sourceDeliveryDateIsBindingCommitment: false,
    deliveryDeadlineProven: false,
    fullAddressDeliverabilityProven: false,
    allInTotalProven: false,
    paymentPerformed: false,
    orderSubmitted: false,
  });
}

function commandBody(state) {
  return {
    schema: COMMAND_SCHEMA,
    schemaVersion: "1.0.0",
    provider: PROVIDER,
    tcin: state.tcin,
    quantity: state.quantity,
    postalCode: state.postalCode,
    state: state.state,
    pricingStoreId: state.pricingStoreId,
    fulfillmentStoreId: state.fulfillmentStoreId,
    latitude: state.latitude,
    longitude: state.longitude,
    requestedDeliveryDate: state.requestedDeliveryDate,
    maximumAmountMinor: state.maximumAmountMinor,
  };
}

export function createTargetRedskyCandidateCommandBytesV1(input = {}) {
  exact(input, ["tcin", "quantity", "postalCode", "state",
    "pricingStoreId", "fulfillmentStoreId", "latitude", "longitude",
    "requestedDeliveryDate", "maximumAmountMinor"], "COMMAND_INPUT");
  const state = validateRouteBinding(input);
  return Buffer.from(canonicalizeStrict(commandBody(state)), "utf8");
}

function validateRouteBinding(input) {
  return Object.freeze({
    tcin: tcin(input.tcin),
    quantity: quantity(input.quantity),
    postalCode: postalCode(input.postalCode),
    state: stateCode(input.state),
    pricingStoreId: storeId(input.pricingStoreId, "PRICING_STORE_ID"),
    fulfillmentStoreId: storeId(input.fulfillmentStoreId,
      "FULFILLMENT_STORE_ID"),
    latitude: coordinate(input.latitude, -90, 90, "LATITUDE"),
    longitude: coordinate(input.longitude, -180, 180, "LONGITUDE"),
    requestedDeliveryDate: dateOnly(input.requestedDeliveryDate,
      "REQUESTED_DELIVERY_DATE"),
    maximumAmountMinor: moneyMinorText(input.maximumAmountMinor),
  });
}

function validateRequest(request, state) {
  exact(request, ["schema", "transactionRefHash", "outcomeIntentRefHash",
    "routeRole", "operation", "effectIdHash", "idempotencyKey",
    "requestBytes", "expiresAt", "expectedPreviousOccurrenceHash",
    "triggerOccurrenceHash"], "BUYER_NATIVE_REQUEST");
  if (request.schema !== "outsider/buyer-native-transaction-account-request/v1"
    || request.routeRole !== "RECOVERY"
    || !["QUOTE", "STATUS"].includes(request.operation)
    || !Buffer.isBuffer(request.requestBytes)
    || request.triggerOccurrenceHash !== null
    || (request.operation === "QUOTE"
      && request.expectedPreviousOccurrenceHash !== null)
    || (request.operation === "STATUS"
      && (typeof request.expectedPreviousOccurrenceHash !== "string"
        || !HASH.test(request.expectedPreviousOccurrenceHash)))) {
    fail("BUYER_NATIVE_REQUEST_INVALID");
  }
  sourceSpecificCartHashV1(request.transactionRefHash, PREFIX,
    "TRANSACTION_REF_HASH");
  sourceSpecificCartHashV1(request.outcomeIntentRefHash, PREFIX,
    "OUTCOME_INTENT_REF_HASH");
  sourceSpecificCartHashV1(request.effectIdHash, PREFIX, "EFFECT_ID_HASH");
  sourceSpecificCartHashV1(request.idempotencyKey, PREFIX,
    "IDEMPOTENCY_KEY");
  sourceSpecificCartInstantV1(request.expiresAt, PREFIX,
    "REQUEST_EXPIRES_AT");
  let command;
  try { command = JSON.parse(request.requestBytes.toString("utf8")); }
  catch { fail("COMMAND_JSON_INVALID"); }
  exact(command, ["fulfillmentStoreId", "latitude", "longitude",
    "maximumAmountMinor", "postalCode", "pricingStoreId", "provider",
    "quantity", "requestedDeliveryDate", "schema", "schemaVersion",
    "state", "tcin"], "COMMAND");
  if (canonicalizeStrict(command) !== request.requestBytes.toString("utf8")
    || canonicalizeStrict(command) !== canonicalizeStrict(commandBody(state))) {
    fail("COMMAND_BINDING_INVALID");
  }
  return request;
}

function sessionRefHash(state, request) {
  return sourceSpecificCartDigestV1(
    "outsider/target-redsky-order-scoped-read-only-session/v1", {
      accountRefHash: state.accountRefHash,
      transactionRefHash: request.transactionRefHash,
      tcin: state.tcin,
      postalCode: state.postalCode,
      state: state.state,
    });
}

function pdpUrl(state) {
  const url = new URL(PDP_PATH, PDP_ORIGIN);
  url.searchParams.set("key", TARGET_PUBLIC_WEB_INTERFACE_KEY);
  url.searchParams.set("tcin", state.tcin);
  url.searchParams.set("pricing_store_id", state.pricingStoreId);
  url.searchParams.set("has_pricing_store_id", "true");
  url.searchParams.set("channel", "WEB");
  return url.href;
}

function fulfillmentUrl(state) {
  const url = new URL(FULFILLMENT_PATH, PDP_ORIGIN);
  url.searchParams.set("key", TARGET_PUBLIC_WEB_INTERFACE_KEY);
  url.searchParams.set("is_bot", "false");
  url.searchParams.set("tcin", state.tcin);
  url.searchParams.set("store_id", state.fulfillmentStoreId);
  url.searchParams.set("pricing_store_id", state.pricingStoreId);
  url.searchParams.set("zip", state.postalCode);
  url.searchParams.set("state", state.state);
  url.searchParams.set("latitude", String(state.latitude));
  url.searchParams.set("longitude", String(state.longitude));
  url.searchParams.set("scheduled_delivery_store_id",
    state.fulfillmentStoreId);
  url.searchParams.set("required_store_id", state.fulfillmentStoreId);
  url.searchParams.set("has_required_store_id", "true");
  url.searchParams.set("channel", "WEB");
  url.searchParams.set("page", `/p/A-${state.tcin}`);
  return url.href;
}

function requireJsonExchange(exchange, code) {
  if (typeof exchange.headers.contentType !== "string"
    || !/^application\/json(?:\s*;|\s*$)/iu.test(
      exchange.headers.contentType)) fail(`${code}_CONTENT_TYPE_INVALID`);
  return exchange.bodyBytes;
}

async function requestImpl(state, request) {
  validateRequest(request, state);
  const quote = request.operation === "QUOTE";
  const observed = await invokeSourceSpecificHttpsV1(state.requestExact, {
    provider: PROVIDER,
    sessionRefHash: sessionRefHash(state, request),
    operation: request.operation,
    step: quote ? "PDP_QUOTE_GET" : "POSTAL_FULFILLMENT_STATUS_GET",
    method: "GET",
    url: quote ? pdpUrl(state) : fulfillmentUrl(state),
    headers: { accept: "application/json" },
    bodyBytes: null,
    allowedStatuses: [200],
  }, PREFIX);
  const sourceBytes = Buffer.from(requireJsonExchange(observed,
    quote ? "PDP" : "FULFILLMENT"));
  if (quote) {
    normalizeTargetRedskyPdpSourceV1(sourceBytes, {
      tcin: state.tcin, quantity: state.quantity,
      maximumAmountMinor: state.maximumAmountMinor,
    });
    return Object.freeze({ sourceBytes, sourceState: "QUOTE_AVAILABLE",
      sourceExpiresAt: request.expiresAt, sourceRecordClass: "QUOTE" });
  }
  normalizeTargetRedskyFulfillmentSourceV1(sourceBytes, {
    tcin: state.tcin, quantity: state.quantity,
    requestedDeliveryDate: state.requestedDeliveryDate,
  });
  return Object.freeze({ sourceBytes, sourceState: "STATE_OBSERVED",
    sourceExpiresAt: null, sourceRecordClass: "STATUS_RECEIPT" });
}

export function issueTargetRedskyCandidateBuyerNativeCapabilityV1(input = {},
  dependencies = {}) {
  exact(input, ["capabilityRefHash", "accountRefHash", "nodeRefHash",
    "issuedAt", "expiresAt", "tcin", "quantity", "postalCode", "state",
    "pricingStoreId", "fulfillmentStoreId", "latitude", "longitude",
    "requestedDeliveryDate", "maximumAmountMinor"], "CAPABILITY_INPUT");
  const keys = Reflect.ownKeys(dependencies);
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies) || Buffer.isBuffer(dependencies)
    || !Object.hasOwn(dependencies, "httpsRequestImpl")
    || !Object.hasOwn(dependencies, "revalidateImpl")
    || keys.some((key) => !["httpsRequestImpl", "revalidateImpl",
      "sourceOccurrenceSink"].includes(key))
    || typeof dependencies.httpsRequestImpl !== "function"
    || typeof dependencies.revalidateImpl !== "function"
    || (dependencies.sourceOccurrenceSink !== undefined
      && dependencies.sourceOccurrenceSink !== null
      && typeof dependencies.sourceOccurrenceSink !== "function")) {
    fail("DEPENDENCIES_INVALID");
  }
  const state = { ...validateRouteBinding(input),
    accountRefHash: sourceSpecificCartHashV1(input.accountRefHash, PREFIX,
      "ACCOUNT_REF_HASH"), requestExact: dependencies.httpsRequestImpl };
  const capability = issueBuyerNativeTransactionAccountCapabilityV1({
    capabilityRefHash: input.capabilityRefHash,
    accountRefHash: input.accountRefHash,
    nodeRefHash: input.nodeRefHash,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    supportedOperations: ["QUOTE", "STATUS"],
  }, { requestImpl: (request) => requestImpl(state, request),
    revalidateImpl: dependencies.revalidateImpl,
    sourceOccurrenceSink: dependencies.sourceOccurrenceSink ?? null });
  CAPABILITIES.set(capability, deepFreeze({
    provider: PROVIDER, tcin: state.tcin, quantity: state.quantity,
    postalCode: state.postalCode, state: state.state,
    pricingStoreId: state.pricingStoreId,
    fulfillmentStoreId: state.fulfillmentStoreId,
    requestedDeliveryDate: state.requestedDeliveryDate,
    maximumAmountMinor: state.maximumAmountMinor,
  }));
  return capability;
}

export function inspectTargetRedskyCandidateBuyerNativeCapabilityV1(
  capability) {
  const state = CAPABILITIES.get(capability);
  if (state === undefined) fail("CAPABILITY_NOT_FACTORY_ISSUED");
  return Object.freeze({ ...state,
    supportedOperations:
      OUTSIDER_TARGET_REDSKY_CANDIDATE_ROUTE_V1_BOUNDARY.supportedOperations,
    candidateOnly: true,
    exactAcceptanceRequiredBeforeSelection: true,
    cartEnabled: false,
    paymentEnabled: false,
    orderSubmissionEnabled: false,
    capacityReserved: false,
    authority: "NONE",
    decisionState: "HOLD" });
}
