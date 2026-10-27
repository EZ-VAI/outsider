/*
 * Full fixed-revision replay of the Trace Commons agent-traces repository.
 *
 * Raw donated sessions and the normalized Parquet are retained as private
 * source. The report contains only aggregate structure. Best-effort scrubbing,
 * contributor review, and a takedown process do not establish anonymity or
 * per-trace embedded-content rights.
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
const PathRelative = path.relative;
const PathResolve = path.resolve;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const TRACE_COMMONS_AGENT_SESSIONS_SCHEMA =
  "outsider/trace-commons-agent-sessions/v1";
export const TRACE_COMMONS_AGENT_SESSIONS_RECEIPT_SCHEMA =
  "outsider/trace-commons-agent-sessions-receipt/v1";
export const TRACE_COMMONS_DATASET_ID = "trace-commons/agent-traces";
export const TRACE_COMMONS_REVISION =
  "112ebd4d03ce852b00e935d523107c3d0c9a65bf";
export const TRACE_COMMONS_AGENT_SESSIONS_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/trace-commons-agent-sessions-report/v1";
const RECEIPT_DOMAIN = "outsider/trace-commons-agent-sessions-receipt/v1";
const MANIFEST_DOMAIN =
  "outsider/trace-commons-agent-sessions-source-manifest/v1";
const SOURCE_ROOT_DOMAIN =
  "outsider/trace-commons-agent-sessions-source-root/v1";
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 80 * 1024 * 1024;
const RECORD_SHA =
  "sha256:e51684d2513e33c0e58c24116dc08009b20ed7baebd76eecc46af84e2ede2237";
const TREE_SHA =
  "sha256:1550e7f7734624e6ab0be4d7a765c201103c5ca782dcd4c3b14f62d4cf766d8b";
const PARQUET_PATH = "data/train-00000-of-00001.parquet";
const PARQUET_BYTES = 70_202_603;
const PARQUET_SHA =
  "sha256:7c2c6ee4342ff014c47b906425501b4dc4f368df8af5280c158e827944da11e7";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const GIT_OID = /^[a-f0-9]{40}$/u;

function fail(code, detail = null) {
  throw new Error(detail === null ? `TRACE_COMMONS_AGENT_SESSIONS_${code}`
    : `TRACE_COMMONS_AGENT_SESSIONS_${code}:${detail}`);
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
  try { return JSONParse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { fail(code); }
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

function readRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600
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
  } finally { closeSync(descriptor); }
}

function walk(root, prefix = "") {
  const directory = prefix === "" ? root : checkedPath(root, prefix);
  const status = lstatSync(directory, { bigint: true });
  if (!status.isDirectory() || status.isSymbolicLink()
    || Number(status.mode & 0o777n) !== 0o700) fail("DIRECTORY_UNSAFE", prefix);
  const result = [];
  for (const name of sorted(readdirSync(directory))) {
    const relative = prefix === "" ? name : `${prefix}/${name}`;
    const child = lstatSync(checkedPath(root, relative), { bigint: true });
    if (child.isSymbolicLink()) fail("SYMLINK_FORBIDDEN", relative);
    if (child.isDirectory()) result.push(...walk(root, relative));
    else if (child.isFile() && Number(child.mode & 0o777n) === 0o600) {
      result.push(relative);
    } else fail("SOURCE_ENTRY_UNSAFE", relative);
  }
  return result;
}

function recordProjection(bytes) {
  if (sha256(bytes) !== RECORD_SHA) fail("RECORD_PIN_MISMATCH");
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, license: value.cardData?.license,
  };
  if (!same(projection, {
    id: TRACE_COMMONS_DATASET_ID, author: "trace-commons",
    sha: TRACE_COMMONS_REVISION, lastModified: "2026-06-18T06:23:00.000Z",
    private: false, gated: false, disabled: false,
    usedStorage: 206_956_583, license: "cc-by-4.0",
  })) fail("RECORD_PROFILE_INVALID");
  return projection;
}

function treeProjection(bytes) {
  if (sha256(bytes) !== TREE_SHA) fail("TREE_PIN_MISMATCH");
  const value = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(value)) fail("TREE_INVALID");
  const entries = value.map((entry) => {
    if (!entry || typeof entry.path !== "string"
      || !["file", "directory"].includes(entry.type)
      || !Number.isSafeInteger(entry.size) || entry.size < 0
      || !GIT_OID.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
    return { path: entry.path, type: entry.type, size: entry.size, oid: entry.oid,
      lfsOid: entry.lfs?.oid ?? null, lfsSize: entry.lfs?.size ?? null,
      xetHash: entry.xetHash ?? null };
  }).sort((left, right) => left.path < right.path ? -1 : 1);
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const sessions = files.filter((entry) => entry.path.startsWith("sessions/"));
  const payloadSessions = sessions.filter((entry) => entry.size > 0);
  const harness = {};
  for (const entry of sessions) {
    const name = entry.path.split("/")[1];
    harness[name] ??= { files: 0, payloadFiles: 0, bytes: 0 };
    harness[name].files += 1;
    harness[name].bytes += entry.size;
    if (entry.size > 0) harness[name].payloadFiles += 1;
  }
  const parquet = files.find((entry) => entry.path === PARQUET_PATH);
  if (entries.length !== 44 || files.length !== 37 || directories.length !== 7
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 127_441_063
    || sessions.length !== 34 || payloadSessions.length !== 30
    || sessions.reduce((sum, entry) => sum + entry.size, 0) !== 57_228_063
    || !same(harness, {
      claude_code: { files: 29, payloadFiles: 28, bytes: 57_104_737 },
      codex: { files: 1, payloadFiles: 0, bytes: 0 },
      cursor: { files: 1, payloadFiles: 1, bytes: 25_429 },
      opencode: { files: 2, payloadFiles: 1, bytes: 97_897 },
      pi: { files: 1, payloadFiles: 0, bytes: 0 },
    }) || parquet?.size !== PARQUET_BYTES
    || parquet?.lfsOid !== PARQUET_SHA.slice(7)
    || parquet?.lfsSize !== PARQUET_BYTES) fail("TREE_PROFILE_INVALID");
  return { entries, files, directories, sessions, payloadSessions, harness };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/trace-commons-agent-sessions-source-manifest/v1",
    datasetId: TRACE_COMMONS_DATASET_ID, revision: TRACE_COMMONS_REVISION,
    entries: ordered, sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const recordBefore = readRegular(root, "metadata/dataset-record-before.json",
    MAX_METADATA_BYTES);
  const recordAfter = readRegular(root, "metadata/dataset-record-after.json",
    MAX_METADATA_BYTES);
  const treeBefore = readRegular(root, "metadata/full-tree-before.json",
    MAX_METADATA_BYTES);
  const treeAfter = readRegular(root, "metadata/full-tree-after.json",
    MAX_METADATA_BYTES);
  const record = recordProjection(recordBefore);
  const tree = treeProjection(treeBefore);
  if (!recordBefore.equals(recordAfter) || !treeBefore.equals(treeAfter)) {
    fail("MATERIAL_STATE_CHANGED");
  }
  const expected = [
    "metadata/dataset-record-after.json", "metadata/dataset-record-before.json",
    "metadata/full-tree-after.json", "metadata/full-tree-before.json",
    ...tree.files.map((entry) => `files/${entry.path}`),
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  const entries = [
    { path: "metadata/dataset-record-before.json", bytes: recordBefore.length,
      sha256: sha256(recordBefore) },
    { path: "metadata/dataset-record-after.json", bytes: recordAfter.length,
      sha256: sha256(recordAfter) },
    { path: "metadata/full-tree-before.json", bytes: treeBefore.length,
      sha256: sha256(treeBefore) },
    { path: "metadata/full-tree-after.json", bytes: treeAfter.length,
      sha256: sha256(treeAfter) },
  ];
  for (const item of tree.files) {
    const bytes = readRegular(root, `files/${item.path}`,
      Math.max(MAX_SOURCE_BYTES, item.size), item.size);
    const actualSha = sha256(bytes);
    if (item.lfsOid !== null) {
      if (actualSha !== `sha256:${item.lfsOid}`) fail("LFS_PIN_MISMATCH", item.path);
    } else if (gitBlobOid(bytes) !== item.oid) fail("GIT_BLOB_PIN_MISMATCH", item.path);
    entries.push({ path: `files/${item.path}`, bytes: bytes.length,
      sha256: actualSha, gitOid: item.oid,
      lfsSha256: item.lfsOid === null ? null : `sha256:${item.lfsOid}` });
  }
  return { root, record, tree, entries };
}

export function createTraceCommonsAgentSessionsSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, pathlib, re, sys
import pyarrow.parquet as pq

root = pathlib.Path(sys.argv[1]) / 'files'
parquet_path = root / 'data' / 'train-00000-of-00001.parquet'

def die(code):
    raise RuntimeError('TRACE_COMMONS_AGENT_SESSIONS_PYTHON_' + code)

parquet = pq.ParquetFile(parquet_path)
expected_columns = [
  'harness', 'session_id', 'prompt', 'messages', 'tools', 'metadata',
  'sent_at', 'num_user_messages', 'num_tool_calls', 'trace', 'file_path'
]
if (parquet.metadata.num_rows != 30 or parquet.metadata.num_row_groups != 1
        or parquet.metadata.num_columns != 11
        or parquet.schema_arrow.names != expected_columns):
    die('PARQUET_PROFILE_INVALID')
table = parquet.read().to_pydict()

raw_files = sorted(path for path in (root / 'sessions').rglob('*')
                   if path.is_file() and path.stat().st_size > 0)
if len(raw_files) != 30:
    die('RAW_SESSION_COUNT_INVALID')
expected_names = {
  path.relative_to(root).as_posix().replace('/', '_')
  for path in raw_files
}
observed_names = set()
harness_path_counts = collections.Counter()
normalized_harness_counts = collections.Counter()
message_records = tool_definitions = trace_records = 0
user_messages = tool_calls = 0
json_extension_documents = 0
shape_rows = []

def parse_extension(value, code):
    global json_extension_documents
    if not isinstance(value, str):
        die(code)
    try:
        parsed = json.loads(value)
    except Exception:
        die(code)
    json_extension_documents += 1
    return parsed

for index in range(30):
    file_path = table['file_path'][index]
    if not isinstance(file_path, str):
        die('FILE_PATH_INVALID')
    name = pathlib.PurePosixPath(file_path).name
    if name in observed_names or name not in expected_names:
        die('PARQUET_RAW_CROSSWALK_INVALID')
    observed_names.add(name)
    if name.startswith('sessions_claude_code_'):
        path_harness = 'claude_code'
    elif name.startswith('sessions_cursor_'):
        path_harness = 'cursor'
    elif name.startswith('sessions_opencode_'):
        path_harness = 'opencode'
    else:
        die('PATH_HARNESS_INVALID')
    harness_path_counts[path_harness] += 1
    harness = table['harness'][index]
    normalized_harness_counts['null' if harness is None else harness] += 1
    messages = table['messages'][index]
    tools = table['tools'][index]
    trace = table['trace'][index]
    metadata = table['metadata'][index]
    if not all(isinstance(value, list) for value in (messages, tools, trace)):
        die('NORMALIZED_LIST_INVALID')
    for value in messages:
        parse_extension(value, 'MESSAGE_JSON_INVALID')
    for value in tools:
        parse_extension(value, 'TOOL_JSON_INVALID')
    for value in trace:
        parse_extension(value, 'TRACE_JSON_INVALID')
    parse_extension(metadata, 'METADATA_JSON_INVALID')
    users = table['num_user_messages'][index]
    calls = table['num_tool_calls'][index]
    if not isinstance(users, int) or users < 0 or not isinstance(calls, int) or calls < 0:
        die('COUNT_INVALID')
    message_records += len(messages)
    tool_definitions += len(tools)
    trace_records += len(trace)
    user_messages += users
    tool_calls += calls
    shape_rows.append({
      'pathHash': hashlib.sha256(name.encode()).hexdigest(),
      'pathHarness': path_harness, 'normalizedHarness': harness,
      'sessionIdPresent': table['session_id'][index] is not None,
      'promptPresent': table['prompt'][index] is not None,
      'sentAtPresent': table['sent_at'][index] is not None,
      'messages': len(messages), 'tools': len(tools), 'trace': len(trace),
      'userMessages': users, 'toolCalls': calls,
    })

if observed_names != expected_names:
    die('PARQUET_RAW_CROSSWALK_INCOMPLETE')

raw_jsonl_records = 0
raw_json_documents = 0
raw_bytes = 0
record_root_types = collections.Counter()
secret_candidates = 0
email_candidates = 0
secret_patterns = [
  re.compile(rb'AKIA[0-9A-Z]{16}'),
  re.compile(rb'(?:ghp|github_pat)_[A-Za-z0-9_]{20,}'),
  re.compile(rb'sk-[A-Za-z0-9]{20,}'),
  re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
]
email_pattern = re.compile(rb'(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9.-])')

for file in raw_files:
    data = file.read_bytes()
    raw_bytes += len(data)
    secret_candidates += sum(len(pattern.findall(data)) for pattern in secret_patterns)
    email_candidates += len(email_pattern.findall(data))
    if file.suffix == '.jsonl':
        lines = [line for line in data.splitlines() if line.strip()]
        if not lines:
            die('EMPTY_JSONL')
        for line in lines:
            try:
                value = json.loads(line)
            except Exception:
                die('RAW_JSONL_INVALID')
            record_root_types[type(value).__name__] += 1
        raw_jsonl_records += len(lines)
    elif file.suffix == '.json':
        try:
            value = json.loads(data)
        except Exception:
            die('RAW_JSON_INVALID')
        record_root_types[type(value).__name__] += 1
        raw_json_documents += 1
    else:
        die('RAW_EXTENSION_INVALID')

shape_hash = hashlib.sha256()
for row in shape_rows:
    encoded = json.dumps(row, sort_keys=True, separators=(',', ':')).encode()
    shape_hash.update(len(encoded).to_bytes(8, 'big'))
    shape_hash.update(encoded)

print(json.dumps({
  'normalizedParquetRows': 30, 'parquetRowGroups': 1,
  'parquetColumns': 11,
  'rawSourceSessionFiles': 30, 'rawSourceSessionBytes': raw_bytes,
  'rawJsonlRecords': raw_jsonl_records,
  'rawJsonDocuments': raw_json_documents,
  'rawRecordRootTypes': dict(sorted(record_root_types.items())),
  'pathHarnessRows': dict(sorted(harness_path_counts.items())),
  'normalizedHarnessValues': dict(sorted(normalized_harness_counts.items())),
  'normalizedMessageRecords': message_records,
  'normalizedToolDefinitionRecords': tool_definitions,
  'normalizedTraceRecords': trace_records,
  'declaredUserMessageCount': user_messages,
  'declaredToolCallCount': tool_calls,
  'jsonExtensionDocumentsParsed': json_extension_documents,
  'allThirtyParquetRowsCrosswalkToDistinctRawSourceFiles': True,
  'normalizedShapeRoot': 'sha256:' + shape_hash.hexdigest(),
  'highConfidenceSecretPatternCandidates': secret_candidates,
  'emailPatternCandidates': email_candidates,
  'privacyPatternScanIsNotAnonymityProof': True,
  'rawPromptMessageToolTraceMetadataAndFileContentsProjected': False,
}, sort_keys=True, separators=(',', ':')))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_TRACE_COMMONS_PYTHON ?? ".venv/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 180_000, maxBuffer: 4 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim() ?? result.status);
  }
  let value;
  try { value = JSONParse(result.stdout); } catch { fail("REPLAY_OUTPUT_INVALID"); }
  return deepFreeze(value);
}

export function buildTraceCommonsAgentSessionsArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const stored = readRegular(collected.root, "source-manifest.json", MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: TRACE_COMMONS_AGENT_SESSIONS_SCHEMA,
    disposition: TRACE_COMMONS_AGENT_SESSIONS_DISPOSITION,
    source: {
      datasetId: TRACE_COMMONS_DATASET_ID, revision: TRACE_COMMONS_REVISION,
      lastModified: collected.record.lastModified, public: true, gated: false,
      fixedRevisionTreeEntries: 44, fixedRevisionFiles: 37,
      fixedRevisionFileBytes: 127_441_063,
      rawSessionTreeFilesIncludingGitkeep: 34,
      rawSourceSessionFiles: 30, rawSourceSessionBytes: 57_228_063,
      normalizedParquetFiles: 1, normalizedParquetBytes: PARQUET_BYTES,
      readmeAndGitattributesBytes: 10_397,
      completeFixedRevisionAcquired: true,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
      materialRecordAndTreeStateStable: true,
    },
    replay: { ...replay,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")) },
    selection: {
      selectedRows: 30, selectedRawSessions: 30,
      voluntaryDonationCorpus: true, optInSelectionBiasPresent: true,
      completeFixedRevision: true, completeAgentUsagePopulation: false,
      representativeOfAgentUsageEstablished: false,
      sourceUniverseExhausted: false,
    },
    denominators: {
      DONATED_AGENT_SESSION: 30,
      NORMALIZED_MESSAGE_RECORD_WITHIN_DONATED_SESSIONS:
        replay.normalizedMessageRecords,
      NORMALIZED_TRACE_RECORD_WITHIN_DONATED_SESSIONS:
        replay.normalizedTraceRecords,
      DECLARED_TOOL_CALL_WITHIN_DONATED_SESSIONS: replay.declaredToolCallCount,
      crossPopulationTotal: null, additionProhibited: true,
    },
    outcome: {
      normalizedTerminalOutcomeColumnPresent: false,
      independentlyEvaluatedOutcomeRows: 0, benchmarkOutcomeRows: 0,
      completeAttemptCensusRows: 0, longitudinalRecoveryRows: 0,
      causalFailureRecoveryRows: 0, realWorldEffectRows: 0,
    },
    rights: {
      compilationLicenseClaim: "CC-BY-4.0",
      compilationTrainingUseNarrativePresent: true,
      contributorRightToPublishCertificationNarrativePresent: true,
      embeddedCodeAndContentLicensesIndependentlyVerified: false,
      agentProviderTermsIndependentlyAdjudicated: false,
      perTraceUseSpecificTrainingAuthorizationEstablished: false,
      legalConclusionEstablished: false, authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      publisherDeterministicScrubberNarrativePresent: true,
      publisherTruffleHogBackstopNarrativePresent: true,
      publisherHumanReviewNarrativePresent: true,
      contributorConsentNarrativePresent: true,
      takedownAndErasureProcessNarrativePresent: true,
      anonymizationCertified: false, noPiiOrSecretGuaranteed: false,
      highConfidenceSecretPatternCandidates: replay.highConfidenceSecretPatternCandidates,
      emailPatternCandidates: replay.emailPatternCandidates,
      privacyPatternScanIsNotAnonymityProof: true,
      rawSourcePrivate: true, rawProjectionRows: 0,
    },
    boundary: {
      donatedSoftwareAgentSessionRows: 30,
      independentlyEvaluatedOutcomeRows: 0, realWorldOutcomeRows: 0,
      longitudinalRecoveryRows: 0, physicalEffectRows: 0,
      preActionDelegationRows: 0, authorizedTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      actorCreditRows: 0, ceuRows: 0, pricingRows: 0,
      authorityRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createTraceCommonsAgentSessionsReceipt(
  report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: TRACE_COMMONS_AGENT_SESSIONS_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: TRACE_COMMONS_AGENT_SESSIONS_DISPOSITION,
    donatedAgentSessionRows: 30, independentlyEvaluatedOutcomeRows: 0,
    longitudinalRecoveryRows: 0, authorizedTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0, authorityRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyTraceCommonsAgentSessionsArtifactDirectory(
  directory, options = {}) {
  try {
    const root = PathResolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportBytes = readRegular(root, "report.json", MAX_METADATA_BYTES);
    const receiptBytes = readRegular(root, "run-receipt.json", MAX_METADATA_BYTES);
    const built = buildTraceCommonsAgentSessionsArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createTraceCommonsAgentSessionsReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeTraceCommonsAgentSessionsArtifact(value) {
  return serialize(value);
}
