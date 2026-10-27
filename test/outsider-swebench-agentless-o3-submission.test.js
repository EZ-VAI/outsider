import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  SWEBENCH_AGENTLESS_O3_GIT_TREE_HASH, SWEBENCH_AGENTLESS_O3_PROFILE,
  SWEBENCH_AGENTLESS_O3_REPLAY_HASH,
  SWEBENCH_AGENTLESS_O3_REPOSITORY, SWEBENCH_AGENTLESS_O3_REVISION,
  SWEBENCH_AGENTLESS_O3_S3_INVENTORY_HASH,
  SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE,
  acquirePinnedSwebenchAgentlessO3Source,
  buildSwebenchAgentlessO3AuditFromSource, swebenchAgentlessO3ArtifactHash,
  swebenchAgentlessO3Sha256, verifySwebenchAgentlessO3Audit,
  verifySwebenchAgentlessO3AuditWithSource,
  verifySwebenchAgentlessO3SourceDirectory,
} from "../src/outsider-swebench-agentless-o3-submission.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-swebench-agentless-o3-submission-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "swebench-agentless-o3-submission.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:0aedf04390d2f33d0c7b64bfbd3e433b814303f2b693ff113cf98fa964e3f9cf";
const EXPECTED_REPLAY_HASH =
  "sha256:7d5deefe8f910f59b9c1fc2f528a56a13e89d2082ec65beb382b1f3c569aab3b";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:4599fba8176d02804fc27e38d4022cf5694292bec02f5edeefa9351c4927c4a1";
const EXPECTED_SOURCE_ROOT =
  "sha256:c375e650c57fd6c32f6a8e1728da38ea0fcf59ede7d633e1ccb71139414d40f5";
const EXPECTED_MANIFEST_HASH =
  "sha256:298050596e510925d1438fc048423cb2d7f074aea7832f6232254bc5c3e9751b";

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

function reseal(value) {
  const { replayHash: ignoredReplay, ...replayBody } = value.replay;
  value.replay.replayHash = swebenchAgentlessO3Sha256(Buffer.from(
    `outsider/swebench-agentless-o3-safe-replay/v1\0${canonicalizeStrict(replayBody)}`,
    "utf8"));
  const { artifactHash: ignoredArtifact, ...body } = value;
  value.artifactHash = swebenchAgentlessO3ArtifactHash(body);
}

test("official commit, path chain and 29.995MB submission closure are frozen", () => {
  assert.equal(SWEBENCH_AGENTLESS_O3_REPOSITORY, "SWE-bench/experiments");
  assert.equal(SWEBENCH_AGENTLESS_O3_REVISION,
    "1faa91cade0562ba62b66c1c99e71f7b72d96f13");
  assert.equal(SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE,
    "b4a5d6aa50be28b2c3b5a12f6e203ff000579e22");
  assert.equal(SWEBENCH_AGENTLESS_O3_GIT_TREE_HASH,
    "sha256:58b4796563146ff262fe2f6c8486b4908f2cb7a581b5c25ad629e737e1625d03");
  assert.equal(SWEBENCH_AGENTLESS_O3_S3_INVENTORY_HASH,
    "sha256:a76eafd529da39e11d4a75a40e563bbd54352fbb39642dd49278887367cf9c5e");
  assert.equal(SWEBENCH_AGENTLESS_O3_REPLAY_HASH, EXPECTED_REPLAY_HASH);
  assert.deepEqual(SWEBENCH_AGENTLESS_O3_PROFILE, {
    githubSubmissionBlobs: 6, githubSubmissionBytes: 7_573,
    linkedLicenseBlobs: 1, linkedLicenseBytes: 1_070,
    s3Objects: 1_478, s3Bytes: 29_987_771,
    submissionObjects: 1_484, submissionBytes: 29_995_344,
    selectedObjectsIncludingLicenseSupport: 1_485,
    selectedBytesIncludingLicenseSupport: 29_996_414,
    predictionObjects: 1, predictionBytes: 300_081,
    trajectoryLogs: 300, trajectoryObjectsIncludingParameters: 301,
    trajectoryBytes: 1_834_434, harnessInstances: 294,
    harnessObjects: 1_176, harnessBytes: 27_853_256,
    declaredTasks: 300, noGeneration: 6, noLogs: 0, resolved: 97,
    upstreamRepositoryFamilies: 12,
  });
});

