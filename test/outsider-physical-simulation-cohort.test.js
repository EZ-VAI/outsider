import assert from "node:assert/strict";
import test from "node:test";
import {
  HARNESS_VLA_TRACE_SCHEMAS,
  createHarnessVlaTraceProjection,
  hashHarnessVlaTraceValue,
} from "../src/outsider-harness-vla-trace.js";
import {
  PHYSICAL_SIMULATION_COHORT_SCHEMAS,
  PHYSICAL_SIMULATION_PERTURBATION_CLASSES,
  freezePhysicalSimulationCohortManifest,
  freezePhysicalSimulationCohortReport,
  physicalSimulationCohortCommitment,
  verifyPhysicalSimulationCohortManifest,
  verifyPhysicalSimulationCohortReport,
} from "../src/outsider-physical-simulation-cohort.js";

const H = (value) => hashHarnessVlaTraceValue(value);
const releases = Object.freeze({
  planner: H("planner-v1"),
  vla: H("vla-v1"),
  controller: H("controller-v1"),
  capabilities: H("capabilities-v1"),
  primitiveJudge: H("primitive-judge-v1"),
  finalJudge: H("final-judge-v1"),
  memory: H("memory-v1"),
  frame: H("frame-v1"),
  calibration: H("calibration-v1"),
});

const sourceProfile = Object.freeze({
  schema: HARNESS_VLA_TRACE_SCHEMAS.sourceProfile,
  captureMode: "FIXTURE_SUPPLIED",
  protocolReleaseHash: H("protocol-v1"),
  producerReleaseHash: H("producer-v1"),
  sourceClockAuthority: "UNTRUSTED_SOURCE_CLAIM",
  sourceEventHashAuthority: "UNTRUSTED_SOURCE_CLAIM",
});

function observation(id, second) {
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.observation,
    observationId: id,
    capturedAt: `2026-08-25T00:00:${String(second).padStart(2, "0")}.000Z`,
    coordinateFrameReleaseHash: releases.frame,
    calibrationReleaseHash: releases.calibration,
    state: { marker: id },
    imageReferences: [],
  };
}

function traceSource(perturbationClass, seed, {
  terminalReason = "DONE", finalVerdict = "PASS", receiptStatus = "EXECUTED",
  postconditionVerdict = "PASS",
} = {}) {
  const initial = observation(`initial-${perturbationClass}-${seed}`, seed);
  const next = observation(`next-${perturbationClass}-${seed}`, seed + 10);
  const commandId = `command-${perturbationClass}-${seed}`;
  const capabilityBindingHash = H("set-gripper-binding-v1");
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.source,
    sourceProfile,
    rollout: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.rollout,
      rolloutId: `rollout-${perturbationClass}-${seed}`,
      taskRef: `task-${perturbationClass}`,
      taskLanguage: `fixture ${perturbationClass}`,
      seed,
      mode: "REPLAY",
      plannerReleaseHash: releases.planner,
      vlaReleaseHash: releases.vla,
      controllerReleaseHash: releases.controller,
      capabilityRegistryReleaseHash: releases.capabilities,
      primitiveJudgeReleaseHash: releases.primitiveJudge,
      finalJudgeReleaseHash: releases.finalJudge,
      memoryReleaseHash: releases.memory,
      coordinateFrameReleaseHash: releases.frame,
      calibrationReleaseHash: releases.calibration,
      budgets: { maxCommands: 1, maxVlaChunks: 0, maxRetries: 0, maxRiskUnits: 1 },
    },
    initialObservation: initial,
    attempts: [{
      schema: HARNESS_VLA_TRACE_SCHEMAS.attempt,
      nn: 1,
      command: {
        schema: HARNESS_VLA_TRACE_SCHEMAS.command,
        nn: 1,
        commandId,
        primitive: "SET_GRIPPER",
        parameters: { position: "closed" },
        coordinateBinding: null,
        retryOf: null,
        capabilityRegistryReleaseHash: releases.capabilities,
        capabilityBindingHash,
        plannerReleaseHash: releases.planner,
      },
      receipt: {
        schema: HARNESS_VLA_TRACE_SCHEMAS.receipt,
        nn: 1,
        commandId,
        primitive: "SET_GRIPPER",
        capabilityRegistryReleaseHash: releases.capabilities,
        capabilityBindingHash,
        status: receiptStatus,
        result: { fixture: true },
        usage: { vlaChunks: 0, riskUnits: 1 },
        nextObservationHash: H(next),
      },
      nextObservation: next,
      primitivePostcondition: {
        schema: HARNESS_VLA_TRACE_SCHEMAS.postcondition,
        nn: 1,
        observationHash: H(next),
        judgeReleaseHash: releases.primitiveJudge,
        verdict: postconditionVerdict,
        evidence: { fixture: true },
      },
      done: {
        schema: HARNESS_VLA_TRACE_SCHEMAS.done,
        nn: 1,
        reported: terminalReason === "DONE",
        reason: terminalReason === "DONE" ? "fixture complete" : null,
      },
    }],
    terminal: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.terminal,
      reason: terminalReason,
      plannerReportedSuccess: finalVerdict === "PASS",
      finalBenchmarkPredicate: finalVerdict == null ? null : {
        schema: HARNESS_VLA_TRACE_SCHEMAS.finalPredicate,
        observationHash: H(next),
        judgeReleaseHash: releases.finalJudge,
        verdict: finalVerdict,
        evidence: { fixture: true },
      },
    },
  };
}

