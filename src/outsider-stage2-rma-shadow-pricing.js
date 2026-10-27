/*
 * Stage 2 USDA RMA source-domain historical loss-cost receipt.
 *
 * This module keeps three facts separate:
 *   1. USDA RMA published a non-zero 2024 aggregate indemnity;
 *   2. that amount divided by matched source-domain exposure is a historical
 *      loss cost, not a prospective premium or an individual policy quote;
 *   3. Outsider still has no AI-agent/robot target quote, price permission,
 *      capital, coverage, or responsibility authority.
 *
 * The final-v4 generatedAt is fixed by code. Callers cannot choose a time and
 * then obtain a receipt that looks canonical.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants as fsConstants, fstatSync, openSync, readFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalizeStrict } from "./canonical.js";
import {
  RMA_SOB_COVERAGE_FROZEN_SOURCE_2024,
  verifyRmaCropInsuranceExperienceWithSource,
} from "./outsider-rma-crop-insurance-experience.js";
import {
  STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL,
  STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA,
  STAGE2_CURRENT_CHAIN_PINS,
  STAGE2_CURRENT_CHAIN_PIN_SET_HASH,
  verifyStage2CurrentChainAdmissionCanonicalStructure,
} from "./outsider-stage2-current-chain-admission.js";

export const STAGE2_RMA_SHADOW_PRICING_SCHEMA
  = "outsider/stage2-rma-source-domain-historical-loss-cost/v2";

export const STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1 = Object.freeze({
  canonicalRelease: "final-v1",
  repositoryRelativePath:
    "artifacts/stage2-rma-shadow-pricing-20260822/final-v1/indication.json",
  generatedAt: "2026-08-22T08:00:00.000Z",
  artifactHash:
    "sha256:dc85256a5dc6f719fea263b0341f2bce38592a9f74c2d183694c8e2391997d10",
  artifactFileHash:
    "sha256:4ddcb9e6985654fec723ba408916070d8ccaee6959fd72e1f5b1750e7c816209",
  artifactFileBytes: 6_620,
  supersessionMarkerRepositoryRelativePath:
    "artifacts/stage2-rma-shadow-pricing-20260822/final-v1/superseded-by.json",
  supersessionMarkerFileHash:
    "sha256:0131b97a6451b7d6af0f03675d7c2595f2c2a6f80deaa558cd6e90c80664e3e3",
  supersessionMarkerFileBytes: 999,
  status: "PRESERVED_SUPERSEDED_DO_NOT_CLOBBER",
});

export const STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V2 = Object.freeze({
  canonicalRelease: "final-v2",
  repositoryRelativePath:
    "artifacts/stage2-rma-shadow-pricing-20260822/final-v2/historical-loss-cost.json",
  generatedAt: "2026-08-22T09:00:00.000Z",
  artifactHash:
    "sha256:e44e14fc5bce5c26483b1435104a99ff8113cb49c830db3554e5aaff25a229a6",
  artifactFileHash:
    "sha256:6ddf593d753a47b05a1d9e787cdd59d7024781741a3540fd7aca349bc9dafddb",
  artifactFileBytes: 7_158,
  status: "PRESERVED_SUPERSEDED_STALE_CURRENT_CHAIN_DO_NOT_CLOBBER",
});

export const STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3 = Object.freeze({
  canonicalRelease: "final-v3",
  repositoryRelativePath:
    "artifacts/stage2-rma-shadow-pricing-20260822/final-v3/historical-loss-cost.json",
  generatedAt: "2026-08-28T07:00:12.703Z",
  artifactHash:
    "sha256:448981f4caf23d392a56e08852e7d96d3bfcd10700907799e0d5f25f8e370bf3",
  artifactFileHash:
    "sha256:f4fc63d32d1beb667a9aacb96506c315cb4d912cc157ebe8c0c071e04a67ca92",
  artifactFileBytes: 7_163,
  supersessionMarkerRepositoryRelativePath:
    "artifacts/stage2-rma-shadow-pricing-20260822/final-v3/superseded-by.json",
  supersessionMarkerFileHash:
    "sha256:cf431724d3bd91dd259a5331624cd232e2ec84e0841dadd901816ea41eacbb24",
  supersessionMarkerFileBytes: 1_146,
  status: "PRESERVED_SUPERSEDED_PRE_TEMPORAL_QUARANTINE_HOLD_DO_NOT_CLOBBER",
});

/*
 * The three final-v4 identity fields are patched only after the no-clobber
 * artifact is first frozen. They are external pins and are deliberately not
 * projected into the artifact, avoiding a self-referential file hash.
 */
export const STAGE2_RMA_SHADOW_PRICING_CANONICAL = Object.freeze({
  generatedAt: "2026-08-28T10:49:33.521Z",
  canonicalRelease: "final-v4",
  repositoryRelativePath:
    "artifacts/stage2-rma-shadow-pricing-20260822/final-v4/historical-loss-cost.json",
  artifactHash:
    "sha256:d51252880264d2ba8dc546d715876f864f85da00b29b709c2b154d0f42807f1c",
  artifactFileHash:
    "sha256:e812c35df7fc55c2ff6dc8bf7e0f4ecd43d46fe6270b5140842d8ea3b118a31f",
  artifactFileBytes: 10_208,
  rmaArtifactRepositoryRelativePath:
    "artifacts/stage234-rma-crop-insurance-2024/experience-v2-rights-boundary.json",
  rmaArtifactHash:
    "sha256:5ed89ea0108b403095dd1a8ca609fe6d2fb7c505a0d8865adef73f8de5446dce",
  rmaArtifactFileHash:
    "sha256:548314566c6b1855adc25a17e2910265b6f1cb26c402dd6412e6b2471decff8a",
  rmaArtifactFileBytes: 118_363,
});

const EXPECTED_NATIONAL = Object.freeze({
  rows: 152_383,
  exposureCells: 97_782,
  zeroReportedLossExposureCells: 41_792,
  earningPolicyCellCount: "1218360",
  liabilityDollars: "158673917761",
  observedProgramPremiumDollars: "15882764266",
  publisherRecordedIndemnityDollars: "15163448979",
  historicalLossCostPerEarningPolicyCellDollars: "12445.79",
  historicalIndemnityToObservedPremiumRatio: "0.95471095",
  historicalLossRateOnLiability: "0.09556359",
});

const HASH = /^sha256:[a-f0-9]{64}$/u;
const UNSIGNED_INTEGER = /^(0|[1-9][0-9]*)$/u;
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024;
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), "..",
);

