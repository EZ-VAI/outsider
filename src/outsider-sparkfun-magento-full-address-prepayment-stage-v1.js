/*
 * SparkFun Magento full-address prepayment stage v1.
 *
 * This versioned descendant starts from the isolated guest cart created by
 * outsider-sparkfun-magento-guest-cart-adapter-v1. It uses Magento's
 * buyer-native guest endpoints to (a) quote shipping for one privately bound
 * full address and (b) apply one source-offered shipping method, set guest
 * shipping/billing information, and recompute cart totals. Adobe documents
 * this as "prepare for checkout": the shipping-information response contains
 * payment options and totals, while the separate payment-information call is
 * what creates an order. This adapter never exposes or calls that latter path.
 *
 * Raw address/contact data live only behind a factory-issued WeakMap grant and
 * inside private exact-source occurrences. Commands, capability inspection,
 * and buyer-native public projections carry only hashes and presence facts.
 */

import { canonicalizeStrict } from "./canonical.js";
import {
  issueBuyerNativeTransactionAccountCapabilityV1,
} from "./outsider-buyer-native-transaction-capability-v1.js";
import {
  exactSourceSpecificCartObjectV1,
  invokeSourceSpecificHttpsV1,
  sourceSpecificCartBytesHashV1,
  sourceSpecificCartDigestV1,
  sourceSpecificCartFailV1,
  sourceSpecificCartHashV1,
  sourceSpecificCartInstantV1,
} from "./outsider-source-specific-guest-cart-support-v1.js";

const PREFIX = "OUTSIDER_SPARKFUN_MAGENTO_FULL_ADDRESS_PREPAYMENT_STAGE_V1_";
const PROVIDER = "SPARKFUN_MAGENTO_GUEST_CART";
const ORIGIN = "https://www.sparkfun.com";
const GUEST_CARTS_URL = `${ORIGIN}/rest/V1/guest-carts`;
const COMMAND_SCHEMA
  = "outsider/sparkfun-magento-full-address-prepayment-command/v1";
const RECEIPT_SCHEMA
  = "outsider/sparkfun-magento-private-full-address-prepayment-receipt/v1";
const GRANT_SCHEMA
  = "outsider/private-full-address-prepayment-grant/v1";
const PRIVATE_CART_STATE_SCHEMA
  = "outsider/sparkfun-magento-private-guest-cart-state/v1";
const MAX_SOURCE_RECEIPT_BYTES = 1024 * 1024;
const GRANTS = new WeakMap();
const CAPABILITIES = new WeakMap();

export const OUTSIDER_SPARKFUN_MAGENTO_FULL_ADDRESS_PREPAYMENT_STAGE_V1_BOUNDARY
  = Object.freeze({
    provider: PROVIDER,
    protocol: "MAGENTO_GUEST_REST",
    officialProtocolReference:
      "https://developer.adobe.com/commerce/webapi/rest/tutorials/orders/order-prepare-checkout",
    supportedStages: Object.freeze([
      "FULL_ADDRESS_SHIPPING_METHODS",
      "APPLY_SHIPPING_AND_RECOMPUTE",
    ]),
    supportedOperations: Object.freeze(["QUOTE", "HOLD"]),
    startsFromIsolatedGuestCart: true,
    fullAddressCapabilityRequired: true,
    fullAddressSubmittedToProvider: true,
    fullAddressPubliclyProjected: false,
    recipientContactRequiredByCheckoutPreparation: true,
    availableShippingMethodsObserved: true,
    selectedShippingMethodApplied: true,
    totalsRecomputedAfterShippingSelection: true,
    paymentOptionsObservedWithoutSelectingOne: true,
    strongestNoPaymentLifecycleState:
      "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN_HOLD",
    standardMagentoStructuredEtaField: false,
    sourceAcceptanceIsDeliveryPromise: false,
    deliveryDeadlineProven: false,
    paymentInformationEndpointAllowed: false,
    paymentInputAccepted: false,
    paymentPerformed: false,
    orderSubmissionImplemented: false,
    orderSubmitted: false,
    capacityReserved: false,
    userResultCommitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function plainText(value, code, maximum = 256) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum
    || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, `${code}_INVALID`);
  }
  return value;
}

function optionalText(value, code, maximum = 256) {
  return value === null ? null : plainText(value, code, maximum);
}

function countryCode(value) {
  if (typeof value !== "string" || !/^[A-Z]{2}$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, "COUNTRY_CODE_INVALID");
  }
  return value;
}

