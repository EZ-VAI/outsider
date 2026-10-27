/*
 * Deterministic, synthetic-only fixture for the Phase 2 physical simulation
 * conformance report. No source record represents a real robot or benchmark
 * run. The fixture is intentionally kept outside public runtime entrypoints.
 */

import {
  HARNESS_VLA_TRACE_SCHEMAS,
  createHarnessVlaTraceProjection,
  hashHarnessVlaTraceValue,
} from "./outsider-harness-vla-trace.js";
import {
  PHYSICAL_SIMULATION_COHORT_SCHEMAS,
  PHYSICAL_SIMULATION_PERTURBATION_CLASSES,
  freezePhysicalSimulationCohortManifest,
  physicalSimulationCohortCommitment,
} from "./outsider-physical-simulation-cohort.js";
import {
  PHYSICAL_SIMULATION_FAULTS,
  createPhysicalSimulationFaultPlan,
} from "./outsider-physical-simulation-faults.js";

const H = (value) => hashHarnessVlaTraceValue(value);

const RELEASES = Object.freeze({
  planner: H("phase2-planner-v1"),
  vla: H("phase2-vla-checkpoint-v1"),
  controller: H("phase2-controller-v1"),
  capabilities: H("phase2-physical-capabilities-v1"),
  primitiveJudge: H("phase2-primitive-judge-v1"),
  finalJudge: H("phase2-final-judge-v1"),
  memory: H("phase2-memory-v1"),
  frame: H("phase2-world-frame-v1"),
  calibration: H("phase2-calibration-v1"),
});

const SOURCE_PROFILE = Object.freeze({
  schema: HARNESS_VLA_TRACE_SCHEMAS.sourceProfile,
  captureMode: "FIXTURE_SUPPLIED",
  protocolReleaseHash: H("phase2-synthetic-protocol-v1"),
  producerReleaseHash: H("phase2-synthetic-producer-v1"),
  sourceClockAuthority: "UNTRUSTED_SOURCE_CLAIM",
  sourceEventHashAuthority: "UNTRUSTED_SOURCE_CLAIM",
});

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function observation(id, second, releases = RELEASES) {
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.observation,
    observationId: id,
    capturedAt: `2026-08-25T00:00:${String(second).padStart(2, "0")}.000Z`,
    coordinateFrameReleaseHash: releases.frame,
    calibrationReleaseHash: releases.calibration,
    state: { syntheticPhase: id },
    imageReferences: [],
  };
}

function analyticAttempt({ nn, before, after, primitive = "SET_GRIPPER",
  retryOf = null, receiptStatus = "EXECUTED", postconditionVerdict = "PASS",
  done = false, releases = RELEASES }) {
  const commandId = `phase2-command-${nn}-${before.observationId}`;
  const capabilityBindingHash = H(`phase2-binding-${primitive}`);
  const coordinateBinding = ["MOVE_TO", "MOVE_POSE", "NAVIGATE_TO", "MOVE_BASE"]
    .includes(primitive) ? {
      observationNn: nn - 1,
      observationHash: H(before),
      coordinateFrameReleaseHash: releases.frame,
      calibrationReleaseHash: releases.calibration,
    } : null;
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.attempt,
    nn,
    command: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.command,
      nn,
      commandId,
      primitive,
      parameters: primitive === "SET_GRIPPER" ? { position: "closed" }
        : { syntheticTarget: [nn, nn + 1, nn + 2] },
      coordinateBinding,
      retryOf,
      capabilityRegistryReleaseHash: releases.capabilities,
      capabilityBindingHash,
      plannerReleaseHash: releases.planner,
    },
    receipt: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.receipt,
      nn,
      commandId,
      primitive,
      capabilityRegistryReleaseHash: releases.capabilities,
      capabilityBindingHash,
      status: receiptStatus,
      result: { synthetic: true },
      usage: { vlaChunks: 0, riskUnits: 1 },
      nextObservationHash: H(after),
    },
    nextObservation: after,
    primitivePostcondition: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.postcondition,
      nn,
      observationHash: H(after),
      judgeReleaseHash: releases.primitiveJudge,
      verdict: postconditionVerdict,
      evidence: { synthetic: true },
    },
    done: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.done,
      nn,
      reported: done,
      reason: done ? "synthetic fixture complete" : null,
    },
  };
}

