/*
 * Public agent evidence, acquisition wave 4.
 *
 * Microsoft AgentRx releases complete failed tau-retail execution traces and
 * matching manually authored failure/root-cause annotations.  This adapter
 * proves a bounded, commit-pinned source selection and emits a privacy-safe
 * descriptive projection.  It does not turn benchmark reward, retail values,
 * annotation language, or sandbox actions into causal, loss, pricing, policy,
 * or settlement authority.
 */

import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { readPinnedPublicAgentSourceSnapshot }
  from "./outsider-public-agent-artifacts.js";
import {
  publicEvidenceOntologyReference,
  verifyPublicEvidenceOntologyReference,
} from "./outsider-public-evidence-ontology.js";

export const PUBLIC_AGENT_WAVE4_SCHEMAS = Object.freeze({
  manifest: "outsider/public-agent-wave4-failure-trace-manifest/v2",
  record: "outsider/public-agent-wave4-manual-failure-trace/v2",
  recordSet: "outsider/public-agent-wave4-failure-trace-record-set/v2",
  summary: "outsider/public-agent-wave4-failure-trace-summary/v2",
  verification: "outsider/public-agent-wave4-failure-trace-verification/v2",
  candidateDecision: "outsider/public-agent-wave4-candidate-decision/v2",
});

export const PUBLIC_AGENT_WAVE4_CANONICAL_GENERATED_AT =
  "2026-08-21T00:00:00.000Z";

export const AGENTRX_TAU_WAVE4_PIN = Object.freeze({
  id: "microsoft/AgentRx:tau_retail",
  repository: "microsoft/AgentRx",
  revision: "f228165bfec60a801fd5fedd9d8ffe0f9de0c69d",
  tree: "d08e8e454cd027aac69f07b172a20cffd9ecd2ff",
  linkedDatasetRevision: "88e871fecb58b2d090449f37ec80b8865594e0b5",
  repositoryLicenseId: "MIT",
  linkedDatasetLicenseId: "CC-BY-4.0",
  sourceClass: "manually-annotated-failed-agent-structured-api-sandbox",
  sourceKind: "AGENTRX_TAU_MANUAL_FAILURE_TRACE_REGISTRY",
  trajectoryRows: 29,
  annotationRows: 29,
  turns: 1_064,
  toolCalls: 284,
  writeLikeToolCalls: 62,
  failureEvents: 39,
  rootCauseRows: 29,
  multiFailureRows: 7,
  rootCauseAfterFirstFailureRows: 2,
  assistantRootCauseRows: 21,
  userRootCauseRows: 8,
  nativeSourceCorrelationRoots: 3,
  trajectoryContainerBytes: 900_014,
});

export const AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE =
  publicEvidenceOntologyReference(AGENTRX_TAU_WAVE4_PIN.id);

export const PUBLIC_AGENT_WAVE4_SOURCE_OBJECT_PINS = Object.freeze({
  "LICENSE.txt": Object.freeze({ sizeBytes: 1141,
    sha256: "sha256:c2cfccb812fe482101a8f04597dfc5a9991a6b2748266c47ac91b6a5aae15383" }),
  "README.md": Object.freeze({ sizeBytes: 10214,
    sha256: "sha256:6b40abda0aea64e9e937cb76e37bf1bb9c141a742c45fde2a10ea1c9a08fec1f" }),
  "failure-trajectories.json": Object.freeze({ sizeBytes: 900014,
    sha256: "sha256:17f8b3356d1124274cc7ed0215b5ff696970073dbed57394c60e775d5f85d717" }),
  "ground-truth.json": Object.freeze({ sizeBytes: 33335,
    sha256: "sha256:58067689b2ec42f9cbfec2a84ec08d39cea4d8270617b55d0185862753642d16" }),
  "linked-dataset-card.md": Object.freeze({ sizeBytes: 2490,
    sha256: "sha256:2b29f65760747e34364e5f84174573b5741bff2a949d4e136e5da0b50cc1ab5c" }),
  "repository-commit.json": Object.freeze({ sizeBytes: 2719,
    sha256: "sha256:6f2709f2ed407f7f5a4dc4ebea20d69ccfab637b6a1ac40a623ebe00e3ac2a2a" }),
  "repository-tree.json": Object.freeze({ sizeBytes: 48609,
    sha256: "sha256:1e3d56ca9d28464d0500ef5087c305ccdc424a9ebda38b0c41df18e5ce70fc6f" }),
  "retail-policy.txt": Object.freeze({ sizeBytes: 5700,
    sha256: "sha256:55e04468c37e5396dd4f97f63f4bc2d169a43c115ebc0fd72cb0bb0fa5e05fc8" }),
  "tool-schema.json": Object.freeze({ sizeBytes: 21485,
    sha256: "sha256:6d4d854cae8cc895e5fe7e851867c4cf1728b2cfbf9c541647e1bb945c16d3a2" }),
});

const UPSTREAM_PATHS = Object.freeze({
  "LICENSE.txt": "LICENSE.txt",
  "README.md": "README.md",
  "failure-trajectories.json": "data/tau_retail/tau_dataset_failed.json",
  "ground-truth.json": "data/ground_truth/tau_ground_truth.json",
  "retail-policy.txt": "data/policies/retail_policy.txt",
  "tool-schema.json": "data/tool_schemas/tools_structure.json",
});

const FAILURE_CATEGORIES = Object.freeze([
  "Instruction Adherence Failure",
  "Intent Not Supported",
  "Intent Plan Misalignment",
  "Invalid Invocation",
  "Misinterpretation of Tool Output",
  "System Failure",
  "Underspecified User Intent",
]);
const WRITE_LIKE_TOOLS = new Set([
  "cancel_pending_order", "exchange_delivered_order_items",
  "modify_pending_order_address", "modify_pending_order_items",
  "modify_user_address", "return_delivered_order_items", "transfer_to_human_agents",
]);
const HASH = /^sha256:[a-f0-9]{64}$/;
const SHA1 = /^[a-f0-9]{40}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}
function plain(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}
function exactKeys(value, keys) {
  return plain(value) && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}
