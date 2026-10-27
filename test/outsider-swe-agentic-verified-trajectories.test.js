import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { lstatSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  SWE_AGENTIC_VERIFIED_DATASET_ID,
  SWE_AGENTIC_VERIFIED_DISPOSITION,
  SWE_AGENTIC_VERIFIED_REVISION,
  verifySweAgenticVerifiedArtifactDirectory,
} from "../src/outsider-swe-agentic-verified-trajectories.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-swe-agentic-verified-trajectories-20260829-v1",
);

test("the complete published verified SWE trajectory split replays", () => {
  const checked = verifySweAgenticVerifiedArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;
  assert.equal(report.source.id, SWE_AGENTIC_VERIFIED_DATASET_ID);
  assert.equal(report.source.revision, SWE_AGENTIC_VERIFIED_REVISION);
  assert.equal(report.disposition, SWE_AGENTIC_VERIFIED_DISPOSITION);
  assert.equal(report.source.completeFixedRevisionRepositoryReplayed, true);
  assert.equal(report.source.repositoryFiles, 4);
  assert.equal(report.source.repositoryLogicalBytes, 4_229_112);
  assert.equal(report.source.selectedObjects, 4);

  assert.equal(report.replay.publishedVerifiedSessions, 71);
  assert.equal(report.replay.uniqueInstances, 71);
  assert.equal(report.replay.uniqueRepositories, 64);
  assert.equal(report.replay.messages, 4_682);
  assert.deepEqual(report.replay.messageRoles,
    { assistant: 2_290, system: 71, tool: 2_234, user: 87 });
  assert.equal(report.replay.modelCalls, 2_483);
  assert.equal(report.replay.toolCallRequests, 2_436);
  assert.equal(report.replay.toolResultMessages, 2_234);
  assert.equal(report.replay.toolCallMinusResultMessageCount, 202);
  assert.equal(report.replay.exactToolCallResultIdentityJoinEstablished, false);
  assert.equal(report.replay.publisherToolErrors, 318);
  assert.equal(report.replay.failToPassAssertions, 133);
  assert.equal(report.replay.passToPassAssertions, 2_360);
  assert.equal(report.replay.hiddenTestAssertionsReportedPassed, 2_493);
  assert.deepEqual(report.replay.exitStatusRows, { completed: 69, max_turns: 2 });
  assert.equal(report.replay.allRowsResolvedTrue, true);
  assert.equal(report.replay.allRowsPatchProducedTrue, true);
  assert.equal(report.replay.allPerTestCountersReportPassed, true);
  assert.equal(report.replay.rawIssuePromptMessageCommandOutputPatchProjected, false);

  assert.equal(report.selection.publisherDeclaredOriginalCollectionRows, 278);
  assert.equal(report.selection.publisherDeclaredResolvedRows, 71);
  assert.equal(report.selection.publisherDeclaredUnpublishedNonresolvedRows, 207);
  assert.equal(report.selection.unpublishedAllFileBytesAcquired, 0);
  assert.equal(report.selection.unpublishedAllFileHashVerified, false);
  assert.equal(report.selection.failuresAndEmptyPatchesDeliberatelyExcludedByPublisher,
    true);
  assert.equal(report.selection.completePublishedResolvedSplit, true);
  assert.equal(report.selection.completeOriginalAttemptCensus, false);
  assert.equal(report.selection.observedPublishedSuccessRate, null);
  assert.equal(report.selection.successRateCalculationProhibitedBySelection, true);
  assert.equal(report.selection.publisherManifestPublicationFieldsInTension, true);

  assert.equal(report.outcome.publisherHiddenTestAdjudicatedRows, 71);
  assert.equal(report.outcome.hiddenTestsIndependentlyRerunByThisArtifact, false);
  assert.equal(report.outcome.independentOutcomeRows, 0);
  assert.equal(report.outcome.recoveryEpisodeRows, 0);
  assert.equal(report.outcome.toolErrorsDoNotEstablishRecoveryEpisodes, true);
  assert.equal(report.denominators.crossPopulationTotal, null);
  assert.equal(report.denominators.additionProhibited, true);
  assert.equal(report.rights.datasetCardLicenseClaim, "other");
  assert.equal(report.rights.useSpecificClearanceEstablished, false);
  assert.equal(report.rights.trainingUseAuthorized, false);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.privacy.rawProjectionRows, 0);
  for (const field of ["independentOutcomeRows", "realWorldOutcomeRows",
    "longitudinalOutcomeRows", "recoveryEpisodeRows", "preActionDelegationRows",
    "physicalEffectRows", "offlineTrainingRows", "productionTrainingRows",
    "networkAdmissionRows", "actorCreditRows", "ceuRows", "pricingRows",
    "authorityRows"]) assert.equal(report.boundary[field], 0, field);
  assert.equal(report.boundary.autonomousActionAuthorized, false);
  assert.equal(report.artifactHash,
    "sha256:ec3e99f8c6e3f3bb62a8755a6bad69d9de0b28f37ef1fa5f55a99e635dacce24");
  assert.equal(receipt.receiptHash,
    "sha256:3632030f7e0938df11cbb2ada7440210e28aa1874ac97681c344c19f81722a70");
});

test("raw sessions stay private and acquisition is no-clobber", () => {
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "source")).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "report.json")).mode & 0o777, 0o600);
  assert.equal(lstatSync(path.join(ARTIFACT,
    "source/files/data/resolved.jsonl")).mode & 0o777, 0o600);
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-swe-agentic-verified-trajectories.mjs",
      "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  assert.equal(verifySweAgenticVerifiedArtifactDirectory(ARTIFACT).ok, true);
});
