#!/usr/bin/env node

/*
 * Adafruit shipping-application read-only reconciliation descendant v10.
 *
 * v9 submitted save_three exactly once and received a seller 302 to
 * /checkout, but deliberately stopped because the effect could not safely be
 * replayed.  This descendant proves that frozen chain, copies its evolved
 * cookie, and performs only a read-only GET /checkout plus at most one exact
 * same-origin checkout-step GET.  Step 4 may yield total/ETA evidence; every
 * other current state remains a content-addressed HOLD.
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
  createBuyerNativeRouteEvidenceV1,
  verifyBuyerNativeRouteEvidenceV1,
} from "../src/outsider-buyer-native-route-evidence-v1.js";
import { createOrderScopedBuyerNativeHttpsTransportV1 }
  from "../src/outsider-order-scoped-buyer-native-https-transport-v1.js";
import {
  OUTSIDER_ADAFRUIT_SHIPPING_APPLICATION_GRANT_SCHEMA_V9,
  inspectAdafruitStep3ReceiptContextV9,
  parseAdafruitPrepaymentSummaryV9,
} from "./outsider-adafruit-shipping-application-live-runner-v9.mjs";

const PREFIX = "OUTSIDER_ADAFRUIT_SHIPPING_RECONCILIATION_LIVE_RUNNER_V10_";
const ORIGIN = "https://www.adafruit.com";
const CHECKOUT_URL = `${ORIGIN}/checkout`;
const PROVIDER = "ADAFRUIT_GUEST_SHOPPER";
const PURPOSE = "READ_CURRENT_CHECKOUT_STATE_AFTER_AMBIGUOUS_V9_ONCE";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const STEP_SEARCH = /^\?step=([1-4])$/u;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 768 * 1024;

const PUBLIC_SCHEMA
  = "outsider/adafruit-shipping-reconciliation-public-projection/v10";
const MANIFEST_SCHEMA
  = "outsider/private-adafruit-shipping-reconciliation-manifest/v10";
const FAILURE_SCHEMA
  = "outsider/private-adafruit-shipping-reconciliation-failure-manifest/v10";
const HEADER_SCHEMA
  = "outsider/private-adafruit-shipping-reconciliation-response-headers/v10";
const CAPTURE_SCHEMA
  = "outsider/private-adafruit-shipping-reconciliation-source-capture/v10";
const OCCURRENCE_SCHEMA
  = "outsider/adafruit-shipping-reconciliation-source-occurrence/v10";
const USE_SCHEMA
  = "outsider/private-adafruit-shipping-reconciliation-grant-use/v10";
const V9_FAILURE_SCHEMA
  = "outsider/private-adafruit-shipping-application-failure-manifest/v9";
const V9_ATTEMPT_SCHEMA
  = "outsider/private-adafruit-shipping-application-attempt/v9";
const V9_HEADERS_SCHEMA
  = "outsider/private-adafruit-shipping-application-response-headers/v9";
const V9_USE_SCHEMA
  = "outsider/private-adafruit-shipping-application-grant-use/v9";

const V9_PERMITTED = Object.freeze([
  "SUBMIT_EXACT_OBSERVED_SAVE_THREE_ONCE",
  "READ_EXACT_PREPAYMENT_SUMMARY_ONCE",
]);
const V9_FORBIDDEN = Object.freeze([
  "ADDRESS_RESUBMISSION", "ARBITRARY_CHECKOUT_CONTROL",
  "CONTACT_RESUBMISSION", "CROSS_ORIGIN_DISCLOSURE",
  "MARKETING_SUBSCRIPTION", "ORDER_SUBMISSION", "PAYMENT_INPUT",
  "PAYMENT_SUBMISSION", "PII_PUBLIC_PROJECTION", "POST_RETRY",
]);
const PERMITTED_ACTIONS = Object.freeze([
  "READ_CURRENT_CHECKOUT_STATE_ONCE",
  "FOLLOW_ONE_EXACT_SAME_ORIGIN_CHECKOUT_STEP_REDIRECT",
  "PARSE_TOTAL_AND_ETA_ONLY_IF_CURRENT_STEP_IS_4",
]);
const FORBIDDEN_ACTIONS = Object.freeze([
  "ADDRESS_RESUBMISSION", "CONTACT_RESUBMISSION",
  "CROSS_ORIGIN_DISCLOSURE", "MARKETING_SUBSCRIPTION",
  "ORDER_SUBMISSION", "PAYMENT_INPUT", "PAYMENT_SUBMISSION",
  "PII_PUBLIC_PROJECTION", "POST", "SECOND_REDIRECT_FOLLOW",
  "SHIPPING_METHOD_APPLICATION", "V9_EFFECT_REPLAY",
]);

export const OUTSIDER_ADAFRUIT_SHIPPING_RECONCILIATION_GRANT_SCHEMA_V10
  = "outsider/private-adafruit-shipping-reconciliation-grant/v10";

export const OUTSIDER_ADAFRUIT_SHIPPING_RECONCILIATION_V10_BOUNDARY
  = Object.freeze({
    descendsFrom: V9_FAILURE_SCHEMA,
    predecessorMutated: false,
    predecessorEffectReplayed: false,
    onlyRequests: Object.freeze([
      `GET ${CHECKOUT_URL}`,
      `GET ${CHECKOUT_URL}?step={1|2|3|4} (only when discovered)`,
    ]),
    maximumRequests: 2,
    maximumGets: 2,
    maximumRedirectsFollowed: 1,
    postAllowed: false,
    contactReplayAllowed: false,
    addressReplayAllowed: false,
    shippingApplicationAllowed: false,
    paymentInputAllowed: false,
    paymentSubmissionAllowed: false,
    orderAllowed: false,
    marketingAllowed: false,
    responseBytesPersistedBeforeParse: true,
    responseHeadersPersistedBeforeParse: true,
    parseSummaryOnlyAtStep4: true,
    capacityReserved: false,
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

function exact(value, fields, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || Reflect.ownKeys(value).length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function exactArray(value, expected, code) {
  if (!Array.isArray(value)
    || canonicalizeStrict(value) !== canonicalizeStrict(expected)) {
    fail(`${code}_INVALID`);
  }
}

function privateBytesFile(file, code, minimum = 0,
  maximum = MAX_SOURCE_BYTES) {
  const absolute = path.resolve(file ?? "");
  let info;
  try { info = lstatSync(absolute); } catch { fail(`${code}_UNAVAILABLE`); }
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < minimum
    || info.size > maximum) fail(`${code}_NOT_PRIVATE`);
  const bytes = readFileSync(absolute);
  return Object.freeze({ absolute, bytes, bytesHash: bytesHash(bytes) });
}

function canonicalFile(file, code, maximum = MAX_JSON_BYTES) {
  const record = privateBytesFile(file, code, 1, maximum);
  const source = record.bytes.toString("utf8");
  let value;
  try { value = JSON.parse(source); } catch { fail(`${code}_JSON_INVALID`); }
  const trailing = source.endsWith("\n") ? "\n" : "";
  if (`${canonicalizeStrict(value)}${trailing}` !== source) {
    fail(`${code}_NOT_CANONICAL`);
  }
  return Object.freeze({ ...record, value });
}

function privateDirectory(directory, code) {
  const absolute = path.resolve(directory ?? "");
  let info;
  try { info = lstatSync(absolute); } catch { fail(`${code}_UNAVAILABLE`); }
  if (!info.isDirectory() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o700) fail(`${code}_NOT_PRIVATE`);
  return absolute;
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
    || (info.mode & 0o777) !== 0o700) fail("ARTIFACT_DIRECTORY_NOT_PRIVATE");
  const rows = [];
  for (const name of readdirSync(directory).sort()) {
    const childRelative = relative === "" ? name : path.join(relative, name);
    const child = path.join(root, childRelative);
    const childInfo = lstatSync(child);
    if (childInfo.isSymbolicLink()) fail("ARTIFACT_SYMLINK_FORBIDDEN");
    if (childInfo.isDirectory()) rows.push(...inventory(root, childRelative));
    else {
      if (!childInfo.isFile() || (childInfo.mode & 0o777) !== 0o600) {
        fail("ARTIFACT_FILE_NOT_PRIVATE");
      }
      const bytes = readFileSync(child);
      rows.push(Object.freeze({
        relativePath: childRelative.split(path.sep).join("/"),
        bytes: bytes.length,
        bytesHash: bytesHash(bytes),
      }));
    }
  }
  return Object.freeze(rows);
}

function canonicalHash(value, schema, hashField, code) {
  if (value?.schema !== schema) fail(`${code}_SCHEMA_INVALID`);
  const body = { ...value };
  const observed = body[hashField];
  delete body[hashField];
  if (!HASH.test(observed ?? "") || digest(schema, body) !== observed) {
    fail(`${code}_HASH_INVALID`);
  }
  return observed;
}

function cookie(file, code) {
  const record = canonicalFile(file, code, 256 * 1024);
  exact(record.value, ["schema", "schemaVersion", "orderRefHash",
    "nextCreationIndex", "cookies"], code);
  if (record.value.schema !== "outsider/order-scoped-buyer-native-cookie-jar/v1"
    || record.value.schemaVersion !== "1.0.0"
    || !HASH.test(record.value.orderRefHash ?? "")
    || !Number.isSafeInteger(record.value.nextCreationIndex)
    || record.value.nextCreationIndex < 0 || !Array.isArray(record.value.cookies)
    || path.basename(record.absolute)
      !== `${record.value.orderRefHash.slice(7)}.cookies-v1.json`) {
    fail(`${code}_BINDING_INVALID`);
  }
  return record;
}

function headerValue(headers, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value.length === 1 ? value[0] : null : value;
}

function exactCheckoutStepUrl(raw, base = CHECKOUT_URL) {
  if (typeof raw !== "string" || raw.length < 1 || raw.length > 2048) {
    return null;
  }
  let value;
  try { value = new URL(raw, base); } catch { return null; }
  const match = STEP_SEARCH.exec(value.search);
  if (value.origin !== ORIGIN || value.pathname !== "/checkout"
    || value.username !== "" || value.password !== "" || value.port !== ""
    || value.hash !== "" || match === null) return null;
  return Object.freeze({ url: value.href, step: Number(match[1]) });
}

function validatePriorV9Grant(record, v8) {
  const fields = ["schema", "schemaVersion", "supplierOrigin", "purpose",
    "v8RunTreeHash", "v8ProjectionHash", "v8ManifestHash",
    "v8RouteEvidenceHash", "v8SourceCaptureHash", "v8Step3SourceBytesHash",
    "v8CookieBytesHash", "selectedRateRefHash", "selectedShippingMinor",
    "expectedSummaryUrl", "permittedActions", "forbiddenActions",
    "paymentAuthorized", "orderAuthorized", "authorizedAt", "expiresAt",
    "oneUse"];
  const value = exact(record.value, fields, "PRIOR_V9_GRANT");
  const selected = v8.form.rates.filter((rate) =>
    rate.rateRefHash === value.selectedRateRefHash);
  if (value.schema !== OUTSIDER_ADAFRUIT_SHIPPING_APPLICATION_GRANT_SCHEMA_V9
    || value.schemaVersion !== "9.0.0" || value.supplierOrigin !== ORIGIN
    || value.purpose
      !== "APPLY_ONE_V8_OBSERVED_SHIPPING_OPTION_AND_READ_SUMMARY"
    || value.v8RunTreeHash !== v8.treeHash
    || value.v8ProjectionHash !== v8.projectionHash
    || value.v8ManifestHash !== v8.manifestHash
    || value.v8RouteEvidenceHash !== v8.routeEvidence.evidenceHash
    || value.v8SourceCaptureHash !== v8.captureHash
    || value.v8Step3SourceBytesHash !== v8.step3.bytesHash
    || value.v8CookieBytesHash !== v8.cookie.bytesHash
    || selected.length !== 1
    || value.selectedShippingMinor !== selected[0].amountMinor
    || value.expectedSummaryUrl !== `${CHECKOUT_URL}?step=4`
    || value.paymentAuthorized !== false || value.orderAuthorized !== false
    || value.oneUse !== true) fail("PRIOR_V9_GRANT_BINDING_INVALID");
  exactArray(value.permittedActions, V9_PERMITTED, "PRIOR_V9_ACTIONS");
  exactArray(value.forbiddenActions, V9_FORBIDDEN, "PRIOR_V9_FORBIDDEN");
  instant(value.authorizedAt, "PRIOR_V9_AUTHORIZED_AT");
  instant(value.expiresAt, "PRIOR_V9_EXPIRES_AT");
  if (Date.parse(value.authorizedAt) < Date.parse(v8.projection.observedAt)
    || Date.parse(value.authorizedAt) >= Date.parse(value.expiresAt)
    || Date.parse(value.expiresAt) > Date.parse(v8.routeEvidence.validUntil)
    || Date.parse(value.expiresAt)
      > Date.parse(v8.projection.completionDeadline)) {
    fail("PRIOR_V9_GRANT_INTERVAL_INVALID");
  }
  return Object.freeze({ value, selected: selected[0] });
}

function validatePriorV9Use(record, grantRecord, grant, v8) {
  privateDirectory(path.dirname(record.absolute), "PRIOR_V9_USE_DIRECTORY");
  const value = exact(record.value, ["schema", "schemaVersion",
    "grantBytesHash", "priorV8RunTreeHash", "observedAt", "nonceHash",
    "useHash"], "PRIOR_V9_USE");
  const { useHash, ...body } = value;
  if (value.schema !== V9_USE_SCHEMA || value.schemaVersion !== "9.0.0"
    || value.grantBytesHash !== grantRecord.bytesHash
    || value.priorV8RunTreeHash !== v8.treeHash
    || !HASH.test(value.nonceHash ?? "")
    || useHash !== digest(V9_USE_SCHEMA, body)
    || path.basename(record.absolute)
      !== `${grantRecord.bytesHash.slice(7)}.json`) {
    fail("PRIOR_V9_USE_BINDING_INVALID");
  }
  instant(value.observedAt, "PRIOR_V9_USE_OBSERVED_AT");
  if (Date.parse(value.observedAt) < Date.parse(grant.authorizedAt)
    || Date.parse(value.observedAt) >= Date.parse(grant.expiresAt)) {
    fail("PRIOR_V9_USE_OUTSIDE_GRANT");
  }
  return value;
}

/** Validate the exact frozen v9 302-/checkout ambiguous-effect tree. */
export function inspectAdafruitShippingApplicationAmbiguityV10(options = {}) {
  const v8 = inspectAdafruitStep3ReceiptContextV9({
    priorV8RunDirectory: options.priorV8RunDirectory,
  });
  const grantRecord = canonicalFile(options.priorV9GrantFile,
    "PRIOR_V9_GRANT", 64 * 1024);
  const grant = validatePriorV9Grant(grantRecord, v8);
  const useRecord = canonicalFile(options.priorV9UseFile,
    "PRIOR_V9_USE", 64 * 1024);
  const use = validatePriorV9Use(useRecord, grantRecord, grant.value, v8);
  const runDirectory = privateDirectory(options.priorV9RunDirectory,
    "PRIOR_V9_RUN");
  const runMatch
    = /^adafruit-shipping-application-v9-\d{8}-([a-f0-9]{32})$/u
      .exec(path.basename(runDirectory));
  if (runMatch === null || use.nonceHash !== digest(
    "outsider/private-shipping-application-nonce/v9", runMatch[1])) {
    fail("PRIOR_V9_RUN_USE_BINDING_INVALID");
  }
  const artifacts = inventory(runDirectory);
  const names = artifacts.map((item) => item.relativePath);
  const cookieNames = names.filter((name) =>
    /^https-state\/[a-f0-9]{64}\.cookies-v1\.json$/u.test(name));
  const required = ["bounded-failure-manifest.v9.json",
    "shipping-application-attempt.v9.json",
    "shipping-apply-request-body.v9.bin",
    "shipping-apply-response-headers.v9.json",
    "shipping-apply-response.v9.bin"];
  if (artifacts.length !== 6 || cookieNames.length !== 1
    || required.some((name) => !names.includes(name))) {
    fail("PRIOR_V9_TREE_SHAPE_INVALID");
  }
  const currentCookie = cookie(path.join(runDirectory, cookieNames[0]),
    "PRIOR_V9_COOKIE");
  if (currentCookie.value.orderRefHash !== v8.cookie.value.orderRefHash
    || currentCookie.bytesHash === v8.cookie.bytesHash) {
    fail("PRIOR_V9_COOKIE_LINEAGE_INVALID");
  }
  const requestBody = privateBytesFile(path.join(runDirectory,
    "shipping-apply-request-body.v9.bin"), "PRIOR_V9_REQUEST", 1, 4096);
  const values = new URLSearchParams(requestBody.bytes.toString("utf8"));
  const entries = [...values.entries()];
  if (entries.length !== 3
    || entries.map(([key]) => key).join(",") !== "csrf_token,shipping,action"
    || values.get("csrf_token") !== v8.form.csrfToken
    || values.get("shipping") !== grant.selected.methodValue
    || values.get("action") !== "save_three") {
    fail("PRIOR_V9_REQUEST_BINDING_INVALID");
  }
  const attemptRecord = canonicalFile(path.join(runDirectory,
    "shipping-application-attempt.v9.json"), "PRIOR_V9_ATTEMPT");
  const attemptHash = canonicalHash(attemptRecord.value, V9_ATTEMPT_SCHEMA,
    "attemptHash", "PRIOR_V9_ATTEMPT");
  const attempt = exact(attemptRecord.value, ["schema", "schemaVersion",
    "observedAt", "priorV8RunTreeHash", "grantBytesHash",
    "grantUseBytesHash", "selectedRateRefHash", "selectedShippingMinor",
    "requestBodyBytesHash", "idempotencyKeyHash", "operation",
    "retryAutomaticallyPermitted", "attemptHash"], "PRIOR_V9_ATTEMPT");
  const expectedIdempotency = digest(
    "outsider/adafruit-shipping-application-idempotency/v9", {
      priorV8RunTreeHash: v8.treeHash,
      grantBytesHash: grantRecord.bytesHash,
      selectedRateRefHash: grant.value.selectedRateRefHash,
    });
  if (attempt.schemaVersion !== "9.0.0"
    || attempt.observedAt !== use.observedAt
    || attempt.priorV8RunTreeHash !== v8.treeHash
    || attempt.grantBytesHash !== grantRecord.bytesHash
    || attempt.grantUseBytesHash !== useRecord.bytesHash
    || attempt.selectedRateRefHash !== grant.value.selectedRateRefHash
    || attempt.selectedShippingMinor !== grant.value.selectedShippingMinor
    || attempt.requestBodyBytesHash !== requestBody.bytesHash
    || attempt.idempotencyKeyHash !== expectedIdempotency
    || attempt.operation !== "SUBMIT_EXACT_OBSERVED_SAVE_THREE_ONCE"
    || attempt.retryAutomaticallyPermitted !== false) {
    fail("PRIOR_V9_ATTEMPT_BINDING_INVALID");
  }
  const response = privateBytesFile(path.join(runDirectory,
    "shipping-apply-response.v9.bin"), "PRIOR_V9_RESPONSE", 0);
  const responseHeadersRecord = canonicalFile(path.join(runDirectory,
    "shipping-apply-response-headers.v9.json"), "PRIOR_V9_HEADERS");
  const responseHeadersHash = canonicalHash(responseHeadersRecord.value,
    V9_HEADERS_SCHEMA, "headersRecordHash", "PRIOR_V9_HEADERS");
  const responseHeaders = exact(responseHeadersRecord.value,
    ["schema", "schemaVersion", "observedAt", "status", "finalUrl",
      "headers", "publiclyProjected", "headersRecordHash"],
    "PRIOR_V9_HEADERS");
  let priorLocation;
  try {
    priorLocation = new URL(headerValue(responseHeaders.headers, "location"),
      CHECKOUT_URL);
  } catch { fail("PRIOR_V9_RESPONSE_LOCATION_INVALID"); }
  if (responseHeaders.schemaVersion !== "9.0.0"
    || responseHeaders.observedAt !== use.observedAt
    || responseHeaders.status !== 302
    || responseHeaders.finalUrl !== CHECKOUT_URL
    || responseHeaders.publiclyProjected !== false
    || priorLocation.href !== CHECKOUT_URL || response.bytes.length !== 0) {
    fail("PRIOR_V9_302_RESPONSE_INVALID");
  }
  const failureRecord = canonicalFile(path.join(runDirectory,
    "bounded-failure-manifest.v9.json"), "PRIOR_V9_FAILURE");
  const failureHash = canonicalHash(failureRecord.value, V9_FAILURE_SCHEMA,
    "failureManifestHash", "PRIOR_V9_FAILURE");
  const failure = exact(failureRecord.value, ["schema", "schemaVersion",
    "observedAt", "failureCode", "effectState", "priorV8RunTreeHash",
    "grantBytesHash", "requestBodyPersistedBeforePost",
    "operationAttemptPersistedBeforePost", "postResponsePersistedBeforeParse",
    "summaryResponsePersistedBeforeParse", "counters", "artifactInventory",
    "artifactCount", "artifactBytes", "retryAutomaticallyPermitted",
    "postRetryPermitted", "contactReplayed", "addressReplayed",
    "paymentPerformed", "orderSubmitted", "capacityReserved", "authority",
    "decisionState", "failureManifestHash"], "PRIOR_V9_FAILURE");
  const counters = exact(failure.counters, ["liveHttpRequestCount",
    "getRequestCount", "postRequestCount", "boundedCheckoutRedirectCount",
    "contactPostAttemptCount", "addressPostAttemptCount",
    "shippingMethodApplyAttemptCount", "paymentInputCount",
    "paymentSubmissionCount", "orderSubmissionCount",
    "marketingSubscriptionAttemptCount", "modelCallCount",
    "interactiveBrowserActionCount", "employeeTouchCount"],
  "PRIOR_V9_COUNTERS");
  const priorInventory = artifacts.filter((entry) =>
    entry.relativePath !== "bounded-failure-manifest.v9.json");
  if (failure.schemaVersion !== "9.0.0"
    || failure.observedAt !== use.observedAt
    || failure.failureCode !== "SAVE_THREE_REDIRECT_INVALID"
    || failure.effectState !== "AMBIGUOUS_SHIPPING_APPLICATION_NO_RETRY"
    || failure.priorV8RunTreeHash !== v8.treeHash
    || failure.grantBytesHash !== grantRecord.bytesHash
    || failure.requestBodyPersistedBeforePost !== true
    || failure.operationAttemptPersistedBeforePost !== true
    || failure.postResponsePersistedBeforeParse !== true
    || failure.summaryResponsePersistedBeforeParse !== false
    || failure.artifactCount !== priorInventory.length
    || failure.artifactBytes !== priorInventory.reduce(
      (sum, item) => sum + item.bytes, 0)
    || canonicalizeStrict(failure.artifactInventory)
      !== canonicalizeStrict(priorInventory)
    || counters.liveHttpRequestCount !== 1 || counters.postRequestCount !== 1
    || counters.getRequestCount !== 0
    || counters.shippingMethodApplyAttemptCount !== 1
    || counters.boundedCheckoutRedirectCount !== 0
    || counters.contactPostAttemptCount !== 0
    || counters.addressPostAttemptCount !== 0
    || counters.paymentInputCount !== 0 || counters.paymentSubmissionCount !== 0
    || counters.orderSubmissionCount !== 0
    || counters.marketingSubscriptionAttemptCount !== 0
    || counters.modelCallCount !== 0
    || counters.interactiveBrowserActionCount !== 0
    || counters.employeeTouchCount !== 0
    || failure.retryAutomaticallyPermitted !== false
    || failure.postRetryPermitted !== false || failure.contactReplayed !== false
    || failure.addressReplayed !== false || failure.paymentPerformed !== false
    || failure.orderSubmitted !== false || failure.capacityReserved !== false
    || failure.authority !== "NONE" || failure.decisionState !== "HOLD") {
    fail("PRIOR_V9_FAILURE_BINDING_INVALID");
  }
  const treeHash = digest(
    "outsider/adafruit-shipping-application-ambiguous-tree/v10", {
      priorV8RunTreeHash: v8.treeHash,
      priorV9GrantBytesHash: grantRecord.bytesHash,
      priorV9UseBytesHash: useRecord.bytesHash,
      runName: path.basename(runDirectory), artifacts,
    });
  return Object.freeze({ v8, grantRecord, grant: grant.value,
    selected: grant.selected, useRecord, use, runDirectory, artifacts,
    currentCookie, requestBody, attemptRecord, attempt, attemptHash,
    response, responseHeadersRecord, responseHeaders, responseHeadersHash,
    failureRecord, failure, failureHash, treeHash });
}

