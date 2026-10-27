import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  LINUXARENA_HAIKU_HONEST_DISPOSITION,
  LINUXARENA_HAIKU_HONEST_SCOPE,
  LINUXARENA_REVISION,
  buildLinuxArenaHaikuHonestArtifactFromSourceDirectory,
  serializeLinuxArenaHaikuHonestArtifact,
  verifyLinuxArenaHaikuHonestArtifactDirectory,
} from "../src/outsider-linuxarena-haiku-honest-run.js";

const artifact = path.resolve(
  "artifacts/outsider-linuxarena-haiku-honest-run-20260829-v1");

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

test("strict HTTP ranges close one complete publisher-derived honest run", () => {
  const built = buildLinuxArenaHaikuHonestArtifactFromSourceDirectory(
    path.join(artifact, "source"));
  const report = built.report;
  assert.equal(report.disposition, LINUXARENA_HAIKU_HONEST_DISPOSITION);
  assert.equal(report.scope.kind, LINUXARENA_HAIKU_HONEST_SCOPE);
  assert.equal(report.scope.revision, LINUXARENA_REVISION);
  assert.deepEqual(report.scope.selectedInclusiveByteRange, [0, 62_762_383]);
  assert.equal(report.scope.selectedBytes, 62_762_384);
  assert.equal(report.scope.selectedRows, 200);
  assert.equal(report.scope.nextRunHeaderBoundaryProven, true);
  assert.equal(report.scope.nextRunDisplayName, "Haiku attack");
  assert.equal(report.source.exactRangeResponsesWereHttp206, true);
  assert.equal(report.source.recordAndTreeStateStable, true);
  const honestReceipt = JSON.parse(readFileSync(path.join(artifact,
    "source/metadata/honest-range-response.json"), "utf8"));
  assert.equal(honestReceipt.responseStatus, 206);
  assert.equal(honestReceipt.contentRange,
    "bytes 0-62762383/704485115");
  const boundaryReceipt = JSON.parse(readFileSync(path.join(artifact,
    "source/metadata/boundary-range-response.json"), "utf8"));
  assert.equal(boundaryReceipt.contentRange,
    "bytes 62762384-62762624/704485115");
  const stored = readFileSync(path.join(artifact, "source/source-manifest.json"));
  assert.deepEqual(serializeLinuxArenaHaikuHonestArtifact(built.sourceManifest),
    stored);
});

test("the complete run preserves all tasks, environments, and actions", () => {
  const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
  assert.equal(report.replay.selectedRows, 200);
  assert.equal(report.replay.uniqueTrajectoryIds, 200);
  assert.equal(report.replay.uniqueMainTaskIds, 200);
  assert.equal(report.replay.trajectoryIdsSortedByPublisherBuilder, true);
  assert.deepEqual(report.replay.environmentRows, {
    auto_workflow: 20, clinical_trial: 20, file_indexing: 20,
    media_processing: 20, model_registry: 20, shared_dotfiles: 20,
    slack_clone: 20, tiktok: 20, user_tracking: 20, web_scraping: 20,
  });
  assert.equal(report.replay.actionRows, 14_759);
  assert.deepEqual(report.replay.actionFunctionRows, {
    bash: 9_230, client_bash: 10, db_bash: 11, mp_restart: 11,
    nginx_bash: 1, py_ml_bash: 13, rust_worker_bash: 56,
    submit: 189, text_editor: 5_238,
  });
  assert.equal(report.replay.submitActionRows, 189);
  assert.equal(report.replay.sideTaskNullRows, 200);
  assert.deepEqual(report.replay.sideTaskSuccess, { false: 200 });
});

test("publisher outcomes remain distinct from independent verification", () => {
  const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
  assert.deepEqual(report.replay.mainTaskSuccess, { false: 97, true: 103 });
  assert.equal(report.outcome.publisherNativeMainTaskOutcomeRows, 200);
  assert.equal(report.outcome.publisherMainTaskSuccessTrueRows, 103);
  assert.equal(report.outcome.publisherMainTaskSuccessFalseRows, 97);
  assert.equal(report.outcome.outcomeProducerIndependentFromExecutionSystem,
    false);
  assert.equal(report.outcome.independentlyVerifiedOutcomeRows, 0);
  assert.equal(report.outcome.completePublisherRunAttemptCensusRows, 200);
  assert.equal(report.outcome.completeAttemptCensusReconstructedFromFullShards,
    false);
});

test("error-follow-on morphology is not promoted to recovery", () => {
  const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
  assert.equal(report.recovery.outputErrorActionRows, 321);
  assert.equal(report.recovery.tracesWithOutputError, 180);
  assert.equal(report.recovery.outputErrorTracesWithLaterNonerrorAction, 180);
  assert.equal(report.recovery.laterNonerrorActionIsMorphologyNotRecovery, true);
  assert.equal(report.recovery.publisherNativeRecoveryLabelRows, 0);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
  assert.equal(report.recovery.longitudinalRecoveryRows, 0);
});

test("support inconsistencies, privacy, rights, and active content fail closed", () => {
  const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
  assert.equal(report.publisherCorpus.fullEnvironmentShardsAcquired, false);
  assert.equal(report.publisherCorpus.fullSourceCorpusReconstructed, false);
  assert.equal(report.publisherCorpus.manifestTrajectoryClaim, 22_215);
  assert.equal(report.publisherCorpus.manifestRunClaim, 172);
  assert.equal(report.publisherCorpus.manifestEnvironmentClaim, 10);
  assert.equal(report.publisherCorpus.manifestMinusFixedTreeShardBytes, 1_222_745);
  assert.equal(report.supportConsistency.readmeAndBuilderReviewerSampleRows, 932);
  assert.equal(report.supportConsistency.croissantStaleReviewerSampleRows, 882);
  assert.equal(report.supportConsistency.croissantRaiTodoMarkers, 4);
  assert.equal(report.privacy.manifestAnonymityFlagCounts["mongo uri"], 34);
  assert.equal(report.privacy.manifestAnonymityFlagCounts["i-instance-id"], 4);
  assert.equal(report.privacy.selectedEmailPatternCandidates, 1_509);
  assert.equal(report.privacy.noPiiOrSecretGuaranteed, false);
  assert.equal(report.rights.trajectoryLicenseClaim, "CC-BY-4.0");
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.safety.completeAttackTrajectoryRowsStored, 0);
  assert.equal(report.safety.attackActionBytesStored, 0);
  assert.equal(report.safety.attackBoundaryHeaderBytesStored, 241);
  assert.equal(report.safety.harmfulOrDualUsePayloadRiskPresent, true);
  assert.equal(report.replay.downloadedToolInputsCommandsOrCodeExecuted, false);
  assert.equal(report.boundary.productionTrainingRows, 0);
  assert.equal(report.boundary.networkAdmissionRows, 0);
  assert.equal(report.boundary.authorityRows, 0);
  assert.equal(report.boundary.ceuRows, 0);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyLinuxArenaHaikuHonestArtifactDirectory(artifact);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:091b07503d9937eaa76dfb4d73ceb3006ad4dab9b6bfab41db290c602caa3b67");
  assert.equal(checked.receipt.receiptHash,
    "sha256:91e487148c230ca59e43c9b90ecf3383e3e3b9cfc6eb059180190582c7a22f5b");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-linuxarena-haiku-honest-run.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
