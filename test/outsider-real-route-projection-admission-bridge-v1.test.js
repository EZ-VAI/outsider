import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS,
  appendAgentNeutralRouteProposalV1,
} from "../src/outsider-agent-neutral-route-proposal-registry-v1.js";
import {
  createOutcomeOsLifecycleRuntimeV1,
} from "../src/outsider-outcome-os-lifecycle-v1.js";
import {
  mapRealRouteProjectionToRecoveryCandidateV1,
  selectRealRouteProjectionRecoveryCandidatesV1,
} from "../src/outsider-real-route-projection-admission-bridge-v1.js";
import {
  prepareRecoveryOptionPortfolioV2,
} from "../src/outsider-recovery-option-portfolio-v2.js";
import {
  prepareOutcomeOsV1,
} from "../src/outsider-three-layer-outcome-product-contract-v1.js";

const SPARKFUN_PROJECTION_FILE = new URL(
  "../.outsider/private/user-held-sparkfun-activation-v1/"
    + "activation-834ae0e3-e005-4501-9f47-fddce0e13b00/runtime/"
    + "sparkfun-full-address-prepayment-20260904-"
    + "f09defb91939183103a216155b3dfb9b/public-projection.json",
  import.meta.url);
const TARGET_PROJECTION_FILE = new URL(
  "../.outsider/private/target-redsky-read-only-live-v2-20260904-"
    + "95adedce312476f91209d29b8eaeb7bd/"
    + "route-assessment.public-projection.v3.json",
  import.meta.url);

const SPARKFUN_ROUTE_REF
  = "sha256:f5d0ba7cf6602ffe10b95fcc488446d342fe10304e5a01221e0397f4b29892a1";
const SPARKFUN_OCCURRENCE_REF
  = "sha256:91fdab89149d73e3193ee8617c2d47774f1a76438d937e04999158d55265e634";
const TARGET_ROUTE_REF
  = "sha256:a36884155a14f778c679742ed040399043293409ea4ad4ad0270990bcaa89b50";
const TARGET_OCCURRENCE_REF
  = "sha256:d30f744366263afeec1d39eb701243e42f1e6e7f89d9f2c7fef873a116f8fbee";

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const readProjection = (url) => JSON.parse(readFileSync(url, "utf8"));

function option(role, label, domains) {
  return {
    optionRefHash: h(`option:${label}`),
    role,
    recoveryMechanismKind: "ROUTE_SUBSTITUTION",
    latestSafeExerciseAt: "2026-09-05T02:00:00.000Z",
    exerciseAuthorityRefHash: h(`authority:${label}`),
    exerciseInstructionRefHash: h(`instruction:${label}`),
    cancellationRefHash: h(`cancel:${label}`),
    exclusiveExerciseSemantics: "SINGLE_WRITER_PRIMARY_XOR_RECOVERY",
    failureDomainRefHashes: domains.map((domain) => h(`domain:${domain}`)),
    failureDomainEvidenceRefHash: h(`domain-evidence:${label}`),
  };
}

