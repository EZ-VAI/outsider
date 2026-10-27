import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  RACER_CODE_COMMIT,
  RACER_DATAGEN_COMMIT,
  RACER_DATASET_ID,
  RACER_DATASET_REVISION,
  RACER_REPORT_SCHEMA,
  acquireRacerOpenDrawerSource,
  buildRacerOpenDrawerReport,
  racerDigest,
  racerSha256,
  replayRacerOpenDrawerSource,
  verifyRacerOpenDrawerReport,
  verifyRacerOpenDrawerSource,
} from "../src/outsider-racer-open-drawer-recovery.js";

const artifact = path.resolve("artifacts/outsider-racer-open-drawer-recovery-20260829-v1");
const source = path.join(artifact, "source");
const reportFile = path.join(artifact, "racer-open-drawer-recovery.json");
const manifestFile = path.join(artifact, "artifact-manifest.json");
const report = JSON.parse(readFileSync(reportFile, "utf8"));
const artifactManifest = JSON.parse(readFileSync(manifestFile, "utf8"));

function reseal(changed) {
  const { artifactHash: ignored, ...base } = changed;
  return { ...base, artifactHash: racerDigest(base, RACER_REPORT_SCHEMA) };
}

test("official producer commits, HF revision, and full repository inventory are pinned", () => {
  assert.equal(RACER_DATASET_ID, "sled-umich/RACER-augmented_rlbench");
  assert.equal(RACER_DATASET_REVISION, "a3d4f00a35f83401606188cac75b48a336eb4b6c");
  assert.equal(RACER_CODE_COMMIT, "df8cb2beec2e2061392ef0c4be93bda916dfd51e");
  assert.equal(RACER_DATAGEN_COMMIT, "bb360889e2a2cd7d79157cb82e60d967c8f30309");
  assert.deepEqual(report.repositoryInventory, {
    allCompleteTaskArchivesExceed300MB: true,
    randomArchiveShardUsed: false,
    repositoryBytes: 128_900_282_212,
    repositoryObjects: 488,
    smallestTrainArchive: {
      bytes: 1_282_953_600,
      path: "train/insert_onto_square_peg.zip",
    },
    smallestValidationArchive: {
      bytes: 322_967_185,
      path: "val/insert_onto_square_peg.zip",
    },
    sourceNativeSampleEpisodeGroups: ["samples/close_jar/0", "samples/open_drawer/0"],
    trainTaskArchives: 18,
    validationTaskArchives: 18,
  });
});

test("complete selected bytes and support snapshots replay from the private source", () => {
  const verified = verifyRacerOpenDrawerSource(source);
  assert.equal(verified.ok, true);
  assert.equal(verified.selectedFiles, 199);
  assert.equal(verified.selectedBytes, 32_479_055);
  assert.equal(verified.treeSnapshotHash,
    "sha256:8dc4736bba50d2ff6394e3e4bbfc2f9d1d5fe62f1de2a9f67e942798739eb7fd");
  assert.equal(verified.sourceRoot,
    "sha256:67bbc3218fb2b75821e4f3b859af9145c1fd10dc8300c0f43ca175a5f807ea18");
  assert.equal(verified.manifestHash,
    "sha256:2e375c249ccbd544714f1954e5fab0daa72f94282e1edc91db84d39010e2d7df");
  assert.equal(statSync(source).mode & 0o777, 0o700);
  assert.equal(statSync(path.join(source, "objects", "README.md")).mode & 0o777, 0o600);
});

test("the full open_drawer sample group replays as sparse simulated recovery morphology", () => {
  const replay = replayRacerOpenDrawerSource(source);
  assert.deepEqual(replay.actions, {
    allFinite: true,
    headerPresent: false,
    publisherFieldMeaning: "7DoF EE pose, gripper, collision",
    rowToLanguageNodeIdentityExplicit: false,
    rows: 24,
    width: 9,
  });
  assert.equal(replay.language.expertNodes, 4);
  assert.equal(replay.language.recoverableFailureNodes, 15);
  assert.equal(replay.language.correctionNodes, 5);
  assert.deepEqual(replay.modalityCounts, {
    front_depth: 24, front_rgb: 24, left_shoulder_depth: 24,
    left_shoulder_rgb: 24, right_shoulder_depth: 24,
    right_shoulder_rgb: 24, wrist_depth: 24, wrist_rgb: 24,
  });
  assert.deepEqual(replay.pngProfiles,
    [{ bitDepth: 8, colorType: 2, height: 512, width: 512 }]);
  assert.equal(replay.llava.rows, 50);
  assert.equal(replay.llava.uniqueFrontRgbImages, 19);
  assert.equal(replay.pickles.length, 2);
  assert.equal(replay.pickles.every((item) => !item.deserialized && !item.executed), true);
});

