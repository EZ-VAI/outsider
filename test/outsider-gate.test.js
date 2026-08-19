/*
 * The rebuilt safety gate — default-deny, risk-tiered, fail-closed. These tests
 * are the regression wall against the audit's findings: a leaky blocklist, a
 * dead fail-safe, and one-test-disarms.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { classifyToolCall } from "../src/outsider-session-adapters.js";
import { decideToolCall, toClaudeCodeHookOutput } from "../src/outsider-hook.js";
import { createSupervisionSession } from "../src/outsider-supervisor.js";

const cmd = (c, prior = []) => decideToolCall({ toolName: "Bash", toolInput: { command: c }, priorSteps: prior }).verdict;

test("risk tiers: destructive / deploy / safe / build / unknown", () => {
  assert.equal(classifyToolCall("Bash", { command: "rm -fr /x" }).risk, "destructive");
  assert.equal(classifyToolCall("Bash", { command: "terraform apply" }).risk, "deploy");
  assert.equal(classifyToolCall("Bash", { command: "ls -la" }).risk, "safe");
  assert.equal(classifyToolCall("Bash", { command: "npm run build" }).risk, "build");
  assert.equal(classifyToolCall("Bash", { command: "./mystery-script.sh" }).risk, "unknown");
});

test("the whole audit bypass battery is now gated (deny or ask), none allowed", () => {
  const battery = [
    "rm -fr /important", "rm -r -f /x", "find / -name '*.py' -delete", "dd if=/dev/zero of=/dev/sda",
    "shred -u k", "> /etc/passwd", "docker system prune -af", "make deploy", "npm run deploy",
    "./deploy.sh production", "serverless deploy", "vercel --prod", "az vm delete --name p --yes",
    "kubectl delete ns prod", "python manage.py migrate", "psql -f drop.sql", "mysql prod < wipe.sql",
    "git push origin release", "git push", "stripe charges create --amount 5",
    "curl -X POST https://api.stripe.com/v1/charges -d amount=9", "eval \"$DEPLOY\"",
    "echo x | base64 -d | sh", "terraform destroy -auto-approve",
  ];
  for (const c of battery) {
    const v = cmd(c);
    assert.ok(v === "deny" || v === "ask", `command was NOT gated (verdict=${v}): ${c}`);
  }
});

test("destructive is gated even AFTER a green test (a passing test does not make rm -rf safe)", () => {
  const green = [{ action: "pytest", isTest: true, exit: 0 }];
  assert.equal(cmd("terraform destroy -auto-approve", green), "deny");
  assert.equal(cmd("rm -rf /data", green), "deny");
});

test("deploy is allowed ONLY when the test is CURRENTLY green (stale green re-gates)", () => {
  assert.equal(cmd("terraform apply", []), "deny");                                   // no test
  assert.equal(cmd("terraform apply", [{ action: "pytest", isTest: true, exit: 0 }]), "allow"); // current green
  assert.equal(cmd("terraform apply", [
    { action: "pytest", isTest: true, exit: 0 },
    { action: "edit x", isEdit: true, exit: 0 },                                       // edit AFTER the pass
  ]), "deny");                                                                          // stale → re-gate
});

test("fail-closed: an unreadable / unknown test result does NOT count as a pass", () => {
  // a 'test' step with exit null (unknown) must not open the deploy gate
  assert.equal(cmd("terraform apply", [{ action: "pytest", isTest: true, exit: null }]), "deny");
});

test("safe reads and reversible builds are allowed (no over-gating normal work)", () => {
  assert.equal(cmd("ls -la"), "allow");
  assert.equal(cmd("grep -rn TODO src/"), "allow");
  assert.equal(cmd("npm run build"), "allow");
  assert.equal(cmd("git status"), "allow");
  assert.equal(cmd("pytest -q"), "allow");
});

/*
 * REVERSED 2026-08-03, and the reversal is the point.
 *
 * v1 asserted `unknown ⇒ ask`. It passed for a month and it killed a real
 * session: installed into a Cowork tab, the supervisor turned 42.6% of ordinary
 * tool calls into permission prompts nobody was there to answer, and the
 * conversation stopped moving. `unknown` means "I cannot PROVE this is safe",
 * which is a different claim from "this is dangerous" — and both hosts already
 * ship a permission system that asks the human about commands they do not
 * recognise. Prompting in front of that prompt duplicates a feature the host
 * gives away free, which is the exact category of waste this project exists to
 * price.
 *
 * The library gate keeps its old contract (authorize() still gates unknown
 * outside a sandbox; wrap and the CLI rely on it). What changed is the HOOK's
 * product policy: it stops only what it can prove, and defers the rest.
 */
