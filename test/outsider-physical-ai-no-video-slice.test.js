import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  PHYSICAL_AI_DATASET_ID,
  PHYSICAL_AI_NO_VIDEO_DISPOSITION,
  PHYSICAL_AI_NO_VIDEO_SCOPE,
  PHYSICAL_AI_REVISION,
  verifyPhysicalAiNoVideoArtifactDirectory,
} from "../src/outsider-physical-ai-no-video-slice.js";

const artifact = path.resolve(
  "artifacts/outsider-physical-ai-no-video-slice-20260829-v1");
const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
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

test("complete fixed-revision no-video slice preserves the exact source boundary", () => {
  assert.equal(report.disposition, PHYSICAL_AI_NO_VIDEO_DISPOSITION);
  assert.equal(report.scope.kind, PHYSICAL_AI_NO_VIDEO_SCOPE);
  assert.equal(report.scope.datasetId, PHYSICAL_AI_DATASET_ID);
  assert.equal(report.scope.revision, PHYSICAL_AI_REVISION);
  assert.equal(report.scope.completeFixedRevisionNoVideoSliceAcquired, true);
  assert.equal(report.scope.fullFixedRevisionAllModalitiesClaimed, false);
  assert.equal(report.scope.noVideoSourceFiles, 33);
  assert.equal(report.scope.noVideoSourceBytes, 4_170_025);
  assert.equal(report.scope.excludedVideoFiles, 24);
  assert.equal(report.scope.excludedVideoBytes, 1_478_075_534);
  assert.equal(report.scope.videoPayloadBytesAcquired, 0);
  assert.deepEqual(report.scope.taskGroups,
    ["cup_nesting", "marker_binning", "paper_toss"]);
  assert.equal(report.source.fixedTreeEntries, 91);
  assert.equal(report.source.fixedTreeFiles, 57);
  assert.equal(report.source.fixedTreeDirectories, 34);
  assert.equal(report.source.fixedTreeFileBytes, 1_482_245_559);
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
  assert.equal(manifest.entries.length, 37);
  assert.equal(manifest.entries.filter((entry) => entry.repositoryPath).length, 33);
  assert.equal(manifest.entries.some((entry) => entry.path.endsWith(".mp4")), false);
});

test("all 25 parquet objects replay into exact episode and telemetry joins", () => {
  assert.equal(report.replay.taskCount, 3);
  assert.equal(report.replay.dataParquetFiles, 11);
  assert.equal(report.replay.episodeParquetFiles, 11);
  assert.equal(report.replay.taskParquetFiles, 3);
  assert.equal(report.replay.parquetFilesReplayed, 25);
  assert.equal(report.replay.totalEpisodes, 86);
  assert.equal(report.replay.totalFrames, 82_496);
  assert.equal(report.replay.telemetryActionWidth, 6);
  assert.equal(report.replay.telemetryStateWidth, 6);
  assert.equal(report.replay.fps, 30);
  assert.equal(report.replay.nullTelemetryValues, 0);
  assert.equal(report.replay.nonfiniteTelemetryValues, 0);
  assert.equal(report.replay.replayShapeRoot,
    "sha256:3dd63626273c89837c725798341423eb77ca2578f8a96f826557662bc0b9b6b2");
  assert.equal(report.replay.downloadedCodeOrContentExecuted, false);
  assert.equal(report.replay.videoPayloadsParsed, false);
  assert.equal(report.replay.videoPayloadBytesAcquired, 0);
});

test("publisher task groups retain exact physical-shard row profiles", () => {
  const cup = report.replay.tasks.cup_nesting;
  assert.equal(cup.parquetEpisodeRows, 30);
  assert.equal(cup.parquetFrameRows, 26_769);
  assert.deepEqual(cup.dataFileRows, [8_923, 8_918, 8_928]);
  assert.deepEqual(cup.episodeFileRows, [10, 10, 10]);
  assert.deepEqual(cup.episodeLengths, { min: 890, max: 894, sum: 26_769 });

  const marker = report.replay.tasks.marker_binning;
  assert.equal(marker.parquetEpisodeRows, 26);
  assert.equal(marker.parquetFrameRows, 29_517);
  assert.deepEqual(marker.dataFileRows, [2_424, 9_679, 5_533, 2_479, 9_402]);
  assert.deepEqual(marker.episodeFileRows, [2, 8, 5, 2, 9]);
  assert.deepEqual(marker.episodeLengths, { min: 864, max: 1_345, sum: 29_517 });

  const paper = report.replay.tasks.paper_toss;
  assert.equal(paper.parquetEpisodeRows, 30);
  assert.equal(paper.parquetFrameRows, 26_210);
  assert.deepEqual(paper.dataFileRows, [8_550, 8_925, 8_735]);
  assert.deepEqual(paper.episodeFileRows, [10, 10, 10]);
  assert.deepEqual(paper.episodeLengths, { min: 741, max: 894, sum: 26_210 });

  for (const task of Object.values(report.replay.tasks)) {
    assert.equal(task.parquetEpisodeRows, task.infoEpisodes);
    assert.equal(task.parquetFrameRows, task.infoFrames);
    assert.equal(task.episodeLengths.sum, task.parquetFrameRows);
    assert.equal(task.timestampFrameIndexOverFpsRows, task.parquetFrameRows);
    assert.deepEqual(task.dataSchemaSha256,
      ["sha256:f6d21b5ba80c8cad28d6cc93c6aaf318e6763038c305b55b76bb8d9d5636b527"]);
    assert.deepEqual(task.episodeSchemaSha256,
      ["sha256:8caebb69cd66a17ee96e6f605cde84b42428ff5f4af92c23c30ad7c7a788cb21"]);
    assert.deepEqual(task.taskSchemaSha256,
      ["sha256:88f87710f9231471b57512d0b1c474b63fc69a15985cd16150ec920ef3899803"]);
  }
});

