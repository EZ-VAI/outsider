/* A connected witness must explicitly declare which existing read fields are
 * usable before an effect. This module neither creates a route nor reads it.
 * Source values remain typed facts; no provider status becomes satisfaction. */
import { canonicalizeStrict } from './canonical.js';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';
import { effectPreconditionEvidenceBinding, EFFECT_PRECONDITION_EVIDENCE_SCHEMA } from './outsider-effect-preconditions.js';

export const NATIVE_PRECONDITION_OBSERVATION_SCHEMA = 'outsider/native-precondition-observation/v1';
export const NATIVE_PRECONDITION_CATALOG_SCHEMA = 'outsider/native-precondition-catalog/v1';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FIELD = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
// These are transport metadata, written by createNativeResourceRoute after
// source-field mapping. They cannot stand in for a provider-observed fact.
const metadataFields = new Set(['httpAccepted', 'providerRef', 'observedAt', 'responseHash', 'responseBytes', 'protocolSource']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, fields) => object(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fail = reason => { const code = `NATIVE_PRECONDITION_${reason}`; throw Object.assign(new TypeError(code), { code }); };
function copy(value, reason, maximumBytes = 131072) {
  let encoded;
  try { encoded = canonicalizeStrict(value); } catch { fail(reason); }
  if (Buffer.byteLength(encoded) > maximumBytes) fail(reason);
  return JSON.parse(encoded);
}
function validatePointer(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 512 || value && !value.startsWith('/') || /~(?![01])/u.test(value))
    fail('SOURCE_FIELD_INVALID');
  const tokens = value ? value.slice(1).split('/').map(token => token.replaceAll('~1', '/').replaceAll('~0', '~')) : [];
  if (tokens.length > 16 || tokens.some(token => forbidden.has(token))) fail('SOURCE_FIELD_INVALID');
}
function sourceField(route, name) {
  if (typeof name !== 'string' || !FIELD.test(name) || forbidden.has(name) || metadataFields.has(name)
    || !object(route.observe.fields) || !Object.hasOwn(route.observe.fields, name)) fail('SOURCE_FIELD_NOT_DECLARED');
  // String pointers preserve the actual source JSON value. Enum mappings or
  // configured defaults would change its type or meaning and are not this v1.
  validatePointer(route.observe.fields[name]);
}
function sourceInstant(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/u.exec(value);
  if (!match) return null;
  const wall = `${match[1]}.${(match[2] ?? '').padEnd(3, '0')}Z`;
  if (!instant(wall) || match[3] !== 'Z' && (Number(match[3].slice(1, 3)) > 23 || Number(match[3].slice(4)) > 59)
    || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

export function normalizeNativePreconditionObservation(route) {
  if (!object(route)) fail('ROUTE_INVALID');
  route = copy(route, 'ROUTE_INVALID', 524288);
  if (!Object.hasOwn(route, 'preconditionObservation')) return null;
  const contract = copy(route.preconditionObservation, 'CONTRACT_INVALID');
  if (!exact(contract, ['schema', 'readOnly', 'predicates', 'time']) || contract.schema !== NATIVE_PRECONDITION_OBSERVATION_SCHEMA
    || contract.readOnly !== true || !Array.isArray(contract.predicates) || contract.predicates.length < 1 || contract.predicates.length > 64)
    fail('CONTRACT_INVALID');
  let origin;
  try { origin = new URL(route.origin); } catch { fail('ROUTE_INVALID'); }
  if (origin.protocol !== 'https:' || origin.origin !== route.origin || origin.username || origin.password
    || typeof route.providerRef !== 'string' || !route.providerRef || typeof route.sourceUrl !== 'string' || !route.sourceUrl
    || typeof route.sourceHash !== 'string' || !HASH.test(route.sourceHash)
    || !object(route.observe) || route.observe.method !== 'GET' || Object.hasOwn(route.observe, 'body')
    || typeof route.observe.path !== 'string' || !route.observe.path.startsWith('/') || route.observe.path.startsWith('//')
    || !Array.isArray(route.observe.httpStatuses) || !route.observe.httpStatuses.length
    || route.observe.httpStatuses.some(status => !Number.isInteger(status) || status < 200 || status > 299))
    fail('READ_ONLY_OBSERVATION_ROUTE_REQUIRED');
  const ids = new Set();
  for (const predicate of contract.predicates) {
    if (!exact(predicate, ['predicateId', 'description', 'valueType', 'field'])
      || typeof predicate.predicateId !== 'string' || !ID.test(predicate.predicateId) || ids.has(predicate.predicateId)
      || typeof predicate.description !== 'string' || !predicate.description.trim() || Buffer.byteLength(predicate.description) > 512
      || !['boolean', 'number', 'string'].includes(predicate.valueType)) fail('CONTRACT_INVALID');
    sourceField(route, predicate.field); ids.add(predicate.predicateId);
  }
  if (exact(contract.time, ['basis']) && contract.time.basis === 'RESPONSE_RECEIVED_AT') return contract;
  if (!exact(contract.time, ['basis', 'field']) || contract.time.basis !== 'SOURCE_OBSERVED_AT') fail('TIME_CONTRACT_INVALID');
  sourceField(route, contract.time.field);
  return contract;
}

export function nativePreconditionObservationCatalog(route) {
  const contract = normalizeNativePreconditionObservation(route);
  if (!contract) return null;
  return { schema: NATIVE_PRECONDITION_CATALOG_SCHEMA, contractHash: digest(contract),
    predicates: contract.predicates.map(({ predicateId, description, valueType }) => ({ predicateId, description, valueType })),
    timeBasis: contract.time.basis, readOnly: true, pointObservationOnly: true,
    continuousValidityClaimed: false, sourceCurrentnessIndependentlyProven: false, observerAuthorityExpanded: false };
}

/** Invoke before any read. A model's condition cannot opt a final-result
 * witness into precondition work or invent an undeclared predicate/type. */
export function assertNativePreconditionRequest({ route, preconditionBinding }) {
  const contract = normalizeNativePreconditionObservation(route);
  if (!contract) fail('OBSERVATION_NOT_DECLARED');
  const binding = copy(preconditionBinding, 'BINDING_INVALID', 264192);
  let expected;
  try { expected = effectPreconditionEvidenceBinding(binding); } catch { fail('BINDING_INVALID'); }
  if (digest(binding) !== digest(expected)) fail('BINDING_INVALID');
  const declarations = new Map(contract.predicates.map(predicate => [predicate.predicateId, predicate]));
  for (const condition of binding.contract.conditions) {
    const declared = declarations.get(condition.predicateId);
    if (!declared) fail('PREDICATE_NOT_DECLARED');
    if (declared.valueType !== condition.valueType) fail('PREDICATE_TYPE_NOT_DECLARED');
  }
  return { contract, contractHash: digest(contract), binding };
}

/** Receipt is the original native-client projection, including its original
 * response hash and receive time. A fresh read operation has its own identity;
 * it must never overwrite or be confused with the effect's bound identity. */
export function projectNativePreconditionObservation({ route, preconditionBinding, receipt, readOperationId, readStartedAt }) {
  const { contract, contractHash, binding } = assertNativePreconditionRequest({ route, preconditionBinding });
  if (typeof readOperationId !== 'string' || !readOperationId.trim() || Buffer.byteLength(readOperationId) > 256
    || /[\u0000-\u001f\u007f]/u.test(readOperationId) || !instant(readStartedAt)) fail('READ_CONTEXT_INVALID');
  const routeContractHash = digest(copy(route, 'ROUTE_INVALID', 524288));
  const provenance = { schema: 'outsider/native-precondition-observation-receipt/v1', bindingHash: binding.bindingHash,
    contractHash, routeContractHash, providerRef: route.providerRef, protocolSourceHash: route.sourceHash,
    readOperationIdHash: digest(readOperationId), readStartedAt, readCompletedAt: null, responseHash: null, receiptHash: null,
    timeBasis: contract.time.basis, sourceObservedAt: null, reportedPredicateIds: [], unavailablePredicates: [],
    pointObservationOnly: true, continuousValidityClaimed: false, sourceCurrentnessIndependentlyProven: false,
    atomicCheckAndAct: false, observerAuthorityExpanded: false };
  const unavailable = reason => ({ evidence: null, provenance: { ...provenance, reason } });
  let source;
  try { source = copy(receipt, 'RECEIPT_INVALID', 524288); } catch { return unavailable('SOURCE_RECEIPT_INVALID'); }
  provenance.receiptHash = digest(source);
  if (!object(source) || source.httpAccepted !== true) return unavailable('SOURCE_RESPONSE_NOT_ACCEPTED');
  if (source.providerRef !== route.providerRef || source.protocolSource?.sourceHash !== route.sourceHash
    || source.protocolSource?.url !== route.sourceUrl || typeof source.responseHash !== 'string' || !HASH.test(source.responseHash)
    || !Number.isInteger(source.responseBytes) || source.responseBytes < 0 || source.responseBytes > 250000)
    return unavailable('SOURCE_RESPONSE_BINDING_MISMATCH');
  provenance.responseHash = source.responseHash;
  if (!instant(source.observedAt)) return unavailable('SOURCE_READ_TIME_INVALID');
  provenance.readCompletedAt = source.observedAt;
  if (Date.parse(source.observedAt) < Date.parse(readStartedAt)) return unavailable('SOURCE_RESPONSE_PREDATES_READ');
  let evidenceObservedAt = source.observedAt;
  if (contract.time.basis === 'SOURCE_OBSERVED_AT') {
    const value = Object.hasOwn(source, contract.time.field) ? source[contract.time.field] : null;
    provenance.sourceObservedAt = sourceInstant(value);
    if (provenance.sourceObservedAt === null) return unavailable('SOURCE_OBSERVATION_TIME_MISSING_OR_INVALID');
    if (Date.parse(value) < Date.parse(readStartedAt)) return unavailable('SOURCE_OBSERVATION_PREDATES_READ');
    if (Date.parse(value) > Date.parse(source.observedAt)) return unavailable('SOURCE_OBSERVATION_FROM_FUTURE');
    evidenceObservedAt = provenance.sourceObservedAt;
  }
  const declarations = new Map(contract.predicates.map(predicate => [predicate.predicateId, predicate])), facts = [];
  for (const condition of binding.contract.conditions) {
    const declared = declarations.get(condition.predicateId), present = Object.hasOwn(source, declared.field);
    const value = present ? source[declared.field] : null;
    const reason = !present ? 'SOURCE_FIELD_MISSING' : value === null ? 'SOURCE_FIELD_NULL'
      : typeof value !== declared.valueType || declared.valueType === 'number' && (!Number.isFinite(value) || Object.is(value, -0))
        || declared.valueType === 'string' && Buffer.byteLength(value) > 2048 ? 'SOURCE_FIELD_TYPE_MISMATCH' : null;
    if (reason) { provenance.unavailablePredicates.push({ predicateId: condition.predicateId, reason }); continue; }
    const evidenceHash = digest({ schema: 'outsider/native-precondition-fact/v1', bindingHash: binding.bindingHash,
      contractHash, routeContractHash, responseHash: source.responseHash, receiptHash: provenance.receiptHash,
      readOperationIdHash: provenance.readOperationIdHash, readStartedAt, readCompletedAt: source.observedAt,
      timeBasis: contract.time.basis, sourceObservedAt: provenance.sourceObservedAt,
      predicate: declared, value });
    facts.push({ predicateId: declared.predicateId, valueType: declared.valueType, value, evidenceHash });
    provenance.reportedPredicateIds.push(declared.predicateId);
  }
  return { evidence: { schema: EFFECT_PRECONDITION_EVIDENCE_SCHEMA, bindingHash: binding.bindingHash,
    observedAt: evidenceObservedAt, facts }, provenance };
}
