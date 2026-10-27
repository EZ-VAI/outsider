import {privateExecutionRecordExists as existsSync} from './outsider-user-held-durable-execution-v2.js';
/* A transport for native-resource operations of ONE original OutcomeProgram.
 * The coordinator alone schedules the order. A named private Node pulls only
 * its approved connections; it never receives a new root task or credentials
 * for another Node. Stable operation IDs retain the native adapter's own
 * reconciliation semantics across disconnects and process restarts. */
import path from 'node:path';
import { mkdirSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';
import { nodeExecutionWindow } from './outsider-execution-windows.js';
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce,
  withUserHeldExecutionLockV2 } from './outsider-user-held-durable-execution-v2.js';

const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(`NODE_STEP_${code}`), { code: `NODE_STEP_${code}` }); };
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const PHASES = ['quote', 'reserve', 'execute', 'status', 'release', 'ready', 'observe'];
export const NODE_STEP_GRANT_SCHEMA = 'outsider/node-step-grant/v1';
export const NODE_STEP_WORK_PATH = '/v1/node-step-relay/work';
export const NODE_STEP_OWNER_PATH = '/v1/node-step-relay/connections';
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const bounded = (value, maximum = 32000) => {
  if (!plain(value) || Buffer.byteLength(JSON.stringify(value)) > maximum) fail('PAYLOAD_INVALID');
  digest(value); return structuredClone(value);
};
const at = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const startWindow = context => {
  if (context.executionWindow === undefined) return null;
  const window = nodeExecutionWindow({ acceptance: [context.executionWindow] }, context.completionDeadline);
  if (!window) fail('EXECUTION_WINDOW_INVALID');
  return window;
};
const directoryOf = value => {
  if (!path.isAbsolute(value ?? '')) fail('DIRECTORY_INVALID');
  mkdirSync(value, { recursive: true, mode: 0o700 }); return value;
};
const names = directory => existsSync(directory) ? readdirSync(directory).filter(name => /^\d{8}\.json$/u.test(name)).sort() : [];
function append(directory, value) {
  directoryOf(directory); const previous = names(directory);
  if (previous.length && digest(read(path.join(directory, previous.at(-1)))) === digest(value)) return;
  writeOnce(path.join(directory, `${String(previous.length + 1).padStart(8, '0')}.json`), value);
}
const latest = directory => { const last = names(directory).at(-1); return last ? read(path.join(directory, last)) : null; };

// This public route identity deliberately excludes only the local credential
// reference and transport placement. Templates and output meanings stay bound.
export function nodeResourceRouteHash(route) {
  const { headersFile, executionNode, ...publicRoute } = route;
  return digest(publicRoute);
}
export function validateNodeStepGrant(input) {
  const grant = bounded(input, 12000);
  if (grant.schema !== NODE_STEP_GRANT_SCHEMA || !ID.test(grant.nodeId ?? '')
    || !at(grant.expiresAt) || !HASH.test(grant.authorizationSourceHash ?? '')
    || grant.publicInputOnly !== true || grant.maximumAmountMinor !== '0'
    || !Number.isInteger(grant.maximumOperations) || grant.maximumOperations < 1 || grant.maximumOperations > 10000
    || !Array.isArray(grant.connections) || !grant.connections.length || grant.connections.length > 32
    || new Set(grant.connections.map(row => row.connectionId)).size !== grant.connections.length)
    fail('GRANT_INVALID');
  for (const row of grant.connections) if (!ID.test(row.connectionId ?? '') || !row.providerRef
    || !HASH.test(row.routeHash ?? '') || !Array.isArray(row.phases) || !row.phases.length
    || row.phases.some(phase => !PHASES.includes(phase)) || new Set(row.phases).size !== row.phases.length)
    fail('GRANT_CONNECTION_INVALID');
  return grant;
}
export function validateNodeResourceDelegation(value) {
  if (!plain(value) || Object.keys(value).sort().join(',') !== 'connectionId,grantHash,nodeId,relayDirectory'
    || !ID.test(value.nodeId ?? '') || !ID.test(value.connectionId ?? '')
    || !HASH.test(value.grantHash ?? '') || !path.isAbsolute(value.relayDirectory ?? '')) fail('PLACEMENT_INVALID');
  return value;
}
export const isPendingNodeDelegation = receipt => receipt?.delegationPending === true;
const remotePending = receipt => !!receipt?.remoteTaskId && receipt.remoteTaskState
  && !['TASK_STATE_COMPLETED', 'TASK_STATE_FAILED', 'TASK_STATE_CANCELED', 'TASK_STATE_REJECTED'].includes(receipt.remoteTaskState);
