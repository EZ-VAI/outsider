import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  createDeepSeekHarnessHandshake,
  verifyDeepSeekHarnessHandshake,
  deepSeekHarnessWayBinding,
  createDeepSeekHarnessCorrection,
  verifyDeepSeekHarnessCorrection,
  createDeepSeekHarnessCorrectionAck,
  verifyDeepSeekHarnessCorrectionAck,
  createDeepSeekHarnessEffectEvidence,
  verifyDeepSeekHarnessEffectEvidence,
} from "../src/outsider-deepseek-harness-protocol.js";
import { createDeepSeekHarnessObservation, deepSeekHarnessActionRef } from
  "../src/outsider-deepseek-harness-adapter.js";

const H = (value) => `sha256:${createHash("sha256").update(value).digest("hex")}`;
const handshake = () => createDeepSeekHarnessHandshake({
  sessionIdHash: H("session"),
  profileClosureHash: H("profile"),
  bundleClosureHash: H("bundle"),
  pluginClosureHash: H("plugin"),
  modelProviderHash: H("model"),
  subagentProviderHash: H("subagent"),
  sandboxProviderHash: H("sandbox"),
});

test("a pinned runtime closure becomes an observation-only Way identity", () => {
  const h = handshake();
  assert.equal(verifyDeepSeekHarnessHandshake(h).ok, true);
  const way = deepSeekHarnessWayBinding(h);
  assert.equal(way.runtime, "deepseek-harness");
  assert.equal(way.authority, "none");
  assert.equal(way.instrumentVersionHash, h.recordHash);
  assert.deepEqual(way.correlationRoots, [...way.correlationRoots].sort());
});

test("one audited correction and durable ack retain the same authority chain", () => {
  const h = handshake();
  const correction = createDeepSeekHarnessCorrection({
    handshakeHash: h.recordHash,
    contractSeal: H("contract"),
    interventionId: "intervention-0001",
    correctionAuthorityHash: H("authority"),
    correctionHash: H("correction"),
    expectedActionRefs: [H("edit"), H("test")],
    controllerIssuedAtEventSeq: 10, harnessEventSeqFloor: 4,
  });
  assert.equal(verifyDeepSeekHarnessCorrection(correction, h).ok, true);
  const ack = createDeepSeekHarnessCorrectionAck({
    correction, handshake: h, durableEventSeq: 12,
    injectionPoint: "agent/pre-step", decision: "observed", durableEventHash: H("event-12"),
  });
  assert.equal(verifyDeepSeekHarnessCorrectionAck(ack, { correction, handshake: h }).ok, true);
  assert.equal(ack.interventionId, correction.interventionId);
  assert.equal(ack.correctionAuthorityHash, correction.correctionAuthorityHash);
  assert.equal(ack.authority.establishesObservedDelivery, true);
  assert.equal(ack.authority.establishesEffect, false);
  assert.equal(ack.authority.establishesOutcome, false);
});

test("an in-process plugin cannot rewrite authority, closure, or causal outcome", () => {
  const h = handshake();
  const correction = createDeepSeekHarnessCorrection({
    handshakeHash: h.recordHash,
    contractSeal: H("contract"), interventionId: "intervention-0002",
    correctionAuthorityHash: H("authority"), correctionHash: H("correction"),
    controllerIssuedAtEventSeq: 2, harnessEventSeqFloor: 1,
  });
  const ack = createDeepSeekHarnessCorrectionAck({
    correction, handshake: h, durableEventSeq: 3, injectionPoint: "tool/pre",
    decision: "observed", durableEventHash: H("event-3"),
  });
  for (const mutation of [
    { correctionAuthorityHash: H("forged-authority") },
    { pluginClosureHash: H("forged-plugin") },
    { authority: { ...ack.authority, establishesOutcome: true } },
  ]) {
    const forged = { ...ack, ...mutation };
    const result = verifyDeepSeekHarnessCorrectionAck(forged, { correction, handshake: h });
    assert.equal(result.ok, false, JSON.stringify(mutation));
  }
});

