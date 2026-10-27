/*
 * Cross-dataset public evidence evaluation.
 *
 * The public constructor is intentionally low-trust: hashes prove internal
 * consistency, not source derivation. Formal evaluation admits only objects
 * minted in-process by a full-source replay bridge. Detector outputs are not
 * imported from datasets; until a preregistered, label-blind runner exists,
 * every detector assessment ABSTAINS.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { canonicalizeStrict } from "./canonical.js";
import {
  PUBLIC_AGENT_PINS,
  publicAgentDigest,
  verifyPublicAgentAcquisitionManifest,
  verifyPublicAgentRecord,
  verifyPublicAgentRecordSet,
} from "./outsider-public-agent-corpus.js";
import { verifyPublicAgentArtifactsAgainstSource }
  from "./outsider-public-agent-artifacts.js";
import {
  PUBLIC_AGENT_WAVE2_CANONICAL_GENERATED_AT,
  PUBLIC_AGENT_WAVE2_PINS,
  verifyPublicAgentWave2Manifest,
  verifyPublicAgentWave2Record,
  verifyPublicAgentWave2RecordSet,
  verifyPublicAgentWave2Source,
} from "./outsider-public-agent-wave2.js";
import {
  convertBotFailsPilot,
  convertUr5FailExecution,
  verifyPublicRoboticsRecord,
  verifyPublicRoboticsRecordSetAgainstSource,
} from "./outsider-public-robotics-adapter.js";

export const CROSS_DATASET_EVAL_SCHEMAS = Object.freeze({
  unit: "outsider/cross-dataset-evaluation-unit/v3",
  report: "outsider/cross-dataset-evaluation-report/v3",
  agentReplay: "outsider/public-agent-full-source-replay/v1",
});

export const CROSS_DATASET_SOURCE_CLASSES = Object.freeze([
  "ORGANIC_AGENT_USE",
  "CONTROLLED_AGENT_BENCHMARK",
  "AUTONOMOUS_ROBOT_EXECUTION",
  "TELEOPERATED_ROBOT_EXECUTION",
  "MIXED_ROBOT_EXECUTION",
]);

export const CROSS_DATASET_TRUTH_TARGETS = Object.freeze([
  "USER_DISSATISFACTION",
  "TASK_FAILURE",
  "EXECUTION_ANOMALY",
  "RECOVERY_AFTER_FAILURE",
]);

const QUALIFIED_BASES = Object.freeze({
  USER_DISSATISFACTION: new Set(["DIRECT_USER_FEEDBACK"]),
  TASK_FAILURE: new Set([
    "HUMAN_REVIEWED_TASK_OUTCOME",
    "EXECUTABLE_TEST_OUTCOME",
    "HUMAN_REVIEWED_ROBOT_EXECUTION_OUTCOME",
  ]),
  EXECUTION_ANOMALY: new Set(["HUMAN_ANNOTATED_EXECUTION_ANOMALY"]),
  RECOVERY_AFTER_FAILURE: new Set([
    "HUMAN_REVIEWED_RECOVERY_OUTCOME",
    "EXECUTABLE_RECOVERY_OUTCOME",
    "PROSPECTIVE_SIGNED_RECOVERY_CHAIN",
  ]),
});

const ACCEPTED_BASES = new Set([
  ...Object.values(QUALIFIED_BASES).flatMap((values) => [...values]),
  "UNVERIFIED_DATASET_DECLARATION",
  "NO_OUTCOME_LABEL",
]);
const SOURCE_CLASSES = new Set(CROSS_DATASET_SOURCE_CLASSES);
const TARGETS = new Set(CROSS_DATASET_TRUTH_TARGETS);
const TRUST_CLASSES = new Set([
  "SELF_ASSERTED_UNTRUSTED",
  "CALLER_ASSERTED_REPLAY",
  "FULL_SOURCE_REPLAY_BOUND",
]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const TRUSTED_UNITS = new WeakSet();

function fail(code) { throw new Error(`CROSS_DATASET_EVAL_${code}`); }

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value
    : typeof value === "string" ? value : canonicalizeStrict(value);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function implementationHash(relativePath) {
  return digest(readFileSync(new URL(relativePath, import.meta.url)));
}

export const CROSS_DATASET_BRIDGE_DESCRIPTORS = Object.freeze({
  publicAgent: Object.freeze({
    id: "outsider-public-agent-caller-replay-intake",
    version: "1.0.0",
    implementationHash: digest({
      canonicalizer: implementationHash("./canonical.js"),
      corpus: implementationHash("./outsider-public-agent-corpus.js"),
    }),
  }),
  publicAgentSource: Object.freeze({
    id: "outsider-public-agent-directory-full-source-bridge",
    version: "1.0.0",
    implementationHash: digest({
      canonicalizer: implementationHash("./canonical.js"),
      corpus: implementationHash("./outsider-public-agent-corpus.js"),
      artifactVerifier: implementationHash("./outsider-public-agent-artifacts.js"),
    }),
  }),
  publicAgentWave2Source: Object.freeze({
    id: "outsider-public-agent-wave2-full-source-bridge",
    version: "1.0.0",
    implementationHash: digest({
      canonicalizer: implementationHash("./canonical.js"),
      artifactVerifier: implementationHash("./outsider-public-agent-artifacts.js"),
      wave2Verifier: implementationHash("./outsider-public-agent-wave2.js"),
    }),
  }),
  publicRobotics: Object.freeze({
    id: "outsider-public-robotics-full-source-bridge",
    version: "1.0.0",
    implementationHash: digest({
      canonicalizer: implementationHash("./canonical.js"),
      adapter: implementationHash("./outsider-public-robotics-adapter.js"),
    }),
  }),
});

function exactKeys(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function token(value, code) {
  if (typeof value !== "string" || !TOKEN.test(value)) fail(code);
  return value;
}

function hash(value, code, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== "string" || !HASH.test(value)) fail(code);
  return value;
}

function sortedUniqueHashes(value, code, { allowEmpty = false } = {}) {
  if (!Array.isArray(value) || !allowEmpty && value.length === 0 || value.length > 64
    || value.some((item) => !HASH.test(String(item ?? "")))) fail(code);
  const sorted = [...new Set(value)].sort();
  if (sorted.length !== value.length) fail(code);
  return sorted;
}

function normalizeDataset(value) {
  if (!exactKeys(value, ["id", "revision", "revisionRoot", "licenseId", "sourceClass"])) {
    fail("DATASET_SHAPE_INVALID");
  }
  if (!SOURCE_CLASSES.has(value.sourceClass)) fail("SOURCE_CLASS_INVALID");
  return {
    id: token(value.id, "DATASET_ID_INVALID"),
    revision: token(value.revision, "DATASET_REVISION_INVALID"),
    revisionRoot: hash(value.revisionRoot, "DATASET_REVISION_ROOT_INVALID"),
    licenseId: token(value.licenseId, "DATASET_LICENSE_INVALID"),
    sourceClass: value.sourceClass,
  };
}

function normalizeTruthLabels(value) {
  if (!Array.isArray(value) || value.length > CROSS_DATASET_TRUTH_TARGETS.length) {
    fail("TRUTH_LABELS_INVALID");
  }
  const seen = new Set();
  return value.map((label) => {
    if (!exactKeys(label, ["target", "value", "basis", "labelRoot"])
      || !TARGETS.has(label.target) || typeof label.value !== "boolean"
      || !ACCEPTED_BASES.has(label.basis)) fail("TRUTH_LABEL_INVALID");
    if (seen.has(label.target)) fail("TRUTH_TARGET_DUPLICATED");
    seen.add(label.target);
    return { target: label.target, value: label.value, basis: label.basis,
      labelRoot: hash(label.labelRoot, "TRUTH_LABEL_ROOT_INVALID") };
  }).sort((left, right) => left.target.localeCompare(right.target));
}

function detectorProfile(output) {
  return { detectorId: output.detectorId, detectorVersion: output.detectorVersion,
    implementationHash: output.implementationHash, target: output.target };
}

function normalizeDetectorOutputs(value) {
  if (!Array.isArray(value) || value.length > 64) fail("DETECTOR_OUTPUTS_INVALID");
  const seen = new Set();
  return value.map((output) => {
    if (!exactKeys(output, ["detectorId", "detectorVersion", "implementationHash",
      "target", "prediction", "score"])
      || !TARGETS.has(output.target) || typeof output.prediction !== "boolean"
      || output.score !== null && (typeof output.score !== "number"
        || !Number.isFinite(output.score) || output.score < 0 || output.score > 1)) {
      fail("DETECTOR_OUTPUT_INVALID");
    }
    const normalized = { detectorId: token(output.detectorId, "DETECTOR_ID_INVALID"),
      detectorVersion: token(output.detectorVersion, "DETECTOR_VERSION_INVALID"),
      implementationHash: hash(output.implementationHash,
        "DETECTOR_IMPLEMENTATION_HASH_INVALID"), target: output.target,
      prediction: output.prediction, score: output.score };
    const profileHash = digest(detectorProfile(normalized));
    if (seen.has(profileHash)) fail("DETECTOR_OUTPUT_DUPLICATED");
    seen.add(profileHash);
    return normalized;
  }).sort((left, right) =>
    digest(detectorProfile(left)).localeCompare(digest(detectorProfile(right))));
}

function normalizeSourceBinding(value) {
  if (!exactKeys(value, ["trustClass", "sourceRecordHash", "sourceManifestHash",
    "adapterId", "adapterVersion", "adapterImplementationHash", "labelDerivation"])
    || !TRUST_CLASSES.has(value.trustClass)) fail("SOURCE_BINDING_INVALID");
  const trusted = value.trustClass === "FULL_SOURCE_REPLAY_BOUND";
  return {
    trustClass: value.trustClass,
    sourceRecordHash: hash(value.sourceRecordHash, "SOURCE_RECORD_HASH_INVALID",
      { nullable: !trusted }),
    sourceManifestHash: hash(value.sourceManifestHash, "SOURCE_MANIFEST_HASH_INVALID",
      { nullable: !trusted }),
    adapterId: token(value.adapterId, "ADAPTER_ID_INVALID"),
    adapterVersion: token(value.adapterVersion, "ADAPTER_VERSION_INVALID"),
    adapterImplementationHash: hash(value.adapterImplementationHash,
      "ADAPTER_IMPLEMENTATION_HASH_INVALID"),
    labelDerivation: token(value.labelDerivation, "LABEL_DERIVATION_INVALID"),
  };
}

function fixedBoundary() {
  return { authority: "none", causalEffectUnits: 0, establishesLossOrLiability: false,
    pricingEligible: false, automaticTrainingPromotion: false };
}

function crossDatasetUnitId(datasetId, nativeIdHash) {
  return digest({ datasetId, nativeIdHash });
}

function normalizedUnitBody(input) {
  return {
    schema: CROSS_DATASET_EVAL_SCHEMAS.unit,
    schemaVersion: "3.0.0",
    dataset: normalizeDataset(input.dataset),
    unitIdHash: hash(input.unitIdHash, "UNIT_ID_HASH_INVALID"),
    sourceRowCount: Number.isSafeInteger(input.sourceRowCount) && input.sourceRowCount > 0
      ? input.sourceRowCount : fail("SOURCE_ROW_COUNT_INVALID"),
    correlationRoots: sortedUniqueHashes(input.correlationRoots,
      "CORRELATION_ROOTS_INVALID"),
    truthLabels: normalizeTruthLabels(input.truthLabels),
    detectorOutputs: normalizeDetectorOutputs(input.detectorOutputs),
    sourceBinding: normalizeSourceBinding(input.sourceBinding),
    evidenceBoundary: fixedBoundary(),
  };
}

function sealUnit(input, { trusted = false } = {}) {
  const body = normalizedUnitBody(input);
  const unit = deepFreeze({ ...body, unitHash: digest(body) });
  if (trusted) TRUSTED_UNITS.add(unit);
  return unit;
}

/**
 * Low-level construction is useful for schema fixtures and adapter development.
 * It cannot create evidence eligible for formal evaluation.
 */
