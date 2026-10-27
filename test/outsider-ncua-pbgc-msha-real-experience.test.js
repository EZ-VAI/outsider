import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  existsSync, mkdtempSync, readFileSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildNcuaPbgcMshaRealExperienceFromBytes,
  buildNcuaPbgcMshaRealExperienceFromSourceDirectory,
  inspectPbgcWorkbookShape,
  NCUA_PBGC_MSHA_REAL_EXPERIENCE_FROZEN_AT,
  NCUA_PBGC_MSHA_REAL_EXPERIENCE_SCHEMA,
  NCUA_PBGC_MSHA_SOURCE_PINS_20260821,
  verifyPbgcWorkbookPdfKeyMetricBindings,
  verifyNcuaPbgcMshaRealExperience,
  verifyNcuaPbgcMshaRealExperienceWithSource,
} from "../src/outsider-ncua-pbgc-msha-real-experience.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "artifacts/ncua-pbgc-msha-real-experience-20260821/source");
const HAS_SOURCE = existsSync(SOURCE);
let cachedOfficial;
function official() {
  cachedOfficial ??= buildNcuaPbgcMshaRealExperienceFromSourceDirectory(SOURCE);
  return cachedOfficial;
}
function fixture() {
  return Object.fromEntries(NCUA_PBGC_MSHA_SOURCE_PINS_20260821
    .map((pin) => [pin.name, Buffer.from(`unattested:${pin.name}`)]));
}
function reseal(artifact) {
  delete artifact.artifactHash;
  artifact.artifactHash = `sha256:${createHash("sha256").update(
    `outsider/ncua-pbgc-msha-real-experience/artifact/v1\0${canonicalizeStrict(artifact)}`)
    .digest("hex")}`;
  return artifact;
}

