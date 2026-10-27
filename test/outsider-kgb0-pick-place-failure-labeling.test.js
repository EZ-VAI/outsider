import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  KGB0_FAILURE_ID, KGB0_FAILURE_PROFILE, KGB0_FAILURE_REVISION,
  acquirePinnedKgb0FailureSource, buildKgb0FailureArtifactFromSource,
  kgb0FailureArtifactHash, verifyKgb0FailureArtifact,
  verifyKgb0FailureSourceDirectory,
} from "../src/outsider-kgb0-pick-place-failure-labeling.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-kgb0-pick-place-failure-labeling-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "kgb0-pick-place-failure-labeling.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:8555c84ac650c90e9dba6e397bdf01e1f19b48ccd6b2b27d0beb4788e295561a";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:c434c31a9f1f290da07556791af02c730fc5ffa692441051ca7f6c1a714d8606";
const EXPECTED_SOURCE_ROOT =
  "sha256:d0a6818d7e02c84ae3535349402dd00b107fea8debcbf983cd5ebb48aabeeba5";
const EXPECTED_MANIFEST_HASH =
  "sha256:a7508c53a7582491d8f3c50f079cc54bc71e6d3b38c421e2f05bd39be5595a79";

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

test("the KGB0 revision and complete repository profile are fixed", () => {
  assert.equal(KGB0_FAILURE_ID, "KGB0/pick_and_place_failure_labeling");
  assert.equal(KGB0_FAILURE_REVISION,
    "6ba69839b27ed99d0f214bbbb8c52ca31f2d3bc6");
  assert.deepEqual(KGB0_FAILURE_PROFILE, {
    usedStorage: 1_826_356_890,
    treeEntries: 803, treeDirectories: 12, treeFiles: 791,
    treeBytes: 1_791_793_136,
    noVideoFiles: 403, noVideoBytes: 236_435_951,
    parquetFiles: 194, parquetBytes: 89_233_489,
    embeddingFiles: 194, embeddingBytes: 142_678_424,
    metadataFiles: 11, metadataBytes: 4_487_738,
    rootFiles: 4, rootBytes: 36_300,
    videoFiles: 388, videoBytes: 1_555_357_185,
    episodes: 194, frames: 69_416, tasks: 14,
    labels: 228, failureFrames: 20_963, fps: 30,
  });
});

test("the source acquirer refuses clobber before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "kgb0-failure-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedKgb0FailureSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /KGB0_FAILURE_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("the full tree is bracketed and the complete 403-file no-video group closes", () => {
  const verified = verifyKgb0FailureSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_COMPLETE_403_FILE_NO_VIDEO_GROUP_BYTES");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 4);
  assert.equal(verified.manifest.remoteObjects.length, 403);
  assert.equal(verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + entry.bytes, 0), 236_435_951);
  assert.equal(verified.manifest.videoInventory.length, 388);
  assert.equal(verified.manifest.videoInventory.reduce((sum, entry) =>
    sum + entry.bytes, 0), 1_555_357_185);
  assert.deepEqual(verified.manifest.closure, {
    completePublishedNoVideoGroup: true,
    embeddingBytes: 142_678_424, embeddingFiles: 194,
    globallyExhaustive: false, licenseFilesPresent: 0,
    metadataBytes: 4_487_738, metadataFiles: 11,
    parquetBytes: 89_233_489, parquetFiles: 194,
    randomTruncation: false,
    recursiveTreeBytes: 1_791_793_136,
    recursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreeDirectories: 12, recursiveTreeEntries: 803,
    recursiveTreeFiles: 791,
    recursiveTreeHash:
      "sha256:b11832079413155ff9dc512a266163bb6f4ff4c582e1edbfeb57de63d01b5a77",
    recursiveTreePagesPerPhase: 1,
    rootBytes: 36_300, rootFiles: 4,
    selectedBytes: 236_435_951, selectedObjects: 403,
    selectionRule: "ALL_NON_MP4_FILES_AT_FIXED_REVISION",
    videoBytesAcquired: 0, videoBytesInventoried: 1_555_357_185,
    videoStreams: {
      "observation.images.cam_left_high": 194,
      "observation.images.cam_third": 194,
    },
    videosInventoried: 388,
  });
  assert.deepEqual(verified.before, verified.after);
});

