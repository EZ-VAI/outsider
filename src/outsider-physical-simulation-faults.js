/*
 * Pure, offline fault injection for already supplied synthetic Harness VLA
 * traces. This module never opens files, starts processes, sends commands, or
 * accesses a device. A trace rejection is evidence about the trace boundary;
 * it is never evidence that a robot was safe.
 */

import { canonicalizeStrict } from "./canonical.js";
import {
  HARNESS_VLA_TRACE_SCHEMAS,
  createHarnessVlaTraceProjection,
  hashHarnessVlaTraceValue,
  verifyHarnessVlaTraceProjection,
} from "./outsider-harness-vla-trace.js";

export const PHYSICAL_SIMULATION_FAULT_SCHEMAS = Object.freeze({
  plan: "outsider/physical-simulation-fault-plan/v1",
  faultCase: "outsider/physical-simulation-fault-case/v1",
  report: "outsider/physical-simulation-fault-report/v1",
  result: "outsider/physical-simulation-fault-result/v1",
});

export const PHYSICAL_SIMULATION_FAULTS = Object.freeze([
  "PLANNER_FALSE_FINAL_CLAIM",
  "FAILED_RECEIPT_FALSE_LOCAL_PASS",
  "VLA_CHECKPOINT_DRIFT",
  "PRIMITIVE_JUDGE_DRIFT",
  "FINAL_JUDGE_DRIFT",
  "CALIBRATION_DRIFT",
  "STALE_COORDINATE_BINDING",
  "MISSING_RECEIPT",
  "OMITTED_ATTEMPT_GAP",
  "RETRY_BUDGET_EXCEEDED",
  "BUDGET_EXHAUSTION_MISMATCH",
]);

export const PHYSICAL_SIMULATION_FAULT_CLASSIFICATIONS = Object.freeze([
  "DETECTED_REJECTED",
  "DETECTED_QUARANTINED",
  "NOT_OBSERVABLE_WITH_CURRENT_TRACE",
]);

const FAULT_SET = new Set(PHYSICAL_SIMULATION_FAULTS);
const CLASSIFICATION_SET = new Set(PHYSICAL_SIMULATION_FAULT_CLASSIFICATIONS);
const HASH = /^sha256:[a-f0-9]{64}$/u;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,255}$/u;
const MAX_CASES = 1024;

const EXPECTED_REJECTIONS = Object.freeze({
  PRIMITIVE_JUDGE_DRIFT: new Set([
    "HARNESS_VLA_TRACE_PRIMITIVE_JUDGE_DRIFT",
  ]),
  FINAL_JUDGE_DRIFT: new Set([
    "HARNESS_VLA_TRACE_FINAL_JUDGE_DRIFT",
  ]),
  CALIBRATION_DRIFT: new Set([
    "HARNESS_VLA_TRACE_CALIBRATION_DRIFT",
  ]),
  STALE_COORDINATE_BINDING: new Set([
    "HARNESS_VLA_TRACE_STALE_COORDINATE_BINDING",
    "HARNESS_VLA_TRACE_COORDINATE_BINDING_RELEASE_DRIFT",
  ]),
  MISSING_RECEIPT: new Set([
    "HARNESS_VLA_TRACE_ATTEMPT_SHAPE_INVALID",
    "HARNESS_VLA_TRACE_RECEIPT_SHAPE_INVALID",
  ]),
  OMITTED_ATTEMPT_GAP: new Set([
    "HARNESS_VLA_TRACE_ATTEMPT_NN_GAP",
  ]),
  RETRY_BUDGET_EXCEEDED: new Set([
    "HARNESS_VLA_TRACE_RETRY_BUDGET_EXCEEDED",
  ]),
  BUDGET_EXHAUSTION_MISMATCH: new Set([
    "HARNESS_VLA_TRACE_BUDGET_EXHAUSTION_UNSUPPORTED_BY_USAGE",
  ]),
});

function fail(code) {
  throw new Error(`PHYSICAL_SIMULATION_FAULT_${code}`);
}

function plain(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function requireShape(value, keys, code) {
  if (!exactKeys(value, keys)) fail(`${code}_SHAPE_INVALID`);
  return value;
}

function requireIdentifier(value, code) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(`${code}_INVALID`);
  return value;
}

