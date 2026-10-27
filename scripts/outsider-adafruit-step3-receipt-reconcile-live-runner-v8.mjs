#!/usr/bin/env node

/*
 * Adafruit Step 3 receipt-only reconciliation v8.
 *
 * v7 correctly allowed only a read-only Step 3 GET, but its parser assumed
 * that each shipping radio was nested inside its label and therefore stopped
 * on Adafruit's real sibling input + label[for=id] DOM.  This descendant binds
 * the consumed v7 attempt and evolved cookie, captures exact bytes and headers
 * privately before parsing, and preserves missing total/ETA as PARTIAL and
 * UNAVAILABLE rather than manufacturing stronger evidence.
 */

import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync, closeSync, constants, existsSync, fsyncSync, lstatSync,
  mkdirSync, openSync, readFileSync, readdirSync, writeSync,
} from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import { createBuyerNativeRouteEvidenceV1 }
  from "../src/outsider-buyer-native-route-evidence-v1.js";
import { createOrderScopedBuyerNativeHttpsTransportV1 }
  from "../src/outsider-order-scoped-buyer-native-https-transport-v1.js";
import {
  OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILIATION_GRANT_SCHEMA_V7,
  inspectAdafruitStep3ReceiptRecoveryContextV7,
} from "./outsider-adafruit-step3-receipt-reconcile-live-runner-v7.mjs";

const PREFIX = "OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILE_LIVE_RUNNER_V8_";
const ORIGIN = "https://www.adafruit.com";
const PROVIDER = "ADAFRUIT_GUEST_SHOPPER";
const PURPOSE = "RETRY_READ_ONLY_STEP3_RECEIPT_AFTER_V7_PARSER_MISMATCH";
const V7_USE_SCHEMA
  = "outsider/private-adafruit-step3-receipt-reconciliation-grant-use/v7";
const PUBLIC_SCHEMA
  = "outsider/adafruit-step3-receipt-reconcile-public-projection/v8";
const MANIFEST_SCHEMA
  = "outsider/private-adafruit-step3-receipt-reconcile-manifest/v8";
const FAILURE_SCHEMA
  = "outsider/private-adafruit-step3-receipt-reconcile-failure-manifest/v8";
const HEADER_SCHEMA
  = "outsider/private-adafruit-step3-response-headers/v8";
const CAPTURE_SCHEMA
  = "outsider/private-adafruit-step3-source-capture/v8";
const OCCURRENCE_SCHEMA
  = "outsider/adafruit-step3-source-occurrence/v8";
const USE_SCHEMA
  = "outsider/private-adafruit-step3-reconciliation-grant-use/v8";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 768 * 1024;
const PERMITTED_ACTIONS = Object.freeze([
  "READ_EXISTING_CHECKOUT_STEP_3_RECEIPT",
]);
const FORBIDDEN_ACTIONS = Object.freeze([
  "ADDRESS_RESUBMISSION", "CONTACT_RESUBMISSION",
  "CROSS_ORIGIN_DISCLOSURE", "MARKETING_SUBSCRIPTION",
  "ORDER_SUBMISSION", "PAYMENT", "PII_PUBLIC_PROJECTION",
  "SHIPPING_METHOD_APPLICATION",
]);

export const OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILIATION_GRANT_SCHEMA_V8
  = "outsider/private-adafruit-step3-receipt-reconciliation-grant/v8";

