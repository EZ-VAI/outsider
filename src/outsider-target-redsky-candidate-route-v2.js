import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { createOrderScopedBuyerNativeHttpsTransportV1 } from "./outsider-order-scoped-buyer-native-https-transport-v1.js";
import {
  createTargetRedskyCandidateCommandBytesV1,
  inspectTargetRedskyCandidateBuyerNativeCapabilityV1,
  issueTargetRedskyCandidateBuyerNativeCapabilityV1,
  normalizeTargetRedskyFulfillmentSourceV1,
  normalizeTargetRedskyPdpSourceV1,
} from "./outsider-target-redsky-candidate-route-v1.js";

const TARGET_ORIGIN = "https://www.target.com";
const REDSKY_ORIGIN = "https://redsky.target.com";
const PUBLIC_WEB_KEY = "9f36aeafbe60771e321a7cc95a78140772ab3e96";
const PDP_PATH = "/redsky_aggregations/v1/web/pdp_client_v1";
const FULFILLMENT_PATH = "/redsky_aggregations/v1/web/product_fulfillment_v1";
const PUBLIC_BROWSER_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0.0.0 Safari/537.36";
const HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;

const CAPABILITY_INPUT_KEYS = Object.freeze([
  "accountRefHash",
  "capabilityRefHash",
  "expiresAt",
  "fulfillmentStoreId",
  "issuedAt",
  "latitude",
  "longitude",
  "maximumAmountMinor",
  "nodeRefHash",
  "orderRefHash",
  "postalCode",
  "pricingStoreId",
  "privateStateDirectory",
  "quantity",
  "requestedDeliveryDate",
  "state",
  "tcin",
]);
const CAPABILITY_DEPENDENCY_KEYS = Object.freeze([
  "clock",
  "fetchImpl",
  "revalidateImpl",
  "sourceOccurrenceSink",
]);
const MATERIALIZER_INPUT_KEYS = Object.freeze([
  "binding",
  "fulfillmentSourceBytes",
  "fulfillmentSourceOccurrenceHash",
  "observedAt",
  "pdpSourceBytes",
  "pdpSourceOccurrenceHash",
]);
const BINDING_KEYS = Object.freeze([
  "fulfillmentStoreId",
  "latitude",
  "longitude",
  "maximumAmountMinor",
  "postalCode",
  "pricingStoreId",
  "quantity",
  "requestedDeliveryDate",
  "state",
  "tcin",
]);

const capabilityStates = new WeakMap();

export const OUTSIDER_TARGET_REDSKY_CANDIDATE_ROUTE_V2_BOUNDARY = deepFreeze({
  adapterVersion: "v2",
  descendsFrom: "outsider/target-redsky-candidate-route/v1",
  repair: "TARGET_PUBLIC_BROWSER_HEADER_PROFILE_DRIFT",
  provider: "TARGET_REDSKY_READ_ONLY_CANDIDATE",
  routeClass: "BUYER_NATIVE_PUBLIC_WEB_GET",
  supportedOperations: ["QUOTE", "STATUS"],
  httpMethods: ["GET"],
  browserEquivalentHeaders: ["user-agent", "origin", "referer"],
  accountCredentialUsed: false,
  contactInputAccepted: false,
  streetAddressInputAccepted: false,
  cartMutationImplemented: false,
  paymentPerformed: false,
  orderSubmissionImplemented: false,
  sourceAvailableToPromiseIsReservation: false,
  sourceDeliveryDateIsBindingCommitment: false,
  publicFormationProjectionContainsLocation: false,
  capacityReserved: false,
  authority: "NONE",
  decisionState: "HOLD",
});

function fail(message, code = "TARGET_REDSKY_V2_INVALID") {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function assertPlainRecord(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail(`${field} must be a plain object`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    fail(`${field} must be a plain object`);
  }
}

function assertExactKeys(value, expectedKeys, field) {
  assertPlainRecord(value, field);
  const actual = Object.keys(value).sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(`${field} keys must be exactly ${expected.join(",")}`);
  }
}