export function createCrossDatasetEvaluationUnit(input) {
  if (!exactKeys(input, ["dataset", "unitIdHash", "sourceRowCount", "correlationRoots",
    "truthLabels", "detectorOutputs"])) fail("UNIT_INPUT_SHAPE_INVALID");
  return sealUnit({ ...input, sourceBinding: {
    trustClass: "SELF_ASSERTED_UNTRUSTED", sourceRecordHash: null, sourceManifestHash: null,
    adapterId: "untrusted-caller", adapterVersion: "0.0.0",
    adapterImplementationHash: digest("outsider/cross-dataset/untrusted-caller/v1"),
    labelDerivation: "SELF_ASSERTED_UNVERIFIED",
  } });
}

export function verifyCrossDatasetEvaluationUnit(unit) {
  try {
    if (!exactKeys(unit, ["schema", "schemaVersion", "dataset", "unitIdHash",
      "sourceRowCount", "correlationRoots", "truthLabels", "detectorOutputs",
      "sourceBinding", "evidenceBoundary", "unitHash"])
      || unit.schema !== CROSS_DATASET_EVAL_SCHEMAS.unit || unit.schemaVersion !== "3.0.0") {
      return Object.freeze({ ok: false, error: "CROSS_DATASET_EVAL_UNIT_SHAPE_INVALID" });
    }
    const body = normalizedUnitBody(unit);
    if (!same({ ...body, unitHash: digest(body) }, unit)) {
      return Object.freeze({ ok: false, error: "CROSS_DATASET_EVAL_UNIT_HASH_INVALID" });
    }
    return Object.freeze({ ok: true, unitHash: unit.unitHash,
      trustClass: unit.sourceBinding.trustClass,
      bridgeRegistered: TRUSTED_UNITS.has(unit) });
  } catch (error) {
    return Object.freeze({ ok: false, error: error.message });
  }
}

