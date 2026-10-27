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
  NOJIMA_CRACKING_ID, NOJIMA_CRACKING_REVISION, NOJIMA_PROFILE,
  NOJIMA_SOURCES, NOJIMA_TRANSPORT_ID, NOJIMA_TRANSPORT_REVISION,
  acquirePinnedNojimaSource, buildNojimaFamilyAuditFromSource,
  nojimaArtifactHash, nojimaSha256, verifyNojimaFamilyAudit,
  verifyNojimaSourceDirectory,
} from "../src/outsider-nojima-so101-publisher-family.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-nojima-so101-publisher-family-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "nojima-so101-publisher-family.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:022c0017e7f1415437fb3e4f474c3f7e7001a999e4966c1c5774e3031b627a71";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:e695470570bbc1a5b0fa2245c5f6fdd9e60daff55813fbcd99421c01ad802392";
const EXPECTED_SOURCE_ROOT =
  "sha256:e5f4312ea602f75af79002a04748e09187d7f1a51cf44657eaf69dbcb8384177";
const EXPECTED_MANIFEST_HASH =
  "sha256:a58189799388077e59ae1c47c1a7bb5e7bbebc7d04c6ef2e8eaf9c6af248b394";

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

test("both official publisher-family repositories are independently pinned", () => {
  assert.equal(NOJIMA_TRANSPORT_ID, "NOJIMA21/so101-egg-transport-act-v0");
  assert.equal(NOJIMA_TRANSPORT_REVISION,
    "b756293309351e38106b34bbe152e0eeb47de041");
  assert.equal(NOJIMA_CRACKING_ID, "NOJIMA21/so101-egg-cracking");
  assert.equal(NOJIMA_CRACKING_REVISION,
    "7e79c2c1423e419e430b2228daca0c6a67029a0b");
  assert.deepEqual(NOJIMA_PROFILE, {
    selectedObjects: 97,
    selectedBytes: 4_034_185,
    excludedVideos: 66,
    excludedVideoBytes: 866_645_758,
    transportTeleopEpisodes: 25,
    transportTeleopFrames: 35_467,
    transportSavedAutonomousEvaluations: 7,
    crackingEpisodes: 1,
    crackingFrames: 4_301,
    stateDimensions: 6,
    actionDimensions: 6,
    fps: 30,
  });
  assert.deepEqual(NOJIMA_SOURCES.map(({ key, cardLicense, selectedObjects,
    selectedBytes }) => ({ key, cardLicense, selectedObjects, selectedBytes })), [
    { key: "transport", cardLicense: null, selectedObjects: 91,
      selectedBytes: 3_823_297 },
    { key: "cracking", cardLicense: "other", selectedObjects: 6,
      selectedBytes: 210_888 },
  ]);
});

