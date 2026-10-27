import test from 'node:test';
import assert from 'node:assert/strict';
import { assessOutcomePlanFeasibility as assess } from '../src/outsider-resource-graph-execution-plan.js';

const NOW = '2026-09-08T09:00:00.000Z', minute = 60000;
const at = milliseconds => new Date(Date.parse(NOW) + milliseconds).toISOString();
const DEADLINE = at(60 * minute), hash = digit => `sha256:${digit.repeat(64)}`;
const cost = (maximumAmountMinor, currency = 'USD', basis) => ({ currency, maximumAmountMinor,
  sourceHash: hash('1'), ...(basis === undefined ? {} : { basis }) });
const term = (requirementId, overrides = {}) => ({ requirementId, cost: cost('0'),
  confirmationConstraints: [], dispatchConstraints: [], providerCompletionBy: null,
  acceptanceContract: 'FIXTURE_CONFIRMED_CONDITION', jointEvidence: 'UNREPORTED', ...overrides });
const capabilities = ['A2A_AGENT_TASK_V1', 'RESOURCE_TIME_SLOT_HOLD', 'PUBLIC_JSON_ARTIFACT_V1'];
function inputFor(rows, executionWindows = {}) {
  return { graph: { summary: 'Fixture: assemble different kinds of resources in one original plan', missingFacts: [],
    requirements: rows.map(({ id, dependsOn = [] }, index) => ({ id, dependsOn, capability: capabilities[index % capabilities.length],
      outcome: `Fixture condition ${id}`, acceptance: ['The explicitly confirmed condition'],
      recoveryNeeds: ['Preserve the original result requirement'], resourceKinds: [`fixture-kind-${index}`],
      discoveryQueries: ['fixture only; do not call a provider'], candidateDocumentationUrls: [] })) },
    observedAt: NOW, completionDeadline: DEADLINE, budget: { currency: 'USD', maximumAmountMinor: '100' },
    executionWindows, terms: rows.map(({ id }) => term(id)) };
}
const row = (result, id) => result.requirements.find(value => value.requirementId === id);
const has = (values, id, code) => values.some(value => value.requirementId === id && value.code === code);
const setTerm = (input, id, overrides) => Object.assign(input.terms.find(value => value.requirementId === id), overrides);
const currentJoint = () => ({ schema: 'outsider/joint-state-acceptance/v1', timing: { mode: 'CURRENT' },
  maximumEvidenceAgeMs: minute, retryIntervalMs: 1000 });

test('one dependency calculation spans three capability families and ignores their labels when propagating bounds', () => {
  const input = inputFor([{ id: 'join', dependsOn: ['middle', 'parallel'] }, { id: 'parallel' },
    { id: 'middle', dependsOn: ['source'] }, { id: 'source' }], {
    source: { notBefore: at(30 * minute) }, parallel: { notBefore: at(5 * minute) },
    join: { notBefore: at(10 * minute), latestStartAt: at(20 * minute) },
  });
  const original = JSON.stringify(input), result = assess(input);
  assert.equal(new Set(input.graph.requirements.map(value => value.capability)).size, 3);
  assert.equal(result.acceptable, false); assert.equal(result.state, 'CONFLICT');
  assert.equal(row(result, 'middle').dispatchNotBeforeBound, at(30 * minute));
  assert.equal(row(result, 'join').dispatchNotBeforeBound, at(30 * minute));
  assert.equal(row(result, 'parallel').dispatchNotBeforeBound, at(5 * minute));
  assert.deepEqual(result.conflicts, [{ requirementId: 'join', code: 'DEPENDENCY_START_WINDOW_CONFLICT', dependencyId: 'middle' }]);
  assert.deepEqual(result.requirements.map(value => value.requirementId), ['join', 'parallel', 'middle', 'source']);
  const renamed = structuredClone(input);
  for (const requirement of renamed.graph.requirements) {
    requirement.capability = `unrelated_provider_protocol_${requirement.id}`;
    requirement.outcome = 'Another domain with the same projected constraints';
    requirement.resourceKinds = ['physical_or_digital_resource'];
  }
  assert.deepEqual(assess(renamed), result, 'no capability, domain or vendor controls the feasibility algorithm');
  assert.equal(JSON.stringify(input), original, 'assessment leaves original graph and frozen terms unchanged');
  result.requirements[0].cost.maximumAmountMinor = '999';
  assert.equal(input.terms[0].cost.maximumAmountMinor, '0', 'returned terms do not expose mutable input references');
});

