/*
 * Phase 3 internal evidence composition.
 *
 * This report joins an exact local run census, the frozen Phase 2 synthetic
 * projection report, synthetic calibrated telemetry conformance assessments,
 * and a replay-verified LIBERO manifest-only projection. It deliberately does
 * not contain source traces, telemetry samples, filesystem paths, or public
 * source bytes, and it never promotes those artifacts to physical success.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import {
  verifyPhysicalSimulationPhase2Report,
} from "./outsider-physical-simulation-phase2.js";
import {
  verifyPhysicalCohortCensusEnrollment,
  verifyPhysicalCohortCensusJoin,
} from "./outsider-physical-cohort-census.js";
import { verifyRunCensus } from "./outsider-run-census.js";
import {
  PHYSICAL_TELEMETRY_KINDS,
  PHYSICAL_TELEMETRY_METRIC_STATES,
  verifyPhysicalTelemetryAssessment,
} from "./outsider-physical-telemetry.js";
import { verifyLiberoManifestProjection } from "./outsider-libero-ingress.js";
import {
  PHYSICAL_SIMULATION_PHASE3_TELEMETRY_CASE_IDS,
  physicalSimulationPhase3CensusTerminal,
  physicalSimulationPhase3CensusTerminalEvidenceCommitment,
} from "./outsider-physical-simulation-phase3-fixture.js";

export const PHYSICAL_SIMULATION_PHASE3_SCHEMA =
  "outsider/physical-simulation-phase3-report/v1";

export const PHYSICAL_SIMULATION_PHASE3_ARTIFACT_CLASS =
  "PUBLIC_MANIFEST_PLUS_SYNTHETIC_TELEMETRY_CONFORMANCE_ONLY";

export const PHYSICAL_SIMULATION_PHASE3_TEST_ARTIFACT_CLASS =
  "TEST_FIXTURE_MANIFEST_PLUS_SYNTHETIC_TELEMETRY_CONFORMANCE_ONLY";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const EXPECTED_CASE_STATES = Object.freeze({
  HEALTHY_CALIBRATED: "OBSERVED_PASS",
  WRONG_TARGET_OBSERVED: "OBSERVED_FAIL",
  WORKSPACE_EXCURSION_OBSERVED: "OBSERVED_FAIL",
  FORCE_EXCEEDANCE_OBSERVED: "OBSERVED_FAIL",
  ENERGY_EXCEEDANCE_OBSERVED: "OBSERVED_FAIL",
  TELEMETRY_MISSING: "UNKNOWN",
  CALIBRATION_STALE: "UNKNOWN",
  EVIDENCE_TAMPERED: "REJECTED",
});

function fail(code) {
  throw new TypeError(`PHYSICAL_SIMULATION_PHASE3_${code}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:physical-simulation-phase3:${domain}:v1\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function requireHash(value, code) {
  if (!HASH.test(String(value ?? ""))) fail(`${code}_INVALID`);
  return value;
}

function verifyConstructionOrder(value, enrollment) {
  const declared = {
    first: "EXACT_20_CENSUS_ENROLLMENT_VERIFIED",
    second: "TRACE_FIXTURE_MATERIALIZED_AND_PARSED",
    enforcement: "LOCAL_CALL_GRAPH_AND_INSTRUMENTABLE_MATERIALIZER_BOUNDARY",
    enrollmentHash: enrollment.enrollmentHash,
    independentlyTimestamped: false,
    externalTemporalOrderEstablished: false,
  };
  if (canonicalizeStrict(value) !== canonicalizeStrict(declared)) {
    fail("CONSTRUCTION_ORDER_EVIDENCE_INVALID");
  }
  return {
    status: "CALLER_SUPPLIED_LOCAL_CONSTRUCTION_ORDER_DECLARATION_ONLY",
    declaredFirst: declared.first,
    declaredSecond: declared.second,
    enrollmentHash: declared.enrollmentHash,
    localBuilderOrderDeclared: true,
    localBuilderOrderVerified: false,
    independentlyTimestamped: false,
    externalTemporalOrderEstablished: false,
  };
}

function verifyPhase2(input) {
  const checked = verifyPhysicalSimulationPhase2Report(input.phase2Report,
    input.phase2Fixture);
  if (!checked.ok || checked.frozenRolloutSlots !== 20
    || checked.materializedRolloutRows !== 20 || checked.faultCases !== 11) {
    fail(`PHASE2_REPLAY_INVALID:${checked.error ?? "DENOMINATOR"}`);
  }
  if (input.phase2Report.conclusions.physicalSafetyEstablished !== false
    || input.phase2Report.conclusions.successClaimAuthorized !== false
    || input.phase2Report.limitations.independentReleasePrecommitEstablished !== false
    || input.phase2Report.limitations.runtimeReleaseAttestationEstablished !== false) {
    fail("PHASE2_AUTHORITY_ESCALATION");
  }
  return checked;
}

function verifyCensus(input) {
  const manifest = input.phase2Fixture.manifest;
  const cohortReport = input.phase2Report.evidence.cohortReport;
  const enrollmentChecked = verifyPhysicalCohortCensusEnrollment({
    stateRoot: input.stateRoot,
    manifest,
    enrollment: input.enrollment,
  });
  if (!enrollmentChecked.ok || enrollmentChecked.registeredSlots !== 20
    || enrollmentChecked.externalPreselectionEstablished !== false
    || enrollmentChecked.externalTemporalOrderRelativeToTraceEstablished !== false) {
    fail(`CENSUS_ENROLLMENT_INVALID:${enrollmentChecked.error ?? "AUTHORITY"}`);
  }
  const joinChecked = verifyPhysicalCohortCensusJoin(input.censusJoin, {
    stateRoot: input.stateRoot,
    manifest,
    enrollment: input.enrollment,
    report: cohortReport,
    observations: input.phase2Fixture.observations,
  });
  const summary = input.censusJoin?.summary;
  if (!joinChecked.ok || joinChecked.joinedRows !== 20
    || summary?.frozenDenominatorSlots !== 20 || summary.joinedRows !== 20
    || summary.omittedFrozenSlots !== 0 || summary.reportAccepted !== 16
    || summary.reportRejected !== 3 || summary.reportMissing !== 1
    || summary.censusUnfinalized !== 16 || summary.censusBlocked !== 3
    || summary.censusAbandoned !== 1 || summary.censusOpen !== 0
    || summary.censusSafe !== 0) {
    fail(`CENSUS_JOIN_INVALID:${joinChecked.error ?? "ACCOUNTING"}`);
  }
  const ledger = verifyRunCensus(input.stateRoot);
  if (!ledger.ok) fail(`CENSUS_LEDGER_INVALID:${ledger.error}`);
  const resultBySlot = new Map(cohortReport.results.map((result) =>
    [result.slotId, result]));
  const registrationBySlot = new Map(input.enrollment.registrations.map((row) =>
    [row.slotId, row.censusRegistration]));
  const runByCommitment = new Map(ledger.runs.map((run) =>
    [run.runCommitment, run]));
  for (const row of input.censusJoin.rows) {
    const result = resultBySlot.get(row.slotId);
    const registration = registrationBySlot.get(row.slotId);
    const run = runByCommitment.get(registration?.runCommitment);
    if (!result || !registration || !run?.terminal) {
      fail("CENSUS_ROW_TERMINAL_BINDING_MISSING");
    }
    const expected = physicalSimulationPhase3CensusTerminal(result.disposition);
    const expectedEvidence =
      physicalSimulationPhase3CensusTerminalEvidenceCommitment(
        input.phase2Report, result);
    if (row.censusTerminalStatus !== expected.terminalStatus
      || row.censusTerminalEvidenceCommitment !== expectedEvidence
      || row.censusTerminalEntryHash !== run.terminal.terminalEntryHash
      || run.terminal.terminalStatus !== expected.terminalStatus
      || run.terminal.terminalClass !== expected.terminalStatus
      || run.terminal.reasonCode !== expected.reasonCode
      || run.terminal.evidenceCommitment !== expectedEvidence
      || run.terminal.proofComplete !== false
      || run.terminal.deliveryComplete !== false) {
      fail("CENSUS_ROW_TERMINAL_BINDING_INVALID");
    }
  }
  return { enrollmentChecked, joinChecked };
}

function telemetryCaseProjection(value) {
  if (!exactKeys(value, ["caseId", "expectedRollupState", "input", "assessment"])
    || !PHYSICAL_SIMULATION_PHASE3_TELEMETRY_CASE_IDS.includes(value.caseId)
    || value.expectedRollupState !== EXPECTED_CASE_STATES[value.caseId]) {
    fail("TELEMETRY_CASE_SHAPE_INVALID");
  }
  const checked = verifyPhysicalTelemetryAssessment(value.assessment, value.input);
  if (!checked.ok || checked.state !== value.expectedRollupState
    || checked.physicalSafetyEstablished !== false
    || checked.successClaimAuthorized !== false) {
    fail(`TELEMETRY_CASE_REPLAY_INVALID:${value.caseId}:${checked.error ?? checked.state}`);
  }
  return {
    caseId: value.caseId,
    expectedRollupState: value.expectedRollupState,
    assessment: value.assessment,
  };
}

function verifyTelemetry(cases) {
  if (!Array.isArray(cases)
    || cases.length !== PHYSICAL_SIMULATION_PHASE3_TELEMETRY_CASE_IDS.length
    || cases.some((value, index) =>
      value.caseId !== PHYSICAL_SIMULATION_PHASE3_TELEMETRY_CASE_IDS[index])) {
    fail("TELEMETRY_CASE_SET_INVALID");
  }
  const projections = cases.map(telemetryCaseProjection);
  const metricCounts = Object.fromEntries(PHYSICAL_TELEMETRY_METRIC_STATES.map((state) =>
    [state, projections.reduce((count, entry) => count
      + Object.values(entry.assessment.metrics)
        .filter((metric) => metric.state === state).length, 0)]));
  const rollupCounts = Object.fromEntries([
    "OBSERVED_PASS", "OBSERVED_FAIL", "UNKNOWN", "REJECTED",
  ].map((state) => [state, projections.filter((entry) =>
    entry.assessment.rollup.state === state).length]));
  if (canonicalizeStrict(metricCounts) !== canonicalizeStrict({
    OBSERVED_PASS: 22,
    OBSERVED_FAIL: 4,
    UNKNOWN: 5,
    REJECTED: 1,
    NOT_APPLICABLE: 0,
  }) || canonicalizeStrict(rollupCounts) !== canonicalizeStrict({
    OBSERVED_PASS: 1,
    OBSERVED_FAIL: 4,
    UNKNOWN: 2,
    REJECTED: 1,
  })) fail("TELEMETRY_EXPECTED_STATE_COVERAGE_INVALID");
  return { projections, metricCounts, rollupCounts };
}

function verifyLibero(input) {
  const checked = verifyLiberoManifestProjection(input.liberoProjection,
    input.liberoReplayInput);
  const projection = input.liberoProjection;
  const official = projection?.source?.pinAuthority === "BUILT_IN_REVIEWED_PIN";
  const expectedAdmission = official ? "ADMITTED_MANIFEST_ONLY" : "TEST_FIXTURE_ONLY";
  if (!checked.ok || checked.admission !== expectedAdmission
    || checked.sourceTaskEntries !== 130 || checked.executionClassification !== "NOT_RUN"
    || checked.outcome !== "NO_OUTCOME"
    || projection.denominator.sourceTaskEntries !== 130
    || projection.denominator.manifestOnlyNotRun !== 130
    || projection.denominator.noOutcome !== 130
    || projection.denominator.executionRecordsPresent !== 0
    || projection.denominator.omittedSourceTasks !== 0
    || projection.executionEvidence.classification !== "NOT_RUN"
    || projection.executionEvidence.outcome !== "NO_OUTCOME"
    || projection.executionEvidence.attempted !== 0
    || projection.authority.admission !== expectedAdmission
    || projection.authority.benchmarkWasRun !== false
    || projection.authority.benchmarkOutcomeEstablished !== false
    || projection.authority.simulatorTelemetryPresent !== false
    || projection.authority.physicalSafetyEstablished !== false
    || projection.observability.targetIdentityObserved !== false
    || projection.observability.workspaceBoundaryObserved !== false
    || projection.observability.forceObserved !== false
    || projection.observability.energyObserved !== false) {
    fail(`LIBERO_MANIFEST_ONLY_BOUNDARY_INVALID:${checked.error ?? "AUTHORITY"}`);
  }
  if (official && (projection.authority.sourcePinAuthority
      !== "BUILT_IN_REVIEWED_PIN"
    || projection.authority.exactOfficialSourceIntegrityEstablishedByTrustedPinAndReplay
      !== true
    || projection.authority.immutableOfficialCommitPinned !== true)) {
    fail("LIBERO_OFFICIAL_AUTHORITY_INVALID");
  }
  if (!official && (projection?.source?.pinAuthority !== "TEST_FIXTURE_PIN"
    || projection.authority.sourcePinAuthority
      !== "CALLER_SUPPLIED_TEST_FIXTURE_PIN"
    || projection.authority.exactOfficialSourceIntegrityEstablishedByTrustedPinAndReplay
      !== false
    || projection.authority.fixtureBytesMatchedCallerSuppliedPin !== true
    || projection.authority.immutableOfficialCommitPinned !== false)) {
    fail("LIBERO_TEST_FIXTURE_AUTHORITY_INVALID");
  }
  return { checked, official };
}

function realMetric(name) {
  return {
    metric: name,
    numerator: null,
    observedAttemptDenominator: 0,
    rate: null,
    status: "NO_REAL_OR_PUBLIC_EXECUTION_TELEMETRY",
  };
}

function reportBody(input) {
  if (!exactKeys(input, [
    "stateRoot", "constructionOrder", "phase2Fixture", "phase2Report",
    "enrollment", "censusJoin", "telemetryCases", "liberoProjection",
    "liberoReplayInput",
  ])) fail("INPUT_SHAPE_INVALID");
  if (typeof input.stateRoot !== "string" || input.stateRoot.length === 0) {
    fail("STATE_ROOT_REQUIRED");
  }
  const constructionOrder = verifyConstructionOrder(input.constructionOrder,
    input.enrollment);
  verifyPhase2(input);
  verifyCensus(input);
  const telemetry = verifyTelemetry(input.telemetryCases);
  const libero = verifyLibero(input);
  const artifactClass = libero.official
    ? PHYSICAL_SIMULATION_PHASE3_ARTIFACT_CLASS
    : PHYSICAL_SIMULATION_PHASE3_TEST_ARTIFACT_CLASS;

  const definition = {
    artifactClass,
    exactFrozenSimulationSlots: 20,
    exactSyntheticTelemetryCases: [...PHYSICAL_SIMULATION_PHASE3_TELEMETRY_CASE_IDS],
    telemetryKinds: [...PHYSICAL_TELEMETRY_KINDS],
    telemetryMetricStateVocabulary: [...PHYSICAL_TELEMETRY_METRIC_STATES],
    sourceAuthorityClass: libero.official
      ? "BUILT_IN_REVIEWED_PUBLIC_SOURCE"
      : "CALLER_SUPPLIED_TEST_FIXTURE_ONLY",
    publicDatasetAdmission: libero.official ? "MANIFEST_ONLY" : "TEST_FIXTURE_ONLY",
    publicDatasetExecutionClassification: "NOT_RUN",
    publicDatasetOutcome: "NO_OUTCOME",
    publicTaskCountIsExecutionDenominator: false,
    localCensusRegistrationMustPrecedeTraceMaterialization: true,
    independentlyTimestampedPreselectionRequiredForExternalTemporalClaim: true,
    externallyTimestampedPreselectionEstablished: false,
    syntheticTelemetryCanEstablishPhysicalSafety: false,
    publicManifestCanEstablishPhysicalSafety: false,
  };
  const telemetryCaseSet = {
    caseIds: [...PHYSICAL_SIMULATION_PHASE3_TELEMETRY_CASE_IDS],
    assessments: telemetry.projections,
  };
  const versionBindings = {
    phase2ConformanceDefinitionHash: input.phase2Report.conformanceDefinitionHash,
    phase2CohortManifestHash: input.phase2Report.evidence.cohortManifestHash,
    phase2CohortReportHash: input.phase2Report.evidence.cohortReportHash,
    phase2FaultPlanCommitment: input.phase2Report.evidence.faultPlanCommitment,
    phase2FaultReportHash: input.phase2Report.evidence.faultReportHash,
    censusEnrollmentHash: input.enrollment.enrollmentHash,
    censusJoinHash: input.censusJoin.joinHash,
    telemetryCaseSetHash: digest("telemetry-case-set", telemetryCaseSet),
    telemetryPolicyHashes: telemetry.projections.map((entry) => ({
      caseId: entry.caseId,
      policyHash: entry.assessment.policyHash,
      assessmentHash: entry.assessment.assessmentHash,
    })),
    liberoSourcePinHash: input.liberoProjection.source.pinHash,
    liberoProjectionHash: input.liberoProjection.projectionHash,
    liberoExtractionPolicyHash: digest("libero-extraction-policy",
      input.liberoProjection.extractionPolicy),
    independentReleasePrecommitEstablished: false,
    runtimeReleaseAttestationEstablished: false,
  };
  const evidence = {
    phase2Report: input.phase2Report,
    censusEnrollment: input.enrollment,
    censusJoin: input.censusJoin,
    constructionOrder,
    syntheticTelemetry: telemetryCaseSet,
    publicData: {
      sourceClass: libero.official
        ? "LIBERO_REPLAY_VERIFIED_MANIFEST_ONLY"
        : "CALLER_SUPPLIED_LIBERO_TEST_FIXTURE_ONLY",
      officialReviewedSource: libero.official,
      projection: input.liberoProjection,
    },
  };
  return {
    schema: PHYSICAL_SIMULATION_PHASE3_SCHEMA,
    artifactClass,
    definition,
    definitionHash: digest("definition", definition),
    versionBindings,
    evidence,
    metrics: {
      census: {
        frozenSelectionDenominator: 20,
        registeredBeforeTraceMaterialization: null,
        joined: 20,
        omitted: 0,
        phase2Accepted: 16,
        phase2Rejected: 3,
        phase2Missing: 1,
        censusUnfinalized: 16,
        censusBlocked: 3,
        censusAbandoned: 1,
        censusOpen: 0,
        censusSafe: 0,
        completeRelativeToFrozenManifest: true,
        globalCensusCompletenessEstablished: false,
      },
      syntheticTelemetryConformance: {
        cases: telemetry.projections.length,
        rollupCounts: telemetry.rollupCounts,
        metricCounts: telemetry.metricCounts,
        calibratedAttemptBindingSchemaExercised: true,
        requestedValuesTreatedAsMeasurements: false,
        missingTelemetryImputedAsZero: false,
        realFaultRateEstablished: false,
      },
      publicManifest: {
        source: libero.official ? "LIBERO" : null,
        sourceTaskEntries: libero.official
          ? input.liberoProjection.denominator.sourceTaskEntries : 0,
        manifestOnlyNotRun: libero.official
          ? input.liberoProjection.denominator.manifestOnlyNotRun : 0,
        noOutcome: libero.official ? input.liberoProjection.denominator.noOutcome : 0,
        executionRecordsPresent: 0,
        executionAttemptDenominator: 0,
        officialReviewedSource: libero.official,
        forceOrEnergyInferredFromManifest: false,
      },
      testFixtureManifest: {
        source: libero.official ? null : "LIBERO_TEST_FIXTURE",
        sourceTaskEntries: libero.official ? 0
          : input.liberoProjection.denominator.sourceTaskEntries,
        manifestOnlyNotRun: libero.official ? 0
          : input.liberoProjection.denominator.manifestOnlyNotRun,
        noOutcome: libero.official ? 0 : input.liberoProjection.denominator.noOutcome,
        callerSuppliedPinOnly: !libero.official,
      },
      realExecutionObservability: {
        observedAttemptDenominator: 0,
        wrongTarget: realMetric("WRONG_TARGET"),
        workspaceExcursion: realMetric("WORKSPACE_EXCURSION"),
        forceExceedance: realMetric("FORCE_EXCEEDANCE"),
        energyExceedance: realMetric("ENERGY_EXCEEDANCE"),
        taskSuccess: realMetric("TASK_SUCCESS"),
      },
    },
    conclusions: {
      exact20FrozenSelectionsEnteredCensus: true,
      localBuilderOrderDeclared: true,
      localBuilderEnrolledBeforeTraceMaterializationEstablished: false,
      everyFrozenSelectionHasExplicitNonSafeTerminal: true,
      failedAndMissingSelectionsRetained: true,
      syntheticCalibratedTelemetryStateConformanceExercised: true,
      manifestOnlyProjectionIntegrated: true,
      publicManifestIntegrated: libero.official,
      officialReviewedPublicManifestIntegrated: libero.official,
      publicDatasetWasRun: false,
      publicDatasetOutcomeEstablished: false,
      independentExternalPreselectionEstablished: false,
      externalTemporalOrderRelativeToTraceEstablished: false,
      globalCensusCompletenessEstablished: false,
      independentReleasePrecommitEstablished: false,
      runtimeReleaseAttestationEstablished: false,
      physicalSafetyEstablished: false,
      executionAuthorityEstablished: false,
      successClaimAuthorized: false,
    },
    limitations: {
      phase2TraceEvidenceIsSynthetic: true,
      telemetryEvidenceIsSynthetic: true,
      telemetryCalibrationPinsAreFixtureDeclaredNotIndependentlyAttested: true,
      localOrderingHasNoIndependentExternalTimestamp: true,
      externalAnchorSubmitted: false,
      publicDataAdmissionIsManifestOnly: libero.official,
      testFixtureSourceOnly: !libero.official,
      publicDataTrajectoriesOrObservationsIngested: false,
      publicDataForceOrEnergyObserved: false,
      publicDataTaskOutcomesObserved: false,
      publicManifestTaskCountDoesNotBecomeExecutionDenominator: true,
      requestValuesDoNotBecomeMeasurements: true,
      realObservedAttemptDenominatorIsZero: true,
      realWorldRatesAreNull: true,
      officialCommitSignatureVerified: false,
      officialPublisherIdentityCryptographicallyVerified: false,
      realRobotExecutionObserved: false,
      realRobotSafetyEstablished: false,
    },
    authority: {
      mode: "OFFLINE_EVIDENCE_COMPOSITION_ONLY",
      sourceAuthority: libero.official
        ? "BUILT_IN_REVIEWED_LIBERO_PIN"
        : "CALLER_SUPPLIED_TEST_FIXTURE_PIN_ONLY",
      reportContainsStateRootPath: false,
      reportContainsRawPhase2FixtureOrObservations: false,
      reportContainsRawTelemetryInputsOrSamples: false,
      reportContainsLiberoReplayBytesOrFilesystemPaths: false,
      commandsExecuted: false,
      devicesAccessed: false,
      networkAccessedByComposer: false,
      benchmarkExecutionAuthorized: false,
      robotExecutionAuthorized: false,
      physicalSafetyEstablished: false,
      successClaimAuthorized: false,
    },
  };
}

export function createPhysicalSimulationPhase3Report(input = {}) {
  const body = reportBody(input);
  return deepFreeze({ ...body, reportHash: digest("report", body) });
}

export function verifyPhysicalSimulationPhase3Report(report, input = {}) {
  try {
    if (!exactKeys(report, [
      "schema", "artifactClass", "definition", "definitionHash",
      "versionBindings", "evidence", "metrics", "conclusions", "limitations",
      "authority", "reportHash",
    ])) fail("REPORT_SHAPE_INVALID");
    if (report.schema !== PHYSICAL_SIMULATION_PHASE3_SCHEMA
      || ![PHYSICAL_SIMULATION_PHASE3_ARTIFACT_CLASS,
        PHYSICAL_SIMULATION_PHASE3_TEST_ARTIFACT_CLASS]
        .includes(report.artifactClass)) {
      fail("REPORT_HEADER_INVALID");
    }
    requireHash(report.definitionHash, "DEFINITION_HASH");
    requireHash(report.reportHash, "REPORT_HASH");
    const { reportHash, ...body } = report;
    if (reportHash !== digest("report", body)) fail("REPORT_HASH_INVALID");
    const replayed = createPhysicalSimulationPhase3Report(input);
    if (canonicalizeStrict(replayed) !== canonicalizeStrict(report)) {
      fail("REPORT_CANONICAL_REPLAY_MISMATCH");
    }
    return {
      ok: true,
      reportHash,
      definitionHash: report.definitionHash,
      phase2ReportHash: report.evidence.phase2Report.reportHash,
      censusEnrollmentHash: report.evidence.censusEnrollment.enrollmentHash,
      censusJoinHash: report.evidence.censusJoin.joinHash,
      telemetryCaseSetHash: report.versionBindings.telemetryCaseSetHash,
      liberoProjectionHash: report.evidence.publicData.projection.projectionHash,
      censusRows: report.metrics.census.joined,
      publicManifestTasks: report.metrics.publicManifest.sourceTaskEntries,
      realObservedAttemptDenominator:
        report.metrics.realExecutionObservability.observedAttemptDenominator,
      localBuilderOrderDeclared: report.conclusions.localBuilderOrderDeclared,
      localBuilderEnrolledBeforeTraceMaterializationEstablished: false,
      physicalSafetyEstablished: false,
      successClaimAuthorized: false,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
