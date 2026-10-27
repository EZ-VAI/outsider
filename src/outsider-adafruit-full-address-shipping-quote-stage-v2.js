/*
 * Adafruit full-address shipping-quote stage v2.
 *
 * This versioned descendant starts after the v1 contact-capture stage in the
 * same anonymous, order-scoped cookie session.  It compiles the exact Step 2
 * form exposed by Adafruit, submits one factory-held private destination, and
 * captures the Step 3 shipping-rate page.  It cannot select payment, submit an
 * order, or claim that an anonymous cart reserves inventory.
 *
 * Destination values are held only in a WeakMap grant.  The private source
 * receipt contains exact provider response bytes and a request-body hash, but
 * never the request body.  Buyer-native public projections therefore carry
 * only hashes and normalized, non-PII quote facts.
 */

import { canonicalizeStrict } from "./canonical.js";
import {
  issueBuyerNativeTransactionAccountCapabilityV1,
} from "./outsider-buyer-native-transaction-capability-v1.js";
import {
  createSourceSpecificCartCommandBytesV1,
  createSourceSpecificCartDriverResponseV1,
  exactSourceSpecificCartObjectV1,
  invokeSourceSpecificHttpsV1,
  sourceSpecificCartBytesHashV1,
  sourceSpecificCartDigestV1,
  sourceSpecificCartFailV1,
  sourceSpecificCartHashV1,
  sourceSpecificCartInstantV1,
  validateSourceSpecificCartRequestV1,
} from "./outsider-source-specific-guest-cart-support-v1.js";

const PREFIX = "OUTSIDER_ADAFRUIT_FULL_ADDRESS_SHIPPING_QUOTE_STAGE_V2_";
const PROVIDER = "ADAFRUIT_GUEST_SHOPPER";
const ORIGIN = "https://www.adafruit.com";
const CHECKOUT_URL = `${ORIGIN}/checkout`;
const COMMAND_SCHEMA
  = "outsider/adafruit-full-address-shipping-quote-command/v2";
const RECEIPT_SCHEMA
  = "outsider/adafruit-private-full-address-shipping-quote-receipt/v2";
const GRANT_SCHEMA
  = "outsider/private-adafruit-full-address-shipping-quote-grant/v2";
const MAX_SOURCE_RECEIPT_BYTES = 2 * 1024 * 1024;
const GRANTS = new WeakMap();
const CAPABILITIES = new WeakMap();

export const OUTSIDER_ADAFRUIT_FULL_ADDRESS_SHIPPING_QUOTE_STAGE_V2_BOUNDARY
  = Object.freeze({
    descendsFrom: "outsider/adafruit-checkout-contact-capture-stage/v1",
    provider: PROVIDER,
    protocol: "ADAFRUIT_GUEST_CHECKOUT_HTML",
    supportedStages: Object.freeze([
      "FULL_ADDRESS_FORM_PREFLIGHT",
      "SUBMIT_FULL_ADDRESS_CAPTURE_SHIPPING_RATES",
    ]),
    supportedOperations: Object.freeze(["QUOTE", "HOLD"]),
    startsAfterContactAccepted: true,
    orderScopedPrivateCookieSessionRequired: true,
    privateDestinationGrantRequired: true,
    fullAddressSubmittedToProvider: true,
    fullAddressPubliclyProjected: false,
    exactRequestBodyPersisted: false,
    requestBodyHashPersisted: true,
    shippingRatesObserved: true,
    shippingMethodApplied: false,
    cartEstablishesCapacity: false,
    capacityReserved: false,
    paymentEndpointAllowed: false,
    paymentInputAccepted: false,
    paymentPerformed: false,
    orderSubmissionImplemented: false,
    orderSubmitted: false,
    independentOutcomeTruthEstablished: false,
    userResultCommitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function privateText(value, code, maximum = 256) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum
    || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, `${code}_INVALID`);
  }
  return value;
}

function optionalPrivateText(value, code, maximum = 256) {
  if (value === null || value === "") return "";
  return privateText(value, code, maximum);
}