test('latest-start bounds are inclusive while source expiry and the original deadline are exclusive', () => {
  const input = inputFor([{ id: 'boundary' }], { boundary: { notBefore: NOW, latestStartAt: NOW } });
  setTerm(input, 'boundary', { dispatchConstraints: [{ sourceHash: hash('2'), latestStartAt: NOW, validUntil: at(1) }] });
  let result = assess(input);
  assert.equal(result.acceptable, true); assert.equal(row(result, 'boundary').latestStartAt, NOW);
  input.terms[0].dispatchConstraints[0].validUntil = NOW;
  result = assess(input);
  assert.ok(has(result.conflicts, 'boundary', 'SOURCE_DISPATCH_VALIDITY_EXPIRED'));
  assert.equal(row(result, 'boundary').latestStartAt, at(-1));
  input.terms[0].dispatchConstraints = [{ sourceHash: hash('2'), latestStartAt: at(-1) }];
  assert.ok(has(assess(input).conflicts, 'boundary', 'SOURCE_LATEST_START_CONFLICT'));
  const finalMillisecond = inputFor([{ id: 'last' }], {
    last: { notBefore: at(60 * minute - 1), latestStartAt: at(60 * minute - 1) },
  });
  assert.equal(assess(finalMillisecond).acceptable, true);
  assert.equal(assess(finalMillisecond).wholeOutcomeTimingProven, false);
  finalMillisecond.executionWindows.last = { notBefore: DEADLINE };
  result = assess(finalMillisecond);
  assert.ok(has(result.conflicts, 'last', 'DISPATCH_BOUND_REACHES_ORIGINAL_DEADLINE'));
  assert.ok(has(result.conflicts, 'last', 'WINDOW_OUTSIDE_ORIGINAL_DEADLINE'));
  const alreadyDue = inputFor([{ id: 'now_due' }]); alreadyDue.completionDeadline = NOW;
  assert.equal(assess(alreadyDue).acceptable, false);
});

test('quote confirmation expiry is assessed now and never becomes a future dispatch deadline', () => {
  const input = inputFor([{ id: 'later_execution' }], { later_execution: { notBefore: at(30 * minute) } });
  const quote = { sourceHash: hash('3'), validUntil: at(minute) };
  setTerm(input, 'later_execution', { confirmationConstraints: [quote] });
  const confirmedNow = assess(input);
  assert.equal(confirmedNow.acceptable, true);
  assert.equal(row(confirmedNow, 'later_execution').dispatchNotBeforeBound, at(30 * minute));
  assert.equal(row(confirmedNow, 'later_execution').latestStartAt, at(60 * minute - 1));
  assert.deepEqual(row(confirmedNow, 'later_execution').confirmationConstraints, [quote]);
  input.observedAt = at(minute);
  assert.deepEqual(assess(input).conflicts, [{ requirementId: 'later_execution',
    code: 'SOURCE_TERMS_EXPIRED_BEFORE_CONFIRMATION', sourceHash: hash('3') }]);
});

test('provider completion upper bounds do not fabricate earliest completion or downstream acceptance', () => {
  const input = inputFor([{ id: 'downstream', dependsOn: ['known', 'unknown'] }, { id: 'known' }, { id: 'unknown' }], {
    downstream: { notBefore: at(10 * minute), latestStartAt: at(20 * minute) },
  });
  setTerm(input, 'known', { providerCompletionBy: at(50 * minute) });
  let result = assess(input);
  assert.equal(result.acceptable, true); assert.equal(result.state, 'KNOWN_CONSTRAINTS_COMPATIBLE');
  assert.equal(row(result, 'downstream').dispatchNotBeforeBound, at(10 * minute));
  assert.equal(row(result, 'downstream').dependencyCompletionBy, null);
  assert.ok(result.gaps.some(value => value.code === 'DEPENDENCY_COMPLETION_BOUND_DOES_NOT_COVER_START_WINDOW'
    && value.requirementId === 'downstream' && value.dependencyId === 'known'));
  assert.ok(has(result.gaps, 'known', 'RESULT_ACCEPTANCE_COMPLETION_TIME_UNREPORTED'));
  assert.ok(has(result.gaps, 'unknown', 'PROVIDER_COMPLETION_BOUND_UNREPORTED'));
  setTerm(input, 'unknown', { providerCompletionBy: at(5 * minute) });
  result = assess(input);
  assert.equal(row(result, 'downstream').dependencyCompletionBy, at(50 * minute));
  assert.equal(row(result, 'downstream').dispatchNotBeforeBound, at(10 * minute));
  setTerm(input, 'known', { providerCompletionBy: DEADLINE });
  assert.ok(has(assess(input).gaps, 'known', 'PROVIDER_COMPLETION_BOUND_NOT_WITHIN_ORIGINAL_DEADLINE'));
  setTerm(input, 'known', { providerCompletionBy: at(-1) });
  assert.ok(has(assess(input).conflicts, 'known', 'SOURCE_COMPLETION_BOUND_BEFORE_DISPATCH'));
  for (const key of ['wholeOutcomeTimingProven', 'businessFeasibilityEstablished', 'capacityReserved', 'resultPromiseIssued'])
    assert.equal(result[key], false);
});

