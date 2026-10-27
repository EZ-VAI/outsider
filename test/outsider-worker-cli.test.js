import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const cli = path.join(root, "bin", "outsider.mjs");

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: "utf8", timeout: 15_000,
  });
}

test("worker CLI inspects and source-reverifies a Codex rollout without claiming control", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-worker-cli-"));
  const source = path.join(directory, "codex.jsonl");
  const output = path.join(directory, "observation.json");
  const entries = [
    { timestamp: "2026-08-21T00:00:00Z", type: "session_meta",
      payload: { id: "private-session", cli_version: "0.144.5" } },
    { timestamp: "2026-08-21T00:00:01Z", type: "response_item",
      payload: { type: "function_call", name: "exec_command", call_id: "private-call",
        arguments: JSON.stringify({ cmd: "secret command" }) } },
    { timestamp: "2026-08-21T00:00:02Z", type: "response_item",
      payload: { type: "function_call_output", call_id: "private-call",
        output: "Process exited with code 0\nOutput:\nsecret" } },
  ];
  writeFileSync(source, `${entries.map(JSON.stringify).join("\n")}\n`);
  const inspected = run(["worker", "inspect", "codex", source, "--out", output]);
  assert.equal(inspected.status, 0, inspected.stderr || inspected.stdout);
  const summary = JSON.parse(inspected.stdout);
  assert.equal(summary.controlLevel, "OBSERVATION_ONLY");
  assert.equal(summary.hostDisposition, "CONTINUE_UNSUPERVISED");
  assert.doesNotMatch(readFileSync(output, "utf8"), /private-session|private-call|secret command/);

  const verified = run(["worker", "verify", output, "--source", source]);
  assert.equal(verified.status, 0, verified.stderr || verified.stdout);
  assert.equal(JSON.parse(verified.stdout).verificationMode, "FULL_SOURCE_REPLAY");
});

test("worker CLI inspects DeepSeek Harness and exposes unsupported providers visibly", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-worker-cli-dsh-"));
  const source = path.join(directory, "deepseek.json");
  const output = path.join(directory, "observation.json");
  writeFileSync(source, JSON.stringify([
    { seq: 0, type: "turn/start", time: 1_000, data: { turn: 1 } },
    { seq: 1, type: "turn/end", time: 1_001, data: { turn: 1 } },
  ]));
  const inspected = run(["worker", "inspect", "deepseek-harness", source,
    "--session-id", "private-session", "--out", output]);
  assert.equal(inspected.status, 0, inspected.stderr || inspected.stdout);
  assert.equal(JSON.parse(inspected.stdout).controlLevel, "OBSERVATION_ONLY");
  const verified = run(["worker", "verify", output, "--source", source,
    "--session-id", "private-session"]);
  assert.equal(verified.status, 0, verified.stderr || verified.stdout);
  assert.equal(JSON.parse(verified.stdout).verificationMode, "FULL_PROVIDER_SOURCE_REPLAY");

  const unsupported = run(["worker", "inspect", "trae", source, "--out", output]);
  assert.equal(unsupported.status, 2);
  const refusal = JSON.parse(unsupported.stdout);
  assert.equal(refusal.reasonCode, "WORKER_PROVIDER_UNSUPPORTED");
  assert.equal(refusal.hostDisposition, "CONTINUE_UNSUPERVISED");
  assert.equal(refusal.blocksHost, false);
});
