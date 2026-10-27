import test from 'node:test';
import assert from 'node:assert/strict';
import { publicDatasetHash as digest } from '../src/outsider-public-dataset.js';
import { EFFECT_PRECONDITIONS_SCHEMA, EFFECT_PRECONDITION_EVIDENCE_SCHEMA,
  EFFECT_PRECONDITION_OBSERVATION_SCHEMA, normalizeEffectPreconditions,
  effectPreconditionEvidenceBinding, projectEffectPreconditionObservation } from '../src/outsider-effect-preconditions.js';

const NOW = '2026-09-08T12:00:00.000Z';
const at = milliseconds => new Date(Date.parse(NOW) + milliseconds).toISOString();
const conditions = [
  { predicateId: 'accessReady', valueType: 'boolean', operator: 'EQ', value: true },
  { predicateId: 'remainingUnits', valueType: 'number', operator: 'GTE', value: 2 },
];
const contractFor = (overrides = {}) => ({ schema: EFFECT_PRECONDITIONS_SCHEMA,
  observerRequirementId: 'preflight_observer', maximumEvidenceAgeMs: 1000, retryIntervalMs: 2000,
  conditions: structuredClone(conditions), ...overrides });
const bindingFor = (overrides = {}) => effectPreconditionEvidenceBinding({
  programHash: digest({ originalOrder: 'one' }), nodeId: 'apply_action', route: 'PRIMARY',
  operationId: 'precondition.primary.1', contract: contractFor(), ...overrides });
const fact = (predicateId, valueType, value, source = predicateId) => ({ predicateId, valueType, value,
  evidenceHash: digest({ source }) });
const evidenceFor = (binding, facts = [fact('accessReady', 'boolean', true), fact('remainingUnits', 'number', 2)],
  observedAt = NOW) => ({ schema: EFFECT_PRECONDITION_EVIDENCE_SCHEMA, bindingHash: binding.bindingHash,
  observedAt, facts });
const project = (binding, observation, times = {}) => projectEffectPreconditionObservation({ binding, observation,
  observationStartedAt: NOW, observedAt: NOW, ...times });
const rejectsContract = value => assert.throws(() => normalizeEffectPreconditions(value),
  { code: 'EFFECT_PRECONDITION_CONTRACT_INVALID' });

test('contracts retain explicit typed predicates and use only an existing independent witness', () => {
  const contract = contractFor({ maximumEvidenceAgeMs: 1, retryIntervalMs: 1000, conditions: [
    { predicateId: 'edition', valueType: 'string', operator: 'EQ', value: '' },
    { predicateId: 'ceiling', valueType: 'number', operator: 'LTE', value: 12 },
    ...structuredClone(conditions),
  ] });
  const before = JSON.stringify(contract), program = { requirements: [
    { requirementId: 'preflight_observer', role: 'INDEPENDENT_WITNESS' },
    { requirementId: 'perform_action', role: 'PRIMARY' },
  ] };
  for (const kind of ['EFFECT', 'TRANSACTION']) {
    const normalized = normalizeEffectPreconditions(contract, { program, node: { kind } });
    assert.deepEqual(normalized, contract);
    assert.notEqual(normalized, contract);
    assert.notEqual(normalized.conditions, contract.conditions);
  }
  assert.equal(JSON.stringify(contract), before, 'normalization does not amend the accepted conditions');
  assert.doesNotThrow(() => normalizeEffectPreconditions(contractFor({ maximumEvidenceAgeMs: 86400000,
    retryIntervalMs: 3600000, conditions: Array.from({ length: 64 }, (_, index) => ({
      predicateId: `predicate_${index}`, valueType: 'string', operator: 'EQ', value: 'é'.repeat(1024) })) })));
  for (const changes of [{ maximumEvidenceAgeMs: 0 }, { maximumEvidenceAgeMs: 86400001 },
    { maximumEvidenceAgeMs: 1.5 }, { retryIntervalMs: 999 }, { retryIntervalMs: 3600001 },
    { conditions: [] }, { conditions: Array.from({ length: 65 }, (_, index) => ({
      ...conditions[0], predicateId: `predicate_${index}` })) },
    { conditions: [conditions[0], conditions[0]] }, { extraAuthority: true }]) rejectsContract(contractFor(changes));
  for (const condition of [
    { predicateId: 'x', valueType: 'string', operator: 'GTE', value: 'ready' },
    { predicateId: 'x', valueType: 'boolean', operator: 'LTE', value: true },
    { predicateId: 'x', valueType: 'number', operator: 'EQ', value: '2' },
    { predicateId: 'x', valueType: 'number', operator: 'EQ', value: NaN },
    { predicateId: 'x', valueType: 'number', operator: 'EQ', value: -0 },
    { predicateId: 'x', valueType: 'boolean', value: true },
    { predicateId: 'x', valueType: 'string', operator: 'EQ', value: 'é'.repeat(1025) },
    { ...conditions[0], acceptedByDeclaration: true },
  ]) rejectsContract(contractFor({ conditions: [condition] }));
  assert.throws(() => normalizeEffectPreconditions(contract, { program, node: { kind: 'OBSERVATION' } }),
    { code: 'EFFECT_PRECONDITION_NODE_KIND_INVALID' });
  for (const requirements of [[], [{ requirementId: 'preflight_observer', role: 'PRIMARY' }],
    [program.requirements[0], program.requirements[0]]]) {
    assert.throws(() => normalizeEffectPreconditions(contract, { program: { requirements }, node: { kind: 'EFFECT' } }),
      { code: 'EFFECT_PRECONDITION_OBSERVER_REQUIREMENT_INVALID' });
  }
});

