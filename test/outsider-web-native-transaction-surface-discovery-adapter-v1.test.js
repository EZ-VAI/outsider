import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  OUTSIDER_WEB_NATIVE_TRANSACTION_SURFACE_DISCOVERY_V1_BOUNDARY,
  OUTSIDER_WEB_NATIVE_TRANSACTION_SURFACE_DISCOVERY_V1_LIMITS,
  claimWebNativeTransactionSurfaceLeaseV1,
  discoverWebNativeTransactionSurfacesV1,
} from "../src/outsider-web-native-transaction-surface-discovery-adapter-v1.js";

const hash = (value) => `sha256:${createHash("sha256")
  .update(value).digest("hex")}`;
const PUBLIC_ADDRESS = "93.184.216.34";

function input(label = "native") {
  return {
    sellerOrigin: "https://seller.example.com",
    tenderHash: hash(`${label}:tender`),
    requirementId: `resource_${hash(`${label}:requirement`).slice(7, 39)}`,
    observedAt: "2099-01-01T00:00:00.000Z",
    expiresAt: "2099-01-01T01:00:00.000Z",
    privateProjectionNonce: hash(`${label}:private-projection`),
  };
}

function response(body, overrides = {}) {
  const bytes = Buffer.from(body, "utf8");
  return {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8",
      "content-length": String(bytes.length) },
    body: bytes,
    remoteAddress: PUBLIC_ADDRESS,
    remoteFamily: "IPv4",
    tlsAuthorized: true,
    tlsServernameVerified: true,
    tlsCertificateHostnameVerified: true,
    ...overrides,
  };
}

function transportFor(handler) {
  const requests = [];
  const lookups = [];
  return {
    requests,
    lookups,
    transportConfig: {
      async lookupImpl(hostname, options) {
        lookups.push({ hostname, options });
        return [{ address: PUBLIC_ADDRESS, family: 4 }];
      },
      async requestImpl(request) {
        requests.push(request);
        return handler(request, requests.length - 1);
      },
    },
  };
}

test("discovers forms, mailto, and schema.org EntryPoint without projecting targets",
  async () => {
    const html = `<!doctype html>
      <base href="https://seller.example.com/acquire/">
      <form action="quote?kind=general&amp;v=1" method="post"></form>
      <form action="/availability"></form>
      <a href="mailto:sales@seller.example.com?subject=General%20request">contact</a>
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "@type":"Service",
        "potentialAction":{
          "@type":"ReserveAction",
          "target":{
            "@type":"EntryPoint",
            "urlTemplate":"/reserve/{slot}",
            "httpMethod":"POST"
          }
        }
      }</script>`;
    const transport = transportFor(() => response(html));
    const result = await discoverWebNativeTransactionSurfacesV1(input(), {
      transportConfig: transport.transportConfig,
    });

    assert.equal(result.publicProjection.status, "SURFACES_OBSERVED");
    assert.equal(result.publicProjection.surfaceOccurrenceCount, 4);
    assert.deepEqual(result.publicProjection.surfaceOccurrences.map((item) =>
      [item.surfaceKind, item.methodCode]), [
      ["HTML_FORM", "POST"],
      ["HTML_FORM", "GET"],
      ["MAILTO_LINK", "MAIL_COMPOSE"],
      ["SCHEMA_ORG_ENTRY_POINT", "POST"],
    ]);
    assert.equal(result.publicProjection.sourceReplay.terminalStatus, 200);
    assert.equal(result.publicProjection.sourceReplay.terminalBodyBytes,
      Buffer.byteLength(html));
    assert.equal(result.publicProjection.sourceReplay.terminalBodyHash,
      hash(html));
    assert.equal(transport.requests.length, 1);
    assert.equal(transport.requests[0].method, "GET");
    assert.equal(Object.hasOwn(transport.requests[0].headers,
      "Authorization"), false);
    const publicJson = JSON.stringify(result.publicProjection);
    for (const privateValue of ["seller.example.com", "sales@",
      "/availability", "/reserve/", "General%20request"]) {
      assert.equal(publicJson.includes(privateValue), false);
    }
    assert.equal(result.publicProjection.resourceOwnerAuthorityEstablished,
      false);
    assert.equal(result.publicProjection.providerAcceptanceEstablished, false);
    assert.equal(result.publicProjection.capacityReserved, false);
    assert.equal(result.publicProjection.actionReady, false);

    const privateClaim = claimWebNativeTransactionSurfaceLeaseV1(result);
    assert.equal(privateClaim.invocationPermitted, false);
    assert.equal(privateClaim.observations.length, 4);
    assert.match(privateClaim.observations[0].target,
      /^https:\/\/seller\.example\.com\/acquire\/quote/u);
    assert.match(privateClaim.observations[2].target,
      /^mailto:sales@seller\.example\.com/u);
    assert.equal(privateClaim.observations[3].target,
      "https://seller.example.com/reserve/{slot}");
    assert.throws(() => claimWebNativeTransactionSurfaceLeaseV1(result),
      /PRIVATE_LEASE_INVALID_OR_REPLAYED/u);
  });

