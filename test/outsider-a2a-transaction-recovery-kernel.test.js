import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { compileOutcomeProgramV1, compileExecutionOnlyProgramV2, compileExecutionOnlyProgramV3,
  compileExecutionOnlyProgramV4, verifyExecutableOutcomeProgram, OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA }
  from '../src/outsider-outcome-program-v1.js';
import { createDurableOutcomeProgramOrchestratorV1 } from '../src/outsider-durable-outcome-program-orchestrator-v1.js';
import { executionWindowAcceptance } from '../src/outsider-execution-windows.js';
import { publicDatasetHash as digest } from '../src/outsider-public-dataset.js';

const NOW = '2026-09-08T12:00:00.000Z', DEADLINE = '2026-09-08T13:00:00.000Z';
const VALID_UNTIL = '2026-09-08T14:00:00.000Z';
const INPUT = digest({ parts: [{ data: { task: 'public-fixture' } }] });
const OUTPUT = digest({ minimumParts: 1, acceptedPartKinds: ['data'], expected: { usable: true } });
const PRIMARY = digest({ connection: 'fixture-primary' }), RECOVERY = digest({ connection: 'fixture-recovery' });
const SKILL = { agent_task: digest({ skill: 'primary' }), agent_task_recovery: digest({ skill: 'backup' }) };

function programInput({ recovery = true, window } = {}) {
  const contract = { schema: 'outsider/a2a-task-recovery-contract/v1', trigger: 'PRIMARY_CONFIRMED_FAILURE',
    maximumRecoveryAttempts: 1, primaryConnectionHash: PRIMARY, recoveryConnectionHash: RECOVERY,
    inputContractHash: INPUT, outputRequirementHash: OUTPUT };
  const executors = [
    { requirementId: 'agent_task', role: 'PRIMARY', connectionHash: PRIMARY },
    ...(recovery ? [{ requirementId: 'agent_task_recovery', role: 'RECOVERY', connectionHash: RECOVERY }] : []) ];
  return { programId: 'a2a_recovery_fixture', orderId: 'original_fixture_order', createdAt: NOW,
    formationDeadline: '2026-09-08T12:30:00.000Z', completionDeadline: DEADLINE, tenderHash: null,
    commitmentMode: 'EXECUTION_ONLY_NO_OUTCOME_PROMISE',
    outcome: { statement: 'Accept one exact fixture artifact in the original order', budget: { currency: 'USD', maximumAmountMinor: '0' },
      acceptance: [{ criterionId: 'exact_fixture', comparator: 'CONFIRMED_CAPABILITY_CONTRACT', subject: 'A2A_AGENT_TASK_V1',
        expected: { outputRequirementHash: OUTPUT } }] },
    requirements: [...executors.map(({ requirementId, role, connectionHash }) => ({ requirementId, role,
      capability: 'A2A_AGENT_TASK_V1', minimumReservationMs: 1, dependsOnRequirementIds: [], constraints: {
        admissionMode: 'EXECUTION_PHASE_TRANSACTION', maximumAmountMinor: '0', reservedAgentCapacityRequired: false,
        connectionHash, inputContractHash: INPUT, outputRequirementHash: OUTPUT, skillSelectionHash: SKILL[requirementId] } })),
      { requirementId: 'artifact_read', role: 'INDEPENDENT_WITNESS', capability: 'LOCAL_PERSISTED_A2A_ARTIFACT_READ',
        minimumReservationMs: 1, dependsOnRequirementIds: [], constraints: { admissionMode: 'ON_DEMAND_OBSERVATION' } }],
    nodes: [{ nodeId: 'artifact_available', kind: 'TRANSACTION', dependsOn: [], primaryRequirementId: 'agent_task',
      recoveryRequirementId: recovery ? 'agent_task_recovery' : null, witnessRequirementId: 'artifact_read',
      input: { publicInputApproved: true, ...(recovery ? { recoveryContract: contract } : {}) },
      acceptance: [OUTPUT, ...(window ? [executionWindowAcceptance('fixture', window)] : [])] }],
    obligations: executors.map(({ requirementId }) => ({ obligationId: `close_${requirementId}`, trigger: 'ALWAYS',
      targetRequirementId: requirementId, nodeId: null, action: 'CLOSE_ATTEMPT_WITHOUT_ERASING_RETURNED_BYTES', input: {}, deadline: DEADLINE })),
    zeroInternalOps: { staffTouchLimit: 0, humanQueueFallback: false } };
}

