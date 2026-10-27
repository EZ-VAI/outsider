/* A bound point observation may establish the declared conditions immediately
 * before an existing effect. It does not reserve resources, infer truth from
 * declared effects, extend observer authority, or make check-and-act atomic. */
import { canonicalizeStrict } from './canonical.js';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';

export const EFFECT_PRECONDITIONS_SCHEMA = 'outsider/effect-preconditions/v1';
export const EFFECT_PRECONDITIONS_SCHEMA_V2 = 'outsider/effect-preconditions/v2';
export const EFFECT_PRECONDITION_EVIDENCE_SCHEMA = 'outsider/effect-precondition-evidence/v1';
export const EFFECT_PRECONDITION_EVIDENCE_SCHEMA_V2 = 'outsider/effect-precondition-evidence/v2';
export const EFFECT_PRECONDITION_BINDING_SCHEMA = 'outsider/effect-precondition-binding/v1';
export const EFFECT_PRECONDITION_OBSERVATION_SCHEMA = 'outsider/effect-precondition-observation/v1';
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAXIMUM_BYTES = 262144, MAXIMUM_STRING_BYTES = 2048;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const exact = (value, fields) => object(value) && Object.keys(value).length === fields.length
  && fields.every(field => Object.hasOwn(value, field));
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const identifier = value => typeof value === 'string' && ID.test(value);
const hash = value => typeof value === 'string' && HASH.test(value);
const typedValue = (valueType, value) => ['boolean', 'number', 'string'].includes(valueType)
  && typeof value === valueType && (valueType !== 'number' || Number.isFinite(value))
  && (valueType !== 'string' || Buffer.byteLength(value) <= MAXIMUM_STRING_BYTES);
const fail = reason => {
  const code = `EFFECT_PRECONDITION_${reason}`;
  throw Object.assign(new TypeError(code), { code });
};
function copy(value, reason, maximumBytes = MAXIMUM_BYTES) {
  let encoded;
  try { encoded = canonicalizeStrict(value); } catch { fail(reason); }
  if (Buffer.byteLength(encoded) > maximumBytes) fail(reason);
  return JSON.parse(encoded);
}

const conditionSchema = (valueType, operators) => ({ type: 'object', additionalProperties: false,
  required: ['predicateId', 'valueType', 'operator', 'value'], properties: {
    predicateId: { type: 'string', pattern: ID.source }, valueType: { type: 'string', const: valueType },
    operator: { type: 'string', enum: operators }, value: { type: valueType,
      ...(valueType === 'string' ? { maxLength: MAXIMUM_STRING_BYTES } : {}) } } });
export const EFFECT_PRECONDITIONS_INPUT_SCHEMA = Object.freeze({ type: 'object', additionalProperties: false,
  required: ['schema', 'observerRequirementId', 'maximumEvidenceAgeMs', 'retryIntervalMs', 'conditions'], properties: {
    schema: { type: 'string', const: EFFECT_PRECONDITIONS_SCHEMA }, observerRequirementId: { type: 'string', pattern: ID.source },
    maximumEvidenceAgeMs: { type: 'integer', minimum: 1, maximum: 86400000 },
    retryIntervalMs: { type: 'integer', minimum: 1000, maximum: 3600000 },
    conditions: { type: 'array', minItems: 1, maxItems: 64, items: { anyOf: [
      conditionSchema('boolean', ['EQ']), conditionSchema('number', ['EQ', 'GTE', 'LTE']), conditionSchema('string', ['EQ']),
    ] } },
  } });
export const EFFECT_PRECONDITIONS_INPUT_SCHEMA_V2 = Object.freeze({ type: 'object', additionalProperties: false,
  required: ['schema', 'groups'], properties: {
    schema: { type: 'string', const: EFFECT_PRECONDITIONS_SCHEMA_V2 },
    groups: { type: 'array', minItems: 1, maxItems: 64, items: { type: 'object', additionalProperties: false,
      required: ['groupId', 'observerRequirementId', 'maximumEvidenceAgeMs', 'retryIntervalMs', 'conditions'], properties: {
        groupId: { type: 'string', pattern: ID.source },
        ...Object.fromEntries(['observerRequirementId', 'maximumEvidenceAgeMs', 'retryIntervalMs', 'conditions']
          .map(field => [field, EFFECT_PRECONDITIONS_INPUT_SCHEMA.properties[field]])),
      } } },
  } });

