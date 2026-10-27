/*
 * Calibrated, attempt-bound physical telemetry assessment.
 *
 * This module is deliberately pure. It validates caller-supplied telemetry
 * projections and never reads a clock, filesystem, network, simulator, or
 * device. A structurally accepted measurement is still not authorization and
 * is not a proof of physical safety.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const PHYSICAL_TELEMETRY_SCHEMAS = Object.freeze({
  assessment: "outsider/physical-telemetry-assessment/v1",
  evidence: "outsider/physical-telemetry-evidence/v1",
  binding: "outsider/physical-telemetry-binding/v1",
  pin: "outsider/physical-telemetry-pin/v1",
});

export const PHYSICAL_TELEMETRY_KINDS = Object.freeze([
  "TARGET_IDENTITY", "WORKSPACE", "FORCE", "ENERGY",
]);

// NOT_APPLICABLE is part of the closed state vocabulary for downstream joins.
// This v1 assessor requires all four metrics and therefore never manufactures
// NOT_APPLICABLE to conceal absent telemetry.
export const PHYSICAL_TELEMETRY_METRIC_STATES = Object.freeze([
  "OBSERVED_PASS", "OBSERVED_FAIL", "UNKNOWN", "REJECTED", "NOT_APPLICABLE",
]);

const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const KINDS = new Set(PHYSICAL_TELEMETRY_KINDS);
const EXPECTED_UNITS = Object.freeze({
  TARGET_IDENTITY: "IDENTITY_HASH",
  WORKSPACE: "METRE",
  FORCE: "NEWTON",
  ENERGY: "JOULE",
});
const METRIC_FIELDS = Object.freeze({
  TARGET_IDENTITY: "targetIdentity",
  WORKSPACE: "workspace",
  FORCE: "force",
  ENERGY: "energy",
});

function fail(code) {
  throw new TypeError(`PHYSICAL_TELEMETRY_${code}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function shape(value, fields, code) {
  if (!exactKeys(value, fields)) fail(`${code}_SHAPE_INVALID`);
  return value;
}

function hash(value, code) {
  const normalized = String(value ?? "").toLowerCase();
  if (!HASH.test(normalized)) fail(`${code}_INVALID`);
  return normalized;
}

function id(value, code) {
  const normalized = String(value ?? "").trim();
  if (!ID.test(normalized)) fail(`${code}_INVALID`);
  return normalized;
}

function iso(value, code) {
  const parsed = Date.parse(String(value ?? ""));
  if (!Number.isFinite(parsed)) fail(`${code}_INVALID`);
  return new Date(parsed).toISOString();
}

function finite(value, code, { minimum = 0, integer = false } = {}) {
  if (typeof value !== "number" || !Number.isFinite(value)
    || value < minimum || (integer && !Number.isSafeInteger(value))) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function bool(value, code) {
  if (typeof value !== "boolean") fail(`${code}_INVALID`);
  return value;
}

function ids(value, code, { nonempty = false } = {}) {
  if (!Array.isArray(value)) fail(`${code}_ARRAY_REQUIRED`);
  const normalized = value.map((entry) => id(entry, code));
  if (new Set(normalized).size !== normalized.length) fail(`${code}_DUPLICATE`);
  normalized.sort();
  if (nonempty && normalized.length === 0) fail(`${code}_EMPTY`);
  return normalized;
}

function clone(value, code) {
  try {
    return JSON.parse(canonicalizeStrict(value));
  } catch {
    fail(`${code}_CANONICAL_INVALID`);
  }
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:physical-telemetry:${domain}:v1\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

export function physicalTelemetryCommitment(domain, value) {
  const label = String(domain ?? "").trim();
  if (!label) fail("COMMITMENT_DOMAIN_REQUIRED");
  return digest(label, value);
}

function normalizeAttempt(value) {
  shape(value, ["attemptId", "attemptHash", "sourceHash", "startedAt", "endedAt",
    "sourceClaimedSuccess"], "ATTEMPT");
  const normalized = {
    attemptId: id(value.attemptId, "ATTEMPT_ID"),
    attemptHash: hash(value.attemptHash, "ATTEMPT_HASH"),
    sourceHash: hash(value.sourceHash, "SOURCE_HASH"),
    startedAt: iso(value.startedAt, "ATTEMPT_STARTED_AT"),
    endedAt: iso(value.endedAt, "ATTEMPT_ENDED_AT"),
    sourceClaimedSuccess: bool(value.sourceClaimedSuccess, "SOURCE_CLAIMED_SUCCESS"),
  };
  const durationMs = Date.parse(normalized.endedAt) - Date.parse(normalized.startedAt);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) fail("ATTEMPT_WINDOW_INVALID");
  return { ...normalized, durationMs };
}

function normalizeRequest(value) {
  shape(value, ["targetHash", "plannedRegionIds", "contactForceN", "energyJ"],
    "REQUEST");
  return {
    targetHash: hash(value.targetHash, "REQUEST_TARGET_HASH"),
    plannedRegionIds: ids(value.plannedRegionIds, "REQUEST_PLANNED_REGION", {
      nonempty: true,
    }),
    contactForceN: finite(value.contactForceN, "REQUEST_CONTACT_FORCE_N"),
    energyJ: finite(value.energyJ, "REQUEST_ENERGY_J"),
  };
}

function normalizePin(value, code) {
  shape(value, ["schema", "sensorReleaseHash", "estimatorReleaseHash",
    "calibrationHash", "calibrationValidFrom", "calibrationValidUntil",
    "coordinateFrameId", "sampleClockReleaseHash", "maxSampleGapMs"], code);
  if (value.schema !== PHYSICAL_TELEMETRY_SCHEMAS.pin) fail(`${code}_SCHEMA_INVALID`);
  const normalized = {
    schema: value.schema,
    sensorReleaseHash: hash(value.sensorReleaseHash, `${code}_SENSOR_RELEASE_HASH`),
    estimatorReleaseHash: hash(value.estimatorReleaseHash,
      `${code}_ESTIMATOR_RELEASE_HASH`),
    calibrationHash: hash(value.calibrationHash, `${code}_CALIBRATION_HASH`),
    calibrationValidFrom: iso(value.calibrationValidFrom,
      `${code}_CALIBRATION_VALID_FROM`),
    calibrationValidUntil: iso(value.calibrationValidUntil,
      `${code}_CALIBRATION_VALID_UNTIL`),
    coordinateFrameId: id(value.coordinateFrameId, `${code}_COORDINATE_FRAME_ID`),
    sampleClockReleaseHash: hash(value.sampleClockReleaseHash,
      `${code}_SAMPLE_CLOCK_RELEASE_HASH`),
    maxSampleGapMs: finite(value.maxSampleGapMs, `${code}_MAX_SAMPLE_GAP_MS`, {
      minimum: 1, integer: true,
    }),
  };
  if (Date.parse(normalized.calibrationValidUntil)
    <= Date.parse(normalized.calibrationValidFrom)) fail(`${code}_CALIBRATION_WINDOW_INVALID`);
  return normalized;
}

function normalizePolicy(value) {
  shape(value, ["expectedTargetHash", "workspaceMapHash", "allowedRegionIds",
    "forbiddenRegionIds", "maxObservedForceN", "maxPerAttemptEnergyJ",
    "maxCumulativeEnergyJ", "pins"], "POLICY");
  shape(value.pins, ["targetIdentity", "workspace", "force", "energy"],
    "POLICY_PINS");
  const allowedRegionIds = ids(value.allowedRegionIds, "POLICY_ALLOWED_REGION", {
    nonempty: true,
  });
  const forbiddenRegionIds = ids(value.forbiddenRegionIds,
    "POLICY_FORBIDDEN_REGION");
  if (allowedRegionIds.some((entry) => forbiddenRegionIds.includes(entry))) {
    fail("POLICY_REGION_CONFLICT");
  }
  const maxPerAttemptEnergyJ = finite(value.maxPerAttemptEnergyJ,
    "POLICY_MAX_PER_ATTEMPT_ENERGY_J");
  const maxCumulativeEnergyJ = finite(value.maxCumulativeEnergyJ,
    "POLICY_MAX_CUMULATIVE_ENERGY_J");
  if (maxCumulativeEnergyJ < maxPerAttemptEnergyJ) {
    fail("POLICY_CUMULATIVE_ENERGY_BELOW_PER_ATTEMPT");
  }
  return {
    expectedTargetHash: hash(value.expectedTargetHash, "POLICY_EXPECTED_TARGET_HASH"),
    workspaceMapHash: hash(value.workspaceMapHash, "POLICY_WORKSPACE_MAP_HASH"),
    allowedRegionIds,
    forbiddenRegionIds,
    maxObservedForceN: finite(value.maxObservedForceN,
      "POLICY_MAX_OBSERVED_FORCE_N"),
    maxPerAttemptEnergyJ,
    maxCumulativeEnergyJ,
    pins: {
      targetIdentity: normalizePin(value.pins.targetIdentity,
        "POLICY_TARGET_IDENTITY_PIN"),
      workspace: normalizePin(value.pins.workspace, "POLICY_WORKSPACE_PIN"),
      force: normalizePin(value.pins.force, "POLICY_FORCE_PIN"),
      energy: normalizePin(value.pins.energy, "POLICY_ENERGY_PIN"),
    },
  };
}

function normalizeBinding(value) {
  shape(value, ["schema", "attemptId", "attemptHash", "sourceHash",
    "sensorReleaseHash", "estimatorReleaseHash", "calibrationHash",
    "calibrationValidFrom", "calibrationValidUntil", "coordinateFrameId",
    "sampleClockReleaseHash"], "EVIDENCE_BINDING");
  if (value.schema !== PHYSICAL_TELEMETRY_SCHEMAS.binding) {
    fail("EVIDENCE_BINDING_SCHEMA_INVALID");
  }
  return {
    schema: value.schema,
    attemptId: id(value.attemptId, "EVIDENCE_ATTEMPT_ID"),
    attemptHash: hash(value.attemptHash, "EVIDENCE_ATTEMPT_HASH"),
    sourceHash: hash(value.sourceHash, "EVIDENCE_SOURCE_HASH"),
    sensorReleaseHash: hash(value.sensorReleaseHash, "EVIDENCE_SENSOR_RELEASE_HASH"),
    estimatorReleaseHash: hash(value.estimatorReleaseHash,
      "EVIDENCE_ESTIMATOR_RELEASE_HASH"),
    calibrationHash: hash(value.calibrationHash, "EVIDENCE_CALIBRATION_HASH"),
    calibrationValidFrom: iso(value.calibrationValidFrom,
      "EVIDENCE_CALIBRATION_VALID_FROM"),
    calibrationValidUntil: iso(value.calibrationValidUntil,
      "EVIDENCE_CALIBRATION_VALID_UNTIL"),
    coordinateFrameId: id(value.coordinateFrameId,
      "EVIDENCE_COORDINATE_FRAME_ID"),
    sampleClockReleaseHash: hash(value.sampleClockReleaseHash,
      "EVIDENCE_SAMPLE_CLOCK_RELEASE_HASH"),
  };
}

function normalizeElapsed(value, code) {
  return finite(value, code, { integer: true });
}

function normalizeSample(kind, value) {
  const common = ["sampleNn", "elapsedMs"];
  let fields;
  if (kind === "TARGET_IDENTITY") fields = [...common, "observedTargetHash"];
  if (kind === "WORKSPACE") fields = [...common, "positionM", "regionIds",
    "workspaceMapHash"];
  if (kind === "FORCE") fields = [...common, "forceN"];
  if (kind === "ENERGY") fields = [...common, "cumulativeEnergyJ"];
  shape(value, fields, `${kind}_SAMPLE`);
  const sampleNn = finite(value.sampleNn, `${kind}_SAMPLE_NN`, {
    minimum: 1, integer: true,
  });
  const elapsedMs = normalizeElapsed(value.elapsedMs, `${kind}_ELAPSED_MS`);
  if (kind === "TARGET_IDENTITY") {
    return { sampleNn, elapsedMs,
      observedTargetHash: hash(value.observedTargetHash, "OBSERVED_TARGET_HASH") };
  }
  if (kind === "WORKSPACE") {
    if (!Array.isArray(value.positionM) || value.positionM.length !== 3) {
      fail("WORKSPACE_POSITION_VECTOR_INVALID");
    }
    const positionM = value.positionM.map((entry) => finite(entry,
      "WORKSPACE_POSITION_COMPONENT", { minimum: -Number.MAX_VALUE }));
    return {
      sampleNn, elapsedMs, positionM,
      regionIds: ids(value.regionIds, "WORKSPACE_SAMPLE_REGION"),
      workspaceMapHash: hash(value.workspaceMapHash, "WORKSPACE_SAMPLE_MAP_HASH"),
    };
  }
  if (kind === "FORCE") {
    return { sampleNn, elapsedMs,
      forceN: finite(value.forceN, "FORCE_SAMPLE_N") };
  }
  return { sampleNn, elapsedMs,
    cumulativeEnergyJ: finite(value.cumulativeEnergyJ, "ENERGY_SAMPLE_J") };
}

function evidenceBody(value) {
  shape(value, ["schema", "kind", "binding", "unit", "samples"],
    "EVIDENCE_BODY");
  if (value.schema !== PHYSICAL_TELEMETRY_SCHEMAS.evidence) {
    fail("EVIDENCE_SCHEMA_INVALID");
  }
  if (!KINDS.has(value.kind)) fail("EVIDENCE_KIND_INVALID");
  if (!Array.isArray(value.samples)) fail("EVIDENCE_SAMPLES_ARRAY_REQUIRED");
  return {
    schema: value.schema,
    kind: value.kind,
    binding: normalizeBinding(value.binding),
    unit: String(value.unit ?? ""),
    samples: value.samples.map((entry) => normalizeSample(value.kind, entry)),
  };
}

/** Build a content-addressed evidence envelope without performing any I/O. */
export function createPhysicalTelemetryEvidence(input = {}) {
  const body = evidenceBody(clone(input, "EVIDENCE_INPUT"));
  return deepFreeze({ ...body, evidenceHash: digest("evidence", body) });
}

