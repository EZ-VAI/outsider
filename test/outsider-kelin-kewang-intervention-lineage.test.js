import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  KELIN_KEWANG_LINEAGE_PROFILE, KELIN_KEWANG_SOURCES,
  acquirePinnedKelinKewangLineageSource, kelinKewangLineageArtifactHash,
  verifyKelinKewangLineageArtifact,
  verifyKelinKewangLineageArtifactWithSource,
  verifyKelinKewangLineageSourceDirectory,
} from "../src/outsider-kelin-kewang-intervention-lineage.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-kelin-kewang-intervention-lineage-20260830-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const KE_ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-peg-intervention-20260830-v1");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "kelin-kewang-intervention-lineage.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const RECEIPT_PATH = path.join(ARTIFACT_DIRECTORY, "receipt.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:c5ef0387a9282e2d848877dbcce2d3229fa443b569b7b9b76300fd37c50da877";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:b534f8d2e93729682819ea6cb23a1fdd95f3aaf9b306808533eacbfde563c070";
const EXPECTED_SOURCE_ROOT =
  "sha256:1b7c69d24fd70cde38cd9c2a1d6b6d2737d20066b74b9e3844cc415b401e5e35";
const EXPECTED_MANIFEST_HASH =
  "sha256:9188c33808da42268b2ac3734567fb85414705de2766996c57440f8d4bc6a973";
const EXPECTED_RECEIPT_HASH =
  "sha256:a1bfa8af09c833ef3b736c1245a8628c88e0c95a77db34ee8c2182732644f744";

let sourceVerification;

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function artifact() {
  assert.equal(existsSync(REPORT_PATH), true);
  return readJson(REPORT_PATH);
}

