import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  assessEnduranceEvidence,
  assessEnduranceEvents,
  assessEnduranceSmokeEvidence,
  assessReleaseReadiness,
} from "../src/outsider-release-certification.js";

const at = (milliseconds) => new Date(Date.UTC(2026, 0, 1) + milliseconds).toISOString();

const stableFieldEvidence = () => ({
  liveCanary: { status: "PASS" },
  r1Repeatability: { status: "PASS" },
  r2AgentTeamDelivery: { status: "PASS" },
  r3IntegrationCorrection: { status: "PASS" },
  r4CrashRecovery: { status: "PASS" },
  desktopCoworkPlugin: { status: "PASS" },
  multiHourEndurance: { status: "PASS" },
  independentSecondMachineInstall: { status: "PASS" },
  codexLifecycleControl: { status: "PASS" },
  chatgptLivePluginInstall: { status: "PASS" },
  chatgptNewChatSkillEvaluation: { status: "PASS" },
});

test("stable release cannot collapse the four live reliability gates into one canary", () => {
  for (const gate of ["r1Repeatability", "r2AgentTeamDelivery",
    "r3IntegrationCorrection", "r4CrashRecovery"]) {
    for (const status of ["NOT_RUN", "FAIL", undefined]) {
      const fieldEvidence = stableFieldEvidence();
      fieldEvidence[gate] = status ? { status } : undefined;
      const result = assessReleaseReadiness({ deterministicReady: true, fieldEvidence });
      assert.equal(result.releaseDecision, "PRIVATE_BETA_READY", `${gate}:${status}`);
      assert.equal(result.stablePublicReleaseReady, false, `${gate}:${status}`);
    }
  }
});

test("stable release requires real Desktop Cowork conformance without blocking private beta", () => {
  for (const status of ["PACKAGED_NOT_CONFORMED", "NOT_RUN", "FAIL"]) {
    const result = assessReleaseReadiness({
      deterministicReady: true,
      fieldEvidence: {
        ...stableFieldEvidence(),
        desktopCoworkPlugin: { status },
      },
    });
    assert.equal(result.releaseDecision, "PRIVATE_BETA_READY", status);
    assert.equal(result.stablePublicReleaseReady, false, status);
  }

  const missingCoworkCanary = assessReleaseReadiness({
    deterministicReady: true,
    fieldEvidence: {
      ...stableFieldEvidence(),
      desktopCoworkPlugin: undefined,
    },
  });
  assert.equal(missingCoworkCanary.releaseDecision, "PRIVATE_BETA_READY");
  assert.equal(missingCoworkCanary.stablePublicReleaseReady, false);

  assert.deepEqual(assessReleaseReadiness({
    deterministicReady: true,
    fieldEvidence: stableFieldEvidence(),
  }), {
    releaseDecision: "PRIVATE_BETA_READY",
    stablePublicReleaseReady: true,
  });
});

test("stable public release cannot bypass advertised Codex control or ChatGPT live skill evidence", () => {
  for (const gate of ["codexLifecycleControl", "chatgptLivePluginInstall",
    "chatgptNewChatSkillEvaluation"]) {
    for (const status of ["NOT_ESTABLISHED", "NOT_RUN", "FAIL", undefined]) {
      const fieldEvidence = stableFieldEvidence();
      fieldEvidence[gate] = status ? { status } : undefined;
      const result = assessReleaseReadiness({ deterministicReady: true, fieldEvidence });
      assert.equal(result.releaseDecision, "PRIVATE_BETA_READY", `${gate}:${status}`);
      assert.equal(result.stablePublicReleaseReady, false, `${gate}:${status}`);
    }
  }
});

test("deterministic failure blocks private beta even when every field canary passes", () => {
  assert.deepEqual(assessReleaseReadiness({
    deterministicReady: false,
    fieldEvidence: stableFieldEvidence(),
  }), {
    releaseDecision: "BLOCKED",
    stablePublicReleaseReady: false,
  });
});

test("the release certifier has evidence inputs for Cowork and a signed distinct second host", () => {
  const source = readFileSync(path.resolve("scripts/stage05-release-certify.mjs"), "utf8");
  assert.match(source, /options\["cowork-state-root"\]/);
  assert.match(source, /options\["cowork-workspace"\]/);
  assert.match(source, /certifyCoworkEvidence/);
  assert.match(source, /options\["second-machine-record"\]/);
  assert.match(source, /options\["second-machine-public-key"\]/);
  assert.match(source, /verifySecondMachineConformance/);
});

