import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildRealCaseResponsibilityFlywheelFromSources,
  buildRealCaseResponsibilityFlywheelProjection,
  REAL_CASE_RESPONSIBILITY_FLYWHEEL_SCHEMA,
  requireNcuaPbgcMshaFullReceipt,
  verifyRealCaseResponsibilityFlywheel,
  verifyRealCaseResponsibilityFlywheelAgainstSources,
} from "../src/outsider-real-case-responsibility-flywheel.js";
import { verifyRealCaseQualityAssessment } from "../src/outsider-real-case-quality-gate.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const p = (...parts) => path.join(ROOT, ...parts);

function officialSources() {
  const wave5 = p("artifacts/public-evidence-wave5-20260821/source");
  const aiid = p("artifacts/reality-consequence-aiid-20260817");
  const cas = p("artifacts/stage234-cas-schedule-p-2025/source");
  return {
    temporalAudit: {
      manifestPath: p(
        "artifacts/stage0-source-temporal-audit-20260828/final-v2/manifest.json"),
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
      artifactPath: p("artifacts/public-evidence-wave5-intake-20260821/final-v3/snapshot.json"),
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
      artifactPath: p("artifacts/judgment-fund-gao-real-cases-20260821/final-v1/evidence.json"),
      sourceDirectory: p("artifacts/judgment-fund-gao-real-cases-20260821/source"),
    },
    ncuaPbgcMsha: {
      artifactPath: p("artifacts/ncua-pbgc-msha-real-experience-20260821/final-v1/evidence.json"),
      sourceDirectory: p("artifacts/ncua-pbgc-msha-real-experience-20260821/source"),
    },
    cdiNcigf: {
      artifactPath: p("artifacts/cdi-ncigf-real-rate-guaranty-20260821/final-v1/evidence.json"),
      sourceDirectory: p("artifacts/cdi-ncigf-real-rate-guaranty-20260821/source"),
    },
    fraPhmsa: {
      artifactPath: p("artifacts/fra-phmsa-safety-20260821/final-v2/evidence.json"),
      sourceDirectory: p("artifacts/fra-phmsa-safety-20260821/source-v2"),
    },
    nhtsaRecallRemedy: {
      artifactPath: p("artifacts/nhtsa-recall-remedy-evidence-20260821/final-v6/evidence.json"),
      sourceDirectory: p("artifacts/nhtsa-recall-remedy-evidence-20260821/source"),
    },
    bridgeDataV2: {
      artifactPath: p("artifacts/bridgedata-v2-training-evidence-20260822/final-v5/evidence.json"),
      sourceDirectory: p("artifacts/bridgedata-v2-training-evidence-20260822/source-v1"),
    },
    waymoSafetyImpact: {
      artifactPath: p("artifacts/waymo-safety-impact-evidence-20260822/final-v5/evidence.json"),
      sourceDirectory: p("artifacts/waymo-safety-impact-evidence-20260822/source-v1"),
    },
    clinicalTrials: {
      artifactPath: p("artifacts/clinicaltrials-posted-results-evidence-20260822/final-v3/evidence.json"),
      sourceDirectory: p("artifacts/clinicaltrials-posted-results-evidence-20260822/source"),
    },
  };
}

const SOURCES = officialSources();
const HAS_SOURCES = [
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
  SOURCES.fdaMaude.artifactPath,
  SOURCES.fdaMaude.sourceDirectory,
  SOURCES.caDmvAv.artifactPath,
  SOURCES.caDmvAv.sourceDirectory,
  SOURCES.institutionalCapitalClaims.artifactPath,
  SOURCES.institutionalCapitalClaims.sourceDirectory,
  SOURCES.femaRealCases.artifactPath,
  SOURCES.femaRealCases.sourceDirectory,
  SOURCES.remedyPaymentRecovery.artifactPath,
  SOURCES.remedyPaymentRecovery.sourceDirectory,
  SOURCES.ntsbBlsOutcome.artifactPath,
  SOURCES.ntsbBlsOutcome.sourceDirectory,
  SOURCES.judgmentFundGao.artifactPath,
  SOURCES.judgmentFundGao.sourceDirectory,
  SOURCES.ncuaPbgcMsha.artifactPath,
  SOURCES.ncuaPbgcMsha.sourceDirectory,
  SOURCES.cdiNcigf.artifactPath,
  SOURCES.cdiNcigf.sourceDirectory,
  SOURCES.fraPhmsa.artifactPath,
  SOURCES.fraPhmsa.sourceDirectory,
  SOURCES.nhtsaRecallRemedy.artifactPath,
  SOURCES.nhtsaRecallRemedy.sourceDirectory,
  SOURCES.bridgeDataV2.artifactPath,
  SOURCES.bridgeDataV2.sourceDirectory,
  SOURCES.waymoSafetyImpact.artifactPath,
  SOURCES.waymoSafetyImpact.sourceDirectory,
  SOURCES.clinicalTrials.artifactPath,
  SOURCES.clinicalTrials.sourceDirectory,
].every(existsSync);

function reseal(value) {
  const copy = structuredClone(value);
  delete copy.artifactHash;
  copy.artifactHash = `sha256:${createHash("sha256")
    .update(`${REAL_CASE_RESPONSIBILITY_FLYWHEEL_SCHEMA}\0${canonicalizeStrict(copy)}`)
    .digest("hex")}`;
  return copy;
}

test("fixed flywheel preserves real cases while keeping every operational authority false", () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const checked = verifyRealCaseResponsibilityFlywheel(artifact);
  assert.equal(checked.ok, true);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(artifact.artifactReceipts.length, 16);
  assert.equal(artifact.lanes.length, 26);
  assert.equal(artifact.qualityAssessments.length, 26);
  assert.equal(artifact.gapReferences.rows.length, 36);
  assert.equal(artifact.gapReferences.catalogAsOf, "2026-08-28T08:23:57.560Z");
  assert.equal(artifact.gapReferences.catalogHash,
    "sha256:b690ddeb4a9a01b94938f6558dfe565e4f6703d16eb22e0b05fb88d9c32d6f66");
  assert.equal(artifact.gapReferences.catalogSourceCounts.sources, 45);
  assert.equal(artifact.gapReferences.catalogSourceCounts.adapterSourceReplayedLocal, 39);
  assert.equal(artifact.gapReferences.catalogSourceCounts.officialBrowsableIdentified, 6);
  assert.equal(artifact.gapReferences.counts.readinessExternalGaps, 36);
  assert.equal(artifact.gapReferences.counts.targetSpecificGapsClosed, 0);
  assert.equal(artifact.gapReferences.counts.replayedCatalogSourceRows, 35);
  assert.equal(artifact.gapReferences.counts.temporallyCurrentCatalogSourceRows, 18);
  assert.equal(artifact.gapReferences.counts.temporalQuarantineCatalogSourceRows, 17);
  assert.equal(artifact.gapReferences.counts
    .gapsWithTemporallyCurrentSourceReplayedReference, 24);
  assert.equal(artifact.gapReferences.counts.gapsWithSourceReplayedReferenceFromThisFlywheel
    + artifact.gapReferences.counts.gapsWithOnlyOtherCatalogReference
    + artifact.gapReferences.counts.gapsWithNoWebSubstitute, 36);
  assert.equal(artifact.gapReferences.catalogSearchScope.exhaustiveInternetClaimed, false);
  assert.equal(artifact.gapReferences.catalogSearchScope.primarySourcesPreferred, true);
  assert.deepEqual(artifact.stageReferenceProgress.map(({ stageNumber }) => stageNumber),
    ["0.5", "1", "1.5", "2", "3", "4"]);
  assert.ok(artifact.stageReferenceProgress.every((stage) => (
    stage.targetSpecificReadinessGapsClosed === 0
      && stage.responsibilityBearingAuthorityGranted === false
      && stage.stageTransitionAuthorized === false
  )));
  assert.equal(artifact.evidencePrinciple.realCasesRemainRealCases, true);
  assert.equal(artifact.evidencePrinciple.realExperienceRemainsRealExperience, true);
  assert.equal(artifact.evidencePrinciple.publicOriginAutomaticallyDowngradesEvidence, false);
  assert.equal(artifact.evidencePrinciple.outsiderCollectionAutomaticallyUpgradesEvidence, false);
  assert.equal(artifact.evidencePrinciple.sourceRealityAdmissionDependsOnRights, false);
  assert.equal(artifact.realityStewardshipBoundary.role,
    "EXTERNAL_REALITY_EVIDENCE_REFRESH_FLYWHEEL");
  assert.deepEqual(artifact.realityStewardshipBoundary.tracks,
    ["OBSERVATIONS", "MISSINGNESS", "RESPONSIBILITY_CASE_REFERENCES"]);
  assert.equal(artifact.realityStewardshipBoundary.ownerAuthority, false);
  assert.equal(artifact.realityStewardshipBoundary.adjudicatorAuthority, false);
  assert.equal(artifact.realityStewardshipBoundary.closureOrReopenAuthority, false);
  assert.equal(artifact.realityStewardshipBoundary.modifiesRealityStewardshipCoreAuthorityApi,
    false);
  assert.equal(artifact.quantitativeBoundary.heterogeneousLanesPooled, false);
  assert.equal(artifact.quantitativeBoundary.targetDomainLossEstimate, null);
  assert.ok(Object.values(artifact.authority).every((value) => value === false));
  assert.ok(artifact.gapReferences.rows.every((row) => row.closureCredit === false
    && row.targetTransferEstablished === false && row.authorityGranted === false));
  const quarantined = artifact.artifactReceipts.filter((row) =>
    row.temporalAuthenticityEstablished === false);
  assert.equal(quarantined.length, 7);
  assert.equal(artifact.artifactReceipts.filter((row) => row.currentCoverage).length, 9);
  const strings = (value, result = []) => {
    if (typeof value === "string") result.push(value);
    else if (Array.isArray(value)) value.forEach((child) => strings(child, result));
    else if (value && typeof value === "object") {
      Object.values(value).forEach((child) => strings(child, result));
    }
    return result;
  };
  for (const receipt of quarantined) {
    assert.deepEqual(strings(receipt).filter((value) =>
      /(?:^|[^A-Z0-9])CURRENT(?:[^A-Z0-9]|$)/u.test(value)), []);
    assert.equal(receipt.currentCoverage, false);
    assert.equal(receipt.closureCredit, false);
    assert.equal(receipt.causalExperienceUnits, 0);
  }
  assert.equal(artifact.readiness.status, "HOLD_TEMPORAL_QUARANTINE_REFERENCE_ONLY");
});

