/*
 * SparkFun Magento destination-quote stage v1.
 *
 * This is the next buyer-native stage after CART_READY_HOLD. It reuses the
 * private guest-cart state created by the SparkFun cart adapter and can only:
 *   1. estimate available shipping methods for an explicitly granted
 *      country/postal destination; and
 *   2. estimate landed cart totals for one source-declared method.
 *
 * Both calls run as durable buyer-native QUOTE operations. There is no
 * payment, order, checkout-submit, email, arbitrary URL, or cart-creation
 * path. A postal quote remains a source estimate: it is not a reservation,
 * deliverability promise, final tax assessment, or delivery-deadline proof.
 */

import { createHash } from "node:crypto";

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

const PREFIX = "OUTSIDER_SPARKFUN_MAGENTO_DESTINATION_QUOTE_STAGE_V1_";
const PROVIDER = "SPARKFUN_MAGENTO_GUEST_CART";
const ORIGIN = "https://www.sparkfun.com";
const GUEST_CARTS_URL = `${ORIGIN}/rest/V1/guest-carts`;
const COMMAND_SCHEMA
  = "outsider/sparkfun-magento-destination-quote-command/v1";
const RECEIPT_SCHEMA
  = "outsider/sparkfun-magento-private-destination-quote-receipt/v1";
const DESTINATION_GRANT_SCHEMA
  = "outsider/private-postal-destination-quote-grant/v1";
const PRIVATE_CART_STATE_SCHEMA
  = "outsider/sparkfun-magento-private-guest-cart-state/v1";
const MAX_SOURCE_RECEIPT_BYTES = 1024 * 1024;
const DESTINATION_GRANTS = new WeakMap();
const CAPABILITIES = new WeakMap();

export const OUTSIDER_SPARKFUN_MAGENTO_DESTINATION_QUOTE_STAGE_V1_BOUNDARY
  = Object.freeze({
    provider: PROVIDER,
    deployedStaticAssetRevision: "1785889404",
    supportedStages: Object.freeze([
      "SHIPPING_RATES", "LANDED_TOTALS_ESTIMATE",
    ]),
    minimumShippingRateDestinationFields: Object.freeze([
      "countryCode", "postalCode",
    ]),
    optionalShippingRateDestinationFields: Object.freeze([
      "regionId", "region", "city",
    ]),
    deployedTotalsDestinationFields: Object.freeze([
      "countryCode", "postalCode", "regionId", "region", "city",
    ]),
    destinationGrantRequired: true,
    destinationDataPubliclyProjected: false,
    injectedHttpsClosureRequired: true,
    injectedPrivateCartStateCapabilityRequired: true,
    arbitraryUrlAccepted: false,
    cartCreationImplemented: false,
    addressBookWriteImplemented: false,
    checkoutSubmissionImplemented: false,
    paymentInputAccepted: false,
    paymentPerformed: false,
    orderSubmissionImplemented: false,
    sellerEmailImplemented: false,
    quoteLifecycleState: "DESTINATION_QUOTE_HOLD",
    quoteEstablishesCapacity: false,
    quoteEstablishesDeliverability: false,
    postalTaxEstimateFinal: false,
    standardMagentoStructuredEtaField: false,
    deliveryDeadlineProven: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function text(value, code, maximum = 128) {
  if (typeof value !== "string" || value.length < 1
    || value.length > maximum || /[\u0000-\u001f\u007f]/u.test(value)
    || value !== value.trim()) {
    sourceSpecificCartFailV1(PREFIX, `${code}_INVALID`);
  }
  return value;
}

function countryCode(value) {
  if (typeof value !== "string" || !/^[A-Z]{2}$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, "COUNTRY_CODE_INVALID");
  }
  return value;
}

function postalCode(value) {
  if (typeof value !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9 .-]{0,31}$/u.test(value)
    || value !== value.trim()) {
    sourceSpecificCartFailV1(PREFIX, "POSTAL_CODE_INVALID");
  }
  return value;
}

function optionalText(value, code) {
  return value === null ? null : text(value, code);
}

