/*
 * Deterministic protocol boundary for a future DeepSeek Harness plugin.
 *
 * The plugin is inside the supervised Way and therefore never becomes an
 * adjudicator.  It may prove which pinned runtime closure it loaded, receive
 * one already-audited correction, and acknowledge delivery through a durable
 * Harness event.  Outcome judgment and Stage 0.5 proof remain out-of-process.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";
import { DEEPSEEK_HARNESS_PIN,
  verifyDeepSeekHarnessObservation } from "./outsider-deepseek-harness-adapter.js";

export const DSH_HANDSHAKE_SCHEMA = "outsider/deepseek-harness-handshake/v1";
export const DSH_CORRECTION_SCHEMA = "outsider/deepseek-harness-correction/v2";
export const DSH_ACK_SCHEMA = "outsider/deepseek-harness-correction-ack/v2";
export const DSH_EFFECT_SCHEMA = "outsider/deepseek-harness-effect-evidence/v1";

const digest = (value) => `sha256:${createHash("sha256")
  .update(typeof value === "string" ? value : canonicalizeStrict(value)).digest("hex")}`;
const HASH = /^sha256:[a-f0-9]{64}$/;
const UUIDISH = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,191}$/;
const plain = (value) => value !== null && typeof value === "object" && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const exactHash = (value, label) => {
  if (typeof value !== "string" || !HASH.test(value)) throw new Error(`${label}_HASH_REQUIRED`);
  return value;
};

function contentAddress(body) {
  return { ...body, recordHash: digest(body) };
}

function verifyAddressed(record, schema) {
  if (!plain(record) || record.schema !== schema) return { ok: false, error: "SCHEMA_INVALID" };
  const { recordHash, ...body } = record;
  if (!HASH.test(String(recordHash ?? "")) || digest(body) !== recordHash) {
    return { ok: false, error: "RECORD_HASH_INVALID" };
  }
  return { ok: true, recordHash };
}

export function createDeepSeekHarnessHandshake({
  sessionIdHash,
  profileClosureHash,
  bundleClosureHash,
  pluginClosureHash,
  modelProviderHash,
  subagentProviderHash,
  sandboxProviderHash,
  repositoryCommit = DEEPSEEK_HARNESS_PIN.commit,
  sessionFormatVersion = DEEPSEEK_HARNESS_PIN.sessionFormatVersion,
} = {}) {
  if (repositoryCommit !== DEEPSEEK_HARNESS_PIN.commit
    || sessionFormatVersion !== DEEPSEEK_HARNESS_PIN.sessionFormatVersion) {
    throw new Error("DEEPSEEK_HARNESS_RUNTIME_NOT_PINNED");
  }
  const closure = {
    profileClosureHash: exactHash(profileClosureHash, "PROFILE_CLOSURE"),
    bundleClosureHash: exactHash(bundleClosureHash, "BUNDLE_CLOSURE"),
    pluginClosureHash: exactHash(pluginClosureHash, "PLUGIN_CLOSURE"),
    modelProviderHash: exactHash(modelProviderHash, "MODEL_PROVIDER"),
    subagentProviderHash: exactHash(subagentProviderHash, "SUBAGENT_PROVIDER"),
    sandboxProviderHash: exactHash(sandboxProviderHash, "SANDBOX_PROVIDER"),
  };
  return contentAddress({
    schema: DSH_HANDSHAKE_SCHEMA,
    source: { ...DEEPSEEK_HARNESS_PIN, repositoryCommit, sessionFormatVersion },
    sessionIdHash: exactHash(sessionIdHash, "SESSION_ID"),
    closure,
    closureHash: digest(closure),
    authority: {
      mode: "OBSERVATION_ONLY",
      establishesDelivery: false,
      establishesOutcome: false,
      establishesLossOrLiability: false,
    },
  });
}

export function verifyDeepSeekHarnessHandshake(record) {
  const addressed = verifyAddressed(record, DSH_HANDSHAKE_SCHEMA);
  if (!addressed.ok) return addressed;
  if (record.source?.repositoryCommit !== DEEPSEEK_HARNESS_PIN.commit
    || record.source?.sessionFormatVersion !== DEEPSEEK_HARNESS_PIN.sessionFormatVersion
    || record.closureHash !== digest(record.closure)
    || record.authority?.mode !== "OBSERVATION_ONLY"
    || record.authority?.establishesOutcome !== false) {
    return { ok: false, error: "HANDSHAKE_AUTHORITY_OR_CLOSURE_INVALID" };
  }
  return addressed;
}

export function deepSeekHarnessWayBinding(handshake) {
  const verified = verifyDeepSeekHarnessHandshake(handshake);
  if (!verified.ok) throw new Error(`DEEPSEEK_HARNESS_HANDSHAKE_INVALID:${verified.error}`);
  return Object.freeze({
    wayKind: "agent-runtime",
    runtime: "deepseek-harness",
    instrumentVersionHash: handshake.recordHash,
    wayHash: digest({ source: handshake.source, closure: handshake.closure }),
    correlationRoots: [
      handshake.closure.modelProviderHash,
      handshake.closure.subagentProviderHash,
      handshake.closure.sandboxProviderHash,
      handshake.closure.pluginClosureHash,
    ].sort(),
    authority: "none",
  });
}

export function createDeepSeekHarnessCorrection({
  handshakeHash,
  contractSeal,
  interventionId,
  correctionAuthorityHash,
  correctionHash,
  expectedActionRefs = [],
  controllerIssuedAtEventSeq,
  harnessEventSeqFloor,
} = {}) {
  if (!UUIDISH.test(String(interventionId ?? ""))) throw new Error("INTERVENTION_ID_REQUIRED");
  if (!Number.isSafeInteger(controllerIssuedAtEventSeq) || controllerIssuedAtEventSeq < 0) {
    throw new Error("CONTROLLER_ISSUED_AT_EVENT_SEQ_INVALID");
  }
  if (!Number.isSafeInteger(harnessEventSeqFloor) || harnessEventSeqFloor < -1) {
    throw new Error("HARNESS_EVENT_SEQ_FLOOR_INVALID");
  }
  if (!Array.isArray(expectedActionRefs) || expectedActionRefs.length > 32
    || new Set(expectedActionRefs).size !== expectedActionRefs.length
    || expectedActionRefs.some((ref) => !HASH.test(String(ref)))) {
    throw new Error("EXPECTED_ACTION_REFS_INVALID");
  }
  return contentAddress({
    schema: DSH_CORRECTION_SCHEMA,
    handshakeHash: exactHash(handshakeHash, "HANDSHAKE"),
    contractSeal: exactHash(contractSeal, "CONTRACT_SEAL"),
    interventionId,
    correctionAuthorityHash: exactHash(correctionAuthorityHash, "CORRECTION_AUTHORITY"),
    correctionHash: exactHash(correctionHash, "CORRECTION"),
    expectedActionRefs: [...expectedActionRefs],
    clocks: {
      controllerIssuedAtEventSeq,
      harnessEventSeqFloor,
      comparableAcrossLogs: false,
    },
    authority: {
      source: "OUT_OF_PROCESS_AUDITED_CONTROLLER",
      pluginMayModify: false,
      pluginMayDeclareOutcome: false,
    },
  });
}

export function verifyDeepSeekHarnessCorrection(record, handshake) {
  const addressed = verifyAddressed(record, DSH_CORRECTION_SCHEMA);
  if (!addressed.ok) return addressed;
  const h = verifyDeepSeekHarnessHandshake(handshake);
  if (!h.ok || record.handshakeHash !== handshake.recordHash
    || !Number.isSafeInteger(record.clocks?.controllerIssuedAtEventSeq)
    || record.clocks.controllerIssuedAtEventSeq < 0
    || !Number.isSafeInteger(record.clocks?.harnessEventSeqFloor)
    || record.clocks.harnessEventSeqFloor < -1
    || record.clocks.comparableAcrossLogs !== false
    || record.authority?.source !== "OUT_OF_PROCESS_AUDITED_CONTROLLER"
    || record.authority?.pluginMayDeclareOutcome !== false) {
    return { ok: false, error: "CORRECTION_BINDING_OR_AUTHORITY_INVALID" };
  }
  return addressed;
}

export function createDeepSeekHarnessCorrectionAck({
  correction,
  handshake,
  durableEventSeq,
  injectionPoint,
  decision,
  durableEventHash,
} = {}) {
  const verified = verifyDeepSeekHarnessCorrection(correction, handshake);
  if (!verified.ok) throw new Error(`DEEPSEEK_HARNESS_CORRECTION_INVALID:${verified.error}`);
  if (!Number.isSafeInteger(durableEventSeq)
    || durableEventSeq <= correction.clocks.harnessEventSeqFloor) {
    throw new Error("ACK_DURABLE_EVENT_SEQ_INVALID");
  }
  if (!["agent/pre-step", "tool/pre", "agent/inbox"].includes(injectionPoint)) {
    throw new Error("ACK_INJECTION_POINT_INVALID");
  }
  if (!["observed", "refused"].includes(decision)) throw new Error("ACK_DECISION_INVALID");
  return contentAddress({
    schema: DSH_ACK_SCHEMA,
    handshakeHash: handshake.recordHash,
    correctionRecordHash: correction.recordHash,
    interventionId: correction.interventionId,
    correctionAuthorityHash: correction.correctionAuthorityHash,
    correctionHash: correction.correctionHash,
    pluginClosureHash: handshake.closure.pluginClosureHash,
    durableEventSeq,
    durableEventHash: exactHash(durableEventHash, "DURABLE_EVENT"),
    injectionPoint,
    decision,
    authority: {
      mode: "DELIVERY_ACK_ONLY",
      establishesObservedDelivery: decision === "observed",
      establishesEffect: false,
      establishesOutcome: false,
      establishesLossOrLiability: false,
    },
  });
}

export function verifyDeepSeekHarnessCorrectionAck(ack, { correction, handshake } = {}) {
  const addressed = verifyAddressed(ack, DSH_ACK_SCHEMA);
  if (!addressed.ok) return addressed;
  const correctionVerified = verifyDeepSeekHarnessCorrection(correction, handshake);
  if (!correctionVerified.ok
    || ack.handshakeHash !== handshake.recordHash
    || ack.correctionRecordHash !== correction.recordHash
    || ack.interventionId !== correction.interventionId
    || ack.correctionAuthorityHash !== correction.correctionAuthorityHash
    || ack.correctionHash !== correction.correctionHash
    || ack.pluginClosureHash !== handshake.closure.pluginClosureHash
    || ack.authority?.establishesEffect !== false
    || ack.authority?.establishesOutcome !== false) {
    return { ok: false, error: "ACK_CHAIN_OR_AUTHORITY_INVALID" };
  }
  return addressed;
}

/**
 * Prove a bounded behavioral effect from the host's durable log.  The plugin
 * does not get to make this statement: an out-of-process deterministic matcher
 * requires every pre-registered action ref to have a successful tool result
 * after the durable correction acknowledgement.
 */
