import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  NAD_DATASET_ID,
  NAD_GITHUB_HEAD,
  NAD_GITHUB_TREE,
  NAD_REPORT_SCHEMA,
  NAD_REVISION,
  NAD_SO101_CONSTANTS,
  buildNadSo101MechanicsFromSource,
  nadSha256,
  verifyNadSo101ArtifactDirectory,
  verifyNadSo101MechanicsReport,
  verifyNadSo101MechanicsWithSource,
  verifyNadSo101RunReceipt,
  verifyNadSo101SourceDirectory,
} from "../src/outsider-nad-so101-mechanics.js";
import { canonicalizeStrict } from "../src/canonical.js";

const ARTIFACT = path.resolve("artifacts/outsider-nad-so101-mechanics-20260829-v1");
const SOURCE = path.join(ARTIFACT, "source");
const REPORT_BYTES = readFileSync(path.join(ARTIFACT, "nad-so101-mechanics.json"));
const REPORT = JSON.parse(REPORT_BYTES);
const RECEIPT = JSON.parse(readFileSync(path.join(ARTIFACT, "run-receipt.json")));

function artifactDigest(report) {
  const { artifactHash: ignored, ...body } = report;
  return "sha256:" + createHash("sha256")
    .update(`${NAD_REPORT_SCHEMA}/artifact\0${canonicalizeStrict(body)}`)
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

test("NAD HF revision and linked GitHub provenance are exactly pinned", () => {
  assert.equal(NAD_DATASET_ID, "frankzydou/NAD");
  assert.equal(NAD_REVISION, "88838bce278e381a830a71af83e27dfbb1dac414");
  assert.equal(NAD_GITHUB_HEAD, "729d0fdacf48e4051354c9e7dd92ce256d7a0a20");
  assert.equal(NAD_GITHUB_TREE, "791cdfc1c7dda7106061bb26c2f6a6c548f52a61");
  assert.equal(NAD_SO101_CONSTANTS.expectedProfile.treePages, 27);
  assert.equal(NAD_SO101_CONSTANTS.expectedProfile.treeEntries, 1302);
  assert.equal(NAD_SO101_CONSTANTS.expectedProfile.rawFiles, 100);
  assert.equal(NAD_SO101_CONSTANTS.expectedProfile.rawBytes, 24_207_793);
  assert.equal(NAD_SO101_CONSTANTS.expectedProfile.parquetFiles, 3);
  assert.equal(NAD_SO101_CONSTANTS.expectedProfile.parquetBytes, 1_604_946);
  assert.equal(NAD_SO101_CONSTANTS.expectedProfile.videoFilesExcluded, 100);
  assert.equal(NAD_SO101_CONSTANTS.expectedProfile.videoBytesExcluded, 379_638_513);
});

test("source verifier replays both brackets, raw tree identity and all 111 selected objects", () => {
  const checked = verifyNadSo101SourceDirectory(SOURCE);
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_BYTE_REPLAY");
  assert.equal(checked.manifest.manifestHash,
    "sha256:391d4c03a87a3abf1514663b6b5e76d2d3663424aef60b5c149e0ae120847f32");
  assert.equal(checked.manifestFileSha256,
    "sha256:879ff5f313951226b37f0bef5173a0b4d732cf339ddcbf1d5d4303ac9a7049b3");
  assert.equal(checked.sourceRoot,
    "sha256:ba4ee648236877ff7772980001e7af66bdece4f81e7a468cc3ad84f68c835a8a");
  assert.equal(checked.manifest.hf.treeBefore.snapshotHash,
    NAD_SO101_CONSTANTS.expectedTreeSnapshotHash);
  assert.equal(checked.manifest.github.rawDataTreeIdentityEstablished, true);
  assert.equal(checked.manifest.github.hfSo101TreeOid,
    checked.manifest.github.githubSo101TreeOid);
  assert.equal(checked.manifest.hfRemoteObjects.length, 104);
  assert.equal(checked.manifest.githubRemoteObjects.length, 7);
});

test("full CSV to Parquet crosswalk is complete without claiming bit-exact floats", () => {
  const checked = verifyNadSo101MechanicsReport(REPORT);
  assert.equal(checked.ok, true);
  assert.deepEqual(checked.errors, []);
  assert.equal(REPORT.artifactHash,
    "sha256:212dec1ccbf4796185e5e272e0aeb95d13c1b9d1b4ca24fd5ec4ef2686ad3ca0");
  assert.equal(nadSha256(REPORT_BYTES),
    "sha256:6e08eb1f3a56b56200e73300c58e7bb6db0c69bbf5ab82bd34207d7b5a22d843");
  assert.equal(REPORT.sourceReplay.replayHash,
    "sha256:597161bec0f62039515c410daf00de43c760ef43e17c7ac9a9092af4e3a33c9e");
  assert.equal(REPORT.sourceReplay.rawTelemetryRows, 65_916);
  assert.deepEqual(Object.fromEntries(REPORT.sourceReplay.splitSummaries.map((entry) =>
    [entry.split, entry.rawRows])), { train: 52_758, validation: 6599, test: 6559 });
  assert.equal(REPORT.sourceReplay.comparisonCounts.integerValuesExact, 2_109_312);
  assert.equal(REPORT.sourceReplay.comparisonCounts.forceZValuesExact, 65_916);
  assert.equal(REPORT.sourceReplay.comparisonCounts.floatingValuesCompared, 856_908);
  assert.equal(REPORT.sourceReplay.comparisonCounts.floatingValuesNotBitExact, 513_315);
  assert.equal(REPORT.sourceReplay.comparisonCounts.floatingValuesBeyondTolerance, 0);
  assert.equal(REPORT.sourceReplay.floatingValuesBitExact, false);
  assert.equal(REPORT.sourceReplay.floatingValuesWithinDeclaredTolerance, true);
});

test("full source replay exactly rebuilds the NAD report", () => {
  const rebuilt = buildNadSo101MechanicsFromSource(SOURCE,
    { pythonExecutable: process.env.OUTSIDER_PYTHON ?? ".venv/bin/python" });
  assert.deepEqual(rebuilt, REPORT);
  const checked = verifyNadSo101MechanicsWithSource(REPORT, SOURCE,
    { pythonExecutable: process.env.OUTSIDER_PYTHON ?? ".venv/bin/python" });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_REDERIVED");
});

test("load-register and payload-label semantics remain non-measurement boundaries", () => {
  assert.equal(REPORT.sourceSemantics.releasedConfigCurrentSource, "load");
  assert.equal(REPORT.sourceSemantics.currentRegisterStillPresentInRawData, true);
  assert.equal(REPORT.sourceSemantics.currentAndLoadAreDistinctRegisters, true);
  assert.equal(REPORT.sourceSemantics.rowsWhereAllSixCurrentAndLoadValuesAreEqual, 0);
  assert.equal(REPORT.sourceSemantics.missingForceSentinel, -999);
  assert.equal(REPORT.forceLabelBoundary.so101EndEffectorForceSensorPresent, false);
  assert.equal(REPORT.forceLabelBoundary.measuredEndEffectorForceRows, 0);
  assert.equal(REPORT.forceLabelBoundary.forceZValidPayloadLabelRows, 39_725);
  assert.equal(REPORT.forceLabelBoundary.forceZSentinelRows, 26_191);
  assert.deepEqual(REPORT.forceLabelBoundary.forceLabelsByPayload["500g"]
    .observedForceZValues, [-999, -4.9]);
  assert.equal(REPORT.denominatorRegistry.populations[0].units, 100);
  assert.equal(REPORT.denominatorRegistry.populations[0].parquetRepacksAreAdditionalUnits,
    false);
  assert.equal(REPORT.denominatorRegistry.crossDomainTotal, null);
  assert.equal(REPORT.denominatorRegistry.crossDomainAdditionProhibited, true);
});

test("receipt is final and the complete artifact remains private", () => {
  const receiptCheck = verifyNadSo101RunReceipt(RECEIPT, REPORT_BYTES);
  assert.equal(receiptCheck.ok, true);
  assert.equal(RECEIPT.receiptHash,
    "sha256:5daa75052dcd112e58a8ce06c37dbf3fc68653f2cf57f036b4bd9fb5e47c7542");
  assert.equal(RECEIPT.publication.receiptWrittenLast, true);
  assert.equal(RECEIPT.publication.noClobber, true);
  const tree = visit(ARTIFACT);
  assert.equal(tree.directories.length, 52);
  assert.equal(tree.files.length, 177);
  assert.equal(tree.directories.every((entry) => entry.mode === 0o700), true);
  assert.equal(tree.files.every((entry) => entry.mode === 0o600), true);
  const checked = verifyNadSo101ArtifactDirectory(ARTIFACT,
    { pythonExecutable: process.env.OUTSIDER_PYTHON ?? ".venv/bin/python" });
  assert.equal(checked.ok, true);
  assert.equal(checked.verificationLevel, "FULL_SOURCE_REDERIVED");
});

test("rehash cannot inflate exhaustion, force measurement, or authorized training", () => {
  const scope = structuredClone(REPORT);
  scope.declaredScope.globalExhaustion = true;
  scope.artifactHash = artifactDigest(scope);
  assert.ok(verifyNadSo101MechanicsReport(scope).errors.includes("SCOPE_BOUNDARY"));

  const force = structuredClone(REPORT);
  force.forceLabelBoundary.so101EndEffectorForceSensorPresent = true;
  force.forceLabelBoundary.measuredEndEffectorForceRows = 39_725;
  force.artifactHash = artifactDigest(force);
  assert.ok(verifyNadSo101MechanicsReport(force).errors.includes("FORCE_LABEL_BOUNDARY"));

  const training = structuredClone(REPORT);
  training.modelAndTrainingBoundary.authorizedTraining = true;
  training.modelAndTrainingBoundary.authorizedTrainingRows = 65_916;
  training.artifactHash = artifactDigest(training);
  assert.ok(verifyNadSo101MechanicsReport(training).errors.includes("TRAINING_BOUNDARY"));
});
