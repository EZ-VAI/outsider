import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createPayPalPayoutSandboxAdapter } from "../src/outsider-paypal-payout-sandbox.js";
import { createOutcomeEconomicContractDraftV1 } from "../src/outsider-outcome-economic-contract-v1.js";
import { compileSandboxOutcomeCompensation } from "../src/outsider-outcome-compensation-sandbox.js";

const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const time = "2026-09-05T18:00:00.000Z";
function input(minorUnits = "5000") {
  const contractDraft = createOutcomeEconomicContractDraftV1({
    contractVersion: 1, supersedesContractHash: null,
    outcomeProgramHash: hash("program"), outcomeDefinitionHash: hash("definition"), episodeRefHash: hash("episode"),
    compensationTerms: [{ termRefHash: hash("term"), triggerPredicateRefHash: hash("trigger"),
      responsiblePartyRefHash: hash("responsible"), beneficiaryRefHash: hash("beneficiary"),
      paymentDueWithinSeconds: 86400, calculation: { kind: "FIXED", amount: { currency: "USD", minorUnits } } }],
  });
  const result = compileSandboxOutcomeCompensation({ contractDraft, createdAt: time,
    terminalOutcome: { programId: "test-program", programHash: hash("program"),
      state: "SUCCEEDED", journalHeadHash: hash("journal") },
    scenario: { kind: "CONTROLLED_FAILURE_REHEARSAL", scenarioRefHash: hash("scenario"),
      termRefHash: hash("term"), triggerPredicateRefHash: hash("trigger"), quantity: null,
      evidenceRefHashes: [hash("evidence")] },
  });
  return { sandboxTransfer: result.sandboxTransfer,
    testRecipient: { recipientType: "EMAIL", receiver: "test-beneficiary@example.invalid",
      isSandboxAccount: true, testAccountRefHash: hash("test-account") },
    sandboxAcceptance: { environment: "SANDBOX", scope: "PAYOUTS_TEST_ONLY", accepted: true,
      acceptanceRefHash: hash("test-scope") } };
}
function harness(overrides = {}) {
  const directory = overrides.directory ?? mkdtempSync(path.join(os.tmpdir(), "outsider-paypal-sandbox-"));
  const calls = []; let payload;
  const response = (body, status = 200) => new Response(JSON.stringify(body), { status,
    headers: { "Content-Type": "application/json" } });
  const batchId = "BATCH001"; const itemId = "ITEM001";
  const item = (status = "SUCCESS") => ({ payout_item_id: itemId, payout_batch_id: batchId,
    sender_batch_id: payload.sender_batch_header.sender_batch_id,
    transaction_status: status, payout_item: payload.items[0] });
  const batch = (status = "SUCCESS") => ({ total_items: 1, total_pages: 1,
    batch_header: { payout_batch_id: batchId, batch_status: status,
      sender_batch_header: payload.sender_batch_header }, items: [item()] });
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST") payload = JSON.parse(options.body);
    if (overrides.fetch) return overrides.fetch({ url, options, calls, payload, response, batch, item });
    if (options.method === "POST") return response({ batch_header: batch().batch_header }, 201);
    return response(url.includes("payouts-item") ? item() : batch());
  };
  const adapter = createPayPalPayoutSandboxAdapter({ directory, clock: overrides.clock ?? (() => time),
    getAccessToken: async () => "FIXTURE_TOKEN_NOT_REAL", fetchImpl });
  return { directory, adapter, calls, fetchImpl, get payload() { return payload; } };
}

test("existing compensation draft prepares immutable exact payload without submitting", () => {
  const h = harness(); const source = input("1"); const before = JSON.stringify(source);
  const result = h.adapter.prepare(source);
  assert.equal(result.status, "PREPARED"); assert.equal(h.calls.length, 0);
  const operation = JSON.parse(readFileSync(path.join(h.directory, result.operationId, "operation.json")));
  assert.equal(JSON.parse(operation.payloadBytes).items[0].amount.value, "0.01");
  assert.equal(hash(operation.payloadBytes), result.requestPayloadHash);
  assert.equal(JSON.stringify(source), before);
  assert.deepEqual(h.adapter.prepare(source), result);
  assert.equal(JSON.stringify(result).includes(source.testRecipient.receiver), false);
  assert.equal(result.actualCompensationDue, null); assert.equal(result.actualMoneyMoved, false);
});

