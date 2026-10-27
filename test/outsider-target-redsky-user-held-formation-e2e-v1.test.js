import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { formationJobIdentityV1 }
  from "../src/outsider-formation-job-worker-v1.js";
import { createTargetRedskyFormationNodeCompositionV1 }
  from "../src/outsider-target-redsky-formation-node-composition-v1.js";
import { runUserHeldFormationExecutorOnceV1 }
  from "../src/outsider-user-held-formation-executor-client-v1.js";
import {
  createMemoryUserHeldFormationLeaseBrokerV1,
  deriveUserHeldFormationExecutorCapabilityHashV1,
}
  from "../src/outsider-user-held-formation-executor-protocol-v1.js";

const NOW = "2026-09-04T21:30:00.000Z";
const POSTAL = "02139";
const LATITUDE = 42.36;
const LONGITUDE = -71.10;
const TOKEN = "test-only-target-user-held-executor-token-000001";
const h = (value) => `sha256:${createHash("sha256")
  .update(value).digest("hex")}`;

function root(t) {
  const value = mkdtempSync(path.join(tmpdir(), "outsider-target-user-node-"));
  chmodSync(value, 0o700);
  t.after(() => rmSync(value, { recursive: true, force: true }));
  return value;
}

function writePrivate(directory, name, value) {
  const file = path.join(directory, name);
  writeFileSync(file, `${canonicalizeStrict(value)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

function inputs(directory) {
  const outcome = writePrivate(directory, "outcome.json", {
    schema:
      "outsider/private-first-physical-outcome-destination-formation-request/v2",
    schemaVersion: "2.0.0",
    destination: { postalCode: POSTAL, region: "MA" },
  });
  const query = new URLSearchParams({
    key: "9f36aeafbe60771e321a7cc95a78140772ab3e96",
    tcin: "91252434",
    zip: POSTAL,
    state: "MA",
    latitude: String(LATITUDE),
    longitude: String(LONGITUDE),
    pricing_store_id: "2822",
    store_id: "2822",
  });
  const route = writePrivate(directory, "route.json", {
    sources: [{ method: "GET",
      url: `https://redsky.target.com/redsky_aggregations/v1/web/product_fulfillment_v1?${query}` }],
  });
  const productState = writePrivate(directory, "product-state.json", {
    schema: "outsider/first-physical-formation-product-state/v2",
    schemaVersion: "2.0.0",
    productStateHash: h("frozen-physical-product-state"),
    product: {
      outcomeKind: "PHYSICAL_GOODS_DELIVERY",
      exactItem: {
        condition: "NEW",
        connectorA: "USB_A_MALE",
        connectorB: "USB_C_MALE",
        dataRequired: true,
        fiveVoltPowerRequired: true,
        minimumLengthMm: 900,
        maximumLengthMm: 1100,
        quantity: 1,
      },
    },
  });
  return { outcome, route, productState };
}

function productSource({ explicit5v = false, threshold = 35 } = {}) {
  return Buffer.from(JSON.stringify({ data: { product: {
    tcin: "91252434",
    free_shipping: { enabled: false },
    item: {
      primary_barcode: "810212674155",
      cart_add_on_threshold: threshold,
      product_description: {
        title: "3 foot USB-A to USB-C cable",
        bullet_descriptions: [
          "<B>Cable/Cord Length:</B> 3 Feet",
          "<B>Connection Type:</B> USB-C",
          "<B>Connection Gender:</B> Male-To-Male",
          "<B>Connection Types 2:</B> USB-A",
        ],
        downstream_description: explicit5v
          ? "Cable for charging at 5V and data transfer."
          : "Cable for charging and data transfer.",
        soft_bullets: { bullets: ["USB-A to USB-C cord"] },
      },
    },
    price: { current_retail: 5.99, formatted_current_price: "$5.99" },
  } } }), "utf8");
}

function fulfillmentSource() {
  return Buffer.from(JSON.stringify({ data: { product: {
    tcin: "91252434",
    pay_per_order_charges: { one_day: 7.99, scheduled_delivery: 9.99 },
    fulfillment: { shipping_options: {
      availability_status: "IN_STOCK",
      available_to_promise_quantity: 10,
      services: [{
        is_two_day_shipping: true,
        is_base_shipping_method: true,
        shipping_method_id: "STANDARD",
        cutoff: "2026-09-04T23:00:00Z",
        min_delivery_date: "2026-09-06",
        max_delivery_date: "2026-09-06",
        shipping_method_short_description: "Standard",
        service_level_description: "2-day shipping",
      }],
    } },
  } } }), "utf8");
}