function fail(code) {
  throw new Error(`STAGE2_RMA_SHADOW_PRICING_${code}`);
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

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digestBytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(value) {
  return `sha256:${createHash("sha256")
    .update(`${STAGE2_RMA_SHADOW_PRICING_SCHEMA}\0${canonicalizeStrict(value)}`,
      "utf8").digest("hex")}`;
}

function fixedDecimal(numeratorText, denominatorText, places) {
  if (!UNSIGNED_INTEGER.test(numeratorText)
    || !UNSIGNED_INTEGER.test(denominatorText)) fail("DECIMAL_INPUT_INVALID");
  const numerator = BigInt(numeratorText);
  const denominator = BigInt(denominatorText);
  if (denominator === 0n) fail("DECIMAL_DENOMINATOR_ZERO");
  const scale = 10n ** BigInt(places);
  const rounded = (numerator * scale + denominator / 2n) / denominator;
  const digits = rounded.toString().padStart(places + 1, "0");
  return places === 0 ? digits
    : `${digits.slice(0, -places) || "0"}.${digits.slice(-places)}`;
}

function canonicalPinsFinalized() {
  return HASH.test(STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactHash ?? "")
    && HASH.test(STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactFileHash ?? "")
    && Number.isSafeInteger(
      STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactFileBytes,
    )
    && STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactFileBytes > 0;
}

function parsePinnedRmaArtifact(bytesLike) {
  if (!Buffer.isBuffer(bytesLike) && !(bytesLike instanceof Uint8Array)) {
    fail("RMA_ARTIFACT_BYTES_INVALID");
  }
  const bytes = Buffer.from(bytesLike);
  if (bytes.length !== STAGE2_RMA_SHADOW_PRICING_CANONICAL.rmaArtifactFileBytes
    || digestBytes(bytes)
      !== STAGE2_RMA_SHADOW_PRICING_CANONICAL.rmaArtifactFileHash) {
    fail("RMA_CANONICAL_ARTIFACT_EXACT_BYTES_INVALID");
  }
  let artifact;
  try { artifact = JSON.parse(bytes.toString("utf8")); }
  catch { fail("RMA_ARTIFACT_JSON_INVALID"); }
  if (artifact?.artifactHash
      !== STAGE2_RMA_SHADOW_PRICING_CANONICAL.rmaArtifactHash) {
    fail("RMA_CANONICAL_ARTIFACT_HASH_INVALID");
  }
  return artifact;
}

function requireExpectedNational(national) {
  if (!plain(national)
    || national.rows !== EXPECTED_NATIONAL.rows
    || national.exposureCells !== EXPECTED_NATIONAL.exposureCells
    || national.zeroReportedLossExposureCells
      !== EXPECTED_NATIONAL.zeroReportedLossExposureCells
    || national.policiesEarningPremium
      !== EXPECTED_NATIONAL.earningPolicyCellCount
    || national.liabilityDollars !== EXPECTED_NATIONAL.liabilityDollars
    || national.totalPremiumDollars
      !== EXPECTED_NATIONAL.observedProgramPremiumDollars
    || national.indemnityDollars
      !== EXPECTED_NATIONAL.publisherRecordedIndemnityDollars
    || national.historicalIndemnityPerEarningPolicyCellDollars
      !== EXPECTED_NATIONAL.historicalLossCostPerEarningPolicyCellDollars
    || national.historicalIndemnityToPremiumRatio
      !== EXPECTED_NATIONAL.historicalIndemnityToObservedPremiumRatio
    || national.historicalIndemnityToLiabilityRatio
      !== EXPECTED_NATIONAL.historicalLossRateOnLiability
    || national.materialMissingMonetaryCells !== 0
    || national.historicalIndemnityRatioModelEligible !== true) {
    fail("RMA_NATIONAL_EXPECTED_TOTALS_INVALID");
  }
}

function fixedLifecycle() {
  return {
    objectKind:
      "FROZEN_SOURCE_DOMAIN_HISTORICAL_LOSS_COST_REFERENCE_WITH_TEMPORAL_QUARANTINE_HOLD",
    canonicalRelease: STAGE2_RMA_SHADOW_PRICING_CANONICAL.canonicalRelease,
    canonicalRepositoryRelativePath:
      STAGE2_RMA_SHADOW_PRICING_CANONICAL.repositoryRelativePath,
    canonicalGeneratedAtFixedByCode: true,
    noClobberFreezeRequired: true,
    supersedesPreservedRelease:
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.canonicalRelease,
    supersededArtifactHash:
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.artifactHash,
    supersededArtifactFileHash:
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.artifactFileHash,
    canonicalSelectionMeaning:
      "CODE_FIXED_LOCAL_RELEASE_SELECTION_NOT_EVIDENCE_TEMPORAL_CURRENTNESS",
    containsPublisherRecordedIndemnity: true,
    containsHistoricalLossCost: true,
    containsProspectivePremium: false,
    containsTargetDomainQuote: false,
  };
}

function fixedCurrentStage2Boundary() {
  return {
    contractSchema: STAGE2_CURRENT_CHAIN_ADMISSION_CONTRACT_SCHEMA,
    contractVersion: STAGE2_CURRENT_CHAIN_PINS.contractVersion,
    contractHash: STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.contractHash,
    contractGeneratedAt: STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.generatedAt,
    pinSetHash: STAGE2_CURRENT_CHAIN_PIN_SET_HASH,
    canonicalContractFileHash:
      STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.artifactFileHash,
    canonicalContractFileBytes:
      STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.artifactFileBytes,
    bindingVerificationLevel:
      "PINNED_CANONICAL_EXACT_BYTES_STRUCTURE_ONLY_NO_SOURCE_AUTHENTICATION",
    readinessStatus: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
    temporalAuditManifestHash:
      STAGE2_CURRENT_CHAIN_PINS.temporalAudit.manifestHash,
    pinnedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    allPinnedReceiptsTemporallyCurrent: false,
    temporalQuarantineReferenceFactorCount: 40,
    temporallyOrderedReceiptReferenceFactorCount: 62,
    factorsAdmittedForCurrentCoverage: 0,
    factorsAdmittedForCurrentRouting: 0,
    temporalQuarantineClosureCredit: 0,
    temporalQuarantineCausalExperienceUnits: 0,
    temporalQuarantineTrainingAdmission: 0,
    temporalQuarantinePricingAdmission: 0,
    temporalQuarantineOperationalAuthority: 0,
    currentChainCanonicalBytesVerified: true,
    currentChainSourcesReplayed: false,
    targetPreActionRowsAdmitted: 0,
    targetLossRowsAdmitted: 0,
    targetDomainTransferEstablished: false,
    targetQuotedPrice: null,
    pricePermission: false,
    readyToPriceTargetDomain: false,
    readyToBearResponsibility: false,
  };
}

function fixedSourceDomainEvidence() {
  return {
    sourceDomain: "US_FEDERAL_CROP_INSURANCE",
    temporalAuditParentReceiptId: "CROSS_STAGE_SIX_LANE_PROGRESS",
    temporalAuditParentArtifactPathRole:
      "TEMPORAL_QUARANTINE_CROSS_STAGE_PROGRESS_JSON_REFERENCE_ONLY",
    temporalAuditParentArtifactHash:
      "sha256:33e814497547ed4c49bd7c7e05f238915cd19cd71a6280ae20276364ba3a2b41",
    temporalAuditParentArtifactFileHash:
      "sha256:a48ec04b872e0ea4215c0b20d697effb0a817c287d583fadbd2cd4de70540e7a",
    temporalAuditParentArtifactFileBytes: 20_848,
    temporalAuditParentSourceCommitment:
      "sha256:1a3999bffc91d47fba284f48ae306c9f78326331a612e8b6c043aa879aaddf26",
    datasetId: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.datasetId,
    publisher: "USDA_RISK_MANAGEMENT_AGENCY",
    program: "FEDERAL_CROP_INSURANCE",
    commodityYear: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.commodityYear,
    rmaExperienceArtifactHash:
      STAGE2_RMA_SHADOW_PRICING_CANONICAL.rmaArtifactHash,
    rmaExperienceArtifactFileHash:
      STAGE2_RMA_SHADOW_PRICING_CANONICAL.rmaArtifactFileHash,
    rmaSourceCommitmentHash:
      "sha256:ededd3b190ae1ab7bf773b511e1d38586748657a37c88062968cf6bcb1d4a7b5",
    sourceObjectHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectHash,
    recordLayoutHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutHash,
    buildClaimedVerificationLevel: "FULL_OFFICIAL_USDA_RMA_SOURCE_REPLAYED",
    rmaSourceArtifactsReverified: true,
    officialFrozenSourceVerified: true,
    upstreamReceiptTemporalStatus:
      "PINNED_SOURCE_REPLAYED_TEMPORAL_AUTHENTICITY_UNESTABLISHED",
    temporalAuthenticityEstablished: false,
    temporalQuarantineReferenceOnly: true,
    currentRoutingEligible: false,
    currentCoverage: false,
    currentTruth: false,
    currentTruthMeaning:
      "TEMPORAL_AUTHENTICITY_UNESTABLISHED_QUARANTINED_REFERENCE_ONLY",
    closureCredit: false,
    causalExperienceUnits: 0,
    trainingAdmission: false,
    pricingAdmission: false,
    operationalAuthorityGranted: false,
    snapshotMutability: "MOST_RECENT_FIVE_YEARS_REFRESHED_WEEKLY_BY_PUBLISHER",
    publicAccessObserved: true,
    webPolicyBytesReplayed: false,
    modelTrainingRightsLegallyConcluded: false,
    transferToAiAgentOrRobotDomainEstablished: false,
  };
}

function fixedMatchedHistoricalExperience() {
  return {
    aggregation: "NATIONAL_2024_FROZEN_SOURCE_PORTFOLIO_MIX",
    currency: "USD",
    sourceRows: EXPECTED_NATIONAL.rows,
    exposureCells: EXPECTED_NATIONAL.exposureCells,
    zeroReportedLossExposureCellsPreserved:
      EXPECTED_NATIONAL.zeroReportedLossExposureCells,
    earningPolicyCellCount: EXPECTED_NATIONAL.earningPolicyCellCount,
    liabilityDollars: EXPECTED_NATIONAL.liabilityDollars,
    observedProgramPremiumDollars:
      EXPECTED_NATIONAL.observedProgramPremiumDollars,
    publisherRecordedIndemnityDollars:
      EXPECTED_NATIONAL.publisherRecordedIndemnityDollars,
    publisherRecordedIndemnitySemanticType:
      "PUBLISHER_RECORDED_TOTAL_AMOUNT_OF_LOSS_NOT_CONFIRMED_CASH_PAID_OR_ULTIMATE",
    exposureSemanticType:
      "SUM_OF_POLICIES_EARNING_PREMIUM_ACROSS_PUBLISHED_CELLS_NOT_UNIQUE_CONTRACTS_OR_POLICYHOLDERS",
    frozenPortfolioMixOnly: true,
    monetaryAggregatesCompleteForMaterialCells: true,
    individualCellTransferEstablished: false,
    individualClaimSeverityObserved: false,
    cashPaidObserved: false,
    caseReserveObserved: false,
    recoveryObserved: false,
    independentClaimAdjudicationObserved: false,
  };
}

function fixedSourceDomainHistoricalLossCost() {
  const indemnity = EXPECTED_NATIONAL.publisherRecordedIndemnityDollars;
  const policyCells = EXPECTED_NATIONAL.earningPolicyCellCount;
  return {
    status: "NONZERO_SOURCE_DOMAIN_HISTORICAL_LOSS_COST",
    numberKind:
      "DESCRIPTIVE_HISTORICAL_LOSS_COST_NOT_PROSPECTIVE_PREMIUM",
    method:
      "ONE_YEAR_PUBLISHER_RECORDED_INDEMNITY_OVER_MATCHED_RMA_EXPOSURE_NO_TREND_CREDIBILITY_OR_LOADING",
    publisherRecordedIndemnityDollars: indemnity,
    historicalLossCostAggregateDollars: indemnity,
    historicalLossCostPerEarningPolicyCellDollars:
      fixedDecimal(indemnity, policyCells, 2),
    historicalLossCostPer1000LiabilityDollars:
      fixedDecimal((BigInt(indemnity) * 1_000n).toString(),
        EXPECTED_NATIONAL.liabilityDollars, 2),
    historicalLossRateOnLiability:
      fixedDecimal(indemnity, EXPECTED_NATIONAL.liabilityDollars, 8),
    historicalIndemnityToObservedPremiumRatio:
      fixedDecimal(indemnity,
        EXPECTED_NATIONAL.observedProgramPremiumDollars, 8),
    observedProgramPremiumPerEarningPolicyCellDollars:
      fixedDecimal(EXPECTED_NATIONAL.observedProgramPremiumDollars,
        policyCells, 2),
    historicalLossCostIsNumericZero: false,
    temporalQuarantineReferenceOnly: true,
    currentCoverageAdmitted: false,
    currentRoutingAdmitted: false,
    targetUseAdmitted: false,
    prospectiveForecast: false,
    selectedTargetLossRatio: null,
    trendFactor: null,
    credibilityFactor: null,
    expenseLoad: null,
    riskMargin: null,
    capitalLoad: null,
    catastropheLoad: null,
  };
}

function fixedTargetPricingBoundary() {
  return {
    targetDomain: "AI_AGENT_OR_ROBOT_OPERATION",
    sourceDomainTransferEstablished: false,
    matchedTargetExposureObserved: false,
    independentlyAdjudicatedTargetEconomicLossObserved: false,
    targetPreActionPredictorStreamObserved: false,
    targetProspectiveHoldoutObserved: false,
    targetQuotedPrice: null,
    targetQuotedPriceType: "NO_TARGET_ESTIMATE",
    targetQuotedPriceRepresentsNumericZero: false,
    pricePermission: false,
    historicalSourceLossCostIsTargetPrice: false,
    historicalSourceLossCostGrantsResponsibility: false,
  };
}

function fixedReadiness() {
  return {
    status: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
    sourceDomainHistoricalLossCostPrototypeBuilt: true,
    publisherRecordedIndemnitySourceReplayed: true,
    sourceDomainHistoricalLossCostNonzero: true,
    pinnedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    allPinnedReceiptsTemporallyCurrent: false,
    temporalQuarantineReferenceFactorCount: 40,
    temporallyOrderedReceiptReferenceFactorCount: 62,
    factorsAdmittedForCurrentCoverage: 0,
    factorsAdmittedForCurrentRouting: 0,
    temporalQuarantineClosureCredit: 0,
    temporalQuarantineCausalExperienceUnits: 0,
    temporalQuarantineTrainingAdmission: 0,
    temporalQuarantinePricingAdmission: 0,
    temporalQuarantineOperationalAuthority: 0,
    targetObservationContractComplete: false,
    targetPreActionFeatureContractComplete: false,
    targetProspectiveHoldoutComplete: false,
    targetModelCalibrated: false,
    targetDomainTransferEstablished: false,
    readyToPriceTargetDomain: false,
    readyForCapital: false,
    readyToGuarantee: false,
    readyToSettle: false,
    readyToBearResponsibility: false,
  };
}

function fixedPermissions() {
  return {
    trainingPermission: false,
    pricePermission: false,
    premiumPermission: false,
    capitalPermission: false,
    coveragePermission: false,
    guaranteePermission: false,
    settlementPermission: false,
    moveFundsPermission: false,
    deploymentPermission: false,
  };
}

function fixedAuthority() {
  return {
    professionalActuarialOpinion: false,
    independentActuarialReview: false,
    targetDomainTransfer: false,
    priceAuthority: false,
    underwritingAuthority: false,
    capitalAuthority: false,
    custodyAuthority: false,
    claimsAuthority: false,
    paymentAuthority: false,
    operationalAuthorityGranted: false,
  };
}

function normalizedGeneratedAt(value, requireCanonical = false) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) {
    fail("GENERATED_AT_INVALID");
  }
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail("GENERATED_AT_NOT_NORMALIZED");
  if (Date.parse(normalized)
      <= Date.parse(STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.generatedAt)) {
    fail("GENERATED_AT_NOT_AFTER_CURRENT_CHAIN_CONTRACT");
  }
  if (requireCanonical
    && normalized !== STAGE2_RMA_SHADOW_PRICING_CANONICAL.generatedAt) {
    fail("GENERATED_AT_NOT_CANONICAL_FIXED_VALUE");
  }
  return normalized;
}

