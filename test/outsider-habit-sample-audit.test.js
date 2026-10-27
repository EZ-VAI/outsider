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
  HABIT_DATASET_ID, HABIT_REQUESTED_REVISION, HABIT_REVISION,
  HABIT_SAMPLE_PROFILE, acquirePinnedHabitSampleSource,
  buildHabitSampleAuditFromSource, habitSampleArtifactHash, habitSha256,
  verifyHabitSampleAuditArtifact, verifyHabitSampleSourceDirectory,
} from "../src/outsider-habit-sample-audit.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-habit-sample-audit-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY, "habit-sample-audit.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:cfa897c876193e5076c6e55d748766b58f909a9ab4c145972061417ba11210fd";
const EXPECTED_SOURCE_ROOT =
  "sha256:32ac692a3e098010681a32bdb292b9426549c68e97d835caeb4b0feb71445128";
const EXPECTED_ARTIFACT_HASH =
  "sha256:24dcfe53897d95a82d9b2c36082ba0c73656b2cab05d1ff84419d3db7585cf63";
const EXPECTED_MANIFEST_HASH =
  "sha256:65ad4464266285127f64b5b87125c3125d6990d721709ea6b0de9340313e475a";

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

test("HABIT resolves the supplied prefix and freezes the complete sample", () => {
  assert.equal(HABIT_DATASET_ID, "configinc/HABIT");
  assert.equal(HABIT_REQUESTED_REVISION,
    "bae97d251907743f8fb6db7e70c61d361df4dc1");
  assert.equal(HABIT_REQUESTED_REVISION.length, 39);
  assert.equal(HABIT_REVISION,
    "bae97d251907743f8fb6db7e70c61d361df4dc1e");
  assert.equal(HABIT_REVISION.length, 40);
  assert.deepEqual(HABIT_SAMPLE_PROFILE, {
    repositoryUsedStorageBytes: 250_134_941_418,
    repositoryFilePaths: 63_880,
    repositoryFullPaths: 63_385,
    repositorySamplePaths: 367,
    repositoryFigurePaths: 66,
    repositoryTaskDetailPaths: 60,
    rootTreeEntries: 6,
    rootTreeFiles: 2,
    rootTreeBytes: 18_044,
    sampleTreeEntries: 377,
    sampleTreeFiles: 367,
    sampleTreeBytes: 1_499_293_321,
    dataFiles: 60,
    dataBytes: 105_021_911,
    metadataFiles: 7,
    metadataBytes: 174_960,
    readmeFiles: 1,
    readmeBytes: 15_540,
    selectedObjects: 68,
    selectedBytes: 105_212_411,
    videosExcluded: 300,
    videoBytesExcluded: 1_394_096_450,
    episodes: 60,
    frames: 35_529,
    metadataTasks: 58,
    publisherFullDatasetEpisodes: 10_563,
    publisherFullDatasetTasks: 60,
    actionDimensions: 14,
    stateDimensions: 14,
    fps: 10,
  });
});