function providerFetch(requests, product = productSource()) {
  return async (url, init) => {
    const parsed = new URL(url);
    requests.push({ url: String(url), method: init.method,
      headers: Object.fromEntries(new Headers(init.headers)) });
    assert.equal(parsed.origin, "https://redsky.target.com");
    assert.equal(init.method, "GET");
    assert.equal(init.body, undefined);
    assert.equal(init.credentials, "omit");
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers.authorization, undefined);
    assert.doesNotMatch(parsed.pathname, /cart|checkout|payment|order/iu);
    const body = parsed.pathname.endsWith("pdp_client_v1")
      ? product : fulfillmentSource();
    return new Response(body, { status: 200,
      headers: { "content-type": "application/json; charset=utf-8" } });
  };
}

function composition(privateRoot, input, fetchImpl) {
  return createTargetRedskyFormationNodeCompositionV1({
    orderId: "order:target-user-node-0001",
    outcomeProgramHash: h("physical-outcome"),
    graphRefs: {
      principalEpochHash: h("principal"),
      accountableDeploymentHash: h("deployment"),
      runtimeOrEmbodimentHash: h("runtime"),
      delegationHash: h("delegation"),
      episodeHash: h("episode"),
      attemptHash: h("new-target-attempt"),
    },
    outcomeInputFile: input.outcome,
    priorRouteBindingFile: input.route,
    frozenProductStateFile: input.productState,
    privateRoot,
    issuedAt: "2026-09-04T21:00:00.000Z",
    expiresAt: "2026-09-04T22:00:00.000Z",
  }, { fetchImpl, clock: () => NOW });
}

function json(value) {
  return new Response(`${JSON.stringify(value)}\n`, { status: 200,
    headers: { "content-type": "application/json" } });
}

function centralFetch(broker, bodies) {
  return async (url, init) => {
    assert.equal(new URL(url).origin, "https://formation.example");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.authorization, `Bearer ${TOKEN}`);
    const raw = String(init.body);
    bodies.push(raw);
    const body = JSON.parse(raw);
    if (new URL(url).pathname === "/v1/client-execution-claims") {
      return json(broker.claim(body));
    }
    return json(broker.complete(body));
  };
}

