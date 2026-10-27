/* Explicit dispatch-only lifecycle contracts. These declarations do not grant
 * authority, reserve capacity, replace resources, or change acceptance. The
 * original program and its one execution node remain the execution contract. */
import path from 'node:path';
import { existsSync } from 'node:fs';
import { publicDatasetHash as digest } from './outsider-public-dataset.js';
import { createOutsiderJsonFunctionClient } from './outsider-json-function-client.js';
import { readPrivateExecutionBytes } from './outsider-user-held-durable-execution-v2.js';
import { assessRemainingExecutionPlan } from './outsider-resource-graph-execution-plan.js';
import { projectResourceGraphPlanTerms } from './outsider-resource-graph-plan-terms.js';

export const EXECUTION_WINDOW_LIFECYCLE_SCHEMA = 'outsider/execution-window-lifecycle/v1';
export const SCHEDULE_REVISION_SCHEMA_V2 = 'outsider/resource-graph-schedule-revision/v2';
export const DECLARED_SCHEDULE_SCOPE = 'UNSTARTED_DECLARED_EXECUTION_WINDOWS_ONLY';
const HASH = /^sha256:[a-f0-9]{64}$/u;
const supported = [
  { lifecycle: 'ZERO_COST_A2A_TRANSACTION_V1', capability: 'A2A_AGENT_TASK_V1',
    primary: 'agent_task', node: 'artifact_available', witness: 'artifact_read',
    witnessCapability: 'LOCAL_PERSISTED_A2A_ARTIFACT_READ',
    contracts: ['A2A_TASK_ARTIFACT_AVAILABLE_V1', 'A2A_TASK_CHECKED_DATA_AVAILABLE_V2'] },
  { lifecycle: 'BORROWED_PUBLIC_JSON_INVOCATION_V1', capability: 'PUBLIC_JSON_FUNCTION_CALL_V1',
    primary: 'computation', node: 'computed', witness: 'computation_read',
    witnessCapability: 'EXTERNAL_PUBLIC_COMPUTATION_RESULT_AGREEMENT',
    contracts: ['ACTUAL_PUBLIC_JSON_CALL_AND_CROSS_PROVIDER_EXTERNAL_RESULT_AGREEMENT_V1'] },
  { lifecycle: 'ORDER_DIGITAL_AGENT_DISPATCH_V1', capability: 'GENERAL_DIGITAL_AGENT_TASK_V1',
    primary: 'digital_agent', node: 'digital_outputs_available', witness: 'output_read',
    witnessCapability: 'LOCAL_DIGITAL_AGENT_OUTPUT_READ', contracts: ['DIGITAL_AGENT_DECLARED_OUTPUTS_AVAILABLE_V1'] },
];
const fail = code => { throw Object.assign(new Error(`RESOURCE_GRAPH_INPUT_REVISION_${code}`),
  { code: `RESOURCE_GRAPH_INPUT_REVISION_${code}` }); };

/** Derive a declaration from the actual frozen adapter contract. A caller's
 * category label or proposed binding can never opt an unsupported part in. */