function postalCode(value) {
  if (typeof value !== "string" || value !== value.trim()
    || !/^[A-Za-z0-9][A-Za-z0-9 .-]{0,31}$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, "POSTAL_CODE_INVALID");
  }
  return value;
}

function regionId(value) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 1)) {
    sourceSpecificCartFailV1(PREFIX, "REGION_ID_INVALID");
  }
  return value;
}

function email(value) {
  const normalized = plainText(value, "EMAIL", 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized)) {
    sourceSpecificCartFailV1(PREFIX, "EMAIL_INVALID");
  }
  return normalized;
}

function telephone(value) {
  const normalized = plainText(value, "TELEPHONE", 64);
  if (!/[0-9]/u.test(normalized)) {
    sourceSpecificCartFailV1(PREFIX, "TELEPHONE_INVALID");
  }
  return normalized;
}

function streetLines(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 4) {
    sourceSpecificCartFailV1(PREFIX, "STREET_LINES_INVALID");
  }
  return Object.freeze(value.map((line) => plainText(line, "STREET_LINE", 256)));
}

function productId(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,9}$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, "PRODUCT_ID_INVALID");
  }
  return value;
}

function sku(value) {
  if (typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, "SKU_INVALID");
  }
  return value;
}

function quantity(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 99) {
    sourceSpecificCartFailV1(PREFIX, "QUANTITY_INVALID");
  }
  return value;
}

function methodCode(value, code) {
  if (typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, `${code}_INVALID`);
  }
  return value;
}

function maskedCartId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, "MASKED_CART_ID_INVALID");
  }
  return value;
}

function finiteMoney(value, code, nullable = false) {
  if (nullable && value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    sourceSpecificCartFailV1(PREFIX, `${code}_INVALID`);
  }
  return number;
}

function json(exchange, code) {
  if (typeof exchange.headers.contentType !== "string"
    || !/^application\/json(?:\s*;|\s*$)/iu.test(exchange.headers.contentType)) {
    sourceSpecificCartFailV1(PREFIX, `${code}_CONTENT_TYPE_INVALID`);
  }
  try { return JSON.parse(exchange.bodyBytes.toString("utf8")); }
  catch { sourceSpecificCartFailV1(PREFIX, `${code}_JSON_INVALID`); }
}

function privateCartKey(state, transactionRefHash) {
  return sourceSpecificCartDigestV1(
    "outsider/sparkfun-order-scoped-private-cart/v1", {
      accountRefHash: state.accountRefHash,
      transactionRefHash,
      productId: state.productId,
      sku: state.sku,
      quantity: state.quantity,
    });
}

async function loadPrivateCart(state, transactionRefHash) {
  const key = privateCartKey(state, transactionRefHash);
  let value;
  try { value = await state.loadPrivateCartStateImpl(key); }
  catch { sourceSpecificCartFailV1(PREFIX, "PRIVATE_CART_STATE_LOAD_FAILED"); }
  exactSourceSpecificCartObjectV1(value, [
    "schema", "schemaVersion", "provider", "sessionRefHash", "productId",
    "sku", "quantity", "maskedCartId", "itemId",
  ], PREFIX, "PRIVATE_CART_STATE");
  if (value.schema !== PRIVATE_CART_STATE_SCHEMA
    || value.schemaVersion !== "1.0.0" || value.provider !== PROVIDER
    || value.sessionRefHash !== key || value.productId !== state.productId
    || value.sku !== state.sku || value.quantity !== state.quantity
    || !Number.isSafeInteger(value.itemId) || value.itemId < 1) {
    sourceSpecificCartFailV1(PREFIX, "PRIVATE_CART_STATE_BINDING_INVALID");
  }
  return Object.freeze({ key, maskedCartId: maskedCartId(value.maskedCartId) });
}

function cartUrl(cartId, suffix = "") {
  return `${GUEST_CARTS_URL}/${encodeURIComponent(maskedCartId(cartId))}${suffix}`;
}

async function exchange(state, request, cart, fields) {
  const result = await invokeSourceSpecificHttpsV1(state.httpsRequestImpl, {
    provider: PROVIDER,
    sessionRefHash: cart.key,
    operation: request.operation,
    ...fields,
  }, PREFIX);
  return Object.freeze({ ...result,
    requestBodyBytes: fields.bodyBytes === null
      ? null : Buffer.from(fields.bodyBytes) });
}

