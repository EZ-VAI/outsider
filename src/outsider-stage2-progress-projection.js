/*
 * Unified typed Stage 2 pricing-progress projection.
 *
 * A source-domain historical loss cost is useful progress, but it is not a
 * target-domain technical premium or quote. This seam consumes only the exact
 * pinned RMA final-v4 receipt and keeps those values in different fields. It
 * is deliberately not imported by the Stage 3/4 quote or authority gates.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  describeStage2ProgressProjectionBoundary as describeCycleFreeStage2ProgressBoundary,
  STAGE2_PROGRESS_PROJECTION_SCHEMA,
  STAGE2_TARGET_PRICE_STATE,
} from "./outsider-stage2-progress-boundary.js";
import {
  REAL_LOSS_CALIBRATION_SHADOW_SCHEMA,
  REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS,
} from "./outsider-real-loss-calibration-shadow.js";
import {
  STAGE2_RMA_SHADOW_PRICING_CANONICAL,
  STAGE2_RMA_SHADOW_PRICING_SCHEMA,
  verifyStage2RmaShadowPricingCanonicalStructure,
} from "./outsider-stage2-rma-shadow-pricing.js";

export { STAGE2_PROGRESS_PROJECTION_SCHEMA, STAGE2_TARGET_PRICE_STATE } from
  "./outsider-stage2-progress-boundary.js";

const HASH = /^sha256:[a-f0-9]{64}$/u;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/u;

function fail(code) {
  throw new Error(`STAGE2_PROGRESS_PROJECTION_${code}`);
}

function plain(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  try { return canonicalizeStrict(left) === canonicalizeStrict(right); }
  catch { return false; }
}

function digest(value) {
  return `sha256:${createHash("sha256")
    .update(`${STAGE2_PROGRESS_PROJECTION_SCHEMA}\0${canonicalizeStrict(value)}`,
      "utf8").digest("hex")}`;
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function diagnosticReferences() {
  return {
    realLossAndCasCalibrationShadow: {
      schema: REAL_LOSS_CALIBRATION_SHADOW_SCHEMA,
      implementation: "src/outsider-real-loss-calibration-shadow.js",
      role: "SOURCE_DOMAIN_METHOD_DEVELOPMENT_AND_MISSINGNESS_DIAGNOSTIC_REFERENCE_ONLY",
      rmaUpstreamArtifactHash:
        REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.rma.artifactHash,
      casSchedulePUpstreamArtifactHash:
        REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.cas.artifactHash,
      rmaAndCasNumericAmountsPooled: false,
      casLineAmountsPooled: false,
      sourceAmountsComparableAcrossDomainsEstablished: false,
      targetDomainTransferEstimated: false,
      selectedAsTargetPricingInput: false,
      selectedAsCanonicalPricingArtifact: false,
    },
  };
}

function fixedTargetBoundary() {
  return {
    targetTechnicalPremium: null,
    targetQuotedPrice: null,
    pricePermission: false,
    trainingPermission: false,
    targetPriceState: STAGE2_TARGET_PRICE_STATE,
    targetPriceReason:
      "INSUFFICIENT_TARGET_DOMAIN_EVIDENCE_TRANSFER_REVIEW_AND_AUTHORITY",
    targetDomainTransferEstablished: false,
    readyToPriceTargetDomain: false,
    readyToBearResponsibility: false,
  };
}

function fixedStage34Boundary() {
  return {
    stage3QuoteInput: false,
    stage3AuthorityInput: false,
    stage4SettlementInput: false,
    permitsGuarantee: false,
    permitsSettlement: false,
    movesFunds: false,
    closesObligation: false,
  };
}

function fixedAuthority() {
  return {
    professionalActuarialOpinion: false,
    independentActuarialReview: false,
    priceAuthority: false,
    underwritingAuthority: false,
    capitalAuthority: false,
    custodyAuthority: false,
    claimsAuthority: false,
    paymentAuthority: false,
    operationalAuthorityGranted: false,
  };
}

function sourceIndication(canonical) {
  if (!POSITIVE_INTEGER.test(canonical.publisherRecordedIndemnityDollars ?? "")
    || !POSITIVE_INTEGER.test(canonical.historicalLossCostAggregateDollars ?? "")
    || canonical.publisherRecordedIndemnityDollars
      !== canonical.historicalLossCostAggregateDollars
    || canonical.sourceDomainHistoricalLossCostNonzero !== true) {
    fail("SOURCE_DOMAIN_HISTORICAL_LOSS_COST_INVALID");
  }
  return {
    status: "NONZERO",
    sourceDomain: "US_FEDERAL_CROP_INSURANCE",
    commodityYear: 2024,
    numberKind:
      "PUBLISHER_RECORDED_HISTORICAL_LOSS_COST_NOT_PROSPECTIVE_PREMIUM",
    publisherRecordedIndemnityDollars:
      canonical.publisherRecordedIndemnityDollars,
    historicalLossCostAggregateDollars:
      canonical.historicalLossCostAggregateDollars,
    historicalLossCostPerEarningPolicyCellDollars:
      canonical.historicalLossCostPerEarningPolicyCellDollars,
    historicalLossCostPer1000LiabilityDollars:
      canonical.historicalLossCostPer1000LiabilityDollars,
    historicalLossRateOnLiability:
      canonical.historicalLossRateOnLiability,
    prospectiveForecast: false,
    individualPolicyPrice: false,
    targetDomainPrice: false,
    temporalQuarantineReferenceOnly: true,
    currentCoverageAdmitted: false,
    currentRoutingAdmitted: false,
    targetUseAdmitted: false,
  };
}

function bodyProjection(canonical) {
  return {
    schema: STAGE2_PROGRESS_PROJECTION_SCHEMA,
    schemaVersion: "1.1.0",
    generatedAt: STAGE2_RMA_SHADOW_PRICING_CANONICAL.generatedAt,
    sourceReceipt: {
      schema: STAGE2_RMA_SHADOW_PRICING_SCHEMA,
      canonicalRelease:
        STAGE2_RMA_SHADOW_PRICING_CANONICAL.canonicalRelease,
      repositoryRelativePath:
        STAGE2_RMA_SHADOW_PRICING_CANONICAL.repositoryRelativePath,
      artifactHash: canonical.artifactHash,
      artifactFileHash: canonical.artifactFileHash,
      artifactFileBytes: canonical.artifactFileBytes,
      verificationLevel: canonical.verificationLevel,
      canonicalArtifactExactBytesVerified: true,
      canonicalArtifactMode0600Verified: true,
      rmaSourceArtifactsReplayedByThisProjection: false,
      currentChainSourcesReplayedByThisProjection: false,
      currentChainCanonicalBytesVerifiedByThisProjection: false,
      currentChainContractHash: canonical.currentChainContractHash,
      currentChainArtifactFileHash: canonical.currentChainArtifactFileHash,
      currentChainArtifactFileBytes: canonical.currentChainArtifactFileBytes,
      readinessStatus: canonical.readinessStatus,
      temporalAuditManifestHash: canonical.temporalAuditManifestHash,
      pinnedReceiptCount: canonical.pinnedReceiptCount,
      temporallyOrderedCurrentReceiptCount:
        canonical.temporallyOrderedCurrentReceiptCount,
      temporalQuarantineReceiptCount:
        canonical.temporalQuarantineReceiptCount,
      currentCoverageReceiptCount: canonical.currentCoverageReceiptCount,
      allPinnedReceiptsTemporallyCurrent:
        canonical.allPinnedReceiptsTemporallyCurrent,
      temporalQuarantineReferenceFactorCount:
        canonical.temporalQuarantineReferenceFactorCount,
      temporallyOrderedReceiptReferenceFactorCount:
        canonical.temporallyOrderedReceiptReferenceFactorCount,
      factorsAdmittedForCurrentCoverage:
        canonical.factorsAdmittedForCurrentCoverage,
      factorsAdmittedForCurrentRouting:
        canonical.factorsAdmittedForCurrentRouting,
      temporalQuarantineClosureCredit:
        canonical.temporalQuarantineClosureCredit,
      temporalQuarantineCausalExperienceUnits:
        canonical.temporalQuarantineCausalExperienceUnits,
      temporalQuarantineTrainingAdmission:
        canonical.temporalQuarantineTrainingAdmission,
      temporalQuarantinePricingAdmission:
        canonical.temporalQuarantinePricingAdmission,
      temporalQuarantineOperationalAuthority:
        canonical.temporalQuarantineOperationalAuthority,
      rmaParentReceiptId: canonical.rmaParentReceiptId,
      rmaParentArtifactHash: canonical.rmaParentArtifactHash,
      rmaParentTemporalStatus: canonical.rmaParentTemporalStatus,
      rmaParentTemporalAuthenticityEstablished:
        canonical.rmaParentTemporalAuthenticityEstablished,
      rmaParentTemporalQuarantineReferenceOnly:
        canonical.rmaParentTemporalQuarantineReferenceOnly,
      rmaParentCurrentRoutingEligible:
        canonical.rmaParentCurrentRoutingEligible,
      rmaParentCurrentCoverage: canonical.rmaParentCurrentCoverage,
      rmaParentCurrentTruth: canonical.rmaParentCurrentTruth,
      rmaParentClosureCredit: canonical.rmaParentClosureCredit,
      rmaParentCausalExperienceUnits: canonical.rmaParentCausalExperienceUnits,
      rmaParentTrainingAdmission: canonical.rmaParentTrainingAdmission,
      rmaParentPricingAdmission: canonical.rmaParentPricingAdmission,
      rmaParentOperationalAuthorityGranted:
        canonical.rmaParentOperationalAuthorityGranted,
      trainingPermission: canonical.trainingPermission,
    },
    sourceDomainHistoricalLossCostIndication: sourceIndication(canonical),
    ...fixedTargetBoundary(),
    supportingDiagnosticReferences: diagnosticReferences(),
    stage34Boundary: fixedStage34Boundary(),
    authority: fixedAuthority(),
    decision:
      "REPORT_NONZERO_SOURCE_DOMAIN_HISTORICAL_LOSS_COST_HOLD_TARGET_PRICE_AND_AUTHORITY",
  };
}

const ROOT_KEYS = Object.freeze([
  "schema", "schemaVersion", "generatedAt", "sourceReceipt",
  "sourceDomainHistoricalLossCostIndication", "targetTechnicalPremium",
  "targetQuotedPrice", "pricePermission", "trainingPermission", "targetPriceState",
  "targetPriceReason", "targetDomainTransferEstablished",
  "readyToPriceTargetDomain", "readyToBearResponsibility",
  "supportingDiagnosticReferences", "stage34Boundary", "authority",
  "decision", "projectionHash",
]);

function canonicalReceipt(artifactPath) {
  const checked = verifyStage2RmaShadowPricingCanonicalStructure(artifactPath);
  if (!checked.ok
    || checked.verificationLevel
      !== "PINNED_FINAL_V4_EXACT_BYTES_STRUCTURE_ONLY_NO_SOURCE_AUTHENTICATION"
    || checked.canonicalGeneratedAtVerified !== true
    || checked.canonicalArtifactExactBytesVerified !== true
    || checked.canonicalArtifactStableRead !== true
    || checked.canonicalArtifactMode0600Verified !== true
    || checked.rmaSourceArtifactsReverified !== false
    || checked.currentChainSourcesReplayed !== false
    || checked.currentChainCanonicalBytesVerified !== false
    || checked.currentChainContractHash
      !== "sha256:f132e191a2e53b87f677983b85dadb25c3f9c4693254e4e8e4c24856caeb0a33"
    || checked.currentChainArtifactFileHash
      !== "sha256:17b2ff445dd7042f59700a599a4b8a368c53a1bb6e9213ac55135278b68c093a"
    || checked.currentChainArtifactFileBytes !== 19_833
    || checked.readinessStatus
      !== "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY"
    || checked.temporalAuditManifestHash
      !== "sha256:9ab9517173af2b49f58dddd51a59d3b71ec76bfa6acb10cd5a84c4a426dcd453"
    || checked.pinnedReceiptCount !== 16
    || checked.temporallyOrderedCurrentReceiptCount !== 9
    || checked.temporalQuarantineReceiptCount !== 7
    || checked.currentCoverageReceiptCount !== 9
    || checked.allPinnedReceiptsTemporallyCurrent !== false
    || checked.temporalQuarantineReferenceFactorCount !== 40
    || checked.temporallyOrderedReceiptReferenceFactorCount !== 62
    || checked.factorsAdmittedForCurrentCoverage !== 0
    || checked.factorsAdmittedForCurrentRouting !== 0
    || checked.temporalQuarantineClosureCredit !== 0
    || checked.temporalQuarantineCausalExperienceUnits !== 0
    || checked.temporalQuarantineTrainingAdmission !== 0
    || checked.temporalQuarantinePricingAdmission !== 0
    || checked.temporalQuarantineOperationalAuthority !== 0
    || checked.rmaParentReceiptId !== "CROSS_STAGE_SIX_LANE_PROGRESS"
    || checked.rmaParentArtifactHash
      !== "sha256:33e814497547ed4c49bd7c7e05f238915cd19cd71a6280ae20276364ba3a2b41"
    || checked.rmaParentTemporalStatus
      !== "PINNED_SOURCE_REPLAYED_TEMPORAL_AUTHENTICITY_UNESTABLISHED"
    || checked.rmaParentTemporalAuthenticityEstablished !== false
    || checked.rmaParentTemporalQuarantineReferenceOnly !== true
    || checked.rmaParentCurrentRoutingEligible !== false
    || checked.rmaParentCurrentCoverage !== false
    || checked.rmaParentCurrentTruth !== false
    || checked.rmaParentClosureCredit !== false
    || checked.rmaParentCausalExperienceUnits !== 0
    || checked.rmaParentTrainingAdmission !== false
    || checked.rmaParentPricingAdmission !== false
    || checked.rmaParentOperationalAuthorityGranted !== false
    || checked.trainingPermission !== false
    || checked.sourceDomainHistoricalLossCostNonzero !== true
    || checked.targetQuotedPrice !== null
    || checked.targetQuotedPriceRepresentsNumericZero !== false
    || checked.pricePermission !== false
    || checked.readyToPriceTargetDomain !== false
    || checked.readyToBearResponsibility !== false
    || !HASH.test(checked.artifactHash ?? "")
    || !HASH.test(checked.artifactFileHash ?? "")
    || !Number.isSafeInteger(checked.artifactFileBytes)
    || checked.artifactFileBytes <= 0) {
    fail(`CANONICAL_RMA_RECEIPT_INVALID:${checked.error ?? "BOUNDARY"}`);
  }
  return checked;
}

export function buildStage2ProgressProjection({
  rmaShadowPricingArtifactPath,
} = {}) {
  if (typeof rmaShadowPricingArtifactPath !== "string"
    || rmaShadowPricingArtifactPath.length === 0) {
    fail("RMA_SHADOW_PRICING_ARTIFACT_PATH_REQUIRED");
  }
  const canonical = canonicalReceipt(rmaShadowPricingArtifactPath);
  const body = bodyProjection(canonical);
  return deepFreeze({ ...body, projectionHash: digest(body) });
}

function invalidReceipt(error) {
  return deepFreeze({
    ok: false,
    verificationLevel: "INVALID",
    sourceDomainHistoricalLossCostIndication: null,
    readinessStatus: "HOLD_INVALID_OR_UNVERIFIED",
    temporalAuditManifestHash: null,
    pinnedReceiptCount: 0,
    temporallyOrderedCurrentReceiptCount: 0,
    temporalQuarantineReceiptCount: 0,
    currentCoverageReceiptCount: 0,
    allPinnedReceiptsTemporallyCurrent: false,
    temporalQuarantineReferenceFactorCount: 0,
    temporallyOrderedReceiptReferenceFactorCount: 0,
    factorsAdmittedForCurrentCoverage: 0,
    factorsAdmittedForCurrentRouting: 0,
    temporalQuarantineClosureCredit: 0,
    temporalQuarantineCausalExperienceUnits: 0,
    temporalQuarantineTrainingAdmission: 0,
    temporalQuarantinePricingAdmission: 0,
    temporalQuarantineOperationalAuthority: 0,
    rmaParentReceiptId: null,
    rmaParentTemporalStatus: "UNVERIFIED",
    rmaParentTemporalQuarantineReferenceOnly: true,
    rmaParentCurrentCoverage: false,
    rmaParentTrainingAdmission: false,
    currentChainContractHash: null,
    currentChainArtifactFileHash: null,
    currentChainArtifactFileBytes: 0,
    currentChainCanonicalBytesVerifiedByThisProjection: false,
    targetTechnicalPremium: null,
    targetQuotedPrice: null,
    pricePermission: false,
    trainingPermission: false,
    targetPriceState: STAGE2_TARGET_PRICE_STATE,
    readyToPriceTargetDomain: false,
    readyToBearResponsibility: false,
    stage3QuoteInput: false,
    operationalAuthorityGranted: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

export function verifyStage2ProgressProjection(projection, {
  rmaShadowPricingArtifactPath,
} = {}) {
  try {
    if (!exactKeys(projection, ROOT_KEYS)
      || projection.schema !== STAGE2_PROGRESS_PROJECTION_SCHEMA
      || projection.schemaVersion !== "1.1.0"
      || !HASH.test(projection.projectionHash ?? "")) {
      fail("PROJECTION_SCHEMA_INVALID");
    }
    const expected = buildStage2ProgressProjection({
      rmaShadowPricingArtifactPath,
    });
    if (!same(projection, expected)) fail("PROJECTION_CANONICAL_RECEIPT_MISMATCH");
    return deepFreeze({
      ok: true,
      verificationLevel:
        "PINNED_RMA_FINAL_V4_TEMPORAL_QUARANTINE_HOLD_PROJECTED_NO_SOURCE_REPLAY",
      projectionHash: projection.projectionHash,
      sourceDomainHistoricalLossCostIndication:
        projection.sourceDomainHistoricalLossCostIndication,
      readinessStatus: projection.sourceReceipt.readinessStatus,
      temporalAuditManifestHash:
        projection.sourceReceipt.temporalAuditManifestHash,
      pinnedReceiptCount: projection.sourceReceipt.pinnedReceiptCount,
      temporallyOrderedCurrentReceiptCount:
        projection.sourceReceipt.temporallyOrderedCurrentReceiptCount,
      temporalQuarantineReceiptCount:
        projection.sourceReceipt.temporalQuarantineReceiptCount,
      currentCoverageReceiptCount:
        projection.sourceReceipt.currentCoverageReceiptCount,
      allPinnedReceiptsTemporallyCurrent:
        projection.sourceReceipt.allPinnedReceiptsTemporallyCurrent,
      temporalQuarantineReferenceFactorCount:
        projection.sourceReceipt.temporalQuarantineReferenceFactorCount,
      temporallyOrderedReceiptReferenceFactorCount:
        projection.sourceReceipt.temporallyOrderedReceiptReferenceFactorCount,
      factorsAdmittedForCurrentCoverage:
        projection.sourceReceipt.factorsAdmittedForCurrentCoverage,
      factorsAdmittedForCurrentRouting:
        projection.sourceReceipt.factorsAdmittedForCurrentRouting,
      temporalQuarantineClosureCredit:
        projection.sourceReceipt.temporalQuarantineClosureCredit,
      temporalQuarantineCausalExperienceUnits:
        projection.sourceReceipt.temporalQuarantineCausalExperienceUnits,
      temporalQuarantineTrainingAdmission:
        projection.sourceReceipt.temporalQuarantineTrainingAdmission,
      temporalQuarantinePricingAdmission:
        projection.sourceReceipt.temporalQuarantinePricingAdmission,
      temporalQuarantineOperationalAuthority:
        projection.sourceReceipt.temporalQuarantineOperationalAuthority,
      rmaParentReceiptId: projection.sourceReceipt.rmaParentReceiptId,
      rmaParentTemporalStatus:
        projection.sourceReceipt.rmaParentTemporalStatus,
      rmaParentTemporalQuarantineReferenceOnly:
        projection.sourceReceipt.rmaParentTemporalQuarantineReferenceOnly,
      rmaParentCurrentCoverage:
        projection.sourceReceipt.rmaParentCurrentCoverage,
      rmaParentTrainingAdmission:
        projection.sourceReceipt.rmaParentTrainingAdmission,
      currentChainContractHash:
        projection.sourceReceipt.currentChainContractHash,
      currentChainArtifactFileHash:
        projection.sourceReceipt.currentChainArtifactFileHash,
      currentChainArtifactFileBytes:
        projection.sourceReceipt.currentChainArtifactFileBytes,
      currentChainCanonicalBytesVerifiedByThisProjection: false,
      targetTechnicalPremium: null,
      targetQuotedPrice: null,
      pricePermission: false,
      trainingPermission: false,
      targetPriceState: STAGE2_TARGET_PRICE_STATE,
      readyToPriceTargetDomain: false,
      readyToBearResponsibility: false,
      stage3QuoteInput: false,
      operationalAuthorityGranted: false,
    });
  } catch (error) {
    return invalidReceipt(error);
  }
}

export function describeStage2ProgressProjectionBoundary() {
  return describeCycleFreeStage2ProgressBoundary();
}
