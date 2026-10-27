import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  createLiberoManifestProjection,
} from "../src/outsider-libero-ingress.js";
import {
  createPhysicalSimulationPhase2Fixture,
} from "../src/outsider-physical-simulation-fixture.js";
import {
  createPhysicalSimulationPhase2Report,
} from "../src/outsider-physical-simulation-phase2.js";
import {
  createPhysicalCohortCensusJoin,
  registerPhysicalCohortCensus,
} from "../src/outsider-physical-cohort-census.js";
import {
  settleCensusRun,
  verifyRunCensus,
} from "../src/outsider-run-census.js";
import {
  PHYSICAL_SIMULATION_PHASE3_ARTIFACT_CLASS,
  PHYSICAL_SIMULATION_PHASE3_SCHEMA,
  PHYSICAL_SIMULATION_PHASE3_TEST_ARTIFACT_CLASS,
  createPhysicalSimulationPhase3Report,
  verifyPhysicalSimulationPhase3Report,
} from "../src/outsider-physical-simulation-phase3.js";
import {
  PHYSICAL_SIMULATION_PHASE3_TELEMETRY_CASE_IDS,
  createPhysicalSimulationPhase3ManifestOnly,
  createPhysicalSimulationPhase3TelemetryCases,
  physicalSimulationPhase3CensusTerminal,
  physicalSimulationPhase3CensusTerminalEvidenceCommitment,
  preparePhysicalSimulationPhase3Evidence,
} from "../src/outsider-physical-simulation-phase3-fixture.js";

const suites = Object.freeze([
  "libero_spatial", "libero_object", "libero_goal", "libero_10", "libero_90",
]);
const suiteCounts = Object.freeze({
  libero_spatial: 10,
  libero_object: 10,
  libero_goal: 10,
  libero_10: 10,
  libero_90: 90,
});
const hash = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;

function taskNames(suite) {
  const prefix = suite.split("_").map((part) =>
    `${part[0].toUpperCase()}${part.slice(1)}`).join("");
  return Array.from({ length: suiteCounts[suite] }, (_, index) =>
    `${prefix}Task${String(index).padStart(3, "0")}`);
}

function taskMapBytes() {
  return Buffer.from([
    "libero_task_map = {",
    ...suites.flatMap((suite) => [
      `    "${suite}": [`,
      ...taskNames(suite).map((name) => `        "${name}",`),
      "    ],",
    ]),
    "}",
    "",
  ].join("\n"));
}

function benchmarkBytes() {
  return Buffer.from([
    "libero_suites = [",
    ...suites.map((suite) => `    "${suite}",`),
    "]",
    "task_maps = {}",
    "task_orders = [",
    "    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],",
    "]",
    "",
    "",
    "class Benchmark:",
    "    pass",
    "",
    "@register_benchmark",
    "class LIBERO_SPATIAL(Benchmark):",
    "    pass",
    "@register_benchmark",
    "class LIBERO_OBJECT(Benchmark):",
    "    pass",
    "@register_benchmark",
    "class LIBERO_GOAL(Benchmark):",
    "    pass",
    "@register_benchmark",
    "class LIBERO_90(Benchmark):",
    "    self.name = \"libero_90\"",
    "@register_benchmark",
    "class LIBERO_10(Benchmark):",
    "    self.name = \"libero_10\"",
    "@register_benchmark",
    "class LIBERO_100(Benchmark):",
    "    self.name = \"libero_100\"",
    "",
  ].join("\n"));
}

function readmeBytes() {
  return Buffer.from([
    "LIBERO provides 130 tasks grouped into four task suites.",
    "**LIBERO-100** consists of 100 manipulation tasks.",
    "**LIBERO-90** for pretraining and **LIBERO-10** for testing.",
    "| Component | License |",
    "| --- | --- |",
    "| Codebase | [MIT License](LICENSE) |",
    "| Datasets | [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/legalcode) |",
    "",
  ].join("\n"));
}

