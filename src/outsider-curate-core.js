/*
 * Stage 1.5 CURATE core — a deterministic, privacy-minimized vertical slice.
 *
 * This module deliberately does less than a causal-learning system:
 *
 *   1. admit one strict numeric projection of a historical public episode;
 *   2. report structure, consistency, replay and simple drift observations;
 *   3. seal the clearance in a domain-separated Merkle checkpoint; and
 *   4. refuse fit-to-learn promotion because historical observations are not a
 *      prospectively assigned intervention.
 *
 * It has no model or LLM dependency. Alerts are unlabelled observations, never
 * precision/recall claims. Authority and every financial permission remain off.
 */

import { createHash } from "node:crypto";
import { canonicalizeStrict } from "./canonical.js";

export const CURATE_SCHEMAS = Object.freeze({
  episodeInput: "outsider/curate-episode-input/v1",
  episode: "outsider/curate-episode/v1",
  corpusFactClearance: "outsider/curate-corpus-fact-clearance/v1",
  clearance: "outsider/curate-clearance/v1",
  fitToLearnDecision: "outsider/curate-fit-to-learn-decision/v1",
  checkpoint: "outsider/curate-checkpoint/v1",
  inclusionProof: "outsider/curate-inclusion-proof/v1",
});

export const CURATE_REFUSALS = Object.freeze({
  noProspectiveCausalDesign: "NO_PROSPECTIVE_CAUSAL_DESIGN",
});

