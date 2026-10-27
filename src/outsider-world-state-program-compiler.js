/* Compile a selected resource plan into the EXISTING durable OutcomeProgram.
 * Planning effects are requirements to observe, not evidence of achieved state.
 * No provider is selected and no owner capacity is created by this compilation.
 */
import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import { compileOutcomeProgramV1 } from "./outsider-outcome-program-v1.js";
import { planWorldStateResources } from "./outsider-world-state-resource-planner.js";
import { normalizeEffectPreconditions } from "./outsider-effect-preconditions.js";

const SCHEMA = "outsider/world-state-program-compilation/v1";
const PRECONDITION_SCHEMA = "outsider/world-state-program-compilation/v2";
const digest = (domain, value) => `sha256:${createHash("sha256")
  .update(`${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
const fail = code => { throw new TypeError(`OUTSIDER_WORLD_STATE_COMPILER_${code}`); };
const clone = value => JSON.parse(canonicalizeStrict(value));
const nodeIdFor = actionId => `action_${createHash("sha256")
  .update(actionId).digest("hex").slice(0, 24)}`;

function criteria(predicates, prefix) {
  return predicates.map((predicate, index) => ({
    criterionId: `${prefix}_${index}`,
    comparator: predicate.operator ?? "EQ",
    subject: predicate.predicateId,
    expected: { valueType: predicate.valueType, value: predicate.value },
  }));
}

export function compileWorldStateResourcePlan(input) {
  return compileResourcePlan(input, null);
}

/** Explicit successor: declared action preconditions are read again immediately
 * before new effects by a caller-bound existing witness. This creates neither
 * a provider read capability nor a continuing validity guarantee. */
export function compileWorldStateResourcePlanWithPreconditions(input) {
  const policy = input?.preconditionObservation;
  if (!policy || typeof policy !== "object" || Array.isArray(policy)
    || Object.keys(policy).sort().join(",") !== "maximumEvidenceAgeMs,retryIntervalMs"
    || !Number.isSafeInteger(policy.maximumEvidenceAgeMs) || policy.maximumEvidenceAgeMs < 1
    || policy.maximumEvidenceAgeMs > 86400000 || !Number.isSafeInteger(policy.retryIntervalMs)
    || policy.retryIntervalMs < 1000 || policy.retryIntervalMs > 3600000) fail("PRECONDITION_POLICY_INVALID");
  return compileResourcePlan(input, clone(policy));
}

function compileResourcePlan(input, preconditionPolicy) {
  const { planningInput, programInput, actionBindings } = input ?? {};
  if (!programInput || !actionBindings) fail("PROGRAM_AND_BINDINGS_REQUIRED");
  // Recompute once from the declared input, rather than accepting an edited
  // schedule or a planId copied from a different goal/budget.
  const planningResult = planWorldStateResources(planningInput);
  const plan = input.planId === undefined || input.planId === null
    ? planningResult.plans[0]
    : planningResult.plans.find(candidate => candidate.planId === input.planId);
  if (!plan) fail("NO_SELECTED_FEASIBLE_PLAN");
  const plannedInput = planningResult.planningInput;
  const availableMs = Date.parse(programInput.completionDeadline)
    - Date.parse(programInput.formationDeadline);
  if (!Number.isFinite(availableMs) || availableMs < plan.makespanMs) {
    fail("PROGRAM_WINDOW_SHORTER_THAN_PLAN");
  }
  if (availableMs > plannedInput.deadlineMs) fail("PROGRAM_WINDOW_RELAXES_PLANNED_DEADLINE");
  if (!Array.isArray(programInput.requirements)
    || !Array.isArray(programInput.obligations)) fail("REQUIREMENTS_REQUIRED");
  const catalog = new Map(programInput.requirements.map(requirement =>
    [requirement.requirementId, requirement]));
  if (catalog.size !== programInput.requirements.length) fail("DUPLICATE_REQUIREMENT");
  const requiredIds = new Set();
  function requireRole(requirementId, role) {
    const requirement = catalog.get(requirementId);
    if (!requirement || requirement.role !== role) fail("REQUIREMENT_ROLE_MISMATCH");
    requiredIds.add(requirementId);
    return requirement;
  }
  const nodeMapping = Object.fromEntries(plan.actionGraph.map(action =>
    [action.actionId, nodeIdFor(action.actionId)]));
  const nodes = plan.actionGraph.map(action => {
    const binding = actionBindings[action.actionId];
    if (!binding) fail("ACTION_BINDING_MISSING");
    const primary = requireRole(binding.primaryRequirementId, "PRIMARY");
    requireRole(binding.recoveryRequirementId, "RECOVERY");
    requireRole(binding.witnessRequirementId, "INDEPENDENT_WITNESS");
    if (primary.capability !== action.capability) fail("PRIMARY_CAPABILITY_MISMATCH");
    let executionPreconditions = null;
    if (preconditionPolicy) {
      if (Object.hasOwn(binding.input ?? {}, "executionPreconditions")) fail("PRECONDITION_CONTRACT_SHADOWED");
      if (action.preconditions.length) {
        // Requiring this separate binding prevents a final-result observer
        // from silently acquiring authority over prerequisite facts.
        requireRole(binding.preconditionObserverRequirementId, "INDEPENDENT_WITNESS");
        executionPreconditions = normalizeEffectPreconditions({
          schema: "outsider/effect-preconditions/v1",
          observerRequirementId: binding.preconditionObserverRequirementId,
          ...preconditionPolicy, conditions: action.preconditions,
        });
      }
    }
    return {
      nodeId: nodeMapping[action.actionId], kind: "EFFECT",
      dependsOn: action.dependsOn.map(dependency => {
        if (!nodeMapping[dependency]) fail("PLAN_DEPENDENCY_UNKNOWN");
        return nodeMapping[dependency];
      }),
      primaryRequirementId: binding.primaryRequirementId,
      recoveryRequirementId: binding.recoveryRequirementId,
      witnessRequirementId: binding.witnessRequirementId,
      input: {
        ...clone(binding.input ?? {}),
        ...(executionPreconditions ? { executionPreconditions } : {}),
        worldStateAction: {
          actionId: action.actionId, capability: action.capability,
          planningHash: planningResult.planningHash, planId: plan.planId,
          preconditions: action.preconditions,
          declaredEffects: action.declaredEffects,
          resourceClaims: action.resourceClaims,
          causalDependencies: action.causalDependencies,
          resourceDependencies: action.resourceDependencies,
          plannedStartMs: action.startMs, plannedFinishMs: action.finishMs,
          declaredEffectsAreEvidence: false,
          resourceCapacityBasis: "DECLARED_PLANNING_INPUT_NOT_PROVIDER_RESERVATION",
        },
      },
      acceptance: criteria(action.declaredEffects, "effect"),
    };
  });
  requireRole(programInput.finalWitnessRequirementId, "INDEPENDENT_WITNESS");
  // Reserve only the selected network, including explicit prerequisite
  // requirements. Unselected alternatives must not consume resources.
  const queue = [...requiredIds];
  for (let index = 0; index < queue.length; index += 1) {
    const requirement = catalog.get(queue[index]);
    if (!requirement) fail("REQUIREMENT_DEPENDENCY_UNKNOWN");
    for (const dependency of requirement.dependsOnRequirementIds ?? []) {
      if (!requiredIds.has(dependency)) {
        requiredIds.add(dependency);
        queue.push(dependency);
      }
    }
  }
  const finalNodeId = "world_state_acceptance";
  const hasDependent = new Set(plan.actionGraph.flatMap(action => action.dependsOn));
  const targetAcceptance = criteria(plannedInput.targetPredicates, "target");
  nodes.push({
    nodeId: finalNodeId, kind: "OBSERVATION",
    dependsOn: plan.actionGraph.filter(action => !hasDependent.has(action.actionId))
      .map(action => nodeMapping[action.actionId]),
    primaryRequirementId: null, recoveryRequirementId: null,
    witnessRequirementId: programInput.finalWitnessRequirementId,
    input: {
      worldStateObservation: {
        planningHash: planningResult.planningHash, planId: plan.planId,
        targetPredicates: plannedInput.targetPredicates,
        observationMode: "JOINT_CURRENT_STATE",
        declaredEffectsAreEvidence: false,
        completedActionsAloneSatisfyOutcome: false,
      },
    },
    acceptance: targetAcceptance,
  });
  const requirements = programInput.requirements.filter(requirement =>
    requiredIds.has(requirement.requirementId));
  const obligations = programInput.obligations.filter(obligation =>
    requiredIds.has(obligation.targetRequirementId));
  const program = compileOutcomeProgramV1({
    programId: programInput.programId, orderId: programInput.orderId,
    createdAt: programInput.createdAt,
    formationDeadline: programInput.formationDeadline,
    completionDeadline: programInput.completionDeadline,
    tenderHash: programInput.tenderHash ?? null,
    outcome: {
      statement: programInput.statement,
      budget: plannedInput.budget, acceptance: targetAcceptance,
    },
    requirements, nodes, obligations,
    zeroInternalOps: { staffTouchLimit: 0, humanQueueFallback: false },
  });
  const schema = preconditionPolicy ? PRECONDITION_SCHEMA : SCHEMA;
  const body = {
    schema, planningResult, selectedPlanId: plan.planId,
    nodeMapping, finalNodeId, program,
    executionEngine: "EXISTING_DURABLE_OUTCOME_PROGRAM_ORCHESTRATOR",
    capacityEstablished: false, outcomeEstablished: false,
    authorityMinted: false, externalEffectsPerformed: 0,
    ...(preconditionPolicy ? { preconditionObservation: {
      ...preconditionPolicy,
      checkedNodeIds: nodes.filter(node => Object.hasOwn(node.input, "executionPreconditions")).map(node => node.nodeId),
      source: "FROZEN_SELECTED_ACTION_PRECONDITIONS",
      historicalDependencySuccessIsCurrentEvidence: false,
      continuingValidityEstablished: false, atomicCheckAndAct: false,
    } } : {}),
  };
  return { ...body, compilationHash: digest(schema, body) };
}
