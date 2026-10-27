import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  HARNESS_VLA_TRACE_SCHEMAS,
  hashHarnessVlaTraceValue,
} from "../src/outsider-harness-vla-trace.js";
import {
  PHYSICAL_SIMULATION_FAULTS,
  PHYSICAL_SIMULATION_FAULT_SCHEMAS,
  createPhysicalSimulationFaultPlan,
  runPhysicalSimulationFaultPlan,
  verifyPhysicalSimulationFaultReport,
} from "../src/outsider-physical-simulation-faults.js";

const H = (label) => hashHarnessVlaTraceValue(label);
const releases = Object.freeze({
  planner: H("planner-v1"),
  vla: H("vla-checkpoint-v1"),
  controller: H("controller-v1"),
  capabilities: H("physical-capabilities-v1"),
  primitiveJudge: H("primitive-judge-v1"),
  finalJudge: H("final-judge-v1"),
  memory: H("memory-release-v1"),
  frame: H("robot-world-frame-v1"),
  calibration: H("calibration-v1"),
});

function observation(index) {
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.observation,
    observationId: `observation-${index}`,
    capturedAt: `2026-08-25T00:00:0${index}.000Z`,
    coordinateFrameReleaseHash: releases.frame,
    calibrationReleaseHash: releases.calibration,
    state: { phase: index, privateObject: `Mia-secret-object-${index}` },
    imageReferences: [`/private/Mia/secret-frame-${index}.png`],
  };
}

function attempt(nn, primitive, before, after, retryOf = null) {
  const commandId = `command-${nn}`;
  const coordinate = ["MOVE_TO", "MOVE_POSE", "NAVIGATE_TO", "MOVE_BASE"]
    .includes(primitive);
  const parameters = primitive === "VLA_ACT" ? {
    prompt: `private prompt for Mia attempt ${nn}`,
    maxChunks: 4,
    stopPredicateReleaseHash: H("vla-stop-predicate-v1"),
  } : { privateTarget: [nn, nn + 1, nn + 2] };
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.attempt,
    nn,
    command: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.command,
      nn,
      commandId,
      primitive,
      parameters,
      coordinateBinding: coordinate ? {
        observationNn: nn - 1,
        observationHash: hashHarnessVlaTraceValue(before),
        coordinateFrameReleaseHash: releases.frame,
        calibrationReleaseHash: releases.calibration,
      } : null,
      retryOf,
      capabilityRegistryReleaseHash: releases.capabilities,
      capabilityBindingHash: H(`binding-${primitive}`),
      plannerReleaseHash: releases.planner,
    },
    receipt: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.receipt,
      nn,
      commandId,
      primitive,
      capabilityRegistryReleaseHash: releases.capabilities,
      capabilityBindingHash: H(`binding-${primitive}`),
      status: "EXECUTED",
      result: { privateReceipt: `Mia-secret-receipt-${nn}` },
      usage: { vlaChunks: primitive === "VLA_ACT" ? 2 : 0, riskUnits: 1 },
      nextObservationHash: hashHarnessVlaTraceValue(after),
    },
    nextObservation: after,
    primitivePostcondition: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.postcondition,
      nn,
      observationHash: hashHarnessVlaTraceValue(after),
      judgeReleaseHash: releases.primitiveJudge,
      verdict: "PASS",
      evidence: { privateEvidence: `Mia-secret-evidence-${nn}` },
    },
    done: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.done,
      nn,
      reported: nn === 3,
      reason: nn === 3 ? "private planner reason for Mia" : null,
    },
  };
}

function syntheticSource() {
  const obs0 = observation(0);
  const obs1 = observation(1);
  const obs2 = observation(2);
  const obs3 = observation(3);
  return {
    schema: HARNESS_VLA_TRACE_SCHEMAS.source,
    sourceProfile: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.sourceProfile,
      captureMode: "FIXTURE_SUPPLIED",
      protocolReleaseHash: H("synthetic-protocol-v1"),
      producerReleaseHash: H("synthetic-producer-v1"),
      sourceClockAuthority: "UNTRUSTED_SOURCE_CLAIM",
      sourceEventHashAuthority: "UNTRUSTED_SOURCE_CLAIM",
    },
    rollout: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.rollout,
      rolloutId: "synthetic-rollout-private-id",
      taskRef: "synthetic-private-task",
      taskLanguage: "private task involving Mia's private object",
      seed: 17,
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
      budgets: { maxCommands: 4, maxVlaChunks: 5, maxRetries: 2, maxRiskUnits: 4 },
    },
    initialObservation: obs0,
    attempts: [
      attempt(1, "MOVE_TO", obs0, obs1),
      attempt(2, "VLA_ACT", obs1, obs2),
      attempt(3, "VLA_ACT", obs2, obs3, 2),
    ],
    terminal: {
      schema: HARNESS_VLA_TRACE_SCHEMAS.terminal,
      reason: "DONE",
      plannerReportedSuccess: true,
      finalBenchmarkPredicate: {
        schema: HARNESS_VLA_TRACE_SCHEMAS.finalPredicate,
        observationHash: hashHarnessVlaTraceValue(obs3),
        judgeReleaseHash: releases.finalJudge,
        verdict: "PASS",
        evidence: { privateFinalEvidence: "Mia-secret-final-evidence" },
      },
    },
  };
}