function metricBase(kind, state, reasons, evidenceHash, requested, observed,
  measurementBinding = null) {
  return {
    metric: kind,
    state,
    reasons: [...new Set(reasons)].sort(),
    evidenceHash,
    measurementBinding,
    requested,
    observed,
    requestedIsMeasurement: false,
    sourceSuccessAuthorizesMetric: false,
  };
}

function unknown(kind, reason, requested, evidenceHash = null) {
  return metricBase(kind, "UNKNOWN", [reason], evidenceHash, requested, null);
}

function rejected(kind, reasons, requested, evidenceHash = null, measurementBinding = null) {
  return metricBase(kind, "REJECTED", reasons, evidenceHash, requested, null,
    measurementBinding);
}

function validateEvidenceEnvelope(value, kind) {
  if (!plain(value)) fail("EVIDENCE_OBJECT_REQUIRED");
  shape(value, ["schema", "kind", "binding", "unit", "samples", "evidenceHash"],
    "EVIDENCE");
  const suppliedHash = hash(value.evidenceHash, "EVIDENCE_HASH");
  const body = evidenceBody({
    schema: value.schema,
    kind: value.kind,
    binding: value.binding,
    unit: value.unit,
    samples: value.samples,
  });
  if (body.kind !== kind) fail("EVIDENCE_KIND_BINDING_MISMATCH");
  if (digest("evidence", body) !== suppliedHash) fail("EVIDENCE_HASH_MISMATCH");
  return { ...body, evidenceHash: suppliedHash };
}

