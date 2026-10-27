/* A joint observation projects evidence supplied by the existing witnesses.
 * It does not make point samples into uptime, reservation expiry into observed
 * availability, or transport completion into an accepted business result. */
import { publicDatasetHash as digest } from './outsider-public-dataset.js';

export const JOINT_STATE_ACCEPTANCE_SCHEMA = 'outsider/joint-state-acceptance/v1';
export const JOINT_STATE_ACCEPTANCE_SCHEMA_V2 = 'outsider/joint-state-acceptance/v2';
export const JOINT_STATE_EVIDENCE_SCHEMA = 'outsider/joint-state-evidence/v1';
const HASH = /^sha256:[a-f0-9]{64}$/u;
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
const instant = value => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value;
const exact = (value, keys) => plain(value) && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
const fail = code => { throw new Error(`JOINT_STATE_${code}`); };
export const JOINT_STATE_ACCEPTANCE_INPUT_SCHEMA = Object.freeze({
  type: 'object', additionalProperties: false,
  required: ['schema', 'timing', 'maximumEvidenceAgeMs', 'retryIntervalMs'],
  properties: { schema: { const: JOINT_STATE_ACCEPTANCE_SCHEMA },
    timing: { oneOf: [
      { type: 'object', additionalProperties: false, required: ['mode'], properties: { mode: { const: 'CURRENT' } } },
      { type: 'object', additionalProperties: false, required: ['mode', 'startsAt', 'endsAt'],
        properties: { mode: { const: 'WINDOW' }, startsAt: { type: 'string', format: 'date-time' },
          endsAt: { type: 'string', format: 'date-time' } } },
    ] }, maximumEvidenceAgeMs: { type: 'integer', minimum: 1, maximum: 86400000 },
    retryIntervalMs: { type: 'integer', minimum: 1000, maximum: 3600000 } },
});
export const JOINT_STATE_ACCEPTANCE_INPUT_SCHEMA_V2 = Object.freeze({
  ...structuredClone(JOINT_STATE_ACCEPTANCE_INPUT_SCHEMA),
  required: [...JOINT_STATE_ACCEPTANCE_INPUT_SCHEMA.required, 'requirementIds'],
  properties: { ...structuredClone(JOINT_STATE_ACCEPTANCE_INPUT_SCHEMA.properties),
    schema: { const: JOINT_STATE_ACCEPTANCE_SCHEMA_V2 },
    requirementIds: { type: 'array', minItems: 1, maxItems: 64, uniqueItems: true,
      items: { type: 'string', pattern: '^[A-Za-z][A-Za-z0-9_-]{0,63}$' },
      description: 'The original outcome requirements that must hold together. Preparation and intermediate means remain separately accepted.' } },
});
export const JOINT_STATE_ACCEPTANCE_EXTENDED_INPUT_SCHEMA = Object.freeze({ anyOf: [
  JOINT_STATE_ACCEPTANCE_INPUT_SCHEMA, JOINT_STATE_ACCEPTANCE_INPUT_SCHEMA_V2,
] });

export function normalizeJointStateAcceptance(value, { completionDeadline } = {}) {
  const scoped = value?.schema === JOINT_STATE_ACCEPTANCE_SCHEMA_V2;
  if (!exact(value, ['schema', 'timing', 'maximumEvidenceAgeMs', 'retryIntervalMs', ...(scoped ? ['requirementIds'] : [])])
    || ![JOINT_STATE_ACCEPTANCE_SCHEMA, JOINT_STATE_ACCEPTANCE_SCHEMA_V2].includes(value.schema)
    || !Number.isInteger(value.maximumEvidenceAgeMs) || value.maximumEvidenceAgeMs < 1 || value.maximumEvidenceAgeMs > 86400000
    || !Number.isInteger(value.retryIntervalMs) || value.retryIntervalMs < 1000 || value.retryIntervalMs > 3600000)
    fail('CONTRACT_INVALID');
  if (scoped && (!Array.isArray(value.requirementIds) || value.requirementIds.length < 1 || value.requirementIds.length > 64
    || new Set(value.requirementIds).size !== value.requirementIds.length
    || value.requirementIds.some(id => typeof id !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(id))))
    fail('SCOPE_INVALID');
  const timing = value.timing;
  if (!(exact(timing, ['mode']) && timing.mode === 'CURRENT')
    && !(exact(timing, ['mode', 'startsAt', 'endsAt']) && timing.mode === 'WINDOW'
      && instant(timing.startsAt) && instant(timing.endsAt) && Date.parse(timing.endsAt) > Date.parse(timing.startsAt)))
    fail('TIMING_INVALID');
  if (completionDeadline !== undefined && (!instant(completionDeadline)
    || timing.mode === 'WINDOW' && Date.parse(timing.endsAt) > Date.parse(completionDeadline))) fail('WINDOW_OUTSIDE_ORDER');
  return structuredClone(value);
}

