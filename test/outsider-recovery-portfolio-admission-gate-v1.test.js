import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS,
  appendAgentNeutralRouteProposalV1,
} from "../src/outsider-agent-neutral-route-proposal-registry-v1.js";
import {
  createOutcomeOsLifecycleRuntimeV1,
} from "../src/outsider-outcome-os-lifecycle-v1.js";
import {
  createRecoveryCandidateEvidenceEventV1,
  OUTSIDER_RECOVERY_CANDIDATE_EVIDENCE_GENESIS_V1,
  selectRecoveryPortfolioCandidatesV1,
  verifyRecoveryPortfolioCandidateSelectionV1,
} from "../src/outsider-recovery-portfolio-admission-gate-v1.js";
import {
  prepareRecoveryOptionPortfolioV2,
} from "../src/outsider-recovery-option-portfolio-v2.js";
import {
  prepareOutcomeOsV1,
} from "../src/outsider-three-layer-outcome-product-contract-v1.js";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;

function option(role, label, domains) {
  return {
    optionRefHash: h(`option:${label}`),
    role,
    recoveryMechanismKind: "ROUTE_SUBSTITUTION",
    latestSafeExerciseAt: "2099-09-08T12:00:00.000Z",
    exerciseAuthorityRefHash: h(`authority:${label}`),
    exerciseInstructionRefHash: h(`instruction:${label}`),
    cancellationRefHash: h(`cancel:${label}`),
    exclusiveExerciseSemantics: "SINGLE_WRITER_PRIMARY_XOR_RECOVERY",
    failureDomainRefHashes: domains.map((domain) => h(`domain:${domain}`)),
    failureDomainEvidenceRefHash: h(`domain-evidence:${label}`),
  };
}

function fixture() {
  const outcomeOs = prepareOutcomeOsV1({
    requestIdHash: h("request"),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h("outcome"),
    acceptancePredicateHash: h("frozen-specification"),
    formationDeadline: "2099-09-09T00:00:00.000Z",
    completionDeadline: "2099-09-10T00:00:00.000Z",
    maximumLossConstraintHash: h("maximum-all-in-usd-2000"),
    typedGraphRefs: {
      principalEpochRefHash: h("principal"),
      accountableDeploymentRefHash: h("deployment"),
      runtimeRefHash: h("runtime"),
      embodimentRefHash: null,
      delegationRefHash: h("delegation"),
      episodeRefHash: h("episode"),
      attemptRefHash: h("attempt"),
    },
  });
  const runtime = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = runtime.create({
    contractId: `contract_${h("contract").slice(7, 39)}`,
    outcomeOs,
    expectedOutcomeOsArtifactHash: outcomeOs.artifactHash,
    recordedAt: "2099-09-03T00:00:00.000Z",
    idempotencyKeyHash: h("create"),
  });
  runtime.append({
    eventType: "CONTRACT_OPENED",
    recordedAt: "2099-09-03T00:01:00.000Z",
    idempotencyKeyHash: h("open"),
    expectedHeadHash: created.head.headHash,
    payload: { openInstructionRefHash: h("open-instruction") },
  });
  const lifecycleEvents = runtime.exportEvents();
  const recoveries = [
    option("RECOVERY", "target-like", ["retailer-target"]),
    option("RECOVERY", "sparkfun-like", ["retailer-sparkfun"]),
    option("RECOVERY", "exact-a", ["retailer-exact-a"]),
    option("RECOVERY", "exact-b", ["retailer-exact-b"]),
  ];
  const recoveryPortfolio = prepareRecoveryOptionPortfolioV2({
    outcomeOs,
    observedAt: "2099-09-04T00:00:00.000Z",
    primaryOption: option("PRIMARY", "primary", ["retailer-primary"]),
    recoveryOptions: recoveries,
  });

  let registryEvents = [];
  const routes = new Map();
  for (let index = 0; index < recoveries.length; index += 1) {
    const label = ["target-like", "sparkfun-like", "exact-a", "exact-b"][index];
    const routeProposalRefHash = h(`route:${label}`);
    const occurrenceRefHash = h(`route-occurrence:${label}`);
    const append = appendAgentNeutralRouteProposalV1({
      outcomeLifecycleEvents: lifecycleEvents,
      registryEvents,
      proposal: {
        recordedAt: `2099-09-04T00:0${index}:00.000Z`,
        idempotencyKeyHash: h(`route-idempotency:${label}`),
        expectedRegistryHeadHash: registryEvents.length === 0
          ? OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS
          : registryEvents.at(-1).eventHash,
        routeProposalRefHash,
        occurrenceRefHash,
      },
    });
    registryEvents = append.exportedEvents;
    routes.set(label, { routeProposalRefHash, occurrenceRefHash,
      recoveryOptionRefHash: recoveries[index].optionRefHash });
  }
  return {
    lifecycleEvents,
    registryEvents,
    recoveryPortfolio,
    routes,
    frozenConstraints: {
      acceptancePredicateHash: outcomeOs.acceptancePredicateHash,
      maximumLossConstraintHash: outcomeOs.maximumLossConstraintHash,
      currency: "USD",
      maximumAllInMinorUnits: 2_000,
      completionDeadline: outcomeOs.completionDeadline,
    },
  };
}