export function createDeepSeekHarnessEffectEvidence({ correction, handshake, ack,
  afterObservation } = {}) {
  const ackVerified = verifyDeepSeekHarnessCorrectionAck(ack, { correction, handshake });
  const observationVerified = verifyDeepSeekHarnessObservation(afterObservation);
  if (!ackVerified.ok || !observationVerified.ok
    || afterObservation?.source?.sessionIdHash !== handshake?.sessionIdHash
    || !Array.isArray(correction?.expectedActionRefs)
    || correction.expectedActionRefs.length === 0) {
    throw new Error("DEEPSEEK_EFFECT_INPUT_INVALID");
  }
  const durable = afterObservation.eventRefs.find((event) => event.seq === ack.durableEventSeq);
  if (!durable || durable.eventHash !== ack.durableEventHash) {
    throw new Error("DEEPSEEK_EFFECT_ACK_EVENT_NOT_IN_LOG");
  }
  const matched = correction.expectedActionRefs.map((actionRef) => {
    const pair = afterObservation.toolPairs.find((candidate) =>
      candidate.actionRef === actionRef && candidate.callSeq > ack.durableEventSeq
      && candidate.resultSeq > candidate.callSeq && candidate.isError === false);
    if (!pair) return null;
    return Object.freeze({ actionRef, callSeq: pair.callSeq, resultSeq: pair.resultSeq,
      callIdHash: pair.callIdHash, resultHash: pair.resultHash });
  });
  if (matched.some((item) => item == null)) throw new Error("DEEPSEEK_EFFECT_ACTION_MISSING");
  const body = {
    schema: DSH_EFFECT_SCHEMA,
    handshakeHash: handshake.recordHash,
    correctionRecordHash: correction.recordHash,
    ackRecordHash: ack.recordHash,
    observationRecordHash: afterObservation.recordHash,
    interventionId: correction.interventionId,
    correctionAuthorityHash: correction.correctionAuthorityHash,
    correctionHash: correction.correctionHash,
    matchedActions: matched,
    authority: {
      source: "OUT_OF_PROCESS_DETERMINISTIC_MATCHER",
      establishesObservedDelivery: true,
      establishesBehavioralEffect: true,
      establishesSemanticOutcome: false,
      establishesLossOrLiability: false,
      clearingAuthority: "none",
    },
  };
  return contentAddress(body);
}

export function verifyDeepSeekHarnessEffectEvidence(effect, { correction, handshake,
  ack, afterObservation } = {}) {
  const addressed = verifyAddressed(effect, DSH_EFFECT_SCHEMA);
  if (!addressed.ok) return addressed;
  let expected;
  try {
    expected = createDeepSeekHarnessEffectEvidence({ correction, handshake, ack,
      afterObservation });
  } catch (error) {
    return { ok: false, error: String(error?.message ?? error) };
  }
  if (expected.recordHash !== effect.recordHash
    || effect.authority?.establishesBehavioralEffect !== true
    || effect.authority?.establishesSemanticOutcome !== false) {
    return { ok: false, error: "EFFECT_CHAIN_OR_AUTHORITY_INVALID" };
  }
  return addressed;
}
