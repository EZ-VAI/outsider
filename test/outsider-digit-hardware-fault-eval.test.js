import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  DIGIT_ARCHIVE_BYTES,
  DIGIT_ARCHIVE_LFS_SHA256,
  DIGIT_ARCHIVE_PATH,
  DIGIT_DATASET_ID,
  DIGIT_DATASET_REVISION,
  DIGIT_REPOSITORY_COMMIT,
  DIGIT_REPOSITORY_TREE,
  DIGIT_REPORT_SCHEMA,
  digitDigest,
  parseDigitCentralDirectory,
  publishDigitHardwareFaultArtifactDirectory,
  verifyDigitHardwareFaultArtifactDirectory,
  verifyDigitHardwareFaultReceipt,
  verifyDigitHardwareFaultReport,
  verifyDigitHardwareFaultReportWithSource,
  verifyDigitHardwareFaultSourceDirectory,
} from "../src/outsider-digit-hardware-fault-eval.js";

const ROOT = path.resolve("artifacts/outsider-digit-hardware-fault-eval-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "report.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");
const PYTHON = "/opt/anaconda3/bin/python";

function reseal(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = digitDigest(changed, `${DIGIT_REPORT_SCHEMA}/artifact`);
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

test("actual bounded source replays the pinned HF archive, signed code support, and nine no-rosbag objects", () => {
  const checked = verifyDigitHardwareFaultSourceDirectory(SOURCE);
  const { manifest, inventory } = checked;
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_BOUNDED_SOURCE_REPLAY");
  assert.equal(manifest.datasetId, DIGIT_DATASET_ID);
  assert.equal(manifest.pinnedRevision, DIGIT_DATASET_REVISION);
  assert.equal(manifest.archive.path, DIGIT_ARCHIVE_PATH);
  assert.equal(manifest.archive.sizeBytes, DIGIT_ARCHIVE_BYTES);
  assert.equal(manifest.archive.lfsSha256, DIGIT_ARCHIVE_LFS_SHA256);
  assert.equal(manifest.archive.fullArchiveDownloaded, false);
  assert.equal(manifest.archive.fullArchiveLfsSha256Recomputed, false);
  assert.equal(manifest.archive.completeCentralDirectoryEnumerated, true);
  assert.equal(manifest.treeBefore.pages, 2);
  assert.equal(manifest.treeBefore.entryCount, 61);
  assert.deepEqual(manifest.treeBefore, manifest.treeAfter);
  assert.equal(manifest.repositorySupport.commit, DIGIT_REPOSITORY_COMMIT);
  assert.equal(manifest.repositorySupport.treeSha, DIGIT_REPOSITORY_TREE);
  assert.equal(manifest.repositorySupport.commitSignatureVerified, true);
  assert.equal(manifest.repositorySupport.codeLicenseClaim, "AGPL-3.0");
  assert.equal(manifest.repositorySupport.codeLicenseDoesNotExtendToDatasetBytes, true);
  assert.equal(manifest.repositorySupport.selectedOfficialLoaderConsumesRealLabels, false);
  assert.equal(manifest.rights.publisherDatasetLicenseClaim, null);
  assert.equal(manifest.rights.status, "FAIL_CLOSED_NO_DATASET_LICENSE");
  assert.equal(manifest.rights.productionTrainingAuthorizedByOutsider, false);
  assert.equal(manifest.sourceSupportObjects.length, 39);
  assert.equal(manifest.selectedObjects.length, 9);
  assert.equal(manifest.manifestHash,
    "sha256:4b0b5f3656b4a258e800bbe3baa85496136afd3917d438197209ca71da472a85");
  assert.equal(checked.manifestFileSha256,
    "sha256:4bc1a4e3dce5d755a1cce9e9bb882dd0c084e283af0795b24f1e924a07960ff9");
  assert.equal(checked.sourceRoot,
    "sha256:3344b649a2b57b6b0fca91a69fccb3085d157ca920c7467e09412f71b7c0a942");
  assert.deepEqual(inventory.counts, {
    centralDirectoryEntries: 11,
    directoryEntries: 1,
    excludedRosbagEntries: 1,
    fileEntries: 10,
    selectedNoRosbagEntries: 9,
  });
  assert.equal(inventory.inventoryHash,
    "sha256:b29d765c71bea837f396fd8598dae39ba46b885f4bbeb40dbf9f731753758319");
  assert.deepEqual(inventory.zip, {
    centralDirectoryBytes: 1133,
    centralDirectoryEntries: 11,
    centralDirectoryOffset: 155939052,
    centralDirectorySha256:
      "sha256:cb8ed4593e0e57074d83d9b562d025fa294ee2ddfc11acf33e514964f1b73e94",
    commentBytes: 0,
    offset: 155940185,
    zip64: false,
  });
  const centralAndEocd = readFileSync(path.join(SOURCE,
    "source-support/archive-central-and-eocd.bin"));
  assert.equal(parseDigitCentralDirectory(centralAndEocd.subarray(0, 1133)).length, 11);
  assert.deepEqual(manifest.selectedObjects.map((item) => ({ feature: item.feature,
    crc32: item.crc32, compressedSize: item.compressedSize,
    uncompressedSize: item.uncompressedSize, rawSha256: item.rawSha256,
    chunks: item.compressedRangeChunks.length })), [
    { feature: "digit_angular_momentum", crc32: "377e3f85", compressedSize: 15340530,
      uncompressedSize: 16209977,
      rawSha256: "sha256:70bf0d5fad3c656ef94185da7fab75ba44f11ab7ddb2cf361b8dbfa2ecd1ceb5",
      chunks: 8 },
    { feature: "digit_command_torque", crc32: "539bd7ee", compressedSize: 13614538,
      uncompressedSize: 36016511,
      rawSha256: "sha256:1d6d1630cf3e1873101afecc7a62b0bd4743e5eedcd4e82abb42c39ec183e759",
      chunks: 7 },
    { feature: "digit_motor_torque_measured", crc32: "01fea03a", compressedSize: 4365656,
      uncompressedSize: 36016511,
      rawSha256: "sha256:506e40679fc7caabb5ac591c3071152b160047d9f42676626e08804625da225a",
      chunks: 3 },
    { feature: "digit_positions", crc32: "ee0f1bd3", compressedSize: 46956850,
      uncompressedSize: 59434758,
      rawSha256: "sha256:e163e54c43d5aa912f3c5f41066230b604a157039b0be6dae3b9964554a2e696",
      chunks: 23 },
    { feature: "digit_q", crc32: "713f08d3", compressedSize: 12105381,
      uncompressedSize: 54023871,
      rawSha256: "sha256:9381b7501be39d27def0fc97c9e4cc68f7808119ce77c894cd11b24a440dcd98",
      chunks: 6 },
    { feature: "digit_qdot", crc32: "076f7ab1", compressedSize: 12803857,
      uncompressedSize: 54023871,
      rawSha256: "sha256:c7af9d6b3e81c9e50108c22408aa1855773e897cb857d19b2b3a49a1adc14ee0",
      chunks: 7 },
    { feature: "digit_time", crc32: "bb70dece", compressedSize: 1311728,
      uncompressedSize: 1802499,
      rawSha256: "sha256:f3fce68a797abae8b97c5db19b3fdecfec6eefc28aa03f1307a9547ff6c4f7b3",
      chunks: 1 },
    { feature: "digit_velocity", crc32: "a87c2df7", compressedSize: 5177174,
      uncompressedSize: 5404093,
      rawSha256: "sha256:7b65df2e77a8fb371cd9ab93f93e8e08be8d4d70b52533f81aa8ba9ed49c758b",
      chunks: 3 },
    { feature: "real_labels", crc32: "f3273133", compressedSize: 545,
      uncompressedSize: 1184,
      rawSha256: "sha256:f4a8cec2c4727658a65aeb313990f503ffa3729651f50a92b8434045e75573d6",
      chunks: 1 },
  ]);
  assertPrivateTree(ROOT);
});

test("restricted NPY replay establishes 14 aligned abrupt numeric-zero traces but no outcome or motor-kill signal", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.artifactHash,
    "sha256:a00ba30a0666663b69e673e99e14e06657ea2971fdc8b7870f251346e73aee1d");
  assert.deepEqual(report.telemetry.parser, {
    engine: "restricted-numpy-pickle-inventory",
    helperSha256: "sha256:dac7f8918bdae4abda4cd96567c4e67885271e939e4d91cc3cb975554d57c5bf",
    maxOutputBytes: 16777216,
    numpyVersion: "1.26.4",
    pythonVersion: "3.12.2",
    timeoutMs: 300000,
  });
  assert.equal(report.denominators.historicalTraces.class,
    "REAL_HARDWARE_ABRUPT_PERTURBATION_TRACE_WITH_PUBLISHER_NUMERIC_LABEL_ZERO");
  assert.equal(report.denominators.historicalTraces.units, 14);
  assert.equal(report.denominators.historicalTraces.numericLabelSemanticMeaning,
    "UNKNOWN_NOT_DEFINED_BY_PINNED_PUBLISHER_MATERIALS");
  assert.equal(report.denominators.historicalTraces.safeTraces, null);
  assert.equal(report.denominators.historicalTraces.unsafeTraces, null);
  assert.equal(report.denominators.historicalTraces.fallTraces, null);
  assert.equal(report.denominators.crossTotal, null);
  assert.equal(report.telemetry.totalNonFiniteCount, 0);
  assert.equal(report.telemetry.motorKillSignalTraceCount, 0);
  assert.deepEqual(report.telemetry.traces.map((trace) => trace.observedRowCount),
    [20166, 13381, 12951, 13761, 15670, 16734, 15697,
      14335, 17646, 15692, 13620, 14668, 21852, 18919]);
  assert.ok(report.telemetry.traces.every((trace) =>
    trace.publisherNumericLabel === 0
      && trace.faultFamilyFromPublisherName === "ABRUPT_FAST"
      && trace.allObservedFeatureLeavesShareFirstAxis === true
      && trace.time.strictlyIncreasing === true
      && trace.time.decreaseCount === 0
      && trace.motorKillSignal.publisherLoaderProbeColumn === 3
      && trace.motorKillSignal.zeroSignalObserved === false));
  assert.equal(report.truthBoundary.safeUnsafeClassificationEstablished, false);
  assert.equal(report.truthBoundary.physicalFallEstablished, false);
  assert.equal(report.truthBoundary.independentOutcomeEstablished, false);
  assert.equal(report.truthBoundary.motorKillSignalIsNotAnOutcomeLabel, true);
  assert.equal(report.segments.effect.motorKillSignalMorphologyObserved, false);
  assert.equal(report.segments.recovery.units, 0);
  assert.equal(report.rights.status, "FAIL_CLOSED_NO_DATASET_LICENSE");
  assert.equal(report.useBoundary.status, "QUARANTINE_EVAL_ONLY");
});

