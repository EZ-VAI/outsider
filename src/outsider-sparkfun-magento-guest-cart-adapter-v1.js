/*
 * SparkFun Magento guest-cart buyer-native adapter v1.
 *
 * Catalog observation and the official Magento guest-cart REST surface are
 * allowlisted. A caller-injected private state capability owns the masked cart
 * id; neither it nor response bytes enter the public projection. This adapter
 * cannot submit an address, payment, checkout, or order.
 */

import { canonicalizeStrict } from "./canonical.js";
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

const PREFIX = "OUTSIDER_SPARKFUN_MAGENTO_GUEST_CART_ADAPTER_V1_";
const PROVIDER = "SPARKFUN_MAGENTO_GUEST_CART";
const COMMAND_SCHEMA = "outsider/sparkfun-magento-guest-cart-command/v1";
const RECEIPT_SCHEMA
  = "outsider/sparkfun-magento-guest-cart-private-source-receipt/v1";
const PRIVATE_STATE_SCHEMA
  = "outsider/sparkfun-magento-private-guest-cart-state/v1";
const ORIGIN = "https://www.sparkfun.com";
const GUEST_CARTS_URL = `${ORIGIN}/rest/V1/guest-carts`;
const CAPABILITIES = new WeakMap();

export const OUTSIDER_SPARKFUN_MAGENTO_GUEST_CART_ADAPTER_V1_BOUNDARY
  = Object.freeze({
    provider: PROVIDER,
    transportFamily: "PROVIDER_OWNED_TRANSACTION_API",
    sourceSpecific: true,
    arbitraryUrlAccepted: false,
    injectedHttpsClosureRequired: true,
    injectedPrivateCartStateCapabilityRequired: true,
    supportedOperations: Object.freeze(["QUOTE", "HOLD", "STATUS", "CANCEL"]),
    cartLifecycleState: "CART_READY_HOLD",
    cartNextGate: "NEEDS_ADDRESS_AND_PAYMENT",
    checkoutEnabledByDefault: false,
    checkoutImplemented: false,
    addressInputAccepted: false,
    paymentInputAccepted: false,
    orderSubmissionImplemented: false,
    rawMaskedCartIdProjected: false,
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

function sku(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, "SKU_INVALID");
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

function catalogPath(value) {
  if (typeof value !== "string"
    || !/^\/[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?\.html$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, "CATALOG_PATH_INVALID");
  }
  return value;
}

function json(exchange, code) {
  const contentType = exchange.headers.contentType;
  if (typeof contentType !== "string"
    || !/^application\/json(?:\s*;|\s*$)/iu.test(contentType)) {
    sourceSpecificCartFailV1(PREFIX, `${code}_CONTENT_TYPE_INVALID`);
  }
  try { return JSON.parse(exchange.bodyBytes.toString("utf8")); }
  catch { sourceSpecificCartFailV1(PREFIX, `${code}_JSON_INVALID`); }
}

function html(exchange) {
  if (typeof exchange.headers.contentType !== "string"
    || !/^text\/html(?:\s*;|\s*$)/iu.test(exchange.headers.contentType)) {
    sourceSpecificCartFailV1(PREFIX, "CATALOG_CONTENT_TYPE_INVALID");
  }
  return exchange.bodyBytes.toString("utf8");
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
    if (String(candidate?.id) === expectedProductId) {
      item = candidate;
      break;
    }
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
  const contextBound = context?.productId === Number(expectedProductId)
    && context?.sku === expectedSku;
  if (typeof name !== "string" || name.trim() === ""
    || currency !== "USD" || !Number.isFinite(price) || price <= 0
    || !contextBound) {
    sourceSpecificCartFailV1(PREFIX, "CATALOG_PRODUCT_INVALID");
  }
  return Object.freeze({ productId: expectedProductId, sku: expectedSku,
    name: name.trim(), currency, unitPrice: price, inStock,
    sourceUpdatedAt: typeof context.updatedAt === "string"
      ? context.updatedAt : null });
}

function cartId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16,128}$/u.test(value)) {
    sourceSpecificCartFailV1(PREFIX, "MASKED_CART_ID_INVALID");
  }
  return value;
}

function cartItemId(value) {
  if (!Number.isSafeInteger(value) || value < 1) {
    sourceSpecificCartFailV1(PREFIX, "CART_ITEM_ID_INVALID");
  }
  return value;
}

