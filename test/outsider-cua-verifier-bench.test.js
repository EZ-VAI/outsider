import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeStrict } from "../src/canonical.js";
import {
  buildCuaVerifierBenchTrainingArtifacts,
  buildCuaVerifierBenchTrainingArtifactsFromSource,
  CUA_VERIFIER_BENCH_PIN,
  CUA_VERIFIER_BENCH_SCHEMAS,
  CUA_VERIFIER_BENCH_TRAINING_BUDGET,
  CUA_VERIFIER_BENCH_TRAINING_FEATURES,
  cuaVerifierBenchDigest,
  normalizeCuaVerifierBenchSource,
  summarizeCuaWebSurferLog,
  verifyCuaVerifierBenchEpisode,
  verifyCuaVerifierBenchSourceReplay,
  verifyCuaVerifierBenchTrainingArtifacts,
  verifyCuaVerifierBenchTrainingArtifactsFromSource,
} from "../src/outsider-cua-verifier-bench.js";

const TRAJECTORY_FEATURES = [
  ["task_id", "string"], ["instruction", "string"], ["init_url", "string"],
  ["start_timestamp", "string"], ["end_timestamp", "string"],
  ["final_answer", "string"], ["is_aborted", "bool"],
  ["web_surfer_log", "string"], ["screenshots", "list:image"],
  ["n_screenshots", "int32"], ["gpt_eval_json", "string"],
  ["uv_rubric_score", "float32"], ["uv_outcome_success", "int32"],
  ["mm_is_success", "int32"], ["verifier_is_success", "int32"],
  ["final_human_outcome_label", "int32"],
  ["final_human_process_label", "int32"],
  ["median_human_rubric_score_agnostic", "float32"],
  ["majority_human_outcome_vote", "int32"],
];

const ANNOTATION_FEATURES = [
  ["task_id", "string"], ["annotator", "string"],
  ["human_judgement_outcome", "string"],
  ["human_judgement_process", "string"],
  ["human_process_score", "float32"], ["outcome_comment", "string"],
  ["process_comment", "string"], ["informed_outcome_agreement", "string"],
  ["informed_process_agreement", "string"],
  ["informed_outcome_comment", "string"],
  ["informed_process_comment", "string"],
];

const SECRET = {
  instruction: "SECRET_INSTRUCTION_NEVER_PROJECT",
  finalAnswer: "SECRET_FINAL_ANSWER_NEVER_PROJECT",
  thought: "SECRET_THOUGHT_NEVER_PROJECT",
  url: "https://private.example.test/SECRET_SCREENSHOT_URL",
  comment: "SECRET_REVIEW_COMMENT_NEVER_PROJECT",
};

function features(specification) {
  return specification.map(([name, type], feature_idx) => ({
    feature_idx,
    name,
    type: type === "list:image"
      ? { feature: { decode: true, id: null, _type: "Image" }, _type: "List" }
      : { dtype: type, _type: "Value" },
  }));
}

function source(path, bytes, fields = {}, url = `https://huggingface.co/${path}`) {
  return { path, url, bytes, ...fields };
}

function rowsUrl(config, offset, length) {
  const query = new URLSearchParams({ dataset: CUA_VERIFIER_BENCH_PIN.id, config,
    split: "fara7b_om2w_browserbase", offset: String(offset), length: String(length) });
  return `https://datasets-server.huggingface.co/rows?${query}`;
}

function jsonBytes(value) {
  return Buffer.from(JSON.stringify(value), "utf8");
}

function taskId(index) {
  const site = index < 2 ? "SameSite" : `Site${index}`;
  return `${site}--${String(index).padStart(8, "0")}`;
}

