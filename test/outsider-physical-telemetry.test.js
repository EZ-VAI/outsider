import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PHYSICAL_TELEMETRY_METRIC_STATES,
  PHYSICAL_TELEMETRY_SCHEMAS,
  createPhysicalTelemetryAssessment,
  createPhysicalTelemetryEvidence,
  physicalTelemetryCommitment,
  verifyPhysicalTelemetryAssessment,
} from "../src/outsider-physical-telemetry.js";

function h(label) {
  return physicalTelemetryCommitment("test-value", { label });
}

function pin(kind, overrides = {}) {
  return {
    schema: PHYSICAL_TELEMETRY_SCHEMAS.pin,
    sensorReleaseHash: h(`${kind}-sensor`),
    estimatorReleaseHash: h(`${kind}-estimator`),
    calibrationHash: h(`${kind}-calibration`),
    calibrationValidFrom: "2026-01-01T00:00:00.000Z",
    calibrationValidUntil: "2027-01-01T00:00:00.000Z",
    coordinateFrameId: "sim.world",
    sampleClockReleaseHash: h(`${kind}-clock`),
    maxSampleGapMs: 5_000,
    ...overrides,
  };
}

function binding(attempt, selectedPin, overrides = {}) {
  return {
    schema: PHYSICAL_TELEMETRY_SCHEMAS.binding,
    attemptId: attempt.attemptId,
    attemptHash: attempt.attemptHash,
    sourceHash: attempt.sourceHash,
    sensorReleaseHash: selectedPin.sensorReleaseHash,
    estimatorReleaseHash: selectedPin.estimatorReleaseHash,
    calibrationHash: selectedPin.calibrationHash,
    calibrationValidFrom: selectedPin.calibrationValidFrom,
    calibrationValidUntil: selectedPin.calibrationValidUntil,
    coordinateFrameId: selectedPin.coordinateFrameId,
    sampleClockReleaseHash: selectedPin.sampleClockReleaseHash,
    ...overrides,
  };
}

function evidence(kind, attempt, selectedPin, unit, samples, overrides = {}) {
  return createPhysicalTelemetryEvidence({
    schema: PHYSICAL_TELEMETRY_SCHEMAS.evidence,
    kind,
    binding: binding(attempt, selectedPin, overrides.binding),
    unit: overrides.unit ?? unit,
    samples: overrides.samples ?? samples,
  });
}

function fixture() {
  const attempt = {
    attemptId: "sim-attempt-0001",
    attemptHash: h("attempt"),
    sourceHash: h("source"),
    startedAt: "2026-08-25T01:00:00.000Z",
    endedAt: "2026-08-25T01:00:10.000Z",
    sourceClaimedSuccess: true,
  };
  const targetIdentity = pin("target");
  const workspace = pin("workspace");
  const force = pin("force");
  const energy = pin("energy");
  const targetHash = h("expected-target");
  const workspaceMapHash = h("workspace-map");
  const input = {
    attempt,
    request: {
      targetHash,
      plannedRegionIds: ["safe-zone"],
      contactForceN: 2,
      energyJ: 1,
    },
    policy: {
      expectedTargetHash: targetHash,
      workspaceMapHash,
      allowedRegionIds: ["safe-zone"],
      forbiddenRegionIds: ["human-zone"],
      maxObservedForceN: 5,
      maxPerAttemptEnergyJ: 10,
      maxCumulativeEnergyJ: 100,
      pins: { targetIdentity, workspace, force, energy },
    },
    evidence: {},
  };
  input.evidence.targetIdentity = evidence("TARGET_IDENTITY", attempt,
    targetIdentity, "IDENTITY_HASH", [
      { sampleNn: 1, elapsedMs: 0, observedTargetHash: targetHash },
      { sampleNn: 2, elapsedMs: 5_000, observedTargetHash: targetHash },
      { sampleNn: 3, elapsedMs: 10_000, observedTargetHash: targetHash },
    ]);
  input.evidence.workspace = evidence("WORKSPACE", attempt, workspace, "METRE", [
    { sampleNn: 1, elapsedMs: 0, positionM: [0, 0, 0],
      regionIds: ["safe-zone"], workspaceMapHash },
    { sampleNn: 2, elapsedMs: 5_000, positionM: [0.1, 0, 0],
      regionIds: ["safe-zone"], workspaceMapHash },
    { sampleNn: 3, elapsedMs: 10_000, positionM: [0.2, 0, 0],
      regionIds: ["safe-zone"], workspaceMapHash },
  ]);
  input.evidence.force = evidence("FORCE", attempt, force, "NEWTON", [
    { sampleNn: 1, elapsedMs: 0, forceN: 0 },
    { sampleNn: 2, elapsedMs: 5_000, forceN: 3 },
    { sampleNn: 3, elapsedMs: 10_000, forceN: 1 },
  ]);
  input.evidence.energy = evidence("ENERGY", attempt, energy, "JOULE", [
    { sampleNn: 1, elapsedMs: 0, cumulativeEnergyJ: 10 },
    { sampleNn: 2, elapsedMs: 5_000, cumulativeEnergyJ: 14 },
    { sampleNn: 3, elapsedMs: 10_000, cumulativeEnergyJ: 18 },
  ]);
  return input;
}

