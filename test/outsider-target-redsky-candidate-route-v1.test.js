import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  createTargetRedskyCandidateCommandBytesV1,
  inspectTargetRedskyCandidateBuyerNativeCapabilityV1,
  issueTargetRedskyCandidateBuyerNativeCapabilityV1,
  normalizeTargetRedskyFulfillmentSourceV1,
  normalizeTargetRedskyPdpSourceV1,
} from "../src/outsider-target-redsky-candidate-route-v1.js";

const NOW = "2026-09-04T15:00:00.000Z";
const EXPIRES = "2026-09-04T16:00:00.000Z";
const JOURNAL_ID = "transaction_1234567890abcdef1234567890abcdef";

function h(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function privateDirectory(t) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-target-redsky-candidate-")));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function pdpSource(claim = "charging and data transfer") {
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
        downstream_description: `Cable for ${claim}.`,
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

function binding() {
  return {
    tcin: "91252434", quantity: 1, postalCode: "02446", state: "MA",
    pricingStoreId: "2822", fulfillmentStoreId: "2822",
    latitude: 42.343, longitude: -71.122,
    requestedDeliveryDate: "2026-09-10", maximumAmountMinor: "2000",
  };
}

function capability(world) {
  return issueTargetRedskyCandidateBuyerNativeCapabilityV1({
    capabilityRefHash: h("target-capability"),
    accountRefHash: h("target-public-web-route"),
    nodeRefHash: h("target-redsky-node"),
    issuedAt: NOW, expiresAt: EXPIRES, ...binding(),
  }, {
    async httpsRequestImpl(request) {
      world.calls.push(request);
      const source = request.step === "PDP_QUOTE_GET"
        ? world.pdp : world.fulfillment;
      return {
        status: 200,
        headers: { get(name) {
          return name.toLowerCase() === "content-type"
            ? "application/json; charset=utf-8" : null;
        } },
        bodyBytes: Buffer.from(source),
        finalUrl: request.url,
      };
    },
    async revalidateImpl(entry) {
      return { active: true, capabilityRefHash: entry.capabilityRefHash,
        accountRefHash: entry.accountRefHash, observedAt: entry.observedAt,
        expiresAt: EXPIRES };
    },
  });
}

test("Target PDP quote and RedSky postal status preserve exact source bytes without mutations",
  async (t) => {
    const world = { calls: [], pdp: pdpSource(),
      fulfillment: fulfillmentSource() };
    const issued = capability(world);
    const directory = privateDirectory(t);
    const runtime = createBuyerNativeTransactionRouteRuntimeV1({
      journalDirectory: directory, journalId: JOURNAL_ID,
      transactionRefHash: h("target-candidate-transaction"),
      outcomeIntentRefHash: h("fixed-cable-outcome"),
      routeRole: "RECOVERY", formationExpiresAt: EXPIRES,
    }, { capability: issued, clock: () => NOW });
    const command = createTargetRedskyCandidateCommandBytesV1(binding());
    const quote = await runtime.quote({
      operationNonce: "target-pdp-quote-0001", requestBytes: command,
      expiresAt: "2026-09-04T15:45:00.000Z",
      expectedPreviousOccurrenceHash: null, triggerOccurrenceHash: null,
    });
    const quoteClaim = claimBuyerNativeTransactionSourceOccurrenceV1(quote);
    assert.deepEqual(quoteClaim.sourceBytes, world.pdp);
    const product = normalizeTargetRedskyPdpSourceV1(
      quoteClaim.sourceBytes, { tcin: "91252434", quantity: 1,
        maximumAmountMinor: "2000" });
    assert.equal(product.unitPriceMinor, 599);
    assert.equal(product.lengthMeters, 0.9144000000000001);
    assert.equal(product.dataTransferClaimed, true);
    assert.equal(product.voltageExplicitlyStatedBySeller, false);
    assert.equal(product.exactAcceptanceSatisfied, false);
    assert.deepEqual(product.blockingAcceptanceGaps,
      ["EXPLICIT_5V_SOURCE_STATEMENT_MISSING"]);
    assert.equal(product.shippingMinimumMet, false);
    assert.equal(product.standardShippingBudgetFeasible, false);
    assert.equal(product.standardShippingRouteState, "BUDGET_INFEASIBLE");
    assert.equal(quote.publicProjection.capacityReserved, false);

    const status = await runtime.status({
      operationNonce: "target-postal-status-0001", requestBytes: command,
      expiresAt: "2026-09-04T15:45:00.000Z",
      expectedPreviousOccurrenceHash:
        quote.publicProjection.sourceOccurrenceHash,
      triggerOccurrenceHash: null,
    });
    const statusClaim = claimBuyerNativeTransactionSourceOccurrenceV1(status);
    assert.deepEqual(statusClaim.sourceBytes, world.fulfillment);
    const fulfillment = normalizeTargetRedskyFulfillmentSourceV1(
      statusClaim.sourceBytes, { tcin: "91252434", quantity: 1,
        requestedDeliveryDate: "2026-09-10" });
    assert.equal(fulfillment.sourceAvailability, "IN_STOCK");
    assert.equal(fulfillment.sourceAvailableToPromiseQuantity, 10);
    assert.equal(fulfillment.sourceAtpSatisfiesQuantity, true);
    assert.equal(fulfillment.sourceDateMeetsRequestedDeadline, true);
    assert.equal(fulfillment.capacityReserved, false);
    assert.equal(fulfillment.deliveryDeadlineProven, false);
    assert.equal(status.publicProjection.sourceState, "STATE_OBSERVED");
    assert.equal(status.publicProjection.capacityReserved, false);

    assert.equal(world.calls.length, 2);
    assert.equal(world.calls.every((call) => call.method === "GET"), true);
    assert.equal(world.calls.every((call) => call.bodyBytes === null), true);
    assert.equal(world.calls.some((call) =>
      /cart|checkout|payment|order/iu.test(new URL(call.url).pathname)), false);
    assert.deepEqual(world.calls.map((call) => new URL(call.url).hostname),
      ["redsky.target.com", "redsky.target.com"]);
    const privateSources = readdirSync(path.join(directory,
      `${JOURNAL_ID}.responses`)).filter((file) =>
      file.endsWith(".source-v2.bin"));
    assert.equal(privateSources.length, 2);
    for (const file of privateSources) {
      assert.equal(statSync(path.join(directory, `${JOURNAL_ID}.responses`,
        file)).mode & 0o077, 0);
      assert.ok([world.pdp, world.fulfillment].some((source) =>
        readFileSync(path.join(directory, `${JOURNAL_ID}.responses`, file))
          .equals(source)));
    }
    const inspected = inspectTargetRedskyCandidateBuyerNativeCapabilityV1(
      issued);
    assert.equal(inspected.candidateOnly, true);
    assert.equal(inspected.cartEnabled, false);
    assert.equal(inspected.orderSubmissionEnabled, false);
  });

test("an explicit seller 5 V statement is the field that closes the product-spec gap",
  () => {
    const withoutVoltage = normalizeTargetRedskyPdpSourceV1(pdpSource(), {
      tcin: "91252434", quantity: 1, maximumAmountMinor: "2000",
    });
    const withVoltage = normalizeTargetRedskyPdpSourceV1(
      pdpSource("charging, 5 V power, and data transfer"), {
        tcin: "91252434", quantity: 1, maximumAmountMinor: "2000",
      });
    assert.equal(withoutVoltage.exactAcceptanceSatisfied, false);
    assert.equal(withVoltage.voltageExplicitlyStatedBySeller, true);
    assert.equal(withVoltage.exactAcceptanceSatisfied, true);
  });

test("source normalizers fail closed on a different product identity", () => {
  const source = JSON.parse(pdpSource().toString("utf8"));
  source.data.product.tcin = "00000000";
  assert.throws(() => normalizeTargetRedskyPdpSourceV1(
    Buffer.from(JSON.stringify(source)), {
      tcin: "91252434", quantity: 1, maximumAmountMinor: "2000",
    }), /PDP_PRODUCT_BINDING_INVALID/u);
});
