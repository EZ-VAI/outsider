/* Pure assessment of dispatch-window changes on one existing demand DAG.
 * Dispatch bounds are not durations or promised completion times. Accepted
 * effects remain facts; external authority and live grants stay with the
 * original store, kernel and adapters. No provider is called here. */
import { canonicalizeStrict } from './canonical.js';
import { validateOpenResourceDemand, OPEN_RESOURCE_DEMAND_SCHEMA } from './outsider-open-resource-demand-graph.js';
import { normalizeExecutionWindows } from './outsider-execution-windows.js';
import { normalizeJointStateAcceptance, jointStateRequirementIds } from './outsider-joint-state-acceptance.js';

const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const fail = () => { throw Object.assign(new Error('EXECUTION_PLAN_INPUT_INVALID'), { code: 'EXECUTION_PLAN_INPUT_INVALID' }); };
const iso = value => value === null ? null : new Date(value).toISOString();
function sourceTime(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) fail();
  return Date.parse(value);
}

// Both assessment contracts use the same dependency traversal and earliest
// possible dispatch bounds. Provider completion terms are upper bounds only.
function assessDependencyGraph(graph, assessRequirement) {
  const demands = new Map(graph.requirements.map(row => [row.id, row])), summaries = new Map();
  function visit(id) {
    if (summaries.has(id)) return summaries.get(id);
    const demand = demands.get(id);
    const dependencies = [...new Set(demand.dependsOn)].map(visit);
    const row = assessRequirement(demand, dependencies);
    summaries.set(id, row);
    return row;
  }
  graph.requirements.forEach(row => visit(row.id));
  return summaries;
}
function dependencyCompletionUpperBound(dependencies) {
  return dependencies.length && dependencies.every(row => row.completionBound !== null)
    ? Math.max(...dependencies.map(row => row.completionBound)) : null;
}
function dispatchBounds(dependencies, window, now, deadline) {
  const notBefore = window ? Date.parse(window.notBefore) : now;
  const bound = Math.max(now, notBefore, ...dependencies.map(row => row.completionLowerBound));
  const declaredLatest = window?.latestStartAt ? Date.parse(window.latestStartAt) : null;
  return { notBefore, bound, declaredLatest, latest: Math.min(deadline - 1, declaredLatest ?? deadline - 1) };
}

