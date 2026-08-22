import test from "node:test";
import assert from "node:assert/strict";

import { main, runSupervisorConfiguration } from "../bin/outsider-run.mjs";

test("headless run requires both an explicit supervisor command and disclosure consent", () => {
  assert.deepEqual(runSupervisorConfiguration({ options: {}, env: {} }), {
    ok: false, command: null, consented: false,
    error: "EXTERNAL_SUPERVISOR_COMMAND_REQUIRED",
  });
  assert.deepEqual(runSupervisorConfiguration({ options: { supervisor: "claude -p" }, env: {} }), {
    ok: false, command: null, consented: false,
    error: "EXTERNAL_SUPERVISOR_CONSENT_REQUIRED",
  });
  assert.deepEqual(runSupervisorConfiguration({ options: {
    "allow-external-supervisor": true,
  }, env: {} }), {
    ok: false, command: null, consented: true,
    error: "EXTERNAL_SUPERVISOR_COMMAND_REQUIRED",
  });
  assert.deepEqual(runSupervisorConfiguration({ options: {
    "supervisor-argv": JSON.stringify([process.execPath, "judge with spaces.mjs"]),
    "allow-external-supervisor": true,
  }, env: {} }), {
    ok: true, command: [process.execPath, "judge with spaces.mjs"], consented: true, error: null,
  });
});

test("headless run rejects invalid or ambiguous supervisor configuration before startup", () => {
  assert.match(runSupervisorConfiguration({ options: {
    supervisor: "judge", "supervisor-argv": '["judge"]',
    "allow-external-supervisor": true,
  }, env: {} }).error, /AMBIGUOUS/);
  assert.equal(runSupervisorConfiguration({ options: {
    "supervisor-argv": "not-json", "allow-external-supervisor": true,
  }, env: {} }).error, "SUPERVISOR_ARGV_INVALID_JSON");
  assert.equal(runSupervisorConfiguration({ options: {
    "supervisor-argv": "[]", "allow-external-supervisor": true,
  }, env: {} }).error, "SUPERVISOR_ARGV_INVALID");
  assert.deepEqual(runSupervisorConfiguration({ options: {
    supervisor: true, "allow-external-supervisor": true,
  }, env: {} }), {
    ok: false, command: null, consented: true,
    error: "SUPERVISOR_COMMAND_INVALID",
  });
  assert.equal(runSupervisorConfiguration({ options: {
    supervisor: "   ", "allow-external-supervisor": true,
  }, env: {} }).error, "SUPERVISOR_COMMAND_INVALID");
  for (const options of [{
    supervisor: "judge --api-key SUPER_SECRET",
    "allow-external-supervisor": true,
  }, {
    "supervisor-argv": JSON.stringify(["judge", "--api-key", "SUPER_SECRET"]),
    "allow-external-supervisor": true,
  }, {
    "supervisor-argv": JSON.stringify(["judge", "https://example.test/run?token=SUPER_SECRET"]),
    "allow-external-supervisor": true,
  }]) {
    const rejected = runSupervisorConfiguration({ options, env: {} });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.command, null);
    assert.equal(rejected.consented, true);
    assert.equal(rejected.error, "EXTERNAL_SUPERVISOR_COMMAND_CONTAINS_INLINE_SECRET");
    assert.doesNotMatch(JSON.stringify(rejected), /SUPER_SECRET/);
  }
});

test("headless CLI fails before starting when either half of the disclosure gate is absent", async () => {
  const messages = [];
  const original = console.error;
  const prior = Object.fromEntries(["OUTSIDER_SUPERVISOR", "OUTSIDER_SUPERVISOR_ARGV",
    "OUTSIDER_ALLOW_EXTERNAL_SUPERVISOR"].map((key) => [key, process.env[key]]));
  for (const key of Object.keys(prior)) delete process.env[key];
  console.error = (...items) => messages.push(items.join(" "));
  try {
    assert.equal(await main(["do work", "--accept", "npm test",
      "--max-budget-usd", "1"]), 2);
    assert.equal(await main(["do work", "--accept", "npm test",
      "--max-budget-usd", "1", "--supervisor", "claude -p"]), 2);
    assert.equal(await main(["do work", "--accept", "npm test",
      "--max-budget-usd", "1", "--supervisor", "--allow-external-supervisor"]), 2);
  } finally {
    console.error = original;
    for (const [key, value] of Object.entries(prior)) {
      if (value == null) delete process.env[key]; else process.env[key] = value;
    }
  }
  assert.match(messages.join("\n"), /--allow-external-supervisor/);
  assert.match(messages.join("\n"), /不会启动或发送 workspace\/prompt\/tool\/output/);
});
