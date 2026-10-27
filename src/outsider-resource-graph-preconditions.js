/* Preserve source-free goal conditions while binding only declared observation
 * contracts. This compiler adds inputs to the original effect nodes; it neither
 * creates an observer authority nor runs a second scheduler. */
import { normalizeEffectPreconditions, EFFECT_PRECONDITIONS_SCHEMA } from './outsider-effect-preconditions.js';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';

const id = value => typeof value === 'string' && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(value);
const predicate = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u.test(value);
const hash = value => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const fail = reason => { throw new Error(`RESOURCE_GRAPH_PRECONDITION_${reason}`); };
const fields = ['conditionId','requirementId','description','valueType','operator','value',
  'maximumEvidenceAgeMs','retryIntervalMs','observerRequirementId','observerContractHash','predicateId'];
export const RESOURCE_GRAPH_PRECONDITIONS_SCHEMA = { type: 'array', maxItems: 64,
  description: 'Frozen logical conditions with a selected declared observer, or all three source fields null when no source fits. Source bindings are proposed mappings, not facts or execution authority.',
  items: { type: 'object', additionalProperties: false, required: fields, properties: {
    conditionId: { type: 'string' }, requirementId: { type: 'string' }, description: { type: 'string' },
    valueType: { type: 'string', enum: ['boolean','number','string'] }, operator: { type: 'string', enum: ['EQ','GTE','LTE'] },
    value: { type: ['boolean','number','string'] }, maximumEvidenceAgeMs: { type: 'integer' }, retryIntervalMs: { type: 'integer' },
    observerRequirementId: { type: ['string','null'] }, observerContractHash: { type: ['string','null'] }, predicateId: { type: ['string','null'] },
  } } };

export function normalizeResourceGraphPreconditions(value, graph) {
  if (!Array.isArray(value) || value.length > 64 || Buffer.byteLength(JSON.stringify(value)) > 262144) fail('INVALID');
  const ids = new Set(graph.requirements.map(row => row.id)), seen = new Set();
  return value.map(row => {
    if (!row || Object.keys(row).length !== fields.length || fields.some(field => !Object.hasOwn(row, field))
      || !predicate(row.conditionId) || seen.has(row.conditionId) || !ids.has(row.requirementId)
      || typeof row.description !== 'string' || !row.description.trim() || Buffer.byteLength(row.description) > 8000) fail('INVALID');
    seen.add(row.conditionId);
    const unresolved = row.observerRequirementId === null && row.observerContractHash === null && row.predicateId === null;
    if (!unresolved && (!id(row.observerRequirementId) || !ids.has(row.observerRequirementId)
      || !hash(row.observerContractHash) || !predicate(row.predicateId))) fail('SOURCE_BINDING_INVALID');
    normalizeEffectPreconditions({ schema: EFFECT_PRECONDITIONS_SCHEMA, observerRequirementId: 'validation',
      maximumEvidenceAgeMs: row.maximumEvidenceAgeMs, retryIntervalMs: row.retryIntervalMs,
      conditions: [{ predicateId: row.conditionId, valueType: row.valueType, operator: row.operator, value: row.value }] });
    return structuredClone(row);
  });
}

export function verifyOpenOutcomePreconditionProjection({ goalContract, executionPreconditions }) {
  if (!Array.isArray(executionPreconditions)) fail('FROZEN_PROJECTION_CHANGED');
  const expected = goalContract.executionPreconditions.map(condition => {
    const row = executionPreconditions.find(row => row.conditionId === condition.conditionId);
    if (!row) fail('FROZEN_PROJECTION_CHANGED');
    return { ...condition, observerRequirementId: row.observerRequirementId, observerContractHash: row.observerContractHash, predicateId: row.predicateId };
  });
  if (digest(expected) !== digest(executionPreconditions)) fail('FROZEN_PROJECTION_CHANGED');
  return expected;
}

export function bindOpenOutcomePreconditions({ goalContract, preconditionBindings, graphInput, nativeContracts }) {
  const rows = goalContract.executionPreconditions.map(condition => {
    const binding = preconditionBindings.find(row => row.conditionId === condition.conditionId);
    return { ...condition, observerRequirementId: binding.observerRequirementId,
      observerContractHash: binding.observerContractHash, predicateId: binding.predicateId };
  });
  const normalized = normalizeResourceGraphPreconditions(rows, graphInput.graph);
  for (const row of normalized) {
    if (row.observerRequirementId === null) continue;
    const input = graphInput.operationInputs[row.observerRequirementId];
    const observer = graphInput.graph.requirements.find(requirement => requirement.id === row.observerRequirementId);
    const independent = observer?.capability === 'CONNECTED_NATIVE_OBSERVATION_V1';
    const catalog = independent ? nativeContracts.find(contract => contract.capability === observer.capability
      && contract.resourceId === input?.resourceId)
      : nativeContracts.find(contract => input?.networkId !== undefined && contract.networkId === input.networkId);
    const declared = catalog?.preconditionObservers?.find(observer => observer.contractHash === row.observerContractHash);
    if (!declared?.predicates.some(fact => fact.predicateId === row.predicateId && fact.valueType === row.valueType))
      fail('SOURCE_NOT_DECLARED');
  }
  return normalized;
}

