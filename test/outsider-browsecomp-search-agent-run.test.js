import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  BROWSECOMP_SEARCH_DATASET_REVISION,
  BROWSECOMP_SEARCH_DISPOSITION,
  BROWSECOMP_SEARCH_RUN_ID,
  verifyBrowsecompSearchRunArtifactDirectory,
} from "../src/outsider-browsecomp-search-agent-run.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-browsecomp-search-agent-run-20260829-v1",
);

test("the complete pinned 830-question search-agent run replays", () => {
  const checked = verifyBrowsecompSearchRunArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;
  assert.equal(report.source.revision, BROWSECOMP_SEARCH_DATASET_REVISION);
  assert.equal(report.source.selectedRunId, BROWSECOMP_SEARCH_RUN_ID);
  assert.equal(report.disposition, BROWSECOMP_SEARCH_DISPOSITION);
  assert.equal(report.source.completeSelectedRunBytesReplayed, true);
  assert.equal(report.source.completeDatasetPayloadReplayed, false);
  assert.equal(report.publisherManifest.declaredRunCount, 6);
  assert.equal(report.runReplay.rows, 830);
  assert.equal(report.runReplay.terminationAnswer, 819);
  assert.equal(report.runReplay.terminationIncomplete, 11);
  assert.equal(report.runReplay.uniqueQuestions, 830);
  assert.equal(report.runReplay.publisherRolloutId, 1);
  assert.equal(report.runReplay.messages, 32_653);
  assert.equal(report.runReplay.modelCalls, 11_739);
  assert.equal(report.runReplay.toolCalls, 19_254);
  assert.equal(report.runReplay.toolResults, 19_254);
  assert.equal(report.runReplay.totalTokens, 563_778_524);
  assert.equal(report.runReplay.exactTrimmedPredictionReferenceMatches, 339);
  assert.equal(report.runReplay.exactStringMatchIsNotCorrectness, true);
  assert.equal(report.rights.trainingUseAuthorized, false);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.rawProjectionRows, 0);
  for (const field of ["correctnessOutcomeRows", "independentOutcomeRows",
    "longitudinalOutcomeRows", "recoveryEpisodeRows", "preActionDelegationRows",
    "offlineTrainingRows", "productionTrainingRows", "networkAdmissionRows",
    "actorCreditRows", "ceuRows", "pricingRows", "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.boundary.autonomousActionAuthorized, false);
  assert.equal(report.artifactHash,
    "sha256:978b84782efb5a5c1a155fece60e90890635b1fe30d2956f45d18dbac643a0f6");
  assert.equal(receipt.receiptHash,
    "sha256:491b1390acd1c5e3bfde65cfef849d77be78b95ecfd3c1cc216eaefc157fb304");
});

test("the artifact is private and acquisition is no-clobber", () => {
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "source")).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "report.json")).mode & 0o777, 0o600);
  assert.equal(lstatSync(path.join(ARTIFACT,
    "source/files/predictions.jsonl")).mode & 0o777, 0o600);
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-browsecomp-search-agent-run.mjs", "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  assert.equal(verifyBrowsecompSearchRunArtifactDirectory(ARTIFACT).ok, true);
});
