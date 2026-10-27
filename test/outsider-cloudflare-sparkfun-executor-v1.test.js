import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  compileCloudflareSparkFunExecutorDeploymentV1,
  createCloudflareSparkFunExecutorV1,
  createMemoryCloudflareSparkFunExecutorStoreV1,
  OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_BOUNDARY,
} from "../src/outsider-cloudflare-sparkfun-executor-v1.js";
import {
  createFormationJobWorkerV1,
  createMemoryFormationJobStoreV1,
  formationJobIdentityV1,
} from "../src/outsider-formation-job-worker-v1.js";
import sparkFunWorker
  from "../deploy/cloudflare-sparkfun-executor-v1/src/worker.mjs";

const NOW = "2099-01-01T12:00:00.000Z";
const CART = "maskedCloudflareSparkFunCart0001";
const STREET = "700 Private Executor Avenue";
const EMAIL = "private-executor@example.invalid";
const PHONE = "+1 555 010 7070";
const h = (value) => `sha256:${createHash("sha256")
  .update(value, "utf8").digest("hex")}`;

function graphRefs() {
  return { principalEpochHash: h("principal"),
    accountableDeploymentHash: h("deployment"),
    runtimeOrEmbodimentHash: h("runtime"), delegationHash: h("delegation"),
    episodeHash: h("episode"), attemptHash: h("attempt") };
}