const requestKey = ({ nodeId, connectionId, phase, operationId }) => digest({ nodeId, connectionId, phase, operationId }).slice(7);
const closesExistingWork = request => !!request.context?.order && ['status', 'release'].includes(request.phase)
  && (typeof request.context.reservation?.reservationId === 'string' && request.context.reservation.reservationId.length > 0
    || request.routeKind === 'A2A_TASK_EXECUTION_V1' && typeof request.context.execution?.remoteTaskId === 'string'
      && request.context.execution.remoteTaskId.length > 0);
const unstartedWindowFailure = (request, window, observedAt, observationLocation) => ({ httpAccepted: true,
  providerRef: request.providerRef, source: 'OUTSIDER_NODE_START_WINDOW_CHECK', observedAt, observationLocation,
  executionNotSent: true, requestNotSent: true, providerAcceptanceClaimed: false, state: 'FAILED_NO_EFFECT',
  remoteTaskId: null, remoteTaskState: null,
  ...(request.context.reservation?.reservationId ? { reservationId: request.context.reservation.reservationId } : {}),
  reason: 'START_WINDOW_PASSED_WITHOUT_NATIVE_DISPATCH', latestStartAt: window?.latestStartAt ?? request.context.completionDeadline });

export function createNodeStepRelay({ directory, clock = () => new Date().toISOString() }) {
  directoryOf(directory);
  const peerRoot = nodeId => {
    if (!ID.test(nodeId ?? '')) fail('NODE_INVALID');
    return path.join(directory, 'nodes', nodeId);
  };
  const peer = nodeId => {
    const root = peerRoot(nodeId), file = path.join(root, 'grant.json');
    if (!existsSync(file)) fail('NODE_NOT_CONNECTED');
    const record = read(file), grant = validateNodeStepGrant(record.grant);
    if (record.grantHash !== digest(grant)) fail('GRANT_CHANGED');
    return { root, ...record, grant, revoked: existsSync(path.join(root, 'revoked.json')) };
  };
  const active = record => {
    if (record.revoked || Date.parse(clock()) >= Date.parse(record.grant.expiresAt)) fail('GRANT_INACTIVE');
  };
  function authorize(input, token) {
    const record = peer(input.nodeId), supplied = Buffer.from(digest(String(token ?? '')));
    const expected = Buffer.from(record.tokenHash);
    if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)
      || input.grantHash !== record.grantHash) fail('UNAUTHORIZED');
    return record;
  }
  function operationRoot(record, operationId) {
    if (!/^[a-f0-9]{64}$/u.test(operationId ?? '')) fail('OPERATION_INVALID');
    return path.join(record.root, 'operations', operationId);
  }
  const view = root => {
    const response = latest(path.join(root, 'responses'));
    return response ?? { state: existsSync(path.join(root, 'delivered.json')) ? 'RUNNING' : 'WAITING_FOR_NODE', projection: null };
  };
  return Object.freeze({
    async register(grantInput) {
      const grant = validateNodeStepGrant(grantInput), root = peerRoot(grant.nodeId);
      if (Date.parse(clock()) >= Date.parse(grant.expiresAt)) fail('GRANT_INACTIVE');
      return withUserHeldExecutionLockV2(digest({ directory, nodeId: grant.nodeId, operation: 'REGISTER' }), async () => {
        if (existsSync(path.join(root, 'grant.json'))) fail('NODE_ALREADY_CONNECTED');
        directoryOf(root); const credential = randomBytes(32).toString('base64url'), grantHash = digest(grant);
        writeOnce(path.join(root, 'grant.json'), { grant, grantHash, tokenHash: digest(credential), createdAt: clock() });
        return { nodeId: grant.nodeId, grantHash, credential, expiresAt: grant.expiresAt };
      });
    },
    revoke(nodeId) { const record = peer(nodeId); writeOnce(path.join(record.root, 'revoked.json'), { revoked: true }); return { nodeId, revoked: true }; },
    checkConnection({ placement, route, phases }) {
      validateNodeResourceDelegation(placement);
      const record = peer(placement.nodeId), connection = record.grant.connections.find(row => row.connectionId === placement.connectionId);
      active(record);
      if (record.grantHash !== placement.grantHash || !connection || !Array.isArray(phases)
        || phases.some(phase => !connection.phases.includes(phase))
        || connection.routeHash !== nodeResourceRouteHash(route) || connection.providerRef !== route.providerRef)
        fail('CONNECTION_NOT_GRANTED');
      return { nodeId: placement.nodeId, connectionId: placement.connectionId, grantHash: placement.grantHash,
        expiresAt: record.grant.expiresAt, newAuthority: false };
    },
    status() {
      const root = path.join(directory, 'nodes');
      return { nodes: existsSync(root) ? readdirSync(root).filter(name => ID.test(name)).map(nodeId => {
        const record = peer(nodeId), ops = path.join(record.root, 'operations');
        const states = existsSync(ops) ? readdirSync(ops).filter(id => /^[a-f0-9]{64}$/u.test(id)).map(id => view(path.join(ops, id)).state) : [];
        const contactFile = path.join(record.root, 'last-contact.json');
        const lastSeenAt = existsSync(contactFile) ? read(contactFile).lastSeenAt : null;
        return { nodeId, grantHash: record.grantHash, expiresAt: record.grant.expiresAt, revoked: record.revoked,
          lastSeenAt, connectionState: record.revoked ? 'REVOKED'
            : Date.parse(clock()) >= Date.parse(record.grant.expiresAt) ? 'EXPIRED'
              : lastSeenAt && Date.parse(clock()) - Date.parse(lastSeenAt) <= 150000 ? 'CONNECTED' : 'OFFLINE',
          operations: states.length, completed: states.filter(state => state === 'COMPLETE').length,
          pending: states.filter(state => state !== 'COMPLETE').length, originalOrderCoordinatorOnly: true };
      }) : [] };
    },
    inspect(placement, phase, operationId) {
      const record = peer(placement.nodeId), key = requestKey({ ...placement, phase, operationId }), root = operationRoot(record, key);
      return { started: existsSync(path.join(root, 'request.json')), key, ...view(root) };
    },
    async cancelUnsentReservation(placement, operationId) {
      const record = peer(placement.nodeId), key = requestKey({ ...placement, phase: 'reserve', operationId });
      const root = operationRoot(record, key);
      return withUserHeldExecutionLockV2(digest({ directory, key }), async () => {
        if (!existsSync(path.join(root, 'request.json')) || existsSync(path.join(root, 'delivered.json'))) return false;
        const request = read(path.join(root, 'request.json'));
        if (request.grantHash !== placement.grantHash || Date.parse(clock()) < Date.parse(request.context.completionDeadline)) return false;
        append(path.join(root, 'responses'), { state: 'COMPLETE', projection: { httpAccepted: true,
          providerRef: request.providerRef, noCapacityAcquired: true, delegationCanceledBeforeDispatch: true,
          delegatedOperationId: key, providerAcceptanceClaimed: false } });
        return true;
      });
    },
    async cancelUnsentExecution(placement, operationId) {
      const record = peer(placement.nodeId), key = requestKey({ ...placement, phase: 'execute', operationId });
      const root = operationRoot(record, key);
      return withUserHeldExecutionLockV2(digest({ directory, key }), async () => {
        if (!existsSync(path.join(root, 'request.json')) || existsSync(path.join(root, 'delivered.json'))) return false;
        const request = read(path.join(root, 'request.json')), window = startWindow(request.context);
        if (request.grantHash !== placement.grantHash || view(root).state === 'COMPLETE'
          || !(Date.parse(clock()) >= Date.parse(request.context.completionDeadline)
            || window?.latestStartAt && Date.parse(clock()) > Date.parse(window.latestStartAt))) return false;
        append(path.join(root, 'responses'), { state: 'COMPLETE',
          projection: unstartedWindowFailure(request, window, clock(), 'ORDER_COORDINATOR') });
        return true;
      });
    },
    async enqueue({ placement, route, phase, context, effect, operationId, formationRef }) {
      const record = peer(placement.nodeId);
      const connection = record.grant.connections.find(row => row.connectionId === placement.connectionId);
      if (record.grantHash !== placement.grantHash || !connection || !connection.phases.includes(phase)
        || connection.routeHash !== nodeResourceRouteHash(route) || connection.providerRef !== route.providerRef) fail('CONNECTION_NOT_GRANTED');
      if (typeof effect !== 'boolean' || typeof operationId !== 'string' || operationId.length > 256) fail('OPERATION_INVALID');
      const ctx = bounded(context, 24000);
      if (!at(ctx.completionDeadline) || Date.parse(ctx.completionDeadline) > Date.parse(record.grant.expiresAt)) fail('DEADLINE_OUTSIDE_GRANT');
      if (ctx.executionWindow !== undefined && (phase !== 'execute' || !startWindow(ctx))) fail('EXECUTION_WINDOW_INVALID');
      if (ctx.order && (!HASH.test(ctx.order.programHash ?? '') || typeof ctx.order.programId !== 'string')) fail('ORDER_BINDING_INVALID');
      if (effect && !ctx.order) fail('EFFECT_REQUIRES_ORIGINAL_ORDER');
      const key = requestKey({ ...placement, phase, operationId }), root = operationRoot(record, key);
      const request = { schema: 'outsider/node-step-request/v1', delegatedOperationId: key,
        nodeId: placement.nodeId, grantHash: placement.grantHash, connectionId: placement.connectionId,
        routeHash: connection.routeHash, providerRef: route.providerRef, phase, context: ctx, effect, operationId,
        order: ctx.order ?? null, formationRef, originalOrderCoordinatorOnly: true };
      if (route.kind === 'A2A_TASK_EXECUTION_V1') request.routeKind = route.kind;
      return withUserHeldExecutionLockV2(digest({ directory, key }), async () => {
        const file = path.join(root, 'request.json');
        if (!existsSync(file)) {
          active(record);
          const operations = path.dirname(root);
          if (existsSync(operations) && readdirSync(operations).length >= record.grant.maximumOperations) fail('OPERATION_LIMIT');
          directoryOf(root); writeOnce(file, request);
        } else if (digest(read(file)) !== digest(request)) fail('OPERATION_INPUT_CHANGED');
        return { key, ...view(root) };
      });
    },
    async handleWorker(input, credential) {
      bounded(input, 40000); const record = authorize(input, credential);
      if (input.action === 'POLL') {
        active(record);
        // Presence is replaceable transport metadata, never an execution or
        // outcome receipt. Atomic replacement avoids a growing heartbeat log.
        const contact = path.join(record.root, `contact-${randomBytes(8).toString('hex')}.tmp`);
        writeFileSync(contact, JSON.stringify({ lastSeenAt: clock() }), { mode: 0o600, flag: 'wx' });
        renameSync(contact, path.join(record.root, 'last-contact.json'));
        const operations = path.join(record.root, 'operations');
        const ids = existsSync(operations) ? readdirSync(operations).filter(id => /^[a-f0-9]{64}$/u.test(id)).sort() : [];
        const cursor = input.afterOperationId === undefined ? -1 : ids.indexOf(input.afterOperationId);
        const eligible = [...ids.slice(cursor + 1), ...ids.slice(0, cursor + 1)];
        // Pending acknowledgements remain tied to this Node. No lease expiry
        // reassigns a possibly executed effect to another process or device.
        for (const key of eligible) {
          const result = await withUserHeldExecutionLockV2(digest({ directory, key }), async () => {
            const root = operationRoot(record, key), state = view(root);
            if (['COMPLETE', 'EFFECT_UNKNOWN'].includes(state.state)) return null;
            const request = read(path.join(root, 'request.json'));
            if (Date.parse(clock()) >= Date.parse(request.context.completionDeadline) && !closesExistingWork(request)
              && !(request.effect && existsSync(path.join(root, 'delivered.json')))
              && !(request.phase === 'execute' && startWindow(request.context))) return null;
            writeOnce(path.join(root, 'delivered.json'), { delivered: true, nodeId: input.nodeId });
            return { request, requestHash: digest(request) };
          });
          if (result) return result;
        }
        return { request: null };
      }
      if (input.action !== 'RECEIPT') fail('ACTION_INVALID');
      const root = operationRoot(record, input.delegatedOperationId), request = read(path.join(root, 'request.json'));
      if (input.requestHash !== digest(request) || !['COMPLETE', 'RUNNING', 'EFFECT_UNKNOWN'].includes(input.state)) fail('RECEIPT_BINDING_INVALID');
      const projection = bounded(input.projection);
      if (input.state === 'COMPLETE' && (remotePending(projection) || isPendingNodeDelegation(projection))) fail('PENDING_IS_NOT_COMPLETE');
      return withUserHeldExecutionLockV2(digest({ directory, key: input.delegatedOperationId }), async () => {
        const previous = view(root);
        if (previous.state === 'COMPLETE' && (input.state !== 'COMPLETE' || digest(previous.projection) !== digest(projection))) fail('COMPLETED_RECEIPT_CHANGED');
        // Receipt delivery remains allowed after expiry/revocation. It closes
        // the record of an already dispatched operation; it starts no action.
        append(path.join(root, 'responses'), { state: input.state, projection });
        return { accepted: true, delegatedOperationId: input.delegatedOperationId, state: input.state };
      });
    },
  });
}

