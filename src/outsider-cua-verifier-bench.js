/*
 * Privacy-minimizing, source-replayable intake for microsoft/CUAVerifierBench.
 *
 * The upstream logical rows contain screenshots, instructions, URLs, agent
 * thoughts, free text, coordinates, model verdicts, and reviewer identifiers.
 * Those bytes remain quarantined source material.  This adapter emits only
 * timing, fixed-vocabulary action counts, blind-human aggregate labels, and
 * hash roots.  It does not establish delegated authority, recovery, economic
 * loss, or causal experience.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const CUA_VERIFIER_BENCH_SCHEMAS = Object.freeze({
  manifest: "outsider/cua-verifier-bench-source-manifest/v1",
  episode: "outsider/cua-verifier-bench-normalized-episode/v1",
  summary: "outsider/cua-verifier-bench-summary/v1",
  verification: "outsider/cua-verifier-bench-full-source-verification/v1",
  trainingReport: "outsider/cua-verifier-bench-follow-up-model-report/v2",
  trainingReceipt: "outsider/cua-verifier-bench-training-run-receipt/v2",
});

export const CUA_VERIFIER_BENCH_PIN = Object.freeze({
  id: "microsoft/CUAVerifierBench",
  revision: "c19eb323cd802add5c3d2840ff13044061364867",
  licenseId: "MIT",
  trajectories: Object.freeze({
    config: "trajectories",
    split: "fara7b_om2w_browserbase",
    totalRows: 106,
    pages: Object.freeze([
      Object.freeze({ offset: 0, length: 100 }),
      Object.freeze({ offset: 100, length: 6 }),
    ]),
  }),
  annotations: Object.freeze({
    config: "annotations",
    split: "fara7b_om2w_browserbase",
    totalRows: 215,
    pages: Object.freeze([
      Object.freeze({ offset: 0, length: 100 }),
      Object.freeze({ offset: 100, length: 100 }),
      Object.freeze({ offset: 200, length: 15 }),
    ]),
  }),
  localAnnotationParquetCrossCheck: Object.freeze({
    path: "source/annotations-fara7b-om2w-browserbase.parquet",
    sizeBytes: 77_932,
    sha256: "sha256:10d459cf76e888de082534be156f60974176617242ce5ebdaac554461468ab84",
  }),
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TASK_ID = /^[^\u0000-\u001f\u007f]{1,256}--[^\u0000-\u001f\u007f]{1,256}$/;
const ISO_INPUT = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?(Z|[+-]\d{2}:?\d{2})?$/;
const REPOSITORY_URL = `https://huggingface.co/api/datasets/${CUA_VERIFIER_BENCH_PIN.id}`;
const README_URL = `https://huggingface.co/datasets/${CUA_VERIFIER_BENCH_PIN.id}/raw/${
  CUA_VERIFIER_BENCH_PIN.revision}/README.md`;

const TRAJECTORY_FEATURES = Object.freeze([
  ["task_id", "string"],
  ["instruction", "string"],
  ["init_url", "string"],
  ["start_timestamp", "string"],
  ["end_timestamp", "string"],
  ["final_answer", "string"],
  ["is_aborted", "bool"],
  ["web_surfer_log", "string"],
  ["screenshots", "list:image"],
  ["n_screenshots", "int32"],
  ["gpt_eval_json", "string"],
  ["uv_rubric_score", "float32"],
  ["uv_outcome_success", "int32"],
  ["mm_is_success", "int32"],
  ["verifier_is_success", "int32"],
  ["final_human_outcome_label", "int32"],
  ["final_human_process_label", "int32"],
  ["median_human_rubric_score_agnostic", "float32"],
  ["majority_human_outcome_vote", "int32"],
]);

const ANNOTATION_FEATURES = Object.freeze([
  ["task_id", "string"],
  ["annotator", "string"],
  ["human_judgement_outcome", "string"],
  ["human_judgement_process", "string"],
  ["human_process_score", "float32"],
  ["outcome_comment", "string"],
  ["process_comment", "string"],
  ["informed_outcome_agreement", "string"],
  ["informed_process_agreement", "string"],
  ["informed_outcome_comment", "string"],
  ["informed_process_comment", "string"],
]);

const TRAJECTORY_KEYS = TRAJECTORY_FEATURES.map(([name]) => name);
const ANNOTATION_KEYS = ANNOTATION_FEATURES.map(([name]) => name);

export const CUA_VERIFIER_BENCH_ACTION_KINDS = Object.freeze([
  "LEFT_CLICK", "DOUBLE_CLICK", "RIGHT_CLICK", "TYPE", "SCROLL", "KEYPRESS",
  "HOVER", "WEB_SEARCH", "VISIT_URL", "HISTORY_BACK", "TERMINATE", "OTHER",
]);

export const CUA_VERIFIER_BENCH_TRAINING_FEATURES = Object.freeze([
  "durationMsLog1p", "aborted", "nScreenshotsLog1p", "stepCountLog1p",
  ...CUA_VERIFIER_BENCH_ACTION_KINDS.map((kind) => `${kind}CountLog1p`),
]);

export const CUA_VERIFIER_BENCH_TRAINING_BUDGET = Object.freeze({
  splitSeed: "outsider/cua-verifier-bench/site-domain-holdout/v1",
  holdoutFraction: 0.2,
  optimizedAlgorithm: "DETERMINISTIC_FULL_BATCH_LOGISTIC_REGRESSION",
  epochs: 600,
  learningRate: 0.05,
  learningRateDecay: 0.005,
  l2: 0.05,
  threshold: 0.5,
  promotion: Object.freeze({
    minimumHoldoutRows: 12,
    minimumPositiveRows: 3,
    minimumNegativeRows: 3,
    minimumBrierImprovement: 0.002,
    minimumLogLossImprovement: 0.002,
    minimumAucImprovement: 0.02,
    minimumBalancedAccuracyImprovement: 0,
  }),
});

const ACTION_ALIASES = Object.freeze({
  left_click: "LEFT_CLICK",
  click: "LEFT_CLICK",
  double_click: "DOUBLE_CLICK",
  right_click: "RIGHT_CLICK",
  type: "TYPE",
  input_text: "TYPE",
  scroll: "SCROLL",
  keypress: "KEYPRESS",
  key_press: "KEYPRESS",
  hover: "HOVER",
  web_search: "WEB_SEARCH",
  search: "WEB_SEARCH",
  visit_url: "VISIT_URL",
  navigate: "VISIT_URL",
  history_back: "HISTORY_BACK",
  go_back: "HISTORY_BACK",
  terminate: "TERMINATE",
});

const NORMALIZER_POLICY = Object.freeze({
  version: "1.0.0",
  includedEpisodeFields: Object.freeze([
    "taskHash", "siteDomainHash", "startUtc", "endUtc", "durationMs", "aborted",
    "nScreenshots", "logEventCount", "stepCount", "actionKindCounts",
    "blindHumanOutcomeMajority", "blindHumanProcessMajority",
    "medianBlindHumanProcessScore", "blindHumanReviewCount",
  ]),
  forbiddenFeatureOrLabelSources: Object.freeze([
    "instruction", "init_url", "final_answer", "screenshots", "web_surfer_free_text",
    "thoughts", "coordinates", "annotator", "comments", "informed_review",
    "gpt_eval_json", "uv_rubric_score", "uv_outcome_success", "mm_is_success",
    "verifier_is_success", "trajectory_embedded_human_aggregates",
  ]),
  grouping: "SAME_SITE_DOMAIN_HASH_MUST_NOT_CROSS_TRAIN_HOLDOUT",
});

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function exactKeys(value, keys) {
  return plain(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function deepFreeze(value) {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

export function cuaVerifierBenchDigest(value,
  domain = "outsider/cua-verifier-bench/v1") {
  const bytes = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? Buffer.from(value, "utf8")
      : Buffer.from(canonicalizeStrict(value), "utf8");
  return `sha256:${createHash("sha256").update(`${domain}\0`).update(bytes).digest("hex")}`;
}

function rawSha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function seal(body, schema, hashField) {
  return { ...body, [hashField]: cuaVerifierBenchDigest(body, schema) };
}

function parseJsonBytes(source, code) {
  if (!plain(source) || typeof source.path !== "string" || source.path.length < 1
    || typeof source.url !== "string" || !Buffer.isBuffer(source.bytes)) {
    fail(`${code}_SOURCE_INVALID`);
  }
  try {
    const value = JSON.parse(source.bytes.toString("utf8"));
    if (!plain(value)) fail(`${code}_ROOT_INVALID`);
    return value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(code)) throw error;
    fail(`${code}_JSON_INVALID`);
  }
}

function pageFilename(config, offset, length) {
  return `${config}.rows-${String(offset).padStart(3, "0")}-${
    String(offset + length - 1).padStart(3, "0")}.json`;
}

function pageUrl(config, split, offset, length) {
  const query = new URLSearchParams({ dataset: CUA_VERIFIER_BENCH_PIN.id, config, split,
    offset: String(offset), length: String(length) });
  return `https://datasets-server.huggingface.co/rows?${query}`;
}

function requireExactSource(source, expectedPath, expectedUrl, code) {
  if (!plain(source) || source.path !== expectedPath || source.url !== expectedUrl
    || !Buffer.isBuffer(source.bytes)) fail(`${code}_SOURCE_BINDING_INVALID`);
}

function sourceDescriptor(source, role, details = {}) {
  return {
    path: source.path,
    role,
    url: source.url,
    sizeBytes: source.bytes.length,
    sha256: rawSha256(source.bytes),
    ...details,
  };
}

function requireRepositorySnapshot(source, code) {
  const metadata = parseJsonBytes(source, code);
  if (metadata.id !== CUA_VERIFIER_BENCH_PIN.id
    || metadata.sha !== CUA_VERIFIER_BENCH_PIN.revision
    || String(metadata.cardData?.license ?? "").toLowerCase() !== "mit") {
    fail(`${code}_PIN_MISMATCH`);
  }
  return metadata;
}

function featureSignature(type) {
  if (!plain(type) || typeof type._type !== "string") return null;
  if (type._type === "Value") {
    if (!exactKeys(type, ["dtype", "_type"]) || typeof type.dtype !== "string") return null;
    return type.dtype;
  }
  if (type._type === "List") {
    if (!exactKeys(type, ["feature", "_type"]) || !plain(type.feature)
      || type.feature._type !== "Image") return null;
    const imageKeys = Object.keys(type.feature).sort();
    if (imageKeys.some((key) => !["_type", "decode", "id"].includes(key))) return null;
    if ("decode" in type.feature && typeof type.feature.decode !== "boolean") return null;
    if ("id" in type.feature && type.feature.id !== null
      && typeof type.feature.id !== "string") return null;
    return "list:image";
  }
  return null;
}

function requireFeatures(features, expected, code) {
  if (!Array.isArray(features) || features.length !== expected.length) {
    fail(`${code}_FEATURE_COUNT_INVALID`);
  }
  for (let index = 0; index < expected.length; index += 1) {
    const feature = features[index];
    if (!exactKeys(feature, ["feature_idx", "name", "type"])
      || feature.feature_idx !== index || feature.name !== expected[index][0]
      || featureSignature(feature.type) !== expected[index][1]) {
      fail(`${code}_FEATURE_SCHEMA_INVALID`, String(index));
    }
  }
}

function requireRowsPage(source, { total, offset, length, expectedFeatures, rowKeys, code }) {
  const page = parseJsonBytes(source, code);
  if (!exactKeys(page,
    ["features", "rows", "num_rows_total", "num_rows_per_page", "partial"])
    || page.num_rows_total !== total || page.num_rows_per_page !== 100
    || page.partial !== false || !Array.isArray(page.rows) || page.rows.length !== length) {
    fail(`${code}_PAGE_SHAPE_INVALID`, String(offset));
  }
  requireFeatures(page.features, expectedFeatures, code);
  for (let index = 0; index < page.rows.length; index += 1) {
    const item = page.rows[index];
    if (!exactKeys(item, ["row_idx", "row", "truncated_cells"])
      || item.row_idx !== offset + index || !exactKeys(item.row, rowKeys)
      || !Array.isArray(item.truncated_cells) || item.truncated_cells.length !== 0) {
      fail(`${code}_ROW_INVALID`, String(offset + index));
    }
  }
  return page;
}

function orderedPageSources(pages, expected, code) {
  if (!Array.isArray(pages) || pages.length !== expected.length) {
    fail(`${code}_PAGE_SET_INVALID`);
  }
  const byOffset = new Map();
  for (const source of pages) {
    if (!plain(source) || !Number.isSafeInteger(source.offset)
      || !Number.isSafeInteger(source.length) || byOffset.has(source.offset)) {
      fail(`${code}_PAGE_DESCRIPTOR_INVALID`);
    }
    byOffset.set(source.offset, source);
  }
  return expected.map((page) => {
    const source = byOffset.get(page.offset);
    if (!source || source.length !== page.length) fail(`${code}_PAGE_GRID_INVALID`);
    return source;
  });
}

function requirePageSourceBindings(sources, config, split, code) {
  for (const source of sources) {
    requireExactSource(source, `source/${pageFilename(config, source.offset, source.length)}`,
      pageUrl(config, split, source.offset, source.length), code);
  }
}

function finiteUnit(value, code, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    fail(code);
  }
  return value;
}

function integerOrNull(value, code) {
  if (value === null) return null;
  if (!Number.isSafeInteger(value)) fail(code);
  return value;
}

function requireString(value, code, maximum = 16_000_000) {
  if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > maximum) fail(code);
  return value;
}

function normalizedUtc(value, code) {
  requireString(value, code, 128);
  const matched = ISO_INPUT.exec(value);
  if (!matched) fail(code);
  const fraction = (matched[3] ?? "").padEnd(3, "0").slice(0, 3);
  const zone = matched[4] ?? "Z";
  const canonicalZone = /^[+-]\d{4}$/.test(zone)
    ? `${zone.slice(0, 3)}:${zone.slice(3)}` : zone;
  const parsed = Date.parse(`${matched[1]}T${matched[2]}.${fraction}${canonicalZone}`);
  if (!Number.isFinite(parsed)) fail(code);
  return new Date(parsed).toISOString();
}

function requireTaskId(value, code) {
  if (typeof value !== "string" || !TASK_ID.test(value)) fail(code);
  return value;
}

function siteDomain(taskId) {
  return taskId.slice(0, taskId.indexOf("--")).trim().toLowerCase();
}

function actionKind(toolName) {
  return ACTION_ALIASES[toolName.toLowerCase()] ?? "OTHER";
}

export function summarizeCuaWebSurferLog(value) {
  requireString(value, "CUA_VERIFIER_BENCH_WEB_SURFER_LOG_INVALID");
  const lines = value.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const counts = Object.fromEntries(CUA_VERIFIER_BENCH_ACTION_KINDS.map((kind) => [kind, 0]));
  let stepCount = 0;
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try { event = JSON.parse(lines[index]); }
    catch { fail("CUA_VERIFIER_BENCH_WEB_SURFER_LOG_JSONL_INVALID", String(index)); }
    if (!plain(event) || typeof event.message !== "string") {
      fail("CUA_VERIFIER_BENCH_WEB_SURFER_LOG_EVENT_INVALID", String(index));
    }
    const matched = /\bAction\s*#\d+\s*:\s*executing\s+tool\s+['"]([A-Za-z0-9_-]{1,64})['"]/i
      .exec(event.message);
    if (matched) {
      counts[actionKind(matched[1])] += 1;
      stepCount += 1;
    }
  }
  return deepFreeze({ logEventCount: lines.length, stepCount, actionKindCounts: counts });
}

function requireTrajectory(row, rowIndex) {
  const code = `CUA_VERIFIER_BENCH_TRAJECTORY_${rowIndex}`;
  const taskId = requireTaskId(row.task_id, `${code}_TASK_ID_INVALID`);
  requireString(row.instruction, `${code}_INSTRUCTION_INVALID`);
  requireString(row.init_url, `${code}_INIT_URL_INVALID`, 16_384);
  requireString(row.final_answer, `${code}_FINAL_ANSWER_INVALID`);
  requireString(row.gpt_eval_json, `${code}_GPT_EVAL_INVALID`);
  if (typeof row.is_aborted !== "boolean" || !Array.isArray(row.screenshots)
    || !Number.isSafeInteger(row.n_screenshots) || row.n_screenshots < 0
    || row.screenshots.length !== row.n_screenshots) {
    fail(`${code}_STRUCTURE_INVALID`);
  }
  finiteUnit(row.uv_rubric_score, `${code}_UV_RUBRIC_INVALID`, { nullable: true });
  integerOrNull(row.uv_outcome_success, `${code}_UV_OUTCOME_INVALID`);
  integerOrNull(row.mm_is_success, `${code}_MM_OUTCOME_INVALID`);
  integerOrNull(row.verifier_is_success, `${code}_VERIFIER_OUTCOME_INVALID`);
  integerOrNull(row.final_human_outcome_label, `${code}_EMBEDDED_HUMAN_OUTCOME_INVALID`);
  integerOrNull(row.final_human_process_label, `${code}_EMBEDDED_HUMAN_PROCESS_INVALID`);
  finiteUnit(row.median_human_rubric_score_agnostic,
    `${code}_EMBEDDED_HUMAN_SCORE_INVALID`, { nullable: true });
  integerOrNull(row.majority_human_outcome_vote,
    `${code}_EMBEDDED_HUMAN_MAJORITY_INVALID`);
  const startUtc = normalizedUtc(row.start_timestamp, `${code}_START_INVALID`);
  const endUtc = normalizedUtc(row.end_timestamp, `${code}_END_INVALID`);
  const durationMs = Date.parse(endUtc) - Date.parse(startUtc);
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) fail(`${code}_TIME_ORDER_INVALID`);
  return { taskId, startUtc, endUtc, durationMs,
    log: summarizeCuaWebSurferLog(row.web_surfer_log) };
}

function requireAnnotation(row, rowIndex) {
  const code = `CUA_VERIFIER_BENCH_ANNOTATION_${rowIndex}`;
  const taskId = requireTaskId(row.task_id, `${code}_TASK_ID_INVALID`);
  if (typeof row.annotator !== "string" || !/^Judge[1-9]\d*$/.test(row.annotator)) {
    fail(`${code}_ANNOTATOR_INVALID`);
  }
  for (const name of ["human_judgement_outcome", "human_judgement_process"]) {
    if (!["Correct", "Incorrect"].includes(row[name])) fail(`${code}_${name}_INVALID`);
  }
  finiteUnit(row.human_process_score, `${code}_HUMAN_PROCESS_SCORE_INVALID`);
  for (const name of ["outcome_comment", "process_comment", "informed_outcome_agreement",
    "informed_process_agreement", "informed_outcome_comment", "informed_process_comment"]) {
    requireString(row[name], `${code}_${name}_INVALID`);
  }
  return { taskId, annotator: row.annotator,
    outcome: row.human_judgement_outcome === "Correct",
    process: row.human_judgement_process === "Correct",
    processScore: row.human_process_score };
}

function majority(values) {
  const positive = values.filter(Boolean).length;
  const negative = values.length - positive;
  return positive === negative ? null : positive > negative;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const value = ordered.length % 2 === 1 ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
  return Math.round((value + Number.EPSILON) * 1e12) / 1e12;
}

function boundary() {
  return {
    disposition: "HOLD",
    authority: "none",
    causalExperienceUnits: 0,
    economicLossObserved: false,
    ownerAuthorityObserved: false,
    irreversibleRealWriteEstablished: false,
    recoveryObserved: false,
    longitudinalOutcomeObserved: false,
    automaticTraining: false,
    automaticAuthorityExpansion: false,
    permits: { PRICE: false, GUARANTEE: false, SETTLE: false, EXPAND_AUTHORITY: false },
  };
}

function normalizeEpisode({ trajectory, parsed, annotations, trajectoryPageHash,
  annotationPageHashes }) {
  const taskHash = cuaVerifierBenchDigest(parsed.taskId,
    "outsider/cua-verifier-bench/task-root/v1");
  const domainHash = cuaVerifierBenchDigest(siteDomain(parsed.taskId),
    "outsider/cua-verifier-bench/site-domain-root/v1");
  const outcomes = annotations.map((item) => item.outcome);
  const processes = annotations.map((item) => item.process);
  const body = {
    schema: CUA_VERIFIER_BENCH_SCHEMAS.episode,
    schemaVersion: "1.0.0",
    source: {
      datasetId: CUA_VERIFIER_BENCH_PIN.id,
      revision: CUA_VERIFIER_BENCH_PIN.revision,
      config: CUA_VERIFIER_BENCH_PIN.trajectories.config,
      split: CUA_VERIFIER_BENCH_PIN.trajectories.split,
      licenseId: CUA_VERIFIER_BENCH_PIN.licenseId,
      sourceClass: "REAL_BROWSER_AGENT_ATTEMPT_WITH_BLIND_HUMAN_REVIEW",
      trajectoryLogicalPageHash: trajectoryPageHash,
      annotationLogicalPageHashes: [...annotationPageHashes].sort(),
    },
    roots: {
      taskRoot: taskHash,
      siteDomainRoot: domainHash,
      correlationRoots: [domainHash],
      groupingInstruction: "SAME_SITE_DOMAIN_ROOT_MUST_NOT_CROSS_TRAIN_HOLDOUT",
    },
    timing: { startUtc: parsed.startUtc, endUtc: parsed.endUtc,
      durationMs: parsed.durationMs, sourceNaiveTimestampsAssumedUtc: true },
    episode: {
      aborted: trajectory.is_aborted,
      nScreenshots: trajectory.n_screenshots,
      logEventCount: parsed.log.logEventCount,
      stepCount: parsed.log.stepCount,
      actionKindCounts: parsed.log.actionKindCounts,
    },
    labels: {
      sourceNativeKind: "UV_BLIND_HUMAN_REVIEW_AGGREGATE",
      blindHumanReviewCount: annotations.length,
      blindHumanOutcomeMajority: majority(outcomes),
      blindHumanProcessMajority: majority(processes),
      medianBlindHumanProcessScore: median(annotations.map((item) => item.processScore)),
      sourceNativeHumanLabelsOnly: true,
      verifierOutputsUsedAsFeature: false,
      verifierOutputsUsedAsLabel: false,
      informedReviewUsed: false,
    },
    privacy: {
      rawContentIncluded: false,
      taskIdIncluded: false,
      siteDomainIncluded: false,
      screenshotBytesOrUrlsIncluded: false,
      instructionFinalAnswerThoughtTextIncluded: false,
      coordinatesIncluded: false,
      commentsOrAnnotatorIdentityIncluded: false,
      projection: "HASHED_ROOTS_STRUCTURAL_COUNTS_AND_BLIND_HUMAN_AGGREGATES_ONLY",
    },
    useBoundary: boundary(),
  };
  return seal(body, CUA_VERIFIER_BENCH_SCHEMAS.episode, "recordHash");
}

function crossCheckDescriptor(source) {
  if (source == null) return { status: "NOT_PRESENT", usedForProjection: false,
    expected: CUA_VERIFIER_BENCH_PIN.localAnnotationParquetCrossCheck };
  if (!plain(source) || source.path !== CUA_VERIFIER_BENCH_PIN
    .localAnnotationParquetCrossCheck.path || !Buffer.isBuffer(source.bytes)
    || source.bytes.length !== CUA_VERIFIER_BENCH_PIN.localAnnotationParquetCrossCheck.sizeBytes
    || rawSha256(source.bytes) !== CUA_VERIFIER_BENCH_PIN.localAnnotationParquetCrossCheck.sha256) {
    fail("CUA_VERIFIER_BENCH_ANNOTATION_PARQUET_CROSS_CHECK_MISMATCH");
  }
  return { status: "MATCHED_OFFICIAL_SELECTED_PARQUET_BYTES", usedForProjection: false,
    object: { path: source.path, sizeBytes: source.bytes.length,
      sha256: rawSha256(source.bytes) } };
}

export function normalizeCuaVerifierBenchSource(input) {
  if (!plain(input) || typeof input.generatedAt !== "string"
    || new Date(input.generatedAt).toISOString() !== input.generatedAt) {
    fail("CUA_VERIFIER_BENCH_INPUT_INVALID");
  }
  requireExactSource(input.repositoryBefore, "source/repository-before.json", REPOSITORY_URL,
    "CUA_VERIFIER_BENCH_REPOSITORY_BEFORE");
  requireExactSource(input.repositoryAfter, "source/repository-after.json", REPOSITORY_URL,
    "CUA_VERIFIER_BENCH_REPOSITORY_AFTER");
  requireExactSource(input.readme, "source/README.md", README_URL,
    "CUA_VERIFIER_BENCH_README");
  requireRepositorySnapshot(input.repositoryBefore,
    "CUA_VERIFIER_BENCH_REPOSITORY_BEFORE");
  requireRepositorySnapshot(input.repositoryAfter,
    "CUA_VERIFIER_BENCH_REPOSITORY_AFTER");
  if (!Buffer.isBuffer(input.readme?.bytes)
    || !/license:\s*mit/i.test(input.readme.bytes.toString("utf8"))
    || !/MIT License/i.test(input.readme.bytes.toString("utf8"))) {
    fail("CUA_VERIFIER_BENCH_README_LICENSE_INVALID");
  }
  const trajectorySources = orderedPageSources(input.trajectoryPages,
    CUA_VERIFIER_BENCH_PIN.trajectories.pages, "CUA_VERIFIER_BENCH_TRAJECTORY");
  const annotationSources = orderedPageSources(input.annotationPages,
    CUA_VERIFIER_BENCH_PIN.annotations.pages, "CUA_VERIFIER_BENCH_ANNOTATION");
  requirePageSourceBindings(trajectorySources, CUA_VERIFIER_BENCH_PIN.trajectories.config,
    CUA_VERIFIER_BENCH_PIN.trajectories.split, "CUA_VERIFIER_BENCH_TRAJECTORY");
  requirePageSourceBindings(annotationSources, CUA_VERIFIER_BENCH_PIN.annotations.config,
    CUA_VERIFIER_BENCH_PIN.annotations.split, "CUA_VERIFIER_BENCH_ANNOTATION");

  const trajectoryRows = [];
  const trajectoryPages = [];
  for (const source of trajectorySources) {
    const page = requireRowsPage(source, {
      total: CUA_VERIFIER_BENCH_PIN.trajectories.totalRows,
      offset: source.offset, length: source.length,
      expectedFeatures: TRAJECTORY_FEATURES, rowKeys: TRAJECTORY_KEYS,
      code: "CUA_VERIFIER_BENCH_TRAJECTORY",
    });
    const pageHash = rawSha256(source.bytes);
    trajectoryPages.push({ source, page, pageHash });
    for (const item of page.rows) trajectoryRows.push({ item, pageHash });
  }
  const annotationRows = [];
  const annotationPages = [];
  for (const source of annotationSources) {
    const page = requireRowsPage(source, {
      total: CUA_VERIFIER_BENCH_PIN.annotations.totalRows,
      offset: source.offset, length: source.length,
      expectedFeatures: ANNOTATION_FEATURES, rowKeys: ANNOTATION_KEYS,
      code: "CUA_VERIFIER_BENCH_ANNOTATION",
    });
    const pageHash = rawSha256(source.bytes);
    annotationPages.push({ source, page, pageHash });
    for (const item of page.rows) annotationRows.push({ item, pageHash });
  }

  const trajectoryByTask = new Map();
  for (const { item, pageHash } of trajectoryRows) {
    const parsed = requireTrajectory(item.row, item.row_idx);
    if (trajectoryByTask.has(parsed.taskId)) fail("CUA_VERIFIER_BENCH_TASK_DUPLICATED");
    trajectoryByTask.set(parsed.taskId, { trajectory: item.row, parsed, pageHash,
      rowIndex: item.row_idx });
  }
  const annotationsByTask = new Map();
  const annotationIdentities = new Set();
  for (const { item, pageHash } of annotationRows) {
    const parsed = requireAnnotation(item.row, item.row_idx);
    if (!trajectoryByTask.has(parsed.taskId)) fail("CUA_VERIFIER_BENCH_ANNOTATION_ORPHAN");
    const identity = `${parsed.taskId}\0${parsed.annotator}`;
    if (annotationIdentities.has(identity)) fail("CUA_VERIFIER_BENCH_ANNOTATION_DUPLICATED");
    annotationIdentities.add(identity);
    const rows = annotationsByTask.get(parsed.taskId) ?? [];
    rows.push({ ...parsed, pageHash });
    annotationsByTask.set(parsed.taskId, rows);
  }
  if (trajectoryByTask.size !== CUA_VERIFIER_BENCH_PIN.trajectories.totalRows
    || annotationRows.length !== CUA_VERIFIER_BENCH_PIN.annotations.totalRows
    || [...trajectoryByTask.keys()].some((taskId) => !annotationsByTask.has(taskId))) {
    fail("CUA_VERIFIER_BENCH_JOIN_INCOMPLETE");
  }

  const episodes = [...trajectoryByTask.values()]
    .sort((left, right) => left.rowIndex - right.rowIndex)
    .map(({ trajectory, parsed, pageHash }) => {
      const annotations = annotationsByTask.get(parsed.taskId);
      return normalizeEpisode({ trajectory, parsed, annotations,
        trajectoryPageHash: pageHash,
        annotationPageHashes: [...new Set(annotations.map((item) => item.pageHash))] });
    });

  const sourceObjects = [
    sourceDescriptor(input.repositoryBefore, "HF_REPOSITORY_HEAD_BEFORE"),
    sourceDescriptor(input.repositoryAfter, "HF_REPOSITORY_HEAD_AFTER"),
    sourceDescriptor(input.readme, "PINNED_README_LICENSE_DECLARATION"),
    ...trajectoryPages.map(({ source }) => sourceDescriptor(source,
      "HF_DATASETS_SERVER_LOGICAL_ROWS", { config: CUA_VERIFIER_BENCH_PIN.trajectories.config,
        split: CUA_VERIFIER_BENCH_PIN.trajectories.split,
        offset: source.offset, length: source.length })),
    ...annotationPages.map(({ source }) => sourceDescriptor(source,
      "HF_DATASETS_SERVER_LOGICAL_ROWS", { config: CUA_VERIFIER_BENCH_PIN.annotations.config,
        split: CUA_VERIFIER_BENCH_PIN.annotations.split,
        offset: source.offset, length: source.length })),
  ].sort((left, right) => left.path.localeCompare(right.path));
  const sourceObjectSetHash = cuaVerifierBenchDigest(sourceObjects,
    "outsider/cua-verifier-bench/source-object-set/v1");
  const normalizerPolicyHash = cuaVerifierBenchDigest(NORMALIZER_POLICY,
    "outsider/cua-verifier-bench/normalizer-policy/v1");
  const manifestBody = {
    schema: CUA_VERIFIER_BENCH_SCHEMAS.manifest,
    schemaVersion: "1.0.0",
    generatedAt: input.generatedAt,
    source: {
      datasetId: CUA_VERIFIER_BENCH_PIN.id,
      revision: CUA_VERIFIER_BENCH_PIN.revision,
      licenseId: CUA_VERIFIER_BENCH_PIN.licenseId,
      licenseLegalConclusionClaimed: false,
      split: CUA_VERIFIER_BENCH_PIN.trajectories.split,
      trajectories: { config: CUA_VERIFIER_BENCH_PIN.trajectories.config,
        expectedRows: CUA_VERIFIER_BENCH_PIN.trajectories.totalRows,
        pages: CUA_VERIFIER_BENCH_PIN.trajectories.pages },
      annotations: { config: CUA_VERIFIER_BENCH_PIN.annotations.config,
        expectedRows: CUA_VERIFIER_BENCH_PIN.annotations.totalRows,
        pages: CUA_VERIFIER_BENCH_PIN.annotations.pages },
    },
    revisionBinding: {
      repositoryHeadMatchedBefore: true,
      repositoryHeadMatchedAfter: true,
      datasetsServerRevisionParameterAvailable: false,
      cryptographicRowInclusionProof: false,
      status: "PINNED_HEAD_MATCHED_BEFORE_AND_AFTER_LOGICAL_API_ACQUISITION",
    },
    completeness: {
      logicalTrajectorySplitComplete: true,
      logicalAnnotationSplitComplete: true,
      fullTrajectoryParquetBytesAcquired: false,
      screenshotsFetchedFromReturnedCellReferences: false,
    },
    privacy: {
      rawObjectsMode: "0600_QUARANTINED_BY_ACQUISITION_CLI",
      projectionPolicyHash: normalizerPolicyHash,
      freeTextOrImageContentPermittedInProjection: false,
    },
    sourceObjects,
    sourceObjectSetHash,
    annotationParquetCrossCheck: crossCheckDescriptor(input.annotationParquetCrossCheck),
  };
  const manifest = seal(manifestBody, CUA_VERIFIER_BENCH_SCHEMAS.manifest, "manifestHash");
  const recordSetHash = cuaVerifierBenchDigest(episodes.map((episode) => episode.recordHash).sort(),
    "outsider/cua-verifier-bench/record-set/v1");
  const outcomeLabeled = episodes.filter((episode) =>
    episode.labels.blindHumanOutcomeMajority !== null).length;
  const processLabeled = episodes.filter((episode) =>
    episode.labels.blindHumanProcessMajority !== null).length;
  const summaryBody = {
    schema: CUA_VERIFIER_BENCH_SCHEMAS.summary,
    schemaVersion: "1.0.0",
    manifestHash: manifest.manifestHash,
    recordSetHash,
    counts: {
      trajectoryRows: trajectoryRows.length,
      annotationRows: annotationRows.length,
      normalizedEpisodes: episodes.length,
      uniqueTaskRoots: new Set(episodes.map((episode) => episode.roots.taskRoot)).size,
      uniqueSiteDomainRoots: new Set(episodes.map((episode) =>
        episode.roots.siteDomainRoot)).size,
      blindHumanReviews: episodes.reduce((sum, episode) =>
        sum + episode.labels.blindHumanReviewCount, 0),
      outcomeMajorityAvailableEpisodes: outcomeLabeled,
      processMajorityAvailableEpisodes: processLabeled,
      abortedEpisodes: episodes.filter((episode) => episode.episode.aborted).length,
      actionSteps: episodes.reduce((sum, episode) => sum + episode.episode.stepCount, 0),
      causalExperienceUnits: 0,
      economicLossRows: 0,
      recoveryRows: 0,
      authorityRows: 0,
    },
    interpretation: {
      actualBrowserAgentAttemptsObserved: true,
      blindHumanReviewObserved: true,
      sameDomainGroupingRequired: true,
      sourceNativeHumanLabelsOnly: true,
      verifierOutputsUsedAsFeatureOrLabel: false,
      ownerAuthorityObserved: false,
      irreversibleRealWriteEstablished: false,
      recoveryOrLongitudinalOutcomeObserved: false,
      automaticTraining: false,
      automaticAuthorityExpansion: false,
      disposition: "HOLD",
    },
  };
  const summary = seal(summaryBody, CUA_VERIFIER_BENCH_SCHEMAS.summary, "summaryHash");
  const verificationBody = {
    schema: CUA_VERIFIER_BENCH_SCHEMAS.verification,
    schemaVersion: "1.0.0",
    status: "FULL_SELECTED_LOGICAL_SOURCE_REDERIVED",
    manifestHash: manifest.manifestHash,
    recordSetHash,
    summaryHash: summary.summaryHash,
    sourceObjectSetHash,
    sourceObjectsVerified: sourceObjects.length,
    logicalRowsVerified: trajectoryRows.length + annotationRows.length,
    taskJoinComplete: true,
    rawScreenshotsDereferenced: false,
    privacyProjectionReplayed: true,
    normalizerPolicyHash,
    boundary: boundary(),
  };
  const verification = seal(verificationBody, CUA_VERIFIER_BENCH_SCHEMAS.verification,
    "verificationHash");
  return deepFreeze({ manifest, episodes, summary, verification });
}

export function verifyCuaVerifierBenchEpisode(record) {
  try {
    if (!plain(record) || record.schema !== CUA_VERIFIER_BENCH_SCHEMAS.episode
      || !HASH.test(record.recordHash ?? "")) fail("CUA_VERIFIER_BENCH_RECORD_INVALID");
    const { recordHash, ...body } = record;
    if (cuaVerifierBenchDigest(body, CUA_VERIFIER_BENCH_SCHEMAS.episode) !== recordHash
      || record.source?.datasetId !== CUA_VERIFIER_BENCH_PIN.id
      || record.source?.revision !== CUA_VERIFIER_BENCH_PIN.revision
      || !HASH.test(record.roots?.taskRoot ?? "")
      || !HASH.test(record.roots?.siteDomainRoot ?? "")
      || record.labels?.sourceNativeHumanLabelsOnly !== true
      || record.labels?.verifierOutputsUsedAsFeature !== false
      || record.labels?.verifierOutputsUsedAsLabel !== false
      || record.privacy?.rawContentIncluded !== false
      || record.privacy?.screenshotBytesOrUrlsIncluded !== false
      || !same(record.useBoundary, boundary())) {
      fail("CUA_VERIFIER_BENCH_RECORD_SEMANTICS_INVALID");
    }
    return { ok: true, recordHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyCuaVerifierBenchSourceReplay(bundle, input) {
  try {
    if (!plain(bundle) || !plain(bundle.manifest)
      || typeof bundle.manifest.generatedAt !== "string") {
      fail("CUA_VERIFIER_BENCH_BUNDLE_INVALID");
    }
    const replayed = normalizeCuaVerifierBenchSource({ ...input,
      generatedAt: bundle.manifest.generatedAt });
    if (!same(bundle, replayed)) fail("CUA_VERIFIER_BENCH_SOURCE_REPLAY_MISMATCH");
    if (replayed.episodes.some((episode) => !verifyCuaVerifierBenchEpisode(episode).ok)) {
      fail("CUA_VERIFIER_BENCH_EPISODE_REPLAY_INVALID");
    }
    return { ok: true, status: replayed.verification.status,
      records: replayed.episodes.length,
      manifestHash: replayed.manifest.manifestHash,
      recordSetHash: replayed.summary.recordSetHash,
      summaryHash: replayed.summary.summaryHash,
      verificationHash: replayed.verification.verificationHash };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

function roundMetric(value) {
  if (value === null) return null;
  const rounded = Math.round((value + Number.EPSILON) * 1e12) / 1e12;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function trainingFeatureVector(record) {
  const counts = record.episode?.actionKindCounts;
  if (!plain(counts) || Object.keys(counts).sort().join("\0")
    !== [...CUA_VERIFIER_BENCH_ACTION_KINDS].sort().join("\0")) {
    fail("CUA_VERIFIER_BENCH_TRAINING_ACTION_COUNTS_INVALID");
  }
  const raw = [record.timing?.durationMs, Number(record.episode?.aborted),
    record.episode?.nScreenshots, record.episode?.stepCount,
    ...CUA_VERIFIER_BENCH_ACTION_KINDS.map((kind) => counts[kind])];
  if (!raw.every((value) => Number.isSafeInteger(value) && value >= 0)) {
    fail("CUA_VERIFIER_BENCH_TRAINING_FEATURE_INVALID");
  }
  return raw.map((value, index) => index === 1 ? value : Math.log1p(value));
}

function trainingTargetLabel(record, target) {
  const value = target === "BLIND_HUMAN_NEGATIVE_OUTCOME_FOLLOW_UP_PRIORITY"
    ? record.labels?.blindHumanOutcomeMajority
    : target === "BLIND_HUMAN_NEGATIVE_PROCESS_FOLLOW_UP_PRIORITY"
      ? record.labels?.blindHumanProcessMajority : undefined;
  return typeof value === "boolean" ? Number(value === false) : null;
}

function requireTrainingBundle(bundle) {
  if (!plain(bundle) || !plain(bundle.manifest) || !plain(bundle.summary)
    || !plain(bundle.verification) || !Array.isArray(bundle.episodes)
    || bundle.manifest.schema !== CUA_VERIFIER_BENCH_SCHEMAS.manifest
    || bundle.summary.schema !== CUA_VERIFIER_BENCH_SCHEMAS.summary
    || bundle.verification.schema !== CUA_VERIFIER_BENCH_SCHEMAS.verification
    || bundle.verification.status !== "FULL_SELECTED_LOGICAL_SOURCE_REDERIVED"
    || bundle.episodes.length !== CUA_VERIFIER_BENCH_PIN.trajectories.totalRows) {
    fail("CUA_VERIFIER_BENCH_TRAINING_SOURCE_BUNDLE_INVALID");
  }
  for (const [value, schema, hashField] of [
    [bundle.manifest, CUA_VERIFIER_BENCH_SCHEMAS.manifest, "manifestHash"],
    [bundle.summary, CUA_VERIFIER_BENCH_SCHEMAS.summary, "summaryHash"],
    [bundle.verification, CUA_VERIFIER_BENCH_SCHEMAS.verification, "verificationHash"],
  ]) {
    const { [hashField]: hash, ...body } = value;
    if (!HASH.test(hash ?? "") || cuaVerifierBenchDigest(body, schema) !== hash) {
      fail("CUA_VERIFIER_BENCH_TRAINING_SOURCE_SEAL_INVALID", hashField);
    }
  }
  if (bundle.episodes.some((episode) => !verifyCuaVerifierBenchEpisode(episode).ok)) {
    fail("CUA_VERIFIER_BENCH_TRAINING_EPISODE_INVALID");
  }
  const recordSetHash = cuaVerifierBenchDigest(bundle.episodes
    .map((episode) => episode.recordHash).sort(),
  "outsider/cua-verifier-bench/record-set/v1");
  if (recordSetHash !== bundle.summary.recordSetHash
    || bundle.summary.manifestHash !== bundle.manifest.manifestHash
    || bundle.verification.manifestHash !== bundle.manifest.manifestHash
    || bundle.verification.recordSetHash !== recordSetHash
    || bundle.verification.summaryHash !== bundle.summary.summaryHash) {
    fail("CUA_VERIFIER_BENCH_TRAINING_SOURCE_LINK_INVALID");
  }
}

function splitBySiteDomain(episodes) {
  const roots = [...new Set(episodes.map((episode) => episode.roots.siteDomainRoot))];
  const ranked = roots.map((root) => ({ root,
    rank: cuaVerifierBenchDigest(`${CUA_VERIFIER_BENCH_TRAINING_BUDGET.splitSeed}\0${root}`,
      "outsider/cua-verifier-bench/site-domain-holdout-rank/v1") }))
    .sort((left, right) => left.rank.localeCompare(right.rank)
      || left.root.localeCompare(right.root));
  const holdoutGroupCount = Math.max(1,
    Math.ceil(ranked.length * CUA_VERIFIER_BENCH_TRAINING_BUDGET.holdoutFraction));
  const holdoutRoots = new Set(ranked.slice(0, holdoutGroupCount).map((item) => item.root));
  const trainRoots = new Set(ranked.slice(holdoutGroupCount).map((item) => item.root));
  return {
    train: episodes.filter((episode) => trainRoots.has(episode.roots.siteDomainRoot)),
    holdout: episodes.filter((episode) => holdoutRoots.has(episode.roots.siteDomainRoot)),
    trainGroups: trainRoots.size,
    holdoutGroups: holdoutRoots.size,
    totalGroups: roots.length,
    groupOverlap: [...trainRoots].filter((root) => holdoutRoots.has(root)).length,
    groupSetHash: cuaVerifierBenchDigest({ train: [...trainRoots].sort(),
      holdout: [...holdoutRoots].sort() },
    "outsider/cua-verifier-bench/site-domain-group-split/v1"),
  };
}

function rowsForTarget(records, target) {
  return records.map((record) => ({ record,
    x: trainingFeatureVector(record), label: trainingTargetLabel(record, target) }))
    .filter((row) => row.label !== null);
}

function classCounts(rows) {
  const positive = rows.filter((row) => row.label === 1).length;
  return { rows: rows.length, positive, negative: rows.length - positive };
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function standardization(rows) {
  const means = CUA_VERIFIER_BENCH_TRAINING_FEATURES.map((_, feature) =>
    rows.reduce((sum, row) => sum + row.x[feature], 0) / rows.length);
  const scales = means.map((mean, feature) => {
    const variance = rows.reduce((sum, row) => sum + (row.x[feature] - mean) ** 2, 0)
      / rows.length;
    const scale = Math.sqrt(variance);
    return scale > 1e-12 ? scale : 1;
  });
  return { means, scales };
}

function fitOptimizedModel(rows) {
  const standardized = standardization(rows);
  const weights = CUA_VERIFIER_BENCH_TRAINING_FEATURES.map(() => 0);
  const prevalence = rows.reduce((sum, row) => sum + row.label, 0) / rows.length;
  let intercept = Math.log(Math.max(1e-6, Math.min(1 - 1e-6, prevalence))
    / Math.max(1e-6, 1 - prevalence));
  for (let epoch = 0; epoch < CUA_VERIFIER_BENCH_TRAINING_BUDGET.epochs; epoch += 1) {
    const weightGradients = weights.map(() => 0);
    let interceptGradient = 0;
    for (const row of rows) {
      const vector = row.x.map((value, index) =>
        (value - standardized.means[index]) / standardized.scales[index]);
      const prediction = sigmoid(intercept + vector.reduce((sum, value, index) =>
        sum + value * weights[index], 0));
      const error = prediction - row.label;
      interceptGradient += error;
      for (let index = 0; index < weights.length; index += 1) {
        weightGradients[index] += error * vector[index];
      }
    }
    const rate = CUA_VERIFIER_BENCH_TRAINING_BUDGET.learningRate
      / (1 + CUA_VERIFIER_BENCH_TRAINING_BUDGET.learningRateDecay * epoch);
    intercept -= rate * interceptGradient / rows.length;
    for (let index = 0; index < weights.length; index += 1) {
      const gradient = weightGradients[index] / rows.length
        + CUA_VERIFIER_BENCH_TRAINING_BUDGET.l2 * weights[index];
      weights[index] -= rate * gradient;
    }
  }
  return {
    kind: "STANDARDIZED_LOG1P_LOGISTIC_REGRESSION",
    intercept: roundMetric(intercept),
    weights: Object.fromEntries(CUA_VERIFIER_BENCH_TRAINING_FEATURES
      .map((name, index) => [name, roundMetric(weights[index])])),
    standardization: {
      means: Object.fromEntries(CUA_VERIFIER_BENCH_TRAINING_FEATURES
        .map((name, index) => [name, roundMetric(standardized.means[index])])),
      scales: Object.fromEntries(CUA_VERIFIER_BENCH_TRAINING_FEATURES
        .map((name, index) => [name, roundMetric(standardized.scales[index])])),
      derivedFromTrainOnly: true,
    },
    budget: {
      epochs: CUA_VERIFIER_BENCH_TRAINING_BUDGET.epochs,
      learningRate: CUA_VERIFIER_BENCH_TRAINING_BUDGET.learningRate,
      learningRateDecay: CUA_VERIFIER_BENCH_TRAINING_BUDGET.learningRateDecay,
      l2: CUA_VERIFIER_BENCH_TRAINING_BUDGET.l2,
    },
  };
}

function predictOptimized(model, vector) {
  const score = model.intercept + CUA_VERIFIER_BENCH_TRAINING_FEATURES
    .reduce((sum, name, index) => sum + model.weights[name]
      * ((vector[index] - model.standardization.means[name])
        / model.standardization.scales[name]), 0);
  return sigmoid(score);
}

function metrics(rows, predict) {
  if (rows.length === 0) return null;
  const scored = rows.map((row) => ({ label: row.label,
    probability: Math.max(1e-12, Math.min(1 - 1e-12, predict(row.x))) }));
  const positive = scored.filter((row) => row.label === 1);
  const negative = scored.filter((row) => row.label === 0);
  let pairScore = 0;
  for (const yes of positive) for (const no of negative) {
    pairScore += yes.probability > no.probability ? 1
      : yes.probability === no.probability ? 0.5 : 0;
  }
  const threshold = CUA_VERIFIER_BENCH_TRAINING_BUDGET.threshold;
  const confusion = { truePositive: 0, falsePositive: 0, trueNegative: 0,
    falseNegative: 0 };
  for (const row of scored) {
    const predicted = Number(row.probability >= threshold);
    if (row.label === 1 && predicted === 1) confusion.truePositive += 1;
    else if (row.label === 0 && predicted === 1) confusion.falsePositive += 1;
    else if (row.label === 0) confusion.trueNegative += 1;
    else confusion.falseNegative += 1;
  }
  const sensitivity = positive.length === 0 ? null
    : confusion.truePositive / positive.length;
  const specificity = negative.length === 0 ? null
    : confusion.trueNegative / negative.length;
  return {
    rows: rows.length,
    positives: positive.length,
    negatives: negative.length,
    brier: roundMetric(scored.reduce((sum, row) =>
      sum + (row.probability - row.label) ** 2, 0) / scored.length),
    logLoss: roundMetric(-scored.reduce((sum, row) => sum + (row.label === 1
      ? Math.log(row.probability) : Math.log(1 - row.probability)), 0) / scored.length),
    auc: positive.length === 0 || negative.length === 0 ? null
      : roundMetric(pairScore / (positive.length * negative.length)),
    balancedAccuracy: sensitivity === null || specificity === null ? null
      : roundMetric((sensitivity + specificity) / 2),
    threshold,
    confusion,
  };
}

function promotion(baseline, optimized) {
  const policy = CUA_VERIFIER_BENCH_TRAINING_BUDGET.promotion;
  const reasons = [];
  if (optimized === null || baseline === null) reasons.push("HOLDOUT_METRICS_UNAVAILABLE");
  else {
    if (optimized.rows < policy.minimumHoldoutRows) reasons.push("HOLDOUT_ROWS_BELOW_MINIMUM");
    if (optimized.positives < policy.minimumPositiveRows) {
      reasons.push("HOLDOUT_POSITIVE_ROWS_BELOW_MINIMUM");
    }
    if (optimized.negatives < policy.minimumNegativeRows) {
      reasons.push("HOLDOUT_NEGATIVE_ROWS_BELOW_MINIMUM");
    }
    if (baseline.brier - optimized.brier < policy.minimumBrierImprovement) {
      reasons.push("BRIER_IMPROVEMENT_BELOW_MINIMUM");
    }
    if (baseline.logLoss - optimized.logLoss < policy.minimumLogLossImprovement) {
      reasons.push("LOG_LOSS_IMPROVEMENT_BELOW_MINIMUM");
    }
    if (baseline.auc === null || optimized.auc === null
      || optimized.auc - baseline.auc < policy.minimumAucImprovement) {
      reasons.push("AUC_IMPROVEMENT_BELOW_MINIMUM");
    }
    if (baseline.balancedAccuracy === null || optimized.balancedAccuracy === null
      || optimized.balancedAccuracy - baseline.balancedAccuracy
        < policy.minimumBalancedAccuracyImprovement) {
      reasons.push("BALANCED_ACCURACY_DEGRADED");
    }
  }
  return { decision: reasons.length === 0 ? "PROMOTE_OPTIMIZED" : "KEEP_BASELINE",
    reasons };
}

function trainTarget(target, split, rawSourceReplayBound) {
  const trainRows = rowsForTarget(split.train, target);
  const holdoutRows = rowsForTarget(split.holdout, target);
  const trainCounts = classCounts(trainRows);
  const holdoutCounts = classCounts(holdoutRows);
  if (trainRows.length < 2 || trainCounts.positive === 0 || trainCounts.negative === 0) {
    const body = {
      target,
      positiveClassMeaning: "blind-human majority label is negative; prioritize human follow-up",
      status: "ABSTAIN_TRAIN_CLASS_COVERAGE_INSUFFICIENT",
      sampleAccounting: { train: trainCounts, holdout: holdoutCounts },
      baseline: null,
      optimized: null,
      selection: {
        decision: rawSourceReplayBound ? "KEEP_BASELINE" : "REFERENCE_ONLY_NO_PROMOTION",
        referenceMetricGateDecision: "KEEP_BASELINE",
        reasons: rawSourceReplayBound ? ["TRAIN_CLASS_COVERAGE_INSUFFICIENT"]
          : ["RAW_SOURCE_REPLAY_REQUIRED", "TRAIN_CLASS_COVERAGE_INSUFFICIENT"],
        selectedModelHash: null,
        promotionScope: rawSourceReplayBound
          ? "OFFLINE_RESEARCH_CANDIDATE_ONLY" : "NONE_REFERENCE_ONLY",
        productionPromotionAuthorized: false,
      },
    };
    return seal(body, "outsider/cua-verifier-bench/training-assessment/v1",
      "assessmentHash");
  }
  const prior = roundMetric((trainCounts.positive + 1) / (trainRows.length + 2));
  const baselineModel = { kind: "LAPLACE_SMOOTHED_TRAIN_PRIOR", probability: prior };
  const optimizedModel = fitOptimizedModel(trainRows);
  const baseline = { model: baselineModel,
    modelHash: cuaVerifierBenchDigest(baselineModel,
      "outsider/cua-verifier-bench/trained-model/v1"),
    trainMetrics: metrics(trainRows, () => prior),
    holdoutMetrics: metrics(holdoutRows, () => prior) };
  const optimized = { model: optimizedModel,
    modelHash: cuaVerifierBenchDigest(optimizedModel,
      "outsider/cua-verifier-bench/trained-model/v1"),
    trainMetrics: metrics(trainRows, (vector) => predictOptimized(optimizedModel, vector)),
    holdoutMetrics: metrics(holdoutRows,
      (vector) => predictOptimized(optimizedModel, vector)) };
  const metricGate = promotion(baseline.holdoutMetrics, optimized.holdoutMetrics);
  const decision = rawSourceReplayBound
    ? metricGate.decision : "REFERENCE_ONLY_NO_PROMOTION";
  const selectedModelHash = decision === "PROMOTE_OPTIMIZED"
    ? optimized.modelHash : baseline.modelHash;
  const body = {
    target,
    positiveClassMeaning: "blind-human majority label is negative; prioritize human follow-up",
    status: "TRAINED_AND_FROZEN_GROUP_HOLDOUT_EVALUATED",
    sampleAccounting: { train: trainCounts, holdout: holdoutCounts,
      tiesOrMissingExcluded: CUA_VERIFIER_BENCH_PIN.trajectories.totalRows
        - trainRows.length - holdoutRows.length },
    baseline,
    optimized,
    selection: {
      decision,
      referenceMetricGateDecision: metricGate.decision,
      reasons: rawSourceReplayBound ? metricGate.reasons
        : ["RAW_SOURCE_REPLAY_REQUIRED", ...metricGate.reasons],
      selectedModelHash,
      promotionScope: rawSourceReplayBound
        ? "OFFLINE_RESEARCH_CANDIDATE_ONLY" : "NONE_REFERENCE_ONLY",
      productionPromotionAuthorized: false,
    },
  };
  return seal(body, "outsider/cua-verifier-bench/training-assessment/v1",
    "assessmentHash");
}

function trainingBoundary(rawSourceReplayBound) {
  return {
    explicitOfflineResearchTrainingExecuted: true,
    rawSourceReplayBound,
    automaticTraining: false,
    modelDeploymentAuthorized: false,
    automaticAuthorityExpansion: false,
    authority: "none",
    causalExperienceUnits: 0,
    economicLossEvidenceUnits: 0,
    disposition: "HOLD",
  };
}

function buildTrainingArtifacts(bundle, { rawSourceReplayBound }) {
  requireTrainingBundle(bundle);
  const split = splitBySiteDomain(bundle.episodes);
  if (split.groupOverlap !== 0 || split.totalGroups < 2) {
    fail("CUA_VERIFIER_BENCH_TRAINING_GROUP_SPLIT_INVALID");
  }
  const targets = ["BLIND_HUMAN_NEGATIVE_OUTCOME_FOLLOW_UP_PRIORITY",
    "BLIND_HUMAN_NEGATIVE_PROCESS_FOLLOW_UP_PRIORITY"];
  const assessments = targets.map((target) =>
    trainTarget(target, split, rawSourceReplayBound));
  const modelSetHash = cuaVerifierBenchDigest(assessments.map((assessment) => ({
    target: assessment.target,
    baseline: assessment.baseline?.modelHash ?? null,
    optimized: assessment.optimized?.modelHash ?? null,
    selected: assessment.selection.selectedModelHash ?? null,
  })), "outsider/cua-verifier-bench/trained-model-set/v1");
  const reportBody = {
    schema: CUA_VERIFIER_BENCH_SCHEMAS.trainingReport,
    schemaVersion: "2.0.0",
    sourceBinding: rawSourceReplayBound ? {
      status: "RAW_SOURCE_AND_MANIFEST_REPLAY_BOUND",
      datasetId: CUA_VERIFIER_BENCH_PIN.id,
      revision: CUA_VERIFIER_BENCH_PIN.revision,
      manifestHash: bundle.manifest.manifestHash,
      recordSetHash: bundle.summary.recordSetHash,
      summaryHash: bundle.summary.summaryHash,
      fullSourceVerificationHash: bundle.verification.verificationHash,
      sourceReplayStatus: bundle.verification.status,
      rawSourceObjectsReplayed: bundle.verification.sourceObjectsVerified,
      callerBundleAcceptedWithoutRawReplay: false,
    } : {
      status: "CALLER_BUNDLE_REFERENCE_HASH_ONLY",
      datasetId: CUA_VERIFIER_BENCH_PIN.id,
      revision: CUA_VERIFIER_BENCH_PIN.revision,
      claimedManifestHash: bundle.manifest.manifestHash,
      claimedRecordSetHash: bundle.summary.recordSetHash,
      claimedSummaryHash: bundle.summary.summaryHash,
      claimedVerificationHash: bundle.verification.verificationHash,
      fullSourceVerificationHash: null,
      rawSourceObjectsReplayed: 0,
      trustedSourceClaimed: false,
      trustedSelectionPermitted: false,
    },
    objective: "PRIORITIZE_HUMAN_FOLLOW_UP_FOR_BLIND_HUMAN_NEGATIVE_PROCESS_OR_OUTCOME",
    featurePolicy: {
      included: CUA_VERIFIER_BENCH_TRAINING_FEATURES,
      transforms: "LOG1P_FOR_NONNEGATIVE_COUNTS_AND_DURATION; ABORTED_BINARY_UNCHANGED; TRAIN_ONLY_STANDARDIZATION",
      labelsUsedAsFeatures: false,
      verifierOutputsUsedAsFeaturesOrLabels: false,
      freeTextUrlsCoordinatesImagesUsed: false,
    },
    split: {
      kind: "FIXED_LABEL_AND_FEATURE_BLIND_SITE_DOMAIN_GROUP_HOLDOUT",
      seed: CUA_VERIFIER_BENCH_TRAINING_BUDGET.splitSeed,
      holdoutFraction: CUA_VERIFIER_BENCH_TRAINING_BUDGET.holdoutFraction,
      totalGroups: split.totalGroups,
      trainGroups: split.trainGroups,
      holdoutGroups: split.holdoutGroups,
      trainEpisodesBeforeLabelFiltering: split.train.length,
      holdoutEpisodesBeforeLabelFiltering: split.holdout.length,
      groupOverlap: split.groupOverlap,
      groupSetHash: split.groupSetHash,
    },
    fixedBudget: CUA_VERIFIER_BENCH_TRAINING_BUDGET,
    assessments,
    modelSetHash,
    boundary: trainingBoundary(rawSourceReplayBound),
  };
  const report = seal(reportBody, CUA_VERIFIER_BENCH_SCHEMAS.trainingReport, "reportHash");
  const receiptBody = {
    schema: CUA_VERIFIER_BENCH_SCHEMAS.trainingReceipt,
    schemaVersion: "2.0.0",
    executionMode: rawSourceReplayBound
      ? "RAW_SOURCE_REPLAY_BOUND_OFFLINE_TRAINING_AND_FROZEN_HOLDOUT_EVALUATION"
      : "CALLER_BUNDLE_REFERENCE_FIT_ONLY_NO_TRUSTED_SELECTION",
    sourceTrust: rawSourceReplayBound ? "RAW_SOURCE_AND_MANIFEST_REPLAY_BOUND"
      : "REFERENCE_HASH_ONLY",
    fullSourceVerificationHash: rawSourceReplayBound
      ? bundle.verification.verificationHash : null,
    reportHash: report.reportHash,
    modelSetHash,
    decisions: Object.fromEntries(assessments.map((assessment) => [assessment.target,
      assessment.selection.decision])),
    productionPromotionAuthorized: false,
    boundary: trainingBoundary(rawSourceReplayBound),
  };
  const receipt = seal(receiptBody, CUA_VERIFIER_BENCH_SCHEMAS.trainingReceipt,
    "receiptHash");
  return deepFreeze({ report, receipt });
}

export function buildCuaVerifierBenchTrainingArtifacts(bundle) {
  return buildTrainingArtifacts(bundle, { rawSourceReplayBound: false });
}

function rederiveTrainingSource(input, expectedManifest) {
  if (!plain(expectedManifest)
    || expectedManifest.schema !== CUA_VERIFIER_BENCH_SCHEMAS.manifest
    || typeof expectedManifest.generatedAt !== "string") {
    fail("CUA_VERIFIER_BENCH_TRAINING_EXPECTED_MANIFEST_REQUIRED");
  }
  const bundle = normalizeCuaVerifierBenchSource({ ...input,
    generatedAt: expectedManifest.generatedAt });
  if (!same(bundle.manifest, expectedManifest)) {
    fail("CUA_VERIFIER_BENCH_TRAINING_RAW_SOURCE_MANIFEST_MISMATCH");
  }
  return bundle;
}

export function buildCuaVerifierBenchTrainingArtifactsFromSource(input,
  expectedManifest) {
  const bundle = rederiveTrainingSource(input, expectedManifest);
  return buildTrainingArtifacts(bundle, { rawSourceReplayBound: true });
}

export function verifyCuaVerifierBenchTrainingArtifacts(artifacts, bundle) {
  try {
    if (!plain(artifacts) || !plain(artifacts.report) || !plain(artifacts.receipt)) {
      fail("CUA_VERIFIER_BENCH_TRAINING_ARTIFACTS_INVALID");
    }
    const replayed = buildCuaVerifierBenchTrainingArtifacts(bundle);
    const referenceHashMatch = same(artifacts, replayed);
    return { ok: false, status: "REFERENCE_HASH_ONLY_RAW_SOURCE_REPLAY_REQUIRED",
      error: "CUA_VERIFIER_BENCH_TRAINING_RAW_SOURCE_REPLAY_REQUIRED",
      referenceHashMatch,
      trustedSourceClaimed: false,
      productionPromotionAuthorized: false,
      reportHash: referenceHashMatch ? replayed.report.reportHash : null };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function verifyCuaVerifierBenchTrainingArtifactsFromSource(artifacts, input,
  expectedManifest) {
  try {
    if (!plain(artifacts) || !plain(artifacts.report) || !plain(artifacts.receipt)) {
      fail("CUA_VERIFIER_BENCH_TRAINING_ARTIFACTS_INVALID");
    }
    const replayed = buildCuaVerifierBenchTrainingArtifactsFromSource(input,
      expectedManifest);
    if (!same(artifacts, replayed)) {
      fail("CUA_VERIFIER_BENCH_TRAINING_RAW_SOURCE_REPLAY_MISMATCH");
    }
    return { ok: true, status: "RAW_SOURCE_AND_MANIFEST_REPLAY_BOUND",
      reportHash: replayed.report.reportHash,
      modelSetHash: replayed.report.modelSetHash,
      receiptHash: replayed.receipt.receiptHash,
      decisions: replayed.receipt.decisions,
      productionPromotionAuthorized: false };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error),
      productionPromotionAuthorized: false };
  }
}
