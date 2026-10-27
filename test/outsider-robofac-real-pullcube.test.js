import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  ROBOFAC_ARXIV_VERSION,
  ROBOFAC_CODE_COMMIT,
  ROBOFAC_CODE_TREE,
  ROBOFAC_DATASET_ID,
  ROBOFAC_DATASET_REVISION,
  ROBOFAC_REPORT_SCHEMA,
  acquireRoboFacRealPullCubeSource,
  buildRoboFacRealPullCubeReport,
  roboFacDigest,
  roboFacSha256,
  verifyRoboFacRealPullCubeReport,
  verifyRoboFacRealPullCubeSource,
} from "../src/outsider-robofac-real-pullcube.js";

const artifact = path.resolve(
  "artifacts/outsider-robofac-real-pullcube-20260829-v1");
const source = path.join(artifact, "source");
const reportFile = path.join(artifact, "robofac-real-pullcube.json");
const receiptFile = path.join(artifact, "run-receipt.json");
const artifactManifestFile = path.join(artifact, "artifact-manifest.json");
const report = JSON.parse(readFileSync(reportFile, "utf8"));
const receipt = JSON.parse(readFileSync(receiptFile, "utf8"));
const artifactManifest = JSON.parse(readFileSync(artifactManifestFile, "utf8"));

function reseal(changed) {
  const { artifactHash: ignored, ...base } = changed;
  return { ...base, artifactHash: roboFacDigest(base, ROBOFAC_REPORT_SCHEMA) };
}

test("official producer chain, immutable revisions, and full HF tree are pinned", () => {
  assert.equal(ROBOFAC_DATASET_ID, "MINT-SJTU/RoboFAC-dataset");
  assert.equal(ROBOFAC_DATASET_REVISION,
    "d18353ab36db82ff888ebc9e8485c9fa77e1b25b");
  assert.equal(ROBOFAC_CODE_COMMIT,
    "638eb5320d409e4072710a0db26f1c0d68cef3de");
  assert.equal(ROBOFAC_CODE_TREE,
    "cbd62628ae16f8fd275c500ce44d35a33a01f124");
  assert.equal(ROBOFAC_ARXIV_VERSION, "v4");
  assert.deepEqual(report.repositoryInventory, {
    bytes: 25_771_018_505,
    directories: 824,
    entries: 13_563,
    files: 12_739,
    pages: 14,
    publisherCardErroneousTrajectoryClaim: 9_440,
    publisherCardQaPairClaim: 78_623,
    publisherCardSuccessfulReferenceClaim: 1_282,
    treeSnapshotHash:
      "sha256:c693f974660a63138c93b8d9f45d8cb96899626d7aae6011aa0c6357bd7afac8",
    usedStorage: 25_800_271_397,
    wholeClaimedCorpusRowsReplayed: false,
  });
  assert.equal(report.source.zenodoExactNameQueryHits, 0);
});

test("all selected bytes and bracketed controls replay from the private source", () => {
  const verified = verifyRoboFacRealPullCubeSource(source);
  assert.equal(verified.ok, true);
  assert.equal(verified.selectedFiles, 175);
  assert.equal(verified.selectedBytes, 270_620_557);
  assert.equal(verified.sourceRoot,
    "sha256:55135bf1d64317454a63f5bf717080346b9f721eca1f9269b4bb6792078423aa");
  assert.equal(verified.manifestHash,
    "sha256:bec7ab5a9f028a427c6ccd99d0d9a176c8c638cc695fd90bef88efcb3e7201a9");
  assert.equal(statSync(source).mode & 0o777, 0o700);
  assert.equal(statSync(path.join(source, "objects", "realworld_data",
    "so100_pull_cube_error", "videos", "chunk-000",
    "observation.images.above", "episode_000000.mp4")).mode & 0o777, 0o600);
});

test("complete real-world QA group closes views to execution correlation roots", () => {
  const qa = report.replay.qa;
  assert.equal(qa.files, 7);
  assert.equal(qa.viewRows, 1_204);
  assert.equal(qa.executionCorrelationRoots, 602);
  assert.equal(qa.qaPairs, 7_848);
  assert.equal(qa.assistantArrayValueRows, 16);
  assert.deepEqual(qa.taskViewRows, {
    InsertCylinder: 240, PickCubeInBox: 160, PullCube: 164,
    PullCubeByTool: 320, PushCube: 160, StackCube: 160,
  });
  assert.deepEqual(qa.selected, {
    cameraViews: ["above", "rightfront"], cameraViewsPerExecution: 2,
    executionCorrelationRoots: 82, outcomeViewDisagreements: 0,
    publisherFailedExecutions: 60,
    publisherHighLevelCorrectionInstructionExecutions: 60,
    publisherLowLevelCorrectionInstructionExecutions: 18,
    publisherSuccessfulReferenceExecutions: 22,
    task: "PullCube", viewRows: 164,
  });
  assert.equal(qa.rawTextProjected, false);
  assert.equal(qa.rawIdentifiersProjected, false);
  assert.equal(qa.rawVideoPathsProjected, false);
});

