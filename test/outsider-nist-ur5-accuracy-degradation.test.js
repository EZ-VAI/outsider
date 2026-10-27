import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  NIST_UR5_ACCURACY_CONSTANTS,
  NIST_UR5_DOI,
  NIST_UR5_REPORT_SCHEMA,
  buildNistUr5AccuracyDegradationFromSource,
  nistUr5Sha256,
  verifyNistUr5AccuracyDegradationArtifactDirectory,
  verifyNistUr5AccuracyDegradationReport,
  verifyNistUr5AccuracyDegradationRunReceipt,
  verifyNistUr5AccuracyDegradationWithSource,
  verifyNistUr5SourceDirectory,
} from "../src/outsider-nist-ur5-accuracy-degradation.js";
import { canonicalizeStrict } from "../src/canonical.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-nist-ur5-accuracy-degradation-20260829-v1");
const SOURCE = path.join(ARTIFACT, "source");
const REPORT_BYTES = readFileSync(path.join(ARTIFACT, "nist-ur5-accuracy-degradation.json"));
const REPORT = JSON.parse(REPORT_BYTES);
const RECEIPT_BYTES = readFileSync(path.join(ARTIFACT, "run-receipt.json"));
const RECEIPT = JSON.parse(RECEIPT_BYTES);

function artifactDigest(report) {
  const { artifactHash: ignored, ...body } = report;
  return `sha256:${createHash("sha256")
    .update(`${NIST_UR5_REPORT_SCHEMA}/artifact\0${canonicalizeStrict(body)}`)
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

test("NIST DOI and the complete 20-object official closure are byte pinned", () => {
  assert.equal(NIST_UR5_DOI, "10.18434/M31962");
  assert.equal(NIST_UR5_ACCURACY_CONSTANTS.expectedRemoteObjectCount, 20);
  assert.equal(NIST_UR5_ACCURACY_CONSTANTS.expectedRemoteBytes, 220_388_109);
  assert.equal(NIST_UR5_ACCURACY_CONSTANTS.expectedCsvBytes, 220_364_905);
  assert.equal(NIST_UR5_ACCURACY_CONSTANTS.expectedTraceRows, 153_658);
  assert.equal(NIST_UR5_ACCURACY_CONSTANTS.expectedTraceNumericValues, 11_217_034);
  const mismatch = NIST_UR5_ACCURACY_CONSTANTS.files.find((entry) =>
    entry.filename === "ur5testresult_fullspeed_payload1.6lb_1_1.csv");
  assert.equal(mismatch.pageTitleFilename, "ur5testresult_fullspeed_payload1.6lb_1.csv");
  assert.equal(mismatch.bytes, 12_243_436);
  assert.equal(mismatch.sha256,
    "sha256:d4b160a0dd4ef0429e1fba627622f02c634caf9227e109fd2b51fcec3fed448d");
});

test("stored source replays every file, HEAD bracket and official page snapshot", () => {
  const checked = verifyNistUr5SourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_BYTE_REPLAY");
  assert.equal(checked.manifest.manifestHash,
    "sha256:a7e933476ce7c6ace75d4c3b82d894800e16bbcf35ce7f9c72a3b439d004b55e");
  assert.equal(checked.manifestFileSha256,
    "sha256:c1db6ec25dbe7f95c89155cef57b93954646add56b1e8105d30689e5a6ea4da8");
  assert.equal(checked.sourceRoot,
    "sha256:f64820414bc65a6c952529517738fb95b166993e95349949d8dbf46d3b3e039b");
  assert.equal(checked.manifest.remoteObjects.length, 20);
  assert.equal(checked.manifest.everyRemoteObjectHeadBracketed, true);
  assert.equal(checked.manifest.landingProjection.pageTitleAndDataPathMismatchPreserved, true);
  assert.equal(checked.manifest.landingProjection.stalePageWarningPresent, true);
});

test("all CSV and XLSX content exactly rebuilds the report", () => {
  const rebuilt = buildNistUr5AccuracyDegradationFromSource(SOURCE,
    { pythonExecutable: ".venv/bin/python" });
  assert.deepEqual(rebuilt, REPORT);
  const checked = verifyNistUr5AccuracyDegradationWithSource(REPORT, SOURCE,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_REDERIVED");
  assert.equal(REPORT.artifactHash,
    "sha256:74f11ac9b516f843ccdade56bc5661b7a5c00129cceacaa79608c0c161a29209");
  assert.equal(nistUr5Sha256(REPORT_BYTES),
    "sha256:e745f94df3b2d4dc5c60ad26b50d1c8d96b43ea9f134ff851400b87f4ca075eb");
  assert.equal(REPORT.sourceReplay.replayHash,
    "sha256:6651509dcc6166b5068672c78604f38d8219ae095686541c8e8088e7f6998c85");
});

test("condition traces, sample rows and external deviations stay non-additive", () => {
  assert.equal(REPORT.population.controllerConditionTraceFiles, 18);
  assert.equal(REPORT.population.controllerSampleRows, 153_658);
  assert.equal(REPORT.population.controllerNumericValues, 11_217_034);
  assert.equal(REPORT.population.externalPositionDeviationRecords, 6);
  assert.deepEqual(REPORT.conditionAndTelemetryEvidence.conditionCells
    .map((entry) => entry.sampleRows), [22_740, 30_958, 22_436, 21_774, 25_787, 29_963]);
  assert.equal(REPORT.conditionAndTelemetryEvidence.controllerSchema.headerColumns, 73);
  assert.equal(REPORT.conditionAndTelemetryEvidence.traces.every((entry) =>
    entry.sampleRateHz === 125 && entry.nonFiniteValues === 0), true);
  assert.deepEqual(REPORT.denominatorRegistry.populations.map((entry) => entry.units),
    [18, 153_658, 6]);
  assert.equal(REPORT.denominatorRegistry.sampleRowsAreAdditionalTraces, false);
  assert.equal(REPORT.denominatorRegistry.crossDomainTotal, null);
  assert.equal(REPORT.denominatorRegistry.crossDomainAdditionProhibited, true);
});

test("external measurement, rights and task-evidence boundaries are explicit", () => {
  const external = REPORT.externalPositionEvidence;
  assert.equal(external.publisherSystemDescription
    .nistDevelopedSevenDimensionalMeasurementSystem, true);
  assert.equal(external.releasedWorkbook.publishedRecordCount, 6);
  assert.equal(external.releasedWorkbook.rawSevenDimensionalMeasurementRowsPublished, 0);
  assert.deepEqual(external.releasedWorkbook.deltaDistanceMillimeters,
    [0.15620499351813308, 0.16309506430300091, 0.18973665961010278,
      0.1739798838946618, 0.145568164921976, 0.125643375224737]);
  assert.equal(external.taskOutcomeSemanticsPresent, false);
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.rights.termsIdentifier,
    "NIST_PUBLIC_INFORMATION_TERMS");
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.rights.spdxLicenseIdentifier, null);
  assert.equal(REPORT.rightsPrivacyRevisionAndUse.rights.legalConclusion, false);
  assert.equal(REPORT.segmentCoverageAttribution.outcome.independentOutcomeRecords, 0);
  assert.equal(REPORT.segmentCoverageAttribution.recovery.independentlyVerifiedRecoveryChains, 0);
  assert.equal(REPORT.modelAndTrainingBoundary.authorizedTrainingRows, 0);
  assert.equal(REPORT.authorityBoundary.authorityDelta, 0);
});

test("receipt is final and the complete artifact remains private", () => {
  const receiptCheck = verifyNistUr5AccuracyDegradationRunReceipt(RECEIPT, REPORT_BYTES);
  assert.equal(receiptCheck.ok, true);
  assert.equal(RECEIPT.receiptHash,
    "sha256:e0d2383fdd0baee82f70777954d296425f5e4fbf089ccbe6b2d31cb8abd3e1a6");
  assert.equal(nistUr5Sha256(RECEIPT_BYTES),
    "sha256:192a6640f1c385a2b170fa9cb26e1326f5dba976743451cfb73b324dfabee94f");
  assert.equal(RECEIPT.publication.receiptWrittenLast, true);
  assert.equal(RECEIPT.publication.noClobber, true);
  const tree = visit(ARTIFACT);
  assert.equal(tree.directories.length, 5);
  assert.equal(tree.files.length, 69);
  assert.equal(tree.directories.every((entry) => entry.mode === 0o700), true);
  assert.equal(tree.files.every((entry) => entry.mode === 0o600), true);
  const checked = verifyNistUr5AccuracyDegradationArtifactDirectory(ARTIFACT,
    { pythonExecutable: ".venv/bin/python" });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_REDERIVED");
});

test("rehash cannot inflate denominators, outcomes, training, scope or raw external rows", () => {
  const denominator = structuredClone(REPORT);
  denominator.denominatorRegistry.crossDomainTotal = 18 + 153_658 + 6;
  denominator.artifactHash = artifactDigest(denominator);
  assert.ok(verifyNistUr5AccuracyDegradationReport(denominator).errors
    .includes("DENOMINATOR_BOUNDARY"));

  const outcome = structuredClone(REPORT);
  outcome.segmentCoverageAttribution.outcome.independentOutcomeRecords = 6;
  outcome.artifactHash = artifactDigest(outcome);
  assert.ok(verifyNistUr5AccuracyDegradationReport(outcome).errors
    .includes("SEGMENT_BOUNDARY"));

  const training = structuredClone(REPORT);
  training.rightsPrivacyRevisionAndUse.use.productionTrainingAuthorized = true;
  training.rightsPrivacyRevisionAndUse.use.authorizedTrainingRows = 153_658;
  training.artifactHash = artifactDigest(training);
  assert.ok(verifyNistUr5AccuracyDegradationReport(training).errors
    .includes("RIGHTS_PRIVACY_TRAINING_BOUNDARY"));

  const scope = structuredClone(REPORT);
  scope.declaredScope.globalExhaustion = true;
  scope.artifactHash = artifactDigest(scope);
  assert.ok(verifyNistUr5AccuracyDegradationReport(scope).errors.includes("SCOPE_BOUNDARY"));

  const raw = structuredClone(REPORT);
  raw.externalPositionEvidence.rawSevenDimensionalObservationsPresent = true;
  raw.artifactHash = artifactDigest(raw);
  assert.ok(verifyNistUr5AccuracyDegradationReport(raw).errors
    .includes("EXTERNAL_MEASUREMENT_BOUNDARY"));
});