export function normalizeEffectPreconditions(value, { program, node } = {}) {
  const contract = copy(value, 'CONTRACT_INVALID');
  if (contract?.schema === EFFECT_PRECONDITIONS_SCHEMA_V2) {
    if (!exact(contract, ['schema', 'groups']) || !Array.isArray(contract.groups)
      || contract.groups.length < 1 || contract.groups.length > 64) fail('CONTRACT_INVALID');
    const ids = new Set(); let conditionCount = 0;
    for (const group of contract.groups) {
      if (!exact(group, ['groupId', 'observerRequirementId', 'maximumEvidenceAgeMs', 'retryIntervalMs', 'conditions'])
        || !identifier(group.groupId) || ids.has(group.groupId) || !Array.isArray(group.conditions)) fail('CONTRACT_INVALID');
      ids.add(group.groupId); conditionCount += group.conditions.length;
      if (conditionCount > 64) fail('CONTRACT_INVALID');
      const { groupId, ...conditionContract } = group;
      normalizeEffectPreconditions({ schema: EFFECT_PRECONDITIONS_SCHEMA, ...conditionContract }, { program, node });
    }
    // A group is an observation contract, not a different effect or an
    // assertion that independently observed conditions overlap in time.
    return contract;
  }
  if (!exact(contract, ['schema', 'observerRequirementId', 'maximumEvidenceAgeMs', 'retryIntervalMs', 'conditions'])
    || contract.schema !== EFFECT_PRECONDITIONS_SCHEMA || !identifier(contract.observerRequirementId)
    || !Number.isInteger(contract.maximumEvidenceAgeMs) || contract.maximumEvidenceAgeMs < 1 || contract.maximumEvidenceAgeMs > 86400000
    || !Number.isInteger(contract.retryIntervalMs) || contract.retryIntervalMs < 1000 || contract.retryIntervalMs > 3600000
    || !Array.isArray(contract.conditions) || contract.conditions.length < 1 || contract.conditions.length > 64)
    fail('CONTRACT_INVALID');
  const ids = new Set();
  for (const condition of contract.conditions) {
    if (!exact(condition, ['predicateId', 'valueType', 'operator', 'value']) || !identifier(condition.predicateId)
      || ids.has(condition.predicateId) || !typedValue(condition.valueType, condition.value)
      || !['EQ', 'GTE', 'LTE'].includes(condition.operator)
      || condition.operator !== 'EQ' && condition.valueType !== 'number') fail('CONTRACT_INVALID');
    ids.add(condition.predicateId);
  }
  if (node !== undefined && (!object(node) || !['EFFECT', 'TRANSACTION'].includes(node.kind))) fail('NODE_KIND_INVALID');
  if (program !== undefined) {
    if (!object(program) || !Array.isArray(program.requirements)) fail('OBSERVER_REQUIREMENT_INVALID');
    const observers = program.requirements.filter(row => row?.requirementId === contract.observerRequirementId);
    if (observers.length !== 1 || observers[0].role !== 'INDEPENDENT_WITNESS') fail('OBSERVER_REQUIREMENT_INVALID');
  }
  // Preserve the frozen condition order; no default comparator or inferred
  // predicate is introduced by normalization.
  return contract;
}

/** Preserve every policy and comparison. In particular, the same source and
 * predicate in two groups are not deduplicated into one looser condition. */
export function effectPreconditionGroups(value) {
  const contract = normalizeEffectPreconditions(value);
  if (contract.schema !== EFFECT_PRECONDITIONS_SCHEMA_V2) return [{ groupId: null, contract }];
  return contract.groups.map(({ groupId, ...conditionContract }) => ({ groupId,
    contract: { schema: EFFECT_PRECONDITIONS_SCHEMA, ...conditionContract } }));
}

export function effectPreconditionEvidenceBinding({ programHash, nodeId, route, operationId, contract }) {
  if (!hash(programHash) || !identifier(nodeId) || !['PRIMARY', 'RECOVERY'].includes(route) || !identifier(operationId))
    fail('BINDING_INVALID');
  const normalized = normalizeEffectPreconditions(contract);
  if (normalized.schema !== EFFECT_PRECONDITIONS_SCHEMA) fail('GROUP_BINDING_REQUIRED');
  const body = { schema: EFFECT_PRECONDITION_BINDING_SCHEMA, programHash, nodeId, route, operationId,
    contract: normalized };
  return { ...body, bindingHash: digest(body) };
}
function validatedBinding(binding) {
  const value = copy(binding, 'BINDING_INVALID', MAXIMUM_BYTES + 2048);
  if (!exact(value, ['schema', 'programHash', 'nodeId', 'route', 'operationId', 'contract', 'bindingHash'])
    || value.schema !== EFFECT_PRECONDITION_BINDING_SCHEMA || !hash(value.bindingHash)) fail('BINDING_INVALID');
  let expected;
  try { expected = effectPreconditionEvidenceBinding(value); } catch { fail('BINDING_INVALID'); }
  if (expected.bindingHash !== value.bindingHash) fail('BINDING_INVALID');
  return expected;
}

