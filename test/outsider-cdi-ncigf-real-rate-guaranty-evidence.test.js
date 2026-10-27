import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  cpSync, existsSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildCdiNcigfRateGuarantyEvidenceFromBytes,
  buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory,
  CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS,
  verifyCdiNcigfRateGuarantyEvidence,
  verifyCdiNcigfRateGuarantyEvidenceWithSource,
} from "../src/outsider-cdi-ncigf-real-rate-guaranty-evidence.js";

const officialSource = path.resolve("artifacts/cdi-ncigf-real-rate-guaranty-20260821/source");
const officialArtifact = path.resolve(
  "artifacts/cdi-ncigf-real-rate-guaranty-20260821/final-v1/evidence.json");

function artifactDigest(body) {
  return `sha256:${createHash("sha256").update(
    `outsider:cdi-ncigf-rate-guaranty-artifact:v1\0${canonicalizeStrict(body)}`).digest("hex")}`;
}

function reseal(artifact) {
  const { artifactHash: ignored, ...body } = artifact;
  return { ...body, artifactHash: artifactDigest(body) };
}

function officialBytes() {
  return Object.fromEntries(CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS.map((pin) =>
    [pin.path, readFileSync(path.join(officialSource, pin.path))]));
}

test("frozen source set is bounded, unique, exact, and includes 13 objects", () => {
  assert.equal(CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS.length, 13);
  assert.equal(new Set(CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS.map((pin) => pin.path)).size, 13);
  assert.equal(CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS
    .reduce((sum, pin) => sum + pin.sizeBytes, 0), 4_480_455);
  assert.equal(CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS.filter((pin) => pin.path.endsWith(".xls")).length, 5);
  assert.equal(CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS.filter((pin) => pin.path.endsWith(".xlsx")).length, 3);
  assert.equal(CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS.filter((pin) => pin.path.endsWith(".pdf")).length, 2);
  assert.ok(CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS.every((pin) =>
    /^sha256:[a-f0-9]{64}$/u.test(pin.sha256) && pin.url.startsWith("https://")));
});

test("caller bytes are a non-official fixture even when they are exact official bytes",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildCdiNcigfRateGuarantyEvidenceFromBytes(officialBytes());
    assert.equal(artifact.source.profileMatchedAtBuild, false);
    assert.equal(artifact.source.publisherIdentityAdmitted, false);
    assert.equal(artifact.lanes.cdi.admitted, false);
    assert.equal(artifact.lanes.ncigf.admitted, false);
    assert.equal(artifact.admission.realSourceDomainDescriptiveExperienceRecognized, false);
    assert.equal(artifact.rights.officialPublicAccessObserved, false);
    assert.equal(verifyCdiNcigfRateGuarantyEvidence(artifact).ok, true);
    assert.equal(verifyCdiNcigfRateGuarantyEvidenceWithSource(artifact, officialSource).ok, false);
    assert.throws(() => buildCdiNcigfRateGuarantyEvidenceFromBytes(officialBytes(),
      { official: true }), /CDI_NCIGF_OPTIONS_INVALID/u);
  });

test("standalone verification is structure-only and grants no source admission",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(officialSource);
    const checked = verifyCdiNcigfRateGuarantyEvidence(artifact);
    assert.equal(checked.ok, true);
    assert.equal(checked.verificationLevel, "STRUCTURE_ONLY");
    assert.equal(checked.sourceArtifactsReverified, false);
    assert.equal(checked.realSourceDomainExperienceAdmissionEstablished, false);
    assert.equal(checked.underlyingWorldTruthIndependentlyEstablished, false);
    assert.equal(checked.outsiderAuthorityEstablished, false);
    assert.equal(checked.decision, null);
  });

