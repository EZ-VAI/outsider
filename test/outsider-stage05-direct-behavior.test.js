import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { freezeContract } from "../src/outsider-work-contract.js";
import { OutsiderKernelController } from "../src/outsider-kernel-controller.js";
import { RunStore, snapshotWorkspace } from "../src/outsider-kernel-store.js";

const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
const red = { ran: true, passed: false, exit: 1, command: "npm test",
  output: "expected value 2, received 1" };

function directController({ acceptanceResults = [green], supervisor = null,
  verifier = null, correctionAuditor = null, outcomeAuditor = null,
} = {}) {
  const cwd = mkdtempSync(path.join(tmpdir(), "outsider-direct-behavior-work-"));
  const stateRoot = mkdtempSync(path.join(tmpdir(), "outsider-direct-behavior-state-"));
  mkdirSync(path.join(cwd, "src"));
  writeFileSync(path.join(cwd, "src/value.js"), "export const value = 1;\n");
  const transcript = path.join(cwd, "session.jsonl");
  writeFileSync(transcript, "");
  const baseline = snapshotWorkspace(cwd);
  const semantic = {
    objective: "export value 2",
    successCriteria: ["src/value.js exports value 2"],
    architecturalConstraints: ["keep the public export"],
    forbiddenShortcuts: ["do not edit tests"],
    scope: { in: ["src/value.js"], out: ["test files"] }, uncertainties: [],
  };
  const contract = freezeContract({ cwd, ask: "Change value to 2 without editing tests",
    acceptance: "npm test", semantic,
    semanticAudit: { passed: true, evidenceHash: "sha256:direct-contract-audit" },
    baselineEvidence: baseline });
  const store = RunStore.create({ cwd, contract, supervisorCommand: "direct-supervisor",
    stateRoot });
  store.append("contract_compiled", { objective: semantic.objective,
    successCriteria: semantic.successCriteria.length });
  store.append("contract_audited", { passed: true,
    evidenceHash: contract.semanticAudit.evidenceHash });
  store.append("contract_frozen", { ask: contract.ask, acceptance: contract.acceptance });
  let acceptanceCall = 0;
  const controller = new OutsiderKernelController({ store, baseline,
    acceptance: () => acceptanceResults[Math.min(acceptanceCall++, acceptanceResults.length - 1)],
    decide: () => ({ verdict: "allow",
      proposed: { action: "read", irreversible: false } }),
    supervisor: supervisor ?? (() => ({ ok: true, verdict: { onTrack: false,
      drift: "the current source contradicts the frozen objective",
      plan: ["edit src/value.js to export value 2"],
      expectedNextActions: ["edit:src/value.js"],
      acceptanceRisk: "the current artifact remains red" } })),
    verifier: verifier ?? (({ acceptance }) => ({ ok: true,
      packet: { acceptance, independent: true }, verdict: {
        passed: true, gaps: [], evidence: ["the delivered source satisfies the frozen objective"],
      } })),
    correctionAuditor: correctionAuditor ?? (({ proposal }) => ({ ok: true,
      packet: { proposal }, verdict: { passed: true, errors: [],
        verifiedFacts: ["the one proposed edit targets the frozen defect"] } })),
    outcomeAuditor: outcomeAuditor ?? (({ proposedVerdict }) => ({ ok: true,
      packet: { proposedVerdict }, verdict: { passed: true, errors: [],
        verifiedFacts: ["the semantic PASS is supported by the exact delivered tree"] } })),
    clearanceAuditor: () => ({ ok: true, packet: {}, verdict: { passed: true,
      errors: [], verifiedFacts: ["clearance checked"] } }),
  });
  return { cwd, transcript, store, controller };
}

function stop(controller, transcript) {
  return controller.stop({ input: { hook_event_name: "Stop", transcript_path: transcript } });
}

test("A: a healthy task completes without an added Outsider pause", () => {
  const h = directController({ acceptanceResults: [green, green] });
  const stopped = stop(h.controller, h.transcript);
  assert.equal(stopped.output.decision, "approve");
  const events = h.store.events();
  assert.equal(events.some((event) => event.type === "boundary_paused"), false);
  assert.equal(events.some((event) => event.type === "correction_emitted"), false);
  assert.equal(events.some((event) => event.type === "acceptance_finished"
    && event.phase === "stop" && event.passed === true), true);
  assert.equal(events.some((event) => event.type === "outcome_approval_audit"
    && event.passed === true && !event.insufficient), true);
  assert.equal(events.some((event) => event.type === "outcome_verdict"
    && event.phase === "stop" && event.passed === true), true);
});

