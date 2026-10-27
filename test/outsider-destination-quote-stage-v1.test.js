import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, realpathSync, rmSync, statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  OUTSIDER_ADAFRUIT_DESTINATION_QUOTE_READINESS_V1,
} from "../src/outsider-adafruit-destination-quote-readiness-v1.js";
import {
  OUTSIDER_SPARKFUN_MAGENTO_DESTINATION_QUOTE_STAGE_V1_BOUNDARY,
  createSparkFunMagentoDestinationQuoteCommandBytesV1,
  inspectSparkFunMagentoDestinationQuoteCapabilityV1,
  issueSparkFunMagentoDestinationQuoteCapabilityV1,
  issueSparkFunPrivatePostalDestinationQuoteGrantV1,
} from "../src/outsider-sparkfun-magento-destination-quote-stage-v1.js";

const NOW = "2026-09-04T14:00:00.000Z";
const OPERATION_EXPIRY = "2026-09-04T14:30:00.000Z";
const FORMATION_EXPIRY = "2026-09-04T14:45:00.000Z";
const CAPABILITY_EXPIRY = "2026-09-04T15:00:00.000Z";
const DESTINATION_EXPIRY = "2026-09-04T15:15:00.000Z";
const MASKED_CART_ID = "maskedSparkFunCartSecret123456";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function privateDirectory(t) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-destination-quote-")));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function response(request, body) {
  return {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8",
      date: "Fri, 04 Sep 2026 14:00:00 GMT" },
    bodyBytes: Buffer.from(JSON.stringify(body), "utf8"),
    finalUrl: request.url,
  };
}

function cart() {
  return {
    id: 2316323,
    is_active: true,
    items: [{ item_id: 2124971, sku: "CAB-14743", qty: 1,
      name: "USB 3.1 Cable A to C - 3 Foot", price: 7.95,
      product_type: "simple", quote_id: "2316323" }],
    items_count: 1,
    items_qty: 1,
  };
}

function privateCartState(key) {
  return {
    schema: "outsider/sparkfun-magento-private-guest-cart-state/v1",
    schemaVersion: "1.0.0",
    provider: "SPARKFUN_MAGENTO_GUEST_CART",
    sessionRefHash: key,
    productId: "4636",
    sku: "CAB-14743",
    quantity: 1,
    maskedCartId: MASKED_CART_ID,
    itemId: 2124971,
  };
}

function operation(label, requestBytes, previous = null) {
  return {
    operationNonce: `destination-${label}-000000000001`,
    requestBytes,
    expiresAt: OPERATION_EXPIRY,
    expectedPreviousOccurrenceHash: previous,
    triggerOccurrenceHash: null,
  };
}

function destinationGrant() {
  return issueSparkFunPrivatePostalDestinationQuoteGrantV1({
    destinationRefHash: h("destination"),
    authorizedAt: "2026-09-04T13:55:00.000Z",
    expiresAt: DESTINATION_EXPIRY,
    countryCode: "US",
    postalCode: "10001",
    regionId: 43,
    region: "New York",
    city: "New York",
  });
}

function capability(grant, httpsRequestImpl, loadPrivateCartStateImpl) {
  return issueSparkFunMagentoDestinationQuoteCapabilityV1({
    capabilityRefHash: h("capability"),
    accountRefHash: h("account"),
    nodeRefHash: h("node"),
    issuedAt: NOW,
    expiresAt: CAPABILITY_EXPIRY,
    productId: "4636",
    sku: "CAB-14743",
    quantity: 1,
    destinationGrant: grant,
  }, {
    httpsRequestImpl,
    loadPrivateCartStateImpl,
    revalidateImpl(input) {
      return { active: true,
        capabilityRefHash: input.capabilityRefHash,
        accountRefHash: input.accountRefHash,
        observedAt: input.observedAt,
        expiresAt: CAPABILITY_EXPIRY };
    },
  });
}