export function assessRemainingExecutionPlan({ graph, parts, executionWindows, completionDeadline, observedAt, executionFacts }) {
  try { canonicalizeStrict({ graph, parts, executionWindows, completionDeadline, observedAt, executionFacts }); } catch { fail(); }
  if (!validateOpenResourceDemand(graph) || !Array.isArray(parts) || !object(executionWindows) || !object(executionFacts)
    || !instant(completionDeadline) || !instant(observedAt)) fail();
  const demands = new Map(graph.requirements.map(row => [row.id, row]));
  if (parts.length !== demands.size || new Set(parts.map(part => part?.id)).size !== demands.size
    || parts.some(part => !object(part) || !demands.has(part.id))
    || Object.keys(executionFacts).length !== demands.size || Object.keys(executionFacts).some(id => !demands.has(id))) fail();
  const now = Date.parse(observedAt), deadline = Date.parse(completionDeadline);
  for (const fact of Object.values(executionFacts)) {
    if (!object(fact) || !['UNSTARTED', 'STARTED', 'ACCEPTED'].includes(fact.state)
      || Object.keys(fact).some(key => !['state', 'acceptedAt'].includes(key))
      || (fact.state === 'ACCEPTED' ? !instant(fact.acceptedAt) || Date.parse(fact.acceptedAt) > now
        : Object.hasOwn(fact, 'acceptedAt'))) fail();
  }
  let windows;
  try { windows = Object.keys(executionWindows).length ? normalizeExecutionWindows(executionWindows,
    { requirementIds: [...demands.keys()] }) : {}; } catch { fail(); }
  const partById = new Map(parts.map(part => [part.id, part])), conflicts = [], timingGaps = [];
  const gap = (requirementId, code, dependencyId) => timingGaps.push({ requirementId, code, ...(dependencyId ? { dependencyId } : {}) });
  const conflict = (requirementId, code, detail = {}) => conflicts.push({ requirementId, code, ...detail });

  const summaries = assessDependencyGraph(graph, (demand, dependencies) => {
    const id = demand.id, part = partById.get(id), fact = executionFacts[id], window = windows[id] ?? null;
    const dependencyCompletionBy = dependencyCompletionUpperBound(dependencies);
    if (fact.state === 'ACCEPTED') {
      const acceptedAt = Date.parse(fact.acceptedAt);
      const row = { requirementId: id, state: fact.state, acceptedAt: fact.acceptedAt,
        executionWindow: window, dispatchNotBeforeBound: null, latestStartAt: window?.latestStartAt ?? null,
        dependencyCompletionBy: iso(dependencyCompletionBy), providerCompletionBy: null, timingTermsIncomplete: false,
        completionLowerBound: acceptedAt, completionBound: acceptedAt };
      return row;
    }
    const providerCompletionBy = sourceTime(part.formationFeasibility?.providerCompletionBound);
    const gapStart = timingGaps.length;
    if (providerCompletionBy === null) gap(id, 'PROVIDER_COMPLETION_BOUND_UNREPORTED');
    // A provider's completion report/bound does not bound independent result
    // acceptance. Keep this distinction even for a source that supplies terms.
    else gap(id, 'DEPENDENCY_ACCEPTANCE_COMPLETION_TIME_UNREPORTED');
    for (const dependency of dependencies) if (dependency.state !== 'ACCEPTED')
      gap(id, dependency.completionBound === null ? 'DEPENDENCY_COMPLETION_BOUND_UNREPORTED' : 'DEPENDENCY_ACCEPTANCE_NOT_YET_OBSERVED', dependency.requirementId);
    if (fact.state === 'STARTED') {
      gap(id, 'EXISTING_DISPATCH_OR_ACCEPTANCE_UNRESOLVED');
      if (providerCompletionBy !== null && providerCompletionBy < now) gap(id, 'PROVIDER_COMPLETION_BOUND_PASSED_WHILE_UNRESOLVED');
      const row = { requirementId: id, state: fact.state, executionWindow: window, dispatchNotBeforeBound: null,
        latestStartAt: window?.latestStartAt ?? null, dependencyCompletionBy: iso(dependencyCompletionBy),
        providerCompletionBy: iso(providerCompletionBy), timingTermsIncomplete: true,
        completionLowerBound: now, completionBound: providerCompletionBy !== null && providerCompletionBy >= now ? providerCompletionBy : null };
      return row;
    }
    const { notBefore, bound, declaredLatest, latest: dispatchLatest } = dispatchBounds(dependencies, window, now, deadline);
    // The original order deadline is exclusive. latestStartAt itself remains
    // inclusive, matching callNodeRoute in the existing execution kernel.
    let latest = dispatchLatest;
    if (window && (notBefore >= deadline || declaredLatest !== null && declaredLatest >= deadline))
      conflict(id, 'WINDOW_OUTSIDE_ORIGINAL_DEADLINE');
    if (bound >= deadline) conflict(id, 'DISPATCH_BOUND_REACHES_ORIGINAL_DEADLINE');
    if (declaredLatest !== null && now > declaredLatest) conflict(id, 'LATEST_START_ALREADY_PASSED');
    if (declaredLatest !== null && bound > declaredLatest && now <= declaredLatest) {
      const delayed = dependencies.find(row => row.completionLowerBound > declaredLatest);
      conflict(id, 'DEPENDENCY_START_WINDOW_CONFLICT', delayed ? { dependencyId: delayed.requirementId } : {});
    }
    const resourceExpiresAt = sourceTime(part.resource?.expiresAt);
    if (resourceExpiresAt !== null) {
      latest = Math.min(latest, resourceExpiresAt - 1);
      if (resourceExpiresAt < deadline) conflict(id, 'RESOURCE_AUTHORIZATION_DOES_NOT_COVER_ORIGINAL_DEADLINE');
      if (bound >= resourceExpiresAt) conflict(id, 'RESOURCE_AUTHORIZATION_NOT_VALID_AT_DISPATCH');
    } else if (part.category === 'AGENT_TASK_EXECUTION') gap(id, 'RESOURCE_AUTHORIZATION_EXPIRY_UNREPORTED');
    for (const [role, quote] of Object.entries(part.quotes ?? {})) {
      const sourceLatest = sourceTime(quote.latestStartAt);
      if (sourceLatest === null) continue;
      latest = Math.min(latest, sourceLatest);
      if (bound > sourceLatest) conflict(id, 'FROZEN_SOURCE_START_WINDOW_CONFLICT', { role });
    }
    if (providerCompletionBy !== null && bound > providerCompletionBy) conflict(id, 'SOURCE_COMPLETION_BOUND_BEFORE_DISPATCH');
    if (providerCompletionBy !== null && providerCompletionBy > deadline) gap(id, 'PROVIDER_COMPLETION_BOUND_NOT_WITHIN_ORIGINAL_DEADLINE');
    if (dependencyCompletionBy !== null && dependencyCompletionBy > latest)
      gap(id, 'DEPENDENCY_COMPLETION_BOUND_DOES_NOT_COVER_START_WINDOW');
    const row = { requirementId: id, state: fact.state, executionWindow: window, dispatchNotBeforeBound: iso(bound),
      latestStartAt: iso(latest), dependencyCompletionBy: iso(dependencyCompletionBy),
      providerCompletionBy: iso(providerCompletionBy), timingTermsIncomplete: timingGaps.length > gapStart,
      completionLowerBound: bound, completionBound: providerCompletionBy !== null && providerCompletionBy >= bound ? providerCompletionBy : null };
    return row;
  });
  return { schema: 'outsider/remaining-execution-plan-assessment/v1', observedAt, completionDeadline,
    scope: 'UNSTARTED_A2A_DISPATCH_WINDOWS_ONLY', state: conflicts.length ? 'CONFLICT' : 'START_CONSTRAINTS_COMPATIBLE',
    acceptable: conflicts.length === 0, timingTermsIncomplete: timingGaps.length > 0,
    wholeOutcomeTimingProven: false, businessFeasibilityEstablished: false,
    requirements: graph.requirements.map(({ id }) => {
      const { completionLowerBound, completionBound, ...summary } = summaries.get(id); return summary;
    }), conflicts, timingGaps };
}

