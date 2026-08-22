/*
 * Provider-neutral Stage 0.5 worker boundary.
 *
 * A parser is not a controller.  This protocol keeps the three facts that are
 * easiest to accidentally collapse into one separate and machine-checkable:
 *
 *   OBSERVE   can this adapter see structured worker behaviour?
 *   INTERVENE can it change/refuse behaviour before the relevant boundary?
 *   VERIFY    what, exactly, can it prove after the fact?
 *
 * Capability absence never becomes a synthetic deny.  `requireWorkerCapability`
 * returns a fail-visible CONTINUE_UNSUPERVISED receipt, so a provider whose hook
 * is absent or whose local sidecar is unreachable cannot reproduce the Cowork
 * failure mode where an unsupported remote session was frozen by default.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const WORKER_CAPABILITY_SCHEMA = "outsider/worker-capability-handshake/v1";
export const WORKER_EVENT_SCHEMA = "outsider/worker-event/v1";
export const WORKER_OBSERVATION_SCHEMA = "outsider/worker-observation/v1";
export const WORKER_CAPABILITY_REFUSAL_SCHEMA = "outsider/worker-capability-refusal/v1";

export const WORKER_CAPABILITY_SCOPES = Object.freeze({
  OBSERVE: Object.freeze([
    "STRUCTURED_EVENTS", "ACTION_RESULT_PAIRING", "LIFECYCLE", "MULTI_AGENT",
  ]),
  INTERVENE: Object.freeze([
    "DENY_ACTION", "CORRECT_PRE_ACTION", "CORRECT_PRE_STEP", "BLOCK_COMPLETION",
  ]),
  VERIFY: Object.freeze([
    "SOURCE_BYTES", "STRUCTURAL_PAIRING", "DURABLE_DELIVERY", "BEHAVIORAL_EFFECT",
    "SEMANTIC_OUTCOME", "ECONOMIC_LOSS",
  ]),
});

const EVENT_KINDS = new Set([
  "SESSION_START", "TASK_START", "TASK_END", "TASK_ABORT",
  "ACTION_PROPOSED", "ACTION_RESULT", "AGENT_ACTIVITY",
  "INTERVENTION_DELIVERED", "BEHAVIORAL_EFFECT_VERIFIED",
]);
const RESULT_STATUSES = new Set(["SUCCEEDED", "FAILED", "OBSERVED_UNKNOWN", null]);
const DELIVERY_STATUSES = new Set(["OBSERVED", "REFUSED", null]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const ID = /^[a-z0-9][a-z0-9._:-]{1,127}$/;
const BOUNDED_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:/+-]{0,127}$/;
const GAP_CODE = /^[A-Z][A-Z0-9_]*(?::(?:[A-Z0-9_]+|[0-9]+|sha256:[a-f0-9]{64}))*$/;
const CAPABILITY_NAMES = ["OBSERVE", "INTERVENE", "VERIFY"];
const STATUS = new Set(["SUPPORTED", "UNSUPPORTED"]);

export const workerDigest = (value) => `sha256:${createHash("sha256")
  .update(typeof value === "string" || Buffer.isBuffer(value)
    ? value : canonicalizeStrict(value)).digest("hex")}`;

const plain = (value) => value !== null && typeof value === "object"
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));

function addressed(body) {
  return Object.freeze({ ...body, recordHash: workerDigest(body) });
}

function verifyAddressed(record, schema) {
  if (!plain(record) || record.schema !== schema) return { ok: false, error: "SCHEMA_INVALID" };
  const { recordHash, ...body } = record;
  if (!HASH.test(String(recordHash ?? "")) || workerDigest(body) !== recordHash) {
    return { ok: false, error: "RECORD_HASH_INVALID" };
  }
  return { ok: true, recordHash };
}

function requireHash(value, label, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!HASH.test(String(value ?? ""))) throw new Error(`${label}_HASH_REQUIRED`);
  return value;
}

function uniqueSorted(values, allowed, label) {
  if (!Array.isArray(values) || values.some((value) => !allowed.includes(value))) {
    throw new Error(`${label}_SCOPES_INVALID`);
  }
  return [...new Set(values)].sort();
}

function capability(name, input) {
  if (!plain(input) || !STATUS.has(input.status)) {
    throw new Error(`${name}_CAPABILITY_INVALID`);
  }
  const scopes = uniqueSorted(input.scopes ?? [], WORKER_CAPABILITY_SCOPES[name], name);
  const evidenceRefs = [...new Set(input.evidenceRefs ?? [])].sort();
  if (!Array.isArray(input.evidenceRefs ?? [])
    || evidenceRefs.some((value) => !HASH.test(String(value)))) {
    throw new Error(`${name}_EVIDENCE_REFS_INVALID`);
  }
  const reasonCode = input.reasonCode ?? null;
  if (input.status === "SUPPORTED" && (!scopes.length || reasonCode !== null)) {
    throw new Error(`${name}_SUPPORTED_REQUIRES_SCOPE_WITHOUT_REASON`);
  }
  if (input.status === "UNSUPPORTED"
    && (scopes.length || typeof reasonCode !== "string" || !ID.test(reasonCode.toLowerCase()))) {
    throw new Error(`${name}_UNSUPPORTED_REQUIRES_REASON_WITHOUT_SCOPE`);
  }
  return Object.freeze({ status: input.status, scopes, evidenceRefs, reasonCode });
}

function derivedControlLevel(capabilities) {
  const intervention = new Set(capabilities.INTERVENE.scopes);
  const verification = new Set(capabilities.VERIFY.scopes);
  if (capabilities.OBSERVE.status !== "SUPPORTED") return "UNSUPPORTED";
  if (capabilities.INTERVENE.status !== "SUPPORTED") return "OBSERVATION_ONLY";
  if (intervention.has("BLOCK_COMPLETION") && verification.has("SEMANTIC_OUTCOME")) {
    return "LIFECYCLE_CONTROLLED";
  }
  if (intervention.has("DENY_ACTION") && verification.has("DURABLE_DELIVERY")) {
    return "ACTION_CONTROLLED";
  }
  if ((intervention.has("CORRECT_PRE_STEP") || intervention.has("CORRECT_PRE_ACTION"))
    && verification.has("DURABLE_DELIVERY")) return "DELIVERY_SUPERVISED";
  return "INTERVENTION_UNVERIFIED";
}

/** Create an immutable, content-addressed capability handshake. */
export function createWorkerCapabilityHandshake({
  provider,
  surface,
  runtime = {},
  adapter = {},
  sessionRefHash = null,
  capabilities = {},
  failurePolicy = {},
} = {}) {
  if (!ID.test(String(provider ?? "")) || !ID.test(String(surface ?? ""))) {
    throw new Error("WORKER_PROVIDER_OR_SURFACE_INVALID");
  }
  if (!plain(runtime) || !ID.test(String(runtime.name ?? ""))
    || !(runtime.version === null || BOUNDED_TOKEN.test(String(runtime.version)))
    || !(runtime.sourceRevision === null || BOUNDED_TOKEN.test(String(runtime.sourceRevision)))) {
    throw new Error("WORKER_RUNTIME_INVALID");
  }
  if (!plain(adapter) || !ID.test(String(adapter.name ?? ""))
    || !Number.isSafeInteger(adapter.version) || adapter.version < 1) {
    throw new Error("WORKER_ADAPTER_INVALID");
  }
  const normalized = Object.fromEntries(CAPABILITY_NAMES.map((name) => [
    name, capability(name, capabilities[name]),
  ]));
  const declaredControlLevel = derivedControlLevel(normalized);
  const claimableControlLevel = normalized.OBSERVE.status === "SUPPORTED"
    ? "OBSERVATION_ONLY" : "UNSUPPORTED";
  const policy = {
    unsupported: failurePolicy.unsupported ?? "FAIL_VISIBLE_CONTINUE",
    controllerUnavailable: failurePolicy.controllerUnavailable ?? "FAIL_VISIBLE_CONTINUE",
    blocksHostWithoutCapability: failurePolicy.blocksHostWithoutCapability ?? false,
  };
  if (policy.unsupported !== "FAIL_VISIBLE_CONTINUE"
    || policy.controllerUnavailable !== "FAIL_VISIBLE_CONTINUE"
    || policy.blocksHostWithoutCapability !== false) {
    throw new Error("WORKER_FAILURE_POLICY_MUST_NOT_BLOCK_UNSUPPORTED_HOST");
  }
  const body = {
    schema: WORKER_CAPABILITY_SCHEMA,
    provider,
    surface,
    runtime: {
      name: runtime.name,
      version: runtime.version ?? null,
      sourceRevision: runtime.sourceRevision ?? null,
      closureHash: requireHash(runtime.closureHash, "WORKER_RUNTIME_CLOSURE"),
    },
    adapter: {
      name: adapter.name,
      version: adapter.version,
      closureHash: requireHash(adapter.closureHash, "WORKER_ADAPTER_CLOSURE"),
    },
    sessionRefHash: requireHash(sessionRefHash, "WORKER_SESSION_REF", { nullable: true }),
    capabilities: normalized,
    declaredControlLevel,
    claimableControlLevel,
    /* compatibility alias: this is deliberately the conservative value */
    controlLevel: claimableControlLevel,
    failurePolicy: policy,
    authority: {
      clearsEconomicRisk: false,
      grantsExecutionAuthority: false,
      movesFunds: false,
      capabilitiesSelfAsserted: true,
      adapterTrustProofEmbedded: false,
    },
  };
  return addressed(body);
}

