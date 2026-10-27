/* Simulated physical-state composition. No real-world action/evidence claim. */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { compileOutcomeProgramV1 } from "../src/outsider-outcome-program-v1.js";
import { createDurableOutcomeProgramOrchestratorV1 }
  from "../src/outsider-durable-outcome-program-orchestrator-v1.js";

const PREPARATIONS = ["prepare_power", "prepare_network", "prepare_space"];
const INSTALLATIONS = ["install_a", "install_b"];
const EFFECTS = [...PREPARATIONS, ...INSTALLATIONS];
const START = "2026-09-05T12:00:00.000Z";

function program(label) {
  const requirements = EFFECTS.flatMap(nodeId => ["PRIMARY", "RECOVERY"].map(role => ({
    requirementId: `${nodeId}_${role.toLowerCase()}`, role,
    capability: `SIMULATED_${nodeId.toUpperCase()}`,
    constraints: { evidenceClass: "SIMULATION_ONLY" },
    minimumReservationMs: 60000, dependsOnRequirementIds: [],
  })));
  requirements.push(...["qualified_crew", "work_window"].map(requirementId => ({
    requirementId, role: "PRIMARY", capability: "SIMULATED_SCARCE_RESOURCE",
    constraints: { capacity: 1, evidenceClass: "SIMULATION_ONLY" },
    minimumReservationMs: 60000, dependsOnRequirementIds: [],
  })));
  requirements.push({ requirementId: "independent_acceptance", role: "INDEPENDENT_WITNESS",
    capability: "SIMULATED_STATE_ACCEPTANCE", constraints: { evidenceClass: "SIMULATION_ONLY" },
    minimumReservationMs: 60000,
    dependsOnRequirementIds: requirements.map(requirement => requirement.requirementId),
  });
  const nodes = EFFECTS.map(nodeId => ({
    nodeId, kind: "EFFECT",
    dependsOn: PREPARATIONS.includes(nodeId) ? []
      : nodeId === "install_a" ? PREPARATIONS : [...PREPARATIONS, "install_a"],
    primaryRequirementId: `${nodeId}_primary`,
    recoveryRequirementId: `${nodeId}_recovery`, witnessRequirementId: "independent_acceptance",
    input: { worldStateAction: nodeId,
      resourceClaims: INSTALLATIONS.includes(nodeId)
        ? [{ resourceId: "qualified_crew", amount: 1 }, { resourceId: "work_window", amount: 1 }]
        : [],
      plannedStartMs: nodeId === "install_b" ? 200 : INSTALLATIONS.includes(nodeId) ? 100 : 0,
      plannedEndMs: nodeId === "install_b" ? 300 : INSTALLATIONS.includes(nodeId) ? 200 : 100,
    }, acceptance: ["combined_ready"],
  }));
  nodes.push({ nodeId: "merged_acceptance", kind: "CHECKPOINT", dependsOn: INSTALLATIONS,
    primaryRequirementId: null, recoveryRequirementId: null,
    witnessRequirementId: "independent_acceptance", input: {}, acceptance: ["combined_ready"] });
  return compileOutcomeProgramV1({
    programId: `simulated_multi_resource_${label}`, orderId: `simulated_order_${label}`,
    createdAt: START, formationDeadline: "2026-09-05T12:10:00.000Z",
    completionDeadline: "2026-09-05T13:00:00.000Z", tenderHash: null,
    outcome: { statement: "SIMULATION ONLY: prepare power, network and space, then install two systems with one crew and merge independently observed acceptance.",
      acceptance: [{ criterionId: "combined_ready", comparator: "EQUALS", subject: "simulated combined state", expected: true }],
      budget: { currency: "USD", maximumAmountMinor: "0" } },
    requirements, nodes,
    obligations: requirements.map(requirement => ({
      obligationId: `close_${requirement.requirementId}`, trigger: "ALWAYS",
      targetRequirementId: requirement.requirementId, nodeId: null,
      action: "RELEASE_SIMULATED_RESOURCE", input: {}, deadline: "2026-09-05T13:10:00.000Z",
    })),
    zeroInternalOps: { staffTouchLimit: 0, humanQueueFallback: false },
  });
}

