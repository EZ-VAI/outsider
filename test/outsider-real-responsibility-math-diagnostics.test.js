import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildRealResponsibilityMathDiagnosticsCandidateFromSources,
  buildRealResponsibilityMathDiagnosticsFromSources,
  buildRealResponsibilityMathDiagnosticsProjection,
  REAL_RESPONSIBILITY_FACTOR_CATEGORIES,
  REAL_RESPONSIBILITY_FACTOR_DICTIONARY,
  REAL_RESPONSIBILITY_MATH_FROZEN_CATALOG,
  REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL,
  REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_SCHEMA,
  verifyRealResponsibilityMathDiagnostics,
  verifyRealResponsibilityMathDiagnosticsAgainstSources,
} from "../src/outsider-real-responsibility-math-diagnostics.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const p = (...parts) => path.join(ROOT, ...parts);

function officialSources() {
  const wave5 = p("artifacts/public-evidence-wave5-20260821/source");
  const aiid = p("artifacts/reality-consequence-aiid-20260817");
  const cas = p("artifacts/stage234-cas-schedule-p-2025/source");
  return {
    responsibilityFlywheel: {
      artifactPath:
        p("artifacts/real-case-responsibility-flywheel-20260828/final-v16/flywheel.json"),
      catalogArtifactPath:
        p("artifacts/real-case-gap-evidence-catalog-20260828/final-v18/catalog.json"),
    },
    temporalAudit: {
      manifestPath:
        p("artifacts/stage0-source-temporal-audit-20260828/final-v2/manifest.json"),
    },
    progress: {
      artifactPath: p("artifacts/real-evidence-stage-progress-20260821/final-v1/progress.json"),
      sources: {
        wave5: {
          traceCommonsDirectory: path.join(wave5, "trace-commons"),
          robustRosDirectory: path.join(wave5, "robust-ros"),
        },
        osha: {
          archivePath: p("artifacts/reality-consequence-osha-20260821/January2015toNovember2025.zip"),
        },
        aiid: {
          archivePath: path.join(aiid, "backup-20260817101120.tar.bz2"),
          termsSnapshotPath: path.join(aiid, "terms-of-use-20260821.html"),
        },
        institutionalRemedies: {
          sourceDirectory: p("artifacts/reality-institutional-ai-remedies-20260821/source"),
        },
        rma: {
          archivePath: p("artifacts/stage234-rma-crop-insurance-2024/source/sobcov_2024.zip"),
          recordLayoutPath: p("artifacts/stage234-rma-crop-insurance-2024/source/SOB_State_County_Crop_with_Coverage_Level_1989_Forward.pdf"),
        },
        cas: { sourceDirectory: cas, sourcePagePath: path.join(cas, "source-page.html") },
      },
    },
    wave5Intake: {
      artifactPath:
        p("artifacts/public-evidence-wave5-intake-20260821/final-v3/snapshot.json"),
      sourceDirectory: wave5,
    },
    fdaMaude: {
      artifactPath: p("artifacts/fda-maude-outcome-sensing-20260821/final-v2/outcome-sensing.json"),
      sourceDirectory: p("artifacts/fda-maude-outcome-sensing-20260821/source"),
    },
    caDmvAv: {
      artifactPath: p("artifacts/ca-dmv-av-outcome-sensing-20260821/final-v3/outcome-sensing.json"),
      sourceDirectory: p("artifacts/ca-dmv-av-outcome-sensing-20260821/source"),
    },
    institutionalCapitalClaims: {
      artifactPath: p("artifacts/institutional-capital-claims-20260828/final-v4/evidence.json"),
      sourceDirectory: p("artifacts/institutional-capital-claims-20260821/source"),
    },
    femaRealCases: {
      artifactPath: p("artifacts/fema-real-cases-20260821/evidence-v1.0.0.json"),
      sourceDirectory: p("artifacts/fema-real-cases-20260821/source-v3"),
    },
    remedyPaymentRecovery: {
      artifactPath: p("artifacts/remedy-payment-recovery-20260821/evidence-book-final-v1/book.json"),
      sourceDirectory: p("artifacts/remedy-payment-recovery-20260821/source"),
    },
    ntsbBlsOutcome: {
      artifactPath: p("artifacts/ntsb-bls-real-outcome-20260828/final-v2-canonical-hardening/outcome-evidence.json"),
      sourceDirectory: p("artifacts/ntsb-bls-real-outcome-20260821/source"),
    },
    judgmentFundGao: {
      artifactPath:
        p("artifacts/judgment-fund-gao-real-cases-20260821/final-v1/evidence.json"),
      sourceDirectory: p("artifacts/judgment-fund-gao-real-cases-20260821/source"),
    },
    ncuaPbgcMsha: {
      artifactPath:
        p("artifacts/ncua-pbgc-msha-real-experience-20260821/final-v1/evidence.json"),
      sourceDirectory: p("artifacts/ncua-pbgc-msha-real-experience-20260821/source"),
    },
    cdiNcigf: {
      artifactPath:
        p("artifacts/cdi-ncigf-real-rate-guaranty-20260821/final-v1/evidence.json"),
      sourceDirectory: p("artifacts/cdi-ncigf-real-rate-guaranty-20260821/source"),
    },
    fraPhmsa: {
      artifactPath: p("artifacts/fra-phmsa-safety-20260821/final-v2/evidence.json"),
      sourceDirectory: p("artifacts/fra-phmsa-safety-20260821/source-v2"),
    },
    nhtsaRecallRemedy: {
      artifactPath:
        p("artifacts/nhtsa-recall-remedy-evidence-20260821/final-v6/evidence.json"),
      sourceDirectory: p("artifacts/nhtsa-recall-remedy-evidence-20260821/source"),
    },
    bridgeDataV2: {
      artifactPath:
        p("artifacts/bridgedata-v2-training-evidence-20260822/final-v5/evidence.json"),
      sourceDirectory: p("artifacts/bridgedata-v2-training-evidence-20260822/source-v1"),
    },
    waymoSafetyImpact: {
      artifactPath:
        p("artifacts/waymo-safety-impact-evidence-20260822/final-v5/evidence.json"),
      sourceDirectory: p("artifacts/waymo-safety-impact-evidence-20260822/source-v1"),
    },
    clinicalTrials: {
      artifactPath:
        p("artifacts/clinicaltrials-posted-results-evidence-20260822/final-v3/evidence.json"),
      sourceDirectory:
        p("artifacts/clinicaltrials-posted-results-evidence-20260822/source"),
    },
  };
}

const SOURCES = officialSources();
const HAS_SOURCES = [
  SOURCES.responsibilityFlywheel.artifactPath,
  SOURCES.responsibilityFlywheel.catalogArtifactPath,
  SOURCES.temporalAudit.manifestPath,
  SOURCES.progress.artifactPath,
  SOURCES.wave5Intake.artifactPath,
  SOURCES.wave5Intake.sourceDirectory,
  SOURCES.progress.sources.wave5.traceCommonsDirectory,
  SOURCES.progress.sources.wave5.robustRosDirectory,
  SOURCES.progress.sources.osha.archivePath,
  SOURCES.progress.sources.aiid.archivePath,
  SOURCES.progress.sources.aiid.termsSnapshotPath,
  SOURCES.progress.sources.institutionalRemedies.sourceDirectory,
  SOURCES.progress.sources.rma.archivePath,
  SOURCES.progress.sources.rma.recordLayoutPath,
  SOURCES.progress.sources.cas.sourceDirectory,
  SOURCES.progress.sources.cas.sourcePagePath,
  SOURCES.fdaMaude.artifactPath, SOURCES.fdaMaude.sourceDirectory,
  SOURCES.caDmvAv.artifactPath, SOURCES.caDmvAv.sourceDirectory,
  SOURCES.institutionalCapitalClaims.artifactPath,
  SOURCES.institutionalCapitalClaims.sourceDirectory,
  SOURCES.femaRealCases.artifactPath, SOURCES.femaRealCases.sourceDirectory,
  SOURCES.remedyPaymentRecovery.artifactPath,
  SOURCES.remedyPaymentRecovery.sourceDirectory,
  SOURCES.ntsbBlsOutcome.artifactPath, SOURCES.ntsbBlsOutcome.sourceDirectory,
  SOURCES.judgmentFundGao.artifactPath, SOURCES.judgmentFundGao.sourceDirectory,
  SOURCES.ncuaPbgcMsha.artifactPath, SOURCES.ncuaPbgcMsha.sourceDirectory,
  SOURCES.cdiNcigf.artifactPath, SOURCES.cdiNcigf.sourceDirectory,
  SOURCES.fraPhmsa.artifactPath, SOURCES.fraPhmsa.sourceDirectory,
  SOURCES.nhtsaRecallRemedy.artifactPath, SOURCES.nhtsaRecallRemedy.sourceDirectory,
  SOURCES.bridgeDataV2.artifactPath, SOURCES.bridgeDataV2.sourceDirectory,
  SOURCES.waymoSafetyImpact.artifactPath, SOURCES.waymoSafetyImpact.sourceDirectory,
  SOURCES.clinicalTrials.artifactPath, SOURCES.clinicalTrials.sourceDirectory,
].every(existsSync);

function domainDigest(domain, value) {
  return `sha256:${createHash("sha256")
    .update(`${domain}\0${canonicalizeStrict(value)}`, "utf8").digest("hex")}`;
}

function resealArtifact(value) {
  const copy = structuredClone(value);
  delete copy.artifactHash;
  copy.artifactHash = domainDigest(REAL_RESPONSIBILITY_MATH_DIAGNOSTICS_SCHEMA, copy);
  return copy;
}

function resealDictionary(value) {
  const copy = structuredClone(value);
  delete copy.dictionaryHash;
  copy.dictionaryHash = domainDigest("outsider/real-responsibility-factor-dictionary/v1", copy);
  return copy;
}