function requireHash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(`${code}_INVALID`);
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function deeplyFrozen(value) {
  if (!value || typeof value !== "object" || !Object.isFrozen(value)) return false;
  return Object.values(value).every((child) => (
    child == null || typeof child !== "object" || deeplyFrozen(child)
  ));
}

function clone(value) {
  return JSON.parse(canonicalizeStrict(value));
}

function commitment(domain, value) {
  return hashHarnessVlaTraceValue({
    schema: "outsider/physical-simulation-fault-commitment/v1",
    domain,
    value,
  });
}

function projectionAbsenceCommitment(sourceCommitment, errorCommitment) {
  return commitment("projection-not-created", { sourceCommitment, errorCommitment });
}

function noErrorCommitment(sourceCommitment) {
  return commitment("no-error", { sourceCommitment });
}

function exactErrorCommitment(error) {
  return commitment("adapter-error", {
    name: String(error?.name ?? "Error"),
    message: String(error?.message ?? error),
  });
}

function validateCase(value) {
  requireShape(value, ["schema", "caseId", "fault", "targetAttemptNn"], "CASE");
  if (value.schema !== PHYSICAL_SIMULATION_FAULT_SCHEMAS.faultCase) {
    fail("CASE_SCHEMA_INVALID");
  }
  requireIdentifier(value.caseId, "CASE_ID");
  if (!FAULT_SET.has(value.fault)) fail("CASE_KIND_INVALID");
  if (!(value.targetAttemptNn == null
    || (Number.isSafeInteger(value.targetAttemptNn) && value.targetAttemptNn >= 1))) {
    fail("CASE_TARGET_INVALID");
  }
  return value;
}

function validatePlan(value, sourceCommitment) {
  requireShape(value, ["schema", "planId", "sourceCommitment", "cases"], "PLAN");
  if (value.schema !== PHYSICAL_SIMULATION_FAULT_SCHEMAS.plan) {
    fail("PLAN_SCHEMA_INVALID");
  }
  if (!deeplyFrozen(value)) fail("PLAN_NOT_DEEPLY_FROZEN");
  requireIdentifier(value.planId, "PLAN_ID");
  requireHash(value.sourceCommitment, "PLAN_SOURCE_COMMITMENT");
  if (value.sourceCommitment !== sourceCommitment) fail("PLAN_SOURCE_BINDING_INVALID");
  if (!Array.isArray(value.cases) || value.cases.length === 0
    || value.cases.length > MAX_CASES) fail("PLAN_CASES_INVALID");
  const ids = new Set();
  for (const entry of value.cases) {
    validateCase(entry);
    if (ids.has(entry.caseId)) fail("PLAN_CASE_ID_DUPLICATE");
    ids.add(entry.caseId);
  }
  return value;
}

function normalizePlanCases(cases) {
  if (!Array.isArray(cases) || cases.length === 0 || cases.length > MAX_CASES) {
    fail("PLAN_CASES_INVALID");
  }
  return cases.map((entry) => {
    requireShape(entry, ["caseId", "fault", "targetAttemptNn"], "CASE_INPUT");
    return {
      schema: PHYSICAL_SIMULATION_FAULT_SCHEMAS.faultCase,
      caseId: requireIdentifier(entry.caseId, "CASE_ID"),
      fault: FAULT_SET.has(entry.fault) ? entry.fault : fail("CASE_KIND_INVALID"),
      targetAttemptNn: entry.targetAttemptNn,
    };
  });
}

export function createPhysicalSimulationFaultPlan({ planId, source, cases } = {}) {
  canonicalizeStrict(source);
  const plan = {
    schema: PHYSICAL_SIMULATION_FAULT_SCHEMAS.plan,
    planId: requireIdentifier(planId, "PLAN_ID"),
    sourceCommitment: hashHarnessVlaTraceValue(source),
    cases: normalizePlanCases(cases),
  };
  const frozen = deepFreeze(plan);
  validatePlan(frozen, hashHarnessVlaTraceValue(source));
  return frozen;
}