function testLiberoFixture() {
  const revision = "b".repeat(40);
  const bytes = {
    taskMapBytes: taskMapBytes(),
    benchmarkBytes: benchmarkBytes(),
    readmeBytes: readmeBytes(),
    licenseBytes: Buffer.from(
      "MIT License\n\nCopyright (c) 2023 Lifelong Robot Learning\n"),
  };
  const file = (role, path, value) => ({
    role,
    path,
    url: `https://fixture.invalid/${path}`,
    sha256: hash(value),
    bytes: value.length,
  });
  const body = {
    schema: "outsider/libero-source-pin/v1",
    scope: "TEST_FIXTURE_ONLY",
    datasetId: "outsider/phase3-libero-test-fixture",
    repositoryUrl: "https://fixture.invalid/repository",
    revision,
    revisionUrl: `https://fixture.invalid/revision/${revision}`,
    resolvedFromRef: "refs/heads/master",
    releaseTagEstablished: false,
    files: {
      taskMap: file("TASK_SUITE_MAP", "fixture-task-map.py", bytes.taskMapBytes),
      benchmark: file("BENCHMARK_REGISTRY", "fixture-benchmark.py",
        bytes.benchmarkBytes),
      readme: file("PROJECT_AND_DATASET_LICENSE_DECLARATION", "fixture-readme.md",
        bytes.readmeBytes),
      license: file("CODE_LICENSE_TEXT", "fixture-license.txt", bytes.licenseBytes),
    },
    codeLicenseSpdx: "MIT",
    demonstrationDatasetLicenseSpdx: "CC-BY-4.0",
    licenseScope: "PINNED_REPOSITORY_TEXT_AND_TASK_SUITE_MANIFEST_ONLY",
    expectedCoverage: {
      sourceSuitePartitions: 5,
      conceptualOfficialSuites: 4,
      sourceTaskEntries: 130,
      uniqueTaskNames: 130,
      libero100UnionEntries: 100,
      registeredBenchmarkClasses: 6,
      tenTaskSuiteOrders: 1,
      suiteCounts: { ...suiteCounts },
    },
    allowedSuites: [...suites],
  };
  const trustedPin = { ...body, pinHash: hash(canonicalizeStrict(body)) };
  const source = { datasetId: trustedPin.datasetId, revision };
  const projection = createLiberoManifestProjection({ ...bytes, source, trustedPin });
  return { projection, replayInput: { ...bytes, trustedPin } };
}

let stateRoot;
let input;
let report;
let materializerObservedCensus = null;
let liberoFixture;
const extraStateRoots = [];

before(() => {
  stateRoot = mkdtempSync(join(tmpdir(), "outsider-physical-phase3-test."));
  const libero = testLiberoFixture();
  liberoFixture = libero;
  input = preparePhysicalSimulationPhase3Evidence({
    stateRoot,
    liberoProjection: libero.projection,
    liberoReplayInput: libero.replayInput,
  }, {
    materializePhase2Fixture: () => {
      materializerObservedCensus = verifyRunCensus(stateRoot);
      return createPhysicalSimulationPhase2Fixture();
    },
  });
  report = createPhysicalSimulationPhase3Report(input);
});

after(() => {
  rmSync(stateRoot, { recursive: true, force: true });
  for (const root of extraStateRoots) {
    rmSync(root, { recursive: true, force: true });
  }
});