test("CLI documents source-aware build and verify without claiming target authority", () => {
  const script = p("scripts/real-responsibility-math-diagnostics.mjs");
  const help = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /same invocation/u);
  assert.match(help.stdout, /frozen flywheel canonical/u);
  assert.match(help.stdout, /--flywheel-artifact/u);
  assert.match(help.stdout, /--catalog-artifact/u);
  assert.match(help.stdout, /sixteen.*twenty-six/u);
  assert.match(help.stdout, /--wave5-intake-artifact/u);
  assert.match(help.stdout, /no global score/u);
  assert.match(help.stdout, /no .*price.*guarantee.*custody/u);
  assert.match(help.stdout, /--judgment-gao-artifact/u);
  assert.match(help.stdout, /--ncua-pbgc-msha-artifact/u);
  assert.match(help.stdout, /--cdi-ncigf-artifact/u);
  assert.match(help.stdout, /--fra-phmsa-artifact/u);
  assert.match(help.stdout, /--nhtsa-recall-remedy-artifact/u);
  assert.match(help.stdout, /--bridgedata-v2-artifact/u);
  assert.match(help.stdout, /--waymo-safety-impact-artifact/u);
  assert.match(help.stdout, /--clinicaltrials-artifact/u);
  assert.match(help.stdout, /only accepted math generated-at value/u);
  const invalid = spawnSync(process.execPath, [script, "build", "--out", "x"],
    { encoding: "utf8" });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /ARGUMENT_REQUIRED:--flywheel-artifact/u);
});

test("typed retrospective dictionary covers every requested factor family without target promotion", () => {
  const dictionary = REAL_RESPONSIBILITY_FACTOR_DICTIONARY;
  assert.match(dictionary.dictionaryHash, /^sha256:[a-f0-9]{64}$/u);
  assert.deepEqual(dictionary.categories, REAL_RESPONSIBILITY_FACTOR_CATEGORIES);
  assert.equal(dictionary.factors.length, 102);
  assert.equal(new Set(dictionary.factors.map((row) => row.factorId)).size,
    dictionary.factors.length);
  assert.deepEqual([...new Set(dictionary.factors.map((row) => row.category))].sort(),
    [...REAL_RESPONSIBILITY_FACTOR_CATEGORIES].sort());
  assert.equal(dictionary.factors.every((row) => row.retrospective === true
    && row.targetDomainTransferEstablished === false
    && row.targetPredictorEligible === false && row.targetPriceEligible === false
    && row.crossDomainPoolingPermitted === false
    && row.qualityPrerequisites.some((gate) => gate.dimension === "byteIdentity")
    && row.qualityPrerequisites.some((gate) => gate.dimension === "sourceProvenance")), true);
  assert.equal(dictionary.factors.filter((row) => row.outcomeDerived)
    .every((row) => row.preActionAvailable === false), true);
  assert.equal(dictionary.factors.every((row) => new Set(
    row.qualityPrerequisites.map((gate) => gate.dimension)).size
    === row.qualityPrerequisites.length), true);
  assert.equal(dictionary.factors.filter((row) =>
    row.sourceDomain === "FRA_FORM54_FORM55_2015_2019").length, 7);
  assert.equal(dictionary.factors.filter((row) =>
    row.sourceDomain === "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE").length, 0);
  assert.equal(dictionary.factors.filter((row) =>
    row.sourceDomain === "NHTSA_RECALL_REMEDY_2026_08_21").length, 7);
  assert.equal(dictionary.factors.filter((row) =>
    row.sourceDomain === "WAYMO_RIDER_ONLY_ROAD_OPERATIONS").length, 7);
  const bridgeFactors = dictionary.factors.filter((row) =>
    row.sourceDomain === "BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORIES");
  assert.equal(bridgeFactors.length, 2);
  assert.equal(bridgeFactors.every((row) => row.outcomeDerived === false
    && row.preActionAvailable === false
    && row.admittedUse === "SOURCE_DOMAIN_TRAINING_CANDIDATE_QUALITY_DIAGNOSTIC"
    && row.targetPredictorEligible === false), true);
  const clinicalFactors = dictionary.factors.filter((row) =>
    row.sourceDomain === "CLINICALTRIALS_GOV_POSTED_RESULTS_2026_07_01");
  assert.equal(clinicalFactors.length, 3);
  assert.equal(clinicalFactors.every((row) => row.targetPredictorEligible === false
    && row.targetPriceEligible === false && row.crossDomainPoolingPermitted === false), true);
  const wave5Factors = dictionary.factors.filter((row) =>
    row.sourceDomain === "WAVE5_REAL_SOFTWARE_SOURCE_AWARE_TAXONOMY");
  assert.equal(wave5Factors.length, 3);
  assert.equal(wave5Factors.every((row) => row.outcomeDerived === false
    && row.preActionAvailable === false
    && row.targetPredictorEligible === false
    && row.targetPriceEligible === false
    && row.crossDomainPoolingPermitted === false), true);
});

