import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { canonicalizeStrict } from '../src/canonical.js';
import { createSharedAgentLayer } from '../src/outsider-shared-agent-layer.js';
import { createSharedAgentClient, runSharedGoalWorker } from '../src/outsider-shared-agent-client.js';
import { runSharedGoalsDemo, startSharedGoalsPage } from '../examples/shared-goals.mjs';

const digest = value => `sha256:${createHash('sha256').update(canonicalizeStrict(value)).digest('hex')}`;
const definition = (goalId, tasks = [{ taskId: 'edit', title: 'Edit page', dependsOn: [], resourceIds: ['page'] }]) =>
  ({ goalId, goal: `Achieve ${goalId}`, completionDeadline: '2026-10-27T13:00:00Z', tasks });
const identity = claim => ({ actorId: claim.actorId, taskId: claim.task.taskId, leaseId: claim.leaseId, generation: claim.generation });
function fixture(t, options = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-agent-layer-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let now = Date.parse('2026-10-27T12:00:00Z'), state = { heading: 'Original' }, writes = 0, loseReply = false, highestFence = 0;
  const receipts = new Map();
  const adapter = {
    async observe() { return structuredClone(state); },
    async execute({ action, operationId, expectedStateHash, fencingToken }) {
      if (receipts.has(operationId)) return receipts.get(operationId);
      if (expectedStateHash !== digest(state) || fencingToken < highestFence) return { status: 'NOT_APPLIED' };
      highestFence = fencingToken; state = { heading: action.heading }; writes++;
      const result = { status: 'APPLIED', operationId }; receipts.set(operationId, result);
      if (loseReply) throw new Error('provider reply lost'); return result;
    },
    async reconcile({ operationId }) { return receipts.get(operationId) ?? { status: 'NOT_APPLIED' }; },
  };
  const authorize = ({ actorId, operation }) => ['CREATE_GOAL', 'ACTIVATE_GOAL'].includes(operation)
    ? actorId === 'owner' : ['owner', 'personal-agent', 'company-agent', 'coding-agent'].includes(actorId);
  const create = () => createSharedAgentLayer({ directory, authorize,
    verifyTask: async ({ output, effects }) => ({ accepted: output.ok === true
      && Object.values(effects).every(effect => effect.status === 'APPLIED') }),
    verifyGoal: async () => ({ accepted: true }), resources: { page: { adapter } }, clock: () => now, ...options });
  let layer = create();
  const start = async goal => { const coordinator = layer.goal(goal.goalId);
    const proposed = await coordinator.create({ actorId: 'owner', goal });
    await coordinator.activate({ actorId: 'owner', programHash: proposed.programHash }); return coordinator; };
  const command = async (coordinator, claim, stepId = 'edit-once', heading = 'Updated') => {
    const work = { ...identity(claim), resourceId: 'page' }, observed = await coordinator.observeResource(work);
    return coordinator.performResource({ ...work, stepId, action: { heading },
      expectedVersion: observed.version, expectedStateHash: observed.stateHash });
  };
  const http = async () => {
    const server = createServer(layer.handler({ authenticate: request => {
      const token = request.headers.authorization?.replace(/^Bearer /u, '');
      return ['owner', 'personal-agent', 'company-agent', 'coding-agent'].includes(token) ? token : null;
    } }));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    t.after(() => new Promise(resolve => server.close(resolve)));
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { origin, client: token => createSharedAgentClient({ origin, token }), server };
  };
  return { directory, adapter, start, command, http, get layer() { return layer; }, get writes() { return writes; },
    get state() { return state; }, advance(ms) { now += ms; }, loseReply() { loseReply = true; },
    restart() { layer = create(); return layer; } };
}

test('different provider clients coordinate one DAG over real HTTP; the owner authenticates each actor', async t => {
  const f = fixture(t), transport = await f.http(), owner = transport.client('owner');
  const goal = definition('shared-http', [
    { taskId: 'brief', title: 'Personal brief', dependsOn: [], allowedActorIds: ['personal-agent'] },
    { taskId: 'terms', title: 'Company terms', dependsOn: [], allowedActorIds: ['company-agent'] },
    { taskId: 'integrate', title: 'Integrate both', dependsOn: ['brief', 'terms'], allowedActorIds: ['coding-agent'] },
  ]);
  const proposed = await owner.createGoal(goal);
  await owner.goal(goal.goalId).activate({ programHash: proposed.programHash });
  const outcomes = await Promise.all(['personal-agent', 'company-agent', 'coding-agent'].map(actor => runSharedGoalWorker({
    goal: transport.client(actor).goal(goal.goalId), executeTask: async ({ task, inputs }) => {
      if (task.taskId === 'integrate') assert.deepEqual(Object.keys(inputs).sort(), ['brief', 'terms']);
      return { ok: true, by: actor };
    },
  })));
  assert.ok(outcomes.every(result => result.state === 'SUCCEEDED'));
  assert.equal((await owner.listGoals()).goals.length, 1);
  await assert.rejects(transport.client('not-authenticated').listGoals(), error => error.statusCode === 401);
  const spoof = await fetch(`${transport.origin}/v1/goals`, { method: 'POST', headers: {
    authorization: 'Bearer personal-agent', 'content-type': 'application/json' },
  body: JSON.stringify({ actorId: 'owner', goal: definition('spoofed', []) }) });
  assert.equal(spoof.status, 403);
});

