/*
 * Structured session reading. The point is fidelity: read the REAL tool name /
 * input / result (is_error, exit) from the session structure, not a text guess —
 * while degrading gracefully to the heuristic on unfamiliar lines.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  makeClaudeCodeParser, makeCodexParser, makeGenericStructuredParser, makeSessionParser,
  trajectoryFromTranscript, classifyToolCall,
} from "../src/outsider-session-adapters.js";
import { createSupervisionSession } from "../src/outsider-supervisor.js";

const cc = (o) => JSON.stringify(o);

test("Claude Code: tool_use + tool_result pair into one step with the REAL exit", () => {
  const p = makeClaudeCodeParser();
  p.feed(cc({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "pytest -q" } }] } }));
  const ev = p.feed(cc({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "boom", is_error: true }] } }));
  assert.equal(ev.length, 1);
  assert.equal(ev[0].isTest, true);
  assert.equal(ev[0].exit, 1);            // from is_error, not a regex on text
});

test("Claude Code: an edit tool is read as an edit with its real path", () => {
  const p = makeClaudeCodeParser();
  p.feed(cc({ type: "assistant", message: { content: [{ type: "tool_use", id: "e1", name: "Edit", input: { file_path: "src/pool.py" } }] } }));
  const ev = p.feed(cc({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "e1", content: "ok" }] } }));
  assert.equal(ev[0].isEdit, true);
  assert.match(ev[0].action, /pool\.py/);
  assert.equal(ev[0].exit, 0);
});

test("Claude Code: an assistant completion claim is captured; intent is not", () => {
  const p = makeClaudeCodeParser();
  const claim = p.feed(cc({ type: "assistant", message: { content: [{ type: "text", text: "All tests pass now, the bug is fixed." }] } }));
  assert.ok(claim.some((e) => e.report), "should capture the claim");
  const p2 = makeClaudeCodeParser();
  const intent = p2.feed(cc({ type: "assistant", message: { content: [{ type: "text", text: "Next I'll make sure all tests pass." }] } }));
  assert.equal(intent.length, 0, "intent must not be read as a claim");
});

test("generic structured parser reads command + exit_code fields", () => {
  const p = makeGenericStructuredParser();
  const ev = p.feed(cc({ type: "function_call_output", command: "pytest -q", exit_code: 1, output: "1 failed" }));
  assert.equal(ev[0].isTest, true);
  assert.equal(ev[0].exit, 1);
});

test("generic parser falls back to the heuristic on an unfamiliar shape (no regression)", () => {
  const p = makeGenericStructuredParser();
  const ev = p.feed("1 failed, 4 passed");     // plain text line
  assert.ok(ev.some((e) => e.isTest && e.exit === 1));
});

test("makeSessionParser dispatches per agent", () => {
  assert.equal(typeof makeSessionParser("claude-code").feed, "function");
  assert.equal(typeof makeSessionParser("codex").feed, "function");
  assert.equal(typeof makeSessionParser("trae").feed, "function");
});

test("Codex custom exec wrapper is not invented as an edit while apply_patch remains one", () => {
  const parser = makeCodexParser();
  parser.feed(cc({ type: "response_item", payload: { type: "custom_tool_call",
    call_id: "wrapper-1", name: "exec", input: [
      "const r = await tools.exec_command({",
      "  cmd: \"sed -n '1,240p' src/answer.js test/answer.test.js\"",
      "});",
    ].join("\n") } }));
  const wrapper = parser.feed(cc({ type: "response_item", payload: {
    type: "custom_tool_call_output", call_id: "wrapper-1",
    output: "Script completed\\nOutput:\\nread-only source bytes",
  } }));
  assert.equal(wrapper.length, 1);
  assert.equal(wrapper[0].toolName, "exec");
  assert.equal(wrapper[0].isEdit, false,
    "the transport envelope cannot override the separately observed native hook action");

  parser.feed(cc({ type: "response_item", payload: { type: "custom_tool_call",
    call_id: "patch-1", name: "apply_patch", input: "*** Begin Patch" } }));
  const patch = parser.feed(cc({ type: "event_msg", payload: { type: "patch_apply_end",
    call_id: "patch-1", success: true,
    changes: { "src/answer.js": { type: "update" } } } }));
  assert.equal(patch.length, 1);
  assert.equal(patch[0].isEdit, true);
  assert.equal(patch[0].file, "src/answer.js");
});

test("classifyToolCall (canonical home) flags irreversible vs ordinary", () => {
  assert.equal(classifyToolCall("Bash", { command: "kubectl apply -f p.yaml" }).irreversible, true);
  assert.equal(classifyToolCall("Bash", { command: "ls" }).irreversible, false);
});

test("named no-command tools are conservative unless their semantics are known", () => {
  assert.equal(classifyToolCall("Read", { file_path: "src/value.js" }).risk, "safe");
  assert.equal(classifyToolCall("spawn_agent", {
    task_name: "audit", message: "inspect the frozen contract",
  }).risk, "build");
  assert.equal(classifyToolCall("mcp__github__create_issue", {
    title: "publish externally",
  }).risk, "unknown",
  "an opaque MCP name and payload do not prove that the action is safe");
  assert.equal(classifyToolCall("future_host_tool", {}).risk, "unknown");
  assert.equal(classifyToolCall("exec", {}).risk, "unknown",
    "even a shell-shaped wrapper is unknown when its command is absent");
  assert.equal(classifyToolCall("apply_patch", { path: "src/value.js" }).risk, "build");
});

test("end to end: a structured red-test-then-fake-claim transcript triggers a correction", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "outsider-struct-"));
  const f = path.join(dir, "t.jsonl");
  writeFileSync(f,
    cc({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Bash", input: { command: "pytest -q" } }] } }) + "\n"
    + cc({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "1 failed", is_error: true }] } }) + "\n"
    + cc({ type: "assistant", message: { content: [{ type: "text", text: "All tests pass now, done." }] } }) + "\n");
  const steps = trajectoryFromTranscript(f, "claude-code");
  const session = createSupervisionSession({ executor: { id: "a" }, world: { kind: "sandbox" } });
  let sawCorrection = false;
  for (const s of steps) { if (session.ingest(s).decision.action === "auto-correct") sawCorrection = true; }
  assert.equal(sawCorrection, true);
});