test("acquirer refuses an existing source before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "nojima-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedNojimaSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /NOJIMA_SO101_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("source binds both official records and full trees before and after", () => {
  const verified = verifyNojimaSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_TWO_REPOSITORY_COMPLETE_SELECTED_NO_VIDEO_BYTES");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 8);
  assert.equal(verified.manifest.remoteObjects.length, 97);
  assert.equal(verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + entry.bytes, 0), 4_034_185);
  assert.equal(verified.manifest.remoteObjects.some((entry) =>
    /(?:^|\/)videos\//u.test(entry.path) || entry.path.endsWith(".mp4")), false);
  assert.deepEqual(verified.manifest.closure, {
    selectedObjects: 97,
    selectedBytes: 4_034_185,
    transportCompleteNoVideoRootAndSevenEvaluations: true,
    crackingCompleteNoVideo: true,
    videosSelected: 0,
    videosExcluded: 66,
    videoBytesExcluded: 866_645_758,
  });
});

test("transport root and seven saved autonomous records replay exactly", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.deepEqual(value.replay.transport.savedAutonomousEvaluations, [
    { evaluationIndex: 1, frames: 1131, structuredEvaluationJson: true },
    { evaluationIndex: 2, frames: 1174, structuredEvaluationJson: false },
    { evaluationIndex: 3, frames: 997, structuredEvaluationJson: false },
    { evaluationIndex: 4, frames: 950, structuredEvaluationJson: false },
    { evaluationIndex: 5, frames: 1028, structuredEvaluationJson: false },
    { evaluationIndex: 6, frames: 1220, structuredEvaluationJson: false },
    { evaluationIndex: 7, frames: 976, structuredEvaluationJson: false },
  ]);
  assert.equal(value.replay.transport.savedAutonomousEvaluationFrames, 7_476);
  assert.equal(value.replay.transport.teleopEpisodes, 25);
  assert.equal(value.replay.transport.teleopFrames, 35_467);
  assert.equal(value.replay.transport.teleopPublisherSuccessLogRows, 25);
  assert.equal(value.replay.transport.structuredOutcomeAnnotations, 1);
  assert.deepEqual(value.replay.transport.teleopCameraQualityCounts,
    { good: 1, not_reviewed: 24 });
});

test("task outcomes stay separate from operational and capture failures", () => {
  const value = artifact();
  assert.deepEqual(value.replay.transport.evaluation001, {
    motorId: 3,
    policyOnlyNoTeleoperation: true,
    policyType: "ACT",
    postFinalizeMotorDisconnectError: true,
    publisherOutcome: "success",
    trainingEpisodes: 25,
  });
  assert.deepEqual(value.replay.cracking, {
    actionDimensions: 6,
    episodeAndFrameContinuity: true,
    episodes: 1,
    fps: 30,
    frames: 4_301,
    stateDimensions: 6,
  });
  assert.deepEqual(value.eventClassification, {
    transportEvaluation001PublisherTaskSuccess: true,
    transportMotorErrorOccurredAfterEpisodeFinalization: true,
    transportMotorErrorClassifiedAsTaskFailure: false,
    transportMotorErrorClassifiedAsPostFinalizeOperationalError: true,
    crackingPublisherTaskSuccess: true,
    crackingPublisherCameraPipelineFailure: true,
    crackingCameraIdentityDriftClassifiedAsRobotFailure: false,
    crackingCameraIdentityDriftClassifiedAsCapturePipelineFailure: true,
    cameraIdentityDriftVisuallyVerifiedByThisArtifact: false,
  });
});

test("selection, outcome, rights, privacy and authority remain bounded", () => {
  const value = artifact();
  assert.deepEqual(value.selection, {
    completeAttemptCensus: false,
    onlySavedAutonomousSuccessDirectoriesPublished: true,
    selectionBiasPresent: true,
    unsuccessfulOrUnsavedAutonomousAttemptsUnknown: true,
  });
  assert.deepEqual(value.outcome, {
    crackingPublisherTaskSuccesses: 1,
    independentOutcome: 0,
    longitudinalOutcome: 0,
    source: "PUBLISHER_SELF_REPORTED_OR_FOLDER_NAMING",
    transportRootPublisherSuccessLabels: 25,
    transportSavedAutonomousPublisherSuccesses: 7,
    transportStructuredOutcomeAnnotations: 1,
  });
  assert.deepEqual(value.rights, {
    crackingDatasetCardClaim: "other",
    evaluationUseFinallyAdjudicated: false,
    productionTrainingAllowed: false,
    repositoryLicenseFilesPresent: false,
    transportDatasetCardClaim: null,
  });
  assert.equal(value.privacy.privacyReviewComplete, false);
  assert.equal(value.completeness.visualReplay, false);
  assert.equal(value.completeness.videosAcquired, false);
  assert.deepEqual(value.boundary, {
    training: 0, network: 0, CEU: 0, authority: 0, action: 0,
    opportunity: 0, delegation: 0, independentOutcome: 0,
    longitudinalOutcome: 0,
  });
});

test("self-resealing cannot promote publisher claims or excluded evidence", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.authority = 1; },
    (value) => { value.outcome.independentOutcome = 1; },
    (value) => { value.selection.completeAttemptCensus = true; },
    (value) => { value.selection.selectionBiasPresent = false; },
    (value) => { value.eventClassification.transportMotorErrorClassifiedAsTaskFailure = true; },
    (value) => { value.eventClassification.crackingCameraIdentityDriftClassifiedAsRobotFailure = true; },
    (value) => { value.eventClassification.cameraIdentityDriftVisuallyVerifiedByThisArtifact = true; },
    (value) => { value.completeness.visualReplay = true; },
    (value) => { value.completeness.videosAcquired = true; },
    (value) => { value.rights.productionTrainingAllowed = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = nojimaArtifactHash(body);
    assert.equal(verifyNojimaFamilyAudit(changed).ok, false,
      canonicalizeStrict(changed));
  }
});

test("artifact rebuilds exactly and the full closure is private and no-video", () => {
  const original = artifact();
  const rebuilt = buildNojimaFamilyAuditFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyNojimaFamilyAudit(rebuilt).ok, true);
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, nojimaSha256(Buffer.from(
    `outsider/nojima-so101-publisher-family-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")));
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 108);
  assert.equal(directories.length, 62);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
    assert.equal(file.endsWith(".mp4"), false, file);
  }
});
