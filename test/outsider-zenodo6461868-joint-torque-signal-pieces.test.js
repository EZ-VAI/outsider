import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  ZENODO_6461868_CONSTANTS,
  ZENODO_6461868_DOI,
  ZENODO_6461868_REPORT_SCHEMA,
  buildZenodo6461868JointTorqueSignalPiecesFromSource,
  verifyZenodo6461868JointTorqueArtifactDirectory,
  verifyZenodo6461868JointTorqueRunReceipt,
  verifyZenodo6461868JointTorqueSignalPiecesReport,
  verifyZenodo6461868JointTorqueSignalPiecesWithSource,
  verifyZenodo6461868SourceDirectory,
  zenodo6461868Sha256,
} from "../src/outsider-zenodo6461868-joint-torque-signal-pieces.js";
import { canonicalizeStrict } from "../src/canonical.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-zenodo6461868-joint-torque-signal-pieces-20260829-v1");
const SOURCE = path.join(ARTIFACT, "source");
const REPORT_BYTES = readFileSync(path.join(ARTIFACT,
  "zenodo6461868-joint-torque-signal-pieces.json"));
const REPORT = JSON.parse(REPORT_BYTES);
const RECEIPT_BYTES = readFileSync(path.join(ARTIFACT, "run-receipt.json"));
const RECEIPT = JSON.parse(RECEIPT_BYTES);

