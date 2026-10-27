import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  createOrderScopedBuyerNativeHttpsTransportV1,
} from "../src/outsider-order-scoped-buyer-native-https-transport-v1.js";
import {
  createAdafruitFullAddressShippingQuoteCommandBytesV2,
  inspectAdafruitFullAddressShippingQuoteCapabilityV2,
  issueAdafruitFullAddressShippingQuoteCapabilityV2,
  issueAdafruitPrivateFullAddressShippingQuoteGrantV2,
} from "../src/outsider-adafruit-full-address-shipping-quote-stage-v2.js";

const NOW = "2026-09-04T22:55:00.000Z";
const EXPIRY = "2026-09-05T02:55:00.000Z";
const DEADLINE = "2026-09-11T03:59:59.999Z";
const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PRIVATE_STREET = "700 Private Outcome Avenue";
const PRIVATE_PHONE = "+1 555 010 0200";
const PRIVATE_POSTAL = "02139";
const h = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function root(t) {
  const value = mkdtempSync(path.join(tmpdir(), "outsider-adafruit-rates-"));
  chmodSync(value, 0o700);
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function addressPage() {
  return `<!doctype html><form action="/checkout" method="post">
    <input type="hidden" name="csrf_token" value="${TOKEN}">
    <input name="ship_name" required>
    <input name="ship_company">
    <input name="ship_address1" required>
    <input name="ship_address2">
    <input name="ship_postcode" required>
    <input name="ship_city" required>
    <select name="ship_country" required><option value="223">United States</option></select>
    <select name="ship_state" required><option value="32">Massachusetts</option></select>
    <input name="ship_phone" required>
    <button name="action" value="save_two">Save and Continue</button>
  </form>`;
}

function ratePage(date = "2026-09-08") {
  return `<!doctype html><form action="/checkout" method="post">
    <input type="hidden" name="csrf_token" value="${TOKEN}">
    <label><input type="radio" name="shipping" value="usps_ground" checked>
      USPS Ground Advantage - delivery ${date} - $6.30</label>
    <label><input type="radio" name="shipping" value="ups_next">
      UPS Next Day Air - delivery 2026-09-07 - $19.00</label>
    <button name="action" value="save_three">Save and Continue</button>
  </form>
  <div class="checkout-sidebar-ot-title">Subtotal</div><div class="checkout-sidebar-ot-text">$4.95</div>
  <div class="checkout-sidebar-ot-title">Shipping</div><div class="checkout-sidebar-ot-text">$6.30</div>
  <div class="checkout-sidebar-ot-title">Tax</div><div class="checkout-sidebar-ot-text">$0.31</div>
  <div class="checkout-sidebar-ot-title">Total</div><div class="checkout-sidebar-ot-text">$11.56</div>`;
}

function response(body, status = 200, headers = {}) {
  return new Response(body, { status,
    headers: { "content-type": "text/html", date: NOW, ...headers } });
}

function command(previous, nonce) {
  return {
    expectedPreviousOccurrenceHash: previous,
    expiresAt: EXPIRY,
    operationNonce: nonce,
    requestBytes: createAdafruitFullAddressShippingQuoteCommandBytesV2({
      productId: "4474", quantity: 1,
    }),
    triggerOccurrenceHash: null,
  };
}

function build(t, fetchImpl) {
  const directory = root(t);
  const destinationGrant
    = issueAdafruitPrivateFullAddressShippingQuoteGrantV2({
      destinationRefHash: h("private-destination"),
      authorizedAt: NOW,
      expiresAt: EXPIRY,
      firstName: "Private",
      lastName: "Recipient",
      telephone: PRIVATE_PHONE,
      countryCode: "US",
      region: "Massachusetts",
      city: "Exampleville",
      postalCode: PRIVATE_POSTAL,
      streetLines: [PRIVATE_STREET],
      providerCountryId: "223",
      providerRegionId: "32",
      completionDeadline: DEADLINE,
    });
  const transport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: path.join(directory, "https"),
    orderRefHash: h("order"),
    allowedOrigins: ["https://www.adafruit.com"],
    timeoutMs: 5_000,
    maximumResponseBytes: 768 * 1024,
  }, { fetchImpl, clock: () => Date.parse(NOW) });
  const capability = issueAdafruitFullAddressShippingQuoteCapabilityV2({
    capabilityRefHash: h("capability"),
    accountRefHash: h("guest-account"),
    nodeRefHash: h("node"),
    issuedAt: NOW,
    expiresAt: EXPIRY,
    productId: "4474",
    quantity: 1,
    contactRefHash: h("contact"),
    destinationGrant,
  }, {
    httpsRequestImpl: transport,
    revalidateImpl: async (entry) => ({
      accountRefHash: entry.accountRefHash,
      active: true,
      capabilityRefHash: entry.capabilityRefHash,
      expiresAt: EXPIRY,
      observedAt: NOW,
    }),
  });
  const runtime = createBuyerNativeTransactionRouteRuntimeV1({
    journalDirectory: directory,
    journalId: "transaction_0123456789abcdef0123456789abcdef",
    outcomeIntentRefHash: h("outcome"),
    routeRole: "RECOVERY",
    transactionRefHash: h("transaction"),
    formationExpiresAt: EXPIRY,
  }, { capability, clock: () => NOW });
  return { capability, destinationGrant, runtime };
}