test("fixed projection retains domain units, empirical summaries, censoring, and denominator mismatches", () => {
  const artifact = buildRealResponsibilityMathDiagnosticsProjection();
  assert.equal(artifact.artifactLifecycle.canonicalRelease, "final-v14");
  assert.equal(artifact.artifactLifecycle.canonicalRepositoryRelativePath,
    "artifacts/real-responsibility-math-diagnostics-20260828/final-v14/diagnostics.json");
  const checked = verifyRealResponsibilityMathDiagnostics(artifact);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "STRUCTURE_ONLY_FIXED_PROJECTION_NO_SOURCE_AUTHENTICATION");
  assert.equal(checked.requiredUpstreamArtifactCount, 16);
  assert.equal(checked.typedFactorCount, 102);
  assert.equal(checked.sourceDomainDiagnosticCount, 29);
  assert.equal(checked.sourceDomainRetrospectiveFactorsAdmitted, 102);
  assert.equal(checked.targetDomainFactorsAdmitted, 0);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.frozenFlywheelCanonicalStableRead, false);
  assert.equal(checked.frozenFlywheelCanonicalFileHashVerified, false);
  assert.equal(checked.frozenFlywheelExactlyRebuiltFromSources, false);
  assert.equal(checked.frozenCatalogCanonicalStableRead, false);
  assert.equal(checked.frozenCatalogCanonicalFileHashVerified, false);
  assert.equal(checked.frozenCatalogCodeProjectionMatched, false);
  assert.deepEqual(artifact.upstreamFlywheelReceipt.frozenCatalog,
    REAL_RESPONSIBILITY_MATH_FROZEN_CATALOG);
  const wave5 = artifact.sourceDomainDiagnostics.wave5SourceAwareTaxonomy;
  assert.equal(wave5.exactSourceBinding.sourceNativeRows, 49);
  assert.equal(wave5.traceSessionShape.rows, 3);
  assert.equal(wave5.rosBugFixMechanismTaxonomy.rows, 46);
  assert.equal(wave5.traceSessionShape.wholeSessionProjectionIsPreActionAvailable, false);
  assert.equal(wave5.rightsAndAdmissionBoundary.preActionAvailableRows, 0);
  assert.equal(wave5.rightsAndAdmissionBoundary.trainerRowsEnqueued, 0);
  assert.equal(wave5.rightsAndAdmissionBoundary.targetPredictorEligibleRows, 0);
  assert.equal(wave5.rightsAndAdmissionBoundary.targetPrice, null);
  assert.equal(wave5.factorUseBoundary.behaviorModelRowsAdded, 0);
  assert.deepEqual(artifact.upstreamFlywheelReceipt.frozenCanonical,
    REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL);
  assert.equal(artifact.upstreamFlywheelReceipt.artifactHash,
    REAL_RESPONSIBILITY_MATH_FROZEN_FLYWHEEL.artifactHash);
  assert.notEqual(artifact.generatedAt,
    artifact.upstreamFlywheelReceipt.frozenCanonical.generatedAt);
  assert.equal(artifact.sourceDomainDiagnostics.nfipPaymentAndExposure
    .paymentAccounting.grossMinusRecordedRecoveryEqualsNet, true);
  assert.equal(artifact.sourceDomainDiagnostics.nfipPaymentAndExposure
    .paymentAccounting.recordedRecoveryShareOfGross, "0.00036115");
  assert.equal(artifact.sourceDomainDiagnostics.nfipPaymentAndExposure
    .denominatorBoundary.currentExposureMatchedToHistoricalLoss, false);
  assert.equal(artifact.sourceDomainDiagnostics.nfipPaymentAndExposure
    .denominatorBoundary.claimFrequency, null);
  assert.equal(artifact.sourceDomainDiagnostics.femaAppealAdjudication
    .rightCensoring.pendingRightCensoredFraction, "0.03186559");
  assert.equal(artifact.sourceDomainDiagnostics.femaAppealAdjudication
    .pendingAllocationBounds.allPublisherRowFractionLowerIfNoPendingRowJoinsSet,
  "0.15874855");
  assert.equal(artifact.sourceDomainDiagnostics.femaAppealAdjudication
    .pendingAllocationBounds.allPublisherRowFractionUpperIfEveryPendingRowJoinsSet,
  "0.19061414");
  assert.equal(artifact.sourceDomainDiagnostics.femaAppealAdjudication
    .pendingAllocationBounds.boundsAreMeritsSuccessRate, false);
  assert.equal(artifact.sourceDomainDiagnostics.rmaAggregateIndemnity
    .countQuarantine.reportedLossFrequency, null);
  assert.equal(artifact.sourceDomainDiagnostics.casReserveBacktest
    .boundary.tailFactorFitted, false);
  assert.equal(artifact.sourceDomainDiagnostics.casReserveBacktest
    .accounting.incompleteTenByTenTriangleFraction, "0.13860104");
  assert.equal(artifact.sourceDomainDiagnostics.dmvRegimeExposure
    .collisionBoundary.collisionRate, null);
  assert.equal(artifact.sourceDomainDiagnostics.maudePassiveOutcomeSensing
    .outcomes.eventTypeCountsEqualEffectiveReportKeys, true);
  assert.equal(artifact.sourceDomainDiagnostics.maudePassiveOutcomeSensing
    .missingness.numberDevicesMissingFraction, "1.00000000");
  assert.equal(artifact.sourceDomainDiagnostics.maudePassiveOutcomeSensing
    .boundary.incidenceRate, null);
  assert.equal(artifact.sourceDomainDiagnostics.secCapitalReserveAndCustody
    .capitalScope.surplusToRbcRatio, null);
  assert.equal(artifact.sourceDomainDiagnostics.ftcPaymentRecovery
    .caseCashedPercentNearestRank.p50, 73.3);
  assert.equal(artifact.sourceDomainDiagnostics.cpscRemedyMissingness
    .missingCoreFieldFraction, "0.55263158");
  assert.equal(artifact.sourceDomainDiagnostics.cfpbPaymentAllocation
    .pooledWithFtcOrCpsc, false);
  assert.equal(artifact.sourceDomainDiagnostics.treasuryCollateralCustody
    .executionBoundary.outsiderCustodyAuthorityEstablished, false);
  assert.equal(artifact.sourceDomainDiagnostics.actuarialPracticeBoundary
    .scope.professionalReviewOfExactOutsiderModelCompleted, false);
  assert.equal(artifact.sourceDomainDiagnostics.ntsbCompletedInvestigationOutcome
    .selection.selectedCompletedCases, 6);
  assert.equal(artifact.sourceDomainDiagnostics.ntsbCompletedInvestigationOutcome
    .findingAndFinality.determinesRightsOrLiabilities, false);
  assert.equal(artifact.sourceDomainDiagnostics.blsOccupationalOutcomeExposure
    .soiiPrivateIndustry.independentlyRecomputedRateSixDecimals, "2.335671");
  assert.equal(artifact.sourceDomainDiagnostics.blsOccupationalOutcomeExposure
    .cfoi.displayed5070DividedByPublishedHoursToRecomputeRate, false);
  assert.equal(artifact.sourceDomainDiagnostics.blsOccupationalOutcomeExposure
    .inferenceBoundary.ntsbCasesUsedAsNumerator, false);
  assert.equal(artifact.sourceDomainDiagnostics.treasuryJudgmentFundPayment
    .componentAccounting.totalPublishedAmountCents, "317493066734");
  assert.equal(artifact.sourceDomainDiagnostics.treasuryJudgmentFundPayment
    .componentAccounting.componentsEqualTotal, true);
  assert.equal(artifact.sourceDomainDiagnostics.treasuryJudgmentFundPayment
    .missingnessRevisionAndDedup.zeroTotalPublishedAmountRowFraction, "0.67884115");
  assert.equal(artifact.sourceDomainDiagnostics.treasuryJudgmentFundPayment
    .publicationTiming.thisIsEventToPaymentLatency, false);
  assert.equal(artifact.sourceDomainDiagnostics.treasuryJudgmentFundPayment
    .amountAndDenominatorBoundary.uniqueClaimCount, null);
  assert.equal(artifact.sourceDomainDiagnostics.treasuryJudgmentFundPayment
    .certificationCustodyAndConsequenceBoundary.offsetLayersKeptSeparate, true);
  assert.equal(artifact.sourceDomainDiagnostics.gaoBidProtestAdjudication
    .meritsComposition.exactSustainFraction, "0.13947368");
  assert.equal(artifact.sourceDomainDiagnostics.gaoBidProtestAdjudication
    .publishedRatesWithUnobservedOperands.effectivenessNumerator, null);
  assert.equal(artifact.sourceDomainDiagnostics.gaoBidProtestAdjudication
    .annualAggregate.closureRate, null);
  assert.equal(artifact.sourceDomainDiagnostics.gaoBidProtestAdjudication
    .consequenceAndFinality.nonimplementationRate, null);
  assert.equal(artifact.sourceDomainDiagnostics.ncuaAuditedCapitalAndLossBoundary
    .auditedFinancialPosition.assetsMinusLiabilitiesEqualsNetPosition, true);
  assert.equal(artifact.sourceDomainDiagnostics.ncuaAuditedCapitalAndLossBoundary
    .preliminaryComparator.admittedAsAuditedInput, false);
  assert.equal(artifact.sourceDomainDiagnostics.ncuaAuditedCapitalAndLossBoundary
    .reserveAndLossAccounting.reserveEqualsPaidClaimLoss, false);
  assert.equal(artifact.sourceDomainDiagnostics.pbgcPaymentAndDenominatorBoundary
    .availabilityFrame.commonCrossYearDenominatorAdmitted, false);
  assert.equal(artifact.sourceDomainDiagnostics.pbgcPaymentAndDenominatorBoundary
    .multiemployerProgramSeparation.pooledPaymentAmount, null);
  assert.equal(artifact.sourceDomainDiagnostics.pbgcPaymentAndDenominatorBoundary
    .recoveryBoundary.sfaRepaymentIsOrdinaryClaimRecovery, false);
  assert.equal(artifact.sourceDomainDiagnostics.mshaOutcomeExposureMismatch
    .temporalAndDenominatorBoundary.outcomeQuarter, "2026_Q3_RIGHT_CENSORED");
  assert.equal(artifact.sourceDomainDiagnostics.mshaOutcomeExposureMismatch
    .temporalAndDenominatorBoundary.exposureQuarter, "2026_Q2");
  assert.equal(artifact.sourceDomainDiagnostics.mshaOutcomeExposureMismatch
    .temporalAndDenominatorBoundary.derivedCurrentIncidenceRate, null);
  assert.equal(artifact.sourceDomainDiagnostics.cdiRateFilingStatusAndReconciliation
    .filingStatusChain.acceptedMeansApproved, false);
  assert.equal(artifact.sourceDomainDiagnostics.cdiRateFilingStatusAndReconciliation
    .filedExperienceReconciliation.publishedLossTotalShortByUsd, "1");
  assert.equal(artifact.sourceDomainDiagnostics.cdiRateFilingStatusAndReconciliation
    .filedExperienceReconciliation.rowSumTrendedLossAndDcceUsd, "183934790");
  assert.equal(artifact.sourceDomainDiagnostics.ncigfAssessmentCapacityBoundary
    .assessmentReconciliation.authorizedMinusRefundsEqualsNet, true);
  assert.equal(artifact.sourceDomainDiagnostics.ncigfAssessmentCapacityBoundary
    .publisherQualification.independentlyVerifiedByNcigf, false);
  assert.equal(artifact.sourceDomainDiagnostics.ncigfAssessmentCapacityBoundary
    .quarterlyCapacity.capacityIsOutsiderCapital, false);
  const fra = artifact.sourceDomainDiagnostics.fraCalendarOutcomeExposureRates;
  assert.equal(fra.annual.length, 5);
  assert.equal(fra.annual[0].year, "2015");
  assert.equal(fra.annual[0].incidentRatePerMillionTrainMilesRecomputed,
    "2.865982564");
  assert.equal(fra.annual.every((row) => row.incidentRateAgreesWithSourceAdapter
    && row.fatalityRateAgreesWithSourceAdapter
    && row.injuryRateAgreesWithSourceAdapter
    && row.reportedDamageRateAgreesWithSourceAdapter), true);
  assert.equal(fra.pooled.incidentRatePerMillionTrainMilesRecomputed, "2.960562491");
  assert.equal(fra.pooled.reportedDamageDollarsPerTrainMileRecomputed, "0.445795361");
  assert.equal(fra.pooled.annualIncidentCountsEqualPooled, true);
  assert.equal(fra.populationThresholdAndCalendarFrame
    .belowThresholdAccountableAccidentsIncluded, false);
  assert.equal(fra.revisionDedupAndDependence.identicalDuplicateRowsRemoved, 1);
  assert.equal(fra.revisionDedupAndDependence.yearsAndOperatorsAssumedIid, false);
  assert.equal(fra.reportedDamageAndLossBoundary.paidLoss, false);
  assert.equal(fra.reportedDamageAndLossBoundary.incurredLoss, false);
  assert.equal(fra.reportedDamageAndLossBoundary.ultimateLoss, false);
  assert.equal(fra.reportedDamageAndLossBoundary.addedToSourceDomainLossFragments, false);
  assert.equal(fra.inferenceBoundary.targetDomainTransferPermitted, false);
  const phmsa = artifact.sourceDomainDiagnostics.phmsaCapturedSourceReceiptDeferral;
  assert.equal(phmsa.captureIdentity.realCapturedSourceReceiptRecognized, true);
  assert.equal(phmsa.capturedRowProfileNotOutcomeModel.capturedRows, 1589);
  assert.equal(phmsa.capturedRowProfileNotOutcomeModel.capturedRowsAreUniqueIncidents, false);
  assert.equal(phmsa.revisionAndPopulationMissingness.publisherVersionIdPinned, false);
  assert.equal(phmsa.denominatorAndRightsBoundary.mileageExposureCaptured, false);
  assert.equal(phmsa.denominatorAndRightsBoundary.publicDomainOrReuseLicenseBytePinned,
    false);
  assert.equal(phmsa.zeroAdmissionBoundary.typedFactorDefinitions, 0);
  assert.equal(phmsa.zeroAdmissionBoundary.outcomeOrActuarialModelInputAdmitted, false);
  assert.equal(phmsa.zeroAdmissionBoundary.frequencyEstimate, null);
  assert.equal(phmsa.zeroAdmissionBoundary.severityEstimate, null);
  assert.equal(phmsa.zeroAdmissionBoundary.targetPrice, null);
  assert.equal(phmsa.sourceDomainUseBoundary.admittedForBoundedRetrospectiveDescription,
    false);
  assert.equal(phmsa.sourceDomainUseBoundary.admittedForReceiptIdentityAndDeferralOnly,
    true);
  const fraReceipt = artifact.upstreamFlywheelReceipt.requiredArtifacts.find(
    ({ artifactId }) => artifactId === "FRA_PHMSA_REAL_SAFETY_EVIDENCE");
  assert.equal(fraReceipt.acquisitionManifestHash,
    "sha256:322b8a8446bbffb738edb102a02b03bd722624d84e695d23b56366cfef978e52");
  const nhtsa = artifact.sourceDomainDiagnostics.nhtsaRecallRemedyStatusReference;
  assert.equal(nhtsa.campaignIdentityAndDedup.sourceRows, 244499);
  assert.equal(nhtsa.campaignIdentityAndDedup.uniqueCampaigns, 15197);
  assert.equal(nhtsa.campaignIdentityAndDedup.sourceRowsEqualUniqueRecordIds, true);
  assert.equal(nhtsa.campaignIdentityAndDedup.sourceRowCountTreatedAsCampaignCount, false);
  assert.equal(nhtsa.campaignIdentityAndDedup
    .actualExposureOrUniqueVehiclesOnRoadEstablished, false);
  assert.equal(nhtsa.latestQuarterlyStatusComposition.selectedCampaigns, 11834);
  assert.equal(nhtsa.latestQuarterlyStatusComposition.remediedToInvolvedRatioRecomputed,
    "0.606752092202");
  assert.equal(nhtsa.latestQuarterlyStatusComposition.remediedRatioAgreesWithSourceAdapter,
    true);
  assert.equal(nhtsa.latestQuarterlyStatusComposition
    .componentResidualLabeledUnremedied, false);
  assert.equal(nhtsa.latestQuarterlyStatusComposition.ratioIsCompleteRepairRate, false);
  assert.equal(nhtsa.latestAnnualStatusComposition.selectedCampaigns, 2796);
  assert.equal(nhtsa.latestAnnualStatusComposition.remediedToInvolvedRatioRecomputed,
    "0.666610442801");
  assert.equal(nhtsa.latestAnnualStatusComposition.remediedRatioAgreesWithSourceAdapter,
    true);
  assert.equal(nhtsa.rightCensoringAndRevision.current2026PeriodIncompleteAtFreeze,
    true);
  assert.equal(nhtsa.rightCensoringAndRevision.latestSelectedStatusMeansFinalClosure,
    false);
  assert.equal(nhtsa.populationReconciliation.quarterlySelectedEqualsLinkedPlusOutside,
    true);
  assert.equal(nhtsa.populationReconciliation
    .quarterlyLinkedEqualsExactPlusTwoMismatchDirections, true);
  assert.equal(nhtsa.populationReconciliation.quarterly.totalAbsoluteDifference,
    "316960");
  assert.equal(nhtsa.populationReconciliation.annualLinkedEqualsExactPlusTwoMismatchDirections,
    true);
  assert.equal(nhtsa.populationReconciliation
    .quarterlyAndAnnualRatiosComparedAsCommonCohort, false);
  assert.equal(nhtsa.malformedPeriodAndComponentAnomalies.quarterly.invalidPeriodRows, 2);
  assert.deepEqual(nhtsa.malformedPeriodAndComponentAnomalies.quarterly
    .invalidPeriodExamples.map(({ observedPeriod }) => observedPeriod), ["2099-", "2022"]);
  assert.equal(nhtsa.malformedPeriodAndComponentAnomalies.quarterly
    .componentSumExceedsInvolvedRows, 1);
  assert.equal(nhtsa.realityReceiptRepairLossAndEnforcementBoundary
    .remediedCountEstablishesIndividuallyVerifiedCompleteRepair, false);
  assert.equal(nhtsa.realityReceiptRepairLossAndEnforcementBoundary
    .statusRowEstablishesAffectedPartyReceipt, false);
  assert.equal(nhtsa.realityReceiptRepairLossAndEnforcementBoundary
    .statusCountsEstablishPaidIncurredOrUltimateLoss, false);
  assert.equal(nhtsa.realityReceiptRepairLossAndEnforcementBoundary
    .recallManagementRecordIsEnforcementOrder, false);
  assert.equal(nhtsa.rightsAndInferenceBoundary.trainingAdmitted, false);
  assert.equal(nhtsa.rightsAndInferenceBoundary.frequencyEstimate, null);
  assert.equal(nhtsa.rightsAndInferenceBoundary.lossEstimate, null);
  assert.equal(nhtsa.rightsAndInferenceBoundary.targetPrice, null);
  const nhtsaReceipt = artifact.upstreamFlywheelReceipt.requiredArtifacts.find(
    ({ artifactId }) => artifactId === "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE");
  assert.equal(nhtsaReceipt.artifactHash,
    "sha256:afad74141571a82e40564f7b43bcacb0ccea2671684f3809e4bf4717af069034");
  assert.equal(nhtsaReceipt.artifactFileHash,
    "sha256:47ff5b8ccb8f780efe235d39bcf21c890917a54baa4f1de1114881af1fad628e");
  assert.equal(nhtsaReceipt.artifactFileBytes, 15646);
  assert.equal(nhtsaReceipt.acquisitionManifestHash,
    "sha256:b20bc43b921c08db9b7d646e591e69f53e3db05ee99c9946093fac89a1237d82");
  const bridge = artifact.sourceDomainDiagnostics.bridgeDataV2TrainingCandidateQuality;
  assert.equal(bridge.realityAndSampleAccounting
    .exactPublisherRobotTrajectoryRecordObserved, true);
  assert.equal(bridge.realityAndSampleAccounting
    .realPublishedRobotExperienceReferenceObserved, true);
  assert.equal(bridge.realityAndSampleAccounting
    .independentExperimentalTruthEstablished, false);
  assert.equal(bridge.realityAndSampleAccounting.underlyingWorldTruthEstablished, false);
  assert.equal(bridge.realityAndSampleAccounting.capturedWholeRecords, 1);
  assert.equal(bridge.realityAndSampleAccounting.trainExamples, 53192);
  assert.equal(bridge.realityAndSampleAccounting.capturedRecordFractionOfTrainSplit,
    "0.000018799820");
  assert.equal(bridge.structuralAndSemanticBoundary
    .fullSchemaAndSemanticContractEstablished, false);
  assert.equal(bridge.structuralAndSemanticBoundary
    .perRecordOutcomeOrFailureLabelPresent, false);
  assert.equal(bridge.rightsAndTrainerAdmission.trainerRowsEnqueued, 0);
  assert.equal(bridge.rightsAndTrainerAdmission
    .statisticalModelCapabilityImprovementEstablished, false);
  assert.equal(bridge.factorUseBoundary.typedQualityFactorDefinitions, 2);
  assert.equal(bridge.factorUseBoundary.behaviorModelRowsAdded, 0);
  assert.equal(bridge.factorUseBoundary.targetTransferOrPoolingPerformed, false);
  const waymo = artifact.sourceDomainDiagnostics.waymoPublishedOutcomeExposureReference;
  assert.equal(waymo.releaseAndExposure.displayedRoundedRiderOnlyMiles, "220613000");
  assert.equal(waymo.releaseAndExposure.displayedExposureIsExactUnroundedMiles, false);
  assert.equal(waymo.sgoMembershipAndDuplicateBoundary.publisherRows, 1664);
  assert.equal(waymo.sgoMembershipAndDuplicateBoundary.duplicateSgoIdVersionPairs, 3);
  assert.equal(waymo.sgoMembershipAndDuplicateBoundary
    .duplicatePairsWithOutcomeFlagConflicts, 2);
  assert.equal(waymo.sgoMembershipAndDuplicateBoundary
    .rowMembershipCountsTreatedAsIndependentCrashCounts, false);
  assert.equal(waymo.publishedBenchmarkFactorProfile.literalNonfiniteTokens, 164);
  assert.equal(waymo.publishedBenchmarkFactorProfile.allLocationPublishedFactorRows, 16);
  assert.equal(waymo.publishedBenchmarkFactorProfile
    .publisherFactorsIndependentlyRecomputedByThisMathLayer, false);
  assert.equal(waymo.dynamicBenchmarkConflictAndWindowBoundary.duplicateCompositeKeys,
    544);
  assert.equal(waymo.dynamicBenchmarkConflictAndWindowBoundary
    .benchmarkCrashCountConflictKeys, 489);
  assert.equal(waymo.dynamicBenchmarkConflictAndWindowBoundary.crossWindowPoolingPerformed,
    false);
  assert.equal(waymo.temporalSplitBoundary.referenceRows, 1390);
  assert.equal(waymo.temporalSplitBoundary.holdoutRows, 274);
  assert.equal(waymo.temporalSplitBoundary.treatedAsProspectivePreregisteredHoldout,
    false);
  assert.equal(waymo.independentReviewLossAndTransferBoundary.trainerRowsEnqueued, 0);
  assert.equal(waymo.independentReviewLossAndTransferBoundary.targetTransfer, false);
  assert.equal(waymo.independentReviewLossAndTransferBoundary.targetPrice, null);
  const bridgeReceipt = artifact.upstreamFlywheelReceipt.requiredArtifacts.find(
    ({ artifactId }) => artifactId === "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE");
  assert.equal(bridgeReceipt.artifactHash,
    "sha256:1db2d9b893cdb6cfc604154a787d70092b5a6c03d2122f2b81f56fa9e79e97c2");
  const waymoReceipt = artifact.upstreamFlywheelReceipt.requiredArtifacts.find(
    ({ artifactId }) => artifactId === "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE");
  assert.equal(waymoReceipt.artifactHash,
    "sha256:edccce782d93f0f8f6f01c14f427d44e4137d0b1cf5c040a0c84d0ada9da0a7a");
});

