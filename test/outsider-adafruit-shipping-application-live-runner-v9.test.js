import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  createBuyerNativeRouteEvidenceV1,
  verifyBuyerNativeRouteEvidenceV1,
} from "../src/outsider-buyer-native-route-evidence-v1.js";
import {
  OUTSIDER_ADAFRUIT_SHIPPING_APPLICATION_V9_BOUNDARY,
  parseAdafruitPrepaymentSummaryV9,
  parseAdafruitShippingApplicationFormV9,
  runAdafruitShippingApplicationLiveV9,
} from "../scripts/outsider-adafruit-shipping-application-live-runner-v9.mjs";
import { reissueAdafruitShippingApplicationGrantV9 }
  from "../scripts/outsider-adafruit-shipping-application-grant-reissue-v9.mjs";

const NOW = "2026-09-05T00:20:00.000Z";
const DEADLINE = "2026-09-10T23:59:59.999Z";
const VALID_UNTIL = "2026-09-10T20:00:00.000Z";
const CSRF = "0123456789abcdef0123456789abcdef0123456789abcdef";
const COOKIE_SECRET = "fixture-private-session";
const PRIVATE_PII = "41 Private Fixture Street";

const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const h = label => sha(Buffer.from(label, "utf8"));
const digest = (domain, value) => sha(Buffer.from(
  `${domain}\0${canonicalizeStrict(value)}`, "utf8"));

