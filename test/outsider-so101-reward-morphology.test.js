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
  SO101_REWARD_ID, SO101_REWARD_PROFILE, SO101_REWARD_REVISION,
  acquirePinnedSo101RewardSource, buildSo101RewardAuditFromSource,
  so101RewardArtifactHash, so101RewardSha256, verifySo101RewardAudit,
  verifySo101RewardSourceDirectory,
} from "../src/outsider-so101-reward-morphology.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-so101-reward-morphology-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY, "so101-reward-morphology.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:5ad36720f34cbb0d35de80c84907f3ab7ab39910f4b20d2fd67a0d1de8f6d163";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:95f119bbd33d0ee23e9315b58f41beda7d39fa879977fcba189c7a7ba6a07aa7";
const EXPECTED_SOURCE_ROOT =
  "sha256:d06c350a50cd504f2a9f4735acf2b4f05de7a0265bb394e6031e0c9d427c253a";
const EXPECTED_MANIFEST_HASH =
  "sha256:f916a5b3e359b053b5a2c95b3b42248dcef27feb81d3b3cda6d2c0a074e5f168";

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

test("official revision and six-object no-video profile are frozen", () => {
  assert.equal(SO101_REWARD_ID,
    "aBochen/so101_HIL_pick_lift_15ep004_reward_classifier");
  assert.equal(SO101_REWARD_REVISION,
    "83f82c6baa42e3df696b6465e347c57e80aa3d98");
  assert.deepEqual(SO101_REWARD_PROFILE, {
    usedStorage: 73_752_662,
    treeEntries: 16,
    treeFiles: 8,
    treeBytes: 73_776_302,
    selectedObjects: 6,
    selectedBytes: 511_502,
    excludedVideoObjects: 1,
    excludedVideoBytes: 73_262_296,
    episodes: 15,
    frames: 7_414,
    tasks: 1,
    fps: 30,
    actionDimensions: 4,
    stateDimensions: 18,
  });
});

test("acquirer refuses an existing source before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "so101-reward-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedSo101RewardSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /SO101_REWARD_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("official record and complete tree bind before and after", () => {
  const verified = verifySo101RewardSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_COMPLETE_SO101_REWARD_NO_VIDEO_DATA_AND_META");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 4);
  assert.equal(verified.manifest.remoteObjects.length, 6);
  assert.equal(verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + entry.bytes, 0), 511_502);
  assert.equal(verified.manifest.remoteObjects.some((entry) =>
    entry.path.endsWith(".mp4")), false);
  assert.deepEqual(verified.manifest.closure, {
    selectedObjects: 6,
    selectedBytes: 511_502,
    completeNoVideoDataAndMeta: true,
    rootReadmeSelected: true,
    videosSelected: 0,
    videoObjectsExcluded: 1,
    videoBytesExcluded: 73_262_296,
    gitattributesSelected: false,
  });
});

test("all 15 episodes and 7414 frames replay with exact schema", () => {
  const replay = artifact().replay;
  assert.deepEqual(replay.columns, [
    "action", "next.reward", "next.done",
    "complementary_info.discrete_penalty", "observation.state", "timestamp",
    "frame_index", "episode_index", "index", "task_index",
  ]);
  assert.equal(replay.episodes, 15);
  assert.equal(replay.frames, 7_414);
  assert.equal(replay.tasks, 1);
  assert.equal(replay.fps, 30);
  assert.equal(replay.actionDimensions, 4);
  assert.equal(replay.stateDimensions, 18);
  assert.equal(replay.minimumEpisodeFrames, 371);
  assert.equal(replay.maximumEpisodeFrames, 986);
  assert.equal(replay.episodeAndFrameContinuity, true);
  assert.equal(replay.metadataAligned, true);
  assert.equal(replay.videoColumnsMaterializedInParquet, false);
});

test("reward, done and penalty morphology is byte-native", () => {
  const replay = artifact().replay;
  assert.deepEqual(replay.rewardFrameCounts, { "0.0": 6_499, "1.0": 915 });
  assert.deepEqual(replay.doneFrameCounts, { false: 7_399, true: 15 });
  assert.deepEqual(replay.penaltyFrameCounts, { "0.0": 7_414 });
  assert.equal(replay.positiveRewardEpisodes, 15);
  assert.equal(replay.terminalDoneEpisodes, 15);
  assert.deepEqual(replay.doneTrueFrameIndicesByEpisode, {
    0: [985], 1: [669], 2: [648], 3: [622], 4: [409],
    5: [460], 6: [388], 7: [474], 8: [388], 9: [370],
    10: [381], 11: [408], 12: [401], 13: [411], 14: [385],
  });
});

test("HIL naming, outcome, rights and authority remain bounded", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.deepEqual(value.hil, {
    byteNativeIsInterventionField: false,
    interventionSegmentsRecoverable: false,
    publisherHilNamingPromotedToInterventionFact: false,
    repositoryNameAndTagsMentionHil: true,
  });
  assert.deepEqual(value.outcome, {
    independentOutcome: 0,
    longitudinalOutcome: 0,
    publisherOrOperatorOutcome: true,
    sourceNativeDiscretePenaltyAvailable: true,
    sourceNativeDoneAvailable: true,
    sourceNativeFailureField: false,
    sourceNativeRewardAvailable: true,
    sourceNativeSuccessField: false,
  });
  assert.equal(value.completeness.completePublishedEpisodeCensus, true);
  assert.equal(value.completeness.completeAttemptCensus, false);
  assert.deepEqual(value.rights, {
    datasetCardClaim: "Apache-2.0",
    evaluationUseFinallyAdjudicated: false,
    productionTrainingAllowed: false,
    repositoryLicenseFilePresent: false,
  });
  assert.deepEqual(value.boundary, {
    training: 0, network: 0, CEU: 0, authority: 0, action: 0,
    opportunity: 0, delegation: 0, independentOutcome: 0,
    longitudinalOutcome: 0,
  });
});

test("self-resealing cannot promote HIL naming or publisher outcomes", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.action = 1; },
    (value) => { value.replay.isInterventionFieldPresent = true; },
    (value) => { value.hil.byteNativeIsInterventionField = true; },
    (value) => { value.hil.publisherHilNamingPromotedToInterventionFact = true; },
    (value) => { value.outcome.sourceNativeSuccessField = true; },
    (value) => { value.outcome.independentOutcome = 1; },
    (value) => { value.completeness.completeAttemptCensus = true; },
    (value) => { value.completeness.visualReplay = true; },
    (value) => { value.rights.productionTrainingAllowed = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = so101RewardArtifactHash(body);
    assert.equal(verifySo101RewardAudit(changed).ok, false,
      canonicalizeStrict(changed));
  }
});

test("artifact rebuilds exactly and the closure is private and no-video", () => {
  const original = artifact();
  const rebuilt = buildSo101RewardAuditFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifySo101RewardAudit(rebuilt).ok, true);
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, so101RewardSha256(Buffer.from(
    `outsider/so101-reward-morphology-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")));
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 13);
  assert.equal(directories.length, 11);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
    assert.equal(file.endsWith(".mp4"), false, file);
  }
});