test("fixed projection preserves the exact seven-receipt temporal quarantine and zero authority", () => {
  const artifact = buildRealResponsibilityMathDiagnosticsProjection();
  const receipt = artifact.upstreamFlywheelReceipt;
  assert.deepEqual(receipt.temporalAuditBinding, {
    canonicalRelease: "final-v2",
    repositoryRelativePath:
      "artifacts/stage0-source-temporal-audit-20260828/final-v2/manifest.json",
    manifestHash:
      "sha256:9ab9517173af2b49f58dddd51a59d3b71ec76bfa6acb10cd5a84c4a426dcd453",
    artifactFileHash:
      "sha256:7a67d1474f67a8fe3c668f78d89096ccd69215aa89e7b782519737353585a44c",
    artifactFileBytes: 50283,
    pinnedReceiptCount: 16,
    temporalQuarantineReceiptCount: 7,
    temporallyOrderedCurrentReceiptCount: 9,
    currentCoverageReceiptCount: 9,
    currentCoverageMeaning: "RECEIPT_ROUTING_ONLY_NOT_GAP_CLOSURE_OR_WORLD_TRUTH",
    sourceBytesReplayedByFlywheelArtifactAlone: false,
    temporalAuditReverifiedByFlywheelArtifactAlone: false,
    closureCredit: false,
    operationalAuthorityGranted: false,
  });
  assert.deepEqual(receipt.temporalRoutingSummary, {
    status: "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY",
    pinnedReceiptCount: 16,
    temporallyOrderedCurrentReceiptCount: 9,
    temporalQuarantineReceiptCount: 7,
    currentCoverageReceiptCount: 9,
    allPinnedReceiptsTemporallyCurrent: false,
    temporalQuarantineClosureCredit: 0,
    temporalQuarantineCausalExperienceUnits: 0,
    temporalQuarantineTrainingAdmission: 0,
    temporalQuarantinePricingAdmission: 0,
    temporalQuarantineOperationalAuthority: 0,
  });
  const quarantineIds = [
    "CROSS_STAGE_SIX_LANE_PROGRESS",
    "INSTITUTIONAL_CAPITAL_CLAIMS",
    "REMEDY_PAYMENT_RECOVERY",
    "CDI_NCIGF_REAL_RATE_GUARANTY",
    "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE",
    "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE",
    "CLINICALTRIALS_POSTED_RESULTS_EVIDENCE",
  ];
  const quarantined = receipt.requiredArtifacts.filter(
    ({ temporalAuthenticityEstablished }) => temporalAuthenticityEstablished === false);
  assert.deepEqual(quarantined.map(({ artifactId }) => artifactId), quarantineIds);
  assert.equal(receipt.requiredArtifacts.filter(
    ({ temporalAuthenticityEstablished }) => temporalAuthenticityEstablished).length, 9);
  const hasPositiveCurrentToken = (value) => {
    if (typeof value === "string") return /(^|_)CURRENT(_|$)/u.test(value);
    if (Array.isArray(value)) return value.some(hasPositiveCurrentToken);
    if (value !== null && typeof value === "object") {
      return Object.values(value).some(hasPositiveCurrentToken);
    }
    return false;
  };
  assert.equal(quarantined.some(hasPositiveCurrentToken), false);
  assert.equal(quarantined.every((row) => row.sourceBytesReplayed === true
    && row.temporalAuthenticityEstablished === false
    && row.currentRoutingEligible === false
    && row.currentCoverage === false
    && row.currentTruth === false
    && row.closureCredit === false
    && row.causalExperienceUnits === 0
    && row.trainingAdmission === false
    && row.pricingAdmission === false
    && row.operationalAuthorityGranted === false), true);
  const factors = artifact.factorAdmissionDiagnostics;
  assert.equal(factors.temporalQuarantineReferenceFactorCount, 40);
  assert.equal(factors.temporallyOrderedReceiptReferenceFactorCount, 62);
  assert.equal(factors.factorsAdmittedForCurrentCoverage, 0);
  assert.equal(factors.factorsAdmittedForCurrentRouting, 0);
  assert.equal(factors.rows.filter((row) => row.temporalQuarantineReferenceOnly)
    .every((row) => quarantineIds.includes(row.upstreamArtifactId)
      && row.temporalAuthenticityEstablished === false
      && row.currentCoverageAdmitted === false
      && row.currentRoutingAdmitted === false), true);
  assert.equal(artifact.readiness.status, "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(artifact.readiness.currentCoverageReceiptCount, 9);
  assert.equal(artifact.readiness.temporalQuarantineClosureCredit, 0);
});

test("no global score, arbitrary quality weight, unit pooling, target loss, or authority is emitted", () => {
  const artifact = buildRealResponsibilityMathDiagnosticsProjection();
  const boundary = artifact.mathematicalBoundary;
  assert.equal(boundary.globalWeightedScore, null);
  assert.equal(boundary.arbitraryDataQualityWeightingApplied, false);
  assert.equal(boundary.heterogeneousSourceDomainsPooled, false);
  assert.equal(boundary.crossPublisherProgramsPooled, false);
  assert.equal(boundary.crossLaneDollarsPooled, false);
  assert.equal(boundary.crossLaneCountsPooled, false);
  assert.equal(boundary.crossLaneRatesPooled, false);
  assert.equal(boundary.targetDomainLossEstimate, null);
  assert.equal(boundary.targetDomainPrice, null);
  assert.ok(Object.values(artifact.authority).every((value) => value === false));
  assert.ok(artifact.sourceDomainLossFragments.every((row) =>
    row.targetTransferEstablished === false));
  assert.ok(Object.values(artifact.sourceDomainDiagnostics).every((row) =>
    (row.sourceReceiptOnly === true
      ? row.sourceDomainUseBoundary.admittedForBoundedRetrospectiveDescription === false
        && row.sourceDomainUseBoundary.admittedForReceiptIdentityAndDeferralOnly === true
      : row.sourceDomainUseBoundary.admittedForBoundedRetrospectiveDescription === true
        && row.sourceDomainUseBoundary.admittedForReceiptIdentityAndDeferralOnly === false)
    && row.sourceDomainUseBoundary.modelInputAdmitted === false
    && row.sourceDomainUseBoundary.crossDomainPoolingPermitted === false
    && row.sourceDomainUseBoundary.targetDomainTransferEstablished === false
    && row.sourceDomainUseBoundary.targetPriceEligibilityGranted === false));
  assert.equal(artifact.factorAdmissionDiagnostics.factorCount,
    artifact.factorDictionary.factors.length);
  assert.equal(artifact.factorAdmissionDiagnostics.quarantinedForStatedUse, 0);
  assert.equal(artifact.factorAdmissionDiagnostics.globalQualityScore, null);
  assert.equal(artifact.factorAdmissionDiagnostics.sourceDomainAdmission
    .reduce((sum, row) => sum + row.admittedForStatedSourceDomainRetrospectiveUse, 0),
  artifact.factorDictionary.factors.length);
  assert.ok(artifact.factorAdmissionDiagnostics.sourceDomainAdmission.every((row) =>
    row.admittedForTargetDomainUse === 0
    && row.targetDomainTransferEstablished === false));
  assert.equal(artifact.factorAdmissionDiagnostics.sourceDomainAdmission.some((row) =>
    row.sourceDomain === "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE"), false);
  const nhtsaAdmission = artifact.factorAdmissionDiagnostics.sourceDomainAdmission.find(
    (row) => row.sourceDomain === "NHTSA_RECALL_REMEDY_2026_08_21");
  assert.equal(nhtsaAdmission.factorDefinitions, 7);
  assert.equal(nhtsaAdmission.admittedForStatedSourceDomainRetrospectiveUse, 7);
  assert.equal(nhtsaAdmission.admittedForTargetDomainUse, 0);
  assert.equal(nhtsaAdmission.targetDomainTransferEstablished, false);
  assert.ok(artifact.factorAdmissionDiagnostics.rows.every((row) =>
    row.prerequisitesSatisfied === true && row.targetDomainUseAdmitted === false
    && row.arbitraryNumericQualityWeight === null));
});

test("caller reseal cannot pool heterogeneous units or fabricate a global score", () => {
  const attack = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  attack.mathematicalBoundary.heterogeneousSourceDomainsPooled = true;
  attack.mathematicalBoundary.crossLaneDollarsPooled = true;
  attack.mathematicalBoundary.crossPublisherProgramsPooled = true;
  attack.mathematicalBoundary.globalWeightedScore = 0.99;
  attack.mathematicalBoundary.targetDomainLossEstimate = "1";
  attack.factorAdmissionDiagnostics.globalQualityScore = 0.99;
  attack.factorAdmissionDiagnostics.rows[0].arbitraryNumericQualityWeight = 0.99;
  attack.sourceDomainDiagnostics.cfpbPaymentAllocation.pooledWithFtcOrCpsc = true;
  const checked = verifyRealResponsibilityMathDiagnostics(resealArtifact(attack));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /FIXED_PROJECTION_MISMATCH/);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.operationalAuthorityGranted, false);
});

