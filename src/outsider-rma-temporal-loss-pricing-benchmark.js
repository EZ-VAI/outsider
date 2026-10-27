/*
 * USDA RMA closed-year temporal loss/pricing benchmark.
 *
 * This lane replays 11 static Summary of Business files at one unchanged
 * aggregation/layout boundary.  It establishes a real source-domain temporal
 * benchmark with matched exposure, liability, premium and indemnity.  It does
 * not transfer crop risk to Outsider, issue a quote, or grant authority.
 */

import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync,
  realpathSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "./canonical.js";
import { buildRmaCropInsuranceExperience } from "./outsider-rma-crop-insurance-experience.js";

export const RMA_TEMPORAL_LOSS_PRICING_SCHEMA
  = "outsider/rma-temporal-loss-pricing-benchmark/v2";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Patched only after final-v2 was emitted with a no-clobber write. These pins
// are deliberately outside the artifact body so pinning them cannot change
// the bytes they identify.
export const RMA_TEMPORAL_LOSS_PRICING_CANONICAL = Object.freeze({
  canonicalRelease: "final-v2",
  generatedAt: "2026-08-22T09:26:00.000Z",
  repositoryRelativePath:
    "artifacts/rma-temporal-loss-pricing-2010-2020/final-v2/artifact.json",
  artifactHash: "sha256:7ebd42f5969253924a44c632ab2b2afbcc194b734fa3b67eb396a0fcf8b64df3",
  artifactFileHash:
    "sha256:d985137fb2b783a2fc50d1dcc829bf388c48670ef4c15a4d7b43ee65ffb86777",
  artifactFileBytes: 19_652,
});

export const RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1 = Object.freeze({
  canonicalRelease: "final-v1",
  generatedAt: "2026-08-22T09:00:00.000Z",
  repositoryRelativePath:
    "artifacts/rma-temporal-loss-pricing-2010-2020/final-v1/artifact.json",
  artifactHash: "sha256:ec31776b479afe599029b04cf8a752dca56ffe923c0c8ed708537d13edda75d5",
  artifactFileHash:
    "sha256:3f0ffd67317c831ac12cf998e53c8ce04e2f85c1f0d33859415156d6d48748e2",
  artifactFileBytes: 19_457,
  supersessionMarkerRepositoryRelativePath:
    "artifacts/rma-temporal-loss-pricing-2010-2020/final-v1/superseded-by.json",
  supersessionMarkerFileHash:
    "sha256:45f29309df9ddb48c56ffe63c05cb6e0ecde8b58ef1b80505eb82342ed85c111",
  supersessionMarkerFileBytes: 1_156,
});

const SOURCE_BASE
  = "https://pubfs-rma.fpac.usda.gov/pub/Web_Data_Files/Summary_of_Business/state_county_crop";

const YEAR_PINS = Object.freeze([
  [2010, 2_500_751, "bd503a5248f33305e5d4d671430dada27e4d744c0f88d8f015db0e2e6f7f2185"],
  [2011, 2_520_317, "49e7561265ad28186e3ae9ac71e851ce65602f7ff119fd4fd2ff0419be14b500"],
  [2012, 2_533_852, "57a6f66f42221106e3f5e8e7c9be421aa4a12e3c5b1692ace9f0c88976712398"],
  [2013, 2_493_398, "23976514ea167556981069c4598c71062abbb918213452cf89211ac1c37889c7"],
  [2014, 2_819_059, "518813ddb001f23e6d439be1bf8d75899fd0e76403579bbfeac53ed2736269e2"],
  [2015, 2_892_668, "e331a07433b278b31588a6274753ea57f2387bb5654ca14a9723676d108b349e"],
  [2016, 2_803_274, "a7b37a94d979a6be52c048c2c4326baad370504953944cccf9b2720e4f9d022f"],
  [2017, 2_778_877, "692d10bd0a00e67b2baf772c1a2ba6e3d5c10b8085f81677ae430a495847c543"],
  [2018, 2_819_562, "383df0942103b66ec6d742c6c8e3c7118f42d136ea57ba6ceb231f9d77f9e210"],
  [2019, 2_968_987, "5a45243145abbbdde55a7b80641a0e9edfb9242142096c4354833ecf31b42636"],
  [2020, 2_758_685, "bb63824b45785d8e1fb0b39baaa689ca9f24ab1e71001242d3b9cc33611b341d"],
].map(([year, bytes, hash]) => Object.freeze({
  year,
  name: `sobcov_${year}.zip`,
  bytes,
  sha256: `sha256:${hash}`,
  url: `${SOURCE_BASE}/sobcov_${year}.zip`,
})));