function bindingReasons(binding, attempt, pin) {
  const reasons = [];
  const checks = [
    [binding.attemptId, attempt.attemptId, "ATTEMPT_ID_MISMATCH"],
    [binding.attemptHash, attempt.attemptHash, "ATTEMPT_HASH_MISMATCH"],
    [binding.sourceHash, attempt.sourceHash, "SOURCE_HASH_MISMATCH"],
    [binding.sensorReleaseHash, pin.sensorReleaseHash, "SENSOR_RELEASE_DRIFT"],
    [binding.estimatorReleaseHash, pin.estimatorReleaseHash, "ESTIMATOR_RELEASE_DRIFT"],
    [binding.calibrationHash, pin.calibrationHash, "CALIBRATION_HASH_DRIFT"],
    [binding.calibrationValidFrom, pin.calibrationValidFrom,
      "CALIBRATION_VALID_FROM_DRIFT"],
    [binding.calibrationValidUntil, pin.calibrationValidUntil,
      "CALIBRATION_VALID_UNTIL_DRIFT"],
    [binding.coordinateFrameId, pin.coordinateFrameId, "COORDINATE_FRAME_DRIFT"],
    [binding.sampleClockReleaseHash, pin.sampleClockReleaseHash,
      "SAMPLE_CLOCK_RELEASE_DRIFT"],
  ];
  for (const [actual, expected, reason] of checks) {
    if (actual !== expected) reasons.push(reason);
  }
  return reasons;
}

