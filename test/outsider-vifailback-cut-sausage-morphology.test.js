import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  VIFAILBACK_DATASET_ID,
  VIFAILBACK_REPORT_SCHEMA,
  VIFAILBACK_REVISION,
  VIFAILBACK_SUBTREE,
  publishVifailbackCutSausageArtifactDirectory,
  verifyVifailbackCutSausageArtifactDirectory,
  verifyVifailbackCutSausageReceipt,
  verifyVifailbackCutSausageReport,
  verifyVifailbackCutSausageReportWithSource,
  verifyVifailbackCutSausageSourceDirectory,
  vifailbackDigest,
} from "../src/outsider-vifailback-cut-sausage-morphology.js";

const ROOT = path.resolve(
  "artifacts/outsider-vifailback-cut-sausage-morphology-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "report.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function reseal(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = vifailbackDigest(changed, `${VIFAILBACK_REPORT_SCHEMA}/artifact`);
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

test("actual source replays the seven-page subtree bracket and all 598 no-video objects", () => {
  const checked = verifyVifailbackCutSausageSourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_BOUNDED_SOURCE_REPLAY");
  const { manifest, inventory } = checked;
  assert.equal(manifest.datasetId, VIFAILBACK_DATASET_ID);
  assert.equal(manifest.pinnedRevision, VIFAILBACK_REVISION);
  assert.equal(manifest.subtree.path, VIFAILBACK_SUBTREE);
  assert.equal(manifest.repositoryBefore.private, false);
  assert.equal(manifest.repositoryBefore.gated, false);
  assert.equal(manifest.repositoryBefore.publisherLicenseClaim, "MIT");
  assert.deepEqual(manifest.treeBefore, manifest.treeAfter);
  assert.equal(manifest.treeBefore.pages, 7);
  assert.equal(manifest.treeBefore.entryCount, 666);
  assert.equal(manifest.treeBefore.snapshotHash,
    "sha256:1e923bb66677c301a700f59685b5883a6be24bbbb982efa7edfd4b53a7356584");
  assert.equal(manifest.manifestHash,
    "sha256:7119d0d3940f35e07584f300b082a612136c3d060bd1ee758239b7d51c827151");
  assert.equal(checked.manifestFileSha256,
    "sha256:947ca71ee932f1f4f8d207a43e819dede865cd4a5349c5762471986a550c0fcd");
  assert.equal(checked.sourceRoot,
    "sha256:60dd6415b72665ed8b9ff2be0371ed73c797a4604d73c1b24a622c428f4cb0a0");
  assert.equal(manifest.subtree.inventoryHash,
    "sha256:54a07fa8b3413de66ebe37622744bf5b78a80868b402e2764a6432dd885617f7");
  assert.equal(manifest.subtree.inventoryFileSha256,
    "sha256:28a661961b92adba8b44f1272deb4efd9ac711c08a51afcefa297ad2c67f8a9c");
  assert.equal(manifest.sourceSupportObjects.length, 16);
  assert.equal(manifest.selectedObjects.length, 598);
  assert.equal(manifest.selectedObjects.filter((item) => item.remotePath.endsWith(".jpg")).length,
    597);
  assert.equal(manifest.selectedObjects.some((item) => item.remotePath.endsWith(".mp4")), false);
  assert.deepEqual(inventory.counts, {
    entries: 666,
    files: 631,
    directories: 35,
    annotationJsonFiles: 1,
    jpegFiles: 597,
    excludedMp4Files: 33,
    selectedNoVideoFiles: 598,
    selectedNoVideoBytes: 42016007,
    excludedVideoBytes: 157431339,
  });
  assert.equal(inventory.excludedVideoObjects.length, 33);
  assert.equal(manifest.selection.fullVideoContentDownloaded, false);
  assert.equal(manifest.selection.rawTrajectoryContentDownloaded, false);
  assert.equal(manifest.selection.completeSelectedNoVideoClosureReplayed, true);
  assert.equal(manifest.rights.publisherLicenseClaim, "MIT");
  assert.equal(manifest.rights.productionTrainingAuthorizedByOutsider, false);
  assert.equal(manifest.privacy.noPiiGuaranteed, false);
  assertPrivateTree(ROOT);
});

test("annotation replay preserves 31 failures, two no-failure cases, and morphology-only recovery", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.artifactHash,
    "sha256:70112a6dfeccf4e011941ad4fb177caaa3dbbcca712e5bf165e1dad1f1f9a73e");
  assert.equal(report.denominators.completeSubtreeInventory.units, 666);
  assert.equal(report.denominators.selectedNoVideoClosure.units, 598);
  assert.equal(report.denominators.selectedNoVideoClosure.bytes, 42016007);
  assert.equal(report.denominators.publisherAnnotationEpisodes.units, 33);
  assert.equal(report.denominators.publisherAnnotationEpisodes.publisherFailureDetectedUnits, 31);
  assert.equal(report.denominators.publisherAnnotationEpisodes.publisherNoFailureDetectedUnits, 2);
  assert.equal(report.denominators.publisherFailureCorrectionMorphologies.units, 31);
  assert.equal(report.denominators.excludedVideos.units, 33);
  assert.equal(report.denominators.excludedVideos.contentReplayed, false);
  assert.equal(report.denominators.crossTotal, null);
  assert.deepEqual(report.observations.annotation.failureTypes,
    { "gripper 6d-pose": 27, "gripper state": 4 });
  assert.deepEqual(report.observations.annotation.failureSubtasks,
    { "1": 16, "3": 13, "4": 2 });
  assert.equal(report.observations.annotation.keyframePairs, 31);
  assert.equal(report.observations.annotation.lowLevelAvoidanceInstructions, 31);
  assert.equal(report.observations.annotation.lowLevelCorrectionInstructions, 31);
  assert.equal(report.observations.annotation.uniqueReferencedJpegs, 595);
  assert.equal(report.observations.annotation.unreferencedSelectedJpegs, 2);
  assert.equal(report.observations.exactPinnedJpegBytesReplayed, 597);
  assert.deepEqual(report.observations.jpegProfiles, [{ count: 597,
    profile: { components: 3, height: 480, precisionBits: 8,
      sofMarker: 192, width: 640 } }]);
  assert.equal(report.truthBoundary.publisherCorrectionMorphologyEstablished, true);
  assert.equal(report.truthBoundary.rawActionOrRobotStateTrajectoryEstablished, false);
  assert.equal(report.truthBoundary.physicalEffectEstablished, false);
  assert.equal(report.truthBoundary.independentOutcomeEstablished, false);
  assert.equal(report.truthBoundary.correctionExecutionEstablished, false);
  assert.equal(report.truthBoundary.completeRecoveryEffectEstablished, false);
  assert.equal(report.segments.outcome.publisherFailureAnnotationUnits, 31);
  assert.equal(report.segments.outcome.independentUnits, 0);
  assert.equal(report.segments.recovery.publisherCorrectionMorphologyUnits, 31);
  assert.equal(report.segments.recovery.executableRecoverySuffixUnits, 0);
  assert.equal(report.segments.recovery.verifiedRecoveryEffectUnits, 0);
  assert.equal(report.useBoundary.status, "QUARANTINE_EVAL_ONLY");
});

