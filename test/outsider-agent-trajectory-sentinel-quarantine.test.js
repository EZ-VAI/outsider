import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync, cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { canonicalizeStrict } from "../src/canonical.js";
import {
  AGENT_TRAJECTORY_SENTINEL_DISPOSITION,
  AGENT_TRAJECTORY_SENTINEL_EXPECTED_DATA_BYTES,
  AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT,
  AGENT_TRAJECTORY_SENTINEL_HF_REVISION,
  buildAgentTrajectorySentinelQuarantineFromDirectory,
  publishAgentTrajectorySentinelArtifactDirectory,
  verifyAgentTrajectorySentinelArtifactDirectory,
  verifyAgentTrajectorySentinelQuarantine,
} from "../src/outsider-agent-trajectory-sentinel-quarantine.js";

const ARTIFACT = path.resolve(
  "artifacts/outsider-agent-trajectory-sentinel-quarantine-20260829-v2",
);
const SUPERSEDED_ARTIFACT = path.resolve(
  "artifacts/outsider-agent-trajectory-sentinel-quarantine-20260828-v1",
);
const SOURCE = path.join(ARTIFACT, "source");
const REPORT_FILE = path.join(ARTIFACT, "report.json");

function loadReport() {
  return JSON.parse(readFileSync(REPORT_FILE, "utf8"));
}

function normalizePrivateTree(root) {
  const status = lstatSync(root);
  if (status.isDirectory() && !status.isSymbolicLink()) {
    chmodSync(root, 0o700);
    for (const name of readdirSync(root)) normalizePrivateTree(path.join(root, name));
  } else if (status.isFile()) chmodSync(root, 0o600);
}

function copiedSource() {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-ats-source-test-"));
  chmodSync(parent, 0o700);
  const source = path.join(parent, "source");
  cpSync(SOURCE, source, { recursive: true, preserveTimestamps: true });
  normalizePrivateTree(source);
  return { parent, source };
}

function resealReport(report) {
  const body = { ...report };
  delete body.reportHash;
  report.reportHash = `sha256:${createHash("sha256").update(Buffer.from(
    `outsider/agent-trajectory-sentinel-quarantine-report/v2\0${canonicalizeStrict(body)}`,
    "utf8",
  )).digest("hex")}`;
  return report;
}

function fileSha256(file) {
  return `sha256:${createHash("sha256").update(readFileSync(file)).digest("hex")}`;
}