function regionId(value) {
  if (value !== null && (!Number.isSafeInteger(value) || value < 1)) {
    sourceSpecificCartFailV1(PREFIX, "REGION_ID_INVALID");
  }
  return value;
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

function requestInput(state, request, cart, fields) {
  return {
    provider: PROVIDER,
    sessionRefHash: cart.key,
    operation: request.operation,
    ...fields,
  };
}

async function exchange(state, request, cart, fields) {
  const result = await invokeSourceSpecificHttpsV1(state.httpsRequestImpl,
    requestInput(state, request, cart, fields), PREFIX);
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
    || source.items_count !== 1
    || Number(source.items_qty) !== state.quantity
    || Number(matches[0].qty) !== state.quantity
    || !Number.isFinite(Number(matches[0].price))) {
    sourceSpecificCartFailV1(PREFIX, "EXACT_CART_ITEM_NOT_OBSERVED");
  }
}

function finiteMoney(value, code, nullable = false) {
  if (nullable && value === null) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) {
    sourceSpecificCartFailV1(PREFIX, `${code}_INVALID`);
  }
  return number;
}

function optionalSourceText(value, code) {
  if (value === null) return null;
  return text(value, code, 512);
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
    if (seen.has(key)) {
      sourceSpecificCartFailV1(PREFIX, "SHIPPING_RATE_DUPLICATE");
    }
    seen.add(key);
    const extensions = entry.extension_attributes;
    const extensionKeys = extensions !== null && typeof extensions === "object"
      && !Array.isArray(extensions) ? Object.keys(extensions).sort() : [];
    const available = entry.available;
    return Object.freeze({
      carrierCode: carrier,
      methodCode: method,
      carrierTitle: optionalSourceText(entry.carrier_title ?? null,
        "CARRIER_TITLE"),
      methodTitle: optionalSourceText(entry.method_title ?? null,
        "METHOD_TITLE"),
      available,
      amount: finiteMoney(entry.amount, "RATE_AMOUNT", !available),
      baseAmount: finiteMoney(entry.base_amount, "RATE_BASE_AMOUNT", !available),
      priceExcludingTax: finiteMoney(entry.price_excl_tax,
        "RATE_PRICE_EXCLUDING_TAX", !available),
      priceIncludingTax: finiteMoney(entry.price_incl_tax,
        "RATE_PRICE_INCLUDING_TAX", !available),
      errorMessage: entry.error_message === "" ? null
        : optionalSourceText(entry.error_message ?? null,
          "RATE_ERROR_MESSAGE"),
      extensionAttributeKeys: Object.freeze(extensionKeys),
      structuredEtaPresentInMagentoCoreContract: false,
    });
  }));
}

function normalizeTotals(source, state) {
  if (source === null || typeof source !== "object" || Array.isArray(source)
    || source.quote_currency_code !== "USD"
    || Number(source.items_qty) !== state.quantity) {
    sourceSpecificCartFailV1(PREFIX, "TOTALS_SOURCE_INVALID");
  }
  const subtotal = finiteMoney(source.subtotal, "TOTALS_SUBTOTAL");
  const shippingAmount = finiteMoney(source.shipping_amount,
    "TOTALS_SHIPPING_AMOUNT");
  const taxAmount = finiteMoney(source.tax_amount, "TOTALS_TAX_AMOUNT");
  const grandTotal = finiteMoney(source.grand_total, "TOTALS_GRAND_TOTAL");
  return Object.freeze({
    currency: "USD",
    subtotal,
    shippingAmount,
    taxAmount,
    grandTotal,
    itemsQuantity: Number(source.items_qty),
    postalEstimateOnly: true,
    fullDeliveryAddressSubmitted: false,
    taxEstimateFinal: false,
    structuredEtaAvailable: false,
  });
}

function rateAddress(destination) {
  const address = {
    country_id: destination.countryCode,
    postcode: destination.postalCode,
  };
  if (destination.regionId !== null) address.region_id = destination.regionId;
  if (destination.region !== null) address.region = destination.region;
  if (destination.city !== null) address.city = destination.city;
  return address;
}

