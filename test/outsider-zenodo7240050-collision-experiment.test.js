import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ZENODO_7240050_ARCHIVE_BYTES,
  ZENODO_7240050_ARCHIVE_MD5,
  ZENODO_7240050_COLLISION_CONSTANTS,
  ZENODO_7240050_DOI,
  ZENODO_7240050_REPORT_SCHEMA,
  buildZenodo7240050CollisionExperimentFromSource,
  verifyZenodo7240050CollisionArtifactDirectory,
  verifyZenodo7240050CollisionExperimentReport,
  verifyZenodo7240050CollisionExperimentWithSource,
  verifyZenodo7240050CollisionRunReceipt,
  verifyZenodo7240050CollisionSourceDirectory,
  zenodo7240050Sha256,
} from "../src/outsider-zenodo7240050-collision-experiment.js";
import { canonicalizeStrict } from "../src/canonical.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-zenodo7240050-collision-experiment-20260829-v1");
const SOURCE = path.join(ARTIFACT, "source");
const REPORT_BYTES = readFileSync(path.join(ARTIFACT,
  "zenodo7240050-collision-experiment.json"));
const REPORT = JSON.parse(REPORT_BYTES);
const RECEIPT_BYTES = readFileSync(path.join(ARTIFACT, "run-receipt.json"));
const RECEIPT = JSON.parse(RECEIPT_BYTES);

function artifactDigest(report) {
  const { artifactHash: ignored, ...body } = report;
  return `sha256:${createHash("sha256")
    .update(`${ZENODO_7240050_REPORT_SCHEMA}/artifact\0${canonicalizeStrict(body)}`)
    .digest("hex")}`;
}

function visit(current, result = { directories: [], files: [] }) {
  const stat = lstatSync(current);
  assert.equal(stat.isSymbolicLink(), false, current);
  if (stat.isDirectory()) {
    result.directories.push({ path: current, mode: stat.mode & 0o777 });
    for (const name of readdirSync(current).sort()) visit(path.join(current, name), result);
  } else {
    assert.equal(stat.isFile(), true, current);
    result.files.push({ path: current, mode: stat.mode & 0o777 });
  }
  return result;
}

test("Zenodo record, parent ZIP and complete central directory are exactly pinned", () => {
  assert.equal(ZENODO_7240050_DOI, "10.5281/zenodo.7240050");
  assert.equal(ZENODO_7240050_ARCHIVE_BYTES, 788_355_579);
  assert.equal(ZENODO_7240050_ARCHIVE_MD5,
    "md5:c67b6072ffc1ad5ae627fc464422d158");
  assert.equal(ZENODO_7240050_COLLISION_CONSTANTS.centralOffset, 788_343_392);
  assert.equal(ZENODO_7240050_COLLISION_CONSTANTS.centralBytes, 12_165);
  assert.equal(ZENODO_7240050_COLLISION_CONSTANTS.centralEntries, 98);
  assert.equal(ZENODO_7240050_COLLISION_CONSTANTS.centralFiles, 84);
  assert.equal(ZENODO_7240050_COLLISION_CONSTANTS.centralDirectories, 14);
  assert.equal(ZENODO_7240050_COLLISION_CONSTANTS.archiveBagFiles, 80);
  assert.deepEqual(ZENODO_7240050_COLLISION_CONSTANTS.selected.map((entry) => ({
    path: entry.archivePath, offset: entry.localHeaderOffset,
    compressed: entry.compressedSize, raw: entry.uncompressedSize,
  })), [
    { path: "data/2022_08_03_calpak/README_1.docx", offset: 215_561_540,
      compressed: 15_246, raw: 17_993 },
    { path: "data/2022_08_03_calpak/11.bag", offset: 67_637_933,
      compressed: 1_698_388, raw: 9_429_893 },
  ]);
});