function bodyProjectionAt(generatedAt) {
  generatedAt = normalizedGeneratedAt(generatedAt);
  return {
    schema: STAGE2_RMA_SHADOW_PRICING_SCHEMA,
    schemaVersion: "2.2.0",
    generatedAt,
    generatedAtTrust:
      "CODE_FIXED_BUILD_START_BOUND_NOT_EXTERNAL_TIME_ATTESTATION",
    artifactLifecycle: fixedLifecycle(),
    currentStage2Boundary: fixedCurrentStage2Boundary(),
    sourceDomainEvidence: fixedSourceDomainEvidence(),
    matchedHistoricalExperience: fixedMatchedHistoricalExperience(),
    sourceDomainHistoricalLossCost: fixedSourceDomainHistoricalLossCost(),
    targetPricingBoundary: fixedTargetPricingBoundary(),
    readiness: fixedReadiness(),
    permissions: fixedPermissions(),
    authority: fixedAuthority(),
    decision:
      "EMIT_NONZERO_RMA_HISTORICAL_LOSS_COST_HOLD_TARGET_QUOTE_AND_AUTHORITY",
  };
}

function bodyProjection() {
  return bodyProjectionAt(normalizedGeneratedAt(
    STAGE2_RMA_SHADOW_PRICING_CANONICAL.generatedAt, true,
  ));
}

