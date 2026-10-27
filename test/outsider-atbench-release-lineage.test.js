import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  ATBENCH_DATASET_ID,
  ATBENCH_RELEASE_LINEAGE_DISPOSITION,
  ATBENCH_RELEASE_LINEAGE_SCOPE,
  ATBENCH_REVISION,
  verifyAtbenchReleaseLineageArtifactDirectory,
} from "../src/outsider-atbench-release-lineage.js";

const artifact = path.resolve(
  "artifacts/outsider-atbench-release-lineage-20260829-v1");
const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sumValues(value) {
  return Object.values(value).reduce((sum, count) => sum + count, 0);
}

function walkModes(root, prefix = "") {
  const target = prefix === "" ? root : path.join(root, prefix);
  const status = lstatSync(target);
  assert.equal(status.isSymbolicLink(), false);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600);
  if (!status.isDirectory()) return;
  for (const name of readdirSync(target)) {
    walkModes(root, prefix === "" ? name : `${prefix}/${name}`);
  }
}

test("complete fixed revision preserves all files and release lineage", () => {
  assert.equal(report.disposition, ATBENCH_RELEASE_LINEAGE_DISPOSITION);
  assert.equal(report.scope.kind, ATBENCH_RELEASE_LINEAGE_SCOPE);
  assert.equal(report.scope.datasetId, ATBENCH_DATASET_ID);
  assert.equal(report.scope.revision, ATBENCH_REVISION);
  assert.equal(report.scope.completeFixedRevisionAcquired, true);
  assert.equal(report.source.fixedTreeEntries, 20);
  assert.equal(report.source.fixedTreeFiles, 15);
  assert.equal(report.source.fixedTreeDirectories, 5);
  assert.equal(report.source.fixedTreePathBytes, 35_925_668);
  assert.equal(report.source.fixedTreeUniquePayloadIdentities, 11);
  assert.equal(report.source.fixedTreeUniquePayloadBytes, 28_185_736);
  assert.equal(report.source.recordBeforeAfterExact, true);
  assert.equal(report.source.treeBeforeAfterExact, true);
  assert.deepEqual(
    readFileSync(path.join(artifact, "source/metadata/dataset-record-before.json")),
    readFileSync(path.join(artifact, "source/metadata/dataset-record-after.json")));
  assert.deepEqual(
    readFileSync(path.join(artifact, "source/metadata/full-tree-before.json")),
    readFileSync(path.join(artifact, "source/metadata/full-tree-after.json")));
  const manifest = JSON.parse(readFileSync(
    path.join(artifact, "source/source-manifest.json"), "utf8"));
  assert.equal(manifest.entries.length, 19);
  assert.equal(manifest.entries.filter((entry) => entry.repositoryPath).length, 15);
  assert.equal(report.lineage.currentSha256,
    "sha256:80c534b5f3517c872b528a2e6b64e34495206968edd184f4aed563d39f0cca09");
  assert.equal(report.lineage.legacySha256,
    "sha256:031285443c6b8ca64fc117bd995a4b4490c340467136506763aeed1b23c8f34c");
  assert.equal(report.lineage.legacyRootDuplicateByteExact, true);
  assert.equal(report.lineage.rootDuplicateIsThirdReleasePopulation, false);
  assert.equal(report.scope.rootLegacyDuplicateRowsAddedAsPopulation, 0);
});

test("current 1,000-row release fully replays schema, tools, and taxonomy", () => {
  const current = report.replay.current;
  assert.equal(current.rows, 1_000);
  assert.equal(current.ids, 1_000);
  assert.deepEqual(current.labels, { 0: 503, 1: 497 });
  assert.equal(current.turnRows, 9_009);
  assert.deepEqual(current.roleRows,
    { agent: 4_492, environment: 2_971, user: 1_546 });
  assert.equal(current.toolDefinitionRows, 3_156);
  assert.equal(current.uniqueAvailableToolNames, 2_084);
  assert.equal(current.uniqueAvailableToolDocuments, 2_390);
  assert.equal(current.parsedToolActionRows, 2_972);
  assert.equal(current.uniqueInvokedToolNames, 1_953);
  assert.equal(current.completeActionRows, 1_520);
  assert.equal(current.completeSuffixJsonRows, 1_520);
  assert.equal(current.actionArgumentDictRows, 2_966);
  assert.equal(current.actionArgumentStringRows, 6);
  assert.equal(Object.keys(current.taxonomyAllRows.risk_source).length, 9);
  assert.equal(Object.keys(current.taxonomyAllRows.failure_mode).length, 15);
  assert.equal(Object.keys(current.taxonomyAllRows.real_world_harm).length, 11);
  assert.equal(Object.keys(current.taxonomyUnsafeRows.risk_source).length, 8);
  assert.equal(Object.keys(current.taxonomyUnsafeRows.failure_mode).length, 14);
  assert.equal(Object.keys(current.taxonomyUnsafeRows.real_world_harm).length, 10);
  for (const taxonomy of Object.values(current.taxonomyUnsafeRows)) {
    assert.equal(sumValues(taxonomy), 497);
  }
  assert.equal(current.taxonomyAllRows.risk_source.inherent_agent_failures, 196);
  assert.equal(current.taxonomyAllRows.failure_mode.benign, 250);
  assert.equal(current.taxonomyAllRows.real_world_harm.security_and_system_integrity_harm,
    146);
});