function fixture(t, options = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-a2a-recovery-kernel-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const input = programInput(options), program = compileExecutionOnlyProgramV4(input), calls = [], observed = [];
  let now = NOW;
  const behavior = { primary: () => ({ status: 'FAILED', reason: 'A2A_TASK_RETURNED_DATA_CONTRACT_NOT_SATISFIED',
    providerReceipt: { fixture: true, artifact: { usable: false }, outputRequirementHash: OUTPUT } }),
    recovery: () => ({ status: 'SUCCEEDED', providerReceipt: { fixture: true, artifact: { usable: true }, outputRequirementHash: OUTPUT } }) };
  const adapters = Object.fromEntries(program.requirements.map(requirement => [requirement.requirementId, {
    providerRef: `fixture-${requirement.requirementId}`, connectionHash: requirement.constraints.connectionHash,
    supportsResumeOnly: true,
    reserve(context) {
      calls.push({ phase: 'reserve', id: requirement.requirementId, operationId: context.operationId });
      if (requirement.role === 'INDEPENDENT_WITNESS') return { status: 'READY_ON_DEMAND',
        reservationId: context.operationId, validUntil: VALID_UNTIL, capacityReserved: false,
        providerReceipt: { fixture: true, independentOutcomeEvidence: false } };
      return options.readiness?.(requirement, context) ?? { status: 'READY_FOR_TRANSACTION',
        reservationId: context.operationId, validUntil: VALID_UNTIL, capacityReserved: false,
        providerReceipt: { transactionSubmitted: false, invocationOnly: true,
          connectionHash: requirement.constraints.connectionHash, skillSelectionHash: requirement.constraints.skillSelectionHash } };
    },
    execute(context) {
      calls.push({ phase: 'execute', id: requirement.requirementId, operationId: context.operationId, context });
      return behavior[requirement.role === 'PRIMARY' ? 'primary' : 'recovery'](context);
    },
    observe(context) {
      observed.push(context);
      assert.equal(context.effectResult.providerReceipt.outputRequirementHash, OUTPUT);
      return { status: context.effectResult.providerReceipt.artifact.usable === true ? 'SATISFIED' : 'NOT_SATISFIED',
        observedAt: now, independentOutcomeEvidence: false };
    },
    release: context => { calls.push({ phase: 'release', id: requirement.requirementId, operationId: context.operationId });
      return { status: 'CLOSED', receipt: { capacityReserved: false, fixture: true } }; },
    closeObligation: () => ({ status: 'CLOSED', receipt: { retainedAttempts: true, fixture: true } }),
  }]));
  const bindings = Object.fromEntries(program.requirements.map(row => [row.requirementId, row.requirementId]));
  const create = () => createDurableOutcomeProgramOrchestratorV1({ directory, adapters, clock: () => now,
    measureOperations: () => ({ outsiderStaffTouchCount: 0, humanQueueCreated: false, source: 'CORE_FIXTURE_ONLY' }) });
  const bytes = () => readFileSync(path.join(directory, readdirSync(directory).find(name => name.endsWith('.events.jsonl'))), 'utf8');
  return { program, input, directory, calls, observed, behavior, adapters, bindings, create,
    setNow(value) { now = value; }, bytes, events: () => bytes().trim().split('\n').map(line => JSON.parse(line)),
    effects: role => calls.filter(row => row.phase === 'execute' && row.context.route === role) };
}

test('V4 freezes both A2A contracts while V1–V3 retain their separate validation and hashes', () => {
  const p = compileExecutionOnlyProgramV4(programInput());
  assert.equal(p.schema, OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA);
  assert.deepEqual(verifyExecutableOutcomeProgram(p), p);
  assert.notEqual(p.requirements[0].constraints.skillSelectionHash, p.requirements[1].constraints.skillSelectionHash);
  assert.throws(() => compileExecutionOnlyProgramV3(programInput()), /TRANSACTION_EXECUTION_SCOPE_INVALID/);
  const oldV3 = compileExecutionOnlyProgramV3(programInput({ recovery: false }));
  assert.deepEqual(verifyExecutableOutcomeProgram(oldV3), oldV3);
  const oldInput = programInput(); oldInput.nodes[0].kind = 'EFFECT'; delete oldInput.nodes[0].input.recoveryContract;
  for (const compile of [compileOutcomeProgramV1, compileExecutionOnlyProgramV2]) {
    const old = compile(oldInput); assert.deepEqual(verifyExecutableOutcomeProgram(old), old);
  }
  for (const mutate of [
    value => { value.requirements[1].constraints.connectionHash = PRIMARY; value.nodes[0].input.recoveryContract.recoveryConnectionHash = PRIMARY; },
    value => { value.requirements[1].constraints.inputContractHash = digest('changed-input'); },
    value => { value.requirements[1].constraints.outputRequirementHash = digest('weaker-output'); },
    value => { value.requirements[1].constraints.maximumAmountMinor = '1'; },
    value => { value.requirements[1].constraints.reservedAgentCapacityRequired = true; },
    value => { value.requirements[1].constraints.skillSelectionHash = 'unbound'; },
    value => { value.requirements[1].capability = 'ARBITRARY_PAYMENT'; },
    value => { value.nodes[0].input.recoveryContract.maximumRecoveryAttempts = 2; },
    value => { delete value.nodes[0].input.recoveryContract; },
    value => { value.nodes[0].recoveryRequirementId = null; },
  ]) { const changed = programInput(); mutate(changed); assert.throws(() => compileExecutionOnlyProgramV4(changed), /A2A_RECOVERY_/); }
  const changed = structuredClone(p); changed.nodes[0].input.recoveryContract.recoveryConnectionHash = PRIMARY;
  assert.throws(() => verifyExecutableOutcomeProgram(changed), /A2A_RECOVERY_CONTRACT_BINDING_INVALID/);
});

