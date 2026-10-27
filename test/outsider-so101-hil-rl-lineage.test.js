import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  SO101_HIL_RL_PROFILE,
  SO101_HIL_RL_REPOSITORIES,
  acquirePinnedSo101HilRlSource,
  buildSo101HilRlLineageFromSource,
  so101HilRlArtifactHash,
  so101HilRlSha256,
  verifySo101HilRlLineageArtifact,
  verifySo101HilRlSourceDirectory,
} from "../src/outsider-so101-hil-rl-lineage.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-so101-hil-rl-linked-lineage-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "so101-hil-rl-linked-lineage.json");
const ARTIFACT_MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY,
  "artifact-manifest.json");
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:c018b3d67c0ef4b11ded5c570aa29faef8e0fbd92d3d7cb62c9c892d83350b4a";
const EXPECTED_SOURCE_ROOT =
  "sha256:31bd0e7d069a94ad6cd481d21858e3cffae9a67fdb146905299e03ca82c7d367";
const EXPECTED_ARTIFACT_HASH =
  "sha256:25507b78c02777e50baca532364f37a722f69d1adcf1cd2ef3f148123d720806";
const EXPECTED_ARTIFACT_MANIFEST_HASH =
  "sha256:fa47cae2b768e5ba56b580366fa8fe8424839e41bfe96b830c465d04f712d1c3";
const EXPECTED_COMBINED_TREE_HASH =
  "sha256:8a79451d669a77f371608fd13497597f2eb0005d3c7d41deb6543d03abed4328";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function requireArtifact() {
  assert.equal(existsSync(REPORT_PATH), true,
    "pinned linked SO101 HIL/RL artifact must exist");
  return readJson(REPORT_PATH);
}

function walk(root) {
  const files = [];
  const directories = [root];
  for (let index = 0; index < directories.length; index += 1) {
    const directory = directories[index];
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const child = path.join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, `symlink refused: ${child}`);
      if (entry.isDirectory()) directories.push(child);
      else if (entry.isFile()) files.push(child);
      else assert.fail(`special file refused: ${child}`);
    }
  }
  return { files, directories };
}

test("frozen linked SO101 HIL and RL no-video closure is exact", () => {
  assert.deepEqual(SO101_HIL_RL_REPOSITORIES, {
    hil: {
      key: "hil",
      datasetId: "TakuyaHiraoka/so101_pick_diverse_objects_hil_round1",
      revision: "9c6638fd71027d26b98524134436d7443030c48d",
      usedStorageBytes: 461_971_915,
      repositoryFilePaths: 413,
      treeEntries: 426,
      treeFiles: 413,
      treeBytes: 420_322_757,
      readmeBytes: 3_149,
      dataFiles: 49,
      dataBytes: 10_805_341,
      metadataFiles: 52,
      metadataBytes: 3_750_646,
      selectedObjects: 102,
      selectedBytes: 14_559_136,
      mediaFiles: 310,
      mediaBytes: 405_761_117,
      otherExcludedFiles: 1,
      otherExcludedBytes: 2_504,
      episodes: 563,
      frames: 164_795,
      tasks: 30,
    },
    rl: {
      key: "rl",
      datasetId: "TakuyaHiraoka/so101_pick_diverse_objects_rl_round1",
      revision: "1b8ae961e180e288d8e2e043b4026477f613bc85",
      usedStorageBytes: 69_014_270,
      repositoryFilePaths: 41,
      treeEntries: 49,
      treeFiles: 41,
      treeBytes: 69_036_936,
      readmeBytes: 5_211,
      dataFiles: 12,
      dataBytes: 3_364_125,
      metadataFiles: 15,
      metadataBytes: 921_713,
      selectedObjects: 28,
      selectedBytes: 4_291_049,
      mediaFiles: 12,
      mediaBytes: 64_743_383,
      otherExcludedFiles: 1,
      otherExcludedBytes: 2_504,
      episodes: 101,
      frames: 46_016,
      tasks: 2,
      successfulEpisodes: 49,
      failedEpisodes: 52,
    },
  });
  assert.deepEqual(SO101_HIL_RL_PROFILE, {
    repositories: 2,
    treeEntries: 475,
    treeFiles: 454,
    treeBytes: 489_359_693,
    selectedObjects: 130,
    selectedBytes: 18_850_185,
    readmeFiles: 2,
    readmeBytes: 8_360,
    dataFiles: 61,
    dataBytes: 14_169_466,
    metadataFiles: 67,
    metadataBytes: 4_672_359,
    episodes: 664,
    frames: 210_811,
    mediaFilesExcluded: 322,
    mediaBytesExcluded: 470_504_500,
    otherFilesExcluded: 2,
    otherBytesExcluded: 5_008,
    actionDimensions: 6,
    stateDimensions: 6,
  });
  assert.notEqual(SO101_HIL_RL_REPOSITORIES.rl.frames, 46_119,
    "pinned metadata bytes, not the stale preflight number, are authoritative");
});