test("complete PullCube videos establish real executions but no executed recovery", () => {
  assert.deepEqual(report.replay.video, {
    audioInterpreted: false,
    bytes: 265_832_724,
    containerProfiles: [{ boxes: 4, files: 164,
      types: { free: 1, ftyp: 1, mdat: 1, moov: 1 } }],
    executionCorrelationRoots: 82,
    files: 164,
    pixelsInterpreted: false,
    views: ["above", "rightfront"],
    viewsPerExecution: 2,
  });
  assert.equal(report.replay.selectedTaskHasKinematicsFiles, false);
  assert.deepEqual(report.outcomesAndRecovery, {
    correctionInstructionsExecuted: 0,
    independentOutcomeUnits: 0,
    independentWitnessUnits: 0,
    linkedPostCorrectionExecutions: 0,
    longitudinalOutcomeUnits: 0,
    publisherFailureLabels: 60,
    publisherHighLevelCorrectionInstructionAnnotations: 60,
    publisherLowLevelCorrectionInstructionAnnotations: 18,
    publisherSuccessReferenceLabels: 22,
    recoveryAttemptUnits: 0,
    recoveryOutcomeUnits: 0,
    selectedPublishedExecutions: 82,
  });
  assert.equal(report.selectionAndCensus.completePublishedSelectedDirectoryCensus, true);
  assert.equal(report.selectionAndCensus.completeCollectionAttemptCensus, false);
  assert.equal(report.selectionAndCensus.excludedOrUnpublishedAttemptCount, null);
  assert.equal(report.truth.physicalRobotVideoBytesPresent, true);
  assert.equal(report.truth.executedRecoveryEstablished, false);
  assert.equal(report.truth.independentOutcomeEstablished, false);
});

test("rights, privacy, and zero authority cannot be promoted by a self-sealed report", () => {
  assert.deepEqual(report.rights, {
    codeLicenseAppliesToDatasetFinallyAdjudicated: false,
    codeRepositoryLicense: "MIT", datasetCardClaim: "MIT",
    datasetLicenseFilePresent: false, evaluationUseFinallyAdjudicated: false,
    productionTrainingAuthorized: false, rightsFinallyAdjudicated: false,
    upstreamSceneObjectAndMediaRightsResolved: false,
  });
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.noPiiEstablished, false);
  assert.equal(report.privacy.privacyReviewComplete, false);
  assert.deepEqual(report.boundary, {
    CEU: 0, actionAuthority: 0, authority: 0, delegation: 0,
    independentOutcome: 0, longitudinalOutcome: 0, network: 0,
    opportunity: 0, pricing: 0, training: 0,
  });
  assert.deepEqual(buildRoboFacRealPullCubeReport(source), report);
  assert.equal(verifyRoboFacRealPullCubeReport(report, source).ok, true);

  const attack = structuredClone(report);
  attack.outcomesAndRecovery.recoveryOutcomeUnits = 1;
  attack.truth.executedRecoveryEstablished = true;
  attack.rights.productionTrainingAuthorized = true;
  attack.boundary.training = 1;
  assert.throws(() => verifyRoboFacRealPullCubeReport(reseal(attack), source),
    /ROBOFAC_REPORT_NOT_FULL_SOURCE_DERIVED/u);
});

test("artifact hashes are exact and acquisition refuses clobber before network", async () => {
  const reportBytes = readFileSync(reportFile);
  const receiptBytes = readFileSync(receiptFile);
  assert.equal(report.artifactHash,
    "sha256:adf3e323ca105999387023d55c076afe8bafc29cc57f8383213d385b762e9eb6");
  assert.equal(receipt.receiptHash,
    "sha256:e0f4e100d5e45149e5954f395c2e0898ba666f6dfb0c8eac4cefb070edd51cbc");
  assert.equal(roboFacSha256(reportBytes), artifactManifest.report.sha256);
  assert.equal(roboFacSha256(receiptBytes), artifactManifest.receipt.sha256);
  assert.equal(artifactManifest.sourceRoot, report.source.sourceRoot);
  assert.equal(receipt.receiptPublishedLast, true);
  assert.equal(statSync(reportFile).mode & 0o777, 0o600);
  assert.equal(statSync(receiptFile).mode & 0o777, 0o600);

  const existing = mkdtempSync(path.join(os.tmpdir(), "robofac-no-clobber-"));
  let fetchCalls = 0;
  try {
    await assert.rejects(acquireRoboFacRealPullCubeSource({
      directory: existing,
      fetchImpl: async () => { fetchCalls += 1; throw new Error("network must not run"); },
    }), /ROBOFAC_NO_CLOBBER/u);
    assert.equal(fetchCalls, 0);
  } finally {
    rmSync(existing, { recursive: true, force: false });
  }
});

