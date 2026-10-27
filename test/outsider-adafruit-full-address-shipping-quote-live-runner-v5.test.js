import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, lstatSync, mkdtempSync, readFileSync, readdirSync, rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  mapBuyerNativeRouteEvidenceToRecoveryCandidateV1,
  verifyBuyerNativeRouteEvidenceV1,
} from "../src/outsider-buyer-native-route-evidence-v1.js";
import {
  executeAdafruitFullAddressShippingQuoteLiveV5,
  issueAdafruitPurposeBoundPrivateRunGrantV5,
  OUTSIDER_PROVIDER_NEUTRAL_ACCEPTANCE_SPEC_SCHEMA_V5,
  OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_GRANT_SCHEMA_V5,
  OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_INPUT_SCHEMA_V5,
  runAdafruitFullAddressShippingQuoteLiveV5,
} from "../scripts/outsider-adafruit-full-address-shipping-quote-live-runner-v5.mjs";
import { reissueAdafruitPrivateRouteQuoteV5 }
  from "../scripts/outsider-adafruit-private-route-quote-reissue-v5.mjs";
import {
  appendProductionBuyerNativeRouteEvidenceV1,
} from "../scripts/outsider-production-route-proposal-append-v1.mjs";
import {
  runAdafruitAddressQuoteResumeLiveV6,
} from "../scripts/outsider-adafruit-address-quote-resume-live-runner-v6.mjs";
import {
  reissueAdafruitAddressQuoteResidualGrantV6,
} from "../scripts/outsider-adafruit-address-quote-residual-grant-reissue-v6.mjs";
import {
  runAdafruitStep3ReceiptReconcileLiveV7,
} from "../scripts/outsider-adafruit-step3-receipt-reconcile-live-runner-v7.mjs";
import {
  reissueAdafruitStep3ReceiptReconciliationGrantV7,
} from "../scripts/outsider-adafruit-step3-receipt-reconciliation-grant-reissue-v7.mjs";
import {
  runAdafruitStep3ReceiptReconcileLiveV8,
} from "../scripts/outsider-adafruit-step3-receipt-reconcile-live-runner-v8.mjs";
import {
  reissueAdafruitStep3ReceiptReconciliationGrantV8,
} from "../scripts/outsider-adafruit-step3-receipt-reconciliation-grant-reissue-v8.mjs";

const NOW = "2026-09-04T23:30:00.000Z";
const EXPIRY = "2026-09-05T00:30:00.000Z";
const DEADLINE = "2026-09-10T23:59:59.999Z";
const NONCE = "0123456789abcdef0123456789abcdef";
const TOKEN = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const PRIVATE_STREET = "41 Private Fixture Street";
const PRIVATE_EMAIL = "authorized-owner@example.invalid";
const PRIVATE_PHONE = "+1 555 010 4474";
const PRIVATE_POSTAL = "02139";

function digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function root(t) {
  const value = mkdtempSync(path.join(tmpdir(), "outsider-adafruit-v5-"));
  chmodSync(value, 0o700);
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function privateJson(file, value) {
  const bytes = Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
  writeFileSync(file, bytes, { mode: 0o600 });
  chmodSync(file, 0o600);
  return Object.freeze({ absolute: file, file, bytes,
    bytesHash: digest(bytes), value });
}

function privateRecord(file) {
  const bytes = readFileSync(file);
  return Object.freeze({ absolute: file, file, bytes, bytesHash: digest(bytes),
    value: JSON.parse(bytes.toString("utf8")) });
}

function predecessorValues() {
  const input = {
    schema: "outsider/private-sparkfun-full-address-prepayment-run-request/v1",
    schemaVersion: "1.0.0",
    product: { catalogPath: "/wrong-provider-shape.html", productId: "4636",
      sku: "WRONG-PROVIDER-SKU", quantity: 1 },
    destination: {
      firstName: "Private",
      lastName: "Recipient",
      email: PRIVATE_EMAIL,
      telephone: PRIVATE_PHONE,
      countryCode: "US",
      regionId: 25,
      region: "Massachusetts",
      regionCode: "MA",
      city: "Exampleville",
      postalCode: PRIVATE_POSTAL,
      streetLines: [PRIVATE_STREET],
    },
    budget: { currency: "USD", maximumAmountMinor: "2000" },
    completionDeadline: DEADLINE,
    formationExpiresAt: "2026-09-04T22:00:00.000Z",
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  return { input, grant(inputBytesHash) {
    return {
      schema: "outsider/private-supplier-scoped-shipping-quote-use-grant/v2",
      schemaVersion: "2.0.0",
      supplierOrigin: "https://www.adafruit.com",
      purpose: "SHIPPING_DELIVERABILITY_AND_TOTAL_QUOTE_ONLY",
      permittedDisclosures: ["EMAIL_CHECKOUT_CONTACT",
        "FULL_ADDRESS_SHIPPING_QUOTE", "PHONE_SHIPPING_QUOTE"],
      forbiddenActions: ["ADDRESS_USE_OUTSIDE_SHIPPING_QUOTE",
        "CROSS_PURPOSE_REUSE", "MARKETING_SUBSCRIPTION",
        "ORDER_SUBMISSION", "PAYMENT", "PII_PUBLIC_PROJECTION"],
      inputBytesHash,
      authorizedAt: "2026-09-04T21:00:00.000Z",
      expiresAt: "2026-09-04T22:00:00.000Z",
    };
  } };
}

function reissue(t) {
  const directory = root(t);
  const previous = predecessorValues();
  const predecessorInput = privateJson(path.join(directory,
    "predecessor-input.json"), previous.input);
  const predecessorGrant = privateJson(path.join(directory,
    "predecessor-grant.json"), previous.grant(predecessorInput.bytesHash));
  const beforeInput = Buffer.from(predecessorInput.bytes);
  const beforeGrant = Buffer.from(predecessorGrant.bytes);
  const result = reissueAdafruitPrivateRouteQuoteV5({
    predecessorInputFile: predecessorInput.file,
    predecessorGrantFile: predecessorGrant.file,
    outputInputFile: path.join(directory, "input-v5.json"),
    outputGrantFile: path.join(directory, "grant-v5.json"),
    outputLineageFile: path.join(directory, "lineage-v5.json"),
    authorizedAt: NOW,
    expiresAt: EXPIRY,
    nativeResourceId: "4474",
    routeRole: "RECOVERY",
    providerCountryId: "223",
    providerRegionId: "32",
    acceptanceProfile: "USB_A_TO_USB_C_DATA_POWER_5V_MIN_900MM_V1",
  });
  assert.deepEqual(readFileSync(predecessorInput.file), beforeInput);
  assert.deepEqual(readFileSync(predecessorGrant.file), beforeGrant);
  return { directory, result, predecessorInput, predecessorGrant };
}

function productPage(exactSpec = true) {
  return `<!doctype html><script type="application/ld+json">${JSON.stringify({
    "@type": "Product",
    sku: 4474,
    name: "USB Type A to Type C Cable - approx 1 meter / 3 ft long",
    description: exactSpec
      ? "For transmitting data and power. A classic USB type A port attaches to a type C connector. Built in resistors force it to 5V power, up to 2A. This cable is about 3 feet long (about one meter)."
      : "A classic USB type A port attaches to a type C connector. This cable is about 3 feet long.",
    offers: { price: "4.95", priceCurrency: "USD",
      availability: "https://schema.org/InStock" },
  })}</script><form action="/added" method="post"><input name="securityToken" value="${TOKEN}"></form>`;
}

function cartPage(present) {
  return present
    ? "<!doctype html><div class=\"cart-row\" data-pid=\"4474\" data-qty=\"1\" data-price=\"4.95\"></div>"
    : "<!doctype html><main>empty cart</main>";
}

function contactPage() {
  return `<!doctype html><form action="/checkout" method="post">
    <input name="csrf_token" value="${TOKEN}"><input name="email_address">
    <button name="action" value="save_one">Continue</button></form>`;
}

function addressPage() {
  return `<!doctype html><form action="/checkout" method="post">
    <input name="csrf_token" value="${TOKEN}">
    <input name="ship_name"><input name="ship_company">
    <input name="ship_address1"><input name="ship_address2">
    <input name="ship_postcode"><input name="ship_city">
    <select name="ship_country"><option value="223">US</option></select>
    <select name="ship_state"><option value="32">MA</option></select>
    <input name="ship_phone">
    <button name="action" value="save_two">Rates</button></form>`;
}

function ratePage() {
  return `<!doctype html><form action="/checkout" method="post">
    <input name="csrf_token" value="${TOKEN}">
    <label><input type="radio" name="shipping" value="usps_ground" checked>
      USPS Ground - delivery 2026-09-08 - $6.30</label>
    <button name="action" value="save_three">Continue</button></form>
    <div class="checkout-sidebar-ot-title">Subtotal</div><div class="checkout-sidebar-ot-text">$4.95</div>
    <div class="checkout-sidebar-ot-title">Shipping</div><div class="checkout-sidebar-ot-text">$6.30</div>
    <div class="checkout-sidebar-ot-title">Tax</div><div class="checkout-sidebar-ot-text">$0.31</div>
    <div class="checkout-sidebar-ot-title">Total</div><div class="checkout-sidebar-ot-text">$11.56</div>`;
}

function realSiblingRatePage() {
  const rates = [
    ["ups_ground_saver", "UPS Ground Saver", "8.69", true],
    ["ups_ground", "UPS Ground", "18.69", false],
    ["ups_3_day", "UPS 3 Day", "19.11", false],
    ["ups_2nd_day", "UPS 2nd Day", "21.37", false],
    ["ups_next_day", "UPS Next Day", "42.86", false],
    ["usps_ground_advantage", "USPS Ground Advantage", "5.93", false],
    ["usps_priority", "USPS Priority", "9.25", false],
  ];
  return `<!doctype html><form action="/checkout" method="post">
    ${rates.map(([value, label, amount, checked], index) =>
      `<input type="radio" name="shipping" id="shipping_${index}" value="${value}"${checked ? " checked" : ""}>
       <label for="shipping_${index}">${label} $${amount}</label>`).join("\n")}
    <button name="action" value="save_three">Continue</button></form>
    <div class="checkout-sidebar-ot-title">Subtotal</div><div class="checkout-sidebar-ot-text">$4.95</div>
    <div class="checkout-sidebar-ot-title">Sales Tax</div><div class="checkout-sidebar-ot-text">$0.31</div>`;
}

function html(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: {
    "content-type": "text/html; charset=utf-8",
    date: "Fri, 04 Sep 2026 23:30:00 GMT",
    ...headers,
  } });
}

