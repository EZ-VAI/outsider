/* An explicit connection may map source-observed intervals into the original
 * joint witness protocol. No request, validity period, success status or new
 * observer authority is created here. The original joint projector decides
 * freshness, common coverage and the final acceptance result. */
import { canonicalizeStrict } from './canonical.js';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';
import { JOINT_STATE_EVIDENCE_SCHEMA, jointStateEvidenceBinding } from './outsider-joint-state-acceptance.js';
import { normalizeNativeObservationSubjectIdentity, assertNativeObservationSubjectBinding } from './outsider-native-observation-subject.js';
import { EFFECT_PRECONDITIONS_SCHEMA, normalizeEffectPreconditions } from './outsider-effect-preconditions.js';

export const NATIVE_JOINT_STATE_OBSERVATION_SCHEMA = 'outsider/native-joint-state-observation/v1';
export const NATIVE_JOINT_STATE_CATALOG_SCHEMA = 'outsider/native-joint-state-catalog/v1';
export const NATIVE_JOINT_STATE_OBSERVATION_SCHEMA_V2 = 'outsider/native-joint-state-observation/v2';
export const NATIVE_JOINT_STATE_CATALOG_SCHEMA_V2 = 'outsider/native-joint-state-catalog/v2';
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const FIELD = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const IDENTITIES = ['programHash', 'executionRoute', 'providerRef', 'operationId', 'reservationId', 'executionId', 'acceptanceContract'];
const REQUIRED_SOURCE_IDENTITIES = ['reservationId', 'executionId', 'acceptanceContract'];
const STATEMENT_FIELDS = ['status', 'observedAt', 'validFrom', 'validUntil'];
const STATUSES = ['SATISFIED', 'NOT_SATISFIED', 'INCONCLUSIVE'];
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
const metadataFields = new Set(['httpAccepted', 'providerRef', 'observedAt', 'responseHash', 'responseBytes', 'protocolSource']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, keys) => object(value) && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const identifier = value => typeof value === 'string' && ID.test(value);
const hash = value => typeof value === 'string' && HASH.test(value);
const sourceIdentifier = value => typeof value === 'string' && value.length > 0 && Buffer.byteLength(value) <= 2048
  && !/[\u0000-\u001f\u007f]/u.test(value);
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
const fail = reason => { const code = `NATIVE_JOINT_STATE_${reason}`; throw Object.assign(new TypeError(code), { code }); };
function copy(value, reason, maximumBytes = 524288) {
  let encoded;
  try { encoded = canonicalizeStrict(value); } catch { fail(reason); }
  if (Buffer.byteLength(encoded) > maximumBytes) fail(reason);
  return JSON.parse(encoded);
}
function pointerTokens(value, allowRoot = true) {
  if (typeof value !== 'string' || Buffer.byteLength(value) > 512 || (!allowRoot || value) && !value.startsWith('/')
    || /~(?![01])/u.test(value)) fail('SOURCE_FIELD_INVALID');
  const tokens = value ? value.slice(1).split('/').map(part => part.replaceAll('~1', '/').replaceAll('~0', '~')) : [];
  if (tokens.length > 16 || tokens.some(token => forbidden.has(token))) fail('SOURCE_FIELD_INVALID');
  return tokens;
}
function sourceField(route, name) {
  if (typeof name !== 'string' || !FIELD.test(name) || forbidden.has(name) || metadataFields.has(name)
    || !object(route.observe.fields) || !Object.hasOwn(route.observe.fields, name)) fail('SOURCE_FIELD_NOT_DECLARED');
  // Enum maps and defaults are not direct source facts. Metadata written by
  // the HTTP client cannot become a source time, execution identity or state.
  pointerTokens(route.observe.fields[name]);
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
function statementFieldNames(fields) {
  if (!exact(fields, STATEMENT_FIELDS) && !exact(fields, [...STATEMENT_FIELDS, 'evidenceHash'])) fail('STATEMENT_MAPPING_INVALID');
  return Object.keys(fields);
}
function queryIdentityFields(route) {
  return ['reservationId', 'executionId'].filter(field => {
    const reference = `/${field === 'reservationId' ? 'reservation' : 'execution'}/${field}`;
    let marker = `outsider_${field}_query_identity`;
    while (route.observe.path.includes(marker)) marker += '_';
    let present = false;
    const marked = route.observe.path.replace(/\{(\/[^}]+)\}/gu, (_, ref) => {
      if (ref !== reference) return 'other_bound_value';
      present = true; return marker;
    });
    // URL normalization can erase a path segment followed by /.. . Merely
    // seeing a placeholder in the configured string is not a bound query.
    return present && new URL(marked, route.origin).href.includes(marker);
  });
}
const sourceIdentityNames = contract => IDENTITIES.filter(name => Object.hasOwn(contract.identity, name));
function validateStatusValues(values) {
  if (!object(values) || Object.keys(values).length < 1 || Object.keys(values).length > 64
    || Object.keys(values).some(value => !value || Buffer.byteLength(value) > 256 || forbidden.has(value)
      || ['*', 'default', 'DEFAULT'].includes(value))
    || Object.values(values).some(value => !STATUSES.includes(value))) fail('STATUS_VALUES_INVALID');
}
function statementTree(fields) {
  const root = new Map();
  for (const [field, pointer] of Object.entries(fields)) {
    const tokens = pointerTokens(pointer, false); let node = root;
    for (let index = 0; index < tokens.length; index++) {
      const token = tokens[index], last = index === tokens.length - 1;
      if (last) {
        if (node.has(token)) fail('STATEMENT_MAPPING_OVERLAP');
        node.set(token, field);
      } else {
        if (node.has(token) && !(node.get(token) instanceof Map)) fail('STATEMENT_MAPPING_OVERLAP');
        if (!node.has(token)) node.set(token, new Map());
        node = node.get(token);
      }
    }
  }
  return root;
}
function mappedStatement(source, tree, result = {}) {
  if (!object(source) || Object.keys(source).length !== tree.size) return null;
  for (const [key, target] of tree) {
    if (!Object.hasOwn(source, key)) return null;
    if (target instanceof Map) { if (!mappedStatement(source[key], target, result)) return null; }
    else result[target] = source[key];
  }
  return result;
}
function validateStatementMapping(route, mapping) {
  const statusKeys = object(mapping) && Object.hasOwn(mapping, 'statusValues') ? ['statusValues'] : [];
  if (exact(mapping, ['kind', 'fields', ...statusKeys]) && mapping.kind === 'FIELDS') {
    for (const field of statementFieldNames(mapping.fields)) sourceField(route, mapping.fields[field]);
  } else if (exact(mapping, ['kind', 'field', 'fields', ...statusKeys]) && mapping.kind === 'ARRAY') {
    sourceField(route, mapping.field); statementFieldNames(mapping.fields); statementTree(mapping.fields);
  } else fail('STATEMENT_MAPPING_INVALID');
  if (statusKeys.length) validateStatusValues(mapping.statusValues);
}
function subjectConditions(value) {
  let normalized;
  try { normalized = normalizeEffectPreconditions({ schema: EFFECT_PRECONDITIONS_SCHEMA,
    observerRequirementId: 'interval_condition_validation', maximumEvidenceAgeMs: 1, retryIntervalMs: 1000, conditions: value }).conditions; }
  catch { fail('SUBJECT_CONDITIONS_INVALID'); }
  // Conjunction order changes no condition. The declaration itself remains
  // frozen as supplied; this separate comparison hash only sorts predicates.
  return normalized.toSorted((left, right) => left.predicateId < right.predicateId ? -1 : left.predicateId > right.predicateId ? 1 : 0);
}

