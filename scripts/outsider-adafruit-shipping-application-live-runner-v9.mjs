#!/usr/bin/env node

/*
 * Adafruit shipping-application and prepayment-summary descendant v9.
 *
 * This runner consumes one frozen successful v8 Step-3 receipt. It locally
 * replays that receipt, selects one rate already bound by v8, persists an
 * effect attempt, and submits exactly one seller-native save_three request.
 * It may then perform one read-only GET of the exact Step-4 summary. No
 * contact/address replay, payment input, payment, order, marketing, or POST
 * retry exists in this family. A POST-side uncertainty is terminal HOLD.
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

const PREFIX = "OUTSIDER_ADAFRUIT_SHIPPING_APPLICATION_LIVE_RUNNER_V9_";
const ORIGIN = "https://www.adafruit.com";
const SUMMARY_URL = `${ORIGIN}/checkout?step=4`;
const PROVIDER = "ADAFRUIT_GUEST_SHOPPER";
const PURPOSE = "APPLY_ONE_V8_OBSERVED_SHIPPING_OPTION_AND_READ_SUMMARY";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_BYTES = 768 * 1024;
const PUBLIC_SCHEMA
  = "outsider/adafruit-shipping-application-public-projection/v9";
const MANIFEST_SCHEMA
  = "outsider/private-adafruit-shipping-application-manifest/v9";
const FAILURE_SCHEMA
  = "outsider/private-adafruit-shipping-application-failure-manifest/v9";
const HEADER_SCHEMA
  = "outsider/private-adafruit-shipping-application-response-headers/v9";
const CAPTURE_SCHEMA
  = "outsider/private-adafruit-shipping-application-source-capture/v9";
const ATTEMPT_SCHEMA
  = "outsider/private-adafruit-shipping-application-attempt/v9";
const OCCURRENCE_SCHEMA
  = "outsider/adafruit-shipping-application-source-occurrence/v9";
const USE_SCHEMA
  = "outsider/private-adafruit-shipping-application-grant-use/v9";
const V8_PUBLIC_SCHEMA
  = "outsider/adafruit-step3-receipt-reconcile-public-projection/v8";
const V8_MANIFEST_SCHEMA
  = "outsider/private-adafruit-step3-receipt-reconcile-manifest/v8";
const V8_CAPTURE_SCHEMA
  = "outsider/private-adafruit-step3-source-capture/v8";
const PERMITTED_ACTIONS = Object.freeze([
  "SUBMIT_EXACT_OBSERVED_SAVE_THREE_ONCE",
  "READ_EXACT_PREPAYMENT_SUMMARY_ONCE",
]);
const FORBIDDEN_ACTIONS = Object.freeze([
  "ADDRESS_RESUBMISSION", "ARBITRARY_CHECKOUT_CONTROL",
  "CONTACT_RESUBMISSION", "CROSS_ORIGIN_DISCLOSURE",
  "MARKETING_SUBSCRIPTION", "ORDER_SUBMISSION", "PAYMENT_INPUT",
  "PAYMENT_SUBMISSION", "PII_PUBLIC_PROJECTION", "POST_RETRY",
]);

export const OUTSIDER_ADAFRUIT_SHIPPING_APPLICATION_GRANT_SCHEMA_V9
  = "outsider/private-adafruit-shipping-application-grant/v9";

export const OUTSIDER_ADAFRUIT_SHIPPING_APPLICATION_V9_BOUNDARY
  = Object.freeze({
    descendsFrom: V8_PUBLIC_SCHEMA,
    predecessorMutated: false,
    selectedRateMustExistInFrozenV8Receipt: true,
    onlyRequests: Object.freeze([
      `POST ${ORIGIN}/checkout action=save_three`,
      `GET ${SUMMARY_URL}`,
    ]),
    maximumRequests: 2,
    maximumPosts: 1,
    maximumGets: 1,
    postRetryAllowed: false,
    requestBodyPersistedBeforePost: true,
    operationAttemptPersistedBeforePost: true,
    responseBytesPersistedBeforeParse: true,
    responseHeadersPersistedBeforeParse: true,
    contactReplayAllowed: false,
    addressReplayAllowed: false,
    paymentInputAllowed: false,
    paymentSubmissionAllowed: false,
    orderAllowed: false,
    marketingAllowed: false,
    shippingSelectionEstablishesCapacity: false,
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

function controls(source) {
  const output = [];
  for (const match of source.matchAll(
    /<(input|select|textarea|button)\b[^>]*>/giu)) {
    const opening = match[0];
    const name = attribute(opening, "name");
    if (name === null || !/^[A-Za-z][A-Za-z0-9_:[\].-]{0,127}$/u.test(name)) {
      continue;
    }
    output.push(Object.freeze({
      tag: match[1].toLowerCase(), name,
      type: (attribute(opening, "type") ?? "").toLowerCase(),
      id: attribute(opening, "id"), value: attribute(opening, "value"),
      checked: /\bchecked(?:\s|=|>)/iu.test(opening),
      required: /\brequired(?:\s|=|>)/iu.test(opening),
      disabled: /\bdisabled(?:\s|=|>)/iu.test(opening),
      opening,
    }));
  }
  return output;
}

function checkoutForms(html) {
  const output = [];
  for (const match of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/giu)) {
    const source = match[0];
    const opening = source.slice(0, source.indexOf(">") + 1);
    let action;
    try { action = new URL(attribute(opening, "action") ?? "", `${ORIGIN}/checkout`); }
    catch { continue; }
    if (action.href !== `${ORIGIN}/checkout`
      || (attribute(opening, "method") ?? "get").toLowerCase() !== "post") {
      continue;
    }
    output.push(Object.freeze({ source, controls: controls(source) }));
  }
  return output;
}

function labelMap(source) {
  const labels = new Map();
  for (const match of source.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/giu)) {
    const opening = match[0].slice(0, match[0].indexOf(">") + 1);
    const target = attribute(opening, "for");
    if (target !== null && !labels.has(target)) {
      labels.set(target, plainText(match[0]));
    }
  }
  return labels;
}

function nestedLabelText(source, opening) {
  for (const match of source.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/giu)) {
    if (match[0].includes(opening)) return plainText(match[0]);
  }
  return null;
}

/** Parse only the frozen seller-native save_three controls. */
export function parseAdafruitShippingApplicationFormV9(html) {
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") < 1
    || /\b(?:g-recaptcha|hcaptcha|cf-turnstile|captcha)\b/iu.test(html)) {
    fail("STEP3_FORM_UNAVAILABLE");
  }
  const candidates = checkoutForms(html).filter((form) =>
    form.controls.some((control) => control.name === "action"
      && control.value === "save_three"));
  if (candidates.length !== 1) fail("SAVE_THREE_FORM_INVALID");
  const form = candidates[0];
  if (form.controls.some((control) => /(?:address|billing|card|city|contact|country|cvc|cvv|email|marketing|name|newsletter|order|payment|phone|postal|postcode|state|street|subscribe|zip)/iu
    .test(control.name))) fail("FORBIDDEN_FORM_CONTROL_OBSERVED");
  const csrf = form.controls.filter((control) => control.name === "csrf_token"
    && typeof control.value === "string"
    && /^[A-Za-z0-9._~-]{16,512}$/u.test(control.value));
  if (csrf.length !== 1) fail("CSRF_TOKEN_INVALID");
  const unknownRequired = form.controls.filter((control) =>
    !["action", "csrf_token", "shipping"].includes(control.name)
      && (control.required || control.checked || control.type === "hidden"));
  if (unknownRequired.length !== 0) fail("UNMAPPED_MUTABLE_CONTROL");
  const labels = labelMap(form.source);
  const rates = [];
  const values = new Set();
  for (const control of form.controls) {
    if (control.name !== "shipping" || control.type !== "radio") continue;
    if (control.disabled || typeof control.value !== "string"
      || control.value.length < 1 || control.value.length > 256
      || values.has(control.value)) fail("SHIPPING_CONTROL_INVALID");
    const description = control.id === null ? nestedLabelText(form.source,
      control.opening) : labels.get(control.id) ?? nestedLabelText(form.source,
      control.opening);
    if (description === null || description === undefined) {
      fail("SHIPPING_LABEL_INVALID");
    }
    const amounts = [...description.matchAll(/\$[0-9]{1,9}\.[0-9]{2}/gu)]
      .map((entry) => moneyMinor(entry[0])).filter((entry) => entry !== null);
    if (amounts.length < 1 || control.id === null) fail("SHIPPING_RATE_INVALID");
    values.add(control.value);
    rates.push(Object.freeze({
      rateRefHash: digest("outsider/adafruit-step3-rate/v8", {
        id: control.id, methodValue: control.value, description,
      }),
      methodValue: control.value,
      amountMinor: amounts.at(-1),
      selectedByProvider: control.checked,
    }));
  }
  if (rates.length < 1) fail("SHIPPING_RATES_UNAVAILABLE");
  return Object.freeze({ csrfToken: csrf[0].value, rates: Object.freeze(rates) });
}

