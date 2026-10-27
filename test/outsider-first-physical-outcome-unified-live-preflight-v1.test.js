import assert from "node:assert/strict";
import { chmodSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runFirstPhysicalOutcomeUnifiedLivePreflightV1 }
  from "../scripts/outsider-first-physical-outcome-unified-live-preflight-v1.mjs";

const NOW = "2026-09-04T16:00:00.000Z";
const COMPLETE = "2026-09-11T16:00:00.000Z";
const USER_DEADLINE = "2026-09-11T03:59:59.999Z";
const MASKED_CART = "maskedSparkFunCartForLivePreflight001";

function fixtureWorld() {
  let adafruitPresent = false;
  let sparkfunPresent = false;
  function response(body, contentType = "text/html", status = 200,
    headers = {}) {
    return new Response(status === 302 ? null
      : typeof body === "string" ? body : JSON.stringify(body), {
      status,
      headers: { "content-type": contentType,
        date: "Fri, 04 Sep 2026 16:00:00 GMT", ...headers },
    });
  }
  return async function fetchImpl(url, init) {
    const parsed = new URL(url);
    if (parsed.hostname === "www.adafruit.com") {
      if (parsed.pathname === "/product/4474") {
        return response(`<!doctype html><script type="application/ld+json">${JSON.stringify({
          "@context": "http://schema.org", "@type": "Product", sku: 4474,
          name: "USB Type A to Type C Cable - approx 1 meter / 3 ft long",
          offers: { "@type": "Offer", availability:
            "http://schema.org/InStock", price: "4.9500",
          priceCurrency: "USD" },
        })}</script><form action="/added" method="post"><input name="securityToken" value="adafruit-private-token"></form>`);
      }
      if (parsed.pathname === "/shopping_cart") {
        const row = adafruitPresent
          ? '<div role="row" class="cart-row" data-pid="4474" data-qty="1" data-price="4.95">item</div>'
          : "";
        return response(`<!doctype html>${row}<form action="/shopping_cart" method="post" data-empty-cart-confirm><input type="hidden" name="securityToken" value="cart-token"></form>`);
      }
      if (parsed.pathname === "/added") {
        adafruitPresent = true;
        return response(null, "text/html", 302, { location: url });
      }
    }
    if (parsed.hostname === "www.sparkfun.com") {
      if (parsed.pathname === "/usb-3-1-cable-a-to-c-3-foot.html") {
        const provider = { "*": {
          "Magento_Catalog/js/product/view/provider": { data: { items: {
            "4636": { id: 4636, name: "USB 3.1 Cable A to C - 3 Foot",
              price_info: { final_price: 7.95 }, currency_code: "USD",
              is_salable: "1", is_available: true },
          } } },
        } };
        const context = { productId: 4636, sku: "CAB-14743",
          updatedAt: "2025-05-08 18:25:57" };
        return response(`<!doctype html><script type="text/x-magento-init">${JSON.stringify(provider)}</script><script>magentoStorefrontEvents.context.setProduct(${JSON.stringify(context)})</script>`);
      }
      if (parsed.pathname === "/rest/V1/guest-carts"
        && init.method === "POST") {
        return response(JSON.stringify(MASKED_CART),
          "application/json; charset=utf-8");
      }
      if (parsed.pathname.endsWith("/items") && init.method === "POST") {
        sparkfunPresent = true;
        return response({ item_id: 2124971, sku: "CAB-14743", qty: 1,
          name: "USB 3.1 Cable A to C - 3 Foot", price: 7.95,
          product_type: "simple", quote_id: "2316323" },
        "application/json; charset=utf-8");
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
        ], "application/json; charset=utf-8");
      }
      if (parsed.pathname.endsWith("/totals-information")
        && init.method === "POST") {
        return response({ grand_total: 19.83, base_grand_total: 19.83,
          subtotal: 7.95, shipping_amount: 11.19, tax_amount: 0.69,
          items_qty: 1, base_currency_code: "USD",
          quote_currency_code: "USD" },
        "application/json; charset=utf-8");
      }
      if (/\/rest\/V1\/guest-carts\/[^/]+\/totals$/u.test(parsed.pathname)) {
        return response({ grand_total: sparkfunPresent ? 7.95 : 0,
          base_grand_total: sparkfunPresent ? 7.95 : 0,
          subtotal: sparkfunPresent ? 7.95 : 0, shipping_amount: 0,
          tax_amount: 0, items_qty: sparkfunPresent ? 1 : 0,
          base_currency_code: "USD", quote_currency_code: "USD" },
        "application/json; charset=utf-8");
      }
      if (/\/rest\/V1\/guest-carts\/[^/]+$/u.test(parsed.pathname)) {
        return response({ id: 2316323, is_active: true,
          items: sparkfunPresent ? [{ item_id: 2124971,
            sku: "CAB-14743", qty: 1,
            name: "USB 3.1 Cable A to C - 3 Foot", price: 7.95,
            product_type: "simple", quote_id: "2316323" }] : [],
          items_count: sparkfunPresent ? 1 : 0,
          items_qty: sparkfunPresent ? 1 : 0 },
        "application/json; charset=utf-8");
      }
    }
    if (parsed.hostname === "redsky.target.com" && init.method === "GET") {
      if (parsed.pathname.endsWith("/pdp_client_v1")) {
        return response({ data: { product: {
          tcin: "91252434", free_shipping: { enabled: false },
          item: { primary_barcode: "810212674155",
            cart_add_on_threshold: 35,
            product_description: {
              title: "3&#39; USB-A to USB-C Cable - dealworthy&#8482; White",
              bullet_descriptions: ["<B>Weight:</B> .1 Pounds",
                "<B>Cable/Cord Length:</B> 3 Feet",
                "<B>Connection Type:</B> USB-C",
                "<B>Connection Gender:</B> Male-To-Male",
                "<B>Connection Types 2:</B> USB-A",
                "<B>Warranty:</B> 1 Year Limited Warranty"],
              downstream_description:
                "USB-A to USB-C cord for charging and data transfer.",
              soft_bullets: { bullets: ["USB-A to USB-C cord"] },
            } },
          price: { current_retail: 5.99,
            formatted_current_price: "$5.99" },
        } } }, "application/json; charset=utf-8");
      }
      if (parsed.pathname.endsWith("/product_fulfillment_v1")) {
        return response({ data: { product: {
          tcin: "91252434",
          pay_per_order_charges: { one_day: 7.99,
            scheduled_delivery: 9.99 },
          fulfillment: { shipping_options: {
            availability_status: "IN_STOCK",
            available_to_promise_quantity: 10,
            services: [{ is_two_day_shipping: true,
              is_base_shipping_method: true,
              shipping_method_id: "STANDARD",
              cutoff: "2026-09-04T17:00:00Z",
              max_delivery_date: "2026-09-06",
              min_delivery_date: "2026-09-06",
              shipping_method_short_description: "Standard",
              service_level_description: "2-day shipping" }],
          } },
        } } }, "application/json; charset=utf-8");
      }
    }
    throw new Error(`unexpected ${init.method} ${url}`);
  };
}