function webLog(index) {
  return [
    { message: `\n Thought #1: ${SECRET.thought}\n Action #1: executing tool 'left_click' with arguments {\"action\":\"left_click\",\"coordinate\":[${index},9]}`,
      timestamp: "2025-11-25T22:23:42.788320", type: "OtherEvent" },
    { message: `Observation#1: opened ${SECRET.url}`,
      timestamp: "2025-11-25T22:23:43.000000", type: "OtherEvent" },
    { message: "Action #2: executing tool 'type' with arguments {\"text\":\"private\"}",
      timestamp: "2025-11-25T22:23:44.000000", type: "OtherEvent" },
    { message: "Action #3: executing tool 'unrecognized_private_tool' with arguments {}",
      timestamp: "2025-11-25T22:23:45.000000", type: "OtherEvent" },
  ].map((event) => JSON.stringify(event)).join("\n");
}

function trajectory(index) {
  return {
    task_id: taskId(index),
    instruction: `${SECRET.instruction}-${index}`,
    init_url: `https://site${index}.example.test/private`,
    start_timestamp: "2025-11-25T22:23:40.123456",
    end_timestamp: "2025-11-25T22:24:40.123999",
    final_answer: `${SECRET.finalAnswer}-${index}`,
    is_aborted: index % 11 === 0,
    web_surfer_log: webLog(index),
    screenshots: [{ src: `${SECRET.url}/${index}`, height: 720, width: 1280 }],
    n_screenshots: 1,
    gpt_eval_json: `{"reasoning":"${SECRET.thought}","verdict":${index % 2}}`,
    uv_rubric_score: index % 2,
    uv_outcome_success: index % 2,
    mm_is_success: (index + 1) % 2,
    verifier_is_success: index % 2,
    final_human_outcome_label: (index + 1) % 2,
    final_human_process_label: index % 2,
    median_human_rubric_score_agnostic: index % 2,
    majority_human_outcome_vote: (index + 1) % 2,
  };
}

function annotation(taskIndex, judge, outcome, process, score) {
  return {
    task_id: taskId(taskIndex),
    annotator: `Judge${judge}`,
    human_judgement_outcome: outcome ? "Correct" : "Incorrect",
    human_judgement_process: process ? "Correct" : "Incorrect",
    human_process_score: score,
    outcome_comment: `${SECRET.comment}-outcome-${taskIndex}-${judge}`,
    process_comment: `${SECRET.comment}-process-${taskIndex}-${judge}`,
    informed_outcome_agreement: "disagree",
    informed_process_agreement: "agree",
    informed_outcome_comment: `${SECRET.comment}-informed-outcome`,
    informed_process_comment: `${SECRET.comment}-informed-process`,
  };
}

function page(rows, specification, total, offset) {
  return {
    features: features(specification),
    rows: rows.map((row, index) => ({ row_idx: offset + index, row,
      truncated_cells: [] })),
    num_rows_total: total,
    num_rows_per_page: 100,
    partial: false,
  };
}