export function createAdafruitShippingReconciliationGrantValueV10(input = {}) {
  exact(input, ["v8RunTreeHash", "v9RunTreeHash", "v9GrantBytesHash",
    "v9GrantUseBytesHash", "v9AttemptHash", "v9RequestBodyBytesHash",
    "v9ResponseBytesHash", "v9ResponseHeadersRecordHash",
    "v9FailureManifestHash", "v9CookieBytesHash", "selectedRateRefHash",
    "selectedShippingMinor", "authorizedAt", "expiresAt"], "GRANT_INPUT");
  for (const field of ["v8RunTreeHash", "v9RunTreeHash",
    "v9GrantBytesHash", "v9GrantUseBytesHash", "v9AttemptHash",
    "v9RequestBodyBytesHash", "v9ResponseBytesHash",
    "v9ResponseHeadersRecordHash", "v9FailureManifestHash",
    "v9CookieBytesHash", "selectedRateRefHash"]) hash(input[field],
    field.toUpperCase());
  if (!Number.isSafeInteger(input.selectedShippingMinor)
    || input.selectedShippingMinor < 0) fail("SELECTED_SHIPPING_MINOR_INVALID");
  const authorizedAt = instant(input.authorizedAt, "AUTHORIZED_AT");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT");
  if (Date.parse(authorizedAt) >= Date.parse(expiresAt)) {
    fail("GRANT_INTERVAL_INVALID");
  }
  return Object.freeze({
    schema: OUTSIDER_ADAFRUIT_SHIPPING_RECONCILIATION_GRANT_SCHEMA_V10,
    schemaVersion: "10.0.0", supplierOrigin: ORIGIN, purpose: PURPOSE,
    v8RunTreeHash: input.v8RunTreeHash,
    v9RunTreeHash: input.v9RunTreeHash,
    v9GrantBytesHash: input.v9GrantBytesHash,
    v9GrantUseBytesHash: input.v9GrantUseBytesHash,
    v9AttemptHash: input.v9AttemptHash,
    v9RequestBodyBytesHash: input.v9RequestBodyBytesHash,
    v9ResponseBytesHash: input.v9ResponseBytesHash,
    v9ResponseHeadersRecordHash: input.v9ResponseHeadersRecordHash,
    v9FailureManifestHash: input.v9FailureManifestHash,
    v9CookieBytesHash: input.v9CookieBytesHash,
    selectedRateRefHash: input.selectedRateRefHash,
    selectedShippingMinor: input.selectedShippingMinor,
    startUrl: CHECKOUT_URL,
    permittedActions: [...PERMITTED_ACTIONS],
    forbiddenActions: [...FORBIDDEN_ACTIONS],
    paymentAuthorized: false, orderAuthorized: false,
    authorizedAt, expiresAt, oneUse: true,
  });
}