function fixture(t, { terminalNetworkFailure = false, pauseMergedOnce = false } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-multi-resource-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const calls = [], started = new Set(), completed = new Map(), claimed = new Set();
  let allPreparationsStarted;
  const parallelBarrier = new Promise(resolve => { allPreparationsStarted = resolve; });
  let crewBusy = false, maximumConcurrentPreparations = 0, currentPreparations = 0;
  let mergedObservations = 0, clockMs = Date.parse(START);
  const clock = () => new Date(clockMs++).toISOString();
  function lifecycle(role) {
    return {
      adapterId: `simulated_${role}`, providerRef: `simulation-provider-${role}`,
      async reserve({ requirement, dependencyReservations }) {
        calls.push({ phase: "reserve", role, requirementId: requirement.requirementId });
        if (requirement.requirementId === "independent_acceptance") {
          assert.equal(Object.keys(dependencyReservations).length, 12);
          assert.equal(dependencyReservations.qualified_crew.reservationId, "simulated:qualified_crew");
          assert.equal(dependencyReservations.work_window.reservationId, "simulated:work_window");
        }
        claimed.add(requirement.requirementId);
        return { status: "RESERVED", reservationId: `simulated:${requirement.requirementId}`,
          validUntil: "2026-09-05T13:15:00.000Z",
          providerReceipt: { evidenceClass: "SIMULATION_ONLY" }, adapterState: { simulation: true } };
      },
      async closeObligation({ obligation }) {
        calls.push({ phase: "close", obligationId: obligation.obligationId });
        return { status: "CLOSED", receipt: "simulation-only-closure" };
      },
      async release({ reservation }) {
        calls.push({ phase: "release", reservationId: reservation.reservationId });
        return { status: "RELEASED", receipt: "simulation-only-release" };
      },
    };
  }
  const primary = { ...lifecycle("primary"), async execute({ node, dependencyEvidence }) {
    calls.push({ phase: "execute", nodeId: node.nodeId, route: "PRIMARY" });
    if (PREPARATIONS.includes(node.nodeId)) {
      assert.deepEqual(dependencyEvidence, []);
      currentPreparations += 1;
      maximumConcurrentPreparations = Math.max(maximumConcurrentPreparations, currentPreparations);
      started.add(node.nodeId);
      if (started.size === 3) allPreparationsStarted();
      await parallelBarrier;
      currentPreparations -= 1;
      if (node.nodeId === "prepare_network") return { status: "FAILED", reason: "SIMULATED_LINK_FAILURE" };
      const result = { status: "SUCCEEDED", stateReceipt: `${node.nodeId}:ready`, evidenceClass: "SIMULATION_ONLY" };
      completed.set(node.nodeId, result); return result;
    }
    assert.equal(claimed.has("qualified_crew") && claimed.has("work_window"), true);
    assert.equal(crewBusy, false, "the planner's ordering edge must prevent crew overlap");
    crewBusy = true;
    const evidence = new Map(dependencyEvidence.map(item => [item.nodeId, item]));
    for (const preparation of PREPARATIONS) {
      assert.equal(evidence.get(preparation).witness.status, "SATISFIED");
      assert.equal(typeof evidence.get(preparation).witnessRecordedAt, "string");
    }
    const network = evidence.get("prepare_network");
    assert.equal(network.primary.status, "FAILED");
    assert.equal(network.recovery.status, "SUCCEEDED");
    assert.equal(network.recovery.stateReceipt, "network:backup-link-ready");
    assert.equal(typeof network.recoveryEffectRecordedAt, "string");
    if (node.nodeId === "install_b") assert.equal(evidence.get("install_a").witness.status, "SATISFIED");
    await new Promise(resolve => setImmediate(resolve));
    crewBusy = false;
    const result = { status: "SUCCEEDED", stateReceipt: `${node.nodeId}:connected`,
      usedNetworkReceipt: network.recovery.stateReceipt, evidenceClass: "SIMULATION_ONLY" };
    completed.set(node.nodeId, result); return result;
  } };
  const recovery = { ...lifecycle("recovery"), async execute({ node, primaryFailure, dependencyEvidence }) {
    calls.push({ phase: "execute", nodeId: node.nodeId, route: "RECOVERY" });
    assert.equal(node.nodeId, "prepare_network");
    assert.deepEqual(dependencyEvidence, []);
    assert.equal(primaryFailure.reason, "SIMULATED_LINK_FAILURE");
    if (terminalNetworkFailure) return { status: "FAILED", reason: "SIMULATED_BACKUP_LINK_FAILURE" };
    const result = { status: "SUCCEEDED", stateReceipt: "network:backup-link-ready", evidenceClass: "SIMULATION_ONLY" };
    completed.set(node.nodeId, result); return result;
  } };
  const witness = { ...lifecycle("witness"), async observe({ node, effectResult }) {
    calls.push({ phase: "observe", nodeId: node.nodeId });
    if (node.nodeId === "merged_acceptance") {
      assert.deepEqual(effectResult.dependencyEvidence.map(item => item.nodeId), INSTALLATIONS);
      for (const evidence of effectResult.dependencyEvidence) {
        assert.equal(evidence.primary.usedNetworkReceipt, "network:backup-link-ready");
        assert.equal(evidence.witness.status, "SATISFIED");
      }
      mergedObservations += 1;
      if (pauseMergedOnce && mergedObservations === 1) return { status: "INCONCLUSIVE",
        reason: "SIMULATED_ACCEPTANCE_WINDOW_OPEN", retryAfter: "2026-09-05T12:01:00.000Z" };
    } else assert.equal(completed.has(node.nodeId), true);
    return { status: "SATISFIED", evidenceClass: "SIMULATION_ONLY", observationId: `simulation:${node.nodeId}` };
  } };
  const adapters = { simulated_primary: primary, simulated_recovery: recovery, simulated_witness: witness };
  const options = { directory, adapters, clock,
    discover: async ({ requirement }) => ({ adapterId: requirement.role === "INDEPENDENT_WITNESS"
      ? "simulated_witness" : `simulated_${requirement.role.toLowerCase()}` }),
    measureOperations: async () => ({ outsiderStaffTouchCount: 0, humanQueueCreated: false,
      source: "SIMULATED_EXPLICIT_OPERATIONS_COUNTER" }) };
  return { options, calls, maximumConcurrentPreparations: () => maximumConcurrentPreparations,
    advance: () => { clockMs = Date.parse("2026-09-05T12:02:00.000Z"); } };
}