export const CURATE_LIMITS = Object.freeze({
  minSteps: 2,
  maxSteps: 20_000,
  maxFeaturesPerVector: 256,
  maxImagesPerObservation: 16,
  maxImageDimension: 16_384,
  maxAbsoluteFeatureValue: 1_000_000_000_000,
  maxOffsetMs: 86_400_000,
  defaultDriftThreshold: 0.5,
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const FEATURE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,95}$/;
const CHECK_STATUS = new Set(["PASS", "ALERT", "SKIPPED"]);
const CLEARANCE_REASONS = Object.freeze([
  "HISTORICAL_PUBLIC_DATASET_DECLARED_UNVERIFIED",
  CURATE_REFUSALS.noProspectiveCausalDesign,
]);
const PRIVACY_EXCLUDED = Object.freeze([
  "audio",
  "credentials",
  "free-form-text",
  "image",
  "path",
  "prompt",
  "raw-action-payload",
  "raw-sensor-payload",
  "transcript",
  "video",
]);
const MERKLE = Object.freeze({
  empty: "outsider/curate-merkle/empty/v1",
  leaf: "outsider/curate-merkle/leaf/v1",
  node: "outsider/curate-merkle/node/v1",
});

function fail(code) {
  throw new Error(code);
}

function plainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  return plainObject(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function token(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(code);
  return value;
}

function hash(value, code) {
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function domainDigest(domain, value) {
  const bytes = `${domain}\0${canonicalizeStrict(value)}`;
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function canonicalDigest(value) {
  return `sha256:${createHash("sha256").update(canonicalizeStrict(value)).digest("hex")}`;
}

function addressed(body, field, domain) {
  return deepFreeze({ ...body, [field]: domainDigest(domain, body) });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function round(value) {
  const result = Math.round((value + Number.EPSILON) * 1e12) / 1e12;
  return Object.is(result, -0) ? 0 : result;
}

function useBoundary() {
  return {
    authority: "none",
    automaticTraining: false,
    establishesLossOrLiability: false,
    permits: { PRICE: false, GUARANTEE: false, SETTLE: false },
  };
}

function validUseBoundary(value) {
  return exactKeys(value, ["authority", "automaticTraining",
    "establishesLossOrLiability", "permits"])
    && value.authority === "none"
    && value.automaticTraining === false
    && value.establishesLossOrLiability === false
    && exactKeys(value.permits, ["PRICE", "GUARANTEE", "SETTLE"])
    && Object.values(value.permits).every((item) => item === false);
}

function normalizeFeatures(value, code) {
  if (!plainObject(value)) fail(`${code}_NOT_OBJECT`);
  const keys = Object.keys(value).sort();
  if (keys.length > CURATE_LIMITS.maxFeaturesPerVector) fail(`${code}_TOO_MANY`);
  const output = {};
  for (const key of keys) {
    if (!FEATURE.test(key)) fail(`${code}_NAME_INVALID`);
    const featureValue = value[key];
    if (typeof featureValue !== "number" || !Number.isFinite(featureValue)) {
      fail(`${code}_NON_FINITE`);
    }
    if (Math.abs(featureValue) > CURATE_LIMITS.maxAbsoluteFeatureValue) {
      fail(`${code}_OUT_OF_BOUNDS`);
    }
    output[key] = Object.is(featureValue, -0) ? 0 : featureValue;
  }
  return output;
}

function normalizeTypedVector(value, code) {
  if (value === null) return null;
  if (!exactKeys(value, ["kind", "features"])) fail(`${code}_SHAPE_INVALID`);
  return {
    kind: token(value.kind, `${code}_KIND_INVALID`),
    features: normalizeFeatures(value.features, `${code}_FEATURE`),
  };
}

function normalizeObservation(value, code) {
  if (!exactKeys(value, ["commitment", "features", "images"])) {
    fail(`${code}_SHAPE_INVALID`);
  }
  if (!Array.isArray(value.images)
    || value.images.length > CURATE_LIMITS.maxImagesPerObservation) {
    fail(`${code}_IMAGE_COUNT_OUT_OF_BOUNDS`);
  }
  const features = normalizeFeatures(value.features, `${code}_FEATURE`);
  const images = value.images.map((image) => {
    if (!exactKeys(image, ["commitment", "width", "height", "format"])
      || !validNonnegativeInteger(image.width, { minimum: 1,
        maximum: CURATE_LIMITS.maxImageDimension })
      || !validNonnegativeInteger(image.height, { minimum: 1,
        maximum: CURATE_LIMITS.maxImageDimension })) {
      fail(`${code}_IMAGE_SHAPE_INVALID`);
    }
    return {
      commitment: hash(image.commitment, `${code}_IMAGE_COMMITMENT_INVALID`),
      width: image.width,
      height: image.height,
      format: token(image.format, `${code}_IMAGE_FORMAT_INVALID`),
    };
  });
  if (Object.keys(features).length === 0 && images.length === 0) {
    fail(`${code}_MEASUREMENT_EMPTY`);
  }
  return {
    commitment: hash(value.commitment, `${code}_COMMITMENT_INVALID`),
    features,
    images,
  };
}

function normalizeBoundary(value, expectedIndex, totalSteps) {
  if (!exactKeys(value, ["isFirst", "isLast", "isTerminal"])
    || Object.values(value).some((item) => typeof item !== "boolean")) {
    fail("CURATE_STEP_BOUNDARY_SHAPE_INVALID");
  }
  const expectedFirst = expectedIndex === 0;
  const expectedLast = expectedIndex === totalSteps - 1;
  if (value.isFirst !== expectedFirst || value.isLast !== expectedLast
    || value.isTerminal && !value.isLast) {
    fail("CURATE_STEP_BOUNDARY_INCONSISTENT");
  }
  return { isFirst: value.isFirst, isLast: value.isLast, isTerminal: value.isTerminal };
}

function normalizeStep(value, expectedIndex, totalSteps) {
  if (!exactKeys(value, ["index", "tOffsetMs", "boundary", "observation", "action",
    "outcome"])) {
    fail("CURATE_STEP_SHAPE_INVALID");
  }
  if (!Number.isSafeInteger(value.index) || value.index !== expectedIndex) {
    fail("CURATE_STEP_INDEX_NOT_CONTIGUOUS");
  }
  if (value.tOffsetMs !== null
    && (!Number.isSafeInteger(value.tOffsetMs) || value.tOffsetMs < 0
      || value.tOffsetMs > CURATE_LIMITS.maxOffsetMs)) {
    fail("CURATE_STEP_TIME_OUT_OF_BOUNDS");
  }
  return {
    index: expectedIndex,
    tOffsetMs: value.tOffsetMs,
    boundary: normalizeBoundary(value.boundary, expectedIndex, totalSteps),
    observation: normalizeObservation(value.observation, "CURATE_OBSERVATION"),
    action: normalizeTypedVector(value.action, "CURATE_ACTION"),
    outcome: normalizeTypedVector(value.outcome, "CURATE_OUTCOME"),
  };
}

function normalizeSource(value) {
  if (!exactKeys(value, ["datasetId", "datasetVersion", "datasetManifestHash",
    "sourceObjectHash", "licenseId", "attributionHash"])) {
    fail("CURATE_SOURCE_SHAPE_INVALID");
  }
  return {
    datasetId: token(value.datasetId, "CURATE_DATASET_ID_INVALID"),
    datasetVersion: token(value.datasetVersion, "CURATE_DATASET_VERSION_INVALID"),
    datasetManifestHash: hash(value.datasetManifestHash,
      "CURATE_DATASET_MANIFEST_HASH_INVALID"),
    sourceObjectHash: hash(value.sourceObjectHash, "CURATE_SOURCE_OBJECT_HASH_INVALID"),
    licenseId: token(value.licenseId, "CURATE_LICENSE_ID_INVALID"),
    attributionHash: hash(value.attributionHash, "CURATE_ATTRIBUTION_HASH_INVALID"),
  };
}

function normalizeInstrument(value) {
  if (!exactKeys(value, ["extractorId", "extractorVersion", "extractorImplementationHash",
    "featureSchemaHash"])) {
    fail("CURATE_INSTRUMENT_SHAPE_INVALID");
  }
  return {
    extractorId: token(value.extractorId, "CURATE_EXTRACTOR_ID_INVALID"),
    extractorVersion: token(value.extractorVersion, "CURATE_EXTRACTOR_VERSION_INVALID"),
    extractorImplementationHash: hash(value.extractorImplementationHash,
      "CURATE_EXTRACTOR_IMPLEMENTATION_HASH_INVALID"),
    featureSchemaHash: hash(value.featureSchemaHash,
      "CURATE_FEATURE_SCHEMA_HASH_INVALID"),
  };
}

function instrumentHash(value) {
  return domainDigest("outsider/curate-instrument/v1", value);
}

function expectedProvenance() {
  return {
    class: "historical-public-dataset",
    verification: "declared-unverified",
    stage05TraceBound: false,
  };
}

function expectedPrivacy() {
  return {
    rawContentIncluded: false,
    projection: "numeric-features-and-content-commitments-only",
    excluded: [...PRIVACY_EXCLUDED],
  };
}

/**
 * Accept exactly one privacy-safe episode projection. Unknown keys are refused,
 * not dropped: silently dropping a nested raw payload would make caller mistakes
 * look like successful privacy enforcement.
 */
export function normalizeCurateEpisode(input) {
  if (!exactKeys(input, ["schema", "source", "instrument", "episodeIdHash",
    "platformClass", "steps"])
    || input.schema !== CURATE_SCHEMAS.episodeInput) {
    fail("CURATE_EPISODE_INPUT_SHAPE_INVALID");
  }
  if (!Array.isArray(input.steps) || input.steps.length < CURATE_LIMITS.minSteps
    || input.steps.length > CURATE_LIMITS.maxSteps) {
    fail("CURATE_EPISODE_STEP_COUNT_OUT_OF_BOUNDS");
  }
  if (input.platformClass !== null) {
    token(input.platformClass, "CURATE_PLATFORM_CLASS_INVALID");
  }
  const body = {
    schema: CURATE_SCHEMAS.episode,
    schemaVersion: "1.0.0",
    source: normalizeSource(input.source),
    instrument: normalizeInstrument(input.instrument),
    episodeIdHash: hash(input.episodeIdHash, "CURATE_EPISODE_ID_HASH_INVALID"),
    platformClass: input.platformClass,
    provenance: expectedProvenance(),
    privacy: expectedPrivacy(),
    steps: input.steps.map((step, index) => normalizeStep(step, index, input.steps.length)),
    useBoundary: useBoundary(),
  };
  return addressed(body, "episodeHash", CURATE_SCHEMAS.episode);
}

function episodeBody(record) {
  const { episodeHash, ...body } = record;
  return body;
}

export function verifyCurateEpisode(record) {
  try {
    if (!exactKeys(record, ["schema", "schemaVersion", "source", "instrument",
      "episodeIdHash", "platformClass", "provenance", "privacy", "steps", "useBoundary",
      "episodeHash"])
      || record.schema !== CURATE_SCHEMAS.episode || record.schemaVersion !== "1.0.0"
      || !HASH.test(record.episodeHash ?? "") || !validUseBoundary(record.useBoundary)
      || !exactKeys(record.provenance, ["class", "verification", "stage05TraceBound"])
      || canonicalizeStrict(record.provenance) !== canonicalizeStrict(expectedProvenance())
      || !exactKeys(record.privacy, ["rawContentIncluded", "projection", "excluded"])
      || canonicalizeStrict(record.privacy) !== canonicalizeStrict(expectedPrivacy())) {
      return Object.freeze({ ok: false, error: "CURATE_EPISODE_INVALID" });
    }
    const rebuilt = normalizeCurateEpisode({
      schema: CURATE_SCHEMAS.episodeInput,
      source: record.source,
      instrument: record.instrument,
      episodeIdHash: record.episodeIdHash,
      platformClass: record.platformClass,
      steps: record.steps,
    });
    if (record.episodeHash !== rebuilt.episodeHash
      || canonicalizeStrict(record) !== canonicalizeStrict(rebuilt)
      || record.episodeHash !== domainDigest(CURATE_SCHEMAS.episode, episodeBody(record))) {
      return Object.freeze({ ok: false, error: "CURATE_EPISODE_HASH_MISMATCH" });
    }
    return Object.freeze({ ok: true, episodeHash: record.episodeHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

function validNonnegativeInteger(value, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

/*
 * Compatibility boundary for the acquisition adapter's aggregate DROID fact.
 * It is intentionally NOT converted into a normalized episode: a step count and
 * a few dimensions are not step evidence. The fact can be quarantined and
 * content-addressed, but cannot enter the per-step clearance Merkle tree.
 */
function verifyDroid100AggregateFact(fact) {
  if (!exactKeys(fact, ["schema", "adapterVersion", "source", "episode", "observations",
    "actions", "outcome", "privacy", "admissibility", "factHash"])
    || fact.schema !== "outsider/droid100-episode-fact/v1"
    || !TOKEN.test(fact.adapterVersion ?? "")
    || !HASH.test(fact.factHash ?? "")
    || !exactKeys(fact.source, ["manifestHash", "objectLeafHash", "shardIndex",
      "episodeOrdinal"])
    || !HASH.test(fact.source.manifestHash ?? "")
    || !HASH.test(fact.source.objectLeafHash ?? "")
    || !validNonnegativeInteger(fact.source.shardIndex, { maximum: 30 })
    || !validNonnegativeInteger(fact.source.episodeOrdinal)
    || !exactKeys(fact.episode, ["keyHash", "stepCount", "durationMs"])
    || !HASH.test(fact.episode.keyHash ?? "")
    || !validNonnegativeInteger(fact.episode.stepCount, { minimum: 1 })
    || !validNonnegativeInteger(fact.episode.durationMs)
    || !exactKeys(fact.observations, ["cameraStreamCount", "proprioceptionDimensions",
      "instructionPresent", "instructionHash"])
    || !validNonnegativeInteger(fact.observations.cameraStreamCount, { maximum: 1_000_000 })
    || !validNonnegativeInteger(fact.observations.proprioceptionDimensions,
      { maximum: 1_000_000 })
    || typeof fact.observations.instructionPresent !== "boolean"
    || (fact.observations.instructionPresent
      ? !HASH.test(fact.observations.instructionHash ?? "")
      : fact.observations.instructionHash !== null)
    || !exactKeys(fact.actions, ["dimensions"])
    || !validNonnegativeInteger(fact.actions.dimensions, { maximum: 1_000_000 })
    || !exactKeys(fact.outcome, ["success", "terminated", "truncated"])
    || Object.values(fact.outcome).some((value) => value !== null && typeof value !== "boolean")
    || !exactKeys(fact.privacy, ["rawImagesIncluded", "rawSensorBytesIncluded",
      "sourcePathIncluded", "collectorIdentityIncluded", "instructionTextIncluded",
      "absoluteTimestampIncluded"])
    || Object.values(fact.privacy).some((value) => value !== false)
    || !exactKeys(fact.admissibility, ["stage15", "causalEvidence", "pricingEvidence",
      "guaranteeEvidence", "automaticLearningPromotion"])
    || fact.admissibility.stage15 !== "QUARANTINE_ONLY"
    || Object.entries(fact.admissibility)
      .some(([key, value]) => key !== "stage15" && value !== false)) {
    return false;
  }
  const { factHash, ...body } = fact;
  return factHash === canonicalDigest(body);
}

function corpusFactClearanceBody(fact) {
  return {
    schema: CURATE_SCHEMAS.corpusFactClearance,
    schemaVersion: "1.0.0",
    sourceFact: {
      schema: fact.schema,
      factHash: fact.factHash,
      manifestHash: fact.source.manifestHash,
      objectLeafHash: fact.source.objectLeafHash,
    },
    provenance: expectedProvenance(),
    disposition: "QUARANTINED",
    evidenceClass: "aggregate-metadata-only",
    summary: {
      stepCountDeclared: fact.episode.stepCount,
      durationMsDeclared: fact.episode.durationMs,
      actionDimensionsDeclared: fact.actions.dimensions,
      proprioceptionDimensionsDeclared: fact.observations.proprioceptionDimensions,
      cameraStreamCountDeclared: fact.observations.cameraStreamCount,
    },
    checks: [
      checkRecord("aggregate-fact-integrity", "PASS", "SOURCE_FACT_HASH_VERIFIED"),
      checkRecord("per-step-structure", "SKIPPED", "PER_STEP_EVIDENCE_NOT_AVAILABLE"),
      checkRecord("physical-consistency", "SKIPPED", "PER_STEP_EVIDENCE_NOT_AVAILABLE"),
      checkRecord("replay-detection", "SKIPPED", "PER_STEP_COMMITMENTS_NOT_AVAILABLE"),
      checkRecord("drift-measurement", "SKIPPED", "PER_STEP_FEATURES_NOT_AVAILABLE"),
    ],
    stepEvidenceAvailable: false,
    episodeClearanceEligible: false,
    checkpointEligible: false,
    causal: {
      causalClass: "observation",
      causalExperienceUnits: 0,
      fitToLearnRefusalCode: CURATE_REFUSALS.noProspectiveCausalDesign,
    },
    useBoundary: useBoundary(),
  };
}

export function registerCurateCorpusFact(fact) {
  if (!verifyDroid100AggregateFact(fact)) fail("CURATE_CORPUS_FACT_INVALID");
  return addressed(corpusFactClearanceBody(fact), "factClearanceHash",
    CURATE_SCHEMAS.corpusFactClearance);
}

export function verifyCurateCorpusFactClearance(clearance, { fact = null } = {}) {
  try {
    if (!exactKeys(clearance, ["schema", "schemaVersion", "sourceFact", "provenance",
      "disposition", "evidenceClass", "summary", "checks", "stepEvidenceAvailable",
      "episodeClearanceEligible", "checkpointEligible", "causal", "useBoundary",
      "factClearanceHash"])
      || clearance.schema !== CURATE_SCHEMAS.corpusFactClearance
      || clearance.schemaVersion !== "1.0.0"
      || !exactKeys(clearance.sourceFact, ["schema", "factHash", "manifestHash",
        "objectLeafHash"])
      || clearance.sourceFact.schema !== "outsider/droid100-episode-fact/v1"
      || [clearance.sourceFact.factHash, clearance.sourceFact.manifestHash,
        clearance.sourceFact.objectLeafHash, clearance.factClearanceHash]
        .some((value) => !HASH.test(value ?? ""))
      || canonicalizeStrict(clearance.provenance) !== canonicalizeStrict(expectedProvenance())
      || clearance.disposition !== "QUARANTINED"
      || clearance.evidenceClass !== "aggregate-metadata-only"
      || !exactKeys(clearance.summary, ["stepCountDeclared", "durationMsDeclared",
        "actionDimensionsDeclared", "proprioceptionDimensionsDeclared",
        "cameraStreamCountDeclared"])
      || Object.values(clearance.summary).some((value) => !validNonnegativeInteger(value))
      || !Array.isArray(clearance.checks) || clearance.checks.length !== 5
      || clearance.checks.some((item) => !validCheck(item))
      || clearance.stepEvidenceAvailable !== false
      || clearance.episodeClearanceEligible !== false
      || clearance.checkpointEligible !== false
      || !exactKeys(clearance.causal, ["causalClass", "causalExperienceUnits",
        "fitToLearnRefusalCode"])
      || clearance.causal.causalClass !== "observation"
      || clearance.causal.causalExperienceUnits !== 0
      || clearance.causal.fitToLearnRefusalCode
        !== CURATE_REFUSALS.noProspectiveCausalDesign
      || !validUseBoundary(clearance.useBoundary)) {
      return Object.freeze({ ok: false, error: "CURATE_CORPUS_FACT_CLEARANCE_INVALID" });
    }
    const { factClearanceHash, ...body } = clearance;
    if (factClearanceHash !== domainDigest(CURATE_SCHEMAS.corpusFactClearance, body)) {
      return Object.freeze({ ok: false, error: "CURATE_CORPUS_FACT_CLEARANCE_HASH_MISMATCH" });
    }
    let sourceFactVerified = false;
    if (fact !== null) {
      if (!verifyDroid100AggregateFact(fact)
        || canonicalizeStrict(registerCurateCorpusFact(fact))
          !== canonicalizeStrict(clearance)) {
        return Object.freeze({ ok: false, error: "CURATE_CORPUS_FACT_DERIVATION_MISMATCH" });
      }
      sourceFactVerified = true;
    }
    return Object.freeze({ ok: true, factClearanceHash, sourceFactVerified });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

function checkRecord(check, status, reason) {
  return Object.freeze({ check, status, reason });
}

function timeCheck(episode) {
  const times = episode.steps.map((step) => step.tOffsetMs);
  if (times.some((time) => time === null)) {
    return checkRecord("monotonic-time", "SKIPPED", "INCOMPLETE_MONOTONIC_TIMESTAMPS");
  }
  if (times.length < 2) {
    return checkRecord("monotonic-time", "SKIPPED", "INSUFFICIENT_MONOTONIC_TIMESTAMPS");
  }
  const regression = times.some((time, index) => index > 0 && time < times[index - 1]);
  return regression
    ? checkRecord("monotonic-time", "ALERT", "TIME_REGRESSION_OBSERVED")
    : checkRecord("monotonic-time", "PASS", "MONOTONIC_OFFSETS_OBSERVED");
}

function duplicateWithinCheck(episode) {
  const commitments = episodeCommitments(episode);
  if (commitments.length < 2) {
    return checkRecord("within-episode-duplicate", "SKIPPED",
      "INSUFFICIENT_OBSERVATION_COMMITMENTS");
  }
  return new Set(commitments).size === commitments.length
    ? checkRecord("within-episode-duplicate", "PASS", "NO_DUPLICATE_COMMITMENT_OBSERVED")
    : checkRecord("within-episode-duplicate", "ALERT",
      "DUPLICATE_OBSERVATION_COMMITMENT_OBSERVED");
}

function episodeCommitments(episode) {
  return episode.steps.flatMap((step) => [step.observation.commitment,
    ...step.observation.images.map((image) => image.commitment)]);
}

function verifyHistory(history) {
  if (!Array.isArray(history)) fail("CURATE_HISTORY_INVALID");
  const unique = new Map();
  for (const episode of history) {
    if (!verifyCurateEpisode(episode).ok) fail("CURATE_HISTORY_EPISODE_INVALID");
    if (unique.has(episode.episodeHash)) fail("CURATE_HISTORY_DUPLICATE_EPISODE");
    unique.set(episode.episodeHash, episode);
  }
  return [...unique.values()].sort((a, b) => a.episodeHash.localeCompare(b.episodeHash));
}

function replayObservation(episode, history) {
  if (history.length === 0) {
    return {
      check: checkRecord("cross-episode-replay", "SKIPPED", "NO_HISTORY_EPISODES"),
      episodeHashRepeated: false,
      repeatedCommitmentCount: 0,
      repeatedCommitments: [],
    };
  }
  const historyHashes = new Set(history.map((item) => item.episodeHash));
  const historyCommitments = new Set(history.flatMap(episodeCommitments));
  const repeatedCommitments = [...new Set(episodeCommitments(episode)
    .filter((commitment) => historyCommitments.has(commitment)))].sort();
  const episodeHashRepeated = historyHashes.has(episode.episodeHash);
  const alert = episodeHashRepeated || repeatedCommitments.length > 0;
  return {
    check: alert
      ? checkRecord("cross-episode-replay", "ALERT", "CROSS_EPISODE_REPLAY_OBSERVED")
      : checkRecord("cross-episode-replay", "PASS", "NO_CROSS_EPISODE_REPLAY_OBSERVED"),
    episodeHashRepeated,
    repeatedCommitmentCount: repeatedCommitments.length,
    repeatedCommitments,
  };
}

function observationFeatures(episodes) {
  const output = new Map();
  for (const episode of episodes) {
    for (const step of episode.steps) {
      for (const [feature, value] of Object.entries(step.observation.features)) {
        if (!output.has(feature)) output.set(feature, []);
        output.get(feature).push(value);
      }
    }
  }
  return output;
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function driftObservation(episode, history, threshold) {
  if (typeof threshold !== "number" || !Number.isFinite(threshold)
    || threshold < 0 || threshold > 2) fail("CURATE_DRIFT_THRESHOLD_INVALID");
  if (history.length === 0) {
    return {
      check: checkRecord("observation-mean-drift", "SKIPPED", "NO_BASELINE_EPISODES"),
      threshold,
      metrics: [],
      alertFeatures: [],
    };
  }
  const baseline = observationFeatures(history);
  const current = observationFeatures([episode]);
  const features = [...current.keys()].filter((key) => baseline.has(key)).sort();
  const metrics = features.map((feature) => {
    const baselineValues = baseline.get(feature);
    const currentValues = current.get(feature);
    const baselineMean = mean(baselineValues);
    const currentMean = mean(currentValues);
    const absoluteMeanShift = Math.abs(currentMean - baselineMean);
    const symmetricScale = Math.max(Math.abs(currentMean), Math.abs(baselineMean), 1);
    return {
      feature,
      baselineN: baselineValues.length,
      currentN: currentValues.length,
      baselineMean: round(baselineMean),
      currentMean: round(currentMean),
      absoluteMeanShift: round(absoluteMeanShift),
      normalizedMeanShift: round(absoluteMeanShift / symmetricScale),
    };
  });
  if (metrics.length === 0) {
    return {
      check: checkRecord("observation-mean-drift", "SKIPPED",
        "NO_COMPARABLE_NUMERIC_FEATURES"),
      threshold,
      metrics: [],
      alertFeatures: [],
    };
  }
  const alertFeatures = metrics.filter((metric) => metric.normalizedMeanShift > threshold)
    .map((metric) => metric.feature);
  return {
    check: alertFeatures.length
      ? checkRecord("observation-mean-drift", "ALERT", "MEAN_SHIFT_OBSERVED")
      : checkRecord("observation-mean-drift", "PASS", "NO_MEAN_SHIFT_ABOVE_THRESHOLD"),
    threshold,
    metrics,
    alertFeatures,
  };
}

function fixedSkippedChecks(episode) {
  return [
    checkRecord("platform-kinematics", "SKIPPED", episode.platformClass === null
      ? "PLATFORM_CLASS_NOT_DECLARED" : "PLATFORM_KINEMATIC_MODEL_NOT_REGISTERED"),
    checkRecord("sensor-cross-consistency", "SKIPPED",
      "STANDARDIZED_CROSS_SENSOR_FIELDS_NOT_PRESENT"),
    checkRecord("energy-balance", "SKIPPED", "STANDARDIZED_ENERGY_FIELDS_NOT_PRESENT"),
  ];
}

function fitToLearnBody(sourceEpisodeHash) {
  return {
    schema: CURATE_SCHEMAS.fitToLearnDecision,
    schemaVersion: "1.0.0",
    sourceEpisodeHash,
    requested: true,
    admitted: false,
    causalClass: "observation",
    causalExperienceUnits: 0,
    refusalCode: CURATE_REFUSALS.noProspectiveCausalDesign,
    basis: "historical-public-dataset observations do not establish prospective assignment, control, or intervention",
    useBoundary: useBoundary(),
  };
}

export function evaluateCurateFitToLearn(episode) {
  const checked = verifyCurateEpisode(episode);
  if (!checked.ok) fail(`CURATE_FIT_TO_LEARN_EPISODE_INVALID:${checked.error}`);
  const body = fitToLearnBody(episode.episodeHash);
  return addressed(body, "decisionHash", CURATE_SCHEMAS.fitToLearnDecision);
}

export function verifyCurateFitToLearnDecision(decision) {
  try {
    if (!exactKeys(decision, ["schema", "schemaVersion", "sourceEpisodeHash", "requested",
      "admitted", "causalClass", "causalExperienceUnits", "refusalCode", "basis",
      "useBoundary", "decisionHash"])
      || decision.schema !== CURATE_SCHEMAS.fitToLearnDecision
      || decision.schemaVersion !== "1.0.0"
      || !HASH.test(decision.sourceEpisodeHash ?? "")
      || !HASH.test(decision.decisionHash ?? "")
      || canonicalizeStrict(decision)
        !== canonicalizeStrict(addressed(fitToLearnBody(decision.sourceEpisodeHash),
          "decisionHash", CURATE_SCHEMAS.fitToLearnDecision))) {
      return Object.freeze({ ok: false, error: "CURATE_FIT_TO_LEARN_DECISION_INVALID" });
    }
    return Object.freeze({ ok: true, decisionHash: decision.decisionHash,
      refusalCode: decision.refusalCode });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

/** Clear one normalized episode without promoting or silently training on it. */
export function clearCurateEpisode(episode, {
  history = [], driftThreshold = CURATE_LIMITS.defaultDriftThreshold,
} = {}) {
  const verified = verifyCurateEpisode(episode);
  if (!verified.ok) fail(`CURATE_CLEARANCE_EPISODE_INVALID:${verified.error}`);
  const normalizedHistory = verifyHistory(history);
  const currentInstrumentHash = instrumentHash(episode.instrument);
  if (normalizedHistory.some((item) => instrumentHash(item.instrument)
    !== currentInstrumentHash)) {
    fail("CURATE_HISTORY_INSTRUMENT_MISMATCH");
  }
  const replay = replayObservation(episode, normalizedHistory);
  const drift = driftObservation(episode, normalizedHistory, driftThreshold);
  const checks = [
    checkRecord("strict-structure", "PASS", "NORMALIZED_SCHEMA_AND_BOUNDS_VERIFIED"),
    timeCheck(episode),
    duplicateWithinCheck(episode),
    replay.check,
    drift.check,
    ...fixedSkippedChecks(episode),
  ];
  const alertCodes = [...new Set(checks.filter((check) => check.status === "ALERT")
    .map((check) => check.reason))].sort();
  const fitToLearn = evaluateCurateFitToLearn(episode);
  const body = {
    schema: CURATE_SCHEMAS.clearance,
    schemaVersion: "1.0.0",
    sourceEpisodeHash: episode.episodeHash,
    instrument: structuredClone(episode.instrument),
    instrumentHash: instrumentHash(episode.instrument),
    historyEpisodeHashes: normalizedHistory.map((item) => item.episodeHash),
    provenance: expectedProvenance(),
    disposition: "QUARANTINED",
    reasonCodes: [...CLEARANCE_REASONS],
    structure: {
      stepCount: episode.steps.length,
      observationFeatureCount: new Set(episode.steps.flatMap((step) => (
        Object.keys(step.observation.features)
      ))).size,
      imageCommitmentCount: episode.steps.reduce((sum, step) => (
        sum + step.observation.images.length
      ), 0),
    },
    consistency: { checks, alertCodes },
    replay: {
      episodeHashRepeated: replay.episodeHashRepeated,
      repeatedCommitmentCount: replay.repeatedCommitmentCount,
      repeatedCommitments: replay.repeatedCommitments,
    },
    drift: {
      metric: "symmetric-relative-observation-mean-shift",
      threshold: drift.threshold,
      metrics: drift.metrics,
      alertFeatures: drift.alertFeatures,
      interpretation: "unlabelled-observed-alert-only",
      precisionRecallClaimed: false,
    },
    causal: {
      causalClass: "observation",
      learnEligibility: "hold-for-judgment",
      causalExperienceUnits: 0,
      fitToLearnDecisionHash: fitToLearn.decisionHash,
      fitToLearnRefusalCode: fitToLearn.refusalCode,
    },
    useBoundary: useBoundary(),
  };
  return addressed(body, "clearanceHash", CURATE_SCHEMAS.clearance);
}

function clearanceBody(clearance) {
  const { clearanceHash, ...body } = clearance;
  return body;
}

function validCheck(value) {
  return exactKeys(value, ["check", "status", "reason"])
    && TOKEN.test(value.check ?? "") && CHECK_STATUS.has(value.status)
    && TOKEN.test(value.reason ?? "");
}

function validMetric(value) {
  return exactKeys(value, ["feature", "baselineN", "currentN", "baselineMean",
    "currentMean", "absoluteMeanShift", "normalizedMeanShift"])
    && FEATURE.test(value.feature ?? "")
    && Number.isSafeInteger(value.baselineN) && value.baselineN > 0
    && Number.isSafeInteger(value.currentN) && value.currentN > 0
    && [value.baselineMean, value.currentMean, value.absoluteMeanShift,
      value.normalizedMeanShift].every((item) => typeof item === "number"
        && Number.isFinite(item))
    && value.absoluteMeanShift >= 0 && value.normalizedMeanShift >= 0
    && value.normalizedMeanShift <= 2;
}

function clearanceInternalConsistency(clearance) {
  const expectedCheckNames = [
    "strict-structure", "monotonic-time", "within-episode-duplicate",
    "cross-episode-replay", "observation-mean-drift", "platform-kinematics",
    "sensor-cross-consistency", "energy-balance",
  ];
  if (canonicalizeStrict(clearance.consistency.checks.map((item) => item.check))
      !== canonicalizeStrict(expectedCheckNames)) return false;
  const checks = new Map(clearance.consistency.checks.map((item) => [item.check, item]));
  if (canonicalizeStrict(checks.get("strict-structure")) !== canonicalizeStrict(
    checkRecord("strict-structure", "PASS", "NORMALIZED_SCHEMA_AND_BOUNDS_VERIFIED"))) {
    return false;
  }
  const platform = checks.get("platform-kinematics");
  if (platform.status !== "SKIPPED"
    || !["PLATFORM_CLASS_NOT_DECLARED", "PLATFORM_KINEMATIC_MODEL_NOT_REGISTERED"]
      .includes(platform.reason)
    || canonicalizeStrict(checks.get("sensor-cross-consistency"))
      !== canonicalizeStrict(checkRecord("sensor-cross-consistency", "SKIPPED",
        "STANDARDIZED_CROSS_SENSOR_FIELDS_NOT_PRESENT"))
    || canonicalizeStrict(checks.get("energy-balance"))
      !== canonicalizeStrict(checkRecord("energy-balance", "SKIPPED",
        "STANDARDIZED_ENERGY_FIELDS_NOT_PRESENT"))) return false;

  const expectedAlertCodes = [...new Set(clearance.consistency.checks
    .filter((item) => item.status === "ALERT").map((item) => item.reason))].sort();
  if (canonicalizeStrict(clearance.consistency.alertCodes)
    !== canonicalizeStrict(expectedAlertCodes)) return false;

  const repeated = clearance.replay.repeatedCommitments;
  if (canonicalizeStrict(repeated)
      !== canonicalizeStrict([...new Set(repeated)].sort())
    || clearance.replay.episodeHashRepeated
      !== clearance.historyEpisodeHashes.includes(clearance.sourceEpisodeHash)) return false;
  const replayCheck = checks.get("cross-episode-replay");
  const replayAlert = clearance.replay.episodeHashRepeated || repeated.length > 0;
  const expectedReplay = clearance.historyEpisodeHashes.length === 0
    ? checkRecord("cross-episode-replay", "SKIPPED", "NO_HISTORY_EPISODES")
    : replayAlert
      ? checkRecord("cross-episode-replay", "ALERT", "CROSS_EPISODE_REPLAY_OBSERVED")
      : checkRecord("cross-episode-replay", "PASS", "NO_CROSS_EPISODE_REPLAY_OBSERVED");
  if (canonicalizeStrict(replayCheck) !== canonicalizeStrict(expectedReplay)
    || clearance.historyEpisodeHashes.length === 0
      && (clearance.replay.episodeHashRepeated || repeated.length > 0)) return false;

  const metricFeatures = clearance.drift.metrics.map((item) => item.feature);
  if (canonicalizeStrict(metricFeatures) !== canonicalizeStrict([...metricFeatures].sort())
    || new Set(metricFeatures).size !== metricFeatures.length) return false;
  const expectedDriftAlerts = clearance.drift.metrics
    .filter((item) => item.normalizedMeanShift > clearance.drift.threshold)
    .map((item) => item.feature);
  if (canonicalizeStrict(clearance.drift.alertFeatures)
    !== canonicalizeStrict(expectedDriftAlerts)) return false;
  const driftCheck = checks.get("observation-mean-drift");
  let expectedDrift;
  if (clearance.historyEpisodeHashes.length === 0) {
    if (clearance.drift.metrics.length > 0) return false;
    expectedDrift = checkRecord("observation-mean-drift", "SKIPPED",
      "NO_BASELINE_EPISODES");
  } else if (clearance.drift.metrics.length === 0) {
    expectedDrift = checkRecord("observation-mean-drift", "SKIPPED",
      "NO_COMPARABLE_NUMERIC_FEATURES");
  } else if (expectedDriftAlerts.length > 0) {
    expectedDrift = checkRecord("observation-mean-drift", "ALERT", "MEAN_SHIFT_OBSERVED");
  } else {
    expectedDrift = checkRecord("observation-mean-drift", "PASS",
      "NO_MEAN_SHIFT_ABOVE_THRESHOLD");
  }
  return canonicalizeStrict(driftCheck) === canonicalizeStrict(expectedDrift);
}

export function verifyCurateClearance(clearance, { episode = null, history = null } = {}) {
  try {
    if (!exactKeys(clearance, ["schema", "schemaVersion", "sourceEpisodeHash", "instrument",
      "instrumentHash", "historyEpisodeHashes", "provenance", "disposition", "reasonCodes", "structure",
      "consistency", "replay", "drift", "causal", "useBoundary", "clearanceHash"])
      || clearance.schema !== CURATE_SCHEMAS.clearance
      || clearance.schemaVersion !== "1.0.0"
      || !HASH.test(clearance.sourceEpisodeHash ?? "")
      || canonicalizeStrict(clearance.instrument)
        !== canonicalizeStrict(normalizeInstrument(clearance.instrument))
      || clearance.instrumentHash !== instrumentHash(clearance.instrument)
      || !HASH.test(clearance.clearanceHash ?? "")
      || !Array.isArray(clearance.historyEpisodeHashes)
      || clearance.historyEpisodeHashes.some((item) => !HASH.test(item))
      || new Set(clearance.historyEpisodeHashes).size !== clearance.historyEpisodeHashes.length
      || canonicalizeStrict([...clearance.historyEpisodeHashes].sort())
        !== canonicalizeStrict(clearance.historyEpisodeHashes)
      || canonicalizeStrict(clearance.provenance) !== canonicalizeStrict(expectedProvenance())
      || clearance.disposition !== "QUARANTINED"
      || canonicalizeStrict(clearance.reasonCodes) !== canonicalizeStrict(CLEARANCE_REASONS)
      || !exactKeys(clearance.structure, ["stepCount", "observationFeatureCount",
        "imageCommitmentCount"])
      || !Number.isSafeInteger(clearance.structure.stepCount)
      || clearance.structure.stepCount < CURATE_LIMITS.minSteps
      || !Number.isSafeInteger(clearance.structure.observationFeatureCount)
      || clearance.structure.observationFeatureCount < 0
      || !Number.isSafeInteger(clearance.structure.imageCommitmentCount)
      || clearance.structure.imageCommitmentCount < 0
      || !exactKeys(clearance.consistency, ["checks", "alertCodes"])
      || !Array.isArray(clearance.consistency.checks)
      || clearance.consistency.checks.length !== 8
      || clearance.consistency.checks.some((item) => !validCheck(item))
      || !Array.isArray(clearance.consistency.alertCodes)
      || clearance.consistency.alertCodes.some((item) => !TOKEN.test(item))
      || canonicalizeStrict([...new Set(clearance.consistency.alertCodes)].sort())
        !== canonicalizeStrict(clearance.consistency.alertCodes)
      || !exactKeys(clearance.replay, ["episodeHashRepeated", "repeatedCommitmentCount",
        "repeatedCommitments"])
      || typeof clearance.replay.episodeHashRepeated !== "boolean"
      || !Number.isSafeInteger(clearance.replay.repeatedCommitmentCount)
      || clearance.replay.repeatedCommitmentCount < 0
      || !Array.isArray(clearance.replay.repeatedCommitments)
      || clearance.replay.repeatedCommitments.length
        !== clearance.replay.repeatedCommitmentCount
      || clearance.replay.repeatedCommitments.some((item) => !HASH.test(item))
      || !exactKeys(clearance.drift, ["metric", "threshold", "metrics", "alertFeatures",
        "interpretation", "precisionRecallClaimed"])
      || clearance.drift.metric !== "symmetric-relative-observation-mean-shift"
      || typeof clearance.drift.threshold !== "number"
      || !Number.isFinite(clearance.drift.threshold)
      || clearance.drift.threshold < 0 || clearance.drift.threshold > 2
      || !Array.isArray(clearance.drift.metrics)
      || clearance.drift.metrics.some((item) => !validMetric(item))
      || !Array.isArray(clearance.drift.alertFeatures)
      || clearance.drift.alertFeatures.some((item) => !FEATURE.test(item))
      || clearance.drift.interpretation !== "unlabelled-observed-alert-only"
      || clearance.drift.precisionRecallClaimed !== false
      || !exactKeys(clearance.causal, ["causalClass", "learnEligibility",
        "causalExperienceUnits", "fitToLearnDecisionHash", "fitToLearnRefusalCode"])
      || clearance.causal.causalClass !== "observation"
      || clearance.causal.learnEligibility !== "hold-for-judgment"
      || clearance.causal.causalExperienceUnits !== 0
      || !HASH.test(clearance.causal.fitToLearnDecisionHash ?? "")
      || clearance.causal.fitToLearnDecisionHash
        !== addressed(fitToLearnBody(clearance.sourceEpisodeHash), "decisionHash",
          CURATE_SCHEMAS.fitToLearnDecision).decisionHash
      || clearance.causal.fitToLearnRefusalCode
        !== CURATE_REFUSALS.noProspectiveCausalDesign
      || !validUseBoundary(clearance.useBoundary)
      || !clearanceInternalConsistency(clearance)
      || clearance.clearanceHash
        !== domainDigest(CURATE_SCHEMAS.clearance, clearanceBody(clearance))) {
      return Object.freeze({ ok: false, error: "CURATE_CLEARANCE_INVALID" });
    }
    let derivationsVerified = false;
    if (episode !== null || history !== null) {
      if (episode === null || !Array.isArray(history)) {
        return Object.freeze({ ok: false, error: "CURATE_CLEARANCE_DERIVATION_INPUT_INVALID" });
      }
      const rebuilt = clearCurateEpisode(episode, {
        history, driftThreshold: clearance.drift.threshold,
      });
      if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(clearance)) {
        return Object.freeze({ ok: false, error: "CURATE_CLEARANCE_DERIVATION_MISMATCH" });
      }
      derivationsVerified = true;
    }
    return Object.freeze({ ok: true, clearanceHash: clearance.clearanceHash,
      derivationsVerified });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

function leafNode(clearanceHash) {
  return domainDigest(MERKLE.leaf, clearanceHash);
}

function parentNode(left, right) {
  return domainDigest(MERKLE.node, { left, right });
}

function merkleRoot(clearanceHashes) {
  if (clearanceHashes.length === 0) return domainDigest(MERKLE.empty, "empty");
  let level = clearanceHashes.map(leafNode);
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(parentNode(left, right));
    }
    level = next;
  }
  return level[0];
}

function canonicalClearances(clearances) {
  if (!Array.isArray(clearances)) fail("CURATE_CLEARANCE_SET_INVALID");
  for (const clearance of clearances) {
    if (!verifyCurateClearance(clearance).ok) fail("CURATE_CLEARANCE_SET_MEMBER_INVALID");
  }
  const sorted = [...clearances].sort((a, b) => a.clearanceHash.localeCompare(b.clearanceHash));
  if (new Set(sorted.map((item) => item.clearanceHash)).size !== sorted.length) {
    fail("CURATE_CHECKPOINT_DUPLICATE_CLEARANCE");
  }
  if (new Set(sorted.map((item) => item.sourceEpisodeHash)).size !== sorted.length) {
    fail("CURATE_CHECKPOINT_DUPLICATE_SOURCE_EPISODE");
  }
  if (new Set(sorted.map((item) => item.instrumentHash)).size > 1) {
    fail("CURATE_CHECKPOINT_MIXED_INSTRUMENTS");
  }
  return sorted;
}

function checkpointBody(checkpoint) {
  const { checkpointHash, ...body } = checkpoint;
  return body;
}

export function buildCurateCheckpoint(clearances, { checkpointId = "curate-checkpoint" } = {}) {
  token(checkpointId, "CURATE_CHECKPOINT_ID_INVALID");
  const sorted = canonicalClearances(clearances);
  const clearanceHashes = sorted.map((item) => item.clearanceHash);
  const body = {
    schema: CURATE_SCHEMAS.checkpoint,
    schemaVersion: "1.0.0",
    checkpointId,
    treeSize: sorted.length,
    instrumentHash: sorted[0]?.instrumentHash ?? null,
    merkleRoot: merkleRoot(clearanceHashes),
    clearanceSetHash: domainDigest("outsider/curate-clearance-set/v1", clearanceHashes),
    composition: {
      quarantined: sorted.length,
      historicalPublicDataset: sorted.length,
      declaredUnverified: sorted.length,
    },
    causalExperienceUnits: 0,
    useBoundary: useBoundary(),
  };
  return addressed(body, "checkpointHash", CURATE_SCHEMAS.checkpoint);
}

export function verifyCurateCheckpoint(checkpoint, { clearances = null } = {}) {
  try {
    if (!exactKeys(checkpoint, ["schema", "schemaVersion", "checkpointId", "treeSize",
      "instrumentHash", "merkleRoot", "clearanceSetHash", "composition", "causalExperienceUnits",
      "useBoundary", "checkpointHash"])
      || checkpoint.schema !== CURATE_SCHEMAS.checkpoint
      || checkpoint.schemaVersion !== "1.0.0"
      || !TOKEN.test(checkpoint.checkpointId ?? "")
      || !Number.isSafeInteger(checkpoint.treeSize) || checkpoint.treeSize < 0
      || checkpoint.treeSize === 0 && checkpoint.instrumentHash !== null
      || checkpoint.treeSize > 0 && !HASH.test(checkpoint.instrumentHash ?? "")
      || !HASH.test(checkpoint.merkleRoot ?? "")
      || !HASH.test(checkpoint.clearanceSetHash ?? "")
      || !HASH.test(checkpoint.checkpointHash ?? "")
      || !exactKeys(checkpoint.composition, ["quarantined", "historicalPublicDataset",
        "declaredUnverified"])
      || Object.values(checkpoint.composition).some((item) => !Number.isSafeInteger(item)
        || item < 0 || item !== checkpoint.treeSize)
      || checkpoint.causalExperienceUnits !== 0
      || !validUseBoundary(checkpoint.useBoundary)
      || checkpoint.checkpointHash
        !== domainDigest(CURATE_SCHEMAS.checkpoint, checkpointBody(checkpoint))) {
      return Object.freeze({ ok: false, error: "CURATE_CHECKPOINT_INVALID" });
    }
    let recordsVerified = false;
    if (clearances !== null) {
      const rebuilt = buildCurateCheckpoint(clearances, { checkpointId: checkpoint.checkpointId });
      if (canonicalizeStrict(rebuilt) !== canonicalizeStrict(checkpoint)) {
        return Object.freeze({ ok: false, error: "CURATE_CHECKPOINT_RECORD_SET_MISMATCH" });
      }
      recordsVerified = true;
    }
    return Object.freeze({ ok: true, checkpointHash: checkpoint.checkpointHash,
      recordsVerified });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}

function proofBody(proof) {
  const { proofHash, ...body } = proof;
  return body;
}

export function createCurateInclusionProof(clearances, clearanceHash, checkpoint) {
  const sorted = canonicalClearances(clearances);
  if (!verifyCurateCheckpoint(checkpoint, { clearances: sorted }).ok) {
    fail("CURATE_PROOF_CHECKPOINT_INVALID");
  }
  hash(clearanceHash, "CURATE_PROOF_CLEARANCE_HASH_INVALID");
  const clearanceIndex = sorted.findIndex((item) => item.clearanceHash === clearanceHash);
  if (clearanceIndex < 0) fail("CURATE_PROOF_CLEARANCE_NOT_FOUND");
  let index = clearanceIndex;
  let level = sorted.map((item) => leafNode(item.clearanceHash));
  const siblings = [];
  while (level.length > 1) {
    const isRight = index % 2 === 1;
    const siblingIndex = isRight ? index - 1 : index + 1;
    siblings.push({ side: isRight ? "left" : "right",
      hash: level[siblingIndex] ?? level[index] });
    const next = [];
    for (let cursor = 0; cursor < level.length; cursor += 2) {
      const left = level[cursor];
      const right = level[cursor + 1] ?? left;
      next.push(parentNode(left, right));
    }
    level = next;
    index = Math.floor(index / 2);
  }
  const body = {
    schema: CURATE_SCHEMAS.inclusionProof,
    schemaVersion: "1.0.0",
    checkpointHash: checkpoint.checkpointHash,
    merkleRoot: checkpoint.merkleRoot,
    treeSize: checkpoint.treeSize,
    leafIndex: clearanceIndex,
    clearanceHash,
    leafHash: leafNode(clearanceHash),
    siblings,
  };
  return addressed(body, "proofHash", CURATE_SCHEMAS.inclusionProof);
}

export function verifyCurateInclusionProof(proof, { checkpoint, clearance = null } = {}) {
  try {
    if (!exactKeys(proof, ["schema", "schemaVersion", "checkpointHash", "merkleRoot",
      "treeSize", "leafIndex", "clearanceHash", "leafHash", "siblings", "proofHash"])
      || proof.schema !== CURATE_SCHEMAS.inclusionProof
      || proof.schemaVersion !== "1.0.0"
      || !HASH.test(proof.checkpointHash ?? "") || !HASH.test(proof.merkleRoot ?? "")
      || !HASH.test(proof.clearanceHash ?? "") || !HASH.test(proof.leafHash ?? "")
      || !HASH.test(proof.proofHash ?? "")
      || !Number.isSafeInteger(proof.treeSize) || proof.treeSize < 1
      || !Number.isSafeInteger(proof.leafIndex) || proof.leafIndex < 0
      || proof.leafIndex >= proof.treeSize
      || !Array.isArray(proof.siblings)
      || proof.siblings.some((item) => !exactKeys(item, ["side", "hash"])
        || !["left", "right"].includes(item.side) || !HASH.test(item.hash ?? ""))
      || proof.leafHash !== leafNode(proof.clearanceHash)
      || proof.proofHash
        !== domainDigest(CURATE_SCHEMAS.inclusionProof, proofBody(proof))
      || !verifyCurateCheckpoint(checkpoint).ok
      || checkpoint.checkpointHash !== proof.checkpointHash
      || checkpoint.merkleRoot !== proof.merkleRoot
      || checkpoint.treeSize !== proof.treeSize) {
      return Object.freeze({ ok: false, error: "CURATE_PROOF_INVALID" });
    }
    if (clearance !== null && (!verifyCurateClearance(clearance).ok
      || clearance.clearanceHash !== proof.clearanceHash)) {
      return Object.freeze({ ok: false, error: "CURATE_PROOF_CLEARANCE_MISMATCH" });
    }
    let current = proof.leafHash;
    let index = proof.leafIndex;
    let size = proof.treeSize;
    let cursor = 0;
    while (size > 1) {
      const sibling = proof.siblings[cursor];
      if (!sibling) return Object.freeze({ ok: false, error: "CURATE_PROOF_TOO_SHORT" });
      const expectedSide = index % 2 === 1 ? "left" : "right";
      if (sibling.side !== expectedSide) {
        return Object.freeze({ ok: false, error: "CURATE_PROOF_SIDE_MISMATCH" });
      }
      if (expectedSide === "right" && index + 1 >= size && sibling.hash !== current) {
        return Object.freeze({ ok: false, error: "CURATE_PROOF_ODD_DUPLICATE_INVALID" });
      }
      current = expectedSide === "left"
        ? parentNode(sibling.hash, current) : parentNode(current, sibling.hash);
      index = Math.floor(index / 2);
      size = Math.ceil(size / 2);
      cursor += 1;
    }
    if (cursor !== proof.siblings.length || current !== proof.merkleRoot) {
      return Object.freeze({ ok: false, error: "CURATE_PROOF_ROOT_MISMATCH" });
    }
    return Object.freeze({ ok: true, checkpointHash: proof.checkpointHash,
      clearanceHash: proof.clearanceHash, leafIndex: proof.leafIndex });
  } catch (error) {
    return Object.freeze({ ok: false, error: error?.message ?? String(error) });
  }
}
