import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ITBENCH_DATASET_ID,
  ITBENCH_FULL_DISPOSITION,
  ITBENCH_REVISION,
  verifyItBenchFullArtifactDirectory,
} from "../src/outsider-itbench-full-trajectories.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-itbench-full-trajectories-20260829-v1");

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

test("complete fixed ITBench repository replays 105 fresh sibling trials", () => {
  const checked = verifyItBenchFullArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel, "FULL_REPOSITORY_SOURCE_REDERIVED");
  const { report, receipt } = checked;

  assert.equal(report.disposition, ITBENCH_FULL_DISPOSITION);
  assert.equal(report.source.datasetId, ITBENCH_DATASET_ID);
  assert.equal(report.source.revision, ITBENCH_REVISION);
  assert.equal(report.source.public, true);
  assert.equal(report.source.gated, false);
  assert.equal(report.source.fixedRevisionApiUsedStorageBytes, 0);
  assert.equal(report.source.exactRecordSiblingPaths, 389);
  assert.equal(report.source.exactRecordSiblingPathRoot,
    "sha256:f02d9a33a1123ba18d5aac569d3dbf7ea71bd7d598530c1370b09e0953030d6d");
  assert.equal(report.source.fullTreePagesPerSnapshot, 6);
  assert.equal(report.source.fullTreeSnapshots, 2);
  assert.equal(report.source.fullTreeEntries, 599);
  assert.equal(report.source.fullTreeFiles, 389);
  assert.equal(report.source.fullTreeDirectories, 210);
  assert.equal(report.source.fullTreeDeclaredFileBytes, 23_173_423);
  assert.deepEqual(report.source.fullTreeExtensionCounts,
    { gitattributes: 1, json: 180, jsonl: 105, md: 1, py: 102 });
  assert.equal(report.source.fullTreeRoot,
    "sha256:9d586d8d367a212255f6681417726d67d899128512ff563b90458f7bbb0a2445");
  assert.equal(report.source.recordApiUsedStorageMatchesTreeDeclaredBytes, false);
  assert.equal(report.source.completeRecordAndTreeInventoried, true);
  assert.equal(report.source.fullRepositoryPayloadAcquired, true);
  assert.equal(report.source.fullRepositoryPayloadBytes, 23_173_423);
  assert.equal(report.source.materialRecordAndTreeStateStable, true);

  assert.equal(report.corpus.scenarios, 35);
  assert.equal(report.corpus.runsPerScenario, 3);
  assert.equal(report.corpus.sourceNativeRunRows, 105);
  assert.equal(report.corpus.uniqueSessionIds, 105);
  assert.equal(report.corpus.sessionFiles, 105);
  assert.equal(report.corpus.agentOutputFiles, 90);
  assert.equal(report.corpus.judgeOutputFiles, 90);
  assert.equal(report.corpus.generatedCodeFiles, 102);
  assert.equal(report.corpus.generatedCodeBytes, 165_035);
  assert.deepEqual(report.corpus.runShapes, {
    GENERATED_CODE_AND_SESSION_ONLY: 13,
    OUTPUT_JUDGE_SESSION_ONLY: 36,
    OUTPUT_JUDGE_SESSION_WITH_GENERATED_CODE: 54,
    SESSION_ONLY: 2,
  });
  assert.equal(report.corpus.runsMissingAgentAndJudgeOutput, 15);
  assert.equal(report.corpus.agentAndJudgeOutputsAlwaysCoPresent, true);
  assert.equal(report.corpus.completeCurrentScenarioRunCrossProduct, true);

  assert.equal(report.replay.sessionJsonRows, 19_292);
  assert.deepEqual(report.replay.sessionTopLevelTypes,
    { event_msg: 6_442, response_item: 9_989, session_meta: 105,
      turn_context: 2_756 });
  assert.deepEqual(report.replay.responseItemTypes,
    { function_call: 2_888, function_call_output: 2_888,
      ghost_snapshot: 429, message: 1_141, reasoning: 2_643 });
  assert.deepEqual(report.replay.eventMessageTypes,
    { agent_message: 502, token_count: 5_511, user_message: 429 });
  assert.equal(report.replay.responseMessageRows, 1_141);
  assert.equal(report.replay.eventAgentMessageRows, 502);
  assert.equal(report.replay.eventUserMessageRows, 429);
  assert.equal(report.replay.functionCallRows, 2_888);
  assert.equal(report.replay.functionCallOutputRows, 2_888);
  assert.deepEqual(report.replay.functionCallCategories, {
    APPLY_PATCH: 257, MCP_RESOURCE_LIST: 11, MCP_SRE_UTILS: 242,
    OTHER_OR_MALFORMED: 2, SHELL: 2_376,
  });
  assert.equal(report.replay.structuredFunctionOutputRows, 2_218);
  assert.equal(report.replay.unstructuredFunctionOutputRows, 670);
  assert.deepEqual(report.replay.toolExitCodes,
    { "0": 1_324, "1": 131, "2": 75, "3": 1,
      "5": 7, "124": 679, "127": 1 });
  assert.equal(report.replay.nonzeroToolExitRows, 894);
  assert.equal(report.replay.explicitErrorOrAbortTypedRows, 0);
  assert.equal(report.replay.agentOutputRows, 90);
  assert.equal(report.replay.agentOutputEntityItems, 449);
  assert.equal(report.replay.agentOutputPropagationItems, 298);
  assert.equal(report.replay.agentOutputAlertExplanationItems, 1_440);
  assert.equal(report.replay.judgeOutputRows, 90);
  assert.equal(report.replay.judgeEvalScoreSections, 1_170);
  assert.equal(report.replay.publisherFlatScoreObservations, 2_790);
  assert.equal(report.replay.publisherFlatScoreNumericObservations, 2_742);
  assert.equal(report.replay.publisherFlatScoreNullObservations, 48);
  assert.equal(Object.keys(report.replay.publisherFlatScoreSummaries).length, 31);
  assert.deepEqual(report.replay.publisherFlatScoreSummaries.root_cause_entity_f1,
    { max: 1, mean: 0.155555555556, min: 0, missing: 0,
      null: 0, numeric: 90, present: 90 });
  assert.deepEqual(report.replay.publisherFlatScoreSummaries.propagation_chain,
    { max: 0.9090909090909091, mean: 0.379551066218, min: 0,
      missing: 0, null: 0, numeric: 90, present: 90 });
  assert.equal(report.replay.allRepositoryGitBlobOidsSizesAndSha256Verified, true);
  assert.equal(report.replay.allSessionsParsedAsJsonl, true);
  assert.equal(report.replay.generatedCodeAndSessionCommandsExecutedDuringReplay,
    false);
  assert.equal(report.replay.rawSessionOutputJudgeOrCodeContentProjected, false);

  assert.equal(report.semantics.sourceOrganization,
    "THREE_FRESH_SIBLING_TRIALS_PER_SCENARIO");
  assert.equal(report.semantics.siblingRunsAreRetries, false);
  assert.equal(report.semantics.chronologicalRecoverySequenceEstablished, false);
  assert.equal(report.semantics.longitudinalOutcomeEstablished, false);
  assert.equal(report.semantics.missingJudgeAndAgentOutputIsPublisherOutcomeFailure,
    false);
  assert.equal(report.semantics.publisherJudgeIsIndependentOutcome, false);
  assert.equal(report.semantics.publisherJudgeIsObservedRealWorldTruth, false);
  assert.equal(report.outcome.publisherJudgeRows, 90);
  assert.equal(report.outcome.missingPublisherJudgeRows, 15);
  assert.equal(report.outcome.independentOutcomeRows, 0);
  assert.equal(report.outcome.recoveryEpisodeRows, 0);

  assert.equal(report.rights.datasetCardLicenseClaim, "CC-BY-NC-4.0");
  assert.equal(report.rights.datasetApiLicenseTagPresent, true);
  assert.equal(report.rights.datasetLicenseFilePresent, false);
  assert.equal(report.rights.commercialUseAuthorizedByCardClaim, false);
  assert.equal(report.rights.readmeTrainingDataUseCaseClaimPresent, true);
  assert.equal(report.rights.useSpecificTrainingAuthorizationEstablished, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.privacy.possibleInfrastructureIdentifiersOrSecrets, true);
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.privacy.rawProjectionRows, 0);
  for (const field of ["independentOutcomeRows", "physicalEffectRows",
    "realWorldOutcomeRows", "longitudinalOutcomeRows", "recoveryEpisodeRows",
    "retrySequenceRows", "preActionDelegationRows", "offlineTrainingRows",
    "productionTrainingRows", "networkAdmissionRows", "actorCreditRows",
    "ceuRows", "pricingRows", "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.boundary.autonomousActionAuthorized, false);

  assert.equal(report.source.sourceManifestHash,
    "sha256:cd1bc48abf45a33988b9b9636db93fd80f553e85f28d7e1f191cf87d2e013d1f");
  assert.equal(report.source.sourceRoot,
    "sha256:ec4dea1235cf502b369649d64519475207a2b9704a58ae96f99733ac3dd0754e");
  assert.equal(report.artifactHash,
    "sha256:68d9afc0aacd529baf04f5fd5869c2e0e95d0c5c7255242d0bd4ca1de261b8c4");
  assert.equal(receipt.receiptHash,
    "sha256:ff895f9838a6817ed98e556dfc0a0e83b54dce66d54e3b084cce7abb2766e69b");
});

test("all raw files stay private and full-repository publication is no-clobber", () => {
  assertPrivateTree(ARTIFACT);
  const report = path.join(ARTIFACT, "report.json");
  const receipt = path.join(ARTIFACT, "run-receipt.json");
  const session = path.join(ARTIFACT,
    "source/files/ReAct-Agent-Trajectories/OpenAI-GPT-OSS-120B/sre/Scenario-1/1/session.jsonl");
  const generatedCode = path.join(ARTIFACT,
    "source/files/ReAct-Agent-Trajectories/OpenAI-GPT-OSS-120B/sre/Scenario-1/2/code_generated_by_agent/analyze_cpu_throttling.py");
  const before = [sha256(report), sha256(receipt), sha256(session),
    sha256(generatedCode)];
  const sessionBefore = lstatSync(session, { bigint: true });
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-itbench-full-trajectories.mjs",
      "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  const sessionAfter = lstatSync(session, { bigint: true });
  assert.deepEqual([sha256(report), sha256(receipt), sha256(session),
    sha256(generatedCode)], before);
  assert.equal(sessionAfter.size, sessionBefore.size);
  assert.equal(sessionAfter.mtimeNs, sessionBefore.mtimeNs);
});