function replaceEvidence(input, field, kind, unit, samples, options = {}) {
  const selectedPin = input.policy.pins[field];
  input.evidence[field] = evidence(kind, input.attempt, selectedPin, unit, samples,
    options);
}

test("accepts four calibrated attempt-bound streams without authorizing success", () => {
  const input = fixture();
  const assessment = createPhysicalTelemetryAssessment(input);

  assert.deepEqual(PHYSICAL_TELEMETRY_METRIC_STATES, [
    "OBSERVED_PASS", "OBSERVED_FAIL", "UNKNOWN", "REJECTED", "NOT_APPLICABLE",
  ]);
  assert.equal(assessment.rollup.state, "OBSERVED_PASS");
  assert.equal(assessment.rollup.allFourMetricsObserved, true);
  assert.equal(assessment.rollup.counts.OBSERVED_PASS, 4);
  assert.equal(assessment.metrics.force.requested.contactForceN, 2);
  assert.equal(assessment.metrics.force.observed.peakForceN, 3);
  assert.equal(assessment.metrics.energy.requested.energyJ, 1);
  assert.equal(assessment.metrics.energy.observed.attemptEnergyJ, 8);
  assert.equal(assessment.distinctions.requestedValuesAreMeasurements, false);
  assert.equal(assessment.attempt.sourceClaimedSuccess, true);
  assert.equal(assessment.authority.successClaimAuthorized, false);
  assert.equal(assessment.rollup.physicalSafetyEstablished, false);
  assert.equal(Object.isFrozen(assessment.metrics.force.observed), true);
  assert.deepEqual(verifyPhysicalTelemetryAssessment(assessment, input), {
    ok: true,
    assessmentHash: assessment.assessmentHash,
    state: "OBSERVED_PASS",
    allFourMetricsObserved: true,
    measuredViolationPresent: false,
    physicalSafetyEstablished: false,
    successClaimAuthorized: false,
  });
});

