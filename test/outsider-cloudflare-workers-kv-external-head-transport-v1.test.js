import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, realpathSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  OUTSIDER_CLOUDFLARE_WORKERS_KV_EXTERNAL_HEAD_TRANSPORT_V1_BOUNDARY,
  createCloudflareWorkersKvExternalHeadTransportV1,
} from "../src/outsider-cloudflare-workers-kv-external-head-transport-v1.js";
import {
  publishDurableEffectLedgerExternalHeadV1,
} from "../src/outsider-durable-effect-ledger-external-head-publication-v1.js";
import {
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
} from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const ACCOUNT_ID = "11111111111111111111111111111111";
const NAMESPACE_ID = "22222222222222222222222222222222";
const KEY = "outsider/external-head/v1/33333333333333333333333333333333/000000000001.json";
const LEDGER_ID = "ledger_0123456789abcdef0123456789abcdef";
const PUBLISHED_AT = "2026-09-04T12:05:00.000Z";
const OBSERVED_AT = "2026-09-04T12:05:01.000Z";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function initialize(t) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-cloudflare-kv-head-v1-")));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const directory = path.join(parent, "ledger");
  const genesis = createDurableOneUseEndpointEffectEventV1({
    ledgerId: LEDGER_ID,
    eventType: "INTENT_ADMITTED",
    effectIdHash: h("effect-1"),
    transactionBindingHash: h("transaction-1"),
    endpointBindingHash: h("endpoint-1"),
    adapterInstanceRefHash: h("adapter-1"),
    permissionGrantHash: h("permission-1"),
    oneUseNonceHash: h("nonce-1"),
    idempotencyKeyHash: h("idempotency-1"),
    bodyHash: h("body-1"),
    effectDeadline: "2026-09-04T14:00:00.000Z",
    recordedAt: "2026-09-04T12:00:00.000Z",
    previousEffectEventHash: null,
    occurrenceNonceHash: h("occurrence:intent"),
    endpointReceiptHash: null,
    terminalEvidenceHash: null,
  });
  const verified = initializeDurableOneUseEndpointEffectLedgerV1({
    directory, ledgerId: LEDGER_ID, genesisEvent: genesis,
  });
  return { directory, verified };
}

function publicationInput(initialized, sequence = 1) {
  return {
    localLedger: {
      directory: initialized.directory,
      ledgerId: LEDGER_ID,
      expectedLocalHeadHash: initialized.verified.head.headHash,
    },
    publishedAt: PUBLISHED_AT,
    externalChain: {
      expectedSequence: sequence,
      previousReceiptHash: sequence === 1 ? null : h("previous-receipt"),
    },
  };
}

function adapter(kvBinding, overrides = {}) {
  return createCloudflareWorkersKvExternalHeadTransportV1({
    accountId: ACCOUNT_ID,
    namespaceId: NAMESPACE_ID,
    key: KEY,
    kvBinding,
    clock: () => OBSERVED_AT,
    ...overrides,
  });
}

function transportDependencies(created) {
  return {
    transport: created.transport,
    transportId: created.transportId,
    transportPolicyHash: created.transportPolicyHash,
    timeoutMs: 1_000,
  };
}