test("acquirer refuses an existing source before any fetch or seed read", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "swebench-o3-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedSwebenchAgentlessO3Source(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
      s3SeedDirectory: "/must/not/be/read",
    }), /SWEBENCH_AGENTLESS_O3_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("all Git and S3 bytes bind to before/after inventories", () => {
  const verified = verifySwebenchAgentlessO3SourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_COMPLETE_SWEBENCH_AGENTLESS_O3_SUBMISSION_PREFIX_BYTES");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 22);
  assert.equal(verified.manifest.remoteObjects.length, 1_485);
  assert.deepEqual(verified.manifest.closure, {
    githubRevision: SWEBENCH_AGENTLESS_O3_REVISION,
    githubPathChainCapturedBeforeAndAfter: true,
    githubSubmissionTree: SWEBENCH_AGENTLESS_O3_SUBMISSION_TREE,
    githubSubmissionBlobs: 6, githubSubmissionBytes: 7_573,
    s3Prefix: "lite/20250214_agentless_lite_o3_mini/",
    s3InventoryCapturedBeforeAndAfter: true, s3PagesPerPhase: 2,
    s3InventoryHash: SWEBENCH_AGENTLESS_O3_S3_INVENTORY_HASH,
    s3Objects: 1_478, s3Bytes: 29_987_771,
    completePublishedSubmissionPrefix: true,
    submissionObjects: 1_484, submissionBytes: 29_995_344,
    linkedLicenseSupportObjects: 1, linkedLicenseSupportBytes: 1_070,
    selectedObjectsIncludingLicenseSupport: 1_485,
    selectedBytesIncludingLicenseSupport: 29_996_414,
    excludedSubmissionObjects: 0, excludedSubmissionBytes: 0,
    rawTrajectoryPatchAndTestOutputStoredPrivate: true,
  });
});

test("300-task denominator retains harness failures and exhausted generation", () => {
  const value = artifact();
  assert.equal(value.replay.replayHash, EXPECTED_REPLAY_HASH);
  assert.deepEqual(value.replay.census, {
    completePublishedPassAtOneSubmissionCensus: true,
    completePublishedTaskPartition: true,
    declaredTasks: 300, harnessTasks: 294, noGeneration: 6, noLogs: 0,
    predictionTasks: 294, resolved: 97, trajectoryTasks: 300,
    unresolved: 197, upstreamOpportunityCensusComplete: false,
  });
  assert.deepEqual(value.replay.generation.finalPredictionAttemptClasses,
    { "1": 217, "2": 42, "3": 16, "4": 4, "5": 6, "6": 6,
      "7": 2, "9": 1 });
  assert.equal(value.replay.generation.predictionAttemptResponseMatches, 294);
  assert.equal(value.replay.generation.predictionFinalTemperatureMatches, 294);
  assert.equal(value.replay.generation.noGenerationWithTenResponses, 6);
  assert.equal(value.replay.generation.internalGenerationRetriesObserved, true);
  assert.equal(value.replay.generation.internalGenerationRetryIsTaskReexecution,
    false);
  assert.equal(value.replay.generation.fullRequestPromptLogged, false);
  assert.equal(value.replay.files.promptRequestPayloadAvailable, false);
});

test("patches, reports and test outputs remain harness-bound, not self-reports", () => {
  const value = artifact();
  assert.equal(value.replay.harness.reports, 294);
  assert.equal(value.replay.harness.resolved, 97);
  assert.equal(value.replay.harness.unresolved, 197);
  assert.equal(value.replay.harness.exactPredictionPatchBindings, 294);
  assert.equal(value.replay.harness.officialHarnessOutcomePresent, true);
  assert.equal(value.replay.harness.outcomeIsAgentSelfReport, false);
  assert.equal(value.replay.harness.harnessSeparatedFromAgentGeneration, true);
  assert.equal(value.replay.harness.thirdPartyIndependentOutcome, 0);
  assert.equal(value.outcome.agentSelfReportedSuccessUsed, false);
  assert.equal(value.outcome.thirdPartyIndependentOutcome, 0);
  assert.equal(value.recovery.internalRetryPromotedToExecutionRecovery, false);
  assert.equal(value.recovery.recoveryEvidence, false);
});

