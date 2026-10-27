import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  TRACE_COMMONS_AGENT_SESSIONS_DISPOSITION,
  TRACE_COMMONS_REVISION,
  buildTraceCommonsAgentSessionsArtifactFromSourceDirectory,
  serializeTraceCommonsAgentSessionsArtifact,
  verifyTraceCommonsAgentSessionsArtifactDirectory,
} from "../src/outsider-trace-commons-agent-sessions.js";

const artifact = path.resolve(
  "artifacts/outsider-trace-commons-agent-sessions-20260829-v1");

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

test("complete fixed revision replays thirty donated agent sessions", () => {
  const built = buildTraceCommonsAgentSessionsArtifactFromSourceDirectory(
    path.join(artifact, "source"));
  const report = built.report;
  assert.equal(report.disposition, TRACE_COMMONS_AGENT_SESSIONS_DISPOSITION);
  assert.equal(report.source.revision, TRACE_COMMONS_REVISION);
  assert.equal(report.source.completeFixedRevisionAcquired, true);
  assert.equal(report.source.fixedRevisionFiles, 37);
  assert.equal(report.source.fixedRevisionFileBytes, 127_441_063);
  assert.equal(report.replay.rawSourceSessionFiles, 30);
  assert.equal(report.replay.rawSourceSessionBytes, 57_228_063);
  assert.equal(report.replay.normalizedParquetRows, 30);
  assert.equal(report.replay.allThirtyParquetRowsCrosswalkToDistinctRawSourceFiles,
    true);
  assert.deepEqual(report.replay.pathHarnessRows,
    { claude_code: 28, cursor: 1, opencode: 1 });
  assert.deepEqual(report.replay.normalizedHarnessValues,
    { claude_code: 28, null: 2 });
  assert.equal(report.replay.rawJsonlRecords, 18_011);
  assert.equal(report.replay.rawJsonDocuments, 1);
  assert.equal(report.replay.normalizedMessageRecords, 9_338);
  assert.equal(report.replay.normalizedToolDefinitionRecords, 2_514);
  assert.equal(report.replay.normalizedTraceRecords, 18_012);
  assert.equal(report.replay.declaredToolCallCount, 4_264);
  assert.equal(report.replay.declaredUserMessageCount, 413);
  const stored = readFileSync(path.join(artifact, "source/source-manifest.json"));
  assert.deepEqual(serializeTraceCommonsAgentSessionsArtifact(built.sourceManifest),
    stored);
});

test("published report and receipt reproduce exactly from all source bytes", () => {
  const checked = verifyTraceCommonsAgentSessionsArtifactDirectory(artifact);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:b36b15b2e581d376a627c122b2ca04fd61745af4573678fb47377486446fd92d");
  assert.equal(checked.receipt.receiptHash,
    "sha256:11588c1fd62e8602c1ec92b40fa1b820490d500be3e5d030d406b09cd606a543");
});

test("privacy and rights gates remain fail closed", () => {
  const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
  assert.equal(report.replay.highConfidenceSecretPatternCandidates, 0);
  assert.equal(report.replay.emailPatternCandidates, 8);
  assert.equal(report.replay.privacyPatternScanIsNotAnonymityProof, true);
  assert.equal(report.privacy.anonymizationCertified, false);
  assert.equal(report.privacy.noPiiOrSecretGuaranteed, false);
  assert.equal(report.privacy.rawProjectionRows, 0);
  assert.equal(report.rights.compilationLicenseClaim, "CC-BY-4.0");
  assert.equal(report.rights.embeddedCodeAndContentLicensesIndependentlyVerified,
    false);
  assert.equal(report.rights.perTraceUseSpecificTrainingAuthorizationEstablished,
    false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.boundary.productionTrainingRows, 0);
  assert.equal(report.boundary.authorityRows, 0);
});

test("the corpus is not promoted into outcome or recovery evidence", () => {
  const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
  assert.equal(report.outcome.normalizedTerminalOutcomeColumnPresent, false);
  assert.equal(report.outcome.independentlyEvaluatedOutcomeRows, 0);
  assert.equal(report.outcome.completeAttemptCensusRows, 0);
  assert.equal(report.outcome.longitudinalRecoveryRows, 0);
  assert.equal(report.outcome.realWorldEffectRows, 0);
  assert.equal(report.selection.completeAgentUsagePopulation, false);
  assert.equal(report.selection.representativeOfAgentUsageEstablished, false);
  assert.equal(report.selection.sourceUniverseExhausted, false);
});

test("artifact is private and acquisition remains no-clobber", () => {
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-trace-commons-agent-sessions.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});