export const OUTCOME_PLAN_FEASIBILITY_SCHEMA = 'outsider/outcome-plan-feasibility/v1';
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MONEY = /^(0|[1-9][0-9]{0,30})$/u;
const CURRENCY = /^[A-Z]{3}$/u;
const sourceHash = value => typeof value === 'string' && value.length === 71 && HASH.test(value);
const currency = value => typeof value === 'string' && value.length === 3 && CURRENCY.test(value);
const money = value => typeof value === 'string' && value === value.trim() && MONEY.test(value);
const COST_BASES = ['SOURCE_QUOTED_MAXIMUM', 'FROZEN_EXECUTION_BUDGET', 'AUTHORIZED_EXECUTION_CEILING', 'EXISTING_ACCEPTED_ORDER_NO_NEW_CHARGE'];
const TERM_FIELDS = ['requirementId', 'cost', 'confirmationConstraints', 'dispatchConstraints', 'providerCompletionBy', 'acceptanceContract', 'jointEvidence'];
const exactFields = (value, required, optional = []) => object(value)
  && required.every(key => Object.hasOwn(value, key))
  && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const invalidOutcomePlan = () => {
  throw Object.assign(new TypeError('OUTCOME_PLAN_INPUT_INVALID'), { code: 'OUTCOME_PLAN_INPUT_INVALID' });
};

/** Assess adapter-projected, frozen terms before any requirement starts.
 * Each cost bounds the selected roles that its source actually prices; absent
 * or unquoted costs are not covered by this assessment's budget subtotal.
 * This function does not discover providers, price candidates, grant authority,
 * or infer a resource's semantics from its capability, category or vendor. */
