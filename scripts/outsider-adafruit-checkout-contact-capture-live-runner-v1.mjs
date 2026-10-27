#!/usr/bin/env node

/*
 * Live Adafruit checkout contact/address-form capture runner v1.
 *
 * Deterministic machine path: catalog -> isolated guest cart -> checkout
 * contact form -> submit contact -> capture address/shipping form. The private
 * input must be canonical owner-only JSON. This runner has no address-submit,
 * payment, or order-submit path.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, fsyncSync, lstatSync, mkdirSync,
  openSync, readFileSync, readdirSync, writeSync,
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
  createAdafruitGuestShopperCommandBytesV1,
  issueAdafruitGuestShopperBuyerNativeCapabilityV1,
} from "../src/outsider-adafruit-guest-shopper-adapter-v1.js";
import {
  createAdafruitCheckoutContactCaptureCommandBytesV1,
  issueAdafruitCheckoutContactCaptureCapabilityV1,
  issueAdafruitPrivateCheckoutContactGrantV1,
} from "../src/outsider-adafruit-checkout-contact-capture-stage-v1.js";

const PREFIX = "OUTSIDER_ADAFRUIT_CHECKOUT_CONTACT_CAPTURE_LIVE_RUNNER_V1_";
const ACCEPTED_INPUT_SCHEMA
  = "outsider/private-sparkfun-full-address-prepayment-run-request/v1";
const PUBLIC_SCHEMA
  = "outsider/adafruit-checkout-contact-capture-public-projection/v1";
const PRODUCT = Object.freeze({ productId: "4474", quantity: 1 });
const ORIGIN = "https://www.adafruit.com";
const DEFAULT_PRIVATE_ROOT = path.join(process.cwd(), ".outsider", "private");

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
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function privateText(value, code, maximum) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum
    || value !== value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function validateInput(value) {
  exact(value, ["schema", "schemaVersion", "product", "destination",
    "budget", "completionDeadline", "formationExpiresAt",
    "paymentAuthorized", "orderAuthorized"], "INPUT");
  exact(value.destination, ["firstName", "lastName", "email", "telephone",
    "countryCode", "regionId", "region", "regionCode", "city",
    "postalCode", "streetLines"], "DESTINATION");
  exact(value.budget, ["currency", "maximumAmountMinor"], "BUDGET");
  if (value.schema !== ACCEPTED_INPUT_SCHEMA || value.schemaVersion !== "1.0.0"
    || value.paymentAuthorized !== false || value.orderAuthorized !== false
    || value.budget.currency !== "USD"
    || typeof value.budget.maximumAmountMinor !== "string"
    || !/^[1-9]\d{0,30}$/u.test(value.budget.maximumAmountMinor)
    || value.destination.countryCode !== "US"
    || !Array.isArray(value.destination.streetLines)
    || value.destination.streetLines.length < 1
    || value.destination.streetLines.length > 4) fail("INPUT_INVALID");
  for (const [field, maximum] of [["firstName", 128], ["lastName", 128],
    ["email", 254], ["telephone", 64], ["city", 128],
    ["postalCode", 32]]) {
    privateText(value.destination[field], `DESTINATION_${field.toUpperCase()}`,
      maximum);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(value.destination.email)
    || !/[0-9]/u.test(value.destination.telephone)) fail("CONTACT_INVALID");
  value.destination.streetLines.forEach((line) =>
    privateText(line, "DESTINATION_STREET_LINE", 256));
  const completionDeadline = instant(value.completionDeadline,
    "COMPLETION_DEADLINE");
  const formationExpiresAt = instant(value.formationExpiresAt,
    "FORMATION_EXPIRES_AT");
  if (Date.parse(formationExpiresAt) >= Date.parse(completionDeadline)) {
    fail("FORMATION_MUST_EXPIRE_BEFORE_COMPLETION");
  }
  return Object.freeze({
    destination: Object.freeze({ ...value.destination,
      streetLines: Object.freeze([...value.destination.streetLines]) }),
    budget: Object.freeze({ ...value.budget }),
    completionDeadline,
    formationExpiresAt,
  });
}

function readPrivateInput(file) {
  if (typeof file !== "string" || file === "") fail("INPUT_FILE_REQUIRED");
  const absolute = path.resolve(file);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 3 || info.size > 64 * 1024) {
    fail("INPUT_FILE_NOT_PRIVATE");
  }
  const bytes = readFileSync(absolute);
  if (bytes.at(-1) !== 0x0a) fail("INPUT_FILE_PARTIAL");
  let parsed;
  try { parsed = JSON.parse(bytes.toString("utf8")); }
  catch { fail("INPUT_FILE_JSON_INVALID"); }
  if (`${canonicalizeStrict(parsed)}\n` !== bytes.toString("utf8")) {
    fail("INPUT_FILE_NOT_CANONICAL");
  }
  return Object.freeze({ absolute, bytes: bytes.length,
    bytesHash: bytesHash(bytes), value: validateInput(parsed) });
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
  try { descriptor = openSync(directory, "r"); fsyncSync(descriptor); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function writeOnce(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  chmodSync(file, 0o600);
  syncDirectory(path.dirname(file));
  return Object.freeze({ file, bytes: bytes.length, hash: bytesHash(bytes) });
}

function artifactInventory(root, relative = "") {
  const directory = path.join(root, relative);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0) fail("ARTIFACT_DIRECTORY_NOT_PRIVATE");
  const output = [];
  for (const name of readdirSync(directory).sort()) {
    const childRelative = relative === "" ? name : path.join(relative, name);
    const child = path.join(root, childRelative);
    const childInfo = lstatSync(child);
    if (childInfo.isSymbolicLink()) fail("ARTIFACT_SYMLINK_FORBIDDEN");
    if (childInfo.isDirectory()) output.push(...artifactInventory(root,
      childRelative));
    else {
      if (!childInfo.isFile() || (childInfo.mode & 0o077) !== 0) {
        fail("ARTIFACT_FILE_NOT_PRIVATE");
      }
      const bytes = readFileSync(child);
      output.push(Object.freeze({ relativePath: childRelative,
        bytes: bytes.length, bytesHash: bytesHash(bytes) }));
    }
  }
  return output;
}

function stageCommand(nonce, label, requestBytes, expiresAt, previous) {
  return { operationNonce: `adafruit-contact-${label}-${nonce}`,
    requestBytes, expiresAt, expectedPreviousOccurrenceHash: previous,
    triggerOccurrenceHash: null };
}

function stageClaim(stageId, operation, result) {
  const projection = result.publicProjection;
  const summary = { stageId, operation,
    operationState: projection.operationState,
    runtimeState: projection.runtimeState,
    sourceState: projection.sourceState,
    sourceOccurrenceHash: projection.sourceOccurrenceHash,
    sourceBytesHash: projection.sourceBytesHash,
    sourceBytesLength: 0,
    retryPermitted: projection.retryPermitted };
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

export async function runAdafruitCheckoutContactCaptureLiveV1(options = {}) {
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
    `adafruit-contact-capture-${observedAt.slice(0, 10).replaceAll("-", "")}-${nonce}`);
  ensurePrivateDirectory(runDirectory);
  const runtimeDirectory = path.join(runDirectory, "runtime");
  ensurePrivateDirectory(runtimeDirectory);
  const counters = { liveHttpRequestCount: 0, getRequestCount: 0,
    postRequestCount: 0, addressSubmitAttemptCount: 0,
    paymentEndpointAttemptCount: 0, orderEndpointAttemptCount: 0,
    modelCallCount: 0, interactiveBrowserActionCount: 0,
    employeeTouchCount: 0 };
  const rawFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof rawFetch !== "function") fail("FETCH_IMPL_INVALID");
  const countedFetch = async (url, init) => {
    const parsed = new URL(String(url));
    counters.liveHttpRequestCount += 1;
    if (init?.method === "GET") counters.getRequestCount += 1;
    if (init?.method === "POST") counters.postRequestCount += 1;
    if (parsed.origin !== ORIGIN) fail("ORIGIN_FORBIDDEN");
    if (/payment/iu.test(parsed.pathname)) {
      counters.paymentEndpointAttemptCount += 1;
      fail("PAYMENT_ENDPOINT_FORBIDDEN");
    }
    if (/place[-_]?order|submit[-_]?order|\/orders?(?:$|\/)/iu
      .test(parsed.pathname)) {
      counters.orderEndpointAttemptCount += 1;
      fail("ORDER_ENDPOINT_FORBIDDEN");
    }
    if (parsed.pathname === "/checkout" && init?.method === "POST") {
      const body = new URLSearchParams(Buffer.from(init.body).toString("utf8"));
      if (body.get("action") !== "save_one") {
        counters.addressSubmitAttemptCount += 1;
        fail("ONLY_CONTACT_STEP_ONE_ALLOWED");
      }
    }
    return rawFetch(url, init);
  };
  const transport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: path.join(runDirectory, "https-state"),
    orderRefHash: digest("outsider/adafruit-contact-live-http-order/v1",
      { nonce }),
    allowedOrigins: [ORIGIN],
    timeoutMs: options.timeoutMs ?? 20_000,
    maximumResponseBytes: 768 * 1024,
  }, { fetchImpl: countedFetch, clock: () => Date.parse(observedAt) });
  const ref = (label) => digest("outsider/adafruit-contact-live-ref/v1",
    { nonce, label });
  const accountRefHash = ref("guest-account");
  const outcomeIntentRefHash = digest("outsider/adafruit-contact-outcome/v1", {
    product: PRODUCT,
    budget: input.budget,
    completionDeadline: input.completionDeadline,
  });
  const destinationRefHash = digest("outsider/private-full-destination/v1",
    input.destination);
  const contactRefHash = digest("outsider/private-checkout-contact/v1", {
    destinationRefHash, email: input.destination.email,
  });
  const revalidateImpl = async (entry) => ({ active: true,
    capabilityRefHash: entry.capabilityRefHash,
    accountRefHash: entry.accountRefHash,
    observedAt: entry.observedAt,
    expiresAt: input.formationExpiresAt });
  const createRuntime = (transactionRefHash, capability) =>
    createBuyerNativeTransactionRouteRuntimeV1({
      journalDirectory: runtimeDirectory,
      journalId: `transaction_${transactionRefHash.slice(7, 39)}`,
      transactionRefHash,
      outcomeIntentRefHash,
      routeRole: "RECOVERY",
      formationExpiresAt: input.formationExpiresAt,
    }, { capability, clock: () => observedAt });
  const stages = [];
  const finish = (state, nextGate, observedForm = null,
    contactSubmitted = false) => {
    const body = {
      schema: PUBLIC_SCHEMA,
      schemaVersion: "1.0.0",
      observedAt,
      provider: "ADAFRUIT_GUEST_SHOPPER",
      routeRole: "RECOVERY",
      executionClass: options.fetchImpl === undefined
        ? "LIVE_PROVIDER_HTTPS" : "INJECTED_HTTPS_TRANSPORT",
      outcomeIntentRefHash,
      destinationRefHash,
      contactRefHash,
      product: PRODUCT,
      budget: input.budget,
      completionDeadline: input.completionDeadline,
      stages: Object.freeze([...stages]),
      addressShippingForm: observedForm,
      contactSubmitted,
      fullAddressSubmitted: false,
      machineUsableNextRateInterfaceObserved:
        observedForm?.machineUsableNextPostObserved === true,
      runState: state,
      nextGate,
      counters: Object.freeze({ ...counters }),
      privateInputBytesHash: inputRecord.bytesHash,
      privateInputBytes: inputRecord.bytes,
      rawPrivateInputProjected: false,
      rawContactProjected: false,
      rawAddressProjected: false,
      paymentAuthorized: false,
      paymentMethodSelected: false,
      paymentPerformed: false,
      orderAuthorized: false,
      orderSubmitted: false,
      capacityReserved: false,
      userResultCommitted: false,
    };
    const projection = Object.freeze({ ...body,
      projectionHash: digest(body.schema, body) });
    const publicArtifact = writeOnce(path.join(runDirectory,
      "public-projection.json"), projection);
    const inventory = artifactInventory(runDirectory);
    const manifestBody = {
      schema: "outsider/private-adafruit-checkout-contact-capture-manifest/v1",
      schemaVersion: "1.0.0",
      observedAt,
      projectionHash: projection.projectionHash,
      inputBytesHash: inputRecord.bytesHash,
      artifactInventory: inventory,
      artifactCount: inventory.length,
      artifactBytes: inventory.reduce((sum, row) => sum + row.bytes, 0),
      exactSourceArtifactsRemainPrivate0600: true,
      contactSubmitted: projection.contactSubmitted,
      fullAddressSubmitted: false,
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

  const cartCapability = issueAdafruitGuestShopperBuyerNativeCapabilityV1({
    capabilityRefHash: ref("cart-capability"),
    accountRefHash,
    nodeRefHash: ref("adafruit-node"),
    issuedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    ...PRODUCT,
  }, { httpsRequestImpl: transport, revalidateImpl });
  const cartTransactionRefHash = ref("cart-transaction");
  const cartRuntime = createRuntime(cartTransactionRefHash, cartCapability);
  const cartBytes = createAdafruitGuestShopperCommandBytesV1(PRODUCT);
  const quoteResult = await cartRuntime.quote(stageCommand(nonce,
    "catalog", cartBytes, input.formationExpiresAt, null));
  const quote = stageClaim("01_CATALOG_QUOTE", "QUOTE", quoteResult);
  stages.push(quote.summary);
  if (quote.receipt === null
    || quoteResult.publicProjection.sourceState !== "QUOTE_AVAILABLE") {
    return finish("HOLD", "CATALOG_UNAVAILABLE");
  }
  const cartResult = await cartRuntime.hold(stageCommand(nonce,
    "isolated-cart", cartBytes, input.formationExpiresAt,
    quoteResult.publicProjection.sourceOccurrenceHash));
  const cart = stageClaim("02_ISOLATED_GUEST_CART", "HOLD", cartResult);
  stages.push(cart.summary);
  if (cart.receipt === null
    || cartResult.publicProjection.sourceState !== "CART_READY") {
    return finish("HOLD", "ISOLATED_CART_NOT_READY");
  }
  const contactGrant = issueAdafruitPrivateCheckoutContactGrantV1({
    contactRefHash,
    authorizedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    email: input.destination.email,
  });
  const contactCapability = issueAdafruitCheckoutContactCaptureCapabilityV1({
    capabilityRefHash: ref("contact-capability"),
    accountRefHash,
    nodeRefHash: ref("adafruit-node"),
    issuedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    ...PRODUCT,
    contactGrant,
  }, { httpsRequestImpl: transport, revalidateImpl });
  const contactTransactionRefHash = ref("contact-transaction");
  const contactRuntime = createRuntime(contactTransactionRefHash,
    contactCapability);
  const contactBytes = createAdafruitCheckoutContactCaptureCommandBytesV1(
    PRODUCT);
  const contactQuoteResult = await contactRuntime.quote(stageCommand(nonce,
    "contact-form", contactBytes, input.formationExpiresAt, null));
  const contactQuote = stageClaim("03_CONTACT_FORM", "QUOTE",
    contactQuoteResult);
  stages.push(contactQuote.summary);
  if (contactQuote.receipt === null
    || contactQuoteResult.publicProjection.sourceState !== "QUOTE_AVAILABLE") {
    return finish("HOLD", "CONTACT_FORM_NOT_AVAILABLE");
  }
  const captureResult = await contactRuntime.hold(stageCommand(nonce,
    "contact-submit", contactBytes, input.formationExpiresAt,
    contactQuoteResult.publicProjection.sourceOccurrenceHash));
  const capture = stageClaim("04_CONTACT_SUBMIT_ADDRESS_FORM_CAPTURE", "HOLD",
    captureResult);
  stages.push(capture.summary);
  if (capture.receipt === null
    || captureResult.publicProjection.sourceState !== "HOLD_ACKNOWLEDGED") {
    return finish("HOLD", "ADDRESS_SHIPPING_FORM_PROTOCOL_GAP", null,
      capture.receipt?.normalized?.contactSubmitted === true);
  }
  const form = capture.receipt.normalized.addressShippingForm;
  return finish("ADDRESS_SHIPPING_FORM_CAPTURED_NO_PAYMENT_HOLD",
    form?.machineUsableNextPostObserved === true
      ? "COMPILE_PRIVATE_FULL_ADDRESS_FOR_OBSERVED_NEXT_POST"
      : "NEXT_RATE_INTERFACE_ACTION_UNPROVEN", form, true);
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
    if (value === undefined || value.startsWith("--")) {
      fail("ARGUMENT_VALUE_REQUIRED");
    }
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
      "  node scripts/outsider-adafruit-checkout-contact-capture-live-runner-v1.mjs \\",
      "    --live-no-payment --input MODE_0600_CANONICAL_JSON \\",
      "    [--private-root MODE_0700_DIRECTORY]",
      "",
      "Creates one isolated Adafruit guest cart, submits contact step 1, and",
      "captures the address/shipping form. It cannot submit an address, payment,",
      "or order.",
      "",
    ].join("\n"));
    return;
  }
  const result = await runAdafruitCheckoutContactCaptureLiveV1(options);
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
