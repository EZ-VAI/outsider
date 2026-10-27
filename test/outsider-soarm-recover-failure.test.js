import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  SOARM_RECOVER_ID, SOARM_RECOVER_PROFILE, SOARM_RECOVER_REVISION,
  acquirePinnedSoarmRecoverSource, soarmRecoverArtifactHash,
  verifySoarmRecoverArtifact, verifySoarmRecoverArtifactWithSource,
  verifySoarmRecoverSourceDirectory,
} from "../src/outsider-soarm-recover-failure.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-soarm-recover-failure-20260830-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY, "soarm-recover-failure.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const RECEIPT_PATH = path.join(ARTIFACT_DIRECTORY, "receipt.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:17908d7cdd7005099e5737f8afbd24020d52b37c67ac72615881ead293f32e23";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:0dc104d0bbb00eccbb0ed73319d6d2857d518844876e34b2ed5e9870e7e3814c";
const EXPECTED_SOURCE_ROOT =
  "sha256:a232312944468ddaae53b388f3d42fe9ee62b4a52626f0c7ccd9a9986434d52c";
const EXPECTED_MANIFEST_HASH =
  "sha256:2174009bae1d3a81f076fc671eb8eeb2001ace9c538689078e0fd21a5a59e324";
const EXPECTED_RECEIPT_HASH =
  "sha256:dbd7ad5b8803d6fffa6d44b5bd4694f454e34253b1117b7d734098c1960a9c80";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function artifact() {
  assert.equal(existsSync(REPORT_PATH), true);
  return readJson(REPORT_PATH);
}

function walk(root) {
  const files = [];
  const directories = [root];
  for (let index = 0; index < directories.length; index += 1) {
    for (const entry of readdirSync(directories[index], { withFileTypes: true })) {
      const child = path.join(directories[index], entry.name);
      assert.equal(entry.isSymbolicLink(), false, child);
      if (entry.isDirectory()) directories.push(child);
      else if (entry.isFile()) files.push(child);
      else assert.fail(`special file refused: ${child}`);
    }
  }
  return { files, directories };
}

test("the fixed revision and modality-bounded arithmetic remain exact", () => {
  assert.equal(SOARM_RECOVER_ID, "MikeChenYZ/soarm-recover-failure");
  assert.equal(SOARM_RECOVER_REVISION,
    "15322666a3d0b29a0705c201b67f927a9df520ff");
  assert.deepEqual(SOARM_RECOVER_PROFILE, {
    usedStorage: 551_588_945,
    treeEntries: 34, treeDirectories: 10, treeFiles: 24,
    treeBytes: 551_629_823,
    selectedFiles: 17, selectedBytes: 88_249_046,
    semanticNoVideoFiles: 13, semanticNoVideoBytes: 1_377_650,
    wristVideoFiles: 4, wristVideoBytes: 86_871_396,
    topVideoFiles: 4, topVideoBytes: 463_362_333,
    finderFiles: 3, finderBytes: 18_444,
    publishedEpisodes: 44,
  });
});

test("the source acquirer refuses clobber before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "soarm-recover-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedSoarmRecoverSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /SOARM_RECOVER_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("the before-after bracket binds all selected bytes and 24 dispositions", () => {
  const checked = verifySoarmRecoverSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "PINNED_ALL_EPISODE_NO_VIDEO_PLUS_COMPLETE_WRIST_MODALITY");
  assert.equal(checked.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(checked.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(checked.manifest.sourceFiles.length, 42);
  assert.equal(checked.manifest.remoteObjects.length, 17);
  assert.equal(checked.manifest.remoteObjects.reduce((sum, row) =>
    sum + row.bytes, 0), 88_249_046);
  assert.equal(checked.manifest.remoteObjects.reduce((sum, row) =>
    sum + row.rangeChunks, 0), 23);
  assert.equal(checked.before.tree.treeHash,
    "sha256:6fbaed48153aacfb1f8e53afba50964d9cda42d0201e84bc33767972a6e53647");
  assert.equal(checked.before.repository.usedStorage, 551_588_945);
  const dispositions = checked.manifest.terminalDispositions;
  assert.equal(dispositions.length, 24);
  assert.equal(dispositions.filter((row) =>
    row.disposition === "ACQUIRED_AND_REPLAYED").length, 17);
  assert.equal(dispositions.filter((row) =>
    row.reason === "OVERSIZED_TOP_CAMERA_MODALITY_EXCLUDED_COMPLETE_WRIST_SELECTED")
    .reduce((sum, row) => sum + row.bytes, 0), 463_362_333);
  assert.equal(dispositions.filter((row) =>
    row.reason === "NON_SEMANTIC_FINDER_METADATA")
    .reduce((sum, row) => sum + row.bytes, 0), 18_444);
  assert.deepEqual(checked.manifest.closure, {
    allPublishedEpisodesInSelectedData: true,
    allRepositoryFilesHaveTerminalDisposition: true,
    completeFixedRepositoryAcquired: false,
    completeSemanticNoVideoClosure: true,
    completeWristVideoModality: true,
    finderBytesInventoryOnly: 18_444, finderFilesInventoryOnly: 3,
    randomTruncation: false,
    recursiveTreeBytes: 551_629_823,
    recursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreeDirectories: 10, recursiveTreeEntries: 34,
    recursiveTreeFiles: 24,
    repositoryUsedStorageAndTreeBytesAreDistinctMeasures: true,
    repositoryUsedStorageBytes: 551_588_945,
    selectedBytes: 88_249_046, selectedFiles: 17,
    semanticNoVideoBytes: 1_377_650, semanticNoVideoFiles: 13,
    topVideoBytesInventoryOnly: 463_362_333,
    topVideoFilesInventoryOnly: 4,
    wristVideoBytes: 86_871_396, wristVideoFiles: 4,
  });
  const objects = Object.fromEntries(checked.manifest.remoteObjects.map((row) =>
    [row.path, row]));
  assert.equal(objects["data/chunk-000/file-000.parquet"].sha256,
    "sha256:5076decbe58c73e056c078965190d6319ccd4debeedf73afd0f0957d262734a6");
  assert.equal(objects["videos/observation.images.wrist/chunk-000/file-000.mp4"].sha256,
    "sha256:d2c84723f684db2c6330dc28fbeda8e8b85dfd5595dc5f12363ec8a6eb72e4fa");
});

test("all action-state Parquet rows replay without schema drift or overlap", () => {
  const data = artifact().replay.data;
  assert.equal(data.rows, 25_187);
  assert.equal(data.fields, 7);
  assert.deepEqual(data.columns, ["action", "observation.state", "timestamp",
    "frame_index", "episode_index", "index", "task_index"]);
  assert.deepEqual(data.shardRows, [4_993, 3_991, 6_611, 9_592]);
  assert.deepEqual(data.shardRowGroups, [10, 10, 10, 14]);
  assert.deepEqual(data.shardEpisodeRanges,
    [[0, 9], [10, 19], [20, 29], [30, 43]]);
  assert.deepEqual(data.shardGlobalIndexRanges,
    [[0, 4_992], [4_993, 8_983], [8_984, 15_594], [15_595, 25_186]]);
  assert.equal(data.schemaIdenticalAcrossShards, true);
  assert.equal(data.schemaHash,
    "sha256:fbb57c963b9f16c3577cf7b27d47d94ac858da17db923ba122a4c62c7a56a6c1");
  assert.equal(data.logicalRowsHash,
    "sha256:0d00c09f0a4f6ae26c56fb66e289129752e1a44e5785472795da1d934f84364e");
  assert.equal(data.globalIndicesContiguousZeroThrough25186, true);
  assert.equal(data.duplicateGlobalIndices, 0);
  assert.equal(data.crossShardIndexOverlap, 0);
  assert.equal(data.actionWidth, 6);
  assert.equal(data.stateWidth, 6);
  assert.equal(data.nullValues, 0);
  assert.equal(data.nonfiniteActionValues, 0);
  assert.equal(data.nonfiniteStateValues, 0);
  assert.equal(data.nonfiniteTimestamps, 0);
  assert.equal(data.globalTimestampDecreasesAtEpisodeReset, 43);
  assert.equal(data.withinEpisodeTimestampDecreases, 0);
  assert.ok(data.timestampEqualsFrameIndexOver30MaxAbsoluteError < 0.000001);
});

test("44 episode records close data, task, shard, and timestamp joins", () => {
  const episodes = artifact().replay.episodes;
  assert.equal(episodes.rows, 44);
  assert.equal(episodes.fields, 107);
  assert.deepEqual(episodes.shardRows, [10, 10, 10, 14]);
  assert.deepEqual(episodes.files.map((row) => row.rowGroups), [1, 1, 1, 2]);
  assert.equal(episodes.schemaIdenticalAcrossShards, true);
  assert.equal(episodes.schemaHash,
    "sha256:7406b3a86de88c6348b74f4f96c5b180d287b4fa3f4491937e4b2c254e4937c7");
  assert.equal(episodes.logicalRowsHash,
    "sha256:ded37fbc90cc049f7aa1a00d75cad3495578a93bd210ad1d4e13cfb4c261fd94");
  assert.equal(episodes.sumEpisodeLengths, 25_187);
  assert.equal(episodes.minimumEpisodeLength, 172);
  assert.equal(episodes.maximumEpisodeLength, 805);
  assert.equal(episodes.episodeLengthsHash,
    "sha256:e4b717992f0b1f6d15601d3347486fd94779cdb550cb9a38d1e86c0e7f15cfba");
  assert.equal(episodes.datasetRangesContiguousNoGapsOrOverlaps, true);
  assert.equal(episodes.episodeDataFrameAndTaskCrosswalkExact, true);
  assert.equal(episodes.dataAndVideoFileIndexCrosswalkExact, true);
  assert.equal(episodes.topAndWristTimestampWindowsIdentical, true);
  assert.equal(episodes.videoWindowsContiguousWithinEachFile, true);
  assert.equal(episodes.videoWindowDurationEqualsEpisodeLengthOver30, true);
  assert.deepEqual(episodes.taskStrings, ["recover-from-failure"]);
  assert.equal(episodes.episodeCrosswalk.length, 44);
  assert.deepEqual(episodes.episodeCrosswalk[0], {
    dataFileIndex: 0, datasetFromIndex: 0, datasetToIndex: 540,
    episodeIndex: 0, length: 540, taskIndex: 0,
    timestampMaxAbsoluteErrorFromFrameOver30: 8.900960288826809e-7,
    wristFileIndex: 0, wristFromTimestamp: 0, wristToTimestamp: 18,
  });
  assert.equal(episodes.episodeCrosswalk[43].datasetToIndex, 25_187);
  assert.equal(episodes.episodeCrosswalk[43].wristToTimestamp,
    319.73333333333335);
  assert.ok(episodes.episodeNumericStatMaxAbsoluteError < 0.0004);
});

test("info, tasks, statistics, and documents replay their exact claims", () => {
  const replay = artifact().replay;
  assert.deepEqual(replay.tasks.records,
    [{ __index_level_0__: "recover-from-failure", task_index: 0 }]);
  assert.equal(replay.tasks.logicalRowsHash,
    "sha256:d71bf60e3dc990be5a3b0060289e9649732087da0befe469fc16a147901445b5");
  assert.deepEqual({ robot: replay.info.publisherDeclaredRobotType,
    episodes: replay.info.episodes, frames: replay.info.frames,
    tasks: replay.info.tasks, fps: replay.info.fps },
  { robot: "so101_follower", episodes: 44, frames: 25_187, tasks: 1, fps: 30 });
  assert.deepEqual(replay.info.actionShape, [6]);
  assert.deepEqual(replay.info.stateShape, [6]);
  assert.deepEqual(replay.info.wristShape, [480, 640, 3]);
  assert.equal(replay.info.publisherDeclaredWristCodec, "av1");
  assert.equal(replay.stats.jsonFinite, true);
  assert.equal(replay.stats.topImageSampleStatCount, 5_376);
  assert.equal(replay.stats.wristImageSampleStatCount, 5_376);
  assert.ok(replay.stats.globalNumericStatMaxAbsoluteError < 0.00006);
  assert.deepEqual(replay.documents.readme.claims, {
    apacheBodyClaim: true, apacheYamlClaim: true,
    infoBlockContains44Episodes: true,
    infoBlockContainsSo101Follower: true, lerobotCreationClaim: true,
  });
  assert.equal(replay.documents.gitAttributes.lfsPatternLines, 55);
});

test("the complete wrist modality replays every AV1 sample and container table", () => {
  const video = artifact().replay.video;
  assert.deepEqual({ files: video.files, bytes: video.bytes, tracks: video.tracks,
    samples: video.totalSamples, sampleBytes: video.totalSampleDataBytes },
  { files: 4, bytes: 86_871_396, tracks: 4,
    samples: 25_187, sampleBytes: 86_715_728 });
  assert.deepEqual(video.codecs, ["av01"]);
  assert.deepEqual(video.dimensions, ["640x480"]);
  assert.equal(video.sampleCountsEqualDataShardRows, true);
  assert.equal(video.trackDurationsEqualDataRowsOver30, true);
  assert.equal(video.episodeWindowsCloseEachTrackDuration, true);
  assert.deepEqual(video.containerReplay.map((row) => row.tracks[0].sampleCount),
    [4_993, 3_991, 6_611, 9_592]);
  assert.deepEqual(video.containerReplay.map((row) => row.tracks[0].chunkCount),
    [18, 14, 22, 31]);
  assert.deepEqual(video.containerReplay.map((row) => row.tracks[0].syncSampleCount),
    [2_498, 1_998, 3_308, 4_799]);
  assert.equal(video.containerReplay.every((row) =>
    row.topLevelBoxBytes === row.bytes
      && row.topLevelBoxes.join(",") === "ftyp,moov,free,mdat"
      && row.tracks.length === 1 && row.tracks[0].handler === "vide"
      && row.tracks[0].codec === "av01"
      && row.tracks[0].sampleWidth === 640
      && row.tracks[0].sampleHeight === 480
      && row.tracks[0].timingSampleCount === row.tracks[0].sampleCount), true);
  assert.equal(video.pixelsDecoded, false);
  assert.equal(video.pixelsProjected, false);
  assert.equal(video.visualInspectionPerformed, false);
});

test("publisher recovery naming is not promoted into outcomes or chronology", () => {
  const value = artifact();
  assert.deepEqual(value.replay.nativeSemantics.matchingFields, {
    done: [], failure: [], intervention: [], recover: [], reward: [], success: [],
  });
  assert.equal(value.replay.nativeSemantics.repositoryAndTaskRecoveryWordsArePublisherNamingClaimsOnly,
    true);
  assert.deepEqual(value.publisherNamingBoundary, {
    failureOutcomeEstablishedByNaming: false,
    recoveryEstablishedByNaming: false,
    repositoryName: "soarm-recover-failure",
    repositoryNameIsOutcomeLabel: false,
    taskStringIsOutcomeLabel: false,
    taskStrings: ["recover-from-failure"],
  });
  assert.equal(value.semantics.sourceNativeOutcomeLabelPresent, false);
  assert.equal(value.semantics.sourceNativeFailureLabelPresent, false);
  assert.equal(value.semantics.sourceNativeRecoveryLabelPresent, false);
  assert.equal(value.semantics.rewardPresent, false);
  assert.equal(value.semantics.donePresent, false);
  assert.equal(value.semantics.interventionPresent, false);
  assert.equal(value.semantics.reliableOutcomeEstablished, false);
  assert.equal(value.semantics.directCausalEffectEstablished, false);
  assert.equal(value.semantics.recoveryEstablished, false);
  assert.equal(value.semantics.attemptChronologyEstablished, false);
});

test("hardware provenance, rights, privacy, and training remain bounded", () => {
  const value = artifact();
  assert.equal(value.semantics.publisherDeclaredRobotType, "so101_follower");
  assert.equal(value.semantics.publisherHardwareTrajectoryClaimPresent, true);
  assert.equal(value.semantics.sourceNativeActionStateTrajectoryPresent, true);
  assert.equal(value.semantics.completeWristVisualModalityPresent, true);
  assert.equal(value.semantics.independentHardwareIdentityWitnessPresent, false);
  assert.equal(value.semantics.independentPhysicalProvenanceVerified, false);
  assert.deepEqual(value.rights, {
    datasetCardLicenseClaim: "Apache-2.0",
    evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    legalConclusionEstablished: false,
    productionTrainingAuthorized: false,
    readmeLicenseClaim: "Apache-2.0",
    rootLicenseFilePresent: false,
    upstreamLeRobotRightsIndependentlyAdjudicated: false,
    visualContentRightsIndependentlyAdjudicated: false,
  });
  assert.deepEqual(value.privacy, {
    directoryMode: "0700", fileMode: "0600", noPiiGuaranteed: false,
    privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false,
    rawActionStateValuesProjected: false, rawArtifactPrivate: true,
    videoPixelsDecoded: false, videoPixelsProjected: false,
    wristVisualDataPresent: true,
  });
  assert.deepEqual(value.boundary, {
    CEU: 0, action: 1, authority: 0, delegation: 0,
    directCausalEffect: 0, externalEffect: 1, independentHardwareWitness: 0,
    independentOutcome: 0, network: 0, physicalObservation: 1,
    privacy: 0, publisherHardwareTrajectory: 1, publisherOutcome: 0,
    recovery: 0, reliableOutcome: 0, training: 0,
  });
});

test("typed populations, source-bound receipt, and private modes reproduce", () => {
  const value = artifact();
  assert.deepEqual(value.typedDenominators, {
    ACTION_STATE_FRAME: 25_187, SOURCE_NATIVE_EPISODE: 44,
    WRIST_VIDEO_FILE: 4, WRIST_VIDEO_SAMPLE: 25_187, crossTotal: null,
  });
  const { artifactHash, ...body } = value;
  assert.equal(soarmRecoverArtifactHash(body), artifactHash);
  assert.deepEqual(verifySoarmRecoverArtifact(value), {
    ok: true, artifactHash: EXPECTED_ARTIFACT_HASH,
    verificationLevel:
      "STANDALONE_HASH_TYPED_PHYSICAL_TRAJECTORY_AND_NO_OUTCOME_BOUNDARY",
  });
  const sourceBound = verifySoarmRecoverArtifactWithSource(value, SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(sourceBound.ok, true, sourceBound.error);
  assert.equal(sourceBound.verificationLevel,
    "FULL_PARQUET_EPISODE_STATS_TASK_AND_WRIST_MP4_SAMPLE_REPLAY");
  const manifest = readJson(MANIFEST_PATH);
  const receipt = readJson(RECEIPT_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.deepEqual(manifest.report, {
    bytes: 76_380, path: "soarm-recover-failure.json",
    sha256: "sha256:ab2d2afae086eb43bfd5132ff6fe227fcba5180e991c4eac7653ef2b7a6a66de",
  });
  assert.equal(receipt.receiptHash, EXPECTED_RECEIPT_HASH);
  assert.equal(receipt.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(receipt.artifactManifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(receipt.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(receipt.sourceRoot, EXPECTED_SOURCE_ROOT);
  const tree = walk(ARTIFACT_DIRECTORY);
  assert.equal(tree.directories.every((directory) =>
    (statSync(directory).mode & 0o777) === 0o700), true);
  assert.equal(tree.files.every((file) =>
    (statSync(file).mode & 0o777) === 0o600), true);
});
