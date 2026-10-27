/*
 * Actuarial mechanism research over public corpora.
 *
 * This module measures observable behaviour and evidence reliability. Native
 * benchmark outcomes remain non-monetary proxy consequences. They are never
 * economic loss, severity, price, coverage, guarantee, or settlement evidence.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const ACTUARIAL_MECHANISM_SHADOW_SCHEMAS = Object.freeze({
  factorDictionary: "outsider/actuarial-mechanism-factor-dictionary/v1",
  observation: "outsider/actuarial-mechanism-observation/v1",
  report: "outsider/actuarial-mechanism-shadow-report/v1",
  compactReport: "outsider/actuarial-mechanism-compact-report/v1",
});

export const ACTUARIAL_MECHANISM_FACTOR_VERSION = "1.0.0";

const definition = (id, layer, valueType, definitionText, measurableFrom) => Object.freeze({
  id, layer, valueType, definition: definitionText,
  measurableFrom: Object.freeze([...measurableFrom]),
  historical36Mapping: null,
  missingPolicy: "EXPLICIT_NULL_WITH_REASON_NO_IMPUTATION",
});

export const ACTUARIAL_MECHANISM_FACTORS = Object.freeze([
  definition("execution_control_mode", "BEHAVIOUR_MECHANISM", "enum",
    "Observed collection or execution control mode; it is not an autonomy score.",
    ["agent normalized episode", "robot collection metadata", "DROID episode"]),
  definition("trajectory_step_count", "BEHAVIOUR_MECHANISM", "nonnegative_integer",
    "Count of ordered trajectory steps present in the normalized source projection.",
    ["agent episode.stepCount", "BotFails declared frames", "DROID steps"]),
  definition("tool_call_count", "BEHAVIOUR_MECHANISM", "nonnegative_integer",
    "Count of structurally identified tool or function calls.",
    ["agent episode.toolCallCount"]),
  definition("tool_result_pairing_ratio", "BEHAVIOUR_MECHANISM", "ratio",
    "Observed tool results divided by tool calls, capped at one; null when no call exists.",
    ["agent episode.toolCallCount/toolResultCount"]),
  definition("observed_error_event_rate", "BEHAVIOUR_MECHANISM", "ratio",
    "Structurally or lexically observed error events divided by observable results.",
    ["agent episode.errorCount/toolResultCount"]),
  definition("agent_turn_fraction", "BEHAVIOUR_MECHANISM", "ratio",
    "Agent turns divided by observed agent plus user turns.",
    ["agent episode.agentTurnCount/userTurnCount"]),
  definition("trajectory_duration_ms", "BEHAVIOUR_MECHANISM", "nonnegative_number",
    "Elapsed trajectory time, or declared-frame duration when both frame count and fps exist.",
    ["agent episode.durationMs", "BotFails declared frames/fps"]),
  definition("post_error_recovery_observed", "BEHAVIOUR_MECHANISM", "boolean",
    "Whether the source explicitly exposes an error followed by a successful native outcome.",
    ["tau2 detectorOutputs.errorThenBenchmarkSuccess"]),
  definition("action_observation_pairing_ratio", "BEHAVIOUR_MECHANISM", "ratio",
    "Share of steps with both an action and an observation projection.",
    ["DROID steps"]),
  definition("terminal_boundary_observed", "EVIDENCE_RELIABILITY", "boolean",
    "Whether an explicit terminal boundary is present in the projected trajectory.",
    ["DROID steps"]),
]);

export const ACTUARIAL_MECHANISM_FACTOR_DICTIONARY = Object.freeze({
  schema: ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.factorDictionary,
  schemaVersion: ACTUARIAL_MECHANISM_FACTOR_VERSION,
  factors: ACTUARIAL_MECHANISM_FACTORS,
  boundary: Object.freeze({
    extendsHistorical36Schema: false,
    fillsHistorical36MissingValues: false,
    benchmarkOutcomeIsLoss: false,
    proxyReliabilityIsConsequence: false,
  }),
});

export const ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH = digest(
  "outsider/actuarial-mechanism-factor-dictionary/v1",
  ACTUARIAL_MECHANISM_FACTOR_DICTIONARY,
);

const SOURCE_REPLAY_CLASSES = new Set([
  "FULL_SOURCE_REPRODUCED",
  "ARTIFACT_GRAPH_ONLY",
  "DECLARED_UNVERIFIED",
]);

const CORPUS_KINDS = new Set(["PUBLIC_AGENT", "PUBLIC_ROBOTICS", "DROID"]);

function digest(domain, value) {
  return `sha256:${createHash("sha256").update(`${domain}\0${canonicalizeStrict(value)}`)
    .digest("hex")}`;
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nonnegative(value) {
  const number = finite(value);
  return number !== null && number >= 0 ? number : null;
}

function integer(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function measured(value, sourceField, measurementQuality = "DIRECT_NORMALIZED_FIELD") {
  return Object.freeze({ status: "MEASURED", value, missingReason: null,
    sourceField, measurementQuality });
}

function missing(reason) {
  return Object.freeze({ status: "MISSING", value: null, missingReason: reason,
    sourceField: null, measurementQuality: "UNAVAILABLE" });
}

function ratio(numerator, denominator) {
  if (!(Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0)) {
    return null;
  }
  return Math.max(0, Math.min(1, numerator / denominator));
}

function completeFactorMap(values) {
  return Object.fromEntries(ACTUARIAL_MECHANISM_FACTORS.map((factor) => [factor.id,
    values[factor.id] ?? missing("FACTOR_NOT_OBSERVABLE_FROM_THIS_SOURCE_PROJECTION")]));
}

function fixedEconomicLossBoundary() {
  return Object.freeze({
    observed: false,
    amountMinorUnits: null,
    currency: null,
    severityModeled: false,
    frequencySeverityModel: "ABSTAIN_NO_ADMISSIBLE_ECONOMIC_LOSS_SEVERITY",
    monetaryTVaR: null,
  });
}

function agentConsequence(record) {
  const kind = record.labels?.nativeOutcomeKind;
  const value = record.labels?.nativeOutcomeValue;
  const table = {
    "user-feedback-preference": ["USER_DISSATISFACTION_PROXY", value === "negative"],
    "human-evaluated-task-correctness": ["TASK_FAILURE_PROXY", value === false],
    "benchmark-resolved": ["TASK_FAILURE_PROXY", value === false],
    "benchmark-harness-reward": ["TASK_FAILURE_PROXY", value === false],
    "benchmark-environment-success": ["TASK_FAILURE_PROXY", value === false],
    "synthetic-benchmark-safety-verdict": ["EXECUTION_ANOMALY_PROXY", value === false],
    "generated-benchmark-safety-verdict": ["EXECUTION_ANOMALY_PROXY", value === false],
  };
  const mapped = table[kind];
  const hasValue = typeof value === "boolean" || ["positive", "negative"].includes(value);
  if (!mapped || !hasValue) return { status: "MISSING", target: null, event: null,
    nativeOutcomeKind: kind ?? "none", nativeValue: value ?? null,
    reason: "NO_COMPATIBLE_BINARY_NATIVE_OUTCOME" };
  return { status: "OBSERVED_NATIVE_PROXY", target: mapped[0], event: mapped[1],
    nativeOutcomeKind: kind, nativeValue: value,
    provenance: record.labels?.provenance ?? "UNKNOWN",
    independentAdjudication: record.labels?.independentAdjudication === true,
    economicLoss: false };
}

function projectAgent(record) {
  const episode = record?.episode ?? {};
  const steps = integer(episode.stepCount);
  const calls = integer(episode.toolCallCount);
  const results = integer(episode.toolResultCount);
  const errors = integer(episode.errorCount);
  const agentTurns = integer(episode.agentTurnCount);
  const userTurns = integer(episode.userTurnCount);
  const duration = nonnegative(episode.durationMs);
  const recovery = record.detectorOutputs?.errorThenBenchmarkSuccess;
  const factors = completeFactorMap({
    execution_control_mode: measured("AGENT_SOFTWARE", "dataset.sourceClass"),
    trajectory_step_count: steps === null ? missing("STEP_COUNT_NOT_EXPOSED")
      : measured(steps, "episode.stepCount"),
    tool_call_count: calls === null ? missing("TOOL_CALL_COUNT_NOT_EXPOSED")
      : measured(calls, "episode.toolCallCount"),
    tool_result_pairing_ratio: calls === null || results === null
      ? missing("TOOL_CALL_OR_RESULT_COUNT_NOT_EXPOSED")
      : calls === 0 ? missing("NO_TOOL_CALL_DENOMINATOR")
        : measured(ratio(results, calls), "episode.toolResultCount/episode.toolCallCount"),
    observed_error_event_rate: errors === null || results === null
      ? missing("ERROR_OR_RESULT_COUNT_NOT_EXPOSED")
      : results === 0 ? missing("NO_TOOL_RESULT_DENOMINATOR")
        : measured(ratio(errors, results), "episode.errorCount/episode.toolResultCount"),
    agent_turn_fraction: agentTurns === null || userTurns === null
      ? missing("TURN_COUNTS_NOT_EXPOSED")
      : agentTurns + userTurns === 0 ? missing("NO_TURN_DENOMINATOR")
        : measured(ratio(agentTurns, agentTurns + userTurns),
          "episode.agentTurnCount/(agentTurnCount+userTurnCount)"),
    trajectory_duration_ms: duration === null ? missing("TIMESTAMPS_OR_DURATION_NOT_EXPOSED")
      : measured(duration, "episode.durationMs"),
    post_error_recovery_observed: typeof recovery === "boolean"
      ? measured(recovery, "detectorOutputs.errorThenBenchmarkSuccess",
        "SOURCE_EXPLICIT_ORDERED_DERIVATION")
      : missing("ORDERED_ERROR_THEN_OUTCOME_DERIVATION_NOT_EXPOSED"),
  });
  return { datasetId: record.dataset?.id, recordId: record.recordHash,
    correlationRoots: record.roots?.correlationRoots ?? [], factors,
    consequence: agentConsequence(record),
    evidence: { nativeLabelClass: record.labels?.provenance ?? "NO_NATIVE_LABEL",
      syntheticOrSimulated: /synthetic|generated|simulated/i.test(
        `${record.dataset?.sourceClass ?? ""} ${record.labels?.provenance ?? ""}`) } };
}

function robotConsequence(record) {
  if (record.dataset?.id === "kantine/BotFails"
    && ["ANOMALY_LABEL_PRESENT", "NO_ANOMALY_LABEL_PRESENT"].includes(record.truth?.value)) {
    return { status: "OBSERVED_NATIVE_PROXY", target: "EXECUTION_ANOMALY_PROXY",
      event: record.truth.value === "ANOMALY_LABEL_PRESENT",
      nativeOutcomeKind: "manual-frame-anomaly-label", nativeValue: record.truth.value,
      nativeMagnitude: record.truth.frameLabels == null ? null : {
        positiveFrames: record.truth.frameLabels.positiveCount,
        observedFrames: record.truth.frameLabels.frameCount,
      }, provenance: record.truth.provenance, independentAdjudication: false,
      economicLoss: false };
  }
  if (record.dataset?.id === "paulpacaud/Guardian-FailCoT-OOD-datasets"
    && ["SUBTASK_FAILURE", "SUBTASK_SUCCESS"].includes(record.truth?.value)) {
    return { status: "OBSERVED_NATIVE_PROXY", target: "TASK_FAILURE_PROXY",
      event: record.truth.value === "SUBTASK_FAILURE",
      nativeOutcomeKind: "manual-subtask-success-label", nativeValue: record.truth.value,
      provenance: record.truth.provenance, independentAdjudication: false,
      economicLoss: false };
  }
  return { status: "MISSING", target: null, event: null,
    nativeOutcomeKind: record.truth?.provenance ?? "none", nativeValue: record.truth?.value ?? null,
    reason: "DIRECTORY_MEMBERSHIP_OR_UNSUPPORTED_LABEL_IS_NOT_AN_OUTCOME" };
}

function projectRobot(record) {
  const botFails = record.dataset?.id === "kantine/BotFails";
  const frames = botFails ? integer(record.commitments?.declaredFrameCount) : null;
  const fps = botFails ? nonnegative(record.collection?.fps) : null;
  const mode = record.collection?.executionMode === "TELEOPERATION"
    ? "ROBOT_TELEOPERATION" : record.collection?.executionMode === "AUTONOMOUS_POLICY_EXECUTION"
      ? "ROBOT_AUTONOMOUS_POLICY" : "ROBOT_HISTORICAL_UNSPECIFIED";
  const factors = completeFactorMap({
    execution_control_mode: measured(mode, "collection.executionMode"),
    trajectory_step_count: frames === null ? missing("ROBOT_STEP_COUNT_NOT_EXPOSED")
      : measured(frames, "commitments.declaredFrameCount"),
    trajectory_duration_ms: frames !== null && fps !== null && fps > 0
      ? measured(frames / fps * 1000,
        "commitments.declaredFrameCount/collection.fps", "DERIVED_FROM_DECLARED_FPS")
      : missing("FRAME_COUNT_OR_FPS_NOT_EXPOSED"),
  });
  return { datasetId: record.dataset?.id, recordId: record.recordHash,
    correlationRoots: Object.values(record.correlation ?? {}).filter((value) =>
      typeof value === "string"), factors, consequence: robotConsequence(record),
    evidence: { nativeLabelClass: record.truth?.provenance ?? "NO_NATIVE_LABEL",
      syntheticOrSimulated: false } };
}

function projectDroid(episode) {
  const steps = Array.isArray(episode?.steps) ? episode.steps : [];
  const paired = steps.filter((step) => step?.action != null && step?.observation != null).length;
  const terminal = steps.some((step) => step?.boundary?.isTerminal === true);
  const factors = completeFactorMap({
    execution_control_mode: measured("ROBOT_HISTORICAL_UNSPECIFIED",
      "provenance.class"),
    trajectory_step_count: measured(steps.length, "steps.length"),
    action_observation_pairing_ratio: steps.length === 0 ? missing("NO_STEP_DENOMINATOR")
      : measured(ratio(paired, steps.length), "steps[action&&observation]/steps.length"),
    terminal_boundary_observed: measured(terminal, "steps.boundary.isTerminal"),
  });
  return { datasetId: `${episode.source?.datasetId}@${episode.source?.datasetVersion}`,
    recordId: episode.episodeHash ?? episode.episodeIdHash,
    correlationRoots: [episode.source?.datasetManifestHash,
      episode.instrument?.extractorImplementationHash].filter(Boolean),
    factors, consequence: { status: "MISSING", target: null, event: null,
      nativeOutcomeKind: "recorded-outcome-features", nativeValue: null,
      reason: "RECORDED_REWARD_WITHOUT_ADJUDICATED_OUTCOME_SEMANTICS" },
    evidence: { nativeLabelClass: "NO_ADJUDICATED_OUTCOME_LABEL",
      syntheticOrSimulated: false } };
}

function validateNoLoss(record, kind) {
  const text = JSON.stringify(record);
  if (kind === "PUBLIC_AGENT" && (record.labels?.economicLossObserved !== false
      || record.labels?.lossMinorUnits !== null || record.labels?.currency !== null
      || record.useBoundary?.economicLossObserved !== false
      || record.useBoundary?.lossMinorUnits !== null
      || record.useBoundary?.currency !== null
      || record.useBoundary?.exposureDenominatorObserved !== false
      || record.useBoundary?.permits?.PRICE !== false)) {
    throw new Error("ACTUARIAL_SHADOW_AGENT_LOSS_BOUNDARY_INVALID");
  }
  if (kind === "PUBLIC_ROBOTICS" && (record.evidenceBoundary?.pricingEligible !== false
      || record.evidenceBoundary?.establishesLossOrLiability !== false)) {
    throw new Error("ACTUARIAL_SHADOW_ROBOT_LOSS_BOUNDARY_INVALID");
  }
  if (kind === "DROID" && /"lossMinorUnits"\s*:\s*[1-9]/.test(text)) {
    throw new Error("ACTUARIAL_SHADOW_DROID_LOSS_BOUNDARY_INVALID");
  }
}

function projectCorpus(corpus) {
  if (!corpus || !CORPUS_KINDS.has(corpus.kind)
    || !SOURCE_REPLAY_CLASSES.has(corpus.sourceReplayClass)
    || typeof corpus.corpusId !== "string" || !Array.isArray(corpus.records)) {
    throw new Error("ACTUARIAL_SHADOW_CORPUS_INVALID");
  }
  return corpus.records.map((record) => {
    validateNoLoss(record, corpus.kind);
    const projected = corpus.kind === "PUBLIC_AGENT" ? projectAgent(record)
      : corpus.kind === "PUBLIC_ROBOTICS" ? projectRobot(record) : projectDroid(record);
    if (typeof projected.datasetId !== "string" || typeof projected.recordId !== "string") {
      throw new Error("ACTUARIAL_SHADOW_RECORD_IDENTITY_INVALID");
    }
    if (projected.correlationRoots.length === 0) {
      projected.correlationRoots = [digest("outsider/actuarial-missing-root-fallback/v1",
        { corpusId: corpus.corpusId, datasetId: projected.datasetId })];
    }
    const measuredCount = Object.values(projected.factors)
      .filter((factor) => factor.status === "MEASURED").length;
    const body = {
      schema: ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.observation,
      schemaVersion: ACTUARIAL_MECHANISM_FACTOR_VERSION,
      factorSchemaHash: ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH,
      corpusId: corpus.corpusId,
      corpusKind: corpus.kind,
      datasetId: projected.datasetId,
      sourceRecordHash: projected.recordId,
      correlationRoots: [...new Set(projected.correlationRoots)].sort(),
      correlationRootScope: "DATASET_LOCAL_BY_ADAPTER_CONSTRUCTION",
      factors: projected.factors,
      reliability: {
        sourceReplayClassClaimed: corpus.sourceReplayClass,
        nativeLabelClass: projected.evidence.nativeLabelClass,
        syntheticOrSimulated: projected.evidence.syntheticOrSimulated,
        measuredFactorCount: measuredCount,
        totalFactorCount: ACTUARIAL_MECHANISM_FACTORS.length,
        measuredFactorCoverageRatio: measuredCount / ACTUARIAL_MECHANISM_FACTORS.length,
      },
      consequence: projected.consequence,
      economicLoss: fixedEconomicLossBoundary(),
      authority: { PRICE: false, coverage: false, GUARANTEE: false, SETTLE: false },
    };
    return Object.freeze({ ...body, observationHash: digest(
      ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.observation, body) });
  });
}

class UnionFind {
  constructor(size) { this.parent = Array.from({ length: size }, (_, index) => index); }
  find(index) {
    if (this.parent[index] !== index) this.parent[index] = this.find(this.parent[index]);
    return this.parent[index];
  }
  union(left, right) {
    const a = this.find(left); const b = this.find(right);
    if (a !== b) this.parent[b] = a;
  }
}

function correlationComponents(rows) {
  const union = new UnionFind(rows.length);
  const owner = new Map();
  rows.forEach((row, index) => {
    for (const root of row.correlationRoots) {
      const key = `${row.datasetId}\0${root}`;
      if (owner.has(key)) union.union(index, owner.get(key)); else owner.set(key, index);
    }
  });
  const members = new Map();
  rows.forEach((row, index) => {
    const root = union.find(index);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(index);
  });
  const ids = new Map();
  for (const indexes of members.values()) {
    const id = digest("outsider/actuarial-correlation-component/v1",
      indexes.map((index) => rows[index].observationHash).sort());
    for (const index of indexes) ids.set(index, { id, size: indexes.length });
  }
  return { ids, componentCount: members.size,
    largestComponent: Math.max(0, ...[...members.values()].map((items) => items.length)) };
}

const LANCZOS = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012,
  9.9843695780195716e-6, 1.5056327351493116e-7];

export function logGamma(value) {
  if (value < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * value)) - logGamma(1 - value);
  let z = value - 1;
  let x = 0.99999999999980993;
  for (let index = 0; index < LANCZOS.length; index += 1) x += LANCZOS[index] / (z + index + 1);
  const t = z + LANCZOS.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaContinuedFraction(a, b, x) {
  const max = 200; const epsilon = 3e-14; const tiny = 1e-300;
  const qab = a + b; const qap = a + 1; const qam = a - 1;
  let c = 1; let d = 1 - qab * x / qap;
  if (Math.abs(d) < tiny) d = tiny;
  d = 1 / d; let h = d;
  for (let m = 1; m <= max; m += 1) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < tiny) d = tiny;
    c = 1 + aa / c; if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const delta = d * c; h *= delta;
    if (Math.abs(delta - 1) < epsilon) break;
  }
  return h;
}

function regularizedBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const front = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b)
    + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2)
    ? front * betaContinuedFraction(a, b, x) / a
    : 1 - front * betaContinuedFraction(b, a, 1 - x) / b;
}

export function betaQuantile(probability, alpha, beta) {
  if (!(probability >= 0 && probability <= 1 && alpha > 0 && beta > 0)) {
    throw new Error("ACTUARIAL_SHADOW_BETA_QUANTILE_INPUT_INVALID");
  }
  if (probability === 0 || probability === 1) return probability;
  let low = 0; let high = 1;
  for (let index = 0; index < 100; index += 1) {
    const middle = (low + high) / 2;
    if (regularizedBeta(middle, alpha, beta) < probability) low = middle; else high = middle;
  }
  return (low + high) / 2;
}

export function betaBinomialPmf(horizon, alpha, beta) {
  if (!Number.isSafeInteger(horizon) || horizon < 1 || !(alpha > 0) || !(beta > 0)) {
    throw new Error("ACTUARIAL_SHADOW_BETA_BINOMIAL_INPUT_INVALID");
  }
  const logBeta = logGamma(alpha) + logGamma(beta) - logGamma(alpha + beta);
  const probabilities = Array.from({ length: horizon + 1 }, (_, count) => Math.exp(
    logGamma(horizon + 1) - logGamma(count + 1) - logGamma(horizon - count + 1)
    + logGamma(count + alpha) + logGamma(horizon - count + beta)
    - logGamma(horizon + alpha + beta) - logBeta));
  const total = probabilities.reduce((sum, value) => sum + value, 0);
  return probabilities.map((value) => value / total);
}

function discreteTail(pmf, confidence) {
  let cumulative = 0; let valueAtRisk = pmf.length - 1;
  for (let index = 0; index < pmf.length; index += 1) {
    cumulative += pmf[index];
    if (cumulative >= confidence) { valueAtRisk = index; break; }
  }
  const targetMass = 1 - confidence;
  let massAbove = 0; let sumAbove = 0;
  for (let index = valueAtRisk + 1; index < pmf.length; index += 1) {
    massAbove += pmf[index]; sumAbove += pmf[index] * index;
  }
  const massAtVar = Math.max(0, Math.min(pmf[valueAtRisk], targetMass - massAbove));
  return { valueAtRisk, tailValueAtRisk: targetMass > 0
    ? (sumAbove + massAtVar * valueAtRisk) / targetMass : valueAtRisk };
}

function calibration(componentRows) {
  const totalEvents = componentRows.reduce((sum, cell) => sum + cell.events, 0);
  const totalN = componentRows.reduce((sum, cell) => sum + cell.exposures, 0);
  if (componentRows.length < 2) return { status: "ABSTAIN",
    reason: "FEWER_THAN_TWO_DISCLOSED_ROOT_COMPONENTS" };
  if (!(totalEvents > 0 && totalEvents < totalN)) return { status: "ABSTAIN",
    reason: "OUTCOME_HAS_NO_CLASS_VARIATION" };
  let weight = 0; let brier = 0; let logLoss = 0;
  const points = [];
  for (const heldOut of componentRows) {
    const trainEvents = totalEvents - heldOut.events;
    const trainN = totalN - heldOut.exposures;
    if (!(trainN > 0)) continue;
    const prediction = (trainEvents + 0.5) / (trainN + 1);
    const actual = heldOut.events / heldOut.exposures;
    const componentWeight = 1;
    brier += componentWeight * (prediction - actual) ** 2;
    logLoss += componentWeight * (-(actual * Math.log(Math.max(1e-12, prediction))
      + (1 - actual) * Math.log(Math.max(1e-12, 1 - prediction))));
    weight += componentWeight;
    points.push({ prediction, actual, componentId: heldOut.componentId });
  }
  const bins = Array.from({ length: 10 }, () => ({ weight: 0, prediction: 0, actual: 0 }));
  for (const point of points) {
    const bin = bins[Math.min(9, Math.floor(point.prediction * 10))];
    bin.weight += 1; bin.prediction += point.prediction; bin.actual += point.actual;
  }
  const ece = bins.reduce((sum, bin) => bin.weight === 0 ? sum
    : sum + bin.weight / weight * Math.abs(bin.prediction / bin.weight - bin.actual / bin.weight), 0);
  return { status: "DESCRIPTIVE_DISCLOSED_COMPONENT_HOLDOUT_SENSITIVITY",
    method: "LEAVE_ONE_DISCLOSED_ROOT_COMPONENT_OUT",
    components: points.length, brierScore: brier / weight, logLoss: logLoss / weight,
    expectedCalibrationError10Bin: ece,
    limitation: "INTERCEPT_ONLY_PROXY_CALIBRATION_NOT_PRODUCTION_VALIDATION" };
}

function cohortReport(rows, horizon, confidence) {
  const components = new Map();
  for (const row of rows) {
    if (!components.has(row.disclosedCorrelationComponentId)) {
      components.set(row.disclosedCorrelationComponentId, {
        componentId: row.disclosedCorrelationComponentId,
        exposures: 0, events: 0 });
    }
    const cell = components.get(row.disclosedCorrelationComponentId);
    cell.exposures += 1; cell.events += row.consequence.event ? 1 : 0;
  }
  const componentRows = [...components.values()];
  const componentWeightTotal = componentRows.length;
  const fractionalWeightProxyEvents = componentRows.reduce((sum, cell) =>
    sum + cell.events / cell.exposures, 0);
  const alpha = 0.5 + fractionalWeightProxyEvents;
  const beta = 0.5 + componentWeightTotal - fractionalWeightProxyEvents;
  const pmf = betaBinomialPmf(horizon, alpha, beta);
  const tail = discreteTail(pmf, confidence);
  return {
    nominalRows: rows.length,
    disclosedRootComponents: componentRows.length,
    sensitivityWeightingMethod:
      "ONE_TOTAL_WEIGHT_PER_DISCLOSED_ROOT_COMPONENT_NO_EFFECTIVE_EXPOSURE_BOUND",
    scenario: "DISCLOSED_ROOT_COMPONENT_SENSITIVITY_NOT_FREQUENCY_OR_WORST_CASE",
    correlationRootCompletenessEstablished: false,
    unobservedCrossComponentDependenceModeled: false,
    effectiveExposureBoundClaimed: false,
    estimatedWithinComponentCorrelation: false,
    realWorldFrequencyEstimated: false,
    nominalExposureUpperBound: rows.length,
    componentWeightTotal,
    fractionalWeightProxyEvents,
    rawProxyEvents: rows.filter((row) => row.consequence.event).length,
    fractionalWeightQuasiPosterior: {
      status: "NON_MONETARY_PROXY_POWER_LIKELIHOOD_SENSITIVITY_ONLY",
      baseMeasure: "JEFFREYS_SHAPED_BETA_0.5_0.5_NOT_A_CONJUGATE_POSTERIOR",
      alpha, beta, mean: alpha / (alpha + beta),
      variance: alpha * beta / ((alpha + beta) ** 2 * (alpha + beta + 1)),
      sensitivityInterval95: [betaQuantile(0.025, alpha, beta),
        betaQuantile(0.975, alpha, beta)],
      probabilityPosteriorClaimed: false,
    },
    quasiPredictiveTailSensitivity: {
      measure: "NON_MONETARY_PROXY_EVENT_COUNT_SENSITIVITY",
      horizon, confidence,
      expectedCount: horizon * alpha / (alpha + beta),
      valueAtRiskCount: tail.valueAtRisk,
      tailValueAtRiskCount: tail.tailValueAtRisk,
      dollars: null,
      predictiveDistributionValidated: false,
      betaBinomialPredictiveClaimed: false,
    },
    buhlmannStraub: {
      status: "ABSTAIN",
      reason: "WITHIN_COMPONENT_INDEPENDENCE_NOT_ESTABLISHED",
      estimator: null,
      sufficientStatisticsOnly: {
        componentCount: componentRows.length,
        cells: componentRows.map((cell) => ({
          componentId: cell.componentId,
          nominalRows: cell.exposures,
          proxyEvents: cell.events,
          proxyFraction: cell.events / cell.exposures,
        })).sort((left, right) => left.componentId.localeCompare(right.componentId)),
        withinComponentIndependenceEstablished: false,
      },
    },
    disclosedComponentHoldoutSensitivity: calibration(componentRows),
    frequencySeverity: "ABSTAIN_NO_ADMISSIBLE_ECONOMIC_LOSS_SEVERITY",
  };
}

/**
 * Pure non-authoritative math helper. It accepts already-declared component
 * memberships and never establishes source provenance, independence, frequency,
 * loss, or pricing eligibility.
 */