function parseCart(value, state) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !Array.isArray(value.items)
    || !Number.isSafeInteger(value.items_count)
    || !Number.isFinite(Number(value.items_qty))) {
    sourceSpecificCartFailV1(PREFIX, "CART_SOURCE_INVALID");
  }
  const matching = value.items.filter((item) => item?.sku === state.sku);
  const exactItem = value.items.length === 1 && matching.length === 1
    && Number(matching[0].qty) === state.quantity
    && Number.isFinite(Number(matching[0].price))
    && value.items_count === 1 && Number(value.items_qty) === state.quantity;
  return Object.freeze({
    active: value.is_active === true,
    empty: value.items_count === 0 && Number(value.items_qty) === 0
      && value.items.length === 0,
    exactItem,
    itemCount: value.items_count,
    itemsQuantity: Number(value.items_qty),
    unitPrice: exactItem ? Number(matching[0].price) : null,
  });
}

function parseTotals(value, state, expectEmpty = false) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || !Number.isFinite(Number(value.subtotal))
    || !Number.isFinite(Number(value.grand_total))
    || !Number.isFinite(Number(value.items_qty))
    || value.quote_currency_code !== "USD") {
    sourceSpecificCartFailV1(PREFIX, "TOTALS_SOURCE_INVALID");
  }
  const expectedQuantity = expectEmpty ? 0 : state.quantity;
  if (Number(value.items_qty) !== expectedQuantity) {
    sourceSpecificCartFailV1(PREFIX, "TOTALS_QUANTITY_MISMATCH");
  }
  return Object.freeze({ currency: value.quote_currency_code,
    subtotal: Number(value.subtotal), grandTotalBeforeAddress:
      Number(value.grand_total), shippingAmountBeforeAddress:
      Number(value.shipping_amount ?? 0), taxAmountBeforeAddress:
      Number(value.tax_amount ?? 0), itemsQuantity: Number(value.items_qty),
    addressApplied: false, shippingQuoteFinal: false, taxQuoteFinal: false });
}

function privateStateKey(state, request) {
  return sourceSpecificCartDigestV1(
    "outsider/sparkfun-order-scoped-private-cart/v1", {
      accountRefHash: state.accountRefHash,
      transactionRefHash: request.transactionRefHash,
      productId: state.productId,
      sku: state.sku,
      quantity: state.quantity,
    });
}

function normalizePrivateState(value, state, sessionRefHash) {
  if (value === null) return null;
  exactSourceSpecificCartObjectV1(value, [
    "schema", "schemaVersion", "provider", "sessionRefHash", "productId",
    "sku", "quantity", "maskedCartId", "itemId",
  ], PREFIX, "PRIVATE_CART_STATE");
  if (value.schema !== PRIVATE_STATE_SCHEMA || value.schemaVersion !== "1.0.0"
    || value.provider !== PROVIDER || value.sessionRefHash !== sessionRefHash
    || value.productId !== state.productId || value.sku !== state.sku
    || value.quantity !== state.quantity
    || (value.itemId !== null && (!Number.isSafeInteger(value.itemId)
      || value.itemId < 1))) {
    sourceSpecificCartFailV1(PREFIX, "PRIVATE_CART_STATE_BINDING_INVALID");
  }
  cartId(value.maskedCartId);
  return { ...value };
}

async function loadPrivateState(state, request) {
  const key = privateStateKey(state, request);
  let value;
  try { value = await state.loadPrivateCartStateImpl(key); }
  catch { sourceSpecificCartFailV1(PREFIX, "PRIVATE_CART_STATE_LOAD_FAILED"); }
  return { key, value: normalizePrivateState(value, state, key) };
}

async function storePrivateState(state, key, value) {
  const exact = Object.freeze({
    schema: PRIVATE_STATE_SCHEMA,
    schemaVersion: "1.0.0",
    provider: PROVIDER,
    sessionRefHash: key,
    productId: state.productId,
    sku: state.sku,
    quantity: state.quantity,
    maskedCartId: cartId(value.maskedCartId),
    itemId: value.itemId === null ? null : cartItemId(value.itemId),
  });
  try { await state.storePrivateCartStateImpl(key, exact); }
  catch { sourceSpecificCartFailV1(PREFIX, "PRIVATE_CART_STATE_STORE_FAILED"); }
  return exact;
}

async function clearPrivateState(state, key) {
  try { await state.clearPrivateCartStateImpl(key); }
  catch { sourceSpecificCartFailV1(PREFIX, "PRIVATE_CART_STATE_CLEAR_FAILED"); }
}

function requestInput(state, request, fields) {
  return {
    provider: PROVIDER,
    sessionRefHash: privateStateKey(state, request),
    operation: request.operation,
    ...fields,
  };
}