export function resolveExecutionWindowLifecycle(program, componentId) {
  const prefix = `${componentId}__`, criterion = program.outcome?.acceptance?.find(row => row.criterionId === `${prefix}contract`);
  const declaration = supported.find(row => row.contracts.includes(criterion?.expected?.acceptanceContract));
  const nodes = program.nodes.filter(row => row.nodeId.startsWith(prefix));
  const node = nodes[0], requirement = program.requirements.find(row => row.requirementId === `${prefix}${declaration?.primary}`);
  const witness = program.requirements.find(row => row.requirementId === `${prefix}${declaration?.witness}`);
  const constraints = requirement?.constraints;
  if (!declaration || !['outsider/execution-only-program/v3', 'outsider/execution-only-program/v4', 'outsider/execution-only-program/v5'].includes(program.schema)
    || program.commitmentMode !== 'EXECUTION_ONLY_NO_OUTCOME_PROMISE' || !HASH.test(program.programHash)
    || nodes.length !== 1 || node.nodeId !== `${prefix}${declaration.node}` || node.kind !== 'TRANSACTION'
    || node.primaryRequirementId !== requirement?.requirementId || node.recoveryRequirementId !== null
    || node.witnessRequirementId !== witness?.requirementId || node.input?.recoveryContract
    || requirement?.role !== 'PRIMARY' || requirement.capability !== declaration.capability
    || constraints?.admissionMode !== 'EXECUTION_PHASE_TRANSACTION' || constraints.maximumAmountMinor !== '0'
    || constraints.resourceInputRecipeHash || criterion.expected.inputRecipe
    || !HASH.test(constraints.inputContractHash) || witness?.role !== 'INDEPENDENT_WITNESS'
    || witness.capability !== declaration.witnessCapability || witness.constraints?.admissionMode !== 'ON_DEMAND_OBSERVATION'
    || !Array.isArray(node.acceptance) || !node.acceptance.includes(criterion.expected.acceptanceContract))
    fail('SCHEDULE_LIFECYCLE_UNSUPPORTED');
  const validSpecific = declaration.lifecycle === 'ZERO_COST_A2A_TRANSACTION_V1'
    ? constraints.reservedAgentCapacityRequired === false && HASH.test(constraints.connectionHash) && HASH.test(constraints.outputRequirementHash)
    : declaration.lifecycle === 'ORDER_DIGITAL_AGENT_DISPATCH_V1'
      ? constraints.reservedAgentCapacityRequired === false && constraints.ordinaryWorkspaceExecution === true && HASH.test(constraints.outputRequirementHash)
        && node.input?.operation === 'EXECUTE_ASSIGNED_DIGITAL_WORK'
      : constraints.invocationOnly === true && HASH.test(constraints.functionHash) && HASH.test(constraints.sourceResultHash)
        && node.input?.publicInputApproved === true && node.input?.newResourceAllocation === false;
  if (!validSpecific)
    fail('SCHEDULE_LIFECYCLE_UNSUPPORTED');
  const identity = { schema: EXECUTION_WINDOW_LIFECYCLE_SCHEMA, lifecycle: declaration.lifecycle,
    componentId, nodeId: node.nodeId, requirementId: requirement.requirementId, witnessRequirementId: witness.requirementId };
  return { ...identity, contractHash: digest({ ...identity, baselineProgramHash: program.programHash,
    requirement, witness, node, criterion }) };
}

export function digitalAgentScheduleBinding({ part, program, mapping }) {
  const lifecycle = resolveExecutionWindowLifecycle(program, part.id);
  const requirement = program.requirements.find(row => row.requirementId === lifecycle.requirementId);
  if (lifecycle.lifecycle !== 'ORDER_DIGITAL_AGENT_DISPATCH_V1' || part.category !== 'DIGITAL_AGENT_EXECUTION'
    || mapping?.finalNodeId !== lifecycle.nodeId || mapping?.witnessRequirementId !== lifecycle.witnessRequirementId
    || part.capacityReserved === true || part.recovery
    || requirement.constraints.inputContractHash !== (part.executionInputRecipe?.recipeHash ?? digest(part.input))
    || requirement.constraints.outputRequirementHash !== digest(part.input.outputs)) fail('SCHEDULE_BINDING_CHANGED');
  return { lifecycle,
    connectionHash: digest({ taskId: part.taskId, connectionIds: part.input.connectionIds }),
    inputContractHash: requirement.constraints.inputContractHash,
    outputRequirementHash: digest({ outputs: part.input.outputs, deliveryTargets: part.input.deliveryTargets ?? [], acceptanceCriteria: part.input.acceptanceCriteria }),
    authorizationHash: digest({ taskId: part.taskId, programHash: program.programHash, connectionIds: part.input.connectionIds,
      operation: 'DEFER_UNSTARTED_ORIGINAL_AGENT', goal: part.input.goal }),
    placementHash: digest({ taskId: part.taskId, providerRefs: part.providerRefs }) };
}

export function assertExecutionWindowLifecycleReadiness(binding, readiness) {
  if (!readiness) return;
  if (readiness.capacityReserved !== false || readiness.admissionMode !== 'EXECUTION_PHASE_TRANSACTION'
    || readiness.providerReceipt?.transactionSubmitted !== false
    || binding.lifecycle === 'BORROWED_PUBLIC_JSON_INVOCATION_V1' && readiness.providerReceipt?.invocationOnly !== true)
    fail('SCHEDULE_RESERVED_CAPACITY_UNSUPPORTED');
}

/** Validate immutable borrowed-service provenance; only proposal/acceptance
 * request the source-file reread. Historical accepted revisions replay without
 * needing a still-present or still-live old source. No provider is contacted. */
