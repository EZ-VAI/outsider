import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  ZENODO_15873769_DISPOSITION,
  ZENODO_15873769_DOI,
  ZENODO_15873769_LICENSE,
  verifyZenodo15873769AnnotationArtifactDirectory,
} from "../src/outsider-zenodo15873769-armbench-video-defect-annotations.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-zenodo15873769-armbench-video-defect-annotations-20260829-v1");

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function assertPrivateTree(root) {
  const status = lstatSync(root);
  assert.equal(status.isSymbolicLink(), false, root);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600, root);
  if (status.isDirectory()) {
    for (const name of readdirSync(root)) assertPrivateTree(path.join(root, name));
  }
}

test("complete Zenodo ARMBench annotation archives replay without becoming episodes or outcomes", () => {
  const checked = verifyZenodo15873769AnnotationArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel,
    "FULL_ARCHIVE_BYTES_ZIP_CRC_AND_ANNOTATION_SOURCE_REDERIVED");
  const { report, receipt } = checked;

  assert.equal(report.disposition, ZENODO_15873769_DISPOSITION);
  assert.equal(report.source.recordId, 15_873_769);
  assert.equal(report.source.doi, ZENODO_15873769_DOI);
  assert.equal(report.source.conceptDoi, "10.5281/zenodo.15873768");
  assert.equal(report.source.recordRevision, 10);
  assert.equal(report.source.public, true);
  assert.equal(report.source.openAccess, true);
  assert.equal(report.source.officialFileCount, 2);
  assert.equal(report.source.officialArchiveBytes, 166_914_597);
  assert.equal(report.source.recordBeforeAfterByteIdentical, true);
  assert.equal(report.source.recordBeforeAfterSha256,
    "sha256:eece1e70b757dff57301df9fe98f41b47e77c1ee0d8a71502f28353ae170611b");
  assert.equal(report.source.sourceManifestHash,
    "sha256:f3bae8f7bfaff7bd6e6548cb5a53e1033688701b3602c4a0ed56ebeca309a0f4");
  assert.equal(report.source.sourceRoot,
    "sha256:b39106c27ceea1c836472d6e3fdb0c134dcef097b1d227c434f1c8945fc0a692");
  assert.equal(report.source.inventoryHash,
    "sha256:58dee89f113a83c8666e581dfc67e4198ae98099db45ba16638a5aebf9b4b321");

  assert.deepEqual(report.archiveReplay.archives.map((archive) => ({
    archive: archive.archive, bytes: archive.archiveBytes,
    entries: archive.entries, files: archive.files,
    directories: archive.directories, compressed: archive.compressedBytes,
    uncompressed: archive.uncompressedBytes,
    stored: archive.storedEntries, deflated: archive.deflatedEntries,
  })), [
    { archive: "ARMBench.zip", bytes: 166_841_298, entries: 1_109,
      files: 1_107, directories: 2, compressed: 166_542_564,
      uncompressed: 238_309_537, stored: 2, deflated: 1_107 },
    { archive: "FAILURE.zip", bytes: 73_299, entries: 237,
      files: 230, directories: 7, compressed: 17_751,
      uncompressed: 46_783, stored: 7, deflated: 230 },
  ]);
  assert.equal(report.archiveReplay.totalEntries, 1_346);
  assert.equal(report.archiveReplay.totalFiles, 1_337);
  assert.equal(report.archiveReplay.totalDirectories, 9);
  for (const field of ["allCentralDirectoriesParsed", "allLocalHeadersParsed",
    "allDataDescriptorsParsed", "allMembersInflated",
    "allMemberCrc32ValuesVerified", "fullPrivateEntryInventoryStored"]) {
    assert.equal(report.archiveReplay[field], true, field);
  }
  assert.equal(report.archiveReplay.archives[0].nameRoot,
    "sha256:ec436a1ff0854aa07a4c0fb501ceeec92207c70e2d157522ba8cfba9397a2583");
  assert.equal(report.archiveReplay.archives[0].entryRoot,
    "sha256:4f7f8f8c0668f4c96639d5b2fcb9e23aa33787ccd28d837dc822aa19b71438ef");
  assert.equal(report.archiveReplay.archives[1].nameRoot,
    "sha256:bd27ffe66c11432db98ef87d68a2ba21415e23e33814ecc2f21260c27a590caa");

  const arm = report.armbenchAnnotations;
  assert.deepEqual(arm.split, {
    disjoint: true,
    test: { name: "test", rows: 11_251, uniqueTrials: 11_251,
      trialOrderRoot:
        "sha256:c046809ccd8e68df46321920803818558d62a994c8df99cd1e1853f42e735f43" },
    train: { name: "train", rows: 8_757, uniqueTrials: 8_757,
      trialOrderRoot:
        "sha256:4a4724432fb08440f8909c31571bcfdb94ccdd4df8656ac143a5079f0fbe10f1" },
    unionTrials: 20_008,
  });
  assert.equal(arm.visibleTrialUniverse, 20_008);
  assert.equal(arm.detectedActionSegmentRows, 20_008);
  assert.equal(arm.manuallyAnnotatedActionSegmentRows, 500);
  assert.equal(arm.framewiseDefectSegmentRows, 3_466);
  assert.equal(arm.boundingBoxTrialRowsPerBoxFile, 20_008);
  assert.equal(arm.boundingBoxFiles, 4);
  assert.equal(arm.boundingBoxFloat64ValuesNotRobotState, true);
  assert.deepEqual(Object.fromEntries(Object.entries(arm.parquet)
    .map(([name, value]) => [name, value.rows])), {
    "annotated_segments.parquet": 500,
    "arm_boxes.parquet": 20_008,
    "crop_boxes.parquet": 20_008,
    "defect_segments.parquet": 3_466,
    "dest_boxes.parquet": 20_008,
    "detected_segments.parquet": 20_008,
    "src_boxes.parquet": 20_008,
  });
  assert.deepEqual(arm.parquet["detected_segments.parquet"].byteValueCounts,
    { 0: 642_144, 1: 772_399, 2: 1_321_058, 3: 483_875, 4: 345_976 });
  assert.deepEqual(arm.parquet["defect_segments.parquet"].byteValueCounts,
    { 0: 131_352, 1: 308_481, 2: 216_962 });
  assert.deepEqual(arm.parquet["annotated_segments.parquet"].byteValueCounts,
    { 0: 16_796, 1: 18_874, 2: 30_869, 3: 12_549, 4: 8_320 });
  for (const name of ["arm_boxes.parquet", "dest_boxes.parquet",
    "src_boxes.parquet"]) {
    assert.equal(arm.parquet[name].valueBytes, 114_094_464);
    assert.deepEqual(arm.parquet[name].shape.tail, [4]);
    assert.equal(arm.parquet[name].shape.totalFrames, 3_565_452);
  }
  assert.equal(arm.parquet["crop_boxes.parquet"].valueBytes, 228_188_928);
  assert.deepEqual(arm.parquet["crop_boxes.parquet"].shape.tail, [2, 4]);

  assert.deepEqual(arm.relabeled.labelCounts,
    { deconstruction: 137, nominal: 823, open: 138 });
  assert.deepEqual(arm.relabeled.sublabelCounts,
    { "[]": 116, bag: 28, book: 541, box: 367, other: 46 });
  assert.equal(arm.relabeled.files, 1_098);
  assert.equal(arm.relabeled.annotationElements, 318);
  assert.equal(arm.relabeled.filesWithAnnotations, 159);
  assert.equal(arm.relabeled.bareNaNFrameIndexTokens, 113);
  assert.equal(arm.relabeled.filesWithBareNaN, 113);
  assert.equal(arm.relabeled.strictJsonFiles, 985);
  assert.equal(arm.relabeled.finiteNonnegativeIntegerFrameIndices, 205);
  assert.equal(arm.relabeled.semanticRoot,
    "sha256:939b1dd5c8640a5691a3d0dcfe8536119f2778633a713394fe49fbce8664ef24");
  assert.deepEqual(arm.crosswalk, {
    annotatedDefectIntersection: 257, annotatedOnly: 243,
    correctedDeconstructionRowsInDefectSegments: 137,
    correctedNominalRowsInDefectSegments: 3,
    correctedOpenRowsInDefectSegments: 138,
    defectOnly: 3_209, defectSegmentTrials: 3_466,
    detectedAndAllBoxTrialSetsIdentical: true,
    manuallyAnnotatedTrials: 500, relabeledAnnotatedOverlap: 63,
    relabeledDefectOverlap: 278, relabeledTestOverlap: 436,
    relabeledTrainOverlap: 662, relabeledTrials: 1_098,
    splitUnionTrials: 20_008, trainTestOverlap: 0,
  });

  const failure = report.failureAnnotations;
  assert.equal(failure.npyFiles, 229);
  assert.equal(failure.dtype, "uint8");
  assert.equal(failure.dimensions, 1);
  assert.equal(failure.totalTemporalLabels, 17_400);
  assert.deepEqual(failure.valueCounts, { 0: 5_430, 1: 8_581, 2: 3_389 });
  assert.deepEqual(Object.fromEntries(Object.entries(failure.tasks)
    .map(([name, value]) => [name, [value.files, value.temporalLabels,
      value.missingIdsWithinPublishedRange]])), {
    place: [45, 4_496, 3], pour: [67, 4_448, 0], push: [31, 1_987, 2],
    put_in: [56, 3_553, 1], put_on: [30, 2_916, 0],
  });
  assert.equal(failure.rowRoot,
    "sha256:4739f7fae9ec6ad93f475483f8a03e0c815c37b714624ce23f5124a8d0383b70");
  assert.deepEqual(failure.temporalCodeMappingFromPinnedInertLoader,
    { act: 1, approach: 0, retract: 2 });
  assert.equal(failure.allNpyPayloadsInertlyParsed, true);
  assert.equal(failure.benchmarkOutcomeLabelsPresent, false);

  assert.equal(report.lineage.codeRepository, "sthoduka/using_task_knowledge");
  assert.equal(report.lineage.codeCommit,
    "8e92c98b677ffdeb48822440dfac856e6b4ec20c");
  assert.equal(report.lineage.codeTree,
    "d7d4da0ec875cc3dfe7819e7509ddded219270b5");
  assert.equal(report.lineage.codeRepositoryLicenseClaim, null);
  assert.equal(report.lineage.paperDoi, "10.1109/ECMR65884.2025.11162998");
  assert.equal(report.lineage.arxivId, "2508.18705v2");
  assert.equal(report.lineage.baseArmbenchPagePinned, false);
  assert.equal(report.lineage.codeBytesExecutedDuringAcquisitionOrReplay, false);

  assert.equal(report.semantics.semanticUnit,
    "PUBLISHER_VIDEO_DEFECT_ANNOTATION");
  assert.equal(report.semantics.correctedLabelsAndAdditionalAnnotations, true);
  assert.equal(report.semantics.sourceNativeTemporalAndObjectAnnotationsReplayed,
    true);
  assert.equal(report.semantics.archiveContainsOriginalVideos, false);
  assert.equal(report.semantics.archiveContainsRobotActionState, false);
  assert.equal(report.semantics.archiveContainsCompleteEpisodes, false);
  assert.equal(report.semantics.labelsAreIndependentlyObservedOutcomes, false);
  assert.equal(report.semantics.annotationsAreExecutionEffects, false);
  assert.equal(report.outcomeBoundary.publisherCorrectedVideoLabels, 1_098);
  assert.equal(report.outcomeBoundary.publisherFramewiseDefectSegmentRows, 3_466);

  assert.equal(report.rightsPrivacyAndUse.rights.officialZenodoLicenseClaim,
    ZENODO_15873769_LICENSE);
  assert.equal(report.rightsPrivacyAndUse.rights.exactClaimAppliesToDepositedRecordFiles,
    true);
  assert.equal(report.rightsPrivacyAndUse.rights.upstreamOriginalVideoRightsEstablishedByThisRecord,
    false);
  assert.equal(report.rightsPrivacyAndUse.rights.authorizedTrainingRows, 0);
  assert.equal(report.rightsPrivacyAndUse.privacy.rawSourcePrivate, true);
  assert.equal(report.rightsPrivacyAndUse.privacy.noPiiGuaranteed, false);
  assert.equal(report.rightsPrivacyAndUse.privacy.originalVisualSourcePrivacyGuaranteed,
    false);
  assert.equal(report.rightsPrivacyAndUse.privacy.rawTrialIdsOrAnnotationsProjectedIntoReport,
    false);
  for (const field of ["originalVideoBytes", "actionStateRows",
    "controlCommandRows", "sensorTelemetryRows", "independentOutcomeRows",
    "physicalEffectRows", "completeEpisodeRows", "retryRows", "recoveryRows",
    "longitudinalRows", "delegationRows", "authorizedTrainingRows",
    "networkAdmissionRows", "actorCreditRows", "ceuRows", "authorityDelta"]) {
    assert.equal(report.zeroClaimBoundary[field], 0, field);
  }
  assert.equal(report.zeroClaimBoundary.autonomousActionAuthorized, false);
  assert.equal(report.artifactHash,
    "sha256:43b3dbe37db9f1c0ffeddf8e66da37b78954b5d2c8de69377146df06fd6a98db");
  assert.equal(receipt.receiptHash,
    "sha256:f1601634aa86f14295149861121269c1361d58c564ea2ab975f69c36335696f6");
});

