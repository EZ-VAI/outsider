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
  FAILBENCH_LIBERO_FILES, FAILBENCH_LIBERO_ID, FAILBENCH_LIBERO_PROFILE,
  FAILBENCH_LIBERO_REVISION, FAILBENCH_LIBERO_SPLIT, FAILBENCH_LIBERO_TASK,
  FAILBENCH_LIBERO_TREE_HASH, acquirePinnedFailbenchLiberoSource,
  buildFailbenchLiberoAuditFromSource, failbenchLiberoArtifactHash,
  failbenchLiberoSha256, verifyFailbenchLiberoAudit,
  verifyFailbenchLiberoAuditWithSource, verifyFailbenchLiberoSourceDirectory,
} from "../src/outsider-failbench-libero-target-task.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-failbench-libero-target-task-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "failbench-libero-target-task.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:165c8be4eb10ac10d7455487074d8b181969137b9b9450105f753c5a61c4ab1d";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:bcf1c32b10ea26a8d7be284c1fccc72dd560621c205ecaa159eba766ba599fef";
const EXPECTED_SOURCE_ROOT =
  "sha256:f1297be90a6c182a1e9691b8bf6364bc98cf7045ea1ede710184fba7b1aa4474";
const EXPECTED_MANIFEST_HASH =
  "sha256:a15821d059f155945af85abf0070c312297d738e8b554c1c6f2835da5d2db3fc";

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

test("official revision, full tree and minimal target-cache selection are frozen", () => {
  assert.equal(FAILBENCH_LIBERO_ID, "aaronngx/failbench-libero-v2");
  assert.equal(FAILBENCH_LIBERO_REVISION,
    "32ae05d04fadf4005dfa50a6ff4199b8bc29923e");
  assert.equal(FAILBENCH_LIBERO_SPLIT, "libero_goal");
  assert.equal(FAILBENCH_LIBERO_TASK, "turn_on_the_stove");
  assert.equal(FAILBENCH_LIBERO_TREE_HASH,
    "sha256:33b3c3b75add4009a3f7546e44965cdb9ff27b643c4e3b1777e21fcece929e16");
  assert.deepEqual(FAILBENCH_LIBERO_PROFILE, {
    usedStorage: 191_382_817_871,
    treeEntries: 99,
    treeDirectories: 14,
    treeFiles: 85,
    treeBytes: 191_394_194_500,
    lfsFiles: 60,
    lfsBytes: 191_382_817_871,
    rawTaskHdf5Files: 30,
    rawTaskHdf5Bytes: 189_538_198_315,
    targetCacheHdf5Files: 30,
    targetCacheHdf5Bytes: 1_844_619_556,
    selectedObjects: 4,
    selectedBytes: 14_117_155,
    selectedTargetCacheBytes: 10_953_680,
    correspondingRawTaskBytes: 5_687_181_286,
    fullManifestRows: 15_000,
    fullManifestTasks: 10,
    selectedTrials: 1_500,
    failureModes: 5,
    progressBins: 10,
  });
  assert.equal(FAILBENCH_LIBERO_FILES.length, 4);
  assert.equal(FAILBENCH_LIBERO_FILES.reduce((sum, entry) =>
    sum + entry.bytes, 0), 14_117_155);
  assert.equal(FAILBENCH_LIBERO_FILES.find((entry) => entry.path.endsWith(
    "turn_on_the_stove.h5"))?.lfs,
  "24acefc5306cf3d44521d3be66c4d13df871b5041dc32f87fee0d2b16e62ad96");
});

test("acquirer refuses an existing source before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "failbench-libero-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedFailbenchLiberoSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /FAILBENCH_LIBERO_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("official record and all 99 recursive tree entries bind before and after", () => {
  const verified = verifyFailbenchLiberoSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_FAILBENCH_FULL_TREE_AND_COMPLETE_TARGET_TASK_CACHE");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 4);
  assert.equal(verified.manifest.remoteObjects.length, 4);
  assert.equal(verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + entry.bytes, 0), 14_117_155);
  assert.deepEqual(verified.manifest.closure, {
    selectedObjects: 4,
    selectedBytes: 14_117_155,
    completeRecursiveTreeCapturedBeforeAndAfter: true,
    recursiveTreePagesPerPhase: 1,
    recursiveTreeEntries: 99,
    recursiveTreeFiles: 85,
    recursiveTreeBytes: 191_394_194_500,
    recursiveTreeHash: FAILBENCH_LIBERO_TREE_HASH,
    completeSelectedTargetCacheHdf5: true,
    completeSelectedSplitManifest: true,
    completePublisherQuarantineLedger: true,
    rootReadmeSelected: true,
    rawTaskHdf5Selected: false,
    correspondingRawTaskBytesExcluded: 5_687_181_286,
    boundedClosureUnder300MB: true,
  });
});

