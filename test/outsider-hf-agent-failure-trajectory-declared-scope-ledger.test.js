import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  HF_AGENT_FAILURE_TRAJECTORY_ALREADY_ACQUIRED_IDS,
  HF_AGENT_FAILURE_TRAJECTORY_DISPOSITION,
  HF_AGENT_FAILURE_TRAJECTORY_QUERIES,
  HF_AGENT_FAILURE_TRAJECTORY_SCOPE,
  verifyHfAgentFailureTrajectoryArtifactDirectory,
} from "../src/outsider-hf-agent-failure-trajectory-declared-scope-ledger.js";

const artifact = path.resolve(
  "artifacts/outsider-hf-agent-failure-trajectory-declared-scope-ledger-20260829-v1");
const reportBytes = readFileSync(path.join(artifact, "report.json"));
const report = JSON.parse(reportBytes);

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

test("four exact official query brackets replay the 92-record declared union", () => {
  assert.equal(report.disposition, HF_AGENT_FAILURE_TRAJECTORY_DISPOSITION);
  assert.equal(report.scope.kind, HF_AGENT_FAILURE_TRAJECTORY_SCOPE);
  assert.deepEqual(report.scope.exactQueries.map((query) => [
    query.term, query.full, query.limit, query.records,
  ]), [
    ["agent trajectory", true, 1_000, 36],
    ["agent trajectories", true, 1_000, 48],
    ["tool use trajectory", true, 1_000, 0],
    ["agent failure", true, 1_000, 8],
  ]);
  assert.equal(HF_AGENT_FAILURE_TRAJECTORY_QUERIES.length, 4);
  assert.equal(report.scope.queryResultRows, 92);
  assert.equal(report.scope.unionDatasetRecords, 92);
  assert.equal(report.source.queryBeforeAfterExact, true);
  assert.equal(report.source.querySummaries.every((query) =>
    query.beforeAfterExactBytes), true);
  for (const query of HF_AGENT_FAILURE_TRAJECTORY_QUERIES) {
    const before = readFileSync(path.join(artifact, "source/queries",
      `${query.key}-before.json`));
    const after = readFileSync(path.join(artifact, "source/queries",
      `${query.key}-after.json`));
    assert.deepEqual(before, after);
    assert.equal(before.length, query.expectedBytes);
    assert.equal(`sha256:${sha256(before)}`, query.expectedSha256);
    assert.equal(JSON.parse(before).length, query.expectedRecords);
  }
  assert.equal(report.source.sourceManifestHash,
    "sha256:7a4ba52dbf293b3e23660597ab94228c0579221948e2b9999f7ed9aec2049c2b");
  assert.equal(report.source.sourceRoot,
    "sha256:40d7823c8e0232ca46de1c1c99d77cd626fb1e4c46d180c24b01f3a481089154");
});

test("every candidate has one terminal discovery disposition without global overclaim", () => {
  const entries = report.candidateLedger.entries;
  assert.equal(report.discovery.declaredScopeExhausted, true);
  assert.equal(report.discovery.globalExhaustion, false);
  assert.equal(report.discovery.sourceUniverseExhausted, false);
  assert.equal(report.discovery.unionDatasetRecords, 92);
  assert.equal(report.discovery.terminalDatasetRecords, 92);
  assert.equal(report.discovery.publicRecords, 92);
  assert.equal(report.discovery.publicUngatedRecords, 84);
  assert.equal(report.discovery.gatedRecords, 8);
  assert.equal(report.discovery.gatedAutoRecords, 3);
  assert.equal(report.discovery.gatedManualRecords, 5);
  assert.equal(report.discovery.privateRecords, 0);
  assert.equal(report.discovery.disabledRecords, 0);
  assert.deepEqual(report.discovery.dispositionCounts, {
    ALREADY_ACQUIRED_CURRENT_WORKTREE: 17,
    DUPLICATE_OR_MIRROR: 2,
    GATED_NO_BYPASS: 8,
    METADATA_ONLY: 41,
    PENDING_PRIORITY_ACQUISITION: 20,
    SYNTHETIC_TRAINING_ONLY_NO_OUTCOME: 4,
  });
  assert.equal(entries.length, 92);
  assert.equal(new Set(entries.map((entry) => entry.datasetId)).size, 92);
  assert.deepEqual(entries.map((entry) => entry.datasetId),
    [...entries.map((entry) => entry.datasetId)].sort((left, right) =>
      left.localeCompare(right)));
  assert.equal(entries.every((entry) => entry.disposition.terminal === true), true);
  assert.equal(report.scope.terminalMeansSearchRecordDispositionNotPayloadExhaustion,
    true);
  assert.equal(report.scope.payloadFilesAcquiredByThisLedger, 0);
  assert.equal(report.scope.payloadBytesAcquiredByThisLedger, 0);
});

