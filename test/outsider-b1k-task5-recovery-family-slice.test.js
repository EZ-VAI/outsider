import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  B1K_RECOVERY_DATASET_ID,
  B1K_RECOVERY_DISPOSITION,
  B1K_RECOVERY_REVISION,
  B1K_RECOVERY_SCOPE,
  verifyB1kRecoveryArtifactDirectory,
} from "../src/outsider-b1k-task5-recovery-family-slice.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-b1k-task5-recovery-family-slice-20260829-v1");

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function assertPrivateTree(root) {
  const status = lstatSync(root);
  assert.equal(status.isSymbolicLink(), false, root);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600, root);
  if (status.isDirectory()) {
    for (const name of readdirSync(root)) assertPrivateTree(path.join(root, name));
  }
}

test("full task5 metadata plus four complete source-family episodes replay without outcome promotion", () => {
  const checked = verifyB1kRecoveryArtifactDirectory(ARTIFACT, {
    pythonExecutable: "/private/tmp/armbench-parquet-venv/bin/python",
  });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FULL_TASK5_INVENTORY_METADATA_AND_FOUR_EPISODE_SOURCE_REDERIVED");
  const { report, receipt } = checked;

  assert.equal(report.disposition, B1K_RECOVERY_DISPOSITION);
  assert.equal(report.scope.kind, B1K_RECOVERY_SCOPE);
  assert.equal(report.scope.datasetId, B1K_RECOVERY_DATASET_ID);
  assert.equal(report.scope.revision, B1K_RECOVERY_REVISION);
  assert.equal(report.scope.completeTask5MetadataFiles, 10);
  assert.equal(report.scope.completeTask5MetadataBytes, 32_125_116);
  assert.equal(report.scope.selectedCompleteEpisodes, 4);
  assert.equal(report.scope.selectedPayloadFiles, 16);
  assert.equal(report.scope.selectedPayloadBytes, 45_457_994);
  assert.equal(report.scope.selectedPayloadWithinCap, true);
  assert.equal(report.scope.completeTask5PayloadAcquired, false);
  assert.equal(report.scope.withinFamilySelectorUsesRewardTerminationOrOutcome, false);

  assert.equal(report.source.recordBeforeAfterByteIdentical, true);
  assert.equal(report.source.task5TreeBeforeAfterSemanticIdentical, true);
  assert.equal(report.source.fullRecordSiblingFiles, 29_432);
  assert.equal(report.source.task5SiblingFiles, 23_190);
  assert.equal(report.source.task31SiblingFiles, 6_240);
  assert.equal(report.source.task5InventoryPagesPerBracket, 24);
  assert.equal(report.source.task5Entries, 23_227);
  assert.equal(report.source.task5Files, 23_190);
  assert.equal(report.source.task5Directories, 37);
  assert.equal(report.source.task5Bytes, 7_770_678_832);
  assert.deepEqual(report.source.task5Categories.data,
    { files: 5_795, bytes: 1_456_211_193 });
  assert.deepEqual(report.source.task5Categories.videos,
    { files: 17_385, bytes: 6_282_342_523 });
  assert.deepEqual(report.source.task5Categories.metadata,
    { files: 10, bytes: 32_125_116 });
  assert.equal(report.source.task5InventoryRoot,
    "sha256:d1c044a937a95f95c0c27107f6d3dfb462dd8b11bb25f951f83fcd533f44b1aa");
  assert.equal(report.source.sourceManifestHash,
    "sha256:3ab3679dfebf4a21d74eb1f37bdeb0462e169bb5639876325e3581d66cf9e4c0");
  assert.equal(report.source.sourceRoot,
    "sha256:d9efa3cc2586309c727c5fed13f8165959a6adf64c754cc1ab774bb6f1f8d6e7");
  assert.equal(report.source.allSelectedObjectHeadersOidLfsXetAndLocalBytesBound,
    true);

  const metadata = report.task5MetadataReplay;
  assert.equal(metadata.episodes, 5_795);
  assert.equal(metadata.frames, 3_537_240);
  assert.deepEqual(metadata.metadataShardRows, [1000, 1000, 1000, 1000, 1000, 795]);
  assert.deepEqual(metadata.familyEpisodeCounts,
    { human2026: 200, nav: 1170, place: 4388, success: 37 });
  assert.deepEqual(metadata.familyFrameCounts,
    { human2026: 2_039_222, nav: 562_590, place: 607_744, success: 327_684 });
  assert.deepEqual(metadata.positiveRewardEpisodeCounts,
    { human2026: 200, nav: 0, place: 0, success: 0 });
  assert.deepEqual(metadata.negativeRewardEpisodeCounts,
    { human2026: 156, nav: 0, place: 0, success: 0 });
  assert.deepEqual(metadata.terminatedEpisodeCounts,
    { human2026: 199, nav: 1170, place: 4388, success: 37 });
  assert.deepEqual(metadata.truncatedEpisodeCounts,
    { human2026: 0, nav: 0, place: 0, success: 0 });
  assert.equal(metadata.conversionManifest.rows, 5_795);
  assert.equal(metadata.conversionManifest.uniqueSourcePaths, 5_795);
  assert.equal(metadata.conversionManifest.rawAbsoluteSourcePathsProjected, false);
  assert.equal(metadata.info.totalVideosFieldPresent, false);
  assert.equal(metadata.info.publishedVideoFiles, 17_385);
  assert.deepEqual(metadata.info.videoKeys, [
    "observation.rgb.left_realsense_link_camera_0",
    "observation.rgb.right_realsense_link_camera_0",
    "observation.rgb.zed_link_camera_0",
  ]);

  assert.deepEqual(report.selection.episodes.map((item) =>
    [item.family, item.episodeIndex, item.frames, item.files.length]), [
    ["human2026", 0, 12_850, 4], ["nav", 200, 701, 4],
    ["success", 1370, 8_676, 4], ["place", 1407, 180, 4],
  ]);
  for (const episode of report.selection.episodes) {
    assert.equal(episode.completeDataAndThreeVideoFiles, true);
    for (const file of episode.files) {
      assert.equal(file.headerBinding.xRepoCommit, B1K_RECOVERY_REVISION);
      assert.equal(file.headerBinding.xLinkedEtag, `"${file.lfsOid}"`);
      assert.equal(file.localSha256, `sha256:${file.lfsOid}`);
      assert.match(file.xetHash, /^[a-f0-9]{64}$/u);
    }
  }
  assert.equal(report.selection.parquetReplay.length, 4);
  assert.deepEqual(report.selection.parquetReplay.map((item) => item.rows),
    [12_850, 701, 8_676, 180]);
  assert.deepEqual(report.selection.parquetReplay.map((item) => item.rewardMaximum),
    [0.1666666716337204, 0, 0, 0]);
  assert.equal(report.selection.videoContainerReplay.length, 4);
  for (const episode of report.selection.videoContainerReplay) {
    assert.equal(episode.videos.length, 3);
    for (const video of episode.videos) {
      assert.equal(video.container.samples, episode.frames);
      assert.equal(video.container.codec, "avc1");
      assert.equal(video.container.width, 224);
      assert.equal(video.container.height, 224);
      assert.equal(video.container.durationSeconds, episode.frames / 30);
      assert.equal(video.compressedPixelsDecoded, false);
    }
  }

  assert.equal(report.publisherSemantics.folderOrSourceFamilyNameIsOutcome, false);
  assert.equal(report.publisherSemantics.terminationIsSuccess, false);
  assert.equal(report.publisherSemantics.generatedRecoveryFamilyIsIndependentRecoveryEffect,
    false);
  assert.equal(report.task31TerminalDisposition.selectedIntoTask5Slice, false);
  assert.equal(report.task31TerminalDisposition.segmented.episodes, 1_565);
  assert.equal(report.task31TerminalDisposition.segmented.frames, 3_549_833);
  assert.deepEqual(report.task31TerminalDisposition.segmented.sourceFamilyEpisodes,
    { human_demo_2026: 200, segmented_learn: 1365 });
  assert.equal(report.task31TerminalDisposition.successRollout.episodes, 370);
  assert.equal(report.task31TerminalDisposition.successRollout.frames, 3_479_309);
  assert.deepEqual(report.task31TerminalDisposition.successRollout.sourceFamilyEpisodes,
    { human_demo_2026: 200, success_rollout: 170 });
  assert.equal(report.task31TerminalDisposition.sharedHumanRows, 200);
  assert.equal(report.task31TerminalDisposition.groupDenominatorsAdditive, false);

  assert.equal(report.documentationDrift.readmeTreeShowsOnlyTask5, true);
  assert.equal(report.documentationDrift.fixedRootAlsoContainsTask31, true);
  assert.equal(report.documentationDrift.readmeFileCount23192EqualsTask5FilesPlusTwoRootFiles,
    true);
  assert.equal(report.rightsPrivacyAndUse.rights.datasetCardLicenseClaim, null);
  assert.equal(report.rightsPrivacyAndUse.rights.repositoryLicenseFilePresent, false);
  assert.equal(report.rightsPrivacyAndUse.rights.rightsStatus, "FAIL_CLOSED");
  assert.equal(report.rightsPrivacyAndUse.rights.authorizedTrainingRows, 0);
  assert.equal(report.rightsPrivacyAndUse.privacy.noPiiGuaranteed, false);
  for (const field of ["independentlyVerifiedPhysicalEpisodes", "independentOutcomeRows",
    "realWorldOutcomeRows", "physicalEffectRows", "recoveryRows", "retryRows",
    "pairedFailureCorrectionRows", "longitudinalRows", "delegationRows",
    "authorizedTrainingRows", "networkAdmissionRows", "actorCreditRows", "ceuRows",
    "authorityDelta"]) assert.equal(report.zeroClaimBoundary[field], 0, field);
  assert.equal(report.executionBoundary.sourceBytesExecuted, false);
  assert.equal(report.executionBoundary.compressedVideoDecoded, false);
  assert.equal(report.artifactHash,
    "sha256:973996470f81e78767e6de9bf69867982e6b92f30ed008abe06c0267f2bfc0a8");
  assert.equal(receipt.receiptHash,
    "sha256:315cf4c10a04bfd773ab448b0b1cbb23ea138a794a1fc0e13227ec517562342a");
});

