import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { canonicalizeStrict } from '../src/canonical.js';
import { createSharedResourceCoordinator } from '../src/outsider-shared-resource-coordinator.js';

const hash = value => `sha256:${createHash('sha256').update(canonicalizeStrict(value)).digest('hex')}`;
function fixture(t) {
  const directory = mkdtempSync(path.join(tmpdir(), 'outsider-shared-resource-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let now = 1000, state = { heading: 'Original' }, effects = 0, failReply = false, highestFence = 0, reading = true;
  const results = new Map();
  const adapter = {
    async observe() { if (!reading) throw new Error('temporarily unreadable'); return structuredClone(state); },
    async execute({ operationId, fencingToken, expectedStateHash, action }) {
      if (fencingToken < highestFence || expectedStateHash !== hash(state)) return { status: 'NOT_APPLIED' };
      highestFence = fencingToken;
      if (results.has(operationId)) return results.get(operationId);
      state.heading = action.heading; effects += 1;
      const result = { status: 'APPLIED', receipt: operationId }; results.set(operationId, result);
      if (failReply) throw new Error('reply lost after owner accepted');
      return result;
    },
    async reconcile({ operationId }) { return results.get(operationId) ?? { status: 'UNKNOWN' }; },
  };
  const create = (location = directory) => createSharedResourceCoordinator({ directory: location, resourceId: 'shared-page', adapter,
    authorize: ({ actorId }) => ['personal-agent', 'company-agent'].includes(actorId), clock: () => now });
  const request = (lease, operationId, heading) => ({ actorId: lease.actorId, leaseId: lease.leaseId,
    fencingToken: lease.fencingToken, operationId, action: { heading },
    expectedVersion: lease.snapshot.version, expectedStateHash: lease.snapshot.stateHash });
  return { create, request, adapter, directory, get state() { return state; }, get effects() { return effects; },
    advance(ms) { now += ms; }, changeExternally() { state = { heading: 'External edit' }; },
    loseReply() { failReply = true; }, unreadable() { reading = false; }, readable() { reading = true; } };
}

test('two agents contend for the same resource; only its current holder writes', async t => {
  const f = fixture(t), coordinator = f.create();
  const attempts = await Promise.allSettled(['personal-agent', 'company-agent'].map(actorId => coordinator.acquire({ actorId })));
  assert.equal(attempts.filter(row => row.status === 'fulfilled').length, 1);
  assert.match(attempts.find(row => row.status === 'rejected').reason.code, /BUSY/);
  const lease = attempts.find(row => row.status === 'fulfilled').value;
  const operation = f.request(lease, 'change-heading', 'Published together');
  assert.equal((await coordinator.execute(operation)).status, 'APPLIED');
  assert.equal((await coordinator.execute(operation)).status, 'APPLIED');
  assert.equal(f.effects, 1);
  await assert.rejects(coordinator.execute({ ...operation, action: { heading: 'different' } }), /OPERATION_ID_CONFLICT/);
  await coordinator.release(lease);
  assert.equal(f.state.heading, 'Published together');
});

test('expired leases are fenced after takeover, and old observations cannot overwrite a newer state', async t => {
  const f = fixture(t), coordinator = f.create();
  const first = await coordinator.acquire({ actorId: 'personal-agent', ttlMs: 100 });
  f.advance(101);
  const second = await coordinator.acquire({ actorId: 'company-agent' });
  assert.ok(second.fencingToken > first.fencingToken);
  await assert.rejects(coordinator.execute(f.request(first, 'late-command', 'Wrong')), /LEASE_LOST/);
  f.changeExternally();
  await assert.rejects(coordinator.execute(f.request(second, 'stale-command', 'Wrong')), /STALE_STATE/);
  assert.equal(f.effects, 0);
  const snapshot = await coordinator.observe({ actorId: second.actorId });
  assert.ok(snapshot.version > second.snapshot.version);
  assert.equal((await coordinator.execute(f.request({ ...second, snapshot }, 'fresh-command', 'Fresh'))).status, 'APPLIED');
});

test('a lost write reply survives restart and blocks takeover until the original operation is reconciled', async t => {
  const f = fixture(t), coordinator = f.create();
  const lease = await coordinator.acquire({ actorId: 'personal-agent', ttlMs: 100 });
  const request = f.request(lease, 'accepted-once', 'Accepted before crash');
  f.loseReply();
  assert.equal((await coordinator.execute(request)).status, 'RECONCILIATION_REQUIRED');
  f.advance(101);
  const restarted = f.create();
  await assert.rejects(restarted.acquire({ actorId: 'company-agent' }), /RECONCILIATION_REQUIRED/);
  assert.equal((await restarted.execute(request)).status, 'RECONCILIATION_REQUIRED');
  assert.equal(f.effects, 1);
  assert.equal((await restarted.reconcile({ actorId: 'personal-agent', operationId: request.operationId })).status, 'APPLIED');
  const next = await restarted.acquire({ actorId: 'company-agent' });
  assert.equal(next.snapshot.state.heading, 'Accepted before crash');
  assert.equal(f.effects, 1);
});

test('an unreadable post-write state preserves the pending intent until observation recovers', async t => {
  const f = fixture(t), coordinator = f.create();
  const original = f.adapter.execute;
  f.adapter.execute = async input => { const result = await original(input); f.unreadable(); return result; };
  const lease = await coordinator.acquire({ actorId: 'personal-agent' });
  await assert.rejects(coordinator.execute(f.request(lease, 'unreadable-after-write', 'Applied')), /unreadable/);
  assert.equal((await coordinator.inspect({ actorId: 'company-agent' })).pendingOperationId, 'unreadable-after-write');
  f.readable();
  assert.equal((await coordinator.reconcile({ actorId: 'personal-agent', operationId: 'unreadable-after-write' })).status, 'APPLIED');
  assert.equal(f.effects, 1);
});

test('owner authorization is required and a read that outlasts a lease cannot begin a write', async t => {
  const f = fixture(t), coordinator = f.create();
  await assert.rejects(coordinator.acquire({ actorId: 'stranger' }), /NOT_AUTHORIZED/);
  const lease = await coordinator.acquire({ actorId: 'personal-agent', ttlMs: 100 });
  const observe = f.adapter.observe;
  f.adapter.observe = async () => { f.advance(101); return observe(); };
  await assert.rejects(coordinator.execute(f.request(lease, 'expired-during-read', 'Wrong')), /LEASE_LOST/);
  assert.equal(f.effects, 0);
});

test('filesystem aliases share the same resource lock across coordinator instances', async t => {
  const f = fixture(t), alias = f.directory + '-alias';
  symlinkSync(f.directory, alias, 'dir');
  t.after(() => rmSync(alias, { force: true }));
  const results = await Promise.allSettled([
    f.create().acquire({ actorId: 'personal-agent' }),
    f.create(alias).acquire({ actorId: 'company-agent' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.code, /BUSY/);
});
