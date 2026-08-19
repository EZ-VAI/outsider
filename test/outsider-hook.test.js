/*
 * Immediate intervention via PreToolUse hooks. The decision must DENY an
 * irreversible tool call before any test passes, WARN before finishing on a red
 * test, and stay out of the way otherwise — and translate cleanly to each tool's
 * native hook output.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyToolCall, decideToolCall, trajectoryFromTranscript, eventsFromTranscriptLine,
  toClaudeCodeHookOutput, toCodexHookOutput, handleHookInvocation,
} from "../src/outsider-hook.js";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/* ---------- classify ---------- */
test("classifyToolCall flags irreversible commands, not ordinary ones", () => {
  assert.equal(classifyToolCall("Bash", { command: "kubectl apply -f prod.yaml" }).irreversible, true);
  /* REVERSED on real-world evidence: 152 of 152 hard blocks in a stranger's
     9-day session were build hygiene like this one. What is being deleted
     decides, not that something is. See the corpus note. */
  assert.equal(classifyToolCall("Bash", { command: "rm -rf build" }).irreversible, false);
  assert.equal(classifyToolCall("Bash", { command: "rm -rf /var/data" }).irreversible, true);
  assert.equal(classifyToolCall("Bash", { command: "rm -rf ~/project" }).irreversible, true);
  assert.equal(classifyToolCall("Bash", { command: "git push origin main" }).irreversible, true);
  assert.equal(classifyToolCall("Bash", { command: "npm publish" }).irreversible, true);
  assert.equal(classifyToolCall("Bash", { command: "git push origin my-feature" }).irreversible, false);
  assert.equal(classifyToolCall("Bash", { command: "ls -la" }).irreversible, false);
  assert.equal(classifyToolCall("Bash", { command: "pytest -q" }).isTest, true);
});

/* ---------- decide ---------- */
test("DENY an irreversible tool call before any test passes", () => {
  const d = decideToolCall({ toolName: "Bash", toolInput: { command: "terraform apply" },
    priorSteps: [{ action: "edit", isEdit: true, exit: 0 }] });
  assert.equal(d.verdict, "deny");
});

test("ALLOW the same irreversible call once a test has passed", () => {
  const d = decideToolCall({ toolName: "Bash", toolInput: { command: "terraform apply" },
    priorSteps: [{ action: "pytest", isTest: true, exit: 0 }] });
  assert.equal(d.verdict, "allow");
});

test("WARN before finishing/committing on a red test", () => {
  const d = decideToolCall({ toolName: "Bash", toolInput: { command: "git commit -am done" },
    priorSteps: [{ action: "pytest", isTest: true, exit: 1 }] });
  assert.equal(d.verdict, "warn");
  assert.match(d.corrective, /test/);
});

test("ALLOW an ordinary edit", () => {
  const d = decideToolCall({ toolName: "Edit", toolInput: { file_path: "src/app.py" }, priorSteps: [] });
  assert.equal(d.verdict, "allow");
});

/* ---------- native output ---------- */
test("Claude Code output: deny carries reason + injected correction", () => {
  const out = toClaudeCodeHookOutput({ verdict: "deny", reason: "r", corrective: "c" });
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /outsider/);
  assert.equal(out.hookSpecificOutput.additionalContext, "c");
});

test("Claude Code output: warn allows but injects the correction the agent acts on", () => {
  const out = toClaudeCodeHookOutput({ verdict: "warn", corrective: "run tests first" });
  assert.equal(out.hookSpecificOutput.permissionDecision, "allow");
  assert.match(out.hookSpecificOutput.additionalContext, /run tests first/);
});

/*
 * THE ENVELOPE. This assertion is the whole product on Codex.
 *
 * Two earlier versions of this file were wrong in opposite directions, and both
 * were wrong because nobody checked the vendor's schema:
 *   v1 asserted `warn → {}`          — encoded the bug that the flagship
 *                                      correction reached nobody.
 *   v2 asserted a BARE permissionDecision — which Codex ignores entirely, so the
 *                                      deny that stops `rm -rf` never fired while
 *                                      the CLI printed a convincing-looking deny.
 * Codex reads exactly the envelope Claude Code reads. Assert the nesting, not
 * just the value, or a future refactor can flatten it and stay green.
 */
test("CODEX: the decision must be WRAPPED in hookSpecificOutput or the host ignores it", () => {
  const out = toCodexHookOutput({ verdict: "deny", reason: "r", corrective: "c" });
  assert.equal(out.hookSpecificOutput?.hookEventName, "PreToolUse");
  assert.equal(out.hookSpecificOutput?.permissionDecision, "deny");
  assert.equal(out.permissionDecision, undefined, "a bare top-level key is not read by Codex");
});