test("report and receipt fully rederive from the private bounded source", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receipt = JSON.parse(readFileSync(RECEIPT));
  assert.equal(verifyDigitHardwareFaultReport(report).ok, true);
  assert.equal(receipt.receiptHash,
    "sha256:9a12da3146bcaff364b65c826571fbb95d7037fad00e011b0fb2e0df00493c38");
  assert.equal(receipt.reportFileSha256,
    "sha256:1f0cca4414ef0390c118c434acd33c44ddc36b6093d452b906b148b133040261");
  assert.equal(verifyDigitHardwareFaultReceipt(receipt, report, reportBytes).ok, true);
  const replay = verifyDigitHardwareFaultReportWithSource(report, SOURCE,
    { pythonExecutable: PYTHON });
  assert.equal(replay.ok, true);
  assert.equal(replay.verificationLevel, "FULL_BOUNDED_SOURCE_REDERIVED");
  const artifact = verifyDigitHardwareFaultArtifactDirectory(ROOT,
    { pythonExecutable: PYTHON });
  assert.equal(artifact.ok, true);
  assert.equal(artifact.verificationLevel, "FULL_BOUNDED_SOURCE_REDERIVED");
  assert.equal(artifact.safeUnsafeClassificationEstablished, false);
  assert.equal(artifact.recoveryEstablished, false);
  assert.equal(artifact.trainingRows, 0);
  assert.equal(artifact.networkAdmissionRows, 0);
  assert.equal(artifact.authorityUnits, 0);
});