function manifestSource(manifest, datasetId) {
  return manifest.sources.find((source) => source.id === datasetId) ?? null;
}

function exactAgentBoundary(value) {
  return same(value, { disposition: "QUARANTINED_RESEARCH_ONLY",
    economicLossObserved: false, lossMinorUnits: null, currency: null,
    exposureDenominatorObserved: false, automaticTraining: false,
    permits: { PRICE: false, GUARANTEE: false, SETTLE: false } });
}

function agentTruth(record) {
  const value = record.labels.nativeOutcomeValue;
  if (record.dataset.id === PUBLIC_AGENT_PINS.openhandsFeedback.id
    && ["positive", "negative"].includes(value)) {
    return { labels: [{ target: "USER_DISSATISFACTION", value: value === "negative",
      basis: "DIRECT_USER_FEEDBACK", labelRoot: digest({ recordHash: record.recordHash,
        nativeOutcomeKind: record.labels.nativeOutcomeKind, value }) }],
    derivation: "DIRECT_USER_FEEDBACK_ENUM_TO_DISSATISFACTION" };
  }
  if (record.dataset.id === PUBLIC_AGENT_PINS.computerAgentArena.id
    && typeof value === "boolean") {
    return { labels: [{ target: "TASK_FAILURE", value: !value,
      basis: "HUMAN_REVIEWED_TASK_OUTCOME", labelRoot: digest({
        recordHash: record.recordHash, nativeOutcomeKind: record.labels.nativeOutcomeKind,
        value }) }], derivation: "HUMAN_CORRECTNESS_TO_TASK_FAILURE" };
  }
  if (record.dataset.id === PUBLIC_AGENT_PINS.nebiusOpenHands.id
    && typeof value === "boolean") {
    return { labels: [{ target: "TASK_FAILURE", value: !value,
      basis: "EXECUTABLE_TEST_OUTCOME", labelRoot: digest({ recordHash: record.recordHash,
        nativeOutcomeKind: record.labels.nativeOutcomeKind, value }) }],
    derivation: "BENCHMARK_RESOLVED_TO_TASK_FAILURE" };
  }
  return { labels: [], derivation: "NO_QUALIFIED_OUTCOME_LABEL" };
}

const AGENT_SOURCE_CLASS = Object.freeze({
  [PUBLIC_AGENT_PINS.openhandsFeedback.id]: "ORGANIC_AGENT_USE",
  [PUBLIC_AGENT_PINS.computerAgentArena.id]: "CONTROLLED_AGENT_BENCHMARK",
  [PUBLIC_AGENT_PINS.traceLab.id]: "ORGANIC_AGENT_USE",
  [PUBLIC_AGENT_PINS.nebiusOpenHands.id]: "CONTROLLED_AGENT_BENCHMARK",
});