test('confirmed V4 failure activates one backup identity; its ambiguous result resumes without erasing the primary', async t => {
  const f = fixture(t), remote = new Map(); let requests = 0, lost = true;
  f.behavior.recovery = context => {
    assert.equal(context.primaryFailure.status, 'FAILED');
    if (!remote.has(context.operationId)) { requests++; remote.set(context.operationId,
      { status: 'SUCCEEDED', providerReceipt: { fixture: true, artifact: { usable: true }, outputRequirementHash: OUTPUT } }); }
    if (lost) { lost = false; throw new Error('A2A_TASK_RESPONSE_UNRESOLVED_RECONCILIATION_REQUIRED'); }
    return remote.get(context.operationId);
  };
  const prepared = await f.create().prepare(f.program, { bindings: f.bindings });
  assert.equal(f.effects('PRIMARY').length + f.effects('RECOVERY').length, 0);
  for (const row of Object.values(prepared.reservations)) assert.equal(row.capacityReserved, false);
  const pending = await f.create().confirmPrepared(f.program.programId, f.program.programHash);
  assert.equal(pending.state, 'PAUSED_RETRYABLE'); assert.equal(pending.retry.phase, 'EXECUTE_RECOVERY');
  assert.equal(pending.nodes.artifact_available.primary.status, 'FAILED'); assert.equal(pending.nodes.artifact_available.recovery, null);
  const prefix = f.bytes(), primaryReceipt = structuredClone(pending.nodes.artifact_available.primary);
  f.adapters.agent_task_recovery.connectionHash = PRIMARY;
  await assert.rejects(f.create().resume(f.program.programId), /A2A_RECOVERY_ADAPTER_CONNECTION_MISMATCH/);
  assert.equal(f.effects('RECOVERY').length, 1, 'restart cannot swap the frozen backup behind its existing operation');
  f.adapters.agent_task_recovery.connectionHash = RECOVERY;
  const finished = await f.create().resume(f.program.programId);
  assert.equal(finished.state, 'SUCCEEDED'); assert.equal(finished.userOutcomePromiseIssued, false);
  assert.deepEqual(finished.nodes.artifact_available.primary, primaryReceipt);
  assert.equal(f.observed[0].effectiveRoute, 'RECOVERY'); assert.equal(requests, 1);
  assert.equal(f.effects('PRIMARY').length, 1); assert.equal(f.effects('RECOVERY').length, 2);
  assert.equal(f.effects('RECOVERY')[0].operationId, f.effects('RECOVERY')[1].operationId);
  assert.notEqual(f.effects('PRIMARY')[0].operationId, f.effects('RECOVERY')[0].operationId);
  assert.equal(f.bytes().startsWith(prefix), true);
  assert.deepEqual(f.events().filter(row => row.eventType === 'NODE_EFFECT_REQUESTED').map(row => row.payload.route), ['PRIMARY', 'RECOVERY']);
  const before = f.bytes(); assert.equal((await f.create().resume(f.program.programId)).state, 'SUCCEEDED');
  assert.equal(f.bytes(), before); assert.equal(requests, 1);
});

test('a running or unknown primary stays on its original operation and never starts the backup', async t => {
  const f = fixture(t); let pending = true;
  f.behavior.primary = () => { if (pending) throw new Error('A2A_TASK_WAITING_FOR_REMOTE_TASK');
    return { status: 'SUCCEEDED', providerReceipt: { fixture: true, artifact: { usable: true }, outputRequirementHash: OUTPUT } }; };
  const result = await f.create().run(f.program, { bindings: f.bindings });
  assert.equal(result.state, 'PAUSED_RETRYABLE'); assert.equal(result.retry.phase, 'EXECUTE_PRIMARY');
  assert.equal(f.effects('RECOVERY').length, 0); pending = false;
  assert.equal((await f.create().resume(f.program.programId)).state, 'SUCCEEDED');
  assert.equal(f.effects('RECOVERY').length, 0); assert.equal(f.observed[0].effectiveRoute, 'PRIMARY');
  assert.equal(f.effects('PRIMARY')[0].operationId, f.effects('PRIMARY')[1].operationId);
});

