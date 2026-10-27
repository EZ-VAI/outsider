import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  SO101_HF_ADMITTED_DATASET_ID,
  SO101_HF_ADMITTED_REVISION,
  SO101_HF_LEDGER_SCHEMA,
  publishSo101HfExhaustionArtifactDirectory,
  so101HfDigest,
  verifySo101HfExhaustionArtifactDirectory,
  verifySo101HfExhaustionReceipt,
  verifySo101HfExhaustionReport,
  verifySo101HfExhaustionReportWithSource,
  verifySo101HfExhaustionSource,
} from "../src/outsider-so101-hf-exhaustion-ledger.js";

const ROOT = path.resolve(
  "artifacts/outsider-so101-hf-exhaustion-ledger-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "so101-hf-exhaustion-ledger.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");

const EXPECTED_HASHES = Object.freeze({
  artifact: "sha256:9617a742f8c0c0062bcd29956d80893b22294642da3d2ecc9cce164a99b0ad06",
  candidateLedger:
    "sha256:cf8a5b1dd8f840b5f824de13d1d911d8af8e334348f171249b8159d2a3d8f561",
  candidateTree:
    "sha256:8bee88241225c7d30a0554b66074b568dc290cbef4a852e4a5c0be64cc0e6d91",
  inventory: "sha256:09bd7c67ecc51ea48bdeb46d64bf59c1b7a84afabb79fe07387aeed6587492df",
  inventoryFile:
    "sha256:fe0f29dfa0e010762996802ccb5e81c08f8bd7461c16e476f6ab82517c315d5d",
  manifest: "sha256:f88d333b61664f9fdb3d75ac296a6c2ba74f2a7340266f878b82bc95077ae476",
  manifestFile:
    "sha256:afe99f55ee44fa75e9fdadf9baaebac522acc3666fce97fc09147d786e5905e3",
  receipt: "sha256:8e159fef61f352020f1b4c372034a5a4a1dc2cf80475ca0fa702508ba0c0eda0",
  receiptFile:
    "sha256:0efcb7309f002a5d0964b4c7584977097a997f3596d8a37500a134e7651f01b2",
  reportFile:
    "sha256:50cf96133ec867bd8f8c674986fbf163fa80f93e16869714b80a1698f813d963",
  searchProjection:
    "sha256:1116cf202e27ac3e2e64878b34edb3a0d57c0bfaf1066b3330ea9db019d2d2ce",
  sourceRoot: "sha256:b5dd61504ae237376efee70dba077ec03a2eb622122bc00379f91a8a92eb35bc",
});

function reseal(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = so101HfDigest(changed, `${SO101_HF_LEDGER_SCHEMA}/artifact`);
  return changed;
}

function assertPrivateTree(root) {
  const visit = (directory) => {
    const stat = lstatSync(directory);
    assert.equal(stat.isSymbolicLink(), false, directory);
    assert.equal(stat.isDirectory(), true, directory);
    assert.equal(stat.mode & 0o777, 0o700, directory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const child = lstatSync(target);
      assert.equal(child.isSymbolicLink(), false, target);
      if (child.isDirectory()) visit(target);
      else {
        assert.equal(child.isFile(), true, target);
        assert.equal(child.mode & 0o777, 0o600, target);
      }
    }
  };
  visit(root);
}

test("official HF search and selected-source brackets replay the exact declared scope", () => {
  const checked = verifySo101HfExhaustionSource(SOURCE);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel, "FULL_QUERY_AND_SELECTED_SOURCE_REPLAY");
  assert.equal(checked.manifest.observedFrom, "2026-08-29T08:09:02.000Z");
  assert.equal(checked.manifest.observedThrough, "2026-08-29T08:10:25.000Z");
  assert.equal(checked.manifest.sourceSupportObjects.length, 44);
  assert.equal(checked.manifest.selectedObjects.length, 7);
  assert.equal(checked.manifest.selectedObjects.filter(
    (item) => item.lfsSha256 !== null).length, 3);
  assert.deepEqual(checked.manifest.declaredSearch.queries.map(
    (item) => [item.term, item.pages, item.records]), [
    ["so101", 10, 9_766],
    ["SO-101", 10, 9_766],
  ]);
  assert.equal(checked.manifest.declaredSearch.caseVariantsEquivalent, true);
  assert.equal(checked.manifest.declaredSearch.declaredScopeExhausted, true);
  assert.equal(checked.manifest.declaredSearch.globalExhaustion, false);
  assert.deepEqual(checked.searchSummary, {
    disabledRecords: 0, gatedAuto: 62, gatedManual: 25,
    privateRecords: 0, projectionHash: EXPECTED_HASHES.searchProjection,
    publicUngated: 9_679, records: 9_766,
  });
  assert.equal(checked.candidate.record.datasetId, SO101_HF_ADMITTED_DATASET_ID);
  assert.equal(checked.candidate.record.revision, SO101_HF_ADMITTED_REVISION);
  assert.equal(checked.candidate.record.private, false);
  assert.equal(checked.candidate.record.gated, false);
  assert.equal(checked.candidate.record.publisherLicenseClaim, "Apache-2.0");
  assert.deepEqual(checked.candidate.summary, {
    bytes: 681_635_035, directories: 12, entries: 23,
    excludedVideoBytes: 680_347_338, excludedVideoFiles: 4,
    files: 11, projectionHash: EXPECTED_HASHES.candidateTree,
    selectedBytes: 1_287_697, selectedFiles: 7,
  });
  assert.equal(checked.inventory.inventoryHash, EXPECTED_HASHES.inventory);
  assert.equal(checked.manifest.inventory.fileSha256, EXPECTED_HASHES.inventoryFile);
  assert.equal(checked.sourceRoot, EXPECTED_HASHES.sourceRoot);
  assert.equal(checked.manifest.manifestHash, EXPECTED_HASHES.manifest);
  assert.equal(checked.manifestFileSha256, EXPECTED_HASHES.manifestFile);
  assertPrivateTree(ROOT);
});

