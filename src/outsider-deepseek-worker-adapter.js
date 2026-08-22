/* DeepSeek Harness protocol records -> provider-neutral Worker Adapter v1. */

import { canonicalizeStrict } from "./canonical.js";
import {
  verifyDeepSeekHarnessObservation,
} from "./outsider-deepseek-harness-adapter.js";
import {
  verifyDeepSeekHarnessCorrection, verifyDeepSeekHarnessCorrectionAck,
  verifyDeepSeekHarnessEffectEvidence, verifyDeepSeekHarnessHandshake,
} from "./outsider-deepseek-harness-protocol.js";
import {
  createWorkerCapabilityHandshake, createWorkerEvent, createWorkerObservation,
  verifyWorkerObservation, workerDigest,
} from "./outsider-worker-adapter.js";

export const DEEPSEEK_WORKER_ADAPTER_VERSION = 1;
export const DEEPSEEK_WORKER_ADAPTER_CLOSURE_HASH = workerDigest({
  name: "outsider-deepseek-worker-adapter",
  version: DEEPSEEK_WORKER_ADAPTER_VERSION,
  input: "verified-deepseek-harness-protocol-records",
  rawContentPolicy: "hash-only",
});

function countTypes(refs) {
  const counts = {};
  for (const ref of refs) {
    const type = ref.understood ? ref.type : "unknown";
    counts[type] = (counts[type] ?? 0) + 1;
  }
  return counts;
}

function isoFromMillis(value) {
  return Number.isFinite(value) ? new Date(value).toISOString() : null;
}

function capabilityFor({ harnessObservation, runtimeHandshake, correctionAck,
  effectEvidence }) {
  const observationEvidence = [harnessObservation.recordHash];
  const runtimeVerified = runtimeHandshake == null
    ? null : verifyDeepSeekHarnessHandshake(runtimeHandshake);
  if (runtimeVerified && !runtimeVerified.ok) {
    throw new Error(`DEEPSEEK_RUNTIME_HANDSHAKE_INVALID:${runtimeVerified.error}`);
  }
  const verifyScopes = ["STRUCTURAL_PAIRING"];
  const verifyEvidence = [...observationEvidence];
  if (correctionAck) {
    verifyScopes.push("DURABLE_DELIVERY");
    verifyEvidence.push(correctionAck.recordHash);
  }
  if (effectEvidence) {
    verifyScopes.push("BEHAVIORAL_EFFECT");
    verifyEvidence.push(effectEvidence.recordHash);
  }
  return createWorkerCapabilityHandshake({
    provider: "deepseek-harness",
    surface: "deepseek-cordis-plugin",
    runtime: {
      name: "deepseek-harness",
      version: `session-format-${harnessObservation.source.sessionFormatVersion}`,
      sourceRevision: harnessObservation.source.repositoryCommit,
      closureHash: runtimeHandshake?.closureHash ?? workerDigest(harnessObservation.source),
    },
    adapter: { name: "outsider-deepseek-worker-adapter",
      version: DEEPSEEK_WORKER_ADAPTER_VERSION,
      closureHash: DEEPSEEK_WORKER_ADAPTER_CLOSURE_HASH },
    sessionRefHash: harnessObservation.source.sessionIdHash,
    capabilities: {
      OBSERVE: { status: "SUPPORTED", scopes: ["STRUCTURED_EVENTS",
        "ACTION_RESULT_PAIRING", "LIFECYCLE"], evidenceRefs: observationEvidence,
      reasonCode: null },
      INTERVENE: runtimeHandshake
        ? { status: "SUPPORTED", scopes: ["CORRECT_PRE_STEP"],
          evidenceRefs: [runtimeHandshake.recordHash], reasonCode: null }
        : { status: "UNSUPPORTED", scopes: [], evidenceRefs: [],
          reasonCode: "deepseek_pinned_plugin_handshake_missing" },
      VERIFY: { status: "SUPPORTED", scopes: verifyScopes,
        evidenceRefs: verifyEvidence, reasonCode: null },
    },
  });
}

/**
 * `runtimeHandshake` proves the pinned plugin/closure exists.  `correctionAck`
 * proves only durable delivery.  `effectEvidence` can add a pre-registered
 * behavioural effect.  No combination here can assert semantic outcome/loss.
 */