function fullPlan(source) {
  return createPhysicalSimulationFaultPlan({
    planId: "physical-simulation-faults-v1",
    source,
    cases: PHYSICAL_SIMULATION_FAULTS.map((fault, index) => ({
      caseId: `fault-case-${index + 1}`,
      fault,
      targetAttemptNn: null,
    })),
  });
}

test("healthy control is accepted while the offline runner requests and executes nothing", () => {
  const source = syntheticSource();
  const plan = fullPlan(source);
  const report = runPhysicalSimulationFaultPlan({ source, faultPlan: plan });

  assert.equal(report.control.status, "ACCEPTED");
  assert.equal(report.control.traceVerificationAccepted, true);
  assert.equal(report.control.sourceCommitment, hashHarnessVlaTraceValue(source));
  assert.equal(report.runner.mode, "OFFLINE_PURE_TRACE_REPLAY");
  assert.equal(report.runner.humanConfirmationRequests, 0);
  assert.equal(report.runner.deviceCommands, 0);
  assert.equal(report.runner.commandsExecuted, 0);
  assert.equal(report.runner.devicesAccessed, false);
  assert.equal(report.runner.robotSafetyEstablished, false);
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.cases), true);
  assert.equal(Object.isFrozen(report), true);
});

test("faults are strictly classified as rejected, quarantined, or currently unobservable", () => {
  const source = syntheticSource();
  const report = runPhysicalSimulationFaultPlan({ source, faultPlan: fullPlan(source) });
  const byFault = Object.fromEntries(report.results.map((result) => [result.fault, result]));

  assert.equal(byFault.PLANNER_FALSE_FINAL_CLAIM.classification,
    "DETECTED_QUARANTINED");
  assert.equal(byFault.FAILED_RECEIPT_FALSE_LOCAL_PASS.classification,
    "DETECTED_QUARANTINED");
  assert.equal(byFault.VLA_CHECKPOINT_DRIFT.classification,
    "NOT_OBSERVABLE_WITH_CURRENT_TRACE");
  for (const fault of [
    "PRIMITIVE_JUDGE_DRIFT", "FINAL_JUDGE_DRIFT", "CALIBRATION_DRIFT",
    "STALE_COORDINATE_BINDING", "MISSING_RECEIPT", "OMITTED_ATTEMPT_GAP",
    "RETRY_BUDGET_EXCEEDED", "BUDGET_EXHAUSTION_MISMATCH",
  ]) {
    assert.equal(byFault[fault].classification, "DETECTED_REJECTED", fault);
  }
  assert.deepEqual(report.summary, {
    total: 11,
    detectedRejected: 8,
    detectedQuarantined: 2,
    notObservableWithCurrentTrace: 1,
  });
  for (const result of report.results) {
    assert.match(result.sourceCommitment, /^sha256:[a-f0-9]{64}$/);
    assert.match(result.projectionCommitment, /^sha256:[a-f0-9]{64}$/);
    assert.match(result.errorCommitment, /^sha256:[a-f0-9]{64}$/);
    assert.match(result.resultHash, /^sha256:[a-f0-9]{64}$/);
    assert.equal(result.safetyOutcomeEstablished, false);
  }
});

test("rejections are credited only for the injected known trace invariant", () => {
  const source = syntheticSource();
  const plan = createPhysicalSimulationFaultPlan({
    planId: "known-rejections-v1",
    source,
    cases: [{
      caseId: "missing-nonexistent-receipt",
      fault: "MISSING_RECEIPT",
      targetAttemptNn: 999,
    }],
  });
  const report = runPhysicalSimulationFaultPlan({ source, faultPlan: plan });
  assert.equal(report.results[0].faultApplied, false);
  assert.equal(report.results[0].classification,
    "NOT_OBSERVABLE_WITH_CURRENT_TRACE");
  assert.equal(report.results[0].traceAccepted, true);
});

