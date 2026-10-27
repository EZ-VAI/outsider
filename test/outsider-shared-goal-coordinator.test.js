import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSharedGoalCoordinator } from '../src/outsider-shared-goal-coordinator.js';

function fixture(t, options = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-shared-goal-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let now = Date.parse('2026-10-27T12:00:00Z'), acceptGoal = true;
  const goal = { goalId: 'joint-launch', goal: 'Publish an agreed launch page',
    completionDeadline: '2026-10-27T13:00:00Z', acceptance: ['All contributions accepted'], tasks: [
      { taskId: 'copy', title: 'Write the copy', dependsOn: [], allowedActorIds: ['personal-agent'] },
      { taskId: 'price', title: 'Confirm the price', dependsOn: [], allowedActorIds: ['company-agent'] },
      { taskId: 'publish', title: 'Publish both contributions', dependsOn: ['copy', 'price'] },
    ] };
  const create = () => createSharedGoalCoordinator({ directory,
    authorize: ({ actorId, operation }) => operation === 'CREATE_GOAL' || operation === 'ACTIVATE_GOAL'
      ? actorId === 'owner' : ['owner', 'personal-agent', 'company-agent'].includes(actorId),
    verifyTask: async ({ output }) => ({ accepted: output.ok === true, reason: output.ok === true ? null : 'CORRECT_OUTPUT' }),
    verifyGoal: async ({ outputs }) => ({ accepted: acceptGoal && Object.keys(outputs).length === 3 }),
    clock: () => now, ...options });
  const start = async () => { const coordinator = create();
    const proposed = await coordinator.create({ actorId: 'owner', goal });
    const active = await coordinator.activate({ actorId: 'owner', programHash: proposed.programHash });
    assert.equal(active.state, 'ACTIVE'); return coordinator; };
  const work = (claim, taskId = claim.task.taskId) => ({ actorId: claim.actorId, taskId,
    leaseId: claim.leaseId, generation: claim.generation });
  const complete = (coordinator, claim, output = { ok: true }, submissionId = `result-${claim.task.taskId}`) =>
    coordinator.complete({ ...work(claim), submissionId, output });
  return { goal, directory, create, start, work, complete, advance(ms) { now += ms; }, rejectGoal() { acceptGoal = false; }, acceptGoal() { acceptGoal = true; } };
}

test('agents share one goal: independent work claims, verified dependency handoff, joint acceptance', async t => {
  const f = fixture(t), coordinator = await f.start();
  const [a, b] = await Promise.all(['personal-agent', 'company-agent'].map(actorId => coordinator.claim({ actorId })));
  assert.equal(a.claim.task.taskId, 'copy'); assert.equal(b.claim.task.taskId, 'price');
  assert.equal((await coordinator.claim({ actorId: 'owner', taskId: 'publish' })).claim, null);
  await f.complete(coordinator, a.claim, { ok: true, heading: 'Launch' });
  assert.equal((await coordinator.claim({ actorId: 'owner', taskId: 'publish' })).claim, null);
  await f.complete(coordinator, b.claim, { ok: true, price: 10 });
  const { claim } = await coordinator.claim({ actorId: 'company-agent', taskId: 'publish' });
  assert.equal(claim.inputs.copy.output.heading, 'Launch'); assert.equal(claim.inputs.price.output.price, 10);
  await f.complete(coordinator, claim);
  const result = await coordinator.inspect({ actorId: 'owner' });
  assert.equal(result.state, 'SUCCEEDED'); assert.equal(result.goalVerification.accepted, true);
  assert.ok(result.tasks.every(task => task.status === 'ACCEPTED'));
  assert.equal(result.outcomePromiseIssued, false);
});

test('claim takeover fences an old worker; a new coordinator resumes the same DAG', async t => {
  const f = fixture(t), coordinator = await f.start();
  const first = (await coordinator.claim({ actorId: 'personal-agent', ttlMs: 100 })).claim;
  f.advance(101);
  const restarted = f.create(), next = (await restarted.claim({ actorId: 'personal-agent' })).claim;
  assert.equal(next.task.taskId, first.task.taskId); assert.ok(next.generation > first.generation);
  assert.equal(next.operationId, first.operationId);
  await assert.rejects(f.complete(coordinator, first), /CLAIM_LOST/);
  await f.complete(restarted, next);
  assert.equal((await restarted.inspect({ actorId: 'owner' })).tasks[0].status, 'ACCEPTED');
});