function agentSourceRowCount(record) {
  if (record.dataset.id !== PUBLIC_AGENT_PINS.traceLab.id) return 1;
  const rounds = record.episode?.stepCount;
  if (!Number.isSafeInteger(rounds) || rounds < 1) {
    fail("AGENT_TRACELAB_SOURCE_ROW_COUNT_INVALID");
  }
  return rounds;
}

function strictAgentRecord(record, manifest, replay) {
  const pin = Object.values(PUBLIC_AGENT_PINS).find((candidate) =>
    candidate.id === record?.dataset?.id);
  const source = pin && manifestSource(manifest, pin.id);
  if (!pin || !source || !verifyPublicAgentRecord(record, { manifest }).ok
    || record.dataset.revision !== pin.revision || record.dataset.licenseId !== pin.licenseId
    || record.dataset.sourceClass !== pin.sourceClass
    || !exactAgentBoundary(record.useBoundary)
    || !same(record.privacy, { rawContentIncluded: false,
      projection: "counts-labels-and-content-commitments-only" })
    || record.roots?.datasetRevisionRoot !== publicAgentDigest({ id: pin.id,
      revision: pin.revision }, "outsider/public-agent/dataset-revision-root/v1")
    || !Array.isArray(record.roots?.correlationRoots)
    || record.roots.correlationRoots.some((root) => !HASH.test(root))
    || !source.acquiredObjects.some((object) =>
      object.sha256 === record.dataset.sourceObjectHash)
    || !replay.verifiedSourceObjectHashes.includes(record.dataset.sourceObjectHash)) {
    fail("AGENT_RECORD_NOT_FULL_SOURCE_BOUND");
  }
  return pin;
}

function bridgeAgentRecords({ records, manifest, verifiedSourceObjectHashes,
  trustClass, descriptor, trusted }) {
  const seen = new Set();
  return records.map((record) => {
    strictAgentRecord(record, manifest, { verifiedSourceObjectHashes });
    const identity = `${record.dataset.id}\0${record.episode.nativeIdHash}`;
    if (seen.has(identity)) fail("AGENT_REPLAY_UNIT_DUPLICATED");
    seen.add(identity);
    const truth = agentTruth(record);
    return sealUnit({
      dataset: { id: record.dataset.id, revision: record.dataset.revision,
        revisionRoot: record.roots.datasetRevisionRoot, licenseId: record.dataset.licenseId,
        sourceClass: AGENT_SOURCE_CLASS[record.dataset.id] },
      unitIdHash: crossDatasetUnitId(record.dataset.id, record.episode.nativeIdHash),
      sourceRowCount: agentSourceRowCount(record),
      correlationRoots: record.roots.correlationRoots,
      truthLabels: truth.labels, detectorOutputs: [], sourceBinding: {
        trustClass, sourceRecordHash: record.recordHash,
        sourceManifestHash: manifest.manifestHash,
        adapterId: descriptor.id, adapterVersion: descriptor.version,
        adapterImplementationHash: descriptor.implementationHash,
        labelDerivation: truth.derivation,
      },
    }, { trusted });
  });
}

/**
 * Compatibility intake for caller-supplied replay output. Even if its hashes
 * and pinned manifest are internally valid, a callback can synthesize both the
 * rows and the assertion that it replayed them. Its units are therefore marked
 * CALLER_ASSERTED_REPLAY and cannot enter formal evaluation. Dataset-provided
 * detector outputs are discarded.
 */
export function bridgePublicAgentFullSourceReplay(fullSourceReplay) {
  if (typeof fullSourceReplay !== "function") fail("AGENT_REPLAY_CALLBACK_REQUIRED");
  const replay = fullSourceReplay();
  if (!exactKeys(replay, ["schema", "status", "manifest", "records",
    "verifiedSourceObjectHashes", "recordSetHash"])
    || replay.schema !== CROSS_DATASET_EVAL_SCHEMAS.agentReplay
    || replay.status !== "FULL_SOURCE_REPRODUCED"
    || !Array.isArray(replay.records) || replay.records.length === 0
    || !verifyPublicAgentAcquisitionManifest(replay.manifest).ok
    || replay.manifest.manifestHash == null
    || !Array.isArray(replay.verifiedSourceObjectHashes)) {
    fail("AGENT_REPLAY_INVALID");
  }
  const verifiedHashes = sortedUniqueHashes(replay.verifiedSourceObjectHashes,
    "AGENT_REPLAY_SOURCE_HASHES_INVALID");
  const verifiedSet = verifyPublicAgentRecordSet(replay.records, { manifest: replay.manifest });
  if (!verifiedSet.ok || replay.recordSetHash !== verifiedSet.recordSetHash) {
    fail("AGENT_REPLAY_RECORD_SET_HASH_INVALID");
  }
  const usedSourceHashes = [...new Set(replay.records.map((record) =>
    record.dataset.sourceObjectHash))].sort();
  if (!same(verifiedHashes, usedSourceHashes)) fail("AGENT_REPLAY_SOURCE_SET_INVALID");
  return bridgeAgentRecords({ records: replay.records, manifest: replay.manifest,
    verifiedSourceObjectHashes: verifiedHashes, trustClass: "CALLER_ASSERTED_REPLAY",
    descriptor: CROSS_DATASET_BRIDGE_DESCRIPTORS.publicAgent, trusted: false });
}

/**
 * The only trusted Agent bridge. The verifier accepts directories, re-reads
 * every pinned source byte, rederives all records, and exact-compares every
 * stored artifact before returning records to this function.
 */