test('the budget adds projected selected-role ceilings exactly and preserves unpriced requirements as gaps', () => {
  const input = inputFor([{ id: 'selected_pair' }, { id: 'observation' }, { id: 'publication' }]);
  // The adapter projected 43 primary + 57 selected recovery, not candidate quotes.
  setTerm(input, 'selected_pair', { cost: cost((43n + 57n).toString(), 'USD', 'SOURCE_QUOTED_MAXIMUM') });
  setTerm(input, 'observation', { cost: null });
  setTerm(input, 'publication', { cost: cost('0', 'USD', 'EXISTING_ACCEPTED_ORDER_NO_NEW_CHARGE') });
  let result = assess(input);
  assert.equal(result.acceptable, true); assert.equal(result.budget.knownCostMaximumMinor, '100');
  assert.equal(result.budget.allCostsKnown, false); assert.deepEqual(result.budget.unpricedRequirementIds, ['observation']);
  assert.ok(has(result.gaps, 'observation', 'COST_MAXIMUM_UNREPORTED'));
  assert.equal(result.budget.scope, 'BOUND_EXECUTION_CEILINGS_ONLY');
  assert.equal(result.budget.comparisonBasis, 'PROJECTED_AUTHORIZED_OR_QUOTED_CEILINGS');
  assert.equal(result.budget.unquotedCostsIncluded, false); assert.equal(result.budget.previouslyIncurredCostsIncluded, false);
  assert.equal(row(result, 'selected_pair').cost.basis, 'SOURCE_QUOTED_MAXIMUM');
  input.budget.maximumAmountMinor = '99';
  result = assess(input);
  assert.equal(result.acceptable, false); assert.equal(result.budget.exceedsMaximum, true);
  assert.ok(has(result.conflicts, null, 'KNOWN_COST_MAXIMUM_EXCEEDS_BUDGET'));
  input.budget.maximumAmountMinor = '900719925474099312400';
  setTerm(input, 'selected_pair', { cost: cost('900719925474099312345', 'USD', 'FROZEN_EXECUTION_BUDGET') });
  setTerm(input, 'observation', { cost: cost('55') });
  result = assess(input);
  assert.equal(result.budget.knownCostMaximumMinor, '900719925474099312400');
  assert.equal(result.budget.exceedsMaximum, false); assert.equal(result.budget.allCostsKnown, true);
  assert.equal(Object.hasOwn(row(result, 'observation').cost, 'basis'), false, 'missing cost basis is never relabelled as a quote');
});

test('different currencies block budget compatibility without exchange rates or combining unrelated amounts', () => {
  const input = inputFor([{ id: 'local' }, { id: 'foreign' }]);
  input.budget.maximumAmountMinor = '8';
  setTerm(input, 'local', { cost: cost('7', 'USD', 'AUTHORIZED_EXECUTION_CEILING') });
  setTerm(input, 'foreign', { cost: cost('999', 'EUR') });
  const result = assess(input);
  assert.equal(result.acceptable, false); assert.equal(result.budget.knownCostMaximumMinor, '7');
  assert.deepEqual(result.budget.knownCostMaximumByCurrency, { EUR: '999', USD: '7' });
  assert.deepEqual(result.budget.currencyConflictRequirementIds, ['foreign']);
  assert.equal(result.budget.exceedsMaximum, false);
  assert.deepEqual(result.conflicts, [{ requirementId: 'foreign', code: 'COST_CURRENCY_CONFLICT', sourceHash: hash('1') }]);
});