test('rejected output can be corrected; a repeated submission never verifies twice', async t => {
  let checks = 0;
  const f = fixture(t, { verifyTask: async ({ output }) => { checks++; return { accepted: output.ok === true }; } });
  const coordinator = await f.start(), claim = (await coordinator.claim({ actorId: 'personal-agent' })).claim;
  assert.equal((await f.complete(coordinator, claim, { ok: false }, 'draft')).accepted, false);
  const accepted = await f.complete(coordinator, claim, { ok: true }, 'corrected');
  assert.equal(accepted.accepted, true);
  assert.deepEqual(await f.complete(coordinator, claim, { ok: true }, 'corrected'), accepted);
  assert.equal(checks, 2);
  await assert.rejects(f.complete(coordinator, claim, { ok: false }, 'corrected'), /SUBMISSION_ID_CONFLICT/);
});

test('renewal and explicit handoff retain dependency evidence and enforce owner permissions', async t => {
  const f = fixture(t), coordinator = await f.start();
  await assert.rejects(coordinator.claim({ actorId: 'stranger' }), /NOT_AUTHORIZED/);
  assert.equal((await coordinator.claim({ actorId: 'company-agent', taskId: 'copy' })).claim, null);
  const first = (await coordinator.claim({ actorId: 'personal-agent', ttlMs: 100 })).claim;
  await coordinator.renew({ ...f.work(first), ttlMs: 1000 }); f.advance(101);
  assert.equal((await coordinator.claim({ actorId: 'personal-agent' })).claim, null);
  await coordinator.abandon(f.work(first));
  const next = (await coordinator.claim({ actorId: 'personal-agent' })).claim;
  assert.ok(next.generation > first.generation);
  await assert.rejects(coordinator.renew({ ...f.work(first), ttlMs: 100 }), /CLAIM_LOST/);
  await assert.rejects(coordinator.activate({ actorId: 'personal-agent', programHash: 'bad' }), /NOT_AUTHORIZED/);
});

test('accepted individual tasks do not replace final goal verification; resume retries the witness', async t => {
  const f = fixture(t), coordinator = await f.start(); f.rejectGoal();
  await f.complete(coordinator, (await coordinator.claim({ actorId: 'personal-agent' })).claim);
  await f.complete(coordinator, (await coordinator.claim({ actorId: 'company-agent' })).claim);
  await f.complete(coordinator, (await coordinator.claim({ actorId: 'owner' })).claim);
  assert.equal((await coordinator.inspect({ actorId: 'owner' })).state, 'ACTIVE');
  f.acceptGoal();
  assert.equal((await f.create().resume({ actorId: 'owner' })).state, 'SUCCEEDED');
});

test('invalid dependency graphs and conflicting definitions cannot be activated', async t => {
  const f = fixture(t), coordinator = f.create();
  await assert.rejects(coordinator.create({ actorId: 'owner', goal: { ...f.goal,
    tasks: [{ taskId: 'cycle', title: 'cycle', dependsOn: ['cycle'] }] } }));
  const proposed = await coordinator.create({ actorId: 'owner', goal: f.goal });
  assert.equal(proposed.state, 'PROPOSED');
  await assert.rejects(coordinator.activate({ actorId: 'owner', programHash: 'wrong' }), /PROGRAM_HASH_MISMATCH/);
  await assert.rejects(coordinator.create({ actorId: 'owner', goal: { ...f.goal, goal: 'Different goal' } }), /GOAL_ID_CONFLICT/);
  assert.equal((await coordinator.claim({ actorId: 'owner' })).claim, null);
});

test('a slow verifier permits handoff and cannot accept the superseded worker afterward', async t => {
  let enter, release;
  const entered = new Promise(resolve => { enter = resolve; }), wait = new Promise(resolve => { release = resolve; });
  const f = fixture(t, { verifyTask: async () => { enter(); await wait; return { accepted: true }; } });
  const coordinator = await f.start(), first = (await coordinator.claim({ actorId: 'personal-agent' })).claim;
  const pending = f.complete(coordinator, first); await entered;
  await coordinator.abandon(f.work(first));
  const next = (await coordinator.claim({ actorId: 'personal-agent' })).claim;
  release(); await assert.rejects(pending, /CLAIM_LOST/);
  assert.ok(next.generation > first.generation);
  assert.equal((await coordinator.inspect({ actorId: 'owner' })).tasks[0].status, 'CLAIMED');
});
