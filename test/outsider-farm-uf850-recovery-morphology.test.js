import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, cpSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  FARM_CURRENT_HEAD_AT_FREEZE,
  FARM_DATASET_ID,
  FARM_REPORT_SCHEMA,
  FARM_REVISION,
  farmDigest,
  publishFarmUf850ArtifactDirectory,
  verifyFarmUf850ArtifactDirectory,
  verifyFarmUf850Receipt,
  verifyFarmUf850Report,
  verifyFarmUf850ReportWithSource,
  verifyFarmUf850SourceDirectory,
} from "../src/outsider-farm-uf850-recovery-morphology.js";

const ROOT = path.resolve(
  "artifacts/outsider-farm-uf850-recovery-morphology-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "report.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");

const EXPECTED_HASHES = Object.freeze({
  artifact: "sha256:0b3bbbc4a4d60c8b531a0f621dcb9cd025abef97f1c9d50dba997cda6c5d3f1f",
  reportFile: "sha256:679dbaa147e4f4f592ce594029ab0443c693f580fb892cf6b982b757f8805cae",
  receipt: "sha256:2095141f019f82ea018aa224d2ce2b8d652e176cb4291cd9cfa7370a5003572e",
  receiptFile: "sha256:8cbc6ec1da37d5f8ae3413386307cd882d4a1394b74e1bcd149afcf7fe7779b7",
  sourceRoot: "sha256:bacde3cf1beb85a867f4bfba3aaa57adb26a1c60b33c6ccaceffecbaaf1aaf28",
  manifest: "sha256:164c5dbcd8b963dcd4c3e62f6f1493ca444946ec6f7a4855e888c79eb0ac5efd",
  manifestFile: "sha256:3e0b4f16e0d36cbd5170fcc69f2982947b09a46b082cf5c787a87a43e5bfa2e2",
  tree: "sha256:8afc43952f9c9de4b6ff2afb85c3c6630b8e04e90b0afc958ebf8357d31f24d9",
  inventory: "sha256:d92ef240886bc445ca8c7a7a3314c720ef0bb94fc38238c103fcad4e36dd7e7c",
});

function reseal(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = farmDigest(changed, `${FARM_REPORT_SCHEMA}/artifact`);
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

test("actual source replays the complete pinned 66-episode no-video closure", () => {
  const checked = verifyFarmUf850SourceDirectory(SOURCE);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel, "FULL_PINNED_NO_VIDEO_SOURCE_REPLAY");
  assert.equal(checked.manifest.datasetId, FARM_DATASET_ID);
  assert.equal(checked.manifest.pinnedRevision, FARM_REVISION);
  assert.equal(checked.manifest.repositoryBefore.private, false);
  assert.equal(checked.manifest.repositoryBefore.gated, false);
  assert.equal(checked.manifest.repositoryBefore.publisherLicenseClaim, "Apache-2.0");
  assert.deepEqual(checked.manifest.repositoryBefore, checked.manifest.repositoryAfter);
  assert.deepEqual(checked.manifest.treeBefore, checked.manifest.treeAfter);
  assert.equal(checked.manifest.treeBefore.entries, 211);
  assert.equal(checked.manifest.treeBefore.files, 204);
  assert.equal(checked.manifest.treeBefore.directories, 7);
  assert.equal(checked.manifest.treeBefore.bytes, 232_558_348);
  assert.equal(checked.manifest.treeBefore.snapshotHash, EXPECTED_HASHES.tree);
  assert.equal(checked.manifest.releaseLineage.corrected66EpisodeRevision, FARM_REVISION);
  assert.equal(checked.manifest.releaseLineage.currentHeadAtFreeze,
    FARM_CURRENT_HEAD_AT_FREEZE);
  assert.equal(checked.manifest.releaseLineage.currentHeadAtFreezeDeclaredEpisodes, 200);
  assert.equal(checked.manifest.releaseLineage.pinIsHistoricalNotCurrent, true);
  assert.equal(checked.manifest.codeRepository.repositoryUrl,
    "https://github.com/NoahWeiss123/CS153");
  assert.equal(checked.manifest.codeRepository.httpStatus, 404);
  assert.equal(checked.manifest.codeRepository.availableAtFreeze, false);
  assert.equal(checked.manifest.sourceSupportObjects.length, 7);
  assert.equal(checked.manifest.selectedObjects.length, 72);
  assert.equal(checked.manifest.selectedObjects.filter((item) => item.lfsSha256 !== null).length,
    66);
  assert.equal(checked.manifest.selectedObjects.some((item) => item.remotePath.endsWith(".mp4")),
    false);
  assert.deepEqual(checked.inventory.counts, {
    entries: 211,
    files: 204,
    directories: 7,
    repositoryBytes: 232_558_348,
    parquetFiles: 66,
    parquetBytes: 2_978_478,
    excludedVideoFiles: 132,
    excludedVideoBytes: 229_556_112,
    selectedNoVideoFiles: 72,
    selectedNoVideoBytes: 3_002_236,
  });
  assert.equal(checked.inventory.inventoryHash, EXPECTED_HASHES.inventory);
  assert.equal(checked.sourceRoot, EXPECTED_HASHES.sourceRoot);
  assert.equal(checked.manifest.manifestHash, EXPECTED_HASHES.manifest);
  assert.equal(checked.manifestFileSha256, EXPECTED_HASHES.manifestFile);
  assert.equal(checked.manifest.selection.fullVideoContentDownloaded, false);
  assert.equal(checked.manifest.rights.productionTrainingAuthorizedByOutsider, false);
  assertPrivateTree(ROOT);
});

test("full Parquet replay preserves 66 episodes, 25,803 frames, 17 tasks, and nine text morphologies", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.artifactHash, EXPECTED_HASHES.artifact);
  assert.equal(report.denominators.keptRealRobotEpisodes.units, 66);
  assert.equal(report.denominators.keptRealRobotEpisodes.unit, "KEPT_REAL_ROBOT_EPISODE");
  assert.equal(report.denominators.keptRealRobotEpisodes.frames, 25_803);
  assert.equal(report.denominators.publisherTaskTextRecoveryMorphology.units, 9);
  assert.equal(report.denominators.publisherExcludedEarlyDemosClaim.units, 41);
  assert.equal(report.denominators.publisherExcludedEarlyDemosClaim.contentPresent, false);
  assert.equal(report.denominators.publisherExcludedEarlyDemosClaim.countedAsEpisodes, false);
  assert.equal(report.denominators.publisherExcludedEarlyDemosClaim.countedAsAttempts, false);
  assert.equal(report.denominators.completeAttemptCensus.established, false);
  assert.equal(report.denominators.crossPopulationTotal, null);
  assert.equal(report.denominators.additionProhibited, true);
  assert.equal(report.observations.parquetReplay.files, 66);
  assert.equal(report.observations.parquetReplay.frames, 25_803);
  assert.equal(report.observations.parquetReplay.nullValues, 0);
  assert.equal(report.observations.parquetReplay.nonfiniteValues, 0);
  assert.equal(report.observations.parquetReplay.timestampExactRows, 25_803);
  assert.equal(report.observations.parquetReplay.actionToNextStateExactTransitions, 25_737);
  assert.equal(report.observations.parquetReplay.finalActionRepeatsStateEpisodes, 66);
  assert.equal(report.observations.parquetReplay.declaredStateAndActionDtype, "float32");
  assert.equal(report.observations.parquetReplay.physicalParquetStateElementType, "double");
  assert.equal(report.observations.parquetReplay.declaredVsPhysicalElementTypeMismatchRecorded,
    true);
  assert.deepEqual(report.observations.taskProfiles.map((item) => item.episodes),
    [4, 3, 1, 1, 30, 1, 1, 2, 5, 1, 3, 1, 1, 1, 5, 3, 3]);
  assert.deepEqual(report.observations.publisherRecoveryMorphology.taskIndexes,
    [2, 7, 9, 10, 11, 13]);
  assert.equal(report.observations.publisherRecoveryMorphology.episodeIndexes.length, 9);
});