export function calculateDisclosedRootProxySensitivity({ observations,
  horizon = 100, confidence = 0.95 } = {}) {
  if (!Array.isArray(observations) || observations.length === 0
    || observations.some((row) => typeof row?.disclosedComponentId !== "string"
      || row.disclosedComponentId.length === 0 || typeof row.event !== "boolean")
    || !Number.isSafeInteger(horizon) || horizon < 1
    || !(confidence > 0 && confidence < 1)) {
    throw new Error("ACTUARIAL_PROXY_SENSITIVITY_INPUT_INVALID");
  }
  return Object.freeze(cohortReport(observations.map((row) => ({
    disclosedCorrelationComponentId: row.disclosedComponentId,
    consequence: { event: row.event },
  })), horizon, confidence));
}

function missingnessSummary(rows) {
  return ACTUARIAL_MECHANISM_FACTORS.map((definition) => {
    const observations = rows.map((row) => row.factors[definition.id]);
    const reasons = {};
    for (const observation of observations.filter((item) => item.status === "MISSING")) {
      reasons[observation.missingReason] = (reasons[observation.missingReason] ?? 0) + 1;
    }
    const measuredRows = observations.filter((item) => item.status === "MEASURED").length;
    return { factorId: definition.id, measuredRows, missingRows: rows.length - measuredRows,
      measurableCoverageRatio: rows.length === 0 ? 0 : measuredRows / rows.length,
      missingReasons: reasons };
  });
}