function deliberatelyMisboundCensusInput(mode) {
  const root = mkdtempSync(join(tmpdir(), `outsider-physical-phase3-${mode}.`));
  extraStateRoots.push(root);
  const manifest = createPhysicalSimulationPhase3ManifestOnly();
  const enrollment = registerPhysicalCohortCensus({ stateRoot: root, manifest });
  const phase2Fixture = createPhysicalSimulationPhase2Fixture();
  const phase2Report = createPhysicalSimulationPhase2Report(phase2Fixture);
  const results = phase2Report.evidence.cohortReport.results;
  const firstAccepted = results.find((result) => result.disposition === "ACCEPTED");
  const firstRejected = results.find((result) => result.disposition === "REJECTED");
  const registrations = new Map(enrollment.registrations.map((row) =>
    [row.slotId, row.censusRegistration]));
  for (const result of results) {
    let terminal = physicalSimulationPhase3CensusTerminal(result.disposition);
    let evidenceCommitment =
      physicalSimulationPhase3CensusTerminalEvidenceCommitment(phase2Report, result);
    if (mode === "relabel" && result.slotId === firstAccepted.slotId) {
      terminal = physicalSimulationPhase3CensusTerminal("REJECTED");
    } else if (mode === "relabel" && result.slotId === firstRejected.slotId) {
      terminal = physicalSimulationPhase3CensusTerminal("ACCEPTED");
    }
    if (mode === "evidence" && result.slotId === results[0].slotId) {
      evidenceCommitment = hash("arbitrary-terminal-evidence");
    }
    settleCensusRun({
      stateRoot: root,
      registration: registrations.get(result.slotId),
      ...terminal,
      evidenceCommitment,
      terminalFacts: {
        terminalClass: terminal.terminalStatus,
        proofComplete: false,
        deliveryComplete: false,
      },
    });
  }
  const censusJoin = createPhysicalCohortCensusJoin({
    stateRoot: root,
    manifest,
    enrollment,
    report: phase2Report.evidence.cohortReport,
    observations: phase2Fixture.observations,
  });
  return {
    stateRoot: root,
    constructionOrder: {
      first: "EXACT_20_CENSUS_ENROLLMENT_VERIFIED",
      second: "TRACE_FIXTURE_MATERIALIZED_AND_PARSED",
      enforcement: "LOCAL_CALL_GRAPH_AND_INSTRUMENTABLE_MATERIALIZER_BOUNDARY",
      enrollmentHash: enrollment.enrollmentHash,
      independentlyTimestamped: false,
      externalTemporalOrderEstablished: false,
    },
    phase2Fixture,
    phase2Report,
    enrollment,
    censusJoin,
    telemetryCases: createPhysicalSimulationPhase3TelemetryCases(),
    liberoProjection: liberoFixture.projection,
    liberoReplayInput: liberoFixture.replayInput,
  };
}

test("registers all 20 outer runs before trace materialization and closes every row", () => {
  assert.equal(materializerObservedCensus.ok, true,
    materializerObservedCensus.error);
  assert.equal(materializerObservedCensus.startedCount, 20);
  assert.equal(materializerObservedCensus.openCount, 20);
  assert.equal(materializerObservedCensus.terminalCount, 0);
  assert.deepEqual(input.censusJoin.summary, {
    frozenDenominatorSlots: 20,
    joinedRows: 20,
    reportAccepted: 16,
    reportRejected: 3,
    reportMissing: 1,
    censusOpen: 0,
    censusAbandoned: 1,
    censusBlocked: 3,
    censusUnfinalized: 16,
    censusSafe: 0,
    omittedFrozenSlots: 0,
  });
  assert.equal(report.metrics.census.completeRelativeToFrozenManifest, true);
  assert.equal(report.metrics.census.registeredBeforeTraceMaterialization, null);
  assert.deepEqual(report.evidence.constructionOrder, {
    status: "CALLER_SUPPLIED_LOCAL_CONSTRUCTION_ORDER_DECLARATION_ONLY",
    declaredFirst: "EXACT_20_CENSUS_ENROLLMENT_VERIFIED",
    declaredSecond: "TRACE_FIXTURE_MATERIALIZED_AND_PARSED",
    enrollmentHash: input.enrollment.enrollmentHash,
    localBuilderOrderDeclared: true,
    localBuilderOrderVerified: false,
    independentlyTimestamped: false,
    externalTemporalOrderEstablished: false,
  });
  assert.equal(report.conclusions.localBuilderOrderDeclared, true);
  assert.equal(report.conclusions
    .localBuilderEnrolledBeforeTraceMaterializationEstablished, false);
  assert.equal(report.conclusions.everyFrozenSelectionHasExplicitNonSafeTerminal,
    true);
  assert.equal(report.conclusions.externalTemporalOrderRelativeToTraceEstablished,
    false);
});