test("current-worktree byte coverage is snapshotted without reacquiring it", () => {
  const entries = report.candidateLedger.entries;
  const acquired = entries.filter((entry) => entry.disposition.code
    === "ALREADY_ACQUIRED_CURRENT_WORKTREE");
  assert.deepEqual(acquired.map((entry) => entry.datasetId).sort(),
    [...HF_AGENT_FAILURE_TRAJECTORY_ALREADY_ACQUIRED_IDS]);
  assert.equal(report.worktreeCoverage.evidenceGroups, 7);
  assert.equal(report.worktreeCoverage.alreadyAcquiredDatasetRecords, 17);
  assert.equal(report.worktreeCoverage.metadataOnlyExistingDatasetRecords, 1);
  assert.equal(report.worktreeCoverage.existingAdaptersModifiedByThisLedger, false);
  const mcp = entries.find((entry) => entry.datasetId
    === "obaydata/mcp-agent-trajectory-benchmark");
  assert.equal(mcp.disposition.code, "ALREADY_ACQUIRED_CURRENT_WORKTREE");
  assert.equal(mcp.worktreeCoverage.kind,
    "PINNED_FULL_413_FILE_REPOSITORY_BYTES");
  const yoonjung = acquired.filter((entry) => entry.datasetId
    .startsWith("yoonjung0705/"));
  assert.equal(yoonjung.length, 12);
  assert.equal(yoonjung.every((entry) => entry.worktreeCoverage.kind
    === "FULL_12_REPOSITORY_NO_VIDEO_BYTE_AND_PYARROW_REPLAY"), true);
  const cx = entries.find((entry) => entry.datasetId === "cx-cmu/agent_trajectories");
  assert.equal(cx.disposition.code, "GATED_NO_BYPASS");
  assert.equal(cx.worktreeCoverage.kind,
    "EXISTING_METADATA_ONLY_GATED_NO_LICENSE_DISPOSITION");
});

test("priority queue is projection-bound and downloads no candidate payload", () => {
  const queue = report.priorityQueue.entries;
  assert.equal(report.priorityQueue.queuedDatasetRecords, 20);
  assert.equal(report.priorityQueue.payloadDownloadsPerformedByThisLedger, 0);
  assert.deepEqual(queue.map((entry) => entry.rank),
    Array.from({ length: 20 }, (_, index) => index + 1));
  assert.equal(queue.every((entry) => entry.gated === false
    && entry.payloadBytesAcquiredByThisLedger === 0), true);
  assert.deepEqual(queue.slice(0, 7).map((entry) => entry.datasetId), [
    "agent-eto/eto-sft-trajectory",
    "zake7749/Qwen-3.6-plus-agent-tool-calling-trajectory",
    "agent-distillation/Qwen2.5-32B-Instruct_cot_trajectories_2k",
    "JetBrains-Research/agent-trajectories-swesmith-random-subset",
    "AlexWortega/agent-launch-pad-trajectories",
    "SecureAI-SE/fuzz-agent-trajectories",
    "GXCafe/ai-agent-failure-logs",
  ]);
  assert.equal(queue[0].reasonCode,
    "PUBLISHER_ITERATIVE_FAILURE_TRAJECTORY_COLLECTION");
  assert.equal(queue[1].reasonCode,
    "PUBLISHER_PASSING_NEAR_PASSING_REWARD_AND_SCORE_SIGNALS");
  assert.equal(queue.at(-1).datasetId,
    "AgentNativeResearchLab/arc-agi3-ka59-agent-trajectories");
});

