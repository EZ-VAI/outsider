import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AIRLAB_ARCHIVE_BYTES,
  AIRLAB_ARCHIVE_ETAG,
  AIRLAB_ARCHIVE_LAST_MODIFIED,
  AIRLAB_ARCHIVE_URL,
  AIRLAB_REPOSITORY,
  AIRLAB_REPOSITORY_COMMIT,
  AIRLAB_REPORT_SCHEMA,
  airlabDigest,
  parseAirlabCentralDirectory,
  publishAirlabFailureArtifactDirectory,
  verifyAirlabFailureArtifactDirectory,
  verifyAirlabFailureReceipt,
  verifyAirlabFailureReport,
  verifyAirlabFailureReportWithSource,
  verifyAirlabFailureSourceDirectory,
} from "../src/outsider-airlab-failure-bounded-pair.js";

const ROOT = path.resolve(
  "artifacts/outsider-airlab-failure-bounded-pair-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "report.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");

function reseal(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = airlabDigest(changed, `${AIRLAB_REPORT_SCHEMA}/artifact`);
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

test("actual bounded source freezes the public ZIP64 inventory and the exact 236-file pair", () => {
  const checked = verifyAirlabFailureSourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_BOUNDED_SOURCE_REPLAY");
  const { manifest, inventory } = checked;
  assert.equal(manifest.repositorySupport.repository, AIRLAB_REPOSITORY);
  assert.equal(manifest.repositorySupport.pinnedCommit, AIRLAB_REPOSITORY_COMMIT);
  assert.equal(manifest.repositorySupport.repositoryCodeLicenseClaim, "MIT");
  assert.equal(manifest.repositorySupport.repositoryCodeLicenseDoesNotExtendToDatasetBytes, true);
  assert.equal(manifest.repositorySupport.annotationRows, 252);
  assert.deepEqual(manifest.repositorySupport.annotationColumns, ["name", "label"]);
  assert.equal(manifest.archive.url, AIRLAB_ARCHIVE_URL);
  assert.equal(manifest.archive.sizeBytes, AIRLAB_ARCHIVE_BYTES);
  assert.equal(manifest.archive.etag, AIRLAB_ARCHIVE_ETAG);
  assert.equal(manifest.archive.lastModified, AIRLAB_ARCHIVE_LAST_MODIFIED);
  assert.equal(manifest.archive.plainHttpTransport, true);
  assert.equal(manifest.archive.providerIdentityCryptographicallyVerified, false);
  assert.equal(manifest.archive.transportIntegrityCryptographicallyVerified, false);
  assert.equal(manifest.archive.fullArchiveDownloaded, false);
  assert.equal(manifest.archive.completeCentralDirectoryEnumerated, true);
  assert.equal(manifest.manifestHash,
    "sha256:7a8d99b20f3611f6d256e14e05c3497f9be3ad0846d06f93f651a383d5e713c5");
  assert.equal(checked.manifestFileSha256,
    "sha256:1efddedfa5f47f378d8e72a780d19c92dd65e3de16fad565827d634303eee505");
  assert.equal(checked.sourceRoot,
    "sha256:41a1b793630e2456b60392af7463533185188250b6a39554c7bc46b84c989b14");
  assert.equal(manifest.archive.inventoryHash,
    "sha256:5013a57df88178968bafec24cff35500745f82e77493eccbe17d03a686b5eaa5");
  assert.equal(manifest.archive.inventoryFileSha256,
    "sha256:8e4bdb5a63b42950f98c8baf27b5c7f3ba3b3069440f1130942e156abf369530");
  assert.equal(manifest.sourceSupportObjects.length, 12);
  assert.equal(manifest.rangeObjects.length, 6);
  assert.equal(manifest.selectedObjects.length, 236);
  assert.equal(manifest.selectedObjects.filter((item) => item.internalPath.endsWith(".png")).length,
    78);
  assert.equal(manifest.selectedObjects.filter((item) => item.internalPath.endsWith(".txt")).length,
    78);
  assert.equal(manifest.selectedObjects.filter((item) => item.internalPath.endsWith(".tiff")).length,
    78);
  assert.equal(manifest.selectedObjects.filter((item) => item.internalPath.endsWith(".wav")).length,
    2);
  assert.equal(manifest.selectedObjects.every((item) =>
    item.dataDescriptorPresent === false && item.dataDescriptorBytes === 0), true);
  assert.deepEqual(inventory.counts, {
    centralDirectoryEntries: 53165,
    fileEntries: 52685,
    directoryEntries: 480,
    png: 17400,
    txt: 17400,
    tiff: 17654,
    wav: 231,
    publicAnnotationRows: 252,
    completeExactJoinedRecordings: 229,
    selectedFiles: 236,
    selectedCompressedBytes: 46704177,
    selectedUncompressedBytes: 93021329,
  });
  assert.deepEqual(inventory.zip, {
    zip64: true,
    eocdOffset: 10197520353,
    zip64EocdOffset: 10197520277,
    centralDirectoryOffset: 10190743464,
    centralDirectoryBytes: 6776813,
    centralDirectoryEntries: 53165,
    archiveCommentBytes: 0,
    centralDirectorySha256: inventory.zip.centralDirectorySha256,
  });
  assert.match(inventory.zip.centralDirectorySha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(inventory.zip.centralDirectorySha256,
    "sha256:d10ece47eb3c4fcd174a9e7691783ce39681143603ebc1e9983ed0411b9b19dd");
  const central = readFileSync(path.join(SOURCE,
    "source-support/archive-central-directory.bin"));
  assert.equal(parseAirlabCentralDirectory(central).length, 53165);
  assert.equal(manifest.rights.status, "FAIL_CLOSED_NO_DATASET_LICENSE");
  assert.equal(manifest.rights.productionTrainingAuthorizedByOutsider, false);
  assert.equal(manifest.privacy.noPiiGuaranteed, false);
  assertPrivateTree(ROOT);
});

test("replay preserves one publisher success and one publisher failure without inventing outcomes", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.artifactHash,
    "sha256:553076ed0ce5fa1665f296eaebf94c2d8a690234ae401a87ad5344af89249f09");
  assert.equal(report.denominators.completeArchiveInventory.units, 53165);
  assert.equal(report.denominators.publisherAnnotationRows.units, 252);
  assert.equal(report.denominators.publisherAnnotationRows.completeExactMultimodalJoins, 229);
  assert.equal(report.denominators.boundedExecutions.units, 2);
  assert.equal(report.denominators.boundedExecutions.publisherSuccessLabel0Units, 1);
  assert.equal(report.denominators.boundedExecutions.publisherFailureLabel1Units, 1);
  assert.equal(report.denominators.paperExtendedDatasetCensus.units, null);
  assert.equal(report.denominators.crossTotal, null);
  assert.deepEqual(report.observations.executions.map((item) => ({
    recordingId: item.recordingId,
    publisherBinaryLabel: item.publisherBinaryLabel,
    publisherLabelMeaning: item.publisherLabelMeaning,
    frames: item.frames.units,
    exactStemJoin: item.frames.exactRgbTimestampDepthStemJoin,
    timestampsIncrease: item.timestampText.strictlyIncreasing,
  })), [
    { recordingId: 49, publisherBinaryLabel: 1, publisherLabelMeaning: "FAILURE",
      frames: 39, exactStemJoin: true, timestampsIncrease: true },
    { recordingId: 50, publisherBinaryLabel: 0, publisherLabelMeaning: "SUCCESS",
      frames: 39, exactStemJoin: true, timestampsIncrease: true },
  ]);
  assert.deepEqual(report.observations.executions.map((item) => ({
    recordingId: item.recordingId,
    rgb: item.frames.rgbProfile,
    depth: item.frames.depthProfile,
    audio: item.audio,
    selectedRawBytes: item.selectedRawBytes,
  })), [
    { recordingId: 49,
      rgb: { bitDepth: 8, colorType: 2, compressionMethod: 0, filterMethod: 0,
        height: 480, interlaceMethod: 0, width: 640 },
      depth: { byteOrder: "II", height: 480, ifdEntryCount: 9, width: 640 },
      audio: { audioFormat: 1, bitsPerSample: 16, blockAlign: 2, byteRate: 32000,
        channels: 1, dataBytes: 3037440, durationSeconds: 94.92, sampleRateHz: 16000 },
      selectedRawBytes: 46778777 },
    { recordingId: 50,
      rgb: { bitDepth: 8, colorType: 2, compressionMethod: 0, filterMethod: 0,
        height: 480, interlaceMethod: 0, width: 640 },
      depth: { byteOrder: "II", height: 480, ifdEntryCount: 9, width: 640 },
      audio: { audioFormat: 1, bitsPerSample: 16, blockAlign: 2, byteRate: 32000,
        channels: 1, dataBytes: 3016000, durationSeconds: 94.25, sampleRateHz: 16000 },
      selectedRawBytes: 46242552 },
  ]);
  assert.equal(report.observations.actionOrRobotStateTracePresent, false);
  assert.equal(report.observations.failureTypeAnnotationPresent, false);
  assert.equal(report.observations.failureStartTimestampAnnotationPresent, false);
  assert.equal(report.truthBoundary.taskOutcomeEstablishedOnlyAsPublisherLabel, true);
  assert.equal(report.truthBoundary.independentOutcomeEstablished, false);
  assert.equal(report.truthBoundary.physicalEffectIndependentlyReplayed, false);
  assert.equal(report.truthBoundary.attemptCensusEstablished, false);
  assert.equal(report.truthBoundary.recoveryEstablished, false);
  assert.equal(report.segments.outcome.publisherBinaryLabelUnits, 2);
  assert.equal(report.segments.outcome.independentUnits, 0);
  assert.equal(report.segments.recovery.units, 0);
  assert.equal(report.rights.status, "FAIL_CLOSED_NO_DATASET_LICENSE");
  assert.equal(report.useBoundary.status, "QUARANTINE_EVAL_ONLY");
});

test("report and receipt fully rederive from the private bounded source", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receipt = JSON.parse(readFileSync(RECEIPT));
  assert.equal(receipt.receiptHash,
    "sha256:a0bcfc2155dc18c0b6f784798735580fa4605bb377d528bf74983fd46701b12f");
  assert.equal(receipt.reportFileSha256,
    "sha256:d717520ec5dccdfc561290287124e791e450c37221e2091a81030e67aa015642");
  assert.equal(verifyAirlabFailureReport(report).ok, true);
  assert.equal(verifyAirlabFailureReceipt(receipt, report, reportBytes).ok, true);
  const replay = verifyAirlabFailureReportWithSource(report, SOURCE);
  assert.equal(replay.ok, true);
  assert.equal(replay.verificationLevel, "FULL_BOUNDED_SOURCE_REDERIVED");
  const artifact = verifyAirlabFailureArtifactDirectory(ROOT);
  assert.equal(artifact.ok, true);
  assert.equal(artifact.verificationLevel, "FULL_BOUNDED_SOURCE_REDERIVED");
  assert.equal(artifact.independentOutcomeUnits, 0);
  assert.equal(artifact.recoveryUnits, 0);
  assert.equal(artifact.governedTrainingRows, 0);
  assert.equal(artifact.networkAdmissionRows, 0);
  assert.equal(artifact.authorityUnits, 0);
});

