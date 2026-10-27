/*
 * Outcome Formation Engine: deterministic buyer-native plan runtime v1.
 *
 * The model/cold path may compile an exact finite plan, but the per-order hot
 * path represented here accepts no prompt, model, URL, browser, or staff
 * callback. It only dispatches precompiled operation bytes through the
 * existing factory-issued buyer-native capability/runtime. This v1 is a
 * precommit lane only; consequential reserve/commit/cancel/recover operations
 * remain exclusive to the authority-bearing atomic coordinator. Transaction
 * state, idempotency, durable pre-effect attempts, and source occurrences
 * therefore remain owned by outsider-buyer-native-transaction-capability-v1.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  createBuyerNativeTransactionRouteRuntimeV1,
  OUTSIDER_BUYER_NATIVE_TRANSACTION_OPERATIONS_V1,
  OUTSIDER_BUYER_NATIVE_TRANSACTION_ROUTE_ROLES_V1,
} from "./outsider-buyer-native-transaction-capability-v1.js";

const PREFIX = "OUTSIDER_DETERMINISTIC_BUYER_NATIVE_PLAN_RUNTIME_V1_";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const STAGE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/u;
const NONCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{15,255}$/u;
const UTC_INSTANT
  = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const MAX_STAGES = 32;
const MAX_REQUEST_BYTES = 1024 * 1024;
const PRECOMMIT_OPERATIONS = Object.freeze(["QUOTE", "HOLD", "STATUS"]);

const PLANS = new WeakMap();

export const OUTSIDER_DETERMINISTIC_BUYER_NATIVE_PLAN_RUNTIME_V1_SCHEMAS
  = Object.freeze({
    plan: "outsider/deterministic-buyer-native-stage-plan/v1",
    result: "outsider/deterministic-buyer-native-plan-execution-result/v1",
  });

export const OUTSIDER_DETERMINISTIC_BUYER_NATIVE_PLAN_RUNTIME_V1_BOUNDARY
  = Object.freeze({
    position: "PRECOMPILED_BUYER_NATIVE_TRANSACTION_HOT_PATH",
    finiteStagePlanRequired: true,
    factoryIssuedPlanRequired: true,
    serializedPlanProjectionExecutable: false,
    crossProcessPlanRehydrationImplemented: false,
    privatePlanRegistryRequiredAfterRestart: true,
    expectedPlanHashRequired: true,
    factoryIssuedAccountCapabilityRequired: true,
    transactionStateMachineReused: true,
    promptInputAccepted: false,
    modelDependencyAccepted: false,
    modelCalls: 0,
    arbitraryUrlInputAccepted: false,
    browserDependencyAccepted: false,
    interactiveBrowserActions: 0,
    employeeDependencyAccepted: false,
    employeeTouches: 0,
    userBabysittingActions: 0,
    manualQueueAvailable: false,
    manualQueueEnqueues: 0,
    unknownOperationFailsClosed: true,
    capabilityMismatchFailsBeforeExternalEffect: true,
    previousSourceOccurrenceBoundAutomatically: true,
    underlyingColdReplayAndIdempotencyPreserved: true,
    globalSingleLedgerEnforcedByThisModule: false,
    productionDurableJobClaimRequired: true,
    allStageExpiryPreflightBeforeEffect: true,
    supportedOperations: PRECOMMIT_OPERATIONS,
    reserveCommitCancelRecoverRequireAtomicCoordinator: true,
    recoveryTriggerValidatedByThisModule: false,
    sourceOccurrenceTruthInheritedNotUpgraded: true,
    authorityMinted: false,
  });

function fail(code) {
  throw new TypeError(`${PREFIX}${code}`);
}

function plain(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)
    || Buffer.isBuffer(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    fail(`${code}_OBJECT_INVALID`);
  }
  return value;
}

function exact(value, fields, code) {
  plain(value, code);
  const keys = Reflect.ownKeys(value);
  if (keys.length !== fields.length
    || fields.some((field) => !Object.hasOwn(value, field))) {
    fail(`${code}_FIELDS_INVALID`);
  }
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function instant(value, code) {
  if (typeof value !== "string" || !UTC_INSTANT.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function bytesHash(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function monotonic(value, code) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function validatePrecommitSequence(stages) {
  if (stages[0].operation !== "QUOTE") fail("PLAN_MUST_START_WITH_QUOTE");
  let statusSeen = false;
  let holdSeen = false;
  for (const stage of stages) {
    if (stage.operation === "STATUS") statusSeen = true;
    if (stage.operation === "HOLD") {
      if (holdSeen || statusSeen) fail("PLAN_STATIC_TRANSITION_INVALID");
      holdSeen = true;
    }
    if (stage.operation === "QUOTE" && (holdSeen || statusSeen)) {
      fail("PLAN_STATIC_TRANSITION_INVALID");
    }
  }
}

/**
 * Freeze a JSON-projectable plan while retaining exact request bytes in a
 * private factory binding. Reissuing the same inputs through a trusted local
 * adapter registry deterministically recreates the planHash; the JSON
 * projection alone is intentionally not executable after a restart.
 */
