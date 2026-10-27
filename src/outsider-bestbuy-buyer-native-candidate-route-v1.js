/*
 * Best Buy buyer-native parallel candidate route v1.
 *
 * This source-pinned adapter replays an order-scoped official PDP, anonymous
 * cart, and guest-checkout observation through the same buyer-native
 * Episode/Attempt path used by live transaction adapters. The source reader
 * is injected: no SKU, destination, capture path, account, or browser session
 * is global or hardcoded here. Exact source bytes are retained privately by
 * the buyer-native runtime. Nothing in this adapter reserves inventory,
 * authorizes surplus goods, submits checkout, pays, or places an order.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  issueBuyerNativeTransactionAccountCapabilityV1,
} from "./outsider-buyer-native-transaction-capability-v1.js";

const PREFIX = "OUTSIDER_BESTBUY_BUYER_NATIVE_CANDIDATE_ROUTE_V1_";
const PROVIDER = "BEST_BUY_US_WEB_SOURCE_PINNED_CANDIDATE";
const COMMAND_SCHEMA = "outsider/bestbuy-buyer-native-candidate-command/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const DATE_ONLY = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u;
const CAPABILITIES = new WeakMap();
const STAGES = Object.freeze(["PRODUCT", "CART", "GUEST_CHECKOUT"]);

export const OUTSIDER_BESTBUY_BUYER_NATIVE_CANDIDATE_ROUTE_V1_BOUNDARY
  = Object.freeze({
    provider: PROVIDER,
    routeClass: "BUYER_NATIVE_SOURCE_PINNED_ORDER_SCOPED_OBSERVATION",
    supportedOperations: Object.freeze(["QUOTE", "STATUS"]),
    sourceReaderInjectedPerOrder: true,
    globalProviderRegistryRequired: false,
    skuHardcodedInAdapter: false,
    localityHardcodedInAdapter: false,
    browserSessionAcceptedByAdapter: false,
    arbitraryUrlAccepted: false,
    sourceCaptureMayBeRenderedDomRatherThanRawHttp: true,
    exactSourceBytesPreservedPrivatelyByBuyerNativeRuntime: true,
    anonymousCartObservationOnly: true,
    guestCheckoutReadinessObservationOnly: true,
    cartTokenProjected: false,
    cartIsCapacityReservation: false,
    sourceNumericAtpRequiredToClaimAtp: true,
    sourceEtaIsBindingCommitment: false,
    surplusRequiresSeparateUserAuthorization: true,
    candidateObservationAltersAtomicNetworkState: false,
    fullAddressAccepted: false,
    contactInputAccepted: false,
    paymentInputAccepted: false,
    paymentPerformed: false,
    orderSubmissionImplemented: false,
    capacityReserved: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)
    || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function bytesHash(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function identifier(value, expression, code) {
  if (typeof value !== "string" || !expression.test(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function positiveInteger(value, code, maximum = 99) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function finiteNumber(value, code) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function dateOnly(value, code) {
  if (typeof value !== "string" || !DATE_ONLY.test(value)
    || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10)
      !== value) fail(`${code}_INVALID`);
  return value;
}

function moneyMinorText(value) {
  return identifier(value, /^(?:0|[1-9]\d{0,11})$/u,
    "MAXIMUM_AMOUNT_MINOR");
}

function sourceText(sourceBytes, code) {
  if (!Buffer.isBuffer(sourceBytes) || sourceBytes.length < 16
    || sourceBytes.length > 1024 * 1024) fail(`${code}_SOURCE_BYTES_INVALID`);
  const value = sourceBytes.toString("utf8");
  if (Buffer.byteLength(value, "utf8") !== sourceBytes.length
    || value.includes("\u0000")) fail(`${code}_SOURCE_TEXT_INVALID`);
  return value;
}

function decodeHtml(value) {
  return value.replace(/&quot;/giu, '"').replace(/&#(?:39|x27);/giu, "'")
    .replace(/&amp;/giu, "&").replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">").replace(/&nbsp;/giu, " ");
}

function moneyMinor(value, code) {
  if (typeof value !== "string") fail(`${code}_INVALID`);
  const match = /^\$(\d{1,9})\.(\d{2})$/u.exec(value);
  if (match === null) fail(`${code}_INVALID`);
  const minor = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(minor)) fail(`${code}_INVALID`);
  return minor;
}

function reviewedProductSpec(value) {
  exact(value, ["packCableQuantity", "cableLengthFeet", "connectorA",
    "connectorB", "connectorGender", "powerClaim", "dataTransferClaim",
    "evidenceRefHash"], "REVIEWED_PRODUCT_SPEC");
  const normalized = {
    packCableQuantity: positiveInteger(value.packCableQuantity,
      "PACK_CABLE_QUANTITY"),
    cableLengthFeet: finiteNumber(value.cableLengthFeet,
      "CABLE_LENGTH_FEET"),
    connectorA: identifier(value.connectorA, /^USB_[A-Z0-9_]{1,32}$/u,
      "CONNECTOR_A"),
    connectorB: identifier(value.connectorB, /^USB_[A-Z0-9_]{1,32}$/u,
      "CONNECTOR_B"),
    connectorGender: identifier(value.connectorGender,
      /^(?:MALE_TO_MALE|NOT_EXPLICIT)$/u, "CONNECTOR_GENDER"),
    powerClaim: identifier(value.powerClaim, /^[^\u0000-\u001f\u007f]{1,256}$/u,
      "POWER_CLAIM"),
    dataTransferClaim: identifier(value.dataTransferClaim,
      /^[^\u0000-\u001f\u007f]{1,256}$/u, "DATA_TRANSFER_CLAIM"),
    evidenceRefHash: hash(value.evidenceRefHash,
      "PRODUCT_SPEC_EVIDENCE_REF_HASH"),
  };
  return Object.freeze(normalized);
}

function sourcePins(value) {
  exact(value, ["productSourceBytesHash", "cartSourceBytesHash",
    "guestCheckoutSourceBytesHash"], "SOURCE_PINS");
  return Object.freeze({
    productSourceBytesHash: hash(value.productSourceBytesHash,
      "PRODUCT_SOURCE_BYTES_HASH"),
    cartSourceBytesHash: hash(value.cartSourceBytesHash,
      "CART_SOURCE_BYTES_HASH"),
    guestCheckoutSourceBytesHash: hash(value.guestCheckoutSourceBytesHash,
      "GUEST_CHECKOUT_SOURCE_BYTES_HASH"),
  });
}

function validateBinding(value) {
  exact(value, ["sku", "bsin", "postalCode", "requestedCableQuantity",
    "cartLineQuantity", "requestedDeliveryDate", "maximumAmountMinor",
    "reviewedProductSpec", "sourcePins"], "ROUTE_BINDING");
  return deepFreeze({
    sku: identifier(value.sku, /^[1-9]\d{5,11}$/u, "SKU"),
    bsin: identifier(value.bsin, /^[A-Z0-9]{6,32}$/u, "BSIN"),
    postalCode: identifier(value.postalCode, /^\d{5}(?:-\d{4})?$/u,
      "POSTAL_CODE"),
    requestedCableQuantity: positiveInteger(value.requestedCableQuantity,
      "REQUESTED_CABLE_QUANTITY"),
    cartLineQuantity: positiveInteger(value.cartLineQuantity,
      "CART_LINE_QUANTITY"),
    requestedDeliveryDate: dateOnly(value.requestedDeliveryDate,
      "REQUESTED_DELIVERY_DATE"),
    maximumAmountMinor: moneyMinorText(value.maximumAmountMinor),
    reviewedProductSpec: reviewedProductSpec(value.reviewedProductSpec),
    sourcePins: sourcePins(value.sourcePins),
  });
}

function stage(value) {
  if (!STAGES.includes(value)) fail("STAGE_INVALID");
  return value;
}

function commandBody(binding, stageValue) {
  return {
    schema: COMMAND_SCHEMA,
    schemaVersion: "1.0.0",
    provider: PROVIDER,
    stage: stageValue,
    ...binding,
  };
}

export function createBestBuyBuyerNativeCandidateCommandBytesV1(input = {}) {
  exact(input, ["binding", "stage"], "COMMAND_INPUT");
  const binding = validateBinding(input.binding);
  return Buffer.from(canonicalizeStrict(commandBody(binding,
    stage(input.stage))), "utf8");
}

function parseProductTitle(value) {
  const pack = /\[(\d+)\s*Pack\b[^\]]*\]/iu.exec(value);
  const length = /\b(\d+(?:\.\d+)?)\s*ft\b/iu.exec(value);
  const connector = /\bUSB[\s-]*A\s+to\s+USB[\s-]*C\b/iu.test(value);
  if (pack === null || length === null || !connector) {
    fail("PRODUCT_TITLE_SPEC_INVALID");
  }
  return Object.freeze({ packCableQuantity: Number(pack[1]),
    cableLengthFeet: Number(length[1]), connectorA: "USB_A_MALE",
    connectorB: "USB_C_MALE" });
}

export function normalizeBestBuyProductSourceV1(sourceBytes, input = {}) {
  exact(input, ["sku", "bsin", "requestedCableQuantity",
    "reviewedProductSpec"], "PRODUCT_INPUT");
  const sku = identifier(input.sku, /^[1-9]\d{5,11}$/u, "SKU");
  const bsin = identifier(input.bsin, /^[A-Z0-9]{6,32}$/u, "BSIN");
  const requestedCableQuantity = positiveInteger(input.requestedCableQuantity,
    "REQUESTED_CABLE_QUANTITY");
  const reviewed = reviewedProductSpec(input.reviewedProductSpec);
  const source = sourceText(sourceBytes, "PRODUCT");
  const titleMatch = /<title>([^<]{1,512})<\/title>/iu.exec(source);
  const metadataMatch = /<meta\s+name=["']analytics-metadata["']\s+content=["']([^"']{1,8192})["'][^>]*>/iu.exec(source);
  if (titleMatch === null || metadataMatch === null) {
    fail("PRODUCT_METADATA_MISSING");
  }
  const title = decodeHtml(titleMatch[1]).trim();
  let metadata;
  try { metadata = JSON.parse(decodeHtml(metadataMatch[1])); }
  catch { fail("PRODUCT_METADATA_JSON_INVALID"); }
  const product = metadata?.product;
  if (product?.skuId !== sku || product?.bsin !== bsin
    || typeof product?.price !== "string" || typeof product?.brand !== "string") {
    fail("PRODUCT_IDENTITY_BINDING_INVALID");
  }
  const observed = parseProductTitle(title);
  if (observed.packCableQuantity !== reviewed.packCableQuantity
    || observed.cableLengthFeet !== reviewed.cableLengthFeet
    || observed.connectorA !== reviewed.connectorA
    || observed.connectorB !== reviewed.connectorB) {
    fail("PRODUCT_REVIEWED_SPEC_BINDING_INVALID");
  }
  const lengthMeters = reviewed.cableLengthFeet * 0.3048;
  const sellerStates5V = /(?:^|[^\p{L}\p{N}])5\s*V(?:[^\p{L}\p{N}]|$)/iu
    .test(reviewed.powerClaim);
  const sellerStatesDataTransfer = /(?:480\s*M(?:b|B)ps|data)/iu
    .test(reviewed.dataTransferClaim);
  const matchesExceptPack = reviewed.connectorA === "USB_A_MALE"
    && reviewed.connectorB === "USB_C_MALE"
    && reviewed.connectorGender === "MALE_TO_MALE"
    && lengthMeters >= 0.9 && lengthMeters <= 1.1
    && sellerStates5V && sellerStatesDataTransfer;
  const surplusCableQuantity = Math.max(0,
    reviewed.packCableQuantity - requestedCableQuantity);
  const packQuantityMatches = reviewed.packCableQuantity
    === requestedCableQuantity;
  const exactAcceptanceSatisfied = matchesExceptPack && packQuantityMatches;
  const unitPriceMinor = moneyMinor(`$${product.price}`, "PRODUCT_PRICE");
  return deepFreeze({
    sku, bsin, title, brand: product.brand,
    requestedCableQuantity,
    packCableQuantity: reviewed.packCableQuantity,
    cartLineQuantityRepresentsPacks: true,
    surplusCableQuantity,
    surplusAuthorizationRequired: surplusCableQuantity > 0,
    surplusAuthorizationPresent: false,
    cableLengthFeet: reviewed.cableLengthFeet,
    cableLengthMeters: lengthMeters,
    connectorA: reviewed.connectorA,
    connectorB: reviewed.connectorB,
    connectorGender: reviewed.connectorGender,
    powerClaim: reviewed.powerClaim,
    dataTransferClaim: reviewed.dataTransferClaim,
    reviewedSpecEvidenceRefHash: reviewed.evidenceRefHash,
    reviewedClaimsAreNotReconstructedFromPdpSlice: true,
    sellerStates5V,
    sellerStatesDataTransfer,
    exactCableSpecExceptPackQuantity: matchesExceptPack,
    packQuantityMatches,
    exactAcceptanceSatisfied,
    unitPriceMinor,
    currency: "USD",
    blockingAcceptanceGaps: exactAcceptanceSatisfied ? []
      : [...(!matchesExceptPack ? ["PRODUCT_SPEC_NOT_PROVEN"] : []),
        ...(!packQuantityMatches
          ? ["SURPLUS_PRODUCT_QUANTITY_REQUIRES_USER_AUTHORIZATION"] : [])],
    capacityReserved: false,
    paymentPerformed: false,
    orderSubmitted: false,
  });
}

function assignedJson(source, name, code) {
  const marker = `var ${name} = `;
  const start = source.indexOf(marker);
  if (start < 0) fail(`${code}_MISSING`);
  const objectStart = source.indexOf("{", start + marker.length);
  if (objectStart < 0) fail(`${code}_MISSING`);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = objectStart; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') quoted = false;
      continue;
    }
    if (character === '"') quoted = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(source.slice(objectStart, index + 1)); }
        catch { fail(`${code}_JSON_INVALID`); }
      }
    }
  }
  fail(`${code}_TRUNCATED`);
}

export function normalizeBestBuyCartSourceV1(sourceBytes, input = {}) {
  exact(input, ["sku", "bsin", "postalCode", "cartLineQuantity",
    "requestedDeliveryDate", "maximumAmountMinor"], "CART_INPUT");
  const sku = identifier(input.sku, /^[1-9]\d{5,11}$/u, "SKU");
  const bsin = identifier(input.bsin, /^[A-Z0-9]{6,32}$/u, "BSIN");
  const postalCode = identifier(input.postalCode, /^\d{5}(?:-\d{4})?$/u,
    "POSTAL_CODE");
  const cartLineQuantity = positiveInteger(input.cartLineQuantity,
    "CART_LINE_QUANTITY");
  const requestedDeliveryDate = dateOnly(input.requestedDeliveryDate,
    "REQUESTED_DELIVERY_DATE");
  const maximumAmountMinor = moneyMinorText(input.maximumAmountMinor);
  const cart = assignedJson(sourceText(sourceBytes, "CART"),
    "cartOrderInit", "CART_INITIALIZATION");
  const lines = Array.isArray(cart.lineItems) ? cart.lineItems.filter((line) =>
    line?.item?.skuId === sku) : [];
  if (lines.length !== 1 || lines[0].quantity !== cartLineQuantity
    || lines[0].item.bsin !== bsin) fail("CART_PRODUCT_BINDING_INVALID");
  const line = lines[0];
  const item = line.item;
  const shipping = Array.isArray(item.fulfillments)
    ? item.fulfillments.find((value) => value?.typeCode === "SHIPPING"
      && value.selected === true) : null;
  if (shipping === null || shipping === undefined
    || shipping.zipcode !== postalCode || shipping.backordered !== false) {
    fail("CART_SHIPPING_BINDING_INVALID");
  }
  const sourceEtaDate = typeof shipping.maxDate === "string"
    && Number.isFinite(Date.parse(shipping.maxDate))
    ? new Date(Date.parse(shipping.maxDate)).toISOString().slice(0, 10) : null;
  if (sourceEtaDate === null) fail("CART_ETA_INVALID");
  const summary = cart.orderSummary;
  if (summary === null || typeof summary !== "object"
    || Array.isArray(summary)) fail("CART_ORDER_SUMMARY_INVALID");
  const itemSubtotalMinor = moneyMinor(summary.productTotal,
    "CART_PRODUCT_TOTAL");
  const displayedAllInTotalMinor = moneyMinor(summary.orderTotal,
    "CART_ORDER_TOTAL");
  const shippingFeeMinor = moneyMinor(summary.shippingTotal,
    "CART_SHIPPING_TOTAL");
  const estimatedSalesTaxMinor = moneyMinor(summary.price?.totalSalesTax,
    "CART_SALES_TAX");
  if (displayedAllInTotalMinor !== itemSubtotalMinor + shippingFeeMinor
    + estimatedSalesTaxMinor) fail("CART_TOTAL_MISMATCH");
  const anonymousCartAccepted = cart.authStatus === "G"
    && cart.user?.type === "visitor" && String(cart.cartItemCount)
      === String(cartLineQuantity);
  const shippingAvailability = item.isOutOfStock === false
    && item.fulfillmentOptions?.shippingEligible === true
    && item.fulfillmentOptions?.shippable === true
    ? "AVAILABLE" : "UNAVAILABLE";
  const serialized = canonicalizeStrict(cart);
  const sourceNumericAtpExposed
    = /"(?:availableToPromiseQuantity|atpQuantity)":/u.test(serialized);
  return deepFreeze({
    sku, bsin, model: identifier(item.modelNumber,
      /^[^\u0000-\u001f\u007f]{1,128}$/u, "MODEL"),
    merchant: identifier(item.thirdPartySellerName,
      /^[^\u0000-\u001f\u007f]{1,256}$/u, "MERCHANT"),
    cartLineQuantity,
    sourceQuantityLimit: positiveInteger(line.quantityLimit,
      "SOURCE_QUANTITY_LIMIT", 10_000),
    anonymousCartAccepted,
    shippingAvailability,
    sourceEtaDate,
    sourceEtaText: identifier(shipping.maxEstimatedArrival,
      /^[^\u0000-\u001f\u007f]{1,128}$/u, "SOURCE_ETA_TEXT"),
    requestedDeliveryDate,
    sourceDateMeetsRequestedDeadline:
      sourceEtaDate <= requestedDeliveryDate,
    itemSubtotalMinor,
    shippingFeeMinor,
    estimatedSalesTaxMinor,
    displayedAllInTotalMinor,
    withinMaximumAmount:
      BigInt(displayedAllInTotalMinor) <= BigInt(maximumAmountMinor),
    sourceNumericAtpExposed,
    sourceNumericAtpQuantity: null,
    cartInternalTokenPresent: typeof item.reservation?.token === "string",
    cartInternalTokenProjected: false,
    cartIsCapacityReservation: false,
    capacityReserved: false,
    sourceEtaIsBindingCommitment: false,
    deliveryDeadlineProven: false,
    fullAddressSubmitted: false,
    paymentPerformed: false,
    orderSubmitted: false,
  });
}

export function normalizeBestBuyGuestCheckoutSourceV1(sourceBytes,
  input = {}) {
  exact(input, ["cartLineQuantity"], "GUEST_CHECKOUT_INPUT");
  const cartLineQuantity = positiveInteger(input.cartLineQuantity,
    "CART_LINE_QUANTITY");
  const source = sourceText(sourceBytes, "GUEST_CHECKOUT");
  const meta = assignedJson(source, "initMetaLayer", "GUEST_META");
  const data = assignedJson(source, "initData", "GUEST_DATA");
  const guestButtonCopy = data?.brand?.guestButtonCopy;
  const guestCheckoutOffered = meta.recognized === "anonymous"
    && meta.user_recognized === "anonymous" && meta.loginRequired === false
    && meta.user_numItemsInCart === cartLineQuantity
    && data.allowsGuestFlow === true
    && guestButtonCopy === "Continue as Guest";
  return deepFreeze({
    recognizedUserState: meta.recognized,
    cartLineQuantity,
    guestCheckoutOffered,
    accountRequiredForCheckout: meta.loginRequired !== false,
    guestButtonCopy,
    guestContinuationTokenPresent: typeof data.guestUrl === "string"
      && data.guestUrl.length > 0,
    guestContinuationTokenProjected: false,
    checkoutStarted: false,
    contactSubmitted: false,
    fullAddressSubmitted: false,
    paymentPerformed: false,
    orderSubmitted: false,
  });
}

function expectedHashForStage(binding, stageValue) {
  if (stageValue === "PRODUCT") return binding.sourcePins.productSourceBytesHash;
  if (stageValue === "CART") return binding.sourcePins.cartSourceBytesHash;
  return binding.sourcePins.guestCheckoutSourceBytesHash;
}

function validateRequest(request, binding) {
  exact(request, ["schema", "transactionRefHash", "outcomeIntentRefHash",
    "routeRole", "operation", "effectIdHash", "idempotencyKey",
    "requestBytes", "expiresAt", "expectedPreviousOccurrenceHash",
    "triggerOccurrenceHash"], "BUYER_NATIVE_REQUEST");
  if (request.schema !== "outsider/buyer-native-transaction-account-request/v1"
    || request.routeRole !== "RECOVERY" || !Buffer.isBuffer(request.requestBytes)
    || request.triggerOccurrenceHash !== null) {
    fail("BUYER_NATIVE_REQUEST_INVALID");
  }
  for (const [value, code] of [[request.transactionRefHash,
    "TRANSACTION_REF_HASH"], [request.outcomeIntentRefHash,
    "OUTCOME_INTENT_REF_HASH"], [request.effectIdHash, "EFFECT_ID_HASH"],
  [request.idempotencyKey, "IDEMPOTENCY_KEY"]]) hash(value, code);
  let command;
  try { command = JSON.parse(request.requestBytes.toString("utf8")); }
  catch { fail("COMMAND_JSON_INVALID"); }
  const stageValue = stage(command?.stage);
  const expectedOperation = stageValue === "PRODUCT" ? "QUOTE" : "STATUS";
  if (request.operation !== expectedOperation
    || (request.operation === "QUOTE"
      ? request.expectedPreviousOccurrenceHash !== null
      : !HASH.test(request.expectedPreviousOccurrenceHash ?? ""))
    || canonicalizeStrict(command) !== request.requestBytes.toString("utf8")
    || canonicalizeStrict(command) !== canonicalizeStrict(
      commandBody(binding, stageValue))) fail("COMMAND_BINDING_INVALID");
  return stageValue;
}

async function requestImpl(state, request) {
  const stageValue = validateRequest(request, state.binding);
  const returned = await state.readSourceImpl(Object.freeze({
    provider: PROVIDER,
    stage: stageValue,
    sku: state.binding.sku,
    bsin: state.binding.bsin,
    expectedSourceBytesHash: expectedHashForStage(state.binding, stageValue),
  }));
  const sourceBytes = Buffer.isBuffer(returned)
    ? Buffer.from(returned) : Buffer.from(returned?.sourceBytes ?? []);
  if (sourceBytes.length < 16
    || bytesHash(sourceBytes) !== expectedHashForStage(state.binding,
      stageValue)) fail("SOURCE_PIN_MISMATCH");
  if (stageValue === "PRODUCT") {
    normalizeBestBuyProductSourceV1(sourceBytes, {
      sku: state.binding.sku, bsin: state.binding.bsin,
      requestedCableQuantity: state.binding.requestedCableQuantity,
      reviewedProductSpec: state.binding.reviewedProductSpec,
    });
    return Object.freeze({ sourceBytes, sourceState: "QUOTE_AVAILABLE",
      sourceExpiresAt: request.expiresAt, sourceRecordClass: "QUOTE" });
  }
  if (stageValue === "CART") {
    normalizeBestBuyCartSourceV1(sourceBytes, {
      sku: state.binding.sku, bsin: state.binding.bsin,
      postalCode: state.binding.postalCode,
      cartLineQuantity: state.binding.cartLineQuantity,
      requestedDeliveryDate: state.binding.requestedDeliveryDate,
      maximumAmountMinor: state.binding.maximumAmountMinor,
    });
  } else {
    normalizeBestBuyGuestCheckoutSourceV1(sourceBytes, {
      cartLineQuantity: state.binding.cartLineQuantity,
    });
  }
  return Object.freeze({ sourceBytes, sourceState: "STATE_OBSERVED",
    sourceExpiresAt: null, sourceRecordClass: "STATUS_RECEIPT" });
}

export function issueBestBuyBuyerNativeCandidateCapabilityV1(input = {},
  dependencies = {}) {
  exact(input, ["capabilityRefHash", "accountRefHash", "nodeRefHash",
    "issuedAt", "expiresAt", "binding"], "CAPABILITY_INPUT");
  exact(dependencies, ["readSourceImpl", "revalidateImpl",
    "sourceOccurrenceSink"], "DEPENDENCIES");
  if (typeof dependencies.readSourceImpl !== "function"
    || typeof dependencies.revalidateImpl !== "function"
    || (dependencies.sourceOccurrenceSink !== null
      && typeof dependencies.sourceOccurrenceSink !== "function")) {
    fail("DEPENDENCIES_INVALID");
  }
  const binding = validateBinding(input.binding);
  const state = { binding, readSourceImpl: dependencies.readSourceImpl };
  const capability = issueBuyerNativeTransactionAccountCapabilityV1({
    capabilityRefHash: input.capabilityRefHash,
    accountRefHash: input.accountRefHash,
    nodeRefHash: input.nodeRefHash,
    issuedAt: input.issuedAt,
    expiresAt: input.expiresAt,
    supportedOperations: ["QUOTE", "STATUS"],
  }, { requestImpl: (request) => requestImpl(state, request),
    revalidateImpl: dependencies.revalidateImpl,
    sourceOccurrenceSink: dependencies.sourceOccurrenceSink });
  CAPABILITIES.set(capability, deepFreeze({ provider: PROVIDER, ...binding }));
  return capability;
}

export function inspectBestBuyBuyerNativeCandidateCapabilityV1(capability) {
  const state = CAPABILITIES.get(capability);
  if (state === undefined) fail("CAPABILITY_NOT_FACTORY_ISSUED");
  return Object.freeze({ ...state,
    supportedOperations:
      OUTSIDER_BESTBUY_BUYER_NATIVE_CANDIDATE_ROUTE_V1_BOUNDARY
        .supportedOperations,
    candidateOnly: true,
    surplusAuthorizationRequired:
      state.reviewedProductSpec.packCableQuantity
        > state.requestedCableQuantity,
    cartIsCapacityReservation: false,
    paymentEnabled: false,
    orderSubmissionEnabled: false,
    capacityReserved: false,
    authority: "NONE",
    decisionState: "HOLD",
  });
}
