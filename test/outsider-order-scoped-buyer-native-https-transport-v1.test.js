import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  OUTSIDER_ORDER_SCOPED_BUYER_NATIVE_HTTPS_TRANSPORT_V1_BOUNDARY,
  createOrderScopedBuyerNativeHttpsTransportV1,
  inspectOrderScopedBuyerNativeHttpsTransportV1,
} from "../src/outsider-order-scoped-buyer-native-https-transport-v1.js";

const ORIGIN = "https://www.adafruit.com";
const NOW = Date.parse("2026-09-04T16:00:00.000Z");

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function privateDirectory(t) {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-buyer-transport-"));
  const directory = path.join(parent, "order-private");
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return directory;
}

function request(overrides = {}) {
  return {
    schema: "outsider/source-specific-buyer-native-https-request/v1",
    schemaVersion: "1.0.0",
    provider: "ADAFRUIT_GUEST_SHOPPER",
    sessionRefHash: h("session"),
    operation: "HOLD",
    step: "CART_GET",
    method: "GET",
    url: `${ORIGIN}/shopping_cart`,
    headers: { accept: "text/html" },
    bodyBytes: null,
    redirectPolicy: "MANUAL_SAME_ORIGIN_ONLY",
    maximumResponseBytes: 768 * 1024,
    ...overrides,
  };
}

function nativeResponse(body, init = {}) {
  return new Response(body, init);
}

function transport(directory, fetchImpl, extra = {}) {
  return createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: directory,
    orderRefHash: h("order-001"),
    allowedOrigins: [ORIGIN, "https://www.sparkfun.com"],
    timeoutMs: 1_000,
    maximumResponseBytes: 768 * 1024,
    ...extra,
  }, { fetchImpl, clock: () => NOW });
}

test("returns exact adapter response and passes SparkFun JSON mutations through one finite origin set",
  async (t) => {
    const directory = privateDirectory(t);
    const calls = [];
    const selected = transport(directory, async (url, init) => {
      calls.push({ url, init });
      assert.equal(init.redirect, "manual");
      assert.equal(init.credentials, "omit");
      assert.equal(init.headers.cookie, undefined);
      return nativeResponse(Buffer.from([0x00, 0xff, 0x61]), {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8",
          date: "Fri, 04 Sep 2026 16:00:00 GMT", "x-source": "exact" },
      });
    });
    const body = Buffer.from('{"cartItem":{"qty":1,"sku":"CAB-14743"}}',
      "utf8");
    const observed = await selected(request({
      provider: "SPARKFUN_MAGENTO_GUEST_CART",
      step: "CART_ITEM_ADD_POST",
      method: "POST",
      url: "https://www.sparkfun.com/rest/V1/guest-carts/masked/items",
      headers: { accept: "application/json", "content-type": "application/json" },
      bodyBytes: body,
    }));

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url,
      "https://www.sparkfun.com/rest/V1/guest-carts/masked/items");
    assert.deepEqual(Buffer.from(calls[0].init.body), body);
    assert.equal(observed.status, 200);
    assert.equal(observed.finalUrl,
      "https://www.sparkfun.com/rest/V1/guest-carts/masked/items");
    assert.deepEqual(observed.bodyBytes, Buffer.from([0x00, 0xff, 0x61]));
    assert.equal(observed.headers["content-type"],
      "application/json; charset=utf-8");
    assert.equal(observed.headers["x-source"], "exact");
    assert.equal(OUTSIDER_ORDER_SCOPED_BUYER_NATIVE_HTTPS_TRANSPORT_V1_BOUNDARY
      .orderSubmissionImplemented, false);
  });

