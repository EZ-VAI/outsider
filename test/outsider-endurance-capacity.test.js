import assert from "node:assert/strict";
import test from "node:test";
import {
  assessEnduranceCapacity,
  observeClaudeCapacityChunk,
  parseClaudeCapacityBlock,
} from "../src/outsider-endurance-capacity.js";

test("Claude session-limit banners become bounded capacity evidence", () => {
  const now = new Date(2026, 7, 12, 21, 0, 0, 0).getTime();
  const parsed = parseClaudeCapacityBlock(
    "You've hit your session limit · resets 11:20pm (Asia/Shanghai)",
    { nowMs: now, localTimeZone: "Asia/Shanghai" });
  assert.equal(parsed.limited, true);
  assert.equal(parsed.kind, "usage-limit");
  const reset = new Date(parsed.resetAtMs);
  assert.equal(reset.getHours(), 23);
  assert.equal(reset.getMinutes(), 20);
  assert.equal(parseClaudeCapacityBlock("Claude is ready", { nowMs: now }), null);
});

test("Claude authentication interruptions fail visible even when split across PTY chunks", () => {
  const now = new Date(2026, 7, 17, 15, 0, 0, 0).getTime();
  const direct = parseClaudeCapacityBlock(
    "Please run /login · API Error: 403 Request not allowed", { nowMs: now });
  assert.deepEqual(direct, { limited: true, kind: "authentication-required",
    resetAtMs: null, resetTimeZone: null });

  const first = observeClaudeCapacityChunk({ tail: "", block: null },
    "Please run /lo", { nowMs: now });
  assert.equal(first.block, null);
  const second = observeClaudeCapacityChunk(first,
    "gin · API Error: 403 Request not allowed", { nowMs: now + 1 });
  assert.equal(second.block?.limited, true);
  assert.equal(second.block?.kind, "authentication-required");
  assert.equal(second.block?.observedAtMs, now + 1);
});

test("unknown or mathematically late capacity recovery fails closed", () => {
  const now = 1_000_000;
  assert.equal(assessEnduranceCapacity({ nowMs: now, resetAtMs: null,
    budgetDeadlineMs: now + 10_000, completedCheckpoints: 1,
    minimumCheckpoints: 3, minimumIntervalMs: 1_000 }).recoverable, false);
  const late = assessEnduranceCapacity({ nowMs: now, resetAtMs: now + 9_000,
    budgetDeadlineMs: now + 10_000, completedCheckpoints: 1,
    minimumCheckpoints: 3, minimumIntervalMs: 2_000 });
  assert.equal(late.recoverable, false);
  const enough = assessEnduranceCapacity({ nowMs: now, resetAtMs: now + 2_000,
    budgetDeadlineMs: now + 10_000, completedCheckpoints: 1,
    minimumCheckpoints: 3, minimumIntervalMs: 2_000 });
  assert.equal(enough.recoverable, true);
});

test("a capacity banner is latched before a large TUI redraw evicts it from the bounded tail", () => {
  const now = new Date(2026, 7, 16, 20, 0, 0, 0).getTime();
  const observation = observeClaudeCapacityChunk({ tail: "", block: null },
    `You've hit your session limit · resets 9:10pm (Asia/Shanghai)${"x".repeat(40_000)}`,
    { nowMs: now, localTimeZone: "Asia/Shanghai", maximumTailBytes: 32_000 });
  assert.equal(observation.tail.length, 32_000);
  assert.equal(parseClaudeCapacityBlock(observation.tail, {
    nowMs: now, localTimeZone: "Asia/Shanghai" }), null,
  "the synthetic redraw must actually evict the banner from the sampled tail");
  assert.equal(observation.block?.limited, true);
  assert.equal(observation.block?.observedAtMs, now);

  const afterMoreOutput = observeClaudeCapacityChunk(observation, "healthy-looking redraw", {
    nowMs: now + 2_000, localTimeZone: "Asia/Shanghai", maximumTailBytes: 32_000 });
  assert.deepEqual(afterMoreOutput.block, observation.block,
    "the first normalized capacity observation remains latched");
});