test("source-neutral quality vectors remain self-sealed until unified replay", () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  for (const assessment of artifact.qualityAssessments) {
    const checked = verifyRealCaseQualityAssessment(assessment);
    assert.equal(checked.ok, true);
    assert.equal(checked.sourceArtifactsReverified, false);
    assert.equal(checked.operationalAuthorityEstablished, false);
    assert.ok(Object.values(assessment.policy.operationalCapabilities)
      .every((capability) => capability.authorized === false
        && capability.authorizationRequiresTargetSpecificEvidence === true));
  }
});

test("NTSB cases and BLS experience stay real without losing their native boundaries", () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const ntsb = artifact.lanes.find(({ laneId }) => (
    laneId === "NTSB_COMPLETED_PARTIAL_AUTOMATION_INVESTIGATIONS"));
  const bls = artifact.lanes.find(({ laneId }) => laneId === "BLS_IIF_2024_SOII_CFOI_OIICS");
  assert.equal(ntsb.realityStatus, "REAL_INSTITUTIONAL_OPERATION");
  assert.equal(ntsb.descriptiveMeasurements.completedCases, 6);
  assert.equal(ntsb.descriptiveMeasurements.finalReportFiles, 5);
  assert.equal(ntsb.descriptiveMeasurements.completeDocketDocumentBytesCaptured, false);
  assert.match(ntsb.correlationBoundary, /HIR2602_BINDS_TWO_CASES/);
  assert.match(ntsb.rightsBoundary, /49_USC_1154B/);
  assert.equal(bls.realityStatus, "REAL_EXPERIENCE_AGGREGATE");
  assert.equal(bls.descriptiveMeasurements.privateTotalRecordableRatePer100Fte, "2.3");
  assert.equal(bls.descriptiveMeasurements.cfoiAllFatalOccupationalInjuries, 5070);
  assert.match(bls.denominatorBoundary, /CFOI_RATE_HOURS_ARE_CPS_ESTIMATES/);
  assert.match(bls.missingness.join(" "), /CROSS_ROW_AND_CROSS_COLUMN_COVARIANCE/);
  assert.equal(ntsb.crossLanePoolingPermitted, false);
  assert.equal(bls.crossLanePoolingPermitted, false);
  assert.equal(ntsb.targetDomainTransferEstablished, false);
  assert.equal(bls.targetDomainTransferEstablished, false);
});

test("Judgment Fund payment and GAO adjudication precedents do not become Outsider authority", () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const treasury = artifact.lanes.find(({ laneId }) => laneId === "TREASURY_JUDGMENT_FUND");
  const gao = artifact.lanes.find(({ laneId }) => laneId === "GAO_BID_PROTEST");
  assert.equal(treasury.realityStatus, "REAL_INSTITUTIONAL_OPERATION");
  assert.equal(treasury.descriptiveMeasurements.paymentComponentRows, 16154);
  assert.equal(treasury.descriptiveMeasurements.totalPublishedAmountCents, "317493066734");
  assert.equal(treasury.descriptiveMeasurements.exactRepeatedRawRowOccurrences, 10927);
  assert.equal(treasury.denominatorBoundary,
    "16154_PAYMENT_COMPONENT_ROWS_COVER_FOURTEEN_CONTIGUOUS_PUBLISHED_INTERVALS_THROUGH_2026_07_31; COMPONENT_ROWS_ARE_NOT_UNIQUE_CLAIMS_LOSSES_RECIPIENTS_OR_EXPOSURE");
  assert.match(treasury.rightsBoundary, /RIGHTS_NOT_ESTABLISHED/);
  assert.match(treasury.missingness.join(" "), /RECIPIENT_BANK_SETTLEMENT/);
  assert.equal(gao.descriptiveMeasurements.meritDecisions, 380);
  assert.equal(gao.descriptiveMeasurements.sustains, 53);
  assert.equal(gao.descriptiveMeasurements.agencyNonimplementationInstancesReported, 1);
  assert.equal(gao.descriptiveMeasurements.decisionSampleIncluded, false);
  assert.match(gao.denominatorBoundary, /FILED_AND_CLOSED_DOCKET_AGGREGATES_USE_DIFFERENT_COHORTS/);
  assert.equal(treasury.targetDomainTransferEstablished, false);
  assert.equal(gao.targetDomainTransferEstablished, false);
  const treasuryQuality = artifact.qualityAssessments.find(({ sourceId }) => (
    sourceId === "TREASURY_JUDGMENT_FUND"));
  assert.equal(treasuryQuality.dimensions.institutionalAuthority.status, "VERIFIED");
  assert.match(treasuryQuality.dimensions.institutionalAuthority.basis,
    /VERIFIED_INSTITUTIONAL_AUTHORITY_NEVER_TRANSFERS_AUTHORITY_TO_OUTSIDER/);
  assert.ok(Object.values(artifact.authority).every((value) => value === false));
});