test("rejects cross-origin or unsafe action targets and retains only observations",
  async () => {
    const html = `<form action="https://other.example.com/quote" method="post"></form>
      <form action="http://seller.example.com/insecure" method="post"></form>
      <form action="https&colon;//other.example.com/entity-bypass" method="post"></form>
      <form action="https&colon//other.example.com/entity-bypass-2" method="post"></form>
      <form action="/dialog"><button formmethod="dialog">close</button></form>
      <script>const fake = "<form action='/not-observed' method='post'>";</script>
      <template><template></template><script>const close = "</template>";</script><form action="/not-observed-either" method="post"></form></template>
      <a href="mailto:"></a>
      <a href="mailto:sales&commat;other.example.com"></a>
      <script type="application/ld+json">not-json</script>
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "potentialAction":{"@type":"BuyAction","target":"https://other.example.com/buy"}
      }</script>
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "potentialAction":{"target":{"@type":"EntryPoint","urlTemplate":"{+endpoint}"}}
      }</script>
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "potentialAction":{"target":{"@type":"EntryPoint","urlTemplate":"/path#fragment{slot}"}}
      }</script>
      <script type="application/ld+json">{
        "@context":"https://schema.org",
        "potentialAction":{"target":{"@type":"EntryPoint","urlTemplate":"/{x,,y}"}}
      }</script>
      <plaintext></plaintext><form action="/plaintext-false-positive"></form>`;
    const transport = transportFor(() => response(html));
    const result = await discoverWebNativeTransactionSurfacesV1(input("unsafe"), {
      transportConfig: transport.transportConfig,
    });
    const rejected = result.publicProjection.rejectedObservationCounts;
    assert.equal(result.publicProjection.status, "SURFACES_OBSERVED");
    assert.equal(result.publicProjection.surfaceOccurrenceCount, 1);
    assert.equal(result.publicProjection.surfaceOccurrences[0].surfaceKind,
      "HTML_FORM");
    assert.equal(rejected.unsafeOrCrossOriginFormCount, 4);
    assert.equal(rejected.malformedMailtoCount, 2);
    assert.equal(rejected.jsonLdParseFailureCount, 1);
    assert.equal(rejected.jsonLdUnsafeOrUnsupportedTargetCount, 4);
    assert.equal(transport.requests.length, 1);
  });

test("does not treat an unrelated JSON-LD prefix mapping as schema.org @vocab",
  async () => {
    const html = `<script type="application/ld+json">{
      "@context":"https://schema.org",
      "prefixOnly":{
        "@context":{"x":"https://schema.org"},
        "potentialAction":{"target":{"@type":"EntryPoint","urlTemplate":"/false-positive"}}
      },
      "reset":{
        "@context":null,
        "potentialAction":{"target":"/also-false-positive"}
      },
      "arrayReset":{
        "@context":["https://schema.org",null],
        "potentialAction":{"target":"/array-false-positive"}
      },
      "termOverride":{
        "@context":{"@vocab":"https://schema.org","potentialAction":"https://evil.example/p"},
        "potentialAction":{"target":"/override-false-positive"}
      },
      "actionResets":{
        "potentialAction":[
          {"@context":null,"target":"/action-reset-false-positive"},
          {"target":{"@context":null,"@type":"EntryPoint","urlTemplate":"/entry-reset-false-positive"}}
        ]
      }
    }</script>`;
    const transport = transportFor(() => response(html));
    const result = await discoverWebNativeTransactionSurfacesV1(
      input("context-prefix"), { transportConfig: transport.transportConfig });
    assert.equal(result.publicProjection.status,
      "NO_SUPPORTED_SURFACE_OBSERVED");
    assert.equal(result.publicProjection.surfaceOccurrenceCount, 0);
  });

