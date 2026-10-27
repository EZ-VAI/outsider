import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { publicDatasetHash as digest } from '../src/outsider-public-dataset.js';
import { compileExecutionOnlyProgramV3, compileOutcomeProgramV1 } from '../src/outsider-outcome-program-v1.js';
import { createDurableOutcomeProgramOrchestratorV1 } from '../src/outsider-durable-outcome-program-orchestrator-v1.js';
import { EFFECT_PRECONDITIONS_SCHEMA, EFFECT_PRECONDITIONS_SCHEMA_V2, EFFECT_PRECONDITION_EVIDENCE_SCHEMA,
  normalizeEffectPreconditions, effectPreconditionGroups, effectPreconditionEvidenceBinding } from '../src/outsider-effect-preconditions.js';

const NOW = '2026-09-08T20:00:00.000Z';
const at = offset => new Date(Date.parse(NOW) + offset).toISOString();
const group = (groupId, observerRequirementId, conditions, changes = {}) => ({ groupId, observerRequirementId,
  maximumEvidenceAgeMs: 1000, retryIntervalMs: 1000, conditions, ...changes });
const access = () => group('access', 'read_access', [{ predicateId: 'accessReady', valueType: 'boolean', operator: 'EQ', value: true }]);
const capacity = () => group('capacity', 'read_capacity', [{ predicateId: 'availableUnits', valueType: 'number', operator: 'GTE', value: 2 }]);
const contract = (groups = [access(), capacity()]) => ({ schema: EFFECT_PRECONDITIONS_SCHEMA_V2, groups });