export function createDeepSeekWorkerObservation({
  harnessObservation,
  runtimeHandshake = null,
  correction = null,
  correctionAck = null,
  effectEvidence = null,
} = {}) {
  const observed = verifyDeepSeekHarnessObservation(harnessObservation);
  if (!observed.ok) throw new Error(`DEEPSEEK_OBSERVATION_INVALID:${observed.error}`);
  if ((correctionAck || effectEvidence) && (!runtimeHandshake || !correction)) {
    throw new Error("DEEPSEEK_INTERVENTION_CHAIN_INCOMPLETE");
  }
  if (correction) {
    const checked = verifyDeepSeekHarnessCorrection(correction, runtimeHandshake);
    if (!checked.ok) throw new Error(`DEEPSEEK_CORRECTION_INVALID:${checked.error}`);
  }
  if (correctionAck) {
    const checked = verifyDeepSeekHarnessCorrectionAck(correctionAck, { correction,
      handshake: runtimeHandshake });
    if (!checked.ok) throw new Error(`DEEPSEEK_ACK_INVALID:${checked.error}`);
  }
  if (effectEvidence) {
    if (!correctionAck) throw new Error("DEEPSEEK_EFFECT_ACK_REQUIRED");
    const checked = verifyDeepSeekHarnessEffectEvidence(effectEvidence, { correction,
      handshake: runtimeHandshake, ack: correctionAck,
      afterObservation: harnessObservation });
    if (!checked.ok) throw new Error(`DEEPSEEK_EFFECT_INVALID:${checked.error}`);
  }
  const handshake = capabilityFor({ harnessObservation, runtimeHandshake,
    correctionAck, effectEvidence });
  const bySequence = new Map(harnessObservation.eventRefs.map((ref) => [ref.seq, ref]));
  const entries = [];
  for (const pair of harnessObservation.toolPairs) {
    const call = bySequence.get(pair.callSeq);
    const result = bySequence.get(pair.resultSeq);
    entries.push({ sequence: pair.callSeq, order: 0, type: "call", pair, ref: call });
    entries.push({ sequence: pair.resultSeq, order: 1, type: "result", pair, ref: result });
  }
  for (const ref of harnessObservation.eventRefs) {
    if (ref.type === "turn/start") entries.push({ sequence: ref.seq, order: -1,
      type: "task-start", ref });
    if (ref.type === "turn/end") entries.push({ sequence: ref.seq, order: 2,
      type: "task-end", ref });
    if (ref.type === "tool-workflow/agent-start" || ref.type === "tool-workflow/agent-end") {
      entries.push({ sequence: ref.seq, order: 2, type: "agent-activity", ref });
    }
  }
  if (correctionAck) entries.push({ sequence: correctionAck.durableEventSeq, order: -2,
    type: "delivery", ref: bySequence.get(correctionAck.durableEventSeq) });
  if (effectEvidence) entries.push({ sequence: Number.MAX_SAFE_INTEGER - 1, order: 0,
    type: "effect", ref: null });
  entries.sort((a, b) => a.sequence - b.sequence || a.order - b.order);
  const events = [];
  let ordinal = 0;
  for (const entry of entries) {
    const common = { ordinal: ordinal++, nativeSequence: entry.sequence,
      observedAt: isoFromMillis(entry.ref?.time),
      nativeType: entry.ref == null ? entry.type
        : entry.ref.understood ? entry.ref.type : "unknown",
      nativeRefHash: entry.ref?.eventHash ?? effectEvidence?.recordHash };
    if (entry.type === "call") {
      events.push(createWorkerEvent({ ...common, kind: "ACTION_PROPOSED",
        callRefHash: entry.pair.actionRef, actionName: entry.pair.name,
        argumentsHash: entry.pair.argumentsHash }));
    } else if (entry.type === "result") {
      events.push(createWorkerEvent({ ...common, kind: "ACTION_RESULT",
        callRefHash: entry.pair.actionRef, resultHash: entry.pair.resultHash,
        resultStatus: entry.pair.isError ? "FAILED" : "SUCCEEDED" }));
    } else if (entry.type === "task-start") {
      events.push(createWorkerEvent({ ...common, kind: "TASK_START" }));
    } else if (entry.type === "task-end") {
      events.push(createWorkerEvent({ ...common, kind: "TASK_END" }));
    } else if (entry.type === "agent-activity") {
      events.push(createWorkerEvent({ ...common, kind: "AGENT_ACTIVITY" }));
    } else if (entry.type === "delivery") {
      events.push(createWorkerEvent({ ...common, kind: "INTERVENTION_DELIVERED",
        interventionRefHash: correction.recordHash,
        deliveryStatus: correctionAck.decision === "observed" ? "OBSERVED" : "REFUSED" }));
    } else if (entry.type === "effect") {
      events.push(createWorkerEvent({ ...common, kind: "BEHAVIORAL_EFFECT_VERIFIED",
        interventionRefHash: correction.recordHash }));
    }
  }
  const serialized = Buffer.from(canonicalizeStrict(harnessObservation));
  return createWorkerObservation({
    handshake,
    sourceFormat: "deepseek-harness-observation/v1",
    sourceSnapshotHash: workerDigest(serialized),
    sourceByteLength: serialized.length,
    nativeEventCount: harnessObservation.capacity.eventCount,
    nativeTypeCounts: countTypes(harnessObservation.eventRefs),
    events,
    gaps: harnessObservation.integrity.complete ? []
      : [...harnessObservation.integrity.errors.map((error) =>
        `DEEPSEEK_SOURCE_ERROR:${workerDigest(String(error))}`),
        ...harnessObservation.integrity.unrecognizedRequired.map((item) =>
          `UNKNOWN_REQUIRED:${item.seq}:${workerDigest(String(item.type))}`)],
  });
}