test("NCUA, PBGC, and MSHA remain separate real source-domain experience lanes", () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const ncua = artifact.lanes.find(({ laneId }) => (
    laneId === "NCUA_NCUSIF_2025_AUDITED_EXPERIENCE"));
  const pbgc = artifact.lanes.find(({ laneId }) => (
    laneId === "PBGC_PENSION_INSURANCE_2024_2025_EXPERIENCE"));
  const msha = artifact.lanes.find(({ laneId }) => (
    laneId === "MSHA_ACCIDENT_AND_EMPLOYMENT_2000_2026"));
  assert.equal(ncua.descriptiveMeasurements.netPositionThousandsUsd, "23863991");
  assert.equal(ncua.descriptiveMeasurements.provisionForInsuranceLossesThousandsUsd, "4888");
  assert.match(ncua.correlationBoundary, /MONTHLY_INSURANCE_LOSS_REDUCTION_IS_NOT_ANNUAL_PROVISION/);
  assert.equal(pbgc.descriptiveMeasurements.workbookEdition, "2024_FIRST_INSTALLMENT");
  assert.equal(pbgc.descriptiveMeasurements.directPayees, 911776);
  assert.match(pbgc.denominatorBoundary, /HETEROGENEOUS_FRAMES/);
  assert.equal(msha.descriptiveMeasurements.accidentRows, 274448);
  assert.equal(msha.descriptiveMeasurements.mine2025HoursWorked, "445694835");
  assert.equal(msha.descriptiveMeasurements.derivedIncidenceRate, null);
  assert.match(msha.denominatorBoundary, /CURRENT_WINDOWS_ARE_NOT_ALIGNED/);
  assert.ok([ncua, pbgc, msha].every((lane) => (
    lane.crossLanePoolingPermitted === false
      && lane.targetDomainTransferEstablished === false
      && lane.operationalAuthorityGranted === false)));
});

test("CDI and NCIGF remain separate real rate and guaranty-fund experience lanes", () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const cdi = artifact.lanes.find(({ laneId }) => (
    laneId === "CDI_RATE_FILING_AND_REGISTRY_EXPERIENCE"));
  const ncigf = artifact.lanes.find(({ laneId }) => (
    laneId === "NCIGF_ASSESSMENT_CAPACITY_EXPERIENCE"));
  assert.equal(cdi.realityStatus, "REAL_INSTITUTIONAL_OPERATION");
  assert.equal(cdi.descriptiveMeasurements.filedEarnedExposures, 111547);
  assert.equal(cdi.descriptiveMeasurements.filedAdjustedPremiumUsd, "214901630");
  assert.equal(cdi.descriptiveMeasurements.publishedLossTotalShortByUsd, "1");
  assert.equal(cdi.descriptiveMeasurements.filingDispositionObserved, false);
  assert.equal(cdi.descriptiveMeasurements.approvedRateObserved, false);
  assert.equal(cdi.descriptiveMeasurements.chargedPolicyPriceObserved, false);
  assert.match(cdi.denominatorBoundary, /ONE_FILED_COHORT/);
  assert.match(cdi.correlationBoundary, /ONE_DOLLAR_DIFFERENCE_IS_PRESERVED/);
  assert.equal(ncigf.realityStatus, "REAL_EXPERIENCE_AGGREGATE");
  assert.equal(ncigf.descriptiveMeasurements.quarterlyReportingRows, 126);
  assert.equal(ncigf.descriptiveMeasurements.unavailable2025PremiumRows, 85);
  assert.equal(ncigf.descriptiveMeasurements.maximumAssessmentCapacity2026ReportedToDateUsd,
    "7600879728.72");
  assert.equal(ncigf.descriptiveMeasurements.inceptionNetAssessmentsUsd,
    "20893256833.701");
  assert.equal(ncigf.descriptiveMeasurements.tailOrDependenceModelFitted, false);
  assert.match(ncigf.rightsBoundary, /SOLE_ACCOUNTING_LIABILITY_PURPOSE/);
  assert.match(ncigf.correlationBoundary, /NOT_ASSUMED_RANDOM/);
  assert.ok([cdi, ncigf].every((lane) => (
    lane.crossLanePoolingPermitted === false
      && lane.targetDomainTransferEstablished === false
      && lane.operationalAuthorityGranted === false)));
  assert.equal(artifact.extensionFrontier.cdiNcigf.acceptedFilingTreatedAsApprovedOrChargedPrice,
    false);
  assert.equal(artifact.extensionFrontier.cdiNcigf
    .guarantyFundCapacityTreatedAsOutsiderCashCapitalOrCustody, false);
});

test("FRA diagnostics and PHMSA receipt remain separate with PHMSA model admission zero", () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const fra = artifact.lanes.find(({ laneId }) => laneId === "FRA_FORM54_FORM55_2015_2019");
  const phmsa = artifact.lanes.find(({ laneId }) => (
    laneId === "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE"));
  assert.equal(fra.realityStatus, "REAL_EXPERIENCE_AGGREGATE");
  assert.equal(fra.descriptiveMeasurements.form54JointCdOneRows, 10449);
  assert.equal(fra.descriptiveMeasurements.form55PublishedRows, 48843);
  assert.equal(fra.descriptiveMeasurements.form55DeduplicatedMonthlyRailroadRows, 48842);
  assert.equal(fra.descriptiveMeasurements.fiveYearTotalTrainMiles, "3529396874");
  assert.equal(fra.descriptiveMeasurements.fiveYearIncidentRatePerMillionTrainMiles,
    "2.960562491");
  assert.equal(fra.descriptiveMeasurements.reportedDamageIsPaidIncurredOrUltimateLoss, false);
  assert.match(fra.denominatorBoundary, /ABOVE_THE_ANNUAL_REPORTING_THRESHOLD/);
  assert.match(fra.correlationBoundary, /CALENDAR_ALIGNMENT_IS_NOT_ROW_LINKAGE/);
  assert.equal(phmsa.realityStatus, "REAL_CASE_RECORDED");
  assert.equal(phmsa.descriptiveMeasurements.sourceReceiptOnly, true);
  assert.equal(phmsa.descriptiveMeasurements.reportedRows, 1589);
  assert.equal(phmsa.descriptiveMeasurements.headerColumns, 468);
  assert.equal(phmsa.descriptiveMeasurements.latestPopulationCompletenessEstablished, false);
  assert.equal(phmsa.descriptiveMeasurements.matchedAnnualExposureCaptured, false);
  assert.equal(phmsa.sourceReceiptOnly, true);
  assert.equal(phmsa.outcomeOrActuarialModelInputAdmitted, false);
  assert.equal(phmsa.frequencyOrSeverityRateAdmitted, false);
  assert.equal(phmsa.pricingInputAdmitted, false);
  assert.deepEqual(phmsa.candidateUseAfterFullSourceReplayAndApplicableRightsReview,
    ["SOURCE_RECEIPT_DESCRIPTION", "RECEIPT_QUALITY_AND_MISSINGNESS_REFINEMENT"]);
  assert.ok([fra, phmsa].every((lane) => lane.crossLanePoolingPermitted === false
    && lane.targetDomainTransferEstablished === false
    && lane.operationalAuthorityGranted === false));
  assert.equal(artifact.extensionFrontier.fraPhmsa.fraAndPhmsaPoolingPerformed, false);
  assert.equal(artifact.extensionFrontier.fraPhmsa.phmsaOutcomeOrActuarialModelInputAdmitted,
    false);
  assert.equal(artifact.extensionFrontier.fraPhmsa.phmsaFrequencyOrSeverityRateAdmitted,
    false);
  assert.equal(artifact.extensionFrontier.fraPhmsa.phmsaPricingInputAdmitted, false);
  const phmsaQuality = artifact.qualityAssessments.find(({ sourceId }) => (
    sourceId === "PHMSA_GAS_DISTRIBUTION_INCIDENTS_2010_PRESENT_CAPTURE"));
  assert.equal(phmsaQuality.policy.evidenceCapabilities.EXPOSURE_FREQUENCY
    .qualityRequirementsSatisfiedFromDeclaredFacts, false);
  assert.equal(phmsaQuality.policy.evidenceCapabilities.ECONOMIC_SEVERITY
    .qualityRequirementsSatisfiedFromDeclaredFacts, false);
  assert.equal(phmsaQuality.policy.operationalCapabilities.TARGET_DOMAIN_PRICE.authorized, false);
});