export function verifyWorkerCapabilityHandshake(record) {
  const checked = verifyAddressed(record, WORKER_CAPABILITY_SCHEMA);
  if (!checked.ok) return checked;
  try {
    const rebuilt = createWorkerCapabilityHandshake(record);
    if (rebuilt.recordHash !== record.recordHash) throw new Error("REBUILT_HASH_MISMATCH");
    if (record.authority?.clearsEconomicRisk !== false
      || record.authority?.grantsExecutionAuthority !== false
      || record.authority?.movesFunds !== false
      || record.authority?.capabilitiesSelfAsserted !== true
      || record.authority?.adapterTrustProofEmbedded !== false) {
      throw new Error("AUTHORITY_ESCALATED");
    }
    return { ok: true, recordHash: record.recordHash,
      controlLevel: record.controlLevel,
      declaredControlLevel: record.declaredControlLevel,
      claimableControlLevel: record.claimableControlLevel,
      capabilityAuthority: "SELF_ASSERTED" };
  } catch (error) {
    return { ok: false, error: `CAPABILITY_HANDSHAKE_INVALID:${error?.message ?? error}` };
  }
}

/**
 * A provider capability miss is a receipt, never an exception and never a deny.
 * The host continues, while the operator receives a machine-readable statement
 * that this boundary was not controlled.
 */
