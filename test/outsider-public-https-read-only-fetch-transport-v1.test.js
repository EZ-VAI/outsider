import assert from "node:assert/strict";
import test from "node:test";

import {
  OUTSIDER_PUBLIC_HTTPS_READ_ONLY_FETCH_TRANSPORT_V1_BOUNDARY,
  createPinnedPublicHttpsFetchV1,
  createPublicHttpsReadOnlyFetchTransportV1,
} from "../src/outsider-public-https-read-only-fetch-transport-v1.js";

const PUBLIC_V4 = "93.184.216.34";

function options(method = "GET", signal = new AbortController().signal) {
  return {
    method,
    headers: { Accept: method === "HEAD" ? "text/html" : "application/json" },
    redirect: "error",
    credentials: "omit",
    signal,
  };
}

function pinnedResponse(overrides = {}) {
  return {
    status: 200,
    headers: { "content-type": "application/json", link:
      '<https://shop.example/wp-json/>; rel="https://api.w.org/"' },
    body: Buffer.from('{"ok":true}', "utf8"),
    remoteAddress: PUBLIC_V4,
    remoteFamily: "IPv4",
    tlsAuthorized: true,
    tlsServernameVerified: true,
    tlsCertificateHostnameVerified: true,
    ...overrides,
  };
}

function errorCode(code) {
  return (error) => error?.outsiderCode === code;
}

test("HEAD and GET resolve every address, pin one address, and return Woo-compatible responses",
  async () => {
    assert.equal(createPinnedPublicHttpsFetchV1,
      createPublicHttpsReadOnlyFetchTransportV1);
    const lookups = [];
    const requests = [];
    const fetchImpl = createPinnedPublicHttpsFetchV1({
      timeoutMs: 100,
      maximumResponseBytes: 1_024,
      async lookupImpl(hostname, lookupOptions) {
        lookups.push({ hostname, lookupOptions });
        return [{ address: PUBLIC_V4, family: 4 },
          { address: "2606:4700:4700::1111", family: 6 }];
      },
      async requestImpl(request) {
        requests.push(request);
        return pinnedResponse(request.method === "HEAD"
          ? { body: Buffer.alloc(0) } : {});
      },
    });
    const head = await fetchImpl("https://shop.example/", options("HEAD"));
    const get = await fetchImpl(
      "https://shop.example/wp-json/wc/store/v1/products?per_page=2",
      options("GET"));

    assert.equal(lookups.length, 2);
    assert.equal(lookups[0].hostname, "shop.example");
    assert.equal(lookups[0].lookupOptions.all, true);
    assert.equal(lookups[0].lookupOptions.verbatim, true);
    assert.equal(requests.length, 2);
    for (const request of requests) {
      assert.equal(request.hostname, "shop.example");
      assert.equal(request.address, PUBLIC_V4);
      assert.equal(request.family, 4);
      assert.equal(request.headers.Connection, "close");
      assert.equal(Object.hasOwn(request.headers, "Authorization"), false);
      assert.equal(Object.hasOwn(request.headers, "Cookie"), false);
    }
    assert.equal(head.status, 200);
    assert.match(head.headers.get("link"), /wp-json/u);
    assert.equal(await get.text(), '{"ok":true}');
    assert.deepEqual(Buffer.from(await get.arrayBuffer()),
      Buffer.from('{"ok":true}', "utf8"));
    assert.equal(get.headers.get("content-type"), "application/json");
    assert.equal(get.body, null);
    assert.equal(OUTSIDER_PUBLIC_HTTPS_READ_ONLY_FETCH_TRANSPORT_V1_BOUNDARY
      .resourceOwnerAuthorityEstablished, false);
  });