function fixture({ mutateTrajectory = null, mutateAnnotation = null,
  mutateTrajectoryPage = null, mutateAnnotationPage = null } = {}) {
  const trajectories = Array.from({ length: 106 }, (_, index) => trajectory(index));
  if (mutateTrajectory) mutateTrajectory(trajectories);
  const annotations = [];
  for (let index = 0; index < 106; index += 1) {
    if (index === 0) {
      annotations.push(annotation(index, 1, true, true, 0.2));
      annotations.push(annotation(index, 2, false, false, 0.8));
    } else {
      const correct = index % 2 === 0;
      annotations.push(annotation(index, 1, correct, correct, correct ? 0.9 : 0.1));
      annotations.push(annotation(index, 2, correct, correct, correct ? 0.9 : 0.1));
    }
  }
  annotations.push(annotation(0, 3, true, true, 0.6));
  annotations.push(annotation(1, 3, true, true, 0.5));
  annotations.push(annotation(2, 3, false, false, 0.5));
  if (mutateAnnotation) mutateAnnotation(annotations);

  const trajectoryPageValues = [page(trajectories.slice(0, 100), TRAJECTORY_FEATURES,
    106, 0), page(trajectories.slice(100), TRAJECTORY_FEATURES, 106, 100)];
  const annotationPageValues = [page(annotations.slice(0, 100), ANNOTATION_FEATURES,
    215, 0), page(annotations.slice(100, 200), ANNOTATION_FEATURES, 215, 100),
  page(annotations.slice(200), ANNOTATION_FEATURES, 215, 200)];
  if (mutateTrajectoryPage) mutateTrajectoryPage(trajectoryPageValues);
  if (mutateAnnotationPage) mutateAnnotationPage(annotationPageValues);

  const repository = jsonBytes({ id: CUA_VERIFIER_BENCH_PIN.id,
    sha: CUA_VERIFIER_BENCH_PIN.revision, cardData: { license: "mit" } });
  const repositoryUrl = `https://huggingface.co/api/datasets/${CUA_VERIFIER_BENCH_PIN.id}`;
  const readmeUrl = `https://huggingface.co/datasets/${CUA_VERIFIER_BENCH_PIN.id}/raw/${
    CUA_VERIFIER_BENCH_PIN.revision}/README.md`;
  return {
    generatedAt: "2026-08-28T00:00:00.000Z",
    repositoryBefore: source("source/repository-before.json", repository, {}, repositoryUrl),
    repositoryAfter: source("source/repository-after.json", repository, {}, repositoryUrl),
    readme: source("source/README.md", Buffer.from("---\nlicense: mit\n---\nMIT License\n"),
      {}, readmeUrl),
    trajectoryPages: trajectoryPageValues.map((value, index) => {
      const offset = index * 100;
      const length = index === 0 ? 100 : 6;
      const finish = offset + length - 1;
      return source(`source/trajectories.rows-${String(offset).padStart(3, "0")}-${
        String(finish).padStart(3, "0")}.json`, jsonBytes(value),
      { offset, length }, rowsUrl("trajectories", offset, length));
    }),
    annotationPages: annotationPageValues.map((value, index) => {
      const offset = index * 100;
      const length = index < 2 ? 100 : 15;
      const finish = offset + length - 1;
      return source(`source/annotations.rows-${String(offset).padStart(3, "0")}-${
        String(finish).padStart(3, "0")}.json`, jsonBytes(value),
      { offset, length }, rowsUrl("annotations", offset, length));
    }),
    annotationParquetCrossCheck: null,
  };
}

function learnedProjection(record) {
  return { roots: record.roots, timing: record.timing, episode: record.episode,
    labels: record.labels, privacy: record.privacy, useBoundary: record.useBoundary };
}

test("complete logical pages join 106 browser attempts to 215 blind reviews", () => {
  const result = normalizeCuaVerifierBenchSource(fixture());
  assert.equal(result.episodes.length, 106);
  assert.equal(result.summary.counts.trajectoryRows, 106);
  assert.equal(result.summary.counts.annotationRows, 215);
  assert.equal(result.summary.counts.blindHumanReviews, 215);
  assert.equal(result.verification.logicalRowsVerified, 321);
  assert.equal(result.verification.taskJoinComplete, true);
  assert.equal(result.verification.status, "FULL_SELECTED_LOGICAL_SOURCE_REDERIVED");
  assert.equal(result.manifest.revisionBinding.repositoryHeadMatchedBefore, true);
  assert.equal(result.manifest.revisionBinding.repositoryHeadMatchedAfter, true);
  assert.equal(result.manifest.revisionBinding.cryptographicRowInclusionProof, false);
  assert.equal(result.manifest.completeness.screenshotsFetchedFromReturnedCellReferences, false);
  assert.equal(result.episodes.every((record) =>
    verifyCuaVerifierBenchEpisode(record).ok), true);
});

