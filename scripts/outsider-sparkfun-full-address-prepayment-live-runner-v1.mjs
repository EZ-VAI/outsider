#!/usr/bin/env node

/*
 * Live, no-payment SparkFun guest-checkout preparation runner v1.
 *
 * The hot path is deterministic and machine-to-machine:
 * catalog quote -> isolated guest cart -> full-address shipping methods ->
 * cheapest pre-tax-budget-feasible method -> shipping-information -> totals.
 * It never calls payment-information and cannot create an order. The only
 * private input is an owner-only canonical JSON file; raw address/contact data
 * never enter the returned or persisted public projection.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, statSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  createOrderScopedBuyerNativeHttpsTransportV1,
} from "../src/outsider-order-scoped-buyer-native-https-transport-v1.js";
import {
  createSparkFunMagentoGuestCartCommandBytesV1,
  issueSparkFunMagentoGuestCartBuyerNativeCapabilityV1,
} from "../src/outsider-sparkfun-magento-guest-cart-adapter-v1.js";
import {
  createSparkFunMagentoFullAddressPrepaymentCommandBytesV1,
  issueSparkFunMagentoFullAddressPrepaymentCapabilityV1,
  issueSparkFunPrivateFullAddressPrepaymentGrantV1,
} from "../src/outsider-sparkfun-magento-full-address-prepayment-stage-v1.js";

const PREFIX = "OUTSIDER_SPARKFUN_FULL_ADDRESS_PREPAYMENT_LIVE_RUNNER_V1_";
const INPUT_SCHEMA
  = "outsider/private-sparkfun-full-address-prepayment-run-request/v1";
const PUBLIC_SCHEMA
  = "outsider/sparkfun-full-address-prepayment-public-projection/v1";
const PRIVATE_MANIFEST_SCHEMA
  = "outsider/private-sparkfun-full-address-prepayment-run-manifest/v1";
const DEFAULT_PRIVATE_ROOT = path.join(process.cwd(), ".outsider", "private");
const MAX_INPUT_BYTES = 64 * 1024;

function fail(code) {
  const error = new TypeError(`${PREFIX}${code}`);
  error.outsiderCode = code;
  throw error;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return bytesHash(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`,
    "utf8"));
}

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value)) fail(`${code}_OBJECT_INVALID`);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function text(value, code, maximum = 256) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum
    || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function optionalText(value, code, maximum = 256) {
  return value === null ? null : text(value, code, maximum);
}

function validateInput(value) {
  exact(value, ["schema", "schemaVersion", "product", "destination",
    "budget", "completionDeadline", "formationExpiresAt",
    "paymentAuthorized", "orderAuthorized"], "INPUT");
  exact(value.product, ["catalogPath", "productId", "sku", "quantity"],
    "PRODUCT");
  exact(value.destination, ["firstName", "lastName", "email", "telephone",
    "countryCode", "regionId", "region", "regionCode", "city",
    "postalCode", "streetLines"], "DESTINATION");
  exact(value.budget, ["currency", "maximumAmountMinor"], "BUDGET");
  if (value.schema !== INPUT_SCHEMA || value.schemaVersion !== "1.0.0"
    || typeof value.product.catalogPath !== "string"
    || !/^\/[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?\.html$/u
      .test(value.product.catalogPath)
    || typeof value.product.productId !== "string"
    || !/^[1-9]\d{0,9}$/u.test(value.product.productId)
    || typeof value.product.sku !== "string"
    || !/^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/u.test(value.product.sku)
    || !Number.isSafeInteger(value.product.quantity)
    || value.product.quantity < 1 || value.product.quantity > 99
    || value.destination.countryCode !== value.destination.countryCode
      .toUpperCase()
    || !/^[A-Z]{2}$/u.test(value.destination.countryCode)
    || typeof value.destination.postalCode !== "string"
    || value.destination.postalCode !== value.destination.postalCode.trim()
    || !/^[A-Za-z0-9][A-Za-z0-9 .-]{0,31}$/u
      .test(value.destination.postalCode)
    || value.destination.regionId !== null
      && (!Number.isSafeInteger(value.destination.regionId)
        || value.destination.regionId < 1)
    || !Array.isArray(value.destination.streetLines)
    || value.destination.streetLines.length < 1
    || value.destination.streetLines.length > 4
    || value.budget.currency !== "USD"
    || typeof value.budget.maximumAmountMinor !== "string"
    || !/^[1-9]\d{0,30}$/u.test(value.budget.maximumAmountMinor)
    || value.paymentAuthorized !== false || value.orderAuthorized !== false) {
    fail("INPUT_INVALID");
  }
  for (const [field, maximum] of [["firstName", 128], ["lastName", 128],
    ["email", 254], ["telephone", 64], ["city", 128]]) {
    text(value.destination[field], `DESTINATION_${field.toUpperCase()}`,
      maximum);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.destination.email)
    || !/[0-9]/u.test(value.destination.telephone)) fail("CONTACT_INVALID");
  optionalText(value.destination.region, "DESTINATION_REGION", 128);
  optionalText(value.destination.regionCode, "DESTINATION_REGION_CODE", 32);
  value.destination.streetLines.forEach((line) =>
    text(line, "DESTINATION_STREET_LINE", 256));
  const completionDeadline = instant(value.completionDeadline,
    "COMPLETION_DEADLINE");
  const formationExpiresAt = instant(value.formationExpiresAt,
    "FORMATION_EXPIRES_AT");
  if (Date.parse(formationExpiresAt) >= Date.parse(completionDeadline)) {
    fail("FORMATION_MUST_EXPIRE_BEFORE_COMPLETION");
  }
  return Object.freeze({
    schema: value.schema,
    schemaVersion: value.schemaVersion,
    product: Object.freeze({ ...value.product }),
    destination: Object.freeze({ ...value.destination,
      streetLines: Object.freeze([...value.destination.streetLines]) }),
    budget: Object.freeze({ ...value.budget }),
    completionDeadline,
    formationExpiresAt,
    paymentAuthorized: false,
    orderAuthorized: false,
  });
}

function readPrivateInput(file) {
  if (typeof file !== "string" || file === "") fail("INPUT_FILE_REQUIRED");
  const absolute = path.resolve(file);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 3
    || info.size > MAX_INPUT_BYTES) fail("INPUT_FILE_NOT_PRIVATE");
  const bytes = readFileSync(absolute);
  if (bytes.at(-1) !== 0x0a) fail("INPUT_FILE_PARTIAL");
  let value;
  try { value = JSON.parse(bytes.toString("utf8")); }
  catch { fail("INPUT_FILE_JSON_INVALID"); }
  if (`${canonicalizeStrict(value)}\n` !== bytes.toString("utf8")) {
    fail("INPUT_FILE_NOT_CANONICAL");
  }
  return Object.freeze({ absolute, bytesHash: bytesHash(bytes),
    bytes: bytes.length, value: validateInput(value) });
}

function ensurePrivateDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("PRIVATE_DIRECTORY_INVALID");
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
  }
}

function syncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, "r");
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  chmodSync(file, 0o600);
  syncDirectory(path.dirname(file));
  return Object.freeze({ file, bytes: bytes.length, hash: bytesHash(bytes) });
}

function readCartLog(file) {
  if (!existsSync(file)) return { records: [], headHash: null, value: null };
  const info = lstatSync(file);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600) fail("CART_STATE_NOT_PRIVATE");
  const source = readFileSync(file, "utf8");
  if (!source.endsWith("\n")) fail("CART_STATE_PARTIAL");
  const records = source.slice(0, -1).split("\n").map((line) => {
    let record;
    try { record = JSON.parse(line); } catch { fail("CART_STATE_JSON_INVALID"); }
    if (canonicalizeStrict(record) !== line) fail("CART_STATE_NOT_CANONICAL");
    return record;
  });
  let previous = null;
  let current = null;
  records.forEach((record, index) => {
    const { eventHash, ...body } = record;
    if (record.schema !== "outsider/private-cart-state-event/v1"
      || record.schemaVersion !== "1.0.0" || record.sequence !== index + 1
      || record.previousEventHash !== previous
      || !["SET", "CLEAR"].includes(record.kind)
      || eventHash !== digest(record.schema, body)) fail("CART_STATE_CHAIN_INVALID");
    previous = eventHash;
    current = record.kind === "SET" ? record.value : null;
  });
  return { records, headHash: previous, value: current };
}

function createPrivateCartStore(directory) {
  ensurePrivateDirectory(directory);
  const location = (key) => path.join(directory, `${key.slice(7)}.jsonl`);
  const append = (key, kind, value) => {
    if (!/^sha256:[a-f0-9]{64}$/u.test(key)) fail("CART_STATE_KEY_INVALID");
    const file = location(key);
    const prior = readCartLog(file);
    const body = {
      schema: "outsider/private-cart-state-event/v1",
      schemaVersion: "1.0.0",
      sequence: prior.records.length + 1,
      previousEventHash: prior.headHash,
      kind,
      value,
    };
    const event = { ...body, eventHash: digest(body.schema, body) };
    let descriptor;
    try {
      descriptor = openSync(file, "a", 0o600);
      chmodSync(file, 0o600);
      writeAll(descriptor, Buffer.from(`${canonicalizeStrict(event)}\n`,
        "utf8"));
      fsyncSync(descriptor);
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
    syncDirectory(directory);
  };
  return Object.freeze({
    async load(key) {
      const value = readCartLog(location(key)).value;
      return value === null ? null : JSON.parse(canonicalizeStrict(value));
    },
    async store(key, value) { append(key, "SET", value); },
    async clear(key) { append(key, "CLEAR", null); },
  });
}

function moneyMinor(value, code) {
  if (!Number.isFinite(value) || value < 0) fail(`${code}_INVALID`);
  const minor = Math.round(value * 100);
  if (Math.abs(value * 100 - minor) > 1e-7) fail(`${code}_PRECISION_INVALID`);
  return BigInt(minor);
}

function stageCommand(nonce, label, requestBytes, expiresAt, previous) {
  return {
    operationNonce: `sparkfun-live-${label}-${nonce}`,
    requestBytes,
    expiresAt,
    expectedPreviousOccurrenceHash: previous,
    triggerOccurrenceHash: null,
  };
}

function stageClaim(stageId, operation, result) {
  const projection = result.publicProjection;
  const summary = {
    stageId,
    operation,
    operationState: projection.operationState,
    runtimeState: projection.runtimeState,
    sourceState: projection.sourceState,
    sourceOccurrenceHash: projection.sourceOccurrenceHash,
    sourceBytesHash: projection.sourceBytesHash,
    sourceBytesLength: 0,
    retryPermitted: projection.retryPermitted,
  };
  if (projection.operationState !== "SOURCE_OCCURRENCE_OBSERVED") {
    return { summary: Object.freeze(summary), receipt: null };
  }
  const claim = claimBuyerNativeTransactionSourceOccurrenceV1(result);
  let receipt;
  try { receipt = JSON.parse(claim.sourceBytes.toString("utf8")); }
  catch { fail("SOURCE_RECEIPT_JSON_INVALID"); }
  summary.sourceBytesLength = claim.sourceBytes.length;
  return { summary: Object.freeze(summary), receipt };
}

function walkArtifacts(root, relative = "") {
  const directory = path.join(root, relative);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0) fail("ARTIFACT_DIRECTORY_NOT_PRIVATE");
  const rows = [];
  for (const name of readdirSync(directory).sort()) {
    const childRelative = relative === "" ? name : path.join(relative, name);
    const child = path.join(root, childRelative);
    const childInfo = lstatSync(child);
    if (childInfo.isSymbolicLink()) fail("ARTIFACT_SYMLINK_FORBIDDEN");
    if (childInfo.isDirectory()) rows.push(...walkArtifacts(root, childRelative));
    else {
      if (!childInfo.isFile() || (childInfo.mode & 0o077) !== 0) {
        fail("ARTIFACT_FILE_NOT_PRIVATE");
      }
      const bytes = readFileSync(child);
      rows.push(Object.freeze({ relativePath: childRelative,
        bytes: bytes.length, bytesHash: bytesHash(bytes) }));
    }
  }
  return rows;
}

export async function runSparkFunFullAddressPrepaymentLiveV1(options = {}) {
  const inputRecord = readPrivateInput(options.inputFile);
  const input = inputRecord.value;
  const observedAt = instant(options.observedAt ?? new Date().toISOString(),
    "OBSERVED_AT");
  if (Date.parse(observedAt) >= Date.parse(input.formationExpiresAt)) {
    fail("FORMATION_EXPIRED");
  }
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!/^[a-f0-9]{32}$/u.test(nonce)) fail("NONCE_INVALID");
  const privateRoot = path.resolve(options.privateRoot ?? DEFAULT_PRIVATE_ROOT);
  ensurePrivateDirectory(privateRoot);
  const runDirectory = path.join(privateRoot,
    `sparkfun-full-address-prepayment-${observedAt.slice(0, 10)
      .replaceAll("-", "")}-${nonce}`);
  ensurePrivateDirectory(runDirectory);
  const runtimeDirectory = path.join(runDirectory, "runtime");
  ensurePrivateDirectory(runtimeDirectory);
  const cartStore = createPrivateCartStore(path.join(runDirectory,
    "cart-state"));
  const counters = {
    liveHttpRequestCount: 0,
    getRequestCount: 0,
    postRequestCount: 0,
    paymentEndpointAttemptCount: 0,
    orderEndpointAttemptCount: 0,
    modelCallCount: 0,
    interactiveBrowserActionCount: 0,
    employeeTouchCount: 0,
  };
  const rawFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof rawFetch !== "function") fail("FETCH_IMPL_INVALID");
  const countedFetch = async (url, init) => {
    const parsed = new URL(String(url));
    counters.liveHttpRequestCount += 1;
    if (init?.method === "GET") counters.getRequestCount += 1;
    if (init?.method === "POST") counters.postRequestCount += 1;
    if (parsed.pathname.endsWith("/payment-information")) {
      counters.paymentEndpointAttemptCount += 1;
      fail("PAYMENT_ENDPOINT_FORBIDDEN");
    }
    if (/\/orders?(?:$|\/)/u.test(parsed.pathname)) {
      counters.orderEndpointAttemptCount += 1;
      fail("ORDER_ENDPOINT_FORBIDDEN");
    }
    return rawFetch(url, init);
  };
  const transport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: path.join(runDirectory, "https-state"),
    orderRefHash: digest("outsider/sparkfun-live-http-order/v1", { nonce }),
    allowedOrigins: ["https://www.sparkfun.com"],
    timeoutMs: options.timeoutMs ?? 20_000,
    maximumResponseBytes: 768 * 1024,
  }, { fetchImpl: countedFetch, clock: () => Date.parse(observedAt) });
  const accountRefHash = digest("outsider/sparkfun-live-guest-account/v1",
    { nonce });
  const outcomeIntentRefHash = digest(
    "outsider/sparkfun-live-prepayment-outcome/v1", {
      product: input.product,
      budget: input.budget,
      completionDeadline: input.completionDeadline,
    });
  const destinationRefHash = digest(
    "outsider/sparkfun-private-full-destination/v1", input.destination);
  const revalidateImpl = async (entry) => ({ active: true,
    capabilityRefHash: entry.capabilityRefHash,
    accountRefHash: entry.accountRefHash,
    observedAt: entry.observedAt,
    expiresAt: input.formationExpiresAt });
  const ref = (label) => digest("outsider/sparkfun-live-prepayment-ref/v1",
    { nonce, label });
  const cartCapability = issueSparkFunMagentoGuestCartBuyerNativeCapabilityV1({
    capabilityRefHash: ref("cart-capability"),
    accountRefHash,
    nodeRefHash: ref("sparkfun-node"),
    issuedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    ...input.product,
  }, {
    httpsRequestImpl: transport,
    revalidateImpl,
    loadPrivateCartStateImpl: cartStore.load,
    storePrivateCartStateImpl: cartStore.store,
    clearPrivateCartStateImpl: cartStore.clear,
  });
  const cartTransactionRefHash = ref("cart-transaction");
  const cartRuntime = createBuyerNativeTransactionRouteRuntimeV1({
    journalDirectory: runtimeDirectory,
    journalId: `transaction_${cartTransactionRefHash.slice(7, 39)}`,
    transactionRefHash: cartTransactionRefHash,
    outcomeIntentRefHash,
    routeRole: "PRIMARY",
    formationExpiresAt: input.formationExpiresAt,
  }, { capability: cartCapability, clock: () => observedAt });
  const stages = [];
  let selectedShippingMethod = null;
  let finalTotalMinor = null;
  let readyForPaymentAuthorization = false;
  let nextGate = "SOURCE_OCCURRENCE_REQUIRED";
  let runState = "HOLD";

  const finish = () => {
    const budgetSatisfied = finalTotalMinor !== null
      && BigInt(finalTotalMinor) <= BigInt(input.budget.maximumAmountMinor);
    const body = {
      schema: PUBLIC_SCHEMA,
      schemaVersion: "1.0.0",
      observedAt,
      provider: "SPARKFUN_MAGENTO_GUEST_CART",
      executionClass: options.fetchImpl === undefined
        ? "LIVE_PROVIDER_HTTPS" : "INJECTED_HTTPS_TRANSPORT",
      outcomeIntentRefHash,
      destinationRefHash,
      product: Object.freeze({ ...input.product }),
      budget: Object.freeze({ ...input.budget }),
      completionDeadline: input.completionDeadline,
      stages: Object.freeze([...stages]),
      selectedShippingMethod,
      finalTotalMinor,
      budgetSatisfied,
      readyForPaymentAuthorization:
        readyForPaymentAuthorization && budgetSatisfied,
      structuredEtaAvailable: false,
      deliveryDeadlineProven: false,
      runState,
      nextGate,
      counters: Object.freeze({ ...counters }),
      privateInputBytesHash: inputRecord.bytesHash,
      privateInputBytes: inputRecord.bytes,
      rawPrivateInputProjected: false,
      providerSourceEstablishesCapacity: false,
      capacityReserved: false,
      paymentAuthorized: false,
      paymentMethodSelected: false,
      paymentPerformed: false,
      orderAuthorized: false,
      orderSubmitted: false,
      userResultCommitted: false,
    };
    const projection = Object.freeze({ ...body,
      projectionHash: digest(body.schema, body) });
    const publicArtifact = writeOnce(path.join(runDirectory,
      "public-projection.json"), projection);
    const artifactInventory = walkArtifacts(runDirectory);
    const manifestBody = {
      schema: PRIVATE_MANIFEST_SCHEMA,
      schemaVersion: "1.0.0",
      observedAt,
      inputFileRefHash: digest("outsider/private-input-file-ref/v1", {
        absolutePathHash: bytesHash(Buffer.from(inputRecord.absolute, "utf8")),
        inputBytesHash: inputRecord.bytesHash,
      }),
      projectionHash: projection.projectionHash,
      artifactInventory,
      artifactCount: artifactInventory.length,
      artifactBytes: artifactInventory.reduce((sum, row) => sum + row.bytes, 0),
      artifactSetHash: digest("outsider/sparkfun-private-artifact-set/v1",
        artifactInventory),
      exactSourceArtifactsRemainPrivate0600: true,
      paymentPerformed: false,
      orderSubmitted: false,
    };
    const privateManifest = Object.freeze({ ...manifestBody,
      manifestHash: digest(manifestBody.schema, manifestBody) });
    const privateManifestArtifact = writeOnce(path.join(runDirectory,
      "private-manifest.json"), privateManifest);
    return Object.freeze({ runDirectory, projection, publicArtifact,
      privateManifest, privateManifestArtifact });
  };

  const cartBytes = createSparkFunMagentoGuestCartCommandBytesV1({
    sku: input.product.sku,
    quantity: input.product.quantity,
  });
  const catalogResult = await cartRuntime.quote(stageCommand(nonce,
    "catalog-quote", cartBytes, input.formationExpiresAt, null));
  const catalog = stageClaim("01_CATALOG_QUOTE", "QUOTE", catalogResult);
  stages.push(catalog.summary);
  if (catalog.receipt === null
    || catalogResult.publicProjection.sourceState !== "QUOTE_AVAILABLE") {
    nextGate = catalogResult.publicProjection.operationState
      === "AMBIGUOUS_NO_RETRY_HOLD"
      ? "AMBIGUOUS_NO_RETRY_NEW_VERSIONED_RUN_REQUIRED"
      : "CATALOG_UNAVAILABLE";
    return finish();
  }
  const catalogOccurrence = catalogResult.publicProjection.sourceOccurrenceHash;
  const cartResult = await cartRuntime.hold(stageCommand(nonce,
    "isolated-cart", cartBytes, input.formationExpiresAt, catalogOccurrence));
  const cart = stageClaim("02_ISOLATED_GUEST_CART", "HOLD", cartResult);
  stages.push(cart.summary);
  if (cart.receipt === null
    || cartResult.publicProjection.sourceState !== "CART_READY") {
    nextGate = cartResult.publicProjection.operationState
      === "AMBIGUOUS_NO_RETRY_HOLD"
      ? "AMBIGUOUS_NO_RETRY_NEW_VERSIONED_RUN_REQUIRED"
      : "ISOLATED_CART_NOT_READY";
    return finish();
  }
  const cartStateKey = digest(
    "outsider/sparkfun-order-scoped-private-cart/v1", {
      accountRefHash,
      transactionRefHash: cartTransactionRefHash,
      productId: input.product.productId,
      sku: input.product.sku,
      quantity: input.product.quantity,
    });
  const destinationGrant = issueSparkFunPrivateFullAddressPrepaymentGrantV1({
    destinationRefHash,
    authorizedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    ...input.destination,
  });
  const prepaymentCapability
    = issueSparkFunMagentoFullAddressPrepaymentCapabilityV1({
      capabilityRefHash: ref("prepayment-capability"),
      accountRefHash,
      nodeRefHash: ref("sparkfun-node"),
      issuedAt: observedAt,
      expiresAt: input.formationExpiresAt,
      productId: input.product.productId,
      sku: input.product.sku,
      quantity: input.product.quantity,
      destinationGrant,
    }, {
      httpsRequestImpl: transport,
      revalidateImpl,
      async loadPrivateCartStateImpl(stageKey) {
        const source = await cartStore.load(cartStateKey);
        return source === null ? null : { ...source, sessionRefHash: stageKey };
      },
    });
  const prepaymentTransactionRefHash = ref("prepayment-transaction");
  const prepaymentRuntime = createBuyerNativeTransactionRouteRuntimeV1({
    journalDirectory: runtimeDirectory,
    journalId: `transaction_${prepaymentTransactionRefHash.slice(7, 39)}`,
    transactionRefHash: prepaymentTransactionRefHash,
    outcomeIntentRefHash,
    routeRole: "PRIMARY",
    formationExpiresAt: input.formationExpiresAt,
  }, { capability: prepaymentCapability, clock: () => observedAt });
  const ratesBytes
    = createSparkFunMagentoFullAddressPrepaymentCommandBytesV1(
      prepaymentCapability, { stage: "FULL_ADDRESS_SHIPPING_METHODS",
        selectedCarrierCode: null, selectedMethodCode: null,
        previousQuoteOccurrenceHash: null });
  const ratesResult = await prepaymentRuntime.quote(stageCommand(nonce,
    "full-address-rates", ratesBytes, input.formationExpiresAt, null));
  const rates = stageClaim("03_FULL_ADDRESS_SHIPPING_METHODS", "QUOTE",
    ratesResult);
  stages.push(rates.summary);
  if (rates.receipt === null
    || ratesResult.publicProjection.sourceState !== "QUOTE_AVAILABLE") {
    nextGate = ratesResult.publicProjection.operationState
      === "AMBIGUOUS_NO_RETRY_HOLD"
      ? "AMBIGUOUS_NO_RETRY_NEW_VERSIONED_RUN_REQUIRED"
      : "NO_FULL_ADDRESS_SHIPPING_METHOD";
    return finish();
  }
  const subtotalMinor = moneyMinor(cart.receipt.normalized.subtotal,
    "CART_SUBTOTAL");
  const maximumAmountMinor = BigInt(input.budget.maximumAmountMinor);
  const feasible = rates.receipt.normalized.rates
    .filter((rate) => rate.available === true
      && subtotalMinor + moneyMinor(rate.amount, "SHIPPING_RATE")
        <= maximumAmountMinor)
    .sort((left, right) => left.amount - right.amount
      || `${left.carrierCode}:${left.methodCode}`.localeCompare(
        `${right.carrierCode}:${right.methodCode}`));
  const selected = feasible[0];
  if (selected === undefined) {
    nextGate = "NO_SOURCE_OFFERED_METHOD_WITHIN_PRETAX_BUDGET";
    return finish();
  }
  selectedShippingMethod = Object.freeze({
    carrierCode: selected.carrierCode,
    methodCode: selected.methodCode,
    sourceQuotedAmountMinor: moneyMinor(selected.amount,
      "SELECTED_SHIPPING_RATE").toString(),
  });
  const ratesOccurrence = ratesResult.publicProjection.sourceOccurrenceHash;
  const prepareBytes
    = createSparkFunMagentoFullAddressPrepaymentCommandBytesV1(
      prepaymentCapability, { stage: "APPLY_SHIPPING_AND_RECOMPUTE",
        selectedCarrierCode: selected.carrierCode,
        selectedMethodCode: selected.methodCode,
        previousQuoteOccurrenceHash: ratesOccurrence });
  const preparedResult = await prepaymentRuntime.hold(stageCommand(nonce,
    "apply-shipping", prepareBytes, input.formationExpiresAt,
    ratesOccurrence));
  const prepared = stageClaim("04_APPLY_SHIPPING_AND_RECOMPUTE", "HOLD",
    preparedResult);
  stages.push(prepared.summary);
  if (prepared.receipt === null) {
    nextGate = preparedResult.publicProjection.operationState
      === "AMBIGUOUS_NO_RETRY_HOLD"
      ? "AMBIGUOUS_NO_RETRY_NEW_VERSIONED_RUN_REQUIRED"
      : "CHECKOUT_PREPARATION_SOURCE_NOT_OBSERVED";
    return finish();
  }
  finalTotalMinor = moneyMinor(prepared.receipt.normalized.totals.grandTotal,
    "FINAL_TOTAL").toString();
  readyForPaymentAuthorization
    = prepared.receipt.normalized.readyForPaymentAuthorization === true;
  const withinBudget = BigInt(finalTotalMinor) <= maximumAmountMinor;
  runState = withinBudget && readyForPaymentAuthorization
    ? "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN_HOLD" : "HOLD";
  nextGate = !withinBudget ? "FINAL_TOTAL_EXCEEDS_BUDGET_ROUTE_REPLACEMENT"
    : !readyForPaymentAuthorization ? "PAYMENT_METHOD_UNAVAILABLE"
      : "NEEDS_STRUCTURED_ETA_AND_SEPARATE_PAYMENT_AUTHORIZATION";
  return finish();
}

function parseCli(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { help: true };
  const known = new Set(["--live-no-payment", "--input", "--private-root"]);
  let inputFile;
  let privateRoot;
  let confirmed = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!known.has(flag)) fail("ARGUMENT_INVALID");
    if (flag === "--live-no-payment") { confirmed = true; continue; }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail("ARGUMENT_VALUE_REQUIRED");
    if (flag === "--input") inputFile = value;
    if (flag === "--private-root") privateRoot = value;
    index += 1;
  }
  if (!confirmed) fail("LIVE_NO_PAYMENT_CONFIRMATION_REQUIRED");
  if (inputFile === undefined) fail("INPUT_FILE_REQUIRED");
  return { help: false, inputFile, privateRoot };
}

async function main(argv) {
  const options = parseCli(argv);
  if (options.help) {
    process.stdout.write([
      "Usage:",
      "  node scripts/outsider-sparkfun-full-address-prepayment-live-runner-v1.mjs \\",
      "    --live-no-payment --input MODE_0600_CANONICAL_JSON \\",
      "    [--private-root MODE_0700_DIRECTORY]",
      "",
      "Creates an isolated guest cart and submits the private delivery/contact",
      "profile to SparkFun shipping preparation. It cannot call the payment",
      "endpoint, select a payment method, or submit an order.",
      "",
    ].join("\n"));
    return;
  }
  const result = await runSparkFunFullAddressPrepaymentLiveV1(options);
  process.stdout.write(`${canonicalizeStrict({
    runDirectory: result.runDirectory,
    publicProjection: result.projection,
    publicProjectionFile: result.publicArtifact.file,
    privateManifestFile: result.privateManifestArtifact.file,
  })}\n`);
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { await main(process.argv.slice(2)); }
  catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
