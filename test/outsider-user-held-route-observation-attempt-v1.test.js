import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createEpisodeAttemptSetComposition } from
  "../src/outsider-episode-attempt-set-composition.js";
import { issueUserHeldRouteObservationAttemptV1 } from
  "../src/outsider-user-held-route-observation-attempt-v1.js";

const h = label => `sha256:${createHash("sha256").update(label).digest("hex")}`;
function genesis() {
  return createEpisodeAttemptSetComposition({ recordedAt: "2026-09-05T01:00:00.000Z",
    episodeBinding: { principalEpochProjectionHash: h("principal"),
      accountableDeploymentSubjectHash: h("deployment"), runtimeInstanceHash: h("runtime"),
      embodimentRevisionHash: null, delegationEdgeHash: h("delegation"), episodeHash: h("episode"),
      workOrderProjectionHash: h("work"), networkCompleteEpisodeJoinHash: h("join"),
      prospectiveCensusProjectionHash: h("census"), realityObligationGenesisHash: h("obligation-genesis"),
      realityObligationStateHash: h("obligation-state"), genesisObligationAttemptHash: h("attempt-1") },
    appendOnlyLineage: { revision: 0, predecessorCompositionHash: null,
      supersedesCompositionHash: null },
    attempts: [{ attemptOrdinal: 1, occurredAt: "2026-09-05T00:59:00.000Z",
      episodeHash: h("episode"), attemptHash: h("attempt-1"),
      attemptActorSubjectHash: h("actor-1"), kind: "PRIMARY",
      retryOfAttemptHash: null, recoveryOfAttemptHash: null }], reportOccurrences: [],
  }, { predecessor: null });
}

test("issues one seller-neutral read-only Attempt without changing frozen graph ancestry", () => {
  const prior = genesis();
  const value = issueUserHeldRouteObservationAttemptV1({ predecessor: prior,
    occurredAt: "2026-09-05T01:01:00.000Z", recordedAt: "2026-09-05T01:01:01.000Z",
    attemptActorSubjectHash: h("broker-runtime"), brokerInstructionRefHash: h("instruction"),
    sourceInterfaceRefHash: h("seller-interface"), idempotencyKeyHash: h("idempotency") });
  assert.equal(value.descendantComposition.attempts.length, 2);
  assert.deepEqual(value.descendantComposition.attempts[0], prior.attempts[0]);
  assert.equal(value.descendantComposition.episodeBinding.principalEpochProjectionHash,
    prior.episodeBinding.principalEpochProjectionHash);
  assert.equal(value.descendantComposition.episodeBinding.episodeHash,
    prior.episodeBinding.episodeHash);
  assert.equal(value.descendantComposition.appendOnlyLineage.predecessorCompositionHash,
    prior.compositionHash);
  assert.equal(value.attempt.attemptSemantic, "USER_HELD_ROUTE_OBSERVATION");
  assert.equal(value.attempt.operationSemantic, "READ_ONLY_SOURCE_OBSERVATION");
  for (const field of ["paymentAttempted", "orderSubmitted", "capacityEstablished",
    "independentOutcomeTruthEstablished", "authorityMinted", "outcomeCommitIssued"]) {
    assert.equal(value[field], false, field);
  }
});

test("attempt identity is deterministic and an altered predecessor cannot be appended", () => {
  const input = { predecessor: genesis(), occurredAt: "2026-09-05T01:01:00.000Z",
    recordedAt: "2026-09-05T01:01:01.000Z", attemptActorSubjectHash: h("broker-runtime"),
    brokerInstructionRefHash: h("instruction"), sourceInterfaceRefHash: h("seller-interface"),
    idempotencyKeyHash: h("idempotency") };
  assert.equal(issueUserHeldRouteObservationAttemptV1(input).attempt.attemptHash,
    issueUserHeldRouteObservationAttemptV1(input).attempt.attemptHash);
  assert.throws(() => issueUserHeldRouteObservationAttemptV1({ ...input,
    predecessor: { ...input.predecessor, recordedAt: "2026-09-05T00:58:00.000Z" } }),
  /EPISODE_ATTEMPT_SET_/);
});
