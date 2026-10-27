/*
 * Public agent evidence, acquisition wave 3.
 *
 * CUARewardBench publishes human-reviewed benchmark annotations and a manifest
 * of trajectory objects, but not the trajectory bytes in its repository.  This
 * adapter therefore mints a metadata-only label registry.  It can prove the
 * pinned annotation and manifest bytes; it cannot evaluate a trace, establish
 * recovery, create causal credit, admit loss, train automatically, or price.
 */

import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalizeStrict } from "./canonical.js";
import { readPinnedPublicAgentSourceSnapshot }
  from "./outsider-public-agent-artifacts.js";

export const PUBLIC_AGENT_WAVE3_SCHEMAS = Object.freeze({
  manifest: "outsider/public-agent-wave3-metadata-manifest/v1",
  record: "outsider/public-agent-wave3-metadata-label/v1",
  recordSet: "outsider/public-agent-wave3-metadata-record-set/v1",
  summary: "outsider/public-agent-wave3-metadata-summary/v1",
  verification: "outsider/public-agent-wave3-metadata-verification/v1",
  candidateDecision: "outsider/public-agent-wave3-candidate-decision/v1",
});

export const PUBLIC_AGENT_WAVE3_CANONICAL_GENERATED_AT =
  "2026-08-21T00:00:00.000Z";

export const CUAREWARDBENCH_WAVE3_PIN = Object.freeze({
  id: "Tencent/CUARewardBench",
  revision: "33a04c96b86cea643f9d396e4879f778717fb923",
  licenseId: "Apache-2.0",
  sourceClass: "controlled-osworld-human-annotation-metadata",
  sourceKind: "CUAREWARDBENCH_METADATA_LABEL_REGISTRY",
  annotationsPath: "data/annotations/cuarewardbench-v0.4.json",
  manifestPath: "data/manifest.jsonl",
  annotationRows: 272,
  uniqueTaskComponents: 122,
  successRows: 139,
  failureRows: 133,
  processLabelItems: 346,
  referencedScreenshots: 3_016,
  referencedScreenshotBytes: 1_275_029_276,
  referencedTrajectoryFiles: 341,
  referencedTrajectoryBytes: 3_064_960,
});

export const PUBLIC_AGENT_WAVE3_SOURCE_OBJECT_PINS = Object.freeze({
  "LICENSE": Object.freeze({ sizeBytes: 11768,
    sha256: "sha256:f92e77020e3c0447596f6a45681aa68e363153f991b0b477952bc4b02fda7d60" }),
  "README.md": Object.freeze({ sizeBytes: 17261,
    sha256: "sha256:2a748d5d0b50fcca788a73e6dcd5e5c3c1b5a388ff66235752957346f6036da0" }),
  "annotation-protocol.md": Object.freeze({ sizeBytes: 2656,
    sha256: "sha256:65aa8214d4e3d75bccfbaccf712d132a382a533468a5563c168456122f8794a5" }),
  "annotations.json": Object.freeze({ sizeBytes: 204921,
    sha256: "sha256:12840380f906b80c1ff697f537c0ec9929665525e712cf9d919ddc4c58bbbed3" }),
  "dataset-card.md": Object.freeze({ sizeBytes: 4032,
    sha256: "sha256:03f60c234e1d33cd4d6841bce9b219dbc4145379847609e5fa71a337a6dda7b6" }),
  "download-data.sh": Object.freeze({ sizeBytes: 4679,
    sha256: "sha256:383d6f12bb23b2fd752e94ccb587e4f0774366c94a5a35e893275dc6ad33f222" }),
  "prepare-downloaded-trajs.py": Object.freeze({ sizeBytes: 13032,
    sha256: "sha256:74a749f01945b46b0de244772441da9748726bf1cede01594562d5073c5fcf9f" }),
  "repository-commit.json": Object.freeze({ sizeBytes: 1131,
    sha256: "sha256:5ba3cd3ea0b622cc7e6d813eae434335a6cfe9d58e56257dedaff010b77a32e3" }),
  "repository-tree.json": Object.freeze({ sizeBytes: 13620,
    sha256: "sha256:e9f0a66423ec75a013ff18b41873264abc41d7f4dceadd6156844553cde301c9" }),
  "trajectory-manifest.jsonl": Object.freeze({ sizeBytes: 520142,
    sha256: "sha256:66584861866904607527db94bcaa90d4596ed5e0a1cc4632b30aa9bdda1b573f" }),
  "verify-data.py": Object.freeze({ sizeBytes: 4574,
    sha256: "sha256:609e5fabc5c770272e8a1dede2865f5f9284e2233c8d5d8b2a899b558214ed8e" }),
});

const UPSTREAM_PATHS = Object.freeze({
  "LICENSE": "LICENSE",
  "README.md": "README.md",
  "annotation-protocol.md": "docs/annotation_protocol.md",
  "annotations.json": CUAREWARDBENCH_WAVE3_PIN.annotationsPath,
  "dataset-card.md": "docs/dataset_card.md",
  "download-data.sh": "scripts/download_data.sh",
  "prepare-downloaded-trajs.py": "scripts/prepare_downloaded_trajs.py",
  "trajectory-manifest.jsonl": CUAREWARDBENCH_WAVE3_PIN.manifestPath,
  "verify-data.py": "scripts/verify_data.py",
});

const HASH = /^sha256:[a-f0-9]{64}$/;
const BARE_HASH = /^[a-f0-9]{64}$/;
const SHA1 = /^[a-f0-9]{40}$/;
const TOKEN = /^[A-Za-z0-9][A-Za-z0-9._:+/-]{0,127}$/;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const SUCCESS_FIELDS = ["key_good_in_success", "key_bad_in_success",
  "key_good_after_bad_in_success"];
