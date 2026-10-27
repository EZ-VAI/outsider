import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  EVAL_AWARE_LINUXARENA_DATASET_ID,
  EVAL_AWARE_LINUXARENA_DISPOSITION,
  EVAL_AWARE_LINUXARENA_HISTORICAL_ALIAS,
  EVAL_AWARE_LINUXARENA_REVISION,
  EVAL_AWARE_LINUXARENA_SCOPE,
  verifyEvalAwareLinuxArenaArtifactDirectory,
} from "../src/outsider-eval-aware-linuxarena-derived-crosswalk.js";

const artifact = path.resolve(
  "artifacts/outsider-eval-aware-linuxarena-derived-crosswalk-20260829-v1");
const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function walkModes(root, prefix = "") {
  const target = prefix === "" ? root : path.join(root, prefix);
  const status = lstatSync(target);
  assert.equal(status.isSymbolicLink(), false);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600);
  if (!status.isDirectory()) return;
  for (const name of readdirSync(target)) {
    walkModes(root, prefix === "" ? name : `${prefix}/${name}`);
  }
}

test("complete fixed derived corpus and separate raw-200 source are preserved", () => {
  assert.equal(report.disposition, EVAL_AWARE_LINUXARENA_DISPOSITION);
  assert.equal(report.scope.kind, EVAL_AWARE_LINUXARENA_SCOPE);
  assert.equal(report.scope.datasetId, EVAL_AWARE_LINUXARENA_DATASET_ID);
  assert.equal(report.scope.revision, EVAL_AWARE_LINUXARENA_REVISION);
  assert.equal(report.scope.completePublishedDerivedRepositoryAcquired, true);
  assert.equal(report.scope.completePublishedDerivedRowsReplayed, 775);
  assert.equal(report.scope.upstreamRawRunOrAttemptCensusClaimed, false);
  assert.equal(report.scope.globalLinuxArenaCorpusExhausted, false);
  assert.equal(report.source.fixedRevisionTreeEntries, 4);
  assert.equal(report.source.fixedRevisionFiles, 3);
  assert.equal(report.source.fixedRevisionFileBytes, 123_664_935);
  assert.equal(report.source.parquetBytes, 123_656_922);
  assert.equal(report.source.parquetLfsSha256,
    "sha256:4af875ba6b3b8cf7be5e40c42b0f94c724e42f8b367b7c8647d87bcc8d27054d");
  assert.equal(report.source.historicalAliasRequested,
    EVAL_AWARE_LINUXARENA_HISTORICAL_ALIAS);
  assert.equal(report.source.aliasRequestResolvedToCurrentDatasetId, true);
  assert.equal(report.source.aliasRecordExactCurrentRecord, true);
  assert.deepEqual(
    readFileSync(path.join(artifact, "source/metadata/dataset-record-before.json")),
    readFileSync(path.join(artifact, "source/metadata/dataset-record-after.json")));
  assert.deepEqual(
    readFileSync(path.join(artifact, "source/metadata/alias-record-before.json")),
    readFileSync(path.join(artifact, "source/metadata/alias-record-after.json")));
  assert.deepEqual(
    readFileSync(path.join(artifact, "source/metadata/full-tree-before.json")),
    readFileSync(path.join(artifact, "source/metadata/full-tree-after.json")));
  const manifest = JSON.parse(readFileSync(
    path.join(artifact, "source/source-manifest.json"), "utf8"));
  assert.equal(manifest.sourceObjects.length, 25);
  assert.equal(manifest.derivedRepositoryFiles, 3);
  assert.equal(manifest.nestedRawArtifactFiles, 16);
});

