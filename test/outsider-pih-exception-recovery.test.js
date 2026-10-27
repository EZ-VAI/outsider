import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  PIH_ARCHIVE_BYTES,
  PIH_ARCHIVE_MD5,
  PIH_CORRECTION_INTERNAL_PATH,
  PIH_DOI,
  PIH_ERROR_INTERNAL_PATH,
  PIH_LICENSE,
  PIH_RECORD_ID,
  PIH_REPORT_SCHEMA,
  parsePihCentralDirectory,
  pihDigest,
  publishPihExceptionRecoveryArtifactDirectory,
  verifyPihExceptionRecoveryArtifactDirectory,
  verifyPihExceptionRecoveryReceipt,
  verifyPihExceptionRecoveryReport,
  verifyPihExceptionRecoveryReportWithSource,
  verifyPihExceptionRecoverySourceDirectory,
} from "../src/outsider-pih-exception-recovery.js";

const ROOT = path.resolve("artifacts/outsider-pih-exception-recovery-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "report.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");
const PYTHON = "/opt/anaconda3/bin/python";
const TOP_LEVEL_KEYS = ["ATIFT", "ATIFTS", "CameraRate", "Camera_i", "FT", "R",
  "R_ref", "cameraData", "cameraDepth", "dt", "gripper", "i", "j", "mode", "p",
  "p_ref", "q", "q_ref", "qdot", "qdot_ref", "t", "tic", "tic0", "trq",
  "trqExt", "trun", "user", "v", "v_ref", "x", "x_ref"];

function reseal(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = pihDigest(changed, `${PIH_REPORT_SCHEMA}/artifact`);
  return changed;
}

function assertPrivateTree(root) {
  const visit = (directory) => {
    const directoryStat = lstatSync(directory);
    assert.equal(directoryStat.isSymbolicLink(), false, directory);
    assert.equal(directoryStat.isDirectory(), true, directory);
    assert.equal(directoryStat.mode & 0o777, 0o700, directory);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      const stat = lstatSync(target);
      assert.equal(stat.isSymbolicLink(), false, target);
      if (stat.isDirectory()) visit(target);
      else {
        assert.equal(stat.isFile(), true, target);
        assert.equal(stat.mode & 0o777, 0o600, target);
      }
    }
  };
  visit(root);
}

function variable(mat, name) {
  const found = mat.topLevelVariables.find((entry) => entry.name === name);
  assert.ok(found, `${mat.role}:${name}`);
  return found;
}

test("actual private source replays the official record, complete ZIP64 inventory, and two strict ranges", () => {
  const checked = verifyPihExceptionRecoverySourceDirectory(SOURCE);
  const { manifest, inventory } = checked;
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_BOUNDED_SOURCE_REPLAY");
  assert.equal(manifest.recordBefore.recordId, PIH_RECORD_ID);
  assert.equal(manifest.recordBefore.doi, PIH_DOI);
  assert.equal(manifest.recordBefore.licenseClaim, PIH_LICENSE);
  assert.equal(manifest.recordBefore.recordRevision, 2);
  assert.equal(manifest.recordBefore.archive.sizeBytes, PIH_ARCHIVE_BYTES);
  assert.equal(manifest.recordBefore.archive.checksumClaim, PIH_ARCHIVE_MD5);
  assert.deepEqual(manifest.recordBefore, manifest.recordAfter);
  assert.equal(manifest.archive.fullArchiveDownloaded, false);
  assert.equal(manifest.archive.fullArchiveMd5Recomputed, false);
  assert.equal(manifest.archive.inventoryFileSha256,
    "sha256:a9eb31e2bee2adcb33bf6649c05e7445fcdc58fefe95791a54afaf9c1aa4546c");
  assert.equal(manifest.manifestHash,
    "sha256:9d1c4dfaf654a807ab93146d38009399954759928ef751ded7dbcaae685b5d0f");
  assert.equal(checked.manifestFileSha256,
    "sha256:afb0ef99bae1229a97ee0e17e5a71eb9887b4bc56a3a975467099ca58fc37cf9");
  assert.equal(checked.sourceRoot,
    "sha256:64da4635806115fa26b53e6bd5f09bda0e96d84508a93e20c7977252bd092467");
  assert.deepEqual(inventory.counts, {
    centralDirectoryEntries: 164,
    correctionTrajectoryEntries: 110,
    directoryEntries: 42,
    errorTrajectoryEntries: 11,
    fileEntries: 122,
    otherFileEntries: 0,
    readmeEntries: 1,
  });
  assert.equal(inventory.inventoryHash,
    "sha256:abe9a796659bd98d251ea43f75425f6106ed4bc74d80aa68851100c4b58b2ee8");
  assert.deepEqual(inventory.zip, {
    archiveCommentBytes: 0,
    centralDirectoryBytes: 34_640,
    centralDirectoryEntries: 164,
    centralDirectoryOffset: 7_937_395_054,
    centralDirectorySha256:
      "sha256:14629d7bab3677006f03ca130b4752cbe97df1faf8a848ac0176182224b5be02",
    eocdOffset: 7_937_429_770,
    zip64: true,
    zip64EocdOffset: 7_937_429_694,
  });
  const central = readFileSync(path.join(SOURCE, "source-support/central-directory.bin"));
  assert.equal(parsePihCentralDirectory(central, 164).length, 164);
  assert.equal(manifest.sourceSupportObjects.length, 11);
  assert.equal(manifest.selection.selectedCompressedBytes, 128_348_850);
  assert.equal(manifest.selection.selectedUncompressedBytes, 129_225_375);
  const [correction, error] = manifest.selectedObjects;
  assert.deepEqual({ role: correction.role, path: correction.internalPath,
    crc32: correction.crc32, compressedSize: correction.compressedSize,
    uncompressedSize: correction.uncompressedSize, chunks: correction.compressedRangeChunks.length,
    raw: correction.rawMatSha256 }, {
    role: "CORRECTION", path: PIH_CORRECTION_INTERNAL_PATH, crc32: "b8c1daa1",
    compressedSize: 67_133_847, uncompressedSize: 67_611_069, chunks: 33,
    raw: "sha256:8a2f93dc4b8ec908bd505609b5dfe4c58de3a8e2523f0188131573bd7e2e1455",
  });
  assert.deepEqual({ role: error.role, path: error.internalPath,
    crc32: error.crc32, compressedSize: error.compressedSize,
    uncompressedSize: error.uncompressedSize, chunks: error.compressedRangeChunks.length,
    raw: error.rawMatSha256 }, {
    role: "ERROR", path: PIH_ERROR_INTERNAL_PATH, crc32: "5448ed64",
    compressedSize: 61_215_003, uncompressedSize: 61_614_306, chunks: 30,
    raw: "sha256:4963cfbfb307919c786525e04899b1426850bb15deae0817935534645cd43372",
  });
  for (const selected of manifest.selectedObjects) {
    assert.equal(selected.compressionMethod, 8);
    assert.equal(selected.dataDescriptorPresent, false);
    assert.ok(selected.compressedRangeChunks.every((chunk) =>
      chunk.contentRange === `bytes ${chunk.start}-${chunk.end}/${PIH_ARCHIVE_BYTES}`
        && chunk.end - chunk.start + 1 === chunk.sizeBytes
        && chunk.sizeBytes <= 2 * 1024 * 1024));
  }
  assertPrivateTree(ROOT);
});

