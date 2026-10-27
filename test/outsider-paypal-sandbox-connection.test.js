import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPayPalSandboxConnection } from "../src/outsider-paypal-sandbox-connection.js";

const h = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const SCOPE = "https://uri.paypal.com/payments/payouts";
const TOKEN_URL = "https://api-m.sandbox.paypal.com/v1/oauth2/token";
const START = "2026-09-05T20:00:00.000Z";
const CLIENT = "FIXTURE_CLIENT_NOT_REAL";
const SECRET = "FIXTURE_APP_SECRET_NOT_REAL";
const TOKEN = "FIXTURE_BEARER_NOT_REAL";
const recipient = { recipientType: "EMAIL", receiver: "sandbox-fixture@example.invalid",
  isSandboxAccount: true, testAccountRefHash: h("test-account") };
function input(key = "transfer") {
  return { sandboxTransfer: { idempotencyKey: h(key), termRefHash: h("term"),
    status: "SIMULATED_NOT_SUBMITTED", submitted: false, moneyMoved: false,
    paymentAuthorized: false, amount: { currency: "USD", minorUnits: "1" } },
  sandboxAcceptance: { environment: "SANDBOX", scope: "PAYOUTS_TEST_ONLY",
    accepted: true, acceptanceRefHash: h("explicit-fixture-test-acceptance") } };
}
const jsonResponse = (body, status = 200) => new Response(JSON.stringify(body), { status });
function harness(overrides = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-paypal-connect-"));
  const credentialsFile = path.join(root, "credentials.json");
  const testRecipientFile = path.join(root, "recipient.json");
  const directory = path.join(root, "operations");
  if (!overrides.missingCredentials) writeFileSync(credentialsFile,
    JSON.stringify({ environment: "SANDBOX", clientId: CLIENT, clientSecret: SECRET }), { mode: 0o600 });
  writeFileSync(testRecipientFile, JSON.stringify({ environment: "SANDBOX", testRecipient: recipient }), { mode: 0o600 });
  let time = START; const calls = []; let payload;
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (url === TOKEN_URL) return overrides.oauth ? overrides.oauth({ url, options, calls })
      : jsonResponse({ access_token: TOKEN, token_type: "Bearer", expires_in: 120,
        scope: `openid ${SCOPE} https://uri.paypal.com/services/invoicing` });
    if (options.method === "POST") payload = JSON.parse(options.body);
    const item = { payout_batch_id: "BATCH001", payout_item_id: "ITEM001",
      sender_batch_id: payload.sender_batch_header.sender_batch_id,
      transaction_status: "SUCCESS", payout_item: payload.items[0] };
    const batch_header = { payout_batch_id: "BATCH001", batch_status: "SUCCESS",
      sender_batch_header: payload.sender_batch_header };
    if (options.method === "POST") return jsonResponse({ batch_header }, 201);
    return jsonResponse(url.includes("payouts-item") ? item
      : { batch_header, items: [item], total_items: 1, total_pages: 1 });
  };
  const config = { directory, credentialsFile, testRecipientFile, fetchImpl, clock: () => time };
  return { root, config, credentialsFile, testRecipientFile, directory, calls,
    adapter: createPayPalSandboxConnection(config), setTime: value => { time = value; } };
}

test("private recipient prepares offline without opening missing app credentials or manufacturing acceptance", () => {
  const x = harness({ missingCredentials: true });
  const before = JSON.stringify(input());
  const prepared = x.adapter.prepare(input());
  assert.equal(prepared.status, "PREPARED"); assert.equal(x.calls.length, 0);
  assert.deepEqual(x.adapter.inspect(prepared.operationId), prepared);
  assert.equal(JSON.stringify(input()), before);
  assert.equal(JSON.stringify(prepared).includes(recipient.receiver), false);
  assert.equal(JSON.stringify(prepared).includes(x.credentialsFile), false);
  const rejected = input("unaccepted"); rejected.sandboxAcceptance.accepted = false;
  assert.throws(() => x.adapter.prepare(rejected), /SANDBOX_SCOPE_ACCEPTANCE_REQUIRED/);
  assert.throws(() => x.adapter.prepare({ ...input(), testRecipient: recipient }), /PREPARE_INPUT_INVALID/);
  assert.equal(x.calls.length, 0);
});

