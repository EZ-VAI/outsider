import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileOutcomeProgramV1, compileExecutionOnlyProgramV3 } from '../src/outsider-outcome-program-v1.js';
import { createDurableOutcomeProgramOrchestratorV1 } from '../src/outsider-durable-outcome-program-orchestrator-v1.js';
import { EFFECT_PRECONDITIONS_SCHEMA, EFFECT_PRECONDITION_EVIDENCE_SCHEMA } from '../src/outsider-effect-preconditions.js';
import { executionWindowAcceptance } from '../src/outsider-execution-windows.js';
import { publicDatasetHash as digest } from '../src/outsider-public-dataset.js';

const NOW = '2026-09-08T12:00:00.000Z', DAY = 86400000;
const at = offset => new Date(Date.parse(NOW) + offset).toISOString();
const DEADLINE = at(3 * DAY), VALID_UNTIL = at(4 * DAY);
const contract = overrides => ({ schema: EFFECT_PRECONDITIONS_SCHEMA, observerRequirementId: 'read',
  maximumEvidenceAgeMs: 1000, retryIntervalMs: 1000,
  conditions: [{ predicateId: 'stateReady', valueType: 'boolean', operator: 'EQ', value: true }], ...overrides });

function programInput({ kind = 'EFFECT', predecessor = false, window, preconditions = contract() } = {}) {
  const roles = [['primary', 'PRIMARY'], ...(kind === 'EFFECT' ? [['recovery', 'RECOVERY']] : []), ['read', 'INDEPENDENT_WITNESS']];
  const node = (nodeId, dependsOn, input, acceptance = ['DECLARED_RESULT']) => ({ nodeId, kind, dependsOn,
    primaryRequirementId: 'primary', recoveryRequirementId: kind === 'EFFECT' ? 'recovery' : null,
    witnessRequirementId: 'read', input, acceptance });
  return { programId: 'precondition_original_program', orderId: 'precondition_original_order', createdAt: NOW,
    formationDeadline: at(3600000), completionDeadline: DEADLINE, tenderHash: null,
    ...(kind === 'TRANSACTION' ? { commitmentMode: 'EXECUTION_ONLY_NO_OUTCOME_PROMISE' } : {}),
    outcome: { statement: 'Apply the declared change only while its explicitly observed condition holds',
      budget: { currency: 'USD', maximumAmountMinor: '0' }, acceptance: [{ criterionId: 'declared_result',
        comparator: 'CONFIRMED_CAPABILITY_CONTRACT', subject: 'AUTHORIZED_STATE_CHANGE', expected: { contract: 'DECLARED_RESULT' } }] },
    requirements: roles.map(([requirementId, role]) => ({ requirementId, role, minimumReservationMs: 1,
      capability: role === 'INDEPENDENT_WITNESS' ? 'AUTHORIZED_STATE_OBSERVATION' : 'AUTHORIZED_STATE_CHANGE',
      dependsOnRequirementIds: [], constraints: kind === 'TRANSACTION'
        ? role === 'PRIMARY' ? { admissionMode: 'EXECUTION_PHASE_TRANSACTION', maximumAmountMinor: '0' }
          : { admissionMode: 'ON_DEMAND_OBSERVATION' } : {} })),
    nodes: [...(predecessor ? [node('source', [], {})] : []), node('target', predecessor ? ['source'] : [],
      preconditions === null ? {} : { executionPreconditions: preconditions },
      ['DECLARED_RESULT', ...(window ? [executionWindowAcceptance('target', window)] : [])])],
    obligations: [{ obligationId: 'close', trigger: 'ALWAYS', targetRequirementId: 'primary', nodeId: null,
      action: 'CLOSE_EXISTING_OPERATION', input: {}, deadline: DEADLINE }],
    zeroInternalOps: { staffTouchLimit: 0, humanQueueFallback: false } };
}