test("the release certifier consumes multi-surface doctor v2 without laundering diagnostic health into Claude conformance", () => {
  const source = readFileSync(path.resolve("scripts/stage05-release-certify.mjs"), "utf8");
  assert.match(source, /outsider\/product-doctor\/v2/);
  assert.doesNotMatch(source, /outsider\/product-doctor\/v1/);
  assert.match(source, /readiness\?\.diagnosticOperational === true/);
  assert.match(source, /readiness\?\.claudeProtocolAndAuthReady === true/);
  assert.match(source, /status: claudeHostReady \? "PASS" : "BLOCKED_PRECONDITION"/);
  assert.match(source, /options\.live && claudeHostReady/);
  assert.match(source, /captureFullStdout: true/);
  assert.match(source, /semanticOk && doctorExpectedOk/);
  assert.match(source, /OPERATOR_CERTIFIER_SOURCE_PLUS_INSTALLED_PUBLIC_MANIFEST_VERIFIER_BOUNDARY/);
  assert.match(source, /certifierShippedInsidePublicRuntime: false/);
  assert.match(source, /validateOpenAIUniversalPlugin/);
  assert.match(source, /validateOpenAIUniversalPlugin\(\{ root: installedRoot \}\)/);
  assert.match(source, /chatgptLivePluginInstall: \{ status: "NOT_RUN" \}/);
  assert.match(source, /chatgptNewChatSkillEvaluation: \{ status: "NOT_RUN" \}/);
  assert.match(source, /openAIPluginsDirectoryPublication: \{ status: "NOT_RUN" \}/);
  assert.match(source, /codexLifecycleControl: \{ status: "NOT_ESTABLISHED" \}/);
  assert.match(source, /plugin packaging does not establish ChatGPT live install or Codex lifecycle control/);
  assert.match(source, /installedFilesAvailable/);
  assert.match(source, /--cache/);
  assert.match(source, /installedCertificationBoundaryAvailable/);
  assert.match(source, /R2 evaluator closure is not present in the reviewed public runtime/);
  assert.match(source, /R3 evaluator closure is not present in the reviewed public runtime/);
  assert.match(source, /R4 evaluator closure is not present in the reviewed public runtime/);
  assert.match(source, /second-machine evaluator closure is not present in the reviewed public runtime/);
  assert.match(source, /TaskCreated/);
  assert.match(source, /TaskCompleted/);
  assert.match(source, /TeammateIdle/);
});

test("endurance certification requires duration, patrol verdict and complete proof", () => {
  const events = [
    { type: "worker_launch", at: at(0) },
    { type: "semantic_patrol_due", at: at(30_000) },
    { type: "semantic_patrol_passed", status: "on-track", at: at(40_000) },
    { type: "run_finalized", proofComplete: true, at: at(2 * 60 * 60 * 1000) },
  ];
  assert.equal(assessEnduranceEvents({ events, proofComplete: true }).ok, true);
  const short = assessEnduranceEvents({ events: events.map((event) => event.type === "run_finalized"
    ? { ...event, at: at(10_000) } : event), proofComplete: true });
  assert.equal(short.ok, false);
  assert.ok(short.errors.includes("minimum endurance duration not reached"));
});

