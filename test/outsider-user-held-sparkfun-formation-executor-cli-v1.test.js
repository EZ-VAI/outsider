import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import { createMemoryUserHeldFormationLeaseBrokerV1 }
  from "../src/outsider-user-held-formation-executor-protocol-v1.js";
import {
  OUTSIDER_USER_HELD_SPARKFUN_EXECUTOR_V1_ENV,
  runUserHeldSparkFunFormationExecutorCliV1,
} from "../scripts/outsider-user-held-sparkfun-formation-executor-v1.mjs";

const NOW = "2026-09-04T21:00:00.000Z";
const STREET = "700 Private Edge Avenue";
const EMAIL = "edge-only@example.invalid";
const PHONE = "+1 555 010 9876";
const POSTAL = "02139";
const CART_ID = "privateUserHeldCart001";
const PUBLICATION_TOKEN
  = "test-only-formation-publication-bearer-token-000001";
const EXECUTOR_TOKEN = "test-only-user-held-executor-bearer-token-0001";
const COMMITMENT_KEY = Buffer.alloc(32, 0x51).toString("base64url");

function h(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function root(t) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-user-held-cli-"));
  chmodSync(directory, 0o700);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writePrivate(file, value, canonical = false) {
  const bytes = canonical
    ? `${canonicalizeStrict(value)}\n`
    : `${value}\n`;
  writeFileSync(file, bytes, { mode: 0o600 });
  chmodSync(file, 0o600);
  return file;
}

function fixtures(directory) {
  const privateInput = {
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
  const inputFile = writePrivate(path.join(directory, "private-input.json"),
    privateInput, true);
  const config = {
    schema: "outsider/private-user-held-sparkfun-formation-executor-config/v1",
    schemaVersion: "1.0.0",
    centralApiVersion: "2.5.0",
    enrollmentMode: "PUBLISH_THEN_CLAIM",
    orderId: "order:user-held-edge-cli-0001",
    outcomeProgramHash: h("outcome"),
    graphRefs: {
      principalEpochHash: h("principal"),
      accountableDeploymentHash: h("deployment"),
      runtimeOrEmbodimentHash: h("runtime"),
      delegationHash: h("delegation"),
      episodeHash: h("episode"),
      attemptHash: h("attempt"),
    },
    inputFile: "private-input.json",
    privateRoot: "runtime",
    issuedAt: "2026-09-04T20:00:00.000Z",
    expiresAt: "2026-09-04T21:30:00.000Z",
    paymentAuthorized: false,
    orderAuthorized: false,
  };
  const configFile = writePrivate(path.join(directory, "config.json"), config,
    true);
  const files = {
    origin: writePrivate(path.join(directory, "origin.secret"),
      "https://formation.example"),
    publicationToken: writePrivate(path.join(directory,
      "publication-token.secret"), PUBLICATION_TOKEN),
    executorToken: writePrivate(path.join(directory, "executor-token.secret"),
      EXECUTOR_TOKEN),
    key: writePrivate(path.join(directory, "commitment-key.secret"),
      COMMITMENT_KEY),
  };
  return { inputFile, configFile, files };
}

function json(value, status = 200) {
  return new Response(`${JSON.stringify(value)}\n`, { status,
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
      assert.equal(information.addressInformation.shipping_address.telephone,
        PHONE);
      shippingApplied = true;
      return json({ payment_methods: [{ code: "braintree", title: "Card" }],
        totals: totals() });
    }
    if (parsed.pathname.endsWith("/totals")) return json(totals());
    if (/\/guest-carts\/[^/]+$/u.test(parsed.pathname)) return json(cart());
    throw new Error("unexpected provider request");
  };
}

function centralFetch(broker, bodies) {
  return async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, "https://formation.example");
    assert.equal(init.method, "POST");
    const expectedToken = parsed.pathname === "/v1/client-executions"
      ? PUBLICATION_TOKEN : EXECUTOR_TOKEN;
    assert.equal(init.headers.authorization, `Bearer ${expectedToken}`);
    const raw = String(init.body);
    bodies.push(raw);
    const body = JSON.parse(raw);
    if (parsed.pathname === "/v1/client-executions") {
      assert.equal(body.schema,
        "outsider/user-held-formation-execution-publish-request/v1");
      assert.equal(body.bindingProjection.privateParameterBytesProjected, false);
      assert.equal(body.bindingProjection.privateParameterUnkeyedHashProjected,
        false);
      const publication = broker.enqueue(body.job,
        body.executorCapabilityHash);
      return json({
        schema: "outsider/user-held-formation-execution-publish-response/v1",
        apiVersion: "2.5.0",
        ok: true,
        state: "PUBLISHED",
        jobKey: publication.jobKey,
        jobHash: publication.jobHash,
        replayed: !publication.enqueued,
        durableStorage: "SQLITE_DURABLE_OBJECT",
        privateParameterBytesStored: false,
        privateParameterUnkeyedHashStored: false,
        authorityMinted: false,
        capacityEstablished: false,
        independentOutcomeTruthEstablished: false,
        outcomeCommitted: false,
      }, publication.enqueued ? 201 : 200);
    }
    if (parsed.pathname === "/v1/client-execution-claims") {
      return json(broker.claim(body));
    }
    if (parsed.pathname.startsWith("/v1/client-executions/")
      && parsed.pathname.endsWith("/receipt")) {
      assert.equal(parsed.pathname,
        `/v1/client-executions/${body.jobKey}/receipt`);
      return json(broker.complete(body));
    }
    return new Response("not found", { status: 404 });
  };
}

