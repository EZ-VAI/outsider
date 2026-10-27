import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, realpathSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1,
  createFirstPhysicalOutcomeProductionCompositionV1,
} from "../src/outsider-first-physical-outcome-production-composition-v1.js";

const NOW = "2026-09-04T15:00:00.000Z";
const COMPLETE = "2026-09-08T15:00:00.000Z";
const AUTHORITY_EXPIRY = "2026-09-04T16:00:00.000Z";
const MASKED_CART = "maskedSparkFunCartForPhysical001";

function h(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function privateDirectory(t) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-first-physical-composition-")));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function adafruitCatalog() {
  return `<!doctype html><script type="application/ld+json">${JSON.stringify({
    "@context": "http://schema.org", "@type": "Product",
    name: "USB Type A to Type C Cable - approx 1 meter / 3 ft long",
    sku: 4474,
    offers: { "@type": "Offer", availability: "http://schema.org/InStock",
      price: "4.9500", priceCurrency: "USD" },
  })}</script><form action="/added" method="post"><input name="securityToken" value="adafruit-private-token"></form>`;
}

function adafruitCart(present) {
  const row = present
    ? '<div role="row" class="cart-row" data-pid="4474" data-qty="1" data-price="4.95">item</div>'
    : "";
  return `<!doctype html>${row}<form action="/shopping_cart" method="post" data-empty-cart-confirm><input type="hidden" name="securityToken" value="cart-private-token"></form>`;
}

function sparkfunCatalog() {
  const provider = { "*": { "Magento_Catalog/js/product/view/provider": {
    data: { items: { "4636": {
      id: 4636, name: "USB 3.1 Cable A to C - 3 Foot",
      price_info: { final_price: 7.95 }, currency_code: "USD",
      is_salable: "1", is_available: true,
    } } },
  } } };
  const context = { productId: 4636, sku: "CAB-14743",
    updatedAt: "2025-05-08 18:25:57" };
  return `<!doctype html><script type="text/x-magento-init">${JSON.stringify(provider)}</script><script>magentoStorefrontEvents.context.setProduct(${JSON.stringify(context)})</script>`;
}

function sparkfunCart(present) {
  return { id: 2316323, is_active: true,
    items: present ? [{ item_id: 2124971, sku: "CAB-14743", qty: 1,
      name: "USB 3.1 Cable A to C - 3 Foot", price: 7.95,
      product_type: "simple", quote_id: "2316323" }] : [],
    items_count: present ? 1 : 0, items_qty: present ? 1 : 0 };
}

function sparkfunTotals(present, landed = false) {
  return { grand_total: landed ? 19.83 : present ? 7.95 : 0,
    base_grand_total: landed ? 19.83 : present ? 7.95 : 0,
    subtotal: present ? 7.95 : 0, shipping_amount: landed ? 11.19 : 0,
    tax_amount: landed ? 0.69 : 0, items_qty: present ? 1 : 0,
    base_currency_code: "USD", quote_currency_code: "USD" };
}

function response(body, options = {}) {
  return new Response(options.status === 302 ? null
    : typeof body === "string" ? body : JSON.stringify(body), {
    status: options.status ?? 200,
    headers: { "content-type": options.contentType ?? "text/html",
      date: "Fri, 04 Sep 2026 15:00:00 GMT",
      ...(options.status === 302 ? { location: options.location } : {}) },
  });
}

function fakeWorld() {
  const calls = [];
  let adafruitPresent = false;
  let sparkfunPresent = false;
  return {
    calls,
    async fetch(url, init) {
      calls.push({ url, method: init.method,
        body: init.body === undefined ? null : Buffer.from(init.body) });
      const parsed = new URL(url);
      if (parsed.hostname === "www.adafruit.com") {
        if (parsed.pathname === "/product/4474" && init.method === "GET") {
          return response(adafruitCatalog());
        }
        if (parsed.pathname === "/shopping_cart" && init.method === "GET") {
          return response(adafruitCart(adafruitPresent));
        }
        if (parsed.pathname === "/added" && init.method === "POST") {
          adafruitPresent = true;
          return response(null, { status: 302, location: url });
        }
      }
      if (parsed.hostname === "www.sparkfun.com") {
        if (parsed.pathname === "/usb-3-1-cable-a-to-c-3-foot.html"
          && init.method === "GET") return response(sparkfunCatalog());
        if (parsed.pathname === "/rest/V1/guest-carts"
          && init.method === "POST") {
          return response(JSON.stringify(MASKED_CART), {
            contentType: "application/json; charset=utf-8" });
        }
        if (parsed.pathname.endsWith("/items") && init.method === "POST") {
          sparkfunPresent = true;
          return response({ item_id: 2124971, sku: "CAB-14743", qty: 1,
            name: "USB 3.1 Cable A to C - 3 Foot", price: 7.95,
            product_type: "simple", quote_id: "2316323" }, {
            contentType: "application/json; charset=utf-8" });
        }
        if (parsed.pathname.endsWith("/estimate-shipping-methods")
          && init.method === "POST") {
          return response([
            { carrier_code: "ups", method_code: "03", carrier_title: "UPS",
              method_title: "Ground", amount: 11.19, base_amount: 11.19,
              available: true, error_message: "", price_excl_tax: 11.19,
              price_incl_tax: 11.19 },
            { carrier_code: "ups", method_code: "02", carrier_title: "UPS",
              method_title: "Second Day Air", amount: 28.79,
              base_amount: 28.79, available: true, error_message: "",
              price_excl_tax: 28.79, price_incl_tax: 28.79 },
          ], { contentType: "application/json; charset=utf-8" });
        }
        if (parsed.pathname.endsWith("/totals-information")
          && init.method === "POST") {
          return response(sparkfunTotals(true, true), {
            contentType: "application/json; charset=utf-8" });
        }
        if (/\/rest\/V1\/guest-carts\/[^/]+\/totals$/u.test(parsed.pathname)
          && init.method === "GET") {
          return response(sparkfunTotals(sparkfunPresent), {
            contentType: "application/json; charset=utf-8" });
        }
        if (/\/rest\/V1\/guest-carts\/[^/]+$/u.test(parsed.pathname)
          && init.method === "GET") {
          return response(sparkfunCart(sparkfunPresent), {
            contentType: "application/json; charset=utf-8" });
        }
      }
      throw new Error(`unexpected ${init.method} ${url}`);
    },
  };
}