function attemptIndex(source, targetAttemptNn, predicate = () => true) {
  if (!Array.isArray(source.attempts)) return -1;
  if (targetAttemptNn != null) {
    return source.attempts.findIndex((attempt) => (
      attempt?.nn === targetAttemptNn && predicate(attempt)
    ));
  }
  return source.attempts.findIndex(predicate);
}

function replacementHash(faultCase, original) {
  return commitment(`replacement:${faultCase.fault}`, {
    caseId: faultCase.caseId,
    original,
  });
}

function applyPlannerFalseFinalClaim(source, faultCase) {
  const latestObservation = source.attempts?.at(-1)?.nextObservation
    ?? source.initialObservation;
  if (!latestObservation || !plain(source.terminal) || !plain(source.rollout)) {
    return false;
  }
  source.terminal.plannerReportedSuccess = true;
  source.terminal.finalBenchmarkPredicate = {
    schema: HARNESS_VLA_TRACE_SCHEMAS.finalPredicate,
    observationHash: hashHarnessVlaTraceValue(latestObservation),
    judgeReleaseHash: source.rollout.finalJudgeReleaseHash,
    verdict: "FAIL",
    evidence: { syntheticFaultEvidenceCommitment: commitment("planner-false-claim", {
      caseId: faultCase.caseId,
    }) },
  };
  return true;
}

function applyFailedReceiptFalsePass(source, faultCase) {
  const index = attemptIndex(source, faultCase.targetAttemptNn, (attempt) => (
    plain(attempt?.receipt) && plain(attempt?.primitivePostcondition)
  ));
  if (index < 0) return false;
  source.attempts[index].receipt.status = "FAILED";
  source.attempts[index].primitivePostcondition.verdict = "PASS";
  return true;
}

function applyVlaCheckpointDrift(source, faultCase) {
  if (!plain(source.rollout) || typeof source.rollout.vlaReleaseHash !== "string") {
    return false;
  }
  source.rollout.vlaReleaseHash = replacementHash(faultCase,
    source.rollout.vlaReleaseHash);
  return true;
}

function applyPrimitiveJudgeDrift(source, faultCase) {
  const index = attemptIndex(source, faultCase.targetAttemptNn, (attempt) => (
    plain(attempt?.primitivePostcondition)
  ));
  if (index < 0) return false;
  const postcondition = source.attempts[index].primitivePostcondition;
  postcondition.judgeReleaseHash = replacementHash(faultCase,
    postcondition.judgeReleaseHash);
  return true;
}

function applyFinalJudgeDrift(source, faultCase) {
  const predicate = source.terminal?.finalBenchmarkPredicate;
  if (!plain(predicate)) return false;
  predicate.judgeReleaseHash = replacementHash(faultCase, predicate.judgeReleaseHash);
  return true;
}

function applyCalibrationDrift(source, faultCase) {
  const index = attemptIndex(source, faultCase.targetAttemptNn, (attempt) => (
    plain(attempt?.nextObservation)
  ));
  if (index < 0) return false;
  const observation = source.attempts[index].nextObservation;
  observation.calibrationReleaseHash = replacementHash(faultCase,
    observation.calibrationReleaseHash);
  return true;
}

function applyStaleCoordinateBinding(source, faultCase) {
  const index = attemptIndex(source, faultCase.targetAttemptNn, (attempt) => (
    plain(attempt?.command?.coordinateBinding)
  ));
  if (index < 0) return false;
  const binding = source.attempts[index].command.coordinateBinding;
  binding.observationHash = replacementHash(faultCase, binding.observationHash);
  return true;
}

function applyMissingReceipt(source, faultCase) {
  const index = attemptIndex(source, faultCase.targetAttemptNn, (attempt) => (
    plain(attempt) && Object.hasOwn(attempt, "receipt")
  ));
  if (index < 0) return false;
  delete source.attempts[index].receipt;
  return true;
}

function applyOmittedAttemptGap(source, faultCase) {
  if (!Array.isArray(source.attempts) || source.attempts.length < 2) return false;
  let index = attemptIndex(source, faultCase.targetAttemptNn);
  if (faultCase.targetAttemptNn == null) index = 0;
  if (index < 0 || index === source.attempts.length - 1) return false;
  source.attempts.splice(index, 1);
  return true;
}