function sourceFactorCoverage(rows) {
  const byCorpus = new Map();
  for (const row of rows) {
    if (!byCorpus.has(row.corpusId)) byCorpus.set(row.corpusId, []);
    byCorpus.get(row.corpusId).push(row);
  }
  return [...byCorpus.entries()].map(([corpusId, members]) => ({
    corpusId,
    rows: members.length,
    factors: missingnessSummary(members).map(({ factorId, measuredRows, missingRows,
      measurableCoverageRatio }) => ({ factorId, measuredRows, missingRows,
      measurableCoverageRatio })),
  })).sort((left, right) => left.corpusId.localeCompare(right.corpusId));
}

function buildActuarialMechanismShadowReportInternal({ corpora, deferredSources = [],
  horizon = 100, confidence = 0.95 } = {}, {
  sourceAdmissionMode = "CALLER_ASSERTED_MEASUREMENT_ONLY",
  sourceVerificationReceipts = [],
} = {}) {
  if (!Array.isArray(corpora) || corpora.length === 0
    || !Number.isSafeInteger(horizon) || horizon < 1
    || !(confidence > 0 && confidence < 1)) {
    throw new Error("ACTUARIAL_SHADOW_REPORT_INPUT_INVALID");
  }
  const rows = corpora.flatMap(projectCorpus);
  const identities = rows.map((row) => `${row.datasetId}\0${row.sourceRecordHash}`);
  if (new Set(identities).size !== identities.length) {
    throw new Error("ACTUARIAL_SHADOW_DUPLICATE_SOURCE_RECORD");
  }
  const correlation = correlationComponents(rows);
  const enriched = rows.map((row, index) => ({ ...row,
    disclosedCorrelationComponentId: correlation.ids.get(index).id,
    disclosedCorrelationComponentSize: correlation.ids.get(index).size,
    disclosedComponentEqualWeight: 1 / correlation.ids.get(index).size }));
  const observedProxyRows = enriched.filter((item) =>
    item.consequence.status === "OBSERVED_NATIVE_PROXY");
  const sourceAdmissionVerified = sourceAdmissionMode === "KNOWN_SOURCE_REPLAYED_IN_PROCESS";
  const modelEligibleProxyRows = sourceAdmissionVerified ? observedProxyRows.filter((item) =>
    item.reliability.sourceReplayClassClaimed === "FULL_SOURCE_REPRODUCED") : [];
  const excludedProxyRows = observedProxyRows.filter((item) =>
    !sourceAdmissionVerified
      || item.reliability.sourceReplayClassClaimed !== "FULL_SOURCE_REPRODUCED");
  const modelCorrelation = correlationComponents(modelEligibleProxyRows);
  const modelRows = modelEligibleProxyRows.map((row, index) => ({ ...row,
    disclosedCorrelationComponentId: modelCorrelation.ids.get(index).id,
    disclosedCorrelationComponentSize: modelCorrelation.ids.get(index).size }));
  const cohorts = new Map();
  for (const row of modelRows) {
    const key = `${row.datasetId}\0${row.consequence.target}`;
    if (!cohorts.has(key)) cohorts.set(key, []);
    cohorts.get(key).push(row);
  }
  const cohortReports = [...cohorts.entries()].map(([key, members]) => {
    const [datasetId, target] = key.split("\0");
    return { datasetId, target, ...cohortReport(members, horizon, confidence) };
  }).sort((left, right) => `${left.datasetId}\0${left.target}`
    .localeCompare(`${right.datasetId}\0${right.target}`));
  const body = {
    schema: ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.report,
    schemaVersion: "1.0.0",
    mode: "SHADOW_RESEARCH_ONLY",
    factorSchemaHash: ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH,
    sourceAdmission: {
      mode: sourceAdmissionMode,
      sourceArtifactsReplayedInBuildProcess: sourceAdmissionVerified,
      modelAdmissionAuthorizedByPrivateReplayPath: sourceAdmissionVerified,
      sourceArtifactsReverifiedByReportVerifier: false,
      verificationReceipts: sourceAdmissionVerified ? sourceVerificationReceipts : [],
    },
    sourceSummary: corpora.map((corpus) => ({ corpusId: corpus.corpusId,
      corpusKind: corpus.kind, sourceReplayClassClaimed: corpus.sourceReplayClass,
      sourceReplayVerifiedForModel: sourceAdmissionVerified
        && corpus.sourceReplayClass === "FULL_SOURCE_REPRODUCED",
      rows: corpus.records.length })),
    deferredSources: deferredSources.map((source) => ({ ...source,
      rows: 0, factorCoverage: "MISSING_NOT_INGESTED" })),
    observations: enriched,
    measurement: {
      rows: enriched.length,
      datasets: new Set(enriched.map((row) => row.datasetId)).size,
      disclosedRootComponents: correlation.componentCount,
      largestDisclosedRootComponent: correlation.largestComponent,
      correlationRootCompletenessEstablished: false,
      unobservedCrossComponentDependenceModeled: false,
      effectiveExposureBoundClaimed: false,
      nominalIndependentRowsClaimed: false,
      crossDatasetCorrelationStatus: "NOT_IDENTIFIED_ADAPTER_ROOTS_ARE_DATASET_SCOPED",
      crossDatasetIndependenceClaimed: false,
      missingness: missingnessSummary(enriched),
      sourceFactorCoverage: sourceFactorCoverage(enriched),
    },
    consequenceModels: cohortReports,
    consequenceModelAdmission: {
      requiredSourceReplayClass: "FULL_SOURCE_REPRODUCED",
      sourceAdmissionMode,
      modelAdmissionAuthorizedByPrivateReplayPath: sourceAdmissionVerified,
      observedNativeProxyRows: observedProxyRows.length,
      admittedProxyRows: modelEligibleProxyRows.length,
      excludedProxyRows: excludedProxyRows.length,
      modelDisclosedRootComponents: modelCorrelation.componentCount,
      modelCorrelationGraphBuiltOnlyFromAdmittedRows: true,
      excludedBySourceReplayClass: Object.fromEntries([...new Set(excludedProxyRows
        .map((row) => row.reliability.sourceReplayClassClaimed))].sort()
        .map((sourceReplayClass) => [
        sourceReplayClass,
        excludedProxyRows.filter((row) =>
          row.reliability.sourceReplayClassClaimed === sourceReplayClass).length,
      ])),
      nonFullSourceProxyModelsCreated: false,
    },
    economicLossModel: fixedEconomicLossBoundary(),
    portfolio: {
      status: "DISCLOSED_ROOT_COMPONENT_SENSITIVITY_ONLY",
      independentPortfolioAggregation: false,
      correlationDiscountApplied: false,
      estimatedCorrelationDiscount: false,
      correlationRootCompletenessEstablished: false,
      unobservedCrossComponentDependenceModeled: false,
      worstCaseDependenceClaimed: false,
      monetaryPortfolioTVaR: null,
      capital: null,
    },
    authority: {
      PRICE: false, coverage: false, GUARANTEE: false, SETTLE: false,
      quote: null, premium: null, capital: null,
    },
    productionReadiness: {
      ready: false,
      blockers: [
        "NO_COMPLETE_PRODUCTION_EXPOSURE_DENOMINATOR",
        "NO_ADJUDICATED_ECONOMIC_LOSS_SEVERITY",
        "NO_CUSTOMER_TEMPORAL_HOLDOUT_OR_DRIFT_VALIDATION",
        "NO_INDEPENDENT_CORRELATION_MODEL_VALIDATION",
        "NO_LICENSED_ACTUARY_SIGNOFF",
        "NO_CAPITAL_OR_COVERAGE_AUTHORITY",
      ],
    },
    interpretation: {
      benchmarkOutcomeUsedAsEconomicLoss: false,
      benchmarkSpendUsedAsEconomicLoss: false,
      robotRewardUsedAsEconomicLoss: false,
      reliabilityUsedAsConsequence: false,
      buhlmannStraubEqualsFullBetaBinomialClaimed: false,
      componentWeightedPosteriorIsTrueFrequencyEstimate: false,
      fractionalWeightResultCalledConjugatePosterior: false,
      betaBinomialPredictiveDistributionClaimed: false,
      onlyFullSourceReproducedProxyRowsEnterSensitivityModels: true,
      disclosedRootComponentsAreEffectiveExposureLowerBound: false,
      globalWorstCaseDependenceModeled: false,
    },
  };
  return Object.freeze({ ...body,
    reportHash: digest(ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.report, body) });
}