test("all 9,766 declared candidates have one exact terminal disposition", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const entries = report.candidateLedger.entries;
  assert.equal(report.artifactHash, EXPECTED_HASHES.artifact);
  assert.equal(report.discovery.candidateRecords, 9_766);
  assert.equal(report.discovery.terminalCandidateRecords, 9_766);
  assert.equal(report.discovery.prioritySignalCandidates, 56);
  assert.equal(report.discovery.declaredScopeExhausted, true);
  assert.equal(report.discovery.globalExhaustion, false);
  assert.equal(report.discovery.sourceUniverseExhausted, false);
  assert.deepEqual(report.discovery.searchAccessCounts, {
    disabled: 0, gatedAuto: 62, gatedManual: 25, private: 0, publicUngated: 9_679,
  });
  assert.deepEqual(report.discovery.countsByDispositionCode, {
    ALREADY_COVERED: 10,
    NOT_PUBLIC_UNGATED: 87,
    ONE_SOURCE_BUDGET_FILLED: 50,
    OUTSIDE_DECLARED_PRIORITY_FILTER: 9_618,
    SELECTED_COMPLETE_NO_VIDEO_REWARD_CLOSURE: 1,
  });
  assert.equal(entries.length, 9_766);
  assert.equal(new Set(entries.map((item) => item.datasetId)).size, 9_766);
  assert.deepEqual(entries.map((item) => item.datasetId),
    [...entries.map((item) => item.datasetId)].sort((left, right) =>
      left.localeCompare(right)));
  assert.equal(entries.every((item) => item.disposition.terminal === true
    && ["ADMITTED", "REJECTED"].includes(item.disposition.status)), true);
  const admitted = entries.filter((item) => item.disposition.status === "ADMITTED");
  assert.equal(admitted.length, 1);
  assert.equal(admitted[0].datasetId, SO101_HF_ADMITTED_DATASET_ID);
  assert.equal(admitted[0].observedRevision, SO101_HF_ADMITTED_REVISION);
  assert.equal(admitted[0].disposition.code,
    "SELECTED_COMPLETE_NO_VIDEO_REWARD_CLOSURE");
  assert.deepEqual(report.discovery.dispositionPolicy.coveredDatasetIdsPresentInSearch, [
    "abdul004/molmoact2-so101-zero-shot-eval",
    "aBochen/so101_HIL_pick_lift_15ep004_reward_classifier",
    "apaszynska/so101-cup-recap-20ep",
    "armnet/armnetbench_v01_lerobot_so101",
    "BrutalCaesar/phi_so101_cubes_cylinder_recovery_v1",
    "nevertmr/so101_coffee_rollouts",
    "NOJIMA21/so101-egg-cracking",
    "NOJIMA21/so101-egg-transport-act-v0",
    "TakuyaHiraoka/so101_pick_diverse_objects_hil_round1",
    "TakuyaHiraoka/so101_pick_diverse_objects_rl_round1",
  ]);
  assert.equal(report.candidateLedger.ledgerHash, EXPECTED_HASHES.candidateLedger);
});