function provider(calls, options = {}) {
  let cart = false;
  let contact = false;
  let address = false;
  return async (url, init) => {
    const parsed = new URL(url);
    const body = init.body === undefined ? ""
      : Buffer.from(init.body).toString("utf8");
    const fields = new URLSearchParams(body);
    calls.push({ method: init.method, pathname: parsed.pathname,
      search: parsed.search,
      action: fields.get("action") });
    assert.equal(parsed.origin, "https://www.adafruit.com");
    assert.equal(/payment|orders?/iu.test(parsed.pathname), false);
    if (init.method === "GET" && parsed.pathname === "/product/4474") {
      return html(productPage(options.exactSpec !== false), 200,
        { "set-cookie": "adafruit_session=fixture-cookie; Path=/; Secure; HttpOnly" });
    }
    if (init.method === "GET" && parsed.pathname === "/shopping_cart") {
      return html(cartPage(cart));
    }
    if (init.method === "POST" && parsed.pathname === "/added") {
      assert.equal(fields.get("action"), "add_product");
      assert.equal(fields.get("pid"), "4474");
      cart = true;
      return html("", 302, { location: "/shopping_cart" });
    }
    if (init.method === "GET" && parsed.pathname === "/checkout") {
      if (parsed.search === "") {
        return html("", 302, { location: contact
          ? address ? "checkout?step=3" : "checkout?step=2"
          : "checkout?step=1" });
      }
      assert.equal(parsed.search, address ? "?step=3"
        : contact ? "?step=2" : "?step=1");
      if (options.failAfterContact === true && contact && !address
        && parsed.search === "?step=2") {
        throw new Error("injected post-contact read interruption");
      }
      return html(address ? ratePage() : contact ? addressPage()
        : contactPage());
    }
    if (init.method === "POST" && parsed.pathname === "/checkout") {
      if (fields.get("action") === "save_one") {
        assert.equal(fields.get("email_address"), PRIVATE_EMAIL);
        contact = true;
        return html("", 303, { location: "checkout?step=2" });
      }
      if (fields.get("action") === "save_two") {
        assert.equal(fields.get("ship_address1"), PRIVATE_STREET);
        assert.equal(fields.get("ship_postcode"), PRIVATE_POSTAL);
        assert.equal(fields.get("ship_phone"), PRIVATE_PHONE);
        address = true;
        return html("", 303, { location: "checkout?step=3" });
      }
    }
    throw new Error(`unexpected ${init.method} ${parsed.pathname}`);
  };
}

function privateTree(directory) {
  const output = [];
  const visit = (current) => {
    const info = lstatSync(current);
    assert.equal(info.isDirectory(), true);
    assert.equal(info.isSymbolicLink(), false);
    assert.equal((info.mode & 0o077), 0);
    for (const name of readdirSync(current)) {
      const child = path.join(current, name);
      const childInfo = lstatSync(child);
      if (childInfo.isDirectory()) visit(child);
      else {
        assert.equal(childInfo.isFile(), true);
        assert.equal(childInfo.isSymbolicLink(), false);
        assert.equal((childInfo.mode & 0o077), 0);
        output.push(child);
      }
    }
  };
  visit(directory);
  return output;
}