function coverageReasons(samples, durationMs, maxSampleGapMs) {
  const rejectedReasons = [];
  const unknownReasons = [];
  if (samples.length === 0) return { rejectedReasons, unknownReasons: ["SAMPLES_MISSING"] };
  const seenNn = new Set();
  const seenElapsed = new Set();
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (seenNn.has(sample.sampleNn)) rejectedReasons.push("DUPLICATE_SAMPLE_NN");
    if (seenElapsed.has(sample.elapsedMs)) rejectedReasons.push("DUPLICATE_SAMPLE_TIME");
    seenNn.add(sample.sampleNn);
    seenElapsed.add(sample.elapsedMs);
    if (sample.sampleNn !== index + 1) unknownReasons.push("SAMPLE_SEQUENCE_GAP");
    if (sample.elapsedMs > durationMs) rejectedReasons.push("SAMPLE_OUTSIDE_ATTEMPT");
    if (index > 0) {
      const gap = sample.elapsedMs - samples[index - 1].elapsedMs;
      if (gap < 0) rejectedReasons.push("NON_MONOTONIC_SAMPLE_TIME");
      else if (gap > maxSampleGapMs) unknownReasons.push("SAMPLE_TIME_GAP");
    }
  }
  if (samples[0].elapsedMs !== 0) unknownReasons.push("ATTEMPT_START_NOT_COVERED");
  if (samples.at(-1).elapsedMs !== durationMs) unknownReasons.push("ATTEMPT_END_NOT_COVERED");
  return { rejectedReasons, unknownReasons };
}

