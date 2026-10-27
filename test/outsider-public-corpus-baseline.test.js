import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  PUBLIC_AGENT_SCHEMAS,
  normalizeComputerAgentArenaRow,
  normalizeNebiusOpenHandsRow,
  normalizeOpenHandsFeedbackRow,
  publicAgentDigest,
} from "../src/outsider-public-agent-corpus.js";
import {
  PUBLIC_CORPUS_BASELINE_SCHEMA,
  PUBLIC_CORPUS_BASELINE_FEATURES,
  evaluatePublicCorpusBaseline,
  evaluatePublicCorpusBaselineFromSource,
  publicCorpusBaselineDigest,
  verifyPublicCorpusBaselineReport,
} from "../src/outsider-public-corpus-baseline.js";

const H = (value) => publicAgentDigest(value, "test/public-corpus-baseline/source/v1");
const REAL_REPORT = fileURLToPath(new URL(
  "../artifacts/public-agent-corpus-20260820/superseded-untrusted/baseline-v1/report.json",
  import.meta.url,
));
const REAL_ARTIFACT_DIRECTORY = fileURLToPath(new URL(
  "../artifacts/public-agent-corpus-20260820/", import.meta.url,
));
const REAL_SOURCE_DIRECTORY = `${REAL_ARTIFACT_DIRECTORY}source`;
const REAL_FULL_SOURCE_READY = ["acquisition-manifest.json",
  "normalized-computer-agent-arena.jsonl", "normalized-tracelab.jsonl",
  "normalized-openhands-feedback.jsonl", "normalized-nebius-openhands.jsonl",
  "normalized-records.jsonl", "effect-summary.json"].every((name) =>
  existsSync(`${REAL_ARTIFACT_DIRECTORY}${name}`))
  && existsSync(`${REAL_SOURCE_DIRECTORY}/syfi_coding_trace.jsonl.gz`)
  && (() => {
    try {
      return JSON.parse(readFileSync(`${REAL_ARTIFACT_DIRECTORY}acquisition-manifest.json`,
        "utf8")).schema === "outsider/public-agent-acquisition-manifest/v2";
    } catch { return false; }
  })();

function reseal(record) {
  const { recordHash: ignored, ...body } = record;
  return { ...body, recordHash: publicAgentDigest(body, PUBLIC_AGENT_SCHEMAS.record) };
}

function caaTrajectory(correct) {
  return Array.from({ length: correct ? 8 : 2 }, (_, index) => ({
    image: `image-${index}`,
    value: { code: `click(${index})`, thought: correct ? "continue" : "error: failed" },
  }));
}

function feedbackTrajectory(dissatisfied) {
  return Array.from({ length: dissatisfied ? 7 : 2 }, (_, index) => ({
    source: index === 0 ? "user" : "agent",
    action: index === 0 ? "message" : "run",
    observation: dissatisfied ? "error: failed" : "ok",
    timestamp: `2024-01-01T00:00:${String(index).padStart(2, "0")}.000Z`,
  }));
}

function nebiusTrajectory(resolved) {
  const rounds = resolved ? 6 : 2;
  return Array.from({ length: rounds * 2 }, (_, index) => index % 2 === 0 ? {
    role: "assistant", tool_calls: [{ id: `call-${index}` }],
    content: resolved ? "working" : "error: failed",
  } : {
    role: "tool", tool_call_id: `call-${index - 1}`, content: resolved ? "ok" : "failed",
  });
}

