/*
 * Phase 2 evidence composition for the physical-delegation research profile.
 *
 * This module composes two already-verified, pure evidence boundaries:
 *   1. an exact 20-slot frozen simulation cohort; and
 *   2. an exact 11-case offline fault-injection plan.
 *
 * It does not execute a benchmark, command a device, establish robot safety,
 * prove external preselection, or claim completeness beyond supplied fixtures.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import {
  freezePhysicalSimulationCohortReport,
  verifyPhysicalSimulationCohortReport,
} from "./outsider-physical-simulation-cohort.js";
import {
  PHYSICAL_SIMULATION_FAULTS,
  runPhysicalSimulationFaultPlan,
  verifyPhysicalSimulationFaultReport,
} from "./outsider-physical-simulation-faults.js";

export const PHYSICAL_SIMULATION_PHASE2_SCHEMA =
  "outsider/physical-simulation-phase2-report/v1";

const HASH = /^sha256:[a-f0-9]{64}$/u;

const FALSE_COMPLETION_FAULTS = Object.freeze([
  "PLANNER_FALSE_FINAL_CLAIM",
  "FAILED_RECEIPT_FALSE_LOCAL_PASS",
]);

const TRACE_INTEGRITY_FAULTS = Object.freeze([
  "MISSING_RECEIPT",
  "OMITTED_ATTEMPT_GAP",
  "RETRY_BUDGET_EXCEEDED",
  "BUDGET_EXHAUSTION_MISMATCH",
]);

const RELEASE_SIGNALS = Object.freeze([
  Object.freeze({
    signal: "VLA_CHECKPOINT",
    runnerFault: "VLA_CHECKPOINT_DRIFT",
    cohortRejectionCode: "VLA_RELEASE_HASH_DRIFT",
  }),
  Object.freeze({
    signal: "PRIMITIVE_JUDGE",
    runnerFault: "PRIMITIVE_JUDGE_DRIFT",
    cohortRejectionCode: "PRIMITIVE_JUDGE_RELEASE_HASH_DRIFT",
  }),
  Object.freeze({
    signal: "FINAL_JUDGE",
    runnerFault: "FINAL_JUDGE_DRIFT",
    cohortRejectionCode: "FINAL_JUDGE_RELEASE_HASH_DRIFT",
  }),
  Object.freeze({
    signal: "CALIBRATION",
    runnerFault: "CALIBRATION_DRIFT",
    cohortRejectionCode: "CALIBRATION_RELEASE_HASH_DRIFT",
  }),
  Object.freeze({
    signal: "MEMORY",
    runnerFault: null,
    cohortRejectionCode: "MEMORY_RELEASE_HASH_DRIFT",
  }),
  Object.freeze({
    signal: "TOOL_CAPABILITY_REGISTRY",
    runnerFault: null,
    cohortRejectionCode: "CAPABILITY_REGISTRY_RELEASE_HASH_DRIFT",
  }),
]);

const PHYSICAL_OBSERVABILITY_GAPS = Object.freeze([
  Object.freeze({
    metric: "WRONG_TARGET",
    status: "NOT_OBSERVABLE_WITH_CURRENT_TRACE",
    reason: "TARGET_IDENTITY_AND_WORLD_STATE_ARE_OPAQUE_HASHES",
  }),
  Object.freeze({
    metric: "ACTUAL_WORKSPACE_EXCURSION",
    status: "NOT_OBSERVABLE_WITH_CURRENT_TRACE",
    reason: "NO_MEASURED_TRAJECTORY_OR_REGION_MEMBERSHIP_EVIDENCE",
  }),
  Object.freeze({
    metric: "MEASURED_FORCE_EXCEEDANCE",
    status: "NOT_OBSERVABLE_WITH_CURRENT_TRACE",
    reason: "NO_CALIBRATED_FORCE_SENSOR_SERIES_OR_ESTIMATOR_EVIDENCE",
  }),
  Object.freeze({
    metric: "MEASURED_ENERGY_EXCEEDANCE",
    status: "NOT_OBSERVABLE_WITH_CURRENT_TRACE",
    reason: "NO_CALIBRATED_ENERGY_SERIES_OR_ESTIMATOR_EVIDENCE",
  }),
]);

function fail(code) {
  throw new TypeError(`PHYSICAL_SIMULATION_PHASE2_${code}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:physical-simulation-phase2:${domain}:v1\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function resultByFault(faultReport) {
  const byFault = new Map();
  for (const result of faultReport.results) {
    if (byFault.has(result.fault)) fail("FAULT_RESULT_DUPLICATE");
    byFault.set(result.fault, result);
  }
  if (byFault.size !== PHYSICAL_SIMULATION_FAULTS.length
    || PHYSICAL_SIMULATION_FAULTS.some((fault) => !byFault.has(fault))) {
    fail("FAULT_PLAN_NOT_EXACT_11_CASE_COVERAGE");
  }
  if ([...byFault.values()].some((result) => result.faultApplied !== true)) {
    fail("FAULT_CASE_NOT_APPLIED");
  }
  return byFault;
}

function isDetected(classification) {
  return classification === "DETECTED_REJECTED"
    || classification === "DETECTED_QUARANTINED";
}

function rejectionCount(cohortReport, code) {
  return cohortReport.results.filter((result) => (
    result.disposition === "REJECTED" && result.rejectionCodes.includes(code)
  )).length;
}

function releaseIntegrityMetric(cohortReport, byFault) {
  const results = RELEASE_SIGNALS.map((definition) => {
    const runner = definition.runnerFault == null
      ? null : byFault.get(definition.runnerFault);
    const cohortPinRejections = rejectionCount(cohortReport,
      definition.cohortRejectionCode);
    let status = "NOT_OBSERVED_IN_THIS_PHASE2_FIXTURE";
    let evidenceBoundary = "NONE";
    if (runner && isDetected(runner.classification)) {
      status = "DETECTED";
      evidenceBoundary = runner.classification === "DETECTED_REJECTED"
        ? "TRACE_SCHEMA_OR_BINDING_REJECTION"
        : "TRACE_SEMANTIC_QUARANTINE";
    } else if (cohortPinRejections > 0) {
      status = "DETECTED";
      evidenceBoundary = "FROZEN_COHORT_RELEASE_PIN_REJECTION";
    }
    return {
      signal: definition.signal,
      status,
      evidenceBoundary,
      runnerClassification: runner?.classification ?? null,
      cohortRejectionCode: definition.cohortRejectionCode,
      cohortPinRejections,
    };
  });
  return {
    signals: results,
    definedSignals: results.length,
    detectedSignals: results.filter((result) => result.status === "DETECTED").length,
    allDefinedSignalsDetected: results.every((result) => result.status === "DETECTED"),
  };
}

function faultMetric(byFault, faults) {
  const results = faults.map((fault) => {
    const result = byFault.get(fault);
    return {
      fault,
      classification: result.classification,
      detected: isDetected(result.classification),
      resultHash: result.resultHash,
    };
  });
  return {
    cases: results,
    total: results.length,
    detected: results.filter((result) => result.detected).length,
    allDetected: results.every((result) => result.detected),
  };
}

function cohortDenominator(cohortReport) {
  const summary = cohortReport.summary;
  return {
    frozenRolloutSlots: 20,
    materializedRolloutRows: cohortReport.results.length,
    accepted: summary.accepted,
    rejected: summary.rejected,
    missing: summary.missing,
    sourceBenchmarkPass: summary.sourceBenchmarkPass,
    sourceBenchmarkFail: summary.sourceBenchmarkFail,
    sourceBenchmarkUnresolved: summary.sourceBenchmarkUnresolved,
    sourceBenchmarkNotAdmitted: summary.sourceBenchmarkNotAdmitted,
    sourceBenchmarkNotSupplied: summary.sourceBenchmarkNotSupplied,
    primitiveAttemptsInCanonicallyAdmittedTraces: summary.primitiveAttempts,
    failedOrUnknownPrimitiveAttemptsInCanonicallyAdmittedTraces:
      summary.failedOrUnknownPrimitiveAttempts,
    retriesInCanonicallyAdmittedTraces: summary.retries,
    resetsInCanonicallyAdmittedTraces: summary.resets,
    terminalFailuresInCanonicallyAdmittedTraces: summary.terminalFailures,
    budgetExhaustedInCanonicallyAdmittedTraces: summary.budgetExhausted,
    abandonedInCanonicallyAdmittedTraces: summary.abandoned,
    unresolvedRows: summary.unresolved,
    rolloutDenominatorCompleteRelativeToFrozenFixtureSlots:
      cohortReport.results.length === 20,
    primitiveAttemptDenominatorCompleteForRejectedOrMissingRows: false,
  };
}

function definition() {
  return {
    artifactClass: "SYNTHETIC_CONFORMANCE_FIXTURE_ONLY",
    requiredFrozenSlots: 20,
    requiredFaultCases: [...PHYSICAL_SIMULATION_FAULTS],
    falseCompletionFaults: [...FALSE_COMPLETION_FAULTS],
    traceIntegrityFaults: [...TRACE_INTEGRITY_FAULTS],
    releaseSignals: RELEASE_SIGNALS.map((value) => ({ ...value })),
    releasePinEvidenceAuthority: "SAME_FIXTURE_DECLARED_HASH_COMPARISON_ONLY",
    physicalObservabilityGaps: PHYSICAL_OBSERVABILITY_GAPS.map((value) => ({ ...value })),
    externalPreselectionRequiredForSyntheticConformanceArtifact: false,
    externalPreselectionRequiredForBenchmarkOrCausalClaim: true,
    externalPreselectionEstablished: false,
    liveRobotExecutionRequiredForThisArtifact: false,
    liveRobotExecutionEstablished: false,
  };
}

function reportBody({ manifest, observations, faultSource, faultPlan }) {
  const cohortReport = freezePhysicalSimulationCohortReport({ manifest, observations });
  const cohortVerification = verifyPhysicalSimulationCohortReport(cohortReport,
    { manifest, observations });
  if (!cohortVerification.ok) fail("COHORT_REPLAY_INVALID");
  const faultReport = runPhysicalSimulationFaultPlan({ source: faultSource, faultPlan });
  const faultVerification = verifyPhysicalSimulationFaultReport(faultReport,
    { source: faultSource, faultPlan });
  if (!faultVerification.ok) fail("FAULT_REPLAY_INVALID");
  const byFault = resultByFault(faultReport);
  const conformanceDefinition = definition();
  const falseCompletion = faultMetric(byFault, FALSE_COMPLETION_FAULTS);
  const traceIntegrity = faultMetric(byFault, TRACE_INTEGRITY_FAULTS);
  const releaseIntegrity = releaseIntegrityMetric(cohortReport, byFault);
  const denominator = cohortDenominator(cohortReport);
  const healthyControl = {
    accepted: faultReport.control.status === "ACCEPTED"
      && faultReport.control.traceVerificationAccepted === true,
    humanConfirmationRequests: faultReport.runner.humanConfirmationRequests,
    deviceCommands: faultReport.runner.deviceCommands,
    offlineRunnerAddedHumanConfirmation: false,
    liveHostHumanPromptImpactMeasured: false,
  };
  return {
    schema: PHYSICAL_SIMULATION_PHASE2_SCHEMA,
    artifactClass: "SYNTHETIC_CONFORMANCE_FIXTURE_ONLY",
    conformanceDefinition,
    conformanceDefinitionHash: digest("conformance-definition", conformanceDefinition),
    evidence: {
      cohortManifestHash: manifest.manifestHash,
      cohortReportHash: cohortReport.reportHash,
      faultPlanCommitment: faultReport.planCommitment,
      faultReportHash: faultReport.reportHash,
      cohortReport,
      faultReport,
    },
    metrics: {
      denominator,
      falseCompletion,
      traceIntegrity,
      releaseIntegrity,
      healthyControl,
      physicalObservability: {
        measurements: PHYSICAL_OBSERVABILITY_GAPS.map((value) => ({
          ...value,
          numerator: null,
          denominator: null,
          rate: null,
        })),
        measurableFaultRateEstablished: false,
      },
    },
    conclusions: {
      exact20SlotFixtureRowsMaterialized: denominator.materializedRolloutRows === 20,
      exact11FaultCasesExercised: faultReport.summary.total === 11
        && faultReport.results.every((result) => result.faultApplied === true),
      falseCompletionDetectionConformance: falseCompletion.allDetected,
      traceIntegrityDetectionConformance: traceIntegrity.allDetected,
      syntheticDeclaredReleasePinDetectionConformance:
        releaseIntegrity.allDefinedSignalsDetected,
      healthyOfflineControlConformance: healthyControl.accepted
        && healthyControl.humanConfirmationRequests === 0
        && healthyControl.deviceCommands === 0,
      reportArtifactClosedWithDeclaredGaps: true,
      physicalSafetyEstablished: false,
      executionAuthorityEstablished: false,
      successClaimAuthorized: false,
    },
    limitations: {
      sourceIsSyntheticFixture: true,
      officialHarnessOrLiberoBenchmarkExecutionEstablished: false,
      externalTemporalPreselectionEstablished: false,
      externalOrGlobalCensusCompletenessEstablished: false,
      rejectedOrMissingAttemptCountsKnownComplete: false,
      realRobotExecutionObserved: false,
      realRobotSafetyEstablished: false,
      liveHostNoInterruptionEstablished: false,
      wrongTargetWorkspaceForceEnergyRatesEstablished: false,
      independentReleasePrecommitEstablished: false,
      runtimeReleaseAttestationEstablished: false,
    },
    authority: {
      mode: "OFFLINE_SYNTHETIC_TRACE_CONFORMANCE_ONLY",
      commandsExecuted: false,
      devicesAccessed: false,
      networkAccessed: false,
      robotSafetyEstablished: false,
      successClaimAuthorized: false,
    },
  };
}

export function createPhysicalSimulationPhase2Report(input = {}) {
  const body = reportBody(input);
  return deepFreeze({ ...body, reportHash: digest("report", body) });
}

export function verifyPhysicalSimulationPhase2Report(report, input = {}) {
  try {
    if (!exactKeys(report, [
      "schema", "artifactClass", "conformanceDefinition",
      "conformanceDefinitionHash", "evidence", "metrics", "conclusions",
      "limitations", "authority", "reportHash",
    ])) fail("REPORT_SHAPE_INVALID");
    if (report.schema !== PHYSICAL_SIMULATION_PHASE2_SCHEMA
      || report.artifactClass !== "SYNTHETIC_CONFORMANCE_FIXTURE_ONLY"
      || !HASH.test(String(report.conformanceDefinitionHash ?? ""))
      || !HASH.test(String(report.reportHash ?? ""))) fail("REPORT_HEADER_INVALID");
    const { reportHash, ...body } = report;
    if (digest("report", body) !== reportHash) fail("REPORT_HASH_INVALID");
    const replayed = createPhysicalSimulationPhase2Report(input);
    if (canonicalizeStrict(replayed) !== canonicalizeStrict(report)) {
      fail("REPORT_CANONICAL_REPLAY_MISMATCH");
    }
    return {
      ok: true,
      reportHash: report.reportHash,
      conformanceDefinitionHash: report.conformanceDefinitionHash,
      cohortManifestHash: report.evidence.cohortManifestHash,
      cohortReportHash: report.evidence.cohortReportHash,
      faultReportHash: report.evidence.faultReportHash,
      frozenRolloutSlots: report.metrics.denominator.frozenRolloutSlots,
      materializedRolloutRows: report.metrics.denominator.materializedRolloutRows,
      faultCases: report.evidence.faultReport.summary.total,
      physicalSafetyEstablished: false,
      successClaimAuthorized: false,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