function fixture(t, { preconditions = contract(), predecessor = false, kind = 'TRANSACTION' } = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-multi-source-preconditions-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const roles = new Map([['primary', 'PRIMARY'], ...(kind === 'EFFECT' ? [['recovery', 'RECOVERY']] : []), ['read_final', 'INDEPENDENT_WITNESS'],
    ...effectPreconditionGroups(preconditions).map(row => [row.contract.observerRequirementId, 'INDEPENDENT_WITNESS'])]);
  const node = (nodeId, dependsOn, input) => ({ nodeId, kind, dependsOn, input, acceptance: ['DECLARED_RESULT'],
    primaryRequirementId: 'primary', recoveryRequirementId: kind === 'EFFECT' ? 'recovery' : null, witnessRequirementId: 'read_final' });
  const input = { programId: 'multi_source_original_program', orderId: 'multi_source_original_order', createdAt: NOW,
    formationDeadline: at(3600000), completionDeadline: at(7200000), tenderHash: null,
    ...(kind === 'TRANSACTION' ? { commitmentMode: 'EXECUTION_ONLY_NO_OUTCOME_PROMISE' } : {}),
    outcome: { statement: 'Execute one accepted action only after all declared source checks', budget: { currency: 'USD', maximumAmountMinor: '0' },
      acceptance: [{ criterionId: 'result', comparator: 'CONFIRMED_CAPABILITY_CONTRACT', subject: 'DECLARED_ACTION', expected: { contract: 'DECLARED_RESULT' } }] },
    requirements: [...roles].map(([requirementId, role]) => ({ requirementId, role, capability: role === 'INDEPENDENT_WITNESS'
      ? 'DECLARED_SOURCE_OBSERVATION' : 'DECLARED_ACTION', minimumReservationMs: 1, dependsOnRequirementIds: [],
    constraints: kind === 'TRANSACTION' ? role === 'PRIMARY' ? { admissionMode: 'EXECUTION_PHASE_TRANSACTION', maximumAmountMinor: '0' }
      : { admissionMode: 'ON_DEMAND_OBSERVATION' } : {} })),
    nodes: [...(predecessor ? [node('prior', [], {})] : []), node('target', predecessor ? ['prior'] : [], { executionPreconditions: preconditions })],
    obligations: [{ obligationId: 'close_primary', trigger: 'ALWAYS', targetRequirementId: 'primary', nodeId: null,
      action: 'CLOSE_ORIGINAL_OPERATION', input: {}, deadline: at(7200000) }],
    zeroInternalOps: { staffTouchLimit: 0, humanQueueFallback: false } };
  const program = (kind === 'TRANSACTION' ? compileExecutionOnlyProgramV3 : compileOutcomeProgramV1)(input);
  let now = NOW;
  const calls = [], behavior = {}, values = { read_access: { accessReady: true }, read_capacity: { availableUnits: 3 } };
  const evidence = context => ({ schema: EFFECT_PRECONDITION_EVIDENCE_SCHEMA, bindingHash: context.preconditionBinding.bindingHash,
    observedAt: now, facts: context.contract.conditions.map(condition => ({ predicateId: condition.predicateId, valueType: condition.valueType,
      value: values[context.contract.observerRequirementId]?.[condition.predicateId] ?? condition.value,
      evidenceHash: digest({ fixture: true, source: context.contract.observerRequirementId, predicateId: condition.predicateId,
        value: values[context.contract.observerRequirementId]?.[condition.predicateId] ?? condition.value, observedAt: now }) })) });
  const adapters = Object.fromEntries([...roles].map(([id, role]) => [id, { providerRef: `fixture-${id}`, supportsResumeOnly: true,
    reserve(context) { calls.push({ phase: 'reserve', id, context }); return { status: kind === 'TRANSACTION'
      ? role === 'PRIMARY' ? 'READY_FOR_TRANSACTION' : 'READY_ON_DEMAND' : 'RESERVED',
    reservationId: context.operationId, validUntil: at(10800000), ...(kind === 'TRANSACTION' ? { capacityReserved: false } : {}),
    providerReceipt: { fixture: true, transactionSubmitted: false } }; },
    execute(context) { calls.push({ phase: 'execute', id, context }); return behavior.execute?.(context) ?? { status: 'SUCCEEDED' }; },
    observe(context) { calls.push({ phase: 'final', id, context }); return { status: 'SATISFIED', observedAt: now }; },
    observePreconditions(context) { calls.push({ phase: 'precondition', id, context });
      return behavior.observe ? behavior.observe(context) : evidence(context); },
    release: () => ({ status: 'CLOSED' }), closeObligation: () => ({ status: 'CLOSED' }),
  }]));
  const bindings = Object.fromEntries([...roles.keys()].map(id => [id, { adapterId: id, providerRef: `fixture-${id}` }]));
  const create = () => createDurableOutcomeProgramOrchestratorV1({ directory, adapters,
    clock: () => behavior.clock ? behavior.clock(now) : now,
    measureOperations: () => ({ outsiderStaffTouchCount: 0, humanQueueCreated: false, source: 'LOCAL_MULTI_SOURCE_RUNTIME_FIXTURE' }) });
  const bytes = () => {
    const name = existsSync(directory) && readdirSync(directory).find(name => name.endsWith('.events.jsonl'));
    return name ? readFileSync(path.join(directory, name), 'utf8') : '';
  };
  return { directory, program, calls, values, adapters, bindings, behavior, evidence, bytes, create,
    setNow(value) { now = value; }, run: () => create().run(program, { bindings }), resume: () => create().resume(program.programId),
    events: () => bytes().trim().split('\n').filter(Boolean).map(JSON.parse),
    reads: (groupId, route) => calls.filter(call => call.phase === 'precondition'
      && (!groupId || call.context.preconditionGroupId === groupId) && (!route || call.context.route === route)),
    effects: (nodeId = 'target', route) => calls.filter(call => call.phase === 'execute'
      && call.context.node.nodeId === nodeId && (!route || call.context.route === route)) };
}

