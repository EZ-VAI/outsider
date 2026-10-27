import assert from "node:assert/strict";
import {
  chmodSync, cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AGENT_RACE_DATASET_REVISION,
  AGENT_RACE_DISPOSITION,
  buildAgentRaceExternalEffectFromSourceDirectory,
  verifyAgentRaceArtifactDirectory,
} from "../src/outsider-agent-race-external-effect.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-agent-race-external-effect-20260829-v1",
);

function normalizePrivate(root) {
  const status = lstatSync(root);
  if (status.isDirectory() && !status.isSymbolicLink()) {
    chmodSync(root, 0o700);
    for (const name of readdirSync(root)) normalizePrivate(path.join(root, name));
  } else if (status.isFile()) chmodSync(root, 0o600);
}

function copiedArtifact() {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-agent-race-test-"));
  chmodSync(parent, 0o700);
  const artifact = path.join(parent, "artifact");
  cpSync(ARTIFACT, artifact, { recursive: true, preserveTimestamps: true });
  normalizePrivate(artifact);
  return { parent, artifact };
}

test("four fixed Agent Race traces replay as quarantined digital-effect morphology", () => {
  const checked = verifyAgentRaceArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  const { report, receipt } = checked;
  assert.equal(report.source.revision, AGENT_RACE_DATASET_REVISION);
  assert.equal(report.disposition, AGENT_RACE_DISPOSITION);
  assert.equal(report.source.repositoryFileCount, 6);
  assert.equal(report.source.repositoryFileBytes, 799_205);
  assert.equal(report.traceReplay.actionEffectEpisodeMorphologyCount, 4);
  assert.equal(report.traceReplay.eventCount, 433);
  assert.equal(report.traceReplay.toolCallCount, 171);
  assert.equal(report.traceReplay.toolResultCount, 171);
  assert.equal(report.traceReplay.toolErrorCount, 7);
  assert.equal(report.externalDigitalEffect.namedRepositoryArtifactsObservedAtFixedRevision, 4);
  assert.equal(report.externalDigitalEffect.traceTargetRepositoryNameJoinCount, 4);
  assert.equal(report.externalDigitalEffect.traceExactCommitJoinCount, 1);
  assert.equal(report.comparisonDesign.rawPromptExactAcrossAllRuns, false);
  assert.equal(report.comparisonDesign.normalizedPromptHashCount, 3);
  assert.equal(report.privacy.localPathCandidates, 195);
  assert.equal(report.privacy.noPiiGuaranteed, false);
  assert.equal(report.rights.legalConclusionEstablished, false);
  assert.equal(report.boundary.independentOutcomeTruthEstablished, false);
  assert.equal(report.boundary.recoveryEpisodeEstablished, false);
  for (const field of ["productionTrainingRows", "offlineTrainingRows",
    "networkAdmissionRows", "delegationAuthorityRows", "actorCreditRows",
    "ceuRows", "pricingRows"]) assert.equal(report.boundary[field], 0, field);
  assert.equal(receipt.externalDigitalEffectRows, 4);
  assert.equal(receipt.independentOutcomeRows, 0);
  assert.equal(report.artifactHash,
    "sha256:5a19e59f4444cb529adb697b89311016f72bebdbe6b70dcc9a0fce70868ffbe9");
  assert.equal(receipt.receiptHash,
    "sha256:6313d741991cab2c2937bcf74f53853a8c390140552aed58a02d77d96b744e87");
});

test("same-size raw trace mutation fails fixed source replay", () => {
  const copy = copiedArtifact();
  try {
    const file = path.join(copy.artifact, "source/files/pi-kimi.jsonl");
    const bytes = readFileSync(file);
    bytes[128] ^= 1;
    writeFileSync(file, bytes, { mode: 0o600 });
    chmodSync(file, 0o600);
    assert.throws(() => buildAgentRaceExternalEffectFromSourceDirectory(
      path.join(copy.artifact, "source")), /FILE_PIN_MISMATCH/u);
  } finally { rmSync(copy.parent, { recursive: true, force: true }); }
});

test("fixed model revision metadata mutation fails external-effect binding", () => {
  const copy = copiedArtifact();
  try {
    const file = path.join(copy.artifact,
      "source/metadata/model-pi-kimi-record.json");
    const value = JSON.parse(readFileSync(file, "utf8"));
    value.sha = "0".repeat(40);
    writeFileSync(file, JSON.stringify(value), { mode: 0o600 });
    chmodSync(file, 0o600);
    const checked = verifyAgentRaceArtifactDirectory(copy.artifact);
    assert.equal(checked.ok, false);
    assert.match(checked.error, /MODEL_RECORD_INVALID/u);
  } finally { rmSync(copy.parent, { recursive: true, force: true }); }
});

test("report promotion and permissive raw-file modes are rejected", () => {
  const promoted = copiedArtifact();
  const permissive = copiedArtifact();
  try {
    const reportFile = path.join(promoted.artifact, "report.json");
    const report = JSON.parse(readFileSync(reportFile, "utf8"));
    report.boundary.productionTrainingRows = 4;
    writeFileSync(reportFile, `${JSON.stringify(report)}\n`, { mode: 0o600 });
    chmodSync(reportFile, 0o600);
    const promotedCheck = verifyAgentRaceArtifactDirectory(promoted.artifact);
    assert.equal(promotedCheck.ok, false);
    assert.match(promotedCheck.error, /REPORT_SOURCE_REPLAY_MISMATCH/u);

    chmodSync(path.join(permissive.artifact,
      "source/files/claude-code.jsonl"), 0o644);
    const modeCheck = verifyAgentRaceArtifactDirectory(permissive.artifact);
    assert.equal(modeCheck.ok, false);
    assert.match(modeCheck.error, /FILE_UNSAFE/u);
  } finally {
    rmSync(promoted.parent, { recursive: true, force: true });
    rmSync(permissive.parent, { recursive: true, force: true });
  }
});

test("published artifact is private and no-clobber", async () => {
  assert.equal(lstatSync(ARTIFACT).mode & 0o777, 0o700);
  for (const name of ["report.json", "run-receipt.json"]) {
    assert.equal(lstatSync(path.join(ARTIFACT, name)).mode & 0o777, 0o600);
  }
  const module = await import("node:child_process");
  assert.throws(() => module.execFileSync(process.execPath,
    ["scripts/acquire-agent-race-external-effect.mjs", "--output-dir", ARTIFACT],
    { cwd: path.resolve("."), stdio: "pipe" }), /Command failed/u);
  assert.equal(verifyAgentRaceArtifactDirectory(ARTIFACT).ok, true);
});
