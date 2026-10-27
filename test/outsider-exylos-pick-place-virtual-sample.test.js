import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  EXYLOS_DATASET_ID,
  EXYLOS_REPORT_SCHEMA,
  EXYLOS_REVISION,
  exylosDigest,
  publishExylosArtifactDirectory,
  verifyExylosArtifactDirectory,
  verifyExylosReceipt,
  verifyExylosReport,
  verifyExylosSourceDirectory,
} from "../src/outsider-exylos-pick-place-virtual-sample.js";

const ROOT = path.resolve(
  "artifacts/outsider-exylos-pick-place-virtual-sample-20260829-v1");
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
  changed.artifactHash = exylosDigest(changed, `${EXYLOS_REPORT_SCHEMA}/artifact`);
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

test("actual source replays the stable HF record, four-page tree, and 58-file closure", () => {
  const checked = verifyExylosSourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_NO_VIDEO_SOURCE_BYTE_REPLAY");
  assert.equal(checked.manifest.datasetId, EXYLOS_DATASET_ID);
  assert.equal(checked.manifest.pinnedRevision, EXYLOS_REVISION);
  assert.deepEqual(checked.manifest.recordBefore, checked.manifest.recordAfter);
  assert.equal(checked.manifest.recordBefore.publisherCardLicenseClaim, "apache-2.0");
  assert.equal(checked.manifest.treeBefore.pages, 4);
  assert.equal(checked.manifest.treeBefore.entryCount, 319);
  assert.equal(checked.manifest.treeBefore.snapshotHash,
    "sha256:26522403c8e4400d833786d729e97d3ed3752211308a8d1676138d6f4d6ecc6f");
  assert.deepEqual(checked.manifest.treeBefore, checked.manifest.treeAfter);
  assert.equal(checked.manifest.remoteObjects.length, 58);
  assert.equal(checked.manifest.sourceSupportObjects.length, 10);
  assert.equal(checked.manifest.selection.selectedBytes, 3_358_010);
  assert.equal(checked.manifest.selection.parquetFiles, 50);
  assert.equal(checked.manifest.selection.parquetBytes, 3_086_411);
  assert.equal(checked.manifest.selection.excludedVisualObjects, 252);
  assert.equal(checked.manifest.selection.excludedVisualBytes, 3_515_412_681);
  assert.equal(checked.manifest.selection.videoBytesFetched, false);
  assert.equal(checked.manifest.manifestHash,
    "sha256:26ae6c043dff63b0fa969a74f6f537d57d7048e66979c0923429bc5ff9528bc1");
  assert.equal(checked.manifestFileSha256,
    "sha256:2048cf8dc0b214e69b8af47334060ae30c412b2c8c6aa71bc1f09c5b8a1e2da2");
  assert.equal(checked.sourceRoot,
    "sha256:d95dd745fdfee61109ef7aa93e9cb812fd4b635109515040b2ea738db5b089b7");
  assertPrivateTree(ROOT);
});

test("all 50 virtual traces replay and expose the three publisher-label conflicts", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.artifactHash,
    "sha256:985ed2ebbe3efb73fcd91bcd079033718c206638eb6a5692f9883316dfb90a84");
  assert.equal(report.observations.parser.engine, "pyarrow");
  assert.equal(report.observations.parser.pythonVersion, "3.12.13");
  assert.equal(report.observations.parser.pyarrowVersion, "25.0.1");
  assert.equal(report.observations.parser.helperSha256,
    "sha256:2ecfab3ec09e7d8ef607d271988c0609c9c66a887057ee325ccec2c1b6e57f59");
  assert.equal(report.observations.dataset.episodeUnits, 50);
  assert.equal(report.observations.dataset.frameUnits, 21_412);
  assert.equal(report.observations.dataset.videoReferenceRows, 107_060);
  assert.equal(report.observations.dataset.actualVideoBytesReplayed, false);
  assert.equal(report.observations.publisherLabels.annotationSuccessUnits, 30);
  assert.equal(report.observations.publisherLabels.annotationFailureUnits, 20);
  assert.deepEqual(report.observations.publisherLabels.failureReasonCounts,
    { none: 30, operator_abort: 14, slip_drop: 6 });
  assert.equal(report.observations.publisherLabels.parquetTerminalSuccessTrueUnits, 33);
  assert.equal(report.observations.publisherLabels.parquetTerminalSuccessFalseUnits, 17);
  assert.equal(report.observations.publisherLabels.crossFieldAgreementUnits, 47);
  assert.equal(report.observations.publisherLabels.crossFieldDisagreementUnits, 3);
  assert.deepEqual(
    report.observations.publisherLabels.crossFieldDisagreementEpisodeIndices,
    [25, 42, 43]);
  assert.equal(report.observations.publisherLabels.conflictResolutionEstablished, false);
  assert.deepEqual(report.observations.episodeSummaries
    .filter((item) => !item.publisherLabelFieldsAgree)
    .map((item) => ({ episode: item.episodeIndex, annotation: item.publisherSuccess,
      terminal: item.parquetTerminalSuccessFlag, reason: item.publisherFailureReason })), [
    { episode: 25, annotation: false, terminal: true, reason: "slip_drop" },
    { episode: 42, annotation: false, terminal: true, reason: "slip_drop" },
    { episode: 43, annotation: false, terminal: true, reason: "slip_drop" },
  ]);
});

