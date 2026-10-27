import test from "node:test";
import assert from "node:assert/strict";
import {
  createWorkerCapabilityHandshake, createWorkerEvent, createWorkerObservation,
  requireWorkerCapability, verifyWorkerCapabilityHandshake, verifyWorkerObservation,
  workerDigest,
} from "../src/outsider-worker-adapter.js";

const H = (value) => workerDigest(value);

function handshake({ intervention = false } = {}) {
  return createWorkerCapabilityHandshake({
    provider: "example-worker", surface: "local-cli",
    runtime: { name: "example", version: "1", sourceRevision: null,
      closureHash: H("runtime") },
    adapter: { name: "example-adapter", version: 1, closureHash: H("adapter") },
    sessionRefHash: H("session"),
    capabilities: {
      OBSERVE: { status: "SUPPORTED", scopes: ["STRUCTURED_EVENTS"],
        evidenceRefs: [H("source")], reasonCode: null },
      INTERVENE: intervention
        ? { status: "SUPPORTED", scopes: ["DENY_ACTION"],
          evidenceRefs: [H("canary")], reasonCode: null }
        : { status: "UNSUPPORTED", scopes: [], evidenceRefs: [],
          reasonCode: "native_hook_missing" },
      VERIFY: { status: "SUPPORTED", scopes: ["SOURCE_BYTES", "STRUCTURAL_PAIRING",
        ...(intervention ? ["DURABLE_DELIVERY"] : [])],
      evidenceRefs: [H("source")], reasonCode: null },
    },
  });
}

test("OBSERVE, INTERVENE and VERIFY remain separate machine-checkable claims", () => {
  const observeOnly = handshake();
  assert.equal(verifyWorkerCapabilityHandshake(observeOnly).ok, true);
  assert.equal(observeOnly.controlLevel, "OBSERVATION_ONLY");
  assert.equal(requireWorkerCapability(observeOnly, "OBSERVE", "STRUCTURED_EVENTS").ok, true);
  const missing = requireWorkerCapability(observeOnly, "INTERVENE", "DENY_ACTION");
  assert.equal(missing.ok, undefined);
  assert.equal(missing.hostDisposition, "CONTINUE_UNSUPERVISED");
  assert.equal(missing.blocksHost, false);
  assert.equal(missing.operatorVisible, true);

  const controlled = handshake({ intervention: true });
  assert.equal(controlled.declaredControlLevel, "ACTION_CONTROLLED");
  assert.equal(controlled.claimableControlLevel, "OBSERVATION_ONLY");
  assert.equal(controlled.controlLevel, "OBSERVATION_ONLY");
  const unattested = requireWorkerCapability(controlled, "INTERVENE", "DENY_ACTION");
  assert.equal(unattested.ok, undefined);
  assert.equal(unattested.code, "WORKER_CAPABILITY_ADAPTER_ATTESTATION_REQUIRED");
});

test("unsupported capability cannot smuggle scopes or a blocking failure policy", () => {
  const base = {
    provider: "example-worker", surface: "local-cli",
    runtime: { name: "example", version: "1", sourceRevision: null,
      closureHash: H("runtime") },
    adapter: { name: "example-adapter", version: 1, closureHash: H("adapter") },
    capabilities: {
      OBSERVE: { status: "SUPPORTED", scopes: ["STRUCTURED_EVENTS"],
        evidenceRefs: [], reasonCode: null },
      INTERVENE: { status: "UNSUPPORTED", scopes: ["DENY_ACTION"],
        evidenceRefs: [], reasonCode: "missing" },
      VERIFY: { status: "SUPPORTED", scopes: ["STRUCTURAL_PAIRING"],
        evidenceRefs: [], reasonCode: null },
    },
  };
  assert.throws(() => createWorkerCapabilityHandshake(base), /UNSUPPORTED_REQUIRES_REASON/);
  base.capabilities.INTERVENE.scopes = [];
  base.failurePolicy = { unsupported: "DENY", controllerUnavailable: "DENY",
    blocksHostWithoutCapability: true };
  assert.throws(() => createWorkerCapabilityHandshake(base), /MUST_NOT_BLOCK/);
});