export function verifyDeepSeekWorkerObservation(record, {
  harnessObservation = null,
  runtimeHandshake = null,
  correction = null,
  correctionAck = null,
  effectEvidence = null,
} = {}) {
  const sourceBytes = harnessObservation == null ? null
    : Buffer.from(canonicalizeStrict(harnessObservation));
  const checked = verifyWorkerObservation(record, { sourceBytes });
  if (!checked.ok) return checked;
  if (record.capabilityHandshake?.provider !== "deepseek-harness"
    || record.capabilityHandshake?.adapter?.closureHash !== DEEPSEEK_WORKER_ADAPTER_CLOSURE_HASH
    || record.source?.format !== "deepseek-harness-observation/v1"
    || record.authority?.establishesSemanticOutcome !== false
    || record.authority?.establishesEconomicLoss !== false) {
    return { ok: false, error: "DEEPSEEK_WORKER_OBSERVATION_BOUNDARY_INVALID",
      sourceArtifactsReverified: checked.sourceArtifactsReverified };
  }
  const requiresRuntime = record.capabilityHandshake.capabilities.INTERVENE.status === "SUPPORTED";
  const requiresDelivery = record.declaredClaims?.interventionDelivery === true;
  const requiresEffect = record.declaredClaims?.behavioralEffect === true;
  const completeAdapterSources = harnessObservation !== null
    && (!requiresRuntime || runtimeHandshake !== null)
    && (!requiresDelivery || (correction !== null && correctionAck !== null))
    && (!requiresEffect || effectEvidence !== null);
  let adapterEvidenceReverified = false;
  if (completeAdapterSources) {
    try {
      const replayed = createDeepSeekWorkerObservation({ harnessObservation,
        runtimeHandshake: requiresRuntime ? runtimeHandshake : null,
        correction: requiresDelivery || requiresEffect ? correction : null,
        correctionAck: requiresDelivery || requiresEffect ? correctionAck : null,
        effectEvidence: requiresEffect ? effectEvidence : null });
      if (replayed.recordHash !== record.recordHash) {
        return { ok: false, error: "DEEPSEEK_WORKER_ADAPTER_SOURCE_REPLAY_MISMATCH",
          sourceArtifactsReverified: checked.sourceArtifactsReverified,
          adapterEvidenceReverified: false };
      }
      adapterEvidenceReverified = true;
    } catch (error) {
      return { ok: false, error: `DEEPSEEK_WORKER_ADAPTER_REPLAY_INVALID:${error?.message ?? error}`,
        sourceArtifactsReverified: checked.sourceArtifactsReverified,
        adapterEvidenceReverified: false };
    }
  }
  const claimableControlLevel = adapterEvidenceReverified
    ? record.capabilityHandshake.declaredControlLevel
    : record.capabilityHandshake.claimableControlLevel;
  return { ...checked,
    declaredControlLevel: record.capabilityHandshake.declaredControlLevel,
    claimableControlLevel,
    controlLevel: claimableControlLevel,
    adapterEvidenceReverified,
    verificationMode: adapterEvidenceReverified
      ? "FULL_PROVIDER_SOURCE_REPLAY" : checked.verificationMode,
    establishesInterventionDelivery: adapterEvidenceReverified
      && record.declaredClaims.interventionDelivery,
    establishesBehavioralEffect: adapterEvidenceReverified
      && record.declaredClaims.behavioralEffect,
    eligibleForCorrectionEffectLearning: false,
    eligibleForCorrectionEffectShadowLearning: adapterEvidenceReverified
      && record.learning.candidateForCorrectionEffectLearning,
    learningDisposition: adapterEvidenceReverified
      && record.learning.candidateForCorrectionEffectLearning
      ? "QUARANTINE_SHADOW_ONLY" : "INELIGIBLE",
    threatBoundary: {
      cooperativePinnedHostReplay: adapterEvidenceReverified,
      independentlySignedControllerEnvelopes: false,
      maliciousWorkerOrOsAttestation: false,
      trustedIngressAccepted: false,
    },
  };
}
