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
  MOLMOACT2_SO101_FILES, MOLMOACT2_SO101_ID, MOLMOACT2_SO101_PROFILE,
  MOLMOACT2_SO101_REVISION, acquirePinnedMolmoact2So101Source,
  buildMolmoact2So101AuditFromSource, molmoact2So101ArtifactHash,
  molmoact2So101Sha256, verifyMolmoact2So101Audit,
  verifyMolmoact2So101SourceDirectory,
} from "../src/outsider-molmoact2-so101-zero-shot-eval.js";

const ARTIFACT_DIRECTORY = path.resolve(
  "artifacts/outsider-molmoact2-so101-zero-shot-eval-20260829-v1");
const SOURCE_DIRECTORY = path.join(ARTIFACT_DIRECTORY, "source");
const REPORT_PATH = path.join(ARTIFACT_DIRECTORY,
  "molmoact2-so101-zero-shot-eval.json");
const MANIFEST_PATH = path.join(ARTIFACT_DIRECTORY, "artifact-manifest.json");
const EXPECTED_ARTIFACT_HASH =
  "sha256:81c03a9320393018456a3b9da3ab972b6d1a2b467784fb656878c2853fe8ab85";
const EXPECTED_SOURCE_MANIFEST_HASH =
  "sha256:56e4c4a1c6f9877765f0e7f4bc735a61fa7ee354ee6e7af9860ca9bbb3faf36c";
const EXPECTED_SOURCE_ROOT =
  "sha256:d34c6367e8a5556574e522bddaa8aec4edaef0be61830e6c0f623a4b5c9ec443";
const EXPECTED_MANIFEST_HASH =
  "sha256:b67e945da0fb3c862f5d7c039183801e1d71e7a4d35931766882330fc13d6e84";

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

test("official dataset and complete nine-object profile are frozen", () => {
  assert.equal(MOLMOACT2_SO101_ID,
    "abdul004/molmoact2-so101-zero-shot-eval");
  assert.equal(MOLMOACT2_SO101_REVISION,
    "e228b32ac68d65bf94c34abce434faa8fbfd0e2d");
  assert.deepEqual(MOLMOACT2_SO101_PROFILE, {
    usedStorage: 136_775_845,
    treeEntries: 13,
    repositoryFiles: 9,
    selectedObjects: 9,
    selectedBytes: 64_921_495,
    parquetRows: 688,
    traces: 2,
    observationEvents: 344,
    actionChunkEvents: 40,
    appliedActionEvents: 605,
    gifObjects: 2,
    cameras: 2,
    actionDimensions: 6,
  });
  assert.equal(MOLMOACT2_SO101_FILES.length, 9);
  assert.equal(MOLMOACT2_SO101_FILES.reduce((sum, entry) =>
    sum + entry.bytes, 0), 64_921_495);
  assert.equal(MOLMOACT2_SO101_FILES.filter((entry) =>
    entry.path.endsWith(".gif")).length, 2);
});

test("acquirer refuses an existing source before any fetch", async () => {
  const parent = mkdtempSync(path.join(os.tmpdir(), "molmoact2-no-clobber-"));
  const target = path.join(parent, "existing");
  mkdirSync(target, { mode: 0o700 });
  let fetches = 0;
  try {
    await assert.rejects(acquirePinnedMolmoact2So101Source(target, {
      fetchImpl: async () => { fetches += 1; throw new Error("must not fetch"); },
    }), /MOLMOACT2_SO101_SOURCE_EXISTS/u);
    assert.equal(fetches, 0);
  } finally {
    chmodSync(target, 0o700);
    rmSync(parent, { recursive: true, force: true });
  }
});

