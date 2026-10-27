import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { prepareOutcomeOsV1 }
  from "../src/outsider-three-layer-outcome-product-contract-v1.js";
import { createOutcomeOsLifecycleRuntimeV1 }
  from "../src/outsider-outcome-os-lifecycle-v1.js";
import {
  OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS,
  appendAgentNeutralRouteProposalV1,
  replayAgentNeutralRouteProposalRegistryV1,
} from "../src/outsider-agent-neutral-route-proposal-registry-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;

function lifecycle(label = "one") {
  const outcomeOs = prepareOutcomeOsV1({
    requestIdHash: h(`${label}:request`),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h(`${label}:outcome`),
    acceptancePredicateHash: h(`${label}:acceptance`),
    formationDeadline: "2099-01-01T00:30:00.000Z",
    completionDeadline: "2099-01-01T01:00:00.000Z",
    maximumLossConstraintHash: h(`${label}:loss`),
    typedGraphRefs: {
      principalEpochRefHash: h(`${label}:principal-epoch`),
      accountableDeploymentRefHash: h(`${label}:deployment`),
      runtimeRefHash: h(`${label}:runtime`),
      embodimentRefHash: null,
      delegationRefHash: h(`${label}:delegation`),
      episodeRefHash: h(`${label}:episode`),
      attemptRefHash: h(`${label}:attempt`),
    },
  });
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = runtime.create({
    contractId: `contract_${h(`${label}:contract`).slice(7, 39)}`,
    outcomeOs,
    expectedOutcomeOsArtifactHash: outcomeOs.artifactHash,
    recordedAt: "2099-01-01T00:00:00.000Z",
    idempotencyKeyHash: h(`${label}:create-key`),
  });
  runtime.append({
    eventType: "CONTRACT_OPENED",
    recordedAt: "2099-01-01T00:01:00.000Z",
    idempotencyKeyHash: h(`${label}:open-key`),
    expectedHeadHash: created.head.headHash,
    payload: { openInstructionRefHash: h(`${label}:open`) },
  });
  return runtime.exportEvents();
}

function proposal(label, expectedRegistryHeadHash, overrides = {}) {
  return {
    recordedAt: `2099-01-01T00:${label === "one" ? "05" : "06"}:00.000Z`,
    idempotencyKeyHash: h(`${label}:idempotency`),
    expectedRegistryHeadHash,
    routeProposalRefHash: h(`${label}:route`),
    occurrenceRefHash: h(`${label}:occurrence`),
    ...overrides,
  };
}

test("multiple agent-neutral proposal occurrences bind to one Outcome", () => {
  const outcomeLifecycleEvents = lifecycle();
  const first = appendAgentNeutralRouteProposalV1({
    outcomeLifecycleEvents,
    registryEvents: [],
    proposal: proposal("one",
      OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS),
  });
  const second = appendAgentNeutralRouteProposalV1({
    outcomeLifecycleEvents,
    registryEvents: first.exportedEvents,
    proposal: proposal("two", first.head.headEventHash),
  });
  assert.equal(second.head.proposalOccurrenceCount, 2);
  assert.equal(second.head.distinctRouteProposalCount, 2);
  assert.equal(second.head.contractId, first.head.contractId);
  assert.equal(second.head.outcomeOsArtifactHash,
    first.head.outcomeOsArtifactHash);
  assert.equal(second.head.typedGraphRefHash, first.head.typedGraphRefHash);
  assert.equal(second.routeSelected, false);
  assert.equal(second.executableCapabilityEstablished, false);
  assert.equal(second.capacityEstablished, false);
  assert.equal(second.authority, "NONE");
  assert.equal(second.outcomeTruthEstablished, false);
  assert.equal(second.outcomeCommitIssued, false);
  assert.equal(replayAgentNeutralRouteProposalRegistryV1({
    outcomeLifecycleEvents,
    registryEvents: second.exportedEvents,
  }).head.headHash, second.head.headHash);
});

test("same proposal object remains two occurrences instead of object dedup", () => {
  const outcomeLifecycleEvents = lifecycle();
  const first = appendAgentNeutralRouteProposalV1({
    outcomeLifecycleEvents,
    registryEvents: [],
    proposal: proposal("one",
      OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS),
  });
  const second = appendAgentNeutralRouteProposalV1({
    outcomeLifecycleEvents,
    registryEvents: first.exportedEvents,
    proposal: proposal("two", first.head.headEventHash, {
      routeProposalRefHash: first.receipt.routeProposalRefHash,
    }),
  });
  assert.equal(second.head.proposalOccurrenceCount, 2);
  assert.equal(second.head.distinctRouteProposalCount, 1);
});

