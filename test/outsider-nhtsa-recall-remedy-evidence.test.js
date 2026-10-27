import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdtempSync, readFileSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildNhtsaRecallRemedyEvidenceFromSourceDirectory,
  NHTSA_RECALL_REMEDY_CANONICAL_GENERATED_AT,
  NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821,
  nhtsaRecallRemedyExpectedAcquisitionManifest,
  verifyNhtsaRecallRemedyEvidence,
  verifyNhtsaRecallRemedyEvidenceWithSource,
} from "../src/outsider-nhtsa-recall-remedy-evidence.js";

const sourceDirectory = path.resolve("artifacts/nhtsa-recall-remedy-evidence-20260821/source");
const artifactPath = path.resolve(
  "artifacts/nhtsa-recall-remedy-evidence-20260821/final-v6/evidence.json");
const canonicalPromise = existsSync(sourceDirectory)
  ? buildNhtsaRecallRemedyEvidenceFromSourceDirectory(sourceDirectory) : null;

function reseal(artifact) {
  const { artifactHash: _old, ...withoutHash } = artifact;
  return { ...withoutHash, artifactHash: `sha256:${createHash("sha256")
    .update(canonicalizeStrict(withoutHash)).digest("hex")}` };
}

test("frozen NHTSA source pins six official objects and all compressed/uncompressed bytes", () => {
  const source = NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821;
  assert.equal(source.files.length, 6);
  assert.equal(new Set(source.files.map((file) => file.name)).size, 6);
  assert.equal(source.files.reduce((total, file) => total + file.bytes, 0), 16_452_753);
  assert.ok(source.files.every((file) => file.bytes > 0
    && /^sha256:[a-f0-9]{64}$/u.test(file.sha256)
    && file.url.startsWith("https://static.nhtsa.gov/")));
  const archives = source.files.filter((file) => file.entryName);
  assert.equal(archives.length, 3);
  assert.equal(archives.reduce((total, file) => total + file.entryBytes, 0), 319_978_059);
  assert.ok(archives.every((file) => /^sha256:[a-f0-9]{64}$/u.test(file.entrySha256)));
  const manifest = nhtsaRecallRemedyExpectedAcquisitionManifest();
  assert.equal(manifest.transportAttested, false);
  assert.equal(manifest.objects.length, 6);
});

test("exact post-2010 replay deduplicates at campaign level before affected-population summation", {
  skip: canonicalPromise === null,
}, async () => {
  const artifact = await canonicalPromise;
  assert.equal(artifact.source.profileMatchedAtBuild, true);
  assert.equal(artifact.recallPopulation.rows, 244_499);
  assert.equal(artifact.recallPopulation.uniqueRecordIds, 244_499);
  assert.equal(artifact.recallPopulation.duplicateRecordIds, 0);
  assert.equal(artifact.recallPopulation.uniqueCampaigns, 15_197);
  assert.equal(artifact.recallPopulation.affectedPopulation.singlePopulationCampaigns, 15_197);
  assert.equal(artifact.recallPopulation.affectedPopulation
    .totalPotentialAffectedAcrossSinglePopulationCampaigns, "699086836");
  assert.equal(artifact.recallPopulation.affectedPopulation.summedOncePerCampaign, true);
  assert.equal(artifact.recallPopulation.affectedPopulation
    .actualExposureOrUniqueVehiclesOnRoadEstablished, false);
  assert.equal(artifact.recallPopulation.remedyPublication
    .campaignsWithCorrectiveActionText, 15_197);
  assert.equal(artifact.recallPopulation.remedyPublication
    .correctiveActionTextEstablishesRepairCompleted, false);
});

test("quarterly source anomalies remain visible and are never repaired into valid status", {
  skip: canonicalPromise === null,
}, async () => {
  const artifact = await canonicalPromise;
  const quarterly = artifact.quarterlyStatus;
  assert.equal(quarterly.rows, 75_624);
  assert.equal(quarterly.uniqueCampaigns, 11_834);
  assert.equal(quarterly.sourceQualityAnomalies.invalidPeriodRows, 2);
  assert.deepEqual(quarterly.sourceQualityAnomalies.invalidPeriodExamples
    .map((row) => row.observedPeriod), ["2099-", "2022"]);
  assert.equal(quarterly.sourceQualityAnomalies.componentSumExceedsInvolvedRows, 1);
  assert.deepEqual(quarterly.sourceQualityAnomalies.arithmeticAnomalyExamples[0], {
    rowHash: "sha256:9337b350c60bc75030ff8e8f4c42821159f87403f6bc37767548b14e28ac6b5a",
    campaignFingerprint: "sha256:3bab9c0d70b100d838adfa31a2ef0ddb85c667827206d96baaf2ae6b71f83bbb",
    period: "2016-4", involved: "0", remedied: "22", unreachable: "0", removed: "584",
  });
  assert.equal(quarterly.sourceQualityAnomalies.anomaliesRetainedNotRepaired, true);
  assert.equal(quarterly.latestObservedCampaignSnapshot
    .latestRowsAreNotReplacedByEarlierValidRows, true);
});