function vlaAttempt({ nn, before, after, retryOf = null, done = false }) {
  const commandId = `phase2-vla-command-${nn}`;
  const capabilityBindingHash = H("phase2-binding-vla-act");
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.attempt,
    nn,
    command: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.command,
      nn,
      commandId,
      primitive: "VLA_ACT",
      parameters: {
        prompt: `synthetic phase2 step ${nn}`,
        maxChunks: 4,
        stopPredicateReleaseHash: H("phase2-stop-predicate-v1"),
      },
      coordinateBinding: null,
      retryOf,
      capabilityRegistryReleaseHash: RELEASES.capabilities,
      capabilityBindingHash,
      plannerReleaseHash: RELEASES.planner,
    },
    receipt: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.receipt,
      nn,
      commandId,
      primitive: "VLA_ACT",
      capabilityRegistryReleaseHash: RELEASES.capabilities,
      capabilityBindingHash,
      status: "EXECUTED",
      result: { synthetic: true },
      usage: { vlaChunks: 2, riskUnits: 1 },
      nextObservationHash: H(after),
    },
    nextObservation: after,
    primitivePostcondition: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.postcondition,
      nn,
      observationHash: H(after),
      judgeReleaseHash: RELEASES.primitiveJudge,
      verdict: "PASS",
      evidence: { synthetic: true },
    },
    done: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.done,
      nn,
      reported: done,
      reason: done ? "synthetic fixture complete" : null,
    },
  };
}

function terminal(reason, latestObservation, { verdict = "PASS" } = {}) {
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.terminal,
    reason,
    plannerReportedSuccess: verdict === "PASS",
    finalBenchmarkPredicate: verdict == null ? null : {
      schema: HARNESS_VLA_TRACE_SCHEMAS.finalPredicate,
      observationHash: H(latestObservation),
      judgeReleaseHash: RELEASES.finalJudge,
      verdict,
      evidence: { synthetic: true },
    },
  };
}

function rolloutIdentity(perturbationClass, seed, budgets) {
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.rollout,
    rolloutId: `phase2-${perturbationClass.toLowerCase()}-${seed}`,
    taskRef: `phase2-task-${perturbationClass.toLowerCase()}`,
    taskLanguage: `synthetic conformance task ${perturbationClass}`,
    seed,
    mode: "REPLAY",
    plannerReleaseHash: RELEASES.planner,
    vlaReleaseHash: RELEASES.vla,
    controllerReleaseHash: RELEASES.controller,
    capabilityRegistryReleaseHash: RELEASES.capabilities,
    primitiveJudgeReleaseHash: RELEASES.primitiveJudge,
    finalJudgeReleaseHash: RELEASES.finalJudge,
    memoryReleaseHash: RELEASES.memory,
    coordinateFrameReleaseHash: RELEASES.frame,
    calibrationReleaseHash: RELEASES.calibration,
    budgets,
  };
}

function cohortTrace(slot, mode = "HEALTHY") {
  const first = observation(`phase2-${slot.ordinal}-0`, 0);
  const second = observation(`phase2-${slot.ordinal}-1`, 1);
  const retry = mode === "RETRY";
  const third = retry ? observation(`phase2-${slot.ordinal}-2`, 2) : null;
  const failure = mode === "FAILURE";
  const abandoned = mode === "ABANDONED";
  const budget = mode === "BUDGET_EXHAUSTED";
  const attempts = [analyticAttempt({
    nn: 1,
    before: first,
    after: second,
    receiptStatus: failure ? "FAILED" : "EXECUTED",
    postconditionVerdict: failure ? "FAIL" : "PASS",
    done: !retry && !failure && !abandoned && !budget,
  })];
  if (retry) attempts.push(analyticAttempt({
    nn: 2, before: second, after: third, retryOf: 1, done: true,
  }));
  const reason = failure ? "FAILURE" : abandoned ? "ABANDONED"
    : budget ? "BUDGET_EXHAUSTED" : "DONE";
  const verdict = failure ? "FAIL" : (abandoned || budget) ? null : "PASS";
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.source,
    sourceProfile: SOURCE_PROFILE,
    rollout: rolloutIdentity(slot.perturbationClass, slot.seed, {
      maxCommands: budget ? 1 : retry ? 2 : 2,
      maxVlaChunks: 0,
      maxRetries: retry ? 1 : 0,
      maxRiskUnits: retry ? 2 : 2,
    }),
    initialObservation: first,
    attempts,
    terminal: terminal(reason, retry ? third : second, { verdict }),
  };
}