const FAILURE_FIELDS = ["key_bad_in_fail", "key_good_before_bad_in_fail"];
const REQUIRED_FIELDS = ["model_setting", "task_type", "task_id", "result", "step_num",
  "comments", "instruction", "vis_md"];
const LABEL_FIELDS = ["nativeOutcomeKind", "benchmarkSuccess", "stepCount",
  "keyGoodInSuccess", "keyBadInSuccess", "keyGoodAfterBadInSuccess", "keyBadInFail",
  "keyGoodBeforeBadInFail", "instructionCommitment", "commentCount",
  "commentsCommitment", "independentIncidentAdjudication", "economicLossObserved",
  "recoveryEstablishedFromTrace"];
const SOURCE_BINDING_FIELDS = ["annotationsObjectHash", "trajectoryManifestObjectHash",
  "annotationRowRoot", "traceManifestEntryRoot", "referencedScreenshotObjects",
  "referencedScreenshotBytes", "referencedTrajectoryObjects", "referencedTrajectoryBytes",
  "traceBytesAcquired", "traceObjectHashesVerifiedAgainstBytes"];

function fail(code, detail = null) {
  throw new Error(detail == null ? code : `${code}:${detail}`);
}
function plain(value) { return value != null && typeof value === "object" && !Array.isArray(value); }
function same(left, right) { return canonicalizeStrict(left) === canonicalizeStrict(right); }
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
function parseJsonl(bytes, code) {
  try {
    const text = bytes.toString("utf8");
    if (!text.endsWith("\n")) fail(code, "FINAL_NEWLINE_MISSING");
    return text.trimEnd().split("\n").map((line) => JSON.parse(line));
  } catch (error) { fail(code, error instanceof Error ? error.message : String(error)); }
}
function boundary() {
  return {
    disposition: "METADATA_ONLY_QUARANTINED_NO_TRACE_BYTES",
    traceBytesAcquired: 0,
    trajectoryTruthUsable: false,
    causalExperienceUnits: 0,
    economicLossRows: 0,
    pricingEligibleRows: 0,
    automaticTraining: false,
    permits: { FULL_SOURCE: false, CEU: false, PRICE: false, GUARANTEE: false, SETTLE: false },
  };
}
function readPinned(sourceDirectory, name) {
  const pin = PUBLIC_AGENT_WAVE3_SOURCE_OBJECT_PINS[name];
  if (!pin) fail("PUBLIC_AGENT_WAVE3_SOURCE_PIN_MISSING", name);
  return readPinnedPublicAgentSourceSnapshot(join(sourceDirectory, name), pin,
    "PUBLIC_AGENT_WAVE3_SOURCE_SNAPSHOT_MISMATCH");
}
function acquiredObject(name, snapshot) {
  return { path: name, sizeBytes: snapshot.object.sizeBytes, sha256: snapshot.object.sha256 };
}
function tuple(row) { return `${row.model_setting}\0${row.task_type}\0${row.task_id}`; }
function integerString(value, code) {
  if (!/^[0-9]+$/.test(String(value ?? ""))) fail(code);
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > 10_000) fail(code);
  return number;
}
function stepList(value, stepCount, code) {
  if (!Array.isArray(value) || value.length > stepCount
    || value.some((item) => !Number.isSafeInteger(item) || item < 1 || item > stepCount)) fail(code);
  const sorted = [...new Set(value)].sort((left, right) => left - right);
  if (sorted.length !== value.length || !same(sorted, value)) fail(`${code}_NOT_SORTED_UNIQUE`);
  return sorted;
}

function validateAnnotation(row) {
  if (!plain(row) || !["0", "1"].includes(row.result)
    || !exactKeys(row, [...REQUIRED_FIELDS,
      ...(row.result === "1" ? SUCCESS_FIELDS : FAILURE_FIELDS)])
    || !TOKEN.test(row.model_setting ?? "") || !TOKEN.test(row.task_type ?? "")
    || !UUID.test(row.task_id ?? "") || typeof row.instruction !== "string"
    || row.instruction.length < 1 || row.instruction.length > 16_384
    || typeof row.vis_md !== "string" || row.vis_md.length < 1 || row.vis_md.length > 16_384
    || !Array.isArray(row.comments) || row.comments.length > 128
    || row.comments.some((comment) => typeof comment !== "string" || comment.length > 16_384)) {
    fail("PUBLIC_AGENT_WAVE3_ANNOTATION_SHAPE_INVALID");
  }
  const stepCount = integerString(row.step_num, "PUBLIC_AGENT_WAVE3_STEP_COUNT_INVALID");
  const labels = Object.fromEntries([...SUCCESS_FIELDS, ...FAILURE_FIELDS].map((field) =>
    [field, stepList(row[field] ?? [], stepCount, `PUBLIC_AGENT_WAVE3_${field.toUpperCase()}_INVALID`)]));
  return { stepCount, labels };
}

function validateTraceObject(value, code) {
  if (!exactKeys(value, ["name", "size", "sha256"])
    || typeof value.name !== "string" || value.name.length < 1 || value.name.length > 512
    || !Number.isSafeInteger(value.size) || value.size < 1 || !BARE_HASH.test(value.sha256 ?? "")) {
    fail(code);
  }
  return { name: value.name, size: value.size, sha256: value.sha256 };
}