function corpus() {
  const records = [];
  for (let task = 0; task < 60; task += 1) {
    const correct = task % 2 === 0;
    for (let repeat = 0; repeat < 2; repeat += 1) {
      records.push(normalizeComputerAgentArenaRow({
        task_id: `task-${task}`, model: `model-${repeat}`,
        human_eval_correctness: Number(correct), traj: caaTrajectory(correct),
      }, { rowIndex: task * 2 + repeat, sourceObjectHash: H("caa"), correlation: {
        instruction: `instruction-${Math.floor(task / 2)}`,
        userId: `user-${Math.floor(task / 4)}`,
        sessionId: `session-${Math.floor(task / 2)}`,
        setupDescription: "shared-test-setup",
        model: `model-${repeat}`,
      } }));
    }
  }
  for (let index = 0; index < 120; index += 1) {
    const dissatisfied = index % 2 === 0;
    records.push(normalizeOpenHandsFeedbackRow({
      feedback: dissatisfied ? "negative" : "positive",
      permissions: "public",
      timestamp: `2024-02-${String(index % 28 + 1).padStart(2, "0")}T00:00:00.${String(index).padStart(3, "0")}Z`,
      trajectory: feedbackTrajectory(dissatisfied),
    }, { rowIndex: index, sourceObjectHash: H("openhands") }));
  }
  for (let repository = 0; repository < 60; repository += 1) {
    const resolved = repository % 2 === 0;
    for (let task = 0; task < 2; task += 1) {
      const rowIndex = repository * 2 + task;
      records.push(normalizeNebiusOpenHandsRow({
        trajectory_id: `trajectory-${rowIndex}`,
        instance_id: `org${repository}__repo-${task}`,
        repo: `org${repository}/repo`, resolved: Number(resolved),
        gen_tests_correct: Number(resolved), pred_passes_gen_tests: Number(resolved),
        trajectory: nebiusTrajectory(resolved),
      }, { rowIndex, sourceObjectHash: H("nebius") }));
    }
  }
  return records;
}

test("caller-supplied rows expose readiness but can never emit formal metrics", async () => {
  const records = corpus();
  const report = evaluatePublicCorpusBaseline(records);
  assert.equal(report.assessments.length, 3);
  assert.equal(report.sourceTrust.trustClass, "SELF_ASSERTED_UNTRUSTED");
  assert.equal(report.assessments.every((item) =>
    item.decision === "ABSTAIN_SELF_ASSERTED_UNTRUSTED"), true);
  for (const assessment of report.assessments) {
    assert.deepEqual(assessment.featurePolicy.included, PUBLIC_CORPUS_BASELINE_FEATURES);
    assert.equal(assessment.featurePolicy.sourceLabelUsedAsFeature, false);
    assert.equal(assessment.split.groupOverlap, 0);
    assert.equal(assessment.training, null);
    assert.equal(assessment.holdout, null);
    assert.equal(assessment.sampleAccounting.rowsUsedAsIndependentSamples, false);
    assert.equal(assessment.sampleAccounting.independenceClaimed, false);
    assert.equal(assessment.interpretation.crossDatasetGeneralizationClaimed, false);
    assert.equal(assessment.evidenceBoundary.causalExperienceUnits, 0);
    assert.equal(assessment.evidenceBoundary.lossEvidenceUnits, 0);
    assert.equal(assessment.evidenceBoundary.automaticTraining, false);
  }
  assert.equal(report.assessments[0].split.groupingBasis,
    "CONNECTED_COMPONENT_TASK_INSTRUCTION_USER_SESSION_ROOTS");
  assert.equal(report.assessments[0].split.totalGroups, 15);
  assert.equal(report.assessments[0].systematicDependencies.modelRoot.uniqueRoots, 2);
  assert.equal(report.assessments[0].systematicDependencies.modelRoot.usedForPartition, false);
  assert.equal(Number.isSafeInteger(report.assessments[0].systematicDependencies.modelRoot
    .trainHoldoutOverlapRoots), true);
  assert.equal(report.assessments[0].sampleAccounting.underDeclaredRootsOnly, true);
  assert.equal(report.assessments[1].split.groupingBasis,
    "CONNECTED_COMPONENT_COLLECTOR_ROOT");
  assert.equal(report.assessments[1].split.totalGroups, 1);
  assert.equal(report.assessments[2].split.groupingBasis,
    "CONNECTED_COMPONENT_REPOSITORY_TASK_ROOTS");
  assert.equal((await verifyPublicCorpusBaselineReport(report)).ok, false);
  assert.equal(canonicalizeStrict(evaluatePublicCorpusBaseline([...records].reverse())),
    canonicalizeStrict(report));
});