function fixture() {
  const sparkfunProjection = readProjection(SPARKFUN_PROJECTION_FILE);
  const targetProjection = readProjection(TARGET_PROJECTION_FILE);
  assert.equal(sparkfunProjection.projectionHash, SPARKFUN_ROUTE_REF);
  assert.equal(targetProjection.projectionHash, TARGET_ROUTE_REF);
  const outcomeOs = prepareOutcomeOsV1({
    requestIdHash: h("real-route-request"),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h("real-route-outcome"),
    acceptancePredicateHash: h("real-route-frozen-acceptance"),
    formationDeadline: "2026-09-10T00:00:00.000Z",
    completionDeadline: "2026-09-11T03:59:59.999Z",
    maximumLossConstraintHash: h("real-route-usd-2000-all-in"),
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
  const lifecycle = createOutcomeOsLifecycleRuntimeV1({ events: [] });
  const created = lifecycle.create({
    contractId: `contract_${h("contract").slice(7, 39)}`,
    outcomeOs,
    expectedOutcomeOsArtifactHash: outcomeOs.artifactHash,
    recordedAt: "2026-09-04T22:00:00.000Z",
    idempotencyKeyHash: h("create"),
  });
  lifecycle.append({
    eventType: "CONTRACT_OPENED",
    recordedAt: "2026-09-04T22:01:00.000Z",
    idempotencyKeyHash: h("open"),
    expectedHeadHash: created.head.headHash,
    payload: { openInstructionRefHash: h("open-instruction") },
  });
  const outcomeLifecycleEvents = lifecycle.exportEvents();
  const sparkfun = option("RECOVERY", "sparkfun", ["sparkfun-route"]);
  const target = option("RECOVERY", "target", ["target-route"]);
  const recoveryPortfolio = prepareRecoveryOptionPortfolioV2({
    outcomeOs,
    observedAt: "2026-09-04T22:43:00.000Z",
    primaryOption: option("PRIMARY", "primary", ["primary-route"]),
    recoveryOptions: [sparkfun, target],
  });
  let routeProposalRegistryEvents = [];
  for (const route of [
    {
      label: "sparkfun",
      recordedAt: sparkfunProjection.observedAt,
      routeProposalRefHash: SPARKFUN_ROUTE_REF,
      occurrenceRefHash: SPARKFUN_OCCURRENCE_REF,
    },
    {
      label: "target",
      recordedAt: targetProjection.observedAt,
      routeProposalRefHash: TARGET_ROUTE_REF,
      occurrenceRefHash: TARGET_OCCURRENCE_REF,
    },
  ]) {
    const appended = appendAgentNeutralRouteProposalV1({
      outcomeLifecycleEvents,
      registryEvents: routeProposalRegistryEvents,
      proposal: {
        recordedAt: route.recordedAt,
        idempotencyKeyHash: h(`registry:${route.label}`),
        expectedRegistryHeadHash: routeProposalRegistryEvents.length === 0
          ? OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS
          : routeProposalRegistryEvents.at(-1).eventHash,
        routeProposalRefHash: route.routeProposalRefHash,
        occurrenceRefHash: route.occurrenceRefHash,
      },
    });
    routeProposalRegistryEvents = appended.exportedEvents;
  }
  const frozenConstraints = {
    acceptancePredicateHash: outcomeOs.acceptancePredicateHash,
    maximumLossConstraintHash: outcomeOs.maximumLossConstraintHash,
    currency: "USD",
    maximumAllInMinorUnits: 2_000,
    completionDeadline: outcomeOs.completionDeadline,
  };
  const evidenceValidUntil = "2026-09-05T02:18:40.519Z";
  return {
    outcomeLifecycleEvents,
    routeProposalRegistryEvents,
    recoveryPortfolio,
    frozenConstraints,
    routes: [
      {
        routeKind: "SPARKFUN_PUBLIC_PROJECTION_V1",
        occurrenceRefHash: SPARKFUN_OCCURRENCE_REF,
        recoveryOptionRefHash: sparkfun.optionRefHash,
        evidenceValidUntil,
        projection: sparkfunProjection,
      },
      {
        routeKind: "TARGET_REDSKY_V3",
        occurrenceRefHash: TARGET_OCCURRENCE_REF,
        recoveryOptionRefHash: target.optionRefHash,
        evidenceValidUntil,
        projection: targetProjection,
      },
    ],
  };
}

test("actual SparkFun and Target projections map into one hard gate without inventing a route",
  () => {
    const state = fixture();
    const result = selectRealRouteProjectionRecoveryCandidatesV1({
      outcomeLifecycleEvents: state.outcomeLifecycleEvents,
      routeProposalRegistryEvents: state.routeProposalRegistryEvents,
      recoveryPortfolio: state.recoveryPortfolio,
      evaluatedAt: "2026-09-04T22:45:00.000Z",
      frozenConstraints: state.frozenConstraints,
      routes: state.routes,
    });

    assert.equal(result.candidateCount, 2);
    assert.equal(result.admittedCandidateCount, 0);
    assert.equal(result.rejectedCandidateCount, 2);
    assert.equal(result.portfolioPlanningSelectionMade, false);
    assert.equal(result.selectedRecoveryOptionRefHash, null);
    assert.equal(result.decisionState, "UNAVAILABLE_RECOVERY_ROUTE");

    const sparkfun = result.assessments.find((assessment) =>
      assessment.routeProposalRefHash === SPARKFUN_ROUTE_REF);
    assert.equal(sparkfun.gates.frozenSpecificationSatisfied, true);
    assert.equal(sparkfun.gates.completeAllInPriceWithinBudget, true);
    assert.equal(sparkfun.gates.structuredEtaWithinDeadline, false);
    assert.equal(sparkfun.gates.ownerLifecycleCapacityCurrentAndCoveringOutcome,
      false);
    assert(sparkfun.gapCodes.includes("STRUCTURED_ETA_UNPROVEN"));
    assert(sparkfun.gapCodes.includes("CAPACITY_NOT_RESERVED"));

    const target = result.assessments.find((assessment) =>
      assessment.routeProposalRefHash === TARGET_ROUTE_REF);
    assert.equal(target.gates.frozenSpecificationSatisfied, false);
    assert.equal(target.gates.completeAllInPriceWithinBudget, false);
    assert.equal(target.gates.structuredEtaWithinDeadline, true);
    assert.equal(target.gates.ownerLifecycleCapacityCurrentAndCoveringOutcome,
      false);
    assert(target.gapCodes.includes("FROZEN_SPECIFICATION_MISMATCH"));
    assert(target.gapCodes.includes("ALL_IN_PRICE_INCOMPLETE"));
    assert(target.gapCodes.includes("CAPACITY_NOT_RESERVED"));

    assert.equal(result.capacityEstablishedByThisModule, false);
    assert.equal(result.recoveryOptionHeld, false);
    assert.equal(result.independentOutcomeTruthEstablished, false);
    assert.equal(result.authorityMinted, false);
    assert.equal(result.outcomeCommitIssued, false);
    assert.equal(result.actionReady, false);
    assert.equal(result.executable, false);
  });

test("mapped candidates contain only bounded evidence facts and hash references",
  () => {
    const state = fixture();
    for (const route of state.routes) {
      const candidate = mapRealRouteProjectionToRecoveryCandidateV1(route,
        state.frozenConstraints);
      assert.equal(candidate.routeProposalRefHash,
        route.projection.projectionHash);
      assert.equal(candidate.occurrenceRefHash, route.occurrenceRefHash);
      assert.equal(candidate.evidenceEvents.length, 4);
      assert.deepEqual(candidate.evidenceEvents.map((event) =>
        event.evidenceKind),
      ["SPECIFICATION", "ALL_IN_PRICE", "ETA", "CAPACITY"]);
      const serialized = JSON.stringify(candidate);
      for (const forbidden of ["streetAddress", "postalCode", "contact",
        "coordinates", "privateInputBytes", "sourceBytesHash", "provider",
        "productId", "tcin", "cartId", "paymentToken"]) {
        assert.equal(serialized.includes(forbidden), false, forbidden);
      }
    }
  });

test("projection mutation, hidden PII fields, and raw provider bytes fail before mapping",
  () => {
    const state = fixture();
    const changed = structuredClone(state.routes[0]);
    changed.projection.finalTotalMinor = "1";
    assert.throws(() => mapRealRouteProjectionToRecoveryCandidateV1(changed,
      state.frozenConstraints), /PROJECTION_HASH_REPLAY_INVALID/u);

    const pii = structuredClone(state.routes[1]);
    pii.projection.email = "redacted@example.invalid";
    assert.throws(() => mapRealRouteProjectionToRecoveryCandidateV1(pii,
      state.frozenConstraints), /TARGET_PROJECTION_FIELDS_INVALID/u);

    const raw = structuredClone(state.routes[1]);
    raw.projection.rawProviderBytes = "forbidden";
    assert.throws(() => mapRealRouteProjectionToRecoveryCandidateV1(raw,
      state.frozenConstraints), /TARGET_PROJECTION_FIELDS_INVALID/u);
  });