function totalsAddress(destination) {
  const address = {
    countryId: destination.countryCode,
    postcode: destination.postalCode,
  };
  if (destination.regionId !== null) address.regionId = destination.regionId;
  if (destination.region !== null) address.region = destination.region;
  if (destination.city !== null) address.city = destination.city;
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
    containsPrivateDestinationRequestBody: true,
    publicProjectionPermitted: false,
    fullDeliveryAddressSubmitted: false,
    checkoutPerformed: false,
    capacityReserved: false,
    deliverabilityEstablished: false,
    taxQuoteFinal: false,
    structuredEtaEstablished: false,
    deliveryDeadlineProven: false,
    paymentPerformed: false,
    orderSubmitted: false,
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
    || request.operation !== "QUOTE" || !Buffer.isBuffer(request.requestBytes)
    || !["PRIMARY", "RECOVERY"].includes(request.routeRole)) {
    sourceSpecificCartFailV1(PREFIX, "BUYER_NATIVE_REQUEST_INVALID");
  }
  sourceSpecificCartHashV1(request.transactionRefHash, PREFIX,
    "TRANSACTION_REF_HASH");
  sourceSpecificCartInstantV1(request.expiresAt, PREFIX, "REQUEST_EXPIRES_AT");
  if (Date.parse(request.expiresAt)
    > Date.parse(state.destination.expiresAt)) {
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
  if (canonicalizeStrict(command) !== request.requestBytes.toString("utf8")
    || command.schema !== COMMAND_SCHEMA || command.schemaVersion !== "1.0.0"
    || command.provider !== PROVIDER || command.productId !== state.productId
    || command.sku !== state.sku || command.quantity !== state.quantity
    || command.destinationRefHash !== state.destination.destinationRefHash
    || command.previousQuoteOccurrenceHash
      !== request.expectedPreviousOccurrenceHash
    || !OUTSIDER_SPARKFUN_MAGENTO_DESTINATION_QUOTE_STAGE_V1_BOUNDARY
      .supportedStages.includes(command.stage)) {
    sourceSpecificCartFailV1(PREFIX, "COMMAND_BINDING_INVALID");
  }
  if (command.previousQuoteOccurrenceHash !== null) {
    sourceSpecificCartHashV1(command.previousQuoteOccurrenceHash, PREFIX,
      "PREVIOUS_QUOTE_OCCURRENCE_HASH");
  }
  if (command.stage === "SHIPPING_RATES") {
    if (command.selectedCarrierCode !== null
      || command.selectedMethodCode !== null) {
      sourceSpecificCartFailV1(PREFIX, "SHIPPING_RATES_SELECTION_FORBIDDEN");
    }
  } else {
    if (command.previousQuoteOccurrenceHash === null) {
      sourceSpecificCartFailV1(PREFIX, "LANDED_TOTALS_RATE_ANCESTOR_REQUIRED");
    }
    methodCode(command.selectedCarrierCode, "SELECTED_CARRIER_CODE");
    methodCode(command.selectedMethodCode, "SELECTED_METHOD_CODE");
  }
  return command;
}