function validateCart(source, state) {
  if (source === null || typeof source !== "object" || Array.isArray(source)
    || source.is_active !== true || !Array.isArray(source.items)
    || !Number.isSafeInteger(source.items_count)
    || !Number.isFinite(Number(source.items_qty))) {
    sourceSpecificCartFailV1(PREFIX, "CART_SOURCE_INVALID");
  }
  const matches = source.items.filter((item) => item?.sku === state.sku);
  if (source.items.length !== 1 || matches.length !== 1
    || source.items_count !== 1 || Number(source.items_qty) !== state.quantity
    || Number(matches[0].qty) !== state.quantity
    || !Number.isFinite(Number(matches[0].price))) {
    sourceSpecificCartFailV1(PREFIX, "EXACT_CART_ITEM_NOT_OBSERVED");
  }
}

function optionalSourceText(value, code) {
  if (value === null || value === undefined || value === "") return null;
  return plainText(value, code, 512);
}

function extensionKeys(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? Object.freeze(Object.keys(value).sort()) : Object.freeze([]);
}

function normalizeRates(source) {
  if (!Array.isArray(source) || source.length > 128) {
    sourceSpecificCartFailV1(PREFIX, "SHIPPING_RATES_SOURCE_INVALID");
  }
  const seen = new Set();
  return Object.freeze(source.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)
      || typeof entry.available !== "boolean") {
      sourceSpecificCartFailV1(PREFIX, "SHIPPING_RATE_SOURCE_INVALID");
    }
    const carrier = methodCode(entry.carrier_code, "CARRIER_CODE");
    const method = methodCode(entry.method_code, "METHOD_CODE");
    const key = `${carrier}\u0000${method}`;
    if (seen.has(key)) sourceSpecificCartFailV1(PREFIX, "SHIPPING_RATE_DUPLICATE");
    seen.add(key);
    return Object.freeze({
      carrierCode: carrier,
      methodCode: method,
      carrierTitle: optionalSourceText(entry.carrier_title, "CARRIER_TITLE"),
      methodTitle: optionalSourceText(entry.method_title, "METHOD_TITLE"),
      available: entry.available,
      amount: finiteMoney(entry.amount, "RATE_AMOUNT", !entry.available),
      baseAmount: finiteMoney(entry.base_amount, "RATE_BASE_AMOUNT",
        !entry.available),
      priceExcludingTax: finiteMoney(entry.price_excl_tax,
        "RATE_PRICE_EXCLUDING_TAX", !entry.available),
      priceIncludingTax: finiteMoney(entry.price_incl_tax,
        "RATE_PRICE_INCLUDING_TAX", !entry.available),
      errorMessage: optionalSourceText(entry.error_message,
        "RATE_ERROR_MESSAGE"),
      extensionAttributeKeys: extensionKeys(entry.extension_attributes),
      structuredEtaAvailable: false,
    });
  }));
}

function normalizeTotals(source, state, code) {
  if (source === null || typeof source !== "object" || Array.isArray(source)
    || source.quote_currency_code !== "USD"
    || Number(source.items_qty) !== state.quantity) {
    sourceSpecificCartFailV1(PREFIX, `${code}_INVALID`);
  }
  return Object.freeze({
    currency: "USD",
    subtotal: finiteMoney(source.subtotal, `${code}_SUBTOTAL`),
    shippingAmount: finiteMoney(source.shipping_amount,
      `${code}_SHIPPING_AMOUNT`),
    taxAmount: finiteMoney(source.tax_amount, `${code}_TAX_AMOUNT`),
    grandTotal: finiteMoney(source.grand_total, `${code}_GRAND_TOTAL`),
    itemsQuantity: Number(source.items_qty),
    extensionAttributeKeys: extensionKeys(source.extension_attributes),
    fullAddressApplied: true,
    taxQuoteFinal: false,
  });
}

function normalizePaymentMethods(source) {
  if (!Array.isArray(source) || source.length > 128) {
    sourceSpecificCartFailV1(PREFIX, "PAYMENT_METHODS_SOURCE_INVALID");
  }
  const seen = new Set();
  return Object.freeze(source.map((entry) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      sourceSpecificCartFailV1(PREFIX, "PAYMENT_METHOD_SOURCE_INVALID");
    }
    const code = methodCode(entry.code, "PAYMENT_METHOD_CODE");
    if (seen.has(code)) {
      sourceSpecificCartFailV1(PREFIX, "PAYMENT_METHOD_DUPLICATE");
    }
    seen.add(code);
    return Object.freeze({ code,
      title: optionalSourceText(entry.title, "PAYMENT_METHOD_TITLE") });
  }));
}

function sameTotals(left, right) {
  return left.currency === right.currency
    && left.subtotal === right.subtotal
    && left.shippingAmount === right.shippingAmount
    && left.taxAmount === right.taxAmount
    && left.grandTotal === right.grandTotal
    && left.itemsQuantity === right.itemsQuantity;
}

