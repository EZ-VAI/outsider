import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { prepareOutcomeOsV1 }
  from "../src/outsider-three-layer-outcome-product-contract-v1.js";
import {
  createOutcomeOsLifecycleRuntimeV1,
  replayOutcomeOsLifecycleV1,
} from "../src/outsider-outcome-os-lifecycle-v1.js";
import {
  OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_BOUNDARY,
  compileAgentNeutralOutcomeOsSubmissionV1,
  ingestAgentNeutralOutcomeOsSubmissionV1,
} from "../src/outsider-agent-neutral-outcome-os-ingestion-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const CONTRACT_ID = `contract_${h("agent-neutral-contract").slice(7, 39)}`;

function initialEvents() {
  const outcomeOs = prepareOutcomeOsV1({
    requestIdHash: h("request"),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h("outcome"),
    acceptancePredicateHash: h("acceptance"),
    formationDeadline: "2099-01-01T00:30:00.000Z",
    completionDeadline: "2099-01-01T01:00:00.000Z",
    maximumLossConstraintHash: h("loss"),
    typedGraphRefs: {
      principalEpochRefHash: h("principal-epoch"),
      accountableDeploymentRefHash: h("deployment"),
      runtimeRefHash: h("runtime"),
      embodimentRefHash: null,
      delegationRefHash: h("delegation"),
      episodeRefHash: h("episode"),
      attemptRefHash: h("initial-attempt"),
    },
  });
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  runtime.create({
    contractId: CONTRACT_ID,
    outcomeOs,
    expectedOutcomeOsArtifactHash: outcomeOs.artifactHash,
    recordedAt: "2099-01-01T00:00:00.000Z",
    idempotencyKeyHash: h("create-idempotency"),
  });
  return runtime.exportEvents();
}

function routeSubmission(overrides = {}) {
  return {
    submissionType: "ROUTE_PROPOSAL_REFERENCE",
    recordedAt: "2099-01-01T00:05:00.000Z",
    idempotencyKeyHash: h("route-idempotency"),
    expectedHeadHash: replayOutcomeOsLifecycleV1(initialEvents()).head.headHash,
    reference: { routeProposalRefHash: h("route-proposal") },
    ...overrides,
  };
}

test("replaceable clients compile the same hash-only route proposal without identity",
  () => {
    const clientOne = compileAgentNeutralOutcomeOsSubmissionV1(
      structuredClone(routeSubmission()));
    const clientTwo = compileAgentNeutralOutcomeOsSubmissionV1(
      structuredClone(routeSubmission()));
    assert.equal(clientOne.compilationHash, clientTwo.compilationHash);
    assert.deepEqual(clientOne.lifecycleAppendInput, {
      eventType: "CONTRACT_OPENED",
      recordedAt: "2099-01-01T00:05:00.000Z",
      idempotencyKeyHash: h("route-idempotency"),
      expectedHeadHash: routeSubmission().expectedHeadHash,
      payload: { openInstructionRefHash: h("route-proposal") },
    });
    assert.equal(clientOne.agentClientIdentityProjected, false);
    assert.equal(clientOne.typedGraphIdentityDerivedFromAgent, false);
    assert.equal(OUTSIDER_AGENT_NEUTRAL_OUTCOME_OS_INGESTION_V1_BOUNDARY
      .routeProposalAcceptedAsCapacity, false);
  });

test("client identity, brand, raw URL, and PII are outside the exact contract",
  () => {
    for (const extra of [
      { agentBrand: "Codex" },
      { agentClientId: "agent-123" },
      { routeUrl: "https://seller.example/buy" },
      { userEmail: "person@example.test" },
    ]) {
      assert.throws(() => compileAgentNeutralOutcomeOsSubmissionV1({
        ...routeSubmission(), ...extra,
      }), /SUBMISSION_FIELDS_INVALID/);
    }
    assert.throws(() => compileAgentNeutralOutcomeOsSubmissionV1({
      ...routeSubmission(),
      reference: { routeProposalRefHash: h("route"), agentBrand: "Other" },
    }), /ROUTE_PROPOSAL_REFERENCE_FIELDS_INVALID/);
  });