test("oversized action or method never becomes a defaulted form attribute",
  async () => {
    const oversizedCrossOrigin = `https://other.example.com/${"a".repeat(8_193)}`;
    const oversizedMethod = "p".repeat(8_193);
    const html = `<form action="${oversizedCrossOrigin}" method="post"></form>
      <form action="/must-not-default" method="${oversizedMethod}"></form>`;
    const transport = transportFor(() => response(html));
    const result = await discoverWebNativeTransactionSurfacesV1(
      input("oversized-action"), { transportConfig: transport.transportConfig });
    assert.equal(result.publicProjection.status,
      "NO_SUPPORTED_SURFACE_OBSERVED");
    assert.equal(result.publicProjection.surfaceOccurrenceCount, 0);
    assert.equal(result.publicProjection.rejectedObservationCounts
      .unsafeOrCrossOriginFormCount, 2);
  });

test("follows only bounded same-origin redirects and replays each response",
  async () => {
    const terminal = "<form action='/rfq' method='post'></form>";
    const transport = transportFor((_request, index) => index === 0
      ? response("", { status: 302, headers: {
        location: "/services", "content-type": "text/html",
        "content-length": "0" } }) : response(terminal));
    const result = await discoverWebNativeTransactionSurfacesV1(input("redirect"), {
      transportConfig: transport.transportConfig, maximumRedirects: 1,
    });
    assert.equal(result.publicProjection.sourceReplay.requestCount, 2);
    assert.equal(result.publicProjection.sourceReplay.redirectCount, 1);
    assert.deepEqual(result.publicProjection.sourceReplay.hops.map((hop) =>
      hop.status), [302, 200]);
    assert.equal(result.publicProjection.surfaceOccurrenceCount, 1);
    assert.match(transport.requests[1].url,
      /^https:\/\/seller\.example\.com\/services$/u);

    const external = transportFor(() => response("", { status: 302,
      headers: { location: "https://other.example.com/path",
        "content-type": "text/html", "content-length": "0" } }));
    await assert.rejects(discoverWebNativeTransactionSurfacesV1(
      input("external-redirect"), { transportConfig: external.transportConfig }),
    /REDIRECT_CROSS_ORIGIN_OR_UNSAFE_REFUSED/u);
    assert.equal(external.requests.length, 1);
  });

test("public-host and pinned-DNS protections fail before unsafe HTTPS effects",
  async () => {
    let lookupCount = 0;
    let requestCount = 0;
    const dependencies = { transportConfig: {
      async lookupImpl() {
        lookupCount += 1;
        return [{ address: "127.0.0.1", family: 4 }];
      },
      async requestImpl() { requestCount += 1; return response(""); },
    } };
    for (const sellerOrigin of ["https://127.0.0.1",
      "https://seller.local", "http://seller.example.com",
      "https://user@seller.example.com"]) {
      await assert.rejects(discoverWebNativeTransactionSurfacesV1({
        ...input(`origin-${sellerOrigin}`), sellerOrigin,
      }, dependencies), /SELLER_ORIGIN|PUBLIC_HTTPS_SELLER_ORIGIN/u);
    }
    assert.equal(lookupCount, 0);
    await assert.rejects(discoverWebNativeTransactionSurfacesV1(
      input("dns-private"), dependencies),
    /DNS_NON_PUBLIC_OR_MIXED_ADDRESS_REFUSED/u);
    assert.equal(lookupCount, 1);
    assert.equal(requestCount, 0);
  });