function magentoAddress(destination) {
  const address = {
    country_id: destination.countryCode,
    street: [...destination.streetLines],
    postcode: destination.postalCode,
    city: destination.city,
    firstname: destination.firstName,
    lastname: destination.lastName,
    email: destination.email,
    telephone: destination.telephone,
  };
  if (destination.regionId !== null) address.region_id = destination.regionId;
  if (destination.region !== null) address.region = destination.region;
  if (destination.regionCode !== null) address.region_code = destination.regionCode;
  return address;
}

function exchangeSource(value) {
  return {
    step: value.step,
    method: value.method,
    url: value.url,
    requestBodyHash: value.requestBodyHash,
    requestBodyBase64: value.requestBodyBytes === null ? null
      : value.requestBodyBytes.toString("base64"),
    status: value.status,
    finalUrl: value.finalUrl,
    headers: value.headers,
    bodyBytes: value.bodyBytes.length,
    bodyBytesHash: sourceSpecificCartBytesHashV1(value.bodyBytes),
    bodyBase64: value.bodyBytes.toString("base64"),
  };
}

function receiptBytes(state, request, command, exchanges, normalized,
  lifecycleState, nextGate) {
  const body = {
    schema: RECEIPT_SCHEMA,
    schemaVersion: "1.0.0",
    provider: PROVIDER,
    operation: request.operation,
    transactionRefHash: request.transactionRefHash,
    outcomeIntentRefHash: request.outcomeIntentRefHash,
    routeRole: request.routeRole,
    effectIdHash: request.effectIdHash,
    idempotencyKeyHash: request.idempotencyKey,
    product: Object.freeze({ productId: state.productId, sku: state.sku,
      quantity: state.quantity }),
    destinationRefHash: state.destination.destinationRefHash,
    stage: command.stage,
    lifecycleState,
    nextGate,
    normalized,
    exchanges: exchanges.map(exchangeSource),
    sourceOccurrenceOnly: true,
    containsPrivateAddressRequestBody: true,
    publicProjectionPermitted: false,
    fullDeliveryAddressSubmitted:
      command.stage === "FULL_ADDRESS_SHIPPING_METHODS"
        || command.stage === "APPLY_SHIPPING_AND_RECOMPUTE",
    checkoutPrepared: command.stage === "APPLY_SHIPPING_AND_RECOMPUTE",
    checkoutSubmitted: false,
    providerSourceAcceptedAddressAndShippingSelection:
      command.stage === "APPLY_SHIPPING_AND_RECOMPUTE",
    deliverabilityEstablished: false,
    capacityReserved: false,
    taxQuoteFinal: false,
    structuredEtaEstablished: false,
    deliveryDeadlineProven: false,
    paymentMethodSelected: false,
    paymentPerformed: false,
    orderSubmitted: false,
    userResultCommitted: false,
  };
  const bytes = Buffer.from(canonicalizeStrict({ ...body,
    receiptHash: sourceSpecificCartDigestV1(RECEIPT_SCHEMA, body),
  }), "utf8");
  if (bytes.length < 1 || bytes.length > MAX_SOURCE_RECEIPT_BYTES) {
    sourceSpecificCartFailV1(PREFIX, "SOURCE_RECEIPT_SIZE_INVALID");
  }
  return bytes;
}

