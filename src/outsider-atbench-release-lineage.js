/*
 * Complete fixed-revision replay of the ATBench release lineage.
 *
 * Source JSON contains synthetic user data, tool descriptions, commands, tool
 * arguments, and environment responses. It is retained privately and parsed
 * only as inert data. Nothing found in a trajectory is executed.
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

export const ATBENCH_RELEASE_LINEAGE_SCHEMA =
  "outsider/atbench-release-lineage/v1";
export const ATBENCH_RELEASE_LINEAGE_RECEIPT_SCHEMA =
  "outsider/atbench-release-lineage-receipt/v1";
export const ATBENCH_DATASET_ID = "AI45Research/ATBench";
export const ATBENCH_REVISION =
  "4476ef92ed8f85c8d58d8a5b9dfdf55aa7893138";
export const ATBENCH_RELEASE_LINEAGE_SCOPE =
  "COMPLETE_FIXED_REVISION_RELEASE_LINEAGE";
export const ATBENCH_RELEASE_LINEAGE_DISPOSITION = "QUARANTINE_EVAL_ONLY";

const REPORT_DOMAIN = "outsider/atbench-release-lineage-report/v1";
const RECEIPT_DOMAIN = "outsider/atbench-release-lineage-receipt/v1";
const MANIFEST_DOMAIN = "outsider/atbench-release-lineage-source-manifest/v1";
const SOURCE_ROOT_DOMAIN = "outsider/atbench-release-lineage-source-root/v1";
const MAX_METADATA_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 24 * 1024 * 1024;
const TREE_SHA =
  "sha256:d087aa6b41eed8ef88300e9743bee0882cf0d250ae54d87003ff16a30d19d8be";
const README_SHA =
  "sha256:a38629fcfce5740cdba7b7d3b374b5bcd38e313aac3d0f23ee9d8a28db6ab723";
const CURRENT_PATH = "ATBench/test.json";
const CURRENT_BYTES = 18_335_079;
const CURRENT_SHA =
  "sha256:80c534b5f3517c872b528a2e6b64e34495206968edd184f4aed563d39f0cca09";
const LEGACY_PATH = "ATBench500/test.json";
const LEGACY_ROOT_PATH = "test.json";
const LEGACY_BYTES = 5_422_164;
const LEGACY_SHA =
  "sha256:031285443c6b8ca64fc117bd995a4b4490c340467136506763aeed1b23c8f34c";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;

const DUPLICATE_PATH_GROUPS = Object.freeze([
  ["ATBench500/test.json", "test.json"],
  ["figures/ATBench500/benchmark_distribution.png",
    "figures/benchmark_distribution.png"],
  ["figures/ATBench500/safe_case.png", "figures/safe_case.png"],
  ["figures/ATBench500/unsafe_case.png", "figures/unsafe_case.png"],
]);

function fail(code, detail = null) {
  throw new Error(detail === null ? `ATBENCH_RELEASE_LINEAGE_${code}`
    : `ATBENCH_RELEASE_LINEAGE_${code}:${detail}`);
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

function datasetRecord(bytes) {
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, license: value.cardData?.license,
    configs: value.cardData?.configs,
  };
  if (!same(projection, {
    id: ATBENCH_DATASET_ID, author: "AI45Research", sha: ATBENCH_REVISION,
    lastModified: "2026-05-13T10:32:34.000Z", private: false,
    gated: false, disabled: false, usedStorage: 63_867_996,
    license: "apache-2.0",
    configs: [
      { config_name: "ATBench",
        data_files: [{ split: "test", path: CURRENT_PATH }] },
      { config_name: "ATBench500",
        data_files: [{ split: "test", path: LEGACY_PATH }] },
    ],
  })) fail("RECORD_PROFILE_INVALID");
  return { ...projection, sha256: sha256(bytes), bytes: bytes.length };
}

function fixedTree(bytes) {
  if (sha256(bytes) !== TREE_SHA) fail("TREE_PIN_MISMATCH");
  const value = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(value)) fail("TREE_INVALID");
  const entries = value.map((entry) => {
    if (!entry || typeof entry.path !== "string"
      || !["file", "directory"].includes(entry.type)
      || !Number.isSafeInteger(entry.size) || entry.size < 0
      || !OID.test(entry.oid ?? "")) fail("TREE_ENTRY_INVALID");
    const lfsOid = entry.lfs?.oid ?? null;
    const lfsSize = entry.lfs?.size ?? null;
    if (lfsOid !== null && (!/^[a-f0-9]{64}$/u.test(lfsOid)
      || !Number.isSafeInteger(lfsSize) || lfsSize !== entry.size)) {
      fail("TREE_LFS_INVALID", entry.path);
    }
    return { path: entry.path, type: entry.type, size: entry.size,
      oid: entry.oid, lfsOid, lfsSize };
  }).sort((left, right) => left.path < right.path ? -1 : 1);
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const pathBytes = files.reduce((sum, entry) => sum + entry.size, 0);
  const unique = new Map();
  for (const entry of files) {
    const identity = entry.lfsOid === null ? `oid:${entry.oid}` : `lfs:${entry.lfsOid}`;
    if (!unique.has(identity)) unique.set(identity, entry.size);
  }
  const current = files.find((entry) => entry.path === CURRENT_PATH);
  const legacy = files.find((entry) => entry.path === LEGACY_PATH);
  const rootLegacy = files.find((entry) => entry.path === LEGACY_ROOT_PATH);
  if (entries.length !== 20 || files.length !== 15 || directories.length !== 5
    || pathBytes !== 35_925_668 || unique.size !== 11
    || [...unique.values()].reduce((sum, size) => sum + size, 0) !== 28_185_736
    || files.filter((entry) => entry.lfsOid !== null).length !== 10
    || current?.size !== CURRENT_BYTES || current?.lfsSize !== CURRENT_BYTES
    || current?.lfsOid !== CURRENT_SHA.slice(7)
    || legacy?.size !== LEGACY_BYTES || rootLegacy?.size !== LEGACY_BYTES
    || legacy?.oid !== rootLegacy?.oid
    || files.some((entry) => entry.path === "LICENSE"
      || entry.path === "LICENSE.md" || entry.path === "LICENSE.txt")) {
    fail("TREE_PROFILE_INVALID");
  }
  for (const group of DUPLICATE_PATH_GROUPS) {
    const selected = group.map((sourcePath) =>
      files.find((entry) => entry.path === sourcePath));
    if (selected.some((entry) => !entry)
      || new Set(selected.map((entry) => entry.oid)).size !== 1
      || new Set(selected.map((entry) => entry.size)).size !== 1) {
      fail("TREE_DUPLICATE_PROFILE_INVALID", group.join("|"));
    }
  }
  return { entries, files, directories, pathBytes,
    uniquePayloadIdentities: unique.size,
    uniquePayloadBytes: [...unique.values()].reduce((sum, size) => sum + size, 0) };
}

function validateReadme(bytes) {
  if (bytes.length !== 9_471 || sha256(bytes) !== README_SHA) {
    fail("README_PIN_MISMATCH");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const required = [
    "the latest 1,000-trajectory release",
    "the original 500-trajectory release",
    "2,084 available tools and 1,954 invoked tools",
    "full human audit",
    "tool call simulation, tool response simulation",
    "Fine-grained evaluation should still be performed on the **unsafe subset**",
  ];
  if (required.some((phrase) => !text.includes(phrase))) {
    fail("README_NARRATIVE_INVALID");
  }
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
  const payloads = new Map();
  for (const file of tree.files) {
    const relative = `files/${file.path}`;
    const bytes = readRegular(root, relative, MAX_SOURCE_FILE_BYTES, file.size);
    const payloadSha256 = sha256(bytes);
    if (file.lfsOid !== null && payloadSha256 !== `sha256:${file.lfsOid}`) {
      fail("LFS_PAYLOAD_HASH_MISMATCH", file.path);
    }
    entries.push({ path: relative, repositoryPath: file.path,
      bytes: bytes.length, sha256: payloadSha256,
      repositoryOid: file.oid,
      lfsSha256: file.lfsOid === null ? null : `sha256:${file.lfsOid}`,
      lfsBytes: file.lfsSize });
    payloads.set(file.path, bytes);
  }
  if (sha256(payloads.get(CURRENT_PATH)) !== CURRENT_SHA
    || sha256(payloads.get(LEGACY_PATH)) !== LEGACY_SHA
    || sha256(payloads.get(LEGACY_ROOT_PATH)) !== LEGACY_SHA) {
    fail("RELEASE_PAYLOAD_PIN_MISMATCH");
  }
  validateReadme(payloads.get("README.md"));
  for (const group of DUPLICATE_PATH_GROUPS) {
    const [first, ...rest] = group.map((sourcePath) => payloads.get(sourcePath));
    if (rest.some((bytes) => !first.equals(bytes))) {
      fail("DUPLICATE_PAYLOAD_MISMATCH", group.join("|"));
    }
  }
  const expected = [
    ...tree.files.map((entry) => `files/${entry.path}`),
    "metadata/dataset-record-after.json",
    "metadata/dataset-record-before.json",
    "metadata/full-tree-after.json",
    "metadata/full-tree-before.json",
    ...(withManifest ? ["source-manifest.json"] : []),
  ];
  if (!same(walk(root), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  return { root, record, tree, entries };
}

function manifestBody(entries) {
  const ordered = [...entries].sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    schema: "outsider/atbench-release-lineage-source-manifest/v1",
    datasetId: ATBENCH_DATASET_ID, revision: ATBENCH_REVISION,
    scope: ATBENCH_RELEASE_LINEAGE_SCOPE,
    entries: ordered,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, ordered),
  };
}

export function createAtbenchReleaseLineageSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected.entries);
  return deepFreeze({ ...body, sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, pathlib, re, sys

root = pathlib.Path(sys.argv[1])
current_path = root / 'files' / 'ATBench' / 'test.json'
legacy_path = root / 'files' / 'ATBench500' / 'test.json'
root_legacy_path = root / 'files' / 'test.json'

def die(code):
    raise RuntimeError('ATBENCH_RELEASE_LINEAGE_PYTHON_' + code)

def load(path):
    try:
        return json.loads(path.read_bytes().decode('utf-8'))
    except Exception:
        die('JSON_INVALID')

current = load(current_path)
legacy = load(legacy_path)
root_legacy = load(root_legacy_path)
if root_legacy != legacy:
    die('ROOT_LEGACY_DUPLICATE_INVALID')

patterns = {
 'email': re.compile(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'),
 'phone': re.compile(r'(?<!\d)(?:\+?1[-. ()]*)?\(?\d{3}\)?[-. ]\d{3}[-. ]\d{4}(?!\d)'),
 'ipv4': re.compile(r'(?<![\d.])(?:\d{1,3}\.){3}\d{1,3}(?![\d.])'),
 'pemLikeKeyHeader': re.compile(r'-----BEGIN [^-\r\n]{0,100}KEY-----', re.I),
 'awsAccessKeyId': re.compile(r'(?:AKIA|ASIA)[0-9A-Z]{16}'),
 'githubToken': re.compile(r'(?:ghp|github_pat)_[A-Za-z0-9_]{20,}'),
 'openaiKeyLike': re.compile(r'sk-(?:proj-)?[A-Za-z0-9_-]{20,}')}

def scan_release(value):
    privacy = collections.Counter()
    text_scalars = text_utf8_bytes = 0
    def scan(value):
        nonlocal text_scalars, text_utf8_bytes
        if isinstance(value, str):
            text_scalars += 1
            text_utf8_bytes += len(value.encode())
            for name, pattern in patterns.items():
                if name == 'ipv4':
                    candidates = pattern.findall(value)
                    privacy[name] += sum(all(int(part) <= 255 for part in item.split('.'))
                                         for item in candidates)
                else:
                    privacy[name] += len(pattern.findall(value))
        elif isinstance(value, list):
            for item in value: scan(item)
        elif isinstance(value, dict):
            for item in value.values(): scan(item)
    scan(value)
    for name in patterns: privacy[name] += 0
    return {'textScalars':text_scalars,'textUtf8Bytes':text_utf8_bytes,
            'patternCandidates':dict(sorted(privacy.items()))}

current_privacy = scan_release(current)
legacy_privacy = scan_release(legacy)
privacy = {name:current_privacy['patternCandidates'][name]
                + legacy_privacy['patternCandidates'][name]
           for name in patterns}

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'),
                      ensure_ascii=False).encode()

def replay(rows, release, content_key, id_key):
    if not isinstance(rows, list): die(release.upper() + '_ROOT_INVALID')
    labels = collections.Counter()
    taxonomies = {name: collections.Counter() for name in
                  ('risk_source','failure_mode','real_world_harm')}
    unsafe_taxonomies = {name: collections.Counter() for name in taxonomies}
    roles = collections.Counter()
    tool_key_profiles = collections.Counter()
    parameter_key_profiles = collections.Counter()
    tool_names = set()
    tool_documents = set()
    invoked_names = set()
    invoked_rows = complete_rows = complete_suffix_json_rows = 0
    complete_suffix_invalid_json_rows = action_error_shape_rows = 0
    action_argument_dict_rows = action_argument_string_rows = 0
    environment_status = collections.Counter()
    environment_key_profiles = collections.Counter()
    thought_types = collections.Counter()
    ids = set()
    signatures = set()
    ordered_shape = hashlib.sha256()
    turn_counts = []
    tool_definition_rows = 0
    for index, row in enumerate(rows):
        expected = ({'id','tool_used','contents','label','risk_source',
                     'failure_mode','real_world_harm','reason'} if release == 'current'
                    else {'conv_id','tool_used','content','label','risk_source',
                          'failure_mode','real_world_harm'})
        if not isinstance(row, dict) or set(row) != expected:
            die(release.upper() + '_ROW_SCHEMA_INVALID')
        identifier = row[id_key]
        if (release == 'current'
                and (not isinstance(identifier, int) or isinstance(identifier, bool))):
            die('CURRENT_ID_TYPE_INVALID')
        if release == 'legacy' and not isinstance(identifier, str):
            die('LEGACY_ID_TYPE_INVALID')
        if identifier in ids: die(release.upper() + '_ID_DUPLICATE')
        ids.add(identifier)
        label = row['label']
        if label not in (0,1): die(release.upper() + '_LABEL_INVALID')
        labels[label] += 1
        for name in taxonomies:
            value = row[name]
            if not isinstance(value, str): die(release.upper() + '_TAXONOMY_INVALID')
            taxonomies[name][value] += 1
            if label == 1: unsafe_taxonomies[name][value] += 1
        if release == 'current' and not isinstance(row['reason'], str):
            die('CURRENT_REASON_INVALID')
        tools = row['tool_used']
        if not isinstance(tools, list): die(release.upper() + '_TOOLS_INVALID')
        row_tool_names = set()
        for tool in tools:
            if not isinstance(tool, dict): die(release.upper() + '_TOOL_INVALID')
            keys = tuple(sorted(tool))
            tool_key_profiles[keys] += 1
            if (not isinstance(tool.get('name'), str)
                    or not isinstance(tool.get('description'), str)
                    or not isinstance(tool.get('parameters'), dict)):
                die(release.upper() + '_TOOL_FIELD_INVALID')
            parameter_key_profiles[tuple(sorted(tool['parameters']))] += 1
            tool_names.add(tool['name'])
            row_tool_names.add(tool['name'])
            tool_documents.add(canonical(tool))
            tool_definition_rows += 1
        wrapper = row[content_key]
        if (not isinstance(wrapper, list) or len(wrapper) != 1
                or not isinstance(wrapper[0], list)):
            die(release.upper() + '_CONTENT_WRAPPER_INVALID')
        turns = wrapper[0]
        turn_counts.append(len(turns))
        for turn in turns:
            if not isinstance(turn, dict) or turn.get('role') not in {
                    'user','agent','environment'}:
                die(release.upper() + '_TURN_INVALID')
            role = turn['role']
            roles[role] += 1
            if role in {'user','environment'}:
                if set(turn) != {'role','content'} or not isinstance(turn['content'], str):
                    die(release.upper() + '_CONTENT_TURN_INVALID')
                if role == 'environment':
                    try: decoded = json.loads(turn['content'])
                    except Exception: die(release.upper() + '_ENVIRONMENT_JSON_INVALID')
                    if not isinstance(decoded, dict):
                        die(release.upper() + '_ENVIRONMENT_TYPE_INVALID')
                    environment_key_profiles[tuple(sorted(decoded))] += 1
                    environment_status[str(decoded.get('status'))] += 1
            else:
                if set(turn) != {'role','thought','action'}:
                    die(release.upper() + '_AGENT_TURN_INVALID')
                thought_types[type(turn['thought']).__name__] += 1
                action = turn['action']
                if not isinstance(action, str): die(release.upper() + '_ACTION_INVALID')
                if action.startswith('Complete'):
                    complete_rows += 1
                    try:
                        decoded = json.loads(action[len('Complete'):])
                        if not isinstance(decoded, dict): raise ValueError()
                        complete_suffix_json_rows += 1
                    except Exception:
                        complete_suffix_invalid_json_rows += 1
                else:
                    try: decoded = json.loads(action)
                    except Exception: die(release.upper() + '_TOOL_ACTION_JSON_INVALID')
                    if not isinstance(decoded, dict) or not isinstance(decoded.get('name'), str):
                        die(release.upper() + '_TOOL_ACTION_INVALID')
                    invoked_rows += 1
                    invoked_names.add(decoded['name'])
                    if decoded['name'] not in row_tool_names:
                        die(release.upper() + '_INVOKED_TOOL_NOT_IN_ROW_POOL')
                    if set(decoded) == {'name','arguments'}:
                        if isinstance(decoded['arguments'], dict):
                            action_argument_dict_rows += 1
                        elif isinstance(decoded['arguments'], str):
                            action_argument_string_rows += 1
                        else: die(release.upper() + '_ARGUMENT_TYPE_INVALID')
                    elif set(decoded) == {'name','error'} and isinstance(decoded['error'], str):
                        action_error_shape_rows += 1
                    else: die(release.upper() + '_ACTION_SHAPE_INVALID')
        signature = canonical({
          'tool_used':row['tool_used'], 'content':row[content_key],
          'label':row['label'], 'risk_source':row['risk_source'],
          'failure_mode':row['failure_mode'],
          'real_world_harm':row['real_world_harm']})
        signatures.add(hashlib.sha256(signature).hexdigest())
        shape = canonical({'index':index,'idType':type(identifier).__name__,
                           'label':label,'turns':len(turns),'tools':len(tools),
                           'signature':hashlib.sha256(signature).hexdigest()})
        ordered_shape.update(len(shape).to_bytes(8,'big')); ordered_shape.update(shape)
    if not invoked_names.issubset(tool_names):
        die(release.upper() + '_INVOKED_TOOL_NOT_AVAILABLE')
    if release == 'current' and ids != set(range(1,1001)):
        die('CURRENT_ID_CENSUS_INVALID')
    return {
      'rows':len(rows),'ids':len(ids),'labels':{str(k):v for k,v in sorted(labels.items())},
      'taxonomyAllRows':{name:dict(sorted(counter.items()))
                         for name,counter in taxonomies.items()},
      'taxonomyUnsafeRows':{name:dict(sorted(counter.items()))
                            for name,counter in unsafe_taxonomies.items()},
      'turnRows':sum(roles.values()),'roleRows':dict(sorted(roles.items())),
      'turnsPerTrajectory':{'min':min(turn_counts),'max':max(turn_counts),
                            'sum':sum(turn_counts)},
      'toolDefinitionRows':tool_definition_rows,
      'uniqueAvailableToolNames':len(tool_names),
      'uniqueAvailableToolDocuments':len(tool_documents),
      'toolKeyProfiles':{'|'.join(keys):value
                         for keys,value in sorted(tool_key_profiles.items())},
      'parameterKeyProfiles':{'|'.join(keys):value
                              for keys,value in sorted(parameter_key_profiles.items())},
      'parsedToolActionRows':invoked_rows,
      'uniqueInvokedToolNames':len(invoked_names),
      'uniqueInvokedToolNamesCaseFolded':len({name.casefold() for name in invoked_names}),
      'invokedToolNamesAllPresentInAvailablePools':True,
      'completeActionRows':complete_rows,
      'completeSuffixJsonRows':complete_suffix_json_rows,
      'completeSuffixInvalidJsonRows':complete_suffix_invalid_json_rows,
      'actionArgumentDictRows':action_argument_dict_rows,
      'actionArgumentStringRows':action_argument_string_rows,
      'actionErrorShapeRows':action_error_shape_rows,
      'environmentFeedbackRows':roles['environment'],
      'environmentKeyProfiles':{'|'.join(keys):value
                                for keys,value in sorted(environment_key_profiles.items())},
      'environmentStatusValues':dict(sorted(environment_status.items())),
      'thoughtTypeRows':dict(sorted(thought_types.items())),
      'uniqueCanonicalRowSignatures':len(signatures),
      'canonicalRowSignatures':signatures,
      'orderedShapeRoot':'sha256:'+ordered_shape.hexdigest()}

current_result = replay(current, 'current', 'contents', 'id')
legacy_result = replay(legacy, 'legacy', 'content', 'conv_id')
if (current_result['rows'] != 1000 or current_result['ids'] != 1000
        or current_result['labels'] != {'0':503,'1':497}
        or current_result['turnRows'] != 9009
        or current_result['roleRows'] != {'agent':4492,'environment':2971,'user':1546}
        or current_result['toolDefinitionRows'] != 3156
        or current_result['uniqueAvailableToolNames'] != 2084
        or current_result['uniqueAvailableToolDocuments'] != 2390
        or current_result['parsedToolActionRows'] != 2972
        or current_result['uniqueInvokedToolNames'] != 1953
        or current_result['uniqueInvokedToolNamesCaseFolded'] != 1953
        or current_result['completeActionRows'] != 1520
        or current_result['completeSuffixJsonRows'] != 1520
        or current_result['completeSuffixInvalidJsonRows'] != 0
        or current_result['actionArgumentDictRows'] != 2966
        or current_result['actionArgumentStringRows'] != 6
        or current_result['actionErrorShapeRows'] != 0
        or current_result['thoughtTypeRows'] != {'NoneType':9,'str':4483}
        or current_result['orderedShapeRoot'] != 'sha256:6ec3d2791db35dad0af7ea15543b4bd2b0de0d8028bfcad7eb50465b21c241b4'):
    die('CURRENT_AGGREGATE_PROFILE_INVALID')
if (legacy_result['rows'] != 500 or legacy_result['ids'] != 500
        or legacy_result['labels'] != {'0':250,'1':250}
        or legacy_result['turnRows'] != 4486
        or legacy_result['roleRows'] != {'agent':2243,'environment':1743,'user':500}
        or legacy_result['toolDefinitionRows'] != 2157
        or legacy_result['uniqueAvailableToolNames'] != 1575
        or legacy_result['uniqueAvailableToolDocuments'] != 1756
        or legacy_result['parsedToolActionRows'] != 1743
        or legacy_result['uniqueInvokedToolNames'] != 1364
        or legacy_result['uniqueInvokedToolNamesCaseFolded'] != 1361
        or legacy_result['completeActionRows'] != 500
        or legacy_result['completeSuffixJsonRows'] != 480
        or legacy_result['completeSuffixInvalidJsonRows'] != 20
        or legacy_result['actionArgumentDictRows'] != 1742
        or legacy_result['actionArgumentStringRows'] != 0
        or legacy_result['actionErrorShapeRows'] != 1
        or legacy_result['thoughtTypeRows'] != {'str':2243}
        or legacy_result['orderedShapeRoot'] != 'sha256:3c06514552c77c6ddecd0caa6a86006e28d5d2733213374102b0dc4164735074'):
    die('LEGACY_AGGREGATE_PROFILE_INVALID')

overlap = len(current_result['canonicalRowSignatures']
              & legacy_result['canonicalRowSignatures'])
if overlap != 0: die('CROSS_RELEASE_SIGNATURE_OVERLAP_INVALID')
del current_result['canonicalRowSignatures']
del legacy_result['canonicalRowSignatures']

print(json.dumps({
 'current':current_result,'legacy':legacy_result,
 'currentLegacyCanonicalRowSignatureOverlap':overlap,
 'rootLegacyPhysicalDuplicateBytes':root_legacy_path.read_bytes() == legacy_path.read_bytes(),
 'privacyScanByRelease':{'current':current_privacy,'legacy':legacy_privacy},
 'logicalTextScalarsScanned':current_privacy['textScalars']+legacy_privacy['textScalars'],
 'logicalTextUtf8BytesScanned':current_privacy['textUtf8Bytes']+legacy_privacy['textUtf8Bytes'],
 'privacyPatternCandidates':dict(sorted(privacy.items())),
 'privacyPatternScanIsNotAnonymityProof':True,
 'downloadedToolDescriptionsCommandsArgumentsOrResponsesExecuted':False,
 'rawContentProjected':False,
}, sort_keys=True, separators=(',', ':')))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_ATBENCH_PYTHON ?? "/opt/anaconda3/bin/python";
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

export function buildAtbenchReleaseLineageArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected.entries);
  const sourceManifest = deepFreeze({ ...body,
    sourceManifestHash: digest(MANIFEST_DOMAIN, body) });
  const stored = readRegular(collected.root, "source-manifest.json",
    MAX_METADATA_BYTES);
  if (!serialize(sourceManifest).equals(stored)) fail("SOURCE_MANIFEST_MISMATCH");
  const replay = runReplay(collected.root, options.pythonExecutable);
  const reportBody = {
    schema: ATBENCH_RELEASE_LINEAGE_SCHEMA,
    disposition: ATBENCH_RELEASE_LINEAGE_DISPOSITION,
    scope: {
      kind: ATBENCH_RELEASE_LINEAGE_SCOPE,
      datasetId: ATBENCH_DATASET_ID, revision: ATBENCH_REVISION,
      completeFixedRevisionAcquired: true,
      completePublisherReleaseLineageAtRevision: true,
      currentReleaseRows: 1_000, legacyReleaseRows: 500,
      rootLegacyDuplicateRowsAddedAsPopulation: 0,
      crossReleaseSourceRecordRows: 1_500,
      crossReleaseUnderlyingExecutionUniqueRows: null,
      crossReleaseGlobalUniquenessClaimed: false,
    },
    source: {
      public: true, gated: false, disabled: false,
      lastModified: collected.record.lastModified,
      cardLicenseClaim: "Apache-2.0", licenseFilePresent: false,
      usedStorageBytes: collected.record.usedStorage,
      fixedTreeEntries: collected.tree.entries.length,
      fixedTreeFiles: collected.tree.files.length,
      fixedTreeDirectories: collected.tree.directories.length,
      fixedTreePathBytes: collected.tree.pathBytes,
      fixedTreeUniquePayloadIdentities: collected.tree.uniquePayloadIdentities,
      fixedTreeUniquePayloadBytes: collected.tree.uniquePayloadBytes,
      recordBeforeAfterExact: true, treeBeforeAfterExact: true,
      recordSnapshotBytes: collected.record.bytes,
      recordSnapshotSha256: collected.record.sha256,
      fixedTreeSha256: TREE_SHA,
      sourceManifestHash: sourceManifest.sourceManifestHash,
      sourceRoot: sourceManifest.sourceRoot,
    },
    lineage: {
      currentPath: CURRENT_PATH, currentBytes: CURRENT_BYTES,
      currentSha256: CURRENT_SHA, currentIsLfsPayload: true,
      legacyPath: LEGACY_PATH, legacyBytes: LEGACY_BYTES,
      legacySha256: LEGACY_SHA,
      legacyRootDuplicatePath: LEGACY_ROOT_PATH,
      legacyRootDuplicateByteExact: replay.rootLegacyPhysicalDuplicateBytes,
      repositoryPhysicalDuplicatePathGroups: DUPLICATE_PATH_GROUPS,
      currentLegacyCanonicalRowSignatureOverlap:
        replay.currentLegacyCanonicalRowSignatureOverlap,
      canonicalSignatureOverlapEstablishesUnderlyingExecutionUniqueness: false,
      currentAndLegacyAreDistinctPublisherReleaseRecords: true,
      rootDuplicateIsThirdReleasePopulation: false,
    },
    replay: {
      current: replay.current, legacy: replay.legacy,
      extractorSha256: sha256(BufferFrom(PYTHON_REPLAY, "utf8")),
      downloadedToolDescriptionsCommandsArgumentsOrResponsesExecuted: false,
      rawContentProjected: false,
    },
    documentationConsistency: {
      readmeBytes: 9_471, readmeSha256: README_SHA,
      currentReleaseTableClaimHalfOpenByteSpan: [1_883, 1_968],
      legacyReleaseTableClaimHalfOpenByteSpan: [1_969, 2_058],
      usedToolsDefinitionHalfOpenByteSpan: [2_145, 2_222],
      currentRepeatedToolClaimHalfOpenByteSpan: [3_628, 3_694],
      currentAvailableToolNamesDocumented: 2_084,
      currentAvailableToolNamesReplayed: replay.current.uniqueAvailableToolNames,
      currentInvokedToolNamesDocumented: 1_954,
      currentInvokedToolNamesReplayed: replay.current.uniqueInvokedToolNames,
      currentInvokedToolNamesCaseFolded:
        replay.current.uniqueInvokedToolNamesCaseFolded,
      currentDocumentedMinusReplayedInvokedToolNames: 1,
      completeActionIsNotAnAvailableOrInvokedToolName: true,
      currentClaimReproducedOnlyByAddingCompletePseudoAction: true,
      currentUniqueActionNamesIncludingCompletePseudoAction: 1_954,
      legacyAvailableToolNamesDocumented: 1_575,
      legacyAvailableToolNamesReplayed: replay.legacy.uniqueAvailableToolNames,
      legacyInvokedToolNamesDocumented: 1_357,
      legacyInvokedToolNamesReplayed: replay.legacy.uniqueInvokedToolNames,
      legacyInvokedToolNamesCaseFolded:
        replay.legacy.uniqueInvokedToolNamesCaseFolded,
      legacyReplayedMinusDocumentedInvokedToolNames: 7,
      legacyUniqueActionNamesIncludingCompletePseudoAction: 1_365,
      legacyClaimReproducedByExactNameCaseFoldOrCompleteCounting: false,
      publisherDocumentClaimsRetainedNotSilentlyCorrected: true,
    },
    provenance: {
      publisherDescribesTaxonomyGuidedSyntheticGeneration: true,
      publisherDescribesToolCallSimulation: true,
      publisherDescribesToolResponseSimulation: true,
      publisherClaimsCurrentReleaseFullHumanAudit: true,
      currentPublisherClaimedHumanAuditRows: 1_000,
      legacyFullHumanAuditClaimRows: 0,
      publisherNativeSafetyLabelRows: 1_500,
      currentLabelsHavePublisherHumanEvaluationClaim: true,
      legacyLabelsHavePublisherHumanAuditClaim: false,
      publisherHumanAuditDoesNotEstablishIndependentActionWitness: true,
      humanAuditorIndependenceEstablished: false,
    },
    execution: {
      publisherSyntheticTrajectoryRows: 1_500,
      parsedSyntheticToolActionRows:
        replay.current.parsedToolActionRows + replay.legacy.parsedToolActionRows,
      simulatedEnvironmentFeedbackRows:
        replay.current.environmentFeedbackRows + replay.legacy.environmentFeedbackRows,
      verifiedExternalToolExecutionRows: 0,
      independentlyReceiptedExecutionRows: 0,
      physicalWorldExecutionRows: 0,
      downloadedActiveContentExecuted: false,
    },
    outcome: {
      publisherNativeTrajectorySafetyLabelRows: 1_500,
      currentSafeLabelRows: 503, currentUnsafeLabelRows: 497,
      legacySafeLabelRows: 250, legacyUnsafeLabelRows: 250,
      taxonomyLabelsAreNotObservedRealWorldEffects: true,
      environmentSuccessStringsPromotedToOutcome: false,
      completeActionsPromotedToOutcome: false,
      independentlyWitnessedActionOutcomeRows: 0,
      independentlyVerifiedExternalOutcomeRows: 0,
      completeExternalAttemptCensusRows: 0,
    },
    recovery: {
      completeActionsPromotedToRecovery: false,
      environmentErrorThenSuccessMorphologyPromotedToRecovery: false,
      publisherNativeRecoveryLabelRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      longitudinalRecoveryRows: 0,
    },
    privacy: {
      syntheticPersonalDataClaimDoesNotEstablishNoPii: true,
      logicalCurrentAndLegacyPayloadsScannedOnce: true,
      rootLegacyDuplicateExcludedFromPatternAddition: true,
      logicalTextScalarsScanned: replay.logicalTextScalarsScanned,
      logicalTextUtf8BytesScanned: replay.logicalTextUtf8BytesScanned,
      patternCandidatesByRelease: replay.privacyScanByRelease,
      patternCandidates: replay.privacyPatternCandidates,
      patternScanIsNotAnonymityProof: true,
      independentPrivacyAuditRows: 0,
      noPiiOrSecretGuaranteed: false,
      rawVisualFiles: 10, visualPrivacyReviewPerformed: false,
      rawSourcePrivate: true, rawProjectionRows: 0,
    },
    safety: {
      toolDescriptionsCommandsArgumentsAndResponsesAreActiveContent: true,
      syntheticUnsafeTrajectoryRows: 747,
      harmfulOrDualUsePayloadRiskPresent: true,
      rawDataSafeToExecute: false,
      rawContentProjected: false,
    },
    rights: {
      cardLicenseClaim: "Apache-2.0",
      repositoryLicenseFilePresent: false,
      cardLicenseClaimTreatedAsTrainingAuthorization: false,
      useSpecificTrainingAuthorizationEstablished: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
      legalConclusionEstablished: false,
    },
    denominators: {
      CURRENT_PUBLISHER_SYNTHETIC_TRAJECTORY: 1_000,
      LEGACY_PUBLISHER_SYNTHETIC_TRAJECTORY: 500,
      PUBLISHER_NATIVE_SAFETY_LABEL: 1_500,
      INDEPENDENTLY_WITNESSED_ACTION_OUTCOME: 0,
      crossReleaseUnderlyingExecutionTotal: null,
      rootDuplicateAdditionProhibited: true,
    },
    boundary: {
      independentOutcomeRows: 0, independentRecoveryRows: 0,
      verifiedExternalExecutionRows: 0, verifiedPhysicalEffectRows: 0,
      completeExternalAttemptCensusRows: 0,
      authorizedTrainingRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      authorityRows: 0, ceuRows: 0, actorCreditRows: 0,
      autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createAtbenchReleaseLineageReceipt(
  report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: ATBENCH_RELEASE_LINEAGE_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    disposition: ATBENCH_RELEASE_LINEAGE_DISPOSITION,
    scope: ATBENCH_RELEASE_LINEAGE_SCOPE,
    currentReleaseRows: 1_000, legacyReleaseRows: 500,
    rootDuplicateRowsAdded: 0,
    independentlyWitnessedActionOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0,
    authorizedTrainingRows: 0, offlineTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyAtbenchReleaseLineageArtifactDirectory(
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
    const built = buildAtbenchReleaseLineageArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!expectedReport.equals(reportBytes)) fail("REPORT_SOURCE_REPLAY_MISMATCH");
    const manifestBytes = readRegular(root, "source/source-manifest.json",
      MAX_METADATA_BYTES);
    const receipt = createAtbenchReleaseLineageReceipt(
      built.report, expectedReport, manifestBytes);
    if (!serialize(receipt).equals(receiptBytes)) fail("RECEIPT_SOURCE_REPLAY_MISMATCH");
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeAtbenchReleaseLineageArtifact(value) {
  return serialize(value);
}
