import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  OUTSIDER_AGENT_NEUTRAL_ROUTE_PROPOSAL_REGISTRY_V1_GENESIS,
  appendAgentNeutralRouteProposalV1,
} from "../src/outsider-agent-neutral-route-proposal-registry-v1.js";
import {
  OUTSIDER_BUYER_NATIVE_ROUTE_EVIDENCE_V1_BOUNDARY,
  createBuyerNativeRouteEvidenceV1,
  mapBuyerNativeRouteEvidenceToRecoveryCandidateV1,
  selectBuyerNativeRouteEvidenceRecoveryCandidatesV1,
  verifyBuyerNativeRouteEvidenceV1,
} from "../src/outsider-buyer-native-route-evidence-v1.js";
import {
  createOutcomeOsLifecycleRuntimeV1,
} from "../src/outsider-outcome-os-lifecycle-v1.js";
import {
  prepareRecoveryOptionPortfolioV2,
} from "../src/outsider-recovery-option-portfolio-v2.js";
import {
  prepareOutcomeOsV1,
} from "../src/outsider-three-layer-outcome-product-contract-v1.js";

const SPARKFUN_FILE = new URL(
  "../.outsider/private/user-held-sparkfun-activation-v1/"
    + "activation-834ae0e3-e005-4501-9f47-fddce0e13b00/runtime/"
    + "sparkfun-full-address-prepayment-20260904-"
    + "f09defb91939183103a216155b3dfb9b/public-projection.json",
  import.meta.url);
const TARGET_FILE = new URL(
  "../.outsider/private/target-redsky-read-only-live-v2-20260904-"
    + "95adedce312476f91209d29b8eaeb7bd/"
    + "route-assessment.public-projection.v3.json",
  import.meta.url);
const PROBE_FILE = new URL(
  "../.outsider/private/buyer-native-live-quote-20260904-8bjCF6/manifest.json",
  import.meta.url);

const h = (label) => `sha256:${createHash("sha256")
  .update(label, "utf8").digest("hex")}`;
const read = (url) => JSON.parse(readFileSync(url, "utf8"));

function option(role, label) {
  return {
    optionRefHash: h(`option:${label}`),
    role,
    recoveryMechanismKind: "ROUTE_SUBSTITUTION",
    latestSafeExerciseAt: "2026-09-05T02:00:00.000Z",
    exerciseAuthorityRefHash: h(`authority:${label}`),
    exerciseInstructionRefHash: h(`instruction:${label}`),
    cancellationRefHash: h(`cancel:${label}`),
    exclusiveExerciseSemantics: "SINGLE_WRITER_PRIMARY_XOR_RECOVERY",
    failureDomainRefHashes: [h(`domain:${label}`)],
    failureDomainEvidenceRefHash: h(`domain-evidence:${label}`),
  };
}