function productId(value) {
  if (typeof value !== "string" || !/^[1-9]\d{0,9}$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, "PRODUCT_ID_INVALID");
  }
  return value;
}

function quantity(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 99) {
    sourceSpecificCartFailV1(PREFIX, "QUANTITY_INVALID");
  }
  return value;
}

function text(exchange, code) {
  if (typeof exchange.headers.contentType !== "string"
    || !/^text\/html(?:\s*;|\s*$)/iu.test(exchange.headers.contentType)) {
    sourceSpecificCartFailV1(PREFIX, `${code}_CONTENT_TYPE_INVALID`);
  }
  return exchange.bodyBytes.toString("utf8");
}

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'").replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">").replaceAll("&nbsp;", " ");
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(
    `\\b${name}=(?:\"([^\"]*)\"|'([^']*)')`, "iu"));
  return match?.[1] ?? match?.[2] ?? null;
}

function controls(source) {
  const output = [];
  for (const match of source.matchAll(
    /<(input|select|textarea|button)\b[^>]*>/giu)) {
    const opening = match[0];
    const tag = match[1].toLowerCase();
    const name = attribute(opening, "name");
    if (name === null || !/^[A-Za-z][A-Za-z0-9_:[\].-]{0,127}$/u.test(name)) {
      continue;
    }
    output.push(Object.freeze({
      tag,
      name,
      type: (attribute(opening, "type") ?? "").toLowerCase(),
      value: attribute(opening, "value"),
      checked: /\bchecked(?:\s|=|>)/iu.test(opening),
      required: /\brequired(?:\s|=|>)/iu.test(opening),
      opening,
    }));
  }
  return output;
}

function checkoutForms(html) {
  const output = [];
  for (const match of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/giu)) {
    const source = match[0];
    const opening = source.slice(0, source.indexOf(">") + 1);
    let action;
    try { action = new URL(attribute(opening, "action") ?? "", CHECKOUT_URL); }
    catch { continue; }
    if (action.origin !== ORIGIN || action.pathname !== "/checkout"
      || action.search !== "" || action.hash !== ""
      || (attribute(opening, "method") ?? "get").toLowerCase() !== "post") {
      continue;
    }
    output.push(Object.freeze({ source, controls: controls(source) }));
  }
  return output;
}

function actionValue(form, value) {
  return form.controls.some((control) => control.name === "action"
    && control.value === value);
}

function csrfToken(form) {
  const matches = form.controls.filter((control) =>
    control.name === "csrf_token" && typeof control.value === "string"
      && /^[A-Za-z0-9._~-]{16,512}$/u.test(control.value));
  if (matches.length !== 1) {
    sourceSpecificCartFailV1(PREFIX, "CSRF_TOKEN_INVALID");
  }
  return matches[0].value;
}

function addressForm(html) {
  const candidates = checkoutForms(html).filter((form) => {
    if (!actionValue(form, "save_two")) return false;
    const names = new Set(form.controls.map((entry) => entry.name));
    return names.has("csrf_token")
      && [...names].filter((name) =>
        /(?:address1|street|city|country|state|postcode|postal|zip)/iu
          .test(name)).length >= 5;
  });
  if (candidates.length !== 1) {
    sourceSpecificCartFailV1(PREFIX, "ADDRESS_FORM_INVALID");
  }
  return candidates[0];
}

function addressPrefixes(form) {
  const names = new Set(form.controls.map((entry) => entry.name));
  const output = new Set();
  for (const name of names) {
    const match = /^(.*)_address1$/u.exec(name);
    if (match !== null
      && ["name", "postcode", "city", "country", "state", "phone"]
        .every((suffix) => names.has(`${match[1]}_${suffix}`))) {
      output.add(match[1]);
    }
  }
  return [...output].sort();
}

function addIfObserved(entries, names, name, value) {
  if (names.has(name)) entries.set(name, value);
}