test('V2 preserves distinct group policies and rejects excess, duplicate, malformed, or non-witness declarations', () => {
  const bounds = contract([group('lower', 'read_capacity', [{ predicateId: 'amount', valueType: 'number', operator: 'GTE', value: 2 }]),
    group('upper', 'read_capacity', [{ predicateId: 'amount', valueType: 'number', operator: 'LTE', value: 5 }], { maximumEvidenceAgeMs: 2000, retryIntervalMs: 3000 })]);
  const before = JSON.stringify(bounds), program = { requirements: [{ requirementId: 'read_capacity', role: 'INDEPENDENT_WITNESS' }] };
  assert.deepEqual(normalizeEffectPreconditions(bounds, { program, node: { kind: 'TRANSACTION' } }), bounds);
  const groups = effectPreconditionGroups(bounds);
  assert.deepEqual(groups.map(row => [row.groupId, row.contract.conditions[0].operator]), [['lower', 'GTE'], ['upper', 'LTE']]);
  assert.ok(groups.every(row => row.contract.schema === EFFECT_PRECONDITIONS_SCHEMA));
  assert.notEqual(digest(groups[0].contract), digest(groups[1].contract));
  assert.equal(JSON.stringify(bounds), before);
  assert.throws(() => effectPreconditionEvidenceBinding({ programHash: digest('program'), nodeId: 'target', route: 'PRIMARY',
    operationId: 'one-binding-cannot-replace-all-groups', contract: bounds }), { code: 'EFFECT_PRECONDITION_GROUP_BINDING_REQUIRED' });
  const cases = [ { ...bounds, relaxed: true }, contract([]), contract([access(), access()]),
    contract([{ ...access(), groupId: '' }]), contract([{ ...access(), observerRequirementId: null }]),
    contract([{ ...access(), schema: EFFECT_PRECONDITIONS_SCHEMA }]),
    contract([{ ...access(), conditions: [] }]), contract([{ ...access(), maximumEvidenceAgeMs: 0 }]),
    contract([{ ...access(), conditions: [{ predicateId: 'x', valueType: 'boolean', operator: 'GTE', value: true }] }]),
    contract(Array.from({ length: 65 }, (_, index) => ({ ...access(), groupId: `group_${index}` }))),
    contract([group('many', 'read_capacity', Array.from({ length: 64 }, (_, index) => ({ predicateId: `p_${index}`, valueType: 'number', operator: 'EQ', value: 1 }))), access()]),
  ];
  for (const value of cases) assert.throws(() => normalizeEffectPreconditions(value), { code: 'EFFECT_PRECONDITION_CONTRACT_INVALID' });
  assert.throws(() => normalizeEffectPreconditions(bounds, { program: { requirements: [{ requirementId: 'read_capacity', role: 'PRIMARY' }] } }),
    { code: 'EFFECT_PRECONDITION_OBSERVER_REQUIREMENT_INVALID' });
  assert.throws(() => normalizeEffectPreconditions(bounds, { node: { kind: 'OBSERVE' } }), { code: 'EFFECT_PRECONDITION_NODE_KIND_INVALID' });
});

test('all sources are reread on the same order after a failed group; completed predecessors run only once', async t => {
  const f = fixture(t, { predecessor: true }); f.values.read_capacity.availableUnits = 0;
  const first = await f.run();
  assert.equal(first.state, 'PAUSED_RETRYABLE'); assert.equal(first.retry.observationStatus, 'NOT_SATISFIED');
  assert.deepEqual(first.retry.groupIds, ['capacity']); assert.equal(f.effects().length, 0); assert.equal(f.effects('prior').length, 1);
  assert.deepEqual(first.nodes.target.executionPreconditions.primary.groups.map(row => row.status), ['SATISFIED', 'NOT_SATISFIED']);
  f.setNow(at(1000)); f.values.read_access.accessReady = false; f.values.read_capacity.availableUnits = 3;
  const second = await f.resume();
  assert.equal(second.state, 'PAUSED_RETRYABLE'); assert.deepEqual(second.retry.groupIds, ['access']);
  assert.equal(f.effects().length, 0); assert.equal(f.effects('prior').length, 1);
  f.setNow(at(2000)); f.values.read_access.accessReady = true;
  const finished = await f.resume();
  assert.equal(finished.state, 'SUCCEEDED'); assert.equal(finished.programHash, f.program.programHash);
  assert.equal(f.effects().length, 1); assert.equal(f.effects('prior').length, 1);
  for (const groupId of ['access', 'capacity']) {
    assert.equal(f.reads(groupId).length, 3);
    assert.equal(new Set(f.reads(groupId).map(row => row.context.operationId)).size, 3);
    assert.deepEqual(f.reads(groupId).map(row => row.context.observationOccurrence), [1, 2, 3]);
  }
  const proof = f.effects()[0].context.preconditionEvidence.observation;
  assert.equal(proof.status, 'SATISFIED'); assert.equal(proof.contractHash, digest(f.program.nodes.find(row => row.nodeId === 'target').input.executionPreconditions));
  assert.equal(proof.groups.length, 2); assert.equal(proof.pointObservationOnly, true);
  assert.equal(proof.simultaneousSatisfactionProven, false); assert.equal(proof.continuousValidityClaimed, false); assert.equal(proof.atomicCheckAndAct, false);
  assert.equal(f.events().filter(row => row.eventType === 'NODE_EFFECT_REQUESTED' && row.payload.nodeId === 'target').length, 1);
});