test("a public hash re-seal cannot promote caller rows or arbitrary metrics", async () => {
  const report = evaluatePublicCorpusBaseline(corpus());
  const forged = structuredClone(report);
  forged.sourceTrust = {
    trustClass: "FULL_SOURCE_REPLAY_BOUND",
    derivation: "FULL_SOURCE_REDERIVED",
    fullSourceVerificationHash: H("fake-verification"),
    manifestHash: H("fake-manifest"),
    recordSetHash: H("fake-record-set"),
    summaryHash: H("fake-summary"),
    verifiedSourceObjectSetHash: H("fake-source-set"),
    sourceRecordCount: 360,
    sourceVerifierImplementationHash: H("fake-verifier"),
  };
  forged.assessments[0].decision = "EVALUATED_SOURCE_SPECIFIC_DESCRIPTIVE_ONLY";
  forged.assessments[0].holdout = { records: 100, groups: 100,
    metrics: { auc: 1, sampleBrier: 0, balancedAccuracy: 1,
      calibrationClaimed: true, threshold: 0.5, confusion: {} } };
  const { reportHash: ignored, ...body } = forged;
  forged.reportHash = publicCorpusBaselineDigest(body, PUBLIC_CORPUS_BASELINE_SCHEMA);
  const checked = await verifyPublicCorpusBaselineReport(forged);
  assert.equal(checked.ok, false);
  assert.equal(checked.error, "PUBLIC_CORPUS_BASELINE_TRUSTED_SOURCE_REPLAY_REQUIRED");
});

test("labels, detector outputs, and non-allowlisted episode fields cannot enter features", () => {
  const records = corpus();
  const baseline = evaluatePublicCorpusBaseline(records);
  const mutated = [...records];
  const copy = structuredClone(mutated[0]);
  copy.detectorOutputs.lexicalErrorMentionCount = 999999;
  copy.episode.errorCount = 999999;
  copy.episode.userTurnCount = 999999;
  copy.episode.agentTurnCount = 999999;
  copy.episode.durationMs = 999999;
  mutated[0] = reseal(copy);
  assert.equal(canonicalizeStrict(evaluatePublicCorpusBaseline(mutated)),
    canonicalizeStrict(baseline));
  assert.equal(JSON.stringify(baseline.assessments).includes("lexicalErrorMentionCount"), false);
});

test("exact duplicates collapse and conflicting native identities are excluded", () => {
  const records = corpus();
  const duplicateReport = evaluatePublicCorpusBaseline([
    ...records, ...Array.from({ length: 100 }, () => records[0]),
  ]);
  assert.equal(duplicateReport.inputAccounting.exactDuplicatesCollapsed, 100);
  assert.equal(duplicateReport.inputAccounting.acceptedUniqueRecords, records.length);

  const changed = structuredClone(records[0]);
  changed.episode.stepCount += 1;
  const conflictReport = evaluatePublicCorpusBaseline([...records, reseal(changed)]);
  assert.equal(conflictReport.inputAccounting.conflictingIdentitiesExcluded, 1);
  assert.equal(conflictReport.inputAccounting.conflictingRecordsExcluded, 2);
  assert.equal(conflictReport.inputAccounting.refusedByReason.CONFLICTING_RECORD_IDENTITY, 1);
  assert.equal(conflictReport.inputAccounting.acceptedUniqueRecords, records.length - 1);
});

test("untrusted status takes precedence over apparent sample sufficiency", () => {
  const small = Array.from({ length: 10 }, (_, index) => normalizeComputerAgentArenaRow({
    task_id: `small-${index}`, model: "a", human_eval_correctness: 1,
    traj: caaTrajectory(true),
  }, { rowIndex: index, sourceObjectHash: H("small") }));
  const report = evaluatePublicCorpusBaseline(small);
  const caa = report.assessments.find((item) => item.target === "CAA_TASK_CORRECTNESS");
  assert.equal(caa.decision, "ABSTAIN_SELF_ASSERTED_UNTRUSTED");
  assert.equal(caa.training, null);
  assert.equal(caa.holdout, null);
  assert.equal(report.assessments.find((item) =>
    item.target === "OPENHANDS_USER_DISSATISFACTION").decision,
  "ABSTAIN_SELF_ASSERTED_UNTRUSTED");
});