function root(t) {
  const value = mkdtempSync(path.join(tmpdir(), "outsider-adafruit-v9-"));
  chmodSync(value, 0o700);
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function directory(value) {
  mkdirSync(value, { recursive: true, mode: 0o700 });
  chmodSync(value, 0o700);
}

function bytes(file, value) {
  writeFileSync(file, value, { mode: 0o600 });
  chmodSync(file, 0o600);
  const result = Buffer.from(value);
  return { relativePath: null, bytes: result.length, bytesHash: sha(result) };
}

function json(file, value) {
  return bytes(file, Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"));
}

function inventory(base, relative = "") {
  const output = [];
  const current = path.join(base, relative);
  for (const name of readdirSync(current).sort()) {
    const nextRelative = relative === "" ? name : path.join(relative, name);
    const file = path.join(base, nextRelative);
    const info = lstatSync(file);
    if (info.isDirectory()) output.push(...inventory(base, nextRelative));
    else {
      const source = readFileSync(file);
      output.push({ relativePath: nextRelative.split(path.sep).join("/"),
        bytes: source.length, bytesHash: sha(source) });
    }
  }
  return output;
}

function assertPrivateTree(base) {
  const visit = (current) => {
    const info = lstatSync(current);
    assert.equal(info.isDirectory(), true);
    assert.equal(info.isSymbolicLink(), false);
    assert.equal(info.mode & 0o777, 0o700);
    for (const name of readdirSync(current)) {
      const child = path.join(current, name);
      const childInfo = lstatSync(child);
      if (childInfo.isDirectory()) visit(child);
      else {
        assert.equal(childInfo.isFile(), true);
        assert.equal(childInfo.isSymbolicLink(), false);
        assert.equal(childInfo.mode & 0o777, 0o600);
      }
    }
  };
  visit(base);
}

function step3Html() {
  const rates = [
    ["ups_ground_saver", "UPS Ground Saver", "8.69", true],
    ["usps_ground_advantage", "USPS Ground Advantage", "5.93", false],
  ];
  return `<!doctype html><form action="/checkout" method="post">
    <input type="hidden" name="csrf_token" value="${CSRF}">
    ${rates.map(([value, label, amount, checked], index) =>
    `<input type="radio" name="shipping" id="shipping_${index}" value="${value}"${checked ? " checked" : ""}>
     <label for="shipping_${index}">${label} $${amount}</label>`).join("\n")}
    <button name="action" value="save_three">Continue</button>
  </form>
  <div class="checkout-sidebar-ot-title">Subtotal</div><div class="checkout-sidebar-ot-text">$4.95</div>
  <div class="checkout-sidebar-ot-title">Sales Tax</div><div class="checkout-sidebar-ot-text">$0.31</div>`;
}

function summaryHtml() {
  return `<!doctype html><main data-estimated-delivery-date="2026-09-09">
    <h1>Payment</h1><span>${PRIVATE_PII}</span>
    <input name="card_number" value="">
    <div class="checkout-sidebar-ot-title">Subtotal</div><div class="checkout-sidebar-ot-text">$4.95</div>
    <div class="checkout-sidebar-ot-title">Shipping</div><div class="checkout-sidebar-ot-text">$8.69</div>
    <div class="checkout-sidebar-ot-title">Sales Tax</div><div class="checkout-sidebar-ot-text">$0.31</div>
    <div class="checkout-sidebar-ot-title">Total</div><div class="checkout-sidebar-ot-text">$13.95</div>
  </main>`;
}

function headerRecord(schema, version, observedAt, status, finalUrl, headers) {
  const body = { schema, schemaVersion: version, observedAt, status, finalUrl,
    headers, publiclyProjected: false };
  return { ...body, headersRecordHash: digest(schema, body) };
}

function frozenV8(t) {
  const base = root(t);
  const nonce = "88888888888888888888888888888888";
  const run = path.join(base,
    `adafruit-step3-receipt-reconcile-v8-20260905-${nonce}`);
  directory(run);
  const state = path.join(run, "https-state");
  directory(state);
  const orderRefHash = h("fixture-order");
  const cookieValue = { schema: "outsider/order-scoped-buyer-native-cookie-jar/v1",
    schemaVersion: "1.0.0", orderRefHash, nextCreationIndex: 1,
    cookies: [{ name: "adafruit_session", value: COOKIE_SECRET,
      domain: "www.adafruit.com", hostOnly: true, path: "/", secure: true,
      httpOnly: true, sameSite: null, expiresAt: null, creationIndex: 0 }] };
  const cookieFile = path.join(state,
    `${orderRefHash.slice(7)}.cookies-v1.json`);
  const cookieArtifact = json(cookieFile, cookieValue);
  const currentBody = Buffer.alloc(0);
  const step3Body = Buffer.from(step3Html(), "utf8");
  const currentArtifact = bytes(path.join(run,
    "checkout-current-step-response.v8.bin"), currentBody);
  const step3Artifact = bytes(path.join(run,
    "checkout-step3-response.v8.bin"), step3Body);
  const currentHeaders = headerRecord(
    "outsider/private-adafruit-step3-response-headers/v8", "8.0.0",
    "2026-09-05T00:00:00.000Z", 302,
    "https://www.adafruit.com/checkout",
    { "content-type": "text/html", location: "checkout?step=3" });
  const step3Headers = headerRecord(
    "outsider/private-adafruit-step3-response-headers/v8", "8.0.0",
    "2026-09-05T00:00:00.000Z", 200,
    "https://www.adafruit.com/checkout?step=3",
    { "content-type": "text/html" });
  json(path.join(run, "checkout-current-step-headers.v8.json"),
    currentHeaders);
  json(path.join(run, "checkout-step3-headers.v8.json"), step3Headers);
  const captureBody = {
    schema: "outsider/private-adafruit-step3-source-capture/v8",
    schemaVersion: "8.0.0", observedAt: "2026-09-05T00:00:00.000Z",
    priorV7AttemptTreeHash: h("v7-tree"),
    exchanges: [
      { method: "GET", url: "https://www.adafruit.com/checkout", status: 302,
        finalUrl: "https://www.adafruit.com/checkout",
        bodyBytes: currentBody.length, bodyBytesHash: currentArtifact.bytesHash,
        headersRecordHash: currentHeaders.headersRecordHash },
      { method: "GET", url: "https://www.adafruit.com/checkout?step=3",
        status: 200, finalUrl: "https://www.adafruit.com/checkout?step=3",
        bodyBytes: step3Body.length, bodyBytesHash: step3Artifact.bytesHash,
        headersRecordHash: step3Headers.headersRecordHash },
    ], requestBodyPresent: false, rawSourceProjected: false,
  };
  const capture = { ...captureBody,
    captureHash: digest(captureBody.schema, captureBody) };
  json(path.join(run, "private-source-capture.v8.json"), capture);
  const parsed = parseAdafruitShippingApplicationFormV9(step3Html());
  const selected = parsed.rates.find((rate) => rate.selectedByProvider);
  const sourceOccurrenceHash = h("v8-source-occurrence");
  const publicBody = {
    schema: "outsider/adafruit-step3-receipt-reconcile-public-projection/v8",
    schemaVersion: "8.0.0", observedAt: "2026-09-05T00:00:00.000Z",
    outcomeIntentRefHash: h("outcome"),
    acceptanceSpecRefHash: h("acceptance"),
    maximumLossConstraintRefHash: h("loss"),
    recoveryOptionRefHash: h("recovery"), routeRole: "RECOVERY",
    budget: { currency: "USD", maximumAmountMinor: "2000" },
    completionDeadline: DEADLINE, sourceOccurrenceHash,
    sourceBytesHash: step3Artifact.bytesHash,
    sourceBytesLength: step3Body.length,
    quote: { rates: parsed.rates.map(({ rateRefHash, amountMinor,
      selectedByProvider }) => ({ rateRefHash, amountMinor,
      selectedByProvider, sourceDeliveryDate: null })),
    selectedRateRefHash: selected.rateRefHash,
    selectedShippingMinor: selected.amountMinor },
    shippingMethodApplied: false, paymentPerformed: false,
    orderSubmitted: false, capacityReserved: false,
    authority: "NONE", decisionState: "HOLD",
  };
  const projection = { ...publicBody,
    projectionHash: digest(publicBody.schema, publicBody) };
  json(path.join(run, "public-projection.v8.json"), projection);
  const routeEvidence = createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: projection.projectionHash,
    occurrenceRefHash: sourceOccurrenceHash,
    recoveryOptionRefHash: projection.recoveryOptionRefHash,
    observedAt: projection.observedAt, validUntil: VALID_UNTIL,
    sourceReplayReceiptHash: capture.captureHash,
    facts: {
      specification: { sourceOccurrenceRefHash: h("spec-source"),
        frozenPredicateHash: projection.acceptanceSpecRefHash,
        evaluationRefHash: h("evaluation"), status: "MATCH" },
      allInPrice: { sourceOccurrenceRefHash: sourceOccurrenceHash,
        constraintRefHash: projection.maximumLossConstraintRefHash,
        currency: "USD", allInMinorUnits: 1395,
        includesItemTaxShippingAndFees: false, status: "PARTIAL" },
      eta: { sourceOccurrenceRefHash: sourceOccurrenceHash,
        completionDeadline: DEADLINE, estimatedCompletionAt: null,
        status: "UNAVAILABLE" },
      capacity: { sourceOccurrenceRefHash: sourceOccurrenceHash,
        capacityLifecycleRefHash: null, capacityLifecycleHeadHash: null,
        reservedFrom: null, reservedUntil: null, status: "UNRESERVED",
        sourceClass: "SELLER_SERVER_ACK_ONLY" },
    },
  });
  json(path.join(run, "route-evidence.v1.json"), routeEvidence);
  const artifacts = inventory(run);
  assert.equal(artifacts.length, 8);
  const manifestBody = {
    schema: "outsider/private-adafruit-step3-receipt-reconcile-manifest/v8",
    schemaVersion: "8.0.0", observedAt: projection.observedAt,
    priorV7AttemptTreeHash: h("v7-tree"),
    priorV7GrantBytesHash: h("v7-grant"),
    priorV7UseBytesHash: h("v7-use"), readOnlyGrantBytesHash: h("v8-grant"),
    readOnlyGrantUseBytesHash: h("v8-use"),
    sourceCookieBytesHash: cookieArtifact.bytesHash,
    sourceCaptureHash: capture.captureHash, sourceOccurrenceHash,
    rawStep3ResponseBytesHash: step3Artifact.bytesHash,
    projectionHash: projection.projectionHash,
    routeEvidenceHash: routeEvidence.evidenceHash,
    artifactInventory: artifacts, artifactCount: artifacts.length,
    artifactBytes: artifacts.reduce((sum, item) => sum + item.bytes, 0),
    sourceCapturedBeforeParse: true, predecessorTreesMutated: false,
    postCount: 0, shippingMethodApplyCount: 0, paymentCount: 0,
    orderCount: 0, allInEvidenceStatus: "PARTIAL",
    etaEvidenceStatus: "UNAVAILABLE", capacityReserved: false,
  };
  const manifest = { ...manifestBody,
    manifestHash: digest(manifestBody.schema, manifestBody) };
  json(path.join(run, "private-manifest.v8.json"), manifest);
  assertPrivateTree(run);
  return { base, run, selected, projection, routeEvidence };
}