export function requireWorkerCapability(handshake, name, scope) {
  const verified = verifyWorkerCapabilityHandshake(handshake);
  const capabilityName = String(name ?? "").toUpperCase();
  const normalizedScope = BOUNDED_TOKEN.test(String(scope ?? "")) ? String(scope) : "UNKNOWN";
  const declaredSupported = verified.ok && CAPABILITY_NAMES.includes(capabilityName)
    && handshake.capabilities[capabilityName].status === "SUPPORTED"
    && handshake.capabilities[capabilityName].scopes.includes(normalizedScope);
  const supported = declaredSupported && capabilityName === "OBSERVE";
  if (supported) return Object.freeze({ ok: true, capability: capabilityName,
    scope: normalizedScope,
    handshakeHash: handshake.recordHash });
  const body = {
    schema: WORKER_CAPABILITY_REFUSAL_SCHEMA,
    provider: verified.ok ? handshake.provider : "unknown",
    capability: CAPABILITY_NAMES.includes(capabilityName) ? capabilityName : "UNKNOWN",
    scope: normalizedScope,
    handshakeHash: verified.ok ? handshake.recordHash : null,
    code: verified.ok && declaredSupported ? "WORKER_CAPABILITY_ADAPTER_ATTESTATION_REQUIRED"
      : verified.ok ? "WORKER_CAPABILITY_UNSUPPORTED" : "WORKER_HANDSHAKE_INVALID",
    hostDisposition: "CONTINUE_UNSUPERVISED",
    blocksHost: false,
    operatorVisible: true,
    message: verified.ok
      ? `${handshake.provider} does not independently prove ${capabilityName}:${normalizedScope}; this boundary is not controlled.`
      : `Worker capability handshake is invalid; this boundary is not controlled.`,
  };
  return addressed(body);
}