export async function bridgePublicAgentSource({ sourceDirectory, artifactDirectory }) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length === 0
    || typeof artifactDirectory !== "string" || artifactDirectory.length === 0) {
    fail("AGENT_SOURCE_BRIDGE_INPUT_INVALID");
  }
  const replay = await verifyPublicAgentArtifactsAgainstSource(
    { sourceDirectory, artifactDirectory });
  if (!replay.ok || replay.status !== "FULL_SOURCE_REPRODUCED"
    || replay.attestation?.derivation !== "FULL_SOURCE_REDERIVED"
    || replay.attestation?.boundary?.economicLossRows !== 0
    || replay.attestation?.boundary?.pricingEligibleRows !== 0
    || replay.attestation?.boundary?.permitsPrice !== false
    || replay.attestation?.boundary?.permitsGuarantee !== false
    || replay.attestation?.boundary?.permitsSettle !== false
    || !Array.isArray(replay.records) || replay.records.length === 0
    || replay.recordSetProof?.recordSetHash !== replay.attestation?.recordSetHash
    || replay.manifest?.manifestHash !== replay.attestation?.manifestHash
    || !Array.isArray(replay.attestation?.verifiedSourceObjectHashes)) {
    fail("AGENT_FULL_SOURCE_REPLAY_INVALID");
  }
  const verifiedSourceObjectHashes = [...new Set(
    replay.attestation.verifiedSourceObjectHashes.map((object) => object.sha256),
  )].sort();
  sortedUniqueHashes(verifiedSourceObjectHashes, "AGENT_FULL_SOURCE_HASHES_INVALID");
  return bridgeAgentRecords({ records: replay.records, manifest: replay.manifest,
    verifiedSourceObjectHashes, trustClass: "FULL_SOURCE_REPLAY_BOUND",
    descriptor: CROSS_DATASET_BRIDGE_DESCRIPTORS.publicAgentSource, trusted: true });
}

function wave2Truth(record) {
  const value = record.labels.nativeOutcomeValue;
  const rootFor = (target) => digest({ recordHash: record.recordHash,
    datasetId: record.dataset.id, nativeOutcomeKind: record.labels.nativeOutcomeKind,
    provenance: record.labels.provenance, value, target });
  if (record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.atbenchCodex.id
    && record.labels.nativeOutcomeKind === "synthetic-benchmark-safety-verdict"
    && typeof value === "boolean") {
    return { labels: [{ target: "EXECUTION_ANOMALY", value: !value,
      basis: "UNVERIFIED_DATASET_DECLARATION", labelRoot: rootFor("EXECUTION_ANOMALY") }],
    derivation:
      "ATBENCH_CODEX_SYNTHETIC_SAFETY_VERDICT_TO_UNQUALIFIED_EXECUTION_ANOMALY" };
  }
  if (record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.atbenchClaw.id
    && record.labels.nativeOutcomeKind === "generated-benchmark-safety-verdict"
    && typeof value === "boolean") {
    return { labels: [{ target: "EXECUTION_ANOMALY", value: !value,
      basis: "UNVERIFIED_DATASET_DECLARATION", labelRoot: rootFor("EXECUTION_ANOMALY") }],
    derivation:
      "ATBENCH_CLAW_GENERATED_SAFETY_VERDICT_TO_UNQUALIFIED_EXECUTION_ANOMALY" };
  }
  if (record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.tau2Airline.id
    && record.labels.nativeOutcomeKind === "benchmark-harness-reward"
    && typeof value === "boolean") {
    return { labels: [{ target: "TASK_FAILURE", value: !value,
      basis: "UNVERIFIED_DATASET_DECLARATION", labelRoot: rootFor("TASK_FAILURE") }],
    derivation: "TAU2_HARNESS_REWARD_TO_UNQUALIFIED_TASK_FAILURE" };
  }
  if (record.dataset.id === PUBLIC_AGENT_WAVE2_PINS.matmAlfworld.id
    && record.labels.nativeOutcomeKind === "benchmark-environment-success"
    && typeof value === "boolean") {
    return { labels: [{ target: "TASK_FAILURE", value: !value,
      basis: "UNVERIFIED_DATASET_DECLARATION", labelRoot: rootFor("TASK_FAILURE") }],
    derivation: "MATM_ALFWORLD_SUCCESS_TO_UNQUALIFIED_TASK_FAILURE" };
  }
  return { labels: [], derivation: "NO_DATASET_NATIVE_OUTCOME_MAPPING" };
}

function strictWave2Record(record, manifest) {
  const pin = Object.values(PUBLIC_AGENT_WAVE2_PINS).find((candidate) =>
    candidate.id === record?.dataset?.id);
  const source = pin && manifestSource(manifest, pin.id);
  if (!pin || !source || !verifyPublicAgentWave2Record(record).ok
    || record.dataset.revision !== pin.revision || record.dataset.licenseId !== pin.licenseId
    || record.dataset.sourceClass !== pin.sourceClass
    || !exactAgentBoundary(record.useBoundary)
    || !same(record.privacy, { rawContentIncluded: false,
      projection: "counts-labels-and-content-commitments-only" })
    || !Array.isArray(record.roots?.correlationRoots)
    || record.roots.correlationRoots.length < 1
    || record.roots.correlationRoots.some((root) => !HASH.test(root))
    || record.dataset.sourceObjectHash !== source.upstreamObject.sha256
    || !source.acquiredObjects.some((object) =>
      object.sha256 === record.dataset.sourceObjectHash)) {
    fail("AGENT_WAVE2_RECORD_NOT_FULL_SOURCE_BOUND");
  }
  return pin;
}

/**
 * Trusted wave-2 bridge. It invokes the pinned byte-level source verifier in
 * process and deliberately discards dataset-provided detector-like fields.
 * Dataset-native outcomes remain explicitly unqualified declarations.
 */
