import assert from "node:assert/strict";
import test from "node:test";
import { planWorldStateResources } from "../src/outsider-world-state-resource-planner.js";

const fact = (predicateId, value = true) => ({ predicateId, valueType: typeof value, value });
const condition = (predicateId, value = true) => ({ ...fact(predicateId, value), operator: "EQ" });
const action = (actionId, effects, options = {}) => ({ actionId, capability: `capability.${actionId}`,
  preconditions: [], effects: effects.map(id => fact(id)), durationMs: 10,
  costMinor: "1", resourceClaims: [], ...options });
const resource = (resourceId, resourceType, capacityUnits = 1) => ({ resourceId, resourceType, capacityUnits });
const claim = resourceId => ({ resourceId, units: 1 });
function fixture() {
  return { initialState: [], targetPredicates: [condition("ready")],
    resources: [resource("operator", "person"), resource("room", "space"),
      resource("instrument", "equipment"), resource("uplink", "network")],
    actions: [action("prepare_space", ["space_ready"], { resourceClaims: [claim("operator"), claim("room")] }),
      action("connect_network", ["network_ready"], { resourceClaims: [claim("uplink")], durationMs: 7 }),
      action("calibrate", ["ready"], { preconditions: [condition("space_ready"), condition("network_ready")],
        resourceClaims: [claim("operator"), claim("instrument")], durationMs: 4 })],
    budget: { currency: "USD", maximumAmountMinor: "3" }, deadlineMs: 14 };
}

test("mixed resource plans preserve parallel prerequisites and compile-ready causal/resource DAG edges", () => {
  const result = planWorldStateResources(fixture());
  assert.equal(result.status, "FEASIBLE");
  assert.equal(result.search.complete, true);
  const plan = result.plans[0];
  assert.equal(plan.totalCostMinor, "3");
  assert.equal(plan.makespanMs, 14);
  assert.equal(plan.criticalPathMs, 14);
  assert.deepEqual(plan.criticalPathActionIds, ["prepare_space", "calibrate"]);
  assert.deepEqual(plan.parallelWaves[0], { startMs: 0, actionIds: ["connect_network", "prepare_space"] });
  const node = plan.actionGraph.find(row => row.actionId === "calibrate");
  assert.deepEqual(node.dependsOn, ["connect_network", "prepare_space"]);
  assert.deepEqual(node.resourceDependencies, ["prepare_space"]);
  assert.equal(result.boundary.actualOutcomeEstablished, false);
  assert.deepEqual(planWorldStateResources(result.planningInput), result);
});

test("scarce capacities impose actual dependency edges rather than only estimated start times", () => {
  const input = { ...fixture(), targetPredicates: [condition("left"), condition("right")],
    resources: [resource("shared", "equipment")],
    actions: [action("left", ["left"], { resourceClaims: [claim("shared")] }),
      action("right", ["right"], { resourceClaims: [claim("shared")] })], deadlineMs: 20 };
  const serial = planWorldStateResources(input).plans[0];
  assert.equal(serial.makespanMs, 20);
  assert.deepEqual(serial.actionGraph[1].resourceDependencies, [serial.actionGraph[0].actionId]);
  assert.equal(planWorldStateResources({ ...input, deadlineMs: 19 }).status, "INFEASIBLE");
  const parallel = planWorldStateResources({ ...input, resources: [resource("shared", "equipment", 2)] }).plans[0];
  assert.equal(parallel.makespanMs, 10);
  assert.equal(parallel.actionGraph.every(row => row.dependsOn.length === 0), true);
});

test("a later predicate overwrite waits for earlier readers even when physical resources differ", () => {
  const input = { ...fixture(), initialState: [fact("powered")],
    targetPredicates: [condition("measured"), condition("powered", false)], resources: [],
    actions: [action("measure", ["measured"], { preconditions: [condition("powered")] }),
      action("power_off", [], { effects: [fact("powered", false)], durationMs: 1 })], deadlineMs: 20 };
  const result = planWorldStateResources(input);
  assert.equal(result.plans.length, 1);
  assert.deepEqual(result.plans[0].actionGraph[1].causalDependencies, ["measure"]);
  assert.equal(result.plans[0].makespanMs, 11);
});

