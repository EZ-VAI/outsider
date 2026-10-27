import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  HF_ROBOT_INTERVENTION_ADMITTED_QUEUE_IDS,
  HF_ROBOT_INTERVENTION_ALREADY_ACQUIRED_IDS,
  HF_ROBOT_INTERVENTION_DISPOSITION,
  HF_ROBOT_INTERVENTION_QUERIES,
  HF_ROBOT_INTERVENTION_SCOPE,
  verifyHfRobotInterventionArtifactDirectory,
} from "../src/outsider-hf-robot-intervention-declared-scope-ledger.js";

const artifact = path.resolve(
  "artifacts/outsider-hf-robot-intervention-declared-scope-ledger-20260830-v1");
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

test("three exact official full-query brackets replay the fresh 258-record union", () => {
  assert.equal(report.disposition, HF_ROBOT_INTERVENTION_DISPOSITION);
  assert.equal(report.scope.kind, HF_ROBOT_INTERVENTION_SCOPE);
  assert.deepEqual(report.scope.exactQueries.map((query) => [
    query.term, query.full, query.limit, query.records,
  ]), [
    ["intervention", true, 1_000, 231],
    ["corrective", true, 1_000, 18],
    ["human-in-loop", true, 1_000, 9],
  ]);
  assert.equal(HF_ROBOT_INTERVENTION_QUERIES.length, 3);
  assert.equal(report.scope.queryResultRows, 258);
  assert.equal(report.scope.unionDatasetRecords, 258);
  assert.equal(report.scope.priorHumanInLoopReconnaissanceCountFromTaskContext, 3);
  assert.equal(report.scope.formalHumanInLoopCount, 9);
  assert.equal(report.scope.priorReconnaissanceIsNotFormalSourceEvidence, true);
  assert.equal(report.scope.incompleteDaggerThousandResultReconnaissanceIncluded,
    false);
  assert.equal(report.source.queryBeforeAfterExactBytes, true);
  assert.equal(report.source.stableProjectionExact, true);
  for (const query of HF_ROBOT_INTERVENTION_QUERIES) {
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
    "sha256:aa552a0a68dad0b64fc63c959f041a74f892e382ae56d7f0fdd143527c2f3ab9");
  assert.equal(report.source.sourceRoot,
    "sha256:14aaff0402dfc7dc8edbfb0833ae42d9989f41f0f30b5417688f53766fa007df");
});

test("all 258 unique records receive exactly one terminal disposition", () => {
  const entries = report.candidateLedger.entries;
  assert.equal(report.discovery.declaredScopeExhausted, true);
  assert.equal(report.discovery.globalExhaustion, false);
  assert.equal(report.discovery.sourceUniverseExhausted, false);
  assert.equal(report.discovery.unionDatasetRecords, 258);
  assert.equal(report.discovery.terminalDatasetRecords, 258);
  assert.equal(report.discovery.publicRecords, 258);
  assert.equal(report.discovery.publicUngatedRecords, 256);
  assert.equal(report.discovery.gatedRecords, 2);
  assert.equal(report.discovery.gatedManualRecords, 2);
  assert.equal(report.discovery.privateRecords, 0);
  assert.equal(report.discovery.disabledRecords, 0);
  assert.deepEqual(report.discovery.dispositionCounts, {
    ADMITTED_CURRENT_QUEUE: 2,
    ALREADY_ACQUIRED_CURRENT_WORKTREE: 4,
    DUPLICATE_OR_FAMILY: 22,
    GATED_NO_BYPASS: 2,
    METADATA_ONLY: 5,
    NOT_ROBOTIC_FALSE_POSITIVE: 198,
    PUBLIC_ROBOT_LOW_PRIORITY: 24,
    PUBLIC_ROBOT_PRIORITY_CANDIDATE: 1,
  });
  assert.equal(entries.length, 258);
  assert.equal(new Set(entries.map((entry) => entry.datasetId)).size, 258);
  assert.deepEqual(entries.map((entry) => entry.datasetId),
    [...entries.map((entry) => entry.datasetId)].sort((left, right) =>
      left.localeCompare(right)));
  assert.equal(entries.every((entry) => entry.disposition.terminal), true);
  assert.equal(report.scope.payloadFilesAcquiredByThisLedger, 0);
  assert.equal(report.scope.payloadBytesAcquiredByThisLedger, 0);
});