async function exchange(state, request, fields) {
  return invokeSourceSpecificHttpsV1(state.requestExact,
    requestInput(state, request, fields), PREFIX);
}

function sourceResponse(state, request, input) {
  return createSourceSpecificCartDriverResponseV1({
    sourceBytes: createSourceSpecificCartReceiptBytesV1({
      schema: RECEIPT_SCHEMA,
      provider: PROVIDER,
      operation: request.operation,
      request,
      product: Object.freeze({ productId: state.productId, sku: state.sku,
        quantity: state.quantity }),
      lifecycleState: input.lifecycleState,
      nextGate: input.nextGate,
      normalized: input.normalized,
      exchanges: input.exchanges,
    }, PREFIX),
    sourceState: input.sourceState,
    sourceExpiresAt: input.sourceExpiresAt,
    sourceRecordClass: input.sourceRecordClass,
  });
}

function cartUrl(maskedCartId, suffix = "") {
  return `${GUEST_CARTS_URL}/${encodeURIComponent(cartId(maskedCartId))}${suffix}`;
}

async function readCartAndTotals(state, request, maskedCartId, suffix = "") {
  const cartExchange = await exchange(state, request, {
    step: `CART_GET${suffix}`,
    method: "GET",
    url: cartUrl(maskedCartId),
    headers: { accept: "application/json" },
    bodyBytes: null,
    allowedStatuses: [200],
  });
  const totalsExchange = await exchange(state, request, {
    step: `TOTALS_GET${suffix}`,
    method: "GET",
    url: cartUrl(maskedCartId, "/totals"),
    headers: { accept: "application/json" },
    bodyBytes: null,
    allowedStatuses: [200],
  });
  return { cartExchange, totalsExchange,
    cart: parseCart(json(cartExchange, "CART"), state),
    totalsSource: json(totalsExchange, "TOTALS") };
}