function request(id) {
  return { requestId: id, goal: OUTSIDER_FIRST_PHYSICAL_OUTCOME_GOAL_V1,
    budget: { currency: "USD", maximumAmountMinor: "2500" },
    completionDeadline: COMPLETE, context: { locale: "en-US" } };
}

function injected(destination = null) {
  return {
    formationAuthorization: {
      formationOperationsAuthorized: true,
      commitWithoutSeparatePaymentAuthorization: false,
    },
    transactionAuthority: {
      authorityRefHash: h("user-transaction-authority"),
      principalEpochRefHash: h("principal-epoch"),
      issuedAt: "2026-09-04T14:55:00.000Z",
      expiresAt: AUTHORITY_EXPIRY,
    },
    destination,
  };
}

function composition(t, world, hooks = {}) {
  return createFirstPhysicalOutcomeProductionCompositionV1({
    directory: hooks.directory ?? privateDirectory(t),
    formationWindowMs: 30 * 60_000,
    cleanupWindowMs: 24 * 60 * 60_000,
  }, {
    clock: () => NOW, fetchImpl: world.fetch,
    compileFoundation: hooks.compileFoundation ?? null,
    resolveRouteRequests: null,
    async revalidateTransactionAuthority(entry) {
      return { active: true, authorityRefHash: entry.authorityRefHash,
        observedAt: entry.observedAt, expiresAt: AUTHORITY_EXPIRY };
    },
    async witnessReadinessImpl({ request: witnessRequest }) {
      return { sourceBytes: Buffer.from(JSON.stringify({
        schema: "outsider/test-independent-witness-readiness/v1",
        operation: witnessRequest.operation,
        candidateOnly: true, capacityReserved: false,
        independentOutcomeEstablished: false,
      })),
      sourceState: witnessRequest.operation === "QUOTE"
        ? "QUOTE_AVAILABLE" : "STATE_OBSERVED",
      sourceExpiresAt: witnessRequest.operation === "QUOTE"
        ? "2026-09-04T15:30:00.000Z" : null,
      sourceRecordClass: witnessRequest.operation === "QUOTE"
        ? "QUOTE" : "STATUS_RECEIPT" };
    },
    selectShippingRate: null,
    ...(hooks.formationEventSink === undefined ? {}
      : { formationEventSink: hooks.formationEventSink }),
    ...(hooks.buyerNativeSourceOccurrenceSink === undefined ? {}
      : { buyerNativeSourceOccurrenceSink:
        hooks.buyerNativeSourceOccurrenceSink }),
  });
}

test("no-payment physical formation composes two real adapters and asks only for postal destination",
  async (t) => {
    const world = fakeWorld();
    const product = composition(t, world);
    const result = await product.requestOutcome(request("physical_no_destination"),
      injected());

    assert.equal(result.workflowState, "NEEDS_DESTINATION");
    assert.equal(result.productState, "NEEDS_DESTINATION");
    assert.deepEqual(result.nextInput.requiredFields.map((field) => field.name),
      ["countryCode", "postalCode"]);
    assert.equal(result.exactCommitmentProposal, null);
    assert.equal(result.cartReadyCountsAsReservation, false);
    assert.equal(result.capacityReserved, false);
    assert.equal(result.paymentAttempted, false);
    assert.equal(result.orderSubmitted, false);
    assert.equal(result.sellerMessageCount, 0);
    assert.equal(result.humanQueueCreated, false);
    assert.equal(world.calls.some((call) =>
      /checkout|payment-information|\/orders?(?:$|\/)/u.test(call.url)), false);
    assert.equal(world.calls.filter((call) => call.method === "POST").length, 3);
  });