export function jsonFunctionScheduleBinding({ part, program, mapping, recheckSource = false }) {
  const lifecycle = resolveExecutionWindowLifecycle(program, part.id);
  const requirement = program.requirements.find(row => row.requirementId === lifecycle.requirementId);
  if (lifecycle.lifecycle !== 'BORROWED_PUBLIC_JSON_INVOCATION_V1' || part.category !== 'SOFTWARE_INVOCATION'
    || mapping?.finalNodeId !== lifecycle.nodeId || mapping?.witnessRequirementId !== lifecycle.witnessRequirementId
    || part.acceptanceContract !== supported[1].contracts[0] || part.inputRecipe || part.recovery || part.input?.recovery
    || part.newResourcesAllocated !== false || part.capacityReserved === true || part.input?.publicInputApproved !== true
    || !path.isAbsolute(part.sourceResultFile ?? '') || path.basename(part.sourceResultFile) !== 'result.json'
    || path.basename(path.dirname(part.sourceResultFile)) !== 'runtime'
    || path.basename(path.dirname(path.dirname(part.sourceResultFile))) !== part.input?.serviceRef?.taskId
    || !HASH.test(part.sourceResultHash) || !HASH.test(part.sourceProgramHash)
    || requirement.constraints.sourceResultHash !== part.sourceResultHash
    || requirement.constraints.functionHash !== part.delivery?.functionHash
    || requirement.constraints.inputContractHash !== (part.executionInputRecipe?.recipeHash ?? digest(part.input.input))
    || Date.parse(part.delivery?.availableUntil) < Date.parse(program.completionDeadline))
    fail('SCHEDULE_BINDING_CHANGED');
  createOutsiderJsonFunctionClient(part.delivery);
  if (recheckSource) {
    if (!existsSync(part.sourceResultFile)) fail('SCHEDULE_SOURCE_RESULT_UNAVAILABLE');
    const source = JSON.parse(readPrivateExecutionBytes(part.sourceResultFile));
    if (digest(source) !== part.sourceResultHash || source.state !== 'SUCCEEDED' || source.actualConfirmedContractDelivered !== true
      || source.program?.programHash !== part.sourceProgramHash
      || digest(source.deliveries?.[part.input.serviceRef.componentId] ?? null) !== digest(part.delivery))
      fail('SCHEDULE_SOURCE_RESULT_CHANGED');
  }
  return { lifecycle, connectionHash: digest(part.delivery), inputContractHash: requirement.constraints.inputContractHash,
    outputRequirementHash: digest({ acceptanceContract: part.acceptanceContract, functionHash: part.delivery.functionHash }),
    authorizationHash: digest({ sourceResultHash: part.sourceResultHash, sourceProgramHash: part.sourceProgramHash,
      availableUntil: part.delivery.availableUntil, publicInputApproved: true, newResourcesAllocated: false, maximumAmountMinor: '0' }),
    placementHash: digest(part.delivery.invocation) };
}

/** Recheck frozen terms against the real remaining DAG bounds. Completed and
 * unresolved effects retain their facts; their old dispatch dates are not
 * reapplied. Their original cost ceilings still count toward the same budget. */