test("acquirer refuses an existing source without fetching", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "habit-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedHabitSampleSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /HABIT_SAMPLE_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("source binds official record, root and complete sample trees to 68 objects", () => {
  const verified = verifyHabitSampleSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_REPOSITORY_ROOT_SAMPLE_TREES_AND_COMPLETE_SAMPLE_NO_VIDEO_BYTES");
  const manifest = verified.manifest;
  assert.equal(manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(manifest.repository.revision, HABIT_REVISION);
  assert.equal(manifest.repository.repositoryFilePaths, 63_880);
  assert.deepEqual(manifest.repository.prefixCounts, {
    full: 63_385, sample: 367, figures: 66, taskDetails: 60, root: 2,
  });
  assert.equal(manifest.repository.repositoryPathProjectionHash,
    "sha256:28937601dc19f350e63ff680a67eda63dd30dc9d5a9de6f70521323d626fa762");
  assert.equal(manifest.rootTree.projectionHash,
    "sha256:51606505be48ebd798b0dd00667f0810a372223607f086d2abd708089cc535f9");
  assert.equal(manifest.sampleTree.projectionHash,
    "sha256:67185a615e2019a02c8b4c778c2bd4a42019f4669d24c86828cde7d3791312c8");
  assert.deepEqual(manifest.sampleTree.firstExpandedPageDataPrefix,
    { files: 40, bytes: 67_502_409, completeSample: false });
  assert.deepEqual(manifest.sampleTree.data, { files: 60, bytes: 105_021_911 });
  assert.deepEqual(manifest.sampleTree.metadata, { files: 7, bytes: 174_960 });
  assert.deepEqual(manifest.sampleTree.videosExcluded,
    { files: 300, bytes: 1_394_096_450 });
  assert.equal(manifest.remoteObjects.length, 68);
  assert.equal(manifest.remoteObjects.reduce((sum, item) => sum + item.bytes, 0),
    105_212_411);
  assert.equal(manifest.remoteObjects.filter((item) => item.path.endsWith(".parquet"))
    .length, 60);
  assert.equal(manifest.remoteObjects.some((item) => item.path.endsWith(".mp4")), false);
});

test("all 60 Parquets replay explicit signals, sources, subtasks and dual-arm state", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(value.replay.episodesReplayed, 60);
  assert.equal(value.replay.framesReplayed, 35_529);
  assert.deepEqual(value.replay.signals, {
    intervention: { frames: 4_722, episodes: 9, segments: 9 },
    error: { frames: 0, episodes: 0, segments: 0 },
    highJerk: { frames: 0, episodes: 0, segments: 0 },
  });
  assert.deepEqual(value.replay.actionSource, {
    robot0Counts: { policy: 8, teleop: 35_521 },
    robot1Counts: { policy: 8, teleop: 35_521 },
    robot0Transitions: 8,
    robot1Transitions: 8,
    robot0EpisodesWithTransition: 8,
    robot1EpisodesWithTransition: 8,
    crossArmDisagreementFrames: 0,
    interventionEqualsBothArmsTeleopFrames: 4_730,
    interventionEqualsBothArmsTeleopForEveryFrame: false,
  });
  assert.deepEqual(value.replay.subtaskTransitions, { robot: 143, human: 155 });
  assert.equal(value.replay.schema.parquetColumnCount, 124);
  assert.equal(value.replay.schema.infoFeatureCount, 76);
  assert.equal(value.replay.schema.overlapCount, 71);
  assert.equal(value.replay.schema.rawParquetOnlyColumnCount, 53);
  assert.equal(value.replay.schema.metadataOnlyFieldCount, 5);
  assert.equal(value.replay.schema.identicalFieldTypeSchemaAcrossAllEpisodes, true);
  assert.equal(value.replay.schema.columnOrderVariantCount, 8);
  assert.equal(value.replay.schema.identicalColumnOrderAcrossAllEpisodes, false);
  assert.equal(value.replay.schema.infoDeclaresSignalsBoolButPhysicalParquetUsesInt64,
    true);
  assert.equal(value.replay.schema.dualFrankaStateActionAndTorqueFieldsValidated,
    true);
  assert.deepEqual(value.replay.schema.directYieldingFields, []);
  assert.equal(value.replay.episodeProjectionHash,
    "sha256:8a296c38549c7d40cedf85da2ba0b8801b12e6b5b78ed5e382b43da363c4d67e");
  assert.equal(value.replay.episodes.length, 60);
  assert.equal(value.replay.taskAggregates.length, 58);
});

