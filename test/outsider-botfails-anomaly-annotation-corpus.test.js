import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  BOTFAILS_DATASET_ID,
  BOTFAILS_GITHUB_REPOSITORY,
  BOTFAILS_GITHUB_REVISION,
  BOTFAILS_REPORT_SCHEMA,
  BOTFAILS_REVISION,
  botFailsDigest,
  publishBotFailsArtifactDirectory,
  verifyBotFailsArtifactDirectory,
  verifyBotFailsReceipt,
  verifyBotFailsReport,
  verifyBotFailsReportWithSource,
  verifyBotFailsSourceDirectory,
} from "../src/outsider-botfails-anomaly-annotation-corpus.js";

const ROOT = path.resolve(
  "artifacts/outsider-botfails-anomaly-annotation-corpus-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "report.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");

const EXPECTED_HASHES = Object.freeze({
  artifact: "sha256:afa3dcc88446ad97956b486b3d9a8154f0de3e78faaa414821ae1a9c5f9b629a",
  reportFile: "sha256:8bc0263fec1aa393c004c7e5b4470895c0a244a783e9b896541e4ddda57149f4",
  receipt: "sha256:fdaff7efbe6691c857e16de0b1a1891ffa980e4d6d788dff2cdb8968f5c948e5",
  receiptFile: "sha256:ffbf62b06049bf9e26765b1851ef1224b38f00a3441df965e461fe4a50ba3f14",
  sourceRoot: "sha256:396f8570fb059777e3f25c58c4e003a3ad0eacfd9a279bbcaa7331f3f0f81acf",
  manifest: "sha256:6406690757f89b7a24f0bfd3527604c9a8b11428ef694674f98495f7512cfe4f",
  manifestFile: "sha256:1d5395e7cdef0986d40151c63a846cc053e69dff2a556d9902b5fe84940250d3",
  hfTree: "sha256:dd4ee5fc6ff6c3ed039397f4a2dc414b878ecb637997ef65aa085d8f49745611",
  githubTree: "sha256:bba65c7531142b96bc5c84f912290dffc2738e646b827193a891c8e097aca219",
  inventory: "sha256:51b4157fca4f918bd51a82b783badd183fee496ef044a12194196a6f04f373ee",
});

function reseal(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = botFailsDigest(changed, `${BOTFAILS_REPORT_SCHEMA}/artifact`);
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

test("official HF, project, and GitHub snapshots bracket the complete BotFails trees", () => {
  const checked = verifyBotFailsSourceDirectory(SOURCE);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel, "FULL_SELECTED_SOURCE_REPLAY");
  assert.equal(checked.manifest.datasetId, BOTFAILS_DATASET_ID);
  assert.equal(checked.manifest.pinnedRevision, BOTFAILS_REVISION);
  assert.deepEqual(checked.manifest.repositoryBefore, checked.manifest.repositoryAfter);
  assert.deepEqual(checked.manifest.commitHistoryBefore, checked.manifest.commitHistoryAfter);
  assert.deepEqual(checked.manifest.hfTreeBefore, checked.manifest.hfTreeAfter);
  assert.equal(checked.manifest.repositoryBefore.private, false);
  assert.equal(checked.manifest.repositoryBefore.gated, false);
  assert.equal(checked.manifest.repositoryBefore.publisherLicenseClaim, "Apache-2.0");
  assert.equal(checked.manifest.repositoryBefore.siblingCount, 1_195);
  assert.deepEqual(checked.manifest.hfTreeBefore, {
    bytes: 9_172_439_329, directories: 174, entries: 1_369, files: 1_195,
    snapshotHash: EXPECTED_HASHES.hfTree,
  });
  assert.deepEqual(checked.manifest.githubRepositoryBefore,
    checked.manifest.githubRepositoryAfter);
  assert.deepEqual(checked.manifest.githubHeadBefore, checked.manifest.githubHeadAfter);
  assert.deepEqual(checked.manifest.githubTreeBefore, checked.manifest.githubTreeAfter);
  assert.equal(checked.manifest.githubRepositoryBefore.repository,
    BOTFAILS_GITHUB_REPOSITORY);
  assert.equal(checked.manifest.githubRepositoryBefore.declaredLicense, null);
  assert.equal(checked.manifest.githubHeadBefore.revision, BOTFAILS_GITHUB_REVISION);
  assert.deepEqual(checked.manifest.githubTreeBefore, {
    blobs: 318, bytes: 14_993_875, entries: 354, labelCsvBlobs: 181,
    licensePaths: [], snapshotHash: EXPECTED_HASHES.githubTree, trees: 36,
  });
  assert.equal(checked.manifest.projectPageBefore.datasetUrl,
    "https://huggingface.co/datasets/kantine/BotFails");
  assert.equal(checked.manifest.projectPageBefore.codeUrl,
    "https://github.com/CEA-LIST/FIDeL");
  assert.equal(checked.manifest.sourceSupportObjects.length, 16);
  assert.equal(checked.manifest.selectedObjects.length, 256);
  assert.equal(checked.manifest.selectedObjects.filter((item) => item.lfsSha256 !== null).length,
    30);
  assert.equal(checked.manifest.selectedObjects.some((item) => item.remotePath.endsWith(".mp4")),
    false);
  assert.equal(checked.inventory.crossRepositoryLabelBindings.length, 144);
  assert.equal(checked.inventory.excludedUnselectedParquetObjects.length, 293);
  assert.equal(checked.inventory.inventoryHash, EXPECTED_HASHES.inventory);
  assert.equal(checked.sourceRoot, EXPECTED_HASHES.sourceRoot);
  assert.equal(checked.manifest.manifestHash, EXPECTED_HASHES.manifest);
  assert.equal(checked.manifestFileSha256, EXPECTED_HASHES.manifestFile);
  assert.equal(checked.manifest.selection.completePublisherLabelFileUniverseDownloaded, true);
  assert.equal(checked.manifest.selection.completeSplitMetadataDownloaded, true);
  assert.equal(checked.manifest.selection.fullVideoContentDownloaded, false);
  assert.equal(checked.manifest.rights.productionTrainingAuthorizedByOutsider, false);
  assertPrivateTree(ROOT);
});

test("all published annotations and metadata replay with both coverage defects preserved", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.artifactHash, EXPECTED_HASHES.artifact);
  assert.equal(report.denominators.completeRepositoryTree.units, 1_369);
  assert.equal(report.denominators.publisherTestMembershipEpisodes.units, 145);
  assert.equal(report.denominators.publisherTestMembershipEpisodes.frameRows, 182_070);
  assert.equal(report.denominators.publisherNormalTrainMembershipEpisodes.units, 178);
  assert.equal(report.denominators.publisherNormalTrainMembershipEpisodes.frameRows, 232_289);
  assert.equal(report.denominators.publisherBinaryLabelFiles.units, 144);
  assert.equal(report.denominators.publisherBinaryLabelFiles.frameLabelRows, 180_875);
  assert.equal(report.denominators.crossPopulationTotal, null);
  assert.equal(report.denominators.additionProhibited, true);
  assert.deepEqual(report.observations.metadataReplay.totals, {
    episodes: 323, frames: 414_359, normalTrainEpisodes: 178,
    normalTrainFrames: 232_289, testEpisodes: 145, testFrames: 182_070,
    videos: 646,
  });
  assert.deepEqual(report.observations.binaryLabelReplay.totals, {
    allOneEpisodes: 1, allZeroEpisodes: 36, episodesWithAnyOne: 108,
    files: 144, labelLengthDeltaRows: -1, lengthMismatchEpisodes: 1,
    metadataFrameRowsForLabeledEpisodes: 180_876, oneRows: 60_210,
    positiveRuns: 129, rows: 180_875, valueTransitions: 159,
    zeroRows: 120_665,
  });
  assert.deepEqual(report.coverage.missingLabelEpisodeKeys,
    ["domotic_setTheTable/episode_000007"]);
  assert.deepEqual(report.coverage.labelLengthMismatches, [{
    episodeKey: "industrial_screws_sorting/episode_000007",
    labelLengthDeltaRows: -1, labelRows: 1_491, metadataFrames: 1_492,
  }]);
  assert.equal(report.coverage.completeTestEpisodeLabelCoverage, false);
  assert.deepEqual(report.observations.binaryLabelReplay.taskProfiles.map((item) =>
    [item.labelFiles, item.rows, item.oneRows]), [
    [15, 31_349, 9_270], [10, 17_916, 3_405], [15, 15_677, 3_838],
    [20, 17_920, 7_288], [14, 16_658, 5_230], [20, 23_881, 7_603],
    [10, 8_960, 3_445], [15, 20_149, 6_276], [10, 14_925, 9_719],
    [15, 13_440, 4_136],
  ]);
});