export function createDeterministicBuyerNativeStagePlanV1(input = {}) {
  exact(input, ["planRefHash", "transactionRefHash", "outcomeIntentRefHash",
    "capability", "capabilityBindingHash", "routeRole", "formationExpiresAt",
    "stages"],
  "PLAN_INPUT");
  const planRefHash = hash(input.planRefHash, "PLAN_REF_HASH");
  const transactionRefHash = hash(input.transactionRefHash,
    "TRANSACTION_REF_HASH");
  const outcomeIntentRefHash = hash(input.outcomeIntentRefHash,
    "OUTCOME_INTENT_REF_HASH");
  const capabilityBindingHash = hash(input.capabilityBindingHash,
    "CAPABILITY_BINDING_HASH");
  if (input.capability === null || typeof input.capability !== "object"
    || input.capability.capabilityBindingHash !== capabilityBindingHash) {
    fail("CAPABILITY_OBJECT_BINDING_MISMATCH");
  }
  if (!OUTSIDER_BUYER_NATIVE_TRANSACTION_ROUTE_ROLES_V1.includes(
    input.routeRole)) fail("ROUTE_ROLE_INVALID");
  const formationExpiresAt = instant(input.formationExpiresAt,
    "FORMATION_EXPIRES_AT");
  const capabilityExpiresAt = instant(input.capability.expiresAt,
    "CAPABILITY_EXPIRES_AT");
  if (Date.parse(formationExpiresAt) > Date.parse(capabilityExpiresAt)) {
    fail("FORMATION_EXPIRES_AFTER_CAPABILITY");
  }
  if (!Array.isArray(input.stages) || input.stages.length < 1
    || input.stages.length > MAX_STAGES) fail("STAGES_INVALID");

  const stageIds = new Set();
  const nonces = new Set();
  const privateStages = [];
  const projectedStages = input.stages.map((rawStage, index) => {
    exact(rawStage, ["stageId", "operation", "operationNonce", "requestBytes",
      "expiresAt", "triggerOccurrenceHash"], "STAGE");
    if (typeof rawStage.stageId !== "string" || !STAGE_ID.test(rawStage.stageId)
      || stageIds.has(rawStage.stageId)) fail("STAGE_ID_INVALID_OR_DUPLICATE");
    stageIds.add(rawStage.stageId);
    if (typeof rawStage.operation !== "string"
      || !OUTSIDER_BUYER_NATIVE_TRANSACTION_OPERATIONS_V1.includes(
        rawStage.operation)) fail("UNKNOWN_OPERATION");
    if (!PRECOMMIT_OPERATIONS.includes(rawStage.operation)) {
      fail("CONSEQUENTIAL_OPERATION_REQUIRES_ATOMIC_COORDINATOR");
    }
    if (typeof rawStage.operationNonce !== "string"
      || !NONCE.test(rawStage.operationNonce)
      || nonces.has(rawStage.operationNonce)) {
      fail("OPERATION_NONCE_INVALID_OR_DUPLICATE");
    }
    nonces.add(rawStage.operationNonce);
    if (!Buffer.isBuffer(rawStage.requestBytes)
      || rawStage.requestBytes.length < 1
      || rawStage.requestBytes.length > MAX_REQUEST_BYTES) {
      fail("REQUEST_BYTES_INVALID");
    }
    const expiresAt = instant(rawStage.expiresAt, "STAGE_EXPIRES_AT");
    if (Date.parse(expiresAt) > Date.parse(formationExpiresAt)) {
      fail("STAGE_EXPIRES_AFTER_FORMATION");
    }
    const triggerOccurrenceHash = rawStage.triggerOccurrenceHash === null
      ? null : hash(rawStage.triggerOccurrenceHash, "TRIGGER_OCCURRENCE_HASH");
    if ((rawStage.operation === "RECOVER")
      !== (triggerOccurrenceHash !== null)) fail("RECOVERY_TRIGGER_INVALID");
    const requestBytes = Buffer.from(rawStage.requestBytes);
    const stage = Object.freeze({
      sequence: index + 1,
      stageId: rawStage.stageId,
      operation: rawStage.operation,
      operationNonce: rawStage.operationNonce,
      requestBytesHash: bytesHash(requestBytes),
      requestBytesLength: requestBytes.length,
      expiresAt,
      triggerOccurrenceHash,
    });
    privateStages.push(Object.freeze({ ...stage, requestBytes }));
    return stage;
  });

  const body = {
    schema: OUTSIDER_DETERMINISTIC_BUYER_NATIVE_PLAN_RUNTIME_V1_SCHEMAS.plan,
    schemaVersion: "1.0.0",
    planRefHash,
    transactionRefHash,
    outcomeIntentRefHash,
    capabilityBindingHash,
    routeRole: input.routeRole,
    formationExpiresAt,
    stages: Object.freeze(projectedStages),
    stageCount: projectedStages.length,
    requestBytesProjected: false,
    boundary: OUTSIDER_DETERMINISTIC_BUYER_NATIVE_PLAN_RUNTIME_V1_BOUNDARY,
  };
  validatePrecommitSequence(projectedStages);
  const plan = Object.freeze({ ...body, planHash: digest(body.schema, body) });
  PLANS.set(plan, Object.freeze({ stages: Object.freeze(privateStages),
    capability: input.capability }));
  return plan;
}

