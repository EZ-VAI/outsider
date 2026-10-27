import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  BROWSECOMP_FOUR_PASS_DATASET_ID,
  BROWSECOMP_FOUR_PASS_DISPOSITION,
  BROWSECOMP_FOUR_PASS_REVISION,
  verifyBrowsecompFourPassArtifactDirectory,
} from "../src/outsider-browsecomp-four-pass-evaluation.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-browsecomp-four-pass-evaluation-20260829-v1",
);

test("the complete fixed four-pass BrowseComp evaluation replays", () => {
  const checked = verifyBrowsecompFourPassArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;
  assert.equal(report.source.id, BROWSECOMP_FOUR_PASS_DATASET_ID);
  assert.equal(report.source.revision, BROWSECOMP_FOUR_PASS_REVISION);
  assert.equal(report.disposition, BROWSECOMP_FOUR_PASS_DISPOSITION);
  assert.equal(report.source.completePublishedEvaluationTableReplayed, true);
  assert.equal(report.source.completeUnderlyingBrowseCompQuestionCorpusReplayed, false);
  assert.equal(report.replay.rows, 5_064);
  assert.equal(report.replay.questions, 1_266);
  assert.deepEqual(report.replay.trajectoryIndicesPerQuestion, [0, 1, 2, 3]);
  assert.equal(report.replay.questionAndReferenceStableAcrossFourPasses, true);
  assert.deepEqual(report.replay.correctPassesPerQuestionHistogram,
    { 0: 857, 1: 173, 2: 107, 3: 73, 4: 56 });
  assert.equal(report.replay.correctRows, 830);
  assert.equal(report.replay.questionsWithAtLeastOneCorrectPass, 409);
  assert.equal(report.replay.toolCalls, 183_397);
  assert.deepEqual(report.replay.statusRows,
    { context_overflow: 11, error: 6, success: 5_047 });
  assert.equal(report.replay.contaminatedRows, 0);
  assert.equal(report.siblingStructure.withinQuestionOutcomeVariationGroups, 353);
  assert.equal(report.siblingStructure.fourFreshIndependentAttemptsExternallyEstablished,
    false);
  assert.equal(report.documentationDrift.readmeDeclaredToolCalls, 183_396);
  assert.equal(report.documentationDrift.toolCallDifference, 1);
  assert.equal(report.documentationDrift.unlistedToolType, "functions.search");
  assert.equal(report.documentationDrift.parquetConversationColumnPresent, false);
  assert.equal(report.rights.rightsGate, "FAIL_CLOSED");
  assert.equal(report.rights.trainingUseAuthorized, false);
  assert.equal(report.privacy.rawProjectionRows, 0);
  for (const field of ["independentOutcomeRows", "realWorldOutcomeRows",
    "longitudinalOutcomeRows", "recoveryEpisodeRows", "preActionDelegationRows",
    "physicalEffectRows", "offlineTrainingRows", "productionTrainingRows",
    "networkAdmissionRows", "actorCreditRows", "ceuRows", "pricingRows",
    "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.boundary.autonomousActionAuthorized, false);
  assert.equal(report.artifactHash,
    "sha256:f980b3e27cb20d3bc727680a7729bb017c8d1c53db3d747dc3983e3be62d7c47");
  assert.equal(receipt.receiptHash,
    "sha256:e1e6f7c334688b3852840396f0551e7d613fda5704fa563fc1c475cdfeb1a62c");
});

test("the artifact is private and acquisition is no-clobber", () => {
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "source")).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "report.json")).mode & 0o777, 0o600);
  assert.equal(lstatSync(path.join(ARTIFACT,
    "source/files/data/train-00000-of-00001.parquet")).mode & 0o777, 0o600);
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-browsecomp-four-pass-evaluation.mjs",
      "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  assert.equal(verifyBrowsecompFourPassArtifactDirectory(ARTIFACT).ok, true);
});