test("report and receipt fully rederive from the private bounded source", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receipt = JSON.parse(readFileSync(RECEIPT));
  assert.equal(receipt.receiptHash,
    "sha256:96b4cbbf7cb744787a1aff34d05e0760dda86226849346bd86bd269a9e8165b4");
  assert.equal(receipt.reportFileSha256,
    "sha256:bfe35d65ba0100612c98680fd0b80eea5b58b3dc4a9cde752c1e548b67f99dae");
  assert.equal(verifyVifailbackCutSausageReport(report).ok, true);
  assert.equal(verifyVifailbackCutSausageReceipt(receipt, report, reportBytes).ok, true);
  const replay = verifyVifailbackCutSausageReportWithSource(report, SOURCE);
  assert.equal(replay.ok, true);
  assert.equal(replay.verificationLevel, "FULL_BOUNDED_SOURCE_REDERIVED");
  const artifact = verifyVifailbackCutSausageArtifactDirectory(ROOT);
  assert.equal(artifact.ok, true);
  assert.equal(artifact.verificationLevel, "FULL_BOUNDED_SOURCE_REDERIVED");
  assert.equal(artifact.independentOutcomeUnits, 0);
  assert.equal(artifact.verifiedRecoveryEffectUnits, 0);
  assert.equal(artifact.governedTrainingRows, 0);
  assert.equal(artifact.networkAdmissionRows, 0);
  assert.equal(artifact.authorityUnits, 0);
});