test("route, Attempt, and caller observation enter one canonical lifecycle",
  () => {
    const opened = ingestAgentNeutralOutcomeOsSubmissionV1({
      events: initialEvents(), submission: routeSubmission(),
    });
    assert.equal(opened.lifecycleHead.state, "OPEN");
    assert.equal(opened.eventAppended, true);

    const attempted = ingestAgentNeutralOutcomeOsSubmissionV1({
      events: opened.exportedEvents,
      submission: {
        submissionType: "ATTEMPT_REFERENCE",
        recordedAt: "2099-01-01T00:10:00.000Z",
        idempotencyKeyHash: h("attempt-idempotency"),
        expectedHeadHash: opened.lifecycleHead.headHash,
        reference: {
          episodeRefHash: h("episode"),
          attemptRefHash: h("agent-attempt"),
          attemptSetCompositionRefHash: h("attempt-set"),
          attemptEvidenceRefHash: h("attempt-evidence"),
          occurrenceRefHash: h("attempt-occurrence"),
          executionDisposition: "SUCCEEDED",
          outcomeObservationStatus: "OBSERVED",
          reportedOutcomeEvidenceRefHash: h("agent-reported-observation"),
        },
      },
    });
    assert.equal(attempted.lifecycleHead.attemptEvidenceEventCount, 1);
    assert.equal(attempted.exportedEvents.at(-1).payload
      .attemptMembershipSourceReplayVerified, false);
    assert.equal(attempted.exportedEvents.at(-1)
      .attemptEvidenceAcceptedAsOutcomeTruth, false);

    const observed = ingestAgentNeutralOutcomeOsSubmissionV1({
      events: attempted.exportedEvents,
      submission: {
        submissionType: "OBSERVATION_REFERENCE",
        recordedAt: "2099-01-01T00:20:00.000Z",
        idempotencyKeyHash: h("observation-idempotency"),
        expectedHeadHash: attempted.lifecycleHead.headHash,
        reference: {
          observedAt: "2099-01-01T00:19:00.000Z",
          observationStatus: "OBSERVED_SATISFIED",
          observationEvidenceRefHash: h("observation-evidence"),
        },
      },
    });
    assert.equal(observed.lifecycleHead.state, "OBSERVED_CLOSED");
    assert.equal(observed.lifecycleHead.outcomeTruthEstablished, false);
    assert.equal(observed.outcomeTruthEstablished, false);
    assert.equal(observed.outcomePromiseIssued, false);
    assert.equal(observed.outcomeCommitIssued, false);
    assert.equal(observed.authority, "NONE");
    assert.equal(observed.exportedEvents.length, 4);
  });

test("native lifecycle idempotency survives ingestion and conflicts stay closed",
  () => {
    const first = ingestAgentNeutralOutcomeOsSubmissionV1({
      events: initialEvents(), submission: routeSubmission(),
    });
    const replayed = ingestAgentNeutralOutcomeOsSubmissionV1({
      events: first.exportedEvents, submission: routeSubmission(),
    });
    assert.equal(replayed.idempotentReplay, true);
    assert.equal(replayed.eventAppended, false);
    assert.equal(replayed.exportedEvents.length, first.exportedEvents.length);
    assert.equal(replayed.lifecycleHead.headHash, first.lifecycleHead.headHash);

    assert.throws(() => ingestAgentNeutralOutcomeOsSubmissionV1({
      events: first.exportedEvents,
      submission: routeSubmission({
        reference: { routeProposalRefHash: h("changed-route") },
      }),
    }), /IDEMPOTENCY_KEY_OPERATION_CONFLICT/);
  });

test("Attempt occurrence identity remains deduplicated across clients", () => {
  const opened = ingestAgentNeutralOutcomeOsSubmissionV1({
    events: initialEvents(), submission: routeSubmission(),
  });
  const baseAttempt = {
    submissionType: "ATTEMPT_REFERENCE",
    recordedAt: "2099-01-01T00:10:00.000Z",
    idempotencyKeyHash: h("attempt-one"),
    expectedHeadHash: opened.lifecycleHead.headHash,
    reference: {
      episodeRefHash: h("episode"),
      attemptRefHash: h("attempt-one"),
      attemptSetCompositionRefHash: h("attempt-set"),
      attemptEvidenceRefHash: h("attempt-evidence"),
      occurrenceRefHash: h("shared-occurrence"),
      executionDisposition: "UNKNOWN",
      outcomeObservationStatus: "MISSING",
      reportedOutcomeEvidenceRefHash: null,
    },
  };
  const first = ingestAgentNeutralOutcomeOsSubmissionV1({
    events: opened.exportedEvents, submission: baseAttempt,
  });
  assert.throws(() => ingestAgentNeutralOutcomeOsSubmissionV1({
    events: first.exportedEvents,
    submission: {
      ...baseAttempt,
      recordedAt: "2099-01-01T00:11:00.000Z",
      idempotencyKeyHash: h("attempt-two"),
      expectedHeadHash: first.lifecycleHead.headHash,
    },
  }), /ATTEMPT_OCCURRENCE_REF_DUPLICATE/);
});
