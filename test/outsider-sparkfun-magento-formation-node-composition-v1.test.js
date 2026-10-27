import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createFormationJobWorkerV1,
  createMemoryFormationJobStoreV1,
} from "../src/outsider-formation-job-worker-v1.js";
import {
  createSparkFunMagentoFormationNodeCompositionV1,
} from "../src/outsider-sparkfun-magento-formation-node-composition-v1.js";

const NOW = "2026-09-04T17:00:00.000Z";
const CLOCK = "2026-09-04T17:05:00.000Z";
const CART_ID = "maskedSparkFunFormationNodeCart001";
const STREET = "700 Private Formation Avenue";
const EMAIL = "formation-node@example.invalid";
const PHONE = "+1 555 010 7000";
const h = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function root(t) {
  const value = mkdtempSync(path.join(tmpdir(), "outsider-sparkfun-node-"));
  chmodSync(value, 0o700);
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function inputFile(directory) {
  const value = {
    schema: "outsider/private-sparkfun-full-address-prepayment-run-request/v1",
    schemaVersion: "1.0.0",
    product: { catalogPath: "/usb-3-1-cable-a-to-c-3-foot.html",
      productId: "4636", sku: "CAB-14743", quantity: 1 },
    destination: { firstName: "Private", lastName: "Recipient", email: EMAIL,
      telephone: PHONE, countryCode: "US", regionId: 25,
      region: "Massachusetts", regionCode: "MA", city: "Exampleville",
      postalCode: "02139", streetLines: [STREET, "Test Suite"] },
    budget: { currency: "USD", maximumAmountMinor: "2000" },
    completionDeadline: "2026-09-10T23:59:59.999Z",
    formationExpiresAt: "2026-09-04T17:30:00.000Z",
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  const file = path.join(directory, "private-input.json");
  writeFileSync(file, `${canonicalizeStrict(value)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

function json(value) {
  return new Response(JSON.stringify(value), { status: 200,
    headers: { "content-type": "application/json", date: NOW } });
}

function fakeSparkFun(requests) {
  let cart = false;
  let item = false;
  let shipping = false;
  const cartBody = () => ({ id: 1, is_active: true,
    items: [{ item_id: 2, sku: "CAB-14743", qty: 1, price: 7.95 }],
    items_count: 1, items_qty: 1 });
  const totals = () => ({ grand_total: shipping ? 19.83 : 7.95,
    base_grand_total: shipping ? 19.83 : 7.95, subtotal: 7.95,
    shipping_amount: shipping ? 11.19 : 0, tax_amount: shipping ? 0.69 : 0,
    items_qty: 1, base_currency_code: "USD", quote_currency_code: "USD" });
  return async (url, init) => {
    const parsed = new URL(url);
    requests.push({ method: init.method, url, body: init.body ?? null });
    assert.equal(parsed.hostname, "www.sparkfun.com");
    if (parsed.pathname.endsWith(".html")) {
      const provider = { "*": { "Magento_Catalog/js/product/view/provider": {
        data: { items: { "4636": { id: 4636, name: "USB Cable",
          price_info: { final_price: 7.95 }, currency_code: "USD",
          is_salable: "1", is_available: true } } } } } };
      const context = { productId: 4636, sku: "CAB-14743", updatedAt: NOW };
      return new Response(`<script type="text/x-magento-init">${JSON.stringify(
        provider)}</script><script>magentoStorefrontEvents.context.setProduct(${JSON.stringify(
        context)})</script>`, { status: 200,
        headers: { "content-type": "text/html", date: NOW } });
    }
    if (parsed.pathname === "/rest/V1/guest-carts") { cart = true; return json(CART_ID); }
    assert.equal(cart, true);
    if (parsed.pathname.endsWith("/items") && init.method === "POST") {
      item = true; return json({ item_id: 2, sku: "CAB-14743", qty: 1,
        price: 7.95 });
    }
    assert.equal(item, true);
    if (parsed.pathname.endsWith("/estimate-shipping-methods")) {
      const address = JSON.parse(Buffer.from(init.body).toString()).address;
      assert.deepEqual(address.street, [STREET, "Test Suite"]);
      return json([{ carrier_code: "ups", method_code: "03",
        carrier_title: "UPS", method_title: "Ground", amount: 11.19,
        base_amount: 11.19, available: true, error_message: "",
        price_excl_tax: 11.19, price_incl_tax: 11.19 }]);
    }
    if (parsed.pathname.endsWith("/shipping-information")) {
      shipping = true;
      return json({ payment_methods: [{ code: "braintree", title: "Card" }],
        totals: totals() });
    }
    if (parsed.pathname.endsWith("/totals")) return json(totals());
    if (/\/guest-carts\/[^/]+$/u.test(parsed.pathname)) return json(cartBody());
    throw new Error(`unexpected ${init.method} ${parsed.pathname}`);
  };
}

function binding(file, directory, fetchImpl) {
  return createSparkFunMagentoFormationNodeCompositionV1({
    orderId: "order:sparkfun-node-0001",
    outcomeProgramHash: h("outcome"),
    graphRefs: { principalEpochHash: h("principal"),
      accountableDeploymentHash: h("deployment"),
      runtimeOrEmbodimentHash: h("runtime"), delegationHash: h("delegation"),
      episodeHash: h("episode"), attemptHash: h("attempt") },
    inputFile: file,
    privateRoot: directory,
    issuedAt: "2026-09-03T23:00:00.000Z",
    expiresAt: "2026-09-04T17:25:00.000Z",
  }, { fetchImpl, clock: () => CLOCK });
}

test("hash-only Formation job executes the complete SparkFun no-payment route once and disk-replays",
  async (t) => {
    const directory = root(t);
    const file = inputFile(directory);
    const requests = [];
    const fetchImpl = fakeSparkFun(requests);
    const composition = binding(file, directory, fetchImpl);
    const worker = createFormationJobWorkerV1({
      store: createMemoryFormationJobStoreV1(),
      executorResolver: composition.executorResolver,
      clock: () => CLOCK,
    });
    const first = await worker.dispatch(composition.job);
    assert.equal(first.receipt.state, "HOLD");
    assert.equal(first.receipt.reasonCode,
      "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN");
    assert.equal(first.receipt.externalEffect, "CONFIRMED");
    assert.equal(first.receipt.sourceOccurrenceHashes.length, 4);
    assert.equal(requests.length, 12);
    assert.equal(readdirSync(directory).some((name) =>
      name.startsWith("sparkfun-full-address-prepayment-20260904-")), true);
    assert.equal(readdirSync(directory).some((name) =>
      name.startsWith("sparkfun-full-address-prepayment-20260903-")), false);
    assert.equal(requests.some((entry) => entry.url.includes("payment-information")), false);
    assert.equal(requests.some((entry) => /\/orders?(?:$|\/)/u.test(
      new URL(entry.url).pathname)), false);

    const replay = await worker.dispatch(composition.job);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.receipt, first.receipt);
    assert.equal(requests.length, 12);

    const restarted = binding(file, directory, fetchImpl);
    assert.equal(restarted.publicProjection.jobKey,
      composition.publicProjection.jobKey);
    const restartedWorker = createFormationJobWorkerV1({
      store: createMemoryFormationJobStoreV1(),
      executorResolver: restarted.executorResolver,
      clock: () => CLOCK,
    });
    const diskReplay = await restartedWorker.dispatch(restarted.job);
    assert.equal(diskReplay.receipt.reasonCode,
      "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN");
    assert.equal(requests.length, 12);
    assert.deepEqual(diskReplay.receipt.sourceOccurrenceHashes,
      first.receipt.sourceOccurrenceHashes);

    const publicText = JSON.stringify({ job: composition.job,
      composition: composition.publicProjection, receipt: first.receipt });
    for (const secret of [STREET, EMAIL, PHONE, "02139", CART_ID]) {
      assert.equal(publicText.includes(secret), false);
    }
    assert.equal(first.receipt.counters.modelCalls, 0);
    assert.equal(first.receipt.counters.browserClicks, 0);
    assert.equal(first.receipt.counters.employeeTouches, 0);
    assert.equal(first.receipt.counters.userBabysitting, 0);
    assert.equal(first.receipt.authorityMinted, false);
    assert.equal(first.receipt.independentOutcomeTruthEstablished, false);
  });