function compileAddressBody(form, destination) {
  const names = new Set(form.controls.map((entry) => entry.name));
  const entries = new Map();
  for (const control of form.controls) {
    if (control.type === "hidden" && control.name !== "action"
      && control.value !== null) entries.set(control.name, control.value);
    if (["checkbox", "radio"].includes(control.type) && control.checked
      && control.value !== null) entries.set(control.name, control.value);
  }
  entries.set("csrf_token", csrfToken(form));
  entries.set("action", "save_two");
  const fullName = `${destination.firstName} ${destination.lastName}`;
  const prefixes = addressPrefixes(form);
  for (const prefix of prefixes) {
    entries.set(`${prefix}_name`, fullName);
    addIfObserved(entries, names, `${prefix}_company`, "");
    entries.set(`${prefix}_address1`, destination.streetLines[0]);
    addIfObserved(entries, names, `${prefix}_address2`,
      destination.streetLines.slice(1).join(", "));
    entries.set(`${prefix}_postcode`, destination.postalCode);
    entries.set(`${prefix}_city`, destination.city);
    entries.set(`${prefix}_country`, destination.providerCountryId);
    entries.set(`${prefix}_state`, destination.providerRegionId);
    entries.set(`${prefix}_phone`, destination.telephone);
  }
  const aliases = {
    ship_first_name: destination.firstName,
    ship_last_name: destination.lastName,
    ship_street_address: destination.streetLines[0],
    ship_street_address2: destination.streetLines.slice(1).join(", "),
    ship_city: destination.city,
    ship_postcode: destination.postalCode,
    ship_country: destination.providerCountryId,
    ship_state: destination.providerRegionId,
    ship_phone: destination.telephone,
  };
  for (const [name, value] of Object.entries(aliases)) {
    addIfObserved(entries, names, name, value);
  }
  const addressNames = [...entries.keys()].filter((name) =>
    /(?:address1|street_address)$/u.test(name));
  const cityNames = [...entries.keys()].filter((name) => /_city$/u.test(name));
  const postalNames = [...entries.keys()].filter((name) =>
    /_(?:postcode|postal|zip)$/u.test(name));
  if (addressNames.length < 1 || cityNames.length < 1 || postalNames.length < 1
    || ![...entries.keys()].some((name) => /_country$/u.test(name))
    || ![...entries.keys()].some((name) => /_state$/u.test(name))) {
    sourceSpecificCartFailV1(PREFIX, "ADDRESS_FORM_MAPPING_UNPROVEN");
  }
  return Buffer.from(new URLSearchParams([...entries.entries()]).toString(),
    "utf8");
}

function moneyMinor(value) {
  const match = /^\$?([0-9]{1,9})(?:\.([0-9]{2}))$/u.exec(value.trim());
  if (match === null) return null;
  const amount = Number(match[1]) * 100 + Number(match[2]);
  return Number.isSafeInteger(amount) ? amount : null;
}

function plainText(value) {
  return decodeHtml(value.replace(/<[^>]*>/gu, " "))
    .replace(/\s+/gu, " ").trim();
}

function shippingRates(html) {
  const output = [];
  const seen = new Set();
  for (const label of html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/giu)) {
    const input = label[0].match(/<input\b[^>]*>/iu)?.[0] ?? null;
    if (input === null || (attribute(input, "type") ?? "").toLowerCase()
      !== "radio") continue;
    const name = attribute(input, "name");
    const value = attribute(input, "value");
    if (name === null || value === null || !/ship/iu.test(name)
      || value.length < 1 || value.length > 256 || seen.has(value)) continue;
    const description = plainText(label[0]);
    const amounts = [...description.matchAll(/\$[0-9]{1,9}\.[0-9]{2}/gu)]
      .map((entry) => moneyMinor(entry[0])).filter((entry) => entry !== null);
    if (amounts.length < 1) continue;
    const iso = /\b(20\d{2}-\d{2}-\d{2})\b/u.exec(description)?.[1] ?? null;
    seen.add(value);
    output.push(Object.freeze({
      methodFieldName: name,
      methodValue: value,
      description: description.slice(0, 512),
      amountMinor: amounts.at(-1),
      selectedByProvider: /\bchecked(?:\s|=|>)/iu.test(input),
      sourceDeliveryDate: iso,
    }));
  }
  return Object.freeze(output);
}

