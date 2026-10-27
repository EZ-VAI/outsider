#!/usr/bin/env node

/*
 * Read-only production probe for the first buyer-native physical outcome.
 *
 * It exercises the real transport -> source adapter -> generic transaction
 * runtime path for the PRIMARY and RECOVERY candidates. It only performs
 * public catalog GETs. It cannot create a cart, submit an address, check out,
 * pay, or create an order.
 */

import { createHash } from "node:crypto";
import {
  chmodSync, mkdirSync, mkdtempSync, openSync, closeSync, fsyncSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  createAdafruitGuestShopperCommandBytesV1,
  issueAdafruitGuestShopperBuyerNativeCapabilityV1,
} from "../src/outsider-adafruit-guest-shopper-adapter-v1.js";
import {
  createSparkFunMagentoGuestCartCommandBytesV1,
  issueSparkFunMagentoGuestCartBuyerNativeCapabilityV1,
} from "../src/outsider-sparkfun-magento-guest-cart-adapter-v1.js";
import {
  createOrderScopedBuyerNativeHttpsTransportV1,
} from "../src/outsider-order-scoped-buyer-native-https-transport-v1.js";

function hash(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function addMs(instant, milliseconds) {
  return new Date(Date.parse(instant) + milliseconds).toISOString();
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function writeOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, "wx", 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  return bytes;
}

function makeRuntime(directory, role, capability, outcomeHash, expiresAt, clock) {
  const suffix = role === "PRIMARY"
    ? "00000000000000000000000000000001"
    : "00000000000000000000000000000002";
  return createBuyerNativeTransactionRouteRuntimeV1({
    journalDirectory: directory,
    journalId: `transaction_${suffix}`,
    transactionRefHash: hash(`outsider-live-quote:${role}:transaction`),
    outcomeIntentRefHash: outcomeHash,
    routeRole: role,
    formationExpiresAt: expiresAt,
  }, { capability, clock });
}

function command(role, requestBytes, expiresAt) {
  return {
    operationNonce: `buyer-native-live-quote-${role.toLowerCase()}-0001`,
    requestBytes,
    expiresAt,
    expectedPreviousOccurrenceHash: null,
    triggerOccurrenceHash: null,
  };
}

function routeSummary(role, result) {
  if (result.publicProjection.operationState !== "SOURCE_OCCURRENCE_OBSERVED") {
    return Object.freeze({
      role,
      provider: role === "PRIMARY"
        ? "ADAFRUIT_GUEST_SHOPPER" : "SPARKFUN_MAGENTO_GUEST_CART",
      product: role === "PRIMARY"
        ? { productId: "4474", quantity: 1 }
        : { productId: "CAB-14743", quantity: 1 },
      lifecycleState: "QUOTE_SOURCE_NOT_OBSERVED_HOLD",
      nextGate: "RETRY_ONLY_AS_NEW_VERSIONED_PROBE",
      sourceState: result.publicProjection.sourceState,
      runtimeState: result.publicProjection.runtimeState,
      operationState: result.publicProjection.operationState,
      retryPermitted: result.publicProjection.retryPermitted,
      sourceOccurrenceHash: null,
      sourceBytes: 0,
      sourceBytesHash: null,
      normalized: null,
      capacityReserved: false,
      addressSubmitted: false,
      paymentPerformed: false,
      orderSubmitted: false,
    });
  }
  const sourceClaim = claimBuyerNativeTransactionSourceOccurrenceV1(result);
  const receipt = JSON.parse(sourceClaim.sourceBytes.toString("utf8"));
  return Object.freeze({
    role,
    provider: receipt.provider,
    product: receipt.product,
    lifecycleState: receipt.lifecycleState,
    nextGate: receipt.nextGate,
    sourceState: result.publicProjection.sourceState,
    runtimeState: result.publicProjection.runtimeState,
    sourceOccurrenceHash: result.publicProjection.sourceOccurrenceHash,
    sourceBytes: sourceClaim.sourceBytes.length,
    sourceBytesHash: sourceClaim.sourceBytesHash,
    normalized: receipt.normalized,
    capacityReserved: false,
    addressSubmitted: false,
    paymentPerformed: false,
    orderSubmitted: false,
  });
}

export async function runBuyerNativeLiveQuoteProbeV1(options = {}) {
  const observedAt = new Date().toISOString();
  const clock = () => observedAt;
  const issuedAt = addMs(observedAt, -1_000);
  const operationExpiresAt = addMs(observedAt, 10 * 60_000);
  const capabilityExpiresAt = addMs(observedAt, 15 * 60_000);
  const outcomeHash = hash(
    "one-new-usb-a-male-to-usb-c-male-data-and-5v-power-cable-0.9m-to-1.1m",
  );
  const privateRoot = path.resolve(options.privateRoot
    ?? path.join(process.cwd(), ".outsider", "private"));
  mkdirSync(privateRoot, { recursive: true, mode: 0o700 });
  chmodSync(privateRoot, 0o700);
  const directory = mkdtempSync(path.join(privateRoot,
    "buyer-native-live-quote-20260904-"));
  chmodSync(directory, 0o700);

  const revalidateImpl = (input) => ({
    active: true,
    capabilityRefHash: input.capabilityRefHash,
    accountRefHash: input.accountRefHash,
    observedAt: input.observedAt,
    expiresAt: capabilityExpiresAt,
  });

  const adafruitTransport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: path.join(directory, "adafruit-http"),
    orderRefHash: hash("buyer-native-live-quote:adafruit:http"),
    allowedOrigins: ["https://www.adafruit.com"],
    timeoutMs: 20_000,
    maximumResponseBytes: 768 * 1024,
  });
  const adafruitCapability = issueAdafruitGuestShopperBuyerNativeCapabilityV1({
    capabilityRefHash: hash("buyer-native-live-quote:adafruit:capability"),
    accountRefHash: hash("buyer-native-live-quote:adafruit:guest-account"),
    nodeRefHash: hash("buyer-native-live-quote:adafruit:node"),
    issuedAt,
    expiresAt: capabilityExpiresAt,
    productId: "4474",
    quantity: 1,
  }, { httpsRequestImpl: adafruitTransport, revalidateImpl });

  const sparkfunTransport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: path.join(directory, "sparkfun-http"),
    orderRefHash: hash("buyer-native-live-quote:sparkfun:http"),
    allowedOrigins: ["https://www.sparkfun.com"],
    timeoutMs: 20_000,
    maximumResponseBytes: 768 * 1024,
  });
  const sparkfunCapability = issueSparkFunMagentoGuestCartBuyerNativeCapabilityV1({
    capabilityRefHash: hash("buyer-native-live-quote:sparkfun:capability"),
    accountRefHash: hash("buyer-native-live-quote:sparkfun:guest-account"),
    nodeRefHash: hash("buyer-native-live-quote:sparkfun:node"),
    issuedAt,
    expiresAt: capabilityExpiresAt,
    catalogPath: "/usb-3-1-cable-a-to-c-3-foot.html",
    productId: "4636",
    sku: "CAB-14743",
    quantity: 1,
  }, {
    httpsRequestImpl: sparkfunTransport,
    revalidateImpl,
    loadPrivateCartStateImpl: async () => null,
    storePrivateCartStateImpl: async () => {
      throw new Error("read-only quote probe cannot store a cart");
    },
    clearPrivateCartStateImpl: async () => {
      throw new Error("read-only quote probe cannot clear a cart");
    },
  });

  const primary = makeRuntime(directory, "PRIMARY", adafruitCapability,
    outcomeHash, operationExpiresAt, clock);
  const recovery = makeRuntime(directory, "RECOVERY", sparkfunCapability,
    outcomeHash, operationExpiresAt, clock);
  const [primaryResult, recoveryResult] = await Promise.all([
    primary.quote(command("PRIMARY",
      createAdafruitGuestShopperCommandBytesV1({ productId: "4474", quantity: 1 }),
      operationExpiresAt)),
    recovery.quote(command("RECOVERY",
      createSparkFunMagentoGuestCartCommandBytesV1({ sku: "CAB-14743", quantity: 1 }),
      operationExpiresAt)),
  ]);
  const routes = [
    routeSummary("PRIMARY", primaryResult),
    routeSummary("RECOVERY", recoveryResult),
  ];
  const quoteCount = routes.filter((route) =>
    route.sourceState === "QUOTE_AVAILABLE").length;
  const body = {
    schema: "outsider/buyer-native-live-quote-probe/v1",
    schemaVersion: "1.0.0",
    observedAt,
    outcomeHash,
    routes,
    liveProviderGetAttemptCount: 2,
    liveProviderQuoteOccurrenceCount: quoteCount,
    cartMutationCount: 0,
    sellerMessageCount: 0,
    addressSubmitted: false,
    paymentAttempted: false,
    orderCreated: false,
    capacityReserved: false,
    decisionState: "HOLD",
    nextState: quoteCount === 2
      ? "NEEDS_DESTINATION_THEN_SHIPPING_TAX_ETA_AND_PAYMENT_AUTHORITY"
      : "SOURCE_UNAVAILABLE_NEW_VERSIONED_PROBE_REQUIRED",
  };
  const manifest = Object.freeze({ ...body,
    manifestHash: hash(canonicalizeStrict(body)) });
  const manifestBytes = writeOnce(path.join(directory, "manifest.json"), manifest);
  return Object.freeze({
    directory,
    manifestBytes: manifestBytes.length,
    manifestFileHash: hash(manifestBytes.toString("utf8")),
    ...manifest,
  });
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const result = await runBuyerNativeLiveQuoteProbeV1();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
