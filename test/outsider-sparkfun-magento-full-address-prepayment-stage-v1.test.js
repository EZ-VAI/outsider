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
  OUTSIDER_SPARKFUN_MAGENTO_FULL_ADDRESS_PREPAYMENT_STAGE_V1_BOUNDARY,
  createSparkFunMagentoFullAddressPrepaymentCommandBytesV1,
  inspectSparkFunMagentoFullAddressPrepaymentCapabilityV1,
  issueSparkFunMagentoFullAddressPrepaymentCapabilityV1,
  issueSparkFunPrivateFullAddressPrepaymentGrantV1,
} from "../src/outsider-sparkfun-magento-full-address-prepayment-stage-v1.js";

const NOW = "2026-09-04T14:00:00.000Z";
const OPERATION_EXPIRY = "2026-09-04T14:30:00.000Z";
const FORMATION_EXPIRY = "2026-09-04T14:45:00.000Z";
const CAPABILITY_EXPIRY = "2026-09-04T15:00:00.000Z";
const DESTINATION_EXPIRY = "2026-09-04T15:15:00.000Z";
const MASKED_CART_ID = "maskedSparkFunPrepaymentCart001";
const FAKE_STREET = "100 Example Integration Way";
const FAKE_EMAIL = "route-test@example.invalid";
const FAKE_TELEPHONE = "+1 555 010 4242";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function privateDirectory(t) {
  const directory = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-sparkfun-prepayment-")));
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

function rates() {
  return [{
    carrier_code: "ups",
    method_code: "03",
    carrier_title: "UPS",
    method_title: "Ground",
    amount: 11.19,
    base_amount: 11.19,
    available: true,
    error_message: "",
    price_excl_tax: 11.19,
    price_incl_tax: 11.19,
    extension_attributes: { checkout_tooltip: "Source text, not ETA" },
  }, {
    carrier_code: "ups",
    method_code: "02",
    carrier_title: "UPS",
    method_title: "Second Day Air",
    amount: 28.79,
    base_amount: 28.79,
    available: true,
    error_message: "",
    price_excl_tax: 28.79,
    price_incl_tax: 28.79,
  }];
}

function totals() {
  return {
    grand_total: 19.83,
    base_grand_total: 19.83,
    subtotal: 7.95,
    shipping_amount: 11.19,
    tax_amount: 0.69,
    items_qty: 1,
    base_currency_code: "USD",
    quote_currency_code: "USD",
    extension_attributes: { reward_points_balance: 0 },
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

function grant() {
  return issueSparkFunPrivateFullAddressPrepaymentGrantV1({
    destinationRefHash: h("private destination"),
    authorizedAt: "2026-09-04T13:55:00.000Z",
    expiresAt: DESTINATION_EXPIRY,
    firstName: "Integration",
    lastName: "Recipient",
    email: FAKE_EMAIL,
    telephone: FAKE_TELEPHONE,
    countryCode: "US",
    regionId: 25,
    region: "Massachusetts",
    regionCode: "MA",
    city: "Cambridge",
    postalCode: "02139",
    streetLines: [FAKE_STREET, "Unit Test 2"],
  });
}

function capability(destinationGrant, httpsRequestImpl) {
  return issueSparkFunMagentoFullAddressPrepaymentCapabilityV1({
    capabilityRefHash: h("prepayment capability"),
    accountRefHash: h("sparkfun guest account"),
    nodeRefHash: h("buyer execution node"),
    issuedAt: NOW,
    expiresAt: CAPABILITY_EXPIRY,
    productId: "4636",
    sku: "CAB-14743",
    quantity: 1,
    destinationGrant,
  }, {
    httpsRequestImpl,
    async loadPrivateCartStateImpl(key) { return privateCartState(key); },
    async revalidateImpl(input) {
      return { active: true,
        capabilityRefHash: input.capabilityRefHash,
        accountRefHash: input.accountRefHash,
        observedAt: input.observedAt,
        expiresAt: CAPABILITY_EXPIRY };
    },
  });
}

function operation(label, requestBytes, previous = null) {
  return {
    operationNonce: `sparkfun-prepayment-${label}-00000001`,
    requestBytes,
    expiresAt: OPERATION_EXPIRY,
    expectedPreviousOccurrenceHash: previous,
    triggerOccurrenceHash: null,
  };
}

test("SparkFun machine route applies a private full address and shipping method through READY_FOR_PAYMENT_AUTHORIZATION without payment or order",
  async (t) => {
    const requests = [];
    const destinationGrant = grant();
    const selected = capability(destinationGrant, async (request) => {
      requests.push(request);
      assert.equal(request.url.includes("payment-information"), false);
      assert.equal(/\/orders?(?:$|[/?])/u.test(request.url), false);
      if (["CART_PREFLIGHT_GET",
        "CART_GET_AFTER_SHIPPING_SELECTION"].includes(request.step)) {
        assert.equal(request.method, "GET");
        return response(request, cart());
      }
      if (["FULL_ADDRESS_SHIPPING_RATE_ESTIMATE_POST",
        "FULL_ADDRESS_SHIPPING_RATE_REVALIDATE_POST"].includes(request.step)) {
        assert.equal(request.method, "POST");
        const body = JSON.parse(request.bodyBytes.toString("utf8"));
        assert.deepEqual(body.address.street,
          [FAKE_STREET, "Unit Test 2"]);
        assert.equal(body.address.email, FAKE_EMAIL);
        assert.equal(body.address.country_id, "US");
        assert.equal(body.address.region_code, "MA");
        return response(request, rates());
      }
      if (request.step === "SHIPPING_INFORMATION_POST") {
        assert.equal(request.method, "POST");
        assert.match(request.url, /\/shipping-information$/u);
        const body = JSON.parse(request.bodyBytes.toString("utf8"));
        assert.equal(body.addressInformation.shipping_carrier_code, "ups");
        assert.equal(body.addressInformation.shipping_method_code, "03");
        assert.deepEqual(body.addressInformation.shipping_address,
          body.addressInformation.billing_address);
        assert.equal(body.addressInformation.shipping_address.telephone,
          FAKE_TELEPHONE);
        return response(request, {
          payment_methods: [
            { code: "braintree", title: "Credit Card" },
            { code: "paypal_express", title: "PayPal" },
          ],
          totals: totals(),
        });
      }
      if (request.step === "TOTALS_GET_AFTER_SHIPPING_SELECTION") {
        assert.equal(request.method, "GET");
        assert.match(request.url, /\/totals$/u);
        return response(request, totals());
      }
      throw new Error(`unexpected step ${request.step}`);
    });
    const inspection = inspectSparkFunMagentoFullAddressPrepaymentCapabilityV1(
      selected);
    const directory = privateDirectory(t);
    const runtime = createBuyerNativeTransactionRouteRuntimeV1({
      journalDirectory: directory,
      journalId: `transaction_${createHash("md5")
        .update("full-address prepayment").digest("hex")}`,
      transactionRefHash: h("prepayment transaction"),
      outcomeIntentRefHash: h("frozen cable outcome"),
      routeRole: "PRIMARY",
      formationExpiresAt: FORMATION_EXPIRY,
    }, { capability: selected, clock: () => NOW });

    const ratesBytes = createSparkFunMagentoFullAddressPrepaymentCommandBytesV1(
      selected, { stage: "FULL_ADDRESS_SHIPPING_METHODS",
        selectedCarrierCode: null, selectedMethodCode: null,
        previousQuoteOccurrenceHash: null });
    const quoted = await runtime.quote(operation("rates", ratesBytes));
    assert.equal(quoted.publicProjection.sourceState, "QUOTE_AVAILABLE");
    assert.equal(quoted.publicProjection.paymentPerformed, false);
    assert.equal(quoted.publicProjection.userResultCommitted, false);
    const quoteReceipt = JSON.parse(
      claimBuyerNativeTransactionSourceOccurrenceV1(quoted)
        .sourceBytes.toString("utf8"));
    assert.equal(quoteReceipt.lifecycleState,
      "FULL_ADDRESS_SHIPPING_METHODS_AVAILABLE_HOLD");
    assert.equal(quoteReceipt.normalized.availableRateCount, 2);
    assert.equal(quoteReceipt.normalized.structuredEtaAvailable, false);
    assert.deepEqual(quoteReceipt.normalized.rates[0].extensionAttributeKeys,
      ["checkout_tooltip"]);

    const previous = quoted.publicProjection.sourceOccurrenceHash;
    const prepareBytes
      = createSparkFunMagentoFullAddressPrepaymentCommandBytesV1(selected, {
        stage: "APPLY_SHIPPING_AND_RECOMPUTE",
        selectedCarrierCode: "ups",
        selectedMethodCode: "03",
        previousQuoteOccurrenceHash: previous,
      });
    const prepared = await runtime.hold(operation("prepare", prepareBytes,
      previous));
    assert.equal(prepared.publicProjection.sourceState, "CART_READY");
    assert.equal(prepared.publicProjection.runtimeState, "PRIMARY_CART_READY");
    assert.equal(prepared.publicProjection.capacityReserved, false);
    assert.equal(prepared.publicProjection.paymentPerformed, false);
    assert.equal(prepared.publicProjection.userResultCommitted, false);
    const preparedClaim = claimBuyerNativeTransactionSourceOccurrenceV1(
      prepared);
    const preparedReceipt = JSON.parse(
      preparedClaim.sourceBytes.toString("utf8"));
    assert.equal(preparedReceipt.lifecycleState,
      "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN_HOLD");
    assert.equal(preparedReceipt.nextGate,
      "NEEDS_STRUCTURED_ETA_AND_PAYMENT_AUTHORIZATION");
    assert.equal(preparedReceipt.normalized.readyForPaymentAuthorization, true);
    assert.equal(preparedReceipt.normalized.paymentMethodCount, 2);
    assert.equal(preparedReceipt.normalized.totals.grandTotal, 19.83);
    assert.equal(preparedReceipt.normalized.totals.shippingAmount, 11.19);
    assert.equal(preparedReceipt.normalized.totals.taxAmount, 0.69);
    assert.equal(preparedReceipt.normalized.structuredEtaAvailable, false);
    assert.equal(preparedReceipt.deliveryDeadlineProven, false);
    assert.equal(preparedReceipt.paymentPerformed, false);
    assert.equal(preparedReceipt.orderSubmitted, false);
    assert.equal(preparedReceipt.publicProjectionPermitted, false);
    assert.equal(preparedClaim.establishesCapacity, false);

    const publicSurface = JSON.stringify({ destinationGrant, inspection,
      quoted: quoted.publicProjection, prepared: prepared.publicProjection });
    for (const secret of [FAKE_STREET, FAKE_EMAIL, FAKE_TELEPHONE,
      "02139", MASKED_CART_ID]) {
      assert.equal(publicSurface.includes(secret), false);
    }
    assert.equal(inspection.rawDestinationProjected, false);
    assert.equal(inspection.paymentEnabled, false);
    assert.equal(inspection.orderSubmissionEnabled, false);
    assert.deepEqual(requests.map((request) => request.step), [
      "CART_PREFLIGHT_GET",
      "FULL_ADDRESS_SHIPPING_RATE_ESTIMATE_POST",
      "CART_PREFLIGHT_GET",
      "FULL_ADDRESS_SHIPPING_RATE_REVALIDATE_POST",
      "SHIPPING_INFORMATION_POST",
      "CART_GET_AFTER_SHIPPING_SELECTION",
      "TOTALS_GET_AFTER_SHIPPING_SELECTION",
    ]);
    assert.equal(requests.every((request) => request.url.startsWith(
      `https://www.sparkfun.com/rest/V1/guest-carts/${MASKED_CART_ID}`)), true);
    assert.equal((statSync(directory).mode & 0o077), 0);
  });

test("prepayment stage requires a factory-issued private grant and cannot skip quote ancestry",
  () => {
    let called = false;
    const dependency = async () => { called = true; throw new Error("no"); };
    assert.throws(() => capability(Object.freeze({}), dependency),
      /DESTINATION_GRANT_NOT_FACTORY_ISSUED/u);
    const selected = capability(grant(), dependency);
    assert.throws(() =>
      createSparkFunMagentoFullAddressPrepaymentCommandBytesV1(selected, {
        stage: "APPLY_SHIPPING_AND_RECOMPUTE",
        selectedCarrierCode: "ups",
        selectedMethodCode: "03",
        previousQuoteOccurrenceHash: null,
      }), /PREVIOUS_QUOTE_OCCURRENCE_HASH_INVALID/u);
    assert.equal(called, false);
  });

test("boundary exposes the honest ETA and no-payment limit",
  () => {
    const boundary
      = OUTSIDER_SPARKFUN_MAGENTO_FULL_ADDRESS_PREPAYMENT_STAGE_V1_BOUNDARY;
    assert.equal(boundary.strongestNoPaymentLifecycleState,
      "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN_HOLD");
    assert.equal(boundary.standardMagentoStructuredEtaField, false);
    assert.equal(boundary.sourceAcceptanceIsDeliveryPromise, false);
    assert.equal(boundary.paymentInformationEndpointAllowed, false);
    assert.equal(boundary.paymentPerformed, false);
    assert.equal(boundary.orderSubmitted, false);
    assert.equal(boundary.userResultCommitted, false);
  });
