import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_EVALUATION_SUPERVISOR_EFFORT, DEFAULT_EVALUATION_SUPERVISOR_MODEL,
  headlessCostEnvelope, MAX_EVALUATION_MODEL_PROCESSES,
  requireInteractiveCreditAcknowledgement,
} from "../scripts/stage05-model-cost-policy.mjs";

test("evaluation defaults never silently select Opus or elevated effort", () => {
  assert.equal(DEFAULT_EVALUATION_SUPERVISOR_MODEL, "sonnet");
  assert.equal(DEFAULT_EVALUATION_SUPERVISOR_EFFORT, "low");
});

test("interactive R2/R3/R5 execution requires an explicit uncapped-credit acknowledgement", () => {
  assert.throws(() => requireInteractiveCreditAcknowledgement([], "R2"),
    /R2_INTERACTIVE_CREDITS_NOT_HARD_CAPPED/);
  const policy = requireInteractiveCreditAcknowledgement(
    ["--acknowledge-unbounded-interactive-credits"], "R2");
  assert.equal(policy.acknowledged, true);
  assert.equal(policy.dollarHardCapEnforced, false);
});

test("headless R1 publishes the maximum process and nominal dollar envelope", () => {
  assert.deepEqual(headlessCostEnvelope({ maxBudgetUsd: 0.5, workerProcesses: 1,
    baselineJudgeProcesses: 2, runtimeSupervisorCalls: 4,
    maximumAttemptsPerJudge: 2 }), {
    dollarHardCapEnforcedPerProcess: true,
    maxBudgetUsdPerProcess: 0.5,
    maximumModelProcesses: 13,
    maximumNominalUsd: 6.5,
    assumptions: { workerProcesses: 1, baselineJudgeProcesses: 2,
      runtimeSupervisorCalls: 4, maximumAttemptsPerJudge: 2 },
  });
});

test("R5 source has a finite aggregate model-process ceiling", async () => {
  const source = await import("node:fs").then(({ readFileSync }) =>
    readFileSync(new URL("../scripts/stage05-endurance-canary.mjs", import.meta.url), "utf8"));
  assert.match(source, /formalEnduranceSupervisorBudget\(\{/);
  assert.match(source, /formalSupervisorBudget\.maximumSupervisorCalls/);
  assert.match(source, /formalSupervisorBudget\.maximumModelProcesses/);
  assert.match(source, /maximumHeadlessNominalUsd/);
  assert.match(source, /materializeEvaluationClaudeGuard/);
  assert.doesNotMatch(source, /evaluationSmoke \? 20 : 96/);
});

test("the shared evaluation guard admits the formal R5 retry envelope", () => {
  assert.equal(MAX_EVALUATION_MODEL_PROCESSES >= 61, true);
  assert.equal(MAX_EVALUATION_MODEL_PROCESSES, 64);
});

test("the generic live canary is guarded instead of inheriting account defaults", async () => {
  const source = await import("node:fs").then(({ readFileSync }) =>
    readFileSync(new URL("../scripts/stage05-live-canary.mjs", import.meta.url), "utf8"));
  assert.match(source, /maxInvocations: 16/);
  assert.match(source, /maxBudgetUsd: 0\.5/);
  assert.match(source, /DEFAULT_EVALUATION_SUPERVISOR_MODEL/);
  assert.doesNotMatch(source, /maxBudgetUsd: 10/);
});

test("R1 and Agent Team probes guard both worker and supervisor model launches", async () => {
  const { readFileSync } = await import("node:fs");
  const r1 = readFileSync(new URL("../scripts/stage05-r1-repeatability.mjs",
    import.meta.url), "utf8");
  const teams = readFileSync(new URL("../scripts/stage05-agent-team-probe.mjs",
    import.meta.url), "utf8");
  for (const source of [r1, teams]) assert.match(source,
    /materializeEvaluationClaudeGuard/);
  assert.match(r1, /const supervisorCommand = \[workerExecutable/);
  assert.match(r1, /OUTSIDER_WORKER: workerExecutable/);
  assert.match(teams, /workerExecutable: claude/);
  assert.match(teams, /supervisorCommand: \[claude/);
  assert.match(r1, /workerModel: costRuntime\.policy\.model/);
  assert.match(r1, /workerEffort: costRuntime\.policy\.effort/);
  assert.match(r1, /await delay\(recoveryWindowMs \+ R1_RECOVERY_WINDOW_SAFETY_MARGIN_MS\)/);
});