const MONTH = Object.freeze({ jan: "01", feb: "02", mar: "03", apr: "04",
  may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10",
  nov: "11", dec: "12" });

function dateValue(source) {
  const iso = /\b(20\d{2}-\d{2}-\d{2})\b/u.exec(source)?.[1];
  if (iso !== undefined && new Date(`${iso}T00:00:00.000Z`)
    .toISOString().slice(0, 10) === iso) return iso;
  const named = /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2}),?\s+(20\d{2})\b/iu.exec(source);
  if (named === null) return null;
  const candidate = `${named[3]}-${MONTH[named[1].slice(0, 3)
    .toLowerCase()]}-${named[2].padStart(2, "0")}`;
  return new Date(`${candidate}T00:00:00.000Z`).toISOString().slice(0, 10)
    === candidate ? candidate : null;
}

function summaryEta(html) {
  const candidates = [];
  for (const match of html.matchAll(/\bdata-(?:delivery-date|estimated-delivery-date|eta)=(?:"([^"]+)"|'([^']+)')/giu)) {
    candidates.push(match[1] ?? match[2]);
  }
  for (const match of html.matchAll(/"(?:estimatedDeliveryDate|deliveryDate|arrivalDate)"\s*:\s*"([^"]+)"/gu)) {
    candidates.push(match[1]);
  }
  for (const match of plainText(html).matchAll(/(?:deliver(?:y|ed)|arriv(?:al|e|es)|eta)\b.{0,120}?(20\d{2}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+20\d{2})/giu)) {
    candidates.push(match[1]);
  }
  return candidates.map(dateValue).find((value) => value !== null) ?? null;
}