test("README outcome and access narratives are preserved without promotion", () => {
  assert.equal(report.accessState.apiObservedPublic, true);
  assert.equal(report.accessState.apiObservedUngated, true);
  assert.equal(report.accessState.readmeClaimsAgreementAndContactInformationRequired,
    true);
  assert.equal(report.accessState.accessNarrativeMatchesObservedApiState, false);
  assert.equal(report.documentation.publisherClaimsFailureAndRecoveryEpisodesRetained,
    true);
  assert.equal(report.documentation.publisherClaimsOutcomeFieldPerEpisode, true);
  assert.deepEqual(report.documentation.claimedOutcomeVocabulary,
    ["success", "failure", "recovery"]);
  assert.equal(report.documentation.markerBinningByteNativeEpisodeRows, 26);
  assert.equal(report.documentation.everyTaskMeetsReadmeTargetEpisodeCount, false);
  assert.deepEqual(report.replay.outcomeLikeSchemaFieldNames, []);
  assert.deepEqual(report.replay.outcomeLikeJsonOrNestedRecordKeys, []);
  assert.equal(report.documentation.claimedOutcomeFieldFoundInAcquiredTaskBytes,
    false);
  assert.equal(report.documentation.readmeOutcomeClaimProjectedToEpisodeRows, false);
  assert.equal(report.documentation.readmeOutcomeClaimPromotedToByteFact, false);
  assert.equal(report.outcome.readmeOutcomeClaimRowsWithByteNativeSupport, 0);
  assert.equal(report.outcome.publisherNativeSuccessLabelRows, 0);
  assert.equal(report.outcome.publisherNativeFailureLabelRows, 0);
  assert.equal(report.outcome.publisherNativeRecoveryLabelRows, 0);
  assert.equal(report.outcome.independentlyWitnessedOutcomeRows, 0);
  assert.equal(report.outcome.completeOutcomeCensusEstablished, false);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
  assert.equal(report.execution.physicalExecutionIndependentlyVerified, false);
});

test("privacy, rights, training, network, and authority remain fail closed", () => {
  assert.equal(report.privacy.videoExcluded, true);
  assert.equal(report.privacy.rawVisualBytes, 0);
  assert.equal(report.privacy.humanTeleoperationClaimPresent, true);
  assert.equal(report.privacy.operatorConsentEvidenceBytesAcquired, 0);
  assert.equal(report.privacy.noPiiOrSensitiveDataGuaranteed, false);
  assert.equal(report.privacy.rawTelemetryPrivate, true);
  assert.equal(report.privacy.rawProjectionRows, 0);
  assert.equal(report.rights.apiCardLicenseValue, "other");
  assert.equal(report.rights.readmePublicSampleLicenseClaim, "CC-BY-NC-4.0");
  assert.equal(report.rights.readmeResearchAndEvaluationOnlyClaim, true);
  assert.equal(report.rights.repositoryLicenseFilePresent, false);
  assert.equal(report.rights.useSpecificRightsIndependentlyAdjudicated, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.rights.redistributionAuthorizedByThisArtifact, false);
  assert.equal(report.rights.commercialUseAuthorizedByThisArtifact, false);
  assert.equal(report.boundary.offlineTrainingRows, 0);
  assert.equal(report.boundary.productionTrainingRows, 0);
  assert.equal(report.boundary.networkAdmissionRows, 0);
  assert.equal(report.boundary.authorityRows, 0);
  assert.equal(report.boundary.ceuRows, 0);
  assert.equal(report.boundary.autonomousActionAuthorized, false);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyPhysicalAiNoVideoArtifactDirectory(artifact,
    { pythonExecutable: "/opt/anaconda3/bin/python" });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:1afacaa74fc20072275c7bd8117c908467a7eab7896d09679777e2206c1f12ae");
  assert.equal(checked.receipt.receiptHash,
    "sha256:eb94e6e35c62f1fa7f05164355398e7da1ebef912a947e4d95086590c77e2a95");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-physical-ai-no-video-slice.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