export const RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE = Object.freeze({
  // Fixed after the bounded source acquisition completed and before the
  // canonical build/verification began. This is artifact identity, not a
  // caller-supplied wall clock.
  acquiredAt: "2026-08-22T09:00:00.000Z",
  canonicalGeneratedAt: RMA_TEMPORAL_LOSS_PRICING_CANONICAL.generatedAt,
  closedYears: Object.freeze(YEAR_PINS),
  layout: Object.freeze({
    name: "SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf",
    bytes: 84_719,
    sha256: "sha256:fd62972c8219e1e6cb90c4b1ae2f7ad3ada3e759c12c007b2b379da55e606307",
    url: `${SOURCE_BASE}/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf`,
  }),
  licenseMetadata: Object.freeze({
    name: "data-gov-summary-of-business.json",
    bytes: 1_280,
    sha256: "sha256:76ea9801f0a1ec21941e8c26bdcb6d8e22e73df2bca5c033e1fdf803939208fc",
    url: "https://catalog.data.gov/harvest_record/1b3ac58b-3b59-48a2-921a-d444fe407295/raw",
    catalogPage: "https://catalog.data.gov/dataset/summary-of-business",
    datasetIdentifier: "USDA-RMA-0004",
    accessLevel: "public",
    license: "https://creativecommons.org/publicdomain/zero/1.0/",
  }),
  officialLandingPage:
    "https://www.rma.usda.gov/tools-reports/summary-of-business/state-county-crop-summary-business",
  officialFinalityPage: "https://legacy.rma.usda.gov/data/sob.html",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_CANONICAL_BYTES = 64 * 1024;
const EXPECTED_FILES = Object.freeze([
  RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.layout.name,
  RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.licenseMetadata.name,
  ...YEAR_PINS.map((pin) => pin.name),
].sort());

function fail(code, detail = null) {
  throw new Error(detail === null ? `RMA_TEMPORAL_${code}` : `RMA_TEMPORAL_${code}:${detail}`);
}

function sha256Bytes(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function domainHash(domain, value) {
  return sha256Bytes(`${domain}\0${canonicalizeStrict(value)}`);
}

function canonicalTime(value) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) fail("TIME_INVALID");
  const normalized = new Date(value).toISOString();
  if (normalized !== value) fail("TIME_NON_CANONICAL");
  return normalized;
}

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function ratio(numerator, denominator, places = 8) {
  const top = BigInt(numerator);
  const bottom = BigInt(denominator);
  if (bottom <= 0n || top < 0n) return null;
  const scale = 10n ** BigInt(places);
  const rounded = (top * scale + bottom / 2n) / bottom;
  const whole = rounded / scale;
  if (places === 0) return whole.toString();
  return `${whole}.${(rounded % scale).toString().padStart(places, "0")}`;
}

function absolutePercentageError(actualNumerator, actualDenominator,
  predictedNumerator, predictedDenominator) {
  const actualN = BigInt(actualNumerator);
  const actualD = BigInt(actualDenominator);
  const predictedN = BigInt(predictedNumerator);
  const predictedD = BigInt(predictedDenominator);
  if (actualN <= 0n || actualD <= 0n || predictedD <= 0n) return null;
  const difference = actualN * predictedD - predictedN * actualD;
  return ratio(difference < 0n ? -difference : difference, actualN * predictedD, 8);
}

function indicationToActualRatio(actualNumerator, actualDenominator,
  predictedNumerator, predictedDenominator) {
  return ratio(BigInt(predictedNumerator) * BigInt(actualDenominator),
    BigInt(predictedDenominator) * BigInt(actualNumerator), 8);
}

function meanFixed(values, places = 8) {
  if (!values.length || values.some((value) => !new RegExp(`^\\d+\\.\\d{${places}}$`).test(value))) {
    return null;
  }
  const scale = 10n ** BigInt(places);
  const total = values.reduce((sumValue, value) => {
    const [whole, fraction] = value.split(".");
    return sumValue + BigInt(whole) * scale + BigInt(fraction);
  }, 0n);
  const rounded = (total + BigInt(values.length) / 2n) / BigInt(values.length);
  return `${rounded / scale}.${(rounded % scale).toString().padStart(places, "0")}`;
}

function stablePinnedFile(directory, pin) {
  if (!pin || !EXPECTED_FILES.includes(pin.name) || !Number.isSafeInteger(pin.bytes)
    || pin.bytes <= 0 || pin.bytes > MAX_FILE_BYTES || !HASH.test(pin.sha256)) {
    fail("SOURCE_PIN_INVALID", pin?.name ?? "unknown");
  }
  const target = path.join(directory, pin.name);
  const realDirectory = realpathSync(directory);
  const realParent = realpathSync(path.dirname(target));
  if (realParent !== realDirectory) fail("SOURCE_PATH_ESCAPE", pin.name);
  let descriptor = null;
  try {
    descriptor = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size !== BigInt(pin.bytes)) {
      fail("SOURCE_SIZE_INVALID", pin.name);
    }
    if ((before.mode & 0o077n) !== 0n) fail("SOURCE_FILE_MODE_INVALID", pin.name);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || sha256Bytes(bytes) !== pin.sha256) fail("SOURCE_CHANGED_OR_MISMATCHED", pin.name);
    return bytes;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function loadSourceDirectory(sourceDirectory) {
  const directory = path.resolve(sourceDirectory ?? "");
  if (!sourceDirectory || directory === path.parse(directory).root) fail("SOURCE_DIRECTORY_INVALID");
  const stat = lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory() || (stat.mode & 0o077) !== 0) {
    fail("SOURCE_DIRECTORY_INVALID");
  }
  const entries = readdirSync(directory, { withFileTypes: true });
  if (entries.some((entry) => !entry.isFile() || entry.isSymbolicLink())
    || canonicalizeStrict(entries.map((entry) => entry.name).sort())
      !== canonicalizeStrict(EXPECTED_FILES)) fail("SOURCE_FILE_SET_INVALID");
  const layout = stablePinnedFile(directory, RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.layout);
  const metadataBytes = stablePinnedFile(directory,
    RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.licenseMetadata);
  let metadata;
  try { metadata = JSON.parse(metadataBytes.toString("utf8")); }
  catch { fail("LICENSE_METADATA_JSON_INVALID"); }
  const expectedMetadata = RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.licenseMetadata;
  if (metadata.identifier !== expectedMetadata.datasetIdentifier
    || metadata.accessLevel !== expectedMetadata.accessLevel
    || metadata.license !== expectedMetadata.license
    || metadata.publisher?.name !== "U. S. Department of Agriculture"
    || !String(metadata.description).includes("older years is static and no longer updated")) {
    fail("LICENSE_METADATA_SEMANTICS_INVALID");
  }
  const years = new Map(YEAR_PINS.map((pin) => [pin.year, stablePinnedFile(directory, pin)]));
  return Object.freeze({ layout, metadataBytes, years });
}