test("acquirer refuses an existing source before any network request", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "so101-hil-rl-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedSo101HilRlSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /SO101_HIL_RL_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("actual source binds both official records and trees to every selected byte", () => {
  const verified = verifySo101HilRlSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "TWO_PINNED_REPOSITORIES_FULL_TREES_AND_COMPLETE_NO_VIDEO_BYTES");
  const manifest = verified.manifest;
  assert.equal(manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(manifest.combinedInventory.projectionHash,
    EXPECTED_COMBINED_TREE_HASH);
  assert.deepEqual(manifest.combinedInventory.totals, {
    treeEntries: 475,
    treeFiles: 454,
    treeBytes: 489_359_693,
    selectedObjects: 130,
    selectedBytes: 18_850_185,
    mediaFilesExcluded: 322,
    mediaBytesExcluded: 470_504_500,
  });
  assert.equal(manifest.repositories.hil.repositoryPathProjectionHash,
    "sha256:518b7b8701d0f92dbbe456ad98b3e0cccb780e1ee7e6840e5012e1fcd75bb8bc");
  assert.equal(manifest.repositories.rl.repositoryPathProjectionHash,
    "sha256:636b32206ad30e06b9660ff1fe3ed3d8b529a0427589a013ae8566c287e3b36d");
  assert.equal(manifest.apiSnapshots.length, 8);
  assert.equal(manifest.remoteObjects.length, 130);
  assert.equal(manifest.remoteObjects.reduce((sum, item) => sum + item.bytes, 0),
    18_850_185);
  assert.equal(manifest.remoteObjects.filter((item) =>
    item.remotePath.endsWith(".parquet")).length, 124);
  assert.equal(manifest.remoteObjects.some((item) =>
    /\.(?:mp4|png|jpe?g|webm|mov)$/iu.test(item.remotePath)), false);
  assert.deepEqual(manifest.rightsIntake, {
    datasetCardClaims: { hil: "MIT", rl: "MIT" },
    repositoryLicenseFilesPresent: { hil: false, rl: false },
    trainingAuthorized: false,
  });
});