test("latest observed status is a bounded descriptive snapshot, never a repair receipt or rate", {
  skip: canonicalPromise === null,
}, async () => {
  const artifact = await canonicalPromise;
  const quarterly = artifact.quarterlyStatus.latestObservedCampaignSnapshot;
  const annual = artifact.annualStatus.latestObservedCampaignSnapshot;
  assert.equal(quarterly.involved, "487232535");
  assert.equal(quarterly.remedied, "295629360");
  assert.equal(quarterly.remediedToInvolvedRatio, 0.606752092202);
  assert.equal(annual.involved, "108749786");
  assert.equal(annual.remedied, "72493743");
  assert.equal(annual.remediedToInvolvedRatio, 0.666610442801);
  assert.equal(quarterly.ratioIsNotUniqueRepairReceiptOrActuarialRate, true);
  assert.equal(artifact.lifecycleLinkage.withQuarterlyStatus, 11_833);
  assert.equal(artifact.lifecycleLinkage.withAnnualStatus, 2_796);
  assert.equal(artifact.lifecycleLinkage.withBothQuarterlyAndAnnualStatus, 2_796);
  assert.deepEqual(artifact.lifecycleLinkage.quarterlyPopulationReconciliation, {
    selectedStatusCampaigns: 11_834,
    statusCampaignsWithRecallPopulation: 11_833,
    statusCampaignsOutsideCapturedRecallPopulation: 1,
    exactMatches: 11_780,
    statusInvolvedGreater: 17,
    recallPotentialAffectedGreater: 36,
    totalAbsoluteDifference: "316960",
    reconciliationDifferenceRetainedNotAdjusted: true,
    eitherFieldIsCurrentInServiceExposureEstablished: false,
  });
  assert.equal(artifact.lifecycleLinkage.annualPopulationReconciliation.exactMatches, 2_796);
  assert.equal(artifact.lifecycleLinkage.annualPopulationReconciliation.totalAbsoluteDifference, "0");
  assert.equal(artifact.lifecycleLinkage.completeRepairChainEstablished, false);
  assert.equal(artifact.lifecycleLinkage.paymentRecoveryReopeningClosureChainEstablished, false);
  assert.equal(artifact.ontology.statusRowEstablishesAffectedPartyReceipt, false);
  assert.equal(artifact.ontology.statusCountsEstablishPaidIncurredOrUltimateLoss, false);
  assert.equal(artifact.ontology.recallManagementRecordIsEnforcementOrder, false);
  assert.equal(artifact.qualityAndMissingness.enforcementActionOrConsentOrderBodiesCaptured, false);
});

test("standalone verification stays structure-only and rejects authority, rights, or truth escalation", {
  skip: canonicalPromise === null,
}, async () => {
  const artifact = await canonicalPromise;
  const checked = verifyNhtsaRecallRemedyEvidence(artifact);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "STRUCTURE_ONLY");
  assert.equal(checked.realInstitutionalRecordAdmissionEstablished, false);
  const authority = reseal({ ...artifact,
    authority: { ...artifact.authority, PRICE: true } });
  assert.equal(verifyNhtsaRecallRemedyEvidence(authority).ok, false);
  const rights = reseal({ ...artifact,
    rights: { ...artifact.rights, modelTrainingRightConcluded: true } });
  assert.equal(verifyNhtsaRecallRemedyEvidence(rights).ok, false);
  const truth = reseal({ ...artifact,
    ontology: { ...artifact.ontology, officialRecordAutomaticallyEqualsUnderlyingWorldTruth: true } });
  assert.equal(verifyNhtsaRecallRemedyEvidence(truth).ok, false);
});

test("canonical generatedAt cannot be attacker-selected and resealed for full admission", {
  skip: canonicalPromise === null,
}, async () => {
  const artifact = await canonicalPromise;
  assert.equal(artifact.generatedAt, NHTSA_RECALL_REMEDY_CANONICAL_GENERATED_AT);
  for (const generatedAt of ["2000-01-01T00:00:00.000Z", "2099-01-01T00:00:00.000Z"]) {
    const attacked = reseal({ ...artifact, generatedAt });
    const standalone = verifyNhtsaRecallRemedyEvidence(attacked);
    assert.equal(standalone.ok, false);
    assert.ok(standalone.errors.includes("GENERATED_AT_NOT_CANONICAL_FROZEN_VALUE"));
    const full = await verifyNhtsaRecallRemedyEvidenceWithSource(attacked, sourceDirectory);
    assert.equal(full.ok, false);
    assert.equal(full.realInstitutionalRecordAdmissionEstablished, false);
    assert.equal(full.decision, null);
    await assert.rejects(buildNhtsaRecallRemedyEvidenceFromSourceDirectory(sourceDirectory,
      { generatedAt }), /GENERATED_AT_NOT_CANONICAL_FROZEN_VALUE/u);
  }
});