export function createWorkerEvent({
  ordinal,
  nativeSequence = null,
  observedAt = null,
  kind,
  nativeType,
  nativeRefHash,
  callRefHash = null,
  actionName = null,
  argumentsHash = null,
  resultHash = null,
  resultStatus = null,
  interventionRefHash = null,
  deliveryStatus = null,
} = {}) {
  if (!Number.isSafeInteger(ordinal) || ordinal < 0
    || !(nativeSequence === null || (Number.isSafeInteger(nativeSequence)
      && nativeSequence >= 0))
    || !EVENT_KINDS.has(kind) || !BOUNDED_TOKEN.test(String(nativeType ?? ""))) {
    throw new Error("WORKER_EVENT_ENVELOPE_INVALID");
  }
  if (!(observedAt === null || (typeof observedAt === "string"
    && Number.isFinite(Date.parse(observedAt))))) throw new Error("WORKER_EVENT_TIME_INVALID");
  if (!RESULT_STATUSES.has(resultStatus) || !DELIVERY_STATUSES.has(deliveryStatus)) {
    throw new Error("WORKER_EVENT_STATUS_INVALID");
  }
  const call = requireHash(callRefHash, "WORKER_CALL_REF", { nullable: true });
  const args = requireHash(argumentsHash, "WORKER_ARGUMENTS", { nullable: true });
  const result = requireHash(resultHash, "WORKER_RESULT", { nullable: true });
  const intervention = requireHash(interventionRefHash, "WORKER_INTERVENTION", { nullable: true });
  const action = actionName === null ? null : String(actionName);
  if (action !== null && !BOUNDED_TOKEN.test(action)) throw new Error("WORKER_ACTION_NAME_INVALID");
  if (kind === "ACTION_PROPOSED"
    && (!call || !action || !args || result || resultStatus || intervention || deliveryStatus)) {
    throw new Error("WORKER_ACTION_PROPOSED_INVALID");
  }
  if (kind === "ACTION_RESULT"
    && (!call || !result || !resultStatus || action || args || intervention || deliveryStatus)) {
    throw new Error("WORKER_ACTION_RESULT_INVALID");
  }
  if (kind === "INTERVENTION_DELIVERED"
    && (!intervention || !deliveryStatus || call || action || args || result || resultStatus)) {
    throw new Error("WORKER_INTERVENTION_DELIVERY_INVALID");
  }
  if (kind === "BEHAVIORAL_EFFECT_VERIFIED"
    && (!intervention || deliveryStatus || call || action || args || result || resultStatus)) {
    throw new Error("WORKER_EFFECT_INVALID");
  }
  if (!["ACTION_PROPOSED", "ACTION_RESULT", "INTERVENTION_DELIVERED",
    "BEHAVIORAL_EFFECT_VERIFIED"].includes(kind)
    && (call || action || args || result || resultStatus || intervention || deliveryStatus)) {
    throw new Error("WORKER_LIFECYCLE_EVENT_FIELDS_INVALID");
  }
  const body = {
    schema: WORKER_EVENT_SCHEMA,
    ordinal,
    nativeSequence,
    observedAt,
    kind,
    nativeType,
    nativeRefHash: requireHash(nativeRefHash, "WORKER_NATIVE_REF"),
    callRefHash: call,
    actionName: action,
    argumentsHash: args,
    resultHash: result,
    resultStatus,
    interventionRefHash: intervention,
    deliveryStatus,
  };
  return addressed(body);
}

export function verifyWorkerEvent(record) {
  const checked = verifyAddressed(record, WORKER_EVENT_SCHEMA);
  if (!checked.ok) return checked;
  try {
    const rebuilt = createWorkerEvent(record);
    return rebuilt.recordHash === record.recordHash
      ? { ok: true, recordHash: record.recordHash }
      : { ok: false, error: "WORKER_EVENT_REBUILD_MISMATCH" };
  } catch (error) {
    return { ok: false, error: `WORKER_EVENT_INVALID:${error?.message ?? error}` };
  }
}