function assertHash(value, field) {
  if (typeof value !== "string" || !HASH_PATTERN.test(value)) {
    fail(`${field} must be a lowercase sha256 hex digest`);
  }
}

function assertTcin(value) {
  if (typeof value !== "string" || !/^\d{8}$/u.test(value)) {
    fail("tcin must be exactly eight decimal digits");
  }
}

function parseInstant(value, field) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail(`${field} must be an RFC3339 timestamp`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

function validateRedskyPublicRead(urlValue, init, tcin) {
  const url = new URL(urlValue);
  if (url.protocol !== "https:" || url.origin !== REDSKY_ORIGIN) {
    fail("Target RedSky v2 permits only the pinned HTTPS RedSky origin", "TARGET_REDSKY_ORIGIN_FORBIDDEN");
  }
  if (url.pathname !== PDP_PATH && url.pathname !== FULFILLMENT_PATH) {
    fail("Target RedSky v2 permits only the pinned public read paths", "TARGET_REDSKY_PATH_FORBIDDEN");
  }
  if (url.searchParams.get("tcin") !== tcin || url.searchParams.get("key") !== PUBLIC_WEB_KEY) {
    fail("Target RedSky v2 request is not bound to the issued product and public web key");
  }
  if (init?.method !== "GET" || init?.body !== undefined) {
    fail("Target RedSky v2 is GET-only and bodyless", "TARGET_REDSKY_EFFECT_FORBIDDEN");
  }
  if (init.redirect !== "manual" || init.credentials !== "omit") {
    fail("Target RedSky v2 requires manual redirects and omitted ambient credentials");
  }
  const incoming = new Headers(init.headers);
  for (const [name] of incoming.entries()) {
    if (name !== "accept" && name !== "cookie") {
      fail(`unexpected transport header ${name}`, "TARGET_REDSKY_AMBIENT_HEADER_FORBIDDEN");
    }
  }
  return incoming.get("cookie");
}

export function createTargetRedskyBrowserEquivalentFetchV2(input = {}, dependencies = {}) {
  assertExactKeys(input, ["tcin"], "input");
  assertExactKeys(dependencies, ["fetchImpl"], "dependencies");
  assertTcin(input.tcin);
  if (typeof dependencies.fetchImpl !== "function") fail("fetchImpl must be a function");

  const referer = `${TARGET_ORIGIN}/p/-/A-${input.tcin}`;
  return async function targetRedskyBrowserEquivalentFetch(url, init = {}) {
    const orderScopedCookie = validateRedskyPublicRead(url, init, input.tcin);
    return dependencies.fetchImpl(url, {
      ...init,
      headers: {
        accept: "application/json",
        ...(orderScopedCookie === null ? {} : { cookie: orderScopedCookie }),
        origin: TARGET_ORIGIN,
        referer,
        "user-agent": PUBLIC_BROWSER_USER_AGENT,
      },
    });
  };
}

export function issueTargetRedskyCandidateBuyerNativeCapabilityV2(input = {}, dependencies = {}) {
  assertExactKeys(input, CAPABILITY_INPUT_KEYS, "input");
  assertExactKeys(dependencies, CAPABILITY_DEPENDENCY_KEYS, "dependencies");
  if (typeof dependencies.clock !== "function") fail("clock must be a function");
  if (typeof dependencies.revalidateImpl !== "function") fail("revalidateImpl must be a function");
  if (dependencies.sourceOccurrenceSink !== null && typeof dependencies.sourceOccurrenceSink !== "function") {
    fail("sourceOccurrenceSink must be null or a function");
  }

  const browserEquivalentFetch = createTargetRedskyBrowserEquivalentFetchV2(
    { tcin: input.tcin },
    { fetchImpl: dependencies.fetchImpl },
  );
  const httpsRequestImpl = createOrderScopedBuyerNativeHttpsTransportV1(
    {
      allowedOrigins: [REDSKY_ORIGIN],
      maximumResponseBytes: 786_432,
      orderRefHash: input.orderRefHash,
      privateStateDirectory: input.privateStateDirectory,
      timeoutMs: 20_000,
    },
    {
      clock: () => {
        const now = Date.parse(dependencies.clock());
        if (!Number.isFinite(now)) fail("clock returned an invalid timestamp");
        return now;
      },
      fetchImpl: browserEquivalentFetch,
    },
  );

  const capability = issueTargetRedskyCandidateBuyerNativeCapabilityV1(
    {
      accountRefHash: input.accountRefHash,
      capabilityRefHash: input.capabilityRefHash,
      expiresAt: input.expiresAt,
      fulfillmentStoreId: input.fulfillmentStoreId,
      issuedAt: input.issuedAt,
      latitude: input.latitude,
      longitude: input.longitude,
      maximumAmountMinor: input.maximumAmountMinor,
      nodeRefHash: input.nodeRefHash,
      postalCode: input.postalCode,
      pricingStoreId: input.pricingStoreId,
      quantity: input.quantity,
      requestedDeliveryDate: input.requestedDeliveryDate,
      state: input.state,
      tcin: input.tcin,
    },
    {
      httpsRequestImpl,
      revalidateImpl: dependencies.revalidateImpl,
      sourceOccurrenceSink: dependencies.sourceOccurrenceSink,
    },
  );
  const v1Inspection = inspectTargetRedskyCandidateBuyerNativeCapabilityV1(capability);
  capabilityStates.set(
    capability,
    deepFreeze({
      adapterVersion: "v2",
      allowedEffects: ["GET_PUBLIC_PDP", "GET_PUBLIC_FULFILLMENT"],
      bindingHash: bytesHash(canonicalizeStrict({
        maximumAmountMinor: v1Inspection.maximumAmountMinor,
        quantity: v1Inspection.quantity,
        requestedDeliveryDate: v1Inspection.requestedDeliveryDate,
        tcin: v1Inspection.tcin,
      })),
      browserEquivalentHeaderProfile: "TARGET_PUBLIC_WEB_FIXED_2026_09",
      responseKind: "SOURCE_BYTES",
      routeRole: "RECOVERY",
      tcin: input.tcin,
    }),
  );
  return capability;
}

export function inspectTargetRedskyCandidateBuyerNativeCapabilityV2(capability) {
  const state = capabilityStates.get(capability);
  if (!state) fail("capability was not issued by the Target RedSky v2 factory", "UNKNOWN_TARGET_REDSKY_V2_CAPABILITY");
  return state;
}

export function materializeTargetRedskyFormationCandidateProjectionV2(input = {}) {
  assertExactKeys(input, MATERIALIZER_INPUT_KEYS, "input");
  assertExactKeys(input.binding, BINDING_KEYS, "input.binding");
  assertHash(input.pdpSourceOccurrenceHash, "pdpSourceOccurrenceHash");
  assertHash(input.fulfillmentSourceOccurrenceHash, "fulfillmentSourceOccurrenceHash");
  const observedAt = parseInstant(input.observedAt, "observedAt");

  const command = JSON.parse(createTargetRedskyCandidateCommandBytesV1(input.binding).toString("utf8"));
  const product = normalizeTargetRedskyPdpSourceV1(input.pdpSourceBytes, {
    maximumAmountMinor: command.maximumAmountMinor,
    quantity: command.quantity,
    tcin: command.tcin,
  });
  const fulfillment = normalizeTargetRedskyFulfillmentSourceV1(input.fulfillmentSourceBytes, {
    quantity: command.quantity,
    requestedDeliveryDate: command.requestedDeliveryDate,
    tcin: command.tcin,
  });
  const blockers = [
    ...product.blockingAcceptanceGaps,
    ...(product.standardShippingRouteState === "BUDGET_INFEASIBLE" ? ["STANDARD_SHIPPING_MINIMUM_EXCEEDS_BUDGET"] : []),
    "TARGET_ACCOUNT_AUTHORITY_REQUIRED",
    "FULL_ADDRESS_DELIVERABILITY_NOT_PROVEN",
    "ALL_IN_TOTAL_NOT_PROVEN",
    "CAPACITY_NOT_RESERVED",
  ];
  const projectionBody = {
    schema: "outsider/target-redsky-formation-candidate/v2",
    adapter: {
      headerProfile: "TARGET_PUBLIC_WEB_FIXED_2026_09",
      mode: "PUBLIC_BROWSER_EQUIVALENT_READ_ONLY",
      permittedEffects: ["GET_PUBLIC_PDP", "GET_PUBLIC_FULFILLMENT"],
      provider: "target",
    },
    observedAt,
    requestedDeliveryDate: command.requestedDeliveryDate,
    product: {
      acceptanceGaps: product.blockingAcceptanceGaps,
      chargingClaimed: product.chargingClaimed,
      currency: product.currency,
      dataTransferClaimed: product.dataTransferClaimed,
      destinationConnector: product.connectorB,
      exactAcceptanceSatisfied: product.exactAcceptanceSatisfied,
      explicit5vClaim: product.voltageExplicitlyStatedBySeller,
      itemThresholdMinor: product.minimumStandardShippingCartMinor,
      itemThresholdSatisfied: product.shippingMinimumMet,
      lengthFeet: product.lengthFeet,
      lengthMeters: product.lengthMeters,
      quantity: command.quantity,
      sourceConnector: product.connectorA,
      standardShippingRouteState: product.standardShippingRouteState,
      tcin: product.productId,
      title: product.title,
      unitPriceMinor: product.unitPriceMinor,
      upc: product.upc,
    },
    fulfillment: {
      availableToPromiseQuantity: fulfillment.sourceAvailableToPromiseQuantity,
      availabilityStatus: fulfillment.sourceAvailability,
      oneDayFeeMinor: fulfillment.oneDayFeeMinor,
      scheduledDeliveryFeeMinor: fulfillment.scheduledDeliveryFeeMinor,
      selectedSourceService: fulfillment.selectedSourceService,
      sourceAtpSatisfiesQuantity: fulfillment.sourceAtpSatisfiesQuantity,
      sourceDateMeetsRequestedDeadline: fulfillment.sourceDateMeetsRequestedDeadline,
    },
    checkoutAccess: {
      accountAuthorityPresent: false,
      guestCheckoutAvailable: false,
      officialPolicySource: "https://www.target.com/help/article/000062293",
      targetAccountRequired: true,
    },
    priceBoundary: {
      allInBudgetProven: false,
      itemPlusScheduledDeliveryFeeBeforeTaxMinor:
        product.unitPriceMinor * command.quantity + fulfillment.scheduledDeliveryFeeMinor,
      maximumAmountMinor: command.maximumAmountMinor,
      taxAndAddressBoundFeesProven: false,
    },
    formationDecision: {
      blockers,
      capacityReserved: false,
      commitEligible: false,
      primaryEligible: false,
      recoveryEligible: false,
      role: "OBSERVATION_ONLY",
    },
    sourceOccurrences: {
      fulfillment: {
        byteLength: Buffer.from(input.fulfillmentSourceBytes).byteLength,
        bytesHash: bytesHash(input.fulfillmentSourceBytes),
        occurrenceHash: input.fulfillmentSourceOccurrenceHash,
      },
      pdp: {
        byteLength: Buffer.from(input.pdpSourceBytes).byteLength,
        bytesHash: bytesHash(input.pdpSourceBytes),
        occurrenceHash: input.pdpSourceOccurrenceHash,
      },
    },
    privacyBoundary: {
      contactProjected: false,
      coordinatesProjected: false,
      postalCodeProjected: false,
      streetAddressProjected: false,
    },
  };
  const projectionBytes = canonicalizeStrict(projectionBody, "target-redsky-formation-candidate-v2");
  return deepFreeze({
    ...projectionBody,
    projectionHash: bytesHash(projectionBytes),
  });
}

export const TARGET_REDSKY_PUBLIC_BROWSER_HEADERS_V2 = deepFreeze({
  origin: TARGET_ORIGIN,
  refererTemplate: `${TARGET_ORIGIN}/p/-/A-{tcin}`,
  userAgent: PUBLIC_BROWSER_USER_AGENT,
});