test("idempotency replays exactly and changed reuse conflicts", () => {
  const outcomeLifecycleEvents = lifecycle();
  const inputProposal = proposal("one",
    OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS);
  const first = appendAgentNeutralRouteProposalV1({
    outcomeLifecycleEvents, registryEvents: [], proposal: inputProposal,
  });
  const replayed = appendAgentNeutralRouteProposalV1({
    outcomeLifecycleEvents,
    registryEvents: first.exportedEvents,
    proposal: inputProposal,
  });
  assert.equal(replayed.idempotentReplay, true);
  assert.equal(replayed.eventAppended, false);
  assert.equal(replayed.exportedEvents.length, 1);
  assert.equal(replayed.head.headHash, first.head.headHash);
  assert.equal(replayed.receipt.receiptHash, first.receipt.receiptHash);
  assert.throws(() => appendAgentNeutralRouteProposalV1({
    outcomeLifecycleEvents,
    registryEvents: first.exportedEvents,
    proposal: { ...inputProposal, routeProposalRefHash: h("changed") },
  }), /IDEMPOTENCY_KEY_CONFLICT/);
});

test("a second idempotency key cannot reuse an occurrence", () => {
  const outcomeLifecycleEvents = lifecycle();
  const first = appendAgentNeutralRouteProposalV1({
    outcomeLifecycleEvents,
    registryEvents: [],
    proposal: proposal("one",
      OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS),
  });
  assert.throws(() => appendAgentNeutralRouteProposalV1({
    outcomeLifecycleEvents,
    registryEvents: first.exportedEvents,
    proposal: proposal("two", first.head.headEventHash, {
      occurrenceRefHash: first.receipt.occurrenceRefHash,
    }),
  }), /OCCURRENCE_REF_DUPLICATE/);
});

test("agent/provider identity, URL, PII, credential, and payment are rejected",
  () => {
    const outcomeLifecycleEvents = lifecycle();
    const valid = {
      outcomeLifecycleEvents,
      registryEvents: [],
      proposal: proposal("one",
        OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS),
    };
    for (const extra of [
      { agentBrand: "Codex" },
      { agentIdentity: "agent-1" },
      { providerUrl: "https://provider.example/order" },
      { email: "person@example.test" },
      { credential: "secret" },
      { paymentToken: "payment" },
    ]) {
      assert.throws(() => appendAgentNeutralRouteProposalV1({
        ...valid, proposal: { ...valid.proposal, ...extra },
      }), /PROPOSAL_FIELDS_INVALID/);
    }
  });

test("registry history cannot be replayed under a different Outcome binding",
  () => {
    const firstLifecycle = lifecycle("one");
    const result = appendAgentNeutralRouteProposalV1({
      outcomeLifecycleEvents: firstLifecycle,
      registryEvents: [],
      proposal: proposal("one",
        OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS),
    });
    assert.throws(() => replayAgentNeutralRouteProposalRegistryV1({
      outcomeLifecycleEvents: lifecycle("other"),
      registryEvents: result.exportedEvents,
    }), /EVENT_FIXED_STATE_OR_BINDING_INVALID/);
  });

test("earlier proposals remain replayable after the open lifecycle advances",
  () => {
    const initialLifecycle = lifecycle("one");
    const result = appendAgentNeutralRouteProposalV1({
      outcomeLifecycleEvents: initialLifecycle,
      registryEvents: [],
      proposal: proposal("one",
        OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS),
    });
    const runtime = createOutcomeOsLifecycleRuntimeV1({
      events: initialLifecycle,
    });
    const before = runtime.read();
    runtime.append({
      eventType: "ATTEMPT_EVIDENCE_APPENDED",
      recordedAt: "2099-01-01T00:10:00.000Z",
      idempotencyKeyHash: h("one:later-attempt-key"),
      expectedHeadHash: before.head.headHash,
      payload: {
        episodeRefHash: h("one:episode"),
        attemptRefHash: h("one:later-attempt"),
        attemptSetCompositionRefHash: h("one:attempt-set"),
        attemptEvidenceRefHash: h("one:attempt-evidence"),
        occurrenceRefHash: h("one:attempt-occurrence"),
        executionDisposition: "UNKNOWN",
        outcomeObservationStatus: "MISSING",
        reportedOutcomeEvidenceRefHash: null,
        attemptMembershipSourceReplayVerified: false,
      },
    });
    const replayed = replayAgentNeutralRouteProposalRegistryV1({
      outcomeLifecycleEvents: runtime.exportEvents(),
      registryEvents: result.exportedEvents,
    });
    assert.equal(replayed.head.proposalOccurrenceCount, 1);
    assert.equal(replayed.head.contractId, result.head.contractId);
  });
