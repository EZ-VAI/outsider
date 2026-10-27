import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  lstatSync, readFileSync, readdirSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ME_AD_ARCHIVE_BYTES,
  ME_AD_ARCHIVE_MD5,
  ME_AD_DOI,
  ME_AD_PROGRESSIVE_FAULT_CONSTANTS,
  ME_AD_REPORT_SCHEMA,
  buildMeAdProgressiveFaultFromSource,
  meAdSha256,
  verifyMeAdProgressiveFaultArtifactDirectory,
  verifyMeAdProgressiveFaultReport,
  verifyMeAdProgressiveFaultRunReceipt,
  verifyMeAdProgressiveFaultSourceDirectory,
  verifyMeAdProgressiveFaultWithSource,
} from "../src/outsider-me-ad-progressive-fault.js";
import { canonicalizeStrict } from "../src/canonical.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-me-ad-progressive-fault-20260829-v1");
const SOURCE = path.join(ARTIFACT, "source");
const REPORT_PATH = path.join(ARTIFACT, "me-ad-progressive-fault.json");
const RECEIPT_PATH = path.join(ARTIFACT, "run-receipt.json");
const REPORT_BYTES = readFileSync(REPORT_PATH);
const REPORT = JSON.parse(REPORT_BYTES);
const RECEIPT = JSON.parse(readFileSync(RECEIPT_PATH));