function digest(value, domain) {
  return `sha256:${createHash("sha256").update(`${domain}\0`)
    .update(typeof value === "string" ? value : canonicalizeStrict(value)).digest("hex")}`;
}
function gitBlobOid(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}
function parseJson(bytes, code) {
  try { return JSON.parse(bytes.toString("utf8")); }
  catch (error) { fail(code, error instanceof Error ? error.message : String(error)); }
}
function boundedString(value, maximum, code, { nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || value.length > maximum) fail(code);
}
function integer(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(code);
}
function readPinned(sourceDirectory, name) {
  const pin = PUBLIC_AGENT_WAVE4_SOURCE_OBJECT_PINS[name];
  if (!pin) fail("PUBLIC_AGENT_WAVE4_SOURCE_PIN_MISSING", name);
  return readPinnedPublicAgentSourceSnapshot(join(sourceDirectory, name), pin,
    "PUBLIC_AGENT_WAVE4_SOURCE_SNAPSHOT_MISMATCH");
}
function acquiredObject(path, snapshot) {
  return { path, sizeBytes: snapshot.object.sizeBytes, sha256: snapshot.object.sha256 };
}
function datasetRoot() {
  return digest({ id: AGENTRX_TAU_WAVE4_PIN.id,
    revision: AGENTRX_TAU_WAVE4_PIN.revision },
  "outsider/public-agent-wave4/dataset-root/v1");
}
function boundary() {
  return {
    disposition: "FULL_SELECTED_TRACE_SCOPE_DESCRIPTIVE_QUARANTINE",
    selectedTraceRowsReparsed: AGENTRX_TAU_WAVE4_PIN.trajectoryRows,
    traceContainerBytesAcquired: AGENTRX_TAU_WAVE4_PIN.trajectoryContainerBytes,
    trajectoryEvidenceUsableRows: AGENTRX_TAU_WAVE4_PIN.trajectoryRows,
    failureRateEstimableFromSelectedScope: false,
    causalExperienceUnits: 0,
    economicLossRows: 0,
    pricingEligibleRows: 0,
    productionModelEligibleRows: 0,
    automaticTraining: false,
    permits: { CEU: false, MODEL: false, LOSS: false, PRICE: false,
      GUARANTEE: false, SETTLE: false },
  };
}

function validateToolCall(call, ids) {
  if (!exactKeys(call, ["id", "type", "function"]) || call.type !== "function"
    || typeof call.id !== "string" || call.id.length < 1 || call.id.length > 256
    || ids.has(call.id) || !exactKeys(call.function, ["name", "arguments"])
    || !TOKEN.test(call.function.name ?? "")) fail("PUBLIC_AGENT_WAVE4_TOOL_CALL_INVALID");
  boundedString(call.function.arguments, 128 * 1024,
    "PUBLIC_AGENT_WAVE4_TOOL_ARGUMENTS_INVALID");
  try { JSON.parse(call.function.arguments); }
  catch { fail("PUBLIC_AGENT_WAVE4_TOOL_ARGUMENTS_JSON_INVALID"); }
  ids.add(call.id);
  return call.function.name;
}

function validateTrajectory(row) {
  if (!exactKeys(row, ["task_id", "trial", "reward", "info", "traj", "records"])) {
    fail("PUBLIC_AGENT_WAVE4_TRAJECTORY_SHAPE_INVALID");
  }
  integer(row.task_id, 0, 1_000_000, "PUBLIC_AGENT_WAVE4_TASK_ID_INVALID");
  if (row.trial !== row.task_id || row.reward !== 0 || !plain(row.records)
    || Object.keys(row.records).length !== 0 || !exactKeys(row.info,
      ["task", "source", "user_cost", "reward_info"])
    || !plain(row.info.task) || !TOKEN.test(row.info.source ?? "")
    || !(row.info.user_cost === null || Number.isFinite(row.info.user_cost))
    || !(row.info.reward_info === null || plain(row.info.reward_info))
    || !Array.isArray(row.traj) || row.traj.length < 1 || row.traj.length > 10_000) {
    fail("PUBLIC_AGENT_WAVE4_TRAJECTORY_SHAPE_INVALID");
  }
  boundedString(row.info.task.instruction, 256 * 1024,
    "PUBLIC_AGENT_WAVE4_TASK_INSTRUCTION_INVALID");
  if (!Array.isArray(row.info.task.actions) || !Array.isArray(row.info.task.outputs)) {
    fail("PUBLIC_AGENT_WAVE4_TASK_EXPECTATION_INVALID");
  }
  const callIds = new Set();
  const resultIds = new Set();
  let toolCallCount = 0;
  let writeLikeToolCallCount = 0;
  const roleCounts = { system: 0, user: 0, assistant: 0, tool: 0 };
  row.traj.forEach((turn, offset) => {
    if (!plain(turn) || turn.index !== offset + 1 || !Object.hasOwn(roleCounts, turn.role)) {
      fail("PUBLIC_AGENT_WAVE4_TURN_INVALID");
    }
    roleCounts[turn.role] += 1;
    if (turn.role === "system" || turn.role === "user") {
      if (!exactKeys(turn, ["role", "content", "index"])) {
        fail("PUBLIC_AGENT_WAVE4_TEXT_TURN_INVALID");
      }
      boundedString(turn.content, 512 * 1024, "PUBLIC_AGENT_WAVE4_TEXT_TURN_INVALID");
      return;
    }
    if (turn.role === "tool") {
      if (!exactKeys(turn, ["role", "content", "name", "tool_call_id", "index"])
        || !TOKEN.test(turn.name ?? "") || typeof turn.tool_call_id !== "string"
        || turn.tool_call_id.length < 1 || turn.tool_call_id.length > 256
        || resultIds.has(turn.tool_call_id)) fail("PUBLIC_AGENT_WAVE4_TOOL_RESULT_INVALID");
      boundedString(turn.content, 512 * 1024, "PUBLIC_AGENT_WAVE4_TOOL_RESULT_INVALID");
      resultIds.add(turn.tool_call_id);
      return;
    }
    const keys = Object.keys(turn).sort();
    const textKeys = ["annotations", "content", "index", "refusal", "role"].sort();
    const toolKeys = [...textKeys, "tool_calls"].sort();
    if (!same(keys, textKeys) && !same(keys, toolKeys)) {
      fail("PUBLIC_AGENT_WAVE4_ASSISTANT_TURN_INVALID");
    }
    if (!Array.isArray(turn.annotations) || turn.annotations.length !== 0
      || turn.refusal !== null || !(turn.content === null || typeof turn.content === "string")) {
      fail("PUBLIC_AGENT_WAVE4_ASSISTANT_TURN_INVALID");
    }
    if (typeof turn.content === "string") {
      boundedString(turn.content, 512 * 1024, "PUBLIC_AGENT_WAVE4_ASSISTANT_TURN_INVALID");
    }
    if (Object.hasOwn(turn, "tool_calls")) {
      if (!Array.isArray(turn.tool_calls) || turn.tool_calls.length < 1
        || !(turn.content === null || typeof turn.content === "string")) {
        fail("PUBLIC_AGENT_WAVE4_TOOL_CALL_SET_INVALID");
      }
      for (const call of turn.tool_calls) {
        const name = validateToolCall(call, callIds);
        toolCallCount += 1;
        if (WRITE_LIKE_TOOLS.has(name)) writeLikeToolCallCount += 1;
      }
    }
  });
  if (roleCounts.system !== 1 || row.traj[0].role !== "system"
    || callIds.size !== resultIds.size
    || [...callIds].some((id) => !resultIds.has(id))) {
    fail("PUBLIC_AGENT_WAVE4_TRACE_PAIRING_INVALID");
  }
  return { taskId: row.task_id, turnCount: row.traj.length,
    toolCallCount, writeLikeToolCallCount, source: row.info.source,
    nativeCostFieldPresent: row.info.user_cost !== null };
}

