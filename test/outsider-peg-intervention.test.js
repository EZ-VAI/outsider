import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  PEG_INTERVENTION_ID, PEG_INTERVENTION_PROFILE, PEG_INTERVENTION_REVISION,
  acquirePinnedPegInterventionSource, pegInterventionArtifactHash,
  verifyPegInterventionArtifact, verifyPegInterventionArtifactWithSource,
  verifyPegInterventionSourceDirectory,
} from "../src/outsider-peg-intervention.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-peg-intervention-20260830-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY, "peg-intervention.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const RECEIPT_PATH = path.join(ARTIFACT_DIRECTORY, "receipt.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:99b7a505aa26ca35407f9f1b22f9c391f041408be6fead2d7a500c0825a3bca5";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:a62f2ab977ed102139743c27cf20f9da08fda4ba0b7a7227507e90a30606e8da";
const EXPECTED_SOURCE_ROOT =
  "sha256:c619f78517b3d03fcf8f144b224b8f1647d50fb9f34d803ae22942f112e343e5";
const EXPECTED_MANIFEST_HASH =
  "sha256:2cf19df157054cab73dfc8cf042c6e5156ce8030637883d8af310634b0385c75";
const EXPECTED_RECEIPT_HASH =
  "sha256:49d7b3aa28164c007f9d41ed38ade537759b2d7ef6c89eb8d2d63d9774695a26";

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
  assert.equal(PEG_INTERVENTION_ID, "KeWangRobotics/peg_intervention");
  assert.equal(PEG_INTERVENTION_REVISION,
    "a521f26020d464a23c19a3fbb24ee10e9f10216c");
  assert.deepEqual(PEG_INTERVENTION_PROFILE, {
    usedStorage: 1_138_824_751,
    treeEntries: 24, treeDirectories: 10, treeFiles: 14,
    treeBytes: 1_138_855_978,
    selectedFiles: 9, selectedBytes: 291_674_372,
    noVideoFiles: 7, noVideoBytes: 6_572_363,
    handVideoFiles: 2, handVideoBytes: 285_102_009,
    baseVideoFiles: 5, baseVideoBytes: 847_181_606,
    episodes: 106, frames: 39_295, fps: 20,
  });
});