const ROOT_KEYS = Object.freeze([
  "schema", "schemaVersion", "generatedAt", "generatedAtTrust",
  "artifactLifecycle", "currentStage2Boundary", "sourceDomainEvidence",
  "matchedHistoricalExperience",
  "sourceDomainHistoricalLossCost", "targetPricingBoundary", "readiness",
  "permissions", "authority", "decision", "artifactHash",
]);

function requireBuildInput(input) {
  const keys = ["rmaArtifactBytes", "rmaZipBytes", "rmaRecordLayoutBytes",
    "currentChainContractPath"];
  if (!exactKeys(input, keys)
    || (!Buffer.isBuffer(input.rmaArtifactBytes)
      && !(input.rmaArtifactBytes instanceof Uint8Array))
    || (!Buffer.isBuffer(input.rmaZipBytes)
      && !(input.rmaZipBytes instanceof Uint8Array))
    || (!Buffer.isBuffer(input.rmaRecordLayoutBytes)
      && !(input.rmaRecordLayoutBytes instanceof Uint8Array))
    || typeof input.currentChainContractPath !== "string") {
    fail("BUILD_INPUT_SCHEMA_INVALID");
  }
}

function requireCurrentBoundary(current) {
  if (!current.ok || current.contractCanonicalStableRead !== true
    || current.contractCanonicalExactFileHashVerified !== true
    || current.currentChainSourcesReplayed !== false
    || current.contractHash
      !== STAGE2_CURRENT_CHAIN_ADMISSION_CANONICAL.contractHash
    || current.pinSetHash !== STAGE2_CURRENT_CHAIN_PIN_SET_HASH
    || current.readinessStatus
      !== "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY"
    || current.temporalAuditManifestHash
      !== STAGE2_CURRENT_CHAIN_PINS.temporalAudit.manifestHash
    || current.pinnedReceiptCount !== 16
    || current.temporallyOrderedCurrentReceiptCount !== 9
    || current.temporalQuarantineReceiptCount !== 7
    || current.currentCoverageReceiptCount !== 9
    || current.allPinnedReceiptsTemporallyCurrent !== false
    || current.temporalQuarantineReferenceFactorCount !== 40
    || current.temporallyOrderedReceiptReferenceFactorCount !== 62
    || current.factorsAdmittedForCurrentCoverage !== 0
    || current.factorsAdmittedForCurrentRouting !== 0
    || current.temporalQuarantineClosureCredit !== 0
    || current.temporalQuarantineCausalExperienceUnits !== 0
    || current.temporalQuarantineTrainingAdmission !== 0
    || current.temporalQuarantinePricingAdmission !== 0
    || current.temporalQuarantineOperationalAuthority !== 0
    || current.targetPreActionRowsAdmitted !== 0
    || current.targetModelComponentsFitted !== 0
    || current.price !== null || current.PRICE !== null
    || current.readyToPrice !== false
    || current.operationalAuthorityGranted !== false) {
    fail("CURRENT_STAGE2_CANONICAL_BOUNDARY_INVALID");
  }
}