test("truth boundary keeps publisher morphology separate from physical outcome and census", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.truthBoundary.completeReleased66EpisodeStateActionClosureEstablished, true);
  assert.equal(report.truthBoundary.withinEpisodePublisherRecoveryMorphologyEstablished, true);
  assert.equal(report.truthBoundary.physicalObjectDropOrFallEstablished, false);
  assert.equal(report.truthBoundary.physicalRecoveryExecutionEstablished, false);
  assert.equal(report.truthBoundary.successfulTaskOutcomeEstablished, false);
  assert.equal(report.truthBoundary.independentWitnessEstablished, false);
  assert.equal(report.truthBoundary.completeAttemptCensusEstablished, false);
  assert.equal(report.truthBoundary.excluded41PromotedToEpisodesOrAttempts, false);
  assert.equal(report.segments.action.episodeUnits, 66);
  assert.equal(report.segments.action.frameUnits, 25_803);
  assert.equal(report.segments.effect.independentObjectStateUnits, 0);
  assert.equal(report.segments.outcome.independentUnits, 0);
  assert.equal(report.segments.outcome.verifiedTaskSuccessUnits, 0);
  assert.equal(report.segments.recovery.publisherWithinEpisodeMorphologyUnits, 9);
  assert.equal(report.segments.recovery.physicallyObservedUnits, 0);
  assert.equal(report.segments.recovery.independentlyVerifiedEffectUnits, 0);
  assert.equal(report.useBoundary.status, "QUARANTINE_EVAL_ONLY");
  assert.equal(report.useBoundary.authorizedTrainingRows, 0);
  assert.equal(report.useBoundary.trainingPerformed, false);
  assert.equal(report.network.networkAdmissionRows, 0);
  assert.equal(report.economics.CEU, 0);
  assert.equal(report.authority.executionAuthorityUnits, 0);
});