function parseCommand(state, request) {
  exactSourceSpecificCartObjectV1(request, [
    "schema", "transactionRefHash", "outcomeIntentRefHash", "routeRole",
    "operation", "effectIdHash", "idempotencyKey", "requestBytes",
    "expiresAt", "expectedPreviousOccurrenceHash", "triggerOccurrenceHash",
  ], PREFIX, "BUYER_NATIVE_REQUEST");
  if (request.schema !== "outsider/buyer-native-transaction-account-request/v1"
    || !Buffer.isBuffer(request.requestBytes)
    || !["PRIMARY", "RECOVERY"].includes(request.routeRole)) {
    sourceSpecificCartFailV1(PREFIX, "BUYER_NATIVE_REQUEST_INVALID");
  }
  sourceSpecificCartHashV1(request.transactionRefHash, PREFIX,
    "TRANSACTION_REF_HASH");
  sourceSpecificCartInstantV1(request.expiresAt, PREFIX, "REQUEST_EXPIRES_AT");
  if (Date.parse(request.expiresAt) > Date.parse(state.destination.expiresAt)) {
    sourceSpecificCartFailV1(PREFIX, "DESTINATION_GRANT_EXPIRES_BEFORE_REQUEST");
  }
  let command;
  try { command = JSON.parse(request.requestBytes.toString("utf8")); }
  catch { sourceSpecificCartFailV1(PREFIX, "COMMAND_JSON_INVALID"); }
  exactSourceSpecificCartObjectV1(command, [
    "destinationRefHash", "previousQuoteOccurrenceHash", "productId",
    "provider", "quantity", "schema", "schemaVersion",
    "selectedCarrierCode", "selectedMethodCode", "sku", "stage",
  ], PREFIX, "COMMAND");
  const expectedOperation = command.stage === "FULL_ADDRESS_SHIPPING_METHODS"
    ? "QUOTE" : command.stage === "APPLY_SHIPPING_AND_RECOMPUTE"
      ? "HOLD" : null;
  if (canonicalizeStrict(command) !== request.requestBytes.toString("utf8")
    || command.schema !== COMMAND_SCHEMA || command.schemaVersion !== "1.0.0"
    || command.provider !== PROVIDER || command.productId !== state.productId
    || command.sku !== state.sku || command.quantity !== state.quantity
    || command.destinationRefHash !== state.destination.destinationRefHash
    || command.previousQuoteOccurrenceHash
      !== request.expectedPreviousOccurrenceHash
    || request.operation !== expectedOperation) {
    sourceSpecificCartFailV1(PREFIX, "COMMAND_BINDING_INVALID");
  }
  if (command.stage === "FULL_ADDRESS_SHIPPING_METHODS") {
    if (command.previousQuoteOccurrenceHash !== null
      || command.selectedCarrierCode !== null
      || command.selectedMethodCode !== null) {
      sourceSpecificCartFailV1(PREFIX, "SHIPPING_METHODS_COMMAND_INVALID");
    }
  } else {
    sourceSpecificCartHashV1(command.previousQuoteOccurrenceHash, PREFIX,
      "PREVIOUS_QUOTE_OCCURRENCE_HASH");
    methodCode(command.selectedCarrierCode, "SELECTED_CARRIER_CODE");
    methodCode(command.selectedMethodCode, "SELECTED_METHOD_CODE");
  }
  return command;
}

function fullAddressRateBody(state) {
  return Buffer.from(canonicalizeStrict({
    address: magentoAddress(state.destination),
  }), "utf8");
}

async function observeCart(state, request, cart, step) {
  const observed = await exchange(state, request, cart, {
    step,
    method: "GET",
    url: cartUrl(cart.maskedCartId),
    headers: { accept: "application/json" },
    bodyBytes: null,
    allowedStatuses: [200],
  });
  validateCart(json(observed, "CART"), state);
  return observed;
}

async function observeRates(state, request, cart, step) {
  const observed = await exchange(state, request, cart, {
    step,
    method: "POST",
    url: cartUrl(cart.maskedCartId, "/estimate-shipping-methods"),
    headers: { accept: "application/json", "content-type": "application/json" },
    bodyBytes: fullAddressRateBody(state),
    allowedStatuses: [200],
  });
  return { observed, rates: normalizeRates(json(observed, "SHIPPING_RATES")) };
}