test("SparkFun postal grant drives real shipping-rate and landed-total endpoints without order/payment",
  async (t) => {
    const requests = [];
    const grant = destinationGrant();
    const selected = capability(grant, async (request) => {
      requests.push(request);
      assert.equal(/payment-information|\/order(?:$|\/)|guest-carts$/u
        .test(request.url), false);
      if (request.step === "CART_PREFLIGHT_GET") {
        assert.equal(request.method, "GET");
        return response(request, cart());
      }
      if (request.step === "SHIPPING_RATE_ESTIMATE_POST") {
        assert.equal(request.method, "POST");
        assert.deepEqual(JSON.parse(request.bodyBytes.toString("utf8")), {
          address: { city: "New York", country_id: "US",
            postcode: "10001", region: "New York", region_id: 43 },
        });
        return response(request, [
          { carrier_code: "ups", method_code: "03",
            carrier_title: "UPS", method_title: "Ground",
            amount: 11.19, base_amount: 11.19, available: true,
            error_message: "", price_excl_tax: 11.19,
            price_incl_tax: 11.19,
            extension_attributes: { tooltip: "Carrier estimate" } },
          { carrier_code: "ups", method_code: "02",
            carrier_title: "UPS", method_title: "Second Day Air",
            amount: 28.79, base_amount: 28.79, available: true,
            error_message: "", price_excl_tax: 28.79,
            price_incl_tax: 28.79 },
        ]);
      }
      if (request.step === "LANDED_TOTAL_ESTIMATE_POST") {
        assert.equal(request.method, "POST");
        assert.deepEqual(JSON.parse(request.bodyBytes.toString("utf8")), {
          addressInformation: {
            address: { city: "New York", countryId: "US",
              postcode: "10001", region: "New York", regionId: 43 },
            shipping_carrier_code: "ups",
            shipping_method_code: "03",
          },
        });
        return response(request, {
          grand_total: 19.83,
          base_grand_total: 19.83,
          subtotal: 7.95,
          shipping_amount: 11.19,
          tax_amount: 0.69,
          items_qty: 1,
          base_currency_code: "USD",
          quote_currency_code: "USD",
        });
      }
      throw new Error(`unexpected step ${request.step}`);
    }, async (key) => privateCartState(key));

    const directory = privateDirectory(t);
    const runtime = createBuyerNativeTransactionRouteRuntimeV1({
      journalDirectory: directory,
      journalId: `transaction_${createHash("md5")
        .update("destination quote").digest("hex")}`,
      transactionRefHash: h("transaction"),
      outcomeIntentRefHash: h("outcome"),
      routeRole: "PRIMARY",
      formationExpiresAt: FORMATION_EXPIRY,
    }, { capability: selected, clock: () => NOW });

    const ratesBytes = createSparkFunMagentoDestinationQuoteCommandBytesV1(
      selected, { stage: "SHIPPING_RATES", selectedCarrierCode: null,
        selectedMethodCode: null, previousQuoteOccurrenceHash: null });
    const rates = await runtime.quote(operation("rates", ratesBytes));
    assert.equal(rates.publicProjection.sourceState, "QUOTE_AVAILABLE");
    assert.equal(rates.publicProjection.capacityReserved, false);
    assert.equal(rates.publicProjection.paymentPerformed, false);
    assert.equal(JSON.stringify(rates).includes("10001"), false);
    assert.equal(JSON.stringify(rates).includes(MASKED_CART_ID), false);
    const ratesClaim = claimBuyerNativeTransactionSourceOccurrenceV1(rates);
    const ratesReceipt = JSON.parse(ratesClaim.sourceBytes.toString("utf8"));
    assert.equal(ratesReceipt.lifecycleState,
      "DESTINATION_SHIPPING_RATES_ESTIMATED_HOLD");
    assert.equal(ratesReceipt.normalized.availableRateCount, 2);
    assert.equal(ratesReceipt.normalized.rates[0]
      .structuredEtaPresentInMagentoCoreContract, false);
    assert.deepEqual(ratesReceipt.normalized.rates[0].extensionAttributeKeys,
      ["tooltip"]);
    const privateRateRequest = JSON.parse(Buffer.from(
      ratesReceipt.exchanges[1].requestBodyBase64, "base64").toString("utf8"));
    assert.equal(privateRateRequest.address.postcode, "10001");

    const previous = rates.publicProjection.sourceOccurrenceHash;
    const totalsBytes = createSparkFunMagentoDestinationQuoteCommandBytesV1(
      selected, { stage: "LANDED_TOTALS_ESTIMATE",
        selectedCarrierCode: "ups", selectedMethodCode: "03",
        previousQuoteOccurrenceHash: previous });
    const totals = await runtime.quote(operation("totals", totalsBytes,
      previous));
    assert.equal(totals.publicProjection.sourceState, "QUOTE_AVAILABLE");
    assert.equal(totals.publicProjection.capacityReserved, false);
    assert.equal(totals.publicProjection.userResultCommitted, false);
    const totalsClaim = claimBuyerNativeTransactionSourceOccurrenceV1(totals);
    const totalsReceipt = JSON.parse(totalsClaim.sourceBytes.toString("utf8"));
    assert.equal(totalsReceipt.lifecycleState,
      "DESTINATION_LANDED_TOTALS_ESTIMATED_HOLD");
    assert.equal(totalsReceipt.normalized.totals.grandTotal, 19.83);
    assert.equal(totalsReceipt.normalized.totals.taxAmount, 0.69);
    assert.equal(totalsReceipt.normalized.totals.taxEstimateFinal, false);
    assert.equal(totalsReceipt.deliveryDeadlineProven, false);
    assert.deepEqual(requests.map((request) => request.step), [
      "CART_PREFLIGHT_GET", "SHIPPING_RATE_ESTIMATE_POST",
      "CART_PREFLIGHT_GET", "LANDED_TOTAL_ESTIMATE_POST",
    ]);
    assert.equal(requests.every((request) => request.url.startsWith(
      `https://www.sparkfun.com/rest/V1/guest-carts/${MASKED_CART_ID}`)), true);
    assert.equal((statSync(directory).mode & 0o077), 0);

    const inspected = inspectSparkFunMagentoDestinationQuoteCapabilityV1(
      selected);
    assert.equal(inspected.rawDestinationProjected, false);
    assert.equal(inspected.paymentEnabled, false);
    assert.equal(inspected.orderSubmissionEnabled, false);
  });