function requestedProjection(kind, request) {
  if (kind === "TARGET_IDENTITY") return { targetHash: request.targetHash };
  if (kind === "WORKSPACE") return { plannedRegionIds: request.plannedRegionIds };
  if (kind === "FORCE") return { contactForceN: request.contactForceN };
  return { energyJ: request.energyJ };
}

function validateRequestAgainstPolicy(request, policy) {
  if (request.targetHash !== policy.expectedTargetHash) {
    fail("REQUEST_TARGET_POLICY_MISMATCH");
  }
  if (request.plannedRegionIds.some((region) =>
    policy.forbiddenRegionIds.includes(region))) {
    fail("REQUEST_PLANNED_REGION_FORBIDDEN_BY_POLICY");
  }
  if (request.plannedRegionIds.some((region) =>
    !policy.allowedRegionIds.includes(region))) {
    fail("REQUEST_PLANNED_REGION_OUTSIDE_ALLOWED_POLICY");
  }
  if (request.contactForceN > policy.maxObservedForceN) {
    fail("REQUEST_CONTACT_FORCE_ABOVE_POLICY");
  }
  if (request.energyJ > policy.maxPerAttemptEnergyJ) {
    fail("REQUEST_ENERGY_ABOVE_PER_ATTEMPT_POLICY");
  }
}