test("self-resealing cannot manufacture label meaning, outcome, recovery, rights, training, network, or authority", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const mutations = [
    (copy) => { copy.denominators.historicalTraces.safeTraces = 14; },
    (copy) => { copy.denominators.historicalTraces.numericLabelSemanticMeaning = "SAFE"; },
    (copy) => { copy.denominators.crossTotal = 34; },
    (copy) => { copy.truthBoundary.safeUnsafeClassificationEstablished = true; },
    (copy) => { copy.truthBoundary.independentOutcomeEstablished = true; },
    (copy) => { copy.segments.recovery.units = 1; },
    (copy) => { copy.rights.repositoryCodeLicenseAppliedToDatasetBytes = true; },
    (copy) => { copy.rights.productionTrainingAuthorizedByOutsider = true; },
    (copy) => { copy.privacy.noPiiGuaranteed = true; },
    (copy) => { copy.useBoundary.governedTrainingRows = 14; },
    (copy) => { copy.network.networkAdmissionRows = 14; },
    (copy) => { copy.economics.CEU = 14; },
    (copy) => { copy.authority.executionAuthorityEstablished = true; },
  ];
  for (const mutate of mutations) {
    assert.equal(verifyDigitHardwareFaultReport(reseal(report, mutate)).ok, false);
  }
  const fakeSource = reseal(report,
    (copy) => { copy.source.sourceRoot = `sha256:${"0".repeat(64)}`; });
  assert.equal(verifyDigitHardwareFaultReport(fakeSource).ok, true);
  const sourceRejected = verifyDigitHardwareFaultReportWithSource(fakeSource, SOURCE,
    { pythonExecutable: PYTHON });
  assert.equal(sourceRejected.ok, false);
  assert.match(sourceRejected.error, /FULL_REPLAY_REPORT_MISMATCH/u);
});

test("artifact publication refuses an existing target without clobbering it", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-digit-publish-test-"));
  chmodSync(parent, 0o700);
  const staging = path.join(parent, "staging");
  const occupied = path.join(parent, "occupied");
  mkdirSync(staging, { mode: 0o700 });
  mkdirSync(path.join(staging, "source"), { mode: 0o700 });
  writeFileSync(path.join(staging, "report.json"), "{}\n", { mode: 0o600 });
  writeFileSync(path.join(staging, "run-receipt.json"), "{}\n", { mode: 0o600 });
  mkdirSync(occupied, { mode: 0o700 });
  writeFileSync(path.join(occupied, "sentinel"), "preserve\n", { mode: 0o600 });
  assert.throws(() => publishDigitHardwareFaultArtifactDirectory(staging, occupied),
    /PUBLISH_TARGET_CLAIM_FAILED/u);
  assert.equal(readFileSync(path.join(occupied, "sentinel"), "utf8"), "preserve\n");
  assert.deepEqual(readdirSync(staging).sort(), ["report.json", "run-receipt.json", "source"]);
  rmSync(parent, { recursive: true, force: true });
});
