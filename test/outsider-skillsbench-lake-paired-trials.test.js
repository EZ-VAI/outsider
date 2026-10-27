import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  SKILLSBENCH_DISPOSITION,
  SKILLSBENCH_PRIMARY_REVISION,
  SKILLSBENCH_REGISTRY_REVISION,
  SKILLSBENCH_TASK_REVISION,
  SKILLSBENCH_TRIAL_REVISION,
  verifySkillsbenchLakePairedArtifactDirectory,
} from "../src/outsider-skillsbench-lake-paired-trials.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-skillsbench-lake-paired-trials-20260829-v1");
const REPORT = path.join(ARTIFACT, "report.json");
const RECEIPT = path.join(ARTIFACT, "run-receipt.json");
const MANIFEST = path.join(ARTIFACT, "source/source-manifest.json");

const EXPECTED = Object.freeze({
  artifactHash: "sha256:fb15f4b36016196a0085e70b1ba15d950ce805da6cd177c747cbc098b773ec88",
  receiptHash: "sha256:a9a12751fbc7447f9afc08aefc8d28ef0520a89d8c0d3fb27e3694c1c8b2639d",
  sourceManifestHash: "sha256:e81cf514e58c1548ea8ef1ac988d46230ac295ab5e752e6ef765129f32a78f8f",
  sourceRoot: "sha256:b1b356f1f913a1f241c6f70f51429f53ecf8b1b0a04f82aae55ba634dfb31978",
  reportFile: "sha256:6e59fde217ac6341f55a7878ab03698ca6c1841d753cff822c5190cd40c7eb10",
  receiptFile: "sha256:3088a9242dadf8b994efa3ce448e8b940dce55b8e4d8c9b0ce7e3796dc653af2",
  manifestFile: "sha256:0389ebf0c4e8a646323a3671e5eb889d2b3afd6787bb3bbcdd46d64b140606b6",
});

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function assertPrivateTree(root) {
  const status = lstatSync(root);
  assert.equal(status.isSymbolicLink(), false, root);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600, root);
  if (!status.isDirectory()) return;
  for (const name of readdirSync(root)) assertPrivateTree(path.join(root, name));
}

