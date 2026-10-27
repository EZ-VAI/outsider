import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdtempSync, readFileSync, utimesSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildInstitutionalCapitalClaimsEvidenceFromSource,
  INSTITUTIONAL_CAPITAL_CLAIMS_DEFAULT_GENERATED_AT,
  INSTITUTIONAL_CAPITAL_CLAIMS_FROZEN_AT,
  INSTITUTIONAL_CAPITAL_CLAIMS_LEDGER_GAP_COUNT,
  INSTITUTIONAL_CAPITAL_CLAIMS_LEDGER_HASH,
  INSTITUTIONAL_CAPITAL_CLAIMS_MEASUREMENT_DICTIONARY,
  INSTITUTIONAL_CAPITAL_CLAIMS_MINIMUM_EXTERNAL_BUNDLES,
  INSTITUTIONAL_CAPITAL_CLAIMS_QUALITY_GATE,
  INSTITUTIONAL_CAPITAL_CLAIMS_SCHEMA,
  INSTITUTIONAL_CAPITAL_CLAIMS_SOURCE_PINS,
  verifyInstitutionalCapitalClaimsEvidence,
  verifyInstitutionalCapitalClaimsEvidenceAgainstSource,
  verifyInstitutionalCapitalClaimsEvidenceCanonicalFile,
} from "../src/outsider-institutional-capital-claims-evidence.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const SOURCE = path.join(ROOT, "artifacts/institutional-capital-claims-20260821/source");
const HAS_SOURCE = existsSync(SOURCE);

function domainHash(domain, value) {
  return `sha256:${createHash("sha256").update(
    `${domain}\0${canonicalizeStrict(value)}`).digest("hex")}`;
}

function reseal(artifact, { diagnostics = false, matrix = false } = {}) {
  if (diagnostics) {
    artifact.diagnosticCommitmentHash = domainHash(
      "outsider:institutional-capital-claims-diagnostics:v1", artifact.diagnostics);
  }
  if (matrix) {
    artifact.gapSourceMatrixHash = domainHash(
      "outsider:institutional-capital-claims-gap-matrix:v1", artifact.gapSourceMatrix);
  }
  delete artifact.artifactHash;
  artifact.artifactHash = domainHash(INSTITUTIONAL_CAPITAL_CLAIMS_SCHEMA, artifact);
  return artifact;
}

function build() {
  return buildInstitutionalCapitalClaimsEvidenceFromSource({ sourceDirectory: SOURCE });
}

test("quality gate is publisher-neutral and minimum bundles cover 36 external gaps", () => {
  assert.equal(INSTITUTIONAL_CAPITAL_CLAIMS_SOURCE_PINS.length, 14);
  assert.equal(INSTITUTIONAL_CAPITAL_CLAIMS_MEASUREMENT_DICTIONARY.entries.length, 19);
  assert.equal(INSTITUTIONAL_CAPITAL_CLAIMS_QUALITY_GATE.dimensions.length, 9);
  assert.equal(INSTITUTIONAL_CAPITAL_CLAIMS_QUALITY_GATE.assessments.length, 8);
  assert.equal(INSTITUTIONAL_CAPITAL_CLAIMS_QUALITY_GATE
    .publisherIdentityUsedAsQualityScore, false);
  assert.match(INSTITUTIONAL_CAPITAL_CLAIMS_LEDGER_HASH, /^sha256:[a-f0-9]{64}$/);
  const ids = INSTITUTIONAL_CAPITAL_CLAIMS_MINIMUM_EXTERNAL_BUNDLES
    .flatMap((bundle) => bundle.gapIds);
  assert.equal(ids.length, 36);
  assert.equal(new Set(ids).size, 36);
  assert.ok(INSTITUTIONAL_CAPITAL_CLAIMS_MINIMUM_EXTERNAL_BUNDLES
    .every((bundle) => bundle.cannotBeClosedByThisArtifact === true));
});

