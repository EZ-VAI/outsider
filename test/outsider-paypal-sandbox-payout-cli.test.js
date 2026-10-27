import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runPayPalSandboxPayoutCli } from "../scripts/outsider-paypal-sandbox-payout.mjs";
import { writePrivateExecutionRecordOnce as write } from "../src/outsider-user-held-durable-execution-v2.js";
const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;

test("one-shot bridge prepares/inspects offline and binds existing rehearsal to exact test acceptance", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-paypal-cli-fixture-"));
  const file = name => path.join(root, name);
  const transfer = { idempotencyKey: hash("fixture-transfer"), termRefHash: hash("fixture-term"),
    status: "SIMULATED_NOT_SUBMITTED", submitted: false, moneyMoved: false, paymentAuthorized: false,
    amount: { currency: "USD", minorUnits: "5000" } };
  write(file("result.json"), { schema: "outsider/private-digital-goal-mvp-result/v1",
    delivery: { program: { state: "SUCCEEDED", programHash: hash("fixture-program") } },
    actualOutcomeDecision: { decision: "NO_SANDBOX_COMPENSATION" },
    failureRehearsal: { rehearsal: { kind: "CONTROLLED_FAILURE_REHEARSAL" },
      decision: "SANDBOX_COMPENSATION_CALCULATED", sandboxTransfer: transfer } });
  write(file("recipient.json"), { environment: "SANDBOX", testRecipient: { recipientType: "EMAIL",
    receiver: "fictional-recipient@example.invalid", isSandboxAccount: true,
    testAccountRefHash: hash("fixture-account") } });
  const authorization = { transferIdempotencyKey: transfer.idempotencyKey,
    testAccountRefHash: hash("fixture-account"), amount: transfer.amount,
    sandboxAcceptance: { environment: "SANDBOX", scope: "PAYOUTS_TEST_ONLY", accepted: true,
      acceptanceRefHash: hash("fictional-test-acceptance-not-real-user-approval") } };
  write(file("authorization.json"), authorization);
  const config = { directory: file("operations"), credentialsFile: file("MISSING-CREDENTIALS.json"),
    testRecipientFile: file("recipient.json"), resultFile: file("result.json"), authorizationFile: file("authorization.json") };
  write(file("config.json"), config);
  const prepared = await runPayPalSandboxPayoutCli(["prepare", file("config.json"), "--output", file("prepared.json")]);
  assert.equal(prepared.status, "PREPARED"); assert.equal(prepared.externalSandboxReceiptObserved, false);
  assert.equal(prepared.realMoneyMoved, false); assert.equal(existsSync(config.credentialsFile), false);
  const inspected = await runPayPalSandboxPayoutCli(["inspect", file("config.json"), "--output",
    file("inspected.json"), prepared.operationId]);
  assert.equal(inspected.status, "PREPARED");
  await assert.rejects(runPayPalSandboxPayoutCli(["prepare", file("config.json"), "--output", file("prepared.json")]), /OUTPUT_EXISTS/);
  write(file("wrong-authorization.json"), { ...authorization, amount: { currency: "USD", minorUnits: "1" } });
  write(file("wrong-config.json"), { ...config, authorizationFile: file("wrong-authorization.json") });
  await assert.rejects(runPayPalSandboxPayoutCli(["prepare", file("wrong-config.json"), "--output", file("wrong.json")]), /EXACT_TRANSFER_RECIPIENT_AMOUNT_ACCEPTANCE_REQUIRED/);
  assert.equal(existsSync(file("wrong.json")), false);
});

test("run is one product operation over the same connector and never promotes fixture money", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-paypal-cli-run-"));
  const file = name => path.join(root, name);
  const transfer = { idempotencyKey: hash("run-transfer"), termRefHash: hash("run-term"),
    status: "SIMULATED_NOT_SUBMITTED", submitted: false, moneyMoved: false, paymentAuthorized: false,
    amount: { currency: "USD", minorUnits: "5000" } };
  write(file("result.json"), { schema: "outsider/private-digital-goal-mvp-result/v1",
    delivery: { program: { state: "SUCCEEDED", programHash: hash("run-program") } },
    actualOutcomeDecision: { decision: "NO_SANDBOX_COMPENSATION" },
    failureRehearsal: { rehearsal: { kind: "CONTROLLED_FAILURE_REHEARSAL" },
      decision: "SANDBOX_COMPENSATION_CALCULATED", sandboxTransfer: transfer } });
  const account = hash("run-account");
  write(file("credentials.json"), { environment: "SANDBOX", clientId: "fixture", clientSecret: "fixture" });
  write(file("recipient.json"), { environment: "SANDBOX", testRecipient: { recipientType: "EMAIL",
    receiver: "run-fixture@example.invalid", isSandboxAccount: true, testAccountRefHash: account } });
  write(file("authorization.json"), { transferIdempotencyKey: transfer.idempotencyKey,
    testAccountRefHash: account, amount: transfer.amount,
    sandboxAcceptance: { environment: "SANDBOX", scope: "PAYOUTS_TEST_ONLY", accepted: true,
      acceptanceRefHash: hash("run-acceptance") } });
  write(file("config.json"), { directory: file("operations"), credentialsFile: file("credentials.json"),
    testRecipientFile: file("recipient.json"), resultFile: file("result.json"), authorizationFile: file("authorization.json") });
  let reconciliations = 0;
  const operationId = `paypal-sandbox-${"a".repeat(40)}`;
  const result = await runPayPalSandboxPayoutCli(["run", file("config.json"), "--output", file("run.json")], {
    sleep: async () => {}, maximumReconciliations: 2,
    createConnection: () => ({
      prepare: () => ({ operationId, status: "PREPARED" }),
      submit: async () => ({ operationId, status: "PROVIDER_TEST_ACCEPTED", payoutBatchId: "BATCH001" }),
      reconcile: async () => ({ operationId, status: ++reconciliations === 1
        ? "PROVIDER_TEST_PENDING" : "PROVIDER_TEST_COMPLETED", payoutBatchId: "BATCH001",
      externalSandboxReceiptObserved: false, actualMoneyMoved: false, paymentAuthorized: false }),
      inspect: () => { throw new Error("not used"); },
    }),
  });
  assert.equal(result.status, "PROVIDER_TEST_COMPLETED");
  assert.equal(result.externalSandboxReceiptObserved, false);
  assert.equal(result.realMoneyMoved, false);
  assert.equal(reconciliations, 2);
  assert.equal(existsSync(file("run.json")), true);
});