async function requestImpl(state, request) {
  const command = parseCommand(state, request);
  const cart = await loadPrivateCart(state, request.transactionRefHash);
  const cartBefore = await observeCart(state, request, cart,
    "CART_PREFLIGHT_GET");

  if (command.stage === "FULL_ADDRESS_SHIPPING_METHODS") {
    const quoted = await observeRates(state, request, cart,
      "FULL_ADDRESS_SHIPPING_RATE_ESTIMATE_POST");
    const available = quoted.rates.filter((rate) => rate.available);
    const normalized = Object.freeze({
      destinationRefHash: state.destination.destinationRefHash,
      destinationCoverage: "FULL_DELIVERY_ADDRESS_AND_RECIPIENT_CONTACT",
      rates: quoted.rates,
      availableRateCount: available.length,
      fullDeliveryAddressSubmitted: true,
      providerReturnedApplicableShippingMethods: available.length > 0,
      deliverabilityEstablished: false,
      structuredEtaAvailable: false,
      deliveryDeadlineProven: false,
    });
    return Object.freeze({
      sourceBytes: receiptBytes(state, request, command,
        [cartBefore, quoted.observed], normalized,
        available.length > 0
          ? "FULL_ADDRESS_SHIPPING_METHODS_AVAILABLE_HOLD"
          : "FULL_ADDRESS_SHIPPING_UNAVAILABLE_HOLD",
        available.length > 0
          ? "SELECT_SOURCE_OFFERED_SHIPPING_METHOD" : "UNAVAILABLE"),
      sourceState: available.length > 0 ? "QUOTE_AVAILABLE" : "REJECTED",
      sourceExpiresAt: available.length > 0 ? request.expiresAt : null,
      sourceRecordClass: "QUOTE",
    });
  }

  const revalidated = await observeRates(state, request, cart,
    "FULL_ADDRESS_SHIPPING_RATE_REVALIDATE_POST");
  const selected = revalidated.rates.find((rate) => rate.available === true
    && rate.carrierCode === command.selectedCarrierCode
    && rate.methodCode === command.selectedMethodCode);
  if (selected === undefined) {
    sourceSpecificCartFailV1(PREFIX, "SELECTED_SHIPPING_METHOD_NOT_AVAILABLE");
  }
  const address = magentoAddress(state.destination);
  const shippingBody = Buffer.from(canonicalizeStrict({
    addressInformation: {
      shipping_address: address,
      billing_address: { ...address },
      shipping_carrier_code: command.selectedCarrierCode,
      shipping_method_code: command.selectedMethodCode,
    },
  }), "utf8");
  const prepared = await exchange(state, request, cart, {
    step: "SHIPPING_INFORMATION_POST",
    method: "POST",
    url: cartUrl(cart.maskedCartId, "/shipping-information"),
    headers: { accept: "application/json", "content-type": "application/json" },
    bodyBytes: shippingBody,
    allowedStatuses: [200],
  });
  const preparedSource = json(prepared, "SHIPPING_INFORMATION");
  if (preparedSource === null || typeof preparedSource !== "object"
    || Array.isArray(preparedSource)) {
    sourceSpecificCartFailV1(PREFIX, "SHIPPING_INFORMATION_SOURCE_INVALID");
  }
  const paymentMethods = normalizePaymentMethods(preparedSource.payment_methods);
  const preparedTotals = normalizeTotals(preparedSource.totals, state,
    "SHIPPING_INFORMATION_TOTALS");
  const cartAfter = await observeCart(state, request, cart,
    "CART_GET_AFTER_SHIPPING_SELECTION");
  const totalsAfter = await exchange(state, request, cart, {
    step: "TOTALS_GET_AFTER_SHIPPING_SELECTION",
    method: "GET",
    url: cartUrl(cart.maskedCartId, "/totals"),
    headers: { accept: "application/json" },
    bodyBytes: null,
    allowedStatuses: [200],
  });
  const recomputedTotals = normalizeTotals(json(totalsAfter, "TOTALS"), state,
    "RECOMPUTED_TOTALS");
  if (!sameTotals(preparedTotals, recomputedTotals)) {
    sourceSpecificCartFailV1(PREFIX, "RECOMPUTED_TOTALS_MISMATCH");
  }
  const ready = paymentMethods.length > 0;
  const normalized = Object.freeze({
    destinationRefHash: state.destination.destinationRefHash,
    destinationCoverage: "FULL_DELIVERY_ADDRESS_AND_RECIPIENT_CONTACT",
    selectedShippingMethod: Object.freeze({
      carrierCode: selected.carrierCode,
      methodCode: selected.methodCode,
      sourceQuotedAmount: selected.amount,
    }),
    paymentMethods,
    paymentMethodCount: paymentMethods.length,
    totals: recomputedTotals,
    fullDeliveryAddressSubmitted: true,
    shippingAndBillingAddressAcceptedByProviderSource: true,
    selectedShippingMethodAcceptedByProviderSource: true,
    totalsRecomputedAfterShippingSelection: true,
    readyForPaymentAuthorization: ready,
    paymentAuthorizationPerformed: false,
    deliverabilityState:
      "PROVIDER_CHECKOUT_ACCEPTED_ADDRESS_AND_SHIPPING_METHOD",
    deliverabilityEstablished: false,
    structuredEtaAvailable: false,
    deliveryDeadlineProven: false,
  });
  return Object.freeze({
    sourceBytes: receiptBytes(state, request, command,
      [cartBefore, revalidated.observed, prepared, cartAfter, totalsAfter],
      normalized,
      ready ? "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN_HOLD"
        : "CHECKOUT_PREPARED_NO_PAYMENT_METHOD_HOLD",
      ready ? "NEEDS_STRUCTURED_ETA_AND_PAYMENT_AUTHORIZATION"
        : "PAYMENT_METHOD_UNAVAILABLE"),
    sourceState: ready ? "CART_READY" : "HOLD_ACKNOWLEDGED",
    sourceExpiresAt: request.expiresAt,
    sourceRecordClass: "CHECKOUT_RECEIPT",
  });
}

