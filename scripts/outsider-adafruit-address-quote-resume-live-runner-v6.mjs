#!/usr/bin/env node

/*
 * Adafruit address-quote continuation v6.
 *
 * A prior v5 Attempt has one ambiguous local contact result but externally
 * observed contact success.  This descendant never repeats that POST.  It
 * verifies the frozen prior projection/manifest and exact cookie artifact,
 * copies the cookie bytes into a new private run, consumes a new one-use
 * residual grant, and runs only address-stage v2 QUOTE -> HOLD.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  claimBuyerNativeTransactionSourceOccurrenceV1,
  createBuyerNativeTransactionRouteRuntimeV1,
} from "../src/outsider-buyer-native-transaction-capability-v1.js";
import {
  createBuyerNativeRouteEvidenceV1,
} from "../src/outsider-buyer-native-route-evidence-v1.js";
import {
  createOrderScopedBuyerNativeHttpsTransportV1,
} from "../src/outsider-order-scoped-buyer-native-https-transport-v1.js";
import {
  createAdafruitFullAddressShippingQuoteCommandBytesV2,
  issueAdafruitFullAddressShippingQuoteCapabilityV2,
  issueAdafruitPrivateFullAddressShippingQuoteGrantV2,
} from "../src/outsider-adafruit-full-address-shipping-quote-stage-v2.js";
import {
  normalizeProviderNeutralRouteQuoteInputV5,
} from "./outsider-adafruit-full-address-shipping-quote-live-runner-v5.mjs";

const PREFIX = "OUTSIDER_ADAFRUIT_ADDRESS_QUOTE_RESUME_LIVE_RUNNER_V6_";
export const OUTSIDER_ADAFRUIT_ADDRESS_QUOTE_RESIDUAL_GRANT_SCHEMA_V6
  = "outsider/private-adafruit-address-quote-residual-use-grant/v6";
const PUBLIC_SCHEMA
  = "outsider/adafruit-address-quote-resume-public-projection/v6";
const MANIFEST_SCHEMA
  = "outsider/private-adafruit-address-quote-resume-manifest/v6";
const PRIOR_PROJECTION_SCHEMA
  = "outsider/adafruit-full-address-shipping-quote-public-projection/v5";
const PRIOR_MANIFEST_SCHEMA
  = "outsider/private-adafruit-full-address-shipping-quote-manifest/v5";
const ORIGIN = "https://www.adafruit.com";
const PURPOSE = "RESUME_CONFIRMED_CONTACT_TO_DESTINATION_QUOTE_ONLY";
const PERMITTED_ACTIONS = Object.freeze([
  "READ_CHECKOUT_STEP_2",
  "SUBMIT_ADDRESS_SAVE_TWO",
  "READ_SHIPPING_RATES_STEP_3",
]);
const FORBIDDEN_ACTIONS = Object.freeze([
  "CONTACT_RESUBMISSION",
  "CROSS_ORIGIN_DISCLOSURE",
  "MARKETING_SUBSCRIPTION",
  "ORDER_SUBMISSION",
  "PAYMENT",
  "PII_PUBLIC_PROJECTION",
  "SHIPPING_METHOD_APPLICATION",
]);
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_FILE_BYTES = 2 * 1024 * 1024;

export const OUTSIDER_ADAFRUIT_ADDRESS_QUOTE_RESUME_V6_BOUNDARY
  = Object.freeze({
    predecessorEffect: "CONTACT_POST_EXTERNALLY_SUCCEEDED_LOCALLY_AMBIGUOUS",
    predecessorReplayed: false,
    priorRunMutated: false,
    contactPostAllowed: false,
    addressSaveTwoPostMaximum: 1,
    checkoutStepRedirects: Object.freeze([2, 3]),
    arbitraryQueryAllowed: false,
    arbitraryRedirectAllowed: false,
    cookieCopiedToNewPrivateRun: true,
    cookieDirectoryMode: "0700",
    cookieFileMode: "0600",
    shippingMethodApplied: false,
    paymentAllowed: false,
    orderAllowed: false,
    marketingAllowed: false,
    capacityReserved: false,
    independentOutcomeTruthEstablished: false,
    userResultCommitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  });

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

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) fail(code);
  return value;
}

function exactArray(value, expected, code) {
  if (!Array.isArray(value)
    || canonicalizeStrict(value) !== canonicalizeStrict(expected)) fail(code);
  return value;
}

function canonicalFile(file, code, maximum = MAX_FILE_BYTES) {
  if (typeof file !== "string" || file === "") fail(`${code}_REQUIRED`);
  const absolute = path.resolve(file);
  const info = lstatSync(absolute);
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 2
    || info.size > maximum) fail(`${code}_NOT_PRIVATE`);
  const bytes = readFileSync(absolute);
  const source = bytes.toString("utf8");
  let value;
  try { value = JSON.parse(source); } catch { fail(`${code}_JSON_INVALID`); }
  const trailing = source.endsWith("\n") ? "\n" : "";
  if (`${canonicalizeStrict(value)}${trailing}` !== source) {
    fail(`${code}_NOT_CANONICAL`);
  }
  return Object.freeze({ absolute, bytes, bytesHash: bytesHash(bytes), value });
}

function verifySealed(value, schema, hashField, code) {
  if (value?.schema !== schema || typeof value?.[hashField] !== "string"
    || !HASH.test(value[hashField])) fail(`${code}_SCHEMA_INVALID`);
  const { [hashField]: claimed, ...body } = value;
  if (claimed !== digest(schema, body)) fail(`${code}_HASH_INVALID`);
  return value;
}

function ensureDirectory(directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  chmodSync(directory, 0o700);
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail("PRIVATE_DIRECTORY_INVALID");
}

function syncDirectory(directory) {
  let descriptor;
  try { descriptor = openSync(directory, "r"); fsyncSync(descriptor); }
  finally { if (descriptor !== undefined) closeSync(descriptor); }
}

function writeBytesOnce(file, bytes) {
  let descriptor;
  try {
    descriptor = openSync(file, constants.O_WRONLY | constants.O_CREAT
      | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    let offset = 0;
    while (offset < bytes.length) {
      offset += writeSync(descriptor, bytes, offset, bytes.length - offset);
    }
    fsyncSync(descriptor);
  } finally { if (descriptor !== undefined) closeSync(descriptor); }
  chmodSync(file, 0o600);
  syncDirectory(path.dirname(file));
  return Object.freeze({ file, bytes: bytes.length, hash: bytesHash(bytes) });
}

function writeOnce(file, value) {
  return writeBytesOnce(file,
    Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"));
}

function inventory(root, relative = "") {
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
    if (childInfo.isDirectory()) rows.push(...inventory(root, childRelative));
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

function priorState(priorRunDirectory, inputRecord) {
  const directory = path.resolve(priorRunDirectory ?? "");
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o077) !== 0) fail("PRIOR_RUN_DIRECTORY_INVALID");
  const projectionRecord = canonicalFile(path.join(directory,
    "public-projection.v5.json"), "PRIOR_PROJECTION");
  const manifestRecord = canonicalFile(path.join(directory,
    "private-manifest.v5.json"), "PRIOR_MANIFEST");
  const projection = verifySealed(projectionRecord.value,
    PRIOR_PROJECTION_SCHEMA, "projectionHash", "PRIOR_PROJECTION");
  const manifest = verifySealed(manifestRecord.value,
    PRIOR_MANIFEST_SCHEMA, "manifestHash", "PRIOR_MANIFEST");
  const evaluation = verifySealed(projection.exactSpecEvaluation,
    "outsider/exact-source-outcome-spec-evaluation/v5", "evaluationHash",
    "PRIOR_SPEC_EVALUATION");
  if (manifest.projectionHash !== projection.projectionHash
    || manifest.inputBytesHash !== inputRecord.bytesHash
    || projection.contactSubmitted !== true
    || projection.fullAddressSubmitted !== false
    || projection.counters?.contactPostCount !== 1
    || projection.counters?.addressQuotePostCount !== 0
    || projection.paymentPerformed !== false
    || projection.orderSubmitted !== false
    || projection.marketingSubscriptionPerformed !== false
    || projection.shippingMethodApplied !== false
    || projection.capacityReserved !== false
    || evaluation.accepted !== true
    || projection.nextGate !== "ADDRESS_FORM_NOT_AVAILABLE"
    || !Array.isArray(manifest.artifactInventory)) {
    fail("PRIOR_STATE_NOT_RESUMABLE");
  }
  const cookieEntries = manifest.artifactInventory.filter((entry) =>
    /^https-state\/[a-f0-9]{64}\.cookies-v1\.json$/u
      .test(entry.relativePath));
  if (cookieEntries.length !== 1) fail("PRIOR_COOKIE_INVENTORY_INVALID");
  const cookieEntry = cookieEntries[0];
  const cookieFile = path.join(directory, cookieEntry.relativePath);
  const cookieRecord = canonicalFile(cookieFile, "PRIOR_COOKIE", 256 * 1024);
  if (cookieRecord.bytesHash !== cookieEntry.bytesHash
    || cookieRecord.bytes.length !== cookieEntry.bytes
    || cookieRecord.value?.schema
      !== "outsider/order-scoped-buyer-native-cookie-jar/v1"
    || cookieRecord.value.schemaVersion !== "1.0.0"
    || !HASH.test(cookieRecord.value.orderRefHash ?? "")
    || path.basename(cookieFile)
      !== `${cookieRecord.value.orderRefHash.slice(7)}.cookies-v1.json`) {
    fail("PRIOR_COOKIE_BINDING_INVALID");
  }
  return Object.freeze({ directory, projection, projectionRecord, manifest,
    manifestRecord, evaluation, cookieRecord });
}

export function createAdafruitAddressQuoteResidualGrantValueV6(input = {}) {
  const authorizedAt = instant(input.authorizedAt, "AUTHORIZED_AT_INVALID");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT_INVALID");
  if (Date.parse(authorizedAt) >= Date.parse(expiresAt)) {
    fail("GRANT_INTERVAL_INVALID");
  }
  for (const [field, value] of [["priorProjectionHash",
    input.priorProjectionHash], ["priorManifestHash", input.priorManifestHash],
  ["inputBytesHash", input.inputBytesHash]]) {
    if (typeof value !== "string" || !HASH.test(value)) {
      fail(`${field.toUpperCase()}_INVALID`);
    }
  }
  return Object.freeze({
    schema: OUTSIDER_ADAFRUIT_ADDRESS_QUOTE_RESIDUAL_GRANT_SCHEMA_V6,
    schemaVersion: "6.0.0",
    supplierOrigin: ORIGIN,
    purpose: PURPOSE,
    priorProjectionHash: input.priorProjectionHash,
    priorManifestHash: input.priorManifestHash,
    inputBytesHash: input.inputBytesHash,
    permittedActions: [...PERMITTED_ACTIONS],
    forbiddenActions: [...FORBIDDEN_ACTIONS],
    authorizedAt,
    expiresAt,
    oneUse: true,
  });
}

function residualGrant(record, prior, inputRecord) {
  const value = record.value;
  if (value?.schema !== OUTSIDER_ADAFRUIT_ADDRESS_QUOTE_RESIDUAL_GRANT_SCHEMA_V6
    || value.schemaVersion !== "6.0.0" || value.supplierOrigin !== ORIGIN
    || value.purpose !== PURPOSE || value.oneUse !== true
    || value.priorProjectionHash !== prior.projection.projectionHash
    || value.priorManifestHash !== prior.manifest.manifestHash
    || value.inputBytesHash !== inputRecord.bytesHash) {
    fail("RESIDUAL_GRANT_BINDING_INVALID");
  }
  exactArray(value.permittedActions, PERMITTED_ACTIONS,
    "RESIDUAL_GRANT_ACTIONS_INVALID");
  exactArray(value.forbiddenActions, FORBIDDEN_ACTIONS,
    "RESIDUAL_GRANT_FORBIDDEN_INVALID");
  return Object.freeze({ ...value,
    authorizedAt: instant(value.authorizedAt, "GRANT_AUTHORIZED_AT_INVALID"),
    expiresAt: instant(value.expiresAt, "GRANT_EXPIRES_AT_INVALID") });
}

function stepCommand(nonce, operation, requestBytes, expiresAt, previous) {
  return Object.freeze({
    operationNonce: `adafruit-resume-v6-${operation.toLowerCase()}-${nonce}`,
    requestBytes,
    expiresAt,
    expectedPreviousOccurrenceHash: previous,
    triggerOccurrenceHash: null,
  });
}

function claim(result, operation) {
  if (result.publicProjection.operationState !== "SOURCE_OCCURRENCE_OBSERVED") {
    fail(`${operation}_AMBIGUOUS_NO_RETRY`);
  }
  const privateClaim = claimBuyerNativeTransactionSourceOccurrenceV1(result);
  let receipt;
  try { receipt = JSON.parse(privateClaim.sourceBytes.toString("utf8")); }
  catch { fail(`${operation}_RECEIPT_INVALID`); }
  return Object.freeze({
    summary: Object.freeze({
      operation,
      operationState: result.publicProjection.operationState,
      runtimeState: result.publicProjection.runtimeState,
      sourceState: result.publicProjection.sourceState,
      sourceOccurrenceHash: result.publicProjection.sourceOccurrenceHash,
      sourceBytesHash: result.publicProjection.sourceBytesHash,
      sourceBytesLength: privateClaim.sourceBytes.length,
      retryPermitted: result.publicProjection.retryPermitted,
    }),
    receipt,
  });
}

export async function runAdafruitAddressQuoteResumeLiveV6(options = {}) {
  const inputRecord = canonicalFile(options.inputFile, "INPUT", 64 * 1024);
  const input = normalizeProviderNeutralRouteQuoteInputV5(inputRecord.value);
  const prior = priorState(options.priorRunDirectory, inputRecord);
  const grantRecord = canonicalFile(options.residualGrantFile,
    "RESIDUAL_GRANT", 64 * 1024);
  const grant = residualGrant(grantRecord, prior, inputRecord);
  const observedAt = instant(options.observedAt ?? new Date().toISOString(),
    "OBSERVED_AT_INVALID");
  if (Date.parse(observedAt) < Date.parse(grant.authorizedAt)
    || Date.parse(observedAt) >= Date.parse(grant.expiresAt)
    || grant.expiresAt !== input.formationExpiresAt) {
    fail("RESIDUAL_GRANT_NOT_ACTIVE");
  }
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!/^[a-f0-9]{32}$/u.test(nonce)) fail("NONCE_INVALID");
  const privateRoot = path.resolve(options.privateRoot ?? path.join(
    process.cwd(), ".outsider", "private"));
  ensureDirectory(privateRoot);
  const useDirectory = path.join(privateRoot,
    "adafruit-address-residual-grant-use-v6");
  ensureDirectory(useDirectory);
  const useBody = {
    schema: "outsider/private-adafruit-address-residual-grant-use/v6",
    schemaVersion: "6.0.0",
    residualGrantBytesHash: grantRecord.bytesHash,
    priorProjectionHash: prior.projection.projectionHash,
    observedAt,
    nonceHash: digest("outsider/private-resume-nonce/v6", nonce),
  };
  let useArtifact;
  try {
    useArtifact = writeOnce(path.join(useDirectory,
      `${grantRecord.bytesHash.slice(7)}.json`), { ...useBody,
      useHash: digest(useBody.schema, useBody) });
  } catch (error) {
    if (error?.code === "EEXIST") fail("RESIDUAL_GRANT_ALREADY_USED");
    throw error;
  }
  const runDirectory = path.join(privateRoot,
    `adafruit-address-quote-resume-v6-${observedAt.slice(0, 10)
      .replaceAll("-", "")}-${nonce}`);
  if (existsSync(runDirectory)) fail("RUN_DIRECTORY_EXISTS");
  ensureDirectory(runDirectory);
  const httpsState = path.join(runDirectory, "https-state");
  ensureDirectory(httpsState);
  const copiedCookieArtifact = writeBytesOnce(path.join(httpsState,
    path.basename(prior.cookieRecord.absolute)), prior.cookieRecord.bytes);
  if (copiedCookieArtifact.hash !== prior.cookieRecord.bytesHash) {
    fail("COOKIE_COPY_HASH_INVALID");
  }
  const runtimeDirectory = path.join(runDirectory, "runtime");
  ensureDirectory(runtimeDirectory);
  const counters = { liveHttpRequestCount: 0, getRequestCount: 0,
    postRequestCount: 0, boundedCheckoutRedirectCount: 0,
    contactPostAttemptCount: 0, addressQuotePostCount: 0,
    shippingMethodApplyAttemptCount: 0, paymentEndpointAttemptCount: 0,
    orderEndpointAttemptCount: 0, marketingSubscriptionAttemptCount: 0,
    modelCallCount: 0, interactiveBrowserActionCount: 0,
    employeeTouchCount: 0 };
  const rawFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof rawFetch !== "function") fail("FETCH_IMPL_INVALID");
  const guardedFetch = async (url, init) => {
    const target = new URL(String(url));
    const method = init?.method;
    const allowedStep = method === "GET" && target.pathname === "/checkout"
      && /^\?step=[23]$/u.test(target.search);
    if (target.origin !== ORIGIN || target.pathname !== "/checkout"
      || target.hash !== "" || (target.search !== "" && !allowedStep)
      || !["GET", "POST"].includes(method)) fail("OUTBOUND_FORBIDDEN");
    if (method === "POST") {
      const body = new URLSearchParams(Buffer.from(init.body).toString("utf8"));
      const action = body.get("action");
      if (action === "save_one") {
        counters.contactPostAttemptCount += 1;
        fail("CONTACT_RESUBMISSION_FORBIDDEN");
      }
      if (action !== "save_two") fail("ONLY_ADDRESS_SAVE_TWO_ALLOWED");
      if (counters.addressQuotePostCount !== 0) fail("ADDRESS_POST_LIMIT");
      for (const [name, value] of body) {
        if (/payment|card|cvv|cvc|order/iu.test(name)) {
          counters.paymentEndpointAttemptCount += 1;
          fail("PAYMENT_OR_ORDER_FIELD_FORBIDDEN");
        }
        if (/marketing|newsletter|subscribe|opt[-_]?in/iu.test(name)
          && value !== "" && !/^(?:0|false|off|no)$/iu.test(value)) {
          counters.marketingSubscriptionAttemptCount += 1;
          fail("MARKETING_FORBIDDEN");
        }
      }
      counters.addressQuotePostCount += 1;
    }
    counters.liveHttpRequestCount += 1;
    if (method === "GET") counters.getRequestCount += 1;
    else counters.postRequestCount += 1;
    return rawFetch(url, init);
  };
  const transport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: httpsState,
    orderRefHash: prior.cookieRecord.value.orderRefHash,
    allowedOrigins: [ORIGIN],
    timeoutMs: options.timeoutMs ?? 20_000,
    maximumResponseBytes: 768 * 1024,
  }, { fetchImpl: guardedFetch, clock: () => Date.parse(observedAt) });
  const stepTransport = async (request) => {
    let current = request;
    for (let hop = 0; hop < 3; hop += 1) {
      const response = await transport(current);
      if (![301, 302, 303, 307, 308].includes(response.status)) return response;
      const raw = response.headers?.location;
      const location = Array.isArray(raw) ? raw[0] : raw;
      let target;
      try { target = new URL(location, current.url); }
      catch { fail("STEP_REDIRECT_INVALID"); }
      if (target.origin !== ORIGIN || target.pathname !== "/checkout"
        || !/^\?step=[23]$/u.test(target.search) || target.hash !== "") {
        fail("STEP_REDIRECT_FORBIDDEN");
      }
      counters.boundedCheckoutRedirectCount += 1;
      current = Object.freeze({ ...current,
        step: `${request.step}_RESUME_REDIRECT_${hop + 1}`,
        method: "GET", url: target.href,
        headers: Object.freeze({ accept: "text/html" }), bodyBytes: null });
    }
    fail("STEP_REDIRECT_LIMIT");
  };
  const destinationGrant = issueAdafruitPrivateFullAddressShippingQuoteGrantV2({
    destinationRefHash: prior.projection.destinationRefHash,
    authorizedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    firstName: input.destination.firstName,
    lastName: input.destination.lastName,
    telephone: input.destination.telephone,
    countryCode: input.destination.countryCode,
    region: input.destination.region,
    city: input.destination.city,
    postalCode: input.destination.postalCode,
    streetLines: [...input.destination.streetLines],
    providerCountryId: input.destination.providerAddressBinding.countryId,
    providerRegionId: input.destination.providerAddressBinding.regionId,
    completionDeadline: input.outcome.completionDeadline,
  });
  const ref = (label) => digest("outsider/adafruit-address-resume-ref/v6", {
    priorProjectionHash: prior.projection.projectionHash, nonce, label });
  const capability = issueAdafruitFullAddressShippingQuoteCapabilityV2({
    capabilityRefHash: ref("capability"),
    accountRefHash: ref("guest-account"),
    nodeRefHash: ref("node"),
    issuedAt: observedAt,
    expiresAt: input.formationExpiresAt,
    productId: input.selectedRoute.nativeResourceId,
    quantity: input.selectedRoute.quantity,
    contactRefHash: prior.projection.contactRefHash,
    destinationGrant,
  }, { httpsRequestImpl: stepTransport,
    revalidateImpl: async (entry) => ({ active: true,
      capabilityRefHash: entry.capabilityRefHash,
      accountRefHash: entry.accountRefHash, observedAt,
      expiresAt: input.formationExpiresAt }) });
  const runtime = createBuyerNativeTransactionRouteRuntimeV1({
    journalDirectory: runtimeDirectory,
    journalId: `transaction_${ref("transaction").slice(7, 39)}`,
    transactionRefHash: ref("transaction"),
    outcomeIntentRefHash: prior.projection.outcomeIntentRefHash,
    routeRole: prior.projection.routeRole,
    formationExpiresAt: input.formationExpiresAt,
  }, { capability, clock: () => observedAt });
  const commandBytes = createAdafruitFullAddressShippingQuoteCommandBytesV2({
    productId: input.selectedRoute.nativeResourceId,
    quantity: input.selectedRoute.quantity,
  });
  const quotedResult = await runtime.quote(stepCommand(nonce, "QUOTE",
    commandBytes, input.formationExpiresAt, null));
  const quoted = claim(quotedResult, "QUOTE");
  if (quotedResult.publicProjection.sourceState !== "QUOTE_AVAILABLE") {
    fail("ADDRESS_FORM_NOT_AVAILABLE");
  }
  const heldResult = await runtime.hold(stepCommand(nonce, "HOLD",
    commandBytes, input.formationExpiresAt,
    quotedResult.publicProjection.sourceOccurrenceHash));
  const held = claim(heldResult, "HOLD");
  if (heldResult.publicProjection.sourceState !== "HOLD_ACKNOWLEDGED") {
    fail("ADDRESS_QUOTE_NOT_AVAILABLE");
  }
  const quote = held.receipt.normalized.quote;
  const body = {
    schema: PUBLIC_SCHEMA,
    schemaVersion: "6.0.0",
    predecessor: { schema: prior.projection.schema,
      projectionHash: prior.projection.projectionHash,
      manifestHash: prior.manifest.manifestHash,
      contactEffectReplayed: false },
    observedAt,
    selectedRoute: prior.projection.selectedRoute,
    routeRole: prior.projection.routeRole,
    outcomeIntentRefHash: prior.projection.outcomeIntentRefHash,
    acceptanceSpecRefHash: prior.projection.acceptanceSpecRefHash,
    maximumLossConstraintRefHash:
      prior.projection.maximumLossConstraintRefHash,
    recoveryOptionRefHash: prior.projection.recoveryOptionRefHash,
    exactSpecEvaluation: prior.evaluation,
    destinationRefHash: prior.projection.destinationRefHash,
    contactRefHash: prior.projection.contactRefHash,
    budget: prior.projection.budget,
    completionDeadline: prior.projection.completionDeadline,
    stages: [quoted.summary, held.summary],
    quote,
    allInTotalMinor: quote.allInTotalMinor,
    allInTotalProven: quote.allInTotalProven,
    budgetSatisfied: Number.isSafeInteger(quote.allInTotalMinor)
      && BigInt(quote.allInTotalMinor)
        <= BigInt(prior.projection.budget.maximumAmountMinor),
    structuredEtaObserved: quote.structuredEtaObserved,
    deliveryDeadlineProven: quote.deliveryDeadlineProven,
    runState: "DESTINATION_QUOTE_OBSERVED_NO_CAPACITY_HOLD",
    nextGate: "RESOURCE_OWNER_CAPACITY_AND_SEPARATE_PAYMENT_ORDER_AUTHORIZATION",
    counters,
    priorCookieBytesHash: prior.cookieRecord.bytesHash,
    copiedCookieBytesHash: copiedCookieArtifact.hash,
    priorRunMutated: false,
    contactSubmittedInPredecessor: true,
    contactPostAttemptCount: 0,
    fullAddressSubmitted: true,
    shippingMethodApplied: false,
    paymentAuthorized: false,
    paymentPerformed: false,
    orderAuthorized: false,
    orderSubmitted: false,
    marketingAuthorized: false,
    marketingSubscriptionPerformed: false,
    rawPrivateInputProjected: false,
    rawContactProjected: false,
    rawAddressProjected: false,
    capacityReserved: false,
    independentOutcomeTruthEstablished: false,
    userResultCommitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  const projection = Object.freeze({ ...body,
    projectionHash: digest(PUBLIC_SCHEMA, body) });
  const publicArtifact = writeOnce(path.join(runDirectory,
    "public-projection.v6.json"), projection);
  const finalStage = held.summary;
  const routeEvidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: projection.projectionHash,
    occurrenceRefHash: finalStage.sourceOccurrenceHash,
    recoveryOptionRefHash: projection.recoveryOptionRefHash,
    observedAt,
    validUntil: input.formationExpiresAt,
    sourceReplayReceiptHash: finalStage.sourceBytesHash,
    facts: {
      specification: {
        sourceOccurrenceRefHash: prior.evaluation.sourceOccurrenceHash,
        frozenPredicateHash: projection.acceptanceSpecRefHash,
        evaluationRefHash: prior.evaluation.evaluationHash,
        status: "MATCH",
      },
      allInPrice: {
        sourceOccurrenceRefHash: finalStage.sourceOccurrenceHash,
        constraintRefHash: projection.maximumLossConstraintRefHash,
        currency: projection.budget.currency,
        allInMinorUnits: quote.allInTotalMinor,
        includesItemTaxShippingAndFees: quote.allInTotalProven,
        status: quote.allInTotalProven ? "COMPLETE"
          : quote.allInTotalMinor === null ? "UNAVAILABLE" : "PARTIAL",
      },
      eta: {
        sourceOccurrenceRefHash: finalStage.sourceOccurrenceHash,
        completionDeadline: projection.completionDeadline,
        estimatedCompletionAt: quote.sourceDeliveryDate === null ? null
          : `${quote.sourceDeliveryDate}T23:59:59.999Z`,
        status: quote.structuredEtaObserved ? "STRUCTURED" : "UNAVAILABLE",
      },
      capacity: {
        sourceOccurrenceRefHash: finalStage.sourceOccurrenceHash,
        capacityLifecycleRefHash: null, capacityLifecycleHeadHash: null,
        reservedFrom: null, reservedUntil: null, status: "UNRESERVED",
        sourceClass: "SELLER_SERVER_ACK_ONLY",
      },
    },
  });
  const routeEvidenceArtifact = writeOnce(path.join(runDirectory,
    "route-evidence.v1.json"), routeEvidence);
  const artifactInventory = inventory(runDirectory);
  const manifestBody = {
    schema: MANIFEST_SCHEMA,
    schemaVersion: "6.0.0",
    observedAt,
    priorProjectionHash: prior.projection.projectionHash,
    priorManifestHash: prior.manifest.manifestHash,
    inputBytesHash: inputRecord.bytesHash,
    residualGrantBytesHash: grantRecord.bytesHash,
    residualGrantUseBytesHash: useArtifact.hash,
    priorCookieBytesHash: prior.cookieRecord.bytesHash,
    copiedCookieBytesHash: copiedCookieArtifact.hash,
    projectionHash: projection.projectionHash,
    routeEvidenceHash: routeEvidence.evidenceHash,
    artifactInventory,
    artifactCount: artifactInventory.length,
    artifactBytes: artifactInventory.reduce((sum, item) => sum + item.bytes, 0),
    priorRunMutated: false,
    contactEffectReplayed: false,
    addressQuotePostCount: counters.addressQuotePostCount,
    shippingMethodApplied: false,
    paymentPerformed: false,
    orderSubmitted: false,
    capacityReserved: false,
  };
  const privateManifest = Object.freeze({ ...manifestBody,
    manifestHash: digest(MANIFEST_SCHEMA, manifestBody) });
  const privateManifestArtifact = writeOnce(path.join(runDirectory,
    "private-manifest.v6.json"), privateManifest);
  return Object.freeze({ runDirectory, projection, publicArtifact,
    routeEvidence, routeEvidenceArtifact, privateManifest,
    privateManifestArtifact });
}

function parseCli(argv) {
  const allowed = new Set(["--live-no-payment-no-order", "--prior-run",
    "--input", "--residual-grant", "--private-root", "--nonce"]);
  const output = { confirmed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag)) fail("ARGUMENT_INVALID");
    if (flag === "--live-no-payment-no-order") {
      output.confirmed = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail("ARGUMENT_VALUE");
    if (flag === "--prior-run") output.priorRunDirectory = value;
    if (flag === "--input") output.inputFile = value;
    if (flag === "--residual-grant") output.residualGrantFile = value;
    if (flag === "--private-root") output.privateRoot = value;
    if (flag === "--nonce") output.nonce = value;
    index += 1;
  }
  if (!output.confirmed || output.priorRunDirectory === undefined
    || output.inputFile === undefined || output.residualGrantFile === undefined) {
    fail("REQUIRED_ARGUMENT_MISSING");
  }
  return output;
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await runAdafruitAddressQuoteResumeLiveV6(
      parseCli(process.argv.slice(2)));
    process.stdout.write(`${canonicalizeStrict({
      runDirectory: result.runDirectory,
      publicProjection: result.projection,
      routeEvidenceFile: result.routeEvidenceArtifact.file,
      privateManifestFile: result.privateManifestArtifact.file,
    })}\n`);
  } catch (error) {
    process.stderr.write(`${String(error?.message ?? error)}\n`);
    process.exitCode = 1;
  }
}