export function jointStateRequirementIds(contract, allRequirementIds) {
  const normalized = normalizeJointStateAcceptance(contract);
  if (!Array.isArray(allRequirementIds) || new Set(allRequirementIds).size !== allRequirementIds.length) fail('SCOPE_INVALID');
  const selected = normalized.requirementIds ?? allRequirementIds;
  if (!selected.length || selected.some(id => !allRequirementIds.includes(id))) fail('SCOPE_REQUIREMENT_MISSING');
  return [...selected];
}

/** Sent to an already selected witness through its existing observation call.
 * A different order, component, capability contract or timing contract cannot
 * reuse the same envelope as evidence for this joint check. */
export function jointStateEvidenceBinding({ programHash, requirementId, acceptanceContract, contract }) {
  if (!HASH.test(programHash ?? '') || typeof requirementId !== 'string' || !requirementId
    || typeof acceptanceContract !== 'string' || !acceptanceContract) fail('BINDING_INVALID');
  const normalized = normalizeJointStateAcceptance(contract);
  if (normalized.requirementIds && !normalized.requirementIds.includes(requirementId)) fail('BINDING_OUTSIDE_SCOPE');
  return { contract: normalized, bindingHash: digest({ programHash, requirementId,
    acceptanceContractHash: digest(acceptanceContract), jointAcceptanceHash: digest(normalized) }) };
}