test("full source build preserves real failure, payment, reserve, and capital diagnostics",
  { skip: !HAS_SOURCE }, () => {
    const artifact = build();
    const verified = verifyInstitutionalCapitalClaimsEvidenceAgainstSource(artifact,
      { sourceDirectory: SOURCE });
    assert.equal(verified.ok, true);
    assert.equal(verified.sourceArtifactsReverified, true);
    assert.equal(verified.verificationLevel,
      "FULL_OFFICIAL_FDIC_TREASURY_SEC_ASB_SOURCE_REPLAYED");
    assert.equal(artifact.sourceManifest.sourceObjects.length, 14);
    assert.equal(artifact.sourceManifest.sourceBytes, 12_466_079);
    assert.equal(artifact.sourceManifest.frozenAt, INSTITUTIONAL_CAPITAL_CLAIMS_FROZEN_AT);
    assert.equal(artifact.generatedAt, INSTITUTIONAL_CAPITAL_CLAIMS_DEFAULT_GENERATED_AT);
    assert.ok(Date.parse(artifact.generatedAt) >= Date.parse(artifact.gapSourceMatrix.ledgerAsOf));
    assert.equal(artifact.gapSourceMatrix.totalGaps,
      INSTITUTIONAL_CAPITAL_CLAIMS_LEDGER_GAP_COUNT);
    assert.equal(artifact.gapSourceMatrix.internalSatisfied, 33);
    assert.equal(artifact.gapSourceMatrix.externalBlocked, 36);
    assert.ok(artifact.gapSourceMatrix.rows.every((row) => row.closureCredit === false));
    assert.equal(artifact.authority.OutsiderCapital, false);
    assert.equal(artifact.authority.OutsiderCustody, false);
    assert.equal(artifact.authority.productionReady, false);
    assert.equal(artifact.rightsBoundary.TRAIN, false);
  });

test("artifact generation cannot be backdated before its readiness ledger",
  { skip: !HAS_SOURCE }, () => {
    assert.throws(() => buildInstitutionalCapitalClaimsEvidenceFromSource(
      { sourceDirectory: SOURCE }, { generatedAt: "2026-08-22T08:59:59.999Z" }),
    /GENERATED_AT_PRECEDES_GAP_LEDGER_AS_OF/u);

    const backdated = structuredClone(build());
    backdated.generatedAt = "2026-08-21T10:30:00.000Z";
    reseal(backdated);
    const checked = verifyInstitutionalCapitalClaimsEvidence(backdated);
    assert.equal(checked.ok, false);
    assert.match(checked.failures.join("\n"), /ARTIFACT_ENVELOPE_INVALID/u);
  });

test("failure denominators and revision risk stay explicit", { skip: !HAS_SOURCE }, () => {
  const failure = build().diagnostics.fdicFailures;
  assert.equal(failure.endpointAccounting.publishedRows, 4115);
  assert.deepEqual(failure.resolutionCounts.byRestype, { ASSISTANCE: 593, FAILURE: 3522 });
  assert.equal(failure.missingnessAndRevision.costMissingRows, 638);
  assert.equal(failure.missingnessAndRevision.costNegativeRows, 12);
  assert.equal(failure.missingnessAndRevision.pre1986CostMissingRows, 599);
  assert.equal(failure.ratioDiagnostics.costToPreFailureDeposits.eligibleRows, 3475);
  assert.equal(failure.ratioDiagnostics.costToPreFailureDeposits.p50NearestRank,
    "0.21118274");
  assert.equal(failure.ratioDiagnostics.costToPreFailureAssets.maximum, "10.87100999");
  assert.equal(failure.selectionBoundary.failureFrequencyEligible, false);
  assert.equal(failure.missingnessAndRevision.costIsInsuranceReserve, false);
});

test("dividend math preserves duplicates, categories, revisions, and incomplete final recovery",
  { skip: !HAS_SOURCE }, () => {
    const dividend = build().diagnostics.fdicReceivershipDividends;
    assert.equal(dividend.endpointAccounting.publishedRows, 2385);
    assert.equal(dividend.endpointAccounting.exactSameEventMultisetAcrossTwoFetches, true);
    assert.equal(dividend.endpointAccounting.exactRawOrderSameAcrossTwoFetches, false);
    assert.equal(dividend.endpointAccounting.exactDuplicateExtraRows, 3);
    assert.equal(dividend.categoryAccounting.unrecognizedPriorityRows, 1);
    assert.equal(dividend.categoryAccounting.unrecognizedDividendTypeRows, 1);
    assert.equal(dividend.groupedCumulativeDiagnostics.groupsWithDownwardCumulativeRevision, 5);
    assert.equal(dividend.closureToPaymentLatencyDays.p50, 1336);
    assert.equal(dividend.closureToPaymentLatencyDays.maximum, 7014);
    assert.equal(dividend.finalDividendDiagnostics.finalEventRows, 496);
    assert.equal(dividend.finalDividendDiagnostics.finalEventRowsBelow100Percent, 492);
    assert.equal(dividend.finalDividendDiagnostics.finalMeansFullClaimRecovery, false);
    assert.equal(dividend.evidenceBoundary.bankTransferReceiptObserved, false);
  });