test("multi-agent and controller recovery evidence are explicit optional gates", () => {
  const events = [
    { type: "worker_launch", at: at(0) },
    { type: "semantic_patrol_due", at: at(1) },
    { type: "semantic_patrol_finished", status: "correction", at: at(2) },
    { type: "agent_registered", agentId: "main", at: at(3) },
    { type: "agent_registered", agentId: "sub", at: at(4) },
    { type: "multi_agent_integration_verified", at: at(5) },
    { type: "controller_recovered", generation: 2, at: at(6) },
    { type: "run_finalized", proofComplete: true, at: at(2 * 60 * 60 * 1000) },
  ];
  const result = assessEnduranceEvents({ events, proofComplete: true }, {
    requireMultiAgent: true, requireControllerRecovery: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.registeredAgents, 2);
  assert.equal(result.registeredTeammates, 1);
  assert.equal(result.controllerRecoveries, 1);
});

test("endurance can require two real teammates and two team tasks, not main plus one subagent", () => {
  const base = [
    { type: "worker_launch", at: at(0) },
    { type: "semantic_patrol_due", at: at(1) },
    { type: "semantic_patrol_passed", at: at(2) },
    { type: "agent_registered", agentId: "main", at: at(3) },
    { type: "agent_registered", agentId: "teammate:one", at: at(4) },
    { type: "team_task_created", taskId: "one", at: at(5) },
    { type: "multi_agent_integration_verified", at: at(6) },
    { type: "controller_recovered", generation: 2, at: at(7) },
    { type: "run_finalized", proofComplete: true, at: at(2 * 60 * 60 * 1000) },
  ];
  const options = { requireMultiAgent: true, requireControllerRecovery: true,
    minimumTeammates: 2, minimumTeamTasks: 2 };
  assert.equal(assessEnduranceEvents({ events: base, proofComplete: true }, options).ok, false);
  const complete = [
    ...base.slice(0, -2),
    { type: "agent_registered", agentId: "teammate:two", at: at(6) },
    { type: "team_task_created", taskId: "two", at: at(6) },
    ...base.slice(-2),
  ];
  const result = assessEnduranceEvents({ events: complete, proofComplete: true }, options);
  assert.equal(result.ok, true);
  assert.equal(result.registeredTeammates, 2);
  assert.equal(result.teamTasksCreated, 2);
});

function strictEnduranceFixture() {
  const duration = 2 * 60 * 60 * 1000;
  const interval = 60 * 60 * 1000;
  const checkpointTimes = [1_000, 1_000 + interval, 1_000 + duration];
  const preregistration = {
    schema: "outsider/stage05-endurance-preregistration/v1",
    id: "strict-endurance",
    minimumDurationMs: duration,
    checkpointPolicy: {
      minimumIntervalMs: interval,
      minimumCheckpoints: 3,
      timestampsOwnedBy: "controller-external-unix-socket-witness",
      sourceBoundBy: "evaluator-owned-successful-health-check-posttooluse",
    },
    requiredEvidence: {
      distinctRegisteredTeammates: 2,
      teamTasksCreated: 3,
      teammateNames: ["store-owner", "scheduler-owner"],
    },
  };
  preregistration.preregistrationHash = createHash("sha256")
    .update(JSON.stringify(preregistration)).digest("hex");
  const witness = {
    schema: "outsider/stage05-endurance-witness/v1",
    minimumDurationMs: duration,
    minimumIntervalMs: interval,
    minimumCheckpoints: 3,
    enoughDuration: true,
    enoughCheckpoints: true,
    passed: true,
    checkpoints: checkpointTimes.map((atMs, index) => ({
      ordinal: index + 1,
      atMs,
      monotonicMs: atMs,
      at: new Date(atMs).toISOString(),
      label: `checkpoint-${index + 1}`,
      runId: "strict-run",
      toolUseId: `checkpoint-tool-${index + 1}`,
    })),
    wallClockDiscontinuities: [],
  };
  const events = [
    { seq: 1, type: "worker_launch", at: new Date(0).toISOString() },
    { seq: 2, type: "controller_started", generation: 1, at: at(1) },
    { seq: 3, type: "agent_registered", agentId: "main", at: at(2) },
    { seq: 4, type: "agent_registered", agentId: "teammate:store-owner",
      agentKind: "teammate", identityProvenanceHash: "store-provenance",
      lineageHashes: [{ hash: "store-lineage" }], at: at(3) },
    { seq: 5, type: "teammate_context_injected", agentId: "teammate:store-owner",
      oncePerAgent: true, identityProvenanceHash: "store-provenance",
      identityLineageHash: "store-lineage", at: at(4) },
    { seq: 6, type: "agent_registered", agentId: "teammate:scheduler-owner",
      agentKind: "teammate", identityProvenanceHash: "scheduler-provenance",
      lineageHashes: [{ hash: "scheduler-lineage" }], at: at(5) },
    { seq: 7, type: "teammate_context_injected", agentId: "teammate:scheduler-owner",
      oncePerAgent: true, identityProvenanceHash: "scheduler-provenance",
      identityLineageHash: "scheduler-lineage", at: at(6) },
    { seq: 8, type: "team_task_created", taskId: "store", at: at(7) },
    { seq: 9, type: "team_task_created", taskId: "scheduler", at: at(8) },
    { seq: 10, type: "team_task_created", taskId: "integration", at: at(9) },
    { seq: 11, type: "task_graph_updated", taskId: "store", owner: "store-owner",
      status: "in_progress", blockedBy: [], at: at(10) },
    { seq: 12, type: "task_graph_updated", taskId: "scheduler", owner: "scheduler-owner",
      status: "in_progress", blockedBy: [], at: at(11) },
    { seq: 13, type: "task_graph_updated", taskId: "integration", owner: "lead",
      status: "pending", blockedBy: ["store", "scheduler"], at: at(12) },
    { seq: 14, type: "semantic_patrol_due", agentId: "main", toolBoundaries: 4, at: at(13) },
    { seq: 15, type: "semantic_patrol_passed", agentId: "main", toolBoundaries: 4,
      status: "on-track", at: at(14) },
    { seq: 16, type: "endurance_crash_injection_due", at: at(15) },
    { seq: 17, type: "controller_recovered", generation: 2, at: at(16) },
    { seq: 18, type: "endurance_crash_recovery_confirmed", generation: 2, at: at(17) },
    { seq: 19, type: "boundary_reached", boundary: "PostToolUse", tool: "Read",
      toolUseId: "post-recovery-tool", at: at(18) },
    { seq: 20, type: "semantic_patrol_due", agentId: "main", toolBoundaries: 8, at: at(19) },
    { seq: 21, type: "correction_factual_audit", interventionId: "patrol-correction",
      passed: true, insufficient: null, at: at(20) },
    { seq: 22, type: "correction_emitted", interventionId: "patrol-correction",
      agentId: "main", source: "supervisor_plan", factualAuditSeq: 21, at: at(21) },
    { seq: 23, type: "semantic_patrol_finished", agentId: "main", toolBoundaries: 8,
      status: "correction", interventionId: "patrol-correction", at: at(22) },
    { seq: 24, type: "confirmed_file_touch", agentId: "teammate:store-owner",
      taskIds: ["store"], file: "src/store.js", at: at(23) },
    { seq: 25, type: "confirmed_file_touch", agentId: "teammate:scheduler-owner",
      taskIds: ["scheduler"], file: "src/scheduler.js", at: at(24) },
    { seq: 26, type: "team_task_completed", taskId: "store",
      agentId: "teammate:store-owner", independentlyVerified: true, at: at(25) },
    { seq: 27, type: "team_task_completed", taskId: "scheduler",
      agentId: "teammate:scheduler-owner", independentlyVerified: true, at: at(26) },
    { seq: 28, type: "multi_agent_integration_verified", taskId: "integration",
      agentId: "main", at: at(27) },
    { seq: 29, type: "coordination_ready_at_stop", at: at(28) },
    ...checkpointTimes.flatMap((time, index) => [{
      seq: 30 + index * 2,
      type: "boundary_reached",
      boundary: "PostToolUse",
      tool: "Bash",
      action: "npm test",
      toolUseId: `checkpoint-tool-${index + 1}`,
      eventHash: `health-event-${index + 1}`,
      exit: 0,
      at: new Date(time).toISOString(),
    }, {
      seq: 31 + index * 2,
      type: "endurance_checkpoint_recorded",
      label: `checkpoint-${index + 1}`,
      witnessOrdinal: index + 1,
      toolUseId: `checkpoint-tool-${index + 1}`,
      sourceBoundarySeq: 30 + index * 2,
      sourceBoundaryEventHash: `health-event-${index + 1}`,
      sourceCommandClass: "EXACT_FROZEN_ACCEPTANCE_HEALTH_CHECK",
      evaluatorOwnsWitnessCredential: true,
      workerReceivedWitnessCredential: false,
      at: new Date(time + 1).toISOString(),
    }]),
    { seq: 36, type: "worker_exit", at: new Date(duration + 1_500).toISOString() },
    { seq: 37, type: "run_finalized", proofComplete: true, deliveryComplete: true,
      interventionComplete: true, at: new Date(duration + 2_000).toISOString() },
  ];
  return { events, proofComplete: true, preregistration, witness };
}

test("strict endurance requires external checkpoints, real teammates, recovery and proof", () => {
  const fixture = strictEnduranceFixture();
  const result = assessEnduranceEvidence(fixture);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(result.checkpointEvidence.witnessedDurationMs, 2 * 60 * 60 * 1000);
  assert.deepEqual(result.requiredTeammateIds,
    ["teammate:store-owner", "teammate:scheduler-owner"]);
});

test("evaluator-private checkpoints require an exact sealed health-check commitment", () => {
  const fixture = strictEnduranceFixture();
  const missingCommitment = fixture.events.filter((event) =>
    !(event.type === "endurance_checkpoint_recorded" && event.witnessOrdinal === 2));
  const missing = assessEnduranceEvidence({ ...fixture, events: missingCommitment });
  assert.equal(missing.ok, false);
  assert.ok(missing.errors.includes(
    "accepted external checkpoints are not backed by distinct successful tool boundaries"));

  const mismatched = fixture.events.map((event) =>
    event.type === "endurance_checkpoint_recorded" && event.witnessOrdinal === 2
      ? { ...event, sourceBoundaryEventHash: "different-health-event" } : event);
  const rejected = assessEnduranceEvidence({ ...fixture, events: mismatched });
  assert.equal(rejected.ok, false);
  assert.ok(rejected.errors.includes(
    "accepted external checkpoints are not backed by distinct successful tool boundaries"));
});

test("a declared idle-shift and recovery-drill policy cannot pass on legacy duration evidence", () => {
  const fixture = strictEnduranceFixture();
  fixture.preregistration.shiftPolicy = {
    scheduler: "controller-external-monotonic-witness",
    idleBetweenShifts: true,
  };
  fixture.preregistration.recoveryDrill = {
    path: ".outsider-endurance-drift",
    contentHash: "sha256:drill",
    mustProduceAuditedCausalIntervention: true,
  };
  fixture.preregistration.shiftPolicy = {
    scheduler: "controller-external-monotonic-witness",
    idleBetweenShifts: true,
  };
  delete fixture.preregistration.preregistrationHash;
  fixture.preregistration.preregistrationHash = createHash("sha256")
    .update(JSON.stringify(fixture.preregistration)).digest("hex");
  const result = assessEnduranceEvidence(fixture);
  assert.equal(result.ok, false);
  assert.equal(result.boundedShiftEvidence.enabled, true);
  assert.equal(result.recoveryDrillEvidence.enabled, true);
  assert.ok(result.errors.includes(
    "bounded checkpoint-shift cardinality does not match the external witness"));
  assert.ok(result.errors.includes(
    "preregistered evaluator-owned recovery drill was not injected"));
});

test("recovery drill evidence binds one controller-prepared Stop fault to an audited causal chain", () => {
  const fixture = strictEnduranceFixture();
  fixture.preregistration.recoveryDrill = {
    path: ".outsider-endurance-drift",
    contentHash: "sha256:drill",
    mustProduceAuditedCausalIntervention: true,
  };
  fixture.events.push(
    { seq: 100, type: "boundary_reached", boundary: "Stop" },
    { seq: 101, type: "outcome_verdict", phase: "stop", passed: true },
    { seq: 102, type: "endurance_recovery_drill_armed",
      path: ".outsider-endurance-drift", contentHash: "sha256:drill",
      evaluatorOwned: true, afterApprovedStopSeq: 100 },
    { seq: 103, type: "endurance_shift_dispatched", kind: "recovery-drill",
      ordinal: 0, armedEventSeq: 102 },
    { seq: 104, type: "endurance_recovery_drill_injected",
      path: ".outsider-endurance-drift", contentHash: "sha256:drill",
      evaluatorOwned: true, controllerPreparedBeforeHook: true, armedEventSeq: 102 },
    { seq: 105, type: "boundary_reached", boundary: "Stop" },
    { seq: 106, type: "correction_factual_audit", interventionId: "drill-i",
      passed: true, insufficient: null },
    { seq: 107, type: "correction_emitted", interventionId: "drill-i",
      correctionAuthorityHash: "sha256:authority", source: "supervisor_plan",
      factualAuditSeq: 106, expectedActions: [{ kind: "delete",
        path: ".outsider-endurance-drift", preSha256: "sha256:drill" }] },
    { seq: 108, type: "correction_observed", interventionId: "drill-i",
      correctionAuthorityHash: "sha256:authority" },
    { seq: 109, type: "effect_observed", interventionId: "drill-i",
      correctionAuthorityHash: "sha256:authority",
      matchedExpectedAction: JSON.stringify({ kind: "delete",
        path: ".outsider-endurance-drift", preSha256: "sha256:drill" }) },
    { seq: 110, type: "intervention_resolved", interventionId: "drill-i",
      correctionAuthorityHash: "sha256:authority", correctionObserved: true,
      effectObserved: true },
    { seq: 111, type: "endurance_shift_completed", kind: "recovery-drill",
      interventionId: "drill-i" },
  );
  delete fixture.preregistration.preregistrationHash;
  fixture.preregistration.preregistrationHash = createHash("sha256")
    .update(JSON.stringify(fixture.preregistration)).digest("hex");
  const result = assessEnduranceEvidence(fixture);
  assert.equal(result.recoveryDrillEvidence.ok, true,
    result.recoveryDrillEvidence.errors.join("; "));

  const withoutAtomicPreparation = fixture.events.map((event) => event.seq === 104
    ? { ...event, controllerPreparedBeforeHook: false } : event);
  const rejected = assessEnduranceEvidence({ ...fixture, events: withoutAtomicPreparation });
  assert.equal(rejected.recoveryDrillEvidence.ok, false);
  assert.ok(rejected.recoveryDrillEvidence.errors.includes(
    "preregistered evaluator-owned recovery drill was not injected"));
});

test("recovery drill follows an explicit semantic-patrol supersession to the effective correction", () => {
  const base = strictEnduranceFixture();
  base.preregistration.evaluationMode = "NON_CERTIFYING_SMOKE";
  base.preregistration.recoveryDrill = {
    path: ".outsider-endurance-drift", contentHash: "sha256:drill",
    mustProduceAuditedCausalIntervention: true,
  };
  const replacementId = "replacement-patrol-intervention";
  const replacementHash = "sha256:replacement-authority";
  base.events.push(
    { seq: 100, type: "boundary_reached", boundary: "Stop" },
    { seq: 101, type: "outcome_verdict", phase: "stop", passed: true },
    { seq: 102, type: "endurance_recovery_drill_armed",
      path: ".outsider-endurance-drift", contentHash: "sha256:drill",
      evaluatorOwned: true, afterApprovedStopSeq: 100 },
    { seq: 103, type: "endurance_shift_dispatched", kind: "recovery-drill",
      ordinal: 0, armedEventSeq: 102 },
    { seq: 104, type: "endurance_recovery_drill_injected",
      path: ".outsider-endurance-drift", contentHash: "sha256:drill",
      evaluatorOwned: true, controllerPreparedBeforeHook: true, armedEventSeq: 102 },
    { seq: 105, type: "boundary_reached", boundary: "Stop" },
    { seq: 106, type: "correction_factual_audit", interventionId: "initial-stop-intervention",
      passed: true, insufficient: null },
    { seq: 107, type: "correction_emitted", interventionId: "initial-stop-intervention",
      correctionAuthorityHash: "sha256:initial-authority", source: "supervisor_plan",
      factualAuditSeq: 106, expectedActions: [{ kind: "delete",
        path: ".outsider-endurance-drift", preSha256: "sha256:drill" }] },
    { seq: 108, type: "correction_factual_audit", interventionId: replacementId,
      correctionAuthorityHash: replacementHash, passed: true, insufficient: null },
    { seq: 109, type: "correction_emitted", interventionId: replacementId,
      correctionAuthorityHash: replacementHash, source: "supervisor_plan", factualAuditSeq: 108,
      expectedActions: [{ kind: "delete", path: ".outsider-endurance-drift",
        preSha256: "sha256:drill" }] },
    { seq: 110, type: "intervention_superseded_by_semantic_patrol",
      interventionId: "initial-stop-intervention", replacementInterventionId: replacementId },
    { seq: 111, type: "correction_observed", interventionId: replacementId,
      correctionAuthorityHash: replacementHash },
    { seq: 112, type: "effect_observed", interventionId: replacementId,
      correctionAuthorityHash: replacementHash,
      matchedExpectedAction: JSON.stringify({ kind: "delete",
        path: ".outsider-endurance-drift", preSha256: "sha256:drill" }) },
    { seq: 113, type: "intervention_resolved", interventionId: replacementId,
      correctionAuthorityHash: replacementHash, correctionObserved: true, effectObserved: true },
    { seq: 114, type: "endurance_shift_completed", kind: "recovery-drill",
      interventionId: replacementId },
  );
  base.events.sort((left, right) => Number(left.seq) - Number(right.seq));
  const assessed = assessEnduranceSmokeEvidence({
    events: base.events,
    proofComplete: true,
    preregistration: base.preregistration,
    witness: base.witness,
  });
  assert.equal(assessed.recoveryDrillEvidence.ok, true);
  assert.equal(assessed.recoveryDrillEvidence.initialInterventionId, "initial-stop-intervention");
  assert.equal(assessed.recoveryDrillEvidence.interventionId, replacementId);
});

test("recovery drill follows the later audited retry that actually repairs the same injected fault", () => {
  const base = strictEnduranceFixture();
  base.preregistration.evaluationMode = "NON_CERTIFYING_SMOKE";
  base.preregistration.recoveryDrill = {
    path: ".outsider-endurance-drift", contentHash: "sha256:drill",
    mustProduceAuditedCausalIntervention: true,
  };
  const effectiveId = "effective-stop-retry";
  const effectiveHash = "sha256:effective-authority";
  base.events.push(
    { seq: 100, type: "boundary_reached", boundary: "Stop" },
    { seq: 101, type: "outcome_verdict", phase: "stop", passed: true },
    { seq: 102, type: "endurance_recovery_drill_armed",
      path: ".outsider-endurance-drift", contentHash: "sha256:drill",
      evaluatorOwned: true, afterApprovedStopSeq: 100 },
    { seq: 103, type: "endurance_shift_dispatched", kind: "recovery-drill",
      ordinal: 0, armedEventSeq: 102 },
    { seq: 104, type: "endurance_recovery_drill_injected",
      path: ".outsider-endurance-drift", contentHash: "sha256:drill",
      evaluatorOwned: true, controllerPreparedBeforeHook: true, armedEventSeq: 102 },
    { seq: 105, type: "boundary_reached", boundary: "Stop" },
    { seq: 106, type: "correction_factual_audit", interventionId: "ineffective-first",
      passed: true, insufficient: null },
    { seq: 107, type: "correction_emitted", interventionId: "ineffective-first",
      correctionAuthorityHash: "sha256:first-authority", source: "supervisor_plan",
      factualAuditSeq: 106,
      expectedActions: [{ kind: "delete", path: ".outsider-endurance-drift",
        preSha256: "sha256:drill" }] },
    { seq: 108, type: "correction_observed", interventionId: "ineffective-first",
      correctionAuthorityHash: "sha256:first-authority" },
    { seq: 109, type: "intervention_unresolved", interventionId: "ineffective-first" },
    { seq: 110, type: "boundary_reached", boundary: "Stop" },
    { seq: 111, type: "correction_factual_audit", interventionId: effectiveId,
      passed: true, insufficient: null },
    { seq: 112, type: "correction_emitted", interventionId: effectiveId,
      correctionAuthorityHash: effectiveHash, source: "supervisor_plan",
      factualAuditSeq: 111,
      expectedActions: [{ kind: "delete", path: ".outsider-endurance-drift",
        preSha256: "sha256:drill" }] },
    { seq: 113, type: "correction_observed", interventionId: effectiveId,
      correctionAuthorityHash: effectiveHash },
    { seq: 114, type: "effect_observed", interventionId: effectiveId,
      correctionAuthorityHash: effectiveHash,
      matchedExpectedAction: JSON.stringify({ kind: "delete",
        path: ".outsider-endurance-drift", preSha256: "sha256:drill" }) },
    { seq: 115, type: "intervention_resolved", interventionId: effectiveId,
      correctionAuthorityHash: effectiveHash, correctionObserved: true,
      effectObserved: true },
    { seq: 116, type: "endurance_shift_completed", kind: "recovery-drill",
      interventionId: effectiveId },
  );
  base.events.sort((left, right) => Number(left.seq) - Number(right.seq));
  const assessed = assessEnduranceSmokeEvidence({
    events: base.events,
    proofComplete: true,
    preregistration: base.preregistration,
    witness: base.witness,
  });
  assert.equal(assessed.recoveryDrillEvidence.ok, true,
    assessed.recoveryDrillEvidence.errors.join("; "));
  assert.equal(assessed.recoveryDrillEvidence.initialInterventionId, "ineffective-first");
  assert.equal(assessed.recoveryDrillEvidence.interventionId, effectiveId);

  const unrelated = base.events.map((event) => event.interventionId === effectiveId
    && event.type === "correction_emitted"
    ? { ...event, expectedActions: [{ kind: "edit", path: "src/index.js" }] }
    : event);
  const rejected = assessEnduranceSmokeEvidence({
    events: unrelated, proofComplete: true,
    preregistration: base.preregistration, witness: base.witness,
  });
  assert.equal(rejected.recoveryDrillEvidence.ok, false,
    "an unrelated later correction cannot be laundered into recovery-drill credit");
});

test("non-certifying smoke reuses strict clock, shift, recovery and patrol proofs", () => {
  const fixture = strictEnduranceFixture();
  fixture.preregistration.evaluationMode = "NON_CERTIFYING_SMOKE";
  delete fixture.preregistration.agentTeamPolicy;
  fixture.preregistration.recoveryDrill = {
    path: ".outsider-endurance-drift",
    contentHash: "sha256:drill",
    mustProduceAuditedCausalIntervention: true,
  };
  fixture.preregistration.shiftPolicy = {
    scheduler: "controller-external-monotonic-witness",
    idleBetweenShifts: true,
  };
  fixture.events.push(
    { seq: 100, type: "boundary_reached", boundary: "Stop" },
    { seq: 101, type: "outcome_verdict", phase: "stop", passed: true },
    { seq: 102, type: "endurance_recovery_drill_armed",
      path: ".outsider-endurance-drift", contentHash: "sha256:drill",
      evaluatorOwned: true, afterApprovedStopSeq: 100 },
    { seq: 103, type: "endurance_shift_dispatched", kind: "recovery-drill",
      ordinal: 0, armedEventSeq: 102 },
    { seq: 104, type: "endurance_recovery_drill_injected",
      path: ".outsider-endurance-drift", contentHash: "sha256:drill",
      evaluatorOwned: true, controllerPreparedBeforeHook: true, armedEventSeq: 102 },
    { seq: 105, type: "boundary_reached", boundary: "Stop" },
    { seq: 106, type: "correction_factual_audit", interventionId: "drill-i",
      passed: true, insufficient: null },
    { seq: 107, type: "correction_emitted", interventionId: "drill-i",
      correctionAuthorityHash: "sha256:authority", source: "supervisor_plan",
      factualAuditSeq: 106 },
    { seq: 108, type: "correction_observed", interventionId: "drill-i",
      correctionAuthorityHash: "sha256:authority" },
    { seq: 109, type: "effect_observed", interventionId: "drill-i",
      correctionAuthorityHash: "sha256:authority" },
    { seq: 110, type: "intervention_resolved", interventionId: "drill-i",
      correctionAuthorityHash: "sha256:authority", correctionObserved: true,
      effectObserved: true },
    { seq: 111, type: "endurance_shift_completed", kind: "recovery-drill",
      interventionId: "drill-i" },
  );
  delete fixture.preregistration.preregistrationHash;
  fixture.preregistration.preregistrationHash = createHash("sha256")
    .update(JSON.stringify(fixture.preregistration)).digest("hex");
  const missingShiftProof = assessEnduranceSmokeEvidence(fixture);
  assert.equal(missingShiftProof.ok, false);
  assert.ok(missingShiftProof.errors.includes(
    "bounded checkpoint-shift cardinality does not match the external witness"));
  const noRecoveryCorrection = fixture.events.filter((event) => event.seq !== 107);
  assert.equal(assessEnduranceSmokeEvidence({ ...fixture, events: noRecoveryCorrection }).ok, false);
});

test("a long event gap without the external witness is not endurance evidence", () => {
  const fixture = strictEnduranceFixture();
  const result = assessEnduranceEvidence({ ...fixture, witness: null });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("controller-external endurance witness missing or invalid"));
});