test("NHTSA recall and remedy status remains real reference without repair or authority inflation", () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const nhtsa = artifact.lanes.find(({ laneId }) => (
    laneId === "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE"));
  assert.equal(nhtsa.realityStatus, "REAL_INSTITUTIONAL_OPERATION");
  assert.equal(nhtsa.descriptiveMeasurements.recallRows, 244499);
  assert.equal(nhtsa.descriptiveMeasurements.uniqueCampaigns, 15197);
  assert.equal(nhtsa.descriptiveMeasurements.totalPotentialAffectedSummedOncePerCampaign,
    "699086836");
  assert.equal(nhtsa.descriptiveMeasurements.actualExposureOrUniqueVehiclesOnRoadEstablished,
    false);
  assert.equal(nhtsa.descriptiveMeasurements.quarterlyInvalidPeriodRows, 2);
  assert.deepEqual(nhtsa.descriptiveMeasurements.quarterlyInvalidPeriodExamples,
    ["2099-", "2022"]);
  assert.deepEqual(nhtsa.descriptiveMeasurements.retainedArithmeticAnomaly,
    { involved: "0", remedied: "22", removed: "584" });
  assert.equal(nhtsa.descriptiveMeasurements.quarterlyStatusInvolvedGreaterCampaigns, 17);
  assert.equal(nhtsa.descriptiveMeasurements.quarterlyRecallPotentialAffectedGreaterCampaigns,
    36);
  assert.equal(nhtsa.descriptiveMeasurements.quarterlyPopulationTotalAbsoluteDifference,
    "316960");
  assert.equal(nhtsa.descriptiveMeasurements.current2026PeriodIncompleteAtFreeze, true);
  assert.match(nhtsa.denominatorBoundary, /RIGHT_CENSORED_AT_FREEZE/);
  assert.match(nhtsa.correlationBoundary, /NOT_INDEPENDENT_REPAIR_EVENTS/);
  assert.equal(nhtsa.sourceDomainRecallAndRemedyStatusReferenceOnly, true);
  assert.equal(nhtsa.manufacturerReportedStatus, true);
  assert.equal(nhtsa.rightCensored, true);
  assert.equal(nhtsa.affectedPartyReceiptEstablished, false);
  assert.equal(nhtsa.completeRepairEstablished, false);
  assert.equal(nhtsa.independentCausalityEstablished, false);
  assert.equal(nhtsa.lossCalibrationEstablished, false);
  assert.equal(nhtsa.enforcementOrderBodyCaptured, false);
  assert.equal(nhtsa.consentOrderBodyCaptured, false);
  assert.equal(nhtsa.outsiderRemedyEstablished, false);
  assert.equal(nhtsa.trainingInputAdmitted, false);
  assert.equal(nhtsa.pricingInputAdmitted, false);
  assert.equal(nhtsa.crossLanePoolingPermitted, false);
  assert.equal(nhtsa.targetDomainTransferEstablished, false);
  assert.equal(nhtsa.operationalAuthorityGranted, false);
  assert.equal(artifact.extensionFrontier.nhtsaRecallRemedy
    .sourceDomainRecallAndRemedyStatusReferenceIncluded, true);
  assert.equal(artifact.extensionFrontier.nhtsaRecallRemedy
    .enforcementOrConsentOrderBodyCaptured, false);
  assert.equal(artifact.extensionFrontier.nhtsaRecallRemedy.trainingInputAdmitted, false);
  assert.equal(artifact.extensionFrontier.nhtsaRecallRemedy.pricingInputAdmitted, false);
  const quality = artifact.qualityAssessments.find(({ sourceId }) => (
    sourceId === "NHTSA_RECALL_AND_REMEDY_STATUS_REFERENCE"));
  assert.equal(quality.policy.evidenceCapabilities.INDEPENDENT_OUTCOME_SENSING
    .qualityRequirementsSatisfiedFromDeclaredFacts, false);
  assert.equal(quality.policy.evidenceCapabilities.ECONOMIC_SEVERITY
    .qualityRequirementsSatisfiedFromDeclaredFacts, false);
  assert.equal(quality.policy.operationalCapabilities.TARGET_DOMAIN_PRICE.authorized, false);
});

test("BridgeData remains one real lab trajectory on training hold with zero trainer rows", () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const lane = artifact.lanes.find(({ laneId }) => (
    laneId === "BRIDGEDATA_V2_REAL_LAB_ROBOT_TRAJECTORY_CANDIDATE"));
  assert.equal(lane.realityStatus, "CONTROLLED_REAL_EXECUTION");
  assert.equal(lane.descriptiveMeasurements.capturedWholeRecords, 1);
  assert.equal(lane.descriptiveMeasurements.publishedTrainExamples, 53192);
  assert.equal(lane.descriptiveMeasurements.publishedTrainShards, 1024);
  assert.equal(lane.descriptiveMeasurements.capturedCompleteTrainShards, 0);
  assert.equal(lane.descriptiveMeasurements.trainingCandidateDecision,
    "HOLD_FOR_SEMANTIC_CONTENT_AND_GOVERNANCE_REVIEW");
  assert.equal(lane.descriptiveMeasurements.trainerRowsEnqueued, 0);
  assert.equal(lane.descriptiveMeasurements.fullCorpusSchemaConformanceEstablished, false);
  assert.equal(lane.descriptiveMeasurements.fullSemanticContractEstablished, false);
  assert.equal(lane.descriptiveMeasurements.trajectoryCorrelationClustersMaterialized, false);
  assert.equal(lane.descriptiveMeasurements.targetRobotTransferEstablished, false);
  assert.equal(lane.realLabRobotTrajectoryReferenceOnly, true);
  assert.equal(lane.trainingCandidateOnHold, true);
  assert.equal(lane.trainingInputAdmitted, false);
  assert.equal(lane.targetDomainTransferEstablished, false);
  assert.equal(lane.crossLanePoolingPermitted, false);
  assert.match(lane.denominatorBoundary, /53192_TRAIN_EXAMPLES_AND_1024_TRAIN_SHARDS/);
  assert.match(lane.correlationBoundary, /NO_IID_FULL_CORPUS_OR_TARGET_CORRELATION/);
  assert.equal(artifact.extensionFrontier.bridgeDataV2.trainerRowsEnqueued, 0);
  assert.equal(artifact.extensionFrontier.bridgeDataV2.fullCorpusReplayed, false);
  assert.equal(artifact.extensionFrontier.bridgeDataV2.semanticContractEstablished, false);
  assert.equal(artifact.extensionFrontier.bridgeDataV2.correlationStructureEstablished, false);
  const gap = artifact.gapReferences.rows.find(({ gapId }) => (
    gapId === "S15_REAL_CAUSAL_JUDGE_SURVIVAL_EVIDENCE"));
  assert(gap.sourceReplayedByThisFlywheelLaneIds.includes(lane.laneId));
  assert.match(gap.publicEvidenceCanEstablish,
    /BRIDGEDATA_CONTRIBUTES_ONLY_REAL_EXECUTION_SCHEMA_NOT_OUTCOME_FAILURE_ASSIGNMENT_OR_SURVIVAL/);
  const quality = artifact.qualityAssessments.find(({ sourceId }) => sourceId === lane.laneId);
  assert.equal(quality.policy.operationalCapabilities.AUTOMATIC_TRAINING.authorized, false);
  assert.equal(quality.policy.operationalCapabilities.TARGET_DOMAIN_PRICE.authorized, false);
});

