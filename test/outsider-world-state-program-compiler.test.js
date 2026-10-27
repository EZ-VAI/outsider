/* Synthetic integration only: no physical state or provider capacity is claimed. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { compileWorldStateResourcePlan }
  from "../src/outsider-world-state-program-compiler.js";
import { createDurableOutcomeProgramOrchestratorV1 }
  from "../src/outsider-durable-outcome-program-orchestrator-v1.js";

const PREPARATIONS = ["prepare_power", "prepare_network", "prepare_space"];
const INSTALLATIONS = ["install_a", "install_b"];
const START = "2026-09-05T12:00:00.000Z";
const fact = (predicateId, value = true) => ({ predicateId, valueType: typeof value, value });
const condition = predicateId => ({ ...fact(predicateId), operator: "EQ" });

function compilation(label) {
  const preparationFacts = ["power_ready", "network_ready", "space_ready"];
  const targets = [...preparationFacts, "a_installed", "b_installed"];
  const actions = [
    ...PREPARATIONS.map((actionId, index) => ({ actionId, capability: `simulated.${actionId}`,
      preconditions: [], effects: [fact(preparationFacts[index])], durationMs: 10,
      costMinor: "1", resourceClaims: [] })),
    ...INSTALLATIONS.map((actionId, index) => ({ actionId, capability: `simulated.${actionId}`,
      preconditions: preparationFacts.map(condition), effects: [fact(`${index ? "b" : "a"}_installed`)],
      durationMs: 10, costMinor: "1", resourceClaims: [{ resourceId: "shared_crew", units: 1 }] })),
    { actionId: "unselected_full_service", capability: "simulated.full_service",
      preconditions: [], effects: targets.map(id => fact(id)), durationMs: 5,
      costMinor: "9", resourceClaims: [] },
  ];
  const requirements = actions.flatMap(action => ["PRIMARY", "RECOVERY"].map(role => ({
    requirementId: `${action.actionId}_${role.toLowerCase()}`, role, capability: action.capability,
    constraints: { evidenceClass: "SIMULATION_ONLY" }, minimumReservationMs: 60000,
    dependsOnRequirementIds: INSTALLATIONS.includes(action.actionId) ? ["crew_capacity"] : [],
  })));
  requirements.push({ requirementId: "crew_capacity", role: "PRIMARY", capability: "simulated.crew",
    constraints: { capacityUnits: 1, evidenceClass: "SIMULATION_ONLY" }, minimumReservationMs: 60000,
    dependsOnRequirementIds: [] },
  { requirementId: "independent_state", role: "INDEPENDENT_WITNESS", capability: "simulated.current_state",
    constraints: { evidenceClass: "SIMULATION_ONLY" }, minimumReservationMs: 60000,
    dependsOnRequirementIds: [] });
  const input = {
    planningInput: { initialState: [], targetPredicates: targets.map(condition), actions,
      resources: [{ resourceId: "shared_crew", resourceType: "personnel", capacityUnits: 1 }],
      budget: { currency: "USD", maximumAmountMinor: "9" }, deadlineMs: 30 },
    programInput: { programId: `simulated_compiled_${label}`, orderId: `simulated_order_${label}`,
      createdAt: START, formationDeadline: "2026-09-05T12:01:00.000Z",
      completionDeadline: "2026-09-05T12:01:00.030Z",
      statement: "SIMULATION ONLY: power, network and space must remain ready while two installed systems jointly pass current-state acceptance.",
      requirements, finalWitnessRequirementId: "independent_state",
      obligations: requirements.map(requirement => ({ obligationId: `close_${requirement.requirementId}`,
        targetRequirementId: requirement.requirementId, nodeId: null, trigger: "ALWAYS",
        action: "RELEASE_SIMULATED_RESOURCE", input: {}, deadline: "2026-09-05T12:15:00.000Z" })) },
    actionBindings: Object.fromEntries(actions.map(action => [action.actionId, {
      primaryRequirementId: `${action.actionId}_primary`, recoveryRequirementId: `${action.actionId}_recovery`,
      witnessRequirementId: "independent_state", input: { evidenceClass: "SIMULATION_ONLY" },
    }])),
  };
  return compileWorldStateResourcePlan(input);
}

function simulation(t, compiled, { loseNetworkBeforeFinalObservation = false } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-compiled-world-state-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = [], state = new Map(), preparationStarts = new Set();
  let unblockPreparations, activePreparations = 0, maximumPreparations = 0, crewBusy = false;
  const barrier = new Promise(resolve => { unblockPreparations = resolve; });
  let time = Date.parse(START);
  function lifecycle(role) {
    return { adapterId: `simulated_${role}`, providerRef: `simulation-provider-${role}`,
      async reserve({ requirement, dependencyReservations }) {
        calls.push({ phase: "reserve", requirementId: requirement.requirementId });
        if (requirement.requirementId.startsWith("install_")) {
          assert.equal(dependencyReservations.crew_capacity.reservationId, "simulation:crew_capacity");
        }
        return { status: "RESERVED", reservationId: `simulation:${requirement.requirementId}`,
          validUntil: "2026-09-05T12:20:00.000Z", providerReceipt: { evidenceClass: "SIMULATION_ONLY" } };
      },
      async closeObligation({ obligation }) {
        calls.push({ phase: "close", obligationId: obligation.obligationId });
        return { status: "CLOSED", evidenceClass: "SIMULATION_ONLY" };
      },
      async release({ reservation }) {
        calls.push({ phase: "release", reservationId: reservation.reservationId });
        return { status: "RELEASED", evidenceClass: "SIMULATION_ONLY" };
      },
    };
  }
  function applyEffects(node, route) {
    for (const effect of node.input.worldStateAction.declaredEffects) state.set(effect.predicateId, effect.value);
    return { status: "SUCCEEDED", stateReceipt: `simulation:${node.input.worldStateAction.actionId}:${route}`,
      evidenceClass: "SIMULATION_ONLY" };
  }
  const primary = { ...lifecycle("primary"), async execute({ node, dependencyEvidence }) {
    const action = node.input.worldStateAction;
    calls.push({ phase: "execute", actionId: action.actionId, route: "PRIMARY" });
    assert.equal(action.declaredEffectsAreEvidence, false);
    if (PREPARATIONS.includes(action.actionId)) {
      assert.deepEqual(dependencyEvidence, []);
      activePreparations += 1;
      maximumPreparations = Math.max(maximumPreparations, activePreparations);
      preparationStarts.add(action.actionId);
      if (preparationStarts.size === 3) unblockPreparations();
      await barrier;
      activePreparations -= 1;
      if (action.actionId === "prepare_network") return { status: "FAILED", reason: "SIMULATED_PRIMARY_LINK_FAILURE" };
    } else {
      assert.equal(crewBusy, false, "resource-ordering edges must serialize the actual async installs");
      crewBusy = true;
      const evidence = new Map(dependencyEvidence.map(item => [item.nodeId, item]));
      for (const preparation of PREPARATIONS) {
        const dependency = evidence.get(compiled.nodeMapping[preparation]);
        assert.equal(dependency.witness.status, "SATISFIED");
        assert.equal(typeof dependency.witnessRecordedAt, "string");
      }
      const network = evidence.get(compiled.nodeMapping.prepare_network);
      assert.equal(network.primary.status, "FAILED");
      assert.equal(network.recovery.stateReceipt, "simulation:prepare_network:RECOVERY");
      for (const resourceDependency of action.resourceDependencies) {
        assert.equal(evidence.get(compiled.nodeMapping[resourceDependency]).witness.status, "SATISFIED");
      }
      await new Promise(resolve => setImmediate(resolve));
      crewBusy = false;
    }
    return applyEffects(node, "PRIMARY");
  } };
  const recovery = { ...lifecycle("recovery"), async execute({ node, dependencyEvidence, primaryFailure }) {
    calls.push({ phase: "execute", actionId: node.input.worldStateAction.actionId, route: "RECOVERY" });
    assert.equal(node.input.worldStateAction.actionId, "prepare_network");
    assert.deepEqual(dependencyEvidence, []);
    assert.equal(primaryFailure.reason, "SIMULATED_PRIMARY_LINK_FAILURE");
    return applyEffects(node, "RECOVERY");
  } };
  const witness = { ...lifecycle("witness"), async observe({ node, acceptance, effectResult }) {
    calls.push({ phase: "observe", nodeId: node.nodeId });
    if (node.nodeId === compiled.finalNodeId) {
      assert.equal(node.input.worldStateObservation.observationMode, "JOINT_CURRENT_STATE");
      assert.equal(node.input.worldStateObservation.completedActionsAloneSatisfyOutcome, false);
      assert.equal(effectResult.source, "SATISFIED_DEPENDENCIES");
      assert.deepEqual(effectResult.dependencyEvidence.map(item => item.nodeId), node.dependsOn);
      if (loseNetworkBeforeFinalObservation) state.set("network_ready", false);
    }
    // Read the separate simulated current state, never the planner's targetState
    // or a previous node's successful witness as evidence of today's state.
    const observed = acceptance.map(criterion => ({ predicateId: criterion.subject, value: state.get(criterion.subject) }));
    const satisfied = acceptance.every(criterion => state.get(criterion.subject) === criterion.expected.value);
    return { status: satisfied ? "SATISFIED" : "NOT_SATISFIED", observed, evidenceClass: "SIMULATION_ONLY" };
  } };
  return { calls, state, maximumPreparations: () => maximumPreparations,
    options: { directory, clock: () => new Date(time++).toISOString(),
      adapters: { simulated_primary: primary, simulated_recovery: recovery, simulated_witness: witness },
      discover: async ({ requirement }) => ({ adapterId: requirement.role === "INDEPENDENT_WITNESS"
        ? "simulated_witness" : `simulated_${requirement.role.toLowerCase()}` }),
      measureOperations: async () => ({ outsiderStaffTouchCount: 0, humanQueueCreated: false,
        source: "SIMULATED_OPERATIONS_COUNTER" }) } };
}

test("selected world-state plan executes three parallel branches, recovered handoff and serialized crew through the existing runtime", { timeout: 5000 }, async t => {
  const compiled = compilation("success"), { program } = compiled;
  const plan = compiled.planningResult.plans.find(candidate => candidate.planId === compiled.selectedPlanId);
  assert.equal(plan.totalCostMinor, "5");
  assert.equal(plan.makespanMs, 30);
  assert.deepEqual(plan.parallelWaves[0].actionIds, [...PREPARATIONS].sort());
  assert.deepEqual([compiled.capacityEstablished, compiled.outcomeEstablished, compiled.authorityMinted], [false, false, false]);
  assert.equal(compiled.externalEffectsPerformed, 0);
  assert.equal(program.requirements.length, 12);
  assert.equal(program.obligations.length, 12);
  assert.equal(program.nodes.length, 6);
  assert.equal(program.requirements.some(row => row.requirementId.startsWith("unselected_")), false);
  assert.equal(program.obligations.some(row => row.targetRequirementId.startsWith("unselected_")), false);
  const installs = plan.actionGraph.filter(action => INSTALLATIONS.includes(action.actionId));
  assert.equal(installs[1].startMs, installs[0].finishMs);
  assert.deepEqual(installs[1].resourceDependencies, [installs[0].actionId]);
  for (const action of plan.actionGraph) {
    const node = program.nodes.find(row => row.nodeId === compiled.nodeMapping[action.actionId]);
    assert.deepEqual(node.dependsOn, action.dependsOn.map(id => compiled.nodeMapping[id]));
  }
  const simulated = simulation(t, compiled);
  assert.equal(simulated.state.size, 0, "compilation cannot itself establish even simulated current state");
  const prepared = await createDurableOutcomeProgramOrchestratorV1(simulated.options).prepare(program);
  assert.equal(prepared.state, "RESOURCES_RESERVED_AWAITING_CONFIRMATION");
  assert.equal(simulated.calls.filter(call => call.phase === "execute").length, 0);
  assert.equal(prepared.userOutcomePromiseIssued, false);
  const result = await createDurableOutcomeProgramOrchestratorV1(simulated.options).confirmPrepared(program.programId, program.programHash);
  assert.equal(result.state, "SUCCEEDED");
  assert.equal(simulated.maximumPreparations(), 3);
  assert.equal(simulated.calls.filter(call => call.phase === "execute").length, 6);
  for (const phase of ["reserve", "close", "release"]) {
    assert.equal(simulated.calls.filter(call => call.phase === phase).length, 12);
  }
  const before = simulated.calls.length;
  const cold = await createDurableOutcomeProgramOrchestratorV1(simulated.options).resume(program.programId);
  assert.equal(cold.state, "SUCCEEDED");
  assert.equal(cold.journalHeadHash, result.journalHeadHash);
  assert.equal(simulated.calls.length, before, "terminal replay performs no adapter operation");
});

test("predicted goal satisfaction and completed branches cannot replace joint current-state acceptance", { timeout: 5000 }, async t => {
  const compiled = compilation("current_state_changed");
  assert.equal(compiled.planningResult.plans[0].targetState.every(row => row.value === true), true);
  const simulated = simulation(t, compiled, { loseNetworkBeforeFinalObservation: true });
  const result = await createDurableOutcomeProgramOrchestratorV1(simulated.options).run(compiled.program);
  assert.equal(result.state, "FAILED_CLOSED");
  assert.equal(simulated.calls.filter(call => call.phase === "execute").length, 6);
  assert.equal(simulated.calls.filter(call => call.phase === "observe").length, 6);
  assert.equal(simulated.state.get("a_installed"), true);
  assert.equal(simulated.state.get("b_installed"), true);
  assert.equal(simulated.state.get("network_ready"), false);
  assert.equal(simulated.calls.filter(call => call.phase === "release").length, 12);
});