test("submits the source-observed Adafruit address form and normalizes a destination quote without payment or order",
  async (t) => {
    const calls = [];
    const fake = async (url, init) => {
      const parsed = new URL(url);
      const body = init.body === undefined ? null
        : Buffer.from(init.body).toString("utf8");
      calls.push({ method: init.method, pathname: parsed.pathname, body });
      assert.equal(parsed.origin, "https://www.adafruit.com");
      assert.equal(/payment|place[-_]?order|submit[-_]?order/iu.test(
        parsed.pathname), false);
      if (init.method === "GET" && parsed.pathname === "/checkout") {
        return response(calls.filter((entry) => entry.method === "POST").length
          === 0 ? addressPage() : ratePage());
      }
      if (init.method === "POST" && parsed.pathname === "/checkout") {
        const fields = new URLSearchParams(body);
        assert.equal(fields.get("action"), "save_two");
        assert.equal(fields.get("ship_name"), "Private Recipient");
        assert.equal(fields.get("ship_address1"), PRIVATE_STREET);
        assert.equal(fields.get("ship_postcode"), PRIVATE_POSTAL);
        assert.equal(fields.get("ship_country"), "223");
        assert.equal(fields.get("ship_state"), "32");
        assert.equal(fields.get("ship_phone"), PRIVATE_PHONE);
        return response("", 303, { location: "/checkout?step=3" });
      }
      throw new Error(`unexpected ${init.method} ${parsed.pathname}`);
    };
    const { capability, runtime } = build(t, fake);
    const inspection = inspectAdafruitFullAddressShippingQuoteCapabilityV2(
      capability);
    assert.equal(inspection.fullAddressPubliclyProjected, false);
    assert.equal(inspection.paymentEnabled, false);
    assert.equal(inspection.orderSubmissionEnabled, false);

    const quote = await runtime.quote(command(null,
      "adafruit-address-form-0001"));
    assert.equal(quote.publicProjection.sourceState, "QUOTE_AVAILABLE",
      JSON.stringify(calls));
    const held = await runtime.hold(command(
      quote.publicProjection.sourceOccurrenceHash,
      "adafruit-address-quote-0002"));
    assert.equal(held.publicProjection.sourceState, "HOLD_ACKNOWLEDGED");
    const privateClaim = claimBuyerNativeTransactionSourceOccurrenceV1(held);
    const receipt = JSON.parse(privateClaim.sourceBytes.toString("utf8"));
    assert.equal(receipt.normalized.fullAddressSubmitted, true);
    assert.equal(receipt.normalized.quote.allInTotalMinor, 1156);
    assert.equal(receipt.normalized.quote.allInTotalProven, true);
    assert.equal(receipt.normalized.quote.sourceDeliveryDate, "2026-09-08");
    assert.equal(receipt.normalized.quote.deliveryDeadlineProven, true);
    assert.equal(receipt.normalized.quote.rates.length, 2);
    assert.equal(receipt.capacityReserved, false);
    assert.equal(receipt.paymentPerformed, false);
    assert.equal(receipt.orderSubmitted, false);
    assert.equal(calls.length, 4);
    assert.deepEqual(calls.map(({ method }) => method),
      ["GET", "GET", "POST", "GET"]);
    const projected = JSON.stringify({ inspection,
      quote: quote.publicProjection, held: held.publicProjection });
    for (const secret of [PRIVATE_STREET, PRIVATE_PHONE, PRIVATE_POSTAL]) {
      assert.equal(projected.includes(secret), false);
    }
    assert.equal(receipt.exchanges[1].requestBodyHash.startsWith("sha256:"),
      true);
    assert.equal(JSON.stringify(receipt).includes(PRIVATE_STREET), false);
  });

test("a copied destination grant cannot open the capability and no provider request occurs",
  async (t) => {
    let requests = 0;
    const value = build(t, async () => { requests += 1; });
    const copied = { ...value.destinationGrant };
    assert.throws(() => issueAdafruitFullAddressShippingQuoteCapabilityV2({
      capabilityRefHash: h("other-capability"),
      accountRefHash: h("guest-account"),
      nodeRefHash: h("node"),
      issuedAt: NOW,
      expiresAt: EXPIRY,
      productId: "4474",
      quantity: 1,
      contactRefHash: h("contact"),
      destinationGrant: copied,
    }, {
      httpsRequestImpl: async () => { requests += 1; },
      revalidateImpl: async () => ({}),
    }), /DESTINATION_GRANT_NOT_FACTORY_ISSUED/u);
    assert.equal(requests, 0);
  });