function applyRetryBudgetExceeded(source) {
  if (!plain(source.rollout?.budgets) || !Array.isArray(source.attempts)) return false;
  let retries = source.attempts.filter((attempt) => attempt?.command?.retryOf != null).length;
  if (retries === 0) {
    let later = -1;
    let priorNn = null;
    for (let index = 1; index < source.attempts.length && later < 0; index += 1) {
      const primitive = source.attempts[index]?.command?.primitive;
      const prior = source.attempts.slice(0, index).find((attempt) => (
        attempt?.command?.primitive === primitive
      ));
      if (prior) {
        later = index;
        priorNn = prior.nn;
      }
    }
    if (later < 0) return false;
    source.attempts[later].command.retryOf = priorNn;
    retries = 1;
  }
  source.rollout.budgets.maxRetries = retries - 1;
  return true;
}

function applyBudgetExhaustionMismatch(source) {
  if (!plain(source.terminal) || !plain(source.rollout?.budgets)
    || !Array.isArray(source.attempts)) return false;
  const attempts = source.attempts.length;
  const retries = source.attempts.filter((attempt) => attempt?.command?.retryOf != null).length;
  const vlaChunks = source.attempts.reduce((sum, attempt) => (
    sum + Number(attempt?.receipt?.usage?.vlaChunks ?? 0)
  ), 0);
  const riskUnits = source.attempts.reduce((sum, attempt) => (
    sum + Number(attempt?.receipt?.usage?.riskUnits ?? 0)
  ), 0);
  const largestPerCommandVlaLimit = source.attempts.reduce((maximum, attempt) => (
    Math.max(maximum, Number(attempt?.command?.parameters?.maxChunks ?? 0))
  ), 0);
  source.rollout.budgets.maxCommands = attempts + 1;
  source.rollout.budgets.maxVlaChunks = Math.max(vlaChunks + 1,
    largestPerCommandVlaLimit);
  if (source.rollout.budgets.maxVlaChunks === vlaChunks) {
    source.rollout.budgets.maxVlaChunks += 1;
  }
  source.rollout.budgets.maxRetries = retries + 1;
  source.rollout.budgets.maxRiskUnits = riskUnits + 1;
  source.terminal.reason = "BUDGET_EXHAUSTED";
  return true;
}

const APPLY = Object.freeze({
  PLANNER_FALSE_FINAL_CLAIM: applyPlannerFalseFinalClaim,
  FAILED_RECEIPT_FALSE_LOCAL_PASS: applyFailedReceiptFalsePass,
  VLA_CHECKPOINT_DRIFT: applyVlaCheckpointDrift,
  PRIMITIVE_JUDGE_DRIFT: applyPrimitiveJudgeDrift,
  FINAL_JUDGE_DRIFT: applyFinalJudgeDrift,
  CALIBRATION_DRIFT: applyCalibrationDrift,
  STALE_COORDINATE_BINDING: applyStaleCoordinateBinding,
  MISSING_RECEIPT: applyMissingReceipt,
  OMITTED_ATTEMPT_GAP: applyOmittedAttemptGap,
  RETRY_BUDGET_EXCEEDED: applyRetryBudgetExceeded,
  BUDGET_EXHAUSTION_MISMATCH: applyBudgetExhaustionMismatch,
});

function acceptedProjection(source) {
  const projection = createHarnessVlaTraceProjection({ source });
  const verification = verifyHarnessVlaTraceProjection(projection, { source });
  if (!verification.ok || verification.commandsExecuted !== false
    || verification.devicesAccessed !== false) {
    fail("TRACE_REPLAY_VERIFICATION_FAILED");
  }
  return { projection, verification };
}

function semanticQuarantine(fault, projection) {
  if (fault === "PLANNER_FALSE_FINAL_CLAIM") {
    return projection.terminal.plannerClaimAgreesWithFinalJudge === false;
  }
  if (fault === "FAILED_RECEIPT_FALSE_LOCAL_PASS") {
    return projection.attempts.some((attempt) => (
      attempt.receipt.status !== "EXECUTED"
      && attempt.primitivePostcondition.verdict === "PASS"
      && attempt.disposition === "EXECUTION_FAILURE"
    ));
  }
  return false;
}