test("all 194 Parquets and every native frame field replay", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(value.replay.info.robotType, "Unitree_G1_Inspire");
  assert.equal(value.replay.info.totalEpisodes, 194);
  assert.equal(value.replay.info.totalFrames, 69_416);
  assert.equal(value.replay.info.totalTasks, 14);
  assert.equal(value.replay.info.totalVideos, 388);
  assert.equal(value.replay.info.fps, 30);
  assert.equal(value.replay.info.featureNames.length, 60);
  assert.deepEqual({ ...value.replay.parquet, action: undefined,
    contactValueCounts: undefined, episodes: undefined, language: undefined,
    schema: undefined, state: undefined, tactilePng: undefined }, {
    action: undefined, contactValueCounts: undefined, episodes: undefined,
    language: undefined, schema: undefined, state: undefined, tactilePng: undefined,
    columns: 58, files: 194, frames: 69_416,
    originalIndexMissingRows: 0,
    taskEpisodeCounts: {
      "Move the baseball from the red start region to the blue target region.": 28,
      "Move the empty bottle from the red start region to the blue target region.": 31,
      "Move the empty can from the red start region to the blue target region.": 19,
      "Move the empty plastic cup from the red start region to the blue target region.": 22,
      "Move the filled bottle from the red start region to the blue target region.": 21,
      "Move the filled can from the red start region to the blue target region.": 6,
      "Move the red cup from the red start region to the blue target region.": 31,
      "Move the soccer ball from the red start region to the blue target region.": 16,
      "Move the transparent cup from the red start region to the blue target region.": 20,
    },
  });
  assert.equal(value.replay.parquet.schema.length, 58);
  assert.equal(value.replay.parquet.schema.some((field) =>
    field.name.startsWith("observation.images.")), false);
  assert.deepEqual([value.replay.parquet.state.dimensions,
    value.replay.parquet.state.count,
    value.replay.parquet.action.dimensions,
    value.replay.parquet.action.count], [26, 69_416, 26, 69_416]);
  assert.deepEqual(value.replay.parquet.language, {
    attentionValueCounts: { 1: 3_331_968 },
    dimensions: 48, tokenMaximum: 121, tokenMinimum: 32,
  });
  assert.equal(value.replay.parquet.tactilePng.features, 34);
  assert.equal(value.replay.parquet.tactilePng.encodedBytes, 185_405_760);
  assert.equal(value.replay.parquet.tactilePng.pixelsDecoded, false);
  assert.equal(Object.values(value.replay.parquet.tactilePng.rowsPerFeature)
    .every((count) => count === 69_416), true);
  assert.equal(value.replay.parquet.episodes.length, 194);
  assert.equal(value.replay.parquet.episodes.reduce((sum, episode) =>
    sum + episode.frames, 0), 69_416);
  assert.equal(value.replay.parquet.episodes.every((episode, index) =>
    episode.episodeIndex === index
      && /^sha256:[a-f0-9]{64}$/u.test(episode.parquetByteHash)), true);
});

test("all publisher intervals reproduce native frame annotations without outcome promotion", () => {
  const value = artifact();
  assert.deepEqual(value.replay.annotations, {
    endResolutionCounts: {
      episode_end: 66, explicit_end_time: 154, next_label_start: 8,
    },
    episodesWithMultipleLabels: 29, episodesWithOverlap: 8,
    episodesWithPostLabelFrames: 129, episodesWithPreLabelFrames: 177,
    failureLabeledFrames: 20_963,
    failureTypeIntervalCounts: {
      collision: 99, missed_grasp: 41, off_target: 22,
      slip: 49, wrong_orientation: 17,
    },
    failureTypePrimaryFrameCounts: {
      collision: 9_258, missed_grasp: 4_874, off_target: 1_501,
      slip: 3_992, wrong_orientation: 1_338,
    },
    frameIntervalsExactlyReplayed: true,
    handPrimaryFrameCounts: { both: 1_275, left: 9_345, right: 10_343 },
    intervals: 228, maxActiveLabels: 2,
    nonemptyAuxNoteRows: 0, nonemptyNoteRows: 41,
    primaryLabelRuleExactlyReplayed: true,
    rawNotesRepublished: false,
    subTaskPrimaryFrameCounts: {
      grasping: 8_143, lifting: 90, moving: 607,
      placing: 5_192, reaching: 6_931,
    },
    taskIntervalCounts: {
      baseball: 32, empty_bottle: 34, empty_can: 25,
      empty_plastic_cup: 23, filled_bottle: 23, filled_can: 8,
      red_cup: 42, soccer_ball: 17, transparent_cup: 24,
    },
  });
  assert.deepEqual(value.labelSemantics, {
    annotationIntervalsExactlyReplayed: true,
    directOutcomeEstablished: false,
    episodeFailureMembershipIsIndependentOutcome: false,
    originalSourceDatasetByteCrosswalkEstablished: false,
    postLabelFramesAreRecoveryExecutions: false,
    publisherLabelsAreIndependentTaskOutcomes: false,
    recoveryEstablished: false, recoveryOutcomeFieldPresent: false,
    recoveryTagEstablishesRecovery: false,
    sourceNativeFrameAnnotationColumnsPresent: true,
    terminalTaskFailureFieldPresent: false,
    terminalTaskSuccessFieldPresent: false,
  });
});