test("report and receipt fully rederive from the private pinned source", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receiptBytes = readFileSync(RECEIPT);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.receiptHash, EXPECTED_HASHES.receipt);
  assert.equal(receipt.reportFileSha256, EXPECTED_HASHES.reportFile);
  assert.equal(verifyFarmUf850Report(report).ok, true);
  assert.equal(verifyFarmUf850Receipt(receipt, report, reportBytes).ok, true);
  const replay = verifyFarmUf850ReportWithSource(report, SOURCE);
  assert.equal(replay.ok, true, replay.error);
  assert.equal(replay.verificationLevel, "FULL_PINNED_NO_VIDEO_SOURCE_REDERIVED");
  const artifact = verifyFarmUf850ArtifactDirectory(ROOT);
  assert.equal(artifact.ok, true, artifact.error);
  assert.equal(artifact.reportFileSha256, EXPECTED_HASHES.reportFile);
  assert.equal(artifact.receiptFileSha256, EXPECTED_HASHES.receiptFile);
  assert.equal(artifact.keptRealRobotEpisodeUnits, 66);
  assert.equal(artifact.publisherRecoveryMorphologyUnits, 9);
  assert.equal(artifact.independentOutcomeUnits, 0);
  assert.equal(artifact.verifiedRecoveryEffectUnits, 0);
  assert.equal(artifact.authorizedTrainingRows, 0);
  assert.equal(artifact.authorityUnits, 0);
});

test("self-resealing cannot manufacture outcome, recovery, census, training, or authority", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const mutations = [
    (copy) => { copy.denominators.crossPopulationTotal = 107; },
    (copy) => { copy.denominators.publisherExcludedEarlyDemosClaim.countedAsAttempts = true; },
    (copy) => { copy.denominators.completeAttemptCensus.established = true; },
    (copy) => { copy.truthBoundary.physicalObjectDropOrFallEstablished = true; },
    (copy) => { copy.truthBoundary.physicalRecoveryExecutionEstablished = true; },
    (copy) => { copy.truthBoundary.successfulTaskOutcomeEstablished = true; },
    (copy) => { copy.truthBoundary.independentWitnessEstablished = true; },
    (copy) => { copy.truthBoundary.completeAttemptCensusEstablished = true; },
    (copy) => { copy.segments.effect.independentObjectStateUnits = 9; },
    (copy) => { copy.segments.outcome.independentUnits = 9; },
    (copy) => { copy.segments.recovery.independentlyVerifiedEffectUnits = 9; },
    (copy) => { copy.rights.productionTrainingAuthorizedByOutsider = true; },
    (copy) => { copy.privacy.noPiiGuaranteed = true; },
    (copy) => { copy.useBoundary.authorizedTrainingRows = 25_803; },
    (copy) => { copy.network.networkAdmissionRows = 25_803; },
    (copy) => { copy.economics.CEU = 9; },
    (copy) => { copy.authority.executionAuthorityUnits = 66; },
  ];
  for (const mutate of mutations) {
    assert.equal(verifyFarmUf850Report(reseal(report, mutate)).ok, false);
  }
  const fakeSource = reseal(report,
    (copy) => { copy.source.sourceRoot = `sha256:${"0".repeat(64)}`; });
  assert.equal(verifyFarmUf850Report(fakeSource).ok, true);
  assert.equal(verifyFarmUf850ReportWithSource(fakeSource, SOURCE).ok, false);
});

test("source tampering and receipt/report byte substitution fail closed", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-farm-source-test-"));
  chmodSync(parent, 0o700);
  const copy = path.join(parent, "source");
  cpSync(SOURCE, copy, { recursive: true, preserveTimestamps: true });
  const readme = path.join(copy, "README.md");
  writeFileSync(readme, Buffer.concat([readFileSync(readme), Buffer.from("tamper\n")]),
    { mode: 0o600 });
  chmodSync(readme, 0o600);
  assert.equal(verifyFarmUf850SourceDirectory(copy).ok, false);
  const report = JSON.parse(readFileSync(REPORT));
  const receipt = JSON.parse(readFileSync(RECEIPT));
  const substituted = Buffer.concat([readFileSync(REPORT), Buffer.from(" ")]);
  assert.equal(verifyFarmUf850Receipt(receipt, report, substituted).ok, false);
  rmSync(parent, { recursive: true, force: true });
});

test("artifact publication refuses an occupied target without clobbering it", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-farm-publish-test-"));
  chmodSync(parent, 0o700);
  const staging = path.join(parent, "staging");
  const occupied = path.join(parent, "occupied");
  mkdirSync(staging, { mode: 0o700 });
  mkdirSync(occupied, { mode: 0o700 });
  writeFileSync(path.join(staging, "marker"), "staging\n", { mode: 0o600 });
  writeFileSync(path.join(occupied, "sentinel"), "preserve\n", { mode: 0o600 });
  assert.throws(() => publishFarmUf850ArtifactDirectory(staging, occupied),
    /PUBLISH_TARGET_EXISTS_OR_BROAD/u);
  assert.equal(readFileSync(path.join(occupied, "sentinel"), "utf8"), "preserve\n");
  rmSync(parent, { recursive: true, force: true });
});
