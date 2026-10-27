/*
 * Complete physical-shard replay for Microsoft Orchard SWE shard 14.
 *
 * The Parquet includes untrusted repository text, model reasoning, tool calls,
 * and tool output. It remains private and is parsed only as data; no embedded
 * command, code, test, or tool argument is executed.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

const BufferFrom = Buffer.from;
const JSONParse = JSON.parse;
const PathRelative = path.relative;
const PathResolve = path.resolve;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;

export const ORCHARD_SWE_SHARD14_SCHEMA =
  "outsider/orchard-swe-physical-shard/v1";
export const ORCHARD_SWE_SHARD14_RECEIPT_SCHEMA =
  "outsider/orchard-swe-physical-shard-receipt/v1";
export const ORCHARD_DATASET_ID = "microsoft/Orchard";
export const ORCHARD_REVISION =
  "70c05ec1f20f823ae6adc60374922e9271bb74e2";
export const ORCHARD_SWE_SHARD14_SCOPE =
  "COMPLETE_PUBLISHER_PHYSICAL_SHARD";
export const ORCHARD_SWE_SHARD14_DISPOSITION =
  "QUARANTINE_EVALUATION_ONLY_RIGHTS_AND_PRIVACY_HOLD";

const REPORT_DOMAIN = "outsider/orchard-swe-physical-shard-report/v1";
const RECEIPT_DOMAIN = "outsider/orchard-swe-physical-shard-receipt/v1";
const MANIFEST_DOMAIN =
  "outsider/orchard-swe-physical-shard-source-manifest/v1";
const SOURCE_ROOT_DOMAIN =
  "outsider/orchard-swe-physical-shard-source-root/v1";
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_SHARD_BYTES = 300_000_000;
const RECORD_SHA =
  "sha256:f1796fa921293836c8cf5e93c94fe2582af61c2361036ff6324665e0a7c56e11";
const TREE_SHA =
  "sha256:f0f69be8bfd72284513b68feec19865be6f6df31eef9470ea4b8997d992c16b3";
const README_SHA =
  "sha256:6dc5e96bd5125a248182762651ea87098e4f418c13a5889b763e1bd559dc57b2";
const SHARD_REPO_PATH = "swe/train/data-00014-of-00019.parquet";
const SHARD_SOURCE_PATH = `files/${SHARD_REPO_PATH}`;
const SHARD_BYTES = 283_683_745;
const SHARD_SHA =
  "sha256:0d5dac902a57530a9de2dbb7a4b3a8161cf7b53f65ad017c7c7e0fe2997d1aad";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const GIT_OID = /^[a-f0-9]{40}$/u;
const FIXED_SOURCE_FILES = Object.freeze([
  SHARD_SOURCE_PATH,
  "metadata/dataset-record-after.json",
  "metadata/dataset-record-before.json",
  "metadata/full-tree-after.json",
  "metadata/full-tree-before.json",
  "support/README.md",
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `ORCHARD_SWE_SHARD14_${code}`
    : `ORCHARD_SWE_SHARD14_${code}:${detail}`);
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

function checkedFile(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600
    || link.size > BigInt(maximumBytes)
    || exactBytes !== null && link.size !== BigInt(exactBytes)) {
    fail("FILE_UNSAFE", relative);
  }
  return target;
}

function readRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedFile(root, relative, maximumBytes, exactBytes);
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

function hashRegular(root, relative, maximumBytes, exactBytes = null) {
  const target = checkedFile(root, relative, maximumBytes, exactBytes);
  const descriptor = openSync(target, O_RDONLY | O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0;
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      total += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(total) !== after.size) fail("FILE_CHANGED_DURING_HASH", relative);
    return { bytes: total, sha256: `sha256:${hash.digest("hex")}` };
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

function datasetRecord(bytes) {
  if (sha256(bytes) !== RECORD_SHA) fail("RECORD_PIN_MISMATCH");
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, license: value.cardData?.license,
  };
  if (!same(projection, {
    id: ORCHARD_DATASET_ID, author: "microsoft", sha: ORCHARD_REVISION,
    lastModified: "2026-07-28T21:27:19.000Z", private: false,
    gated: false, disabled: false, usedStorage: 10_962_095_491,
    license: "mit",
  })) fail("RECORD_PROFILE_INVALID");
  return projection;
}

function fixedTree(bytes) {
  if (sha256(bytes) !== TREE_SHA) fail("TREE_PIN_MISMATCH");
  const value = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(value)) fail("TREE_INVALID");
  const entries = value.map((entry) => {
    if (!entry || typeof entry.path !== "string"
      || !["file", "directory"].includes(entry.type)
      || !Number.isSafeInteger(entry.size) || entry.size < 0
      || !GIT_OID.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
    return { path: entry.path, type: entry.type, size: entry.size, oid: entry.oid,
      lfsOid: entry.lfs?.oid ?? null, lfsSize: entry.lfs?.size ?? null };
  }).sort((left, right) => left.path < right.path ? -1 : 1);
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const parquets = files.filter((entry) => entry.path.endsWith(".parquet"));
  const swe = parquets.filter((entry) => entry.path.startsWith("swe/train/"));
  const gui = parquets.filter((entry) => entry.path.startsWith("gui/train/"));
  const bounded = parquets.filter((entry) => entry.size < 300_000_000);
  const selected = files.find((entry) => entry.path === SHARD_REPO_PATH);
  if (entries.length !== 28 || files.length !== 24 || directories.length !== 4
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 10_962_121_387
    || parquets.length !== 22 || swe.length !== 19 || gui.length !== 3
    || !same(bounded.map((entry) => entry.path), [SHARD_REPO_PATH])
    || selected?.size !== SHARD_BYTES || selected?.lfsSize !== SHARD_BYTES
    || selected?.lfsOid !== SHARD_SHA.slice(7)) fail("TREE_PROFILE_INVALID");
  return { entries, files, directories, parquets, swe, gui, bounded, selected };
}

function readmeProfile(root, tree) {
  const bytes = readRegular(root, "support/README.md", MAX_METADATA_BYTES, 23_392);
  const source = tree.files.find((entry) => entry.path === "README.md");
  if (sha256(bytes) !== README_SHA || source?.size !== bytes.length
    || gitBlobOid(bytes) !== source?.oid) fail("README_PIN_MISMATCH");
  const text = new TextDecoder().decode(bytes);
  const required = [
    "107,185 multi-turn software-engineering trajectories",
    "**74,649 resolved** *and* **32,536 unresolved**",
    "**anonymized** trajectory text",
    "hidden gold test suite end-to-end",
    "MIT, subject to the licenses of the individual repositories",
  ];
  if (required.some((phrase) => !text.includes(phrase))) {
    fail("README_NARRATIVE_INVALID");
  }
  return bytes;
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return { schema: "outsider/orchard-swe-physical-shard-source-manifest/v1",
    datasetId: ORCHARD_DATASET_ID, revision: ORCHARD_REVISION,
    scope: ORCHARD_SWE_SHARD14_SCOPE, sourcePath: SHARD_REPO_PATH,
    entries: ordered, sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered) };
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
  if (!recordBefore.equals(recordAfter) || !treeBefore.equals(treeAfter)) {
    fail("MATERIAL_STATE_CHANGED");
  }
  const record = datasetRecord(recordBefore);
  const tree = fixedTree(treeBefore);
  readmeProfile(root, tree);
  const shard = hashRegular(root, SHARD_SOURCE_PATH, MAX_SHARD_BYTES, SHARD_BYTES);
  if (shard.sha256 !== SHARD_SHA) fail("SHARD_PIN_MISMATCH");
  const expected = [...FIXED_SOURCE_FILES,
    ...(withManifest ? ["source-manifest.json"] : [])];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  const entries = [];
  for (const relative of FIXED_SOURCE_FILES) {
    if (relative === SHARD_SOURCE_PATH) {
      entries.push({ path: relative, bytes: shard.bytes, sha256: shard.sha256,
        lfsSha256: SHARD_SHA });
    } else {
      const bytes = readRegular(root, relative, MAX_METADATA_BYTES);
      entries.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  return { root, record, tree, shard, entries };
}

export function createOrchardSweShard14SourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, pathlib, re, sys
import pyarrow.parquet as pq

source = pathlib.Path(sys.argv[1])
shard = source / 'files' / 'swe' / 'train' / 'data-00014-of-00019.parquet'

def die(code):
    raise RuntimeError('ORCHARD_SWE_SHARD14_PYTHON_' + code)

parquet = pq.ParquetFile(shard)
if (parquet.metadata.num_rows != 5641 or parquet.metadata.num_row_groups != 3
        or parquet.metadata.num_columns != 9
        or parquet.schema_arrow.names != ['tools','messages','metadata']):
    die('PARQUET_PROFILE_INVALID')
row_groups = [(parquet.metadata.row_group(index).num_rows,
               parquet.metadata.row_group(index).total_byte_size)
              for index in range(3)]
if row_groups != [(1936,98125812),(1936,102948148),(1769,88462428)]:
    die('ROW_GROUP_PROFILE_INVALID')

root_keys = {'tools','messages','metadata'}
metadata_keys = {'instance_id','sample_idx','source','model','repo','verify_status',
                 'est_tokens','n_turns','fail_to_pass_failed',
                 'fail_to_pass_passed','pass_to_pass_failed'}
message_keys = {'role','content','tool_call_id','tool_calls'}
call_keys = {'id','type','function'}
function_keys = {'name','arguments'}

roles = collections.Counter()
function_rows = collections.Counter()
instance = {}
repos = set()
messages = tool_calls = content_bytes = argument_bytes = 0
tool_response_rows = duplicate_call_ids = unmatched_call_ids = 0
message_counts = []
call_counts = []
n_turns = []
est_tokens = []
test_counts = collections.Counter()
test_combinations = collections.Counter()
tool_definition_roots = set()
shape = hashlib.sha256()
pattern_counts = collections.Counter()
patterns = {
 'email': re.compile(rb'(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?![A-Za-z0-9.-])'),
 'awsAccessKey': re.compile(rb'AKIA[0-9A-Z]{16}'),
 'privateKeyHeader': re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
 'githubToken': re.compile(rb'(?:ghp|github_pat)_[A-Za-z0-9_]{20,}'),
 'openaiKey': re.compile(rb'sk-[A-Za-z0-9]{20,}')}

index = 0
for batch in parquet.iter_batches(batch_size=128):
    for row in batch.to_pylist():
        if set(row) != root_keys or not isinstance(row['messages'], list):
            die('ROW_SCHEMA_INVALID')
        try:
            metadata = json.loads(row['metadata'])
            tools = json.loads(row['tools'])
        except Exception:
            die('ROW_JSON_INVALID')
        if (not isinstance(metadata, dict) or set(metadata) != metadata_keys
                or not isinstance(tools, list) or len(tools) != 1):
            die('DECODED_SCHEMA_INVALID')
        tool = tools[0]
        if (set(tool) != {'type','function'} or tool.get('type') != 'function'
                or not isinstance(tool.get('function'), dict)
                or tool['function'].get('name') != 'bash'):
            die('TOOL_DEFINITION_INVALID')
        encoded_tool = json.dumps(tool, sort_keys=True, separators=(',', ':')).encode()
        tool_definition_roots.add(hashlib.sha256(encoded_tool).hexdigest())
        if (metadata['source'] != 'rebench-M2.5'
                or metadata['model'] != 'MiniMax-M2.5'
                or metadata['verify_status'] != 'unresolved'):
            die('SOURCE_MODEL_STATUS_INVALID')
        if (not isinstance(metadata['sample_idx'], int)
                or not isinstance(metadata['n_turns'], int)
                or not isinstance(metadata['est_tokens'], int)):
            die('METADATA_TYPE_INVALID')
        key = metadata['instance_id']
        current = instance.setdefault(key, {
          'samples':set(), 'repo':metadata['repo'], 'rows':0})
        if (metadata['sample_idx'] in current['samples']
                or current['repo'] != metadata['repo']):
            die('INSTANCE_SAMPLE_OR_REPO_INVALID')
        current['samples'].add(metadata['sample_idx'])
        current['rows'] += 1
        repos.add(metadata['repo'])
        n_turns.append(metadata['n_turns'])
        est_tokens.append(metadata['est_tokens'])

        f2p_pass = metadata['fail_to_pass_passed']
        f2p_fail = metadata['fail_to_pass_failed']
        p2p_fail = metadata['pass_to_pass_failed']
        if not all(isinstance(value, list) for value in (f2p_pass,f2p_fail,p2p_fail)):
            die('TEST_RESULT_SCHEMA_INVALID')
        if any(not isinstance(item, str)
               for value in (f2p_pass,f2p_fail,p2p_fail) for item in value):
            die('TEST_RESULT_ITEM_INVALID')
        for name, value in [('failToPassPassed',f2p_pass),
                            ('failToPassFailed',f2p_fail),
                            ('passToPassFailed',p2p_fail)]:
            test_counts[name+'Rows'] += bool(value)
            test_counts[name+'Items'] += len(value)
        test_combinations[(bool(f2p_pass),bool(f2p_fail),bool(p2p_fail))] += 1

        row_calls = 0
        call_ids = set()
        response_ids = set()
        for message in row['messages']:
            if not isinstance(message, dict) or set(message) != message_keys:
                die('MESSAGE_SCHEMA_INVALID')
            role = message['role']
            if role not in {'system','user','assistant','tool'}:
                die('MESSAGE_ROLE_INVALID')
            roles[role] += 1
            messages += 1
            if not isinstance(message['content'], str):
                die('MESSAGE_CONTENT_INVALID')
            content = message['content'].encode()
            content_bytes += len(content)
            for name, pattern in patterns.items():
                pattern_counts[name] += len(pattern.findall(content))
            calls = message['tool_calls']
            if not isinstance(calls, list):
                die('TOOL_CALL_LIST_INVALID')
            if message['tool_call_id']:
                if role != 'tool':
                    die('TOOL_RESPONSE_ROLE_INVALID')
                response_ids.add(message['tool_call_id'])
                tool_response_rows += 1
            for call in calls:
                if (role != 'assistant' or not isinstance(call, dict)
                        or set(call) != call_keys or call.get('type') != 'function'
                        or not isinstance(call.get('function'), dict)
                        or set(call['function']) != function_keys
                        or call['function'].get('name') != 'bash'):
                    die('TOOL_CALL_SCHEMA_INVALID')
                if call['id'] in call_ids:
                    duplicate_call_ids += 1
                call_ids.add(call['id'])
                arguments = call['function']['arguments']
                try:
                    decoded_arguments = json.loads(arguments)
                except Exception:
                    die('TOOL_ARGUMENT_JSON_INVALID')
                if not isinstance(decoded_arguments, dict):
                    die('TOOL_ARGUMENT_TYPE_INVALID')
                argument_bytes += len(arguments.encode())
                for name, pattern in patterns.items():
                    pattern_counts[name] += len(pattern.findall(arguments.encode()))
                function_rows['bash'] += 1
                tool_calls += 1
                row_calls += 1
        unmatched_call_ids += len(call_ids - response_ids) + len(response_ids - call_ids)
        message_counts.append(len(row['messages']))
        call_counts.append(row_calls)
        shape_item = {
          'index':index,
          'instanceHash':hashlib.sha256(metadata['instance_id'].encode()).hexdigest(),
          'sampleIndex':metadata['sample_idx'],
          'repoHash':hashlib.sha256(metadata['repo'].encode()).hexdigest(),
          'messages':len(row['messages']),'toolCalls':row_calls,
          'verifyStatus':metadata['verify_status']}
        encoded = json.dumps(shape_item, sort_keys=True, separators=(',', ':')).encode()
        shape.update(len(encoded).to_bytes(8, 'big'))
        shape.update(encoded)
        index += 1

rows_per_instance = collections.Counter(value['rows'] for value in instance.values())
expected_test_counts = {
 'failToPassPassedRows':1319,'failToPassPassedItems':4294,
 'failToPassFailedRows':5318,'failToPassFailedItems':18271,
 'passToPassFailedRows':1083,'passToPassFailedItems':33153}
expected_combinations = {
 (False,True,False):3691,(False,True,True):631,
 (True,True,False):867,(True,False,True):323,(True,True,True):129}
if (index != 5641 or len(instance) != 1687 or len(repos) != 614
        or dict(sorted(rows_per_instance.items())) != {1:336,2:226,3:228,4:316,5:581}
        or messages != 231802 or content_bytes != 233593176
        or dict(roles) != {'system':5641,'user':5649,
                           'assistant':110256,'tool':110256}
        or tool_calls != 110256 or function_rows != {'bash':110256}
        or argument_bytes != 34955034 or tool_response_rows != 110256
        or duplicate_call_ids != 0 or unmatched_call_ids != 0
        or dict(test_counts) != expected_test_counts
        or dict(test_combinations) != expected_combinations
        or len(tool_definition_roots) != 1):
    die('AGGREGATE_PROFILE_INVALID')
if (min(n_turns) != 6 or max(n_turns) != 80 or sum(n_turns) != 275719
        or min(est_tokens) != 2396 or max(est_tokens) != 56097
        or sum(est_tokens) != 109959877
        or min(message_counts) != 4 or max(message_counts) != 156
        or min(call_counts) != 1 or max(call_counts) != 77):
    die('RANGE_PROFILE_INVALID')
if dict(pattern_counts) != {'email':3674,'awsAccessKey':6,
                            'privateKeyHeader':5,'githubToken':0,'openaiKey':0}:
    die('PRIVACY_PATTERN_PROFILE_INVALID')

combination_output = {
 'noPassed_targetFailed_noRegression':test_combinations[(False,True,False)],
 'noPassed_targetFailed_regression':test_combinations[(False,True,True)],
 'somePassed_targetFailed_noRegression':test_combinations[(True,True,False)],
 'somePassed_noTargetFailed_regression':test_combinations[(True,False,True)],
 'somePassed_targetFailed_regression':test_combinations[(True,True,True)]}
print(json.dumps({
 'parquetRows':index,'parquetRowGroups':3,'parquetLeafColumns':9,
 'parquetRootColumns':['tools','messages','metadata'],
 'rowGroupRows':[1936,1936,1769],
 'sourceValues':{'rebench-M2.5':5641},
 'modelValues':{'MiniMax-M2.5':5641},
 'verifyStatusValues':{'unresolved':5641},
 'uniqueInstanceIds':len(instance),'uniqueRepositories':len(repos),
 'rowsPerInstance':{str(key):value for key,value in sorted(rows_per_instance.items())},
 'sampleIndexUniqueWithinInstance':True,'repositoryConsistentWithinInstance':True,
 'messageRows':messages,'messageRoleRows':dict(sorted(roles.items())),
 'messageContentUtf8Bytes':content_bytes,
 'messagesPerTrajectory':{'min':min(message_counts),'max':max(message_counts)},
 'toolDefinitionDocuments':5641,'uniqueToolDefinitionDocuments':len(tool_definition_roots),
 'toolCallRows':tool_calls,'toolCallFunctionRows':dict(sorted(function_rows.items())),
 'toolArgumentJsonDocumentsParsed':tool_calls,
 'toolArgumentUtf8Bytes':argument_bytes,
 'toolCallsPerTrajectory':{'min':min(call_counts),'max':max(call_counts)},
 'toolResponseRows':tool_response_rows,
 'duplicateToolCallIdsWithinTrajectory':duplicate_call_ids,
 'unmatchedToolCallOrResponseIds':unmatched_call_ids,
 'nTurns':{'min':min(n_turns),'max':max(n_turns),'sum':sum(n_turns)},
 'estimatedTokens':{'min':min(est_tokens),'max':max(est_tokens),'sum':sum(est_tokens)},
 'hiddenTestResultListCounts':dict(sorted(test_counts.items())),
 'hiddenTestFailureMorphologyRows':combination_output,
 'rowsWithNoFailToPassOrPassToPassFailures':0,
 'rowsQualifyingResolvedFromPublishedFailureLists':0,
 'selectedShapeRoot':'sha256:'+shape.hexdigest(),
 'privacyPatternCandidates':dict(sorted(pattern_counts.items())),
 'privacyPatternScanIsNotAnonymityProof':True,
 'downloadedCommandsCodeTestsOrToolArgumentsExecuted':False,
 'rawContentProjected':False,
}, sort_keys=True, separators=(',', ':')))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_ORCHARD_PYTHON ?? "/opt/anaconda3/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim() ?? result.status);
  }
  let value;
  try { value = JSONParse(result.stdout); } catch { fail("REPLAY_OUTPUT_INVALID"); }
  return deepFreeze(value);
}

export function buildOrchardSweShard14ArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const stored = readRegular(collected.root, "source-manifest.json", MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: ORCHARD_SWE_SHARD14_SCHEMA,
    disposition: ORCHARD_SWE_SHARD14_DISPOSITION,
    scope: {
      kind: ORCHARD_SWE_SHARD14_SCOPE,
      datasetId: ORCHARD_DATASET_ID, revision: ORCHARD_REVISION,
      physicalShardPath: SHARD_REPO_PATH, physicalShardBytes: SHARD_BYTES,
      physicalShardSha256: SHARD_SHA,
      completePhysicalShardAcquired: true,
      randomRowSamplingApplied: false,
      fullRebenchUnresolvedPopulationClaimed: false,
      fullOrchardSwePopulationClaimed: false,
    },
    source: {
      lastModified: collected.record.lastModified, public: true, gated: false,
      cardLicenseClaim: "MIT", usedStorageBytes: 10_962_095_491,
      fixedRevisionTreeEntries: 28, fixedRevisionFiles: 24,
      fixedRevisionDirectories: 4, fixedRevisionFileBytes: 10_962_121_387,
      parquetFiles: 22, sweParquetFiles: 19, guiParquetFiles: 3,
      physicalParquetFilesUnder300DecimalMB: 1,
      onlyBoundedPhysicalParquetPath: SHARD_REPO_PATH,
      recordAndTreeStateStable: true,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
    },
    replay: { ...replay,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")) },
    selection: {
      selectedRows: 5_641, completePublisherPhysicalShard: true,
      completePhysicalShardTrajectoryCensusRows: 5_641,
      physicalShardPartitioningRandomEstablished: false,
      representativeOfRebenchUnresolvedPopulationEstablished: false,
      fullRebenchUnresolvedPopulationExhausted: false,
      fullOrchardSwePopulationExhausted: false,
      sourceNativeGroupPreserved: "rebench-M2.5|MiniMax-M2.5|unresolved",
    },
    execution: {
      publisherAgentTrajectoryRows: 5_641,
      publisherRecordedToolCallRows: replay.toolCallRows,
      publisherSaysSandboxedOrchardEnvExecution: true,
      independentExecutionReceiptRows: 0,
      physicalWorldExecutionRows: 0, robotExecutionRows: 0,
      downloadedCommandsCodeTestsOrToolArgumentsExecuted: false,
      rawContentIsUntrustedActiveContent: true,
    },
    outcome: {
      publisherNativeVerifyStatusRows: 5_641,
      publisherVerifyStatusUnresolvedRows: 5_641,
      publisherSaysHiddenGoldTestEndToEndScoring: true,
      hiddenTestHarnessBytesAcquired: 0,
      outcomeProducerIndependentFromExecutionHarness: false,
      independentlyVerifiedOutcomeRows: 0,
      completePhysicalShardOutcomeCensusRows: 5_641,
      completePopulationAttemptCensusRows: 0,
      realWorldOutcomeRows: 0,
    },
    failureMorphology: {
      failToPassPassedRows:
        replay.hiddenTestResultListCounts.failToPassPassedRows,
      failToPassPassedItems:
        replay.hiddenTestResultListCounts.failToPassPassedItems,
      failToPassFailedRows:
        replay.hiddenTestResultListCounts.failToPassFailedRows,
      failToPassFailedItems:
        replay.hiddenTestResultListCounts.failToPassFailedItems,
      passToPassFailedRows:
        replay.hiddenTestResultListCounts.passToPassFailedRows,
      passToPassFailedItems:
        replay.hiddenTestResultListCounts.passToPassFailedItems,
      rowsQualifyingResolvedFromPublishedFailureLists: 0,
      allRowsRemainPublisherLabeledUnresolved: true,
    },
    recovery: {
      repeatedInstanceSampleIndicesAreSeparateRolloutsNotRecoveryLinks: true,
      partialFailToPassSuccessPromotedToRecovery: false,
      publisherNativeRecoveryLabelRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      longitudinalRecoveryRows: 0,
    },
    privacy: {
      publisherAnonymizedTrajectoryTextClaim: true,
      anonymizationMethodBytesAcquired: 0,
      selectedEmailPatternCandidates: replay.privacyPatternCandidates.email,
      selectedAwsAccessKeyPatternCandidates:
        replay.privacyPatternCandidates.awsAccessKey,
      selectedPrivateKeyHeaderPatternCandidates:
        replay.privacyPatternCandidates.privateKeyHeader,
      candidatesMayBeSyntheticTestsExamplesOrPlaceholders: true,
      independentAnonymityAuditRows: 0,
      anonymizationCertified: false, noPiiOrSecretGuaranteed: false,
      privacyPatternScanIsNotAnonymityProof: true,
      rawSourcePrivate: true, rawProjectionRows: 0,
    },
    rights: {
      datasetLicenseClaim: "MIT",
      publisherUpstreamRepositoryLicenseQualificationPresent: true,
      uniqueUpstreamRepositoriesInShard: 614,
      upstreamRepositoryLicensesIndividuallyAdjudicated: 0,
      embeddedPatchTestAndCodeRightsIndependentlyAdjudicated: false,
      modelGeneratedContentRightsIndependentlyAdjudicated: false,
      legalConclusionEstablished: false,
      authorizedTrainingRows: 0, redistributionAuthorizedByThisArtifact: false,
    },
    denominators: {
      COMPLETE_PHYSICAL_SHARD_TRAJECTORY: 5_641,
      PUBLISHER_NATIVE_UNRESOLVED_OUTCOME: 5_641,
      MESSAGE_RECORD: replay.messageRows,
      TOOL_CALL_RECORD: replay.toolCallRows,
      INDEPENDENTLY_VERIFIED_OUTCOME: 0,
      crossPopulationTotal: null, additionProhibited: true,
    },
    boundary: {
      independentlyVerifiedOutcomeRows: 0,
      completePopulationAttemptCensusRows: 0,
      publisherNativeRecoveryLabelRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      physicalEffectRows: 0, preActionDelegationRows: 0,
      authorizedTrainingRows: 0, productionTrainingRows: 0,
      networkAdmissionRows: 0, actorCreditRows: 0, ceuRows: 0,
      pricingRows: 0, authorityRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createOrchardSweShard14Receipt(
  report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: ORCHARD_SWE_SHARD14_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: ORCHARD_SWE_SHARD14_DISPOSITION,
    scope: ORCHARD_SWE_SHARD14_SCOPE,
    completePhysicalShardRows: 5_641,
    publisherNativeUnresolvedOutcomeRows: 5_641,
    independentlyVerifiedOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0,
    authorizedTrainingRows: 0, productionTrainingRows: 0,
    networkAdmissionRows: 0, authorityRows: 0,
    autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyOrchardSweShard14ArtifactDirectory(directory, options = {}) {
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
    const built = buildOrchardSweShard14ArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createOrchardSweShard14Receipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeOrchardSweShard14Artifact(value) {
  return serialize(value);
}