function buildStage2RmaShadowPricingAt(input, generatedAt) {
  requireBuildInput(input);
  const rmaArtifact = parsePinnedRmaArtifact(input.rmaArtifactBytes);
  const current = verifyStage2CurrentChainAdmissionCanonicalStructure(
    input.currentChainContractPath,
  );
  requireCurrentBoundary(current);
  const replay = verifyRmaCropInsuranceExperienceWithSource(
    rmaArtifact, Buffer.from(input.rmaZipBytes),
    Buffer.from(input.rmaRecordLayoutBytes),
  );
  if (!replay.ok
    || replay.verificationLevel !== "FULL_OFFICIAL_USDA_RMA_SOURCE_REPLAYED"
    || replay.sourceArtifactsReverified !== true
    || replay.officialFrozenSourceVerified !== true) {
    fail("RMA_FULL_SOURCE_REPLAY_FAILED");
  }
  requireExpectedNational(rmaArtifact.national);
  if (rmaArtifact.sourceDomainCalibration
      ?.aggregateIndemnityRatioDescriptiveStatisticEligible !== true
    || rmaArtifact.sourceDomainCalibration?.individualSeverityModelEligible !== false
    || rmaArtifact.sourceDomainCalibration?.tailOrTvarModelEligible !== false
    || rmaArtifact.evidenceClassification
      ?.transferToAiAgentOrRobotDomainEstablished !== false
    || rmaArtifact.outsiderModelEntrance?.permitsPricing !== false) {
    fail("RMA_SEMANTIC_OR_AUTHORITY_BOUNDARY_INVALID");
  }
  const body = bodyProjectionAt(generatedAt);
  const artifact = deepFreeze({ ...body, artifactHash: digest(body) });
  return artifact;
}

export function buildStage2RmaShadowPricing(input) {
  const generatedAt = normalizedGeneratedAt(
    STAGE2_RMA_SHADOW_PRICING_CANONICAL.generatedAt, true,
  );
  const artifact = buildStage2RmaShadowPricingAt(input, generatedAt);
  const checked = verifyStage2RmaShadowPricingStructure(artifact);
  if (!checked.ok) fail("SELF_VERIFICATION_FAILED");
  return artifact;
}

export function buildStage2RmaShadowPricingCandidate(input, options = {}) {
  if (!exactKeys(options, ["generatedAt"])) {
    fail("CANDIDATE_OPTIONS_INVALID");
  }
  // Validate the sampled build-start time before parsing inputs or replaying.
  const generatedAt = normalizedGeneratedAt(options.generatedAt);
  if (Date.parse(generatedAt) > Date.now()) {
    fail("CANDIDATE_GENERATED_AT_IN_FUTURE");
  }
  return buildStage2RmaShadowPricingAt(input, generatedAt);
}

function invalidReceipt(error, level = "INVALID") {
  return deepFreeze({
    ok: false,
    verificationLevel: level,
    artifactClaimsRmaSourceArtifactsReverified: false,
    rmaSourceArtifactsReverified: false,
    currentChainSourcesReplayed: false,
    currentChainCanonicalBytesVerified: false,
    currentChainContractHash: null,
    currentChainArtifactFileHash: null,
    currentChainArtifactFileBytes: 0,
    canonicalArtifactMode0600Verified: false,
    rmaParentReceiptId: "CROSS_STAGE_SIX_LANE_PROGRESS",
    rmaParentArtifactHash:
      "sha256:33e814497547ed4c49bd7c7e05f238915cd19cd71a6280ae20276364ba3a2b41",
    rmaParentTemporalStatus:
      "PINNED_SOURCE_REPLAYED_TEMPORAL_AUTHENTICITY_UNESTABLISHED",
    rmaParentTemporalAuthenticityEstablished: false,
    rmaParentTemporalQuarantineReferenceOnly: true,
    rmaParentCurrentRoutingEligible: false,
    rmaParentCurrentCoverage: false,
    rmaParentCurrentTruth: false,
    rmaParentClosureCredit: false,
    rmaParentCausalExperienceUnits: 0,
    rmaParentTrainingAdmission: false,
    rmaParentPricingAdmission: false,
    rmaParentOperationalAuthorityGranted: false,
    readinessStatus: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
    temporalAuditManifestHash:
      STAGE2_CURRENT_CHAIN_PINS.temporalAudit.manifestHash,
    pinnedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    allPinnedReceiptsTemporallyCurrent: false,
    temporalQuarantineReferenceFactorCount: 40,
    temporallyOrderedReceiptReferenceFactorCount: 62,
    factorsAdmittedForCurrentCoverage: 0,
    factorsAdmittedForCurrentRouting: 0,
    temporalQuarantineClosureCredit: 0,
    temporalQuarantineCausalExperienceUnits: 0,
    temporalQuarantineTrainingAdmission: 0,
    temporalQuarantinePricingAdmission: 0,
    temporalQuarantineOperationalAuthority: 0,
    historicalLossCostDerivationVerified: false,
    sourceDomainHistoricalLossCostNonzero: false,
    targetQuotedPrice: null,
    targetQuotedPriceType: "NO_TARGET_ESTIMATE",
    targetQuotedPriceRepresentsNumericZero: false,
    pricePermission: false,
    trainingPermission: false,
    readyToPriceTargetDomain: false,
    readyToBearResponsibility: false,
    operationalAuthorityGranted: false,
    error: error instanceof Error ? error.message : String(error),
  });
}