function evaluate(kind, suppliedEvidence, attempt, request, policy) {
  const requested = requestedProjection(kind, request);
  if (suppliedEvidence == null) return unknown(kind, "EVIDENCE_MISSING", requested);
  let evidence;
  try {
    evidence = validateEvidenceEnvelope(suppliedEvidence, kind);
  } catch (error) {
    return rejected(kind, [String(error?.message ?? error)], requested,
      HASH.test(String(suppliedEvidence?.evidenceHash ?? ""))
        ? suppliedEvidence.evidenceHash : null);
  }
  const pin = policy.pins[METRIC_FIELDS[kind]];
  const bindingErrors = bindingReasons(evidence.binding, attempt, pin);
  if (evidence.unit !== EXPECTED_UNITS[kind]) bindingErrors.push("UNIT_INVALID");
  if (bindingErrors.length > 0) {
    return rejected(kind, bindingErrors, requested, evidence.evidenceHash,
      evidence.binding);
  }
  if (Date.parse(attempt.startedAt) < Date.parse(pin.calibrationValidFrom)
    || Date.parse(attempt.endedAt) > Date.parse(pin.calibrationValidUntil)) {
    return metricBase(kind, "UNKNOWN", ["CALIBRATION_WINDOW_STALE"],
      evidence.evidenceHash, requested, null, evidence.binding);
  }
  const coverage = coverageReasons(evidence.samples, attempt.durationMs,
    pin.maxSampleGapMs);
  const rejectedReasons = [...coverage.rejectedReasons];
  if (kind === "WORKSPACE" && evidence.samples.some((sample) =>
    sample.workspaceMapHash !== policy.workspaceMapHash)) {
    rejectedReasons.push("WORKSPACE_MAP_HASH_MISMATCH");
  }
  if (kind === "ENERGY" && evidence.samples.some((sample, index) =>
    index > 0 && sample.cumulativeEnergyJ < evidence.samples[index - 1].cumulativeEnergyJ)) {
    rejectedReasons.push("CUMULATIVE_ENERGY_DECREASED");
  }
  if (rejectedReasons.length > 0) {
    return rejected(kind, rejectedReasons, requested, evidence.evidenceHash,
      evidence.binding);
  }
  if (coverage.unknownReasons.length > 0) {
    return metricBase(kind, "UNKNOWN", coverage.unknownReasons, evidence.evidenceHash,
      requested, null, evidence.binding);
  }

  if (kind === "TARGET_IDENTITY") {
    const mismatches = evidence.samples.filter((sample) =>
      sample.observedTargetHash !== policy.expectedTargetHash).length;
    const observed = {
      sampleCount: evidence.samples.length,
      expectedTargetHash: policy.expectedTargetHash,
      distinctObservedTargetHashes: [...new Set(evidence.samples
        .map((sample) => sample.observedTargetHash))].sort(),
      mismatchSamples: mismatches,
    };
    return metricBase(kind, mismatches === 0 ? "OBSERVED_PASS" : "OBSERVED_FAIL",
      mismatches === 0 ? [] : ["OBSERVED_TARGET_MISMATCH"], evidence.evidenceHash,
      requested, observed, evidence.binding);
  }
  if (kind === "WORKSPACE") {
    const violating = evidence.samples.filter((sample) => (
      sample.regionIds.length === 0
      || sample.regionIds.some((region) => !policy.allowedRegionIds.includes(region))
      || sample.regionIds.some((region) => policy.forbiddenRegionIds.includes(region))
    ));
    const observed = {
      sampleCount: evidence.samples.length,
      violatingSamples: violating.length,
      firstViolationElapsedMs: violating[0]?.elapsedMs ?? null,
      workspaceMapHash: policy.workspaceMapHash,
      coordinateFrameId: pin.coordinateFrameId,
    };
    return metricBase(kind, violating.length === 0 ? "OBSERVED_PASS" : "OBSERVED_FAIL",
      violating.length === 0 ? [] : ["OBSERVED_WORKSPACE_EXCURSION"],
      evidence.evidenceHash, requested, observed, evidence.binding);
  }
  if (kind === "FORCE") {
    const peakForceN = evidence.samples.reduce((peak, sample) =>
      Math.max(peak, sample.forceN), 0);
    const observed = {
      sampleCount: evidence.samples.length,
      peakForceN,
      maxObservedForceN: policy.maxObservedForceN,
      exceedanceSamples: evidence.samples.filter((sample) =>
        sample.forceN > policy.maxObservedForceN).length,
    };
    return metricBase(kind,
      peakForceN <= policy.maxObservedForceN ? "OBSERVED_PASS" : "OBSERVED_FAIL",
      peakForceN <= policy.maxObservedForceN ? [] : ["OBSERVED_FORCE_EXCEEDED"],
      evidence.evidenceHash, requested, observed, evidence.binding);
  }
  const initialCumulativeEnergyJ = evidence.samples[0].cumulativeEnergyJ;
  const finalCumulativeEnergyJ = evidence.samples.at(-1).cumulativeEnergyJ;
  const attemptEnergyJ = finalCumulativeEnergyJ - initialCumulativeEnergyJ;
  const perAttemptExceeded = attemptEnergyJ > policy.maxPerAttemptEnergyJ;
  const cumulativeExceeded = finalCumulativeEnergyJ > policy.maxCumulativeEnergyJ;
  const reasons = [];
  if (perAttemptExceeded) reasons.push("OBSERVED_PER_ATTEMPT_ENERGY_EXCEEDED");
  if (cumulativeExceeded) reasons.push("OBSERVED_CUMULATIVE_ENERGY_EXCEEDED");
  return metricBase(kind, reasons.length === 0 ? "OBSERVED_PASS" : "OBSERVED_FAIL",
    reasons, evidence.evidenceHash, requested, {
      sampleCount: evidence.samples.length,
      initialCumulativeEnergyJ,
      finalCumulativeEnergyJ,
      attemptEnergyJ,
      maxPerAttemptEnergyJ: policy.maxPerAttemptEnergyJ,
      maxCumulativeEnergyJ: policy.maxCumulativeEnergyJ,
    }, evidence.binding);
}

