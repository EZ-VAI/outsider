import assert from "node:assert/strict";
import test from "node:test";

import {
  OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_BOUNDARY,
  OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_LINEAGE,
  claimWooCommerceProductCandidateV2,
  createWooCommerceNamespaceIndexFetchV2,
  discoverWooCommerceProductsV2,
} from "../src/outsider-woocommerce-products-discovery-adapter-v2.js";

function jsonResponse(body, extra = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return { status: 200, headers: { get(name) {
    const key = String(name).toLowerCase();
    if (key === "content-type") return "application/json";
    if (key === "content-length") return extra.contentLength ?? null;
    return null;
  } }, async text() { return text; } };
}

for (const [name, root, expected] of [
  ["pretty permalink", "https://shop.example/wp-json/",
    "https://shop.example/wp-json/wc/store/v1"],
  ["rest_route", "https://shop.example/?rest_route=%2F",
    "https://shop.example/?rest_route=%2Fwc%2Fstore%2Fv1"],
]) {
  test(`${name} root is narrowed to the namespace index`, async () => {
    const calls = [];
    const fetchImpl = createWooCommerceNamespaceIndexFetchV2(
      async (url) => { calls.push(url); return jsonResponse({ namespace:
        "wc/store/v1", routes: { "/wc/store/v1/products": {
          namespace: "wc/store/v1", methods: ["GET"] } } }); });
    await fetchImpl("https://shop.example/", { method: "HEAD" });
    const adapted = await fetchImpl(root, { method: "GET" });
    assert.equal(calls[1], expected);
    assert.deepEqual(JSON.parse(await adapted.text()).namespaces,
      ["wc/store/v1"]);
  });
}

test("namespace index remains bounded before parsing", async () => {
  const fetchImpl = createWooCommerceNamespaceIndexFetchV2(async () =>
    jsonResponse("{}", { contentLength: String(1024 * 1024 + 1) }));
  await fetchImpl("https://shop.example/", { method: "HEAD" });
  await assert.rejects(() => fetchImpl("https://shop.example/wp-json/",
    { method: "GET" }), /NAMESPACE_INDEX_TOO_LARGE/u);
});

test("namespace index must identify the exact Woo Store namespace", async () => {
  const fetchImpl = createWooCommerceNamespaceIndexFetchV2(async () =>
    jsonResponse({ namespace: "other/v1", routes: {
      "/wc/store/v1/products": { methods: ["GET"] },
    } }));
  await fetchImpl("https://shop.example/", { method: "HEAD" });
  await assert.rejects(() => fetchImpl("https://shop.example/wp-json/",
    { method: "GET" }), /NAMESPACE_INDEX_MALFORMED/u);
});

test("v2 explicitly supersedes frozen v1 and remains HOLD/NONE", async () => {
  assert.equal(OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_LINEAGE
    .frozenV1Modified, false);
  assert.match(OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_LINEAGE
    .supersessionReason, /2196879_BYTES/u);
  const boundary = OUTSIDER_WOOCOMMERCE_PRODUCTS_DISCOVERY_ADAPTER_V2_BOUNDARY;
  assert.equal(boundary.wordpressRootIndexFetched, false);
  assert.equal(boundary.maximumNamespaceIndexBytes, 1024 * 1024);
  assert.equal(boundary.cartReadPermitted, false);
  assert.equal(boundary.checkoutPermitted, false);
  assert.equal(boundary.orderCreationPermitted, false);
  assert.equal(boundary.paymentPermitted, false);
  assert.equal(boundary.authority, "NONE");
  assert.equal(boundary.decisionState, "HOLD");
  await assert.rejects(() => discoverWooCommerceProductsV2({ sellerOrigin:
    "https://shop.example" }, { fetchImpl() {}, timeoutMs: 10 }),
  /INPUT_FIELDS_INVALID/u);
  assert.throws(() => claimWooCommerceProductCandidateV2({}, 0),
    /RESULT_NOT_MODULE_ISSUED/u);
});