test("POST persists same operation first; only matching item detail completes, fixtures remain fixtures", async () => {
  let operationFile;
  const h = harness({ fetch: ({ options, payload, response, batch, item }) => {
    assert.equal(statSync(operationFile).mode & 0o777, 0o600);
    const directory = path.dirname(operationFile);
    assert.ok(readdirSync(directory).includes("event-00000001.json"));
    assert.equal(options.redirect, "error");
    if (options.method === "POST") {
      const operation = JSON.parse(readFileSync(operationFile));
      assert.equal(options.body, operation.payloadBytes);
      assert.equal(options.headers["PayPal-Request-Id"], payload.sender_batch_header.sender_batch_id);
      return response({ batch_header: batch().batch_header }, 201);
    }
    return response(h.calls.at(-1).url.includes("payouts-item") ? item() : batch());
  } });
  const prepared = h.adapter.prepare(input());
  operationFile = path.join(h.directory, prepared.operationId, "operation.json");
  const accepted = await h.adapter.submit(prepared.operationId);
  assert.equal(accepted.status, "PROVIDER_TEST_ACCEPTED");
  assert.equal(accepted.providerItemStatus, null);
  const complete = await h.adapter.reconcile(prepared.operationId);
  assert.equal(complete.status, "PROVIDER_TEST_COMPLETED");
  assert.equal(complete.providerItemStatus, "SUCCESS");
  assert.equal(complete.sourceKind, "PROVIDER_FIXTURE");
  assert.equal(complete.externalSandboxReceiptObserved, false);
  assert.equal(complete.actualMoneyMoved, false);
  assert.equal(h.calls.length, 3);
  for (const call of h.calls) assert.equal(new URL(call.url).origin, "https://api-m.sandbox.paypal.com");
  for (const source of complete.sources) {
    const file = path.join(h.directory, prepared.operationId, source.file);
    assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(hash(readFileSync(file)), source.hash);
    assert.equal(statSync(file).size, source.bytes);
  }
  assert.equal(JSON.stringify(complete).includes("FIXTURE_TOKEN_NOT_REAL"), false);
});

test("cold restart queries known batch without another POST", async () => {
  const h = harness(); const prepared = h.adapter.prepare(input());
  await h.adapter.submit(prepared.operationId);
  const cold = createPayPalPayoutSandboxAdapter({ directory: h.directory,
    clock: () => time, fetchImpl: h.fetchImpl, getAccessToken: async () => "FIXTURE_TOKEN" });
  assert.equal((await cold.submit(prepared.operationId)).status, "PROVIDER_TEST_COMPLETED");
  assert.equal(h.calls.filter((call) => call.options.method === "POST").length, 1);
});

test("whole operation lock keeps overlapping submit/reconcile out until the first response is journaled", { timeout: 5000 }, async () => {
  let releaseResponse; let markStarted;
  const responseGate = new Promise(resolve => { releaseResponse = resolve; });
  const started = new Promise(resolve => { markStarted = resolve; });
  const h = harness({ fetch: async ({ response, batch }) => {
    markStarted(); await responseGate;
    return response({ batch_header: batch().batch_header }, 201);
  } });
  const prepared = h.adapter.prepare(input());
  const second = createPayPalPayoutSandboxAdapter({ directory: h.directory,
    clock: () => time, fetchImpl: h.fetchImpl, getAccessToken: async () => "FIXTURE_TOKEN" });
  const first = h.adapter.submit(prepared.operationId);
  try {
    await Promise.race([started, first]);
    assert.equal(second.inspect(prepared.operationId).status, "PROVIDER_TEST_SUBMISSION_UNKNOWN");
    await assert.rejects(second.submit(prepared.operationId), /NODE_ALREADY_RUNNING/);
    await assert.rejects(second.reconcile(prepared.operationId), /NODE_ALREADY_RUNNING/);
    assert.equal(h.calls.length, 1);
  } finally { releaseResponse(); }
  const result = await first;
  assert.equal(result.status, "PROVIDER_TEST_ACCEPTED");
  assert.equal(result.eventCount, 2);
  assert.equal(result.sources.length, 1);
  assert.equal(readdirSync(path.join(h.directory, prepared.operationId))
    .filter(name => name.startsWith("source-")).length, result.sources.length);
  assert.deepEqual(second.inspect(prepared.operationId), result);
});