/* ---------- transcript reconstruction ---------- */
test("trajectoryFromTranscript reconstructs test results from a session log", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "outsider-tr-"));
  const f = path.join(dir, "transcript.jsonl");
  writeFileSync(f,
    '{"type":"assistant","message":{"content":[{"type":"tool_use","name":"Bash","input":{"command":"pytest -q"}}]}}\n'
    + '{"type":"user","message":{"content":[{"type":"tool_result","content":"1 failed, 4 passed"}]}}\n');
  const steps = trajectoryFromTranscript(f);
  assert.ok(steps.some((s) => s.isTest && s.exit === 1), "should see the failing test");
});

test("eventsFromTranscriptLine is schema-robust (reads text out of any line)", () => {
  const evs = eventsFromTranscriptLine('{"message":{"content":[{"text":"All tests pass now, fixed it."}]}}');
  assert.ok(evs.some((e) => e.report), "should extract the completion claim");
});

/* ---------- end to end ---------- */
test("handleHookInvocation: a deploy-before-test hook call denies, in Claude Code shape", () => {
  const { output, decision } = handleHookInvocation({
    agent: "claude-code",
    input: { tool_name: "Bash", tool_input: { command: "helm upgrade prod ." }, hook_event_name: "PreToolUse" },
  });
  assert.equal(decision.verdict, "deny");
  assert.equal(output.hookSpecificOutput.permissionDecision, "deny");
});

/* -------- the context channel that was there all along -------- */

/*
 * I claimed for a whole round that "Codex is deny-only, so a warn must either
 * evaporate or be escalated to a hard block", and shipped --strict ON by default
 * on that basis. Codex's PreToolUse supports additionalContext — "added as extra
 * developer context" — exactly like Claude Code. The premise was never checked.
 * The cost of that mistake was not a missing feature; it was turning every
 * advisory into a wall on the surface most people use.
 */
test("CODEX default: a warn ALLOWS and injects the grounded correction as context", () => {
  const out = toCodexHookOutput({ verdict: "warn", reason: "committing on a red test", corrective: "re-run the tests" });
  assert.equal(out.hookSpecificOutput.permissionDecision, "allow", "an advisory must not become a block by default");
  assert.match(out.hookSpecificOutput.additionalContext, /re-run the tests/);
  assert.equal(out._outsiderUndelivered, undefined, "nothing is undeliverable here — the channel exists");
});

test("CODEX --strict: the operator can turn advisories into hard blocks, and it is disclosed", () => {
  const out = toCodexHookOutput(
    { verdict: "warn", reason: "committing on a red test", corrective: "Test X failed. Do not report success." },
    { strict: true });
  assert.equal(out.hookSpecificOutput.permissionDecision, "deny");
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /Test X failed/);
  assert.match(out._outsiderEscalated, /warn→deny/);
});

/*
 * "ask" is the one thing Codex genuinely cannot do — the docs say it is parsed
 * but not honoured. An unprovable action therefore cannot become a real human
 * prompt here. It must degrade to allow-with-context AND SAY SO: a degradation
 * presented as an escalation is the lie this whole system exists to catch.
 */
test("CODEX: an ask degrades to allow+context and the degradation is DISCLOSED", () => {
  const out = toCodexHookOutput({ verdict: "ask", reason: "unrecognised command", corrective: "check it" });
  assert.equal(out.hookSpecificOutput.permissionDecision, "allow");
  assert.match(out.hookSpecificOutput.additionalContext, /Ask your user to confirm/);
  assert.match(out._outsiderDegraded, /does not honour "ask"/);
});

test("CODEX: a real deny is unchanged by strict — escalation only affects softer verdicts", () => {
  const d = { verdict: "deny", reason: "irreversible action", corrective: "confirm with a human" };
  const loose = toCodexHookOutput(d), strict = toCodexHookOutput(d, { strict: true });
  assert.equal(loose.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(strict.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(loose.hookSpecificOutput.permissionDecisionReason, strict.hookSpecificOutput.permissionDecisionReason);
});

test("CODEX: an allow stays empty in both modes — no invented interruptions", () => {
  assert.deepEqual(toCodexHookOutput({ verdict: "allow" }), {});
  assert.deepEqual(toCodexHookOutput({ verdict: "allow" }, { strict: true }), {});
});

test("the flagship case end to end: red test + commit → grounded correction REACHES the model", () => {
  const steps = [{ action: "pytest -q", isTest: true, exit: 1, observation: "1 failed" }];
  const d = decideToolCall({ toolName: "shell", toolInput: { command: "git commit -m done" }, priorSteps: steps, agent: "codex" });
  assert.equal(d.verdict, "warn");
  assert.match(d.corrective, /failed/i);
  /* and it arrives WITHOUT blocking — the correction is the product, not the wall */
  const out = toCodexHookOutput(d);
  assert.equal(out.hookSpecificOutput.permissionDecision, "allow");
  assert.match(out.hookSpecificOutput.additionalContext, /failed/i);
});
