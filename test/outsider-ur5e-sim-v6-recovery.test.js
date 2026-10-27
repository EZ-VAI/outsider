import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  UR5E_SIM_V6_ID, UR5E_SIM_V6_PROFILE, UR5E_SIM_V6_REVISION,
  acquirePinnedUr5eSimV6Source, ur5eSimV6ArtifactHash,
  verifyUr5eSimV6Artifact, verifyUr5eSimV6ArtifactWithSource,
  verifyUr5eSimV6SourceDirectory,
} from "../src/outsider-ur5e-sim-v6-recovery.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-ur5e-sim-v6-recovery-20260830-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY, "ur5e-sim-v6-recovery.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const RECEIPT_PATH = path.join(ARTIFACT_DIRECTORY, "receipt.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:711a17856f2fe3f3a72bf472c6e8d40ba473b8d1941e980fef5fcda120b1aa5c";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:e9f14c212b1feb30d0629c7796cc0f138447d62f8b16e1e2412647a1d1402292";
const EXPECTED_SOURCE_ROOT =
  "sha256:df0e8a680fc8ffef386120a1328d985e81326051fe88b2e65b22e978c4215c61";
const EXPECTED_MANIFEST_HASH =
  "sha256:aaa3616db62e7f5438c20849c6f68b4a51f68ed029acdd396c4507df38cdfd11";
const EXPECTED_RECEIPT_HASH =
  "sha256:058a9d1df1087d24e3296d7f8c61d7f31631c837778b1befa40cd237325c94c4";

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

test("the fixed revision and complete no-video arithmetic remain exact", () => {
  assert.equal(UR5E_SIM_V6_ID, "xhaka3456/aic_ur5e_sim_v6_recovery");
  assert.equal(UR5E_SIM_V6_REVISION,
    "2f7c0e58fa228995ac591d91e04214ca8167938c");
  assert.deepEqual(UR5E_SIM_V6_PROFILE, {
    usedStorage: 7_776_291_078,
    treePages: 1, treeEntries: 58, treeDirectories: 12, treeFiles: 46,
    treeBytes: 7_776_325_133,
    selectedFiles: 7, selectedBytes: 84_162_060,
    videoFiles: 39, videoBytes: 7_692_163_073,
    centerVideoFiles: 11, leftVideoFiles: 14, rightVideoFiles: 14,
    episodes: 1_410, frames: 384_618, fps: 20,
  });
});

test("the source acquirer refuses clobber before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "ur5e-sim-v6-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedUr5eSimV6Source(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /UR5E_SIM_V6_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("the before-after bracket closes seven objects and all 46 dispositions", () => {
  const checked = verifyUr5eSimV6SourceDirectory(SOURCE_DIRECTORY);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "PINNED_COMPLETE_NO_VIDEO_ALL_EPISODE_CLOSURE");
  assert.equal(checked.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(checked.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(checked.manifest.sourceFiles.length, 21);
  assert.equal(checked.manifest.remoteObjects.length, 7);
  assert.equal(checked.manifest.remoteObjects.reduce((sum, row) =>
    sum + row.bytes, 0), 84_162_060);
  assert.equal(checked.before.tree.treeHash,
    "sha256:03fd1adf5253bfb4d19a42d768607b00386c073279131a48ec7b9c1d876959a0");
  assert.equal(checked.before.repository.usedStorage, 7_776_291_078);
  assert.deepEqual(checked.manifest.closure, {
    allPublishedEpisodesInSelectedData: true,
    allRepositoryFilesHaveTerminalDisposition: true,
    completeFixedRepositoryAcquired: false,
    completeSemanticNoVideoClosure: true,
    noFurtherTreePageAfter: true, noFurtherTreePageBefore: true,
    randomTruncation: false,
    recursiveTreeBytes: 7_776_325_133,
    recursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreeDirectories: 12, recursiveTreeEntries: 58,
    recursiveTreeFiles: 46,
    recursiveTreePagesAfter: 1, recursiveTreePagesBefore: 1,
    repositoryUsedStorageAndTreeBytesAreDistinctMeasures: true,
    repositoryUsedStorageBytes: 7_776_291_078,
    selectedBytes: 84_162_060, selectedFiles: 7,
    selectedVideoBytes: 0, selectedVideoFiles: 0,
    videoBytesInventoryOnly: 7_692_163_073,
    videoFilesInventoryOnly: 39,
    videoModalities: [
      { bytes: 2_119_952_390, files: 11, key: "center_camera" },
      { bytes: 2_858_866_561, files: 14, key: "left_camera" },
      { bytes: 2_713_344_122, files: 14, key: "right_camera" },
    ],
  });
  const dispositions = checked.manifest.terminalDispositions;
  assert.equal(dispositions.length, 46);
  assert.equal(dispositions.filter((row) =>
    row.disposition === "ACQUIRED_AND_REPLAYED").length, 7);
  assert.equal(dispositions.filter((row) =>
    row.disposition === "TREE_INVENTORY_ONLY_NOT_ACQUIRED")
    .reduce((sum, row) => sum + row.bytes, 0), 7_692_163_073);
  const objects = Object.fromEntries(checked.manifest.remoteObjects.map((row) =>
    [row.path, row]));
  assert.equal(objects["data/chunk-000/file-000.parquet"].sha256,
    "sha256:937c1e1616c7b265b7a66ab6767ff42785ce9380db38ccefb43b4a72cf2a3994");
  assert.equal(objects["data/chunk-000/file-000.parquet"].rangeChunks, 9);
  assert.equal(objects["meta/episodes/chunk-000/file-000.parquet"].sha256,
    "sha256:b651caab91c6abccb609bc2daca614ec13b9370402649c5f67e2950beb4d5d40");
  assert.equal(objects["meta/tasks.parquet"].sha256,
    "sha256:fde202c29a53951c2eee80d89046002f05f9c38540a4bfc4876fbe9e4d9173b9");
});

test("all action, state, index, and timestamp values replay continuously", () => {
  const data = artifact().replay.data;
  assert.deepEqual({ rows: data.rows, fields: data.fields,
    columns: data.columns, rowGroups: data.rowGroups, nulls: data.nullValues }, {
    rows: 384_618, fields: 7,
    columns: ["observation.state", "action", "timestamp", "frame_index",
      "episode_index", "index", "task_index"],
    rowGroups: 1_410, nulls: 0,
  });
  assert.equal(data.schemaHash,
    "sha256:1b30295e900d4ca32ff88b004919a2130a944833df75149182c5ceb57bd968c6");
  assert.equal(data.numericContentRoot,
    "sha256:1c847ba33d614d51a060ca8f61647b53bb5aaab642d365a3f673710314047bcd");
  assert.deepEqual(data.numericContentHashes, {
    actionFloat32LittleEndian:
      "sha256:5dd3ba104b4ab9fed39d4a2f00a8895b0184957aebed5521496b18c6abb09952",
    episodeIndexInt64LittleEndian:
      "sha256:a6e7ef3c472e9d06a0c6b6a0bd2ea3860c0c97cababa26ce4b297cd9b6c256da",
    frameIndexInt64LittleEndian:
      "sha256:f6c064b1673412606afc3a3ca96be162c4bb4612ec2fa6375adceb30535764ae",
    indexInt64LittleEndian:
      "sha256:da83b3418557739e644407a84558980d70c91e9d1fc09a9b833415e18cd420d6",
    stateFloat32LittleEndian:
      "sha256:ddd1afa30d4ec9a630fcd6868062bee20f4929445bd1d029a47bc7f2306f999a",
    taskIndexInt64LittleEndian:
      "sha256:d85f8bf2b06097190b20ddcf044c7d9452f3b90c540e76747ddff6a38768900d",
    timestampFloat32LittleEndian:
      "sha256:59a0118cefd7d1ee0c4c1fbf163f7db15c8f9f07182a4c7a47313830bb8a89be",
  });
  assert.deepEqual([data.stateWidth, data.actionWidth], [26, 6]);
  assert.equal(data.nonfiniteStateValues, 0);
  assert.equal(data.nonfiniteActionValues, 0);
  assert.equal(data.nonfiniteTimestamps, 0);
  assert.equal(data.withinEpisodeTransitionRows, 383_208);
  assert.equal(data.globalTimestampDecreasesAtEpisodeReset, 1_409);
  assert.equal(data.withinEpisodeTimestampDecreases, 0);
  assert.ok(data.timestampEqualsFrameIndexOver20MaxAbsoluteError < 0.000001);
  assert.equal(data.continuity.action.maximumAbsoluteStep, 0.0896771252155304);
  assert.equal(data.continuity["observation.state"].maximumAbsoluteStep,
    35.10513687133789);
  assert.equal(data.physicalContinuityThresholdApplied, false);
});

test("1,410 episodes close exact data and publisher-order task joins", () => {
  const value = artifact();
  const episodes = value.replay.episodes;
  assert.deepEqual({ rows: episodes.rows, fields: episodes.fields,
    rowGroups: episodes.rowGroups, sum: episodes.sumEpisodeLengths,
    min: episodes.minimumEpisodeLength, max: episodes.maximumEpisodeLength },
  { rows: 1_410, fields: 121, rowGroups: 141, sum: 384_618,
    min: 130, max: 634 });
  assert.equal(episodes.logicalRowsHash,
    "sha256:317c29ec12e84f3615daea86d182599e42e169c563d91aa6ec2ed8d4b2ba1630");
  assert.equal(episodes.episodeLengthsHash,
    "sha256:f80b2b122352e02d498a72bb9aeb3fd447df547cf307ab17da0fba4ef03362d2");
  assert.equal(episodes.datasetRangesContiguousNoGapsOrOverlaps, true);
  assert.equal(episodes.episodeDataFrameTimestampTaskCrosswalkExact, true);
  assert.ok(episodes.stableEpisodeStatMaxAbsoluteError < 0.000004);
  assert.deepEqual(episodes.taskRuns, [
    { episodeFromInclusive: 0, episodeToExclusive: 413, episodes: 413,
      task: "insert_sfp_port_0" },
    { episodeFromInclusive: 413, episodeToExclusive: 858, episodes: 445,
      task: "insert_sfp_port_1" },
    { episodeFromInclusive: 858, episodeToExclusive: 1_410, episodes: 552,
      task: "insert_sc" },
  ]);
  assert.deepEqual(episodes.taskEpisodeCounts,
    { insert_sc: 552, insert_sfp_port_0: 413, insert_sfp_port_1: 445 });
  assert.deepEqual(episodes.taskFrameCounts,
    { insert_sc: 197_803, insert_sfp_port_0: 89_432,
      insert_sfp_port_1: 97_383 });
  assert.equal(episodes.taskTransitionsInPublishedOrder, 2);
  assert.equal(episodes.taskSequenceHash,
    "sha256:d079ef4bd6589473b0896a60aa07fa93e2d3f05da953a4afa28cc0962a1c6529");
  assert.deepEqual(value.replay.tasks.taskStrings,
    ["insert_sfp_port_0", "insert_sfp_port_1", "insert_sc"]);
  assert.equal(value.replay.tasks.logicalRowsHash,
    "sha256:e3016b5de968204a06f96f9f5625ec9c10696a9ed09ed43e8c150ec55e8a3b7f");
});

test("mechanics channels and statistics replay without invented units", () => {
  const value = artifact();
  assert.deepEqual(value.replay.info.stateChannelGroups, {
    force: 3, gripper: 1, jointPosition: 6,
    tcpPose: 7, tcpVelocity: 6, torque: 3,
  });
  assert.deepEqual(value.replay.info.actionChannelGroups,
    { deltaRotation: 3, deltaTranslation: 3 });
  assert.equal(value.replay.info.publisherDeclaredRobotType, "ur5e");
  assert.equal(value.replay.info.logicalHash,
    "sha256:66ef631ceb4b9da1d066ba9443291ed758f7885402d48ae5cf40bd96a93a24ae");
  assert.equal(value.replay.info.forceTorqueChannelsPresent, true);
  assert.equal(value.replay.info.forceTorqueUnitsDeclared, false);
  assert.equal(value.replay.info.forceTorqueCalibrationReceiptPresent, false);
  assert.equal(value.replay.stats.logicalHash,
    "sha256:ef56a7161e9d817d46cba3d2eab4e565f8082bc1ecbd7ecf97106f23bc652835");
  assert.ok(value.replay.stats.globalNumericStatMaxAbsoluteError < 0.000001);
  assert.equal(value.replay.stats.imageStatisticCountPerModality, 141_219);
  assert.equal(value.replay.stats.imageStatisticCountIsVideoFrameCount, false);
  assert.equal(value.replay.stats.imagePixelsOrFramesReplayed, false);
});

test("publisher recovery naming never becomes native recovery or attempt lineage", () => {
  const value = artifact();
  assert.deepEqual(value.publisherNamingBoundary, {
    cardRecoveryTagPresent: true,
    recoveryTokenIsOutcomeLabel: false,
    recoveryTokenIsSourceNativeRecoveryLabel: false,
    repositoryName: "aic_ur5e_sim_v6_recovery",
    repositoryRecoveryTokenPresent: true,
    repositorySimulationTokenPresent: true,
    simulationTokenIsIndependentProvenance: false,
  });
  assert.deepEqual(value.replay.nativeSemantics.matchingFields, {
    attempt: [], done: [], failure: [], intervention: [], parent: [],
    recover: [], retry: [], reward: [], success: [], trial: [],
  });
  assert.equal(value.replay.nativeSemantics.taskStringsContainRecovery, false);
  assert.equal(value.replay.nativeSemantics.orderedEpisodeIndexIsNotAttemptLineage,
    true);
  assert.equal(value.replay.nativeSemantics
    .contiguousTaskGroupsDoNotEstablishAttemptChronology, true);
  for (const key of ["sourceNativeOutcomeLabelPresent",
    "sourceNativeFailureLabelPresent", "sourceNativeRecoveryLabelPresent",
    "sourceNativeInterventionLabelPresent", "sourceNativeRewardPresent",
    "sourceNativeDonePresent", "publisherOutcomeEstablished",
    "reliableOutcomeEstablished", "independentOutcomeEstablished",
    "directCausalEffectEstablished", "recoveryEstablished",
    "correctionWithinEpisodeEstablished", "attemptIdentityEstablished",
    "attemptParentLineageEstablished", "attemptChronologyEstablished",
    "completeAttemptCensusEstablished", "delegationEstablished"]) {
    assert.equal(value.semantics[key], false, key);
  }
});

test("all video remains exact metadata inventory with zero selected bytes", () => {
  const value = artifact();
  const video = value.replay.videoMetadataOnly;
  assert.deepEqual({ files: video.inventoryFiles, bytes: video.inventoryBytes,
    acquiredFiles: video.videoFilesAcquired,
    acquiredBytes: video.videoBytesAcquired,
    containers: video.videoContainersReplayed,
    samples: video.videoSamplesReplayed },
  { files: 39, bytes: 7_692_163_073, acquiredFiles: 0,
    acquiredBytes: 0, containers: 0, samples: 0 });
  assert.deepEqual(Object.fromEntries(Object.entries(video.modalities).map(
    ([name, row]) => [name, row.metadataWindowFramesByFile])), {
    center_camera: [32_485, 32_312, 32_564, 33_170, 32_957, 36_050,
      43_954, 44_784, 44_171, 44_761, 7_410],
    left_camera: [27_802, 28_265, 27_755, 28_505, 28_183, 28_539,
      28_263, 27_968, 27_782, 27_967, 28_350, 27_220, 27_948, 20_071],
    right_camera: [30_985, 30_899, 30_741, 29_992, 30_030, 29_757,
      29_138, 29_062, 28_317, 28_771, 29_338, 28_548, 28_725, 315],
  });
  assert.equal(Object.values(video.modalities).every((row) =>
    row.metadataWindowFrames === 384_618), true);
  assert.equal(video.publisherMetadataWindowFramesAreVerifiedVideoSamples, false);
  assert.equal(video.pixelsDecoded, false);
  assert.equal(video.pixelsProjected, false);
  assert.deepEqual(value.replay.episodes.cameraImageStatisticCountDistribution, {
    100: 1_387, 101: 2, 102: 3, 103: 1, 104: 6, 106: 2,
    116: 3, 117: 1, 118: 1, 119: 1, 121: 1, 123: 1, 126: 1,
  });
});

test("simulation, rights, privacy, training, and authority remain fail-closed", () => {
  const value = artifact();
  assert.equal(value.semantics.publisherSimulationNamingClaimPresent, true);
  assert.equal(value.semantics.simulationProvenanceIndependentlyVerified, false);
  assert.equal(value.semantics.realRobotPhysicalProvenanceEstablished, false);
  assert.equal(value.semantics.independentHardwareIdentityWitnessPresent, false);
  assert.deepEqual(value.rights, {
    datasetCardLicenseClaim: "Apache-2.0",
    evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    excludedVisualContentRightsIndependentlyAdjudicated: false,
    legalConclusionEstablished: false,
    productionTrainingAuthorized: false,
    readmeLicenseClaim: "Apache-2.0", rootLicenseFilePresent: false,
    robotTelemetryRightsIndependentlyAdjudicated: false,
    upstreamLeRobotRightsIndependentlyAdjudicated: false,
  });
  assert.deepEqual(value.privacy, {
    directoryMode: "0700", fileMode: "0600", noPiiGuaranteed: false,
    privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false,
    rawActionStateValuesProjected: false, rawArtifactPrivate: true,
    rawTelemetryPresent: true, selectedVisualBytesPresent: false,
    videoPixelsDecoded: false, videoPixelsProjected: false,
  });
  assert.deepEqual(value.boundary, {
    CEU: 0, action: 1, attemptCensus: 0, attemptLineage: 0, authority: 0,
    delegation: 0, directCausalEffect: 0, externalEffect: 0,
    independentHardwareWitness: 0, independentOutcome: 0,
    independentSimulationProvenance: 0, intervention: 0,
    mechanicsTelemetry: 1, network: 0, physicalObservation: 0, privacy: 0,
    publisherOutcome: 0, publisherRobotTypeClaim: 1,
    publisherSimulationClaim: 1, recovery: 0, reliableOutcome: 0, training: 0,
  });
});

test("typed populations, source-bound receipt, and private modes reproduce", () => {
  const value = artifact();
  assert.deepEqual(value.typedDenominators, {
    ACTION_STATE_FRAME: 384_618,
    PUBLISHER_IMAGE_STAT_SAMPLE_PER_MODALITY: 141_219,
    SOURCE_NATIVE_EPISODE: 1_410,
    TASK_DEFINITION: 3,
    VIDEO_FILE_INVENTORY: 39,
    crossTotal: null,
  });
  const { artifactHash, ...body } = value;
  assert.equal(ur5eSimV6ArtifactHash(body), artifactHash);
  assert.deepEqual(verifyUr5eSimV6Artifact(value), {
    ok: true, artifactHash: EXPECTED_ARTIFACT_HASH,
    verificationLevel:
      "STANDALONE_HASH_TYPED_SIM_NAMING_AND_NO_NATIVE_RECOVERY_BOUNDARY",
  });
  const sourceBound = verifyUr5eSimV6ArtifactWithSource(value,
    SOURCE_DIRECTORY, { pythonExecutable: ".venv/bin/python" });
  assert.equal(sourceBound.ok, true, sourceBound.error);
  assert.equal(sourceBound.verificationLevel,
    "FULL_PARQUET_EPISODE_TASK_STATS_AND_VIDEO_METADATA_WINDOW_REPLAY");
  const manifest = readJson(MANIFEST_PATH);
  const receipt = readJson(RECEIPT_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.deepEqual(manifest.report, {
    bytes: 758_147, path: "ur5e-sim-v6-recovery.json",
    sha256:
      "sha256:c479306389a289c456cd394f3e9201e706b089a3f2d51ff89a1fa0e0dfc9b0ce",
  });
  assert.equal(receipt.receiptHash, EXPECTED_RECEIPT_HASH);
  assert.equal(receipt.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(receipt.artifactManifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(receipt.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(receipt.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(receipt.selectedFiles, 7);
  assert.equal(receipt.selectedBytes, 84_162_060);
  assert.equal(receipt.terminalDispositionFiles, 46);
  const tree = walk(ARTIFACT_DIRECTORY);
  assert.equal(tree.directories.every((directory) =>
    (statSync(directory).mode & 0o777) === 0o700), true);
  assert.equal(tree.files.every((file) =>
    (statSync(file).mode & 0o777) === 0o600), true);
});