test("source binds official repository and full tree before and after", () => {
  const verified = verifyMolmoact2So101SourceDirectory(SOURCE_DIRECTORY);
  assert.equal(verified.ok, true, verified.error);
  assert.equal(verified.verificationLevel,
    "PINNED_COMPLETE_REPOSITORY_AND_DECLARED_TWO_TRACE_RUN_SET");
  assert.equal(verified.manifest.manifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(verified.manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  assert.equal(verified.manifest.apiSnapshots.length, 4);
  assert.equal(verified.manifest.remoteObjects.length, 9);
  assert.equal(verified.manifest.remoteObjects.reduce((sum, entry) =>
    sum + entry.bytes, 0), 64_921_495);
  assert.deepEqual(verified.manifest.closure, {
    selectedObjects: 9,
    selectedBytes: 64_921_495,
    completeRepositoryBytes: true,
    completeDeclaredTwoTraceRunSet: true,
    eventLogs: 2,
    metadataFiles: 2,
    gifObjects: 2,
    parquetObjects: 1,
    excludedObjects: 0,
    excludedBytes: 0,
  });
});

test("all embedded frame rows replay with publisher-native failed labels", () => {
  const value = artifact();
  assert.equal(value.artifactHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(value.replay.parquet.rows, 688);
  assert.deepEqual(value.replay.parquet.columns,
    ["image", "camera", "trace_id", "frame_index", "task", "result"]);
  assert.deepEqual(value.replay.parquet.traceRows, {
    trace_20260530_032416: 320,
    trace_20260530_032614: 368,
  });
  assert.deepEqual(value.replay.parquet.cameraRows, { overhead: 344, wrist: 344 });
  assert.deepEqual(value.replay.parquet.resultRows, { failed: 688 });
  assert.equal(value.replay.parquet.jpegImages, 688);
  assert.equal(value.replay.parquet.embeddedImageBytes, 53_728_286);
  assert.equal(value.replay.parquet.frameContinuityByTraceAndCamera, true);
});

test("raw event/action logs and both GIFs replay as two bounded traces", () => {
  const value = artifact();
  assert.deepEqual(value.replay.totals, {
    actionChunkEvents: 40,
    appliedActionEvents: 605,
    gifBytes: 10_365_501,
    gifFrames: 114,
    observationEvents: 344,
    traces: 2,
  });
  assert.deepEqual(value.replay.traces.map((trace) => ({
    id: trace.traceId,
    observations: trace.events.observationEvents,
    chunks: trace.events.actionChunkEvents,
    applied: trace.events.appliedActionEvents,
    rawEqualsClamped: trace.events.rawEqualsClampedAppliedActions,
    performed: trace.events.clampedEqualsPerformedAppliedActions,
    gif: trace.gif,
  })), [
    { id: "trace_20260530_032416", observations: 160, chunks: 19,
      applied: 286, rawEqualsClamped: 286, performed: 286,
      gif: { bytes: 4_646_302, frames: 53, height: 360,
        structureReplayComplete: true, width: 480 } },
    { id: "trace_20260530_032614", observations: 184, chunks: 21,
      applied: 319, rawEqualsClamped: 319, performed: 319,
      gif: { bytes: 5_719_199, frames: 61, height: 360,
        structureReplayComplete: true, width: 480 } },
  ]);
});

test("working transport is distinguished from failed tasks and authority", () => {
  const value = artifact();
  assert.deepEqual(value.transportAndExecution, {
    actionAuthorityConferred: false,
    networkPermissionConferred: false,
    physicalExecutionIndependentlyVerified: false,
    publisherClaimsContinuousActionStreaming: true,
    publisherClaimsRemoteInferenceBroughtUp: true,
    publisherClaimsRobotExecutedActions: true,
    rawActionChunkEvents: 40,
    rawAppliedActionEvents: 605,
    rawObservationEvents: 344,
    sourceNativeAppliedActionRecordsPresent: true,
    transportWorkingIndependentlyVerified: false,
  });
  assert.deepEqual(value.taskOutcome, {
    failureTraces: 2,
    independentOutcome: 0,
    longitudinalOutcome: 0,
    publishedTraces: 2,
    publisherClassifiesBothTasksIncomplete: true,
    publisherNativeFailedResultRows: 688,
    recoveryPairs: 0,
    successTraces: 0,
  });
  assert.equal(value.conclusion.taskLevelFailurePromotedToNetworkFailure, false);
  assert.equal(value.conclusion.publisherTracePromotedToIndependentOutcome, false);
  assert.equal(value.completeness.completeAttemptCensus, false);
  assert.equal(value.completeness.otherAttemptedOrDiscardedRunsUnknown, true);
  assert.deepEqual(value.rights, {
    datasetCardClaim: "apache-2.0",
    evaluationUseFinallyAdjudicated: false,
    productionTrainingAllowed: false,
    repositoryLicenseFilePresent: false,
  });
  assert.deepEqual(value.privacy, {
    noPersonalInformationGuarantee: false,
    privacyReviewComplete: false,
    publicAvailabilityResolvesPrivacy: false,
    rawSourceContainsHistoricalNetworkEndpoint: true,
    rawSourceContainsLocalDeviceIdentifier: true,
    rawSourceContainsSceneImages: true,
    sensitiveValuesRepublishedInReport: false,
  });
  assert.deepEqual(value.boundary, {
    training: 0, network: 0, CEU: 0, authority: 0, action: 0,
    opportunity: 0, delegation: 0, independentOutcome: 0,
    longitudinalOutcome: 0,
  });
});

test("self-resealing cannot promote publisher traces, rights or privacy", () => {
  const original = artifact();
  const attacks = [
    (value) => { value.boundary.network = 1; },
    (value) => { value.boundary.action = 1; },
    (value) => { value.transportAndExecution.transportWorkingIndependentlyVerified = true; },
    (value) => { value.transportAndExecution.physicalExecutionIndependentlyVerified = true; },
    (value) => { value.transportAndExecution.actionAuthorityConferred = true; },
    (value) => { value.taskOutcome.independentOutcome = 1; },
    (value) => { value.taskOutcome.recoveryPairs = 1; },
    (value) => { value.conclusion.taskLevelFailurePromotedToNetworkFailure = true; },
    (value) => { value.conclusion.rawAppliedActionRecordPromotedToIndependentPhysicalEffect = true; },
    (value) => { value.completeness.completeAttemptCensus = true; },
    (value) => { value.completeness.visualOutcomeIndependentlyAdjudicated = true; },
    (value) => { value.rights.productionTrainingAllowed = true; },
    (value) => { value.privacy.privacyReviewComplete = true; },
    (value) => { value.privacy.sensitiveValuesRepublishedInReport = true; },
  ];
  for (const attack of attacks) {
    const changed = structuredClone(original);
    attack(changed);
    const { artifactHash: ignored, ...body } = changed;
    changed.artifactHash = molmoact2So101ArtifactHash(body);
    assert.equal(verifyMolmoact2So101Audit(changed).ok, false,
      canonicalizeStrict(changed));
  }
});

test("artifact rebuilds exactly and every acquired byte is private", () => {
  const original = artifact();
  const rebuilt = buildMolmoact2So101AuditFromSource(SOURCE_DIRECTORY,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(canonicalizeStrict(rebuilt), canonicalizeStrict(original));
  assert.equal(verifyMolmoact2So101Audit(rebuilt).ok, true);
  const manifest = readJson(MANIFEST_PATH);
  assert.equal(manifest.manifestHash, EXPECTED_MANIFEST_HASH);
  assert.equal(manifest.reportHash, EXPECTED_ARTIFACT_HASH);
  assert.equal(manifest.sourceManifestHash, EXPECTED_SOURCE_MANIFEST_HASH);
  assert.equal(manifest.sourceRoot, EXPECTED_SOURCE_ROOT);
  const { manifestHash, ...body } = manifest;
  assert.equal(manifestHash, molmoact2So101Sha256(Buffer.from(
    `outsider/molmoact2-so101-zero-shot-artifact-manifest/v1\0${
      canonicalizeStrict(body)}`, "utf8")));
  const { files, directories } = walk(ARTIFACT_DIRECTORY);
  assert.equal(files.length, 16);
  assert.equal(directories.length, 10);
  for (const directory of directories) {
    assert.equal(statSync(directory).mode & 0o777, 0o700, directory);
  }
  for (const file of files) {
    assert.equal(statSync(file).mode & 0o777, 0o600, file);
  }
});