function sum(rows, field) {
  return rows.reduce((total, row) => total + BigInt(row[field]), 0n);
}

function trailingPrediction(rows, targetIndex, window = 3) {
  const training = rows.slice(targetIndex - window, targetIndex);
  return Object.freeze({
    sourceYears: Object.freeze(training.map((row) => row.year)),
    numeratorIndemnityDollars: sum(training, "indemnityDollars").toString(),
    denominatorEarningPolicyCells: sum(training, "policiesEarningPremium").toString(),
  });
}

function temporalDiagnostics(annual) {
  const developmentYears = Object.freeze([2010, 2011, 2012, 2013, 2014, 2015, 2016, 2017]);
  const calibrationYears = Object.freeze([2018, 2019]);
  const testYears = Object.freeze([2020]);
  const method = "TRAILING_THREE_YEAR_EXPOSURE_WEIGHTED_AGGREGATE_LOSS_COST";
  const oneStep = [];
  for (let index = 3; index < annual.length; index += 1) {
    const prediction = trailingPrediction(annual, index);
    const actual = annual[index];
    oneStep.push(Object.freeze({
      targetYear: actual.year,
      sourceYears: prediction.sourceYears,
      indicatedLossCostPerEarningPolicyCellDollars: ratio(
        prediction.numeratorIndemnityDollars, prediction.denominatorEarningPolicyCells, 2),
      actualLossCostPerEarningPolicyCellDollars:
        actual.lossCostPerEarningPolicyCellDollars,
      absolutePercentageError: absolutePercentageError(
        actual.indemnityDollars, actual.policiesEarningPremium,
        prediction.numeratorIndemnityDollars, prediction.denominatorEarningPolicyCells),
      indicationToActualRatio: indicationToActualRatio(
        actual.indemnityDollars, actual.policiesEarningPremium,
        prediction.numeratorIndemnityDollars, prediction.denominatorEarningPolicyCells),
    }));
  }
  const holdout = oneStep.at(-1);
  const validation = oneStep.filter((row) => [2018, 2019].includes(row.targetYear));
  const next = trailingPrediction(annual, annual.length);
  return Object.freeze({
    method,
    methodSpecificationHash: domainHash("outsider:rma-temporal-method:v1", {
      method,
      windowYears: 3,
      numerator: "SUM_INDEMNITY_DOLLARS",
      denominator: "SUM_POLICIES_EARNING_PREMIUM",
      refit: "ONLY_YEARS_STRICTLY_BEFORE_TARGET_YEAR",
    }),
    methodWasNotSelectedByHoldoutSearch: true,
    deterministicRefitBenchmarkOnly: true,
    trainedModelArtifactProduced: false,
    oneStepRetrospectiveEvaluations: Object.freeze(oneStep),
    frozenSplit: Object.freeze({
      developmentYears,
      developmentYearsHash: domainHash("outsider:rma-temporal-split:development:v1",
        developmentYears),
      calibrationYears,
      calibrationYearsHash: domainHash("outsider:rma-temporal-split:calibration:v1",
        calibrationYears),
      testYears,
      testYearsHash: domainHash("outsider:rma-temporal-split:test:v1", testYears),
      splitPolicyHash: domainHash("outsider:rma-temporal-split-policy:v1", {
        developmentYears, calibrationYears, testYears,
        ordering: "COMMODITY_YEAR_ASCENDING_NO_RANDOM_SPLIT",
      }),
      prospectiveHoldout: false,
    }),
    calibration2018To2019: Object.freeze({
      evaluationCount: validation.length,
      meanAbsolutePercentageError: meanFixed(
        validation.map((row) => row.absolutePercentageError)),
      meanIndicationToActualRatio: meanFixed(
        validation.map((row) => row.indicationToActualRatio)),
    }),
    holdout2020: holdout,
    nextYearSourceDomainShadow: Object.freeze({
      targetYear: 2021,
      sourceYears: next.sourceYears,
      indicatedLossCostPerEarningPolicyCellDollars: ratio(
        next.numeratorIndemnityDollars, next.denominatorEarningPolicyCells, 2),
      nonzero: BigInt(next.numeratorIndemnityDollars) > 0n,
    }),
  });
}