test('a disconnected source keeps its unfinished read operation while successful siblings are read again', async t => {
  const f = fixture(t); let lost = true;
  f.behavior.observe = context => {
    if (context.preconditionGroupId === 'capacity' && lost) throw new Error('PRIVATE_SOURCE_CONNECTION_ERROR');
    return f.evidence(context);
  };
  assert.equal((await f.run()).state, 'PAUSED_RETRYABLE');
  assert.equal(f.effects().length, 0); assert.equal(f.bytes().includes('PRIVATE_SOURCE_CONNECTION_ERROR'), false);
  f.setNow(at(1000)); lost = false; f.values.read_access.accessReady = false;
  const retry = await f.resume();
  assert.equal(retry.state, 'PAUSED_RETRYABLE'); assert.deepEqual(retry.retry.groupIds, ['access']);
  assert.notEqual(f.reads('access')[0].context.operationId, f.reads('access')[1].context.operationId);
  assert.equal(f.reads('capacity')[0].context.operationId, f.reads('capacity')[1].context.operationId);
  assert.equal(f.reads('capacity')[0].context.preconditionBinding.bindingHash, f.reads('capacity')[1].context.preconditionBinding.bindingHash);
  assert.equal(f.reads('capacity')[1].context.preconditionRoundOccurrence, 2);
  f.setNow(at(2000)); f.values.read_access.accessReady = true;
  assert.equal((await f.resume()).state, 'SUCCEEDED'); assert.equal(f.effects().length, 1);
  assert.notEqual(f.reads('capacity')[1].context.operationId, f.reads('capacity')[2].context.operationId);
});

test('an earlier passing source that expires while another source reads prevents dispatch', async t => {
  const f = fixture(t); let slow = true;
  f.behavior.observe = context => {
    if (context.preconditionGroupId === 'capacity' && slow) f.setNow(at(1500));
    return f.evidence(context);
  };
  const expired = await f.run();
  assert.equal(expired.state, 'PAUSED_RETRYABLE'); assert.equal(expired.retry.observationStatus, 'INCONCLUSIVE');
  assert.deepEqual(expired.retry.groupIds, ['access']); assert.equal(f.effects().length, 0);
  const proof = expired.nodes.target.executionPreconditions.primary;
  assert.equal(proof.groups[0].observation.reason, 'EVIDENCE_EXPIRED'); assert.equal(proof.groups[1].status, 'SATISFIED');
  assert.equal(f.events().filter(row => row.eventType === 'NODE_PRECONDITION_GROUP_COMPLETED').every(row => row.payload.observation.status === 'SATISFIED'), true,
    'individual passes cannot replace the final all-group freshness check');
  slow = false; f.setNow(at(2500));
  assert.equal((await f.resume()).state, 'SUCCEEDED'); assert.equal(f.effects().length, 1);
  assert.equal(f.reads().length, 4);
});