test("resealing cannot promote authority, rights, readiness, or publisher quality",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(officialSource);
    const attacks = [
      reseal({ ...artifact, authority: { ...artifact.authority, PRICE: true } }),
      reseal({ ...artifact, rights: { ...artifact.rights, modelTrainingRightConcluded: true } }),
      reseal({ ...artifact, progress: { ...artifact.progress, readyToGuarantee: true } }),
      reseal({ ...artifact, lanes: { ...artifact.lanes, ncigf: { ...artifact.lanes.ncigf,
        quarterlyAssessmentLiability: { ...artifact.lanes.ncigf.quarterlyAssessmentLiability,
          publisherQualification: {
            ...artifact.lanes.ncigf.quarterlyAssessmentLiability.publisherQualification,
            independentlyVerifiedByNcigf: true } } } } }),
      reseal({ ...artifact, lanes: { ...artifact.lanes, ncigf: { ...artifact.lanes.ncigf,
        institutionalBoundary: { ...artifact.lanes.ncigf.institutionalBoundary,
          reportingGuidelines: {
            ...artifact.lanes.ncigf.institutionalBoundary.reportingGuidelines,
            semanticExtractionStatus: "ADMITTED" } } } } }),
    ];
    for (const attack of attacks) assert.equal(verifyCdiNcigfRateGuarantyEvidence(attack).ok, false);
  });

test("CDI filing preserves Accepted versus approved and charged-price boundaries",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(officialSource);
    const filing = artifact.lanes.cdi.filing;
    assert.equal(filing.documentProfile.pageCount, 129);
    assert.equal(filing.filingState.serffStatus, "ASSIGNED");
    assert.equal(filing.filingState.stateStatus, "ACCEPTED");
    assert.equal(filing.filingState.dispositionStatus, null);
    assert.equal(filing.filingState.acceptedMeansApproved, false);
    assert.equal(filing.filingState.approvedRateObserved, false);
    assert.equal(filing.filingState.chargedPolicyPriceObserved, false);
    assert.equal(filing.requestedRate.proposedOverallChangePct, "-7.70%");
    assert.equal(filing.requestedRate.proposedIsApprovedOrChargedPrice, false);
    assert.equal(filing.statutory2010.claimsPaidUsd, "14747175");
    assert.equal(filing.statutory2010.ibnrReserveUsd, "15480192");
  });

test("source inconsistencies remain data, are detected, and are not silently cleaned",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(officialSource);
    const experience = artifact.lanes.cdi.filing.experience2001To2010;
    assert.equal(experience.rows.length, 10);
    assert.equal(experience.total.trendedLossAndDcceUsd, "183934789");
    assert.equal(experience.rowSumReconciliation.trendedLossAndDcceExact, false);
    assert.equal(experience.rowSumReconciliation.publishedLossTotalShortByUsd, "1");
    assert.equal(experience.rowSumReconciliation.discrepancyPreservedAndNotSilentlyCorrected, true);
    const history = artifact.lanes.ncigf.fiveYearHistory;
    assert.deepEqual(history.headerYears, [2021, 2022, 2023, 2024, 2025]);
    assert.equal(history.internalLabelDrift.totalRowLabel, "2006 Total");
    assert.equal(history.internalLabelDrift.bottomRangeLabel, "2020-2024");
    assert.equal(history.internalLabelDrift.staleLabelsPreservedAndNotSilentlyCorrected, true);
    assert.equal(history.accountYearProfile.publisherLabelSaysAccountsButArithmeticUsesAccountYears, true);
  });

test("CDI registry and health aggregates preserve their real coverage frames",
  { skip: !existsSync(officialSource) }, () => {
    const cdi = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(officialSource).lanes.cdi;
    assert.deepEqual(cdi.registry.approvalAndClosed2025.statuses, { APPROVED: 2484, CLOSED: 660 });
    assert.equal(cdi.registry.approvalAndClosed2025.publishedRows, 3144);
    assert.equal(cdi.registry.publicNotice20241227.publishedRows, 30);
    assert.equal(cdi.registry.publicNotice20241227.joinedTo2025DispositionByStateFileNumber, 27);
    assert.equal(cdi.registry.corpusBoundary.completeSerffCorpusAdmitted, false);
    assert.equal(cdi.healthAggregate.reported.coveredLives, 18378);
    assert.equal(cdi.healthAggregate.reported.grandfatheredOffExchangeAveragePremiumPmpmUsd,
      "668.970167");
    assert.equal(cdi.healthAggregate.boundaries.zeroRateChangeIsNotZeroPremium, true);
    assert.equal(cdi.institutionalBoundary.healthRateSchema.earnedPremiumFieldPresent, true);
    assert.equal(cdi.institutionalBoundary.healthRateSchema.incurredClaimsFieldPresent, true);
    assert.equal(cdi.institutionalBoundary.serffAccess.staticCompleteCorpusSnapshotFrozen, false);
  });