export function normalizeNativeJointStateObservation(route) {
  if (!object(route)) fail('ROUTE_INVALID');
  route = copy(route, 'ROUTE_INVALID');
  if (!Object.hasOwn(route, 'jointStateObservation')) return null;
  const contract = route.jointStateObservation;
  if (contract?.schema === NATIVE_JOINT_STATE_OBSERVATION_SCHEMA_V2) {
    const subjectIdentity = normalizeNativeObservationSubjectIdentity(route);
    if (!exact(contract, ['schema', 'readOnly', 'sourceHash', 'intervalMeaning', 'subjectIdentityHash', 'conditions', 'statements'])
      || contract.readOnly !== true || contract.intervalMeaning !== 'SOURCE_OBSERVED_CONTINUOUS_STATE'
      || !hash(contract.sourceHash) || contract.sourceHash !== route.sourceHash || !subjectIdentity
      || contract.subjectIdentityHash !== digest(subjectIdentity)) fail('CONTRACT_INVALID');
    subjectConditions(contract.conditions);
    validateStatementMapping(route, contract.statements);
    return contract;
  }
  if (!exact(contract, ['schema', 'readOnly', 'sourceHash', 'intervalMeaning', 'identity', 'statements'])
    || contract.schema !== NATIVE_JOINT_STATE_OBSERVATION_SCHEMA || contract.readOnly !== true
    || contract.intervalMeaning !== 'SOURCE_OBSERVED_CONTINUOUS_STATE' || !hash(contract.sourceHash)
    || contract.sourceHash !== route.sourceHash || !object(contract.identity)
    || REQUIRED_SOURCE_IDENTITIES.some(name => !Object.hasOwn(contract.identity, name))
    || Object.keys(contract.identity).some(name => !IDENTITIES.includes(name))) fail('CONTRACT_INVALID');
  let origin;
  try { origin = new URL(route.origin); } catch { fail('ROUTE_INVALID'); }
  const operation = route.observe;
  if (origin.protocol !== 'https:' || origin.origin !== route.origin || origin.username || origin.password
    || !sourceIdentifier(route.providerRef) || !sourceIdentifier(route.sourceUrl)
    || !object(operation) || operation.method !== 'GET' || Object.hasOwn(operation, 'body')
    || typeof operation.path !== 'string' || !operation.path.startsWith('/') || operation.path.startsWith('//')
    || operation.path.includes('#') || operation.path.length > 8192
    || !Array.isArray(operation.httpStatuses) || !operation.httpStatuses.length || operation.httpStatuses.length > 16
    || new Set(operation.httpStatuses).size !== operation.httpStatuses.length
    || operation.httpStatuses.some(status => !Number.isInteger(status) || status < 200 || status > 299)) fail('READ_ONLY_OBSERVATION_ROUTE_REQUIRED');
  for (const field of Object.values(contract.identity)) sourceField(route, field);
  // Existing business interfaces need not know an Outsider program hash. The
  // source must still identify the actual reserved execution and the request
  // must query that original resource. Complete source echo remains valid for
  // interfaces which return all seven identities from a generic read URL.
  if (sourceIdentityNames(contract).length < IDENTITIES.length && !queryIdentityFields(route).length)
    fail('RESOURCE_IDENTITY_QUERY_REQUIRED');
  validateStatementMapping(route, contract.statements);
  return contract;
}

