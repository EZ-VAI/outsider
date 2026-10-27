import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { startPayPalSandboxOnboarding } from "../src/outsider-paypal-sandbox-onboarding.js";

const hash = value => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const writePrivate = (file, value) => { writeFileSync(file, JSON.stringify(value), { mode: 0o600 }); chmodSync(file, 0o600); return file; };

test("one-use loopback capture writes bound 0600 records without projecting credentials", async t => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-paypal-onboard-")); chmodSync(root, 0o700);
  const resultFile = writePrivate(path.join(root, "result.json"), {
    schema: "outsider/private-digital-goal-mvp-result/v1", delivery: { program: { state: "SUCCEEDED", programHash: hash("p") } },
    failureRehearsal: { rehearsal: { kind: "CONTROLLED_FAILURE_REHEARSAL" }, decision: "SANDBOX_COMPENSATION_CALCULATED",
      sandboxTransfer: { idempotencyKey: hash("i"), amount: { currency: "USD", minorUnits: "5000" } } }
  });
  const authorizationSourceFile = writePrivate(path.join(root, "source.json"), {
    schema: "outsider/paypal-sandbox-onboarding-authorization/v1", environment: "SANDBOX", scope: "PAYOUTS_TEST_ONLY",
    approved: true, realMoneyAuthorized: false, sourceRefHash: hash("explicit-user-approval")
  });
  const directory = path.join(root, "v1");
  const server = await startPayPalSandboxOnboarding({ directory, resultFile, authorizationSourceFile },
    { randomBytes: () => Buffer.alloc(24, 0x41), clock: () => "2026-09-06T04:00:00.000Z" });
  t.after(() => server.close().catch(() => {}));
  const get = await fetch(`${server.origin}${server.pathname}`); assert.equal(get.status, 200);
  assert.match(await get.text(), /PayPal Sandbox one-time onboarding/u);
  const form = new URLSearchParams({ clientId: "SANDBOX_CLIENT", clientSecret: "SANDBOX_SECRET",
    recipientEmail: "personal-test@example.invalid", sandboxOnly: "yes", recipientConfirmed: "yes", payoutTestOnly: "yes" });
  const response = await fetch(`${server.origin}${server.pathname}`, { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" }, body: form });
  assert.equal(response.status, 201);
  const captured = await server.captured; assert.equal(captured.status, "CAPTURED");
  assert.equal(JSON.stringify(captured).includes("SANDBOX_SECRET"), false);
  for (const name of ["credentials.json", "recipient.json", "authorization.json", "config.json", "capture-receipt.json"])
    assert.equal(statSync(path.join(directory, name)).mode & 0o777, 0o600);
  const receipt = JSON.parse(readFileSync(path.join(directory, "capture-receipt.json")));
  assert.equal(receipt.secretProjected, false); assert.equal(receipt.recipientProjected, false);
  assert.equal(receipt.realMoneyAuthorized, false); assert.equal(receipt.payoutSubmitted, false);
  assert.equal(JSON.stringify(receipt).includes("personal-test@example.invalid"), false);
});