test("the bounded no-video screws group is complete state/action telemetry, not outcomes", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const selected = report.observations.selectedSameTaskParquetReplay;
  assert.equal(report.denominators.selectedSameTaskTelemetryEpisodes.units, 30);
  assert.equal(report.denominators.selectedSameTaskTelemetryEpisodes.task,
    "industrial_screws_sorting");
  assert.equal(selected.episodeProfiles.length, 30);
  assert.deepEqual(selected.totals, {
    episodes: 30, frames: 44_785, nonfiniteValues: 0,
    normalTrainEpisodes: 20, normalTrainFrames: 29_859, nullValues: 0,
    testEpisodes: 10, testFrames: 14_926, timestampExactRows: 44_785,
  });
  assert.equal(selected.schemaProfiles.length, 1);
  assert.equal(selected.schemaProfiles[0].files, 30);
  assert.match(selected.schemaProfiles[0].schema, /action: fixed_size_list<element: float>\[6\]/u);
  assert.equal(selected.actionWidth, 6);
  assert.equal(selected.observationStateWidth, 6);
  assert.equal(report.denominators.excludedVideos.units, 646);
  assert.equal(report.denominators.excludedVideos.bytes, 9_150_824_572);
  assert.equal(report.denominators.excludedVideos.contentReplayed, false);
});

