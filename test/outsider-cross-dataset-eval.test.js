import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CROSS_DATASET_EVALUATOR_DESCRIPTOR,
  CROSS_DATASET_EVAL_SCHEMAS,
  bridgePublicAgentFullSourceReplay,
  bridgePublicAgentSource,
  bridgePublicAgentWave2Source,
  bridgePublicRoboticsSource,
  createCrossDatasetEvaluationUnit,
  crossDatasetEvaluationDigest,
  evaluateCrossDatasetUnits,
  verifyCrossDatasetEvaluationReport,
  verifyCrossDatasetEvaluationUnit,
} from "../src/outsider-cross-dataset-eval.js";
import {
  PUBLIC_AGENT_PINS,
  buildPublicAgentAcquisitionManifest,
  buildPublicAgentProvenanceProof,
  normalizeComputerAgentArenaRow,
  verifyPublicAgentRecordSet,
} from "../src/outsider-public-agent-corpus.js";

const H = (character) => `sha256:${character.repeat(64)}`;
const SOURCE = fileURLToPath(new URL(
  "../artifacts/curate-public-robotics-20260820/source/", import.meta.url,
));
const REAL_ROBOT_SOURCE = existsSync(`${SOURCE}botfails`)
  && existsSync(`${SOURCE}ur5fail-execution`);
const AGENT_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/public-agent-corpus-20260820/", import.meta.url,
));
const AGENT_SOURCE_DIRECTORY = `${AGENT_ARTIFACT_DIRECTORY}source`;
const REAL_AGENT_SOURCE = ["acquisition-manifest.json", "normalized-records.jsonl",
  "normalized-tracelab.jsonl", "effect-summary.json"].every((name) =>
  existsSync(`${AGENT_ARTIFACT_DIRECTORY}${name}`))
  && existsSync(`${AGENT_SOURCE_DIRECTORY}/syfi_coding_trace.jsonl.gz`)
  && (() => {
    try {
      return JSON.parse(readFileSync(`${AGENT_ARTIFACT_DIRECTORY}acquisition-manifest.json`,
        "utf8")).schema === "outsider/public-agent-acquisition-manifest/v2";
    } catch { return false; }
  })();
const AGENT_WAVE2_SOURCE_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/public-agent-wave2-20260821/source/", import.meta.url,
));
const REAL_AGENT_WAVE2_SOURCE = ["atbench-codex/test.json", "atbench-claw/test.json",
  "tau2-bench/results.json", "matm/results.json",
  "candidates/cuaverifierbench/repository-revision.json"].every((name) =>
  existsSync(`${AGENT_WAVE2_SOURCE_DIRECTORY}${name}`));

let cachedAgentUnits;
let cachedWave2Units;
let cachedRobotUnits;
async function realAgentUnits() {
  cachedAgentUnits ??= await bridgePublicAgentSource({
    sourceDirectory: AGENT_SOURCE_DIRECTORY,
    artifactDirectory: AGENT_ARTIFACT_DIRECTORY,
  });
  return cachedAgentUnits;
}
function realWave2Units() {
  cachedWave2Units ??= bridgePublicAgentWave2Source({
    sourceDirectory: AGENT_WAVE2_SOURCE_DIRECTORY,
  });
  return cachedWave2Units;
}
function realRobotUnits() {
  cachedRobotUnits ??= [
    ...bridgePublicRoboticsSource({ dataset: "BOTFAILS",
      sourceDirectory: `${SOURCE}botfails` }),
    ...bridgePublicRoboticsSource({ dataset: "UR5FAIL_EXECUTION",
      sourceDirectory: `${SOURCE}ur5fail-execution` }),
  ];
  return cachedRobotUnits;
}

function selfAsserted({ id = "1", rows = 1, root = "a", truthLabels = [],
  detectorOutputs = [] } = {}) {
  return createCrossDatasetEvaluationUnit({
    dataset: { id: "public/example", revision: "r1", revisionRoot: H("e"),
      licenseId: "CC-BY-4.0", sourceClass: "CONTROLLED_AGENT_BENCHMARK" },
    unitIdHash: H(id), sourceRowCount: rows, correlationRoots: [H(root)],
    truthLabels, detectorOutputs,
  });
}