function sourceProjectionText(root) {
  const chunks = [];
  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()
        && path.basename(directory) === "occurrences"
        && /^\d{8}\.json$/u.test(entry.name)) {
        chunks.push(readFileSync(absolute, "utf8"));
      }
    }
  }
  visit(root);
  return chunks.join("\n");
}

test("private v2 destination request reaches postal rates and totals without projecting destination or crossing payment",
  async (t) => {
    const privateRoot = mkdtempSync(path.join(tmpdir(),
      "outsider-unified-destination-runner-"));
    chmodSync(privateRoot, 0o700);
    t.after(() => rmSync(privateRoot, { recursive: true, force: true }));
    const output = await runFirstPhysicalOutcomeUnifiedLivePreflightV1({
      mode: "FIXTURE", fetchImpl: fixtureWorld(), privateRoot,
      now: NOW,
      privateFormationRequest: {
        schema:
          "outsider/private-first-physical-outcome-destination-formation-request/v2",
        schemaVersion: "2.0.0",
        destination: { countryCode: "US", postalCode: "02446",
          regionId: null, region: "MA", city: "Brookline" },
        budget: { currency: "USD", maximumAmountMinor: "2000" },
        completionDeadline: USER_DEADLINE,
        paymentAuthorized: false,
        orderAuthorized: false,
      },
    });
    const summary = output.publicSummary;
    assert.equal(summary.runState, "COMPLETED_HOLD");
    assert.equal(summary.workflowState,
      "NEEDS_FULL_ADDRESS_DELIVERABILITY_AND_ETA");
    assert.equal(summary.completionDeadline, USER_DEADLINE);
    assert.equal(summary.privateDestinationFormationUsed, true);
    assert.equal(summary.rawDestinationProjected, false);
    assert.equal(summary.sourceOccurrences.sourceOccurrenceCount, 16);
    assert.equal(summary.sourceOccurrences
      .buyerNativeTransactionOccurrenceCount, 15);
    assert.equal(summary.realSellerHttp.attemptCount, 19);
    assert.equal(summary.realSellerHttp.nonGetAttemptCount, 5);
    assert.equal(summary.realSellerHttp
      .byProviderAndMethod["redsky.target.com:GET"], 2);
    assert.equal(summary.parallelUnselectedCandidateRoutes.length, 2);
    assert.equal(summary.parallelUnselectedCandidateRoutes[0]
      .selectedForAtomicSlot, false);
    assert.equal(summary.parallelUnselectedCandidateRoutes[0]
      .standardShippingRouteState, "BUDGET_INFEASIBLE");
    assert.equal(summary.parallelUnselectedCandidateRoutes[0]
      .sameDayRouteState, "ACCOUNT_AUTHORITY_REQUIRED");
    assert.equal(summary.parallelUnselectedCandidateRoutes[0]
      .exactAcceptanceSatisfied, false);
    assert.equal(summary.parallelUnselectedCandidateRoutes[1]
      .provider, "BEST_BUY_US_WEB_SOURCE_PINNED_CANDIDATE");
    assert.equal(summary.parallelUnselectedCandidateRoutes[1]
      .surplusAuthorizationRequired, true);
    assert.equal(summary.parallelUnselectedCandidateRoutes[1]
      .surplusAuthorizationPresent, false);
    assert.equal(summary.parallelUnselectedCandidateRoutes[1]
      .displayedAllInTotalMinor, 955);
    assert.equal(summary.parallelUnselectedCandidateRoutes[1]
      .sourceDateMeetsRequestedDeadline, true);
    assert.equal(summary.parallelUnselectedCandidateRoutes[1]
      .commitEligible, false);
    assert.equal(summary.paymentAttempted, false);
    assert.equal(summary.checkoutAttempted, false);
    assert.equal(summary.orderSubmitted, false);
    assert.equal(summary.outcomePromiseIssued, false);
    assert.equal(summary.nextGate,
      "AUTHORIZED_FULL_ADDRESS_FOR_DELIVERABILITY_TAX_AND_DEADLINE_FORMATION");
    const publicBytes = readFileSync(path.join(output.evidenceDirectory,
      "public-summary.json"), "utf8");
    const projections = sourceProjectionText(path.join(
      output.evidenceDirectory, "runtime"));
    for (const privateValue of ["02446", "Brookline", '"region":"MA"']) {
      assert.equal(publicBytes.includes(privateValue), false);
      assert.equal(projections.includes(privateValue), false);
    }
  });