async function requestImpl(state, request) {
  validateSourceSpecificCartRequestV1(request, {
    schema: COMMAND_SCHEMA,
    provider: PROVIDER,
    productId: state.sku,
    quantity: state.quantity,
  }, PREFIX);

  if (request.operation === "QUOTE") {
    const observed = await exchange(state, request, {
      step: "CATALOG_GET", method: "GET",
      url: `${ORIGIN}${state.catalogPath}`,
      headers: { accept: "text/html" }, bodyBytes: null,
      allowedStatuses: [200],
    });
    const catalog = parseCatalog(html(observed), state.productId, state.sku);
    return sourceResponse(state, request, {
      lifecycleState: catalog.inStock
        ? "CATALOG_QUOTE_AVAILABLE_HOLD" : "CATALOG_UNAVAILABLE_HOLD",
      nextGate: catalog.inStock ? "CREATE_ISOLATED_CART" : "UNAVAILABLE",
      normalized: { productId: state.productId, sku: state.sku,
        name: catalog.name, currency: catalog.currency,
        unitPrice: catalog.unitPrice, quantity: state.quantity,
        inStock: catalog.inStock, sourceUpdatedAt: catalog.sourceUpdatedAt },
      exchanges: [observed],
      sourceState: catalog.inStock ? "QUOTE_AVAILABLE" : "REJECTED",
      sourceExpiresAt: catalog.inStock ? request.expiresAt : null,
      sourceRecordClass: "PUBLISHED_INVENTORY",
    });
  }

  if (request.operation === "HOLD") {
    const loaded = await loadPrivateState(state, request);
    let privateCart = loaded.value;
    const exchanges = [];
    if (privateCart === null) {
      const created = await exchange(state, request, {
        step: "GUEST_CART_CREATE_POST", method: "POST", url: GUEST_CARTS_URL,
        headers: { accept: "application/json", "content-type": "application/json" },
        bodyBytes: Buffer.from("{}", "utf8"), allowedStatuses: [200],
      });
      privateCart = await storePrivateState(state, loaded.key, {
        maskedCartId: cartId(json(created, "GUEST_CART_CREATE")), itemId: null,
      });
      exchanges.push(created);
    }
    if (privateCart.itemId === null) {
      const added = await exchange(state, request, {
        step: "CART_ITEM_ADD_POST", method: "POST",
        url: cartUrl(privateCart.maskedCartId, "/items"),
        headers: { accept: "application/json", "content-type": "application/json" },
        bodyBytes: Buffer.from(canonicalizeStrict({ cartItem: {
          qty: state.quantity, sku: state.sku,
        } }), "utf8"), allowedStatuses: [200],
      });
      const item = json(added, "CART_ITEM_ADD");
      if (item?.sku !== state.sku || Number(item.qty) !== state.quantity) {
        sourceSpecificCartFailV1(PREFIX, "ADDED_ITEM_BINDING_INVALID");
      }
      privateCart = await storePrivateState(state, loaded.key, {
        maskedCartId: privateCart.maskedCartId,
        itemId: cartItemId(item.item_id),
      });
      exchanges.push(added);
    }
    const observed = await readCartAndTotals(state, request,
      privateCart.maskedCartId, "_AFTER_ADD");
    exchanges.push(observed.cartExchange, observed.totalsExchange);
    if (!observed.cart.active || !observed.cart.exactItem) {
      sourceSpecificCartFailV1(PREFIX, "EXACT_CART_ITEM_NOT_OBSERVED");
    }
    const totals = parseTotals(observed.totalsSource, state);
    return sourceResponse(state, request, {
      lifecycleState: "CART_READY_HOLD",
      nextGate: "NEEDS_ADDRESS_AND_PAYMENT",
      normalized: { productId: state.productId, sku: state.sku,
        quantity: state.quantity, itemCount: observed.cart.itemCount,
        unitPrice: observed.cart.unitPrice, ...totals },
      exchanges,
      sourceState: "CART_READY",
      sourceExpiresAt: request.expiresAt,
      sourceRecordClass: "CHECKOUT_RECEIPT",
    });
  }

  const loaded = await loadPrivateState(state, request);
  if (loaded.value === null) {
    return sourceResponse(state, request, {
      lifecycleState: "CART_NOT_READY_HOLD",
      nextGate: "UNAVAILABLE",
      normalized: { productId: state.productId, sku: state.sku,
        quantity: state.quantity, privateCartPresent: false },
      exchanges: [], sourceState: "REJECTED", sourceExpiresAt: null,
      sourceRecordClass: request.operation === "STATUS"
        ? "STATUS_RECEIPT" : "CANCELLATION_RECEIPT",
    });
  }
  const privateCart = loaded.value;
  if (request.operation === "STATUS") {
    const observed = await readCartAndTotals(state, request,
      privateCart.maskedCartId);
    const ready = observed.cart.active && observed.cart.exactItem;
    const totals = parseTotals(observed.totalsSource, state, !ready);
    return sourceResponse(state, request, {
      lifecycleState: ready ? "CART_READY_HOLD" : "CART_NOT_READY_HOLD",
      nextGate: ready ? "NEEDS_ADDRESS_AND_PAYMENT" : "UNAVAILABLE",
      normalized: { productId: state.productId, sku: state.sku,
        quantity: state.quantity, itemCount: observed.cart.itemCount,
        exactItemPresent: ready, ...totals },
      exchanges: [observed.cartExchange, observed.totalsExchange],
      sourceState: ready ? "CART_READY" : "REJECTED",
      sourceExpiresAt: ready ? request.expiresAt : null,
      sourceRecordClass: "STATUS_RECEIPT",
    });
  }

  const before = await readCartAndTotals(state, request,
    privateCart.maskedCartId, "_BEFORE_EMPTY");
  const exchanges = [before.cartExchange, before.totalsExchange];
  if (!before.cart.empty) {
    if (!before.cart.exactItem || privateCart.itemId === null) {
      sourceSpecificCartFailV1(PREFIX, "ORDER_SCOPED_CART_NOT_ISOLATED");
    }
    const removed = await exchange(state, request, {
      step: "CART_ITEM_DELETE", method: "DELETE",
      url: cartUrl(privateCart.maskedCartId, `/items/${privateCart.itemId}`),
      headers: { accept: "application/json" }, bodyBytes: null,
      allowedStatuses: [200],
    });
    if (json(removed, "CART_ITEM_DELETE") !== true) {
      sourceSpecificCartFailV1(PREFIX, "CART_ITEM_DELETE_NOT_ACKNOWLEDGED");
    }
    exchanges.push(removed);
  }
  const after = await readCartAndTotals(state, request,
    privateCart.maskedCartId, "_AFTER_EMPTY");
  exchanges.push(after.cartExchange, after.totalsExchange);
  if (!after.cart.empty) sourceSpecificCartFailV1(PREFIX, "CART_EMPTY_NOT_OBSERVED");
  parseTotals(after.totalsSource, state, true);
  await clearPrivateState(state, loaded.key);
  return sourceResponse(state, request, {
    lifecycleState: "CART_EMPTY_HOLD",
    nextGate: "NONE",
    normalized: { productId: state.productId, sku: state.sku,
      quantity: state.quantity, itemCount: 0, exactItemPresent: false },
    exchanges,
    sourceState: "CANCELLATION_ACKNOWLEDGED",
    sourceExpiresAt: null,
    sourceRecordClass: "CANCELLATION_RECEIPT",
  });
}