test("the admitted complete no-video closure replays 50 episodes and native reward", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const replay = report.observations.selectedSourceReplay;
  assert.equal(report.selectedSource.datasetId, SO101_HF_ADMITTED_DATASET_ID);
  assert.equal(report.selectedSource.pinnedRevision, SO101_HF_ADMITTED_REVISION);
  assert.equal(report.selectedSource.selectedNoVideoFiles, 7);
  assert.equal(report.selectedSource.selectedNoVideoBytes, 1_287_697);
  assert.equal(report.selectedSource.excludedVideoFiles, 4);
  assert.equal(report.selectedSource.excludedVideoBytes, 680_347_338);
  assert.deepEqual(report.selectedSource.sourceNativePriorityFields, ["next.reward"]);
  assert.deepEqual(report.selectedSource.absentPriorityFields,
    ["is_intervention", "next.done"]);
  assert.equal(report.selectedSource.sourceNativeRewardSemanticsDocumented, false);
  assert.equal(report.denominators.admittedSourceEpisodes.units, 50);
  assert.equal(report.denominators.admittedStateActionFrames.units, 45_273);
  assert.equal(report.denominators.publisherRewardRows.units, 45_273);
  assert.equal(report.denominators.crossPopulationTotal, null);
  assert.equal(report.denominators.additionProhibited, true);
  assert.deepEqual(replay.info, {
    codebaseVersion: "v3.0", episodes: 50,
    featureNames: ["action", "episode_index", "frame_index", "index", "next.reward",
      "observation.images.overhead", "observation.images.top",
      "observation.images.wrist", "observation.state", "task_index", "timestamp"],
    fps: 30, frames: 45_273, isInterventionPresent: false,
    nextDonePresent: false, robotType: "so101_follower", tasks: 1,
  });
  assert.equal(replay.data.rows, 45_273);
  assert.equal(replay.data.actionWidth, 6);
  assert.equal(replay.data.stateWidth, 6);
  assert.equal(replay.data.nullValues, 0);
  assert.equal(replay.data.nonfiniteActionStateRewardValues, 0);
  assert.equal(replay.data.timestampExactRows, 45_273);
  assert.deepEqual(replay.reward, {
    episodesWithAnyNegative: 50, episodesWithAnyPositive: 50,
    episodesWithAnyZero: 50, maximum: 0.012749433517456055,
    minimum: -0.014086723327636719, negativeRows: 19_757,
    positiveRows: 25_466, rows: 45_273, terminalNegativeEpisodes: 0,
    terminalPositiveEpisodes: 0, terminalZeroEpisodes: 50,
    uniqueFloat32BitPatterns: 3_200, zeroRows: 50,
  });
  assert.equal(replay.episodeProfiles.length, 50);
  assert.equal(Math.min(...replay.episodeProfiles.map((item) => item.frames)), 827);
  assert.equal(Math.max(...replay.episodeProfiles.map((item) => item.frames)), 910);
});