test("Waymo remains a non-pooled publisher outcome-exposure reference with conflicts intact", () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const lane = artifact.lanes.find(({ laneId }) => (
    laneId === "WAYMO_RIDER_ONLY_OUTCOME_EXPOSURE_REFERENCE"));
  assert.equal(lane.realityStatus, "REAL_EXPERIENCE_AGGREGATE");
  assert.equal(lane.descriptiveMeasurements.displayedRoundedRiderOnlyMiles, "220613000");
  assert.equal(lane.descriptiveMeasurements.displayedExposureIsExactUnroundedMiles, false);
  assert.equal(lane.descriptiveMeasurements.sgoOutcomeMembershipRows, 1664);
  assert.equal(lane.descriptiveMeasurements.uniqueSgoReportIds, 1659);
  assert.equal(lane.descriptiveMeasurements.duplicateSgoIdVersionPairs, 3);
  assert.equal(lane.descriptiveMeasurements.duplicatePairsWithOutcomeFlagConflicts, 2);
  assert.equal(lane.descriptiveMeasurements
    .duplicatePairsWithSuppressedLocationTextConflicts, 1);
  assert.equal(lane.descriptiveMeasurements.publishedLiteralNanTokens, 164);
  assert.equal(lane.descriptiveMeasurements.csv4DuplicateCompositeRows, 544);
  assert.equal(lane.descriptiveMeasurements.csv4BenchmarkCrashCountConflictKeys, 489);
  assert.equal(lane.descriptiveMeasurements.retrospectiveCalendarSplitOnly, true);
  assert.equal(lane.descriptiveMeasurements.prospectiveOrExternalTargetHoldoutEstablished,
    false);
  assert.equal(lane.nonPooledOutcomeExposureReferenceOnly, true);
  assert.equal(lane.underlyingWorldTruthEstablished, false);
  assert.equal(lane.independentAdjudicationEstablished, false);
  assert.equal(lane.trainingInputAdmitted, false);
  assert.equal(lane.pricingInputAdmitted, false);
  assert.equal(lane.targetDomainTransferEstablished, false);
  assert.equal(lane.crossLanePoolingPermitted, false);
  assert.match(lane.denominatorBoundary, /DISPLAYED_ROUNDED/);
  assert.match(lane.correlationBoundary, /TWO_OUTCOME_AND_ONE_LOCATION_CONFLICT/);
  assert.equal(artifact.extensionFrontier.waymoSafetyImpact.publishedLiteralNanTokens, 164);
  assert.equal(artifact.extensionFrontier.waymoSafetyImpact
    .prospectiveOrExternalTargetHoldoutEstablished, false);
  const gap = artifact.gapReferences.rows.find(({ gapId }) => (
    gapId === "S2_EXTERNAL_HOLDOUT_AND_CORRELATION_VALIDATION"));
  assert(gap.sourceReplayedByThisFlywheelLaneIds.includes(lane.laneId));
  assert.match(gap.publicEvidenceCanEstablish,
    /WAYMO_IS_RETROSPECTIVE_ONLY_NOT_A_PROSPECTIVE_OR_EXTERNAL_TARGET_HOLDOUT/);
  const quality = artifact.qualityAssessments.find(({ sourceId }) => sourceId === lane.laneId);
  assert.equal(quality.policy.evidenceCapabilities.INDEPENDENT_OUTCOME_SENSING
    .qualityRequirementsSatisfiedFromDeclaredFacts, false);
  assert.equal(quality.policy.operationalCapabilities.TARGET_DOMAIN_PRICE.authorized, false);
});

test("ClinicalTrials posted results remain study-rooted reference evidence only", () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const lane = artifact.lanes.find(({ laneId }) =>
    laneId === "CLINICALTRIALS_SPONSOR_POSTED_AGGREGATE_RESULTS_REFERENCE");
  assert.equal(lane.realityStatus, "REAL_INSTITUTIONAL_OPERATION");
  assert.equal(lane.descriptiveMeasurements.completeFrozenQueryStudyRecords, 18);
  assert.equal(lane.descriptiveMeasurements.totalPostedOutcomeMeasureRows, 242);
  assert.equal(lane.descriptiveMeasurements.crossStudyAffectedCountsPooled, false);
  assert.equal(lane.descriptiveMeasurements.crossStudyRatesCalculated, false);
  assert.equal(lane.descriptiveMeasurements.causalEffectEstablished, false);
  assert.equal(lane.descriptiveMeasurements.targetTransferEstablished, false);
  assert.equal(lane.descriptiveMeasurements.trainerRowsEnqueued, 0);
  assert.match(lane.correlationBoundary, /NCT_ID_IS_THE_STUDY_ROOT/u);
  assert.match(lane.rightsBoundary, /COPYRIGHT_TERMS_ARE_NOT_ESTABLISHED/u);
  const clinicalQuality = artifact.qualityAssessments.find(({ sourceId }) =>
    sourceId === lane.laneId);
  assert.equal(clinicalQuality.dimensions.rightsAndConsent.status, "UNESTABLISHED");
  assert.equal(artifact.extensionFrontier.clinicalTrials
    .sponsorOrPersonNamesPersistedInDerivedArtifact, false);
  assert.equal(artifact.extensionFrontier.clinicalTrials.rightsTermsSourceReplayed, false);
  assert.equal(artifact.extensionFrontier.clinicalTrials.rightsDetermination,
    "NOT_ESTABLISHED_URL_ONLY_NOT_REPLAYED");
  assert.equal(artifact.extensionFrontier.clinicalTrials.trainingInputAdmitted, false);
  assert.equal(artifact.extensionFrontier.clinicalTrials.pricingInputAdmitted, false);
  assert.equal(artifact.authority.TRAIN, false);
  assert.equal(artifact.authority.PRICE, false);
});

test("caller reseal cannot pool domains, grant authority, or close a mapped gap", () => {
  const artifact = structuredClone(buildRealCaseResponsibilityFlywheelProjection());
  artifact.authority.PRICE = true;
  artifact.authority.TRAIN = true;
  artifact.quantitativeBoundary.heterogeneousLanesPooled = true;
  artifact.quantitativeBoundary.crossLaneDollarTotal = "999";
  artifact.gapReferences.rows[0].closureCredit = true;
  artifact.gapReferences.rows[0].authorityGranted = true;
  const checked = verifyRealCaseResponsibilityFlywheel(reseal(artifact));
  assert.equal(checked.ok, false);
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.operationalAuthorityGranted, false);
});

test("2000 and 2099 coherent time reseals fail builder standalone and full entry points", async () => {
  const canonical = buildRealCaseResponsibilityFlywheelProjection({
    generatedAt: "2026-08-28T08:40:00.720Z",
  });
  assert.equal(canonical.generatedAt, "2026-08-28T08:40:00.720Z");
  assert.equal(canonical.canonicalTimeBoundary.generatedAtIsCodeFixed, true);
  assert.equal(canonical.canonicalTimeBoundary.candidateGeneratedAtReplayedByVerifier, false);
  assert.equal(canonical.canonicalTimeBoundary.pastOrFutureCoherentResealAccepted, false);
  for (const generatedAt of ["2000-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z"]) {
    assert.throws(() => buildRealCaseResponsibilityFlywheelProjection({ generatedAt }),
      /CANONICAL_GENERATED_AT_MISMATCH/);
    await assert.rejects(buildRealCaseResponsibilityFlywheelFromSources({
      sources: SOURCES, generatedAt,
    }), /CANONICAL_GENERATED_AT_MISMATCH/);
    const attack = structuredClone(canonical);
    attack.generatedAt = generatedAt;
    const resealed = reseal(attack);
    const standalone = verifyRealCaseResponsibilityFlywheel(resealed);
    assert.equal(standalone.ok, false);
    assert.match(standalone.error, /CANONICAL_GENERATED_AT_MISMATCH/);
    const full = await verifyRealCaseResponsibilityFlywheelAgainstSources(resealed,
      { sources: SOURCES });
    assert.equal(full.ok, false);
    assert.equal(full.sourceArtifactsReverified, false);
    assert.match(full.error, /CANONICAL_GENERATED_AT_MISMATCH/);
  }
});

test("source-aware API rejects caller results, callbacks, booleans, and extensions", async () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const checked = await verifyRealCaseResponsibilityFlywheelAgainstSources(artifact, {
    sources: SOURCES,
    sourceArtifactsReverified: true,
    verify() { return true; },
  });
  assert.equal(checked.ok, false);
  assert.match(checked.error, /SOURCE_VERIFY_OPTIONS_INVALID/);

  await assert.rejects(buildRealCaseResponsibilityFlywheelFromSources({
    sources: { ...SOURCES, callerReceipt: { ok: true } },
  }), /SOURCE_PATH_PROFILE_INVALID/);
  await assert.rejects(buildRealCaseResponsibilityFlywheelFromSources({
    sources: { ...SOURCES, progress: { ...SOURCES.progress,
      sources: { ...SOURCES.progress.sources, verify() { return true; } } } },
  }), /PROGRESS_SOURCE_PATH_PROFILE_INVALID/);
});