function applyCohortPinDrift(source, kind) {
  if (kind === "VLA") {
    source.rollout.vlaReleaseHash = H("phase2-drift-vla-checkpoint");
  } else if (kind === "MEMORY") {
    source.rollout.memoryReleaseHash = H("phase2-drift-memory-release");
  } else if (kind === "CAPABILITY") {
    const drift = H("phase2-drift-capability-registry");
    source.rollout.capabilityRegistryReleaseHash = drift;
    for (const attempt of source.attempts) {
      attempt.command.capabilityRegistryReleaseHash = drift;
      attempt.receipt.capabilityRegistryReleaseHash = drift;
    }
  }
  return source;
}

function expectedPins() {
  return {
    schema: PHYSICAL_SIMULATION_COHORT_SCHEMAS.expectedPins,
    sourceProfileHash: H(SOURCE_PROFILE),
    plannerReleaseHash: RELEASES.planner,
    vlaReleaseHash: RELEASES.vla,
    controllerReleaseHash: RELEASES.controller,
    capabilityRegistryReleaseHash: RELEASES.capabilities,
    primitiveJudgeReleaseHash: RELEASES.primitiveJudge,
    finalJudgeReleaseHash: RELEASES.finalJudge,
    memoryReleaseHash: RELEASES.memory,
    coordinateFrameReleaseHash: RELEASES.frame,
    calibrationReleaseHash: RELEASES.calibration,
  };
}

function cohortManifest() {
  const seeds = [0, 1, 2, 3, 4];
  return freezePhysicalSimulationCohortManifest({
    cohortRefHash: physicalSimulationCohortCommitment("phase2-fixture",
      "physical-simulation-phase2-v1"),
    seeds,
    slots: PHYSICAL_SIMULATION_PERTURBATION_CLASSES.flatMap((perturbationClass) => (
      seeds.map((seed) => ({
        perturbationClass,
        seed,
        taskRefHash: H(`phase2-task-${perturbationClass.toLowerCase()}`),
        expectedPins: expectedPins(),
      }))
    )),
  });
}

function cohortObservations(manifest) {
  return manifest.slots.flatMap((slot) => {
    if (slot.ordinal === 8) return [];
    const mode = ({ 4: "FAILURE", 5: "ABANDONED", 6: "BUDGET_EXHAUSTED",
      7: "RETRY" })[slot.ordinal] ?? "HEALTHY";
    const source = cohortTrace(slot, mode);
    applyCohortPinDrift(source, ({ 1: "VLA", 2: "MEMORY",
      3: "CAPABILITY" })[slot.ordinal]);
    return [{
      schema: PHYSICAL_SIMULATION_COHORT_SCHEMAS.observation,
      slotId: slot.slotId,
      perturbationClass: slot.perturbationClass,
      seed: slot.seed,
      taskRefHash: slot.taskRefHash,
      source,
      projection: createHarnessVlaTraceProjection({ source }),
    }];
  });
}

function faultSource() {
  const obs0 = observation("phase2-fault-0", 0);
  const obs1 = observation("phase2-fault-1", 1);
  const obs2 = observation("phase2-fault-2", 2);
  const obs3 = observation("phase2-fault-3", 3);
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.source,
    sourceProfile: SOURCE_PROFILE,
    rollout: {
      ...rolloutIdentity("OBJECT_T", 17, {
        maxCommands: 4, maxVlaChunks: 5, maxRetries: 2, maxRiskUnits: 4,
      }),
      rolloutId: "phase2-fault-control",
      taskRef: "phase2-fault-control-task",
    },
    initialObservation: obs0,
    attempts: [
      analyticAttempt({ nn: 1, before: obs0, after: obs1, primitive: "MOVE_TO" }),
      vlaAttempt({ nn: 2, before: obs1, after: obs2 }),
      vlaAttempt({ nn: 3, before: obs2, after: obs3, retryOf: 2, done: true }),
    ],
    terminal: terminal("DONE", obs3, { verdict: "PASS" }),
  };
}

export function createPhysicalSimulationPhase2Fixture() {
  const manifest = cohortManifest();
  const observations = cohortObservations(manifest);
  const source = faultSource();
  const faultPlan = createPhysicalSimulationFaultPlan({
    planId: "physical-simulation-phase2-exact-11-v1",
    source,
    cases: PHYSICAL_SIMULATION_FAULTS.map((fault, index) => ({
      caseId: `phase2-fault-${String(index + 1).padStart(2, "0")}`,
      fault,
      targetAttemptNn: null,
    })),
  });
  return deepFreeze({ manifest, observations, faultSource: source, faultPlan });
}