// Local adapters exercise the real durable journal and route runner. They are
// fixture state machines, not observations or capacity from real providers.
function fixture(t, options = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-precondition-runtime-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const input = programInput(options); options.mutateInput?.(input);
  const program = (options.kind === 'TRANSACTION' ? compileExecutionOnlyProgramV3 : compileOutcomeProgramV1)(input);
  let now = NOW, ready = true;
  const calls = [], behavior = {};
  const evidence = context => ({ schema: EFFECT_PRECONDITION_EVIDENCE_SCHEMA,
    bindingHash: context.preconditionBinding.bindingHash, observedAt: now,
    facts: [{ predicateId: 'stateReady', valueType: 'boolean', value: ready,
      evidenceHash: digest({ fixture: true, observedAt: now, ready }) }] });
  const adapters = Object.fromEntries(program.requirements.map(requirement => [requirement.requirementId, {
    providerRef: `fixture-${requirement.requirementId}`, supportsResumeOnly: true,
    reserve(context) {
      calls.push({ phase: 'reserve', id: requirement.requirementId, context });
      return { status: options.kind === 'TRANSACTION'
        ? requirement.role === 'PRIMARY' ? 'READY_FOR_TRANSACTION' : 'READY_ON_DEMAND' : 'RESERVED',
      reservationId: context.operationId, validUntil: VALID_UNTIL,
      ...(options.kind === 'TRANSACTION' ? { capacityReserved: false } : {}),
      providerReceipt: { fixture: true, transactionSubmitted: false } };
    },
    execute(context) { calls.push({ phase: 'execute', id: requirement.requirementId, context });
      return behavior.execute?.(context) ?? { status: 'SUCCEEDED', receipt: { fixture: true } }; },
    observe(context) { calls.push({ phase: 'observe', id: requirement.requirementId, context });
      return { status: 'SATISFIED', observedAt: now }; },
    observePreconditions(context) { calls.push({ phase: 'precondition', id: requirement.requirementId, context });
      return behavior.observePreconditions ? behavior.observePreconditions(context) : evidence(context); },
    release: () => ({ status: 'CLOSED' }), closeObligation: () => ({ status: 'CLOSED' }),
  }]));
  const bindings = Object.fromEntries(program.requirements.map(requirement => [requirement.requirementId,
    { adapterId: requirement.requirementId, providerRef: `fixture-${requirement.requirementId}` }]));
  const create = () => createDurableOutcomeProgramOrchestratorV1({ directory, adapters,
    clock: () => behavior.clock ? behavior.clock(now) : now,
    measureOperations: () => ({ outsiderStaffTouchCount: 0, humanQueueCreated: false, source: 'LOCAL_RUNTIME_FIXTURE' }) });
  const bytes = () => readFileSync(path.join(directory, readdirSync(directory).find(name => name.endsWith('.events.jsonl'))), 'utf8');
  return { input, program, directory, calls, adapters, bindings, behavior, create, evidence, bytes,
    setNow(value) { now = value; }, setReady(value) { ready = value; },
    run: () => create().run(program, { bindings }), resume: () => create().resume(program.programId),
    events: () => bytes().trim().split('\n').map(JSON.parse),
    reads: () => calls.filter(row => row.phase === 'precondition'),
    effects: (nodeId = 'target', route) => calls.filter(row => row.phase === 'execute'
      && row.context.node.nodeId === nodeId && (!route || row.context.route === route)) };
}