test("all 775 rows and 49,817 action spans replay from publisher bytes", () => {
  assert.equal(report.replay.rows, 775);
  assert.deepEqual(report.replay.rowGroups, [579, 196]);
  assert.equal(report.replay.columns, 36);
  assert.equal(report.replay.uniqueTrajectoryIds, 775);
  assert.equal(report.replay.uniqueRunIds, 14);
  assert.equal(report.replay.uniqueRunNames, 14);
  assert.equal(report.replay.uniqueModelShortValues, 14);
  assert.deepEqual(report.replay.policyRows,
    { attack: 316, "claude-code": 38, honest: 421 });
  assert.deepEqual(report.replay.mainTaskSuccessRows, { false: 495, true: 280 });
  assert.deepEqual(report.replay.sideTaskSuccessRows, { false: 616, true: 159 });
  assert.equal(report.replay.actions.rows, 49_817);
  assert.equal(report.replay.actions.minimumPerTrajectory, 0);
  assert.equal(report.replay.actions.maximumPerTrajectory, 192);
  assert.equal(report.replay.actions.zeroActionTrajectories, 1);
  assert.equal(Object.keys(report.replay.actions.functionCounts).length, 38);
  assert.equal(report.replay.actions.uniqueNormalizedActions, 66);
  assert.equal(report.replay.actions.argumentJsonParseFailures, 0);
  assert.equal(report.replay.actions.parallelListLengthExactTrajectories, 775);
  assert.equal(report.replay.actions.first5L1RederivedRows, 775);
  assert.equal(report.replay.actions.first5L2RederivedRows, 775);
  assert.equal(report.replay.actions.allFilesRederivedRows, 775);
  assert.equal(report.replay.rowSignatureRoot,
    "sha256:c1f15e70729b350d5ef094f1923bd4d2ebbfeb6c91a9fbe9ce29200740988b3c");
  assert.equal(report.replay.actionProjectionRoot,
    "sha256:d1fafad6e2c81b6d05cf7d36f5de953a88930b3fe4d1a50a4d0a914035092ec5");
  assert.equal(report.replay.trajectoryIdRoot,
    "sha256:a84a17552f2f15f205d203b334c41deb249e61376bf55d127d7904450dd546e9");
});

test("crosswalk keeps task overlap separate from run and execution identity", () => {
  const crosswalk = report.crosswalk;
  assert.equal(crosswalk.rawRows, 200);
  assert.equal(crosswalk.derivedRows, 775);
  assert.equal(crosswalk.exactTrajectoryIdOverlap, 0);
  assert.equal(crosswalk.exactRunIdOverlap, 0);
  assert.equal(crosswalk.derivedRowsWithUniqueRawTaskMatch, 135);
  assert.equal(crosswalk.derivedRowsWithoutRawTaskMatch, 640);
  assert.equal(crosswalk.uniqueRawTasksMatched, 89);
  assert.equal(crosswalk.rawTasksNotRepresented, 111);
  assert.equal(crosswalk.ambiguousDerivedTaskMatches, 0);
  assert.deepEqual(crosswalk.rawTaskFieldKindRows, { name: 135 });
  assert.deepEqual(crosswalk.mainLabelPairs, {
    raw_false__derived_false: 50,
    raw_false__derived_true: 20,
    raw_true__derived_false: 22,
    raw_true__derived_true: 43,
  });
  assert.equal(crosswalk.mainLabelEqualRows, 93);
  assert.equal(crosswalk.sideLabelEqualRows, 115);
  assert.equal(crosswalk.actionCountEqualRows, 0);
  assert.equal(crosswalk.functionSequenceEqualRows, 0);
  assert.equal(crosswalk.argumentSequenceEqualRows, 0);
  assert.equal(crosswalk.outputSequenceEqualRows, 0);
  assert.equal(crosswalk.errorSequenceEqualRows, 0);
  assert.equal(crosswalk.reasoningSequenceEqualRows, 0);
  assert.equal(crosswalk.exactActionProjectionHashMatches, 0);
  assert.equal(crosswalk.derivedToRawTaskPairRoot,
    "sha256:85ef02c1bd94f9c812f1f265fa33ed726f51183cee65cfe54f0f413171c1617e");
  assert.equal(crosswalk.honestHaiku.derivedRows, 23);
  assert.equal(crosswalk.honestHaiku.taskMatches, 3);
  assert.equal(crosswalk.honestHaiku.mainLabelEqualRows, 3);
  assert.equal(crosswalk.honestHaiku.actionProjectionHashMatches, 0);
  assert.equal(report.selection.taskDefinitionOverlapDoesNotEstablishExecutionIdentity,
    true);
  assert.equal(crosswalk.mainLabelAgreementIsAcrossDifferentExecutions, true);
  assert.equal(crosswalk.rawAndDerivedPopulationAdditionProhibited, true);
});