export function projectEffectPreconditionObservation({ binding, observation, observationStartedAt, observedAt }) {
  const bound = validatedBinding(binding), contract = bound.contract;
  if (!instant(observationStartedAt) || !instant(observedAt) || Date.parse(observationStartedAt) > Date.parse(observedAt))
    fail('OBSERVATION_CONTEXT_INVALID');
  const next = new Date(Date.parse(observedAt) + contract.retryIntervalMs);
  if (!Number.isFinite(next.getTime())) fail('OBSERVATION_CONTEXT_INVALID');
  let evidenceObservedAt = null, sourceTimes = null;
  const report = (status, reason, unresolved, evidenceHashes = []) => ({
    schema: EFFECT_PRECONDITION_OBSERVATION_SCHEMA, status, reason, bindingHash: bound.bindingHash,
    contractHash: digest(contract), observationStartedAt, observedAt, evidenceObservedAt, evidenceHashes,
    ...(sourceTimes ?? {}),
    unresolved, ...(status === 'SATISFIED' ? {} : { retryAfter: next.toISOString() }),
    pointObservationOnly: true, continuousValidityClaimed: false, atomicCheckAndAct: false, observerAuthorityExpanded: false,
  });
  const inconclusive = (reason, predicates = contract.conditions.map(row => row.predicateId)) =>
    report('INCONCLUSIVE', reason, predicates.map(predicateId => ({ predicateId, reason })));
  if (observation === null || observation === undefined) return inconclusive('EVIDENCE_REQUIRED');
  let evidence;
  try { evidence = copy(observation, 'EVIDENCE_INVALID'); } catch { return inconclusive('EVIDENCE_INVALID'); }
  const sampled = evidence.schema === EFFECT_PRECONDITION_EVIDENCE_SCHEMA_V2;
  if (!exact(evidence, ['schema', 'bindingHash', 'observedAt', 'facts', ...(sampled ? ['sourceObservedAt'] : [])])
    || ![EFFECT_PRECONDITION_EVIDENCE_SCHEMA, EFFECT_PRECONDITION_EVIDENCE_SCHEMA_V2].includes(evidence.schema) || !hash(evidence.bindingHash)
    || sampled && !instant(evidence.sourceObservedAt)
    || !instant(evidence.observedAt) || !Array.isArray(evidence.facts) || evidence.facts.length > 64)
    return inconclusive('EVIDENCE_INVALID');
  if (evidence.bindingHash !== bound.bindingHash) return inconclusive('EVIDENCE_BINDING_MISMATCH');
  evidenceObservedAt = sampled ? evidence.sourceObservedAt : evidence.observedAt;
  if (sampled) sourceTimes = { evidenceReadAt: evidence.observedAt, sourceObservedAt: evidence.sourceObservedAt };
  if (Date.parse(evidence.observedAt) < Date.parse(observationStartedAt)) return inconclusive('EVIDENCE_PREDATES_OBSERVATION');
  if (Date.parse(evidence.observedAt) > Date.parse(observedAt)) return inconclusive('EVIDENCE_FROM_FUTURE');
  // A new GET may return an older periodic sample. Keep both clocks: freshness
  // of the request never extends the sample's accepted lifetime at dispatch.
  if (sampled && Date.parse(evidence.sourceObservedAt) > Date.parse(evidence.observedAt))
    return inconclusive('SOURCE_OBSERVATION_FROM_FUTURE');
  if (Date.parse(observedAt) - Date.parse(evidenceObservedAt) > contract.maximumEvidenceAgeMs) return inconclusive('EVIDENCE_EXPIRED');
  const required = new Map(contract.conditions.map(condition => [condition.predicateId, condition])), facts = new Map();
  for (const fact of evidence.facts) {
    if (!exact(fact, ['predicateId', 'valueType', 'value', 'evidenceHash']) || !identifier(fact.predicateId)
      || !typedValue(fact.valueType, fact.value) || !hash(fact.evidenceHash)) return inconclusive('FACT_INVALID');
    if (!required.has(fact.predicateId)) return inconclusive('FACT_NOT_REQUESTED');
    if (facts.has(fact.predicateId)) return inconclusive('FACT_DUPLICATE', [fact.predicateId]);
    if (fact.valueType !== required.get(fact.predicateId).valueType) return inconclusive('FACT_TYPE_MISMATCH', [fact.predicateId]);
    facts.set(fact.predicateId, fact);
  }
  const missing = contract.conditions.filter(condition => !facts.has(condition.predicateId)).map(condition => condition.predicateId);
  if (missing.length) return inconclusive('FACT_MISSING', missing);
  const unresolved = contract.conditions.filter(condition => {
    const actual = facts.get(condition.predicateId).value;
    return !(condition.operator === 'EQ' ? actual === condition.value
      : condition.operator === 'GTE' ? actual >= condition.value : actual <= condition.value);
  }).map(condition => ({ predicateId: condition.predicateId, reason: 'CONDITION_NOT_SATISFIED' }));
  const evidenceHashes = [...new Set(contract.conditions.map(condition => facts.get(condition.predicateId).evidenceHash))];
  return report(unresolved.length ? 'NOT_SATISFIED' : 'SATISFIED',
    unresolved.length ? 'CONDITIONS_NOT_SATISFIED' : 'CONDITIONS_SATISFIED', unresolved, evidenceHashes);
}