test("measured wrong-target, excursion, force, and energy override benign requests", () => {
  const input = fixture();
  const { attempt } = input;
  const { targetIdentity, workspace, force, energy } = input.policy.pins;
  const map = input.policy.workspaceMapHash;
  replaceEvidence(input, "targetIdentity", "TARGET_IDENTITY", "IDENTITY_HASH", [
    { sampleNn: 1, elapsedMs: 0, observedTargetHash: input.policy.expectedTargetHash },
    { sampleNn: 2, elapsedMs: 5_000, observedTargetHash: h("wrong-target") },
    { sampleNn: 3, elapsedMs: 10_000, observedTargetHash: h("wrong-target") },
  ]);
  input.evidence.workspace = evidence("WORKSPACE", attempt, workspace, "METRE", [
    { sampleNn: 1, elapsedMs: 0, positionM: [0, 0, 0],
      regionIds: ["safe-zone"], workspaceMapHash: map },
    { sampleNn: 2, elapsedMs: 5_000, positionM: [1, 0, 0],
      regionIds: ["human-zone"], workspaceMapHash: map },
    { sampleNn: 3, elapsedMs: 10_000, positionM: [1, 0, 0],
      regionIds: ["human-zone"], workspaceMapHash: map },
  ]);
  input.evidence.force = evidence("FORCE", attempt, force, "NEWTON", [
    { sampleNn: 1, elapsedMs: 0, forceN: 0 },
    { sampleNn: 2, elapsedMs: 5_000, forceN: 9 },
    { sampleNn: 3, elapsedMs: 10_000, forceN: 1 },
  ]);
  input.evidence.energy = evidence("ENERGY", attempt, energy, "JOULE", [
    { sampleNn: 1, elapsedMs: 0, cumulativeEnergyJ: 90 },
    { sampleNn: 2, elapsedMs: 5_000, cumulativeEnergyJ: 97 },
    { sampleNn: 3, elapsedMs: 10_000, cumulativeEnergyJ: 105 },
  ]);

  const assessment = createPhysicalTelemetryAssessment(input);
  assert.equal(assessment.rollup.state, "OBSERVED_FAIL");
  assert.equal(assessment.rollup.counts.OBSERVED_FAIL, 4);
  assert.equal(assessment.rollup.measuredViolationPresent, true);
  assert.equal(assessment.metrics.targetIdentity.observed.mismatchSamples, 2);
  assert.equal(assessment.metrics.workspace.observed.violatingSamples, 2);
  assert.equal(assessment.metrics.force.observed.peakForceN, 9);
  assert.deepEqual(assessment.metrics.energy.reasons, [
    "OBSERVED_CUMULATIVE_ENERGY_EXCEEDED",
    "OBSERVED_PER_ATTEMPT_ENERGY_EXCEEDED",
  ]);
  assert.equal(input.request.contactForceN < input.policy.maxObservedForceN, true);
  assert.equal(input.request.energyJ < input.policy.maxPerAttemptEnergyJ, true);
  assert.equal(targetIdentity.maxSampleGapMs, 5_000);
});

test("missing telemetry is UNKNOWN and never becomes measured zero", () => {
  const input = fixture();
  input.evidence = { targetIdentity: null, workspace: null, force: null, energy: null };
  const assessment = createPhysicalTelemetryAssessment(input);

  assert.equal(assessment.rollup.state, "UNKNOWN");
  assert.equal(assessment.rollup.counts.UNKNOWN, 4);
  for (const metric of Object.values(assessment.metrics)) {
    assert.equal(metric.state, "UNKNOWN");
    assert.equal(metric.observed, null);
    assert.deepEqual(metric.reasons, ["EVIDENCE_MISSING"]);
  }
  assert.equal(assessment.distinctions.missingTelemetryImputedAsZero, false);
});

test("known measured violation is not downgraded by another missing stream", () => {
  const input = fixture();
  replaceEvidence(input, "targetIdentity", "TARGET_IDENTITY", "IDENTITY_HASH", [
    { sampleNn: 1, elapsedMs: 0, observedTargetHash: h("wrong-target") },
    { sampleNn: 2, elapsedMs: 5_000, observedTargetHash: h("wrong-target") },
    { sampleNn: 3, elapsedMs: 10_000, observedTargetHash: h("wrong-target") },
  ]);
  input.evidence.force = null;

  const assessment = createPhysicalTelemetryAssessment(input);
  assert.equal(assessment.metrics.targetIdentity.state, "OBSERVED_FAIL");
  assert.equal(assessment.metrics.force.state, "UNKNOWN");
  assert.equal(assessment.rollup.state, "OBSERVED_FAIL");
  assert.equal(assessment.rollup.counts.OBSERVED_FAIL, 1);
  assert.equal(assessment.rollup.counts.UNKNOWN, 1);
  assert.equal(assessment.rollup.allFourMetricsObserved, false);
  assert.equal(assessment.rollup.measuredViolationPresent, true);
});

test("request target and planned regions must be consistent with frozen policy", () => {
  const wrongTarget = fixture();
  wrongTarget.request.targetHash = h("requested-other-target");
  assert.throws(() => createPhysicalTelemetryAssessment(wrongTarget),
    /REQUEST_TARGET_POLICY_MISMATCH/);

  const outsideAllowed = fixture();
  outsideAllowed.request.plannedRegionIds = ["unreviewed-zone"];
  assert.throws(() => createPhysicalTelemetryAssessment(outsideAllowed),
    /REQUEST_PLANNED_REGION_OUTSIDE_ALLOWED_POLICY/);

  const forbidden = fixture();
  forbidden.request.plannedRegionIds = ["human-zone"];
  assert.throws(() => createPhysicalTelemetryAssessment(forbidden),
    /REQUEST_PLANNED_REGION_FORBIDDEN_BY_POLICY/);
});

