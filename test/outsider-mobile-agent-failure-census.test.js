import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  MOBILE_AGENT_FAILURE_DATASET_REVISION,
  MOBILE_AGENT_FAILURE_DISPOSITION,
  verifyMobileAgentFailureArtifactDirectory,
} from "../src/outsider-mobile-agent-failure-census.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-mobile-agent-failure-census-20260829-v1",
);

test("the complete pinned 52-trajectory mobile failure set replays", () => {
  const checked = verifyMobileAgentFailureArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;
  assert.equal(report.source.revision, MOBILE_AGENT_FAILURE_DATASET_REVISION);
  assert.equal(report.disposition, MOBILE_AGENT_FAILURE_DISPOSITION);
  assert.equal(report.source.completeFixedRevisionBytesReplayed, true);
  assert.equal(report.source.entryCount, 910);
  assert.equal(report.source.fileCount, 852);
  assert.equal(report.source.directoryCount, 58);
  assert.equal(report.source.logicalBytes, 114_844_591);
  assert.equal(report.source.lfsFiles, 288);
  const replay = report.trajectoryReplay;
  assert.equal(replay.publisherSelectedTrajectoryIds, 52);
  assert.equal(replay.executionSteps, 271);
  assert.equal(replay.jpegFrames, 271);
  assert.equal(replay.xmlStates, 271);
  assert.equal(replay.exactJpegXmlPairs, 271);
  assert.equal(replay.bboxFiles, 52);
  assert.equal(replay.globallyAnnotatedTrajectories, 52);
  assert.equal(replay.locallyAnnotatedTrajectories, 52);
  assert.equal(replay.globalLocalAnnotationAgreement, 47);
  assert.equal(replay.annotatedActionRows, 130);
  assert.equal(replay.failedReasonRows, 130);
  assert.equal(replay.correctActionSuggestionRows, 156);
  assert.equal(replay.unlistedTopLevelDirectories, 6);
  assert.equal(replay.directTerminalFailureFlagRows, 0);
  assert.equal(replay.executedRepairSuffixRows, 0);
  assert.equal(replay.actionAnnotationsAreIndependentTruth, false);
  assert.equal(report.rights.trainingUseAuthorized, false);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.rawProjectionRows, 0);
  assert.equal(report.denominatorRegistry.crossDenominatorTotal, null);
  for (const field of ["independentOutcomeRows", "longitudinalOutcomeRows",
    "recoveryEpisodeRows", "preActionDelegationRows", "offlineTrainingRows",
    "productionTrainingRows", "networkAdmissionRows", "actorCreditRows",
    "ceuRows", "pricingRows", "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.artifactHash,
    "sha256:3ef9669e735c40afe8a0f99cd49a8bac547e13f5b49ffbbc92ba3dee5db4e06b");
  assert.equal(receipt.receiptHash,
    "sha256:eb9b360e808d28d9b7217ba8e842c976722c5eaa811b30a392813f55e5b9205a");
});

test("screens stay private and acquisition is no-clobber", () => {
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "source/repo")).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "report.json")).mode & 0o777, 0o600);
  assert.equal(lstatSync(path.join(ARTIFACT, "source/repo/1_2/task1_1.jpeg"))
    .mode & 0o777, 0o600);
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-mobile-agent-failure-census.mjs", "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  assert.equal(verifyMobileAgentFailureArtifactDirectory(ARTIFACT).ok, true);
});