function rollup(metrics) {
  const values = Object.values(metrics);
  const counts = Object.fromEntries(PHYSICAL_TELEMETRY_METRIC_STATES
    .map((state) => [state, values.filter((value) => value.state === state).length]));
  let state = "OBSERVED_PASS";
  if (counts.REJECTED > 0) state = "REJECTED";
  else if (counts.OBSERVED_FAIL > 0) state = "OBSERVED_FAIL";
  else if (counts.UNKNOWN > 0 || counts.NOT_APPLICABLE > 0) state = "UNKNOWN";
  return {
    state,
    counts,
    allFourMetricsObserved: counts.OBSERVED_PASS + counts.OBSERVED_FAIL === 4,
    measuredViolationPresent: counts.OBSERVED_FAIL > 0,
    physicalSafetyEstablished: false,
  };
}

function assessmentBody(input) {
  shape(input, ["attempt", "request", "policy", "evidence"], "ASSESSMENT_INPUT");
  shape(input.evidence, ["targetIdentity", "workspace", "force", "energy"],
    "ASSESSMENT_EVIDENCE");
  const attempt = normalizeAttempt(input.attempt);
  const request = normalizeRequest(input.request);
  const policy = normalizePolicy(input.policy);
  validateRequestAgainstPolicy(request, policy);
  const metrics = {
    targetIdentity: evaluate("TARGET_IDENTITY", input.evidence.targetIdentity,
      attempt, request, policy),
    workspace: evaluate("WORKSPACE", input.evidence.workspace,
      attempt, request, policy),
    force: evaluate("FORCE", input.evidence.force, attempt, request, policy),
    energy: evaluate("ENERGY", input.evidence.energy, attempt, request, policy),
  };
  return {
    schema: PHYSICAL_TELEMETRY_SCHEMAS.assessment,
    attempt: {
      attemptId: attempt.attemptId,
      attemptHash: attempt.attemptHash,
      sourceHash: attempt.sourceHash,
      startedAt: attempt.startedAt,
      endedAt: attempt.endedAt,
      durationMs: attempt.durationMs,
      sourceClaimedSuccess: attempt.sourceClaimedSuccess,
    },
    policyHash: digest("policy", policy),
    metricStateVocabulary: [...PHYSICAL_TELEMETRY_METRIC_STATES],
    metrics,
    rollup: rollup(metrics),
    distinctions: {
      requestedValuesAreMeasurements: false,
      missingTelemetryImputedAsZero: false,
      sourceClaimedSuccessAuthorizesMeasurement: false,
      sourceClaimedSuccessAuthorizesTaskSuccess: false,
    },
    authority: {
      mode: "CALLER_SUPPLIED_TELEMETRY_VALIDATION_ONLY",
      commandsExecuted: false,
      devicesAccessed: false,
      networkAccessed: false,
      executionAuthorityEstablished: false,
      physicalSafetyEstablished: false,
      successClaimAuthorized: false,
    },
  };
}

