import assert from "node:assert/strict";
import {
  chmodSync, cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  MCPMARK_DATASET_REVISION, MCPMARK_DISPOSITION,
  buildMcpmarkFourRunSiblingFromSourceDirectory,
  verifyMcpmarkFourRunArtifactDirectory,
} from "../src/outsider-mcpmark-four-run-sibling.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-mcpmark-four-run-sibling-20260829-v1",
);

function normalizePrivate(root) {
  const status = lstatSync(root);
  if (status.isDirectory() && !status.isSymbolicLink()) {
    chmodSync(root, 0o700);
    for (const name of readdirSync(root)) normalizePrivate(path.join(root, name));
  } else if (status.isFile()) chmodSync(root, 0o600);
}

function copiedArtifact() {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-mcpmark-four-run-test-"));
  chmodSync(parent, 0o700);
  const artifact = path.join(parent, "artifact");
  cpSync(ARTIFACT, artifact, { recursive: true, preserveTimestamps: true });
  normalizePrivate(artifact);
  return { parent, artifact };
}

test("all four fresh sibling runs replay with one publisher failure", () => {
  const checked = verifyMcpmarkFourRunArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;
  assert.equal(report.source.revision, MCPMARK_DATASET_REVISION);
  assert.equal(report.disposition, MCPMARK_DISPOSITION);
  assert.equal(report.source.siblingCount, 35_959);
  assert.equal(report.source.dataRootEntryCount, 120);
  assert.equal(report.source.fullGroupRunCount, 4);
  assert.equal(report.source.selectedFileCount, 17);
  assert.equal(report.source.selectedBytes, 182_049);
  assert.equal(report.siblingDesign.freshRunCount, 4);
  assert.equal(report.siblingDesign.allPublishedFreshRunsForSelectedGroupTaskPresent, true);
  assert.equal(report.siblingDesign.exactTaskPromptAcrossRuns, true);
  assert.deepEqual(report.siblingDesign.publisherOutcomeSequence,
    [true, true, false, true]);
  assert.equal(report.siblingDesign.publisherSuccessCount, 3);
  assert.equal(report.siblingDesign.publisherFailureCount, 1);
  assert.equal(report.siblingDesign.fullGroupTaskRunsRepresentedBySummaries, 120);
  assert.equal(report.siblingDesign.runReplay.reduce((sum, run) =>
    sum + run.functionCalls, 0), 120);
  assert.equal(report.siblingDesign.runReplay.reduce((sum, run) =>
    sum + run.functionCallOutputs, 0), 120);
  assert.equal(report.evidenceBoundary.publisherHarnessOutcomeIsIndependentTruth, false);
  assert.equal(report.evidenceBoundary.verifierImplementationBytesReplayed, false);
  assert.equal(report.privacy.localPathOccurrences, 586);
  assert.equal(report.privacy.rawProjectionRows, 0);
  for (const field of ["independentOutcomeRows", "recoveryEpisodeRows",
    "offlineTrainingRows", "productionTrainingRows", "networkAdmissionRows",
    "actorCreditRows", "ceuRows", "authorityRows"]) {
    assert.equal(report.boundary[field], 0, field);
  }
  assert.equal(report.artifactHash,
    "sha256:3e161a030412999f5cdd7c9fd2a7d6437cdde63511a1238c055ad26f4c0a0908");
  assert.equal(receipt.receiptHash,
    "sha256:663245cd8b46c9b1dd457cff9e9692b050732e4ad89e82685f888b68fe2e38a7");
});

test("same-size messages mutation and tree-lineage mutation fail", () => {
  const messagesCopy = copiedArtifact();
  const treeCopy = copiedArtifact();
  try {
    const messagesFile = path.join(messagesCopy.artifact,
      "source/files/run-3-messages.json");
    const bytes = readFileSync(messagesFile);
    bytes[1024] ^= 1;
    writeFileSync(messagesFile, bytes, { mode: 0o600 });
    chmodSync(messagesFile, 0o600);
    assert.throws(() => buildMcpmarkFourRunSiblingFromSourceDirectory(
      path.join(messagesCopy.artifact, "source")), /FILE_PIN_MISMATCH/u);

    const treeFile = path.join(treeCopy.artifact,
      "source/metadata/run-2-task-tree.json");
    const tree = JSON.parse(readFileSync(treeFile, "utf8"));
    tree[0].oid = "0".repeat(40);
    writeFileSync(treeFile, JSON.stringify(tree), { mode: 0o600 });
    chmodSync(treeFile, 0o600);
    const checked = verifyMcpmarkFourRunArtifactDirectory(treeCopy.artifact);
    assert.equal(checked.ok, false);
    assert.match(checked.error, /TASK_TREE_HASH_MISMATCH/u);
  } finally {
    rmSync(messagesCopy.parent, { recursive: true, force: true });
    rmSync(treeCopy.parent, { recursive: true, force: true });
  }
});

test("publisher outcome promotion and raw-file mode changes are rejected", () => {
  const reportCopy = copiedArtifact();
  const modeCopy = copiedArtifact();
  try {
    const reportFile = path.join(reportCopy.artifact, "report.json");
    const report = JSON.parse(readFileSync(reportFile, "utf8"));
    report.boundary.independentOutcomeRows = 4;
    writeFileSync(reportFile, `${JSON.stringify(report)}\n`, { mode: 0o600 });
    chmodSync(reportFile, 0o600);
    const reportCheck = verifyMcpmarkFourRunArtifactDirectory(reportCopy.artifact);
    assert.equal(reportCheck.ok, false);
    assert.match(reportCheck.error, /REPORT_SOURCE_REPLAY_MISMATCH/u);

    chmodSync(path.join(modeCopy.artifact, "source/files/run-1-execution.log"), 0o644);
    const modeCheck = verifyMcpmarkFourRunArtifactDirectory(modeCopy.artifact);
    assert.equal(modeCheck.ok, false);
    assert.match(modeCheck.error, /FILE_UNSAFE/u);
  } finally {
    rmSync(reportCopy.parent, { recursive: true, force: true });
    rmSync(modeCopy.parent, { recursive: true, force: true });
  }
});

test("artifact is private and acquisition is no-clobber", async () => {
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  assert.equal(lstatSync(path.join(ARTIFACT, "report.json")).mode & 0o777, 0o600);
  const { execFileSync } = await import("node:child_process");
  assert.throws(() => execFileSync(process.execPath,
    ["scripts/acquire-mcpmark-four-run-sibling.mjs", "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  assert.equal(verifyMcpmarkFourRunArtifactDirectory(ARTIFACT).ok, true);
});