function expectedRejection(fault, error) {
  return EXPECTED_REJECTIONS[fault]?.has(String(error?.message ?? error)) ?? false;
}

function resultForCase(source, faultCase) {
  const mutated = clone(source);
  const faultApplied = Boolean(APPLY[faultCase.fault](mutated, faultCase));
  const sourceCommitment = hashHarnessVlaTraceValue(mutated);
  let projection = null;
  let verification = null;
  let error = null;
  try {
    ({ projection, verification } = acceptedProjection(mutated));
  } catch (caught) {
    error = caught;
  }

  const errorCommitment = error == null
    ? noErrorCommitment(sourceCommitment) : exactErrorCommitment(error);
  const projectionCommitment = projection == null
    ? projectionAbsenceCommitment(sourceCommitment, errorCommitment)
    : projection.projectionHash;

  let classification = "NOT_OBSERVABLE_WITH_CURRENT_TRACE";
  let detectionMechanism = "NONE";
  if (faultApplied && error != null && expectedRejection(faultCase.fault, error)) {
    classification = "DETECTED_REJECTED";
    detectionMechanism = "TRACE_SCHEMA_OR_BINDING_REJECTION";
  } else if (faultApplied && projection != null
    && semanticQuarantine(faultCase.fault, projection)) {
    classification = "DETECTED_QUARANTINED";
    detectionMechanism = "TRACE_SEMANTIC_QUARANTINE";
  } else if (error != null) {
    detectionMechanism = "UNEXPECTED_ADAPTER_ERROR_NOT_CREDITED";
  }

  const body = {
    schema: PHYSICAL_SIMULATION_FAULT_SCHEMAS.result,
    caseRef: hashHarnessVlaTraceValue(faultCase.caseId),
    fault: faultCase.fault,
    targetAttemptNn: faultCase.targetAttemptNn,
    faultApplied,
    classification,
    detectionMechanism,
    sourceCommitment,
    projectionArtifact: projection == null ? "NOT_CREATED" : "CREATED",
    projectionCommitment,
    errorArtifact: error == null ? "NONE" : "OBSERVED",
    errorCommitment,
    traceAccepted: projection != null,
    traceVerificationAccepted: verification?.ok === true,
    safetyOutcomeEstablished: false,
  };
  return Object.freeze({ ...body, resultHash: commitment("fault-result", body) });
}

function validateResult(value) {
  requireShape(value, [
    "schema", "caseRef", "fault", "targetAttemptNn", "faultApplied",
    "classification", "detectionMechanism", "sourceCommitment",
    "projectionArtifact", "projectionCommitment", "errorArtifact",
    "errorCommitment", "traceAccepted", "traceVerificationAccepted",
    "safetyOutcomeEstablished", "resultHash",
  ], "RESULT");
  if (value.schema !== PHYSICAL_SIMULATION_FAULT_SCHEMAS.result
    || !FAULT_SET.has(value.fault)
    || !CLASSIFICATION_SET.has(value.classification)
    || typeof value.faultApplied !== "boolean"
    || typeof value.traceAccepted !== "boolean"
    || typeof value.traceVerificationAccepted !== "boolean"
    || value.safetyOutcomeEstablished !== false
    || !["CREATED", "NOT_CREATED"].includes(value.projectionArtifact)
    || !["NONE", "OBSERVED"].includes(value.errorArtifact)) {
    fail("RESULT_INVALID");
  }
  for (const field of ["caseRef", "sourceCommitment", "projectionCommitment",
    "errorCommitment", "resultHash"]) requireHash(value[field], `RESULT_${field}`);
  const { resultHash, ...body } = value;
  if (commitment("fault-result", body) !== resultHash) fail("RESULT_HASH_INVALID");
  return value;
}