test("pinned 55+55 artifact fully source-replays but remains evaluation-only", () => {
  const report = loadReport();
  const checked = verifyAgentTrajectorySentinelArtifactDirectory(ARTIFACT);
  assert.equal(checked.ok, true);
  assert.equal(report.sourcePins.githubCommit, AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT);
  assert.equal(report.sourcePins.huggingFaceRevision,
    AGENT_TRAJECTORY_SENTINEL_HF_REVISION);
  assert.equal(report.sourcePins.githubTreeAncestryVerified, true);
  assert.equal(report.disposition, AGENT_TRAJECTORY_SENTINEL_DISPOSITION);
  assert.equal(report.boundedSlice.sourceEpisodes, 55);
  assert.equal(report.boundedSlice.recoveryEpisodes, 55);
  assert.equal(report.boundedSlice.pairedEpisodes, 55);
  assert.equal(report.boundedSlice.rawDataObjects, 112);
  assert.equal(report.boundedSlice.rawDataBytes,
    AGENT_TRAJECTORY_SENTINEL_EXPECTED_DATA_BYTES);
  assert.equal(report.boundedSlice.sourceTraceBytes, 675_606);
  assert.equal(report.boundedSlice.recoveryTraceBytes, 704_924);
  assert.equal(report.boundedSlice.sourceManifestBytes, 39_709);
  assert.equal(report.boundedSlice.repairPolicyCsvBytes, 115_955);
  assert.equal(report.boundedSlice.allSourceRowsReplayed, true);
  assert.equal(report.boundedSlice.allRecoveryRowsReplayed, true);
  assert.equal(report.boundedSlice.prefixPairingReplayed, true);
  assert.equal(report.replayedPublisherClaims.publisherNowCorrectTrue, 24);
  assert.equal(report.replayedPublisherClaims.publisherNowCorrectFalse, 31);
  assert.deepEqual(report.replayedPublisherClaims.publisherLabelCounts,
    { arithmetic_error: 37, hallucinated: 5, incomplete: 13 });
  assert.equal(report.replayedPublisherClaims.authorityStatus,
    "PUBLISHER_CLAIM_ONLY_NOT_OUTCOME_TRUTH");
  assert.equal(report.replayedPublisherClaims.externalAffectedPartyOutcomeObserved, false);
  assert.equal(report.replayedPublisherClaims.longitudinalRecoveryObserved, false);

  assert.equal(report.rights.intendedUse, "EVALUATE_MONITORS_NOT_TRAIN_AGENTS");
  assert.equal(report.rights.rightsGate, "FAIL_CLOSED");
  assert.equal(report.rights.qwenEpisodeCountCrosscheck.tableTotal, 3_005);
  assert.equal(report.rights.qwenEpisodeCountCrosscheck.licensingParagraphTotal, 2_247);
  assert.equal(report.rights.qwenEpisodeCountCrosscheck.reconciled, false);
  assert.equal(report.rights.qwenEpisodeCountCrosscheck.unresolvedDifference, 758);
  assert.equal(report.privacy.secretPatternHits, 0);
  assert.equal(report.privacy.highConfidencePiiPatternHits, 0);
  assert.equal(report.privacy.heuristicNotGuarantee, true);

  for (const key of ["admittedEpisodeRows", "offlineResearchTrainingRows",
    "productionTrainingRows", "networkAdmissionRows", "networkProjectionRows",
    "rawTraceProjectionRows", "CEU", "creditUnits", "pricingRows",
    "authorityUnits", "actionRows"]) assert.equal(report.useBoundary[key], 0, key);
  assert.equal(report.useBoundary.trainingDecision,
    "KEEP_BASELINE_RIGHTS_FAIL_CLOSED_ZERO_TRAINING_ROWS");
  assert.equal(report.reportHash,
    "sha256:d96a6aef51acdc5490291ff5990e517eef4bd46593610af34a67f7e9de929920");
  assert.equal(checked.sourceRoot,
    "sha256:1596ea34dee9f7614398a1e241f6bb5776a3adb966fcbc343c49068c725952ec");
  assert.equal(checked.pairingRoot,
    "sha256:b0b1624fc53d34c25e5f8d04c954e848c5832d605da638c4e874ca7f2d1a77e4");
  assert.equal(checked.reportFileSha256,
    "sha256:b71b207ac23ce15ea339b91c79c25402abe1bff024c86fa12b61aef182b4a89f");
});

test("coherently resealed authority or training promotion still fails source replay", () => {
  const report = loadReport();
  report.useBoundary.offlineResearchTrainingRows = 55;
  report.useBoundary.trainingDecision = "PROMOTE";
  report.rights.rightsGate = "PASS";
  resealReport(report);
  const checked = verifyAgentTrajectorySentinelQuarantine(report,
    { sourceDirectory: SOURCE });
  assert.equal(checked.ok, false);
  assert.match(checked.error, /SOURCE_REPLAY_MISMATCH/u);
});

