import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, mkdtempSync, realpathSync, rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_BOUNDARY,
  OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS,
  publishDurableEffectLedgerExternalHeadV1,
} from "../src/outsider-durable-effect-ledger-external-head-publication-v1.js";
import {
  appendDurableOneUseEndpointEffectLedgerV1,
  createDurableOneUseEndpointEffectEventV1,
  initializeDurableOneUseEndpointEffectLedgerV1,
} from "../src/outsider-durable-one-use-endpoint-effect-ledger-v1.js";

const LEDGER_ID = "ledger_0123456789abcdef0123456789abcdef";
const DEADLINE = "2026-09-04T14:00:00.000Z";
const PUBLISHED_AT = "2026-09-04T12:05:00.000Z";
const OBSERVED_AT = "2026-09-04T12:05:01.000Z";

function h(label) {
  return `sha256:${createHash("sha256").update(label, "utf8").digest("hex")}`;
}

function target(t) {
  const parent = realpathSync(mkdtempSync(path.join(tmpdir(),
    "outsider-effect-external-head-v1-")));
  chmodSync(parent, 0o700);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  return path.join(parent, "ledger");
}

function event(type, previousEffectEventHash = null) {
  return createDurableOneUseEndpointEffectEventV1({
    ledgerId: LEDGER_ID,
    eventType: type,
    effectIdHash: h("effect-1"),
    transactionBindingHash: h("transaction-1"),
    endpointBindingHash: h("endpoint-1"),
    adapterInstanceRefHash: h("adapter-1"),
    permissionGrantHash: h("permission-1"),
    oneUseNonceHash: h("nonce-1"),
    idempotencyKeyHash: h("idempotency-1"),
    bodyHash: h("body-1"),
    effectDeadline: DEADLINE,
    recordedAt: type === "INTENT_ADMITTED"
      ? "2026-09-04T12:00:00.000Z" : "2026-09-04T12:01:00.000Z",
    previousEffectEventHash,
    occurrenceNonceHash: h(`occurrence:${type}`),
    endpointReceiptHash: null,
    terminalEvidenceHash: null,
  });
}

function initialize(t) {
  const directory = target(t);
  const intent = event("INTENT_ADMITTED");
  const verified = initializeDurableOneUseEndpointEffectLedgerV1({
    directory, ledgerId: LEDGER_ID, genesisEvent: intent,
  });
  return { directory, intent, verified };
}

function receipt(request, overrides = {}) {
  return {
    schema:
      OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_SCHEMAS
        .transportReceipt,
    status: "APPENDED",
    requestHash: request.requestHash,
    commitmentHash: request.commitmentHash,
    subjectDigestHex: request.subject.digestHex,
    transportId: request.transportBinding.transportId,
    transportPolicyHash: request.transportBinding.transportPolicyHash,
    externalSequence: request.externalChainExpectation.expectedSequence,
    previousReceiptHash: request.externalChainExpectation.previousReceiptHash,
    providerReceiptHash: h("provider-receipt-1"),
    observedAt: OBSERVED_AT,
    ...overrides,
  };
}

function input(initialized, overrides = {}) {
  return {
    localLedger: {
      directory: initialized.directory,
      ledgerId: LEDGER_ID,
      expectedLocalHeadHash: initialized.verified.head.headHash,
    },
    publishedAt: PUBLISHED_AT,
    externalChain: { expectedSequence: 1, previousReceiptHash: null },
    ...overrides,
  };
}

function dependencies(transport) {
  return {
    transport,
    transportId: "fixture.external-anchor",
    transportPolicyHash: h("transport-policy-v1"),
    timeoutMs: 1_000,
  };
}

test("publishes one digest-only exact durable head/entry-set commitment", async (t) => {
  const initialized = initialize(t);
  let outbound;
  const result = await publishDurableEffectLedgerExternalHeadV1(
    input(initialized), dependencies(async (request) => {
      outbound = request;
      return receipt(request);
    }));

  assert.equal(result.ok, true);
  assert.equal(result.commitment.headHash, initialized.verified.head.headHash);
  assert.equal(result.commitment.headEntryHash,
    initialized.verified.head.headEntryHash);
  assert.equal(result.commitment.entrySetRoot,
    initialized.verified.head.entrySetRoot);
  assert.equal(result.commitment.entryCount, 1);
  assert.equal(result.receipt.commitmentHash, result.commitment.commitmentHash);
  assert.equal(result.receiptExactCommitmentBindingVerified, true);
  assert.equal(result.injectedTransportInvokedOnce, true);

  const encoded = JSON.stringify(outbound);
  assert.equal(encoded.includes(initialized.directory), false);
  assert.equal(encoded.includes(LEDGER_ID), false);
  assert.equal(encoded.includes("transaction-1"), false);
  assert.equal(outbound.subject.digestHex,
    result.commitment.commitmentHash.slice("sha256:".length));
  assert.deepEqual(Object.keys(outbound.subject), ["kind", "algorithm", "digestHex"]);
});

test("rejects a copied or cross-commitment receipt instead of upgrading it", async (t) => {
  const initialized = initialize(t);
  let calls = 0;
  await assert.rejects(() => publishDurableEffectLedgerExternalHeadV1(
    input(initialized), dependencies(async (request) => {
      calls += 1;
      return receipt(request, { commitmentHash: h("different-ledger-head") });
    })), /TRANSPORT_RECEIPT_EXACT_BINDING_MISMATCH/u);
  assert.equal(calls, 1);
});

test("a stale local head fails before the injected transport is called", async (t) => {
  const initialized = initialize(t);
  const reserved = event("SUBMIT_RESERVED", initialized.intent.eventHash);
  appendDurableOneUseEndpointEffectLedgerV1({
    directory: initialized.directory,
    ledgerId: LEDGER_ID,
    event: reserved,
    expectedLocalHeadHash: initialized.verified.head.headHash,
  });
  let calls = 0;
  await assert.rejects(() => publishDurableEffectLedgerExternalHeadV1(
    input(initialized), dependencies(async (request) => {
      calls += 1;
      return receipt(request);
    })), /FRESH_EXACT_LOCAL_LEDGER_REPLAY_FAILED/u);
  assert.equal(calls, 0);
});

test("provider APPENDED acknowledgement remains HOLD and proves no external truth",
  async (t) => {
    const initialized = initialize(t);
    const predecessor = h("prior-external-receipt");
    const result = await publishDurableEffectLedgerExternalHeadV1(
      input(initialized, {
        externalChain: { expectedSequence: 2, previousReceiptHash: predecessor },
      }), dependencies(async (request) => receipt(request)));

    assert.equal(result.receipt.externalSequence, 2);
    assert.equal(result.receipt.previousReceiptHash, predecessor);
    assert.equal(result.receipt.providerAppendClaimObserved, true);
    assert.equal(result.receipt.providerAppendClaimCryptographicallyVerified, false);
    assert.equal(result.providerAcknowledgementIsAuthority, false);
    assert.equal(result.providerAcknowledgementIsOutcomeTruth, false);
    assert.equal(result.cryptographicSubjectBindingVerified, false);
    assert.equal(result.externalAnchorEstablished, false);
    assert.equal(result.durableAppendOnlyExternalHistoryEstablished, false);
    assert.equal(result.externalNonEquivocationEstablished, false);
    assert.equal(result.authority, "NONE");
    assert.equal(result.decisionState, "HOLD");
    assert.equal(result.boundary,
      OUTSIDER_DURABLE_EFFECT_LEDGER_EXTERNAL_HEAD_PUBLICATION_V1_BOUNDARY);
  });