test("publisher detection targets remain separate from outcome, recovery, and authority", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.truthBoundary.publisherBinaryAnomalyLabelsEstablished, true);
  assert.equal(report.truthBoundary.publisherSplitMembershipEstablished, true);
  assert.equal(report.truthBoundary.labelOneMeansIndependentTaskFailure, false);
  assert.equal(report.truthBoundary.normalTrainMeansIndependentlyVerifiedSuccess, false);
  assert.equal(report.truthBoundary.independentPhysicalOutcomeEstablished, false);
  assert.equal(report.truthBoundary.recoveryChainEstablished, false);
  assert.equal(report.truthBoundary.completeAttemptCensusEstablished, false);
  assert.equal(report.truthBoundary.delegationOrAuthorityEstablished, false);
  assert.equal(report.segments.action.episodeUnits, 30);
  assert.equal(report.segments.action.frameUnits, 44_785);
  assert.equal(report.segments.effect.publisherBinaryAnomalyFrameRows, 180_875);
  assert.equal(report.segments.effect.independentPhysicalEffectUnits, 0);
  assert.equal(report.segments.outcome.publisherAnomalyLabelEpisodeUnits, 108);
  assert.equal(report.segments.outcome.independentUnits, 0);
  assert.equal(report.segments.outcome.verifiedTaskSuccessUnits, 0);
  assert.equal(report.segments.recovery.units, 0);
  assert.equal(report.segments.longitudinal.units, 0);
  assert.equal(report.useBoundary.status, "QUARANTINE_EVAL_ONLY");
  assert.equal(report.useBoundary.offlineEvaluationLabelRows, 180_875);
  assert.equal(report.useBoundary.offlineModelFittingRows, 0);
  assert.equal(report.useBoundary.authorizedTrainingRows, 0);
  assert.equal(report.useBoundary.trainingPerformed, false);
  assert.equal(report.network.networkAdmissionRows, 0);
  assert.equal(report.economics.CEU, 0);
  assert.equal(report.authority.executionAuthorityUnits, 0);
});

test("report and receipt fully rederive from the selected private source", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receiptBytes = readFileSync(RECEIPT);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.receiptHash, EXPECTED_HASHES.receipt);
  assert.equal(receipt.reportFileSha256, EXPECTED_HASHES.reportFile);
  assert.equal(verifyBotFailsReport(report).ok, true);
  assert.equal(verifyBotFailsReceipt(receipt, report, reportBytes).ok, true);
  const replay = verifyBotFailsReportWithSource(report, SOURCE);
  assert.equal(replay.ok, true, replay.error);
  assert.equal(replay.verificationLevel, "FULL_SELECTED_SOURCE_REDERIVED");
  const artifact = verifyBotFailsArtifactDirectory(ROOT);
  assert.equal(artifact.ok, true, artifact.error);
  assert.equal(artifact.reportFileSha256, EXPECTED_HASHES.reportFile);
  assert.equal(artifact.receiptFileSha256, EXPECTED_HASHES.receiptFile);
  assert.equal(artifact.publisherLabelFiles, 144);
  assert.equal(artifact.publisherLabelRows, 180_875);
  assert.equal(artifact.selectedTelemetryEpisodes, 30);
  assert.equal(artifact.independentOutcomeUnits, 0);
  assert.equal(artifact.recoveryUnits, 0);
  assert.equal(artifact.authorizedTrainingRows, 0);
  assert.equal(artifact.authorityUnits, 0);
});