test("correction morphology remains publisher virtual morphology, not recovery", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.observations.publisherCorrectionMorphology
    .episodesWithCorrectionPhase, 16);
  assert.equal(report.observations.publisherCorrectionMorphology.correctionPhaseUnits, 27);
  assert.deepEqual(report.observations.publisherCorrectionMorphology
    .correctionCountDistribution, { 0: 34, 1: 7, 2: 7, 3: 2 });
  assert.deepEqual(report.observations.publisherCorrectionMorphology
    .correctionEpisodeIndices,
  [10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 26, 45]);
  assert.equal(report.denominators.publishedNoVideoEpisodeSample.units, 50);
  assert.equal(report.denominators.completeRepositoryTreeInventory.units, 319);
  assert.equal(report.denominators.publisherCorrectionMorphology.units, 16);
  assert.equal(report.denominators.publisherCorrectionMorphology.verifiedRecoveryEffectUnits, 0);
  assert.equal(report.denominators.crossTotal, null);
  assert.equal(report.truthBoundary.physicalRobotExecutionEstablished, false);
  assert.equal(report.truthBoundary.publisherOutcomeLabelFieldsConflict, true);
  assert.equal(report.truthBoundary.publisherOutcomeLabelConflictResolved, false);
  assert.equal(report.truthBoundary.independentOutcomeEstablished, false);
  assert.equal(report.truthBoundary.executableRecoverySuffixEstablished, false);
  assert.equal(report.truthBoundary.verifiedRecoveryEffectEstablished, false);
  assert.equal(report.truthBoundary.realWorldAttemptCensusEstablished, false);
  assert.equal(report.truthBoundary.generationOpportunityOrSeedCensusEstablished, false);
  assert.equal(report.segments.actionTrace.physicalUnits, 0);
  assert.equal(report.segments.outcome.independentUnits, 0);
  assert.equal(report.segments.recovery.verifiedEffectUnits, 0);
});

test("rights, privacy, deployment, training, network, economics, and authority stay held", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.rights.publisherCardLicenseClaim, "Apache-2.0");
  assert.equal(report.rights.publisherReadmeLicenseClaimBytePinned, true);
  assert.equal(report.rights.standaloneApacheLicenseBytesPinned, true);
  assert.equal(report.rights.legalAdjudicationPerformed, false);
  assert.equal(report.rights.productionTrainingAuthorizedByOutsider, false);
  assert.equal(report.rights.artifactRedistributionAuthorityEstablished, false);
  assert.equal(report.privacy.rawImageryFetched, false);
  assert.equal(report.privacy.videoPathAndTimestampReferencesReplayed, true);
  assert.equal(report.privacy.publisherPrivacyStatementFound, false);
  assert.equal(report.privacy.participantConsentEstablished, false);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.useBoundary.status, "QUARANTINE_EVAL_ONLY");
  assert.equal(report.useBoundary.visualReplayEstablished, false);
  assert.equal(report.useBoundary.publicDeploymentReady, false);
  assert.equal(report.useBoundary.governedTrainingRows, 0);
  assert.equal(report.network.networkAdmissionRows, 0);
  assert.equal(report.economics.CEU, 0);
  assert.equal(report.economics.pricingUnits, 0);
  assert.equal(report.authority.executionAuthorityEstablished, false);
  assert.equal(report.authority.authorityUnits, 0);
});