function buildBody(source, generatedAt) {
  const annual = [];
  for (const pin of YEAR_PINS) {
    const parsed = buildRmaCropInsuranceExperience(source.years.get(pin.year), source.layout, {
      sourceObjectHash: pin.sha256,
      recordLayoutHash: RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.layout.sha256,
      generatedAt,
      commodityYear: pin.year,
      sourceUrl: pin.url,
      recordLayoutUrl: RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.layout.url,
    });
    if (parsed.source.commodityYear !== pin.year || parsed.accounting.sourceRows <= 0
      || parsed.accounting.duplicateSemanticCells !== 0) fail("YEAR_PARSE_INVALID", pin.year);
    annual.push(Object.freeze({
      year: pin.year,
      sourceObjectHash: pin.sha256,
      sourceObjectBytes: pin.bytes,
      extractedObjectHash: parsed.source.extractedObjectHash,
      extractedObjectBytes: parsed.source.extractedObjectBytes,
      rows: parsed.accounting.sourceRows,
      semanticCells: parsed.accounting.semanticCells,
      duplicateSemanticCells: parsed.accounting.duplicateSemanticCells,
      zeroReportedLossExposureCells: parsed.national.zeroReportedLossExposureCells,
      materialMissingMonetaryCells: parsed.national.materialMissingMonetaryCells,
      policyLossCountExceedsExposureCells:
        parsed.national.policyLossCountExceedsExposureCells,
      unitLossCountExceedsExposureCells: parsed.national.unitLossCountExceedsExposureCells,
      policiesEarningPremium: parsed.national.policiesEarningPremium,
      unitsEarningPremium: parsed.national.unitsEarningPremium,
      policiesIndemnified: parsed.national.policiesIndemnified,
      unitsIndemnified: parsed.national.unitsIndemnified,
      liabilityDollars: parsed.national.liabilityDollars,
      totalPremiumDollars: parsed.national.totalPremiumDollars,
      indemnityDollars: parsed.national.indemnityDollars,
      lossCostPerEarningPolicyCellDollars:
        parsed.national.historicalIndemnityPerEarningPolicyCellDollars,
      indemnityToPremiumRatio: parsed.national.historicalIndemnityToPremiumRatio,
      indemnityToLiabilityRatio: parsed.national.historicalIndemnityToLiabilityRatio,
      reportedLossFrequencyEligible: parsed.national.reportedLossPolicyCellRateModelEligible
        && parsed.national.reportedLossUnitCellRateModelEligible,
    }));
  }
  const temporal = temporalDiagnostics(annual);
  return Object.freeze({
    schema: RMA_TEMPORAL_LOSS_PRICING_SCHEMA,
    schemaVersion: "2.0.0",
    identity: Object.freeze({
      canonicalName: "RMA_TEMPORAL_LOSS_COST_2010_2020_FINAL_V2",
      version: "final-v2",
      generatedAtFixed: true,
      generatedAt: RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.canonicalGeneratedAt,
    }),
    headline: "RMA_SOURCE_DOMAIN_HISTORICAL_LOSS_COST_PER_EARNING_POLICY_CELL_BENCHMARK",
    generatedAt,
    source: Object.freeze({
      publisher: "USDA_RISK_MANAGEMENT_AGENCY",
      datasetIdentifier:
        RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.licenseMetadata.datasetIdentifier,
      sourceDomain: "US_FEDERAL_CROP_INSURANCE",
      closedPopulation: "ALL_PUBLISHED_2010_THROUGH_2020_SOB_COVERAGE_ROWS",
      years: Object.freeze(YEAR_PINS.map((pin) => pin.year)),
      sourceObjects: EXPECTED_FILES.length,
      sourceCommitmentHash: domainHash("outsider:rma-temporal-source:v1", {
        years: YEAR_PINS.map(({ year, bytes, sha256 }) => ({ year, bytes, sha256 })),
        layout: RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.layout,
        licenseMetadata: RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.licenseMetadata,
      }),
      officialLandingPage: RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.officialLandingPage,
      olderYearsStaticPerPublisherMetadata: true,
    }),
    rights: Object.freeze({
      accessLevel: "public",
      publishedLicense: "CC0_1_0",
      publishedLicenseUrl:
        RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.licenseMetadata.license,
      licenseMetadataBytesReplayed: true,
      sourceDomainAnalyticReusePermitted: true,
      grantsOutsiderIssuerOrPricingAuthority: false,
    }),
    annual: Object.freeze(annual),
    temporal,
    quality: Object.freeze({
      allYearsSourceReplayed: true,
      exactCommonRecordLayoutReplayed: true,
      allYearsHaveZeroDuplicateSemanticCells:
        annual.every((row) => row.duplicateSemanticCells === 0),
      allYearsHaveCompleteMaterialMonetaryAggregates:
        annual.every((row) => row.materialMissingMonetaryCells === 0),
      zeroLossExposureCellsPreserved: annual.every((row) => row.zeroReportedLossExposureCells > 0),
      frequencyQuarantinedYears: Object.freeze(annual.filter((row) => (
        !row.reportedLossFrequencyEligible)).map((row) => row.year)),
      individualClaimSeverityObserved: false,
      indemnityEstablishedAsCashPaidOrUltimateLoss: false,
      nominalDollarInflationAdjustmentApplied: false,
      annualMixShiftControlled: false,
      prospectiveOrTargetDomainHoldout: false,
    }),
    admission: Object.freeze({
      sourceDomainTemporalModelCandidateRows: annual.length,
      sourceDomainOfflineTrainingFeasible: true,
      sourceDomainBenchmarkFitted: true,
      sourceDomainFitYearCount: temporal.frozenSplit.developmentYears.length,
      sourceDomainCalibrationYearCount: temporal.frozenSplit.calibrationYears.length,
      sourceDomainTestYearCount: temporal.frozenSplit.testYears.length,
      sourceDomainShadowIndicationNonzero:
        temporal.nextYearSourceDomainShadow.nonzero,
      outsiderTargetDomainTransferEstablished: false,
      targetDomainModelTrained: false,
      trainingPermission: false,
      pricePermission: false,
      underwritingPermission: false,
      capitalPermission: false,
      coveragePermission: false,
      guaranteePermission: false,
      settlementPermission: false,
      automaticTraining: false,
      targetQuotedPrice: null,
      targetPriceState: "NULL_NOT_ZERO",
      decision: "ADMIT_RMA_SOURCE_DOMAIN_TEMPORAL_SHADOW_ONLY",
      missingForOutsiderPrice: Object.freeze([
        "TARGET_DOMAIN_PROSPECTIVE_EXPOSURE_AND_MONETARY_LOSS",
        "TARGET_COVERAGE_LIMIT_DEDUCTIBLE_EXPENSE_AND_CLAIM_DEFINITION",
        "TARGET_DOMAIN_TEMPORAL_HOLDOUT_AND_CALIBRATION",
        "INFLATION_MIX_AND_DEPENDENCE_MODEL",
        "CAPITAL_RISK_MARGIN_AND_ISSUER_AUTHORITY",
      ]),
    }),
  });
}