test("post-outcome factor cannot masquerade as a pre-action predictor after caller reseal", () => {
  const attack = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  const index = attack.factorDictionary.factors.findIndex(
    (row) => row.factorId === "maude_reported_event_type_composition");
  attack.factorDictionary.factors[index].temporality = "PRE_ACTION";
  attack.factorDictionary.factors[index].outcomeDerived = false;
  attack.factorDictionary.factors[index].preActionAvailable = true;
  attack.factorDictionary.factors[index].targetPredictorEligible = true;
  attack.factorDictionary = resealDictionary(attack.factorDictionary);
  const checked = verifyRealResponsibilityMathDiagnostics(resealArtifact(attack));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /FIXED_PROJECTION_MISMATCH/);
});

test("denominator mismatch cannot create NFIP DMV Judgment Fund or GAO rates", () => {
  const attack = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  const nfip = attack.sourceDomainDiagnostics.nfipPaymentAndExposure.denominatorBoundary;
  nfip.currentExposureMatchedToHistoricalLoss = true;
  nfip.claimFrequency = "0.03135000";
  attack.sourceDomainDiagnostics.dmvRegimeExposure.collisionBoundary.collisionRate
    = "0.00000044";
  attack.sourceDomainDiagnostics.treasuryJudgmentFundPayment
    .amountAndDenominatorBoundary.uniqueClaimCount = 16154;
  attack.sourceDomainDiagnostics.treasuryJudgmentFundPayment
    .amountAndDenominatorBoundary.claimFrequency = "1.00000000";
  attack.sourceDomainDiagnostics.gaoBidProtestAdjudication
    .annualAggregate.closureRate = "1.02902844";
  attack.sourceDomainDiagnostics.gaoBidProtestAdjudication
    .publishedRatesWithUnobservedOperands.effectivenessNumerator = 878;
  const checked = verifyRealResponsibilityMathDiagnostics(resealArtifact(attack));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /FIXED_PROJECTION_MISMATCH/);
});