function fixture() {
  const sparkfun = read(SPARKFUN_FILE);
  const target = read(TARGET_FILE);
  const probe = read(PROBE_FILE);
  const adafruit = probe.routes.find((route) =>
    route.sourceOccurrenceHash
      === "sha256:9f888a34f6b120240cf565808d7492573ad1e1d04baafff37e058c1d61849b1d");
  assert.equal(sparkfun.finalTotalMinor, "1817");
  assert.equal(target.structuredSellerEvidence
    .itemPlusScheduledDeliveryFeeBeforeTaxMinor, 1598);
  assert.equal(adafruit.normalized.unitPrice, 4.95);
  assert.equal(adafruit.normalized.inStock, true);

  const outcomeOs = prepareOutcomeOsV1({
    requestIdHash: h("generic-route-request"),
    outcomeProgramHash: null,
    outcomeDefinitionHash: h("generic-route-outcome"),
    acceptancePredicateHash: h("frozen-exact-usb-cable"),
    formationDeadline: "2026-09-10T00:00:00.000Z",
    completionDeadline: "2026-09-11T03:59:59.999Z",
    maximumLossConstraintHash: h("all-in-usd-2000"),
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
    recordedAt: "2026-09-04T16:00:00.000Z",
    idempotencyKeyHash: h("create"),
  });
  lifecycle.append({
    eventType: "CONTRACT_OPENED",
    recordedAt: "2026-09-04T16:01:00.000Z",
    idempotencyKeyHash: h("open"),
    expectedHeadHash: created.head.headHash,
    payload: { openInstructionRefHash: h("open-instruction") },
  });
  const outcomeLifecycleEvents = lifecycle.exportEvents();
  const options = {
    sparkfun: option("RECOVERY", "sparkfun"),
    target: option("RECOVERY", "target"),
    adafruit: option("RECOVERY", "adafruit"),
  };
  const recoveryPortfolio = prepareRecoveryOptionPortfolioV2({
    outcomeOs,
    observedAt: "2026-09-04T23:25:00.000Z",
    primaryOption: option("PRIMARY", "primary"),
    recoveryOptions: Object.values(options),
  });
  const routes = [
    {
      label: "sparkfun",
      routeProposalRefHash: sparkfun.projectionHash,
      occurrenceRefHash: sparkfun.stages[0].sourceOccurrenceHash,
      observedAt: sparkfun.observedAt,
      sourceReplayReceiptHash: h("sparkfun-projection-replay"),
      facts: {
        specification: {
          sourceOccurrenceRefHash: sparkfun.stages[0].sourceOccurrenceHash,
          frozenPredicateHash: outcomeOs.acceptancePredicateHash,
          evaluationRefHash: sparkfun.stages[0].sourceBytesHash,
          status: "MATCH",
        },
        allInPrice: {
          sourceOccurrenceRefHash: sparkfun.stages[3].sourceOccurrenceHash,
          constraintRefHash: outcomeOs.maximumLossConstraintHash,
          currency: "USD",
          allInMinorUnits: Number(sparkfun.finalTotalMinor),
          includesItemTaxShippingAndFees: true,
          status: "COMPLETE",
        },
        eta: {
          sourceOccurrenceRefHash: sparkfun.stages[3].sourceOccurrenceHash,
          completionDeadline: outcomeOs.completionDeadline,
          estimatedCompletionAt: null,
          status: "UNAVAILABLE",
        },
        capacity: {
          sourceOccurrenceRefHash: sparkfun.stages[3].sourceOccurrenceHash,
          capacityLifecycleRefHash: null,
          capacityLifecycleHeadHash: null,
          reservedFrom: null,
          reservedUntil: null,
          status: "UNRESERVED",
          sourceClass: "UNVERIFIED",
        },
      },
    },
    {
      label: "target",
      routeProposalRefHash: target.projectionHash,
      occurrenceRefHash: target.sourceOccurrences.pdp.occurrenceHash,
      observedAt: target.observedAt,
      sourceReplayReceiptHash: h("target-projection-replay"),
      facts: {
        specification: {
          sourceOccurrenceRefHash: target.sourceOccurrences.pdp.occurrenceHash,
          frozenPredicateHash: outcomeOs.acceptancePredicateHash,
          evaluationRefHash: target.sourceOccurrences.pdp.bytesHash,
          status: "MISMATCH",
        },
        allInPrice: {
          sourceOccurrenceRefHash:
            target.sourceOccurrences.fulfillment.occurrenceHash,
          constraintRefHash: outcomeOs.maximumLossConstraintHash,
          currency: "USD",
          allInMinorUnits: target.structuredSellerEvidence
            .itemPlusScheduledDeliveryFeeBeforeTaxMinor,
          includesItemTaxShippingAndFees: false,
          status: "PARTIAL",
        },
        eta: {
          sourceOccurrenceRefHash:
            target.sourceOccurrences.fulfillment.occurrenceHash,
          completionDeadline: outcomeOs.completionDeadline,
          estimatedCompletionAt: `${target.structuredSellerEvidence
            .selectedSourceService.maxDeliveryDate}T23:59:59.999Z`,
          status: "STRUCTURED",
        },
        capacity: {
          sourceOccurrenceRefHash:
            target.sourceOccurrences.fulfillment.occurrenceHash,
          capacityLifecycleRefHash: null,
          capacityLifecycleHeadHash: null,
          reservedFrom: null,
          reservedUntil: null,
          status: "UNRESERVED",
          sourceClass: "SELLER_SERVER_ACK_ONLY",
        },
      },
    },
    {
      label: "adafruit",
      routeProposalRefHash: probe.manifestHash,
      occurrenceRefHash: adafruit.sourceOccurrenceHash,
      observedAt: probe.observedAt,
      sourceReplayReceiptHash:
        "sha256:4e11fe83af40ea32b16de4eb7f6fead14d102a0e73975798bc14dd3ff277d9ff",
      facts: {
        specification: {
          sourceOccurrenceRefHash: adafruit.sourceOccurrenceHash,
          frozenPredicateHash: outcomeOs.acceptancePredicateHash,
          evaluationRefHash: adafruit.sourceBytesHash,
          status: "MATCH",
        },
        allInPrice: {
          sourceOccurrenceRefHash: adafruit.sourceOccurrenceHash,
          constraintRefHash: outcomeOs.maximumLossConstraintHash,
          currency: "USD",
          allInMinorUnits: Math.round(adafruit.normalized.unitPrice * 100),
          includesItemTaxShippingAndFees: false,
          status: "PARTIAL",
        },
        eta: {
          sourceOccurrenceRefHash: adafruit.sourceOccurrenceHash,
          completionDeadline: outcomeOs.completionDeadline,
          estimatedCompletionAt: null,
          status: "UNAVAILABLE",
        },
        capacity: {
          sourceOccurrenceRefHash: adafruit.sourceOccurrenceHash,
          capacityLifecycleRefHash: null,
          capacityLifecycleHeadHash: null,
          reservedFrom: null,
          reservedUntil: null,
          status: "UNRESERVED",
          sourceClass: "SELLER_SERVER_ACK_ONLY",
        },
      },
    },
  ];
  routes.sort((left, right) => left.observedAt.localeCompare(right.observedAt));
  let routeProposalRegistryEvents = [];
  for (const route of routes) {
    const appended = appendAgentNeutralRouteProposalV1({
      outcomeLifecycleEvents,
      registryEvents: routeProposalRegistryEvents,
      proposal: {
        recordedAt: route.observedAt,
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
  const evidence = routes.map((route) => createBuyerNativeRouteEvidenceV1({
    routeProposalRefHash: route.routeProposalRefHash,
    occurrenceRefHash: route.occurrenceRefHash,
    recoveryOptionRefHash: options[route.label].optionRefHash,
    observedAt: route.observedAt,
    validUntil: "2026-09-05T02:18:40.519Z",
    sourceReplayReceiptHash: route.sourceReplayReceiptHash,
    facts: route.facts,
  }));
  return {
    outcomeLifecycleEvents,
    routeProposalRegistryEvents,
    recoveryPortfolio,
    frozenConstraints: {
      acceptancePredicateHash: outcomeOs.acceptancePredicateHash,
      maximumLossConstraintHash: outcomeOs.maximumLossConstraintHash,
      currency: "USD",
      maximumAllInMinorUnits: 2_000,
      completionDeadline: outcomeOs.completionDeadline,
    },
    evidence,
    options,
  };
}

function select(state, evidence = state.evidence) {
  return selectBuyerNativeRouteEvidenceRecoveryCandidatesV1({
    outcomeLifecycleEvents: state.outcomeLifecycleEvents,
    routeProposalRegistryEvents: state.routeProposalRegistryEvents,
    recoveryPortfolio: state.recoveryPortfolio,
    evaluatedAt: "2026-09-04T23:30:00.000Z",
    frozenConstraints: state.frozenConstraints,
    routeEvidence: evidence,
  });
}

test("SparkFun, Target, and Adafruit facts share one seller-neutral contract",
  () => {
    const state = fixture();
    assert.equal(state.evidence.length, 3);
    for (const evidence of state.evidence) {
      assert.equal(verifyBuyerNativeRouteEvidenceV1(evidence).evidenceHash,
        evidence.evidenceHash);
      const candidate = mapBuyerNativeRouteEvidenceToRecoveryCandidateV1(
        evidence);
      assert.deepEqual(candidate.evidenceEvents.map((event) =>
        event.evidenceKind),
      ["SPECIFICATION", "ALL_IN_PRICE", "ETA", "CAPACITY"]);
      const serialized = JSON.stringify(evidence);
      for (const forbidden of ["provider", "productId", "sku", "tcin",
        "name", "address", "postal", "contact", "coordinates",
        "sourceBytes", "rawProviderBytes", "paymentToken"]) {
        assert.equal(serialized.includes(forbidden), false, forbidden);
      }
    }
    assert.equal(OUTSIDER_BUYER_NATIVE_ROUTE_EVIDENCE_V1_BOUNDARY
      .additionalRegistryCreated, false);
  });

test("negative and unproven seller facts reach the existing hard gate unchanged",
  () => {
    const state = fixture();
    const result = select(state);
    assert.equal(result.candidateCount, 3);
    assert.equal(result.admittedCandidateCount, 0);
    assert.equal(result.rejectedCandidateCount, 3);
    const sparkfun = result.assessments.find((row) =>
      row.recoveryOptionRefHash === state.options.sparkfun.optionRefHash);
    assert.equal(sparkfun.gates.frozenSpecificationSatisfied, true);
    assert.equal(sparkfun.gates.completeAllInPriceWithinBudget, true);
    assert.equal(sparkfun.gates.structuredEtaWithinDeadline, false);
    assert(sparkfun.gapCodes.includes("STRUCTURED_ETA_UNPROVEN"));
    const target = result.assessments.find((row) =>
      row.recoveryOptionRefHash === state.options.target.optionRefHash);
    assert.equal(target.gates.frozenSpecificationSatisfied, false);
    assert.equal(target.gates.completeAllInPriceWithinBudget, false);
    assert.equal(target.gates.structuredEtaWithinDeadline, true);
    assert(target.gapCodes.includes("FROZEN_SPECIFICATION_MISMATCH"));
    const adafruit = result.assessments.find((row) =>
      row.recoveryOptionRefHash === state.options.adafruit.optionRefHash);
    assert.equal(adafruit.gates.frozenSpecificationSatisfied, true);
    assert.equal(adafruit.gates.completeAllInPriceWithinBudget, false);
    assert(adafruit.gapCodes.includes("ALL_IN_PRICE_INCOMPLETE"));
    assert.equal(result.capacityEstablishedByThisModule, false);
    assert.equal(result.independentOutcomeTruthEstablished, false);
    assert.equal(result.authorityMinted, false);
    assert.equal(result.outcomeCommitIssued, false);
  });

test("ATP or seller acknowledgement labelled reserved still cannot establish capacity",
  () => {
    const state = fixture();
    const target = state.evidence.find((item) =>
      item.recoveryOptionRefHash === state.options.target.optionRefHash);
    const claimed = createBuyerNativeRouteEvidenceV1({
      routeProposalRefHash: target.routeProposalRefHash,
      occurrenceRefHash: target.occurrenceRefHash,
      recoveryOptionRefHash: target.recoveryOptionRefHash,
      observedAt: target.observedAt,
      validUntil: target.validUntil,
      sourceReplayReceiptHash: target.sourceReplayReceiptHash,
      facts: {
        ...target.facts,
        capacity: {
          ...target.facts.capacity,
          capacityLifecycleRefHash: h("seller-ack-lifecycle"),
          capacityLifecycleHeadHash: h("seller-ack-head"),
          reservedFrom: "2026-09-04T23:00:00.000Z",
          reservedUntil: "2026-09-11T04:00:00.000Z",
          status: "RESERVED",
          sourceClass: "SELLER_SERVER_ACK_ONLY",
        },
      },
    });
    const assessment = select(state, [claimed]).assessments[0];
    assert.equal(assessment.admittedToRecoveryPortfolioPlanning, false);
    assert(assessment.gapCodes.includes(
      "CAPACITY_OWNER_LIFECYCLE_SOURCE_REPLAY_REQUIRED"));
    assert.equal(assessment.gates
      .ownerLifecycleCapacityCurrentAndCoveringOutcome, false);
  });

test("hash mutation, hidden PII, and raw bytes fail before gate mapping", () => {
  const state = fixture();
  const changed = structuredClone(state.evidence[0]);
  changed.facts.allInPrice.allInMinorUnits = 1;
  assert.throws(() => verifyBuyerNativeRouteEvidenceV1(changed),
    /ROUTE_EVIDENCE_REPLAY_INVALID/u);

  const pii = structuredClone(state.evidence[0]);
  pii.email = "not-accepted@example.invalid";
  assert.throws(() => mapBuyerNativeRouteEvidenceToRecoveryCandidateV1(pii),
    /ROUTE_EVIDENCE_FIELDS_INVALID/u);

  const raw = structuredClone(state.evidence[0]);
  raw.rawProviderBytes = "forbidden";
  assert.throws(() => mapBuyerNativeRouteEvidenceToRecoveryCandidateV1(raw),
    /ROUTE_EVIDENCE_FIELDS_INVALID/u);
});