function grant(fixture, suffix, authorizedAt = "2026-09-05T00:10:00.000Z",
  expiresAt = "2026-09-05T01:00:00.000Z") {
  return reissueAdafruitShippingApplicationGrantV9({
    priorV8RunDirectory: fixture.run,
    selectedRateRefHash: fixture.selected.rateRefHash,
    outputGrantFile: path.join(fixture.base, `grant-${suffix}.json`),
    authorizedAt, expiresAt,
  });
}

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: {
    "content-type": "text/html; charset=utf-8", ...headers,
  } });
}

test("v9 applies exactly one frozen rate then reads a final total and ETA without payment or order",
  async (t) => {
    const fixture = frozenV8(t);
    const issued = grant(fixture, "success");
    const calls = [];
    const result = await runAdafruitShippingApplicationLiveV9({
      priorV8RunDirectory: fixture.run, grantFile: issued.output.absolute,
      privateRoot: fixture.base, observedAt: NOW,
      nonce: "99999999999999999999999999999999",
      fetchImpl: async (url, init) => {
        const target = new URL(url);
        calls.push({ method: init.method, href: target.href,
          body: init.body === undefined ? null : Buffer.from(init.body) });
        assert.equal(init.headers.cookie,
          `adafruit_session=${COOKIE_SECRET}`);
        if (init.method === "POST") {
          const fields = new URLSearchParams(init.body.toString("utf8"));
          assert.deepEqual([...fields.keys()], ["csrf_token", "shipping",
            "action"]);
          assert.equal(fields.get("shipping"), "ups_ground_saver");
          assert.equal(fields.get("action"), "save_three");
          return response("", 303, { location: "checkout?step=4" });
        }
        assert.equal(target.href, "https://www.adafruit.com/checkout?step=4");
        return response(summaryHtml());
      },
    });
    assert.deepEqual(calls.map((call) => `${call.method} ${call.href}`), [
      "POST https://www.adafruit.com/checkout",
      "GET https://www.adafruit.com/checkout?step=4",
    ]);
    assert.equal(result.projection.allInTotalMinor, 1395);
    assert.equal(result.projection.allInTotalProven, true);
    assert.equal(result.projection.budgetSatisfied, true);
    assert.equal(result.projection.structuredEtaObserved, true);
    assert.equal(result.projection.deliveryDeadlineProven, true);
    assert.equal(result.projection.shippingMethodApplied, true);
    assert.equal(result.projection.counters.postRequestCount, 1);
    assert.equal(result.projection.counters.getRequestCount, 1);
    for (const field of ["paymentInputSubmitted", "paymentPerformed",
      "orderSubmitted", "marketingSubscriptionPerformed", "capacityReserved",
      "independentOutcomeTruthEstablished", "userResultCommitted"]) {
      assert.equal(result.projection[field], false);
    }
    const verified = verifyBuyerNativeRouteEvidenceV1(result.routeEvidence);
    assert.equal(verified.facts.allInPrice.status, "COMPLETE");
    assert.equal(verified.facts.eta.status, "STRUCTURED");
    assert.equal(verified.facts.capacity.status, "UNRESERVED");
    const publicText = readFileSync(result.publicArtifact.file, "utf8")
      + readFileSync(result.routeEvidenceArtifact.file, "utf8");
    for (const privateValue of [CSRF, COOKIE_SECRET, PRIVATE_PII,
      "ups_ground_saver", "card_number"]) {
      assert.equal(publicText.includes(privateValue), false, privateValue);
    }
    assertPrivateTree(result.runDirectory);
    assert.equal(OUTSIDER_ADAFRUIT_SHIPPING_APPLICATION_V9_BOUNDARY
      .postRetryAllowed, false);
  });