export function bridgePublicAgentWave2Source({ sourceDirectory }) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length === 0) {
    fail("AGENT_WAVE2_SOURCE_BRIDGE_INPUT_INVALID");
  }
  const replay = verifyPublicAgentWave2Source(sourceDirectory,
    { generatedAt: PUBLIC_AGENT_WAVE2_CANONICAL_GENERATED_AT });
  const verifiedSet = verifyPublicAgentWave2RecordSet(replay.records,
    { manifest: replay.manifest });
  if (!verifyPublicAgentWave2Manifest(replay.manifest).ok || !verifiedSet.ok
    || verifiedSet.recordSetHash !== replay.recordSet?.recordSetHash
    || replay.verification?.status !== "FULL_SELECTED_SOURCE_OBJECTS_REPRODUCED"
    || replay.verification?.manifestHash !== replay.manifest.manifestHash
    || replay.verification?.recordSetHash !== replay.recordSet.recordSetHash
    || replay.verification?.records !== 1_474
    || replay.summary?.records !== 1_474 || replay.summary?.sourceRows !== 1_474
    || replay.summary?.correlationComponents !== 4
    || replay.verification?.trust?.byteIdentityVerified !== true
    || replay.verification?.trust?.pinnedRevisionTreeBound !== true
    || replay.verification?.trust?.licenseDeclarationBytesVerified !== true
    || replay.verification?.boundary?.causalExperienceUnits !== 0
    || replay.verification?.boundary?.economicLossRows !== 0
    || replay.verification?.boundary?.pricingEligibleRows !== 0
    || replay.verification?.boundary?.automaticTraining !== false
    || replay.verification?.boundary?.permits?.PRICE !== false
    || replay.verification?.boundary?.permits?.GUARANTEE !== false
    || replay.verification?.boundary?.permits?.SETTLE !== false) {
    fail("AGENT_WAVE2_FULL_SOURCE_REPLAY_INVALID");
  }
  const seen = new Set();
  return replay.records.map((record) => {
    strictWave2Record(record, replay.manifest);
    const identity = `${record.dataset.id}\0${record.episode.nativeIdHash}`;
    if (seen.has(identity)) fail("AGENT_WAVE2_REPLAY_UNIT_DUPLICATED");
    seen.add(identity);
    const truth = wave2Truth(record);
    return sealUnit({
      dataset: { id: record.dataset.id, revision: record.dataset.revision,
        revisionRoot: record.roots.datasetRevisionRoot, licenseId: record.dataset.licenseId,
        sourceClass: "CONTROLLED_AGENT_BENCHMARK" },
      unitIdHash: crossDatasetUnitId(record.dataset.id, record.episode.nativeIdHash),
      sourceRowCount: 1,
      correlationRoots: record.roots.correlationRoots,
      truthLabels: truth.labels,
      detectorOutputs: [],
      sourceBinding: {
        trustClass: "FULL_SOURCE_REPLAY_BOUND", sourceRecordHash: record.recordHash,
        sourceManifestHash: replay.manifest.manifestHash,
        adapterId: CROSS_DATASET_BRIDGE_DESCRIPTORS.publicAgentWave2Source.id,
        adapterVersion: CROSS_DATASET_BRIDGE_DESCRIPTORS.publicAgentWave2Source.version,
        adapterImplementationHash:
          CROSS_DATASET_BRIDGE_DESCRIPTORS.publicAgentWave2Source.implementationHash,
        labelDerivation: truth.derivation,
      },
    }, { trusted: true });
  });
}

function robotTruth(record) {
  if (record.truth.provenance === "MANUAL_SUBTASK_SUCCESS_LABEL"
    && ["SUBTASK_SUCCESS", "SUBTASK_FAILURE"].includes(record.truth.value)) {
    return { labels: [{ target: "TASK_FAILURE",
      value: record.truth.value === "SUBTASK_FAILURE",
      basis: "HUMAN_REVIEWED_ROBOT_EXECUTION_OUTCOME",
      labelRoot: digest({ recordHash: record.recordHash, value: record.truth.value,
        provenance: record.truth.provenance }) }],
    derivation: "MANUAL_SUBTASK_SUCCESS_TO_TASK_FAILURE" };
  }
  if (record.truth.provenance === "MANUAL_FRAME_ANOMALY_LABEL"
    && record.truth.frameLabels?.positiveCount > 0) {
    return { labels: [{ target: "EXECUTION_ANOMALY", value: true,
      basis: "HUMAN_ANNOTATED_EXECUTION_ANOMALY",
      labelRoot: digest({ recordHash: record.recordHash,
        sequenceHash: record.truth.frameLabels.sequenceHash }) }],
    derivation: "MANUAL_FRAME_SEQUENCE_TO_POSITIVE_ANOMALY" };
  }
  return { labels: [], derivation: "NO_QUALIFIED_OUTCOME_LABEL" };
}

function robotSourceClass(record) {
  if (record.collection.executionMode === "TELEOPERATION") {
    return "TELEOPERATED_ROBOT_EXECUTION";
  }
  if (record.collection.executionMode === "AUTONOMOUS_POLICY_EXECUTION") {
    return "AUTONOMOUS_ROBOT_EXECUTION";
  }
  fail("ROBOT_EXECUTION_MODE_UNSUPPORTED");
}

