import test from "node:test";
import assert from "node:assert/strict";
import {
  createDeepSeekHarnessObservation, deepSeekHarnessActionRef,
} from "../src/outsider-deepseek-harness-adapter.js";
import {
  createDeepSeekHarnessCorrection, createDeepSeekHarnessCorrectionAck,
  createDeepSeekHarnessEffectEvidence, createDeepSeekHarnessHandshake,
} from "../src/outsider-deepseek-harness-protocol.js";
import {
  createDeepSeekWorkerObservation, verifyDeepSeekWorkerObservation,
} from "../src/outsider-deepseek-worker-adapter.js";
import { workerDigest } from "../src/outsider-worker-adapter.js";

const H = (value) => workerDigest(value);
const event = (seq, type, data) => ({ seq, type, time: 1_000 + seq, data });

function runtimeHandshake() {
  return createDeepSeekHarnessHandshake({ sessionIdHash: H("private-session"),
    profileClosureHash: H("profile"), bundleClosureHash: H("bundle"),
    pluginClosureHash: H("plugin"), modelProviderHash: H("model"),
    subagentProviderHash: H("subagent"), sandboxProviderHash: H("sandbox") });
}

function chain() {
  const handshake = runtimeHandshake();
  const rawArguments = '{"command":"npm test -- secret"}';
  const actionRef = deepSeekHarnessActionRef("shell", rawArguments);
  const correction = createDeepSeekHarnessCorrection({ handshakeHash: handshake.recordHash,
    contractSeal: H("contract"), interventionId: "deepseek-intervention-0001",
    correctionAuthorityHash: H("authority"), correctionHash: H("correction text"),
    expectedActionRefs: [actionRef], controllerIssuedAtEventSeq: 1,
    harnessEventSeqFloor: 1 });
  const durable = event(2, "user/message", { message: { id: "durable-message" } });
  const preliminary = createDeepSeekHarnessObservation([durable], { sessionId: "private-session" });
  const ack = createDeepSeekHarnessCorrectionAck({ correction, handshake,
    durableEventSeq: 2, durableEventHash: preliminary.eventRefs[0].eventHash,
    injectionPoint: "agent/pre-step", decision: "observed" });
  const events = [event(0, "turn/start", { turn: 1 }),
    event(1, "step/start", { turn: 1, step: 1 }), durable,
    event(3, "tool/call", { callId: "private-call", name: "shell",
      arguments: rawArguments }),
    event(4, "tool/result", { message: { content: [{ type: "tool-result",
      toolCallId: "private-call", content: [{ type: "text", text: "secret-output" }] }] } }),
    event(5, "step/end", { turn: 1, step: 1 }),
    event(6, "turn/end", { turn: 1 })];
  const observation = createDeepSeekHarnessObservation(events, { sessionId: "private-session" });
  const effect = createDeepSeekHarnessEffectEvidence({ correction, handshake, ack,
    afterObservation: observation });
  return { handshake, correction, ack, observation, effect };
}

test("Harness events alone remain observation-only", () => {
  const { observation } = chain();
  const generic = createDeepSeekWorkerObservation({ harnessObservation: observation });
  assert.equal(generic.capabilityHandshake.controlLevel, "OBSERVATION_ONLY");
  assert.equal(generic.capabilityHandshake.capabilities.INTERVENE.status, "UNSUPPORTED");
  assert.equal(generic.authority.establishesInterventionDelivery, false);
  assert.equal(generic.authority.establishesBehavioralEffect, false);
  assert.equal(verifyDeepSeekWorkerObservation(generic, { harnessObservation: observation }).ok, true);
});

test("pinned plugin + durable ack + preregistered action prove delivery/effect, not outcome", () => {
  const c = chain();
  const generic = createDeepSeekWorkerObservation({ harnessObservation: c.observation,
    runtimeHandshake: c.handshake, correction: c.correction,
    correctionAck: c.ack, effectEvidence: c.effect });
  assert.equal(generic.capabilityHandshake.declaredControlLevel, "DELIVERY_SUPERVISED");
  assert.equal(generic.capabilityHandshake.claimableControlLevel, "OBSERVATION_ONLY");
  assert.equal(generic.capabilityHandshake.controlLevel, "OBSERVATION_ONLY");
  assert.ok(generic.capabilityHandshake.capabilities.VERIFY.scopes.includes("DURABLE_DELIVERY"));
  assert.ok(generic.capabilityHandshake.capabilities.VERIFY.scopes.includes("BEHAVIORAL_EFFECT"));
  assert.equal(generic.declaredClaims.interventionDelivery, true);
  assert.equal(generic.declaredClaims.behavioralEffect, true);
  assert.equal(generic.authority.establishesInterventionDelivery, false);
  assert.equal(generic.authority.establishesBehavioralEffect, false);
  assert.equal(generic.authority.establishesSemanticOutcome, false);
  assert.equal(generic.authority.establishesEconomicLoss, false);
  assert.equal(generic.learning.eligibleForPricing, false);
  assert.doesNotMatch(JSON.stringify(generic), /private-session|private-call|secret-output|npm test/);
  const verified = verifyDeepSeekWorkerObservation(generic, {
    harnessObservation: c.observation, runtimeHandshake: c.handshake,
    correction: c.correction, correctionAck: c.ack, effectEvidence: c.effect,
  });
  assert.equal(verified.sourceArtifactsReverified, true);
  assert.equal(verified.adapterEvidenceReverified, true);
  assert.equal(verified.claimableControlLevel, "DELIVERY_SUPERVISED");
  assert.equal(verified.establishesInterventionDelivery, true);
  assert.equal(verified.establishesBehavioralEffect, true);
  assert.equal(verified.eligibleForCorrectionEffectLearning, false);
  assert.equal(verified.eligibleForCorrectionEffectShadowLearning, true);
  assert.equal(verified.learningDisposition, "QUARANTINE_SHADOW_ONLY");
  assert.equal(verified.threatBoundary.cooperativePinnedHostReplay, true);
  assert.equal(verified.threatBoundary.maliciousWorkerOrOsAttestation, false);
});

test("source bytes alone cannot authenticate DeepSeek delivery/effect claims", () => {
  const c = chain();
  const generic = createDeepSeekWorkerObservation({ harnessObservation: c.observation,
    runtimeHandshake: c.handshake, correction: c.correction,
    correctionAck: c.ack, effectEvidence: c.effect });
  const sourceOnly = verifyDeepSeekWorkerObservation(generic,
    { harnessObservation: c.observation });
  assert.equal(sourceOnly.ok, true);
  assert.equal(sourceOnly.adapterEvidenceReverified, false);
  assert.equal(sourceOnly.claimableControlLevel, "OBSERVATION_ONLY");
  assert.equal(sourceOnly.establishesBehavioralEffect, false);
  assert.equal(sourceOnly.eligibleForCorrectionEffectLearning, false);
  assert.equal(sourceOnly.eligibleForCorrectionEffectShadowLearning, false);
});

test("ack/effect cannot be accepted without their complete authority chain", () => {
  const c = chain();
  assert.throws(() => createDeepSeekWorkerObservation({
    harnessObservation: c.observation, correctionAck: c.ack,
  }), /CHAIN_INCOMPLETE/);
  const forged = structuredClone(c.effect);
  forged.authority.establishesSemanticOutcome = true;
  assert.throws(() => createDeepSeekWorkerObservation({ harnessObservation: c.observation,
    runtimeHandshake: c.handshake, correction: c.correction,
    correctionAck: c.ack, effectEvidence: forged }), /EFFECT_INVALID/);
});