test("all 194 PT sidecars hash-crosswalk while executable payloads remain inert", () => {
  const value = artifact();
  assert.deepEqual(value.replay.embeddings, {
    allCopiedHashesMatch: true, allStepCountsMatchEpisodes: true,
    bytes: 142_678_424, files: 194, metadataCrosswalkRows: 194,
    pickleMembersPresent: 194, picklePayloadsExecuted: 0,
    ptPayloadsDeserialized: 0, publisherTensorMetadataOnly: true,
    tensorStorageMembersPresent: 194, zipArchives: 194, zipEntries: 1_358,
  });
  assert.deepEqual(value.embeddingSafety, {
    allPtBytesAcquiredAndHashCrosswalked: true,
    picklePayloadsExecuted: 0, ptPayloadsDeserialized: 0,
    publisherTensorMetadataReplayedAsClaims: true,
    tensorValuesIndependentlyRecomputed: false,
    zipCentralDirectoriesInspected: true,
  });
});

test("selection, provenance, rights, privacy and authority remain bounded", () => {
  const value = artifact();
  assert.deepEqual(value.selectionSemantics, {
    all194MatchingEmbeddingSidecarsPresent: true,
    all194PublishedFailureSubsetEpisodesPresent: true,
    all388VideosTreeInventoried: true,
    allMetadataAndRootReportsPresent: true,
    completePublishedNoVideoGroup: true,
    completeSourceDatasetAttemptCensus: false,
    publisherFailureOnlySelectionBias: true,
    randomEpisodeTruncation: false,
    selectionSizeUnder300Mb: true,
    successfulSourcePopulationInClosure: false,
    taskGroupTruncation: false,
    videoBytesExcludedByMediaClass: true,
  });
  assert.deepEqual(value.provenance, {
    externalEffectReceiptPresent: false,
    independentPhysicalOutcomeEstablished: false,
    publisherRobotTypeClaim: "Unitree_G1_Inspire",
    realRobotExecutionEstablished: false,
    simulationExecutionEstablished: false,
  });
  assert.deepEqual(value.rights, {
    datasetCardLicenseClaim: "Apache-2.0",
    evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    productionTrainingAuthorized: false,
    readmeYamlLicenseClaim: "Apache-2.0",
    repositoryLicenseFilePresent: false,
    rightsFinallyAdjudicatedForTraining: false,
  });
  assert.deepEqual(value.privacy, {
    absoluteWindowsPathsPresent: true, noPiiEstablished: false,
    privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false,
    publisherAnnotationNotesPresent: true,
    rawAnnotationNotesRepublishedInReport: false,
    rawArtifactPrivate: true, tactilePixelsDecoded: false,
    tactilePngBytesPresent: true, videoBytesAcquired: false,
    videoPixelsInspectedForPeopleOrPii: false,
  });
  assert.deepEqual(value.boundary, {
    CEU: 0, action: 0, authority: 0, delegation: 0, externalEffect: 0,
    independentOutcome: 0, network: 0, privacy: 0, recovery: 0,
    reliableOutcome: 0, training: 0,
  });
});

test("self-resealing cannot promote publisher labels, recovery, payloads or rights", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.labelSemantics.publisherLabelsAreIndependentTaskOutcomes = true; },
    (value) => { value.labelSemantics.episodeFailureMembershipIsIndependentOutcome = true; },
    (value) => { value.labelSemantics.postLabelFramesAreRecoveryExecutions = true; },
    (value) => { value.labelSemantics.recoveryEstablished = true; },
    (value) => { value.selectionSemantics.completeSourceDatasetAttemptCensus = true; },
    (value) => { value.embeddingSafety.ptPayloadsDeserialized = 1; },
    (value) => { value.provenance.realRobotExecutionEstablished = true; },
    (value) => { value.rights.productionTrainingAuthorized = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
    (value) => { value.boundary.authority = 1; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = kgb0FailureArtifactHash(body);
    assert.equal(verifyKgb0FailureArtifact(changed).ok, false);
  }
});

test("the artifact rebuilds exactly and all acquired bytes remain private", () => {
  const original = artifact();
  const rebuilt = buildKgb0FailureArtifactFromSource(SOURCE_DIRECTORY);
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyKgb0FailureArtifact(rebuilt).ok, true);
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(manifest.verification.verificationLevel,
    "FULL_194_PARQUET_194_PT_METADATA_AND_388_VIDEO_INVENTORY_REPLAY");
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 410);
  assert.equal(files.every((file) => (statSync(file).mode & 0o777) === 0o600), true);
  assert.equal(directories.every((directory) =>
    (statSync(directory).mode & 0o777) === 0o700), true);
});