function validateManifestRow(row) {
  if (!exactKeys(row, ["model_setting", "task_type", "task_id", "rel_dir",
    "num_screenshots", "screenshots", "traj_files"])
    || !TOKEN.test(row.model_setting ?? "") || !TOKEN.test(row.task_type ?? "")
    || !UUID.test(row.task_id ?? "") || typeof row.rel_dir !== "string"
    || row.rel_dir.length < 1 || row.rel_dir.length > 2048
    || !Number.isSafeInteger(row.num_screenshots) || row.num_screenshots < 1
    || !Array.isArray(row.screenshots) || row.screenshots.length !== row.num_screenshots
    || !Array.isArray(row.traj_files) || row.traj_files.length < 1) {
    fail("PUBLIC_AGENT_WAVE3_TRAJECTORY_MANIFEST_ROW_INVALID");
  }
  return { screenshots: row.screenshots.map((object) => validateTraceObject(object,
    "PUBLIC_AGENT_WAVE3_SCREENSHOT_OBJECT_INVALID")),
  trajectories: row.traj_files.map((object) => validateTraceObject(object,
    "PUBLIC_AGENT_WAVE3_TRAJECTORY_OBJECT_INVALID")) };
}

function datasetRoot() {
  return digest({ id: CUAREWARDBENCH_WAVE3_PIN.id,
    revision: CUAREWARDBENCH_WAVE3_PIN.revision },
  "outsider/public-agent-wave3/dataset-root/v1");
}

export function normalizeCuaRewardBenchMetadataRow(annotation, manifestRow,
  { annotationsObjectHash, trajectoryManifestObjectHash } = {}) {
  if (!HASH.test(annotationsObjectHash ?? "") || !HASH.test(trajectoryManifestObjectHash ?? "")
    || tuple(annotation) !== tuple(manifestRow)) {
    fail("PUBLIC_AGENT_WAVE3_ROW_SOURCE_BINDING_INVALID");
  }
  const checked = validateAnnotation(annotation);
  const trace = validateManifestRow(manifestRow);
  const root = datasetRoot();
  const taskRoot = digest({ dataset: CUAREWARDBENCH_WAVE3_PIN.id,
    taskType: annotation.task_type, taskId: annotation.task_id },
  "outsider/public-agent-wave3/task-correlation/v1");
  const modelRoot = digest({ dataset: CUAREWARDBENCH_WAVE3_PIN.id,
    modelSetting: annotation.model_setting }, "outsider/public-agent-wave3/model-correlation/v1");
  const taskTypeRoot = digest({ dataset: CUAREWARDBENCH_WAVE3_PIN.id,
    taskType: annotation.task_type }, "outsider/public-agent-wave3/task-type-correlation/v1");
  const identityHash = digest({ datasetRoot: root, tuple: tuple(annotation) },
    "outsider/public-agent-wave3/identity/v1");
  const traceManifestEntryRoot = digest(manifestRow,
    "outsider/public-agent-wave3/trajectory-manifest-entry/v1");
  const body = {
    schema: PUBLIC_AGENT_WAVE3_SCHEMAS.record,
    schemaVersion: "1.0.0",
    dataset: { id: CUAREWARDBENCH_WAVE3_PIN.id,
      revision: CUAREWARDBENCH_WAVE3_PIN.revision,
      sourceClass: CUAREWARDBENCH_WAVE3_PIN.sourceClass,
      licenseId: CUAREWARDBENCH_WAVE3_PIN.licenseId },
    identity: { identityHash, datasetRoot: root, taskRoot, modelRoot, taskTypeRoot,
      correlationRoots: [root, taskRoot, modelRoot, taskTypeRoot].sort() },
    sourceBinding: { annotationsObjectHash, trajectoryManifestObjectHash,
      annotationRowRoot: digest(annotation, "outsider/public-agent-wave3/annotation-row/v1"),
      traceManifestEntryRoot,
      referencedScreenshotObjects: trace.screenshots.length,
      referencedScreenshotBytes: trace.screenshots.reduce((sum, object) => sum + object.size, 0),
      referencedTrajectoryObjects: trace.trajectories.length,
      referencedTrajectoryBytes: trace.trajectories.reduce((sum, object) => sum + object.size, 0),
      traceBytesAcquired: 0,
      traceObjectHashesVerifiedAgainstBytes: false },
    labels: {
      nativeOutcomeKind: "REPOSITORY_DECLARED_HUMAN_REVIEWED_BENCHMARK_RESULT",
      benchmarkSuccess: annotation.result === "1",
      stepCount: checked.stepCount,
      keyGoodInSuccess: checked.labels.key_good_in_success,
      keyBadInSuccess: checked.labels.key_bad_in_success,
      keyGoodAfterBadInSuccess: checked.labels.key_good_after_bad_in_success,
      keyBadInFail: checked.labels.key_bad_in_fail,
      keyGoodBeforeBadInFail: checked.labels.key_good_before_bad_in_fail,
      instructionCommitment: digest(annotation.instruction,
        "outsider/public-agent-wave3/instruction/v1"),
      commentCount: annotation.comments.length,
      commentsCommitment: digest(annotation.comments,
        "outsider/public-agent-wave3/comments/v1"),
      independentIncidentAdjudication: false,
      economicLossObserved: false,
      recoveryEstablishedFromTrace: false,
    },
    privacy: { instructionPersisted: false, commentsPersisted: false,
      visMdPersisted: false, localAbsolutePathPersisted: false,
      projection: "hashes-bounded-labels-and-trace-manifest-counts-only" },
    useBoundary: boundary(),
  };
  return Object.freeze({ ...body,
    recordHash: digest(body, PUBLIC_AGENT_WAVE3_SCHEMAS.record) });
}

function verifyRepositoryBinding(snapshots) {
  const commit = parseJson(snapshots["repository-commit.json"].bytes,
    "PUBLIC_AGENT_WAVE3_REPOSITORY_COMMIT_INVALID");
  const tree = parseJson(snapshots["repository-tree.json"].bytes,
    "PUBLIC_AGENT_WAVE3_REPOSITORY_TREE_INVALID");
  if (commit.sha !== CUAREWARDBENCH_WAVE3_PIN.revision || !SHA1.test(commit.tree?.sha ?? "")
    || tree.sha !== commit.tree.sha || tree.truncated !== false || !Array.isArray(tree.tree)) {
    fail("PUBLIC_AGENT_WAVE3_REPOSITORY_REVISION_BINDING_INVALID");
  }
  for (const [name, upstreamPath] of Object.entries(UPSTREAM_PATHS)) {
    const entry = tree.tree.find((candidate) => candidate?.path === upstreamPath);
    const snapshot = snapshots[name];
    if (entry?.type !== "blob" || entry.size !== snapshot.object.sizeBytes
      || entry.sha !== gitBlobOid(snapshot.bytes)) {
      fail("PUBLIC_AGENT_WAVE3_REPOSITORY_OBJECT_BINDING_INVALID", name);
    }
  }
  return { commit, tree };
}

