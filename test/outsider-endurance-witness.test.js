import test from "node:test";
import assert from "node:assert/strict";
import { EnduranceWitnessLedger } from "../scripts/stage05-endurance-witness.mjs";

test("endurance witness uses server time and enforces real checkpoint spacing", () => {
  let now = 1_000;
  const ledger = new EnduranceWitnessLedger({
    minimumDurationMs: 1_000,
    minimumIntervalMs: 200,
    minimumCheckpoints: 3,
    now: () => now,
  });

  const first = ledger.record({ label: "start", pid: 11, atMs: 99_999_999 });
  assert.equal(first.accepted, true);
  assert.equal(first.checkpoint.atMs, 1_000);
  assert.equal(first.checkpoint.monotonicMs, 1_000);

  now = 1_100;
  const early = ledger.record({ label: "too-early" });
  assert.equal(early.accepted, false);
  assert.equal(early.reason, "CHECKPOINT_TOO_EARLY");
  assert.equal(ledger.checkpoints.length, 1);

  now = 1_200;
  assert.equal(ledger.record({ label: "middle" }).accepted, true);
  now = 2_000;
  assert.equal(ledger.record({ label: "finish" }).accepted, true);
  assert.deepEqual(ledger.status(), {
    schema: "outsider/stage05-endurance-witness/v1",
    clockSource: "injected-test-clock",
    startedAt: new Date(1_000).toISOString(),
    observedAt: new Date(2_000).toISOString(),
    elapsedMs: 1_000,
    minimumDurationMs: 1_000,
    minimumIntervalMs: 200,
    minimumCheckpoints: 3,
    checkpoints: ledger.checkpoints,
    wallClockDiscontinuities: [],
    enoughDuration: true,
    enoughCheckpoints: true,
    passed: true,
  });
});

test("checkpoints alone cannot satisfy an endurance witness before elapsed time", () => {
  let now = 0;
  const ledger = new EnduranceWitnessLedger({
    minimumDurationMs: 10_000,
    minimumIntervalMs: 1,
    minimumCheckpoints: 2,
    now: () => now,
  });
  assert.equal(ledger.record({ label: "one" }).accepted, true);
  now = 1;
  assert.equal(ledger.record({ label: "two" }).accepted, true);
  assert.equal(ledger.status().enoughCheckpoints, true);
  assert.equal(ledger.status().enoughDuration, false);
  assert.equal(ledger.status().passed, false);
});
