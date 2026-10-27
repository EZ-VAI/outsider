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
  FORGE_FAILURE_ID, FORGE_FAILURE_PROFILE, FORGE_FAILURE_REVISION,
  acquirePinnedForgeFailureSource, buildForgeFailureArtifactFromSource,
  forgeFailureArtifactHash, verifyForgeFailureArtifact,
  verifyForgeFailureSourceDirectory,
} from "../src/outsider-forge-failure-full-corpus.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-forge-failure-full-corpus-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "forge-failure-full-corpus.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:10e7163a89f0ad60e753a87131417a23b52c9449c2e9b19628551e32768cf177";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:ceb43e56ea249a66b9d5a25bc3322eb1152c4271b9e5f29ad212b7e2ccf735d5";
const EXPECTED_SOURCE_ROOT =
  "sha256:b3c9aebcce32123bce5f0d09011fef9b78efeaa26bd9184335b3bf6941bcf407";
const EXPECTED_MANIFEST_HASH =
  "sha256:cdd28e487f537aba4842e83349629f9de1b1c8ce6c129fbfac90c35d8a2cda93";

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

test("the Forge failure revision and complete repository profile are fixed", () => {
  assert.equal(FORGE_FAILURE_ID, "angledusgar/forge-failure-v1");
  assert.equal(FORGE_FAILURE_REVISION,
    "820392e1167df4d6f5d60f985ec4f3b1b4fd6237");
  assert.deepEqual(FORGE_FAILURE_PROFILE, {
    usedStorage: 40_140_940,
    treeEntries: 172, treeDirectories: 7, treeFiles: 165,
    treeBytes: 40_313_106,
    parquetFiles: 53, videoFiles: 106, metadataFiles: 4,
    repositoryEpisodeFiles: 53,
    readmeClaimedEpisodes: 51, readmeClaimedFrames: 13_899, fps: 15,
  });
});

test("the source acquirer refuses clobber before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "forge-failure-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedForgeFailureSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /FORGE_FAILURE_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("record, recursive tree and all 165 files bind before and after", () => {
  const verified = verifyForgeFailureSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_FULL_165_FILE_FORGE_FAILURE_BYTES");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 4);
  assert.equal(verified.manifest.remoteObjects.length, 165);
  assert.equal(verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + entry.bytes, 0), 40_313_106);
  assert.deepEqual(verified.manifest.closure, {
    completePublishedEpisodeFileCensus: true,
    completePublishedVideoFileCensus: true,
    fullFixedRepository: true, globallyExhaustive: false,
    licenseFilesPresent: 0,
    metadataBytes: 182_767, metadataFiles: 4,
    parquetBytes: 2_299_836, parquetFiles: 53,
    recursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreeDirectories: 7, recursiveTreeEntries: 172,
    recursiveTreeFiles: 165,
    recursiveTreeHash:
      "sha256:bdada7417145fba655e577d336909570f550c5b7aaa89f2b56ea5eba0f04d3d7",
    recursiveTreePagesPerPhase: 1,
    selectedBytes: 40_313_106, selectedObjects: 165,
    videoBytes: 37_825_073, videoFiles: 106,
  });
  assert.deepEqual(verified.before, verified.after);
});