function sourceManifest(generatedAt, snapshots) {
  const acquiredObjects = Object.entries(snapshots).map(([name, snapshot]) =>
    acquiredObject(name, snapshot)).sort((left, right) => left.path.localeCompare(right.path));
  const body = {
    schema: PUBLIC_AGENT_WAVE3_SCHEMAS.manifest,
    schemaVersion: "1.0.0",
    generatedAt,
    generatedAtEvidence: { status: "SELF_ASSERTED_LOCAL_TIME", externallyVerified: false },
    source: { id: CUAREWARDBENCH_WAVE3_PIN.id,
      revision: CUAREWARDBENCH_WAVE3_PIN.revision,
      sourceClass: CUAREWARDBENCH_WAVE3_PIN.sourceClass,
      sourceKind: CUAREWARDBENCH_WAVE3_PIN.sourceKind,
      license: { identifier: CUAREWARDBENCH_WAVE3_PIN.licenseId,
        scope: "REPOSITORY_AUTHORED_CODE_ANNOTATIONS_METADATA_AND_DOCUMENTATION_ONLY",
        upstreamTrajectoryRightsClaimed: false,
        adapterGrantsRights: false,
        legalConclusion: false,
        declarationObjectPaths: ["LICENSE", "README.md", "dataset-card.md"] } },
    acquiredScope: { status: "COMPLETE_PINNED_METADATA_SCOPE",
      annotationRows: CUAREWARDBENCH_WAVE3_PIN.annotationRows,
      annotationObjectPath: "annotations.json",
      trajectoryManifestObjectPath: "trajectory-manifest.jsonl",
      acquiredObjects,
      acquiredBytes: acquiredObjects.reduce((sum, object) => sum + object.sizeBytes, 0),
      traceBytesAcquired: 0,
      excludedObjects: ["UPSTREAM_TRAJECTORY_JSONL", "UPSTREAM_SCREENSHOTS",
        "UPSTREAM_ARCHIVES", "MODEL_EVALUATOR_OUTPUTS"] },
    provenanceProof: {
      annotationAndManifestByteIdentity: "PINNED_BYTES_VERIFIED",
      repositoryRevisionBinding: "PINNED_GIT_TREE_BLOB_BINDING_VERIFIED",
      licenseDeclarationBytes: "PINNED_DECLARATION_BYTES_VERIFIED",
      referencedTraceObjectHashes: "MANIFEST_DECLARATIONS_NOT_REPLAYED",
      trajectorySourceRevision: "NOT_ACQUIRED_PUBLIC_SCRIPT_PINS_AFTER_DOWNLOAD",
    },
    interpretation: {
      repositoryDeclaresExpertAnnotation: true,
      independentHumanAdjudicatorIdentityVerified: false,
      benchmarkLabelsOnly: true,
      fullTrajectoryEvidence: false,
      causalEffectClaimed: false,
      economicLossRows: 0,
      automaticTrainingPromotion: false,
    },
    useBoundary: boundary(),
  };
  return Object.freeze({ ...body,
    manifestHash: digest(body, PUBLIC_AGENT_WAVE3_SCHEMAS.manifest) });
}

function buildRecordSet(records, manifest) {
  const recordHashes = records.map((record) => {
    const checked = verifyPublicAgentWave3MetadataRecord(record);
    if (!checked.ok) fail("PUBLIC_AGENT_WAVE3_RECORD_SET_RECORD_INVALID", checked.error);
    return record.recordHash;
  }).sort();
  const identityHashes = records.map((record) => record.identity.identityHash).sort();
  if (new Set(recordHashes).size !== recordHashes.length
    || new Set(identityHashes).size !== identityHashes.length) {
    fail("PUBLIC_AGENT_WAVE3_RECORD_SET_DUPLICATED");
  }
  const taskRoots = [...new Set(records.map((record) => record.identity.taskRoot))].sort();
  const body = { schema: PUBLIC_AGENT_WAVE3_SCHEMAS.recordSet, schemaVersion: "1.0.0",
    manifestHash: manifest.manifestHash, records: records.length,
    uniqueIdentities: identityHashes.length,
    uniqueTaskCorrelationComponents: taskRoots.length,
    recordHashes, identityCommitment: digest(identityHashes,
      "outsider/public-agent-wave3/identity-set/v1"),
    taskCorrelationCommitment: digest(taskRoots,
      "outsider/public-agent-wave3/task-correlation-set/v1") };
  return Object.freeze({ ...body,
    recordSetHash: digest(body, PUBLIC_AGENT_WAVE3_SCHEMAS.recordSet) });
}