test('two unrelated typed predicate sets are compared from facts without domain branches or raw value disclosure', () => {
  const access = bindingFor(), accepted = project(access, evidenceFor(access, [
    fact('remainingUnits', 'number', 3), fact('accessReady', 'boolean', true),
  ]));
  assert.equal(accepted.schema, EFFECT_PRECONDITION_OBSERVATION_SCHEMA);
  assert.equal(accepted.status, 'SATISFIED');
  assert.equal(accepted.reason, 'CONDITIONS_SATISFIED');
  assert.equal(accepted.bindingHash, access.bindingHash);
  assert.equal(accepted.contractHash, digest(access.contract));
  assert.equal(accepted.evidenceObservedAt, NOW);
  assert.equal(accepted.observationStartedAt, NOW);
  assert.equal(accepted.observedAt, NOW);
  assert.deepEqual(accepted.unresolved, []);
  assert.deepEqual(accepted.evidenceHashes, [digest({ source: 'accessReady' }), digest({ source: 'remainingUnits' })]);
  assert.equal(accepted.retryAfter, undefined);
  assert.equal(accepted.pointObservationOnly, true);
  assert.equal(accepted.continuousValidityClaimed, false);
  assert.equal(accepted.atomicCheckAndAct, false);
  assert.equal(accepted.observerAuthorityExpanded, false);
  const denied = project(access, evidenceFor(access, [
    fact('accessReady', 'boolean', false), fact('remainingUnits', 'number', 1),
  ]));
  assert.equal(denied.status, 'NOT_SATISFIED');
  assert.deepEqual(denied.unresolved.map(row => row.predicateId), ['accessReady', 'remainingUnits']);
  assert.equal(denied.retryAfter, at(2000));
  const edition = bindingFor({ contract: contractFor({ conditions: [
    { predicateId: 'edition', valueType: 'string', operator: 'EQ', value: 'approved-v2' },
    { predicateId: 'ceiling', valueType: 'number', operator: 'LTE', value: 12 },
  ] }) });
  const source = evidenceFor(edition, [fact('edition', 'string', 'approved-v2', 'shared-receipt'),
    fact('ceiling', 'number', 12, 'shared-receipt')]);
  const before = JSON.stringify(source), second = project(edition, source);
  assert.equal(second.status, 'SATISFIED');
  assert.deepEqual(second.evidenceHashes, [digest({ source: 'shared-receipt' })]);
  assert.equal(JSON.stringify(source), before);
  source.facts[0].value = 'PRIVATE_OBSERVER_VALUE_DO_NOT_REFLECT';
  source.facts[1].value = 13;
  const different = project(edition, source);
  assert.equal(different.status, 'NOT_SATISFIED');
  assert.equal(JSON.stringify(different).includes('PRIVATE_OBSERVER_VALUE_DO_NOT_REFLECT'), false);
  assert.equal(JSON.stringify(second).includes('approved-v2'), false, 'safe results contain evidence hashes, not predicate values');
});