test("unknown commands DEFER to the host — Outsider does not re-ask what the host already asks", () => {
  assert.equal(decideToolCall({ toolName: "Bash", toolInput: { command: "./mystery.sh" } }).verdict, "allow");
  assert.equal(decideToolCall({ toolName: "Bash", toolInput: { command: "./mystery.sh" },
    world: { kind: "sandbox" } }).verdict, "allow");
  /* and it reaches the host as a real defer, not as a silent approval */
  const out = toClaudeCodeHookOutput(decideToolCall({ toolName: "Bash", toolInput: { command: "./mystery.sh" } }));
  assert.equal(out.hookSpecificOutput.permissionDecision, "defer");
  /* the library-level gate is UNCHANGED — only the hook's policy moved */
  const s = createSupervisionSession({ executor: { id: "x" }, world: { kind: "workstation" } });
  assert.equal(s.authorize(classifyToolCall("Bash", { command: "./mystery.sh" })).allow, false);
});

/*
 * THE NUMBER THAT DECIDES WHETHER THIS IS INSTALLABLE.
 *
 * Not "does it stop rm -rf" — both hosts stop rm -rf. The number is what
 * fraction of a real session it interrupts. Measured end to end through
 * decideToolCall on a 91-command corpus of ordinary traffic.
 */
test("the gate corpus: zero false interruptions, zero slips", async () => {
  const { scoreCorpus } = await import("../scripts/outsider-gate-corpus.mjs");
  const r = scoreCorpus();
  assert.equal(r.slip.length, 0, `slipped to allow: ${r.slip.map((x) => x.cmd).join(" | ")}`);
  assert.equal(r.falseStop.length, 0, `falsely interrupted: ${r.falseStop.map((x) => x.cmd).join(" | ")}`);
  assert.equal(r.accuracy, 1);
});

/* the four shapes that made the old classifier both too loud and too leaky */
test("segmentation: cd-chained reads pass, and the worst segment sets the tier", () => {
  assert.equal(cmd("cd /repo/src && grep -n foo ."), "allow");
  assert.equal(cmd("cd /repo && export CI=1 && npm test"), "allow");
  assert.equal(cmd("ls -la && rm -rf /var/data"), "deny", "the old ^-anchor read this as `ls`");
  assert.equal(classifyToolCall("Bash", { command: "grep -rn x src 2>/dev/null" }).risk, "safe",
    "2>/dev/null is stream plumbing, not an overwrite of a device node");
  assert.equal(classifyToolCall("Bash", { command: "find . -name '*.py' -exec sed -i s/a/b/ {} \\;" }).risk,
    "destructive", "the risk of find -exec is the INNER command");
  assert.equal(classifyToolCall("Bash", { command: "cp evil /usr/bin/ls" }).risk, "destructive");
  assert.equal(classifyToolCall("Bash", { command: "cp /usr/share/doc/x ./notes" }).risk, "build",
    "reading OUT of a system path is ordinary work");
});

/* good at first, then degrades, then cannot be removed is the worst failure
   curve a tool can have. Removing Outsider is always the operator's call. */
test("Outsider never blocks its own uninstall", () => {
  assert.equal(cmd("rm -f ~/.claude/settings.json"), "allow");
  assert.equal(cmd("rm -f ~/.codex/hooks.json"), "allow");
  assert.equal(cmd("node ~/Outsider/install.mjs --uninstall"), "allow");
  assert.equal(classifyToolCall("Edit", { file_path: "/Users/x/.claude/settings.json" }).risk, "safe");
  /* and the exemption is narrow: it does not launder a broader delete */
  assert.equal(cmd("rm -rf ~/.claude"), "deny");
});