test("one sealed KV key receives one exact PUT then one exact-byte GET", async (t) => {
  const initialized = initialize(t);
  const calls = [];
  let stored = null;
  const binding = {
    async put(key, value) {
      calls.push({ method: "PUT", key, value });
      stored = value;
    },
    async get(key, options) {
      calls.push({ method: "GET", key, options });
      return stored;
    },
    async delete() { calls.push({ method: "DELETE" }); },
    async list() { calls.push({ method: "LIST" }); },
  };
  const created = adapter(binding);
  const result = await publishDurableEffectLedgerExternalHeadV1(
    publicationInput(initialized), transportDependencies(created));

  assert.deepEqual(calls.map((call) => call.method), ["PUT", "GET"]);
  assert.equal(calls[0].key, KEY);
  assert.equal(calls[1].key, KEY);
  assert.deepEqual(calls[1].options, { type: "text" });
  assert.equal(calls[1].value, undefined);
  assert.equal(result.ok, true);
  assert.equal(result.receiptExactCommitmentBindingVerified, true);
  assert.equal(result.externalAnchorEstablished, false);
  assert.equal(result.providerAcknowledgementIsAuthority, false);
  assert.equal(result.providerAcknowledgementIsOutcomeTruth, false);
  assert.equal(result.decisionState, "HOLD");

  const persisted = JSON.parse(stored);
  assert.equal(persisted.requestHash, result.request.requestHash);
  assert.equal(persisted.commitmentHash, result.commitment.commitmentHash);
  assert.equal(persisted.externalSequence, 1);
  assert.equal(persisted.durableAppendOnlyExternalHistoryEstablished, false);
  for (const privateValue of [ACCOUNT_ID, NAMESPACE_ID, KEY,
    initialized.directory, LEDGER_ID]) {
    assert.equal(stored.includes(privateValue), false);
    assert.equal(JSON.stringify(created).includes(privateValue), false);
  }
  assert.equal(created.publicProjection.boundary,
    OUTSIDER_CLOUDFLARE_WORKERS_KV_EXTERNAL_HEAD_TRANSPORT_V1_BOUNDARY);
});

test("non-exact GET replay returns HOLD failure with no retry", async (t) => {
  const initialized = initialize(t);
  const calls = [];
  const created = adapter({
    async put(key, value) { calls.push({ method: "PUT", key, value }); },
    async get(key) {
      calls.push({ method: "GET", key });
      return "tampered-or-stale-value";
    },
  });
  await assert.rejects(() => publishDurableEffectLedgerExternalHeadV1(
    publicationInput(initialized), transportDependencies(created)),
  /TRANSPORT_FAILED_OR_TIMED_OUT_NO_AUTOMATIC_RETRY/u);
  assert.deepEqual(calls.map((call) => call.method), ["PUT", "GET"]);

  await assert.rejects(() => publishDurableEffectLedgerExternalHeadV1(
    publicationInput(initialized), transportDependencies(created)),
  /TRANSPORT_FAILED_OR_TIMED_OUT_NO_AUTOMATIC_RETRY/u);
  assert.deepEqual(calls.map((call) => call.method), ["PUT", "GET"]);
});

test("ambiguous PUT failure is single-attempt and never followed by GET", async (t) => {
  const initialized = initialize(t);
  const calls = [];
  const created = adapter({
    async put(key) {
      calls.push({ method: "PUT", key });
      throw new Error("fixture commit may have happened");
    },
    async get(key) { calls.push({ method: "GET", key }); return null; },
  });
  await assert.rejects(() => publishDurableEffectLedgerExternalHeadV1(
    publicationInput(initialized), transportDependencies(created)),
  /TRANSPORT_FAILED_OR_TIMED_OUT_NO_AUTOMATIC_RETRY/u);
  assert.deepEqual(calls.map((call) => call.method), ["PUT"]);
});

test("predeclared version sequence mismatch fails before KV I/O", async (t) => {
  const initialized = initialize(t);
  const calls = [];
  const created = adapter({
    async put() { calls.push("PUT"); },
    async get() { calls.push("GET"); return null; },
  });
  await assert.rejects(() => publishDurableEffectLedgerExternalHeadV1(
    publicationInput(initialized, 2), transportDependencies(created)),
  /TRANSPORT_FAILED_OR_TIMED_OUT_NO_AUTOMATIC_RETRY/u);
  assert.deepEqual(calls, []);
});

test("factory rejects tokens and non-versioned keys", () => {
  const binding = { async put() {}, async get() { return null; } };
  assert.throws(() => createCloudflareWorkersKvExternalHeadTransportV1({
    accountId: ACCOUNT_ID,
    namespaceId: NAMESPACE_ID,
    key: KEY,
    kvBinding: binding,
    apiToken: "must-not-be-accepted",
  }), /CONFIG_SHAPE_INVALID/u);
  assert.throws(() => adapter(binding, { key: "current-head.json" }),
    /VERSIONED_KEY_INVALID/u);
});