test("Adafruit cookie jar is durable 0600, private on inspection, and survives cold restart",
  async (t) => {
    const directory = privateDirectory(t);
    const secret = "adafruit-session-secret-0001";
    const first = transport(directory, async (_url, init) => {
      assert.equal(init.headers.cookie, undefined);
      const headers = new Headers({ "content-type": "text/html",
        date: "Fri, 04 Sep 2026 16:00:00 GMT" });
      headers.append("set-cookie",
        `adafruit_session=${secret}; Path=/; Secure; HttpOnly; SameSite=Lax`);
      return nativeResponse("catalog", { status: 200, headers });
    });
    await first(request({ step: "CATALOG_GET",
      url: `${ORIGIN}/product/4474` }));

    assert.equal(statSync(directory).mode & 0o777, 0o700);
    const files = readdirSync(directory);
    assert.equal(files.length, 1);
    const jarPath = path.join(directory, files[0]);
    assert.equal(statSync(jarPath).mode & 0o777, 0o600);
    assert.equal(readFileSync(jarPath, "utf8").includes(secret), true,
      "the cookie exists only in the owner-only private state file");
    const inspected = inspectOrderScopedBuyerNativeHttpsTransportV1(first);
    assert.equal(inspected.cookieSecretsProjected, false);
    assert.equal(JSON.stringify(inspected).includes(secret), false);
    assert.equal(JSON.stringify(inspected).includes(directory), false);

    let coldCookie = null;
    const cold = transport(directory, async (_url, init) => {
      coldCookie = init.headers.cookie;
      const headers = new Headers({ "content-type": "text/html" });
      headers.append("set-cookie",
        "adafruit_session=deleted; Path=/; Max-Age=0; Secure; HttpOnly");
      return nativeResponse("cart", { status: 200, headers });
    });
    await cold(request());
    assert.equal(coldCookie, `adafruit_session=${secret}`);

    let deletedCookie = "not-observed";
    const afterDeleteRestart = transport(directory, async (_url, init) => {
      deletedCookie = init.headers.cookie;
      return nativeResponse("empty", { status: 200,
        headers: { "content-type": "text/html" } });
    });
    await afterDeleteRestart(request());
    assert.equal(deletedCookie, undefined);
  });

test("manual redirects are returned only when Location is same-origin",
  async (t) => {
    const directory = privateDirectory(t);
    const sameOrigin = transport(directory, async () => nativeResponse(null, {
      status: 302, headers: { location: "/shopping_cart",
        "content-type": "text/html" },
    }));
    const observed = await sameOrigin(request({ step: "ADD_PRODUCT_POST",
      method: "POST", url: `${ORIGIN}/added`,
      headers: { accept: "text/html",
        "content-type": "application/x-www-form-urlencoded" },
      bodyBytes: Buffer.from("pid=4474&qty=1", "utf8") }));
    assert.equal(observed.status, 302);
    assert.equal(observed.headers.location, "/shopping_cart");
    assert.equal(observed.finalUrl, `${ORIGIN}/added`);

    let calls = 0;
    const refused = transport(privateDirectory(t), async () => {
      calls += 1;
      return nativeResponse(null, { status: 302,
        headers: { location: "https://checkout.attacker.example/collect" } });
    });
    await assert.rejects(refused(request()),
      /CROSS_ORIGIN_REDIRECT_REFUSED/u);
    assert.equal(calls, 1);
  });

test("refuses non-allowlisted origins, caller credentials, and oversized bodies",
  async (t) => {
    let calls = 0;
    const never = transport(privateDirectory(t), async () => {
      calls += 1;
      return nativeResponse("must not happen");
    });
    await assert.rejects(never(request({ url: "https://seller.example/cart" })),
      /URL_NOT_ALLOWLISTED/u);
    await assert.rejects(never(request({
      headers: { accept: "text/html", cookie: "injected=secret" },
    })), /REQUEST_HEADER_NOT_ALLOWED/u);
    await assert.rejects(never(request({
      headers: { accept: "text/html", authorization: "Bearer secret" },
    })), /REQUEST_HEADER_NOT_ALLOWED/u);
    assert.equal(calls, 0);

    const bounded = transport(privateDirectory(t), async () =>
      nativeResponse("123456789", { status: 200,
        headers: { "content-type": "text/plain" } }), {
      maximumResponseBytes: 8,
    });
    await assert.rejects(bounded(request({ maximumResponseBytes: 8 })),
      /RESPONSE_TOO_LARGE/u);
  });

test("same order transport serializes cookie mutations before the next request",
  async (t) => {
    const directory = privateDirectory(t);
    const cookies = [];
    let sequence = 0;
    const selected = transport(directory, async (_url, init) => {
      sequence += 1;
      cookies.push(init.headers.cookie ?? null);
      if (sequence === 1) {
        const headers = new Headers({ "content-type": "text/html" });
        headers.append("set-cookie", "sid=first; Path=/; Secure; HttpOnly");
        return nativeResponse("one", { status: 200, headers });
      }
      return nativeResponse("two", { status: 200,
        headers: { "content-type": "text/html" } });
    });
    await Promise.all([
      selected(request({ step: "CATALOG_GET",
        url: `${ORIGIN}/product/4474` })),
      selected(request({ step: "CART_GET" })),
    ]);
    assert.deepEqual(cookies, [null, "sid=first"]);
  });