test("self-resealing cannot manufacture trusted transport, rights, outcomes, recovery, or authority", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const mutations = [
    (copy) => { copy.source.providerIdentityCryptographicallyVerified = true; },
    (copy) => { copy.source.transportIntegrityCryptographicallyVerified = true; },
    (copy) => { copy.denominators.paperExtendedDatasetCensus.units = 324; },
    (copy) => { copy.denominators.crossTotal = 53324; },
    (copy) => { copy.truthBoundary.independentOutcomeEstablished = true; },
    (copy) => { copy.truthBoundary.failureTypeEstablished = true; },
    (copy) => { copy.truthBoundary.actionOrRobotStateTraceEstablished = true; },
    (copy) => { copy.truthBoundary.recoveryEstablished = true; },
    (copy) => { copy.segments.outcome.independentUnits = 2; },
    (copy) => { copy.segments.recovery.units = 1; },
    (copy) => { copy.rights.repositoryMitLicenseAppliedToDatasetBytes = true; },
    (copy) => { copy.rights.productionTrainingAuthorizedByOutsider = true; },
    (copy) => { copy.privacy.noPiiGuaranteed = true; },
    (copy) => { copy.useBoundary.governedTrainingRows = 2; },
    (copy) => { copy.network.networkAdmissionRows = 2; },
    (copy) => { copy.economics.CEU = 2; },
    (copy) => { copy.authority.executionAuthorityEstablished = true; },
  ];
  for (const mutate of mutations) {
    assert.equal(verifyAirlabFailureReport(reseal(report, mutate)).ok, false);
  }
  const fakeSource = reseal(report,
    (copy) => { copy.source.sourceRoot = `sha256:${"0".repeat(64)}`; });
  assert.equal(verifyAirlabFailureReport(fakeSource).ok, true);
  assert.equal(verifyAirlabFailureReportWithSource(fakeSource, SOURCE).ok, false);
});

test("artifact publication refuses an occupied target without clobbering it", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-airlab-publish-test-"));
  chmodSync(parent, 0o700);
  const staging = path.join(parent, "staging");
  const occupied = path.join(parent, "occupied");
  mkdirSync(staging, { mode: 0o700 });
  mkdirSync(path.join(staging, "source"), { mode: 0o700 });
  writeFileSync(path.join(staging, "report.json"), "{}\n", { mode: 0o600 });
  writeFileSync(path.join(staging, "run-receipt.json"), "{}\n", { mode: 0o600 });
  mkdirSync(occupied, { mode: 0o700 });
  writeFileSync(path.join(occupied, "sentinel"), "preserve\n", { mode: 0o600 });
  assert.throws(() => publishAirlabFailureArtifactDirectory(staging, occupied),
    /PUBLISH_TARGET_EXISTS_OR_BROAD/u);
  assert.equal(readFileSync(path.join(occupied, "sentinel"), "utf8"), "preserve\n");
  assert.deepEqual(sorted(readdirSync(staging)), ["report.json", "run-receipt.json", "source"]);
  rmSync(parent, { recursive: true, force: true });
});

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}