test("unified live preflight runner preserves a private no-payment HOLD evidence set",
  async (t) => {
    const privateRoot = mkdtempSync(path.join(tmpdir(),
      "outsider-unified-live-runner-"));
    chmodSync(privateRoot, 0o700);
    t.after(() => rmSync(privateRoot, { recursive: true, force: true }));
    const output = await runFirstPhysicalOutcomeUnifiedLivePreflightV1({
      mode: "FIXTURE", fetchImpl: fixtureWorld(), privateRoot,
      now: NOW, completionDeadline: COMPLETE,
    });
    const summary = output.publicSummary;
    assert.equal(summary.executionMode, "FIXTURE");
    assert.equal(summary.runState, "COMPLETED_HOLD");
    assert.equal(summary.workflowState, "NEEDS_DESTINATION",
      JSON.stringify(summary.sourceOccurrences.byRoleOperationAndState));
    assert.equal(summary.modelComputeFoundationConnected, true);
    assert.equal(summary.autonomousWorkOrderTypedGraphConnected, true);
    assert.equal(summary.buyerNativeExecutionConnected, true);
    assert.equal(summary.attemptCount, 1);
    assert.equal(summary.sourceOccurrences.sourceOccurrenceCount, 9);
    assert.equal(summary.sourceOccurrences.productFormationOccurrenceCount, 1);
    assert.equal(summary.sourceOccurrences
      .buyerNativeTransactionOccurrenceCount, 8);
    assert.equal(summary.sourceOccurrences
      .byRoleOperationAndState["PRIMARY:HOLD:CART_READY"], 1);
    assert.equal(summary.sourceOccurrences
      .byRoleOperationAndState["RECOVERY:HOLD:CART_READY"], 1);
    assert.equal(summary.sourceOccurrences
      .byRoleOperationAndState["INDEPENDENT_WITNESS:QUOTE:QUOTE_AVAILABLE"], 1);
    assert.equal(summary.realSellerHttp.attemptCount, 13);
    assert.equal(summary.realSellerHttp.nonGetAttemptCount, 3);
    assert.equal(summary.candidateWitnessExternalRequestCount, 0);
    assert.equal(summary.capacityReserved, false);
    assert.equal(summary.independentOutcomeEstablished, false);
    assert.equal(summary.paymentAttempted, false);
    assert.equal(summary.checkoutAttempted, false);
    assert.equal(summary.orderSubmitted, false);
    assert.equal(summary.outcomePromiseIssued, false);
    assert.equal(summary.failureCode, null);
    assert.ok(summary.evidencePayloadFileCount > 20);
    assert.ok(summary.evidencePayloadBytes > 1_000);
    assert.match(summary.evidencePayloadSetHash, /^sha256:[a-f0-9]{64}$/u);
    assert.equal(lstatSync(output.evidenceDirectory).mode & 0o777, 0o700);
    for (const filename of ["unified-result.json", "evidence-inventory.json",
      "public-summary.json"]) {
      assert.equal(statSync(path.join(output.evidenceDirectory, filename)).mode
        & 0o777, 0o600);
    }
    const summaryBytes = readFileSync(path.join(output.evidenceDirectory,
      "public-summary.json"));
    assert.equal(summaryBytes.length, output.publicSummaryFileBytes);
  });