test("explicit fixture submit lazily authenticates at sandbox host; cache spans bound item reconciliation", async () => {
  const x = harness(); const prepared = x.adapter.prepare(input());
  assert.equal(x.calls.length, 0);
  assert.equal((await x.adapter.submit(prepared.operationId)).status, "PROVIDER_TEST_ACCEPTED");
  const result = await x.adapter.reconcile(prepared.operationId);
  assert.equal(result.status, "PROVIDER_TEST_COMPLETED");
  assert.equal(result.sourceKind, "PROVIDER_FIXTURE");
  assert.equal(result.actualMoneyMoved, false);
  assert.equal(result.externalSandboxReceiptObserved, false);
  assert.equal(x.calls.length, 4);
  const auth = x.calls[0];
  assert.equal(auth.url, TOKEN_URL); assert.equal(auth.options.redirect, "error");
  assert.equal(auth.options.body, "grant_type=client_credentials");
  assert.equal(auth.options.headers.Authorization, `Basic ${Buffer.from(`${CLIENT}:${SECRET}`).toString("base64")}`);
  assert.equal(auth.options.headers["Content-Type"], "application/x-www-form-urlencoded");
  assert.ok(auth.options.signal instanceof AbortSignal);
  for (const call of x.calls.slice(1)) {
    assert.equal(new URL(call.url).origin, "https://api-m.sandbox.paypal.com");
    assert.equal(call.options.headers.Authorization, `Bearer ${TOKEN}`);
  }
  const operationDirectory = path.join(x.directory, prepared.operationId);
  const persisted = readdirSync(operationDirectory).map(name => readFileSync(path.join(operationDirectory, name), "utf8")).join("\n");
  for (const secret of [CLIENT, SECRET, TOKEN, x.credentialsFile]) {
    assert.equal(persisted.includes(secret), false);
    assert.equal(JSON.stringify(result).includes(secret), false);
  }
});

test("token expiry margin and clock rollback request fresh tokens without replaying payout POST", async () => {
  const x = harness(); const prepared = x.adapter.prepare(input());
  await x.adapter.submit(prepared.operationId);
  x.setTime("2026-09-05T20:01:29.000Z"); await x.adapter.reconcile(prepared.operationId);
  assert.equal(x.calls.filter(c => c.url === TOKEN_URL).length, 1);
  x.setTime("2026-09-05T20:01:30.000Z"); await x.adapter.reconcile(prepared.operationId);
  assert.equal(x.calls.filter(c => c.url === TOKEN_URL).length, 2);
  x.setTime("2026-09-05T20:00:00.000Z"); await x.adapter.reconcile(prepared.operationId);
  assert.equal(x.calls.filter(c => c.url === TOKEN_URL).length, 3);
  assert.equal(x.calls.filter(c => c.options.method === "POST" && c.url !== TOKEN_URL).length, 1);
});

test("concurrent distinct operations share one pending OAuth request", async () => {
  let release; let started;
  const gate = new Promise(resolve => { release = resolve; });
  const opening = new Promise(resolve => { started = resolve; });
  const x = harness({ oauth: async () => {
    started(); await gate;
    return jsonResponse({ access_token: TOKEN, token_type: "Bearer", expires_in: 120, scope: SCOPE });
  } });
  const a = x.adapter.prepare(input("concurrent-a")); const b = x.adapter.prepare(input("concurrent-b"));
  const first = x.adapter.submit(a.operationId);
  await opening;
  const second = x.adapter.submit(b.operationId);
  release();
  const results = await Promise.all([first, second]);
  assert.equal(results.every(result => result.status === "PROVIDER_TEST_ACCEPTED"), true);
  assert.equal(x.calls.filter(c => c.url === TOKEN_URL).length, 1);
});