test("reward rows remain separate from outcome, recovery, authority, and training", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.truthBoundary.completeDeclaredHfSearchQueryUniverseEstablished, true);
  assert.equal(report.truthBoundary.globalSourceUniverseExhaustionEstablished, false);
  assert.equal(report.truthBoundary.publisherNextRewardFieldEstablished, true);
  assert.equal(report.truthBoundary.nextRewardMeaningIndependentlyAdjudicatedOutcome, false);
  assert.equal(report.truthBoundary.successfulTaskOutcomeEstablished, false);
  assert.equal(report.truthBoundary.failureOutcomeEstablished, false);
  assert.equal(report.truthBoundary.interventionEstablished, false);
  assert.equal(report.truthBoundary.retryOrRecoveryChainEstablished, false);
  assert.equal(report.truthBoundary.completeAttemptCensusEstablished, false);
  assert.equal(report.truthBoundary.delegationOrAuthorityEstablished, false);
  assert.equal(report.segments.opportunityCensus.units, 0);
  assert.equal(report.segments.delegationAuthorization.units, 0);
  assert.equal(report.segments.action.episodeUnits, 50);
  assert.equal(report.segments.action.frameUnits, 45_273);
  assert.equal(report.segments.effect.publisherRewardRows, 45_273);
  assert.equal(report.segments.effect.independentPhysicalEffectUnits, 0);
  assert.equal(report.segments.outcome.independentUnits, 0);
  assert.equal(report.segments.outcome.publisherVerifiedSuccessUnits, 0);
  assert.equal(report.segments.outcome.publisherVerifiedFailureUnits, 0);
  assert.equal(report.segments.recovery.units, 0);
  assert.equal(report.segments.longitudinal.units, 0);
  assert.equal(report.rights.useSpecificLegalClearanceEstablished, false);
  assert.equal(report.rights.productionTrainingAuthorizedByOutsider, false);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.useBoundary.status, "QUARANTINE_EVAL_ONLY");
  assert.equal(report.useBoundary.offlineEvaluationRows, 45_273);
  assert.equal(report.useBoundary.offlineModelFittingRows, 0);
  assert.equal(report.useBoundary.authorizedTrainingRows, 0);
  assert.equal(report.useBoundary.trainingPerformed, false);
  assert.equal(report.network.rawNetworkAdmissionRows, 0);
  assert.equal(report.network.networkAdmissionRows, 0);
  assert.equal(report.economics.CEU, 0);
  assert.equal(report.authority.executionAuthorityUnits, 0);
});

test("report and receipt fully rederive from the private query/source closure", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receiptBytes = readFileSync(RECEIPT);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.receiptHash, EXPECTED_HASHES.receipt);
  assert.equal(receipt.reportFileSha256, EXPECTED_HASHES.reportFile);
  assert.equal(verifySo101HfExhaustionReport(report).ok, true);
  assert.equal(verifySo101HfExhaustionReceipt(receipt, report, reportBytes).ok, true);
  const replay = verifySo101HfExhaustionReportWithSource(report, SOURCE);
  assert.equal(replay.ok, true, replay.error);
  assert.equal(replay.verificationLevel, "FULL_QUERY_AND_SELECTED_SOURCE_REDERIVED");
  const artifact = verifySo101HfExhaustionArtifactDirectory(ROOT);
  assert.equal(artifact.ok, true, artifact.error);
  assert.equal(artifact.reportFileSha256, EXPECTED_HASHES.reportFile);
  assert.equal(artifact.receiptFileSha256, EXPECTED_HASHES.receiptFile);
  assert.equal(artifact.sourceManifestFileSha256, EXPECTED_HASHES.manifestFile);
  assert.equal(artifact.searchCandidateRecords, 9_766);
  assert.equal(artifact.terminalCandidateRecords, 9_766);
  assert.equal(artifact.selectedEpisodes, 50);
  assert.equal(artifact.selectedFrames, 45_273);
  assert.equal(artifact.publisherRewardRows, 45_273);
  assert.equal(artifact.independentOutcomeUnits, 0);
  assert.equal(artifact.recoveryUnits, 0);
  assert.equal(artifact.authorizedTrainingRows, 0);
  assert.equal(artifact.authorityUnits, 0);
});