function buildReport(source, plan) {
  const baselineSourceCommitment = hashHarnessVlaTraceValue(source);
  validatePlan(plan, baselineSourceCommitment);
  const baseline = acceptedProjection(clone(source));
  const baselineVerificationCommitment = commitment("baseline-verification",
    baseline.verification);
  const results = plan.cases.map((faultCase) => resultForCase(source, faultCase));
  const summary = {
    total: results.length,
    detectedRejected: results.filter((result) => (
      result.classification === "DETECTED_REJECTED"
    )).length,
    detectedQuarantined: results.filter((result) => (
      result.classification === "DETECTED_QUARANTINED"
    )).length,
    notObservableWithCurrentTrace: results.filter((result) => (
      result.classification === "NOT_OBSERVABLE_WITH_CURRENT_TRACE"
    )).length,
  };
  const body = {
    schema: PHYSICAL_SIMULATION_FAULT_SCHEMAS.report,
    planCommitment: hashHarnessVlaTraceValue(plan),
    control: {
      status: "ACCEPTED",
      sourceCommitment: baselineSourceCommitment,
      projectionCommitment: baseline.projection.projectionHash,
      verificationCommitment: baselineVerificationCommitment,
      traceVerificationAccepted: true,
    },
    results,
    summary,
    runner: {
      mode: "OFFLINE_PURE_TRACE_REPLAY",
      humanConfirmationRequests: 0,
      deviceCommands: 0,
      commandsExecuted: 0,
      devicesAccessed: false,
      robotSafetyEstablished: false,
    },
  };
  return deepFreeze({ ...body, reportHash: commitment("fault-report", body) });
}

export function runPhysicalSimulationFaultPlan({ source, faultPlan } = {}) {
  canonicalizeStrict(source);
  return buildReport(source, faultPlan);
}

function validateReportShape(report) {
  requireShape(report, [
    "schema", "planCommitment", "control", "results", "summary", "runner",
    "reportHash",
  ], "REPORT");
  if (report.schema !== PHYSICAL_SIMULATION_FAULT_SCHEMAS.report) {
    fail("REPORT_SCHEMA_INVALID");
  }
  requireHash(report.planCommitment, "REPORT_PLAN_COMMITMENT");
  requireHash(report.reportHash, "REPORT_HASH");
  requireShape(report.control, [
    "status", "sourceCommitment", "projectionCommitment",
    "verificationCommitment", "traceVerificationAccepted",
  ], "REPORT_CONTROL");
  if (report.control.status !== "ACCEPTED"
    || report.control.traceVerificationAccepted !== true) fail("REPORT_CONTROL_INVALID");
  for (const field of ["sourceCommitment", "projectionCommitment",
    "verificationCommitment"]) requireHash(report.control[field], `REPORT_CONTROL_${field}`);
  if (!Array.isArray(report.results)) fail("REPORT_RESULTS_INVALID");
  report.results.forEach(validateResult);
  requireShape(report.summary, [
    "total", "detectedRejected", "detectedQuarantined",
    "notObservableWithCurrentTrace",
  ], "REPORT_SUMMARY");
  requireShape(report.runner, [
    "mode", "humanConfirmationRequests", "deviceCommands", "commandsExecuted",
    "devicesAccessed", "robotSafetyEstablished",
  ], "REPORT_RUNNER");
  if (report.runner.mode !== "OFFLINE_PURE_TRACE_REPLAY"
    || report.runner.humanConfirmationRequests !== 0
    || report.runner.deviceCommands !== 0
    || report.runner.commandsExecuted !== 0
    || report.runner.devicesAccessed !== false
    || report.runner.robotSafetyEstablished !== false) fail("REPORT_RUNNER_INVALID");
  const { reportHash, ...body } = report;
  if (commitment("fault-report", body) !== reportHash) fail("REPORT_HASH_INVALID");
  return report;
}

export function verifyPhysicalSimulationFaultReport(report,
  { source, faultPlan } = {}) {
  try {
    validateReportShape(report);
    const replayed = buildReport(source, faultPlan);
    if (canonicalizeStrict(replayed) !== canonicalizeStrict(report)) {
      fail("REPORT_CANONICAL_REPLAY_MISMATCH");
    }
    return {
      ok: true,
      reportHash: report.reportHash,
      planCommitment: report.planCommitment,
      sourceCommitment: report.control.sourceCommitment,
      controlAccepted: true,
      humanConfirmationRequests: 0,
      deviceCommands: 0,
      robotSafetyEstablished: false,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