function validateAnnotation(annotation, trajectory) {
  if (!exactKeys(annotation,
    ["trajectory_id", "failures", "root_cause", "failure_summary"])) {
    fail("PUBLIC_AGENT_WAVE4_ANNOTATION_SHAPE_INVALID");
  }
  integer(annotation.trajectory_id, 0, 1_000_000,
    "PUBLIC_AGENT_WAVE4_ANNOTATION_ID_INVALID");
  if (annotation.trajectory_id !== trajectory.task_id
    || !Array.isArray(annotation.failures) || annotation.failures.length < 1
    || annotation.failures.length > 128
    || !exactKeys(annotation.root_cause, ["failure_id", "reason_for_root_cause"])) {
    fail("PUBLIC_AGENT_WAVE4_ANNOTATION_SHAPE_INVALID");
  }
  boundedString(annotation.failure_summary, 64 * 1024,
    "PUBLIC_AGENT_WAVE4_FAILURE_SUMMARY_INVALID");
  boundedString(annotation.root_cause.reason_for_root_cause, 64 * 1024,
    "PUBLIC_AGENT_WAVE4_ROOT_CAUSE_REASON_INVALID");
  const ids = new Set();
  for (const failure of annotation.failures) {
    if (!exactKeys(failure, ["failure_id", "step_number", "step_reason",
      "failure_category", "category_reason", "failed_agent"])) {
      fail("PUBLIC_AGENT_WAVE4_FAILURE_EVENT_INVALID");
    }
    integer(failure.failure_id, 1, 1_000_000,
      "PUBLIC_AGENT_WAVE4_FAILURE_ID_INVALID");
    integer(failure.step_number, 1, trajectory.traj.length,
      "PUBLIC_AGENT_WAVE4_FAILURE_STEP_INVALID");
    if (ids.has(failure.failure_id) || !FAILURE_CATEGORIES.includes(failure.failure_category)
      || !["Assistant", "User"].includes(failure.failed_agent)) {
      fail("PUBLIC_AGENT_WAVE4_FAILURE_EVENT_INVALID");
    }
    ids.add(failure.failure_id);
    boundedString(failure.step_reason, 64 * 1024,
      "PUBLIC_AGENT_WAVE4_FAILURE_STEP_REASON_INVALID");
    boundedString(failure.category_reason, 64 * 1024,
      "PUBLIC_AGENT_WAVE4_FAILURE_CATEGORY_REASON_INVALID");
  }
  const root = annotation.failures.find((failure) =>
    failure.failure_id === annotation.root_cause.failure_id);
  if (!root) fail("PUBLIC_AGENT_WAVE4_ROOT_CAUSE_UNBOUND");
  return { root, rootOrdinal: annotation.failures.indexOf(root),
    failureCount: annotation.failures.length };
}

export function normalizeAgentRxTauFailureTrace(trajectory, annotation,
  { trajectoryContainerHash, annotationContainerHash } = {}) {
  if (!HASH.test(trajectoryContainerHash ?? "") || !HASH.test(annotationContainerHash ?? "")) {
    fail("PUBLIC_AGENT_WAVE4_ROW_SOURCE_BINDING_INVALID");
  }
  const trace = validateTrajectory(trajectory);
  const labels = validateAnnotation(annotation, trajectory);
  const root = datasetRoot();
  const taskRoot = digest({ datasetRoot: root, taskId: trace.taskId },
    "outsider/public-agent-wave4/task-correlation/v1");
  const sourceRoot = digest({ datasetRoot: root, source: trace.source },
    "outsider/public-agent-wave4/source-correlation/v1");
  const identityHash = digest({ datasetRoot: root, taskId: trace.taskId },
    "outsider/public-agent-wave4/identity/v1");
  const body = {
    schema: PUBLIC_AGENT_WAVE4_SCHEMAS.record,
    schemaVersion: "1.0.0",
    dataset: { id: AGENTRX_TAU_WAVE4_PIN.id,
      revision: AGENTRX_TAU_WAVE4_PIN.revision,
      split: "tau_retail_failed",
      sourceClass: AGENTRX_TAU_WAVE4_PIN.sourceClass,
      repositoryLicenseId: AGENTRX_TAU_WAVE4_PIN.repositoryLicenseId,
      linkedDatasetLicenseId: AGENTRX_TAU_WAVE4_PIN.linkedDatasetLicenseId },
    evidenceOntology: AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE,
    identity: { identityHash, datasetRoot: root, taskRoot, sourceRoot,
      correlationRoots: [root, taskRoot, sourceRoot].sort() },
    sourceBinding: {
      taskId: trace.taskId,
      nativeSourceClass: trace.source,
      trajectoryContainerHash,
      annotationContainerHash,
      trajectoryRowRoot: digest(trajectory,
        "outsider/public-agent-wave4/source-trajectory-row/v1"),
      annotationRowRoot: digest(annotation,
        "outsider/public-agent-wave4/source-annotation-row/v1"),
      turnCount: trace.turnCount,
      toolCallCount: trace.toolCallCount,
      writeLikeToolCallCount: trace.writeLikeToolCallCount,
      traceContainerBytesAcquired: AGENTRX_TAU_WAVE4_PIN.trajectoryContainerBytes,
      exactTrajectoryRowReparsed: true,
      exactAnnotationRowReparsed: true,
      annotationJoinedByTaskId: true,
    },
    labels: {
      nativeOutcomeKind: "PUBLISHER_RELEASED_FAILED_EXECUTION_WITH_MANUAL_ROOT_CAUSE_ANNOTATION",
      benchmarkReward: 0,
      benchmarkFailure: true,
      publisherDeclaredManualAnnotation: true,
      independentAnnotatorIdentityVerified: false,
      annotatedFailureCount: labels.failureCount,
      rootCauseStep: labels.root.step_number,
      rootCauseCategory: labels.root.failure_category,
      rootCauseFailedAgent: labels.root.failed_agent.toUpperCase(),
      failuresBeforeRootCause: labels.rootOrdinal,
      firstUnrecoverableRootCauseClaimedByPublisher: true,
      terminalRecoveryEstablished: false,
      actualExecutionOutcomeIndependentlyReplayed: false,
      nativeCostFieldPresent: trace.nativeCostFieldPresent,
      economicLossObserved: false,
    },
    privacy: { rawTracePersisted: false, rawPromptPersisted: false,
      rawToolPayloadPersisted: false, rawAnnotationTextPersisted: false,
      projection: "hashes-bounded-counts-and-publisher-failure-labels-only" },
    useBoundary: boundary(),
  };
  return Object.freeze({ ...body,
    recordHash: digest(body, PUBLIC_AGENT_WAVE4_SCHEMAS.record) });
}

