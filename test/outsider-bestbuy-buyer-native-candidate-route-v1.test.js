import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  createBestBuyBuyerNativeCandidateCommandBytesV1,
  inspectBestBuyBuyerNativeCandidateCapabilityV1,
  issueBestBuyBuyerNativeCandidateCapabilityV1,
  normalizeBestBuyCartSourceV1,
  normalizeBestBuyGuestCheckoutSourceV1,
  normalizeBestBuyProductSourceV1,
} from "../src/outsider-bestbuy-buyer-native-candidate-route-v1.js";

const NOW = "2026-09-04T16:00:00.000Z";
const EXPIRES = "2026-09-04T16:45:00.000Z";

function h(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function sources() {
  const product = Buffer.from(`<!doctype html><html><head>
<title>Anker Cable [2 Pack 3ft], USB A to USB C Cable Black - Best Buy</title>
<meta name="analytics-metadata" content="{&quot;product&quot;:{&quot;skuId&quot;:&quot;12150546&quot;,&quot;bsin&quot;:&quot;JJ858RS2Z5&quot;,&quot;price&quot;:&quot;8.99&quot;,&quot;brand&quot;:&quot;Anker&quot;}}">
</head></html>`, "utf8");
  const cartOrderInit = {
    lineItems: [{ quantity: 1, quantityLimit: 5, item: {
      shortLabel: "Anker - Cable [2 Pack 3ft], USB A to USB C Cable - Black",
      title: "Cable [2 Pack 3ft], USB A to USB C Cable",
      skuId: "12150546", bsin: "JJ858RS2Z5", modelNumber: "B8172",
      thirdPartySellerName: "AnkerDirect", isOutOfStock: false,
      fulfillmentOptions: { shippingEligible: true, shippable: true },
      fulfillments: [{ typeCode: "SHIPPING", selected: true,
        backordered: false, zipcode: "02446",
        minDate: "2026-09-10T05:00:00.000+00:00",
        maxDate: "2026-09-10T05:00:00.000+00:00",
        minEstimatedArrival: "Thu, Sep 10",
        maxEstimatedArrival: "Thu, Sep 10", price: "FREE" }],
      price: { linePrice: "$8.99" },
      reservation: { token: "private-cart-token" },
    } }],
    orderSummary: { productTotal: "$8.99", orderTotal: "$9.55",
      shippingTotal: "$0.00", price: { totalSalesTax: "$0.56" } },
    cartItemCount: "1", authStatus: "G", user: { type: "visitor" },
  };
  const cart = Buffer.from(`<!doctype html><script>var cartOrderInit = ${JSON.stringify(cartOrderInit)};</script>`, "utf8");
  const meta = { recognized: "anonymous", user_recognized: "anonymous",
    loginRequired: false, user_numItemsInCart: 1 };
  const data = { allowsGuestFlow: true,
    guestUrl: "/identity/guest?token=private-token",
    brand: { guestButtonCopy: "Continue as Guest" } };
  const guest = Buffer.from(`<!doctype html><script>var initMetaLayer = ${JSON.stringify(meta)};</script><script>var initData = ${JSON.stringify(data)};</script>`, "utf8");
  return { product, cart, guest };
}

function binding(source = sources()) {
  return {
    sku: "12150546", bsin: "JJ858RS2Z5", postalCode: "02446",
    requestedCableQuantity: 1, cartLineQuantity: 1,
    requestedDeliveryDate: "2026-09-10", maximumAmountMinor: "2000",
    reviewedProductSpec: { packCableQuantity: 2, cableLengthFeet: 3,
      connectorA: "USB_A_MALE", connectorB: "USB_C_MALE",
      connectorGender: "MALE_TO_MALE", powerClaim: "3A/5V up to 15W",
      dataTransferClaim: "up to 480Mbps", evidenceRefHash: h("spec-evidence") },
    sourcePins: { productSourceBytesHash: h(source.product),
      cartSourceBytesHash: h(source.cart),
      guestCheckoutSourceBytesHash: h(source.guest) },
  };
}

function privateDirectory(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-bestbuy-"));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("Best Buy source-pinned route preserves three exact source occurrences and rejects pack surplus",
  async (t) => {
    const source = sources();
    const routeBinding = binding(source);
    const calls = [];
    const capability = issueBestBuyBuyerNativeCandidateCapabilityV1({
      capabilityRefHash: h("capability"), accountRefHash: h("account"),
      nodeRefHash: h("node"), issuedAt: NOW, expiresAt: EXPIRES,
      binding: routeBinding,
    }, {
      async readSourceImpl(request) {
        calls.push(request);
        return source[request.stage === "PRODUCT" ? "product"
          : request.stage === "CART" ? "cart" : "guest"];
      },
      async revalidateImpl(entry) {
        return { active: true, capabilityRefHash: entry.capabilityRefHash,
          accountRefHash: entry.accountRefHash, observedAt: entry.observedAt,
          expiresAt: EXPIRES };
      },
      sourceOccurrenceSink: null,
    });
    const directory = privateDirectory(t);
    const runtime = createBuyerNativeTransactionRouteRuntimeV1({
      journalDirectory: directory,
      journalId: "transaction_1234567890abcdef1234567890abcdef",
      transactionRefHash: h("transaction"),
      outcomeIntentRefHash: h("outcome"), routeRole: "RECOVERY",
      formationExpiresAt: EXPIRES,
    }, { capability, clock: () => NOW });
    const command = (stage) =>
      createBestBuyBuyerNativeCandidateCommandBytesV1({
        binding: routeBinding, stage });
    const productResult = await runtime.quote({
      operationNonce: "bestbuy-product-quote-0001",
      requestBytes: command("PRODUCT"), expiresAt: EXPIRES,
      expectedPreviousOccurrenceHash: null, triggerOccurrenceHash: null,
    });
    const productClaim = claimBuyerNativeTransactionSourceOccurrenceV1(
      productResult);
    assert.deepEqual(productClaim.sourceBytes, source.product);
    const product = normalizeBestBuyProductSourceV1(productClaim.sourceBytes,
      { sku: routeBinding.sku, bsin: routeBinding.bsin,
        requestedCableQuantity: routeBinding.requestedCableQuantity,
        reviewedProductSpec: routeBinding.reviewedProductSpec });
    assert.equal(product.exactCableSpecExceptPackQuantity, true);
    assert.equal(product.exactAcceptanceSatisfied, false);
    assert.equal(product.surplusCableQuantity, 1);
    assert.equal(product.surplusAuthorizationRequired, true);
    assert.equal(product.surplusAuthorizationPresent, false);
    assert.deepEqual(product.blockingAcceptanceGaps,
      ["SURPLUS_PRODUCT_QUANTITY_REQUIRES_USER_AUTHORIZATION"]);

    const cartResult = await runtime.status({
      operationNonce: "bestbuy-cart-status-0001",
      requestBytes: command("CART"), expiresAt: EXPIRES,
      expectedPreviousOccurrenceHash:
        productResult.publicProjection.sourceOccurrenceHash,
      triggerOccurrenceHash: null,
    });
    const cartClaim = claimBuyerNativeTransactionSourceOccurrenceV1(cartResult);
    assert.deepEqual(cartClaim.sourceBytes, source.cart);
    const cart = normalizeBestBuyCartSourceV1(cartClaim.sourceBytes, {
      sku: routeBinding.sku, bsin: routeBinding.bsin,
      postalCode: routeBinding.postalCode,
      cartLineQuantity: routeBinding.cartLineQuantity,
      requestedDeliveryDate: routeBinding.requestedDeliveryDate,
      maximumAmountMinor: routeBinding.maximumAmountMinor,
    });
    assert.equal(cart.anonymousCartAccepted, true);
    assert.equal(cart.displayedAllInTotalMinor, 955);
    assert.equal(cart.sourceDateMeetsRequestedDeadline, true);
    assert.equal(cart.sourceNumericAtpExposed, false);
    assert.equal(cart.cartIsCapacityReservation, false);

    const guestResult = await runtime.status({
      operationNonce: "bestbuy-guest-status-0001",
      requestBytes: command("GUEST_CHECKOUT"), expiresAt: EXPIRES,
      expectedPreviousOccurrenceHash:
        cartResult.publicProjection.sourceOccurrenceHash,
      triggerOccurrenceHash: null,
    });
    const guestClaim = claimBuyerNativeTransactionSourceOccurrenceV1(
      guestResult);
    assert.deepEqual(guestClaim.sourceBytes, source.guest);
    const guest = normalizeBestBuyGuestCheckoutSourceV1(
      guestClaim.sourceBytes, { cartLineQuantity: 1 });
    assert.equal(guest.guestCheckoutOffered, true);
    assert.equal(guest.accountRequiredForCheckout, false);
    assert.equal(guest.guestContinuationTokenProjected, false);
    assert.equal(calls.length, 3);
    assert.deepEqual(calls.map(({ stage }) => stage),
      ["PRODUCT", "CART", "GUEST_CHECKOUT"]);
    assert.equal([productResult, cartResult, guestResult].every((result) =>
      result.publicProjection.capacityReserved === false), true);

    const responseDirectory = path.join(directory,
      "transaction_1234567890abcdef1234567890abcdef.responses");
    const stored = readdirSync(responseDirectory).filter((name) =>
      name.endsWith(".source-v2.bin"));
    assert.equal(stored.length, 3);
    for (const name of stored) {
      assert.equal(statSync(path.join(responseDirectory, name)).mode & 0o077, 0);
      assert.ok(Object.values(source).some((bytes) =>
        readFileSync(path.join(responseDirectory, name)).equals(bytes)));
    }
    const inspected = inspectBestBuyBuyerNativeCandidateCapabilityV1(
      capability);
    assert.equal(inspected.surplusAuthorizationRequired, true);
    assert.equal(inspected.orderSubmissionEnabled, false);
  });

test("Best Buy source reader fails closed when a captured body does not match its order pin",
  async (t) => {
    const source = sources();
    const routeBinding = binding(source);
    const capability = issueBestBuyBuyerNativeCandidateCapabilityV1({
      capabilityRefHash: h("pin-capability"), accountRefHash: h("pin-account"),
      nodeRefHash: h("pin-node"), issuedAt: NOW, expiresAt: EXPIRES,
      binding: routeBinding,
    }, { async readSourceImpl() { return Buffer.from("wrong source body"); },
      async revalidateImpl(entry) {
        return { active: true, capabilityRefHash: entry.capabilityRefHash,
          accountRefHash: entry.accountRefHash, observedAt: entry.observedAt,
          expiresAt: EXPIRES };
      }, sourceOccurrenceSink: null });
    const runtime = createBuyerNativeTransactionRouteRuntimeV1({
      journalDirectory: privateDirectory(t),
      journalId: "transaction_abcdefabcdefabcdefabcdefabcdefab",
      transactionRefHash: h("pin-transaction"),
      outcomeIntentRefHash: h("pin-outcome"), routeRole: "RECOVERY",
      formationExpiresAt: EXPIRES,
    }, { capability, clock: () => NOW });
    const result = await runtime.quote({
      operationNonce: "bestbuy-pin-mismatch-0001",
      requestBytes: createBestBuyBuyerNativeCandidateCommandBytesV1({
        binding: routeBinding, stage: "PRODUCT" }), expiresAt: EXPIRES,
      expectedPreviousOccurrenceHash: null, triggerOccurrenceHash: null,
    });
    assert.equal(result.publicProjection.sourceOccurrenceHash, null);
    assert.equal(result.publicProjection.operationState,
      "AMBIGUOUS_NO_RETRY_HOLD");
    assert.equal(result.publicProjection.capacityReserved, false);
  });