test("requested force and per-attempt energy cannot exceed frozen policy", () => {
  const excessiveForce = fixture();
  excessiveForce.request.contactForceN = 5.001;
  assert.throws(() => createPhysicalTelemetryAssessment(excessiveForce),
    /REQUEST_CONTACT_FORCE_ABOVE_POLICY/);

  const excessiveEnergy = fixture();
  excessiveEnergy.request.energyJ = 10.001;
  assert.throws(() => createPhysicalTelemetryAssessment(excessiveEnergy),
    /REQUEST_ENERGY_ABOVE_PER_ATTEMPT_POLICY/);

  const exactLimits = fixture();
  exactLimits.request.contactForceN = exactLimits.policy.maxObservedForceN;
  exactLimits.request.energyJ = exactLimits.policy.maxPerAttemptEnergyJ;
  assert.equal(createPhysicalTelemetryAssessment(exactLimits).rollup.state,
    "OBSERVED_PASS");
});

test("expired calibration and incomplete time coverage remain UNKNOWN", () => {
  const stale = fixture();
  const stalePin = pin("force", {
    calibrationValidFrom: "2025-01-01T00:00:00.000Z",
    calibrationValidUntil: "2025-12-31T00:00:00.000Z",
  });
  stale.policy.pins.force = stalePin;
  stale.evidence.force = evidence("FORCE", stale.attempt, stalePin, "NEWTON", [
    { sampleNn: 1, elapsedMs: 0, forceN: 0 },
    { sampleNn: 2, elapsedMs: 5_000, forceN: 0 },
    { sampleNn: 3, elapsedMs: 10_000, forceN: 0 },
  ]);
  let assessment = createPhysicalTelemetryAssessment(stale);
  assert.equal(assessment.metrics.force.state, "UNKNOWN");
  assert.deepEqual(assessment.metrics.force.reasons, ["CALIBRATION_WINDOW_STALE"]);

  const gapped = fixture();
  replaceEvidence(gapped, "force", "FORCE", "NEWTON", [
    { sampleNn: 1, elapsedMs: 0, forceN: 0 },
    { sampleNn: 3, elapsedMs: 10_000, forceN: 0 },
  ]);
  assessment = createPhysicalTelemetryAssessment(gapped);
  assert.equal(assessment.metrics.force.state, "UNKNOWN");
  assert.deepEqual(assessment.metrics.force.reasons,
    ["SAMPLE_SEQUENCE_GAP", "SAMPLE_TIME_GAP"]);
  assert.equal(assessment.metrics.force.observed, null);
});

test("wrong unit, duplicate samples, tamper, and binding drift are REJECTED", () => {
  const wrongUnit = fixture();
  replaceEvidence(wrongUnit, "force", "FORCE", "KILOGRAM_FORCE", [
    { sampleNn: 1, elapsedMs: 0, forceN: 0 },
    { sampleNn: 2, elapsedMs: 5_000, forceN: 1 },
    { sampleNn: 3, elapsedMs: 10_000, forceN: 0 },
  ]);
  assert.deepEqual(createPhysicalTelemetryAssessment(wrongUnit)
    .metrics.force.reasons, ["UNIT_INVALID"]);

  const duplicate = fixture();
  replaceEvidence(duplicate, "force", "FORCE", "NEWTON", [
    { sampleNn: 1, elapsedMs: 0, forceN: 0 },
    { sampleNn: 1, elapsedMs: 0, forceN: 1 },
    { sampleNn: 3, elapsedMs: 10_000, forceN: 0 },
  ]);
  const duplicateResult = createPhysicalTelemetryAssessment(duplicate).metrics.force;
  assert.equal(duplicateResult.state, "REJECTED");
  assert.deepEqual(duplicateResult.reasons,
    ["DUPLICATE_SAMPLE_NN", "DUPLICATE_SAMPLE_TIME"]);

  const tampered = fixture();
  tampered.evidence.force = structuredClone(tampered.evidence.force);
  tampered.evidence.force.samples[1].forceN = 500;
  const tamperedResult = createPhysicalTelemetryAssessment(tampered).metrics.force;
  assert.equal(tamperedResult.state, "REJECTED");
  assert.match(tamperedResult.reasons[0], /EVIDENCE_HASH_MISMATCH/);

  const drifted = fixture();
  drifted.evidence.force = evidence("FORCE", drifted.attempt,
    drifted.policy.pins.force, "NEWTON", [
      { sampleNn: 1, elapsedMs: 0, forceN: 0 },
      { sampleNn: 2, elapsedMs: 5_000, forceN: 1 },
      { sampleNn: 3, elapsedMs: 10_000, forceN: 0 },
    ], { binding: {
      sourceHash: h("other-source"),
      sensorReleaseHash: h("other-sensor"),
      estimatorReleaseHash: h("other-estimator"),
      coordinateFrameId: "other.frame",
      sampleClockReleaseHash: h("other-clock"),
    } });
  const driftedResult = createPhysicalTelemetryAssessment(drifted).metrics.force;
  assert.equal(driftedResult.state, "REJECTED");
  assert.deepEqual(driftedResult.reasons, [
    "COORDINATE_FRAME_DRIFT", "ESTIMATOR_RELEASE_DRIFT",
    "SAMPLE_CLOCK_RELEASE_DRIFT", "SENSOR_RELEASE_DRIFT", "SOURCE_HASH_MISMATCH",
  ]);
});