function verifyRepositoryBinding(snapshots) {
  const commit = parseJson(snapshots["repository-commit.json"].bytes,
    "PUBLIC_AGENT_WAVE4_REPOSITORY_COMMIT_INVALID");
  const tree = parseJson(snapshots["repository-tree.json"].bytes,
    "PUBLIC_AGENT_WAVE4_REPOSITORY_TREE_INVALID");
  if (commit.sha !== AGENTRX_TAU_WAVE4_PIN.revision
    || commit.tree?.sha !== AGENTRX_TAU_WAVE4_PIN.tree
    || tree.sha !== AGENTRX_TAU_WAVE4_PIN.tree || tree.truncated !== false
    || !Array.isArray(tree.tree)) fail("PUBLIC_AGENT_WAVE4_REPOSITORY_REVISION_BINDING_INVALID");
  for (const [name, upstreamPath] of Object.entries(UPSTREAM_PATHS)) {
    const entry = tree.tree.find((candidate) => candidate?.path === upstreamPath);
    const snapshot = snapshots[name];
    if (entry?.type !== "blob" || entry.size !== snapshot.object.sizeBytes
      || !SHA1.test(entry.sha ?? "") || entry.sha !== gitBlobOid(snapshot.bytes)) {
      fail("PUBLIC_AGENT_WAVE4_REPOSITORY_OBJECT_BINDING_INVALID", name);
    }
  }
}

function sourceManifest(generatedAt, snapshots) {
  const acquiredObjects = Object.entries(snapshots).map(([name, snapshot]) =>
    acquiredObject(name, snapshot)).sort((left, right) => left.path.localeCompare(right.path));
  const body = {
    schema: PUBLIC_AGENT_WAVE4_SCHEMAS.manifest,
    schemaVersion: "1.0.0",
    generatedAt,
    generatedAtEvidence: { status: "SELF_ASSERTED_LOCAL_TIME", externallyVerified: false },
    source: {
      id: AGENTRX_TAU_WAVE4_PIN.id,
      repository: AGENTRX_TAU_WAVE4_PIN.repository,
      revision: AGENTRX_TAU_WAVE4_PIN.revision,
      tree: AGENTRX_TAU_WAVE4_PIN.tree,
      sourceClass: AGENTRX_TAU_WAVE4_PIN.sourceClass,
      sourceKind: AGENTRX_TAU_WAVE4_PIN.sourceKind,
      license: {
        repositoryIdentifier: AGENTRX_TAU_WAVE4_PIN.repositoryLicenseId,
        linkedDatasetIdentifier: AGENTRX_TAU_WAVE4_PIN.linkedDatasetLicenseId,
        linkedDatasetRevision: AGENTRX_TAU_WAVE4_PIN.linkedDatasetRevision,
        repositoryDeclarationObjectPaths: ["LICENSE.txt", "README.md"],
        linkedDatasetCardUrl:
          `https://huggingface.co/datasets/microsoft/AgentRx/blob/${AGENTRX_TAU_WAVE4_PIN.linkedDatasetRevision}/README.md`,
        sourceByteEquivalenceToGatedDatasetEstablished: false,
        adapterGrantsRights: false,
        legalConclusion: false,
      },
    },
    acquiredScope: {
      status: "COMPLETE_PINNED_TAU_FAILED_SPLIT_SELECTION",
      trajectoryRows: AGENTRX_TAU_WAVE4_PIN.trajectoryRows,
      manualAnnotationRows: AGENTRX_TAU_WAVE4_PIN.annotationRows,
      rowsJoinedExactly: AGENTRX_TAU_WAVE4_PIN.trajectoryRows,
      trajectoryObjectPath: "failure-trajectories.json",
      annotationObjectPath: "ground-truth.json",
      acquiredObjects,
      acquiredBytes: acquiredObjects.reduce((sum, object) => sum + object.sizeBytes, 0),
      traceContainerBytesAcquired: AGENTRX_TAU_WAVE4_PIN.trajectoryContainerBytes,
      excludedScopes: ["FLASH_SPLIT", "MAGENTIC_ONE_SPLIT",
        "GATED_HUGGING_FACE_DATA_OBJECTS", "UNSELECTED_REPOSITORY_OBJECTS"],
    },
    provenanceProof: {
      selectedObjectByteIdentity: "PINNED_BYTES_VERIFIED",
      repositoryRevisionBinding: "PINNED_GIT_TREE_BLOB_BINDING_VERIFIED",
      trajectoryAnnotationJoin: "ALL_SELECTED_ROWS_REPARSED_AND_JOINED_BY_TASK_ID",
      repositoryLicenseDeclarationBytes: "PINNED_DECLARATION_BYTES_VERIFIED",
      linkedDatasetLicenseDeclaration: "PINNED_CARD_BYTES_CC_BY_4_0_VERIFIED",
    },
    interpretation: {
      publisherDeclaresManualFailureAnnotation: true,
      publisherPaperDeclaresIndependentDomainAnnotators: true,
      rowLevelAnnotatorIdentityVerified: false,
      completeSelectedTraceRows: true,
      failureRateEstimableFromSelectedScope: false,
      sandboxActionsAreRealWorldSideEffects: false,
      benchmarkRewardIsEconomicLoss: false,
      nativeCostFieldIsEconomicLoss: false,
      causalEffectClaimed: false,
      automaticTrainingPromotion: false,
    },
    evidenceOntology: AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE,
    useBoundary: boundary(),
  };
  return Object.freeze({ ...body,
    manifestHash: digest(body, PUBLIC_AGENT_WAVE4_SCHEMAS.manifest) });
}

function buildRecordSet(records, manifest) {
  const recordHashes = records.map((record) => {
    const checked = verifyPublicAgentWave4Record(record);
    if (!checked.ok) fail("PUBLIC_AGENT_WAVE4_RECORD_SET_RECORD_INVALID", checked.error);
    return record.recordHash;
  }).sort();
  const identities = records.map((record) => record.identity.identityHash).sort();
  if (new Set(recordHashes).size !== records.length || new Set(identities).size !== records.length) {
    fail("PUBLIC_AGENT_WAVE4_RECORD_SET_DUPLICATED");
  }
  const taskRoots = [...new Set(records.map((record) => record.identity.taskRoot))].sort();
  const sourceRoots = [...new Set(records.map((record) => record.identity.sourceRoot))].sort();
  const body = { schema: PUBLIC_AGENT_WAVE4_SCHEMAS.recordSet, schemaVersion: "1.0.0",
    manifestHash: manifest.manifestHash, records: records.length,
    uniqueIdentities: identities.length, uniqueTaskCorrelationComponents: taskRoots.length,
    uniqueNativeSourceCorrelationComponents: sourceRoots.length,
    recordHashes, identityCommitment: digest(identities,
      "outsider/public-agent-wave4/identity-set/v1"),
    taskCorrelationCommitment: digest(taskRoots,
      "outsider/public-agent-wave4/task-correlation-set/v1"),
    nativeSourceCorrelationCommitment: digest(sourceRoots,
      "outsider/public-agent-wave4/native-source-correlation-set/v1") };
  return Object.freeze({ ...body,
    recordSetHash: digest(body, PUBLIC_AGENT_WAVE4_SCHEMAS.recordSet) });
}

