/* Bounded planning over declared action instances. Execution belongs to the
 * existing OutcomeProgram runtime; this module predicts no observed truth. */
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

const SCHEMA = "outsider/world-state-resource-planning";
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const TYPES = new Set(["boolean", "number", "string"]);
export const ORDER_PLANNING_PRIORITIES = Object.freeze(['RELIABILITY','COST','TIME']);
export function normalizeOrderPlanningPreferences(value = ORDER_PLANNING_PRIORITIES) {
  if (!Array.isArray(value) || value.length !== 3 || new Set(value).size !== 3
    || value.some(key=>!ORDER_PLANNING_PRIORITIES.includes(key))) throw new TypeError('ORDER_PLANNING_PREFERENCES_INVALID');
  return [...value];
}
// Compare already feasible candidates. Unknown reliability cannot outrank
// another candidate; neither preference relaxes a deadline or spending limit.
export function compareOrderPlanningChoices(a,b,preferences) {
  for (const key of normalizeOrderPlanningPreferences(preferences)) {
    const [left,right] = key==='COST' ? [BigInt(a.costMinor),BigInt(b.costMinor)]
      : key==='TIME' ? [a.completionMs,b.completionMs] : [a.failureProbability,b.failureProbability];
    if (left==null || right==null) continue;
    if (left<right) return -1;
    if (left>right) return 1;
  }
  return 0;
}
export function orderPlanningSearchLimits({candidateCount,requirementCount,remainingTimeMs,computationBudget={}}) {
  const count=Math.max(1,candidateCount),needs=Math.max(1,requirementCount);
  const cap=(key,fallback,max)=>integer(computationBudget[key]??fallback,max,1);
  const maxExpansions=Math.min(cap('maxExpansions',10000,20000),
    Math.max(64,Math.ceil(count*Math.min(count,needs)*8)),Math.max(1,Math.floor(remainingTimeMs/10)));
  return {maxExpansions,maxActionsPerPlan:Math.min(64,needs),maxPlans:cap('maxPlans',4,16),
    maxFrontier:Math.min(cap('maxFrontier',5000,10000),Math.max(64,count*needs*4))};
}
const hash = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
const fail = code => { throw new TypeError(`OUTSIDER_WORLD_STATE_PLANNER_${code}`); };
const identifier = value => { if (!ID.test(value ?? "")) fail("IDENTIFIER_INVALID"); return value; };
const integer = (value, maximum, minimum = 0) => {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail("INTEGER_INVALID");
  return value;
};
const money = value => {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,30})$/u.test(value)) fail("MONEY_INVALID");
  return value;
};
const unique = (rows, key) => {
  if (new Set(rows.map(row => row[key])).size !== rows.length) fail("DUPLICATE_IDENTIFIER");
  return rows;
};
function predicate(input, condition = false) {
  const valueType = input.valueType;
  if (!TYPES.has(valueType) || typeof input.value !== valueType
    || (valueType === "number" && !Number.isFinite(input.value))) fail("PREDICATE_TYPE_INVALID");
  const result = { predicateId: identifier(input.predicateId), valueType, value: input.value };
  if (condition) {
    const operator = input.operator ?? "EQ";
    if (!["EQ", "GTE", "LTE"].includes(operator)
      || (operator !== "EQ" && valueType !== "number")) fail("COMPARATOR_INVALID");
    result.operator = operator;
  }
  return result;
}
const predicates = (rows, condition = false) => {
  if (!Array.isArray(rows) || rows.length > 256) fail("PREDICATES_INVALID");
  return rows.map(row => predicate(row, condition));
};
function normalize(input) {
  if (!Array.isArray(input.actions) || input.actions.length > 64
    || !Array.isArray(input.resources) || input.resources.length > 64) fail("INPUT_SIZE_INVALID");
  const resources = unique(input.resources.map(row => ({ resourceId: identifier(row.resourceId),
    resourceType: identifier(row.resourceType), capacityUnits: integer(row.capacityUnits, 64) })), "resourceId")
    .sort((a, b) => a.resourceId.localeCompare(b.resourceId));
  const actions = unique(input.actions.map(row => {
    const resourceClaims = unique((row.resourceClaims ?? []).map(claim => ({
      resourceId: identifier(claim.resourceId), units: integer(claim.units, 64, 1),
    })), "resourceId").sort((a, b) => a.resourceId.localeCompare(b.resourceId));
    if (typeof row.capability !== "string" || !row.capability.length || row.capability.length > 512) fail("CAPABILITY_INVALID");
    return { actionId: identifier(row.actionId), capability: row.capability,
      preconditions: predicates(row.preconditions ?? [], true),
      effects: unique(predicates(row.effects ?? []), "predicateId"),
      durationMs: integer(row.durationMs, 31_536_000_000, 1), costMinor: money(row.costMinor),
      ...Object.fromEntries(['notBeforeMs', 'latestStartMs', 'latestFinishMs']
        .filter(key => row[key] !== undefined).map(key => [key, integer(row[key], 31_536_000_000)])),
      ...(row.exclusiveWithActionIds === undefined ? {} : {
        exclusiveWithActionIds: [...new Set(row.exclusiveWithActionIds.map(identifier))].sort() }),
      resourceClaims, dependsOnActionIds: [...new Set((row.dependsOnActionIds ?? []).map(identifier))].sort(),
      failureDomainRefs: [...new Set((row.failureDomainRefs ?? []).map(identifier))].sort() };
  }), "actionId").sort((a, b) => a.actionId.localeCompare(b.actionId));
  const ids = new Set(actions.map(row => row.actionId));
  if (actions.some(row => row.dependsOnActionIds.some(id => !ids.has(id) || id === row.actionId))) {
    fail("ACTION_DEPENDENCY_INVALID");
  }
  if (actions.some(row => (row.exclusiveWithActionIds ?? []).some(id => !ids.has(id) || id === row.actionId)))
    fail('ACTION_EXCLUSION_INVALID');
  const budget = { currency: input.budget?.currency, maximumAmountMinor: money(input.budget?.maximumAmountMinor) };
  if (!/^[A-Z]{3}$/u.test(budget.currency ?? "")) fail("CURRENCY_INVALID");
  const searchLimits = { maxExpansions: integer(input.searchLimits?.maxExpansions ?? 2000, 20000, 1),
    maxActionsPerPlan: integer(input.searchLimits?.maxActionsPerPlan ?? 12, 64, 1),
    maxPlans: integer(input.searchLimits?.maxPlans ?? 4, 16, 1),
    maxFrontier: integer(input.searchLimits?.maxFrontier ?? 2500, 10000, 1) };
  const recoveryScenarios = unique((input.recoveryScenarios ?? []).map(row => ({
    scenarioId: identifier(row.scenarioId), initialState: unique(predicates(row.initialState), "predicateId"),
    unavailableActionIds: [...new Set((row.unavailableActionIds ?? []).map(identifier))].sort(),
    elapsedMs: integer(row.elapsedMs, 31_536_000_000), sunkCostMinor: money(row.sunkCostMinor),
  })), "scenarioId");
  if (recoveryScenarios.length > 8 || recoveryScenarios.some(row =>
    row.unavailableActionIds.some(id => !ids.has(id)))) fail("RECOVERY_SCENARIOS_INVALID");
  const normalized = { initialState: unique(predicates(input.initialState), "predicateId"),
    targetPredicates: predicates(input.targetPredicates, true), actions, resources, budget,
    deadlineMs: integer(input.deadlineMs, 31_536_000_000), searchLimits, recoveryScenarios,
    ...(input.planningPreferences===undefined?{}:{planningPreferences:normalizeOrderPlanningPreferences(input.planningPreferences)}) };
  const types = new Map();
  for (const row of [...normalized.initialState, ...normalized.targetPredicates,
    ...actions.flatMap(row => [...row.preconditions, ...row.effects]),
    ...recoveryScenarios.flatMap(row => row.initialState)]) {
    if (types.has(row.predicateId) && types.get(row.predicateId) !== row.valueType) fail("PREDICATE_TYPE_CONFLICT");
    types.set(row.predicateId, row.valueType);
  }
  if (!normalized.targetPredicates.length) fail("TARGET_REQUIRED");
  return normalized;
}
function satisfies(state, condition) {
  const fact = state.get(condition.predicateId);
  if (!fact || fact.valueType !== condition.valueType) return false;
  return condition.operator === "GTE" ? fact.value >= condition.value
    : condition.operator === "LTE" ? fact.value <= condition.value : fact.value === condition.value;
}
const unmet = (state, target) => target.filter(row => !satisfies(state, row));
function appendAction(current, action, input) {
  if (current.used.has(action.actionId)
    || (action.exclusiveWithActionIds ?? []).some(id => current.used.has(id))
    || input.actions.some(row => current.used.has(row.actionId) && row.exclusiveWithActionIds?.includes(action.actionId))
    || action.dependsOnActionIds.some(id => !current.used.has(id))
    || action.preconditions.some(row => !satisfies(current.state, row))) return null;
  const cost = current.cost + BigInt(action.costMinor);
  if (cost > BigInt(input.budget.maximumAmountMinor)) return null;
  const causal = new Set(action.dependsOnActionIds);
  for (const fact of [...action.preconditions, ...action.effects]) {
    if (current.writers.has(fact.predicateId)) causal.add(current.writers.get(fact.predicateId));
  }
  for (const fact of action.effects) {
    for (const reader of current.readers.get(fact.predicateId) ?? []) causal.add(reader);
  }
  const byId = new Map(current.graph.map(row => [row.actionId, row]));
  const resourceDependencies = new Set();
  const claims = [];
  for (const claim of action.resourceClaims) {
    const lanes = current.lanes.get(claim.resourceId);
    if (!lanes || lanes.length < claim.units) return null;
    const chosen = [...lanes].sort((a, b) => a.availableAt - b.availableAt || a.index - b.index)
      .slice(0, claim.units);
    for (const lane of chosen) if (lane.actionId !== null) resourceDependencies.add(lane.actionId);
    claims.push({ ...claim, laneIndexes: chosen.map(row => row.index).sort((a, b) => a - b) });
  }
  const dependsOn = [...new Set([...causal, ...resourceDependencies])].sort();
  const startMs = Math.max(0, action.notBeforeMs ?? 0, ...dependsOn.map(id => byId.get(id).finishMs));
  const finishMs = startMs + action.durationMs;
  if (finishMs > input.deadlineMs || startMs > (action.latestStartMs ?? Infinity)
    || finishMs > (action.latestFinishMs ?? Infinity)) return null;
  const node = { actionId: action.actionId, capability: action.capability, dependsOn,
    causalDependencies: [...causal].sort(), resourceDependencies: [...resourceDependencies].sort(),
    preconditions: action.preconditions, declaredEffects: action.effects,
    durationMs: action.durationMs, costMinor: action.costMinor, resourceClaims: claims, startMs, finishMs };
  const state = new Map(current.state), writers = new Map(current.writers);
  const readers = new Map([...current.readers].map(([id, values]) => [id, new Set(values)]));
  for (const fact of action.preconditions) {
    if (!readers.has(fact.predicateId)) readers.set(fact.predicateId, new Set());
    readers.get(fact.predicateId).add(action.actionId);
  }
  for (const fact of action.effects) {
    state.set(fact.predicateId, fact); writers.set(fact.predicateId, action.actionId);
    readers.set(fact.predicateId, new Set());
  }
  const lanes = new Map([...current.lanes].map(([id, values]) => [id, values.map(row => ({ ...row }))]));
  for (const claim of claims) for (const index of claim.laneIndexes) {
    lanes.get(claim.resourceId)[index] = { index, availableAt: finishMs, actionId: action.actionId };
  }
  return { state, writers, readers, lanes, cost, used: new Set([...current.used, action.actionId]),
    graph: [...current.graph, node], makespan: Math.max(current.makespan, finishMs) };
}
function planResult(current, input) {
  const graph = current.graph;
  const byId = new Map(graph.map(row => [row.actionId, row]));
  const critical = [];
  let last = [...graph].sort((a, b) => b.finishMs - a.finishMs || a.actionId.localeCompare(b.actionId))[0];
  while (last) {
    critical.unshift(last.actionId);
    last = last.dependsOn.map(id => byId.get(id))
      .sort((a, b) => b.finishMs - a.finishMs || a.actionId.localeCompare(b.actionId))[0];
  }
  const waves = new Map();
  for (const node of graph) {
    if (!waves.has(node.startMs)) waves.set(node.startMs, []);
    waves.get(node.startMs).push(node.actionId);
  }
  const body = { actionIds: graph.map(row => row.actionId), actionGraph: graph,
    parallelWaves: [...waves].sort(([a], [b]) => a - b)
      .map(([startMs, actionIds]) => ({ startMs, actionIds: actionIds.sort() })),
    makespanMs: current.makespan, criticalPathMs: current.makespan,
    criticalPathActionIds: critical, totalCostMinor: current.cost.toString(),
    targetState: [...current.state.values()].sort((a, b) => a.predicateId.localeCompare(b.predicateId)),
    failureDomainRefs: [...new Set(input.actions.filter(row => current.used.has(row.actionId))
      .flatMap(row => row.failureDomainRefs))].sort(), planningOnly: true };
  return { planId: hash("outsider/world-state-resource-plan", body), ...body };
}
const comparePlans = (a, b, preferences) => compareOrderPlanningChoices(
  {costMinor:a.totalCostMinor,completionMs:a.makespanMs}, {costMinor:b.totalCostMinor,completionMs:b.makespanMs},preferences)
  || a.actionGraph.length-b.actionGraph.length || a.planId.localeCompare(b.planId);