export function assessOutcomePlanFeasibility(input) {
  if (!exactFields(input, ['graph', 'observedAt', 'completionDeadline', 'budget', 'terms'],
    ['executionWindows', 'jointAcceptance'])) invalidOutcomePlan();
  let normalized;
  try { normalized = JSON.parse(canonicalizeStrict(input)); } catch { invalidOutcomePlan(); }
  const { graph, observedAt, completionDeadline, budget, terms, executionWindows = {}, jointAcceptance } = normalized;
  if (!exactFields(graph, OPEN_RESOURCE_DEMAND_SCHEMA.required)
    || !validateOpenResourceDemand(graph)
    || graph.requirements.some(row => !exactFields(row, OPEN_RESOURCE_DEMAND_SCHEMA.properties.requirements.items.required, ['outcomeKind','condition']))
    || !instant(observedAt) || !instant(completionDeadline)
    || !exactFields(budget, ['currency', 'maximumAmountMinor'])
    || !currency(budget.currency) || !money(budget.maximumAmountMinor)
    || !Array.isArray(terms) || !object(executionWindows)) invalidOutcomePlan();
  const ids = graph.requirements.map(row => row.id), termById = new Map();
  if (terms.length !== ids.length) invalidOutcomePlan();
  for (const term of terms) {
    if (!exactFields(term, TERM_FIELDS) || !ids.includes(term.requirementId) || termById.has(term.requirementId)
      || !Array.isArray(term.dispatchConstraints) || term.dispatchConstraints.length > 64
      || !Array.isArray(term.confirmationConstraints) || term.confirmationConstraints.length > 64
      || term.providerCompletionBy !== null && !instant(term.providerCompletionBy)
      || term.acceptanceContract !== null && (typeof term.acceptanceContract !== 'string'
        || !term.acceptanceContract.trim() || term.acceptanceContract.length > 4096)
      || !['UNSUPPORTED', 'UNREPORTED', 'DECLARED_SOURCE_INTERVALS', 'DECLARED_CURRENT_POINT'].includes(term.jointEvidence)) invalidOutcomePlan();
    if (term.cost !== null && (!exactFields(term.cost, ['currency', 'maximumAmountMinor', 'sourceHash'], ['basis'])
      || !currency(term.cost.currency) || !money(term.cost.maximumAmountMinor) || !sourceHash(term.cost.sourceHash)
      || Object.hasOwn(term.cost, 'basis') && !COST_BASES.includes(term.cost.basis))) invalidOutcomePlan();
    for (const constraint of term.confirmationConstraints) {
      if (!exactFields(constraint, ['sourceHash', 'validUntil']) || !sourceHash(constraint.sourceHash)
        || !instant(constraint.validUntil)) invalidOutcomePlan();
    }
    for (const constraint of term.dispatchConstraints) {
      if (!exactFields(constraint, ['sourceHash'], ['latestStartAt', 'validUntil'])
        || !sourceHash(constraint.sourceHash)
        || Object.hasOwn(constraint, 'latestStartAt') && !instant(constraint.latestStartAt)
        || Object.hasOwn(constraint, 'validUntil') && !instant(constraint.validUntil)) invalidOutcomePlan();
    }
    termById.set(term.requirementId, term);
  }
  let windows, jointIds = [];
  try {
    windows = Object.keys(executionWindows).length ? normalizeExecutionWindows(executionWindows, { requirementIds: ids }) : {};
    if (jointAcceptance !== undefined) {
      normalizeJointStateAcceptance(jointAcceptance, { completionDeadline });
      jointIds = jointStateRequirementIds(jointAcceptance, ids);
    }
  } catch { invalidOutcomePlan(); }
  const now = Date.parse(observedAt), deadline = Date.parse(completionDeadline), conflicts = [], gaps = [];
  const conflict = (requirementId, code, detail = {}) => conflicts.push({ requirementId, code, ...detail });
  const gap = (requirementId, code, detail = {}) => gaps.push({ requirementId, code, ...detail });
  const pointOnlyJointIds = jointIds.filter(id => termById.get(id).jointEvidence === 'DECLARED_CURRENT_POINT');
  if (jointAcceptance?.timing.mode === 'CURRENT' && pointOnlyJointIds.length > 1)
    for (const id of pointOnlyJointIds) conflict(id, 'JOINT_CURRENT_POINTS_REQUIRE_COMMON_SOURCE');
  const unpricedRequirementIds = [], currencyConflictRequirementIds = [], costByCurrency = new Map();
  const summaries = assessDependencyGraph(graph, (demand, dependencies) => {
    const id = demand.id, term = termById.get(id), window = windows[id] ?? null;
    const dependencyCompletionBy = dependencyCompletionUpperBound(dependencies);
    const providerCompletionBy = term.providerCompletionBy === null ? null : Date.parse(term.providerCompletionBy);
    const { notBefore, bound, declaredLatest, latest: dispatchLatest } = dispatchBounds(dependencies, window, now, deadline);
    const timingGapStart = gaps.length;
    for (const constraint of term.confirmationConstraints) if (now >= Date.parse(constraint.validUntil))
      conflict(id, 'SOURCE_TERMS_EXPIRED_BEFORE_CONFIRMATION', { sourceHash: constraint.sourceHash });
    if (providerCompletionBy === null) gap(id, 'PROVIDER_COMPLETION_BOUND_UNREPORTED');
    else gap(id, 'RESULT_ACCEPTANCE_COMPLETION_TIME_UNREPORTED');
    for (const dependency of dependencies) gap(id, dependency.completionBound === null
      ? 'DEPENDENCY_COMPLETION_BOUND_UNREPORTED' : 'DEPENDENCY_ACCEPTANCE_NOT_YET_OBSERVED', { dependencyId: dependency.requirementId });
    let latest = dispatchLatest;
    if (window && (notBefore >= deadline || declaredLatest !== null && declaredLatest >= deadline))
      conflict(id, 'WINDOW_OUTSIDE_ORIGINAL_DEADLINE');
    if (bound >= deadline) conflict(id, 'DISPATCH_BOUND_REACHES_ORIGINAL_DEADLINE');
    if (declaredLatest !== null && now > declaredLatest) conflict(id, 'LATEST_START_ALREADY_PASSED');
    if (declaredLatest !== null && bound > declaredLatest && now <= declaredLatest) {
      const delayed = dependencies.find(row => row.completionLowerBound > declaredLatest);
      conflict(id, 'DEPENDENCY_START_WINDOW_CONFLICT', delayed ? { dependencyId: delayed.requirementId } : {});
    }
    for (const constraint of term.dispatchConstraints) {
      if (constraint.latestStartAt !== undefined) {
        const sourceLatest = Date.parse(constraint.latestStartAt);
        latest = Math.min(latest, sourceLatest);
        if (bound > sourceLatest) conflict(id, 'SOURCE_LATEST_START_CONFLICT', { sourceHash: constraint.sourceHash });
      }
      if (constraint.validUntil !== undefined) {
        const expires = Date.parse(constraint.validUntil);
        latest = Math.min(latest, expires - 1);
        if (bound >= expires) conflict(id, 'SOURCE_DISPATCH_VALIDITY_EXPIRED', { sourceHash: constraint.sourceHash });
      }
    }
    if (providerCompletionBy !== null && bound > providerCompletionBy) conflict(id, 'SOURCE_COMPLETION_BOUND_BEFORE_DISPATCH');
    if (providerCompletionBy !== null && providerCompletionBy >= deadline) gap(id, 'PROVIDER_COMPLETION_BOUND_NOT_WITHIN_ORIGINAL_DEADLINE');
    // Report each known late upper bound even if another predecessor's bound is
    // absent. Neither kind is a lower bound proving dispatch must be late.
    for (const dependency of dependencies) if (dependency.completionBound !== null && dependency.completionBound > latest)
      gap(id, 'DEPENDENCY_COMPLETION_BOUND_DOES_NOT_COVER_START_WINDOW', { dependencyId: dependency.requirementId });
    const timingTermsIncomplete = gaps.length > timingGapStart;
    if (term.cost === null) {
      unpricedRequirementIds.push(id); gap(id, 'COST_MAXIMUM_UNREPORTED');
    } else {
      costByCurrency.set(term.cost.currency, (costByCurrency.get(term.cost.currency) ?? 0n) + BigInt(term.cost.maximumAmountMinor));
      if (term.cost.currency !== budget.currency && term.cost.maximumAmountMinor !== '0') {
        currencyConflictRequirementIds.push(id);
        conflict(id, 'COST_CURRENCY_CONFLICT', { sourceHash: term.cost.sourceHash });
      }
    }
    if (term.acceptanceContract === null) gap(id, 'ACCEPTANCE_CONTRACT_UNREPORTED');
    if (jointIds.includes(id)) {
      if (term.jointEvidence === 'UNSUPPORTED') conflict(id, 'JOINT_EVIDENCE_UNSUPPORTED');
      else if (term.jointEvidence === 'DECLARED_CURRENT_POINT' && jointAcceptance.timing.mode !== 'CURRENT')
        conflict(id, 'JOINT_EVIDENCE_TIMING_UNSUPPORTED');
      else if (term.jointEvidence === 'UNREPORTED') gap(id, 'JOINT_EVIDENCE_SUPPORT_UNREPORTED');
    }
    return { requirementId: id, state: 'UNSTARTED', executionWindow: window,
      dispatchNotBeforeBound: iso(bound), latestStartAt: iso(latest),
      dependencyCompletionBy: iso(dependencyCompletionBy), providerCompletionBy: term.providerCompletionBy,
      acceptanceContract: term.acceptanceContract, jointEvidence: term.jointEvidence,
      cost: term.cost, confirmationConstraints: term.confirmationConstraints,
      dispatchConstraints: term.dispatchConstraints, timingTermsIncomplete,
      completionLowerBound: bound, completionBound: providerCompletionBy !== null && providerCompletionBy >= bound ? providerCompletionBy : null };
  });
  // A foreign-currency amount remains a conflict, never an implicit conversion.
  // The comparable subtotal can also exceed the budget while costs are missing.
  const knownCost = costByCurrency.get(budget.currency) ?? 0n;
  const exceedsMaximum = knownCost > BigInt(budget.maximumAmountMinor);
  if (exceedsMaximum) conflict(null, 'KNOWN_COST_MAXIMUM_EXCEEDS_BUDGET');
  const inGraphOrder = values => ids.filter(id => values.includes(id));
  return { schema: OUTCOME_PLAN_FEASIBILITY_SCHEMA, observedAt, completionDeadline,
    acceptable: conflicts.length === 0, state: conflicts.length ? 'CONFLICT' : 'KNOWN_CONSTRAINTS_COMPATIBLE',
    requirements: graph.requirements.map(({ id }) => {
      const { completionLowerBound, completionBound, ...summary } = summaries.get(id); return summary;
    }), conflicts, gaps,
    budget: { scope: 'BOUND_EXECUTION_CEILINGS_ONLY', unquotedCostsIncluded: false, previouslyIncurredCostsIncluded: false,
      comparisonBasis: 'PROJECTED_AUTHORIZED_OR_QUOTED_CEILINGS',
      currency: budget.currency, maximumAmountMinor: budget.maximumAmountMinor,
      knownCostMaximumMinor: knownCost.toString(),
      knownCostMaximumByCurrency: Object.fromEntries([...costByCurrency].sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amount]) => [currency, amount.toString()])),
      unpricedRequirementIds: inGraphOrder(unpricedRequirementIds),
      currencyConflictRequirementIds: inGraphOrder(currencyConflictRequirementIds),
      exceedsMaximum, allCostsKnown: unpricedRequirementIds.length === 0 },
    wholeOutcomeTimingProven: false, businessFeasibilityEstablished: false,
    capacityReserved: false, resultPromiseIssued: false };
}