function expectedPins(overrides = {}) {
  return {
    schema: PHYSICAL_SIMULATION_COHORT_SCHEMAS.expectedPins,
    sourceProfileHash: H(sourceProfile),
    plannerReleaseHash: releases.planner,
    vlaReleaseHash: releases.vla,
    controllerReleaseHash: releases.controller,
    capabilityRegistryReleaseHash: releases.capabilities,
    primitiveJudgeReleaseHash: releases.primitiveJudge,
    finalJudgeReleaseHash: releases.finalJudge,
    memoryReleaseHash: releases.memory,
    coordinateFrameReleaseHash: releases.frame,
    calibrationReleaseHash: releases.calibration,
    ...overrides,
  };
}

function manifestSpec(pinFor = () => expectedPins()) {
  const seeds = [0, 1, 2, 3, 4];
  return {
    cohortRefHash: physicalSimulationCohortCommitment("test-cohort", "cohort-v1"),
    seeds,
    slots: PHYSICAL_SIMULATION_PERTURBATION_CLASSES.flatMap((perturbationClass) =>
      seeds.map((seed) => ({
        perturbationClass,
        seed,
        taskRefHash: H(`task-${perturbationClass}`),
        expectedPins: pinFor(perturbationClass, seed),
      }))),
  };
}

function manifest(pinFor) {
  return freezePhysicalSimulationCohortManifest(manifestSpec(pinFor));
}

function observationEnvelope(slot, options = {}) {
  const source = traceSource(slot.perturbationClass, slot.seed, options);
  return {
    schema: PHYSICAL_SIMULATION_COHORT_SCHEMAS.observation,
    slotId: slot.slotId,
    perturbationClass: slot.perturbationClass,
    seed: slot.seed,
    taskRefHash: slot.taskRefHash,
    source,
    projection: createHarnessVlaTraceProjection({ source }),
  };
}

function fullObservations(frozenManifest) {
  return frozenManifest.slots.map((slot) => observationEnvelope(slot));
}

test("freezes one canonical 4-by-5 manifest before observations", () => {
  const frozen = manifest();
  assert.equal(frozen.slots.length, 20);
  assert.deepEqual(frozen.perturbationClasses,
    ["OBJECT_T", "OBJECT_S", "GOAL_T", "GOAL_S"]);
  for (const perturbationClass of PHYSICAL_SIMULATION_PERTURBATION_CLASSES) {
    assert.deepEqual(frozen.slots.filter((slot) =>
      slot.perturbationClass === perturbationClass).map((slot) => slot.seed),
    [0, 1, 2, 3, 4]);
  }
  assert.equal(new Set(frozen.slots.map((slot) => slot.slotId)).size, 20);
  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(Object.isFrozen(frozen.slots[0].expectedPins), true);
  assert.deepEqual(verifyPhysicalSimulationCohortManifest(frozen), {
    ok: true,
    manifestHash: frozen.manifestHash,
    slotCount: 20,
    scope: "FROZEN_FIXTURE_SLOTS_ONLY",
  });
  const incomplete = manifestSpec();
  incomplete.slots.pop();
  assert.throws(() => freezePhysicalSimulationCohortManifest(incomplete),
    /SLOT_COUNT_INVALID/);
  const duplicate = manifestSpec();
  duplicate.slots[1] = structuredClone(duplicate.slots[0]);
  assert.throws(() => freezePhysicalSimulationCohortManifest(duplicate),
    /SLOT_MATRIX_DUPLICATE/);
});

