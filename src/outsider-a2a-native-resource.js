/* A2A is a transport for the original native-resource participant lifecycle,
 * not another scheduler and not an automatic conversion of remote completion
 * into accepted capacity or independent outcome truth. Business fields below
 * must exist in the provider's actual structured artifacts. */
import path from 'node:path';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';
import { readPrivateExecutionBytes, writePrivateExecutionRecordOnce as writeOnce, withUserHeldExecutionLockV2 }
  from './outsider-user-held-durable-execution-v2.js';
import { A2A_VERSION, A2A_LEGACY_VERSION, A2A_TERMINAL_STATES, createA2AJsonRpcClient, selectA2AInterface }
  from './outsider-a2a-protocol.js';

const read = file => JSON.parse(readPrivateExecutionBytes(file));
const fail = code => { throw Object.assign(new Error(`A2A_RESOURCE_${code}`), { code: `A2A_RESOURCE_${code}` }); };
const HASH = /^sha256:[a-f0-9]{64}$/u;
const METHOD = ['SendMessage', 'GetTask', 'CancelTask'];
const routeVersions = Object.freeze({ A2A_1_0_JSONRPC: A2A_VERSION, A2A_0_3_JSONRPC: A2A_LEGACY_VERSION });
export const isA2AResourceRoute = route => Object.hasOwn(routeVersions, route?.protocol);
export const isPendingA2AResourceTask = receipt => !!receipt?.remoteTaskId
  && !A2A_TERMINAL_STATES.includes(receipt.remoteTaskState);
function pointer(value, ref) {
  if (ref === '') return value;
  if (typeof ref !== 'string' || !ref.startsWith('/')) fail('POINTER_INVALID');
  for (const part of ref.slice(1).split('/').map(s => s.replaceAll('~1', '/').replaceAll('~0', '~'))) {
    if (['__proto__', 'prototype', 'constructor'].includes(part) || !value || !Object.hasOwn(value, part)) return undefined;
    value = value[part];
  }
  return value;
}
function materialize(template, context) {
  if (Array.isArray(template)) return template.map(item => materialize(item, context));
  if (template && typeof template === 'object') {
    if (Object.keys(template).join(',') === '$ref') {
      const value = pointer(context, template.$ref); if (value === undefined) fail('REQUEST_BINDING_MISSING');
      return structuredClone(value);
    }
    return Object.fromEntries(Object.entries(template).map(([key, value]) => [key, materialize(value, context)]));
  }
  return template;
}
function field(value, rule) {
  if (typeof rule === 'string') return pointer(value, rule) ?? null;
  const observed = pointer(value, rule?.pointer);
  if (observed === undefined || observed === null || !rule?.map || typeof observed === 'object') return null;
  return Object.hasOwn(rule.map, String(observed)) ? rule.map[String(observed)] : null;
}
export function validateA2AResourceRoute(route, role) {
  let endpoint; try { endpoint = new URL(route.a2a?.endpoint); } catch { fail('ENDPOINT_INVALID'); }
  if (!isA2AResourceRoute(route) || endpoint.protocol !== 'https:' || endpoint.origin !== route.origin
    || endpoint.username || endpoint.password || endpoint.hash
    || route.a2a.protocolVersion !== routeVersions[route.protocol] || route.a2a.protocolBinding !== 'JSONRPC'
    || !HASH.test(route.a2a.agentCardHash ?? '') || !route.providerRef || !route.sourceUrl
    || !HASH.test(route.sourceHash ?? '') || route.headersFile && !path.isAbsolute(route.headersFile)) fail('CONNECTION_INVALID');
  const phases = route.kind === 'A2A_TASK_EXECUTION_V1' ? ['execute', 'status', 'release']
    : role === 'witness' ? ['ready', 'observe'] : ['quote', 'reserve', 'execute', 'status', 'release'];
  for (const phase of phases) {
    const operation = route[phase];
    if (!operation || !METHOD.includes(operation.rpcMethod) || !operation.params || !operation.fields
      || typeof operation.fields !== 'object' || Array.isArray(operation.fields)
      || operation.waitForTaskMs !== undefined && (!Number.isInteger(operation.waitForTaskMs)
        || operation.waitForTaskMs < 0 || operation.waitForTaskMs > 15000)) fail('OPERATION_INVALID');
    if (phase === 'status' && operation.rpcMethod !== 'GetTask') fail('STATUS_MUST_POLL_ORIGINAL_REMOTE_TASK');
    for (const rule of Object.values(operation.fields)) {
      if (typeof rule !== 'string' && (!rule || typeof rule.pointer !== 'string' || !rule.map)) fail('FIELD_MAPPING_INVALID');
    }
  }
  return route;
}