function normalizedCounts(counts) {
  if (!plain(counts)) throw new Error("WORKER_NATIVE_COUNTS_INVALID");
  const output = {};
  for (const key of Object.keys(counts).sort()) {
    if (!BOUNDED_TOKEN.test(key) || !Number.isSafeInteger(counts[key]) || counts[key] < 0) {
      throw new Error("WORKER_NATIVE_COUNTS_INVALID");
    }
    output[key] = counts[key];
  }
  return output;
}

export function createWorkerObservation({
  handshake,
  sourceFormat,
  sourceSnapshotHash,
  sourceByteLength,
  nativeEventCount,
  nativeTypeCounts,
  events,
  gaps = [],
} = {}) {
  const capability = verifyWorkerCapabilityHandshake(handshake);
  if (!capability.ok) throw new Error(`WORKER_CAPABILITY_INVALID:${capability.error}`);
  if (typeof sourceFormat !== "string" || !sourceFormat
    || !Number.isSafeInteger(sourceByteLength) || sourceByteLength < 0
    || !Number.isSafeInteger(nativeEventCount) || nativeEventCount < 0
    || !BOUNDED_TOKEN.test(sourceFormat)
    || !Array.isArray(events) || !Array.isArray(gaps) || gaps.length > 1024
    || gaps.some((gap) => typeof gap !== "string" || !GAP_CODE.test(gap))) {
    throw new Error("WORKER_OBSERVATION_INPUT_INVALID");
  }
  const uniqueGaps = [...new Set(gaps)].sort();
  const counts = normalizedCounts(nativeTypeCounts);
  if (Object.values(counts).reduce((sum, value) => sum + value, 0) !== nativeEventCount) {
    throw new Error("WORKER_NATIVE_COUNT_TOTAL_MISMATCH");
  }
  const eventFailures = [];
  const calls = new Map();
  let lastOrdinal = -1;
  const eventHashes = new Set();
  for (const event of events) {
    const verified = verifyWorkerEvent(event);
    if (!verified.ok) eventFailures.push(verified.error);
    if (event.ordinal <= lastOrdinal) eventFailures.push("EVENT_ORDINAL_NOT_MONOTONIC");
    lastOrdinal = event.ordinal;
    if (eventHashes.has(event.recordHash)) eventFailures.push("EVENT_HASH_DUPLICATE");
    eventHashes.add(event.recordHash);
    if (event.kind === "ACTION_PROPOSED") {
      if (calls.has(event.callRefHash)) eventFailures.push("ACTION_CALL_DUPLICATE");
      else calls.set(event.callRefHash, { proposed: true, result: false });
    }
    if (event.kind === "ACTION_RESULT") {
      const call = calls.get(event.callRefHash);
      if (!call) eventFailures.push("ACTION_RESULT_ORPHAN");
      else if (call.result) eventFailures.push("ACTION_RESULT_DUPLICATE");
      else call.result = true;
    }
  }
  for (const call of calls.values()) if (!call.result) eventFailures.push("ACTION_RESULT_MISSING");
  const integrityGaps = [...new Set([...uniqueGaps, ...eventFailures])].sort();
  const observed = handshake.capabilities.OBSERVE.status === "SUPPORTED" && events.length > 0;
  const interventionScopes = new Set(handshake.capabilities.INTERVENE.scopes);
  const verifyScopes = new Set(handshake.capabilities.VERIFY.scopes);
  const deliveredRefs = new Set(events.filter((event) => event.kind === "INTERVENTION_DELIVERED"
    && event.deliveryStatus === "OBSERVED").map((event) => event.interventionRefHash));
  const canIntervene = handshake.capabilities.INTERVENE.status === "SUPPORTED"
    && (interventionScopes.has("DENY_ACTION") || interventionScopes.has("CORRECT_PRE_ACTION")
      || interventionScopes.has("CORRECT_PRE_STEP") || interventionScopes.has("BLOCK_COMPLETION"));
  const declaredDelivered = observed && canIntervene && verifyScopes.has("DURABLE_DELIVERY")
    && deliveredRefs.size > 0;
  const declaredEffect = declaredDelivered && verifyScopes.has("BEHAVIORAL_EFFECT")
    && events.some((event) => event.kind === "BEHAVIORAL_EFFECT_VERIFIED"
      && deliveredRefs.has(event.interventionRefHash));
  const body = {
    schema: WORKER_OBSERVATION_SCHEMA,
    capabilityHandshake: handshake,
    source: {
      format: sourceFormat,
      snapshotHash: requireHash(sourceSnapshotHash, "WORKER_SOURCE_SNAPSHOT"),
      byteLength: sourceByteLength,
      nativeEventCount,
      nativeTypeCounts: counts,
      rawContentEmbedded: false,
    },
    events,
    integrity: { complete: integrityGaps.length === 0, gaps: integrityGaps },
    authority: {
      mode: handshake.controlLevel,
      establishesObservation: observed,
      establishesInterventionDelivery: false,
      establishesBehavioralEffect: false,
      establishesSemanticOutcome: false,
      establishesEconomicLoss: false,
      movesFunds: false,
      adapterTrustProofEmbedded: false,
    },
    declaredClaims: {
      interventionDelivery: declaredDelivered,
      behavioralEffect: declaredEffect,
    },
    learning: {
      eligibleForBehavioralMeasurement: integrityGaps.length === 0 && observed,
      eligibleForCorrectionEffectLearning: false,
      candidateForCorrectionEffectLearning: integrityGaps.length === 0 && declaredEffect,
      eligibleForPricing: false,
    },
    verificationBoundary: {
      embeddedSource: false,
      externalUseRequires: "FULL_SOURCE_REPLAY",
    },
  };
  return addressed(body);
}