test("Target becomes a true user-held second route and rejects the real requirement gap without PII leakage",
  async (t) => {
    const directory = root(t);
    const input = inputs(directory);
    const providerRequests = [];
    const privateComposition = composition(directory, input,
      providerFetch(providerRequests));
    const privateIdentity = formationJobIdentityV1(privateComposition.job);
    const key = Buffer.alloc(32, 0x74);
    const binding = privateComposition.createUserHeldBinding(key);
    assert.notEqual(binding.job.parameterEnvelopeHash,
      privateComposition.job.parameterEnvelopeHash);
    assert.equal(binding.job.graphRefs.attemptHash,
      h("new-target-attempt"));

    const broker = createMemoryUserHeldFormationLeaseBrokerV1({
      clock: () => NOW,
    });
    const capabilityHash = deriveUserHeldFormationExecutorCapabilityHashV1({
      bearerToken: TOKEN,
      jobHash: binding.jobHash,
    });
    broker.enqueue(binding.job, capabilityHash);
    const centralBodies = [];
    const result = await runUserHeldFormationExecutorOnceV1({
      centralOrigin: "https://formation.example",
      bearerToken: TOKEN,
      executorCapabilityHash: capabilityHash,
      binding,
    }, { fetchImpl: centralFetch(broker, centralBodies), clock: () => NOW });

    assert.equal(result.state, "COMPLETE");
    assert.equal(result.executionPerformed, true);
    assert.equal(providerRequests.length, 2);
    assert.equal(providerRequests.every((request) => request.method === "GET"),
      true);
    const privateResult = await privateComposition.executor.executeFrozenPlan({
      job: privateIdentity.job,
      jobHash: privateIdentity.jobHash,
      jobKey: privateIdentity.jobKey,
    });
    assert.equal(privateResult.state, "UNAVAILABLE");
    assert.equal(privateResult.reasonCode,
      "TARGET_EXACT_PRODUCT_REQUIREMENTS_UNPROVEN");
    assert.equal(privateResult.externalEffect, "READ_ONLY");
    assert.equal(privateResult.sourceOccurrenceHashes.length, 2);
    assert.equal(providerRequests.length, 2);

    const centralText = JSON.stringify({ bodies: centralBodies,
      binding: binding.publicProjection, state: broker.read(binding.jobKey) });
    for (const privateValue of [POSTAL, String(LATITUDE), String(LONGITUDE),
      privateComposition.job.parameterEnvelopeHash,
      privateResult.resultHash, ...privateResult.sourceOccurrenceHashes]) {
      assert.equal(centralText.includes(privateValue), false,
        `central projection leaked ${privateValue}`);
    }
    assert.equal(centralText.includes("EXPLICIT_5V_SOURCE_STATEMENT_MISSING"),
      false);
    assert.equal(result.authorityMinted, false);
    assert.equal(result.independentOutcomeTruthEstablished, false);
    assert.equal(result.outcomeCommitted, false);

    const restartedRequests = [];
    const restarted = composition(directory, input, async () => {
      restartedRequests.push("unexpected");
      throw new Error("provider I/O forbidden during replay");
    });
    const restartedBinding = restarted.createUserHeldBinding(key);
    const restartedBroker = createMemoryUserHeldFormationLeaseBrokerV1({
      clock: () => NOW,
    });
    restartedBroker.enqueue(restartedBinding.job, capabilityHash);
    const replay = await runUserHeldFormationExecutorOnceV1({
      centralOrigin: "https://formation.example",
      bearerToken: TOKEN,
      executorCapabilityHash: capabilityHash,
      binding: restartedBinding,
    }, { fetchImpl: centralFetch(restartedBroker, []), clock: () => NOW });
    assert.equal(replay.executionPerformed, true);
    assert.equal(restartedRequests.length, 0);
    assert.equal(replay.resultHash, result.resultHash);
  });

test("Target v3 preserves structured ATP and deadline evidence even when no capacity exists",
  async (t) => {
    const directory = root(t);
    const input = inputs(directory);
    const requests = [];
    const candidate = composition(directory, input,
      providerFetch(requests, productSource({ explicit5v: true, threshold: 10 })));
    const identity = formationJobIdentityV1(candidate.job);
    const result = await candidate.executor.executeFrozenPlan({
      job: identity.job, jobHash: identity.jobHash, jobKey: identity.jobKey,
    });
    assert.equal(result.state, "HOLD");
    assert.equal(result.reasonCode,
      "TARGET_OBSERVATION_HAS_NO_CAPACITY_OR_ALL_IN_TOTAL");
    assert.equal(result.externalEffect, "READ_ONLY");
    assert.equal(requests.length, 2);
    const projectionDirectory = path.join(directory,
      `target-redsky-read-only-live-v2-20260904-${createHash("sha256")
        .update(identity.jobKey, "utf8").digest("hex").slice(0, 32)}`);
    const projection = JSON.parse(readFileSync(path.join(projectionDirectory,
      "route-assessment.public-projection.v3.json"), "utf8"));
    assert.equal(projection.structuredSellerEvidence.availabilityStatus,
      "IN_STOCK");
    assert.equal(projection.structuredSellerEvidence.availableToPromiseQuantity,
      10);
    assert.equal(projection.structuredSellerEvidence
      .sourceDateMeetsRequestedDeadline, true);
    assert.equal(projection.routeAssessment.capacityReserved, false);
    assert.equal(projection.routeAssessment.commitEligible, false);
    assert.deepEqual(projection.externalEffects, {
      publicReadRequests: 2,
      accountOnlySameDayRequests: 0,
      cartMutations: 0,
      checkoutSubmissions: 0,
      paymentAttempts: 0,
      orderSubmissions: 0,
    });
    const publicText = JSON.stringify(projection);
    assert.equal(publicText.includes(POSTAL), false);
    assert.equal(publicText.includes(String(LATITUDE)), false);
    assert.equal(publicText.includes(String(LONGITUDE)), false);
  });
