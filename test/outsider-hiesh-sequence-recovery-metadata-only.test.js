import assert from "node:assert/strict";
import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  HIESH_SEQUENCE_RECOVERY_DISPOSITION,
  HIESH_SEQUENCE_RECOVERY_RECEIPT_SCHEMA,
  HIESH_SEQUENCE_RECOVERY_REPORT_SCHEMA,
  HIESH_SEQUENCE_RECOVERY_REPOSITORIES,
  verifyHieshSequenceRecoveryArtifactDirectory,
} from "../src/outsider-hiesh-sequence-recovery-metadata-only.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-hiesh-sequence-recovery-metadata-only-20260830-v1");
let cached;
function artifact() {
  cached ??= verifyHieshSequenceRecoveryArtifactDirectory(ARTIFACT);
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

test("Hiesh paired HDF5 source closes as a payload-free metadata-only terminal record", () => {
  const checked = artifact(); const { report, receipt } = checked;
  assert.equal(checked.verificationLevel,
    "FIXED_TWO_REPOSITORY_METADATA_ONLY_TERMINAL_SOURCE_REDERIVED");
  assert.equal(report.schema, HIESH_SEQUENCE_RECOVERY_REPORT_SCHEMA);
  assert.equal(receipt.schema, HIESH_SEQUENCE_RECOVERY_RECEIPT_SCHEMA);
  assert.equal(report.disposition, HIESH_SEQUENCE_RECOVERY_DISPOSITION);
  assert.equal(report.source.repositories.length, 2);
  assert.deepEqual(report.source.repositories.map((item) => item.datasetId),
    HIESH_SEQUENCE_RECOVERY_REPOSITORIES.map((item) => item.datasetId));
  assert.deepEqual(report.source.repositories.map((item) => item.revision),
    HIESH_SEQUENCE_RECOVERY_REPOSITORIES.map((item) => item.revision));
  assert.deepEqual(report.source.repositories.map((item) => item.inventory), [
    { entries: 205, files: 202, directories: 3, bytes: 83_233_216_844,
      hdf5Files: 200, splitCounts: { test: 50, train: 100, val: 50 } },
    { entries: 205, files: 202, directories: 3, bytes: 83_770_134_856,
      hdf5Files: 200, splitCounts: { test: 50, train: 100, val: 50 } },
  ]);
  assert.deepEqual(report.source.repositories.map((item) => item.recordUsedStorageBytes),
    [83_233_213_528, 83_770_131_544]);
  assert.deepEqual(report.source.repositories.map((item) => item.recordTreeByteDelta),
    [3_316, 3_312]);
  assert.deepEqual(report.source.repositories.map((item) => item.recordBeforeAfterByteIdentical),
    [true, true]);
  assert.deepEqual(report.source.repositories.map((item) => item.treeBeforeAfterByteIdentical),
    [true, true]);
  assert.deepEqual(report.source.repositories.map((item) => item.treeRoot), [
    "sha256:530d0f566a0ffbd47a4c139bc664288b0bd3d999fa7e848a4eaa06b88c9bab32",
    "sha256:11b74f83e96e8e021c11c58a339a8bdec61d7362930b957d3357596a6fa07ded",
  ]);
  assert.deepEqual(report.source.repositories.map((item) => item.selectedHdf5.payloadAcquired),
    [false, false]);
  assert.deepEqual(report.source.repositories.map((item) => item.selectedHdf5.bytes),
    [326_679_376, 304_676_064]);
  assert.deepEqual(report.source.pairSelection, { split: "test", ordinal: 21,
    horizontalSeed: 43100, verticalSeed: 63100,
    sameOrdinalAcrossPublisherRepositories: true,
    exactCrossRepositoryTrajectoryIdentityProven: false,
    causalPairingOrChronologyProven: false });

  const terminal = report.terminalPreflight;
  assert.equal(terminal.requestedClosure, "NON_IMAGE_NUMERIC_EPISODE_OBJECT_CLOSURE");
  assert.equal(terminal.closureCompleted, false);
  assert.equal(terminal.failureCode, "IMAGE_PAYLOAD_READ_DURING_LAYOUT");
  assert.equal(terminal.rangeCount, 33_001);
  assert.equal(terminal.rangeBytes, 5_389_440);
  assert.equal(terminal.verticalRangeCount, 0);
  assert.equal(terminal.verticalRangeBytes, 0);
  assert.equal(terminal.verticalRangesAcquired, 0);
  assert.equal(terminal.imageStorageIntervals, 980);
  assert.equal(terminal.overlapEvents, 492);
  assert.equal(terminal.affectedImageDatasets, 490);
  assert.equal(terminal.affectedRanges, 492);
  assert.equal(terminal.overlapBytes, 133_400);
  assert.deepEqual(terminal.horizontalLayout, { datasets: 10_299, groups: 1_962,
    imageDatasets: 980, imageStorageBytes: 192_675_840,
    nonImageDatasets: 9_319, nonImageStorageBytes: 128_649_180 });
  assert.equal(terminal.libhdf5MetadataReadAheadCrossedImageStorage, true);
  assert.equal(terminal.horizontalExploratoryRangesPrivateOutsideArtifact, true);
  assert.equal(terminal.rawRangePayloadsProjected, false);
  assert.equal(terminal.rangeHeadersAndPayloadHashesProjected, true);
  assert.equal(terminal.wholeFileFallbackUsed, false);
  assert.equal(terminal.hdf5ValuesDecoded, false);
  assert.equal(terminal.metadataOnlyTerminalDisposition, true);
  assert.equal(terminal.evidenceHash,
    "sha256:205e25052eae5b19980c6b84fa07f2fd7a1962dae3da09c5c9a6436390d217e5");
  assert.equal(terminal.rangeRoot,
    "sha256:bf2c4b01ebe76121ba5587a79d25c337153734fc6ba27ad8d9faa6f20ed75b82");
  assert.equal(terminal.imageStorageRoot,
    "sha256:f3923c0528062a92a41e0921bc233a577e3e34d9dcbfcfbd02b50869d1380058");
  assert.equal(terminal.overlapRoot,
    "sha256:4079f857e5ffcbbf05fc3256c1c5c4f48e0d16bf796d3ba4c8338c646b1a4c48");
  assert.deepEqual(terminal.firstOverlap, {
    path: "/episode_21/timestep_0/obs/wrist_rgb", imageStart: 203152,
    imageEnd: 399759, rangeStart: 202976, rangeEnd: 203423,
    overlapStart: 203152, overlapEnd: 203423, overlapBytes: 272,
    rangeSha256: "sha256:55873ee2f2e64b8aae19cbb0909d64e6af0d756c8d082923c35a2db036fb0525",
  });

  assert.equal(report.semanticBoundary.recoveryIsPublisherTaskAndSourceNamingOnly, true);
  assert.equal(report.semanticBoundary.rawEpisodeStateActionValuesAvailableInArtifact, false);
  for (const key of ["nativeOutcomeRows", "independentOutcomeRows", "nativeInterventionRows",
    "recoveryEffectRows", "completeAttemptCensusRows", "physicalWitnessRows",
    "realWorldExecutionRows"]) assert.equal(report.semanticBoundary[key], 0, key);
  assert.equal(report.rightsPrivacyAndUse.rights.rightsDisposition, "FAIL_CLOSED");
  assert.equal(report.rightsPrivacyAndUse.rights.authorizedTrainingRows, 0);
  assert.equal(report.rightsPrivacyAndUse.privacy.noPiiGuaranteed, false);
  assert.equal(report.rightsPrivacyAndUse.privacy.rawHdf5PayloadBytesInArtifact, 0);
  assert.equal(report.rightsPrivacyAndUse.use.quarantineEvaluationOnly, true);
  assert.equal(receipt.rangePayloadBytesRepublished, 0);
  assert.equal(receipt.wholeHdf5PayloadsAcquired, 0);
  assert.equal(receipt.verticalRangeCount, 0);
});

test("Hiesh artifact is private, no-clobber, and receipt-bound to its exact source", () => {
  const checked = artifact(); assertPrivateTree(ARTIFACT);
  assert.equal(checked.report.source.sourceManifestHash,
    "sha256:a8f62936c8d6437337f6f5798ae9168b8a6138f57bd81327c4f8dd87a4a3ee02");
  assert.equal(checked.report.source.sourceManifestFileSha256,
    "sha256:56a26d12c9158995b820b1671bbbfb74fe8d418003a1436211dd910806a79505");
  assert.equal(checked.report.source.sourceRoot,
    "sha256:43f2f979b345707c3c81a6b3c67480ffa8375e7e41a3cb4bb199a41f7ef3511f");
  assert.equal(checked.report.artifactHash,
    "sha256:76b1a2a990f834af1620b0d2075555d02f4b82cae73e13c74d472cb62e6a9f6d");
  assert.equal(checked.receipt.reportHash, checked.report.artifactHash);
  assert.equal(checked.receipt.sourceManifestHash,
    checked.report.source.sourceManifestHash);
  assert.equal(checked.receipt.sourceRoot, checked.report.source.sourceRoot);
  assert.equal(checked.receipt.receiptWrittenLast, true);
  assert.equal(checked.receipt.noClobber, true);
  assert.equal(checked.receipt.receiptHash,
    "sha256:589df69bfe4111ad1e783298e78fd47f01c1348c7b2fb9ebba4bdc624b7cda8f");
  assert.equal(checked.reportFileSha256,
    "sha256:f74716752fbdda7c554d344df8bc4ace907552def757fe81cc228018cd20c434");
  assert.equal(checked.receiptFileSha256,
    "sha256:8e4b9261c601b0c7a2d74a8ec4ac01b2d9aacba6e0f9394342024df14d7ceaad");
});
