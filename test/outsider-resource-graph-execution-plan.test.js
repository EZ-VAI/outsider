import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRemainingExecutionPlan as assess } from '../src/outsider-resource-graph-execution-plan.js';

const NOW = '2026-09-08T09:00:00.000Z';
const at = milliseconds => new Date(Date.parse(NOW) + milliseconds).toISOString();
const minute = 60000, DEADLINE = at(60 * minute);
function inputFor(rows, executionWindows = {}, facts = {}) {
  return { observedAt: NOW, completionDeadline: DEADLINE, executionWindows,
    graph: { summary: 'Preserve the original graph while checking the remaining dispatch windows', missingFacts: [],
      requirements: rows.map(({ id, dependsOn = [] }) => ({ id, dependsOn, capability: 'A2A_AGENT_TASK_V1',
        outcome: 'The confirmed returned artifact is available', acceptance: ['A2A_TASK_ARTIFACT_AVAILABLE_V1'],
        recoveryNeeds: ['Retain submitted task identity'], resourceKinds: ['AGENT_TASK'],
        discoveryQueries: ['connected resource'], candidateDocumentationUrls: [] })) },
    parts: rows.map(({ id }) => ({ id, category: 'AGENT_TASK_EXECUTION', resource: { expiresAt: DEADLINE } })),
    executionFacts: Object.fromEntries(rows.map(({ id }) => [id, facts[id] ?? { state: 'UNSTARTED' }])) };
}
const row = (assessment, id) => assessment.requirements.find(requirement => requirement.requirementId === id);
const has = (entries, id, code) => entries.some(entry => entry.requirementId === id && entry.code === code);

test('the complete DAG propagates a later branch through a shared descendant and reports the conflicting remaining window', () => {
  const input = inputFor([{ id: 'join', dependsOn: ['middle', 'parallel'] }, { id: 'parallel' },
    { id: 'middle', dependsOn: ['later'] }, { id: 'later' }], {
    later: { notBefore: at(30 * minute) }, parallel: { notBefore: at(5 * minute) },
    join: { notBefore: at(10 * minute), latestStartAt: at(20 * minute) },
  });
  const bytes = JSON.stringify(input), result = assess(input);
  assert.equal(result.acceptable, false); assert.equal(result.state, 'CONFLICT');
  assert.equal(row(result, 'middle').dispatchNotBeforeBound, at(30 * minute));
  assert.equal(row(result, 'join').dispatchNotBeforeBound, at(30 * minute));
  assert.deepEqual(result.conflicts, [{ requirementId: 'join', code: 'DEPENDENCY_START_WINDOW_CONFLICT', dependencyId: 'middle' }]);
  assert.equal(row(result, 'parallel').dispatchNotBeforeBound, at(5 * minute));
  assert.equal(JSON.stringify(input), bytes, 'assessment never changes windows, facts or original graph bytes');
});

test('accepted predecessors remain completed facts even after their historical windows and source authority expired', () => {
  const acceptedAt = at(-10 * minute);
  const input = inputFor([{ id: 'done' }, { id: 'remaining', dependsOn: ['done'] }], {
    done: { notBefore: at(-30 * minute), latestStartAt: at(-20 * minute) },
    remaining: { notBefore: at(-minute), latestStartAt: NOW },
  }, { done: { state: 'ACCEPTED', acceptedAt } });
  input.parts[0].resource.expiresAt = at(-minute);
  const result = assess(input);
  assert.equal(result.acceptable, true); assert.deepEqual(result.conflicts, []);
  assert.equal(row(result, 'done').state, 'ACCEPTED'); assert.equal(row(result, 'done').acceptedAt, acceptedAt);
  assert.equal(row(result, 'done').dispatchNotBeforeBound, null);
  assert.equal(row(result, 'remaining').dependencyCompletionBy, acceptedAt);
  assert.equal(row(result, 'remaining').dispatchNotBeforeBound, NOW);
  assert.equal(row(result, 'remaining').latestStartAt, NOW, 'the original latest-start comparison is inclusive');
  assert.equal(result.observedAt, NOW); assert.equal(result.completionDeadline, DEADLINE);
});

test('an unresolved submitted effect is preserved rather than rescheduled or treated as an accepted predecessor', () => {
  const input = inputFor([{ id: 'unknown' }, { id: 'remaining', dependsOn: ['unknown'] }], {
    unknown: { notBefore: at(-2 * minute), latestStartAt: at(-minute) },
    remaining: { notBefore: at(5 * minute), latestStartAt: at(20 * minute) },
  }, { unknown: { state: 'STARTED' } });
  const result = assess(input);
  assert.equal(result.acceptable, true); assert.equal(result.timingTermsIncomplete, true);
  assert.equal(row(result, 'unknown').state, 'STARTED'); assert.equal(row(result, 'unknown').dispatchNotBeforeBound, null);
  assert.equal(row(result, 'remaining').dependencyCompletionBy, null);
  assert.ok(has(result.timingGaps, 'unknown', 'EXISTING_DISPATCH_OR_ACCEPTANCE_UNRESOLVED'));
  assert.ok(has(result.timingGaps, 'remaining', 'DEPENDENCY_COMPLETION_BOUND_UNREPORTED'));
  assert.equal(result.wholeOutcomeTimingProven, false); assert.equal(result.businessFeasibilityEstablished, false);
});

