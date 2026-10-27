/*
 * CooperBench coordination-study trajectory census.
 *
 * Six complete archives from one fixed public dataset revision are replayed.
 * Raw prompts, streams, patches and test output remain private.  Held-out test
 * results are publisher-native evaluator outcomes, not independent longitudinal
 * truth and not authorization to train on upstream repository material.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readSync,
  readdirSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const BufferFrom = Buffer.from;
const JSONParse = JSON.parse;
const PathResolve = path.resolve;
const PathRelative = path.relative;
const PathJoin = path.join;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const COOPERBENCH_COORDINATION_SCHEMA =
  "outsider/cooperbench-coordination-census/v1";
export const COOPERBENCH_COORDINATION_RECEIPT_SCHEMA =
  "outsider/cooperbench-coordination-census-receipt/v1";
export const COOPERBENCH_DATASET_ID = "CooperBench/team-trajectories";
export const COOPERBENCH_DATASET_REVISION =
  "dd371629174a226ecd251672af315699b77de05d";
export const COOPERBENCH_COORDINATION_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY";

const REPORT_DOMAIN = "outsider/cooperbench-coordination-census-report/v1";
const RECEIPT_DOMAIN = "outsider/cooperbench-coordination-census-receipt/v1";
const MANIFEST_DOMAIN = "outsider/cooperbench-coordination-source-manifest/v1";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const MAX_SMALL_BYTES = 8 * 1024 * 1024;
const EXPECTED_USED_STORAGE = 124_945_460;

const FILES = Object.freeze({
  "README.md": Object.freeze({ bytes: 1_832,
    oid: "d8670509d692607ff2aaa26f0e69c894495cf2ff" }),
  "cmp-flash-msa-coopgit.tar.gz": Object.freeze({ bytes: 11_565_738,
    oid: "1f7f3d9b1f35b90f3069edf78e99fa5f2cbf5d23",
    sha256: "65ceccd7e623c2a5fb4e4d9455964b8811740fceda652641eb94acab3a51082c",
    scope: "flash", setting: "coopgit", expectedTasks: 48 }),
  "cmp-flash-msa-solo.tar.gz": Object.freeze({ bytes: 7_005_337,
    oid: "1e00af8a38712a85c0b27dda7f854aab09a980d0",
    sha256: "a67b991e83451e74fd44fe90227f67bc8d3140dd8dc193a86a6dcab7b6ba6efb",
    scope: "flash", setting: "solo", expectedTasks: 50 }),
  "cmp-full-coopgit.tar.gz": Object.freeze({ bytes: 30_514_821,
    oid: "e388867dbce53c2f2ab8d5b1ceefd9702432d12c",
    sha256: "f687e96cafecddad2b5bc5eb303ea254943a37cd3d128f1998d1f1438904727a",
    scope: "full", setting: "coopgit", expectedTasks: 645 }),
  "cmp-full-solo.tar.gz": Object.freeze({ bytes: 14_531_429,
    oid: "5e5e9365aece87e376f352e70fb2dd4bd6264069",
    sha256: "b703e921d161aa30ead2eccaad23ffa7c45b4fe6b4f59e6a7e27ce537b331cc0",
    scope: "full", setting: "solo", expectedTasks: 652 }),
  "cmp-full-team-noproto.tar.gz": Object.freeze({ bytes: 30_695_468,
    oid: "b65609cc23e0090d7ea1486862840c5a90ba88d8",
    sha256: "8206656ef5a9989987ddfbcb9ac86e80c787382ff0b74b56004c311801ae36cd",
    scope: "full", setting: "team-noproto", expectedTasks: 651 }),
  "cmp-full-team.tar.gz": Object.freeze({ bytes: 30_632_667,
    oid: "def43023ab7337a36cabf829fe245fae0ebeb34a",
    sha256: "fbed57e18cf3b14f3f10e3f3abeecd15c741b949ea9bdefe2464951ee325267f",
    scope: "full", setting: "team", expectedTasks: 636 }),
});

const ARCHIVES = Object.freeze(Object.entries(FILES)
  .filter(([, value]) => typeof value.sha256 === "string")
  .map(([name, value]) => Object.freeze({ name, ...value })));

const PYTHON_SCANNER = String.raw`
import hashlib, json, os, pathlib, sys, tarfile

root = pathlib.Path(sys.argv[1])
specs = json.loads(sys.argv[2])
out = []

def root_hash(values):
    h = hashlib.sha256()
    for value in sorted(values):
        b = value.encode('utf-8')
        h.update(len(b).to_bytes(8, 'big'))
        h.update(b)
    return 'sha256:' + h.hexdigest()

for spec in specs:
    source = root / 'files' / spec['name']
    names = set()
    leaves = []
    task_keys = []
    regular = directories = raw_bytes = 0
    eval_files = result_files = trajectory_files = full_trajectory_files = 0
    stream_logs = patch_files = conversation_files = 0
    message_rows = tool_call_rows = 0
    zero_json_files = invalid_json_files = 0
    both_passed = both_failed = eval_error = 0
    feature_passes = feature_failures = 0
    result_agent_rows = 0
    status_histogram = {}
    roots = set()
    with tarfile.open(source, mode='r:gz') as archive:
        for member in archive:
            name = member.name
            pure = pathlib.PurePosixPath(name)
            if (not name or pure.is_absolute() or '..' in pure.parts or '\\' in name
                    or name in names):
                raise RuntimeError('unsafe or duplicate tar member')
            names.add(name)
            roots.add(pure.parts[0])
            if member.isdir():
                directories += 1
                continue
            if not member.isfile() or member.issym() or member.islnk():
                raise RuntimeError('unsupported tar member type')
            regular += 1
            raw_bytes += member.size
            extracted = archive.extractfile(member)
            if extracted is None:
                raise RuntimeError('missing regular member stream')
            digest = hashlib.sha256()
            retained = bytearray() if (name.endswith('.json') and member.size <= 64 * 1024 * 1024) else None
            consumed = 0
            while True:
                chunk = extracted.read(1024 * 1024)
                if not chunk:
                    break
                consumed += len(chunk)
                digest.update(chunk)
                if retained is not None:
                    retained.extend(chunk)
            if consumed != member.size:
                raise RuntimeError('tar member size mismatch')
            leaves.append(name + '\0' + str(member.size) + '\0' + digest.hexdigest())
            base = pure.name
            parent_parts = pure.parts[2:-1]
            if base == 'eval.json':
                eval_files += 1
                task_keys.append('/'.join(parent_parts))
            elif base == 'result.json':
                result_files += 1
            elif base.endswith('_full_traj.json'):
                full_trajectory_files += 1
            elif base.endswith('_traj.json') or base == 'trajectory.json':
                trajectory_files += 1
            elif base.endswith('_stream.log'):
                stream_logs += 1
            elif base.endswith('.patch'):
                patch_files += 1
            elif base == 'conversation.json' or base == 'task_log.json':
                conversation_files += 1
            if retained is None:
                continue
            if len(retained) == 0:
                zero_json_files += 1
                continue
            try:
                value = json.loads(retained)
            except Exception:
                invalid_json_files += 1
                continue
            if base == 'eval.json':
                outcome = value.get('both_passed')
                if outcome is True: both_passed += 1
                elif outcome is False: both_failed += 1
                else: eval_error += 1
                for key in ('feature1', 'feature2'):
                    passed = (value.get(key) or {}).get('passed')
                    if passed is True: feature_passes += 1
                    elif passed is False: feature_failures += 1
            elif base == 'result.json':
                candidates = []
                if isinstance(value.get('agent'), dict): candidates.append(value['agent'])
                for key, child in value.items():
                    if key.startswith('agent') and isinstance(child, dict): candidates.append(child)
                result_agent_rows += len(candidates)
                for candidate in candidates:
                    status = candidate.get('status')
                    if isinstance(status, str):
                        status_histogram[status] = status_histogram.get(status, 0) + 1
            elif base.endswith('_traj.json') or base == 'trajectory.json':
                if isinstance(value, dict) and isinstance(value.get('messages'), list):
                    message_rows += len(value['messages'])
                    for message in value['messages']:
                        if isinstance(message, dict) and isinstance(message.get('tool_calls'), list):
                            tool_call_rows += len(message['tool_calls'])
    if len(roots) != 1:
        raise RuntimeError('archive must have exactly one root')
    if eval_files != spec['expectedTasks']:
        raise RuntimeError('unexpected task/eval count')
    if len(task_keys) != len(set(task_keys)):
        raise RuntimeError('duplicate task identity')
    out.append({
        'archive': spec['name'], 'scope': spec['scope'], 'setting': spec['setting'],
        'archiveRoot': next(iter(roots)), 'regularFiles': regular,
        'directories': directories, 'uncompressedBytes': raw_bytes,
        'contentLeafRoot': root_hash(leaves), 'taskCount': eval_files,
        'taskIdentityRoot': root_hash(task_keys), 'taskIdentities': sorted(task_keys),
        'resultFiles': result_files,
        'trajectoryFiles': trajectory_files, 'fullTrajectoryFiles': full_trajectory_files,
        'streamLogs': stream_logs, 'patchFiles': patch_files,
        'conversationFiles': conversation_files, 'messageRows': message_rows,
        'toolCallRows': tool_call_rows, 'zeroJsonFiles': zero_json_files,
        'invalidJsonFiles': invalid_json_files,
        'bothFeaturesPassed': both_passed,
        'bothFeaturesNotPassed': both_failed, 'evaluationErrorsOrUnknown': eval_error,
        'featurePasses': feature_passes, 'featureFailures': feature_failures,
        'resultAgentRows': result_agent_rows,
        'statusHistogram': dict(sorted(status_histogram.items())),
    })

print(json.dumps(out, sort_keys=True, separators=(',', ':')))
`;

function fail(code, detail = null) {
  throw new Error(detail === null ? `COOPERBENCH_${code}`
    : `COOPERBENCH_${code}:${detail}`);
}

function serialize(value) {
  return BufferFrom(`${canonicalizeStrict(value)}\n`, "utf8");
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return `sha256:${createHash("sha256").update(domain).update("\0")
    .update(canonicalizeStrict(value)).digest("hex")}`;
}

function requireSafePath(root, relative) {
  if (typeof relative !== "string" || relative.length < 1 || path.isAbsolute(relative)
    || relative.split("/").includes("..")) fail("PATH_INVALID", relative);
  const full = PathResolve(root, relative);
  const rel = PathRelative(root, full);
  if (rel.startsWith("..") || path.isAbsolute(rel)) fail("PATH_ESCAPE", relative);
  return full;
}

function requireDirectory(directory, expected = null) {
  const status = lstatSync(directory);
  if (!status.isDirectory() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o700) {
    fail("DIRECTORY_UNSAFE", directory);
  }
  if (expected !== null) {
    const names = readdirSync(directory).sort();
    if (names.join("\0") !== [...expected].sort().join("\0")) {
      fail("DIRECTORY_LAYOUT_INVALID", directory);
    }
  }
}

function hashRegular(root, relative, expectedBytes = null, maxBytes = null) {
  const full = requireSafePath(root, relative);
  const status = lstatSync(full);
  if (!status.isFile() || status.isSymbolicLink() || (status.mode & 0o777) !== 0o600) {
    fail("FILE_UNSAFE", relative);
  }
  if (expectedBytes !== null && status.size !== expectedBytes) fail("FILE_SIZE_MISMATCH", relative);
  if (maxBytes !== null && status.size > maxBytes) fail("FILE_TOO_LARGE", relative);
  const descriptor = openSync(full, O_RDONLY | O_NOFOLLOW);
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let total = 0;
  try {
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      total += count;
    }
    const after = fstatSync(descriptor);
    if (after.dev !== status.dev || after.ino !== status.ino || after.size !== status.size
      || total !== status.size) fail("FILE_CHANGED", relative);
  } finally { closeSync(descriptor); }
  return { bytes: total, sha256: `sha256:${hash.digest("hex")}` };
}

function readSmall(root, relative) {
  hashRegular(root, relative, null, MAX_SMALL_BYTES);
  return readFileSync(requireSafePath(root, relative));
}

function parseJson(bytes, code) {
  try { return JSONParse(bytes.toString("utf8")); }
  catch { fail(code); }
}

function verifyRecord(bytes) {
  const record = parseJson(bytes, "DATASET_RECORD_JSON_INVALID");
  if (record.id !== COOPERBENCH_DATASET_ID || record.sha !== COOPERBENCH_DATASET_REVISION
    || record.private !== false || record.gated !== false || record.disabled !== false
    || record.usedStorage !== EXPECTED_USED_STORAGE
    || record.cardData?.license !== "apache-2.0") fail("DATASET_RECORD_INVALID");
  return { datasetId: record.id, revision: record.sha, usedStorage: record.usedStorage,
    public: true, gated: false, licenseClaim: "apache-2.0",
    lastModified: record.lastModified };
}

function verifyTree(bytes) {
  const tree = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(tree) || tree.length !== 8) fail("TREE_INVALID");
  const byPath = new Map(tree.map((entry) => [entry.path, entry]));
  for (const [name, spec] of Object.entries(FILES)) {
    const entry = byPath.get(name);
    if (!entry || entry.type !== "file" || entry.oid !== spec.oid || entry.size !== spec.bytes) {
      fail("TREE_MEMBER_INVALID", name);
    }
    if (spec.sha256 && (entry.lfs?.oid !== spec.sha256 || entry.lfs?.size !== spec.bytes)) {
      fail("TREE_LFS_INVALID", name);
    }
  }
  return { entryCount: tree.length, fileCount: tree.length,
    logicalBytes: tree.reduce((sum, entry) => sum + entry.size, 0) };
}

function collectSource(root, requireManifest = true) {
  requireDirectory(root, requireManifest
    ? ["files", "metadata", "source-manifest.json"] : ["files", "metadata"]);
  requireDirectory(PathJoin(root, "files"), Object.keys(FILES));
  requireDirectory(PathJoin(root, "metadata"), ["dataset-record-before.json",
    "dataset-record-after.json", "tree.json"]);
  const before = verifyRecord(readSmall(root, "metadata/dataset-record-before.json"));
  const after = verifyRecord(readSmall(root, "metadata/dataset-record-after.json"));
  if (canonicalizeStrict(before) !== canonicalizeStrict(after)) fail("DATASET_RECORD_DRIFT");
  const tree = verifyTree(readSmall(root, "metadata/tree.json"));
  const entries = [];
  for (const [relative, spec] of Object.entries(FILES)) {
    const checked = hashRegular(root, `files/${relative}`, spec.bytes,
      spec.sha256 ? null : MAX_SMALL_BYTES);
    if (spec.sha256 && checked.sha256 !== `sha256:${spec.sha256}`) {
      fail("ARCHIVE_HASH_MISMATCH", relative);
    }
    entries.push({ path: `files/${relative}`, bytes: checked.bytes,
      sha256: checked.sha256, gitOid: spec.oid });
  }
  for (const relative of ["metadata/dataset-record-before.json",
    "metadata/dataset-record-after.json", "metadata/tree.json"]) {
    const checked = hashRegular(root, relative, null, MAX_SMALL_BYTES);
    entries.push({ path: relative, bytes: checked.bytes, sha256: checked.sha256 });
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return { before, tree, entries };
}

function manifestBody(entries) {
  return { schema: "outsider/cooperbench-coordination-source-manifest/v1",
    datasetId: COOPERBENCH_DATASET_ID, revision: COOPERBENCH_DATASET_REVISION,
    entries, selectedFileCount: entries.length,
    selectedBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0) };
}

export function createCooperbenchCoordinationSourceManifestFromDirectory(directory) {
  const collected = collectSource(PathResolve(directory), false);
  const body = manifestBody(collected.entries);
  return Object.freeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

function verifySourceManifest(root, expected) {
  const actual = parseJson(readSmall(root, "source-manifest.json"),
    "SOURCE_MANIFEST_JSON_INVALID");
  if (!serialize(expected).equals(serialize(actual))) fail("SOURCE_MANIFEST_MISMATCH");
}

function replayArchives(root, pythonExecutable) {
  if (typeof pythonExecutable !== "string" || pythonExecutable.length < 1) {
    fail("PYTHON_EXECUTABLE_INVALID");
  }
  const specs = ARCHIVES.map(({ name, scope, setting, expectedTasks }) =>
    ({ name, scope, setting, expectedTasks }));
  const child = spawnSync(pythonExecutable, ["-c", PYTHON_SCANNER,
    root, JSON.stringify(specs)], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    timeout: 10 * 60 * 1000 });
  if (child.error || child.status !== 0) fail("ARCHIVE_REPLAY_FAILED",
    child.error?.message ?? child.stderr?.trim() ?? String(child.status));
  const profiles = parseJson(BufferFrom(child.stdout, "utf8"), "ARCHIVE_PROFILE_INVALID");
  if (!Array.isArray(profiles) || profiles.length !== ARCHIVES.length) {
    fail("ARCHIVE_PROFILE_INVALID");
  }
  return profiles;
}

export function buildCooperbenchCoordinationCensusFromSourceDirectory(directory,
  options = {}) {
  const root = PathResolve(directory);
  const collected = collectSource(root);
  const manifestBase = manifestBody(collected.entries);
  const sourceManifest = Object.freeze({ ...manifestBase,
    sourceManifestHash: digest(MANIFEST_DOMAIN, manifestBase) });
  verifySourceManifest(root, sourceManifest);
  const replayed = replayArchives(root, options.pythonExecutable ?? "python3");
  const intersectionCount = (members) => {
    const sets = members.map((profile) => new Set(profile.taskIdentities));
    return sets.length === 0 ? 0 : [...sets[0]].filter((value) =>
      sets.slice(1).every((set) => set.has(value))).length;
  };
  const unionCount = (members) => new Set(members.flatMap((profile) =>
    profile.taskIdentities)).size;
  const flashRaw = replayed.filter((profile) => profile.scope === "flash");
  const fullRaw = replayed.filter((profile) => profile.scope === "full");
  const flashCommonTaskPairs = intersectionCount(flashRaw);
  const fullCommonTaskPairs = intersectionCount(fullRaw);
  const flashUnionTaskPairs = unionCount(flashRaw);
  const fullUnionTaskPairs = unionCount(fullRaw);
  const profiles = replayed.map(({ taskIdentities, ...profile }) => profile);
  const flash = profiles.filter((profile) => profile.scope === "flash");
  const full = profiles.filter((profile) => profile.scope === "full");
  const flashSameTaskSet = flash.length === 2
    && new Set(flash.map((profile) => profile.taskIdentityRoot)).size === 1;
  const fullSameTaskSet = full.length === 4
    && new Set(full.map((profile) => profile.taskIdentityRoot)).size === 1;
  const aggregate = profiles.reduce((value, profile) => ({
    archiveCount: value.archiveCount + 1,
    taskSettingRows: value.taskSettingRows + profile.taskCount,
    resultFiles: value.resultFiles + profile.resultFiles,
    trajectoryFiles: value.trajectoryFiles + profile.trajectoryFiles,
    fullTrajectoryFiles: value.fullTrajectoryFiles + profile.fullTrajectoryFiles,
    streamLogs: value.streamLogs + profile.streamLogs,
    patchFiles: value.patchFiles + profile.patchFiles,
    conversationFiles: value.conversationFiles + profile.conversationFiles,
    messageRows: value.messageRows + profile.messageRows,
    toolCallRows: value.toolCallRows + profile.toolCallRows,
    zeroJsonFiles: value.zeroJsonFiles + profile.zeroJsonFiles,
    invalidJsonFiles: value.invalidJsonFiles + profile.invalidJsonFiles,
    bothFeaturesPassed: value.bothFeaturesPassed + profile.bothFeaturesPassed,
    bothFeaturesNotPassed: value.bothFeaturesNotPassed + profile.bothFeaturesNotPassed,
    evaluationErrorsOrUnknown: value.evaluationErrorsOrUnknown
      + profile.evaluationErrorsOrUnknown,
    uncompressedBytes: value.uncompressedBytes + profile.uncompressedBytes,
  }), { archiveCount: 0, taskSettingRows: 0, resultFiles: 0,
    trajectoryFiles: 0, fullTrajectoryFiles: 0, streamLogs: 0,
    patchFiles: 0, conversationFiles: 0, messageRows: 0, toolCallRows: 0,
    zeroJsonFiles: 0, invalidJsonFiles: 0,
    bothFeaturesPassed: 0, bothFeaturesNotPassed: 0,
    evaluationErrorsOrUnknown: 0, uncompressedBytes: 0 });
  const reportBody = {
    schema: COOPERBENCH_COORDINATION_SCHEMA,
    disposition: COOPERBENCH_COORDINATION_DISPOSITION,
    source: { ...collected.before, ...collected.tree,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      selectedSemanticFiles: Object.keys(FILES).length,
      selectedSemanticBytes: Object.values(FILES).reduce((sum, spec) => sum + spec.bytes, 0),
      allSixPublishedTrajectoryArchivesReplayed: true,
      rawTrajectoryBytesProjected: false },
    archiveReplay: profiles,
    coordinationDesign: { flashSettings: ["coopgit", "solo"],
      publisherNominalFlashTaskPairs: 50, flashUnionTaskPairs,
      flashCommonTaskPairs, flashSameTaskSet,
      fullSettings: ["coopgit", "solo", "team-noproto", "team"],
      publisherNominalFullTaskPairs: 652, fullUnionTaskPairs,
      fullCommonTaskPairs, fullSameTaskSet,
      publisherNominalScopeIsNotCompleteInEveryArchive:
        flashCommonTaskPairs !== 50 || fullCommonTaskPairs !== 652,
      repeatedTaskSettingsEnableBoundedWithinTaskCoordinationComparison:
        flashCommonTaskPairs > 0 && fullCommonTaskPairs > 0,
      sameTaskSettingsAreFreshRunsNotLongitudinalRecovery: true },
    aggregate: { ...aggregate, publisherHarnessOutcomeRows: aggregate.taskSettingRows,
      publisherHarnessOutcomeIsIndependentTruth: false,
      completePublishedArchiveCensus: true },
    rights: { datasetCardLicenseClaim: "Apache-2.0",
      upstreamRepositoryLicensesAreHeterogeneous: true,
      upstreamRepositoryRightsReplayed: false, legalConclusionEstablished: false,
      trainingUseAuthorized: false, evaluationUseOnlyByThisArtifact: true },
    privacy: { rawPromptsStreamsPatchesAndTestOutputPresent: true,
      rawSourcePrivate: true, noPiiGuaranteed: false, rawProjectionRows: 0 },
    denominatorRegistry: { coordinationTaskSettingRows: aggregate.taskSettingRows,
      uniqueFlashTaskPairs: flashUnionTaskPairs,
      uniqueFullTaskPairs: fullUnionTaskPairs,
      crossDenominatorTotal: null, additionProhibited: true },
    boundary: { coordinationEvaluationMorphologies: aggregate.taskSettingRows,
      publisherEvaluatorOutcomeRows: aggregate.taskSettingRows,
      independentOutcomeRows: 0, longitudinalOutcomeRows: 0,
      recoveryEpisodeRows: 0, preActionDelegationRows: 0,
      offlineTrainingRows: 0, productionTrainingRows: 0,
      networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
      pricingRows: 0, authorityRows: 0, autonomousActionAuthorized: false },
  };
  const report = Object.freeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return Object.freeze({ sourceManifest, report });
}

function receiptBody(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  return { schema: COOPERBENCH_COORDINATION_RECEIPT_SCHEMA,
    reportHash: report.artifactHash, reportFileSha256: sha256(reportBytes),
    reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: COOPERBENCH_COORDINATION_DISPOSITION,
    coordinationEvaluationMorphologies: report.boundary.coordinationEvaluationMorphologies,
    independentOutcomeRows: 0, recoveryEpisodeRows: 0,
    offlineTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
    authorityRows: 0, autonomousActionAuthorized: false };
}

export function createCooperbenchCoordinationReceipt(report, reportBytes, manifestBytes) {
  const body = receiptBody(report, reportBytes, manifestBytes);
  return Object.freeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyCooperbenchCoordinationArtifactDirectory(directory, options = {}) {
  try {
    const root = PathResolve(directory);
    requireDirectory(root, ["report.json", "run-receipt.json", "source"]);
    const reportBytes = readSmall(root, "report.json");
    const receiptBytes = readSmall(root, "run-receipt.json");
    const rebuilt = buildCooperbenchCoordinationCensusFromSourceDirectory(
      PathJoin(root, "source"), options);
    const expectedReportBytes = serialize(rebuilt.report);
    if (!expectedReportBytes.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readSmall(root, "source/source-manifest.json");
    const receipt = createCooperbenchCoordinationReceipt(rebuilt.report,
      expectedReportBytes, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return Object.freeze({ ok: true, report: rebuilt.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return Object.freeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeCooperbenchCoordinationArtifact(value) {
  return serialize(value);
}