test("the bounded pair preserves exact flat MAT variables and unequal sample axes without inventing a states struct", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.artifactHash,
    "sha256:a1fe48409f47670deaed3a06b9517daa6aebb3e4503a3f1989452c92117745d5");
  assert.equal(report.denominators.archiveInventory.units, 164);
  assert.equal(report.denominators.boundedPair.class,
    "ERROR_AND_HUMAN_CORRECTION_MORPHOLOGY_PAIR");
  assert.equal(report.denominators.boundedPair.units, 1);
  assert.equal(report.denominators.boundedPair.selectedUncompressedBytes, 129_225_375);
  assert.equal(report.denominators.crossDenominatorAdditionPermitted, false);
  assert.equal(report.denominators.crossTotal, null);
  assert.equal(report.completeness.selectedConditionCorrectionCandidatesInArchive, 10);
  const error = report.boundedPair.error.mat;
  const correction = report.boundedPair.correction.mat;
  for (const mat of [error, correction]) {
    assert.equal(mat.format, "MATLAB_LEVEL_5");
    assert.equal(mat.statesPresent, false);
    assert.equal(mat.statesVariableName, null);
    assert.deepEqual(mat.topLevelKeys, TOP_LEVEL_KEYS);
    assert.deepEqual(mat.objectCounts, { SCIPY_ARRAY: 31 });
    assert.equal(mat.allObjectMetadataAggregatedWithoutDroppingUnknownSchemas, true);
  }
  assert.deepEqual(variable(error, "t").axisLengths, [302, 1]);
  assert.deepEqual(variable(correction, "t").axisLengths, [311, 1]);
  assert.deepEqual(variable(error, "p").axisLengths, [302, 3]);
  assert.deepEqual(variable(correction, "p").axisLengths, [311, 3]);
  assert.deepEqual(variable(error, "R").axisLengths, [3, 3, 302]);
  assert.deepEqual(variable(correction, "R").axisLengths, [3, 3, 311]);
  assert.deepEqual(variable(error, "x").axisLengths, [302, 7]);
  assert.deepEqual(variable(correction, "x").axisLengths, [311, 7]);
  assert.deepEqual(variable(error, "FT").axisLengths, [302, 6]);
  assert.deepEqual(variable(correction, "FT").axisLengths, [311, 6]);
  assert.deepEqual(variable(error, "ATIFT").axisLengths, [250, 6]);
  assert.deepEqual(variable(correction, "ATIFT").axisLengths, [250, 6]);
  assert.deepEqual(variable(error, "cameraData").axisLengths, [31, 921_600]);
  assert.deepEqual(variable(correction, "cameraData").axisLengths, [32, 921_600]);
  assert.deepEqual(variable(error, "cameraDepth").axisLengths, [31, 9_830_400]);
  assert.deepEqual(variable(correction, "cameraDepth").axisLengths, [31, 9_830_400]);
  assert.equal(report.modalities.sampleCountsAuthority,
    "MAT_AXIS_LENGTHS_AND_REFERENCE_COUNTS_ONLY_NO_UNDECLARED_TIME_AXIS_INFERENCE");
  assert.equal(report.modalities.observedMatTopology.errorCorrectionSchemaIsomorphismRequired,
    false);
  assert.equal(report.modalities.observedMatTopology
    .publisherStatesStructureClaimTreatedAsClaimNotParserPrecondition, true);
  assert.deepEqual(report.modalities.parser, {
    h5pyVersion: "3.11.0",
    helperSha256: "sha256:8b4adee759437f20093f79135ef963b7cb041b13a0dfe744b0b86c82f97ab4fe",
    maxOutputBytes: 16_777_216,
    numpyVersion: "1.26.4",
    pythonVersion: "3.12.2",
    scipyVersion: "1.13.1",
    timeoutMs: 180_000,
  });
});