export function verifyStage2RmaShadowPricingStructure(artifact) {
  try {
    if (!exactKeys(artifact, ROOT_KEYS)
      || artifact.schema !== STAGE2_RMA_SHADOW_PRICING_SCHEMA
      || artifact.schemaVersion !== "2.2.0"
      || !HASH.test(artifact.artifactHash ?? "")) {
      fail("ARTIFACT_SCHEMA_INVALID");
    }
    const { artifactHash, ...body } = artifact;
    if (!same(body, bodyProjection()) || artifactHash !== digest(body)) {
      fail("FIXED_CANONICAL_PROJECTION_OR_HASH_INVALID");
    }
    return deepFreeze({
      ok: true,
      verificationLevel: "FIXED_FINAL_V4_STRUCTURE_ONLY_NO_SOURCE_AUTHENTICATION",
      artifactClaimsRmaSourceArtifactsReverified: true,
      rmaSourceArtifactsReverified: false,
      currentChainSourcesReplayed: false,
      currentChainCanonicalBytesVerified: false,
      currentChainContractHash:
        artifact.currentStage2Boundary.contractHash,
      currentChainArtifactFileHash:
        artifact.currentStage2Boundary.canonicalContractFileHash,
      currentChainArtifactFileBytes:
        artifact.currentStage2Boundary.canonicalContractFileBytes,
      rmaParentReceiptId:
        artifact.sourceDomainEvidence.temporalAuditParentReceiptId,
      rmaParentArtifactHash:
        artifact.sourceDomainEvidence.temporalAuditParentArtifactHash,
      rmaParentTemporalStatus:
        artifact.sourceDomainEvidence.upstreamReceiptTemporalStatus,
      rmaParentTemporalAuthenticityEstablished:
        artifact.sourceDomainEvidence.temporalAuthenticityEstablished,
      rmaParentTemporalQuarantineReferenceOnly:
        artifact.sourceDomainEvidence.temporalQuarantineReferenceOnly,
      rmaParentCurrentRoutingEligible:
        artifact.sourceDomainEvidence.currentRoutingEligible,
      rmaParentCurrentCoverage:
        artifact.sourceDomainEvidence.currentCoverage,
      rmaParentCurrentTruth: artifact.sourceDomainEvidence.currentTruth,
      rmaParentClosureCredit: artifact.sourceDomainEvidence.closureCredit,
      rmaParentCausalExperienceUnits:
        artifact.sourceDomainEvidence.causalExperienceUnits,
      rmaParentTrainingAdmission:
        artifact.sourceDomainEvidence.trainingAdmission,
      rmaParentPricingAdmission:
        artifact.sourceDomainEvidence.pricingAdmission,
      rmaParentOperationalAuthorityGranted:
        artifact.sourceDomainEvidence.operationalAuthorityGranted,
      readinessStatus: artifact.readiness.status,
      temporalAuditManifestHash:
        artifact.currentStage2Boundary.temporalAuditManifestHash,
      pinnedReceiptCount: artifact.readiness.pinnedReceiptCount,
      temporallyOrderedCurrentReceiptCount:
        artifact.readiness.temporallyOrderedCurrentReceiptCount,
      temporalQuarantineReceiptCount:
        artifact.readiness.temporalQuarantineReceiptCount,
      currentCoverageReceiptCount: artifact.readiness.currentCoverageReceiptCount,
      allPinnedReceiptsTemporallyCurrent:
        artifact.readiness.allPinnedReceiptsTemporallyCurrent,
      temporalQuarantineReferenceFactorCount:
        artifact.readiness.temporalQuarantineReferenceFactorCount,
      temporallyOrderedReceiptReferenceFactorCount:
        artifact.readiness.temporallyOrderedReceiptReferenceFactorCount,
      factorsAdmittedForCurrentCoverage:
        artifact.readiness.factorsAdmittedForCurrentCoverage,
      factorsAdmittedForCurrentRouting:
        artifact.readiness.factorsAdmittedForCurrentRouting,
      temporalQuarantineClosureCredit:
        artifact.readiness.temporalQuarantineClosureCredit,
      temporalQuarantineCausalExperienceUnits:
        artifact.readiness.temporalQuarantineCausalExperienceUnits,
      temporalQuarantineTrainingAdmission:
        artifact.readiness.temporalQuarantineTrainingAdmission,
      temporalQuarantinePricingAdmission:
        artifact.readiness.temporalQuarantinePricingAdmission,
      temporalQuarantineOperationalAuthority:
        artifact.readiness.temporalQuarantineOperationalAuthority,
      historicalLossCostDerivationVerified: false,
      publisherRecordedIndemnityDollars:
        artifact.matchedHistoricalExperience.publisherRecordedIndemnityDollars,
      historicalLossCostAggregateDollars:
        artifact.sourceDomainHistoricalLossCost.historicalLossCostAggregateDollars,
      historicalLossCostPerEarningPolicyCellDollars:
        artifact.sourceDomainHistoricalLossCost
          .historicalLossCostPerEarningPolicyCellDollars,
      historicalLossCostPer1000LiabilityDollars:
        artifact.sourceDomainHistoricalLossCost
          .historicalLossCostPer1000LiabilityDollars,
      historicalLossRateOnLiability:
        artifact.sourceDomainHistoricalLossCost.historicalLossRateOnLiability,
      sourceDomainHistoricalLossCostNonzero: true,
      targetQuotedPrice: null,
      targetQuotedPriceType: "NO_TARGET_ESTIMATE",
      targetQuotedPriceRepresentsNumericZero: false,
      pricePermission: false,
      trainingPermission: false,
      readyToPriceTargetDomain: false,
      readyToBearResponsibility: false,
      operationalAuthorityGranted: false,
      artifactHash,
    });
  } catch (error) {
    return invalidReceipt(error);
  }
}

export function verifyStage2RmaShadowPricingAgainstSources(artifact, input) {
  const structural = verifyStage2RmaShadowPricingStructure(artifact);
  if (!structural.ok) return structural;
  try {
    requireBuildInput(input);
    const expected = buildStage2RmaShadowPricing(input);
    if (!same(expected, artifact)) fail("FULL_SOURCE_DERIVATION_MISMATCH");
    return deepFreeze({
      ...structural,
      verificationLevel:
        "FULL_RMA_SOURCE_REPLAYED_HISTORICAL_LOSS_COST_WITH_PINNED_TEMPORAL_QUARANTINE_HOLD_CONTRACT_BYTES",
      rmaSourceArtifactsReverified: true,
      currentChainSourcesReplayed: false,
      currentChainCanonicalBytesVerified: true,
      historicalLossCostDerivationVerified: true,
      officialFrozenSourceVerified: true,
    });
  } catch (error) {
    return invalidReceipt(error, "FULL_SOURCE_REPLAY_FAILED");
  }
}

function supersessionMarkerProjection() {
  return {
    schema: "outsider/artifact-supersession/v1",
    status: "SUPERSEDED_DO_NOT_USE_AS_CANONICAL",
    supersededAt: STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V2.generatedAt,
    reason:
      "FINAL_V2_FIXES_CALLER_CONTROLLED_CANONICAL_TIME_AND_REPLACES_PROSPECTIVE_SOUNDING_TERMINOLOGY_WITH_PUBLISHER_RECORDED_INDEMNITY_AND_HISTORICAL_LOSS_COST",
    supersededArtifact: "indication.json",
    supersededArtifactHash:
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.artifactHash,
    supersededArtifactFileHash:
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.artifactFileHash,
    supersededFileBytes:
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.artifactFileBytes,
    supersededArtifactBytesPreserved: true,
    supersededBy: "../final-v2/historical-loss-cost.json",
    replacementArtifactHash:
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V2.artifactHash,
    replacementArtifactFileHash:
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V2.artifactFileHash,
    sourceArtifactsReverifiedByMarker: false,
    rightsTermsSourceReplayed: false,
  };
}

