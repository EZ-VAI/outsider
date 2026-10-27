import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync }
  from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { formationJobIdentityV1 }
  from "../src/outsider-formation-job-worker-v1.js";
import { createSparkFunMagentoFormationNodeCompositionV1 }
  from "../src/outsider-sparkfun-magento-formation-node-composition-v1.js";
import {
  createMemoryUserHeldFormationLeaseBrokerV1,
  createUserHeldFormationPrivateBindingV1,
  deriveUserHeldFormationExecutorCapabilityHashV1,
} from "../src/outsider-user-held-formation-executor-protocol-v1.js";
import {
  publishUserHeldFormationExecutionV1,
  runUserHeldFormationExecutorOnceV1,
}
  from "../src/outsider-user-held-formation-executor-client-v1.js";

const NOW = "2026-09-04T21:00:00.000Z";
const STREET = "700 Private Edge Avenue";
const EMAIL = "edge-only@example.invalid";
const PHONE = "+1 555 010 9876";
const POSTAL = "02139";
const CART_ID = "privateUserHeldCart001";
const TOKEN = "test-only-user-held-executor-bearer-token-0001";
const PUBLICATION_TOKEN = "test-only-formation-publication-bearer-token-0001";
const h = (value) => `sha256:${createHash("sha256")
  .update(value).digest("hex")}`;