/** Full bytes are verified and records rederived inside the frozen adapter. */
export function bridgePublicRoboticsSource({ dataset, sourceDirectory }) {
  if (!exactKeys({ dataset, sourceDirectory }, ["dataset", "sourceDirectory"])
    || typeof sourceDirectory !== "string" || sourceDirectory.length === 0) {
    fail("ROBOT_BRIDGE_INPUT_INVALID");
  }
  const replay = dataset === "BOTFAILS" ? convertBotFailsPilot(sourceDirectory)
    : dataset === "UR5FAIL_EXECUTION" ? convertUr5FailExecution(sourceDirectory)
      : fail("ROBOT_DATASET_UNSUPPORTED");
  const fullSource = verifyPublicRoboticsRecordSetAgainstSource(replay.records,
    { manifest: replay.manifest, sourceDir: sourceDirectory, requireComplete: true });
  if (!fullSource.ok || fullSource.verificationLevel !== "FULL_SOURCE_REDERIVED"
    || fullSource.truthVerified !== true || fullSource.complete !== true) {
    fail("ROBOT_FULL_SOURCE_REPLAY_INVALID");
  }
  return replay.records.map((record) => {
    if (!verifyPublicRoboticsRecord(record).ok
      || record.dataset.manifestHash !== replay.manifest.manifestHash
      || record.detectorOutputs !== null) fail("ROBOT_RECORD_NOT_FULL_SOURCE_BOUND");
    const truth = robotTruth(record);
    const correlationRoots = Object.values(record.correlation);
    const sourceRowCount = record.truth.frameLabels?.frameCount ?? 1;
    return sealUnit({
      dataset: { id: record.dataset.id, revision: record.dataset.revision,
        revisionRoot: record.dataset.manifestHash, licenseId: record.dataset.licenseId,
        sourceClass: robotSourceClass(record) },
      unitIdHash: crossDatasetUnitId(record.dataset.id, record.recordIdHash),
      sourceRowCount, correlationRoots,
      truthLabels: truth.labels, detectorOutputs: [], sourceBinding: {
        trustClass: "FULL_SOURCE_REPLAY_BOUND", sourceRecordHash: record.recordHash,
        sourceManifestHash: replay.manifest.manifestHash,
        adapterId: CROSS_DATASET_BRIDGE_DESCRIPTORS.publicRobotics.id,
        adapterVersion: CROSS_DATASET_BRIDGE_DESCRIPTORS.publicRobotics.version,
        adapterImplementationHash:
          CROSS_DATASET_BRIDGE_DESCRIPTORS.publicRobotics.implementationHash,
        labelDerivation: truth.derivation,
      },
    }, { trusted: true });
  });
}

function componentCount(entries) {
  const parent = entries.map((_, index) => index);
  const find = (index) => parent[index] === index ? index
    : (parent[index] = find(parent[index]));
  const join = (left, right) => {
    const a = find(left), b = find(right);
    if (a !== b) parent[b] = a;
  };
  const roots = new Map();
  entries.forEach(({ unit }, index) => {
    for (const root of unit.correlationRoots) {
      if (roots.has(root)) join(index, roots.get(root));
      else roots.set(root, index);
    }
  });
  return new Set(entries.map((_, index) => find(index))).size;
}

function countBy(values) {
  return Object.fromEntries([...new Set(values)].sort().map((value) =>
    [value, values.filter((candidate) => candidate === value).length]));
}

function qualified(label) {
  return QUALIFIED_BASES[label.target]?.has(label.basis) === true;
}

const MINIMUM_TRUTH_CORRELATION_COMPONENTS = 5;

export const CROSS_DATASET_EVALUATOR_DESCRIPTOR = Object.freeze({
  id: "outsider-cross-dataset-evaluator",
  version: "3.0.0",
  implementationHash: digest({
    canonicalizer: implementationHash("./canonical.js"),
    evaluator: implementationHash("./outsider-cross-dataset-eval.js"),
  }),
  policyHash: digest({
    minimumTruthCorrelationComponents: MINIMUM_TRUTH_CORRELATION_COMPONENTS,
    qualifiedBases: Object.fromEntries(Object.entries(QUALIFIED_BASES)
      .map(([target, bases]) => [target, [...bases].sort()])),
    detectorRunnerRegistered: false,
    sourceRowsUsedAsIndependentSamples: false,
  }),
});

/**
 * Formal evaluation currently has no registered detector runner. Truth is
 * exposed only as evaluation readiness; no discrimination result can appear.
 */