export function nativeJointStateObservationCatalog(route) {
  const contract = normalizeNativeJointStateObservation(route);
  if (contract?.schema === NATIVE_JOINT_STATE_OBSERVATION_SCHEMA_V2) return {
    schema: NATIVE_JOINT_STATE_CATALOG_SCHEMA_V2, contractHash: digest(contract), sourceHash: contract.sourceHash,
    subjectIdentityHash: contract.subjectIdentityHash, supportedTimingModes: ['CURRENT', 'WINDOW'], readOnly: true,
    conditions: subjectConditions(contract.conditions), conditionsHash: digest(subjectConditions(contract.conditions)),
    intervalConditionScope: 'ALL_DECLARED_CONDITIONS',
    intervalMeaning: contract.intervalMeaning, identityBindingMode: 'SOURCE_SUBJECT_AND_BOUND_READ',
    sourceIdentityFields: Object.keys(route.subjectIdentity.fields),
    locallyBoundIdentityFields: ['programHash', 'requirementId', 'acceptanceContract', 'providerRef', 'readOperationId'],
    sourceIntervalEvidenceEstablished: false, independentObservationProven: false,
    sourceIntervalsAreCommitments: false, observerAuthorityExpanded: false, sourceProtocolSemanticsIndependentlyProven: false,
    ...(contract.statements.statusValues ? { sourceStatusMapping: 'DECLARED_EXACT_VALUES',
      sourceStatusValueCount: Object.keys(contract.statements.statusValues).length } : {}) };
  return contract ? { schema: NATIVE_JOINT_STATE_CATALOG_SCHEMA, contractHash: digest(contract), sourceHash: contract.sourceHash,
    supportedTimingModes: ['CURRENT', 'WINDOW'], readOnly: true, intervalMeaning: contract.intervalMeaning,
    sourceIntervalEvidenceEstablished: false, independentObservationProven: false,
    sourceIntervalsAreCommitments: false, observerAuthorityExpanded: false,
    ...(sourceIdentityNames(contract).length < IDENTITIES.length ? {
      identityBindingMode: 'SOURCE_RESOURCE_IDS_AND_BOUND_READ', sourceIdentityFields: sourceIdentityNames(contract),
      locallyBoundIdentityFields: IDENTITIES.filter(name => !Object.hasOwn(contract.identity, name)),
      sourceQueryIdentityFields: queryIdentityFields(route), sourceProtocolSemanticsIndependentlyProven: false } : {}),
    ...(contract.statements.statusValues ? { sourceStatusMapping: 'DECLARED_EXACT_VALUES',
      sourceStatusValueCount: Object.keys(contract.statements.statusValues).length, sourceProtocolSemanticsIndependentlyProven: false } : {}) } : null;
}

