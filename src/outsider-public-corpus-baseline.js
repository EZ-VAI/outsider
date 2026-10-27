/*
 * Deterministic, dependency-free descriptive baselines for normalized public
 * agent corpora.  The local logistic fit is evaluation-only: it consumes three
 * allowlisted structural count features and can never become causal, financial, automatic
 * training, or deployment evidence.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalizeStrict } from "./canonical.js";
import {
  PUBLIC_AGENT_PINS, PUBLIC_AGENT_SCHEMAS, verifyPublicAgentRecord,
} from "./outsider-public-agent-corpus.js";
import { verifyPublicAgentArtifactsAgainstSource } from
  "./outsider-public-agent-artifacts.js";

export const PUBLIC_CORPUS_BASELINE_SCHEMA = "outsider/public-corpus-baseline-report/v2";
export const PUBLIC_CORPUS_BASELINE_FEATURES = Object.freeze([
  "stepCount", "toolCallCount", "toolResultCount",
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const SPLIT_FRACTION = 0.2;
const MINIMUMS = Object.freeze({
  totalRecords: 20,
  correlationGroups: 5,
  trainGroups: 4,
  holdoutGroups: 2,
  trainRecords: 12,
  holdoutRecords: 4,
});
const TRAINING = Object.freeze({
  algorithm: "DETERMINISTIC_FULL_BATCH_LOGISTIC_REGRESSION",
  epochs: 500,
  learningRate: 0.08,
  learningRateDecay: 0.01,
  l2: 0.01,
  predictionThreshold: 0.5,
});
const SPLIT_SEED = "outsider/public-corpus-baseline/group-holdout/v1";
const BASELINE_FILE_HASH = `sha256:${createHash("sha256")
  .update(readFileSync(new URL(import.meta.url))).digest("hex")}`;
const ARTIFACT_VERIFIER_FILE_HASH = `sha256:${createHash("sha256")
  .update(readFileSync(new URL("./outsider-public-agent-artifacts.js", import.meta.url)))
  .digest("hex")}`;
const CORPUS_ADAPTER_FILE_HASH = `sha256:${createHash("sha256")
  .update(readFileSync(new URL("./outsider-public-agent-corpus.js", import.meta.url)))
  .digest("hex")}`;
const CANONICALIZER_FILE_HASH = `sha256:${createHash("sha256")
  .update(readFileSync(new URL("./canonical.js", import.meta.url))).digest("hex")}`;
const SOURCE_VERIFIER_IMPLEMENTATION_HASH = `sha256:${createHash("sha256")
  .update("outsider/public-agent-source-verifier-bundle/v1\0")
  .update(canonicalizeStrict({ artifactVerifier: ARTIFACT_VERIFIER_FILE_HASH,
    corpusAdapter: CORPUS_ADAPTER_FILE_HASH, canonicalizer: CANONICALIZER_FILE_HASH }))
  .digest("hex")}`;
const BASELINE_IMPLEMENTATION_HASH = `sha256:${createHash("sha256")
  .update("outsider/public-corpus-baseline-implementation-bundle/v2\0")
  .update(canonicalizeStrict({ baseline: BASELINE_FILE_HASH,
    sourceVerifierBundle: SOURCE_VERIFIER_IMPLEMENTATION_HASH }))
  .digest("hex")}`;

const SOURCE_CONFIGS = Object.freeze([
  Object.freeze({
    pin: PUBLIC_AGENT_PINS.computerAgentArena,
    target: "CAA_TASK_CORRECTNESS",
    nativeOutcomeKind: "human-evaluated-task-correctness",
    positiveClassMeaning: "human-evaluated task correctness is true",
    groupingBasis: "CONNECTED_COMPONENT_TASK_INSTRUCTION_USER_SESSION_ROOTS",
    correlationFields: Object.freeze(["taskRoot", "instructionRoot", "userRoot", "sessionRoot"]),
    systematicFieldsNotPartitioned: Object.freeze(["modelRoot", "setupRoot"]),
  }),
  Object.freeze({
    pin: PUBLIC_AGENT_PINS.openhandsFeedback,
    target: "OPENHANDS_USER_DISSATISFACTION",
    nativeOutcomeKind: "user-feedback-preference",
    positiveClassMeaning: "native feedback value is negative",
    groupingBasis: "CONNECTED_COMPONENT_COLLECTOR_ROOT",
    correlationFields: Object.freeze(["userRoot"]),
    systematicFieldsNotPartitioned: Object.freeze([]),
  }),
  Object.freeze({
    pin: PUBLIC_AGENT_PINS.nebiusOpenHands,
    target: "NEBIUS_BENCHMARK_RESOLVED",
    nativeOutcomeKind: "benchmark-resolved",
    positiveClassMeaning: "benchmark resolved value is true",
    groupingBasis: "CONNECTED_COMPONENT_REPOSITORY_TASK_ROOTS",
    correlationFields: Object.freeze(["repositoryRoot", "taskRoot"]),
    systematicFieldsNotPartitioned: Object.freeze([]),
  }),
]);

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(value, domain = "outsider/public-corpus-baseline/v1") {
  return `sha256:${createHash("sha256").update(`${domain}\0${canonicalizeStrict(value)}`)
    .digest("hex")}`;
}

function round(value) {
  if (value === null) return null;
  const output = Math.round((value + Number.EPSILON) * 1e12) / 1e12;
  return Object.is(output, -0) ? 0 : output;
}

function evidenceBoundary() {
  return {
    authority: "none",
    causalExperienceUnits: 0,
    lossEvidenceUnits: 0,
    economicLossObserved: false,
    establishesLossOrLiability: false,
    automaticTraining: false,
    automaticTrainingPromotion: false,
    modelDeploymentAuthorized: false,
  };
}

function untrustedSourceBinding() {
  return {
    trustClass: "SELF_ASSERTED_UNTRUSTED",
    derivation: "CALLER_SUPPLIED_NORMALIZED_RECORDS",
    fullSourceVerificationHash: null,
    manifestHash: null,
    recordSetHash: null,
    summaryHash: null,
    verifiedSourceObjectSetHash: null,
    sourceScopeHash: null,
    sourceScope: null,
    sourceRecordCount: null,
    sourceVerifierImplementationHash: SOURCE_VERIFIER_IMPLEMENTATION_HASH,
  };
}

function trustedSourceBinding(attestation) {
  return {
    trustClass: "FULL_SOURCE_REPLAY_BOUND",
    derivation: "FULL_SOURCE_REDERIVED",
    fullSourceVerificationHash: attestation.verificationHash,
    manifestHash: attestation.manifestHash,
    recordSetHash: attestation.recordSetHash,
    summaryHash: attestation.summaryHash,
    verifiedSourceObjectSetHash: digest(attestation.verifiedSourceObjectHashes,
      "outsider/public-corpus-baseline/verified-source-object-set/v1"),
    sourceScopeHash: digest(attestation.scope,
      "outsider/public-corpus-baseline/source-scope/v1"),
    sourceScope: structuredClone(attestation.scope),
    sourceRecordCount: attestation.records,
    sourceVerifierImplementationHash: SOURCE_VERIFIER_IMPLEMENTATION_HASH,
  };
}

function configFor(id) {
  return SOURCE_CONFIGS.find((config) => config.pin.id === id) ?? null;
}

function exactPinnedDataset(record, config) {
  const dataset = record.dataset;
  return dataset?.id === config.pin.id
    && dataset.revision === config.pin.revision
    && dataset.licenseId === config.pin.licenseId
    && dataset.sourceClass === config.pin.sourceClass
    && HASH.test(dataset.sourceObjectHash ?? "");
}

function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000;
}

function featureVector(record) {
  const vector = PUBLIC_CORPUS_BASELINE_FEATURES.map((name) => record.episode?.[name]);
  if (!vector.every(validCount)) fail("PUBLIC_CORPUS_BASELINE_FEATURE_INVALID");
  return vector;
}

function binaryLabel(record, config) {
  const labels = record.labels;
  if (labels?.nativeOutcomeKind !== config.nativeOutcomeKind
    || labels.economicLossObserved !== false || labels.lossMinorUnits !== null
    || labels.currency !== null || labels.independentAdjudication !== false) {
    fail("PUBLIC_CORPUS_BASELINE_LABEL_SEMANTICS_INVALID");
  }
  if (config.target === "OPENHANDS_USER_DISSATISFACTION") {
    if (labels.preferenceOnly !== true || labels.benchmarkResolvedOnly !== false) {
      fail("PUBLIC_CORPUS_BASELINE_LABEL_SEMANTICS_INVALID");
    }
    if (labels.nativeOutcomeValue === "negative") return 1;
    if (labels.nativeOutcomeValue === "positive") return 0;
    return null;
  }
  if (labels.preferenceOnly !== false) fail("PUBLIC_CORPUS_BASELINE_LABEL_SEMANTICS_INVALID");
  if (config.target === "NEBIUS_BENCHMARK_RESOLVED"
    && labels.benchmarkResolvedOnly !== true) {
    fail("PUBLIC_CORPUS_BASELINE_LABEL_SEMANTICS_INVALID");
  }
  if (config.target === "CAA_TASK_CORRECTNESS"
    && labels.benchmarkResolvedOnly !== false) {
    fail("PUBLIC_CORPUS_BASELINE_LABEL_SEMANTICS_INVALID");
  }
  return typeof labels.nativeOutcomeValue === "boolean"
    ? Number(labels.nativeOutcomeValue) : null;
}

function correlationKeys(record, config) {
  const roots = record.roots;
  if (!HASH.test(roots?.episodeRoot ?? "")) fail("PUBLIC_CORPUS_BASELINE_EPISODE_ROOT_INVALID");
  const keys = config.correlationFields.map((field) => roots[field]).filter((value) => value !== null);
  if (keys.length === 0 || keys.some((value) => !HASH.test(value ?? "")
    || !roots.correlationRoots?.includes(value))) {
    fail("PUBLIC_CORPUS_BASELINE_CORRELATION_ROOT_INVALID");
  }
  if (config.target === "CAA_TASK_CORRECTNESS" && !HASH.test(roots.taskRoot ?? "")) {
    fail("PUBLIC_CORPUS_BASELINE_TASK_ROOT_INVALID");
  }
  if (config.target === "NEBIUS_BENCHMARK_RESOLVED"
    && (!HASH.test(roots.repositoryRoot ?? "") || !HASH.test(roots.taskRoot ?? ""))) {
    fail("PUBLIC_CORPUS_BASELINE_REPOSITORY_TASK_ROOT_INVALID");
  }
  return [...new Set(keys)].sort();
}

function recordIdentity(record) {
  if (!HASH.test(record?.episode?.nativeIdHash ?? "")) {
    fail("PUBLIC_CORPUS_BASELINE_NATIVE_ID_INVALID");
  }
  return `${record.dataset.id}\0${record.episode.nativeIdHash}`;
}

function safeCandidateHash(value) {
  try { return digest(value, "outsider/public-corpus-baseline/refused-candidate/v1"); }
  catch { return digest(String(value), "outsider/public-corpus-baseline/refused-candidate/v1"); }
}

function countBy(values) {
  return Object.fromEntries([...new Set(values)].sort().map((value) =>
    [value, values.filter((candidate) => candidate === value).length]));
}

function prepare(records) {
  const reasonCounts = new Map();
  const refusedHashes = [];
  const eligible = [];
  const refuse = (record, reason) => {
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
    refusedHashes.push(safeCandidateHash(record));
  };
  for (const record of records) {
    const checked = verifyPublicAgentRecord(record);
    if (!checked.ok || record?.schema !== PUBLIC_AGENT_SCHEMAS.record) {
      refuse(record, "RECORD_SELF_VERIFICATION_FAILED");
      continue;
    }
    const config = configFor(record.dataset.id);
    if (!config) {
      refuse(record, "UNSUPPORTED_DATASET");
      continue;
    }
    try {
      if (!exactPinnedDataset(record, config)
        || record.privacy?.rawContentIncluded !== false
        || record.useBoundary?.automaticTraining !== false
        || record.useBoundary?.economicLossObserved !== false
        || record.useBoundary?.permits?.PRICE !== false
        || record.useBoundary?.permits?.GUARANTEE !== false
        || record.useBoundary?.permits?.SETTLE !== false) {
        fail("PUBLIC_CORPUS_BASELINE_RECORD_BOUNDARY_INVALID");
      }
      const label = binaryLabel(record, config);
      const features = featureVector(record);
      const correlationRootKeys = correlationKeys(record, config);
      const identity = recordIdentity(record);
      eligible.push({ record, config, label, features, correlationRootKeys, identity });
    } catch (error) {
      refuse(record, error instanceof Error ? error.message : String(error));
    }
  }

  const byIdentity = new Map();
  const conflicted = new Set();
  const conflictingRecordHashes = [];
  let exactDuplicatesCollapsed = 0;
  for (const item of eligible.sort((left, right) => left.record.recordHash
    .localeCompare(right.record.recordHash))) {
    if (conflicted.has(item.identity)) {
      conflictingRecordHashes.push(item.record.recordHash);
      continue;
    }
    const previous = byIdentity.get(item.identity);
    if (!previous) byIdentity.set(item.identity, item);
    else if (previous.record.recordHash === item.record.recordHash) exactDuplicatesCollapsed += 1;
    else {
      byIdentity.delete(item.identity);
      conflicted.add(item.identity);
      conflictingRecordHashes.push(previous.record.recordHash, item.record.recordHash);
    }
  }
  if (conflicted.size > 0) {
    reasonCounts.set("CONFLICTING_RECORD_IDENTITY",
      (reasonCounts.get("CONFLICTING_RECORD_IDENTITY") ?? 0) + conflicted.size);
  }
  return {
    items: [...byIdentity.values()].sort((left, right) => left.identity.localeCompare(right.identity)),
    accounting: {
      candidateRecords: records.length,
      acceptedUniqueRecords: byIdentity.size,
      exactDuplicatesCollapsed,
      conflictingIdentitiesExcluded: conflicted.size,
      conflictingRecordsExcluded: conflictingRecordHashes.length,
      conflictingRecordSetHash: digest(conflictingRecordHashes.sort(),
        "outsider/public-corpus-baseline/conflicting-record-set/v1"),
      refusedCandidates: refusedHashes.length,
      refusedByReason: Object.fromEntries([...reasonCounts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))),
      refusedCandidateSetHash: digest(refusedHashes.sort(),
        "outsider/public-corpus-baseline/refused-set/v1"),
    },
  };
}

function connectedRows(rows, config) {
  const parent = rows.map((_, index) => index);
  const find = (index) => parent[index] === index ? index
    : (parent[index] = find(parent[index]));
  const join = (left, right) => {
    const a = find(left), b = find(right);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  const firstByRoot = new Map();
  rows.forEach((row, index) => {
    for (const root of row.correlationRootKeys) {
      if (firstByRoot.has(root)) join(index, firstByRoot.get(root));
      else firstByRoot.set(root, index);
    }
  });
  rows.forEach((_, index) => find(index));
  const rootsByComponent = new Map();
  rows.forEach((row, index) => {
    const component = find(index);
    const roots = rootsByComponent.get(component) ?? new Set();
    row.correlationRootKeys.forEach((root) => roots.add(root));
    rootsByComponent.set(component, roots);
  });
  return rows.map((row, index) => ({ ...row,
    groupRoot: digest([...rootsByComponent.get(find(index))].sort(),
      `outsider/public-corpus-baseline/${config.target}/correlation-component/v1`) }));
}

function groupSplit(inputRows, config) {
  const rows = connectedRows(inputRows, config);
  const groups = new Map();
  for (const row of rows) {
    const bucket = groups.get(row.groupRoot) ?? [];
    bucket.push(row);
    groups.set(row.groupRoot, bucket);
  }
  const ranked = [...groups.keys()].map((root) => ({ root,
    rank: digest({ dataset: config.pin.id, root, seed: SPLIT_SEED },
      "outsider/public-corpus-baseline/split-rank/v1") }))
    .sort((left, right) => left.rank.localeCompare(right.rank));
  const holdoutGroupCount = ranked.length < 2 ? ranked.length
    : Math.max(1, Math.floor(ranked.length * SPLIT_FRACTION));
  const holdoutRoots = new Set(ranked.slice(0, holdoutGroupCount).map((item) => item.root));
  const train = [], holdout = [];
  for (const row of rows) (holdoutRoots.has(row.groupRoot) ? holdout : train).push(row);
  train.sort((left, right) => left.identity.localeCompare(right.identity));
  holdout.sort((left, right) => left.identity.localeCompare(right.identity));
  const trainRoots = [...new Set(train.map((row) => row.groupRoot))].sort();
  const holdoutRootList = [...holdoutRoots].sort();
  return {
    train, holdout,
    split: {
      method: "SHA256_RANKED_GROUP_HOLDOUT",
      holdoutFractionTarget: SPLIT_FRACTION,
      seedHash: digest(SPLIT_SEED, "outsider/public-corpus-baseline/split-seed/v1"),
      groupingBasis: config.groupingBasis,
      totalGroups: groups.size,
      trainGroups: trainRoots.length,
      holdoutGroups: holdoutRootList.length,
      groupOverlap: trainRoots.filter((root) => holdoutRoots.has(root)).length,
      trainGroupSetHash: digest(trainRoots,
        "outsider/public-corpus-baseline/train-group-set/v1"),
      holdoutGroupSetHash: digest(holdoutRootList,
        "outsider/public-corpus-baseline/holdout-group-set/v1"),
    },
  };
}

function classCounts(rows) {
  return {
    negative: rows.filter((row) => row.label === 0).length,
    positive: rows.filter((row) => row.label === 1).length,
  };
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function standardizer(matrix) {
  const dimensions = PUBLIC_CORPUS_BASELINE_FEATURES.length;
  const mean = new Array(dimensions).fill(0);
  const std = new Array(dimensions).fill(0);
  for (const row of matrix) row.forEach((value, index) => { mean[index] += value; });
  mean.forEach((_, index) => { mean[index] /= matrix.length; });
  for (const row of matrix) row.forEach((value, index) => {
    std[index] += (value - mean[index]) ** 2;
  });
  std.forEach((_, index) => { std[index] = Math.sqrt(std[index] / matrix.length) || 1; });
  return { mean, std };
}

function standardize(vector, fitted) {
  return vector.map((value, index) => (value - fitted.mean[index]) / fitted.std[index]);
}

function fitLogistic(rows) {
  const fitted = standardizer(rows.map((row) => row.features));
  const matrix = rows.map((row) => standardize(row.features, fitted));
  const labels = rows.map((row) => row.label);
  const weights = new Array(PUBLIC_CORPUS_BASELINE_FEATURES.length).fill(0);
  const positives = labels.reduce((sum, label) => sum + label, 0);
  let bias = Math.log((positives + 0.5) / (labels.length - positives + 0.5));
  for (let epoch = 0; epoch < TRAINING.epochs; epoch += 1) {
    const gradients = new Array(weights.length).fill(0);
    let biasGradient = 0;
    matrix.forEach((vector, index) => {
      let linear = bias;
      vector.forEach((value, dimension) => { linear += weights[dimension] * value; });
      const residual = sigmoid(linear) - labels[index];
      vector.forEach((value, dimension) => { gradients[dimension] += residual * value; });
      biasGradient += residual;
    });
    const step = TRAINING.learningRate / (1 + TRAINING.learningRateDecay * epoch);
    weights.forEach((weight, dimension) => {
      const gradient = gradients[dimension] / matrix.length + TRAINING.l2 * weight;
      weights[dimension] -= step * gradient;
    });
    bias -= step * biasGradient / matrix.length;
  }
  return { weights, bias, standardizer: fitted };
}

function predict(model, features) {
  const vector = standardize(features, model.standardizer);
  let linear = model.bias;
  vector.forEach((value, index) => { linear += model.weights[index] * value; });
  return sigmoid(linear);
}

function auc(scores, labels) {
  const positives = labels.filter(Boolean).length;
  const negatives = labels.length - positives;
  if (positives === 0 || negatives === 0) return null;
  const ranked = scores.map((score, index) => ({ score, label: labels[index] }))
    .sort((left, right) => left.score - right.score);
  let index = 0, rank = 1, positiveRankSum = 0;
  while (index < ranked.length) {
    let end = index + 1;
    while (end < ranked.length && ranked[end].score === ranked[index].score) end += 1;
    const averageRank = (rank + rank + end - index - 1) / 2;
    for (let item = index; item < end; item += 1) {
      if (ranked[item].label === 1) positiveRankSum += averageRank;
    }
    rank += end - index;
    index = end;
  }
  return (positiveRankSum - positives * (positives + 1) / 2) / (positives * negatives);
}

function metrics(rows, scores) {
  const labels = rows.map((row) => row.label);
  const confusion = { truePositive: 0, falsePositive: 0, trueNegative: 0, falseNegative: 0 };
  scores.forEach((score, index) => {
    const prediction = score >= TRAINING.predictionThreshold ? 1 : 0;
    const label = labels[index];
    if (label === 1 && prediction === 1) confusion.truePositive += 1;
    else if (label === 0 && prediction === 1) confusion.falsePositive += 1;
    else if (label === 0 && prediction === 0) confusion.trueNegative += 1;
    else confusion.falseNegative += 1;
  });
  const sensitivity = confusion.truePositive
    / (confusion.truePositive + confusion.falseNegative);
  const specificity = confusion.trueNegative
    / (confusion.trueNegative + confusion.falsePositive);
  return {
    auc: round(auc(scores, labels)),
    sampleBrier: round(scores.reduce((sum, score, index) =>
      sum + (score - labels[index]) ** 2, 0) / scores.length),
    balancedAccuracy: round((sensitivity + specificity) / 2),
    calibrationClaimed: false,
    threshold: TRAINING.predictionThreshold,
    confusion,
  };
}

function abstentionReason(rows, split) {
  if (rows.length < MINIMUMS.totalRecords) return "ABSTAIN_INSUFFICIENT_RECORDS";
  if (split.totalGroups < MINIMUMS.correlationGroups) {
    return "ABSTAIN_INSUFFICIENT_CORRELATION_GROUPS";
  }
  if (split.trainGroups < MINIMUMS.trainGroups) {
    return "ABSTAIN_INSUFFICIENT_TRAIN_GROUPS";
  }
  if (split.holdoutGroups < MINIMUMS.holdoutGroups) {
    return "ABSTAIN_INSUFFICIENT_HOLDOUT_GROUPS";
  }
  if (split.train.length < MINIMUMS.trainRecords) return "ABSTAIN_INSUFFICIENT_TRAIN_RECORDS";
  if (split.holdout.length < MINIMUMS.holdoutRecords) {
    return "ABSTAIN_INSUFFICIENT_HOLDOUT_RECORDS";
  }
  const train = classCounts(split.train), holdout = classCounts(split.holdout);
  if (train.positive === 0 || train.negative === 0) return "ABSTAIN_TRAIN_ONE_CLASS";
  if (holdout.positive === 0 || holdout.negative === 0) return "ABSTAIN_HOLDOUT_ONE_CLASS";
  return null;
}

function assessment(config, inputRows, { trustedSourceReplay }) {
  const unlabelled = inputRows.filter((row) => row.label === null).length;
  const rows = inputRows.filter((row) => row.label !== null);
  const grouped = groupSplit(rows, config);
  const split = { ...grouped.split, totalRecords: rows.length,
    trainRecords: grouped.train.length, holdoutRecords: grouped.holdout.length };
  const reason = trustedSourceReplay
    ? abstentionReason(rows, { ...grouped, totalGroups: grouped.split.totalGroups })
    : "ABSTAIN_SELF_ASSERTED_UNTRUSTED";
  const trainClasses = classCounts(grouped.train);
  const holdoutClasses = classCounts(grouped.holdout);
  const systematicDependencies = Object.fromEntries(config.systematicFieldsNotPartitioned
    .map((field) => {
      const trainRoots = new Set(grouped.train.map((row) => row.record.roots[field]).filter(Boolean));
      const holdoutRoots = new Set(grouped.holdout.map((row) =>
        row.record.roots[field]).filter(Boolean));
      const overlappingRoots = new Set([...trainRoots].filter((root) => holdoutRoots.has(root)));
      return [field, {
        uniqueRoots: new Set(inputRows.map((row) =>
          row.record.roots[field]).filter(Boolean)).size,
        usedForPartition: false,
        trainHoldoutOverlapRoots: overlappingRoots.size,
        evaluationUnitsOnOverlappingRoots: rows.filter((row) =>
          overlappingRoots.has(row.record.roots[field])).length,
      }];
    }));
  let training = null, holdout = null;
  if (reason === null) {
    const model = fitLogistic(grouped.train);
    const scores = grouped.holdout.map((row) => predict(model, row.features));
    const roundedModel = {
      weights: model.weights.map(round), bias: round(model.bias),
      mean: model.standardizer.mean.map(round), std: model.standardizer.std.map(round),
    };
    training = {
      evaluationLocalFitPerformed: true,
      algorithm: TRAINING.algorithm,
      parameters: { epochs: TRAINING.epochs, learningRate: TRAINING.learningRate,
        learningRateDecay: TRAINING.learningRateDecay, l2: TRAINING.l2 },
      records: grouped.train.length,
      groups: grouped.split.trainGroups,
      classes: trainClasses,
      modelCommitmentHash: digest({ featureNames: PUBLIC_CORPUS_BASELINE_FEATURES,
        ...roundedModel }, "outsider/public-corpus-baseline/model/v1"),
    };
    holdout = {
      records: grouped.holdout.length,
      groups: grouped.split.holdoutGroups,
      classes: holdoutClasses,
      metrics: metrics(grouped.holdout, scores),
    };
  }
  const body = {
    dataset: { id: config.pin.id, revision: config.pin.revision,
      licenseId: config.pin.licenseId, sourceClass: config.pin.sourceClass },
    target: config.target,
    positiveClassMeaning: config.positiveClassMeaning,
    decision: reason ?? "EVALUATED_SOURCE_SPECIFIC_DESCRIPTIVE_ONLY",
    input: { acceptedRecordsForDataset: inputRows.length,
      eligibleBinaryLabels: rows.length, excludedUnlabelledOrUnknownLabels: unlabelled },
    featurePolicy: {
      included: [...PUBLIC_CORPUS_BASELINE_FEATURES],
      sourceLabelUsedAsFeature: false,
      ignoredRecordPaths: ["labels.*", "detectorOutputs.*", "episode.errorCount",
        "episode.userTurnCount", "episode.agentTurnCount", "episode.durationMs",
        "dataset.*", "roots.*"],
    },
    split,
    sampleAccounting: {
      rowsUsedAsIndependentSamples: false,
      declaredCorrelationComponentCount: split.totalGroups,
      underDeclaredRootsOnly: true,
      independenceClaimed: false,
      metricWeighting: "EVALUATION_UNIT_WEIGHTED_WITH_CORRELATION_GROUPS_DISCLOSED",
    },
    systematicDependencies,
    trainClasses,
    holdoutClasses,
    training,
    holdout,
    interpretation: {
      trustedSourceReplay,
      sourceSpecificOnly: true,
      crossDatasetGeneralizationClaimed: false,
      populationPrevalenceClaimed: false,
      calibrationClaimed: false,
      caseControlSampling: config.target === "NEBIUS_BENCHMARK_RESOLVED",
      preregistered: false,
      analystAdaptivityNotExcluded: true,
      holdoutNature: "DETERMINISTIC_INTERNAL_GROUP_HOLDOUT",
      causalEffectClaimed: false,
      note: config.target === "OPENHANDS_USER_DISSATISFACTION"
        ? "All public OpenHands feedback rows share one collector root, so an independent holdout is refused."
        : config.target === "CAA_TASK_CORRECTNESS"
          ? "Task, instruction, user and session roots form split components; model/setup roots are disclosed systematic dependencies and generalization is not claimed."
          : "Repository and task roots form split components and do not cross train and holdout.",
    },
    evidenceBoundary: evidenceBoundary(),
  };
  return { ...body, assessmentHash: digest(body,
    "outsider/public-corpus-baseline/assessment/v2") };
}

function buildBaselineReport(records, { sourceTrust, trustedSourceReplay }) {
  if (!Array.isArray(records)) fail("PUBLIC_CORPUS_BASELINE_RECORDS_INVALID");
  const prepared = prepare(records);
  const assessments = SOURCE_CONFIGS.map((config) => assessment(config,
    prepared.items.filter((item) => item.config.pin.id === config.pin.id),
    { trustedSourceReplay }));
  const body = {
    schema: PUBLIC_CORPUS_BASELINE_SCHEMA,
    schemaVersion: "2.0.0",
    evaluator: {
      id: "outsider-public-corpus-count-baseline",
      version: "2.0.0",
      implementationHash: BASELINE_IMPLEMENTATION_HASH,
      policyHash: digest({ features: PUBLIC_CORPUS_BASELINE_FEATURES,
        splitSeed: SPLIT_SEED, splitFraction: SPLIT_FRACTION,
        minimums: MINIMUMS, training: TRAINING, sources: SOURCE_CONFIGS.map((config) => ({
          id: config.pin.id, revision: config.pin.revision, target: config.target,
          groupingBasis: config.groupingBasis,
          correlationFields: config.correlationFields,
          systematicFieldsNotPartitioned: config.systematicFieldsNotPartitioned,
        })) }, "outsider/public-corpus-baseline/policy/v2"),
    },
    sourceTrust,
    inputAccounting: prepared.accounting,
    coverage: {
      acceptedRecordsByDataset: countBy(prepared.items.map((item) => item.config.pin.id)),
      supportedDatasetCount: SOURCE_CONFIGS.length,
    },
    assessments,
    boundary: evidenceBoundary(),
    limitations: [
      "Metrics are source-specific descriptive holdout measurements, not cross-source generalization.",
      "Public source labels are evaluation targets only and never model features or economic-loss evidence.",
      "Hash grouping prevents declared task/repository overlap but does not prove statistical independence.",
      "The local fit runs only because this evaluator was explicitly invoked and is not promoted automatically.",
      "The deterministic internal holdout was not externally preregistered; analyst adaptivity is not excluded.",
      "Case-control sample scores are not population calibration or prevalence estimates.",
      trustedSourceReplay
        ? "Every accepted source record was reproduced internally from the pinned source directory."
        : "Caller-supplied normalized records are untrusted; all assessments abstain and no model is fit.",
    ],
  };
  return deepFreeze({ ...body, reportHash: digest(body, PUBLIC_CORPUS_BASELINE_SCHEMA) });
}

/**
 * Compatibility and adapter-development intake only. A valid recordHash is a
 * self-check, not proof that a row came from a pinned public source. Raw rows
 * therefore always produce ABSTAIN_SELF_ASSERTED_UNTRUSTED and never fit a
 * model or emit holdout metrics.
 */
