/*
 * AIDE-inspired, source-replayed episode data engine.
 *
 * This module performs an explicitly invoked research fit for one narrow
 * purpose: ranking already-observed public agent episodes/groups for outcome
 * follow-up.  It does not estimate agent risk, identity, authority, price,
 * responsibility, loss, or deployment readiness.  The only trusted entrypoint
 * re-derives normalized records from pinned source bytes through the public
 * agent full-source verifier.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import {
  PUBLIC_AGENT_PINS,
  PUBLIC_AGENT_SCHEMAS,
  verifyPublicAgentRecord,
} from "./outsider-public-agent-corpus.js";
import { verifyPublicAgentArtifactsAgainstSource } from
  "./outsider-public-agent-artifacts.js";
import {
  buildCuaVerifierBenchTrainingArtifactsFromSource,
  CUA_VERIFIER_BENCH_PIN,
  verifyCuaVerifierBenchSourceReplay,
  verifyCuaVerifierBenchTrainingArtifactsFromSource,
} from "./outsider-cua-verifier-bench.js";
import {
  REBOOT_DATASET_ID,
  REBOOT_REVISION,
  verifyRebootRecoveryPilotArtifactWithSource,
} from "./outsider-reboot-recovery-pilot.js";
import {
  AGENT_TRAJECTORY_SENTINEL_DISPOSITION,
  AGENT_TRAJECTORY_SENTINEL_EXPECTED_DATA_BYTES,
  AGENT_TRAJECTORY_SENTINEL_EXPECTED_PAIRS,
  AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT,
  AGENT_TRAJECTORY_SENTINEL_HF_REVISION,
  AGENT_TRAJECTORY_SENTINEL_SCHEMA,
  verifyAgentTrajectorySentinelArtifactDirectory,
} from "./outsider-agent-trajectory-sentinel-quarantine.js";
import {
  STALE_CONSTRAINT_ARCHIVE_INDEX_SCHEMA,
  STALE_CONSTRAINT_EPISODES_SCHEMA,
  STALE_CONSTRAINT_RUN_RECEIPT_SCHEMA,
  STALE_CONSTRAINT_ZENODO_RECORD,
  verifyStaleConstraintRunReceipt,
} from "./outsider-stale-constraint-episodes.js";
import {
  EPISODE_DATA_SOURCE_LEDGER_SCHEMA,
  buildEpisodeDataSourceLedger,
} from "./outsider-episode-data-source-ledger.js";

export const EPISODE_DATA_ENGINE_SCHEMA = "outsider/episode-data-engine-report/v4";
export const EPISODE_DATA_ENGINE_RUN_RECEIPT_SCHEMA =
  "outsider/episode-data-engine-run-receipt/v4";
export const EPISODE_DATA_ENGINE_BASELINE_FEATURES = Object.freeze([
  "stepCount", "toolCallCount", "toolResultCount",
]);
export const EPISODE_DATA_ENGINE_ISSUE_FEATURES = Object.freeze([
  "stepCount", "toolCallCount", "toolResultCount", "errorCount", "toolResultGap",
  "toolCallDensity", "toolResultDensity", "errorDensity", "agentDensity", "userDensity",
  "durationKnown",
]);

const HASH = /^sha256:[a-f0-9]{64}$/;
const SPLIT_FRACTION = 0.2;
const FOLLOW_UP_GROUP_BUDGET_FRACTION = 0.2;
const AUDIT_RESERVE_FRACTION_OF_PRIORITY_BUDGET = 0.2;
const SPLIT_SEED = "outsider/public-corpus-baseline/group-holdout/v1";
const AUDIT_RESERVE_SEED = "outsider/episode-data-engine/random-audit-reserve/v1";
const SENTINEL_DATASET_ID = "sunnydubey1111/agent-trajectory-sentinel";
const SENTINEL_PROVENANCE_GATE =
  "PASS_GITHUB_COMMIT_ROOT_TO_SELECTED_LEAF_MEMBERSHIP_REPLAYED";
const STALE_CONSTRAINT_DATASET_ID = "ZENODO_22117197_STALE_CONSTRAINT_V2";
const SENTINEL_FROZEN = Object.freeze({
  reportHash: "sha256:d96a6aef51acdc5490291ff5990e517eef4bd46593610af34a67f7e9de929920",
  receiptHash: "sha256:a2b8e57d86cb87e34635e94f67feb714bbf8014e79286b34cabee3e34d8e68c3",
  reportFileSha256:
    "sha256:b71b207ac23ce15ea339b91c79c25402abe1bff024c86fa12b61aef182b4a89f",
  supersessionMarkerFileSha256:
    "sha256:75675a6f300530778e76a4e654b4e948bc77469ce4442d68976d15b7c3678fe0",
  supersessionMarkerHash:
    "sha256:b4689308e09483c1c6a97491825cbacc87bb26965e629120cf956547981db50c",
  sourceRoot: "sha256:1596ea34dee9f7614398a1e241f6bb5776a3adb966fcbc343c49068c725952ec",
  pairingRoot: "sha256:b0b1624fc53d34c25e5f8d04c954e848c5832d605da638c4e874ca7f2d1a77e4",
});
const STALE_CONSTRAINT_FROZEN = Object.freeze({
  reportHash: "sha256:80776546230f6a819a511ab1719be0b47e7d7323d0fb3c847209cd87ba99e954",
  receiptHash: "sha256:540855196cc13c68fd0d98178143dafbc7183e79fa4410180460e3d8504ce9c5",
  sourceRoot: "sha256:109e714fb4379dc97e594813fb2dd6b8cf7752fc39be5c701574d85b209c5f74",
  archiveIndexHash: "sha256:c5484453aec683a9b5684d3e5bf5d520120ab99b0c7f5bca1d784e956623e64a",
  supersessionMarkerFileSha256:
    "sha256:c61b73ad75fce52641af997b0530836eafa88d9c8acb1751bc53b45620ae9b30",
});
const DATASET_GAP_QUEUE_DOMAIN = "outsider/episode-data-engine/dataset-gap-queue/v2";
const FEEDER_QUEUE_DOMAIN = "outsider/episode-data-engine/control-plane-feeder-queue/v2";
const CONTROL_PLANE_PROJECTION_SCHEMA =
  "outsider/episode-acquisition-control-plane-projection/v2";
const CONTROL_PLANE_PROJECTION_DOMAIN =
  "outsider/episode-data-engine/control-plane-projection/v2";
const CUA_ARTIFACT_FILES = Object.freeze({
  manifest: "source-manifest.json",
  episodes: "normalized-episodes.jsonl",
  summary: "effect-summary.json",
  verification: "full-source-verification.json",
  modelReport: "model-report.json",
  trainingReceipt: "training-run-receipt.json",
});
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

const SOURCE_CONFIGS = Object.freeze([
  Object.freeze({
    pin: PUBLIC_AGENT_PINS.computerAgentArena,
    engineTarget: "EPISODE_OUTCOME_FOLLOWUP_PRIORITY",
    sourceTarget: "CAA_TASK_CORRECTNESS",
    nativeOutcomeKind: "human-evaluated-task-correctness",
    negativeClassMeaning:
      "source-native human-evaluated task correctness is false; follow-up target only",
    groupingBasis: "CONNECTED_COMPONENT_TASK_INSTRUCTION_USER_SESSION_ROOTS",
    correlationFields: Object.freeze(["taskRoot", "instructionRoot", "userRoot", "sessionRoot"]),
    offlineModelFittingEligible: true,
  }),
  Object.freeze({
    pin: PUBLIC_AGENT_PINS.traceLab,
    engineTarget: "EPISODE_OUTCOME_FOLLOWUP_PRIORITY",
    sourceTarget: "TRACELAB_NO_NATIVE_OUTCOME",
    nativeOutcomeKind: "none",
    negativeClassMeaning: "no outcome label exists",
    groupingBasis: "CONNECTED_COMPONENT_CONTRIBUTOR_ROOT",
    correlationFields: Object.freeze(["userRoot"]),
    offlineModelFittingEligible: false,
  }),
  Object.freeze({
    pin: PUBLIC_AGENT_PINS.openhandsFeedback,
    engineTarget: "EPISODE_OUTCOME_FOLLOWUP_PRIORITY",
    sourceTarget: "OPENHANDS_USER_DISSATISFACTION",
    nativeOutcomeKind: "user-feedback-preference",
    negativeClassMeaning: "source-native feedback is negative; follow-up target only",
    groupingBasis: "CONNECTED_COMPONENT_COLLECTOR_ROOT",
    correlationFields: Object.freeze(["userRoot"]),
    offlineModelFittingEligible: false,
  }),
  Object.freeze({
    pin: PUBLIC_AGENT_PINS.nebiusOpenHands,
    engineTarget: "EPISODE_OUTCOME_FOLLOWUP_PRIORITY",
    sourceTarget: "NEBIUS_BENCHMARK_RESOLVED",
    nativeOutcomeKind: "benchmark-resolved",
    negativeClassMeaning: "source-native benchmark resolved value is false; follow-up target only",
    groupingBasis: "CONNECTED_COMPONENT_REPOSITORY_TASK_ROOTS",
    correlationFields: Object.freeze(["repositoryRoot", "taskRoot"]),
    offlineModelFittingEligible: true,
  }),
]);

const MODULE_FILE_HASH = `sha256:${createHash("sha256")
  .update(readFileSync(new URL(import.meta.url))).digest("hex")}`;
const SOURCE_VERIFIER_FILE_HASH = `sha256:${createHash("sha256")
  .update(readFileSync(new URL("./outsider-public-agent-artifacts.js", import.meta.url)))
  .digest("hex")}`;
const CORPUS_ADAPTER_FILE_HASH = `sha256:${createHash("sha256")
  .update(readFileSync(new URL("./outsider-public-agent-corpus.js", import.meta.url)))
  .digest("hex")}`;
const CANONICALIZER_FILE_HASH = `sha256:${createHash("sha256")
  .update(readFileSync(new URL("./canonical.js", import.meta.url))).digest("hex")}`;
const SENTINEL_ADAPTER_FILE_HASH = `sha256:${createHash("sha256")
  .update(readFileSync(new URL("./outsider-agent-trajectory-sentinel-quarantine.js",
    import.meta.url))).digest("hex")}`;
const STALE_CONSTRAINT_ADAPTER_FILE_HASH = `sha256:${createHash("sha256")
  .update(readFileSync(new URL("./outsider-stale-constraint-episodes.js",
    import.meta.url))).digest("hex")}`;
const SOURCE_LEDGER_FILE_HASH = `sha256:${createHash("sha256")
  .update(readFileSync(new URL("./outsider-episode-data-source-ledger.js",
    import.meta.url))).digest("hex")}`;

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function digest(value, domain = "outsider/episode-data-engine/v1") {
  return `sha256:${createHash("sha256").update(`${domain}\0${canonicalizeStrict(value)}`)
    .digest("hex")}`;
}

function round(value) {
  if (value === null) return null;
  const result = Math.round((value + Number.EPSILON) * 1e12) / 1e12;
  return Object.is(result, -0) ? 0 : result;
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function parseJsonFile(file, code) {
  try { return JSON.parse(readFileSync(file, "utf8")); }
  catch { fail(code, file); }
}

function parseJsonlFile(file, code) {
  try {
    const text = readFileSync(file, "utf8").trim();
    return text === "" ? [] : text.split("\n").map((line) => JSON.parse(line));
  } catch { fail(code, file); }
}

function cuaRowsUrl(config, split, offset, length) {
  const query = new URLSearchParams({ dataset: CUA_VERIFIER_BENCH_PIN.id,
    config, split, offset: String(offset), length: String(length) });
  return `https://datasets-server.huggingface.co/rows?${query}`;
}

function cuaPageName(config, offset, length) {
  const finish = String(offset + length - 1).padStart(3, "0");
  return `${config}.rows-${String(offset).padStart(3, "0")}-${finish}.json`;
}

function cuaRawObject(relativePath, url, bytes, fields = {}) {
  return { path: `source/${relativePath}`, url, bytes, ...fields };
}

function cuaRawReplayInput(artifactDirectory, generatedAt) {
  const sourceDirectory = path.join(artifactDirectory, "source");
  const repositoryUrl = `https://huggingface.co/api/datasets/${CUA_VERIFIER_BENCH_PIN.id}`;
  const readmeUrl = `https://huggingface.co/datasets/${CUA_VERIFIER_BENCH_PIN.id}/raw/${
    CUA_VERIFIER_BENCH_PIN.revision}/README.md`;
  const pages = (definition, maximumBytes) => definition.pages.map((page) => {
    const name = cuaPageName(definition.config, page.offset, page.length);
    const bytes = readFileSync(path.join(sourceDirectory, name));
    if (bytes.length <= 0 || bytes.length > maximumBytes) {
      fail("EPISODE_DATA_ENGINE_CUA_SOURCE_OBJECT_SIZE_INVALID", name);
    }
    return cuaRawObject(name, cuaRowsUrl(definition.config, definition.split,
      page.offset, page.length), bytes, page);
  });
  const parquet = CUA_VERIFIER_BENCH_PIN.localAnnotationParquetCrossCheck;
  return {
    generatedAt,
    repositoryBefore: cuaRawObject("repository-before.json", repositoryUrl,
      readFileSync(path.join(sourceDirectory, "repository-before.json"))),
    repositoryAfter: cuaRawObject("repository-after.json", repositoryUrl,
      readFileSync(path.join(sourceDirectory, "repository-after.json"))),
    readme: cuaRawObject("README.md", readmeUrl,
      readFileSync(path.join(sourceDirectory, "README.md"))),
    trajectoryPages: pages(CUA_VERIFIER_BENCH_PIN.trajectories, 64 * 1024 * 1024),
    annotationPages: pages(CUA_VERIFIER_BENCH_PIN.annotations, 16 * 1024 * 1024),
    annotationParquetCrossCheck: {
      path: parquet.path,
      bytes: readFileSync(path.join(artifactDirectory, parquet.path)),
    },
  };
}

function replayCuaSupplement(artifactDirectory) {
  const manifest = parseJsonFile(path.join(artifactDirectory, CUA_ARTIFACT_FILES.manifest),
    "EPISODE_DATA_ENGINE_CUA_MANIFEST_INVALID");
  const storedBundle = {
    manifest,
    episodes: parseJsonlFile(path.join(artifactDirectory, CUA_ARTIFACT_FILES.episodes),
      "EPISODE_DATA_ENGINE_CUA_EPISODES_INVALID"),
    summary: parseJsonFile(path.join(artifactDirectory, CUA_ARTIFACT_FILES.summary),
      "EPISODE_DATA_ENGINE_CUA_SUMMARY_INVALID"),
    verification: parseJsonFile(path.join(artifactDirectory, CUA_ARTIFACT_FILES.verification),
      "EPISODE_DATA_ENGINE_CUA_VERIFICATION_INVALID"),
  };
  const rawInput = cuaRawReplayInput(artifactDirectory, manifest.generatedAt);
  const verified = verifyCuaVerifierBenchSourceReplay(storedBundle, rawInput);
  if (!verified.ok || verified.status !== "FULL_SELECTED_LOGICAL_SOURCE_REDERIVED"
    || verified.records !== 106) {
    fail("EPISODE_DATA_ENGINE_CUA_FULL_SOURCE_REPLAY_FAILED", verified.error ?? verified.status);
  }
  const storedTraining = {
    report: parseJsonFile(path.join(artifactDirectory, CUA_ARTIFACT_FILES.modelReport),
      "EPISODE_DATA_ENGINE_CUA_MODEL_REPORT_INVALID"),
    receipt: parseJsonFile(path.join(artifactDirectory, CUA_ARTIFACT_FILES.trainingReceipt),
      "EPISODE_DATA_ENGINE_CUA_TRAINING_RECEIPT_INVALID"),
  };
  const trainingVerified = verifyCuaVerifierBenchTrainingArtifactsFromSource(storedTraining,
    rawInput, manifest);
  if (!trainingVerified.ok || trainingVerified.status !== "RAW_SOURCE_AND_MANIFEST_REPLAY_BOUND") {
    fail("EPISODE_DATA_ENGINE_CUA_TRAINING_SOURCE_REPLAY_FAILED",
      trainingVerified.error ?? trainingVerified.status);
  }
  const rebuiltTraining = buildCuaVerifierBenchTrainingArtifactsFromSource(rawInput, manifest);
  if (!same(rebuiltTraining, storedTraining)) {
    fail("EPISODE_DATA_ENGINE_CUA_TRAINING_REBUILD_MISMATCH");
  }
  const counts = storedBundle.summary.counts;
  if (counts?.normalizedEpisodes !== 106 || counts?.outcomeMajorityAvailableEpisodes !== 85
    || counts?.recoveryRows !== 0 || counts?.authorityRows !== 0
    || storedBundle.summary.interpretation?.recoveryOrLongitudinalOutcomeObserved !== false
    || storedTraining.report.boundary?.disposition !== "HOLD"
    || storedTraining.report.boundary?.modelDeploymentAuthorized !== false) {
    fail("EPISODE_DATA_ENGINE_CUA_BOUNDARY_INVALID");
  }
  return { bundle: storedBundle, training: storedTraining, verified, trainingVerified };
}

function replayRebootSupplement(artifactDirectory, sourceDirectory) {
  const artifact = parseJsonFile(path.join(artifactDirectory, "report.json"),
    "EPISODE_DATA_ENGINE_REBOOT_REPORT_INVALID");
  const verified = verifyRebootRecoveryPilotArtifactWithSource(artifact, sourceDirectory);
  if (!verified.ok || verified.verificationLevel !== "FULL_SOURCE_REPLAY"
    || verified.sourceArtifactsReverified !== true
    || verified.candidateArtifactExactlyRebuilt !== true
    || verified.authorityEstablished !== false
    || verified.outcomeTruthEstablished !== false) {
    fail("EPISODE_DATA_ENGINE_REBOOT_FULL_SOURCE_REPLAY_FAILED",
      verified.error ?? verified.verificationLevel);
  }
  if (artifact.source?.datasetId !== REBOOT_DATASET_ID
    || artifact.source?.revision !== REBOOT_REVISION
    || artifact.quality?.projectedEpisodes !== 60
    || artifact.quality?.validFailureWindows !== 57
    || artifact.quality?.independentOutcomeAuditPresent !== false
    || artifact.training?.decision !== "KEEP_BASELINE_GROUP_DISJOINT_SPLIT_IMPOSSIBLE"
    || artifact.training?.promoted !== false
    || artifact.controlPlaneProjection?.status !== "QUARANTINED_REVIEW_ONLY"
    || artifact.controlPlaneProjection?.dispatched !== false
    || artifact.authority?.authorityDelta !== 0) {
    fail("EPISODE_DATA_ENGINE_REBOOT_BOUNDARY_INVALID");
  }
  return { artifact, verified };
}

function replaySentinelSupplement(artifactDirectory) {
  const root = path.resolve(artifactDirectory);
  const report = parseJsonFile(path.join(root, "report.json"),
    "EPISODE_DATA_ENGINE_SENTINEL_REPORT_INVALID");
  const receipt = parseJsonFile(path.join(root, "run-receipt.json"),
    "EPISODE_DATA_ENGINE_SENTINEL_RECEIPT_INVALID");
  const supersessionMarkerPath = path.join(path.dirname(root),
    "outsider-agent-trajectory-sentinel-quarantine-20260828-v1",
    "REJECTED-SUPERSEDED.json");
  const supersessionMarker = parseJsonFile(supersessionMarkerPath,
    "EPISODE_DATA_ENGINE_SENTINEL_SUPERSESSION_MARKER_INVALID");
  const supersessionMarkerFileSha256 = `sha256:${createHash("sha256")
    .update(readFileSync(supersessionMarkerPath)).digest("hex")}`;
  const verified = verifyAgentTrajectorySentinelArtifactDirectory(root);
  if (!verified.ok
    || verified.reportHash !== report.reportHash
    || verified.receiptHash !== receipt.receiptHash
    || verified.reportHash !== SENTINEL_FROZEN.reportHash
    || verified.receiptHash !== SENTINEL_FROZEN.receiptHash
    || verified.reportFileSha256 !== SENTINEL_FROZEN.reportFileSha256
    || verified.sourceRoot !== SENTINEL_FROZEN.sourceRoot
    || verified.pairingRoot !== SENTINEL_FROZEN.pairingRoot) {
    fail("EPISODE_DATA_ENGINE_SENTINEL_FULL_SOURCE_REPLAY_FAILED",
      verified.error ?? verified.reportHash ?? "invalid-replay");
  }
  if (report.schema !== AGENT_TRAJECTORY_SENTINEL_SCHEMA
    || report.datasetId !== SENTINEL_DATASET_ID
    || report.disposition !== AGENT_TRAJECTORY_SENTINEL_DISPOSITION
    || report.sourcePins?.githubCommit !== AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT
    || report.sourcePins?.huggingFaceRevision !== AGENT_TRAJECTORY_SENTINEL_HF_REVISION
    || report.sourcePins?.githubTreeAncestryVerified !== true
    || report.boundedSlice?.pairedEpisodes !== AGENT_TRAJECTORY_SENTINEL_EXPECTED_PAIRS
    || report.boundedSlice?.sourceEpisodes !== AGENT_TRAJECTORY_SENTINEL_EXPECTED_PAIRS
    || report.boundedSlice?.recoveryEpisodes !== AGENT_TRAJECTORY_SENTINEL_EXPECTED_PAIRS
    || report.boundedSlice?.rawDataObjects !== 112
    || report.boundedSlice?.rawDataBytes !== AGENT_TRAJECTORY_SENTINEL_EXPECTED_DATA_BYTES
    || report.boundedSlice?.sourceRoot !== SENTINEL_FROZEN.sourceRoot
    || report.boundedSlice?.pairingRoot !== SENTINEL_FROZEN.pairingRoot
    || report.replayedPublisherClaims?.publisherNowCorrectTrue !== 24
    || report.replayedPublisherClaims?.publisherNowCorrectFalse !== 31
    || report.replayedPublisherClaims?.externalAffectedPartyOutcomeObserved !== false
    || report.replayedPublisherClaims?.longitudinalRecoveryObserved !== false
    || report.rights?.rightsGate !== "FAIL_CLOSED"
    || report.rights?.trainingUseAllowed !== false
    || report.useBoundary?.evaluationOnlyPairs !== AGENT_TRAJECTORY_SENTINEL_EXPECTED_PAIRS
    || report.useBoundary?.offlineResearchTrainingRows !== 0
    || report.useBoundary?.productionTrainingRows !== 0
    || report.useBoundary?.networkAdmissionRows !== 0
    || report.useBoundary?.networkProjectionRows !== 0
    || report.useBoundary?.rawTraceProjectionRows !== 0
    || report.useBoundary?.CEU !== 0
    || report.useBoundary?.authorityUnits !== 0
    || report.useBoundary?.trainingDecision
      !== "KEEP_BASELINE_RIGHTS_FAIL_CLOSED_ZERO_TRAINING_ROWS"
    || receipt.trainingRows !== 0 || receipt.networkAdmissionRows !== 0
    || receipt.networkProjectionRows !== 0 || receipt.CEU !== 0
    || receipt.authorityUnits !== 0
    || supersessionMarkerFileSha256
      !== SENTINEL_FROZEN.supersessionMarkerFileSha256
    || supersessionMarker?.schema
      !== "outsider/agent-trajectory-sentinel-artifact-supersession/v1"
    || supersessionMarker?.status !== "REJECTED_SUPERSEDED"
    || supersessionMarker?.markerHash !== SENTINEL_FROZEN.supersessionMarkerHash
    || supersessionMarker?.supersededBy
      !== "outsider-agent-trajectory-sentinel-quarantine-20260829-v2"
    || supersessionMarker?.supersedingReportHash !== SENTINEL_FROZEN.reportHash
    || supersessionMarker?.supersedingReceiptHash !== SENTINEL_FROZEN.receiptHash
    || supersessionMarker?.supersedingReportFileSha256
      !== SENTINEL_FROZEN.reportFileSha256
    || supersessionMarker?.trainingRows !== 0
    || supersessionMarker?.networkAdmissionRows !== 0
    || supersessionMarker?.networkProjectionRows !== 0
    || supersessionMarker?.CEU !== 0 || supersessionMarker?.authorityUnits !== 0) {
    fail("EPISODE_DATA_ENGINE_SENTINEL_BOUNDARY_INVALID");
  }
  return { report, receipt, verified, supersessionMarker,
    supersessionMarkerFileSha256 };
}

function replayStaleConstraintSupplement(artifactDirectory) {
  const root = path.resolve(artifactDirectory);
  const report = parseJsonFile(path.join(root, "report.json"),
    "EPISODE_DATA_ENGINE_STALE_CONSTRAINT_REPORT_INVALID");
  const archiveIndex = parseJsonFile(path.join(root, "archive-index.json"),
    "EPISODE_DATA_ENGINE_STALE_CONSTRAINT_ARCHIVE_INDEX_INVALID");
  const receipt = parseJsonFile(path.join(root, "run-receipt.json"),
    "EPISODE_DATA_ENGINE_STALE_CONSTRAINT_RECEIPT_INVALID");
  const supersessionMarkerPath = path.join(path.dirname(root),
    "outsider-stale-constraint-episodes-20260828-v1", "SUPERSEDED-REJECTED.json");
  const supersessionMarker = parseJsonFile(supersessionMarkerPath,
    "EPISODE_DATA_ENGINE_STALE_CONSTRAINT_SUPERSESSION_MARKER_INVALID");
  const supersessionMarkerFileSha256 = `sha256:${createHash("sha256")
    .update(readFileSync(supersessionMarkerPath)).digest("hex")}`;
  const verified = verifyStaleConstraintRunReceipt(receipt, report, archiveIndex,
    { sourceDirectory: path.join(root, "source") });
  if (!verified.ok
    || verified.reportHash !== report.reportHash
    || verified.receiptHash !== receipt.receiptHash
    || verified.sourceRoot !== report.sourceTrust?.sourceRoot
    || verified.reportHash !== STALE_CONSTRAINT_FROZEN.reportHash
    || verified.receiptHash !== STALE_CONSTRAINT_FROZEN.receiptHash
    || verified.sourceRoot !== STALE_CONSTRAINT_FROZEN.sourceRoot) {
    fail("EPISODE_DATA_ENGINE_STALE_CONSTRAINT_FULL_SOURCE_REPLAY_FAILED",
      verified.error ?? verified.reportHash ?? "invalid-replay");
  }
  const split = report.offlineResearchTraining?.split;
  const audit = split?.auditReserve;
  if (report.schema !== STALE_CONSTRAINT_EPISODES_SCHEMA
    || report.schemaVersion !== "2.0.0"
    || archiveIndex.schema !== STALE_CONSTRAINT_ARCHIVE_INDEX_SCHEMA
    || receipt.schema !== STALE_CONSTRAINT_RUN_RECEIPT_SCHEMA
    || report.dataset?.recordId !== STALE_CONSTRAINT_ZENODO_RECORD.recordId
    || report.dataset?.revision !== STALE_CONSTRAINT_ZENODO_RECORD.revision
    || report.dataset?.version !== "v2"
    || report.dataset?.sourceClass !== "CONSTRUCTED_AGENT_MEMORY_VERIFICATION_EXPERIMENT"
    || report.sourceTrust?.sourceRoot !== STALE_CONSTRAINT_FROZEN.sourceRoot
    || report.sourceTrust?.archiveIndexHash !== STALE_CONSTRAINT_FROZEN.archiveIndexHash
    || archiveIndex.archiveIndexHash !== STALE_CONSTRAINT_FROZEN.archiveIndexHash
    || receipt.archiveIndexHash !== STALE_CONSTRAINT_FROZEN.archiveIndexHash
    || report.sourceReplay?.confirmatoryEpisodes !== 5_400
    || report.sourceReplay?.archiveEpisodeBytesAndCrcReplayed !== 5_400
    || report.sourceReplay?.schemaInspectedEpisodes !== 4_896
    || report.sourceReplay?.opaqueAuditByteCommitments !== 504
    || report.sourceReplay?.outcomeBlindAuditEpisodes !== 504
    || report.sourceReplay?.realWorldCompleteThreeSegmentEpisodes !== 0
    || report.sourceReplay?.rawEpisodeObjectsProjectedToNetwork !== 0
    || report.rightsReview?.networkRedistributionAuthorizedByThisAdapter !== false
    || report.rightsReview?.productionTrainingAuthorizedByThisAdapter !== false
    || report.episodeDataEngineControlPlane?.datasetId !== STALE_CONSTRAINT_DATASET_ID
    || report.episodeDataEngineControlPlane?.networkProjection !== false
    || report.episodeDataEngineControlPlane?.dispatched !== false
    || report.offlineResearchTraining?.researchQueueDecision
      !== "USE_CANDIDATE_FOR_NEXT_OFFLINE_REVIEW_QUEUE"
    || report.offlineResearchTraining?.productionDecision
      !== "KEEP_BASELINE_NO_PRODUCTION_TRAINING_OR_PROMOTION_AUTHORIZED"
    || report.offlineResearchTraining?.targetIsAuthorityTruth !== false
    || report.offlineResearchTraining?.targetIsIndependentRealOutcome !== false
    || split?.totalGroups !== 300 || split?.trainGroups !== 210
    || split?.trainEpisodes !== 3_816 || split?.holdoutGroups !== 60
    || split?.holdoutEpisodes !== 1_080 || split?.auditReserveGroups !== 30
    || split?.auditReserveEpisodes !== 504 || split?.groupOverlap !== 0
    || audit?.selectedBeforeLabelInspection !== true
    || audit?.labelsUsedForSelection !== false
    || audit?.labelsInspectedForThisReport !== false
    || audit?.metricsComputed !== false || audit?.jsonParses !== 0
    || audit?.scoreContainerAccesses !== 0 || audit?.scoreOwnKeyEnumerations !== 0
    || audit?.scorePropertyDescriptorReads !== 0 || audit?.scoreValueReads !== 0
    || report.boundary?.sourceClass
      !== "CONSTRUCTED_AGENT_EXPERIMENT_NOT_REAL_WORLD_OUTCOME"
    || report.boundary?.productionTrainingRows !== 0
    || report.boundary?.networkRecordsCreated !== 0
    || report.boundary?.independentAffectedPartyObservations !== 0
    || report.boundary?.independentLongitudinalOutcomes !== 0
    || report.boundary?.realWorldCompleteEpisodes !== 0
    || report.boundary?.recoveryEpisodes !== 0
    || report.boundary?.CEU !== 0 || report.boundary?.authority !== "NONE"
    || report.boundary?.rawPromptAndResponseNetworkProjection !== false
    || report.admissions?.networkRows !== 0 || report.admissions?.realOutcomeRows !== 0
    || report.admissions?.productionTrainingRows !== 0
    || report.successorBoundary?.predecessorStatus
      !== "REJECTED_P1_INTRINSIC_AND_STRICT_AUDIT_ZERO_ACCESS_CLAIMS"
    || report.successorBoundary?.predecessorUsedAsAuthority !== false
    || report.successorBoundary?.supersedesWithoutOverwriting
      !== "artifacts/outsider-stale-constraint-episodes-20260828-v1"
    || report.sourceTrust?.predecessorBoundary?.predecessorDerivedReportOrReceiptTrusted
      !== false
    || supersessionMarkerFileSha256
      !== STALE_CONSTRAINT_FROZEN.supersessionMarkerFileSha256
    || supersessionMarker?.schema
      !== "outsider/stale-constraint-artifact-supersession-marker/v1"
    || supersessionMarker?.status
      !== "REJECTED_SUPERSEDED_DO_NOT_USE_DERIVED_REPORT_OR_RECEIPT"
    || supersessionMarker?.predecessorDerivedReportOrReceiptAuthorized !== false
    || supersessionMarker?.successorSemanticHashes?.sourceRoot
      !== STALE_CONSTRAINT_FROZEN.sourceRoot
    || supersessionMarker?.successorSemanticHashes?.archiveIndexHash
      !== STALE_CONSTRAINT_FROZEN.archiveIndexHash
    || supersessionMarker?.successorSemanticHashes?.reportHash
      !== STALE_CONSTRAINT_FROZEN.reportHash
    || supersessionMarker?.successorSemanticHashes?.receiptHash
      !== STALE_CONSTRAINT_FROZEN.receiptHash
    || supersessionMarker?.boundary?.authority !== "NONE"
    || supersessionMarker?.boundary?.productionTrainingAuthorized !== false
    || supersessionMarker?.boundary?.networkProjectionAuthorized !== false
    || supersessionMarker?.boundary?.actionAuthorized !== false) {
    fail("EPISODE_DATA_ENGINE_STALE_CONSTRAINT_V2_BOUNDARY_INVALID");
  }
  return { report, archiveIndex, receipt, verified,
    supersessionMarker, supersessionMarkerFileSha256 };
}

function boundary() {
  return {
    offlineModelFittingPurpose: "EPISODE_OUTCOME_FOLLOWUP_PRIORITY_ONLY",
    offlineModelFittingPerformed: true,
    authorizedTrainingPerformed: false,
    authorizedTrainingRows: 0,
    authorizedTrainingJobs: 0,
    authorizedTrainingInheritedFromModelFitting: false,
    automaticAuthorizedTraining: false,
    automaticModelPromotion: false,
    authority: "none",
    authorityUnits: 0,
    actionReady: false,
    executable: false,
    causalExperienceUnits: 0,
    CEU: 0,
    lossEvidenceUnits: 0,
    economicLossObserved: false,
    responsibilityTruthEstablished: false,
    modelDeploymentAuthorized: false,
    pseudoLabelsPromoted: false,
    permits: {
      PRICE: false,
      GUARANTEE: false,
      SETTLE: false,
      DEPLOY_MODEL: false,
      EXPAND_DELEGATION: false,
    },
  };
}

function configFor(id) {
  return SOURCE_CONFIGS.find((config) => config.pin.id === id) ?? null;
}

function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= 10_000_000;
}

function exactPinnedRecord(record, config, manifest) {
  if (!verifyPublicAgentRecord(record, { manifest }).ok
    || record?.schema !== PUBLIC_AGENT_SCHEMAS.record
    || record.dataset?.id !== config.pin.id
    || record.dataset?.revision !== config.pin.revision
    || record.dataset?.licenseId !== config.pin.licenseId
    || record.dataset?.sourceClass !== config.pin.sourceClass
    || !HASH.test(record.dataset?.sourceObjectHash ?? "")
    || record.privacy?.rawContentIncluded !== false
    || record.useBoundary?.disposition !== "QUARANTINED_RESEARCH_ONLY"
    || record.useBoundary?.automaticTraining !== false
    || record.useBoundary?.economicLossObserved !== false
    || record.useBoundary?.permits?.PRICE !== false
    || record.useBoundary?.permits?.GUARANTEE !== false
    || record.useBoundary?.permits?.SETTLE !== false) {
    fail("EPISODE_DATA_ENGINE_SOURCE_RECORD_INVALID", config.pin.id);
  }
}

function counts(record) {
  const episode = record.episode;
  const values = [episode?.stepCount, episode?.toolCallCount, episode?.toolResultCount,
    episode?.errorCount, episode?.userTurnCount, episode?.agentTurnCount];
  if (!values.every(validCount)
    || (episode.durationMs !== null && !validCount(episode.durationMs))) {
    fail("EPISODE_DATA_ENGINE_FEATURE_INVALID", record.dataset.id);
  }
  return {
    stepCount: episode.stepCount,
    toolCallCount: episode.toolCallCount,
    toolResultCount: episode.toolResultCount,
    errorCount: episode.errorCount,
    userTurnCount: episode.userTurnCount,
    agentTurnCount: episode.agentTurnCount,
    durationMs: episode.durationMs,
  };
}

function vector(record, featureNames) {
  const values = counts(record);
  const denominator = Math.max(1, values.stepCount);
  const derived = {
    ...values,
    toolResultGap: Math.abs(values.toolCallCount - values.toolResultCount),
    toolCallDensity: values.toolCallCount / denominator,
    toolResultDensity: values.toolResultCount / denominator,
    errorDensity: values.errorCount / denominator,
    agentDensity: values.agentTurnCount / denominator,
    userDensity: values.userTurnCount / denominator,
    durationKnown: values.durationMs === null ? 0 : 1,
  };
  const output = featureNames.map((name) => derived[name]);
  if (!output.every(Number.isFinite)) fail("EPISODE_DATA_ENGINE_DERIVED_FEATURE_INVALID");
  return output;
}

function nativeNegativeLabel(record, config) {
  const labels = record.labels;
  if (labels?.nativeOutcomeKind !== config.nativeOutcomeKind
    || labels.economicLossObserved !== false || labels.lossMinorUnits !== null
    || labels.currency !== null || labels.independentAdjudication !== false) {
    fail("EPISODE_DATA_ENGINE_LABEL_BOUNDARY_INVALID", config.pin.id);
  }
  if (config.pin.id === PUBLIC_AGENT_PINS.computerAgentArena.id) {
    if (labels.preferenceOnly !== false || labels.benchmarkResolvedOnly !== false
      || typeof labels.nativeOutcomeValue !== "boolean") {
      fail("EPISODE_DATA_ENGINE_LABEL_SEMANTICS_INVALID", config.pin.id);
    }
    return Number(labels.nativeOutcomeValue === false);
  }
  if (config.pin.id === PUBLIC_AGENT_PINS.nebiusOpenHands.id) {
    if (labels.preferenceOnly !== false || labels.benchmarkResolvedOnly !== true
      || typeof labels.nativeOutcomeValue !== "boolean") {
      fail("EPISODE_DATA_ENGINE_LABEL_SEMANTICS_INVALID", config.pin.id);
    }
    return Number(labels.nativeOutcomeValue === false);
  }
  if (config.pin.id === PUBLIC_AGENT_PINS.openhandsFeedback.id) {
    if (labels.preferenceOnly !== true || labels.benchmarkResolvedOnly !== false) {
      fail("EPISODE_DATA_ENGINE_LABEL_SEMANTICS_INVALID", config.pin.id);
    }
    if (labels.nativeOutcomeValue === "negative") return 1;
    if (labels.nativeOutcomeValue === "positive") return 0;
    return null;
  }
  if (config.pin.id === PUBLIC_AGENT_PINS.traceLab.id) {
    if (labels.nativeOutcomeValue !== null || labels.preferenceOnly !== false
      || labels.benchmarkResolvedOnly !== false) {
      fail("EPISODE_DATA_ENGINE_LABEL_SEMANTICS_INVALID", config.pin.id);
    }
    return null;
  }
  fail("EPISODE_DATA_ENGINE_DATASET_UNSUPPORTED");
}

function correlationKeys(record, config) {
  if (!HASH.test(record.roots?.episodeRoot ?? "")
    || !HASH.test(record.episode?.nativeIdHash ?? "")) {
    fail("EPISODE_DATA_ENGINE_EPISODE_IDENTITY_INVALID");
  }
  const keys = config.correlationFields.map((field) => record.roots[field])
    .filter((value) => value !== null);
  if (keys.length === 0 || keys.some((value) => !HASH.test(value ?? "")
    || !record.roots.correlationRoots?.includes(value))) {
    fail("EPISODE_DATA_ENGINE_CORRELATION_ROOT_INVALID", config.pin.id);
  }
  return [...new Set(keys)].sort();
}

function prepare(replay) {
  if (!Array.isArray(replay.records) || replay.records.length === 0) {
    fail("EPISODE_DATA_ENGINE_REPLAY_RECORDS_INVALID");
  }
  const seen = new Set();
  const rows = replay.records.map((record) => {
    const config = configFor(record?.dataset?.id);
    if (!config) fail("EPISODE_DATA_ENGINE_DATASET_UNSUPPORTED", record?.dataset?.id);
    exactPinnedRecord(record, config, replay.manifest);
    const identity = `${record.dataset.id}\0${record.episode.nativeIdHash}`;
    if (seen.has(identity)) fail("EPISODE_DATA_ENGINE_DUPLICATE_IDENTITY", identity);
    seen.add(identity);
    return {
      record,
      config,
      identity,
      label: nativeNegativeLabel(record, config),
      correlationRootKeys: correlationKeys(record, config),
    };
  });
  return rows.sort((left, right) => left.identity.localeCompare(right.identity));
}

/* Identical connected-component construction and hash domains to the existing
 * public-corpus baseline for CAA and Nebius. */
