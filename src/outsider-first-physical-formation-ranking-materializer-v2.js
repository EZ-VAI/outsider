/*
 * First physical formation ranking materializer v2.
 *
 * This descendant keeps the v1 SparkFun + foundation composition and replaces
 * the legacy Target summary embedded in the unified projection with an
 * independently frozen Target RedSky v2 seller projection.  The current
 * Target item lacks an explicit seller 5 V statement, so it is eliminated by
 * the product hard constraint before the ranking bridge is invoked.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import { materializeFirstPhysicalFormationRankingV1 } from
  "./outsider-first-physical-formation-ranking-materializer-v1.js";
import { buildFormationDecisionSupportV1 } from
  "./outsider-formation-candidate-ranking-bridge-v1.js";
import { selectAdafruitEtaNextActionV1 } from "./outsider-adafruit-eta-planning-v1.js";

export const FIRST_PHYSICAL_FORMATION_RANKING_MATERIALIZER_V2_SCHEMA =
  "outsider/first-physical-formation-ranking-materializer/v2";

const TARGET_SCHEMA = "outsider/target-redsky-formation-candidate/v2";
const TARGET_PROVIDER = "TARGET_REDSKY_READ_ONLY_CANDIDATE";
const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code) {
  throw new TypeError(`FIRST_PHYSICAL_FORMATION_RANKING_MATERIALIZER_V2_${code}`);
}

function object(value, code) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail(code);
  return value;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function bytesHash(value) {
  return `sha256:${createHash("sha256").update(value, "utf8").digest("hex")}`;
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function observationTime(value) {
  return typeof value === "string" && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value ? value : null;
}

function targetProjectionHash(projection) {
  object(projection, "TARGET_PROJECTION_INVALID");
  if (projection.schema !== TARGET_SCHEMA || !HASH.test(projection.projectionHash ?? "")) {
    fail("TARGET_PROJECTION_INVALID");
  }
  const body = { ...projection };
  delete body.projectionHash;
  if (bytesHash(canonicalizeStrict(body)) !== projection.projectionHash) {
    fail("TARGET_PROJECTION_HASH_INVALID");
  }
  return projection.projectionHash;
}

function targetEvaluation(projection, maximumAmountMinor) {
  const projectionHash = targetProjectionHash(projection);
  const adapter = object(projection.adapter, "TARGET_ADAPTER_INVALID");
  const product = object(projection.product, "TARGET_PRODUCT_INVALID");
  const fulfillment = object(projection.fulfillment, "TARGET_FULFILLMENT_INVALID");
  const checkout = object(projection.checkoutAccess, "TARGET_CHECKOUT_INVALID");
  const price = object(projection.priceBoundary, "TARGET_PRICE_INVALID");
  const decision = object(projection.formationDecision, "TARGET_DECISION_INVALID");
  const privacy = object(projection.privacyBoundary, "TARGET_PRIVACY_INVALID");
  if (adapter.provider !== "target"
    || adapter.mode !== "PUBLIC_BROWSER_EQUIVALENT_READ_ONLY"
    || product.sourceConnector !== "USB_A_MALE"
    || product.destinationConnector !== "USB_C_MALE"
    || product.quantity !== 1
    || product.dataTransferClaimed !== true
    || product.explicit5vClaim !== false
    || product.exactAcceptanceSatisfied !== false
    || !Array.isArray(product.acceptanceGaps)
    || !product.acceptanceGaps.includes("EXPLICIT_5V_SOURCE_STATEMENT_MISSING")
    || product.currency !== "USD"
    || price.maximumAmountMinor !== maximumAmountMinor
    || price.allInBudgetProven !== false
    || price.taxAndAddressBoundFeesProven !== false
    || decision.blockers?.includes("EXPLICIT_5V_SOURCE_STATEMENT_MISSING") !== true
    || decision.commitEligible !== false || decision.recoveryEligible !== false
    || decision.role !== "OBSERVATION_ONLY"
    || checkout.accountAuthorityPresent !== false
    || checkout.targetAccountRequired !== true
    || privacy.contactProjected !== false || privacy.coordinatesProjected !== false
    || privacy.postalCodeProjected !== false || privacy.streetAddressProjected !== false) {
    fail("TARGET_CURRENT_MILESTONE_BOUNDARY_INVALID");
  }
  return {
    candidateRefHash: projectionHash,
    provider: TARGET_PROVIDER,
    role: "RECOVERY",
    projectionHash,
    sourceKind: "INDEPENDENT_FROZEN_SELLER_PROJECTION_V2",
    constraints: {
      product: {
        state: "FAIL",
        reasonCode: "EXPLICIT_5V_SOURCE_STATEMENT_MISSING",
        evidenceRefHashes: [projectionHash],
      },
      budget: {
        state: "UNKNOWN",
        reasonCode: "ALL_IN_TOTAL_NOT_PROVEN",
        evidenceRefHashes: [projectionHash],
      },
      deadline: {
        state: "UNKNOWN",
        reasonCode: "FULL_ADDRESS_DELIVERABILITY_AND_BINDING_DATE_NOT_PROVEN",
        evidenceRefHashes: [projectionHash],
      },
    },
    hardConstraintContradiction: true,
    everyApplicableHardConstraintProven: false,
    hardFilterDecision: "REJECT_HARD_CONSTRAINT",
    materializedForRanking: false,
    commitmentEligible: false,
    commitmentBlockers: [...new Set([
      ...decision.blockers,
      "TARGET_SELLER_PROJECTION_TO_UNIFIED_EPISODE_EXACT_HASH_BINDING_UNPROVEN",
    ])].sort(),
    facts: {
      observedAt: observationTime(projection.observedAt),
      sourceKind: "INDEPENDENT_FROZEN_SELLER_PROJECTION_V2",
      currency: product.currency,
      unitPriceMinor: product.unitPriceMinor,
      itemPlusScheduledDeliveryFeeBeforeTaxMinor:
        price.itemPlusScheduledDeliveryFeeBeforeTaxMinor,
      maximumAmountMinor: price.maximumAmountMinor,
      explicit5vClaim: product.explicit5vClaim,
      dataTransferClaimed: product.dataTransferClaimed,
      availableToPromiseQuantity: fulfillment.availableToPromiseQuantity,
      availabilityStatus: fulfillment.availabilityStatus,
      sourceDateMeetsRequestedDeadline:
        fulfillment.sourceDateMeetsRequestedDeadline === true,
      sourceDateIsBindingCommitment: false,
      providerSourceEstablishesCapacity: false,
      accountAuthorityPresent: false,
    },
  };
}

/**
 * Materialize SparkFun and Target as separate frozen seller inputs.  Target's
 * present product contradiction is deliberately resolved before ranking, so
 * no score can compensate for the missing explicit 5 V statement.
 */
