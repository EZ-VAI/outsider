/*
 * Adafruit guest-shopper buyer-native adapter v1.
 *
 * The injected HTTPS closure owns an order-scoped anonymous cookie jar. This
 * adapter can observe one exact catalog item, create/read an isolated cart,
 * and empty it. It has no checkout, address, payment, or order-submit path.
 */

import {
  issueBuyerNativeTransactionAccountCapabilityV1,
} from "./outsider-buyer-native-transaction-capability-v1.js";
import {
  createSourceSpecificCartCommandBytesV1,
  createSourceSpecificCartDriverResponseV1,
  createSourceSpecificCartReceiptBytesV1,
  exactSourceSpecificCartObjectV1,
  invokeSourceSpecificHttpsV1,
  sourceSpecificCartDigestV1,
  sourceSpecificCartFailV1,
  sourceSpecificCartHashV1,
  validateSourceSpecificCartRequestV1,
} from "./outsider-source-specific-guest-cart-support-v1.js";

const PREFIX = "OUTSIDER_ADAFRUIT_GUEST_SHOPPER_ADAPTER_V1_";
const PROVIDER = "ADAFRUIT_GUEST_SHOPPER";
const COMMAND_SCHEMA = "outsider/adafruit-guest-shopper-command/v1";
const RECEIPT_SCHEMA = "outsider/adafruit-guest-shopper-private-source-receipt/v1";
const ORIGIN = "https://www.adafruit.com";
const CART_URL = `${ORIGIN}/shopping_cart`;
const ADD_URL = `${ORIGIN}/added`;
const CAPABILITIES = new WeakMap();