function connectedRows(inputRows, config) {
  const parent = inputRows.map((_, index) => index);
  const find = (index) => parent[index] === index ? index
    : (parent[index] = find(parent[index]));
  const join = (left, right) => {
    const a = find(left), b = find(right);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  const firstByRoot = new Map();
  inputRows.forEach((row, index) => {
    for (const root of row.correlationRootKeys) {
      if (firstByRoot.has(root)) join(index, firstByRoot.get(root));
      else firstByRoot.set(root, index);
    }
  });
  inputRows.forEach((_, index) => find(index));
  const rootsByComponent = new Map();
  inputRows.forEach((row, index) => {
    const component = find(index);
    const roots = rootsByComponent.get(component) ?? new Set();
    row.correlationRootKeys.forEach((root) => roots.add(root));
    rootsByComponent.set(component, roots);
  });
  return inputRows.map((row, index) => ({ ...row,
    groupRoot: digest([...rootsByComponent.get(find(index))].sort(),
      `outsider/public-corpus-baseline/${config.sourceTarget}/correlation-component/v1`) }));
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
    train,
    holdout,
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
      totalRecords: rows.length,
      trainRecords: train.length,
      holdoutRecords: holdout.length,
    },
  };
}

function classCounts(rows) {
  return {
    negativeOutcomeFollowUpTargets: rows.filter((row) => row.label === 1).length,
    otherSourceNativeOutcomes: rows.filter((row) => row.label === 0).length,
  };
}

