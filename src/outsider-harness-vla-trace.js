/*
 * A pure, trace-only boundary for Harness VLA rollouts.
 *
 * This module deliberately has no filesystem, process, network, robot, or tool
 * imports.  It accepts an already supplied in-memory object (or JSON bytes),
 * validates the command/receipt/state sequence, and emits a privacy-minimal
 * evidence projection.  Parsing a command is never permission to execute it.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const HARNESS_VLA_TRACE_SCHEMAS = Object.freeze({
  source: "outsider/harness-vla-trace-source/v1",
  sourceProfile: "outsider/harness-vla-trace-source-profile/v1",
  rollout: "outsider/harness-vla-rollout/v1",
  observation: "outsider/harness-vla-observation/v1",
  attempt: "outsider/harness-vla-attempt/v1",
  command: "outsider/harness-vla-command/v1",
  receipt: "outsider/harness-vla-receipt/v1",
  postcondition: "outsider/harness-vla-primitive-postcondition/v1",
  done: "outsider/harness-vla-done-signal/v1",
  terminal: "outsider/harness-vla-terminal/v1",
  finalPredicate: "outsider/harness-vla-final-benchmark-predicate/v1",
  projection: "outsider/harness-vla-trace-projection/v1",
});

export const HARNESS_VLA_ANALYTIC_PRIMITIVES = Object.freeze([
  "MOVE_TO", "MOVE_POSE", "ROTATE_WRIST", "ROTATE_PITCH",
  "SET_GRIPPER", "RELEASE", "NAVIGATE_TO", "MOVE_BASE",
]);

export const HARNESS_VLA_PRIMITIVES = Object.freeze([
  ...HARNESS_VLA_ANALYTIC_PRIMITIVES, "VLA_ACT", "RESET",
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,255}$/;
const PRIMITIVES = new Set(HARNESS_VLA_PRIMITIVES);
const ANALYTIC = new Set(HARNESS_VLA_ANALYTIC_PRIMITIVES);
const COORDINATE_PRIMITIVES = new Set([
  "MOVE_TO", "MOVE_POSE", "NAVIGATE_TO", "MOVE_BASE",
]);
const RECEIPT_STATUSES = new Set(["EXECUTED", "FAILED", "REJECTED", "TIMED_OUT"]);
const VERDICTS = new Set(["PASS", "FAIL", "UNKNOWN"]);
const MODES = new Set(["EXPLORATION", "DEPLOYMENT", "REPLAY"]);
const CAPTURE_MODES = new Set(["MEMORY_SUPPLIED", "FIXTURE_SUPPLIED"]);
const TERMINAL_REASONS = new Set([
  "DONE", "FAILURE", "BUDGET_EXHAUSTED", "ABANDONED", "UNFINALIZED",
]);
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_OPAQUE_BYTES = 8 * 1024 * 1024;
const MAX_ATTEMPTS = 100_000;
const MAX_IMAGE_REFERENCES = 256;

function fail(code) {
  throw new Error(`HARNESS_VLA_TRACE_${code}`);
}

function plain(value) {
  return value != null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function requireShape(value, keys, code) {
  if (!exactKeys(value, keys)) fail(`${code}_SHAPE_INVALID`);
  return value;
}

function safeInteger(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function finiteNonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function requireHash(value, code) {
  if (!HASH.test(String(value ?? ""))) fail(`${code}_HASH_INVALID`);
  return value;
}

function requireIdentifier(value, code) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) fail(`${code}_INVALID`);
  return value;
}

function requireTimestamp(value, code) {
  if (typeof value !== "string" || !RFC3339.test(value)
    || !Number.isFinite(Date.parse(value))) fail(`${code}_INVALID`);
  return value;
}

function canonicalBytes(value, code, maximum = MAX_OPAQUE_BYTES) {
  let canonical;
  try { canonical = canonicalizeStrict(value); }
  catch { fail(`${code}_CANONICAL_VALUE_INVALID`); }
  if (Buffer.byteLength(canonical) > maximum) fail(`${code}_TOO_LARGE`);
  return canonical;
}

export function hashHarnessVlaTraceValue(value) {
  const input = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(input).digest("hex")}`;
}

function digestOpaque(value, code) {
  return hashHarnessVlaTraceValue(canonicalBytes(value, code));
}

function parseSuppliedSource(supplied) {
  if (Buffer.isBuffer(supplied) || typeof supplied === "string") {
    const bytes = Buffer.isBuffer(supplied) ? supplied : Buffer.from(supplied);
    if (bytes.length === 0 || bytes.length > MAX_SOURCE_BYTES) fail("SOURCE_SIZE_INVALID");
    try { return JSON.parse(bytes.toString("utf8")); }
    catch { fail("SOURCE_JSON_INVALID"); }
  }
  canonicalBytes(supplied, "SOURCE", MAX_SOURCE_BYTES);
  return supplied;
}

function validateRollout(value) {
  requireShape(value, [
    "schema", "rolloutId", "taskRef", "taskLanguage", "seed", "mode",
    "plannerReleaseHash", "vlaReleaseHash", "controllerReleaseHash",
    "capabilityRegistryReleaseHash", "primitiveJudgeReleaseHash",
    "finalJudgeReleaseHash", "memoryReleaseHash", "coordinateFrameReleaseHash",
    "calibrationReleaseHash", "budgets",
  ], "ROLLOUT");
  if (value.schema !== HARNESS_VLA_TRACE_SCHEMAS.rollout) fail("ROLLOUT_SCHEMA_INVALID");
  requireIdentifier(value.rolloutId, "ROLLOUT_ID");
  requireIdentifier(value.taskRef, "TASK_REF");
  if (typeof value.taskLanguage !== "string" || value.taskLanguage.length === 0
    || Buffer.byteLength(value.taskLanguage) > 128 * 1024) fail("TASK_LANGUAGE_INVALID");
  if (!safeInteger(value.seed) || !MODES.has(value.mode)) fail("ROLLOUT_IDENTITY_INVALID");
  for (const field of [
    "plannerReleaseHash", "vlaReleaseHash", "controllerReleaseHash",
    "capabilityRegistryReleaseHash", "primitiveJudgeReleaseHash",
    "finalJudgeReleaseHash", "memoryReleaseHash", "coordinateFrameReleaseHash",
    "calibrationReleaseHash",
  ]) requireHash(value[field], field.toUpperCase());
  requireShape(value.budgets,
    ["maxCommands", "maxVlaChunks", "maxRetries", "maxRiskUnits"], "BUDGETS");
  if (!safeInteger(value.budgets.maxCommands, { minimum: 1, maximum: MAX_ATTEMPTS })
    || !safeInteger(value.budgets.maxVlaChunks)
    || !safeInteger(value.budgets.maxRetries, { maximum: MAX_ATTEMPTS })
    || !finiteNonnegative(value.budgets.maxRiskUnits)) fail("BUDGETS_INVALID");
  return value;
}

function validateSourceProfile(value) {
  requireShape(value, [
    "schema", "captureMode", "protocolReleaseHash", "producerReleaseHash",
    "sourceClockAuthority", "sourceEventHashAuthority",
  ], "SOURCE_PROFILE");
  if (value.schema !== HARNESS_VLA_TRACE_SCHEMAS.sourceProfile
    || !CAPTURE_MODES.has(value.captureMode)
    || value.sourceClockAuthority !== "UNTRUSTED_SOURCE_CLAIM"
    || value.sourceEventHashAuthority !== "UNTRUSTED_SOURCE_CLAIM") {
    fail("SOURCE_PROFILE_INVALID");
  }
  requireHash(value.protocolReleaseHash, "SOURCE_PROTOCOL_RELEASE");
  requireHash(value.producerReleaseHash, "SOURCE_PRODUCER_RELEASE");
  return value;
}

function validateObservation(value, rollout, code = "OBSERVATION") {
  requireShape(value, [
    "schema", "observationId", "capturedAt", "coordinateFrameReleaseHash",
    "calibrationReleaseHash", "state", "imageReferences",
  ], code);
  if (value.schema !== HARNESS_VLA_TRACE_SCHEMAS.observation) fail(`${code}_SCHEMA_INVALID`);
  requireIdentifier(value.observationId, `${code}_ID`);
  requireTimestamp(value.capturedAt, `${code}_CAPTURED_AT`);
  requireHash(value.coordinateFrameReleaseHash, `${code}_COORDINATE_FRAME_RELEASE`);
  requireHash(value.calibrationReleaseHash, `${code}_CALIBRATION_RELEASE`);
  if (value.coordinateFrameReleaseHash !== rollout.coordinateFrameReleaseHash) {
    fail("COORDINATE_FRAME_DRIFT");
  }
  if (value.calibrationReleaseHash !== rollout.calibrationReleaseHash) {
    fail("CALIBRATION_DRIFT");
  }
  canonicalBytes(value.state, `${code}_STATE`);
  if (!Array.isArray(value.imageReferences)
    || value.imageReferences.length > MAX_IMAGE_REFERENCES
    || value.imageReferences.some((entry) => typeof entry !== "string"
      || entry.length === 0 || Buffer.byteLength(entry) > 1024 * 1024)) {
    fail(`${code}_IMAGE_REFERENCES_INVALID`);
  }
  return value;
}

function projectObservation(observation, nn) {
  return Object.freeze({
    nn,
    observationRef: hashHarnessVlaTraceValue({
      observationId: observation.observationId,
      capturedAt: observation.capturedAt,
    }),
    sourceObservationHash: hashHarnessVlaTraceValue(observation),
    stateHash: digestOpaque(observation.state, "OBSERVATION_STATE"),
    imageReferenceHashes: observation.imageReferences.map((reference) =>
      hashHarnessVlaTraceValue(reference)),
    imageReferenceCount: observation.imageReferences.length,
    capturedAtHash: hashHarnessVlaTraceValue(observation.capturedAt),
    coordinateFrameReleaseHash: observation.coordinateFrameReleaseHash,
    calibrationReleaseHash: observation.calibrationReleaseHash,
  });
}

function validateCoordinateBinding(binding, latestObservation, command) {
  if (binding == null) {
    if (COORDINATE_PRIMITIVES.has(command.primitive)) fail("COORDINATE_BINDING_REQUIRED");
    return null;
  }
  requireShape(binding, [
    "observationNn", "observationHash", "coordinateFrameReleaseHash",
    "calibrationReleaseHash",
  ], "COORDINATE_BINDING");
  if (!safeInteger(binding.observationNn)
    || !HASH.test(String(binding.observationHash ?? ""))
    || !HASH.test(String(binding.coordinateFrameReleaseHash ?? ""))
    || !HASH.test(String(binding.calibrationReleaseHash ?? ""))) {
    fail("COORDINATE_BINDING_INVALID");
  }
  if (!latestObservation
    || binding.observationNn !== latestObservation.nn
    || binding.observationHash !== latestObservation.sourceObservationHash) {
    fail("STALE_COORDINATE_BINDING");
  }
  if (binding.coordinateFrameReleaseHash !== latestObservation.coordinateFrameReleaseHash
    || binding.calibrationReleaseHash !== latestObservation.calibrationReleaseHash) {
    fail("COORDINATE_BINDING_RELEASE_DRIFT");
  }
  return binding;
}

function validateCommand(value, nn, rollout, latestObservation, attemptsByNn) {
  requireShape(value, [
    "schema", "nn", "commandId", "primitive", "parameters", "coordinateBinding",
    "retryOf", "capabilityRegistryReleaseHash", "capabilityBindingHash",
    "plannerReleaseHash",
  ], "COMMAND");
  if (value.schema !== HARNESS_VLA_TRACE_SCHEMAS.command) fail("COMMAND_SCHEMA_INVALID");
  if (value.nn !== nn) fail("COMMAND_NN_BINDING_INVALID");
  requireIdentifier(value.commandId, "COMMAND_ID");
  if (!PRIMITIVES.has(value.primitive)) fail("PRIMITIVE_UNSUPPORTED");
  if (value.capabilityRegistryReleaseHash !== rollout.capabilityRegistryReleaseHash) {
    fail("CAPABILITY_REGISTRY_DRIFT");
  }
  requireHash(value.capabilityBindingHash, "CAPABILITY_BINDING");
  if (value.plannerReleaseHash !== rollout.plannerReleaseHash) fail("PLANNER_RELEASE_DRIFT");
  canonicalBytes(value.parameters, "COMMAND_PARAMETERS");
  if (value.primitive === "VLA_ACT") {
    requireShape(value.parameters,
      ["prompt", "maxChunks", "stopPredicateReleaseHash"], "VLA_ACT_PARAMETERS");
    if (typeof value.parameters.prompt !== "string" || value.parameters.prompt.length === 0
      || Buffer.byteLength(value.parameters.prompt) > 128 * 1024
      || !safeInteger(value.parameters.maxChunks, { minimum: 1 })
      || value.parameters.maxChunks > rollout.budgets.maxVlaChunks) {
      fail("VLA_ACT_PARAMETERS_INVALID");
    }
    requireHash(value.parameters.stopPredicateReleaseHash, "VLA_ACT_STOP_PREDICATE_RELEASE");
  }
  validateCoordinateBinding(value.coordinateBinding, latestObservation, value);
  if (value.retryOf != null) {
    if (!safeInteger(value.retryOf, { minimum: 1 }) || value.retryOf >= nn) {
      fail("RETRY_REFERENCE_INVALID");
    }
    const original = attemptsByNn.get(value.retryOf);
    if (!original || original.command.primitive !== value.primitive) fail("RETRY_TARGET_INVALID");
  }
  return value;
}

function validateReceipt(value, nn, command, nextObservationHash) {
  requireShape(value, [
    "schema", "nn", "commandId", "primitive", "capabilityRegistryReleaseHash",
    "capabilityBindingHash", "status", "result", "usage", "nextObservationHash",
  ], "RECEIPT");
  if (value.schema !== HARNESS_VLA_TRACE_SCHEMAS.receipt) fail("RECEIPT_SCHEMA_INVALID");
  requireShape(value.usage, ["vlaChunks", "riskUnits"], "RECEIPT_USAGE");
  if (value.nn !== nn || value.commandId !== command.commandId
    || value.primitive !== command.primitive
    || value.capabilityRegistryReleaseHash !== command.capabilityRegistryReleaseHash
    || value.capabilityBindingHash !== command.capabilityBindingHash) {
    fail("RECEIPT_COMMAND_BINDING_INVALID");
  }
  if (!RECEIPT_STATUSES.has(value.status)
    || !safeInteger(value.usage.vlaChunks) || !finiteNonnegative(value.usage.riskUnits)) {
    fail("RECEIPT_INVALID");
  }
  if (command.primitive !== "VLA_ACT" && value.usage.vlaChunks !== 0) {
    fail("ANALYTIC_PRIMITIVE_VLA_USAGE_INVALID");
  }
  if (command.primitive === "VLA_ACT"
    && value.usage.vlaChunks > command.parameters.maxChunks) fail("VLA_CHUNK_LIMIT_EXCEEDED");
  canonicalBytes(value.result, "RECEIPT_RESULT");
  if (value.nextObservationHash !== nextObservationHash) {
    fail("RECEIPT_NEXT_STATE_BINDING_INVALID");
  }
  return value;
}

function validatePostcondition(value, nn, observationHash, rollout) {
  requireShape(value, [
    "schema", "nn", "observationHash", "judgeReleaseHash", "verdict", "evidence",
  ], "PRIMITIVE_POSTCONDITION");
  if (value.schema !== HARNESS_VLA_TRACE_SCHEMAS.postcondition) {
    fail("PRIMITIVE_POSTCONDITION_SCHEMA_INVALID");
  }
  if (value.nn !== nn || value.observationHash !== observationHash) {
    fail("PRIMITIVE_POSTCONDITION_OBSERVATION_BINDING_INVALID");
  }
  if (value.judgeReleaseHash !== rollout.primitiveJudgeReleaseHash) {
    fail("PRIMITIVE_JUDGE_DRIFT");
  }
  if (!VERDICTS.has(value.verdict)) fail("PRIMITIVE_POSTCONDITION_VERDICT_INVALID");
  canonicalBytes(value.evidence, "PRIMITIVE_POSTCONDITION_EVIDENCE");
  return value;
}

function validateDone(value, nn) {
  requireShape(value, ["schema", "nn", "reported", "reason"], "DONE_SIGNAL");
  if (value.schema !== HARNESS_VLA_TRACE_SCHEMAS.done) fail("DONE_SIGNAL_SCHEMA_INVALID");
  if (value.nn !== nn || typeof value.reported !== "boolean"
    || !(value.reason == null || typeof value.reason === "string")
    || (typeof value.reason === "string" && Buffer.byteLength(value.reason) > 128 * 1024)) {
    fail("DONE_SIGNAL_INVALID");
  }
  if (!value.reported && value.reason != null) fail("DONE_SIGNAL_REASON_WITHOUT_SIGNAL");
  return value;
}

function validateFinalPredicate(value, latestObservation, rollout) {
  if (value == null) return null;
  requireShape(value, [
    "schema", "observationHash", "judgeReleaseHash", "verdict", "evidence",
  ], "FINAL_BENCHMARK_PREDICATE");
  if (value.schema !== HARNESS_VLA_TRACE_SCHEMAS.finalPredicate) {
    fail("FINAL_BENCHMARK_PREDICATE_SCHEMA_INVALID");
  }
  if (!latestObservation || value.observationHash !== latestObservation.sourceObservationHash) {
    fail("FINAL_BENCHMARK_PREDICATE_OBSERVATION_BINDING_INVALID");
  }
  if (value.judgeReleaseHash !== rollout.finalJudgeReleaseHash) fail("FINAL_JUDGE_DRIFT");
  if (!VERDICTS.has(value.verdict)) fail("FINAL_BENCHMARK_PREDICATE_VERDICT_INVALID");
  canonicalBytes(value.evidence, "FINAL_BENCHMARK_PREDICATE_EVIDENCE");
  return value;
}

function terminalOutcome(finalPredicate) {
  if (finalPredicate?.verdict === "PASS") return "BENCHMARK_PASS";
  if (finalPredicate?.verdict === "FAIL") return "BENCHMARK_FAIL";
  return "UNRESOLVED";
}

function disposition(receipt, postcondition) {
  if (receipt.status !== "EXECUTED") return "EXECUTION_FAILURE";
  return ({ PASS: "POSTCONDITION_PASS", FAIL: "POSTCONDITION_FAIL",
    UNKNOWN: "POSTCONDITION_UNKNOWN" })[postcondition.verdict];
}

function primitiveClass(primitive) {
  if (ANALYTIC.has(primitive)) return "ANALYTIC";
  if (primitive === "VLA_ACT") return "FROZEN_VLA";
  return "CONTROL";
}

function projectCommand(command) {
  const projected = {
    commandRef: hashHarnessVlaTraceValue(command.commandId),
    primitive: command.primitive,
    primitiveClass: primitiveClass(command.primitive),
    parametersHash: digestOpaque(command.parameters, "COMMAND_PARAMETERS"),
    coordinateBinding: command.coordinateBinding == null ? null : {
      observationNn: command.coordinateBinding.observationNn,
      observationHash: command.coordinateBinding.observationHash,
      coordinateFrameReleaseHash: command.coordinateBinding.coordinateFrameReleaseHash,
      calibrationReleaseHash: command.coordinateBinding.calibrationReleaseHash,
    },
    retryOf: command.retryOf,
    capabilityRegistryReleaseHash: command.capabilityRegistryReleaseHash,
    capabilityBindingHash: command.capabilityBindingHash,
    plannerReleaseHash: command.plannerReleaseHash,
  };
  if (command.primitive === "VLA_ACT") {
    projected.vlaAct = {
      promptHash: hashHarnessVlaTraceValue(command.parameters.prompt),
      maxChunks: command.parameters.maxChunks,
      stopPredicateReleaseHash: command.parameters.stopPredicateReleaseHash,
    };
  } else projected.vlaAct = null;
  return projected;
}

function validateProjectionShape(projection) {
  requireShape(projection, [
    "schema", "sourceHash", "sourceProfile", "extractionPolicy", "rollout", "attempts",
    "terminal", "denominator", "privacy", "authority", "projectionHash",
  ], "PROJECTION");
  if (projection.schema !== HARNESS_VLA_TRACE_SCHEMAS.projection) {
    fail("PROJECTION_SCHEMA_INVALID");
  }
  requireHash(projection.sourceHash, "PROJECTION_SOURCE");
  requireHash(projection.projectionHash, "PROJECTION");
  if (!Array.isArray(projection.attempts)) fail("PROJECTION_ATTEMPTS_INVALID");
  return projection;
}

function projectionFromSource(rawSource) {
  const source = parseSuppliedSource(rawSource);
  requireShape(source,
    ["schema", "sourceProfile", "rollout", "initialObservation", "attempts", "terminal"],
    "SOURCE");
  if (source.schema !== HARNESS_VLA_TRACE_SCHEMAS.source) fail("SOURCE_SCHEMA_INVALID");
  const sourceProfile = validateSourceProfile(source.sourceProfile);
  const rollout = validateRollout(source.rollout);
  if (!(source.initialObservation == null || plain(source.initialObservation))) {
    fail("INITIAL_OBSERVATION_INVALID");
  }
  if (!Array.isArray(source.attempts) || source.attempts.length > MAX_ATTEMPTS) {
    fail("ATTEMPT_SET_INVALID");
  }
  if (source.initialObservation == null && source.attempts.length > 0) {
    fail("INITIAL_OBSERVATION_REQUIRED_FOR_ATTEMPTS");
  }
  if (source.attempts.length > rollout.budgets.maxCommands) fail("COMMAND_BUDGET_EXCEEDED");

  let latestObservation = source.initialObservation == null ? null
    : projectObservation(validateObservation(source.initialObservation, rollout,
      "INITIAL_OBSERVATION"), 0);
  const initialObservationProjection = latestObservation;
  const attemptsByNn = new Map();
  const projectedAttempts = [];
  const commandIds = new Set();
  let previousAttemptHash = null;
  let totalVlaChunks = 0;
  let totalRiskUnits = 0;
  let retryCount = 0;

  for (let index = 0; index < source.attempts.length; index += 1) {
    const attempt = source.attempts[index];
    requireShape(attempt, [
      "schema", "nn", "command", "receipt", "nextObservation",
      "primitivePostcondition", "done",
    ], "ATTEMPT");
    if (attempt.schema !== HARNESS_VLA_TRACE_SCHEMAS.attempt) fail("ATTEMPT_SCHEMA_INVALID");
    const expectedNn = index + 1;
    if (attempt.nn !== expectedNn) {
      fail(attemptsByNn.has(attempt.nn) ? "ATTEMPT_NN_DUPLICATE" : "ATTEMPT_NN_GAP");
    }
    const command = validateCommand(attempt.command, attempt.nn, rollout,
      latestObservation, attemptsByNn);
    if (commandIds.has(command.commandId)) fail("COMMAND_ID_DUPLICATE");
    commandIds.add(command.commandId);
    if (command.retryOf != null) retryCount += 1;

    const nextObservationSource = validateObservation(attempt.nextObservation, rollout,
      "NEXT_OBSERVATION");
    const nextObservation = projectObservation(nextObservationSource, attempt.nn);
    const receipt = validateReceipt(attempt.receipt, attempt.nn, command,
      nextObservation.sourceObservationHash);
    const postcondition = validatePostcondition(attempt.primitivePostcondition,
      attempt.nn, nextObservation.sourceObservationHash, rollout);
    const done = validateDone(attempt.done, attempt.nn);

    totalVlaChunks += receipt.usage.vlaChunks;
    totalRiskUnits += receipt.usage.riskUnits;
    if (totalVlaChunks > rollout.budgets.maxVlaChunks) fail("VLA_CHUNK_BUDGET_EXCEEDED");
    if (retryCount > rollout.budgets.maxRetries) fail("RETRY_BUDGET_EXCEEDED");
    if (totalRiskUnits > rollout.budgets.maxRiskUnits) fail("RISK_BUDGET_EXCEEDED");

    const commandProjection = projectCommand(command);
    const attemptBody = {
      nn: attempt.nn,
      attemptRef: hashHarnessVlaTraceValue({
        rolloutId: rollout.rolloutId, nn: attempt.nn, commandId: command.commandId,
      }),
      previousAttemptHash,
      command: commandProjection,
      receipt: {
        status: receipt.status,
        resultHash: digestOpaque(receipt.result, "RECEIPT_RESULT"),
        usage: { ...receipt.usage },
        nextObservationHash: receipt.nextObservationHash,
        exactCommandBindingVerified: true,
      },
      observation: nextObservation,
      primitivePostcondition: {
        verdict: postcondition.verdict,
        evidenceHash: digestOpaque(postcondition.evidence,
          "PRIMITIVE_POSTCONDITION_EVIDENCE"),
        judgeReleaseHash: postcondition.judgeReleaseHash,
        observationHash: postcondition.observationHash,
      },
      done: {
        reported: done.reported,
        reasonHash: done.reason == null ? null : hashHarnessVlaTraceValue(done.reason),
      },
      disposition: disposition(receipt, postcondition),
    };
    const projected = Object.freeze({ ...attemptBody,
      attemptHash: hashHarnessVlaTraceValue(attemptBody) });
    projectedAttempts.push(projected);
    previousAttemptHash = projected.attemptHash;
    latestObservation = nextObservation;
    attemptsByNn.set(attempt.nn, { command, projected });
  }

  requireShape(source.terminal,
    ["schema", "reason", "plannerReportedSuccess", "finalBenchmarkPredicate"], "TERMINAL");
  if (source.terminal.schema !== HARNESS_VLA_TRACE_SCHEMAS.terminal) {
    fail("TERMINAL_SCHEMA_INVALID");
  }
  if (!TERMINAL_REASONS.has(source.terminal.reason)
    || typeof source.terminal.plannerReportedSuccess !== "boolean") fail("TERMINAL_INVALID");
  const finalPredicate = validateFinalPredicate(source.terminal.finalBenchmarkPredicate,
    latestObservation, rollout);
  const atCommandBudget = projectedAttempts.length === rollout.budgets.maxCommands;
  const atChunkBudget = totalVlaChunks === rollout.budgets.maxVlaChunks;
  const atRetryBudget = retryCount === rollout.budgets.maxRetries;
  const atRiskBudget = totalRiskUnits === rollout.budgets.maxRiskUnits;
  if (source.terminal.reason === "BUDGET_EXHAUSTED"
    && !(atCommandBudget || atChunkBudget || atRetryBudget || atRiskBudget)) {
    fail("BUDGET_EXHAUSTION_UNSUPPORTED_BY_USAGE");
  }
  const finalOutcome = terminalOutcome(finalPredicate);
  const doneReported = projectedAttempts.some((attempt) => attempt.done.reported);
  const failedAttempts = projectedAttempts.filter((attempt) =>
    attempt.disposition !== "POSTCONDITION_PASS").length;
  const finalPredicateProjection = finalPredicate == null ? null : {
    verdict: finalPredicate.verdict,
    evidenceHash: digestOpaque(finalPredicate.evidence,
      "FINAL_BENCHMARK_PREDICATE_EVIDENCE"),
    judgeReleaseHash: finalPredicate.judgeReleaseHash,
    observationHash: finalPredicate.observationHash,
  };
  const plannerAgreement = finalOutcome === "UNRESOLVED" ? null
    : source.terminal.plannerReportedSuccess === (finalOutcome === "BENCHMARK_PASS");

  const body = {
    schema: HARNESS_VLA_TRACE_SCHEMAS.projection,
    sourceHash: hashHarnessVlaTraceValue(source),
    sourceProfile: {
      profileHash: hashHarnessVlaTraceValue(sourceProfile),
      captureMode: sourceProfile.captureMode,
      protocolReleaseHash: sourceProfile.protocolReleaseHash,
      producerReleaseHash: sourceProfile.producerReleaseHash,
      sourceClockAuthority: sourceProfile.sourceClockAuthority,
      sourceEventHashAuthority: sourceProfile.sourceEventHashAuthority,
    },
    extractionPolicy: {
      id: "outsider/harness-vla-trace-only-minimal-projection",
      version: "1.0.0",
      sequencePolicy: "CONTIGUOUS_MONOTONIC_NN_WITH_EXACT_COMMAND_RECEIPT_STATE_BINDING",
      retained: [
        "primitive-kind", "receipt-status", "postcondition-verdict", "done-signal",
        "final-predicate-verdict", "release-hashes", "usage", "content-hashes",
      ],
      removed: [
        "task-language", "prompts", "command-parameters", "receipt-results",
        "state-payloads", "judge-evidence", "raw-images", "raw-image-paths",
        "observation-identifiers", "done-reasons",
      ],
    },
    rollout: {
      rolloutRef: hashHarnessVlaTraceValue(rollout.rolloutId),
      taskRefHash: hashHarnessVlaTraceValue(rollout.taskRef),
      taskLanguageHash: hashHarnessVlaTraceValue(rollout.taskLanguage),
      seed: rollout.seed,
      mode: rollout.mode,
      releases: {
        planner: rollout.plannerReleaseHash,
        vla: rollout.vlaReleaseHash,
        controller: rollout.controllerReleaseHash,
        capabilityRegistry: rollout.capabilityRegistryReleaseHash,
        primitiveJudge: rollout.primitiveJudgeReleaseHash,
        finalJudge: rollout.finalJudgeReleaseHash,
        memory: rollout.memoryReleaseHash,
        coordinateFrame: rollout.coordinateFrameReleaseHash,
        calibration: rollout.calibrationReleaseHash,
      },
      budgets: { ...rollout.budgets },
      initialObservation: initialObservationProjection,
      attemptCount: projectedAttempts.length,
      finalAttemptHash: previousAttemptHash,
      attemptRootHash: hashHarnessVlaTraceValue(projectedAttempts.map((attempt) =>
        attempt.attemptHash)),
    },
    attempts: projectedAttempts,
    terminal: {
      reason: source.terminal.reason,
      lifecycleStatus: ({ DONE: "TERMINATED", FAILURE: "FAILED",
        BUDGET_EXHAUSTED: "BUDGET_EXHAUSTED", ABANDONED: "ABANDONED",
        UNFINALIZED: "UNFINALIZED" })[source.terminal.reason],
      doneReported,
      primitivePostconditionPassObserved: projectedAttempts.some((attempt) =>
        attempt.primitivePostcondition.verdict === "PASS"),
      plannerReportedSuccess: source.terminal.plannerReportedSuccess,
      finalBenchmarkPredicate: finalPredicateProjection,
      finalOutcome,
      plannerClaimAgreesWithFinalJudge: plannerAgreement,
      safetyPredicate: null,
      safetyOutcome: "NOT_EVALUATED_BY_TRACE_ADAPTER",
    },
    denominator: {
      suppliedRollouts: 1,
      projectedRollouts: 1,
      omittedRollouts: 0,
      suppliedEpisodes: 1,
      projectedEpisodes: 1,
      omittedEpisodes: 0,
      primitiveAttempts: projectedAttempts.length,
      commandReceipts: projectedAttempts.length,
      observations: (initialObservationProjection == null ? 0 : 1)
        + projectedAttempts.length,
      retries: retryCount,
      resets: projectedAttempts.filter((attempt) =>
        attempt.command.primitive === "RESET").length,
      failedOrUnknownAttempts: failedAttempts,
      benchmarkPass: finalOutcome === "BENCHMARK_PASS" ? 1 : 0,
      benchmarkFail: finalOutcome === "BENCHMARK_FAIL" ? 1 : 0,
      unresolved: finalOutcome === "UNRESOLVED" ? 1 : 0,
      budgetExhausted: source.terminal.reason === "BUDGET_EXHAUSTED" ? 1 : 0,
      abandoned: source.terminal.reason === "ABANDONED" ? 1 : 0,
      totalVlaChunks,
      totalRiskUnits,
    },
    privacy: {
      rawPathsRetained: false,
      rawImagesRetained: false,
      rawPromptsRetained: false,
      rawParametersRetained: false,
      rawStateRetained: false,
      rawEvidenceRetained: false,
      sensitiveReferencesAreHashOnly: true,
    },
    authority: {
      mode: "QUARANTINE_OBSERVATION_ONLY",
      readOnlyProjection: true,
      commandsExecuted: false,
      devicesAccessed: false,
      sourceProfileHash: hashHarnessVlaTraceValue(sourceProfile),
      sourceClockAuthoritative: false,
      sourceEventHashesAuthoritative: false,
      sourceCapabilityBindingsAuthoritative: false,
      outsiderCapabilityRegistryCoverageEstablished: false,
      plannerSelfReportAuthoritative: false,
      doneSignalIsFinalBenchmarkPredicate: false,
      primitivePostconditionIsFinalBenchmarkPredicate: false,
      finalBenchmarkPredicateAuthoritativeForBenchmarkOutcome: false,
      finalBenchmarkPredicateSourceBound: true,
      safetyOutcomeEstablished: false,
      benchmarkOutcomeIsExternalPhysicalOutcome: false,
      completeOnlyRelativeToSuppliedTrace: true,
      externalCensusAuthorityEstablished: false,
    },
  };
  return Object.freeze({ ...body, projectionHash: hashHarnessVlaTraceValue(body) });
}

export function createHarnessVlaTraceProjection({ source } = {}) {
  if (source === undefined) fail("SOURCE_REQUIRED");
  return projectionFromSource(source);
}

export function parseHarnessVlaTrace(source) {
  return projectionFromSource(source);
}

export function verifyHarnessVlaTraceProjection(projection, { source } = {}) {
  try {
    validateProjectionShape(projection);
    const { projectionHash, ...body } = projection;
    if (hashHarnessVlaTraceValue(body) !== projectionHash) fail("PROJECTION_HASH_INVALID");
    if (source === undefined) fail("SOURCE_REQUIRED_FOR_CANONICAL_REPLAY");
    const replayed = projectionFromSource(source);
    if (canonicalizeStrict(replayed) !== canonicalizeStrict(projection)) {
      fail("CANONICAL_REPLAY_MISMATCH");
    }
    return { ok: true, projectionHash, sourceHash: projection.sourceHash,
      sourceReplayed: true, commandsExecuted: false, devicesAccessed: false };
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
}