function v3SupersessionMarkerProjection() {
  return {
    schema: "outsider/local-artifact-supersession-pointer/v1",
    status:
      "SUPERSEDED_PRE_TEMPORAL_QUARANTINE_HOLD_DO_NOT_USE_AS_CANONICAL",
    superseded: {
      path: "final-v3/historical-loss-cost.json",
      fileSha256: STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.artifactFileHash,
      fileBytes: STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.artifactFileBytes,
      artifactHash: STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.artifactHash,
      reasonCodes: [
        "BOUND_PRE_TEMPORAL_AUDIT_CURRENT_CHAIN_CONTRACT",
        "DID_NOT_PROPAGATE_SEVEN_TEMPORAL_QUARANTINE_RECEIPTS",
        "DID_NOT_PROPAGATE_FORTY_TEMPORAL_QUARANTINE_REFERENCE_FACTORS",
      ],
    },
    canonical: {
      path: "../final-v4/historical-loss-cost.json",
      fileSha256: STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactFileHash,
      fileBytes: STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactFileBytes,
      artifactHash: STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactHash,
      requiredVerificationLevel:
        "FULL_PINNED_FINAL_V4_BYTES_RMA_SOURCE_REPLAYED_WITH_TEMPORAL_QUARANTINE_HOLD_CONTRACT_BYTES",
    },
    oldArtifactBytesPreserved: true,
    sourceArtifactsReverifiedByThisMarker: false,
  };
}

