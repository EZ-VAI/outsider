import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, realpathSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  OUTSIDER_ADAFRUIT_GUEST_SHOPPER_ADAPTER_V1_BOUNDARY,
  createAdafruitGuestShopperCommandBytesV1,
  inspectAdafruitGuestShopperBuyerNativeCapabilityV1,
  issueAdafruitGuestShopperBuyerNativeCapabilityV1,
} from "../src/outsider-adafruit-guest-shopper-adapter-v1.js";
import {
  OUTSIDER_SPARKFUN_MAGENTO_GUEST_CART_ADAPTER_V1_BOUNDARY,
  createSparkFunMagentoGuestCartCommandBytesV1,
  inspectSparkFunMagentoGuestCartBuyerNativeCapabilityV1,
  issueSparkFunMagentoGuestCartBuyerNativeCapabilityV1,
} from "../src/outsider-sparkfun-magento-guest-cart-adapter-v1.js";

const NOW = "2026-09-04T13:10:00.000Z";
const OPERATION_EXPIRY = "2026-09-04T13:40:00.000Z";
const FORMATION_EXPIRY = "2026-09-04T14:00:00.000Z";
const CAPABILITY_EXPIRY = "2026-09-04T15:00:00.000Z";
const RESPONSE_DATE = "Fri, 04 Sep 2026 13:01:00 GMT";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function privateDirectory(t, label) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
    `outsider-cart-adapter-${label}-`)));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function capabilityInput(label, extra) {
  return {
    capabilityRefHash: h(`${label}:capability`),
    accountRefHash: h(`${label}:account`),
    nodeRefHash: h(`${label}:node`),
    issuedAt: "2026-09-04T13:00:00.000Z",
    expiresAt: CAPABILITY_EXPIRY,
    ...extra,
  };
}

function revalidate(input) {
  return {
    active: true,
    capabilityRefHash: input.capabilityRefHash,
    accountRefHash: input.accountRefHash,
    observedAt: input.observedAt,
    expiresAt: CAPABILITY_EXPIRY,
  };
}

function runtime(t, label, capability) {
  return createBuyerNativeTransactionRouteRuntimeV1({
    journalDirectory: privateDirectory(t, label),
    journalId: `transaction_${createHash("md5").update(label).digest("hex")}`,
    transactionRefHash: h(`${label}:transaction`),
    outcomeIntentRefHash: h(`${label}:outcome`),
    routeRole: label.includes("recovery") ? "RECOVERY" : "PRIMARY",
    formationExpiresAt: FORMATION_EXPIRY,
  }, { capability, clock: () => NOW });
}

function command(label, requestBytes, previous = null) {
  return {
    operationNonce: `operation-${label}-000000000001`,
    requestBytes,
    expiresAt: OPERATION_EXPIRY,
    expectedPreviousOccurrenceHash: previous,
    triggerOccurrenceHash: null,
  };
}

function response(request, body, status = 200, contentType = "text/html") {
  const bodyBytes = Buffer.isBuffer(body) ? Buffer.from(body)
    : Buffer.from(typeof body === "string" ? body : JSON.stringify(body), "utf8");
  return {
    status,
    headers: { "content-type": contentType, date: RESPONSE_DATE,
      ...(status === 302 ? { location: request.url } : {}) },
    bodyBytes,
    finalUrl: request.url,
  };
}

function adafruitCatalog(token) {
  return `<!doctype html><script type="application/ld+json">${JSON.stringify({
    "@context": "http://schema.org", "@type": "Product",
    name: "USB Type A to Type C Cable - approx 1 meter / 3 ft long",
    sku: 4474,
    offers: { "@type": "Offer", availability: "http://schema.org/InStock",
      price: "4.9500", priceCurrency: "USD" },
  })}</script><form action="/added" method="post"><input name="securityToken" value="${token}"></form>`;
}

function adafruitCart(present, token) {
  const row = present
    ? '<div role="row" class="cart-row" data-pid="4474" data-qty="1" data-price="4.95">item</div>'
    : "";
  return `<!doctype html>${row}<form action="/shopping_cart" method="post" data-empty-cart-confirm><input type="hidden" name="securityToken" value="${token}"></form>`;
}