test('both definite failures close the same order without a third attempt or witness acceptance', async t => {
  const f = fixture(t); f.behavior.recovery = () => ({ status: 'FAILED', reason: 'A2A_TASK_REMOTE_TERMINAL_FAILURE' });
  const result = await f.create().run(f.program, { bindings: f.bindings });
  assert.equal(result.state, 'FAILED_CLOSED'); assert.equal(result.nodes.artifact_available.recovery.status, 'FAILED');
  assert.equal(f.effects('PRIMARY').length, 1); assert.equal(f.effects('RECOVERY').length, 1); assert.equal(f.observed.length, 0);
  const before = f.bytes(); await f.create().resume(f.program.programId); assert.equal(f.bytes(), before);
});

test('a V4 transaction without a preaccepted backup preserves ordinary primary failure behavior', async t => {
  const f = fixture(t, { recovery: false });
  const result = await f.create().run(f.program, { bindings: f.bindings });
  assert.equal(result.state, 'FAILED_CLOSED'); assert.equal(result.nodes.artifact_available.recovery, null);
  assert.equal(f.effects('RECOVERY').length, 0);
});

test('a primary that finishes too late cannot authorize a first backup call outside the original time bounds', async t => {
  for (const [after, window, reason] of [
    ['2026-09-08T12:06:00.000Z', { notBefore: NOW, latestStartAt: '2026-09-08T12:05:00.000Z' }, 'EXECUTION_LATEST_START_MISSED'],
    ['2026-09-08T13:00:00.000Z', undefined, 'EXECUTION_COMPLETION_DEADLINE_PASSED'],
  ]) await t.test(reason, async child => {
    const f = fixture(child, { window });
    f.behavior.primary = () => { f.setNow(after); return { status: 'FAILED', reason: 'A2A_TASK_REMOTE_TERMINAL_FAILURE' }; };
    const result = await f.create().run(f.program, { bindings: f.bindings });
    assert.equal(result.state, 'FAILED_CLOSED'); assert.equal(f.effects('RECOVERY').length, 0);
    assert.equal(result.nodes.artifact_available.recovery.reason, reason);
    assert.equal(result.nodes.artifact_available.recovery.providerCallPerformed, false);
  });
});

test('after the start window an existing primary may only reconcile; its failure cannot dispatch a fresh backup', async t => {
  const f = fixture(t, { window: { notBefore: NOW, latestStartAt: '2026-09-08T12:05:00.000Z' } });
  f.behavior.primary = () => { throw new Error('A2A_TASK_WAITING_FOR_REMOTE_TASK'); };
  assert.equal((await f.create().run(f.program, { bindings: f.bindings })).state, 'PAUSED_RETRYABLE');
  f.setNow('2026-09-08T12:06:00.000Z');
  f.behavior.primary = context => { assert.equal(context.resumeOnly, true); return { status: 'FAILED', reason: 'A2A_TASK_REMOTE_TERMINAL_FAILURE' }; };
  assert.equal((await f.create().resume(f.program.programId)).state, 'FAILED_CLOSED');
  assert.equal(f.effects('PRIMARY')[0].operationId, f.effects('PRIMARY')[1].operationId);
  assert.equal(f.effects('RECOVERY').length, 0);
});

test('a reserved-capacity or wrong-connection receipt cannot satisfy preaccepted zero-reservation readiness', async t => {
  for (const invalid of ['reserved', 'different-connection']) await t.test(invalid, async child => {
    const f = fixture(child, { readiness: (requirement, context) => requirement.role !== 'RECOVERY' ? null
      : { status: invalid === 'reserved' ? 'RESERVED' : 'READY_FOR_TRANSACTION', reservationId: context.operationId,
        validUntil: VALID_UNTIL, capacityReserved: invalid === 'reserved', providerReceipt: { transactionSubmitted: false,
          connectionHash: invalid === 'reserved' ? RECOVERY : PRIMARY, skillSelectionHash: requirement.constraints.skillSelectionHash } } });
    assert.equal((await f.create().run(f.program, { bindings: f.bindings })).state, 'UNAVAILABLE');
    assert.equal(f.effects('PRIMARY').length + f.effects('RECOVERY').length, 0);
  });
});