test("timeout stays UNKNOWN; cold explicit retry keeps exact IDs and bytes", async () => {
  const h = harness({ fetch: ({ options, calls, response, batch }) => {
    if (calls.length === 1) throw new Error("private provider details must not leak");
    return response({ batch_header: batch().batch_header }, 201);
  } });
  const prepared = h.adapter.prepare(input());
  const unknown = await h.adapter.submit(prepared.operationId);
  assert.equal(unknown.status, "PROVIDER_TEST_SUBMISSION_UNKNOWN");
  assert.equal(unknown.payoutBatchId, null);
  assert.equal(JSON.stringify(unknown).includes("private provider details"), false);
  const cold = createPayPalPayoutSandboxAdapter({ directory: h.directory,
    clock: () => time, fetchImpl: h.fetchImpl, getAccessToken: async () => "FIXTURE_TOKEN" });
  assert.equal(cold.inspect(prepared.operationId).status, unknown.status);
  await cold.reconcile(prepared.operationId); assert.equal(h.calls.length, 1);
  assert.equal((await cold.submit(prepared.operationId)).status, "PROVIDER_TEST_ACCEPTED");
  assert.equal(h.calls[0].options.body, h.calls[1].options.body);
  assert.equal(h.calls[0].options.headers["PayPal-Request-Id"], h.calls[1].options.headers["PayPal-Request-Id"]);
});

test("same sender ID is never submitted beyond the provider 30-day retention window", async () => {
  let current = time;
  const h = harness({ clock: () => current, fetch: async () => { throw new Error("timeout"); } });
  const prepared = h.adapter.prepare(input()); await h.adapter.submit(prepared.operationId);
  current = "2026-10-05T18:00:00.000Z";
  await assert.rejects(h.adapter.submit(prepared.operationId), /IDEMPOTENCY_WINDOW_EXPIRED/);
  assert.equal(h.calls.length, 1);
});

test("binding changes, live endpoint, fake real receipts and unaccepted test scope are rejected", () => {
  const h = harness(); const original = input(); h.adapter.prepare(original);
  for (const mutate of [
    (x) => { x.testRecipient.receiver = "different-test@example.invalid"; },
    (x) => { x.sandboxTransfer.amount.minorUnits = "5001"; },
  ]) { const changed = structuredClone(original); mutate(changed);
    assert.throws(() => h.adapter.prepare(changed), /TRANSFER_BINDING_CHANGED/); }
  const unaccepted = structuredClone(original); unaccepted.sandboxAcceptance.accepted = false;
  assert.throws(() => h.adapter.prepare(unaccepted), /SANDBOX_SCOPE_ACCEPTANCE_REQUIRED/);
  const notTest = structuredClone(original); notTest.testRecipient.isSandboxAccount = false;
  assert.throws(() => h.adapter.prepare(notTest), /EXPLICIT_SANDBOX_RECIPIENT_REQUIRED/);
  assert.throws(() => createPayPalPayoutSandboxAdapter({ directory: h.directory,
    baseURL: "https://api-m.paypal.com" }), /ENDPOINT_OVERRIDE/);
  assert.throws(() => createPayPalPayoutSandboxAdapter({ directory: h.directory,
    fetchImpl: h.fetchImpl, sourceKind: "PAYPAL_SANDBOX_API" }), /SOURCE_KIND_MISMATCH/);
  assert.equal(h.calls.length, 0);
});

