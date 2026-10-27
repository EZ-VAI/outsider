/*
 * Complete four-pass BrowseComp search-agent evaluation replay.
 *
 * The fixed public table contains four publisher-indexed trajectories per
 * question, GPT-4o judge verdicts, and a compact tool-call log.  Questions,
 * answers, judge explanations, and tool arguments stay in the private source
 * directory and never enter the report.  Publisher judgement is preserved as
 * publisher-native evaluation evidence, not promoted to independent outcome,
 * recovery, training authority, or real-world effect.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const BufferFrom = Buffer.from;
const JSONParse = JSON.parse;
const PathJoin = path.join;
const PathRelative = path.relative;
const PathResolve = path.resolve;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const BROWSECOMP_FOUR_PASS_SCHEMA =
  "outsider/browsecomp-four-pass-evaluation/v1";
export const BROWSECOMP_FOUR_PASS_RECEIPT_SCHEMA =
  "outsider/browsecomp-four-pass-evaluation-receipt/v1";
export const BROWSECOMP_FOUR_PASS_DATASET_ID =
  "rl-rag/browsecomp-qwen35-35b-a3b-nothink";
export const BROWSECOMP_FOUR_PASS_REVISION =
  "857e956b083e86ab7430fc06c96da8fc0f67a0ee";
export const BROWSECOMP_FOUR_PASS_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/browsecomp-four-pass-evaluation-report/v1";
const RECEIPT_DOMAIN = "outsider/browsecomp-four-pass-evaluation-receipt/v1";
const MANIFEST_DOMAIN = "outsider/browsecomp-four-pass-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/browsecomp-four-pass-source-root/v1";
const MAX_SMALL_BYTES = 4 * 1024 * 1024;
const MAX_PARQUET_BYTES = 8 * 1024 * 1024;
const HASH = /^sha256:[a-f0-9]{64}$/u;

const README = Object.freeze({
  path: "README.md",
  bytes: 1_669,
  oid: "271fc307141fb112784e593bdff7b5e976d4dd02",
});
const PARQUET = Object.freeze({
  path: "data/train-00000-of-00001.parquet",
  bytes: 5_597_779,
  oid: "e1473235eeae8361c3078b6994ab5adb6efc1eba",
  sha256: "sha256:8207a14444f67586dea1282c980982726bc8c0336dfe3802a989b1dfa8ff45ed",
});
const TREE_PROFILE = Object.freeze({
  dataTreeOid: "0c6ad9a838029242e1463aab6ad8cdf1e5058a24",
  attributesOid: "bed0738c7eeb449bca98b5d2f33c89a1ee56349a",
  attributesBytes: 2_504,
  entries: 4,
  files: 3,
  directories: 1,
  logicalBytes: 5_601_952,
});
const METADATA_FILES = Object.freeze([
  "dataset-record-after.json",
  "dataset-record-before.json",
  "full-tree-after.json",
  "full-tree-before.json",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `BROWSECOMP_FOUR_PASS_${code}`
    : `BROWSECOMP_FOUR_PASS_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(BufferFrom(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes).digest("hex");
}

function digest(domain, value) {
  return sha256(BufferFrom(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function serialize(value) {
  return BufferFrom(`${canonicalizeStrict(value)}\n`, "utf8");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function parseJson(bytes, code) {
  try {
    return JSONParse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    fail(code);
  }
}

function checkedPath(root, relative) {
  if (typeof relative !== "string" || relative.length === 0
    || relative.includes("\0")) fail("PATH_INVALID");
  const base = PathResolve(root);
  const target = PathResolve(base, relative);
  const relation = PathRelative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_INVALID", relative);
  return target;
}

function requireDirectory(directory, expectedNames) {
  const status = lstatSync(directory, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o700) fail("DIRECTORY_UNSAFE", directory);
  if (!same(sorted(readdirSync(directory)), sorted(expectedNames))) {
    fail("DIRECTORY_LAYOUT_INVALID", directory);
  }
}

function readRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600 || link.size < 1n
    || link.size > BigInt(maximumBytes)
    || exactBytes !== null && link.size !== BigInt(exactBytes)) {
    fail("FILE_UNSAFE", relative);
  }
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(bytes.length) !== after.size) fail("FILE_CHANGED_DURING_READ", relative);
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function recordProjection(bytes) {
  const record = parseJson(bytes, "DATASET_RECORD_JSON_INVALID");
  const siblings = Array.isArray(record.siblings)
    ? sorted(record.siblings.map((entry) => entry?.rfilename)) : [];
  const licenseTags = Array.isArray(record.tags)
    ? record.tags.filter((tag) => typeof tag === "string" && tag.startsWith("license:")) : [];
  const projection = {
    id: record.id,
    revision: record.sha,
    private: record.private,
    gated: record.gated,
    disabled: record.disabled,
    usedStorage: record.usedStorage,
    lastModified: record.lastModified,
    siblings,
    cardLicense: record.cardData?.license ?? null,
    licenseTags,
  };
  if (projection.id !== BROWSECOMP_FOUR_PASS_DATASET_ID
    || projection.revision !== BROWSECOMP_FOUR_PASS_REVISION
    || projection.private !== false || projection.gated !== false
    || projection.disabled !== false || projection.usedStorage !== PARQUET.bytes
    || projection.siblings.length !== 3
    || !same(projection.siblings,
      [".gitattributes", "README.md", PARQUET.path])
    || projection.cardLicense !== null || projection.licenseTags.length !== 0) {
    fail("DATASET_RECORD_INVALID");
  }
  return projection;
}

function treeProjection(bytes) {
  const tree = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(tree) || tree.length !== TREE_PROFILE.entries) fail("TREE_INVALID");
  const projected = tree.map((entry) => ({
    path: entry?.path,
    type: entry?.type,
    oid: entry?.oid,
    bytes: entry?.size,
    lfsSha256: entry?.lfs?.oid ? `sha256:${entry.lfs.oid}` : null,
    lfsBytes: entry?.lfs?.size ?? null,
  })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  const expected = [
    { path: ".gitattributes", type: "file", oid: TREE_PROFILE.attributesOid,
      bytes: TREE_PROFILE.attributesBytes, lfsSha256: null, lfsBytes: null },
    { path: "README.md", type: "file", oid: README.oid,
      bytes: README.bytes, lfsSha256: null, lfsBytes: null },
    { path: "data", type: "directory", oid: TREE_PROFILE.dataTreeOid,
      bytes: 0, lfsSha256: null, lfsBytes: null },
    { path: PARQUET.path, type: "file", oid: PARQUET.oid,
      bytes: PARQUET.bytes, lfsSha256: PARQUET.sha256,
      lfsBytes: PARQUET.bytes },
  ];
  if (!same(projected, expected)
    || projected.filter((entry) => entry.type === "file").length !== TREE_PROFILE.files
    || projected.filter((entry) => entry.type === "directory").length
      !== TREE_PROFILE.directories
    || projected.reduce((sum, entry) => sum + entry.bytes, 0)
      !== TREE_PROFILE.logicalBytes) fail("TREE_PROFILE_INVALID");
  return projected;
}

function verifyReadme(bytes) {
  if (bytes.length !== README.bytes || gitBlobOid(bytes) !== README.oid) {
    fail("README_PIN_MISMATCH");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const markers = [
    "pass@4", "32.3%", "830/5064", "Questions", "1266",
    "Trajectories", "5064 (4 per question)", "Judge", "gpt-4o",
    "**Total: 183,396 tool calls**", "`conversation`",
    "Full conversations", "❌",
  ];
  if (markers.some((marker) => !text.includes(marker))) fail("README_PROFILE_INVALID");
  return {
    publisherPassAt4RoundedPercent: 32.3,
    publisherAverageAt4RoundedPercent: 16.4,
    publisherTrajectoryAccuracyNumerator: 830,
    publisherTrajectoryAccuracyDenominator: 5_064,
    publisherToolCallTotal: 183_396,
    publisherJudge: "gpt-4o",
    publisherClaimsConversationColumn: true,
    publisherAlsoStatesFullConversationsAbsent: true,
  };
}

function sourceEntry(root, relative, maximumBytes, exactBytes, sourceObjectId) {
  const bytes = readRegular(root, relative, maximumBytes, exactBytes);
  return { bytes, descriptor: { path: relative, bytes: bytes.length,
    sha256: sha256(bytes), sourceObjectId } };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/browsecomp-four-pass-source-manifest/v1",
    datasetId: BROWSECOMP_FOUR_PASS_DATASET_ID,
    revision: BROWSECOMP_FOUR_PASS_REVISION,
    entries: ordered,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  requireDirectory(root, withManifest
    ? ["files", "metadata", "source-manifest.json"] : ["files", "metadata"]);
  requireDirectory(PathJoin(root, "files"), ["README.md", "data"]);
  requireDirectory(PathJoin(root, "files", "data"), ["train-00000-of-00001.parquet"]);
  requireDirectory(PathJoin(root, "metadata"), METADATA_FILES);

  const entries = [];
  const metadata = new Map();
  for (const file of METADATA_FILES) {
    const item = sourceEntry(root, `metadata/${file}`, MAX_SMALL_BYTES, null, null);
    entries.push(item.descriptor);
    metadata.set(file, item.bytes);
  }
  const before = recordProjection(metadata.get("dataset-record-before.json"));
  const after = recordProjection(metadata.get("dataset-record-after.json"));
  if (!same(before, after)) fail("DATASET_MATERIAL_STATE_CHANGED");
  const treeBefore = treeProjection(metadata.get("full-tree-before.json"));
  const treeAfter = treeProjection(metadata.get("full-tree-after.json"));
  if (!same(treeBefore, treeAfter)) fail("TREE_MATERIAL_STATE_CHANGED");

  const readme = sourceEntry(root, "files/README.md", MAX_SMALL_BYTES,
    README.bytes, README.oid);
  verifyReadme(readme.bytes);
  entries.push(readme.descriptor);
  const parquet = sourceEntry(root, `files/${PARQUET.path}`, MAX_PARQUET_BYTES,
    PARQUET.bytes, PARQUET.oid);
  if (parquet.descriptor.sha256 !== PARQUET.sha256) fail("PARQUET_PIN_MISMATCH");
  entries.push(parquet.descriptor);
  return { root, before, tree: treeBefore, entries,
    readmeClaims: verifyReadme(readme.bytes) };
}

export function createBrowsecompFourPassSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYARROW_REPLAY = String.raw`
import collections, json, math, os, sys
import pyarrow as pa
import pyarrow.parquet as pq

file = sys.argv[1]
expected_columns = [
  "qid", "traj_idx", "question", "reference_answer", "boxed_answer",
  "correct", "judge_explanation", "question_accuracy", "contaminated",
  "num_tool_calls", "tool_calls", "latency_s", "status",
]
expected_types = [
  "string", "int64", "string", "string", "string", "bool", "string",
  "double", "bool", "int64", "string", "double", "string",
]

def die(code):
    raise RuntimeError("BROWSECOMP_FOUR_PASS_PYARROW_" + code)

table = pq.read_table(file)
if table.column_names != expected_columns or table.num_rows != 5064:
    die("SCHEMA_OR_ROW_COUNT_INVALID")
if [str(field.type) for field in table.schema] != expected_types:
    die("TYPE_PROFILE_INVALID")
if any(table.column(name).null_count != 0 for name in expected_columns):
    die("NULL_VALUE_INVALID")

data = table.to_pydict()
groups = collections.defaultdict(list)
statuses = collections.Counter()
tool_types = collections.Counter()
tool_calls = 0
latencies = []
boxed_nonempty = 0
correct_rows = 0
contaminated_rows = 0
status_correct = collections.Counter()

for index in range(table.num_rows):
    qid = data["qid"][index]
    trajectory = data["traj_idx"][index]
    question = data["question"][index]
    reference = data["reference_answer"][index]
    boxed = data["boxed_answer"][index]
    correct = data["correct"][index]
    explanation = data["judge_explanation"][index]
    accuracy = data["question_accuracy"][index]
    contaminated = data["contaminated"][index]
    declared_calls = data["num_tool_calls"][index]
    status = data["status"][index]
    latency = data["latency_s"][index]
    if (not isinstance(qid, str) or not qid or trajectory not in (0, 1, 2, 3)
        or not isinstance(question, str) or not question
        or not isinstance(reference, str) or not reference
        or not isinstance(boxed, str) or not isinstance(explanation, str)
        or not explanation or not isinstance(correct, bool)
        or not isinstance(contaminated, bool)
        or status not in ("success", "context_overflow", "error")
        or not isinstance(declared_calls, int) or declared_calls < 0
        or declared_calls > 50 or not math.isfinite(latency) or latency < 0
        or accuracy not in (0.0, 0.25, 0.5, 0.75, 1.0)):
        die("ROW_VALUE_INVALID")
    try:
        calls = json.loads(data["tool_calls"][index])
    except Exception as error:
        raise RuntimeError("BROWSECOMP_FOUR_PASS_PYARROW_TOOL_JSON_INVALID") from error
    if not isinstance(calls, list) or len(calls) != declared_calls:
        die("TOOL_COUNT_INVALID")
    for call in calls:
        if (not isinstance(call, dict)
            or set(call.keys()) != {"args", "result_len", "round", "tool"}
            or not isinstance(call["args"], dict)
            or not isinstance(call["result_len"], int) or call["result_len"] < 0
            or not isinstance(call["round"], int) or call["round"] < 1
            or call["round"] > 50 or not isinstance(call["tool"], str)):
            die("TOOL_ENTRY_INVALID")
        tool_types[call["tool"]] += 1
    groups[qid].append((trajectory, question, reference, bool(correct), float(accuracy), status))
    statuses[status] += 1
    status_correct[(status, bool(correct))] += 1
    tool_calls += len(calls)
    latencies.append(float(latency))
    boxed_nonempty += 1 if boxed else 0
    correct_rows += 1 if correct else 0
    contaminated_rows += 1 if contaminated else 0

if len(groups) != 1266:
    die("QUESTION_COUNT_INVALID")
correct_histogram = collections.Counter()
status_patterns = collections.Counter()
for qid, rows in groups.items():
    rows.sort(key=lambda row: row[0])
    if ([row[0] for row in rows] != [0, 1, 2, 3]
        or len({row[1] for row in rows}) != 1
        or len({row[2] for row in rows}) != 1):
        die("FOUR_PASS_SIBLING_INVALID")
    count = sum(1 for row in rows if row[3])
    if any(row[4] != count / 4 for row in rows):
        die("QUESTION_ACCURACY_INVALID")
    correct_histogram[count] += 1
    status_patterns["|".join(row[5] for row in rows)] += 1

expected_histogram = {0: 857, 1: 173, 2: 107, 3: 73, 4: 56}
expected_statuses = {"context_overflow": 11, "error": 6, "success": 5047}
expected_tools = {
  "browser.search": 176326,
  "browser.open": 6457,
  "functions.paper_search": 403,
  "browser.find": 151,
  "functions.pubmed_search": 59,
  "functions.search": 1,
}
if (dict(correct_histogram) != expected_histogram
    or dict(statuses) != expected_statuses
    or dict(tool_types) != expected_tools or tool_calls != 183397
    or correct_rows != 830 or contaminated_rows != 0
    or boxed_nonempty != 1209 or len(latencies) != 5064
    or abs(sum(latencies) - 644935.4397566319) > 1e-9
    or min(latencies) != 0.0 or max(latencies) != 1061.7539465427399):
    die("AGGREGATE_PROFILE_INVALID")

output = {
  "parser": {"engine": "pyarrow", "pyarrowVersion": pa.__version__},
  "rows": 5064,
  "questions": 1266,
  "trajectoryIndicesPerQuestion": [0, 1, 2, 3],
  "questionAndReferenceStableAcrossFourPasses": True,
  "correctRows": 830,
  "incorrectRows": 4234,
  "correctPassesPerQuestionHistogram": {str(key): expected_histogram[key]
    for key in sorted(expected_histogram)},
  "questionsWithAtLeastOneCorrectPass": 409,
  "questionsWithNoCorrectPass": 857,
  "questionsWithFourCorrectPasses": 56,
  "publisherQuestionAccuracyCrosscheck": True,
  "contaminatedRows": 0,
  "statusRows": {key: expected_statuses[key] for key in sorted(expected_statuses)},
  "statusCorrectRows": {
    "successCorrect": status_correct[("success", True)],
    "successIncorrect": status_correct[("success", False)],
    "contextOverflowCorrect": status_correct[("context_overflow", True)],
    "contextOverflowIncorrect": status_correct[("context_overflow", False)],
    "errorCorrect": status_correct[("error", True)],
    "errorIncorrect": status_correct[("error", False)],
  },
  "fourPassStatusPatterns": {key: status_patterns[key] for key in sorted(status_patterns)},
  "toolCalls": tool_calls,
  "toolCallRowsMatchParsedLogLengths": True,
  "toolTypeCounts": {key: expected_tools[key] for key in sorted(expected_tools)},
  "minimumToolCallsPerTrajectory": min(data["num_tool_calls"]),
  "maximumToolCallsPerTrajectory": max(data["num_tool_calls"]),
  "boxedAnswerNonemptyRows": boxed_nonempty,
  "judgeExplanationNonemptyRows": 5064,
  "latencySeconds": {"sum": sum(latencies), "minimum": min(latencies),
    "maximum": max(latencies), "nonfinite": 0},
  "rawQuestionAnswerJudgeAndToolArgumentValuesProjected": False,
}
print(json.dumps(output, sort_keys=True, separators=(",", ":")))
`;

function runReplay(root, pythonExecutable = ".venv/bin/python") {
  if (typeof pythonExecutable !== "string" || pythonExecutable.length === 0) {
    fail("PYTHON_EXECUTABLE_INVALID");
  }
  const child = spawnSync(pythonExecutable,
    ["-c", PYARROW_REPLAY, PathJoin(root, "files", PARQUET.path)], {
      encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin", PYTHONHASHSEED: "0",
        PYTHONNOUSERSITE: "1", PYTHONDONTWRITEBYTECODE: "1" },
    });
  if (child.status !== 0) fail("PYARROW_REPLAY_FAILED",
    String(child.stderr || child.stdout).trim());
  const replay = parseJson(BufferFrom(child.stdout.trim(), "utf8"),
    "PYARROW_OUTPUT_INVALID");
  if (replay.rows !== 5_064 || replay.questions !== 1_266
    || replay.correctRows !== 830 || replay.toolCalls !== 183_397
    || replay.questionsWithAtLeastOneCorrectPass !== 409) {
    fail("PYARROW_OUTPUT_PROFILE_INVALID");
  }
  return replay;
}

export function buildBrowsecompFourPassArtifactFromSourceDirectory(
  sourceDirectory, options = {},
) {
  const collected = collectSource(sourceDirectory, true);
  const manifestBodyValue = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...manifestBodyValue,
    sourceManifestHash: digest(MANIFEST_DOMAIN, manifestBodyValue) });
  const storedManifest = readRegular(collected.root, "source-manifest.json",
    MAX_SMALL_BYTES);
  if (!serialize(sourceManifest).equals(storedManifest)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const toolCountDifference = replay.toolCalls
    - collected.readmeClaims.publisherToolCallTotal;
  const reportBody = {
    schema: BROWSECOMP_FOUR_PASS_SCHEMA,
    disposition: BROWSECOMP_FOUR_PASS_DISPOSITION,
    source: {
      id: BROWSECOMP_FOUR_PASS_DATASET_ID,
      revision: BROWSECOMP_FOUR_PASS_REVISION,
      lastModified: collected.before.lastModified,
      public: true,
      gated: false,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
      selectedObjects: 2,
      selectedBytes: README.bytes + PARQUET.bytes,
      completePublishedEvaluationTableReplayed: true,
      completeRepositoryBytesReplayed: false,
      completeUnderlyingBrowseCompQuestionCorpusReplayed: false,
      recordAndFullTreeCapturedBeforeAndAfter: true,
      materialRecordAndTreeStateStable: true,
    },
    replay: {
      ...replay,
      extractorSha256: sha256(BufferFrom(PYARROW_REPLAY, "utf8")),
      fullConversationColumnPresent: false,
      compactToolLogContainsToolArguments: true,
      compactToolLogContainsResultLengths: true,
      compactToolLogContainsToolResultBodies: false,
    },
    siblingStructure: {
      completeQuestionGroups: 1_266,
      publisherTrajectoryIndicesPerQuestion: [0, 1, 2, 3],
      exactlyFourRowsPerQuestion: true,
      fourFreshIndependentAttemptsExternallyEstablished: false,
      withinQuestionOutcomeVariationGroups: 353,
      allFourIncorrectGroups: 857,
      allFourCorrectGroups: 56,
      retryOrRecoveryOrderingEstablished: false,
    },
    publisherEvaluation: {
      judge: collected.readmeClaims.publisherJudge,
      judgeVerdictRows: 5_064,
      judgedCorrectRows: 830,
      judgedIncorrectRows: 4_234,
      questionsPassingAtLeastOnce: 409,
      publisherPassAt4RoundedPercent:
        collected.readmeClaims.publisherPassAt4RoundedPercent,
      exactPassAt4Ratio: 409 / 1_266,
      publisherAverageAt4RoundedPercent:
        collected.readmeClaims.publisherAverageAt4RoundedPercent,
      exactTrajectoryAccuracyRatio: 830 / 5_064,
      publisherJudgeIndependentOfDatasetProducerEstablished: false,
      publisherJudgeVerdictIsRealWorldOutcome: false,
    },
    documentationDrift: {
      readmeDeclaredToolCalls: collected.readmeClaims.publisherToolCallTotal,
      sourceReplayedToolCalls: replay.toolCalls,
      toolCallDifference: toolCountDifference,
      unlistedToolType: "functions.search",
      unlistedToolTypeRows: replay.toolTypeCounts["functions.search"],
      readmeListsConversationColumn: true,
      parquetConversationColumnPresent: false,
      readmeAlsoStatesFullConversationsAbsent: true,
      discrepancyPreservedNotSilentlyCorrected: true,
    },
    denominators: {
      SEARCH_AGENT_TRAJECTORY: 5_064,
      FOUR_PASS_QUESTION_GROUP: 1_266,
      TOOL_CALL_LOG_ENTRY: 183_397,
      crossPopulationTotal: null,
      additionProhibited: true,
    },
    rights: {
      datasetCardLicense: null,
      licenseTagPresent: false,
      upstreamQuestionCorpusTermsReplayed: false,
      judgeServiceTermsReplayed: false,
      rightsGate: "FAIL_CLOSED",
      legalConclusionEstablished: false,
      trainingUseAuthorized: false,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      rawQuestionsPresent: true,
      rawReferenceAnswersPresent: true,
      rawBoxedAnswersPresent: true,
      rawJudgeExplanationsPresent: true,
      rawToolArgumentsPresent: true,
      rawToolResultBodiesPresent: false,
      rawSourcePrivate: true,
      noPiiGuaranteed: false,
      rawProjectionRows: 0,
    },
    boundary: {
      publisherJudgedEvaluationOutcomeRows: 5_064,
      independentOutcomeRows: 0,
      realWorldOutcomeRows: 0,
      longitudinalOutcomeRows: 0,
      recoveryEpisodeRows: 0,
      preActionDelegationRows: 0,
      physicalEffectRows: 0,
      offlineTrainingRows: 0,
      productionTrainingRows: 0,
      networkAdmissionRows: 0,
      actorCreditRows: 0,
      ceuRows: 0,
      pricingRows: 0,
      authorityRows: 0,
      autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

function receiptBody(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  return {
    schema: BROWSECOMP_FOUR_PASS_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: BROWSECOMP_FOUR_PASS_DISPOSITION,
    searchAgentTrajectoryRows: 5_064,
    fourPassQuestionGroups: 1_266,
    publisherJudgedEvaluationOutcomeRows: 5_064,
    independentOutcomeRows: 0,
    recoveryEpisodeRows: 0,
    offlineTrainingRows: 0,
    productionTrainingRows: 0,
    networkAdmissionRows: 0,
    authorityRows: 0,
    autonomousActionAuthorized: false,
  };
}

export function createBrowsecompFourPassReceipt(report, reportBytes, manifestBytes) {
  const body = receiptBody(report, reportBytes, manifestBytes);
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyBrowsecompFourPassArtifactDirectory(directory, options = {}) {
  try {
    const root = PathResolve(directory);
    requireDirectory(root, ["report.json", "run-receipt.json", "source"]);
    const reportBytes = readRegular(root, "report.json", MAX_SMALL_BYTES);
    const receiptBytes = readRegular(root, "run-receipt.json", MAX_SMALL_BYTES);
    const built = buildBrowsecompFourPassArtifactFromSourceDirectory(
      PathJoin(root, "source"), options,
    );
    const expectedReportBytes = serialize(built.report);
    if (!expectedReportBytes.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json", MAX_SMALL_BYTES);
    const receipt = createBrowsecompFourPassReceipt(built.report,
      expectedReportBytes, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeBrowsecompFourPassArtifact(value) {
  return serialize(value);
}