async function requestImpl(state, request) {
  const command = parseCommand(state, request);
  const cart = await loadPrivateCart(state, request.transactionRefHash);
  const cartObserved = await exchange(state, request, cart, {
    step: "CART_PREFLIGHT_GET",
    method: "GET",
    url: cartUrl(cart.maskedCartId),
    headers: { accept: "application/json" },
    bodyBytes: null,
    allowedStatuses: [200],
  });
  validateCart(json(cartObserved, "CART"), state);

  if (command.stage === "SHIPPING_RATES") {
    const bodyBytes = Buffer.from(canonicalizeStrict({
      address: rateAddress(state.destination),
    }), "utf8");
    const quoted = await exchange(state, request, cart, {
      step: "SHIPPING_RATE_ESTIMATE_POST",
      method: "POST",
      url: cartUrl(cart.maskedCartId, "/estimate-shipping-methods"),
      headers: { accept: "application/json", "content-type": "application/json" },
      bodyBytes,
      allowedStatuses: [200],
    });
    const rates = normalizeRates(json(quoted, "SHIPPING_RATES"));
    const available = rates.filter((rate) => rate.available);
    const normalized = Object.freeze({
      destinationRefHash: state.destination.destinationRefHash,
      destinationCoverage: "COUNTRY_POSTAL_ESTIMATE",
      rates,
      availableRateCount: available.length,
      fullDeliveryAddressSubmitted: false,
      deliverabilityEstablished: false,
      structuredEtaAvailable: false,
    });
    const sourceState = available.length > 0 ? "QUOTE_AVAILABLE" : "REJECTED";
    return Object.freeze({
      sourceBytes: receiptBytes(state, request, command,
        [cartObserved, quoted], normalized,
        available.length > 0
          ? "DESTINATION_SHIPPING_RATES_ESTIMATED_HOLD"
          : "DESTINATION_SHIPPING_UNAVAILABLE_HOLD",
        available.length > 0
          ? "SELECT_METHOD_FOR_LANDED_TOTAL_ESTIMATE" : "UNAVAILABLE"),
      sourceState,
      sourceExpiresAt: available.length > 0 ? request.expiresAt : null,
      sourceRecordClass: "QUOTE",
    });
  }

  const bodyBytes = Buffer.from(canonicalizeStrict({
    addressInformation: {
      address: totalsAddress(state.destination),
      shipping_carrier_code: command.selectedCarrierCode,
      shipping_method_code: command.selectedMethodCode,
    },
  }), "utf8");
  const quoted = await exchange(state, request, cart, {
    step: "LANDED_TOTAL_ESTIMATE_POST",
    method: "POST",
    url: cartUrl(cart.maskedCartId, "/totals-information"),
    headers: { accept: "application/json", "content-type": "application/json" },
    bodyBytes,
    allowedStatuses: [200],
  });
  const totals = normalizeTotals(json(quoted, "LANDED_TOTALS"), state);
  const normalized = Object.freeze({
    destinationRefHash: state.destination.destinationRefHash,
    destinationCoverage: "COUNTRY_POSTAL_REGION_CITY_ESTIMATE",
    selectedCarrierCode: command.selectedCarrierCode,
    selectedMethodCode: command.selectedMethodCode,
    totals,
    fullDeliveryAddressSubmitted: false,
    deliverabilityEstablished: false,
    taxEstimateFinal: false,
    structuredEtaAvailable: false,
  });
  return Object.freeze({
    sourceBytes: receiptBytes(state, request, command,
      [cartObserved, quoted], normalized,
      "DESTINATION_LANDED_TOTALS_ESTIMATED_HOLD",
      "NEEDS_FULL_ADDRESS_DELIVERABILITY_ETA_AND_PAYMENT_AUTHORITY"),
    sourceState: "QUOTE_AVAILABLE",
    sourceExpiresAt: request.expiresAt,
    sourceRecordClass: "QUOTE",
  });
}

