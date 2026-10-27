import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  chmodSync, cpSync, lstatSync, mkdtempSync, readFileSync, readdirSync,
  rmSync, writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  TERMINAL_BENCH_ADAPTIVE_TRIALS_DISPOSITION,
  TERMINAL_BENCH_LEADERBOARD_REVISION,
  TERMINAL_BENCH_TASK_COMMIT,
  buildTerminalBenchAdaptiveTrialsArtifactFromSourceDirectory,
  createTerminalBenchAdaptiveTrialsReceipt,
  serializeTerminalBenchAdaptiveTrialsArtifact,
  verifyTerminalBenchAdaptiveTrialsArtifactDirectory,
} from "../src/outsider-terminal-bench-adaptive-trials.js";

const artifact = path.resolve(
  "artifacts/outsider-terminal-bench-adaptive-trials-20260829-v1");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function walkModes(root, prefix = "") {
  const target = prefix === "" ? root : path.join(root, prefix);
  const status = lstatSync(target);
  assert.equal(status.isSymbolicLink(), false);
  assert.equal(status.mode & 0o777, status.isDirectory() ? 0o700 : 0o600);
  if (!status.isDirectory()) return;
  for (const name of readdirSync(target)) {
    walkModes(root, prefix === "" ? name : `${prefix}/${name}`);
  }
}

function normalizePrivateModes(root) {
  const status = lstatSync(root);
  chmodSync(root, status.isDirectory() ? 0o700 : 0o600);
  if (!status.isDirectory()) return;
  for (const name of readdirSync(root)) normalizePrivateModes(path.join(root, name));
}

test("fixed source rebuilds the complete five-trial mixed-outcome group", () => {
  const built = buildTerminalBenchAdaptiveTrialsArtifactFromSourceDirectory(
    path.join(artifact, "source"));
  assert.equal(built.report.disposition, TERMINAL_BENCH_ADAPTIVE_TRIALS_DISPOSITION);
  assert.equal(built.report.source.leaderboardRevision,
    TERMINAL_BENCH_LEADERBOARD_REVISION);
  assert.equal(built.report.source.taskCommit, TERMINAL_BENCH_TASK_COMMIT);
  assert.equal(built.report.source.selectedTrialFiles, 336);
  assert.equal(built.report.source.selectedTrialBytes, 26_579_092);
  assert.equal(built.report.source.acquiredSourceFiles, 347);
  assert.equal(built.report.replay.selectedTrials, 5);
  assert.equal(built.report.replay.publisherHarnessSuccesses, 1);
  assert.equal(built.report.replay.publisherHarnessFailures, 4);
  assert.equal(built.report.replay.episodeDirectories, 99);
  assert.equal(built.report.replay.completeEpisodeTriplets, 97);
  assert.equal(built.report.replay.partialPromptOnlyEpisodes, 2);
  assert.equal(built.report.replay.trajectorySteps, 101);
  assert.equal(built.report.replay.verifierTests, 45);
  assert.equal(built.report.replay.verifierPassed, 39);
  assert.equal(built.report.replay.verifierFailed, 6);
  assert.deepEqual(built.report.replay.exceptionTypes, { AgentTimeoutError: 3 });
  assert.equal(built.report.selection.selectedTaskOpportunityCensusWithinRunComplete,
    true);
  assert.equal(built.report.outcome.sameTaskTrialsAreFreshAttemptsNotOneLongitudinalRecoveryChain,
    true);
  assert.equal(built.report.outcome.longitudinalRecoveryRows, 0);
  assert.equal(built.report.boundary.authorizedTrainingRows, 0);
  assert.equal(built.report.boundary.authorityRows, 0);
});