test("private source retains identity evidence while report redacts IDs and publication is no-clobber", () => {
  assertPrivateTree(ARTIFACT);
  const reportFile = path.join(ARTIFACT, "report.json");
  const receiptFile = path.join(ARTIFACT, "run-receipt.json");
  const inventoryFile = path.join(ARTIFACT,
    "source/source-support/zip-inventory.json");
  const armbenchFile = path.join(ARTIFACT, "source/raw/ARMBench.zip");
  const failureFile = path.join(ARTIFACT, "source/raw/FAILURE.zip");
  const codeFile = path.join(ARTIFACT,
    "source/lineage/code-armbench-dataset.py");
  const reportText = readFileSync(reportFile, "utf8");
  const inventoryText = readFileSync(inventoryFile, "utf8");
  assert.doesNotMatch(reportText, /"\d{21}"/u);
  assert.match(inventoryText, /001001001652206098330/u);
  assert.equal(sha256(armbenchFile),
    "d346ad8fbc925971f479f4a0237be4d7d6f0bcae1ae21ab5c6675014bd361fbc");
  assert.equal(sha256(failureFile),
    "faedcf91cac3da6b67d946165e99d32a07a3e7d5b0c0927e9353f10eec093e25");
  const before = [sha256(reportFile), sha256(receiptFile), sha256(armbenchFile),
    sha256(failureFile), sha256(codeFile)];
  const rawBefore = lstatSync(armbenchFile, { bigint: true });
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-zenodo15873769-armbench-video-defect-annotations.mjs",
      "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  const rawAfter = lstatSync(armbenchFile, { bigint: true });
  assert.deepEqual([sha256(reportFile), sha256(receiptFile), sha256(armbenchFile),
    sha256(failureFile), sha256(codeFile)], before);
  assert.equal(rawAfter.size, rawBefore.size);
  assert.equal(rawAfter.mtimeNs, rawBefore.mtimeNs);
});
