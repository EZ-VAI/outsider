import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { inspectSandboxLiabilityStatus }
  from "../src/outsider-sandbox-liability-status.js";

const h = char => `sha256:${char.repeat(64)}`;
const write = (root, name, value) => { const file = path.join(root, name);
  writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); return file; };
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-liability-"));
  const transfer = { idempotencyKey: h("a"), termRefHash: h("b"),
    amount: { currency: "USD", minorUnits: "5000" } };
  const result = { schema: "outsider/private-digital-goal-mvp-result/v1",
    delivery: { program: { state: "SUCCEEDED", programHash: h("c") } },
    sandboxContractDraft: { contractHash: h("d") },
    actualOutcomeDecision: { decision: "NO_SANDBOX_COMPENSATION" },
    failureRehearsal: { decision: "SANDBOX_COMPENSATION_CALCULATED",
      rehearsal: { kind: "CONTROLLED_FAILURE_REHEARSAL", scenarioRefHash: h("e") },
      sandboxTransfer: transfer } };
  const operation = { environment: "SANDBOX", sourceKind: "PAYPAL_SANDBOX_API",
    transferIdempotencyKey: h("a"), amount: transfer.amount,
    status: "PROVIDER_TEST_PENDING", operationId: "paypal-sandbox-fixture",
    operationHash: h("f"), journalHeadHash: h("1"), providerItemStatus: "UNCLAIMED",
    externalSandboxReceiptObserved: true, eventCount: 4,
    sources: [{ method: "POST", httpStatus: 201, bytes: 347, hash: h("2") }] };
  const payout = { schema: "outsider/private-paypal-sandbox-payout-command/v1",
    mode: "CONTROLLED_FAILURE_REHEARSAL_ONLY", programHash: h("c"),
    actualCompensationDue: null, realMoneyMoved: false,
    commercialGuaranteeCreated: false, operation };
  return { root, result, payout };
}

test("binds actual success and external sandbox payout without inventing actual liability", () => {
  const f = fixture();
  const value = inspectSandboxLiabilityStatus({
    resultFile: write(f.root, "result.json", f.result),
    payoutRecordFile: write(f.root, "payout.json", f.payout) });
  assert.equal(value.actualOutcome.state, "SUCCEEDED");
  assert.equal(value.actualOutcome.compensationDue, null);
  assert.equal(value.controlledFailureRehearsal.amount.minorUnits, "5000");
  assert.equal(value.payoutTransport.externalReceiptObserved, true);
  assert.equal(value.payoutTransport.providerItemStatus, "UNCLAIMED");
  assert.equal(value.responsibilityState, "SANDBOX_REHEARSAL_OPEN");
  assert.equal(value.realMoneyMoved, false);
});

test("rejects a payout from another transfer", () => {
  const f = fixture(); f.payout.operation.transferIdempotencyKey = h("9");
  assert.throws(() => inspectSandboxLiabilityStatus({
    resultFile: write(f.root, "result.json", f.result),
    payoutRecordFile: write(f.root, "payout.json", f.payout) }), /PAYOUT_BINDING_INVALID/u);
});