function countBy(records, field) {
  return Object.fromEntries([...new Set(records.map((record) => record.labels[field]))].sort()
    .map((value) => [value, records.filter((record) => record.labels[field] === value).length]));
}

function buildSummary(records, manifest, recordSet) {
  const body = {
    schema: PUBLIC_AGENT_WAVE4_SCHEMAS.summary,
    schemaVersion: "1.0.0",
    manifestHash: manifest.manifestHash,
    recordSetHash: recordSet.recordSetHash,
    counts: {
      sourceTrajectoryRows: records.length,
      manualAnnotationRows: records.length,
      uniqueNormalizedUnits: records.length,
      taskCorrelationComponents: recordSet.uniqueTaskCorrelationComponents,
      nativeSourceCorrelationComponents: recordSet.uniqueNativeSourceCorrelationComponents,
      turns: records.reduce((sum, record) => sum + record.sourceBinding.turnCount, 0),
      toolCalls: records.reduce((sum, record) => sum + record.sourceBinding.toolCallCount, 0),
      writeLikeToolCalls: records.reduce((sum, record) =>
        sum + record.sourceBinding.writeLikeToolCallCount, 0),
      benchmarkFailureRows: records.filter((record) => record.labels.benchmarkFailure).length,
      zeroBenchmarkRewardRows: records.filter((record) =>
        record.labels.benchmarkReward === 0).length,
      annotatedFailureEvents: records.reduce((sum, record) =>
        sum + record.labels.annotatedFailureCount, 0),
      multiFailureRows: records.filter((record) =>
        record.labels.annotatedFailureCount > 1).length,
      rootCauseAfterFirstFailureRows: records.filter((record) =>
        record.labels.failuresBeforeRootCause > 0).length,
      rootCauseCategories: countBy(records, "rootCauseCategory"),
      rootCauseFailedAgents: countBy(records, "rootCauseFailedAgent"),
      traceContainerBytesAcquired: AGENTRX_TAU_WAVE4_PIN.trajectoryContainerBytes,
      trajectoryEvidenceUsableRows: records.length,
      causalExperienceUnits: 0,
      economicLossRows: 0,
      pricingEligibleRows: 0,
      productionModelEligibleRows: 0,
    },
    interpretation: {
      completeSelectedTraceRows: true,
      failureRateEstimableFromSelectedScope: false,
      manualRootCauseLabelsPublisherDeclared: true,
      manualAnnotationsIndependentlyReperformedByOutsider: false,
      rowLevelAnnotatorIdentityVerified: false,
      rootCauseLabelsAreCausalEffectEstimates: false,
      benchmarkRewardIsEconomicLoss: false,
      nativeCostFieldIsEconomicLoss: false,
      sandboxToolCallsAreExternalRealWorldActions: false,
      descriptiveFailureTaxonomyAnalysisAllowed: true,
      automaticTraining: false,
    },
    evidenceOntology: AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE,
    useBoundary: boundary(),
  };
  return Object.freeze({ ...body,
    summaryHash: digest(body, PUBLIC_AGENT_WAVE4_SCHEMAS.summary) });
}

export function buildPublicAgentWave4CandidateDecision() {
  const body = {
    schema: PUBLIC_AGENT_WAVE4_SCHEMAS.candidateDecision,
    schemaVersion: "1.0.0",
    selected: [{ id: AGENTRX_TAU_WAVE4_PIN.id,
      revision: AGENTRX_TAU_WAVE4_PIN.revision,
      decision: "INGEST_FULL_SELECTED_TRACE_AND_MANUAL_FAILURE_LABELS_QUARANTINED",
      reason: "29 complete failed sandbox execution traces join exactly to 29 publisher-released manual root-cause annotations" }],
    selectedSourceOntology: AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE,
    deferred: [
      { id: "microsoft/CUAVerifierBench",
        revision: "c19eb323cd802add5c3d2840ff13044061364867",
        decision: "DEFER_TRAJECTORY_OBJECTS_OVER_256_MIB",
        blockers: ["SMALLEST_COMPLETE_HUMAN_REVIEWED_TRAJECTORY_SHARD_OVER_256_MIB",
          "ANNOTATION_ONLY_SCOPE_WOULD_NOT_ADD_TRACE_BYTES"] },
      { id: "SALT-NLP/SWE-chat",
        decision: "DEFER_GATED_AND_MULTI_LICENSE_SOURCE",
        blockers: ["CONTACT_SHARING_GATE_NOT_ACCEPTED",
          "PER_REPOSITORY_LICENSE_BOUNDARY_REQUIRED", "BOUNDED_COMPLETE_SCOPE_NOT_SELECTED"] },
      { id: "microsoft/STATE-Bench",
        revision: "5644b1838d96bc4483da29642d058ecaa6f80f7f",
        decision: "DEFER_LOWER_PRIORITY_SYNTHETIC_LEARNING_TRAJECTORIES",
        blockers: ["NO_MATCHING_MANUAL_FAILURE_ROOT_CAUSE_LABELS",
          "SYNTHETIC_SANDBOX_ONLY", "NO_ECONOMIC_LOSS_OR_REAL_WORLD_CONSEQUENCE"] },
      { id: "CUADebug/CUAErrorBench",
        decision: "DEFER_NO_VERIFIED_PUBLIC_DATA_RELEASE",
        blockers: ["OFFICIAL_DATA_OBJECT_REVISION_NOT_FOUND",
          "DATA_LICENSE_NOT_VERIFIED", "SOURCE_BYTES_NOT_ACQUIRED"] },
    ],
    boundary: { deferredSourcesAdmitted: 0,
      failureRateEstimableFromSelectedScope: false, causalExperienceUnits: 0,
      economicLossRows: 0, pricingEligibleRows: 0,
      productionModelEligibleRows: 0, automaticTraining: false },
  };
  return Object.freeze({ ...body,
    decisionHash: digest(body, PUBLIC_AGENT_WAVE4_SCHEMAS.candidateDecision) });
}