test("projection excludes screenshots, URLs, instructions, answers, thoughts and identities", () => {
  const result = normalizeCuaVerifierBenchSource(fixture());
  const projected = JSON.stringify(result.episodes);
  for (const secret of Object.values(SECRET)) assert.equal(projected.includes(secret), false);
  for (const forbidden of ["SameSite--00000000", "Judge1", "coordinate\"",
    "gpt_eval_json", "uv_rubric_score", "uv_outcome_success", "mm_is_success",
    "verifier_is_success", "final_human_outcome_label", "outcome_comment"]) {
    assert.equal(projected.includes(forbidden), false);
  }
  const first = result.episodes[0];
  assert.equal(first.episode.logEventCount, 4);
  assert.equal(first.episode.stepCount, 3);
  assert.equal(first.episode.actionKindCounts.LEFT_CLICK, 1);
  assert.equal(first.episode.actionKindCounts.TYPE, 1);
  assert.equal(first.episode.actionKindCounts.OTHER, 1);
  assert.equal(first.privacy.screenshotBytesOrUrlsIncluded, false);
  assert.equal(first.privacy.commentsOrAnnotatorIdentityIncluded, false);
});

test("only UV-blind annotation rows determine source-native labels", () => {
  const baseline = normalizeCuaVerifierBenchSource(fixture());
  const first = baseline.episodes[0];
  assert.equal(first.labels.blindHumanReviewCount, 3);
  assert.equal(first.labels.blindHumanOutcomeMajority, true);
  assert.equal(first.labels.blindHumanProcessMajority, true);
  assert.equal(first.labels.medianBlindHumanProcessScore, 0.6);
  assert.equal(first.labels.sourceNativeHumanLabelsOnly, true);
  assert.equal(first.labels.verifierOutputsUsedAsFeature, false);
  assert.equal(first.labels.verifierOutputsUsedAsLabel, false);

  const poisoned = normalizeCuaVerifierBenchSource(fixture({
    mutateTrajectory(rows) {
      rows[0].gpt_eval_json = "{\"verdict\":999,\"reasoning\":\"poison\"}";
      rows[0].uv_rubric_score = 0.123;
      rows[0].uv_outcome_success = 999;
      rows[0].mm_is_success = 999;
      rows[0].verifier_is_success = 999;
      rows[0].final_human_outcome_label = 999;
      rows[0].final_human_process_label = 999;
      rows[0].median_human_rubric_score_agnostic = 0.321;
      rows[0].majority_human_outcome_vote = 999;
    },
  }));
  const before = learnedProjection(first);
  const after = learnedProjection(poisoned.episodes[0]);
  assert.deepEqual(after.roots, before.roots);
  assert.deepEqual(after.timing, before.timing);
  assert.deepEqual(after.episode, before.episode);
  assert.deepEqual(after.labels, before.labels);
  assert.deepEqual(after.useBoundary, before.useBoundary);
});

test("same site-domain root is an explicit minimum holdout group", () => {
  const result = normalizeCuaVerifierBenchSource(fixture());
  assert.equal(result.episodes[0].roots.siteDomainRoot,
    result.episodes[1].roots.siteDomainRoot);
  assert.notEqual(result.episodes[1].roots.siteDomainRoot,
    result.episodes[2].roots.siteDomainRoot);
  assert.deepEqual(result.episodes[0].roots.correlationRoots,
    [result.episodes[0].roots.siteDomainRoot]);
  assert.equal(result.episodes[0].roots.groupingInstruction,
    "SAME_SITE_DOMAIN_ROOT_MUST_NOT_CROSS_TRAIN_HOLDOUT");
});

test("strict page schemas, exact joins, and source-native labels fail closed", () => {
  assert.throws(() => normalizeCuaVerifierBenchSource(fixture({
    mutateTrajectoryPage(pages) { pages[0].features[0].type.dtype = "int64"; },
  })), /CUA_VERIFIER_BENCH_TRAJECTORY_FEATURE_SCHEMA_INVALID/);
  assert.throws(() => normalizeCuaVerifierBenchSource(fixture({
    mutateAnnotation(rows) { rows[0].task_id = "Orphan--99999999"; },
  })), /CUA_VERIFIER_BENCH_ANNOTATION_ORPHAN/);
  assert.throws(() => normalizeCuaVerifierBenchSource(fixture({
    mutateAnnotation(rows) { rows[0].human_judgement_outcome = "Maybe"; },
  })), /human_judgement_outcome_INVALID/);
  assert.throws(() => normalizeCuaVerifierBenchSource(fixture({
    mutateAnnotation(rows) { rows[1].annotator = rows[0].annotator; },
  })), /CUA_VERIFIER_BENCH_ANNOTATION_DUPLICATED/);
  assert.throws(() => normalizeCuaVerifierBenchSource(fixture({
    mutateTrajectoryPage(pages) { pages[0].rows[0].truncated_cells = ["screenshots"]; },
  })), /CUA_VERIFIER_BENCH_TRAJECTORY_ROW_INVALID/);
});