function validateGrant(record, context) {
  const value = exact(record.value, ["schema", "schemaVersion",
    "supplierOrigin", "purpose", "v8RunTreeHash", "v9RunTreeHash",
    "v9GrantBytesHash", "v9GrantUseBytesHash", "v9AttemptHash",
    "v9RequestBodyBytesHash", "v9ResponseBytesHash",
    "v9ResponseHeadersRecordHash", "v9FailureManifestHash",
    "v9CookieBytesHash", "selectedRateRefHash", "selectedShippingMinor",
    "startUrl", "permittedActions", "forbiddenActions",
    "paymentAuthorized", "orderAuthorized", "authorizedAt", "expiresAt",
    "oneUse"], "GRANT");
  if (value.schema
      !== OUTSIDER_ADAFRUIT_SHIPPING_RECONCILIATION_GRANT_SCHEMA_V10
    || value.schemaVersion !== "10.0.0" || value.supplierOrigin !== ORIGIN
    || value.purpose !== PURPOSE || value.startUrl !== CHECKOUT_URL
    || value.v8RunTreeHash !== context.v8.treeHash
    || value.v9RunTreeHash !== context.treeHash
    || value.v9GrantBytesHash !== context.grantRecord.bytesHash
    || value.v9GrantUseBytesHash !== context.useRecord.bytesHash
    || value.v9AttemptHash !== context.attemptHash
    || value.v9RequestBodyBytesHash !== context.requestBody.bytesHash
    || value.v9ResponseBytesHash !== context.response.bytesHash
    || value.v9ResponseHeadersRecordHash !== context.responseHeadersHash
    || value.v9FailureManifestHash !== context.failureHash
    || value.v9CookieBytesHash !== context.currentCookie.bytesHash
    || value.selectedRateRefHash !== context.grant.selectedRateRefHash
    || value.selectedShippingMinor !== context.grant.selectedShippingMinor
    || value.paymentAuthorized !== false || value.orderAuthorized !== false
    || value.oneUse !== true) fail("GRANT_BINDING_INVALID");
  exactArray(value.permittedActions, PERMITTED_ACTIONS, "GRANT_ACTIONS");
  exactArray(value.forbiddenActions, FORBIDDEN_ACTIONS, "GRANT_FORBIDDEN");
  instant(value.authorizedAt, "GRANT_AUTHORIZED_AT");
  instant(value.expiresAt, "GRANT_EXPIRES_AT");
  if (Date.parse(value.authorizedAt) < Date.parse(context.failure.observedAt)
    || Date.parse(value.authorizedAt) >= Date.parse(value.expiresAt)
    || Date.parse(value.expiresAt)
      > Date.parse(context.v8.routeEvidence.validUntil)
    || Date.parse(value.expiresAt)
      > Date.parse(context.v8.projection.completionDeadline)) {
    fail("GRANT_INTERVAL_INVALID");
  }
  return value;
}

