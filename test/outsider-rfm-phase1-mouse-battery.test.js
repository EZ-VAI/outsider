import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalizeStrictBoundedArtifact as canonicalizeStrict } from "../src/canonical-historical-replay.js";
import {
  RFM_PHASE1_ID, RFM_PHASE1_PROFILE, RFM_PHASE1_REVISION,
  acquirePinnedRfmPhase1Source, buildRfmPhase1AuditFromSource,
  rfmPhase1ArtifactHash, rfmPhase1Sha256, verifyRfmPhase1Audit,
  verifyRfmPhase1SourceDirectory,
} from "../src/outsider-rfm-phase1-mouse-battery.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-rfm-phase1-mouse-battery-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "rfm-phase1-mouse-battery.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:78aa30fed470fea335c4bf076f5bd90b5f9b50af97562071a09f05276d6ca5e0";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:130a0681e5d88c4e61b740c7adceb4426992bcc723d4eb8f461029a0f7328bd2";
const EXPECTED_SOURCE_ROOT =
  "sha256:2a274b892f368f218e803208f084afcc9f88389186b7c64b1c9cb0aa7a9f91b6";
const EXPECTED_MANIFEST_HASH =
  "sha256:fbf23cfe772e77bc00e92577c26f2daa3f3fabff4e962196409e56f24db29bd7";

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

test("official revision, full tree and smallest bounded task are frozen", () => {
  assert.equal(RFM_PHASE1_ID,
    "Posttraining-RFM-RSS2026/Challenge-phase1-dataset");
  assert.equal(RFM_PHASE1_REVISION,
    "71c595336c336b50afb08ebb17c206d8625b5606");
  assert.deepEqual(RFM_PHASE1_PROFILE, {
    usedStorageBytes: 23_878_206_905,
    treeLogicalBytes: 101_586_346_251,
    repositoryFiles: 12_874,
    treeEntries: 12_963,
    treeDirectories: 89,
    treePages: 13,
    repositoryProjectionHash:
      "sha256:8fe91856ddb55b1540661c79e526a8de07fcddae93e610ec153c9e7bbf584475",
    treeProjectionHash:
      "sha256:d5b96506c7298491cf270efe18cf06053fa1f2f9f08a22293a5a723426ff4ffd",
    task: "insert-mouse-battery",
    selectedObjects: 298,
    selectedBytes: 81_902_279,
    selectedParquets: 289,
    selectedMetaObjects: 8,
    failureEpisodes: 125,
    failureFrames: 314_899,
    failureObjects: 129,
    failureBytes: 26_057_872,
    successHilEpisodes: 164,
    successHilFrames: 692_068,
    successHilObjects: 168,
    successHilBytes: 55_836_534,
    stateDimensions: 14,
    actionDimensions: 14,
    fps: 60,
  });
});