function artifactDigest(report) {
  const { artifactHash: ignored, ...body } = report;
  return `sha256:${createHash("sha256")
    .update(`${ZENODO_6461868_REPORT_SCHEMA}/artifact\0${canonicalizeStrict(body)}`)
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

test("official revision-six record and all 22 remote objects are exactly pinned", () => {
  assert.equal(ZENODO_6461868_DOI, "10.5281/zenodo.6461868");
  assert.equal(ZENODO_6461868_CONSTANTS.recordBytes, 11_867);
  assert.equal(ZENODO_6461868_CONSTANTS.recordSha256,
    "sha256:d069dddea72f3693f532d0615262b121b14c5045632c856313ffe5e81850ad97");
  assert.equal(ZENODO_6461868_CONSTANTS.files.length, 22);
  assert.equal(ZENODO_6461868_CONSTANTS.totalRemoteBytes, 3_685_671_213);
  assert.deepEqual(ZENODO_6461868_CONSTANTS.selectedRows.map((row) => ({
    classCode: row.classCode, file: row.fileKey, bytes: row.bytes,
    end: row.rangeEnd, hash: row.sha256,
  })), [
    { classCode: "cls", file: "cls-joint-1.csv", bytes: 18_342, end: 18_341,
      hash: "sha256:5ec7041050e6181721f0389d9c208388ba906638b5213c4a4fa0bd6381bdab47" },
    { classCode: "ctc", file: "ctc-joint-1.csv", bytes: 17_793, end: 17_792,
      hash: "sha256:c722e349dbf31a04028ea29cb80aafcbfb0ea1ab74ef79179d2a10b9733c8720" },
    { classCode: "fre", file: "fre-joint-1.csv", bytes: 18_305, end: 18_304,
      hash: "sha256:158beba455c0a04524dd103fd6e4517dfaa29a6b87a8c20cf43a0bfb221e4b80" },
  ]);
});

test("stored source replays record brackets, full README and exact strict-206 rows", () => {
  const checked = verifyZenodo6461868SourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SELECTED_SOURCE_BYTE_REPLAY");
  assert.equal(checked.manifest.manifestHash,
    "sha256:0babcf28c2e05810e2fb493c51324645a145812a6eee99ad328d3b60b480f537");
  assert.equal(checked.manifestFileSha256,
    "sha256:447fec535270a783ef223991216302c8b5dafc7237e54aa9478bb4e9358d3b62");
  assert.equal(checked.sourceRoot,
    "sha256:aa34cceb341b784a9d01be86499ad34d3f6b84db8b0b3fbacf7532e8fe727c84");
  assert.equal(checked.inventory.inventoryHash,
    "sha256:ce68bd15f17ecd3fd7ef7e679cfd10861d2dccd2a016198968a6c6aad60e6ce7");
  assert.equal(checked.manifest.recordBracket.exactBytesStable, true);
  assert.equal(checked.manifest.readme.wholeFileMd5Verified, true);
  assert.equal(checked.manifest.selection.fullCsvFilesDownloaded, false);
  assert.equal(checked.rows.every((row) => row.samples === 1_024), true);
});

test("README plus all 3072 selected torque values exactly rebuild the report", () => {
  const rebuilt = buildZenodo6461868JointTorqueSignalPiecesFromSource(SOURCE);
  assert.deepEqual(rebuilt, REPORT);
  const checked = verifyZenodo6461868JointTorqueSignalPiecesWithSource(REPORT, SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SELECTED_SOURCE_REDERIVED");
  assert.equal(REPORT.artifactHash,
    "sha256:8ee39c8f3628a3fa1c4c3ca923eea90cf2bf685cc9816ff409c11dc2d122dc9a");
  assert.equal(zenodo6461868Sha256(REPORT_BYTES),
    "sha256:df93e025bced35e146d38891991b9b85a51461f4b5a580b7977d2bbf2785b02a");
  assert.equal(REPORT.sourceReplay.replayHash,
    "sha256:8ad29d2d3b4d3b00369839a665b11f2a3dc22ba799d582cc9d1148b67ca10b75");
});

test("signal pieces, torque samples and joint identifiers remain non-additive", () => {
  assert.deepEqual(REPORT.denominatorRegistry.populations.map((entry) => entry.units),
    [3, 3_072]);
  assert.deepEqual(REPORT.denominatorRegistry.populations[0].classPartitions
    .map((entry) => entry.units), [1, 1, 1]);
  assert.equal(REPORT.denominatorRegistry.populations[1].additiveWithSignalPieces, false);
  assert.equal(REPORT.denominatorRegistry.jointIdentifiersAreNotAdditionalSignalPieces, true);
  assert.equal(REPORT.denominatorRegistry.multiplicationByJointCountProhibited, true);
  assert.equal(REPORT.denominatorRegistry.crossJointUniquePhysicalTrialCount, null);
  assert.equal(REPORT.denominatorRegistry.crossDomainTotal, null);
  assert.equal(REPORT.denominatorRegistry.crossDomainAdditionProhibited, true);
  assert.equal(REPORT.publisherDatasetSchema.crossJointRowAlignmentVerifiedFromSelectedBytes,
    false);
  assert.equal(REPORT.publisherDatasetSchema.uniquePhysicalTrialCountAcrossJointFiles, null);
});

test("publisher labels and local torque telemetry are not task truth or recovery", () => {
  assert.deepEqual(REPORT.mechanicalEvidence.signalPieces.map((piece) => ({
    code: piece.classCode, label: piece.publisherClassLabel, samples: piece.samples,
    maximum: piece.maximum, event: piece.publisherEventTimeSeconds,
  })), [
    { code: "cls", label: "ACCIDENTAL_COLLISION", samples: 1_024,
      maximum: 0.670690779099152, event: 0.256 },
    { code: "ctc", label: "INTENTIONAL_CONTACT", samples: 1_024,
      maximum: 6.98897070110767, event: 0.256 },
    { code: "fre", label: "CONTACT_FREE", samples: 1_024,
      maximum: 0.964165266146972, event: null },
  ]);
  assert.equal(REPORT.mechanicalEvidence.labelsArePublisherClaims, true);
  assert.equal(REPORT.mechanicalEvidence.labelsIndependentlyVerified, false);
  assert.equal(REPORT.mechanicalEvidence.fullRobotStatePresent, false);
  assert.equal(REPORT.mechanicalEvidence.externalForceTorqueSensorPresent, false);
  assert.equal(REPORT.mechanicalEvidence.taskOutcomeSemanticsPresent, false);
  assert.equal(REPORT.mechanicalEvidence.recoverySequencePresent, false);
  assert.equal(REPORT.zeroClaimBoundary.independentCollisionTruthRecords, 0);
  assert.equal(REPORT.zeroClaimBoundary.independentTaskOutcomeRecords, 0);
  assert.equal(REPORT.zeroClaimBoundary.recoveryRecords, 0);
});

test("rights, training, receipt ordering and private permissions stay explicit", () => {
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.rights.officialZenodoLicenseClaim,
    "CC-BY-4.0");
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.rights.legalConclusion, false);
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.privacy.selectedCsvRowsNumericOnly, true);
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.privacy
    .humanSubjectPrivacyClearanceEstablished, false);
  assert.equal(REPORT.modelAndTrainingBoundary.authorizedTrainingRows, 0);
  assert.equal(REPORT.authorityAndNetworkBoundary.authorityDelta, 0);
  const receiptCheck = verifyZenodo6461868JointTorqueRunReceipt(RECEIPT, REPORT_BYTES);
  assert.equal(receiptCheck.ok, true);
  assert.equal(RECEIPT.receiptHash,
    "sha256:a4ccac8792f3b700c483e9b2a35909446df3875e67117eb59f74790e2c4d5434");
  assert.equal(zenodo6461868Sha256(RECEIPT_BYTES),
    "sha256:0cb360a90d88fe7913092187a4f86355c05a29d7a7ab2b8bfabe16f919f2d4b0");
  assert.equal(RECEIPT.publication.receiptWrittenLast, true);
  assert.equal(RECEIPT.publication.noClobber, true);
  const tree = visit(ARTIFACT);
  assert.equal(tree.directories.length, 4);
  assert.equal(tree.files.length, 10);
  assert.equal(tree.directories.every((entry) => entry.mode === 0o700), true);
  assert.equal(tree.files.every((entry) => entry.mode === 0o600), true);
  const artifactCheck = verifyZenodo6461868JointTorqueArtifactDirectory(ARTIFACT);
  assert.equal(artifactCheck.ok, true);
  assert.equal(artifactCheck.verificationLevel, "FULL_SELECTED_SOURCE_REDERIVED");
});

test("rehash cannot inflate denominators, outcome, training, scope or label truth", () => {
  const denominator = structuredClone(REPORT);
  denominator.denominatorRegistry.crossDomainTotal = 3_075;
  denominator.artifactHash = artifactDigest(denominator);
  assert.ok(verifyZenodo6461868JointTorqueSignalPiecesReport(denominator).errors
    .includes("DENOMINATOR_BOUNDARY"));

  const outcome = structuredClone(REPORT);
  outcome.segmentCoverageAttribution.outcome.independentTaskOutcomeRecords = 1;
  outcome.artifactHash = artifactDigest(outcome);
  assert.ok(verifyZenodo6461868JointTorqueSignalPiecesReport(outcome).errors
    .includes("SEGMENT_ZERO_BOUNDARY"));

  const training = structuredClone(REPORT);
  training.rightsPrivacyRevisionAndUse.use.productionTrainingAuthorized = true;
  training.rightsPrivacyRevisionAndUse.use.authorizedTrainingRows = 3_072;
  training.artifactHash = artifactDigest(training);
  assert.ok(verifyZenodo6461868JointTorqueSignalPiecesReport(training).errors
    .includes("RIGHTS_PRIVACY_TRAINING_BOUNDARY"));

  const scope = structuredClone(REPORT);
  scope.declaredScope.globalExhaustion = true;
  scope.artifactHash = artifactDigest(scope);
  assert.ok(verifyZenodo6461868JointTorqueSignalPiecesReport(scope).errors
    .includes("SCOPE_BOUNDARY"));

  const truth = structuredClone(REPORT);
  truth.mechanicalEvidence.labelsIndependentlyVerified = true;
  truth.artifactHash = artifactDigest(truth);
  assert.ok(verifyZenodo6461868JointTorqueSignalPiecesReport(truth).errors
    .includes("MECHANICAL_EVIDENCE_BOUNDARY"));
});
