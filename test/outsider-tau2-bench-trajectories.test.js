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
  TAU2_MODEL_NAMES, TAU2_TRAJECTORIES_ID, TAU2_TRAJECTORIES_PROFILE,
  TAU2_TRAJECTORIES_REPLAY_HASH, TAU2_TRAJECTORIES_REVISION,
  TAU2_TRAJECTORIES_TREE_HASH, acquirePinnedTau2TrajectoriesSource,
  buildTau2TrajectoriesAuditFromSource, tau2TrajectoriesArtifactHash,
  tau2TrajectoriesSha256, verifyTau2TrajectoriesAudit,
  verifyTau2TrajectoriesAuditWithSource,
  verifyTau2TrajectoriesSourceDirectory,
} from "../src/outsider-tau2-bench-trajectories.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-tau2-bench-trajectories-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY, "tau2-bench-trajectories.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:a1c8633d28d079ed6ccb6efadaae9cccdfb780e396cad7ab0a7ba0a087834087";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:981e561025d5fe7d28db7e344134b0672265663a47ee4a25e69915936c355e37";
const EXPECTED_SOURCE_ROOT =
  "sha256:a1620de5d6cdae5563f74d8025ab8db0e8b33acfe664c1eb82cd3cea8b407b25";
const EXPECTED_MANIFEST_HASH =
  "sha256:2bcab39e0e388c5e9679e2c84d10a9052050a44a3c3b723c665469c0cdfc9c18";

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

function resealReplay(value) {
  const { replayHash: ignored, ...projection } = value.replay;
  value.replay.replayHash = tau2TrajectoriesSha256(Buffer.from(
    `outsider/tau2-safe-replay/v1\0${canonicalizeStrict(projection)}`, "utf8"));
  const { artifactHash: ignoredArtifact, ...body } = value;
  value.artifactHash = tau2TrajectoriesArtifactHash(body);
}

test("official revision and complete 289.8MB profile are frozen", () => {
  assert.equal(TAU2_TRAJECTORIES_ID, "AgentSuite/tau2-bench-trajectories");
  assert.equal(TAU2_TRAJECTORIES_REVISION,
    "07264f1d253a618fc20966670eddc44246212916");
  assert.equal(TAU2_TRAJECTORIES_TREE_HASH,
    "sha256:bf59893c773c10cc161396f086702d9ec37fba23b1c1c4162da44c4163824fa3");
  assert.equal(TAU2_TRAJECTORIES_REPLAY_HASH,
    "sha256:b2246c0d4e014f1d79cf82463de7d2100383bec6cf91a73c088da8ab4f2dabc9");
  assert.deepEqual(TAU2_TRAJECTORIES_PROFILE, {
    usedStorage: 69_072_767,
    treeEntries: 32,
    treeFiles: 32,
    treeBytes: 289_780_557,
    jsonlFiles: 30,
    jsonlBytes: 289_776_373,
    lfsFiles: 5,
    lfsBytes: 69_072_767,
    readmeBytes: 1_409,
    gitattributesBytes: 2_775,
    models: 30,
    cardClaimedTasksPerModel: 278,
    cardClaimedRows: 8_340,
  });
  assert.equal(TAU2_MODEL_NAMES.length, 30);
  assert.equal(new Set(TAU2_MODEL_NAMES).size, 30);
});

test("acquirer refuses an existing source before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "tau2-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedTau2TrajectoriesSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /TAU2_TRAJECTORIES_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("all 32 objects and the recursive tree bind before and after", () => {
  const verified = verifyTau2TrajectoriesSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_COMPLETE_TAU2_TRAJECTORY_REPOSITORY_BYTES");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 4);
  assert.equal(verified.manifest.remoteObjects.length, 32);
  assert.equal(verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + entry.bytes, 0), 289_780_557);
  assert.deepEqual(verified.manifest.closure, {
    selectedObjects: 32,
    selectedBytes: 289_780_557,
    completeRepositoryBytes: true,
    completeRecursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreePagesPerPhase: 1,
    recursiveTreeEntries: 32,
    recursiveTreeFiles: 32,
    recursiveTreeBytes: 289_780_557,
    recursiveTreeHash: TAU2_TRAJECTORIES_TREE_HASH,
    jsonlObjects: 30,
    jsonlBytes: 289_776_373,
    readmeObjects: 1,
    gitattributesObjects: 1,
    excludedObjects: 0,
    excludedBytes: 0,
    rawDialogueStoredPrivate: true,
  });
});