function totals(html) {
  const output = { subtotalMinor: null, shippingMinor: null, taxMinor: null,
    totalMinor: null };
  for (const match of html.matchAll(
    /<div\b[^>]*checkout-sidebar-ot-title[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*checkout-sidebar-ot-text[^>]*>([\s\S]*?)<\/div>/giu)) {
    const label = plainText(match[1]).toLowerCase();
    const amount = moneyMinor(plainText(match[2]));
    if (amount === null) continue;
    if (/^subtotal\b/u.test(label)) output.subtotalMinor = amount;
    else if (/^shipping\b/u.test(label)) output.shippingMinor = amount;
    else if (/^tax\b/u.test(label)) output.taxMinor = amount;
    else if (/^total\b/u.test(label)) output.totalMinor = amount;
  }
  return Object.freeze(output);
}

function rateQuote(html, completionDeadline) {
  const rates = shippingRates(html);
  if (rates.length < 1) {
    sourceSpecificCartFailV1(PREFIX, "SHIPPING_RATES_NOT_OBSERVED");
  }
  const summary = totals(html);
  const selected = rates.filter((rate) => rate.selectedByProvider);
  const selectedRate = selected.length === 1 ? selected[0] : null;
  const arithmeticComplete = selectedRate !== null
    && summary.subtotalMinor !== null && summary.taxMinor !== null
    && summary.totalMinor !== null
    && summary.totalMinor === summary.subtotalMinor + selectedRate.amountMinor
      + summary.taxMinor;
  const deadlineDate = completionDeadline.slice(0, 10);
  const sourceDeliveryDate = selectedRate?.sourceDeliveryDate ?? null;
  return Object.freeze({
    rates,
    selectedRateValue: selectedRate?.methodValue ?? null,
    subtotalMinor: summary.subtotalMinor,
    destinationTaxMinor: summary.taxMinor,
    selectedShippingMinor: selectedRate?.amountMinor ?? null,
    allInTotalMinor: arithmeticComplete ? summary.totalMinor : null,
    allInTotalProven: arithmeticComplete,
    sourceDeliveryDate,
    structuredEtaObserved: sourceDeliveryDate !== null,
    deliveryDeadlineProven: sourceDeliveryDate !== null
      && sourceDeliveryDate <= deadlineDate,
  });
}

function redirectIsCheckout(exchange) {
  if (![302, 303].includes(exchange.status)
    || typeof exchange.headers.location !== "string") return false;
  let target;
  try { target = new URL(exchange.headers.location, CHECKOUT_URL); }
  catch { return false; }
  return target.origin === ORIGIN && target.pathname === "/checkout";
}

function requestInput(state, request, fields) {
  return {
    provider: PROVIDER,
    sessionRefHash: sourceSpecificCartDigestV1(
      "outsider/adafruit-full-address-shipping-quote-session/v2", {
        accountRefHash: state.accountRefHash,
        transactionRefHash: request.transactionRefHash,
        productId: state.productId,
        quantity: state.quantity,
        contactRefHash: state.contactRefHash,
        destinationRefHash: state.destination.destinationRefHash,
      }),
    operation: request.operation,
    ...fields,
  };
}

async function exchange(state, request, fields) {
  return invokeSourceSpecificHttpsV1(state.httpsRequestImpl,
    requestInput(state, request, fields), PREFIX);
}

function exchangeSource(value) {
  return {
    step: value.step,
    method: value.method,
    url: value.url,
    requestBodyHash: value.requestBodyHash,
    status: value.status,
    finalUrl: value.finalUrl,
    headers: value.headers,
    bodyBytes: value.bodyBytes.length,
    bodyBytesHash: sourceSpecificCartBytesHashV1(value.bodyBytes),
    bodyBase64: value.bodyBytes.toString("base64"),
  };
}

function sourceResponse(state, request, input) {
  const body = {
    schema: RECEIPT_SCHEMA,
    schemaVersion: "2.0.0",
    provider: PROVIDER,
    operation: request.operation,
    transactionRefHash: request.transactionRefHash,
    outcomeIntentRefHash: request.outcomeIntentRefHash,
    routeRole: request.routeRole,
    effectIdHash: request.effectIdHash,
    idempotencyKeyHash: request.idempotencyKey,
    product: { productId: state.productId, quantity: state.quantity },
    contactRefHash: state.contactRefHash,
    destinationRefHash: state.destination.destinationRefHash,
    lifecycleState: input.lifecycleState,
    nextGate: input.nextGate,
    normalized: input.normalized,
    exchanges: input.exchanges.map(exchangeSource),
    sourceOccurrenceOnly: true,
    fullAddressSubmitted: input.fullAddressSubmitted,
    shippingMethodApplied: false,
    paymentMethodSelected: false,
    paymentPerformed: false,
    orderSubmitted: false,
    cartEstablishesCapacity: false,
    capacityReserved: false,
    independentOutcomeTruthEstablished: false,
    userResultCommitted: false,
  };
  const sourceBytes = Buffer.from(canonicalizeStrict({ ...body,
    receiptHash: sourceSpecificCartDigestV1(RECEIPT_SCHEMA, body) }), "utf8");
  if (sourceBytes.length < 1 || sourceBytes.length > MAX_SOURCE_RECEIPT_BYTES) {
    sourceSpecificCartFailV1(PREFIX, "SOURCE_RECEIPT_SIZE_INVALID");
  }
  return createSourceSpecificCartDriverResponseV1({
    sourceBytes,
    sourceState: input.sourceState,
    sourceExpiresAt: input.sourceExpiresAt,
    sourceRecordClass: input.sourceRecordClass,
  });
}

async function observeAddressForm(state, request, step) {
  const observed = await exchange(state, request, {
    step,
    method: "GET",
    url: CHECKOUT_URL,
    headers: { accept: "text/html" },
    bodyBytes: null,
    allowedStatuses: [200],
  });
  return { observed, form: addressForm(text(observed, "ADDRESS_FORM")) };
}

async function requestImpl(state, request) {
  validateSourceSpecificCartRequestV1(request, {
    schema: COMMAND_SCHEMA,
    provider: PROVIDER,
    productId: state.productId,
    quantity: state.quantity,
  }, PREFIX);
  if (request.operation === "QUOTE") {
    const current = await observeAddressForm(state, request,
      "CHECKOUT_FULL_ADDRESS_FORM_GET");
    return sourceResponse(state, request, {
      lifecycleState: "FULL_ADDRESS_FORM_AVAILABLE_HOLD",
      nextGate: "SUBMIT_FULL_ADDRESS_CAPTURE_SHIPPING_RATES",
      normalized: {
        destinationRefHash: state.destination.destinationRefHash,
        addressFormObserved: true,
        endpoint: CHECKOUT_URL,
        method: "POST",
        fieldNames: Object.freeze([...new Set(current.form.controls
          .map((entry) => entry.name))].sort()),
        actionControlName: "action",
        actionValue: "save_two",
      },
      exchanges: [current.observed],
      fullAddressSubmitted: false,
      sourceState: "QUOTE_AVAILABLE",
      sourceExpiresAt: request.expiresAt,
      sourceRecordClass: "QUOTE",
    });
  }
  const preflight = await observeAddressForm(state, request,
    "CHECKOUT_FULL_ADDRESS_PREFLIGHT_GET");
  const addressBody = compileAddressBody(preflight.form, state.destination);
  const submitted = await exchange(state, request, {
    step: "CHECKOUT_FULL_ADDRESS_POST",
    method: "POST",
    url: CHECKOUT_URL,
    headers: { accept: "text/html",
      "content-type": "application/x-www-form-urlencoded" },
    bodyBytes: addressBody,
    allowedStatuses: [200, 302, 303],
  });
  const exchanges = [preflight.observed, submitted];
  let rateExchange = submitted;
  if ([302, 303].includes(submitted.status)) {
    if (!redirectIsCheckout(submitted)) {
      sourceSpecificCartFailV1(PREFIX, "ADDRESS_REDIRECT_NOT_CHECKOUT");
    }
    rateExchange = await exchange(state, request, {
      step: "CHECKOUT_SHIPPING_RATES_GET",
      method: "GET",
      url: CHECKOUT_URL,
      headers: { accept: "text/html" },
      bodyBytes: null,
      allowedStatuses: [200],
    });
    exchanges.push(rateExchange);
  }
  const quote = rateQuote(text(rateExchange, "SHIPPING_RATES"),
    state.destination.completionDeadline);
  const readyForPaymentAuthorization = quote.allInTotalProven
    && quote.deliveryDeadlineProven;
  return sourceResponse(state, request, {
    lifecycleState: readyForPaymentAuthorization
      ? "DESTINATION_QUOTE_READY_FOR_PAYMENT_AUTHORIZATION_HOLD"
      : "DESTINATION_SHIPPING_RATES_OBSERVED_HOLD",
    nextGate: readyForPaymentAuthorization
      ? "SEPARATE_PAYMENT_AND_ORDER_AUTHORIZATION"
      : "SELECT_RATE_AND_PROVE_ALL_IN_TOTAL_AND_DELIVERY_DATE",
    normalized: {
      destinationRefHash: state.destination.destinationRefHash,
      fullAddressSubmitted: true,
      currency: "USD",
      quote,
    },
    exchanges,
    fullAddressSubmitted: true,
    sourceState: "HOLD_ACKNOWLEDGED",
    sourceExpiresAt: request.expiresAt,
    sourceRecordClass: "CHECKOUT_RECEIPT",
  });
}

export function issueAdafruitPrivateFullAddressShippingQuoteGrantV2(input = {}) {
  exactSourceSpecificCartObjectV1(input, [
    "destinationRefHash", "authorizedAt", "expiresAt", "firstName",
    "lastName", "telephone", "countryCode", "region", "city",
    "postalCode", "streetLines", "providerCountryId", "providerRegionId",
    "completionDeadline",
  ], PREFIX, "DESTINATION_GRANT_INPUT");
  const authorizedAt = sourceSpecificCartInstantV1(input.authorizedAt, PREFIX,
    "AUTHORIZED_AT");
  const expiresAt = sourceSpecificCartInstantV1(input.expiresAt, PREFIX,
    "EXPIRES_AT");
  const completionDeadline = sourceSpecificCartInstantV1(
    input.completionDeadline, PREFIX, "COMPLETION_DEADLINE");
  if (Date.parse(authorizedAt) >= Date.parse(expiresAt)
    || Date.parse(expiresAt) >= Date.parse(completionDeadline)
    || input.countryCode !== "US" || input.region !== "Massachusetts"
    || input.providerCountryId !== "223" || input.providerRegionId !== "32"
    || !Array.isArray(input.streetLines) || input.streetLines.length < 1
    || input.streetLines.length > 2) {
    sourceSpecificCartFailV1(PREFIX, "DESTINATION_GRANT_INVALID");
  }
  const privateDestination = Object.freeze({
    destinationRefHash: sourceSpecificCartHashV1(input.destinationRefHash,
      PREFIX, "DESTINATION_REF_HASH"),
    authorizedAt,
    expiresAt,
    firstName: privateText(input.firstName, "FIRST_NAME", 128),
    lastName: privateText(input.lastName, "LAST_NAME", 128),
    telephone: privateText(input.telephone, "TELEPHONE", 64),
    countryCode: input.countryCode,
    region: input.region,
    city: privateText(input.city, "CITY", 128),
    postalCode: privateText(input.postalCode, "POSTAL_CODE", 32),
    streetLines: Object.freeze(input.streetLines.map((line) =>
      optionalPrivateText(line, "STREET_LINE", 256))),
    providerCountryId: input.providerCountryId,
    providerRegionId: input.providerRegionId,
    completionDeadline,
  });
  const grant = Object.freeze({
    schema: GRANT_SCHEMA,
    schemaVersion: "2.0.0",
    destinationRefHash: privateDestination.destinationRefHash,
    authorizedAt,
    expiresAt,
    countryCode: "US",
    region: "Massachusetts",
    fullAddressPresent: true,
    telephonePresent: true,
    rawDestinationProjected: false,
  });
  GRANTS.set(grant, privateDestination);
  return grant;
}

export function createAdafruitFullAddressShippingQuoteCommandBytesV2(input = {}) {
  exactSourceSpecificCartObjectV1(input, ["productId", "quantity"], PREFIX,
    "COMMAND_INPUT");
  return createSourceSpecificCartCommandBytesV1(COMMAND_SCHEMA, PROVIDER,
    productId(input.productId), quantity(input.quantity));
}

export function issueAdafruitFullAddressShippingQuoteCapabilityV2(input = {},
  dependencies = {}) {
  exactSourceSpecificCartObjectV1(input, [
    "capabilityRefHash", "accountRefHash", "nodeRefHash", "issuedAt",
    "expiresAt", "productId", "quantity", "contactRefHash",
    "destinationGrant",
  ], PREFIX, "CAPABILITY_INPUT");
  exactSourceSpecificCartObjectV1(dependencies, [
    "httpsRequestImpl", "revalidateImpl",
  ], PREFIX, "DEPENDENCIES");
  const destination = GRANTS.get(input.destinationGrant);
  if (destination === undefined) {
    sourceSpecificCartFailV1(PREFIX,
      "DESTINATION_GRANT_NOT_FACTORY_ISSUED");
  }
  if (destination.expiresAt !== input.expiresAt
    || Date.parse(input.issuedAt) < Date.parse(destination.authorizedAt)
    || typeof dependencies.httpsRequestImpl !== "function"
    || typeof dependencies.revalidateImpl !== "function") {
    sourceSpecificCartFailV1(PREFIX, "CAPABILITY_BINDING_INVALID");
  }
  const state = {
    accountRefHash: sourceSpecificCartHashV1(input.accountRefHash, PREFIX,
      "ACCOUNT_REF_HASH"),
    productId: productId(input.productId),
    quantity: quantity(input.quantity),
    contactRefHash: sourceSpecificCartHashV1(input.contactRefHash, PREFIX,
      "CONTACT_REF_HASH"),
    destination,
    httpsRequestImpl: dependencies.httpsRequestImpl,
  };
  const capability = issueBuyerNativeTransactionAccountCapabilityV1({
    capabilityRefHash: input.capabilityRefHash,
    accountRefHash: input.accountRefHash,
    nodeRefHash: input.nodeRefHash,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    supportedOperations: ["QUOTE", "HOLD"],
  }, {
    requestImpl: (request) => requestImpl(state, request),
    revalidateImpl: dependencies.revalidateImpl,
    sourceOccurrenceSink: null,
  });
  CAPABILITIES.set(capability, Object.freeze({
    provider: PROVIDER,
    productId: state.productId,
    quantity: state.quantity,
    contactRefHash: state.contactRefHash,
    destinationRefHash: destination.destinationRefHash,
  }));
  return capability;
}

export function inspectAdafruitFullAddressShippingQuoteCapabilityV2(capability) {
  const state = CAPABILITIES.get(capability);
  if (state === undefined) {
    sourceSpecificCartFailV1(PREFIX, "CAPABILITY_NOT_FACTORY_ISSUED");
  }
  return Object.freeze({
    ...state,
    supportedOperations: Object.freeze(["QUOTE", "HOLD"]),
    orderScopedPrivateCookieSessionRequired: true,
    fullAddressPubliclyProjected: false,
    shippingMethodApplicationEnabled: false,
    paymentEnabled: false,
    orderSubmissionEnabled: false,
    capacityReserved: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
}