test("strict patrol proof pairs each due event with a usable verdict for the same patrol clock", () => {
  const fixture = strictEnduranceFixture();
  const passing = assessEnduranceEvidence(fixture);
  assert.equal(passing.usablePatrolsBeforeCrash, 1);
  assert.equal(passing.usablePatrolsAfterRecovery, 1);
  assert.deepEqual(passing.usablePatrols.map((patrol) => patrol.status),
    ["on-track", "correction"]);

  for (const status of ["insufficient", "invalid-correction", "invalid-clearance",
    "completion-budget-reserved"]) {
    const events = fixture.events.map((event) => event.seq === 15
      ? { ...event, type: "semantic_patrol_finished", status } : event);
    const result = assessEnduranceEvidence({ ...fixture, events });
    assert.equal(result.ok, false, status);
    assert.equal(result.usablePatrolsBeforeCrash, 0, status);
    assert.ok(result.errors.includes(
      "usable semantic patrol evidence is required both before crash and after recovery"), status);
  }

  const wrongActor = fixture.events.map((event) => event.seq === 15
    ? { ...event, agentId: "teammate:store-owner" } : event);
  assert.equal(assessEnduranceEvidence({ ...fixture, events: wrongActor })
    .usablePatrolsBeforeCrash, 0);
  const wrongClock = fixture.events.map((event) => event.seq === 15
    ? { ...event, toolBoundaries: 5 } : event);
  assert.equal(assessEnduranceEvidence({ ...fixture, events: wrongClock })
    .usablePatrolsBeforeCrash, 0);
});