test("source manifest and published artifact rederive exactly", () => {
  const built = buildTerminalBenchAdaptiveTrialsArtifactFromSourceDirectory(
    path.join(artifact, "source"));
  const stored = readFileSync(path.join(artifact, "source/source-manifest.json"));
  assert.deepEqual(serializeTerminalBenchAdaptiveTrialsArtifact(built.sourceManifest), stored);
  const checked = verifyTerminalBenchAdaptiveTrialsArtifactDirectory(artifact);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:fceb3dce83d0b383c912a18637a4e98db1c1a109231a34621cb005fef66a290f");
  assert.equal(checked.receipt.receiptHash,
    "sha256:7ca81ba52e4189c3abe4ea4ead78c2a87ffc8295d48c8e153d460bd66f19d5e9");
});

test("raw private payloads are not projected and source code is inert", () => {
  const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
  assert.equal(report.privacy.rawSourcePrivate, true);
  assert.equal(report.privacy.rawProjectionRows, 0);
  assert.equal(report.replay.rawPromptResponseDebugTrajectoryCastPaneAndVerifierTextProjected,
    false);
  assert.equal(report.safety.sourceCommandsExecutedDuringAcquisitionOrReplay, false);
  assert.equal(report.safety.taskSolutionExecuted, false);
  assert.equal(report.safety.taskVerifierExecuted, false);
  assert.equal(report.safety.encryptedProtectedTaskArchiveDecrypted, false);
  const strings = [];
  (function visit(value) {
    if (typeof value === "string") strings.push(value);
    else if (Array.isArray(value)) value.forEach(visit);
    else if (value && typeof value === "object") Object.values(value).forEach(visit);
  }(report));
  assert.equal(Math.max(...strings.map((value) => value.length)) < 300, true);
});

test("coherently rewritten report and receipt cannot replace source replay", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "terminal-bench-reseal-"));
  const copy = path.join(temporary, "artifact");
  try {
    cpSync(artifact, copy, { recursive: true, preserveTimestamps: true });
    normalizePrivateModes(copy);
    const report = JSON.parse(readFileSync(path.join(copy, "report.json"), "utf8"));
    report.boundary.authorizedTrainingRows = 1;
    report.artifactHash = `sha256:${"0".repeat(64)}`;
    const reportBytes = serializeTerminalBenchAdaptiveTrialsArtifact(report);
    writeFileSync(path.join(copy, "report.json"), reportBytes);
    chmodSync(path.join(copy, "report.json"), 0o600);
    const manifestBytes = readFileSync(path.join(copy, "source/source-manifest.json"));
    const receipt = createTerminalBenchAdaptiveTrialsReceipt(
      report, reportBytes, manifestBytes);
    writeFileSync(path.join(copy, "run-receipt.json"),
      serializeTerminalBenchAdaptiveTrialsArtifact(receipt));
    chmodSync(path.join(copy, "run-receipt.json"), 0o600);
    const checked = verifyTerminalBenchAdaptiveTrialsArtifactDirectory(copy);
    assert.equal(checked.ok, false);
    assert.match(checked.error, /REPORT_SOURCE_REPLAY_MISMATCH/u);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test("a selected source byte mutation is rejected", () => {
  const temporary = mkdtempSync(path.join(os.tmpdir(), "terminal-bench-source-"));
  const copy = path.join(temporary, "artifact");
  try {
    cpSync(artifact, copy, { recursive: true, preserveTimestamps: true });
    normalizePrivateModes(copy);
    const target = path.join(copy, "source/files/leaderboard", 
      "submissions/terminal-bench/2.0/Terminus2__DeepSeek-V3.2/metadata.yaml");
    const bytes = readFileSync(target);
    const changed = Buffer.from(bytes);
    changed[0] ^= 1;
    writeFileSync(target, changed);
    chmodSync(target, 0o600);
    const checked = verifyTerminalBenchAdaptiveTrialsArtifactDirectory(copy);
    assert.equal(checked.ok, false);
    assert.match(checked.error, /GIT_BLOB_PIN_MISMATCH/u);
  } finally { rmSync(temporary, { recursive: true, force: true }); }
});

test("artifact is private and acquisition is no-clobber", () => {
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-terminal-bench-adaptive-trials.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