function evidenceCandidate(route, label, overrides = {}) {
  const defaults = {
    specification: {
      frozenPredicateHash: h("frozen-specification"),
      evaluationRefHash: h(`spec-evaluation:${label}`),
      status: "MATCH",
    },
    price: {
      constraintRefHash: h("maximum-all-in-usd-2000"),
      currency: "USD",
      allInMinorUnits: 1_800,
      includesItemTaxShippingAndFees: true,
      status: "COMPLETE",
    },
    eta: {
      completionDeadline: "2099-09-10T00:00:00.000Z",
      estimatedCompletionAt: "2099-09-07T00:00:00.000Z",
      status: "STRUCTURED",
    },
    capacity: {
      capacityLifecycleRefHash: h(`capacity-lifecycle:${label}`),
      capacityLifecycleHeadHash: h(`capacity-head:${label}`),
      reservedFrom: "2099-09-04T00:00:00.000Z",
      reservedUntil: "2099-09-11T00:00:00.000Z",
      status: "RESERVED",
      sourceClass: "RESOURCE_OWNER_LIFECYCLE_SOURCE_REPLAY",
    },
  };
  const values = { ...defaults, ...overrides };
  const kinds = [
    ["SPECIFICATION", values.specification],
    ["ALL_IN_PRICE", values.price],
    ["ETA", values.eta],
    ["CAPACITY", values.capacity],
  ];
  let previousEventHash = OUTSIDER_RECOVERY_CANDIDATE_EVIDENCE_GENESIS_V1;
  const evidenceEvents = kinds.map(([evidenceKind, payload], index) => {
    const event = createRecoveryCandidateEvidenceEventV1({
      routeProposalRefHash: route.routeProposalRefHash,
      recoveryOptionRefHash: route.recoveryOptionRefHash,
      ordinal: index + 1,
      previousEventHash,
      observedAt: `2099-09-04T01:0${index}:00.000Z`,
      validUntil: "2099-09-08T12:00:00.000Z",
      evidenceKind,
      evidenceOccurrenceRefHash: h(`${label}:evidence-occurrence:${index}`),
      sourceOccurrenceRefHash: h(`${label}:source-occurrence:${index}`),
      sourceArtifactHash: route.routeProposalRefHash,
      sourceReplayReceiptHash: h(`${label}:source-replay:${index}`),
      payload,
    });
    previousEventHash = event.eventHash;
    return event;
  });
  return { ...route, evidenceEvents };
}

function select(state, candidates) {
  const input = {
    outcomeLifecycleEvents: state.lifecycleEvents,
    routeProposalRegistryEvents: state.registryEvents,
    recoveryPortfolio: state.recoveryPortfolio,
    evaluatedAt: "2099-09-04T02:00:00.000Z",
    frozenConstraints: state.frozenConstraints,
    candidates,
  };
  return { input, result: selectRecoveryPortfolioCandidatesV1(input) };
}

