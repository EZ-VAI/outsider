import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  TAU2_UQ_DATASET_ID,
  TAU2_UQ_DISPOSITION,
  TAU2_UQ_REVISION,
  verifyTau2UqArtifactDirectory,
} from "../src/outsider-tau2-uq-trajectory-pairs.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-tau2-uq-trajectory-pairs-20260829-v1",
);

test("the complete published tau2 UQ trajectory matrix replays as paired evidence", () => {
  const checked = verifyTau2UqArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;
  assert.equal(report.source.id, TAU2_UQ_DATASET_ID);
  assert.equal(report.source.revision, TAU2_UQ_REVISION);
  assert.equal(report.disposition, TAU2_UQ_DISPOSITION);
  assert.equal(report.source.repositoryFiles, 564);
  assert.equal(report.source.repositoryDirectories, 4);
  assert.equal(report.source.repositoryLogicalBytes, 1_704_355_614);
  assert.equal(report.source.selectedObjects, 7);
  assert.equal(report.source.selectedBytes, 52_174_178);
  assert.equal(report.source.completeSixTrajectoryFilesReplayed, true);
  assert.equal(report.source.completeTokenLogprobFilesReplayed, false);
  assert.equal(report.source.excludedTokenLogprobFiles, 556);
  assert.equal(report.source.excludedTokenLogprobLogicalBytes, 1_652_177_550);
  assert.equal(report.source.recordAndFullTreeCapturedAroundFinalSourceRederivation,
    true);
  assert.equal(report.source.materialRecordAndTreeStateStable, true);

  assert.equal(report.replay.trajectoryFiles, 6);
  assert.equal(report.replay.simulations, 556);
  assert.equal(report.replay.domainTaskPairs, 278);
  assert.equal(report.replay.messages, 20_485);
  assert.equal(report.replay.toolCalls, 6_417);
  assert.equal(report.replay.toolResults, 6_417);
  assert.equal(report.replay.allToolCallsAndResultsJoined, true);
  assert.equal(report.replay.publisherRewardOneRows, 329);
  assert.equal(report.replay.publisherRewardZeroRows, 227);
  assert.deepEqual(report.replay.terminationRows, { max_steps: 1, user_stop: 555 });
  assert.deepEqual(report.replay.kimiToGpt41RewardTransitions,
    { "0->0": 56, "0->1": 31, "1->0": 84, "1->1": 107 });
  assert.equal(report.replay.kimiRewardOneRows, 191);
  assert.equal(report.replay.gpt41RewardOneRows, 138);
  assert.equal(report.replay.pairedRewardOneDifference, -53);
  assert.equal(report.comparison.same278DomainTaskDefinitionsAcrossModels, true);
  assert.equal(report.comparison.sameTrialAndSeedAcrossModelPairs, true);
  assert.equal(report.comparison.causalModelEffectEstablished, false);

  assert.deepEqual(report.replay.uqSummaryPartRows,
    { assistant: 556, combined: 279, user: 279 });
  assert.equal(report.uncertainty.gpt41RowsWithAllThreeParts, 278);
  assert.equal(report.uncertainty.kimiRowsMissingUserAndCombinedParts, 277);
  assert.equal(report.uncertainty.oneKimiTelecomRowWithAllThreeParts, true);
  assert.equal(report.uncertainty.tokenLevelLogprobsReplayed, false);
  assert.equal(report.completeness.complete278PairedDomainTaskUnits, true);
  assert.equal(report.completeness.completeOpportunityOrAttemptCensus, false);
  assert.equal(report.denominators.crossPopulationTotal, null);
  assert.equal(report.denominators.additionProhibited, true);
  assert.equal(report.outcome.independentOutcomeRows, 0);
  assert.equal(report.outcome.recoveryEpisodeRows, 0);
  assert.equal(report.rights.trainingUseAuthorized, false);
  assert.equal(report.rights.legalConclusionEstablished, false);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.rawProjectionRows, 0);
  assert.equal(report.replay.rawTaskMessageToolAndUqValuesProjected, false);
  for (const field of ["independentOutcomeRows", "realWorldOutcomeRows",
    "longitudinalOutcomeRows", "recoveryEpisodeRows", "preActionDelegationRows",
    "physicalEffectRows", "offlineTrainingRows", "productionTrainingRows",
    "networkAdmissionRows", "actorCreditRows", "ceuRows", "pricingRows",
    "authorityRows"]) assert.equal(report.boundary[field], 0, field);
  assert.equal(report.boundary.autonomousActionAuthorized, false);
  assert.equal(report.artifactHash,
    "sha256:42c2e360c45aacbe5a9be8f6fc1426f7040abed26f11965c009aadd5049c1e85");
  assert.equal(receipt.receiptHash,
    "sha256:e91f49058d8e76593c3a1bcfef66ceb364641bdf8ad3e09de454a01d1f7dc7cf");
});

test("raw trajectories and paginated tree evidence stay private and no-clobber", () => {
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "source")).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "report.json")).mode & 0o777, 0o600);
  assert.equal(lstatSync(path.join(ARTIFACT,
    "source/files/trajectories/Kimi-K2.5_telecom.json")).mode & 0o777, 0o600);
  const metadata = path.join(ARTIFACT, "source/metadata");
  assert.equal(readdirSync(metadata).filter((name) => name.includes("tree-before-page-")
    && name.endsWith(".json")).length, 6);
  assert.equal(readdirSync(metadata).filter((name) => name.includes("tree-after-page-")
    && name.endsWith(".headers")).length, 6);
  assert.equal(lstatSync(path.join(metadata,
    "full-tree-before-page-001.headers")).mode & 0o777, 0o600);
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-tau2-uq-trajectory-pairs.mjs", "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  assert.equal(verifyTau2UqArtifactDirectory(ARTIFACT).ok, true);
});