test("Adafruit exact guest cart reaches CART_READY_HOLD, rereads, and empties without checkout",
  async (t) => {
    const productToken = "product-csrf-private-0001";
    const cartToken = "cart-csrf-private-000001";
    let present = false;
    const requests = [];
    const capability = issueAdafruitGuestShopperBuyerNativeCapabilityV1(
      capabilityInput("adafruit", { productId: "4474", quantity: 1 }), {
        revalidateImpl: revalidate,
        async httpsRequestImpl(request) {
          requests.push(request);
          assert.equal(request.url.includes("/checkout"), false);
          if (request.step === "CATALOG_GET") {
            return response(request, adafruitCatalog(productToken));
          }
          if (request.step === "CART_PREFLIGHT_GET"
            || request.step === "CART_AFTER_ADD_GET"
            || request.step === "CART_GET"
            || request.step === "CART_BEFORE_EMPTY_GET"
            || request.step === "CART_AFTER_EMPTY_GET") {
            return response(request, adafruitCart(present, cartToken));
          }
          if (request.step === "ADD_PRODUCT_POST") {
            const form = new URLSearchParams(request.bodyBytes.toString("utf8"));
            assert.equal(form.get("securityToken"), productToken);
            assert.equal(form.get("pid"), "4474");
            assert.equal(form.get("qty"), "1");
            present = true;
            return response(request, Buffer.alloc(0), 302);
          }
          if (request.step === "EMPTY_CART_POST") {
            const form = new URLSearchParams(request.bodyBytes.toString("utf8"));
            assert.equal(form.get("securityToken"), cartToken);
            assert.equal(form.get("action"), "empty_cart");
            present = false;
            return response(request, Buffer.alloc(0), 302);
          }
          throw new Error(`unexpected step ${request.step}`);
        },
      });
    const selected = runtime(t, "adafruit-primary", capability);
    const bytes = createAdafruitGuestShopperCommandBytesV1({
      productId: "4474", quantity: 1,
    });
    const quote = await selected.quote(command("adafruit-quote", bytes));
    const hold = await selected.hold(command("adafruit-hold", bytes,
      quote.publicProjection.sourceOccurrenceHash));
    const status = await selected.status(command("adafruit-status", bytes,
      hold.publicProjection.sourceOccurrenceHash));
    const cancel = await selected.cancel(command("adafruit-cancel", bytes,
      status.publicProjection.sourceOccurrenceHash));

    assert.equal(quote.publicProjection.sourceState, "QUOTE_AVAILABLE");
    assert.equal(hold.publicProjection.sourceState, "CART_READY");
    assert.equal(hold.publicProjection.runtimeState, "PRIMARY_CART_READY");
    assert.equal(status.publicProjection.sourceState, "CART_READY");
    assert.equal(status.publicProjection.runtimeState, "PRIMARY_CART_READY");
    assert.equal(cancel.publicProjection.runtimeState,
      "PRIMARY_SOURCE_DECLARED_CANCELLED");
    assert.equal(hold.publicProjection.capacityReserved, false);
    assert.equal(hold.publicProjection.checkoutReceiptEstablishesCapacity,
      false);
    assert.equal(hold.publicProjection.paymentPerformed, false);
    assert.equal(hold.publicProjection.userResultCommitted, false);
    const exact = JSON.parse(claimBuyerNativeTransactionSourceOccurrenceV1(hold)
      .sourceBytes.toString("utf8"));
    assert.equal(exact.lifecycleState, "CART_READY_HOLD");
    assert.equal(exact.nextGate, "NEEDS_ADDRESS_AND_PAYMENT");
    assert.equal(exact.orderSubmitted, false);
    assert.equal(JSON.stringify(hold).includes(productToken), false);
    assert.equal(JSON.stringify(hold).includes(cartToken), false);
    assert.equal(new Set(requests.map((item) => item.sessionRefHash)).size, 1);
    assert.deepEqual(requests.map((item) => item.step), [
      "CATALOG_GET", "CATALOG_GET", "CART_PREFLIGHT_GET",
      "ADD_PRODUCT_POST", "CART_AFTER_ADD_GET", "CART_GET",
      "CART_BEFORE_EMPTY_GET", "EMPTY_CART_POST", "CART_AFTER_EMPTY_GET",
    ]);
    const inspected = inspectAdafruitGuestShopperBuyerNativeCapabilityV1(
      capability);
    assert.equal(inspected.checkoutEnabled, false);
    assert.equal(inspected.orderSubmissionEnabled, false);
    assert.equal(inspected.rawCookieProjected, false);
    assert.deepEqual(inspected.supportedOperations,
      ["QUOTE", "HOLD", "STATUS", "CANCEL"]);
  });

