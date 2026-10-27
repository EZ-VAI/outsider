/*
 * A domain-neutral execution program for one Outsider order.
 *
 * The existing Outcome Tender says what may be promised.  OutcomeProgram says
 * how a temporary, order-scoped network can deliver and observe that result.
 * Provider names and credentials deliberately do not appear here: discovery
 * and binding happen at run time, per order.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { normalizeEffectPreconditions } from "./outsider-effect-preconditions.js";

export const OUTSIDER_OUTCOME_PROGRAM_V1_SCHEMA =
  "outsider/outcome-program/v1";
export const OUTSIDER_EXECUTION_ONLY_PROGRAM_V2_SCHEMA = "outsider/execution-only-program/v2";
export const OUTSIDER_EXECUTION_ONLY_PROGRAM_V3_SCHEMA = "outsider/execution-only-program/v3";
export const OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA = "outsider/execution-only-program/v4";
export const OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA = "outsider/execution-only-program/v5";
export const OUTSIDER_OBSERVATION_ONLY_PROGRAM_V1_SCHEMA = "outsider/observation-only-program/v1";

export const OUTSIDER_OUTCOME_PROGRAM_V1_ROLES = Object.freeze([
  "PRIMARY",
  "RECOVERY",
  "INDEPENDENT_WITNESS",
]);

export const OUTSIDER_OUTCOME_PROGRAM_V1_NODE_KINDS = Object.freeze([
  "EFFECT",
  "OBSERVATION",
  "CHECKPOINT",
]);

const ROLE_SET = new Set(OUTSIDER_OUTCOME_PROGRAM_V1_ROLES);
const NODE_KIND_SET = new Set(OUTSIDER_OUTCOME_PROGRAM_V1_NODE_KINDS);
const TRIGGERS = new Set(["ALWAYS", "ON_SUCCESS", "ON_FAILURE"]);
const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u;
const CURRENCY = /^[A-Z]{3}$/u;

function fail(code) {
  const error = new TypeError(`OUTSIDER_OUTCOME_PROGRAM_V1_${code}`);
  error.outsiderCode = code;
  throw error;
}

function jsonClone(value, code) {
  try {
    const encoded = canonicalizeStrict(value);
    if (Buffer.byteLength(encoded, "utf8") > 1024 * 1024) {
      fail(`${code}_TOO_LARGE`);
    }
    return JSON.parse(encoded);
  } catch (error) {
    if (error?.outsiderCode) throw error;
    fail(`${code}_NOT_CANONICAL_JSON`);
  }
}

function text(value, code, maximum = 4_096) {
  if (typeof value !== "string" || value.length < 1
    || Buffer.byteLength(value, "utf8") > maximum) fail(`${code}_INVALID`);
  return value;
}

function id(value, code) {
  if (typeof value !== "string" || !ID.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail(`${code}_INVALID`);
  return value;
}

function optionalHash(value, code) {
  if (value !== null && (typeof value !== "string" || !HASH.test(value))) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function normalizeOutcome(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("OUTCOME_INVALID");
  }
  if (!Array.isArray(value.acceptance) || value.acceptance.length < 1) {
    fail("OUTCOME_ACCEPTANCE_REQUIRED");
  }
  const acceptanceIds = new Set();
  const acceptance = value.acceptance.map((criterion) => {
    if (!criterion || typeof criterion !== "object" || Array.isArray(criterion)) {
      fail("ACCEPTANCE_CRITERION_INVALID");
    }
    const criterionId = id(criterion.criterionId, "CRITERION_ID");
    if (acceptanceIds.has(criterionId)) fail("CRITERION_ID_DUPLICATE");
    acceptanceIds.add(criterionId);
    return {
      criterionId,
      comparator: text(criterion.comparator, "CRITERION_COMPARATOR", 128),
      subject: text(criterion.subject, "CRITERION_SUBJECT", 1_024),
      expected: jsonClone(criterion.expected, "CRITERION_EXPECTED"),
    };
  });
  const budget = value.budget;
  if (!budget || typeof budget !== "object" || Array.isArray(budget)
    || typeof budget.currency !== "string" || !CURRENCY.test(budget.currency)
    || typeof budget.maximumAmountMinor !== "string"
    || !/^(?:0|[1-9]\d{0,30})$/u.test(budget.maximumAmountMinor)) {
    fail("OUTCOME_BUDGET_INVALID");
  }
  return {
    statement: text(value.statement, "OUTCOME_STATEMENT", 16_384),
    acceptance,
    budget: {
      currency: budget.currency,
      maximumAmountMinor: budget.maximumAmountMinor,
    },
  };
}

function normalizeRequirements(value, executionOnly = false, observationOnly = false) {
  if (!Array.isArray(value) || value.length < (observationOnly ? 1 : executionOnly ? 2 : 3) || value.length > 64) {
    fail("REQUIREMENTS_INVALID");
  }
  const ids = new Set();
  for (const requirement of value) {
    if (!requirement || typeof requirement !== "object"
      || Array.isArray(requirement)) fail("REQUIREMENT_INVALID");
    const requirementId = id(requirement.requirementId, "REQUIREMENT_ID");
    if (ids.has(requirementId)) fail("REQUIREMENT_ID_DUPLICATE");
    ids.add(requirementId);
  }
  const roles = new Set();
  const requirements = value.map((requirement) => {
    const requirementId = id(requirement.requirementId, "REQUIREMENT_ID");
    if (!ROLE_SET.has(requirement.role)) fail("REQUIREMENT_ROLE_INVALID");
    roles.add(requirement.role);
    const dependsOnRequirementIds = requirement.dependsOnRequirementIds ?? [];
    if (!Array.isArray(dependsOnRequirementIds)) {
      fail("REQUIREMENT_DEPENDENCIES_INVALID");
    }
    const normalizedDependencies = dependsOnRequirementIds.map((dependency) => {
      const normalized = id(dependency, "REQUIREMENT_DEPENDENCY");
      if (!ids.has(normalized) || normalized === requirementId) {
        fail("REQUIREMENT_DEPENDENCY_UNKNOWN_OR_SELF");
      }
      return normalized;
    });
    if (new Set(normalizedDependencies).size !== normalizedDependencies.length) {
      fail("REQUIREMENT_DEPENDENCY_DUPLICATE");
    }
    const minimumReservationMs = requirement.minimumReservationMs;
    if (!Number.isSafeInteger(minimumReservationMs)
      || minimumReservationMs < 1 || minimumReservationMs > 31_536_000_000) {
      fail("MINIMUM_RESERVATION_MS_INVALID");
    }
    return {
      requirementId,
      role: requirement.role,
      capability: text(requirement.capability, "REQUIREMENT_CAPABILITY", 512),
      constraints: jsonClone(requirement.constraints ?? {},
        "REQUIREMENT_CONSTRAINTS"),
      minimumReservationMs,
      dependsOnRequirementIds: normalizedDependencies,
    };
  });
  for (const role of observationOnly ? ["INDEPENDENT_WITNESS"] : executionOnly ? ["PRIMARY", "INDEPENDENT_WITNESS"] : OUTSIDER_OUTCOME_PROGRAM_V1_ROLES) {
    if (!roles.has(role)) fail(`REQUIRED_ROLE_${role}_MISSING`);
  }
  const remaining = new Map(requirements.map((requirement) => [
    requirement.requirementId,
    new Set(requirement.dependsOnRequirementIds),
  ]));
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([requirementId]) => requirementId);
    if (ready.length === 0) fail("REQUIREMENT_GRAPH_CYCLIC");
    for (const requirementId of ready) {
      remaining.delete(requirementId);
      for (const dependencies of remaining.values()) {
        dependencies.delete(requirementId);
      }
    }
  }
  return { requirements, requirementIds: ids };
}

function nullableRequirement(value, requirementIds, code) {
  if (value === null) return null;
  const normalized = id(value, code);
  if (!requirementIds.has(normalized)) fail(`${code}_UNKNOWN`);
  return normalized;
}

function normalizeNodes(value, requirementIds, nativeTransactions = false) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
    fail("NODES_INVALID");
  }
  const nodeIds = new Set();
  for (const node of value) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
      fail("NODE_INVALID");
    }
    const nodeId = id(node.nodeId, "NODE_ID");
    if (nodeIds.has(nodeId)) fail("NODE_ID_DUPLICATE");
    nodeIds.add(nodeId);
  }
  const nodes = value.map((node) => {
    if (!NODE_KIND_SET.has(node.kind) && !(nativeTransactions && node.kind === "TRANSACTION")) fail("NODE_KIND_INVALID");
    if (!Array.isArray(node.dependsOn)) fail("NODE_DEPENDENCIES_INVALID");
    const dependsOn = node.dependsOn.map((dependency) => {
      const normalized = id(dependency, "NODE_DEPENDENCY");
      if (!nodeIds.has(normalized) || normalized === node.nodeId) {
        fail("NODE_DEPENDENCY_UNKNOWN_OR_SELF");
      }
      return normalized;
    });
    if (new Set(dependsOn).size !== dependsOn.length) {
      fail("NODE_DEPENDENCY_DUPLICATE");
    }
    return {
      nodeId: node.nodeId,
      kind: node.kind,
      dependsOn,
      primaryRequirementId: nullableRequirement(node.primaryRequirementId,
        requirementIds, "NODE_PRIMARY_REQUIREMENT_ID"),
      recoveryRequirementId: nullableRequirement(node.recoveryRequirementId,
        requirementIds, "NODE_RECOVERY_REQUIREMENT_ID"),
      witnessRequirementId: nullableRequirement(node.witnessRequirementId,
        requirementIds, "NODE_WITNESS_REQUIREMENT_ID"),
      input: jsonClone(node.input ?? {}, "NODE_INPUT"),
      acceptance: jsonClone(node.acceptance ?? [], "NODE_ACCEPTANCE"),
    };
  });

  // Kahn's algorithm also yields the stable execution order used by runners.
  const remaining = new Map(nodes.map((node) =>
    [node.nodeId, new Set(node.dependsOn)]));
  const executionOrder = [];
  while (remaining.size > 0) {
    const ready = [...remaining.entries()]
      .filter(([, dependencies]) => dependencies.size === 0)
      .map(([nodeId]) => nodeId)
      .sort();
    if (ready.length === 0) fail("NODE_GRAPH_CYCLIC");
    for (const nodeId of ready) {
      executionOrder.push(nodeId);
      remaining.delete(nodeId);
      for (const dependencies of remaining.values()) dependencies.delete(nodeId);
    }
  }
  return { nodes, nodeIds, executionOrder };
}

function normalizeObligations(value, requirementIds, nodeIds,
  completionDeadline) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
    fail("OBLIGATIONS_INVALID");
  }
  const ids = new Set();
  return value.map((obligation) => {
    if (!obligation || typeof obligation !== "object"
      || Array.isArray(obligation)) fail("OBLIGATION_INVALID");
    const obligationId = id(obligation.obligationId, "OBLIGATION_ID");
    if (ids.has(obligationId)) fail("OBLIGATION_ID_DUPLICATE");
    ids.add(obligationId);
    if (!TRIGGERS.has(obligation.trigger)) fail("OBLIGATION_TRIGGER_INVALID");
    const targetRequirementId = id(obligation.targetRequirementId,
      "OBLIGATION_TARGET_REQUIREMENT_ID");
    if (!requirementIds.has(targetRequirementId)) {
      fail("OBLIGATION_TARGET_REQUIREMENT_ID_UNKNOWN");
    }
    const nodeId = obligation.nodeId === null
      ? null : id(obligation.nodeId, "OBLIGATION_NODE_ID");
    if (nodeId !== null && !nodeIds.has(nodeId)) {
      fail("OBLIGATION_NODE_ID_UNKNOWN");
    }
    const deadline = instant(obligation.deadline, "OBLIGATION_DEADLINE");
    if (Date.parse(deadline) < Date.parse(completionDeadline)) {
      fail("OBLIGATION_DEADLINE_BEFORE_COMPLETION");
    }
    return {
      obligationId,
      trigger: obligation.trigger,
      targetRequirementId,
      nodeId,
      action: text(obligation.action, "OBLIGATION_ACTION", 512),
      input: jsonClone(obligation.input ?? {}, "OBLIGATION_INPUT"),
      deadline,
    };
  });
}

function digest(body) {
  return `sha256:${createHash("sha256")
    .update(`${body.schema}\0${canonicalizeStrict(body)}`,
      "utf8").digest("hex")}`;
}

function normalize(input, executionOnly = false, nativeTransactions = false, observationOnly = false) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    fail("INPUT_INVALID");
  }
  const createdAt = instant(input.createdAt, "CREATED_AT");
  const formationDeadline = instant(input.formationDeadline,
    "FORMATION_DEADLINE");
  const completionDeadline = instant(input.completionDeadline,
    "COMPLETION_DEADLINE");
  if (Date.parse(formationDeadline) <= Date.parse(createdAt)
    || Date.parse(completionDeadline) <= Date.parse(formationDeadline)) {
    fail("DEADLINE_ORDER_INVALID");
  }
  const normalizedRequirements = normalizeRequirements(input.requirements, executionOnly, observationOnly);
  const normalizedNodes = normalizeNodes(input.nodes,
    normalizedRequirements.requirementIds, nativeTransactions);
  // Only an explicitly frozen execution contract opts into fresh reads. Old
  // program inputs/hashes stay byte-for-byte equivalent and are not upgraded.
  for (const node of normalizedNodes.nodes) {
    if (node.input && Object.hasOwn(node.input, "executionPreconditions")) {
      normalizeEffectPreconditions(node.input.executionPreconditions, {
        program: { requirements: normalizedRequirements.requirements }, node,
      });
    }
  }
  const zeroInternalOps = input.zeroInternalOps;
  if (!zeroInternalOps || zeroInternalOps.staffTouchLimit !== 0
    || zeroInternalOps.humanQueueFallback !== false) {
    fail("ZERO_INTERNAL_OPS_REQUIRED");
  }
  return {
    schema: nativeTransactions ? OUTSIDER_EXECUTION_ONLY_PROGRAM_V3_SCHEMA
      : executionOnly ? OUTSIDER_EXECUTION_ONLY_PROGRAM_V2_SCHEMA : OUTSIDER_OUTCOME_PROGRAM_V1_SCHEMA,
    ...(executionOnly ? { commitmentMode: "EXECUTION_ONLY_NO_OUTCOME_PROMISE" } : {}),
    programId: id(input.programId, "PROGRAM_ID"),
    orderId: id(input.orderId, "ORDER_ID"),
    createdAt,
    formationDeadline,
    completionDeadline,
    tenderHash: optionalHash(input.tenderHash, "TENDER_HASH"),
    outcome: normalizeOutcome(input.outcome),
    requirements: normalizedRequirements.requirements,
    nodes: normalizedNodes.nodes,
    executionOrder: normalizedNodes.executionOrder,
    obligations: normalizeObligations(input.obligations,
      normalizedRequirements.requirementIds, normalizedNodes.nodeIds,
      completionDeadline),
    zeroInternalOps: {
      staffTouchLimit: 0,
      humanQueueFallback: false,
    },
  };
}

export function compileOutcomeProgramV1(input) {
  const body = normalize(input);
  return Object.freeze({ ...body, programHash: digest(body) });
}

export function verifyOutcomeProgramV1(program) {
  if (!program || typeof program !== "object" || Array.isArray(program)
    || program.schema !== OUTSIDER_OUTCOME_PROGRAM_V1_SCHEMA
    || typeof program.programHash !== "string" || !HASH.test(program.programHash)) {
    fail("PROGRAM_INVALID");
  }
  const input = { ...program };
  delete input.schema;
  delete input.executionOrder;
  delete input.programHash;
  const rebuilt = compileOutcomeProgramV1(input);
  if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(program)) {
    fail("PROGRAM_HASH_OR_CONTENT_INVALID");
  }
  return rebuilt;
}

// A separately typed successor for the ordinary execution product layer.
// V1 still requires PRIMARY + RECOVERY + INDEPENDENT_WITNESS and rejects this
// schema. No old program/hash or promised-order admission rule is reinterpreted.
export function compileExecutionOnlyProgramV2(input) {
  if (input.commitmentMode !== "EXECUTION_ONLY_NO_OUTCOME_PROMISE" || input.tenderHash !== null
    || input.outcome?.budget?.maximumAmountMinor !== "0") fail("EXECUTION_ONLY_SCOPE_INVALID");
  const body = normalize(input, true);
  return Object.freeze({ ...body, programHash: digest(body) });
}
// Read-only goals use original observation nodes without inventing a primary
// executor or reserved backup. This distinct schema leaves V1–V4 admission and
// their canonical bytes unchanged; mixed graphs still use their original type.
export function compileObservationOnlyProgramV1(input) {
  if (input.commitmentMode !== "EXECUTION_ONLY_NO_OUTCOME_PROMISE" || input.tenderHash !== null
    || input.outcome?.budget?.maximumAmountMinor !== "0") fail("OBSERVATION_ONLY_SCOPE_INVALID");
  const body = { ...normalize(input, true, false, true), schema: OUTSIDER_OBSERVATION_ONLY_PROGRAM_V1_SCHEMA };
  if (body.requirements.some(row => row.role !== "INDEPENDENT_WITNESS"
      || row.constraints.admissionMode !== "ON_DEMAND_OBSERVATION")
    || body.nodes.some(row => row.kind !== "OBSERVATION" || row.primaryRequirementId !== null
      || row.recoveryRequirementId !== null || row.witnessRequirementId === null)) fail("OBSERVATION_ONLY_SCOPE_INVALID");
  return Object.freeze({ ...body, programHash: digest(body) });
}
// V3 moves non-reserved, zero-cost transactions into the effect DAG. It is
// ordinary execution, not a V1 outcome promise or a claim of reserved recovery.
// Frozen V1/V2 hashes and execution semantics remain independently verifiable.
export function compileExecutionOnlyProgramV3(input) {
  if (input.commitmentMode !== "EXECUTION_ONLY_NO_OUTCOME_PROMISE" || input.tenderHash !== null
    || input.outcome?.budget?.maximumAmountMinor !== "0") fail("EXECUTION_ONLY_SCOPE_INVALID");
  const body = normalize(input, true, true);
  for (const node of body.nodes.filter(row => row.kind === "TRANSACTION")) {
    const primary = body.requirements.find(row => row.requirementId === node.primaryRequirementId);
    const witness = body.requirements.find(row => row.requirementId === node.witnessRequirementId);
    if (primary?.role !== "PRIMARY" || primary.constraints.admissionMode !== "EXECUTION_PHASE_TRANSACTION"
      || primary.constraints.maximumAmountMinor !== "0" || node.recoveryRequirementId !== null
      || witness?.role !== "INDEPENDENT_WITNESS") fail("TRANSACTION_EXECUTION_SCOPE_INVALID");
  }
  return Object.freeze({ ...body, programHash: digest(body) });
}
// V4 accepts one explicitly bound, non-reserved A2A substitute. V1–V3 retain
// their own validators and hashes; adding a second invocation is new consent.
export function compileExecutionOnlyProgramV4(input) {
  if (input.commitmentMode !== "EXECUTION_ONLY_NO_OUTCOME_PROMISE" || input.tenderHash !== null
    || input.outcome?.budget?.maximumAmountMinor !== "0") fail("EXECUTION_ONLY_SCOPE_INVALID");
  const body = { ...normalize(input, true, true), schema: OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA };
  validateExecutionTransactions(body);
  return Object.freeze({ ...body, programHash: digest(body) });
}

// A priced purchase is an explicit liability within the existing effect DAG.
// Its bound quote and aggregate ceiling are part of the confirmed program;
// provider-specific payment methods remain the native adapter's contract.
export function compileExecutionOnlyProgramV5(input) {
  if (input.commitmentMode !== "EXECUTION_ONLY_NO_OUTCOME_PROMISE" || input.tenderHash !== null)
    fail("EXECUTION_ONLY_SCOPE_INVALID");
  const body = { ...normalize(input, true, true), schema: OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA };
  validateExecutionTransactions(body, true);
  return Object.freeze({ ...body, programHash: digest(body) });
}

function validateExecutionTransactions(body, pricedPurchases = false) {
  const purchases = new Set();
  let committedAmount = 0n;
  for (const node of body.nodes.filter(row => row.kind === "TRANSACTION")) {
    const primary = body.requirements.find(row => row.requirementId === node.primaryRequirementId);
    const witness = body.requirements.find(row => row.requirementId === node.witnessRequirementId);
    const terms = primary?.constraints;
    const priced = pricedPurchases && /^[1-9]\d{0,30}$/u.test(terms?.maximumAmountMinor ?? '');
    if (primary?.role !== "PRIMARY" || primary.constraints.admissionMode !== "EXECUTION_PHASE_TRANSACTION"
      || !priced && primary.constraints.maximumAmountMinor !== "0" || witness?.role !== "INDEPENDENT_WITNESS")
      fail("TRANSACTION_EXECUTION_SCOPE_INVALID");
    if (priced) {
      if (terms.newPurchaseAuthorized !== true || terms.currency !== body.outcome.budget.currency
        || !HASH.test(terms.checkoutPlanHash ?? '') || !HASH.test(terms.quoteHash ?? '')
        || node.recoveryRequirementId !== null || purchases.has(primary.requirementId))
        fail('PRICED_PURCHASE_BINDING_INVALID');
      purchases.add(primary.requirementId);
      committedAmount += BigInt(terms.maximumAmountMinor);
    }
    if (node.recoveryRequirementId === null) {
      if (Object.hasOwn(node.input, 'recoveryContract')) fail('A2A_RECOVERY_CONTRACT_WITHOUT_ROUTE');
      continue;
    }
    const recovery = body.requirements.find(row => row.requirementId === node.recoveryRequirementId);
    const contract = node.input?.recoveryContract;
    if (recovery?.role !== 'RECOVERY' || !contract || typeof contract !== 'object' || Array.isArray(contract)
      || Object.keys(contract).sort().join(',') !== 'inputContractHash,maximumRecoveryAttempts,outputRequirementHash,primaryConnectionHash,recoveryConnectionHash,schema,trigger'
      || contract.schema !== 'outsider/a2a-task-recovery-contract/v1'
      || contract.trigger !== 'PRIMARY_CONFIRMED_FAILURE' || contract.maximumRecoveryAttempts !== 1)
      fail('A2A_RECOVERY_CONTRACT_INVALID');
    for (const requirement of [primary, recovery]) {
      const constraints = requirement.constraints;
      if (requirement.capability !== 'A2A_AGENT_TASK_V1'
        || constraints.admissionMode !== 'EXECUTION_PHASE_TRANSACTION' || constraints.maximumAmountMinor !== '0'
        || constraints.reservedAgentCapacityRequired !== false
        || ['connectionHash', 'inputContractHash', 'outputRequirementHash'].some(key => !HASH.test(constraints[key] ?? ''))
        || Object.hasOwn(constraints, 'skillSelectionHash') && !HASH.test(constraints.skillSelectionHash ?? ''))
        fail('A2A_RECOVERY_REQUIREMENT_INVALID');
    }
    if (primary.constraints.connectionHash === recovery.constraints.connectionHash
      || primary.constraints.inputContractHash !== recovery.constraints.inputContractHash
      || primary.constraints.outputRequirementHash !== recovery.constraints.outputRequirementHash
      || contract.primaryConnectionHash !== primary.constraints.connectionHash
      || contract.recoveryConnectionHash !== recovery.constraints.connectionHash
      || contract.inputContractHash !== primary.constraints.inputContractHash
      || contract.outputRequirementHash !== primary.constraints.outputRequirementHash)
      fail('A2A_RECOVERY_CONTRACT_BINDING_INVALID');
  }
  if (pricedPurchases && (!purchases.size || committedAmount > BigInt(body.outcome.budget.maximumAmountMinor)))
    fail('PRICED_PURCHASE_BUDGET_INVALID');
}
export function verifyExecutableOutcomeProgram(program) {
  if (program?.schema === OUTSIDER_OUTCOME_PROGRAM_V1_SCHEMA) return verifyOutcomeProgramV1(program);
  if (![OUTSIDER_EXECUTION_ONLY_PROGRAM_V2_SCHEMA, OUTSIDER_EXECUTION_ONLY_PROGRAM_V3_SCHEMA,
    OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA, OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA,
    OUTSIDER_OBSERVATION_ONLY_PROGRAM_V1_SCHEMA].includes(program?.schema)
    || !HASH.test(program.programHash ?? "")) fail("PROGRAM_INVALID");
  const rebuilt = program.schema === OUTSIDER_OBSERVATION_ONLY_PROGRAM_V1_SCHEMA ? compileObservationOnlyProgramV1(program)
    : program.schema === OUTSIDER_EXECUTION_ONLY_PROGRAM_V5_SCHEMA ? compileExecutionOnlyProgramV5(program)
    : program.schema === OUTSIDER_EXECUTION_ONLY_PROGRAM_V4_SCHEMA ? compileExecutionOnlyProgramV4(program)
    : program.schema === OUTSIDER_EXECUTION_ONLY_PROGRAM_V3_SCHEMA
    ? compileExecutionOnlyProgramV3(program) : compileExecutionOnlyProgramV2(program);
  if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(program)) fail("PROGRAM_HASH_OR_CONTENT_INVALID");
  return rebuilt;
}
