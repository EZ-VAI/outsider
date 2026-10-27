/*
 * Frozen, trace-only simulation cohort reconciliation for physical delegation.
 *
 * This module deliberately performs no filesystem, network, process, clock, or
 * device operations. A caller must freeze the exact fixture population before
 * supplying observations. Reconciliation only admits a Harness VLA projection
 * after canonical source replay and exact release-pin comparison.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import {
  hashHarnessVlaTraceValue,
  verifyHarnessVlaTraceProjection,
} from "./outsider-harness-vla-trace.js";

export const PHYSICAL_SIMULATION_COHORT_SCHEMAS = Object.freeze({
  manifest: "outsider/physical-simulation-cohort-manifest/v1",
  slot: "outsider/physical-simulation-cohort-slot/v1",
  expectedPins: "outsider/physical-simulation-cohort-expected-pins/v1",
  observation: "outsider/physical-simulation-cohort-observation/v1",
  result: "outsider/physical-simulation-cohort-result/v1",
  report: "outsider/physical-simulation-cohort-report/v1",
});

export const PHYSICAL_SIMULATION_PERTURBATION_CLASSES = Object.freeze([
  "OBJECT_T", "OBJECT_S", "GOAL_T", "GOAL_S",
]);

export const PHYSICAL_SIMULATION_COHORT_DISPOSITIONS = Object.freeze([
  "ACCEPTED", "REJECTED", "MISSING",
]);

const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_SEED = 0x7fff_ffff;
const CLASS_ORDER = new Map(PHYSICAL_SIMULATION_PERTURBATION_CLASSES
  .map((value, index) => [value, index]));
const EXPECTED_PIN_FIELDS = Object.freeze([
  "schema",
  "sourceProfileHash",
  "plannerReleaseHash",
  "vlaReleaseHash",
  "controllerReleaseHash",
  "capabilityRegistryReleaseHash",
  "primitiveJudgeReleaseHash",
  "finalJudgeReleaseHash",
  "memoryReleaseHash",
  "coordinateFrameReleaseHash",
  "calibrationReleaseHash",
]);

function fail(code) {
  throw new TypeError(`PHYSICAL_SIMULATION_COHORT_${code}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, expected) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...expected].sort().join("\0");
}

function requireShape(value, expected, code) {
  if (!exactKeys(value, expected)) fail(`${code}_SHAPE_INVALID`);
  return value;
}

function requireHash(value, code) {
  const normalized = String(value ?? "").toLowerCase();
  if (!HASH.test(normalized)) fail(`${code}_INVALID`);
  return normalized;
}

function requireSeed(value, code = "SEED") {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SEED) {
    fail(`${code}_INVALID`);
  }
  return value;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function cloneCanonical(value, code) {
  try { return JSON.parse(canonicalizeStrict(value)); }
  catch { fail(`${code}_CANONICAL_INVALID`); }
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:physical-simulation-cohort:${domain}:v1\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

export function physicalSimulationCohortCommitment(domain, value) {
  const label = String(domain ?? "").trim();
  if (!label) fail("COMMITMENT_DOMAIN_REQUIRED");
  return digest(label, value);
}

function normalizeExpectedPins(value) {
  requireShape(value, EXPECTED_PIN_FIELDS, "EXPECTED_PINS");
  if (value.schema !== PHYSICAL_SIMULATION_COHORT_SCHEMAS.expectedPins) {
    fail("EXPECTED_PINS_SCHEMA_INVALID");
  }
  const normalized = { schema: value.schema };
  for (const field of EXPECTED_PIN_FIELDS.slice(1)) {
    normalized[field] = requireHash(value[field], field.replace(/[A-Z]/g,
      (letter) => `_${letter}`).toUpperCase());
  }
  return normalized;
}

function normalizeSlotSpec(value) {
  requireShape(value, ["perturbationClass", "seed", "taskRefHash", "expectedPins"],
    "SLOT_SPEC");
  if (!CLASS_ORDER.has(value.perturbationClass)) fail("PERTURBATION_CLASS_INVALID");
  return {
    perturbationClass: value.perturbationClass,
    seed: requireSeed(value.seed),
    taskRefHash: requireHash(value.taskRefHash, "TASK_REF_HASH"),
    expectedPins: normalizeExpectedPins(value.expectedPins),
  };
}

function slotSort(left, right) {
  return CLASS_ORDER.get(left.perturbationClass) - CLASS_ORDER.get(right.perturbationClass)
    || left.seed - right.seed;
}

function immutableFreezePolicy() {
  return {
    matrix: "EXACT_4_PERTURBATION_CLASSES_BY_5_SEEDS",
    slotCount: 20,
    observationAdmission: "ONLY_AFTER_MANIFEST_HASH_FREEZE",
    acceptedEvidence: "CANONICAL_HARNESS_VLA_SOURCE_REPLAY_REQUIRED",
    dispositions: [...PHYSICAL_SIMULATION_COHORT_DISPOSITIONS],
    additionsAllowed: false,
    replacementsAllowed: false,
    duplicateSlotsAllowed: false,
    completenessScope: "FROZEN_FIXTURE_SLOTS_ONLY",
  };
}

function manifestAuthority() {
  return {
    manifestFrozenBeforeObservationAdmissionByProtocol: true,
    externalTemporalOrderEstablished: false,
    externalCensusAuthorityEstablished: false,
    globalCensusCompletenessEstablished: false,
    physicalExecutionAuthorized: false,
    commandsExecuted: false,
    devicesAccessed: false,
  };
}

function manifestBodyFromSpec(spec) {
  requireShape(spec, ["cohortRefHash", "seeds", "slots"], "MANIFEST_SPEC");
  const cohortRefHash = requireHash(spec.cohortRefHash, "COHORT_REF_HASH");
  if (!Array.isArray(spec.seeds) || spec.seeds.length !== 5) fail("SEED_SET_SIZE_INVALID");
  const seeds = spec.seeds.map((seed) => requireSeed(seed));
  if (new Set(seeds).size !== 5) fail("SEED_SET_DUPLICATE");
  seeds.sort((left, right) => left - right);
  if (!Array.isArray(spec.slots) || spec.slots.length !== 20) fail("SLOT_COUNT_INVALID");
  const normalized = spec.slots.map(normalizeSlotSpec).sort(slotSort);
  const matrixKeys = new Set();
  const taskSeedKeys = new Set();
  for (const slot of normalized) {
    if (!seeds.includes(slot.seed)) fail("SLOT_SEED_OUTSIDE_FROZEN_SET");
    const matrixKey = `${slot.perturbationClass}\0${slot.seed}`;
    if (matrixKeys.has(matrixKey)) fail("SLOT_MATRIX_DUPLICATE");
    matrixKeys.add(matrixKey);
    const taskSeedKey = `${slot.taskRefHash}\0${slot.seed}`;
    if (taskSeedKeys.has(taskSeedKey)) fail("TASK_SEED_IDENTITY_DUPLICATE");
    taskSeedKeys.add(taskSeedKey);
  }
  for (const perturbationClass of PHYSICAL_SIMULATION_PERTURBATION_CLASSES) {
    for (const seed of seeds) {
      if (!matrixKeys.has(`${perturbationClass}\0${seed}`)) fail("SLOT_MATRIX_INCOMPLETE");
    }
  }
  const slots = normalized.map((slot, index) => {
    const identity = {
      cohortRefHash,
      perturbationClass: slot.perturbationClass,
      seed: slot.seed,
      taskRefHash: slot.taskRefHash,
      expectedPins: slot.expectedPins,
    };
    return {
      schema: PHYSICAL_SIMULATION_COHORT_SCHEMAS.slot,
      ordinal: index + 1,
      slotId: digest("slot-identity", identity),
      perturbationClass: slot.perturbationClass,
      seed: slot.seed,
      taskRefHash: slot.taskRefHash,
      expectedPins: slot.expectedPins,
    };
  });
  return {
    schema: PHYSICAL_SIMULATION_COHORT_SCHEMAS.manifest,
    cohortRefHash,
    perturbationClasses: [...PHYSICAL_SIMULATION_PERTURBATION_CLASSES],
    seeds,
    slots,
    freezePolicy: immutableFreezePolicy(),
    authority: manifestAuthority(),
  };
}

/** Freeze the exact 20-slot fixture population before observations exist. */
export function freezePhysicalSimulationCohortManifest(spec = {}) {
  const normalizedSpec = cloneCanonical(spec, "MANIFEST_SPEC");
  const body = manifestBodyFromSpec(normalizedSpec);
  return deepFreeze({ ...body, manifestHash: digest("manifest", body) });
}