function search(input) {
  const initial = { state: new Map(input.initialState.map(row => [row.predicateId, row])),
    writers: new Map(), readers: new Map(), lanes: new Map(input.resources.map(row =>
      [row.resourceId, Array.from({ length: row.capacityUnits }, (_, index) =>
        ({ index, availableAt: 0, actionId: null }))])),
    cost: 0n, used: new Set(), graph: [], makespan: 0 };
  const frontier = [initial], seen = new Set(), plans = new Map(), truncated = new Set();
  let best = initial, expansions = 0;
  while (frontier.length && expansions < input.searchLimits.maxExpansions) {
    const current = frontier.shift(); expansions += 1;
    const missing = unmet(current.state, input.targetPredicates);
    if (missing.length < unmet(best.state, input.targetPredicates).length) best = current;
    if (!missing.length) {
      const plan = planResult(current, input); plans.set(plan.planId, plan); continue;
    }
    for (const action of input.actions) {
      const next = appendAction(current, action, input);
      if (next === null) continue;
      if (current.graph.length >= input.searchLimits.maxActionsPerPlan) {
        truncated.add("MAX_ACTIONS_PER_PLAN"); break;
      }
      const key = canonicalizeStrict({ state: [...next.state.values()].sort((a, b) =>
        a.predicateId.localeCompare(b.predicateId)),
      graph: [...next.graph].sort((a, b) => a.actionId.localeCompare(b.actionId)) });
      if (seen.has(key)) continue;
      if (frontier.length >= input.searchLimits.maxFrontier) { truncated.add("MAX_FRONTIER"); continue; }
      seen.add(key); frontier.push(next);
    }
  }
  if (frontier.length) truncated.add("MAX_EXPANSIONS");
  const selected = [...plans.values()].sort((a,b)=>comparePlans(a,b,input.planningPreferences)).slice(0, input.searchLimits.maxPlans);
  const complete = truncated.size === 0;
  return { status: selected.length ? "FEASIBLE" : complete ? "INFEASIBLE" : "INCOMPLETE",
    plans: selected,
    search: { complete, expansions, truncatedBy: [...truncated].sort(),
      scope: "DECLARED_ACTION_INSTANCES_ONCE", feasiblePlansFound: plans.size,
      returnedPlans: selected.length,
      globalOptimumWithinDeclaredModelProven: complete && selected.length > 0 },
    unmetRequirements: selected.length ? [] : unmet(best.state, input.targetPredicates).map(row => ({
      ...row, observedInPlanningState: best.state.get(row.predicateId) ?? null,
      candidateProducerActionIds: input.actions.filter(action => action.effects.some(effect =>
        effect.predicateId === row.predicateId)).map(action => action.actionId) })) };
}