function fileEnvironment(files) {
  const names = OUTSIDER_USER_HELD_SPARKFUN_EXECUTOR_V1_ENV;
  return {
    [names.centralOriginFile]: files.origin,
    [names.publicationBearerTokenFile]: files.publicationToken,
    [names.executorBearerTokenFile]: files.executorToken,
    [names.commitmentKeyBase64UrlFile]: files.key,
  };
}

function directEnvironment() {
  const names = OUTSIDER_USER_HELD_SPARKFUN_EXECUTOR_V1_ENV;
  return {
    [names.centralOrigin]: "https://formation.example",
    [names.publicationBearerToken]: PUBLICATION_TOKEN,
    [names.executorBearerToken]: EXECUTOR_TOKEN,
    [names.commitmentKeyBase64Url]: COMMITMENT_KEY,
  };
}

test("one-shot CLI publishes keyed job, executes machine HTTPS locally, and cold-replays without provider IO",
  async (t) => {
    const directory = root(t);
    const fixture = fixtures(directory);
    const providerRequests = [];
    const centralBodies = [];
    const broker = createMemoryUserHeldFormationLeaseBrokerV1({
      clock: () => NOW,
    });
    const provider = providerFetch(providerRequests);
    const central = centralFetch(broker, centralBodies);
    const fetchImpl = (url, init) => new URL(url).origin
      === "https://formation.example" ? central(url, init) : provider(url, init);
    const run = async (environment) => {
      const stdout = [];
      const stderr = [];
      const exitCode = await runUserHeldSparkFunFormationExecutorCliV1({
        argv: ["--once", "--config", fixture.configFile], environment,
      }, { fetchImpl, clock: () => NOW }, {
        stdout: (value) => stdout.push(value),
        stderr: (value) => stderr.push(value),
      });
      assert.equal(exitCode, 0);
      assert.deepEqual(stderr, []);
      assert.equal(stdout.length, 1);
      return { raw: stdout[0], value: JSON.parse(stdout[0]) };
    };

    const first = await run(fileEnvironment(fixture.files));
    assert.equal(first.value.state, "COMPLETE");
    assert.equal(first.value.enrollmentPublished, true);
    assert.equal(first.value.enrollmentReplayed, false);
    assert.equal(first.value.executionMode, "ONE_SHOT");
    assert.equal(first.value.replayed, false);
    assert.equal(first.value.reconciled, false);
    assert.equal(first.value.executionPerformed, true);
    assert.equal(first.value.localDurableReplayPerformed, false);
    assert.equal(first.value.receiptSubmitted, true);
    assert.equal(first.value.boundary.browserOrMouseUsed, false);
    assert.equal(first.value.boundary.paymentPerformed, false);
    assert.equal(first.value.boundary.orderSubmitted, false);
    assert.equal(providerRequests.length, 12);
    assert.equal(providerRequests.some((request) => request.body?.includes(STREET)),
      true);
    assert.equal(providerRequests.some((request) =>
      request.url.includes("payment-information")), false);
    assert.equal(providerRequests.some((request) =>
      /\/orders?(?:$|\/)/u.test(new URL(request.url).pathname)), false);

    const runtimeDirectory = path.join(directory, "runtime");
    const runDirectory = readdirSync(runtimeDirectory)
      .find((name) => name.startsWith("sparkfun-full-address-prepayment-"));
    const privateProjection = JSON.parse(readFileSync(path.join(runtimeDirectory,
      runDirectory, "public-projection.json"), "utf8"));
    const inputBytes = readFileSync(fixture.inputFile);
    const privateHashes = [
      `sha256:${createHash("sha256").update(inputBytes).digest("hex")}`,
      privateProjection.privateInputBytesHash,
      privateProjection.projectionHash,
      ...privateProjection.stages.map((stage) => stage.sourceOccurrenceHash)
        .filter(Boolean),
    ];
    const centralText = centralBodies.join("\n");
    for (const privateValue of [STREET, EMAIL, PHONE, POSTAL, CART_ID,
      ...privateHashes]) assert.equal(centralText.includes(privateValue), false);
    for (const privateValue of [STREET, EMAIL, PHONE, POSTAL, CART_ID,
      PUBLICATION_TOKEN, EXECUTOR_TOKEN, COMMITMENT_KEY, ...privateHashes]) {
      assert.equal(first.raw.includes(privateValue), false);
    }
    assert.deepEqual(Object.keys(first.value).sort(), ["boundary",
      "enrollmentPublished", "enrollmentReplayed", "executionMode",
      "executionPerformed", "jobHash", "jobKey",
      "localDurableReplayPerformed", "ok", "receiptHash",
      "receiptSubmitted", "reconciled", "replayed", "schema", "state"].sort());

    const beforeReplay = providerRequests.length;
    const second = await run(directEnvironment());
    assert.equal(second.value.enrollmentReplayed, true);
    assert.equal(second.value.replayed, true);
    assert.equal(second.value.executionPerformed, false);
    assert.equal(second.value.receiptHash, first.value.receiptHash);
    assert.equal(providerRequests.length, beforeReplay);
    assert.equal(centralBodies.length, 5);
  });