test("success filtering, missing denominators, simulation, and evidence radii stay explicit", () => {
  assert.deepEqual(report.slice, {
    class: "SIMULATED_RECOVERY_TRANSITION_MORPHOLOGY_GROUP",
    completeSourceNativeGroup: true,
    modalityDirectories: 8,
    pngFiles: 192,
    publisherEpisodeDirectory: "0",
    sampleBytes: 32_475_363,
    sampleFiles: 197,
    task: "open_drawer",
  });
  assert.equal(report.selectionAndCensus.publisherReportsEpisodesFilteredByTaskSuccess, true);
  assert.equal(report.selectionAndCensus.unsuccessfulPostRecoveryEpisodesExcludedByPublisher, true);
  assert.equal(report.selectionAndCensus.discardedEpisodeCountAvailable, false);
  assert.equal(report.selectionAndCensus.preFilterAttemptDenominatorAvailable, false);
  assert.equal(report.selectionAndCensus.completeDatasetAttemptCensus, false);
  assert.equal(report.selectionAndCensus.crossTotal, null);
  assert.equal(report.truth.environment, "RLBENCH_SIMULATION");
  assert.equal(report.truth.physicalRobotEpisode, false);
  assert.equal(report.truth.continuousTrajectoryEstablished, false);
  assert.equal(report.truth.independentOutcomeEstablished, false);
  assert.equal(report.truth.recoveryCausallyEstablishedByIndependentEvidence, false);
  assert.deepEqual(report.boundary, {
    CEU: 0, actionAuthority: 0, authority: 0, delegation: 0,
    independentOutcome: 0, longitudinalOutcome: 0, network: 0,
    opportunity: 0, pricing: 0, training: 0,
  });
  assert.deepEqual(report.rights, {
    datasetCardClaim: "MIT", datasetLicenseFilePresent: false,
    datasetReadmeClaim: "MIT", evaluationUseFinallyAdjudicated: false,
    productionTrainingAuthorized: false, rightsFinallyAdjudicated: false,
  });
});

test("full-source rederivation rejects self-sealed truth, training, and rights promotion", () => {
  const expected = buildRacerOpenDrawerReport(source);
  assert.deepEqual(report, expected);
  assert.equal(verifyRacerOpenDrawerReport(report, source).ok, true);

  const outcomeAttack = structuredClone(report);
  outcomeAttack.truth.independentOutcomeEstablished = true;
  outcomeAttack.truth.physicalRobotEpisode = true;
  assert.throws(() => verifyRacerOpenDrawerReport(reseal(outcomeAttack), source),
    /RACER_REPORT_NOT_FULL_SOURCE_DERIVED/u);

  const authorityAttack = structuredClone(report);
  authorityAttack.boundary.training = 1;
  authorityAttack.rights.productionTrainingAuthorized = true;
  assert.throws(() => verifyRacerOpenDrawerReport(reseal(authorityAttack), source),
    /RACER_REPORT_NOT_FULL_SOURCE_DERIVED/u);
});

test("artifact files are exact and acquisition refuses clobber before network access", async () => {
  const reportBytes = readFileSync(reportFile);
  assert.equal(racerSha256(reportBytes), artifactManifest.report.sha256);
  assert.equal(reportBytes.length, artifactManifest.report.bytes);
  assert.equal(artifactManifest.sourceRoot, report.source.sourceRoot);
  assert.equal(artifactManifest.artifactHash, report.artifactHash);
  assert.equal(statSync(reportFile).mode & 0o777, 0o600);
  assert.equal(statSync(manifestFile).mode & 0o777, 0o600);

  const existing = mkdtempSync(path.join(os.tmpdir(), "racer-no-clobber-"));
  let fetchCalls = 0;
  try {
    await assert.rejects(acquireRacerOpenDrawerSource({
      directory: existing,
      fetchImpl: async () => { fetchCalls += 1; throw new Error("network must not run"); },
    }), /RACER_NO_CLOBBER/u);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(existing, { recursive: true, force: false });
  }
});