test("hash replay is deterministic and a re-sealed authority promotion is refused", () => {
  const input = fixture();
  const bundle = normalizeCuaVerifierBenchSource(input);
  const reordered = { ...input,
    trajectoryPages: [...input.trajectoryPages].reverse(),
    annotationPages: [...input.annotationPages].reverse() };
  const second = normalizeCuaVerifierBenchSource(reordered);
  assert.equal(canonicalizeStrict(second), canonicalizeStrict(bundle));
  assert.equal(verifyCuaVerifierBenchSourceReplay(bundle, reordered).ok, true);

  const tamperedBundle = structuredClone(bundle);
  tamperedBundle.episodes[0].episode.stepCount += 1;
  assert.equal(verifyCuaVerifierBenchSourceReplay(tamperedBundle, input).ok, false);

  const promoted = structuredClone(bundle.episodes[0]);
  promoted.useBoundary.authority = "production";
  delete promoted.recordHash;
  promoted.recordHash = cuaVerifierBenchDigest(promoted,
    CUA_VERIFIER_BENCH_SCHEMAS.episode);
  assert.equal(verifyCuaVerifierBenchEpisode(promoted).ok, false);
});

test("web log parser rejects malformed JSONL and never emits unknown tool names", () => {
  assert.throws(() => summarizeCuaWebSurferLog("{not-json}"),
    /CUA_VERIFIER_BENCH_WEB_SURFER_LOG_JSONL_INVALID/);
  const summary = summarizeCuaWebSurferLog(JSON.stringify({
    message: "Action #7: executing tool 'SECRET_EXFILTRATE' with arguments {}",
  }));
  assert.equal(summary.stepCount, 1);
  assert.equal(summary.actionKindCounts.OTHER, 1);
  assert.equal(JSON.stringify(summary).includes("SECRET_EXFILTRATE"), false);
});