test("B: semantic drift pauses synchronously, delivers one bounded correction, then continues", () => {
  const h = directController({ acceptanceResults: [red, green] });
  const first = stop(h.controller, h.transcript);
  assert.equal(first.output.decision, "block");
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  assert.ok(correction?.marker);
  assert.deepEqual(correction.expectedActions.map((action) => action.kind),
    ["edit", "semanticReverify"],
    "the plan contains one bounded repair plus mandatory semantic re-verification");
  assert.equal(correction.expectedActions.filter((action) => action.kind === "edit").length, 1,
    "the correction grants exactly one mutating action, not an unconstrained rewrite");
  const pause = h.store.events().find((event) => event.type === "boundary_paused");
  assert.equal(pause.boundary, "Stop");
  assert.equal(pause.interventionId, correction.interventionId);
  const verdict = h.store.events().find((event) => event.type === "supervisor_verdict"
    && event.interventionId === correction.interventionId && event.onTrack === false);
  assert.equal(verdict.planSteps, 1);
  const audit = h.store.events().find((event) => event.type === "correction_factual_audit"
    && event.interventionId === correction.interventionId);
  assert.equal(audit.passed, true);
  assert.equal(correction.factualAuditSeq, audit.seq);

  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: correction.marker } })}\n`);
  writeFileSync(path.join(h.cwd, "src/value.js"), "export const value = 2;\n");
  const second = stop(h.controller, h.transcript);
  assert.equal(second.output.decision, "approve");
  const events = h.store.events();
  assert.equal(events.filter((event) => event.type === "boundary_paused").length, 1);
  assert.equal(events.filter((event) => event.type === "correction_emitted").length, 1);
  assert.equal(events.some((event) => event.type === "correction_observed"
    && event.interventionId === correction.interventionId), true);
  assert.equal(events.some((event) => event.type === "effect_observed"
    && event.interventionId === correction.interventionId), true);
  assert.equal(events.some((event) => event.type === "intervention_resolved"
    && event.interventionId === correction.interventionId), true);
});

test("C: mechanical, semantic, or adversarial insufficiency each refuses Stop completion", () => {
  const mechanicalUnavailable = { ran: false, passed: false, exit: null,
    command: "npm test", output: "acceptance evidence unavailable" };
  const mechanical = directController({ acceptanceResults: [mechanicalUnavailable],
    supervisor: () => ({ ok: false, error: "no independently audited diagnosis" }) });
  const mechanicalStop = stop(mechanical.controller, mechanical.transcript);
  assert.notEqual(mechanicalStop.output.decision, "approve");
  assert.equal(mechanical.store.events().some((event) => event.type === "acceptance_finished"
    && event.phase === "stop" && event.ran === false && event.passed === false), true);

  const semantic = directController({ acceptanceResults: [green],
    verifier: () => ({ ok: false, error: "semantic evidence unavailable" }),
    supervisor: () => ({ ok: false, error: "no substitute diagnosis" }) });
  const semanticStop = stop(semantic.controller, semantic.transcript);
  assert.notEqual(semanticStop.output.decision, "approve");
  assert.equal(semantic.store.events().some((event) =>
    event.type === "outcome_verifier_failed"), true);
  assert.equal(semantic.store.events().some((event) =>
    event.type === "outcome_verdict" && event.passed === true), false);

  const adversarial = directController({ acceptanceResults: [green],
    outcomeAuditor: ({ proposedVerdict }) => ({ ok: true,
      packet: { proposedVerdict }, verdict: { decision: "insufficient", passed: false,
        errors: [], blockingErrors: [], notes: [], verifiedFacts: [],
        insufficient: "the proposed PASS lacks independent architectural evidence" } }),
    supervisor: () => ({ ok: false, error: "no audited correction available" }) });
  const adversarialStop = stop(adversarial.controller, adversarial.transcript);
  assert.notEqual(adversarialStop.output.decision, "approve");
  const adversarialEvents = adversarial.store.events();
  assert.equal(adversarialEvents.some((event) => event.type === "outcome_approval_audit"
    && event.passed === false && event.insufficient), true);
  assert.equal(adversarialEvents.some((event) => event.type === "outcome_verdict"
    && event.verifierProposedPassed === true && event.passed === false), true);
  for (const run of [mechanical, semantic, adversarial]) {
    assert.equal(run.store.events().some((event) => event.type === "run_finalized"), false,
      "a refused Stop is never laundered into completion");
  }
});