export function createSparkFunMagentoGuestCartCommandBytesV1(input = {}) {
  exactSourceSpecificCartObjectV1(input, ["sku", "quantity"], PREFIX,
    "COMMAND_INPUT");
  return createSourceSpecificCartCommandBytesV1(COMMAND_SCHEMA, PROVIDER,
    sku(input.sku), quantity(input.quantity));
}

export function issueSparkFunMagentoGuestCartBuyerNativeCapabilityV1(input = {},
  dependencies = {}) {
  exactSourceSpecificCartObjectV1(input, [
    "capabilityRefHash", "accountRefHash", "nodeRefHash", "issuedAt",
    "expiresAt", "catalogPath", "productId", "sku", "quantity",
  ], PREFIX, "CAPABILITY_INPUT");
  const dependencyKeys = Reflect.ownKeys(dependencies);
  if (dependencies === null || typeof dependencies !== "object"
    || Array.isArray(dependencies) || Buffer.isBuffer(dependencies)
    || ["httpsRequestImpl", "revalidateImpl", "loadPrivateCartStateImpl",
      "storePrivateCartStateImpl", "clearPrivateCartStateImpl"]
      .some((key) => !Object.hasOwn(dependencies, key))
    || dependencyKeys.some((key) => ![
      "httpsRequestImpl", "revalidateImpl", "loadPrivateCartStateImpl",
      "storePrivateCartStateImpl", "clearPrivateCartStateImpl",
      "sourceOccurrenceSink",
    ].includes(key))) {
    sourceSpecificCartFailV1(PREFIX, "DEPENDENCIES_FIELDS_INVALID");
  }
  if ([dependencies.httpsRequestImpl, dependencies.revalidateImpl,
    dependencies.loadPrivateCartStateImpl,
    dependencies.storePrivateCartStateImpl,
    dependencies.clearPrivateCartStateImpl]
    .some((value) => typeof value !== "function")
    || (dependencies.sourceOccurrenceSink !== undefined
      && dependencies.sourceOccurrenceSink !== null
      && typeof dependencies.sourceOccurrenceSink !== "function")) {
    sourceSpecificCartFailV1(PREFIX, "DEPENDENCIES_INVALID");
  }
  const state = {
    accountRefHash: sourceSpecificCartHashV1(input.accountRefHash, PREFIX,
      "ACCOUNT_REF_HASH"),
    catalogPath: catalogPath(input.catalogPath),
    productId: productId(input.productId),
    sku: sku(input.sku),
    quantity: quantity(input.quantity),
    requestExact: dependencies.httpsRequestImpl,
    loadPrivateCartStateImpl: dependencies.loadPrivateCartStateImpl,
    storePrivateCartStateImpl: dependencies.storePrivateCartStateImpl,
    clearPrivateCartStateImpl: dependencies.clearPrivateCartStateImpl,
  };
  const capability = issueBuyerNativeTransactionAccountCapabilityV1({
    capabilityRefHash: input.capabilityRefHash,
    accountRefHash: input.accountRefHash,
    nodeRefHash: input.nodeRefHash,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    supportedOperations: ["QUOTE", "HOLD", "STATUS", "CANCEL"],
  }, { requestImpl: (request) => requestImpl(state, request),
    revalidateImpl: dependencies.revalidateImpl,
    sourceOccurrenceSink: dependencies.sourceOccurrenceSink ?? null });
  CAPABILITIES.set(capability, Object.freeze({ provider: PROVIDER,
    catalogPath: state.catalogPath, productId: state.productId,
    sku: state.sku, quantity: state.quantity }));
  return capability;
}

export function inspectSparkFunMagentoGuestCartBuyerNativeCapabilityV1(capability) {
  const state = CAPABILITIES.get(capability);
  if (state === undefined) sourceSpecificCartFailV1(PREFIX,
    "CAPABILITY_NOT_FACTORY_ISSUED");
  return Object.freeze({ ...state,
    supportedOperations:
      OUTSIDER_SPARKFUN_MAGENTO_GUEST_CART_ADAPTER_V1_BOUNDARY.supportedOperations,
    cartLifecycleState: "CART_READY_HOLD",
    nextGate: "NEEDS_ADDRESS_AND_PAYMENT",
    checkoutEnabled: false,
    paymentEnabled: false,
    orderSubmissionEnabled: false,
    rawMaskedCartIdProjected: false,
    capacityReserved: false,
    authority: "NONE",
    decisionState: "HOLD" });
}