test('a next-day transaction rechecks state despite historical dependency success and resumes the same order', async t => {
  const f = fixture(t, { kind: 'TRANSACTION', predecessor: true,
    window: { notBefore: at(DAY), latestStartAt: at(DAY + 60000) } });
  const waiting = await f.run();
  assert.equal(waiting.state, 'PAUSED_RETRYABLE'); assert.equal(waiting.retry.phase, 'EXECUTION_WINDOW');
  assert.equal(f.effects('source').length, 1); assert.equal(f.reads().length, 0);
  f.setNow(at(DAY)); f.setReady(false);
  const stopped = await f.resume();
  assert.equal(stopped.state, 'PAUSED_RETRYABLE'); assert.equal(stopped.retry.phase, 'EXECUTION_PRECONDITION');
  assert.equal(stopped.retry.observationStatus, 'NOT_SATISFIED'); assert.equal(f.effects().length, 0);
  assert.equal(stopped.nodes.source.witness.status, 'SATISFIED');
  assert.equal(f.create().inspect(f.program.programId).retry.observationStatus, 'NOT_SATISFIED');
  f.setNow(at(DAY + 1000)); f.setReady(true);
  const completed = await f.resume();
  assert.equal(completed.state, 'SUCCEEDED'); assert.equal(completed.programHash, f.program.programHash);
  assert.equal(f.effects('source').length, 1); assert.equal(f.effects().length, 1);
  assert.notEqual(f.reads()[0].context.operationId, f.reads()[1].context.operationId);
  assert.equal(f.effects()[0].context.preconditionEvidence.observation.pointObservationOnly, true);
  assert.equal(f.effects()[0].context.preconditionEvidence.observation.atomicCheckAndAct, false);
});

test('a restart between a successful read and effect intent requires a fresh occurrence inside the start window', async t => {
  const f = fixture(t, { window: { notBefore: at(DAY), latestStartAt: at(DAY + 60000) } });
  assert.equal((await f.run()).retry.phase, 'EXECUTION_WINDOW'); assert.equal(f.reads().length, 0);
  f.setNow(at(DAY));
  f.behavior.observePreconditions = context => {
    let ticks = 0;
    f.behavior.clock = now => { if (++ticks === 2) throw new Error('INJECTED_PROCESS_STOP_BEFORE_EFFECT_INTENT'); return now; };
    return f.evidence(context);
  };
  await assert.rejects(f.resume(), /INJECTED_PROCESS_STOP_BEFORE_EFFECT_INTENT/);
  assert.equal(f.events().filter(row => row.eventType === 'NODE_PRECONDITION_COMPLETED').length, 1);
  assert.equal(f.events().some(row => row.eventType === 'NODE_EFFECT_REQUESTED'), false);
  assert.equal(f.create().inspect(f.program.programId).state, 'PAUSED_RETRYABLE');
  delete f.behavior.clock; delete f.behavior.observePreconditions; f.setReady(false); f.setNow(at(DAY + 1000));
  const stopped = await f.resume();
  assert.equal(stopped.retry.observationStatus, 'NOT_SATISFIED'); assert.equal(f.effects().length, 0);
  assert.equal(f.reads().length, 2); assert.notEqual(f.reads()[0].context.operationId, f.reads()[1].context.operationId);
});

test('a declared recovery route gets its own fresh check and cannot reuse the primary pass', async t => {
  const f = fixture(t);
  f.behavior.execute = context => {
    if (context.route === 'PRIMARY') { f.setReady(false); return { status: 'FAILED', reason: 'CONFIRMED_FIXTURE_FAILURE' }; }
    return { status: 'SUCCEEDED' };
  };
  const stopped = await f.run();
  assert.equal(stopped.state, 'PAUSED_RETRYABLE'); assert.equal(stopped.retry.route, 'RECOVERY');
  assert.deepEqual(f.reads().map(row => row.context.route), ['PRIMARY', 'RECOVERY']);
  assert.equal(f.effects('target', 'PRIMARY').length, 1); assert.equal(f.effects('target', 'RECOVERY').length, 0);
  f.setReady(true); f.setNow(at(1000));
  assert.equal((await f.resume()).state, 'SUCCEEDED');
  assert.equal(f.effects('target', 'PRIMARY').length, 1); assert.equal(f.effects('target', 'RECOVERY').length, 1);
  assert.deepEqual(f.reads().map(row => row.context.observationOccurrence), [1, 1, 2]);
});