test("report retains exact commitments but no source, projection, or error plaintext", () => {
  const source = syntheticSource();
  const plan = fullPlan(source);
  const report = runPhysicalSimulationFaultPlan({ source, faultPlan: plan });
  const encoded = JSON.stringify(report);

  for (const secret of [
    "Mia", "/private/Mia", "private prompt", "privateReceipt",
    "privateEvidence", "private planner reason", "synthetic-rollout-private-id",
  ]) assert.doesNotMatch(encoded, new RegExp(secret));
  assert.doesNotMatch(encoded, /HARNESS_VLA_TRACE_/);
  assert.match(report.control.projectionCommitment, /^sha256:[a-f0-9]{64}$/);
  assert.match(report.control.verificationCommitment, /^sha256:[a-f0-9]{64}$/);
});

test("closed schemas, frozen plans, hashes, and canonical replay reject tamper", () => {
  const source = syntheticSource();
  const plan = fullPlan(source);
  const report = runPhysicalSimulationFaultPlan({ source, faultPlan: plan });
  assert.deepEqual(verifyPhysicalSimulationFaultReport(report, {
    source, faultPlan: plan,
  }), {
    ok: true,
    reportHash: report.reportHash,
    planCommitment: report.planCommitment,
    sourceCommitment: report.control.sourceCommitment,
    controlAccepted: true,
    humanConfirmationRequests: 0,
    deviceCommands: 0,
    robotSafetyEstablished: false,
  });

  const tampered = structuredClone(report);
  tampered.results[0].classification = "NOT_OBSERVABLE_WITH_CURRENT_TRACE";
  assert.match(verifyPhysicalSimulationFaultReport(tampered, {
    source, faultPlan: plan,
  }).error, /RESULT_HASH_INVALID|REPORT_HASH_INVALID/);

  const extended = structuredClone(report);
  extended.rawSource = source;
  assert.match(verifyPhysicalSimulationFaultReport(extended, {
    source, faultPlan: plan,
  }).error, /REPORT_SHAPE_INVALID/);

  const unfrozenPlan = structuredClone(plan);
  assert.throws(() => runPhysicalSimulationFaultPlan({
    source, faultPlan: unfrozenPlan,
  }), /PLAN_NOT_DEEPLY_FROZEN/);

  const wrongSource = syntheticSource();
  wrongSource.rollout.seed = 18;
  assert.throws(() => runPhysicalSimulationFaultPlan({
    source: wrongSource, faultPlan: plan,
  }), /PLAN_SOURCE_BINDING_INVALID/);
});

test("fault runner source has no I/O, execution, network, process, or device dependency", () => {
  const code = readFileSync(new URL(
    "../src/outsider-physical-simulation-faults.js", import.meta.url), "utf8");
  assert.doesNotMatch(code,
    /from ["']node:(?:fs|child_process|net|http|https|dgram|worker_threads)/);
  assert.doesNotMatch(code, /\b(?:exec|execFile|spawn|fork|fetch)\s*\(/);
  assert.doesNotMatch(code, /\b(?:serialport|ros|websocket|bluetooth|usb)\b/i);
});

test("fault plan and report schemas are explicit v1 closed artifacts", () => {
  const source = syntheticSource();
  const plan = fullPlan(source);
  const report = runPhysicalSimulationFaultPlan({ source, faultPlan: plan });
  assert.equal(plan.schema, PHYSICAL_SIMULATION_FAULT_SCHEMAS.plan);
  assert.equal(plan.cases[0].schema, PHYSICAL_SIMULATION_FAULT_SCHEMAS.faultCase);
  assert.equal(report.schema, PHYSICAL_SIMULATION_FAULT_SCHEMAS.report);
  assert.equal(report.results[0].schema, PHYSICAL_SIMULATION_FAULT_SCHEMAS.result);

  const unknownCaseField = [{
    caseId: "unknown-field-case",
    fault: "CALIBRATION_DRIFT",
    targetAttemptNn: null,
    hiddenCommand: "execute-me",
  }];
  assert.throws(() => createPhysicalSimulationFaultPlan({
    planId: "bad-plan-v1", source, cases: unknownCaseField,
  }), /CASE_INPUT_SHAPE_INVALID/);
});