test("source-aware trainer replays raw objects before trusted grouped training", () => {
  const input = fixture();
  const bundle = normalizeCuaVerifierBenchSource(input);
  const training = buildCuaVerifierBenchTrainingArtifactsFromSource(input,
    bundle.manifest);
  assert.equal(training.report.schema, CUA_VERIFIER_BENCH_SCHEMAS.trainingReport);
  assert.equal(training.report.sourceBinding.status,
    "RAW_SOURCE_AND_MANIFEST_REPLAY_BOUND");
  assert.equal(training.report.sourceBinding.rawSourceObjectsReplayed, 8);
  assert.equal(training.report.sourceBinding.callerBundleAcceptedWithoutRawReplay, false);
  assert.deepEqual(training.report.featurePolicy.included,
    CUA_VERIFIER_BENCH_TRAINING_FEATURES);
  assert.equal(training.report.featurePolicy.labelsUsedAsFeatures, false);
  assert.equal(training.report.featurePolicy.verifierOutputsUsedAsFeaturesOrLabels, false);
  assert.equal(training.report.featurePolicy.freeTextUrlsCoordinatesImagesUsed, false);
  assert.equal(training.report.split.kind,
    "FIXED_LABEL_AND_FEATURE_BLIND_SITE_DOMAIN_GROUP_HOLDOUT");
  assert.equal(training.report.split.totalGroups, 105);
  assert.equal(training.report.split.trainGroups, 84);
  assert.equal(training.report.split.holdoutGroups, 21);
  assert.equal(training.report.split.groupOverlap, 0);
  assert.equal(training.report.fixedBudget.epochs, 600);
  assert.equal(training.report.assessments.length, 2);
  assert.equal(training.report.assessments.every((assessment) =>
    assessment.status === "TRAINED_AND_FROZEN_GROUP_HOLDOUT_EVALUATED"), true);
  assert.equal(training.report.boundary.explicitOfflineResearchTrainingExecuted, true);
  assert.equal(training.report.boundary.rawSourceReplayBound, true);
  assert.equal(training.report.boundary.automaticTraining, false);
  assert.equal(training.report.boundary.modelDeploymentAuthorized, false);
  assert.equal(training.report.boundary.authority, "none");
  assert.equal(training.report.boundary.causalExperienceUnits, 0);
  assert.equal(training.receipt.productionPromotionAuthorized, false);
  assert.equal(verifyCuaVerifierBenchTrainingArtifactsFromSource(training, input,
    bundle.manifest).ok, true);

  const serialized = JSON.stringify(training);
  for (const secret of Object.values(SECRET)) assert.equal(serialized.includes(secret), false);
  for (const assessment of training.report.assessments) {
    assert.equal(["PROMOTE_OPTIMIZED", "KEEP_BASELINE"]
      .includes(assessment.selection.decision), true);
    if (assessment.selection.decision === "PROMOTE_OPTIMIZED") {
      const baseline = assessment.baseline.holdoutMetrics;
      const optimized = assessment.optimized.holdoutMetrics;
      const policy = CUA_VERIFIER_BENCH_TRAINING_BUDGET.promotion;
      assert.equal(baseline.brier - optimized.brier >= policy.minimumBrierImprovement, true);
      assert.equal(baseline.logLoss - optimized.logLoss
        >= policy.minimumLogLossImprovement, true);
      assert.equal(optimized.auc - baseline.auc >= policy.minimumAucImprovement, true);
      assert.equal(optimized.balancedAccuracy - baseline.balancedAccuracy
        >= policy.minimumBalancedAccuracyImprovement, true);
    } else assert.equal(assessment.selection.reasons.length > 0, true);
  }
});

test("bundle-only fitting is reference-only and cannot verify or promote", () => {
  const bundle = normalizeCuaVerifierBenchSource(fixture());
  const reference = buildCuaVerifierBenchTrainingArtifacts(bundle);
  assert.equal(reference.report.sourceBinding.status,
    "CALLER_BUNDLE_REFERENCE_HASH_ONLY");
  assert.equal(reference.report.sourceBinding.fullSourceVerificationHash, null);
  assert.equal(reference.report.sourceBinding.rawSourceObjectsReplayed, 0);
  assert.equal(reference.report.boundary.rawSourceReplayBound, false);
  assert.equal(reference.report.assessments.every((assessment) =>
    assessment.selection.decision === "REFERENCE_ONLY_NO_PROMOTION"), true);
  assert.equal(reference.report.assessments.every((assessment) =>
    assessment.selection.productionPromotionAuthorized === false), true);
  assert.equal(JSON.stringify(reference).includes("FULL_SELECTED_LOGICAL_SOURCE_REDERIVED"),
    false);
  const checked = verifyCuaVerifierBenchTrainingArtifacts(reference, bundle);
  assert.equal(checked.ok, false);
  assert.equal(checked.referenceHashMatch, true);
  assert.equal(checked.status, "REFERENCE_HASH_ONLY_RAW_SOURCE_REPLAY_REQUIRED");
  assert.equal(checked.productionPromotionAuthorized, false);
});