export function evaluatePublicCorpusBaseline(records = []) {
  return buildBaselineReport(records, { sourceTrust: untrustedSourceBinding(),
    trustedSourceReplay: false });
}

function validFullSourceReplay(replay) {
  return replay?.ok === true && replay.status === "FULL_SOURCE_REPRODUCED"
    && replay.attestation?.derivation === "FULL_SOURCE_REDERIVED"
    && HASH.test(replay.attestation?.verificationHash ?? "")
    && HASH.test(replay.attestation?.manifestHash ?? "")
    && HASH.test(replay.attestation?.recordSetHash ?? "")
    && HASH.test(replay.attestation?.summaryHash ?? "")
    && Array.isArray(replay.attestation?.verifiedSourceObjectHashes)
    && replay.attestation.verifiedSourceObjectHashes.length > 0
    && replay.attestation?.scope && typeof replay.attestation.scope === "object"
    && !Array.isArray(replay.attestation.scope)
    && replay.attestation.verifiedSourceObjectHashes.every((object) =>
      HASH.test(object?.sha256 ?? ""))
    && replay.attestation?.boundary?.economicLossRows === 0
    && replay.attestation?.boundary?.pricingEligibleRows === 0
    && replay.attestation?.boundary?.permitsPrice === false
    && replay.attestation?.boundary?.permitsGuarantee === false
    && replay.attestation?.boundary?.permitsSettle === false
    && Array.isArray(replay.records) && replay.records.length > 0
    && replay.attestation.records === replay.records.length
    && replay.manifest?.manifestHash === replay.attestation.manifestHash
    && replay.recordSetProof?.recordSetHash === replay.attestation.recordSetHash
    && replay.summary?.summaryHash === replay.attestation.summaryHash;
}