test("accepts all 20 slots only through canonical Harness source replay", () => {
  const frozen = manifest();
  const observations = fullObservations(frozen);
  const report = freezePhysicalSimulationCohortReport({ manifest: frozen, observations });
  assert.equal(report.results.length, 20);
  assert.equal(report.summary.accepted, 20);
  assert.equal(report.summary.rejected, 0);
  assert.equal(report.summary.missing, 0);
  assert.equal(report.summary.sourceBenchmarkPass, 20);
  assert.equal(report.summary.primitiveAttempts, 20);
  assert.equal(report.authority.completeRelativeToFrozenFixtureSlots, true);
  assert.equal(report.authority.completeRelativeToExternalCensus, false);
  assert.equal(report.authority.completeRelativeToGlobalCensus, false);
  assert.equal(report.summary.physicalSafetyEstablished, false);
  assert.equal(report.summary.successClaimAuthorized, false);
  assert.equal(report.results.every((row) => !row.physicalSafetyEstablished
    && !row.successClaimAuthorized), true);
  assert.deepEqual(verifyPhysicalSimulationCohortReport(report,
    { manifest: frozen, observations }), {
    ok: true,
    manifestHash: frozen.manifestHash,
    reportHash: report.reportHash,
    slotCount: 20,
    completeRelativeToFrozenFixtureSlots: true,
    completeRelativeToExternalOrGlobalCensus: false,
    commandsExecuted: false,
    devicesAccessed: false,
  });
});

test("materializes every omitted fixture slot as MISSING without shrinking denominator", () => {
  const frozen = manifest();
  const report = freezePhysicalSimulationCohortReport({
    manifest: frozen,
    observations: fullObservations(frozen).slice(0, 13),
  });
  assert.equal(report.results.length, 20);
  assert.equal(report.summary.accepted, 13);
  assert.equal(report.summary.missing, 7);
  assert.equal(report.summary.unresolved, 7);
  assert.equal(report.summary.fixtureFailureOrUnresolved, 7);
  assert.equal(report.results.filter((row) => row.disposition === "MISSING").length, 7);
});

test("rejects duplicate, additional, and replay-substitution observations", () => {
  const frozen = manifest();
  const first = observationEnvelope(frozen.slots[0]);
  assert.throws(() => freezePhysicalSimulationCohortReport({
    manifest: frozen, observations: [first, structuredClone(first)],
  }), /OBSERVATION_SLOT_DUPLICATE/);

  const extra = structuredClone(first);
  extra.slotId = H("not-a-frozen-slot");
  assert.throws(() => freezePhysicalSimulationCohortReport({
    manifest: frozen, observations: [extra],
  }), /OBSERVATION_EXTRA_SLOT/);

  const substituted = observationEnvelope(frozen.slots[1]);
  substituted.source = first.source;
  substituted.projection = first.projection;
  assert.throws(() => freezePhysicalSimulationCohortReport({
    manifest: frozen, observations: [first, substituted],
  }), /OBSERVATION_SOURCE_REPLAY_DUPLICATE/);
});

test("relabelled identity is REJECTED in place and cannot replace a missing slot", () => {
  const frozen = manifest();
  const relabelled = observationEnvelope(frozen.slots[0]);
  relabelled.perturbationClass = "GOAL_S";
  const report = freezePhysicalSimulationCohortReport({
    manifest: frozen, observations: [relabelled],
  });
  assert.equal(report.results[0].disposition, "REJECTED");
  assert.deepEqual(report.results[0].rejectionCodes, ["SLOT_IDENTITY_RELABEL"]);
  assert.equal(report.summary.rejected, 1);
  assert.equal(report.summary.missing, 19);
  assert.equal(report.summary.sourceBenchmarkPass, 0);
});

