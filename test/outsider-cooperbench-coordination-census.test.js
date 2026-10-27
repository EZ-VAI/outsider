import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  COOPERBENCH_COORDINATION_DISPOSITION,
  COOPERBENCH_DATASET_REVISION,
  verifyCooperbenchCoordinationArtifactDirectory,
} from "../src/outsider-cooperbench-coordination-census.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-cooperbench-coordination-census-20260829-v1",
);

test("all six CooperBench coordination archives replay", () => {
  const checked = verifyCooperbenchCoordinationArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;
  assert.equal(report.source.revision, COOPERBENCH_DATASET_REVISION);
  assert.equal(report.disposition, COOPERBENCH_COORDINATION_DISPOSITION);
  assert.equal(report.source.allSixPublishedTrajectoryArchivesReplayed, true);
  assert.equal(report.archiveReplay.length, 6);
  assert.deepEqual(report.archiveReplay.map((row) => row.taskCount),
    [48, 50, 645, 652, 651, 636]);
  assert.equal(report.coordinationDesign.flashUnionTaskPairs, 50);
  assert.equal(report.coordinationDesign.flashCommonTaskPairs, 48);
  assert.equal(report.coordinationDesign.fullUnionTaskPairs, 652);
  assert.equal(report.coordinationDesign.fullCommonTaskPairs, 628);
  assert.equal(
    report.coordinationDesign.publisherNominalScopeIsNotCompleteInEveryArchive, true);
  assert.equal(report.aggregate.taskSettingRows, 2_682);
  assert.equal(report.aggregate.resultFiles, 2_706);
  assert.equal(report.aggregate.trajectoryFiles, 4_710);
  assert.equal(report.aggregate.streamLogs, 4_562);
  assert.equal(report.aggregate.patchFiles, 4_710);
  assert.equal(report.aggregate.bothFeaturesPassed, 1_532);
  assert.equal(report.aggregate.bothFeaturesNotPassed, 1_150);
  assert.equal(report.aggregate.zeroJsonFiles, 1);
  assert.equal(report.aggregate.invalidJsonFiles, 0);
  assert.equal(report.aggregate.publisherHarnessOutcomeIsIndependentTruth, false);
  assert.equal(report.rights.trainingUseAuthorized, false);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.rawProjectionRows, 0);
  assert.equal(report.denominatorRegistry.crossDenominatorTotal, null);
  assert.equal(report.denominatorRegistry.additionProhibited, true);
  for (const field of ["independentOutcomeRows", "longitudinalOutcomeRows",
    "recoveryEpisodeRows", "preActionDelegationRows", "offlineTrainingRows",
    "productionTrainingRows", "networkAdmissionRows", "actorCreditRows",
    "ceuRows", "pricingRows", "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.boundary.autonomousActionAuthorized, false);
  assert.equal(report.artifactHash,
    "sha256:1f992135ec5e0e96d465dedbdf343cd4a1fe25867781884beafee22ec10afeb2");
  assert.equal(receipt.receiptHash,
    "sha256:078f15533bd176f76965cb80e517a1e9235a81847cdad190a16e4c30e8d80e52");
});

test("the complete archive source stays private and acquisition is no-clobber", () => {
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "source")).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "report.json")).mode & 0o777, 0o600);
  assert.equal(lstatSync(path.join(ARTIFACT,
    "source/files/cmp-full-team.tar.gz")).mode & 0o777, 0o600);
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-cooperbench-coordination-census.mjs",
      "--output-dir", ARTIFACT], { cwd: path.resolve("."), stdio: "pipe" }),
  /Command failed/u);
  assert.equal(verifyCooperbenchCoordinationArtifactDirectory(ARTIFACT).ok, true);
});