/** The only path that can emit descriptive holdout metrics. */
export async function evaluatePublicCorpusBaselineFromSource({ sourceDirectory,
  artifactDirectory } = {}) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length === 0
    || typeof artifactDirectory !== "string" || artifactDirectory.length === 0) {
    fail("PUBLIC_CORPUS_BASELINE_SOURCE_DIRECTORIES_REQUIRED");
  }
  const replay = await verifyPublicAgentArtifactsAgainstSource(
    { sourceDirectory, artifactDirectory });
  if (!validFullSourceReplay(replay)) {
    fail("PUBLIC_CORPUS_BASELINE_FULL_SOURCE_REPLAY_FAILED",
      replay?.error ?? replay?.status ?? "invalid-replay");
  }
  return buildBaselineReport(replay.records, {
    sourceTrust: trustedSourceBinding(replay.attestation),
    trustedSourceReplay: true,
  });
}

/**
 * A public report hash is not an attestation. Verification always re-runs the
 * directory-only full-source verifier and recomputes the complete report.
 */
export async function verifyPublicCorpusBaselineReport(report, { sourceDirectory = null,
  artifactDirectory = null } = {}) {
  try {
    if (!report || report.schema !== PUBLIC_CORPUS_BASELINE_SCHEMA
      || report.schemaVersion !== "2.0.0" || !HASH.test(report.reportHash ?? "")
      || report.sourceTrust?.trustClass !== "FULL_SOURCE_REPLAY_BOUND"
      || canonicalizeStrict(report.boundary) !== canonicalizeStrict(evidenceBoundary())) {
      return Object.freeze({ ok: false, error: "PUBLIC_CORPUS_BASELINE_REPORT_INVALID" });
    }
    const { reportHash, ...body } = report;
    if (reportHash !== digest(body, PUBLIC_CORPUS_BASELINE_SCHEMA)) {
      return Object.freeze({ ok: false, error: "PUBLIC_CORPUS_BASELINE_REPORT_HASH_MISMATCH" });
    }
    if (typeof sourceDirectory !== "string" || typeof artifactDirectory !== "string") {
      return Object.freeze({ ok: false,
        error: "PUBLIC_CORPUS_BASELINE_TRUSTED_SOURCE_REPLAY_REQUIRED" });
    }
    const reproduced = await evaluatePublicCorpusBaselineFromSource(
      { sourceDirectory, artifactDirectory });
    if (canonicalizeStrict(reproduced) !== canonicalizeStrict(report)) {
      return Object.freeze({ ok: false, error: "PUBLIC_CORPUS_BASELINE_REPRODUCTION_MISMATCH" });
    }
    return Object.freeze({ ok: true, reportHash, assessments: report.assessments.length });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export { digest as publicCorpusBaselineDigest };