test("release-pin and frozen-manifest hash drift fail closed", () => {
  const frozen = manifest((perturbationClass, seed) => expectedPins(
    perturbationClass === "OBJECT_T" && seed === 0
      ? { vlaReleaseHash: H("unobserved-vla-release") } : {}));
  const report = freezePhysicalSimulationCohortReport({
    manifest: frozen,
    observations: [observationEnvelope(frozen.slots[0])],
  });
  assert.equal(report.results[0].disposition, "REJECTED");
  assert.deepEqual(report.results[0].rejectionCodes, ["VLA_RELEASE_HASH_DRIFT"]);

  const tamperedManifest = structuredClone(frozen);
  tamperedManifest.slots[0].expectedPins.vlaReleaseHash = releases.vla;
  assert.equal(verifyPhysicalSimulationCohortManifest(tamperedManifest).ok, false);
  assert.throws(() => freezePhysicalSimulationCohortReport({
    manifest: tamperedManifest, observations: [],
  }), /MANIFEST_NOT_FROZEN_OR_INVALID/);
});

test("source tamper cannot retain an old passing projection", () => {
  const frozen = manifest();
  const supplied = observationEnvelope(frozen.slots[0]);
  supplied.source.attempts[0].nextObservation.state.marker = "tampered-after-projection";
  const report = freezePhysicalSimulationCohortReport({
    manifest: frozen, observations: [supplied],
  });
  assert.equal(report.results[0].disposition, "REJECTED");
  assert.deepEqual(report.results[0].rejectionCodes,
    ["CANONICAL_HARNESS_REPLAY_FAILED"]);
  assert.equal(report.summary.sourceBenchmarkPass, 0);
  assert.equal(report.summary.successClaimsAuthorized, 0);
});

test("counts source failure, abandoned, budget exhaustion, and unresolved rows", () => {
  const frozen = manifest();
  const observations = [
    observationEnvelope(frozen.slots[0]),
    observationEnvelope(frozen.slots[1], {
      terminalReason: "FAILURE", finalVerdict: "FAIL",
      receiptStatus: "FAILED", postconditionVerdict: "FAIL",
    }),
    observationEnvelope(frozen.slots[2], {
      terminalReason: "ABANDONED", finalVerdict: null,
    }),
    observationEnvelope(frozen.slots[3], {
      terminalReason: "BUDGET_EXHAUSTED", finalVerdict: null,
    }),
  ];
  const report = freezePhysicalSimulationCohortReport({ manifest: frozen, observations });
  assert.equal(report.summary.accepted, 4);
  assert.equal(report.summary.missing, 16);
  assert.equal(report.summary.sourceBenchmarkPass, 1);
  assert.equal(report.summary.sourceBenchmarkFail, 1);
  assert.equal(report.summary.sourceBenchmarkUnresolved, 2);
  assert.equal(report.summary.failedOrUnknownPrimitiveAttempts, 1);
  assert.equal(report.summary.terminalFailures, 1);
  assert.equal(report.summary.abandoned, 1);
  assert.equal(report.summary.budgetExhausted, 1);
  assert.equal(report.summary.unresolved, 18);
  assert.equal(report.summary.sourceBenchmarkPassesAreSuccessClaims, false);
});

test("a benchmark PASS never establishes physical safety or an authorized claim", () => {
  const frozen = manifest();
  const report = freezePhysicalSimulationCohortReport({
    manifest: frozen, observations: [observationEnvelope(frozen.slots[0])],
  });
  const pass = report.results[0];
  assert.equal(pass.sourceBenchmarkResult, "BENCHMARK_PASS");
  assert.equal(pass.physicalSafetyEstablished, false);
  assert.equal(pass.successClaimAuthorized, false);
  assert.equal(report.authority.sourceBenchmarkPredicateAuthoritativeForPhysicalOutcome,
    false);
  assert.equal(report.summary.successClaimsAuthorized, 0);

  const tampered = structuredClone(report);
  tampered.results[0].successClaimAuthorized = true;
  assert.equal(verifyPhysicalSimulationCohortReport(tampered, {
    manifest: frozen, observations: [observationEnvelope(frozen.slots[0])],
  }).ok, false);
});

test("closed schemas reject unknown manifest and observation fields", () => {
  const spec = manifestSpec();
  spec.unfrozenObservation = {};
  assert.throws(() => freezePhysicalSimulationCohortManifest(spec),
    /MANIFEST_SPEC_SHAPE_INVALID/);
  const frozen = manifest();
  const supplied = observationEnvelope(frozen.slots[0]);
  supplied.claimedSuccess = true;
  assert.throws(() => freezePhysicalSimulationCohortReport({
    manifest: frozen, observations: [supplied],
  }), /OBSERVATION_SHAPE_INVALID/);
});