test("exercises calibrated pass/fail/unknown/rejected states without real rates", () => {
  assert.deepEqual(PHYSICAL_SIMULATION_PHASE3_TELEMETRY_CASE_IDS, [
    "HEALTHY_CALIBRATED", "WRONG_TARGET_OBSERVED",
    "WORKSPACE_EXCURSION_OBSERVED", "FORCE_EXCEEDANCE_OBSERVED",
    "ENERGY_EXCEEDANCE_OBSERVED", "TELEMETRY_MISSING",
    "CALIBRATION_STALE", "EVIDENCE_TAMPERED",
  ]);
  assert.deepEqual(report.metrics.syntheticTelemetryConformance.rollupCounts, {
    OBSERVED_PASS: 1, OBSERVED_FAIL: 4, UNKNOWN: 2, REJECTED: 1,
  });
  assert.deepEqual(report.metrics.syntheticTelemetryConformance.metricCounts, {
    OBSERVED_PASS: 22, OBSERVED_FAIL: 4, UNKNOWN: 5, REJECTED: 1,
    NOT_APPLICABLE: 0,
  });
  const byCase = Object.fromEntries(report.evidence.syntheticTelemetry.assessments
    .map((entry) => [entry.caseId, entry.assessment]));
  assert.equal(byCase.WRONG_TARGET_OBSERVED.metrics.targetIdentity.state,
    "OBSERVED_FAIL");
  assert.equal(byCase.WORKSPACE_EXCURSION_OBSERVED.metrics.workspace.state,
    "OBSERVED_FAIL");
  assert.equal(byCase.FORCE_EXCEEDANCE_OBSERVED.metrics.force.state,
    "OBSERVED_FAIL");
  assert.equal(byCase.ENERGY_EXCEEDANCE_OBSERVED.metrics.energy.state,
    "OBSERVED_FAIL");
  assert.equal(byCase.TELEMETRY_MISSING.metrics.force.observed, null);
  assert.equal(byCase.CALIBRATION_STALE.metrics.force.state, "UNKNOWN");
  assert.equal(byCase.EVIDENCE_TAMPERED.metrics.force.state, "REJECTED");
  assert.equal(report.metrics.realExecutionObservability.observedAttemptDenominator,
    0);
  for (const metric of Object.values(report.metrics.realExecutionObservability)
    .filter((value) => typeof value === "object")) {
    assert.equal(metric.numerator, null);
    assert.equal(metric.rate, null);
  }
  assert.equal(report.metrics.syntheticTelemetryConformance.realFaultRateEstablished,
    false);
});

test("keeps caller-supplied test data outside public LIBERO authority", () => {
  assert.equal(report.schema, PHYSICAL_SIMULATION_PHASE3_SCHEMA);
  assert.equal(report.artifactClass, PHYSICAL_SIMULATION_PHASE3_TEST_ARTIFACT_CLASS);
  assert.notEqual(report.artifactClass, PHYSICAL_SIMULATION_PHASE3_ARTIFACT_CLASS);
  assert.equal(report.evidence.publicData.officialReviewedSource, false);
  assert.equal(report.evidence.publicData.sourceClass,
    "CALLER_SUPPLIED_LIBERO_TEST_FIXTURE_ONLY");
  assert.equal(report.metrics.publicManifest.source, null);
  assert.equal(report.metrics.publicManifest.sourceTaskEntries, 0);
  assert.equal(report.metrics.testFixtureManifest.sourceTaskEntries, 130);
  assert.equal(report.conclusions.publicManifestIntegrated, false);
  assert.equal(report.conclusions.officialReviewedPublicManifestIntegrated, false);
  assert.equal(report.limitations.testFixtureSourceOnly, true);
  assert.equal(report.authority.sourceAuthority,
    "CALLER_SUPPLIED_TEST_FIXTURE_PIN_ONLY");
});