test("new source lanes cannot fabricate aligned rates approval charged price or capital", () => {
  const attack = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  attack.sourceDomainDiagnostics.mshaOutcomeExposureMismatch
    .temporalAndDenominatorBoundary.currentWindowsAligned = true;
  attack.sourceDomainDiagnostics.mshaOutcomeExposureMismatch
    .temporalAndDenominatorBoundary.q3OutcomesDividedByQ2Exposure = true;
  attack.sourceDomainDiagnostics.mshaOutcomeExposureMismatch
    .temporalAndDenominatorBoundary.derivedCurrentIncidenceRate = "0.001";
  attack.sourceDomainDiagnostics.cdiRateFilingStatusAndReconciliation
    .filingStatusChain.acceptedMeansApproved = true;
  attack.sourceDomainDiagnostics.cdiRateFilingStatusAndReconciliation
    .filingStatusChain.chargedPolicyPriceObserved = true;
  attack.sourceDomainDiagnostics.cdiRateFilingStatusAndReconciliation
    .filingStatusChain.targetPrice = "100";
  attack.sourceDomainDiagnostics.pbgcPaymentAndDenominatorBoundary
    .availabilityFrame.commonCrossYearDenominatorAdmitted = true;
  attack.sourceDomainDiagnostics.pbgcPaymentAndDenominatorBoundary
    .multiemployerProgramSeparation.pooledPaymentAmount = "6320.99";
  attack.sourceDomainDiagnostics.ncuaAuditedCapitalAndLossBoundary
    .capitalAndTransferBoundary.auditedFundNetPositionIsOutsiderAvailableCapital = true;
  attack.sourceDomainDiagnostics.ncigfAssessmentCapacityBoundary
    .quarterlyCapacity.capacityIsOutsiderCapital = true;
  const checked = verifyRealResponsibilityMathDiagnostics(resealArtifact(attack));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /FIXED_PROJECTION_MISMATCH/);
});

test("FRA reported damage and PHMSA receipt cannot become loss target rate or price", () => {
  const attack = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  const fra = attack.sourceDomainDiagnostics.fraCalendarOutcomeExposureRates;
  fra.reportedDamageAndLossBoundary.paidLoss = true;
  fra.reportedDamageAndLossBoundary.incurredLoss = true;
  fra.reportedDamageAndLossBoundary.ultimateLoss = true;
  fra.reportedDamageAndLossBoundary.addedToSourceDomainLossFragments = true;
  fra.inferenceBoundary.targetDomainTransferPermitted = true;
  fra.inferenceBoundary.targetPrice = "0.445795361";
  const phmsa = attack.sourceDomainDiagnostics.phmsaCapturedSourceReceiptDeferral;
  phmsa.capturedRowProfileNotOutcomeModel.capturedRowsAreUniqueIncidents = true;
  phmsa.zeroAdmissionBoundary.typedFactorDefinitions = 1;
  phmsa.zeroAdmissionBoundary.outcomeOrActuarialModelInputAdmitted = true;
  phmsa.zeroAdmissionBoundary.crossLaneFraExposureBorrowed = true;
  phmsa.zeroAdmissionBoundary.frequencyEstimate = "0.1";
  phmsa.zeroAdmissionBoundary.severityEstimate = "1000";
  phmsa.zeroAdmissionBoundary.pricingAdmission = true;
  phmsa.zeroAdmissionBoundary.targetPrice = "1";
  phmsa.sourceDomainUseBoundary.admittedForBoundedRetrospectiveDescription = true;
  phmsa.sourceDomainUseBoundary.admittedForReceiptIdentityAndDeferralOnly = false;
  const checked = verifyRealResponsibilityMathDiagnostics(resealArtifact(attack));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /FIXED_PROJECTION_MISMATCH/);
});

test("NHTSA status composition cannot become complete repair receipt loss enforcement or price", () => {
  const attack = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  const nhtsa = attack.sourceDomainDiagnostics.nhtsaRecallRemedyStatusReference;
  nhtsa.latestQuarterlyStatusComposition.ratioIsCompleteRepairRate = true;
  nhtsa.latestQuarterlyStatusComposition.ratioIsTargetDomainRate = true;
  nhtsa.latestAnnualStatusComposition.ratioIsFrequencyOrSeverityRate = true;
  nhtsa.populationReconciliation.quarterlyAndAnnualRatiosComparedAsCommonCohort = true;
  nhtsa.populationReconciliation.targetOrCrossLaneExposureDenominatorBorrowed = true;
  nhtsa.realityReceiptRepairLossAndEnforcementBoundary
    .statusRowEstablishesAffectedPartyReceipt = true;
  nhtsa.realityReceiptRepairLossAndEnforcementBoundary
    .remediedCountEstablishesIndividuallyVerifiedCompleteRepair = true;
  nhtsa.realityReceiptRepairLossAndEnforcementBoundary
    .statusCountsEstablishPaidIncurredOrUltimateLoss = true;
  nhtsa.realityReceiptRepairLossAndEnforcementBoundary
    .recallManagementRecordIsEnforcementOrder = true;
  nhtsa.realityReceiptRepairLossAndEnforcementBoundary.sourceDomainLossFragmentAdmitted = true;
  nhtsa.rightsAndInferenceBoundary.trainingAdmitted = true;
  nhtsa.rightsAndInferenceBoundary.targetTransferAdmitted = true;
  nhtsa.rightsAndInferenceBoundary.frequencyEstimate = "0.606752092202";
  nhtsa.rightsAndInferenceBoundary.severityEstimate = "1";
  nhtsa.rightsAndInferenceBoundary.lossEstimate = "1";
  nhtsa.rightsAndInferenceBoundary.targetPrice = "1";
  nhtsa.rightsAndInferenceBoundary.operationalAuthorityGranted = true;
  const checked = verifyRealResponsibilityMathDiagnostics(resealArtifact(attack));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /FIXED_PROJECTION_MISMATCH/);
});

test("Waymo publisher reference cannot become independent outcome truth prospective holdout target rate or price after reseal", () => {
  const attack = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  const waymo = attack.sourceDomainDiagnostics.waymoPublishedOutcomeExposureReference;
  waymo.releaseAndExposure.displayedExposureIsExactUnroundedMiles = true;
  waymo.sgoMembershipAndDuplicateBoundary
    .rowMembershipCountsTreatedAsIndependentCrashCounts = true;
  waymo.sgoMembershipAndDuplicateBoundary.naiveRowCountDividedByDisplayedMilesRate
    = "7.54262158";
  waymo.publishedBenchmarkFactorProfile
    .publisherFactorsIndependentlyRecomputedByThisMathLayer = true;
  waymo.dynamicBenchmarkConflictAndWindowBoundary.crossWindowPoolingPerformed = true;
  waymo.temporalSplitBoundary.treatedAsProspectivePreregisteredHoldout = true;
  waymo.temporalSplitBoundary.treatedAsExternalTargetHoldout = true;
  waymo.independentReviewLossAndTransferBoundary
    .independentCrashFactAdjudicationEstablished = true;
  waymo.independentReviewLossAndTransferBoundary.targetTransfer = true;
  waymo.independentReviewLossAndTransferBoundary.actualOutsiderModelCalibrated = true;
  waymo.independentReviewLossAndTransferBoundary.frequencyModelEligible = true;
  waymo.independentReviewLossAndTransferBoundary.targetPrice = "1";
  const checked = verifyRealResponsibilityMathDiagnostics(resealArtifact(attack));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /FIXED_PROJECTION_MISMATCH/);
});

test("BridgeData candidate quality cannot become training model capability target transfer or price after reseal", () => {
  const attack = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  const bridge = attack.sourceDomainDiagnostics.bridgeDataV2TrainingCandidateQuality;
  bridge.realityAndSampleAccounting.sampleRandomOrRepresentative = true;
  bridge.realityAndSampleAccounting.independentExperimentalTruthEstablished = true;
  bridge.realityAndSampleAccounting.underlyingWorldTruthEstablished = true;
  bridge.structuralAndSemanticBoundary.fullSchemaAndSemanticContractEstablished = true;
  bridge.structuralAndSemanticBoundary.perRecordOutcomeOrFailureLabelPresent = true;
  bridge.rightsAndTrainerAdmission.trainerRowsEnqueued = 1;
  bridge.rightsAndTrainerAdmission.automaticTraining = true;
  bridge.rightsAndTrainerAdmission.statisticalModelCapabilityImprovementEstablished = true;
  bridge.rightsAndTrainerAdmission.targetRobotTransferEstablished = true;
  bridge.rightsAndTrainerAdmission.targetDomainFactorAdmission = true;
  bridge.rightsAndTrainerAdmission.frequencyEligible = true;
  bridge.rightsAndTrainerAdmission.priceAuthority = true;
  bridge.rightsAndTrainerAdmission.targetPrice = "1";
  bridge.factorUseBoundary.behaviorModelRowsAdded = 1;
  bridge.factorUseBoundary.targetTransferOrPoolingPerformed = true;
  const checked = verifyRealResponsibilityMathDiagnostics(resealArtifact(attack));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /FIXED_PROJECTION_MISMATCH/);
});

