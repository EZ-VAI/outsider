import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fork } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { freezeContract } from "../src/outsider-work-contract.js";
import { OutsiderKernelController } from "../src/outsider-kernel-controller.js";
import { RunStore, snapshotWorkspace } from "../src/outsider-kernel-store.js";

const here = path.dirname(fileURLToPath(import.meta.url));

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "outsider-live-recovery-"));
  const cwd = path.join(root, "workspace");
  mkdirSync(path.join(cwd, "src"), { recursive: true });
  writeFileSync(path.join(cwd, "src", "value.js"), "export const value = 1;\n");
  const transcript = path.join(cwd, "session.jsonl");
  writeFileSync(transcript, "");
  const baseline = snapshotWorkspace(cwd);
  const semantic = {
    objective: "change exported value to 2",
    successCriteria: ["src/value.js exports 2"],
    architecturalConstraints: ["keep the public export"],
    forbiddenShortcuts: ["do not weaken acceptance"],
    scope: { in: ["src/value.js"], out: [] },
    uncertainties: [],
  };
  const contract = freezeContract({ cwd, ask: "change value to 2", acceptance: "npm test",
    semantic, semanticAudit: { passed: true, evidenceHash: "sha256:contract-audit" },
    baselineEvidence: baseline });
  const store = RunStore.create({ cwd, contract, supervisorCommand: "fake-supervisor",
    stateRoot: path.join(root, "state") });
  store.writeJson("baseline.json", baseline);
  store.append("contract_compiled", { objective: semantic.objective });
  store.append("contract_audited", { passed: true, evidenceHash: "sha256:contract-audit" });
  store.append("contract_frozen", { ask: contract.ask, acceptance: contract.acceptance });
  return { root, cwd, transcript, baseline, store };
}

function waitFor(child, type, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); reject(new Error(`${type}_TIMEOUT`)); }, timeoutMs);
    const onMessage = (message) => {
      if (message?.type !== type) return;
      cleanup();
      resolve(message);
    };
    const onExit = (code, signal) => {
      cleanup();
      reject(new Error(`${type}_EARLY_EXIT:${code}:${signal}`));
    };
    const cleanup = () => {
      clearTimeout(timer);
      child.off("message", onMessage);
      child.off("exit", onExit);
    };
    child.on("message", onMessage);
    child.once("exit", onExit);
  });
}

