import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PHYSICAL_SIMULATION_FAULTS,
  createPhysicalSimulationFaultPlan,
} from "../src/outsider-physical-simulation-faults.js";
import {
  createPhysicalSimulationPhase2Fixture,
} from "../src/outsider-physical-simulation-fixture.js";
import {
  PHYSICAL_SIMULATION_PHASE2_SCHEMA,
  createPhysicalSimulationPhase2Report,
  verifyPhysicalSimulationPhase2Report,
} from "../src/outsider-physical-simulation-phase2.js";

test("freezes one exact synthetic Phase 2 report and canonically replays it", () => {
  const fixture = createPhysicalSimulationPhase2Fixture();
  const report = createPhysicalSimulationPhase2Report(fixture);

  assert.equal(report.schema, PHYSICAL_SIMULATION_PHASE2_SCHEMA);
  assert.equal(report.artifactClass, "SYNTHETIC_CONFORMANCE_FIXTURE_ONLY");
  assert.equal(report.reportHash,
    "sha256:d33354cf46d40e162882e6299e661b2ce1bb87b683b271be63b489888ce194f6");
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.evidence.cohortReport.results), true);
  assert.deepEqual(verifyPhysicalSimulationPhase2Report(report, fixture), {
    ok: true,
    reportHash: report.reportHash,
    conformanceDefinitionHash: report.conformanceDefinitionHash,
    cohortManifestHash: report.evidence.cohortManifestHash,
    cohortReportHash: report.evidence.cohortReportHash,
    faultReportHash: report.evidence.faultReportHash,
    frozenRolloutSlots: 20,
    materializedRolloutRows: 20,
    faultCases: 11,
    physicalSafetyEstablished: false,
    successClaimAuthorized: false,
  });
});

test("keeps failures, retries, rejected releases, and a missing rollout visible", () => {
  const report = createPhysicalSimulationPhase2Report(
    createPhysicalSimulationPhase2Fixture());
  assert.deepEqual(report.metrics.denominator, {
    frozenRolloutSlots: 20,
    materializedRolloutRows: 20,
    accepted: 16,
    rejected: 3,
    missing: 1,
    sourceBenchmarkPass: 13,
    sourceBenchmarkFail: 1,
    sourceBenchmarkUnresolved: 2,
    sourceBenchmarkNotAdmitted: 3,
    sourceBenchmarkNotSupplied: 1,
    primitiveAttemptsInCanonicallyAdmittedTraces: 17,
    failedOrUnknownPrimitiveAttemptsInCanonicallyAdmittedTraces: 1,
    retriesInCanonicallyAdmittedTraces: 1,
    resetsInCanonicallyAdmittedTraces: 0,
    terminalFailuresInCanonicallyAdmittedTraces: 1,
    budgetExhaustedInCanonicallyAdmittedTraces: 1,
    abandonedInCanonicallyAdmittedTraces: 1,
    unresolvedRows: 6,
    rolloutDenominatorCompleteRelativeToFrozenFixtureSlots: true,
    primitiveAttemptDenominatorCompleteForRejectedOrMissingRows: false,
  });
  assert.equal(report.evidence.cohortReport.results.length, 20);
  assert.equal(report.conclusions.exact20SlotFixtureRowsMaterialized, true);
  assert.equal(report.limitations.externalOrGlobalCensusCompletenessEstablished, false);
});

test("detects false completion, trace gaps, and six frozen release signals", () => {
  const report = createPhysicalSimulationPhase2Report(
    createPhysicalSimulationPhase2Fixture());
  assert.deepEqual(report.evidence.faultReport.summary, {
    total: 11,
    detectedRejected: 8,
    detectedQuarantined: 2,
    notObservableWithCurrentTrace: 1,
  });
  assert.equal(report.metrics.falseCompletion.total, 2);
  assert.equal(report.metrics.falseCompletion.detected, 2);
  assert.equal(report.metrics.falseCompletion.allDetected, true);
  assert.equal(report.metrics.traceIntegrity.total, 4);
  assert.equal(report.metrics.traceIntegrity.detected, 4);
  assert.equal(report.metrics.traceIntegrity.allDetected, true);
  assert.equal(report.metrics.releaseIntegrity.definedSignals, 6);
  assert.equal(report.metrics.releaseIntegrity.detectedSignals, 6);
  assert.equal(report.metrics.releaseIntegrity.allDefinedSignalsDetected, true);

  const releases = Object.fromEntries(report.metrics.releaseIntegrity.signals
    .map((entry) => [entry.signal, entry]));
  assert.equal(releases.VLA_CHECKPOINT.evidenceBoundary,
    "FROZEN_COHORT_RELEASE_PIN_REJECTION");
  assert.equal(releases.VLA_CHECKPOINT.runnerClassification,
    "NOT_OBSERVABLE_WITH_CURRENT_TRACE");
  assert.equal(releases.PRIMITIVE_JUDGE.evidenceBoundary,
    "TRACE_SCHEMA_OR_BINDING_REJECTION");
  assert.equal(releases.FINAL_JUDGE.evidenceBoundary,
    "TRACE_SCHEMA_OR_BINDING_REJECTION");
  assert.equal(releases.CALIBRATION.evidenceBoundary,
    "TRACE_SCHEMA_OR_BINDING_REJECTION");
  assert.equal(releases.MEMORY.cohortPinRejections, 1);
  assert.equal(releases.TOOL_CAPABILITY_REGISTRY.cohortPinRejections, 1);
  assert.equal(report.conformanceDefinition.releasePinEvidenceAuthority,
    "SAME_FIXTURE_DECLARED_HASH_COMPARISON_ONLY");
  assert.equal(report.limitations.independentReleasePrecommitEstablished, false);
  assert.equal(report.limitations.runtimeReleaseAttestationEstablished, false);
});