test('a restart after every source passed but before effect intent cannot reuse any group pass', async t => {
  const f = fixture(t);
  f.behavior.observe = context => {
    if (context.preconditionGroupId === 'capacity') f.behavior.clock = now => {
      if (f.events().filter(row => row.eventType === 'NODE_PRECONDITION_GROUP_COMPLETED').length === 2)
        throw new Error('FIXTURE_STOP_BEFORE_MULTI_SOURCE_EFFECT_INTENT');
      return now;
    };
    return f.evidence(context);
  };
  await assert.rejects(f.run(), /FIXTURE_STOP_BEFORE_MULTI_SOURCE_EFFECT_INTENT/u);
  assert.equal(f.events().filter(row => row.eventType === 'NODE_PRECONDITION_GROUP_COMPLETED').length, 2);
  assert.equal(f.events().some(row => row.eventType === 'NODE_EFFECT_REQUESTED'), false);
  delete f.behavior.clock; delete f.behavior.observe;
  const inspected = f.create().inspect(f.program.programId);
  assert.equal(inspected.state, 'PAUSED_RETRYABLE'); assert.equal(inspected.retry.reason, 'PRECONDITION_REFRESH_REQUIRED');
  assert.equal(inspected.nodes.target.executionPreconditions.primary, null);
  f.setNow(at(1000)); f.values.read_capacity.availableUnits = 0;
  const resumed = await f.resume();
  assert.equal(resumed.state, 'PAUSED_RETRYABLE'); assert.equal(f.effects().length, 0); assert.equal(f.reads().length, 4);
  assert.notEqual(f.reads('access')[0].context.operationId, f.reads('access')[1].context.operationId);
  assert.notEqual(f.reads('capacity')[0].context.operationId, f.reads('capacity')[1].context.operationId);
});

test('an ambiguous effect only reconciles its original operation even when every precondition source disappears', async t => {
  const f = fixture(t), acceptedOperations = new Set(); let sends = 0;
  f.behavior.execute = context => {
    if (!context.resumeOnly) { sends++; acceptedOperations.add(context.operationId); throw new Error('FIXTURE_RESPONSE_LOST_AFTER_EFFECT'); }
    assert.ok(acceptedOperations.has(context.operationId)); return { status: 'SUCCEEDED', receipt: { originalOperationReconciled: true } };
  };
  assert.equal((await f.run()).state, 'PAUSED_RETRYABLE'); assert.equal(sends, 1); assert.equal(f.reads().length, 2);
  delete f.adapters.read_access.observePreconditions; delete f.adapters.read_capacity.observePreconditions;
  f.values.read_access.accessReady = false; f.values.read_capacity.availableUnits = 0; f.setNow(at(1000));
  assert.equal((await f.resume()).state, 'SUCCEEDED'); assert.equal(sends, 1); assert.equal(f.reads().length, 2);
  assert.equal(f.effects().length, 2); assert.equal(f.effects()[1].context.resumeOnly, true);
  assert.equal(f.effects()[0].context.operationId, f.effects()[1].context.operationId);
  assert.equal(f.events().filter(row => row.eventType === 'NODE_PRECONDITION_ROUND_REQUESTED').length, 1);
  assert.equal(f.events().filter(row => row.eventType === 'NODE_EFFECT_REQUESTED').length, 1);
});

test('same-source lower and upper predicates remain separate enforced conditions and recovery gets its own complete round', async t => {
  const bounds = contract([group('lower', 'read_capacity', [{ predicateId: 'availableUnits', valueType: 'number', operator: 'GTE', value: 2 }]),
    group('upper', 'read_capacity', [{ predicateId: 'availableUnits', valueType: 'number', operator: 'LTE', value: 5 }], { maximumEvidenceAgeMs: 2000, retryIntervalMs: 2000 })]);
  const f = fixture(t, { preconditions: bounds, kind: 'EFFECT' }); f.values.read_capacity.availableUnits = 6;
  assert.deepEqual((await f.run()).retry.groupIds, ['lower', 'upper']); assert.equal(f.effects().length, 0);
  f.setNow(at(2000)); f.values.read_capacity.availableUnits = 1;
  assert.deepEqual((await f.resume()).retry.groupIds, ['lower', 'upper']); assert.equal(f.effects().length, 0);
  f.setNow(at(3000)); f.values.read_capacity.availableUnits = 3;
  f.behavior.execute = context => {
    if (context.route === 'PRIMARY') { f.values.read_capacity.availableUnits = 9; return { status: 'FAILED', reason: 'FIXTURE_CONFIRMED_FAILURE' }; }
    return { status: 'SUCCEEDED' };
  };
  const recoveryWaiting = await f.resume();
  assert.equal(recoveryWaiting.retry.route, 'RECOVERY'); assert.deepEqual(recoveryWaiting.retry.groupIds, ['lower', 'upper']);
  assert.equal(f.effects('target', 'PRIMARY').length, 1); assert.equal(f.effects('target', 'RECOVERY').length, 0);
  assert.equal(f.reads('lower', 'RECOVERY').length, 1); assert.equal(f.reads('upper', 'RECOVERY').length, 1);
  assert.notEqual(f.reads('lower', 'PRIMARY').at(-1).context.preconditionBinding.bindingHash,
    f.reads('lower', 'RECOVERY')[0].context.preconditionBinding.bindingHash);
  f.setNow(at(5000)); f.values.read_capacity.availableUnits = 3;
  assert.equal((await f.resume()).state, 'SUCCEEDED'); assert.equal(f.effects('target', 'RECOVERY').length, 1);
  assert.equal(f.effects('target', 'RECOVERY')[0].context.preconditionEvidence.observation.groups.length, 2);
});