export const OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILE_V8_BOUNDARY
  = Object.freeze({
    descendsFrom: "outsider/adafruit-step3-receipt-reconcile-public-projection/v7",
    predecessorReason: "REAL_DOM_USES_SIBLING_LABEL_FOR_RADIO",
    predecessorMutated: false,
    onlyRequests: Object.freeze([
      "GET https://www.adafruit.com/checkout",
      "GET https://www.adafruit.com/checkout?step=3",
    ]),
    maximumRequests: 2,
    postAllowed: false,
    sourceBytesPersistedBeforeParse: true,
    sourceHeadersPersistedBeforeParse: true,
    parseFailureManifestPersisted: true,
    componentSumWithoutDisplayedTotalIsComplete: false,
    missingEtaIsStructured: false,
    shippingMethodApplied: false,
    paymentAllowed: false,
    orderAllowed: false,
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
    || new Date(Date.parse(value)).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function exactArray(value, expected, code) {
  if (!Array.isArray(value)
    || canonicalizeStrict(value) !== canonicalizeStrict(expected)) fail(`${code}_INVALID`);
}

function privateFile(file, code, maximum = MAX_JSON_BYTES) {
  const absolute = path.resolve(file ?? "");
  let info;
  try { info = lstatSync(absolute); } catch { fail(`${code}_UNAVAILABLE`); }
  if (!info.isFile() || info.isSymbolicLink()
    || (info.mode & 0o777) !== 0o600 || info.size < 1
    || info.size > maximum) fail(`${code}_NOT_PRIVATE`);
  const bytes = readFileSync(absolute);
  return Object.freeze({ absolute, bytes, bytesHash: bytesHash(bytes) });
}

function canonicalFile(file, code, maximum = MAX_JSON_BYTES) {
  const record = privateFile(file, code, maximum);
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

function validateV7Grant(record, base) {
  const value = exact(record.value, ["schema", "schemaVersion",
    "supplierOrigin", "purpose", "priorProjectionHash", "priorManifestHash",
    "inputBytesHash", "partialContinuationTreeHash",
    "partialContinuationJournalHeadHash", "partialContinuationCookieBytesHash",
    "priorResidualGrantBytesHash", "priorResidualGrantUseBytesHash",
    "permittedActions", "forbiddenActions", "authorizedAt", "expiresAt",
    "oneUse"], "PRIOR_V7_GRANT");
  if (value.schema
      !== OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILIATION_GRANT_SCHEMA_V7
    || value.schemaVersion !== "7.0.0" || value.supplierOrigin !== ORIGIN
    || value.purpose !== "READ_EXISTING_STEP3_QUOTE_RECEIPT_ONLY"
    || value.oneUse !== true
    || value.priorProjectionHash !== base.prior.projection.projectionHash
    || value.priorManifestHash !== base.prior.manifest.manifestHash
    || value.inputBytesHash !== base.inputRecord.bytesHash
    || value.partialContinuationTreeHash !== base.partial.partialTreeHash
    || value.partialContinuationJournalHeadHash !== base.partial.journal.headHash
    || value.partialContinuationCookieBytesHash
      !== base.partial.cookie.bytesHash
    || value.priorResidualGrantBytesHash
      !== base.residual.grantRecord.bytesHash
    || value.priorResidualGrantUseBytesHash
      !== base.residual.useRecord.bytesHash) fail("PRIOR_V7_GRANT_BINDING_INVALID");
  exactArray(value.permittedActions, PERMITTED_ACTIONS,
    "PRIOR_V7_GRANT_ACTIONS");
  exactArray(value.forbiddenActions, FORBIDDEN_ACTIONS,
    "PRIOR_V7_GRANT_FORBIDDEN");
  instant(value.authorizedAt, "PRIOR_V7_GRANT_AUTHORIZED_AT");
  instant(value.expiresAt, "PRIOR_V7_GRANT_EXPIRES_AT");
  return value;
}

/** Validate the consumed v7 parser-mismatch attempt without reading its PII. */
export function inspectAdafruitStep3ReceiptRecoveryAttemptV8(options = {}) {
  const base = inspectAdafruitStep3ReceiptRecoveryContextV7(options);
  const grantRecord = canonicalFile(options.priorV7GrantFile,
    "PRIOR_V7_GRANT", 64 * 1024);
  const grant = validateV7Grant(grantRecord, base);
  const useRecord = canonicalFile(options.priorV7UseFile,
    "PRIOR_V7_USE", 64 * 1024);
  const use = exact(useRecord.value, ["schema", "schemaVersion",
    "grantBytesHash", "partialContinuationTreeHash", "observedAt",
    "nonceHash", "useHash"], "PRIOR_V7_USE");
  const { useHash, ...useBody } = use;
  if (use.schema !== V7_USE_SCHEMA || use.schemaVersion !== "7.0.0"
    || use.grantBytesHash !== grantRecord.bytesHash
    || use.partialContinuationTreeHash !== base.partial.partialTreeHash
    || !HASH.test(use.nonceHash ?? "")
    || useHash !== digest(V7_USE_SCHEMA, useBody)
    || path.basename(useRecord.absolute)
      !== `${grantRecord.bytesHash.slice(7)}.json`) fail("PRIOR_V7_USE_INVALID");
  instant(use.observedAt, "PRIOR_V7_USE_OBSERVED_AT");
  if (Date.parse(use.observedAt) < Date.parse(grant.authorizedAt)
    || Date.parse(use.observedAt) >= Date.parse(grant.expiresAt)) {
    fail("PRIOR_V7_USE_OUTSIDE_GRANT");
  }
  const runDirectory = privateDirectory(options.partialV7RunDirectory,
    "PARTIAL_V7_RUN");
  const runMatch
    = /^adafruit-step3-receipt-reconcile-v7-\d{8}-([a-f0-9]{32})$/u
      .exec(path.basename(runDirectory));
  if (runMatch === null || use.nonceHash !== digest(
    "outsider/private-step3-reconciliation-nonce/v7", runMatch[1])) {
    fail("PARTIAL_V7_RUN_USE_BINDING_INVALID");
  }
  const artifacts = inventory(runDirectory);
  if (artifacts.length !== 1
    || !/^https-state\/[a-f0-9]{64}\.cookies-v1\.json$/u
      .test(artifacts[0].relativePath)) fail("PARTIAL_V7_TREE_SHAPE_INVALID");
  const currentCookie = cookie(path.join(runDirectory,
    artifacts[0].relativePath), "PARTIAL_V7_COOKIE");
  if (currentCookie.bytesHash !== artifacts[0].bytesHash
    || currentCookie.bytes.length !== artifacts[0].bytes
    || currentCookie.value.orderRefHash
      !== base.partial.cookie.value.orderRefHash) {
    fail("PARTIAL_V7_COOKIE_BINDING_INVALID");
  }
  const treeBody = {
    priorV7GrantBytesHash: grantRecord.bytesHash,
    priorV7UseBytesHash: useRecord.bytesHash,
    priorV6PartialTreeHash: base.partial.partialTreeHash,
    artifacts,
  };
  return Object.freeze({ base, grantRecord, grant, useRecord, use,
    runDirectory, artifacts, cookie: currentCookie,
    partialV7TreeHash: digest("outsider/adafruit-partial-step3-v7-tree/v8",
      treeBody) });
}

export function createAdafruitStep3ReceiptReconciliationGrantValueV8(
  input = {}) {
  const authorizedAt = instant(input.authorizedAt, "AUTHORIZED_AT");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT");
  if (Date.parse(authorizedAt) >= Date.parse(expiresAt)) {
    fail("GRANT_INTERVAL_INVALID");
  }
  for (const field of ["priorProjectionHash", "priorManifestHash",
    "inputBytesHash", "priorV6PartialTreeHash", "priorV7GrantBytesHash",
    "priorV7UseBytesHash", "partialV7TreeHash", "partialV7CookieBytesHash"]) {
    hash(input[field], field.toUpperCase());
  }
  return Object.freeze({
    schema: OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILIATION_GRANT_SCHEMA_V8,
    schemaVersion: "8.0.0",
    supplierOrigin: ORIGIN,
    purpose: PURPOSE,
    priorProjectionHash: input.priorProjectionHash,
    priorManifestHash: input.priorManifestHash,
    inputBytesHash: input.inputBytesHash,
    priorV6PartialTreeHash: input.priorV6PartialTreeHash,
    priorV7GrantBytesHash: input.priorV7GrantBytesHash,
    priorV7UseBytesHash: input.priorV7UseBytesHash,
    partialV7TreeHash: input.partialV7TreeHash,
    partialV7CookieBytesHash: input.partialV7CookieBytesHash,
    permittedActions: [...PERMITTED_ACTIONS],
    forbiddenActions: [...FORBIDDEN_ACTIONS],
    authorizedAt,
    expiresAt,
    oneUse: true,
  });
}

function validateGrant(record, context) {
  const value = exact(record.value, ["schema", "schemaVersion",
    "supplierOrigin", "purpose", "priorProjectionHash", "priorManifestHash",
    "inputBytesHash", "priorV6PartialTreeHash", "priorV7GrantBytesHash",
    "priorV7UseBytesHash", "partialV7TreeHash", "partialV7CookieBytesHash",
    "permittedActions", "forbiddenActions", "authorizedAt", "expiresAt",
    "oneUse"], "GRANT");
  if (value.schema
      !== OUTSIDER_ADAFRUIT_STEP3_RECEIPT_RECONCILIATION_GRANT_SCHEMA_V8
    || value.schemaVersion !== "8.0.0" || value.supplierOrigin !== ORIGIN
    || value.purpose !== PURPOSE || value.oneUse !== true
    || value.priorProjectionHash
      !== context.base.prior.projection.projectionHash
    || value.priorManifestHash !== context.base.prior.manifest.manifestHash
    || value.inputBytesHash !== context.base.inputRecord.bytesHash
    || value.priorV6PartialTreeHash !== context.base.partial.partialTreeHash
    || value.priorV7GrantBytesHash !== context.grantRecord.bytesHash
    || value.priorV7UseBytesHash !== context.useRecord.bytesHash
    || value.partialV7TreeHash !== context.partialV7TreeHash
    || value.partialV7CookieBytesHash !== context.cookie.bytesHash) {
    fail("GRANT_BINDING_INVALID");
  }
  exactArray(value.permittedActions, PERMITTED_ACTIONS, "GRANT_ACTIONS");
  exactArray(value.forbiddenActions, FORBIDDEN_ACTIONS, "GRANT_FORBIDDEN");
  instant(value.authorizedAt, "GRANT_AUTHORIZED_AT");
  instant(value.expiresAt, "GRANT_EXPIRES_AT");
  if (Date.parse(value.authorizedAt) < Date.parse(context.use.observedAt)
    || Date.parse(value.authorizedAt) >= Date.parse(value.expiresAt)
    || Date.parse(value.expiresAt)
      > Date.parse(context.base.prior.projection.completionDeadline)) {
    fail("GRANT_INTERVAL_INVALID");
  }
  return value;
}

function decodeHtml(value) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'").replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">").replaceAll("&nbsp;", " ");
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(
    `\\b${name}=(?:\"([^\"]*)\"|'([^']*)')`, "iu"));
  return match?.[1] ?? match?.[2] ?? null;
}

function plainText(value) {
  return decodeHtml(value.replace(/<[^>]*>/gu, " "))
    .replace(/\s+/gu, " ").trim();
}

function moneyMinor(value) {
  const match = /^\$?([0-9]{1,9})\.([0-9]{2})$/u.exec(value.trim());
  if (match === null) return null;
  const result = Number(match[1]) * 100 + Number(match[2]);
  return Number.isSafeInteger(result) ? result : null;
}

const MONTH = Object.freeze({ jan: "01", feb: "02", mar: "03", apr: "04",
  may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10",
  nov: "11", dec: "12" });

function dateValue(source) {
  const candidates = [];
  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/u.exec(source)?.[1];
  if (iso !== undefined) candidates.push(iso);
  const numeric = /\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(20\d{2})\b/u
    .exec(source);
  if (numeric !== null) candidates.push(
    `${numeric[3]}-${numeric[1].padStart(2, "0")}-${numeric[2].padStart(2, "0")}`);
  const named = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})\b/iu
    .exec(source);
  if (named !== null) candidates.push(
    `${named[3]}-${MONTH[named[1].slice(0, 3).toLowerCase()]}-${named[2].padStart(2, "0")}`);
  return candidates.find((candidate) => new Date(
    `${candidate}T00:00:00.000Z`).toISOString().slice(0, 10) === candidate)
    ?? null;
}