test("legacy release stays separate and cross-release uniqueness stays unknown", () => {
  const legacy = report.replay.legacy;
  assert.equal(legacy.rows, 500);
  assert.equal(legacy.ids, 500);
  assert.deepEqual(legacy.labels, { 0: 250, 1: 250 });
  assert.equal(legacy.turnRows, 4_486);
  assert.deepEqual(legacy.roleRows,
    { agent: 2_243, environment: 1_743, user: 500 });
  assert.equal(legacy.toolDefinitionRows, 2_157);
  assert.equal(legacy.uniqueAvailableToolNames, 1_575);
  assert.equal(legacy.uniqueAvailableToolDocuments, 1_756);
  assert.equal(legacy.parsedToolActionRows, 1_743);
  assert.equal(legacy.uniqueInvokedToolNames, 1_364);
  assert.equal(legacy.completeActionRows, 500);
  assert.equal(legacy.completeSuffixJsonRows, 480);
  assert.equal(legacy.completeSuffixInvalidJsonRows, 20);
  assert.equal(legacy.actionErrorShapeRows, 1);
  for (const taxonomy of Object.values(legacy.taxonomyUnsafeRows)) {
    assert.equal(sumValues(taxonomy), 250);
  }
  assert.equal(report.lineage.currentLegacyCanonicalRowSignatureOverlap, 0);
  assert.equal(report.lineage.canonicalSignatureOverlapEstablishesUnderlyingExecutionUniqueness,
    false);
  assert.equal(report.scope.crossReleaseUnderlyingExecutionUniqueRows, null);
  assert.equal(report.scope.crossReleaseGlobalUniquenessClaimed, false);
});

test("publisher documentation drift and synthetic provenance remain explicit", () => {
  const docs = report.documentationConsistency;
  assert.deepEqual(docs.currentReleaseTableClaimHalfOpenByteSpan, [1_883, 1_968]);
  assert.deepEqual(docs.usedToolsDefinitionHalfOpenByteSpan, [2_145, 2_222]);
  assert.equal(docs.currentInvokedToolNamesDocumented, 1_954);
  assert.equal(docs.currentInvokedToolNamesReplayed, 1_953);
  assert.equal(docs.currentClaimReproducedOnlyByAddingCompletePseudoAction, true);
  assert.equal(docs.completeActionIsNotAnAvailableOrInvokedToolName, true);
  assert.equal(docs.legacyInvokedToolNamesDocumented, 1_357);
  assert.equal(docs.legacyInvokedToolNamesReplayed, 1_364);
  assert.equal(docs.legacyInvokedToolNamesCaseFolded, 1_361);
  assert.equal(docs.legacyClaimReproducedByExactNameCaseFoldOrCompleteCounting,
    false);
  assert.equal(report.provenance.publisherDescribesToolCallSimulation, true);
  assert.equal(report.provenance.publisherDescribesToolResponseSimulation, true);
  assert.equal(report.provenance.currentPublisherClaimedHumanAuditRows, 1_000);
  assert.equal(report.provenance.publisherHumanAuditDoesNotEstablishIndependentActionWitness,
    true);
  assert.equal(report.execution.verifiedExternalToolExecutionRows, 0);
  assert.equal(report.execution.independentlyReceiptedExecutionRows, 0);
  assert.equal(report.outcome.publisherNativeTrajectorySafetyLabelRows, 1_500);
  assert.equal(report.outcome.independentlyWitnessedActionOutcomeRows, 0);
  assert.equal(report.outcome.completeExternalAttemptCensusRows, 0);
  assert.equal(report.recovery.publisherNativeRecoveryLabelRows, 0);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
});

test("active content, privacy, rights, training, and authority fail closed", () => {
  assert.equal(report.replay.downloadedToolDescriptionsCommandsArgumentsOrResponsesExecuted,
    false);
  assert.equal(report.replay.rawContentProjected, false);
  assert.equal(report.privacy.patternCandidates.email, 3_699);
  assert.equal(report.privacy.patternCandidates.phone, 516);
  assert.equal(report.privacy.patternCandidates.ipv4, 540);
  assert.equal(report.privacy.patternCandidates.pemLikeKeyHeader, 1);
  assert.equal(report.privacy.patternScanIsNotAnonymityProof, true);
  assert.equal(report.privacy.noPiiOrSecretGuaranteed, false);
  assert.equal(report.privacy.rawVisualFiles, 10);
  assert.equal(report.privacy.visualPrivacyReviewPerformed, false);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.safety.harmfulOrDualUsePayloadRiskPresent, true);
  assert.equal(report.safety.rawDataSafeToExecute, false);
  assert.equal(report.rights.cardLicenseClaim, "Apache-2.0");
  assert.equal(report.rights.repositoryLicenseFilePresent, false);
  assert.equal(report.rights.cardLicenseClaimTreatedAsTrainingAuthorization, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.boundary.offlineTrainingRows, 0);
  assert.equal(report.boundary.productionTrainingRows, 0);
  assert.equal(report.boundary.networkAdmissionRows, 0);
  assert.equal(report.boundary.authorityRows, 0);
  assert.equal(report.boundary.ceuRows, 0);
  assert.equal(report.boundary.autonomousActionAuthorized, false);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyAtbenchReleaseLineageArtifactDirectory(artifact,
    { pythonExecutable: "/opt/anaconda3/bin/python" });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:9ebc2f67e9c5ab0848d4087a621bce240a3f5b9bce1307837eceef629c8de236");
  assert.equal(checked.receipt.receiptHash,
    "sha256:00e293d32cdbe0f29ef65792159bdd3b74ac8188cdbc586cb665ded33a271a9b");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-atbench-release-lineage.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