function privateRoot(t) {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-user-held-e2e-"));
  chmodSync(root, 0o700);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

function privateInput(root) {
  const value = {
    schema: "outsider/private-sparkfun-full-address-prepayment-run-request/v1",
    schemaVersion: "1.0.0",
    product: { catalogPath: "/usb-3-1-cable-a-to-c-3-foot.html",
      productId: "4636", sku: "CAB-14743", quantity: 1 },
    destination: { firstName: "Private", lastName: "Edge", email: EMAIL,
      telephone: PHONE, countryCode: "US", regionId: 25,
      region: "Massachusetts", regionCode: "MA", city: "Exampleville",
      postalCode: POSTAL, streetLines: [STREET] },
    budget: { currency: "USD", maximumAmountMinor: "2000" },
    completionDeadline: "2026-09-10T23:59:59.999Z",
    formationExpiresAt: "2026-09-04T22:00:00.000Z",
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  const file = path.join(root, "private-input.json");
  writeFileSync(file, `${canonicalizeStrict(value)}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

function json(value) {
  return new Response(`${JSON.stringify(value)}\n`, { status: 200,
    headers: { "content-type": "application/json" } });
}

function providerFetch(requests) {
  let cartCreated = false;
  let itemAdded = false;
  let shippingApplied = false;
  const cart = () => ({ id: 1, is_active: true,
    items: [{ item_id: 2, sku: "CAB-14743", qty: 1, price: 7.95 }],
    items_count: 1, items_qty: 1 });
  const totals = () => ({ grand_total: shippingApplied ? 19.83 : 7.95,
    base_grand_total: shippingApplied ? 19.83 : 7.95, subtotal: 7.95,
    shipping_amount: shippingApplied ? 11.19 : 0,
    tax_amount: shippingApplied ? 0.69 : 0, items_qty: 1,
    base_currency_code: "USD", quote_currency_code: "USD" });
  return async (url, init) => {
    const parsed = new URL(url);
    requests.push({ url: String(url), method: init.method,
      body: init.body === undefined ? null : Buffer.from(init.body).toString() });
    assert.equal(parsed.origin, "https://www.sparkfun.com");
    if (parsed.pathname.endsWith(".html")) {
      const provider = { "*": { "Magento_Catalog/js/product/view/provider": {
        data: { items: { "4636": { id: 4636, name: "USB Cable",
          price_info: { final_price: 7.95 }, currency_code: "USD",
          is_salable: "1", is_available: true } } } } } };
      const context = { productId: 4636, sku: "CAB-14743", updatedAt: NOW };
      return new Response(`<script type="text/x-magento-init">${JSON.stringify(
        provider)}</script><script>magentoStorefrontEvents.context.setProduct(${JSON.stringify(
        context)})</script>`, { status: 200,
        headers: { "content-type": "text/html", date: NOW } });
    }
    if (parsed.pathname === "/rest/V1/guest-carts") {
      cartCreated = true;
      return json(CART_ID);
    }
    assert.equal(cartCreated, true);
    if (parsed.pathname.endsWith("/items") && init.method === "POST") {
      itemAdded = true;
      return json({ item_id: 2, sku: "CAB-14743", qty: 1, price: 7.95 });
    }
    assert.equal(itemAdded, true);
    if (parsed.pathname.endsWith("/estimate-shipping-methods")) {
      const address = JSON.parse(Buffer.from(init.body).toString()).address;
      assert.deepEqual(address.street, [STREET]);
      assert.equal(address.postcode, POSTAL);
      return json([{ carrier_code: "ups", method_code: "03",
        carrier_title: "UPS", method_title: "Ground", amount: 11.19,
        base_amount: 11.19, available: true, error_message: "",
        price_excl_tax: 11.19, price_incl_tax: 11.19 }]);
    }
    if (parsed.pathname.endsWith("/shipping-information")) {
      const information = JSON.parse(Buffer.from(init.body).toString());
      assert.equal(information.addressInformation.shipping_address.email, EMAIL);
      assert.equal(information.addressInformation.shipping_address.telephone, PHONE);
      shippingApplied = true;
      return json({ payment_methods: [{ code: "braintree", title: "Card" }],
        totals: totals() });
    }
    if (parsed.pathname.endsWith("/totals")) return json(totals());
    if (/\/guest-carts\/[^/]+$/u.test(parsed.pathname)) return json(cart());
    throw new Error(`unexpected provider call ${init.method} ${parsed.pathname}`);
  };
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
    if (new URL(url).pathname.startsWith("/v1/client-executions/")
      && new URL(url).pathname.endsWith("/receipt")) {
      assert.equal(new URL(url).pathname,
        `/v1/client-executions/${body.jobKey}/receipt`);
      return json(broker.complete(body));
    }
    return new Response("not found", { status: 404 });
  };
}

function composition(inputFile, root, fetchImpl) {
  return createSparkFunMagentoFormationNodeCompositionV1({
    orderId: "order:user-held-edge-0001",
    outcomeProgramHash: h("outcome"),
    graphRefs: {
      principalEpochHash: h("principal"),
      accountableDeploymentHash: h("deployment"),
      runtimeOrEmbodimentHash: h("runtime"),
      delegationHash: h("delegation"),
      episodeHash: h("episode"),
      attemptHash: h("attempt"),
    },
    inputFile,
    privateRoot: root,
    issuedAt: "2026-09-04T20:00:00.000Z",
    expiresAt: "2026-09-04T21:30:00.000Z",
  }, { fetchImpl, clock: () => NOW });
}

test("generic publisher sends one hash-only user-held job before provider I/O",
  async (t) => {
    const root = privateRoot(t);
    const inputFile = privateInput(root);
    const providerRequests = [];
    const privateComposition = composition(inputFile, root,
      providerFetch(providerRequests));
    const binding = createUserHeldFormationPrivateBindingV1({
      composition: privateComposition,
      privateEnvelopeBytes: readFileSync(inputFile),
      commitmentKeyBytes: Buffer.alloc(32, 0x42),
    });
    const capabilityHash = deriveUserHeldFormationExecutorCapabilityHashV1({
      bearerToken: TOKEN,
      jobHash: binding.jobHash,
    });
    let requestBody;
    const published = await publishUserHeldFormationExecutionV1({
      centralOrigin: "https://formation.example",
      publicationBearerToken: PUBLICATION_TOKEN,
      executorCapabilityHash: capabilityHash,
      binding,
    }, {
      clock: () => NOW,
      fetchImpl: async (url, init) => {
        assert.equal(url, "https://formation.example/v1/client-executions");
        assert.equal(init.method, "POST");
        assert.equal(init.headers.authorization,
          `Bearer ${PUBLICATION_TOKEN}`);
        requestBody = JSON.parse(String(init.body));
        return new Response(`${JSON.stringify({
          schema:
            "outsider/user-held-formation-execution-publish-response/v1",
          apiVersion: "2.5.0",
          ok: true,
          state: "PUBLISHED",
          jobKey: binding.jobKey,
          jobHash: binding.jobHash,
          replayed: false,
          durableStorage: "SQLITE_DURABLE_OBJECT",
          privateParameterBytesStored: false,
          privateParameterUnkeyedHashStored: false,
          authorityMinted: false,
          capacityEstablished: false,
          independentOutcomeTruthEstablished: false,
          outcomeCommitted: false,
        })}\n`, { status: 201,
          headers: { "content-type": "application/json" } });
      },
    });
    assert.equal(published.state, "PUBLISHED");
    assert.equal(published.replayed, false);
    assert.equal(providerRequests.length, 0);
    assert.equal(requestBody.executorCapabilityHash, capabilityHash);
    assert.deepEqual(requestBody.bindingProjection, binding.publicProjection);
    const centralText = JSON.stringify(requestBody);
    for (const privateValue of [STREET, EMAIL, PHONE, POSTAL,
      privateComposition.job.orderId,
      privateComposition.job.planHash,
      privateComposition.job.parameterEnvelopeHash]) {
      assert.equal(centralText.includes(privateValue), false,
        `publication leaked ${privateValue}`);
    }
  });

test("user-held outbound claim keeps PII and unkeyed execution hashes local and replays without provider IO",
  async (t) => {
    const root = privateRoot(t);
    const inputFile = privateInput(root);
    const providerRequests = [];
    const privateComposition = composition(inputFile, root,
      providerFetch(providerRequests));
    const privateIdentity = formationJobIdentityV1(privateComposition.job);
    assert.throws(() => createUserHeldFormationPrivateBindingV1({
      composition: privateComposition,
      privateEnvelopeBytes: Buffer.from("wrong-private-envelope\n", "utf8"),
      commitmentKeyBytes: Buffer.alloc(32, 0x51),
    }), /PRIVATE_ENVELOPE_JOB_BINDING_MISMATCH/u);
    assert.equal(providerRequests.length, 0);
    const binding = createUserHeldFormationPrivateBindingV1({
      composition: privateComposition,
      privateEnvelopeBytes: readFileSync(inputFile),
      commitmentKeyBytes: Buffer.alloc(32, 0x51),
    });
    assert.notEqual(binding.job.orderId, privateComposition.job.orderId);
    assert.match(binding.job.orderId, /^order:uhf:[a-f0-9]{64}$/u);
    assert.notEqual(binding.job.planHash, privateComposition.job.planHash);
    assert.notEqual(binding.job.parameterEnvelopeHash,
      privateComposition.job.parameterEnvelopeHash);
    assert.equal(binding.job.graphRefs.attemptHash,
      privateComposition.job.graphRefs.attemptHash);

    let brokerNow = NOW;
    const broker = createMemoryUserHeldFormationLeaseBrokerV1({
      clock: () => brokerNow,
    });
    const capabilityHash = deriveUserHeldFormationExecutorCapabilityHashV1({
      bearerToken: TOKEN,
      jobHash: binding.jobHash,
    });
    broker.enqueue(binding.job, capabilityHash);
    const centralBodies = [];
    const run = () => runUserHeldFormationExecutorOnceV1({
      centralOrigin: "https://formation.example",
      bearerToken: TOKEN,
      executorCapabilityHash: capabilityHash,
      binding,
    }, { fetchImpl: centralFetch(broker, centralBodies),
      clock: () => brokerNow });

    const first = await run();
    assert.equal(first.state, "COMPLETE");
    assert.equal(first.replayed, false);
    assert.equal(first.executionPerformed, true);
    assert.equal(first.authorityMinted, false);
    assert.equal(first.independentOutcomeTruthEstablished, false);
    assert.equal(first.outcomeCommitted, false);
    assert.equal(providerRequests.length, 12);
    assert.equal(providerRequests.some((request) =>
      request.body?.includes(STREET)), true);
    assert.equal(providerRequests.some((request) =>
      request.url.includes("payment-information")), false);
    assert.equal(providerRequests.some((request) =>
      /\/orders?(?:$|\/)/u.test(new URL(request.url).pathname)), false);

    const privateResult = await privateComposition.executor.executeFrozenPlan({
      job: privateIdentity.job,
      jobHash: privateIdentity.jobHash,
      jobKey: privateIdentity.jobKey,
    });
    assert.equal(providerRequests.length, 12);
    assert.notEqual(first.resultHash, privateResult.resultHash);
    const centralText = JSON.stringify({ enqueuedJob: binding.job,
      bodies: centralBodies, state: broker.read(binding.jobKey),
      binding: binding.publicProjection });
    for (const privateValue of [STREET, EMAIL, PHONE, POSTAL, CART_ID,
      privateComposition.job.orderId,
      privateComposition.job.planHash,
      privateComposition.job.parameterEnvelopeHash,
      privateResult.resultHash,
      ...privateResult.sourceOccurrenceHashes]) {
      assert.equal(centralText.includes(privateValue), false,
        `central projection leaked ${privateValue}`);
    }

    brokerNow = "2026-09-04T23:00:00.000Z";
    const replay = await run();
    assert.equal(replay.state, "COMPLETE");
    assert.equal(replay.replayed, true);
    assert.equal(replay.executionPerformed, false);
    assert.equal(replay.resultHash, first.resultHash);
    assert.equal(replay.receiptHash, first.receiptHash);
    assert.equal(providerRequests.length, 12);
    assert.equal(centralBodies.length, 3);
    assert.equal(binding.publicProjection.privateParameterBytesProjected, false);
    assert.equal(binding.publicProjection.privateParameterUnkeyedHashProjected,
      false);
    assert.equal(binding.publicProjection.providerExchangeUnkeyedHashesProjected,
      false);
  });
