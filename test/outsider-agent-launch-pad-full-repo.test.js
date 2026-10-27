import assert from "node:assert/strict";
import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  AGENT_LAUNCH_PAD_CARD_LICENSE,
  AGENT_LAUNCH_PAD_DATASET_ID,
  AGENT_LAUNCH_PAD_DISPOSITION,
  AGENT_LAUNCH_PAD_REVISION,
  verifyAgentLaunchPadArtifactDirectory,
} from "../src/outsider-agent-launch-pad-full-repo.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-agent-launch-pad-full-repo-20260829-v1");
let cached;
function artifact() {
  cached ??= verifyAgentLaunchPadArtifactDirectory(ARTIFACT);
  assert.equal(cached.ok, true, cached.error);
  return cached;
}

function assertPrivateTree(target) {
  const status = lstatSync(target);
  assert.equal(status.isSymbolicLink(), false, target);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600, target);
  if (status.isDirectory()) {
    for (const name of readdirSync(target)) assertPrivateTree(path.join(target, name));
  }
}

test("full fixed Agent Launch Pad repository replays both non-additive corpus versions", () => {
  const checked = artifact();
  assert.equal(checked.verificationLevel,
    "FULL_FIXED_REPOSITORY_AND_CONFLICTING_PARQUET_VERSIONS_REDERIVED");
  const { report, receipt } = checked;

  assert.equal(report.disposition, AGENT_LAUNCH_PAD_DISPOSITION);
  assert.equal(report.source.datasetId, AGENT_LAUNCH_PAD_DATASET_ID);
  assert.equal(report.source.revision, AGENT_LAUNCH_PAD_REVISION);
  assert.equal(report.source.public, true);
  assert.equal(report.source.gated, false);
  assert.equal(report.source.disabled, false);
  assert.equal(report.source.recordBeforeAfterByteIdentical, true);
  assert.equal(report.source.treeBeforeAfterByteIdentical, true);
  assert.equal(report.source.fixedTreeEntries, 7);
  assert.equal(report.source.fixedTreeFiles, 6);
  assert.equal(report.source.fixedTreeDirectories, 1);
  assert.equal(report.source.fixedTreeBytes, 142_956_961);
  assert.equal(report.source.fixedTreeLfsFiles, 4);
  assert.equal(report.source.fixedTreeXetFiles, 4);
  assert.equal(report.source.fixedTreeRoot,
    "sha256:75355a1583f6a8ed27ddef02977ae74cdd19ac44dfffe85568b4bb5016835403");
  assert.equal(report.source.recordUsedStorageBytes, 259_359_094);
  assert.equal(report.source.recordUsedStorageIsNotCurrentTreeBytes, true);
  assert.equal(report.source.completeFixedRepositoryPayloadAcquired, true);
  assert.equal(report.source.sourceManifestHash,
    "sha256:3a1b09f08a8092fdc6466c0f99a70b07fd1dafe98612e9349646f5108824a7e6");
  assert.equal(report.source.sourceRoot,
    "sha256:9723c7f4826403ffc21b3e6c18f74bc3dcfb5901c0ec2b11b7b6529d0825a761");
  assert.equal(report.source.sourceManifestFileSha256,
    "sha256:17fab2a43e38cf28c0f7839be717c0e1596dbe25c46dfdf278d295d5af83548b");

  const profiles = report.parquetReplay.profiles;
  assert.deepEqual(Object.fromEntries(Object.entries(profiles)
    .map(([name, value]) => [name, value.rows])), {
    all: 1_380, science: 176, terminal: 1_204, train: 1_406,
  });
  for (const profile of Object.values(profiles)) {
    assert.equal(profile.columns, 15);
    assert.equal(profile.physicalColumns, 16);
    assert.equal(profile.rowGroups, 1);
    assert.equal(profile.keysUnique, profile.rows);
    assert.equal(profile.conversation.malformedMessages, 0);
  }
  assert.deepEqual(profiles.all.counts.grade_pass,
    { false: 1_043, null: 192, true: 145 });
  assert.deepEqual(profiles.train.counts.grade_pass,
    { false: 1_091, null: 185, true: 130 });
  assert.deepEqual(profiles.terminal.counts.grade_pass,
    { false: 885, null: 181, true: 138 });
  assert.deepEqual(profiles.science.counts.grade_pass,
    { false: 158, null: 11, true: 7 });
  assert.deepEqual(profiles.all.counts.bench,
    { scienceagentbench: 176, "terminal-bench-2": 1_204 });
  assert.deepEqual(profiles.train.counts.bench,
    { scienceagentbench: 176, "terminal-bench-2": 1_230 });
  assert.deepEqual(profiles.all.counts.agent,
    { "hermes-agent": 676, "pi-mono": 704 });
  assert.deepEqual(profiles.train.counts.agent,
    { "hermes-agent": 702, "pi-mono": 704 });
  assert.deepEqual(profiles.all.publisherPassByModel, {
    "inclusionai/ling-2.6-1t:free": 22,
    "minimax/minimax-m2.5:free": 24,
    "openai/gpt-oss-120b:free": 20,
    "poolside/laguna-m.1:free": 21,
    "poolside/laguna-xs.2:free": 16,
    "tencent/hy3-preview:free": 30,
    "z-ai/glm-4.5-air:free": 12,
  });
  assert.equal(profiles.all.keyRoot,
    "sha256:554a7b740815b596e1cb9a1aa1c5e7c3b22c497dfcf984da2285ab890164878d");
  assert.equal(profiles.all.rowRoot,
    "sha256:8be000dd3c8ca913e08b5fe3d3a4669c2d69507d69ccb96fcf3b61adb70fd6da");
  assert.equal(profiles.train.keyRoot,
    "sha256:899d90ffc75db6f8feba6e9597646ae7395b159b75e23d232b3b619844c25be0");
  assert.equal(profiles.train.rowRoot,
    "sha256:b233a0bd0d0b7e18fff879bc083d916e6398ce5ce0f1806887f7ae06dfd8c731");
  assert.equal(profiles.all.instruction.emptyRows, 1_380);
  assert.equal(profiles.all.instruction.nonemptyRows, 0);
  assert.equal(profiles.train.instruction.emptyRows, 805);
  assert.equal(profiles.train.instruction.nonemptyRows, 601);
  assert.equal(profiles.all.conversation.messages, 52_483);
  assert.equal(profiles.train.conversation.messages, 50_663);
  assert.deepEqual(profiles.all.conversation.roleCounts, {
    gpt: 21_418, human: 1_751, system: 676, tool: 16_809, toolResult: 11_829,
  });
  assert.equal(report.parquetReplay.rawInstructionOrConversationProjectedIntoReport, false);
  assert.equal(report.parquetReplay.trajectoryContentOrEmbeddedInstructionsExecuted, false);

  const population = report.populationRegistry;
  assert.equal(population.allVersionRows, 1_380);
  assert.equal(population.terminalSubsetRows, 1_204);
  assert.equal(population.scienceSubsetRows, 176);
  assert.equal(population.allVersionIsExactOrderedTerminalThenScience, true);
  assert.equal(population.allAndSubsetsRepresentOnePopulation, true);
  assert.equal(population.trainVersionRows, 1_406);
  assert.equal(population.commonKeysAcrossVersions, 1_380);
  assert.equal(population.trainOnlyKeys, 26);
  assert.equal(population.unionUniqueKeysAcrossVersions, 1_406);
  assert.equal(population.allVersionAndTrainVersionConflict, true);
  assert.equal(population.versionsAreNonAdditive, true);
  assert.equal(population.crossTotal, null);

  const conflict = report.crossVersionConflict;
  assert.equal(conflict.commonKeys, 1_380);
  assert.equal(conflict.allOnlyKeys, 0);
  assert.equal(conflict.trainOnlyKeys, 26);
  assert.equal(conflict.exactCommonRows, 805);
  assert.equal(conflict.driftedCommonRows, 575);
  assert.equal(conflict.gradeDivergenceRows, 62);
  assert.deepEqual(conflict.trainOnlyBenchCounts, { "terminal-bench-2": 26 });
  assert.deepEqual(conflict.trainOnlyPublisherGradeCounts, { false: 24, true: 2 });
  assert.deepEqual(conflict.driftBenchCounts, { "terminal-bench-2": 575 });
  assert.deepEqual(conflict.driftAgentCounts, { "hermes-agent": 575 });
  assert.deepEqual(conflict.publisherGradeDivergenceTransitions, {
    "false->null": 2, "false->true": 16, "null->false": 7,
    "null->true": 2, "true->false": 35,
  });
  assert.equal(conflict.trainOnlyKeyRoot,
    "sha256:6887b53f913b546912e050f85fe4c7feeff8665742296fb346890dd6ccdf47a8");
  assert.equal(conflict.driftKeyRoot,
    "sha256:3d11aa252d098d2834fe96d6addb5aa691306f766b7df86c004b02c5a416fdbe");
  assert.equal(conflict.fieldDifferenceCounts.grade_pass, 62);
  assert.equal(conflict.fieldDifferenceCounts.grade_score, 62);
  assert.equal(conflict.fieldDifferenceCounts.grade_reason, 575);
  assert.equal(conflict.fieldDifferenceCounts.verifier_raw_reward, 62);
  assert.equal(conflict.fieldDifferenceCounts.verifier_n_passed, 138);
  assert.equal(conflict.fieldDifferenceCounts.verifier_n_failed, 139);
  assert.equal(conflict.fieldDifferenceCounts.latency_s, 575);
  assert.equal(conflict.fieldDifferenceCounts.mode, 575);
  assert.equal(conflict.fieldDifferenceCounts.ok, 575);
  assert.equal(conflict.fieldDifferenceCounts.instruction, 575);
  assert.equal(conflict.fieldDifferenceCounts.conversations, 575);
  assert.equal(conflict.fieldDifferenceCounts.bench, 0);
  assert.equal(conflict.fieldDifferenceCounts.agent, 0);
  assert.equal(conflict.fieldDifferenceCounts.model, 0);
  assert.equal(conflict.fieldDifferenceCounts.task_id, 0);
  assert.equal(conflict.allIsOrderedTerminalThenScience, true);
  assert.equal(conflict.allTerminalRowsExactlyEqualTerminalFile, true);
  assert.equal(conflict.allScienceRowsExactlyEqualScienceFile, true);

  assert.equal(report.documentationDrift.readmeClaimedRows, 1_380);
  assert.equal(report.documentationDrift.readmeClaimedPublisherPasses, 145);
  assert.equal(report.documentationDrift.readmeMatchesAllAndSubsetsVersion, true);
  assert.equal(report.documentationDrift.readmeMatchesTrainVersion, false);
  assert.equal(report.documentationDrift.readmePerModelPublisherPassesMatchAllVersion, true);
  assert.equal(report.documentationDrift.trainVersionPublisherPasses, 130);
  assert.equal(report.documentationDrift.trainConfiguredInCardExamples, 1_406);

  assert.equal(report.publisherOutcomeBoundary.publisherHarnessVerifierSignals, true);
  assert.equal(report.publisherOutcomeBoundary.publisherVerifierOutcomesIndependent, false);
  assert.equal(report.publisherOutcomeBoundary.independentOutcomeRows, 0);
  assert.equal(report.publisherOutcomeBoundary.realWorldOutcomeRows, 0);
  assert.equal(report.publisherOutcomeBoundary.retryRows, 0);
  assert.equal(report.publisherOutcomeBoundary.recoveryRows, 0);
  assert.equal(report.trajectoryBoundary.completePhysicalEpisodeRows, 0);
  assert.equal(report.trajectoryBoundary.siblingCellsAreRetriesOrRecoveryAttempts, false);

  const rights = report.rightsPrivacyAndUse;
  assert.equal(rights.rights.datasetCardLicenseClaim, AGENT_LAUNCH_PAD_CARD_LICENSE);
  assert.equal(rights.rights.repositoryLicenseFilePresent, false);
  assert.equal(rights.rights.readmeTerminalUnderlyingClaim, "Apache 2.0");
  assert.equal(rights.rights.readmeScienceUnderlyingClaim, "research use");
  assert.equal(rights.rights.perRowUpstreamRightsIndependentlyClosed, false);
  assert.equal(rights.rights.rightsDisposition, "FAIL_CLOSED");
  assert.equal(rights.rights.authorizedTrainingRows, 0);
  assert.equal(rights.privacy.rawSourcePrivate, true);
  assert.equal(rights.privacy.noPiiGuaranteed, false);
  assert.equal(rights.use.quarantineEvaluationOnly, true);
  assert.equal(rights.use.offlineTrainingRows, 0);
  assert.equal(rights.use.networkAdmissionRows, 0);
  assert.equal(rights.use.authorityRows, 0);
  assert.equal(rights.use.ceuRows, 0);

  for (const [key, value] of Object.entries(report.zeroClaimBoundary)) {
    assert.equal(value, key === "autonomousActionAuthorized" ? false : 0, key);
  }
  assert.equal(receipt.allVersionRows, 1_380);
  assert.equal(receipt.trainVersionRows, 1_406);
  assert.equal(receipt.crossTotal, null);
  assert.equal(receipt.receiptWrittenLast, true);
  assert.equal(receipt.noClobber, true);
  assert.equal(report.artifactHash,
    "sha256:956458df3ade019fe48896f49ea4378966cecc2a2dbc6ba1e01a880799c2849a");
  assert.equal(receipt.receiptHash,
    "sha256:93a65b304a0707a4887858ffdcaf1e47d0df2b77a7b157dfc9ce975f14222b2b");
});

test("artifact is private and receipt-bound to the full source replay", () => {
  const checked = artifact();
  assertPrivateTree(ARTIFACT);
  assert.match(checked.report.artifactHash, /^sha256:[a-f0-9]{64}$/u);
  assert.match(checked.receipt.receiptHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(checked.receipt.reportHash, checked.report.artifactHash);
  assert.equal(checked.receipt.sourceManifestHash,
    checked.report.source.sourceManifestHash);
  assert.equal(checked.receipt.sourceRoot, checked.report.source.sourceRoot);
  assert.equal(checked.reportFileSha256,
    "sha256:7c206da6d45dce18a8ff12c42abdb7c05e3b9d9f1b0ad002e8cec1b254706aa8");
  assert.equal(checked.receiptFileSha256,
    "sha256:0a511265ca3f6ef38f974e1fceda288abc43a3545390e4bd844dd5dfc7943674");
});