test('fresh facts cannot be exchanged across orders, nodes, routes, occurrences, or contracts', () => {
  const original = bindingFor(), evidence = evidenceFor(original);
  for (const changes of [
    { programHash: digest({ originalOrder: 'two' }) }, { nodeId: 'other_action' }, { route: 'RECOVERY' },
    { operationId: 'precondition.primary.2' }, { contract: contractFor({ retryIntervalMs: 3000 }) },
    { contract: contractFor({ conditions: [{ ...conditions[0], value: false }, conditions[1]] }) },
  ]) {
    const substituted = bindingFor(changes), result = project(substituted, evidence);
    assert.notEqual(substituted.bindingHash, original.bindingHash);
    assert.equal(result.status, 'INCONCLUSIVE');
    assert.equal(result.reason, 'EVIDENCE_BINDING_MISMATCH');
    assert.equal(result.evidenceObservedAt, null);
    assert.deepEqual(result.evidenceHashes, []);
  }
  const mutated = structuredClone(original);
  mutated.contract.conditions[0].value = false;
  assert.throws(() => project(mutated, evidence), { code: 'EFFECT_PRECONDITION_BINDING_INVALID' });
  for (const declaration of [{ status: 'SATISFIED' }, { ...evidence, status: 'SATISFIED' },
    { ...evidence, providerExtraPayload: 'PRIVATE_PROVIDER_PAYLOAD' }]) {
    const result = project(original, declaration);
    assert.equal(result.status, 'INCONCLUSIVE');
    assert.equal(result.reason, 'EVIDENCE_INVALID');
    assert.equal(JSON.stringify(result).includes('PRIVATE_PROVIDER_PAYLOAD'), false);
  }
});

test('evidence is current only inside this observation call and the explicit inclusive age bound', () => {
  const binding = bindingFor(), times = { observationStartedAt: NOW, observedAt: at(5000) };
  assert.equal(project(binding, evidenceFor(binding, undefined, at(4000)), times).status, 'SATISFIED');
  assert.equal(project(binding, evidenceFor(binding, undefined, at(5000)), times).status, 'SATISFIED');
  assert.equal(project(binding, evidenceFor(binding), { observationStartedAt: NOW, observedAt: NOW }).status, 'SATISFIED');
  for (const [time, reason] of [[at(-1), 'EVIDENCE_PREDATES_OBSERVATION'],
    [at(5001), 'EVIDENCE_FROM_FUTURE'], [at(3999), 'EVIDENCE_EXPIRED'],
    ['2026-09-08T12:00:05Z', 'EVIDENCE_INVALID'], ['2026-09-08T08:00:05.000-04:00', 'EVIDENCE_INVALID']]) {
    const result = project(binding, evidenceFor(binding, undefined, time), times);
    assert.equal(result.status, 'INCONCLUSIVE');
    assert.equal(result.reason, reason);
    assert.equal(result.retryAfter, at(7000));
    assert.deepEqual(result.evidenceHashes, []);
  }
  assert.throws(() => project(binding, evidenceFor(binding), { observationStartedAt: at(1), observedAt: NOW }),
    { code: 'EFFECT_PRECONDITION_OBSERVATION_CONTEXT_INVALID' });
  assert.throws(() => project(binding, evidenceFor(binding), { observedAt: '2026-09-08T12:00:00Z' }),
    { code: 'EFFECT_PRECONDITION_OBSERVATION_CONTEXT_INVALID' });
});

test('incomplete, conflicting, mistyped, and unrequested facts never authorize a new effect', () => {
  const binding = bindingFor(), valid = evidenceFor(binding);
  assert.equal(project(binding, undefined).reason, 'EVIDENCE_REQUIRED');
  const cases = [
    [[fact('accessReady', 'boolean', false)], 'FACT_MISSING'],
    [[...valid.facts, fact('accessReady', 'boolean', false)], 'FACT_DUPLICATE'],
    [[...valid.facts, fact('PRIVATE_UNREQUESTED_ID', 'string', 'PRIVATE_VALUE')], 'FACT_NOT_REQUESTED'],
    [[fact('accessReady', 'string', 'true'), valid.facts[1]], 'FACT_TYPE_MISMATCH'],
    [[valid.facts[0], { ...valid.facts[1], value: '2' }], 'FACT_INVALID'],
    [[valid.facts[0], { ...valid.facts[1], evidenceHash: 'provider-says-valid' }], 'FACT_INVALID'],
    [[{ ...valid.facts[0], status: 'SATISFIED' }, valid.facts[1]], 'FACT_INVALID'],
    [[], 'FACT_MISSING'],
  ];
  for (const [facts, reason] of cases) {
    const source = evidenceFor(binding, facts), before = JSON.stringify(source), result = project(binding, source);
    assert.equal(result.status, 'INCONCLUSIVE');
    assert.equal(result.reason, reason);
    assert.deepEqual(result.evidenceHashes, []);
    assert.equal(JSON.stringify(source), before);
    assert.equal(JSON.stringify(result).includes('PRIVATE_UNREQUESTED_ID'), false);
    assert.equal(JSON.stringify(result).includes('PRIVATE_VALUE'), false);
  }
  const missing = project(binding, evidenceFor(binding, [fact('accessReady', 'boolean', false)]));
  assert.deepEqual(missing.unresolved, [{ predicateId: 'remainingUnits', reason: 'FACT_MISSING' }],
    'an incomplete report is inconclusive even if another supplied condition is false');
});