test("rights, privacy, active content, outcome, recovery, and authority fail closed", () => {
  const entries = report.candidateLedger.entries;
  assert.equal(report.candidateLedger.rawDescriptionProjectionRows, 0);
  assert.equal(report.candidateLedger.rawPayloadProjectionRows, 0);
  assert.doesNotMatch(reportBytes.toString("utf8"), /"description":/u);
  assert.equal(entries.every((entry) =>
    entry.rights.useSpecificRightsIndependentlyAdjudicated === false
    && entry.rights.authorizedTrainingRows === 0
    && entry.privacy.noPiiOrSensitiveDataGuaranteed === false
    && entry.privacy.rawPayloadBytesAcquiredByThisLedger === 0
    && entry.activeContent.payloadExecuted === false
    && entry.activeContent.safeToExecuteEstablished === false
    && entry.outcomeBoundary.publisherNativeOutcomeRowsReplayedByThisLedger === 0
    && entry.outcomeBoundary.independentlyVerifiedOutcomeRows === 0
    && entry.outcomeBoundary.independentlyVerifiedRecoveryRows === 0
    && entry.outcomeBoundary.completeAttemptCensusEstablished === false
    && entry.useBoundary.authorizedTrainingRows === 0
    && entry.useBoundary.networkAdmissionRows === 0
    && entry.useBoundary.authorityRows === 0
    && entry.useBoundary.ceuRows === 0), true);
  assert.deepEqual(report.rights.publisherLicenseClaimCounts, {
    UNDECLARED: 42, "apache-2.0": 15, "cc-by-4.0": 19,
    "cc-by-nc-nd-4.0": 1, mit: 12, other: 3,
  });
  assert.equal(report.privacy.noPiiOrSensitiveDataGuaranteedRows, 0);
  assert.equal(report.activeContent.candidatesTreatedAsPotentiallyActiveOrAdversarial,
    92);
  assert.equal(report.activeContent.payloadsExecuted, 0);
  assert.equal(report.outcomeBoundary.searchMetadataSignalsPromotedToPayloadFacts,
    false);
  assert.equal(report.boundary.offlineTrainingRows, 0);
  assert.equal(report.boundary.productionTrainingRows, 0);
  assert.equal(report.boundary.networkAdmissionRows, 0);
  assert.equal(report.boundary.authorityRows, 0);
  assert.equal(report.boundary.ceuRows, 0);
  const mirrors = entries.filter((entry) => entry.disposition.code
    === "DUPLICATE_OR_MIRROR");
  assert.equal(mirrors.length, 2);
  assert.equal(mirrors.every((entry) =>
    entry.duplicateEvidence.exactFirst400NormalizedDescriptionBytes
    && entry.duplicateEvidence.exactSortedTagVector
    && entry.duplicateEvidence.payloadByteIdentityEstablished === false), true);
});

test("published bytes replay, remain private, and acquisition is no-clobber", () => {
  const checked = verifyHfAgentFailureTrajectoryArtifactDirectory(artifact);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:28dbf99dc04a42e0f0576b0b027c4ac5a69eebf4754f426af19517c88699b5fd");
  assert.equal(checked.receipt.receiptHash,
    "sha256:b1adfd1aba64afc6ca53cc35d9218fe02f3ca3f9f317731beb4dbb5342c88958");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-hf-agent-failure-trajectory-declared-scope-ledger.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