test('separate source reads must each satisfy all bounds; different values inside the accepted range remain usable', async t => {
  const bounds = contract([group('lower', 'read_capacity', [{ predicateId: 'availableUnits', valueType: 'number', operator: 'GTE', value: 20 }]),
    group('upper', 'read_capacity', [{ predicateId: 'availableUnits', valueType: 'number', operator: 'LTE', value: 40 }],
      { maximumEvidenceAgeMs: 2000, retryIntervalMs: 2000 })]);
  const f = fixture(t, { preconditions: bounds }); let unstable = true;
  f.behavior.observe = context => {
    f.values.read_capacity.availableUnits = unstable
      ? context.preconditionGroupId === 'lower' ? 100 : 0
      : context.preconditionGroupId === 'lower' ? 20.1 : 20.2;
    return f.evidence(context);
  };
  for (let round = 0; round < 2; round++) {
    f.setNow(at(round * 1000));
    const paused = await (round ? f.resume() : f.run());
    assert.equal(paused.state, 'PAUSED_RETRYABLE'); assert.equal(f.effects().length, 0);
    assert.equal(paused.retry.reason, 'SOURCE_OBSERVATIONS_DO_NOT_JOINTLY_SATISFY_CONDITIONS');
    const proof = paused.nodes.target.executionPreconditions.primary;
    assert.equal(proof.status, 'INCONCLUSIVE');
    assert.deepEqual(proof.groups.map(row => row.status), ['INCONCLUSIVE', 'INCONCLUSIVE']);
    assert.deepEqual(proof.groups.map(row => row.observation.status), ['SATISFIED', 'SATISFIED'],
      'passing each isolated comparison does not authorize an impossible conjunction');
    assert.equal(JSON.stringify(proof).includes('"facts"'), false, 'the public proof does not expose actual source values');
  }
  unstable = false; f.setNow(at(2000));
  const completed = await f.resume();
  assert.equal(completed.state, 'SUCCEEDED'); assert.equal(completed.programHash, f.program.programHash);
  assert.equal(f.effects().length, 1); assert.equal(f.reads().length, 6);
  assert.equal(f.effects()[0].context.preconditionEvidence.observation.status, 'SATISFIED');
  assert.equal(f.effects()[0].context.preconditionEvidence.observation.simultaneousSatisfactionProven, false);
});

test('every source keeps the existing explicit-interface, independence and resume-only boundaries', async t => {
  for (const [name, mutate, reason, groupId] of [
    ['second source unavailable', f => { delete f.adapters.read_capacity.observePreconditions; }, 'PRECONDITION_OBSERVER_INTERFACE_UNAVAILABLE', 'capacity'],
    ['second source is the execution provider', f => { f.bindings.read_capacity.providerRef = f.bindings.primary.providerRef; }, 'PRECONDITION_OBSERVER_NOT_INDEPENDENT', 'capacity'],
    ['executor lacks reconciliation', f => { delete f.adapters.primary.supportsResumeOnly; }, 'PRECONDITION_RESUME_ONLY_REQUIRED', undefined],
  ]) await t.test(name, async child => {
    const f = fixture(child); mutate(f);
    const result = await f.run();
    assert.equal(result.state, 'PAUSED_RETRYABLE'); assert.equal(result.retry.reason, reason);
    assert.equal(result.retry.groupId, groupId); assert.equal(f.calls.length, 0);
  });
});
