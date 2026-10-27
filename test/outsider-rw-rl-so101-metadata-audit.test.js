import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "../src/canonical-historical-replay.js";
import {
  RW_RL_DATASET_ID,
  RW_RL_REVISION,
  RW_RL_SO101_COMPLETE_TASK,
  RW_RL_SO101_PROFILE,
  RW_RL_SO101_TASKS,
  acquirePinnedRwRlSo101Source,
  buildRwRlSo101MetadataAuditFromSource,
  rwRlSo101ArtifactHash,
  verifyRwRlSo101MetadataAuditArtifact,
  verifyRwRlSo101SourceDirectory,
} from "../src/outsider-rw-rl-so101-metadata-audit.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-rw-rl-so101-metadata-audit-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "rw-rl-so101-metadata-audit.json");
const ARTIFACT_MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY,
  "artifact-manifest.json");
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:62e12bfb17235fac77e643b8ebf7dc56b4500993106df690bacff1e5636939bb";
const EXPECTED_SOURCE_ROOT =
  "sha256:91ccd56612941b48e118bd9e9667df5f3f3107d0f9c8a09698c20ba44504cba0";
const EXPECTED_ARTIFACT_HASH =
  "sha256:12e228c2fe296b7c9fbe83c33bb96d0ba9ef7a7bba91d9be0a8ae2c0a7599e12";
const EXPECTED_ARTIFACT_MANIFEST_HASH =
  "sha256:1bf88795b3e79f040c1b846c9eb2691855fec39b86a993012663ee9f615ac287";
const EXPECTED_ALL_TREE_PROJECTION_HASH =
  "sha256:e9c02f3173a7900b781d6c1e2852e0bd4e46b4ceef717efb793d18b2b9c9c183";
const EXPECTED_REPOSITORY_PATH_PROJECTION_HASH =
  "sha256:199f724dbfa21095912164fe33522905ea5a4603f0d7594cb1f90cd880434eb4";

function readJson(file) {
  return JSON.parse(readFileSync(file, "utf8"));
}

