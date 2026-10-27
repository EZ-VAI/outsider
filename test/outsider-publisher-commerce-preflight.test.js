import test from "node:test";
import assert from "node:assert/strict";
import { extractPublisherCommerce } from "../src/outsider-publisher-commerce-preflight.js";
test("buyer entry is discovered from anchor text, not a hardcoded pathname or supplier list", () => {
  const result = extractPublisherCommerce({ url: "https://vendor.example/solutions", bytes: Buffer.from('<a href="https://facebook.com/vendor">Facebook</a><a href="/coworking">Book a Day Pass</a><a href="/checkout?token=private">Buy</a><form action="/quote" method="post"><input name="csrf" value="secret"><input name="date"></form><script type="application/ld+json">{"@type":"Offer","price":20,"priceCurrency":"USD","availability":"InStock"}</script>') });
  assert.deepEqual(result.entries, [{ url: "https://vendor.example/coworking", label: "Book a Day Pass" }]);
  assert.deepEqual(result.forms[0].fieldNames, ["csrf", "date"]); assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.equal(result.advertisedOffers[0].price, "20"); assert.equal(result.advertisedOffers[0].capacityReserved, false);
});