function sparkfunCatalog() {
  const provider = { "*": { "Magento_Catalog/js/product/view/provider": {
    data: { items: { "4636": {
      id: 4636, name: "USB 3.1 Cable A to C - 3 Foot",
      price_info: { final_price: 7.95 }, currency_code: "USD",
      is_salable: "1", is_available: true,
    } } },
  } } };
  const context = { productId: 4636, sku: "CAB-14743",
    updatedAt: "2025-05-08 18:25:57" };
  return `<!doctype html><script type="text/x-magento-init">${JSON.stringify(provider)}</script><script>magentoStorefrontEvents.context.setProduct(${JSON.stringify(context)})</script>`;
}

function sparkfunCart(present) {
  return {
    id: 2316323, is_active: true,
    items: present ? [{ item_id: 2124971, sku: "CAB-14743", qty: 1,
      name: "USB 3.1 Cable A to C - 3 Foot", price: 7.95,
      product_type: "simple", quote_id: "2316323" }] : [],
    items_count: present ? 1 : 0,
    items_qty: present ? 1 : 0,
  };
}

function sparkfunTotals(present) {
  return { grand_total: present ? 7.95 : 0,
    base_grand_total: present ? 7.95 : 0,
    subtotal: present ? 7.95 : 0, shipping_amount: 0, tax_amount: 0,
    items_qty: present ? 1 : 0, base_currency_code: "USD",
    quote_currency_code: "USD" };
}

