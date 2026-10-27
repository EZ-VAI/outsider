/*
 * Complete fixed-commit replay of STATE-Bench's public training trajectories.
 *
 * The codeload archive is treated only as a transport container. Every regular
 * member is rehashed as a Git blob and matched to the pinned recursive tree.
 * Raw synthetic conversations, user records, tool arguments, and tool results
 * stay private. The source contains no per-trajectory judge outcome.
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

export const STATE_BENCH_TRAINING_SCHEMA =
  "outsider/state-bench-training-trajectories/v1";
export const STATE_BENCH_TRAINING_RECEIPT_SCHEMA =
  "outsider/state-bench-training-trajectories-receipt/v1";
export const STATE_BENCH_REPOSITORY = "microsoft/STATE-Bench";
export const STATE_BENCH_COMMIT = "5644b1838d96bc4483da29642d058ecaa6f80f7f";
export const STATE_BENCH_TREE = "f92bd213beaf24d2f84d9c410c7da5e8039d258e";
export const STATE_BENCH_TRAINING_DISPOSITION = "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/state-bench-training-report/v1";
const RECEIPT_DOMAIN = "outsider/state-bench-training-receipt/v1";
const MANIFEST_DOMAIN = "outsider/state-bench-training-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/state-bench-training-source-root/v1";
const MAX_METADATA_BYTES = 2 * 1024 * 1024;
const ARCHIVE = Object.freeze({ path: "state-bench-5644.tar.gz",
  bytes: 1_251_382,
  sha256: "sha256:746646f24ab0ebd713ae28f0e96c1cc81cdbe9598171a2f7ed37953ce7a0b96a" });
const TREE_PROFILE = Object.freeze({ entries: 1_355, blobs: 1_318,
  directories: 37, blobBytes: 10_099_841,
  trainingFiles: 300, trainingBytes: 3_630_476 });
const METADATA_FILES = Object.freeze([
  "commit-after.json", "commit-before.json", "repository-after.json",
  "repository-before.json", "tree-after.json", "tree-before.json",
]);
const HASH = /^sha256:[a-f0-9]{64}$/u;

function fail(code, detail = null) {
  throw new Error(detail === null ? `STATE_BENCH_TRAINING_${code}`
    : `STATE_BENCH_TRAINING_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
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
    else if (child.isFile() && Number(child.mode & 0o777n) === 0o600) result.push(relative);
    else fail("SOURCE_ENTRY_UNSAFE", relative);
  }
  return result;
}

function repositoryProjection(bytes) {
  const value = parseJson(bytes, "REPOSITORY_JSON_INVALID");
  const result = {
    fullName: value.full_name, private: value.private, archived: value.archived,
    disabled: value.disabled, defaultBranch: value.default_branch,
    licenseSpdx: value.license?.spdx_id ?? null,
  };
  if (!same(result, { fullName: STATE_BENCH_REPOSITORY, private: false,
    archived: false, disabled: false, defaultBranch: "main", licenseSpdx: "MIT" })) {
    fail("REPOSITORY_PROFILE_INVALID");
  }
  return result;
}

function commitProjection(bytes) {
  const value = parseJson(bytes, "COMMIT_JSON_INVALID");
  const result = { sha: value.sha, tree: value.tree?.sha,
    authorDate: value.author?.date, committerDate: value.committer?.date,
    signatureVerified: value.verification?.verified,
    signatureReason: value.verification?.reason };
  if (result.sha !== STATE_BENCH_COMMIT || result.tree !== STATE_BENCH_TREE
    || result.committerDate !== "2026-08-04T23:13:15Z"
    || result.signatureVerified !== true || result.signatureReason !== "valid") {
    fail("COMMIT_PROFILE_INVALID");
  }
  return result;
}

function treeProjection(bytes) {
  const value = parseJson(bytes, "TREE_JSON_INVALID");
  if (value?.sha !== STATE_BENCH_TREE || value?.truncated !== false
    || !Array.isArray(value.tree)) fail("TREE_INVALID");
  const entries = value.tree.map((entry) => ({ path: entry?.path,
    mode: entry?.mode, type: entry?.type, sha: entry?.sha,
    size: entry?.type === "blob" ? entry?.size : null }));
  const blobs = entries.filter((entry) => entry.type === "blob");
  const directories = entries.filter((entry) => entry.type === "tree");
  const training = blobs.filter((entry) =>
    entry.path.startsWith("datasets/train_task_trajectories/"));
  if (entries.length !== TREE_PROFILE.entries || blobs.length !== TREE_PROFILE.blobs
    || directories.length !== TREE_PROFILE.directories
    || blobs.some((entry) => entry.mode !== "100644"
      || !/^[a-f0-9]{40}$/u.test(entry.sha ?? "")
      || !Number.isSafeInteger(entry.size) || entry.size < 0)
    || directories.some((entry) => entry.mode !== "040000"
      || !/^[a-f0-9]{40}$/u.test(entry.sha ?? "") || entry.size !== null)
    || blobs.reduce((sum, entry) => sum + entry.size, 0) !== TREE_PROFILE.blobBytes
    || training.length !== TREE_PROFILE.trainingFiles
    || training.reduce((sum, entry) => sum + entry.size, 0)
      !== TREE_PROFILE.trainingBytes
    || !entries.some((entry) => entry.path === "LICENSE" && entry.type === "blob")
    || !entries.some((entry) => entry.path === "README.md" && entry.type === "blob")
    || !entries.some((entry) => entry.path === "docs/AGENT_LEARNING_TRACK.md"
      && entry.type === "blob")) fail("TREE_PROFILE_INVALID");
  return entries;
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return { schema: "outsider/state-bench-training-source-manifest/v1",
    repository: STATE_BENCH_REPOSITORY, commit: STATE_BENCH_COMMIT,
    tree: STATE_BENCH_TREE, entries: ordered,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered) };
}

function collectSource(sourceDirectory, withManifest) {
  const root = PathResolve(sourceDirectory);
  const expected = [
    ...METADATA_FILES.map((file) => `metadata/${file}`),
    `files/${ARCHIVE.path}`, ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  const metadata = new Map();
  const entries = [];
  for (const file of METADATA_FILES) {
    const bytes = readRegular(root, `metadata/${file}`, MAX_METADATA_BYTES);
    metadata.set(file, bytes);
    entries.push({ path: `metadata/${file}`, bytes: bytes.length, sha256: sha256(bytes) });
  }
  const repositoryBefore = repositoryProjection(metadata.get("repository-before.json"));
  const repositoryAfter = repositoryProjection(metadata.get("repository-after.json"));
  const commitBefore = commitProjection(metadata.get("commit-before.json"));
  const commitAfter = commitProjection(metadata.get("commit-after.json"));
  const treeBefore = treeProjection(metadata.get("tree-before.json"));
  const treeAfter = treeProjection(metadata.get("tree-after.json"));
  if (!same(repositoryBefore, repositoryAfter) || !same(commitBefore, commitAfter)
    || !same(treeBefore, treeAfter)) fail("MATERIAL_STATE_CHANGED");
  const archive = readRegular(root, `files/${ARCHIVE.path}`,
    ARCHIVE.bytes, ARCHIVE.bytes);
  if (sha256(archive) !== ARCHIVE.sha256) fail("ARCHIVE_PIN_MISMATCH");
  entries.push({ path: `files/${ARCHIVE.path}`, bytes: archive.length,
    sha256: ARCHIVE.sha256 });
  return { root, repository: repositoryBefore, commit: commitBefore,
    tree: treeBefore, entries };
}

export function createStateBenchTrainingSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, pathlib, sys, tarfile

root = pathlib.Path(sys.argv[1])
tree_file = root / 'metadata' / 'tree-before.json'
archive_file = root / 'files' / 'state-bench-5644.tar.gz'
commit = '5644b1838d96bc4483da29642d058ecaa6f80f7f'
prefix = 'STATE-Bench-' + commit + '/'

def die(code):
    raise RuntimeError('STATE_BENCH_PYTHON_' + code)

tree_value = json.loads(tree_file.read_bytes())
tree = {entry['path']: entry for entry in tree_value['tree']}
if len(tree) != 1355:
    die('TREE_COUNT_INVALID')

seen = set()
blob_count = directory_count = raw_bytes = 0
training = []
license_text = readme_text = learning_text = None
with tarfile.open(archive_file, mode='r:gz') as archive:
    members = archive.getmembers()
    if len(members) != 1356:
        die('MEMBER_COUNT_INVALID')
    for member in members:
        name = member.name
        if name == prefix[:-1] and member.isdir():
            continue
        if not name.startswith(prefix):
            die('PREFIX_INVALID')
        relative = name[len(prefix):]
        pure = pathlib.PurePosixPath(relative)
        if (not relative or pure.is_absolute() or '..' in pure.parts or '\\' in relative
                or relative in seen):
            die('PATH_INVALID')
        seen.add(relative)
        expected = tree.get(relative)
        if expected is None:
            die('TREE_MEMBER_MISSING')
        if member.isdir():
            if expected['type'] != 'tree':
                die('DIRECTORY_TYPE_INVALID')
            directory_count += 1
            continue
        if not member.isfile() or member.issym() or member.islnk() or expected['type'] != 'blob':
            die('MEMBER_TYPE_INVALID')
        stream = archive.extractfile(member)
        if stream is None:
            die('MEMBER_STREAM_MISSING')
        payload = stream.read()
        if len(payload) != member.size or member.size != expected['size']:
            die('MEMBER_SIZE_INVALID')
        oid = hashlib.sha1(b'blob ' + str(len(payload)).encode() + b'\0' + payload).hexdigest()
        if oid != expected['sha']:
            die('BLOB_OID_INVALID')
        blob_count += 1
        raw_bytes += len(payload)
        if relative.startswith('datasets/train_task_trajectories/'):
            training.append((relative, payload))
        elif relative == 'LICENSE':
            license_text = payload.decode('utf-8')
        elif relative == 'README.md':
            readme_text = payload.decode('utf-8')
        elif relative == 'docs/AGENT_LEARNING_TRACK.md':
            learning_text = payload.decode('utf-8')

if (seen != set(tree) or blob_count != 1318 or directory_count != 37
        or raw_bytes != 10099841 or len(training) != 300
        or sum(len(payload) for _, payload in training) != 3630476):
    die('ARCHIVE_TREE_CLOSURE_INVALID')
if (license_text is None or 'MIT License' not in license_text
        or readme_text is None or 'synthetically generated' not in readme_text
        or learning_text is None
        or 'datasets/train_task_trajectories/' not in learning_text
        or '100 task trajectories per domain' not in learning_text
        or 'use only' not in learning_text):
    die('SUPPORT_PROFILE_INVALID')

domains = collections.Counter()
roles = collections.Counter()
tool_names = collections.Counter()
result_statuses = collections.Counter()
messages = tool_calls = status_rows = 0
confirm_true = confirm_false = task_done = 0
min_messages = None
max_messages = 0
shapes = []
for relative, payload in sorted(training):
    parts = pathlib.PurePosixPath(relative).parts
    if len(parts) != 4 or parts[0:2] != ('datasets', 'train_task_trajectories'):
        die('TRAIN_PATH_INVALID')
    domain = parts[2]
    if domain not in ('customer_support', 'shopping_assistant', 'travel'):
        die('DOMAIN_INVALID')
    domains[domain] += 1
    value = json.loads(payload)
    if not isinstance(value, dict) or set(value) != {'conversation'} or not isinstance(value['conversation'], list):
        die('TRAJECTORY_SCHEMA_INVALID')
    conversation = value['conversation']
    if len(conversation) < 4 or conversation[0].get('role') != 'system':
        die('CONVERSATION_INVALID')
    if '<REDACTED>' not in conversation[0].get('content', ''):
        die('SYSTEM_REDACTION_MARKER_MISSING')
    local_calls = 0
    for message in conversation:
        if (not isinstance(message, dict) or message.get('role') not in ('assistant', 'system', 'user')
                or not isinstance(message.get('content'), str)):
            die('MESSAGE_INVALID')
        roles[message['role']] += 1
        calls = message.get('tool_calls')
        if calls is None:
            continue
        if not isinstance(calls, list):
            die('TOOL_CALL_LIST_INVALID')
        for call in calls:
            if (not isinstance(call, dict) or set(call) != {'arguments', 'name', 'result'}
                    or not isinstance(call['name'], str) or not isinstance(call['arguments'], dict)
                    or not isinstance(call['result'], dict)):
                die('TOOL_CALL_INVALID')
            local_calls += 1
            tool_names[call['name']] += 1
            if call['arguments'].get('confirm') is True:
                confirm_true += 1
            elif call['arguments'].get('confirm') is False:
                confirm_false += 1
            status = call['result'].get('status')
            if status is not None:
                if not isinstance(status, str):
                    die('RESULT_STATUS_INVALID')
                result_statuses[status] += 1
                status_rows += 1
    messages += len(conversation)
    tool_calls += local_calls
    min_messages = len(conversation) if min_messages is None else min(min_messages, len(conversation))
    max_messages = max(max_messages, len(conversation))
    if conversation[-1].get('role') == 'user' and conversation[-1].get('content') == '[TASK_DONE]':
        task_done += 1
    shapes.append({'pathHash': 'sha256:' + hashlib.sha256(relative.encode()).hexdigest(),
      'domain': domain, 'messages': len(conversation), 'toolCalls': local_calls})

expected_domains = {'customer_support': 100, 'shopping_assistant': 100, 'travel': 100}
expected_roles = {'assistant': 860, 'system': 300, 'user': 1159}
if (dict(domains) != expected_domains or messages != 2319 or dict(roles) != expected_roles
        or tool_calls != 2842 or status_rows != 1185 or len(result_statuses) != 25
        or confirm_true != 324 or confirm_false != 364 or task_done != 157
        or min_messages != 4 or max_messages != 31):
    die('TRAJECTORY_AGGREGATE_INVALID')

shape_hash = hashlib.sha256()
for shape in shapes:
    data = json.dumps(shape, sort_keys=True, separators=(',', ':')).encode()
    shape_hash.update(len(data).to_bytes(8, 'big'))
    shape_hash.update(data)

print(json.dumps({
  'archiveMembers': 1356, 'gitTreeEntries': 1355, 'gitBlobFiles': blob_count,
  'gitDirectories': directory_count, 'gitBlobBytes': raw_bytes,
  'allArchiveBlobsMatchPinnedGitOids': True,
  'trainingTrajectoryFiles': 300, 'trainingTrajectoryBytes': 3630476,
  'domainRows': dict(sorted(domains.items())), 'messages': messages,
  'messageRoles': dict(sorted(roles.items())), 'minimumMessagesPerTrajectory': min_messages,
  'maximumMessagesPerTrajectory': max_messages, 'embeddedToolCallsAndResults': tool_calls,
  'toolNameVariants': len(tool_names), 'resultStatusRows': status_rows,
  'resultStatusVariants': len(result_statuses), 'confirmTrueToolCalls': confirm_true,
  'confirmFalseToolCalls': confirm_false, 'finalTaskDoneMarkerRows': task_done,
  'rowsWithoutFinalTaskDoneMarker': 143,
  'perTrajectoryJudgeOutcomeRows': 0, 'rewardRows': 0,
  'trajectoryShapeRoot': 'sha256:' + shape_hash.hexdigest(),
  'rawConversationToolArgumentsAndResultsProjected': False,
}, sort_keys=True, separators=(',', ':')))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_STATE_BENCH_PYTHON ?? ".venv/bin/python";
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

export function buildStateBenchTrainingArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const stored = readRegular(collected.root, "source-manifest.json", MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: STATE_BENCH_TRAINING_SCHEMA,
    disposition: STATE_BENCH_TRAINING_DISPOSITION,
    source: {
      repository: STATE_BENCH_REPOSITORY, commit: STATE_BENCH_COMMIT,
      tree: STATE_BENCH_TREE, commitSignatureVerifiedByGitHub: true,
      repositoryLicenseSpdx: "MIT", fixedCommitArchiveBytes: ARCHIVE.bytes,
      fixedCommitArchiveSha256: ARCHIVE.sha256,
      completeFixedCommitGitTreeReplayed: true,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
      materialRepositoryCommitAndTreeStateStable: true,
    },
    replay: { ...replay,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")) },
    completeness: {
      completePublishedTrainingTrajectorySet: true,
      completeThreeDomainByOneHundredMatrix: true,
      completeFixedCommitRepository: true,
      completeBenchmarkEvaluationRuns: false,
      completeOpportunityOrAttemptCensus: false,
      sourceUniverseExhausted: false,
    },
    denominators: {
      SYNTHETIC_TRAINING_TRAJECTORY: 300,
      MESSAGE_RECORD_WITHIN_TRAJECTORY: 2_319,
      EMBEDDED_TOOL_CALL_RESULT_RECORD: 2_842,
      crossPopulationTotal: null, additionProhibited: true,
    },
    outcome: {
      perTrajectoryJudgeOutcomeRows: 0, rewardRows: 0,
      finalTaskDoneMarkerRows: 157, rowsWithoutFinalTaskDoneMarker: 143,
      taskDoneMarkerIsNotJudgeOutcome: true,
      independentOutcomeRows: 0, realWorldOutcomeRows: 0,
      longitudinalOutcomeRows: 0, recoveryEpisodeRows: 0,
    },
    rights: {
      repositoryLicenseSpdx: "MIT", licenseFileGitBlobReplayed: true,
      agentLearningTrackUseOfTrainingTrajectoriesDocumented: true,
      generalFoundationModelTrainingAuthorizationEstablished: false,
      legalConclusionEstablished: false,
      evaluationAndBenchmarkLearningExtractionUseByThisArtifact: true,
      authorizedTrainingRows: 0, redistributionAuthorizedByThisArtifact: false,
    },
    privacy: {
      publisherDescribesDatasetAsSyntheticallyGenerated: true,
      systemDateRedactionMarkerRows: 300,
      rawSyntheticUserRecordsPresent: true, rawConversationsPresent: true,
      rawToolArgumentsAndResultsPresent: true, rawSourcePrivate: true,
      noPiiGuaranteed: false, rawProjectionRows: 0,
    },
    boundary: {
      syntheticAgentTrajectoryRows: 300, publisherEvaluatedOutcomeRows: 0,
      independentOutcomeRows: 0, realWorldOutcomeRows: 0,
      longitudinalOutcomeRows: 0, recoveryEpisodeRows: 0,
      preActionDelegationRows: 0, physicalEffectRows: 0,
      offlineTrainingRows: 0, productionTrainingRows: 0,
      networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
      pricingRows: 0, authorityRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createStateBenchTrainingReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: STATE_BENCH_TRAINING_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: STATE_BENCH_TRAINING_DISPOSITION,
    trainingTrajectoryFiles: 300, perTrajectoryJudgeOutcomeRows: 0,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    authorizedTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, authorityRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyStateBenchTrainingArtifactDirectory(directory, options = {}) {
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
    const built = buildStateBenchTrainingArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createStateBenchTrainingReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeStateBenchTrainingArtifact(value) {
  return serialize(value);
}