test("exact large budgets and explicit bounded-search incompleteness remain distinct", () => {
  const cost = "9007199254740993";
  const input = { ...fixture(), actions: [action("direct", ["ready"], { costMinor: cost })],
    budget: { currency: "USD", maximumAmountMinor: cost } };
  assert.equal(planWorldStateResources(input).plans[0].totalCostMinor, cost);
  assert.equal(planWorldStateResources({ ...input,
    budget: { currency: "USD", maximumAmountMinor: "9007199254740992" } }).status, "INFEASIBLE");
  const limited = planWorldStateResources({ ...input, searchLimits: { maxExpansions: 1 } });
  assert.equal(limited.status, "INCOMPLETE");
  assert.deepEqual(limited.search.truncatedBy, ["MAX_EXPANSIONS"]);
  assert.equal(limited.unmetRequirements[0].predicateId, "ready");
});

test("recovery alternatives spend remaining budget and do not claim independent capacity", () => {
  const input = { ...fixture(), initialState: [], resources: [resource("uplink", "network")],
    actions: [action("route_a", ["ready"], { costMinor: "4", resourceClaims: [claim("uplink")], failureDomainRefs: ["shared_grid"] }),
      action("route_b", ["ready"], { costMinor: "6", resourceClaims: [claim("uplink")], failureDomainRefs: ["shared_grid"] })],
    budget: { currency: "USD", maximumAmountMinor: "10" }, deadlineMs: 20,
    recoveryScenarios: [{ scenarioId: "primary_failed", initialState: [],
      unavailableActionIds: ["route_a"], elapsedMs: 10, sunkCostMinor: "4" },
    { scenarioId: "too_late", initialState: [], unavailableActionIds: ["route_a"],
      elapsedMs: 11, sunkCostMinor: "4" }] };
  const result = planWorldStateResources(input);
  assert.equal(result.plans.length, 2);
  assert.equal(result.alternativeRelationships[0].failureDomainRelationship, "DECLARED_SHARED");
  assert.deepEqual(result.alternativeRelationships[0].sharedResourceIds, ["uplink"]);
  assert.equal(result.alternativeRelationships[0].independentRecoveryProven, false);
  assert.equal(result.recoveryScenarios[0].status, "FEASIBLE");
  assert.equal(result.recoveryScenarios[0].remainingBudgetMinor, "6");
  assert.equal(result.recoveryScenarios[0].plans[0].totalCostMinor, "6");
  assert.equal(result.recoveryScenarios[1].status, "INFEASIBLE");
  assert.equal(result.recoveryScenarios[0].recoveryCapacityReserved, false);
});

test('source availability and finish bounds choose a costlier viable route and survive recovery-time rebasing', () => {
  const input = { ...fixture(), resources: [], actions: [
    action('cheap_late', ['ready'], { costMinor: '1', notBeforeMs: 12, latestFinishMs: 30 }),
    action('early', ['ready'], { costMinor: '2', notBeforeMs: 2, latestStartMs: 5, latestFinishMs: 12 }),
  ], recoveryScenarios: [{ scenarioId: 'at_three', initialState: [], unavailableActionIds: ['cheap_late'], elapsedMs: 3, sunkCostMinor: '0' },
    { scenarioId: 'too_late', initialState: [], unavailableActionIds: ['cheap_late'], elapsedMs: 6, sunkCostMinor: '0' }] };
  const result = planWorldStateResources(input);
  assert.equal(result.plans[0].actionIds[0], 'early');
  assert.equal(result.plans[0].actionGraph[0].startMs, 2);
  assert.equal(result.recoveryScenarios[0].status, 'INFEASIBLE', 'Starting at 3 cannot finish by the original absolute bound 12');
  assert.equal(result.recoveryScenarios[1].status, 'INFEASIBLE');
});

test('declared incompatible alternatives cannot enter one plan in either search order', () => {
  const input = { ...fixture(), resources: [], deadlineMs: 30,
    targetPredicates: [condition('left'), condition('right')], actions: [
      action('left', ['left'], { exclusiveWithActionIds: ['right'] }), action('right', ['right']),
      action('other_right', ['right'], { costMinor: '2' })] };
  const result = planWorldStateResources(input);
  assert.ok(result.plans.length);
  assert.equal(result.plans[0].totalCostMinor, '3');
  assert.ok(result.plans.every(plan => !(plan.actionIds.includes('left') && plan.actionIds.includes('right'))));
});
