import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startNativeCapacityOnboarding }
  from "../src/outsider-native-capacity-onboarding.js";
const h = char => `sha256:${char.repeat(64)}`;
test("captures one owner test resource privately without provider I/O", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "outsider-capacity-onboard-"));
  const sourceFile = path.join(root, "source.json");
  writeFileSync(sourceFile, JSON.stringify({
    schema: "outsider/native-capacity-onboarding-authorization/v1", provider: "SEATSIO",
    scope: "OWNER_CONTROLLED_TEST_RESOURCE", approved: true, paymentAuthorized: false,
    sourceRefHash: h("1") }), { mode: 0o600 });
  const output = path.join(root, "captured");
  const server = await startNativeCapacityOnboarding({ directory: output,
    authorizationSourceFile: sourceFile, expiresAt: "2026-09-13T00:00:00.000Z" },
  { randomBytes: () => Buffer.alloc(24, 7), clock: () => "2026-09-06T05:00:00.000Z" });
  const response = await fetch(`${server.origin}${server.pathname}`, { method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ secret: "test_secret", region: "na", eventKey: "demo-event",
      objectLabel: "A-1", owner: "yes", testOnly: "yes", noPayment: "yes" }) });
  assert.equal(response.status, 201);
  const result = await server.captured;
  assert.equal(result.providerIoPerformed, false); assert.equal(result.paymentAuthorized, false);
  assert.equal(statSync(path.join(output, "credentials.json")).mode & 0o777, 0o600);
  const profile = JSON.parse(readFileSync(path.join(output, "profile.json")));
  assert.equal(profile.resources[0].provider, "SEATSIO");
  assert.equal(profile.resources[0].settings.eventKey, "demo-event");
  assert.equal(JSON.stringify(result).includes("test_secret"), false);
});