test("full manifest supplies all five injection modes and ten progress strata", () => {
  const replay = artifact().replay;
  assert.equal(replay.manifest.rows, 15_000);
  assert.equal(replay.manifest.tasks, 10);
  assert.equal(replay.manifest.rowsPerTask, 1_500);
  assert.equal(replay.manifest.absoluteBuildPathRows, 15_000);
  assert.equal(replay.selectedTask.trials, 1_500);
  assert.deepEqual(replay.selectedTask.failureModeCounts, {
    ALL_JOINTS: 119, GRIPPER_OPEN: 351, MULTI_JOINT: 128,
    SINGLE_JOINT: 661, SLIPPERY_GRIP: 241,
  });
  assert.deepEqual(replay.selectedTask.progressBins, {
    0: { rows: 150, progressMin: 0.0514, progressMax: 0.1347 },
    1: { rows: 150, progressMin: 0.1352, progressMax: 0.2196 },
    2: { rows: 150, progressMin: 0.2215, progressMax: 0.3049 },
    3: { rows: 150, progressMin: 0.3051, progressMax: 0.3887 },
    4: { rows: 150, progressMin: 0.3901, progressMax: 0.4749 },
    5: { rows: 150, progressMin: 0.4754, progressMax: 0.5593 },
    6: { rows: 150, progressMin: 0.5602, progressMax: 0.6447 },
    7: { rows: 150, progressMin: 0.6453, progressMax: 0.7299 },
    8: { rows: 150, progressMin: 0.7307, progressMax: 0.8147 },
    9: { rows: 150, progressMin: 0.8152, progressMax: 0.9 },
  });
  assert.equal(replay.selectedTask.demos, 50);
  assert.equal(replay.selectedTask.seeds, 1_500);
  assert.equal(replay.selectedTask.uniqueProgressValues, 1_371);
});

test("h5py replays every derived projection group and its manifest crosswalk", () => {
  const replay = artifact().replay;
  assert.deepEqual(replay.targetCache, {
    allTrialsReadWithH5py: true,
    attributesPerGroup: ["failure_prob"],
    coordinateBounds: {
      u: [120.02790832519531, 221.33395385742188],
      v: [75.44967651367188, 163.22894287109375],
    },
    datasetsPerGroup: ["projection"], derivativeProjectionCache: true,
    failureModeAttributePresent: false,
    failureProbabilityManifestMatches: true,
    forceBounds: [1.0001130104064941, 13538.162109375],
    logicalProjectionHash:
      "sha256:a8acdbc6e2e64a1488cbd29b2e555759db5192b19748269b3de09d6dbda5d632",
    maximumProjectionRowsPerTrial: 4_091,
    minimumProjectionRowsPerTrial: 0,
    nonzeroProjectionTrials: 811,
    projectionColumns: 3, projectionDtype: "float32",
    projectionRows: 391_541, rootAttributes: [],
    trajProgressAttributePresent: false,
    trialGroups: 1_500, trialIdsExactlyMatchManifest: true,
    zeroProjectionTrials: 689,
  });
  assert.deepEqual(replay.crosswalk.rawContactToFilteredCache, {
    "rawPositive|cachePositive": 811,
    "rawPositive|cacheZero": 109,
    "rawZero|cacheZero": 580,
  });
  assert.deepEqual(replay.crosswalk.failureModeToCache, {
    ALL_JOINTS: { nonzero: 113, zero: 6 },
    GRIPPER_OPEN: { nonzero: 114, zero: 237 },
    MULTI_JOINT: { nonzero: 87, zero: 41 },
    SINGLE_JOINT: { nonzero: 424, zero: 237 },
    SLIPPERY_GRIP: { nonzero: 73, zero: 168 },
  });
  assert.deepEqual(replay.quarantine, {
    liberoRows: 0, rows: 346, selectedTaskRows: 0,
    sourceCounts: { robocasa: 346 },
  });
});