/** Only the source's declared conjunction can use its interval statements.
 * Other thresholds may still use ordinary point observations of this source. */
export function nativeSubjectJointStateObservationCatalog(route, conditions) {
  const catalog = nativeJointStateObservationCatalog(route);
  return catalog?.schema === NATIVE_JOINT_STATE_CATALOG_SCHEMA_V2
    && catalog.conditionsHash === digest(subjectConditions(conditions)) ? catalog : null;
}

/** Validate before the existing source read. The selected execution comes from
 * the original program, never from a candidate, response or model's proposal. */
export function assertNativeJointStateRequest({ route, jointAcceptance, programHash, requirementId, acceptanceContract, execution }) {
  const contract = normalizeNativeJointStateObservation(route);
  if (!contract) fail('OBSERVATION_NOT_DECLARED');
  if (contract.schema !== NATIVE_JOINT_STATE_OBSERVATION_SCHEMA) fail('EXECUTION_OBSERVATION_REQUEST_REQUIRED');
  const selected = copy(execution, 'EXECUTION_BINDING_INVALID', 16384);
  if (!hash(programHash) || !identifier(requirementId) || !sourceIdentifier(acceptanceContract)
    || !exact(selected, ['route', 'providerRef', 'operationId', 'reservationId', 'executionId'])
    || !['PRIMARY', 'RECOVERY'].includes(selected.route) || !sourceIdentifier(selected.providerRef)
    || !identifier(selected.operationId) || !sourceIdentifier(selected.reservationId) || !sourceIdentifier(selected.executionId))
    fail('EXECUTION_BINDING_INVALID');
  const binding = copy(jointAcceptance, 'JOINT_BINDING_INVALID', 131072);
  let expected;
  try { expected = jointStateEvidenceBinding({ programHash, requirementId, acceptanceContract, contract: binding.contract }); }
  catch { fail('JOINT_BINDING_INVALID'); }
  if (!exact(binding, ['contract', 'bindingHash']) || digest(binding) !== digest(expected)
    || binding.contract.requirementIds !== undefined && !binding.contract.requirementIds.includes(requirementId)) fail('JOINT_BINDING_INVALID');
  const identity = { programHash, executionRoute: selected.route, providerRef: selected.providerRef,
    operationId: selected.operationId, reservationId: selected.reservationId, executionId: selected.executionId, acceptanceContract };
  return { contract, contractHash: digest(contract), binding, identity,
    executionBindingHash: digest({ requirementId, ...identity }), routeContractHash: digest(copy(route, 'ROUTE_INVALID')) };
}