test("row matrix preserves unstable publisher ids and aligned content multisets", () => {
  const matrix = artifact().replay.matrix;
  assert.deepEqual(matrix, {
    completePublished30By278Matrix: true,
    contentSignatureIntersectionHash:
      "sha256:d77e817d3dff057106f98b23d9150efba68c0f604a31dbcee97034bb48df648b",
    contentSignatureIntersectionTasks: 169,
    contentSignatureUnionHash:
      "sha256:f2eec56df4cec8291998198b7eaf98981bf933852ac944372f8a71491b6a9644",
    contentSignatureUnionTasks: 169,
    contentTaskMultisetCohorts: {
      "sha256:cfdfb8a3a198104402af8922ef37e47b585c74e064dbcd09dd2eb106508ced94": 30,
    },
    contentTaskSetCohorts: {
      "sha256:61937555bc14bcf72d6f3ae62ceaba2a72e59dd8027a649634bf4dadad2af037": 30,
    },
    domainTaskCountsInUnion: { airline: 100, retail: 228, telecom: 228 },
    intersectionTaskSetHash:
      "sha256:bdade622107f128becf1254dfa212d4835322bea2ba90b7e025604987326e331",
    intersectionTasks: 0,
    modelsWith278ContentTaskRows: 30,
    modelsWith278Rows: 30,
    modelsWithNoMissingContentTasks: 30,
    modelsWithNoMissingUnionTasks: 0,
    publisherTaskIdSetCohorts: {
      "sha256:046d475407482a026904258c6c736d00754439e31ba6821888f1455d3ee21a4e": 10,
      "sha256:c06c5c9595de6a1d2e6eb22cbd4c5f5a7d7e042cc3fd2925b78274dd579ffac7": 20,
    },
    publisherTaskIdsStableAcrossModels: false,
    totalRows: 8_340,
    unionTaskSetHash:
      "sha256:4e48e2381c80d94017136ed6b42a5e48a4343a41cb57f102c2d3db88783b5dcc",
    unionTasks: 556,
  });
});

test("all messages, tool calls and publisher evaluator fields replay", () => {
  const replay = artifact().replay;
  assert.equal(replay.replayHash, TAU2_TRAJECTORIES_REPLAY_HASH);
  assert.deepEqual(replay.messages, {
    contentTypes: {
      "assistant|null": 47_890, "assistant|str": 100_577,
      "system|str": 8_340, "tool|str": 113_424,
      "user|null": 24_060, "user|str": 84_621,
    },
    messageKeysets: {
      "content,role,tool_calls,turn_idx": 98_626,
      "content,role,turn_idx": 280_286,
    },
    multiToolCallMessages: 7_921,
    roles: { assistant: 148_467, system: 8_340,
      tool: 113_424, user: 108_681 },
    toolCallKeysets: { "arguments,id,name,requestor": 113_603 },
    toolCalls: 113_603,
    toolResultMessages: 113_424,
    total: 378_912,
  });
  assert.deepEqual(replay.publisherEvaluation, {
    dbMatchClasses: { False: 4_965, True: 3_375 },
    evalResultIsPublisherNative: true,
    finishReasons: { max_steps: 281, user_stop: 8_059 },
    independentOutcome: 0,
    isCorrectVsDbMatchDisagreements: 0,
    metaIsCorrectClasses: { False: 4_965, True: 3_375 },
    rewardDetailsRows: 8_340,
    scoreClasses: { 0: 4_356, 1: 3_984 },
    scoreVsDbMatchDisagreements: 1_003,
    scoreVsIsCorrectDisagreements: 1_003,
    topLevelRewardFieldRows: 0,
  });
  assert.deepEqual(replay.anomalies,
    { invalidJsonLines: 0, schemaAnomalyEvents: 0 });
});