test("real-route-shaped specification, all-in, ETA, and capacity gaps are hard rejections",
  () => {
    const state = fixture();
    const targetLike = evidenceCandidate(state.routes.get("target-like"),
      "target-like", {
        specification: {
          frozenPredicateHash: h("frozen-specification"),
          evaluationRefHash: h("target:spec-evaluation"),
          status: "MISMATCH",
        },
        price: {
          constraintRefHash: h("maximum-all-in-usd-2000"),
          currency: "USD",
          allInMinorUnits: 1_598,
          includesItemTaxShippingAndFees: false,
          status: "PARTIAL",
        },
        capacity: {
          capacityLifecycleRefHash: null,
          capacityLifecycleHeadHash: null,
          reservedFrom: null,
          reservedUntil: null,
          status: "UNRESERVED",
          sourceClass: "UNVERIFIED",
        },
      });
    const sparkFunLike = evidenceCandidate(state.routes.get("sparkfun-like"),
      "sparkfun-like", {
        price: {
          constraintRefHash: h("maximum-all-in-usd-2000"),
          currency: "USD",
          allInMinorUnits: 1_817,
          includesItemTaxShippingAndFees: true,
          status: "COMPLETE",
        },
        eta: {
          completionDeadline: "2099-09-10T00:00:00.000Z",
          estimatedCompletionAt: null,
          status: "UNAVAILABLE",
        },
        capacity: {
          capacityLifecycleRefHash: null,
          capacityLifecycleHeadHash: null,
          reservedFrom: null,
          reservedUntil: null,
          status: "UNRESERVED",
          sourceClass: "UNVERIFIED",
        },
      });
    const { result } = select(state, [targetLike, sparkFunLike]);

    assert.equal(result.portfolioPlanningSelectionMade, false);
    assert.equal(result.admittedCandidateCount, 0);
    assert.equal(result.rejectedCandidateCount, 2);
    assert.equal(result.decisionState, "UNAVAILABLE_RECOVERY_ROUTE");
    const target = result.assessments.find((row) =>
      row.recoveryOptionRefHash === targetLike.recoveryOptionRefHash);
    assert(target.gapCodes.includes("FROZEN_SPECIFICATION_MISMATCH"));
    assert(target.gapCodes.includes("ALL_IN_PRICE_INCOMPLETE"));
    assert(target.gapCodes.includes("CAPACITY_NOT_RESERVED"));
    const sparkfun = result.assessments.find((row) =>
      row.recoveryOptionRefHash === sparkFunLike.recoveryOptionRefHash);
    assert(sparkfun.gapCodes.includes("STRUCTURED_ETA_UNPROVEN"));
    assert(sparkfun.gapCodes.includes("CAPACITY_NOT_RESERVED"));
    assert.equal(result.capacityEstablishedByThisModule, false);
    assert.equal(result.recoveryOptionHeld, false);
    assert.equal(result.outcomeCommitIssued, false);
  });

test("only fully gated candidates enter planning; deterministic economics selects among them",
  () => {
    const state = fixture();
    const faster = evidenceCandidate(state.routes.get("exact-a"), "exact-a", {
      price: {
        constraintRefHash: h("maximum-all-in-usd-2000"),
        currency: "USD",
        allInMinorUnits: 1_799,
        includesItemTaxShippingAndFees: true,
        status: "COMPLETE",
      },
      eta: {
        completionDeadline: "2099-09-10T00:00:00.000Z",
        estimatedCompletionAt: "2099-09-06T00:00:00.000Z",
        status: "STRUCTURED",
      },
    });
    const cheaper = evidenceCandidate(state.routes.get("exact-b"), "exact-b", {
      price: {
        constraintRefHash: h("maximum-all-in-usd-2000"),
        currency: "USD",
        allInMinorUnits: 1_699,
        includesItemTaxShippingAndFees: true,
        status: "COMPLETE",
      },
      eta: {
        completionDeadline: "2099-09-10T00:00:00.000Z",
        estimatedCompletionAt: "2099-09-07T00:00:00.000Z",
        status: "STRUCTURED",
      },
    });
    const { input, result } = select(state, [faster, cheaper]);

    assert.equal(result.admittedCandidateCount, 2);
    assert.equal(result.portfolioPlanningSelectionMade, true);
    assert.equal(result.selectedRecoveryOptionRefHash,
      cheaper.recoveryOptionRefHash);
    assert.equal(result.selectionPolicy,
      "ALL_HARD_GATES_THEN_LOWEST_ALL_IN_PRICE_THEN_EARLIEST_ETA_THEN_HASH");
    assert.equal(result.assessments.filter((row) =>
      row.selectedForRecoveryPortfolioPlanning).length, 1);
    assert.equal(result.boundary.upstreamModelOrActuarialScoreMayBypassHardGate,
      false);
    assert.equal(result.authorityMinted, false);
    assert.equal(result.independentOutcomeTruthEstablished, false);
    assert.equal(result.actionReady, false);
    assert.equal(result.executable, false);
    assert.equal(verifyRecoveryPortfolioCandidateSelectionV1(result, input)
      .artifactHash, result.artifactHash);
  });