/** A subject source reports its own object identity. The order, requirement,
 * selected connection and acceptance contract remain explicitly local bonds. */
export function assertNativeSubjectJointStateRequest({ route, subject, conditions, jointAcceptance, programHash, requirementId, acceptanceContract }) {
  const contract = normalizeNativeJointStateObservation(route);
  if (!contract) fail('OBSERVATION_NOT_DECLARED');
  if (contract.schema !== NATIVE_JOINT_STATE_OBSERVATION_SCHEMA_V2) fail('SUBJECT_OBSERVATION_REQUEST_REQUIRED');
  if (!hash(programHash) || !identifier(requirementId) || !sourceIdentifier(acceptanceContract)) fail('SUBJECT_BINDING_INVALID');
  const conditionsHash = digest(subjectConditions(conditions));
  if (conditionsHash !== digest(subjectConditions(contract.conditions))) fail('SUBJECT_CONDITIONS_NOT_DECLARED');
  const subjectBinding = assertNativeObservationSubjectBinding({ route, subject });
  const binding = copy(jointAcceptance, 'JOINT_BINDING_INVALID', 131072);
  let expected;
  try { expected = jointStateEvidenceBinding({ programHash, requirementId, acceptanceContract, contract: binding.contract }); }
  catch { fail('JOINT_BINDING_INVALID'); }
  if (!exact(binding, ['contract', 'bindingHash']) || digest(binding) !== digest(expected)) fail('JOINT_BINDING_INVALID');
  const routeContractHash = digest(copy(route, 'ROUTE_INVALID'));
  return { contract, contractHash: digest(contract), binding, ...subjectBinding, routeContractHash, conditionsHash,
    subjectBindingHash: digest({ schema: 'outsider/native-joint-state-subject-binding/v1', programHash, requirementId,
      acceptanceContract, routeContractHash, conditionsHash, ...subjectBinding }) };
}

function sourceReceipt({ route, receipt, readStartedAt, provenance, unavailable }) {
  let source;
  try { source = copy(receipt, 'SOURCE_RECEIPT_INVALID'); } catch { return { unavailable: unavailable('SOURCE_RECEIPT_INVALID') }; }
  provenance.receiptHash = digest(source);
  if (!object(source) || source.httpAccepted !== true) return { unavailable: unavailable('SOURCE_RESPONSE_NOT_ACCEPTED') };
  if (source.providerRef !== route.providerRef || source.protocolSource?.url !== route.sourceUrl
    || source.protocolSource?.sourceHash !== route.sourceHash || !hash(source.responseHash)
    || !Number.isInteger(source.responseBytes) || source.responseBytes < 0 || source.responseBytes > 250000)
    return { unavailable: unavailable('SOURCE_RESPONSE_BINDING_MISMATCH') };
  provenance.responseHash = source.responseHash;
  if (!instant(source.observedAt)) return { unavailable: unavailable('SOURCE_READ_TIME_INVALID') };
  provenance.readCompletedAt = source.observedAt;
  if (Date.parse(source.observedAt) < Date.parse(readStartedAt)) return { unavailable: unavailable('SOURCE_RESPONSE_PREDATES_READ') };
  return { source };
}