test("published report and receipt fully rederive from the private source", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receipt = JSON.parse(readFileSync(RECEIPT));
  assert.equal(verifyPihExceptionRecoveryReport(report).ok, true);
  assert.equal(receipt.receiptHash,
    "sha256:c64edf910339de32b83909fe845b4e23c925bb3d50bcf335ae46341cdfca8304");
  assert.equal(receipt.reportFileSha256,
    "sha256:358bc696a1ceae275cc25362c1d4512922a5c1a6a861aefe150ed592a2aad99d");
  assert.equal(verifyPihExceptionRecoveryReceipt(receipt, report, reportBytes).ok, true);
  const checked = verifyPihExceptionRecoveryArtifactDirectory(ROOT,
    { pythonExecutable: PYTHON });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_BOUNDED_SOURCE_REDERIVED");
  assert.equal(checked.archiveInventoryEntries, 164);
  assert.equal(checked.morphologyPairs, 1);
  assert.equal(checked.correctionSuccessEstablished, false);
  assert.equal(checked.independentOutcomeEstablished, false);
  assert.equal(checked.authorityEstablished, false);
});

test("self-resealing cannot create recovery truth, a cross-total, training, network, CEU, or authority", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const mutations = [
    (copy) => { copy.denominators.crossTotal = 165; },
    (copy) => { copy.denominators.successfulCorrectionEpisodes = 1; },
    (copy) => { copy.boundedPair.correctionSuccessEstablished = true; },
    (copy) => { copy.boundedPair.independentOutcomeEstablished = true; },
    (copy) => { copy.completeness.completeAttemptCensusEstablished = true; },
    (copy) => { copy.privacy.noPiiGuaranteed = true; },
    (copy) => { copy.useBoundary.trainingAuthorizedByArtifact = true; },
    (copy) => { copy.network.networkAdmissionRows = 1; },
    (copy) => { copy.economics.CEU = 1; },
    (copy) => { copy.authority.executionAuthorityEstablished = true; },
  ];
  for (const mutate of mutations) {
    assert.equal(verifyPihExceptionRecoveryReport(reseal(report, mutate)).ok, false);
  }
  const fakeRoot = reseal(report,
    (copy) => { copy.source.sourceRoot = `sha256:${"0".repeat(64)}`; });
  assert.equal(verifyPihExceptionRecoveryReport(fakeRoot).ok, true);
  const sourceRejected = verifyPihExceptionRecoveryReportWithSource(fakeRoot, SOURCE,
    { pythonExecutable: PYTHON });
  assert.equal(sourceRejected.ok, false);
  assert.match(sourceRejected.error, /FULL_REPLAY_SOURCE_IDENTITY_MISMATCH/u);
});

test("artifact publication refuses an existing target without clobbering it", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-pih-publish-test-"));
  chmodSync(parent, 0o700);
  const staging = path.join(parent, "staging");
  const occupied = path.join(parent, "occupied");
  mkdirSync(staging, { mode: 0o700 });
  mkdirSync(path.join(staging, "source"), { mode: 0o700 });
  writeFileSync(path.join(staging, "report.json"), "{}\n", { mode: 0o600 });
  writeFileSync(path.join(staging, "run-receipt.json"), "{}\n", { mode: 0o600 });
  mkdirSync(occupied, { mode: 0o700 });
  writeFileSync(path.join(occupied, "sentinel"), "preserve\n", { mode: 0o600 });
  assert.throws(() => publishPihExceptionRecoveryArtifactDirectory(staging, occupied),
    /PUBLISH_TARGET_CLAIM_FAILED/u);
  assert.equal(readFileSync(path.join(occupied, "sentinel"), "utf8"), "preserve\n");
  assert.deepEqual(readdirSync(staging).sort(), ["report.json", "run-receipt.json", "source"]);
  rmSync(parent, { recursive: true, force: true });
});