test('an ambiguous effect reconciles its existing operation even if the precondition interface disappears', async t => {
  const f = fixture(t), providerLedger = new Set(); let attempts = 0;
  f.behavior.execute = context => {
    if (++attempts === 1) { providerLedger.add(context.operationId); throw new Error('RESPONSE_LOST_AFTER_FIXTURE_ACCEPTANCE'); }
    assert.equal(context.resumeOnly, true); assert.ok(providerLedger.has(context.operationId));
    return { status: 'SUCCEEDED', receipt: { sameOperationReconciled: true } };
  };
  assert.equal((await f.run()).state, 'PAUSED_RETRYABLE');
  delete f.adapters.read.observePreconditions; f.setReady(false); f.setNow(at(1000));
  assert.equal((await f.resume()).state, 'SUCCEEDED');
  assert.equal(providerLedger.size, 1); assert.equal(f.reads().length, 1);
  assert.equal(f.effects().length, 2);
  assert.equal(f.effects()[0].context.operationId, f.effects()[1].context.operationId);
  assert.equal(f.events().filter(row => row.eventType === 'NODE_EFFECT_REQUESTED').length, 1);
});

test('an intent recorded before any provider send cannot become a first send on replay', async t => {
  const f = fixture(t); let providerSends = 0;
  f.behavior.execute = () => { throw new Error('INJECTED_STOP_BEFORE_PROVIDER_SEND'); };
  assert.equal((await f.run()).state, 'PAUSED_RETRYABLE');
  assert.equal(f.events().filter(row => row.eventType === 'NODE_EFFECT_REQUESTED').length, 1);
  f.setReady(false); f.setNow(at(1000)); delete f.adapters.primary.supportsResumeOnly;
  const paused = await f.resume();
  assert.equal(paused.retry.reason, 'PRECONDITION_EFFECT_RECONCILIATION_REQUIRED');
  assert.equal(f.effects().length, 1); assert.equal(f.reads().length, 1);
  f.adapters.primary.supportsResumeOnly = true;
  f.behavior.execute = context => {
    if (context.resumeOnly !== true) providerSends++;
    assert.equal(context.resumeOnly, true);
    throw new Error('RESUME_ONLY_OPERATION_HAS_NO_PROVIDER_RECEIPT');
  };
  assert.equal((await f.resume()).state, 'PAUSED_RETRYABLE');
  assert.equal(providerSends, 0); assert.equal(f.effects().length, 2); assert.equal(f.reads().length, 1);
});

test('thrown reads reuse the unfinished operation but stale replayed evidence cannot authorize execution', async t => {
  const f = fixture(t); let reads = 0;
  f.behavior.observePreconditions = context => {
    if (++reads === 1) throw new Error('PRIVATE_OBSERVER_ERROR_MUST_NOT_ENTER_JOURNAL');
    const evidence = f.evidence(context);
    if (reads === 2) evidence.observedAt = NOW;
    return evidence;
  };
  assert.equal((await f.run()).retry.reason, 'PRECONDITION_OBSERVATION_UNAVAILABLE');
  assert.equal(f.events().filter(row => row.eventType === 'NODE_PRECONDITION_COMPLETED').length, 0);
  assert.equal(f.bytes().includes('PRIVATE_OBSERVER_ERROR_MUST_NOT_ENTER_JOURNAL'), false);
  f.setNow(at(1000));
  assert.equal((await f.resume()).retry.reason, 'EVIDENCE_PREDATES_OBSERVATION');
  assert.equal(f.reads()[0].context.operationId, f.reads()[1].context.operationId);
  assert.equal(f.effects().length, 0);
  f.setNow(at(2000)); assert.equal((await f.resume()).state, 'SUCCEEDED');
  assert.notEqual(f.reads()[1].context.operationId, f.reads()[2].context.operationId);
  assert.equal(f.effects().length, 1);
});