test("pagination, sample scope, outcome, privacy and rights remain bounded", () => {
  const value = artifact();
  assert.deepEqual(value.paginationCorrection, {
    firstExpandedApiPageDataFiles: 40,
    firstExpandedApiPageDataBytes: 67_502_409,
    firstExpandedApiPageWasCompleteSample: false,
    pinnedCompleteSampleDataFiles: 60,
    pinnedCompleteSampleDataBytes: 105_021_911,
    missingIfFirstPageMistakenForComplete: { files: 20, bytes: 37_519_502 },
  });
  assert.equal(value.sampleScope.samplePromotedToFullDatasetCensus, false);
  assert.equal(value.sampleScope.fullDatasetBytesAcquired, false);
  assert.equal(value.readme.sampleTaskClaim, 60);
  assert.equal(value.readme.pinnedSampleMetadataTaskRows, 58);
  assert.equal(value.readme.sampleTaskNarrativeMatchesPinnedTaskRows, false);
  assert.equal(value.fieldConclusion.directYieldingByteField, false);
  assert.equal(value.fieldConclusion.yieldingOnlyPublisherNarrative, true);
  assert.equal(value.fieldConclusion.interventionAutomaticallyClassifiedAsYielding,
    false);
  assert.equal(value.outcome.publisherSuccessfulSampleEpisodes, 60);
  assert.equal(value.outcome.outcomeColumnInFrameParquet, false);
  assert.equal(value.outcome.terminalDoneIsNotSuccessOutcome, true);
  assert.equal(value.outcome.independentOutcome, 0);
  assert.equal(value.recovery.explicitFailureToRecoveryPairsAvailable, false);
  assert.equal(value.recovery.completeCollectionAttemptCensus, false);
  assert.deepEqual(value.privacy, {
    coPresentHumanPublisherDeclaredEveryEpisode: true,
    humanCameraVideoAcquired: false,
    privacyReviewComplete: false,
    noPersonalInformationGuarantee: false,
    publicAvailabilityResolvesPrivacy: false,
  });
  assert.deepEqual(value.rights, {
    datasetCardClaim: "CC-BY-4.0",
    pinnedReadmeClaim: "CC-BY-4.0",
    repositoryLicenseFilePresent: false,
    productionTrainingRightFinallyAdjudicated: false,
  });
  assert.deepEqual(value.boundary, {
    training: 0, network: 0, CEU: 0, authority: 0, action: 0,
    opportunity: 0, delegation: 0, independentOutcome: 0,
    longitudinalOutcome: 0,
  });
});

test("self-resealing cannot promote scope, yielding, privacy, outcome or authority", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.authority = 1; },
    (value) => { value.boundary.action = 1; },
    (value) => { value.paginationCorrection.firstExpandedApiPageWasCompleteSample = true; },
    (value) => { value.sampleScope.samplePromotedToFullDatasetCensus = true; },
    (value) => { value.sampleScope.fullDatasetBytesAcquired = true; },
    (value) => { value.fieldConclusion.directYieldingByteField = true; },
    (value) => { value.fieldConclusion.interventionAutomaticallyClassifiedAsYielding = true; },
    (value) => { value.outcome.independentOutcome = 1; },
    (value) => { value.recovery.completeCollectionAttemptCensus = true; },
    (value) => { value.completeness.visualReplay = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
    (value) => { value.privacy.noPersonalInformationGuarantee = true; },
    (value) => { value.rights.productionTrainingRightFinallyAdjudicated = true; },
    (value) => { value.replay.signals.error.frames = 1; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = habitSampleArtifactHash(body);
    assert.equal(verifyHabitSampleAuditArtifact(changed).ok, false,
      canonicalizeStrict(changed));
  }
});

test("artifact rebuilds exactly from the complete pinned sample bytes", () => {
  const original = artifact();
  const rebuilt = buildHabitSampleAuditFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyHabitSampleAuditArtifact(rebuilt).ok, true);
});

test("artifact tree is private, no-video and exactly manifested", () => {
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, habitSha256(Buffer.from(
    `outsider/habit-sample-audit-artifact-manifest/v1\0${canonicalizeStrict(body)}`,
    "utf8")));
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 77);
  assert.equal(files.filter((file) => file.endsWith(".parquet")).length, 60);
  assert.equal(files.some((file) => file.endsWith(".mp4")), false);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) assert.equal(statSync(file).mode & 0o777, 0o600, file);
});