test("content-addressed observation pairs calls and can reverify exact source bytes", () => {
  const source = Buffer.from("private native bytes");
  const proposed = createWorkerEvent({ ordinal: 0, nativeSequence: 4,
    observedAt: "2026-08-21T00:00:00Z", kind: "ACTION_PROPOSED",
    nativeType: "call", nativeRefHash: H("call-event"), callRefHash: H("call"),
    actionName: "shell", argumentsHash: H("secret command") });
  const result = createWorkerEvent({ ordinal: 1, nativeSequence: 5,
    observedAt: "2026-08-21T00:00:01Z", kind: "ACTION_RESULT",
    nativeType: "result", nativeRefHash: H("result-event"), callRefHash: H("call"),
    resultHash: H("secret output"), resultStatus: "SUCCEEDED" });
  const record = createWorkerObservation({ handshake: handshake(),
    sourceFormat: "example/v1", sourceSnapshotHash: H(source), sourceByteLength: source.length,
    nativeEventCount: 2, nativeTypeCounts: { call: 1, result: 1 },
    events: [proposed, result] });
  assert.equal(record.integrity.complete, true);
  assert.equal(verifyWorkerObservation(record).sourceArtifactsReverified, false);
  assert.equal(verifyWorkerObservation(record, { sourceBytes: source }).sourceArtifactsReverified, true);
  assert.equal(verifyWorkerObservation(record, { sourceBytes: "altered" }).ok, false);
});

test("orphan results and tampered authority fail rather than becoming proof", () => {
  const orphan = createWorkerEvent({ ordinal: 0, nativeSequence: 0, kind: "ACTION_RESULT",
    nativeType: "result", nativeRefHash: H("native"), callRefHash: H("missing"),
    resultHash: H("output"), resultStatus: "OBSERVED_UNKNOWN" });
  const record = createWorkerObservation({ handshake: handshake(), sourceFormat: "example/v1",
    sourceSnapshotHash: H("source"), sourceByteLength: 6, nativeEventCount: 1,
    nativeTypeCounts: { result: 1 }, events: [orphan] });
  assert.equal(record.integrity.complete, false);
  assert.ok(record.integrity.gaps.includes("ACTION_RESULT_ORPHAN"));

  const forged = structuredClone(record);
  forged.authority.establishesSemanticOutcome = true;
  assert.equal(verifyWorkerObservation(forged).ok, false);

  const resealed = structuredClone(record);
  resealed.authority.establishesSemanticOutcome = true;
  const { recordHash: _old, ...body } = resealed;
  resealed.recordHash = workerDigest(body);
  assert.equal(verifyWorkerObservation(resealed).ok, false,
    "re-sealing a permission escalation cannot bypass derived authority fields");
});

test("empty or unsupported observations cannot become learning-eligible", () => {
  const unsupported = createWorkerCapabilityHandshake({
    provider: "unknown-worker", surface: "unknown-cli",
    runtime: { name: "unknown", version: null, sourceRevision: null,
      closureHash: H("unknown-runtime") },
    adapter: { name: "generic-adapter", version: 1, closureHash: H("generic-adapter") },
    capabilities: {
      OBSERVE: { status: "UNSUPPORTED", scopes: [], evidenceRefs: [],
        reasonCode: "structured_events_missing" },
      INTERVENE: { status: "UNSUPPORTED", scopes: [], evidenceRefs: [],
        reasonCode: "native_hook_missing" },
      VERIFY: { status: "SUPPORTED", scopes: ["STRUCTURAL_PAIRING"],
        evidenceRefs: [], reasonCode: null },
    },
  });
  const record = createWorkerObservation({ handshake: unsupported,
    sourceFormat: "unknown/v1", sourceSnapshotHash: H(""), sourceByteLength: 0,
    nativeEventCount: 0, nativeTypeCounts: {}, events: [] });
  assert.equal(record.integrity.complete, true);
  assert.equal(record.authority.establishesObservation, false);
  assert.equal(record.learning.eligibleForBehavioralMeasurement, false);
  assert.equal(verifyWorkerObservation(record).verificationMode, "SELF_CHECK_ONLY");
});

test("delivery and effect claims require their exact handshake scopes and paired ref", () => {
  const delivery = createWorkerEvent({ ordinal: 0, nativeSequence: 0,
    kind: "INTERVENTION_DELIVERED", nativeType: "correction",
    nativeRefHash: H("delivery"), interventionRefHash: H("intervention"),
    deliveryStatus: "OBSERVED" });
  const effect = createWorkerEvent({ ordinal: 1, nativeSequence: 1,
    kind: "BEHAVIORAL_EFFECT_VERIFIED", nativeType: "effect",
    nativeRefHash: H("effect"), interventionRefHash: H("other-intervention") });
  const record = createWorkerObservation({ handshake: handshake(), sourceFormat: "example/v1",
    sourceSnapshotHash: H("source"), sourceByteLength: 6, nativeEventCount: 2,
    nativeTypeCounts: { correction: 1, effect: 1 }, events: [delivery, effect] });
  assert.equal(record.authority.establishesInterventionDelivery, false);
  assert.equal(record.authority.establishesBehavioralEffect, false);
  assert.equal(record.learning.eligibleForCorrectionEffectLearning, false);
});