test("a correction patrol is usable only after factual audit and a real emitted correction", () => {
  const fixture = strictEnduranceFixture();
  const cases = [
    {
      label: "failed factual audit",
      events: fixture.events.map((event) => event.seq === 21 ? { ...event, passed: false } : event),
    },
    {
      label: "missing factual audit",
      events: fixture.events.filter((event) => event.seq !== 21),
    },
    {
      label: "missing emitted correction",
      events: fixture.events.filter((event) => event.seq !== 22),
    },
    {
      label: "mechanical fallback is not a supervisor correction",
      events: fixture.events.map((event) => event.seq === 22
        ? { ...event, source: "acceptance_rework" } : event),
    },
    {
      label: "correction does not name the factual audit",
      events: fixture.events.map((event) => event.seq === 22
        ? { ...event, factualAuditSeq: 999 } : event),
    },
  ];
  for (const entry of cases) {
    const result = assessEnduranceEvidence({ ...fixture, events: entry.events });
    assert.equal(result.ok, false, entry.label);
    assert.equal(result.usablePatrolsAfterRecovery, 0, entry.label);
    assert.ok(result.errors.includes(
      "usable semantic patrol evidence is required both before crash and after recovery"),
    entry.label);
  }
});

test("strict recovery proof orders crash, takeover, real post-recovery work and worker exit", () => {
  const fixture = strictEnduranceFixture();
  const recoveryError = "crash injection, confirmed recovery, post-recovery tool boundary and worker exit are not causally ordered";
  const cases = [
    {
      label: "missing controller recovery",
      events: fixture.events.filter((event) => event.type !== "controller_recovered"),
    },
    {
      label: "missing external recovery confirmation",
      events: fixture.events.filter((event) => event.type !== "endurance_crash_recovery_confirmed"),
    },
    {
      label: "confirmation precedes controller takeover",
      events: fixture.events.map((event) => event.type === "endurance_crash_recovery_confirmed"
        ? { ...event, seq: 16 } : event),
    },
    {
      label: "no real post-recovery tool boundary",
      events: fixture.events.map((event) => event.type === "boundary_reached"
        ? { ...event, boundary: "PreToolUse" } : event),
    },
    {
      label: "worker exits before post-recovery work and patrol",
      events: fixture.events.map((event) => event.type === "worker_exit"
        ? { ...event, seq: 19 } : event),
    },
  ];
  for (const entry of cases) {
    const result = assessEnduranceEvidence({ ...fixture, events: entry.events });
    assert.equal(result.ok, false, entry.label);
    assert.ok(result.errors.includes(recoveryError), entry.label);
  }
});