test("the pinned SkillsBench pair replays every fresh trial with quarantine boundaries", () => {
  const checked = verifySkillsbenchLakePairedArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FULL_MAIN_AND_PR5_INVENTORY_TASK_AND_TRIAL_BYTE_REPLAY");
  assert.equal(checked.privateFiles, 1_338);

  const reportBytes = readFileSync(REPORT);
  const receiptBytes = readFileSync(RECEIPT);
  const manifestBytes = readFileSync(MANIFEST);
  const report = JSON.parse(reportBytes);
  const receipt = JSON.parse(receiptBytes);
  const manifest = JSON.parse(manifestBytes);
  assert.equal(report.artifactHash, EXPECTED.artifactHash);
  assert.equal(receipt.receiptHash, EXPECTED.receiptHash);
  assert.equal(report.source.sourceManifestHash, EXPECTED.sourceManifestHash);
  assert.equal(report.source.sourceRoot, EXPECTED.sourceRoot);
  assert.equal(sha256(reportBytes), EXPECTED.reportFile);
  assert.equal(sha256(receiptBytes), EXPECTED.receiptFile);
  assert.equal(sha256(manifestBytes), EXPECTED.manifestFile);
  assert.equal(receipt.reportFileSha256, EXPECTED.reportFile);
  assert.equal(receipt.sourceManifestFileSha256, EXPECTED.manifestFile);
  assert.equal(manifest.manifestHash, EXPECTED.sourceManifestHash);
  assert.equal(manifest.sourceRoot, EXPECTED.sourceRoot);
  assert.equal(manifest.entries.length, 1_335);
  assert.equal(manifest.entries.reduce((sum, entry) => sum + entry.bytes, 0),
    221_350_397);

  assert.equal(report.source.requestedPrimaryRevision, SKILLSBENCH_PRIMARY_REVISION);
  assert.equal(report.source.preSelectionTrialRevision, SKILLSBENCH_TRIAL_REVISION);
  assert.deepEqual(report.source.primaryInventory, {
    pages: 293, entries: 292_907, files: 210_808, directories: 82_099,
    logicalBytes: 207_907_171_034, lfsFiles: 41_238,
    lfsBytes: 205_589_821_636,
    snapshotHash: "sha256:afed1232e6c086d45068d9cc0b3d06bb63c455b90c7172c881d1d8a62c18c707",
  });
  assert.deepEqual(report.source.trialInventory, {
    pages: 22, entries: 21_954, files: 15_153, directories: 6_801,
    logicalBytes: 62_248_806_508, lfsFiles: 5_767,
    lfsBytes: 62_199_713_677,
    snapshotHash: "sha256:7d74a8b147522ee7cf798dbd1b771cb5e1e121bdf94ac0779ea8aa91690f4dcf",
  });
  assert.equal(report.source.mappingAuthorityBeforeAndAfterStable, true);
  assert.equal(report.source.trialInventoryBeforeAndAfterStable, true);
  assert.equal(report.source.primaryRecordSiblingListIsCompleteInventory, false);
  assert.equal(report.source.primaryRecordSiblingCount, 17_901);

  assert.equal(report.mapping.strictCreditedBeforeTimeoutFilter, 1_162);
  assert.equal(report.mapping.reviewedNonTimeoutSelected, 1_150);
  assert.equal(report.mapping.timeoutExcludedByPublisherSelection, 12);
  assert.equal(report.mapping.reviewedOnlySelectionUsedForThisArtifact, false);
  assert.equal(report.boundedSelection.eligibleTaskModelPairs, 263);
  assert.equal(report.boundedSelection.declaredScopeExhausted, true);
  assert.equal(report.boundedSelection.internetGlobalExhaustionClaimed, false);
  assert.equal(report.boundedSelection.selectedByMinimumCompleteSourceBytes, true);
  assert.equal(report.boundedSelection.allSourceNativeFreshTrialsIncluded, true);
  assert.equal(report.boundedSelection.selectedFiles, 35);
  assert.equal(report.boundedSelection.selectedBytes, 10_076_876);
  assert.equal(report.boundedSelection.attemptDenominator, 7);
  assert.equal(report.boundedSelection.withSkillTrials, 3);
  assert.equal(report.boundedSelection.noSkillTrials, 4);

  assert.equal(report.replay.trials.length, 7);
  assert.equal(new Set(report.replay.trials.map((row) => row.trialKey)).size, 7);
  assert.equal(report.replay.publisherPass, 1);
  assert.equal(report.replay.publisherFailOrIncomplete, 6);
  assert.equal(report.replay.timeoutTrials, 1);
  assert.equal(report.replay.partialTrajectories, 1);
  assert.equal(report.replay.totalToolCalls, 70);
  assert.equal(report.replay.totalSkillInvocations, 10);
  assert.equal(report.replay.pendingToolCalls, 2);
  assert.equal(report.replay.acpRows, 117);
  assert.equal(report.replay.llmRequestResponseRows, 81);
  assert.equal(report.replay.totalTokensPublisherReported, 1_310_422);
  assert.deepEqual(report.replay.byMode.withSkill, {
    trials: 3, publisherPass: 1, publisherFailOrIncomplete: 2,
    timeouts: 0, partialTrajectories: 0, toolCalls: 35,
    skillInvocations: 10, pendingToolCalls: 2, acpRows: 57,
    llmRows: 38, totalTokens: 640_278, timingTotalSeconds: 1_256.3,
  });
  assert.deepEqual(report.replay.byMode.noSkill, {
    trials: 4, publisherPass: 0, publisherFailOrIncomplete: 4,
    timeouts: 1, partialTrajectories: 1, toolCalls: 35,
    skillInvocations: 0, pendingToolCalls: 0, acpRows: 60,
    llmRows: 43, totalTokens: 670_144, timingTotalSeconds: 1_267.7,
  });
  assert.equal(report.replay.commandsOrSkillContentExecutedByIntake, false);
  assert.equal(report.replay.exactSourceBytesReplayed, true);

  assert.equal(report.taskRegistry.registryAuthorityRevision,
    SKILLSBENCH_REGISTRY_REVISION);
  assert.equal(report.taskRegistry.selectedTaskRevision, SKILLSBENCH_TASK_REVISION);
  assert.equal(report.taskRegistry.registryAuthoritySignedCommit, true);
  assert.equal(report.taskRegistry.registryTaskCount, 87);
  assert.equal(report.taskRegistry.taskFiles, 14);
  assert.equal(report.taskRegistry.taskBytes, 20_471);
  assert.equal(report.taskRegistry.skillFiles, 4);
  assert.equal(report.taskRegistry.skillBytes, 11_654);
  assert.equal(report.taskRegistry.taskBytesExecutedByIntake, false);
  assert.equal(report.taskRegistry.trialConfigStampedWithRegistryDigest, false);
  assert.equal(report.taskRegistry.exactTrialToRegistryTaskByteBindingEstablished, false);

  assert.equal(report.disposition, SKILLSBENCH_DISPOSITION);
  assert.equal(report.rightsAndUse.disposition, "QUARANTINE_EVAL");
  assert.equal(report.rightsAndUse.publisherDatasetCardLicenseClaim, "Apache-2.0");
  assert.equal(report.rightsAndUse.pinnedRepositoryLicenseFile, "Apache-2.0");
  assert.equal(report.rightsAndUse.licenseClaimIsUseSpecificTrainingClearance, false);
  assert.equal(report.rightsAndUse.benchmarkDataTrainingContaminationProhibited, true);
  assert.equal(report.rightsAndUse.offlineEvaluationOnly, true);
  assert.equal(report.rightsAndUse.trainingPerformed, false);
  assert.equal(report.rightsAndUse.trainingJobs, 0);
  assert.equal(report.rightsAndUse.authorizedTrainingRows, 0);
  assert.equal(report.rightsAndUse.offlineModelFittingRows, 0);
  assert.equal(report.rightsAndUse.productionTrainingRows, 0);
  assert.equal(report.privacy.rawCommandsAndToolCallsPrivate0600, true);
  assert.equal(report.privacy.rawLlmRequestsAndResponsesPrivate0600, true);
  assert.equal(report.privacy.rawPromptsPrivate0600, true);
  assert.equal(report.privacy.rawSkillBytesPrivate0600, true);
  assert.equal(report.privacy.reportContainsRawDialogueCommandsOrSkillContent, false);
  assert.equal(report.truthBoundary.publisherVerifierRewardIsIndependentOutcome, false);
  assert.equal(report.truthBoundary.independentOutcomeUnits, 0);
  assert.equal(report.truthBoundary.recoveryUnits, 0);
  assert.equal(Object.values(report.boundary).every((value) => value === 0), true);
  assertPrivateTree(ARTIFACT);

  const before = [reportBytes, receiptBytes, manifestBytes].map(sha256);
  const noClobber = spawnSync(process.execPath,
    ["scripts/acquire-skillsbench-lake-paired-trials.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(noClobber.status, 0);
  assert.match(noClobber.stderr, /SKILLSBENCH_ACQUIRE_OUTPUT_EXISTS/u);
  assert.deepEqual([readFileSync(REPORT), readFileSync(RECEIPT), readFileSync(MANIFEST)]
    .map(sha256), before);
});