test("NCUA wrapper preserves the inner fail-closed diagnostic", () => {
  assert.throws(() => requireNcuaPbgcMshaFullReceipt({
    ok: false,
    verificationLevel: "FULL_SOURCE_REPLAY_FAILED",
    error: "CONTROLLED_NCUA_INNER_FAILURE",
  }), /RESPONSIBILITY_FLYWHEEL_NCUA_PBGC_MSHA_SOURCE_REPLAY_FAILED:CONTROLLED_NCUA_INNER_FAILURE/u);
});

test("CLI exposes explicit source roles and rejects incomplete invocations", () => {
  const script = p("scripts/real-case-responsibility-flywheel.mjs");
  const help = spawnSync(process.execPath, [script, "--help"], {
    cwd: ROOT, encoding: "utf8",
  });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /--progress-artifact/);
  assert.match(help.stdout, /--wave5-intake-artifact/);
  assert.match(help.stdout, /--remedy-source-dir/);
  assert.match(help.stdout, /--ntsb-bls-source-dir/);
  assert.match(help.stdout, /--judgment-gao-source-dir/);
  assert.match(help.stdout, /--ncua-pbgc-msha-source-dir/);
  assert.match(help.stdout, /--cdi-ncigf-source-dir/);
  assert.match(help.stdout, /--fra-phmsa-source-dir/);
  assert.match(help.stdout, /--nhtsa-recall-remedy-source-dir/);
  assert.match(help.stdout, /--bridgedata-v2-source-dir/);
  assert.match(help.stdout, /--waymo-safety-impact-source-dir/);
  assert.match(help.stdout, /--clinicaltrials-source-dir/);
  assert.match(help.stdout, /grants no training, price, guarantee, capital, custody/);
  assert.match(help.stdout, /code-fixed canonical generated-at/);
  const incomplete = spawnSync(process.execPath, [script, "build", "--out", "unused.json"], {
    cwd: ROOT, encoding: "utf8",
  });
  assert.notEqual(incomplete.status, 0);
  assert.match(incomplete.stderr, /ARGUMENT_REQUIRED:--temporal-audit-manifest/);

  const sourceArguments = [
    "--temporal-audit-manifest", SOURCES.temporalAudit.manifestPath,
    "--progress-artifact", SOURCES.progress.artifactPath,
    "--wave5-intake-artifact", SOURCES.wave5Intake.artifactPath,
    "--wave5-source-dir", path.dirname(SOURCES.progress.sources.wave5.traceCommonsDirectory),
    "--osha-zip", SOURCES.progress.sources.osha.archivePath,
    "--aiid-archive", SOURCES.progress.sources.aiid.archivePath,
    "--aiid-terms", SOURCES.progress.sources.aiid.termsSnapshotPath,
    "--institutional-remedy-source-dir",
    SOURCES.progress.sources.institutionalRemedies.sourceDirectory,
    "--rma-zip", SOURCES.progress.sources.rma.archivePath,
    "--rma-layout", SOURCES.progress.sources.rma.recordLayoutPath,
    "--cas-source-dir", SOURCES.progress.sources.cas.sourceDirectory,
    "--maude-artifact", SOURCES.fdaMaude.artifactPath,
    "--maude-source-dir", SOURCES.fdaMaude.sourceDirectory,
    "--dmv-artifact", SOURCES.caDmvAv.artifactPath,
    "--dmv-source-dir", SOURCES.caDmvAv.sourceDirectory,
    "--capital-artifact", SOURCES.institutionalCapitalClaims.artifactPath,
    "--capital-source-dir", SOURCES.institutionalCapitalClaims.sourceDirectory,
    "--fema-artifact", SOURCES.femaRealCases.artifactPath,
    "--fema-source-dir", SOURCES.femaRealCases.sourceDirectory,
    "--remedy-artifact", SOURCES.remedyPaymentRecovery.artifactPath,
    "--remedy-source-dir", SOURCES.remedyPaymentRecovery.sourceDirectory,
    "--ntsb-bls-artifact", SOURCES.ntsbBlsOutcome.artifactPath,
    "--ntsb-bls-source-dir", SOURCES.ntsbBlsOutcome.sourceDirectory,
    "--judgment-gao-artifact", SOURCES.judgmentFundGao.artifactPath,
    "--judgment-gao-source-dir", SOURCES.judgmentFundGao.sourceDirectory,
    "--ncua-pbgc-msha-artifact", SOURCES.ncuaPbgcMsha.artifactPath,
    "--ncua-pbgc-msha-source-dir", SOURCES.ncuaPbgcMsha.sourceDirectory,
    "--cdi-ncigf-artifact", SOURCES.cdiNcigf.artifactPath,
    "--cdi-ncigf-source-dir", SOURCES.cdiNcigf.sourceDirectory,
    "--fra-phmsa-artifact", SOURCES.fraPhmsa.artifactPath,
    "--fra-phmsa-source-dir", SOURCES.fraPhmsa.sourceDirectory,
    "--nhtsa-recall-remedy-artifact", SOURCES.nhtsaRecallRemedy.artifactPath,
    "--nhtsa-recall-remedy-source-dir", SOURCES.nhtsaRecallRemedy.sourceDirectory,
    "--bridgedata-v2-artifact", SOURCES.bridgeDataV2.artifactPath,
    "--bridgedata-v2-source-dir", SOURCES.bridgeDataV2.sourceDirectory,
    "--waymo-safety-impact-artifact", SOURCES.waymoSafetyImpact.artifactPath,
    "--waymo-safety-impact-source-dir", SOURCES.waymoSafetyImpact.sourceDirectory,
    "--clinicaltrials-artifact", SOURCES.clinicalTrials.artifactPath,
    "--clinicaltrials-source-dir", SOURCES.clinicalTrials.sourceDirectory,
  ];
  for (const generatedAt of ["2000-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z"]) {
    const rejectedTime = spawnSync(process.execPath, [script, "build", ...sourceArguments,
      "--out", path.join(tmpdir(), `unused-${generatedAt.slice(0, 4)}.json`),
      "--generated-at", generatedAt], { cwd: ROOT, encoding: "utf8" });
    assert.notEqual(rejectedTime.status, 0);
    assert.match(rejectedTime.stderr, /CANONICAL_GENERATED_AT_MISMATCH/);
  }
});