function buildSummary(records, manifest, recordSet) {
  const count = (field) => records.reduce((sum, record) => sum + record.labels[field].length, 0);
  const modelRoots = new Set(records.map((record) => record.identity.modelRoot));
  const taskTypeRoots = new Set(records.map((record) => record.identity.taskTypeRoot));
  const body = {
    schema: PUBLIC_AGENT_WAVE3_SCHEMAS.summary,
    schemaVersion: "1.0.0",
    manifestHash: manifest.manifestHash,
    recordSetHash: recordSet.recordSetHash,
    counts: {
      sourceRows: records.length,
      uniqueNormalizedUnits: records.length,
      taskCorrelationComponents: recordSet.uniqueTaskCorrelationComponents,
      modelSettingComponents: modelRoots.size,
      taskTypeComponents: taskTypeRoots.size,
      benchmarkSuccessRows: records.filter((record) => record.labels.benchmarkSuccess).length,
      benchmarkFailureRows: records.filter((record) => !record.labels.benchmarkSuccess).length,
      processLabelItems: count("keyGoodInSuccess") + count("keyBadInSuccess")
        + count("keyGoodAfterBadInSuccess") + count("keyBadInFail")
        + count("keyGoodBeforeBadInFail"),
      recoveryLabelItems: count("keyGoodAfterBadInSuccess"),
      referencedScreenshotObjects: records.reduce((sum, record) =>
        sum + record.sourceBinding.referencedScreenshotObjects, 0),
      referencedScreenshotBytes: records.reduce((sum, record) =>
        sum + record.sourceBinding.referencedScreenshotBytes, 0),
      referencedTrajectoryObjects: records.reduce((sum, record) =>
        sum + record.sourceBinding.referencedTrajectoryObjects, 0),
      referencedTrajectoryBytes: records.reduce((sum, record) =>
        sum + record.sourceBinding.referencedTrajectoryBytes, 0),
      traceBytesAcquired: 0,
      trajectoryTruthUsableRows: 0,
      causalExperienceUnits: 0,
      economicLossRows: 0,
      pricingEligibleRows: 0,
    },
    interpretation: {
      labelsUsableAsPinnedMetadata: true,
      labelsUsableForTraceBasedEvaluation: false,
      recoveryEstablishedFromTrace: false,
      rowsAreIndependentTrials: false,
      taskCorrelationExplicit: true,
      rawInstructionOrLocalPathPersisted: false,
      automaticTraining: false,
    },
    useBoundary: boundary(),
  };
  return Object.freeze({ ...body,
    summaryHash: digest(body, PUBLIC_AGENT_WAVE3_SCHEMAS.summary) });
}

export function buildPublicAgentWave3CandidateDecision() {
  const body = {
    schema: PUBLIC_AGENT_WAVE3_SCHEMAS.candidateDecision,
    schemaVersion: "1.0.0",
    selected: [{ id: CUAREWARDBENCH_WAVE3_PIN.id,
      revision: CUAREWARDBENCH_WAVE3_PIN.revision,
      decision: "INGEST_METADATA_ONLY_QUARANTINED_NO_TRACE_BYTES",
      reason: "Pinned Apache-2.0 annotations and manifest add human benchmark process labels" }],
    deferred: [
      { id: "NHTSA_SGO_ADS_CRASH_REPORTS",
        sourceObjectHash: "sha256:7ed5b160593b1eca85a199a0ae31cd694c952b5adfb99ba9692769d1596e114c",
        sourceObjectBytes: 2_374_527,
        decision: "DEFER_EXISTING_INCIDENT_QUARANTINE",
        blockers: ["RECORD_LEVEL_REUSE_RIGHTS_NOT_VERIFIED_FOR_TRAINING",
          "NO_COMPLETE_EXPOSURE_DENOMINATOR", "NO_INDEPENDENT_ADJUDICATION",
          "NO_OBSERVED_ECONOMIC_LOSS"] },
      { id: "SocNavData/SocNavData2026",
        revision: "974afa9bd47ee4c5decc8f095dbf30dcb07bac5e",
        decision: "DEFER_EXTERNAL_DATA_BUNDLE",
        blockers: ["EXTERNAL_DATA_LICENSE_UNRESOLVED",
          "MUTABLE_DROPBOX_WITHOUT_IMMUTABLE_MANIFEST", "SOURCE_BYTES_UNKNOWN"] },
      { id: "k2-agent/k2-agent/androidworld-trajectories.zip",
        revision: "f9b8fb7f15ebc14fc6ba2ec9d845cf1d724433cb",
        objectBytes: 303_200_384,
        gitObjectId: "b8acbb40535f22c82853d0c1c5cf883174a2e107",
        decision: "DEFER_NO_DATA_LICENSE",
        blockers: ["REPOSITORY_HAS_NO_LICENSE", "BENCHMARK_OUTCOME_NOT_REAL_WORLD_LOSS"] },
      { id: "agentlabtraces/agentlabtraces",
        revision: "6f65d9fa58b152c5860e2fde4eba55d6e0330c6a",
        objectBytes: 207_028_769_008,
        decision: "DEFER_OVERSIZE_UNLICENSED_MONOLITH",
        blockers: ["DATASET_LICENSE_UNDECLARED", "NO_SMALL_OBJECT_MANIFEST",
          "NO_UNIFIED_INDEPENDENT_HUMAN_PROCESS_TRUTH"] },
    ],
    boundary: { deferredSourcesAdmitted: 0, automaticTraining: false,
      economicLossRows: 0, pricingEligibleRows: 0 },
  };
  return Object.freeze({ ...body,
    decisionHash: digest(body, PUBLIC_AGENT_WAVE3_SCHEMAS.candidateDecision) });
}