export function planWorldStateResources(input) {
  const planningInput = normalize(input);
  const result = search(planningInput);
  const recoveryScenarios = planningInput.recoveryScenarios.map(scenario => {
    const remaining = BigInt(planningInput.budget.maximumAmountMinor) - BigInt(scenario.sunkCostMinor);
    const duration = planningInput.deadlineMs - scenario.elapsedMs;
    const available = planningInput.actions.filter(row => !scenario.unavailableActionIds.includes(row.actionId))
      .map(row => ({ ...row, ...Object.fromEntries(['notBeforeMs', 'latestStartMs', 'latestFinishMs']
        .filter(key => row[key] !== undefined).map(key => [key, key === 'notBeforeMs'
          ? Math.max(0, row[key] - scenario.elapsedMs) : row[key] - scenario.elapsedMs])) }));
    const recovery = remaining < 0n || duration < 0
      ? { status: "INFEASIBLE", plans: [], search: { complete: true, expansions: 0,
        truncatedBy: [], scope: "EXPLICIT_RECOVERY_SCENARIO" }, unmetRequirements: planningInput.targetPredicates }
      : search({ ...planningInput, initialState: scenario.initialState, actions: available,
        deadlineMs: duration, budget: { ...planningInput.budget, maximumAmountMinor: remaining.toString() } });
    return { scenarioId: scenario.scenarioId, ...recovery,
      elapsedMs: scenario.elapsedMs, sunkCostMinor: scenario.sunkCostMinor,
      remainingBudgetMinor: remaining < 0n ? "0" : remaining.toString(),
      remainingDeadlineMs: Math.max(0, duration),
      scenarioStateIsDeclaredNotObserved: true, recoveryCapacityReserved: false };
  });
  const primary = result.plans[0];
  const alternativeRelationships = result.plans.slice(1).map(plan => {
    const sharedActionIds = plan.actionIds.filter(id => primary.actionIds.includes(id));
    const sharedFailureDomainRefs = plan.failureDomainRefs.filter(id => primary.failureDomainRefs.includes(id));
    const primaryResources = new Set(primary.actionGraph.flatMap(row =>
      row.resourceClaims.map(claim => claim.resourceId)));
    const sharedResourceIds = [...new Set(plan.actionGraph.flatMap(row => row.resourceClaims
      .map(claim => claim.resourceId)))].filter(id => primaryResources.has(id)).sort();
    return { primaryPlanId: primary.planId, alternativePlanId: plan.planId, sharedActionIds,
      sharedResourceIds, sharedFailureDomainRefs, failureDomainRelationship: sharedFailureDomainRefs.length
        ? "DECLARED_SHARED" : !primary.failureDomainRefs.length || !plan.failureDomainRefs.length
          ? "UNKNOWN" : "DECLARED_NONOVERLAP_UNVERIFIED",
      executableSimultaneouslyProven: false, independentRecoveryProven: false };
  });
  const body = { schema: SCHEMA, planningInput, inputHash: hash(`${SCHEMA}/input`, planningInput),
    ...result, alternativeRelationships, recoveryScenarios,
    boundary: { stateBasis: "DECLARED_INITIAL_STATE_AND_PREDICTED_EFFECT_ASSIGNMENTS",
      durationsAreEstimates: true, resourcesAreDeclaredCapacities: true,
      actualOutcomeEstablished: false, authorityGranted: false, capacityReserved: false,
      paymentAuthorized: false, outcomeCommitted: false,
      executionRuntime: "EXISTING_OUTCOME_PROGRAM_RUNTIME" } };
  return { ...body, planningHash: hash(SCHEMA, body) };
}