test("simulation, derived-target, rights and outcome boundaries stay explicit", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.deepEqual(value.evidenceClass, {
    contactPredictionTarget: true, independentOutcome: 0,
    injectedFailureCondition: true, liberoSimulation: true,
    longitudinalOutcome: 0, physicalOutcome: false,
    publisherDescribesTeleopDemoBase: true, realRobotExecution: false,
    targetCacheIsDerivedFromFailureInducedFilteredContacts: true,
  });
  assert.deepEqual(value.semantics, {
    failureModeIsInjectedConditionNotObservedTerminalOutcome: true,
    projectionIsDerivedSupervisionTarget: true,
    rawActionStreamInClosure: false, rawImageStreamInClosure: false,
    rawStateStreamInClosure: false, recoveryExecutionInClosure: false,
    sourceNativeTerminalFailureFieldInClosure: false,
    sourceNativeTerminalSuccessFieldInClosure: false,
    trajProgressIsInjectionPointNotTaskOutcome: true,
  });
  assert.deepEqual(value.completeness, {
    completeAttemptCensus: false, completeDatasetBytes: false,
    completePinnedRecursiveTreeMetadata: true,
    completePublisherQuarantineLedgerBytes: true,
    completeRawTaskHdf5: false,
    completeSelectedPublishedTargetGroupCensus: true,
    completeSelectedSplitManifestBytes: true,
    completeSelectedTargetTaskCacheBytes: true,
    noLiberoQuarantineRowsDoesNotProveNoDiscardedGenerationAttempts: true,
    publisherQuarantineContainsNoLiberoRowsAtPin: true,
    selectedPublishedTargetGroups: 1_500,
  });
  assert.deepEqual(value.rights, {
    datasetCardClaim: "MIT", evaluationUseFinallyAdjudicated: false,
    productionTrainingAllowed: false, readmeClaim: "MIT",
    readmeSaysUnderlyingDemoContentRemainsUnderUpstreamLiberoLicense: true,
    repositoryLicenseFilePresent: false,
    upstreamLiberoLicenseIncludedInClosure: false,
  });
  assert.deepEqual(value.privacy, {
    absoluteBuildPathValuesRepublishedInReport: false,
    humanImagesSelected: false, privacyReviewComplete: false,
    publicAvailabilityResolvesPrivacy: false,
    rawManifestContainsAbsoluteBuildPaths: true,
  });
  assert.deepEqual(value.boundary, {
    training: 0, network: 0, CEU: 0, authority: 0, action: 0,
    opportunity: 0, delegation: 0, independentOutcome: 0,
    longitudinalOutcome: 0,
  });
});

test("self-resealing cannot promote a target cache into execution evidence", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.action = 1; },
    (value) => { value.selection.correspondingRawTaskHdf5Selected = true; },
    (value) => { value.replay.targetCache.failureModeAttributePresent = true; },
    (value) => { value.replay.targetCache.trajProgressAttributePresent = true; },
    (value) => { value.evidenceClass.realRobotExecution = true; },
    (value) => { value.evidenceClass.physicalOutcome = true; },
    (value) => { value.evidenceClass.independentOutcome = 1; },
    (value) => { value.semantics.recoveryExecutionInClosure = true; },
    (value) => { value.completeness.completeRawTaskHdf5 = true; },
    (value) => { value.completeness.completeAttemptCensus = true; },
    (value) => { value.rights.productionTrainingAllowed = true; },
    (value) => { value.privacy.absoluteBuildPathValuesRepublishedInReport = true; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = failbenchLiberoArtifactHash(body);
    assert.equal(verifyFailbenchLiberoAudit(changed).ok, false,
      canonicalizeStrict(changed));
  }
});

test("artifact rebuilds exactly and every selected source byte is private", () => {
  const original = artifact();
  const rebuilt = buildFailbenchLiberoAuditFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyFailbenchLiberoAudit(rebuilt).ok, true);
  const bound = verifyFailbenchLiberoAuditWithSource(rebuilt, SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(bound.ok, true, bound.error);
  assert.equal(bound.verificationLevel,
    "FULL_FAILBENCH_MANIFEST_TARGET_HDF5_AND_QUARANTINE_REPLAY");
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, failbenchLiberoSha256(Buffer.from(
    `outsider/failbench-libero-target-task-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")));
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 11);
  assert.equal(directories.length, 10);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
  }
});
