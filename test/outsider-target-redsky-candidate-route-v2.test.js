import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import { createTargetRedskyCandidateCommandBytesV1 } from "../src/outsider-target-redsky-candidate-route-v1.js";
import {
  createTargetRedskyBrowserEquivalentFetchV2,
  inspectTargetRedskyCandidateBuyerNativeCapabilityV2,
  issueTargetRedskyCandidateBuyerNativeCapabilityV2,
  materializeTargetRedskyFormationCandidateProjectionV2,
  OUTSIDER_TARGET_REDSKY_CANDIDATE_ROUTE_V2_BOUNDARY,
} from "../src/outsider-target-redsky-candidate-route-v2.js";

const NOW = "2026-09-04T15:00:00.000Z";
const EXPIRES = "2026-09-04T16:00:00.000Z";
const JOURNAL_ID = "transaction_abcdef1234567890abcdef1234567890";

function h(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function privateDirectory(t) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(), "outsider-target-redsky-v2-")));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function binding() {
  return {
    tcin: "91252434",
    quantity: 1,
    postalCode: "02446",
    state: "MA",
    pricingStoreId: "2822",
    fulfillmentStoreId: "2822",
    latitude: 42.343,
    longitude: -71.122,
    requestedDeliveryDate: "2026-09-10",
    maximumAmountMinor: "2000",
  };
}

function pdpSource() {
  return Buffer.from(JSON.stringify({ data: { product: {
    tcin: "91252434",
    free_shipping: { enabled: false },
    item: {
      primary_barcode: "810212674155",
      cart_add_on_threshold: 35,
      product_description: {
        title: "3&#39; USB-A to USB-C Cable - dealworthy&#8482; White",
        bullet_descriptions: [
          "<B>Weight:</B> .1 Pounds",
          "<B>Cable/Cord Length:</B> 3 Feet",
          "<B>Connection Type:</B> USB-C",
          "<B>Connection Gender:</B> Male-To-Male",
          "<B>Connection Types 2:</B> USB-A",
          "<B>Warranty:</B> 1 Year Limited Warranty",
        ],
        downstream_description: "Cable for charging and data transfer.",
        soft_bullets: { bullets: ["USB-A to USB-C cord"] },
      },
    },
    price: { current_retail: 5.99, formatted_current_price: "$5.99" },
  } } }), "utf8");
}

function fulfillmentSource() {
  return Buffer.from(JSON.stringify({ data: { product: {
    tcin: "91252434",
    pay_per_order_charges: { one_day: 7.99, scheduled_delivery: 9.99 },
    fulfillment: { shipping_options: {
      availability_status: "IN_STOCK",
      available_to_promise_quantity: 10,
      services: [{
        is_two_day_shipping: true,
        is_base_shipping_method: true,
        shipping_method_id: "STANDARD",
        cutoff: "2026-09-04T17:00:00Z",
        max_delivery_date: "2026-09-06",
        min_delivery_date: "2026-09-06",
        shipping_method_short_description: "Standard",
        service_level_description: "2-day shipping",
      }],
    } },
  } } }), "utf8");
}