test("frozen source profile accounts for 15 exact official objects without authority", () => {
  assert.equal(NCUA_PBGC_MSHA_SOURCE_PINS_20260821.length, 15);
  assert.equal(NCUA_PBGC_MSHA_SOURCE_PINS_20260821
    .reduce((sum, pin) => sum + pin.bytes, 0), 129_422_288);
  assert.deepEqual(Object.fromEntries(["NCUA", "PBGC", "MSHA"].map((lane) => [lane,
    NCUA_PBGC_MSHA_SOURCE_PINS_20260821.filter((pin) => pin.lane === lane).length])),
  { NCUA: 2, PBGC: 4, MSHA: 9 });
  assert.ok(NCUA_PBGC_MSHA_SOURCE_PINS_20260821.every((pin) =>
    /^https:\/\//u.test(pin.url) && /^sha256:[a-f0-9]{64}$/u.test(pin.sha256) && pin.bytes > 0));
});

test("caller fixtures remain unattested and standalone verification never establishes source truth", () => {
  const artifact = buildNcuaPbgcMshaRealExperienceFromBytes(fixture());
  assert.equal(artifact.schema, NCUA_PBGC_MSHA_REAL_EXPERIENCE_SCHEMA);
  assert.equal(artifact.generatedAt, NCUA_PBGC_MSHA_REAL_EXPERIENCE_FROZEN_AT);
  assert.equal(artifact.source.profileMatchedAtBuild, false);
  assert.equal(artifact.source.sourceReality, "UNATTESTED_CALLER_BYTES");
  assert.equal(artifact.source.sourceSetHash, null);
  assert.deepEqual(artifact.lanes, { ncua: null, pbgc: null, msha: null });
  assert.equal(artifact.rights.modelTrainingRightConcluded, false);
  assert.ok(Object.values(artifact.authority).every((value) => value === false));
  const verified = verifyNcuaPbgcMshaRealExperience(artifact);
  assert.equal(verified.ok, true);
  assert.equal(verified.verificationLevel, "STRUCTURE_ONLY");
  assert.equal(verified.sourceArtifactsReverified, false);
  assert.equal(verified.sourceTruthEstablished, false);
  assert.equal(verified.realCaseOrExperienceAdmissionEstablished, false);
});

test("even exact caller bytes cannot self-attest as official", { skip: !HAS_SOURCE }, () => {
  const bytes = Object.fromEntries(NCUA_PBGC_MSHA_SOURCE_PINS_20260821.map((pin) =>
    [pin.name, readFileSync(path.join(SOURCE, pin.name))]));
  const artifact = buildNcuaPbgcMshaRealExperienceFromBytes(bytes);
  assert.equal(artifact.source.callerBytesMatchedFrozenPins, true);
  assert.equal(artifact.source.profileMatchedAtBuild, false);
  assert.equal(artifact.source.sourceReality, "UNATTESTED_CALLER_BYTES");
  assert.equal(artifact.source.officialPublicAccessObserved, undefined);
  assert.equal(artifact.rights.officialPublicAccessObserved, false);
  assert.deepEqual(artifact.lanes, { ncua: null, pbgc: null, msha: null });
});

test("PBGC workbook parser reads the complete frozen workbook shape", { skip: !HAS_SOURCE }, () => {
  const workbook = inspectPbgcWorkbookShape(
    readFileSync(path.join(SOURCE, "pbgc-2024-pension-data-tables.xlsx")));
  assert.equal(workbook.sheets.length, 36);
  assert.equal(workbook.sharedStringCount, 594);
  assert.equal(workbook.formulaCellCount, 5);
  assert.equal(workbook.sheets[0].name, "Cover Page");
  assert.equal(workbook.sheets.at(-1).name, "M-21");
  const pdf = readFileSync(path.join(SOURCE, "pbgc-2024-pension-data-tables.pdf"));
  const bindings = verifyPbgcWorkbookPdfKeyMetricBindings(workbook, pdf);
  assert.equal(bindings.established, true);
  assert.equal(bindings.bindingCount, 12);
  assert.match(bindings.bindingSetHash, /^sha256:[a-f0-9]{64}$/u);
  const valueMismatch = structuredClone(workbook);
  valueMismatch.sheets.find((item) => item.name === "GLANCE")
    .rows.find((item) => item.rowNumber === 4).cells[1] = "62214";
  assert.throws(() => verifyPbgcWorkbookPdfKeyMetricBindings(valueMismatch, pdf),
    /CROSS_REPRESENTATION_MISMATCH:GLANCE_NET_FINANCIAL_POSITION/u);
  const labelMismatch = structuredClone(workbook);
  labelMismatch.sheets.find((item) => item.name === "GLANCE")
    .rows.find((item) => item.rowNumber === 4).cells[0] = "Net Position";
  assert.throws(() => verifyPbgcWorkbookPdfKeyMetricBindings(labelMismatch, pdf),
    /PBGC_ROW_BINDING_INVALID:GLANCE:4/u);
});

test("full replay preserves NCUA audit scope and preliminary distinction", { skip: !HAS_SOURCE }, () => {
  const lane = official().lanes.ncua;
  assert.equal(lane.auditedFinancialStatement.totalAssetsThousandsUsd, 24_105_761);
  assert.equal(lane.auditedFinancialStatement.totalLiabilitiesThousandsUsd, 241_770);
  assert.equal(lane.auditedFinancialStatement.insuranceAndGuaranteeProgramLiabilitiesThousandsUsd, 234_026);
  assert.equal(lane.auditedFinancialStatement.provisionForInsuranceLossesThousandsUsd, 4_888);
  assert.equal(lane.auditedFinancialStatement.assuranceIsAbsolute, false);
  assert.equal(lane.preliminaryComparator.admittedAsAuditedInput, false);
  assert.equal(lane.preliminaryComparator.decemberMonthlyInsuranceLossReductionMillionsUsd, 14.1);
  assert.equal(lane.auditBoundary.reserveEqualsPaidClaimLoss, false);
});

test("PBGC preserves heterogeneous denominators, payments, assistance, and recovery semantics",
  { skip: !HAS_SOURCE }, () => {
    const lane = official().lanes.pbgc;
    assert.equal(lane.availabilityFrame.form5500PlanYear, 2023);
    assert.equal(lane.availabilityFrame.premiumFilingPlanYear, 2024);
    assert.equal(lane.availabilityFrame.operationalFiscalYear, 2025);
    assert.equal(lane.availabilityFrame.tableEndYearsAreHeterogeneous, true);
    assert.equal(lane.availabilityFrame.firstInstallmentIsCompleteEdition, false);
    assert.equal(lane.fiscal2025.singleEmployer.directBenefitPaymentsMillionsUsd, 6426.16);
    assert.equal(lane.fiscal2025.multiemployer.traditionalFinancialAssistanceMillionsUsd, 169);
    assert.equal(lane.fiscal2025.multiemployer.specialFinancialAssistanceMillionsUsd, 6151.99);
    assert.equal(lane.paymentAndRecoveryExperience.sfaRetrospectiveDeathAuditRepaymentsMillionsUsd, 119.5);
    assert.equal(lane.paymentAndRecoveryExperience.sfaRepaymentIsNotOrdinaryClaimRecovery, true);
    assert.equal(lane.auditBoundary.claimsDefinitionIsPaidClaimSeverity, false);
  });

test("MSHA full streams preserve exposure, anomalies, right-censoring, and aggregate-only privacy",
  { skip: !HAS_SOURCE }, () => {
    const lane = official().lanes.msha;
    assert.equal(lane.accidents.rowCount, 274_448);
    assert.equal(lane.accidents.uniqueDocumentNumberCount, 274_448);
    assert.equal(lane.accidents.latestCalendarQuarter, 3);
    assert.equal(lane.mineQuarterlyExposure.rowCount, 2_761_063);
    assert.equal(lane.contractorQuarterlyExposure.rowCount, 1_361_755);
    assert.equal(lane.sourceAccounting.physicalDataRows, 4_397_266);
    assert.equal(lane.mineQuarterlyExposure.invalidHoursRows, 4);
    assert.equal(lane.contractorQuarterlyExposure.invalidHoursRows, 11);
    assert.equal(lane.contractorQuarterlyExposure.malformedRowCount, 3);
    assert.equal(lane.sourceRefresh.accidentCurrentQuarterRightCensored, true);
    assert.equal(lane.sourceRefresh.employmentCurrentQuarterAbsent, true);
    assert.equal(lane.correlationBoundary.derivedIncidenceRateEmitted, null);
    assert.equal(lane.privacyBoundary.aggregateOnly, true);
    assert.equal(lane.privacyBoundary.artifactPublishesRowLevelNarratives, false);
    assert.equal(lane.privacyBoundary.artifactPublishesPersonLinkedRows, false);
    for (const forbidden of ["rows", "records", "events", "items", "names", "narratives"]) {
      assert.equal(Object.hasOwn(lane.accidents, forbidden), false);
    }
  });

test("full source verifier exact-rebuilds the official artifact in one call", { skip: !HAS_SOURCE }, () => {
  const verified = verifyNcuaPbgcMshaRealExperienceWithSource(official(), SOURCE);
  assert.equal(verified.ok, true);
  assert.equal(verified.sourceArtifactsReverified, true);
  assert.equal(verified.officialSourceProfileReproduced, true);
  assert.equal(verified.candidateArtifactExactlyRebuilt, true);
  assert.equal(verified.realCaseOrExperienceAdmissionEstablished, true);
  assert.equal(verified.sourceTruthEstablished, false);
  assert.equal(verified.publisherAuthorityEstablished, false);
  assert.equal(verified.operationalAuthorityEstablished, false);
  assert.equal(verified.decision.targetUseAuthorized, false);
  assert.equal(verified.decision.modelTrainingAuthorized, false);
});

test("coherently resealed lane forgery passes only structure and fails exact source replay",
  { skip: !HAS_SOURCE }, () => {
    const artifact = structuredClone(official());
    artifact.lanes.msha.accidents.rowCount -= 1;
    reseal(artifact);
    assert.equal(verifyNcuaPbgcMshaRealExperience(artifact).ok, true);
    const checked = verifyNcuaPbgcMshaRealExperienceWithSource(artifact, SOURCE);
    assert.equal(checked.ok, false);
    assert.equal(checked.candidateArtifactExactlyRebuilt, false);
    assert.match(checked.error, /CANDIDATE_ARTIFACT_NOT_EXACT_REBUILD/u);
  });

test("coherently resealed authority or training escalation fails standalone verification", () => {
  const authority = structuredClone(buildNcuaPbgcMshaRealExperienceFromBytes(fixture()));
  authority.authority.PRICE = true;
  assert.match(verifyNcuaPbgcMshaRealExperience(reseal(authority)).error,
    /AUTHORITY_ESCALATION/u);
  const training = structuredClone(buildNcuaPbgcMshaRealExperienceFromBytes(fixture()));
  training.rights.modelTrainingRightConcluded = true;
  assert.match(verifyNcuaPbgcMshaRealExperience(reseal(training)).error,
    /BOUNDARY_ESCALATION/u);
});

test("source directory profile rejects unexpected files before source admission", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-ncua-pbgc-msha-extra-"));
  writeFileSync(path.join(directory, "unexpected"), "x");
  assert.throws(() => buildNcuaPbgcMshaRealExperienceFromSourceDirectory(directory),
    /SOURCE_DIRECTORY_PROFILE_MISMATCH/u);
});

test("CLI exposes separate structure-only and full-source verification", () => {
  const help = spawnSync(process.execPath,
    [path.join(ROOT, "scripts/ncua-pbgc-msha-real-experience.mjs"), "--help"],
    { encoding: "utf8" });
  assert.equal(help.status, 0);
  assert.match(help.stdout, /verify-source/u);
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-ncua-pbgc-msha-cli-"));
  const file = path.join(directory, "fixture.json");
  writeFileSync(file, `${JSON.stringify(buildNcuaPbgcMshaRealExperienceFromBytes(fixture()))}\n`);
  const verified = spawnSync(process.execPath,
    [path.join(ROOT, "scripts/ncua-pbgc-msha-real-experience.mjs"), "verify", "--artifact", file],
    { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).verificationLevel, "STRUCTURE_ONLY");
});