test("SparkFun guest REST cart persists masked id privately, reports CART_READY_HOLD, and deletes exact item",
  async (t) => {
    const maskedCartId = "maskedCartSecret1234567890";
    const privateState = new Map();
    let itemPresent = false;
    let createCalls = 0;
    const requests = [];
    const capability = issueSparkFunMagentoGuestCartBuyerNativeCapabilityV1(
      capabilityInput("sparkfun", {
        catalogPath: "/usb-3-1-cable-a-to-c-3-foot.html",
        productId: "4636", sku: "CAB-14743", quantity: 1,
      }), {
        revalidateImpl: revalidate,
        async loadPrivateCartStateImpl(key) {
          return privateState.has(key) ? structuredClone(privateState.get(key)) : null;
        },
        async storePrivateCartStateImpl(key, value) {
          privateState.set(key, structuredClone(value));
        },
        async clearPrivateCartStateImpl(key) { privateState.delete(key); },
        async httpsRequestImpl(request) {
          requests.push(request);
          assert.equal(/checkout|payment|shipping-information|orders/iu
            .test(request.url), false);
          if (request.step === "CATALOG_GET") {
            return response(request, sparkfunCatalog());
          }
          if (request.step === "GUEST_CART_CREATE_POST") {
            createCalls += 1;
            return response(request, JSON.stringify(maskedCartId), 200,
              "application/json; charset=utf-8");
          }
          if (request.step === "CART_ITEM_ADD_POST") {
            const body = JSON.parse(request.bodyBytes.toString("utf8"));
            assert.deepEqual(body, { cartItem: { qty: 1, sku: "CAB-14743" } });
            itemPresent = true;
            return response(request, { item_id: 2124971, sku: "CAB-14743",
              qty: 1, name: "USB 3.1 Cable A to C - 3 Foot", price: 7.95,
              product_type: "simple", quote_id: "2316323" }, 200,
            "application/json; charset=utf-8");
          }
          if (request.step.startsWith("CART_GET")) {
            return response(request, sparkfunCart(itemPresent), 200,
              "application/json; charset=utf-8");
          }
          if (request.step.startsWith("TOTALS_GET")) {
            return response(request, sparkfunTotals(itemPresent), 200,
              "application/json; charset=utf-8");
          }
          if (request.step === "CART_ITEM_DELETE") {
            assert.equal(request.url.endsWith("/items/2124971"), true);
            itemPresent = false;
            return response(request, true, 200,
              "application/json; charset=utf-8");
          }
          throw new Error(`unexpected step ${request.step}`);
        },
      });
    const selected = runtime(t, "sparkfun-recovery", capability);
    const bytes = createSparkFunMagentoGuestCartCommandBytesV1({
      sku: "CAB-14743", quantity: 1,
    });
    const quote = await selected.quote(command("sparkfun-quote", bytes));
    const hold = await selected.hold(command("sparkfun-hold", bytes,
      quote.publicProjection.sourceOccurrenceHash));
    const status = await selected.status(command("sparkfun-status", bytes,
      hold.publicProjection.sourceOccurrenceHash));
    const cancel = await selected.cancel(command("sparkfun-cancel", bytes,
      status.publicProjection.sourceOccurrenceHash));

    assert.equal(createCalls, 1);
    assert.equal(hold.publicProjection.sourceState, "CART_READY");
    assert.equal(hold.publicProjection.runtimeState, "RECOVERY_CART_READY");
    assert.equal(status.publicProjection.sourceState, "CART_READY");
    assert.equal(status.publicProjection.runtimeState, "RECOVERY_CART_READY");
    assert.equal(cancel.publicProjection.runtimeState,
      "RECOVERY_SOURCE_DECLARED_CANCELLED");
    assert.equal(hold.publicProjection.capacityReserved, false);
    assert.equal(hold.publicProjection.paymentPerformed, false);
    assert.equal(hold.publicProjection.userResultCommitted, false);
    assert.equal(privateState.size, 0);
    assert.equal(JSON.stringify(hold).includes(maskedCartId), false);
    const source = claimBuyerNativeTransactionSourceOccurrenceV1(status)
      .sourceBytes.toString("utf8");
    const exact = JSON.parse(source);
    assert.equal(exact.lifecycleState, "CART_READY_HOLD");
    assert.equal(exact.nextGate, "NEEDS_ADDRESS_AND_PAYMENT");
    assert.equal(exact.normalized.shippingQuoteFinal, false);
    assert.equal(exact.normalized.taxQuoteFinal, false);
    assert.equal(source.includes(maskedCartId), true,
      "masked id exists only in the claimable private source receipt");
    const inspected = inspectSparkFunMagentoGuestCartBuyerNativeCapabilityV1(
      capability);
    assert.equal(inspected.checkoutEnabled, false);
    assert.equal(inspected.rawMaskedCartIdProjected, false);
    assert.equal(inspected.capacityReserved, false);
    assert.equal(requests.every((item) => item.redirectPolicy
      === "MANUAL_SAME_ORIGIN_ONLY"), true);
  });

test("both source-specific capabilities reject reserve/commit and expose no order path",
  async (t) => {
    assert.equal(OUTSIDER_ADAFRUIT_GUEST_SHOPPER_ADAPTER_V1_BOUNDARY
      .orderSubmissionImplemented, false);
    assert.equal(OUTSIDER_SPARKFUN_MAGENTO_GUEST_CART_ADAPTER_V1_BOUNDARY
      .checkoutEnabledByDefault, false);
    const capability = issueAdafruitGuestShopperBuyerNativeCapabilityV1(
      capabilityInput("disabled", { productId: "4474", quantity: 1 }), {
        revalidateImpl: revalidate,
        async httpsRequestImpl() { throw new Error("must not run"); },
      });
    const selected = runtime(t, "disabled-primary", capability);
    const bytes = createAdafruitGuestShopperCommandBytesV1({
      productId: "4474", quantity: 1,
    });
    await assert.rejects(selected.reserve(command("disabled-reserve", bytes)),
      /OPERATION_NOT_SUPPORTED_BY_CAPABILITY/u);
    await assert.rejects(selected.commit(command("disabled-commit", bytes)),
      /OPERATION_NOT_SUPPORTED_BY_CAPABILITY/u);
    await assert.rejects(selected.recover({ ...command("disabled-recover", bytes),
      triggerOccurrenceHash: h("failure") }),
    /OPERATION_NOT_SUPPORTED_BY_CAPABILITY/u);
  });