function merged(intervals) {
  const result = [];
  for (const interval of intervals.toSorted((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const previous = result.at(-1);
    if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
    else result.push([...interval]);
  }
  return result;
}
function intersection(left, right) {
  const result = [];
  for (const a of left) for (const b of right) {
    const from = Math.max(a[0], b[0]), until = Math.min(a[1], b[1]);
    if (from <= until) result.push([from, until]);
  }
  return merged(result);
}

/** Each source statement attests the ENTIRE stated interval. Its end must
 * already have been observed. This API deliberately accepts no inferred TTL
 * and has no default that turns SATISFIED into a continuing state. */
export function projectJointStateObservation({ contract, bindings, observations, observationStartedAt,
  observedAt, completionDeadline }) {
  contract = normalizeJointStateAcceptance(contract, { completionDeadline });
  if (!plain(bindings) || !Object.keys(bindings).length
    || Object.values(bindings).some(binding => !HASH.test(binding?.bindingHash ?? '') || digest(binding.contract) !== digest(contract))
    || !plain(observations)
    || !instant(observationStartedAt) || !instant(observedAt)
    || Date.parse(observationStartedAt) > Date.parse(observedAt) || !instant(completionDeadline)) fail('OBSERVATION_INVALID');
  if (contract.requirementIds && (contract.requirementIds.length !== Object.keys(bindings).length
    || contract.requirementIds.some(id => !Object.hasOwn(bindings, id)))) fail('OBSERVATION_SCOPE_CHANGED');
  const now = Date.parse(observedAt), window = contract.timing.mode === 'WINDOW'
    ? [Date.parse(contract.timing.startsAt), Date.parse(contract.timing.endsAt)] : null;
  const relevant = window ?? [now - contract.maximumEvidenceAgeMs, now];
  const unresolved = [], evidenceHashes = new Set();
  let common = [relevant];
  const issue = (requirementId, reason) => unresolved.push({ requirementId, reason });
  for (const [requirementId, binding] of Object.entries(bindings)) {
    const row = observations[requirementId], evidence = row?.jointEvidence;
    if (row?.status !== 'SATISFIED') { issue(requirementId, 'COMPONENT_CURRENTLY_NOT_SATISFIED'); continue; }
    if (!exact(evidence, ['schema', 'bindingHash', 'statements']) || evidence.schema !== JOINT_STATE_EVIDENCE_SCHEMA
      || evidence.bindingHash !== binding.bindingHash || !Array.isArray(evidence.statements)
      || evidence.statements.length < 1 || evidence.statements.length > 64) {
      issue(requirementId, 'BOUND_SOURCE_INTERVAL_EVIDENCE_REQUIRED'); continue;
    }
    if (evidence.statements.some(statement => !exact(statement,
      ['status', 'observedAt', 'validFrom', 'validUntil', 'evidenceHash'])
      || !['SATISFIED', 'NOT_SATISFIED', 'INCONCLUSIVE'].includes(statement.status)
      || ![statement.observedAt, statement.validFrom, statement.validUntil].every(instant)
      || Date.parse(statement.validFrom) > Date.parse(statement.validUntil)
      || Date.parse(statement.validUntil) > Date.parse(statement.observedAt)
      || Date.parse(statement.observedAt) > now || !HASH.test(statement.evidenceHash ?? ''))) {
      issue(requirementId, 'SOURCE_INTERVAL_NOT_VALID_OBSERVED_EVIDENCE'); continue;
    }
    const fresh = evidence.statements.filter(statement => now - Date.parse(statement.observedAt) <= contract.maximumEvidenceAgeMs);
    const positives = fresh.filter(statement => statement.status === 'SATISFIED');
    const accepted = merged(positives.map(statement => [Date.parse(statement.validFrom), Date.parse(statement.validUntil)]));
    const contrary = fresh.filter(statement => statement.status !== 'SATISFIED')
      .map(statement => [Date.parse(statement.validFrom), Date.parse(statement.validUntil)]);
    if (intersection(intersection(accepted, contrary), [relevant]).length) {
      issue(requirementId, 'CONTRADICTORY_SOURCE_INTERVAL_EVIDENCE'); continue;
    }
    const coverage = intersection(accepted, [relevant]);
    if (!coverage.length || window && !coverage.some(([from, until]) => from <= window[0] && until >= window[1])) {
      issue(requirementId, fresh.length ? 'REQUIRED_TIME_NOT_COVERED' : 'SOURCE_EVIDENCE_EXPIRED'); continue;
    }
    for (const statement of positives) if (intersection([[Date.parse(statement.validFrom), Date.parse(statement.validUntil)]], coverage).length)
      evidenceHashes.add(statement.evidenceHash);
    common = intersection(common, coverage);
  }
  if (!unresolved.length && !common.length) for (const requirementId of Object.keys(bindings))
    issue(requirementId, 'NO_COMMON_STATE_INTERVAL');
  if (window && now < window[1]) for (const requirementId of Object.keys(bindings))
    if (!unresolved.some(row => row.requirementId === requirementId)) issue(requirementId, 'OBSERVATION_WINDOW_NOT_FINISHED');
  if (now >= Date.parse(completionDeadline)) for (const requirementId of Object.keys(bindings))
    issue(requirementId, 'ORDER_COMPLETION_DEADLINE_PASSED');
  const satisfied = unresolved.length === 0;
  const selected = satisfied ? common.at(-1) : null;
  const retryAt = new Date(Math.min(Date.parse(completionDeadline), now + contract.retryIntervalMs,
    window && now < window[1] ? window[1] : Infinity)).toISOString();
  return { status: satisfied ? 'SATISFIED' : 'INCONCLUSIVE', observationStartedAt, observedAt, observations,
    observationMode: 'JOINT_SOURCE_OBSERVED_INTERVALS', jointAcceptanceHash: digest(contract),
    commonState: selected ? { validFrom: new Date(selected[0]).toISOString(), validUntil: new Date(selected[1]).toISOString(),
      acceptedAt: new Date(selected[1]).toISOString(), evidenceHashes: [...evidenceHashes].sort() } : null,
    unresolved, ...(satisfied ? {} : { retryAfter: retryAt, nextObservation: {
      requirementIds: [...new Set(unresolved.map(row => row.requirementId))], notBefore: retryAt,
      action: 'REOBSERVE_EXISTING_WITNESSES', startsNewOrder: false } }),
    simultaneousInstantClaimed: satisfied, continuousWindowClaimed: satisfied && !!window,
    reusedDependencySuccessAsEvidence: false, inferredValidityFromSuccess: false,
    sourceWitnessAuthorityExpanded: false };
}