test("invalid, overlong, redirected, rejected or missing-scope OAuth never dispatches payout or leaks response", async () => {
  const valid = { access_token: TOKEN, token_type: "Bearer", expires_in: 120, scope: SCOPE };
  const cases = [
    () => jsonResponse({ ...valid, scope: `${SCOPE}/not-the-same-grant` }),
    () => jsonResponse({ ...valid, token_type: "MAC" }),
    () => jsonResponse({ ...valid, expires_in: 0 }),
    () => jsonResponse({ ...valid, expires_in: "120" }),
    () => jsonResponse({ ...valid, access_token: "private token with whitespace" }),
    () => jsonResponse({ error_description: SECRET }, 401),
    () => new Response("malformed private token response"),
    () => jsonResponse({ ...valid, padding: "x".repeat(65536) }),
    () => ({ status: 200, redirected: true, body: new Response(JSON.stringify(valid)).body }),
    () => ({ status: 200, url: "https://api-m.paypal.com/v1/oauth2/token", body: new Response(JSON.stringify(valid)).body }),
    () => { throw new Error(`transport included ${SECRET}`); },
  ];
  for (const oauth of cases) {
    const x = harness({ oauth }); const prepared = x.adapter.prepare(input());
    await assert.rejects(x.adapter.submit(prepared.operationId), error => {
      assert.match(error.message, /TOKEN_PROVIDER_FAILED/);
      assert.equal(JSON.stringify(error).includes(SECRET), false);
      assert.equal(error.cause, undefined); return true;
    });
    assert.equal(x.calls.length, 1); assert.equal(x.calls[0].url, TOKEN_URL);
    assert.equal(x.adapter.inspect(prepared.operationId).sandboxSubmissionAttempted, false);
    assert.deepEqual(readdirSync(path.join(x.directory, prepared.operationId)), ["operation.json"]);
  }
});

test("live overrides and insecure private records cannot enable OAuth; changed recipient cannot rebind an operation", async () => {
  const x = harness();
  for (const change of [{ origin: "https://api-m.paypal.com" }, { environment: "LIVE" },
    { tokenUrl: TOKEN_URL }, { credentialsFile: "relative.json" }, { getAccessToken: () => TOKEN }]) {
    assert.throws(() => createPayPalSandboxConnection({ ...x.config, ...change }), /CONFIG_INVALID_OR_ENDPOINT_OVERRIDE/);
  }
  const prepared = x.adapter.prepare(input());
  for (const content of ["not JSON", JSON.stringify({ environment: "LIVE", clientId: CLIENT, clientSecret: SECRET })]) {
    writeFileSync(x.credentialsFile, content);
    await assert.rejects(x.adapter.submit(prepared.operationId), /TOKEN_PROVIDER_FAILED/);
  }
  writeFileSync(x.credentialsFile, JSON.stringify({ environment: "SANDBOX", clientId: CLIENT, clientSecret: SECRET }));
  chmodSync(x.credentialsFile, 0o644);
  await assert.rejects(x.adapter.submit(prepared.operationId), /TOKEN_PROVIDER_FAILED/);
  assert.equal(x.calls.length, 0);
  writeFileSync(x.testRecipientFile, JSON.stringify({ environment: "SANDBOX",
    testRecipient: { ...recipient, receiver: "other-fixture@example.invalid" } }));
  assert.throws(() => x.adapter.prepare(input()), /TRANSFER_BINDING_CHANGED/);
  chmodSync(x.testRecipientFile, 0o644);
  assert.throws(() => x.adapter.prepare(input("new")), /RECIPIENT_PRIVATE_JSON_REQUIRED/);
});