function checkedSource() {
  if (sourceVerification === undefined) {
    sourceVerification = verifyKelinKewangLineageSourceDirectory(
      SOURCE_DIRECTORY, { keArtifactDirectory: KE_ARTIFACT_DIRECTORY });
  }
  assert.equal(sourceVerification.ok, true, sourceVerification.error);
  return sourceVerification;
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

test("both fixed revisions and bounded arithmetic remain exact", () => {
  assert.deepEqual(KELIN_KEWANG_SOURCES.map((source) => ({
    key: source.key, id: source.id, revision: source.revision,
    treeEntries: source.treeEntries, treeFiles: source.treeFiles,
    treeBytes: source.treeBytes, noVideoBytes: source.noVideoBytes,
    baseVideoBytes: source.baseVideoBytes, handVideoBytes: source.handVideoBytes,
    episodes: source.episodes, frames: source.frames,
  })), [
    { key: "intervention_1", id: "KelinLiIC/intervention_1",
      revision: "4d13af74b04a1b63572f7841657c9527f8ce84cc",
      treeEntries: 20, treeFiles: 10, treeBytes: 535_707_700,
      noVideoBytes: 3_215_519, baseVideoBytes: 397_934_510,
      handVideoBytes: 134_557_671, episodes: 44, frames: 18_455 },
    { key: "intervention_2", id: "KelinLiIC/intervention_2",
      revision: "ab61fc8954b20c16514575fe9e087491b8cb6333",
      treeEntries: 21, treeFiles: 11, treeBytes: 603_549_243,
      noVideoBytes: 3_757_809, baseVideoBytes: 449_247_096,
      handVideoBytes: 150_544_338, episodes: 62, frames: 20_840 },
  ]);
  assert.deepEqual(KELIN_KEWANG_LINEAGE_PROFILE, {
    repositoryUsedStorageBytes: 1_139_194_528,
    recursiveTreeEntries: 41, recursiveTreeDirectories: 20,
    recursiveTreeFiles: 21, recursiveTreeBytes: 1_139_256_943,
    acquiredNoVideoFiles: 14, acquiredNoVideoBytes: 6_973_328,
    crossBoundHandVideoFiles: 2, crossBoundHandVideoBytes: 285_102_009,
    baseVideoInventoryFiles: 5, baseVideoInventoryBytes: 847_181_606,
    sourceEpisodeOccurrences: 106, uniqueMergedEpisodes: 106,
    sourceFrameOccurrences: 39_295, uniqueMergedFrames: 39_295,
  });
});

test("the linked source acquirer refuses clobber before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "kelin-kewang-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedKelinKewangLineageSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /KELIN_KEWANG_LINEAGE_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("both official before-after trees close every published file", () => {
  const checked = checkedSource();
  assert.equal(checked.verificationLevel,
    "TWO_PINNED_NO_VIDEO_CLOSURES_PLUS_NESTED_KE_HAND_OBJECT_CROSS_BIND");
  assert.equal(checked.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(checked.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(checked.manifest.sourceFiles.length, 42);
  assert.deepEqual(checked.manifest.beforeTreeHashes, {
    intervention_1:
      "sha256:ea80393f5ff781f724a24ced64ad61a7e96a88342933ab9a4934f8899f31e3e1",
    intervention_2:
      "sha256:7ec979b9d1cabe3d9f48da42cba9c99848b7744ffd5bf12f0b666afb9f0a1760",
  });
  assert.deepEqual(checked.manifest.afterTreeHashes,
    checked.manifest.beforeTreeHashes);
  assert.equal(checked.manifest.remoteObjects.length, 14);
  assert.equal(checked.manifest.remoteObjects.reduce((sum, row) =>
    sum + row.bytes, 0), 6_973_328);
  const dispositions = checked.manifest.terminalDispositions;
  assert.equal(dispositions.length, 21);
  assert.deepEqual(Object.fromEntries([
    "ACQUIRED_AND_REPLAYED",
    "CROSS_BOUND_EXISTING_KEWANG_BYTES_NOT_DUPLICATED",
    "TREE_INVENTORY_ONLY_NOT_ACQUIRED",
  ].map((name) => [name, dispositions.filter((row) =>
    row.disposition === name).length])), {
    ACQUIRED_AND_REPLAYED: 14,
    CROSS_BOUND_EXISTING_KEWANG_BYTES_NOT_DUPLICATED: 2,
    TREE_INVENTORY_ONLY_NOT_ACQUIRED: 5,
  });
  assert.deepEqual(checked.manifest.closure, {
    acquiredNoVideoBytes: 6_973_328, acquiredNoVideoFiles: 14,
    allPublishedEpisodesInBothSelectedDataFiles: true,
    allRepositoryFilesHaveTerminalDisposition: true,
    baseVideoBytesInventoryOnly: 847_181_606,
    baseVideoFilesInventoryOnly: 5,
    completeFixedRepositoriesAcquired: false,
    completeSemanticNoVideoClosureBothRepositories: true,
    crossBoundHandVideoBytes: 285_102_009, crossBoundHandVideoFiles: 2,
    evidenceCoveredBytes: 292_075_337, evidenceCoveredFiles: 16,
    newlyAcquiredHandVideoBytes: 0, newlyAcquiredHandVideoFiles: 0,
    noFurtherTreePagesBeforeOrAfter: true, randomTruncation: false,
    recursiveTreeBytes: 1_139_256_943, recursiveTreeDirectories: 20,
    recursiveTreeEntries: 41, recursiveTreeFiles: 21,
    recursiveTreesCapturedBeforeAndAfter: true,
    repositoryUsedStorageAndTreeBytesAreDistinctMeasures: true,
    repositoryUsedStorageBytes: 1_139_194_528,
  });
});

test("both hand videos cross-bind exact existing Ke bytes without copying", () => {
  const checked = checkedSource();
  assert.deepEqual(checked.manifest.crossBinds.map((row) => ({
    source: row.source, bytes: row.bytes, sha256: row.sha256,
    nestedPath: row.nestedArtifactPath,
  })), [
    { source: "intervention_1", bytes: 134_557_671,
      sha256:
        "sha256:16e66bc26001dd1de8acadf67696bd67b907186b062b9307893756044621ff00",
      nestedPath:
        "videos/observation.images.hand_camera/chunk-000/file-001.mp4" },
    { source: "intervention_2", bytes: 150_544_338,
      sha256:
        "sha256:6c4697341440ad4a84142e57decc1feac8f244061622610d4a3b69389752a887",
      nestedPath:
        "videos/observation.images.hand_camera/chunk-000/file-000.mp4" },
  ]);
  assert.deepEqual(artifact().replay.nestedKeVerification, {
    artifactHash:
      "sha256:99b7a505aa26ca35407f9f1b22f9c391f041408be6fead2d7a500c0825a3bca5",
    handVideoBytes: 285_102_009, handVideoFiles: 2,
    handVideoSampleTablesReplayed: true, handVideoSamples: 39_295,
    newHandVideoBytesAcquired: 0, pixelsDecoded: false, pixelsProjected: false,
    sourceBoundVerificationLevel:
      "FULL_PARQUET_EPISODE_INTERVENTION_SUCCESS_STATS_AND_HAND_MP4_SAMPLE_REPLAY",
    sourceManifestHash:
      "sha256:a62f2ab977ed102139743c27cf20f9da08fda4ba0b7a7227507e90a30606e8da",
    sourceRoot:
      "sha256:c619f78517b3d03fcf8f144b224b8f1647d50fb9f34d803ae22942f112e343e5",
  });
});

test("all ten offset-adjusted columns reproduce the Ke merged bytes", () => {
  const value = artifact();
  assert.deepEqual({ k1: { rows: value.replay.parts.intervention_1.data.rows,
    rowGroups: value.replay.parts.intervention_1.data.rowGroups,
    bytes: value.replay.parts.intervention_1.data.bytes,
    sha256: value.replay.parts.intervention_1.data.sha256 },
  k2: { rows: value.replay.parts.intervention_2.data.rows,
    rowGroups: value.replay.parts.intervention_2.data.rowGroups,
    bytes: value.replay.parts.intervention_2.data.bytes,
    sha256: value.replay.parts.intervention_2.data.sha256 } }, {
    k1: { rows: 18_455, rowGroups: 44, bytes: 2_862_815,
      sha256:
        "sha256:4b9145a8a3fddb5aea8ac194ecadde273d63261e79ee3bee64f88ec1524d1929" },
    k2: { rows: 20_840, rowGroups: 62, bytes: 3_290_438,
      sha256:
        "sha256:d23ec2ce42361bf8713f989677e5dca959acac7ec79b7b03770030add5794af4" },
  });
  assert.equal(value.replay.lineage.allTenOffsetAdjustedDataColumnsEqualKe, true);
  assert.deepEqual(value.replay.lineage.byteDerivedMergeOrder,
    ["intervention_2", "intervention_1"]);
  assert.equal(value.replay.lineage.intervention2EqualsKeDataPrefixRows, 20_840);
  assert.equal(value.replay.lineage.intervention1EqualsKeDataSuffixRows, 18_455);
  assert.deepEqual(value.replay.lineage.mergedNumericHashes, {
    action:
      "sha256:839bf14a3f8e9d930b5decbf7c7f60e9e528061aa03ca793871a7ab645637636",
    episode_index:
      "sha256:7000e9125973b99dc23c511da75f013de4303c89a24862959c86cd63ba9caa37",
    frame_index:
      "sha256:11a5d3e5735aa6f757bc7565e408d1ee84931139d97ac17698c97e64b3f8cefb",
    index:
      "sha256:4870eeb66120fbe8f58fb738e51b5210a0cd15412be762b3108b61f8746f6baf",
    intervention:
      "sha256:f0185f9394f156f75863381a18a49d17c610b43db8bca3e2a08c231bb748cf0a",
    "next.success":
      "sha256:afc062ac0647591ec1d93fcce460a2fb24120bf3978c86af22555142fe909540",
    "observation.qvel":
      "sha256:60954ececcec95c3f086b601f94c37f4037074286c769e38b279b576cc865ab4",
    "observation.state":
      "sha256:e8a352d0f1fca4059128eca0a13eeaffe4c4de4a7cc24fc506d80b84c078a79f",
    task_index:
      "sha256:0c0b7aeb65fcd0902ce0d27ec8fe8a91253c071bab50f6d47bc8d2e74378086c",
    timestamp:
      "sha256:4123dde46325913c6ff6777df13e6fdb197aa71c77080b77aaa6f0029cf468d3",
  });
  assert.equal(value.replay.lineage.mergedNumericRoot,
    "sha256:facd471169b999caf56c6d68095f5a9f6b34b5fc298fcbe30d8378bf0a78e338");
});

test("episode sidecars, tasks, and info prove the 2-then-1 repack", () => {
  const value = artifact();
  const k1 = value.replay.parts.intervention_1.episodes;
  const k2 = value.replay.parts.intervention_2.episodes;
  assert.deepEqual({ rows: k1.rows, rowGroups: k1.rowGroups,
    logicalRowsHash: k1.logicalRowsHash, transform: k1.mergeTransform,
    suffix: k1.transformedEqualsKeSuffix }, {
    rows: 44, rowGroups: 5,
    logicalRowsHash:
      "sha256:002a604df8f89de05257f39cfa11784e8514aa8c0a69ff7f3c22e0d4a82e862f",
    transform: { baseVideoFileIndexOffset: 3, datasetIndexOffset: 20_840,
      episodeIndexOffset: 62, handVideoFileIndexOffset: 1,
      otherColumnsChanged: false }, suffix: true,
  });
  assert.deepEqual({ rows: k2.rows, rowGroups: k2.rowGroups,
    logicalRowsHash: k2.logicalRowsHash, prefix: k2.equalsKePrefixWithoutTransform },
  { rows: 62, rowGroups: 7,
    logicalRowsHash:
      "sha256:b5e27f403296e648563f8fac9a9c5160c50f46fdc07a9ec8a3e86c3b022bcaa5",
    prefix: true });
  assert.equal(value.replay.lineage.episodeSidecarMergedLogicalHash,
    "sha256:f65655bc897f25423ccd9bbd0edcdbf03edcc75f640b0c6ce31b92de64488039");
  assert.equal(value.replay.repacking.tasks.allThreeTaskTablesLogicallyEqual, true);
  assert.deepEqual(value.replay.repacking.tasks.records,
    [{ task: "Insert the peg into the hole.", task_index: 0 }]);
  assert.equal(value.replay.repacking.tasks.logicalRowsHash,
    "sha256:5303d5a3c57d051aeb85e62b56252e44421df4e2ce213b515269f38649ae8cf4");
  assert.equal(new Set(Object.values(value.replay.repacking.info).map((row) =>
    row.featureHash)).size, 1);
  assert.deepEqual(Object.values(value.replay.repacking.info).map((row) =>
    [row.episodes, row.frames, row.splits.train]),
  [[44, 18_455, "0:44"], [62, 20_840, "0:62"], [106, 39_295, "0:106"]]);
});

test("native intervention and publisher outcomes preserve episode denominators", () => {
  const value = artifact();
  assert.deepEqual(value.replay.parts.intervention_1.data.native, {
    episodeInterventionTrueFrameCountsHash:
      "sha256:b58ea553bf5c2b6e5afeb3a08796d20270a16eff602f42bbe5d3a598608dc5ac",
    episodesWithIntervention: 44, interventionSegments: 55,
    interventionTrueFrames: 13_970, publisherFailureEpisodes: 1,
    publisherSuccessEpisodes: 43,
    segmentsPerEpisodeDistribution: { 1: 34, 2: 9, 3: 1 },
    successIsEpisodeConstantFrameBroadcast: true,
  });
  assert.deepEqual(value.replay.parts.intervention_2.data.native, {
    episodeInterventionTrueFrameCountsHash:
      "sha256:5f694eb4e28021c6ae099b2146c8d95c61d71b4f375bdba25b65e95ed5d0ace5",
    episodesWithIntervention: 61, interventionSegments: 79,
    interventionTrueFrames: 14_749, publisherFailureEpisodes: 1,
    publisherSuccessEpisodes: 61,
    segmentsPerEpisodeDistribution: { 0: 1, 1: 43, 2: 18 },
    successIsEpisodeConstantFrameBroadcast: true,
  });
  assert.deepEqual(value.replay.nativeSemantics, {
    episode105PublisherFailureAll464FramesIntervention: true,
    episode61PublisherFailureNoIntervention: true,
    episodesWithIntervention: 105,
    interventionEstablishesAuthorization: false,
    interventionField: "intervention", interventionHumanSourceVerified: false,
    interventionSegments: 134,
    interventionToSuccessIsCausalRecovery: false,
    interventionTrueFrames: 28_719, publisherFailureEpisodes: 2,
    publisherSuccessEpisodes: 104, publisherSuccessField: "next.success",
    publisherSuccessIsEpisodeConstantFrameBroadcast: true,
    publisherSuccessIsIndependentOutcome: false,
    segmentsPerEpisodeDistribution: { 0: 1, 1: 77, 2: 27, 3: 1 },
  });
});

test("Parquet and stats repacking differences are explicit, not hidden", () => {
  const value = artifact().replay.repacking;
  assert.deepEqual({ kelin: value.kelinVectorTypes, ke: value.keVectorTypes,
    rawEqual: value.rawParquetFilesByteIdentical,
    logicalEqual: value.allLogicalDataValuesEqualAfterDeclaredOffsets,
    kelinBytes: value.kelinNoVideoBytes, keBytes: value.keNoVideoBytes,
    difference: value.noVideoPackagingByteDifference }, {
    kelin: "fixed_size_list<float>", ke: "list<float>", rawEqual: false,
    logicalEqual: true, kelinBytes: 6_973_328, keBytes: 6_572_363,
    difference: 400_965,
  });
  assert.deepEqual(Object.values(value.dataFiles).map((row) =>
    [row.rows, row.rowGroups, row.schemaHash]), [
    [18_455, 44,
      "sha256:4a82c8562b28a0ffde62f8bfc0a32f02402d23a4a307f8d469ba914d530bd8b2"],
    [20_840, 62,
      "sha256:4a82c8562b28a0ffde62f8bfc0a32f02402d23a4a307f8d469ba914d530bd8b2"],
    [39_295, 106,
      "sha256:d08104f5b5d481e73bbd129517088faf011889717ac1ca89beae8c4baa214bcf"],
  ]);
  assert.ok(value.stats.intervention_1.numericMinMaxMeanStdMaxAbsoluteError
    < 0.000004);
  assert.ok(value.stats.intervention_2.numericMinMaxMeanStdMaxAbsoluteError
    < 0.000004);
  assert.ok(value.stats.ke.stableNumericMinMaxMeanStdMaxAbsoluteError
    < 0.000004);
  assert.ok(value.stats.ke
    .identifierMinMaxMeanStdMatchesRestartedKelinProjectionMaxAbsoluteError
    < 0.000004);
  assert.equal(value.stats.ke
    .identifierMinMaxMeanStdVsCanonicalAdjustedDataMaxAbsoluteDifference, 18_455);
  assert.deepEqual([value.stats.intervention_1.publisherImageStatisticCountPerCamera,
    value.stats.intervention_2.publisherImageStatisticCountPerCamera,
    value.stats.ke.publisherImageStatisticCountPerCamera],
  [472_448_000, 533_504_000, 1_005_952_000]);
  assert.equal(value.stats.ke.publisherImageStatisticCountsEqualPartSum, true);
  assert.equal(value.stats.intervention_1.publisherQuantilesUsedForLineage, false);
  assert.equal(value.stats.intervention_2.publisherQuantilesUsedForLineage, false);
});

test("source occurrences and the nested Ke repack never double count", () => {
  const value = artifact();
  assert.deepEqual(value.typedDenominators, {
    CROSS_BOUND_HAND_VIDEO_FILE: 2,
    KELIN_BASE_VIDEO_FILE_INVENTORY: 5,
    KELIN_SOURCE_ACTION_STATE_QVEL_FRAME_OCCURRENCE: 39_295,
    KELIN_SOURCE_EPISODE_OCCURRENCE: 106,
    NATIVE_INTERVENTION_SEGMENT: 134,
    NATIVE_INTERVENTION_TRUE_FRAME: 28_719,
    PUBLISHER_EPISODE_OUTCOME: 106,
    UNIQUE_MERGED_ACTION_STATE_QVEL_FRAME: 39_295,
    UNIQUE_MERGED_EPISODE: 106,
    crossTotal: null,
  });
  assert.deepEqual(value.denominatorBoundary, {
    kelinSourceOccurrencesAndUniqueMergedEpisodesAreSeparateViews: true,
    nestedKeRepackAddsUniqueEpisodes: 0, nestedKeRepackAddsUniqueFrames: 0,
    publisherFrameBroadcastSuccessValuesAreIndependentOutcomes: false,
    typedPopulationsMayBeSummed: false,
  });
  assert.equal(value.lineageBoundary.exactRepackLineageEstablished, true);
  assert.equal(value.lineageBoundary.newExperimentEvidenceEstablished, false);
  assert.equal(value.lineageBoundary.publisherRepositorySuffixesEstablishChronology,
    false);
  assert.equal(value.lineageBoundary.attemptParentLineageEstablished, false);
  assert.equal(value.lineageBoundary.recoveryEstablished, false);
  assert.equal(value.lineageBoundary.causalEffectEstablished, false);
});

test("rights, simulation, privacy, training, and authority remain fail-closed", () => {
  const value = artifact();
  assert.equal(value.semantics.publisherDeclaredRobotType, "maniskill_sim");
  assert.equal(value.semantics.simulationTrajectoryPresent, true);
  assert.equal(value.semantics.realRobotTrajectoryPresent, false);
  assert.equal(value.semantics.sourceNativeInterventionPresent, true);
  assert.equal(value.semantics.sourceNativePublisherOutcomePresent, true);
  assert.equal(value.semantics.independentOutcomeEstablished, false);
  assert.equal(value.semantics.directCausalEffectEstablished, false);
  assert.equal(value.semantics.recoveryEstablished, false);
  assert.deepEqual(value.rights, {
    crossBoundVisualRightsIndependentlyAdjudicated: false,
    evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    kelin1DatasetCardLicenseClaim: "Apache-2.0",
    kelin1ReadmeLicenseClaim: "Apache-2.0",
    kelin2DatasetCardLicenseClaim: "Apache-2.0",
    kelin2ReadmeLicenseClaim: "Apache-2.0",
    kewangDatasetCardLicenseClaim: null,
    kewangReadmeLicenseClaim: "More Information Needed",
    legalConclusionEstablished: false, productionTrainingAuthorized: false,
    rootLicenseFilePresentInAnyLinkedRepository: false,
    telemetryRightsIndependentlyAdjudicated: false,
    upstreamLeRobotAndManiSkillRightsIndependentlyAdjudicated: false,
  });
  assert.deepEqual(value.boundary, {
    CEU: 0, action: 1, attemptCensus: 0, attemptLineage: 0, authority: 0,
    delegation: 0, directCausalEffect: 0, externalEffect: 0,
    humanAuthorization: 0, independentOutcome: 0, mechanicsTelemetry: 1,
    nativeIntervention: 1, network: 0, physicalObservation: 0, privacy: 0,
    publisherOutcome: 1, realRobotTrajectory: 0, recovery: 0,
    reliableOutcome: 0, simulationObservation: 1, training: 0,
  });
  assert.equal(value.privacy.rawArtifactPrivate, true);
  assert.equal(value.privacy.localSelectedVisualBytesPresent, false);
  assert.equal(value.privacy.crossBoundHandCameraVisualEvidencePresent, true);
  assert.equal(value.privacy.noPiiGuaranteed, false);
});

test("source-bound receipt, artifact hash, and private modes reproduce", () => {
  const value = artifact();
  const { artifactHash, ...body } = value;
  assert.equal(kelinKewangLineageArtifactHash(body), artifactHash);
  assert.deepEqual(verifyKelinKewangLineageArtifact(value), {
    ok: true, artifactHash: EXPECTED_ARTIFACT_HASH,
    verificationLevel:
      "STANDALONE_HASH_TYPED_EXACT_REPACK_NO_DOUBLE_COUNT_BOUNDARY",
  });
  const sourceBound = verifyKelinKewangLineageArtifactWithSource(value,
    SOURCE_DIRECTORY, { pythonExecutable: ".venv/bin/python",
      keArtifactDirectory: KE_ARTIFACT_DIRECTORY });
  assert.equal(sourceBound.ok, true, sourceBound.error);
  assert.equal(sourceBound.verificationLevel,
    "FULL_TWO_PART_PARQUET_OFFSET_JOIN_PLUS_NESTED_KE_SELF_REPLAY");
  const manifest = readJson(MANIFEST_PATH);
  const receipt = readJson(RECEIPT_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.deepEqual(manifest.report, {
    bytes: 107_386, path: "kelin-kewang-intervention-lineage.json",
    sha256:
      "sha256:a099c805ea62b8e54122ae5b06f6475eab082407be5dc594bd4f9f77370393cc",
  });
  assert.equal(receipt.receiptHash, EXPECTED_RECEIPT_HASH);
  assert.equal(receipt.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(receipt.artifactManifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(receipt.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(receipt.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(receipt.newlyAcquiredHandVideoBytes, 0);
  assert.equal(receipt.terminalDispositionFiles, 21);
  const tree = walk(ARTIFACT_DIRECTORY);
  assert.equal(tree.directories.every((directory) =>
    (statSync(directory).mode & 0o777) === 0o700), true);
  assert.equal(tree.files.every((file) =>
    (statSync(file).mode & 0o777) === 0o600), true);
});