test("IP literals, unsafe methods/headers, and private or mixed DNS fail before HTTPS",
  async () => {
    let lookupCalls = 0;
    let requestCalls = 0;
    const mixedFetch = createPinnedPublicHttpsFetchV1({
      timeoutMs: 100,
      maximumResponseBytes: 1_024,
      async lookupImpl() {
        lookupCalls += 1;
        return [{ address: PUBLIC_V4, family: 4 },
          { address: "127.0.0.1", family: 4 }];
      },
      async requestImpl() { requestCalls += 1; return pinnedResponse(); },
    });
    await assert.rejects(mixedFetch("https://shop.example/", options()),
      errorCode("DNS_NON_PUBLIC_OR_MIXED_ADDRESS_REFUSED"));
    assert.equal(lookupCalls, 1);
    assert.equal(requestCalls, 0);

    await assert.rejects(mixedFetch("https://127.0.0.1/", options()),
      errorCode("PUBLIC_HTTPS_URL_REQUIRED"));
    await assert.rejects(mixedFetch("https://shop.example/", options("POST")),
      errorCode("METHOD_FORBIDDEN"));
    const unsafe = options();
    unsafe.headers = { Authorization: "Bearer forbidden" };
    await assert.rejects(mixedFetch("https://shop.example/", unsafe),
      errorCode("REQUEST_HEADER_FORBIDDEN"));
    assert.equal(lookupCalls, 1);
    assert.equal(requestCalls, 0);
  });

test("TLS authorization, certificate hostname, family, and socket address are replayed",
  async () => {
    const cases = [
      { tlsAuthorized: false },
      { tlsServernameVerified: false },
      { tlsCertificateHostnameVerified: false },
      { remoteAddress: "1.1.1.1" },
      { remoteFamily: "IPv6" },
    ];
    for (const replacement of cases) {
      const fetchImpl = createPinnedPublicHttpsFetchV1({
        timeoutMs: 100,
        maximumResponseBytes: 1_024,
        async lookupImpl() { return [{ address: PUBLIC_V4, family: 4 }]; },
        async requestImpl() { return pinnedResponse(replacement); },
      });
      await assert.rejects(fetchImpl("https://shop.example/", options()),
        errorCode("TLS_REMOTE_OR_CERTIFICATE_MISMATCH"));
    }
  });

test("redirect responses are returned once and never followed", async () => {
  let requestCalls = 0;
  const fetchImpl = createPinnedPublicHttpsFetchV1({
    timeoutMs: 100,
    maximumResponseBytes: 1_024,
    async lookupImpl() { return [{ address: PUBLIC_V4, family: 4 }]; },
    async requestImpl() {
      requestCalls += 1;
      return pinnedResponse({ status: 302, body: Buffer.alloc(0),
        headers: { location: "https://other.example/" } });
    },
  });
  const response = await fetchImpl("https://shop.example/", options("HEAD"));
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "https://other.example/");
  assert.equal(requestCalls, 1);
});

test("body, internal timeout, and caller abort remain bounded", async () => {
  const oversized = createPinnedPublicHttpsFetchV1({
    timeoutMs: 100,
    maximumResponseBytes: 8,
    async lookupImpl() { return [{ address: PUBLIC_V4, family: 4 }]; },
    async requestImpl() { return pinnedResponse({ body: Buffer.alloc(9) }); },
  });
  await assert.rejects(oversized("https://shop.example/", options()),
    errorCode("RESPONSE_TOO_LARGE"));

  const hanging = createPinnedPublicHttpsFetchV1({
    timeoutMs: 2,
    maximumResponseBytes: 1_024,
    async lookupImpl() { return [{ address: PUBLIC_V4, family: 4 }]; },
    async requestImpl() { return new Promise(() => {}); },
  });
  await assert.rejects(hanging("https://shop.example/", options()),
    errorCode("TIMEOUT"));

  const controller = new AbortController();
  const callerAborted = createPinnedPublicHttpsFetchV1({
    timeoutMs: 100,
    maximumResponseBytes: 1_024,
    async lookupImpl() { return new Promise(() => {}); },
    async requestImpl() { return pinnedResponse(); },
  });
  const pending = callerAborted("https://shop.example/",
    options("GET", controller.signal));
  controller.abort();
  await assert.rejects(pending, errorCode("ABORTED"));
});