/** Bind a complete delivery/contact profile without projecting its raw fields. */
export function issueSparkFunPrivateFullAddressPrepaymentGrantV1(input = {}) {
  exactSourceSpecificCartObjectV1(input, [
    "destinationRefHash", "authorizedAt", "expiresAt", "firstName",
    "lastName", "email", "telephone", "countryCode", "regionId", "region",
    "regionCode", "city", "postalCode", "streetLines",
  ], PREFIX, "DESTINATION_GRANT_INPUT");
  const authorizedAt = sourceSpecificCartInstantV1(input.authorizedAt, PREFIX,
    "DESTINATION_AUTHORIZED_AT");
  const expiresAt = sourceSpecificCartInstantV1(input.expiresAt, PREFIX,
    "DESTINATION_EXPIRES_AT");
  if (Date.parse(expiresAt) <= Date.parse(authorizedAt)) {
    sourceSpecificCartFailV1(PREFIX, "DESTINATION_GRANT_INTERVAL_INVALID");
  }
  const state = Object.freeze({
    destinationRefHash: sourceSpecificCartHashV1(input.destinationRefHash,
      PREFIX, "DESTINATION_REF_HASH"),
    authorizedAt,
    expiresAt,
    firstName: plainText(input.firstName, "FIRST_NAME", 128),
    lastName: plainText(input.lastName, "LAST_NAME", 128),
    email: email(input.email),
    telephone: telephone(input.telephone),
    countryCode: countryCode(input.countryCode),
    regionId: regionId(input.regionId),
    region: optionalText(input.region, "REGION", 128),
    regionCode: optionalText(input.regionCode, "REGION_CODE", 32),
    city: plainText(input.city, "CITY", 128),
    postalCode: postalCode(input.postalCode),
    streetLines: streetLines(input.streetLines),
  });
  const body = {
    schema: GRANT_SCHEMA,
    schemaVersion: "1.0.0",
    destinationRefHash: state.destinationRefHash,
    authorizedAt,
    expiresAt,
    permittedUse: "SPARKFUN_GUEST_CHECKOUT_PREPAYMENT_PREPARATION_ONLY",
    fullAddressPresent: true,
    recipientContactPresent: true,
    billingSameAsShipping: true,
    rawDestinationProjected: false,
    paymentMethodSelectionAuthorized: false,
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  const grant = Object.freeze({ ...body,
    destinationGrantBindingHash: sourceSpecificCartDigestV1(body.schema, body),
  });
  GRANTS.set(grant, state);
  return grant;
}

/** Issue a quote/hold capability over one existing order-scoped guest cart. */
export function issueSparkFunMagentoFullAddressPrepaymentCapabilityV1(
  input = {}, dependencies = {}) {
  exactSourceSpecificCartObjectV1(input, [
    "capabilityRefHash", "accountRefHash", "nodeRefHash", "issuedAt",
    "expiresAt", "productId", "sku", "quantity", "destinationGrant",
  ], PREFIX, "CAPABILITY_INPUT");
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies) || Buffer.isBuffer(dependencies)) {
    sourceSpecificCartFailV1(PREFIX, "DEPENDENCIES_INVALID");
  }
  const dependencyKeys = Reflect.ownKeys(dependencies);
  if (["httpsRequestImpl", "revalidateImpl", "loadPrivateCartStateImpl"]
    .some((key) => !Object.hasOwn(dependencies, key))
    || dependencyKeys.some((key) => ![
      "httpsRequestImpl", "revalidateImpl", "loadPrivateCartStateImpl",
      "sourceOccurrenceSink",
    ].includes(key))
    || [dependencies.httpsRequestImpl, dependencies.revalidateImpl,
      dependencies.loadPrivateCartStateImpl]
      .some((value) => typeof value !== "function")
    || (dependencies.sourceOccurrenceSink !== undefined
      && dependencies.sourceOccurrenceSink !== null
      && typeof dependencies.sourceOccurrenceSink !== "function")) {
    sourceSpecificCartFailV1(PREFIX, "DEPENDENCIES_INVALID");
  }
  const destination = GRANTS.get(input.destinationGrant);
  if (destination === undefined) {
    sourceSpecificCartFailV1(PREFIX, "DESTINATION_GRANT_NOT_FACTORY_ISSUED");
  }
  const issuedAt = sourceSpecificCartInstantV1(input.issuedAt, PREFIX,
    "CAPABILITY_ISSUED_AT");
  const expiresAt = sourceSpecificCartInstantV1(input.expiresAt, PREFIX,
    "CAPABILITY_EXPIRES_AT");
  if (Date.parse(issuedAt) < Date.parse(destination.authorizedAt)
    || Date.parse(expiresAt) > Date.parse(destination.expiresAt)) {
    sourceSpecificCartFailV1(PREFIX, "DESTINATION_GRANT_INTERVAL_NOT_COVERED");
  }
  const state = {
    accountRefHash: sourceSpecificCartHashV1(input.accountRefHash, PREFIX,
      "ACCOUNT_REF_HASH"),
    productId: productId(input.productId),
    sku: sku(input.sku),
    quantity: quantity(input.quantity),
    destination,
    httpsRequestImpl: dependencies.httpsRequestImpl,
    loadPrivateCartStateImpl: dependencies.loadPrivateCartStateImpl,
  };
  const capability = issueBuyerNativeTransactionAccountCapabilityV1({
    capabilityRefHash: input.capabilityRefHash,
    accountRefHash: input.accountRefHash,
    nodeRefHash: input.nodeRefHash,
    issuedAt,
    expiresAt,
    supportedOperations: ["QUOTE", "HOLD"],
  }, {
    revalidateImpl: dependencies.revalidateImpl,
    requestImpl: (request) => requestImpl(state, request),
    sourceOccurrenceSink: dependencies.sourceOccurrenceSink ?? null,
  });
  CAPABILITIES.set(capability, Object.freeze({ ...state }));
  return capability;
}