test("CLI rejects a non-0600 secret before any network call and redacts failure output",
  async (t) => {
    const directory = root(t);
    const fixture = fixtures(directory);
    chmodSync(fixture.files.executorToken, 0o644);
    let networkCalls = 0;
    const stdout = [];
    const stderr = [];
    const exitCode = await runUserHeldSparkFunFormationExecutorCliV1({
      argv: ["--once", "--config", fixture.configFile],
      environment: fileEnvironment(fixture.files),
    }, { fetchImpl: async () => {
      networkCalls += 1;
      throw new Error(EXECUTOR_TOKEN);
    },
      clock: () => NOW }, {
      stdout: (value) => stdout.push(value),
      stderr: (value) => stderr.push(value),
    });
    assert.equal(exitCode, 1);
    assert.equal(networkCalls, 0);
    assert.deepEqual(stdout, []);
    assert.equal(stderr.length, 1);
    const failure = JSON.parse(stderr[0]);
    assert.equal(failure.errorCode, "EXECUTOR_BEARER_TOKEN_NOT_PRIVATE");
    assert.equal(stderr[0].includes(EXECUTOR_TOKEN), false);
    assert.equal(stderr[0].includes(STREET), false);
    assert.deepEqual(Object.keys(failure).sort(), ["errorCode", "ok", "schema"]);
  });