function stableReadExactRepositoryFile(filePath, repositoryRelativePath,
  expectedFileHash, expectedFileBytes, code, { requireMode0600 = false } = {}) {
  if (typeof filePath !== "string" || filePath.length === 0
    || filePath.includes("\0")) fail(`${code}_PATH_INVALID`);
  const resolved = path.resolve(filePath);
  const expectedPath = path.resolve(REPOSITORY_ROOT, repositoryRelativePath);
  if (resolved !== expectedPath) fail(`${code}_PATH_MISMATCH`);
  let descriptor;
  try {
    descriptor = openSync(resolved,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n
      || before.size > BigInt(MAX_ARTIFACT_BYTES)
      || requireMode0600 && (before.mode & 0o777n) !== 0o600n) {
      fail(`${code}_FILE_INVALID`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || BigInt(bytes.length) !== after.size) {
      fail(`${code}_CHANGED_DURING_READ`);
    }
    if (bytes.length !== expectedFileBytes
      || digestBytes(bytes) !== expectedFileHash) {
      fail(`${code}_EXACT_BYTES_INVALID`);
    }
    return bytes;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function stableReadCanonicalArtifact(artifactPath) {
  if (!canonicalPinsFinalized()) fail("CANONICAL_IDENTITY_PINS_NOT_FINALIZED");
  if (typeof artifactPath !== "string" || artifactPath.length === 0
    || artifactPath.includes("\0")) fail("CANONICAL_ARTIFACT_PATH_INVALID");
  const resolved = path.resolve(artifactPath);
  const expected = path.resolve(REPOSITORY_ROOT,
    STAGE2_RMA_SHADOW_PRICING_CANONICAL.repositoryRelativePath);
  if (resolved !== expected) fail("CANONICAL_ARTIFACT_PATH_MISMATCH");
  let descriptor;
  try {
    descriptor = openSync(resolved,
      fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n
      || before.size > BigInt(MAX_ARTIFACT_BYTES)
      || (before.mode & 0o777n) !== 0o600n) {
      fail("CANONICAL_ARTIFACT_FILE_INVALID");
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mtimeNs !== after.mtimeNs
      || before.ctimeNs !== after.ctimeNs || BigInt(bytes.length) !== after.size) {
      fail("CANONICAL_ARTIFACT_CHANGED_DURING_READ");
    }
    const fileHash = digestBytes(bytes);
    if (bytes.length !== STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactFileBytes
      || fileHash !== STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactFileHash) {
      fail("CANONICAL_ARTIFACT_EXACT_BYTES_INVALID");
    }
    let artifact;
    try { artifact = JSON.parse(bytes.toString("utf8")); }
    catch { fail("CANONICAL_ARTIFACT_JSON_INVALID"); }
    if (artifact?.artifactHash
      !== STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactHash) {
      fail("CANONICAL_ARTIFACT_HASH_INVALID");
    }
    if (typeof artifact.generatedAt !== "string"
      || !Number.isFinite(Date.parse(artifact.generatedAt))
      || BigInt(Date.parse(artifact.generatedAt)) * 1_000_000n > before.mtimeNs) {
      fail("CANONICAL_ARTIFACT_GENERATED_AT_AFTER_FILE_MTIME");
    }
    return { artifact, fileHash, fileBytes: bytes.length };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function verifyStage2RmaShadowPricingCanonicalStructure(artifactPath) {
  try {
    const loaded = stableReadCanonicalArtifact(artifactPath);
    const structural = verifyStage2RmaShadowPricingStructure(loaded.artifact);
    if (!structural.ok) return structural;
    return deepFreeze({
      ...structural,
      verificationLevel:
        "PINNED_FINAL_V4_EXACT_BYTES_STRUCTURE_ONLY_NO_SOURCE_AUTHENTICATION",
      canonicalGeneratedAtVerified: true,
      canonicalArtifactExactBytesVerified: true,
      canonicalArtifactStableRead: true,
      canonicalArtifactMode0600Verified: true,
      artifactFileHash: loaded.fileHash,
      artifactFileBytes: loaded.fileBytes,
    });
  } catch (error) {
    return invalidReceipt(error, "CANONICAL_STRUCTURE_INVALID");
  }
}

export function verifyStage2RmaShadowPricingCanonicalAgainstSources(
  artifactPath, input,
) {
  const canonical = verifyStage2RmaShadowPricingCanonicalStructure(artifactPath);
  if (!canonical.ok) return canonical;
  let artifact;
  try { artifact = stableReadCanonicalArtifact(artifactPath).artifact; }
  catch (error) { return invalidReceipt(error, "CANONICAL_FULL_SOURCE_INVALID"); }
  const sourced = verifyStage2RmaShadowPricingAgainstSources(artifact, input);
  if (!sourced.ok) return sourced;
  return deepFreeze({
    ...sourced,
    verificationLevel:
      "FULL_PINNED_FINAL_V4_BYTES_RMA_SOURCE_REPLAYED_WITH_TEMPORAL_QUARANTINE_HOLD_CONTRACT_BYTES",
    canonicalGeneratedAtVerified: true,
    canonicalArtifactExactBytesVerified: true,
    canonicalArtifactStableRead: true,
    artifactFileHash: canonical.artifactFileHash,
    artifactFileBytes: canonical.artifactFileBytes,
  });
}

export function verifyStage2RmaShadowPricingSupersessionMarker(markerPath) {
  try {
    const markerBytes = stableReadExactRepositoryFile(
      markerPath,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1
        .supersessionMarkerRepositoryRelativePath,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.supersessionMarkerFileHash,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.supersessionMarkerFileBytes,
      "SUPERSESSION_MARKER",
      { requireMode0600: true },
    );
    let marker;
    try { marker = JSON.parse(markerBytes.toString("utf8")); }
    catch { fail("SUPERSESSION_MARKER_JSON_INVALID"); }
    if (!same(marker, supersessionMarkerProjection())) {
      fail("SUPERSESSION_MARKER_FIXED_PROJECTION_INVALID");
    }
    const supersededPath = path.resolve(REPOSITORY_ROOT,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.repositoryRelativePath);
    const supersededBytes = stableReadExactRepositoryFile(
      supersededPath,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.repositoryRelativePath,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.artifactFileHash,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.artifactFileBytes,
      "SUPERSEDED_V1_ARTIFACT",
    );
    let superseded;
    try { superseded = JSON.parse(supersededBytes.toString("utf8")); }
    catch { fail("SUPERSEDED_V1_ARTIFACT_JSON_INVALID"); }
    if (superseded.artifactHash
      !== STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.artifactHash) {
      fail("SUPERSEDED_V1_ARTIFACT_HASH_INVALID");
    }
    const successorPath = path.resolve(REPOSITORY_ROOT,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V2.repositoryRelativePath);
    const successorBytes = stableReadExactRepositoryFile(
      successorPath,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V2.repositoryRelativePath,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V2.artifactFileHash,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V2.artifactFileBytes,
      "SUPERSESSION_V1_SUCCESSOR_V2_ARTIFACT",
    );
    let successor;
    try { successor = JSON.parse(successorBytes.toString("utf8")); }
    catch { fail("SUPERSESSION_V1_SUCCESSOR_V2_JSON_INVALID"); }
    if (successor.artifactHash
      !== STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V2.artifactHash) {
      fail("SUPERSESSION_V1_SUCCESSOR_V2_HASH_INVALID");
    }
    return deepFreeze({
      ok: true,
      verificationLevel:
        "PINNED_0600_SCHEMA_SUPPORTED_SUPERSESSION_MARKER_AND_BOTH_ARTIFACT_IDENTITIES",
      markerSchema: marker.schema,
      markerExactBytesVerified: true,
      markerMode0600Verified: true,
      markerFileHash:
        STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.supersessionMarkerFileHash,
      markerFileBytes:
        STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.supersessionMarkerFileBytes,
      supersededArtifactBytesPreserved: true,
      supersededArtifactHash:
        STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V1.artifactHash,
      replacementArtifactHash:
        STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V2.artifactHash,
      replacementArtifactExactBytesVerified: true,
      sourceArtifactsReverifiedByMarker: false,
      rightsTermsSourceReplayed: false,
      targetQuotedPrice: null,
      pricePermission: false,
      operationalAuthorityGranted: false,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "SUPERSESSION_MARKER_INVALID",
      markerExactBytesVerified: false,
      markerMode0600Verified: false,
      supersededArtifactBytesPreserved: false,
      replacementArtifactExactBytesVerified: false,
      sourceArtifactsReverifiedByMarker: false,
      rightsTermsSourceReplayed: false,
      targetQuotedPrice: null,
      pricePermission: false,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function verifyStage2RmaShadowPricingV3SupersessionMarker(markerPath) {
  try {
    const markerBytes = stableReadExactRepositoryFile(
      markerPath,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3
        .supersessionMarkerRepositoryRelativePath,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.supersessionMarkerFileHash,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.supersessionMarkerFileBytes,
      "V3_SUPERSESSION_MARKER",
      { requireMode0600: true },
    );
    let marker;
    try { marker = JSON.parse(markerBytes.toString("utf8")); }
    catch { fail("V3_SUPERSESSION_MARKER_JSON_INVALID"); }
    if (!same(marker, v3SupersessionMarkerProjection())) {
      fail("V3_SUPERSESSION_MARKER_FIXED_PROJECTION_INVALID");
    }
    const oldBytes = stableReadExactRepositoryFile(
      path.resolve(REPOSITORY_ROOT,
        STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.repositoryRelativePath),
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.repositoryRelativePath,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.artifactFileHash,
      STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.artifactFileBytes,
      "SUPERSEDED_V3_ARTIFACT",
    );
    let oldArtifact;
    try { oldArtifact = JSON.parse(oldBytes.toString("utf8")); }
    catch { fail("SUPERSEDED_V3_ARTIFACT_JSON_INVALID"); }
    if (oldArtifact.artifactHash
      !== STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.artifactHash) {
      fail("SUPERSEDED_V3_ARTIFACT_HASH_INVALID");
    }
    const canonical = verifyStage2RmaShadowPricingCanonicalStructure(
      path.resolve(REPOSITORY_ROOT,
        STAGE2_RMA_SHADOW_PRICING_CANONICAL.repositoryRelativePath),
    );
    if (!canonical.ok
      || canonical.canonicalArtifactExactBytesVerified !== true
      || canonical.canonicalArtifactMode0600Verified !== true) {
      fail("V3_SUPERSESSION_SUCCESSOR_V4_INVALID");
    }
    return deepFreeze({
      ok: true,
      verificationLevel:
        "PINNED_0600_V3_TO_V4_SUPERSESSION_POINTER_AND_BOTH_ARTIFACT_IDENTITIES",
      markerSchema: marker.schema,
      markerExactBytesVerified: true,
      markerMode0600Verified: true,
      markerFileHash:
        STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.supersessionMarkerFileHash,
      markerFileBytes:
        STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.supersessionMarkerFileBytes,
      supersededArtifactBytesPreserved: true,
      supersededArtifactHash:
        STAGE2_RMA_SHADOW_PRICING_SUPERSEDED_V3.artifactHash,
      replacementArtifactHash: STAGE2_RMA_SHADOW_PRICING_CANONICAL.artifactHash,
      replacementArtifactExactBytesVerified: true,
      sourceArtifactsReverifiedByMarker: false,
      targetQuotedPrice: null,
      pricePermission: false,
      trainingPermission: false,
      operationalAuthorityGranted: false,
    });
  } catch (error) {
    return deepFreeze({
      ok: false,
      verificationLevel: "V3_SUPERSESSION_MARKER_INVALID",
      markerExactBytesVerified: false,
      markerMode0600Verified: false,
      supersededArtifactBytesPreserved: false,
      replacementArtifactExactBytesVerified: false,
      sourceArtifactsReverifiedByMarker: false,
      targetQuotedPrice: null,
      pricePermission: false,
      trainingPermission: false,
      operationalAuthorityGranted: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