function abstentionReason(rows, grouped) {
  if (rows.length < MINIMUMS.totalRecords) return "ABSTAIN_INSUFFICIENT_RECORDS";
  if (grouped.split.totalGroups < MINIMUMS.correlationGroups) {
    return "ABSTAIN_INSUFFICIENT_CORRELATION_GROUPS";
  }
  if (grouped.split.trainGroups < MINIMUMS.trainGroups) {
    return "ABSTAIN_INSUFFICIENT_TRAIN_GROUPS";
  }
  if (grouped.split.holdoutGroups < MINIMUMS.holdoutGroups) {
    return "ABSTAIN_INSUFFICIENT_HOLDOUT_GROUPS";
  }
  if (grouped.train.length < MINIMUMS.trainRecords) return "ABSTAIN_INSUFFICIENT_TRAIN_RECORDS";
  if (grouped.holdout.length < MINIMUMS.holdoutRecords) {
    return "ABSTAIN_INSUFFICIENT_HOLDOUT_RECORDS";
  }
  const train = classCounts(grouped.train), holdout = classCounts(grouped.holdout);
  if (train.negativeOutcomeFollowUpTargets === 0 || train.otherSourceNativeOutcomes === 0) {
    return "ABSTAIN_TRAIN_ONE_CLASS";
  }
  if (holdout.negativeOutcomeFollowUpTargets === 0 || holdout.otherSourceNativeOutcomes === 0) {
    return "ABSTAIN_HOLDOUT_ONE_CLASS";
  }
  return null;
}

function sigmoid(value) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exponential = Math.exp(value);
  return exponential / (1 + exponential);
}