/** Build address-free command bytes for the two prepayment stages. */
export function createSparkFunMagentoFullAddressPrepaymentCommandBytesV1(
  capability, input = {}) {
  const state = CAPABILITIES.get(capability);
  if (state === undefined) {
    sourceSpecificCartFailV1(PREFIX, "CAPABILITY_NOT_FACTORY_ISSUED");
  }
  exactSourceSpecificCartObjectV1(input, [
    "stage", "selectedCarrierCode", "selectedMethodCode",
    "previousQuoteOccurrenceHash",
  ], PREFIX, "COMMAND_INPUT");
  if (!OUTSIDER_SPARKFUN_MAGENTO_FULL_ADDRESS_PREPAYMENT_STAGE_V1_BOUNDARY
    .supportedStages.includes(input.stage)) {
    sourceSpecificCartFailV1(PREFIX, "STAGE_INVALID");
  }
  if (input.stage === "FULL_ADDRESS_SHIPPING_METHODS") {
    if (input.previousQuoteOccurrenceHash !== null
      || input.selectedCarrierCode !== null || input.selectedMethodCode !== null) {
      sourceSpecificCartFailV1(PREFIX, "SHIPPING_METHODS_COMMAND_INVALID");
    }
  } else {
    sourceSpecificCartHashV1(input.previousQuoteOccurrenceHash, PREFIX,
      "PREVIOUS_QUOTE_OCCURRENCE_HASH");
    methodCode(input.selectedCarrierCode, "SELECTED_CARRIER_CODE");
    methodCode(input.selectedMethodCode, "SELECTED_METHOD_CODE");
  }
  return Buffer.from(canonicalizeStrict({
    schema: COMMAND_SCHEMA,
    schemaVersion: "1.0.0",
    provider: PROVIDER,
    productId: state.productId,
    sku: state.sku,
    quantity: state.quantity,
    destinationRefHash: state.destination.destinationRefHash,
    stage: input.stage,
    selectedCarrierCode: input.selectedCarrierCode,
    selectedMethodCode: input.selectedMethodCode,
    previousQuoteOccurrenceHash: input.previousQuoteOccurrenceHash,
  }), "utf8");
}

export function inspectSparkFunMagentoFullAddressPrepaymentCapabilityV1(
  capability) {
  const state = CAPABILITIES.get(capability);
  if (state === undefined) {
    sourceSpecificCartFailV1(PREFIX, "CAPABILITY_NOT_FACTORY_ISSUED");
  }
  return Object.freeze({
    provider: PROVIDER,
    productId: state.productId,
    sku: state.sku,
    quantity: state.quantity,
    destinationRefHash: state.destination.destinationRefHash,
    destinationExpiresAt: state.destination.expiresAt,
    fullAddressPresent: true,
    recipientContactPresent: true,
    rawDestinationProjected: false,
    supportedOperations: Object.freeze(["QUOTE", "HOLD"]),
    supportedStages:
      OUTSIDER_SPARKFUN_MAGENTO_FULL_ADDRESS_PREPAYMENT_STAGE_V1_BOUNDARY
        .supportedStages,
    paymentMethodSelectionEnabled: false,
    paymentEnabled: false,
    orderSubmissionEnabled: false,
    capacityReserved: false,
    userResultCommitted: false,
    decisionState: "HOLD",
  });
}