function request(sessionRefHash, step, url) {
  return Object.freeze({
    schema: "outsider/source-specific-buyer-native-https-request/v1",
    schemaVersion: "1.0.0", provider: PROVIDER, sessionRefHash,
    operation: "QUOTE", step, method: "GET", url,
    headers: Object.freeze({ accept: "text/html" }), bodyBytes: null,
    redirectPolicy: "MANUAL_SAME_ORIGIN_ONLY",
    maximumResponseBytes: MAX_SOURCE_BYTES,
  });
}

function persistHeaders(runDirectory, name, exchange, observedAt) {
  const body = { schema: HEADER_SCHEMA, schemaVersion: "10.0.0", observedAt,
    status: exchange.status, finalUrl: exchange.finalUrl,
    headers: Object.fromEntries(Object.entries(exchange.headers)
      .map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])),
    publiclyProjected: false };
  const value = { ...body, headersRecordHash: digest(HEADER_SCHEMA, body) };
  return Object.freeze({ value,
    artifact: writeOnce(path.join(runDirectory, name), value) });
}

function failureCode(error) {
  const candidate = error?.outsiderCode;
  return typeof candidate === "string" && /^[A-Z0-9_]{3,128}$/u.test(candidate)
    ? candidate : "UNCLASSIFIED_READ_ONLY_RECONCILIATION_FAILURE";
}

