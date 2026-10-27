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
  SO101_RECOVERY_DATASET_ID, SO101_RECOVERY_DATASET_REVISION,
  SO101_RECOVERY_MODEL_ID, SO101_RECOVERY_MODEL_REVISION,
  SO101_RECOVERY_PROFILE, acquirePinnedSo101RecoverySource,
  buildSo101RecoveryClaimAuditFromSource, so101RecoveryArtifactHash,
  so101RecoverySha256, verifySo101RecoveryClaimAudit,
  verifySo101RecoverySourceDirectory,
} from "../src/outsider-so101-recovery-claim-audit.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-so101-recovery-claim-audit-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY, "so101-recovery-claim-audit.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:1dfdca6fb3ba947b1bcdfdaa316659917561d5f58362183f69d9b7bfb4ccfe05";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:365f8d7d9c63f88e8988ad35963626ea31d5ef883ecf76d0b69a723b99cf817d";
const EXPECTED_SOURCE_ROOT =
  "sha256:a090d7f9b73a49617d9f48ea22dd21f9a0dfe23eb13b8dd9d7b32dcc875b0d2b";
const EXPECTED_MANIFEST_HASH =
  "sha256:d8fad4344ee1d49fb52a283f658d0251bb01fcf225df3157080ba8a6adbbefcb";

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

test("dataset and publisher model card are pinned independently", () => {
  assert.equal(SO101_RECOVERY_DATASET_ID,
    "BrutalCaesar/phi_so101_cubes_cylinder_recovery_v1");
  assert.equal(SO101_RECOVERY_DATASET_REVISION,
    "cf44c0993c77e89629fd1e598088eef8187845c9");
  assert.equal(SO101_RECOVERY_MODEL_ID,
    "BrutalCaesar/dp_so101_cubcyl_recovery_tp48_lerobot_3cam");
  assert.equal(SO101_RECOVERY_MODEL_REVISION,
    "ed3a6ce4d293c974d45e619a44bc87821cd5742b");
  assert.deepEqual(SO101_RECOVERY_PROFILE, {
    selectedObjects: 13,
    selectedBytes: 2_940_279,
    datasetObjects: 12,
    modelCardObjects: 1,
    episodes: 143,
    frames: 81_943,
    tasks: 1,
    dataFiles: 7,
    stateDimensions: 6,
    actionDimensions: 6,
    fps: 30,
    publisherClaimCleanEpisodes: 120,
    publisherClaimFailureThenRecoveryEpisodes: 23,
    countCompatibleSuffixStartEpisode: 120,
    countCompatibleSuffixFrames: 15_070,
  });
});

test("acquirer refuses an existing source before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "so101-recovery-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedSo101RecoverySource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /SO101_RECOVERY_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("source binds both official records and trees before and after", () => {
  const verified = verifySo101RecoverySourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_DATASET_NO_VIDEO_AND_PINNED_MODEL_CARD_SUPPORT");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 8);
  assert.equal(verified.manifest.remoteObjects.length, 13);
  assert.equal(verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + entry.bytes, 0), 2_940_279);
  assert.equal(verified.manifest.remoteObjects.some((entry) =>
    /\.(?:mp4|safetensors)$/iu.test(entry.path)), false);
  assert.deepEqual(verified.manifest.closure, {
    selectedObjects: 13,
    selectedBytes: 2_940_279,
    datasetNoVideoComplete: true,
    modelCardReadmeOnly: true,
    videosSelected: 0,
    modelWeightsSelected: 0,
  });
});

test("all 143 episodes and 81943 frames replay with exact continuity", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(value.replay.episodes, 143);
  assert.equal(value.replay.frames, 81_943);
  assert.equal(value.replay.dataFiles, 7);
  assert.deepEqual(value.replay.rowsPerDataFile,
    [6_384, 20_888, 15_546, 21_272, 2_783, 2_069, 13_001]);
  assert.equal(value.replay.episodeAndFrameContinuity, true);
  assert.equal(value.replay.metadataAligned, true);
  assert.equal(value.replay.actionDimensions, 6);
  assert.equal(value.replay.stateDimensions, 6);
  assert.deepEqual(value.replay.semanticFields, {
    done: false, failure: false, isIntervention: false,
    recovery: false, reward: false, success: false,
  });
});

