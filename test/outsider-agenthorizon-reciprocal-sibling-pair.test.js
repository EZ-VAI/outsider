import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  AGENTHORIZON_DATASET_ID,
  AGENTHORIZON_RECIPROCAL_PAIR_DISPOSITION,
  AGENTHORIZON_REVISION,
  verifyAgentHorizonReciprocalPairArtifactDirectory,
} from "../src/outsider-agenthorizon-reciprocal-sibling-pair.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-agenthorizon-reciprocal-sibling-pair-20260829-v1",
);

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function assertPrivateTree(root) {
  const status = lstatSync(root);
  assert.equal(status.isSymbolicLink(), false, root);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600, root);
  if (status.isDirectory()) {
    for (const name of readdirSync(root)) assertPrivateTree(path.join(root, name));
  }
}

test("fixed-revision AgentHorizon reciprocal pair replays without false failure semantics", () => {
  const checked = verifyAgentHorizonReciprocalPairArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true, checked.error);
  const { report, receipt } = checked;

  assert.equal(report.disposition, AGENTHORIZON_RECIPROCAL_PAIR_DISPOSITION);
  assert.equal(report.source.datasetId, AGENTHORIZON_DATASET_ID);
  assert.equal(report.source.revision, AGENTHORIZON_REVISION);
  assert.equal(report.source.public, true);
  assert.equal(report.source.gated, false);
  assert.equal(report.source.fixedRevisionUsedStorageBytes, 42_822_925_824);
  assert.equal(report.source.fixedRevisionSiblingPaths, 99_144);
  assert.equal(report.source.fixedRevisionSiblingPathRoot,
    "sha256:4ca9b7283e654e9949e2d2de9da4a7cca1e4dcb44cfb3c04bb5c5a3ebfc27b46");
  assert.equal(report.source.exactRecordSiblingInventory, true);
  assert.equal(report.source.fullTreeMetadataInventoried, false);
  assert.equal(report.source.fullRepositoryPayloadAcquired, false);
  assert.equal(report.source.selectedImageSubtreesFullyInventoried, true);
  assert.equal(report.source.selectedSubtreeEntries, 246);
  assert.equal(report.source.selectedSubtreeBytes, 50_202_493);
  assert.equal(report.source.selectedSubtreeTreePagesPerSnapshot, 4);
  assert.equal(report.source.selectedSubtreeTreeSnapshots, 2);
  assert.equal(report.source.materialRecordAndSelectedTreeStateStable, true);
  assert.equal(report.source.readmePromptPathClaimPresent, true);
  assert.equal(report.source.fixedRevisionPromptPathPresent, false);
  assert.equal(report.source.readmePromptPathClaimMatchesFixedRevisionRecord,
    false);
  assert.equal(report.source.sourceManifestHash,
    "sha256:28b5f6046e8240f376156f0cda465c9155a5cace545a5b64eb6c148a4e3b653e");
  assert.equal(report.source.sourceRoot,
    "sha256:ac8f3d50c8a1648a3ef504446a11de824680a10a411109137bc3c1e284c650ea");

  assert.equal(report.selection.split, "main");
  assert.equal(report.selection.completeMainLabelFileAcquired, true);
  assert.equal(report.selection.mainSplitRows, 605);
  assert.equal(report.selection.selectedSiblingPairLabelRows, 4);
  assert.equal(report.selection.selectedPublisherPositiveRows, 2);
  assert.equal(report.selection.selectedPublisherNegativeRows, 2);
  assert.equal(report.selection.distinctUnderlyingExecutions, 2);
  assert.equal(report.selection.completeSelectedJsonFiles, 4);
  assert.equal(report.selection.completeSelectedMarkdownFiles, 4);
  assert.equal(report.selection.completeSelectedImageDirectories, 2);
  assert.equal(report.selection.completeSelectedScreenshotFiles, 246);
  assert.equal(report.selection.completeSelectedScreenshotBytes, 50_202_493);
  assert.equal(report.selection.selectedSourcePayloadBytes, 50_657_598);
  assert.equal(report.selection.reciprocalCrossSwapClosure, true);
  assert.equal(report.selection.representativenessEstablished, false);
  assert.equal(report.selection.fullDatasetExhausted, false);

  assert.equal(report.replay.mainSplitRows, 605);
  assert.deepEqual(report.replay.mainSplitPublisherLabels,
    { negative: 318, positive: 287 });
  assert.equal(report.replay.mainNegativeRowsWithBothEndpointPositives, 33);
  assert.equal(report.replay.selectedLabelRows, 4);
  assert.equal(report.replay.underlyingPublisherPositiveExecutions, 2);
  assert.equal(report.replay.selectedPublisherPositiveRows, 2);
  assert.equal(report.replay.selectedPublisherNegativeRows, 2);
  assert.equal(report.replay.reciprocalCrossSwapByteStructureVerified, true);
  assert.equal(report.replay.markdownScreenshotClosureVerified, true);
  assert.equal(report.replay.rawInstructionsActionsScreenshotsProjected, false);
  assert.deepEqual(report.replay.executions.map((item) => ({
    trajectory: item.positiveTrajectoryHash, role: item.pairRole,
    instruction: item.instructionIdHash, stepsId: item.stepsIdHash,
    publisherLabel: item.publisherLabel,
    successClaim: item.publisherSuccessfulExecutionClaim,
    steps: item.steps, screenshots: item.screenshotFiles,
    bytes: item.screenshotBytes,
  })), [
    {
      trajectory:
        "sha256:8638ab096b084f8aeeedc2050b35e935bd7e385aac6fab6362642ca77ba18581",
      role: "child",
      instruction:
        "sha256:98b898ff38dce3a918c143447db019e8a168d4b6160a3ff33b73069827cdc321",
      stepsId:
        "sha256:98b898ff38dce3a918c143447db019e8a168d4b6160a3ff33b73069827cdc321",
      publisherLabel: "positive", successClaim: true,
      steps: 124, screenshots: 124, bytes: 25_099_605,
    },
    {
      trajectory:
        "sha256:cd4b65af1db204a9dc77722254c2f086ccbeea280648c0f6e5a40cdf85f1a67b",
      role: "parent",
      instruction:
        "sha256:b486ecdca9a180147dc1c829d63a26209958baaf19a41e53866910519b61042d",
      stepsId:
        "sha256:b486ecdca9a180147dc1c829d63a26209958baaf19a41e53866910519b61042d",
      publisherLabel: "positive", successClaim: true,
      steps: 122, screenshots: 122, bytes: 25_102_888,
    },
  ]);
  assert.deepEqual(report.replay.reciprocalAlignmentNegatives.map((item) => ({
    negative: item.negativeTrajectoryHash,
    instruction: item.instructionFromPositiveTrajectoryHash,
    steps: item.stepsFromPositiveTrajectoryHash,
    instructionSource: item.instructionSource,
    stepsSource: item.stepsSource,
    publisherLabel: item.publisherLabel,
    mistakeType: item.publisherMistakeType,
    semanticClass: item.semanticClass,
    newExecution: item.newUnderlyingExecutionIntroduced,
  })), [
    {
      negative:
        "sha256:b6765efcc0bded90aaafa57e264f266562d8def5747116bc3b51adf5d517602f",
      instruction:
        "sha256:8638ab096b084f8aeeedc2050b35e935bd7e385aac6fab6362642ca77ba18581",
      steps:
        "sha256:cd4b65af1db204a9dc77722254c2f086ccbeea280648c0f6e5a40cdf85f1a67b",
      instructionSource: "child", stepsSource: "parent",
      publisherLabel: "negative", mistakeType: "Bad Side Effect",
      semanticClass: "INSTRUCTION_TRAJECTORY_ALIGNMENT_MISMATCH",
      newExecution: false,
    },
    {
      negative:
        "sha256:f918f4bca5ed2c24873437bdd1500622deebbad08504b86c638cbf24baf52714",
      instruction:
        "sha256:cd4b65af1db204a9dc77722254c2f086ccbeea280648c0f6e5a40cdf85f1a67b",
      steps:
        "sha256:8638ab096b084f8aeeedc2050b35e935bd7e385aac6fab6362642ca77ba18581",
      instructionSource: "parent", stepsSource: "child",
      publisherLabel: "negative", mistakeType: "Bad Side Effect",
      semanticClass: "INSTRUCTION_TRAJECTORY_ALIGNMENT_MISMATCH",
      newExecution: false,
    },
  ]);

  assert.equal(report.semantics.positiveMeaning,
    "PUBLISHER_SUCCESSFUL_EXECUTION_CLAIM");
  assert.equal(report.semantics.negativeMeaning,
    "INSTRUCTION_TRAJECTORY_ALIGNMENT_FAILURE");
  assert.equal(report.semantics.negativePublisherMistakeType, "Bad Side Effect");
  assert.equal(report.semantics.negativeMistakeTypeIsObservedPhysicalSideEffect,
    false);
  assert.equal(report.semantics.negativeRowsAreNewExecutions, false);
  assert.equal(report.semantics.negativeRowsReusePublisherPositiveSteps, true);
  assert.equal(report.semantics.recoverySequenceEstablished, false);

  assert.equal(report.denominators.FIXED_REVISION_SIBLING_PATHS, 99_144);
  assert.equal(report.denominators.MAIN_SPLIT_LABEL_ROWS, 605);
  assert.equal(report.denominators.MAIN_SPLIT_PUBLISHER_POSITIVE_ROWS, 287);
  assert.equal(report.denominators.MAIN_SPLIT_PUBLISHER_NEGATIVE_ROWS, 318);
  assert.equal(report.denominators.MAIN_NEGATIVE_ROWS_WITH_BOTH_ENDPOINT_POSITIVES,
    33);
  assert.equal(report.denominators.SELECTED_LABEL_ROWS, 4);
  assert.equal(report.denominators.SELECTED_UNDERLYING_EXECUTIONS, 2);

  assert.equal(report.outcome.publisherSuccessfulExecutionClaimRows, 2);
  assert.equal(report.outcome.publisherAlignmentFailureRows, 2);
  assert.equal(report.outcome.publisherLabelsIndependentlyRerun, false);
  assert.equal(report.outcome.independentOutcomeRows, 0);
  assert.equal(report.outcome.actualExecutionFailureRows, 0);
  assert.equal(report.outcome.observedPhysicalSideEffectRows, 0);
  assert.equal(report.outcome.recoveryEpisodeRows, 0);

  assert.equal(report.rights.datasetCardLicenseClaim, null);
  assert.equal(report.rights.datasetApiLicenseTagPresent, false);
  assert.equal(report.rights.datasetLicenseFilePresent, false);
  assert.equal(report.rights.rightsDisposition, "FAIL_CLOSED");
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.privacy.rawInstructionsActionsScreenshotsProjected, false);
  assert.equal(report.privacy.rawProjectionRows, 0);
  for (const field of ["independentOutcomeRows", "actualExecutionFailureRows",
    "physicalEffectRows", "realWorldOutcomeRows", "longitudinalOutcomeRows",
    "recoveryEpisodeRows", "preActionDelegationRows", "offlineTrainingRows",
    "productionTrainingRows", "networkAdmissionRows", "actorCreditRows",
    "ceuRows", "pricingRows", "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.boundary.autonomousActionAuthorized, false);

  assert.equal(report.artifactHash,
    "sha256:e8ddfb1cd77192dd9a3d9d8e3dc2b4e92a777cfdd5a4deec2eb66fd5c86ab897");
  assert.equal(receipt.receiptHash,
    "sha256:8e14256147a9c7263de694925aa561fe390591a5c583d72745de11697507da25");
});

test("screenshots and raw trajectory text stay private; publication is no-clobber", () => {
  assertPrivateTree(ARTIFACT);
  const report = path.join(ARTIFACT, "report.json");
  const receipt = path.join(ARTIFACT, "run-receipt.json");
  const screenshot = path.join(ARTIFACT,
    "source/files/sandbox/data/media/images/000232524-232524-0000-000000232524/step_1.png");
  const rawJson = path.join(ARTIFACT,
    "source/files/sandbox/data/jsons/025cd638-e8b0-4d22-a4a7-9e0c2e087752.json");
  const before = [sha256(report), sha256(receipt), sha256(screenshot), sha256(rawJson)];
  const screenshotBefore = lstatSync(screenshot, { bigint: true });
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-agenthorizon-reciprocal-sibling-pair.mjs",
      "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  const screenshotAfter = lstatSync(screenshot, { bigint: true });
  assert.deepEqual([sha256(report), sha256(receipt), sha256(screenshot),
    sha256(rawJson)], before);
  assert.equal(screenshotAfter.size, screenshotBefore.size);
  assert.equal(screenshotAfter.mtimeNs, screenshotBefore.mtimeNs);
});