test("trusted training replay is deterministic and verifier outputs cannot alter models", () => {
  const baselineInput = fixture();
  const baselineBundle = normalizeCuaVerifierBenchSource(baselineInput);
  const baseline = buildCuaVerifierBenchTrainingArtifactsFromSource(baselineInput,
    baselineBundle.manifest);
  assert.equal(canonicalizeStrict(buildCuaVerifierBenchTrainingArtifactsFromSource(
    baselineInput, baselineBundle.manifest)),
    canonicalizeStrict(baseline));

  const poisonedInput = fixture({
    mutateTrajectory(rows) {
      for (const row of rows) {
        row.gpt_eval_json = "{\"reasoning\":\"poison\",\"verdict\":999}";
        row.uv_rubric_score = 0.777;
        row.uv_outcome_success = 999;
        row.mm_is_success = 999;
        row.verifier_is_success = 999;
        row.final_human_outcome_label = 999;
        row.final_human_process_label = 999;
        row.median_human_rubric_score_agnostic = 0.123;
        row.majority_human_outcome_vote = 999;
      }
    },
  });
  const poisonedBundle = normalizeCuaVerifierBenchSource(poisonedInput);
  const poisoned = buildCuaVerifierBenchTrainingArtifactsFromSource(poisonedInput,
    poisonedBundle.manifest);
  assert.equal(canonicalizeStrict(poisoned.report.assessments),
    canonicalizeStrict(baseline.report.assessments));

  const tampered = structuredClone(baseline);
  tampered.report.objective = "TAMPERED_OBJECTIVE";
  assert.equal(verifyCuaVerifierBenchTrainingArtifactsFromSource(tampered,
    baselineInput, baselineBundle.manifest).ok, false);
});

function forgeResealedNormalizedBundle(bundle) {
  const forged = structuredClone(bundle);
  for (const episode of forged.episodes) {
    if (typeof episode.labels.blindHumanOutcomeMajority === "boolean") {
      episode.labels.blindHumanOutcomeMajority =
        !episode.labels.blindHumanOutcomeMajority;
    }
    episode.episode.stepCount += 1_000;
    episode.episode.actionKindCounts.OTHER += 1_000;
    delete episode.recordHash;
    episode.recordHash = cuaVerifierBenchDigest(episode,
      CUA_VERIFIER_BENCH_SCHEMAS.episode);
  }
  forged.summary.recordSetHash = cuaVerifierBenchDigest(forged.episodes
    .map((episode) => episode.recordHash).sort(),
  "outsider/cua-verifier-bench/record-set/v1");
  forged.summary.counts.actionSteps = forged.episodes.reduce((sum, episode) =>
    sum + episode.episode.stepCount, 0);
  delete forged.summary.summaryHash;
  forged.summary.summaryHash = cuaVerifierBenchDigest(forged.summary,
    CUA_VERIFIER_BENCH_SCHEMAS.summary);
  forged.verification.recordSetHash = forged.summary.recordSetHash;
  forged.verification.summaryHash = forged.summary.summaryHash;
  delete forged.verification.verificationHash;
  forged.verification.verificationHash = cuaVerifierBenchDigest(forged.verification,
    CUA_VERIFIER_BENCH_SCHEMAS.verification);
  return forged;
}

test("re-sealed labels and features cannot pass raw-source training verification", () => {
  const input = fixture();
  const sourceBundle = normalizeCuaVerifierBenchSource(input);
  const trusted = buildCuaVerifierBenchTrainingArtifactsFromSource(input,
    sourceBundle.manifest);
  const forgedBundle = forgeResealedNormalizedBundle(sourceBundle);
  const forgedReference = buildCuaVerifierBenchTrainingArtifacts(forgedBundle);
  assert.notEqual(forgedReference.report.modelSetHash, trusted.report.modelSetHash);
  assert.equal(verifyCuaVerifierBenchTrainingArtifacts(forgedReference,
    forgedBundle).ok, false);
  const checked = verifyCuaVerifierBenchTrainingArtifactsFromSource(forgedReference,
    input, sourceBundle.manifest);
  assert.equal(checked.ok, false);
  assert.match(checked.error,
    /CUA_VERIFIER_BENCH_TRAINING_RAW_SOURCE_REPLAY_MISMATCH/);
});