test("acquirer refuses an existing source before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "rfm-phase1-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedRfmPhase1Source(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /RFM_PHASE1_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("all 13 official tree pages bind before and after around 298 objects", () => {
  const verified = verifyRfmPhase1SourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_FULL_13_PAGE_TREE_AND_COMPLETE_MOUSE_BATTERY_NO_VIDEO_BYTES");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 28);
  assert.equal(verified.manifest.apiSnapshots.filter((entry) =>
    entry.kind === "tree").length, 26);
  assert.equal(verified.manifest.remoteObjects.length, 298);
  assert.equal(verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + entry.bytes, 0), 81_902_279);
  assert.equal(verified.manifest.remoteObjects.some((entry) =>
    entry.path.includes("/videos/") || entry.path.endsWith(".mp4")), false);
  assert.deepEqual(verified.manifest.fullRepository, {
    usedStorageBytes: 23_878_206_905,
    treeLogicalBytes: 101_586_346_251,
    treePages: 13,
    treeEntries: 12_963,
    repositoryFiles: 12_874,
  });
  assert.deepEqual(verified.manifest.closure, {
    selectedTask: "insert-mouse-battery",
    selectedModes: ["failure-data", "success-and-hil-data"],
    selectedObjects: 298,
    selectedBytes: 81_902_279,
    selectedParquets: 289,
    selectedMetaObjects: 8,
    rootReadmeObjects: 1,
    videosSelected: 0,
    completeFailureNoVideoSubset: true,
    completeSuccessHilNoVideoSubset: true,
  });
});

test("failure bytes contradict the card's single-regime simplification", () => {
  const failure = artifact().replay.failure;
  assert.equal(failure.episodes, 125);
  assert.equal(failure.frames, 314_899);
  assert.equal(failure.parquetFiles, 125);
  assert.equal(failure.metadataAligned, true);
  assert.equal(failure.episodeFrameAndGlobalIndexContinuity, true);
  assert.deepEqual(failure.commanderStateFrameCounts, {
    align: 1_276,
    inference: 301_512,
    pre_teleop: 14,
    restore: 11_862,
    teleop: 235,
  });
  assert.equal(failure.hilEpisodes, 1);
  assert.deepEqual(failure.modeTransitionCounts, {
    "align->pre_teleop": 1,
    "align->restore": 5,
    "inference->align": 16,
    "inference->restore": 104,
    "pre_teleop->teleop": 1,
    "teleop->restore": 1,
  });
  assert.deepEqual(failure.rewardFrameCounts,
    { "-1.0": 314_774, "-2000.0": 125 });
  assert.equal(failure.mcapPathPresentFrames, 314_899);
  assert.equal(failure.mcapPathValuesRepublished, false);
});

test("success/HIL bytes recover exact takeover morphology", () => {
  const success = artifact().replay.successHil;
  assert.equal(success.episodes, 164);
  assert.equal(success.frames, 692_068);
  assert.equal(success.parquetFiles, 164);
  assert.equal(success.hilEpisodes, 128);
  assert.equal(success.inferenceOnlyEpisodes, 36);
  assert.equal(success.teleopOnlyEpisodes, 0);
  assert.deepEqual(success.commanderStateFrameCounts,
    { inference: 421_865, teleop: 270_203 });
  assert.deepEqual(success.modeTransitionCounts,
    { "inference->teleop": 173, "teleop->inference": 165 });
  assert.equal(success.inferenceToTeleopBoundaries, 173);
  assert.equal(success.maximumInferenceToTeleopStateJump, 0.543984055519104);
  assert.equal(success.maximumInferenceToTeleopActionJump, 0.6515249013900757);
  assert.equal(success.stateDimensions, 14);
  assert.equal(success.actionDimensions, 14);
  assert.equal(success.timestampMonotonicWithinEpisodes, true);
});

test("publisher outcomes, hardware mismatch, rights and authority stay bounded", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.deepEqual(value.outcome, {
    failureRewardFieldPresent: true,
    independentOutcome: 0,
    longitudinalOutcome: 0,
    publisherFailureEpisodes: 125,
    publisherOutcomeSource: "DATASET_CARD_AND_SUBSET_DIRECTORY",
    publisherSuccessOrHilEpisodes: 164,
    sourceNativePerEpisodeFailureField: false,
    sourceNativePerEpisodeSuccessField: false,
    successHilRewardFieldPresent: false,
  });
  assert.deepEqual(value.hardware, {
    cardAndInfoRobotTypeAgree: false,
    cardClaimsBimanualYamFollower: true,
    cardClaimsRobotTypeYam: true,
    discrepancyResolvedByThisArtifact: false,
    infoJsonRobotTypeValues: ["arx"],
    physicalRobotIdentityIndependentlyVerified: false,
  });
  assert.equal(value.intervention.commanderStateSourceNative, true);
  assert.equal(value.intervention.humanTakeoverPromotedToIndependentRecovery, false);
  assert.equal(value.completeness.completeAttemptCensus, false);
  assert.equal(value.completeness.publisherDiscardedOrUnpublishedAttemptsUnknown, true);
  assert.deepEqual(value.rights, {
    commercialUseAllowed: false,
    datasetCardClaim: "CC-BY-NC-4.0",
    evaluationUseFinallyAdjudicated: false,
    productionTrainingAllowed: false,
    repositoryLicenseFilePresent: false,
  });
  assert.deepEqual(value.privacy, {
    humanInterventionTrajectoriesPresent: true,
    noPersonalInformationGuarantee: false,
    privacyReviewComplete: false,
    publicAvailabilityResolvesPrivacy: false,
    rawMcapPathValuesRepublishedInReport: false,
    rawMcapPathsPresent: true,
    sceneVideosAcquired: false,
  });
  assert.deepEqual(value.boundary, {
    training: 0, network: 0, CEU: 0, authority: 0, action: 0,
    opportunity: 0, delegation: 0, independentOutcome: 0,
    longitudinalOutcome: 0,
  });
});

test("self-resealing cannot promote HIL, publisher outcomes or rights", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.action = 1; },
    (value) => { value.outcome.independentOutcome = 1; },
    (value) => { value.outcome.sourceNativePerEpisodeSuccessField = true; },
    (value) => { value.intervention.humanTakeoverPromotedToIndependentRecovery = true; },
    (value) => { value.intervention.pairedFailureToRecoveryOutcomeAvailable = true; },
    (value) => { value.hardware.cardAndInfoRobotTypeAgree = true; },
    (value) => { value.hardware.discrepancyResolvedByThisArtifact = true; },
    (value) => { value.completeness.completeAttemptCensus = true; },
    (value) => { value.completeness.visualReplay = true; },
    (value) => { value.rights.commercialUseAllowed = true; },
    (value) => { value.rights.productionTrainingAllowed = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
    (value) => { value.privacy.rawMcapPathValuesRepublishedInReport = true; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = rfmPhase1ArtifactHash(body);
    assert.equal(verifyRfmPhase1Audit(changed).ok, false,
      canonicalizeStrict(changed));
  }
});

test("artifact rebuilds exactly and the closure is private and no-video", () => {
  const original = artifact();
  const rebuilt = buildRfmPhase1AuditFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyRfmPhase1Audit(rebuilt).ok, true);
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, rfmPhase1Sha256(Buffer.from(
    `outsider/rfm-phase1-mouse-battery-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")));
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 329);
  assert.equal(directories.length, 15);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
    assert.equal(file.endsWith(".mp4"), false, file);
  }
});
