import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createObservationCapabilityCatalog } from "../src/outsider-observation-capability-catalog.js";
import { createWorldStateGoalCompiler } from "../src/outsider-world-state-goal-compiler.js";
import { createProductionOutcomeRunnerV1 } from "../src/outsider-production-outcome-runner-v1.js";
import { verifyOutcomeProgramV1 } from "../src/outsider-outcome-program-v1.js";

const NOW = "2026-09-05T12:00:00.000Z";
// Explicit test-only source hashes; no native receipt is claimed by these fixtures.
function catalog() {
  return createObservationCapabilityCatalog({ observedAt: NOW, expiresAt: "2026-09-05T12:05:00Z",
    calcom: { eventTypeId: 6, start: "2026-09-08T00:00:00Z", end: "2026-09-09T00:00:00Z",
      source: { sourceHash: `sha256:${"a".repeat(64)}`,
        sourceClass: "CALCOM_PUBLIC_SANDBOX_AVAILABILITY", observedAt: NOW } },
    opcua: { endpointUrl: "opc.tcp://fixture.example:51210/UA/Fixture",
      officialSourceUrl: "https://fixture.example/opcua", nodeIds: ["i=2258"],
      source: { sourceHash: `sha256:${"b".repeat(64)}`,
        sourceClass: "SIMULATED_INDUSTRIAL_DEMO", observedAt: NOW } },
  });
}
const request = () => ({ requestId: "goal_compiler_fixture", goal: "Produce the requested source reports.",
  completionDeadline: "2026-09-05T12:02:00.000Z", budget: { currency: "USD", maximumAmountMinor: "0" } });
const matched = targetIds => ({ status: "MATCHED", targetIds, missingInformation: [],
  unsupportedOutcomes: [], summary: "Produce timestamped reports, not bookings or hardware readiness." });

test("one matched target uses the existing planner, compiler and runner proposal without execution", async t => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-goal-compiler-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let calls = 0;
  const compiler = createWorldStateGoalCompiler({ catalog: catalog(), clock: () => NOW,
    interpretGoal: async () => { calls += 1; return matched(["calcom_availability_report"]); } });
  const runner = createProductionOutcomeRunnerV1({ directory, composition: { adapters: {} },
    compileGoal: compiler.compileGoal, clock: () => NOW });
  const proposal = await runner.requestOutcome(request());
  const record = compiler.inspectCompilation(request().requestId);
  assert.equal(record.status, "PROPOSED");
  assert.equal(record.compilation.planningResult.status, "FEASIBLE");
  assert.equal(record.compilation.program.nodes.length, 2);
  assert.equal(record.compilation.program.requirements.length, 3);
  assert.equal(verifyOutcomeProgramV1(record.compilation.program).programHash, proposal.programHash);
  assert.equal(proposal.confirmationRequired, true);
  assert.equal(record.providerEffectsPerformed, 0);
  assert.equal(record.executionReadiness.ready, false);
  assert.equal(record.guaranteeCreated, false);
  assert.equal(calls, 1);
});

test("two targets compile two resource actions and joint-current-state acceptance", async () => {
  const compiler = createWorldStateGoalCompiler({ catalog: catalog(), clock: () => NOW,
    interpretGoal: async () => matched(["calcom_availability_report", "opcua_demo_report"]) });
  const program = await compiler.compileGoal(request());
  assert.equal(program.nodes.length, 3);
  assert.equal(program.requirements.length, 5);
  const final = program.nodes.find(node => node.nodeId === "world_state_acceptance");
  assert.equal(final.dependsOn.length, 2);
  assert.equal(final.acceptance.length, 2);
  assert.equal(final.input.worldStateObservation.observationMode, "JOINT_CURRENT_STATE");
  assert.equal(final.input.worldStateObservation.completedActionsAloneSatisfyOutcome, false);
  const record = compiler.inspectCompilation(request().requestId);
  assert.equal(record.compilation.capacityEstablished, false);
  assert.equal(record.compilation.outcomeEstablished, false);
});

test("invented target cannot generate a program", async () => {
  const compiler = createWorldStateGoalCompiler({ catalog: catalog(), clock: () => NOW,
    interpretGoal: async () => matched(["factory_ready"]) });
  await assert.rejects(compiler.compileGoal(request()), /TARGET_NOT_IN_CATALOG/);
  assert.equal(compiler.inspectCompilation(request().requestId), null);
});

test("unsupported outcome and missing facts persist a non-program decision", async () => {
  for (const interpretation of [
    { status: "UNSUPPORTED", targetIds: [], missingInformation: [],
      unsupportedOutcomes: ["Physical factory readiness"], summary: "Demo reports cannot establish physical readiness." },
    { status: "NEEDS_INFORMATION", targetIds: [], missingInformation: ["Which source report is needed?"],
      unsupportedOutcomes: [], summary: "Please identify the report." },
  ]) {
    const compiler = createWorldStateGoalCompiler({ catalog: catalog(), clock: () => NOW,
      interpretGoal: async () => interpretation });
    await assert.rejects(compiler.compileGoal(request()), error => error.code === `GOAL_${interpretation.status}`);
    const record = compiler.inspectCompilation(request().requestId);
    assert.equal(record.status, interpretation.status);
    assert.equal(record.programHash, null);
    assert.equal(record.compilation, undefined);
    assert.equal(record.paymentAuthorized, false);
  }
});

test("model projection omits private action bindings and source endpoints", async () => {
  const input = catalog();
  input.actionBindings.read_calcom_sandbox_availability.input.privateCredentialPath = "/private/fixture/credential.secret";
  let packet;
  const compiler = createWorldStateGoalCompiler({ catalog: input, clock: () => NOW,
    interpretGoal: async value => { packet = value; return matched(["calcom_availability_report"]); } });
  await compiler.compileGoal(request());
  assert.equal(packet.request.goal, request().goal);
  assert.equal(packet.capabilityCatalog.semanticTargets.length, 2);
  assert.equal(packet.capabilityCatalog.sourceReferences.length, 2);
  assert.equal(packet.capabilityCatalog.capacityEstablished, false);
  const projected = JSON.stringify(packet);
  for (const privateValue of ["privateCredentialPath", "/private/fixture/credential.secret", "opc.tcp://fixture.example"]) {
    assert.equal(projected.includes(privateValue), false);
  }
});

test("expired catalog is rejected before invoking the interpreter", async () => {
  let calls = 0;
  const compiler = createWorldStateGoalCompiler({ catalog: catalog(),
    clock: () => "2026-09-05T12:05:00.000Z",
    interpretGoal: async () => { calls += 1; return matched(["calcom_availability_report"]); } });
  await assert.rejects(compiler.compileGoal(request()), /CATALOG_NOT_CURRENT/);
  assert.equal(calls, 0);
});