export function buildRmaTemporalLossPricingBenchmark(sourceDirectory) {
  const time = canonicalTime(
    RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.canonicalGeneratedAt);
  const body = buildBody(loadSourceDirectory(sourceDirectory), time);
  return Object.freeze({ ...body,
    artifactHash: domainHash(RMA_TEMPORAL_LOSS_PRICING_SCHEMA, body) });
}

function boundaryValid(artifact) {
  return exactKeys(artifact?.admission, [
    "sourceDomainTemporalModelCandidateRows", "sourceDomainOfflineTrainingFeasible",
    "sourceDomainBenchmarkFitted", "sourceDomainFitYearCount",
    "sourceDomainCalibrationYearCount", "sourceDomainTestYearCount",
    "sourceDomainShadowIndicationNonzero", "outsiderTargetDomainTransferEstablished",
    "targetDomainModelTrained", "trainingPermission", "pricePermission",
    "underwritingPermission", "capitalPermission", "coveragePermission",
    "guaranteePermission", "settlementPermission", "automaticTraining",
    "targetQuotedPrice", "targetPriceState", "decision", "missingForOutsiderPrice",
  ])
    && artifact?.rights?.accessLevel === "public"
    && artifact?.rights?.publishedLicense === "CC0_1_0"
    && artifact?.rights?.licenseMetadataBytesReplayed === true
    && artifact?.rights?.grantsOutsiderIssuerOrPricingAuthority === false
    && artifact?.quality?.individualClaimSeverityObserved === false
    && artifact?.quality?.prospectiveOrTargetDomainHoldout === false
    && artifact?.admission?.sourceDomainShadowIndicationNonzero === true
    && artifact?.admission?.sourceDomainBenchmarkFitted === true
    && artifact?.admission?.targetDomainModelTrained === false
    && ["trainingPermission", "pricePermission", "underwritingPermission",
      "capitalPermission", "coveragePermission", "guaranteePermission",
      "settlementPermission"].every((name) => (
      typeof artifact?.admission?.[name] === "boolean"
      && artifact.admission[name] === false))
    && typeof artifact?.admission?.automaticTraining === "boolean"
    && artifact?.admission?.automaticTraining === false
    && artifact?.admission?.targetQuotedPrice === null
    && artifact?.admission?.targetPriceState === "NULL_NOT_ZERO";
}