test("the source acquirer refuses clobber before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "peg-intervention-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedPegInterventionSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /PEG_INTERVENTION_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("the before-after bracket closes nine objects and all 14 file dispositions", () => {
  const checked = verifyPegInterventionSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "PINNED_ALL_EPISODE_NO_VIDEO_PLUS_COMPLETE_HAND_CAMERA_MODALITY");
  assert.equal(checked.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(checked.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(checked.manifest.sourceFiles.length, 24);
  assert.equal(checked.manifest.remoteObjects.length, 9);
  assert.equal(checked.manifest.remoteObjects.reduce((sum, row) =>
    sum + row.bytes, 0), 291_674_372);
  assert.equal(checked.before.tree.treeHash,
    "sha256:f5674b760b3fda9b5902e8630ddbe8d94bb13dd67725f2ca507699e6d6a82d1e");
  assert.equal(checked.before.repository.usedStorage, 1_138_824_751);
  assert.deepEqual(checked.manifest.closure, {
    allPublishedEpisodesInSelectedData: true,
    allRepositoryFilesHaveTerminalDisposition: true,
    baseVideoBytesInventoryOnly: 847_181_606,
    baseVideoFilesInventoryOnly: 5,
    completeFixedRepositoryAcquired: false,
    completeHandCameraModality: true,
    completeSemanticNoVideoClosure: true,
    handVideoBytes: 285_102_009, handVideoFiles: 2,
    noFurtherTreePage: true,
    noVideoBytes: 6_572_363, noVideoFiles: 7,
    randomTruncation: false,
    recursiveTreeBytes: 1_138_855_978,
    recursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreeDirectories: 10, recursiveTreeEntries: 24,
    recursiveTreeFiles: 14,
    repositoryUsedStorageAndTreeBytesAreDistinctMeasures: true,
    repositoryUsedStorageBytes: 1_138_824_751,
    selectedBytes: 291_674_372, selectedFiles: 9,
  });
  const dispositions = checked.manifest.terminalDispositions;
  assert.equal(dispositions.length, 14);
  assert.equal(dispositions.filter((row) =>
    row.disposition === "ACQUIRED_AND_REPLAYED").length, 9);
  assert.equal(dispositions.filter((row) =>
    row.disposition === "TREE_INVENTORY_ONLY_NOT_ACQUIRED")
    .reduce((sum, row) => sum + row.bytes, 0), 847_181_606);
  const objects = Object.fromEntries(checked.manifest.remoteObjects.map((row) =>
    [row.path, row]));
  assert.equal(objects["data/chunk-000/file-000.parquet"].sha256,
    "sha256:67929f6f5993e503b56e4e48430882365af1a85cc12e617d9b5d535004f83249");
  assert.equal(objects[
    "videos/observation.images.hand_camera/chunk-000/file-000.mp4"].sha256,
  "sha256:6c4697341440ad4a84142e57decc1feac8f244061622610d4a3b69389752a887");
  assert.equal(objects[
    "videos/observation.images.hand_camera/chunk-000/file-001.mp4"].sha256,
  "sha256:16e66bc26001dd1de8acadf67696bd67b907186b062b9307893756044621ff00");
  assert.equal(Object.values(objects).filter((row) =>
    row.acquisition === "VERIFIED_COMPLETE_OBJECT_CHECKPOINT_PLUS_PINNED_HEAD")
    .length, 2);
});

test("all action, state, qvel, index, and timestamp rows replay continuously", () => {
  const data = artifact().replay.data;
  assert.deepEqual({ rows: data.rows, fields: data.columns,
    names: data.schema.map((field) => field.name),
    rowGroups: data.rowGroups, nulls: data.nullValues }, {
    rows: 39_295, fields: 10,
    names: ["action", "observation.state", "observation.qvel", "intervention",
      "next.success", "timestamp", "frame_index", "episode_index", "index",
      "task_index"], rowGroups: 106, nulls: 0,
  });
  assert.equal(data.schemaHash,
    "sha256:d08104f5b5d481e73bbd129517088faf011889717ac1ca89beae8c4baa214bcf");
  assert.equal(data.logicalRowsHash,
    "sha256:ae6296c109eb154a6d887a300a129460c800b753f55c86482746869f1919f25b");
  assert.equal(data.globalIndicesContiguousZeroThrough39294, true);
  assert.equal(data.episodeIndicesContiguousZeroThrough105, true);
  assert.deepEqual([data.actionWidth, data.stateWidth, data.qvelWidth], [8, 9, 9]);
  assert.equal(data.nonfiniteVectorValues, 0);
  assert.equal(data.withinEpisodeTransitionRows, 39_189);
  assert.equal(data.globalTimestampDecreasesAtEpisodeReset, 105);
  assert.equal(data.withinEpisodeTimestampDecreases, 0);
  assert.ok(data.timestampEqualsFrameIndexOver20MaxAbsoluteError < 0.000002);
  assert.equal(data.continuity.action.maximumAbsoluteStep, 2);
  assert.equal(data.continuity["observation.state"].maximumAbsoluteStep,
    0.10904723405838013);
  assert.equal(data.continuity["observation.qvel"].maximumAbsoluteStep,
    1.7463005781173706);
  assert.equal(data.physicalContinuityThresholdApplied, false);
  assert.deepEqual(data.numericContentHashes, {
    actionFloat32LittleEndian:
      "sha256:839bf14a3f8e9d930b5decbf7c7f60e9e528061aa03ca793871a7ab645637636",
    episodeIndexInt64LittleEndian:
      "sha256:7000e9125973b99dc23c511da75f013de4303c89a24862959c86cd63ba9caa37",
    frameIndexInt64LittleEndian:
      "sha256:11a5d3e5735aa6f757bc7565e408d1ee84931139d97ac17698c97e64b3f8cefb",
    indexInt64LittleEndian:
      "sha256:4870eeb66120fbe8f58fb738e51b5210a0cd15412be762b3108b61f8746f6baf",
    interventionBool:
      "sha256:f0185f9394f156f75863381a18a49d17c610b43db8bca3e2a08c231bb748cf0a",
    qvelFloat32LittleEndian:
      "sha256:60954ececcec95c3f086b601f94c37f4037074286c769e38b279b576cc865ab4",
    stateFloat32LittleEndian:
      "sha256:e8a352d0f1fca4059128eca0a13eeaffe4c4de4a7cc24fc506d80b84c078a79f",
    successBool:
      "sha256:afc062ac0647591ec1d93fcce460a2fb24120bf3978c86af22555142fe909540",
    taskIndexInt64LittleEndian:
      "sha256:0c0b7aeb65fcd0902ce0d27ec8fe8a91253c071bab50f6d47bc8d2e74378086c",
    timestampFloat32LittleEndian:
      "sha256:4123dde46325913c6ff6777df13e6fdb197aa71c77080b77aaa6f0029cf468d3",
  });
});

test("106 episodes close frame, task, data, and both video-window joins", () => {
  const episodes = artifact().replay.episodes;
  assert.equal(episodes.rows, 106);
  assert.equal(episodes.columns, 137);
  assert.equal(episodes.rowGroups, 1);
  assert.equal(episodes.schemaHash,
    "sha256:df9f9cf6f8e87858080bb11448272e01dba3da32283447f095ecb1298517ac07");
  assert.equal(episodes.logicalRowsHash,
    "sha256:f65655bc897f25423ccd9bbd0edcdbf03edcc75f640b0c6ce31b92de64488039");
  assert.equal(episodes.episodeLengthsHash,
    "sha256:fd7d08c35f68642bdb642fa7c948e5ae964ffd0cf6cccf9b12e5f9f7e2c4c16d");
  assert.deepEqual([episodes.sumEpisodeLengths, episodes.minimumEpisodeLength,
    episodes.maximumEpisodeLength], [39_295, 35, 831]);
  assert.deepEqual(episodes.baseCameraEpisodeFileRanges,
    [[0, 25], [25, 55], [55, 62], [62, 83], [83, 106]]);
  assert.deepEqual(episodes.handCameraEpisodeFileRanges, [[0, 62], [62, 106]]);
  assert.equal(episodes.datasetRangesContiguousNoGapsOrOverlaps, true);
  assert.equal(episodes.episodeDataFrameTimestampTaskCrosswalkExact, true);
  assert.equal(episodes.videoWindowsContiguousWithinEachFile, true);
  assert.equal(episodes.videoWindowDurationEqualsEpisodeLengthOver20, true);
  assert.deepEqual(episodes.taskStrings, ["Insert the peg into the hole."]);
  assert.equal(episodes.episodeCrosswalk.length, 106);
  assert.deepEqual(episodes.episodeCrosswalk[61], {
    baseVideo: { fileIndex: 2, fromTimestamp: 74.60000000000001,
      toTimestamp: 76.35000000000001 },
    datasetFromIndex: 20_805, datasetToIndex: 20_840, episodeIndex: 61,
    handVideo: { fileIndex: 0, fromTimestamp: 1040.2499999999998,
      toTimestamp: 1041.9999999999998 },
    interventionSegments: 0, interventionTrueFrames: 0, length: 35,
    publisherSuccessBroadcastValue: false, taskIndex: 0,
    timestampMaxAbsoluteErrorFromFrameOver20: 4.768371586472142e-8,
  });
  assert.equal(episodes.episodeCrosswalk[105].datasetToIndex, 39_295);
  assert.equal(episodes.episodeCrosswalk[105].interventionTrueFrames, 464);
});

test("native intervention and publisher success preserve their real denominators", () => {
  const value = artifact();
  assert.deepEqual(value.replay.nativeSemantics, {
    doneFieldPresent: false,
    episode105FailureAllFramesIntervention: true,
    episode61FailureNoIntervention: true,
    episodesWithAllIntervention: 1,
    episodesWithAnyIntervention: 105,
    episodesWithInterventionAndPublisherFailure: 1,
    episodesWithInterventionAndPublisherSuccess: 104,
    episodesWithoutInterventionAndPublisherFailure: 1,
    failureFieldPresent: false,
    frameBroadcastValuesAreNot39295IndependentOutcomes: true,
    interventionAuthorizationVerified: false,
    interventionFalseFrames: 10_576,
    interventionField: "intervention", interventionFieldPresent: true,
    interventionHumanSourceVerified: false,
    interventionSegments: 134,
    interventionSegmentsPerEpisodeDistribution: { 0: 1, 1: 77, 2: 27, 3: 1 },
    interventionToPublisherSuccessIsPairedWithinEpisodeMorphologyOnly: true,
    interventionTrueFrames: 28_719,
    publisherFailureEpisodeCount: 2,
    publisherSuccessEpisodeCount: 104,
    publisherSuccessFalseFrames: 499,
    publisherSuccessTrueFrames: 38_796,
    recoveryFieldPresent: false, rewardFieldPresent: false,
    successField: "next.success", successFieldPresent: true,
    successIsEpisodeConstantFrameBroadcast: true,
  });
  assert.deepEqual(value.outcomeDenominatorBoundary, {
    frameBroadcastCountIsEpisodeOutcomeDenominator: false,
    frameBroadcastFalse: 499, frameBroadcastTrue: 38_796,
    publisherEpisodeFailure: 2, publisherEpisodeOutcomeDenominator: 106,
    publisherEpisodeSuccess: 104, typedPopulationsMayBeSummed: false,
  });
  assert.equal(value.semantics.sourceNativePublisherOutcomePresent, true);
  assert.equal(value.semantics.independentOutcomeEstablished, false);
  assert.equal(value.semantics.directCausalEffectEstablished, false);
  assert.equal(value.semantics.recoveryEstablished, false);
  assert.equal(value.semantics.attemptChronologyEstablished, false);
  assert.equal(value.semantics.completeAttemptCensusEstablished, false);
});

test("identifier restart drift is frozen while stable telemetry statistics match", () => {
  const value = artifact();
  assert.deepEqual(value.sourceDiscrepancyBoundary, {
    discrepancySilentlyCorrected: false,
    firstPartEpisodes: 62,
    secondPartEpisodeIndexOffsetMissingInEpisodeStats: 62,
    secondPartEpisodes: 44,
    secondPartGlobalIndexOffsetMissingInEpisodeStats: 20_840,
    stableTelemetryAndBooleanStatsMatchUnifiedData: true,
    statsIdentifierRestartPresent: true,
    statsJsonUsesRestartedIdentifierProjection: true,
  });
  assert.equal(value.replay.episodes.restartedIdentifierStatsAffectEpisodes, 44);
  assert.equal(value.replay.episodes.restartedEpisodeIndexOffset, 62);
  assert.equal(value.replay.episodes.restartedGlobalIndexOffset, 20_840);
  assert.equal(value.replay.episodes.restartedIdentifierEpisodeStatMaxAbsoluteError, 0);
  assert.ok(value.replay.episodes.stableEpisodeStatMaxAbsoluteError < 0.00001);
  assert.deepEqual({ statsIndex: value.replay.stats.statsIndexMaximum,
    dataIndex: value.replay.stats.unifiedDataIndexMaximum,
    statsEpisode: value.replay.stats.statsEpisodeIndexMaximum,
    dataEpisode: value.replay.stats.unifiedEpisodeIndexMaximum },
  { statsIndex: 20_839, dataIndex: 39_294, statsEpisode: 61, dataEpisode: 105 });
  assert.ok(value.replay.stats.globalStableFieldMaxAbsoluteError < 0.00001);
  assert.ok(value.replay.stats.globalRestartProjectionMaxAbsoluteError < 1e-9);
  assert.deepEqual(value.replay.sourceLineageDiscrepancy, {
    affectedEpisodeRows: 44,
    commitLineageClaimedFromUnselectedMetadata: false,
    episodeIndexOffset: 62, globalIndexOffset: 20_840,
    identifierRestartVerifiedAgainstParquetEpisodeStatsAndStatsJson: true,
    rawPublisherFilesystemPathProjected: false,
  });
});

test("the complete hand modality replays every AV1 sample and table", () => {
  const video = artifact().replay.video;
  assert.deepEqual({ files: video.files, bytes: video.bytes, tracks: video.tracks,
    samples: video.totalSamples, sampleBytes: video.totalSampleDataBytes },
  { files: 2, bytes: 285_102_009, tracks: 2,
    samples: 39_295, sampleBytes: 284_860_243 });
  assert.deepEqual(video.codecs, ["av01"]);
  assert.deepEqual(video.dimensions, ["480x480"]);
  assert.equal(video.sampleCountsEqualHandVideoMetadataWindows, true);
  assert.equal(video.trackDurationsEqualSamplesOver20, true);
  assert.equal(video.episodeWindowsCloseEachTrackDuration, true);
  const replay = video.containerAndFullSampleTablesReplay;
  assert.deepEqual(replay.map((row) => row.tracks[0].sampleCount),
    [20_840, 18_455]);
  assert.deepEqual(replay.map((row) => row.tracks[0].chunkCount), [145, 130]);
  assert.deepEqual(replay.map((row) => row.tracks[0].syncSampleCount),
    [10_436, 9_238]);
  assert.deepEqual(replay.map((row) => row.tracks[0].sampleSizesHash), [
    "sha256:39265347762ebcdb3992e19c79d35cf9b4f5d1a56ee21589096d622bc27af56b",
    "sha256:3c9cd89a9f37291e97c29be2c62ee02c8bd50f7bf504f18d312ab5a80693e527",
  ]);
  assert.equal(replay.every((row) => row.topLevelBoxBytes === row.bytes
    && row.topLevelBoxes.join(",") === "ftyp,moov,free,mdat"
    && row.tracks.length === 1 && row.tracks[0].handler === "vide"
    && row.tracks[0].codec === "av01"
    && row.tracks[0].sampleWidth === 480 && row.tracks[0].sampleHeight === 480
    && row.tracks[0].allChunkOffsetsInsideMdat
    && row.tracks[0].sampleDataBytes === row.mdatPayloadBytes), true);
  assert.equal(video.pixelsDecoded, false);
  assert.equal(video.pixelsProjected, false);
});

test("simulation, rights, privacy, training, and authority remain fail-closed", () => {
  const value = artifact();
  assert.equal(value.semantics.publisherDeclaredRobotType, "maniskill_sim");
  assert.equal(value.semantics.simulationTrajectoryPresent, true);
  assert.equal(value.semantics.realRobotTrajectoryPresent, false);
  assert.equal(value.semantics.interventionProvenanceAsHumanVerified, false);
  assert.equal(value.semantics.interventionEstablishesAuthorization, false);
  assert.deepEqual(value.rights, {
    datasetCardLicenseClaim: null,
    evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    legalConclusionEstablished: false,
    productionTrainingAuthorized: false,
    readmeLicenseClaim: "More Information Needed",
    rootLicenseFilePresent: false,
    upstreamLeRobotAndManiSkillRightsIndependentlyAdjudicated: false,
    visualContentRightsIndependentlyAdjudicated: false,
  });
  assert.deepEqual(value.privacy, {
    directoryMode: "0700", fileMode: "0600",
    handCameraVisualDataPresent: true, noPiiGuaranteed: false,
    privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false,
    rawActionStateQvelValuesProjected: false, rawArtifactPrivate: true,
    rawPublisherFilesystemPathsProjected: false,
    videoPixelsDecoded: false, videoPixelsProjected: false,
  });
  assert.deepEqual(value.boundary, {
    CEU: 0, action: 1, attemptCensus: 0, authority: 0, delegation: 0,
    directCausalEffect: 0, externalEffect: 0, humanAuthorization: 0,
    independentOutcome: 0, nativeIntervention: 1, network: 0,
    physicalObservation: 0, privacy: 0, publisherOutcome: 1,
    realRobotTrajectory: 0, recovery: 0, reliableOutcome: 0,
    simulationObservation: 1, training: 0,
  });
});

test("typed populations, source-bound receipt, and private modes reproduce", () => {
  const value = artifact();
  assert.deepEqual(value.typedDenominators, {
    ACTION_STATE_QVEL_FRAME: 39_295,
    HAND_CAMERA_VIDEO_FILE: 2,
    HAND_CAMERA_VIDEO_SAMPLE: 39_295,
    INTERVENTION_SEGMENT: 134,
    INTERVENTION_TRUE_FRAME: 28_719,
    SOURCE_NATIVE_EPISODE: 106,
    crossTotal: null,
  });
  const { artifactHash, ...body } = value;
  assert.equal(pegInterventionArtifactHash(body), artifactHash);
  assert.deepEqual(verifyPegInterventionArtifact(value), {
    ok: true, artifactHash: EXPECTED_ARTIFACT_HASH,
    verificationLevel:
      "STANDALONE_HASH_TYPED_SIM_INTERVENTION_AND_PUBLISHER_OUTCOME_BOUNDARY",
  });
  const sourceBound = verifyPegInterventionArtifactWithSource(value,
    SOURCE_DIRECTORY, { pythonExecutable: ".venv/bin/python" });
  assert.equal(sourceBound.ok, true, sourceBound.error);
  assert.equal(sourceBound.verificationLevel,
    "FULL_PARQUET_EPISODE_INTERVENTION_SUCCESS_STATS_AND_HAND_MP4_SAMPLE_REPLAY");
  const manifest = readJson(MANIFEST_PATH);
  const receipt = readJson(RECEIPT_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.deepEqual(manifest.report, {
    bytes: 71_560, path: "peg-intervention.json",
    sha256: "sha256:38b2f5d1381e539e4a85ae2aaba219ede410827fe30249bb2199269d4eaadd2a",
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