test("stored source replays exact record brackets, strict ranges, local headers and CRCs", () => {
  const checked = verifyZenodo7240050CollisionSourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SELECTED_SOURCE_BYTE_REPLAY");
  assert.equal(checked.manifest.manifestHash,
    "sha256:3d3846817d9fe7ec9aca095dbcc59b72ee01f079f66d1bdc7e85b7e81f411afa");
  assert.equal(checked.manifestFileSha256,
    "sha256:08d847ea0e0aafdc349b2247d3381523aa06bf2bdddcbbc7397afee9c572f039");
  assert.equal(checked.sourceRoot,
    "sha256:b1f5ae0b4e9c33911f58232f81cc363141aa033a52c9a0150359976c3ccd4aaa");
  assert.equal(checked.inventory.inventoryHash,
    "sha256:dbd843440749c59a1f563993d98de98c43768c7605eb24f5985582e307a1df2d");
  assert.equal(checked.inventory.counts.rosBagFiles, 80);
  assert.equal(checked.inventory.selectionPolicy.selectedExperimentRow, 11);
  assert.equal(checked.manifest.recordBracket.exactBytesStable, true);
  assert.equal(checked.manifest.archiveRangeClosure.parentArchiveDownloaded, false);
});

test("README and all ROS bag content exactly rebuild the report", () => {
  const rebuilt = buildZenodo7240050CollisionExperimentFromSource(SOURCE);
  assert.deepEqual(rebuilt, REPORT);
  const checked = verifyZenodo7240050CollisionExperimentWithSource(REPORT, SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SELECTED_SOURCE_REDERIVED");
  assert.equal(REPORT.artifactHash,
    "sha256:c9678d8bccd5d5319663a50745981c32281557b55d6931609d077903f701bcf0");
  assert.equal(zenodo7240050Sha256(REPORT_BYTES),
    "sha256:295a905a9def5428cea2b4bdb196f1f10c0634f05c07806088b87bf664bfcfb0");
  assert.equal(REPORT.sourceReplay.replayHash,
    "sha256:2b63b9e3a8ae1e7055ea44cf5e6960472817b874548bbf2cf137efb318cefd64");
});

test("one experiment and its message records remain typed and non-additive", () => {
  assert.deepEqual(REPORT.denominatorRegistry.populations.map((entry) => entry.units),
    [1, 48_520]);
  assert.equal(REPORT.denominatorRegistry.populations[1]
    .additiveWithCollisionExperiments, false);
  assert.equal(REPORT.denominatorRegistry.topicCountsAreAdditionalExperiments, false);
  assert.equal(REPORT.denominatorRegistry.sensorArrayValuesAreAdditionalMessages, false);
  assert.equal(REPORT.denominatorRegistry.crossDomainTotal, null);
  assert.equal(REPORT.denominatorRegistry.crossDomainAdditionProhibited, true);
  assert.equal(REPORT.publisherExperimentDescription.selectedExperiment.experimentNumber, 11);
  assert.equal(REPORT.publisherExperimentDescription.selectedExperiment
    .publisherPeakForceClaim, 526);
  assert.equal(REPORT.publisherExperimentDescription.peakForceUnitDeclared, false);
  assert.equal(REPORT.mechanicalCollisionEvidence.rosBag.messages, 48_520);
  assert.equal(REPORT.mechanicalCollisionEvidence.rosBag.imageTopics.length, 0);
});

test("external F/T and collision detector evidence preserve timing, units and task boundaries", () => {
  const external = REPORT.mechanicalCollisionEvidence.externalFtStream;
  assert.equal(external.messages, 6_169);
  assert.equal(external.rosType, "sensor_msgs/JointState");
  assert.deepEqual(external.shapes,
    [{ effortCount: 6, messages: 6_169, nameCount: 0,
      positionCount: 6, velocityCount: 12 }]);
  assert.equal(external.observedEffortArrayMinimum, -98.65007781982422);
  assert.equal(external.observedEffortArrayMaximum, 526.8031387329102);
  assert.equal(external.embeddedHeaderTimeAlignedToBagEnvelope, false);
  assert.equal(external.channelCoordinatesAndUnitsDeclared, false);
  assert.equal(external.physicalIndependenceExternallyAudited, false);
  assert.equal(external.numericSimilarityIsNotUnitOrCalibrationProof, true);
  const detectors = REPORT.mechanicalCollisionEvidence.collisionDetectorStreams;
  assert.deepEqual([detectors.endEffector.trueMessages, detectors.joints.trueMessages],
    [264, 765]);
  assert.equal(REPORT.mechanicalCollisionEvidence.independentTaskOutcomePresent, false);
  assert.equal(REPORT.mechanicalCollisionEvidence.recoverySequencePresent, false);
  assert.equal(REPORT.zeroClaimBoundary.independentTaskOutcomeRecords, 0);
  assert.equal(REPORT.zeroClaimBoundary.taskRecoveryRecords, 0);
});

test("rights, privacy, receipt ordering and private permissions stay explicit", () => {
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.rights.officialZenodoLicenseClaim,
    "CC-BY-4.0");
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.rights.legalConclusion, false);
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.privacy.rosgraphLogMessagesRetainedLocally,
    3_233);
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.privacy.manualPrivacyReviewComplete, false);
  assert.equal(REPORT.modelAndTrainingBoundary.authorizedTrainingRows, 0);
  assert.equal(REPORT.authorityAndNetworkBoundary.authorityDelta, 0);
  const receiptCheck = verifyZenodo7240050CollisionRunReceipt(RECEIPT, REPORT_BYTES);
  assert.equal(receiptCheck.ok, true);
  assert.equal(RECEIPT.receiptHash,
    "sha256:c477a651014ac9484547a09d29f32b304f8a3de4dab3ebf0d3f6a56d1af26993");
  assert.equal(zenodo7240050Sha256(RECEIPT_BYTES),
    "sha256:ffb9b8df2201db5e678c6e07df1a34b1c97255cea034359a5fa57b61a66acf88");
  assert.equal(RECEIPT.publication.receiptWrittenLast, true);
  assert.equal(RECEIPT.publication.noClobber, true);
  const tree = visit(ARTIFACT);
  assert.equal(tree.directories.length, 4);
  assert.equal(tree.files.length, 11);
  assert.equal(tree.directories.every((entry) => entry.mode === 0o700), true);
  assert.equal(tree.files.every((entry) => entry.mode === 0o600), true);
  const artifactCheck = verifyZenodo7240050CollisionArtifactDirectory(ARTIFACT);
  assert.equal(artifactCheck.ok, true);
  assert.equal(artifactCheck.verificationLevel, "FULL_SELECTED_SOURCE_REDERIVED");
});