function artifactDigest(report) {
  const { artifactHash: ignored, ...body } = report;
  return "sha256:" + createHash("sha256")
    .update(ME_AD_REPORT_SCHEMA + "/artifact\0" + canonicalizeStrict(body))
    .digest("hex");
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

test("ME-AD official archive and ZIP64 closure are exactly pinned", () => {
  assert.equal(ME_AD_DOI, "10.5281/zenodo.20817531");
  assert.equal(ME_AD_ARCHIVE_BYTES, 10_788_420_015);
  assert.equal(ME_AD_ARCHIVE_MD5, "md5:c74dedb954931034d1870db8cd13e33b");
  assert.equal(ME_AD_PROGRESSIVE_FAULT_CONSTANTS.centralOffset, 10_780_812_659);
  assert.equal(ME_AD_PROGRESSIVE_FAULT_CONSTANTS.centralBytes, 7_607_258);
  assert.equal(ME_AD_PROGRESSIVE_FAULT_CONSTANTS.centralEntries, 57_687);
  assert.equal(ME_AD_PROGRESSIVE_FAULT_CONSTANTS.centralFiles, 57_652);
  assert.equal(ME_AD_PROGRESSIVE_FAULT_CONSTANTS.centralDirectories, 35);
  assert.equal(ME_AD_PROGRESSIVE_FAULT_CONSTANTS.rangeChunkBytes, 512 * 1024);
  assert.deepEqual(ME_AD_PROGRESSIVE_FAULT_CONSTANTS.expectedTraceRows,
    [1172, 1172, 1174]);
});

test("stored source fully replays record brackets, central inventory, local headers, CRCs and ranges", () => {
  const checked = verifyMeAdProgressiveFaultSourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_BYTE_REPLAY");
  assert.equal(checked.manifest.manifestHash,
    "sha256:fe3e79914057292b6b005205186b86cce0be27a18b007f10cffe8ae845e9c7b7");
  assert.equal(checked.manifestFileSha256,
    "sha256:fbf39223a0657f8bd057a3c381e13fd6c39f9cca2f3ff5ef41e1697584289361");
  assert.equal(checked.sourceRoot,
    "sha256:5d836eb5f34ba75ced74a0c492200bf1b1239f6ba7ceea48d66c1d4043a577ac");
  assert.equal(checked.inventory.counts.rawCsvCycleTraceFiles, 28_824);
  assert.equal(checked.inventory.counts.processedPklCycleTraceFiles, 28_824);
  assert.equal(checked.inventory.counts.taskDirectoryOrFilesPresent, 0);
  assert.equal(checked.inventory.selectionPolicy.selectedOperationCode, "1100");
  assert.deepEqual(checked.inventory.selectedEntries.map((entry) =>
    entry.cycleOrdinalZeroBased), [0, 965, 1930]);
  assert.equal(checked.selectedCompressedBytes, 352_588);
  assert.equal(checked.selectedRawBytes, 973_886);
});

test("report preserves typed denominator and descriptive mechanical evidence boundary", () => {
  const checked = verifyMeAdProgressiveFaultReport(REPORT);
  assert.deepEqual(checked.errors, []);
  assert.equal(checked.ok, true);
  assert.equal(REPORT.artifactHash,
    "sha256:a86ac56a64c75cd9f26cd4d45b647e40ad5691a60a49d21556f307e8a902583a");
  assert.equal(meAdSha256(REPORT_BYTES),
    "sha256:c90c399c655fbe57ed81bc7294a9ad151118fa2873d5c8c0021eb5887769c502");
  assert.equal(REPORT.sourceReplay.contentReplayHash,
    "sha256:72e4201cfef67ef7c4f8957c4e52702820392c28dd13dd4565657d82fe99f50e");
  assert.equal(REPORT.sourceReplay.selectedRawRows, 3518);
  assert.equal(REPORT.sourceReplay.selectedRawNumericValues, 126_648);
  assert.equal(REPORT.denominatorRegistry.populations[0].units, 3);
  assert.equal(REPORT.denominatorRegistry.crossDomainTotal, null);
  assert.equal(REPORT.denominatorRegistry.crossDomainAdditionProhibited, true);
  assert.equal(REPORT.denominatorRegistry.uniquePhysicalCycleCountEstablished, null);
  assert.equal(REPORT.temporalConditionEvidence.labelsAreIndependentGroundTruth, false);
  assert.equal(REPORT.temporalConditionEvidence.observedJointThreeTelemetry
    .motorTorqueJoint3RmsEarly, 192.258101465881);
  assert.equal(REPORT.temporalConditionEvidence.observedJointThreeTelemetry
    .motorTorqueJoint3RmsLate, 217.059231619529);
  assert.equal(REPORT.temporalConditionEvidence.observedJointThreeTelemetry
    .monotonicDegradationEstablished, false);
});

test("full source replay exactly rebuilds the report", () => {
  const rebuilt = buildMeAdProgressiveFaultFromSource(SOURCE);
  assert.deepEqual(rebuilt, REPORT);
  const checked = verifyMeAdProgressiveFaultWithSource(REPORT, SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_REDERIVED");
});

test("rights ambiguity and all authority/training/outcome closures remain explicit zeros", () => {
  assert.equal(REPORT.rightsAndUseClearance.zenodoOfficialRecordLicenseClaim,
    "CC-BY-SA-4.0");
  assert.equal(REPORT.rightsAndUseClearance.archiveReadmeLicenseTextIsPlaceholder, true);
  assert.equal(REPORT.rightsAndUseClearance.sourcePythonFilesWithConfidentialHeader, 3);
  assert.equal(REPORT.rightsAndUseClearance.rightsNoticeConsistencyEstablished, false);
  assert.equal(REPORT.rightsAndUseClearance.legalConclusion, false);
  assert.equal(REPORT.modelAndTrainingBoundary.authorizedTrainingRows, 0);
  assert.equal(REPORT.modelAndTrainingBoundary.authorizedTrainingPerformed, false);
  assert.equal(REPORT.segmentCoverageAttribution.outcome.independentOutcomeRecords, 0);
  assert.equal(REPORT.segmentCoverageAttribution.recovery.independentRecoveryChains, 0);
  assert.equal(REPORT.segmentCoverageAttribution.delegationAuthorization.authorityRecords, 0);
  assert.equal(REPORT.authorityBoundary.authorityDelta, 0);
  assert.equal(REPORT.selectionAndScope.globalExhaustion, false);
});

test("receipt is final, self-bound and all artifact permissions are private", () => {
  const receiptCheck = verifyMeAdProgressiveFaultRunReceipt(RECEIPT, REPORT_BYTES);
  assert.equal(receiptCheck.ok, true);
  assert.equal(RECEIPT.receiptHash,
    "sha256:5fc70ef1b03a9e73f40466e676e62ea06c909e1e12601bc88024a519d585ee1a");
  assert.equal(RECEIPT.publication.receiptWrittenLast, true);
  assert.equal(RECEIPT.publication.noClobber, true);
  const tree = visit(ARTIFACT);
  assert.equal(tree.directories.length, 4);
  assert.equal(tree.files.length, 36);
  assert.equal(tree.directories.every((entry) => entry.mode === 0o700), true);
  assert.equal(tree.files.every((entry) => entry.mode === 0o600), true);
  const directoryCheck = verifyMeAdProgressiveFaultArtifactDirectory(ARTIFACT);
  assert.equal(directoryCheck.ok, true);
  assert.equal(directoryCheck.verificationLevel, "FULL_SOURCE_REDERIVED");
});

test("self-sealed scope and training inflations fail even after rehashing", () => {
  const scopeTamper = structuredClone(REPORT);
  scopeTamper.selectionAndScope.globalExhaustion = true;
  scopeTamper.artifactHash = artifactDigest(scopeTamper);
  assert.equal(verifyMeAdProgressiveFaultReport(scopeTamper).ok, false);
  assert.ok(verifyMeAdProgressiveFaultReport(scopeTamper).errors.includes("SCOPE_BOUNDARY"));

  const trainingTamper = structuredClone(REPORT);
  trainingTamper.modelAndTrainingBoundary.authorizedTraining = true;
  trainingTamper.modelAndTrainingBoundary.authorizedTrainingRows = 3518;
  trainingTamper.artifactHash = artifactDigest(trainingTamper);
  const checked = verifyMeAdProgressiveFaultReport(trainingTamper);
  assert.equal(checked.ok, false);
  assert.ok(checked.errors.includes("TRAINING_BOUNDARY"));
});
