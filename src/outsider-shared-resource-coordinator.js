import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { canonicalizeStrict } from './canonical.js';
import { publishPrivateExecutionBytes, withUserHeldExecutionLockV2 }
  from './outsider-user-held-durable-execution-v2.js';

const hash = value => `sha256:${createHash('sha256').update(canonicalizeStrict(value)).digest('hex')}`;
const copy = value => JSON.parse(canonicalizeStrict(value));
const fail = code => { throw Object.assign(new Error(`SHARED_RESOURCE_${code}`), { code: `SHARED_RESOURCE_${code}` }); };
const id = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);

/** Owner-side coordination for one resource on one host.
 * All writers must use this gateway. The owner supplies authenticated actors,
 * authorization, observation and an adapter that checks fencing/state at the
 * actual write boundary. This does not confer control of arbitrary resources.
 * An interrupted write stays pending until its original operation is reconciled.
 */
export function createSharedResourceCoordinator({ directory, resourceId, adapter, authorize, clock = Date.now }) {
  if (!path.isAbsolute(directory ?? '') || !id(resourceId) || typeof authorize !== 'function'
    || !['observe', 'execute', 'reconcile'].every(name => typeof adapter?.[name] === 'function')) fail('CONFIGURATION_INVALID');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const root = realpathSync(directory);
  const file = path.join(root, `${hash(resourceId).slice(7)}.json`);
  const lockId = hash({ directory: root, resourceId });
  const time = () => { const now = clock(); if (!Number.isSafeInteger(now) || now < 0) fail('CLOCK_INVALID'); return now; };
  const save = state => publishPrivateExecutionBytes(file, Buffer.from(canonicalizeStrict(state) + '\n'), { replace: true });
  function load() {
    if (!existsSync(file)) return { schema: 'outsider/shared-resource/v1', resourceId, version: 0,
      stateHash: null, generation: 0, lease: null, pendingOperationId: null, operations: {}, events: [] };
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (state.schema !== 'outsider/shared-resource/v1' || state.resourceId !== resourceId) fail('STATE_INVALID');
    let previousHash = null;
    for (const [index, event] of state.events.entries()) {
      const { eventHash, ...body } = event;
      if (body.sequence !== index + 1 || body.previousHash !== previousHash || hash(body) !== eventHash) fail('AUDIT_CHAIN_INVALID');
      previousHash = eventHash;
    }
    return state;
  }
  function record(state, type, data) {
    const body = { sequence: state.events.length + 1, previousHash: state.events.at(-1)?.eventHash ?? null,
      at: new Date(time()).toISOString(), type, ...data };
    state.events.push({ ...body, eventHash: hash(body) });
    save(state);
  }
  async function allowed(actorId, operation, action = null) {
    if (!id(actorId) || await authorize({ resourceId, actorId, operation, action }) !== true) fail('NOT_AUTHORIZED');
  }
  async function readState(state) {
    const observed = copy(await adapter.observe({ resourceId }));
    const stateHash = hash(observed);
    if (state.stateHash !== stateHash) {
      state.version += 1; state.stateHash = stateHash;
      record(state, 'STATE_OBSERVED', { stateHash, version: state.version });
    }
    return { resourceId, version: state.version, stateHash, state: observed };
  }
  const view = state => ({ resourceId, version: state.version, stateHash: state.stateHash,
    lease: state.lease ? { actorId: state.lease.actorId, fencingToken: state.lease.fencingToken,
      expiresAt: state.lease.expiresAt, active: Date.parse(state.lease.expiresAt) > time() } : null,
    pendingOperationId: state.pendingOperationId, auditHeadHash: state.events.at(-1)?.eventHash ?? null });
  function assertLease(state, input) {
    const lease = state.lease;
    if (!lease || lease.actorId !== input.actorId || lease.leaseId !== input.leaseId
      || lease.fencingToken !== input.fencingToken || Date.parse(lease.expiresAt) <= time()) fail('LEASE_LOST');
    return lease;
  }
  function ttl(value) {
    if (!Number.isSafeInteger(value) || value < 100 || value > 300_000) fail('LEASE_DURATION_INVALID');
    return value;
  }
  async function finish(state, operation, result) {
    if (!result || !['APPLIED', 'NOT_APPLIED'].includes(result.status)) {
      operation.status = 'RECONCILIATION_REQUIRED';
      record(state, 'OPERATION_UNRESOLVED', { operationId: operation.operationId });
      return copy(operation);
    }
    // A successful write without a readable resulting state remains unresolved.
    const observed = await readState(state);
    operation.status = result.status; operation.resultHash = hash(result);
    operation.resultingVersion = observed.version; operation.resultingStateHash = observed.stateHash;
    state.pendingOperationId = null;
    record(state, 'OPERATION_RESOLVED', { operationId: operation.operationId, status: operation.status,
      resultHash: operation.resultHash, stateHash: observed.stateHash, version: observed.version });
    return copy(operation);
  }
  const locked = operation => withUserHeldExecutionLockV2(lockId, () => operation(load()));
  return Object.freeze({
    async observe({ actorId }) {
      await allowed(actorId, 'OBSERVE');
      return locked(readState);
    },
    async acquire({ actorId, ttlMs = 30_000 }) {
      await allowed(actorId, 'ACQUIRE'); ttl(ttlMs);
      return locked(async state => {
        if (state.pendingOperationId) fail('RECONCILIATION_REQUIRED');
        if (state.lease && Date.parse(state.lease.expiresAt) > time()) {
          if (state.lease.actorId !== actorId) fail('BUSY');
          return { ...copy(state.lease), snapshot: await readState(state) };
        }
        const snapshot = await readState(state);
        state.generation += 1;
        state.lease = { actorId, leaseId: randomUUID(), fencingToken: state.generation,
          expiresAt: new Date(time() + ttlMs).toISOString() };
        record(state, 'LEASE_ACQUIRED', { actorId, fencingToken: state.generation, expiresAt: state.lease.expiresAt });
        return { ...copy(state.lease), snapshot };
      });
    },
    async renew(input) {
      await allowed(input.actorId, 'ACQUIRE'); ttl(input.ttlMs);
      return locked(state => {
        const lease = assertLease(state, input);
        lease.expiresAt = new Date(time() + input.ttlMs).toISOString();
        record(state, 'LEASE_RENEWED', { actorId: lease.actorId, fencingToken: lease.fencingToken, expiresAt: lease.expiresAt });
        return copy(lease);
      });
    },
    async execute(input) {
      const { actorId, operationId, action, expectedVersion, expectedStateHash } = input;
      if (!id(operationId) || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0
        || !/^sha256:[a-f0-9]{64}$/u.test(expectedStateHash ?? '')) fail('OPERATION_INVALID');
      const actionCopy = copy(action);
      await allowed(actorId, 'EXECUTE', actionCopy);
      return locked(async state => {
        const requestHash = hash({ actorId, operationId, action: actionCopy, expectedVersion, expectedStateHash });
        const prior = state.operations[operationId];
        if (prior) {
          if (prior.requestHash !== requestHash) fail('OPERATION_ID_CONFLICT');
          return copy(prior);
        }
        const lease = assertLease(state, input);
        if (state.pendingOperationId) fail('RECONCILIATION_REQUIRED');
        const current = await readState(state);
        if (current.version !== expectedVersion || current.stateHash !== expectedStateHash) fail('STALE_STATE');
        await allowed(actorId, 'EXECUTE', actionCopy);
        assertLease(state, input);
        const operation = { operationId, actorId, requestHash, actionHash: hash(actionCopy),
          fencingToken: lease.fencingToken, expectedVersion, expectedStateHash, status: 'RECONCILIATION_REQUIRED' };
        state.operations[operationId] = operation; state.pendingOperationId = operationId;
        record(state, 'OPERATION_INTENT', { operationId, actorId, actionHash: operation.actionHash,
          fencingToken: lease.fencingToken, expectedVersion, expectedStateHash });
        let result;
        try { result = await adapter.execute({ resourceId, operationId,
          actorId, action: actionCopy, fencingToken: lease.fencingToken, expectedStateHash }); }
        catch { result = { status: 'UNKNOWN' }; }
        return finish(state, operation, result);
      });
    },
    async reconcile({ actorId, operationId }) {
      await allowed(actorId, 'RECONCILE');
      return locked(async state => {
        const operation = state.operations[operationId];
        if (!operation) fail('OPERATION_NOT_FOUND');
        if (operation.status !== 'RECONCILIATION_REQUIRED') return copy(operation);
        let result;
        try { result = await adapter.reconcile({ resourceId, operationId, fencingToken: operation.fencingToken }); }
        catch { result = { status: 'UNKNOWN' }; }
        return finish(state, operation, result);
      });
    },
    async release(input) {
      await allowed(input.actorId, 'RELEASE');
      return locked(state => {
        const lease = assertLease(state, input);
        if (state.pendingOperationId) fail('RECONCILIATION_REQUIRED');
        state.lease = null;
        record(state, 'LEASE_RELEASED', { actorId: lease.actorId, fencingToken: lease.fencingToken });
        return view(state);
      });
    },
    async inspect({ actorId }) {
      await allowed(actorId, 'OBSERVE');
      return locked(state => view(state));
    },
  });
}