function makeFetchWorld() {
  const world = { calls: [], pdp: pdpSource(), fulfillment: fulfillmentSource() };
  world.fetchImpl = async (url, init) => {
    world.calls.push({ url, init });
    const pathname = new URL(url).pathname;
    const body = pathname.endsWith("pdp_client_v1") ? world.pdp : world.fulfillment;
    return new Response(body, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  };
  return world;
}

function issue(world, directory) {
  return issueTargetRedskyCandidateBuyerNativeCapabilityV2({
    capabilityRefHash: h("target-v2-capability"),
    accountRefHash: h("target-public-web-route"),
    nodeRefHash: h("target-redsky-node"),
    orderRefHash: h("target-v2-order"),
    privateStateDirectory: directory,
    issuedAt: NOW,
    expiresAt: EXPIRES,
    ...binding(),
  }, {
    clock: () => NOW,
    fetchImpl: world.fetchImpl,
    async revalidateImpl(entry) {
      return {
        active: true,
        capabilityRefHash: entry.capabilityRefHash,
        accountRefHash: entry.accountRefHash,
        observedAt: entry.observedAt,
        expiresAt: EXPIRES,
      };
    },
    sourceOccurrenceSink: null,
  });
}

test("Target RedSky v2 repairs header drift and materializes a private-data-free formation projection", async (t) => {
  const directory = privateDirectory(t);
  const world = makeFetchWorld();
  const capability = issue(world, directory);
  assert.equal(OUTSIDER_TARGET_REDSKY_CANDIDATE_ROUTE_V2_BOUNDARY.descendsFrom,
    "outsider/target-redsky-candidate-route/v1");
  const inspection = inspectTargetRedskyCandidateBuyerNativeCapabilityV2(capability);
  assert.deepEqual(inspection.allowedEffects, ["GET_PUBLIC_PDP", "GET_PUBLIC_FULFILLMENT"]);

  const runtime = createBuyerNativeTransactionRouteRuntimeV1({
    journalDirectory: directory,
    journalId: JOURNAL_ID,
    transactionRefHash: h("target-v2-transaction"),
    outcomeIntentRefHash: h("fixed-cable-outcome"),
    routeRole: "RECOVERY",
    formationExpiresAt: EXPIRES,
  }, { capability, clock: () => NOW });
  const command = createTargetRedskyCandidateCommandBytesV1(binding());
  const quote = await runtime.quote({
    operationNonce: "target-v2-pdp-quote-0001",
    requestBytes: command,
    expiresAt: "2026-09-04T15:45:00.000Z",
    expectedPreviousOccurrenceHash: null,
    triggerOccurrenceHash: null,
  });
  const status = await runtime.status({
    operationNonce: "target-v2-fulfillment-0001",
    requestBytes: command,
    expiresAt: "2026-09-04T15:45:00.000Z",
    expectedPreviousOccurrenceHash: quote.publicProjection.sourceOccurrenceHash,
    triggerOccurrenceHash: null,
  });
  const quoteClaim = claimBuyerNativeTransactionSourceOccurrenceV1(quote);
  const statusClaim = claimBuyerNativeTransactionSourceOccurrenceV1(status);
  const projection = materializeTargetRedskyFormationCandidateProjectionV2({
    binding: binding(),
    observedAt: NOW,
    pdpSourceBytes: quoteClaim.sourceBytes,
    pdpSourceOccurrenceHash: quote.publicProjection.sourceOccurrenceHash,
    fulfillmentSourceBytes: statusClaim.sourceBytes,
    fulfillmentSourceOccurrenceHash: status.publicProjection.sourceOccurrenceHash,
  });

  assert.equal(world.calls.length, 2);
  for (const call of world.calls) {
    const headers = new Headers(call.init.headers);
    assert.equal(call.init.method, "GET");
    assert.equal(call.init.body, undefined);
    assert.equal(call.init.redirect, "manual");
    assert.equal(call.init.credentials, "omit");
    assert.equal(headers.get("accept"), "application/json");
    assert.equal(headers.get("origin"), "https://www.target.com");
    assert.equal(headers.get("referer"), "https://www.target.com/p/-/A-91252434");
    assert.match(headers.get("user-agent"), /^Mozilla\/5\.0 /u);
    assert.equal(headers.has("authorization"), false);
    assert.equal(headers.has("cookie"), false);
    assert.equal(new URL(call.url).protocol, "https:");
    assert.equal(new URL(call.url).hostname, "redsky.target.com");
    assert.doesNotMatch(new URL(call.url).pathname, /cart|checkout|payment|order/iu);
  }

  assert.equal(projection.product.unitPriceMinor, 599);
  assert.equal(projection.product.itemThresholdMinor, 3500);
  assert.equal(projection.product.standardShippingRouteState, "BUDGET_INFEASIBLE");
  assert.equal(projection.fulfillment.availabilityStatus, "IN_STOCK");
  assert.equal(projection.fulfillment.availableToPromiseQuantity, 10);
  assert.equal(projection.fulfillment.selectedSourceService.minDeliveryDate, "2026-09-06");
  assert.equal(projection.fulfillment.selectedSourceService.maxDeliveryDate, "2026-09-06");
  assert.equal(projection.fulfillment.sourceDateMeetsRequestedDeadline, true);
  assert.equal(projection.checkoutAccess.targetAccountRequired, true);
  assert.equal(projection.checkoutAccess.guestCheckoutAvailable, false);
  assert.equal(projection.priceBoundary.itemPlusScheduledDeliveryFeeBeforeTaxMinor, 1598);
  assert.equal(projection.formationDecision.commitEligible, false);
  assert.equal(projection.formationDecision.role, "OBSERVATION_ONLY");
  assert.equal(projection.privacyBoundary.postalCodeProjected, false);
  const publicText = JSON.stringify(projection);
  assert.doesNotMatch(publicText, /02446|42\.343|-71\.122|Longwood|@/u);
});

test("Target RedSky v2 public fetch refuses mutation and arbitrary paths before network I/O", async () => {
  let calls = 0;
  const targetFetch = createTargetRedskyBrowserEquivalentFetchV2(
    { tcin: "91252434" },
    { fetchImpl: async () => { calls += 1; return new Response("{}"); } },
  );
  await assert.rejects(
    targetFetch("https://redsky.target.com/cart?key=9f36aeafbe60771e321a7cc95a78140772ab3e96&tcin=91252434", {
      method: "POST", headers: { accept: "application/json" }, body: "{}",
      redirect: "manual", credentials: "omit",
    }),
    /public read paths/u,
  );
  await assert.rejects(
    targetFetch("https://example.com/redsky_aggregations/v1/web/pdp_client_v1?key=9f36aeafbe60771e321a7cc95a78140772ab3e96&tcin=91252434", {
      method: "GET", headers: { accept: "application/json" },
      redirect: "manual", credentials: "omit",
    }),
    /pinned HTTPS RedSky origin/u,
  );
  assert.equal(calls, 0);
});