test("23-count suffix is reported as morphology, not recovery truth", () => {
  const value = artifact();
  assert.deepEqual(value.replay.countCompatiblePartition, {
    prefix: { episodeStart: 0, episodeEndInclusive: 119, episodes: 120,
      frames: 66_873, minimumFrames: 403, maximumFrames: 741 },
    suffix: { episodeStart: 120, episodeEndInclusive: 142, episodes: 23,
      frames: 15_070, minimumFrames: 511, maximumFrames: 750 },
    suffixStartsAtPhysicalDataFileBoundary: true,
  });
  assert.equal(value.publisher.datasetCardContainsRecoveryClaim, false);
  assert.equal(value.publisher.modelCardLinksExactDatasetId, true);
  assert.equal(value.publisher.modelCardClaimsCleanEpisodes, 120);
  assert.equal(value.publisher.modelCardClaimsFailureThenRecoveryEpisodes, 23);
  assert.equal(value.publisher.modelCardStatesNotScoredOnArm, true);
  assert.deepEqual(value.recoveryClaimConclusion, {
    publisherClaimCountsCloseAgainst143Episodes: true,
    countCompatibleContiguousSuffixExists: true,
    countCompatibleSuffixEpisodes: [120, 142],
    suffixSeparatedAtPhysicalDataFileBoundary: true,
    recoveryFieldPresentInDatasetBytes: false,
    recoveryEpisodeIdentitiesByteProven: false,
    suffixClassifiedAsRecoveryByThisAudit: false,
    modelCardClaimPromotedToSourceNativeLabel: false,
  });
});

test("outcome, census, privacy, rights and authority remain bounded", () => {
  const value = artifact();
  assert.deepEqual(value.outcome, {
    datasetOutcomeLabelsPresent: false,
    modelOnArmSuccessRatePresent: false,
    independentOutcome: 0,
    longitudinalOutcome: 0,
  });
  assert.deepEqual(value.recovery, {
    publisherAggregateClaimAvailable: true,
    byteNativeRecoveryMarkerAvailable: false,
    pairedFailureToRecoveryBoundaryAvailable: false,
    completeAttemptCensus: false,
    upstreamDiscardedAttemptsUnknown: true,
  });
  assert.equal(value.completeness.modelWeightsAcquired, false);
  assert.equal(value.completeness.videosAcquired, false);
  assert.equal(value.completeness.visualReplay, false);
  assert.deepEqual(value.rights, {
    datasetCardClaim: "Apache-2.0",
    modelCardClaim: "Apache-2.0",
    repositoryLicenseFilesPresent: false,
    productionTrainingRightFinallyAdjudicated: false,
  });
  assert.deepEqual(value.boundary, {
    training: 0, network: 0, CEU: 0, authority: 0, action: 0,
    opportunity: 0, delegation: 0, independentOutcome: 0,
    longitudinalOutcome: 0,
  });
});

test("self-resealing cannot turn publisher counts into byte-native recovery", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.authority = 1; },
    (value) => { value.outcome.independentOutcome = 1; },
    (value) => { value.recovery.byteNativeRecoveryMarkerAvailable = true; },
    (value) => { value.recovery.pairedFailureToRecoveryBoundaryAvailable = true; },
    (value) => { value.recovery.completeAttemptCensus = true; },
    (value) => { value.recoveryClaimConclusion.recoveryEpisodeIdentitiesByteProven = true; },
    (value) => { value.recoveryClaimConclusion.suffixClassifiedAsRecoveryByThisAudit = true; },
    (value) => { value.recoveryClaimConclusion.modelCardClaimPromotedToSourceNativeLabel = true; },
    (value) => { value.completeness.visualReplay = true; },
    (value) => { value.completeness.modelWeightsAcquired = true; },
    (value) => { value.rights.productionTrainingRightFinallyAdjudicated = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = so101RecoveryArtifactHash(body);
    assert.equal(verifySo101RecoveryClaimAudit(changed).ok, false,
      canonicalizeStrict(changed));
  }
});

test("artifact rebuilds exactly and the closure is private and no-video", () => {
  const original = artifact();
  const rebuilt = buildSo101RecoveryClaimAuditFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifySo101RecoveryClaimAudit(rebuilt).ok, true);
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, so101RecoverySha256(Buffer.from(
    `outsider/so101-recovery-claim-audit-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")));
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 24);
  assert.equal(directories.length, 13);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
    assert.equal(/\.(?:mp4|safetensors)$/iu.test(file), false, file);
  }
});