test("publisher outcomes, truncation, and error morphology stay correctly scoped", () => {
  assert.equal(report.documentation.publisherClaimsFullTrajectoryRows, 775);
  assert.equal(report.documentation.actionListStructuralCompletenessRows, 775);
  assert.equal(report.documentation.publisherDocumentsActionOutputTruncationAt8000Characters,
    true);
  assert.equal(report.documentation.outputRowsWith8000PlusMarkerLength, 2_619);
  assert.equal(report.documentation.maximumStoredOutputLength, 8_035);
  assert.equal(report.documentation.rawUntruncatedOutputByteCompletenessEstablished,
    false);
  assert.equal(report.outcome.publisherNativeMainTaskOutcomeRows, 775);
  assert.equal(report.outcome.publisherMainTaskSuccessTrueRows, 280);
  assert.equal(report.outcome.publisherMainTaskSuccessFalseRows, 495);
  assert.equal(report.outcome.publisherNativeAttackSideTaskOutcomeRows, 316);
  assert.equal(report.outcome.publisherAttackSideTaskSuccessTrueRows, 159);
  assert.equal(report.outcome.publisherAttackSideTaskSuccessFalseRows, 157);
  assert.equal(report.outcome.outcomeProducerIndependentFromExecutionSystem, false);
  assert.equal(report.outcome.independentlyVerifiedOutcomeRows, 0);
  assert.equal(report.outcome.completeUpstreamAttemptCensusEstablished, false);
  assert.equal(report.recovery.outputErrorActionRows, 1_666);
  assert.equal(report.recovery.tracesWithOutputError, 481);
  assert.equal(report.recovery.errorThenLaterNonerrorTraces, 481);
  assert.equal(report.recovery.laterNonerrorActionIsMorphologyNotRecovery, true);
  assert.equal(report.recovery.publisherNativeRecoveryLabelRows, 0);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
});

test("privacy, active content, rights, training, and authority fail closed", () => {
  assert.deepEqual(report.privacy.privacyPatternCandidates.email,
    { occurrences: 9_922, rows: 438 });
  assert.deepEqual(report.privacy.privacyPatternCandidates.ipv4,
    { occurrences: 9_545, rows: 445 });
  assert.deepEqual(report.privacy.privacyPatternCandidates.awsAccessKey,
    { occurrences: 33, rows: 8 });
  assert.deepEqual(report.privacy.privacyPatternCandidates.githubToken,
    { occurrences: 19, rows: 7 });
  assert.equal(report.privacy.candidatePatternsMayMatchSyntheticContent, true);
  assert.equal(report.privacy.privacyPatternScanIsNotAnonymityProof, true);
  assert.equal(report.privacy.noPiiOrSecretGuaranteed, false);
  assert.equal(report.privacy.rawContentProjected, false);
  assert.equal(report.privacy.rawVisualBytes, 0);
  assert.equal(report.activeContent.attackPolicyRows, 316);
  assert.equal(report.activeContent.harmfulOrDualUsePayloadRiskPresent, true);
  assert.equal(report.activeContent.payloadSafeToExecute, false);
  assert.equal(report.activeContent.payloadsExecuted, 0);
  assert.equal(report.activeContent.commandsExecuted, 0);
  assert.equal(report.execution.downloadedCommandsToolInputsOrCodeExecuted, false);
  assert.equal(report.rights.derivedCardLicenseClaim, "MIT");
  assert.equal(report.rights.derivedRepositoryLicenseFilePresent, false);
  assert.equal(report.rights.upstreamRawArtifactCardLicenseClaim, "CC-BY-4.0");
  assert.equal(report.rights.upstreamAndDerivedLicenseClaimsDiffer, true);
  assert.equal(report.rights.derivativeChainRightsIndependentlyAdjudicated, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.rights.redistributionAuthorizedByThisArtifact, false);
  assert.equal(report.boundary.offlineTrainingRows, 0);
  assert.equal(report.boundary.productionTrainingRows, 0);
  assert.equal(report.boundary.networkAdmissionRows, 0);
  assert.equal(report.boundary.authorityRows, 0);
  assert.equal(report.boundary.ceuRows, 0);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyEvalAwareLinuxArenaArtifactDirectory(artifact,
    { pythonExecutable: "/opt/anaconda3/bin/python" });
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:bb593433402844cd48b42555b9d95bf00c4c770281e637473f5061a4b4727efb");
  assert.equal(checked.receipt.receiptHash,
    "sha256:0fb250e276647a7e69a239a453d728835ae95bba787b577f4589468318044679");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-eval-aware-linuxarena-derived-crosswalk.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
