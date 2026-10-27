import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
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
  parseAdafruitShippingApplicationFormV9,
  parseAdafruitPrepaymentSummaryV9,
  runAdafruitShippingApplicationLiveV9,
} from "../scripts/outsider-adafruit-shipping-application-live-runner-v9.mjs";
import { reissueAdafruitShippingApplicationGrantV9 }
  from "../scripts/outsider-adafruit-shipping-application-grant-reissue-v9.mjs";
import {
  OUTSIDER_ADAFRUIT_SHIPPING_RECONCILIATION_V10_BOUNDARY,
  inspectAdafruitShippingApplicationAmbiguityV10,
  parseAdafruitPrepaymentSummaryV10,
  replayAdafruitShippingReconciliationCapturedV10,
  runAdafruitShippingReconciliationLiveV10,
} from "../scripts/outsider-adafruit-shipping-reconciliation-live-runner-v10.mjs";
import { reissueAdafruitShippingReconciliationGrantV10 }
  from "../scripts/outsider-adafruit-shipping-reconciliation-grant-reissue-v10.mjs";

const DEADLINE = "2026-09-10T23:59:59.999Z";
const VALID_UNTIL = "2026-09-10T20:00:00.000Z";
const V9_NOW = "2026-09-05T00:20:00.000Z";
const V10_NOW = "2026-09-05T00:40:00.000Z";
const CSRF = "0123456789abcdef0123456789abcdef0123456789abcdef";
const ORIGINAL_COOKIE = "fixture-private-session";
const EVOLVED_COOKIE = "fixture-evolved-private-session";
const PRIVATE_PII = "41 Private Fixture Street";

const sha = bytes => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const h = label => sha(Buffer.from(label, "utf8"));
const digest = (domain, value) => sha(Buffer.from(
  `${domain}\0${canonicalizeStrict(value)}`, "utf8"));