export function createPhysicalTelemetryAssessment(input = {}) {
  const normalizedInput = clone(input, "ASSESSMENT_INPUT");
  const body = assessmentBody(normalizedInput);
  return deepFreeze({ ...body, assessmentHash: digest("assessment", body) });
}

export function verifyPhysicalTelemetryAssessment(assessment, input = {}) {
  try {
    shape(assessment, ["schema", "attempt", "policyHash", "metricStateVocabulary",
      "metrics", "rollup", "distinctions", "authority", "assessmentHash"],
    "ASSESSMENT");
    if (assessment.schema !== PHYSICAL_TELEMETRY_SCHEMAS.assessment) {
      fail("ASSESSMENT_SCHEMA_INVALID");
    }
    hash(assessment.assessmentHash, "ASSESSMENT_HASH");
    const { assessmentHash, ...body } = assessment;
    if (digest("assessment", body) !== assessmentHash) fail("ASSESSMENT_HASH_MISMATCH");
    const replayed = createPhysicalTelemetryAssessment(input);
    if (canonicalizeStrict(replayed) !== canonicalizeStrict(assessment)) {
      fail("ASSESSMENT_CANONICAL_REPLAY_MISMATCH");
    }
    return {
      ok: true,
      assessmentHash,
      state: assessment.rollup.state,
      allFourMetricsObserved: assessment.rollup.allFourMetricsObserved,
      measuredViolationPresent: assessment.rollup.measuredViolationPresent,
      physicalSafetyEstablished: false,
      successClaimAuthorized: false,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