function siblingRates(html) {
  const labels = new Map();
  for (const match of html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/giu)) {
    const opening = match[0].slice(0, match[0].indexOf(">") + 1);
    const target = attribute(opening, "for");
    if (target !== null && !labels.has(target)) {
      labels.set(target, plainText(match[0]));
    }
  }
  const rates = [];
  const seen = new Set();
  for (const match of html.matchAll(/<input\b[^>]*>/giu)) {
    const input = match[0];
    if ((attribute(input, "type") ?? "").toLowerCase() !== "radio"
      || attribute(input, "name") !== "shipping") continue;
    const id = attribute(input, "id");
    const methodValue = attribute(input, "value");
    const description = id === null ? null : labels.get(id);
    if (id === null || methodValue === null || description === undefined
      || seen.has(methodValue)) continue;
    const amounts = [...description.matchAll(/\$[0-9]{1,9}\.[0-9]{2}/gu)]
      .map((item) => moneyMinor(item[0])).filter((item) => item !== null);
    if (amounts.length < 1) continue;
    const structuredDate = ["data-delivery-date",
      "data-estimated-delivery-date", "data-eta"]
      .map((name) => attribute(input, name)).find((value) => value !== null);
    seen.add(methodValue);
    rates.push(Object.freeze({
      rateRefHash: digest("outsider/adafruit-step3-rate/v8", {
        id, methodValue, description,
      }),
      amountMinor: amounts.at(-1),
      selectedByProvider: /\bchecked(?:\s|=|>)/iu.test(input),
      sourceDeliveryDate: dateValue(structuredDate ?? description),
    }));
  }
  return Object.freeze(rates);
}