function structuralFailures(artifact) {
  const failures = [];
  try {
    if (!exactKeys(artifact, ["schema", "schemaVersion", "identity", "headline", "generatedAt",
      "source", "rights", "annual", "temporal", "quality", "admission", "artifactHash"])
      || artifact.schema !== RMA_TEMPORAL_LOSS_PRICING_SCHEMA
      || artifact.schemaVersion !== "2.0.0" || !HASH.test(artifact.artifactHash ?? "")
      || artifact.identity?.canonicalName !== "RMA_TEMPORAL_LOSS_COST_2010_2020_FINAL_V2"
      || artifact.identity?.version !== "final-v2"
      || artifact.identity?.generatedAtFixed !== true
      || artifact.identity?.generatedAt
        !== RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.canonicalGeneratedAt
      || artifact.generatedAt
        !== RMA_TEMPORAL_LOSS_PRICING_FROZEN_SOURCE.canonicalGeneratedAt
      || artifact.headline
        !== "RMA_SOURCE_DOMAIN_HISTORICAL_LOSS_COST_PER_EARNING_POLICY_CELL_BENCHMARK"
      || artifact.annual?.length !== YEAR_PINS.length) failures.push("SCHEMA_INVALID");
    const { artifactHash, ...body } = artifact;
    if (artifactHash !== domainHash(RMA_TEMPORAL_LOSS_PRICING_SCHEMA, body)) {
      failures.push("SELF_HASH_INVALID");
    }
  } catch (error) {
    failures.push(`STRUCTURE_FAILED:${error instanceof Error ? error.message : String(error)}`);
  }
  if (!boundaryValid(artifact)) failures.push("AUTHORITY_BOUNDARY_INVALID");
  return [...new Set(failures)];
}

export function verifyRmaTemporalLossPricingBenchmark(artifact) {
  const structure = structuralFailures(artifact);
  const failures = [...structure, "SOURCE_REPLAY_REQUIRED"];
  return Object.freeze({
    schema: "outsider/rma-temporal-loss-pricing-standalone-verification/v2",
    ok: false,
    failures: Object.freeze(failures),
    verificationLevel: structure.length === 0 ? "SOURCE_REPLAY_REQUIRED" : "INVALID",
    selfSealedEnvelopeStructurallyValid: structure.length === 0,
    sourceArtifactsReverified: false,
    temporalDerivationRecomputed: false,
    pricePermission: false,
    trainingPermission: false,
    automaticTraining: false,
    targetQuotedPrice: null,
    targetPriceState: "NULL_NOT_ZERO",
    outsiderAuthority: false,
  });
}