/** Execute one finite, hash-pinned plan without consulting a model or UI. */
export async function executeDeterministicBuyerNativeStagePlanV1(input = {},
  dependencies = {}) {
  exact(input, ["plan", "expectedPlanHash", "journalDirectory", "journalId"],
    "EXECUTION_INPUT");
  exact(dependencies, ["capability", "clock", "monotonicClock"],
    "EXECUTION_DEPENDENCIES");
  const privatePlan = PLANS.get(input.plan);
  if (privatePlan === undefined) fail("PLAN_NOT_FACTORY_ISSUED");
  const expectedPlanHash = hash(input.expectedPlanHash, "EXPECTED_PLAN_HASH");
  if (input.plan.planHash !== expectedPlanHash) fail("PLAN_HASH_MISMATCH");
  if (typeof dependencies.clock !== "function"
    || typeof dependencies.monotonicClock !== "function") {
    fail("CLOCK_INVALID");
  }

  if (dependencies.capability?.capabilityBindingHash
    !== input.plan.capabilityBindingHash) fail("CAPABILITY_BINDING_MISMATCH");
  if (dependencies.capability !== privatePlan.capability) {
    fail("CAPABILITY_OBJECT_IDENTITY_MISMATCH");
  }

  /* Read one wall-clock instant and reject the complete plan before runtime
     construction or the first provider operation. This prevents an already
     expired later stage from stranding an earlier HOLD. Per-operation checks
     still run in the underlying transaction runtime as execution proceeds. */
  const preflightObservedAt = instant(dependencies.clock(),
    "PREFLIGHT_OBSERVED_AT");
  const preflightTime = Date.parse(preflightObservedAt);
  if (preflightTime >= Date.parse(input.plan.formationExpiresAt)
    || preflightTime >= Date.parse(dependencies.capability.expiresAt)
    || privatePlan.stages.some((stage) =>
      preflightTime >= Date.parse(stage.expiresAt))) {
    fail("PLAN_EXPIRED_BEFORE_EXECUTION");
  }

  /* Runtime construction independently verifies that the capability is
     factory issued before any planned operation can produce an external
     effect. */
  const runtime = createBuyerNativeTransactionRouteRuntimeV1({
    journalDirectory: input.journalDirectory,
    journalId: input.journalId,
    transactionRefHash: input.plan.transactionRefHash,
    outcomeIntentRefHash: input.plan.outcomeIntentRefHash,
    routeRole: input.plan.routeRole,
    formationExpiresAt: input.plan.formationExpiresAt,
  }, { capability: dependencies.capability, clock: dependencies.clock });

  for (const stage of privatePlan.stages) {
    if (!dependencies.capability.supportedOperations.includes(stage.operation)) {
      fail("PLAN_OPERATION_NOT_SUPPORTED_BY_CAPABILITY");
    }
  }

  const stageResults = [];
  let previousSourceOccurrenceHash = null;
  let executionState = "COMPLETED";
  let finalRuntimeState = `${input.plan.routeRole}_UNFORMED`;
  let replayedStageCount = 0;
  for (const stage of privatePlan.stages) {
    const startedAt = monotonic(dependencies.monotonicClock(),
      "MONOTONIC_CLOCK");
    const method = runtime[stage.operation.toLowerCase()];
    if (typeof method !== "function") fail("UNKNOWN_OPERATION");
    const operationResult = await method({
      operationNonce: stage.operationNonce,
      requestBytes: Buffer.from(stage.requestBytes),
      expiresAt: stage.expiresAt,
      expectedPreviousOccurrenceHash: previousSourceOccurrenceHash,
      triggerOccurrenceHash: stage.triggerOccurrenceHash,
    });
    const finishedAt = monotonic(dependencies.monotonicClock(),
      "MONOTONIC_CLOCK");
    if (finishedAt < startedAt) fail("MONOTONIC_CLOCK_REVERSED");
    const projection = operationResult.publicProjection;
    if (projection.replayed === true) replayedStageCount += 1;
    if (projection.sourceOccurrenceHash !== null) {
      previousSourceOccurrenceHash = projection.sourceOccurrenceHash;
    }
    finalRuntimeState = projection.runtimeState;
    stageResults.push(Object.freeze({
      sequence: stage.sequence,
      stageId: stage.stageId,
      operation: stage.operation,
      latencyMs: finishedAt - startedAt,
      operationResult,
    }));
    if (projection.operationState === "AMBIGUOUS_NO_RETRY_HOLD") {
      executionState = "AMBIGUOUS_NO_RETRY_HOLD";
      break;
    }
    if (projection.sourceState === "REJECTED") {
      executionState = "SOURCE_REJECTED";
      break;
    }
    if (["FULFILLED", "FAILED", "CANCELLED"].includes(
      projection.sourceState)) {
      executionState = `SOURCE_${projection.sourceState}`;
      break;
    }
  }

  const publicStages = Object.freeze(stageResults.map((stage) => Object.freeze({
    sequence: stage.sequence,
    stageId: stage.stageId,
    operation: stage.operation,
    latencyMs: stage.latencyMs,
    result: stage.operationResult.publicProjection,
  })));
  const counters = Object.freeze({
    modelCalls: 0,
    interactiveBrowserActions: 0,
    employeeTouches: 0,
    userBabysittingActions: 0,
    manualQueueEnqueues: 0,
    plannedStages: privatePlan.stages.length,
    executedStages: stageResults.length,
    replayedStages: replayedStageCount,
    nonReplayStageResults: stageResults.length - replayedStageCount,
  });
  const publicProjection = Object.freeze({
    schema: OUTSIDER_DETERMINISTIC_BUYER_NATIVE_PLAN_RUNTIME_V1_SCHEMAS.result,
    schemaVersion: "1.0.0",
    planHash: input.plan.planHash,
    planRefHash: input.plan.planRefHash,
    transactionRefHash: input.plan.transactionRefHash,
    outcomeIntentRefHash: input.plan.outcomeIntentRefHash,
    routeRole: input.plan.routeRole,
    executionState,
    finalRuntimeState,
    latestSourceOccurrenceHash: previousSourceOccurrenceHash,
    counters,
    stages: publicStages,
    promptInputAccepted: false,
    modelDependencyAccepted: false,
    browserDependencyAccepted: false,
    employeeDependencyAccepted: false,
    manualQueueAvailable: false,
    authority: "NONE",
  });
  return Object.freeze({
    publicProjection,
    stageResults: Object.freeze(stageResults),
  });
}