test('a source completion deadline is an upper bound, never a fabricated earliest completion or acceptance time', () => {
  const input = inputFor([{ id: 'source' }, { id: 'remaining', dependsOn: ['source'] }], {
    remaining: { notBefore: at(10 * minute), latestStartAt: at(20 * minute) },
  });
  input.parts[0].formationFeasibility = { providerCompletionBound: at(50 * minute), independentAcceptanceTimingProven: false };
  const result = assess(input);
  assert.equal(result.acceptable, true, 'a later upper bound does not establish that an earlier completion is impossible');
  assert.equal(row(result, 'remaining').dispatchNotBeforeBound, at(10 * minute));
  assert.equal(row(result, 'remaining').dependencyCompletionBy, at(50 * minute));
  assert.ok(has(result.timingGaps, 'remaining', 'DEPENDENCY_COMPLETION_BOUND_DOES_NOT_COVER_START_WINDOW'));
  assert.ok(has(result.timingGaps, 'source', 'DEPENDENCY_ACCEPTANCE_COMPLETION_TIME_UNREPORTED'));
  assert.equal(result.wholeOutcomeTimingProven, false);
  const missingTerms = assess(inputFor([{ id: 'ordinary' }], { ordinary: { notBefore: NOW } }));
  assert.equal(missingTerms.acceptable, true); assert.equal(missingTerms.timingTermsIncomplete, true);
  assert.ok(has(missingTerms.timingGaps, 'ordinary', 'PROVIDER_COMPLETION_BOUND_UNREPORTED'));
  assert.equal(row(missingTerms, 'ordinary').providerCompletionBy, null);
  assert.equal(missingTerms.scope, 'UNSTARTED_A2A_DISPATCH_WINDOWS_ONLY');
});

test('remaining windows respect the original deadline, existing resource expiry and frozen source start terms', () => {
  const input = inputFor([{ id: 'late' }, { id: 'short_authority' }, { id: 'source_limited' }], {
    late: { notBefore: DEADLINE }, short_authority: { notBefore: at(30 * minute) },
    source_limited: { notBefore: at(15 * minute) },
  });
  input.parts[1].resource.expiresAt = at(20 * minute);
  input.parts[2].quotes = { primary: { latestStartAt: at(10 * minute) }, recovery: { latestStartAt: at(12 * minute) } };
  input.parts[2].formationFeasibility = { providerCompletionBound: at(14 * minute) };
  const result = assess(input);
  assert.equal(result.acceptable, false);
  assert.ok(has(result.conflicts, 'late', 'WINDOW_OUTSIDE_ORIGINAL_DEADLINE'));
  assert.ok(has(result.conflicts, 'late', 'DISPATCH_BOUND_REACHES_ORIGINAL_DEADLINE'));
  assert.ok(has(result.conflicts, 'short_authority', 'RESOURCE_AUTHORIZATION_DOES_NOT_COVER_ORIGINAL_DEADLINE'));
  assert.ok(has(result.conflicts, 'short_authority', 'RESOURCE_AUTHORIZATION_NOT_VALID_AT_DISPATCH'));
  assert.ok(has(result.conflicts, 'source_limited', 'FROZEN_SOURCE_START_WINDOW_CONFLICT'));
  assert.ok(has(result.conflicts, 'source_limited', 'SOURCE_COMPLETION_BOUND_BEFORE_DISPATCH'));
  const missed = assess(inputFor([{ id: 'missed' }], { missed: { notBefore: at(-minute), latestStartAt: at(-1) } }));
  assert.ok(has(missed.conflicts, 'missed', 'LATEST_START_ALREADY_PASSED'));
  const finalMillisecond = assess(inputFor([{ id: 'boundary' }], {
    boundary: { notBefore: at(60 * minute - 1), latestStartAt: at(60 * minute - 1) },
  }));
  assert.equal(finalMillisecond.acceptable, true); assert.equal(finalMillisecond.timingTermsIncomplete, true);
  assert.equal(finalMillisecond.wholeOutcomeTimingProven, false, 'a legal last dispatch instant does not promise completion within one millisecond');
});

test('noncanonical time zones, incomplete facts and an invalid full dependency graph are rejected as input errors', () => {
  const valid = inputFor([{ id: 'first' }, { id: 'second', dependsOn: ['first'] }], { second: { notBefore: NOW } });
  const invalid = [];
  let input = structuredClone(valid); input.executionWindows.second.notBefore = '2026-09-08T05:00:00.000-04:00'; invalid.push(input);
  input = structuredClone(valid); input.observedAt = '2026-09-08T09:00:00Z'; invalid.push(input);
  input = structuredClone(valid); delete input.executionFacts.first; invalid.push(input);
  input = structuredClone(valid); input.executionFacts.first = { state: 'ACCEPTED', acceptedAt: at(1) }; invalid.push(input);
  input = structuredClone(valid); input.executionFacts.first = { state: 'STARTED', acceptedAt: NOW }; invalid.push(input);
  input = structuredClone(valid); input.graph.requirements[0].dependsOn = ['second']; invalid.push(input);
  input = structuredClone(valid); input.graph.requirements[1].dependsOn = ['absent']; invalid.push(input);
  input = structuredClone(valid); input.parts.pop(); invalid.push(input);
  for (const value of invalid) assert.throws(() => assess(value), { code: 'EXECUTION_PLAN_INPUT_INVALID' });
});
