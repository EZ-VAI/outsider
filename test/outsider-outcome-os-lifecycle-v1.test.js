import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { prepareOutcomeOsV1 }
  from "../src/outsider-three-layer-outcome-product-contract-v1.js";
import {
  OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_BOUNDARY,
  OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_EVENT_TYPES,
  createOutcomeOsLifecycleRuntimeV1,
  replayOutcomeOsLifecycleV1,
} from "../src/outsider-outcome-os-lifecycle-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const CONTRACT_ID = `contract_${h("contract").slice(7, 39)}`;

function outcomeOs() {
  return prepareOutcomeOsV1({
    requestIdHash: h("request"),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h("outcome"),
    acceptancePredicateHash: h("acceptance"),
    formationDeadline: "2026-09-04T12:30:00.000Z",
    completionDeadline: "2026-09-04T13:00:00.000Z",
    maximumLossConstraintHash: h("loss"),
    typedGraphRefs: {
      principalEpochRefHash: h("principal-epoch"),
      accountableDeploymentRefHash: h("deployment"),
      runtimeRefHash: h("runtime"),
      embodimentRefHash: null,
      delegationRefHash: h("delegation"),
      episodeRefHash: h("episode"),
      attemptRefHash: h("attempt"),
    },
  });
}

function create(runtime, overrides = {}) {
  const artifact = outcomeOs();
  return runtime.create({
    contractId: CONTRACT_ID,
    outcomeOs: artifact,
    expectedOutcomeOsArtifactHash: artifact.artifactHash,
    recordedAt: "2026-09-04T12:00:00.000Z",
    idempotencyKeyHash: h("create-key"),
    ...overrides,
  });
}

function open(runtime, headHash, overrides = {}) {
  return runtime.append({
    eventType: "CONTRACT_OPENED",
    recordedAt: "2026-09-04T12:05:00.000Z",
    idempotencyKeyHash: h("open-key"),
    expectedHeadHash: headHash,
    payload: { openInstructionRefHash: h("open-instruction") },
    ...overrides,
  });
}

function attemptPayload(overrides = {}) {
  return {
    episodeRefHash: h("episode"),
    attemptRefHash: h("attempt"),
    attemptSetCompositionRefHash: h("attempt-set"),
    attemptEvidenceRefHash: h("attempt-evidence"),
    occurrenceRefHash: h("attempt-occurrence"),
    executionDisposition: "SUCCEEDED",
    outcomeObservationStatus: "OBSERVED",
    reportedOutcomeEvidenceRefHash: h("reported-outcome"),
    attemptMembershipSourceReplayVerified: false,
    ...overrides,
  };
}

test("Layer 1 lifecycle creates a hash-only contract with no route roles", () => {
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const result = create(runtime);
  assert.equal(result.head.state, "CREATED");
  assert.equal(result.head.currentRevision, 0);
  assert.equal(result.receipt.eventType, "CONTRACT_CREATED");
  assert.equal(result.outcomePromiseIssued, false);
  assert.equal(result.outcomeCommitIssued, false);
  assert.equal(OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_BOUNDARY.primaryRoleRequired,
    false);
  assert.equal(OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_BOUNDARY.recoveryRoleRequired,
    false);
  assert.equal(OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_BOUNDARY
    .independentWitnessRoleRequired, false);
  assert.deepEqual(OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_EVENT_TYPES.slice(0, 5), [
    "CONTRACT_CREATED", "CONTRACT_OPENED", "ATTEMPT_EVIDENCE_APPENDED",
    "OBSERVED_CLOSED", "CONTRACT_EXPIRED",
  ]);
});

test("create is exactly idempotent and changed reuse conflicts", () => {
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const first = create(runtime);
  const replay = create(runtime);
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.eventAppended, false);
  assert.equal(replay.receipt.receiptHash, first.receipt.receiptHash);
  assert.equal(runtime.exportEvents().length, 1);
  assert.throws(() => create(runtime, {
    recordedAt: "2026-09-04T12:00:01.000Z",
  }), /CREATE_IDEMPOTENCY_CONFLICT_OR_ALREADY_CREATED/);
});

test("open and Attempt evidence append exact revision/supersession links", () => {
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = create(runtime);
  const opened = open(runtime, created.head.headHash);
  const attempted = runtime.append({
    eventType: "ATTEMPT_EVIDENCE_APPENDED",
    recordedAt: "2026-09-04T12:10:00.000Z",
    idempotencyKeyHash: h("attempt-key"),
    expectedHeadHash: opened.head.headHash,
    payload: attemptPayload(),
  });
  const events = runtime.exportEvents();
  assert.equal(attempted.head.state, "OPEN");
  assert.equal(attempted.head.attemptEvidenceEventCount, 1);
  assert.equal(events[2].appendOnlyLineage.revision, 2);
  assert.equal(events[2].appendOnlyLineage.predecessorEventHash,
    events[1].eventHash);
  assert.equal(events[2].appendOnlyLineage.supersedesEventHash,
    events[1].eventHash);
  assert.equal(events[2].payload.executionDisposition, "SUCCEEDED");
  assert.equal(events[2].attemptEvidenceAcceptedAsOutcomeTruth, false);
});

test("idempotent append replays before stale-head CAS but changed body fails",
  () => {
    const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
    const created = create(runtime);
    const opened = open(runtime, created.head.headHash);
    const replayed = open(runtime, h("stale-head"));
    assert.equal(replayed.idempotentReplay, true);
    assert.equal(replayed.receipt.receiptHash, opened.receipt.receiptHash);
    assert.throws(() => open(runtime, opened.head.headHash, {
      payload: { openInstructionRefHash: h("changed") },
    }), /IDEMPOTENCY_KEY_OPERATION_CONFLICT/);
  });

