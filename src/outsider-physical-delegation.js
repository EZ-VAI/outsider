import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const PHYSICAL_DELEGATION_ENVELOPE_SCHEMA =
  "outsider/physical-delegation-envelope/v1";
export const PHYSICAL_CAPABILITY_REFERENCE_SCHEMA =
  "outsider/physical-capability-reference/v1";
export const PRIMITIVE_ATTEMPT_SCHEMA = "outsider/primitive-attempt/v1";
export const MEMORY_PROPOSAL_SCHEMA = "outsider/physical-memory-proposal/v1";
export const MEMORY_RELEASE_SCHEMA = "outsider/physical-memory-release/v1";

export const PHYSICAL_OUTCOME_STATES = Object.freeze({
  primitiveStop: Object.freeze(["STOPPED", "NOT_STOPPED", "UNKNOWN"]),
  localPostcondition: Object.freeze(["SATISFIED", "NOT_SATISFIED", "UNKNOWN"]),
  taskOutcome: Object.freeze(["SUCCEEDED", "FAILED", "INCOMPLETE", "UNKNOWN"]),
  safetyOutcome: Object.freeze(["SAFE", "UNSAFE", "UNKNOWN"]),
});
export const PHYSICAL_EXTERNAL_AUTHORITY_REQUIREMENTS = Object.freeze([
  "AUTHORITY_RELEASE",
  "PHYSICAL_CAPABILITY_REGISTRY_RELEASES",
  "JUDGE_DEFINITION_SET_MEMBERSHIP",
  "JUDGE_INVOCATION_MANIFESTS",
  "GLOBAL_ATTEMPT_LINEAGE_AND_CENSUS",
]);

const HASH = /^sha256:[a-f0-9]{64}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/u;
const VERSIONED_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]*\/v[1-9][0-9]*$/u;
const COORDINATE_SOURCES = new Set([
  "NONE", "CURRENT_OBSERVATION", "CURRENT_LOCALIZATION", "MEMORY_REPLAY",
]);
const FIXED_MEMORY_AUTHORITY = Object.freeze({
  executionAuthority: "NONE_ADVISORY_ONLY",
  mayGrantCapabilities: false,
  mayExpandWorkspace: false,
  mayIncreaseActionLimits: false,
  mayIncreaseRiskBudget: false,
  mayIncreaseRetryBudget: false,
});

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`outsider:${domain}:v1\0`)
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