export function evaluateCrossDatasetUnits(candidates = [], options = {}) {
  if (!Array.isArray(candidates) || !exactKeys(options, [])) fail("EVALUATION_INPUT_INVALID");
  const refused = [];
  const verified = [];
  let candidateSourceRowsObserved = 0;
  candidates.forEach((unit, inputIndex) => {
    if (Number.isSafeInteger(unit?.sourceRowCount) && unit.sourceRowCount > 0) {
      candidateSourceRowsObserved += unit.sourceRowCount;
    }
    const checked = verifyCrossDatasetEvaluationUnit(unit);
    if (!checked.ok) refused.push({ inputIndex, candidateHash: digest(unit), reason: checked.error });
    else if (!TRUSTED_UNITS.has(unit)) refused.push({ inputIndex, candidateHash: unit.unitHash,
      reason: unit.sourceBinding.trustClass === "FULL_SOURCE_REPLAY_BOUND"
        ? "UNREGISTERED_TRUST_ASSERTION" : unit.sourceBinding.trustClass });
    else if (unit.detectorOutputs.length !== 0) refused.push({ inputIndex,
      candidateHash: unit.unitHash, reason: "DATASET_DETECTOR_OUTPUT_FORBIDDEN" });
    else verified.push({ inputIndex, unit });
  });

  const byId = new Map();
  const conflicted = new Set();
  let exactDuplicatesCollapsed = 0;
  for (const entry of verified) {
    if (conflicted.has(entry.unit.unitIdHash)) continue;
    const previous = byId.get(entry.unit.unitIdHash);
    if (!previous) byId.set(entry.unit.unitIdHash, entry);
    else if (previous.unit.unitHash === entry.unit.unitHash) exactDuplicatesCollapsed++;
    else { byId.delete(entry.unit.unitIdHash); conflicted.add(entry.unit.unitIdHash); }
  }
  const accepted = [...byId.values()].sort((left, right) =>
    left.unit.unitIdHash.localeCompare(right.unit.unitIdHash));
  const components = componentCount(accepted);
  const truthReadiness = CROSS_DATASET_TRUTH_TARGETS.map((target) => {
    const entries = accepted.filter(({ unit }) => unit.truthLabels
      .some((label) => label.target === target && qualified(label)));
    const declared = accepted.flatMap(({ unit }) => unit.truthLabels
      .filter((label) => label.target === target));
    const qualifying = declared.filter(qualified);
    const classCounts = {
      negative: qualifying.filter((label) => label.value === false).length,
      positive: qualifying.filter((label) => label.value === true).length,
    };
    const correlationComponents = entries.length > 0 ? componentCount(entries) : 0;
    const decision = qualifying.length === 0 ? "ABSTAIN_NO_QUALIFYING_TRUTH"
      : classCounts.negative === 0 || classCounts.positive === 0
        ? "ABSTAIN_TRUTH_ONE_CLASS"
        : correlationComponents < MINIMUM_TRUTH_CORRELATION_COMPONENTS
          ? "ABSTAIN_INSUFFICIENT_CORRELATION_COMPONENTS"
          : "READY_FOR_PREREGISTERED_DETECTOR";
    return { target,
      decision,
      declaredEvaluationUnits: declared.length,
      qualifyingEvaluationUnits: qualifying.length,
      unqualifiedEvaluationUnits: declared.length - qualifying.length,
      qualifyingClassCounts: classCounts,
      qualifyingCorrelationComponents: correlationComponents,
      minimumCorrelationComponents: MINIMUM_TRUTH_CORRELATION_COMPONENTS,
      qualifyingBases: [...QUALIFIED_BASES[target]].sort() };
  });
  const detectorAssessments = truthReadiness.map((item) => ({ target: item.target,
    decision: item.decision === "READY_FOR_PREREGISTERED_DETECTOR"
      ? "ABSTAIN_NO_PREREGISTERED_DETECTOR" : item.decision,
    matchedEvaluationUnits: 0, discriminationClaimed: false,
    calibrationClaimed: false, generalizationClaimed: false }));
  const body = {
    schema: CROSS_DATASET_EVAL_SCHEMAS.report, schemaVersion: "3.0.0",
    evaluator: CROSS_DATASET_EVALUATOR_DESCRIPTOR,
    authority: { mode: "OBSERVATION_ONLY", establishesCausality: false,
      establishesLossOrLiability: false, admissibleForPricing: false,
      automaticTrainingPromotion: false },
    sampleAccounting: { candidateUnits: candidates.length, candidateSourceRowsObserved,
      trustedSourceRowsObserved: accepted.reduce((sum, entry) =>
        sum + entry.unit.sourceRowCount, 0), sourceRowsUsedAsIndependentSamples: false,
      verifiedBridgeCandidates: verified.length, refusedCandidates: refused.length,
      exactDuplicatesCollapsed, conflictingUnitIdsExcluded: conflicted.size,
      uniqueEvaluationUnits: accepted.length, correlationComponents: components,
      structuralIndependentUpperBound: components, independenceClaimed: false },
    coverage: { datasets: countBy(accepted.map(({ unit }) => unit.dataset.id)),
      sourceClasses: countBy(accepted.map(({ unit }) => unit.dataset.sourceClass)),
      labelDerivations: countBy(accepted.map(({ unit }) =>
        unit.sourceBinding.labelDerivation)),
      truthTargets: countBy(accepted.flatMap(({ unit }) =>
        unit.truthLabels.map((label) => label.target))),
      interpretation: "descriptive-trusted-evaluation-unit-coverage-not-population-coverage" },
    truthReadiness, detectorAssessments, refused,
    acceptedUnitHashes: accepted.map(({ unit }) => unit.unitHash).sort(),
    boundary: { observedEffectKinds: ["COVERAGE"], detectorRunnerRegistered: false,
      discriminationClaimed: false, calibrationClaimed: false, driftClaimed: false,
      recoveryClaimed: false, financialEffect: "none" },
  };
  return deepFreeze({ ...body, reportHash: digest(body) });
}

export function verifyCrossDatasetEvaluationReport(report, { candidates = null } = {}) {
  try {
    if (!report || report.schema !== CROSS_DATASET_EVAL_SCHEMAS.report
      || report.schemaVersion !== "3.0.0"
      || !HASH.test(String(report.reportHash ?? ""))) return Object.freeze({ ok: false });
    // A public hash is not an attestation. Re-running the registered bridges is
    // required to recover the in-process trust marks before a report can verify.
    if (!Array.isArray(candidates)) {
      return Object.freeze({ ok: false, error: "TRUSTED_BRIDGE_CANDIDATES_REQUIRED" });
    }
    const { reportHash, ...body } = report;
    if (digest(body) !== reportHash) return Object.freeze({ ok: false });
    if (!same(evaluateCrossDatasetUnits(candidates), report)) {
      return Object.freeze({ ok: false });
    }
    return Object.freeze({ ok: true, reportHash });
  } catch { return Object.freeze({ ok: false }); }
}

export { digest as crossDatasetEvaluationDigest };