function writeFailure(runDirectory, context, grantRecord, observedAt,
  counters, error, responsePersisted) {
  const artifacts = inventory(runDirectory);
  const body = { schema: FAILURE_SCHEMA, schemaVersion: "10.0.0", observedAt,
    failureCode: failureCode(error), priorV9RunTreeHash: context.treeHash,
    readOnlyGrantBytesHash: grantRecord.bytesHash,
    responsePersistedBeforeInspection: responsePersisted,
    counters: { ...counters }, artifactInventory: artifacts,
    artifactCount: artifacts.length,
    artifactBytes: artifacts.reduce((sum, item) => sum + item.bytes, 0),
    retryAutomaticallyPermitted: false, predecessorEffectReplayed: false,
    postCount: 0, contactReplayed: false, addressReplayed: false,
    shippingMethodAppliedAgain: false, paymentPerformed: false,
    orderSubmitted: false, capacityReserved: false,
    authority: "NONE", decisionState: "HOLD" };
  return writeOnce(path.join(runDirectory,
    "bounded-failure-manifest.v10.json"), { ...body,
    failureManifestHash: digest(FAILURE_SCHEMA, body) });
}

function currentEvidence(exchange, bodyArtifact, headersArtifact, step,
  requestedUrl, redirectFollowed) {
  const pending = [301, 302, 303, 307, 308].includes(exchange.status)
    ? exactCheckoutStepUrl(headerValue(exchange.headers, "location"),
      requestedUrl) : null;
  return Object.freeze({ requestedUrl, currentStepNumber: step,
    responseStatus: exchange.status, responseFinalUrl: exchange.finalUrl,
    responseBytes: exchange.bodyBytes.length,
    responseBytesHash: bodyArtifact.hash,
    responseHeadersRecordHash: headersArtifact.value.headersRecordHash,
    redirectFollowed, furtherRedirectObserved: pending !== null,
    furtherRedirectTarget: pending?.url ?? null,
    redirectLimitReached: pending !== null });
}