test("all 53 Parquets, frame indices, tasks, states, actions and wrench fields replay", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.deepEqual(value.replay.info, {
    codebaseVersion: "v2.1",
    featureNames: ["actions", "episode_index", "frame_index", "ft", "ft_noisy",
      "image", "index", "state", "task_index", "timestamp", "wrist_image"],
    fps: 15, robotType: "panda", totalEpisodes: 53,
    totalFrames: 14_797, totalTasks: 3,
  });
  assert.deepEqual(value.replay.metadata.tasks, [
    { task: "insert the peg into the socket", task_index: 0 },
    { task: "mesh the gear onto the shaft", task_index: 1 },
    { task: "thread the nut onto the bolt", task_index: 2 },
  ]);
  assert.deepEqual({ ...value.replay.parquet, aggregateVectors: undefined,
    episodes: undefined, schema: undefined }, {
    aggregateVectors: undefined, episodes: undefined, schema: undefined,
    episodeIndices: Array.from({ length: 53 }, (_, index) => index),
    files: 53, frames: 14_797,
    sourceNativeOutcomeLikeFields: [],
    taskCounts: {
      "insert the peg into the socket": 26,
      "mesh the gear onto the shaft": 8,
      "thread the nut onto the bolt": 19,
    },
  });
  assert.deepEqual(value.replay.parquet.schema.map((field) =>
    [field.name, field.type]), [
    ["state", "fixed_size_list<element: float>[8]"],
    ["actions", "fixed_size_list<element: float>[7]"],
    ["ft", "fixed_size_list<element: float>[6]"],
    ["ft_noisy", "fixed_size_list<element: float>[3]"],
    ["timestamp", "float"], ["frame_index", "int64"],
    ["episode_index", "int64"], ["index", "int64"],
    ["task_index", "int64"],
  ]);
  assert.deepEqual(Object.fromEntries(Object.entries(
    value.replay.parquet.aggregateVectors).map(([name, vector]) =>
    [name, [vector.dimensions, vector.count]])), {
    actions: [7, 14_797], ft: [6, 14_797],
    ft_noisy: [3, 14_797], state: [8, 14_797],
  });
  assert.equal(value.replay.parquet.episodes.length, 53);
  assert.equal(value.replay.parquet.episodes.every((episode, index) =>
    episode.episodeIndex === index
      && episode.frames === (index < 26 ? 149 : index < 34 ? 299 : 449)
      && episode.vectors.state.dimensions === 8
      && episode.vectors.actions.dimensions === 7
      && episode.vectors.ft.dimensions === 6
      && episode.vectors.ft_noisy.dimensions === 3), true);
});

test("all 106 AV1 video sample tables crosswalk exactly without pixel decoding", () => {
  const value = artifact();
  const replay = value.replay.video;
  assert.deepEqual({ ...replay, containerReplay: undefined }, {
    bytes: 37_825_073, codecs: ["av01"], containerReplay: undefined,
    dimensions: ["256x256"], files: 106,
    streams: { image: 53, wrist_image: 53 }, totalSamples: 29_594,
  });
  assert.equal(replay.containerReplay.length, 106);
  const byEpisode = new Map();
  for (const video of replay.containerReplay) {
    assert.deepEqual(video.topLevelBoxes, ["ftyp", "free", "mdat", "moov"]);
    assert.equal(video.tracks.length, 1);
    const track = video.tracks[0];
    assert.equal(track.handler, "vide");
    assert.equal(track.codec, "av01");
    assert.equal(track.sampleDescriptionEntries, 1);
    assert.equal(track.sampleCount, track.timingSampleCount);
    assert.equal(track.sampleWidth, 256);
    assert.equal(track.sampleHeight, 256);
    assert.equal(track.trackWidth, 256);
    assert.equal(track.trackHeight, 256);
    const entries = byEpisode.get(video.episodeIndex) ?? [];
    entries.push(video);
    byEpisode.set(video.episodeIndex, entries);
  }
  assert.equal(byEpisode.size, 53);
  for (const episode of value.replay.parquet.episodes) {
    const videos = byEpisode.get(episode.episodeIndex);
    assert.deepEqual(videos.map((entry) => entry.stream).sort(),
      ["image", "wrist_image"]);
    assert.equal(videos.every((entry) =>
      entry.tracks[0].sampleCount === episode.frames), true);
  }
  assert.deepEqual(value.videoSemantics, {
    allMp4SampleTablesReplayed: true, allVideoBytesAcquired: true,
    codec: "av01", dimensions: "256x256", pixelsDecoded: false,
    streamsPerEpisode: 2, videoSamplesMatchParquetFrames: true,
    visualInspectionPerformed: false,
  });
});