test("document bytes, timeout, redirects, and non-HTML outcomes stay bounded",
  async () => {
    assert.equal(OUTSIDER_WEB_NATIVE_TRANSACTION_SURFACE_DISCOVERY_V1_LIMITS
      .defaultTimeoutMs, 15_000);
    assert.equal(OUTSIDER_WEB_NATIVE_TRANSACTION_SURFACE_DISCOVERY_V1_LIMITS
      .maximumTimeoutMs, 60_000);
    assert.equal(OUTSIDER_WEB_NATIVE_TRANSACTION_SURFACE_DISCOVERY_V1_BOUNDARY
      .postPerformed, false);
    assert.equal(OUTSIDER_WEB_NATIVE_TRANSACTION_SURFACE_DISCOVERY_V1_BOUNDARY
      .observedSurfaceIsAuthority, false);

    const oversized = transportFor(() => response("123456789"));
    await assert.rejects(discoverWebNativeTransactionSurfacesV1(input("bytes"), {
      transportConfig: oversized.transportConfig, maximumDocumentBytes: 8,
    }), /RESPONSE_TOO_LARGE|DOCUMENT_TOO_LARGE/u);

    const hanging = transportFor(() => new Promise(() => {}));
    await assert.rejects(discoverWebNativeTransactionSurfacesV1(input("timeout"), {
      transportConfig: hanging.transportConfig, timeoutMs: 2,
    }), /TIMEOUT/u);

    const cumulative = transportFor(async (_request, index) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      return index === 0 ? response("", { status: 302, headers: {
        location: "/second", "content-type": "text/html",
        "content-length": "0" } }) : response("<form></form>");
    });
    await assert.rejects(discoverWebNativeTransactionSurfacesV1(
      input("cumulative-timeout"), { transportConfig: cumulative.transportConfig,
        timeoutMs: 20, maximumRedirects: 1 }), /TIMEOUT/u);

    const redirecting = transportFor(() => response("", { status: 302,
      headers: { location: "/again", "content-type": "text/html",
        "content-length": "0" } }));
    await assert.rejects(discoverWebNativeTransactionSurfacesV1(
      input("redirect-limit"), { transportConfig: redirecting.transportConfig,
        maximumRedirects: 0 }), /REDIRECT_LIMIT_OR_LOCATION_INVALID/u);
    assert.equal(redirecting.requests.length, 1);

    const json = transportFor(() => response("{}", { headers: {
      "content-type": "application/json", "content-length": "2" } }));
    const nonHtml = await discoverWebNativeTransactionSurfacesV1(
      input("json"), { transportConfig: json.transportConfig });
    assert.equal(nonHtml.publicProjection.status,
      "SOURCE_NOT_SUPPORTED_DOCUMENT");
    assert.equal(nonHtml.publicProjection.surfaceOccurrenceCount, 0);

    const rawByteTransport = transportFor(() => response(Buffer.from([0x80]), {
      headers: { "content-type": "text/html", "content-length": "1" },
    }));
    const rawByte = await discoverWebNativeTransactionSurfacesV1(
      input("raw-byte"), { transportConfig: rawByteTransport.transportConfig });
    assert.equal(rawByte.publicProjection.sourceReplay.terminalBodyBytes, 1);
    assert.equal(rawByte.publicProjection.sourceReplay.terminalBodyHash,
      hash(Buffer.from([0x80])));
    assert.equal(rawByte.publicProjection.sourceReplay.bodyRepresentation,
      "EXACT_RAW_RESPONSE_BYTES_FROM_PINNED_TRANSPORT");
    assert.equal(rawByte.publicProjection.status,
      "SOURCE_NOT_SUPPORTED_DOCUMENT_ENCODING");

    const legacyEncoding = transportFor(() => response(Buffer.from([0xe9]), {
      headers: { "content-type": "text/html; charset=windows-1252",
        "content-length": "1" },
    }));
    const unsupportedEncoding = await discoverWebNativeTransactionSurfacesV1(
      input("legacy-encoding"), {
        transportConfig: legacyEncoding.transportConfig });
    assert.equal(unsupportedEncoding.publicProjection.status,
      "SOURCE_NOT_SUPPORTED_DOCUMENT_ENCODING");
    assert.equal(unsupportedEncoding.publicProjection.surfaceOccurrenceCount, 0);
  });
