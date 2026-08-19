import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createDeepSeekHarnessObservation, DEEPSEEK_HARNESS_PIN,
  verifyDeepSeekHarnessObservation, deepSeekHarnessActionRef,
} from "../src/outsider-deepseek-harness-adapter.js";

function event(seq, type, data, extra = {}) {
  return { type, seq, time: 1_000 + seq, data, ...extra };
}

const cleanLog = () => [
  event(0, "turn/start", { turn: 1 }),
  event(1, "step/start", { turn: 1, step: 1 }),
  event(2, "tool/call", { turn: 1, step: 1, callId: "call-1", name: "shell",
    arguments: '{"command":"npm test"}' }),
  event(3, "tool/result", { turn: 1, step: 1, message: { id: "msg-1", role: "user",
    source: { kind: "tool", callId: "call-1" }, content: [{ type: "tool-result",
      toolCallId: "call-1", content: [{ type: "text", text: "ok" }] }] } }),
  event(4, "assistant/message", { turn: 1, step: 1, message: { id: "msg-2",
    role: "assistant", content: [{ type: "text", text: "done" }] },
    usage: { inputTokens: 10, outputTokens: 4, cacheReadTokens: 3 } }),
  event(5, "step/end", { turn: 1, step: 1 }),
  event(6, "turn/end", { turn: 1, reason: { kind: "stop" } }),
];

test("pinned Harness durable events become privacy-safe observation evidence", () => {
  const record = createDeepSeekHarnessObservation(cleanLog(), { sessionId: "secret-session" });
  assert.equal(record.source.repositoryCommit, DEEPSEEK_HARNESS_PIN.commit);
  assert.equal(record.integrity.complete, true);
  assert.equal(record.capacity.toolCalls, 1);
  assert.equal(record.capacity.tokenUsage.inputTokens, 10);
  assert.equal(record.toolPairs[0].callSeq, 2);
  assert.equal(record.toolPairs[0].resultSeq, 3);
  assert.equal(record.toolPairs[0].actionRef,
    deepSeekHarnessActionRef("shell", '{"command":"npm test"}'));
  assert.match(record.source.sessionIdHash, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(record), /secret-session|npm test|\"ok\"/);
  assert.deepEqual(verifyDeepSeekHarnessObservation(record), {
    ok: true, recordHash: record.recordHash,
  });
});

test("unknown required events and unsettled tools cannot claim complete observation", () => {
  const log = cleanLog();
  log.splice(3, 1);
  log.push(event(7, "third-party/authority", { allowed: true }));
  const record = createDeepSeekHarnessObservation(log);
  assert.equal(record.integrity.complete, false);
  assert.ok(record.integrity.errors.some((error) => error.startsWith("UNSETTLED_TOOL_CALL")));
  assert.deepEqual(record.integrity.unrecognizedRequired,
    [{ seq: 7, type: "third-party/authority" }]);
  assert.equal(record.authority.establishesDelivery, false);
});

test("unknown ignorable telemetry is retained by hash without blocking completeness", () => {
  const record = createDeepSeekHarnessObservation([
    ...cleanLog(), event(7, "plugin/telemetry", { count: 1 }, { ignorable: true }),
  ]);
  assert.equal(record.integrity.complete, true);
  assert.equal(record.eventRefs.at(-1).understood, false);
  assert.equal(record.eventRefs.at(-1).ignorable, true);
});

test("record tampering and unpinned upstream commits fail closed", () => {
  const record = createDeepSeekHarnessObservation(cleanLog());
  record.capacity.toolCalls = 99;
  assert.equal(verifyDeepSeekHarnessObservation(record).ok, false);
  assert.throws(() => createDeepSeekHarnessObservation(cleanLog(), {
    repositoryCommit: "main",
  }), /COMMIT_NOT_PINNED/);
});

test("CLI imports and verifies a pinned Harness session without raw content leakage", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-dsh-observe-"));
  const input = path.join(directory, "events.json");
  const output = path.join(directory, "observation.json");
  writeFileSync(input, JSON.stringify(cleanLog()));
  const imported = spawnSync(process.execPath, ["bin/outsider.mjs", "observe-dsh", input,
    "--out", output, "--session-id", "cli-secret"], { encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
  const record = JSON.parse(readFileSync(output, "utf8"));
  assert.equal(record.integrity.complete, true);
  assert.doesNotMatch(readFileSync(output, "utf8"), /cli-secret|npm test/);
  const verified = spawnSync(process.execPath, ["bin/outsider.mjs", "verify", output], {
    encoding: "utf8",
  });
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).ok, true);
});