test("receipt failure restarts into reconcile-only local replay with raw colon path and zero provider requests",
  async (t) => {
    const directory = root(t);
    const fixture = fixtures(directory);
    const providerRequests = [];
    const centralBodies = [];
    const receiptPaths = [];
    let claimCount = 0;
    let failFirstReceipt = true;
    const broker = createMemoryUserHeldFormationLeaseBrokerV1({
      clock: () => NOW,
    });
    const provider = providerFetch(providerRequests);
    const central = async (url, init) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, "https://formation.example");
      const raw = String(init.body);
      centralBodies.push(raw);
      const body = JSON.parse(raw);
      if (parsed.pathname === "/v1/client-executions") {
        assert.equal(init.headers.authorization,
          `Bearer ${PUBLICATION_TOKEN}`);
        const publication = broker.enqueue(body.job,
          body.executorCapabilityHash);
        return json({
          schema: "outsider/user-held-formation-execution-publish-response/v1",
          apiVersion: "2.5.0",
          ok: true,
          state: "PUBLISHED",
          jobKey: publication.jobKey,
          jobHash: publication.jobHash,
          replayed: !publication.enqueued,
          durableStorage: "SQLITE_DURABLE_OBJECT",
          privateParameterBytesStored: false,
          privateParameterUnkeyedHashStored: false,
          authorityMinted: false,
          capacityEstablished: false,
          independentOutcomeTruthEstablished: false,
          outcomeCommitted: false,
        }, publication.enqueued ? 201 : 200);
      }
      if (parsed.pathname === "/v1/client-execution-claims") {
        assert.equal(init.headers.authorization, `Bearer ${EXECUTOR_TOKEN}`);
        claimCount += 1;
        const claimed = broker.claim(body);
        if (claimCount > 1 && claimed.state === "CLAIMED") {
          return json({ ...claimed, state: "HOLD", invocation: null,
            completion: null });
        }
        return json(claimed);
      }
      if (parsed.pathname.startsWith("/v1/client-executions/")
        && parsed.pathname.endsWith("/receipt")) {
        assert.equal(init.headers.authorization, `Bearer ${EXECUTOR_TOKEN}`);
        receiptPaths.push(parsed.pathname);
        assert.equal(parsed.pathname,
          `/v1/client-executions/${body.jobKey}/receipt`);
        assert.equal(parsed.pathname.includes("%3A"), false);
        if (failFirstReceipt) {
          failFirstReceipt = false;
          return new Response("route unavailable", { status: 404 });
        }
        return json(broker.complete(body));
      }
      return new Response("not found", { status: 404 });
    };
    const fetchImpl = (url, init) => new URL(url).origin
      === "https://formation.example" ? central(url, init) : provider(url, init);
    const invoke = async (flag, configFile = fixture.configFile) => {
      const stdout = [];
      const stderr = [];
      const exitCode = await runUserHeldSparkFunFormationExecutorCliV1({
        argv: [flag, "--config", configFile],
        environment: directEnvironment(),
      }, { fetchImpl, clock: () => NOW }, {
        stdout: (value) => stdout.push(value),
        stderr: (value) => stderr.push(value),
      });
      return { exitCode, stdout, stderr,
        value: stdout.length === 1 ? JSON.parse(stdout[0]) : null };
    };

    const interrupted = await invoke("--once");
    assert.equal(interrupted.exitCode, 1);
    assert.equal(JSON.parse(interrupted.stderr[0]).errorCode,
      "RESULT_HTTP_404");
    assert.equal(providerRequests.length, 12);
    assert.equal(receiptPaths.length, 1);
    const requestsAfterProviderCompletion = providerRequests.length;

    const missingConfig = JSON.parse(readFileSync(fixture.configFile, "utf8"));
    missingConfig.privateRoot = "missing-runtime";
    const missingConfigFile = writePrivate(path.join(directory,
      "missing-config.json"), missingConfig, true);
    const interlocked = await invoke("--reconcile-only", missingConfigFile);
    assert.equal(interlocked.exitCode, 1);
    assert.equal(JSON.parse(interlocked.stderr[0]).errorCode,
      "RECONCILIATION_LOCAL_COMPLETION_REQUIRED");
    assert.equal(providerRequests.length, requestsAfterProviderCompletion);
    assert.equal(receiptPaths.length, 1);

    const repeatedInterlock = await invoke("--reconcile-only",
      missingConfigFile);
    assert.equal(repeatedInterlock.exitCode, 1);
    assert.equal(JSON.parse(repeatedInterlock.stderr[0]).errorCode,
      "RECONCILIATION_LOCAL_COMPLETION_REQUIRED");
    assert.equal(providerRequests.length, requestsAfterProviderCompletion);
    assert.equal(receiptPaths.length, 1);

    const reconciled = await invoke("--reconcile-only");
    assert.equal(reconciled.exitCode, 0);
    assert.deepEqual(reconciled.stderr, []);
    assert.equal(reconciled.value.state, "COMPLETE");
    assert.equal(reconciled.value.executionMode, "RECONCILE_ONLY");
    assert.equal(reconciled.value.reconciled, true);
    assert.equal(reconciled.value.replayed, false);
    assert.equal(reconciled.value.executionPerformed, false);
    assert.equal(reconciled.value.localDurableReplayPerformed, true);
    assert.equal(reconciled.value.receiptSubmitted, true);
    assert.equal(reconciled.value.enrollmentPublished, false);
    assert.equal(providerRequests.length, requestsAfterProviderCompletion);
    assert.equal(receiptPaths.length, 2);

    const coldReplay = await invoke("--reconcile-only");
    assert.equal(coldReplay.exitCode, 0);
    assert.equal(coldReplay.value.replayed, true);
    assert.equal(coldReplay.value.localDurableReplayPerformed, false);
    assert.equal(coldReplay.value.receiptSubmitted, false);
    assert.equal(coldReplay.value.receiptHash, reconciled.value.receiptHash);
    assert.equal(providerRequests.length, requestsAfterProviderCompletion);
    assert.equal(receiptPaths.length, 2);
    const centralText = centralBodies.join("\n");
    for (const privateValue of [STREET, EMAIL, PHONE, POSTAL, CART_ID,
      COMMITMENT_KEY]) assert.equal(centralText.includes(privateValue), false);
  });