test('joint acceptance is blocked by known lack of evidence support and remains unproven when support is unreported', () => {
  const input = inputFor([{ id: 'artifact' }, { id: 'state' }]);
  setTerm(input, 'artifact', { jointEvidence: 'UNSUPPORTED', acceptanceContract: null });
  assert.equal(assess(input).acceptable, true, 'a narrow standalone contract does not demand joint interval evidence');
  input.jointAcceptance = currentJoint();
  let result = assess(input);
  assert.ok(has(result.conflicts, 'artifact', 'JOINT_EVIDENCE_UNSUPPORTED'));
  assert.ok(has(result.gaps, 'artifact', 'ACCEPTANCE_CONTRACT_UNREPORTED'));
  assert.ok(has(result.gaps, 'state', 'JOINT_EVIDENCE_SUPPORT_UNREPORTED'));
  setTerm(input, 'artifact', { jointEvidence: 'UNREPORTED' });
  result = assess(input);
  assert.equal(result.acceptable, true); assert.equal(result.state, 'KNOWN_CONSTRAINTS_COMPATIBLE');
  assert.equal(result.gaps.filter(value => value.code === 'JOINT_EVIDENCE_SUPPORT_UNREPORTED').length, 2);
  assert.equal(result.businessFeasibilityEstablished, false); assert.equal(result.wholeOutcomeTimingProven, false);
  input.jointAcceptance.timing = { mode: 'WINDOW', startsAt: at(10 * minute), endsAt: at(20 * minute) };
  assert.equal(assess(input).wholeOutcomeTimingProven, false, 'a future stated window is not observed coverage');
});

test('strict terms, graph coverage, source hashes and canonical timestamps reject unsupported or changed fields', () => {
  const valid = inputFor([{ id: 'first' }, { id: 'second', dependsOn: ['first'] }]);
  const edits = [
    value => { value.provider = 'forbidden'; },
    value => { value.graph.vendor = 'forbidden'; },
    value => { value.graph.requirements[0].category = 'forbidden'; },
    value => { value.terms[0].capacityReserved = true; },
    value => { delete value.terms[0].confirmationConstraints; },
    value => { value.terms[1].requirementId = 'first'; },
    value => { value.terms.pop(); },
    value => { value.terms[1].requirementId = 'absent'; },
    value => { value.terms[0].cost.sourceHash = 'a'.repeat(64); },
    value => { value.terms[0].cost.sourceHash = hash('A'); },
    value => { value.terms[0].cost.sourceHash = [hash('1')]; },
    value => { value.terms[0].cost.sourceHash = `${hash('1')}\n`; },
    value => { value.terms[0].cost.maximumAmountMinor = '01'; },
    value => { value.terms[0].cost.maximumAmountMinor = 0; },
    value => { value.terms[0].cost.maximumAmountMinor = '0\n'; },
    value => { value.terms[0].cost.currency = 'usd'; },
    value => { value.terms[0].cost.currency = ['USD']; },
    value => { value.terms[0].cost.basis = 'PROVIDER_PAID_OR_RESERVED'; },
    value => { value.terms[0].cost.total = '0'; },
    value => { value.budget.expiresAt = DEADLINE; },
    value => { value.terms[0].confirmationConstraints = [{ sourceHash: hash('2'), validUntil: at(1), latestStartAt: at(2) }]; },
    value => { value.terms[0].confirmationConstraints = [{ sourceHash: hash('2') }]; },
    value => { value.terms[0].dispatchConstraints = [{ sourceHash: hash('2'), validUntil: at(1), provider: 'forbidden' }]; },
    value => { value.terms[0].dispatchConstraints = [{ sourceHash: hash('2'), validUntil: null }]; },
    value => { value.terms[0].dispatchConstraints = [{ sourceHash: hash('2'), latestStartAt: '2026-09-08T10:00:00Z' }]; },
    value => { value.terms[0].providerCompletionBy = '2026-09-08T10:00:00Z'; },
    value => { value.terms[0].acceptanceContract = ''; },
    value => { value.terms[0].jointEvidence = 'SUPPORTED'; },
    value => { value.observedAt = '2026-09-08T05:00:00.000-04:00'; },
    value => { value.executionWindows.absent = { notBefore: NOW }; },
    value => { value.graph.requirements[0].dependsOn = ['second']; },
    value => { value.jointAcceptance = { ...currentJoint(), capacityReserved: true }; },
  ];
  for (const edit of edits) {
    const value = structuredClone(valid); edit(value);
    assert.throws(() => assess(value), { code: 'OUTCOME_PLAN_INPUT_INVALID' }, edit.toString());
  }
});