function totals(html) {
  const output = { subtotalMinor: null, shippingMinor: null, taxMinor: null,
    displayedTotalMinor: null };
  for (const match of html.matchAll(
    /<div\b[^>]*checkout-sidebar-ot-title[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*checkout-sidebar-ot-text[^>]*>([\s\S]*?)<\/div>/giu)) {
    const label = plainText(match[1]).toLowerCase();
    const amount = moneyMinor(plainText(match[2]));
    if (amount === null) continue;
    if (/^subtotal\b/u.test(label)) output.subtotalMinor = amount;
    else if (/^shipping\b/u.test(label)) output.shippingMinor = amount;
    else if (/^(?:sales\s+)?tax\b/u.test(label)) output.taxMinor = amount;
    else if (/^total\b/u.test(label)) output.displayedTotalMinor = amount;
  }
  return Object.freeze(output);
}

function parseQuote(html, completionDeadline) {
  if (/\b(?:g-recaptcha|hcaptcha|cf-turnstile|captcha)\b/iu.test(html)) {
    fail("STEP3_CAPTCHA_PRESENT");
  }
  if (/\bvalue=(?:"save_two"|'save_two')/iu.test(html)) {
    fail("STEP3_IS_ADDRESS_FORM");
  }
  const rates = siblingRates(html);
  if (rates.length < 1) fail("STEP3_SIBLING_SHIPPING_RATES_NOT_OBSERVED");
  const selected = rates.filter((rate) => rate.selectedByProvider);
  const selectedRate = selected.length === 1 ? selected[0] : null;
  const summary = totals(html);
  const componentSumComplete = selectedRate !== null
    && summary.subtotalMinor !== null && summary.taxMinor !== null;
  const componentSumMinor = componentSumComplete
    ? summary.subtotalMinor + selectedRate.amountMinor + summary.taxMinor
    : null;
  const displayedTotalMatchesComponents = componentSumMinor !== null
    && summary.displayedTotalMinor !== null
    && summary.displayedTotalMinor === componentSumMinor;
  const allInTotalMinor = summary.displayedTotalMinor ?? componentSumMinor;
  const sourceDeliveryDate = selectedRate?.sourceDeliveryDate ?? null;
  return Object.freeze({
    rates,
    selectedRateRefHash: selectedRate?.rateRefHash ?? null,
    subtotalMinor: summary.subtotalMinor,
    destinationTaxMinor: summary.taxMinor,
    selectedShippingMinor: selectedRate?.amountMinor ?? null,
    displayedTotalMinor: summary.displayedTotalMinor,
    componentSumMinor,
    componentSumComplete,
    displayedTotalMatchesComponents,
    allInTotalMinor,
    allInTotalProven: displayedTotalMatchesComponents,
    priceEvidenceState: displayedTotalMatchesComponents ? "COMPLETE"
      : allInTotalMinor === null ? "UNAVAILABLE" : "PARTIAL_COMPONENT_SUM",
    sourceDeliveryDate,
    structuredEtaObserved: sourceDeliveryDate !== null,
    deliveryDeadlineProven: sourceDeliveryDate !== null
      && sourceDeliveryDate <= completionDeadline.slice(0, 10),
  });
}

function request(sessionRefHash, step, url) {
  return Object.freeze({
    schema: "outsider/source-specific-buyer-native-https-request/v1",
    schemaVersion: "1.0.0",
    provider: PROVIDER,
    sessionRefHash,
    operation: "QUOTE",
    step,
    method: "GET",
    url,
    headers: Object.freeze({ accept: "text/html" }),
    bodyBytes: null,
    redirectPolicy: "MANUAL_SAME_ORIGIN_ONLY",
    maximumResponseBytes: MAX_SOURCE_BYTES,
  });
}

function headerValue(headers, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function persistHeaders(runDirectory, name, exchange, observedAt) {
  const body = {
    schema: HEADER_SCHEMA,
    schemaVersion: "8.0.0",
    observedAt,
    status: exchange.status,
    finalUrl: exchange.finalUrl,
    headers: Object.fromEntries(Object.entries(exchange.headers)
      .map(([key, value]) => [key, Array.isArray(value) ? [...value] : value])),
    publiclyProjected: false,
  };
  const value = { ...body, headersRecordHash: digest(HEADER_SCHEMA, body) };
  return Object.freeze({ value,
    artifact: writeOnce(path.join(runDirectory, name), value) });
}

function failureCode(error) {
  const candidate = error?.outsiderCode;
  return typeof candidate === "string" && /^[A-Z0-9_]{3,128}$/u.test(candidate)
    ? candidate : "UNCLASSIFIED_STEP3_PARSE_FAILURE";
}

function writeFailure(runDirectory, context, grantRecord, observedAt,
  counters, error, capture = null) {
  const artifacts = inventory(runDirectory);
  const body = {
    schema: FAILURE_SCHEMA,
    schemaVersion: "8.0.0",
    observedAt,
    failureCode: failureCode(error),
    priorV7AttemptTreeHash: context.partialV7TreeHash,
    grantBytesHash: grantRecord.bytesHash,
    sourceCaptureHash: capture?.captureHash ?? null,
    sourceBytesPersistedBeforeParse: artifacts.some((entry) =>
      entry.relativePath === "checkout-step3-response.v8.bin"),
    sourceHeadersPersistedBeforeParse: artifacts.some((entry) =>
      entry.relativePath === "checkout-step3-headers.v8.json"),
    counters: { ...counters },
    artifactInventory: artifacts,
    artifactCount: artifacts.length,
    artifactBytes: artifacts.reduce((sum, item) => sum + item.bytes, 0),
    retryAutomaticallyPermitted: false,
    postPerformed: false,
    paymentPerformed: false,
    orderSubmitted: false,
  };
  return writeOnce(path.join(runDirectory, "bounded-failure-manifest.v8.json"),
    { ...body, failureManifestHash: digest(FAILURE_SCHEMA, body) });
}

export async function runAdafruitStep3ReceiptReconcileLiveV8(options = {}) {
  const context = inspectAdafruitStep3ReceiptRecoveryAttemptV8(options);
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
    "adafruit-step3-reconciliation-grant-use-v8");
  ensureDirectory(useDirectory);
  const useBody = {
    schema: USE_SCHEMA,
    schemaVersion: "8.0.0",
    grantBytesHash: grantRecord.bytesHash,
    partialV7TreeHash: context.partialV7TreeHash,
    observedAt,
    nonceHash: digest("outsider/private-step3-reconciliation-nonce/v8", nonce),
  };
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
    `adafruit-step3-receipt-reconcile-v8-${observedAt.slice(0, 10)
      .replaceAll("-", "")}-${nonce}`);
  if (existsSync(runDirectory)) fail("RUN_DIRECTORY_EXISTS");
  ensureDirectory(runDirectory);
  const stateDirectory = path.join(runDirectory, "https-state");
  ensureDirectory(stateDirectory);
  const copiedCookie = writeBytesOnce(path.join(stateDirectory,
    path.basename(context.cookie.absolute)), context.cookie.bytes);
  const counters = {
    liveHttpRequestCount: 0, getRequestCount: 0, postRequestCount: 0,
    boundedCheckoutRedirectCount: 0, contactPostAttemptCount: 0,
    addressPostAttemptCount: 0, shippingMethodApplyAttemptCount: 0,
    paymentEndpointAttemptCount: 0, orderEndpointAttemptCount: 0,
    marketingSubscriptionAttemptCount: 0, modelCallCount: 0,
    interactiveBrowserActionCount: 0, employeeTouchCount: 0,
  };
  const rawFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof rawFetch !== "function") fail("FETCH_IMPL_INVALID");
  const guardedFetch = async (url, init) => {
    const target = new URL(String(url));
    if (init?.method !== "GET" || init.body !== undefined
      || target.origin !== ORIGIN || target.pathname !== "/checkout"
      || !["", "?step=3"].includes(target.search) || target.hash !== ""
      || counters.liveHttpRequestCount >= 2) fail("OUTBOUND_FORBIDDEN");
    counters.liveHttpRequestCount += 1;
    counters.getRequestCount += 1;
    return rawFetch(url, init);
  };
  const transport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: stateDirectory,
    orderRefHash: context.cookie.value.orderRefHash,
    allowedOrigins: [ORIGIN],
    timeoutMs: options.timeoutMs ?? 20_000,
    maximumResponseBytes: MAX_SOURCE_BYTES,
  }, { fetchImpl: guardedFetch, clock: () => Date.parse(observedAt) });
  const sessionRefHash = digest("outsider/adafruit-step3-session/v8", {
    partialV7TreeHash: context.partialV7TreeHash,
    grantBytesHash: grantRecord.bytesHash,
  });
  let first;
  let second;
  let firstBody;
  let secondBody;
  let firstHeaders;
  let secondHeaders;
  let capture;
  try {
    first = await transport(request(sessionRefHash, "CURRENT_STEP_GET",
      `${ORIGIN}/checkout`));
    firstBody = writeBytesOnce(path.join(runDirectory,
      "checkout-current-step-response.v8.bin"), first.bodyBytes);
    firstHeaders = persistHeaders(runDirectory,
      "checkout-current-step-headers.v8.json", first, observedAt);
    const location = new URL(headerValue(first.headers, "location"),
      `${ORIGIN}/checkout`);
    if (![302, 303].includes(first.status)
      || location.href !== `${ORIGIN}/checkout?step=3`) {
      fail("STEP3_REDIRECT_NOT_OBSERVED");
    }
    counters.boundedCheckoutRedirectCount += 1;
    second = await transport(request(sessionRefHash, "STEP3_RECEIPT_GET",
      location.href));
    secondBody = writeBytesOnce(path.join(runDirectory,
      "checkout-step3-response.v8.bin"), second.bodyBytes);
    secondHeaders = persistHeaders(runDirectory,
      "checkout-step3-headers.v8.json", second, observedAt);
    const captureBody = {
      schema: CAPTURE_SCHEMA,
      schemaVersion: "8.0.0",
      observedAt,
      priorV7AttemptTreeHash: context.partialV7TreeHash,
      exchanges: [
        { method: "GET", url: `${ORIGIN}/checkout`, status: first.status,
          finalUrl: first.finalUrl, bodyBytes: first.bodyBytes.length,
          bodyBytesHash: firstBody.hash,
          headersRecordHash: firstHeaders.value.headersRecordHash },
        { method: "GET", url: `${ORIGIN}/checkout?step=3`, status: second.status,
          finalUrl: second.finalUrl, bodyBytes: second.bodyBytes.length,
          bodyBytesHash: secondBody.hash,
          headersRecordHash: secondHeaders.value.headersRecordHash },
      ],
      requestBodyPresent: false,
      rawSourceProjected: false,
    };
    capture = Object.freeze({ ...captureBody,
      captureHash: digest(CAPTURE_SCHEMA, captureBody) });
    writeOnce(path.join(runDirectory, "private-source-capture.v8.json"),
      capture);
  } catch (error) {
    writeFailure(runDirectory, context, grantRecord, observedAt, counters,
      error, capture);
    throw error;
  }
  let quote;
  try {
    const type = headerValue(second.headers, "content-type");
    if (second.status !== 200
      || second.finalUrl !== `${ORIGIN}/checkout?step=3`
      || typeof type !== "string"
      || !/^text\/html(?:\s*;|\s*$)/iu.test(type)) {
      fail("STEP3_RECEIPT_RESPONSE_INVALID");
    }
    quote = parseQuote(second.bodyBytes.toString("utf8"),
      context.base.prior.projection.completionDeadline);
  } catch (error) {
    writeFailure(runDirectory, context, grantRecord, observedAt, counters,
      error, capture);
    throw error;
  }
  const occurrenceBody = {
    schema: OCCURRENCE_SCHEMA,
    schemaVersion: "8.0.0",
    observedAt,
    priorV7AttemptTreeHash: context.partialV7TreeHash,
    sourceCaptureHash: capture.captureHash,
    responseBodyBytesHash: secondBody.hash,
    quote,
    sourceOccurrenceOnly: true,
    shippingMethodApplied: false,
    paymentPerformed: false,
    orderSubmitted: false,
    capacityReserved: false,
  };
  const sourceOccurrenceHash = digest(OCCURRENCE_SCHEMA, occurrenceBody);
  const allInStatus = quote.allInTotalProven ? "COMPLETE"
    : quote.allInTotalMinor === null ? "UNAVAILABLE" : "PARTIAL";
  const budgetSatisfied = quote.allInTotalProven
    ? BigInt(quote.allInTotalMinor)
      <= BigInt(context.base.prior.projection.budget.maximumAmountMinor)
    : null;
  const publicBody = {
    schema: PUBLIC_SCHEMA,
    schemaVersion: "8.0.0",
    predecessor: {
      priorProjectionHash: context.base.prior.projection.projectionHash,
      priorManifestHash: context.base.prior.manifest.manifestHash,
      priorV6PartialTreeHash: context.base.partial.partialTreeHash,
      priorV7AttemptTreeHash: context.partialV7TreeHash,
      priorV7GrantBytesHash: context.grantRecord.bytesHash,
      priorV7UseBytesHash: context.useRecord.bytesHash,
      priorEffectReplayed: false,
    },
    observedAt,
    selectedRoute: context.base.prior.projection.selectedRoute,
    routeRole: context.base.prior.projection.routeRole,
    outcomeIntentRefHash: context.base.prior.projection.outcomeIntentRefHash,
    acceptanceSpecRefHash:
      context.base.prior.projection.acceptanceSpecRefHash,
    maximumLossConstraintRefHash:
      context.base.prior.projection.maximumLossConstraintRefHash,
    recoveryOptionRefHash:
      context.base.prior.projection.recoveryOptionRefHash,
    exactSpecEvaluation: context.base.prior.evaluation,
    destinationRefHash: context.base.prior.projection.destinationRefHash,
    contactRefHash: context.base.prior.projection.contactRefHash,
    budget: context.base.prior.projection.budget,
    completionDeadline: context.base.prior.projection.completionDeadline,
    sourceOccurrenceHash,
    sourceBytesHash: secondBody.hash,
    sourceBytesLength: second.bodyBytes.length,
    quote,
    allInTotalMinor: quote.allInTotalMinor,
    allInTotalProven: quote.allInTotalProven,
    allInEvidenceStatus: allInStatus,
    budgetSatisfied,
    structuredEtaObserved: quote.structuredEtaObserved,
    deliveryDeadlineProven: quote.deliveryDeadlineProven,
    etaEvidenceStatus: quote.structuredEtaObserved
      ? "STRUCTURED" : "UNAVAILABLE",
    runState: "DESTINATION_RATE_COMPONENTS_OBSERVED_NO_CAPACITY_HOLD",
    nextGate: quote.allInTotalProven && quote.deliveryDeadlineProven
      ? "RESOURCE_OWNER_CAPACITY_AND_SEPARATE_PAYMENT_ORDER_AUTHORIZATION"
      : "OBTAIN_COMPLETE_TOTAL_AND_STRUCTURED_ETA",
    counters,
    sourceCookieBytesHash: context.cookie.bytesHash,
    initialCopiedCookieBytesHash: copiedCookie.hash,
    sourceCapturedBeforeParse: true,
    predecessorTreesMutated: false,
    contactEffectReplayed: false,
    addressEffectReplayed: false,
    shippingMethodApplied: false,
    paymentAuthorized: false,
    paymentPerformed: false,
    orderAuthorized: false,
    orderSubmitted: false,
    marketingSubscriptionPerformed: false,
    rawPrivateInputParsed: false,
    rawPrivateInputProjected: false,
    rawResponseProjected: false,
    capacityReserved: false,
    independentOutcomeTruthEstablished: false,
    userResultCommitted: false,
    authority: "NONE",
    decisionState: "HOLD",
  };
  const projection = Object.freeze({ ...publicBody,
    projectionHash: digest(PUBLIC_SCHEMA, publicBody) });
  const publicArtifact = writeOnce(path.join(runDirectory,
    "public-projection.v8.json"), projection);
  const routeEvidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: projection.projectionHash,
    occurrenceRefHash: sourceOccurrenceHash,
    recoveryOptionRefHash: projection.recoveryOptionRefHash,
    observedAt,
    validUntil: grant.expiresAt,
    sourceReplayReceiptHash: capture.captureHash,
    facts: {
      specification: {
        sourceOccurrenceRefHash:
          context.base.prior.evaluation.sourceOccurrenceHash,
        frozenPredicateHash: projection.acceptanceSpecRefHash,
        evaluationRefHash: context.base.prior.evaluation.evaluationHash,
        status: "MATCH",
      },
      allInPrice: {
        sourceOccurrenceRefHash: sourceOccurrenceHash,
        constraintRefHash: projection.maximumLossConstraintRefHash,
        currency: projection.budget.currency,
        allInMinorUnits: quote.allInTotalMinor,
        includesItemTaxShippingAndFees: quote.allInTotalProven,
        status: allInStatus,
      },
      eta: {
        sourceOccurrenceRefHash: sourceOccurrenceHash,
        completionDeadline: projection.completionDeadline,
        estimatedCompletionAt: quote.sourceDeliveryDate === null ? null
          : `${quote.sourceDeliveryDate}T23:59:59.999Z`,
        status: quote.structuredEtaObserved ? "STRUCTURED" : "UNAVAILABLE",
      },
      capacity: {
        sourceOccurrenceRefHash: sourceOccurrenceHash,
        capacityLifecycleRefHash: null,
        capacityLifecycleHeadHash: null,
        reservedFrom: null,
        reservedUntil: null,
        status: "UNRESERVED",
        sourceClass: "SELLER_SERVER_ACK_ONLY",
      },
    },
  });
  const routeEvidenceArtifact = writeOnce(path.join(runDirectory,
    "route-evidence.v1.json"), routeEvidence);
  const artifacts = inventory(runDirectory);
  const manifestBody = {
    schema: MANIFEST_SCHEMA,
    schemaVersion: "8.0.0",
    observedAt,
    priorV7AttemptTreeHash: context.partialV7TreeHash,
    priorV7GrantBytesHash: context.grantRecord.bytesHash,
    priorV7UseBytesHash: context.useRecord.bytesHash,
    readOnlyGrantBytesHash: grantRecord.bytesHash,
    readOnlyGrantUseBytesHash: useArtifact.hash,
    sourceCookieBytesHash: context.cookie.bytesHash,
    sourceCaptureHash: capture.captureHash,
    sourceOccurrenceHash,
    rawStep3ResponseBytesHash: secondBody.hash,
    projectionHash: projection.projectionHash,
    routeEvidenceHash: routeEvidence.evidenceHash,
    artifactInventory: artifacts,
    artifactCount: artifacts.length,
    artifactBytes: artifacts.reduce((sum, item) => sum + item.bytes, 0),
    sourceCapturedBeforeParse: true,
    predecessorTreesMutated: false,
    postCount: 0,
    shippingMethodApplyCount: 0,
    paymentCount: 0,
    orderCount: 0,
    allInEvidenceStatus: allInStatus,
    etaEvidenceStatus: quote.structuredEtaObserved
      ? "STRUCTURED" : "UNAVAILABLE",
    capacityReserved: false,
  };
  const privateManifest = Object.freeze({ ...manifestBody,
    manifestHash: digest(MANIFEST_SCHEMA, manifestBody) });
  const privateManifestArtifact = writeOnce(path.join(runDirectory,
    "private-manifest.v8.json"), privateManifest);
  return Object.freeze({ runDirectory, projection, publicArtifact,
    routeEvidence, routeEvidenceArtifact, privateManifest,
    privateManifestArtifact, sourceCapture: capture });
}