test("self-resealing cannot manufacture trajectory, outcome, recovery, privacy, or authority", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const mutations = [
    (copy) => { copy.source.fullVideoContentDownloaded = true; },
    (copy) => { copy.source.rawTrajectoryContentDownloaded = true; },
    (copy) => { copy.denominators.crossTotal = 1297; },
    (copy) => { copy.truthBoundary.prospectiveAttemptCensusEstablished = true; },
    (copy) => { copy.truthBoundary.rawActionOrRobotStateTrajectoryEstablished = true; },
    (copy) => { copy.truthBoundary.physicalEffectEstablished = true; },
    (copy) => { copy.truthBoundary.independentOutcomeEstablished = true; },
    (copy) => { copy.truthBoundary.correctionExecutionEstablished = true; },
    (copy) => { copy.truthBoundary.completeRecoveryEffectEstablished = true; },
    (copy) => { copy.segments.outcome.independentUnits = 31; },
    (copy) => { copy.segments.recovery.executableRecoverySuffixUnits = 31; },
    (copy) => { copy.segments.recovery.verifiedRecoveryEffectUnits = 31; },
    (copy) => { copy.rights.productionTrainingAuthorizedByOutsider = true; },
    (copy) => { copy.privacy.noPiiGuaranteed = true; },
    (copy) => { copy.useBoundary.governedTrainingRows = 31; },
    (copy) => { copy.network.networkAdmissionRows = 31; },
    (copy) => { copy.economics.CEU = 31; },
    (copy) => { copy.authority.executionAuthorityEstablished = true; },
  ];
  for (const mutate of mutations) {
    assert.equal(verifyVifailbackCutSausageReport(reseal(report, mutate)).ok, false);
  }
  const fakeSource = reseal(report,
    (copy) => { copy.source.sourceRoot = `sha256:${"0".repeat(64)}`; });
  assert.equal(verifyVifailbackCutSausageReport(fakeSource).ok, true);
  assert.equal(verifyVifailbackCutSausageReportWithSource(fakeSource, SOURCE).ok, false);
});

test("artifact publication refuses an occupied target without clobbering it", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-vifailback-publish-test-"));
  chmodSync(parent, 0o700);
  const staging = path.join(parent, "staging");
  const occupied = path.join(parent, "occupied");
  mkdirSync(staging, { mode: 0o700 });
  mkdirSync(path.join(staging, "source"), { mode: 0o700 });
  writeFileSync(path.join(staging, "report.json"), "{}\n", { mode: 0o600 });
  writeFileSync(path.join(staging, "run-receipt.json"), "{}\n", { mode: 0o600 });
  mkdirSync(occupied, { mode: 0o700 });
  writeFileSync(path.join(occupied, "sentinel"), "preserve\n", { mode: 0o600 });
  assert.throws(() => publishVifailbackCutSausageArtifactDirectory(staging, occupied),
    /PUBLISH_TARGET_EXISTS_OR_BROAD/u);
  assert.equal(readFileSync(path.join(occupied, "sentinel"), "utf8"), "preserve\n");
  assert.deepEqual(sorted(readdirSync(staging)), ["report.json", "run-receipt.json", "source"]);
  rmSync(parent, { recursive: true, force: true });
});
