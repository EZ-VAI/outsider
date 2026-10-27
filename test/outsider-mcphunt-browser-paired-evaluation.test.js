import assert from "node:assert/strict";
import {
  chmodSync, cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MCPHUNT_DATASET_REVISION,
  MCPHUNT_DISPOSITION,
  buildMcphuntBrowserPairedEvaluationFromSourceDirectory,
  verifyMcphuntBrowserPairedArtifactDirectory,
} from "../src/outsider-mcphunt-browser-paired-evaluation.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-mcphunt-browser-paired-evaluation-20260829-v1",
);

function normalizePrivate(root) {
  const status = lstatSync(root);
  if (status.isDirectory() && !status.isSymbolicLink()) {
    chmodSync(root, 0o700);
    for (const name of readdirSync(root)) normalizePrivate(path.join(root, name));
  } else if (status.isFile()) chmodSync(root, 0o600);
}

function copiedArtifact() {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-mcphunt-test-"));
  chmodSync(parent, 0o700);
  const artifact = path.join(parent, "artifact");
  cpSync(ARTIFACT, artifact, { recursive: true, preserveTimestamps: true });
  normalizePrivate(artifact);
  return { parent, artifact };
}

test("fixed 39+39 browser replication arm source-replays without claiming improvement", () => {
  const checked = verifyMcphuntBrowserPairedArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;
  assert.equal(report.source.revision, MCPHUNT_DATASET_REVISION);
  assert.equal(report.disposition, MCPHUNT_DISPOSITION);
  assert.equal(report.source.repositoryInventory.fileCount, 32);
  assert.equal(report.source.repositoryInventory.repositoryBytes, 593_477_456);
  assert.equal(report.source.selectedBytes, 6_720_569);
  assert.equal(report.baseline.traceCount, 39);
  assert.equal(report.defense.traceCount, 39);
  assert.equal(report.pairedReplay.pairCount, 39);
  assert.equal(report.pairedReplay.stablePromptPairCount, 39);
  assert.equal(report.pairedReplay.outcomeChangedPairCount, 5);
  assert.equal(report.pairedReplay.observedUnsafeSuccessDifferenceDefenseMinusBaseline, 1);
  assert.equal(report.pairedReplay.defenseImprovementClaimedByThisAdapter, false);
  assert.deepEqual(report.baseline.outcomes,
    { safe_failure: 8, unsafe_failure: 1, unsafe_success: 30 });
  assert.deepEqual(report.defense.outcomes,
    { safe_failure: 4, unsafe_failure: 4, unsafe_success: 31 });
  assert.equal(report.contentBoundary.intentionallySyntheticCanaryPayloadsPresent, true);
  assert.equal(report.contentBoundary.rawProjectionRows, 0);
  assert.equal(report.pairedReplay.publisherOutcomeLabelsIndependentGroundTruth, false);
  assert.equal(report.boundary.independentOutcomeRows, 0);
  for (const field of ["offlineTrainingRows", "productionTrainingRows",
    "networkAdmissionRows", "actorCreditRows", "ceuRows", "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.artifactHash,
    "sha256:25da108b8ea5b6e86d1df8b491879fbbdf34442a71ba2a93d8963230056f87f8");
  assert.equal(receipt.receiptHash,
    "sha256:6baaa40672c0c588e16db2d56d0ff9f2d857b8d800261a62cf57cef044c242a7");
});

test("same-size trace mutation fails selected-byte pin", () => {
  const copy = copiedArtifact();
  try {
    const file = path.join(copy.artifact, "source/files/browser-defense.json");
    const bytes = readFileSync(file);
    bytes[1024] ^= 1;
    writeFileSync(file, bytes, { mode: 0o600 });
    chmodSync(file, 0o600);
    assert.throws(() => buildMcphuntBrowserPairedEvaluationFromSourceDirectory(
      path.join(copy.artifact, "source")), /FILE_PIN_MISMATCH/u);
  } finally { rmSync(copy.parent, { recursive: true, force: true }); }
});

test("pair-label mutation and report promotion fail source replay", () => {
  const labelCopy = copiedArtifact();
  const reportCopy = copiedArtifact();
  try {
    const traceFile = path.join(labelCopy.artifact,
      "source/files/browser-baseline.json");
    const traces = JSON.parse(readFileSync(traceFile, "utf8"));
    traces.traces[0].outcome = "safe_failure";
    writeFileSync(traceFile, JSON.stringify(traces), { mode: 0o600 });
    chmodSync(traceFile, 0o600);
    const labelCheck = verifyMcphuntBrowserPairedArtifactDirectory(labelCopy.artifact);
    assert.equal(labelCheck.ok, false);
    assert.match(labelCheck.error, /FILE_PIN_MISMATCH/u);

    const reportFile = path.join(reportCopy.artifact, "report.json");
    const report = JSON.parse(readFileSync(reportFile, "utf8"));
    report.boundary.productionTrainingRows = 78;
    writeFileSync(reportFile, `${JSON.stringify(report)}\n`, { mode: 0o600 });
    chmodSync(reportFile, 0o600);
    const reportCheck = verifyMcphuntBrowserPairedArtifactDirectory(reportCopy.artifact);
    assert.equal(reportCheck.ok, false);
    assert.match(reportCheck.error, /REPORT_SOURCE_REPLAY_MISMATCH/u);
  } finally {
    rmSync(labelCopy.parent, { recursive: true, force: true });
    rmSync(reportCopy.parent, { recursive: true, force: true });
  }
});

test("private mode and no-clobber boundaries hold", async () => {
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "report.json")).mode & 0o777, 0o600);
  const modeCopy = copiedArtifact();
  try {
    chmodSync(path.join(modeCopy.artifact, "source/files/browser-baseline.json"), 0o644);
    const checked = verifyMcphuntBrowserPairedArtifactDirectory(modeCopy.artifact);
    assert.equal(checked.ok, false);
    assert.match(checked.error, /FILE_UNSAFE/u);
  } finally { rmSync(modeCopy.parent, { recursive: true, force: true }); }
  const { execFileSync } = await import("node:child_process");
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-mcphunt-browser-paired-evaluation.mjs", "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  assert.equal(verifyMcphuntBrowserPairedArtifactDirectory(ARTIFACT).ok, true);
});