test("raw visual and absolute-path source bytes stay private and publication is no-clobber", () => {
  assertPrivateTree(ARTIFACT);
  const reportFile = path.join(ARTIFACT, "report.json");
  const receiptFile = path.join(ARTIFACT, "run-receipt.json");
  const humanData = path.join(ARTIFACT,
    "source/files/task5/Demo+Recovery+Success/data/chunk-000/file-000.parquet");
  const humanVideo = path.join(ARTIFACT,
    "source/files/task5/Demo+Recovery+Success/videos/observation.rgb.zed_link_camera_0/chunk-000/file-000.mp4");
  const reportText = readFileSync(reportFile, "utf8");
  assert.doesNotMatch(reportText, /shared_work|\/ranqi\/|episode_00005794/u);
  assert.equal(sha256(humanData),
    "84dd2a667be484375b5d0888d9cf9ed97287f210f190c57ac256a9115f52d12f");
  assert.equal(sha256(humanVideo),
    "f53d5a52810fd213de540afdcc05f7caf21060539691a3c31940a5f24ca3d74a");
  const before = [reportFile, receiptFile, humanData, humanVideo].map(sha256);
  const dataBefore = lstatSync(humanData, { bigint: true });
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-b1k-task5-recovery-family-slice.mjs",
      "--source-candidate",
      "/private/tmp/outsider-b1k-task5-recovery-family-source-20260829-v1",
      "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  const dataAfter = lstatSync(humanData, { bigint: true });
  assert.deepEqual([reportFile, receiptFile, humanData, humanVideo].map(sha256), before);
  assert.equal(dataAfter.size, dataBefore.size);
  assert.equal(dataAfter.mtimeNs, dataBefore.mtimeNs);
});