test("report and receipt rederive from source; resealing cannot manufacture stronger truth", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receipt = JSON.parse(readFileSync(RECEIPT));
  assert.equal(receipt.receiptHash,
    "sha256:173c5b7075a28be455a466fb64d33953551e2ffebc16773fa84045f9c88d9492");
  assert.equal(receipt.reportFileSha256,
    "sha256:a6cf97b46de8cfeeed31d93a89024a265ea37f4e4bc864ff2be0a41afd740779");
  assert.equal(verifyExylosReport(report).ok, true);
  assert.equal(verifyExylosReceipt(receipt, report, reportBytes).ok, true);
  const artifact = verifyExylosArtifactDirectory(ROOT);
  assert.equal(artifact.ok, true);
  assert.equal(artifact.verificationLevel, "FULL_NO_VIDEO_SOURCE_REDERIVED");
  assert.equal(artifact.physicalExecutionUnits, 0);
  assert.equal(artifact.independentOutcomeUnits, 0);
  assert.equal(artifact.recoveryEffectUnits, 0);
  assert.equal(artifact.governedTrainingRows, 0);
  assert.equal(artifact.networkAdmissionRows, 0);
  assert.equal(artifact.authorityUnits, 0);

  const mutations = [
    (copy) => { copy.truthBoundary.physicalRobotExecutionEstablished = true; },
    (copy) => { copy.truthBoundary.independentOutcomeEstablished = true; },
    (copy) => { copy.truthBoundary.publisherOutcomeLabelConflictResolved = true; },
    (copy) => { copy.truthBoundary.verifiedRecoveryEffectEstablished = true; },
    (copy) => { copy.denominators.crossTotal = 419; },
    (copy) => { copy.segments.outcome.independentUnits = 50; },
    (copy) => { copy.observations.publisherLabels.crossFieldDisagreementUnits = 0; },
    (copy) => { copy.rights.productionTrainingAuthorizedByOutsider = true; },
    (copy) => { copy.privacy.noPiiGuaranteed = true; },
    (copy) => { copy.useBoundary.governedTrainingRows = 50; },
    (copy) => { copy.network.networkAdmissionRows = 50; },
    (copy) => { copy.economics.CEU = 50; },
    (copy) => { copy.authority.executionAuthorityEstablished = true; },
  ];
  for (const mutate of mutations) {
    assert.equal(verifyExylosReport(reseal(report, mutate)).ok, false);
  }
  const fakeSource = reseal(report,
    (copy) => { copy.source.sourceRoot = `sha256:${"0".repeat(64)}`; });
  assert.equal(verifyExylosReport(fakeSource).ok, true);
  assert.notEqual(fakeSource.source.sourceRoot,
    verifyExylosSourceDirectory(SOURCE).sourceRoot);
});

test("artifact publication refuses an occupied target without clobbering it", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-exylos-publish-test-"));
  chmodSync(parent, 0o700);
  const staging = path.join(parent, "staging");
  const occupied = path.join(parent, "occupied");
  mkdirSync(staging, { mode: 0o700 });
  mkdirSync(path.join(staging, "source"), { mode: 0o700 });
  writeFileSync(path.join(staging, "report.json"), "{}\n", { mode: 0o600 });
  writeFileSync(path.join(staging, "run-receipt.json"), "{}\n", { mode: 0o600 });
  mkdirSync(occupied, { mode: 0o700 });
  writeFileSync(path.join(occupied, "sentinel"), "preserve\n", { mode: 0o600 });
  assert.throws(() => publishExylosArtifactDirectory(staging, occupied),
    /PUBLISH_TARGET_EXISTS_OR_BROAD/u);
  assert.equal(readFileSync(path.join(occupied, "sentinel"), "utf8"), "preserve\n");
  assert.deepEqual(sorted(readdirSync(staging)), ["report.json", "run-receipt.json", "source"]);
  rmSync(parent, { recursive: true, force: true });
});
