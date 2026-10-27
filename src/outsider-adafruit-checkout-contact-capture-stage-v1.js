/*
 * Adafruit checkout contact-capture stage v1.
 *
 * This versioned stage starts from the anonymous cart owned by the existing
 * Adafruit guest-shopper adapter and the same order-scoped HTTPS transport.
 * It submits only checkout step 1 (contact email), then captures the returned
 * step-2 address/shipping form as an exact private source occurrence. It has
 * no address-submit, payment, or order-submit path.
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

const PREFIX = "OUTSIDER_ADAFRUIT_CHECKOUT_CONTACT_CAPTURE_STAGE_V1_";
const PROVIDER = "ADAFRUIT_GUEST_SHOPPER";
const ORIGIN = "https://www.adafruit.com";
const CHECKOUT_URL = `${ORIGIN}/checkout`;
const COMMAND_SCHEMA = "outsider/adafruit-checkout-contact-capture-command/v1";
const RECEIPT_SCHEMA
  = "outsider/adafruit-private-checkout-contact-capture-receipt/v1";
const GRANT_SCHEMA = "outsider/private-adafruit-checkout-contact-grant/v1";
const MAX_SOURCE_RECEIPT_BYTES = 1024 * 1024;
const GRANTS = new WeakMap();
const CAPABILITIES = new WeakMap();

export const OUTSIDER_ADAFRUIT_CHECKOUT_CONTACT_CAPTURE_STAGE_V1_BOUNDARY
  = Object.freeze({
    provider: PROVIDER,
    protocol: "ADAFRUIT_GUEST_CHECKOUT_HTML",
    supportedStages: Object.freeze([
      "CONTACT_FORM",
      "SUBMIT_CONTACT_CAPTURE_ADDRESS_SHIPPING_FORM",
    ]),
    supportedOperations: Object.freeze(["QUOTE", "HOLD"]),
    startsFromIsolatedGuestCart: true,
    orderScopedPrivateCookieSessionRequired: true,
    privateContactGrantRequired: true,
    contactEmailSubmitted: true,
    contactEmailPubliclyProjected: false,
    addressFormExactSourceCaptured: true,
    fullAddressSubmitted: false,
    paymentInputAccepted: false,
    paymentPerformed: false,
    orderSubmissionImplemented: false,
    orderSubmitted: false,
    cartEstablishesCapacity: false,
    capacityReserved: false,
    userResultCommitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function email(value) {
  if (typeof value !== "string" || value.length < 3 || value.length > 254
    || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, "EMAIL_INVALID");
  }
  return value;
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

function attribute(tag, name) {
  const match = tag.match(new RegExp(
    `\\b${name}=(?:"([^"]*)"|'([^']*)')`, "iu"));
  return match?.[1] ?? match?.[2] ?? null;
}

function formRecords(html) {
  const records = [];
  for (const match of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/giu)) {
    const source = match[0];
    const opening = source.slice(0, source.indexOf(">") + 1);
    const controls = [];
    const actionValues = [];
    for (const controlMatch of source.matchAll(
      /<(?:input|select|textarea|button)\b[^>]*>/giu)) {
      const tagSource = controlMatch[0];
      const tag = tagSource.match(/^<([a-z]+)/iu)?.[1]?.toLowerCase() ?? null;
      const name = attribute(tagSource, "name");
      if (name === null
        || !/^[A-Za-z][A-Za-z0-9_:[\].-]{0,127}$/u.test(name)) continue;
      const type = attribute(tagSource, "type");
      controls.push(Object.freeze({ tag, name,
        type: type === null ? null : type.toLowerCase(),
        required: /\brequired(?:\s|=|>)/iu.test(tagSource) }));
      if (name === "action") {
        const value = attribute(tagSource, "value");
        if (["save_one", "save_two"].includes(value)) actionValues.push(value);
      }
    }
    records.push(Object.freeze({
      action: attribute(opening, "action"),
      method: (attribute(opening, "method") ?? "get").toLowerCase(),
      controls: Object.freeze(controls),
      actionValues: Object.freeze([...new Set(actionValues)]),
      source,
    }));
  }
  return records;
}

function formNames(form) {
  return [...new Set(form.controls.map((entry) => entry.name))].sort();
}

function checkoutPostForm(forms, predicate, code) {
  const selected = forms.filter((form) => {
    let action;
    try { action = new URL(form.action ?? "", CHECKOUT_URL); }
    catch { return false; }
    return action.origin === ORIGIN && action.pathname === "/checkout"
      && action.search === "" && action.hash === "" && form.method === "post"
      && predicate(form);
  });
  if (selected.length !== 1) {
    sourceSpecificCartFailV1(PREFIX, `${code}_FORM_INVALID`);
  }
  return selected[0];
}

function contactForm(html) {
  return checkoutPostForm(formRecords(html), (form) => {
    const names = new Set(formNames(form));
    return names.has("csrf_token") && names.has("email_address")
      && names.has("action") && form.actionValues.includes("save_one");
  }, "CONTACT");
}

function csrfToken(form) {
  const match = form.source.match(
    /<input\b(?=[^>]*\bname=["']csrf_token["'])[^>]*\bvalue=["']([^"']+)["'][^>]*>/iu,
  );
  if (match === null || !/^[A-Za-z0-9._~-]{16,512}$/u.test(match[1])) {
    sourceSpecificCartFailV1(PREFIX, "CSRF_TOKEN_INVALID");
  }
  return match[1];
}

function addressForm(html) {
  const candidates = formRecords(html).filter((form) => {
    let action;
    try { action = new URL(form.action ?? "", CHECKOUT_URL); }
    catch { return false; }
    if (action.origin !== ORIGIN || action.pathname !== "/checkout"
      || action.search !== "" || action.hash !== "" || form.method !== "post") {
      return false;
    }
    const names = formNames(form);
    const addressSignals = names.filter((name) =>
      /(?:address|street|city|country|state|province|postal|postcode|zip)/iu
        .test(name));
    return form.actionValues.includes("save_two") || addressSignals.length >= 3;
  });
  if (candidates.length !== 1) return null;
  const selected = candidates[0];
  const names = formNames(selected);
  const safeControls = selected.controls.map((control) => ({ ...control }));
  return Object.freeze({
    action: CHECKOUT_URL,
    method: "POST",
    fieldNames: Object.freeze(names),
    controls: Object.freeze(safeControls),
    nextActionControlName: selected.actionValues.includes("save_two")
      ? "action" : null,
    nextActionValue: selected.actionValues.includes("save_two")
      ? "save_two" : null,
    machineUsableNextPostObserved:
      selected.actionValues.includes("save_two"),
  });
}

function formBytes(entries) {
  return Buffer.from(new URLSearchParams(entries).toString(), "utf8");
}

function requestInput(state, request, fields) {
  return {
    provider: PROVIDER,
    sessionRefHash: sourceSpecificCartDigestV1(
      "outsider/adafruit-checkout-contact-private-session/v1", {
        accountRefHash: state.accountRefHash,
        transactionRefHash: request.transactionRefHash,
        productId: state.productId,
        quantity: state.quantity,
        contactRefHash: state.contact.contactRefHash,
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
    schemaVersion: "1.0.0",
    provider: PROVIDER,
    operation: request.operation,
    transactionRefHash: request.transactionRefHash,
    outcomeIntentRefHash: request.outcomeIntentRefHash,
    routeRole: request.routeRole,
    effectIdHash: request.effectIdHash,
    idempotencyKeyHash: request.idempotencyKey,
    product: { productId: state.productId, quantity: state.quantity },
    contactRefHash: state.contact.contactRefHash,
    lifecycleState: input.lifecycleState,
    nextGate: input.nextGate,
    normalized: input.normalized,
    exchanges: input.exchanges.map(exchangeSource),
    sourceOccurrenceOnly: true,
    contactSubmitted: input.contactSubmitted,
    fullAddressSubmitted: false,
    paymentMethodSelected: false,
    paymentPerformed: false,
    orderSubmitted: false,
    cartEstablishesCapacity: false,
    capacityReserved: false,
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

async function observeContactForm(state, request, step) {
  const observed = await exchange(state, request, {
    step,
    method: "GET",
    url: CHECKOUT_URL,
    headers: { accept: "text/html" },
    bodyBytes: null,
    allowedStatuses: [200],
  });
  const form = contactForm(text(observed, "CHECKOUT"));
  return { observed, form };
}

function redirectIsCheckout(exchangeValue) {
  if (![302, 303].includes(exchangeValue.status)
    || typeof exchangeValue.headers.location !== "string") return false;
  let target;
  try { target = new URL(exchangeValue.headers.location, CHECKOUT_URL); }
  catch { return false; }
  return target.origin === ORIGIN && target.pathname === "/checkout"
    && target.search === "" && target.hash === "";
}

async function requestImpl(state, request) {
  validateSourceSpecificCartRequestV1(request, {
    schema: COMMAND_SCHEMA,
    provider: PROVIDER,
    productId: state.productId,
    quantity: state.quantity,
  }, PREFIX);
  if (request.operation === "QUOTE") {
    const current = await observeContactForm(state, request,
      "CHECKOUT_CONTACT_FORM_GET");
    return sourceResponse(state, request, {
      lifecycleState: "CONTACT_FORM_AVAILABLE_HOLD",
      nextGate: "SUBMIT_CONTACT_CAPTURE_ADDRESS_SHIPPING_FORM",
      normalized: {
        contactRefHash: state.contact.contactRefHash,
        contactFormObserved: true,
        endpoint: CHECKOUT_URL,
        method: "POST",
        fieldNames: formNames(current.form),
        actionControlName: "action",
        actionValue: "save_one",
      },
      exchanges: [current.observed],
      contactSubmitted: false,
      sourceState: "QUOTE_AVAILABLE",
      sourceExpiresAt: request.expiresAt,
      sourceRecordClass: "QUOTE",
    });
  }
  const preflight = await observeContactForm(state, request,
    "CHECKOUT_CONTACT_PREFLIGHT_GET");
  const submitted = await exchange(state, request, {
    step: "CHECKOUT_CONTACT_POST",
    method: "POST",
    url: CHECKOUT_URL,
    headers: { accept: "text/html",
      "content-type": "application/x-www-form-urlencoded" },
    bodyBytes: formBytes({ csrf_token: csrfToken(preflight.form),
      email_address: state.contact.email, action: "save_one" }),
    allowedStatuses: [200, 302, 303],
  });
  const exchanges = [preflight.observed, submitted];
  let stepTwoExchange = submitted;
  if ([302, 303].includes(submitted.status)) {
    if (!redirectIsCheckout(submitted)) {
      sourceSpecificCartFailV1(PREFIX, "CONTACT_REDIRECT_NOT_CHECKOUT");
    }
    stepTwoExchange = await exchange(state, request, {
      step: "CHECKOUT_ADDRESS_SHIPPING_FORM_GET",
      method: "GET",
      url: CHECKOUT_URL,
      headers: { accept: "text/html" },
      bodyBytes: null,
      allowedStatuses: [200],
    });
    exchanges.push(stepTwoExchange);
  }
  const captured = addressForm(text(stepTwoExchange, "ADDRESS_FORM"));
  const observed = captured !== null;
  return sourceResponse(state, request, {
    lifecycleState: observed
      ? "CONTACT_ACCEPTED_ADDRESS_SHIPPING_FORM_CAPTURED_HOLD"
      : "CONTACT_POST_OBSERVED_ADDRESS_SHIPPING_FORM_UNPROVEN_HOLD",
    nextGate: observed
      ? "COMPILE_PRIVATE_FULL_ADDRESS_FOR_OBSERVED_NEXT_POST"
      : "ADDRESS_SHIPPING_FORM_PROTOCOL_GAP",
    normalized: {
      contactRefHash: state.contact.contactRefHash,
      contactSubmitted: true,
      addressShippingFormObserved: observed,
      addressShippingForm: captured,
      machineUsableNextRateInterfaceObserved:
        captured?.machineUsableNextPostObserved === true,
    },
    exchanges,
    contactSubmitted: true,
    sourceState: observed ? "HOLD_ACKNOWLEDGED" : "REJECTED",
    sourceExpiresAt: observed ? request.expiresAt : null,
    sourceRecordClass: "CHECKOUT_RECEIPT",
  });
}

export function issueAdafruitPrivateCheckoutContactGrantV1(input = {}) {
  exactSourceSpecificCartObjectV1(input, [
    "contactRefHash", "authorizedAt", "expiresAt", "email",
  ], PREFIX, "CONTACT_GRANT_INPUT");
  const authorizedAt = sourceSpecificCartInstantV1(input.authorizedAt, PREFIX,
    "AUTHORIZED_AT");
  const expiresAt = sourceSpecificCartInstantV1(input.expiresAt, PREFIX,
    "EXPIRES_AT");
  if (Date.parse(authorizedAt) >= Date.parse(expiresAt)) {
    sourceSpecificCartFailV1(PREFIX, "CONTACT_GRANT_INTERVAL_INVALID");
  }
  const grant = Object.freeze({
    schema: GRANT_SCHEMA,
    schemaVersion: "1.0.0",
    contactRefHash: sourceSpecificCartHashV1(input.contactRefHash, PREFIX,
      "CONTACT_REF_HASH"),
    authorizedAt,
    expiresAt,
    emailPresent: true,
  });
  GRANTS.set(grant, Object.freeze({ ...grant, email: email(input.email) }));
  return grant;
}

export function createAdafruitCheckoutContactCaptureCommandBytesV1(input = {}) {
  exactSourceSpecificCartObjectV1(input, ["productId", "quantity"], PREFIX,
    "COMMAND_INPUT");
  return createSourceSpecificCartCommandBytesV1(COMMAND_SCHEMA, PROVIDER,
    productId(input.productId), quantity(input.quantity));
}

export function issueAdafruitCheckoutContactCaptureCapabilityV1(input = {},
  dependencies = {}) {
  exactSourceSpecificCartObjectV1(input, [
    "capabilityRefHash", "accountRefHash", "nodeRefHash", "issuedAt",
    "expiresAt", "productId", "quantity", "contactGrant",
  ], PREFIX, "CAPABILITY_INPUT");
  exactSourceSpecificCartObjectV1(dependencies, [
    "httpsRequestImpl", "revalidateImpl",
  ], PREFIX, "DEPENDENCIES");
  const contact = GRANTS.get(input.contactGrant);
  if (contact === undefined) {
    sourceSpecificCartFailV1(PREFIX, "CONTACT_GRANT_NOT_FACTORY_ISSUED");
  }
  if (contact.expiresAt !== input.expiresAt
    || Date.parse(input.issuedAt) < Date.parse(contact.authorizedAt)
    || typeof dependencies.httpsRequestImpl !== "function"
    || typeof dependencies.revalidateImpl !== "function") {
    sourceSpecificCartFailV1(PREFIX, "CAPABILITY_BINDING_INVALID");
  }
  const state = {
    accountRefHash: sourceSpecificCartHashV1(input.accountRefHash, PREFIX,
      "ACCOUNT_REF_HASH"),
    productId: productId(input.productId),
    quantity: quantity(input.quantity),
    contact,
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
    contactRefHash: contact.contactRefHash,
  }));
  return capability;
}

export function inspectAdafruitCheckoutContactCaptureCapabilityV1(capability) {
  const state = CAPABILITIES.get(capability);
  if (state === undefined) {
    sourceSpecificCartFailV1(PREFIX, "CAPABILITY_NOT_FACTORY_ISSUED");
  }
  return Object.freeze({
    ...state,
    supportedOperations: Object.freeze(["QUOTE", "HOLD"]),
    orderScopedPrivateCookieSessionRequired: true,
    contactEmailPubliclyProjected: false,
    fullAddressSubmitted: false,
    paymentEnabled: false,
    orderSubmissionEnabled: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
}