function projectSourceStatements({ contract, source, provenance, unavailable, evidenceHash }) {
  const mapping = contract.statements; let rows;
  if (mapping.kind === 'FIELDS') {
    if (Object.values(mapping.fields).some(field => !Object.hasOwn(source, field))) return unavailable('SOURCE_STATEMENT_FIELD_MISSING');
    rows = [Object.fromEntries(Object.entries(mapping.fields).map(([name, field]) => [name, source[field]]))];
  } else {
    if (!Object.hasOwn(source, mapping.field) || !Array.isArray(source[mapping.field])
      || source[mapping.field].length < 1 || source[mapping.field].length > 64) return unavailable('SOURCE_STATEMENTS_REQUIRED');
    if (Buffer.byteLength(canonicalizeStrict(source[mapping.field])) > 131072) return unavailable('SOURCE_STATEMENTS_TOO_LARGE');
    const tree = statementTree(mapping.fields);
    rows = source[mapping.field].map(row => mappedStatement(row, tree));
  }
  const statements = [];
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    if (!row) return unavailable('SOURCE_STATEMENT_SHAPE_INVALID', index);
    provenance.sourceStatusValueHashes.push(digest(row.status));
    const status = mapping.statusValues ? typeof row.status === 'string' && Object.hasOwn(mapping.statusValues, row.status)
      ? mapping.statusValues[row.status] : null : row.status;
    if (!STATUSES.includes(status)) return unavailable('SOURCE_STATEMENT_STATUS_UNREPORTED', index);
    const dates = Object.fromEntries(['observedAt', 'validFrom', 'validUntil'].map(name => [name, sourceInstant(row[name])]));
    if (Object.values(dates).some(value => value === null)) return unavailable('SOURCE_STATEMENT_TIME_MISSING_OR_INVALID', index);
    if (Date.parse(dates.validFrom) > Date.parse(dates.validUntil)
      || Date.parse(dates.validUntil) > Date.parse(dates.observedAt)
      || Date.parse(dates.observedAt) > Date.parse(source.observedAt)) return unavailable('SOURCE_INTERVAL_NOT_OBSERVED', index);
    if (mapping.fields.evidenceHash !== undefined && !hash(row.evidenceHash)) return unavailable('SOURCE_EVIDENCE_HASH_INVALID', index);
    const statement = { status, ...dates };
    statements.push({ ...statement, evidenceHash: evidenceHash({ row, statement, index }) });
  }
  provenance.statementCount = statements.length;
  return { jointEvidence: { schema: JOINT_STATE_EVIDENCE_SCHEMA, bindingHash: provenance.bindingHash, statements }, provenance };
}

export function projectNativeJointStateObservation({ route, jointAcceptance, programHash, requirementId, acceptanceContract,
  execution, receipt, readOperationId, readStartedAt }) {
  const bound = assertNativeJointStateRequest({ route, jointAcceptance, programHash, requirementId, acceptanceContract, execution });
  if (!sourceIdentifier(readOperationId) || Buffer.byteLength(readOperationId) > 256 || !instant(readStartedAt)) fail('READ_CONTEXT_INVALID');
  const { contract, contractHash, binding, identity, executionBindingHash, routeContractHash } = bound;
  const provenance = { schema: 'outsider/native-joint-state-observation-receipt/v1', bindingHash: binding.bindingHash,
    contractHash, routeContractHash, protocolSourceHash: route.sourceHash, executionBindingHash,
    readOperationIdHash: digest(readOperationId), readStartedAt, readCompletedAt: null, responseHash: null, receiptHash: null,
    statementCount: 0, sourceTimeBasis: 'SOURCE_OBSERVED_INTERVALS', sourceIntervalsAreCommitments: false,
    independentObservationProven: false, observerAuthorityExpanded: false, businessTruthProven: false,
    identityBindingMode: sourceIdentityNames(contract).length === IDENTITIES.length ? 'SOURCE_ECHO_ALL_FIELDS' : 'SOURCE_RESOURCE_IDS_AND_BOUND_READ',
    sourceIdentityFields: {}, locallyBoundIdentityFields: Object.fromEntries(IDENTITIES
      .filter(name => !Object.hasOwn(contract.identity, name)).map(name => [name, digest(identity[name])])),
    sourceStatusValueHashes: [], sourceProtocolSemanticsIndependentlyProven: false };
  const unavailable = (reason, index) => ({ jointEvidence: null, provenance: { ...provenance, reason,
    ...(index === undefined ? {} : { statementIndex: index }) } });
  const projected = sourceReceipt({ route, receipt, readStartedAt, provenance, unavailable });
  if (projected.unavailable) return projected.unavailable;
  const { source } = projected;
  for (const [name, field] of Object.entries(contract.identity)) {
    if (!Object.hasOwn(source, field) || source[field] !== identity[name]) return unavailable('SOURCE_EXECUTION_IDENTITY_MISMATCH');
  }
  provenance.sourceIdentityFields = Object.fromEntries(sourceIdentityNames(contract).map(name => [name, digest(source[contract.identity[name]])]));
  return projectSourceStatements({ contract, source, provenance, unavailable, evidenceHash: ({ row, statement, index }) =>
    digest({ schema: 'outsider/native-joint-state-statement/v1',
      bindingHash: binding.bindingHash, contractHash, routeContractHash, executionBindingHash,
      readOperationIdHash: provenance.readOperationIdHash, responseHash: source.responseHash, receiptHash: provenance.receiptHash,
      statementIndex: index, sourceStatementHash: digest(row), statement }) });
}