test("SEC XBRL reserve reconciliation does not cross entity or authority boundaries",
  { skip: !HAS_SOURCE }, () => {
    const sec = build().diagnostics.secInsurerDisclosure;
    assert.equal(sec.reserveReconciliation.grossClaimsAndClaimAdjustmentLiability.valueUsd,
      "2886819000");
    assert.equal(sec.reserveReconciliation.reinsuranceRecoverableForUnpaidClaims.valueUsd,
      "746798000");
    assert.equal(sec.reserveReconciliation.netUnpaidClaimsAndClaimAdjustmentLiability.valueUsd,
      "2140021000");
    assert.equal(sec.reserveReconciliation.reconciliationDifferenceUsd, "0");
    assert.equal(sec.reserveReconciliation.reinsuranceRecoverableShareOfGross, "0.25869235");
    assert.equal(sec.statutoryCapital
      .exactAggregateInsuranceSubsidiaryStatutoryCapitalAndSurplus.valueUsd, "1846615000");
    assert.equal(sec.statutoryCapital
      .principalInsuranceCompanyAuthorizedControlLevelRbc.valueUsd, "306000000");
    assert.equal(sec.statutoryCapital.exactFactsHaveSameEntityScope, false);
    assert.equal(sec.statutoryCapital.ratioBetweenExactFactsEligible, false);
    assert.equal(sec.restrictedRegulatoryDeposit.restrictedInvestments.valueUsd, "107000000");
    assert.equal(sec.restrictedRegulatoryDeposit.outsiderCustodyEstablished, false);
  });

test("standalone verification is explicitly untrusted", { skip: !HAS_SOURCE }, () => {
  const checked = verifyInstitutionalCapitalClaimsEvidence(build());
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "SELF_SEALED_UNTRUSTED_ENVELOPE");
  assert.equal(checked.sourceArtifactsReverified, false);
  assert.equal(checked.authorityBoundaryVerified, false);
  assert.equal(checked.productionReady, false);
});

test("coherently resealed math can pass untrusted structure but fails source replay",
  { skip: !HAS_SOURCE }, () => {
    const artifact = structuredClone(build());
    artifact.diagnostics.fdicFailures.missingnessAndRevision.costMissingRows -= 1;
    reseal(artifact, { diagnostics: true });
    const structural = verifyInstitutionalCapitalClaimsEvidence(artifact);
    assert.equal(structural.ok, true);
    assert.equal(structural.sourceArtifactsReverified, false);
    const full = verifyInstitutionalCapitalClaimsEvidenceAgainstSource(artifact,
      { sourceDirectory: SOURCE });
    assert.equal(full.ok, false);
    assert.match(full.failures.join("\n"), /SOURCE_REPLAY_DERIVATION_INVALID/);
  });

test("authority and publisher-quality promotion fail even after coherent reseal",
  { skip: !HAS_SOURCE }, () => {
    const authority = structuredClone(build());
    authority.authority.OutsiderCapital = true;
    authority.authority.OutsiderCustody = true;
    reseal(authority);
    assert.equal(verifyInstitutionalCapitalClaimsEvidence(authority).ok, false);

    const quality = structuredClone(build());
    quality.qualityGate.publisherIdentityUsedAsQualityScore = true;
    quality.qualityGate.assessments[0].admissionDecision = "AUTO_PROMOTE_OFFICIAL_SOURCE";
    reseal(quality);
    assert.equal(verifyInstitutionalCapitalClaimsEvidence(quality).ok, false);
  });