test("seller server acknowledgement cannot satisfy capacity or become Outcome truth",
  () => {
    const state = fixture();
    const serverAck = evidenceCandidate(state.routes.get("exact-a"),
      "server-ack", {
        capacity: {
          capacityLifecycleRefHash: h("server-ack-lifecycle"),
          capacityLifecycleHeadHash: h("server-ack-head"),
          reservedFrom: "2099-09-04T00:00:00.000Z",
          reservedUntil: "2099-09-11T00:00:00.000Z",
          status: "RESERVED",
          sourceClass: "SELLER_SERVER_ACK_ONLY",
        },
      });
    const { result } = select(state, [serverAck]);
    const assessment = result.assessments[0];
    assert.equal(assessment.admittedToRecoveryPortfolioPlanning, false);
    assert(assessment.gapCodes.includes(
      "CAPACITY_OWNER_LIFECYCLE_SOURCE_REPLAY_REQUIRED"));
    assert.equal(result.boundary.sellerClaimAcceptedAsIndependentOutcomeTruth,
      false);
    assert.equal(result.boundary.serverAcknowledgementAcceptedAsIndependentOutcomeTruth,
      false);
    assert.equal(result.independentOutcomeTruthEstablished, false);
  });

test("over-budget, late ETA, and a short reservation window each block admission",
  () => {
    const state = fixture();
    const candidate = evidenceCandidate(state.routes.get("exact-a"),
      "hard-limit-failures", {
        price: {
          constraintRefHash: h("maximum-all-in-usd-2000"),
          currency: "USD",
          allInMinorUnits: 2_001,
          includesItemTaxShippingAndFees: true,
          status: "COMPLETE",
        },
        eta: {
          completionDeadline: "2099-09-10T00:00:00.000Z",
          estimatedCompletionAt: "2099-09-10T00:00:00.001Z",
          status: "STRUCTURED",
        },
        capacity: {
          capacityLifecycleRefHash: h("short-capacity-lifecycle"),
          capacityLifecycleHeadHash: h("short-capacity-head"),
          reservedFrom: "2099-09-04T00:00:00.000Z",
          reservedUntil: "2099-09-09T23:59:59.999Z",
          status: "RESERVED",
          sourceClass: "RESOURCE_OWNER_LIFECYCLE_SOURCE_REPLAY",
        },
      });
    const assessment = select(state, [candidate]).result.assessments[0];
    assert.equal(assessment.admittedToRecoveryPortfolioPlanning, false);
    assert(assessment.gapCodes.includes(
      "ALL_IN_PRICE_EXCEEDS_FROZEN_BUDGET"));
    assert(assessment.gapCodes.includes("ETA_EXCEEDS_FROZEN_DEADLINE"));
    assert(assessment.gapCodes.includes(
      "CAPACITY_WINDOW_DOES_NOT_COVER_OUTCOME"));
  });

test("unregistered occurrences and mutated append-only evidence fail closed", () => {
  const state = fixture();
  const candidate = evidenceCandidate(state.routes.get("exact-a"), "exact-a");
  const unregistered = { ...candidate, occurrenceRefHash: h("not-registered") };
  const rejected = select(state, [unregistered]).result.assessments[0];
  assert(rejected.gapCodes.includes(
    "ROUTE_PROPOSAL_OCCURRENCE_NOT_SOURCE_REPLAYED"));

  const changed = structuredClone(candidate);
  changed.evidenceEvents[1].payload.allInMinorUnits = 1;
  assert.throws(() => select(state, [changed]), /EVIDENCE_EVENT_REPLAY_INVALID/u);

  const duplicate = structuredClone(candidate);
  const { schema: ignoredSchema, schemaVersion: ignoredVersion,
    eventHash: ignoredHash, ...secondInput } = duplicate.evidenceEvents[1];
  duplicate.evidenceEvents[1] = createRecoveryCandidateEvidenceEventV1({
    ...secondInput,
    evidenceOccurrenceRefHash:
      duplicate.evidenceEvents[0].evidenceOccurrenceRefHash,
  });
  assert.throws(() => select(state, [duplicate]),
    /EVIDENCE_OCCURRENCE_DUPLICATE/u);
});