test("ClinicalTrials diagnostics preserve study-root non-pooling and zero training price authority", () => {
  const artifact = buildRealResponsibilityMathDiagnosticsProjection();
  const clinical = artifact.sourceDomainDiagnostics.clinicalTrialsPostedResults;
  assert.equal(clinical.frozenQueryPopulation.observedStudyRecords, 18);
  assert.equal(clinical.postedAggregateRows.totalPostedOutcomeMeasureRows, 242);
  assert.equal(clinical.nonPoolingAndInferenceBoundary.crossStudyAffectedCountsPooled, false);
  assert.equal(clinical.nonPoolingAndInferenceBoundary.crossStudyRatesCalculated, false);
  assert.equal(clinical.nonPoolingAndInferenceBoundary.independentAdjudicationEstablished,
    false);
  assert.equal(clinical.nonPoolingAndInferenceBoundary.causalEffectEstablished, false);
  assert.equal(clinical.nonPoolingAndInferenceBoundary.sponsorNamesPersistedInDerivedArtifact,
    false);
  assert.equal(clinical.nonPoolingAndInferenceBoundary.personNamesPersistedInDerivedArtifact,
    false);
  assert.equal(clinical.nonPoolingAndInferenceBoundary.rightsTermsSourceReplayed, false);
  assert.equal(clinical.nonPoolingAndInferenceBoundary.rightsDetermination,
    "NOT_ESTABLISHED_URL_ONLY_NOT_REPLAYED");
  assert.equal(clinical.nonPoolingAndInferenceBoundary.admittedTrainingRows, 0);
  assert.equal(clinical.nonPoolingAndInferenceBoundary.targetPrice, null);
  assert.equal(artifact.mathematicalBoundary.clinicalTrialsStudiesTermsGroupsOrRatesPooled,
    false);
  assert.equal(artifact.readiness.clinicalTrialsTargetTrainingPriceAndAuthorityAdmission,
    false);
});

test("unknown top-level nested and dictionary fields fail after semantic reseal", () => {
  const attacks = [];
  const top = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  top.unknownPromotion = true;
  attacks.push(resealArtifact(top));
  const nested = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  nested.sourceDomainDiagnostics.waymoPublishedOutcomeExposureReference
    .unknownPromotion = true;
  attacks.push(resealArtifact(nested));
  const factor = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  factor.factorDictionary.factors.at(-1).unknownPromotion = true;
  factor.factorDictionary = resealDictionary(factor.factorDictionary);
  attacks.push(resealArtifact(factor));
  for (const attack of attacks) {
    const checked = verifyRealResponsibilityMathDiagnostics(attack);
    assert.equal(checked.ok, false);
    assert.match(checked.error, /FIXED_PROJECTION_MISMATCH/);
  }
});