test("same-size source tamper and source substitution fail exact replay",
  { skip: !HAS_SOURCE }, () => {
    const artifact = build();
    const tamperRoot = mkdtempSync(path.join(tmpdir(), "outsider-capital-tamper-"));
    const tamperSource = path.join(tamperRoot, "source");
    cpSync(SOURCE, tamperSource, { recursive: true });
    const schemaFile = path.join(tamperSource, "fdic-failure-properties.yaml");
    const schemaBytes = readFileSync(schemaFile);
    schemaBytes[100] ^= 1;
    writeFileSync(schemaFile, schemaBytes);
    const tampered = verifyInstitutionalCapitalClaimsEvidenceAgainstSource(artifact,
      { sourceDirectory: tamperSource });
    assert.equal(tampered.ok, false);
    assert.match(tampered.failures.join("\n"), /SOURCE_FILE_CHANGED_OR_MISMATCHED/);

    const substituteRoot = mkdtempSync(path.join(tmpdir(), "outsider-capital-substitute-"));
    const substituteSource = path.join(substituteRoot, "source");
    cpSync(SOURCE, substituteSource, { recursive: true });
    cpSync(path.join(substituteSource, "fdic-dividends.json"),
      path.join(substituteSource, "fdic-dividends-repeat.json"));
    const substituted = verifyInstitutionalCapitalClaimsEvidenceAgainstSource(artifact,
      { sourceDirectory: substituteSource });
    assert.equal(substituted.ok, false);
    assert.match(substituted.failures.join("\n"), /SOURCE_FILE_CHANGED_OR_MISMATCHED/);
  });

test("caller callbacks and verifier results are not an admission path", { skip: !HAS_SOURCE }, () => {
  const artifact = build();
  const checked = verifyInstitutionalCapitalClaimsEvidenceAgainstSource(artifact, {
    sourceDirectory: SOURCE,
    trusted: true,
    verificationResult: { ok: true },
    admit: () => true,
  });
  assert.equal(checked.ok, false);
  assert.match(checked.failures.join("\n"), /SOURCE_INPUT_SCHEMA_INVALID/);
});

test("CLI builds, full-verifies, and refuses overwrite", { skip: !HAS_SOURCE }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-capital-cli-"));
  const output = path.join(directory, "evidence.json");
  const command = ["scripts/institutional-capital-claims-evidence.mjs", "build",
    "--source-dir", SOURCE, "--out", output];
  const first = spawnSync(process.execPath, command, { cwd: ROOT, encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  const receipt = JSON.parse(first.stdout);
  assert.equal(receipt.sourceObjects, 14);
  assert.equal(receipt.failureRows, 4115);
  assert.equal(receipt.dividendRows, 2385);
  assert.equal(receipt.externalGapsClosed, 0);
  assert.equal(receipt.verificationLevel,
    "FULL_OFFICIAL_FDIC_TREASURY_SEC_ASB_SOURCE_REPLAYED_CANONICAL_FILE");
  const second = spawnSync(process.execPath, command, { cwd: ROOT, encoding: "utf8" });
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /EEXIST|file already exists/i);

  const verify = spawnSync(process.execPath,
    ["scripts/institutional-capital-claims-evidence.mjs", "verify",
      "--source-dir", SOURCE, "--artifact", output],
    { cwd: ROOT, encoding: "utf8" });
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).sourceArtifactsReverified, true);

  const parsed = JSON.parse(readFileSync(output, "utf8"));
  const temporalAttack = path.join(directory, "future-relative-to-mtime.json");
  writeFileSync(temporalAttack, readFileSync(output), { mode: 0o600 });
  const beforeDeclaredTime = new Date(Date.parse(parsed.generatedAt) - 1_000);
  utimesSync(temporalAttack, beforeDeclaredTime, beforeDeclaredTime);
  const rejected = verifyInstitutionalCapitalClaimsEvidenceCanonicalFile(temporalAttack,
    { sourceDirectory: SOURCE });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.canonicalGeneratedAtNoLaterThanStableFileMtime, false);
  assert.match(rejected.failures.join("\n"),
    /CANONICAL_GENERATED_AT_AFTER_STABLE_FILE_MTIME/u);
});
