#!/usr/bin/env node
/* Current, quote-only continuation. Existing history stays in its own runtime. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, lstatSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import { createOrderScopedBuyerNativeHttpsTransportV1 }
  from "../src/outsider-order-scoped-buyer-native-https-transport-v1.js";
import { parseAdafruitShippingApplicationFormV9 }
  from "./outsider-adafruit-shipping-application-live-runner-v9.mjs";
import { parseAdafruitPrepaymentSummaryV10 }
  from "./outsider-adafruit-shipping-reconciliation-live-runner-v10.mjs";

const ORIGIN = "https://www.adafruit.com";
const CHECKOUT = `${ORIGIN}/checkout`;
const STEP3 = `${CHECKOUT}?step=3`;
const STEP4 = `${CHECKOUT}?step=4`;
const sha = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const fail = code => { const error = new Error(`ADAFRUIT_CURRENT_QUOTE_${code}`);
  error.outsiderCode = code; throw error; };
const save = (directory, name, value) => {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(`${canonicalizeStrict(value)}\n`);
  writeFileSync(path.join(directory, name), bytes, { mode: 0o600, flag: "wx" });
  return { file: name, bytes: bytes.length, bytesHash: sha(bytes) };
};
const attribute = (source, name) => new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`, "iu")
  .exec(source)?.slice(1).find(value => value !== undefined);
const visible = value => value.replace(/<[^>]*>/gu, " ").replace(/&nbsp;|&#160;/gu, " ")
  .replace(/\s+-\s+/gu, " ").replace(/\s+/gu, " ").trim();

export function buildAdafruitGroundAdvantageQuote(html) {
  const form = parseAdafruitShippingApplicationFormV9(html);
  const labelIds = [...html.matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/giu)]
    .filter(match => /^USPS Ground Advantage\s*:\s*\$/iu.test(visible(match[0])))
    .map(match => attribute(match[0], "for"));
  const values = [...html.matchAll(/<input\b[^>]*>/giu)]
    .filter(match => attribute(match[0], "name") === "shipping"
      && labelIds.includes(attribute(match[0], "id")))
    .map(match => attribute(match[0], "value"));
  const rates = form.rates.filter(rate => values.includes(rate.methodValue));
  if (rates.length !== 1) fail("REQUESTED_SERVICE_NOT_OFFERED");
  const rate = rates[0];
  const body = Buffer.from(new URLSearchParams({ csrf_token: form.csrfToken,
    shipping: rate.methodValue, action: "save_three" }).toString());
  return { rate, service: "USPS Ground Advantage", body };
}

export async function runAdafruitShippingQuote({ sourceCookieFile, outputDirectory,
  completionDeadline, maximumAmountMinor = 2000, fetchImpl = globalThis.fetch }) {
  const directory = path.resolve(outputDirectory);
  if (existsSync(directory)) {
    if (existsSync(path.join(directory, "result.json"))) {
      return { ...JSON.parse(readFileSync(path.join(directory, "result.json"))), replayed: true };
    }
    fail("EXISTING_ATTEMPT_READ_ONLY_RECONCILIATION_REQUIRED");
  }
  if (!Number.isFinite(Date.parse(completionDeadline))
    || !Number.isSafeInteger(maximumAmountMinor) || maximumAmountMinor < 1) fail("INPUT_INVALID");
  const info = lstatSync(sourceCookieFile);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o777) !== 0o600) fail("COOKIE_FILE_INVALID");
  const cookieBytes = readFileSync(sourceCookieFile);
  const cookie = JSON.parse(cookieBytes);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stateDirectory = path.join(directory, "https-state");
  mkdirSync(stateDirectory, { mode: 0o700 });
  save(stateDirectory, path.basename(sourceCookieFile), cookieBytes);
  const observedAt = new Date().toISOString();
  const sessionRefHash = sha(`${sha(cookieBytes)}\0${observedAt}\0USPS Ground Advantage`);
  const exchanges = [];
  const counts = { getRequests: 0, postRequests: 0, contactPosts: 0, addressPosts: 0,
    paymentSubmissions: 0, orderSubmissions: 0, marketingSubmissions: 0 };
  let allowedMethod = null, allowedUrl = null, allowedBody = null, posted = false;
  const transport = createOrderScopedBuyerNativeHttpsTransportV1({
    privateStateDirectory: stateDirectory, orderRefHash: cookie.orderRefHash,
    allowedOrigins: [ORIGIN], maximumResponseBytes: 1024 * 1024, timeoutMs: 20000,
  }, { fetchImpl: async (url, init) => {
    if (String(url) !== allowedUrl || init.method !== allowedMethod
      || (init.method === "POST" && !Buffer.from(init.body).equals(allowedBody))) fail("OUTBOUND_MISMATCH");
    if (init.method === "POST") { if (posted) fail("POST_ALREADY_ATTEMPTED");
      posted = true; counts.postRequests += 1; }
    else { counts.getRequests += 1; if (counts.getRequests > 4) fail("GET_LIMIT"); }
    return fetchImpl(url, init);
  } });
  async function exchange(method, url, bodyBytes = null) {
    allowedMethod = method; allowedUrl = url; allowedBody = bodyBytes;
    const name = `exchange-${exchanges.length + 1}`;
    if (bodyBytes !== null) save(directory, `${name}-request.bin`, bodyBytes);
    const response = await transport({ schema: "outsider/source-specific-buyer-native-https-request/v1",
      schemaVersion: "1.0.0", provider: "ADAFRUIT_GUEST_SHOPPER", sessionRefHash,
      operation: method === "POST" ? "HOLD" : "QUOTE", step: "CURRENT_SHIPPING_QUOTE",
      method, url, headers: method === "POST" ? { accept: "text/html",
        "content-type": "application/x-www-form-urlencoded" } : { accept: "text/html" },
      bodyBytes, redirectPolicy: "MANUAL_SAME_ORIGIN_ONLY", maximumResponseBytes: 1024 * 1024 });
    const body = save(directory, `${name}-response.bin`, response.bodyBytes);
    const headers = save(directory, `${name}-headers.json`, { status: response.status,
      finalUrl: response.finalUrl, headers: response.headers });
    exchanges.push({ method, url, status: response.status, body, headers });
    return response;
  }
  let selection = null;
  try {
    save(directory, "continuation.json", { observedAt, sourceCookieBytesHash: sha(cookieBytes),
      purpose: "QUOTE_ONLY_SHIPPING_SERVICE_CHANGE", desiredService: "USPS Ground Advantage",
      completionDeadline, maximumAmountMinor, maximumPostRequests: 1 });
    const current = await exchange("GET", STEP3);
    if (current.status !== 200 || current.finalUrl !== STEP3) fail("SESSION_NOT_AT_SHIPPING_STEP");
    selection = buildAdafruitGroundAdvantageQuote(current.bodyBytes.toString("utf8"));
    if (selection.rate.amountMinor > maximumAmountMinor) fail("SHIPPING_ALONE_EXCEEDS_BUDGET");
    save(directory, "shipping-choice-attempt.json", { observedAt: new Date().toISOString(),
      rateRefHash: selection.rate.rateRefHash, shippingMinor: selection.rate.amountMinor,
      requestBodyHash: sha(selection.body), postRetryPermitted: false });
    let response = await exchange("POST", CHECKOUT, selection.body);
    for (let redirects = 0; [302, 303].includes(response.status) && redirects < 3; redirects += 1) {
      const header = response.headers.location;
      const location = Array.isArray(header) ? header[0] : header;
      const target = new URL(location ?? "", response.finalUrl).href;
      if (![CHECKOUT, STEP4].includes(target)) fail("UNEXPECTED_CHECKOUT_REDIRECT");
      response = await exchange("GET", target);
    }
    if (response.status !== 200 || response.finalUrl !== STEP4) fail("SUMMARY_NOT_REACHED");
    const summary = parseAdafruitPrepaymentSummaryV10(response.bodyBytes.toString("utf8"),
      completionDeadline, selection.rate.amountMinor, "USPS Ground Advantage");
    const result = { state: summary.allInTotalProven ? "ALL_IN_QUOTE_OBSERVED" : "QUOTE_PARTIAL",
      observedAt: new Date().toISOString(), service: selection.service,
      shippingMinor: selection.rate.amountMinor, summary,
      budgetSatisfied: summary.allInTotalProven ? summary.allInTotalMinor <= maximumAmountMinor : null,
      counts, exchanges, paymentPerformed: false, orderSubmitted: false,
      capacityReserved: false, userResultCommitted: false, replayed: false };
    save(directory, "result.json", result);
    return result;
  } catch (error) {
    const result = { state: posted ? "AMBIGUOUS_SHIPPING_CHOICE_NO_RETRY" : "QUOTE_CONTINUATION_UNAVAILABLE",
      reason: error.outsiderCode ?? "NATIVE_TRANSPORT_OR_PARSER_FAILURE",
      observedAt: new Date().toISOString(), counts, exchanges,
      postRetryPermitted: false, paymentPerformed: false, orderSubmitted: false,
      capacityReserved: false, userResultCommitted: false, replayed: false };
    save(directory, "result.json", result);
    return result;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [sourceCookieFile, outputDirectory, completionDeadline] = process.argv.slice(2);
  const result = await runAdafruitShippingQuote({ sourceCookieFile, outputDirectory, completionDeadline });
  const { exchanges, ...safe } = result;
  process.stdout.write(`${canonicalizeStrict(safe)}\n`);
}
