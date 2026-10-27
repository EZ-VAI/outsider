import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { runSparkFunFullAddressPrepaymentLiveV1 }
  from "../scripts/outsider-sparkfun-full-address-prepayment-live-runner-v1.mjs";

const NOW = "2026-09-04T17:00:00.000Z";
const MASKED_CART_ID = "maskedSparkFunLiveRunnerCart001";
const PRIVATE_STREET = "900 Fictional Machine Lane";
const PRIVATE_EMAIL = "runner-fixture@example.invalid";
const PRIVATE_PHONE = "+1 555 010 9090";

function privateRoot(t) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-sparkfun-live-runner-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function requestInput() {
  return {
    schema: "outsider/private-sparkfun-full-address-prepayment-run-request/v1",
    schemaVersion: "1.0.0",
    product: {
      catalogPath: "/usb-3-1-cable-a-to-c-3-foot.html",
      productId: "4636",
      sku: "CAB-14743",
      quantity: 1,
    },
    destination: {
      firstName: "Machine",
      lastName: "Recipient",
      email: PRIVATE_EMAIL,
      telephone: PRIVATE_PHONE,
      countryCode: "US",
      regionId: 25,
      region: "Massachusetts",
      regionCode: "MA",
      city: "Exampleville",
      postalCode: "02139",
      streetLines: [PRIVATE_STREET, "Fixture Suite"],
    },
    budget: { currency: "USD", maximumAmountMinor: "2000" },
    completionDeadline: "2026-09-10T23:59:59.999Z",
    formationExpiresAt: "2026-09-04T17:30:00.000Z",
    paymentAuthorized: false,
    orderAuthorized: false,
  };
}

function writePrivateInput(root, mode = 0o600) {
  const file = path.join(root, "private-request.json");
  writeFileSync(file, `${canonicalizeStrict(requestInput())}\n`, { mode });
  chmodSync(file, mode);
  return file;
}

function catalogHtml() {
  const provider = { "*": {
    "Magento_Catalog/js/product/view/provider": { data: { items: {
      "4636": { id: 4636,
        name: "USB 3.1 Cable A to C - 3 Foot",
        price_info: { final_price: 7.95 }, currency_code: "USD",
        is_salable: "1", is_available: true },
    } } },
  } };
  const context = { productId: 4636, sku: "CAB-14743",
    updatedAt: "2025-05-08 18:25:57" };
  return `<!doctype html><script type="text/x-magento-init">${JSON.stringify(provider)}</script><script>magentoStorefrontEvents.context.setProduct(${JSON.stringify(context)})</script>`;
}

function cart() {
  return {
    id: 2316323,
    is_active: true,
    items: [{ item_id: 2124971, sku: "CAB-14743", qty: 1,
      name: "USB 3.1 Cable A to C - 3 Foot", price: 7.95,
      product_type: "simple", quote_id: "2316323" }],
    items_count: 1,
    items_qty: 1,
  };
}

function shippingRates() {
  return [{ carrier_code: "ups", method_code: "03",
    carrier_title: "UPS", method_title: "Ground",
    amount: 11.19, base_amount: 11.19, available: true,
    error_message: "", price_excl_tax: 11.19, price_incl_tax: 11.19 },
  { carrier_code: "ups", method_code: "02",
    carrier_title: "UPS", method_title: "Second Day Air",
    amount: 28.79, base_amount: 28.79, available: true,
    error_message: "", price_excl_tax: 28.79, price_incl_tax: 28.79 }];
}

function cartTotals(shippingApplied) {
  return {
    grand_total: shippingApplied ? 19.83 : 7.95,
    base_grand_total: shippingApplied ? 19.83 : 7.95,
    subtotal: 7.95,
    shipping_amount: shippingApplied ? 11.19 : 0,
    tax_amount: shippingApplied ? 0.69 : 0,
    items_qty: 1,
    base_currency_code: "USD",
    quote_currency_code: "USD",
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), { status: 200,
    headers: { "content-type": "application/json; charset=utf-8",
      date: "Fri, 04 Sep 2026 17:00:00 GMT" } });
}

function fakeSparkFun(requests) {
  let cartCreated = false;
  let itemPresent = false;
  let shippingApplied = false;
  return async (url, init) => {
    const parsed = new URL(url);
    requests.push({ url, method: init.method,
      body: init.body === undefined ? null
        : Buffer.from(init.body).toString("utf8") });
    assert.equal(parsed.hostname, "www.sparkfun.com");
    if (parsed.pathname === "/usb-3-1-cable-a-to-c-3-foot.html"
      && init.method === "GET") {
      return new Response(catalogHtml(), { status: 200,
        headers: { "content-type": "text/html; charset=utf-8",
          date: "Fri, 04 Sep 2026 17:00:00 GMT" } });
    }
    if (parsed.pathname === "/rest/V1/guest-carts" && init.method === "POST") {
      cartCreated = true;
      return jsonResponse(MASKED_CART_ID);
    }
    assert.equal(cartCreated, true);
    if (parsed.pathname.endsWith("/items") && init.method === "POST") {
      itemPresent = true;
      return jsonResponse({ item_id: 2124971, sku: "CAB-14743", qty: 1,
        name: "USB 3.1 Cable A to C - 3 Foot", price: 7.95,
        product_type: "simple", quote_id: "2316323" });
    }
    assert.equal(itemPresent, true);
    if (parsed.pathname.endsWith("/estimate-shipping-methods")
      && init.method === "POST") {
      const address = JSON.parse(Buffer.from(init.body).toString("utf8"))
        .address;
      assert.deepEqual(address.street, [PRIVATE_STREET, "Fixture Suite"]);
      assert.equal(address.email, PRIVATE_EMAIL);
      assert.equal(address.telephone, PRIVATE_PHONE);
      return jsonResponse(shippingRates());
    }
    if (parsed.pathname.endsWith("/shipping-information")
      && init.method === "POST") {
      const information = JSON.parse(Buffer.from(init.body).toString("utf8"))
        .addressInformation;
      assert.equal(information.shipping_carrier_code, "ups");
      assert.equal(information.shipping_method_code, "03");
      assert.deepEqual(information.shipping_address,
        information.billing_address);
      shippingApplied = true;
      return jsonResponse({ payment_methods: [
        { code: "braintree", title: "Credit Card" },
      ], totals: cartTotals(true) });
    }
    if (parsed.pathname.endsWith("/totals") && init.method === "GET") {
      return jsonResponse(cartTotals(shippingApplied));
    }
    if (/\/rest\/V1\/guest-carts\/[^/]+$/u.test(parsed.pathname)
      && init.method === "GET") return jsonResponse(cart());
    throw new Error(`unexpected request ${init.method} ${parsed.pathname}`);
  };
}