function syntheticAgentManifest(sourceHash) {
  const sources = Object.values(PUBLIC_AGENT_PINS).map((pin, index) => {
    const path = `source-${index}.jsonl`;
    return ({
    id: pin.id, revision: pin.revision, sourceClass: pin.sourceClass,
    upstreamObject: pin.upstreamObject,
    license: { identifier: pin.licenseId, declarationUrl: pin.licenseDeclarationUrl,
      adapterGrantsRights: false, attributionRequired: pin.licenseId === "CC-BY-4.0" },
    sampling: { kind: "synthetic-full-source-replay-fixture" },
    correlationPolicy: "all known roots retained",
    provenanceProof: buildPublicAgentProvenanceProof({ datasetId: pin.id,
      byteObjectPaths: [path], revisionObjectPaths: [path], licenseObjectPaths: [path] }),
    acquiredObjects: [{ path, sizeBytes: 10,
      sha256: pin.id === PUBLIC_AGENT_PINS.computerAgentArena.id ? sourceHash
        : H(String(index + 1)) }],
    });
  });
  return buildPublicAgentAcquisitionManifest({ generatedAt: "2026-08-20T00:00:00.000Z",
    sources });
}

function agentReplay(records, manifest, sourceHash) {
  return () => ({ schema: CROSS_DATASET_EVAL_SCHEMAS.agentReplay,
    status: "FULL_SOURCE_REPRODUCED", manifest, records,
    verifiedSourceObjectHashes: [sourceHash],
    recordSetHash: verifyPublicAgentRecordSet(records, { manifest }).recordSetHash });
}

test("low-level units are hash-bound but explicitly untrusted", () => {
  const unit = selfAsserted();
  assert.equal(unit.schema, "outsider/cross-dataset-evaluation-unit/v3");
  assert.equal(unit.schemaVersion, "3.0.0");
  const verified = verifyCrossDatasetEvaluationUnit(unit);
  assert.equal(verified.ok, true);
  assert.equal(verified.trustClass, "SELF_ASSERTED_UNTRUSTED");
  assert.equal(verified.bridgeRegistered, false);
  const tampered = structuredClone(unit);
  tampered.sourceRowCount = 999;
  assert.equal(verifyCrossDatasetEvaluationUnit(tampered).ok, false);
  const legacyVersion = structuredClone(unit);
  legacyVersion.schemaVersion = "2.0.0";
  assert.equal(verifyCrossDatasetEvaluationUnit(legacyVersion).ok, false);
});