/** Parse only total/ETA facts from the private prepayment summary response. */
export function parseAdafruitPrepaymentSummaryV9(html, completionDeadline,
  expectedShippingMinor) {
  if (typeof html !== "string" || Buffer.byteLength(html, "utf8") < 1
    || /(?:thank\s+you\s+for\s+your\s+order|order\s+confirmation|order\s+number)/iu
      .test(html)) fail("PREPAYMENT_SUMMARY_INVALID");
  const values = { subtotalMinor: null, shippingMinor: null, taxMinor: null,
    displayedFinalTotalMinor: null, feeMinor: [] };
  for (const match of html.matchAll(
    /<div\b[^>]*checkout-sidebar-ot-title[^>]*>([\s\S]*?)<\/div>\s*<div\b[^>]*checkout-sidebar-ot-text[^>]*>([\s\S]*?)<\/div>/giu)) {
    const label = plainText(match[1]).toLowerCase();
    const amount = moneyMinor(plainText(match[2]));
    if (amount === null) continue;
    if (/^subtotal$/u.test(label)) values.subtotalMinor = amount;
    else if (/^shipping$/u.test(label)) values.shippingMinor = amount;
    else if (/^(?:sales\s+)?tax$/u.test(label)) values.taxMinor = amount;
    else if (/^(?:grand\s+)?total$/u.test(label)) {
      values.displayedFinalTotalMinor = amount;
    } else if (/fee/u.test(label)) values.feeMinor.push(amount);
  }
  const componentsComplete = values.subtotalMinor !== null
    && values.shippingMinor !== null && values.taxMinor !== null;
  const componentSumMinor = componentsComplete
    ? values.subtotalMinor + values.shippingMinor + values.taxMinor
      + values.feeMinor.reduce((sum, value) => sum + value, 0)
    : null;
  const componentsMatchDisplayedTotal = componentSumMinor !== null
    && values.displayedFinalTotalMinor !== null
    && componentSumMinor === values.displayedFinalTotalMinor;
  const shippingMatchesObserved = values.shippingMinor === expectedShippingMinor;
  const allInTotalProven = componentsMatchDisplayedTotal
    && shippingMatchesObserved;
  const sourceDeliveryDate = summaryEta(html);
  return Object.freeze({
    subtotalMinor: values.subtotalMinor,
    shippingMinor: values.shippingMinor,
    taxMinor: values.taxMinor,
    feeMinor: Object.freeze([...values.feeMinor]),
    displayedFinalTotalMinor: values.displayedFinalTotalMinor,
    componentSumMinor,
    componentsMatchDisplayedTotal,
    shippingMatchesObserved,
    allInTotalMinor: values.displayedFinalTotalMinor,
    allInTotalProven,
    priceEvidenceState: allInTotalProven ? "COMPLETE"
      : values.displayedFinalTotalMinor === null ? "UNAVAILABLE" : "PARTIAL",
    sourceDeliveryDate,
    structuredEtaObserved: sourceDeliveryDate !== null,
    deliveryDeadlineProven: sourceDeliveryDate !== null
      && sourceDeliveryDate <= completionDeadline.slice(0, 10),
  });
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

/** Validate and content-address the complete frozen v8 receipt tree. */
export function inspectAdafruitStep3ReceiptContextV9(options = {}) {
  const runDirectory = privateDirectory(options.priorV8RunDirectory,
    "PRIOR_V8_RUN");
  if (!/^adafruit-step3-receipt-reconcile-v8-\d{8}-[a-f0-9]{32}$/u
    .test(path.basename(runDirectory))) fail("PRIOR_V8_RUN_NAME_INVALID");
  const artifacts = inventory(runDirectory);
  const names = artifacts.map((entry) => entry.relativePath);
  const cookieNames = names.filter((name) =>
    /^https-state\/[a-f0-9]{64}\.cookies-v1\.json$/u.test(name));
  const required = ["checkout-current-step-headers.v8.json",
    "checkout-current-step-response.v8.bin",
    "checkout-step3-headers.v8.json", "checkout-step3-response.v8.bin",
    "private-manifest.v8.json", "private-source-capture.v8.json",
    "public-projection.v8.json", "route-evidence.v1.json"];
  if (artifacts.length !== 9 || cookieNames.length !== 1
    || required.some((name) => !names.includes(name))) {
    fail("PRIOR_V8_TREE_SHAPE_INVALID");
  }
  const projectionRecord = canonicalFile(path.join(runDirectory,
    "public-projection.v8.json"), "PRIOR_V8_PROJECTION");
  const projectionHash = canonicalHash(projectionRecord.value,
    V8_PUBLIC_SCHEMA, "projectionHash", "PRIOR_V8_PROJECTION");
  const manifestRecord = canonicalFile(path.join(runDirectory,
    "private-manifest.v8.json"), "PRIOR_V8_MANIFEST");
  const manifestHash = canonicalHash(manifestRecord.value,
    V8_MANIFEST_SCHEMA, "manifestHash", "PRIOR_V8_MANIFEST");
  const captureRecord = canonicalFile(path.join(runDirectory,
    "private-source-capture.v8.json"), "PRIOR_V8_CAPTURE");
  const captureHash = canonicalHash(captureRecord.value,
    V8_CAPTURE_SCHEMA, "captureHash", "PRIOR_V8_CAPTURE");
  const routeRecord = canonicalFile(path.join(runDirectory,
    "route-evidence.v1.json"), "PRIOR_V8_ROUTE_EVIDENCE");
  let routeEvidence;
  try { routeEvidence = verifyBuyerNativeRouteEvidenceV1(routeRecord.value); }
  catch { fail("PRIOR_V8_ROUTE_EVIDENCE_INVALID"); }
  const step3 = privateBytesFile(path.join(runDirectory,
    "checkout-step3-response.v8.bin"), "PRIOR_V8_STEP3", 1);
  const current = privateBytesFile(path.join(runDirectory,
    "checkout-current-step-response.v8.bin"), "PRIOR_V8_CURRENT", 0);
  const currentHeaders = canonicalFile(path.join(runDirectory,
    "checkout-current-step-headers.v8.json"), "PRIOR_V8_CURRENT_HEADERS");
  const step3Headers = canonicalFile(path.join(runDirectory,
    "checkout-step3-headers.v8.json"), "PRIOR_V8_STEP3_HEADERS");
  const cookieRecord = cookie(path.join(runDirectory, cookieNames[0]),
    "PRIOR_V8_COOKIE");
  const projection = projectionRecord.value;
  const manifest = manifestRecord.value;
  const capture = captureRecord.value;
  if (projection.schemaVersion !== "8.0.0"
    || projection.sourceBytesHash !== step3.bytesHash
    || projection.sourceBytesLength !== step3.bytes.length
    || projection.sourceOccurrenceHash !== routeEvidence.occurrenceRefHash
    || routeEvidence.routeProposalRefHash !== projectionHash
    || manifest.schemaVersion !== "8.0.0"
    || manifest.projectionHash !== projectionHash
    || manifest.routeEvidenceHash !== routeEvidence.evidenceHash
    || manifest.sourceCaptureHash !== captureHash
    || manifest.rawStep3ResponseBytesHash !== step3.bytesHash
    || projection.shippingMethodApplied !== false
    || projection.paymentPerformed !== false
    || projection.orderSubmitted !== false
    || projection.capacityReserved !== false
    || projection.authority !== "NONE"
    || projection.decisionState !== "HOLD") {
    fail("PRIOR_V8_BINDING_INVALID");
  }
  const exchanges = capture.exchanges;
  if (!Array.isArray(exchanges) || exchanges.length !== 2
    || exchanges[0]?.bodyBytesHash !== current.bytesHash
    || exchanges[1]?.bodyBytesHash !== step3.bytesHash
    || exchanges[1]?.url !== `${ORIGIN}/checkout?step=3`) {
    fail("PRIOR_V8_CAPTURE_BINDING_INVALID");
  }
  const priorInventory = artifacts.filter((entry) =>
    entry.relativePath !== "private-manifest.v8.json");
  if (manifest.artifactCount !== priorInventory.length
    || manifest.artifactBytes !== priorInventory.reduce(
      (sum, entry) => sum + entry.bytes, 0)
    || canonicalizeStrict(manifest.artifactInventory)
      !== canonicalizeStrict(priorInventory)) fail("PRIOR_V8_INVENTORY_INVALID");
  const form = parseAdafruitShippingApplicationFormV9(
    step3.bytes.toString("utf8"));
  if (!Array.isArray(projection.quote?.rates)
    || projection.quote.rates.length !== form.rates.length) {
    fail("PRIOR_V8_RATE_SET_INVALID");
  }
  for (const rate of projection.quote.rates) {
    const local = form.rates.filter((candidate) =>
      candidate.rateRefHash === rate.rateRefHash);
    if (local.length !== 1 || local[0].amountMinor !== rate.amountMinor) {
      fail("PRIOR_V8_RATE_BINDING_INVALID");
    }
  }
  hash(projection.quote.selectedRateRefHash, "PRIOR_V8_SELECTED_RATE");
  if (!form.rates.some((rate) =>
    rate.rateRefHash === projection.quote.selectedRateRefHash)) {
    fail("PRIOR_V8_SELECTED_RATE_UNAVAILABLE");
  }
  const treeHash = digest("outsider/adafruit-step3-receipt-tree/v9", {
    runName: path.basename(runDirectory), artifacts,
  });
  return Object.freeze({ runDirectory, artifacts, treeHash,
    projectionRecord, projection, projectionHash,
    manifestRecord, manifest, manifestHash,
    captureRecord, capture, captureHash,
    routeRecord, routeEvidence, step3, cookie: cookieRecord, form,
    currentHeaders, step3Headers });
}

export function createAdafruitShippingApplicationGrantValueV9(input = {}) {
  exact(input, ["v8RunTreeHash", "v8ProjectionHash", "v8ManifestHash",
    "v8RouteEvidenceHash", "v8SourceCaptureHash", "v8Step3SourceBytesHash",
    "v8CookieBytesHash", "selectedRateRefHash", "selectedShippingMinor",
    "authorizedAt", "expiresAt"], "GRANT_INPUT");
  for (const field of ["v8RunTreeHash", "v8ProjectionHash", "v8ManifestHash",
    "v8RouteEvidenceHash", "v8SourceCaptureHash", "v8Step3SourceBytesHash",
    "v8CookieBytesHash", "selectedRateRefHash"]) hash(input[field],
    field.toUpperCase());
  if (!Number.isSafeInteger(input.selectedShippingMinor)
    || input.selectedShippingMinor < 0) fail("SELECTED_SHIPPING_MINOR_INVALID");
  const authorizedAt = instant(input.authorizedAt, "AUTHORIZED_AT");
  const expiresAt = instant(input.expiresAt, "EXPIRES_AT");
  if (Date.parse(authorizedAt) >= Date.parse(expiresAt)) {
    fail("GRANT_INTERVAL_INVALID");
  }
  return Object.freeze({
    schema: OUTSIDER_ADAFRUIT_SHIPPING_APPLICATION_GRANT_SCHEMA_V9,
    schemaVersion: "9.0.0", supplierOrigin: ORIGIN, purpose: PURPOSE,
    v8RunTreeHash: input.v8RunTreeHash,
    v8ProjectionHash: input.v8ProjectionHash,
    v8ManifestHash: input.v8ManifestHash,
    v8RouteEvidenceHash: input.v8RouteEvidenceHash,
    v8SourceCaptureHash: input.v8SourceCaptureHash,
    v8Step3SourceBytesHash: input.v8Step3SourceBytesHash,
    v8CookieBytesHash: input.v8CookieBytesHash,
    selectedRateRefHash: input.selectedRateRefHash,
    selectedShippingMinor: input.selectedShippingMinor,
    expectedSummaryUrl: SUMMARY_URL,
    permittedActions: [...PERMITTED_ACTIONS],
    forbiddenActions: [...FORBIDDEN_ACTIONS],
    paymentAuthorized: false, orderAuthorized: false,
    authorizedAt, expiresAt, oneUse: true,
  });
}

function validateGrant(record, context) {
  const fields = ["schema", "schemaVersion", "supplierOrigin", "purpose",
    "v8RunTreeHash", "v8ProjectionHash", "v8ManifestHash",
    "v8RouteEvidenceHash", "v8SourceCaptureHash", "v8Step3SourceBytesHash",
    "v8CookieBytesHash", "selectedRateRefHash", "selectedShippingMinor",
    "expectedSummaryUrl", "permittedActions", "forbiddenActions",
    "paymentAuthorized", "orderAuthorized", "authorizedAt", "expiresAt",
    "oneUse"];
  const value = exact(record.value, fields, "GRANT");
  const selected = context.form.rates.filter((rate) =>
    rate.rateRefHash === value.selectedRateRefHash);
  if (value.schema !== OUTSIDER_ADAFRUIT_SHIPPING_APPLICATION_GRANT_SCHEMA_V9
    || value.schemaVersion !== "9.0.0" || value.supplierOrigin !== ORIGIN
    || value.purpose !== PURPOSE || value.oneUse !== true
    || value.paymentAuthorized !== false || value.orderAuthorized !== false
    || value.expectedSummaryUrl !== SUMMARY_URL
    || value.v8RunTreeHash !== context.treeHash
    || value.v8ProjectionHash !== context.projectionHash
    || value.v8ManifestHash !== context.manifestHash
    || value.v8RouteEvidenceHash !== context.routeEvidence.evidenceHash
    || value.v8SourceCaptureHash !== context.captureHash
    || value.v8Step3SourceBytesHash !== context.step3.bytesHash
    || value.v8CookieBytesHash !== context.cookie.bytesHash
    || selected.length !== 1
    || value.selectedShippingMinor !== selected[0].amountMinor) {
    fail("GRANT_BINDING_INVALID");
  }
  exactArray(value.permittedActions, PERMITTED_ACTIONS, "GRANT_ACTIONS");
  exactArray(value.forbiddenActions, FORBIDDEN_ACTIONS, "GRANT_FORBIDDEN");
  instant(value.authorizedAt, "GRANT_AUTHORIZED_AT");
  instant(value.expiresAt, "GRANT_EXPIRES_AT");
  if (Date.parse(value.authorizedAt) < Date.parse(context.projection.observedAt)
    || Date.parse(value.authorizedAt) >= Date.parse(value.expiresAt)
    || Date.parse(value.expiresAt)
      > Date.parse(context.routeEvidence.validUntil)
    || Date.parse(value.expiresAt)
      > Date.parse(context.projection.completionDeadline)) {
    fail("GRANT_INTERVAL_INVALID");
  }
  return Object.freeze({ value, selected: selected[0] });
}

function compileBody(context, selected) {
  const body = Buffer.from(new URLSearchParams([
    ["csrf_token", context.form.csrfToken],
    ["shipping", selected.methodValue],
    ["action", "save_three"],
  ]).toString(), "utf8");
  if (body.length < 1 || body.length > 4096) fail("REQUEST_BODY_INVALID");
  return body;
}

function request(sessionRefHash, step, method, url, bodyBytes = null) {
  return Object.freeze({
    schema: "outsider/source-specific-buyer-native-https-request/v1",
    schemaVersion: "1.0.0", provider: PROVIDER, sessionRefHash,
    operation: method === "POST" ? "HOLD" : "QUOTE", step, method, url,
    headers: method === "POST" ? Object.freeze({ accept: "text/html",
      "content-type": "application/x-www-form-urlencoded" })
      : Object.freeze({ accept: "text/html" }),
    bodyBytes, redirectPolicy: "MANUAL_SAME_ORIGIN_ONLY",
    maximumResponseBytes: MAX_SOURCE_BYTES,
  });
}

function headerValue(headers, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function persistHeaders(runDirectory, name, exchange, observedAt) {
  const body = { schema: HEADER_SCHEMA, schemaVersion: "9.0.0", observedAt,
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
    ? candidate : "UNCLASSIFIED_SHIPPING_APPLICATION_FAILURE";
}

function writeFailure(runDirectory, context, grantRecord, observedAt,
  counters, error, state) {
  const artifacts = inventory(runDirectory);
  const effectState = counters.shippingMethodApplyAttemptCount === 0
    ? "NOT_ATTEMPTED"
    : state.postAcknowledged
      ? "SHIPPING_APPLICATION_ACKNOWLEDGED_SUMMARY_UNAVAILABLE"
      : "AMBIGUOUS_SHIPPING_APPLICATION_NO_RETRY";
  const body = { schema: FAILURE_SCHEMA, schemaVersion: "9.0.0", observedAt,
    failureCode: failureCode(error), effectState,
    priorV8RunTreeHash: context.treeHash,
    grantBytesHash: grantRecord.bytesHash,
    requestBodyPersistedBeforePost: state.requestBodyPersisted,
    operationAttemptPersistedBeforePost: state.attemptPersisted,
    postResponsePersistedBeforeParse: state.postResponsePersisted,
    summaryResponsePersistedBeforeParse: state.summaryResponsePersisted,
    counters: { ...counters }, artifactInventory: artifacts,
    artifactCount: artifacts.length,
    artifactBytes: artifacts.reduce((sum, item) => sum + item.bytes, 0),
    retryAutomaticallyPermitted: false, postRetryPermitted: false,
    contactReplayed: false, addressReplayed: false,
    paymentPerformed: false, orderSubmitted: false,
    capacityReserved: false, authority: "NONE", decisionState: "HOLD" };
  return writeOnce(path.join(runDirectory,
    "bounded-failure-manifest.v9.json"), { ...body,
    failureManifestHash: digest(FAILURE_SCHEMA, body) });
}

export async function runAdafruitShippingApplicationLiveV9(options = {}) {
  const context = inspectAdafruitStep3ReceiptContextV9(options);
  const grantRecord = canonicalFile(options.grantFile, "GRANT", 64 * 1024);
  const grant = validateGrant(grantRecord, context);
  const observedAt = instant(options.observedAt ?? new Date().toISOString(),
    "OBSERVED_AT");
  if (Date.parse(observedAt) < Date.parse(grant.value.authorizedAt)
    || Date.parse(observedAt) >= Date.parse(grant.value.expiresAt)) {
    fail("GRANT_NOT_ACTIVE");
  }
  const nonce = options.nonce ?? randomBytes(16).toString("hex");
  if (!/^[a-f0-9]{32}$/u.test(nonce)) fail("NONCE_INVALID");
  const privateRoot = path.resolve(options.privateRoot ?? path.join(
    process.cwd(), ".outsider", "private"));
  ensureDirectory(privateRoot);
  const useDirectory = path.join(privateRoot,
    "adafruit-shipping-application-grant-use-v9");
  ensureDirectory(useDirectory);
  const useBody = { schema: USE_SCHEMA, schemaVersion: "9.0.0",
    grantBytesHash: grantRecord.bytesHash, priorV8RunTreeHash: context.treeHash,
    observedAt,
    nonceHash: digest("outsider/private-shipping-application-nonce/v9", nonce) };
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
    `adafruit-shipping-application-v9-${observedAt.slice(0, 10)
      .replaceAll("-", "")}-${nonce}`);
  if (existsSync(runDirectory)) fail("RUN_DIRECTORY_EXISTS");
  ensureDirectory(runDirectory);
  const stateDirectory = path.join(runDirectory, "https-state");
  ensureDirectory(stateDirectory);
  const copiedCookie = writeBytesOnce(path.join(stateDirectory,
    path.basename(context.cookie.absolute)), context.cookie.bytes);
  const body = compileBody(context, grant.selected);
  const requestBody = writeBytesOnce(path.join(runDirectory,
    "shipping-apply-request-body.v9.bin"), body);
  const idempotencyKeyHash = digest(
    "outsider/adafruit-shipping-application-idempotency/v9", {
      priorV8RunTreeHash: context.treeHash,
      grantBytesHash: grantRecord.bytesHash,
      selectedRateRefHash: grant.value.selectedRateRefHash,
    });
  const attemptBody = { schema: ATTEMPT_SCHEMA, schemaVersion: "9.0.0",
    observedAt, priorV8RunTreeHash: context.treeHash,
    grantBytesHash: grantRecord.bytesHash,
    grantUseBytesHash: useArtifact.hash,
    selectedRateRefHash: grant.value.selectedRateRefHash,
    selectedShippingMinor: grant.value.selectedShippingMinor,
    requestBodyBytesHash: requestBody.hash, idempotencyKeyHash,
    operation: "SUBMIT_EXACT_OBSERVED_SAVE_THREE_ONCE",
    retryAutomaticallyPermitted: false };
  const attempt = Object.freeze({ ...attemptBody,
    attemptHash: digest(ATTEMPT_SCHEMA, attemptBody) });
  writeOnce(path.join(runDirectory,
    "shipping-application-attempt.v9.json"), attempt);
  const state = { requestBodyPersisted: true, attemptPersisted: true,
    postResponsePersisted: false, summaryResponsePersisted: false,
    postAcknowledged: false };
  const counters = { liveHttpRequestCount: 0, getRequestCount: 0,
    postRequestCount: 0, boundedCheckoutRedirectCount: 0,
    contactPostAttemptCount: 0, addressPostAttemptCount: 0,
    shippingMethodApplyAttemptCount: 0, paymentInputCount: 0,
    paymentSubmissionCount: 0, orderSubmissionCount: 0,
    marketingSubscriptionAttemptCount: 0, modelCallCount: 0,
    interactiveBrowserActionCount: 0, employeeTouchCount: 0 };
  const rawFetch = options.fetchImpl ?? globalThis.fetch;
  if (typeof rawFetch !== "function") fail("FETCH_IMPL_INVALID");
  let allowSummaryGet = false;
  const guardedFetch = async (url, init) => {
    const target = new URL(String(url));
    if (target.origin !== ORIGIN || target.hash !== "") fail("OUTBOUND_FORBIDDEN");
    if (init?.method === "POST") {
      if (counters.liveHttpRequestCount !== 0 || target.href !== `${ORIGIN}/checkout`
        || !Buffer.isBuffer(init.body) || bytesHash(init.body) !== requestBody.hash
        || init.headers?.["content-type"]
          !== "application/x-www-form-urlencoded") fail("POST_FORBIDDEN");
      const values = new URLSearchParams(init.body.toString("utf8"));
      if ([...values.keys()].sort().join(",") !== "action,csrf_token,shipping"
        || values.get("action") !== "save_three"
        || values.get("csrf_token") !== context.form.csrfToken
        || values.get("shipping") !== grant.selected.methodValue) {
        fail("POST_BODY_BINDING_INVALID");
      }
      counters.liveHttpRequestCount += 1;
      counters.postRequestCount += 1;
      counters.shippingMethodApplyAttemptCount += 1;
      return rawFetch(url, init);
    }
    if (init?.method !== "GET" || init.body !== undefined || !allowSummaryGet
      || counters.liveHttpRequestCount !== 1 || target.href !== SUMMARY_URL) {
      fail("GET_FORBIDDEN");
    }
    counters.liveHttpRequestCount += 1;
    counters.getRequestCount += 1;
    return rawFetch(url, init);
  };
  const transport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: stateDirectory,
    orderRefHash: context.cookie.value.orderRefHash,
    allowedOrigins: [ORIGIN], timeoutMs: options.timeoutMs ?? 20_000,
    maximumResponseBytes: MAX_SOURCE_BYTES,
  }, { fetchImpl: guardedFetch, clock: () => Date.parse(observedAt) });
  const sessionRefHash = digest("outsider/adafruit-shipping-session/v9", {
    priorV8RunTreeHash: context.treeHash,
    grantBytesHash: grantRecord.bytesHash,
  });
  let submitted;
  let summary;
  let submittedBody;
  let summaryBody;
  let submittedHeaders;
  let summaryHeaders;
  let capture;
  try {
    submitted = await transport(request(sessionRefHash,
      "CHECKOUT_SAVE_THREE_POST", "POST", `${ORIGIN}/checkout`, body));
    submittedBody = writeBytesOnce(path.join(runDirectory,
      "shipping-apply-response.v9.bin"), submitted.bodyBytes);
    submittedHeaders = persistHeaders(runDirectory,
      "shipping-apply-response-headers.v9.json", submitted, observedAt);
    state.postResponsePersisted = true;
    const locationValue = headerValue(submitted.headers, "location");
    let location;
    try { location = new URL(locationValue, `${ORIGIN}/checkout`); }
    catch { fail("SAVE_THREE_REDIRECT_INVALID"); }
    if (![302, 303].includes(submitted.status) || location.href !== SUMMARY_URL) {
      fail("SAVE_THREE_REDIRECT_INVALID");
    }
    state.postAcknowledged = true;
    counters.boundedCheckoutRedirectCount += 1;
    allowSummaryGet = true;
    summary = await transport(request(sessionRefHash,
      "PREPAYMENT_SUMMARY_GET", "GET", SUMMARY_URL));
    summaryBody = writeBytesOnce(path.join(runDirectory,
      "prepayment-summary-response.v9.bin"), summary.bodyBytes);
    summaryHeaders = persistHeaders(runDirectory,
      "prepayment-summary-response-headers.v9.json", summary, observedAt);
    state.summaryResponsePersisted = true;
    const captureBody = { schema: CAPTURE_SCHEMA, schemaVersion: "9.0.0",
      observedAt, priorV8RunTreeHash: context.treeHash,
      applicationAttemptHash: attempt.attemptHash,
      exchanges: [
        { method: "POST", url: `${ORIGIN}/checkout`, status: submitted.status,
          finalUrl: submitted.finalUrl, requestBodyBytesHash: requestBody.hash,
          responseBodyBytes: submitted.bodyBytes.length,
          responseBodyBytesHash: submittedBody.hash,
          headersRecordHash: submittedHeaders.value.headersRecordHash },
        { method: "GET", url: SUMMARY_URL, status: summary.status,
          finalUrl: summary.finalUrl, requestBodyBytesHash: null,
          responseBodyBytes: summary.bodyBytes.length,
          responseBodyBytesHash: summaryBody.hash,
          headersRecordHash: summaryHeaders.value.headersRecordHash },
      ], rawSourceProjected: false, requestBodyProjected: false };
    capture = Object.freeze({ ...captureBody,
      captureHash: digest(CAPTURE_SCHEMA, captureBody) });
    writeOnce(path.join(runDirectory,
      "private-source-capture.v9.json"), capture);
  } catch (error) {
    writeFailure(runDirectory, context, grantRecord, observedAt, counters,
      error, state);
    throw error;
  }
  let parsed;
  try {
    const type = headerValue(summary.headers, "content-type");
    if (summary.status !== 200 || summary.finalUrl !== SUMMARY_URL
      || typeof type !== "string"
      || !/^text\/html(?:\s*;|\s*$)/iu.test(type)) {
      fail("PREPAYMENT_SUMMARY_RESPONSE_INVALID");
    }
    parsed = parseAdafruitPrepaymentSummaryV9(
      summary.bodyBytes.toString("utf8"), context.projection.completionDeadline,
      grant.value.selectedShippingMinor);
  } catch (error) {
    writeFailure(runDirectory, context, grantRecord, observedAt, counters,
      error, state);
    throw error;
  }
  const occurrenceBody = { schema: OCCURRENCE_SCHEMA,
    schemaVersion: "9.0.0", observedAt,
    priorV8RunTreeHash: context.treeHash,
    applicationAttemptHash: attempt.attemptHash,
    sourceCaptureHash: capture.captureHash,
    selectedRateRefHash: grant.value.selectedRateRefHash,
    selectedShippingMinor: grant.value.selectedShippingMinor,
    summary: parsed, shippingSelectionServerAcknowledged: true,
    shippingMethodApplied: true, paymentPerformed: false,
    orderSubmitted: false, capacityReserved: false };
  const sourceOccurrenceHash = digest(OCCURRENCE_SCHEMA, occurrenceBody);
  const allInStatus = parsed.allInTotalProven ? "COMPLETE"
    : parsed.allInTotalMinor === null ? "UNAVAILABLE" : "PARTIAL";
  const budgetSatisfied = parsed.allInTotalProven
    ? BigInt(parsed.allInTotalMinor)
      <= BigInt(context.projection.budget.maximumAmountMinor) : null;
  const publicBody = { schema: PUBLIC_SCHEMA, schemaVersion: "9.0.0",
    predecessor: { v8ProjectionHash: context.projectionHash,
      v8ManifestHash: context.manifestHash,
      v8RouteEvidenceHash: context.routeEvidence.evidenceHash,
      v8SourceCaptureHash: context.captureHash,
      v8RunTreeHash: context.treeHash, priorEffectReplayed: false },
    observedAt, outcomeIntentRefHash: context.projection.outcomeIntentRefHash,
    acceptanceSpecRefHash: context.projection.acceptanceSpecRefHash,
    maximumLossConstraintRefHash:
      context.projection.maximumLossConstraintRefHash,
    recoveryOptionRefHash: context.projection.recoveryOptionRefHash,
    routeRole: context.projection.routeRole,
    budget: context.projection.budget,
    completionDeadline: context.projection.completionDeadline,
    selectedRateRefHash: grant.value.selectedRateRefHash,
    selectedShippingMinor: grant.value.selectedShippingMinor,
    sourceOccurrenceHash, prepaymentSummary: parsed,
    allInTotalMinor: parsed.allInTotalMinor,
    allInTotalProven: parsed.allInTotalProven,
    allInEvidenceStatus: allInStatus, budgetSatisfied,
    structuredEtaObserved: parsed.structuredEtaObserved,
    deliveryDeadlineProven: parsed.deliveryDeadlineProven,
    etaEvidenceStatus: parsed.structuredEtaObserved
      ? "STRUCTURED" : "UNAVAILABLE",
    runState: "SHIPPING_SELECTION_APPLIED_PREPAYMENT_SUMMARY_OBSERVED_HOLD",
    nextGate: parsed.allInTotalProven && parsed.deliveryDeadlineProven
      ? "RESOURCE_OWNER_CAPACITY_AND_SEPARATE_PAYMENT_ORDER_AUTHORIZATION"
      : "OBTAIN_COMPLETE_TOTAL_AND_STRUCTURED_ETA",
    counters, predecessorTreesMutated: false,
    contactEffectReplayed: false, addressEffectReplayed: false,
    shippingMethodApplyAttempted: true, shippingMethodApplied: true,
    shippingApplicationSourceClass: "SELLER_SERVER_ACK_ONLY",
    paymentInputSubmitted: false, paymentAuthorized: false,
    paymentPerformed: false, orderAuthorized: false, orderSubmitted: false,
    marketingSubscriptionPerformed: false, rawRequestBodyProjected: false,
    rawResponseProjected: false, capacityReserved: false,
    independentOutcomeTruthEstablished: false, userResultCommitted: false,
    authority: "NONE", decisionState: "HOLD" };
  const projection = Object.freeze({ ...publicBody,
    projectionHash: digest(PUBLIC_SCHEMA, publicBody) });
  const publicArtifact = writeOnce(path.join(runDirectory,
    "public-projection.v9.json"), projection);
  const priorFacts = context.routeEvidence.facts;
  const routeEvidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: projection.projectionHash,
    occurrenceRefHash: sourceOccurrenceHash,
    recoveryOptionRefHash: projection.recoveryOptionRefHash,
    observedAt, validUntil: grant.value.expiresAt,
    sourceReplayReceiptHash: capture.captureHash,
    facts: {
      specification: { ...priorFacts.specification },
      allInPrice: { sourceOccurrenceRefHash: sourceOccurrenceHash,
        constraintRefHash: projection.maximumLossConstraintRefHash,
        currency: projection.budget.currency,
        allInMinorUnits: parsed.allInTotalMinor,
        includesItemTaxShippingAndFees: parsed.allInTotalProven,
        status: allInStatus },
      eta: { sourceOccurrenceRefHash: sourceOccurrenceHash,
        completionDeadline: projection.completionDeadline,
        estimatedCompletionAt: parsed.sourceDeliveryDate === null ? null
          : `${parsed.sourceDeliveryDate}T23:59:59.999Z`,
        status: parsed.structuredEtaObserved ? "STRUCTURED" : "UNAVAILABLE" },
      capacity: { sourceOccurrenceRefHash: sourceOccurrenceHash,
        capacityLifecycleRefHash: null, capacityLifecycleHeadHash: null,
        reservedFrom: null, reservedUntil: null, status: "UNRESERVED",
        sourceClass: "SELLER_SERVER_ACK_ONLY" },
    },
  });
  const routeEvidenceArtifact = writeOnce(path.join(runDirectory,
    "route-evidence.v1.json"), routeEvidence);
  const finalCookie = privateBytesFile(path.join(stateDirectory,
    path.basename(context.cookie.absolute)), "FINAL_COOKIE", 1, 256 * 1024);
  const artifacts = inventory(runDirectory);
  const manifestBody = { schema: MANIFEST_SCHEMA, schemaVersion: "9.0.0",
    observedAt, priorV8RunTreeHash: context.treeHash,
    priorV8ProjectionHash: context.projectionHash,
    priorV8ManifestHash: context.manifestHash,
    priorV8RouteEvidenceHash: context.routeEvidence.evidenceHash,
    shippingGrantBytesHash: grantRecord.bytesHash,
    shippingGrantUseBytesHash: useArtifact.hash,
    sourceCookieBytesHash: context.cookie.bytesHash,
    copiedCookieBytesHash: copiedCookie.hash,
    finalCookieBytesHash: finalCookie.bytesHash,
    applicationAttemptHash: attempt.attemptHash,
    requestBodyBytesHash: requestBody.hash,
    sourceCaptureHash: capture.captureHash, sourceOccurrenceHash,
    projectionHash: projection.projectionHash,
    routeEvidenceHash: routeEvidence.evidenceHash,
    artifactInventory: artifacts, artifactCount: artifacts.length,
    artifactBytes: artifacts.reduce((sum, item) => sum + item.bytes, 0),
    responseBytesPersistedBeforeParse: true,
    predecessorTreesMutated: false, postCount: 1, getCount: 1,
    contactPostCount: 0, addressPostCount: 0,
    shippingMethodApplyCount: 1, paymentInputCount: 0,
    paymentSubmissionCount: 0, orderCount: 0, marketingCount: 0,
    postRetryPermitted: false, allInEvidenceStatus: allInStatus,
    etaEvidenceStatus: parsed.structuredEtaObserved
      ? "STRUCTURED" : "UNAVAILABLE",
    capacityReserved: false, authority: "NONE", decisionState: "HOLD" };
  const privateManifest = Object.freeze({ ...manifestBody,
    manifestHash: digest(MANIFEST_SCHEMA, manifestBody) });
  const privateManifestArtifact = writeOnce(path.join(runDirectory,
    "private-manifest.v9.json"), privateManifest);
  return Object.freeze({ runDirectory, projection, publicArtifact,
    routeEvidence, routeEvidenceArtifact, privateManifest,
    privateManifestArtifact, sourceCapture: capture });
}

function parseCli(argv) {
  const allowed = new Set([
    "--live-apply-one-shipping-no-payment-no-order", "--prior-v8-run",
    "--grant", "--private-root", "--nonce",
  ]);
  const result = { confirmed: false };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!allowed.has(flag)) fail("ARGUMENT_INVALID");
    if (flag === "--live-apply-one-shipping-no-payment-no-order") {
      result.confirmed = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) fail("ARGUMENT_VALUE");
    result[flag.slice(2).replaceAll("-", "_")] = value;
    index += 1;
  }
  for (const key of ["prior_v8_run", "grant"]) {
    if (result[key] === undefined) fail("REQUIRED_ARGUMENT_MISSING");
  }
  if (!result.confirmed) fail("LIVE_EFFECT_CONFIRMATION_REQUIRED");
  return result;
}

if (process.argv[1] !== undefined
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = parseCli(process.argv.slice(2));
    const result = await runAdafruitShippingApplicationLiveV9({
      priorV8RunDirectory: args.prior_v8_run,
      grantFile: args.grant,
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