test('missing explicit observer support pauses before reservation and ordinary observe never substitutes', async t => {
  const f = fixture(t), observePreconditions = f.adapters.read.observePreconditions;
  delete f.adapters.read.observePreconditions;
  const stopped = await f.run();
  assert.equal(stopped.state, 'PAUSED_RETRYABLE'); assert.equal(stopped.retry.reason, 'PRECONDITION_OBSERVER_INTERFACE_UNAVAILABLE');
  assert.equal(f.calls.length, 0);
  f.adapters.read.observePreconditions = observePreconditions;
  assert.equal((await f.resume()).state, 'SUCCEEDED'); assert.equal(f.effects().length, 1);
  const bad = programInput({ preconditions: contract({ observerRequirementId: 'primary' }) });
  assert.throws(() => compileOutcomeProgramV1(bad), /EFFECT_PRECONDITION_OBSERVER_REQUIREMENT_INVALID/);
});

test('an explicitly shared observer provider is rejected as independent precondition evidence', async t => {
  const f = fixture(t); f.bindings.read.providerRef = f.bindings.primary.providerRef;
  const stopped = await f.run();
  assert.equal(stopped.retry.reason, 'PRECONDITION_OBSERVER_NOT_INDEPENDENT'); assert.equal(f.calls.length, 0);
});

test('new contracts require resume-only executors and reject known observer aliases under string bindings', async t => {
  for (const [name, mutate, reason] of [
    ['undeclared primary replay safety', f => { delete f.adapters.primary.supportsResumeOnly; }, 'PRECONDITION_RESUME_ONLY_REQUIRED'],
    ['undeclared recovery replay safety', f => { delete f.adapters.recovery.supportsResumeOnly; }, 'PRECONDITION_RESUME_ONLY_REQUIRED'],
    ['same adapter object', f => { f.adapters.read = f.adapters.primary; }, 'PRECONDITION_OBSERVER_NOT_INDEPENDENT'],
    ['same known actual provider', f => { f.adapters.read.providerRef = f.adapters.primary.providerRef; }, 'PRECONDITION_OBSERVER_NOT_INDEPENDENT'],
  ]) await t.test(name, async child => {
    const f = fixture(child);
    for (const id of Object.keys(f.bindings)) f.bindings[id] = id;
    mutate(f);
    assert.equal((await f.run()).retry.reason, reason); assert.equal(f.calls.length, 0);
  });
});

test('short retries and their successors progress beside a long precondition wait without an execution window', async t => {
  const f = fixture(t, { mutateInput(input) {
    input.nodes[0].input.executionPreconditions.retryIntervalMs = 3600000;
    input.nodes.push({ ...structuredClone(input.nodes[0]), nodeId: 'fast',
      input: { executionPreconditions: contract() } });
    input.nodes.push({ ...structuredClone(input.nodes[0]), nodeId: 'consumer', dependsOn: ['fast'], input: {} });
  } });
  f.setReady(false);
  const waiting = await f.run();
  assert.equal(waiting.retry.subjectId, 'fast'); assert.equal(waiting.retry.retryAfter, at(1000));
  assert.equal(f.create().inspect(f.program.programId).retry.subjectId, 'fast');
  f.setNow(at(1000));
  f.behavior.observePreconditions = context => {
    const evidence = f.evidence(context);
    if (context.node.nodeId === 'fast') evidence.facts[0].value = true;
    return evidence;
  };
  const advanced = await f.resume();
  assert.equal(advanced.state, 'PAUSED_RETRYABLE'); assert.equal(advanced.retry.subjectId, 'target');
  assert.equal(f.effects('fast').length, 1); assert.equal(f.effects('consumer').length, 1); assert.equal(f.effects('target').length, 0);
});

test('a slow observation cannot permit a new effect after its latest start or completion deadline', async t => {
  for (const [name, options, after, reason] of [
    ['latest start', { window: { notBefore: NOW, latestStartAt: at(1000) } }, at(1001), 'EXECUTION_LATEST_START_MISSED'],
    ['completion', {}, DEADLINE, 'EXECUTION_COMPLETION_DEADLINE_PASSED'],
  ]) await t.test(name, async child => {
    const f = fixture(child, options);
    f.behavior.observePreconditions = context => { f.setNow(after); return f.evidence(context); };
    const stopped = await f.run();
    assert.equal(stopped.state, 'FAILED_CLOSED'); assert.equal(f.effects().length, 0);
    assert.equal(stopped.nodes.target.primary.reason, reason); assert.equal(stopped.nodes.target.primary.effectNotDispatched, true);
    assert.equal(f.events().some(row => row.eventType === 'NODE_EFFECT_REQUESTED'), false);
  });
});