export function buildActuarialMechanismShadowReport(options = {}) {
  return buildActuarialMechanismShadowReportInternal(options);
}

/**
 * The only model-admitting entrypoint. It accepts source locations, not caller
 * records or a claimed replay class, and re-runs every known source adapter in
 * this process before the private model-admission capability is used.
 */
export async function buildKnownSourceActuarialMechanismShadowReport({
  wave1SourceDirectory, wave1ArtifactDirectory,
  wave2SourceDirectory, wave2GeneratedAt,
  botFailsSourceDirectory, ur5SourceDirectory,
  droidArtifactDirectory, droidSource,
  wave3SourceDirectory = null, wave3GeneratedAt = null,
  horizon = 100, confidence = 0.95,
} = {}) {
  if ([wave1SourceDirectory, wave1ArtifactDirectory, wave2SourceDirectory,
    botFailsSourceDirectory, ur5SourceDirectory, droidArtifactDirectory]
    .some((value) => typeof value !== "string" || value.length === 0)
    || !droidSource || typeof droidSource !== "object") {
    throw new Error("ACTUARIAL_SHADOW_KNOWN_SOURCE_PATHS_REQUIRED");
  }
  const [{ verifyPublicAgentArtifactsAgainstSource }, wave2Module, robotModule,
    { verifyDroid100PilotArtifactDirectory }, wave3Module] = await Promise.all([
    import("./outsider-public-agent-artifacts.js"),
    import("./outsider-public-agent-wave2.js"),
    import("./outsider-public-robotics-adapter.js"),
    import("./outsider-droid100-pilot-artifacts.js"),
    import("./outsider-public-agent-wave3.js"),
  ]);
  const wave1 = await verifyPublicAgentArtifactsAgainstSource({
    sourceDirectory: wave1SourceDirectory,
    artifactDirectory: wave1ArtifactDirectory,
  });
  if (!wave1.ok || wave1.status !== "FULL_SOURCE_REPRODUCED") {
    throw new Error("ACTUARIAL_SHADOW_WAVE1_SOURCE_REPLAY_FAILED");
  }
  const wave2 = wave2Module.verifyPublicAgentWave2Source(wave2SourceDirectory,
    { generatedAt: wave2GeneratedAt });
  if (wave2.verification?.status !== "FULL_SELECTED_SOURCE_OBJECTS_REPRODUCED"
    || wave2.verification?.boundary?.causalExperienceUnits !== 0
    || wave2.verification?.boundary?.economicLossRows !== 0
    || wave2.verification?.boundary?.pricingEligibleRows !== 0) {
    throw new Error("ACTUARIAL_SHADOW_WAVE2_SOURCE_REPLAY_FAILED");
  }
  const botFails = robotModule.convertBotFailsPilot(botFailsSourceDirectory);
  const ur5 = robotModule.convertUr5FailExecution(ur5SourceDirectory);
  const droid = verifyDroid100PilotArtifactDirectory(droidArtifactDirectory,
    { source: droidSource });
  if (!droid.ok || droid.verificationLevel !== "FULL_SOURCE_REPRODUCED") {
    throw new Error("ACTUARIAL_SHADOW_DROID_SOURCE_REPLAY_FAILED");
  }
  let wave3 = null;
  if (wave3SourceDirectory !== null) {
    wave3 = wave3Module.verifyPublicAgentWave3Source(wave3SourceDirectory,
      { generatedAt: wave3GeneratedAt });
    if (wave3.verification?.status !== "PINNED_METADATA_ONLY_REPRODUCED"
      || wave3.verification?.sourceCompleteness !== "QUARANTINED_NO_TRACE_BYTES"
      || wave3.verification?.records !== wave3Module.CUAREWARDBENCH_WAVE3_PIN.annotationRows
      || wave3.verification?.taskCorrelationComponents
        !== wave3Module.CUAREWARDBENCH_WAVE3_PIN.uniqueTaskComponents
      || wave3.verification?.traceBytesAcquired !== 0
      || wave3.summary?.counts?.trajectoryTruthUsableRows !== 0
      || wave3.summary?.counts?.causalExperienceUnits !== 0
      || wave3.summary?.counts?.economicLossRows !== 0
      || wave3.summary?.counts?.pricingEligibleRows !== 0
      || wave3.summary?.interpretation?.automaticTraining !== false) {
      throw new Error("ACTUARIAL_SHADOW_WAVE3_METADATA_BOUNDARY_FAILED");
    }
  }
  const receipt = (corpusId, status, binding) => {
    const body = { corpusId, status, ...binding };
    return { ...body, receiptHash: digest(
      "outsider/actuarial-known-source-replay-receipt/v1", body) };
  };
  const receipts = [
    receipt("public-agent-wave1", wave1.status, {
      manifestHash: wave1.attestation.manifestHash,
      recordSetHash: wave1.attestation.recordSetHash,
      summaryHash: wave1.attestation.summaryHash,
      verificationHash: wave1.attestation.verificationHash,
    }),
    receipt("public-agent-wave2", wave2.verification.status, {
      manifestHash: wave2.manifest.manifestHash,
      recordSetHash: wave2.recordSet.recordSetHash,
      verificationHash: wave2.verification.verificationHash,
    }),
    receipt("botfails-pilot", "FULL_SOURCE_REDERIVED", {
      manifestHash: botFails.manifest.manifestHash,
      recordSetHash: digest("outsider/actuarial-known-source-record-set/v1",
        botFails.records.map((record) => record.recordHash).sort()),
      summaryHash: botFails.summary.summaryHash,
    }),
    receipt("ur5fail-execution", "FULL_SOURCE_REDERIVED", {
      manifestHash: ur5.manifest.manifestHash,
      recordSetHash: digest("outsider/actuarial-known-source-record-set/v1",
        ur5.records.map((record) => record.recordHash).sort()),
      summaryHash: ur5.summary.summaryHash,
    }),
    receipt("droid100-first-shard", droid.verificationLevel, {
      reportHash: droid.reportHash,
      artifactSetHash: droid.artifactSetHash,
      checkpointHash: droid.checkpointHash,
    }),
  ];
  const deferredSources = [];
  const cua = wave2.candidateDecision?.candidates?.find((candidate) =>
    candidate.datasetId === "microsoft/CUAVerifierBench");
  deferredSources.push({
    datasetId: "microsoft/CUAVerifierBench",
    revision: cua?.revision ?? "c19eb323cd802add5c3d2840ff13044061364867",
    status: cua?.decision ?? "DEFERRED_NOT_INGESTED",
    reason: cua?.reason ?? "TRAJECTORY_OBJECTS_NOT_INGESTED",
  });
  if (wave3 !== null) {
    const pin = wave3Module.CUAREWARDBENCH_WAVE3_PIN;
    deferredSources.push({ datasetId: pin.id, revision: pin.revision,
      sourceKind: pin.sourceKind, sourceReplayClass: wave3.verification.status,
      sourceCompleteness: wave3.verification.sourceCompleteness,
      status: "DEFERRED_METADATA_ONLY_NO_TRACE_BYTES",
      reason: "PINNED_METADATA_LABELS_ARE_NOT_TRAJECTORY_FACTORS_OR_OUTCOMES",
      metadataRows: wave3.verification.records,
      metadataTaskRoots: wave3.verification.taskCorrelationComponents,
      traceBytesAcquired: 0, trajectoryTruthUsableRows: 0,
      metadataLabelsUsedAsFactors: false, outcomeRowsAdmitted: 0,
      recoveryRowsAdmitted: 0, causalExperienceUnits: 0, economicLossRows: 0,
      pricingEligibleRows: 0, trainingRowsAdmitted: 0, automaticTraining: false,
      manifestHash: wave3.manifest.manifestHash,
      recordSetHash: wave3.recordSet.recordSetHash,
      summaryHash: wave3.summary.summaryHash,
      verificationHash: wave3.verification.verificationHash });
    receipts.push(receipt("cuarewardbench-wave3-metadata", wave3.verification.status, {
      manifestHash: wave3.manifest.manifestHash,
      recordSetHash: wave3.recordSet.recordSetHash,
      verificationHash: wave3.verification.verificationHash,
      modelRowsAdmitted: 0,
    }));
  }
  return buildActuarialMechanismShadowReportInternal({
    corpora: [
      { corpusId: "public-agent-wave1", kind: "PUBLIC_AGENT",
        sourceReplayClass: "FULL_SOURCE_REPRODUCED", records: wave1.records },
      { corpusId: "public-agent-wave2", kind: "PUBLIC_AGENT",
        sourceReplayClass: "FULL_SOURCE_REPRODUCED", records: wave2.records },
      { corpusId: "botfails-pilot", kind: "PUBLIC_ROBOTICS",
        sourceReplayClass: "FULL_SOURCE_REPRODUCED", records: botFails.records },
      { corpusId: "ur5fail-execution", kind: "PUBLIC_ROBOTICS",
        sourceReplayClass: "FULL_SOURCE_REPRODUCED", records: ur5.records },
      { corpusId: "droid100-first-shard", kind: "DROID",
        sourceReplayClass: "FULL_SOURCE_REPRODUCED", records: droid.artifacts.episodes },
    ],
    deferredSources, horizon, confidence,
  }, {
    sourceAdmissionMode: "KNOWN_SOURCE_REPLAYED_IN_PROCESS",
    sourceVerificationReceipts: receipts,
  });
}