test("NCIGF reports remain real reported experience without becoming audit or capital",
  { skip: !existsSync(officialSource) }, () => {
    const ncigf = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(officialSource).lanes.ncigf;
    const quarter = ncigf.quarterlyAssessmentLiability;
    assert.equal(quarter.reportedGrandTotal.maximumAssessmentCapacity2025Usd, "16959476645.26");
    assert.equal(quarter.reportedGrandTotal.maximumAssessmentCapacity2026ReportedToDateUsd,
      "7600879728.72");
    assert.equal(quarter.reportedGrandTotal.netAssessmentsAuthorized2026Usd, "21112323");
    assert.equal(quarter.workbookProfile.unavailable2025PremiumRows, 85);
    assert.equal(quarter.publisherQualification.compiledFromThirdPartyData, true);
    assert.equal(quarter.publisherQualification.independentlyVerifiedByNcigf, false);
    assert.equal(quarter.publisherQualification.useOutsideStatedPurposePermittedByEvidence, false);
    assert.equal(quarter.reportLimitations.maximumAssessmentCapacityIsStatutoryCallingCapacityNotCashHeld,
      true);
    assert.equal(quarter.reportLimitations.calledOrAuthorizedIsNotOutsiderCapitalOrCustody, true);
    assert.equal(ncigf.institutionalBoundary.reportingGuidelines.semanticExtractionStatus,
      "MACHINE_DEFERRED");
  });

test("the two inception views reconcile only after explicit zero normalization",
  { skip: !existsSync(officialSource) }, () => {
    const history = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(officialSource)
      .lanes.ncigf.inceptionHistory;
    assert.equal(history.byFund.rawRows, 4013);
    assert.equal(history.byYear.rawRows, 4017);
    assert.equal(history.byFund.nonzeroRows, 1514);
    assert.equal(history.byYear.nonzeroRows, 1514);
    assert.equal(history.crossView.additionalAllZeroRowsInByYear, 4);
    assert.equal(history.crossView.blankNumericCellsNormalizedToZeroForComparison, true);
    assert.equal(history.crossView.nonzeroRowMultisetExactlyMatches, true);
    assert.equal(history.byFund.nonzeroTupleHash, history.byYear.nonzeroTupleHash);
    assert.equal(history.coverageAndDependence.missingnessIsNotAssumedRandom, true);
    assert.equal(history.coverageAndDependence.tailOrDependenceModelFitted, false);
  });

test("full replay admits source-domain experience but not truth, authority, or capital",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(officialSource);
    const checked = verifyCdiNcigfRateGuarantyEvidenceWithSource(artifact, officialSource);
    assert.equal(checked.ok, true);
    assert.equal(checked.verificationLevel, "FULL_EXACT_OFFICIAL_SOURCE_REPLAYED");
    assert.equal(checked.exactOfficialBytesReplayed, true);
    assert.equal(checked.candidateArtifactExactlyRebuilt, true);
    assert.equal(checked.realSourceDomainExperienceAdmissionEstablished, true);
    assert.equal(checked.underlyingWorldTruthIndependentlyEstablished, false);
    assert.equal(checked.outsiderAuthorityEstablished, false);
    assert.equal(checked.outsiderCapitalCustodyOrCoverageEstablished, false);
  });

