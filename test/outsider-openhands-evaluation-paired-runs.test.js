import test from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  OPENHANDS_EVAL_DATASET_ID,
  OPENHANDS_EVAL_REPORT_SCHEMA,
  OPENHANDS_EVAL_REVISION,
  openHandsEvalDigest,
  publishOpenHandsEvaluationArtifactDirectory,
  verifyOpenHandsEvaluationArtifactDirectory,
  verifyOpenHandsEvaluationReceipt,
  verifyOpenHandsEvaluationReport,
  verifyOpenHandsEvaluationReportWithSource,
  verifyOpenHandsEvaluationSourceDirectory,
} from "../src/outsider-openhands-evaluation-paired-runs.js";

const ROOT = path.resolve("artifacts/outsider-openhands-evaluation-paired-runs-20260829-v1");
const SOURCE = path.join(ROOT, "source");
const REPORT = path.join(ROOT, "report.json");
const RECEIPT = path.join(ROOT, "run-receipt.json");

const EXPECTED_HASHES = Object.freeze({
  artifact: "sha256:786064de9493595808346b0bdf8f6ede55698481b3c58cac7b0dfe2d4cdc4c00",
  reportFile: "sha256:815f68b325bafe9191681d1f1d1e66c5e83dad3d4a908c4d8552d89340a67ac4",
  receipt: "sha256:f9b101d26d42797a5099b73a612b61b11eab187eb7bcede5fd9b9ab09c0699aa",
  receiptFile: "sha256:a62d6ee1f6b7a1c12cb3cd4fb51e620af21f06f348e170ac756c26675ad6f6ec",
  sourceRoot: "sha256:27e43e6a053cd19505efc2d8b12deb0ac287251a4cd26e2dd63f72e166eb5e49",
  manifest: "sha256:9a51f8f81386ab10b8e064289077179cb2cb3c8d2729898cf834d64493ad4973",
  manifestFile: "sha256:97fefd185a038aab295c6a6b674be3094fb1412641fcdd2d3d00190785c1a826",
  tree: "sha256:ed7c9cf32daddac94c639c9cbefcb4d7940f188e4b5c7b35dca6c985eabed8f0",
  inventory: "sha256:cc9c5b1714e72e298d5c2f072e03d9251578a57900cdb864a8b79a983e61ecb5",
});

function reseal(report, mutate) {
  const changed = structuredClone(report);
  mutate(changed);
  delete changed.artifactHash;
  changed.artifactHash = openHandsEvalDigest(changed,
    `${OPENHANDS_EVAL_REPORT_SCHEMA}/artifact`);
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

test("official record and complete two-page tree bracket a distinct pinned source", () => {
  const checked = verifyOpenHandsEvaluationSourceDirectory(SOURCE);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel, "FULL_SELECTED_SOURCE_REPLAY");
  assert.equal(checked.manifest.datasetId, OPENHANDS_EVAL_DATASET_ID);
  assert.equal(checked.manifest.pinnedRevision, OPENHANDS_EVAL_REVISION);
  assert.deepEqual(checked.manifest.repositoryBefore, checked.manifest.repositoryAfter);
  assert.deepEqual(checked.manifest.hfTreeBefore, checked.manifest.hfTreeAfter);
  assert.deepEqual(checked.manifest.hfTreeBefore, {
    bytes: 4_608_334_624, directories: 28, entries: 119, files: 91,
    snapshotHash: EXPECTED_HASHES.tree,
  });
  assert.equal(checked.manifest.repositoryBefore.publisherLicenseClaim, "MIT");
  assert.equal(checked.manifest.repositoryBefore.private, false);
  assert.equal(checked.manifest.repositoryBefore.gated, false);
  assert.equal(checked.manifest.duplicateDisposition.status, "DISTINCT_OFFICIAL_SOURCE");
  assert.equal(checked.manifest.duplicateDisposition.sameDatasetIdentityAsEitherExistingSource,
    false);
  assert.equal(checked.inventory.selection.completeRunDirectories, true);
  assert.equal(checked.inventory.selection.selectedFiles, 11);
  assert.equal(checked.inventory.selection.selectedBytes, 114_939_223);
  assert.equal(checked.inventory.inventoryHash, EXPECTED_HASHES.inventory);
  assert.equal(checked.sourceRoot, EXPECTED_HASHES.sourceRoot);
  assert.equal(checked.manifest.manifestHash, EXPECTED_HASHES.manifest);
  assert.equal(checked.manifestFileSha256, EXPECTED_HASHES.manifestFile);
  assertPrivateTree(ROOT);
});

test("both complete run files replay all rows and preserve missing harness states", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.artifactHash, EXPECTED_HASHES.artifact);
  assert.equal(report.runs.length, 2);
  assert.deepEqual(report.runs.map((run) => ({ key: run.key, rows: run.rows,
    resolvedTrue: run.resolvedTrue, resolvedFalse: run.resolvedFalse,
    resolvedNull: run.resolvedNull, errorRows: run.errorRows,
    historyEvents: run.historyEvents })), [
    { key: "sonnet-v1.9", rows: 300, resolvedTrue: 92, resolvedFalse: 208,
      resolvedNull: 0, errorRows: 73, historyEvents: 13_149 },
    { key: "deepseek-v1.9", rows: 300, resolvedTrue: 40, resolvedFalse: 68,
      resolvedNull: 192, errorRows: 202, historyEvents: 5_937 },
  ]);
  assert.equal(report.denominators.evaluationRunRows.units, 600);
  assert.equal(report.denominators.uniqueBenchmarkInstances.units, 300);
  assert.equal(report.denominators.explicitPublisherResolvedLabels.units, 408);
  assert.equal(report.denominators.crossPopulationTotal, null);
  assert.equal(report.denominators.additionProhibited, true);
});

