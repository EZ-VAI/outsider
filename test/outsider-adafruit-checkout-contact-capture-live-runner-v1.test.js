import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { runAdafruitCheckoutContactCaptureLiveV1 }
  from "../scripts/outsider-adafruit-checkout-contact-capture-live-runner-v1.mjs";

const NOW = "2026-09-04T17:00:00.000Z";
const PRIVATE_EMAIL = "fixture-recipient@example.invalid";
const PRIVATE_PHONE = "+1 555 010 4901";
const PRIVATE_STREET = "44 Fictional Protocol Street";
const CSRF = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

function root(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-adafruit-contact-"));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function input() {
  return {
    schema: "outsider/private-sparkfun-full-address-prepayment-run-request/v1",
    schemaVersion: "1.0.0",
    product: { catalogPath: "/irrelevant-private-source-product.html",
      productId: "4636", sku: "CAB-14743", quantity: 1 },
    destination: { firstName: "Protocol", lastName: "Fixture",
      email: PRIVATE_EMAIL, telephone: PRIVATE_PHONE, countryCode: "US",
      regionId: 25, region: "Massachusetts", regionCode: "MA",
      city: "Exampleville", postalCode: "02139",
      streetLines: [PRIVATE_STREET] },
    budget: { currency: "USD", maximumAmountMinor: "2000" },
    completionDeadline: "2026-09-10T23:59:59.999Z",
    formationExpiresAt: "2026-09-04T17:30:00.000Z",
    paymentAuthorized: false,
    orderAuthorized: false,
  };
}

function writeInput(directory) {
  const file = path.join(directory, "private-input.json");
  writeFileSync(file, `${canonicalizeStrict(input())}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

function catalog() {
  return `<!doctype html><script type="application/ld+json">${JSON.stringify({
    "@type": "Product", sku: "4474", name: "USB Type A to Type C Cable",
    offers: { price: "4.95", priceCurrency: "USD",
      availability: "https://schema.org/InStock" },
  })}</script><form action="/added" method="post"><input name="securityToken" value="${CSRF}"></form>`;
}

function cart(present) {
  return present
    ? "<!doctype html><div class=\"cart-row\" data-pid=\"4474\" data-qty=\"1\" data-price=\"4.95\"></div>"
    : "<!doctype html><main>empty cart</main>";
}

function checkout(contactAccepted) {
  if (!contactAccepted) {
    return `<!doctype html><form action="/checkout" method="post"><input type="hidden" name="csrf_token" value="${CSRF}"><input type="email" required name="email_address"><button name="action" value="save_one">continue</button></form>`;
  }
  return `<!doctype html><form action="/checkout" method="post"><input type="hidden" name="csrf_token" value="${CSRF}"><input name="ship_first_name" required><input name="ship_last_name" required><input name="ship_street_address" required><input name="ship_city" required><select name="ship_state" required></select><input name="ship_postcode" required><select name="ship_country" required></select><button name="action" value="save_two">rates</button></form>`;
}

function provider(requests) {
  let present = false;
  let contactAccepted = false;
  return async (url, init) => {
    const parsed = new URL(url);
    const body = init.body === undefined ? null
      : Buffer.from(init.body).toString("utf8");
    requests.push({ method: init.method, path: parsed.pathname, body });
    if (init.method === "GET" && parsed.pathname === "/product/4474") {
      return new Response(catalog(), { status: 200,
        headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (init.method === "GET" && parsed.pathname === "/shopping_cart") {
      return new Response(cart(present), { status: 200,
        headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (init.method === "POST" && parsed.pathname === "/added") {
      present = true;
      return new Response("", { status: 302,
        headers: { location: "/shopping_cart" } });
    }
    if (init.method === "GET" && parsed.pathname === "/checkout") {
      return new Response(checkout(contactAccepted), { status: 200,
        headers: { "content-type": "text/html; charset=utf-8" } });
    }
    if (init.method === "POST" && parsed.pathname === "/checkout") {
      const fields = new URLSearchParams(body);
      assert.equal(fields.get("email_address"), PRIVATE_EMAIL);
      assert.equal(fields.get("action"), "save_one");
      assert.equal(fields.get("csrf_token"), CSRF);
      contactAccepted = true;
      return new Response("", { status: 303,
        headers: { location: "/checkout" } });
    }
    throw new Error(`unexpected ${init.method} ${parsed.pathname}`);
  };
}

function privateFiles(directory) {
  const files = [];
  function visit(current) {
    const info = lstatSync(current);
    assert.equal(info.isSymbolicLink(), false);
    assert.equal((info.mode & 0o077), 0);
    if (info.isDirectory()) {
      readdirSync(current).forEach((name) => visit(path.join(current, name)));
    } else files.push(current);
  }
  visit(directory);
  return files;
}

test("runner creates isolated Adafruit cart and captures step-2 form without address, payment, or order",
  async (t) => {
    const directory = root(t);
    const requests = [];
    const result = await runAdafruitCheckoutContactCaptureLiveV1({
      inputFile: writeInput(directory),
      privateRoot: directory,
      observedAt: NOW,
      nonce: "0123456789abcdef0123456789abcdef",
      fetchImpl: provider(requests),
    });
    assert.equal(result.projection.runState,
      "ADDRESS_SHIPPING_FORM_CAPTURED_NO_PAYMENT_HOLD");
    assert.equal(result.projection.contactSubmitted, true);
    assert.equal(result.projection.fullAddressSubmitted, false);
    assert.equal(result.projection.machineUsableNextRateInterfaceObserved, true);
    assert.equal(result.projection.addressShippingForm.nextActionValue,
      "save_two");
    assert.equal(result.projection.counters.liveHttpRequestCount, 9);
    assert.equal(result.projection.counters.getRequestCount, 7);
    assert.equal(result.projection.counters.postRequestCount, 2);
    assert.equal(result.projection.counters.addressSubmitAttemptCount, 0);
    assert.equal(result.projection.counters.paymentEndpointAttemptCount, 0);
    assert.equal(result.projection.counters.orderEndpointAttemptCount, 0);
    assert.equal(result.projection.counters.modelCallCount, 0);
    assert.equal(result.projection.counters.interactiveBrowserActionCount, 0);
    assert.equal(result.projection.counters.employeeTouchCount, 0);
    assert.equal(requests.some((entry) => entry.method === "POST"
      && entry.path === "/checkout"
      && new URLSearchParams(entry.body).get("action") !== "save_one"), false);
    const publicText = JSON.stringify(result.projection)
      + readFileSync(result.publicArtifact.file, "utf8");
    for (const secret of [PRIVATE_EMAIL, PRIVATE_PHONE, PRIVATE_STREET,
      "Exampleville", "02139"]) assert.equal(publicText.includes(secret), false);
    const files = privateFiles(result.runDirectory);
    assert.equal(files.some((file) => file.endsWith(".source-v2.bin")), true);
    assert.equal(files.length >= 10, true);
  });

test("runner rejects non-private input before provider access", async (t) => {
  const directory = root(t);
  const file = writeInput(directory);
  chmodSync(file, 0o644);
  let calls = 0;
  await assert.rejects(() => runAdafruitCheckoutContactCaptureLiveV1({
    inputFile: file,
    privateRoot: directory,
    observedAt: NOW,
    nonce: "abcdef0123456789abcdef0123456789",
    fetchImpl: async () => { calls += 1; throw new Error("not reached"); },
  }), /INPUT_FILE_NOT_PRIVATE/u);
  assert.equal(calls, 0);
});