test("quote stage is disabled without a factory-issued destination and cannot skip rate ancestry",
  async () => {
    let called = false;
    const dependency = async () => { called = true; throw new Error("no"); };
    assert.throws(() => capability(Object.freeze({}), dependency, dependency),
      /DESTINATION_GRANT_NOT_FACTORY_ISSUED/u);
    assert.equal(called, false);

    const grant = destinationGrant();
    const selected = capability(grant, dependency, dependency);
    assert.throws(() => createSparkFunMagentoDestinationQuoteCommandBytesV1(
      selected, { stage: "LANDED_TOTALS_ESTIMATE",
        selectedCarrierCode: "ups", selectedMethodCode: "03",
        previousQuoteOccurrenceHash: null }),
    /LANDED_TOTALS_RATE_ANCESTOR_REQUIRED/u);
    assert.throws(() => createSparkFunMagentoDestinationQuoteCommandBytesV1(
      selected, { stage: "SHIPPING_RATES", selectedCarrierCode: "ups",
        selectedMethodCode: "03", previousQuoteOccurrenceHash: null }),
    /SHIPPING_RATES_SELECTION_FORBIDDEN/u);
    assert.equal(called, false);
  });

test("source boundaries report the honest Adafruit blocker and postal-estimate semantics",
  () => {
    assert.deepEqual(
      OUTSIDER_SPARKFUN_MAGENTO_DESTINATION_QUOTE_STAGE_V1_BOUNDARY
        .minimumShippingRateDestinationFields,
      ["countryCode", "postalCode"]);
    assert.equal(
      OUTSIDER_SPARKFUN_MAGENTO_DESTINATION_QUOTE_STAGE_V1_BOUNDARY
        .standardMagentoStructuredEtaField,
      false);
    assert.equal(
      OUTSIDER_SPARKFUN_MAGENTO_DESTINATION_QUOTE_STAGE_V1_BOUNDARY
        .postalTaxEstimateFinal,
      false);
    assert.equal(OUTSIDER_ADAFRUIT_DESTINATION_QUOTE_READINESS_V1
      .emailRequiredBeforeAddressStep, true);
    assert.equal(OUTSIDER_ADAFRUIT_DESTINATION_QUOTE_READINESS_V1
      .quoteAdapterImplemented, false);
    assert.equal(OUTSIDER_ADAFRUIT_DESTINATION_QUOTE_READINESS_V1
      .paymentImplemented, false);
    assert.equal(OUTSIDER_ADAFRUIT_DESTINATION_QUOTE_READINESS_V1
      .orderSubmissionImplemented, false);
  });