test("reissues the frozen wrong-provider v4 pair as provider-neutral v5 bound to native resource 4474",
  (t) => {
    const value = reissue(t);
    const input = JSON.parse(readFileSync(value.result.input.absolute, "utf8"));
    const grant = JSON.parse(readFileSync(value.result.grant.absolute, "utf8"));
    const lineage = JSON.parse(readFileSync(value.result.lineage.absolute,
      "utf8"));
    assert.equal(input.schema,
      OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_INPUT_SCHEMA_V5);
    assert.equal(input.selectedRoute.nativeResourceId, "4474");
    assert.equal(input.selectedRoute.sellerOrigin, "https://www.adafruit.com");
    assert.equal(input.outcome.acceptanceSpec.schema,
      OUTSIDER_PROVIDER_NEUTRAL_ACCEPTANCE_SPEC_SCHEMA_V5);
    assert.equal(Object.hasOwn(input, "product"), false);
    assert.equal(JSON.stringify(input).includes("SparkFun"), false);
    assert.equal(grant.schema,
      OUTSIDER_PROVIDER_NEUTRAL_ROUTE_QUOTE_GRANT_SCHEMA_V5);
    assert.equal(grant.inputBytesHash, value.result.input.bytesHash);
    assert.equal(lineage.predecessor.semanticDisposition,
      "REJECTED_FOR_ADAFRUIT_EXECUTION");
    assert.equal(lineage.frozenPredecessorsOverwritten, false);
    for (const artifact of [value.result.input, value.result.grant,
      value.result.lineage]) {
      assert.equal((lstatSync(artifact.absolute).mode & 0o777), 0o600);
    }
  });