test("SIGKILL inside correction audit resumes one production controller intervention", async (t) => {
  const h = fixture();
  t.after(() => rmSync(h.root, { recursive: true, force: true }));
  const child = fork(path.join(here, "fixtures", "controller-recovery-audit-child.mjs"),
    [h.store.directory, h.transcript], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  t.after(() => { if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL"); });
  await waitFor(child, "correction-auditor-running");

  const beforeKill = RunStore.open({ directory: h.store.directory,
    supervisorCommand: "fake-supervisor" });
  const requested = beforeKill.events().find((event) => event.type === "correction_auditor_requested");
  const paused = beforeKill.events().find((event) => event.type === "boundary_paused");
  assert.ok(requested?.interventionId);
  assert.equal(requested.interventionId, paused.interventionId);
  const journalBefore = beforeKill.readJson("intervention-recovery.json");
  assert.equal(journalBefore.interventions[paused.interventionId].phase, "judge-running");
  const authorityHash = journalBefore.interventions[paused.interventionId].authority.hash;

  assert.equal(child.kill("SIGKILL"), true);
  const [, signal] = await once(child, "exit");
  assert.equal(signal, "SIGKILL");

  const store = RunStore.open({ directory: h.store.directory,
    supervisorCommand: "fake-supervisor" });
  let acceptanceCalls = 0;
  const controller = new OutsiderKernelController({
    store,
    baseline: h.baseline,
    controllerOwnerId: "controller-generation-2",
    controllerGeneration: 2,
    replacingControllerOwnerId: "controller-generation-1",
    decide: () => ({ verdict: "allow", proposed: { action: "read", irreversible: false } }),
    acceptance: () => {
      acceptanceCalls += 1;
      return { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
    },
    correctionAuditor: (options) => ({ ok: true, packet: { proposal: options.proposal },
      verdict: { passed: true, errors: [], verifiedFacts: ["same frozen authority checked"] } }),
    verifier: () => ({ ok: true, packet: { frozen: true },
      verdict: { passed: true, gaps: [], evidence: ["value is 2"] } }),
    outcomeAuditor: () => ({ ok: true, packet: { frozen: true },
      verdict: { passed: true, errors: [], verifiedFacts: ["PASS independently checked"] } }),
  });

  const resumed = controller.preTool({ input: { hook_event_name: "PreToolUse",
    tool_name: "Read", tool_input: { file_path: "src/value.js" },
    transcript_path: h.transcript } });
  assert.equal(resumed.output.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(resumed.decision.interventionId, paused.interventionId);
  assert.match(resumed.decision.corrective, new RegExp(paused.interventionId));

  const emitted = store.events().filter((event) => event.type === "correction_emitted");
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].interventionId, paused.interventionId);
  assert.equal(emitted[0].correctionAuthorityHash, authorityHash);
  assert.equal(store.events().filter((event) => event.type === "boundary_paused").length, 1);
  assert.equal(store.events().filter((event) => event.type === "supervisor_verdict").length, 1);
  assert.ok(store.events().some((event) => event.type === "correction_auditor_recovered"
    && event.interventionId === paused.interventionId));

  appendFileSync(h.transcript, `${JSON.stringify({ type: "user",
    message: { content: emitted[0].marker } })}\n`);
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
  const stop = controller.stop({ input: { hook_event_name: "Stop",
    transcript_path: h.transcript } });
  assert.equal(stop.output.decision, "approve");
  const finished = controller.finish({ requireIntervention: true });
  assert.equal(acceptanceCalls >= 2, true);
  assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
  assert.equal(finished.proof.interventionComplete, true);
  assert.equal(store.readJson("intervention-recovery.json")
    .interventions[paused.interventionId].phase, "resolved");
});

test("a crash after correction persistence retransmits one marker without a second dose", () => {
  const h = fixture();
  try {
    const store1 = RunStore.open({ directory: h.store.directory,
      supervisorCommand: "fake-supervisor" });
    const common = {
      baseline: h.baseline,
      decide: () => ({ verdict: "allow", proposed: { action: "read", irreversible: false } }),
      supervisor: () => ({ ok: true, verdict: {
        onTrack: false, drift: "value remains 1",
        plan: ["edit src/value.js", "run acceptance"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "red",
      } }),
      correctionAuditor: (options) => ({ ok: true, packet: { proposal: options.proposal },
        verdict: { passed: true, errors: [], verifiedFacts: ["authority checked"] } }),
      verifier: () => ({ ok: true, packet: { frozen: true },
        verdict: { passed: true, gaps: [], evidence: ["value is 2"] } }),
      outcomeAuditor: () => ({ ok: true, packet: { frozen: true },
        verdict: { passed: true, errors: [], verifiedFacts: ["PASS checked"] } }),
      acceptance: () => ({ ran: true, passed: true, exit: 0,
        command: "npm test", output: "ok" }),
    };
    const first = new OutsiderKernelController({ store: store1, ...common,
      controllerOwnerId: "controller-generation-1", controllerGeneration: 1 });
    const delivered = first.supervise({
      input: { hook_event_name: "PreToolUse", tool_name: "Read",
        tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript },
      agent: "claude-code", boundary: "PreToolUse",
      trigger: "delivery-reply-loss", acceptanceResult: { ran: true, passed: false,
        exit: 1, command: "npm test", output: "red" },
      actor: { agentId: "main", agentKind: "main", task: null },
    });
    assert.equal(delivered.status, "correction");
    const interventionId = delivered.interventionId;
    assert.equal(store1.events().filter((event) => event.type === "correction_emitted").length, 1);

    /* Generation one is considered dead before its return value reaches the
       worker. Generation two receives a retried hook with no transcript marker. */
    const store2 = RunStore.open({ directory: h.store.directory,
      supervisorCommand: "fake-supervisor" });
    const recovered = new OutsiderKernelController({ store: store2, ...common,
      controllerOwnerId: "controller-generation-2", controllerGeneration: 2,
      replacingControllerOwnerId: "controller-generation-1" });
    const retry = recovered.preTool({ input: { hook_event_name: "PreToolUse",
      tool_name: "Read", tool_input: { file_path: "src/value.js" },
      transcript_path: h.transcript } });
    assert.equal(retry.output.hookSpecificOutput.permissionDecision, "deny");
    assert.equal(retry.decision.interventionId, interventionId);
    assert.equal(retry.decision.corrective, delivered.correction);
    assert.equal(store2.events().filter((event) => event.type === "correction_emitted").length, 1);
    assert.ok(store2.events().some((event) => event.type === "correction_delivery_retried_after_crash"
      && event.interventionId === interventionId));

    appendFileSync(h.transcript, `${JSON.stringify({ type: "user",
      message: { content: store2.events().find((event) =>
        event.type === "correction_emitted").marker } })}\n`);
    writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
    const stop = recovered.stop({ input: { hook_event_name: "Stop",
      transcript_path: h.transcript } });
    assert.equal(stop.output.decision, "approve");
    const finished = recovered.finish({ requireIntervention: true });
    assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
    assert.equal(store2.events().filter((event) => event.type === "boundary_paused").length, 1);
  } finally {
    rmSync(h.root, { recursive: true, force: true });
  }
});

test("SIGKILL inside outcome PASS audit preserves attribution and resolves the original chain", async (t) => {
  const h = fixture();
  t.after(() => rmSync(h.root, { recursive: true, force: true }));
  const child = fork(path.join(here, "fixtures", "controller-recovery-outcome-child.mjs"),
    [h.store.directory, h.transcript], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
  t.after(() => { if (child.exitCode == null && child.signalCode == null) child.kill("SIGKILL"); });
  await waitFor(child, "outcome-auditor-running");

  const beforeKill = RunStore.open({ directory: h.store.directory,
    supervisorCommand: "fake-supervisor" });
  const emitted = beforeKill.events().find((event) => event.type === "correction_emitted");
  const effect = beforeKill.events().find((event) => event.type === "effect_observed");
  const requested = beforeKill.events().find((event) => event.type === "outcome_approval_auditor_requested");
  assert.equal(effect.interventionId, emitted.interventionId);
  assert.equal(requested.interventionId, emitted.interventionId);
  const journal = beforeKill.readJson("intervention-recovery.json")
    .interventions[emitted.interventionId];
  assert.equal(journal.phase, "judge-running");
  assert.equal(journal.judge.kind, "outcome-approval-audit");

  assert.equal(child.kill("SIGKILL"), true);
  const [, signal] = await once(child, "exit");
  assert.equal(signal, "SIGKILL");

  const store = RunStore.open({ directory: h.store.directory,
    supervisorCommand: "fake-supervisor" });
  const controller = new OutsiderKernelController({
    store,
    baseline: h.baseline,
    controllerOwnerId: "controller-generation-2",
    controllerGeneration: 2,
    replacingControllerOwnerId: "controller-generation-1",
    acceptance: () => ({ ran: true, passed: true, exit: 0,
      command: "npm test", output: "ok" }),
    verifier: () => { throw new Error("frozen outcome proposal must be resumed, not regenerated"); },
    outcomeAuditor: () => ({ ok: true, packet: { frozen: true }, verdict: {
      passed: true, errors: [], verifiedFacts: ["same PASS proposal checked"],
    } }),
  });
  const stop = controller.stop({ input: { hook_event_name: "Stop",
    transcript_path: h.transcript } });
  assert.equal(stop.output.decision, "approve");
  const finished = controller.finish({ requireIntervention: true });
  assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
  assert.equal(finished.proof.interventionComplete, true);
  const events = store.events();
  assert.ok(events.some((event) => event.type === "outcome_approval_auditor_recovered"
    && event.interventionId === emitted.interventionId));
  assert.ok(events.some((event) => event.type === "outcome_verdict" && event.passed === true
    && event.interventionId === emitted.interventionId));
  assert.ok(events.some((event) => event.type === "intervention_resolved"
    && event.interventionId === emitted.interventionId));
  assert.equal(store.readJson("intervention-recovery.json")
    .interventions[emitted.interventionId].phase, "resolved");
});