test('programs without the explicit contract preserve their original adapter calls and journal shape', async t => {
  const f = fixture(t, { preconditions: null }); delete f.adapters.read.observePreconditions;
  assert.equal((await f.run()).state, 'SUCCEEDED');
  assert.equal(f.reads().length, 0); assert.equal(f.effects().length, 1);
  assert.equal(Object.hasOwn(f.effects()[0].context, 'preconditionEvidence'), false);
  assert.equal(Object.hasOwn(f.effects()[0].context, 'resumeOnly'), false);
  assert.equal(f.events().some(row => row.eventType.startsWith('NODE_PRECONDITION')), false);
  assert.equal(Object.hasOwn(f.create().inspect(f.program.programId).nodes.target, 'executionPreconditions'), false);
});

test('an explicitly accepted continuation gets fresh original preconditions; a lost reply only reconciles that same operation', async t => {
  const f = fixture(t, { kind: 'TRANSACTION', mutateInput(input) {
    input.requirements.find(row => row.requirementId === 'primary').constraints.executionContinuationContract
      = 'AUTHORIZED_ORIGINAL_REQUIREMENT_CONTINUATION_V1';
  } });
  let next = null, workAccepted = false, completedOperation = null;
  const continuations = [];
  f.adapters.read.observe = () => ({ status: workAccepted ? 'SATISFIED' : 'INCONCLUSIVE',
    observedAt: at(0), ...(workAccepted ? {} : { retryAfter: at(1000) }) });
  f.adapters.primary.pendingContinuation = () => next;
  f.adapters.primary.executeContinuation = context => {
    continuations.push(context);
    if (completedOperation) { assert.equal(context.operationId, completedOperation); assert.equal(context.resumeOnly, true); return { status: 'SUCCEEDED' }; }
    assert.equal(context.preconditionEvidence.observation.status, 'SATISFIED');
    completedOperation = context.operationId; throw new Error('Fixture accepted continuation response lost');
  };
  assert.equal((await f.run()).state, 'PAUSED_RETRYABLE');
  assert.equal(f.effects().length, 1); assert.equal(f.reads().length, 1);
  next = { continuationId: 'accepted_revision_1', authorizationHash: digest('fixture exact additional acceptance'), inputHash: digest('fixture continuation') };
  f.setReady(false); f.setNow(at(2000));
  const blocked = await f.resume();
  assert.equal(blocked.state, 'PAUSED_RETRYABLE'); assert.equal(blocked.retry.phase, 'EXECUTION_PRECONDITION');
  assert.equal(continuations.length, 0); assert.equal(f.reads().length, 2);
  f.setReady(true); f.setNow(at(3000));
  assert.equal((await f.resume()).state, 'PAUSED_RETRYABLE');
  assert.equal(continuations.length, 1); assert.equal(f.reads().length, 3);
  f.setReady(false); f.setNow(at(4000)); workAccepted = true;
  const completed = await f.resume();
  assert.equal(completed.state, 'SUCCEEDED'); assert.equal(completed.programHash, f.program.programHash);
  assert.equal(continuations.length, 2); assert.equal(f.effects().length, 1); assert.equal(f.reads().length, 3);
  assert.equal(new Set(continuations.map(row => row.operationId)).size, 1);
  const requests = f.events().filter(row => row.eventType === 'NODE_CONTINUATION_REQUESTED');
  assert.equal(requests.length, 1); assert.deepEqual(requests[0].payload.continuation, next);
  assert.equal(f.events().filter(row => row.eventType === 'NODE_CONTINUATION_COMPLETED').length, 1);
  assert.equal(f.events().filter(row => row.eventType === 'NODE_EFFECT_COMPLETED').length, 1);
});