test("one process compiles 4474, proves the exact spec, and reaches a destination quote without payment or order",
  async (t) => {
    const value = reissue(t);
    const calls = [];
    const result = await runAdafruitFullAddressShippingQuoteLiveV5({
      inputFile: value.result.input.absolute,
      grantFile: value.result.grant.absolute,
      privateRoot: value.directory,
      observedAt: NOW,
      nonce: NONCE,
      fetchImpl: provider(calls),
    });
    assert.equal(result.projection.selectedRoute.nativeResourceId, "4474");
    assert.deepEqual(result.projection.routeCompiledProduct,
      { productId: "4474", quantity: 1 });
    assert.equal(result.projection.exactSpecEvaluation.accepted, true);
    assert.equal(result.projection.exactSpecEvaluation.checks.length, 6);
    assert.equal(result.projection.exactSpecEvaluation.checks.every(
      (entry) => entry.satisfied), true);
    assert.match(result.projection.exactSpecEvaluation.sourceBodyBytesHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.match(result.projection.exactSpecEvaluation.sourceOccurrenceHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.match(result.projection.exactSpecEvaluation.evaluationHash,
      /^sha256:[a-f0-9]{64}$/u);
    assert.equal(result.projection.runState,
      "DESTINATION_QUOTE_OBSERVED_NO_CAPACITY_HOLD",
      JSON.stringify({ calls, stages: result.projection.stages,
        nextGate: result.projection.nextGate }));
    assert.equal(result.projection.allInTotalMinor, 1156);
    assert.equal(result.projection.allInTotalProven, true);
    assert.equal(result.projection.budgetSatisfied, true);
    assert.equal(result.projection.deliveryDeadlineProven, true);
    assert.equal(result.projection.stages.length, 6);
    assert.equal(result.projection.counters.liveHttpRequestCount, 17);
    assert.equal(result.projection.counters.getRequestCount, 14);
    assert.equal(result.projection.counters.postRequestCount, 3);
    assert.equal(result.projection.counters.boundedCheckoutRedirectCount, 6);
    assert.equal(result.projection.counters.cartPostCount, 1);
    assert.equal(result.projection.counters.contactPostCount, 1);
    assert.equal(result.projection.counters.addressQuotePostCount, 1);
    assert.deepEqual(calls.map((entry) =>
      `${entry.method} ${entry.pathname}${entry.search}`),
      ["GET /product/4474", "GET /product/4474", "GET /shopping_cart",
        "POST /added", "GET /shopping_cart", "GET /checkout",
        "GET /checkout?step=1", "GET /checkout", "GET /checkout?step=1",
        "POST /checkout", "GET /checkout?step=2", "GET /checkout",
        "GET /checkout?step=2", "GET /checkout", "GET /checkout?step=2",
        "POST /checkout", "GET /checkout?step=3"]);
    assert.deepEqual(calls.filter((entry) => entry.method === "POST")
      .map((entry) => entry.action), ["add_product", "save_one", "save_two"]);
    for (const field of ["shippingMethodApplied", "paymentPerformed",
      "orderSubmitted", "marketingSubscriptionPerformed", "capacityReserved",
      "independentOutcomeTruthEstablished", "userResultCommitted"]) {
      assert.equal(result.projection[field], false);
    }
    const projected = JSON.stringify(result.projection)
      + readFileSync(result.publicArtifact.file, "utf8");
    for (const secret of [PRIVATE_STREET, PRIVATE_EMAIL, PRIVATE_PHONE,
      PRIVATE_POSTAL, "Exampleville"]) {
      assert.equal(projected.includes(secret), false);
    }
    assert.equal(result.privateManifest.exactRequestBodiesPersisted, false);
    assert.equal(result.privateManifest.requestBodyHashesPersisted, true);
    assert.equal(result.privateManifest.exactSourceArtifactsRemainPrivate0600,
      true);
    const routeEvidence = verifyBuyerNativeRouteEvidenceV1(
      result.routeEvidence);
    assert.equal(routeEvidence.routeProposalRefHash,
      result.projection.projectionHash);
    assert.equal(routeEvidence.occurrenceRefHash,
      result.projection.stages.at(-1).sourceOccurrenceHash);
    assert.equal(routeEvidence.facts.specification.status, "MATCH");
    assert.equal(routeEvidence.facts.specification.evaluationRefHash,
      result.projection.exactSpecEvaluation.evaluationHash);
    assert.equal(routeEvidence.facts.allInPrice.status, "COMPLETE");
    assert.equal(routeEvidence.facts.allInPrice.allInMinorUnits, 1156);
    assert.equal(routeEvidence.facts.allInPrice
      .includesItemTaxShippingAndFees, true);
    assert.equal(routeEvidence.facts.eta.status, "STRUCTURED");
    assert.equal(routeEvidence.facts.eta.estimatedCompletionAt,
      "2026-09-08T23:59:59.999Z");
    assert.deepEqual(routeEvidence.facts.capacity, {
      sourceOccurrenceRefHash:
        result.projection.stages.at(-1).sourceOccurrenceHash,
      capacityLifecycleRefHash: null,
      capacityLifecycleHeadHash: null,
      reservedFrom: null,
      reservedUntil: null,
      status: "UNRESERVED",
      sourceClass: "SELLER_SERVER_ACK_ONLY",
    });
    const gateCandidate
      = mapBuyerNativeRouteEvidenceToRecoveryCandidateV1(routeEvidence);
    assert.equal(gateCandidate.evidenceEvents.length, 4);
    assert.equal(gateCandidate.evidenceEvents.at(-1).payload.status,
      "UNRESERVED");
    const persistedEvidence = readFileSync(result.routeEvidenceArtifact.file,
      "utf8");
    for (const secret of [PRIVATE_STREET, PRIVATE_EMAIL, PRIVATE_PHONE,
      PRIVATE_POSTAL, "4474", "ADAFRUIT"]) {
      assert.equal(persistedEvidence.includes(secret), false);
    }

    const tokenFile = path.join(value.directory, "registry-token.secret");
    writeFileSync(tokenFile, `${"a".repeat(64)}\n`, { mode: 0o600 });
    chmodSync(tokenFile, 0o600);
    const centralCalls = [];
    const centralFetch = async (url, init) => {
      centralCalls.push({ url, init });
      if (init.method === "GET") {
        return new Response(JSON.stringify({ ok: true,
          rawEventsProjected: false,
          registry: { head: { headEventHash: digest(Buffer.from("head")) } },
        }), { status: 200,
          headers: { "content-type": "application/json" } });
      }
      const body = JSON.parse(init.body);
      assert.equal(body.routeProposalRefHash,
        routeEvidence.routeProposalRefHash);
      assert.equal(body.occurrenceRefHash, routeEvidence.occurrenceRefHash);
      assert.deepEqual(Object.keys(body).sort(), [
        "expectedRegistryHeadHash", "idempotencyKeyHash",
        "occurrenceRefHash", "recordedAt", "routeProposalRefHash", "schema",
      ]);
      const transmitted = JSON.stringify(body);
      assert.equal(transmitted.includes(routeEvidence.evidenceHash), false);
      assert.equal(transmitted.includes("UNRESERVED"), false);
      assert.equal(transmitted.includes("4474"), false);
      return new Response(JSON.stringify({ ok: true, result: {
        receipt: { routeProposalRefHash: body.routeProposalRefHash,
          occurrenceRefHash: body.occurrenceRefHash,
          idempotencyKeyHash: body.idempotencyKeyHash },
        eventAppended: true,
        idempotentReplay: false,
        head: { headEventHash: digest(Buffer.from("new-head")),
          proposalOccurrenceCount: 1, distinctRouteProposalCount: 1 },
        rawEventsProjected: false,
        routeSelected: false,
        executableCapabilityEstablished: false,
        capacityEstablished: false,
        authority: "NONE",
        outcomeTruthEstablished: false,
        outcomeCommitIssued: false,
      } }), { status: 201,
        headers: { "content-type": "application/json" } });
    };
    const append = await appendProductionBuyerNativeRouteEvidenceV1({
      centralOrigin: "https://formation.example",
      tokenFile,
      contractId: "contract_eb17007dce08d9359f95e8f24fda59d7",
      routeEvidence,
    }, { fetchImpl: centralFetch });
    assert.equal(centralCalls.length, 2);
    assert.deepEqual(centralCalls.map(({ init }) => init.method),
      ["GET", "POST"]);
    assert.equal(append.routeEvidenceHash, routeEvidence.evidenceHash);
    assert.equal(append.routeEvidenceRemainedUserHeld, true);
    assert.equal(append.evidenceFactsTransmitted, false);
    assert.equal(append.capacityEstablished, false);
    assert.equal(append.outcomeCommitIssued, false);
    const files = privateTree(result.runDirectory);
    assert.equal(files.some((file) => file.endsWith(".source-v2.bin")), true);
    const persistedRuntime = Buffer.concat(files.map((file) =>
      readFileSync(file))).toString("utf8");
    for (const secret of [PRIVATE_STREET, PRIVATE_EMAIL, PRIVATE_PHONE,
      PRIVATE_POSTAL]) assert.equal(persistedRuntime.includes(secret), false);

    let replayRequests = 0;
    const replay = await runAdafruitFullAddressShippingQuoteLiveV5({
      inputFile: value.result.input.absolute,
      grantFile: value.result.grant.absolute,
      privateRoot: value.directory,
      observedAt: NOW,
      nonce: NONCE,
      reconcileOnly: true,
      fetchImpl: async () => { replayRequests += 1; },
    });
    assert.equal(replay.reconciled, true);
    assert.equal(replay.projection.projectionHash,
      result.projection.projectionHash);
    assert.equal(replayRequests, 0);
  });

test("a copied factory-held purpose grant rejects before provider I/O",
  async (t) => {
    const value = reissue(t);
    const input = privateRecord(value.result.input.absolute);
    const grant = privateRecord(value.result.grant.absolute);
    const issued = issueAdafruitPurposeBoundPrivateRunGrantV5({
      inputRecord: input,
      grantRecord: grant,
    });
    const copied = { ...issued };
    let requests = 0;
    await assert.rejects(() => executeAdafruitFullAddressShippingQuoteLiveV5({
      purposeGrant: copied,
      privateRoot: value.directory,
      observedAt: NOW,
      nonce: NONCE,
      fetchImpl: async () => { requests += 1; },
    }), /RUN_GRANT_NOT_FACTORY_ISSUED/u);
    assert.equal(requests, 0);
  });

test("an incomplete exact source specification stops before cart or PII disclosure",
  async (t) => {
    const value = reissue(t);
    const calls = [];
    const result = await runAdafruitFullAddressShippingQuoteLiveV5({
      inputFile: value.result.input.absolute,
      grantFile: value.result.grant.absolute,
      privateRoot: value.directory,
      observedAt: NOW,
      nonce: NONCE,
      fetchImpl: provider(calls, { exactSpec: false }),
    });
    assert.equal(result.projection.runState, "SPEC_REJECTED_HOLD");
    assert.equal(result.projection.exactSpecEvaluation.accepted, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
    assert.equal(calls[0].pathname, "/product/4474");
    assert.equal(result.projection.contactSubmitted, false);
    assert.equal(result.projection.fullAddressSubmitted, false);
  });

test("the file grant is durably one-use and a second nonce rejects before provider I/O",
  async (t) => {
    const value = reissue(t);
    await runAdafruitFullAddressShippingQuoteLiveV5({
      inputFile: value.result.input.absolute,
      grantFile: value.result.grant.absolute,
      privateRoot: value.directory,
      observedAt: NOW,
      nonce: NONCE,
      fetchImpl: provider([]),
    });
    let requests = 0;
    await assert.rejects(() => runAdafruitFullAddressShippingQuoteLiveV5({
      inputFile: value.result.input.absolute,
      grantFile: value.result.grant.absolute,
      privateRoot: value.directory,
      observedAt: NOW,
      nonce: "abcdef0123456789abcdef0123456789",
      fetchImpl: async () => { requests += 1; },
    }), /FILE_GRANT_ALREADY_USED/u);
    assert.equal(requests, 0);
  });

test("an expired exact file grant rejects before provider I/O and creates no run",
  async (t) => {
    const value = reissue(t);
    let requests = 0;
    await assert.rejects(() => runAdafruitFullAddressShippingQuoteLiveV5({
      inputFile: value.result.input.absolute,
      grantFile: value.result.grant.absolute,
      privateRoot: value.directory,
      observedAt: EXPIRY,
      nonce: NONCE,
      fetchImpl: async () => { requests += 1; },
    }), /RUN_GRANT_NOT_ACTIVE/u);
    assert.equal(requests, 0);
    assert.equal(readdirSync(value.directory).some((name) =>
      name.startsWith("adafruit-full-address-quote-v5-")), false);
  });

test("v6 resumes the confirmed contact cookie at step 2 and never posts contact again",
  async (t) => {
    const value = reissue(t);
    const priorCalls = [];
    const prior = await runAdafruitFullAddressShippingQuoteLiveV5({
      inputFile: value.result.input.absolute,
      grantFile: value.result.grant.absolute,
      privateRoot: value.directory,
      observedAt: NOW,
      nonce: NONCE,
      fetchImpl: provider(priorCalls, { failAfterContact: true }),
    });
    assert.equal(prior.projection.contactSubmitted, true);
    assert.equal(prior.projection.counters.contactPostCount, 1);
    assert.equal(prior.projection.counters.addressQuotePostCount, 0);
    assert.equal(prior.projection.nextGate, "ADDRESS_FORM_NOT_AVAILABLE");
    const priorProjectionBytes = readFileSync(prior.publicArtifact.file);
    const priorManifestBytes = readFileSync(prior.privateManifestArtifact.file);
    const priorCookieFile = path.join(prior.runDirectory, "https-state",
      readdirSync(path.join(prior.runDirectory, "https-state"))[0]);
    const priorCookieBytes = readFileSync(priorCookieFile);
    const residual = reissueAdafruitAddressQuoteResidualGrantV6({
      priorRunDirectory: prior.runDirectory,
      inputFile: value.result.input.absolute,
      outputGrantFile: path.join(value.directory, "residual-grant-v6.json"),
      authorizedAt: NOW,
      expiresAt: EXPIRY,
    });
    assert.equal((lstatSync(residual.output.absolute).mode & 0o777), 0o600);
    const resumeCalls = [];
    let addressSubmitted = false;
    const resumedProvider = async (url, init) => {
      const target = new URL(url);
      const body = init.body === undefined ? ""
        : Buffer.from(init.body).toString("utf8");
      const fields = new URLSearchParams(body);
      resumeCalls.push({ method: init.method, pathname: target.pathname,
        search: target.search, action: fields.get("action") });
      assert.equal(init.headers.cookie, "adafruit_session=fixture-cookie");
      assert.equal(target.pathname, "/checkout");
      if (init.method === "GET" && target.search === "") {
        return html("", 302, { location: addressSubmitted
          ? "checkout?step=3" : "checkout?step=2" });
      }
      if (init.method === "GET" && target.search === "?step=2") {
        return html(addressPage());
      }
      if (init.method === "POST") {
        assert.equal(fields.get("action"), "save_two");
        assert.equal(fields.get("email_address"), null);
        assert.equal(fields.get("ship_address1"), PRIVATE_STREET);
        assert.equal(fields.get("ship_phone"), PRIVATE_PHONE);
        addressSubmitted = true;
        return html("", 303, { location: "checkout?step=3" });
      }
      if (init.method === "GET" && target.search === "?step=3") {
        return html(ratePage());
      }
      throw new Error(`unexpected resume ${init.method} ${target.href}`);
    };
    const resumed = await runAdafruitAddressQuoteResumeLiveV6({
      priorRunDirectory: prior.runDirectory,
      inputFile: value.result.input.absolute,
      residualGrantFile: residual.output.absolute,
      privateRoot: path.join(value.directory, "continuation"),
      observedAt: NOW,
      nonce: "abcdef0123456789abcdef0123456789",
      fetchImpl: resumedProvider,
    });
    assert.equal(resumed.projection.runState,
      "DESTINATION_QUOTE_OBSERVED_NO_CAPACITY_HOLD");
    assert.equal(resumed.projection.allInTotalMinor, 1156);
    assert.equal(resumed.projection.deliveryDeadlineProven, true);
    assert.equal(resumed.projection.counters.liveHttpRequestCount, 6);
    assert.equal(resumed.projection.counters.getRequestCount, 5);
    assert.equal(resumed.projection.counters.postRequestCount, 1);
    assert.equal(resumed.projection.counters.boundedCheckoutRedirectCount, 3);
    assert.equal(resumed.projection.counters.contactPostAttemptCount, 0);
    assert.equal(resumed.projection.counters.addressQuotePostCount, 1);
    assert.deepEqual(resumeCalls.filter((call) => call.method === "POST")
      .map((call) => call.action), ["save_two"]);
    assert.equal(resumed.routeEvidence.facts.capacity.status, "UNRESERVED");
    assert.equal(resumed.routeEvidence.facts.capacity.sourceClass,
      "SELLER_SERVER_ACK_ONLY");
    assert.deepEqual(readFileSync(prior.publicArtifact.file),
      priorProjectionBytes);
    assert.deepEqual(readFileSync(prior.privateManifestArtifact.file),
      priorManifestBytes);
    assert.deepEqual(readFileSync(priorCookieFile), priorCookieBytes);
    const publicBytes = readFileSync(resumed.publicArtifact.file, "utf8")
      + readFileSync(resumed.routeEvidenceArtifact.file, "utf8");
    for (const secret of [PRIVATE_STREET, PRIVATE_EMAIL, PRIVATE_PHONE,
      PRIVATE_POSTAL, "fixture-cookie"]) {
      assert.equal(publicBytes.includes(secret), false);
    }
    for (const field of ["shippingMethodApplied", "paymentPerformed",
      "orderSubmitted", "marketingSubscriptionPerformed", "capacityReserved",
      "independentOutcomeTruthEstablished", "userResultCommitted"]) {
      assert.equal(resumed.projection[field], false);
    }
    let replayProviderCalls = 0;
    await assert.rejects(() => runAdafruitAddressQuoteResumeLiveV6({
      priorRunDirectory: prior.runDirectory,
      inputFile: value.result.input.absolute,
      residualGrantFile: residual.output.absolute,
      privateRoot: path.join(value.directory, "continuation"),
      observedAt: NOW,
      nonce: "11111111111111111111111111111111",
      fetchImpl: async () => { replayProviderCalls += 1; },
    }), /RESIDUAL_GRANT_ALREADY_USED/u);
    assert.equal(replayProviderCalls, 0);
  });

test("v7 reconciles an address-persisted ambiguous v6 attempt with only two read-only Step 3 GETs",
  async (t) => {
    const value = reissue(t);
    const prior = await runAdafruitFullAddressShippingQuoteLiveV5({
      inputFile: value.result.input.absolute,
      grantFile: value.result.grant.absolute,
      privateRoot: value.directory,
      observedAt: NOW,
      nonce: NONCE,
      fetchImpl: provider([], { failAfterContact: true }),
    });
    const residual = reissueAdafruitAddressQuoteResidualGrantV6({
      priorRunDirectory: prior.runDirectory,
      inputFile: value.result.input.absolute,
      outputGrantFile: path.join(value.directory, "residual-grant-v6.json"),
      authorizedAt: NOW,
      expiresAt: EXPIRY,
    });
    const partialRoot = path.join(value.directory, "partial-v6");
    const partialNonce = "22222222222222222222222222222222";
    const partialCalls = [];
    let addressSubmitted = false;
    const interruptedProvider = async (url, init) => {
      const target = new URL(url);
      const body = init.body === undefined ? ""
        : Buffer.from(init.body).toString("utf8");
      const fields = new URLSearchParams(body);
      partialCalls.push({ method: init.method, pathname: target.pathname,
        search: target.search, action: fields.get("action") });
      assert.equal(init.headers.cookie, "adafruit_session=fixture-cookie");
      assert.equal(target.pathname, "/checkout");
      if (init.method === "GET" && target.search === "") {
        return html("", 302, { location: addressSubmitted
          ? "checkout?step=3" : "checkout?step=2" });
      }
      if (init.method === "GET" && target.search === "?step=2") {
        return html(addressPage());
      }
      if (init.method === "POST") {
        assert.equal(fields.get("action"), "save_two");
        assert.equal(fields.get("email_address"), null);
        assert.equal(fields.get("ship_address1"), PRIVATE_STREET);
        assert.equal(fields.get("ship_phone"), PRIVATE_PHONE);
        addressSubmitted = true;
        return html("", 303, { location: "checkout?step=3" });
      }
      if (init.method === "GET" && target.search === "?step=3") {
        throw new Error("injected receipt-read interruption after save_two");
      }
      throw new Error(`unexpected partial-v6 ${init.method} ${target.href}`);
    };
    await assert.rejects(() => runAdafruitAddressQuoteResumeLiveV6({
      priorRunDirectory: prior.runDirectory,
      inputFile: value.result.input.absolute,
      residualGrantFile: residual.output.absolute,
      privateRoot: partialRoot,
      observedAt: NOW,
      nonce: partialNonce,
      fetchImpl: interruptedProvider,
    }), /HOLD_AMBIGUOUS_NO_RETRY/u);
    assert.deepEqual(partialCalls.map((call) =>
      `${call.method} ${call.pathname}${call.search}`), [
      "GET /checkout", "GET /checkout?step=2", "GET /checkout",
      "GET /checkout?step=2", "POST /checkout", "GET /checkout?step=3",
    ]);
    assert.deepEqual(partialCalls.filter((call) => call.method === "POST")
      .map((call) => call.action), ["save_two"]);
    const partialRun = path.join(partialRoot,
      `adafruit-address-quote-resume-v6-20260904-${partialNonce}`);
    const priorResidualUseFile = path.join(partialRoot,
      "adafruit-address-residual-grant-use-v6",
      `${residual.output.bytesHash.slice(7)}.json`);
    const partialBefore = new Map(privateTree(partialRun).map((file) => [
      path.relative(partialRun, file), readFileSync(file),
    ]));
    assert.equal(partialBefore.size, 4);
    const readOnlyGrant
      = reissueAdafruitStep3ReceiptReconciliationGrantV7({
        priorV5RunDirectory: prior.runDirectory,
        partialV6RunDirectory: partialRun,
        inputFile: value.result.input.absolute,
        priorResidualGrantFile: residual.output.absolute,
        priorResidualUseFile,
        outputGrantFile: path.join(value.directory,
          "step3-read-only-grant-v7.json"),
        authorizedAt: NOW,
        expiresAt: EXPIRY,
      });
    assert.equal((lstatSync(readOnlyGrant.output.absolute).mode & 0o777),
      0o600);
    assert.match(readOnlyGrant.partialContinuationTreeHash,
      /^sha256:[a-f0-9]{64}$/u);

    const reconcileCalls = [];
    const reconciler = async (url, init) => {
      const target = new URL(url);
      reconcileCalls.push({ method: init.method, href: target.href,
        bodyPresent: init.body !== undefined });
      assert.equal(init.method, "GET");
      assert.equal(init.body, undefined);
      assert.equal(init.headers.cookie, "adafruit_session=fixture-cookie");
      if (target.href === "https://www.adafruit.com/checkout") {
        return html("", 302, { location: "checkout?step=3" });
      }
      if (target.href === "https://www.adafruit.com/checkout?step=3") {
        return html(ratePage());
      }
      throw new Error(`unexpected v7 ${target.href}`);
    };
    const v7Root = path.join(value.directory, "receipt-v7");
    const reconciled = await runAdafruitStep3ReceiptReconcileLiveV7({
      priorV5RunDirectory: prior.runDirectory,
      partialV6RunDirectory: partialRun,
      inputFile: value.result.input.absolute,
      priorResidualGrantFile: residual.output.absolute,
      priorResidualUseFile,
      readOnlyGrantFile: readOnlyGrant.output.absolute,
      privateRoot: v7Root,
      observedAt: NOW,
      nonce: "33333333333333333333333333333333",
      fetchImpl: reconciler,
    });
    assert.deepEqual(reconcileCalls, [
      { method: "GET", href: "https://www.adafruit.com/checkout",
        bodyPresent: false },
      { method: "GET", href: "https://www.adafruit.com/checkout?step=3",
        bodyPresent: false },
    ]);
    assert.equal(reconciled.projection.counters.liveHttpRequestCount, 2);
    assert.equal(reconciled.projection.counters.getRequestCount, 2);
    assert.equal(reconciled.projection.counters.postRequestCount, 0);
    assert.equal(reconciled.projection.counters.contactPostAttemptCount, 0);
    assert.equal(reconciled.projection.counters.addressQuotePostCount, 0);
    assert.equal(reconciled.projection.counters
      .shippingMethodApplyAttemptCount, 0);
    assert.equal(reconciled.projection.allInTotalMinor, 1156);
    assert.equal(reconciled.projection.allInTotalProven, true);
    assert.equal(reconciled.projection.structuredEtaObserved, true);
    assert.equal(reconciled.projection.deliveryDeadlineProven, true);
    assert.equal(reconciled.projection.predecessor.addressEffectReplayed,
      false);
    assert.equal(reconciled.routeEvidence.facts.specification.status, "MATCH");
    assert.equal(reconciled.routeEvidence.facts.allInPrice.status, "COMPLETE");
    assert.equal(reconciled.routeEvidence.facts.allInPrice.allInMinorUnits,
      1156);
    assert.equal(reconciled.routeEvidence.facts.eta.status, "STRUCTURED");
    assert.equal(reconciled.routeEvidence.facts.eta.estimatedCompletionAt,
      "2026-09-08T23:59:59.999Z");
    assert.equal(reconciled.routeEvidence.facts.capacity.status, "UNRESERVED");
    assert.equal(reconciled.routeEvidence.facts.capacity.sourceClass,
      "SELLER_SERVER_ACK_ONLY");
    for (const [relative, bytes] of partialBefore) {
      assert.deepEqual(readFileSync(path.join(partialRun, relative)), bytes);
    }
    const publicBytes = readFileSync(reconciled.publicArtifact.file, "utf8")
      + readFileSync(reconciled.routeEvidenceArtifact.file, "utf8");
    for (const secret of [PRIVATE_STREET, PRIVATE_EMAIL, PRIVATE_PHONE,
      PRIVATE_POSTAL, "Exampleville", "fixture-cookie"]) {
      assert.equal(publicBytes.includes(secret), false);
    }
    const neutralEvidenceBytes = readFileSync(
      reconciled.routeEvidenceArtifact.file, "utf8");
    for (const sellerSpecific of ["4474", "ADAFRUIT", "adafruit.com"]) {
      assert.equal(neutralEvidenceBytes.includes(sellerSpecific), false);
    }
    for (const field of ["shippingMethodApplied", "paymentPerformed",
      "orderSubmitted", "marketingSubscriptionPerformed", "capacityReserved",
      "independentOutcomeTruthEstablished", "userResultCommitted"]) {
      assert.equal(reconciled.projection[field], false);
    }
    let replayCalls = 0;
    await assert.rejects(() => runAdafruitStep3ReceiptReconcileLiveV7({
      priorV5RunDirectory: prior.runDirectory,
      partialV6RunDirectory: partialRun,
      inputFile: value.result.input.absolute,
      priorResidualGrantFile: residual.output.absolute,
      priorResidualUseFile,
      readOnlyGrantFile: readOnlyGrant.output.absolute,
      privateRoot: v7Root,
      observedAt: NOW,
      nonce: "44444444444444444444444444444444",
      fetchImpl: async () => { replayCalls += 1; },
    }), /READ_ONLY_GRANT_ALREADY_USED/u);
    assert.equal(replayCalls, 0);
  });

test("v8 captures the real sibling-label Step 3 DOM before parsing and preserves partial price and unavailable ETA",
  async (t) => {
    const value = reissue(t);
    const prior = await runAdafruitFullAddressShippingQuoteLiveV5({
      inputFile: value.result.input.absolute,
      grantFile: value.result.grant.absolute,
      privateRoot: value.directory,
      observedAt: NOW,
      nonce: NONCE,
      fetchImpl: provider([], { failAfterContact: true }),
    });
    const residual = reissueAdafruitAddressQuoteResidualGrantV6({
      priorRunDirectory: prior.runDirectory,
      inputFile: value.result.input.absolute,
      outputGrantFile: path.join(value.directory, "residual-v6.json"),
      authorizedAt: NOW,
      expiresAt: EXPIRY,
    });
    const v6Root = path.join(value.directory, "partial-v6-for-v8");
    const v6Nonce = "77777777777777777777777777777777";
    let addressSubmitted = false;
    await assert.rejects(() => runAdafruitAddressQuoteResumeLiveV6({
      priorRunDirectory: prior.runDirectory,
      inputFile: value.result.input.absolute,
      residualGrantFile: residual.output.absolute,
      privateRoot: v6Root,
      observedAt: NOW,
      nonce: v6Nonce,
      fetchImpl: async (url, init) => {
        const target = new URL(url);
        const fields = new URLSearchParams(init.body === undefined ? ""
          : Buffer.from(init.body).toString("utf8"));
        assert.equal(init.headers.cookie, "adafruit_session=fixture-cookie");
        if (init.method === "GET" && target.search === "") {
          return html("", 302, { location: addressSubmitted
            ? "checkout?step=3" : "checkout?step=2" });
        }
        if (init.method === "GET" && target.search === "?step=2") {
          return html(addressPage());
        }
        if (init.method === "POST" && fields.get("action") === "save_two") {
          addressSubmitted = true;
          return html("", 303, { location: "checkout?step=3" });
        }
        if (init.method === "GET" && target.search === "?step=3") {
          throw new Error("injected post-address receipt interruption");
        }
        throw new Error(`unexpected v6-for-v8 ${init.method} ${target.href}`);
      },
    }), /HOLD_AMBIGUOUS_NO_RETRY/u);
    const partialV6Run = path.join(v6Root,
      `adafruit-address-quote-resume-v6-20260904-${v6Nonce}`);
    const residualUse = path.join(v6Root,
      "adafruit-address-residual-grant-use-v6",
      `${residual.output.bytesHash.slice(7)}.json`);
    const v7Grant = reissueAdafruitStep3ReceiptReconciliationGrantV7({
      priorV5RunDirectory: prior.runDirectory,
      partialV6RunDirectory: partialV6Run,
      inputFile: value.result.input.absolute,
      priorResidualGrantFile: residual.output.absolute,
      priorResidualUseFile: residualUse,
      outputGrantFile: path.join(value.directory, "read-v7.json"),
      authorizedAt: NOW,
      expiresAt: EXPIRY,
    });
    const v7Root = path.join(value.directory, "parser-mismatch-v7");
    const v7Nonce = "88888888888888888888888888888888";
    const siblingProvider = async (url, init) => {
      const target = new URL(url);
      assert.equal(init.method, "GET");
      assert.equal(init.body, undefined);
      assert.equal(init.headers.cookie, "adafruit_session=fixture-cookie");
      if (target.search === "") {
        return html("", 302, { location: "checkout?step=3" });
      }
      if (target.search === "?step=3") return html(realSiblingRatePage());
      throw new Error(`unexpected sibling source ${target.href}`);
    };
    await assert.rejects(() => runAdafruitStep3ReceiptReconcileLiveV7({
      priorV5RunDirectory: prior.runDirectory,
      partialV6RunDirectory: partialV6Run,
      inputFile: value.result.input.absolute,
      priorResidualGrantFile: residual.output.absolute,
      priorResidualUseFile: residualUse,
      readOnlyGrantFile: v7Grant.output.absolute,
      privateRoot: v7Root,
      observedAt: NOW,
      nonce: v7Nonce,
      fetchImpl: siblingProvider,
    }), /STEP3_SHIPPING_RATES_NOT_OBSERVED/u);
    const partialV7Run = path.join(v7Root,
      `adafruit-step3-receipt-reconcile-v7-20260904-${v7Nonce}`);
    assert.equal(privateTree(partialV7Run).length, 1);
    const v7Use = path.join(v7Root,
      "adafruit-step3-receipt-reconciliation-grant-use-v7",
      `${v7Grant.output.bytesHash.slice(7)}.json`);
    const partialV7Before = new Map(privateTree(partialV7Run).map((file) => [
      path.relative(partialV7Run, file), readFileSync(file),
    ]));
    const common = {
      priorV5RunDirectory: prior.runDirectory,
      partialV6RunDirectory: partialV6Run,
      inputFile: value.result.input.absolute,
      priorResidualGrantFile: residual.output.absolute,
      priorResidualUseFile: residualUse,
      priorV7GrantFile: v7Grant.output.absolute,
      priorV7UseFile: v7Use,
      partialV7RunDirectory: partialV7Run,
    };
    const v8Grant = reissueAdafruitStep3ReceiptReconciliationGrantV8({
      ...common,
      outputGrantFile: path.join(value.directory, "read-v8.json"),
      authorizedAt: NOW,
      expiresAt: EXPIRY,
    });
    const calls = [];
    const v8Root = path.join(value.directory, "receipt-v8");
    const result = await runAdafruitStep3ReceiptReconcileLiveV8({
      ...common,
      readOnlyGrantFile: v8Grant.output.absolute,
      privateRoot: v8Root,
      observedAt: NOW,
      nonce: "99999999999999999999999999999999",
      fetchImpl: async (url, init) => {
        calls.push({ url, method: init.method, body: init.body });
        return siblingProvider(url, init);
      },
    });
    assert.equal(calls.length, 2);
    assert.equal(calls.every((call) => call.method === "GET"
      && call.body === undefined), true);
    assert.equal(result.projection.quote.rates.length, 7);
    assert.deepEqual(result.projection.quote.rates.map((rate) =>
      rate.amountMinor), [869, 1869, 1911, 2137, 4286, 593, 925]);
    assert.equal(result.projection.quote.selectedShippingMinor, 869);
    assert.equal(result.projection.quote.subtotalMinor, 495);
    assert.equal(result.projection.quote.destinationTaxMinor, 31);
    assert.equal(result.projection.quote.displayedTotalMinor, null);
    assert.equal(result.projection.quote.componentSumMinor, 1395);
    assert.equal(result.projection.quote.allInTotalMinor, 1395);
    assert.equal(result.projection.quote.allInTotalProven, false);
    assert.equal(result.projection.allInEvidenceStatus, "PARTIAL");
    assert.equal(result.projection.budgetSatisfied, null);
    assert.equal(result.projection.structuredEtaObserved, false);
    assert.equal(result.projection.deliveryDeadlineProven, false);
    assert.equal(result.projection.etaEvidenceStatus, "UNAVAILABLE");
    assert.equal(result.routeEvidence.facts.allInPrice.status, "PARTIAL");
    assert.equal(result.routeEvidence.facts.allInPrice.allInMinorUnits, 1395);
    assert.equal(result.routeEvidence.facts.allInPrice
      .includesItemTaxShippingAndFees, false);
    assert.equal(result.routeEvidence.facts.eta.status, "UNAVAILABLE");
    assert.equal(result.routeEvidence.facts.eta.estimatedCompletionAt, null);
    assert.equal(result.routeEvidence.facts.capacity.status, "UNRESERVED");
    assert.equal(result.projection.counters.getRequestCount, 2);
    assert.equal(result.projection.counters.postRequestCount, 0);
    for (const [relative, bytes] of partialV7Before) {
      assert.deepEqual(readFileSync(path.join(partialV7Run, relative)), bytes);
    }
    for (const secret of [PRIVATE_STREET, PRIVATE_EMAIL, PRIVATE_PHONE,
      PRIVATE_POSTAL, "Exampleville", "fixture-cookie"]) {
      assert.equal(readFileSync(result.publicArtifact.file, "utf8")
        .includes(secret), false);
      assert.equal(readFileSync(result.routeEvidenceArtifact.file, "utf8")
        .includes(secret), false);
    }
    for (const field of ["shippingMethodApplied", "paymentPerformed",
      "orderSubmitted", "marketingSubscriptionPerformed", "capacityReserved",
      "independentOutcomeTruthEstablished", "userResultCommitted"]) {
      assert.equal(result.projection[field], false);
    }

    const failureObservedAt = "2026-09-04T23:30:00.001Z";
    const failureGrant = reissueAdafruitStep3ReceiptReconciliationGrantV8({
      ...common,
      outputGrantFile: path.join(value.directory, "read-failure-v8.json"),
      authorizedAt: failureObservedAt,
      expiresAt: EXPIRY,
    });
    const failureNonce = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    await assert.rejects(() => runAdafruitStep3ReceiptReconcileLiveV8({
      ...common,
      readOnlyGrantFile: failureGrant.output.absolute,
      privateRoot: v8Root,
      observedAt: failureObservedAt,
      nonce: failureNonce,
      fetchImpl: async (url, init) => {
        const target = new URL(url);
        if (target.search === "") {
          return html("", 302, { location: "checkout?step=3" });
        }
        return html("<!doctype html><main>rates absent</main>");
      },
    }), /STEP3_SIBLING_SHIPPING_RATES_NOT_OBSERVED/u);
    const failureRun = path.join(v8Root,
      `adafruit-step3-receipt-reconcile-v8-20260904-${failureNonce}`);
    for (const name of ["checkout-step3-response.v8.bin",
      "checkout-step3-headers.v8.json", "private-source-capture.v8.json",
      "bounded-failure-manifest.v8.json"]) {
      const file = path.join(failureRun, name);
      assert.equal((lstatSync(file).mode & 0o777), 0o600);
    }
    const failure = JSON.parse(readFileSync(path.join(failureRun,
      "bounded-failure-manifest.v8.json"), "utf8"));
    assert.equal(failure.sourceBytesPersistedBeforeParse, true);
    assert.equal(failure.sourceHeadersPersistedBeforeParse, true);
    assert.equal(failure.postPerformed, false);
    assert.equal(failure.retryAutomaticallyPermitted, false);
  });