export const OUTSIDER_ADAFRUIT_GUEST_SHOPPER_ADAPTER_V1_BOUNDARY
  = Object.freeze({
    provider: PROVIDER,
    transportFamily: "PROVIDER_OWNED_TRANSACTION_API",
    sourceSpecific: true,
    arbitraryUrlAccepted: false,
    injectedHttpsClosureRequired: true,
    orderScopedPrivateCookieSessionRequired: true,
    supportedOperations: Object.freeze(["QUOTE", "HOLD", "STATUS", "CANCEL"]),
    cartLifecycleState: "CART_READY_HOLD",
    cartNextGate: "NEEDS_ADDRESS_AND_PAYMENT",
    checkoutEnabledByDefault: false,
    checkoutImplemented: false,
    addressInputAccepted: false,
    paymentInputAccepted: false,
    orderSubmissionImplemented: false,
    rawCookieProjected: false,
    rawCartSourceProjected: false,
    cartEstablishesCapacity: false,
    cartAuthorizesPayment: false,
    cartCommitsUserResult: false,
    capacityReserved: false,
    paymentPerformed: false,
    orderSubmitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

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
  const contentType = exchange.headers.contentType;
  if (typeof contentType !== "string"
    || !/^text\/html(?:\s*;|\s*$)/iu.test(contentType)) {
    sourceSpecificCartFailV1(PREFIX, `${code}_CONTENT_TYPE_INVALID`);
  }
  return exchange.bodyBytes.toString("utf8");
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}=["']([^"']*)["']`, "iu"));
  return match?.[1] ?? null;
}

function exactForm(html, predicate, code) {
  for (const match of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/giu)) {
    const opening = match[0].slice(0, match[0].indexOf(">") + 1);
    if (predicate(opening)) return match[0];
  }
  sourceSpecificCartFailV1(PREFIX, `${code}_FORM_MISSING`);
}

function securityToken(form, code) {
  const match = form.match(
    /<input\b(?=[^>]*\bname=["']securityToken["'])[^>]*\bvalue=["']([^"']+)["'][^>]*>/iu,
  );
  if (match === null || !/^[A-Za-z0-9._~-]{16,512}$/u.test(match[1])) {
    sourceSpecificCartFailV1(PREFIX, `${code}_SECURITY_TOKEN_INVALID`);
  }
  return match[1];
}

function parseCatalog(html, expectedProductId) {
  let product = null;
  for (const match of html.matchAll(
    /<script\b[^>]*\btype=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu,
  )) {
    let source;
    try { source = JSON.parse(match[1]); } catch { continue; }
    if (source?.["@type"] === "Product"
      && String(source.sku) === expectedProductId) {
      product = source;
      break;
    }
  }
  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const price = Number(offer?.price);
  const name = product?.name;
  const currency = offer?.priceCurrency;
  const inStock = typeof offer?.availability === "string"
    && /(?:^|\/)InStock$/u.test(offer.availability);
  if (typeof name !== "string" || name.trim() === ""
    || currency !== "USD" || !Number.isFinite(price) || price <= 0) {
    sourceSpecificCartFailV1(PREFIX, "CATALOG_PRODUCT_INVALID");
  }
  let token = null;
  if (inStock) {
    const form = exactForm(html, (opening) => attribute(opening, "action") === "/added",
      "ADD_PRODUCT");
    token = securityToken(form, "ADD_PRODUCT");
  }
  return Object.freeze({ productId: expectedProductId, name: name.trim(),
    currency, unitPrice: price, inStock, securityToken: token });
}

function cartRows(html) {
  const rows = [];
  for (const match of html.matchAll(/<div\b[^>]*\bclass=["'][^"']*\bcart-row\b[^"']*["'][^>]*>/giu)) {
    const pid = attribute(match[0], "data-pid");
    const qty = Number(attribute(match[0], "data-qty"));
    const price = Number(attribute(match[0], "data-price"));
    if (pid !== null && Number.isSafeInteger(qty) && qty >= 0
      && Number.isFinite(price) && price >= 0) rows.push({ pid, qty, price });
  }
  return rows;
}

function parseCart(html, expectedProductId, expectedQuantity) {
  const rows = cartRows(html);
  const selected = rows.filter(({ pid }) => pid === expectedProductId);
  const exactItem = rows.length === 1 && selected.length === 1
    && selected[0].qty === expectedQuantity;
  return Object.freeze({
    empty: rows.length === 0,
    exactItem,
    itemCount: rows.reduce((sum, row) => sum + row.qty, 0),
    subtotal: exactItem ? selected[0].price * selected[0].qty : null,
    rows: Object.freeze(rows.map((row) => Object.freeze({ ...row }))),
  });
}

function emptyCartToken(html) {
  const form = exactForm(html, (opening) =>
    attribute(opening, "action") === "/shopping_cart"
      && /\bdata-empty-cart-confirm(?:\s|>|=)/iu.test(opening), "EMPTY_CART");
  return securityToken(form, "EMPTY_CART");
}

function formBytes(entries) {
  return Buffer.from(new URLSearchParams(entries).toString(), "utf8");
}

function requestInput(state, request, fields) {
  return {
    provider: PROVIDER,
    sessionRefHash: sourceSpecificCartDigestV1(
      "outsider/adafruit-order-scoped-private-session/v1", {
        accountRefHash: state.accountRefHash,
        transactionRefHash: request.transactionRefHash,
        productId: state.productId,
        quantity: state.quantity,
      }),
    operation: request.operation,
    ...fields,
  };
}

async function exchange(state, request, fields) {
  return invokeSourceSpecificHttpsV1(state.requestExact,
    requestInput(state, request, fields), PREFIX);
}

function sourceResponse(state, request, input) {
  const sourceBytes = createSourceSpecificCartReceiptBytesV1({
    schema: RECEIPT_SCHEMA,
    provider: PROVIDER,
    operation: request.operation,
    request,
    product: Object.freeze({ productId: state.productId,
      quantity: state.quantity }),
    lifecycleState: input.lifecycleState,
    nextGate: input.nextGate,
    normalized: input.normalized,
    exchanges: input.exchanges,
  }, PREFIX);
  return createSourceSpecificCartDriverResponseV1({
    sourceBytes,
    sourceState: input.sourceState,
    sourceExpiresAt: input.sourceExpiresAt,
    sourceRecordClass: input.sourceRecordClass,
  });
}

async function observeCatalog(state, request) {
  const catalogUrl = `${ORIGIN}/product/${state.productId}`;
  const observed = await exchange(state, request, {
    step: "CATALOG_GET",
    method: "GET",
    url: catalogUrl,
    headers: { accept: "text/html" },
    bodyBytes: null,
    allowedStatuses: [200],
  });
  const catalog = parseCatalog(text(observed, "CATALOG"), state.productId);
  return { observed, catalog };
}

async function observeCart(state, request, step = "CART_GET") {
  const observed = await exchange(state, request, {
    step,
    method: "GET",
    url: CART_URL,
    headers: { accept: "text/html" },
    bodyBytes: null,
    allowedStatuses: [200],
  });
  const html = text(observed, "CART");
  return { observed, html,
    cart: parseCart(html, state.productId, state.quantity) };
}

async function requestImpl(state, request) {
  validateSourceSpecificCartRequestV1(request, {
    schema: COMMAND_SCHEMA,
    provider: PROVIDER,
    productId: state.productId,
    quantity: state.quantity,
  }, PREFIX);

  if (request.operation === "QUOTE") {
    const { observed, catalog } = await observeCatalog(state, request);
    return sourceResponse(state, request, {
      lifecycleState: catalog.inStock
        ? "CATALOG_QUOTE_AVAILABLE_HOLD" : "CATALOG_UNAVAILABLE_HOLD",
      nextGate: catalog.inStock ? "CREATE_ISOLATED_CART" : "UNAVAILABLE",
      normalized: { productId: catalog.productId, name: catalog.name,
        currency: catalog.currency, unitPrice: catalog.unitPrice,
        quantity: state.quantity, inStock: catalog.inStock },
      exchanges: [observed],
      sourceState: catalog.inStock ? "QUOTE_AVAILABLE" : "REJECTED",
      sourceExpiresAt: catalog.inStock ? request.expiresAt : null,
      sourceRecordClass: "PUBLISHED_INVENTORY",
    });
  }

  if (request.operation === "HOLD") {
    const { observed: catalogObserved, catalog }
      = await observeCatalog(state, request);
    if (!catalog.inStock) {
      return sourceResponse(state, request, {
        lifecycleState: "CATALOG_UNAVAILABLE_HOLD",
        nextGate: "UNAVAILABLE",
        normalized: { productId: state.productId, quantity: state.quantity,
          inStock: false },
        exchanges: [catalogObserved],
        sourceState: "REJECTED",
        sourceExpiresAt: null,
        sourceRecordClass: "CHECKOUT_RECEIPT",
      });
    }
    const before = await observeCart(state, request, "CART_PREFLIGHT_GET");
    const exchanges = [catalogObserved, before.observed];
    let after = before;
    if (!before.cart.exactItem) {
      if (!before.cart.empty) {
        sourceSpecificCartFailV1(PREFIX, "ORDER_SCOPED_CART_NOT_ISOLATED");
      }
      const added = await exchange(state, request, {
        step: "ADD_PRODUCT_POST",
        method: "POST",
        url: ADD_URL,
        headers: { accept: "text/html",
          "content-type": "application/x-www-form-urlencoded" },
        bodyBytes: formBytes({ action: "add_product", pid: state.productId,
          qty: String(state.quantity), source_page: "product",
          source_id: state.productId, securityToken: catalog.securityToken }),
        allowedStatuses: [302, 303],
      });
      after = await observeCart(state, request, "CART_AFTER_ADD_GET");
      exchanges.push(added, after.observed);
    }
    if (!after.cart.exactItem) {
      sourceSpecificCartFailV1(PREFIX, "EXACT_CART_ITEM_NOT_OBSERVED");
    }
    return sourceResponse(state, request, {
      lifecycleState: "CART_READY_HOLD",
      nextGate: "NEEDS_ADDRESS_AND_PAYMENT",
      normalized: { productId: state.productId, quantity: state.quantity,
        currency: catalog.currency, unitPrice: catalog.unitPrice,
        subtotal: after.cart.subtotal, itemCount: after.cart.itemCount,
        inStock: true },
      exchanges,
      sourceState: "CART_READY",
      sourceExpiresAt: request.expiresAt,
      sourceRecordClass: "CHECKOUT_RECEIPT",
    });
  }

  if (request.operation === "STATUS") {
    const current = await observeCart(state, request);
    return sourceResponse(state, request, {
      lifecycleState: current.cart.exactItem
        ? "CART_READY_HOLD" : "CART_NOT_READY_HOLD",
      nextGate: current.cart.exactItem
        ? "NEEDS_ADDRESS_AND_PAYMENT" : "UNAVAILABLE",
      normalized: { productId: state.productId, quantity: state.quantity,
        itemCount: current.cart.itemCount, subtotal: current.cart.subtotal,
        exactItemPresent: current.cart.exactItem },
      exchanges: [current.observed],
      sourceState: current.cart.exactItem ? "CART_READY" : "REJECTED",
      sourceExpiresAt: current.cart.exactItem ? request.expiresAt : null,
      sourceRecordClass: "STATUS_RECEIPT",
    });
  }

  const before = await observeCart(state, request, "CART_BEFORE_EMPTY_GET");
  const exchanges = [before.observed];
  if (!before.cart.empty) {
    if (!before.cart.exactItem) {
      sourceSpecificCartFailV1(PREFIX, "ORDER_SCOPED_CART_NOT_ISOLATED");
    }
    const emptied = await exchange(state, request, {
      step: "EMPTY_CART_POST",
      method: "POST",
      url: CART_URL,
      headers: { accept: "text/html",
        "content-type": "application/x-www-form-urlencoded" },
      bodyBytes: formBytes({ securityToken: emptyCartToken(before.html),
        action: "empty_cart" }),
      allowedStatuses: [302, 303],
    });
    exchanges.push(emptied);
  }
  const after = await observeCart(state, request, "CART_AFTER_EMPTY_GET");
  exchanges.push(after.observed);
  if (!after.cart.empty) sourceSpecificCartFailV1(PREFIX, "CART_EMPTY_NOT_OBSERVED");
  return sourceResponse(state, request, {
    lifecycleState: "CART_EMPTY_HOLD",
    nextGate: "NONE",
    normalized: { productId: state.productId, quantity: state.quantity,
      itemCount: 0, exactItemPresent: false },
    exchanges,
    sourceState: "CANCELLATION_ACKNOWLEDGED",
    sourceExpiresAt: null,
    sourceRecordClass: "CANCELLATION_RECEIPT",
  });
}

export function createAdafruitGuestShopperCommandBytesV1(input = {}) {
  exactSourceSpecificCartObjectV1(input, ["productId", "quantity"], PREFIX,
    "COMMAND_INPUT");
  return createSourceSpecificCartCommandBytesV1(COMMAND_SCHEMA, PROVIDER,
    productId(input.productId), quantity(input.quantity));
}

export function issueAdafruitGuestShopperBuyerNativeCapabilityV1(input = {},
  dependencies = {}) {
  exactSourceSpecificCartObjectV1(input, [
    "capabilityRefHash", "accountRefHash", "nodeRefHash", "issuedAt",
    "expiresAt", "productId", "quantity",
  ], PREFIX, "CAPABILITY_INPUT");
  const dependencyKeys = Reflect.ownKeys(dependencies);
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies) || Buffer.isBuffer(dependencies)
    || !Object.hasOwn(dependencies, "httpsRequestImpl")
    || !Object.hasOwn(dependencies, "revalidateImpl")
    || dependencyKeys.some((key) => ![
      "httpsRequestImpl", "revalidateImpl", "sourceOccurrenceSink",
    ].includes(key))) {
    sourceSpecificCartFailV1(PREFIX, "DEPENDENCIES_FIELDS_INVALID");
  }
  if (typeof dependencies.httpsRequestImpl !== "function"
    || typeof dependencies.revalidateImpl !== "function"
    || (dependencies.sourceOccurrenceSink !== undefined
      && dependencies.sourceOccurrenceSink !== null
      && typeof dependencies.sourceOccurrenceSink !== "function")) {
    sourceSpecificCartFailV1(PREFIX, "DEPENDENCIES_INVALID");
  }
  const state = {
    accountRefHash: sourceSpecificCartHashV1(input.accountRefHash, PREFIX,
      "ACCOUNT_REF_HASH"),
    productId: productId(input.productId),
    quantity: quantity(input.quantity),
    requestExact: dependencies.httpsRequestImpl,
  };
  const capability = issueBuyerNativeTransactionAccountCapabilityV1({
    capabilityRefHash: input.capabilityRefHash,
    accountRefHash: input.accountRefHash,
    nodeRefHash: input.nodeRefHash,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    supportedOperations: ["QUOTE", "HOLD", "STATUS", "CANCEL"],
  }, {
    requestImpl: (request) => requestImpl(state, request),
    revalidateImpl: dependencies.revalidateImpl,
    sourceOccurrenceSink: dependencies.sourceOccurrenceSink ?? null,
  });
  CAPABILITIES.set(capability, Object.freeze({
    provider: PROVIDER,
    productId: state.productId,
    quantity: state.quantity,
  }));
  return capability;
}

export function inspectAdafruitGuestShopperBuyerNativeCapabilityV1(capability) {
  const state = CAPABILITIES.get(capability);
  if (state === undefined) sourceSpecificCartFailV1(PREFIX,
    "CAPABILITY_NOT_FACTORY_ISSUED");
  return Object.freeze({
    ...state,
    supportedOperations: OUTSIDER_ADAFRUIT_GUEST_SHOPPER_ADAPTER_V1_BOUNDARY
      .supportedOperations,
    cartLifecycleState: "CART_READY_HOLD",
    nextGate: "NEEDS_ADDRESS_AND_PAYMENT",
    checkoutEnabled: false,
    paymentEnabled: false,
    orderSubmissionEnabled: false,
    rawCookieProjected: false,
    capacityReserved: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
}