test("event envelopes and gap codes cannot smuggle raw commands or secrets", () => {
  assert.throws(() => createWorkerEvent({ ordinal: 0, kind: "TASK_START",
    nativeType: "turn/start", nativeRefHash: H("event"),
    actionName: "rm -rf /private" }), /LIFECYCLE_EVENT_FIELDS_INVALID|ACTION_NAME_INVALID/);
  assert.throws(() => createWorkerEvent({ ordinal: 0, kind: "TASK_START",
    nativeType: "Bearer secret-token", nativeRefHash: H("event") }),
  /WORKER_EVENT_ENVELOPE_INVALID/);
  assert.throws(() => createWorkerObservation({ handshake: handshake(),
    sourceFormat: "example/v1", sourceSnapshotHash: H("source"), sourceByteLength: 6,
    nativeEventCount: 1, nativeTypeCounts: { call: 1 }, events: [],
    gaps: ["PARSER_ERROR:password=secret"] }), /WORKER_OBSERVATION_INPUT_INVALID/);
  assert.throws(() => createWorkerObservation({ handshake: handshake(),
    sourceFormat: "example/v1", sourceSnapshotHash: H("source"), sourceByteLength: 6,
    nativeEventCount: 2, nativeTypeCounts: { call: 1 }, events: [] }),
  /WORKER_NATIVE_COUNT_TOTAL_MISMATCH/);
  const refusal = requireWorkerCapability(handshake(), "INTERVENE", "password=secret");
  assert.equal(refusal.scope, "UNKNOWN");
  assert.doesNotMatch(JSON.stringify(refusal), /password|secret/);
});

test("fully self-consistent fake control bytes remain self-asserted and effect-ineligible", () => {
  const fakeHandshake = createWorkerCapabilityHandshake({
    provider: "fake-worker", surface: "fake-cli",
    runtime: { name: "fake", version: "1", sourceRevision: null,
      closureHash: H("fake-runtime") },
    adapter: { name: "fake-adapter", version: 1, closureHash: H("fake-adapter") },
    capabilities: {
      OBSERVE: { status: "SUPPORTED", scopes: ["STRUCTURED_EVENTS"],
        evidenceRefs: [H("fabricated")], reasonCode: null },
      INTERVENE: { status: "SUPPORTED", scopes: ["CORRECT_PRE_STEP"],
        evidenceRefs: [H("fabricated")], reasonCode: null },
      VERIFY: { status: "SUPPORTED", scopes: ["SOURCE_BYTES", "DURABLE_DELIVERY",
        "BEHAVIORAL_EFFECT"], evidenceRefs: [H("fabricated")], reasonCode: null },
    },
  });
  const intervention = H("fabricated-intervention");
  const events = [
    createWorkerEvent({ ordinal: 0, nativeSequence: 0, kind: "INTERVENTION_DELIVERED",
      nativeType: "correction", nativeRefHash: H("fake-delivery"),
      interventionRefHash: intervention, deliveryStatus: "OBSERVED" }),
    createWorkerEvent({ ordinal: 1, nativeSequence: 1, kind: "BEHAVIORAL_EFFECT_VERIFIED",
      nativeType: "effect", nativeRefHash: H("fake-effect"),
      interventionRefHash: intervention }),
  ];
  const source = Buffer.from("internally consistent attacker transcript");
  const fake = createWorkerObservation({ handshake: fakeHandshake,
    sourceFormat: "fake/v1", sourceSnapshotHash: H(source), sourceByteLength: source.length,
    nativeEventCount: 2, nativeTypeCounts: { correction: 1, effect: 1 }, events });
  assert.equal(fake.capabilityHandshake.declaredControlLevel, "DELIVERY_SUPERVISED");
  assert.equal(fake.capabilityHandshake.claimableControlLevel, "OBSERVATION_ONLY");
  assert.equal(fake.declaredClaims.behavioralEffect, true);
  assert.equal(fake.authority.establishesBehavioralEffect, false);
  const verified = verifyWorkerObservation(fake, { sourceBytes: source });
  assert.equal(verified.verificationMode, "FULL_SOURCE_REPLAY");
  assert.equal(verified.claimableControlLevel, "OBSERVATION_ONLY");
  assert.equal(fake.learning.eligibleForCorrectionEffectLearning, false);
});