test("batch SUCCESS with item FAILED is failed, not completed", async () => {
  const h = harness({ fetch: ({ url, options, response, batch, item }) =>
    response(options.method === "POST" ? { batch_header: batch().batch_header }
      : url.includes("payouts-item") ? item("FAILED") : batch(), options.method === "POST" ? 201 : 200) });
  const prepared = h.adapter.prepare(input()); await h.adapter.submit(prepared.operationId);
  const result = await h.adapter.reconcile(prepared.operationId);
  assert.equal(result.status, "PROVIDER_TEST_FAILED"); assert.equal(result.providerItemStatus, "FAILED");
});

test("item receiver, amount, currency, batch and identity mismatches cannot complete", async () => {
  for (const mutate of [
    (x) => { x.payout_item.receiver = "wrong@example.invalid"; },
    (x) => { x.payout_item.amount.value = "50.01"; },
    (x) => { x.payout_item.amount.currency = "EUR"; },
    (x) => { x.payout_batch_id = "UNRELATED"; },
    (x) => { x.payout_item.sender_item_id = "OTHER"; },
  ]) {
    const h = harness({ fetch: ({ url, options, response, batch, item }) => {
      if (options.method === "POST") return response({ batch_header: batch().batch_header }, 201);
      if (!url.includes("payouts-item")) return response(batch());
      const result = structuredClone(item()); mutate(result); return response(result);
    } });
    const prepared = h.adapter.prepare(input()); await h.adapter.submit(prepared.operationId);
    assert.equal((await h.adapter.reconcile(prepared.operationId)).status, "PROVIDER_TEST_RECONCILIATION_REQUIRED");
  }
});

test("duplicate batch response only binds sandbox query route; foreign links are never followed", async () => {
  for (const origin of ["https://api-m.sandbox.paypal.com", "https://api-m.paypal.com"]) {
    const h = harness({ fetch: ({ options, response }) => response({ name: "DUPLICATE_BATCH_ID",
      links: [{ rel: "duplicate", method: "GET", href: `${origin}/v1/payments/payouts/BATCH001` }] }, 400) });
    const prepared = h.adapter.prepare(input()); const result = await h.adapter.submit(prepared.operationId);
    assert.equal(result.payoutBatchId, origin.includes("sandbox") ? "BATCH001" : null);
    assert.notEqual(result.status, "PROVIDER_TEST_COMPLETED");
    assert.equal(h.calls.length, 1);
  }
});

test("private source replay detects changed raw response and does not rewrite evidence", async () => {
  const h = harness(); const prepared = h.adapter.prepare(input());
  const result = await h.adapter.submit(prepared.operationId);
  const file = path.join(h.directory, prepared.operationId, result.sources[0].file);
  writeFileSync(file, "modified fixture", { mode: 0o600 });
  assert.throws(() => h.adapter.inspect(prepared.operationId), /SOURCE_REPLAY_MISMATCH/);
});

test("offline prepare needs no token but HTTP does; an unknown provider status stays unsupported", async () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), "outsider-paypal-offline-"));
  const offline = createPayPalPayoutSandboxAdapter({ directory });
  const prepared = offline.prepare(input());
  await assert.rejects(offline.submit(prepared.operationId), /TOKEN_PROVIDER_NOT_CONFIGURED/);
  assert.equal(offline.inspect(prepared.operationId).sandboxSubmissionAttempted, false);
  const h = harness({ fetch: ({ url, options, response, batch, item }) => response(
    options.method === "POST" ? { batch_header: batch().batch_header }
      : url.includes("payouts-item") ? item("FUTURE_UNKNOWN_STATUS") : batch(), options.method === "POST" ? 201 : 200) });
  const result = h.adapter.prepare(input()); await h.adapter.submit(result.operationId);
  assert.equal((await h.adapter.reconcile(result.operationId)).status, "PROVIDER_TEST_UNSUPPORTED");
});
