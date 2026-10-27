import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildRmaCropInsuranceExperience,
  RMA_SOB_COVERAGE_FROZEN_SOURCE_2024,
  STAGE234_DEFERRED_CALIBRATION_SOURCES,
  verifyRmaCropInsuranceExperience,
  verifyRmaCropInsuranceExperienceWithSource,
} from "../src/outsider-rma-crop-insurance-experience.js";

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function reseal(artifact) {
  const copy = structuredClone(artifact);
  delete copy.artifactHash;
  copy.artifactHash = `sha256:${createHash("sha256").update(canonicalizeStrict({
    domain: "outsider/rma-crop-insurance-experience/v1", value: copy,
  })).digest("hex")}`;
  return copy;
}

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
    }
  }
  return (value ^ 0xffffffff) >>> 0;
}

function storedZip(name, content) {
  const nameBytes = Buffer.from(name);
  const body = Buffer.from(content);
  const checksum = crc32(body);
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(0, 8);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(body.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(0, 10);
  central.writeUInt32LE(checksum, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(body.length, 24);
  central.writeUInt16LE(nameBytes.length, 28);
  central.writeUInt32LE(0, 42);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(1, 8);
  end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + nameBytes.length, 12);
  end.writeUInt32LE(local.length + nameBytes.length + body.length, 16);
  return Buffer.concat([local, nameBytes, body, central, nameBytes, end]);
}

const PDF = Buffer.from("%PDF-1.7\nfixture record layout\n%%EOF\n");

function row(overrides = {}) {
  const values = {
    commodityYear: "2024", stateCode: "19", stateAbbreviation: "IA",
    countyCode: "001", countyName: "ADAIR", commodityCode: "0041",
    commodityName: "CORN", insurancePlanCode: "02",
    insurancePlanAbbreviation: "RP", coverageCategory: "A",
    deliveryType: "RBUP", coverageLevel: "0.7500", policiesSold: "10",
    policiesEarningPremium: "10", policiesIndemnified: "2",
    unitsEarningPremium: "12", unitsIndemnified: "2", quantityType: "Acres",
    netReportedQuantity: "1000", endorsedCompanionAcres: "0",
    liabilityDollars: "100000", totalPremiumDollars: "10000",
    subsidyDollars: "5000", statePrivateSubsidyDollars: "0",
    additionalSubsidyDollars: "0", efaPremiumDiscountDollars: "0",
    indemnityDollars: "8000", publishedLossRatio: "0.80",
    ...overrides,
  };
  return Object.values(values).join("|");
}

function fixture(extraRows = []) {
  const data = `${[
    row(),
    row({ countyCode: "003", countyName: "ADAMS", policiesSold: "20",
      policiesEarningPremium: "20", policiesIndemnified: "0",
      unitsEarningPremium: "24", unitsIndemnified: "0",
      netReportedQuantity: "2000", liabilityDollars: "50000",
      totalPremiumDollars: "5000", subsidyDollars: "2500",
      indemnityDollars: "0", publishedLossRatio: "0.00" }),
    row({ stateCode: "48", stateAbbreviation: "TX", countyCode: "001",
      countyName: "ANDERSON", commodityCode: "0081", commodityName: "COTTON",
      insurancePlanCode: "01", insurancePlanAbbreviation: "YP",
      coverageLevel: "0.6500", policiesSold: "5", policiesEarningPremium: "5",
      policiesIndemnified: "0", unitsEarningPremium: "6", unitsIndemnified: "0",
      netReportedQuantity: "500", liabilityDollars: "10000",
      totalPremiumDollars: "1000", subsidyDollars: "500",
      indemnityDollars: "-50", publishedLossRatio: "-0.05" }),
    ...extraRows,
  ].join("\n")}\n`;
  const zip = storedZip("sobcov_2024.txt", Buffer.from(data));
  return { zip, data };
}

function build(zip = fixture().zip) {
  return buildRmaCropInsuranceExperience(zip, PDF, {
    sourceObjectHash: sha256(zip), recordLayoutHash: sha256(PDF),
    generatedAt: "2026-08-21T07:30:00.000Z",
  });
}

test("RMA lane preserves real exposure, zero-loss cells, and publisher indemnity", () => {
  const { zip } = fixture();
  const artifact = build(zip);
  assert.equal(artifact.accounting.sourceRows, 3);
  assert.equal(artifact.accounting.zeroReportedLossExposureCellsPreserved, 1);
  assert.equal(artifact.accounting.noExposureNoReportedLossCells, 0);
  assert.equal(artifact.national.negativeIndemnityAdjustmentCells, 1);
  assert.equal(artifact.national.policiesEarningPremium, "35");
  assert.equal(artifact.national.policiesIndemnified, "2");
  assert.equal(artifact.national.indemnityDollars, "7950");
  assert.equal(artifact.national.reportedLossPolicyCellRate, "0.05714286");
  assert.equal(artifact.national.historicalIndemnityToPremiumRatio, "0.49687500");
  assert.equal(artifact.sourceDomainCalibration.decision,
    "QUARANTINE_CALLER_ASSERTED_RMA_SHAPED_FIXTURE");
  assert.equal(artifact.source.officialFrozenSourceVerified, false,
    "a self-hashed fixture cannot impersonate the frozen official object");
  assert.equal(artifact.source.sourceTrustClass, "CALLER_ASSERTED_RMA_SHAPED_FIXTURE");
  assert.equal(artifact.source.sourceArtifactsReverified, false);
  assert.equal(artifact.source.publisher, null);
  assert.deepEqual(artifact.evidenceClassification.authority, ["CALLER_ASSERTED"]);
  assert.equal(artifact.evidenceClassification.rights.publicAccess, false);
  const standalone = verifyRmaCropInsuranceExperience(artifact);
  assert.equal(standalone.ok, true);
  assert.equal(standalone.verificationLevel, "SELF_SEALED_UNTRUSTED_ENVELOPE");
  assert.equal(standalone.artifactStructureVerified, false);
  assert.equal(standalone.metricDerivationVerified, false);
  assert.equal(standalone.authorityBoundaryVerified, false);
  assert.equal(standalone.sourceArtifactsReverified, false);
  assert.equal(standalone.sourceDomainCalibrationDecision, null);
  const replay = verifyRmaCropInsuranceExperienceWithSource(artifact, zip, PDF);
  assert.equal(replay.ok, true);
  assert.equal(replay.verificationLevel, "CALLER_ASSERTED_FIXTURE_BYTES_REPLAYED");
  assert.equal(replay.inputBytesReproduced, true);
  assert.equal(replay.sourceArtifactsReverified, false);
});

test("a coherently resealed standalone envelope cannot certify RMA arithmetic", () => {
  const { zip } = fixture();
  const changed = structuredClone(build(zip));
  changed.accounting.sourceRows = 1;
  changed.national.historicalIndemnityToPremiumRatio = "0.00000000";
  changed.national.reportedLossPolicyCellRateModelEligible = true;
  changed.national.reportedLossUnitCellRateModelEligible = true;
  const standalone = verifyRmaCropInsuranceExperience(reseal(changed));
  assert.equal(standalone.ok, true);
  assert.equal(standalone.verificationLevel, "SELF_SEALED_UNTRUSTED_ENVELOPE");
  assert.equal(standalone.artifactStructureVerified, false);
  assert.equal(standalone.metricDerivationVerified, false);
  assert.equal(standalone.authorityBoundaryVerified, false);
  assert.equal(verifyRmaCropInsuranceExperienceWithSource(reseal(changed), zip, PDF).ok,
    false);
});

test("reported loss, adjudication, paid, reserve, and recovery remain distinct", () => {
  const artifact = build();
  assert.equal(artifact.semanticBoundary.fieldDefinitionsPublisherVerified, false);
  assert.equal(artifact.semanticBoundary.policiesIndemnifiedMeans,
    "CALLER_ASSERTED_FIELD_SHAPED_LIKE_POLICIES_INDEMNIFIED");
  assert.equal(artifact.semanticBoundary.indemnityIsCashPaid, false);
  assert.equal(artifact.semanticBoundary.indemnityIsCaseReserve, false);
  assert.equal(artifact.semanticBoundary.indemnityIsRecovery, false);
  assert.equal(artifact.semanticBoundary.reportedLossIsIndependentlyAdjudicatedClaim, false);
  assert.equal(artifact.sourceDomainCalibration.individualSeverityModelEligible, false);
  assert.equal(artifact.sourceDomainCalibration.tailOrTvarModelEligible, false);
  assert.equal(artifact.outsiderModelEntrance.decision,
    "ABSTAIN_CALLER_ASSERTED_RMA_SHAPED_FIXTURE");
});

test("real crop-insurance experience cannot transfer itself into Outsider pricing", () => {
  const { zip } = fixture();
  const artifact = build(zip);
  for (const mutate of [
    (copy) => { copy.evidenceClassification.transferToAiAgentOrRobotDomainEstablished = true; },
    (copy) => { copy.semanticBoundary.indemnityIsCashPaid = true; },
    (copy) => { copy.sourceDomainCalibration.individualSeverityModelEligible = true; },
    (copy) => { copy.outsiderModelEntrance.permitsPricing = true; },
    (copy) => { copy.outsiderModelEntrance.price = "12.34"; },
  ]) {
    const copy = structuredClone(artifact);
    mutate(copy);
    assert.equal(verifyRmaCropInsuranceExperience(copy).ok, false);
    assert.equal(verifyRmaCropInsuranceExperienceWithSource(copy, zip, PDF).ok, false);
  }
});

test("duplicate aggregate cells are quarantined instead of double-counted for calibration", () => {
  const duplicate = row({ indemnityDollars: "100", publishedLossRatio: "0.01" });
  const artifact = build(fixture([duplicate]).zip);
  assert.equal(artifact.accounting.duplicateSemanticCells, 1);
  assert.equal(artifact.sourceDomainCalibration.decision,
    "QUARANTINE_CALLER_ASSERTED_RMA_SHAPED_FIXTURE");
  assert.equal(artifact.sourceDomainCalibration.reportedLossFrequencyDescriptiveStatisticEligible,
    false);
  assert.equal(artifact.outsiderModelEntrance.permitsPricing, false);
});

test("published nulls are disclosed and empty or materially incomplete aggregates quarantine", () => {
  const zeroExposure = storedZip("sobcov_2024.txt", Buffer.from(`${row({
    insurancePlanAbbreviation: "STAX-RPHPE", policiesEarningPremium: "0",
    policiesIndemnified: "0", unitsEarningPremium: "0", unitsIndemnified: "0",
    netReportedQuantity: "", liabilityDollars: "", totalPremiumDollars: "",
    indemnityDollars: "0", publishedLossRatio: "",
  })}\n`));
  const immaterial = build(zeroExposure);
  assert.equal(immaterial.national.missingPremiumCells, 1);
  assert.equal(immaterial.national.materialMissingMonetaryCells, 0);
  assert.equal(immaterial.national.noExposureNoReportedLossCells, 1);
  assert.equal(immaterial.national.zeroReportedLossExposureCells, 0);
  assert.equal(immaterial.national.reportedLossPolicyCellRateModelEligible, false);
  assert.equal(immaterial.national.historicalIndemnityRatioModelEligible, false);
  assert.equal(immaterial.sourceDomainCalibration.decision,
    "QUARANTINE_CALLER_ASSERTED_RMA_SHAPED_FIXTURE");
  assert.equal(immaterial.sourceDomainCalibration.aggregateIndemnityRatioDescriptiveStatisticEligible,
    false);

  const exposed = storedZip("sobcov_2024.txt", Buffer.from(`${row({
    totalPremiumDollars: "", publishedLossRatio: "",
  })}\n`));
  const material = build(exposed);
  assert.equal(material.national.materialMissingMonetaryCells, 1);
  assert.equal(material.sourceDomainCalibration.decision,
    "QUARANTINE_CALLER_ASSERTED_RMA_SHAPED_FIXTURE");
  assert.equal(material.sourceDomainCalibration.aggregateIndemnityRatioDescriptiveStatisticEligible,
    false);
});

test("older zero-exposure rows preserve blank optional subsidy fields as null", () => {
  const older = storedZip("sobcov_2011.txt", Buffer.from(`${row({
    commodityYear: "2011", policiesEarningPremium: "0", policiesIndemnified: "0",
    unitsEarningPremium: "0", unitsIndemnified: "0", netReportedQuantity: "0",
    liabilityDollars: "", totalPremiumDollars: "", subsidyDollars: "",
    statePrivateSubsidyDollars: "", additionalSubsidyDollars: "",
    efaPremiumDiscountDollars: "", indemnityDollars: "0", publishedLossRatio: "",
  })}\n`));
  const artifact = buildRmaCropInsuranceExperience(older, PDF, {
    sourceObjectHash: sha256(older), recordLayoutHash: sha256(PDF),
    commodityYear: 2011,
    sourceUrl: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceUrl
      .replace("sobcov_2024.zip", "sobcov_2011.zip"),
  });
  assert.equal(artifact.accounting.sourceRows, 1);
  assert.equal(artifact.national.noExposureNoReportedLossCells, 1);
  assert.equal(artifact.national.materialMissingMonetaryCells, 0);
  assert.equal(artifact.outsiderModelEntrance.permitsPricing, false);
});

test("source bytes, PDF dictionary, and row widths fail closed; count anomalies quarantine frequency", () => {
  const { zip } = fixture();
  assert.throws(() => buildRmaCropInsuranceExperience(zip, PDF, {
    sourceObjectHash: sha256(Buffer.concat([zip, Buffer.from("x")])),
    recordLayoutHash: sha256(PDF),
  }), /SOURCE_OBJECT_HASH_INVALID/);
  assert.throws(() => buildRmaCropInsuranceExperience(zip, Buffer.from("not-pdf"), {
    sourceObjectHash: sha256(zip), recordLayoutHash: sha256(Buffer.from("not-pdf")),
  }), /RECORD_LAYOUT_HASH_OR_FORMAT_INVALID/);
  const badDenominator = storedZip("sobcov_2024.txt", Buffer.from(`${row({
    policiesEarningPremium: "1", policiesIndemnified: "2",
  })}\n`));
  const anomaly = build(badDenominator);
  assert.equal(anomaly.national.policyLossCountExceedsExposureCells, 1);
  assert.equal(anomaly.sourceDomainCalibration.decision,
    "QUARANTINE_CALLER_ASSERTED_RMA_SHAPED_FIXTURE");
  assert.equal(anomaly.sourceDomainCalibration.reportedLossFrequencyDescriptiveStatisticEligible,
    false);
  const badWidth = storedZip("sobcov_2024.txt", Buffer.from("2024|19|IA\n"));
  assert.throws(() => build(badWidth), /ROW_WIDTH_INVALID/);
});

test("ZIP traversal and ambiguous data entries are rejected", () => {
  const traversal = storedZip("../sobcov_2024.txt", Buffer.from(`${row()}\n`));
  assert.throws(() => build(traversal), /ZIP_ENTRY_NAME_INVALID/);
  const wrongName = storedZip("sobcov_2024.csv", Buffer.from(`${row()}\n`));
  assert.throws(() => build(wrongName), /SINGLE_TEXT_ENTRY_REQUIRED/);
});

test("resealing cannot turn caller bytes into publisher evidence or an admitted source", () => {
  const { zip } = fixture();
  const artifact = build(zip);
  const rightsPromotion = structuredClone(artifact);
  rightsPromotion.evidenceClassification.rights.publicAccess = true;
  rightsPromotion.evidenceClassification.rights
    .publicAccessObservedFromDownloadedObjects = true;
  rightsPromotion.evidenceClassification.rights
    .distributionAndCopyingWebPolicyCuratorAssertionNotReplayed = true;
  const resealedRights = reseal(rightsPromotion);
  assert.equal(verifyRmaCropInsuranceExperience(resealedRights).ok, false);

  const promoted = structuredClone(artifact);
  Object.assign(promoted.source, {
    datasetId: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.datasetId,
    sourceTrustClass: "OFFICIAL_USDA_RMA_FROZEN_SOURCE_REPLAY",
    publisher: "USDA_RISK_MANAGEMENT_AGENCY",
    program: "FEDERAL_CROP_INSURANCE",
    sourceUrl: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceUrl,
    claimedSourceUrlNotVerified: null,
    sourceObjectHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectHash,
    sourceObjectBytes: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectBytes,
    recordLayoutUrl: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutUrl,
    claimedRecordLayoutUrlNotVerified: null,
    recordLayoutHash: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutHash,
    recordLayoutBytes: RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutBytes,
    officialFrozenSourceVerified: true,
    sourceArtifactsReverified: true,
    snapshotMutability: "MOST_RECENT_FIVE_YEARS_REFRESHED_WEEKLY_BY_PUBLISHER",
    completeness: "COMPLETE_PUBLISHED_FILE_SNAPSHOT_NOT_CLAIM_UNIVERSE_OR_ULTIMATE",
  });
  promoted.evidenceClassification.environmentReality = ["ORGANIC", "REAL_PHYSICAL"];
  promoted.evidenceClassification.empiricalStatus
    = "EMPIRICAL_RECORDED_ADMINISTRATIVE_SUMMARY";
  promoted.evidenceClassification.authority = ["PUBLISHER_DECLARED", "SOURCE_REPLAYED"];
  promoted.evidenceClassification.rights.publicAccess = true;
  promoted.evidenceClassification.rights
    .publicAccessObservedFromDownloadedObjects = true;
  promoted.evidenceClassification.rights
    .distributionAndCopyingWebPolicyCuratorAssertionNotReplayed = true;
  promoted.evidenceClassification.sourceDomain = "US_FEDERAL_CROP_INSURANCE";
  promoted.semanticBoundary.fieldDefinitionsPublisherVerified = true;
  promoted.semanticBoundary.policiesEarningPremiumMeans
    = "POLICIES_FOR_WHICH_ACREAGE_WAS_REPORTED_TO_RMA";
  promoted.semanticBoundary.policiesIndemnifiedMeans
    = "POLICIES_FOR_WHICH_LOSSES_WERE_REPORTED_TO_RMA";
  promoted.semanticBoundary.liabilityMeans
    = "MAXIMUM_DOLLAR_INSURANCE_FOR_CROP_UNIT_LINE_ITEM";
  promoted.semanticBoundary.indemnityMeans
    = "PUBLISHER_RECORDED_TOTAL_AMOUNT_OF_LOSS";
  promoted.sourceDomainCalibration.callerAssertedFixture = false;
  promoted.sourceDomainCalibration.decision = "ADMIT_DESCRIPTIVE_AGGREGATE_CALIBRATION_ONLY";
  promoted.outsiderModelEntrance.decision
    = "ABSTAIN_SOURCE_DOMAIN_AGGREGATE_EXPERIENCE_ONLY";
  const resealedPromotion = reseal(promoted);
  const standalone = verifyRmaCropInsuranceExperience(resealedPromotion);
  assert.equal(standalone.ok, true,
    "standalone verification may validate a self-consistent claim but not its source bytes");
  assert.equal(standalone.sourceArtifactsReverified, false);
  assert.equal(standalone.officialFrozenSourceVerified, false);
  assert.equal(standalone.sourceDomainCalibrationDecision, null);
  const replay = verifyRmaCropInsuranceExperienceWithSource(resealedPromotion, zip, PDF);
  assert.equal(replay.ok, false);
  assert.equal(replay.sourceArtifactsReverified, false);
  assert.equal(replay.officialFrozenSourceVerified, false);
});

test("standalone verification rejects unknown fields even after coherent resealing", () => {
  const artifact = structuredClone(build());
  artifact.source.unexpectedAuthority = true;
  const resealed = reseal(artifact);
  assert.equal(verifyRmaCropInsuranceExperience(resealed).ok, false);
  assert.equal(verifyRmaCropInsuranceExperience(resealed).verificationLevel, "INVALID");
});

test("frozen source manifest pins official URLs and record-layout bytes", () => {
  assert.equal(RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.commodityYear, 2024);
  assert.match(RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceUrl,
    /^https:\/\/pubfs-rma\.fpac\.usda\.gov\//);
  assert.match(RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutHash,
    /^sha256:[a-f0-9]{64}$/);
  assert.equal(RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.recordLayoutBytes, 84_719);
  assert.equal(RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectHash,
    "sha256:5731366e8e50abb6af977dc2eeabda2900659e07542ba2a78de9d81c293e3e05");
  assert.equal(RMA_SOB_COVERAGE_FROZEN_SOURCE_2024.sourceObjectBytes, 3_119_562);
  assert.deepEqual(STAGE234_DEFERRED_CALIBRATION_SOURCES.map((source) => source.sourceId), [
    "CAS_NAIC_SCHEDULE_P_LOSS_RESERVING_2025_12",
    "OPENFEMA_NFIP_REDACTED_CLAIMS_AND_POLICIES_V3",
    "FEMA_PUBLIC_ASSISTANCE_SECOND_APPEAL_DECISIONS",
  ]);
  assert.ok(STAGE234_DEFERRED_CALIBRATION_SOURCES.every((source) => (
    source.transferToAiAgentOrRobotDomainEstablished === false
      || source.sourceId === "FEMA_PUBLIC_ASSISTANCE_SECOND_APPEAL_DECISIONS"
  )));
});