test("each model retains coverage, anomaly, reward and eval statistics", () => {
  const value = artifact();
  const source = readJson(path.join(SOURCE_DIRECTORY, "acquisition-manifest.json"));
  assert.equal(value.replay.perModel.length, 30);
  assert.deepEqual(value.replay.perModel.map((entry) => entry.model).sort(),
    [...TAU2_MODEL_NAMES].sort());
  for (const model of value.replay.perModel) {
    assert.equal(model.rows, 278, model.model);
    assert.equal(model.parsedRows, 278, model.model);
    assert.equal(model.uniqueTaskIdentities, 278, model.model);
    assert.equal(model.missingTasksFromUnion, 278, model.model);
    assert.equal(model.uniqueContentTaskSignatures, 169, model.model);
    assert.equal(model.contentTaskSignatureRows, 278, model.model);
    assert.equal(model.duplicateContentTaskSignatureRows, 109, model.model);
    assert.equal(model.missingContentTasksFromUnion, 0, model.model);
    assert.equal(model.anomalies.total, 0, model.model);
    assert.equal(model.publisherEvaluation.topLevelRewardFieldRows, 0, model.model);
    assert.equal(model.publisherEvaluation.rewardDetailsRows, 278, model.model);
    assert.equal(Object.values(model.publisherEvaluation.scoreClasses)
      .reduce((sum, count) => sum + count, 0), 278, model.model);
    assert.equal(Object.values(model.publisherEvaluation.dbMatchClasses)
      .reduce((sum, count) => sum + count, 0), 278, model.model);
    assert.equal(model.messages.toolCallKeysets["arguments,id,name,requestor"],
      model.messages.toolCalls, model.model);
    const descriptor = source.remoteObjects.find((entry) => entry.path === model.file);
    assert.equal(descriptor?.sha256, model.fileSha256, model.model);
  }
  assert.equal(value.replay.files.rawMessageContentEmitted, false);
  assert.equal(value.outcome.publisherEvaluationPromotedToIndependentOutcome, false);
  assert.equal(value.recovery.sameTaskAcrossModelsPromotedToRetryLineage, false);
  assert.equal(value.completeness.completeAttemptCensus, false);
  assert.deepEqual(value.rights, {
    datasetCardLicense: null, evaluationUseFinallyAdjudicated: false,
    productionTrainingAllowed: false, repositoryLicenseFilePresent: false,
    rightsDisposition: "FAIL_CLOSED", trainingRightsEstablished: false,
  });
  assert.deepEqual(value.privacy, {
    noPiiGuaranteePresent: false, privacyReviewComplete: false,
    publicAvailabilityResolvesPrivacy: false, rawDialogueAcquired: true,
    rawDialogueStoredPrivate0600: true,
    rawMessageContentRepublishedInReport: false,
  });
});

test("self-resealing cannot promote publisher trajectories or rights", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.action = 1; },
    (value) => { value.outcome.independentOutcome = 1; },
    (value) => { value.recovery.sameTaskAcrossModelsPromotedToRetryLineage = true; },
    (value) => { value.completeness.completeAttemptCensus = true; },
    (value) => { value.rights.productionTrainingAllowed = true; },
    (value) => { value.privacy.noPiiGuaranteePresent = true; },
    (value) => { value.privacy.rawMessageContentRepublishedInReport = true; },
    (value) => { value.replay.matrix.intersectionTasks = 278; },
    (value) => { value.replay.matrix.publisherTaskIdsStableAcrossModels = true; },
    (value) => { value.replay.perModel[0].anomalies.total = 1; },
    (value) => { value.replay.publisherEvaluation.independentOutcome = 1; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    resealReplay(changed);
    assert.equal(verifyTau2TrajectoriesAudit(changed).ok, false,
      canonicalizeStrict(changed));
  }
});

test("artifact rebuilds exactly and raw conversations remain private", () => {
  const original = artifact();
  const rebuilt = buildTau2TrajectoriesAuditFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyTau2TrajectoriesAudit(rebuilt).ok, true);
  const bound = verifyTau2TrajectoriesAuditWithSource(rebuilt, SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(bound.ok, true, bound.error);
  assert.equal(bound.verificationLevel,
    "FULL_TAU2_JSONL_MESSAGE_TOOL_EVAL_AND_TASK_MATRIX_REPLAY");
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, tau2TrajectoriesSha256(Buffer.from(
    `outsider/tau2-bench-trajectories-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")));
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 39);
  assert.equal(directories.length, 6);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
  }
  const rawJsonl = files.filter((file) => file.endsWith(".jsonl"));
  assert.equal(rawJsonl.length, 30);
  assert.equal(rawJsonl.every((file) => file.startsWith(
    path.join(SOURCE_DIRECTORY, "objects"))), true);
});