function parseCli(argv) {
  const allowed = new Set(["--live-read-only-no-post", "--prior-v5-run",
    "--partial-v6-run", "--input", "--prior-residual-grant",
    "--prior-residual-use", "--prior-v7-grant", "--prior-v7-use",
    "--partial-v7-run", "--read-only-grant", "--private-root", "--nonce"]);
  const result = { confirmed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag)) fail("ARGUMENT_INVALID");
    if (flag === "--live-read-only-no-post") {
      result.confirmed = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail("ARGUMENT_VALUE");
    result[flag.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  for (const key of ["prior_v5_run", "partial_v6_run", "input",
    "prior_residual_grant", "prior_residual_use", "prior_v7_grant",
    "prior_v7_use", "partial_v7_run", "read_only_grant"]) {
    if (result[key] === undefined) fail("REQUIRED_ARGUMENT_MISSING");
  }
  if (!result.confirmed) fail("LIVE_READ_ONLY_CONFIRMATION_REQUIRED");
  return result;
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseCli(process.argv.slice(2));
    const result = await runAdafruitStep3ReceiptReconcileLiveV8({
      priorV5RunDirectory: args.prior_v5_run,
      partialV6RunDirectory: args.partial_v6_run,
      inputFile: args.input,
      priorResidualGrantFile: args.prior_residual_grant,
      priorResidualUseFile: args.prior_residual_use,
      priorV7GrantFile: args.prior_v7_grant,
      priorV7UseFile: args.prior_v7_use,
      partialV7RunDirectory: args.partial_v7_run,
      readOnlyGrantFile: args.read_only_grant,
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