export function verifyPublicAgentWave4Record(record) {
  try {
    if (!exactKeys(record, ["schema", "schemaVersion", "dataset", "evidenceOntology", "identity",
      "sourceBinding", "labels", "privacy", "useBoundary", "recordHash"])
      || record.schema !== PUBLIC_AGENT_WAVE4_SCHEMAS.record || record.schemaVersion !== "1.0.0"
      || !exactKeys(record.dataset, ["id", "revision", "split", "sourceClass",
        "repositoryLicenseId", "linkedDatasetLicenseId"])
      || record.dataset.id !== AGENTRX_TAU_WAVE4_PIN.id
      || record.dataset.revision !== AGENTRX_TAU_WAVE4_PIN.revision
      || record.dataset.split !== "tau_retail_failed"
      || record.dataset.sourceClass !== AGENTRX_TAU_WAVE4_PIN.sourceClass
      || record.dataset.repositoryLicenseId !== AGENTRX_TAU_WAVE4_PIN.repositoryLicenseId
      || record.dataset.linkedDatasetLicenseId !== AGENTRX_TAU_WAVE4_PIN.linkedDatasetLicenseId
      || !verifyPublicEvidenceOntologyReference(record.evidenceOntology).ok
      || !same(record.evidenceOntology, AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE)
      || !exactKeys(record.identity, ["identityHash", "datasetRoot", "taskRoot",
        "sourceRoot", "correlationRoots"])
      || [record.identity.identityHash, record.identity.datasetRoot, record.identity.taskRoot,
        record.identity.sourceRoot].some((value) => !HASH.test(value ?? ""))
      || record.identity.datasetRoot !== datasetRoot()
      || record.identity.identityHash !== digest({ datasetRoot: datasetRoot(),
        taskId: record.sourceBinding?.taskId }, "outsider/public-agent-wave4/identity/v1")
      || record.identity.taskRoot !== digest({ datasetRoot: datasetRoot(),
        taskId: record.sourceBinding?.taskId },
      "outsider/public-agent-wave4/task-correlation/v1")
      || record.identity.sourceRoot !== digest({ datasetRoot: datasetRoot(),
        source: record.sourceBinding?.nativeSourceClass },
      "outsider/public-agent-wave4/source-correlation/v1")
      || !same(record.identity.correlationRoots,
        [...record.identity.correlationRoots].sort())
      || record.identity.correlationRoots.length !== 3
      || new Set(record.identity.correlationRoots).size !== 3
      || !record.identity.correlationRoots.includes(record.identity.datasetRoot)
      || !record.identity.correlationRoots.includes(record.identity.taskRoot)
      || !record.identity.correlationRoots.includes(record.identity.sourceRoot)
      || !exactKeys(record.sourceBinding, ["taskId", "nativeSourceClass",
        "trajectoryContainerHash",
        "annotationContainerHash", "trajectoryRowRoot", "annotationRowRoot", "turnCount",
        "toolCallCount", "writeLikeToolCallCount", "traceContainerBytesAcquired",
        "exactTrajectoryRowReparsed", "exactAnnotationRowReparsed", "annotationJoinedByTaskId"])
      || !Number.isSafeInteger(record.sourceBinding.taskId)
      || !TOKEN.test(record.sourceBinding.nativeSourceClass ?? "")
      || [record.sourceBinding.trajectoryContainerHash,
        record.sourceBinding.annotationContainerHash, record.sourceBinding.trajectoryRowRoot,
        record.sourceBinding.annotationRowRoot].some((value) => !HASH.test(value ?? ""))
      || record.sourceBinding.trajectoryContainerHash
        !== PUBLIC_AGENT_WAVE4_SOURCE_OBJECT_PINS["failure-trajectories.json"].sha256
      || record.sourceBinding.annotationContainerHash
        !== PUBLIC_AGENT_WAVE4_SOURCE_OBJECT_PINS["ground-truth.json"].sha256
      || !Number.isSafeInteger(record.sourceBinding.turnCount)
      || record.sourceBinding.turnCount < 1
      || !Number.isSafeInteger(record.sourceBinding.toolCallCount)
      || record.sourceBinding.toolCallCount < 0
      || !Number.isSafeInteger(record.sourceBinding.writeLikeToolCallCount)
      || record.sourceBinding.writeLikeToolCallCount < 0
      || record.sourceBinding.writeLikeToolCallCount > record.sourceBinding.toolCallCount
      || record.sourceBinding.traceContainerBytesAcquired
        !== AGENTRX_TAU_WAVE4_PIN.trajectoryContainerBytes
      || record.sourceBinding.exactTrajectoryRowReparsed !== true
      || record.sourceBinding.exactAnnotationRowReparsed !== true
      || record.sourceBinding.annotationJoinedByTaskId !== true
      || !exactKeys(record.labels, ["nativeOutcomeKind", "benchmarkReward",
        "benchmarkFailure", "publisherDeclaredManualAnnotation",
        "independentAnnotatorIdentityVerified", "annotatedFailureCount", "rootCauseStep",
        "rootCauseCategory", "rootCauseFailedAgent", "failuresBeforeRootCause",
        "firstUnrecoverableRootCauseClaimedByPublisher", "terminalRecoveryEstablished",
        "actualExecutionOutcomeIndependentlyReplayed", "nativeCostFieldPresent",
        "economicLossObserved"])
      || record.labels.nativeOutcomeKind
        !== "PUBLISHER_RELEASED_FAILED_EXECUTION_WITH_MANUAL_ROOT_CAUSE_ANNOTATION"
      || record.labels.benchmarkReward !== 0 || record.labels.benchmarkFailure !== true
      || record.labels.publisherDeclaredManualAnnotation !== true
      || record.labels.independentAnnotatorIdentityVerified !== false
      || !Number.isSafeInteger(record.labels.annotatedFailureCount)
      || record.labels.annotatedFailureCount < 1
      || !Number.isSafeInteger(record.labels.rootCauseStep)
      || record.labels.rootCauseStep < 1
      || record.labels.rootCauseStep > record.sourceBinding.turnCount
      || !FAILURE_CATEGORIES.includes(record.labels.rootCauseCategory)
      || !["ASSISTANT", "USER"].includes(record.labels.rootCauseFailedAgent)
      || !Number.isSafeInteger(record.labels.failuresBeforeRootCause)
      || record.labels.failuresBeforeRootCause < 0
      || record.labels.failuresBeforeRootCause >= record.labels.annotatedFailureCount
      || record.labels.firstUnrecoverableRootCauseClaimedByPublisher !== true
      || record.labels.terminalRecoveryEstablished !== false
      || record.labels.actualExecutionOutcomeIndependentlyReplayed !== false
      || typeof record.labels.nativeCostFieldPresent !== "boolean"
      || record.labels.economicLossObserved !== false
      || !same(record.privacy, { rawTracePersisted: false, rawPromptPersisted: false,
        rawToolPayloadPersisted: false, rawAnnotationTextPersisted: false,
        projection: "hashes-bounded-counts-and-publisher-failure-labels-only" })
      || !same(record.useBoundary, boundary())) return Object.freeze({ ok: false });
    const { recordHash, ...body } = record;
    return Object.freeze({ ok: recordHash === digest(body, PUBLIC_AGENT_WAVE4_SCHEMAS.record),
      recordHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyPublicAgentWave4Manifest(manifest) {
  try {
    const expectedObjects = Object.entries(PUBLIC_AGENT_WAVE4_SOURCE_OBJECT_PINS)
      .map(([path, object]) => ({ path, ...object }))
      .sort((left, right) => left.path.localeCompare(right.path));
    if (!exactKeys(manifest, ["schema", "schemaVersion", "generatedAt",
      "generatedAtEvidence", "source", "acquiredScope", "provenanceProof",
      "interpretation", "evidenceOntology", "useBoundary", "manifestHash"])
      || manifest.schema !== PUBLIC_AGENT_WAVE4_SCHEMAS.manifest
      || manifest.schemaVersion !== "1.0.0" || !HASH.test(manifest.manifestHash ?? "")
      || new Date(manifest.generatedAt).toISOString() !== manifest.generatedAt
      || !same(manifest.generatedAtEvidence,
        { status: "SELF_ASSERTED_LOCAL_TIME", externallyVerified: false })
      || !exactKeys(manifest.source, ["id", "repository", "revision", "tree",
        "sourceClass", "sourceKind", "license"])
      || !exactKeys(manifest.source?.license, ["repositoryIdentifier",
        "linkedDatasetIdentifier", "linkedDatasetRevision",
        "repositoryDeclarationObjectPaths", "linkedDatasetCardUrl",
        "sourceByteEquivalenceToGatedDatasetEstablished", "adapterGrantsRights",
        "legalConclusion"])
      || manifest.source?.id !== AGENTRX_TAU_WAVE4_PIN.id
      || manifest.source?.repository !== AGENTRX_TAU_WAVE4_PIN.repository
      || manifest.source?.revision !== AGENTRX_TAU_WAVE4_PIN.revision
      || manifest.source?.tree !== AGENTRX_TAU_WAVE4_PIN.tree
      || manifest.source?.sourceClass !== AGENTRX_TAU_WAVE4_PIN.sourceClass
      || manifest.source?.sourceKind !== AGENTRX_TAU_WAVE4_PIN.sourceKind
      || manifest.source?.license?.repositoryIdentifier !== "MIT"
      || manifest.source?.license?.linkedDatasetIdentifier !== "CC-BY-4.0"
      || manifest.source?.license?.linkedDatasetRevision
        !== AGENTRX_TAU_WAVE4_PIN.linkedDatasetRevision
      || !same(manifest.source?.license?.repositoryDeclarationObjectPaths,
        ["LICENSE.txt", "README.md"])
      || manifest.source?.license?.linkedDatasetCardUrl
        !== `https://huggingface.co/datasets/microsoft/AgentRx/blob/${AGENTRX_TAU_WAVE4_PIN.linkedDatasetRevision}/README.md`
      || manifest.source?.license?.sourceByteEquivalenceToGatedDatasetEstablished !== false
      || manifest.source?.license?.adapterGrantsRights !== false
      || manifest.source?.license?.legalConclusion !== false
      || !verifyPublicEvidenceOntologyReference(manifest.evidenceOntology).ok
      || !same(manifest.evidenceOntology, AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE)
      || !exactKeys(manifest.acquiredScope, ["status", "trajectoryRows",
        "manualAnnotationRows", "rowsJoinedExactly", "trajectoryObjectPath",
        "annotationObjectPath", "acquiredObjects", "acquiredBytes",
        "traceContainerBytesAcquired", "excludedScopes"])
      || manifest.acquiredScope?.status !== "COMPLETE_PINNED_TAU_FAILED_SPLIT_SELECTION"
      || manifest.acquiredScope?.trajectoryRows !== AGENTRX_TAU_WAVE4_PIN.trajectoryRows
      || manifest.acquiredScope?.manualAnnotationRows !== AGENTRX_TAU_WAVE4_PIN.annotationRows
      || manifest.acquiredScope?.rowsJoinedExactly !== AGENTRX_TAU_WAVE4_PIN.trajectoryRows
      || manifest.acquiredScope?.trajectoryObjectPath !== "failure-trajectories.json"
      || manifest.acquiredScope?.annotationObjectPath !== "ground-truth.json"
      || !same(manifest.acquiredScope?.acquiredObjects, expectedObjects)
      || manifest.acquiredScope?.acquiredBytes
        !== expectedObjects.reduce((sum, object) => sum + object.sizeBytes, 0)
      || manifest.acquiredScope?.traceContainerBytesAcquired
        !== AGENTRX_TAU_WAVE4_PIN.trajectoryContainerBytes
      || !same(manifest.acquiredScope?.excludedScopes,
        ["FLASH_SPLIT", "MAGENTIC_ONE_SPLIT", "GATED_HUGGING_FACE_DATA_OBJECTS",
          "UNSELECTED_REPOSITORY_OBJECTS"])
      || !same(manifest.provenanceProof, {
        selectedObjectByteIdentity: "PINNED_BYTES_VERIFIED",
        repositoryRevisionBinding: "PINNED_GIT_TREE_BLOB_BINDING_VERIFIED",
        trajectoryAnnotationJoin: "ALL_SELECTED_ROWS_REPARSED_AND_JOINED_BY_TASK_ID",
        repositoryLicenseDeclarationBytes: "PINNED_DECLARATION_BYTES_VERIFIED",
        linkedDatasetLicenseDeclaration: "PINNED_CARD_BYTES_CC_BY_4_0_VERIFIED",
      })
      || !same(manifest.interpretation, {
        publisherDeclaresManualFailureAnnotation: true,
        publisherPaperDeclaresIndependentDomainAnnotators: true,
        rowLevelAnnotatorIdentityVerified: false,
        completeSelectedTraceRows: true,
        failureRateEstimableFromSelectedScope: false,
        sandboxActionsAreRealWorldSideEffects: false,
        benchmarkRewardIsEconomicLoss: false,
        nativeCostFieldIsEconomicLoss: false,
        causalEffectClaimed: false,
        automaticTrainingPromotion: false,
      })
      || !same(manifest.useBoundary, boundary())) return Object.freeze({ ok: false });
    const { manifestHash, ...body } = manifest;
    return Object.freeze({ ok: manifestHash === digest(body, PUBLIC_AGENT_WAVE4_SCHEMAS.manifest),
      manifestHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyPublicAgentWave4RecordSet(records, { manifest } = {}) {
  try {
    if (!Array.isArray(records) || records.length !== AGENTRX_TAU_WAVE4_PIN.trajectoryRows
      || !verifyPublicAgentWave4Manifest(manifest).ok) return Object.freeze({ ok: false });
    return Object.freeze({ ok: true, ...buildRecordSet(records, manifest) });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyPublicAgentWave4Source(sourceDirectory,
  { generatedAt = PUBLIC_AGENT_WAVE4_CANONICAL_GENERATED_AT } = {}) {
  const actual = readdirSync(sourceDirectory).sort();
  const expected = Object.keys(PUBLIC_AGENT_WAVE4_SOURCE_OBJECT_PINS).sort();
  if (!same(actual, expected)) fail("PUBLIC_AGENT_WAVE4_SOURCE_FILE_SET_MISMATCH");
  const snapshots = Object.fromEntries(expected.map((name) =>
    [name, readPinned(sourceDirectory, name)]));
  verifyRepositoryBinding(snapshots);
  const license = snapshots["LICENSE.txt"].bytes.toString("utf8");
  const readme = snapshots["README.md"].bytes.toString("utf8");
  const linkedDatasetCard = snapshots["linked-dataset-card.md"].bytes.toString("utf8");
  if (!/MIT License/.test(license)
    || !/Permission is hereby granted, free of charge/.test(license)
    || !/\[\[Dataset\]\]\(https:\/\/huggingface\.co\/datasets\/microsoft\/AgentRx\)/.test(readme)
    || !/Licensed under the \[MIT\]\(LICENSE\.txt\) license\./.test(readme)
    || !/^---\nlicense: cc-by-4\.0\n/m.test(linkedDatasetCard)) {
    fail("PUBLIC_AGENT_WAVE4_LICENSE_DECLARATION_INVALID");
  }
  const trajectories = parseJson(snapshots["failure-trajectories.json"].bytes,
    "PUBLIC_AGENT_WAVE4_TRAJECTORIES_INVALID");
  const annotations = parseJson(snapshots["ground-truth.json"].bytes,
    "PUBLIC_AGENT_WAVE4_GROUND_TRUTH_INVALID");
  parseJson(snapshots["tool-schema.json"].bytes, "PUBLIC_AGENT_WAVE4_TOOL_SCHEMA_INVALID");
  if (!Array.isArray(trajectories) || !Array.isArray(annotations)
    || trajectories.length !== AGENTRX_TAU_WAVE4_PIN.trajectoryRows
    || annotations.length !== AGENTRX_TAU_WAVE4_PIN.annotationRows) {
    fail("PUBLIC_AGENT_WAVE4_SOURCE_ROW_COUNT_INVALID");
  }
  const annotationById = new Map();
  for (const annotation of annotations) {
    if (!Number.isSafeInteger(annotation?.trajectory_id)
      || annotationById.has(annotation.trajectory_id)) {
      fail("PUBLIC_AGENT_WAVE4_ANNOTATION_ID_DUPLICATED");
    }
    annotationById.set(annotation.trajectory_id, annotation);
  }
  const trajectoryIds = new Set();
  const records = trajectories.map((trajectory) => {
    if (!Number.isSafeInteger(trajectory?.task_id) || trajectoryIds.has(trajectory.task_id)) {
      fail("PUBLIC_AGENT_WAVE4_TRAJECTORY_ID_DUPLICATED");
    }
    trajectoryIds.add(trajectory.task_id);
    const annotation = annotationById.get(trajectory.task_id);
    if (!annotation) fail("PUBLIC_AGENT_WAVE4_ANNOTATION_ROW_MISSING");
    return normalizeAgentRxTauFailureTrace(trajectory, annotation, {
      trajectoryContainerHash: snapshots["failure-trajectories.json"].object.sha256,
      annotationContainerHash: snapshots["ground-truth.json"].object.sha256,
    });
  });
  if (trajectoryIds.size !== annotationById.size
    || [...annotationById.keys()].some((id) => !trajectoryIds.has(id))) {
    fail("PUBLIC_AGENT_WAVE4_SOURCE_SCOPE_MISMATCH");
  }
  const manifest = sourceManifest(generatedAt, snapshots);
  const recordSet = buildRecordSet(records, manifest);
  const summary = buildSummary(records, manifest, recordSet);
  const expectedCounts = {
    turns: AGENTRX_TAU_WAVE4_PIN.turns,
    toolCalls: AGENTRX_TAU_WAVE4_PIN.toolCalls,
    writeLikeToolCalls: AGENTRX_TAU_WAVE4_PIN.writeLikeToolCalls,
    annotatedFailureEvents: AGENTRX_TAU_WAVE4_PIN.failureEvents,
    multiFailureRows: AGENTRX_TAU_WAVE4_PIN.multiFailureRows,
    rootCauseAfterFirstFailureRows: AGENTRX_TAU_WAVE4_PIN.rootCauseAfterFirstFailureRows,
    nativeSourceCorrelationComponents: AGENTRX_TAU_WAVE4_PIN.nativeSourceCorrelationRoots,
  };
  for (const [field, expectedValue] of Object.entries(expectedCounts)) {
    if (summary.counts[field] !== expectedValue) {
      fail("PUBLIC_AGENT_WAVE4_EXPECTED_COUNT_MISMATCH", field);
    }
  }
  if (summary.counts.rootCauseFailedAgents.ASSISTANT
      !== AGENTRX_TAU_WAVE4_PIN.assistantRootCauseRows
    || summary.counts.rootCauseFailedAgents.USER !== AGENTRX_TAU_WAVE4_PIN.userRootCauseRows) {
    fail("PUBLIC_AGENT_WAVE4_ROOT_CAUSE_AGENT_COUNT_MISMATCH");
  }
  const verificationBody = {
    schema: PUBLIC_AGENT_WAVE4_SCHEMAS.verification,
    schemaVersion: "1.0.0",
    status: "FULL_SELECTED_SOURCE_OBJECTS_AND_ROW_JOIN_REPRODUCED",
    sourceCompleteness: "COMPLETE_PINNED_TAU_FAILED_SPLIT_SELECTION",
    manifestHash: manifest.manifestHash,
    recordSetHash: recordSet.recordSetHash,
    summaryHash: summary.summaryHash,
    records: records.length,
    taskCorrelationComponents: recordSet.uniqueTaskCorrelationComponents,
    nativeSourceCorrelationComponents: recordSet.uniqueNativeSourceCorrelationComponents,
    acquiredObjects: manifest.acquiredScope.acquiredObjects.length,
    acquiredBytes: manifest.acquiredScope.acquiredBytes,
    traceContainerBytesAcquired: AGENTRX_TAU_WAVE4_PIN.trajectoryContainerBytes,
    trust: {
      selectedObjectByteIdentityVerified: true,
      repositoryRevisionTreeBound: true,
      completeSelectedTrajectoryRowsReparsed: true,
      completeSelectedAnnotationRowsReparsed: true,
      exactTrajectoryAnnotationJoinVerified: true,
      repositoryLicenseDeclarationBytesVerified: true,
      linkedDatasetCardBytesVerified: true,
      sourceByteEquivalenceToGatedDatasetEstablished: false,
      manualAnnotatorIdentityIndependentlyVerified: false,
      actualSandboxExecutionIndependentlyReplayed: false,
      legalConclusion: false,
      generatedAtExternallyVerified: false,
    },
    evidenceOntology: AGENTRX_TAU_WAVE4_ONTOLOGY_REFERENCE,
    boundary: boundary(),
  };
  const verification = Object.freeze({ ...verificationBody,
    verificationHash: digest(verificationBody, PUBLIC_AGENT_WAVE4_SCHEMAS.verification) });
  return Object.freeze({ manifest, records: Object.freeze(records), recordSet, summary,
    verification, candidateDecision: buildPublicAgentWave4CandidateDecision() });
}