test("final-v1 has a self-sealed machine-readable supersession marker for final-v2", {
  skip: !existsSync(p("artifacts/real-case-responsibility-flywheel-20260821/final-v1/superseded-by.json")),
}, () => {
  const markerPath = p(
    "artifacts/real-case-responsibility-flywheel-20260821/final-v1/superseded-by.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  const { markerHash, ...body } = marker;
  assert.equal(markerHash, `sha256:${createHash("sha256")
    .update(`${marker.schema}\0${canonicalizeStrict(body)}`).digest("hex")}`);
  for (const side of ["superseded", "successor"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].artifactFileBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].artifactFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
    assert.equal(artifact.artifactReceipts.length, marker[side].receiptCount);
    assert.equal(artifact.lanes.length, marker[side].laneCount);
  }
  assert.equal(marker.previousArtifactBytesPreserved, true);
  assert.equal(marker.previousArtifactIsCurrentCanonical, false);
  assert.equal(marker.successorRequiresFullSourceReplay, true);
  assert.equal(marker.targetSpecificGapClosureCredit, 0);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v2 has a self-sealed machine-readable supersession marker for final-v3", {
  skip: !existsSync(p("artifacts/real-case-responsibility-flywheel-20260821/final-v2/superseded-by.json")),
}, () => {
  const markerPath = p(
    "artifacts/real-case-responsibility-flywheel-20260821/final-v2/superseded-by.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  const { markerHash, ...body } = marker;
  assert.equal(markerHash, `sha256:${createHash("sha256")
    .update(`${marker.schema}\0${canonicalizeStrict(body)}`).digest("hex")}`);
  for (const side of ["superseded", "successor"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].artifactFileBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].artifactFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
    assert.equal(artifact.artifactReceipts.length, marker[side].receiptCount);
    assert.equal(artifact.lanes.length, marker[side].laneCount);
  }
  assert.equal(marker.previousArtifactBytesPreserved, true);
  assert.equal(marker.previousArtifactIsCurrentCanonical, false);
  assert.equal(marker.successorRequiresFullSourceReplay, true);
  assert.equal(marker.targetSpecificGapClosureCredit, 0);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v3 has a self-sealed machine-readable supersession marker for final-v4", {
  skip: !existsSync(p("artifacts/real-case-responsibility-flywheel-20260821/final-v3/superseded-by.json")),
}, () => {
  const markerPath = p(
    "artifacts/real-case-responsibility-flywheel-20260821/final-v3/superseded-by.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  const { markerHash, ...body } = marker;
  assert.equal(markerHash, `sha256:${createHash("sha256")
    .update(`${marker.schema}\0${canonicalizeStrict(body)}`).digest("hex")}`);
  for (const side of ["superseded", "successor"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].artifactFileBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].artifactFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
    assert.equal(artifact.artifactReceipts.length, marker[side].receiptCount);
    assert.equal(artifact.lanes.length, marker[side].laneCount);
  }
  assert.equal(marker.previousArtifactBytesPreserved, true);
  assert.equal(marker.previousArtifactIsCurrentCanonical, false);
  assert.equal(marker.successorRequiresFullSourceReplay, true);
  assert.equal(marker.targetSpecificGapClosureCredit, 0);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v4 has a self-sealed machine-readable supersession marker for final-v5", {
  skip: !existsSync(p("artifacts/real-case-responsibility-flywheel-20260821/final-v4/superseded-by.json")),
}, () => {
  const markerPath = p(
    "artifacts/real-case-responsibility-flywheel-20260821/final-v4/superseded-by.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  const { markerHash, ...body } = marker;
  assert.equal(markerHash, `sha256:${createHash("sha256")
    .update(`${marker.schema}\0${canonicalizeStrict(body)}`).digest("hex")}`);
  for (const side of ["superseded", "successor"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].artifactFileBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].artifactFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
    assert.equal(artifact.artifactReceipts.length, marker[side].receiptCount);
    assert.equal(artifact.lanes.length, marker[side].laneCount);
  }
  assert.equal(marker.previousArtifactBytesPreserved, true);
  assert.equal(marker.previousArtifactIsCurrentCanonical, false);
  assert.equal(marker.successorRequiresFullSourceReplay, true);
  assert.equal(marker.targetSpecificGapClosureCredit, 0);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v5 has a self-sealed machine-readable time-lock supersession marker for final-v6", {
  skip: !existsSync(p("artifacts/real-case-responsibility-flywheel-20260821/final-v5/superseded-by.json")),
}, () => {
  const markerPath = p(
    "artifacts/real-case-responsibility-flywheel-20260821/final-v5/superseded-by.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  const { markerHash, ...body } = marker;
  assert.equal(markerHash, `sha256:${createHash("sha256")
    .update(`${marker.schema}\0${canonicalizeStrict(body)}`).digest("hex")}`);
  for (const side of ["superseded", "successor"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].artifactFileBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].artifactFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
    assert.equal(artifact.artifactReceipts.length, marker[side].receiptCount);
    assert.equal(artifact.lanes.length, marker[side].laneCount);
  }
  assert.equal(marker.canonicalGeneratedAt, "2026-08-21T16:00:00.000Z");
  assert.equal(marker.candidateGeneratedAtUsedForReplay, false);
  assert.equal(marker.pastOrFutureCoherentResealAccepted, false);
  assert.equal(marker.previousArtifactBytesPreserved, true);
  assert.equal(marker.previousArtifactIsCurrentCanonical, false);
  assert.equal(marker.successorRequiresFullSourceReplay, true);
  assert.equal(marker.targetSpecificGapClosureCredit, 0);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v6 has a self-sealed BridgeData and Waymo supersession marker for final-v7", {
  skip: !existsSync(p("artifacts/real-case-responsibility-flywheel-20260821/final-v6/superseded-by.json")),
}, () => {
  const markerPath = p(
    "artifacts/real-case-responsibility-flywheel-20260821/final-v6/superseded-by.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  const { markerHash, ...body } = marker;
  assert.equal(markerHash, `sha256:${createHash("sha256")
    .update(`${marker.schema}\0${canonicalizeStrict(body)}`).digest("hex")}`);
  for (const side of ["superseded", "successor"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].artifactFileBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].artifactFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
    assert.equal(artifact.artifactReceipts.length, marker[side].receiptCount);
    assert.equal(artifact.lanes.length, marker[side].laneCount);
  }
  assert.equal(marker.canonicalGeneratedAt, "2026-08-22T00:15:00.000Z");
  assert.equal(marker.bridgeTrainingCandidateHeld, true);
  assert.equal(marker.bridgeTrainerRowsEnqueued, 0);
  assert.equal(marker.waymoCrossLanePoolingPerformed, false);
  assert.equal(marker.targetTransferEstablished, false);
  assert.equal(marker.previousArtifactBytesPreserved, true);
  assert.equal(marker.previousArtifactIsCurrentCanonical, false);
  assert.equal(marker.successorRequiresFullSourceReplay, true);
  assert.equal(marker.targetSpecificGapClosureCredit, 0);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v7 has a self-sealed ClinicalTrials supersession marker for final-v8", {
  skip: !existsSync(p("artifacts/real-case-responsibility-flywheel-20260821/final-v7/superseded-by.json")),
}, () => {
  const markerPath = p(
    "artifacts/real-case-responsibility-flywheel-20260821/final-v7/superseded-by.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8"));
  const { markerHash, ...body } = marker;
  assert.equal(markerHash, `sha256:${createHash("sha256")
    .update(`${marker.schema}\0${canonicalizeStrict(body)}`).digest("hex")}`);
  for (const side of ["superseded", "successor"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].artifactFileBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].artifactFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
    assert.equal(artifact.artifactReceipts.length, marker[side].receiptCount);
    assert.equal(artifact.lanes.length, marker[side].laneCount);
  }
  assert.equal(marker.clinicalTrialsStudyTermGroupOrRatePoolingPerformed, false);
  assert.equal(marker.clinicalTrialsTrainerRowsEnqueued, 0);
  assert.equal(marker.clinicalTrialsTargetTransferEstablished, false);
  assert.equal(marker.targetSpecificGapClosureCredit, 0);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v8 has a self-sealed ClinicalTrials privacy and rights marker for final-v9", {
  skip: !existsSync(p("artifacts/real-case-responsibility-flywheel-20260821/final-v8/superseded-by.json")),
}, () => {
  const marker = JSON.parse(readFileSync(p(
    "artifacts/real-case-responsibility-flywheel-20260821/final-v8/superseded-by.json"),
  "utf8"));
  const { markerHash, ...body } = marker;
  assert.equal(markerHash, `sha256:${createHash("sha256")
    .update(`${marker.schema}\0${canonicalizeStrict(body)}`).digest("hex")}`);
  for (const side of ["superseded", "successor"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].artifactFileBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].artifactFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
  }
  assert.equal(marker.clinicalTrialsSponsorOrPersonNamesPersisted, false);
  assert.equal(marker.clinicalTrialsRightsTermsSourceReplayed, false);
  assert.equal(marker.clinicalTrialsRightsDetermination,
    "NOT_ESTABLISHED_URL_ONLY_NOT_REPLAYED");
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("final-v9 has a self-sealed Wave5 source-aware supersession marker for final-v10", {
  skip: !existsSync(p("artifacts/real-case-responsibility-flywheel-20260821/final-v9/superseded-by.json")),
}, () => {
  const marker = JSON.parse(readFileSync(p(
    "artifacts/real-case-responsibility-flywheel-20260821/final-v9/superseded-by.json"),
  "utf8"));
  const { markerHash, ...body } = marker;
  assert.equal(markerHash, `sha256:${createHash("sha256")
    .update(`${marker.schema}\0${canonicalizeStrict(body)}`).digest("hex")}`);
  for (const side of ["superseded", "successor"]) {
    const bytes = readFileSync(p(marker[side].path));
    const artifact = JSON.parse(bytes.toString("utf8"));
    assert.equal(bytes.length, marker[side].artifactFileBytes);
    assert.equal(`sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      marker[side].artifactFileHash);
    assert.equal(artifact.artifactHash, marker[side].artifactHash);
    assert.equal(artifact.artifactReceipts.length, marker[side].receiptCount);
    assert.equal(artifact.lanes.length, marker[side].laneCount);
  }
  assert.equal(marker.wave5SourceNativeRows, 49);
  assert.equal(marker.wave5PreActionAvailableRows, 0);
  assert.equal(marker.wave5TrainerRowsEnqueued, 0);
  assert.equal(marker.wave5TargetPredictorEligibleRows, 0);
  assert.equal(marker.targetSpecificGapClosureCredit, 0);
  assert.equal(marker.operationalAuthorityGranted, false);
});

test("superseded artifact hash fails before source replay", { skip: !HAS_SOURCES }, async () => {
  const superseded = structuredClone(SOURCES);
  superseded.femaRealCases.artifactPath = p("artifacts/fema-real-cases-20260821/evidence-v1.json");
  await assert.rejects(buildRealCaseResponsibilityFlywheelFromSources({ sources: superseded }),
    /PINNED_ARTIFACT_HASH_MISMATCH:FEMA_REAL_CASES/);
});

test("semantic-equivalent but byte-different artifact cannot replace the canonical file", {
  skip: !HAS_SOURCES,
}, async () => {
  const substituted = structuredClone(SOURCES);
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-flywheel-artifact-bytes-"));
  const target = path.join(temporary, "fema.json");
  const value = JSON.parse(readFileSync(SOURCES.femaRealCases.artifactPath, "utf8"));
  writeFileSync(target, JSON.stringify(value));
  substituted.femaRealCases.artifactPath = target;
  await assert.rejects(buildRealCaseResponsibilityFlywheelFromSources({ sources: substituted }),
    /PINNED_ARTIFACT_HASH_MISMATCH:FEMA_REAL_CASES/);
});

test("one-byte source mutation fails the upstream replay and the unified receipt", {
  skip: !HAS_SOURCES,
  timeout: 60_000,
}, async () => {
  const mutated = structuredClone(SOURCES);
  const temporary = mkdtempSync(path.join(tmpdir(), "outsider-flywheel-source-mutation-"));
  const copied = path.join(temporary, "wave5");
  cpSync(p("artifacts/public-evidence-wave5-20260821/source"), copied, { recursive: true });
  const target = path.join(copied, "trace-commons", "README.md");
  const bytes = readFileSync(target);
  bytes[Math.floor(bytes.length / 2)] ^= 1;
  writeFileSync(target, bytes);
  mutated.progress.sources.wave5.traceCommonsDirectory = path.join(copied, "trace-commons");
  mutated.progress.sources.wave5.robustRosDirectory = path.join(copied, "robust-ros");
  await assert.rejects(buildRealCaseResponsibilityFlywheelFromSources({ sources: mutated }),
    /PROGRESS_SOURCE_REPLAY_FAILED|TEMPORAL_AUDIT_FULL_REPLAY_INVALID:STAGE0_SOURCE_TEMPORAL_AUDIT_SOURCE_REPLAY_INVALID:CROSS_STAGE_SIX_LANE_PROGRESS:REAL_EVIDENCE_PROGRESS_AIID_REPLAY_FAILED/);
});

test("all required frozen lanes replay sources and exact-compare current artifacts", {
  skip: !HAS_SOURCES,
  timeout: 600_000,
}, async () => {
  const artifact = buildRealCaseResponsibilityFlywheelProjection();
  const checked = await verifyRealCaseResponsibilityFlywheelAgainstSources(artifact,
    { sources: SOURCES });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FULL_PINNED_SOURCE_REPLAY_WITH_TEMPORAL_QUARANTINE");
  assert.equal(checked.sourceArtifactsReverified, true);
  assert.equal(checked.upstreamArtifactsExactCompared, true);
  assert.equal(checked.fullLaneSourceReplayCompleted, true);
  assert.equal(checked.replayedArtifactIds.length, 16);
  assert.equal(checked.replayedLaneIds.length, 26);
  assert.equal(checked.replayedReceipts.length, 16);
  assert.ok(checked.replayedReceipts.every((receipt) => (
    /^sha256:[a-f0-9]{64}$/.test(receipt.artifactFileHash)
      && /^sha256:[a-f0-9]{64}$/.test(receipt.artifactHash)
      && /^sha256:[a-f0-9]{64}$/.test(receipt.sourceCommitment)
      && Array.isArray(receipt.containedLaneIds)
      && receipt.containedLaneIds.length > 0
      && path.isAbsolute(receipt.artifactPath)
      && receipt.sourcePathProfileExactMatched === true
      && receipt.sourceArtifactsReverified === true
      && receipt.canonicalArtifactBytesMatched === true
      && receipt.candidateArtifactExactlyRebuilt === true
  )));
  const fraPhmsaReceipt = checked.replayedReceipts.find(({ artifactId }) => (
    artifactId === "FRA_PHMSA_REAL_SAFETY_EVIDENCE"));
  assert.equal(fraPhmsaReceipt.acquisitionManifestHash,
    "sha256:322b8a8446bbffb738edb102a02b03bd722624d84e695d23b56366cfef978e52");
  assert.equal(fraPhmsaReceipt.sourceCommitment,
    "sha256:ee6c751b15db415b08b5eddb481a59ed4ca0f33ab6c2a44cd911743654f79f56");
  const nhtsaReceipt = checked.replayedReceipts.find(({ artifactId }) => (
    artifactId === "NHTSA_RECALL_REMEDY_STATUS_EVIDENCE"));
  assert.equal(nhtsaReceipt.acquisitionManifestHash,
    "sha256:b20bc43b921c08db9b7d646e591e69f53e3db05ee99c9946093fac89a1237d82");
  assert.equal(nhtsaReceipt.sourceCommitment,
    "sha256:b4552ffd3ebb2bc1d05b368c0bca3d6ccd42ac97d21f360b7eef63c3bfea5bb1");
  const bridgeReceipt = checked.replayedReceipts.find(({ artifactId }) => (
    artifactId === "BRIDGEDATA_V2_TRAINING_CANDIDATE_EVIDENCE"));
  assert.equal(bridgeReceipt.artifactHash,
    "sha256:1db2d9b893cdb6cfc604154a787d70092b5a6c03d2122f2b81f56fa9e79e97c2");
  assert.equal(bridgeReceipt.sourceCommitment,
    "sha256:546495e05d3777562bd8dd9f70325bd4e4e1b07778ac8324178e629a36e6ef4d");
  assert.equal(bridgeReceipt.verificationLevel, "FULL_SOURCE_REPLAY");
  const waymoReceipt = checked.replayedReceipts.find(({ artifactId }) => (
    artifactId === "WAYMO_SAFETY_IMPACT_OUTCOME_EXPOSURE_EVIDENCE"));
  assert.equal(waymoReceipt.artifactHash,
    "sha256:edccce782d93f0f8f6f01c14f427d44e4137d0b1cf5c040a0c84d0ada9da0a7a");
  assert.equal(waymoReceipt.sourceCommitment,
    "sha256:c51bf261e81088a4faf1ca02736c4d7bb7c562c3573dcc852f80e33a85d35d7f");
  assert.equal(waymoReceipt.verificationLevel, "FULL_SOURCE_REPLAY");
  assert.equal(checked.catalogBinding.catalogHash, artifact.gapReferences.catalogHash);
  assert.equal(checked.catalogBinding.codeFixedCatalogProjectionReproducedInThisCall, true);
  assert.equal(checked.catalogBinding.catalogSourceArtifactsReverifiedByCatalogAlone, false);
  assert.equal(checked.catalogBinding.catalogLocalArtifactHashesMatchedToFlywheelReceipts, true);
  assert.equal(checked.sourceDomainReferenceEvidenceBound, true);
  assert.equal(checked.underlyingWorldTruthBeyondPublisherSourcesAuthenticated, false);
  assert.equal(checked.targetDomainTransferEstablished, false);
  assert.equal(checked.targetSpecificGapClosureCredit, 0);
  assert.equal(checked.operationalAuthorityGranted, false);
});