test("self-resealing cannot manufacture failure, success, recovery, census, or training", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const mutations = [
    (copy) => { copy.denominators.crossPopulationTotal = 323; },
    (copy) => { copy.denominators.completeAttemptCensus.established = true; },
    (copy) => { copy.coverage.completeTestEpisodeLabelCoverage = true; },
    (copy) => { copy.truthBoundary.labelOneMeansIndependentTaskFailure = true; },
    (copy) => { copy.truthBoundary.normalTrainMeansIndependentlyVerifiedSuccess = true; },
    (copy) => { copy.truthBoundary.independentPhysicalOutcomeEstablished = true; },
    (copy) => { copy.truthBoundary.recoveryChainEstablished = true; },
    (copy) => { copy.truthBoundary.completeAttemptCensusEstablished = true; },
    (copy) => { copy.segments.effect.independentPhysicalEffectUnits = 108; },
    (copy) => { copy.segments.outcome.independentUnits = 108; },
    (copy) => { copy.segments.outcome.verifiedTaskSuccessUnits = 178; },
    (copy) => { copy.segments.recovery.units = 108; },
    (copy) => { copy.rights.productionTrainingAuthorizedByOutsider = true; },
    (copy) => { copy.privacy.noPiiGuaranteed = true; },
    (copy) => { copy.useBoundary.authorizedTrainingRows = 180_875; },
    (copy) => { copy.network.networkAdmissionRows = 180_875; },
    (copy) => { copy.economics.CEU = 108; },
    (copy) => { copy.authority.executionAuthorityUnits = 323; },
  ];
  for (const mutate of mutations) {
    assert.equal(verifyBotFailsReport(reseal(report, mutate)).ok, false);
  }
  const fakeSource = reseal(report,
    (copy) => { copy.source.sourceRoot = `sha256:${"0".repeat(64)}`; });
  assert.equal(verifyBotFailsReport(fakeSource).ok, true);
  assert.equal(verifyBotFailsReportWithSource(fakeSource, SOURCE).ok, false);
});

test("source tampering, byte substitution, and occupied publication fail closed", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-botfails-test-"));
  chmodSync(parent, 0o700);
  try {
    const copy = path.join(parent, "source");
    cpSync(SOURCE, copy, { recursive: true, preserveTimestamps: true });
    const label = path.join(copy, "BotFails", "labels", "industrial_screws_sorting_anomaly",
      "episode_000007_labels.csv");
    writeFileSync(label, Buffer.concat([readFileSync(label), Buffer.from("0\n")]),
      { mode: 0o600 });
    chmodSync(label, 0o600);
    assert.equal(verifyBotFailsSourceDirectory(copy).ok, false);

    const report = JSON.parse(readFileSync(REPORT));
    const receipt = JSON.parse(readFileSync(RECEIPT));
    const substituted = Buffer.concat([readFileSync(REPORT), Buffer.from(" ")]);
    assert.equal(verifyBotFailsReceipt(receipt, report, substituted).ok, false);

    const staging = path.join(parent, "staging");
    const occupied = path.join(parent, "occupied");
    mkdirSync(staging, { mode: 0o700 });
    mkdirSync(occupied, { mode: 0o700 });
    writeFileSync(path.join(staging, "marker"), "staging\n", { mode: 0o600 });
    writeFileSync(path.join(occupied, "sentinel"), "preserve\n", { mode: 0o600 });
    assert.throws(() => publishBotFailsArtifactDirectory(staging, occupied),
      /PUBLISH_TARGET_EXISTS_OR_BROAD/u);
    assert.equal(readFileSync(path.join(occupied, "sentinel"), "utf8"), "preserve\n");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});