test("same-instance contrast is explicit publisher true versus false, not recovery", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.pairedComparison.sharedInstanceUnits, 300);
  assert.equal(report.pairedComparison.exactInstanceUniverseMatch, true);
  assert.equal(report.pairedComparison.matchingInstanceObjectUnits, 300);
  assert.deepEqual(report.pairedComparison.publisherResolvedPairCounts, {
    falseFalse: 53, falseNull: 149, falseTrue: 6,
    trueFalse: 15, trueNull: 43, trueTrue: 34,
  });
  assert.equal(report.pairedComparison.explicitTrueFalseContrastUnits, 21);
  assert.equal(report.pairedComparison.resolvedStateDivergenceUnits, 213);
  assert.equal(report.pairedComparison.selectedContrast.instanceId,
    "astropy__astropy-14995");
  assert.deepEqual(report.pairedComparison.selectedContrast.runs.map((run) =>
    [run.runKey, run.publisherResolved, run.historyEvents, run.testPatchPresent]), [
    ["sonnet-v1.9", true, 24, true],
    ["deepseek-v1.9", false, 27, false],
  ]);
  assert.equal(report.truthBoundary.publisherResolvedMeansIndependentOutcome, false);
  assert.equal(report.truthBoundary.publisherResolvedMeansRealWorldOutcome, false);
  assert.equal(report.truthBoundary.crossRunResolvedContrastMeansRecovery, false);
  assert.equal(report.segments.outcome.independentUnits, 0);
  assert.equal(report.segments.recovery.units, 0);
  assert.equal(report.segments.longitudinal.units, 0);
});

test("raw content remains private and training, network, economics, and authority stay zero", () => {
  const report = JSON.parse(readFileSync(REPORT));
  assert.equal(report.privacy.rawInstructionsPrivate, true);
  assert.equal(report.privacy.rawHistoryMessagesPrivate, true);
  assert.equal(report.privacy.rawToolOutputsPrivate, true);
  assert.equal(report.privacy.rawPatchesPrivate, true);
  assert.equal(report.privacy.reportContainsRawDialogueOrToolContent, false);
  assert.equal(report.rights.publisherLicenseClaim, "MIT");
  assert.equal(report.rights.useSpecificLegalClearanceEstablished, false);
  assert.equal(report.useBoundary.status, "QUARANTINE_EVAL_ONLY");
  assert.equal(report.useBoundary.offlineEvaluationRows, 600);
  assert.equal(report.useBoundary.offlineModelFittingRows, 0);
  assert.equal(report.useBoundary.authorizedTrainingRows, 0);
  assert.equal(report.useBoundary.authorizedTrainingJobs, 0);
  assert.equal(report.useBoundary.trainingPerformed, false);
  assert.equal(report.network.networkAdmissionRows, 0);
  assert.equal(report.economics.CEU, 0);
  assert.equal(report.economics.pricingUnits, 0);
  assert.equal(report.authority.executionAuthorityUnits, 0);
  assert.equal(report.authority.delegatedActionUnits, 0);
});

test("report and final receipt fully rederive from the selected private source", () => {
  const reportBytes = readFileSync(REPORT);
  const report = JSON.parse(reportBytes);
  const receiptBytes = readFileSync(RECEIPT);
  const receipt = JSON.parse(receiptBytes);
  assert.equal(receipt.receiptHash, EXPECTED_HASHES.receipt);
  assert.equal(receipt.reportFileSha256, EXPECTED_HASHES.reportFile);
  assert.equal(verifyOpenHandsEvaluationReport(report).ok, true);
  const replay = verifyOpenHandsEvaluationReportWithSource(report, SOURCE);
  assert.equal(replay.ok, true, replay.error);
  assert.equal(replay.verificationLevel, "FULL_SELECTED_SOURCE_REDERIVED");
  assert.equal(verifyOpenHandsEvaluationReceipt(receipt, report, reportBytes).ok, true);
});

test("standalone verifier rejects a resealed promotion of publisher labels", () => {
  const report = JSON.parse(readFileSync(REPORT));
  const changed = reseal(report, (value) => {
    value.truthBoundary.publisherResolvedMeansIndependentOutcome = true;
    value.segments.outcome.independentUnits = 408;
  });
  assert.equal(verifyOpenHandsEvaluationReport(changed).ok, false);
});

test("published artifact is exact, private, receipt-last, and no-clobber", () => {
  const checked = verifyOpenHandsEvaluationArtifactDirectory(ROOT);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.verificationLevel, "FULL_SELECTED_SOURCE_REDERIVED");
  assert.equal(checked.reportFileSha256, EXPECTED_HASHES.reportFile);
  assert.equal(checked.receiptFileSha256, EXPECTED_HASHES.receiptFile);
  const temporary = mkdtempSync(path.join(tmpdir(), "openhands-eval-no-clobber-"));
  try {
    const staging = path.join(temporary, "staging");
    const target = path.join(temporary, "target");
    mkdirSync(staging, { mode: 0o700 });
    mkdirSync(target, { mode: 0o700 });
    chmodSync(staging, 0o700);
    chmodSync(target, 0o700);
    writeFileSync(path.join(staging, "sentinel"), "candidate", { mode: 0o600 });
    writeFileSync(path.join(target, "sentinel"), "existing", { mode: 0o600 });
    assert.throws(() => publishOpenHandsEvaluationArtifactDirectory(staging, target),
      /OPENHANDS_EVAL_ARTIFACT_TARGET_EXISTS/u);
    assert.equal(readFileSync(path.join(target, "sentinel"), "utf8"), "existing");
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