function privateTree(root) {
  const files = [];
  const visit = (directory) => {
    const info = lstatSync(directory);
    assert.equal(info.isDirectory(), true);
    assert.equal(info.isSymbolicLink(), false);
    assert.equal((info.mode & 0o077), 0);
    for (const name of readdirSync(directory)) {
      const child = path.join(directory, name);
      const childInfo = lstatSync(child);
      if (childInfo.isDirectory()) visit(child);
      else {
        assert.equal(childInfo.isFile(), true);
        assert.equal(childInfo.isSymbolicLink(), false);
        assert.equal((childInfo.mode & 0o077), 0);
        files.push(child);
      }
    }
  };
  visit(root);
  return files;
}

test("live runner executes the complete SparkFun machine prepayment path from one 0600 private input",
  async (t) => {
    const root = privateRoot(t);
    const inputFile = writePrivateInput(root);
    const requests = [];
    const result = await runSparkFunFullAddressPrepaymentLiveV1({
      inputFile,
      privateRoot: root,
      observedAt: NOW,
      nonce: "0123456789abcdef0123456789abcdef",
      fetchImpl: fakeSparkFun(requests),
    });
    assert.equal(result.projection.runState,
      "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN_HOLD");
    assert.equal(result.projection.readyForPaymentAuthorization, true);
    assert.equal(result.projection.finalTotalMinor, "1983");
    assert.equal(result.projection.budgetSatisfied, true);
    assert.deepEqual(result.projection.selectedShippingMethod, {
      carrierCode: "ups", methodCode: "03",
      sourceQuotedAmountMinor: "1119",
    });
    assert.equal(result.projection.stages.length, 4);
    assert.deepEqual(result.projection.stages.map((stage) => stage.stageId), [
      "01_CATALOG_QUOTE", "02_ISOLATED_GUEST_CART",
      "03_FULL_ADDRESS_SHIPPING_METHODS",
      "04_APPLY_SHIPPING_AND_RECOMPUTE",
    ]);
    assert.equal(result.projection.counters.liveHttpRequestCount, 12);
    assert.equal(result.projection.counters.getRequestCount, 7);
    assert.equal(result.projection.counters.postRequestCount, 5);
    assert.equal(result.projection.counters.paymentEndpointAttemptCount, 0);
    assert.equal(result.projection.counters.orderEndpointAttemptCount, 0);
    assert.equal(result.projection.counters.modelCallCount, 0);
    assert.equal(result.projection.counters.interactiveBrowserActionCount, 0);
    assert.equal(result.projection.counters.employeeTouchCount, 0);
    assert.equal(result.projection.structuredEtaAvailable, false);
    assert.equal(result.projection.deliveryDeadlineProven, false);
    assert.equal(result.projection.paymentPerformed, false);
    assert.equal(result.projection.orderSubmitted, false);
    assert.equal(result.projection.userResultCommitted, false);
    assert.equal(requests.some((request) =>
      request.url.includes("payment-information")), false);
    assert.equal(requests.some((request) =>
      /\/orders?(?:$|\/)/u.test(new URL(request.url).pathname)), false);

    const persistedPublic = readFileSync(result.publicArtifact.file, "utf8");
    const returnedPublic = JSON.stringify(result.projection);
    for (const secret of [PRIVATE_STREET, PRIVATE_EMAIL, PRIVATE_PHONE,
      "02139", "Exampleville", MASKED_CART_ID]) {
      assert.equal(persistedPublic.includes(secret), false);
      assert.equal(returnedPublic.includes(secret), false);
    }
    assert.equal(result.privateManifest.exactSourceArtifactsRemainPrivate0600,
      true);
    assert.equal(result.privateManifest.artifactInventory.some((entry) =>
      entry.relativePath.endsWith(".source-v2.bin")), true);
    const files = privateTree(result.runDirectory);
    assert.equal(files.length > 10, true);
    assert.equal(statSync(result.publicArtifact.file).mode & 0o077, 0);
    assert.equal(statSync(result.privateManifestArtifact.file).mode & 0o077, 0);
  });

test("runner rejects a non-private input before any provider request",
  async (t) => {
    const root = privateRoot(t);
    const inputFile = writePrivateInput(root, 0o644);
    let calls = 0;
    await assert.rejects(() => runSparkFunFullAddressPrepaymentLiveV1({
      inputFile,
      privateRoot: root,
      observedAt: NOW,
      nonce: "fedcba9876543210fedcba9876543210",
      fetchImpl: async () => { calls += 1; throw new Error("not reached"); },
    }), /INPUT_FILE_NOT_PRIVATE/u);
    assert.equal(calls, 0);
  });