test('resource effects and active task claims compose; replay does not apply a write twice', async t => {
  const f = fixture(t), coordinator = await f.start(definition('composed'));
  const claim = (await coordinator.claim({ actorId: 'personal-agent' })).claim;
  const observed = await coordinator.observeResource({ ...identity(claim), resourceId: 'page' });
  const command = { ...identity(claim), resourceId: 'page', stepId: 'write', action: { heading: 'Updated' },
    expectedVersion: observed.version, expectedStateHash: observed.stateHash };
  assert.equal((await coordinator.performResource(command)).status, 'APPLIED');
  assert.equal((await coordinator.performResource(command)).status, 'APPLIED'); assert.equal(f.writes, 1);
  const status = await coordinator.inspect({ actorId: 'owner' });
  assert.equal(Object.hasOwn(status.tasks[0].effects.write, 'resourceLease'), false);
  assert.equal((await coordinator.complete({ ...identity(claim), submissionId: 'done', output: { ok: true } })).accepted, true);
  assert.equal((await coordinator.inspect({ actorId: 'owner' })).state, 'SUCCEEDED');
  await assert.rejects(coordinator.performResource(command), /CLAIM_LOST/);
});

test('a replacement worker reconciles the old operation after a lost reply and owner restart', async t => {
  const f = fixture(t), coordinator = await f.start(definition('restart'));
  const first = (await coordinator.claim({ actorId: 'personal-agent', ttlMs: 100 })).claim;
  f.loseReply();
  assert.equal((await f.command(coordinator, first)).status, 'RECONCILIATION_REQUIRED');
  await assert.rejects(coordinator.complete({ ...identity(first), submissionId: 'early', output: { ok: true } }), /RESOURCE_RECONCILIATION_REQUIRED/);
  f.advance(101); const restarted = f.restart().goal('restart');
  const next = (await restarted.claim({ actorId: 'company-agent' })).claim;
  assert.ok(next.generation > first.generation);
  assert.equal(next.effects['edit-once'].status, 'RECONCILIATION_REQUIRED');
  await assert.rejects(f.command(coordinator, first, 'late'), /CLAIM_LOST/);
  const result = await restarted.reconcileResource({ ...identity(next), resourceId: 'page', stepId: 'edit-once' });
  assert.equal(result.status, 'APPLIED'); assert.equal(f.writes, 1);
  await restarted.complete({ ...identity(next), submissionId: 'resolved', output: { ok: true } });
  assert.equal((await restarted.inspect({ actorId: 'owner' })).state, 'SUCCEEDED');
});

test('multiple goals share the same resource gateway and stale observations cannot overwrite another goal', async t => {
  const f = fixture(t), first = await f.start(definition('first-goal')), second = await f.start(definition('second-goal'));
  const a = (await first.claim({ actorId: 'personal-agent' })).claim;
  const b = (await second.claim({ actorId: 'company-agent' })).claim;
  const stale = await second.observeResource({ ...identity(b), resourceId: 'page' });
  await f.command(first, a, 'first-write', 'First goal');
  const rejected = await second.performResource({ ...identity(b), resourceId: 'page', stepId: 'stale-write',
    action: { heading: 'Wrong' }, expectedVersion: stale.version, expectedStateHash: stale.stateHash });
  assert.equal(rejected.status, 'NOT_DISPATCHED'); assert.match(rejected.receipt.reason, /STALE_STATE/);
  assert.equal(f.state.heading, 'First goal'); assert.equal(f.writes, 1);
  const applied = await f.command(second, b, 'refreshed-write', 'Second goal after first');
  assert.equal(applied.status, 'APPLIED'); assert.equal(f.writes, 2);
});

test('an unresolved resource effect in one goal blocks a different goal until the original is reconciled', async t => {
  const f = fixture(t), first = await f.start(definition('uncertain')), second = await f.start(definition('contender'));
  const a = (await first.claim({ actorId: 'personal-agent' })).claim;
  const b = (await second.claim({ actorId: 'company-agent' })).claim;
  f.loseReply(); await f.command(first, a);
  const blocked = await f.command(second, b);
  assert.equal(blocked.status, 'NOT_DISPATCHED'); assert.match(blocked.receipt.reason, /RECONCILIATION_REQUIRED/);
  assert.equal(f.writes, 1);
  await first.reconcileResource({ ...identity(a), resourceId: 'page', stepId: 'edit-once' });
  const next = await f.command(second, b, 'after-resolution');
  assert.equal(next.status, 'RECONCILIATION_REQUIRED'); assert.equal(f.writes, 2);
});