function root(t) {
  const value = mkdtempSync(path.join(tmpdir(), "outsider-adafruit-v10-"));
  chmodSync(value, 0o700);
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function directory(value) {
  mkdirSync(value, { recursive: true, mode: 0o700 });
  chmodSync(value, 0o700);
}

function bytes(file, value) {
  const source = Buffer.from(value);
  writeFileSync(file, source, { mode: 0o600 });
  chmodSync(file, 0o600);
  return { bytes: source.length, bytesHash: sha(source) };
}

function json(file, value) {
  return bytes(file, Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8"));
}

function inventory(base, relative = "") {
  const output = [];
  for (const name of readdirSync(path.join(base, relative)).sort()) {
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
  return `<!doctype html><form action="/checkout" method="post">
    <input type="hidden" name="csrf_token" value="${CSRF}">
    <input type="radio" name="shipping" id="shipping_0" value="ups_ground_saver" checked>
    <label for="shipping_0">UPS Ground Saver $8.69</label>
    <input type="radio" name="shipping" id="shipping_1" value="usps_ground_advantage">
    <label for="shipping_1">USPS Ground Advantage $5.93</label>
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

// Reduced, de-identified structure from the captured 2026-09-05 step-4 page:
// purchase-order help lives in a payment form; the shipping total row uses
// its native service label. No account, address, CSRF, or payment data remain.
function sellerPaymentModuleHtml() {
  return `<!doctype html><main>
    <div class="checkout-payment-module-wrapper checkout-payment-module-wrapper-2">
      <form action="/checkout" method="post" id="form-pmt-2">
        <div class="row top-ten" id="check-image-wrapper">
          <div class="col-lg-12 col-md-12 xol-sm-12 col-xs-12">
            <p>Please include your purchase order number.</p>
          </div>
        </div>
      </form>
    </div>
    <div class="checkout-sidebar-ot">
      <div class="checkout-sidebar-ot-title">Subtotal</div>
      <div class="checkout-sidebar-ot-text">$4.95</div>
      <div class="checkout-sidebar-ot-title">UPS Ground Saver</div>
      <div class="checkout-sidebar-ot-text">$8.69</div>
      <div class="checkout-sidebar-ot-title">Sales Tax</div>
      <div class="checkout-sidebar-ot-text">$0.31</div>
      <div class="checkout-sidebar-ot-title">Total</div>
      <div class="checkout-sidebar-ot-text">$13.95</div>
    </div>
  </main>`;
}

function headerRecord(schema, version, observedAt, status, finalUrl, headers) {
  const body = { schema, schemaVersion: version, observedAt, status, finalUrl,
    headers, publiclyProjected: false };
  return { ...body, headersRecordHash: digest(schema, body) };
}

function frozenV8(t) {
  const base = root(t);
  const run = path.join(base,
    "adafruit-step3-receipt-reconcile-v8-20260905-88888888888888888888888888888888");
  directory(run);
  const state = path.join(run, "https-state");
  directory(state);
  const orderRefHash = h("fixture-order");
  const cookieValue = {
    schema: "outsider/order-scoped-buyer-native-cookie-jar/v1",
    schemaVersion: "1.0.0", orderRefHash, nextCreationIndex: 1,
    cookies: [{ name: "adafruit_session", value: ORIGINAL_COOKIE,
      domain: "www.adafruit.com", hostOnly: true, path: "/", secure: true,
      httpOnly: true, sameSite: null, expiresAt: null, creationIndex: 0 }],
  };
  const cookieFile = path.join(state,
    `${orderRefHash.slice(7)}.cookies-v1.json`);
  const cookieArtifact = json(cookieFile, cookieValue);
  const firstBody = Buffer.alloc(0);
  const step3Body = Buffer.from(step3Html(), "utf8");
  const firstArtifact = bytes(path.join(run,
    "checkout-current-step-response.v8.bin"), firstBody);
  const step3Artifact = bytes(path.join(run,
    "checkout-step3-response.v8.bin"), step3Body);
  const firstHeaders = headerRecord(
    "outsider/private-adafruit-step3-response-headers/v8", "8.0.0",
    "2026-09-05T00:00:00.000Z", 302,
    "https://www.adafruit.com/checkout",
    { "content-type": "text/html", location: "checkout?step=3" });
  const step3Headers = headerRecord(
    "outsider/private-adafruit-step3-response-headers/v8", "8.0.0",
    "2026-09-05T00:00:00.000Z", 200,
    "https://www.adafruit.com/checkout?step=3",
    { "content-type": "text/html" });
  json(path.join(run, "checkout-current-step-headers.v8.json"), firstHeaders);
  json(path.join(run, "checkout-step3-headers.v8.json"), step3Headers);
  const captureBody = {
    schema: "outsider/private-adafruit-step3-source-capture/v8",
    schemaVersion: "8.0.0", observedAt: "2026-09-05T00:00:00.000Z",
    priorV7AttemptTreeHash: h("v7-tree"),
    exchanges: [
      { method: "GET", url: "https://www.adafruit.com/checkout", status: 302,
        finalUrl: "https://www.adafruit.com/checkout",
        bodyBytes: firstBody.length, bodyBytesHash: firstArtifact.bytesHash,
        headersRecordHash: firstHeaders.headersRecordHash },
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
    outcomeIntentRefHash: h("outcome"), acceptanceSpecRefHash: h("acceptance"),
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
  const manifestBody = {
    schema: "outsider/private-adafruit-step3-receipt-reconcile-manifest/v8",
    schemaVersion: "8.0.0", observedAt: projection.observedAt,
    priorV7AttemptTreeHash: h("v7-tree"), priorV7GrantBytesHash: h("v7-grant"),
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
  return { base, run, selected };
}

function response(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: {
    "content-type": "text/html; charset=utf-8", ...headers,
  } });
}

async function frozenAmbiguousV9(t) {
  const v8 = frozenV8(t);
  const issued = reissueAdafruitShippingApplicationGrantV9({
    priorV8RunDirectory: v8.run,
    selectedRateRefHash: v8.selected.rateRefHash,
    outputGrantFile: path.join(v8.base, "v9-grant.json"),
    authorizedAt: "2026-09-05T00:10:00.000Z",
    expiresAt: "2026-09-05T01:00:00.000Z",
  });
  const nonce = "99999999999999999999999999999999";
  await assert.rejects(() => runAdafruitShippingApplicationLiveV9({
    priorV8RunDirectory: v8.run, grantFile: issued.output.absolute,
    privateRoot: v8.base, observedAt: V9_NOW, nonce,
    fetchImpl: async (url, init) => {
      assert.equal(url, "https://www.adafruit.com/checkout");
      assert.equal(init.method, "POST");
      return response("", 302, { location: "/checkout",
        "set-cookie": `adafruit_session=${EVOLVED_COOKIE}; Path=/; Secure; HttpOnly` });
    },
  }), /SAVE_THREE_REDIRECT_INVALID/u);
  const run = path.join(v8.base,
    `adafruit-shipping-application-v9-20260905-${nonce}`);
  const grantHash = sha(readFileSync(issued.output.absolute));
  const use = path.join(v8.base,
    "adafruit-shipping-application-grant-use-v9",
    `${grantHash.slice(7)}.json`);
  assert.equal(inventory(run).length, 6);
  const inspected = inspectAdafruitShippingApplicationAmbiguityV10({
    priorV8RunDirectory: v8.run, priorV9RunDirectory: run,
    priorV9GrantFile: issued.output.absolute, priorV9UseFile: use,
  });
  assert.notEqual(inspected.currentCookie.bytesHash,
    inspected.v8.cookie.bytesHash);
  return { ...v8, v9Run: run, v9Grant: issued.output.absolute,
    v9Use: use, inspected };
}

function v10Grant(fixture, name, authorizedAt = "2026-09-05T00:30:00.000Z",
  expiresAt = "2026-09-05T00:55:00.000Z") {
  return reissueAdafruitShippingReconciliationGrantV10({
    priorV8RunDirectory: fixture.run,
    priorV9RunDirectory: fixture.v9Run,
    priorV9GrantFile: fixture.v9Grant,
    priorV9UseFile: fixture.v9Use,
    outputGrantFile: path.join(fixture.base, `${name}.json`),
    authorizedAt, expiresAt,
  });
}

function v10Options(fixture, grant, nonce, fetchImpl, observedAt = V10_NOW) {
  return { priorV8RunDirectory: fixture.run,
    priorV9RunDirectory: fixture.v9Run,
    priorV9GrantFile: fixture.v9Grant,
    priorV9UseFile: fixture.v9Use,
    readOnlyGrantFile: grant.output.absolute,
    privateRoot: fixture.base, observedAt, nonce, fetchImpl };
}

test("v10 resolves the frozen v9 ambiguity with two GETs and parses only step4",
  async (t) => {
    const fixture = await frozenAmbiguousV9(t);
    const frozenBefore = inventory(fixture.v9Run);
    const grant = v10Grant(fixture, "v10-step4");
    const calls = [];
    const result = await runAdafruitShippingReconciliationLiveV10(v10Options(
      fixture, grant, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      async (url, init) => {
        calls.push(`${init.method} ${url}`);
        assert.equal(init.body, undefined);
        assert.equal(init.headers.cookie,
          `adafruit_session=${EVOLVED_COOKIE}`);
        return url === "https://www.adafruit.com/checkout"
          ? response("", 302, { location: "/checkout?step=4" })
          : response(summaryHtml());
      }));
    assert.deepEqual(calls, [
      "GET https://www.adafruit.com/checkout",
      "GET https://www.adafruit.com/checkout?step=4",
    ]);
    assert.equal(result.projection.sellerState.currentStepNumber, 4);
    assert.equal(result.projection.step4SummaryObserved, true);
    assert.equal(result.projection.allInTotalMinor, 1395);
    assert.equal(result.projection.allInTotalProven, true);
    assert.equal(result.projection.structuredEtaObserved, true);
    assert.equal(result.projection.counters.postRequestCount, 0);
    assert.equal(result.projection.shippingMethodApplyAttempted, false);
    assert.equal(result.projection.paymentFieldsParsed, false);
    assert.equal(result.projection.paymentPerformed, false);
    assert.equal(result.projection.orderSubmitted, false);
    assert.equal(result.projection.capacityReserved, false);
    const evidence = verifyBuyerNativeRouteEvidenceV1(result.routeEvidence);
    assert.equal(evidence.facts.allInPrice.status, "COMPLETE");
    assert.equal(evidence.facts.eta.status, "STRUCTURED");
    assert.equal(evidence.facts.capacity.status, "UNRESERVED");
    const publicText = readFileSync(result.publicArtifact.file, "utf8")
      + readFileSync(result.routeEvidenceArtifact.file, "utf8");
    for (const privateValue of [CSRF, ORIGINAL_COOKIE, EVOLVED_COOKIE,
      PRIVATE_PII, "card_number", "ups_ground_saver"]) {
      assert.equal(publicText.includes(privateValue), false, privateValue);
    }
    assert.deepEqual(inventory(fixture.v9Run), frozenBefore);
    assertPrivateTree(result.runDirectory);
  });

test("v10 records a non-step4 current checkout state without inferring the POST result",
  async (t) => {
    const fixture = await frozenAmbiguousV9(t);
    const grant = v10Grant(fixture, "v10-step3");
    const calls = [];
    const result = await runAdafruitShippingReconciliationLiveV10(v10Options(
      fixture, grant, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      async (url, init) => {
        calls.push(`${init.method} ${url}`);
        return url === "https://www.adafruit.com/checkout"
          ? response("", 302, { location: "/checkout?step=3" })
          : response(step3Html());
      }));
    assert.equal(calls.length, 2);
    assert.equal(result.projection.sellerState.currentStepNumber, 3);
    assert.equal(result.projection.step4SummaryObserved, false);
    assert.equal(result.projection.allInTotalMinor, null);
    assert.equal(result.projection.allInEvidenceStatus, "UNAVAILABLE");
    assert.equal(result.projection.priorShippingApplicationEffectState,
      "AMBIGUOUS_SHIPPING_APPLICATION_NO_RETRY");
    assert.equal(result.projection.counters.postRequestCount, 0);
    assert.equal(result.routeEvidence.facts.capacity.status, "UNRESERVED");
    assert.equal(result.routeEvidence.facts.allInPrice.status, "UNAVAILABLE");
  });

test("v10 one-use and expiry reject before provider I/O", async (t) => {
  const fixture = await frozenAmbiguousV9(t);
  const grant = v10Grant(fixture, "v10-once");
  await runAdafruitShippingReconciliationLiveV10(v10Options(fixture, grant,
    "cccccccccccccccccccccccccccccccc", async (url) =>
      url === "https://www.adafruit.com/checkout"
        ? response("", 302, { location: "/checkout?step=3" })
        : response(step3Html())));
  const copied = path.join(fixture.base, "v10-copied.json");
  writeFileSync(copied, readFileSync(grant.output.absolute), { mode: 0o600 });
  chmodSync(copied, 0o600);
  let copiedCalls = 0;
  await assert.rejects(() => runAdafruitShippingReconciliationLiveV10({
    ...v10Options(fixture, grant,
      "dddddddddddddddddddddddddddddddd",
      async () => { copiedCalls += 1; }), readOnlyGrantFile: copied,
  }), /GRANT_ALREADY_USED/u);
  assert.equal(copiedCalls, 0);
  const expired = v10Grant(fixture, "v10-expired",
    "2026-09-05T00:21:00.000Z", "2026-09-05T00:22:00.000Z");
  let expiredCalls = 0;
  await assert.rejects(() => runAdafruitShippingReconciliationLiveV10(
    v10Options(fixture, expired,
      "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      async () => { expiredCalls += 1; },
      "2026-09-05T00:23:00.000Z")), /GRANT_NOT_ACTIVE/u);
  assert.equal(expiredCalls, 0);
});

test("v10 persists a bad step4 response before parser failure and never POSTs",
  async (t) => {
    const fixture = await frozenAmbiguousV9(t);
    const grant = v10Grant(fixture, "v10-bad-step4");
    const nonce = "ffffffffffffffffffffffffffffffff";
    let calls = 0;
    await assert.rejects(() => runAdafruitShippingReconciliationLiveV10(
      v10Options(fixture, grant, nonce, async (url, init) => {
        calls += 1;
        assert.equal(init.method, "GET");
        return url === "https://www.adafruit.com/checkout"
          ? response("", 302, { location: "/checkout?step=4" })
          : response("<!doctype html><h1>Order confirmation</h1>");
      })), /PREPAYMENT_SUMMARY_INVALID/u);
    assert.equal(calls, 2);
    const run = path.join(fixture.base,
      `adafruit-shipping-reconciliation-v10-20260905-${nonce}`);
    const raw = path.join(run, "checkout-step4-response.v10.bin");
    assert.equal(lstatSync(raw).mode & 0o777, 0o600);
    assert.equal(readFileSync(raw, "utf8").includes("Order confirmation"), true);
    const failure = JSON.parse(readFileSync(path.join(run,
      "bounded-failure-manifest.v10.json"), "utf8"));
    assert.equal(failure.responsePersistedBeforeInspection, true);
    assert.equal(failure.postCount, 0);
    assert.equal(failure.predecessorEffectReplayed, false);
  });

test("v10 rejects a non-checkout redirect without extra I/O",
  async (t) => {
    const fixture = await frozenAmbiguousV9(t);
    const grant = v10Grant(fixture, "v10-bounded");
    let calls = 0;
    await assert.rejects(() => runAdafruitShippingReconciliationLiveV10(
      v10Options(fixture, grant,
        "12121212121212121212121212121212", async () => {
          calls += 1;
          return response("", 302, { location: "/cart" });
        })), /CHECKOUT_STEP_REDIRECT_INVALID/u);
    assert.equal(calls, 1);
    assert.equal(OUTSIDER_ADAFRUIT_SHIPPING_RECONCILIATION_V10_BOUNDARY
      .postAllowed, false);
    assert.equal(OUTSIDER_ADAFRUIT_SHIPPING_RECONCILIATION_V10_BOUNDARY
      .maximumRedirectsFollowed, 1);
  });

test("v10 records but never follows a second exact checkout redirect",
  async (t) => {
    const fixture = await frozenAmbiguousV9(t);
    const grant = v10Grant(fixture, "v10-second-redirect",
      "2026-09-05T00:31:00.000Z", "2026-09-05T00:56:00.000Z");
    const calls = [];
    const result = await runAdafruitShippingReconciliationLiveV10(
      v10Options(fixture, grant,
        "34343434343434343434343434343434", async (url, init) => {
          calls.push(`${init.method} ${url}`);
          return url === "https://www.adafruit.com/checkout"
            ? response("", 302, { location: "/checkout?step=3" })
            : response("", 302, { location: "/checkout?step=4" });
        }, "2026-09-05T00:41:00.000Z"));
    assert.deepEqual(calls, [
      "GET https://www.adafruit.com/checkout",
      "GET https://www.adafruit.com/checkout?step=3",
    ]);
    assert.equal(result.projection.sellerState.currentStepNumber, 3);
    assert.equal(result.projection.sellerState.furtherRedirectObserved, true);
    assert.equal(result.projection.sellerState.furtherRedirectTarget,
      "https://www.adafruit.com/checkout?step=4");
    assert.equal(result.projection.sellerState.redirectLimitReached, true);
    assert.equal(result.projection.step4SummaryObserved, false);
    assert.equal(result.projection.counters.postRequestCount, 0);
  });

test("v10 keeps a direct checkout 200 as evidence without guessing its step",
  async (t) => {
    const fixture = await frozenAmbiguousV9(t);
    const grant = v10Grant(fixture, "v10-direct-checkout");
    const calls = [];
    const result = await runAdafruitShippingReconciliationLiveV10(v10Options(
      fixture, grant, "56565656565656565656565656565656",
      async (url, init) => {
        calls.push(`${init.method} ${url}`);
        return response(summaryHtml());
      }));
    assert.deepEqual(calls, ["GET https://www.adafruit.com/checkout"]);
    assert.equal(result.projection.sellerState.currentStepNumber, null);
    assert.equal(result.projection.step4SummaryObserved, false);
    assert.equal(result.projection.allInEvidenceStatus, "UNAVAILABLE");
    assert.equal(result.projection.decisionState, "HOLD");
    assert.equal(readFileSync(path.join(result.runDirectory,
      "checkout-current-response.v10.bin"), "utf8"), summaryHtml());
  });

test("v10 records interrupted GET once and preserves the frozen POST tree",
  async (t) => {
    const fixture = await frozenAmbiguousV9(t);
    const frozenBefore = inventory(fixture.v9Run);
    const grant = v10Grant(fixture, "v10-interrupted-get");
    const nonce = "78787878787878787878787878787878";
    let calls = 0;
    const options = v10Options(fixture, grant, nonce, async (url, init) => {
      calls += 1;
      assert.equal(url, "https://www.adafruit.com/checkout");
      assert.equal(init.method, "GET");
      throw new Error("fixture network disconnected");
    });
    await assert.rejects(() => runAdafruitShippingReconciliationLiveV10(options));
    const run = path.join(fixture.base,
      `adafruit-shipping-reconciliation-v10-20260905-${nonce}`);
    const failure = JSON.parse(readFileSync(path.join(run,
      "bounded-failure-manifest.v10.json"), "utf8"));
    assert.equal(failure.responsePersistedBeforeInspection, false);
    assert.equal(failure.counters.getRequestCount, 1);
    assert.equal(failure.postCount, 0);
    assert.equal(failure.retryAutomaticallyPermitted, false);
    assert.equal(failure.predecessorEffectReplayed, false);
    await assert.rejects(() => runAdafruitShippingReconciliationLiveV10({
      ...options, nonce: "89898989898989898989898989898989",
    }), /GRANT_ALREADY_USED/u);
    assert.equal(calls, 1);
    assert.deepEqual(inventory(fixture.v9Run), frozenBefore);
  });

test("v10 retains a complete over-budget quote without advancing its next gate",
  async (t) => {
    const fixture = await frozenAmbiguousV9(t);
    const grant = v10Grant(fixture, "v10-over-budget");
    const expensiveSummary = summaryHtml().replace("$4.95", "$24.95")
      .replace("$13.95", "$33.95");
    const result = await runAdafruitShippingReconciliationLiveV10(v10Options(
      fixture, grant, "90909090909090909090909090909090", async (url) =>
        url === "https://www.adafruit.com/checkout"
          ? response("", 302, { location: "/checkout?step=4" })
          : response(expensiveSummary)));
    assert.equal(result.projection.allInTotalProven, true);
    assert.equal(result.projection.allInTotalMinor, 3395);
    assert.equal(result.projection.budgetSatisfied, false);
    assert.equal(result.projection.nextGate,
      "CURRENT_PREPAYMENT_TOTAL_EXCEEDS_BUDGET");
    assert.equal(result.routeEvidence.facts.allInPrice.status, "COMPLETE");
    assert.equal(result.projection.paymentAuthorized, false);
    assert.equal(result.projection.orderAuthorized, false);
  });

test("v10 grant helper refuses intervals outside its frozen evidence before writing",
  async (t) => {
    const fixture = await frozenAmbiguousV9(t);
    for (const [name, authorizedAt, expiresAt] of [
      ["v10-before-attempt", "2026-09-05T00:19:00.000Z",
        "2026-09-05T00:55:00.000Z"],
      ["v10-after-evidence", "2026-09-05T00:30:00.000Z", DEADLINE],
    ]) {
      assert.throws(() => v10Grant(fixture, name, authorizedAt, expiresAt),
        /GRANT_INTERVAL_INVALID/u);
      assert.equal(existsSync(path.join(fixture.base, `${name}.json`)), false);
    }
  });

test("v10 parses the seller payment module with PO help and its selected service label",
  () => {
    const html = sellerPaymentModuleHtml();
    assert.throws(() => parseAdafruitPrepaymentSummaryV9(html, DEADLINE, 869),
      /PREPAYMENT_SUMMARY_INVALID/u);
    const summary = parseAdafruitPrepaymentSummaryV10(html, DEADLINE, 869,
      "upsxml_UPS Ground Saver");
    assert.equal(summary.subtotalMinor, 495);
    assert.equal(summary.shippingMinor, 869);
    assert.equal(summary.taxMinor, 31);
    assert.equal(summary.allInTotalMinor, 1395);
    assert.equal(summary.allInTotalProven, true);
    assert.equal(summary.sourceDeliveryDate, null);
    assert.equal(summary.structuredEtaObserved, false);
    assert.equal(summary.deliveryDeadlineProven, false);
    const mismatch = parseAdafruitPrepaymentSummaryV10(html, DEADLINE, 869,
      "usps_Ground Advantage");
    assert.equal(mismatch.allInTotalProven, false);
    assert.throws(() => parseAdafruitPrepaymentSummaryV10(
      html.replace("<main>", "<main><h1>Order confirmation</h1>"),
      DEADLINE, 869, "upsxml_UPS Ground Saver"), /PREPAYMENT_SUMMARY_INVALID/u);
  });

test("v10 replays frozen step-4 bytes without new I/O, changing source, or refreshing validity",
  async (t) => {
    const fixture = await frozenAmbiguousV9(t);
    const grant = v10Grant(fixture, "v10-replay-source");
    const nonce = "abababababababababababababababab";
    await assert.rejects(() => runAdafruitShippingReconciliationLiveV10(
      v10Options(fixture, grant, nonce, async (url) =>
        url === "https://www.adafruit.com/checkout"
          ? response("", 302, { location: "/checkout?step=4" })
          : response("<h1>Order confirmation</h1>"))),
    /PREPAYMENT_SUMMARY_INVALID/u);
    const sourceRun = path.join(fixture.base,
      `adafruit-shipping-reconciliation-v10-20260905-${nonce}`);
    // Freeze a historical v9-parser failure containing the actual seller
    // structure; content references are rebuilt only inside this fixture.
    const sourceArtifact = bytes(path.join(sourceRun,
      "checkout-step4-response.v10.bin"), sellerPaymentModuleHtml());
    const captureFile = path.join(sourceRun, "private-source-capture.v10.json");
    const { captureHash: oldCaptureHash, ...captureBody } = JSON.parse(
      readFileSync(captureFile, "utf8"));
    captureBody.exchanges[1].bodyBytes = sourceArtifact.bytes;
    captureBody.exchanges[1].bodyBytesHash = sourceArtifact.bytesHash;
    json(captureFile, { ...captureBody,
      captureHash: digest(captureBody.schema, captureBody) });
    const failureFile = path.join(sourceRun, "bounded-failure-manifest.v10.json");
    const { failureManifestHash: oldFailureHash, ...failureBody } = JSON.parse(
      readFileSync(failureFile, "utf8"));
    failureBody.artifactInventory = inventory(sourceRun).filter(item =>
      item.relativePath !== "bounded-failure-manifest.v10.json");
    failureBody.artifactCount = failureBody.artifactInventory.length;
    failureBody.artifactBytes = failureBody.artifactInventory.reduce(
      (sum, item) => sum + item.bytes, 0);
    json(failureFile, { ...failureBody,
      failureManifestHash: digest(failureBody.schema, failureBody) });
    const before = inventory(sourceRun);
    const useDirectory = path.join(fixture.base,
      "adafruit-shipping-reconciliation-grant-use-v10");
    const useBefore = inventory(useDirectory);
    let networkCalls = 0;
    const result = replayAdafruitShippingReconciliationCapturedV10({
      ...v10Options(fixture, grant,
        "bcbcbcbcbcbcbcbcbcbcbcbcbcbcbcbc",
        () => { networkCalls += 1; throw new Error("unexpected I/O"); }),
      sourceRunDirectory: sourceRun,
      replayedAt: "2026-09-06T00:00:00.000Z",
    });
    assert.equal(networkCalls, 0);
    assert.equal(result.projection.allInTotalMinor, 1395);
    assert.equal(result.projection.allInTotalProven, true);
    assert.equal(result.projection.etaEvidenceStatus, "UNAVAILABLE");
    assert.equal(result.projection.nextGate, "OBTAIN_SOURCE_STRUCTURED_ETA");
    assert.equal(result.routeEvidence.observedAt, V10_NOW);
    assert.equal(result.routeEvidence.validUntil, grant.grant.expiresAt);
    assert.equal(result.routeEvidence.facts.capacity.status, "UNRESERVED");
    assert.equal(result.replayReceipt.evidenceValidityRefreshed, false);
    assert.equal(result.replayReceipt.networkRequestCount, 0);
    assert.equal(result.replayReceipt.sourceBytesHash, sourceArtifact.bytesHash);
    assert.deepEqual(inventory(sourceRun), before);
    assert.deepEqual(inventory(useDirectory), useBefore);
    assertPrivateTree(result.runDirectory);
    bytes(path.join(sourceRun, "checkout-step4-response.v10.bin"),
      `${sellerPaymentModuleHtml()}changed`);
    assert.throws(() => replayAdafruitShippingReconciliationCapturedV10({
      ...v10Options(fixture, grant, "cdcdcdcdcdcdcdcdcdcdcdcdcdcdcdcd",
        () => { networkCalls += 1; }),
      sourceRunDirectory: sourceRun,
      replayedAt: "2026-09-06T00:00:00.000Z",
    }), /SOURCE_FAILURE_INVALID/u);
    assert.equal(networkCalls, 0);
  });
