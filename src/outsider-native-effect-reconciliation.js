/* A connection may explicitly map an existing provider's read-only lookup by
 * the original operation and reservation. This is not generic HTTP retry or
 * an idempotency promise. Even a source's NOT_STARTED answer does not fence a
 * late submission, authorize a new execute, or authorize a recovery effect. */
import { canonicalizeStrict } from './canonical.js';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';

export const NATIVE_EFFECT_RECONCILIATION_SCHEMA = 'outsider/native-effect-reconciliation/v1';
export const NATIVE_EFFECT_RECONCILIATION_BINDING_SCHEMA = 'outsider/native-effect-reconciliation-binding/v1';
export const NATIVE_EFFECT_RECONCILIATION_OBSERVATION_SCHEMA = 'outsider/native-effect-reconciliation-observation/v1';
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const STATES = ['NOT_STARTED', 'UNKNOWN', 'RUNNING', 'COMPLETE'];
const MAXIMUM_BYTES = 262144;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, fields) => object(value) && Object.keys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field));
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const identifier = value => typeof value === 'string' && ID.test(value);
const sourceIdentifier = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 2048;
const hash = value => typeof value === 'string' && HASH.test(value);
const fail = reason => {
  const code = `NATIVE_EFFECT_RECONCILIATION_${reason}`;
  throw Object.assign(new TypeError(code), { code });
};
function copy(value, reason) {
  let encoded;
  try { encoded = canonicalizeStrict(value); } catch { fail(reason); }
  if (Buffer.byteLength(encoded) > MAXIMUM_BYTES) fail(reason);
  return JSON.parse(encoded);
}
function jsonPointer(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.length > 2048 || /~(?![01])/u.test(value)) return false;
  return !value.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~'))
    .some(part => ['__proto__', 'prototype', 'constructor'].includes(part));
}
function requestReferences(operation) {
  if (typeof operation.path !== 'string') fail('OPERATION_INVALID');
  const references = [];
  const visit = value => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (object(value)) {
      if (Object.hasOwn(value, '$ref')) {
        if (!exact(value, ['$ref']) || !jsonPointer(value.$ref)) fail('OPERATION_INVALID');
        references.push(value.$ref);
      } else Object.values(value).forEach(visit);
    }
  };
  visit(operation.body);
  for (const match of (operation.path ?? '').matchAll(/\{(\/[^}]+)\}/gu)) {
    if (!jsonPointer(match[1])) fail('OPERATION_INVALID');
    references.push(match[1]);
  }
  return references;
}

/** No default enables this protocol for an old route. The additional lookup
 * operation uses the original client's mapping and private response storage;
 * its new query operationId must never replace the original execution ID. */