test("ordinary Agent-tool subagents cannot impersonate real Agent Team teammates", () => {
  const fixture = strictEnduranceFixture();
  const events = fixture.events.map((event) => event.type === "agent_registered"
    && event.agentId === "teammate:store-owner" ? { ...event, agentId: "opaque-subagent-id" }
    : event);
  const result = assessEnduranceEvidence({ ...fixture, events });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("required real Agent Team teammates were not host-bound"));
});

test("strict endurance does not trust a teammate prefix without host lineage and injected context", () => {
  const fixture = strictEnduranceFixture();
  const cases = [
    fixture.events.map((event) => event.type === "agent_registered"
      && event.agentId === "teammate:store-owner"
      ? { ...event, agentKind: undefined, identityProvenanceHash: undefined,
        lineageHashes: undefined } : event),
    fixture.events.filter((event) => !(event.type === "teammate_context_injected"
      && event.agentId === "teammate:store-owner")),
    fixture.events.map((event) => event.type === "teammate_context_injected"
      && event.agentId === "teammate:store-owner"
      ? { ...event, identityLineageHash: "unrelated-lineage" } : event),
  ];
  for (const events of cases) {
    const result = assessEnduranceEvidence({ ...fixture, events });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.startsWith("Agent Team conformance:")));
  }
});