test("simulated multibranch state handoff runs preparations concurrently, recovers network and serializes a shared crew", { timeout: 4000 }, async t => {
  const state = fixture(t), selected = program("success");
  const runtime = createDurableOutcomeProgramOrchestratorV1(state.options);
  const result = await runtime.run(selected);
  assert.equal(result.state, "SUCCEEDED");
  assert.equal(state.maximumConcurrentPreparations(), 3);
  assert.equal(state.calls.filter(x => x.phase === "execute").length, 6);
  assert.equal(state.calls.filter(x => x.phase === "close").length, 13);
  assert.equal(state.calls.filter(x => x.phase === "release").length, 13);
  const count = state.calls.length;
  assert.equal((await createDurableOutcomeProgramOrchestratorV1(state.options)
    .resume(selected.programId)).journalHeadHash, result.journalHeadHash);
  assert.equal(state.calls.length, count, "terminal cold replay must issue no adapter call");
});

test("merged acceptance resumes cold without repeating any fulfilled branch or recovery effect", { timeout: 4000 }, async t => {
  const state = fixture(t, { pauseMergedOnce: true }), selected = program("resume");
  const first = await createDurableOutcomeProgramOrchestratorV1(state.options).run(selected);
  assert.equal(first.state, "PAUSED_RETRYABLE");
  assert.equal(first.retry.reason, "SIMULATED_ACCEPTANCE_WINDOW_OPEN");
  const before = state.calls.filter(x => ["execute", "reserve"].includes(x.phase)).length;
  state.advance();
  const resumed = await createDurableOutcomeProgramOrchestratorV1(state.options).resume(selected.programId);
  assert.equal(resumed.state, "SUCCEEDED");
  assert.equal(state.calls.filter(x => ["execute", "reserve"].includes(x.phase)).length, before);
  assert.equal(state.calls.filter(x => x.phase === "observe" && x.nodeId === "merged_acceptance").length, 2);
});

test("a terminal failed preparation prevents both installations and merged acceptance, then closes the resource network", { timeout: 4000 }, async t => {
  const state = fixture(t, { terminalNetworkFailure: true }), selected = program("failed");
  const result = await createDurableOutcomeProgramOrchestratorV1(state.options).run(selected);
  assert.equal(result.state, "FAILED_CLOSED");
  assert.equal(state.calls.some(x => ["install_a", "install_b", "merged_acceptance"].includes(x.nodeId)), false);
  assert.equal(state.calls.filter(x => x.phase === "close").length, 13);
  assert.equal(state.calls.filter(x => x.phase === "release").length, 13);
});