test("rehash cannot inflate denominators, outcome, training, scope or calibration claims", () => {
  const denominator = structuredClone(REPORT);
  denominator.denominatorRegistry.crossDomainTotal = 48_521;
  denominator.artifactHash = artifactDigest(denominator);
  assert.ok(verifyZenodo7240050CollisionExperimentReport(denominator).errors
    .includes("DENOMINATOR_BOUNDARY"));

  const outcome = structuredClone(REPORT);
  outcome.segmentCoverageAttribution.outcome.independentTaskOutcomeRecords = 1;
  outcome.artifactHash = artifactDigest(outcome);
  assert.ok(verifyZenodo7240050CollisionExperimentReport(outcome).errors
    .includes("SEGMENT_ZERO_BOUNDARY"));

  const training = structuredClone(REPORT);
  training.rightsPrivacyRevisionAndUse.use.productionTrainingAuthorized = true;
  training.rightsPrivacyRevisionAndUse.use.authorizedTrainingRows = 48_520;
  training.artifactHash = artifactDigest(training);
  assert.ok(verifyZenodo7240050CollisionExperimentReport(training).errors
    .includes("RIGHTS_PRIVACY_TRAINING_BOUNDARY"));

  const scope = structuredClone(REPORT);
  scope.declaredScope.globalExhaustion = true;
  scope.artifactHash = artifactDigest(scope);
  assert.ok(verifyZenodo7240050CollisionExperimentReport(scope).errors
    .includes("SCOPE_BOUNDARY"));

  const units = structuredClone(REPORT);
  units.mechanicalCollisionEvidence.externalFtStream.channelCoordinatesAndUnitsDeclared = true;
  units.artifactHash = artifactDigest(units);
  assert.ok(verifyZenodo7240050CollisionExperimentReport(units).errors
    .includes("MECHANICAL_EVIDENCE_BOUNDARY"));
});