test("current coverage and named lineage crosswalks preserve producer boundaries", () => {
  const entries = report.candidateLedger.entries;
  const acquired = entries.filter((entry) => entry.disposition.code
    === "ALREADY_ACQUIRED_CURRENT_WORKTREE").map((entry) => entry.datasetId);
  assert.deepEqual(acquired.sort(), [...HF_ROBOT_INTERVENTION_ALREADY_ACQUIRED_IDS]);
  const queued = entries.filter((entry) => entry.disposition.code
    === "ADMITTED_CURRENT_QUEUE").map((entry) => entry.datasetId);
  assert.deepEqual(queued.sort(), [...HF_ROBOT_INTERVENTION_ADMITTED_QUEUE_IDS]);
  assert.equal(report.worktreeCoverage.evidenceGroups, 8);
  assert.equal(report.worktreeCoverage.inScopeExistingAcquiredRecords, 4);
  assert.equal(report.worktreeCoverage.admittedCurrentQueueRecords, 2);
  assert.equal(report.worktreeCoverage.existingAdaptersModifiedByThisLedger,
    false);
  const bySubject = new Map(report.crosswalk.entries.map((entry) =>
    [entry.subject, entry]));
  assert.equal(bySubject.get("KeWang peg").terminalState,
    "ALREADY_ACQUIRED_CURRENT_WORKTREE");
  assert.equal(bySubject.get("Jia handover").datasetIds.length, 3);
  assert.equal(bySubject.get("Kelin lineage").terminalState,
    "ADMITTED_CURRENT_QUEUE");
  assert.equal(bySubject.get("Ajay dagger interventions").terminalState,
    "PUBLIC_ROBOT_PRIORITY_CANDIDATE");
  assert.equal(bySubject.get("mt-prox RECAP token").producerBoundary,
    "DISTINCT_FROM_APASZYNSKA_RECAP; SHARED_RECAP_TOKEN_IS_NOT_SOURCE_IDENTITY");
  for (const subject of ["apaszynska RECAP", "Takuya HIL/RL", "HABIT",
    "RBY1", "Plug93"]) {
    assert.equal(bySubject.get(subject).scopeRelation,
      "OUTSIDE_DECLARED_QUERY_UNION_EXISTING_WORKTREE_ARTIFACT");
    assert.equal(bySubject.get(subject).terminalState,
      "NOT_COUNTED_IN_258_RECORD_LEDGER");
  }
  assert.equal(report.crosswalk.outsideScopeEntriesNotCountedInLedger, true);
});

test("family grouping never becomes byte identity or execution identity", () => {
  const entries = report.candidateLedger.entries;
  const family = entries.filter((entry) =>
    entry.disposition.code === "DUPLICATE_OR_FAMILY");
  assert.equal(family.length, 22);
  assert.equal(family.every((entry) =>
    entry.familyBoundary.groupingBasis
      === "PUBLISHER_AND_IDENTIFIER_LINEAGE_ONLY"
    && entry.familyBoundary.payloadByteIdentityEstablished === false
    && entry.familyBoundary.executionIdentityEstablished === false
    && entry.familyBoundary.duplicatePopulationClaimed === false), true);
  const yhrg = family.filter((entry) => entry.datasetId.startsWith("YHRG/"));
  assert.equal(yhrg.length, 8);
  assert.equal(yhrg.every((entry) => entry.familyBoundary.representativeDatasetId
    === "YHRG/s1_mix_plug_cable_round1_intervention"), true);
  const ajay = entries.find((entry) => entry.datasetId
    === "ajaysri/route_subtasks_dual_overhead_pi05_448_dagger_interventions_balanced");
  assert.equal(ajay.disposition.code, "PUBLIC_ROBOT_PRIORITY_CANDIDATE");
  assert.equal(ajay.recordProjection.roboticsTaskCategory, true);
  assert.equal(ajay.recordProjection.librarySignals.includes("lerobot"), true);
  assert.equal(report.priorityQueue.queuedDatasetRecords, 1);
  assert.equal(report.priorityQueue.payloadDownloadsPerformedByThisLedger, 0);
});