test("license heterogeneity, privacy and non-authority stay fail closed", () => {
  const value = artifact();
  assert.deepEqual(value.rights, {
    linkedAgentCodeLicenseAtSeparatePinnedRevision: "MIT",
    linkedAgentCodeRepository: "sorendunn/Agentless-Lite",
    linkedCodeLicensePromotedToSubmissionArtifacts: false,
    perTaskUpstreamLicenseAdjudicationComplete: false,
    productionTrainingAllowed: false, rightsDisposition: "FAIL_CLOSED",
    submissionRepositoryDetectedLicense: null,
    submissionRepositoryLicenseFilePresent: false,
    trainingRightsEstablished: false, upstreamRepositoryFamilies: 12,
    upstreamRepositoryRightsHeterogeneous: true,
  });
  assert.equal(value.privacy.rawContentStoredPrivate0600, true);
  assert.equal(value.privacy.rawContentRepublishedInReport, false);
  assert.equal(value.privacy.noPiiGuaranteePresent, false);
  assert.deepEqual(value.boundary, { action: 0, authority: 0, ceu: 0,
    credit: 0, delegation: 0, effect: 0, independentOutcome: 0,
    longitudinal: 0, network: 0, opportunity: 0, pricing: 0, training: 0 });
});

test("self-resealing cannot promote rights, recovery, outcome or completeness", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.training = 1; },
    (value) => { value.boundary.action = 1; },
    (value) => { value.outcome.thirdPartyIndependentOutcome = 1; },
    (value) => { value.outcome.agentSelfReportedSuccessUsed = true; },
    (value) => { value.recovery.internalRetryPromotedToExecutionRecovery = true; },
    (value) => { value.recovery.recoveryEvidence = true; },
    (value) => { value.completeness.completePromptCorpus = true; },
    (value) => { value.completeness.completeUpstreamOpportunityCensus = true; },
    (value) => { value.rights.linkedCodeLicensePromotedToSubmissionArtifacts = true; },
    (value) => { value.rights.productionTrainingAllowed = true; },
    (value) => { value.privacy.noPiiGuaranteePresent = true; },
    (value) => { value.replay.census.noGeneration = 0; },
    (value) => { value.replay.harness.exactPredictionPatchBindings = 293; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    reseal(changed);
    assert.equal(verifySwebenchAgentlessO3Audit(changed).ok, false);
  }
});

test("artifact rebuilds exactly and every persisted byte stays private", () => {
  const original = artifact();
  assert.equal(original.artifactHash, EXPECTED_ARTIFACT_HASH);
  const rebuilt = buildSwebenchAgentlessO3AuditFromSource(SOURCE_DIRECTORY);
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifySwebenchAgentlessO3Audit(rebuilt).ok, true);
  const bound = verifySwebenchAgentlessO3AuditWithSource(rebuilt,
    SOURCE_DIRECTORY);
  assert.equal(bound.ok, true, bound.error);
  assert.equal(bound.verificationLevel,
    "FULL_SWEBENCH_TRAJECTORY_PREDICTION_PATCH_REPORT_TEST_OUTPUT_REPLAY");
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, swebenchAgentlessO3Sha256(Buffer.from(
    `outsider/swebench-agentless-o3-artifact-manifest/v1\0${canonicalizeStrict(body)}`,
    "utf8")));
  const tree = walk(ARTIFACT_DIRECTORY);
  assert.equal(tree.files.length, 1_510);
  for (const directory of tree.directories) {
    assert.equal(lstatSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of tree.files) {
    assert.equal(lstatSync(file).mode & 0o777, 0o600, file);
  }
});
