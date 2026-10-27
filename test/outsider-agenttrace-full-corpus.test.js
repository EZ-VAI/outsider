import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  AGENTTRACE_FULL_CORPUS_DISPOSITION,
  AGENTTRACE_PRODUCER_COMMIT,
  AGENTTRACE_REVISION,
  buildAgentTraceFullCorpusArtifactFromSourceDirectory,
  serializeAgentTraceFullCorpusArtifact,
  verifyAgentTraceFullCorpusArtifactDirectory,
} from "../src/outsider-agenttrace-full-corpus.js";

const artifact = path.resolve(
  "artifacts/outsider-agenttrace-full-corpus-20260829-v1");

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

test("complete AgentTrace revision and producer tree replay exactly", () => {
  const built = buildAgentTraceFullCorpusArtifactFromSourceDirectory(
    path.join(artifact, "source"));
  const report = built.report;
  assert.equal(report.disposition, AGENTTRACE_FULL_CORPUS_DISPOSITION);
  assert.equal(report.source.revision, AGENTTRACE_REVISION);
  assert.equal(report.source.completeFixedRevisionAcquired, true);
  assert.equal(report.source.fixedRevisionFiles, 72);
  assert.equal(report.source.fixedRevisionFileBytes, 48_810_139);
  assert.equal(report.source.rawJsonlBytes, 36_896_237);
  assert.equal(report.producer.commit, AGENTTRACE_PRODUCER_COMMIT);
  assert.equal(report.producer.byteExactSharedFiles, 70);
  assert.deepEqual(report.producer.huggingFaceOnlyPaths, [".gitattributes"]);
  assert.deepEqual(report.producer.githubOnlyPaths, []);
  const stored = readFileSync(path.join(artifact, "source/source-manifest.json"));
  assert.deepEqual(serializeAgentTraceFullCorpusArtifact(built.sourceManifest), stored);
});

test("all 1,400 raw rows crosswalk exactly to normalized Parquet", () => {
  const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
  assert.equal(report.replay.rawJsonlRows, 1_400);
  assert.equal(report.replay.normalizedParquetRows, 1_400);
  assert.equal(report.replay.rawAndNormalizedOrderExact, true);
  assert.equal(report.replay.allRawRowsCrosswalkExactlyToNormalizedRows, true);
  assert.deepEqual(report.replay.rawFileLineCounts, {
    "datasets/mbpp_0_6B_20260328T133144Z.jsonl": 500,
    "datasets/mbpp_1_7B_20260403T211347Z.jsonl": 500,
    "datasets/nl2bash_0_6B_20260328T133144Z.jsonl": 200,
    "datasets/nl2bash_1_7B_20260403T211347Z.jsonl": 200,
  });
  assert.deepEqual(Object.fromEntries(Object.entries(report.replay.sourceNativeGroups)
    .map(([key, value]) => [key, value.rows])), {
    "mbpp|Qwen/Qwen3-0.6B": 500,
    "mbpp|Qwen/Qwen3-1.7B": 500,
    "nl2bash|Qwen/Qwen3-0.6B": 200,
    "nl2bash|Qwen/Qwen3-1.7B": 200,
  });
  assert.equal(report.replay.overall.toolSpans, 3_609);
  assert.equal(report.replay.overall.llmSteps, 4_039);
  assert.deepEqual(report.replay.overall.toolNames,
    { bash: 843, final_answer: 1_313, python_interpreter: 1_453 });
});

test("fixture closure is exact while historical environment drift stays explicit", () => {
  const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
  assert.equal(report.replay.deterministicFixtureGeneratorReimplementedNotExecuted,
    true);
  assert.equal(report.replay.deterministicFixtureGeneratedDirectories, 16);
  assert.equal(report.replay.deterministicFixtureGeneratedFiles, 37);
  assert.equal(report.replay.deterministicFixtureGeneratedBytes, 10_137);
  assert.equal(report.replay.shippedFixtureFilesIncludingNoise, 38);
  assert.equal(report.replay.shippedFixtureBytesIncludingNoise, 500_335);
  assert.equal(report.replay.distinctPublisherFixtureVersions, 3);
  assert.equal(report.replay.currentFixtureVersion,
    "96ec6f42e9d91ecc795b6b7481138c0a0e023fdea8a93104e2d9d6fd98a93830");
  assert.equal(report.execution.singleShippedFixtureRecreatesEveryHistoricalExecutionEnvironment,
    false);
  assert.equal(report.replay.downloadedCommandsOrToolsExecuted, false);
});

test("exit status and follow-on actions are not promoted to outcome or recovery", () => {
  const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
  assert.equal(report.replay.overall.nonzeroExitSpans, 1_312);
  assert.equal(report.replay.overall.tracesWithNonzeroExit, 400);
  assert.equal(report.recovery.errorTracesWithLaterNonFinalToolSpan, 289);
  assert.equal(report.recovery.errorTracesWithLaterZeroExitNonFinalToolSpan, 116);
  assert.equal(report.outcome.publisherTerminalCorrectnessLabelPresent, false);
  assert.equal(report.outcome.publisherTerminalCorrectnessLabelRows, 0);
  assert.equal(report.outcome.independentlyEvaluatedOutcomeRows, 0);
  assert.equal(report.outcome.completeAttemptCensusRows, 0);
  assert.equal(report.recovery.publisherNativeRecoveryOutcomeLabelRows, 0);
  assert.equal(report.recovery.independentlyVerifiedRecoveryRows, 0);
  assert.equal(report.recovery.laterZeroExitPromotedToRecovery, false);
});

test("upstream rights, early masking, and privacy remain fail closed", () => {
  const report = JSON.parse(readFileSync(path.join(artifact, "report.json"), "utf8"));
  assert.equal(report.rights.traceCompilationLicenseClaim, "Apache-2.0");
  assert.equal(report.rights.mbppUpstreamDatasetLicenseClaim, "CC-BY-4.0");
  assert.equal(report.rights.curatedNl2bashDatasetLicenseDeclared, false);
  assert.equal(report.rights.intercodeFrameworkLicenseClaim, "MIT");
  assert.equal(report.rights.frameworkLicenseResolvesCuratedDatasetRights, false);
  assert.equal(report.rights.authorizedTrainingRows, 0);
  assert.equal(report.privacy.publisherEarlyOutputMaskingNarrativePresent, true);
  assert.equal(report.privacy.publisherRedactionMarkerRows, 36);
  assert.equal(report.privacy.publisherRedactionMarkerOccurrences, 775);
  assert.equal(report.privacy.noPiiOrSecretGuaranteed, false);
  assert.equal(report.privacy.rawProjectionRows, 0);
  assert.equal(report.boundary.productionTrainingRows, 0);
  assert.equal(report.boundary.networkAdmissionRows, 0);
  assert.equal(report.boundary.authorityRows, 0);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyAgentTraceFullCorpusArtifactDirectory(artifact);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:c2b84d58f50da0fbb3d39f26072c7cf1813616c5adff223bb8e240b779e182ca");
  assert.equal(checked.receipt.receiptHash,
    "sha256:e3d069197fabb7f2c8204d7a0526b273b99978976ad7e9782b6f5286cf7265b9");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-agenttrace-full-corpus.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