test("unsealed tampering is refused and cannot affect accepted model rows", () => {
  const records = corpus();
  const tampered = structuredClone(records[0]);
  tampered.episode.errorCount = 999;
  const report = evaluatePublicCorpusBaseline([tampered, ...records.slice(1)]);
  assert.equal(report.inputAccounting.refusedByReason.RECORD_SELF_VERIFICATION_FAILED, 1);
  assert.equal(report.inputAccounting.acceptedUniqueRecords, records.length - 1);
  assert.equal(report.boundary.causalExperienceUnits, 0);
  assert.equal(report.boundary.lossEvidenceUnits, 0);
});

test("legacy hash-only artifact is not a trusted report",
  { skip: !existsSync(REAL_REPORT) }, () => {
    const report = JSON.parse(readFileSync(REAL_REPORT, "utf8"));
    assert.notEqual(report.schema, PUBLIC_CORPUS_BASELINE_SCHEMA);
  });

test("formal metrics require and verify a complete four-source byte replay",
  { skip: !REAL_FULL_SOURCE_READY }, async () => {
    const report = await evaluatePublicCorpusBaselineFromSource({
      sourceDirectory: REAL_SOURCE_DIRECTORY,
      artifactDirectory: REAL_ARTIFACT_DIRECTORY,
    });
    assert.equal(report.sourceTrust.trustClass, "FULL_SOURCE_REPLAY_BOUND");
    assert.equal(report.sourceTrust.sourceRecordCount, 9381);
    assert.equal(report.inputAccounting.candidateRecords, 9381);
    assert.equal(report.inputAccounting.acceptedUniqueRecords, 5116);
    const caa = report.assessments.find((item) => item.target === "CAA_TASK_CORRECTNESS");
    const openhands = report.assessments.find((item) =>
      item.target === "OPENHANDS_USER_DISSATISFACTION");
    const nebius = report.assessments.find((item) =>
      item.target === "NEBIUS_BENCHMARK_RESOLVED");
    assert.equal(caa.decision, "EVALUATED_SOURCE_SPECIFIC_DESCRIPTIVE_ONLY");
    assert.equal(caa.split.totalGroups, 850);
    assert.equal(caa.holdout.records, 576);
    assert.equal(openhands.decision, "ABSTAIN_INSUFFICIENT_CORRELATION_GROUPS");
    assert.equal(openhands.holdout, null);
    assert.equal(nebius.decision, "EVALUATED_SOURCE_SPECIFIC_DESCRIPTIVE_ONLY");
    assert.equal(nebius.split.totalGroups, 160);
    assert.equal(nebius.holdout.records, 34);
    for (const assessment of [caa, nebius]) {
      assert.equal(assessment.holdout.metrics.auc >= 0
        && assessment.holdout.metrics.auc <= 1, true);
      assert.equal(assessment.sampleAccounting.rowsUsedAsIndependentSamples, false);
      assert.equal(assessment.sampleAccounting.independenceClaimed, false);
    }
    assert.equal((await verifyPublicCorpusBaselineReport(report)).ok, false);
    assert.equal((await verifyPublicCorpusBaselineReport(report, {
      sourceDirectory: REAL_SOURCE_DIRECTORY,
      artifactDirectory: REAL_ARTIFACT_DIRECTORY,
    })).ok, true);

    const resealed = structuredClone(report);
    const target = resealed.assessments.find((item) => item.holdout !== null);
    target.holdout.metrics.auc = target.holdout.metrics.auc === 1 ? 0 : 1;
    const { reportHash: ignored, ...body } = resealed;
    resealed.reportHash = publicCorpusBaselineDigest(body, PUBLIC_CORPUS_BASELINE_SCHEMA);
    assert.equal((await verifyPublicCorpusBaselineReport(resealed, {
      sourceDirectory: REAL_SOURCE_DIRECTORY,
      artifactDirectory: REAL_ARTIFACT_DIRECTORY,
    })).ok, false);
  });