export function physicalDelegationCommitment(domain, value) {
  const label = String(domain ?? "").trim();
  if (!label) throw new TypeError("PHYSICAL_COMMITMENT_DOMAIN_REQUIRED");
  return digest(`physical-delegation:${label}`, value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function clone(value) {
  return JSON.parse(canonicalizeStrict(value));
}

function exactKeys(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return canonicalizeStrict(Object.keys(value).sort())
    === canonicalizeStrict([...keys].sort());
}

function rejectUnknownKeys(value, allowed, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label}_OBJECT_REQUIRED`);
  }
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) throw new TypeError(`${label}_UNKNOWN_FIELDS:${unknown.sort().join(",")}`);
}

function id(value, label, { versioned = false } = {}) {
  const result = String(value ?? "").trim();
  if (!(versioned ? VERSIONED_ID : ID).test(result)) {
    throw new TypeError(`${label}_INVALID`);
  }
  return result;
}

function primitiveId(value, label) {
  return id(value, label).toLowerCase();
}

function hash(value, label) {
  const result = String(value ?? "").toLowerCase();
  if (!HASH.test(result)) throw new TypeError(`${label}_INVALID`);
  return result;
}

function nullableHash(value, label) {
  return value == null ? null : hash(value, label);
}

function iso(value, label) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) throw new TypeError(`${label}_INVALID`);
  return new Date(timestamp).toISOString();
}

function finite(value, label, { minimum = 0, integer = false } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < minimum || (integer && !Number.isInteger(result))) {
    throw new TypeError(`${label}_INVALID`);
  }
  return result;
}

function bool(value, label) {
  if (typeof value !== "boolean") throw new TypeError(`${label}_INVALID`);
  return value;
}

function normalizedIds(values, label, { nonempty = false, versioned = false } = {}) {
  if (!Array.isArray(values)) throw new TypeError(`${label}_ARRAY_REQUIRED`);
  const result = [...new Set(values.map((item) => id(item, label, { versioned })))].sort();
  if (nonempty && !result.length) throw new TypeError(`${label}_EMPTY`);
  return result;
}

function normalizedPrimitiveIds(values, label, { nonempty = false } = {}) {
  if (!Array.isArray(values)) throw new TypeError(`${label}_ARRAY_REQUIRED`);
  const result = [...new Set(values.map((item) => primitiveId(item, label)))].sort();
  if (nonempty && !result.length) throw new TypeError(`${label}_EMPTY`);
  return result;
}

function safe(operation, errors, label) {
  try { return operation(); } catch (error) {
    errors.push(`${label}:${error?.message ?? error}`);
    return null;
  }
}

function capabilityReference(value) {
  /* registryHash identifies a separately verified physical-capability
     release. It intentionally does not claim that robot primitives are in
     Outsider's built-in Claude/Codex tool registry. Multiple references in
     one envelope may come from different physical registry releases. */
  if (!exactKeys(value, [
    "schema", "primitiveId", "registryHash", "capabilityId", "implementationHash",
    "embodimentId", "embodimentHash", "controllerId", "controllerVersion",
    "controllerImplementationHash", "checkpointId", "checkpointHash",
    "observationSchemaId", "observationSchemaHash", "calibrationId",
    "calibrationHash", "calibrationValidFrom", "calibrationValidUntil",
    "coordinateFrameId",
  ])) throw new TypeError("PHYSICAL_CAPABILITY_REFERENCE_FIELDS_INVALID");
  const normalized = {
    schema: String(value.schema ?? ""),
    primitiveId: primitiveId(value.primitiveId, "PHYSICAL_PRIMITIVE_ID"),
    registryHash: hash(value.registryHash, "PHYSICAL_CAPABILITY_REGISTRY_HASH"),
    capabilityId: id(value.capabilityId, "PHYSICAL_CAPABILITY_ID", { versioned: true }),
    implementationHash: hash(value.implementationHash,
      "PHYSICAL_CAPABILITY_IMPLEMENTATION_HASH"),
    embodimentId: id(value.embodimentId, "PHYSICAL_EMBODIMENT_ID"),
    embodimentHash: hash(value.embodimentHash, "PHYSICAL_EMBODIMENT_HASH"),
    controllerId: id(value.controllerId, "PHYSICAL_CONTROLLER_ID"),
    controllerVersion: id(value.controllerVersion, "PHYSICAL_CONTROLLER_VERSION"),
    controllerImplementationHash: hash(value.controllerImplementationHash,
      "PHYSICAL_CONTROLLER_IMPLEMENTATION_HASH"),
    checkpointId: id(value.checkpointId, "PHYSICAL_CHECKPOINT_ID"),
    checkpointHash: hash(value.checkpointHash, "PHYSICAL_CHECKPOINT_HASH"),
    observationSchemaId: id(value.observationSchemaId,
      "PHYSICAL_OBSERVATION_SCHEMA_ID", { versioned: true }),
    observationSchemaHash: hash(value.observationSchemaHash,
      "PHYSICAL_OBSERVATION_SCHEMA_HASH"),
    calibrationId: id(value.calibrationId, "PHYSICAL_CALIBRATION_ID"),
    calibrationHash: hash(value.calibrationHash, "PHYSICAL_CALIBRATION_HASH"),
    calibrationValidFrom: iso(value.calibrationValidFrom,
      "PHYSICAL_CALIBRATION_VALID_FROM"),
    calibrationValidUntil: iso(value.calibrationValidUntil,
      "PHYSICAL_CALIBRATION_VALID_UNTIL"),
    coordinateFrameId: id(value.coordinateFrameId, "PHYSICAL_COORDINATE_FRAME_ID"),
  };
  if (normalized.schema !== PHYSICAL_CAPABILITY_REFERENCE_SCHEMA) {
    throw new TypeError("PHYSICAL_CAPABILITY_REFERENCE_SCHEMA_INVALID");
  }
  if (Date.parse(normalized.calibrationValidUntil)
    <= Date.parse(normalized.calibrationValidFrom)) {
    throw new TypeError("PHYSICAL_CALIBRATION_WINDOW_INVALID");
  }
  return normalized;
}

function workspaceEnvelope(value) {
  if (!exactKeys(value, ["workspaceMapHash", "coordinateFrameId",
    "allowedRegionIds", "forbiddenRegionIds"])) {
    throw new TypeError("PHYSICAL_WORKSPACE_ENVELOPE_FIELDS_INVALID");
  }
  const normalized = {
    workspaceMapHash: hash(value.workspaceMapHash, "PHYSICAL_WORKSPACE_MAP_HASH"),
    coordinateFrameId: id(value.coordinateFrameId, "PHYSICAL_WORKSPACE_COORDINATE_FRAME"),
    allowedRegionIds: normalizedIds(value.allowedRegionIds,
      "PHYSICAL_ALLOWED_REGION", { nonempty: true }),
    forbiddenRegionIds: normalizedIds(value.forbiddenRegionIds, "PHYSICAL_FORBIDDEN_REGION"),
  };
  if (normalized.allowedRegionIds.some((region) =>
    normalized.forbiddenRegionIds.includes(region))) {
    throw new TypeError("PHYSICAL_WORKSPACE_REGION_CONFLICT");
  }
  return normalized;
}

function actionEnvelope(value) {
  if (!exactKeys(value, ["allowedPrimitiveIds", "prohibitedPrimitiveIds",
    "maxLinearSpeedMps", "maxAngularSpeedRadS", "maxRequestedContactForceN",
    "maxPrimitiveDurationMs", "maxObservationAgeMs"])) {
    throw new TypeError("PHYSICAL_ACTION_ENVELOPE_FIELDS_INVALID");
  }
  const normalized = {
    allowedPrimitiveIds: normalizedPrimitiveIds(value.allowedPrimitiveIds,
      "PHYSICAL_ALLOWED_PRIMITIVE", { nonempty: true }),
    prohibitedPrimitiveIds: normalizedPrimitiveIds(value.prohibitedPrimitiveIds,
      "PHYSICAL_PROHIBITED_PRIMITIVE"),
    maxLinearSpeedMps: finite(value.maxLinearSpeedMps, "PHYSICAL_MAX_LINEAR_SPEED"),
    maxAngularSpeedRadS: finite(value.maxAngularSpeedRadS,
      "PHYSICAL_MAX_ANGULAR_SPEED"),
    maxRequestedContactForceN: finite(value.maxRequestedContactForceN,
      "PHYSICAL_MAX_REQUESTED_CONTACT_FORCE"),
    maxPrimitiveDurationMs: finite(value.maxPrimitiveDurationMs,
      "PHYSICAL_MAX_PRIMITIVE_DURATION", { minimum: 1, integer: true }),
    maxObservationAgeMs: finite(value.maxObservationAgeMs,
      "PHYSICAL_MAX_OBSERVATION_AGE", { minimum: 1, integer: true }),
  };
  if (normalized.allowedPrimitiveIds.some((primitive) =>
    normalized.prohibitedPrimitiveIds.includes(primitive))) {
    throw new TypeError("PHYSICAL_ACTION_PRIMITIVE_CONFLICT");
  }
  return normalized;
}

function riskEnvelope(value) {
  if (!exactKeys(value, ["maxPerAttemptRiskUnits", "maxCumulativeRiskUnits",
    "maxObservedContactForceN", "maxPerAttemptEnergyJ", "maxCumulativeEnergyJ",
    "maxConsecutiveFailures"])) {
    throw new TypeError("PHYSICAL_RISK_ENVELOPE_FIELDS_INVALID");
  }
  const normalized = {
    maxPerAttemptRiskUnits: finite(value.maxPerAttemptRiskUnits,
      "PHYSICAL_MAX_PER_ATTEMPT_RISK"),
    maxCumulativeRiskUnits: finite(value.maxCumulativeRiskUnits,
      "PHYSICAL_MAX_CUMULATIVE_RISK"),
    maxObservedContactForceN: finite(value.maxObservedContactForceN,
      "PHYSICAL_MAX_OBSERVED_CONTACT_FORCE"),
    maxPerAttemptEnergyJ: finite(value.maxPerAttemptEnergyJ,
      "PHYSICAL_MAX_PER_ATTEMPT_ENERGY"),
    maxCumulativeEnergyJ: finite(value.maxCumulativeEnergyJ,
      "PHYSICAL_MAX_CUMULATIVE_ENERGY"),
    maxConsecutiveFailures: finite(value.maxConsecutiveFailures,
      "PHYSICAL_MAX_CONSECUTIVE_FAILURES", { integer: true }),
  };
  if (normalized.maxCumulativeRiskUnits < normalized.maxPerAttemptRiskUnits
    || normalized.maxCumulativeEnergyJ < normalized.maxPerAttemptEnergyJ) {
    throw new TypeError("PHYSICAL_CUMULATIVE_RISK_BELOW_PER_ATTEMPT");
  }
  return normalized;
}

function retryEnvelope(value) {
  if (!exactKeys(value, ["maxAttemptsPerPrimitive", "maxRetriesTotal", "resetAllowed"])) {
    throw new TypeError("PHYSICAL_RETRY_ENVELOPE_FIELDS_INVALID");
  }
  return {
    maxAttemptsPerPrimitive: finite(value.maxAttemptsPerPrimitive,
      "PHYSICAL_MAX_ATTEMPTS_PER_PRIMITIVE", { minimum: 1, integer: true }),
    maxRetriesTotal: finite(value.maxRetriesTotal,
      "PHYSICAL_MAX_RETRIES_TOTAL", { integer: true }),
    resetAllowed: bool(value.resetAllowed, "PHYSICAL_RESET_ALLOWED"),
  };
}

function judgeBindings(value) {
  if (!exactKeys(value, ["judgeDefinitionSetHash",
    "primitiveStopJudgeDefinitionHash", "localPostconditionJudgeDefinitionHash",
    "taskOutcomeJudgeDefinitionHash", "safetyOutcomeJudgeDefinitionHash"])) {
    throw new TypeError("PHYSICAL_JUDGE_BINDINGS_FIELDS_INVALID");
  }
  /* These are hashes of existing Outsider judge release artifacts, not hashes
     self-reported by a robot/planner and not invocation-result hashes.  This
     profile pins them and separates their roles. Invocation-specific
     manifest hashes belong to each outcome observation below, not this
     pre-action envelope. Membership of each
     definition in judgeDefinitionSetHash remains the responsibility of the
     existing judge-definition-set verifier at the contract boundary. */
  const normalized = {
    judgeDefinitionSetHash: hash(value.judgeDefinitionSetHash,
      "PHYSICAL_JUDGE_DEFINITION_SET_HASH"),
    primitiveStopJudgeDefinitionHash: hash(value.primitiveStopJudgeDefinitionHash,
      "PHYSICAL_PRIMITIVE_STOP_JUDGE_DEFINITION_HASH"),
    localPostconditionJudgeDefinitionHash: hash(value.localPostconditionJudgeDefinitionHash,
      "PHYSICAL_LOCAL_POSTCONDITION_JUDGE_DEFINITION_HASH"),
    taskOutcomeJudgeDefinitionHash: hash(value.taskOutcomeJudgeDefinitionHash,
      "PHYSICAL_TASK_OUTCOME_JUDGE_DEFINITION_HASH"),
    safetyOutcomeJudgeDefinitionHash: hash(value.safetyOutcomeJudgeDefinitionHash,
      "PHYSICAL_SAFETY_OUTCOME_JUDGE_DEFINITION_HASH"),
  };
  const roleHashes = [normalized.primitiveStopJudgeDefinitionHash,
    normalized.localPostconditionJudgeDefinitionHash,
    normalized.taskOutcomeJudgeDefinitionHash,
    normalized.safetyOutcomeJudgeDefinitionHash];
  if (new Set(roleHashes).size !== 4) {
    throw new TypeError("PHYSICAL_JUDGE_ROLES_MUST_BE_DISTINCT");
  }
  return normalized;
}

function memoryPolicy(value) {
  if (!exactKeys(value, ["independentApprovalRequired", "coordinatePolicy",
    "maxMemoryAgeMs", "mayGrantCapabilities", "mayExpandWorkspace",
    "mayIncreaseActionLimits", "mayIncreaseRiskBudget", "mayIncreaseRetryBudget"])) {
    throw new TypeError("PHYSICAL_MEMORY_POLICY_FIELDS_INVALID");
  }
  const normalized = {
    independentApprovalRequired: bool(value.independentApprovalRequired,
      "PHYSICAL_MEMORY_INDEPENDENT_APPROVAL"),
    coordinatePolicy: String(value.coordinatePolicy ?? ""),
    maxMemoryAgeMs: finite(value.maxMemoryAgeMs, "PHYSICAL_MAX_MEMORY_AGE",
      { minimum: 1, integer: true }),
    mayGrantCapabilities: bool(value.mayGrantCapabilities,
      "PHYSICAL_MEMORY_MAY_GRANT_CAPABILITIES"),
    mayExpandWorkspace: bool(value.mayExpandWorkspace,
      "PHYSICAL_MEMORY_MAY_EXPAND_WORKSPACE"),
    mayIncreaseActionLimits: bool(value.mayIncreaseActionLimits,
      "PHYSICAL_MEMORY_MAY_INCREASE_ACTION_LIMITS"),
    mayIncreaseRiskBudget: bool(value.mayIncreaseRiskBudget,
      "PHYSICAL_MEMORY_MAY_INCREASE_RISK_BUDGET"),
    mayIncreaseRetryBudget: bool(value.mayIncreaseRetryBudget,
      "PHYSICAL_MEMORY_MAY_INCREASE_RETRY_BUDGET"),
  };
  if (!normalized.independentApprovalRequired
    || normalized.coordinatePolicy !== "RELOCALIZE_FROM_CURRENT_OBSERVATION"
    || Object.entries(FIXED_MEMORY_AUTHORITY).some(([key, expected]) =>
      key !== "executionAuthority" && normalized[key] !== expected)) {
    throw new TypeError("PHYSICAL_MEMORY_POLICY_MUST_FAIL_CLOSED");
  }
  return normalized;
}

function envelopeBody(input) {
  rejectUnknownKeys(input, ["delegationId", "runId", "issuedAt", "validFrom", "validUntil",
    "authorityReleaseHash", "capabilityReferences", "workspaceEnvelope", "actionEnvelope",
    "riskEnvelope", "retryEnvelope", "judgeBindings", "memoryPolicy"],
  "PHYSICAL_DELEGATION_ENVELOPE_INPUT");
  if (!Array.isArray(input.capabilityReferences) || !input.capabilityReferences.length) {
    throw new TypeError("PHYSICAL_CAPABILITY_REFERENCES_REQUIRED");
  }
  const capabilities = input.capabilityReferences.map(capabilityReference)
    .sort((left, right) => left.primitiveId.localeCompare(right.primitiveId));
  if (new Set(capabilities.map((entry) => entry.primitiveId)).size !== capabilities.length) {
    throw new TypeError("PHYSICAL_CAPABILITY_PRIMITIVE_DUPLICATE");
  }
  const workspace = workspaceEnvelope(input.workspaceEnvelope);
  const actions = actionEnvelope(input.actionEnvelope);
  const capabilityPrimitiveIds = capabilities.map((entry) => entry.primitiveId);
  if (canonicalizeStrict(actions.allowedPrimitiveIds)
    !== canonicalizeStrict(capabilityPrimitiveIds)) {
    throw new TypeError("PHYSICAL_ALLOWED_PRIMITIVES_REQUIRE_EXACT_CAPABILITY_CLOSURE");
  }
  if (capabilities.some((entry) => entry.coordinateFrameId !== workspace.coordinateFrameId)) {
    throw new TypeError("PHYSICAL_CAPABILITY_COORDINATE_FRAME_MISMATCH");
  }
  const body = {
    schema: PHYSICAL_DELEGATION_ENVELOPE_SCHEMA,
    delegationId: id(input.delegationId, "PHYSICAL_DELEGATION_ID"),
    runId: id(input.runId, "PHYSICAL_RUN_ID"),
    issuedAt: iso(input.issuedAt, "PHYSICAL_ENVELOPE_ISSUED_AT"),
    validFrom: iso(input.validFrom, "PHYSICAL_ENVELOPE_VALID_FROM"),
    validUntil: iso(input.validUntil, "PHYSICAL_ENVELOPE_VALID_UNTIL"),
    authorityReleaseHash: hash(input.authorityReleaseHash,
      "PHYSICAL_AUTHORITY_RELEASE_HASH"),
    capabilityReferences: capabilities,
    workspaceEnvelope: workspace,
    actionEnvelope: actions,
    riskEnvelope: riskEnvelope(input.riskEnvelope),
    retryEnvelope: retryEnvelope(input.retryEnvelope),
    judgeBindings: judgeBindings(input.judgeBindings),
    memoryPolicy: memoryPolicy(input.memoryPolicy),
  };
  if (Date.parse(body.validUntil) <= Date.parse(body.validFrom)
    || Date.parse(body.issuedAt) > Date.parse(body.validFrom)) {
    throw new TypeError("PHYSICAL_ENVELOPE_TIME_WINDOW_INVALID");
  }
  return body;
}

export function createPhysicalDelegationEnvelope(input) {
  const body = envelopeBody(input);
  return deepFreeze({ ...body,
    envelopeHash: digest("physical-delegation-envelope", body) });
}

export function verifyPhysicalDelegationEnvelope(envelope, {
  expectedEnvelopeHash = null,
} = {}) {
  const errors = [];
  if (!exactKeys(envelope, ["schema", "delegationId", "runId", "issuedAt", "validFrom",
    "validUntil", "authorityReleaseHash", "capabilityReferences", "workspaceEnvelope",
    "actionEnvelope", "riskEnvelope", "retryEnvelope", "judgeBindings", "memoryPolicy",
    "envelopeHash"])) errors.push("physical delegation envelope fields invalid");
  let normalized = null;
  if (!errors.length) {
    const { schema: _schema, envelopeHash: _hash, ...input } = envelope;
    normalized = safe(() => createPhysicalDelegationEnvelope(input), errors,
      "physical delegation envelope normalization failed");
    if (normalized && canonicalizeStrict(normalized) !== canonicalizeStrict(envelope)) {
      errors.push("physical delegation envelope is not canonical or hash changed");
    }
  }
  if (expectedEnvelopeHash != null && envelope?.envelopeHash !== expectedEnvelopeHash) {
    errors.push("physical delegation envelope does not match expected hash");
  }
  return {
    ok: errors.length === 0,
    structurallyValid: errors.length === 0,
    errors,
    envelopeHash: envelope?.envelopeHash ?? null,
    authorizationEstablished: false,
    externalAuthorityRequirements: [...PHYSICAL_EXTERNAL_AUTHORITY_REQUIREMENTS],
  };
}

function observation(value) {
  if (!exactKeys(value, ["evidenceHash", "capturedAt", "observationSchemaHash",
    "calibrationHash", "coordinateFrameId"])) {
    throw new TypeError("PHYSICAL_OBSERVATION_FIELDS_INVALID");
  }
  return {
    evidenceHash: hash(value.evidenceHash, "PHYSICAL_OBSERVATION_EVIDENCE_HASH"),
    capturedAt: iso(value.capturedAt, "PHYSICAL_OBSERVATION_CAPTURED_AT"),
    observationSchemaHash: hash(value.observationSchemaHash,
      "PHYSICAL_ATTEMPT_OBSERVATION_SCHEMA_HASH"),
    calibrationHash: hash(value.calibrationHash, "PHYSICAL_ATTEMPT_CALIBRATION_HASH"),
    coordinateFrameId: id(value.coordinateFrameId, "PHYSICAL_ATTEMPT_COORDINATE_FRAME"),
  };
}

function command(value) {
  if (!exactKeys(value, ["commandHash", "targetRegionId", "coordinateSource",
    "coordinateObservationHash", "requestedLinearSpeedMps", "requestedAngularSpeedRadS",
    "requestedContactForceN", "requestedEnergyJ", "requestedDurationMs"])) {
    throw new TypeError("PHYSICAL_COMMAND_FIELDS_INVALID");
  }
  const source = String(value.coordinateSource ?? "").toUpperCase();
  if (!COORDINATE_SOURCES.has(source)) {
    throw new TypeError("PHYSICAL_COMMAND_COORDINATE_SOURCE_INVALID");
  }
  return {
    commandHash: hash(value.commandHash, "PHYSICAL_COMMAND_HASH"),
    targetRegionId: id(value.targetRegionId, "PHYSICAL_COMMAND_TARGET_REGION"),
    coordinateSource: source,
    coordinateObservationHash: nullableHash(value.coordinateObservationHash,
      "PHYSICAL_COMMAND_COORDINATE_OBSERVATION_HASH"),
    requestedLinearSpeedMps: finite(value.requestedLinearSpeedMps,
      "PHYSICAL_REQUESTED_LINEAR_SPEED"),
    requestedAngularSpeedRadS: finite(value.requestedAngularSpeedRadS,
      "PHYSICAL_REQUESTED_ANGULAR_SPEED"),
    requestedContactForceN: finite(value.requestedContactForceN,
      "PHYSICAL_REQUESTED_CONTACT_FORCE"),
    requestedEnergyJ: finite(value.requestedEnergyJ, "PHYSICAL_REQUESTED_ENERGY"),
    requestedDurationMs: finite(value.requestedDurationMs,
      "PHYSICAL_REQUESTED_DURATION", { minimum: 1, integer: true }),
  };
}

function outcome(value, label, states) {
  /* The definition hash is the stable role/version pin; the manifest hash is
     the invocation-specific closure. This profile binds both. The existing
     judge verifier must still establish manifest integrity and definition-set
     membership before an integration treats the observation as authoritative. */
  if (!exactKeys(value, ["state", "judgeDefinitionHash", "judgeManifestHash",
    "evidenceHash", "observedAt"])) {
    throw new TypeError(`${label}_FIELDS_INVALID`);
  }
  const state = String(value.state ?? "").toUpperCase();
  if (!states.includes(state)) throw new TypeError(`${label}_STATE_INVALID`);
  const evidenceHash = nullableHash(value.evidenceHash, `${label}_EVIDENCE_HASH`);
  if ((state === "UNKNOWN") !== (evidenceHash == null)) {
    throw new TypeError(`${label}_UNKNOWN_EVIDENCE_CONSISTENCY_INVALID`);
  }
  return {
    state,
    judgeDefinitionHash: hash(value.judgeDefinitionHash,
      `${label}_JUDGE_DEFINITION_HASH`),
    judgeManifestHash: hash(value.judgeManifestHash, `${label}_JUDGE_MANIFEST_HASH`),
    evidenceHash,
    observedAt: iso(value.observedAt, `${label}_OBSERVED_AT`),
  };
}

function execution(value) {
  if (!exactKeys(value, ["startedAt", "stoppedAt", "receiptHash", "primitiveStop"])) {
    throw new TypeError("PHYSICAL_EXECUTION_FIELDS_INVALID");
  }
  const normalized = {
    startedAt: iso(value.startedAt, "PHYSICAL_EXECUTION_STARTED_AT"),
    stoppedAt: iso(value.stoppedAt, "PHYSICAL_EXECUTION_STOPPED_AT"),
    receiptHash: hash(value.receiptHash, "PHYSICAL_EXECUTION_RECEIPT_HASH"),
    primitiveStop: outcome(value.primitiveStop, "PHYSICAL_PRIMITIVE_STOP",
      PHYSICAL_OUTCOME_STATES.primitiveStop),
  };
  if (Date.parse(normalized.stoppedAt) < Date.parse(normalized.startedAt)) {
    throw new TypeError("PHYSICAL_EXECUTION_TIME_ORDER_INVALID");
  }
  return normalized;
}

function riskObservation(value) {
  if (!exactKeys(value, ["riskUnits", "peakContactForceN", "energyJ"])) {
    throw new TypeError("PHYSICAL_RISK_OBSERVATION_FIELDS_INVALID");
  }
  return {
    riskUnits: finite(value.riskUnits, "PHYSICAL_ATTEMPT_RISK_UNITS"),
    peakContactForceN: finite(value.peakContactForceN,
      "PHYSICAL_ATTEMPT_PEAK_CONTACT_FORCE"),
    energyJ: finite(value.energyJ, "PHYSICAL_ATTEMPT_ENERGY"),
  };
}

function priorAttemptsForEnvelope(priorAttempts, envelope) {
  if (!Array.isArray(priorAttempts)) throw new TypeError("PHYSICAL_PRIOR_ATTEMPTS_ARRAY_REQUIRED");
  const seen = new Set();
  for (let index = 0; index < priorAttempts.length; index += 1) {
    const attempt = priorAttempts[index];
    const expectedPriorHashes = priorAttempts.slice(0, index)
      .map((entry) => entry.attemptHash);
    const body = attempt && typeof attempt === "object"
      ? Object.fromEntries(Object.entries(attempt).filter(([key]) => key !== "attemptHash"))
      : null;
    if (attempt?.schema !== PRIMITIVE_ATTEMPT_SCHEMA || !HASH.test(attempt?.attemptHash)
      || attempt.envelopeHash !== envelope.envelopeHash
      || attempt.delegationId !== envelope.delegationId || seen.has(attempt.attemptHash)
      || !exactAttemptFields(attempt) || digest("primitive-attempt", body) !== attempt.attemptHash
      || attempt.attemptOrdinal !== index + 1
      || canonicalizeStrict(attempt.lineage?.priorAttemptHashes)
        !== canonicalizeStrict(expectedPriorHashes)) {
      throw new TypeError("PHYSICAL_PRIOR_ATTEMPT_INVALID");
    }
    seen.add(attempt.attemptHash);
  }
  return priorAttempts;
}

function attemptPolicy(envelope, priorAttempts, attempt) {
  const reasons = [];
  const capability = envelope.capabilityReferences.find((entry) =>
    entry.primitiveId === attempt.primitiveId);
  if (!capability || canonicalizeStrict(capability) !== canonicalizeStrict(attempt.capabilityReference)) {
    reasons.push("CAPABILITY_REFERENCE_NOT_IN_FROZEN_ENVELOPE");
  }
  const commandAt = Date.parse(attempt.commandedAt);
  const observedAt = Date.parse(attempt.observation.capturedAt);
  const executionTimes = [attempt.execution.startedAt, attempt.execution.stoppedAt]
    .map(Date.parse);
  const judgeObservationTimes = [attempt.execution.primitiveStop,
    attempt.localPostcondition, attempt.taskOutcome, attempt.safetyOutcome]
    .map((entry) => Date.parse(entry.observedAt));
  const delegationFrom = Date.parse(envelope.validFrom);
  const delegationUntil = Date.parse(envelope.validUntil);
  if (commandAt < Date.parse(envelope.validFrom) || commandAt > Date.parse(envelope.validUntil)) {
    reasons.push("DELEGATION_ENVELOPE_NOT_CURRENT");
  }
  if (executionTimes.some((time) => time < delegationFrom || time > delegationUntil)) {
    reasons.push("EXECUTION_OUTSIDE_DELEGATION_WINDOW");
  }
  if (judgeObservationTimes.some((time) => time < delegationFrom || time > delegationUntil)) {
    reasons.push("JUDGE_OBSERVATION_OUTSIDE_DELEGATION_WINDOW");
  }
  if (capability && (commandAt < Date.parse(capability.calibrationValidFrom)
    || commandAt > Date.parse(capability.calibrationValidUntil))) {
    reasons.push("CALIBRATION_STALE_OR_NOT_YET_VALID");
  }
  if (capability) {
    const calibrationFrom = Date.parse(capability.calibrationValidFrom);
    const calibrationUntil = Date.parse(capability.calibrationValidUntil);
    if (observedAt < calibrationFrom || observedAt > calibrationUntil) {
      reasons.push("OBSERVATION_OUTSIDE_CALIBRATION_WINDOW");
    }
    if (executionTimes.some((time) => time < calibrationFrom || time > calibrationUntil)) {
      reasons.push("EXECUTION_OUTSIDE_CALIBRATION_WINDOW");
    }
    if (judgeObservationTimes.some((time) => time < calibrationFrom || time > calibrationUntil)) {
      reasons.push("JUDGE_OBSERVATION_OUTSIDE_CALIBRATION_WINDOW");
    }
  }
  if (observedAt > commandAt
    || commandAt - observedAt > envelope.actionEnvelope.maxObservationAgeMs) {
    reasons.push("OBSERVATION_STALE_OR_FROM_FUTURE");
  }
  if (capability && attempt.observation.observationSchemaHash
    !== capability.observationSchemaHash) reasons.push("OBSERVATION_SCHEMA_DRIFT");
  if (capability && attempt.observation.calibrationHash
    !== capability.calibrationHash) reasons.push("CALIBRATION_HASH_DRIFT");
  if (attempt.observation.coordinateFrameId !== envelope.workspaceEnvelope.coordinateFrameId
    || (capability && attempt.observation.coordinateFrameId !== capability.coordinateFrameId)) {
    reasons.push("COORDINATE_FRAME_DRIFT");
  }
  if (!envelope.workspaceEnvelope.allowedRegionIds.includes(attempt.command.targetRegionId)
    || envelope.workspaceEnvelope.forbiddenRegionIds.includes(attempt.command.targetRegionId)) {
    reasons.push("TARGET_OUTSIDE_WORKSPACE_ENVELOPE");
  }
  if (!envelope.actionEnvelope.allowedPrimitiveIds.includes(attempt.primitiveId)
    || envelope.actionEnvelope.prohibitedPrimitiveIds.includes(attempt.primitiveId)) {
    reasons.push("PRIMITIVE_NOT_AUTHORIZED");
  }
  if (attempt.primitiveId === "reset" && !envelope.retryEnvelope.resetAllowed) {
    reasons.push("RESET_NOT_ALLOWED");
  }
  if (attempt.command.requestedLinearSpeedMps > envelope.actionEnvelope.maxLinearSpeedMps) {
    reasons.push("LINEAR_SPEED_LIMIT_EXCEEDED");
  }
  if (attempt.command.requestedAngularSpeedRadS > envelope.actionEnvelope.maxAngularSpeedRadS) {
    reasons.push("ANGULAR_SPEED_LIMIT_EXCEEDED");
  }
  if (attempt.command.requestedContactForceN
    > envelope.actionEnvelope.maxRequestedContactForceN) {
    reasons.push("REQUESTED_CONTACT_FORCE_LIMIT_EXCEEDED");
  }
  if (attempt.command.requestedDurationMs > envelope.actionEnvelope.maxPrimitiveDurationMs) {
    reasons.push("PRIMITIVE_DURATION_LIMIT_EXCEEDED");
  }
  if (executionTimes[1] - executionTimes[0]
    > envelope.actionEnvelope.maxPrimitiveDurationMs) {
    reasons.push("ACTUAL_PRIMITIVE_DURATION_LIMIT_EXCEEDED");
  }
  if (attempt.command.requestedEnergyJ > envelope.riskEnvelope.maxPerAttemptEnergyJ) {
    reasons.push("REQUESTED_ENERGY_LIMIT_EXCEEDED");
  }
  if (attempt.command.coordinateSource === "MEMORY_REPLAY") {
    reasons.push("MEMORY_COORDINATE_REPLAY_FORBIDDEN");
  }
  if (attempt.command.coordinateSource === "NONE"
    && attempt.command.coordinateObservationHash != null) {
    reasons.push("COORDINATE_EVIDENCE_UNEXPECTED");
  }
  if (["CURRENT_OBSERVATION", "CURRENT_LOCALIZATION"].includes(
    attempt.command.coordinateSource)
    && attempt.command.coordinateObservationHash !== attempt.observation.evidenceHash) {
    reasons.push("COORDINATE_NOT_RELOCALIZED_FROM_CURRENT_OBSERVATION");
  }
  if (attempt.risk.perAttemptRiskUnits > envelope.riskEnvelope.maxPerAttemptRiskUnits) {
    reasons.push("PER_ATTEMPT_RISK_BUDGET_EXCEEDED");
  }
  if (attempt.risk.cumulativeRiskUnits > envelope.riskEnvelope.maxCumulativeRiskUnits) {
    reasons.push("CUMULATIVE_RISK_BUDGET_EXCEEDED");
  }
  if (attempt.risk.peakContactForceN > envelope.riskEnvelope.maxObservedContactForceN) {
    reasons.push("OBSERVED_CONTACT_FORCE_LIMIT_EXCEEDED");
  }
  if (attempt.risk.perAttemptEnergyJ > envelope.riskEnvelope.maxPerAttemptEnergyJ) {
    reasons.push("PER_ATTEMPT_ENERGY_BUDGET_EXCEEDED");
  }
  if (attempt.risk.cumulativeEnergyJ > envelope.riskEnvelope.maxCumulativeEnergyJ) {
    reasons.push("CUMULATIVE_ENERGY_BUDGET_EXCEEDED");
  }
  const samePrimitive = priorAttempts.filter((entry) =>
    entry.primitiveId === attempt.primitiveId).length + 1;
  if (samePrimitive > envelope.retryEnvelope.maxAttemptsPerPrimitive) {
    reasons.push("MAX_ATTEMPTS_PER_PRIMITIVE_EXCEEDED");
  }
  const retryCount = priorAttempts.filter((entry) =>
    entry.lineage.retryOfAttemptHash != null).length
    + (attempt.lineage.retryOfAttemptHash == null ? 0 : 1);
  if (retryCount > envelope.retryEnvelope.maxRetriesTotal) {
    reasons.push("TOTAL_RETRY_BUDGET_EXCEEDED");
  }
  let consecutiveFailures = 0;
  for (const entry of [...priorAttempts, attempt].toReversed()) {
    if (entry.taskOutcome.state === "SUCCEEDED"
      && entry.safetyOutcome.state === "SAFE") break;
    consecutiveFailures += 1;
  }
  if (consecutiveFailures > envelope.riskEnvelope.maxConsecutiveFailures) {
    reasons.push("MAX_CONSECUTIVE_FAILURES_EXCEEDED");
  }
  if (attempt.taskOutcome.state === "SUCCEEDED"
    && (attempt.execution.primitiveStop.state !== "STOPPED"
      || attempt.localPostcondition.state !== "SATISFIED"
      || attempt.safetyOutcome.state !== "SAFE")) {
    reasons.push("FALSE_COMPLETION_OUTCOME_CONTRADICTION");
  }
  return [...new Set(reasons)].sort();
}

function resultDisposition(conformance, attempt) {
  if (conformance.state !== "WITHIN_ENVELOPE" || attempt.safetyOutcome.state === "UNSAFE") {
    return "BLOCKED";
  }
  if (attempt.safetyOutcome.state === "UNKNOWN"
    || attempt.execution.primitiveStop.state !== "STOPPED"
    || attempt.localPostcondition.state === "UNKNOWN") return "HOLD";
  if (attempt.localPostcondition.state === "NOT_SATISFIED") return "RETRY_REQUIRED";
  if (attempt.taskOutcome.state === "SUCCEEDED") {
    return "STRUCTURAL_SAFE_SUCCESS_UNVERIFIED_AUTHORITY";
  }
  if (attempt.taskOutcome.state === "FAILED") return "TASK_FAILED";
  if (attempt.taskOutcome.state === "INCOMPLETE") return "CONTINUE";
  return "HOLD";
}

function attemptShape(input, envelope, priorAttempts) {
  rejectUnknownKeys(input, ["attemptId", "primitiveId", "commandedAt", "observation",
    "command", "execution", "localPostcondition", "taskOutcome", "safetyOutcome", "risk",
    "retryOfAttemptHash", "memoryReleaseHash"], "PHYSICAL_PRIMITIVE_ATTEMPT_INPUT");
  const normalizedPrimitiveId = primitiveId(input.primitiveId,
    "PHYSICAL_ATTEMPT_PRIMITIVE_ID");
  const capability = envelope.capabilityReferences.find((entry) =>
    entry.primitiveId === normalizedPrimitiveId);
  if (!capability) throw new TypeError("PHYSICAL_ATTEMPT_CAPABILITY_NOT_IN_ENVELOPE");
  const normalizedRisk = riskObservation(input.risk);
  const retryOfAttemptHash = nullableHash(input.retryOfAttemptHash,
    "PHYSICAL_RETRY_OF_ATTEMPT_HASH");
  const retryTarget = retryOfAttemptHash == null ? null
    : priorAttempts.find((entry) => entry.attemptHash === retryOfAttemptHash);
  if (retryOfAttemptHash != null
    && (!retryTarget || retryTarget.primitiveId !== normalizedPrimitiveId)) {
    throw new TypeError("PHYSICAL_RETRY_TARGET_INVALID");
  }
  const retryIndex = retryTarget == null ? 0
    : priorAttempts.filter((entry) => entry.primitiveId === normalizedPrimitiveId
      && entry.lineage.retryOfAttemptHash != null).length + 1;
  const body = {
    schema: PRIMITIVE_ATTEMPT_SCHEMA,
    attemptId: id(input.attemptId, "PHYSICAL_ATTEMPT_ID"),
    delegationId: envelope.delegationId,
    runId: envelope.runId,
    envelopeHash: envelope.envelopeHash,
    attemptOrdinal: priorAttempts.length + 1,
    primitiveId: normalizedPrimitiveId,
    capabilityReference: clone(capability),
    commandedAt: iso(input.commandedAt, "PHYSICAL_ATTEMPT_COMMANDED_AT"),
    observation: observation(input.observation),
    command: command(input.command),
    execution: execution(input.execution),
    localPostcondition: outcome(input.localPostcondition,
      "PHYSICAL_LOCAL_POSTCONDITION", PHYSICAL_OUTCOME_STATES.localPostcondition),
    taskOutcome: outcome(input.taskOutcome,
      "PHYSICAL_TASK_OUTCOME", PHYSICAL_OUTCOME_STATES.taskOutcome),
    safetyOutcome: outcome(input.safetyOutcome,
      "PHYSICAL_SAFETY_OUTCOME", PHYSICAL_OUTCOME_STATES.safetyOutcome),
    risk: {
      perAttemptRiskUnits: normalizedRisk.riskUnits,
      cumulativeRiskUnits: priorAttempts.reduce((sum, entry) =>
        sum + entry.risk.perAttemptRiskUnits, normalizedRisk.riskUnits),
      peakContactForceN: normalizedRisk.peakContactForceN,
      perAttemptEnergyJ: normalizedRisk.energyJ,
      cumulativeEnergyJ: priorAttempts.reduce((sum, entry) =>
        sum + entry.risk.perAttemptEnergyJ, normalizedRisk.energyJ),
    },
    lineage: {
      priorAttemptHashes: priorAttempts.map((entry) => entry.attemptHash),
      retryOfAttemptHash,
      retryIndex,
      lineageCompleteOnlyRelativeToSuppliedPrefix: true,
    },
    memoryReleaseHash: nullableHash(input.memoryReleaseHash,
      "PHYSICAL_ATTEMPT_MEMORY_RELEASE_HASH"),
    memoryReleaseAuthority: null,
    envelopeConformance: null,
    resultDisposition: null,
  };
  if (Date.parse(body.execution.startedAt) < Date.parse(body.commandedAt)
    || Date.parse(body.execution.primitiveStop.observedAt) < Date.parse(body.execution.stoppedAt)
    || [body.localPostcondition, body.taskOutcome, body.safetyOutcome].some((entry) =>
      Date.parse(entry.observedAt) < Date.parse(body.execution.stoppedAt))) {
    throw new TypeError("PHYSICAL_ATTEMPT_EVENT_TIME_ORDER_INVALID");
  }
  if (body.execution.primitiveStop.judgeDefinitionHash
      !== envelope.judgeBindings.primitiveStopJudgeDefinitionHash
    || body.localPostcondition.judgeDefinitionHash
      !== envelope.judgeBindings.localPostconditionJudgeDefinitionHash
    || body.taskOutcome.judgeDefinitionHash
      !== envelope.judgeBindings.taskOutcomeJudgeDefinitionHash
    || body.safetyOutcome.judgeDefinitionHash
      !== envelope.judgeBindings.safetyOutcomeJudgeDefinitionHash) {
    throw new TypeError("PHYSICAL_ATTEMPT_JUDGE_BINDING_DRIFT");
  }
  body.memoryReleaseAuthority = {
    status: body.memoryReleaseHash == null ? "NOT_PRESENT" : "CLAIM_ONLY_UNVERIFIED",
    executionAuthorityEstablished: false,
  };
  const reasons = attemptPolicy(envelope, priorAttempts, body);
  body.envelopeConformance = {
    state: reasons.length ? "OUTSIDE_ENVELOPE" : "WITHIN_ENVELOPE",
    reasonCodes: reasons,
  };
  body.resultDisposition = resultDisposition(body.envelopeConformance, body);
  return body;
}

export function createPrimitiveAttempt({ envelope, priorAttempts = [], ...input }) {
  const envelopeVerified = verifyPhysicalDelegationEnvelope(envelope, {
    expectedEnvelopeHash: envelope?.envelopeHash,
  });
  if (!envelopeVerified.ok) {
    throw new TypeError(`PHYSICAL_ENVELOPE_INVALID:${envelopeVerified.errors.join(";")}`);
  }
  const prior = priorAttemptsForEnvelope(priorAttempts, envelope);
  const body = attemptShape(input, envelope, prior);
  return deepFreeze({ ...body, attemptHash: digest("primitive-attempt", body) });
}

function exactAttemptFields(attempt) {
  return exactKeys(attempt, ["schema", "attemptId", "delegationId", "runId", "envelopeHash",
    "attemptOrdinal", "primitiveId", "capabilityReference", "commandedAt", "observation",
    "command", "execution", "localPostcondition", "taskOutcome", "safetyOutcome", "risk",
    "lineage", "memoryReleaseHash", "memoryReleaseAuthority", "envelopeConformance",
    "resultDisposition", "attemptHash"]);
}

/* This is deliberately a trace-only structural verifier. `priorAttempts` is
   just the prefix supplied by the caller; this module cannot prove that the
   global attempt census has no omitted members. It also does not verify the
   authority release, physical registry releases, definition-set membership,
   or invocation manifests. Consequently it never returns execution
   authorization, even for a structurally successful attempt. */
export function verifyPrimitiveAttempt(attempt, {
  envelope,
  priorAttempts = [],
  expectedAttemptHash = null,
} = {}) {
  const errors = [];
  const envelopeVerified = verifyPhysicalDelegationEnvelope(envelope, {
    expectedEnvelopeHash: attempt?.envelopeHash,
  });
  if (!envelopeVerified.ok) errors.push(...envelopeVerified.errors);
  if (!exactAttemptFields(attempt)) errors.push("primitive attempt fields invalid");
  let normalized = null;
  if (!errors.length) {
    safe(() => priorAttemptsForEnvelope(priorAttempts, envelope), errors,
      "primitive prior attempt validation failed");
    normalized = safe(() => createPrimitiveAttempt({
      envelope,
      priorAttempts,
      attemptId: attempt.attemptId,
      primitiveId: attempt.primitiveId,
      commandedAt: attempt.commandedAt,
      observation: attempt.observation,
      command: attempt.command,
      execution: attempt.execution,
      localPostcondition: attempt.localPostcondition,
      taskOutcome: attempt.taskOutcome,
      safetyOutcome: attempt.safetyOutcome,
      risk: {
        riskUnits: attempt.risk?.perAttemptRiskUnits,
        peakContactForceN: attempt.risk?.peakContactForceN,
        energyJ: attempt.risk?.perAttemptEnergyJ,
      },
      retryOfAttemptHash: attempt.lineage?.retryOfAttemptHash,
      memoryReleaseHash: attempt.memoryReleaseHash,
    }), errors, "primitive attempt normalization failed");
    if (normalized && canonicalizeStrict(normalized) !== canonicalizeStrict(attempt)) {
      errors.push("primitive attempt is not canonical, lineage changed, or hash changed");
    }
  }
  if (expectedAttemptHash != null && attempt?.attemptHash !== expectedAttemptHash) {
    errors.push("primitive attempt does not match expected hash");
  }
  return {
    ok: errors.length === 0,
    errors,
    structurallyWithinEnvelope: errors.length === 0
      && attempt?.envelopeConformance?.state === "WITHIN_ENVELOPE",
    authorizationEstablished: false,
    externalAuthorityRequirements: [...PHYSICAL_EXTERNAL_AUTHORITY_REQUIREMENTS],
    lineageCompleteOnlyRelativeToSuppliedPrefix: true,
    memoryReleaseAuthorityEstablished: false,
    memoryReleaseReferenceStatus: attempt?.memoryReleaseHash == null
      ? "NOT_PRESENT" : "CLAIM_ONLY_UNVERIFIED",
    reasonCodes: Array.isArray(attempt?.envelopeConformance?.reasonCodes)
      ? [...attempt.envelopeConformance.reasonCodes] : [],
    resultDisposition: errors.length ? "HOLD" : attempt?.resultDisposition ?? "HOLD",
    attemptHash: attempt?.attemptHash ?? null,
  };
}

function provenanceEntries(values, label) {
  if (!Array.isArray(values) || !values.length) throw new TypeError(`${label}_REQUIRED`);
  const normalized = values.map((entry) => {
    if (!exactKeys(entry, ["attemptId", "attemptHash"])) {
      throw new TypeError(`${label}_FIELDS_INVALID`);
    }
    return {
      attemptId: id(entry.attemptId, `${label}_ATTEMPT_ID`),
      attemptHash: hash(entry.attemptHash, `${label}_ATTEMPT_HASH`),
    };
  }).sort((left, right) => left.attemptHash.localeCompare(right.attemptHash));
  if (new Set(normalized.map((entry) => entry.attemptHash)).size !== normalized.length) {
    throw new TypeError(`${label}_DUPLICATE`);
  }
  return normalized;
}

function memoryContent(value) {
  if (!exactKeys(value, ["taskClassId", "applicablePrimitiveIds", "applicableRegionIds",
    "preconditionIds", "recoveryPrimitiveIds", "maxRiskUnitsPerAttempt",
    "maxRetriesPerPrimitive", "coordinatePolicy", "strategyCommitment"])) {
    throw new TypeError("PHYSICAL_MEMORY_CONTENT_FIELDS_INVALID");
  }
  return {
    taskClassId: id(value.taskClassId, "PHYSICAL_MEMORY_TASK_CLASS_ID"),
    applicablePrimitiveIds: normalizedPrimitiveIds(value.applicablePrimitiveIds,
      "PHYSICAL_MEMORY_APPLICABLE_PRIMITIVE", { nonempty: true }),
    applicableRegionIds: normalizedIds(value.applicableRegionIds,
      "PHYSICAL_MEMORY_APPLICABLE_REGION", { nonempty: true }),
    preconditionIds: normalizedIds(value.preconditionIds,
      "PHYSICAL_MEMORY_PRECONDITION", { nonempty: true }),
    recoveryPrimitiveIds: normalizedPrimitiveIds(value.recoveryPrimitiveIds,
      "PHYSICAL_MEMORY_RECOVERY_PRIMITIVE"),
    maxRiskUnitsPerAttempt: finite(value.maxRiskUnitsPerAttempt,
      "PHYSICAL_MEMORY_MAX_RISK_PER_ATTEMPT"),
    maxRetriesPerPrimitive: finite(value.maxRetriesPerPrimitive,
      "PHYSICAL_MEMORY_MAX_RETRIES", { integer: true }),
    coordinatePolicy: String(value.coordinatePolicy ?? ""),
    strategyCommitment: hash(value.strategyCommitment,
      "PHYSICAL_MEMORY_STRATEGY_COMMITMENT"),
  };
}

function provenanceMatchesAttempt(entry, attempt) {
  return entry.attemptId === attempt?.attemptId && entry.attemptHash === attempt?.attemptHash;
}

function positiveAttempt(attempt) {
  return attempt?.envelopeConformance?.state === "WITHIN_ENVELOPE"
    && attempt?.execution?.primitiveStop?.state === "STOPPED"
    && attempt?.localPostcondition?.state === "SATISFIED"
    && attempt?.taskOutcome?.state === "SUCCEEDED"
    && attempt?.safetyOutcome?.state === "SAFE";
}

function verifiedAttemptsForMemory(attempts, envelope) {
  if (!Array.isArray(attempts) || !attempts.length) {
    throw new TypeError("PHYSICAL_MEMORY_ATTEMPTS_REQUIRED");
  }
  const prior = [];
  for (const attempt of attempts) {
    const verified = verifyPrimitiveAttempt(attempt, {
      envelope,
      priorAttempts: prior,
      expectedAttemptHash: attempt?.attemptHash,
    });
    if (!verified.ok) {
      throw new TypeError(`PHYSICAL_MEMORY_ATTEMPT_INVALID:${verified.errors.join(";")}`);
    }
    prior.push(attempt);
  }
  return attempts;
}

function negativeAttempt(attempt) {
  return !positiveAttempt(attempt) && [
    attempt?.envelopeConformance?.state === "OUTSIDE_ENVELOPE",
    attempt?.localPostcondition?.state === "NOT_SATISFIED",
    attempt?.taskOutcome?.state === "FAILED",
    attempt?.safetyOutcome?.state === "UNSAFE",
  ].some(Boolean);
}

function memoryScopeErrors(content, envelope) {
  const errors = [];
  if (content.coordinatePolicy !== "RELOCALIZE_FROM_CURRENT_OBSERVATION") {
    errors.push("memory coordinates must be relocalized from the current observation");
  }
  if (content.applicablePrimitiveIds.some((primitive) =>
    !envelope.actionEnvelope.allowedPrimitiveIds.includes(primitive))) {
    errors.push("memory cannot grant capabilities outside the delegation envelope");
  }
  if (content.applicableRegionIds.some((region) =>
    !envelope.workspaceEnvelope.allowedRegionIds.includes(region)
      || envelope.workspaceEnvelope.forbiddenRegionIds.includes(region))) {
    errors.push("memory cannot expand the workspace envelope");
  }
  if (content.recoveryPrimitiveIds.some((primitive) =>
    !content.applicablePrimitiveIds.includes(primitive))) {
    errors.push("memory recovery primitives must be an applicable capability subset");
  }
  if (content.maxRiskUnitsPerAttempt > envelope.riskEnvelope.maxPerAttemptRiskUnits) {
    errors.push("memory cannot increase the risk budget");
  }
  if (content.maxRetriesPerPrimitive
    > Math.min(envelope.retryEnvelope.maxRetriesTotal,
      envelope.retryEnvelope.maxAttemptsPerPrimitive - 1)) {
    errors.push("memory cannot increase the retry budget");
  }
  return errors;
}

function proposalBody(input) {
  rejectUnknownKeys(input, ["proposalId", "proposedBy", "proposedAt", "content",
    "positiveProvenance", "negativeProvenance"], "PHYSICAL_MEMORY_PROPOSAL_INPUT");
  return {
    schema: MEMORY_PROPOSAL_SCHEMA,
    proposalId: id(input.proposalId, "PHYSICAL_MEMORY_PROPOSAL_ID"),
    delegationId: null,
    sourceEnvelopeHash: null,
    proposedBy: id(input.proposedBy, "PHYSICAL_MEMORY_PROPOSER_ID"),
    proposedAt: iso(input.proposedAt, "PHYSICAL_MEMORY_PROPOSED_AT"),
    content: memoryContent(input.content),
    provenance: {
      positive: provenanceEntries(input.positiveProvenance,
        "PHYSICAL_MEMORY_POSITIVE_PROVENANCE"),
      negative: provenanceEntries(input.negativeProvenance,
        "PHYSICAL_MEMORY_NEGATIVE_PROVENANCE"),
    },
    authorityBoundary: clone(FIXED_MEMORY_AUTHORITY),
  };
}

export function createMemoryProposal({ envelope, attempts, ...input }) {
  const envelopeVerified = verifyPhysicalDelegationEnvelope(envelope, {
    expectedEnvelopeHash: envelope?.envelopeHash,
  });
  if (!envelopeVerified.ok) {
    throw new TypeError(`PHYSICAL_ENVELOPE_INVALID:${envelopeVerified.errors.join(";")}`);
  }
  verifiedAttemptsForMemory(attempts, envelope);
  const body = proposalBody(input);
  body.delegationId = envelope.delegationId;
  body.sourceEnvelopeHash = envelope.envelopeHash;
  const overlap = body.provenance.positive.some((entry) =>
    body.provenance.negative.some((other) => other.attemptHash === entry.attemptHash));
  if (overlap) throw new TypeError("PHYSICAL_MEMORY_PROVENANCE_POLARITY_CONFLICT");
  for (const entry of body.provenance.positive) {
    const attempt = attempts.find((candidate) => provenanceMatchesAttempt(entry, candidate));
    if (!attempt || attempt.envelopeHash !== envelope.envelopeHash || !positiveAttempt(attempt)) {
      throw new TypeError("PHYSICAL_MEMORY_POSITIVE_PROVENANCE_INVALID");
    }
  }
  for (const entry of body.provenance.negative) {
    const attempt = attempts.find((candidate) => provenanceMatchesAttempt(entry, candidate));
    if (!attempt || attempt.envelopeHash !== envelope.envelopeHash || !negativeAttempt(attempt)) {
      throw new TypeError("PHYSICAL_MEMORY_NEGATIVE_PROVENANCE_INVALID");
    }
  }
  const latestEvidenceAt = Math.max(...attempts.flatMap((attempt) => [
    attempt.execution.primitiveStop.observedAt,
    attempt.localPostcondition.observedAt,
    attempt.taskOutcome.observedAt,
    attempt.safetyOutcome.observedAt,
  ]).map(Date.parse));
  if (Date.parse(body.proposedAt) < latestEvidenceAt) {
    throw new TypeError("PHYSICAL_MEMORY_PROPOSAL_PRECEDES_ATTEMPT_EVIDENCE");
  }
  const scopeErrors = memoryScopeErrors(body.content, envelope);
  if (scopeErrors.length) throw new TypeError(`PHYSICAL_MEMORY_SCOPE_INVALID:${scopeErrors.join(";")}`);
  return deepFreeze({ ...body, proposalHash: digest("physical-memory-proposal", body) });
}

export function verifyMemoryProposal(proposal, {
  envelope,
  attempts = [],
  expectedProposalHash = null,
} = {}) {
  const errors = [];
  if (!exactKeys(proposal, ["schema", "proposalId", "delegationId", "sourceEnvelopeHash",
    "proposedBy", "proposedAt", "content", "provenance", "authorityBoundary",
    "proposalHash"])) errors.push("physical memory proposal fields invalid");
  let normalized = null;
  if (!errors.length) {
    normalized = safe(() => createMemoryProposal({
      envelope,
      attempts,
      proposalId: proposal.proposalId,
      proposedBy: proposal.proposedBy,
      proposedAt: proposal.proposedAt,
      content: proposal.content,
      positiveProvenance: proposal.provenance?.positive,
      negativeProvenance: proposal.provenance?.negative,
    }), errors, "physical memory proposal normalization failed");
    if (normalized && canonicalizeStrict(normalized) !== canonicalizeStrict(proposal)) {
      errors.push("physical memory proposal is not canonical or hash changed");
    }
  }
  if (expectedProposalHash != null && proposal?.proposalHash !== expectedProposalHash) {
    errors.push("physical memory proposal does not match expected hash");
  }
  return { ok: errors.length === 0, errors, proposalHash: proposal?.proposalHash ?? null };
}

/* These historical labels are retained as caller claims for wire
   compatibility. Neither a caller-provided approver list nor caller-provided
   expected hashes establish the approver's externality, preauthorization, or
   operator independence. */
function approvalClaim(value) {
  if (!exactKeys(value, ["approvedBy", "approverRole", "authority",
    "approvalPolicyHash", "approvalEvidenceHash", "approvedProposalHash", "decision",
    "approvedAt"])) throw new TypeError("PHYSICAL_MEMORY_APPROVAL_FIELDS_INVALID");
  const normalized = {
    approvedBy: id(value.approvedBy, "PHYSICAL_MEMORY_APPROVER_ID"),
    approverRole: String(value.approverRole ?? ""),
    authority: String(value.authority ?? ""),
    approvalPolicyHash: hash(value.approvalPolicyHash,
      "PHYSICAL_MEMORY_APPROVAL_POLICY_HASH"),
    approvalEvidenceHash: hash(value.approvalEvidenceHash,
      "PHYSICAL_MEMORY_APPROVAL_EVIDENCE_HASH"),
    approvedProposalHash: hash(value.approvedProposalHash,
      "PHYSICAL_MEMORY_APPROVED_PROPOSAL_HASH"),
    decision: String(value.decision ?? ""),
    approvedAt: iso(value.approvedAt, "PHYSICAL_MEMORY_APPROVED_AT"),
  };
  if (normalized.approverRole !== "INDEPENDENT_MEMORY_APPROVER"
    || normalized.authority !== "EXTERNAL_PREAUTHORIZED_APPROVER"
    || normalized.decision !== "APPROVED") {
    throw new TypeError("PHYSICAL_MEMORY_APPROVAL_CLAIM_LABELS_INVALID");
  }
  return normalized;
}

function callerDeclaredApprovers(trustedApproverIds) {
  if (!Array.isArray(trustedApproverIds) || !trustedApproverIds.length) {
    throw new TypeError("PHYSICAL_MEMORY_CALLER_DECLARED_APPROVERS_REQUIRED");
  }
  return normalizedIds(trustedApproverIds, "PHYSICAL_MEMORY_TRUSTED_APPROVER",
    { nonempty: true });
}

function approvalAuthorityBoundary(normalizedApproval) {
  return {
    status: "CALLER_DECLARED_APPROVAL_NO_AUTHORITY",
    approvedByClaimed: normalizedApproval.approvedBy,
    approverRoleClaimed: normalizedApproval.approverRole,
    authorityClaimed: normalizedApproval.authority,
    decisionClaimed: normalizedApproval.decision,
    decisionClaimRecorded: true,
    callerDeclaredApproverIdMatched: true,
    callerDeclaredApprovalPolicyHashMatched: true,
    callerDeclaredApprovalEvidenceHashMatched: true,
    callerClaimedApproverIdDiffersFromProposerId: true,
    approvalAuthorityEstablished: false,
    operatorIndependenceEstablished: false,
    externalPreauthorizationEstablished: false,
    trustBoundary:
      "CALLER_SUPPLIED_APPROVER_LIST_POLICY_AND_EVIDENCE_NO_MAINTAINER_EXTERNAL_REGISTRY",
    authorityUpgradeRequirement:
      "MAINTAINER_PINNED_EXTERNAL_REGISTRY_AND_SIGNED_FULL_REPLAY_NOT_IMPLEMENTED",
  };
}

export function createMemoryRelease(input, {
  trustedApproverIds,
  expectedApprovalPolicyHash,
  expectedApprovalEvidenceHash,
} = {}) {
  rejectUnknownKeys(input, ["proposal", "envelope", "attempts", "releaseId", "approval"],
    "PHYSICAL_MEMORY_RELEASE_INPUT");
  const { proposal, envelope, attempts, releaseId, approval: approvalInput } = input;
  const proposalVerified = verifyMemoryProposal(proposal, {
    envelope, attempts, expectedProposalHash: proposal?.proposalHash,
  });
  if (!proposalVerified.ok) {
    throw new TypeError(`PHYSICAL_MEMORY_PROPOSAL_INVALID:${proposalVerified.errors.join(";")}`);
  }
  const normalizedApproval = approvalClaim(approvalInput);
  const callerDeclared = callerDeclaredApprovers(trustedApproverIds);
  const expectedPolicy = hash(expectedApprovalPolicyHash,
    "PHYSICAL_MEMORY_EXPECTED_APPROVAL_POLICY_HASH");
  const expectedEvidence = hash(expectedApprovalEvidenceHash,
    "PHYSICAL_MEMORY_EXPECTED_APPROVAL_EVIDENCE_HASH");
  if (normalizedApproval.approvedProposalHash !== proposal.proposalHash
    || normalizedApproval.approvedBy === proposal.proposedBy
    || !callerDeclared.includes(normalizedApproval.approvedBy)
    || normalizedApproval.approvalPolicyHash !== expectedPolicy
    || normalizedApproval.approvalEvidenceHash !== expectedEvidence) {
    throw new TypeError("PHYSICAL_MEMORY_APPROVAL_DECLARATION_INCONSISTENT");
  }
  if (Date.parse(normalizedApproval.approvedAt) < Date.parse(proposal.proposedAt)) {
    throw new TypeError("PHYSICAL_MEMORY_APPROVAL_PRECEDES_PROPOSAL");
  }
  const releaseValidUntil = new Date(Math.min(
    Date.parse(envelope.validUntil),
    Date.parse(normalizedApproval.approvedAt) + envelope.memoryPolicy.maxMemoryAgeMs,
  )).toISOString();
  const body = {
    schema: MEMORY_RELEASE_SCHEMA,
    releaseId: id(releaseId, "PHYSICAL_MEMORY_RELEASE_ID"),
    proposalHash: proposal.proposalHash,
    sourceEnvelopeHash: proposal.sourceEnvelopeHash,
    content: clone(proposal.content),
    provenance: clone(proposal.provenance),
    authorityBoundary: clone(proposal.authorityBoundary),
    approval: normalizedApproval,
    approvalAuthority: approvalAuthorityBoundary(normalizedApproval),
    releasedAt: normalizedApproval.approvedAt,
    validUntil: releaseValidUntil,
  };
  return deepFreeze({ ...body, releaseHash: digest("physical-memory-release", body) });
}

export function verifyMemoryRelease(release, {
  proposal,
  envelope,
  attempts = [],
  trustedApproverIds,
  expectedApprovalPolicyHash,
  expectedApprovalEvidenceHash,
  expectedReleaseHash = null,
  atTime = null,
} = {}) {
  const errors = [];
  if (!exactKeys(release, ["schema", "releaseId", "proposalHash", "sourceEnvelopeHash",
    "content", "provenance", "authorityBoundary", "approval", "approvalAuthority",
    "releasedAt", "validUntil", "releaseHash"])) {
    errors.push("physical memory release fields invalid");
  }
  let normalized = null;
  if (!errors.length) {
    normalized = safe(() => createMemoryRelease({
      proposal, envelope, attempts, releaseId: release.releaseId, approval: release.approval,
    }, { trustedApproverIds, expectedApprovalPolicyHash, expectedApprovalEvidenceHash }), errors,
    "physical memory release normalization failed");
    if (normalized && canonicalizeStrict(normalized) !== canonicalizeStrict(release)) {
      errors.push("physical memory release is not canonical or hash changed");
    }
  }
  if (expectedReleaseHash != null && release?.releaseHash !== expectedReleaseHash) {
    errors.push("physical memory release does not match expected hash");
  }
  if (atTime != null) {
    const assessedAt = safe(() => iso(atTime, "PHYSICAL_MEMORY_ASSESSED_AT"),
      errors, "physical memory assessment time invalid");
    if (assessedAt && (Date.parse(assessedAt) < Date.parse(release?.releasedAt)
      || Date.parse(assessedAt) > Date.parse(release?.validUntil))) {
      errors.push("physical memory release is not current");
    }
  }
  return {
    ok: errors.length === 0,
    errors,
    structurallyValidCallerDeclaration: errors.length === 0,
    approvalDecisionClaimed: release?.approval?.decision ?? null,
    approvalDecisionRecordedAsCallerClaim: errors.length === 0
      && release?.approval?.decision === "APPROVED",
    approvedByClaimed: release?.approval?.approvedBy ?? null,
    approverRoleClaimed: release?.approval?.approverRole ?? null,
    approvalAuthorityClaimed: release?.approval?.authority ?? null,
    approvalAuthorityEstablished: false,
    operatorIndependenceEstablished: false,
    externalPreauthorizationEstablished: false,
    trustBoundary:
      "CALLER_SUPPLIED_APPROVER_LIST_POLICY_AND_EVIDENCE_NO_MAINTAINER_EXTERNAL_REGISTRY",
    releaseHash: release?.releaseHash ?? null,
  };
}