test("canonically replays and detects report or ledger-bound evidence tamper", () => {
  const checked = verifyPhysicalSimulationPhase3Report(report, input);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportHash, report.reportHash);
  assert.equal(checked.censusRows, 20);
  assert.equal(checked.publicManifestTasks, 0);
  assert.equal(checked.realObservedAttemptDenominator, 0);
  assert.equal(checked.localBuilderOrderDeclared, true);
  assert.equal(checked.localBuilderEnrolledBeforeTraceMaterializationEstablished,
    false);
  assert.equal(checked.physicalSafetyEstablished, false);
  assert.equal(checked.successClaimAuthorized, false);

  const tampered = structuredClone(report);
  tampered.conclusions.physicalSafetyEstablished = true;
  assert.match(verifyPhysicalSimulationPhase3Report(tampered, input).error,
    /REPORT_HASH_INVALID/);

  const changedJoin = structuredClone(input.censusJoin);
  changedJoin.rows[0].censusTerminalStatus = "SAFE";
  assert.throws(() => createPhysicalSimulationPhase3Report({
    ...input, censusJoin: changedJoin,
  }), /CENSUS_JOIN_INVALID/);
});

test("rejects same-count terminal relabeling and arbitrary terminal evidence", () => {
  const relabeled = deliberatelyMisboundCensusInput("relabel");
  assert.deepEqual(relabeled.censusJoin.summary, {
    frozenDenominatorSlots: 20,
    joinedRows: 20,
    reportAccepted: 16,
    reportRejected: 3,
    reportMissing: 1,
    censusOpen: 0,
    censusAbandoned: 1,
    censusBlocked: 3,
    censusUnfinalized: 16,
    censusSafe: 0,
    omittedFrozenSlots: 0,
  }, "aggregate counts remain unchanged in this adversarial relabeling");
  assert.throws(() => createPhysicalSimulationPhase3Report(relabeled),
    /CENSUS_ROW_TERMINAL_BINDING_INVALID/);

  const arbitraryEvidence = deliberatelyMisboundCensusInput("evidence");
  assert.deepEqual(arbitraryEvidence.censusJoin.summary,
    relabeled.censusJoin.summary);
  assert.throws(() => createPhysicalSimulationPhase3Report(arbitraryEvidence),
    /CENSUS_ROW_TERMINAL_BINDING_INVALID/);
});

test("report excludes raw fixtures, telemetry samples, replay bytes, and state paths", () => {
  const encoded = canonicalizeStrict(report);
  for (const forbidden of [
    stateRoot,
    "LiberoSpatialTask000",
    "fixture-task-map.py",
    "synthetic conformance task",
    "phase2-fault-control-task",
    "\"samples\"",
    "\"liberoReplayInput\"",
    "\"phase2Fixture\"",
  ]) assert.doesNotMatch(encoded, new RegExp(forbidden.replace(
    /[.*+?^${}()|[\]\\]/g, "\\$&"), "u"));
  assert.equal(report.authority.reportContainsStateRootPath, false);
  assert.equal(report.authority.reportContainsRawTelemetryInputsOrSamples, false);
  assert.equal(report.authority.reportContainsLiberoReplayBytesOrFilesystemPaths,
    false);
});

test("Phase 3 report and fixture source do not perform network or device I/O", () => {
  for (const path of [
    "../src/outsider-physical-simulation-phase3.js",
    "../src/outsider-physical-simulation-phase3-fixture.js",
  ]) {
    const code = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(code,
      /from ["']node:(?:child_process|net|http|https|dgram|worker_threads)/u);
    assert.doesNotMatch(code, /\b(?:exec|execFile|spawn|fork|fetch)\s*\(/u);
    assert.doesNotMatch(code, /\b(?:serialport|ros|websocket|bluetooth|usb)\b/iu);
  }
});