test("resealed descriptive-number mutation fails exact source reconstruction", {
  skip: canonicalPromise === null,
}, async () => {
  const artifact = await canonicalPromise;
  const attacked = reseal({ ...artifact, quarterlyStatus: { ...artifact.quarterlyStatus,
    latestObservedCampaignSnapshot: {
      ...artifact.quarterlyStatus.latestObservedCampaignSnapshot,
      remedied: "295629361",
    } } });
  assert.equal(verifyNhtsaRecallRemedyEvidence(attacked).ok, true);
  const checked = await verifyNhtsaRecallRemedyEvidenceWithSource(attacked, sourceDirectory);
  assert.equal(checked.ok, false);
  assert.ok(checked.errors.some((error) => error.includes("EXACT_REBUILD_MISMATCH")));
});

test("source directory rejects extra and symlinked members before source admission", async () => {
  const extra = mkdtempSync(path.join(tmpdir(), "outsider-nhtsa-recall-extra-"));
  writeFileSync(path.join(extra, "unexpected"), "x");
  await assert.rejects(buildNhtsaRecallRemedyEvidenceFromSourceDirectory(extra),
    /SOURCE_DIRECTORY_PROFILE_MISMATCH/u);
  const linked = mkdtempSync(path.join(tmpdir(), "outsider-nhtsa-recall-linked-"));
  for (const file of NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.files) {
    writeFileSync(path.join(linked, file.name), "x");
  }
  writeFileSync(path.join(linked, "acquisition.json"), "x");
  const first = path.join(linked, NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.files[0].name);
  unlinkSync(first);
  symlinkSync(path.join(linked,
    NHTSA_RECALL_REMEDY_FROZEN_SOURCE_20260821.files[1].name), first);
  await assert.rejects(buildNhtsaRecallRemedyEvidenceFromSourceDirectory(linked),
    /SOURCE_FILE_UNSAFE/u);
});

test("canonical artifact performs full exact source-aware replay", {
  skip: !(existsSync(sourceDirectory) && existsSync(artifactPath)),
}, async () => {
  const serialized = readFileSync(artifactPath);
  const artifact = JSON.parse(serialized.toString("utf8"));
  const checked = await verifyNhtsaRecallRemedyEvidenceWithSource(artifact, sourceDirectory);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel,
    "FULL_PINNED_NHTSA_RECALL_REMEDY_SOURCE_REPLAY_AND_EXACT_ARTIFACT_COMPARE");
  assert.equal(checked.realInstitutionalRecordAdmissionEstablished, true);
  assert.equal(checked.underlyingWorldTruthEstablished, false);
  assert.equal(checked.affectedPartyReceiptEstablished, false);
  assert.equal(checked.completeRepairEstablished, false);
  assert.equal(checked.institutionalAuthorityEstablished, false);
  assert.equal(artifact.artifactHash,
    "sha256:afad74141571a82e40564f7b43bcacb0ccea2671684f3809e4bf4717af069034");
  assert.equal(`sha256:${createHash("sha256").update(serialized).digest("hex")}`,
    "sha256:47ff5b8ccb8f780efe235d39bcf21c890917a54baa4f1de1114881af1fad628e");
});

test("acquisition and evidence CLIs preserve no-clobber exact-byte contracts", {
  skip: !(existsSync(sourceDirectory) && existsSync(artifactPath)),
}, () => {
  const help = spawnSync(process.execPath,
    ["scripts/acquire-nhtsa-recall-remedy-evidence.mjs", "--help"],
    { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(help.status, 0, help.stderr);
  const output = mkdtempSync(path.join(tmpdir(), "outsider-nhtsa-recall-acquire-"));
  const acquire = spawnSync(process.execPath, [
    "scripts/acquire-nhtsa-recall-remedy-evidence.mjs",
    "--import-dir", sourceDirectory, "--out-dir", output,
  ], { cwd: path.resolve("."), encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  assert.equal(acquire.status, 0, acquire.stderr);
  const receipt = JSON.parse(acquire.stdout);
  assert.equal(receipt.sourceCount, 6);
  assert.equal(receipt.sourceBytes, 16_452_753);
  const verify = spawnSync(process.execPath, [
    "scripts/nhtsa-recall-remedy-evidence.mjs", "verify", "--artifact", artifactPath,
  ], { cwd: path.resolve("."), encoding: "utf8" });
  assert.equal(verify.status, 0, verify.stderr);
  assert.equal(JSON.parse(verify.stdout).verificationLevel, "STRUCTURE_ONLY");
});