test("all pinned Parquet bytes replay intervention and operator outcome semantics", () => {
  const artifact = requireArtifact();
  assert.equal(artifact.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.deepEqual(artifact.replay.combined, {
    dataFilesReplayed: 61,
    metadataFilesReplayed: 67,
    episodesReplayed: 664,
    framesReplayed: 210_811,
    interventionFrames: 78_986,
  });
  const hil = artifact.replay.repositories.hil;
  assert.equal(hil.episodesReplayed, 563);
  assert.equal(hil.framesReplayed, 164_795);
  assert.equal(hil.taskCount, 30);
  assert.equal(hil.interventionFrames, 77_888);
  assert.equal(hil.episodesWithIntervention, 475);
  assert.equal(hil.dataColumns.join("|"),
    "action|observation.state|is_intervention|timestamp|frame_index|episode_index|index|task_index");
  assert.equal(hil.episodeProjectionHash,
    "sha256:2be6668ad8ecd8e216618b330c594924114534411f393121b0048ddf1c766819");
  const rl = artifact.replay.repositories.rl;
  assert.equal(rl.episodesReplayed, 101);
  assert.equal(rl.framesReplayed, 46_016);
  assert.equal(rl.interventionFrames, 1_098);
  assert.equal(rl.episodesWithIntervention, 5);
  assert.equal(rl.successfulEpisodes, 49);
  assert.equal(rl.failedEpisodes, 52);
  assert.equal(rl.rewardOneFrames, 49);
  assert.equal(rl.doneOneFrames, 101);
  assert.equal(rl.dataColumns.join("|"),
    "action|observation.state|is_intervention|next.reward|next.done|timestamp|frame_index|episode_index|index|task_index");
  assert.equal(rl.episodeProjectionHash,
    "sha256:1b4c999bc221c5a05d8a12691fe9bdd50ed423d78f6583d344217913697f1cda");
  assert.deepEqual(artifact.replay.taskCrosswalk, [
    { rlTaskIndex: 0, rlPrompt: "Pick a pen.", hilTaskIndex: 25,
      hilPrompt: "Pick a pen.", match: "EXACT_PROMPT" },
    { rlTaskIndex: 1, rlPrompt: "Pick Chikawa toy.", hilTaskIndex: 0,
      hilPrompt: "Pick Chikawa toy.", match: "EXACT_PROMPT" },
  ]);
  for (const repository of [hil, rl]) {
    assert.equal(repository.episodeIndexContinuous, true);
    assert.equal(repository.frameIndexContinuousWithinEpisode, true);
    assert.equal(repository.globalIndexContinuous, true);
    assert.equal(repository.timestampCadenceAligned30Fps, true);
    assert.equal(repository.episodeMetadataAligned, true);
    assert.equal(repository.taskMetadataAligned, true);
    assert.equal(repository.infoMetadataAligned, true);
  }
});

test("lineage, outcome, attempt and rights boundaries remain honest", () => {
  const artifact = requireArtifact();
  assert.equal(artifact.admission, "ACQUIRED_EVAL_ONLY");
  assert.equal(artifact.readme.hilCardEpisodeCountClaim, 51);
  assert.equal(artifact.readme.hilPinnedMetadataEpisodeCount, 563);
  assert.equal(artifact.readme.hilCardEpisodeClaimStaleAgainstPinnedMetadata, true);
  assert.equal(artifact.lineage.hilToRlPublisherDeclared, true);
  assert.equal(artifact.lineage.linkedPolicyBytesAcquired, false);
  assert.equal(artifact.lineage.linkedPolicyHashVerified, false);
  assert.equal(artifact.lineage.cryptographicModelLineageEstablished, false);
  assert.equal(artifact.lineage.episodeLevelHilToRlCrosswalkAvailable, false);
  assert.equal(artifact.outcome.hilOutcomeColumnAvailable, false);
  assert.equal(artifact.outcome.hilNarrativePromotedToByteLevelOutcome, false);
  assert.equal(artifact.outcome.rlPublisherSourceNativeOperatorOutcomeAvailable, true);
  assert.equal(artifact.outcome.independentOutcome, 0);
  assert.equal(artifact.outcome.longitudinalOutcome, 0);
  assert.equal(artifact.recovery.perFrameInterventionAvailable, true);
  assert.equal(artifact.recovery.pairedFailureToRetryRecoveryAvailable, false);
  assert.equal(artifact.recovery.discardedAttemptsAvailable, false);
  assert.equal(artifact.recovery.completeAttemptCensus, false);
  assert.equal(artifact.recovery.savedOnlySelectionBias, true);
  assert.deepEqual(artifact.rights, {
    datasetCardClaims: { hil: "MIT", rl: "MIT" },
    pinnedReadmeClaims: { hil: "MIT", rl: "MIT" },
    repositoryLicenseFilesPresent: { hil: false, rl: false },
    productionTrainingRightFinallyAdjudicated: false,
  });
  assert.deepEqual(artifact.boundary, {
    training: 0,
    network: 0,
    CEU: 0,
    authority: 0,
    action: 0,
    opportunity: 0,
    delegation: 0,
    independentOutcome: 0,
    longitudinalOutcome: 0,
  });
});

test("self-resealing cannot promote lineage, outcome, census, rights or authority", () => {
  const artifact = requireArtifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.authority = 1; },
    (value) => { value.boundary.action = 1; },
    (value) => { value.rights.productionTrainingRightFinallyAdjudicated = true; },
    (value) => { value.completeness.visualReplay = true; },
    (value) => { value.completeness.collectionAttemptCensusComplete = true; },
    (value) => { value.lineage.linkedPolicyHashVerified = true; },
    (value) => { value.lineage.cryptographicModelLineageEstablished = true; },
    (value) => { value.lineage.episodeLevelHilToRlCrosswalkAvailable = true; },
    (value) => { value.lineage.exactPromptTaskCrosswalkVerifiedFromPinnedParquet[0]
      .hilTaskIndex = 5; },
    (value) => { value.outcome.hilNarrativePromotedToByteLevelOutcome = true; },
    (value) => { value.outcome.independentOutcome = 1; },
    (value) => { value.recovery.pairedFailureToRetryRecoveryAvailable = true; },
    (value) => { value.recovery.completeAttemptCensus = true; },
    (value) => { value.replay.repositories.rl.successfulEpisodes = 50; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(artifact);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = so101HilRlArtifactHash(body);
    const verified = verifySo101HilRlLineageArtifact(changed);
    assert.equal(verified.ok, false, canonicalizeStrict(changed));
  }
});

test("actual artifact exactly rebuilds from all pinned no-video source bytes", () => {
  const artifact = requireArtifact();
  const rebuilt = buildSo101HilRlLineageFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(artifact));
  const standalone = verifySo101HilRlLineageArtifact(rebuilt);
  assert.equal(standalone.ok, true, standalone.error);
});

test("artifact is private, no-video and frozen by an exact manifest", () => {
  const manifest = readJson(ARTIFACT_MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_ARTIFACT_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(manifest.admission, "ACQUIRED_EVAL_ONLY");
  assert.equal(manifest.visualReplay, false);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, so101HilRlSha256(Buffer.from(
    `outsider/so101-hil-rl-linked-lineage-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")));
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 141);
  assert.equal(files.filter((file) => file.endsWith(".parquet")).length, 124);
  assert.equal(files.some((file) => /\.(?:mp4|png|jpe?g|webm|mov)$/iu.test(file)),
    false);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
  }
});