test("fake perfect predictions cannot enter formal evaluation", () => {
  const fake = selfAsserted({ rows: 1,
    truthLabels: [{ target: "TASK_FAILURE", value: true,
      basis: "HUMAN_REVIEWED_TASK_OUTCOME", labelRoot: H("f") }],
    detectorOutputs: [{ detectorId: "perfect", detectorVersion: "1.0.0",
      implementationHash: H("d"), target: "TASK_FAILURE", prediction: true, score: 1 }],
  });
  const report = evaluateCrossDatasetUnits([fake]);
  assert.equal(report.sampleAccounting.uniqueEvaluationUnits, 0);
  assert.equal(report.sampleAccounting.candidateSourceRowsObserved, 1);
  assert.equal(report.sampleAccounting.sourceRowsUsedAsIndependentSamples, false);
  assert.equal(report.refused[0].reason, "SELF_ASSERTED_UNTRUSTED");
  assert.equal(report.detectorAssessments.every((item) =>
    item.decision.startsWith("ABSTAIN_")), true);
  assert.deepEqual(report.evaluator, CROSS_DATASET_EVALUATOR_DESCRIPTOR);
  assert.match(report.evaluator.implementationHash, /^sha256:[a-f0-9]{64}$/);
  assert.match(report.evaluator.policyHash, /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(report.boundary.observedEffectKinds, ["COVERAGE"]);
});

test("a caller callback cannot promote its own pinned replay assertion", () => {
  const sourceHash = H("a");
  const manifest = syntheticAgentManifest(sourceHash);
  const record = normalizeComputerAgentArenaRow({ task_id: "task-1", model: "agent-a",
    human_eval_correctness: 0, traj: [{ image: "1" }, { image: "2" }] },
  { rowIndex: 0, sourceObjectHash: sourceHash,
    correlation: { userId: "u1", sessionId: "s1", instruction: "task",
      setupDescription: "desktop", model: "agent-a" } });
  const asserted = bridgePublicAgentFullSourceReplay(
    agentReplay([record], manifest, sourceHash))[0];
  const checked = verifyCrossDatasetEvaluationUnit(asserted);
  assert.equal(checked.trustClass, "CALLER_ASSERTED_REPLAY");
  assert.equal(checked.bridgeRegistered, false);
  const report = evaluateCrossDatasetUnits([asserted]);
  assert.equal(report.sampleAccounting.uniqueEvaluationUnits, 0);
  assert.equal(report.refused[0].reason, "CALLER_ASSERTED_REPLAY");
});

test("caller agent replay derives no formally usable truth or detector result", () => {
  const sourceHash = H("a");
  const manifest = syntheticAgentManifest(sourceHash);
  const input = (task, index, correctness) => normalizeComputerAgentArenaRow({
    task_id: task, model: "agent-a", human_eval_correctness: correctness,
    traj: [{ image: "1" }, { image: "2" }] }, { rowIndex: index,
    sourceObjectHash: sourceHash, correlation: { userId: "same-user",
      sessionId: `session-${index}`, instruction: "same instruction",
      setupDescription: "same desktop", model: "agent-a" } });
  const records = [input("task-1", 0, 0), input("task-2", 1, 1)];
  const units = bridgePublicAgentFullSourceReplay(agentReplay(records, manifest, sourceHash));
  assert.equal(units.every((unit) => unit.detectorOutputs.length === 0), true);
  assert.equal(units.every((unit) => unit.sourceBinding.sourceManifestHash
    === manifest.manifestHash), true);
  assert.equal(units.every((unit) => unit.sourceBinding.adapterImplementationHash
    .startsWith("sha256:")), true);
  const report = evaluateCrossDatasetUnits(units);
  assert.equal(report.sampleAccounting.uniqueEvaluationUnits, 0);
  assert.equal(report.sampleAccounting.refusedCandidates, 2);
  assert.equal(report.refused.every((item) => item.reason === "CALLER_ASSERTED_REPLAY"), true);
  assert.equal(report.truthReadiness.find((item) => item.target === "TASK_FAILURE")
    .qualifyingEvaluationUnits, 0);
  assert.equal(report.detectorAssessments.find((item) => item.target === "TASK_FAILURE")
    .decision, "ABSTAIN_NO_QUALIFYING_TRUTH");
  assert.equal(report.boundary.discriminationClaimed, false);
  assert.equal(verifyCrossDatasetEvaluationReport(report, { candidates: units }).ok, true);
  assert.deepEqual(verifyCrossDatasetEvaluationReport(report), {
    ok: false, error: "TRUSTED_BRIDGE_CANDIDATES_REQUIRED",
  });

  const resealed = structuredClone(report);
  resealed.boundary.discriminationClaimed = true;
  const { reportHash: _old, ...body } = resealed;
  resealed.reportHash = crossDatasetEvaluationDigest(body);
  assert.equal(verifyCrossDatasetEvaluationReport(resealed, { candidates: units }).ok, false);
});

test("agent replay rejects a record set not bound to the declared full-source proof", () => {
  const sourceHash = H("a");
  const manifest = syntheticAgentManifest(sourceHash);
  const record = normalizeComputerAgentArenaRow({ task_id: "task-1", model: "agent-a",
    human_eval_correctness: 0, traj: [{ image: "1" }] },
  { rowIndex: 0, sourceObjectHash: sourceHash });
  const replay = agentReplay([record], manifest, sourceHash)();
  replay.recordSetHash = H("f");
  assert.throws(() => bridgePublicAgentFullSourceReplay(() => replay),
    /AGENT_REPLAY_RECORD_SET_HASH_INVALID/);
});

test("real robot bytes bridge as correlated units with no detector output",
  { skip: !REAL_ROBOT_SOURCE }, () => {
    const all = realRobotUnits();
    const bot = all.filter((unit) => unit.dataset.id === "kantine/BotFails");
    const ur5 = all.filter((unit) => unit.dataset.id
      === "paulpacaud/Guardian-FailCoT-OOD-datasets");
    assert.equal(bot.length, 20);
    assert.equal(ur5.length, 140);
    assert.equal(bot.every((unit) => unit.dataset.sourceClass
      === "TELEOPERATED_ROBOT_EXECUTION"), true);
    assert.equal(ur5.every((unit) => unit.dataset.sourceClass
      === "AUTONOMOUS_ROBOT_EXECUTION"), true);
    assert.equal([...bot, ...ur5].every((unit) => unit.detectorOutputs.length === 0), true);
    const report = evaluateCrossDatasetUnits([...bot, ...ur5]);
    assert.equal(report.sampleAccounting.uniqueEvaluationUnits, 160);
    assert.equal(report.sampleAccounting.correlationComponents, 2);
    assert.equal(report.sampleAccounting.sourceRowsUsedAsIndependentSamples, false);
    assert.equal(report.coverage.truthTargets.TASK_FAILURE, 140);
    assert.equal(report.coverage.truthTargets.EXECUTION_ANOMALY, 10);
    const anomaly = report.truthReadiness.find((item) =>
      item.target === "EXECUTION_ANOMALY");
    assert.equal(anomaly.decision, "ABSTAIN_TRUTH_ONE_CLASS");
    assert.deepEqual(anomaly.qualifyingClassCounts, { negative: 0, positive: 10 });
    assert.equal(report.detectorAssessments.every((assessment) =>
      assessment.decision.startsWith("ABSTAIN_")), true);
    assert.equal(report.authority.establishesLossOrLiability, false);
    assert.equal(report.boundary.financialEffect, "none");

    const copied = structuredClone(ur5[0]);
    const copiedReport = evaluateCrossDatasetUnits([copied]);
    assert.equal(copiedReport.sampleAccounting.uniqueEvaluationUnits, 0);
    assert.equal(copiedReport.refused[0].reason, "UNREGISTERED_TRUST_ASSERTION");
  });

test("real agent artifact directory must fully rederive before gaining trust",
  { skip: !REAL_AGENT_SOURCE }, async () => {
    const units = await realAgentUnits();
    assert.equal(units.length, 9381);
    assert.equal(units.every((unit) => unit.sourceBinding.trustClass
      === "FULL_SOURCE_REPLAY_BOUND"), true);
    assert.equal(units.every((unit) => unit.sourceBinding.adapterId
      === "outsider-public-agent-directory-full-source-bridge"), true);
    assert.equal(units.every((unit) => unit.detectorOutputs.length === 0), true);
    const report = evaluateCrossDatasetUnits(units);
    assert.equal(report.sampleAccounting.uniqueEvaluationUnits, 9381);
    assert.equal(report.sampleAccounting.candidateSourceRowsObserved, 362277);
    assert.equal(report.sampleAccounting.trustedSourceRowsObserved, 362277);
    assert.equal(report.sampleAccounting.sourceRowsUsedAsIndependentSamples, false);
    assert.equal(report.coverage.truthTargets.TASK_FAILURE, 4841);
    assert.equal(report.coverage.truthTargets.USER_DISSATISFACTION, 275);
    const dissatisfaction = report.truthReadiness.find((item) =>
      item.target === "USER_DISSATISFACTION");
    assert.deepEqual(dissatisfaction.qualifyingClassCounts,
      { negative: 164, positive: 111 });
    assert.equal(dissatisfaction.qualifyingCorrelationComponents, 1);
    assert.equal(dissatisfaction.decision,
      "ABSTAIN_INSUFFICIENT_CORRELATION_COMPONENTS");
    assert.equal(report.detectorAssessments.every((assessment) =>
      assessment.decision.startsWith("ABSTAIN_")), true);
    assert.equal(report.boundary.financialEffect, "none");
  });

test("wave2 full-source bridge keeps four dataset-native label mappings unqualified",
  { skip: !REAL_AGENT_WAVE2_SOURCE }, () => {
    const units = realWave2Units();
    assert.equal(units.length, 1474);
    assert.equal(units.every((unit) => unit.sourceBinding.trustClass
      === "FULL_SOURCE_REPLAY_BOUND"), true);
    assert.equal(units.every((unit) => unit.sourceBinding.adapterId
      === "outsider-public-agent-wave2-full-source-bridge"), true);
    assert.equal(units.every((unit) => unit.detectorOutputs.length === 0), true);
    assert.equal(units.flatMap((unit) => unit.truthLabels)
      .every((label) => label.basis === "UNVERIFIED_DATASET_DECLARATION"), true);

    const derivations = new Set(units.map((unit) => unit.sourceBinding.labelDerivation));
    assert.deepEqual([...derivations].sort(), [
      "ATBENCH_CLAW_GENERATED_SAFETY_VERDICT_TO_UNQUALIFIED_EXECUTION_ANOMALY",
      "ATBENCH_CODEX_SYNTHETIC_SAFETY_VERDICT_TO_UNQUALIFIED_EXECUTION_ANOMALY",
      "MATM_ALFWORLD_SUCCESS_TO_UNQUALIFIED_TASK_FAILURE",
      "TAU2_HARNESS_REWARD_TO_UNQUALIFIED_TASK_FAILURE",
    ]);
    assert.equal(units.filter((unit) => unit.dataset.id.startsWith("AI45Research/"))
      .every((unit) => unit.truthLabels[0].target === "EXECUTION_ANOMALY"), true);
    assert.equal(units.filter((unit) => ["sierra-research/tau2-bench", "kimdanny/matm"]
      .includes(unit.dataset.id))
      .every((unit) => unit.truthLabels[0].target === "TASK_FAILURE"), true);

    const report = evaluateCrossDatasetUnits(units);
    assert.equal(report.sampleAccounting.uniqueEvaluationUnits, 1474);
    assert.equal(report.sampleAccounting.candidateSourceRowsObserved, 1474);
    assert.equal(report.sampleAccounting.trustedSourceRowsObserved, 1474);
    assert.equal(report.sampleAccounting.correlationComponents, 4);
    assert.equal(report.sampleAccounting.sourceRowsUsedAsIndependentSamples, false);
    assert.equal(report.truthReadiness.every((item) =>
      item.qualifyingEvaluationUnits === 0), true);
    assert.equal(report.truthReadiness.find((item) => item.target === "TASK_FAILURE")
      .unqualifiedEvaluationUnits, 474);
    assert.equal(report.truthReadiness.find((item) => item.target === "EXECUTION_ANOMALY")
      .unqualifiedEvaluationUnits, 1000);
    assert.equal(report.detectorAssessments.every((item) =>
      item.decision === "ABSTAIN_NO_QUALIFYING_TRUTH"), true);
    assert.equal(report.authority.admissibleForPricing, false);

    const copied = structuredClone(units[0]);
    const copiedReport = evaluateCrossDatasetUnits([copied]);
    assert.equal(copiedReport.sampleAccounting.uniqueEvaluationUnits, 0);
    assert.equal(copiedReport.refused[0].reason, "UNREGISTERED_TRUST_ASSERTION");
  });

test("wave2 extends current agent and robot evidence without changing qualified truth",
  { skip: !REAL_AGENT_SOURCE || !REAL_AGENT_WAVE2_SOURCE || !REAL_ROBOT_SOURCE }, async () => {
    const candidates = [...await realAgentUnits(), ...realWave2Units(), ...realRobotUnits()];
    const report = evaluateCrossDatasetUnits(candidates);
    assert.equal(candidates.length, 11015);
    assert.equal(report.sampleAccounting.uniqueEvaluationUnits, 11015);
    assert.equal(report.sampleAccounting.trustedSourceRowsObserved, 378826);
    assert.equal(report.sampleAccounting.correlationComponents, 211);
    assert.equal(report.sampleAccounting.structuralIndependentUpperBound, 211);
    const byTarget = Object.fromEntries(report.truthReadiness.map((item) =>
      [item.target, item]));
    assert.equal(byTarget.USER_DISSATISFACTION.qualifyingEvaluationUnits, 275);
    assert.equal(byTarget.TASK_FAILURE.qualifyingEvaluationUnits, 4981);
    assert.equal(byTarget.EXECUTION_ANOMALY.qualifyingEvaluationUnits, 10);
    assert.equal(byTarget.RECOVERY_AFTER_FAILURE.qualifyingEvaluationUnits, 0);
    assert.equal(byTarget.TASK_FAILURE.unqualifiedEvaluationUnits, 474);
    assert.equal(byTarget.EXECUTION_ANOMALY.unqualifiedEvaluationUnits, 1000);
    assert.equal(report.detectorAssessments.every((assessment) =>
      assessment.decision.startsWith("ABSTAIN_")), true);
    assert.equal(report.boundary.financialEffect, "none");
  });