test("postal destination reaches SparkFun rates and landed total but still cannot reserve, pay, order or promise",
  async (t) => {
    const world = fakeWorld();
    const product = composition(t, world);
    const result = await product.requestOutcome(request("physical_destination"),
      injected({ countryCode: "US", postalCode: "10001", regionId: 43,
        region: "New York", city: "New York" }));

    assert.equal(result.workflowState,
      "NEEDS_FULL_ADDRESS_DELIVERABILITY_AND_ETA");
    assert.equal(result.destinationQuote.rates.normalized.availableRateCount, 2);
    assert.equal(result.destinationQuote.landedTotals.normalized.totals
      .grandTotal, 19.83);
    assert.equal(result.destinationQuote.landedTotals.deliveryDeadlineProven,
      false);
    assert.match(result.destinationQuote.sourceCartOccurrenceHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.match(result.destinationQuote.stageTransactionRefHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.equal(result.capacityReserved, false);
    assert.equal(result.paymentAttempted, false);
    assert.equal(result.orderSubmitted, false);
    assert.equal(result.outcomePromiseIssued, false);
    assert.equal(world.calls.some((call) =>
      /payment-information|\/orders?(?:$|\/)/u.test(call.url)), false);
  });

test("cold inspect preserves completed postal-quote progress and does not ask for the postal destination twice",
  async (t) => {
    const world = fakeWorld();
    const directory = privateDirectory(t);
    const first = composition(t, world, { directory });
    const formed = await first.requestOutcome(request("physical_postal_restart"),
      injected({ countryCode: "US", postalCode: "10001", regionId: 43,
        region: "New York", city: "New York" }));
    assert.equal(formed.workflowState,
      "NEEDS_FULL_ADDRESS_DELIVERABILITY_AND_ETA");

    const restarted = composition(t, world, { directory });
    const inspected = restarted.inspect("physical_postal_restart");
    assert.equal(inspected.workflowState,
      "NEEDS_FULL_ADDRESS_DELIVERABILITY_AND_ETA");
    assert.equal(inspected.destinationQuote.landedTotals.normalized.totals
      .grandTotal, 19.83);
    assert.deepEqual(inspected.nextInput.requiredFields,
      ["contactEmail", "recipientName", "streetAddress", "city", "region",
        "postalCode", "countryCode"]);
    assert.equal(inspected.nextInput.paymentAuthorized, false);
    assert.equal(inspected.nextInput.orderAuthorized, false);
  });

test("cold restart reloads the frozen foundation and replays carts without duplicate external effects",
  async (t) => {
    const world = fakeWorld();
    const directory = privateDirectory(t);
    const first = composition(t, world, { directory });
    const initial = await first.requestOutcome(request("physical_cold_replay"),
      injected());
    assert.equal(initial.workflowState, "NEEDS_DESTINATION");
    const before = world.calls.length;

    const restarted = composition(t, world, { directory });
    const replay = await restarted.resumeOutcome("physical_cold_replay",
      injected());
    assert.equal(replay.workflowState, "NEEDS_DESTINATION");
    assert.equal(replay.programHash, initial.programHash);
    assert.equal(replay.candidateRoutingRequestHash,
      initial.candidateRoutingRequestHash);
    assert.equal(world.calls.length, before);
  });

test("fixed cable routes reject a semantically unrelated goal before external I/O",
  async (t) => {
    const world = fakeWorld();
    const product = composition(t, world);
    await assert.rejects(product.requestOutcome({
      ...request("physical_wrong_goal"),
      goal: "Install working Wi-Fi at my residence by Monday.",
    }, injected()), /GOAL_NOT_APPROVED_FIRST_PHYSICAL_MILESTONE/u);
    assert.equal(world.calls.length, 0);
  });

test("formation and every buyer-native source occurrence flow into injected data sinks",
  async (t) => {
    const world = fakeWorld();
    const formationEvents = [];
    const sourceOccurrences = [];
    const product = composition(t, world, {
      async formationEventSink(event) {
        formationEvents.push(event);
        return { schema:
          "outsider/outcome-product-formation-event-sink-receipt/v2",
        schemaVersion: "2.0.0", accepted: true,
        eventIdHash: event.eventIdHash, duplicateDelivery: false };
      },
      async buyerNativeSourceOccurrenceSink(result) {
        sourceOccurrences.push(result.publicProjection);
        return { schema:
          "outsider/buyer-native-transaction-source-occurrence-sink-receipt/v1",
        schemaVersion: "1.0.0", accepted: true,
        sourceOccurrenceHash:
          result.publicProjection.sourceOccurrenceHash,
        duplicateDelivery: false };
      },
    });
    const result = await product.requestOutcome(request("physical_data_sinks"),
      injected());
    assert.equal(result.workflowState, "NEEDS_DESTINATION");
    assert.equal(formationEvents.length, 1);
    assert.equal(sourceOccurrences.length, 8);
    assert.deepEqual([...new Set(sourceOccurrences.map((item) =>
      item.routeRole))].sort(),
    ["INDEPENDENT_WITNESS", "PRIMARY", "RECOVERY"]);
    assert.equal(sourceOccurrences.every((item) =>
      item.capacityReserved === false && item.paymentPerformed === false), true);
  });