export function verifyPublicAgentWave3MetadataRecord(record) {
  try {
    if (!exactKeys(record, ["schema", "schemaVersion", "dataset", "identity",
      "sourceBinding", "labels", "privacy", "useBoundary", "recordHash"])
      || record.schema !== PUBLIC_AGENT_WAVE3_SCHEMAS.record || record.schemaVersion !== "1.0.0"
      || !exactKeys(record.dataset, ["id", "revision", "sourceClass", "licenseId"])
      || record.dataset.id !== CUAREWARDBENCH_WAVE3_PIN.id
      || record.dataset.revision !== CUAREWARDBENCH_WAVE3_PIN.revision
      || record.dataset.sourceClass !== CUAREWARDBENCH_WAVE3_PIN.sourceClass
      || record.dataset.licenseId !== CUAREWARDBENCH_WAVE3_PIN.licenseId
      || !exactKeys(record.identity, ["identityHash", "datasetRoot", "taskRoot", "modelRoot",
        "taskTypeRoot", "correlationRoots"])
      || [record.identity.identityHash, record.identity.datasetRoot, record.identity.taskRoot,
        record.identity.modelRoot, record.identity.taskTypeRoot].some((value) => !HASH.test(value ?? ""))
      || record.identity.datasetRoot !== datasetRoot()
      || !same(record.identity.correlationRoots,
        [...record.identity.correlationRoots].sort())
      || record.identity.correlationRoots.length !== 4
      || new Set(record.identity.correlationRoots).size !== 4
      || !record.identity.correlationRoots.includes(record.identity.datasetRoot)
      || !record.identity.correlationRoots.includes(record.identity.taskRoot)
      || !record.identity.correlationRoots.includes(record.identity.modelRoot)
      || !record.identity.correlationRoots.includes(record.identity.taskTypeRoot)
      || !exactKeys(record.sourceBinding, SOURCE_BINDING_FIELDS)
      || [record.sourceBinding.annotationsObjectHash,
        record.sourceBinding.trajectoryManifestObjectHash,
        record.sourceBinding.annotationRowRoot,
        record.sourceBinding.traceManifestEntryRoot].some((value) => !HASH.test(value ?? ""))
      || record.sourceBinding.annotationsObjectHash
        !== PUBLIC_AGENT_WAVE3_SOURCE_OBJECT_PINS["annotations.json"].sha256
      || record.sourceBinding.trajectoryManifestObjectHash
        !== PUBLIC_AGENT_WAVE3_SOURCE_OBJECT_PINS["trajectory-manifest.jsonl"].sha256
      || !Number.isSafeInteger(record.sourceBinding.referencedScreenshotObjects)
      || record.sourceBinding.referencedScreenshotObjects < 1
      || !Number.isSafeInteger(record.sourceBinding.referencedScreenshotBytes)
      || record.sourceBinding.referencedScreenshotBytes < 1
      || !Number.isSafeInteger(record.sourceBinding.referencedTrajectoryObjects)
      || record.sourceBinding.referencedTrajectoryObjects < 1
      || !Number.isSafeInteger(record.sourceBinding.referencedTrajectoryBytes)
      || record.sourceBinding.referencedTrajectoryBytes < 1
      || record.sourceBinding.traceBytesAcquired !== 0
      || record.sourceBinding.traceObjectHashesVerifiedAgainstBytes !== false
      || !exactKeys(record.labels, LABEL_FIELDS)
      || typeof record.labels.benchmarkSuccess !== "boolean"
      || record.labels.nativeOutcomeKind
        !== "REPOSITORY_DECLARED_HUMAN_REVIEWED_BENCHMARK_RESULT"
      || !Number.isSafeInteger(record.labels.stepCount) || record.labels.stepCount < 1
      || !Number.isSafeInteger(record.labels.commentCount) || record.labels.commentCount < 0
      || !HASH.test(record.labels.instructionCommitment ?? "")
      || !HASH.test(record.labels.commentsCommitment ?? "")
      || record.labels.economicLossObserved !== false
      || record.labels.recoveryEstablishedFromTrace !== false
      || record.labels.independentIncidentAdjudication !== false
      || !exactKeys(record.privacy, ["instructionPersisted", "commentsPersisted",
        "visMdPersisted", "localAbsolutePathPersisted", "projection"])
      || Object.entries(record.privacy).filter(([key]) => key !== "projection")
        .some(([, value]) => value !== false)
      || record.privacy.projection
        !== "hashes-bounded-labels-and-trace-manifest-counts-only"
      || !same(record.useBoundary, boundary())) return Object.freeze({ ok: false });
    for (const field of ["keyGoodInSuccess", "keyBadInSuccess", "keyGoodAfterBadInSuccess",
      "keyBadInFail", "keyGoodBeforeBadInFail"]) {
      stepList(record.labels[field], record.labels.stepCount,
        `PUBLIC_AGENT_WAVE3_RECORD_${field.toUpperCase()}_INVALID`);
    }
    if (record.labels.benchmarkSuccess
      && (record.labels.keyBadInFail.length !== 0
        || record.labels.keyGoodBeforeBadInFail.length !== 0)
      || !record.labels.benchmarkSuccess
        && (record.labels.keyGoodInSuccess.length !== 0
          || record.labels.keyBadInSuccess.length !== 0
          || record.labels.keyGoodAfterBadInSuccess.length !== 0)) {
      return Object.freeze({ ok: false });
    }
    const { recordHash, ...body } = record;
    return Object.freeze({ ok: recordHash === digest(body, PUBLIC_AGENT_WAVE3_SCHEMAS.record),
      recordHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyPublicAgentWave3Manifest(manifest) {
  try {
    const expectedObjects = Object.entries(PUBLIC_AGENT_WAVE3_SOURCE_OBJECT_PINS)
      .map(([path, object]) => ({ path, ...object }))
      .sort((left, right) => left.path.localeCompare(right.path));
    if (!exactKeys(manifest, ["schema", "schemaVersion", "generatedAt",
      "generatedAtEvidence", "source", "acquiredScope", "provenanceProof",
      "interpretation", "useBoundary", "manifestHash"])
      || manifest.schema !== PUBLIC_AGENT_WAVE3_SCHEMAS.manifest
      || manifest.schemaVersion !== "1.0.0" || !HASH.test(manifest.manifestHash ?? "")
      || typeof manifest.generatedAt !== "string"
      || new Date(manifest.generatedAt).toISOString() !== manifest.generatedAt
      || !same(manifest.generatedAtEvidence,
        { status: "SELF_ASSERTED_LOCAL_TIME", externallyVerified: false })
      || !exactKeys(manifest.source, ["id", "revision", "sourceClass", "sourceKind", "license"])
      || manifest.source?.id !== CUAREWARDBENCH_WAVE3_PIN.id
      || manifest.source?.revision !== CUAREWARDBENCH_WAVE3_PIN.revision
      || manifest.source?.sourceClass !== CUAREWARDBENCH_WAVE3_PIN.sourceClass
      || manifest.source?.sourceKind !== CUAREWARDBENCH_WAVE3_PIN.sourceKind
      || !exactKeys(manifest.source?.license, ["identifier", "scope",
        "upstreamTrajectoryRightsClaimed", "adapterGrantsRights", "legalConclusion",
        "declarationObjectPaths"])
      || manifest.source?.license?.identifier !== CUAREWARDBENCH_WAVE3_PIN.licenseId
      || manifest.source?.license?.scope
        !== "REPOSITORY_AUTHORED_CODE_ANNOTATIONS_METADATA_AND_DOCUMENTATION_ONLY"
      || manifest.source?.license?.upstreamTrajectoryRightsClaimed !== false
      || manifest.source?.license?.adapterGrantsRights !== false
      || manifest.source?.license?.legalConclusion !== false
      || !same(manifest.source?.license?.declarationObjectPaths,
        ["LICENSE", "README.md", "dataset-card.md"])
      || !exactKeys(manifest.acquiredScope, ["status", "annotationRows",
        "annotationObjectPath", "trajectoryManifestObjectPath", "acquiredObjects",
        "acquiredBytes", "traceBytesAcquired", "excludedObjects"])
      || manifest.acquiredScope?.status !== "COMPLETE_PINNED_METADATA_SCOPE"
      || manifest.acquiredScope?.annotationRows !== CUAREWARDBENCH_WAVE3_PIN.annotationRows
      || manifest.acquiredScope?.annotationObjectPath !== "annotations.json"
      || manifest.acquiredScope?.trajectoryManifestObjectPath !== "trajectory-manifest.jsonl"
      || !same(manifest.acquiredScope?.acquiredObjects, expectedObjects)
      || manifest.acquiredScope?.acquiredBytes
        !== expectedObjects.reduce((sum, object) => sum + object.sizeBytes, 0)
      || manifest.acquiredScope?.traceBytesAcquired !== 0
      || !same(manifest.acquiredScope?.excludedObjects,
        ["UPSTREAM_TRAJECTORY_JSONL", "UPSTREAM_SCREENSHOTS",
          "UPSTREAM_ARCHIVES", "MODEL_EVALUATOR_OUTPUTS"])
      || !exactKeys(manifest.provenanceProof, ["annotationAndManifestByteIdentity",
        "repositoryRevisionBinding", "licenseDeclarationBytes",
        "referencedTraceObjectHashes", "trajectorySourceRevision"])
      || manifest.provenanceProof.annotationAndManifestByteIdentity !== "PINNED_BYTES_VERIFIED"
      || manifest.provenanceProof.repositoryRevisionBinding
        !== "PINNED_GIT_TREE_BLOB_BINDING_VERIFIED"
      || manifest.provenanceProof.licenseDeclarationBytes
        !== "PINNED_DECLARATION_BYTES_VERIFIED"
      || manifest.provenanceProof.referencedTraceObjectHashes
        !== "MANIFEST_DECLARATIONS_NOT_REPLAYED"
      || manifest.provenanceProof.trajectorySourceRevision
        !== "NOT_ACQUIRED_PUBLIC_SCRIPT_PINS_AFTER_DOWNLOAD"
      || !exactKeys(manifest.interpretation, ["repositoryDeclaresExpertAnnotation",
        "independentHumanAdjudicatorIdentityVerified", "benchmarkLabelsOnly",
        "fullTrajectoryEvidence", "causalEffectClaimed", "economicLossRows",
        "automaticTrainingPromotion"])
      || manifest.interpretation?.repositoryDeclaresExpertAnnotation !== true
      || manifest.interpretation?.independentHumanAdjudicatorIdentityVerified !== false
      || manifest.interpretation?.benchmarkLabelsOnly !== true
      || manifest.interpretation?.fullTrajectoryEvidence !== false
      || manifest.interpretation?.causalEffectClaimed !== false
      || manifest.interpretation?.economicLossRows !== 0
      || manifest.interpretation?.automaticTrainingPromotion !== false
      || !same(manifest.useBoundary, boundary())) return Object.freeze({ ok: false });
    const { manifestHash, ...body } = manifest;
    return Object.freeze({ ok: manifestHash === digest(body, PUBLIC_AGENT_WAVE3_SCHEMAS.manifest),
      manifestHash });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyPublicAgentWave3RecordSet(records, { manifest } = {}) {
  try {
    if (!Array.isArray(records) || records.length !== CUAREWARDBENCH_WAVE3_PIN.annotationRows
      || !verifyPublicAgentWave3Manifest(manifest).ok) return Object.freeze({ ok: false });
    const recordSet = buildRecordSet(records, manifest);
    return Object.freeze({ ok: true, ...recordSet });
  } catch (error) {
    return Object.freeze({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

export function verifyPublicAgentWave3Source(sourceDirectory,
  { generatedAt = PUBLIC_AGENT_WAVE3_CANONICAL_GENERATED_AT } = {}) {
  const actual = readdirSync(sourceDirectory).sort();
  const expected = Object.keys(PUBLIC_AGENT_WAVE3_SOURCE_OBJECT_PINS).sort();
  if (!same(actual, expected)) fail("PUBLIC_AGENT_WAVE3_SOURCE_FILE_SET_MISMATCH");
  const snapshots = Object.fromEntries(expected.map((name) => [name, readPinned(sourceDirectory, name)]));
  verifyRepositoryBinding(snapshots);
  const license = snapshots.LICENSE.bytes.toString("utf8");
  const readme = snapshots["README.md"].bytes.toString("utf8");
  const card = snapshots["dataset-card.md"].bytes.toString("utf8");
  if (!/Apache License[\s\S]*Version 2\.0/.test(license)
    || !/Repository-authored code, annotations, metadata, and documentation are released under the Apache License 2\.0/i.test(readme)
    || !/Repository-authored code, annotations, metadata, and documentation are licensed under Apache-2\.0/i.test(card)
    || !/Trajectory screenshots\/images are not redistributed/i.test(readme)
    || !/users must comply with upstream source terms/i.test(card)) {
    fail("PUBLIC_AGENT_WAVE3_LICENSE_SCOPE_INVALID");
  }
  const annotations = parseJson(snapshots["annotations.json"].bytes,
    "PUBLIC_AGENT_WAVE3_ANNOTATIONS_INVALID");
  const traceManifest = parseJsonl(snapshots["trajectory-manifest.jsonl"].bytes,
    "PUBLIC_AGENT_WAVE3_TRAJECTORY_MANIFEST_INVALID");
  if (!Array.isArray(annotations) || annotations.length !== CUAREWARDBENCH_WAVE3_PIN.annotationRows
    || traceManifest.length !== CUAREWARDBENCH_WAVE3_PIN.annotationRows) {
    fail("PUBLIC_AGENT_WAVE3_SOURCE_ROW_COUNT_INVALID");
  }
  const manifestRows = new Map();
  for (const row of traceManifest) {
    validateManifestRow(row);
    if (manifestRows.has(tuple(row))) fail("PUBLIC_AGENT_WAVE3_MANIFEST_TUPLE_DUPLICATED");
    manifestRows.set(tuple(row), row);
  }
  const annotationTuples = new Set();
  const records = annotations.map((annotation) => {
    validateAnnotation(annotation);
    const key = tuple(annotation);
    if (annotationTuples.has(key)) fail("PUBLIC_AGENT_WAVE3_ANNOTATION_TUPLE_DUPLICATED");
    annotationTuples.add(key);
    const manifestRow = manifestRows.get(key);
    if (!manifestRow) fail("PUBLIC_AGENT_WAVE3_MANIFEST_ROW_MISSING");
    return normalizeCuaRewardBenchMetadataRow(annotation, manifestRow, {
      annotationsObjectHash: snapshots["annotations.json"].object.sha256,
      trajectoryManifestObjectHash: snapshots["trajectory-manifest.jsonl"].object.sha256,
    });
  });
  if (annotationTuples.size !== manifestRows.size) fail("PUBLIC_AGENT_WAVE3_SOURCE_SCOPE_MISMATCH");
  const manifest = sourceManifest(generatedAt, snapshots);
  const recordSet = buildRecordSet(records, manifest);
  const summary = buildSummary(records, manifest, recordSet);
  const expectedCounts = {
    taskCorrelationComponents: CUAREWARDBENCH_WAVE3_PIN.uniqueTaskComponents,
    benchmarkSuccessRows: CUAREWARDBENCH_WAVE3_PIN.successRows,
    benchmarkFailureRows: CUAREWARDBENCH_WAVE3_PIN.failureRows,
    processLabelItems: CUAREWARDBENCH_WAVE3_PIN.processLabelItems,
    referencedScreenshotObjects: CUAREWARDBENCH_WAVE3_PIN.referencedScreenshots,
    referencedScreenshotBytes: CUAREWARDBENCH_WAVE3_PIN.referencedScreenshotBytes,
    referencedTrajectoryObjects: CUAREWARDBENCH_WAVE3_PIN.referencedTrajectoryFiles,
    referencedTrajectoryBytes: CUAREWARDBENCH_WAVE3_PIN.referencedTrajectoryBytes,
  };
  for (const [field, value] of Object.entries(expectedCounts)) {
    if (summary.counts[field] !== value) fail("PUBLIC_AGENT_WAVE3_EXPECTED_COUNT_MISMATCH", field);
  }
  const acquiredObjects = manifest.acquiredScope.acquiredObjects;
  const verificationBody = {
    schema: PUBLIC_AGENT_WAVE3_SCHEMAS.verification,
    schemaVersion: "1.0.0",
    status: "PINNED_METADATA_ONLY_REPRODUCED",
    sourceCompleteness: "QUARANTINED_NO_TRACE_BYTES",
    manifestHash: manifest.manifestHash,
    recordSetHash: recordSet.recordSetHash,
    summaryHash: summary.summaryHash,
    records: records.length,
    taskCorrelationComponents: recordSet.uniqueTaskCorrelationComponents,
    acquiredObjects: acquiredObjects.length,
    acquiredBytes: acquiredObjects.reduce((sum, object) => sum + object.sizeBytes, 0),
    traceBytesAcquired: 0,
    referencedTraceBytes: CUAREWARDBENCH_WAVE3_PIN.referencedScreenshotBytes
      + CUAREWARDBENCH_WAVE3_PIN.referencedTrajectoryBytes,
    trust: { metadataByteIdentityVerified: true, repositoryRevisionTreeBound: true,
      metadataLicenseDeclarationBytesVerified: true,
      upstreamTrajectoryRightsClaimed: false,
      traceObjectBytesVerified: false,
      humanReviewerIdentityIndependentlyVerified: false,
      legalConclusion: false,
      generatedAtExternallyVerified: false },
    boundary: boundary(),
  };
  const verification = Object.freeze({ ...verificationBody,
    verificationHash: digest(verificationBody, PUBLIC_AGENT_WAVE3_SCHEMAS.verification) });
  return Object.freeze({ manifest, records: Object.freeze(records), recordSet, summary,
    verification, candidateDecision: buildPublicAgentWave3CandidateDecision() });
}