function fitStandardizer(matrix) {
  const dimensions = matrix[0].length;
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

function standardize(values, fitted) {
  return values.map((value, index) => (value - fitted.mean[index]) / fitted.std[index]);
}

function fitLogistic(rows, featureNames) {
  const rawMatrix = rows.map((row) => vector(row.record, featureNames));
  const fitted = fitStandardizer(rawMatrix);
  const matrix = rawMatrix.map((values) => standardize(values, fitted));
  const labels = rows.map((row) => row.label);
  const weights = new Array(featureNames.length).fill(0);
  const positives = labels.reduce((sum, label) => sum + label, 0);
  let bias = Math.log((positives + 0.5) / (labels.length - positives + 0.5));
  for (let epoch = 0; epoch < TRAINING.epochs; epoch += 1) {
    const gradients = new Array(weights.length).fill(0);
    let biasGradient = 0;
    matrix.forEach((values, index) => {
      let linear = bias;
      values.forEach((value, dimension) => { linear += weights[dimension] * value; });
      const residual = sigmoid(linear) - labels[index];
      values.forEach((value, dimension) => { gradients[dimension] += residual * value; });
      biasGradient += residual;
    });
    const step = TRAINING.learningRate / (1 + TRAINING.learningRateDecay * epoch);
    weights.forEach((weight, dimension) => {
      const gradient = gradients[dimension] / matrix.length + TRAINING.l2 * weight;
      weights[dimension] -= step * gradient;
    });
    bias -= step * biasGradient / matrix.length;
  }
  const modelBody = {
    featureNames: [...featureNames],
    weights: weights.map(round),
    bias: round(bias),
    standardizer: { fittedOnTrainingRowsOnly: true,
      mean: fitted.mean.map(round), std: fitted.std.map(round) },
    algorithm: TRAINING.algorithm,
    parameters: { epochs: TRAINING.epochs, learningRate: TRAINING.learningRate,
      learningRateDecay: TRAINING.learningRateDecay, l2: TRAINING.l2 },
  };
  return { raw: { weights, bias, standardizer: fitted },
    committed: { ...modelBody, modelHash: digest(modelBody,
      "outsider/episode-data-engine/model/v1") } };
}

function predict(model, record, featureNames) {
  const values = standardize(vector(record, featureNames), model.standardizer);
  let linear = model.bias;
  values.forEach((value, index) => { linear += model.weights[index] * value; });
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

function predictiveMetrics(rows, scores) {
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
    threshold: TRAINING.predictionThreshold,
    confusion,
    calibrationClaimed: false,
  };
}

function groupBudgetFollowUp(rows, scores) {
  const groups = new Map();
  rows.forEach((row, index) => {
    const bucket = groups.get(row.groupRoot) ?? [];
    bucket.push({ row, score: scores[index] });
    groups.set(row.groupRoot, bucket);
  });
  const budgetGroups = Math.max(1, Math.floor(groups.size * FOLLOW_UP_GROUP_BUDGET_FRACTION));
  const ranked = [...groups.entries()].map(([root, items]) => ({ root, items,
    meanScore: items.reduce((sum, item) => sum + item.score, 0) / items.length }))
    .sort((left, right) => right.meanScore - left.meanScore || left.root.localeCompare(right.root));
  const selected = ranked.slice(0, budgetGroups);
  const auditBudgetGroups = Math.max(1,
    Math.floor(budgetGroups * AUDIT_RESERVE_FRACTION_OF_PRIORITY_BUDGET));
  const auditSelected = ranked.slice(budgetGroups).map((group) => ({ ...group,
    auditRankHash: digest({ root: group.root, seed: AUDIT_RESERVE_SEED },
      "outsider/episode-data-engine/random-audit-rank/v1") }))
    .sort((left, right) => left.auditRankHash.localeCompare(right.auditRankHash))
    .slice(0, auditBudgetGroups);
  const selectedRows = selected.flatMap((group) => group.items.map((item) => item.row));
  const yieldCount = selectedRows.filter((row) => row.label === 1).length;
  const totalTargets = rows.filter((row) => row.label === 1).length;
  const groupRoots = selected.map((group) => group.root).sort();
  const episodeRoots = selectedRows.map((row) => row.record.roots.episodeRoot).sort();
  const holdoutGroupRoots = [...groups.keys()].sort();
  const holdoutEpisodeRoots = rows.map((row) => row.record.roots.episodeRoot).sort();
  const rankedPriorityGroups = selected.map((group, index) => ({
    rank: index + 1,
    groupRoot: group.root,
    meanModelScore: round(group.meanScore),
    episodeRoots: group.items.map((item) => item.row.record.roots.episodeRoot).sort(),
  }));
  const randomAuditReserve = {
    method: "SHA256_PSEUDORANDOM_FROM_NONPRIORITY_HOLDOUT_GROUPS",
    outcomeBlindSelection: true,
    seedHash: digest(AUDIT_RESERVE_SEED,
      "outsider/episode-data-engine/random-audit-seed/v1"),
    fractionOfPriorityBudget: AUDIT_RESERVE_FRACTION_OF_PRIORITY_BUDGET,
    budgetGroups: auditBudgetGroups,
    selectedGroups: auditSelected.length,
    selectedGroupSetHash: digest(auditSelected.map((group) => group.root).sort(),
      "outsider/episode-data-engine/random-audit-group-set/v1"),
    selectedEpisodeSetHash: digest(auditSelected.flatMap((group) => group.items
      .map((item) => item.row.record.roots.episodeRoot)).sort(),
    "outsider/episode-data-engine/random-audit-episode-set/v1"),
    groups: auditSelected.map((group, index) => ({
      auditRank: index + 1,
      groupRoot: group.root,
      episodeRoots: group.items.map((item) => item.row.record.roots.episodeRoot).sort(),
    })),
  };
  return {
    policy: "TOP_MEAN_SCORE_GROUPS",
    budgetFraction: FOLLOW_UP_GROUP_BUDGET_FRACTION,
    budgetGroups,
    selectedGroups: selected.length,
    selectedRecords: selectedRows.length,
    negativeOutcomeFollowUpYield: yieldCount,
    precision: round(yieldCount / selectedRows.length),
    recall: round(yieldCount / totalTargets),
    selectedGroupSetHash: digest(groupRoots,
      "outsider/episode-data-engine/selected-group-set/v1"),
    selectedEpisodeSetHash: digest(episodeRoots,
      "outsider/episode-data-engine/selected-episode-set/v1"),
    selectedGroupRoots: groupRoots,
    selectedEpisodeRoots: episodeRoots,
    holdoutCandidateGroupSetHash: digest(holdoutGroupRoots,
      "outsider/episode-data-engine/holdout-candidate-group-set/v1"),
    holdoutCandidateEpisodeSetHash: digest(holdoutEpisodeRoots,
      "outsider/episode-data-engine/holdout-candidate-episode-set/v1"),
    rankedPriorityGroups,
    randomAuditReserve,
  };
}

function trainedAssessment(config, inputRows) {
  const labelled = inputRows.filter((row) => row.label !== null);
  const grouped = groupSplit(labelled, config);
  const reason = abstentionReason(labelled, grouped);
  if (reason !== null) fail("EPISODE_DATA_ENGINE_PINNED_TRAINING_DATA_ABSTAINED", reason);
  if (grouped.split.groupOverlap !== 0) fail("EPISODE_DATA_ENGINE_GROUP_SPLIT_OVERLAP");

  const baselineFit = fitLogistic(grouped.train, EPISODE_DATA_ENGINE_BASELINE_FEATURES);
  const issueFit = fitLogistic(grouped.train, EPISODE_DATA_ENGINE_ISSUE_FEATURES);
  const baselineScores = grouped.holdout.map((row) =>
    predict(baselineFit.raw, row.record, EPISODE_DATA_ENGINE_BASELINE_FEATURES));
  const issueScores = grouped.holdout.map((row) =>
    predict(issueFit.raw, row.record, EPISODE_DATA_ENGINE_ISSUE_FEATURES));
  const baselineVerification = {
    metrics: predictiveMetrics(grouped.holdout, baselineScores),
    followUpAtFixedGroupBudget: groupBudgetFollowUp(grouped.holdout, baselineScores),
  };
  const issueVerification = {
    metrics: predictiveMetrics(grouped.holdout, issueScores),
    followUpAtFixedGroupBudget: groupBudgetFollowUp(grouped.holdout, issueScores),
  };
  const baseFollowUp = baselineVerification.followUpAtFixedGroupBudget;
  const issueFollowUp = issueVerification.followUpAtFixedGroupBudget;
  const criteria = {
    aucStrictlyHigher: issueVerification.metrics.auc > baselineVerification.metrics.auc,
    brierStrictlyLower: issueVerification.metrics.sampleBrier
      < baselineVerification.metrics.sampleBrier,
    followUpYieldStrictlyHigher: issueFollowUp.negativeOutcomeFollowUpYield
      > baseFollowUp.negativeOutcomeFollowUpYield,
    followUpPrecisionNotLower: issueFollowUp.precision >= baseFollowUp.precision,
    sameHoldoutGroupBudget: issueFollowUp.budgetGroups === baseFollowUp.budgetGroups,
  };
  const clearImprovement = Object.values(criteria).every(Boolean);
  const selectedModel = clearImprovement ? "OPTIMIZED_ISSUE_FEATURES" : "BASELINE_COUNTS";
  const selectedFollowUp = clearImprovement ? issueFollowUp : baseFollowUp;
  return {
    dataset: { id: config.pin.id, revision: config.pin.revision,
      licenseId: config.pin.licenseId, sourceClass: config.pin.sourceClass },
    target: config.engineTarget,
    sourceNativeTarget: config.sourceTarget,
    positiveClassMeaning: config.negativeClassMeaning,
    decision: "EVALUATED_RETRIEVAL_PRIORITY_ONLY",
    sourceNativeNegativeLabelUsedAsRetrievalTarget: true,
    sourceNativeLabelUsedAsFeature: false,
    split: grouped.split,
    trainClasses: classCounts(grouped.train),
    holdoutClasses: classCounts(grouped.holdout),
    modelFitting: {
      offlineResearchFitPerformed: true,
      baseline: { records: grouped.train.length, groups: grouped.split.trainGroups,
        model: baselineFit.committed },
      optimizedIssueFeatures: { records: grouped.train.length, groups: grouped.split.trainGroups,
        model: issueFit.committed },
    },
    frozenHoldoutVerification: {
      records: grouped.holdout.length,
      groups: grouped.split.holdoutGroups,
      baseline: baselineVerification,
      optimizedIssueFeatures: issueVerification,
      deltaOptimizedMinusBaseline: {
        auc: round(issueVerification.metrics.auc - baselineVerification.metrics.auc),
        sampleBrier: round(issueVerification.metrics.sampleBrier
          - baselineVerification.metrics.sampleBrier),
        balancedAccuracy: round(issueVerification.metrics.balancedAccuracy
          - baselineVerification.metrics.balancedAccuracy),
        negativeOutcomeFollowUpYield: issueFollowUp.negativeOutcomeFollowUpYield
          - baseFollowUp.negativeOutcomeFollowUpYield,
        precision: round(issueFollowUp.precision - baseFollowUp.precision),
        recall: round(issueFollowUp.recall - baseFollowUp.recall),
      },
    },
    modelSelection: {
      policy: "OPTIMIZED_ONLY_IF_ALL_CLEAR_IMPROVEMENT_CRITERIA_PASS",
      criteria,
      clearImprovement,
      decision: clearImprovement ? "USE_OPTIMIZED_AS_NEXT_FEEDER_CANDIDATE" : "KEEP_BASELINE",
      selectedModel,
    },
    nextFeederCandidate: {
      purpose: "REQUEST_MISSING_OUTCOME_OR_RECOVERY_FOLLOW_UP",
      selectedModel,
      selectedGroups: selectedFollowUp.selectedGroups,
      selectedRecords: selectedFollowUp.selectedRecords,
      fixedPriorityGroupBudget: selectedFollowUp.budgetGroups,
      holdoutCandidateGroupSetHash: selectedFollowUp.holdoutCandidateGroupSetHash,
      holdoutCandidateEpisodeSetHash: selectedFollowUp.holdoutCandidateEpisodeSetHash,
      selectedGroupSetHash: selectedFollowUp.selectedGroupSetHash,
      selectedEpisodeSetHash: selectedFollowUp.selectedEpisodeSetHash,
      selectedGroupRoots: selectedFollowUp.selectedGroupRoots,
      selectedEpisodeRoots: selectedFollowUp.selectedEpisodeRoots,
      rankedPriorityGroups: selectedFollowUp.rankedPriorityGroups,
      randomAuditReserve: selectedFollowUp.randomAuditReserve,
      dispatched: false,
      automaticRetrieval: false,
      executable: false,
    },
    interpretation: {
      targetIsOutcomeFollowUpPriorityOnly: true,
      agentRiskClaimed: false,
      authorityClaimed: false,
      responsibilityClaimed: false,
      priceOrLossClaimed: false,
      populationCalibrationClaimed: false,
      crossDatasetGeneralizationClaimed: false,
      independentOutcomeClaimed: false,
      pseudoLabelsUsed: false,
    },
  };
}

function abstainedAssessment(config, inputRows) {
  const labelled = inputRows.filter((row) => row.label !== null);
  const connected = connectedRows(labelled.length > 0 ? labelled : inputRows, config);
  const groupCount = new Set(connected.map((row) => row.groupRoot)).size;
  const traceLab = config.pin.id === PUBLIC_AGENT_PINS.traceLab.id;
  return {
    dataset: { id: config.pin.id, revision: config.pin.revision,
      licenseId: config.pin.licenseId, sourceClass: config.pin.sourceClass },
    target: config.engineTarget,
    sourceNativeTarget: config.sourceTarget,
    positiveClassMeaning: config.negativeClassMeaning,
    decision: traceLab
      ? "ISSUE_FINDER_GAP_ACCOUNTING_ONLY_NO_OUTCOME"
      : "ABSTAIN_SINGLE_COLLECTOR_CORRELATION_COMPONENT",
    input: { records: inputRows.length, labelledRecords: labelled.length,
      correlationComponents: groupCount },
    modelFitting: null,
    frozenHoldoutVerification: null,
    modelSelection: { decision: "ABSTAIN", clearImprovement: false,
      selectedModel: null },
    nextFeederCandidate: null,
    interpretation: {
      issueFinderAccountingOnly: true,
      noOutcomeForTraining: traceLab,
      independentHoldoutUnavailable: !traceLab,
      sourceNativeNegativeLabelUsedAsRetrievalTarget: false,
      agentRiskClaimed: false,
      authorityClaimed: false,
      responsibilityClaimed: false,
      pseudoLabelsUsed: false,
    },
  };
}

function segment(sourceNativeCount = 0, sourceNativeAttribution = "NONE",
  independentCount = 0, independentAttribution = "NONE") {
  return { sourceNativeCount, sourceNativeAttribution, independentCount,
    independentAttribution, crossAttributionAdditionPermitted: false,
    additiveTotal: null };
}

function segments({ opportunityCensus = null, delegationAuthorization = null,
  actionTrace = null, effect = null, outcome = null, recovery = null,
  longitudinal = null } = {}) {
  return {
    opportunityCensus: opportunityCensus ?? segment(),
    delegationAuthorization: delegationAuthorization ?? segment(),
    actionTrace: actionTrace ?? segment(),
    effect: effect ?? segment(),
    outcome: outcome ?? segment(),
    recovery: recovery ?? segment(),
    longitudinal: longitudinal ?? segment(),
  };
}

function clearance(status, evidenceHash, fields = {}) {
  return { status, evidenceHash, ...fields };
}

function publicSourceLedgerEntry(config, rows, replay, assessment) {
  const source = replay.manifest.sources.find((candidate) =>
    candidate.id === config.pin.id);
  if (!source) fail("EPISODE_DATA_ENGINE_PUBLIC_SOURCE_MANIFEST_ENTRY_MISSING",
    config.pin.id);
  const sampled = config.pin.id === PUBLIC_AGENT_PINS.nebiusOpenHands.id;
  const nativeOutcomeCount = rows.filter((row) => row.label !== null).length;
  const sourceEvidence = digest({ manifestHash: replay.manifest.manifestHash, source },
    "outsider/episode-data-engine/source-ledger/public-source-evidence/v1");
  const privacyEvidence = digest(rows.map((row) => ({
    sourceObjectHash: row.record.dataset.sourceObjectHash,
    rawContentIncluded: row.record.privacy.rawContentIncluded,
  })), "outsider/episode-data-engine/source-ledger/public-privacy-evidence/v1");
  const fitting = assessment.modelFitting !== null;
  return {
    sourceId: config.pin.id,
    revision: config.pin.revision,
    revisionCommitment: digest({ sourceId: config.pin.id, revision: config.pin.revision,
      sourceEvidence }, "outsider/episode-data-engine/source-ledger/revision/v1"),
    sourceKind: "REAL_DIGITAL_AGENT_EPISODE",
    denominator: { class: "REALITY_EPISODE_RECORD", unit: "episode",
      units: rows.length, realitySegmentGapEligible: true },
    discovery: {
      channel: "CODE_FIXED_PUBLIC_SOURCE_POLICY_AFTER_PINNED_MANIFEST_REPLAY",
      candidateLedgerState: sampled
        ? "BOUNDED_SAMPLE_LEDGER_REPLAYED_NOT_EXHAUSTIVE"
        : "EXACT_DECLARED_SCOPE_LEDGER_REPLAYED",
      candidateLedgerEvidenceHash: sourceEvidence,
      declaredScope: source.sampling.kind,
      declaredScopeExhausted: !sampled,
      sourceUniverseExhausted: false,
      globalDiscoveryExhausted: false,
    },
    clearances: {
      revision: clearance(sampled || config.pin.id === PUBLIC_AGENT_PINS.openhandsFeedback.id
        ? "HOLD_LOGICAL_ROWS_WITHOUT_UPSTREAM_OBJECT_INCLUSION_PROOF"
        : "PASS_PINNED_SOURCE_OBJECT_AND_REVISION_REPLAYED", sourceEvidence),
      rights: clearance("HOLD_PINNED_LICENSE_DECLARATION_NO_LEGAL_CONCLUSION",
        sourceEvidence, { legalConclusionEstablished: false,
          productionTrainingAuthorized: false }),
      privacy: clearance(
        "HOLD_MINIMIZED_DERIVATION_RAW_SOURCE_PRIVATE_NO_PII_GUARANTEE",
        privacyEvidence, { rawContentProjected: false, noPiiGuaranteed: false }),
      use: clearance("LOCAL_OFFLINE_RESEARCH_MODEL_FITTING_OR_GAP_ACCOUNTING_ONLY",
        sourceEvidence, { offlineModelFittingAllowed: true,
          authorizedTrainingAllowed: false, networkAdmissionAllowed: false,
          delegationAuthorityAllowed: false }),
    },
    admission: { realitySegmentGapAccounting: true,
      offlineModelFitting: fitting, authorizedTraining: false,
      networkAdmission: false, delegationAuthority: false },
    segments: segments({
      actionTrace: segment(rows.length, "SOURCE_REPLAYED_DIGITAL_ACTION_RESULT_TRACE"),
      outcome: segment(nativeOutcomeCount, `SOURCE_NATIVE_${config.nativeOutcomeKind}`),
    }),
    modelUse: {
      offlineModelFitting: { state: fitting ? "PERFORMED_IN_ENGINE" : "NOT_PERFORMED",
        modelCount: fitting ? 2 : 0, automaticallyDeployed: false },
      authorizedTraining: { performed: false, rowsAuthorized: 0, jobsAuthorized: 0 },
    },
  };
}

function sourceLedgerEntries(replay, rows, supplements, assessments) {
  const entries = SOURCE_CONFIGS.map((config) => publicSourceLedgerEntry(config,
    rows.filter((row) => row.config.pin.id === config.pin.id), replay,
    assessments.find((item) => item.dataset.id === config.pin.id)));
  const cua = supplements.cua;
  const cuaEpisodes = cua.bundle.summary.counts.normalizedEpisodes;
  const cuaOutcomes = cua.bundle.summary.counts.outcomeMajorityAvailableEpisodes;
  entries.push({
    sourceId: CUA_VERIFIER_BENCH_PIN.id,
    revision: CUA_VERIFIER_BENCH_PIN.revision,
    revisionCommitment: digest({ datasetId: CUA_VERIFIER_BENCH_PIN.id,
      revision: CUA_VERIFIER_BENCH_PIN.revision,
      manifestHash: cua.verified.manifestHash },
    "outsider/episode-data-engine/source-ledger/revision/v1"),
    sourceKind: "REAL_DIGITAL_AGENT_EPISODE_WITH_INDEPENDENT_TERMINAL_REVIEW",
    denominator: { class: "REALITY_EPISODE_RECORD", unit: "episode",
      units: cuaEpisodes, realitySegmentGapEligible: true },
    discovery: { channel: "CODE_FIXED_SUPPLEMENT_AFTER_SOURCE_MANIFEST_REPLAY",
      candidateLedgerState: "EXACT_DECLARED_SCOPE_LEDGER_REPLAYED",
      candidateLedgerEvidenceHash: cua.verified.manifestHash,
      declaredScope: "COMPLETE_SELECTED_LOGICAL_TRAJECTORY_AND_ANNOTATION_SPLITS",
      declaredScopeExhausted: true, sourceUniverseExhausted: false,
      globalDiscoveryExhausted: false },
    clearances: {
      revision: clearance("HOLD_LOGICAL_ROWS_WITHOUT_UPSTREAM_OBJECT_INCLUSION_PROOF",
        cua.verified.manifestHash),
      rights: clearance("HOLD_PINNED_LICENSE_DECLARATION_NO_LEGAL_CONCLUSION",
        cua.verified.manifestHash, { legalConclusionEstablished: false,
          productionTrainingAuthorized: false }),
      privacy: clearance("HOLD_MINIMIZED_PROJECTION_NO_PII_GUARANTEE",
        cua.verified.verificationHash,
        { rawContentProjected: false, noPiiGuaranteed: false }),
      use: clearance("LOCAL_OFFLINE_RESEARCH_MODEL_FITTING_ONLY",
        cua.trainingVerified.reportHash, { offlineModelFittingAllowed: true,
          authorizedTrainingAllowed: false, networkAdmissionAllowed: false,
          delegationAuthorityAllowed: false }),
    },
    admission: { realitySegmentGapAccounting: true, offlineModelFitting: true,
      authorizedTraining: false, networkAdmission: false, delegationAuthority: false },
    segments: segments({
      actionTrace: segment(cuaEpisodes, "SOURCE_REPLAYED_BROWSER_ACTION_TRACE"),
      outcome: segment(cuaOutcomes, "SOURCE_NATIVE_TERMINAL_OUTCOME_MAJORITY",
        cuaOutcomes, "BLIND_HUMAN_TERMINAL_REVIEW_SAME_EPISODES_NOT_ADDITIVE"),
    }),
    modelUse: {
      offlineModelFitting: { state: "REPLAYED_FROM_VERIFIED_SUPPLEMENT",
        modelCount: cua.training.report.assessments.length * 2,
        automaticallyDeployed: false },
      authorizedTraining: { performed: false, rowsAuthorized: 0, jobsAuthorized: 0 },
    },
  });
  const reboot = supplements.reboot.artifact;
  entries.push({
    sourceId: REBOOT_DATASET_ID,
    revision: REBOOT_REVISION,
    revisionCommitment: digest({ datasetId: REBOOT_DATASET_ID,
      revision: REBOOT_REVISION, sourceRoot: reboot.source.sourceRoot },
    "outsider/episode-data-engine/source-ledger/revision/v1"),
    sourceKind: "REAL_EMBODIED_ACTION_EFFECT_EPISODE",
    denominator: { class: "REALITY_EPISODE_RECORD", unit: "episode",
      units: reboot.quality.projectedEpisodes, realitySegmentGapEligible: true },
    discovery: { channel: "CODE_FIXED_SUPPLEMENT_AFTER_EXPLICIT_TREE_SELECTION_REPLAY",
      candidateLedgerState: "EXACT_DECLARED_SCOPE_LEDGER_REPLAYED",
      candidateLedgerEvidenceHash: reboot.source.manifestHash,
      declaredScope: "ALL_DECLARED_ACTION_STATE_FILES_EXPLICIT_MEDIA_EXCLUSION",
      declaredScopeExhausted: true, sourceUniverseExhausted: false,
      globalDiscoveryExhausted: false },
    clearances: {
      revision: clearance("PASS_PINNED_REVISION_SELECTED_TREE_BYTES_REPLAYED",
        reboot.source.sourceRoot),
      rights: clearance("HOLD_UNRESOLVED_LICENSE_MISMATCH", reboot.artifactHash,
        { legalConclusionEstablished: false, productionTrainingAuthorized: false }),
      privacy: clearance("HOLD_RAW_PRIVATE_NO_PII_GUARANTEE", reboot.artifactHash,
        { rawContentProjected: false, noPiiGuaranteed: false }),
      use: clearance("HOLD_NO_MODEL_FITTING_UNRESOLVED_RIGHTS_AND_GROUP_SPLIT",
        reboot.artifactHash, { offlineModelFittingAllowed: false,
          authorizedTrainingAllowed: false, networkAdmissionAllowed: false,
          delegationAuthorityAllowed: false }),
    },
    admission: { realitySegmentGapAccounting: true, offlineModelFitting: false,
      authorizedTraining: false, networkAdmission: false, delegationAuthority: false },
    segments: segments({
      actionTrace: segment(reboot.quality.projectedEpisodes,
        "SOURCE_NATIVE_ROBOT_COMMAND_ACTION_STATE_TRACE"),
      effect: segment(reboot.quality.projectedEpisodes,
        "SOURCE_NATIVE_PHYSICAL_ACTION_STATE_EFFECT_TRACE"),
      recovery: segment(reboot.quality.validFailureWindows,
        "SOURCE_NATIVE_RECOVERY_WINDOW_NOT_INDEPENDENT_LONGITUDINAL_TRUTH"),
    }),
    modelUse: { offlineModelFitting: { state: "NOT_PERFORMED", modelCount: 0,
      automaticallyDeployed: false }, authorizedTraining: { performed: false,
      rowsAuthorized: 0, jobsAuthorized: 0 } },
  });
  const sentinel = supplements.sentinel;
  entries.push({
    sourceId: SENTINEL_DATASET_ID,
    revision: { githubCommit: AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT,
      huggingFaceRevision: AGENT_TRAJECTORY_SENTINEL_HF_REVISION },
    revisionCommitment: digest({ githubCommit: AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT,
      huggingFaceRevision: AGENT_TRAJECTORY_SENTINEL_HF_REVISION,
      sourceRoot: sentinel.report.boundedSlice.sourceRoot },
    "outsider/episode-data-engine/source-ledger/revision/v1"),
    sourceKind: "PAIRED_RECOVERY_MORPHOLOGY_EVALUATION",
    denominator: { class: "PAIRED_RECOVERY_MORPHOLOGY_EVALUATION", unit: "pair",
      units: sentinel.report.boundedSlice.pairedEpisodes,
      realitySegmentGapEligible: false },
    discovery: { channel: "CODE_FIXED_BOUNDED_SLICE_AFTER_GIT_TREE_ANCESTRY_REPLAY",
      candidateLedgerState: "EXACT_DECLARED_SCOPE_LEDGER_REPLAYED",
      candidateLedgerEvidenceHash: sentinel.report.boundedSlice.pairingRoot,
      declaredScope: "EXACT_SELECTED_SOURCE_AND_RECOVERY_PAIR_MANIFEST",
      declaredScopeExhausted: true, sourceUniverseExhausted: false,
      globalDiscoveryExhausted: false },
    clearances: {
      revision: clearance("PASS_GIT_ROOT_TO_SELECTED_LEAF_ANCESTRY_REPLAYED",
        sentinel.report.boundedSlice.sourceRoot),
      rights: clearance("FAIL_CLOSED", sentinel.report.rights.evidenceRoot,
        { legalConclusionEstablished: false, productionTrainingAuthorized: false }),
      privacy: clearance("HOLD_HEURISTIC_SCAN_NO_PII_GUARANTEE", sentinel.report.reportHash,
        { rawContentProjected: false, noPiiGuaranteed: false }),
      use: clearance("EVALUATION_ONLY_NO_MODEL_FITTING", sentinel.receipt.receiptHash,
        { offlineModelFittingAllowed: false, authorizedTrainingAllowed: false,
          networkAdmissionAllowed: false, delegationAuthorityAllowed: false }),
    },
    admission: { realitySegmentGapAccounting: false, offlineModelFitting: false,
      authorizedTraining: false, networkAdmission: false, delegationAuthority: false },
    segments: segments({
      actionTrace: segment(sentinel.report.boundedSlice.sourceEpisodes,
        "PAIRED_MORPHOLOGY_SOURCE_TRACE_NOT_REALITY_GAP_COVERAGE"),
      recovery: segment(sentinel.report.boundedSlice.recoveryEpisodes,
        "PAIRED_MORPHOLOGY_RECOVERY_TRACE_NOT_LONGITUDINAL_TRUTH"),
    }),
    modelUse: { offlineModelFitting: { state: "NOT_PERFORMED", modelCount: 0,
      automaticallyDeployed: false }, authorizedTraining: { performed: false,
      rowsAuthorized: 0, jobsAuthorized: 0 } },
  });
  const stale = supplements.staleConstraint;
  entries.push({
    sourceId: STALE_CONSTRAINT_DATASET_ID,
    revision: STALE_CONSTRAINT_ZENODO_RECORD.revision,
    revisionCommitment: digest({ datasetId: STALE_CONSTRAINT_DATASET_ID,
      revision: STALE_CONSTRAINT_ZENODO_RECORD.revision,
      sourceRoot: stale.report.sourceTrust.sourceRoot },
    "outsider/episode-data-engine/source-ledger/revision/v1"),
    sourceKind: "CONSTRUCTED_OFFLINE_RESEARCH_EPISODE",
    denominator: { class: "CONSTRUCTED_EPISODE_BYTE_COMMITMENT", unit: "episodeByteCommitment",
      units: stale.report.sourceReplay.confirmatoryEpisodes,
      realitySegmentGapEligible: false },
    discovery: { channel: "CODE_FIXED_PINNED_ARCHIVE_AFTER_RECORD_AND_ARCHIVE_INDEX_REPLAY",
      candidateLedgerState: "EXACT_DECLARED_SCOPE_LEDGER_REPLAYED",
      candidateLedgerEvidenceHash: stale.archiveIndex.archiveIndexHash,
      declaredScope: "ALL_CONFIRMATORY_EPISODES_IN_PINNED_ARCHIVE_PATH",
      declaredScopeExhausted: true, sourceUniverseExhausted: false,
      globalDiscoveryExhausted: false },
    clearances: {
      revision: clearance("PASS_PINNED_RECORD_ARCHIVE_BYTES_AND_CRC_REPLAYED",
        stale.report.sourceTrust.sourceRoot),
      rights: clearance("LOCAL_OFFLINE_DERIVED_STRUCTURAL_RESEARCH_ONLY",
        stale.report.reportHash, { legalConclusionEstablished: false,
          productionTrainingAuthorized: false }),
      privacy: clearance("HOLD_RAW_PRIVATE_HEURISTIC_REVIEW_NO_PII_GUARANTEE",
        stale.report.reportHash, { rawContentProjected: false, noPiiGuaranteed: false }),
      use: clearance("LOCAL_OFFLINE_DERIVED_STRUCTURAL_MODEL_FITTING_ONLY",
        stale.report.reportHash, { offlineModelFittingAllowed: true,
          authorizedTrainingAllowed: false, networkAdmissionAllowed: false,
          delegationAuthorityAllowed: false }),
    },
    admission: { realitySegmentGapAccounting: false, offlineModelFitting: true,
      authorizedTraining: false, networkAdmission: false, delegationAuthority: false },
    segments: segments(),
    modelUse: { offlineModelFitting: {
      state: "REPLAYED_FROM_VERIFIED_SUPPLEMENT", modelCount: 2,
      automaticallyDeployed: false }, authorizedTraining: { performed: false,
      rowsAuthorized: 0, jobsAuthorized: 0 } },
  });
  return entries;
}

function sourceLedgerDeclaration(sourceEntries) {
  const declarations = sourceEntries.map((source) => ({
    sourceId: source.sourceId,
    revisionCommitment: source.revisionCommitment,
    sourceKind: source.sourceKind,
    denominatorClass: source.denominator.class,
  })).sort((left, right) => left.sourceId.localeCompare(right.sourceId));
  return {
    scopeId: "ENGINE_V4_CODE_FIXED_CURRENT_CANDIDATE_UNIVERSE",
    declarationEvidenceHash: digest({
      selectionAuthority:
        "CODE_FIXED_ENGINE_POLICY_AFTER_ALL_SOURCE_SPECIFIC_REPLAYS",
      declarations,
      externalDiscoveryPerformed: false,
    }, "outsider/episode-data-engine/source-ledger/declaration/v1"),
    externalDiscoveryPerformed: false,
    externalDiscoveryQueryLedger: null,
  };
}

function sourceCandidateReason(source) {
  if (source.sourceId === SENTINEL_DATASET_ID) {
    return "QUARANTINE_EVALUATION_ONLY_RIGHTS_FAIL_CLOSED_NO_REALITY_GAP_OR_MODEL_FITTING_ADMISSION";
  }
  if (source.sourceId === REBOOT_DATASET_ID) {
    return "ADMITTED_FOR_TYPED_REALITY_GAP_ACCOUNTING_ONLY_WITH_RIGHTS_AND_GROUP_SPLIT_HOLDS";
  }
  if (source.sourceId === STALE_CONSTRAINT_DATASET_ID) {
    return "ADMITTED_AS_CONSTRUCTED_LOCAL_OFFLINE_RESEARCH_ONLY_NOT_REALITY_OR_AUTHORIZED_TRAINING";
  }
  return source.admission.offlineModelFitting
    ? "ADMITTED_FOR_TYPED_REALITY_GAP_ACCOUNTING_AND_LOCAL_OFFLINE_MODEL_FITTING_ONLY"
    : "ADMITTED_FOR_TYPED_REALITY_GAP_ACCOUNTING_ONLY";
}

function sourceLedgerCandidates(sourceEntries) {
  return sourceEntries.map((source) => ({
    candidateId: source.sourceId,
    disposition: source.sourceId === SENTINEL_DATASET_ID
      ? "QUARANTINE_EVAL" : "ADMITTED",
    reason: sourceCandidateReason(source),
    sourceEntryBound: true,
    gates: {
      acquisition: source.discovery.declaredScopeExhausted
        ? "DECLARED_SOURCE_SCOPE_REPLAYED_EXACT"
        : "BOUNDED_SOURCE_SAMPLE_REPLAYED_SCOPE_NOT_EXHAUSTED",
      sourceReplay: source.discovery.candidateLedgerState,
      revision: source.clearances.revision.status,
      rights: source.clearances.rights.status,
      privacy: source.clearances.privacy.status,
      use: source.clearances.use.status,
    },
  }));
}

function episodeCompleteness(sourceLedger) {
  const registry = sourceLedger.denominatorRegistry.domains;
  const realityEpisodeRecords = registry.find((item) =>
    item.class === "REALITY_EPISODE_RECORD").units;
  const coverage = sourceLedger.segmentCoverageAttribution.segments;
  return {
    method: "AIDE_INSPIRED_EVIDENCE_GAP_FINDER_FROM_TYPED_SOURCE_LEDGER",
    segmentDefinitions: {
      opportunityCensus:
        "prospectively registered task, attempt or opportunity census evidence",
      delegationAuthorization:
        "prospectively registered delegation and authorization evidence",
      actionTrace: "source-replayed command, action or result trace; not physical effect",
      effect: "source-native or independent external state change observation",
      outcome: "terminal outcome by separately recorded source-native and independent attribution",
      recovery: "repair, rollback or recovery observation; not necessarily longitudinal truth",
      longitudinal: "independent delayed consequence or recovery observation",
    },
    denominatorRegistry: structuredClone(sourceLedger.denominatorRegistry),
    totals: {
      realityEpisodeRecords,
      opportunityCensusSourceNative: coverage.opportunityCensus.sourceNativeCount,
      opportunityCensusIndependent: coverage.opportunityCensus.independentCount,
      delegationAuthorizationSourceNative:
        coverage.delegationAuthorization.sourceNativeCount,
      delegationAuthorizationIndependent:
        coverage.delegationAuthorization.independentCount,
      actionTraceSourceNative: coverage.actionTrace.sourceNativeCount,
      actionTraceIndependent: coverage.actionTrace.independentCount,
      effectSourceNative: coverage.effect.sourceNativeCount,
      effectIndependent: coverage.effect.independentCount,
      outcomeSourceNative: coverage.outcome.sourceNativeCount,
      outcomeIndependent: coverage.outcome.independentCount,
      recoverySourceNative: coverage.recovery.sourceNativeCount,
      recoveryIndependent: coverage.recovery.independentCount,
      longitudinalSourceNative: coverage.longitudinal.sourceNativeCount,
      longitudinalIndependent: coverage.longitudinal.independentCount,
      crossAttributionAdditionPermitted: false,
      crossSegmentAdditionPermitted: false,
      completeEpisodeIntersectionCount:
        sourceLedger.segmentCoverageAttribution.completeEpisodeIntersectionCount,
    },
    bySource: sourceLedger.sources.map((source) => ({ sourceId: source.sourceId,
      sourceKind: source.sourceKind, denominator: structuredClone(source.denominator),
      segments: structuredClone(source.segments) })),
    rankedGaps: [
      { rank: 1, segment: "INDEPENDENT_LONGITUDINAL_OUTCOME_RECOVERY",
        missingRecords: realityEpisodeRecords - coverage.longitudinal.independentCount },
      { rank: 2, segment: "DELEGATION_AUTHORIZATION",
        missingRecords:
          realityEpisodeRecords - coverage.delegationAuthorization.sourceNativeCount },
      { rank: 3, segment: "OPPORTUNITY_CENSUS",
        missingRecords: realityEpisodeRecords - coverage.opportunityCensus.sourceNativeCount },
      { rank: 4, segment: "PHYSICAL_EFFECT_TRACE_FOR_EMBODIED_TRANSFER",
        missingRecords: realityEpisodeRecords - coverage.effect.sourceNativeCount },
    ],
    completeEpisodeClaimed: false,
  };
}

function supplementalSourceTrust(supplements) {
  const cua = supplements.cua;
  const reboot = supplements.reboot.artifact;
  const sentinel = supplements.sentinel;
  const staleConstraint = supplements.staleConstraint;
  return [
    {
      datasetId: CUA_VERIFIER_BENCH_PIN.id,
      revision: CUA_VERIFIER_BENCH_PIN.revision,
      trustClass: "RAW_SOURCE_AND_MANIFEST_REPLAY_BOUND",
      sourceReplayStatus: cua.verified.status,
      sourceRecordCount: cua.verified.records,
      manifestHash: cua.verified.manifestHash,
      recordSetHash: cua.verified.recordSetHash,
      summaryHash: cua.verified.summaryHash,
      fullSourceVerificationHash: cua.verified.verificationHash,
      trainingReportHash: cua.trainingVerified.reportHash,
      modelSetHash: cua.trainingVerified.modelSetHash,
      trainingReceiptHash: cua.trainingVerified.receiptHash,
      standaloneSealAccepted: false,
    },
    {
      datasetId: REBOOT_DATASET_ID,
      revision: REBOOT_REVISION,
      trustClass: "FULL_SOURCE_REPLAY",
      sourceReplayStatus: supplements.reboot.verified.verificationLevel,
      sourceRecordCount: reboot.quality.projectedEpisodes,
      frameCount: reboot.quality.framesObserved,
      sourceRoot: reboot.source.sourceRoot,
      manifestHash: reboot.source.manifestHash,
      episodeProjectionHash: reboot.episodeProjection.projectionHash,
      sourceArtifactHash: reboot.artifactHash,
      standaloneSealAccepted: false,
    },
    {
      datasetId: SENTINEL_DATASET_ID,
      revision: {
        githubCommit: AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT,
        huggingFaceRevision: AGENT_TRAJECTORY_SENTINEL_HF_REVISION,
      },
      githubRootTree: sentinel.report.sourcePins.githubRootTree,
      githubTreeAncestryVerified:
        sentinel.report.sourcePins.githubTreeAncestryVerified,
      trustClass: "FULL_GIT_ANCESTRY_SELECTED_BYTES_REPORT_AND_RECEIPT_REPLAY_BOUND",
      sourceReplayStatus: "FULL_GIT_ANCESTRY_SOURCE_REPORT_AND_RECEIPT_REBUILT",
      provenanceGate: SENTINEL_PROVENANCE_GATE,
      sourceAdmissionEligible: false,
      disposition: sentinel.report.disposition,
      pairedRecoveryEvaluationPairs: sentinel.report.boundedSlice.pairedEpisodes,
      sourceTraceEpisodes: sentinel.report.boundedSlice.sourceEpisodes,
      recoveryTraceEpisodes: sentinel.report.boundedSlice.recoveryEpisodes,
      rawDataObjects: sentinel.report.boundedSlice.rawDataObjects,
      rawDataBytes: sentinel.report.boundedSlice.rawDataBytes,
      sourceRoot: sentinel.report.boundedSlice.sourceRoot,
      pairingRoot: sentinel.report.boundedSlice.pairingRoot,
      reportHash: sentinel.report.reportHash,
      reportFileSha256: sentinel.verified.reportFileSha256,
      receiptHash: sentinel.receipt.receiptHash,
      predecessorStatus: sentinel.supersessionMarker.status,
      predecessorSupersessionMarkerHash:
        sentinel.supersessionMarker.markerHash,
      predecessorSupersessionMarkerFileSha256:
        sentinel.supersessionMarkerFileSha256,
      rightsGate: sentinel.report.rights.rightsGate,
      trainingUseAllowed: sentinel.report.rights.trainingUseAllowed,
      offlineResearchTrainingRows: 0,
      productionTrainingRows: 0,
      networkAdmissionRows: 0,
      networkProjectionRows: 0,
      standaloneSealAccepted: false,
    },
    {
      datasetId: STALE_CONSTRAINT_DATASET_ID,
      revision: STALE_CONSTRAINT_ZENODO_RECORD.revision,
      version: STALE_CONSTRAINT_ZENODO_RECORD.version,
      doi: STALE_CONSTRAINT_ZENODO_RECORD.doi,
      trustClass: "FULL_PINNED_ARCHIVE_REPORT_AND_RECEIPT_REPLAY_BOUND",
      sourceReplayStatus: "FULL_ARCHIVE_BYTE_CRC_REPORT_AND_RECEIPT_REBUILT",
      sourceClass: staleConstraint.report.dataset.sourceClass,
      constructedEpisodeByteCommitments:
        staleConstraint.report.sourceReplay.confirmatoryEpisodes,
      schemaInspectedStructuralResearchRows:
        staleConstraint.report.sourceReplay.schemaInspectedEpisodes,
      opaqueOutcomeBlindAuditByteCommitments:
        staleConstraint.report.sourceReplay.opaqueAuditByteCommitments,
      sourceRoot: staleConstraint.report.sourceTrust.sourceRoot,
      archiveIndexHash: staleConstraint.archiveIndex.archiveIndexHash,
      reportHash: staleConstraint.report.reportHash,
      receiptHash: staleConstraint.receipt.receiptHash,
      groupSetHash: staleConstraint.report.sourceReplay.groupSetHash,
      trainGroupSetHash:
        staleConstraint.report.offlineResearchTraining.split.trainGroupSetHash,
      holdoutGroupSetHash:
        staleConstraint.report.offlineResearchTraining.split.holdoutGroupSetHash,
      auditGroupSetHash:
        staleConstraint.report.offlineResearchTraining.split.auditReserve.groupSetHash,
      auditEpisodeSetHash:
        staleConstraint.report.offlineResearchTraining.split.auditReserve.episodeSetHash,
      researchQueueDecision:
        staleConstraint.report.offlineResearchTraining.researchQueueDecision,
      productionDecision:
        staleConstraint.report.offlineResearchTraining.productionDecision,
      predecessorStatus:
        staleConstraint.report.successorBoundary.predecessorStatus,
      predecessorUsedAsAuthority: false,
      predecessorSupersessionMarkerStatus:
        staleConstraint.supersessionMarker.status,
      predecessorSupersessionMarkerFileSha256:
        staleConstraint.supersessionMarkerFileSha256,
      networkProjectionRows: 0,
      productionTrainingRows: 0,
      realOutcomeRows: 0,
      standaloneSealAccepted: false,
    },
  ];
}

function validReplay(replay) {
  return replay?.ok === true && replay.status === "FULL_SOURCE_REPRODUCED"
    && replay.attestation?.derivation === "FULL_SOURCE_REDERIVED"
    && HASH.test(replay.attestation?.verificationHash ?? "")
    && HASH.test(replay.attestation?.manifestHash ?? "")
    && HASH.test(replay.attestation?.recordSetHash ?? "")
    && HASH.test(replay.attestation?.summaryHash ?? "")
    && Array.isArray(replay.attestation?.verifiedSourceObjectHashes)
    && replay.attestation.verifiedSourceObjectHashes.length > 0
    && replay.attestation.verifiedSourceObjectHashes.every((object) => HASH.test(object?.sha256 ?? ""))
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

function trustedSource(replay) {
  return {
    trustClass: "FULL_SOURCE_REPLAY_BOUND",
    derivation: "FULL_SOURCE_REDERIVED",
    fullSourceVerificationHash: replay.attestation.verificationHash,
    manifestHash: replay.attestation.manifestHash,
    recordSetHash: replay.attestation.recordSetHash,
    summaryHash: replay.attestation.summaryHash,
    sourceRecordCount: replay.attestation.records,
    verifiedSourceObjectSetHash: digest(replay.attestation.verifiedSourceObjectHashes,
      "outsider/episode-data-engine/verified-source-object-set/v1"),
    sourceScope: structuredClone(replay.attestation.scope),
    sourceScopeHash: digest(replay.attestation.scope,
      "outsider/episode-data-engine/source-scope/v1"),
    sourceVerifierImplementationHash: digest({
      artifactVerifier: SOURCE_VERIFIER_FILE_HASH,
      corpusAdapter: CORPUS_ADAPTER_FILE_HASH,
      sentinelAdapter: SENTINEL_ADAPTER_FILE_HASH,
      staleConstraintAdapter: STALE_CONSTRAINT_ADAPTER_FILE_HASH,
      canonicalizer: CANONICALIZER_FILE_HASH,
    }, "outsider/episode-data-engine/source-verifier-bundle/v2"),
  };
}

function sentinelGapQueue(supplements) {
  const sentinel = supplements.sentinel;
  const queue = {
    datasetId: SENTINEL_DATASET_ID,
    revision: {
      githubCommit: AGENT_TRAJECTORY_SENTINEL_GITHUB_COMMIT,
      huggingFaceRevision: AGENT_TRAJECTORY_SENTINEL_HF_REVISION,
    },
    lane: "QUARANTINE_EVALUATION_ONLY_GAP_RECOVERY_MORPHOLOGY",
    sourceClass: "PAIRED_RECOVERY_EVALUATION_ONLY",
    pairedRecoveryEvaluationPairs: sentinel.report.boundedSlice.pairedEpisodes,
    observed: {
      pairedRecoveryEvaluationMorphologies:
        sentinel.report.boundedSlice.pairedEpisodes,
      sourceTraceEpisodes: sentinel.report.boundedSlice.sourceEpisodes,
      recoveryTraceEpisodes: sentinel.report.boundedSlice.recoveryEpisodes,
      publisherNowCorrectTrue:
        sentinel.report.replayedPublisherClaims.publisherNowCorrectTrue,
      publisherNowCorrectFalse:
        sentinel.report.replayedPublisherClaims.publisherNowCorrectFalse,
      realExternalEffectTrace: 0,
      independentOutcomeTruth: 0,
      independentLongitudinalOutcomeRecovery: 0,
      opportunityCensus: 0,
      delegationAuthorization: 0,
    },
    evaluationPurpose: "COMPARE_FAILURE_TO_REPAIR_TRACE_MORPHOLOGY_ONLY",
    mayFillRealityEvidenceGap: false,
    sourceRoot: sentinel.report.boundedSlice.sourceRoot,
    pairingRoot: sentinel.report.boundedSlice.pairingRoot,
    reportHash: sentinel.report.reportHash,
    receiptHash: sentinel.receipt.receiptHash,
    rightsStatus: sentinel.report.rights.rightsGate,
    trainingDecision: sentinel.report.useBoundary.trainingDecision,
    provenanceGate: SENTINEL_PROVENANCE_GATE,
    sourceAdmissionEligible: false,
    offlineResearchTrainingRows: 0,
    productionTrainingRows: 0,
    networkAdmissionRows: 0,
    networkProjectionRows: 0,
    rawTraceProjectionRows: 0,
    artifactDisposition: AGENT_TRAJECTORY_SENTINEL_DISPOSITION,
    state: AGENT_TRAJECTORY_SENTINEL_DISPOSITION,
    standaloneSealAccepted: false,
    networkProjection: false,
    dispatched: false,
    automaticRetrieval: false,
    actionReady: false,
    executable: false,
  };
  return { ...queue, queueHash: digest(queue, DATASET_GAP_QUEUE_DOMAIN) };
}

function staleConstraintFeederQueue(supplements) {
  const report = supplements.staleConstraint.report;
  const training = report.offlineResearchTraining;
  const selected = training.selectedQueue;
  const split = training.split;
  const audit = split.auditReserve;
  const queue = {
    datasetId: STALE_CONSTRAINT_DATASET_ID,
    revision: STALE_CONSTRAINT_ZENODO_RECORD.revision,
    version: STALE_CONSTRAINT_ZENODO_RECORD.version,
    lane: "CONSTRUCTED_OFFLINE_RESEARCH_ACQUISITION_RANKING",
    sourceClass: "CONSTRUCTED_OFFLINE_RESEARCH",
    sourceNativeTarget: training.target,
    sourceNativeTargetIsAuthorityTruth: false,
    sourceNativeTargetIsIndependentRealOutcome: false,
    purpose: training.purpose,
    selectedModel: selected.selectedModel,
    sourceRoot: report.sourceTrust.sourceRoot,
    archiveIndexHash: report.sourceTrust.archiveIndexHash,
    reportHash: report.reportHash,
    receiptHash: supplements.staleConstraint.receipt.receiptHash,
    holdoutCandidateGroupSetHash: selected.groupSetHash,
    holdoutCandidateEpisodeSetHash: selected.episodeSetHash,
    fixedPriorityGroupBudget: selected.selectedGroups,
    selectedEpisodes: selected.selectedEpisodes,
    rankedPriorityGroups: selected.rankedGroups,
    randomAuditReserve: {
      method: split.method,
      outcomeBlindSelection: true,
      selectedBeforeLabelInspection: audit.selectedBeforeLabelInspection,
      labelsUsedForSelection: audit.labelsUsedForSelection,
      labelsInspectedForThisReport: audit.labelsInspectedForThisReport,
      metricsComputed: audit.metricsComputed,
      jsonParses: audit.jsonParses,
      scoreContainerAccesses: audit.scoreContainerAccesses,
      scoreOwnKeyEnumerations: audit.scoreOwnKeyEnumerations,
      scorePropertyDescriptorReads: audit.scorePropertyDescriptorReads,
      scoreValueReads: audit.scoreValueReads,
      groups: split.auditReserveGroups,
      episodes: split.auditReserveEpisodes,
      groupSetHash: audit.groupSetHash,
      episodeSetHash: audit.episodeSetHash,
    },
    baselineMetrics: training.baseline.holdoutMetrics,
    candidateMetrics: training.candidate.holdoutMetrics,
    deltasCandidateMinusBaseline: training.deltasCandidateMinusBaseline,
    predeclaredPromotionGates: training.predeclaredPromotionGates,
    researchQueueDecision: training.researchQueueDecision,
    productionDecision: training.productionDecision,
    offlineDerivedStructuralResearchRows:
      report.admissions.offlineDerivedStructuralResearchRows,
    opaqueAuditByteCommitments: report.admissions.opaqueAuditByteCommitments,
    productionTrainingRows: 0,
    networkAdmissionRows: 0,
    networkProjectionRows: 0,
    realOutcomeRows: 0,
    rawTextIncluded: false,
    state: "CONSTRUCTED_OFFLINE_RESEARCH",
    standaloneSealAccepted: false,
    networkProjection: false,
    dispatched: false,
    automaticRetrieval: false,
    actionReady: false,
    executable: false,
  };
  return { ...queue, queueHash: digest(queue, FEEDER_QUEUE_DOMAIN) };
}

function buildReport(replay, supplements) {
  const rows = prepare(replay);
  const assessments = SOURCE_CONFIGS.map((config) => {
    const sourceRows = rows.filter((row) => row.config.pin.id === config.pin.id);
    return config.offlineModelFittingEligible
      ? trainedAssessment(config, sourceRows)
      : abstainedAssessment(config, sourceRows);
  });
  const fitted = assessments.filter((item) => item.modelFitting !== null);
  if (fitted.length !== 2) fail("EPISODE_DATA_ENGINE_FITTED_SOURCE_COUNT_INVALID");
  const sourceLedgerInputs = sourceLedgerEntries(replay, rows, supplements, assessments);
  const sourceLedgerScope = sourceLedgerDeclaration(sourceLedgerInputs);
  const sourceLedgerCandidatesInput = sourceLedgerCandidates(sourceLedgerInputs);
  const sourceLedger = buildEpisodeDataSourceLedger({ scope: sourceLedgerScope,
    candidates: sourceLedgerCandidatesInput, sources: sourceLedgerInputs });
  const issueFinder = episodeCompleteness(sourceLedger);
  const supplementalTrust = supplementalSourceTrust(supplements);
  const unifiedSourceSetHash = digest({
    publicAgentRecordSetHash: replay.attestation.recordSetHash,
    supplementalSources: supplementalTrust,
    sourceLedgerHash: sourceLedger.ledgerHash,
  }, "outsider/episode-data-engine/unified-source-set/v3");
  const reportBoundary = boundary();
  const policy = {
    purpose: "EPISODE_OUTCOME_FOLLOWUP_PRIORITY_ONLY",
    baselineFeatures: EPISODE_DATA_ENGINE_BASELINE_FEATURES,
    issueFeatures: EPISODE_DATA_ENGINE_ISSUE_FEATURES,
    splitSeed: SPLIT_SEED,
    splitFraction: SPLIT_FRACTION,
    followUpGroupBudgetFraction: FOLLOW_UP_GROUP_BUDGET_FRACTION,
    auditReserveFractionOfPriorityBudget: AUDIT_RESERVE_FRACTION_OF_PRIORITY_BUDGET,
    auditReserveSeed: AUDIT_RESERVE_SEED,
    minimums: MINIMUMS,
    offlineModelFittingAlgorithm: TRAINING,
    sources: SOURCE_CONFIGS.map((config) => ({ id: config.pin.id,
      revision: config.pin.revision, sourceTarget: config.sourceTarget,
      correlationFields: config.correlationFields,
      groupingBasis: config.groupingBasis,
      offlineModelFittingEligible: config.offlineModelFittingEligible,
      authorizedTrainingEligible: false })),
    supplementalSourcePolicies: [
      { datasetId: SENTINEL_DATASET_ID,
        lane: "QUARANTINE_EVALUATION_ONLY_GAP_RECOVERY_MORPHOLOGY",
        offlineModelFittingEligible: false, authorizedTrainingEligible: false,
        realitySegmentDenominatorEligible: false },
      { datasetId: STALE_CONSTRAINT_DATASET_ID,
        lane: "CONSTRUCTED_OFFLINE_RESEARCH_ACQUISITION_RANKING",
        offlineResearchModelFittingOnly: true, authorizedTrainingEligible: false,
        realitySegmentDenominatorEligible: false },
    ],
  };
  const publicFeederAcquisitionQueues = assessments
    .filter((item) => item.nextFeederCandidate !== null)
    .map((item) => {
      const feeder = item.nextFeederCandidate;
      const queueBody = {
        datasetId: item.dataset.id,
        sourceNativeTarget: item.sourceNativeTarget,
        purpose: feeder.purpose,
        selectedModel: feeder.selectedModel,
        holdoutCandidateGroupSetHash: feeder.holdoutCandidateGroupSetHash,
        holdoutCandidateEpisodeSetHash: feeder.holdoutCandidateEpisodeSetHash,
        fixedPriorityGroupBudget: feeder.fixedPriorityGroupBudget,
        rankedPriorityGroups: feeder.rankedPriorityGroups,
        randomAuditReserve: feeder.randomAuditReserve,
        state: "QUARANTINED_REVIEW_REQUIRED",
        dispatched: false,
        automaticRetrieval: false,
        actionReady: false,
        executable: false,
      };
      return { ...queueBody, queueHash: digest(queueBody, FEEDER_QUEUE_DOMAIN) };
    });
  const projectionBody = {
    schema: CONTROL_PLANE_PROJECTION_SCHEMA,
    mode: "QUARANTINED_REVIEW_ONLY",
    objective: "ACQUIRE_MISSING_EPISODE_SEGMENTS_AND_OUTCOME_FOLLOW_UP",
    gapAcquisitionQueue: issueFinder.rankedGaps.map((gap) => ({
      rank: gap.rank,
      segment: gap.segment,
      missingRecords: gap.missingRecords,
      sourceRecordSetHash: unifiedSourceSetHash,
      state: "NEEDS_PROVIDER_OR_OWNER_COLLECTION_PLAN",
      automaticDispatch: false,
    })),
    datasetGapAcquisitionQueues: [
      {
        datasetId: CUA_VERIFIER_BENCH_PIN.id,
        revision: CUA_VERIFIER_BENCH_PIN.revision,
        lane: "DIGITAL_AGENT_LONGITUDINAL_OUTCOME_ACQUISITION",
        candidateRecords: supplements.cua.bundle.summary.counts.normalizedEpisodes,
        observed: {
          actionBoundaryTrace: 106,
          independentHumanTerminalReview: 85,
          independentLongitudinalOutcomeRecovery: 0,
          opportunityCensus: 0,
          delegationAuthorization: 0,
        },
        missingSegments: ["OPPORTUNITY_CENSUS", "DELEGATION_AUTHORIZATION",
          "INDEPENDENT_LONGITUDINAL_OUTCOME_RECOVERY"],
        sourceBindingHash: supplements.cua.verified.verificationHash,
        trainingDecision: supplements.cua.training.report.assessments.map((item) => ({
          target: item.target,
          decision: item.selection.decision,
          scope: item.selection.promotionScope,
          productionPromotionAuthorized: item.selection.productionPromotionAuthorized,
        })),
        state: "HOLD_QUARANTINED_REVIEW_REQUIRED",
        standaloneSealAccepted: false,
        dispatched: false,
        automaticRetrieval: false,
        actionReady: false,
        executable: false,
      },
      {
        datasetId: REBOOT_DATASET_ID,
        revision: REBOOT_REVISION,
        lane: "EMBODIED_PRE_ACTION_AND_INDEPENDENT_OUTCOME_ACQUISITION",
        candidateRecords: supplements.reboot.artifact.quality.projectedEpisodes,
        observed: {
          commandActionStateTrace: 60,
          physicalEffectTrace: 60,
          sourceNativeRecoveryTrace: 57,
          independentLongitudinalOutcomeRecovery: 0,
          opportunityCensus: 0,
          delegationAuthorization: 0,
        },
        missingSegments: ["OPPORTUNITY_CENSUS", "DELEGATION_AUTHORIZATION",
          "INDEPENDENT_LONGITUDINAL_OUTCOME_RECOVERY"],
        sourceBindingHash: supplements.reboot.artifact.source.sourceRoot,
        episodeProjectionHash: supplements.reboot.artifact.episodeProjection.projectionHash,
        trainingDecision: supplements.reboot.artifact.training.decision,
        rightsStatus: supplements.reboot.artifact.rights.mismatchResolution,
        state: "HOLD_QUARANTINED_REVIEW_REQUIRED",
        standaloneSealAccepted: false,
        dispatched: false,
        automaticRetrieval: false,
        actionReady: false,
        executable: false,
      },
    ].map((queue) => ({ ...queue, queueHash: digest(queue,
      DATASET_GAP_QUEUE_DOMAIN) })).concat(sentinelGapQueue(supplements)),
    feederAcquisitionQueues: publicFeederAcquisitionQueues
      .concat(staleConstraintFeederQueue(supplements)),
    enforcement: {
      consumesCallerNormalizedRows: false,
      fullSourceReplayRequired: true,
      typedSourceAdmissionLedgerRequired: true,
      supplementalStandaloneSealsTrusted: false,
      nonCommensurateSourceDenominatorsRequired: true,
      manualReviewRequiredBeforeAnyAcquisition: true,
      rawSourceProjection: false,
      mayExpandDelegation: false,
      mayDeployModel: false,
      actionReady: false,
      executable: false,
    },
  };
  const controlPlaneProjection = { ...projectionBody,
    projectionHash: digest(projectionBody, CONTROL_PLANE_PROJECTION_DOMAIN) };
  const body = {
    schema: EPISODE_DATA_ENGINE_SCHEMA,
    schemaVersion: "4.0.0",
    engine: {
      id: "outsider-aide-inspired-episode-data-engine",
      version: "1.2.0",
      implementationHash: digest({ module: MODULE_FILE_HASH,
        sourceVerifier: SOURCE_VERIFIER_FILE_HASH, corpusAdapter: CORPUS_ADAPTER_FILE_HASH,
        sentinelAdapter: SENTINEL_ADAPTER_FILE_HASH,
        staleConstraintAdapter: STALE_CONSTRAINT_ADAPTER_FILE_HASH,
        sourceLedger: SOURCE_LEDGER_FILE_HASH,
        canonicalizer: CANONICALIZER_FILE_HASH },
      "outsider/episode-data-engine/implementation-bundle/v3"),
      policyHash: digest(policy, "outsider/episode-data-engine/policy/v3"),
      stages: ["ISSUE_FINDER", "EPISODE_FEEDER_CANDIDATE",
        "OFFLINE_RESEARCH_MODEL_FITTING",
        "FROZEN_GROUP_HOLDOUT_VERIFICATION", "SOURCE_DISCOVERY_SCOPE_LEDGER",
        "TYPED_SOURCE_ADMISSION_AND_CLEARANCE", "NONCOMMENSURATE_DENOMINATOR_REGISTRY",
        "SEGMENT_ATTRIBUTION_ACCOUNTING", "OUTCOME_BLIND_AUDIT_RESERVE_REPLAY"],
    },
    sourceTrust: { ...trustedSource(replay), supplementalSources: supplementalTrust,
      sourceLedgerSchema: EPISODE_DATA_SOURCE_LEDGER_SCHEMA,
      sourceLedgerHash: sourceLedger.ledgerHash, unifiedSourceSetHash },
    sourceLedger,
    issueFinder,
    assessments,
    controlPlaneProjection,
    runSummary: {
      sourceRecordsReplayed: issueFinder.totals.realityEpisodeRecords,
      sourceRecordsReplayedScope: "REALITY_SEGMENT_ELIGIBLE_PUBLIC_EPISODES_ONLY",
      publicAgentRecordsReplayed: rows.length,
      supplementalEpisodeRecordsReplayed:
        issueFinder.totals.realityEpisodeRecords - rows.length,
      sourceDenominatorRegistry: structuredClone(sourceLedger.denominatorRegistry),
      crossDomainSourceUnitTotal: null,
      crossDomainSourceUnitAdditionProhibited: true,
      constructedEpisodeByteCommitmentsReplayed: sourceLedger.denominatorRegistry.domains
        .find((item) => item.class === "CONSTRUCTED_EPISODE_BYTE_COMMITMENT").units,
      constructedEpisodesSchemaInspected:
        supplements.staleConstraint.report.sourceReplay.schemaInspectedEpisodes,
      outcomeBlindAuditByteCommitments:
        supplements.staleConstraint.report.sourceReplay.opaqueAuditByteCommitments,
      pairedRecoveryEvaluationPairsReplayed: sourceLedger.denominatorRegistry.domains
        .find((item) => item.class === "PAIRED_RECOVERY_MORPHOLOGY_EVALUATION").units,
      sourcesAssessed: sourceLedger.sources.length,
      offlineModelFitsPerformedInEngine:
        sourceLedger.modelUse.offlineModelFitting.performedInEngineModelCount,
      offlineModelFitsReplayedFromVerifiedSupplements:
        sourceLedger.modelUse.offlineModelFitting.replayedVerifiedSupplementModelCount,
      authorizedTrainingPerformed: false,
      authorizedTrainingRows: 0,
      authorizedTrainingJobs: 0,
      supplementalOfflineResearchRankersReplayed: 1,
      inEngineModelFittingSources: fitted.map((item) => item.dataset.id),
      inEngineModelFittingAbstentions: assessments.filter((item) =>
        item.modelFitting === null)
        .map((item) => item.dataset.id),
      optimizedCandidatesSelected: fitted.filter((item) =>
        item.modelSelection.clearImprovement).length,
      supplementalOfflineReviewQueueCandidatesSelected: 1,
      productionModelsPromoted: 0,
      feederCandidatesDispatched: 0,
    },
    boundary: reportBoundary,
    limitations: [
      "The objective is episode outcome/recovery follow-up priority, not agent risk, identity, authority, responsibility, price or loss.",
      "Source-native negative labels are retrieval targets only; they are neither independent outcomes nor pseudo-labels.",
      "The current public agent corpus has zero prospectively registered opportunity censuses, zero delegation/authorization observations, zero physical-effect traces and zero independent longitudinal recovery observations.",
      "CUAVerifierBench adds 106 browser-agent attempts and 85 blind-human terminal outcome majorities, but no pre-action delegation census or longitudinal consequence/recovery observation.",
      "REBOOT adds 60 real-robot command/action-state traces and 57 source-native valid recovery windows, but no pre-action authority/census or independently audited longitudinal consequence.",
      "REBOOT remains HOLD because its license mismatch is unresolved and operator/session grouping collapses the formal split to one connected component.",
      "AgentTrajectorySentinel contributes 55 paired failure/repair morphology evaluations only; publisher repair labels are not independent outcomes or longitudinal recovery truth and add zero training rows.",
      "The stale-constraint source contributes 5,400 constructed episode byte commitments, including 4,896 structural research rows and 504 opaque outcome-blind audit commitments; none count as real action effect, outcome, recovery or complete episode.",
      "The stale-constraint optimized ranker may order the next offline review queue, while production remains KEEP_BASELINE with zero production training or promotion.",
      "Hash grouping blocks overlap under declared roots but does not prove statistical independence.",
      "The Nebius sample is case-control and no population prevalence or calibration is claimed.",
      "No fitted model or feeder candidate is automatically deployed, dispatched, or allowed to expand delegation.",
    ],
  };
  return deepFreeze({ ...body, reportHash: digest(body, EPISODE_DATA_ENGINE_SCHEMA) });
}

/** The only fit-capable entrypoint: directories in, full source re-derivation first. */
export async function evaluateEpisodeDataEngineFromSource({ sourceDirectory,
  artifactDirectory, cuaArtifactDirectory, rebootArtifactDirectory,
  rebootSourceDirectory, sentinelArtifactDirectory,
  staleConstraintArtifactDirectory } = {}) {
  if (typeof sourceDirectory !== "string" || sourceDirectory.length === 0
    || typeof artifactDirectory !== "string" || artifactDirectory.length === 0
    || typeof cuaArtifactDirectory !== "string" || cuaArtifactDirectory.length === 0
    || typeof rebootArtifactDirectory !== "string" || rebootArtifactDirectory.length === 0
    || typeof rebootSourceDirectory !== "string" || rebootSourceDirectory.length === 0
    || typeof sentinelArtifactDirectory !== "string"
    || sentinelArtifactDirectory.length === 0
    || typeof staleConstraintArtifactDirectory !== "string"
    || staleConstraintArtifactDirectory.length === 0) {
    fail("EPISODE_DATA_ENGINE_SOURCE_DIRECTORIES_REQUIRED");
  }
  const replay = await verifyPublicAgentArtifactsAgainstSource(
    { sourceDirectory, artifactDirectory });
  if (!validReplay(replay)) {
    fail("EPISODE_DATA_ENGINE_FULL_SOURCE_REPLAY_FAILED",
      replay?.error ?? replay?.status ?? "invalid-replay");
  }
  const supplements = {
    cua: replayCuaSupplement(path.resolve(cuaArtifactDirectory)),
    reboot: replayRebootSupplement(path.resolve(rebootArtifactDirectory),
      path.resolve(rebootSourceDirectory)),
    sentinel: replaySentinelSupplement(path.resolve(sentinelArtifactDirectory)),
    staleConstraint:
      replayStaleConstraintSupplement(path.resolve(staleConstraintArtifactDirectory)),
  };
  return buildReport(replay, supplements);
}

/** A self-hash is never enough: verification replays source bytes and the full report. */
export async function verifyEpisodeDataEngineReport(report, { sourceDirectory = null,
  artifactDirectory = null, cuaArtifactDirectory = null,
  rebootArtifactDirectory = null, rebootSourceDirectory = null,
  sentinelArtifactDirectory = null, staleConstraintArtifactDirectory = null } = {}) {
  try {
    if (!report || report.schema !== EPISODE_DATA_ENGINE_SCHEMA
      || report.schemaVersion !== "4.0.0" || !HASH.test(report.reportHash ?? "")) {
      return Object.freeze({ ok: false, error: "EPISODE_DATA_ENGINE_REPORT_INVALID" });
    }
    if (!same(report.boundary, boundary())) {
      return Object.freeze({ ok: false, error: "EPISODE_DATA_ENGINE_BOUNDARY_INVALID" });
    }
    const { reportHash, ...body } = report;
    if (reportHash !== digest(body, EPISODE_DATA_ENGINE_SCHEMA)) {
      return Object.freeze({ ok: false, error: "EPISODE_DATA_ENGINE_REPORT_HASH_MISMATCH" });
    }
    if (report.sourceTrust?.trustClass !== "FULL_SOURCE_REPLAY_BOUND"
      || report.sourceTrust?.derivation !== "FULL_SOURCE_REDERIVED"
      || report.sourceLedger?.schema !== EPISODE_DATA_SOURCE_LEDGER_SCHEMA
      || report.sourceTrust?.sourceLedgerHash !== report.sourceLedger?.ledgerHash
      || report.sourceLedger?.discovery?.globalExhaustion !== false
      || report.sourceLedger?.denominatorRegistry?.crossDomainTotal !== null
      || report.sourceLedger?.denominatorRegistry?.crossDomainAdditionProhibited !== true
      || report.sourceLedger?.modelUse?.authorizedTraining?.performed !== false
      || report.sourceLedger?.modelUse?.authorizedTraining?.rowsAuthorized !== 0
      || report.sourceLedger?.modelUse?.authorizedTraining?.jobsAuthorized !== 0
      || typeof sourceDirectory !== "string" || typeof artifactDirectory !== "string"
      || typeof cuaArtifactDirectory !== "string"
      || typeof rebootArtifactDirectory !== "string"
      || typeof rebootSourceDirectory !== "string"
      || typeof sentinelArtifactDirectory !== "string"
      || typeof staleConstraintArtifactDirectory !== "string") {
      return Object.freeze({ ok: false,
        error: "EPISODE_DATA_ENGINE_TRUSTED_SOURCE_REPLAY_REQUIRED" });
    }
    const reproduced = await evaluateEpisodeDataEngineFromSource(
      { sourceDirectory, artifactDirectory, cuaArtifactDirectory,
        rebootArtifactDirectory, rebootSourceDirectory,
        sentinelArtifactDirectory, staleConstraintArtifactDirectory });
    if (!same(reproduced, report)) {
      return Object.freeze({ ok: false, error: "EPISODE_DATA_ENGINE_REPRODUCTION_MISMATCH" });
    }
    return Object.freeze({ ok: true, reportHash,
      sourceRecords: report.runSummary.sourceRecordsReplayed,
      sourceDenominatorRegistry: report.runSummary.sourceDenominatorRegistry,
      offlineModelFitsPerformedInEngine:
        report.runSummary.offlineModelFitsPerformedInEngine,
      authorizedTrainingRows: 0 });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

function serializedReport(report) {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function buildEpisodeDataEngineRunReceipt(report) {
  if (!report || report.schema !== EPISODE_DATA_ENGINE_SCHEMA
    || report.schemaVersion !== "4.0.0" || !HASH.test(report.reportHash ?? "")
    || !same(report.boundary, boundary())) {
    fail("EPISODE_DATA_ENGINE_RUN_RECEIPT_REPORT_INVALID");
  }
  const { reportHash, ...reportBody } = report;
  if (reportHash !== digest(reportBody, EPISODE_DATA_ENGINE_SCHEMA)) {
    fail("EPISODE_DATA_ENGINE_RUN_RECEIPT_REPORT_HASH_MISMATCH");
  }
  const result = Object.fromEntries(report.assessments.map((assessment) =>
    [assessment.dataset.id, {
      decision: assessment.decision,
      modelSelection: assessment.modelSelection.decision,
      baselineMetrics: assessment.frozenHoldoutVerification?.baseline.metrics ?? null,
      optimizedMetrics:
        assessment.frozenHoldoutVerification?.optimizedIssueFeatures.metrics ?? null,
      delta: assessment.frozenHoldoutVerification?.deltaOptimizedMinusBaseline ?? null,
      feederDispatched: assessment.nextFeederCandidate?.dispatched ?? false,
    }]));
  const sentinelQueue = report.controlPlaneProjection.datasetGapAcquisitionQueues
    .find((queue) => queue.datasetId === SENTINEL_DATASET_ID);
  const staleConstraintQueue = report.controlPlaneProjection.feederAcquisitionQueues
    .find((queue) => queue.datasetId === STALE_CONSTRAINT_DATASET_ID);
  if (!sentinelQueue || !staleConstraintQueue) {
    fail("EPISODE_DATA_ENGINE_RUN_RECEIPT_SUPPLEMENTAL_QUEUE_MISSING");
  }
  const receiptBody = {
    schema: EPISODE_DATA_ENGINE_RUN_RECEIPT_SCHEMA,
    schemaVersion: "4.0.0",
    input: {
      mode: "FULL_SOURCE_REDERIVED",
      sourceRecordCount: report.runSummary.sourceRecordsReplayed,
      sourceRecordCountScope: report.runSummary.sourceRecordsReplayedScope,
      publicAgentRecordCount: report.sourceTrust.sourceRecordCount,
      sourceLedgerSchema: report.sourceLedger.schema,
      sourceLedgerHash: report.sourceLedger.ledgerHash,
      sourceDiscovery: structuredClone(report.sourceLedger.discovery),
      sourceDenominatorRegistry:
        structuredClone(report.sourceLedger.denominatorRegistry),
      segmentCoverageAttribution:
        structuredClone(report.sourceLedger.segmentCoverageAttribution),
      modelUse: structuredClone(report.sourceLedger.modelUse),
      supplementalSources: structuredClone(report.sourceTrust.supplementalSources),
      unifiedSourceSetHash: report.sourceTrust.unifiedSourceSetHash,
      fullSourceVerificationHash: report.sourceTrust.fullSourceVerificationHash,
      manifestHash: report.sourceTrust.manifestHash,
      recordSetHash: report.sourceTrust.recordSetHash,
      verifiedSourceObjectSetHash: report.sourceTrust.verifiedSourceObjectSetHash,
    },
    output: {
      reportHash: report.reportHash,
      reportFileContentHash: `sha256:${createHash("sha256")
        .update(serializedReport(report)).digest("hex")}`,
      offlineModelFitsPerformedInEngine:
        report.runSummary.offlineModelFitsPerformedInEngine,
      offlineModelFitsReplayedFromVerifiedSupplements:
        report.runSummary.offlineModelFitsReplayedFromVerifiedSupplements,
      authorizedTrainingPerformed: false,
      authorizedTrainingRows: 0,
      authorizedTrainingJobs: 0,
      supplementalOfflineResearchRankersReplayed:
        report.runSummary.supplementalOfflineResearchRankersReplayed,
      optimizedCandidatesSelected: report.runSummary.optimizedCandidatesSelected,
      supplementalOfflineReviewQueueCandidatesSelected:
        report.runSummary.supplementalOfflineReviewQueueCandidatesSelected,
      productionModelsPromoted: report.runSummary.productionModelsPromoted,
      feederCandidatesDispatched: report.runSummary.feederCandidatesDispatched,
      realitySegmentAttribution: structuredClone(report.issueFinder.totals),
      completeEpisodeIntersectionCount:
        report.issueFinder.totals.completeEpisodeIntersectionCount,
    },
    result,
    supplementalResult: {
      [SENTINEL_DATASET_ID]: {
        disposition: sentinelQueue.state,
        pairedRecoveryEvaluationPairs: sentinelQueue.pairedRecoveryEvaluationPairs,
        trainingDecision: sentinelQueue.trainingDecision,
        offlineResearchTrainingRows: 0,
        authorizedTrainingRows: 0,
        networkAdmissionRows: 0,
        networkProjectionRows: 0,
        dispatched: false,
      },
      [STALE_CONSTRAINT_DATASET_ID]: {
        disposition: staleConstraintQueue.state,
        researchQueueDecision: staleConstraintQueue.researchQueueDecision,
        productionDecision: staleConstraintQueue.productionDecision,
        constructedEpisodeByteCommitments:
          report.runSummary.constructedEpisodeByteCommitmentsReplayed,
        opaqueOutcomeBlindAuditByteCommitments:
          report.runSummary.outcomeBlindAuditByteCommitments,
        authorizedTrainingRows: 0,
        networkAdmissionRows: 0,
        networkProjectionRows: 0,
        dispatched: false,
      },
    },
    boundary: structuredClone(report.boundary),
  };
  return deepFreeze({ ...receiptBody,
    receiptHash: digest(receiptBody, EPISODE_DATA_ENGINE_RUN_RECEIPT_SCHEMA) });
}

/** A receipt is trusted only after the referenced report is itself fully source-replayed. */
export async function verifyEpisodeDataEngineRunReceipt(receipt, report, directories = {}) {
  const reportVerification = await verifyEpisodeDataEngineReport(report, directories);
  if (!reportVerification.ok) {
    return Object.freeze({ ok: false,
      error: `EPISODE_DATA_ENGINE_RUN_RECEIPT_REPORT_SOURCE_VERIFY_FAILED:${
        reportVerification.error}` });
  }
  try {
    const rebuilt = buildEpisodeDataEngineRunReceipt(report);
    if (!same(receipt, rebuilt)) {
      return Object.freeze({ ok: false,
        error: "EPISODE_DATA_ENGINE_RUN_RECEIPT_REPRODUCTION_MISMATCH" });
    }
    return Object.freeze({ ok: true, receiptHash: rebuilt.receiptHash,
      reportHash: report.reportHash,
      sourceRecords: report.runSummary.sourceRecordsReplayed,
      sourceDenominatorRegistry: report.runSummary.sourceDenominatorRegistry,
      authorizedTrainingRows: 0,
      productionModelsPromoted: report.runSummary.productionModelsPromoted,
      completeEpisodeIntersectionCount:
        report.issueFinder.totals.completeEpisodeIntersectionCount });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export { digest as episodeDataEngineDigest };