test("stale README counts and publisher-only failure labels retain missingness", () => {
  const value = artifact();
  assert.deepEqual(value.countAdjudication, {
    actualFrames: 14_797,
    authoritativePinnedDenominator: "53_PUBLISHED_EPISODE_PARQUETS",
    infoEpisodes: 53, publishedEpisodeParquets: 53,
    publishedMetadataEpisodeRows: 53,
    readmeEpisodeCountMatchesPinnedBytes: false,
    readmeEpisodes: 51,
    readmeFrameCountMatchesPinnedBytes: false,
    readmeFrames: 13_899,
  });
  assert.equal(Object.values(value.publisherClaims).every(Boolean), true);
  assert.deepEqual(value.failureSemantics, {
    completeCollectionAttemptCensus: false,
    everyPublishedEpisodeIndependentlyVerifiedFailed: false,
    onlyFailedSelectionBias: true,
    pairedSuccessFailureAttempts: false,
    publisherFailureLabelIsIndependentOutcome: false,
    publisherSaysOnlyFailedTailEventsSelected: true,
    publisherSaysRoughly19FirstRunFailuresLost: true,
    recoveryExecutionPresent: false,
    repositoryMembershipPublisherFailureLabel: true,
    sameCollectionLineageByteCrosswalkEstablished: false,
    sourceNativeFailureColumnPresent: false,
    sourceNativeOutcomeLikeFields: [],
    sourceNativeSuccessColumnPresent: false,
    successfulParentCorpusInClosure: false,
    successfulPopulationMissing: true,
  });
});

test("simulation context, rights, privacy, outcome and authority stay bounded", () => {
  const value = artifact();
  assert.deepEqual(value.provenance, {
    externalEffectReceiptPresent: false,
    independentPhysicalOutcomeEstablished: false,
    publisherIsaacLabTagPresent: true,
    realRobotExecutionEstablished: false,
    simulationExecutionPublisherDeclared: true,
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
    noPiiEstablished: false, privacyReviewComplete: false,
    publicAvailabilityResolvesPrivacy: false,
    publisherSimulationContextPresent: true,
    rawArtifactPrivate: true, videoBytesPresent: true,
    videoPixelsInspectedForPeopleOrPii: false,
    videoPixelsRepublishedInReport: false,
  });
  assert.deepEqual(value.boundary, {
    CEU: 0, action: 0, authority: 0, delegation: 0, externalEffect: 0,
    independentOutcome: 0, network: 0, privacy: 0, recovery: 0,
    reliableOutcome: 0, training: 0,
  });
});

test("self-resealing cannot promote failure, recovery, provenance, rights or privacy", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.failureSemantics.publisherFailureLabelIsIndependentOutcome = true; },
    (value) => { value.failureSemantics.everyPublishedEpisodeIndependentlyVerifiedFailed = true; },
    (value) => { value.failureSemantics.completeCollectionAttemptCensus = true; },
    (value) => { value.failureSemantics.recoveryExecutionPresent = true; },
    (value) => { value.provenance.realRobotExecutionEstablished = true; },
    (value) => { value.provenance.independentPhysicalOutcomeEstablished = true; },
    (value) => { value.rights.productionTrainingAuthorized = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
    (value) => { value.boundary.recovery = 1; },
    (value) => { value.boundary.authority = 1; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = forgeFailureArtifactHash(body);
    assert.equal(verifyForgeFailureArtifact(changed).ok, false);
  }
});

test("the report rebuilds exactly and the complete raw artifact stays private", () => {
  const original = artifact();
  const rebuilt = buildForgeFailureArtifactFromSource(SOURCE_DIRECTORY);
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyForgeFailureArtifact(rebuilt).ok, true);
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(manifest.verification.verificationLevel,
    "FULL_53_PARQUET_AND_106_MP4_CONTAINER_REPLAY");
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 172);
  assert.equal(files.every((file) => (statSync(file).mode & 0o777) === 0o600), true);
  assert.equal(directories.every((directory) =>
    (statSync(directory).mode & 0o777) === 0o700), true);
});