export function normalizeNativeEffectReconciliation(value, { route } = {}) {
  const contract = copy(value, 'CONTRACT_INVALID');
  if (!exact(contract, ['schema', 'sourceHash', 'retryIntervalMs', 'readOnly', 'lookup'])
    || contract.schema !== NATIVE_EFFECT_RECONCILIATION_SCHEMA || !hash(contract.sourceHash)
    || !Number.isInteger(contract.retryIntervalMs) || contract.retryIntervalMs < 1000 || contract.retryIntervalMs > 3600000
    || contract.readOnly !== true || contract.lookup !== 'ORIGINAL_OPERATION_AND_RESERVATION') fail('CONTRACT_INVALID');
  if (route === undefined) return contract;
  const mapped = copy(route, 'ROUTE_INVALID'), operation = mapped?.reconcileExecution;
  if (!object(mapped) || !hash(mapped.sourceHash) || !sourceIdentifier(mapped.providerRef)
    || !object(mapped.effectReconciliation) || digest(mapped.effectReconciliation) !== digest(contract)) fail('ROUTE_INVALID');
  // The explicit connection declares that POST, when used, is an existing
  // query operation. The HTTP verb alone cannot prove provider read-onlyness.
  if (!object(operation) || Object.keys(operation).some(key => !['method', 'path', 'body', 'fields', 'httpStatuses'].includes(key))
    || !['GET', 'POST'].includes(operation.method) || typeof operation.path !== 'string'
    || !operation.path.startsWith('/') || operation.path.startsWith('//') || operation.path.includes('#') || operation.path.length > 8192
    || operation.method === 'GET' && Object.hasOwn(operation, 'body')
    || !Array.isArray(operation.httpStatuses) || !operation.httpStatuses.length || operation.httpStatuses.length > 16
    || new Set(operation.httpStatuses).size !== operation.httpStatuses.length
    || operation.httpStatuses.some(status => !Number.isInteger(status) || status < 200 || status > 299)
    || !exact(operation.fields, ['operationId', 'reservationId', 'state', 'executionId'])
    || !['operationId', 'reservationId', 'executionId'].every(field => jsonPointer(operation.fields[field]))) fail('OPERATION_INVALID');
  const state = operation.fields.state;
  if (!exact(state, ['pointer', 'map']) || !jsonPointer(state.pointer) || !object(state.map)
    || Object.keys(state.map).length < 1 || Object.keys(state.map).length > 64
    || Object.keys(state.map).some(key => !key || ['__proto__', 'prototype', 'constructor', '*'].includes(key))
    || Object.values(state.map).some(value => !STATES.includes(value))) fail('STATE_MAPPING_INVALID');
  const lookupReferences = requestReferences(operation);
  const allowed = ['programHash', 'nodeId', 'route', 'operationId', 'reservationId', 'connectionHash', 'providerRef', 'protocolSourceHash', 'bindingHash']
    .map(field => `/reconciliation/${field}`);
  if (!lookupReferences.includes('/reconciliation/operationId') || !lookupReferences.includes('/reconciliation/reservationId')
    || lookupReferences.some(ref => !allowed.includes(ref))) fail('LOOKUP_BINDING_MISSING');
  if (!object(mapped.execute)) fail('EXECUTION_BINDING_MISSING');
  const executionReferences = requestReferences(mapped.execute);
  const header = mapped.execute.idempotencyHeader;
  if (!(executionReferences.includes('/operationId') || typeof header === 'string' && /^[!#$%&'*+.^_`|~A-Za-z0-9-]+$/u.test(header))
    || !executionReferences.includes('/reservation/reservationId')) fail('EXECUTION_BINDING_MISSING');
  return contract;
}

export function nativeEffectReconciliationBinding({ programHash, nodeId, route, operationId, reservationId,
  connectionHash, providerRef, contract, protocolSourceHash = contract?.sourceHash }) {
  if (!hash(programHash) || !identifier(nodeId) || !['PRIMARY', 'RECOVERY'].includes(route) || !identifier(operationId)
    || !sourceIdentifier(reservationId) || !hash(connectionHash) || !sourceIdentifier(providerRef) || !hash(protocolSourceHash)) fail('BINDING_INVALID');
  const body = { schema: NATIVE_EFFECT_RECONCILIATION_BINDING_SCHEMA, programHash, nodeId, route, operationId,
    reservationId, connectionHash, providerRef, protocolSourceHash, contract: normalizeNativeEffectReconciliation(contract) };
  return { ...body, bindingHash: digest(body) };
}
function validatedBinding(binding) {
  const value = copy(binding, 'BINDING_INVALID');
  if (!exact(value, ['schema', 'programHash', 'nodeId', 'route', 'operationId', 'reservationId', 'connectionHash',
    'providerRef', 'protocolSourceHash', 'contract', 'bindingHash'])
    || value.schema !== NATIVE_EFFECT_RECONCILIATION_BINDING_SCHEMA || !hash(value.bindingHash)) fail('BINDING_INVALID');
  let expected;
  try { expected = nativeEffectReconciliationBinding(value); } catch { fail('BINDING_INVALID'); }
  if (expected.bindingHash !== value.bindingHash) fail('BINDING_INVALID');
  return expected;
}

/** Consume only the original native client's source-present field projection.
 * COMPLETE establishes a reported lifecycle endpoint, not successful work. The
 * component still uses its original status and independent acceptance witness.
 * Raw replies and execution identifiers belong in private execution storage. */
export function projectNativeEffectReconciliation({ binding, observation, observationStartedAt, observedAt }) {
  const bound = validatedBinding(binding);
  if (!instant(observationStartedAt) || !instant(observedAt) || Date.parse(observationStartedAt) > Date.parse(observedAt))
    fail('OBSERVATION_CONTEXT_INVALID');
  const next = new Date(Date.parse(observedAt) + bound.contract.retryIntervalMs);
  if (!Number.isFinite(next.getTime())) fail('OBSERVATION_CONTEXT_INVALID');
  let responseHash = null, identityMatched = false;
  const report = (state, reason, executionId = null) => ({ schema: NATIVE_EFFECT_RECONCILIATION_OBSERVATION_SCHEMA,
    state, reason, bindingHash: bound.bindingHash, contractHash: digest(bound.contract), observationStartedAt, observedAt,
    responseHash, executionId, identityMatched, ...(state === 'COMPLETE' ? {} : { retryAfter: next.toISOString() }),
    readOnly: true, originalOperationPreserved: true, newExecutionAuthorized: false, recoveryAuthorized: false,
    independentOutcomeEvidence: false, outcomeSatisfied: false });
  const unknown = reason => report('UNKNOWN', reason);
  if (observation === undefined || observation === null) return unknown('SOURCE_RESPONSE_REQUIRED');
  let source;
  try { source = copy(observation, 'OBSERVATION_INVALID'); } catch { return unknown('SOURCE_RESPONSE_INVALID'); }
  if (!object(source) || !hash(source.responseHash)) return unknown('SOURCE_RESPONSE_INVALID');
  responseHash = source.responseHash;
  if (source.httpAccepted !== true) return unknown('SOURCE_QUERY_NOT_ACCEPTED');
  if (source.operationId !== bound.operationId || source.reservationId !== bound.reservationId
    || source.providerRef !== bound.providerRef || source.protocolSource?.sourceHash !== bound.protocolSourceHash)
    return unknown('SOURCE_IDENTITY_MISMATCH');
  identityMatched = true;
  // This is the actual local read interval from the native client, not a new
  // claim that the provider measured the underlying world at that instant.
  if (!instant(source.observedAt) || Date.parse(source.observedAt) < Date.parse(observationStartedAt)
    || Date.parse(source.observedAt) > Date.parse(observedAt)) return unknown('SOURCE_QUERY_NOT_CURRENT');
  if (!STATES.includes(source.state)) return unknown('SOURCE_STATE_UNREPORTED');
  if (source.executionId !== null && source.executionId !== undefined && !sourceIdentifier(source.executionId))
    return unknown('SOURCE_EXECUTION_ID_INVALID');
  const executionId = source.executionId ?? null;
  if (source.state === 'NOT_STARTED' && executionId !== null) return unknown('SOURCE_STATE_INCONSISTENT');
  if (source.state === 'COMPLETE' && executionId === null) return unknown('SOURCE_EXECUTION_ID_REQUIRED');
  return report(source.state, `SOURCE_OPERATION_${source.state}`, executionId);
}