export function assessDeclaredSchedulePlan({ preparation, parts, executionWindows, observedAt, executionFacts, acceptedTerms = {} }) {
  const program = preparation.compilation.program;
  const timing = assessRemainingExecutionPlan({ graph: preparation.graph, parts, executionWindows,
    completionDeadline: program.completionDeadline, observedAt, executionFacts });
  const frozenBudget = preparation.outcomePlanFeasibility?.budget ?? program.outcome?.budget;
  if (!frozenBudget || typeof frozenBudget.currency !== 'string' || !/^[A-Z]{3}$/u.test(frozenBudget.currency)
    || typeof frozenBudget.maximumAmountMinor !== 'string' || !/^(0|[1-9][0-9]{0,30})$/u.test(frozenBudget.maximumAmountMinor))
    fail('SCHEDULE_BUDGET_UNREPORTED');
  const terms = projectResourceGraphPlanTerms({ graph: preparation.graph, parts, operations: [] });
  const conflicts = [...timing.conflicts], gaps = [], costs = new Map(), startedCosts = new Map(), unpricedRequirementIds = [];
  const acceptedConfirmationTerms = [];
  const conflict = (requirementId, code, detail = {}) => conflicts.push({ requirementId, code, ...detail });
  const gap = (requirementId, code) => gaps.push({ requirementId, code });
  const requirementById = new Map(timing.requirements.map(row => [row.requirementId, row]));
  for (const term of terms) {
    const id = term.requirementId, remaining = executionFacts[id].state === 'UNSTARTED';
    if (term.cost === null) { unpricedRequirementIds.push(id); gap(id, 'COST_MAXIMUM_UNREPORTED'); }
    else {
      const amount = BigInt(term.cost.maximumAmountMinor), currency = term.cost.currency;
      costs.set(currency, (costs.get(currency) ?? 0n) + amount);
      if (!remaining) startedCosts.set(currency, (startedCosts.get(currency) ?? 0n) + amount);
      if (currency !== frozenBudget.currency) conflict(id, 'COST_CURRENCY_CONFLICT', { sourceHash: term.cost.sourceHash });
    }
    if (!remaining) continue;
    const bound = Date.parse(requirementById.get(id).dispatchNotBeforeBound);
    // Only the store's verified original reservation journal establishes this
    // acceptance. UNSTARTED is an execution fact, never proof of unaccepted
    // commercial terms. Direct callers without evidence retain expiry checks.
    const acceptance = acceptedTerms[id], originalPart = preparation.parts?.find(part => part.id === id);
    const previouslyAccepted = acceptance?.programHash === program.programHash && originalPart?.category === 'NATIVE_RESOURCE_NETWORK'
      && (acceptance.source === 'ORIGINAL_COMMITTED_NATIVE_RESERVATIONS' && acceptance.partHash === digest(originalPart)
        || acceptance.source === 'ORIGINAL_NATIVE_REPLACEMENT_ACTIVATION' && acceptance.originalPartHash === digest(originalPart)
          && HASH.test(acceptance.revisionHash) && acceptance.partHash === digest(parts.find(part => part.id === id)))
      && HASH.test(acceptance.evidenceHash)
      && typeof acceptance.acceptedAt === 'string' && Number.isFinite(Date.parse(acceptance.acceptedAt))
      && Date.parse(acceptance.acceptedAt) <= Date.parse(observedAt);
    if (previouslyAccepted) acceptedConfirmationTerms.push({ requirementId: id,
      acceptedAt: acceptance.acceptedAt, evidenceHash: acceptance.evidenceHash });
    for (const constraint of term.confirmationConstraints) if (!previouslyAccepted && Date.parse(observedAt) >= Date.parse(constraint.validUntil))
      conflict(id, 'SOURCE_TERMS_EXPIRED_BEFORE_SCHEDULE_ACCEPTANCE', { sourceHash: constraint.sourceHash });
    for (const constraint of term.dispatchConstraints) {
      if (constraint.latestStartAt !== undefined && bound > Date.parse(constraint.latestStartAt))
        conflict(id, 'SOURCE_LATEST_START_CONFLICT', { sourceHash: constraint.sourceHash });
      if (constraint.validUntil !== undefined && bound >= Date.parse(constraint.validUntil))
        conflict(id, 'SOURCE_DISPATCH_VALIDITY_EXPIRED', { sourceHash: constraint.sourceHash });
    }
  }
  const knownCostMaximumMinor = costs.get(frozenBudget.currency) ?? 0n;
  if (knownCostMaximumMinor > BigInt(frozenBudget.maximumAmountMinor)) conflict(null, 'KNOWN_COST_MAXIMUM_EXCEEDS_BUDGET');
  const amounts = values => Object.fromEntries([...values].sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, amount]) => [currency, amount.toString()]));
  return { ...timing, schema: 'outsider/remaining-execution-plan-assessment/v2', scope: DECLARED_SCHEDULE_SCOPE,
    acceptable: conflicts.length === 0, state: conflicts.length ? 'CONFLICT' : 'START_CONSTRAINTS_COMPATIBLE', conflicts,
    termsAssessment: { schema: 'outsider/remaining-frozen-terms-assessment/v1', observedAt, gaps, acceptedConfirmationTerms,
      checkedRequirementIds: terms.filter(term => executionFacts[term.requirementId].state === 'UNSTARTED').map(term => term.requirementId),
      newCapacityReserved: false, originalTermsRenegotiated: false },
    budget: { scope: 'ALL_ORIGINAL_FROZEN_EXECUTION_CEILINGS', currency: frozenBudget.currency,
      maximumAmountMinor: frozenBudget.maximumAmountMinor, knownCostMaximumMinor: knownCostMaximumMinor.toString(),
      knownCostMaximumByCurrency: amounts(costs), alreadyStartedCostMaximumByCurrency: amounts(startedCosts),
      startedRequirementCeilingsRetained: true, actualIncurredAmountsProven: false,
      allCostsKnown: unpricedRequirementIds.length === 0, unpricedRequirementIds, unquotedCostsIncluded: false } };
}