test("strict multi-agent proof binds ownership, touch and completion to the same teammate task", () => {
  const fixture = strictEnduranceFixture();
  const cases = [
    {
      label: "missing owner assignment",
      events: fixture.events.filter((event) => !(event.type === "task_graph_updated"
        && event.taskId === "store")),
    },
    {
      label: "touch attributed to an unrelated task",
      events: fixture.events.map((event) => event.type === "confirmed_file_touch"
        && event.agentId === "teammate:store-owner" ? { ...event, taskIds: ["scheduler"] } : event),
    },
    {
      label: "completion attributed to a different task",
      events: fixture.events.map((event) => event.type === "team_task_completed"
        && event.agentId === "teammate:store-owner" ? { ...event, taskId: "integration" } : event),
    },
    {
      label: "task ownership moved away while the teammate touched it",
      events: [
        ...fixture.events,
        { seq: 23.5, type: "task_graph_updated", taskId: "store", owner: "lead",
          status: "in_progress", blockedBy: [], at: at(22) },
        { seq: 25.5, type: "task_graph_updated", taskId: "store", owner: "store-owner",
          status: "in_progress", blockedBy: [], at: at(24) },
      ],
    },
  ];
  for (const entry of cases) {
    const result = assessEnduranceEvidence({ ...fixture, events: entry.events });
    assert.equal(result.ok, false, entry.label);
    assert.ok(result.errors.includes(
      "required teammate task causal chain missing: teammate:store-owner"), entry.label);
  }
});

test("strict multi-agent proof requires the lead integration task to depend on both completed tasks", () => {
  const fixture = strictEnduranceFixture();
  const cases = [
    {
      label: "lead task omits one teammate dependency",
      events: fixture.events.map((event) => event.type === "task_graph_updated"
        && event.taskId === "integration" ? { ...event, blockedBy: ["store"] } : event),
    },
    {
      label: "integration event names a teammate task",
      events: fixture.events.map((event) => event.type === "multi_agent_integration_verified"
        ? { ...event, taskId: "store" } : event),
    },
    {
      label: "integration precedes a teammate completion",
      events: fixture.events.map((event) => event.type === "multi_agent_integration_verified"
        ? { ...event, seq: 26.5 } : event),
    },
    {
      label: "coordination is declared ready before integration",
      events: fixture.events.map((event) => event.type === "coordination_ready_at_stop"
        ? { ...event, seq: 27.5 } : event),
    },
  ];
  for (const entry of cases) {
    const result = assessEnduranceEvidence({ ...fixture, events: entry.events });
    assert.equal(result.ok, false, entry.label);
    assert.ok(result.errors.includes(
      "lead integration task is not causally bound to both completed teammate tasks before Stop"),
    entry.label);
  }
});
