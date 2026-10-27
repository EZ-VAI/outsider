import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { runAdafruitCheckoutContactCaptureLiveV2 }
  from "../scripts/outsider-adafruit-checkout-contact-capture-live-runner-v2.mjs";

const NOW = "2026-09-04T17:00:00.000Z";
const EXPIRY = "2026-09-04T17:30:00.000Z";
const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const EMAIL = "owner-authorized@example.invalid";

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function privateJson(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  writeFileSync(file, bytes, { mode: 0o600 });
  chmodSync(file, 0o600);
  return { file, bytesHash: digest(bytes) };
}

function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-adafruit-v2-"));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const input = privateJson(path.join(directory, "input.json"), {
    schema: "outsider/private-sparkfun-full-address-prepayment-run-request/v1",
    schemaVersion: "1.0.0",
    product: { catalogPath: "/unused", productId: "4636",
      sku: "CAB-14743", quantity: 1 },
    destination: { firstName: "Owner", lastName: "Authorized", email: EMAIL,
      telephone: "+1 555 010 2100", countryCode: "US", regionId: 25,
      region: "Massachusetts", regionCode: "MA", city: "Exampleville",
      postalCode: "02139", streetLines: ["1 Fixture Street"] },
    budget: { currency: "USD", maximumAmountMinor: "2000" },
    completionDeadline: "2026-09-10T23:59:59.999Z",
    formationExpiresAt: EXPIRY,
    paymentAuthorized: false,
    orderAuthorized: false,
  });
  const grantValue = {
    schema: "outsider/private-supplier-scoped-shipping-quote-use-grant/v2",
    schemaVersion: "2.0.0",
    supplierOrigin: "https://www.adafruit.com",
    purpose: "SHIPPING_DELIVERABILITY_AND_TOTAL_QUOTE_ONLY",
    permittedDisclosures: ["EMAIL_CHECKOUT_CONTACT",
      "FULL_ADDRESS_SHIPPING_QUOTE", "PHONE_SHIPPING_QUOTE"],
    forbiddenActions: ["ADDRESS_USE_OUTSIDE_SHIPPING_QUOTE",
      "CROSS_PURPOSE_REUSE", "MARKETING_SUBSCRIPTION", "ORDER_SUBMISSION",
      "PAYMENT", "PII_PUBLIC_PROJECTION"],
    inputBytesHash: input.bytesHash,
    authorizedAt: NOW,
    expiresAt: EXPIRY,
  };
  const grant = privateJson(path.join(directory, "grant.json"), grantValue);
  return { directory, input, grant, grantValue };
}

function page(kind) {
  if (kind === "product") return `<!doctype html><script type="application/ld+json">${JSON.stringify({
    "@type": "Product", sku: 4474, name: "USB A to USB C Cable",
    offers: { price: "4.95", priceCurrency: "USD",
      availability: "https://schema.org/InStock" },
  })}</script><form action="/added" method="post"><input name="securityToken" value="${TOKEN}"></form>`;
  if (kind === "contact") return `<!doctype html><form action="/checkout" method="post"><input name="csrf_token" value="${TOKEN}"><input name="email_address"><button name="action" value="save_one"></button></form>`;
  return `<!doctype html><form action="/checkout" method="post"><input name="csrf_token" value="${TOKEN}"><input name="ship_first_name"><input name="ship_last_name"><input name="ship_street_address"><input name="ship_city"><select name="ship_state"></select><input name="ship_postcode"><select name="ship_country"></select><button name="action" value="save_two"></button></form>`;
}

function provider(calls) {
  let cart = false;
  let contact = false;
  return async (url, init) => {
    const pathname = new URL(url).pathname;
    const body = init.body === undefined ? ""
      : Buffer.from(init.body).toString("utf8");
    calls.push({ method: init.method, pathname });
    if (init.method === "GET" && pathname === "/product/4474") {
      return new Response(page("product"), { status: 200,
        headers: { "content-type": "text/html" } });
    }
    if (init.method === "GET" && pathname === "/shopping_cart") {
      return new Response(cart
        ? "<div class=\"cart-row\" data-pid=\"4474\" data-qty=\"1\" data-price=\"4.95\"></div>"
        : "<main>empty</main>", { status: 200,
        headers: { "content-type": "text/html" } });
    }
    if (init.method === "POST" && pathname === "/added") {
      cart = true;
      return new Response("", { status: 302,
        headers: { location: "/shopping_cart" } });
    }
    if (init.method === "GET" && pathname === "/checkout") {
      return new Response(page(contact ? "address" : "contact"), {
        status: 200, headers: { "content-type": "text/html" },
      });
    }
    if (init.method === "POST" && pathname === "/checkout") {
      const fields = new URLSearchParams(body);
      assert.equal(fields.get("email_address"), EMAIL);
      assert.equal(fields.get("action"), "save_one");
      contact = true;
      return new Response("", { status: 303,
        headers: { location: "/checkout" } });
    }
    throw new Error(`unexpected ${init.method} ${pathname}`);
  };
}

test("v2 binds the exact private input to an Adafruit-only quote grant before contact disclosure",
  async (t) => {
    const value = fixture(t);
    const calls = [];
    const result = await runAdafruitCheckoutContactCaptureLiveV2({
      inputFile: value.input.file,
      grantFile: value.grant.file,
      privateRoot: value.directory,
      observedAt: NOW,
      nonce: "0123456789abcdef0123456789abcdef",
      fetchImpl: provider(calls),
    });
    assert.equal(result.projection.schema,
      "outsider/adafruit-checkout-contact-capture-public-projection/v2");
    assert.equal(result.projection.contactSubmitted, true);
    assert.equal(result.projection.fullAddressSubmitted, false);
    assert.equal(result.projection.paymentPerformed, false);
    assert.equal(result.projection.orderSubmitted, false);
    assert.equal(result.projection.supplierUseScope.supplierOrigin,
      "https://www.adafruit.com");
    assert.equal(calls.length, 9);
    const projected = JSON.stringify(result.projection)
      + readFileSync(result.publicArtifact.file, "utf8");
    assert.equal(projected.includes(EMAIL), false);

    const badGrant = privateJson(path.join(value.directory, "bad-grant.json"), {
      ...value.grantValue, supplierOrigin: "https://example.invalid",
    });
    let rejectedCalls = 0;
    await assert.rejects(() => runAdafruitCheckoutContactCaptureLiveV2({
      inputFile: value.input.file,
      grantFile: badGrant.file,
      privateRoot: value.directory,
      observedAt: NOW,
      fetchImpl: async () => { rejectedCalls += 1; },
    }), /GRANT_INVALID/u);
    assert.equal(rejectedCalls, 0);
  });
