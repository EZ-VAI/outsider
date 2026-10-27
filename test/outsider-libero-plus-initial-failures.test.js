import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, statSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  LIBERO_INITIAL_ID, LIBERO_INITIAL_PROFILE, LIBERO_INITIAL_REVISION,
  acquirePinnedLiberoInitialSource, liberoInitialArtifactHash,
  verifyLiberoInitialArtifact, verifyLiberoInitialArtifactWithSource,
  verifyLiberoInitialSourceDirectory,
} from "../src/outsider-libero-plus-initial-failures.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-libero-plus-initial-failures-20260830-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "libero-plus-initial-failures.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const RECEIPT_PATH = path.join(ARTIFACT_DIRECTORY, "receipt.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:361926f2940e5bb5af542ebf6ce901212b6a0d0e34a01909ce07094643bd400d";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:f33b7643c866b20ded7fb29bbc318465e85375f6b8e14d129fc935c3facff8cf";
const EXPECTED_SOURCE_ROOT =
  "sha256:6b712162e1d7b1f67a5f002e1e6fd19d6a76375f647c7ee5c7d018d44fec78b1";
const EXPECTED_MANIFEST_HASH =
  "sha256:f83a21d97235fc97496a8b49510dd8c19b21e95cfc7010c9b20e5e0214491783";
const EXPECTED_RECEIPT_HASH =
  "sha256:545534631b3eb90f174e2a6b43f34f75ced66bc20c687e7707e84000eb3c85e7";

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

test("the fixed revision and complete-repository arithmetic remain exact", () => {
  assert.equal(LIBERO_INITIAL_ID,
    "d3d3shan/pi05-libero-plus-robot-initial-failures");
  assert.equal(LIBERO_INITIAL_REVISION,
    "1807a9af5ce972c57d2bb35fd040587f5adedb22");
  assert.deepEqual(LIBERO_INITIAL_PROFILE, {
    usedStorage: 104_285_124,
    treeEntries: 42, treeDirectories: 3, treeFiles: 39,
    treeBytes: 113_741_083,
    videoFiles: 32, videoBytes: 104_274_343,
    nonVideoFiles: 7, nonVideoBytes: 9_466_740,
  });
});

test("the source acquirer refuses clobber before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "libero-initial-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedLiberoInitialSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /LIBERO_INITIAL_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("the API bracket binds all 39 files and every terminal disposition", () => {
  const checked = verifyLiberoInitialSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "PINNED_COMPLETE_39_FILE_LIBERO_PLUS_REPOSITORY");
  assert.equal(checked.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(checked.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(checked.manifest.sourceFiles.length, 82);
  assert.equal(checked.manifest.remoteObjects.length, 39);
  assert.equal(checked.manifest.remoteObjects.reduce((sum, row) =>
    sum + row.bytes, 0), 113_741_083);
  assert.equal(checked.manifest.terminalDispositions.length, 39);
  assert.equal(checked.manifest.terminalDispositions.every((row) =>
    row.disposition === "ACQUIRED_AND_REPLAYED"), true);
  assert.equal(checked.before.repository.usedStorage, 104_285_124);
  assert.equal(checked.before.tree.treeHash,
    "sha256:876606ba6da6f07bf2c8a0e13a16170ff99cbc02db869babcae5adc67e8141d1");
  assert.deepEqual(checked.manifest.closure, {
    allRepositoryFilesHaveTerminalDisposition: true,
    completeFixedRepository: true,
    globallyExhaustiveAtFixedRevision: true,
    nonVideoBytes: 9_466_740, nonVideoFiles: 7, randomTruncation: false,
    recursiveTreeBytes: 113_741_083,
    recursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreeDirectories: 3, recursiveTreeEntries: 42,
    recursiveTreeFiles: 39,
    repositoryUsedStorageAndTreeBytesAreDistinctMeasures: true,
    repositoryUsedStorageBytes: 104_285_124,
    selectedBytes: 113_741_083, selectedFiles: 39,
    videoBytes: 104_274_343, videoFiles: 32,
  });
  const objects = Object.fromEntries(checked.manifest.remoteObjects.map((row) =>
    [row.path, row]));
  assert.equal(objects["logs/robot_initial_queue.log"].sha256,
    "sha256:b6e3dd4196d90612d6b4a32b1c672f1e97a5044e580e3e23391033243f60068d");
  assert.equal(objects["metadata/robot_initial_full_failure_grids.json"].sha256,
    "sha256:f0ea24603da716e3a5665c934849f793e5c57b64274309760a692ce171c89d5f");
  assert.equal(objects["videos/robot_initial_full_failure_grid_001.mp4"].sha256,
    "sha256:18afd9e9382d257d7781aeff5692fb33b888e6bb0c40b9728a349c8d780a9587");
});

test("all six source-native evaluation dictionaries replay as one released census", () => {
  const log = artifact().replay.log;
  assert.equal(log.bytes, 8_792_248);
  assert.equal(log.utf8Lines, 12_666);
  assert.equal(log.absolutePathOccurrences, 258);
  assert.deepEqual(log.localEvalInfoLineNumbers,
    [4_452, 7_137, 8_596, 9_790, 12_191, 12_624]);
  assert.deepEqual(log.runs.map(({ label, tasks, episodes, successes, failures }) =>
    ({ label, tasks, episodes, successes, failures })), [
    { label: "LOW_INITIAL", tasks: 241, episodes: 1_205,
      successes: 1_017, failures: 188 },
    { label: "LOW_SELECTED_RERUN", tasks: 93, episodes: 465,
      successes: 308, failures: 157 },
    { label: "HIGH_PART_01", tasks: 50, episodes: 250,
      successes: 165, failures: 85 },
    { label: "HIGH_PART_02", tasks: 50, episodes: 250,
      successes: 147, failures: 103 },
    { label: "HIGH_PART_03", tasks: 50, episodes: 250,
      successes: 94, failures: 156 },
    { label: "HIGH_PART_04", tasks: 2, episodes: 10,
      successes: 7, failures: 3 },
  ]);
  assert.deepEqual({ executions: log.totalExecutions,
    successes: log.totalSuccesses, failures: log.totalFailures },
  { executions: 2_430, successes: 1_738, failures: 692 });
  assert.equal(log.publisherCommandsExecuted, 0);
  assert.equal(log.publisherPythonExecuted, 0);
  assert.equal(log.rawLogProjected, false);
});

test("selected reruns pair exactly without becoming recovery or a cross-total", () => {
  const value = artifact();
  assert.equal(value.replay.log.originalEvaluationTasks, 393);
  assert.equal(value.replay.log.originalEvaluationEpisodes, 1_965);
  assert.equal(value.replay.log.selectedRerunTasks, 93);
  assert.equal(value.replay.log.selectedRerunEpisodes, 465);
  assert.equal(value.replay.log.rerunTaskSetEqualsInitialFailedTaskSet, true);
  assert.deepEqual(value.replay.log.transitionCounts,
    { FF: 117, FT: 71, TF: 40, TT: 237 });
  assert.deepEqual(value.typedDenominators, {
    ORIGINAL_EVALUATION_EPISODE: 1_965,
    SELECTED_RERUN_EPISODE: 465,
    PAIRED_INITIAL_TO_RERUN_CELL: 465,
    FAILURE_GRID_CLIP: 32,
    crossTotal: null,
  });
  assert.equal(value.repeatMorphology.selectionBiasPresent, true);
  assert.equal(value.repeatMorphology.failureThenRepeatSuccessCells, 71);
  assert.equal(value.repeatMorphology.withinEpisodeCorrection, false);
  assert.equal(value.repeatMorphology.causalRecoveryEstablished, false);
  assert.equal(value.repeatMorphology.independentOutcomeEstablished, false);
  assert.equal(value.releasedExecutionCensus.globalPolicyAttemptCensusEstablished,
    false);
});

test("JSON, markdown, and manifests close the 575-cell failure crosswalk", () => {
  const metadata = artifact().replay.metadata;
  assert.deepEqual(metadata.evalManifest.configTaskCounts, [241, 50, 50, 50, 2]);
  assert.equal(metadata.evalManifest.tasks, 393);
  assert.equal(metadata.evalManifest.episodesPerTask, 5);
  assert.equal(metadata.evalManifest.episodeLengthSteps, 520);
  assert.equal(metadata.rerunManifest.failedTaskCount, 93);
  assert.equal(metadata.rerunManifest.taskSetMatchesInitialFailures, true);
  assert.deepEqual(metadata.failureGridJson.summary, {
    episodes: 2_430, failures: 692, success_rate: 0.7152263374485597,
    successes: 1_738, task_count: 393,
  });
  assert.deepEqual({
    rendered: metadata.failureGridJson.failureVideoRecords,
    missing: metadata.failureGridJson.missingVideoFailureRecords,
    rerun: metadata.failureGridJson.rerunFailureRecords,
    high: metadata.failureGridJson.highFailureRecords,
    failureCensus: metadata.failureGridJson.failureIndexCensus,
    capacity: metadata.failureGridJson.panelCapacity,
    blanks: metadata.failureGridJson.blankPanels,
  }, { rendered: 504, missing: 71, rerun: 157, high: 347,
    failureCensus: 575, capacity: 512, blanks: 8 });
  assert.equal(metadata.failureGridJson.failureIndicesContiguousOneThrough575,
    true);
  assert.equal(metadata.failureGridJson.missingRecordsEqualInitialFailureToRerunSuccess,
    true);
  assert.equal(metadata.failureGridMarkdown.failureLegendRows, 504);
  assert.equal(metadata.failureGridMarkdown.missingLegendRows, 71);
  assert.equal(metadata.failureGridMarkdown.jsonCrosswalkComplete, true);
  assert.equal(metadata.readme.claims.simulationBenchmarkClaim, true);
  assert.equal(metadata.gitAttributes.lfsPatternLines, 55);
});

test("all MP4 bytes replay structurally without decoding or projecting pixels", () => {
  const video = artifact().replay.video;
  assert.deepEqual({ files: video.files, bytes: video.bytes, tracks: video.tracks,
    videoTracks: video.videoTracks, samples: video.totalSamples,
    sampleDataBytes: video.totalSampleDataBytes },
  { files: 32, bytes: 104_274_343, tracks: 32, videoTracks: 32,
    samples: 17_952, sampleDataBytes: 104_030_683 });
  assert.deepEqual(video.codecs, ["avc1"]);
  assert.deepEqual(video.dimensions, ["1024x1024", "1024x512"]);
  assert.equal(video.containerReplay.length, 32);
  assert.equal(video.containerReplay.every((row) =>
    row.topLevelBoxBytes === row.bytes
      && row.topLevelBoxes.join(",") === "ftyp,free,mdat,moov"
      && row.movieDurationSeconds === 28.05 && row.tracks.length === 1
      && row.tracks[0].handler === "vide" && row.tracks[0].codec === "avc1"
      && row.tracks[0].sampleCount === 561
      && row.tracks[0].timingSampleCount === 561), true);
  const dimensionCounts = video.containerReplay.reduce((counts, row) => {
    const track = row.tracks[0];
    const key = `${track.sampleWidth}x${track.sampleHeight}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  assert.deepEqual(dimensionCounts, { "1024x1024": 31, "1024x512": 1 });
  assert.equal(video.pixelsDecoded, false);
  assert.equal(video.pixelsProjected, false);
  assert.equal(video.visualInspectionPerformed, false);
});

test("simulation, rights, privacy, and authority remain fail-closed", () => {
  const value = artifact();
  assert.deepEqual(value.semantics, {
    actionStateTrajectoryPresent: false,
    delegationEstablished: false,
    directCausalEffectEstablished: false,
    independentThirdPartyOutcomePresent: false,
    liberoSimulationEstablished: true,
    longitudinalIdentityEstablished: false,
    physicalWorldActionEstablished: false,
    publisherEvaluatorOutcomePresent: true,
    realRobotEstablished: false,
    recoveryEstablished: false,
    sourceNativePublisherEvaluatorSuccessBooleansPresent: true,
    terminalOutcomeReliabilityIndependentlyEstablished: false,
    withinEpisodeCorrectionEstablished: false,
  });
  assert.deepEqual(value.rights, {
    datasetCardLicenseClaim: "MIT",
    evaluationUseBoundary: "QUARANTINE_EVAL_ONLY",
    legalConclusionEstablished: false,
    modelPolicyRightsIndependentlyAdjudicated: false,
    productionTrainingAuthorized: false,
    readmeLicenseClaim: "MIT",
    rootLicenseFilePresent: false,
    upstreamLiberoRightsIndependentlyAdjudicated: false,
  });
  assert.deepEqual(value.privacy, {
    directoryMode: "0700", fileMode: "0600", noPiiGuaranteed: false,
    privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false,
    rawArtifactPrivate: true, rawLogContainsAbsolutePaths: true,
    rawPathsProjected: false, rawTaskNamesProjected: false,
    videoPixelsInspectedForPeopleOrPii: false, videoPixelsProjected: false,
  });
  assert.deepEqual(value.boundary, {
    CEU: 0, action: 0, authority: 0, delegation: 0,
    directCausalEffect: 0, externalEffect: 0, independentOutcome: 0,
    network: 0, physicalObservation: 0, privacy: 0,
    publisherEvaluatorOutcome: 1, recovery: 0, reliableOutcome: 0,
    simulation: 1, training: 0,
  });
});

test("the source-bound report and receipt reproduce and stay private", () => {
  const value = artifact();
  const { artifactHash, ...body } = value;
  assert.equal(liberoInitialArtifactHash(body), artifactHash);
  assert.deepEqual(verifyLiberoInitialArtifact(value), {
    ok: true, artifactHash: EXPECTED_ARTIFACT_HASH,
    verificationLevel: "STANDALONE_HASH_PAIRED_POPULATION_AND_SIMULATION_BOUNDARY",
  });
  const sourceBound = verifyLiberoInitialArtifactWithSource(value, SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(sourceBound.ok, true, sourceBound.error);
  assert.equal(sourceBound.verificationLevel,
    "FULL_LOG_JSON_MARKDOWN_PAIRING_AND_32_MP4_CONTAINER_REPLAY");
  const manifest = readJson(MANIFEST_PATH);
  const receipt = readJson(RECEIPT_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.deepEqual(manifest.report, {
    bytes: 32_380, path: "libero-plus-initial-failures.json",
    sha256: "sha256:e11324e4eeadfe2e8f49071c591fbf38956a02afd7abfc984c2fb825eddcf721",
  });
  assert.equal(receipt.receiptHash, EXPECTED_RECEIPT_HASH);
  assert.equal(receipt.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(receipt.artifactManifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(receipt.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(receipt.sourceRoot, EXPECTED_SOURCE_ROOT);
  const tree = walk(ARTIFACT_DIRECTORY);
  assert.equal(tree.directories.every((directory) =>
    (statSync(directory).mode & 0o777) === 0o700), true);
  assert.equal(tree.files.every((file) =>
    (statSync(file).mode & 0o777) === 0o600), true);
});