test("rights privacy active content outcomes recovery and use remain fail closed", () => {
  const entries = report.candidateLedger.entries;
  assert.equal(report.candidateLedger.rawDescriptionProjectionRows, 0);
  assert.equal(report.candidateLedger.rawPayloadProjectionRows, 0);
  assert.doesNotMatch(reportBytes.toString("utf8"), /"description":/u);
  assert.equal(entries.every((entry) =>
    entry.rights.rightsIndependentlyAdjudicated === false
    && entry.rights.authorizedTrainingRows === 0
    && entry.privacy.rawDescriptionStoredPrivate === true
    && entry.privacy.rawDescriptionProjected === false
    && entry.privacy.noPiiOrSensitiveDataGuaranteed === false
    && entry.privacy.rawPayloadBytesAcquiredByThisLedger === 0
    && entry.activeContent.payloadExecuted === false
    && entry.activeContent.commandExecuted === false
    && entry.semanticBoundary.publisherNativeInterventionRowsReplayed === 0
    && entry.semanticBoundary.humanAuthorizedInterventionRows === 0
    && entry.semanticBoundary.physicalExecutionRowsEstablished === 0
    && entry.semanticBoundary.independentlyVerifiedOutcomeRows === 0
    && entry.semanticBoundary.independentlyVerifiedRecoveryRows === 0
    && entry.semanticBoundary.completeAttemptCensusEstablished === false
    && entry.useBoundary.authorizedTrainingRows === 0
    && entry.useBoundary.networkAdmissionRows === 0
    && entry.useBoundary.authorityRows === 0
    && entry.useBoundary.ceuRows === 0), true);
  assert.deepEqual(report.rights.publisherLicenseClaimCounts, {
    UNDECLARED: 148, "afl-3.0": 1, "apache-2.0": 25,
    "cc-by-4.0": 14, "cc-by-nc-4.0": 1, mit: 53, other: 16,
  });
  assert.equal(report.privacy.noPiiOrSensitiveDataGuaranteedRows, 0);
  assert.equal(report.semanticBoundary.searchMetadataSignalsPromotedToPayloadFacts,
    false);
  assert.equal(report.boundary.authorizedTrainingRows, 0);
  assert.equal(report.boundary.networkAdmissionRows, 0);
  assert.equal(report.boundary.authorityRows, 0);
  assert.equal(report.boundary.ceuRows, 0);
});

test("published bytes replay privately and acquisition is no-clobber", () => {
  const checked = verifyHfRobotInterventionArtifactDirectory(artifact);
  assert.equal(checked.ok, true, checked.error);
  assert.equal(checked.reportExactBytes, true);
  assert.equal(checked.receiptExactBytes, true);
  assert.equal(checked.report.artifactHash,
    "sha256:cc56696df7e9f5728e73bb1b5dc9286f0a6150634982ebd9623495ca79f06a99");
  assert.equal(checked.receipt.receiptHash,
    "sha256:fce413aaa26c1a73e86487b8aac834a337b292cf7f0b37b169738577638823bf");
  walkModes(artifact);
  const before = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  const result = spawnSync(process.execPath,
    ["scripts/acquire-hf-robot-intervention-declared-scope-ledger.mjs"], {
      cwd: path.resolve("."), encoding: "utf8", timeout: 30_000,
    });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OUTPUT_EXISTS_OR_OUTSIDE_WORKSPACE/u);
  const after = ["report.json", "run-receipt.json"].map((name) =>
    sha256(readFileSync(path.join(artifact, name))));
  assert.deepEqual(after, before);
});