export function verifyWorkerObservation(record, { sourceBytes = null } = {}) {
  const checked = verifyAddressed(record, WORKER_OBSERVATION_SCHEMA);
  if (!checked.ok) return checked;
  try {
    const capability = verifyWorkerCapabilityHandshake(record.capabilityHandshake);
    if (!capability.ok) throw new Error(`CAPABILITY:${capability.error}`);
    const rebuilt = createWorkerObservation({
      handshake: record.capabilityHandshake,
      sourceFormat: record.source?.format,
      sourceSnapshotHash: record.source?.snapshotHash,
      sourceByteLength: record.source?.byteLength,
      nativeEventCount: record.source?.nativeEventCount,
      nativeTypeCounts: record.source?.nativeTypeCounts,
      events: record.events,
      gaps: record.integrity?.gaps,
    });
    if (rebuilt.recordHash !== record.recordHash) throw new Error("REBUILD_MISMATCH");
    let sourceArtifactsReverified = false;
    if (sourceBytes !== null) {
      const bytes = Buffer.isBuffer(sourceBytes) ? sourceBytes : Buffer.from(String(sourceBytes));
      if (bytes.length !== record.source.byteLength
        || workerDigest(bytes) !== record.source.snapshotHash) {
        return { ok: false, error: "WORKER_SOURCE_BYTES_MISMATCH",
          sourceArtifactsReverified: false };
      }
      sourceArtifactsReverified = true;
    }
    return { ok: true, recordHash: record.recordHash,
      controlLevel: record.capabilityHandshake.controlLevel,
      declaredControlLevel: record.capabilityHandshake.declaredControlLevel,
      claimableControlLevel: record.capabilityHandshake.claimableControlLevel,
      capabilityAuthority: "SELF_ASSERTED",
      complete: record.integrity.complete,
      sourceArtifactsReverified,
      verificationMode: sourceArtifactsReverified ? "FULL_SOURCE_REPLAY" : "SELF_CHECK_ONLY",
      eligibleForBehavioralMeasurement: sourceArtifactsReverified
        && record.learning.eligibleForBehavioralMeasurement };
  } catch (error) {
    return { ok: false, error: `WORKER_OBSERVATION_INVALID:${error?.message ?? error}`,
      sourceArtifactsReverified: false };
  }
}