function canonicalEqual(left, right) {
  try {
    return canonicalizeStrict(left) === canonicalizeStrict(right);
  } catch {
    return false;
  }
}

function isSha256(value) {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function fixedAuthorityBoundary() {
  return {
    PRICE: false, coverage: false, GUARANTEE: false, SETTLE: false,
    quote: null, premium: null, capital: null,
  };
}

function verifyObservationIntegrity(row) {
  if (!row || row.schema !== ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.observation
    || row.schemaVersion !== ACTUARIAL_MECHANISM_FACTOR_VERSION
    || row.factorSchemaHash !== ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH
    || !isSha256(row.observationHash)
    || !Array.isArray(row.correlationRoots)
    || !isSha256(row.disclosedCorrelationComponentId)
    || !Number.isSafeInteger(row.disclosedCorrelationComponentSize)
    || row.disclosedCorrelationComponentSize < 1
    || row.disclosedComponentEqualWeight !== 1 / row.disclosedCorrelationComponentSize
    || !canonicalEqual(row.economicLoss, fixedEconomicLossBoundary())
    || !canonicalEqual(row.authority,
      { PRICE: false, coverage: false, GUARANTEE: false, SETTLE: false })) {
    return false;
  }
  const { observationHash, disclosedCorrelationComponentId,
    disclosedCorrelationComponentSize, disclosedComponentEqualWeight, ...body } = row;
  return observationHash === digest(ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.observation, body);
}

function verifyReplayReceipt(receipt) {
  if (!receipt || typeof receipt.corpusId !== "string" || receipt.corpusId.length === 0
    || typeof receipt.status !== "string" || !isSha256(receipt.receiptHash)) return false;
  const { receiptHash, ...body } = receipt;
  return receiptHash === digest("outsider/actuarial-known-source-replay-receipt/v1", body);
}

/**
 * Verifies the report's sealed bytes and fixed no-authority invariants. It does
 * not reopen source directories, so it deliberately never reports source replay.
 */
export function verifyActuarialMechanismShadowReport(report) {
  try {
    if (!report || report.schema !== ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.report
      || report.schemaVersion !== "1.0.0" || report.mode !== "SHADOW_RESEARCH_ONLY"
      || report.factorSchemaHash !== ACTUARIAL_MECHANISM_FACTOR_SCHEMA_HASH
      || !isSha256(report.reportHash) || !Array.isArray(report.observations)
      || !Array.isArray(report.consequenceModels) || !Array.isArray(report.sourceSummary)
      || !Array.isArray(report.sourceAdmission?.verificationReceipts)
      || !canonicalEqual(report.economicLossModel, fixedEconomicLossBoundary())
      || !canonicalEqual(report.authority, fixedAuthorityBoundary())
      || report.productionReadiness?.ready !== false) {
      throw new Error("REPORT_BOUNDARY_INVALID");
    }
    const { reportHash, ...body } = report;
    if (reportHash !== digest(ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.report, body)) {
      throw new Error("REPORT_HASH_INVALID");
    }
    if (!report.observations.every(verifyObservationIntegrity)
      || report.measurement?.rows !== report.observations.length
      || report.sourceSummary.reduce((sum, source) => sum + source.rows, 0)
        !== report.observations.length) {
      throw new Error("OBSERVATION_SET_INVALID");
    }
    const mode = report.sourceAdmission.mode;
    if (!["CALLER_ASSERTED_MEASUREMENT_ONLY", "KNOWN_SOURCE_REPLAYED_IN_PROCESS"]
      .includes(mode)) throw new Error("SOURCE_ADMISSION_MODE_INVALID");
    const privatelyAdmitted = mode === "KNOWN_SOURCE_REPLAYED_IN_PROCESS";
    if (report.sourceAdmission.sourceArtifactsReplayedInBuildProcess !== privatelyAdmitted
      || report.sourceAdmission.modelAdmissionAuthorizedByPrivateReplayPath
        !== privatelyAdmitted
      || report.sourceAdmission.sourceArtifactsReverifiedByReportVerifier !== false
      || report.consequenceModelAdmission?.modelAdmissionAuthorizedByPrivateReplayPath
        !== privatelyAdmitted) {
      throw new Error("SOURCE_ADMISSION_BOUNDARY_INVALID");
    }
    const receipts = report.sourceAdmission.verificationReceipts;
    if ((!privatelyAdmitted && receipts.length !== 0)
      || (privatelyAdmitted && receipts.length < 5)
      || !receipts.every(verifyReplayReceipt)
      || new Set(receipts.map((receipt) => receipt.corpusId)).size !== receipts.length) {
      throw new Error("SOURCE_REPLAY_RECEIPTS_INVALID");
    }
    const observedProxyRows = report.observations.filter((row) =>
      row.consequence?.status === "OBSERVED_NATIVE_PROXY").length;
    const admission = report.consequenceModelAdmission;
    if (admission.observedNativeProxyRows !== observedProxyRows
      || admission.admittedProxyRows + admission.excludedProxyRows !== observedProxyRows
      || admission.nonFullSourceProxyModelsCreated !== false
      || (!privatelyAdmitted && (admission.admittedProxyRows !== 0
        || report.consequenceModels.length !== 0))) {
      throw new Error("MODEL_ADMISSION_COUNTS_INVALID");
    }
    for (const model of report.consequenceModels) {
      if (!Number.isSafeInteger(model.disclosedRootComponents)
        || model.disclosedRootComponents < 1
        || model.correlationRootCompletenessEstablished !== false
        || model.unobservedCrossComponentDependenceModeled !== false
        || model.effectiveExposureBoundClaimed !== false
        || model.realWorldFrequencyEstimated !== false
        || model.buhlmannStraub?.status !== "ABSTAIN"
        || model.buhlmannStraub?.estimator !== null
        || model.buhlmannStraub?.sufficientStatisticsOnly
          ?.withinComponentIndependenceEstablished !== false
        || "perfectDependenceExposureLowerBound" in model
        || "effectiveExposureMethod" in model) {
        throw new Error("MODEL_CLAIM_BOUNDARY_INVALID");
      }
    }
    if (report.measurement.correlationRootCompletenessEstablished !== false
      || report.measurement.unobservedCrossComponentDependenceModeled !== false
      || report.measurement.effectiveExposureBoundClaimed !== false
      || report.portfolio?.worstCaseDependenceClaimed !== false
      || report.portfolio?.correlationDiscountApplied !== false) {
      throw new Error("CORRELATION_CLAIM_BOUNDARY_INVALID");
    }
    return {
      ok: true,
      verificationLevel: "SEALED_REPORT_STRUCTURE_VERIFIED",
      reportHashVerified: true,
      observationHashesVerified: true,
      authorityBoundaryVerified: true,
      inProcessKnownSourceReplayClaimed: privatelyAdmitted,
      sourceArtifactsReverified: false,
      sourceReplayClaimAuthenticatedByThisVerifier: false,
    };
  } catch (error) {
    return { ok: false, error: error.message, verificationLevel: "INVALID",
      sourceArtifactsReverified: false };
  }
}

function compactBodyFromVerifiedReport(report) {
  const observationSetHash = digest("outsider/actuarial-mechanism-analysis-row-set/v1",
    report.observations.map((row) => ({ observationHash: row.observationHash,
      disclosedCorrelationComponentId: row.disclosedCorrelationComponentId,
      disclosedCorrelationComponentSize: row.disclosedCorrelationComponentSize,
      disclosedComponentEqualWeight: row.disclosedComponentEqualWeight })).sort((left, right) =>
      left.observationHash.localeCompare(right.observationHash)));
  const { observations: ignored, reportHash: ignoredHash, ...summary } = report;
  return { ...summary,
    schema: ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.compactReport,
    fullReportSchema: report.schema,
    artifactMode: "COMPACT_REPLAY_RECEIPT",
    fullReportHash: report.reportHash,
    compactVerificationBoundary: {
      fullReportStructuralIntegrityVerifiedBeforeCompaction: true,
      sourceArtifactsReverifiedByCompactVerifier: false,
    },
    observationSet: { rows: report.observations.length, observationSetHash } };
}

/**
 * Small replay receipt for check-in and review. The full in-memory report binds
 * every observation; this receipt binds the same report plus correlation
 * assignments without serializing tens of megabytes of repeated factor keys.
 */
export function compactActuarialMechanismShadowReport(report) {
  const verification = verifyActuarialMechanismShadowReport(report);
  if (!verification.ok) {
    throw new Error("ACTUARIAL_SHADOW_COMPACT_REPORT_INVALID");
  }
  const body = compactBodyFromVerifiedReport(report);
  return Object.freeze({ ...body,
    compactReportHash: digest(ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.compactReport, body) });
}

export function verifyCompactActuarialMechanismShadowReport(compact, { fullReport } = {}) {
  try {
    if (!compact || compact.schema !== ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.compactReport
      || compact.fullReportSchema !== ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.report
      || compact.artifactMode !== "COMPACT_REPLAY_RECEIPT"
      || !isSha256(compact.compactReportHash) || !isSha256(compact.fullReportHash)
      || !canonicalEqual(compact.authority, fixedAuthorityBoundary())
      || compact.productionReadiness?.ready !== false
      || compact.compactVerificationBoundary
        ?.fullReportStructuralIntegrityVerifiedBeforeCompaction !== true
      || compact.compactVerificationBoundary
        ?.sourceArtifactsReverifiedByCompactVerifier !== false) {
      throw new Error("COMPACT_BOUNDARY_INVALID");
    }
    const { compactReportHash, ...body } = compact;
    if (compactReportHash !== digest(ACTUARIAL_MECHANISM_SHADOW_SCHEMAS.compactReport, body)) {
      throw new Error("COMPACT_HASH_INVALID");
    }
    let fullReportMatched = false;
    if (fullReport !== undefined) {
      const fullVerification = verifyActuarialMechanismShadowReport(fullReport);
      if (!fullVerification.ok) throw new Error("FULL_REPORT_INVALID");
      const expected = compactActuarialMechanismShadowReport(fullReport);
      if (!canonicalEqual(compact, expected)) throw new Error("COMPACT_FULL_REPORT_MISMATCH");
      fullReportMatched = true;
    }
    return { ok: true, verificationLevel: fullReportMatched
      ? "FULL_REPORT_STRUCTURALLY_REBOUND" : "COMPACT_SELF_CHECK_ONLY",
    compactHashVerified: true, fullReportMatched,
    sourceArtifactsReverified: false };
  } catch (error) {
    return { ok: false, error: error.message, verificationLevel: "INVALID",
      sourceArtifactsReverified: false };
  }
}