test("observed closure is terminal but remains caller-reported, not truth", () => {
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = create(runtime);
  const opened = open(runtime, created.head.headHash);
  const closed = runtime.append({
    eventType: "OBSERVED_CLOSED",
    recordedAt: "2026-09-04T12:20:00.000Z",
    idempotencyKeyHash: h("close-key"),
    expectedHeadHash: opened.head.headHash,
    payload: {
      observedAt: "2026-09-04T12:19:00.000Z",
      observationStatus: "OBSERVED_SATISFIED",
      observationEvidenceRefHash: h("closure-evidence"),
      observationSourceClass: "CALLER_REPORTED_HASH_REFERENCE",
      independentOutcomeTruthEstablished: false,
    },
  });
  assert.equal(closed.head.state, "OBSERVED_CLOSED");
  assert.equal(closed.head.outcomeTruthEstablished, false);
  assert.equal(closed.head.outcomePromiseIssued, false);
  assert.throws(() => runtime.append({
    eventType: "ATTEMPT_EVIDENCE_APPENDED",
    recordedAt: "2026-09-04T12:21:00.000Z",
    idempotencyKeyHash: h("late-attempt"),
    expectedHeadHash: closed.head.headHash,
    payload: attemptPayload(),
  }), /ATTEMPT_EVIDENCE_TRANSITION_INVALID/);
});

test("expiry requires the deadline and preserves a caller-clock caveat", () => {
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = create(runtime);
  const input = {
    eventType: "CONTRACT_EXPIRED",
    recordedAt: "2026-09-04T12:59:59.000Z",
    idempotencyKeyHash: h("expire-key"),
    expectedHeadHash: created.head.headHash,
    payload: {
      expiredAt: "2026-09-04T12:59:59.000Z",
      expiryEvidenceRefHash: h("expiry-evidence"),
      deadlineClockTrusted: false,
    },
  };
  assert.throws(() => runtime.append(input),
    /CONTRACT_EXPIRE_TRANSITION_INVALID/);
  const expired = runtime.append({
    ...input,
    recordedAt: "2026-09-04T13:00:00.000Z",
    payload: { ...input.payload, expiredAt: "2026-09-04T13:00:00.000Z" },
  });
  assert.equal(expired.head.state, "EXPIRED");
  assert.equal(runtime.exportEvents().at(-1).payload.deadlineClockTrusted,
    false);
});

test("contract supersession terminates the old head without erasing history",
  () => {
    const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
    const created = create(runtime);
    const result = runtime.supersede({
      recordedAt: "2026-09-04T12:06:00.000Z",
      idempotencyKeyHash: h("supersede-key"),
      expectedHeadHash: created.head.headHash,
      successorContractRefHash: h("successor-contract"),
      successorOutcomeOsArtifactHash: h("successor-outcome-os"),
      supersessionReasonRefHash: h("supersession-reason"),
    });
    assert.equal(result.head.state, "SUPERSEDED");
    assert.equal(result.head.eventCount, 2);
    assert.equal(result.head.successorContractRefHash, h("successor-contract"));
    assert.equal(OUTSIDER_OUTCOME_OS_LIFECYCLE_V1_BOUNDARY
      .supersessionDeletesHistory, false);
  });

test("exported events rehydrate exactly; tampering is rejected", () => {
  const original = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = create(original);
  open(original, created.head.headHash);
  const exported = JSON.parse(JSON.stringify(original.exportEvents()));
  const restored = createOutcomeOsLifecycleRuntimeV1({ events: exported });
  assert.deepEqual(restored.read(), original.read());
  assert.equal(restored.replay().fullSuppliedEventChainReplayed, true);
  assert.equal(replayOutcomeOsLifecycleV1(exported).head.headHash,
    original.read().head.headHash);
  exported[1].payload.openInstructionRefHash = h("tampered");
  assert.throws(() => createOutcomeOsLifecycleRuntimeV1({ events: exported }),
    /OPERATION_HASH_MISMATCH|EVENT_DERIVATION_OR_HASH_INVALID/);
});

test("Attempt foundation observation/evidence consistency is enforced", () => {
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = create(runtime);
  const opened = open(runtime, created.head.headHash);
  assert.throws(() => runtime.append({
    eventType: "ATTEMPT_EVIDENCE_APPENDED",
    recordedAt: "2026-09-04T12:10:00.000Z",
    idempotencyKeyHash: h("invalid-attempt"),
    expectedHeadHash: opened.head.headHash,
    payload: attemptPayload({
      outcomeObservationStatus: "MISSING",
      reportedOutcomeEvidenceRefHash: h("must-be-null"),
    }),
  }), /OBSERVED_STATUS_EVIDENCE_PRESENCE_MISMATCH/);
});

test("a new idempotency key cannot double-count one Attempt occurrence", () => {
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = create(runtime);
  const opened = open(runtime, created.head.headHash);
  const first = runtime.append({
    eventType: "ATTEMPT_EVIDENCE_APPENDED",
    recordedAt: "2026-09-04T12:10:00.000Z",
    idempotencyKeyHash: h("attempt-one"),
    expectedHeadHash: opened.head.headHash,
    payload: attemptPayload(),
  });
  assert.throws(() => runtime.append({
    eventType: "ATTEMPT_EVIDENCE_APPENDED",
    recordedAt: "2026-09-04T12:11:00.000Z",
    idempotencyKeyHash: h("attempt-two"),
    expectedHeadHash: first.head.headHash,
    payload: attemptPayload(),
  }), /ATTEMPT_OCCURRENCE_REF_DUPLICATE/);
});