export function createDelegatedNativeResourceRoute({ directory, route, clock = () => new Date().toISOString() }) {
  const placement = validateNodeResourceDelegation(route.executionNode);
  const relay = createNodeStepRelay({ directory: placement.relayDirectory, clock });
  const pending = result => ({ ...(result.projection ?? {}), httpAccepted: false,
    providerRef: route.providerRef, observedAt: clock(), delegationPending: true,
    delegatedOperationId: result.key, delegationState: result.state,
    retryAfter: new Date(Date.parse(clock()) + 5000).toISOString(),
    delegationGrantsCapacity: false, delegationProvidesIndependentOutcome: false });
  return Object.freeze({
    cancelUnsentExecution: operationId => relay.cancelUnsentExecution(placement, operationId),
    inspect(phase, { operationId }) { const result = relay.inspect(placement, phase, operationId);
      return { started: result.started, projection: result.state === 'COMPLETE' ? result.projection : pending(result) }; },
    async call(phase, context, { effect = false, operationId, resumeOnly = false } = {}) {
      if (!PHASES.includes(phase) || typeof operationId !== 'string') fail('OPERATION_ID_REQUIRED');
      const before = relay.inspect(placement, phase, operationId);
      if (resumeOnly && !before.started) fail('UNSTARTED_OPERATION');
      if (resumeOnly && phase === 'reserve') await relay.cancelUnsentReservation(placement, operationId);
      if (resumeOnly && phase === 'execute') await relay.cancelUnsentExecution(placement, operationId);
      // A complete native response is available after reconnect even if the
      // grant has since expired. New effects still require an active grant.
      const result = await relay.enqueue({ placement, route, phase, context, effect, operationId,
        formationRef: digest({ directory, connectionId: placement.connectionId }) });
      return result.state === 'COMPLETE' ? result.projection : pending(result);
    },
  });
}

