import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildFemaRealCasesEvidence,
  FEMA_REAL_CASES_FROZEN_SOURCE_20260821,
  verifyFemaRealCasesEvidence,
  verifyFemaRealCasesEvidenceWithSource,
} from "../src/outsider-fema-real-cases-evidence.js";

const SOURCE = path.resolve("artifacts/fema-real-cases-20260821/source-v3");
const HAS_SOURCE = existsSync(path.join(SOURCE, "acquisition-manifest.json"));
const DOMAIN = "outsider:fema-real-cases-evidence:v1";

function reseal(artifact) {
  const { artifactHash: _old, ...body } = artifact;
  const artifactHash = `sha256:${createHash("sha256")
    .update(`${DOMAIN}\0${canonicalizeStrict(body)}`).digest("hex")}`;
  return { ...body, artifactHash };
}

test("FEMA frozen profile pins scope and official first-party hosts", () => {
  const profile = FEMA_REAL_CASES_FROZEN_SOURCE_20260821;
  assert.equal(profile.sourceObjects, 51);
  assert.equal(profile.sourceBytes, 6_358_150);
  assert.equal(profile.claimRecords, 3_341);
  assert.equal(profile.claimPages, 34);
  assert.equal(profile.directObjects, 16);
  assert.match(profile.manifestHash, /^sha256:[a-f0-9]{64}$/);
  for (const url of Object.values(profile.officialPages)) {
    assert.equal(new URL(url).protocol, "https:");
    assert.ok(new Set(["www.fema.gov", "www.cbca.gov"]).has(new URL(url).hostname));
  }
});

test("FEMA acquisition CLI refuses a stale caller-supplied acquisition time", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-fema-acquire-cli-"));
  const out = path.join(directory, "must-not-exist");
  const script = path.resolve("scripts/acquire-fema-real-cases.mjs");
  const result = spawnSync(process.execPath, [script, "--out", out, "--acquired-at",
    "2020-01-01T00:00:00.000Z"], { encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /FEMA_ACQUIRE_TIME_NOT_CURRENT/);
  assert.equal(existsSync(out), false);
});