test("workspace map drift and decreasing cumulative energy reject the streams", () => {
  const input = fixture();
  const workspaceSamples = structuredClone(input.evidence.workspace.samples);
  workspaceSamples[1].workspaceMapHash = h("other-map");
  replaceEvidence(input, "workspace", "WORKSPACE", "METRE", workspaceSamples);
  const energySamples = structuredClone(input.evidence.energy.samples);
  energySamples[2].cumulativeEnergyJ = 1;
  replaceEvidence(input, "energy", "ENERGY", "JOULE", energySamples);

  const assessment = createPhysicalTelemetryAssessment(input);
  assert.equal(assessment.metrics.workspace.state, "REJECTED");
  assert.deepEqual(assessment.metrics.workspace.reasons,
    ["WORKSPACE_MAP_HASH_MISMATCH"]);
  assert.equal(assessment.metrics.energy.state, "REJECTED");
  assert.deepEqual(assessment.metrics.energy.reasons,
    ["CUMULATIVE_ENERGY_DECREASED"]);
  assert.equal(assessment.rollup.state, "REJECTED");
});

test("workspace closed allowlist rejects mixed unknown and empty memberships", () => {
  for (const regionIds of [["safe-zone", "unreviewed-zone"], []]) {
    const input = fixture();
    const samples = structuredClone(input.evidence.workspace.samples);
    samples[1].regionIds = regionIds;
    replaceEvidence(input, "workspace", "WORKSPACE", "METRE", samples);

    const workspace = createPhysicalTelemetryAssessment(input).metrics.workspace;
    assert.equal(workspace.state, "OBSERVED_FAIL");
    assert.deepEqual(workspace.reasons, ["OBSERVED_WORKSPACE_EXCURSION"]);
    assert.equal(workspace.observed.violatingSamples, 1);
  }
});

test("top-level shapes are closed and assessment tamper cannot replay", () => {
  const input = fixture();
  assert.throws(() => createPhysicalTelemetryAssessment({ ...input, extra: true }),
    /ASSESSMENT_INPUT_SHAPE_INVALID/);

  const assessment = createPhysicalTelemetryAssessment(input);
  const tampered = structuredClone(assessment);
  tampered.authority.successClaimAuthorized = true;
  assert.match(verifyPhysicalTelemetryAssessment(tampered, input).error,
    /ASSESSMENT_HASH_MISMATCH/);

  const extended = structuredClone(assessment);
  extended.rawTelemetry = input.evidence;
  assert.match(verifyPhysicalTelemetryAssessment(extended, input).error,
    /ASSESSMENT_SHAPE_INVALID/);
});

test("telemetry core remains pure and has no host or device I/O", () => {
  const code = readFileSync(new URL("../src/outsider-physical-telemetry.js",
    import.meta.url), "utf8");
  assert.doesNotMatch(code,
    /from ["']node:(?:fs|child_process|net|http|https|dgram|worker_threads)/);
  assert.doesNotMatch(code, /\b(?:exec|execFile|spawn|fork|fetch)\s*\(/);
  assert.doesNotMatch(code, /\b(?:serialport|ros|websocket|bluetooth|usb)\b/i);
});