/** Create an opaque, expiring permission to use one postal destination for quotes. */
export function issueSparkFunPrivatePostalDestinationQuoteGrantV1(input = {}) {
  exactSourceSpecificCartObjectV1(input, [
    "destinationRefHash", "authorizedAt", "expiresAt", "countryCode",
    "postalCode", "regionId", "region", "city",
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
    countryCode: countryCode(input.countryCode),
    postalCode: postalCode(input.postalCode),
    regionId: regionId(input.regionId),
    region: optionalText(input.region, "REGION"),
    city: optionalText(input.city, "CITY"),
  });
  const body = {
    schema: DESTINATION_GRANT_SCHEMA,
    schemaVersion: "1.0.0",
    destinationRefHash: state.destinationRefHash,
    authorizedAt,
    expiresAt,
    permittedUse: "SPARKFUN_POSTAL_DESTINATION_QUOTE_ONLY",
    countryCodePresent: true,
    postalCodePresent: true,
    regionPresent: state.region !== null || state.regionId !== null,
    cityPresent: state.city !== null,
    rawDestinationProjected: false,
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  const grant = Object.freeze({ ...body,
    destinationGrantBindingHash: sourceSpecificCartDigestV1(body.schema, body),
  });
  DESTINATION_GRANTS.set(grant, state);
  return grant;
}

/** Bind the quote-only adapter to one cart account and one opaque destination. */
export function issueSparkFunMagentoDestinationQuoteCapabilityV1(input = {},
  dependencies = {}) {
  exactSourceSpecificCartObjectV1(input, [
    "capabilityRefHash", "accountRefHash", "nodeRefHash", "issuedAt",
    "expiresAt", "productId", "sku", "quantity", "destinationGrant",
  ], PREFIX, "CAPABILITY_INPUT");
  const dependencyKeys = Reflect.ownKeys(dependencies);
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies) || Buffer.isBuffer(dependencies)
    || ["httpsRequestImpl", "revalidateImpl", "loadPrivateCartStateImpl"]
      .some((key) => !Object.hasOwn(dependencies, key))
    || dependencyKeys.some((key) => ![
      "httpsRequestImpl", "revalidateImpl", "loadPrivateCartStateImpl",
      "sourceOccurrenceSink",
    ].includes(key))) {
    sourceSpecificCartFailV1(PREFIX, "DEPENDENCIES_FIELDS_INVALID");
  }
  if ([dependencies.httpsRequestImpl, dependencies.revalidateImpl,
    dependencies.loadPrivateCartStateImpl]
    .some((value) => typeof value !== "function")
    || (dependencies.sourceOccurrenceSink !== undefined
      && dependencies.sourceOccurrenceSink !== null
      && typeof dependencies.sourceOccurrenceSink !== "function")) {
    sourceSpecificCartFailV1(PREFIX, "DEPENDENCIES_INVALID");
  }
  const destination = DESTINATION_GRANTS.get(input.destinationGrant);
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
    supportedOperations: ["QUOTE"],
  }, {
    revalidateImpl: dependencies.revalidateImpl,
    requestImpl: (request) => requestImpl(state, request),
    sourceOccurrenceSink: dependencies.sourceOccurrenceSink ?? null,
  });
  CAPABILITIES.set(capability, Object.freeze({ ...state }));
  return capability;
}

/** Build command bytes without embedding raw destination data. */
export function createSparkFunMagentoDestinationQuoteCommandBytesV1(capability,
  input = {}) {
  const state = CAPABILITIES.get(capability);
  if (state === undefined) {
    sourceSpecificCartFailV1(PREFIX, "CAPABILITY_NOT_FACTORY_ISSUED");
  }
  exactSourceSpecificCartObjectV1(input, [
    "stage", "selectedCarrierCode", "selectedMethodCode",
    "previousQuoteOccurrenceHash",
  ], PREFIX, "COMMAND_INPUT");
  if (!OUTSIDER_SPARKFUN_MAGENTO_DESTINATION_QUOTE_STAGE_V1_BOUNDARY
    .supportedStages.includes(input.stage)) {
    sourceSpecificCartFailV1(PREFIX, "STAGE_INVALID");
  }
  if (input.previousQuoteOccurrenceHash !== null) {
    sourceSpecificCartHashV1(input.previousQuoteOccurrenceHash, PREFIX,
      "PREVIOUS_QUOTE_OCCURRENCE_HASH");
  }
  if (input.stage === "SHIPPING_RATES") {
    if (input.selectedCarrierCode !== null || input.selectedMethodCode !== null) {
      sourceSpecificCartFailV1(PREFIX, "SHIPPING_RATES_SELECTION_FORBIDDEN");
    }
  } else {
    if (input.previousQuoteOccurrenceHash === null) {
      sourceSpecificCartFailV1(PREFIX, "LANDED_TOTALS_RATE_ANCESTOR_REQUIRED");
    }
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

export function inspectSparkFunMagentoDestinationQuoteCapabilityV1(capability) {
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
    rawDestinationProjected: false,
    supportedOperations: Object.freeze(["QUOTE"]),
    supportedStages:
      OUTSIDER_SPARKFUN_MAGENTO_DESTINATION_QUOTE_STAGE_V1_BOUNDARY
        .supportedStages,
    paymentEnabled: false,
    orderSubmissionEnabled: false,
    capacityReserved: false,
    decisionState: "HOLD",
  });
}

/** Stable digest helper for tests/operators without exposing destination bytes. */
export function hashSparkFunDestinationQuoteSourceBytesV1(bytes) {
  if (!Buffer.isBuffer(bytes)) {
    sourceSpecificCartFailV1(PREFIX, "SOURCE_BYTES_INVALID");
  }
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