export function verifyRmaTemporalLossPricingBenchmarkWithSource(artifact, sourceDirectory) {
  const failures = structuralFailures(artifact);
  let expected = null;
  if (failures.length === 0) {
    try {
      expected = buildRmaTemporalLossPricingBenchmark(sourceDirectory);
      if (canonicalizeStrict(expected) !== canonicalizeStrict(artifact)) {
        failures.push("SOURCE_DERIVATION_INVALID");
      }
    } catch (error) {
      failures.push(`SOURCE_REPLAY_FAILED:${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return Object.freeze({
    schema: "outsider/rma-temporal-loss-pricing-verification-receipt/v2",
    ok: failures.length === 0,
    failures: Object.freeze([...new Set(failures)]),
    verificationLevel: failures.length === 0
      ? "FULL_OFFICIAL_USDA_RMA_TEMPORAL_SOURCE_REPLAYED" : "INVALID",
    sourceArtifactsReverified: failures.length === 0,
    temporalDerivationRecomputed: failures.length === 0,
    rightsMetadataReplayed: failures.length === 0,
    artifactHash: failures.length === 0 ? expected.artifactHash : null,
    sourceCommitmentHash: failures.length === 0 ? expected.source.sourceCommitmentHash : null,
    sourceDomainDecision: failures.length === 0 ? expected.admission.decision : null,
    currentChainArtifactsReplayed: false,
    currentChainAdmitted: false,
    currentChainDecision: "NOT_EVALUATED_BY_INDEPENDENT_RMA_SOURCE_LANE",
    pricePermission: false,
    trainingPermission: false,
    automaticTraining: false,
    targetQuotedPrice: null,
    targetPriceState: "NULL_NOT_ZERO",
    outsiderAuthority: false,
  });
}

export function buildRmaTemporalLossPricingSupersessionMarker() {
  return Object.freeze({
    schema: "outsider/local-artifact-supersession-pointer/v1",
    status: "SUPERSEDED_DO_NOT_USE_AS_CANONICAL",
    superseded: Object.freeze({
      path: "final-v1/artifact.json",
      canonicalRelease: RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.canonicalRelease,
      generatedAt: RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.generatedAt,
      artifactHash: RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.artifactHash,
      fileSha256: RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.artifactFileHash,
      fileBytes: RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.artifactFileBytes,
      reasonCodes: Object.freeze([
        "STANDALONE_SELF_SEAL_WAS_NOT_SOURCE_AUTHENTICATION",
        "PERMISSION_FIELDS_AND_POLICY_CELL_TERMINOLOGY_REQUIRES_FINAL_V2",
      ]),
    }),
    canonical: Object.freeze({
      path: "final-v2/artifact.json",
      canonicalRelease: RMA_TEMPORAL_LOSS_PRICING_CANONICAL.canonicalRelease,
      generatedAt: RMA_TEMPORAL_LOSS_PRICING_CANONICAL.generatedAt,
      artifactHash: RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactHash,
      fileSha256: RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactFileHash,
      fileBytes: RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactFileBytes,
      requiredVerificationLevel: "FULL_OFFICIAL_USDA_RMA_TEMPORAL_SOURCE_REPLAYED",
    }),
    oldArtifactBytesPreserved: true,
    sourceArtifactsReverifiedByThisMarker: false,
  });
}

function canonicalPinsFinalized() {
  const canonical = RMA_TEMPORAL_LOSS_PRICING_CANONICAL;
  return canonical.artifactFileBytes > 0
    && HASH.test(canonical.artifactHash)
    && HASH.test(canonical.artifactFileHash)
    && !canonical.artifactHash.endsWith("0".repeat(64))
    && !canonical.artifactFileHash.endsWith("0".repeat(64));
}

function markerPinsFinalized() {
  const prior = RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1;
  return prior.supersessionMarkerFileBytes > 0
    && HASH.test(prior.supersessionMarkerFileHash)
    && !prior.supersessionMarkerFileHash.endsWith("0".repeat(64));
}

function readExactRepositoryFile(filePath, repositoryRelativePath,
  expectedFileHash, expectedFileBytes, code, { requireMode0600 = false } = {}) {
  const resolved = path.resolve(filePath ?? "");
  const expectedPath = path.resolve(REPOSITORY_ROOT, repositoryRelativePath);
  if (!filePath || resolved !== expectedPath) fail(`${code}_PATH_MISMATCH`);
  let descriptor = null;
  try {
    descriptor = openSync(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n
      || before.size > BigInt(MAX_CANONICAL_BYTES)
      || requireMode0600 && (before.mode & 0o777n) !== 0o600n) {
      fail(`${code}_FILE_INVALID`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || bytes.length !== expectedFileBytes || sha256Bytes(bytes) !== expectedFileHash) {
      fail(`${code}_EXACT_BYTES_INVALID`);
    }
    return bytes;
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function readExactCanonicalArtifact(artifactPath) {
  if (!canonicalPinsFinalized()) fail("CANONICAL_PINS_NOT_FINALIZED");
  const resolved = path.resolve(artifactPath ?? "");
  const expectedPath = path.resolve(REPOSITORY_ROOT,
    RMA_TEMPORAL_LOSS_PRICING_CANONICAL.repositoryRelativePath);
  if (!artifactPath || resolved !== expectedPath) fail("CANONICAL_PATH_MISMATCH");
  let descriptor = null;
  try {
    descriptor = openSync(resolved, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n
      || before.size > BigInt(MAX_CANONICAL_BYTES)
      || (before.mode & 0o077n) !== 0n) fail("CANONICAL_FILE_INVALID");
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || bytes.length !== RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactFileBytes
      || sha256Bytes(bytes) !== RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactFileHash) {
      fail("CANONICAL_EXACT_BYTES_INVALID");
    }
    let artifact;
    try { artifact = JSON.parse(bytes.toString("utf8")); }
    catch { fail("CANONICAL_JSON_INVALID"); }
    if (artifact?.artifactHash !== RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactHash
      || artifact?.generatedAt !== RMA_TEMPORAL_LOSS_PRICING_CANONICAL.generatedAt) {
      fail("CANONICAL_IDENTITY_INVALID");
    }
    return Object.freeze({ artifact, resolved, bytes: bytes.length,
      fileHash: sha256Bytes(bytes) });
  } finally {
    if (descriptor !== null) closeSync(descriptor);
  }
}

function invalidCanonicalReceipt(error) {
  return Object.freeze({
    schema: "outsider/rma-temporal-loss-pricing-canonical-verification/v2",
    ok: false,
    failures: Object.freeze([
      error instanceof Error ? error.message : String(error),
      "SOURCE_REPLAY_REQUIRED",
    ]),
    verificationLevel: "INVALID",
    canonicalPathVerified: false,
    canonicalBytesVerified: false,
    sourceArtifactsReverified: false,
    pricePermission: false,
    trainingPermission: false,
    automaticTraining: false,
    targetQuotedPrice: null,
    targetPriceState: "NULL_NOT_ZERO",
    outsiderAuthority: false,
  });
}

export function verifyRmaTemporalLossPricingCanonical(artifactPath) {
  try {
    const loaded = readExactCanonicalArtifact(artifactPath);
    const standalone = verifyRmaTemporalLossPricingBenchmark(loaded.artifact);
    return Object.freeze({
      ...standalone,
      schema: "outsider/rma-temporal-loss-pricing-canonical-verification/v2",
      canonicalPathVerified: true,
      canonicalBytesVerified: true,
      canonicalPath: loaded.resolved,
      canonicalFileBytes: loaded.bytes,
      canonicalFileHash: loaded.fileHash,
    });
  } catch (error) {
    return invalidCanonicalReceipt(error);
  }
}

export function verifyRmaTemporalLossPricingCanonicalWithSource(
  artifactPath, sourceDirectory) {
  try {
    const loaded = readExactCanonicalArtifact(artifactPath);
    const replay = verifyRmaTemporalLossPricingBenchmarkWithSource(
      loaded.artifact, sourceDirectory);
    return Object.freeze({
      ...replay,
      canonicalPathVerified: true,
      canonicalBytesVerified: true,
      canonicalPath: loaded.resolved,
      canonicalGeneratedAt: RMA_TEMPORAL_LOSS_PRICING_CANONICAL.generatedAt,
      canonicalFileBytes: loaded.bytes,
      canonicalFileHash: loaded.fileHash,
    });
  } catch (error) {
    return invalidCanonicalReceipt(error);
  }
}

export function verifyRmaTemporalLossPricingSupersessionMarker(markerPath) {
  try {
    if (!markerPinsFinalized()) fail("SUPERSESSION_MARKER_PINS_NOT_FINALIZED");
    const markerBytes = readExactRepositoryFile(markerPath,
      RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.supersessionMarkerRepositoryRelativePath,
      RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.supersessionMarkerFileHash,
      RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.supersessionMarkerFileBytes,
      "SUPERSESSION_MARKER", { requireMode0600: true });
    let marker;
    try { marker = JSON.parse(markerBytes.toString("utf8")); }
    catch { fail("SUPERSESSION_MARKER_JSON_INVALID"); }
    if (canonicalizeStrict(marker)
      !== canonicalizeStrict(buildRmaTemporalLossPricingSupersessionMarker())) {
      fail("SUPERSESSION_MARKER_PROJECTION_INVALID");
    }
    const oldBytes = readExactRepositoryFile(
      path.resolve(REPOSITORY_ROOT,
        RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.repositoryRelativePath),
      RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.repositoryRelativePath,
      RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.artifactFileHash,
      RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.artifactFileBytes,
      "SUPERSEDED_V1", { requireMode0600: true });
    const oldArtifact = JSON.parse(oldBytes.toString("utf8"));
    if (oldArtifact.artifactHash
      !== RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.artifactHash) {
      fail("SUPERSEDED_V1_SEMANTIC_HASH_INVALID");
    }
    readExactCanonicalArtifact(path.resolve(REPOSITORY_ROOT,
      RMA_TEMPORAL_LOSS_PRICING_CANONICAL.repositoryRelativePath));
    return Object.freeze({
      ok: true,
      verificationLevel:
        "PINNED_0600_SCHEMA_SUPPORTED_MARKER_AND_V1_V2_EXACT_IDENTITIES",
      markerSchema: marker.schema,
      markerExactBytesVerified: true,
      markerMode0600Verified: true,
      markerFileHash:
        RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.supersessionMarkerFileHash,
      markerFileBytes:
        RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.supersessionMarkerFileBytes,
      supersededArtifactBytesPreserved: true,
      supersededArtifactHash: RMA_TEMPORAL_LOSS_PRICING_SUPERSEDED_V1.artifactHash,
      replacementArtifactHash: RMA_TEMPORAL_LOSS_PRICING_CANONICAL.artifactHash,
      sourceArtifactsReverifiedByThisMarker: false,
      outsiderAuthority: false,
    });
  } catch (error) {
    return Object.freeze({
      ok: false,
      verificationLevel: "SUPERSESSION_MARKER_INVALID",
      markerExactBytesVerified: false,
      markerMode0600Verified: false,
      supersededArtifactBytesPreserved: false,
      sourceArtifactsReverifiedByThisMarker: false,
      outsiderAuthority: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