export function resourceGraphPreconditionFrontier(input) {
  return (input.executionPreconditions ?? []).filter(row => row.observerRequirementId === null).map(row => ({
    id: row.requirementId, conditionId: row.conditionId, outcome: row.description,
    reason: 'EXECUTION_PRECONDITION_SOURCE_NOT_CONNECTED',
  }));
}

export function compileResourceGraphPreconditions({ graph, fragments, executionPreconditions }) {
  const rows = normalizeResourceGraphPreconditions(executionPreconditions, graph), compiled = new Map();
  for (const requirementId of new Set(rows.map(row => row.requirementId))) {
    const conditions = rows.filter(row => row.requirementId === requirementId), first = conditions[0];
    if (conditions.some(row => row.observerRequirementId === null)) fail('SOURCE_NOT_CONNECTED');
    const target = fragments.find(fragment => fragment.id === requirementId);
    if (target?.nodes.some(node => node.input && Object.hasOwn(node.input, 'executionPreconditions'))) fail('SHADOW_CONTRACT_FORBIDDEN');
    if (target?.preconditionEffectReconciliation !== true) fail('EFFECT_RECONCILIATION_NOT_DECLARED');
    if (!target.nodes.some(node => ['EFFECT','TRANSACTION'].includes(node.kind))) fail('TARGET_EFFECT_REQUIRED');
    const groups = [];
    for (const row of conditions) {
      const observer = fragments.find(fragment => fragment.id === row.observerRequirementId);
      if (observer?.executionInputRecipe) fail('DYNAMIC_OBSERVER_INPUT_UNSUPPORTED');
      const declared = observer?.preconditionObservation;
      if (!declared || declared.contractHash !== row.observerContractHash
        || !declared.predicates.some(fact => fact.predicateId === row.predicateId && fact.valueType === row.valueType))
        fail('SELECTED_SOURCE_NOT_DECLARED');
      // Each group keeps its own source and freshness policy. A repeated
      // source predicate (for example a lower and upper bound) gets a separate
      // group rather than losing a comparison in a predicate-keyed map.
      const key = digest({ observerRequirementId: row.observerRequirementId, observerContractHash: row.observerContractHash,
        maximumEvidenceAgeMs: row.maximumEvidenceAgeMs, retryIntervalMs: row.retryIntervalMs });
      let group = groups.find(group => group.key === key && !group.rows.some(previous => previous.predicateId === row.predicateId));
      if (!group) { group = { key, observer, rows: [] }; groups.push(group); }
      group.rows.push(row);
    }
    const compiledGroups = groups.map(({ observer, rows: selected }) => {
      const policy = selected[0];
      return { groupId: `conditions_${digest(selected.map(row => row.conditionId)).slice(7, 31)}`,
        observerRequirementId: `${observer.id}__${observer.witnessRequirementId}`,
        maximumEvidenceAgeMs: policy.maximumEvidenceAgeMs, retryIntervalMs: policy.retryIntervalMs,
        conditions: selected.map(row => ({ predicateId: row.predicateId, valueType: row.valueType, operator: row.operator, value: row.value })) };
    });
    // A historical one-source compilation retains its exact V1 bytes. Only
    // combinations that V1 could not express use the explicit V2 successor.
    const { groupId: _groupId, ...single } = compiledGroups[0];
    const contract = normalizeEffectPreconditions(compiledGroups.length === 1
      ? { schema: EFFECT_PRECONDITIONS_SCHEMA, ...single }
      : { schema: 'outsider/effect-preconditions/v2', groups: compiledGroups });
    compiled.set(requirementId, { contract,
      ...(compiledGroups.length === 1 ? { sourceContractHash: first.observerContractHash }
        : { sourceContracts: groups.map((group, index) => ({ groupId: compiledGroups[index].groupId,
          observerRequirementId: group.rows[0].observerRequirementId, sourceContractHash: group.rows[0].observerContractHash,
          logicalConditionIds: group.rows.map(row => row.conditionId) })) }),
      conditionsHash: digest(conditions), logicalConditionIds: conditions.map(row => row.conditionId) });
  }
  return compiled;
}