test("FEMA real-case source replay admits exact loss, exposure, and appeal facts", {
  skip: !HAS_SOURCE,
}, () => {
  const artifact = buildFemaRealCasesEvidence(SOURCE);
  assert.equal(artifact.source.sourceRealityClass, "REAL_ADMINISTRATIVE_CASES_AND_EXPERIENCE");
  assert.equal(artifact.source.publicDiscoveryDoesNotDowngradeRealityClass, true);
  assert.equal(artifact.source.acquisitionManifestHash,
    FEMA_REAL_CASES_FROZEN_SOURCE_20260821.manifestHash);
  assert.equal(artifact.source.sourceObjects, 51);
  assert.equal(artifact.source.sourceBytes, 6_358_150);

  assert.equal(artifact.nfipClaims.scope.recordCount, 3_341);
  assert.equal(artifact.nfipClaims.scope.completeWithinFilterAtAcquisition, true);
  assert.equal(artifact.nfipClaims.scope.policyCountAcrossClaimRecords, 3_946);
  assert.equal(artifact.nfipClaims.payments.netTotalPaymentDollars, "260428104.72");
  assert.equal(artifact.nfipClaims.payments.grossReportedPaymentDollars, "260522191.98");
  assert.equal(artifact.nfipClaims.payments.recordedRecoveryDollars, "94087.26");
  assert.equal(artifact.nfipClaims.payments.grossMinusComponentClaimPaymentRecoveriesEqualsNet,
    true);
  assert.equal(artifact.nfipClaims.empiricalSeverity.meanNetPaidDollars, "77949.15");
  assert.equal(artifact.nfipClaims.empiricalSeverity.p99NetPaidDollars, "560390.08");
  assert.equal(artifact.nfipClaims.paymentLatency.p95Days, 388);

  assert.equal(artifact.nfipResidentialExposure.northCarolina.contractsInForce, "106560");
  assert.equal(artifact.nfipResidentialExposure.northCarolina.totalResidentialStructures,
    "4056295");
  assert.equal(artifact.nfipResidentialExposure.temporalBoundary
    .mayBeUsedAsHelene2024ClaimFrequencyDenominator, false);
  assert.equal(artifact.nfipPolicyTransactionBoundary.publishedRecordCount, 74_349_525);
  assert.equal(artifact.nfipPolicyTransactionBoundary
    .publishedTransactionRecordCountTreatedAsExposureDenominator, false);

  const appeals = artifact.publicAssistanceSecondAppeals;
  assert.equal(appeals.records, 1_726);
  assert.equal(appeals.signedDecisionRows, 1_671);
  assert.equal(appeals.pendingUnderReviewRows, 55);
  assert.equal(appeals.meritsDecisionRows, 1_629);
  assert.equal(appeals.proceduralOrNonMeritsStatusRows, 42);
  assert.equal(appeals.statusWhitespaceNormalizedRows, 128);
  assert.equal(appeals.lifecycle.signedDecisionElapsedDays.p95, 432);
  assert.equal(appeals.lifecycle.rawElapsedThresholdCountsAreNotDeadlineViolationFindings, true);
  assert.equal(appeals.correlationQuality.additionalRowsSharingCompositeRoot, 12);
  assert.equal(appeals.pinnedDecisionBodies.bodiesCorrelatedOneToOneWithTrackerRows, 2);
  assert.equal(appeals.pinnedDecisionBodies.cases[0].secondAppealAmountDeniedDollars,
    "1851876.29");
  assert.equal(appeals.pinnedDecisionBodies.cases[1].candidateDifferenceDollars, "0.26");
  assert.equal(appeals.pinnedDecisionBodies.cases[1].singleApprovedAmountAdmitted, false);
  assert.equal(artifact.cbcaArbitration.officialFemaArbitrationIndexEntries, 349);
  assert.equal(artifact.cbcaArbitration.allIndexedDecisionBodiesDownloaded, false);

  const checked = verifyFemaRealCasesEvidenceWithSource(artifact, SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_FEMA_CBCA_FROZEN_SOURCE_REPLAY");
  assert.equal(checked.machineDerivedJsonAndJsonlMetricsVerified, true);
  assert.equal(checked.pdfSemanticReadoutMechanicallyVerified, false);
});

test("FEMA standalone envelope cannot manufacture source or authority verification", {
  skip: !HAS_SOURCE,
}, () => {
  const artifact = buildFemaRealCasesEvidence(SOURCE);
  const forged = reseal({ ...artifact, authority: { ...artifact.authority,
    price: true, settle: true } });
  const standalone = verifyFemaRealCasesEvidence(forged);
  assert.equal(standalone.ok, true);
  assert.equal(standalone.verificationLevel, "SELF_SEALED_UNTRUSTED_ENVELOPE");
  assert.equal(standalone.authorityBoundaryVerified, false);
  assert.equal(standalone.sourceArtifactsReverified, false);
  const replay = verifyFemaRealCasesEvidenceWithSource(forged, SOURCE);
  assert.equal(replay.ok, false);
  assert.match(replay.error, /ARTIFACT_SOURCE_REBUILD_MISMATCH/);
});

test("FEMA full replay rejects one-byte source mutation and extra source files", {
  skip: !HAS_SOURCE,
}, () => {
  const artifact = buildFemaRealCasesEvidence(SOURCE);
  const mutated = mkdtempSync(path.join(tmpdir(), "outsider-fema-mutated-"));
  cpSync(SOURCE, mutated, { recursive: true });
  const target = path.join(mutated, "pa-second-appeals-tracker-v1.jsonl");
  const bytes = readFileSync(target);
  bytes[bytes.length - 2] ^= 1;
  writeFileSync(target, bytes);
  const checked = verifyFemaRealCasesEvidenceWithSource(artifact, mutated);
  assert.equal(checked.ok, false);
  assert.match(checked.error, /SOURCE_FILE_CHANGED_OR_MISMATCHED/);

  const extra = mkdtempSync(path.join(tmpdir(), "outsider-fema-extra-"));
  cpSync(SOURCE, extra, { recursive: true });
  writeFileSync(path.join(extra, "caller-proof.json"), "true\n");
  assert.throws(() => buildFemaRealCasesEvidence(extra), /SOURCE_FILE_SET_INVALID/);
});

test("FEMA builder rejects caller trust overrides and keeps rights separate from reality", {
  skip: !HAS_SOURCE,
}, () => {
  assert.throws(() => buildFemaRealCasesEvidence(SOURCE, { official: true }),
    /OPTIONS_INVALID/);
  assert.throws(() => buildFemaRealCasesEvidence(SOURCE, {}), /OPTIONS_INVALID/);
  const artifact = buildFemaRealCasesEvidence(SOURCE);
  assert.equal(artifact.source.sourceIsRealWorldData, true);
  assert.equal(artifact.source.rights.realityClassificationUnaffectedByRights, true);
  assert.equal(artifact.source.rights.openFema.publicAccess, true);
  assert.equal(artifact.source.rights.openFema.trainingAuthorityGranted, false);
  assert.equal(artifact.source.rights.cbca.modelTrainingAuthorityEstablished, false);
  assert.equal(artifact.factorEntrance.individualRightsOrEligibilityDecisionUsePermitted, false);
  assert.deepEqual(artifact.authority, {
    observe: true,
    describeSourceDomain: true,
    sourceDomainShadowCalibration: true,
    price: false,
    guarantee: false,
    settle: false,
    coverage: false,
    capital: false,
    custody: false,
    train: false,
    close: false,
  });
  const serialized = JSON.stringify(artifact);
  for (const forbidden of ["Napa Valley Unified School District", "Seminole County",
    "055-1433C-00", "117-99117-00", "appellant\":"]) {
    assert.equal(serialized.includes(forbidden), false, forbidden);
  }
  assert.doesNotMatch(serialized, /"\d{12}"/);
});

test("FEMA real-case CLI builds, verifies, and refuses overwrite", { skip: !HAS_SOURCE }, () => {
  const directory = mkdtempSync(path.join(tmpdir(), "outsider-fema-cli-"));
  const out = path.join(directory, "evidence.json");
  const script = path.resolve("scripts/fema-real-cases-evidence.mjs");
  const built = spawnSync(process.execPath, [script, "build", "--source-dir", SOURCE,
    "--out", out], { encoding: "utf8" });
  assert.equal(built.status, 0, built.stderr);
  assert.equal(JSON.parse(built.stdout).ok, true);
  const verified = spawnSync(process.execPath, [script, "verify", "--source-dir", SOURCE,
    "--artifact", out], { encoding: "utf8" });
  assert.equal(verified.status, 0, verified.stderr);
  assert.equal(JSON.parse(verified.stdout).verificationLevel,
    "FULL_FEMA_CBCA_FROZEN_SOURCE_REPLAY");
  const overwrite = spawnSync(process.execPath, [script, "build", "--source-dir", SOURCE,
    "--out", out], { encoding: "utf8" });
  assert.notEqual(overwrite.status, 0);
  assert.match(overwrite.stderr, /EEXIST/);
});