test("self-resealing cannot manufacture exhaustion, outcome, recovery, or authority", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const mutations = [
    (copy) => { copy.discovery.globalExhaustion = true; },
    (copy) => { copy.discovery.sourceUniverseExhausted = true; },
    (copy) => { copy.discovery.declaredScopeExhausted = false; },
    (copy) => { copy.candidateLedger.entries[0].disposition.terminal = false; },
    (copy) => { copy.denominators.crossPopulationTotal = 9_766; },
    (copy) => { copy.denominators.completeAttemptCensus.established = true; },
    (copy) => { copy.truthBoundary.nextRewardMeaningIndependentlyAdjudicatedOutcome = true; },
    (copy) => { copy.truthBoundary.successfulTaskOutcomeEstablished = true; },
    (copy) => { copy.truthBoundary.failureOutcomeEstablished = true; },
    (copy) => { copy.truthBoundary.interventionEstablished = true; },
    (copy) => { copy.truthBoundary.retryOrRecoveryChainEstablished = true; },
    (copy) => { copy.truthBoundary.completeAttemptCensusEstablished = true; },
    (copy) => { copy.segments.effect.independentPhysicalEffectUnits = 50; },
    (copy) => { copy.segments.outcome.independentUnits = 50; },
    (copy) => { copy.segments.recovery.units = 50; },
    (copy) => { copy.rights.productionTrainingAuthorizedByOutsider = true; },
    (copy) => { copy.privacy.noPiiGuaranteed = true; },
    (copy) => { copy.useBoundary.authorizedTrainingRows = 45_273; },
    (copy) => { copy.network.networkAdmissionRows = 45_273; },
    (copy) => { copy.economics.CEU = 50; },
    (copy) => { copy.authority.executionAuthorityUnits = 50; },
  ];
  for (const mutate of mutations) {
    assert.equal(verifySo101HfExhaustionReport(reseal(report, mutate)).ok, false);
  }
  const fakeSource = reseal(report,
    (copy) => { copy.source.sourceRoot = `sha256:${"0".repeat(64)}`; });
  assert.equal(verifySo101HfExhaustionReport(fakeSource).ok, true);
  assert.equal(verifySo101HfExhaustionReportWithSource(fakeSource, SOURCE).ok, false);
});

test("source tampering, report-byte substitution, and occupied publication fail closed", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-so101-hf-ledger-test-"));
  chmodSync(parent, 0o700);
  try {
    const sourceCopy = path.join(parent, "source");
    cpSync(SOURCE, sourceCopy, { recursive: true, preserveTimestamps: true });
    const readme = path.join(sourceCopy, "candidate", "README.md");
    writeFileSync(readme, Buffer.concat([readFileSync(readme), Buffer.from("tamper\n")]),
      { mode: 0o600 });
    chmodSync(readme, 0o600);
    assert.equal(verifySo101HfExhaustionSource(sourceCopy).ok, false);

    const report = JSON.parse(readFileSync(REPORT));
    const receipt = JSON.parse(readFileSync(RECEIPT));
    const substituted = Buffer.concat([readFileSync(REPORT), Buffer.from(" ")]);
    assert.equal(verifySo101HfExhaustionReceipt(receipt, report, substituted).ok, false);

    const staging = path.join(parent, "staging");
    const occupied = path.join(parent, "occupied");
    mkdirSync(staging, { mode: 0o700 });
    mkdirSync(occupied, { mode: 0o700 });
    writeFileSync(path.join(staging, "marker"), "staging\n", { mode: 0o600 });
    writeFileSync(path.join(occupied, "sentinel"), "preserve\n", { mode: 0o600 });
    assert.throws(() => publishSo101HfExhaustionArtifactDirectory(staging, occupied),
      /PUBLISH_TARGET_EXISTS_OR_BROAD/u);
    assert.equal(readFileSync(path.join(occupied, "sentinel"), "utf8"), "preserve\n");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