export function projectNativeSubjectJointStateObservation({ route, subject, conditions, jointAcceptance, programHash, requirementId,
  acceptanceContract, receipt, readOperationId, readStartedAt }) {
  const bound = assertNativeSubjectJointStateRequest({ route, subject, conditions, jointAcceptance, programHash, requirementId, acceptanceContract });
  if (!sourceIdentifier(readOperationId) || Buffer.byteLength(readOperationId) > 256 || !instant(readStartedAt)) fail('READ_CONTEXT_INVALID');
  const { contract, contractHash, binding, subjectHash, subjectIdentityHash, queryBindingHash,
    requestHash, subjectBindingHash, routeContractHash, conditionsHash } = bound;
  const provenance = { schema: 'outsider/native-joint-state-observation-receipt/v2', bindingHash: binding.bindingHash,
    contractHash, routeContractHash, protocolSourceHash: route.sourceHash, subjectHash, subjectIdentityHash,
    conditionsHash, intervalConditionScope: 'ALL_DECLARED_CONDITIONS',
    subjectBindingHash, queryBindingHash, requestHash, readOperationIdHash: digest(readOperationId),
    readStartedAt, readCompletedAt: null, responseHash: null, receiptHash: null, statementCount: 0,
    sourceTimeBasis: 'SOURCE_OBSERVED_INTERVALS', sourceIntervalsAreCommitments: false,
    independentObservationProven: false, observerAuthorityExpanded: false, businessTruthProven: false,
    identityBindingMode: 'SOURCE_SUBJECT_AND_BOUND_READ', sourceIdentityFields: {},
    locallyBoundIdentityFields: Object.fromEntries(Object.entries({ programHash, requirementId, acceptanceContract,
      providerRef: route.providerRef, readOperationId }).map(([name, value]) => [name, digest(value)])),
    sourceStatusValueHashes: [], sourceProtocolSemanticsIndependentlyProven: false };
  const unavailable = (reason, index) => ({ jointEvidence: null, provenance: { ...provenance, reason,
    ...(index === undefined ? {} : { statementIndex: index }) } });
  const projected = sourceReceipt({ route, receipt, readStartedAt, provenance, unavailable });
  if (projected.unavailable) return projected.unavailable;
  const { source } = projected;
  try { assertNativeObservationSubjectBinding({ route, subject, receipt: source }); }
  catch { return unavailable('SOURCE_SUBJECT_IDENTITY_MISMATCH'); }
  provenance.sourceIdentityFields = Object.fromEntries(Object.entries(route.subjectIdentity.fields)
    .map(([name, field]) => [name, digest(source[field])]));
  return projectSourceStatements({ contract, source, provenance, unavailable, evidenceHash: ({ row, statement, index }) =>
    digest({ schema: 'outsider/native-joint-state-statement/v2', bindingHash: binding.bindingHash,
      contractHash, routeContractHash, subjectBindingHash, queryBindingHash, requestHash, conditionsHash,
      readOperationIdHash: provenance.readOperationIdHash, responseHash: source.responseHash, receiptHash: provenance.receiptHash,
      statementIndex: index, sourceStatementHash: digest(row), statement }) });
}