/** Called by the existing local Node maintenance loop. Connection routes and
 * secret references are installed locally once; jobs cannot supply new ones. */
export function createNodeStepWorker({ directory, configuration, createRoute, fetchImpl = fetch,
  clock = () => new Date().toISOString() }) {
  directoryOf(directory); const grant = validateNodeStepGrant(configuration.grant), grantHash = digest(grant);
  const origin = new URL(configuration.coordinatorOrigin);
  if (origin.protocol !== 'https:' || origin.href !== `${origin.origin}/` || origin.username || origin.password
    || !path.isAbsolute(configuration.credentialFile ?? '') || typeof createRoute !== 'function'
    || !Array.isArray(configuration.connections)) fail('WORKER_CONFIG_INVALID');
  const connections = new Map(configuration.connections.map(row => [row.connectionId, row.route]));
  if (connections.size !== configuration.connections.length || grant.connections.some(row => {
    const route = connections.get(row.connectionId);
    return !route || route.executionNode || nodeResourceRouteHash(route) !== row.routeHash || route.providerRef !== row.providerRef;
  })) fail('WORKER_CONNECTION_CHANGED');
  async function post(body) {
    const credential = readPrivateExecutionBytes(configuration.credentialFile).toString('utf8').trim();
    const response = await fetchImpl(`${origin.origin}${NODE_STEP_WORK_PATH}`, { method: 'POST',
      headers: { authorization: `Bearer ${credential}`, 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, nodeId: grant.nodeId, grantHash }), redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (response.status !== 200) fail('COORDINATOR_UNAVAILABLE');
    const bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length > 48000) fail('RESPONSE_TOO_LARGE');
    return JSON.parse(bytes.toString('utf8'));
  }
  async function deliver(root, request, response) {
    const responseHash = digest(response), acknowledged = latest(path.join(root, 'acknowledged'));
    if (acknowledged?.responseHash === responseHash) return;
    const ack = await post({ action: 'RECEIPT', delegatedOperationId: request.delegatedOperationId,
      requestHash: digest(request), ...response });
    if (ack.accepted !== true || ack.delegatedOperationId !== request.delegatedOperationId
      || ack.state !== response.state) fail('ACKNOWLEDGEMENT_MISMATCH');
    append(path.join(root, 'acknowledged'), { responseHash });
  }
  return Object.freeze({ async poll() {
    return withUserHeldExecutionLockV2(digest({ directory, nodeId: grant.nodeId }), async () => {
      // Flush already observed receipts before requesting work. A completed
      // action remains reportable after expiry/revocation or a long outage.
      for (const key of readdirSync(directory).filter(id => /^[a-f0-9]{64}$/u.test(id))) {
        const root = path.join(directory, key), response = latest(path.join(root, 'responses'));
        if (response) await deliver(root, read(path.join(root, 'request.json')), response);
      }
      if (Date.parse(clock()) >= Date.parse(grant.expiresAt)) return { state: 'GRANT_EXPIRED', operationsExecuted: 0 };
      const cursor = latest(path.join(directory, 'poll-cursor'));
      const pending = await post({ action: 'POLL', ...(cursor ? { afterOperationId: cursor.delegatedOperationId } : {}) });
      if (!pending.request) return { state: 'IDLE', operationsExecuted: 0 };
      const request = bounded(pending.request), key = request.delegatedOperationId;
      const connection = grant.connections.find(row => row.connectionId === request.connectionId);
      if (request.schema !== 'outsider/node-step-request/v1' || !/^[a-f0-9]{64}$/u.test(key ?? '')
        || request.nodeId !== grant.nodeId || request.grantHash !== grantHash || pending.requestHash !== digest(request)
        || !connection || request.routeHash !== connection.routeHash || !connection.phases.includes(request.phase)
        || (request.routeKind === 'A2A_TASK_EXECUTION_V1') !== (connections.get(request.connectionId)?.kind === 'A2A_TASK_EXECUTION_V1')
        || request.providerRef !== connection.providerRef || key !== requestKey(request)
        || request.effect && (!request.order || digest(request.order) !== digest(request.context.order))
        || !at(request.context.completionDeadline)
        || Date.parse(request.context.completionDeadline) > Date.parse(grant.expiresAt)) fail('WORK_NOT_GRANTED');
      const root = directoryOf(path.join(directory, key));
      writeOnce(path.join(root, 'request.json'), request);
      let response = latest(path.join(root, 'responses')), performed = false;
      if (!response || response.state === 'RUNNING') {
        const native = createRoute({ directory: path.join(root, 'native'), route: connections.get(request.connectionId), clock });
        try {
          const expired = Date.parse(clock()) >= Date.parse(request.context.completionDeadline);
          const window = startWindow(request.context);
          const early = window && Date.parse(clock()) < Date.parse(window.notBefore);
          const missedStart = window?.latestStartAt && Date.parse(clock()) > Date.parse(window.latestStartAt);
          const reconcileOnly = (expired || missedStart) && !closesExistingWork(request);
          if (reconcileOnly && !request.effect) fail('EXPIRED_READ_NOT_REQUIRED_FOR_CLOSURE');
          if (early) response = { state: 'RUNNING', projection: { httpAccepted: false,
            providerRef: request.providerRef, delegationPending: true, executionNotSent: true,
            delegationState: 'WAITING_FOR_EXECUTION_WINDOW', retryAfter: window.notBefore } };
          else if (request.phase === 'execute' && (missedStart || expired && window)
            && native.inspect?.(request.phase, { operationId: request.operationId })?.started === false) {
            response = { state: 'COMPLETE', projection: unstartedWindowFailure(request, window, clock(), 'CONNECTED_NODE') };
          } else {
            const projection = bounded(await native.call(request.phase, request.context,
              { operationId: request.operationId, effect: request.effect, ...(reconcileOnly ? { resumeOnly: true } : {}) }));
            response = { state: remotePending(projection) ? 'RUNNING' : 'COMPLETE', projection }; performed = true;
          }
        } catch {
          // The native adapter owns evidence-based reconciliation. A missing
          // effect receipt is not permission to repeat the provider mutation.
          const saved = native.inspect?.(request.phase, { operationId: request.operationId })?.projection;
          const state = !request.effect || remotePending(saved) ? 'RUNNING' : 'EFFECT_UNKNOWN';
          response = { state, projection: { httpAccepted: false, providerRef: request.providerRef,
            delegationPending: true, delegationState: state, delegatedOperationId: key } };
        }
        append(path.join(root, 'responses'), response);
      }
      await deliver(root, request, response);
      append(path.join(directory, 'poll-cursor'), { delegatedOperationId: key });
      return { state: response.state, delegatedOperationId: key, order: request.order,
        operationsExecuted: performed ? 1 : 0, newRootTaskCreated: false };
    });
  } });
}