export async function runAdafruitShippingReconciliationLiveV10(options = {}) {
  const context = inspectAdafruitShippingApplicationAmbiguityV10(options);
  const grantRecord = canonicalFile(options.readOnlyGrantFile,
    "READ_ONLY_GRANT", 64 * 1024);
  const grant = validateGrant(grantRecord, context);
  const observedAt = instant(options.observedAt ?? new Date().toISOString(),
    "OBSERVED_AT");
  if (Date.parse(observedAt) < Date.parse(grant.authorizedAt)
    || Date.parse(observedAt) >= Date.parse(grant.expiresAt)) {
    fail("GRANT_NOT_ACTIVE");
  }
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!/^[a-f0-9]{32}$/u.test(nonce)) fail("NONCE_INVALID");
  const privateRoot = path.resolve(options.privateRoot ?? path.join(
    process.cwd(), ".outsider", "private"));
  ensureDirectory(privateRoot);
  const useDirectory = path.join(privateRoot,
    "adafruit-shipping-reconciliation-grant-use-v10");
  ensureDirectory(useDirectory);
  const useBody = { schema: USE_SCHEMA, schemaVersion: "10.0.0",
    grantBytesHash: grantRecord.bytesHash,
    priorV9RunTreeHash: context.treeHash, observedAt,
    nonceHash: digest("outsider/private-shipping-reconciliation-nonce/v10",
      nonce) };
  let useArtifact;
  try {
    useArtifact = writeOnce(path.join(useDirectory,
      `${grantRecord.bytesHash.slice(7)}.json`), { ...useBody,
      useHash: digest(USE_SCHEMA, useBody) });
  } catch (error) {
    if (error?.code === "EEXIST") fail("GRANT_ALREADY_USED");
    throw error;
  }
  const runDirectory = path.join(privateRoot,
    `adafruit-shipping-reconciliation-v10-${observedAt.slice(0, 10)
      .replaceAll("-", "")}-${nonce}`);
  if (existsSync(runDirectory)) fail("RUN_DIRECTORY_EXISTS");
  ensureDirectory(runDirectory);
  const stateDirectory = path.join(runDirectory, "https-state");
  ensureDirectory(stateDirectory);
  const copiedCookie = writeBytesOnce(path.join(stateDirectory,
    path.basename(context.currentCookie.absolute)), context.currentCookie.bytes);
  const counters = { liveHttpRequestCount: 0, getRequestCount: 0,
    postRequestCount: 0, boundedCheckoutRedirectCount: 0,
    contactPostAttemptCount: 0, addressPostAttemptCount: 0,
    shippingMethodApplyAttemptCount: 0, paymentInputCount: 0,
    paymentSubmissionCount: 0, orderSubmissionCount: 0,
    marketingSubscriptionAttemptCount: 0, modelCallCount: 0,
    interactiveBrowserActionCount: 0, employeeTouchCount: 0 };
  const rawFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof rawFetch !== "function") fail("FETCH_IMPL_INVALID");
  let allowedSecondUrl = null;
  const guardedFetch = async (url, init) => {
    const target = new URL(String(url));
    const permitted = counters.liveHttpRequestCount === 0
      ? target.href === CHECKOUT_URL
      : counters.liveHttpRequestCount === 1
        && allowedSecondUrl !== null && target.href === allowedSecondUrl;
    if (!permitted || init?.method !== "GET" || init.body !== undefined
      || target.origin !== ORIGIN || target.hash !== ""
      || counters.liveHttpRequestCount >= 2) fail("OUTBOUND_FORBIDDEN");
    counters.liveHttpRequestCount += 1;
    counters.getRequestCount += 1;
    return rawFetch(url, init);
  };
  const transport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: stateDirectory,
    orderRefHash: context.currentCookie.value.orderRefHash,
    allowedOrigins: [ORIGIN], timeoutMs: options.timeoutMs ?? 20_000,
    maximumResponseBytes: MAX_SOURCE_BYTES,
  }, { fetchImpl: guardedFetch, clock: () => Date.parse(observedAt) });
  const sessionRefHash = digest(
    "outsider/adafruit-shipping-reconciliation-session/v10", {
      priorV9RunTreeHash: context.treeHash,
      grantBytesHash: grantRecord.bytesHash,
    });
  const exchanges = [];
  let responsePersisted = false;
  let current;
  let capture;
  try {
    const first = await transport(request(sessionRefHash,
      "CURRENT_CHECKOUT_STATE_GET", CHECKOUT_URL));
    const firstBody = writeBytesOnce(path.join(runDirectory,
      "checkout-current-response.v10.bin"), first.bodyBytes);
    const firstHeaders = persistHeaders(runDirectory,
      "checkout-current-headers.v10.json", first, observedAt);
    responsePersisted = true;
    exchanges.push({ method: "GET", url: CHECKOUT_URL, status: first.status,
      finalUrl: first.finalUrl, bodyBytes: first.bodyBytes.length,
      bodyBytesHash: firstBody.hash,
      headersRecordHash: firstHeaders.value.headersRecordHash });
    if ([302, 303].includes(first.status)) {
      const redirect = exactCheckoutStepUrl(
        headerValue(first.headers, "location"), CHECKOUT_URL);
      if (redirect === null) fail("CHECKOUT_STEP_REDIRECT_INVALID");
      allowedSecondUrl = redirect.url;
      counters.boundedCheckoutRedirectCount += 1;
      const second = await transport(request(sessionRefHash,
        `CURRENT_CHECKOUT_STEP_${redirect.step}_GET`, redirect.url));
      const secondBody = writeBytesOnce(path.join(runDirectory,
        `checkout-step${redirect.step}-response.v10.bin`), second.bodyBytes);
      const secondHeaders = persistHeaders(runDirectory,
        `checkout-step${redirect.step}-headers.v10.json`, second, observedAt);
      exchanges.push({ method: "GET", url: redirect.url,
        status: second.status, finalUrl: second.finalUrl,
        bodyBytes: second.bodyBytes.length, bodyBytesHash: secondBody.hash,
        headersRecordHash: secondHeaders.value.headersRecordHash });
      current = { exchange: second, body: secondBody,
        headers: secondHeaders, step: redirect.step,
        requestedUrl: redirect.url, redirectFollowed: true };
    } else {
      current = { exchange: first, body: firstBody, headers: firstHeaders,
        step: null, requestedUrl: CHECKOUT_URL, redirectFollowed: false };
    }
    const captureBody = { schema: CAPTURE_SCHEMA, schemaVersion: "10.0.0",
      observedAt, priorV9RunTreeHash: context.treeHash,
      exchanges, requestBodyPresent: false, rawSourceProjected: false,
      redirectsFollowed: counters.boundedCheckoutRedirectCount };
    capture = Object.freeze({ ...captureBody,
      captureHash: digest(CAPTURE_SCHEMA, captureBody) });
    writeOnce(path.join(runDirectory, "private-source-capture.v10.json"),
      capture);
  } catch (error) {
    writeFailure(runDirectory, context, grantRecord, observedAt, counters,
      error, responsePersisted);
    throw error;
  }
  const sellerState = currentEvidence(current.exchange, current.body,
    current.headers, current.step, current.requestedUrl,
    current.redirectFollowed);
  let summary = null;
  if (sellerState.currentStepNumber === 4
    && sellerState.responseStatus === 200
    && sellerState.responseFinalUrl === `${CHECKOUT_URL}?step=4`
    && /^text\/html(?:\s*;|\s*$)/iu.test(
      headerValue(current.exchange.headers, "content-type") ?? "")) {
    try {
      summary = parseAdafruitPrepaymentSummaryV9(
        current.exchange.bodyBytes.toString("utf8"),
        context.v8.projection.completionDeadline,
        context.grant.selectedShippingMinor);
    } catch (error) {
      writeFailure(runDirectory, context, grantRecord, observedAt, counters,
        error, true);
      throw error;
    }
  }
  const step4SummaryObserved = summary !== null;
  const occurrenceBody = { schema: OCCURRENCE_SCHEMA,
    schemaVersion: "10.0.0", observedAt,
    priorV9RunTreeHash: context.treeHash,
    sourceCaptureHash: capture.captureHash,
    selectedRateRefHash: context.grant.selectedRateRefHash,
    selectedShippingMinor: context.grant.selectedShippingMinor,
    sellerState, step4SummaryObserved, prepaymentSummary: summary,
    predecessorEffectReplayed: false, postCount: 0,
    paymentPerformed: false, orderSubmitted: false, capacityReserved: false };
  const sourceOccurrenceHash = digest(OCCURRENCE_SCHEMA, occurrenceBody);
  const allInStatus = summary?.allInTotalProven === true ? "COMPLETE"
    : summary?.allInTotalMinor === null || summary === null
      ? "UNAVAILABLE" : "PARTIAL";
  const budgetSatisfied = summary?.allInTotalProven === true
    ? BigInt(summary.allInTotalMinor)
      <= BigInt(context.v8.projection.budget.maximumAmountMinor) : null;
  const publicBody = { schema: PUBLIC_SCHEMA, schemaVersion: "10.0.0",
    predecessor: { v8ProjectionHash: context.v8.projectionHash,
      v8RunTreeHash: context.v8.treeHash,
      v9RunTreeHash: context.treeHash,
      v9FailureManifestHash: context.failureHash,
      v9AttemptHash: context.attemptHash,
      v9ResponseBytesHash: context.response.bytesHash,
      v9CookieBytesHash: context.currentCookie.bytesHash,
      predecessorEffectReplayed: false },
    observedAt,
    outcomeIntentRefHash: context.v8.projection.outcomeIntentRefHash,
    acceptanceSpecRefHash: context.v8.projection.acceptanceSpecRefHash,
    maximumLossConstraintRefHash:
      context.v8.projection.maximumLossConstraintRefHash,
    recoveryOptionRefHash: context.v8.projection.recoveryOptionRefHash,
    routeRole: context.v8.projection.routeRole,
    budget: context.v8.projection.budget,
    completionDeadline: context.v8.projection.completionDeadline,
    selectedRateRefHash: context.grant.selectedRateRefHash,
    selectedShippingMinor: context.grant.selectedShippingMinor,
    sourceOccurrenceHash, sellerState,
    step4SummaryObserved, prepaymentSummary: summary,
    allInTotalMinor: summary?.allInTotalMinor ?? null,
    allInTotalProven: summary?.allInTotalProven ?? false,
    allInEvidenceStatus: allInStatus, budgetSatisfied,
    structuredEtaObserved: summary?.structuredEtaObserved ?? false,
    deliveryDeadlineProven: summary?.deliveryDeadlineProven ?? false,
    etaEvidenceStatus: summary?.structuredEtaObserved === true
      ? "STRUCTURED" : "UNAVAILABLE",
    runState: step4SummaryObserved
      ? "PREPAYMENT_SUMMARY_RECONCILED_HOLD"
      : "CURRENT_CHECKOUT_STEP_RECONCILED_HOLD",
    nextGate: step4SummaryObserved
      && summary.allInTotalProven && summary.deliveryDeadlineProven
      ? "RESOURCE_OWNER_CAPACITY_AND_SEPARATE_PAYMENT_ORDER_AUTHORIZATION"
      : step4SummaryObserved
        ? "OBTAIN_COMPLETE_TOTAL_AND_STRUCTURED_ETA"
        : "CURRENT_SELLER_STEP_IS_NOT_PROVEN_PREPAYMENT_SUMMARY",
    counters, predecessorTreesMutated: false,
    contactEffectReplayed: false, addressEffectReplayed: false,
    shippingMethodApplyAttempted: false, shippingMethodAppliedAgain: false,
    priorShippingApplicationEffectState:
      "AMBIGUOUS_SHIPPING_APPLICATION_NO_RETRY",
    paymentFieldsParsed: false, paymentInputSubmitted: false,
    paymentAuthorized: false, paymentPerformed: false,
    orderAuthorized: false, orderSubmitted: false,
    marketingSubscriptionPerformed: false, rawResponseProjected: false,
    capacityReserved: false, independentOutcomeTruthEstablished: false,
    userResultCommitted: false, authority: "NONE", decisionState: "HOLD" };
  const projection = Object.freeze({ ...publicBody,
    projectionHash: digest(PUBLIC_SCHEMA, publicBody) });
  const publicArtifact = writeOnce(path.join(runDirectory,
    "public-projection.v10.json"), projection);
  const routeEvidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: projection.projectionHash,
    occurrenceRefHash: sourceOccurrenceHash,
    recoveryOptionRefHash: projection.recoveryOptionRefHash,
    observedAt, validUntil: grant.expiresAt,
    sourceReplayReceiptHash: capture.captureHash,
    facts: {
      specification: { ...context.v8.routeEvidence.facts.specification },
      allInPrice: { sourceOccurrenceRefHash: sourceOccurrenceHash,
        constraintRefHash: projection.maximumLossConstraintRefHash,
        currency: projection.budget.currency,
        allInMinorUnits: summary?.allInTotalMinor ?? null,
        includesItemTaxShippingAndFees: summary?.allInTotalProven ?? false,
        status: allInStatus },
      eta: { sourceOccurrenceRefHash: sourceOccurrenceHash,
        completionDeadline: projection.completionDeadline,
        estimatedCompletionAt: summary?.sourceDeliveryDate === undefined
          || summary?.sourceDeliveryDate === null ? null
          : `${summary.sourceDeliveryDate}T23:59:59.999Z`,
        status: summary?.structuredEtaObserved === true
          ? "STRUCTURED" : "UNAVAILABLE" },
      capacity: { sourceOccurrenceRefHash: sourceOccurrenceHash,
        capacityLifecycleRefHash: null, capacityLifecycleHeadHash: null,
        reservedFrom: null, reservedUntil: null, status: "UNRESERVED",
        sourceClass: "SELLER_SERVER_ACK_ONLY" },
    },
  });
  const routeEvidenceArtifact = writeOnce(path.join(runDirectory,
    "route-evidence.v1.json"), routeEvidence);
  const finalCookie = privateBytesFile(path.join(stateDirectory,
    path.basename(context.currentCookie.absolute)), "FINAL_COOKIE", 1,
  256 * 1024);
  const artifacts = inventory(runDirectory);
  const manifestBody = { schema: MANIFEST_SCHEMA, schemaVersion: "10.0.0",
    observedAt, priorV8RunTreeHash: context.v8.treeHash,
    priorV9RunTreeHash: context.treeHash,
    priorV9GrantBytesHash: context.grantRecord.bytesHash,
    priorV9GrantUseBytesHash: context.useRecord.bytesHash,
    priorV9AttemptHash: context.attemptHash,
    priorV9RequestBodyBytesHash: context.requestBody.bytesHash,
    priorV9ResponseBytesHash: context.response.bytesHash,
    priorV9ResponseHeadersRecordHash: context.responseHeadersHash,
    priorV9FailureManifestHash: context.failureHash,
    readOnlyGrantBytesHash: grantRecord.bytesHash,
    readOnlyGrantUseBytesHash: useArtifact.hash,
    sourceCookieBytesHash: context.currentCookie.bytesHash,
    copiedCookieBytesHash: copiedCookie.hash,
    finalCookieBytesHash: finalCookie.bytesHash,
    sourceCaptureHash: capture.captureHash,
    sourceOccurrenceHash, projectionHash: projection.projectionHash,
    routeEvidenceHash: routeEvidence.evidenceHash,
    artifactInventory: artifacts, artifactCount: artifacts.length,
    artifactBytes: artifacts.reduce((sum, item) => sum + item.bytes, 0),
    responseBytesPersistedBeforeParse: true,
    responseHeadersPersistedBeforeParse: true,
    predecessorTreesMutated: false, predecessorEffectReplayed: false,
    getCount: counters.getRequestCount, postCount: 0,
    redirectsFollowed: counters.boundedCheckoutRedirectCount,
    contactReplayCount: 0, addressReplayCount: 0,
    shippingMethodApplyCount: 0, paymentInputCount: 0,
    paymentSubmissionCount: 0, orderCount: 0, marketingCount: 0,
    currentStepNumber: sellerState.currentStepNumber,
    step4SummaryObserved, allInEvidenceStatus: allInStatus,
    etaEvidenceStatus: projection.etaEvidenceStatus,
    capacityReserved: false, authority: "NONE", decisionState: "HOLD" };
  const privateManifest = Object.freeze({ ...manifestBody,
    manifestHash: digest(MANIFEST_SCHEMA, manifestBody) });
  const privateManifestArtifact = writeOnce(path.join(runDirectory,
    "private-manifest.v10.json"), privateManifest);
  return Object.freeze({ runDirectory, projection, publicArtifact,
    routeEvidence, routeEvidenceArtifact, privateManifest,
    privateManifestArtifact, sourceCapture: capture });
}