test("unknown injection points, pre-request acks, and unpinned runtime closures fail closed", () => {
  const h = handshake();
  const correction = createDeepSeekHarnessCorrection({
    handshakeHash: h.recordHash,
    contractSeal: H("contract"), interventionId: "intervention-0003",
    correctionAuthorityHash: H("authority"), correctionHash: H("correction"),
    controllerIssuedAtEventSeq: 9, harnessEventSeqFloor: 4,
  });
  assert.throws(() => createDeepSeekHarnessCorrectionAck({ correction, handshake: h,
    durableEventSeq: 4, injectionPoint: "agent/pre-step", decision: "observed",
    durableEventHash: H("event") }), /SEQ_INVALID/);
  assert.throws(() => createDeepSeekHarnessCorrectionAck({ correction, handshake: h,
    durableEventSeq: 10, injectionPoint: "plugin/magic", decision: "observed",
    durableEventHash: H("event") }), /INJECTION_POINT_INVALID/);
  assert.throws(() => createDeepSeekHarnessHandshake({
    sessionIdHash: H("s"), profileClosureHash: H("p"), bundleClosureHash: H("b"),
    pluginClosureHash: H("x"), modelProviderHash: H("m"), subagentProviderHash: H("a"),
    sandboxProviderHash: H("z"), repositoryCommit: "main",
  }), /RUNTIME_NOT_PINNED/);
});

test("only a successful pre-registered action after durable ack establishes behavioral effect", () => {
  const h = handshake();
  const rawArguments = '{"command":"npm test"}';
  const actionRef = deepSeekHarnessActionRef("shell", rawArguments);
  const correction = createDeepSeekHarnessCorrection({ handshakeHash: h.recordHash,
    contractSeal: H("contract"), interventionId: "intervention-effect-0001",
    correctionAuthorityHash: H("authority"), correctionHash: H("correction"),
    expectedActionRefs: [actionRef], controllerIssuedAtEventSeq: 2,
    harnessEventSeqFloor: 1 });
  const durable = { type: "user/message", seq: 2, time: 2, data: {
    message: { id: "durable" } } };
  const ack = createDeepSeekHarnessCorrectionAck({ correction, handshake: h,
    durableEventSeq: 2, injectionPoint: "agent/pre-step", decision: "observed",
    durableEventHash: H("placeholder") });
  // Bind the acknowledgement to the adapter's exact event hash.
  const preliminary = createDeepSeekHarnessObservation([durable], { sessionId: "session" });
  const boundAck = createDeepSeekHarnessCorrectionAck({ correction, handshake: h,
    durableEventSeq: 2, injectionPoint: "agent/pre-step", decision: "observed",
    durableEventHash: preliminary.eventRefs[0].eventHash });
  const events = [durable,
    { type: "tool/call", seq: 3, time: 3, data: { callId: "call-1", name: "shell",
      arguments: rawArguments } },
    { type: "tool/result", seq: 4, time: 4, data: { message: { content: [{
      type: "tool-result", toolCallId: "call-1", content: [] }] } } }];
  const after = createDeepSeekHarnessObservation(events, { sessionId: "session" });
  // Event hashing is independent of the rest of the log, so the bound hash is stable.
  assert.equal(after.eventRefs[0].eventHash, boundAck.durableEventHash);
  const effect = createDeepSeekHarnessEffectEvidence({ correction, handshake: h,
    ack: boundAck, afterObservation: after });
  assert.equal(verifyDeepSeekHarnessEffectEvidence(effect, { correction,
    handshake: h, ack: boundAck, afterObservation: after }).ok, true);
  assert.equal(effect.authority.establishesBehavioralEffect, true);
  assert.equal(effect.authority.establishesSemanticOutcome, false);
  assert.throws(() => createDeepSeekHarnessEffectEvidence({ correction, handshake: h,
    ack, afterObservation: after }), /ACK_EVENT_NOT_IN_LOG/);
  const failed = createDeepSeekHarnessObservation([durable, events[1], {
    ...events[2], data: { ...events[2].data, error: "failed" } }], { sessionId: "session" });
  assert.throws(() => createDeepSeekHarnessEffectEvidence({ correction, handshake: h,
    ack: boundAck, afterObservation: failed }), /ACTION_MISSING/);
});