test("a coherently resealed run receipt cannot promote training", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-ats-artifact-test-"));
  chmodSync(parent, 0o700);
  const artifact = path.join(parent, "artifact");
  cpSync(ARTIFACT, artifact, { recursive: true, preserveTimestamps: true });
  normalizePrivateTree(artifact);
  try {
    const receiptFile = path.join(artifact, "run-receipt.json");
    const receipt = JSON.parse(readFileSync(receiptFile, "utf8"));
    receipt.trainingRows = 55;
    const body = { ...receipt };
    delete body.receiptHash;
    receipt.receiptHash = `sha256:${createHash("sha256").update(Buffer.from(
      `outsider/agent-trajectory-sentinel-run-receipt/v2\0${canonicalizeStrict(body)}`,
      "utf8",
    )).digest("hex")}`;
    writeFileSync(receiptFile, `${canonicalizeStrict(receipt)}\n`, { mode: 0o600 });
    chmodSync(receiptFile, 0o600);
    const checked = verifyAgentTrajectorySentinelArtifactDirectory(artifact);
    assert.equal(checked.ok, false);
    assert.match(checked.error, /ARTIFACT_RECEIPT_MISMATCH/u);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("same-size raw trace mutation and rights mutation are rejected", () => {
  const first = copiedSource();
  const second = copiedSource();
  try {
    const trace = path.join(first.source, "raw", "source", "organic-demo-001.jsonl");
    const traceBytes = readFileSync(trace);
    traceBytes[0] = traceBytes[0] === 0x7b ? 0x5b : 0x7b;
    writeFileSync(trace, traceBytes, { mode: 0o600 });
    chmodSync(trace, 0o600);
    const traceChecked = verifyAgentTrajectorySentinelQuarantine(loadReport(),
      { sourceDirectory: first.source });
    assert.equal(traceChecked.ok, false);
    assert.match(traceChecked.error, /SOURCE_TRACE_BLOB_MISMATCH/u);

    const rightsFile = path.join(second.source, "rights", "hf-README.md");
    const rightsBytes = readFileSync(rightsFile);
    rightsBytes[100] ^= 1;
    writeFileSync(rightsFile, rightsBytes, { mode: 0o600 });
    chmodSync(rightsFile, 0o600);
    const rightsChecked = verifyAgentTrajectorySentinelQuarantine(loadReport(),
      { sourceDirectory: second.source });
    assert.equal(rightsChecked.ok, false);
    assert.match(rightsChecked.error, /PINNED_FILE_MISMATCH/u);
  } finally {
    rmSync(first.parent, { recursive: true, force: true });
    rmSync(second.parent, { recursive: true, force: true });
  }
});

test("every GitHub ancestry edge is artifact-bound and an intermediate tree tamper fails", () => {
  const copy = copiedSource();
  try {
    const tracesFile = path.join(copy.source, "metadata", "github-traces-tree.json");
    const traces = JSON.parse(readFileSync(tracesFile, "utf8"));
    const sourceMember = traces.tree.find((entry) => entry.path === "organic_demo7b_cold");
    assert.ok(sourceMember);
    sourceMember.path = "organic_demo7b_c0ld";
    writeFileSync(tracesFile, JSON.stringify(traces), { mode: 0o600 });
    chmodSync(tracesFile, 0o600);
    const checked = verifyAgentTrajectorySentinelQuarantine(loadReport(),
      { sourceDirectory: copy.source });
    assert.equal(checked.ok, false);
    assert.match(checked.error, /TRACES_TREE_OBJECT_HASH_MISMATCH/u);
  } finally {
    rmSync(copy.parent, { recursive: true, force: true });
  }
});

test("private path policy rejects permissive files and source symlinks", () => {
  const modeCopy = copiedSource();
  const symlinkCopy = copiedSource();
  try {
    const manifest = path.join(modeCopy.source, "raw", "source", "manifest.json");
    chmodSync(manifest, 0o644);
    assert.throws(() => buildAgentTrajectorySentinelQuarantineFromDirectory(modeCopy.source),
      /SOURCE_FILE_UNSAFE/u);

    const victim = path.join(symlinkCopy.source, "raw", "source",
      "organic-demo-001.jsonl");
    unlinkSync(victim);
    symlinkSync(path.join(SOURCE, "raw", "source", "organic-demo-001.jsonl"), victim);
    assert.throws(() => buildAgentTrajectorySentinelQuarantineFromDirectory(symlinkCopy.source),
      /SOURCE_FILE_UNSAFE/u);
  } finally {
    rmSync(modeCopy.parent, { recursive: true, force: true });
    rmSync(symlinkCopy.parent, { recursive: true, force: true });
  }
});

test("open-descriptor read detects a deterministic same-size TOCTOU mutation", () => {
  const copy = copiedSource();
  const victim = path.join(copy.source, "raw", "source", "organic-demo-001.jsonl");
  const moduleUrl = pathToFileURL(path.resolve(
    "src/outsider-agent-trajectory-sentinel-quarantine.js")).href;
  const child = `
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    const victim = ${JSON.stringify(victim)};
    const originalOpen = fs.openSync.bind(fs);
    const originalRead = fs.readFileSync.bind(fs);
    const originalWrite = fs.writeFileSync.bind(fs);
    let victimDescriptor = -1;
    let mutated = false;
    fs.openSync = function(target, flags, ...rest) {
      const descriptor = originalOpen(target, flags, ...rest);
      if (String(target) === victim) victimDescriptor = descriptor;
      return descriptor;
    };
    fs.readFileSync = function(target, ...rest) {
      const bytes = originalRead(target, ...rest);
      if (target === victimDescriptor && !mutated) {
        const changed = Buffer.from(bytes);
        changed[0] = changed[0] === 0x7b ? 0x5b : 0x7b;
        originalWrite(victim, changed, { mode: 0o600 });
        mutated = true;
      }
      return bytes;
    };
    syncBuiltinESMExports();
    const moduleUnderTest = await import(${JSON.stringify(moduleUrl)});
    try {
      moduleUnderTest.buildAgentTrajectorySentinelQuarantineFromDirectory(
        ${JSON.stringify(copy.source)});
      process.exitCode = 2;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!/SOURCE_FILE_CHANGED_DURING_READ|SOURCE_SNAPSHOT_CHANGED/u.test(message)) {
        process.stderr.write(message + "\\n");
        process.exitCode = 3;
      } else process.stdout.write("toctou-detected\\n");
    }
  `;
  try {
    const output = execFileSync(process.execPath,
      ["--input-type=module", "-e", child], { encoding: "utf8" });
    assert.equal(output, "toctou-detected\n");
  } finally {
    rmSync(copy.parent, { recursive: true, force: true });
  }
});

test("outer artifact root exact layout is rechecked against a deterministic TOCTOU insert", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-ats-root-toctou-test-"));
  chmodSync(parent, 0o700);
  const artifact = path.join(parent, "artifact");
  cpSync(ARTIFACT, artifact, { recursive: true, preserveTimestamps: true });
  normalizePrivateTree(artifact);
  const moduleUrl = pathToFileURL(path.resolve(
    "src/outsider-agent-trajectory-sentinel-quarantine.js")).href;
  const child = `
    import fs from "node:fs";
    import path from "node:path";
    import { syncBuiltinESMExports } from "node:module";
    const artifact = ${JSON.stringify(artifact)};
    const report = path.join(artifact, "report.json");
    const originalOpen = fs.openSync.bind(fs);
    const originalRead = fs.readFileSync.bind(fs);
    const originalWrite = fs.writeFileSync.bind(fs);
    let reportDescriptor = -1;
    let injected = false;
    fs.openSync = function(target, flags, ...rest) {
      const descriptor = originalOpen(target, flags, ...rest);
      if (path.resolve(String(target)) === path.resolve(report)) reportDescriptor = descriptor;
      return descriptor;
    };
    fs.readFileSync = function(target, ...rest) {
      const bytes = originalRead(target, ...rest);
      if (!injected && target === reportDescriptor) {
        injected = true;
        originalWrite(path.join(artifact, "unexpected-private-file"), "x", {
          flag: "wx", mode: 0o600,
        });
      }
      return bytes;
    };
    syncBuiltinESMExports();
    const moduleUnderTest = await import(${JSON.stringify(moduleUrl)});
    const checked = moduleUnderTest.verifyAgentTrajectorySentinelArtifactDirectory(artifact);
    if (checked.ok || !/DIRECTORY_CHANGED_DURING_READ|SOURCE_SNAPSHOT/u.test(
      checked.error ?? "")) {
      process.stderr.write(JSON.stringify(checked) + "\\n");
      process.exitCode = 3;
    } else process.stdout.write("outer-root-toctou-detected\\n");
  `;
  try {
    const output = execFileSync(process.execPath,
      ["--input-type=module", "-e", child], { encoding: "utf8" });
    assert.equal(output, "outer-root-toctou-detected\n");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("outer artifact root mode is stable across the initial and final snapshots", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-ats-root-mode-test-"));
  chmodSync(parent, 0o700);
  const artifact = path.join(parent, "artifact");
  cpSync(ARTIFACT, artifact, { recursive: true, preserveTimestamps: true });
  normalizePrivateTree(artifact);
  const moduleUrl = pathToFileURL(path.resolve(
    "src/outsider-agent-trajectory-sentinel-quarantine.js")).href;
  const child = `
    import fs from "node:fs";
    import path from "node:path";
    import { syncBuiltinESMExports } from "node:module";
    const artifact = ${JSON.stringify(artifact)};
    const report = path.join(artifact, "report.json");
    const originalOpen = fs.openSync.bind(fs);
    const originalRead = fs.readFileSync.bind(fs);
    const originalChmod = fs.chmodSync.bind(fs);
    let reportDescriptor = -1;
    let injected = false;
    fs.openSync = function(target, flags, ...rest) {
      const descriptor = originalOpen(target, flags, ...rest);
      if (path.resolve(String(target)) === path.resolve(report)) reportDescriptor = descriptor;
      return descriptor;
    };
    fs.readFileSync = function(target, ...rest) {
      const bytes = originalRead(target, ...rest);
      if (!injected && target === reportDescriptor) {
        injected = true;
        originalChmod(artifact, 0o755);
      }
      return bytes;
    };
    syncBuiltinESMExports();
    const moduleUnderTest = await import(${JSON.stringify(moduleUrl)});
    const checked = moduleUnderTest.verifyAgentTrajectorySentinelArtifactDirectory(artifact);
    if (checked.ok || !/DIRECTORY_CHANGED_DURING_READ|SOURCE_SNAPSHOT/u.test(
      checked.error ?? "")) {
      process.stderr.write(JSON.stringify(checked) + "\\n");
      process.exitCode = 3;
    } else process.stdout.write("outer-root-mode-toctou-detected\\n");
  `;
  try {
    const output = execFileSync(process.execPath,
      ["--input-type=module", "-e", child], { encoding: "utf8" });
    assert.equal(output, "outer-root-mode-toctou-detected\n");
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("atomic publication never replaces a racer-owned target", () => {
  const parent = mkdtempSync(path.join(tmpdir(), "outsider-ats-publish-test-"));
  chmodSync(parent, 0o700);
  const staging = path.join(parent, ".staging");
  const target = path.join(parent, "artifact");
  try {
    mkdirSync(staging, { mode: 0o700 });
    chmodSync(staging, 0o700);
    mkdirSync(path.join(staging, "source"), { mode: 0o700 });
    chmodSync(path.join(staging, "source"), 0o700);
    writeFileSync(path.join(staging, "report.json"), "{}\n", { mode: 0o600 });
    writeFileSync(path.join(staging, "run-receipt.json"), "{}\n", { mode: 0o600 });
    mkdirSync(target, { mode: 0o700 });
    chmodSync(target, 0o700);
    const before = lstatSync(target, { bigint: true });
    assert.throws(() => publishAgentTrajectorySentinelArtifactDirectory(staging, target),
      /TARGET_CLAIM_FAILED/u);
    const after = lstatSync(target, { bigint: true });
    assert.equal(after.dev, before.dev);
    assert.equal(after.ino, before.ino);
    assert.deepEqual(readdirSync(target), []);
    assert.equal(existsSync(staging), true);

    rmSync(target, { recursive: true, force: true });
    assert.equal(publishAgentTrajectorySentinelArtifactDirectory(staging, target), target);
    assert.equal(existsSync(staging), false);
    assert.deepEqual(readdirSync(target).sort(),
      ["report.json", "run-receipt.json", "source"]);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
});

test("every acquired raw/control file is 0600 and every artifact directory is 0700", () => {
  function visit(target) {
    const status = lstatSync(target);
    if (status.isDirectory()) {
      assert.equal(status.isSymbolicLink(), false);
      assert.equal(status.mode & 0o777, 0o700, target);
      for (const name of readdirSync(target)) visit(path.join(target, name));
    } else {
      assert.equal(status.isFile(), true);
      assert.equal(status.mode & 0o777, 0o600, target);
    }
  }
  visit(ARTIFACT);
});

test("v1 bytes remain preserved and a private fail-closed supersession marker rejects it", () => {
  const reportFile = path.join(SUPERSEDED_ARTIFACT, "report.json");
  const receiptFile = path.join(SUPERSEDED_ARTIFACT, "run-receipt.json");
  assert.equal(fileSha256(reportFile),
    "sha256:620b8fd77568d13238da6a2680d37234dfc551b19b70d9d84c6d56d5e26b01a6");
  assert.equal(fileSha256(receiptFile),
    "sha256:11d2e8e046db172cc79cda448e010cf417a215f30dabb1c5c2eed294966b461b");
  const oldReport = JSON.parse(readFileSync(reportFile, "utf8"));
  for (const item of [...oldReport.inventory, ...oldReport.metadataInventory,
    ...oldReport.rights.evidence]) {
    assert.equal(fileSha256(path.join(SUPERSEDED_ARTIFACT, "source", item.path)),
      item.sha256, item.path);
  }
  const markerFile = path.join(SUPERSEDED_ARTIFACT, "REJECTED-SUPERSEDED.json");
  assert.equal(lstatSync(markerFile).mode & 0o777, 0o600);
  const marker = JSON.parse(readFileSync(markerFile, "utf8"));
  assert.equal(marker.status, "REJECTED_SUPERSEDED");
  assert.equal(marker.supersedingReportHash,
    "sha256:d96a6aef51acdc5490291ff5990e517eef4bd46593610af34a67f7e9de929920");
  const markerBody = { ...marker };
  delete markerBody.markerHash;
  assert.equal(marker.markerHash, `sha256:${createHash("sha256").update(Buffer.from(
    `outsider/agent-trajectory-sentinel-artifact-supersession/v1\0${
      canonicalizeStrict(markerBody)}`, "utf8",
  )).digest("hex")}`);
});