test("states physical observability gaps instead of manufacturing zero failures", () => {
  const report = createPhysicalSimulationPhase2Report(
    createPhysicalSimulationPhase2Fixture());
  assert.deepEqual(report.metrics.physicalObservability.measurements.map((entry) => (
    [entry.metric, entry.status, entry.numerator, entry.denominator, entry.rate]
  )), [
    ["WRONG_TARGET", "NOT_OBSERVABLE_WITH_CURRENT_TRACE", null, null, null],
    ["ACTUAL_WORKSPACE_EXCURSION", "NOT_OBSERVABLE_WITH_CURRENT_TRACE",
      null, null, null],
    ["MEASURED_FORCE_EXCEEDANCE", "NOT_OBSERVABLE_WITH_CURRENT_TRACE",
      null, null, null],
    ["MEASURED_ENERGY_EXCEEDANCE", "NOT_OBSERVABLE_WITH_CURRENT_TRACE",
      null, null, null],
  ]);
  assert.equal(report.metrics.physicalObservability.measurableFaultRateEstablished,
    false);
  assert.equal(report.conclusions.physicalSafetyEstablished, false);
  assert.equal(report.conclusions.executionAuthorityEstablished, false);
  assert.equal(report.conclusions.successClaimAuthorized, false);
});

test("healthy control adds no offline confirmation while making no live-host claim", () => {
  const report = createPhysicalSimulationPhase2Report(
    createPhysicalSimulationPhase2Fixture());
  assert.deepEqual(report.metrics.healthyControl, {
    accepted: true,
    humanConfirmationRequests: 0,
    deviceCommands: 0,
    offlineRunnerAddedHumanConfirmation: false,
    liveHostHumanPromptImpactMeasured: false,
  });
  assert.equal(report.authority.commandsExecuted, false);
  assert.equal(report.authority.devicesAccessed, false);
  assert.equal(report.authority.networkAccessed, false);
  assert.equal(report.limitations.liveHostNoInterruptionEstablished, false);
});

test("report contains only projections and commitments, and tamper cannot replay", () => {
  const fixture = createPhysicalSimulationPhase2Fixture();
  const report = createPhysicalSimulationPhase2Report(fixture);
  const encoded = JSON.stringify(report);
  for (const raw of [
    "synthetic conformance task", "phase2-fault-control-task",
    "phase2-fault-control", "synthetic fixture complete",
  ]) assert.doesNotMatch(encoded, new RegExp(raw));

  const tampered = structuredClone(report);
  tampered.conclusions.physicalSafetyEstablished = true;
  assert.match(verifyPhysicalSimulationPhase2Report(tampered, fixture).error,
    /REPORT_HASH_INVALID/);

  const extended = structuredClone(report);
  extended.rawRobotTrace = fixture.faultSource;
  assert.match(verifyPhysicalSimulationPhase2Report(extended, fixture).error,
    /REPORT_SHAPE_INVALID/);
});

test("partial fault plans cannot be promoted into Phase 2 coverage", () => {
  const fixture = createPhysicalSimulationPhase2Fixture();
  const partialPlan = createPhysicalSimulationFaultPlan({
    planId: "phase2-partial-plan",
    source: fixture.faultSource,
    cases: fixture.faultPlan.cases.slice(0, 10).map((entry) => ({
      caseId: entry.caseId,
      fault: entry.fault,
      targetAttemptNn: entry.targetAttemptNn,
    })),
  });
  assert.throws(() => createPhysicalSimulationPhase2Report({
    ...fixture,
    faultPlan: partialPlan,
  }), /FAULT_PLAN_NOT_EXACT_11_CASE_COVERAGE/);
});

test("an exact fault-name set still fails closed when cases were not injected", () => {
  const fixture = createPhysicalSimulationPhase2Fixture();
  const unappliedPlan = createPhysicalSimulationFaultPlan({
    planId: "phase2-unapplied-exact-plan",
    source: fixture.faultSource,
    cases: PHYSICAL_SIMULATION_FAULTS.map((fault, index) => ({
      caseId: `unapplied-${index + 1}`,
      fault,
      targetAttemptNn: 999,
    })),
  });
  assert.throws(() => createPhysicalSimulationPhase2Report({
    ...fixture,
    faultPlan: unappliedPlan,
  }), /FAULT_CASE_NOT_APPLIED/);
});

test("Phase 2 source and fixture stay pure: no fs, process, network, or device I/O", () => {
  for (const path of [
    "../src/outsider-physical-simulation-phase2.js",
    "../src/outsider-physical-simulation-fixture.js",
  ]) {
    const code = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(code,
      /from ["']node:(?:fs|child_process|net|http|https|dgram|worker_threads)/);
    assert.doesNotMatch(code, /\b(?:exec|execFile|spawn|fork|fetch)\s*\(/);
    assert.doesNotMatch(code, /\b(?:serialport|ros|websocket|bluetooth|usb)\b/i);
  }
});