// Connection-time compilation from a discovered current card. A phase mapping
// describes the provider's native accepted quote/reservation artifact schema;
// absent business fields remain absent. No per-order URL or header selection.
export function buildA2AResourceRoute({ card, source, providerRef, phases, role = 'primary', headersFile, allowedOrigins }) {
  const selected = selectA2AInterface(card, { allowedOrigins });
  const route = { protocol: selected.protocolVersion === A2A_VERSION ? 'A2A_1_0_JSONRPC' : 'A2A_0_3_JSONRPC',
    origin: new URL(selected.url).origin, providerRef,
    sourceUrl: source.url, sourceHash: source.sourceHash,
    a2a: { endpoint: selected.url, protocolBinding: selected.protocolBinding,
      protocolVersion: selected.protocolVersion, agentCardHash: digest(card),
      ...(selected.tenant === undefined ? {} : { tenant: selected.tenant }) },
    ...(headersFile ? { headersFile } : {}), ...structuredClone(phases) };
  return validateA2AResourceRoute(route, role);
}

export function createA2AResourceRoute({ directory, route, fetchImpl = fetch, clock = () => new Date().toISOString() }) {
  validateA2AResourceRoute(route, route.observe && route.ready ? 'witness' : 'primary');
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const client = createA2AJsonRpcClient({ agentInterface: { url: route.a2a.endpoint,
    protocolVersion: route.a2a.protocolVersion, protocolBinding: 'JSONRPC',
    ...(route.a2a.tenant === undefined ? {} : { tenant: route.a2a.tenant }) },
    fetchImpl, headersProvider: () => route.headersFile ? read(route.headersFile) : {} });
  const records = (phase, operationId) => {
    const key = digest({ phase, operationId }).slice(7), file = suffix => path.join(directory, `${key}-${suffix}.json`);
    const updates = path.join(directory, `${key}-task-observations`);
    const names = () => existsSync(updates) ? readdirSync(updates).filter(name => /^\d{8}\.json$/u.test(name)).sort() : [];
    return { key, file, latest() {
      const name = names().at(-1);
      return name ? read(path.join(updates, name)) : existsSync(file('response')) ? read(file('response')) : null;
    }, save(record) {
      if (!existsSync(file('response'))) return writeOnce(file('response'), record);
      mkdirSync(updates, { recursive: true, mode: 0o700 });
      writeOnce(path.join(updates, `${String(names().length + 1).padStart(8, '0')}.json`), record);
    } };
  };
  return Object.freeze({ inspect(phase, { operationId }) {
    const saved = records(phase, operationId), latest = saved.latest();
    return { started: existsSync(saved.file('intent')) || latest !== null, projection: latest?.projection ?? null };
  }, async call(phase, context, { effect = false, operationId = randomUUID(), resumeOnly = false } = {}) {
    return withUserHeldExecutionLockV2(digest({ directory, phase, operationId }), async () => {
      const operation = route[phase]; if (!operation) fail('PHASE_NOT_CONNECTED');
      if (operation.rpcMethod !== 'GetTask' && !effect && !['quote', 'ready', 'observe'].includes(phase)) fail('EFFECT_FLAG_REQUIRED');
      const saved = records(phase, operationId), { key, file } = saved;
      const params = materialize(operation.params, { ...context, operationId });
      if (operation.rpcMethod === 'SendMessage') {
        params.message = { ...params.message, messageId: `outsider-${key}`, role: 'ROLE_USER' };
        params.configuration = { ...params.configuration, returnImmediately: true };
      }
      const requestHash = digest({ endpoint: route.a2a.endpoint, phase, params, rpcMethod: operation.rpcMethod,
        ...(route.a2a.protocolVersion === A2A_VERSION ? {} : { protocolVersion: route.a2a.protocolVersion }) });
      if (existsSync(file('intent')) && read(file('intent')).requestHash !== requestHash) fail('OPERATION_INPUT_CHANGED');
      let previous = saved.latest();
      if (previous && previous.requestHash !== requestHash) fail('OPERATION_INPUT_CHANGED');
      if (previous && !isPendingA2AResourceTask(previous.projection)) return previous.projection;
      // A2A messageId itself does not guarantee deduplication. Reconcile a known
      // task, but never blindly re-SendMessage after an unknown response, even
      // when the requested business phase is a read such as quote or observe.
      if (!previous && (resumeOnly || existsSync(file('intent')))) fail('EFFECT_UNRESOLVED_RECONCILIATION_REQUIRED');
      if ((effect || operation.rpcMethod === 'SendMessage') && !previous)
        writeOnce(file('intent'), { requestHash, phase, operationId, startedAt: clock() });
      const waitUntil = Date.now() + (operation.waitForTaskMs ?? 0);
      while (true) {
        const polling = previous !== null;
        const receipt = await client.call(polling ? 'GetTask' : operation.rpcMethod,
          polling ? { id: previous.projection.remoteTaskId } : params,
          { requestId: polling ? `poll-${randomUUID()}` : `rpc-${key}` });
        const remoteTask = receipt.ok ? (!polling && operation.rpcMethod === 'SendMessage' ? receipt.result.task : receipt.result) : null;
        // Keep the known task binding on a failed poll. Missing fresh business
        // fields stay missing, while the next wake still queries the same task.
        const remoteTaskId = remoteTask?.id ?? previous?.projection.remoteTaskId
          ?? (operation.rpcMethod !== 'SendMessage' && typeof params.id === 'string' ? params.id : null);
        const remoteTaskState = remoteTask?.status?.state ?? previous?.projection.remoteTaskState
          ?? (remoteTaskId ? 'TASK_STATE_UNSPECIFIED' : null);
        const value = receipt.ok ? (remoteTask ? { task: remoteTask } : receipt.result) : {};
        const projection = { ...Object.fromEntries(Object.entries(operation.fields).map(([name, rule]) => [name, field(value, rule)])),
          httpAccepted: receipt.ok, providerRef: route.providerRef, observedAt: clock(),
          responseHash: receipt.responseHash, responseBytes: receipt.responseBytes,
          protocolSource: { url: route.sourceUrl, sourceHash: route.sourceHash }, remoteTaskId, remoteTaskState,
          authorizationRequired: receipt.authorizationRequired === true || remoteTaskState === 'TASK_STATE_AUTH_REQUIRED',
          inputRequired: remoteTaskState === 'TASK_STATE_INPUT_REQUIRED',
          remoteArtifactHashes: (remoteTask?.artifacts ?? []).map(artifact => ({ artifactId: artifact.artifactId, artifactHash: digest(artifact) })),
          providerReportedCompletion: receipt.ok && remoteTaskState === 'TASK_STATE_COMPLETED',
          protocolMintsCapacity: false, protocolProvidesIndependentOutcome: false,
          ...(route.kind === 'A2A_TASK_EXECUTION_V1' ? { providerOutput: {
            artifacts: structuredClone(remoteTask?.artifacts ?? []),
            message: structuredClone(receipt.ok && !remoteTask ? receipt.result.message ?? null : null) } } : {}),
          ...(receipt.error ? { remoteErrorCode: receipt.error.code } : {}) };
        previous = { requestHash, receipt, projection };
        // Persist the initial task before any optional polling. A process stop or
        // a failed GetTask cannot erase an acknowledged effect's remote identity.
        saved.save(previous);
        if (!receipt.ok || !isPendingA2AResourceTask(projection) || projection.authorizationRequired
          || projection.inputRequired || Date.now() >= waitUntil) return projection;
        await new Promise(resolve => setTimeout(resolve, Math.min(500, Math.max(1, waitUntil - Date.now()))));
      }
    });
  } });
}