function privateEnvelopeBytes() {
  const value = {
    schema: "outsider/private-sparkfun-full-address-prepayment-run-request/v1",
    schemaVersion: "1.0.0",
    product: { catalogPath: "/usb-3-1-cable-a-to-c-3-foot.html",
      productId: "4636", sku: "CAB-14743", quantity: 1 },
    destination: { firstName: "Private", lastName: "Executor", email: EMAIL,
      telephone: PHONE, countryCode: "US", regionId: 25,
      region: "Massachusetts", regionCode: "MA", city: "Exampleville",
      postalCode: "02139", streetLines: [STREET, "Test Suite"] },
    budget: { currency: "USD", maximumAmountMinor: "2000" },
    completionDeadline: "2099-01-03T00:00:00.000Z",
    formationExpiresAt: "2099-01-01T13:00:00.000Z",
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function deployment() {
  return compileCloudflareSparkFunExecutorDeploymentV1({
    orderId: "order:cloudflare-sparkfun-0001",
    outcomeProgramHash: h("outcome-program"),
    graphRefs: graphRefs(),
    privateEnvelopeBytes: privateEnvelopeBytes(),
    issuedAt: "2099-01-01T11:00:00.000Z",
    expiresAt: "2099-01-01T12:30:00.000Z",
  });
}

function response(value, contentType = "application/json") {
  return new Response(contentType === "application/json"
    ? JSON.stringify(value) : value, { status: 200,
    headers: { "content-type": contentType, date: NOW } });
}

function provider(calls) {
  let shipping = false;
  const cart = () => ({ id: 1, is_active: true,
    items: [{ item_id: 2, sku: "CAB-14743", qty: 1, price: 7.95 }],
    items_count: 1, items_qty: 1 });
  const totals = () => ({ grand_total: shipping ? 19.83 : 7.95,
    subtotal: 7.95, shipping_amount: shipping ? 11.19 : 0,
    tax_amount: shipping ? 0.69 : 0, items_qty: 1,
    quote_currency_code: "USD" });
  return async (url, init) => {
    const parsed = new URL(url);
    calls.push({ method: init.method, path: parsed.pathname,
      body: init.body === null ? null : Buffer.from(init.body) });
    assert.equal(parsed.origin, "https://www.sparkfun.com");
    if (parsed.pathname.endsWith(".html")) {
      const catalog = { "*": { "Magento_Catalog/js/product/view/provider": {
        data: { items: { "4636": { id: 4636, name: "USB Cable",
          price_info: { final_price: 7.95 }, currency_code: "USD",
          is_salable: "1", is_available: true } } } } } };
      const context = { productId: 4636, sku: "CAB-14743",
        updatedAt: NOW };
      return response(`<script type="text/x-magento-init">${JSON.stringify(
        catalog)}</script><script>magentoStorefrontEvents.context.setProduct(${JSON.stringify(
        context)})</script>`, "text/html");
    }
    if (parsed.pathname === "/rest/V1/guest-carts") return response(CART);
    if (parsed.pathname.endsWith("/items") && init.method === "POST") {
      return response({ item_id: 2, sku: "CAB-14743", qty: 1, price: 7.95 });
    }
    if (parsed.pathname.endsWith("/estimate-shipping-methods")) {
      const address = JSON.parse(Buffer.from(init.body).toString()).address;
      assert.deepEqual(address.street, [STREET, "Test Suite"]);
      assert.equal(address.email, EMAIL);
      return response([{ carrier_code: "ups", method_code: "03",
        carrier_title: "UPS", method_title: "Ground", amount: 11.19,
        available: true }]);
    }
    if (parsed.pathname.endsWith("/shipping-information")) {
      const input = JSON.parse(Buffer.from(init.body).toString());
      assert.equal(input.addressInformation.shipping_address.telephone, PHONE);
      shipping = true;
      return response({ payment_methods: [{ code: "braintree", title: "Card" }],
        totals: totals() });
    }
    if (parsed.pathname.endsWith("/totals")) return response(totals());
    if (/\/guest-carts\/[^/]+$/u.test(parsed.pathname)) return response(cart());
    throw new Error(`unexpected ${init.method} ${parsed.pathname}`);
  };
}

test("Formation Worker service binding executes the Cloudflare SparkFun machine path once",
  async () => {
    const compiled = deployment();
    const requests = [];
    const store = createMemoryCloudflareSparkFunExecutorStoreV1();
    const executor = createCloudflareSparkFunExecutorV1({
      registration: compiled.registration,
      privateEnvelopeSecretBase64: compiled.privateEnvelopeSecretBase64,
      store,
      fetchImpl: provider(requests),
      clock: () => NOW,
    });
    const worker = createFormationJobWorkerV1({
      store: createMemoryFormationJobStoreV1(),
      executorResolver: async (binding) => {
        assert.deepEqual(binding, {
          adapterId: compiled.registration.adapterId,
          adapterVersion: compiled.registration.adapterVersion,
          planHash: compiled.registration.planHash,
        });
        return { executeFrozenPlan: (input) => executor.handleInvocation({
          schema: "outsider/formation-executor-invocation/v1", ...input,
        }) };
      },
      clock: () => NOW,
    });

    const first = await worker.dispatch(compiled.job);
    assert.equal(first.statusCode, 200);
    assert.equal(first.receipt.state, "HOLD");
    assert.equal(first.receipt.reasonCode,
      "READY_FOR_PAYMENT_AUTHORIZATION_ETA_UNPROVEN");
    assert.equal(first.receipt.externalEffect, "CONFIRMED");
    assert.equal(first.receipt.retryDisposition, "DO_NOT_RETRY");
    assert.equal(first.receipt.sourceOccurrenceHashes.length, 4);
    assert.equal(requests.length, 12);
    assert.equal(requests.filter((entry) => entry.method === "GET").length, 7);
    assert.equal(requests.filter((entry) => entry.method === "POST").length, 5);
    assert.equal(requests.some((entry) =>
      entry.path.includes("payment-information")), false);
    assert.equal(requests.some((entry) =>
      /\/orders?(?:$|\/)/u.test(entry.path)), false);

    const replay = await worker.dispatch(compiled.job);
    assert.equal(replay.replayed, true);
    assert.deepEqual(replay.receipt, first.receipt);
    assert.equal(requests.length, 12);
    const privateState = store.inspectForTest();
    assert.equal(privateState.exchangeCount, 12);
    assert.equal(privateState.occurrenceCount, 4);

    const publicText = JSON.stringify({ job: compiled.job,
      registration: compiled.registration, result: first });
    for (const privateValue of [STREET, EMAIL, PHONE, "02139", CART]) {
      assert.equal(publicText.includes(privateValue), false);
    }
    assert.equal(first.receipt.counters.modelCalls, 0);
    assert.equal(first.receipt.counters.browserClicks, 0);
    assert.equal(first.receipt.counters.employeeTouches, 0);
    assert.equal(first.receipt.authorityMinted, false);
    assert.equal(first.receipt.independentOutcomeTruthEstablished, false);
  });

test("a fresh executor cold-replays durable result with zero provider requests",
  async () => {
    const compiled = deployment();
    const store = createMemoryCloudflareSparkFunExecutorStoreV1();
    const calls = [];
    const invoke = (fetchImpl) => createCloudflareSparkFunExecutorV1({
      registration: compiled.registration,
      privateEnvelopeSecretBase64: compiled.privateEnvelopeSecretBase64,
      store, fetchImpl, clock: () => NOW,
    }).handleInvocation({ schema: "outsider/formation-executor-invocation/v1",
      ...formationJobIdentityV1(compiled.job) });
    const first = await invoke(provider(calls));
    assert.equal(first.sourceOccurrenceHashes.length, 4);
    const replay = await invoke(async () => {
      throw new Error("cold replay must not use network");
    });
    assert.deepEqual(replay, first);
    assert.equal(calls.length, 12);
  });

test("binding mismatch and orphaned attempt fail before any duplicate effect",
  async () => {
    const compiled = deployment();
    const mismatchStore = createMemoryCloudflareSparkFunExecutorStoreV1();
    let mismatchCalls = 0;
    const mismatchExecutor = createCloudflareSparkFunExecutorV1({
      registration: compiled.registration,
      privateEnvelopeSecretBase64: compiled.privateEnvelopeSecretBase64,
      store: mismatchStore,
      async fetchImpl() { mismatchCalls += 1; throw new Error("not reached"); },
      clock: () => NOW,
    });
    const changed = formationJobIdentityV1({ ...compiled.job,
      parameterEnvelopeHash: h("different-envelope") });
    const rejected = await mismatchExecutor.handleInvocation({
      schema: "outsider/formation-executor-invocation/v1", ...changed });
    assert.equal(rejected.state, "UNAVAILABLE");
    assert.equal(rejected.reasonCode, "JOB_BINDING_MISMATCH");
    assert.equal(mismatchCalls, 0);

    const store = createMemoryCloudflareSparkFunExecutorStoreV1();
    let interruptedCalls = 0;
    const interruptedExecutor = createCloudflareSparkFunExecutorV1({
      registration: compiled.registration,
      privateEnvelopeSecretBase64: compiled.privateEnvelopeSecretBase64,
      store,
      async fetchImpl(url, init) {
        interruptedCalls += 1;
        if (interruptedCalls === 2) throw new Error("connection dropped");
        return provider([])(url, init);
      },
      clock: () => NOW,
    });
    const invocation = { schema: "outsider/formation-executor-invocation/v1",
      ...formationJobIdentityV1(compiled.job) };
    const interrupted = await interruptedExecutor.handleInvocation(invocation);
    assert.equal(interrupted.state, "HOLD");
    assert.equal(interrupted.reasonCode,
      "SPARKFUN_EXECUTION_INTERRUPTED_EFFECT_UNKNOWN");
    assert.equal(interrupted.externalEffect, "UNKNOWN");
    assert.equal(interrupted.retryDisposition, "DO_NOT_RETRY");
    assert.equal(interruptedCalls, 2);

    const restarted = createCloudflareSparkFunExecutorV1({
      registration: compiled.registration,
      privateEnvelopeSecretBase64: compiled.privateEnvelopeSecretBase64,
      store,
      async fetchImpl() { interruptedCalls += 1; throw new Error("not reached"); },
      clock: () => NOW,
    });
    assert.deepEqual(await restarted.handleInvocation(invocation), interrupted);
    assert.equal(interruptedCalls, 2);
  });

test("boundary exposes the service-only no-payment machine path",
  () => {
    assert.equal(OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_BOUNDARY
      .exactPlanHashRequired, true);
    assert.equal(OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_BOUNDARY
      .formationJobAndTypedGraphBindingRequired, true);
    assert.equal(OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_BOUNDARY
      .paymentEndpointAllowed, false);
    assert.equal(OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_BOUNDARY
      .orderEndpointAllowed, false);
    assert.equal(OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_BOUNDARY.modelCalls, 0);
    assert.equal(OUTSIDER_CLOUDFLARE_SPARKFUN_EXECUTOR_V1_BOUNDARY.browserClicks, 0);
  });

test("health never calls placeholder registration and secret production-ready",
  async () => {
    const namespace = { idFromName: () => ({}), get: () => ({ fetch() {} }) };
    const response = await sparkFunWorker.fetch(new Request(
      "https://sparkfun-executor.internal/healthz"), {
      SPARKFUN_EXECUTOR_REGISTRATION_JSON: "{}",
      SPARKFUN_PRIVATE_ENVELOPE_BASE64: "AAAA",
      SPARKFUN_EXECUTIONS: namespace,
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).configurationReady, false);
    const compiled = deployment();
    const healthy = await sparkFunWorker.fetch(new Request(
      "https://sparkfun-executor.internal/healthz"), {
      SPARKFUN_EXECUTOR_REGISTRATION_JSON:
        canonicalizeStrict(compiled.registration),
      SPARKFUN_PRIVATE_ENVELOPE_BASE64:
        compiled.privateEnvelopeSecretBase64,
      SPARKFUN_EXECUTIONS: namespace,
    });
    const projection = await healthy.json();
    assert.equal(projection.configurationReady, true);
    assert.equal(projection.productionExecutionReady, true);
    const publicText = JSON.stringify(projection);
    for (const privateValue of [STREET, EMAIL, PHONE, "02139"] ) {
      assert.equal(publicText.includes(privateValue), false);
    }
  });
