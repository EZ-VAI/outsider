/*
 * Real-insurance calibration shadow.
 *
 * This module binds two real, source-domain insurance evidence lanes without
 * turning either one into an AI-agent or robot prior:
 *
 * - USDA RMA 2024 aggregate crop-insurance experience; and
 * - CAS-hosted, S&P-compiled NAIC Schedule P reserve-development triangles.
 *
 * The only trusted construction path accepts the raw frozen source bytes,
 * rebuilds both upstream artifacts, invokes both upstream full-source
 * verifiers, and exact-compares the resulting projections.  A caller cannot
 * inject an upstream artifact, verification result, callback, or admission.
 */

import { createHash } from "node:crypto";

import { canonicalizeStrict } from "./canonical.js";
import {
  buildRmaCropInsuranceExperience,
  RMA_CROP_INSURANCE_EXPERIENCE_SCHEMA,
  RMA_SOB_COVERAGE_FROZEN_SOURCE_2024,
  verifyRmaCropInsuranceExperienceWithSource,
} from "./outsider-rma-crop-insurance-experience.js";
import {
  buildCasSchedulePReserveCalibration,
  CAS_SCHEDULE_P_FROZEN_FILES,
  CAS_SCHEDULE_P_RESERVE_CALIBRATION_SCHEMA,
  CAS_SCHEDULE_P_SOURCE_PAGE,
  verifyCasSchedulePReserveCalibrationWithSource,
} from "./outsider-cas-schedule-p-reserve-calibration.js";

export const REAL_LOSS_CALIBRATION_SHADOW_SCHEMA
  = "outsider/real-loss-calibration-shadow/v1";

export const REAL_LOSS_CALIBRATION_SHADOW_FROZEN_AT
  = "2026-08-21T08:15:00.000Z";

const HASH = /^sha256:[a-f0-9]{64}$/;
const RATIO = /^-?(?:0|[1-9]\d*)\.\d{8}$/;
const EXPECTED_LINE_CODES = Object.freeze(
  CAS_SCHEDULE_P_FROZEN_FILES.map(({ lineCode }) => lineCode),
);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length
    && keys.every((key) => Object.hasOwn(value, key));
}