test("coherently resealed numeric edits still fail exact source replay",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(officialSource);
    const attacked = structuredClone(artifact);
    attacked.lanes.cdi.filing.requestedRate.proposedOverallChangePct = "99.99%";
    const resealed = reseal(attacked);
    assert.equal(verifyCdiNcigfRateGuarantyEvidence(resealed).ok, true);
    const checked = verifyCdiNcigfRateGuarantyEvidenceWithSource(resealed, officialSource);
    assert.equal(checked.ok, false);
    assert.deepEqual(checked.errors, ["EXACT_REBUILD_MISMATCH"]);
    assert.equal(checked.candidateArtifactExactlyRebuilt, false);
    assert.equal(checked.realSourceDomainExperienceAdmissionEstablished, false);
  });

test("same-size source tamper and symlinked source fail before semantic admission",
  { skip: !existsSync(officialSource) }, () => {
    const tampered = mkdtempSync(path.join(tmpdir(), "outsider-cdi-ncigf-tamper-"));
    for (const pin of CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS) {
      cpSync(path.join(officialSource, pin.path), path.join(tampered, pin.path));
    }
    const target = path.join(tampered, "cdi-health-rate-template.xls");
    const bytes = readFileSync(target);
    bytes[100] ^= 1;
    writeFileSync(target, bytes);
    assert.throws(() => buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(tampered),
      /SOURCE_FILE_CHANGED_OR_MISMATCHED:cdi-health-rate-template\.xls/u);

    const linked = mkdtempSync(path.join(tmpdir(), "outsider-cdi-ncigf-link-"));
    for (const pin of CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS) {
      cpSync(path.join(officialSource, pin.path), path.join(linked, pin.path));
    }
    const first = path.join(linked, CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS[0].path);
    unlinkSync(first);
    symlinkSync(path.join(officialSource, CDI_NCIGF_RATE_GUARANTY_SOURCE_PINS[0].path), first);
    assert.throws(() => buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(linked),
      /SOURCE_FILE_PROFILE_INVALID:cdi-filing-11-5668\.pdf/u);
  });

test("canonical projection excludes personal contacts and keeps only aggregate evidence",
  { skip: !existsSync(officialSource) }, () => {
    const artifact = buildCdiNcigfRateGuarantyEvidenceFromSourceDirectory(officialSource);
    const serialized = JSON.stringify(artifact);
    assert.doesNotMatch(serialized, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);
    assert.doesNotMatch(serialized, /"(?:personalEmail|contactName|signatureImage)"/iu);
    assert.equal(artifact.lanes.cdi.filing.documentProfile.personalContactFieldsProjected, false);
    assert.equal(artifact.lanes.cdi.filing.actuarialCertification
      .certificationSignerOrIdentityRetained, false);
    assert.match(serialized, /THE_DENTISTS_INSURANCE_COMPANY/u);
    assert.match(serialized, /ANTHEM_BLUE_CROSS_LIFE_AND_HEALTH_INSURANCE_COMPANY/u);
  });

test("canonical artifact and CLIs preserve structure-only versus source-aware verification",
  { skip: !(existsSync(officialSource) && existsSync(officialArtifact)) }, () => {
    const artifact = JSON.parse(readFileSync(officialArtifact, "utf8"));
    assert.equal(verifyCdiNcigfRateGuarantyEvidenceWithSource(artifact, officialSource).ok, true);
    const standalone = spawnSync(process.execPath,
      ["scripts/cdi-ncigf-real-rate-guaranty-evidence.mjs", "verify", "--artifact", officialArtifact],
      { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(standalone.status, 0, standalone.stderr);
    assert.equal(JSON.parse(standalone.stdout).verificationLevel, "STRUCTURE_ONLY");
    const full = spawnSync(process.execPath,
      ["scripts/cdi-ncigf-real-rate-guaranty-evidence.mjs", "verify", "--artifact", officialArtifact,
        "--source-dir", officialSource], { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(full.status, 0, full.stderr);
    assert.equal(JSON.parse(full.stdout).verificationLevel, "FULL_EXACT_OFFICIAL_SOURCE_REPLAYED");
    const help = spawnSync(process.execPath,
      ["scripts/acquire-cdi-ncigf-real-rate-guaranty-evidence.mjs", "--help"],
      { cwd: path.resolve("."), encoding: "utf8" });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /13 pinned official objects/u);
  });