export function materializeFirstPhysicalFormationRankingV2(input = {}) {
  object(input, "INPUT_INVALID");
  if (Reflect.ownKeys(input).some((key) => !["unifiedResult",
    "sparkFunFullAddressProjection", "targetRedskyFormationCandidateProjection",
    "recoveryCostEvidence", "adafruitEtaPlanning"].includes(key))
    || !Object.hasOwn(input, "unifiedResult")
    || !Object.hasOwn(input, "sparkFunFullAddressProjection")
    || !Object.hasOwn(input, "targetRedskyFormationCandidateProjection")) {
    fail("INPUT_INVALID");
  }
  const v1 = materializeFirstPhysicalFormationRankingV1({
    unifiedResult: input.unifiedResult,
    sparkFunFullAddressProjection: input.sparkFunFullAddressProjection,
  });
  const sparkfun = v1.hardConstraintEvaluations.find((row) =>
    row.provider === "SPARKFUN_MAGENTO_GUEST_CART");
  if (!sparkfun || typeof sparkfun.facts.maximumAmountMinor !== "string") {
    fail("SPARKFUN_BASE_MATERIALIZATION_INVALID");
  }
  const target = targetEvaluation(input.targetRedskyFormationCandidateProjection,
    sparkfun.facts.maximumAmountMinor);
  let adafruitPlanning = null;
  if (input.adafruitEtaPlanning != null) {
    const supplied = object(input.adafruitEtaPlanning, "ADAFRUIT_ETA_PLANNING_INVALID");
    if (supplied.formationPlanHash !== v1.formationPlanHash
      || supplied.assessment?.completionDeadline !== input.unifiedResult.product
        .productResponse.completionDeadline
      || supplied.sourceRouteEvidence?.facts?.allInPrice?.currency
        !== sparkfun.facts.currency) fail("ADAFRUIT_ETA_PLAN_BINDING_INVALID");
    adafruitPlanning = selectAdafruitEtaNextActionV1({
      assessment: supplied.assessment, sourceRouteEvidence: supplied.sourceRouteEvidence,
      maximumAmountMinor: sparkfun.facts.maximumAmountMinor,
    });
  }
  const legacyTargets = v1.hardConstraintEvaluations.filter((row) =>
    row.provider === TARGET_PROVIDER);
  if (legacyTargets.length !== 1
    || legacyTargets[0].hardFilterDecision !== "REJECT_HARD_CONSTRAINT"
    || Object.values(v1.ranking.rankings).flat().some((row) =>
      row.candidateRefHash === legacyTargets[0].candidateRefHash)) {
    fail("TARGET_HARD_FILTER_ORDER_INVALID");
  }
  const evaluations = v1.hardConstraintEvaluations.map((row) => {
    if (row.provider === TARGET_PROVIDER) return target;
    if (row.provider === "SPARKFUN_MAGENTO_GUEST_CART") return { ...row,
      facts: { ...row.facts,
        observedAt: observationTime(input.sparkFunFullAddressProjection.observedAt) } };
    if (row.provider === "ADAFRUIT_GUEST_SHOPPER" && adafruitPlanning !== null) {
      const { assessmentHash, sourceRouteEvidenceHash, candidates, selectedQuote,
        ...safePlanning } = adafruitPlanning;
      const safeQuote = ({ rateRefHash, ...quote }) => quote;
      return { ...row, facts: { ...row.facts,
        etaQuotePlanning: { ...safePlanning, candidates: candidates.map(safeQuote),
          selectedQuote: selectedQuote === null ? null : safeQuote(selectedQuote) } } };
    }
    return row;
  });
  const decisionSupport = buildFormationDecisionSupportV1({
    formationPlanHash: v1.formationPlanHash,
    hardConstraintEvaluations: evaluations,
    recoveryCostEvidence: input.recoveryCostEvidence ?? null,
  });
  const body = {
    schema: FIRST_PHYSICAL_FORMATION_RANKING_MATERIALIZER_V2_SCHEMA,
    schemaVersion: "2.0.0",
    formationPlanHash: v1.formationPlanHash,
    sourceBindings: {
      ...v1.sourceBindings,
      targetRedskyFormationCandidateProjectionHash: target.projectionHash,
      ...(adafruitPlanning === null ? {} : {
        adafruitEtaAssessmentHash: adafruitPlanning.assessmentHash,
        adafruitEtaSourceRouteEvidenceHash: adafruitPlanning.sourceRouteEvidenceHash,
      }),
      ...(input.recoveryCostEvidence == null ? {} : {
        recoveryCostEvidenceHash: digest("outsider/formation-recovery-cost-evidence/v1",
          input.recoveryCostEvidence),
      }),
    },
    sellerInputs: [
      { provider: "SPARKFUN_MAGENTO_GUEST_CART",
        sourceKind: "INDEPENDENT_FROZEN_SELLER_PROJECTION_V1" },
      { provider: TARGET_PROVIDER,
        sourceKind: "INDEPENDENT_FROZEN_SELLER_PROJECTION_V2" },
    ],
    hardConstraintEvaluations: evaluations,
    rankingEvidence: v1.rankingEvidence,
    ranking: v1.ranking,
    decisionSupport,
    materializedRealityFacts: {
      ...v1.materializedRealityFacts,
      target: { ...target.facts,
        productConstraintState: target.constraints.product.state,
        productConstraintReasonCode: target.constraints.product.reasonCode,
        budgetConstraintState: target.constraints.budget.state,
        deadlineConstraintState: target.constraints.deadline.state },
    },
    formationDisposition: "CONTINUE_MACHINE_FORMATION",
    outcomeCommitEligible: false,
    commitmentBlockers: v1.commitmentBlockers,
    nextMachineSearchObjectives: [...new Set([
      ...v1.nextMachineSearchObjectives,
      ...decisionSupport.routeProgress.filter((row) => row.searchEligible)
        .flatMap((row) => row.nextActions),
      ...decisionSupport.recoveryCostComparisons.flatMap((row) => row.nextActions),
    ])],
    boundary: {
      ...v1.boundary,
      targetIndependentSellerProjectionConsumed: true,
      targetProductHardFilterAppliedBeforeRanking: true,
      targetRankingScoreComputed: false,
      targetProjectionCreatesAuthority: false,
      targetProjectionProvesCapacity: false,
      targetProjectionProvesOutcomeTruth: false,
    },
  };
  return deepFreeze({ ...body,
    materializationHash: digest(
      FIRST_PHYSICAL_FORMATION_RANKING_MATERIALIZER_V2_SCHEMA, body) });
}