test("copied and expired grants reject before any provider I/O", async (t) => {
  const fixture = frozenV8(t);
  const issued = grant(fixture, "one-use");
  await runAdafruitShippingApplicationLiveV9({
    priorV8RunDirectory: fixture.run, grantFile: issued.output.absolute,
    privateRoot: fixture.base, observedAt: NOW,
    nonce: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    fetchImpl: async (url, init) => init.method === "POST"
      ? response("", 303, { location: "checkout?step=4" })
      : response(summaryHtml()),
  });
  const copied = path.join(fixture.base, "copied-grant.json");
  writeFileSync(copied, readFileSync(issued.output.absolute), { mode: 0o600 });
  chmodSync(copied, 0o600);
  let copiedCalls = 0;
  await assert.rejects(() => runAdafruitShippingApplicationLiveV9({
    priorV8RunDirectory: fixture.run, grantFile: copied,
    privateRoot: fixture.base, observedAt: NOW,
    nonce: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    fetchImpl: async () => { copiedCalls += 1; },
  }), /GRANT_ALREADY_USED/u);
  assert.equal(copiedCalls, 0);
  const expired = grant(fixture, "expired", "2026-09-05T00:01:00.000Z",
    "2026-09-05T00:02:00.000Z");
  let expiredCalls = 0;
  await assert.rejects(() => runAdafruitShippingApplicationLiveV9({
    priorV8RunDirectory: fixture.run, grantFile: expired.output.absolute,
    privateRoot: fixture.base, observedAt: "2026-09-05T00:03:00.000Z",
    nonce: "cccccccccccccccccccccccccccccccc",
    fetchImpl: async () => { expiredCalls += 1; },
  }), /GRANT_NOT_ACTIVE/u);
  assert.equal(expiredCalls, 0);
});

