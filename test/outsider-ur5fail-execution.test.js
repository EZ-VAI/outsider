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
  UR5FAIL_FILES, UR5FAIL_ID, UR5FAIL_PROFILE, UR5FAIL_REVISION,
  acquirePinnedUr5failSource, buildUr5failAuditFromSource,
  ur5failArtifactHash, ur5failSha256, verifyUr5failAudit,
  verifyUr5failAuditWithSource, verifyUr5failSourceDirectory,
} from "../src/outsider-ur5fail-execution.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-ur5fail-execution-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY, "ur5fail-execution.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:7b774d0d51e6d8e317d34b2d8e33b13b4dec0c3407edcb4d52270612e5d801e6";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:6052495620bfed4f5ca5c311c45cf64729c100c629395d8dd37445ffd343b6ba";
const EXPECTED_SOURCE_ROOT =
  "sha256:8de9705eefe1b90022dd77cbff3e9aaa8189522ecff487adbcfce43525568d87";
const EXPECTED_MANIFEST_HASH =
  "sha256:21b146ba499ef75d152bdbb0fdf3f0b1675164759208140bc068c3052981b67f";

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

test("official revision and complete nine-object repository are frozen", () => {
  assert.equal(UR5FAIL_ID, "paulpacaud/ur5fail_test_dataset");
  assert.equal(UR5FAIL_REVISION,
    "fedfcb3346b92f6a2bfeb14dc254635c9a5013f1");
  assert.deepEqual(UR5FAIL_PROFILE, {
    usedStorage: 110_716_350,
    treeFiles: 9,
    treeBytes: 56_243_131,
    selectedObjects: 9,
    selectedBytes: 56_243_131,
    archiveBytes: 54_848_824,
    executionSamples: 140,
    executionImageReferences: 840,
    executionUniqueImages: 510,
    archivePngFiles: 523,
    archiveUnreferencedPngFiles: 13,
    executionSuccesses: 69,
    executionFailures: 71,
    planningSamples: 140,
    planningSuccesses: 70,
    planningFailures: 70,
    imageWidth: 256,
    imageHeight: 256,
    viewpoints: 3,
  });
  assert.equal(UR5FAIL_FILES.length, 9);
  assert.equal(UR5FAIL_FILES.reduce((sum, entry) => sum + entry.bytes, 0),
    56_243_131);
  assert.equal(UR5FAIL_FILES.find((entry) => entry.path === "records.tar.gz")?.lfs,
    "ef56f7b0c4e196a758a8571ee24acafba5f27043102b55e25d32f423d79f45e1");
});