function specFromManifest(manifest) {
  return {
    cohortRefHash: manifest.cohortRefHash,
    seeds: manifest.seeds,
    slots: manifest.slots.map((slot) => ({
      perturbationClass: slot.perturbationClass,
      seed: slot.seed,
      taskRefHash: slot.taskRefHash,
      expectedPins: slot.expectedPins,
    })),
  };
}

export function verifyPhysicalSimulationCohortManifest(manifest) {
  try {
    requireShape(manifest, ["schema", "cohortRefHash", "perturbationClasses", "seeds",
      "slots", "freezePolicy", "authority", "manifestHash"], "MANIFEST");
    if (manifest.schema !== PHYSICAL_SIMULATION_COHORT_SCHEMAS.manifest) {
      fail("MANIFEST_SCHEMA_INVALID");
    }
    const replayed = freezePhysicalSimulationCohortManifest(specFromManifest(manifest));
    if (canonicalizeStrict(replayed) !== canonicalizeStrict(manifest)) {
      fail("MANIFEST_CANONICAL_REPLAY_MISMATCH");
    }
    return { ok: true, manifestHash: manifest.manifestHash, slotCount: 20,
      scope: "FROZEN_FIXTURE_SLOTS_ONLY" };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

function validateObservationEnvelope(value) {
  requireShape(value, ["schema", "slotId", "perturbationClass", "seed", "taskRefHash",
    "source", "projection"], "OBSERVATION");
  if (value.schema !== PHYSICAL_SIMULATION_COHORT_SCHEMAS.observation) {
    fail("OBSERVATION_SCHEMA_INVALID");
  }
  return {
    schema: value.schema,
    slotId: requireHash(value.slotId, "OBSERVATION_SLOT_ID"),
    perturbationClass: value.perturbationClass,
    seed: value.seed,
    taskRefHash: value.taskRefHash,
    source: value.source,
    projection: value.projection,
  };
}

function safeHarnessHash(value) {
  try { return hashHarnessVlaTraceValue(value); } catch { return null; }
}

function rejection(code, errors) {
  if (!errors.includes(code)) errors.push(code);
}

function checkPins(slot, projection, errors) {
  const expected = slot.expectedPins;
  const actual = projection?.rollout?.releases;
  if (projection?.sourceProfile?.profileHash !== expected.sourceProfileHash) {
    rejection("SOURCE_PROFILE_HASH_DRIFT", errors);
  }
  const pins = [
    ["planner", "plannerReleaseHash", "PLANNER_RELEASE_HASH_DRIFT"],
    ["vla", "vlaReleaseHash", "VLA_RELEASE_HASH_DRIFT"],
    ["controller", "controllerReleaseHash", "CONTROLLER_RELEASE_HASH_DRIFT"],
    ["capabilityRegistry", "capabilityRegistryReleaseHash",
      "CAPABILITY_REGISTRY_RELEASE_HASH_DRIFT"],
    ["primitiveJudge", "primitiveJudgeReleaseHash",
      "PRIMITIVE_JUDGE_RELEASE_HASH_DRIFT"],
    ["finalJudge", "finalJudgeReleaseHash", "FINAL_JUDGE_RELEASE_HASH_DRIFT"],
    ["memory", "memoryReleaseHash", "MEMORY_RELEASE_HASH_DRIFT"],
    ["coordinateFrame", "coordinateFrameReleaseHash",
      "COORDINATE_FRAME_RELEASE_HASH_DRIFT"],
    ["calibration", "calibrationReleaseHash", "CALIBRATION_RELEASE_HASH_DRIFT"],
  ];
  for (const [actualField, expectedField, code] of pins) {
    if (actual?.[actualField] !== expected[expectedField]) rejection(code, errors);
  }
}

function rejectedOrAcceptedResult(slot, observation) {
  const errors = [];
  if (observation.perturbationClass !== slot.perturbationClass
    || observation.seed !== slot.seed
    || observation.taskRefHash !== slot.taskRefHash) {
    rejection("SLOT_IDENTITY_RELABEL", errors);
  }
  const verification = verifyHarnessVlaTraceProjection(observation.projection,
    { source: observation.source });
  if (!verification.ok) rejection("CANONICAL_HARNESS_REPLAY_FAILED", errors);
  if (verification.ok) {
    if (observation.projection.rollout.taskRefHash !== slot.taskRefHash) {
      rejection("SOURCE_TASK_REF_HASH_DRIFT", errors);
    }
    if (observation.projection.rollout.seed !== slot.seed) {
      rejection("SOURCE_SEED_DRIFT", errors);
    }
    checkPins(slot, observation.projection, errors);
  }
  const accepted = errors.length === 0;
  const projection = accepted ? observation.projection : null;
  const denominator = projection?.denominator;
  const terminal = projection?.terminal;
  return {
    schema: PHYSICAL_SIMULATION_COHORT_SCHEMAS.result,
    ordinal: slot.ordinal,
    slotId: slot.slotId,
    perturbationClass: slot.perturbationClass,
    seed: slot.seed,
    taskRefHash: slot.taskRefHash,
    disposition: accepted ? "ACCEPTED" : "REJECTED",
    rejectionCodes: errors.sort(),
    suppliedSourceHash: safeHarnessHash(observation.source),
    admittedProjectionHash: accepted ? projection.projectionHash : null,
    sourceBenchmarkResult: accepted ? terminal.finalOutcome : "NOT_ADMITTED",
    terminalReason: accepted ? terminal.reason : null,
    lifecycleStatus: accepted ? terminal.lifecycleStatus : null,
    primitiveAttempts: accepted ? denominator.primitiveAttempts : 0,
    failedOrUnknownPrimitiveAttempts: accepted ? denominator.failedOrUnknownAttempts : 0,
    retries: accepted ? denominator.retries : 0,
    resets: accepted ? denominator.resets : 0,
    terminalFailure: accepted && terminal.reason === "FAILURE" ? 1 : 0,
    budgetExhausted: accepted ? denominator.budgetExhausted : 0,
    abandoned: accepted ? denominator.abandoned : 0,
    unresolved: accepted ? denominator.unresolved : 1,
    physicalSafetyEstablished: false,
    successClaimAuthorized: false,
  };
}

function missingResult(slot) {
  return {
    schema: PHYSICAL_SIMULATION_COHORT_SCHEMAS.result,
    ordinal: slot.ordinal,
    slotId: slot.slotId,
    perturbationClass: slot.perturbationClass,
    seed: slot.seed,
    taskRefHash: slot.taskRefHash,
    disposition: "MISSING",
    rejectionCodes: [],
    suppliedSourceHash: null,
    admittedProjectionHash: null,
    sourceBenchmarkResult: "NOT_SUPPLIED",
    terminalReason: null,
    lifecycleStatus: null,
    primitiveAttempts: 0,
    failedOrUnknownPrimitiveAttempts: 0,
    retries: 0,
    resets: 0,
    terminalFailure: 0,
    budgetExhausted: 0,
    abandoned: 0,
    unresolved: 1,
    physicalSafetyEstablished: false,
    successClaimAuthorized: false,
  };
}

function sum(results, field) {
  return results.reduce((total, result) => total + Number(result[field] ?? 0), 0);
}

function summarize(results) {
  const count = (disposition) => results.filter((result) =>
    result.disposition === disposition).length;
  const benchmarkCount = (outcome) => results.filter((result) =>
    result.sourceBenchmarkResult === outcome).length;
  const sourceBenchmarkPass = benchmarkCount("BENCHMARK_PASS");
  return {
    frozenFixtureSlots: 20,
    reconciledSlotResults: results.length,
    accepted: count("ACCEPTED"),
    rejected: count("REJECTED"),
    missing: count("MISSING"),
    sourceBenchmarkPass,
    sourceBenchmarkFail: benchmarkCount("BENCHMARK_FAIL"),
    sourceBenchmarkUnresolved: benchmarkCount("UNRESOLVED"),
    sourceBenchmarkNotAdmitted: benchmarkCount("NOT_ADMITTED"),
    sourceBenchmarkNotSupplied: benchmarkCount("NOT_SUPPLIED"),
    primitiveAttempts: sum(results, "primitiveAttempts"),
    failedOrUnknownPrimitiveAttempts: sum(results, "failedOrUnknownPrimitiveAttempts"),
    retries: sum(results, "retries"),
    resets: sum(results, "resets"),
    terminalFailures: sum(results, "terminalFailure"),
    budgetExhausted: sum(results, "budgetExhausted"),
    abandoned: sum(results, "abandoned"),
    unresolved: sum(results, "unresolved"),
    fixtureFailureOrUnresolved: results.filter((result) =>
      result.disposition !== "ACCEPTED"
      || result.sourceBenchmarkResult !== "BENCHMARK_PASS"
      || result.terminalReason !== "DONE").length,
    physicalSafetyEstablished: false,
    physicalSafetyEstablishedSlots: 0,
    successClaimAuthorized: false,
    successClaimsAuthorized: 0,
    sourceBenchmarkPassesAreSuccessClaims: false,
  };
}

function reportAuthority() {
  return {
    mode: "FROZEN_SIMULATION_FIXTURE_OBSERVATION_ONLY",
    readOnlyReconciliation: true,
    commandsExecuted: false,
    devicesAccessed: false,
    networkAccessed: false,
    filesystemAccessed: false,
    acceptedRequiresCanonicalSourceReplay: true,
    completeRelativeToFrozenFixtureSlots: true,
    completeRelativeToExternalCensus: false,
    completeRelativeToGlobalCensus: false,
    externalCensusAuthorityEstablished: false,
    sourceBenchmarkPredicateAuthoritativeForPhysicalOutcome: false,
    physicalSafetyEstablished: false,
    successClaimAuthorized: false,
  };
}

function reconciliationPolicy() {
  return {
    expectedSlots: 20,
    missingSlotsMaterialized: true,
    rejectedSlotsRemainInDenominator: true,
    duplicateObservationsRejected: true,
    extraObservationsRejected: true,
    slotReplacementAllowed: false,
    sourceReplayRequiredForAccepted: true,
    exactReleasePinsRequiredForAccepted: true,
    sourceBenchmarkPassDoesNotEstablishPhysicalSafety: true,
  };
}

function reconcileBody(manifest, observations) {
  const manifestVerification = verifyPhysicalSimulationCohortManifest(manifest);
  if (!manifestVerification.ok) fail("MANIFEST_NOT_FROZEN_OR_INVALID");
  if (!Array.isArray(observations)) fail("OBSERVATIONS_ARRAY_REQUIRED");
  const slotMap = new Map(manifest.slots.map((slot) => [slot.slotId, slot]));
  const observationMap = new Map();
  const seenSourceHashes = new Set();
  const seenProjectionHashes = new Set();
  for (const supplied of observations) {
    const observation = validateObservationEnvelope(supplied);
    if (!slotMap.has(observation.slotId)) fail("OBSERVATION_EXTRA_SLOT");
    if (observationMap.has(observation.slotId)) fail("OBSERVATION_SLOT_DUPLICATE");
    observationMap.set(observation.slotId, observation);
    const sourceHash = safeHarnessHash(observation.source);
    const projectionHash = plain(observation.projection)
      && HASH.test(String(observation.projection.projectionHash ?? ""))
      ? observation.projection.projectionHash : null;
    if (sourceHash !== null) {
      if (seenSourceHashes.has(sourceHash)) fail("OBSERVATION_SOURCE_REPLAY_DUPLICATE");
      seenSourceHashes.add(sourceHash);
    }
    if (projectionHash !== null) {
      if (seenProjectionHashes.has(projectionHash)) fail("OBSERVATION_PROJECTION_DUPLICATE");
      seenProjectionHashes.add(projectionHash);
    }
  }
  const results = manifest.slots.map((slot) => {
    const observation = observationMap.get(slot.slotId);
    return observation === undefined ? missingResult(slot)
      : rejectedOrAcceptedResult(slot, observation);
  });
  const body = {
    schema: PHYSICAL_SIMULATION_COHORT_SCHEMAS.report,
    manifestHash: manifest.manifestHash,
    reconciliationPolicy: reconciliationPolicy(),
    results,
    summary: summarize(results),
    authority: reportAuthority(),
  };
  return deepFreeze(body);
}

/** Reconcile observations into an immutable 20-row freeze report. */
export function freezePhysicalSimulationCohortReport({ manifest, observations } = {}) {
  const body = reconcileBody(manifest, observations);
  return deepFreeze({ ...body, reportHash: digest("report", body) });
}

export const reconcilePhysicalSimulationCohort = freezePhysicalSimulationCohortReport;

export function verifyPhysicalSimulationCohortReport(report,
  { manifest, observations } = {}) {
  try {
    requireShape(report, ["schema", "manifestHash", "reconciliationPolicy", "results",
      "summary", "authority", "reportHash"], "REPORT");
    if (report.schema !== PHYSICAL_SIMULATION_COHORT_SCHEMAS.report) {
      fail("REPORT_SCHEMA_INVALID");
    }
    const replayed = freezePhysicalSimulationCohortReport({ manifest, observations });
    if (canonicalizeStrict(replayed) !== canonicalizeStrict(report)) {
      fail("REPORT_CANONICAL_REPLAY_MISMATCH");
    }
    return {
      ok: true,
      manifestHash: report.manifestHash,
      reportHash: report.reportHash,
      slotCount: report.results.length,
      completeRelativeToFrozenFixtureSlots: true,
      completeRelativeToExternalOrGlobalCensus: false,
      commandsExecuted: false,
      devicesAccessed: false,
    };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}