test('work on independent resources runs concurrently outside the goal lock', async t => {
  let entered = 0, release;
  const bothEntered = new Promise(resolve => { release = resolve; });
  const adapter = { observe: async () => ({ ready: true }), reconcile: async () => ({ status: 'APPLIED' }),
    execute: async () => { if (++entered === 2) release(); await bothEntered; return { status: 'APPLIED' }; } };
  const f = fixture(t, { resources: { page: { adapter }, device: { adapter } } });
  const coordinator = await f.start(definition('parallel', [
    { taskId: 'a', title: 'Page', dependsOn: [], resourceIds: ['page'] },
    { taskId: 'b', title: 'Device', dependsOn: [], resourceIds: ['device'] },
  ]));
  const a = (await coordinator.claim({ actorId: 'personal-agent', taskId: 'a' })).claim;
  const b = (await coordinator.claim({ actorId: 'company-agent', taskId: 'b' })).claim;
  const perform = async (claim, resourceId) => {
    const work = { ...identity(claim), resourceId }, observed = await coordinator.observeResource(work);
    return coordinator.performResource({ ...work, stepId: 'run', action: { do: 'work' },
      expectedVersion: observed.version, expectedStateHash: observed.stateHash });
  };
  const operations = Promise.all([perform(a, 'page'), perform(b, 'device')]);
  await Promise.race([bothEntered, delay(3000).then(() => { release(); throw new Error('RESOURCE_WORK_WAS_SERIALIZED'); })]);
  assert.ok((await operations).every(result => result.status === 'APPLIED')); assert.equal(entered, 2);
});

test('a task cannot access a resource outside its declared scope or reuse a step for another action', async t => {
  const f = fixture(t), coordinator = await f.start(definition('scoped'));
  const claim = (await coordinator.claim({ actorId: 'personal-agent' })).claim;
  await assert.rejects(coordinator.observeResource({ ...identity(claim), resourceId: 'other' }), /RESOURCE_NOT_ALLOWED/);
  await f.command(coordinator, claim);
  await assert.rejects(f.command(coordinator, claim, 'edit-once', 'Changed action'), /RESOURCE_STEP_CONFLICT/);
});

test('the HTTP worker renews through task work and slow verification while other workers poll', async t => {
  const f = fixture(t, { clock: Date.now, verifyTask: async () => { await delay(850); return { accepted: true }; } }), transport = await f.http();
  const owner = transport.client('owner'), goalId = 'long-work';
  const proposed = await owner.createGoal({ ...definition(goalId, [{ taskId: 'work', title: 'Long work', dependsOn: [] }]),
    completionDeadline: new Date(Date.now() + 30_000).toISOString() });
  await owner.goal(goalId).activate({ programHash: proposed.programHash });
  const worker = runSharedGoalWorker({ goal: transport.client('personal-agent').goal(goalId), ttlMs: 600,
    executeTask: async ({ signal }) => { await delay(350, undefined, { signal }); return { ok: true }; } });
  await delay(700);
  assert.equal((await transport.client('company-agent').goal(goalId).claim()).claim, null);
  assert.equal((await worker).state, 'SUCCEEDED');
});

test('the worker signals ownership loss instead of completing a task after handoff', async t => {
  const f = fixture(t, { clock: Date.now }), transport = await f.http(), owner = transport.client('owner');
  const goalId = 'handoff-signal', personal = transport.client('personal-agent').goal(goalId);
  const proposed = await owner.createGoal({ ...definition(goalId, [{ taskId: 'work', title: 'Work', dependsOn: [] }]),
    completionDeadline: new Date(Date.now() + 30_000).toISOString() });
  await owner.goal(goalId).activate({ programHash: proposed.programHash });
  let next;
  await assert.rejects(runSharedGoalWorker({ goal: personal, ttlMs: 600,
    executeTask: async claim => {
      await personal.abandon(identity(claim));
      next = (await transport.client('company-agent').goal(goalId).claim()).claim;
      await delay(2000, undefined, { signal: claim.signal });
      throw new Error('STALE_WORKER_WAS_NOT_CANCELLED');
    } }), error => error.name === 'AbortError' || error.code === 'SHARED_GOAL_CLAIM_LOST');
  assert.equal(next.actorId, 'company-agent');
  assert.equal((await owner.goal(goalId).inspect()).tasks[0].actorId, 'company-agent');
});

test('four separate worker processes from three roles operate on one actual page toward two goals', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-mutual-demo-test-'));
  const runtime = await startSharedGoalsPage({ directory });
  t.after(async () => { await runtime.close(); rmSync(directory, { recursive: true, force: true }); });
  const result = await runSharedGoalsDemo(runtime);
  assert.equal(result.workers.length, 4); assert.ok(result.workers.every(worker => worker.state === 'SUCCEEDED'));
  assert.equal(result.goals.length, 2); assert.ok(result.goals.every(goal => goal.state === 'SUCCEEDED'));
  assert.equal(result.writes, 4); assert.ok(result.reconciliations >= 1);
  const page = await (await fetch(runtime.origin)).text();
  assert.match(page, /Built together, with Outsider/); assert.match(page, /Published/);
  assert.match(page, /Personal \+ company \+ coding agents/);
});