function parseCli(argv) {
  const allowed = new Set(["--live-read-only-reconcile-no-post",
    "--prior-v8-run", "--prior-v9-run", "--prior-v9-grant",
    "--prior-v9-use", "--grant", "--private-root", "--nonce"]);
  const result = { confirmed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag)) fail("ARGUMENT_INVALID");
    if (flag === "--live-read-only-reconcile-no-post") {
      result.confirmed = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail("ARGUMENT_VALUE");
    result[flag.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  for (const key of ["prior_v8_run", "prior_v9_run", "prior_v9_grant",
    "prior_v9_use", "grant"]) {
    if (result[key] === undefined) fail("REQUIRED_ARGUMENT_MISSING");
  }
  if (!result.confirmed) fail("LIVE_EFFECT_CONFIRMATION_REQUIRED");
  return result;
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseCli(process.argv.slice(2));
    const result = await runAdafruitShippingReconciliationLiveV10({
      priorV8RunDirectory: args.prior_v8_run,
      priorV9RunDirectory: args.prior_v9_run,
      priorV9GrantFile: args.prior_v9_grant,
      priorV9UseFile: args.prior_v9_use,
      readOnlyGrantFile: args.grant,
      privateRoot: args.private_root,
      nonce: args.nonce,
    });
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