function digest(value) {
  return `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
}

function domainHash(domain, value) { return digest({ domain, value }); }

function canonicalTime(value, code) {
  if (typeof value !== "string" || value.length > 40
    || !Number.isFinite(Date.parse(value))) throw new Error(`${code}_INVALID`);
  const canonical = new Date(value).toISOString();
  if (canonical !== value) throw new Error(`${code}_NOT_CANONICAL`);
  return canonical;
}

function decimalRatio(numerator, denominator, places = 8) {
  const leftInput = BigInt(numerator);
  const rightInput = BigInt(denominator);
  if (rightInput === 0n) return null;
  const negative = (leftInput < 0n) !== (rightInput < 0n);
  const left = leftInput < 0n ? -leftInput : leftInput;
  const right = rightInput < 0n ? -rightInput : rightInput;
  const scale = 10n ** BigInt(places);
  const rounded = (left * scale * 2n + right) / (2n * right);
  const whole = rounded / scale;
  const fraction = String(rounded % scale).padStart(places, "0");
  return `${negative && rounded !== 0n ? "-" : ""}${whole}.${fraction}`;
}

function asBytes(value, code) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new Error(`${code}_BYTES_REQUIRED`);
  }
  const bytes = Buffer.from(value);
  if (bytes.length === 0) throw new Error(`${code}_EMPTY`);
  return bytes;
}

function cloneJson(value) { return JSON.parse(JSON.stringify(value)); }

export const REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS = deepFreeze({
  rma: {
    schema: RMA_CROP_INSURANCE_EXPERIENCE_SCHEMA,
    artifactHash: "sha256:5ed89ea0108b403095dd1a8ca609fe6d2fb7c505a0d8865adef73f8de5446dce",
    sourceObjectHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectHash,
    recordLayoutHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutHash,
    verificationLevel: "FULL_OFFICIAL_USDA_RMA_SOURCE_REPLAYED",
  },
  cas: {
    schema: CAS_SCHEDULE_P_RESERVE_CALIBRATION_SCHEMA,
    artifactHash: "sha256:649653b6b901ed29247d99194b1efcfd141f144adf462574ababd56c71023a38",
    sourcePageHash: CAS_SCHEDULE_P_SOURCE_PAGE.hash,
    sourceFileHashes: Object.fromEntries(CAS_SCHEDULE_P_FROZEN_FILES.map((source) => (
      [source.lineCode, source.hash]
    ))),
    verificationLevel: "FULL_OFFICIAL_CAS_SCHEDULE_P_SOURCE_REPLAYED",
  },
});

export const REAL_LOSS_CALIBRATION_MEASUREMENT_DICTIONARY = deepFreeze({
  dictionaryId: "OUTSIDER_REAL_INSURANCE_SOURCE_DOMAIN_MEASUREMENTS",
  version: "1.0.0",
  arithmetic: "BIGINT_EXACT_COUNTS_AND_HALF_UP_FIXED_EIGHT_DECIMAL_RATIOS",
  entries: [
    {
      measurementId: "RMA_PUBLISHED_SNAPSHOT_CELL_COMPLETENESS",
      sourceDomain: "US_FEDERAL_CROP_INSURANCE",
      kind: "ACCOUNTING_CONTROL",
      equation: "SEMANTIC_CELLS_EQUALS_SOURCE_ROWS_AND_DUPLICATE_CELLS_EQUALS_ZERO",
      interpretation: "PUBLISHED_FILE_ACCOUNTING_NOT_COMPLETE_CLAIM_UNIVERSE",
    },
    {
      measurementId: "RMA_EXPOSURE_CELL_SHARE",
      sourceDomain: "US_FEDERAL_CROP_INSURANCE",
      kind: "EXPOSURE_COMPLETENESS_DIAGNOSTIC",
      equation: "EXPOSURE_CELLS_DIVIDED_BY_SOURCE_ROWS",
      interpretation: "CELL_SHARE_NOT_UNIQUE_POLICYHOLDER_RATE",
    },
    {
      measurementId: "RMA_ZERO_REPORTED_LOSS_EXPOSURE_WINDOW",
      sourceDomain: "US_FEDERAL_CROP_INSURANCE",
      kind: "ZERO_REPORTED_LOSS_WINDOW",
      equation: "EXPOSURE_PRESENT_AND_POLICIES_INDEMNIFIED_ZERO_AND_UNITS_INDEMNIFIED_ZERO_AND_INDEMNITY_ZERO",
      interpretation: "ZERO_IN_MUTABLE_2024_PUBLISHER_SNAPSHOT_NOT_ZERO_ULTIMATE_LOSS",
    },
    {
      measurementId: "RMA_COUNT_ANOMALY_QUARANTINE",
      sourceDomain: "US_FEDERAL_CROP_INSURANCE",
      kind: "DENOMINATOR_CONTROL",
      equation: "PRESERVE_POLICY_AND_UNIT_NUMERATOR_GREATER_THAN_DENOMINATOR_CELLS_SEPARATELY",
      interpretation: "ANY_OBSERVED_ANOMALY_QUARANTINES_REPORTED_LOSS_FREQUENCY",
    },
    {
      measurementId: "RMA_INDEMNITY_TO_PREMIUM_RATIO",
      sourceDomain: "US_FEDERAL_CROP_INSURANCE",
      kind: "AGGREGATE_SOURCE_DOMAIN_RATIO",
      equation: "PUBLISHER_RECORDED_INDEMNITY_DOLLARS_DIVIDED_BY_TOTAL_PREMIUM_DOLLARS",
      interpretation: "HISTORICAL_SOURCE_DOMAIN_RATIO_NOT_PRICE_OR_AI_ROBOT_PRIOR",
    },
    {
      measurementId: "RMA_INDEMNITY_TO_LIABILITY_RATIO",
      sourceDomain: "US_FEDERAL_CROP_INSURANCE",
      kind: "AGGREGATE_SOURCE_DOMAIN_RATIO",
      equation: "PUBLISHER_RECORDED_INDEMNITY_DOLLARS_DIVIDED_BY_LIABILITY_DOLLARS",
      interpretation: "HISTORICAL_SOURCE_DOMAIN_RATIO_NOT_SEVERITY_OR_CAPITAL_MODEL",
    },
    {
      measurementId: "CAS_ACCIDENT_YEAR_AXIS",
      sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
      kind: "TRIANGLE_AXIS",
      equation: "YEAR_IN_WHICH_CLAIM_COHORT_INCURRED",
      interpretation: "1998_THROUGH_2007_IN_FROZEN_FILES",
    },
    {
      measurementId: "CAS_DEVELOPMENT_LAG_AXIS",
      sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
      kind: "TRIANGLE_AXIS",
      equation: "ONE_BASED_YEAR_END_DEVELOPMENT_AGE",
      interpretation: "LAGS_ONE_THROUGH_TEN_ONLY",
    },
    {
      measurementId: "CAS_CALENDAR_YEAR_AXIS",
      sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
      kind: "TRIANGLE_AXIS",
      equation: "ACCIDENT_YEAR_PLUS_DEVELOPMENT_LAG_MINUS_ONE",
      interpretation: "CALENDAR_YEAR_LE_2007_FIT_AND_GREATER_THAN_2007_HOLDOUT",
    },
    {
      measurementId: "CAS_CUMULATIVE_PAID_PATH",
      sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
      kind: "LOSS_DEVELOPMENT_MEASURE",
      equation: "NET_CUMULATIVE_PAID_LOSSES_AND_ALLOCATED_EXPENSES_AT_YEAR_END",
      interpretation: "RECORDED_PAID_FIELD_NOT_RECOVERY_OR_ECONOMIC_CONSEQUENCE",
    },
    {
      measurementId: "CAS_INCURRED_PATH",
      sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
      kind: "LOSS_DEVELOPMENT_MEASURE",
      equation: "NET_INCURRED_LOSSES_AND_ALLOCATED_EXPENSES_AT_YEAR_END",
      interpretation: "INCURRED_IS_NOT_CASH_PAID_AND_BULK_IBNR_IS_NOT_CASE_RESERVE",
    },
    {
      measurementId: "CAS_NEGATIVE_REVISION_COUNTS",
      sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
      kind: "REVISION_DIAGNOSTIC",
      equation: "COUNT_CELLS_WHERE_PAID_OR_INCURRED_DECREASES_FROM_PRIOR_LAG_BY_LINE",
      interpretation: "PRESERVE_REVERSALS_AND_DO_NOT_CLIP_OR_POOL",
    },
    {
      measurementId: "CAS_UPPER_TRIANGLE_FACTOR_FIT",
      sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
      kind: "HISTORICAL_FIT",
      equation: "LINE_SPECIFIC_MATCHED_VOLUME_WEIGHTED_LINKS_WITH_CALENDAR_YEAR_LE_2007",
      interpretation: "LOWER_TRIANGLE_EXCLUDED_FROM_FACTOR_FITTING",
    },
    {
      measurementId: "CAS_LOWER_TRIANGLE_HOLDOUT",
      sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
      kind: "OUT_OF_TIME_BACKTEST",
      equation: "LINE_SPECIFIC_LAG10_OUTCOME_WITH_CALENDAR_YEAR_GREATER_THAN_2007",
      interpretation: "HISTORICAL_HOLDOUT_NOT_PROSPECTIVE_PRODUCTION_VALIDATION",
    },
    {
      measurementId: "CAS_TAIL_MISSINGNESS",
      sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
      kind: "MISSINGNESS_BOUNDARY",
      equation: "DEVELOPMENT_BEYOND_LAG10_OBSERVED_EQUALS_FALSE",
      interpretation: "LAG10_NOT_ESTABLISHED_ULTIMATE_AND_NO_TAIL_OR_TVAR_CALIBRATION",
    },
    {
      measurementId: "CAS_CORRELATION_MISSINGNESS",
      sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
      kind: "MISSINGNESS_BOUNDARY",
      equation: "NO_CALENDAR_SHOCK_OR_CATASTROPHE_IDENTIFIERS_AND_NO_INDEPENDENCE_ESTABLISHED",
      interpretation: "OVERLAP_COUNTS_DO_NOT_ESTABLISH_CROSS_LINE_OR_CROSS_COMPANY_CORRELATION",
    },
  ],
});

const RIGHTS_BOUNDARY = deepFreeze({
  rmaPublicAccessObserved: true,
  rmaDistributionAndCopyingWebPolicyCuratorAssertionNotReplayed: true,
  rmaWebPolicyBytesReplayed: false,
  rmaModelTrainingRightsLegallyConcluded: false,
  casPublicDirectDownloadObserved: true,
  casResearchUseInvitedBySourcePage: true,
  casRawRedistributionRightsConcluded: false,
  casCommercialUseRightsConcluded: false,
  adapterGrantsAdditionalRights: false,
});

const NON_POOLING_POLICY = deepFreeze({
  rmaAndCasDomainsKeptSeparate: true,
  rmaAndCasAmountsPooled: false,
  casLineAmountsPooled: false,
  casLineSpecificFactorsPreserved: true,
  casLineSpecificHoldoutMetricsPreserved: true,
  casAggregateAcrossLineBacktestProjected: false,
  sourceAmountsComparableAcrossDomainsEstablished: false,
  targetDomainTransferEstimated: false,
});

const OUTPUT_BOUNDARY = deepFreeze({
  targetDomain: "AI_AGENT_OR_ROBOT",
  sourceDomainDiagnosticsOnly: true,
  transferEstablished: false,
  frequency: false,
  severity: false,
  PRICE: false,
  GUARANTEE: false,
  SETTLE: false,
  CAPITAL: false,
  CUSTODY: false,
  TRAIN: false,
  productionReady: false,
  price: null,
  reserve: null,
  coverage: null,
  guarantee: null,
  settlementInstruction: null,
  capitalInstruction: null,
  custodyInstruction: null,
  decision: "ABSTAIN_REAL_INSURANCE_SOURCE_DOMAIN_CALIBRATION_SHADOW_ONLY",
});

function normalizeSources(sources) {
  const keys = ["rmaZipBytes", "rmaRecordLayoutBytes", "casSourceFiles",
    "casSourcePageBytes"];
  if (!exactKeys(sources, keys)) throw new Error("REAL_LOSS_SOURCE_INPUT_SCHEMA_INVALID");
  const expectedFiles = CAS_SCHEDULE_P_FROZEN_FILES.map(({ fileName }) => fileName);
  if (!exactKeys(sources.casSourceFiles, expectedFiles)) {
    throw new Error("REAL_LOSS_CAS_SOURCE_FILE_SET_INVALID");
  }
  return Object.freeze({
    rmaZipBytes: asBytes(sources.rmaZipBytes, "REAL_LOSS_RMA_ZIP"),
    rmaRecordLayoutBytes: asBytes(
      sources.rmaRecordLayoutBytes, "REAL_LOSS_RMA_LAYOUT"),
    casSourceFiles: Object.freeze(Object.fromEntries(expectedFiles.map((fileName) => (
      [fileName, asBytes(sources.casSourceFiles[fileName], `REAL_LOSS_CAS_${fileName}`)]
    )))),
    casSourcePageBytes: asBytes(sources.casSourcePageBytes, "REAL_LOSS_CAS_PAGE"),
  });
}

function rebuildAndVerifyOfficialSources(sources) {
  const input = normalizeSources(sources);
  const rma = buildRmaCropInsuranceExperience(
    input.rmaZipBytes,
    input.rmaRecordLayoutBytes,
    {
      sourceObjectHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectHash,
      recordLayoutHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutHash,
      generatedAt: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.frozenAt,
      commodityYear: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.commodityYear,
      sourceUrl: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceUrl,
      recordLayoutUrl: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutUrl,
    },
  );
  const rmaVerification = verifyRmaCropInsuranceExperienceWithSource(
    rma, input.rmaZipBytes, input.rmaRecordLayoutBytes,
  );
  if (!rmaVerification.ok || !rmaVerification.sourceArtifactsReverified
    || !rmaVerification.officialFrozenSourceVerified
    || rmaVerification.verificationLevel
      !== REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.rma.verificationLevel
    || rma.artifactHash
      !== REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.rma.artifactHash) {
    throw new Error("REAL_LOSS_RMA_FULL_OFFICIAL_SOURCE_REPLAY_REQUIRED");
  }

  const cas = buildCasSchedulePReserveCalibration(
    input.casSourceFiles,
    input.casSourcePageBytes,
    { generatedAt: CAS_SCHEDULE_P_SOURCE_PAGE.accessedAt },
  );
  const casVerification = verifyCasSchedulePReserveCalibrationWithSource(
    cas, input.casSourceFiles, input.casSourcePageBytes,
  );
  if (!casVerification.ok || !casVerification.sourceArtifactsReverified
    || !casVerification.officialFrozenSourceVerified
    || casVerification.verificationLevel
      !== REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.cas.verificationLevel
    || cas.artifactHash
      !== REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.cas.artifactHash) {
    throw new Error("REAL_LOSS_CAS_FULL_OFFICIAL_SOURCE_REPLAY_REQUIRED");
  }
  return Object.freeze({ input, rma, cas, rmaVerification, casVerification });
}

function assertRmaMath(rma) {
  const { accounting, national, sourceDomainCalibration } = rma;
  if (accounting.sourceRows !== national.rows
    || accounting.semanticCells !== national.rows
    || accounting.duplicateSemanticCells !== 0
    || accounting.zeroReportedLossExposureCellsPreserved
      !== national.zeroReportedLossExposureCells
    || national.exposureCells + national.noExposureNoReportedLossCells
      > national.rows
    || national.historicalIndemnityToPremiumRatio !== decimalRatio(
      national.indemnityDollars, national.totalPremiumDollars)
    || national.historicalIndemnityToLiabilityRatio !== decimalRatio(
      national.indemnityDollars, national.liabilityDollars)
    || sourceDomainCalibration.reportedLossFrequencyDescriptiveStatisticEligible
      !== false
    || national.reportedLossPolicyCellRateModelEligible !== false
    || national.reportedLossUnitCellRateModelEligible !== false
    || sourceDomainCalibration.aggregateIndemnityRatioDescriptiveStatisticEligible
      !== true) {
    throw new Error("REAL_LOSS_RMA_MATH_OR_QUARANTINE_INVALID");
  }
}

function assertBacktestBias(backtest, code) {
  const lag10Bias = decimalRatio(
    BigInt(backtest.predictedLag10SourceUnits) - BigInt(backtest.actualLag10SourceUnits),
    backtest.actualLag10SourceUnits,
  );
  const futureBias = decimalRatio(
    BigInt(backtest.predictedPost2007DevelopmentSourceUnits)
      - BigInt(backtest.actualPost2007DevelopmentSourceUnits),
    backtest.actualPost2007DevelopmentSourceUnits,
  );
  if (lag10Bias !== backtest.lag10AggregateBiasRatio
    || futureBias !== backtest.futureDevelopmentAggregateBiasRatio
    || !RATIO.test(backtest.lag10WeightedAbsoluteErrorRatio)
    || !RATIO.test(backtest.futureDevelopmentWeightedAbsoluteErrorRatio)) {
    throw new Error(`REAL_LOSS_${code}_BACKTEST_MATH_INVALID`);
  }
}

function assertCasMath(cas) {
  if (cas.axes.calendarYear.equation
      !== "ACCIDENT_YEAR_PLUS_DEVELOPMENT_LAG_MINUS_ONE"
    || cas.axes.calendarYear.trainingCutoff !== 2007
    || cas.axes.accidentYear.first !== 1998 || cas.axes.accidentYear.last !== 2007
    || cas.axes.developmentLag.first !== 1 || cas.axes.developmentLag.last !== 10
    || cas.accounting.upperTriangleCells + cas.accounting.lowerTriangleCells
      !== cas.accounting.sourceRows
    || cas.sourceDomainCalibration.lowerTriangleOutOfTimeBacktestCompleted !== true
    || cas.sourceDomainCalibration.productionReserveModelEligible !== false
    || cas.correlationAndTailBoundary.developmentBeyondLag10Observed !== false
    || cas.correlationAndTailBoundary.lag10IsUltimateEstablished !== false
    || cas.correlationAndTailBoundary.tailFactorObserved !== false
    || cas.sourceDomainCalibration.correlationModelEligible !== false) {
    throw new Error("REAL_LOSS_CAS_AXIS_OR_MISSINGNESS_INVALID");
  }
  for (const lineCode of EXPECTED_LINE_CODES) {
    const line = cas.byLine[lineCode];
    if (!line || line.lineCode !== lineCode
      || line.upperTriangleCells + line.lowerTriangleCells !== line.sourceRows
      || line.semanticCells + line.duplicateSemanticCells !== line.sourceRows
      || line.developmentFactors.trainingCutoffCalendarYear !== 2007
      || line.developmentFactors.lowerTriangleUsedForFactorFitting !== false
      || line.holdoutBacktest.lowerTriangleUsedOnlyAsOutcome !== true
      || line.holdoutBacktest.lag10IsUltimateEstablished !== false) {
      throw new Error(`REAL_LOSS_CAS_${lineCode}_LINE_ACCOUNTING_INVALID`);
    }
    for (const pathName of ["cumulativePaid", "incurred"]) {
      const factors = line.developmentFactors[pathName];
      if (!Array.isArray(factors) || factors.length !== 9) {
        throw new Error(`REAL_LOSS_CAS_${lineCode}_${pathName}_FACTORS_INVALID`);
      }
      for (const factor of factors) {
        const expected = decimalRatio(
          factor.numeratorSourceUnits, factor.denominatorSourceUnits,
        );
        if (!factor.modelArithmeticEligible || expected !== factor.volumeWeightedFactor
          || factor.toDevelopmentLag !== factor.fromDevelopmentLag + 1) {
          throw new Error(`REAL_LOSS_CAS_${lineCode}_${pathName}_FACTOR_MATH_INVALID`);
        }
      }
      assertBacktestBias(line.holdoutBacktest[pathName], `${lineCode}_${pathName}`);
    }
  }
}

function projectRma(rma) {
  const { accounting, national, source, sourceDomainCalibration } = rma;
  return {
    sourceDomain: "US_FEDERAL_CROP_INSURANCE",
    evidenceWindow: {
      commodityYear: source.commodityYear,
      snapshotMutability: source.snapshotMutability,
      frozenSnapshotGeneratedAt: source.generatedAt,
      completeClaimUniverseObserved: false,
      ultimateLossWindowObserved: false,
    },
    snapshotCompleteness: {
      sourceRows: accounting.sourceRows,
      semanticCells: accounting.semanticCells,
      duplicateSemanticCells: accounting.duplicateSemanticCells,
      materialMissingMonetaryCells: national.materialMissingMonetaryCells,
      completePublishedSnapshotExposureDenominatorObserved:
        sourceDomainCalibration.completePublishedSnapshotExposureDenominatorObserved,
      publishedFileAccountingComplete:
        accounting.sourceRows === accounting.semanticCells
          && accounting.duplicateSemanticCells === 0,
    },
    exposureAndZeroReportedLossWindow: {
      sourceRows: national.rows,
      exposureCells: national.exposureCells,
      exposureCellShareOfSourceRows: decimalRatio(national.exposureCells, national.rows),
      noReportedLossCells: national.noReportedLossCells,
      zeroReportedLossExposureCells: national.zeroReportedLossExposureCells,
      zeroReportedLossExposureShare: decimalRatio(
        national.zeroReportedLossExposureCells, national.exposureCells),
      noExposureNoReportedLossCells: national.noExposureNoReportedLossCells,
      zeroMeansNoReportedLossInFrozenPublisherSnapshot: true,
      zeroMeansNoUltimateLoss: false,
    },
    countAnomalyQuarantine: {
      policyLossCountExceedsExposureCells:
        national.policyLossCountExceedsExposureCells,
      unitLossCountExceedsExposureCells: national.unitLossCountExceedsExposureCells,
      policyAndUnitAnomalyCountsKeptSeparate: true,
      reportedLossPolicyCellRateForAuditOnly: national.reportedLossPolicyCellRate,
      reportedLossUnitCellRateForAuditOnly: national.reportedLossUnitCellRate,
      reportedLossFrequencyDescriptiveStatisticEligible: false,
      frequencyModelQuarantined: true,
    },
    aggregateIndemnityRatios: {
      amountUnit: "USD_AS_DECLARED_BY_RMA_LAYOUT",
      liabilityDollars: national.liabilityDollars,
      totalPremiumDollars: national.totalPremiumDollars,
      indemnityDollars: national.indemnityDollars,
      negativeIndemnityAdjustmentCells: national.negativeIndemnityAdjustmentCells,
      historicalIndemnityToPremiumRatio:
        national.historicalIndemnityToPremiumRatio,
      historicalIndemnityToLiabilityRatio:
        national.historicalIndemnityToLiabilityRatio,
      aggregateIndemnityRatioDescriptiveStatisticEligible: true,
      indemnityIsCashPaid: false,
      individualSeverityObserved: false,
      crossDomainMagnitudePriorEligible: false,
    },
  };
}

function projectCasLine(line) {
  return {
    lineId: line.lineId,
    lineCode: line.lineCode,
    coverageBasis: line.coverageBasis,
    sourceRows: line.sourceRows,
    semanticCells: line.semanticCells,
    duplicateSemanticCells: line.duplicateSemanticCells,
    upperTriangleCells: line.upperTriangleCells,
    lowerTriangleCells: line.lowerTriangleCells,
    negativeRevisions: {
      paidDecreaseCells: line.paidDecreaseCells,
      incurredDecreaseCells: line.incurredDecreaseCells,
      negativePostedReserveCells: line.negativePostedReserveCells,
      negativeEarnedPremiumNetCells: line.negativeEarnedPremiumNetCells,
      revisionsClipped: false,
    },
    developmentFactors: cloneJson(line.developmentFactors),
    holdoutBacktest: cloneJson(line.holdoutBacktest),
  };
}

function projectCas(cas) {
  return {
    sourceDomain: "US_PROPERTY_CASUALTY_SCHEDULE_P",
    accounting: cloneJson(cas.accounting),
    axes: cloneJson(cas.axes),
    paidVsIncurred: {
      cumulativePaidMeaning: cas.semanticBoundary.cumulativePaidLossMeaning,
      incurredMeaning: cas.semanticBoundary.incurredLossesMeaning,
      incurredIsCashPaid: false,
      paidIsRecovery: false,
      bulkAndIbnrIsCaseReserve: false,
      pathsEstimatedAndBacktestedSeparately: true,
    },
    lineOrder: [...EXPECTED_LINE_CODES],
    byLine: Object.fromEntries(EXPECTED_LINE_CODES.map((lineCode) => (
      [lineCode, projectCasLine(cas.byLine[lineCode])]
    ))),
    correlationAndTailMissingness: cloneJson(cas.correlationAndTailBoundary),
    aggregateAcrossLineBacktest: {
      projected: false,
      reason: "NO_CROSS_LINE_AMOUNT_POOLING_IN_CALIBRATION_SHADOW",
      upstreamArtifactHashBindsUnprojectedAggregate:
        REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.cas.artifactHash,
    },
  };
}

function sourceReplayProjection(rebuilt) {
  return {
    constructionMode: "RAW_BYTES_REBUILT_AND_FULL_SOURCE_VERIFIED_INSIDE_BUILDER",
    acceptsCallerUpstreamArtifact: false,
    acceptsCallerVerificationResult: false,
    acceptsCallerAdmissionCallback: false,
    rma: {
      upstreamSchema: rebuilt.rma.schema,
      upstreamArtifactHash: rebuilt.rma.artifactHash,
      upstreamSourceCommitmentHash: rebuilt.rma.sourceCommitmentHash,
      sourceObjectHash: rebuilt.rma.source.sourceObjectHash,
      recordLayoutHash: rebuilt.rma.source.recordLayoutHash,
      verificationLevel: rebuilt.rmaVerification.verificationLevel,
      officialFrozenSourceVerifiedInsideBuilder: true,
      sourceArtifactsReverifiedInsideBuilder: true,
    },
    cas: {
      upstreamSchema: rebuilt.cas.schema,
      upstreamArtifactHash: rebuilt.cas.artifactHash,
      upstreamSourceCommitmentHash: rebuilt.cas.sourceCommitmentHash,
      sourcePageHash: rebuilt.cas.source.sourcePage.hash,
      sourceFileHashes: Object.fromEntries(rebuilt.cas.source.files.map((file) => (
        [file.lineCode, file.hash]
      ))),
      verificationLevel: rebuilt.casVerification.verificationLevel,
      officialFrozenSourceVerifiedInsideBuilder: true,
      sourceArtifactsReverifiedInsideBuilder: true,
    },
  };
}

export function buildRealLossCalibrationShadow(sources, options = {}) {
  if (!exactKeys(options, Object.hasOwn(options, "generatedAt") ? ["generatedAt"] : [])) {
    throw new Error("REAL_LOSS_OPTIONS_SCHEMA_INVALID");
  }
  const generatedAt = canonicalTime(
    options.generatedAt ?? REAL_LOSS_CALIBRATION_SHADOW_FROZEN_AT,
    "REAL_LOSS_GENERATED_AT",
  );
  const rebuilt = rebuildAndVerifyOfficialSources(sources);
  assertRmaMath(rebuilt.rma);
  assertCasMath(rebuilt.cas);
  const diagnostics = {
    nonPoolingPolicy: cloneJson(NON_POOLING_POLICY),
    rma: projectRma(rebuilt.rma),
    cas: projectCas(rebuilt.cas),
  };
  const body = {
    schema: REAL_LOSS_CALIBRATION_SHADOW_SCHEMA,
    schemaVersion: "1.0.0",
    generatedAt,
    adapter: {
      adapterId: "OUTSIDER_REAL_LOSS_CALIBRATION_SHADOW",
      adapterVersion: "1.0.0",
      specificationHash: domainHash(
        "outsider/real-loss-calibration-shadow-spec/v1",
        {
          upstreamPins: REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS,
          measurementDictionary: REAL_LOSS_CALIBRATION_MEASUREMENT_DICTIONARY,
          nonPoolingPolicy: NON_POOLING_POLICY,
          rightsBoundary: RIGHTS_BOUNDARY,
          outputBoundary: OUTPUT_BOUNDARY,
        },
      ),
    },
    sourceReplay: sourceReplayProjection(rebuilt),
    measurementDictionary: cloneJson(REAL_LOSS_CALIBRATION_MEASUREMENT_DICTIONARY),
    diagnostics,
    diagnosticCommitmentHash: domainHash(
      "outsider/real-loss-calibration-shadow-diagnostics/v1", diagnostics),
    rightsBoundary: cloneJson(RIGHTS_BOUNDARY),
    outputBoundary: cloneJson(OUTPUT_BOUNDARY),
  };
  return deepFreeze({
    ...body,
    artifactHash: domainHash(REAL_LOSS_CALIBRATION_SHADOW_SCHEMA, body),
  });
}

function developmentFactorValid(factor) {
  const keys = ["fromDevelopmentLag", "toDevelopmentLag", "trainingPairs",
    "negativeMemberPairs", "numeratorSourceUnits", "denominatorSourceUnits",
    "volumeWeightedFactor", "modelArithmeticEligible"];
  return exactKeys(factor, keys)
    && Number.isSafeInteger(factor.fromDevelopmentLag)
    && Number.isSafeInteger(factor.toDevelopmentLag)
    && Number.isSafeInteger(factor.trainingPairs)
    && Number.isSafeInteger(factor.negativeMemberPairs)
    && typeof factor.numeratorSourceUnits === "string"
    && typeof factor.denominatorSourceUnits === "string"
    && RATIO.test(factor.volumeWeightedFactor ?? "")
    && factor.modelArithmeticEligible === true;
}

function backtestValid(backtest) {
  const keys = ["candidateCohorts", "evaluatedCohorts", "missingEndpointCohorts",
    "negativeEndpointCohorts", "missingFactorCohorts",
    "predictedNegativeFutureDevelopmentCohorts",
    "actualNegativeFutureDevelopmentCohorts", "baseAtYearEnd2007SourceUnits",
    "actualLag10SourceUnits", "predictedLag10SourceUnits",
    "actualPost2007DevelopmentSourceUnits",
    "predictedPost2007DevelopmentSourceUnits", "lag10AggregateBiasRatio",
    "lag10WeightedAbsoluteErrorRatio", "futureDevelopmentAggregateBiasRatio",
    "futureDevelopmentWeightedAbsoluteErrorRatio", "predictionRounding"];
  return exactKeys(backtest, keys)
    && keys.slice(0, 7).every((key) => Number.isSafeInteger(backtest[key])
      && backtest[key] >= 0)
    && keys.slice(7, 12).every((key) => /^-?\d+$/.test(backtest[key]))
    && keys.slice(12, 16).every((key) => RATIO.test(backtest[key] ?? ""))
    && backtest.predictionRounding
      === "PER_COHORT_HALF_UP_TO_WHOLE_SOURCE_AMOUNT_UNIT";
}

function casLineEnvelopeValid(line, lineCode) {
  const keys = ["lineId", "lineCode", "coverageBasis", "sourceRows",
    "semanticCells", "duplicateSemanticCells", "upperTriangleCells",
    "lowerTriangleCells", "negativeRevisions", "developmentFactors",
    "holdoutBacktest"];
  const revisionKeys = ["paidDecreaseCells", "incurredDecreaseCells",
    "negativePostedReserveCells", "negativeEarnedPremiumNetCells",
    "revisionsClipped"];
  const factorKeys = ["cumulativePaid", "incurred", "trainingCutoffCalendarYear",
    "lowerTriangleUsedForFactorFitting"];
  const holdoutKeys = ["cumulativePaid", "incurred",
    "lowerTriangleUsedOnlyAsOutcome", "lag10IsUltimateEstablished"];
  return exactKeys(line, keys) && line.lineCode === lineCode
    && exactKeys(line.negativeRevisions, revisionKeys)
    && line.negativeRevisions.revisionsClipped === false
    && exactKeys(line.developmentFactors, factorKeys)
    && line.developmentFactors.trainingCutoffCalendarYear === 2007
    && line.developmentFactors.lowerTriangleUsedForFactorFitting === false
    && ["cumulativePaid", "incurred"].every((pathName) => (
      Array.isArray(line.developmentFactors[pathName])
      && line.developmentFactors[pathName].length === 9
      && line.developmentFactors[pathName].every(developmentFactorValid)
    ))
    && exactKeys(line.holdoutBacktest, holdoutKeys)
    && backtestValid(line.holdoutBacktest.cumulativePaid)
    && backtestValid(line.holdoutBacktest.incurred)
    && line.holdoutBacktest.lowerTriangleUsedOnlyAsOutcome === true
    && line.holdoutBacktest.lag10IsUltimateEstablished === false;
}

function sourceReplayEnvelopeValid(sourceReplay) {
  const topKeys = ["constructionMode", "acceptsCallerUpstreamArtifact",
    "acceptsCallerVerificationResult", "acceptsCallerAdmissionCallback", "rma", "cas"];
  const rmaKeys = ["upstreamSchema", "upstreamArtifactHash",
    "upstreamSourceCommitmentHash", "sourceObjectHash", "recordLayoutHash",
    "verificationLevel", "officialFrozenSourceVerifiedInsideBuilder",
    "sourceArtifactsReverifiedInsideBuilder"];
  const casKeys = ["upstreamSchema", "upstreamArtifactHash",
    "upstreamSourceCommitmentHash", "sourcePageHash", "sourceFileHashes",
    "verificationLevel", "officialFrozenSourceVerifiedInsideBuilder",
    "sourceArtifactsReverifiedInsideBuilder"];
  return exactKeys(sourceReplay, topKeys)
    && sourceReplay.constructionMode
      === "RAW_BYTES_REBUILT_AND_FULL_SOURCE_VERIFIED_INSIDE_BUILDER"
    && ["acceptsCallerUpstreamArtifact", "acceptsCallerVerificationResult",
      "acceptsCallerAdmissionCallback"].every((key) => sourceReplay[key] === false)
    && exactKeys(sourceReplay.rma, rmaKeys)
    && exactKeys(sourceReplay.cas, casKeys)
    && sourceReplay.rma.upstreamSchema
      === REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.rma.schema
    && sourceReplay.rma.upstreamArtifactHash
      === REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.rma.artifactHash
    && sourceReplay.rma.sourceObjectHash
      === REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.rma.sourceObjectHash
    && sourceReplay.rma.recordLayoutHash
      === REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.rma.recordLayoutHash
    && sourceReplay.rma.verificationLevel
      === REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.rma.verificationLevel
    && sourceReplay.cas.upstreamSchema
      === REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.cas.schema
    && sourceReplay.cas.upstreamArtifactHash
      === REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.cas.artifactHash
    && sourceReplay.cas.sourcePageHash
      === REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.cas.sourcePageHash
    && canonicalizeStrict(sourceReplay.cas.sourceFileHashes)
      === canonicalizeStrict(
        REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.cas.sourceFileHashes)
    && sourceReplay.cas.verificationLevel
      === REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.cas.verificationLevel
    && sourceReplay.rma.officialFrozenSourceVerifiedInsideBuilder === true
    && sourceReplay.rma.sourceArtifactsReverifiedInsideBuilder === true
    && sourceReplay.cas.officialFrozenSourceVerifiedInsideBuilder === true
    && sourceReplay.cas.sourceArtifactsReverifiedInsideBuilder === true
    && HASH.test(sourceReplay.rma.upstreamSourceCommitmentHash ?? "")
    && HASH.test(sourceReplay.cas.upstreamSourceCommitmentHash ?? "");
}

function rmaDiagnosticsEnvelopeValid(rma) {
  const evidenceWindowKeys = ["commodityYear", "snapshotMutability",
    "frozenSnapshotGeneratedAt", "completeClaimUniverseObserved",
    "ultimateLossWindowObserved"];
  const completenessKeys = ["sourceRows", "semanticCells", "duplicateSemanticCells",
    "materialMissingMonetaryCells",
    "completePublishedSnapshotExposureDenominatorObserved",
    "publishedFileAccountingComplete"];
  const exposureKeys = ["sourceRows", "exposureCells", "exposureCellShareOfSourceRows",
    "noReportedLossCells", "zeroReportedLossExposureCells",
    "zeroReportedLossExposureShare", "noExposureNoReportedLossCells",
    "zeroMeansNoReportedLossInFrozenPublisherSnapshot", "zeroMeansNoUltimateLoss"];
  const anomalyKeys = ["policyLossCountExceedsExposureCells",
    "unitLossCountExceedsExposureCells", "policyAndUnitAnomalyCountsKeptSeparate",
    "reportedLossPolicyCellRateForAuditOnly", "reportedLossUnitCellRateForAuditOnly",
    "reportedLossFrequencyDescriptiveStatisticEligible", "frequencyModelQuarantined"];
  const ratioKeys = ["amountUnit", "liabilityDollars", "totalPremiumDollars",
    "indemnityDollars", "negativeIndemnityAdjustmentCells",
    "historicalIndemnityToPremiumRatio", "historicalIndemnityToLiabilityRatio",
    "aggregateIndemnityRatioDescriptiveStatisticEligible", "indemnityIsCashPaid",
    "individualSeverityObserved", "crossDomainMagnitudePriorEligible"];
  return exactKeys(rma, ["sourceDomain", "evidenceWindow", "snapshotCompleteness",
    "exposureAndZeroReportedLossWindow", "countAnomalyQuarantine",
    "aggregateIndemnityRatios"])
    && rma.sourceDomain === "US_FEDERAL_CROP_INSURANCE"
    && exactKeys(rma.evidenceWindow, evidenceWindowKeys)
    && rma.evidenceWindow.commodityYear === 2024
    && rma.evidenceWindow.completeClaimUniverseObserved === false
    && rma.evidenceWindow.ultimateLossWindowObserved === false
    && exactKeys(rma.snapshotCompleteness, completenessKeys)
    && exactKeys(rma.exposureAndZeroReportedLossWindow, exposureKeys)
    && RATIO.test(rma.exposureAndZeroReportedLossWindow
      .exposureCellShareOfSourceRows ?? "")
    && RATIO.test(rma.exposureAndZeroReportedLossWindow
      .zeroReportedLossExposureShare ?? "")
    && rma.exposureAndZeroReportedLossWindow
      .zeroMeansNoReportedLossInFrozenPublisherSnapshot === true
    && rma.exposureAndZeroReportedLossWindow.zeroMeansNoUltimateLoss === false
    && exactKeys(rma.countAnomalyQuarantine, anomalyKeys)
    && rma.countAnomalyQuarantine.policyAndUnitAnomalyCountsKeptSeparate === true
    && rma.countAnomalyQuarantine
      .reportedLossFrequencyDescriptiveStatisticEligible === false
    && rma.countAnomalyQuarantine.frequencyModelQuarantined === true
    && exactKeys(rma.aggregateIndemnityRatios, ratioKeys)
    && rma.aggregateIndemnityRatios.amountUnit === "USD_AS_DECLARED_BY_RMA_LAYOUT"
    && RATIO.test(rma.aggregateIndemnityRatios
      .historicalIndemnityToPremiumRatio ?? "")
    && RATIO.test(rma.aggregateIndemnityRatios
      .historicalIndemnityToLiabilityRatio ?? "")
    && rma.aggregateIndemnityRatios
      .aggregateIndemnityRatioDescriptiveStatisticEligible === true
    && rma.aggregateIndemnityRatios.indemnityIsCashPaid === false
    && rma.aggregateIndemnityRatios.individualSeverityObserved === false
    && rma.aggregateIndemnityRatios.crossDomainMagnitudePriorEligible === false;
}

function casDiagnosticsEnvelopeValid(cas) {
  const accountingKeys = ["sourceFiles", "sourceRows", "semanticCells",
    "duplicateSemanticCells", "upperTriangleCells", "lowerTriangleCells",
    "fullTenByTenGroupTriangles", "incompleteTenByTenGroupTriangles",
    "rowCommitmentCount", "allObservedCohortsHaveTenDevelopmentLags",
    "everyGroupHasAllTenAccidentYears"];
  const axisKeys = ["accidentYear", "developmentLag", "calendarYear"];
  const simpleAxisKeys = ["first", "last", "meaning"];
  const calendarKeys = ["equation", "trainingCutoff", "upperTriangleRule",
    "lowerTriangleHoldoutRule"];
  const paidIncurredKeys = ["cumulativePaidMeaning", "incurredMeaning",
    "incurredIsCashPaid", "paidIsRecovery", "bulkAndIbnrIsCaseReserve",
    "pathsEstimatedAndBacktestedSeparately"];
  const correlationKeys = ["crossLineEntityOverlap", "calendarYearDiagonalsObserved",
    "calendarYearShockIdentifiersObserved", "catastropheIdentifiersObserved",
    "crossCompanyIndependenceEstablished", "crossLineIndependenceEstablished",
    "triangleCellsIidEstablished", "developmentBeyondLag10Observed",
    "lag10IsUltimateEstablished", "tailFactorObserved",
    "tailOrTvarCalibrationEligible"];
  const overlapKeys = ["groupCodesAppearingInMultipleLines", "pairwise"];
  const pairKeys = ["leftLineCode", "rightLineCode", "sharedGroupCodes"];
  const aggregateKeys = ["projected", "reason",
    "upstreamArtifactHashBindsUnprojectedAggregate"];
  return exactKeys(cas, ["sourceDomain", "accounting", "axes", "paidVsIncurred",
    "lineOrder", "byLine", "correlationAndTailMissingness",
    "aggregateAcrossLineBacktest"])
    && cas.sourceDomain === "US_PROPERTY_CASUALTY_SCHEDULE_P"
    && exactKeys(cas.accounting, accountingKeys)
    && exactKeys(cas.axes, axisKeys)
    && exactKeys(cas.axes.accidentYear, simpleAxisKeys)
    && exactKeys(cas.axes.developmentLag, simpleAxisKeys)
    && exactKeys(cas.axes.calendarYear, calendarKeys)
    && cas.axes.calendarYear.equation
      === "ACCIDENT_YEAR_PLUS_DEVELOPMENT_LAG_MINUS_ONE"
    && cas.axes.calendarYear.trainingCutoff === 2007
    && exactKeys(cas.paidVsIncurred, paidIncurredKeys)
    && cas.paidVsIncurred.incurredIsCashPaid === false
    && cas.paidVsIncurred.paidIsRecovery === false
    && cas.paidVsIncurred.bulkAndIbnrIsCaseReserve === false
    && cas.paidVsIncurred.pathsEstimatedAndBacktestedSeparately === true
    && canonicalizeStrict(cas.lineOrder) === canonicalizeStrict(EXPECTED_LINE_CODES)
    && exactKeys(cas.byLine, EXPECTED_LINE_CODES)
    && EXPECTED_LINE_CODES.every((lineCode) => (
      casLineEnvelopeValid(cas.byLine[lineCode], lineCode)))
    && exactKeys(cas.correlationAndTailMissingness, correlationKeys)
    && exactKeys(cas.correlationAndTailMissingness.crossLineEntityOverlap, overlapKeys)
    && Array.isArray(cas.correlationAndTailMissingness.crossLineEntityOverlap.pairwise)
    && cas.correlationAndTailMissingness.crossLineEntityOverlap.pairwise
      .every((pair) => exactKeys(pair, pairKeys))
    && cas.correlationAndTailMissingness.calendarYearShockIdentifiersObserved === false
    && cas.correlationAndTailMissingness.catastropheIdentifiersObserved === false
    && cas.correlationAndTailMissingness.crossCompanyIndependenceEstablished === false
    && cas.correlationAndTailMissingness.crossLineIndependenceEstablished === false
    && cas.correlationAndTailMissingness.triangleCellsIidEstablished === false
    && cas.correlationAndTailMissingness.developmentBeyondLag10Observed === false
    && cas.correlationAndTailMissingness.lag10IsUltimateEstablished === false
    && cas.correlationAndTailMissingness.tailFactorObserved === false
    && cas.correlationAndTailMissingness.tailOrTvarCalibrationEligible === false
    && exactKeys(cas.aggregateAcrossLineBacktest, aggregateKeys)
    && cas.aggregateAcrossLineBacktest.projected === false
    && cas.aggregateAcrossLineBacktest.reason
      === "NO_CROSS_LINE_AMOUNT_POOLING_IN_CALIBRATION_SHADOW"
    && cas.aggregateAcrossLineBacktest.upstreamArtifactHashBindsUnprojectedAggregate
      === REAL_LOSS_CALIBRATION_SHADOW_UPSTREAM_PINS.cas.artifactHash;
}

function diagnosticsEnvelopeValid(diagnostics) {
  return exactKeys(diagnostics, ["nonPoolingPolicy", "rma", "cas"])
    && canonicalizeStrict(diagnostics.nonPoolingPolicy)
      === canonicalizeStrict(NON_POOLING_POLICY)
    && rmaDiagnosticsEnvelopeValid(diagnostics.rma)
    && casDiagnosticsEnvelopeValid(diagnostics.cas);
}

function artifactEnvelopeValid(artifact) {
  const topKeys = ["schema", "schemaVersion", "generatedAt", "adapter",
    "sourceReplay", "measurementDictionary", "diagnostics",
    "diagnosticCommitmentHash", "rightsBoundary", "outputBoundary", "artifactHash"];
  return exactKeys(artifact, topKeys)
    && artifact.schema === REAL_LOSS_CALIBRATION_SHADOW_SCHEMA
    && artifact.schemaVersion === "1.0.0"
    && canonicalTime(artifact.generatedAt, "REAL_LOSS_ARTIFACT_GENERATED_AT")
      === artifact.generatedAt
    && exactKeys(artifact.adapter,
      ["adapterId", "adapterVersion", "specificationHash"])
    && artifact.adapter.adapterId === "OUTSIDER_REAL_LOSS_CALIBRATION_SHADOW"
    && artifact.adapter.adapterVersion === "1.0.0"
    && HASH.test(artifact.adapter.specificationHash ?? "")
    && sourceReplayEnvelopeValid(artifact.sourceReplay)
    && canonicalizeStrict(artifact.measurementDictionary)
      === canonicalizeStrict(REAL_LOSS_CALIBRATION_MEASUREMENT_DICTIONARY)
    && diagnosticsEnvelopeValid(artifact.diagnostics)
    && HASH.test(artifact.diagnosticCommitmentHash ?? "")
    && artifact.diagnosticCommitmentHash === domainHash(
      "outsider/real-loss-calibration-shadow-diagnostics/v1", artifact.diagnostics)
    && canonicalizeStrict(artifact.rightsBoundary)
      === canonicalizeStrict(RIGHTS_BOUNDARY)
    && canonicalizeStrict(artifact.outputBoundary)
      === canonicalizeStrict(OUTPUT_BOUNDARY)
    && HASH.test(artifact.artifactHash ?? "");
}

function invalidVerification(failures, artifact = null) {
  return Object.freeze({
    ok: false,
    failures: Object.freeze([...new Set(failures)]),
    verificationLevel: "INVALID",
    artifactStructureVerified: false,
    envelopeSchemaSubsetVerified: false,
    envelopeSelfHashVerified: false,
    diagnosticDerivationVerified: false,
    authorityBoundaryVerified: false,
    inputBytesReproduced: false,
    sourceArtifactsReverified: false,
    officialFrozenSourcesVerified: false,
    artifactClaimsInternalSourceReplay:
      artifact?.sourceReplay?.rma?.sourceArtifactsReverifiedInsideBuilder === true
      && artifact?.sourceReplay?.cas?.sourceArtifactsReverifiedInsideBuilder === true,
    productionReady: false,
  });
}

export function verifyRealLossCalibrationShadow(artifact) {
  const failures = [];
  let schemaValid = false;
  let selfHashValid = false;
  try {
    schemaValid = artifactEnvelopeValid(artifact);
    if (!schemaValid) failures.push("REAL_LOSS_ARTIFACT_ENVELOPE_INVALID");
    const { artifactHash, ...body } = artifact;
    selfHashValid = artifactHash
      === domainHash(REAL_LOSS_CALIBRATION_SHADOW_SCHEMA, body);
    if (!selfHashValid) failures.push("REAL_LOSS_ARTIFACT_SELF_HASH_INVALID");
  } catch (error) {
    failures.push(`REAL_LOSS_ARTIFACT_STRUCTURE_FAILED:${error instanceof Error
      ? error.message : String(error)}`);
  }
  if (failures.length !== 0) return invalidVerification(failures, artifact);
  return Object.freeze({
    ok: true,
    failures: Object.freeze([]),
    verificationLevel: "SELF_SEALED_UNTRUSTED_ENVELOPE",
    artifactStructureVerified: false,
    envelopeSchemaSubsetVerified: schemaValid,
    envelopeSelfHashVerified: selfHashValid,
    diagnosticDerivationVerified: false,
    authorityBoundaryVerified: false,
    inputBytesReproduced: false,
    sourceArtifactsReverified: false,
    officialFrozenSourcesVerified: false,
    artifactClaimsInternalSourceReplay: true,
    productionReady: false,
  });
}

export function verifyRealLossCalibrationShadowWithSource(artifact, sources) {
  const standalone = verifyRealLossCalibrationShadow(artifact);
  if (!standalone.ok) return standalone;
  const failures = [];
  let expected = null;
  try {
    expected = buildRealLossCalibrationShadow(sources, {
      generatedAt: artifact.generatedAt,
    });
    if (canonicalizeStrict(expected) !== canonicalizeStrict(artifact)) {
      failures.push("REAL_LOSS_SOURCE_REPLAY_DERIVATION_INVALID");
    }
  } catch (error) {
    failures.push(`REAL_LOSS_SOURCE_REPLAY_FAILED:${error instanceof Error
      ? error.message : String(error)}`);
  }
  if (failures.length !== 0) {
    return Object.freeze({
      ...invalidVerification(failures, artifact),
      artifactStructureVerified: true,
      envelopeSchemaSubsetVerified: true,
      envelopeSelfHashVerified: true,
    });
  }
  return Object.freeze({
    ok: true,
    failures: Object.freeze([]),
    verificationLevel: "FULL_OFFICIAL_RMA_AND_CAS_SOURCE_REPLAYED",
    artifactStructureVerified: true,
    envelopeSchemaSubsetVerified: true,
    envelopeSelfHashVerified: true,
    diagnosticDerivationVerified: true,
    authorityBoundaryVerified: true,
    inputBytesReproduced: true,
    sourceArtifactsReverified: true,
    officialFrozenSourcesVerified: true,
    artifactClaimsInternalSourceReplay: true,
    upstreamVerificationLevels: Object.freeze({
      rma: expected.sourceReplay.rma.verificationLevel,
      cas: expected.sourceReplay.cas.verificationLevel,
    }),
    rmaSourceDomainDecision:
      "ADMIT_AGGREGATE_INDEMNITY_ONLY_FREQUENCY_QUARANTINED",
    casSourceDomainDecision:
      "ADMIT_SCHEDULE_P_HISTORICAL_RESERVE_BACKTEST_ONLY",
    outsiderDecision: expected.outputBoundary.decision,
    productionReady: false,
  });
}