test("acquirer refuses an existing source before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "ur5fail-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedUr5failSource(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /UR5FAIL_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("official record, full tree and every repository object bind twice", () => {
  const verified = verifyUr5failSourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_COMPLETE_UR5FAIL_REPOSITORY_BYTES");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 4);
  assert.equal(verified.manifest.remoteObjects.length, 9);
  assert.equal(verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + entry.bytes, 0), 56_243_131);
  assert.deepEqual(verified.manifest.closure, {
    selectedObjects: 9,
    selectedBytes: 56_243_131,
    completeRepositoryBytes: true,
    archiveObjects: 1,
    executionMetadataObjects: 1,
    planningMetadataObjects: 1,
    derivedInternvlObjects: 4,
    rootSupportObjects: 2,
    excludedObjects: 0,
  });
});

test("all execution and planning labels replay with exact category counts", () => {
  const replay = artifact().replay;
  assert.deepEqual(replay.execution, {
    samples: 140, imageReferences: 840, uniqueImages: 510,
    successes: 69, failures: 71,
    categoryCounts: { ground_truth: 69, "no progress": 1, no_close: 13,
      slip: 1, translation_object: 16, translation_target: 1,
      "wrong object manipulated": 8, "wrong object state or placement": 19,
      wrong_object: 12 },
    taskvars: 23, taskEpisodePairs: 56,
    allPlanningRewardsOne: true, labelsPublisherManual: true,
  });
  assert.deepEqual(replay.planning, {
    samples: 140, imageReferences: 140, uniqueImages: 38,
    successes: 70, failures: 70,
    categoryCounts: { "contradictory subtasks": 11, ground_truth: 70,
      "missing subtask": 20, "wrong object manipulated": 13,
      "wrong object state or placement": 16, "wrong order": 10 },
    failuresPublisherDescribedAsSynthetic: true,
  });
});

test("tar and four derived corpora close every reference without extraction", () => {
  const replay = artifact().replay;
  assert.deepEqual(replay.archive, {
    regularPngFiles: 523, directoryMembers: 131, totalPngBytes: 54_763_820,
    width: 256, height: 256, allExecutionReferencesClosed: true,
    referencedExecutionPngFiles: 510, unreferencedPngFiles: 13,
    allArchiveImagesReferencedByExecutionMetadata: false,
    unreferencedPathsHash:
      "sha256:c75af6f5c767929b9030636d0100020d4598f926d699fee7d43ed8fc3b0d607c",
    planningReferencesSubset: true, membersExtractedToWorkspace: false,
    imageClosureHash:
      "sha256:50320016d0c515ebf32120e16edaf754fe16457af4937915ce6ad06641262f61",
  });
  assert.deepEqual(replay.derived, {
    "internVL_dataset_execution_thinking.jsonl": {
      imageReferences: 840, rows: 140, uniqueImageReferences: 510 },
    "internVL_dataset_execution_vanilla.jsonl": {
      imageReferences: 840, rows: 140, uniqueImageReferences: 510 },
    "internVL_dataset_planning_thinking.jsonl": {
      imageReferences: 140, rows: 140, uniqueImageReferences: 38 },
    "internVL_dataset_planning_vanilla.jsonl": {
      imageReferences: 140, rows: 140, uniqueImageReferences: 38 },
  });
});

test("physical provenance, outcome, completeness and authority stay bounded", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.deepEqual(value.physicalProvenance, {
    publisherClaimsAutonomousPolicy: true,
    publisherClaimsRealUr5Robot: true,
    publisherClaimsThreeRealSenseCameras: true,
    realRobotIdentityIndependentlyVerified: false,
  });
  assert.deepEqual(value.outcome, {
    executionFailures: 71, executionLabelsPublisherManual: true,
    executionSuccesses: 69, independentOutcome: 0, longitudinalOutcome: 0,
    planningFailuresPublisherSynthetic: true,
  });
  assert.deepEqual(value.morphology, {
    actionStreamAvailable: false, continuousTrajectoryAvailable: false,
    endpointTripletNamingValidated: true, failureToRecoveryPairAvailable: false,
    pngByteStructureReplayComplete: true, recoveryEpisodeAvailable: false,
    startAndEndThreeViewImagesAvailable: true, stateStreamAvailable: false,
    visualContentReviewed: false,
  });
  assert.deepEqual(value.completeness, {
    all840ExecutionImageReferencesClosed: true,
    allArchiveImagesReferencedByExecutionMetadata: false,
    archiveMembersExtracted: false, archivePngFiles: 523,
    completeAttemptCensus: false, completePublishedExecutionMetadata: true,
    completeRepositoryBytes: true, orphanImagesAssignableToPublishedAttempts: false,
    publisherDiscardedAttemptsUnknown: true, uniqueExecutionImages: 510,
    unreferencedArchiveImages: 13,
    visualOutcomeIndependentlyAdjudicated: false,
  });
  assert.deepEqual(value.rights, {
    datasetCardClaim: "Apache-2.0", evaluationUseFinallyAdjudicated: false,
    productionTrainingAllowed: false, repositoryLicenseFilePresent: false,
  });
  assert.deepEqual(value.privacy, {
    noPersonalInformationGuarantee: false, physicalSceneImagesPresent: true,
    privacyReviewComplete: false, publicAvailabilityResolvesPrivacy: false,
  });
  assert.deepEqual(value.boundary, {
    training: 0, network: 0, CEU: 0, authority: 0, action: 0,
    opportunity: 0, delegation: 0, independentOutcome: 0,
    longitudinalOutcome: 0,
  });
});

test("self-resealing cannot promote endpoints, labels, rights or completeness", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.action = 1; },
    (value) => { value.physicalProvenance.realRobotIdentityIndependentlyVerified = true; },
    (value) => { value.outcome.independentOutcome = 1; },
    (value) => { value.outcome.longitudinalOutcome = 1; },
    (value) => { value.morphology.continuousTrajectoryAvailable = true; },
    (value) => { value.morphology.recoveryEpisodeAvailable = true; },
    (value) => { value.morphology.visualContentReviewed = true; },
    (value) => { value.completeness.completeAttemptCensus = true; },
    (value) => { value.completeness.allArchiveImagesReferencedByExecutionMetadata = true; },
    (value) => { value.completeness.orphanImagesAssignableToPublishedAttempts = true; },
    (value) => { value.rights.productionTrainingAllowed = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = ur5failArtifactHash(body);
    assert.equal(verifyUr5failAudit(changed).ok, false,
      canonicalizeStrict(changed));
  }
});

test("artifact rebuilds exactly and every acquired byte is private", () => {
  const original = artifact();
  const rebuilt = buildUr5failAuditFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyUr5failAudit(rebuilt).ok, true);
  const bound = verifyUr5failAuditWithSource(rebuilt, SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(bound.ok, true, bound.error);
  assert.equal(bound.verificationLevel,
    "FULL_UR5FAIL_METADATA_TAR_PNG_AND_DERIVED_REFERENCE_REPLAY");
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, ur5failSha256(Buffer.from(
    `outsider/ur5fail-execution-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")));
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 16);
  assert.equal(directories.length, 6);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
  }
});