function requireArtifact() {
  assert.equal(existsSync(REPORT_PATH), true,
    "pinned RW-RL SO101 audit artifact must exist");
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

test("frozen RW-RL SO101 metadata-first closure is exact", () => {
  assert.equal(RW_RL_DATASET_ID, "MINT-SJTU/RW-RL-Dataset");
  assert.equal(RW_RL_REVISION,
    "f64b5e765883a12d6e4c3386ddc06c86b67509d9");
  assert.equal(RW_RL_SO101_COMPLETE_TASK,
    "so101_fold_clothes_left_stack_right");
  assert.equal(RW_RL_SO101_TASKS.length, 6);
  assert.deepEqual(RW_RL_SO101_PROFILE, {
    repositoryUsedStorageBytes: 2_165_418_040_578,
    repositoryFilePaths: 99_622,
    taskCount: 6,
    treeEntries: 17_900,
    treeFiles: 17_824,
    treeBytes: 398_014_413_569,
    episodes: 4_450,
    dataFiles: 4_450,
    dataBytes: 901_032_696,
    metadataFiles: 24,
    metadataBytes: 9_530_648,
    videoFiles: 13_350,
    videoBytes: 397_103_850_225,
    completeTaskDataFiles: 449,
    completeTaskDataBytes: 208_479_584,
    completeTaskEpisodes: 449,
    completeTaskFrames: 5_085_540,
    crossTaskSchemaProbeFiles: 5,
    crossTaskSchemaProbeBytes: 1_107_520,
    readmeFiles: 1,
    readmeBytes: 16_908,
    selectedObjects: 479,
    selectedBytes: 219_134_660,
    actionDimensions: 12,
    stateDimensions: 12,
  });
});

test("acquirer refuses an existing source before any network request", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "rw-rl-so101-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(
      acquirePinnedRwRlSo101Source(target, {
        fetchImpl: async () => { fetches += 1; throw new Error("should not fetch"); },
      }),
      /RW_RL_SO101_SOURCE_EXISTS/u,
    );
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("actual source binds repository, all SO101 trees, selected bytes and exclusions", () => {
  const verified = verifyRwRlSo101SourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_REPOSITORY_AND_ALL_SO101_TREE_PLUS_SELECTED_BYTES");
  const manifest = verified.manifest;
  assert.equal(manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(manifest.repository.repositoryFilePaths, 99_622);
  assert.equal(manifest.repository.repositoryPathProjectionHash,
    EXPECTED_REPOSITORY_PATH_PROJECTION_HASH);
  assert.equal(manifest.repository.datasetCardLicenseDeclared, false);
  assert.equal(manifest.repository.datasetRepositoryLicenseFilePresent, false);
  assert.equal(manifest.allSo101Inventory.projectionHash,
    EXPECTED_ALL_TREE_PROJECTION_HASH);
  assert.equal(manifest.allSo101Inventory.tasks.length, 6);
  assert.deepEqual(manifest.allSo101Inventory.totals, {
    entries: 17_900,
    files: 17_824,
    bytes: 398_014_413_569,
    dataFiles: 4_450,
    dataBytes: 901_032_696,
    metadataFiles: 24,
    metadataBytes: 9_530_648,
    videoFiles: 13_350,
    videoBytes: 397_103_850_225,
  });
  assert.equal(manifest.apiSnapshots.length, 46);
  assert.equal(manifest.apiSnapshots.filter((item) => item.path.includes("-before"))
    .length, 23);
  assert.equal(manifest.apiSnapshots.filter((item) => item.path.includes("-after"))
    .length, 23);
  assert.equal(manifest.remoteObjects.length, 479);
  assert.equal(manifest.remoteObjects.reduce((sum, item) => sum + item.bytes, 0),
    219_134_660);
  assert.equal(manifest.remoteObjects.some((item) => item.path.endsWith(".mp4")),
    false);
  assert.equal(manifest.exclusions.videos.objectsRecordedButNotFetched, 13_350);
  assert.equal(manifest.exclusions.videos.bytesRecordedButNotFetched,
    397_103_850_225);
});

test("actual Parquet bytes expose state/action but no intervention, reward, done or regime", () => {
  const artifact = requireArtifact();
  assert.equal(artifact.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(artifact.replay.metadataFilesReplayed, 24);
  assert.equal(artifact.replay.tasksAudited.length, 6);
  assert.equal(artifact.replay.completeTask.dataFilesReplayed, 449);
  assert.equal(artifact.replay.completeTask.episodesReplayed, 449);
  assert.equal(artifact.replay.completeTask.framesReplayed, 5_085_540);
  assert.equal(artifact.replay.completeTask.episodeFrameIndexContinuous, true);
  assert.equal(artifact.replay.completeTask.globalIndexContinuous, true);
  assert.equal(artifact.replay.completeTask.timestampCadenceAligned30Fps, true);
  assert.equal(artifact.replay.completeTask.actionDimensions, 12);
  assert.equal(artifact.replay.completeTask.stateDimensions, 12);
  assert.deepEqual(artifact.replay.completeTask.dataSignalFieldMatches, []);
  assert.equal(artifact.replay.crossTaskSchemaProbes.length, 6);
  assert.equal(artifact.replay.crossTaskSchemaProbes.every((item) =>
    item.columns.join("|")
      === "action|observation.state|timestamp|frame_index|episode_index|index|task_index"),
  true);
  assert.deepEqual(artifact.replay.actualSelectedByteFieldAudit, {
    intervention: false,
    reward: false,
    done: false,
    success: false,
    outcome: false,
    dataRegime: false,
  });
  assert.equal(artifact.fieldConclusion.usableAsOutcomeOrRecoveryEvidence, false);
});

test("rights and capability boundary remain fail-closed quarantine", () => {
  const artifact = requireArtifact();
  assert.equal(artifact.admission, "QUARANTINE_EVAL");
  assert.deepEqual(artifact.rights, {
    status: "FAIL_CLOSED_QUARANTINE_EVAL",
    datasetCardLicenseDeclared: false,
    pinnedReadmeFrontmatterLicenseDeclared: false,
    datasetRepositoryLicenseFilePresent: false,
    linkedCodeRepositoryApacheLicenseExtendedToDataset: false,
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
  assert.equal(artifact.completeness.visualReplay, false);
  assert.equal(artifact.completeness.allSo101DataEpisodesAcquired, false);
  assert.equal(artifact.completeness.attemptOutcomeCensusAvailable, false);
  assert.equal(artifact.completeness.interventionRecoveryPairsAvailable, false);
});

test("self-resealing cannot promote rights, fields, outcomes or authority", () => {
  const artifact = requireArtifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.authority = 1; },
    (value) => { value.boundary.action = 1; },
    (value) => { value.rights.productionTrainingRightFinallyAdjudicated = true; },
    (value) => { value.fieldConclusion.selectedActualParquetBytesExposeReward = true; },
    (value) => { value.fieldConclusion.usableAsOutcomeOrRecoveryEvidence = true; },
    (value) => { value.completeness.interventionRecoveryPairsAvailable = true; },
    (value) => { value.outcome.publisherSourceNativeOutcomeAvailable = true; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(artifact);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = rwRlSo101ArtifactHash(body);
    const verified = verifyRwRlSo101MetadataAuditArtifact(changed);
    assert.equal(verified.ok, false, canonicalizeStrict(changed));
  }
});

test("actual artifact exactly rebuilds from the pinned bounded source", () => {
  const artifact = requireArtifact();
  const rebuilt = buildRwRlSo101MetadataAuditFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: process.env.OUTSIDER_PYTHON ?? ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(artifact));
  const standalone = verifyRwRlSo101MetadataAuditArtifact(rebuilt);
  assert.equal(standalone.ok, true, standalone.error);
});

test("artifact is private, no-video and has an exact frozen manifest", () => {
  const manifest = readJson(ARTIFACT_MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_ARTIFACT_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(manifest.admission, "QUARANTINE_EVAL");
  assert.equal(manifest.visualReplay, false);
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 528);
  assert.equal(files.filter((file) => file.endsWith(".parquet")).length, 466);
  assert.equal(files.some((file) => /\.(?:mp4|avi|mov|mkv|webm)$/iu.test(file)),
    false);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
  }
});