test("final-v4 has a byte-preserving self-consistent supersession marker for final-v5", {
  skip: !existsSync(p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v4/SUPERSEDED.json")),
}, () => {
  const markerPath = p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v4/SUPERSEDED.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(marker.supersededArtifact.artifactHash,
    "sha256:739193173128aa8481210dcad00748a11cb11402959eb6ede8d1547961f51466");
  assert.equal(marker.supersededArtifact.serializedFileHash,
    "sha256:32090580fd5da780091711da72c1b0ac225cc53d8c8c88c64d5229e01f60eea4");
  assert.equal(marker.supersededArtifact.serializedBytes, 410261);
  assert.equal(marker.supersededArtifact.bytePreserved, true);
  assert.equal(marker.currentArtifact.artifactHash,
    "sha256:fc53740dbf8e0e1f655c875144083f755899338dfef16f79eac86cff60af2af8");
  assert.equal(marker.currentArtifact.serializedFileHash,
    "sha256:8ec64d5b685b7819561d98fcf1aed8416cf761c6662114a518cfd85bed7f80f7");
  assert.equal(marker.currentArtifact.serializedBytes, 457359);
  assert.equal(marker.currentArtifact.isCurrentProjection, true);
  for (const side of ["supersededArtifact", "currentArtifact"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].serializedBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].serializedFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
  }
  assert.equal(marker.targetDomainTransferEstablished, false);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v5 has a byte-preserving supersession marker for ClinicalTrials final-v6", {
  skip: !existsSync(p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v5/SUPERSEDED.json")),
}, () => {
  const marker = JSON.parse(readFileSync(p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v5/SUPERSEDED.json"),
  "utf8"));
  for (const side of ["supersededArtifact", "currentArtifact"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].serializedBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].serializedFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
  }
  assert.match(marker.reason, /ClinicalTrials\.gov/u);
  assert.equal(marker.targetDomainTransferEstablished, false);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v6 has a byte-preserving ClinicalTrials privacy and rights marker for final-v7", {
  skip: !existsSync(p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v6/SUPERSEDED.json")),
}, () => {
  const marker = JSON.parse(readFileSync(p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v6/SUPERSEDED.json"),
  "utf8"));
  for (const side of ["supersededArtifact", "currentArtifact"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].serializedBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].serializedFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
  }
  assert.match(marker.reason, /strips ClinicalTrials\.gov sponsor or person names/u);
  assert.match(marker.reason, /NOT_ESTABLISHED/u);
  assert.equal(marker.targetDomainTransferEstablished, false);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("future-dated final-v7 is byte-preserved and superseded by past-time final-v8", {
  skip: !existsSync(p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v7/SUPERSEDED.json")),
}, () => {
  const marker = JSON.parse(readFileSync(p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v7/SUPERSEDED.json"),
  "utf8"));
  for (const side of ["supersededArtifact", "currentArtifact"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].serializedBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].serializedFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
  }
  assert.equal(marker.previousGeneratedAt, "2026-08-22T02:45:00.000Z");
  assert.equal(marker.currentGeneratedAt, "2026-08-22T02:25:00.000Z");
  assert.equal(Date.parse(marker.currentGeneratedAt) <= Date.now(), true);
  assert.equal(marker.futureDatedCanonicalAccepted, false);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v8 is byte-preserved and superseded by Wave5-aware final-v9", {
  skip: !existsSync(p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v8/SUPERSEDED.json")),
}, () => {
  const marker = JSON.parse(readFileSync(p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v8/SUPERSEDED.json"),
  "utf8"));
  for (const side of ["supersededArtifact", "currentArtifact"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].serializedBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].serializedFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
  }
  assert.equal(marker.wave5SourceNativeRows, 49);
  assert.equal(marker.wave5PreActionAvailableRows, 0);
  assert.equal(marker.wave5TrainerRowsEnqueued, 0);
  assert.equal(marker.wave5TargetPredictorEligibleRows, 0);
  assert.equal(marker.wave5TargetPriceEligibleRows, 0);
  assert.equal(marker.targetDomainTransferEstablished, false);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v9 lifecycle-label candidate is byte-preserved and superseded by final-v10", {
  skip: !existsSync(p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v9/SUPERSEDED.json")),
}, () => {
  const marker = JSON.parse(readFileSync(p(
    "artifacts/real-responsibility-math-diagnostics-20260821/final-v9/SUPERSEDED.json"),
  "utf8"));
  for (const side of ["supersededArtifact", "currentArtifact"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].serializedBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].serializedFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
  }
  assert.equal(marker.previousInternalCanonicalRelease, "final-v8");
  assert.equal(marker.currentInternalCanonicalRelease, "final-v10");
  assert.equal(marker.wave5SourceNativeRows, 49);
  assert.equal(marker.wave5TrainerRowsEnqueued, 0);
  assert.equal(marker.targetDomainFactorsAdmitted, 0);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("math projection builder standalone and full reject alternate 2000 and 2099 times", async () => {
  for (const generatedAt of ["2000-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z"]) {
    assert.throws(() => buildRealResponsibilityMathDiagnosticsProjection({ generatedAt }),
      /GENERATED_AT_NOT_CANONICAL_FIXED_VALUE/);
    await assert.rejects(buildRealResponsibilityMathDiagnosticsFromSources({
      sources: SOURCES, generatedAt,
    }), /GENERATED_AT_NOT_CANONICAL_FIXED_VALUE/);
    const attack = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
    attack.generatedAt = generatedAt;
    const resealed = resealArtifact(attack);
    const standalone = verifyRealResponsibilityMathDiagnostics(resealed);
    assert.equal(standalone.ok, false);
    assert.match(standalone.error, /GENERATED_AT_NOT_CANONICAL_FIXED_VALUE/);
    const full = await verifyRealResponsibilityMathDiagnosticsAgainstSources(resealed,
      { sources: SOURCES });
    assert.equal(full.ok, false);
    assert.match(full.error, /GENERATED_AT_NOT_CANONICAL_FIXED_VALUE/);
    assert.equal(full.sourceArtifactsReverified, false);
  }
});

test("embedded stale source receipt and authority promotion fail even when caller reseals", () => {
  const attack = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  attack.upstreamFlywheelReceipt.requiredArtifacts[0].artifactHash
    = `sha256:${"0".repeat(64)}`;
  attack.upstreamFlywheelReceipt.requiredArtifacts.find(({ artifactId }) =>
    artifactId === "FRA_PHMSA_REAL_SAFETY_EVIDENCE").acquisitionManifestHash
    = `sha256:${"0".repeat(64)}`;
  attack.upstreamFlywheelReceipt.requiredArtifacts.find(({ artifactId }) =>
    artifactId === "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE").acquisitionManifestHash
    = `sha256:${"1".repeat(64)}`;
  attack.authority.PRICE = true;
  attack.readiness.readyToPrice = true;
  const checked = verifyRealResponsibilityMathDiagnostics(resealArtifact(attack));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /FIXED_PROJECTION_MISMATCH/);
});

test("wrong frozen flywheel canonical hash fails after caller resealing", () => {
  const attack = structuredClone(buildRealResponsibilityMathDiagnosticsProjection());
  attack.upstreamFlywheelReceipt.frozenCanonical.artifactHash
    = `sha256:${"0".repeat(64)}`;
  const checked = verifyRealResponsibilityMathDiagnostics(resealArtifact(attack));
  assert.equal(checked.ok, false);
  assert.match(checked.error, /FIXED_PROJECTION_MISMATCH/);
  assert.equal(checked.frozenFlywheelCanonicalFileHashVerified, false);
});

test("semantic-equivalent frozen flywheel reserialization is rejected before replay", {
  skip: !existsSync(SOURCES.responsibilityFlywheel.artifactPath),
}, async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-math-flywheel-reserialize-"));
  try {
    const drifted = path.join(temporary, "flywheel.json");
    const parsed = JSON.parse(readFileSync(SOURCES.responsibilityFlywheel.artifactPath, "utf8"));
    writeFileSync(drifted, JSON.stringify(parsed));
    const sources = structuredClone(SOURCES);
    sources.responsibilityFlywheel.artifactPath = drifted;
    await assert.rejects(buildRealResponsibilityMathDiagnosticsFromSources({ sources }),
      /FROZEN_FLYWHEEL_CANONICAL_HASH_MISMATCH/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("semantic-equivalent frozen catalog reserialization is rejected before replay", {
  skip: !existsSync(SOURCES.responsibilityFlywheel.catalogArtifactPath),
}, async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-math-catalog-reserialize-"));
  try {
    const drifted = path.join(temporary, "catalog.json");
    const parsed = JSON.parse(readFileSync(
      SOURCES.responsibilityFlywheel.catalogArtifactPath, "utf8"));
    writeFileSync(drifted, JSON.stringify(parsed));
    const sources = structuredClone(SOURCES);
    sources.responsibilityFlywheel.catalogArtifactPath = drifted;
    await assert.rejects(buildRealResponsibilityMathDiagnosticsFromSources({ sources }),
      /FROZEN_CATALOG_CANONICAL_HASH_MISMATCH/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("missing and superseded frozen catalog paths fail before source replay", async () => {
  const missing = structuredClone(SOURCES);
  missing.responsibilityFlywheel.catalogArtifactPath = p(
    "artifacts/real-case-gap-evidence-catalog-20260821/does-not-exist/catalog.json");
  await assert.rejects(buildRealResponsibilityMathDiagnosticsFromSources({ sources: missing }));
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-math-catalog-stale-"));
  try {
    const stalePath = path.join(temporary, "catalog.json");
    const stale = readFileSync(p(
      "artifacts/real-case-gap-evidence-catalog-20260821/final-v7/catalog.json"));
    writeFileSync(stalePath, stale);
    const sources = structuredClone(SOURCES);
    sources.responsibilityFlywheel.catalogArtifactPath = stalePath;
    await assert.rejects(buildRealResponsibilityMathDiagnosticsFromSources({ sources }),
      /FROZEN_CATALOG_CANONICAL_HASH_MISMATCH/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("stale flywheel path is rejected before replay", async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-math-flywheel-stale-"));
  try {
    const stalePath = path.join(temporary, "flywheel.json");
    const stale = readFileSync(p(
      "artifacts/real-case-responsibility-flywheel-20260821/final-v5/flywheel.json"));
    writeFileSync(stalePath, stale);
    const sources = structuredClone(SOURCES);
    sources.responsibilityFlywheel.artifactPath = stalePath;
    await assert.rejects(buildRealResponsibilityMathDiagnosticsFromSources({ sources }),
      /FROZEN_FLYWHEEL_CANONICAL_HASH_MISMATCH/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("source APIs reject caller receipts, booleans, callbacks, and verification results", async () => {
  await assert.rejects(buildRealResponsibilityMathDiagnosticsFromSources({
    sources: SOURCES, sourceArtifactsReverified: true,
  }), /SOURCE_BUILD_OPTIONS_INVALID/);
  const artifact = buildRealResponsibilityMathDiagnosticsProjection();
  const checked = await verifyRealResponsibilityMathDiagnosticsAgainstSources(artifact, {
    sources: SOURCES, receipt: { ok: true }, verify() { return true; },
  });
  assert.equal(checked.ok, false);
  assert.match(checked.error, /SOURCE_VERIFY_OPTIONS_INVALID/);
  assert.equal(checked.sourceArtifactsReverified, false);
});

test("candidate build time fails before source replay when future or before flywheel", async () => {
  await assert.rejects(buildRealResponsibilityMathDiagnosticsCandidateFromSources({
    sources: {}, generatedAt: "2099-01-01T00:00:00.000Z",
  }), /CANDIDATE_TIME_IN_FUTURE/);
  await assert.rejects(buildRealResponsibilityMathDiagnosticsCandidateFromSources({
    sources: {}, generatedAt: "2026-08-28T08:39:59.999Z",
  }), /GENERATED_AT_PRECEDES_FROZEN_FLYWHEEL/);
});

test("final-v13 is byte-preserved and explicitly superseded by temporal-quarantine final-v14", () => {
  const oldPath = p(
    "artifacts/real-responsibility-math-diagnostics-20260828/final-v13/diagnostics.json");
  const markerPath = p(
    "artifacts/real-responsibility-math-diagnostics-20260828/final-v13/superseded-by.json");
  const currentPath = p(
    "artifacts/real-responsibility-math-diagnostics-20260828/final-v14/diagnostics.json");
  const oldBytes = readFileSync(oldPath);
  const currentBytes = readFileSync(currentPath);
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  assert.equal(createHash("sha256").update(oldBytes).digest("hex"),
    "7bce06a14e6aa8350e4cbe0f3744d918bc58f4bc28cff7ebbcea32cebe7a1fa4");
  assert.equal(oldBytes.length, 488665);
  assert.equal(createHash("sha256").update(currentBytes).digest("hex"),
    "4e582303848e304500344121fbd0a7b415df430db29fb6ba6ab60320b87a70c8");
  assert.equal(currentBytes.length, 539149);
  assert.equal(marker.status,
    "SUPERSEDED_BY_TEMPORAL_AUTHENTICITY_QUARANTINE_SUCCESSOR");
  assert.equal(marker.canonical.artifactHash,
    "sha256:201199fbaec303e82ae41ea3b5555cbffdc24173536a8a1a33e347e95d01655e");
  assert.equal(marker.temporalAudit.temporalQuarantineReceiptCount, 7);
  assert.equal(marker.closureCredit, false);
  assert.equal(statSync(markerPath).mode & 0o777, 0o600);
  const current = JSON.parse(currentBytes.toString("utf8"));
  assert.ok(BigInt(Date.parse(current.generatedAt)) * 1_000_000n
    <= statSync(currentPath, { bigint: true }).mtimeNs);
});

test("byte-drifted artifact fails before expensive source replay", { skip: !HAS_SOURCES }, async () => {
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-responsibility-math-"));
  try {
    const drifted = path.join(temporary, "progress.json");
    const parsed = JSON.parse(readFileSync(SOURCES.progress.artifactPath, "utf8"));
    writeFileSync(drifted, JSON.stringify(parsed));
    const sources = structuredClone(SOURCES);
    sources.progress.artifactPath = drifted;
    await assert.rejects(buildRealResponsibilityMathDiagnosticsFromSources({ sources }),
      /FULL_FLYWHEEL_RECEIPT_INVALID/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("Wave5, BridgeData, Waymo, and ClinicalTrials canonical byte drift fail same-call replay", {
  skip: !HAS_SOURCES, timeout: 240_000,
}, async () => {
  for (const key of ["wave5Intake", "bridgeDataV2", "waymoSafetyImpact", "clinicalTrials"]) {
    const temporary = mkdtempSync(path.join(tmpdir(), `outsider-math-${key}-drift-`));
    try {
      const drifted = path.join(temporary, "evidence.json");
      const parsed = JSON.parse(readFileSync(SOURCES[key].artifactPath, "utf8"));
      writeFileSync(drifted, JSON.stringify(parsed));
      const sources = structuredClone(SOURCES);
      sources[key].artifactPath = drifted;
      await assert.rejects(buildRealResponsibilityMathDiagnosticsFromSources({ sources }),
        /FULL_FLYWHEEL_RECEIPT_INVALID/);
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  }
});

test("full verification obtains same-call flywheel replay and recomputes diagnostics", {
  skip: !HAS_SOURCES, timeout: 240_000,
}, async () => {
  const canonicalPath = p(
    "artifacts/real-responsibility-math-diagnostics-20260828/final-v14/diagnostics.json");
  const artifact = existsSync(canonicalPath)
    ? JSON.parse(readFileSync(canonicalPath, "utf8"))
    : buildRealResponsibilityMathDiagnosticsProjection();
  const checked = await verifyRealResponsibilityMathDiagnosticsAgainstSources(artifact,
    { sources: SOURCES });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FULL_SOURCE_DOMAIN_MATH_WITH_SAME_CALL_FLYWHEEL_REPLAY_AND_TEMPORAL_QUARANTINE_HOLD");
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.frozenCatalogCanonicalStableRead, true);
  assert.equal(checked.frozenCatalogCanonicalFileHashVerified, true);
  assert.equal(checked.frozenCatalogCodeProjectionMatched, true);
  assert.equal(checked.frozenFlywheelCanonicalStableRead, true);
  assert.equal(checked.frozenFlywheelCanonicalFileHashVerified, true);
  assert.equal(checked.frozenFlywheelExactlyRebuiltFromSources, true);
  assert.equal(checked.sameCallFlywheelFullSourceReceiptVerified, true);
  assert.equal(checked.pinnedArtifactFactsReextracted, true);
  assert.equal(checked.temporalAuditReplayedInSameCall, true);
  assert.equal(checked.pinnedReceiptCount, 16);
  assert.equal(checked.temporallyOrderedCurrentReceiptCount, 9);
  assert.equal(checked.temporalQuarantineReceiptCount, 7);
  assert.equal(checked.currentCoverageReceiptCount, 9);
  assert.equal(checked.allPinnedReceiptsTemporallyCurrent, false);
  assert.equal(checked.readinessStatus, "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
  assert.equal(checked.sourceDomainDiagnosticsRecomputed, true);
  assert.equal(checked.lossFragmentsRecomputed, true);
  assert.equal(checked.requiredUpstreamArtifactCount, 16);
  assert.equal(checked.typedFactorCount, 102);
  assert.equal(checked.sourceDomainDiagnosticCount, 29);
  assert.equal(checked.sourceDomainRetrospectiveFactorsAdmitted, 102);
  assert.equal(checked.targetDomainFactorsAdmitted, 0);
  assert.equal(checked.staleOrSupersededArtifactsAccepted, false);
  assert.equal(checked.globalWeightedScoreProduced, false);
  assert.equal(checked.crossDomainPoolingPerformed, false);
  assert.equal(checked.targetDomainTransferEstablished, false);
  assert.equal(checked.operationalAuthorityGranted, false);
  assert.equal(artifact.artifactLifecycle.canonicalRelease, "final-v14");
  assert.equal(artifact.artifactLifecycle.canonicalRepositoryRelativePath,
    "artifacts/real-responsibility-math-diagnostics-20260828/final-v14/diagnostics.json");
});