test("a POST transport ambiguity is recorded once and is never retried",
  async (t) => {
    const fixture = frozenV8(t);
    const issued = grant(fixture, "ambiguous", "2026-09-05T00:11:00.000Z",
      "2026-09-05T01:01:00.000Z");
    let calls = 0;
    const nonce = "dddddddddddddddddddddddddddddddd";
    await assert.rejects(() => runAdafruitShippingApplicationLiveV9({
      priorV8RunDirectory: fixture.run, grantFile: issued.output.absolute,
      privateRoot: fixture.base, observedAt: "2026-09-05T00:21:00.000Z",
      nonce, fetchImpl: async () => { calls += 1;
        throw new Error("injected socket loss after send"); },
    }), /FETCH_FAILED/u);
    assert.equal(calls, 1);
    const run = path.join(fixture.base,
      `adafruit-shipping-application-v9-20260905-${nonce}`);
    const failure = JSON.parse(readFileSync(path.join(run,
      "bounded-failure-manifest.v9.json"), "utf8"));
    assert.equal(failure.effectState,
      "AMBIGUOUS_SHIPPING_APPLICATION_NO_RETRY");
    assert.equal(failure.counters.shippingMethodApplyAttemptCount, 1);
    assert.equal(failure.counters.postRequestCount, 1);
    assert.equal(failure.counters.getRequestCount, 0);
    assert.equal(failure.postRetryPermitted, false);
    assert.equal(failure.retryAutomaticallyPermitted, false);
    for (const name of ["shipping-apply-request-body.v9.bin",
      "shipping-application-attempt.v9.json",
      "bounded-failure-manifest.v9.json"]) {
      assert.equal(lstatSync(path.join(run, name)).mode & 0o777, 0o600);
    }
  });

test("a bad prepayment page fails only after its raw response is private",
  async (t) => {
    const fixture = frozenV8(t);
    const issued = grant(fixture, "parse", "2026-09-05T00:12:00.000Z",
      "2026-09-05T01:02:00.000Z");
    const nonce = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
    let calls = 0;
    await assert.rejects(() => runAdafruitShippingApplicationLiveV9({
      priorV8RunDirectory: fixture.run, grantFile: issued.output.absolute,
      privateRoot: fixture.base, observedAt: "2026-09-05T00:22:00.000Z",
      nonce, fetchImpl: async (url, init) => {
        calls += 1;
        return init.method === "POST"
          ? response("", 303, { location: "checkout?step=4" })
          : response("<!doctype html><h1>Order confirmation</h1>");
      },
    }), /PREPAYMENT_SUMMARY_INVALID/u);
    assert.equal(calls, 2);
    const run = path.join(fixture.base,
      `adafruit-shipping-application-v9-20260905-${nonce}`);
    const raw = path.join(run, "prepayment-summary-response.v9.bin");
    assert.equal(lstatSync(raw).mode & 0o777, 0o600);
    assert.equal(readFileSync(raw, "utf8").includes("Order confirmation"), true);
    const failure = JSON.parse(readFileSync(path.join(run,
      "bounded-failure-manifest.v9.json"), "utf8"));
    assert.equal(failure.summaryResponsePersistedBeforeParse, true);
    assert.equal(failure.effectState,
      "SHIPPING_APPLICATION_ACKNOWLEDGED_SUMMARY_UNAVAILABLE");
    assert.equal(failure.postRetryPermitted, false);
  });

test("parsers preserve absent total and ETA as unproven", () => {
  const form = parseAdafruitShippingApplicationFormV9(step3Html());
  assert.equal(form.rates.length, 2);
  const summary = parseAdafruitPrepaymentSummaryV9(
    "<main><div>Payment summary unavailable</div></main>", DEADLINE, 869);
  assert.equal(summary.displayedFinalTotalMinor, null);
  assert.equal(summary.allInTotalProven, false);
  assert.equal(summary.priceEvidenceState, "UNAVAILABLE");
  assert.equal(summary.structuredEtaObserved, false);
});
