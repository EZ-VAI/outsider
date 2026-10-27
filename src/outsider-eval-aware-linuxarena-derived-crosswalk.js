/*
 * Complete fixed-revision replay of eval-aware/linuxarena-trajectories plus a
 * self-contained crosswalk to Outsider's pinned 200-row Haiku-honest raw run.
 *
 * All trajectory strings and commands are inert data.  Raw/derived identity,
 * task-instance overlap, publisher labels, and selection scope remain separate.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";
import { verifyLinuxArenaHaikuHonestArtifactDirectory } from
  "./outsider-linuxarena-haiku-honest-run.js";

export const EVAL_AWARE_LINUXARENA_SCHEMA =
  "outsider/eval-aware-linuxarena-derived-crosswalk/v1";
export const EVAL_AWARE_LINUXARENA_RECEIPT_SCHEMA =
  "outsider/eval-aware-linuxarena-derived-crosswalk-receipt/v1";
export const EVAL_AWARE_LINUXARENA_DATASET_ID =
  "eval-aware/linuxarena-trajectories";
export const EVAL_AWARE_LINUXARENA_HISTORICAL_ALIAS =
  "guychuk/linuxarena-trajectories";
export const EVAL_AWARE_LINUXARENA_REVISION =
  "45641faf10b7cc1645036c2cddfb9a77323494e1";
export const EVAL_AWARE_LINUXARENA_SCOPE =
  "COMPLETE_PUBLISHED_DERIVED_CORPUS_WITH_RAW200_CROSSWALK";
export const EVAL_AWARE_LINUXARENA_DISPOSITION = "QUARANTINE_EVAL_ONLY";

const REPORT_DOMAIN = `${EVAL_AWARE_LINUXARENA_SCHEMA}/report`;
const RECEIPT_DOMAIN = `${EVAL_AWARE_LINUXARENA_RECEIPT_SCHEMA}/receipt`;
const MANIFEST_DOMAIN = `${EVAL_AWARE_LINUXARENA_SCHEMA}/source-manifest`;
const SOURCE_ROOT_DOMAIN = `${EVAL_AWARE_LINUXARENA_SCHEMA}/source-root`;
const RECORD_SHA =
  "sha256:99492c02ef234a8a2e7eface3f2247efda49dd4d2e236736901a437797c97ea5";
const TREE_SHA =
  "sha256:7485d43bf2dbd7f8cc10abd57da39cf75f73f5ef00e568f997b8fdb2bb911adb";
const README_SHA =
  "sha256:bd2d126fde35a17431914acafded2cb8a00cc9be096f9d5ee05bfc485b19fbb0";
const GITATTRIBUTES_SHA =
  "sha256:9e75dd981de037ec3769f24f790e126bc5a160b6871f510214e68dc70649aeeb";
const PARQUET_SHA =
  "sha256:4af875ba6b3b8cf7be5e40c42b0f94c724e42f8b367b7c8647d87bcc8d27054d";
const RAW_ARTIFACT_HASH =
  "sha256:091b07503d9937eaa76dfb4d73ceb3006ad4dab9b6bfab41db290c602caa3b67";
const RAW_SELECTED_SHA =
  "sha256:b5c7201e75f08a597db187d535be7c20d71df1693aec6885606e4ef8bfb99787";
const HASH = /^sha256:[a-f0-9]{64}$/u;
const SHA1 = /^[a-f0-9]{40}$/u;
const MAX_SMALL_BYTES = 8 * 1024 * 1024;
const MAX_LARGE_BYTES = 140 * 1024 * 1024;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const PARQUET_PATH = "files/data/train-00000-of-00001.parquet";
const RAW_ARTIFACT_PREFIX = "crosswalk/linuxarena-haiku-honest-artifact";

const RAW_ARTIFACT_FILES = Object.freeze([
  "report.json",
  "run-receipt.json",
  "source/boundary/line201-prefix.bin",
  "source/metadata/boundary-range-response.json",
  "source/metadata/dataset-record-after.json",
  "source/metadata/dataset-record-before.json",
  "source/metadata/full-tree-after.json",
  "source/metadata/full-tree-before.json",
  "source/metadata/honest-range-response.json",
  "source/selection/haiku-honest.jsonl",
  "source/source-manifest.json",
  "source/support/README.md",
  "source/support/croissant.json",
  "source/support/croissant_rai.json",
  "source/support/manifest.json",
  "source/support/scripts/build_sample.py",
]);

const EXPECTED_SOURCE_FILES = Object.freeze([
  "files/.gitattributes",
  "files/README.md",
  PARQUET_PATH,
  "metadata/alias-record-after.json",
  "metadata/alias-record-before.json",
  "metadata/dataset-record-after.json",
  "metadata/dataset-record-before.json",
  "metadata/full-tree-after.json",
  "metadata/full-tree-before.json",
  ...RAW_ARTIFACT_FILES.map((relative) => `${RAW_ARTIFACT_PREFIX}/${relative}`),
].sort());

function fail(code, detail = null) {
  throw new Error(detail === null ? `EVAL_AWARE_LINUXARENA_${code}`
    : `EVAL_AWARE_LINUXARENA_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function digest(domain, value) {
  return sha256(Buffer.from(`${domain}\0${canonicalizeStrict(value)}`, "utf8"));
}

function serialize(value) {
  return Buffer.from(`${canonicalizeStrict(value)}\n`, "utf8");
}

function same(left, right) {
  return canonicalizeStrict(left) === canonicalizeStrict(right);
}

function sorted(values) {
  return [...values].sort((left, right) => left.localeCompare(right));
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function parseJson(bytes, code) {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch { fail(code); }
}

function safeRelative(value) {
  if (typeof value !== "string" || value.length === 0 || value.startsWith("/")
    || value.includes("\\") || value.split("/").some((part) =>
      ["", ".", ".."].includes(part)) || path.posix.normalize(value) !== value) {
    fail("PATH_INVALID", String(value));
  }
  return value;
}

function checkedPath(root, relative) {
  safeRelative(relative);
  const base = path.resolve(root);
  const target = path.resolve(base, relative);
  const relation = path.relative(base, target);
  if (relation === "" || relation === ".." || relation.startsWith(`..${path.sep}`)
    || path.isAbsolute(relation)) fail("PATH_ESCAPE", relative);
  return target;
}

function inspectRegular(root, relative, maximumBytes, exactBytes = null,
  expectedSha256 = null) {
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
    const hash = createHash("sha256");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0;
    for (;;) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      hash.update(buffer.subarray(0, count));
      total += count;
    }
    const after = fstatSync(descriptor, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino
      || before.size !== after.size || before.mode !== after.mode
      || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
      || BigInt(total) !== after.size) fail("FILE_CHANGED_DURING_READ", relative);
    const fileSha256 = `sha256:${hash.digest("hex")}`;
    if (expectedSha256 !== null && fileSha256 !== expectedSha256) {
      fail("FILE_HASH_INVALID", relative);
    }
    return { path: relative, bytes: total, sha256: fileSha256 };
  } finally { closeSync(descriptor); }
}

function readSmall(root, relative, exactBytes = null, expectedSha256 = null) {
  const inspected = inspectRegular(root, relative, MAX_SMALL_BYTES,
    exactBytes, expectedSha256);
  return { ...inspected, contents: readFileSync(checkedPath(root, relative)) };
}

function walk(root, prefix = "") {
  const directory = prefix === "" ? path.resolve(root) : checkedPath(root, prefix);
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

function validateRecord(bytes) {
  if (sha256(bytes) !== RECORD_SHA || bytes.length !== 1_661) {
    fail("RECORD_PIN_MISMATCH");
  }
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, license: value.cardData?.license,
  };
  if (!same(projection, {
    id: EVAL_AWARE_LINUXARENA_DATASET_ID, author: "eval-aware",
    sha: EVAL_AWARE_LINUXARENA_REVISION,
    lastModified: "2026-03-28T14:17:55.000Z",
    private: false, gated: false, disabled: false,
    usedStorage: 123_656_922, license: "mit",
  })) fail("RECORD_PROFILE_INVALID");
  return projection;
}

function validateTree(bytes) {
  if (sha256(bytes) !== TREE_SHA || bytes.length !== 609) fail("TREE_PIN_MISMATCH");
  const entries = parseJson(bytes, "TREE_JSON_INVALID");
  if (!Array.isArray(entries) || entries.length !== 4) fail("TREE_INVALID");
  const files = entries.filter((entry) => entry.type === "file")
    .sort((left, right) => left.path.localeCompare(right.path));
  const directories = entries.filter((entry) => entry.type === "directory");
  if (files.length !== 3 || directories.length !== 1
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 123_664_935
    || !same(files.map((entry) => ({ path: entry.path, size: entry.size,
      oid: entry.oid, lfsOid: entry.lfs?.oid ?? null,
      lfsSize: entry.lfs?.size ?? null, xetHash: entry.xetHash ?? null })), [
      { path: ".gitattributes", size: 2_504,
        oid: "bed0738c7eeb449bca98b5d2f33c89a1ee56349a", lfsOid: null,
        lfsSize: null, xetHash: null },
      { path: "data/train-00000-of-00001.parquet", size: 123_656_922,
        oid: "e6ca9055bd57223e5f478a81a013371305d54461",
        lfsOid: PARQUET_SHA.slice("sha256:".length), lfsSize: 123_656_922,
        xetHash: "d4afa805ae5c1d135d26bab18a0e4134e13f559bb16a02e770f9deecb3ae3143" },
      { path: "README.md", size: 5_509,
        oid: "bfb87116f9fec52e02bab5d0e9c1fd185a0eca31", lfsOid: null,
        lfsSize: null, xetHash: null },
    ]) || files.some((entry) => /^LICENSE(?:\.|$)/u.test(entry.path))) {
    fail("TREE_PROFILE_INVALID");
  }
  return { entries, files, directories };
}

function validateReadme(bytes) {
  if (bytes.length !== 5_509 || sha256(bytes) !== README_SHA) {
    fail("README_PIN_MISMATCH");
  }
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const required = [
    "**Full** agent trajectories", "Total trajectories | 775",
    "Total actions | 49,817", "honest (421), attack (316), claude-code (38)",
    "action_output", "truncated to 8000 chars",
    "guychuk/linuxarena-trajectories", "linuxbench.ai/data/trajs",
  ];
  if (required.some((phrase) => !text.includes(phrase))) fail("README_PROFILE_INVALID");
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const recordBefore = readSmall(root, "metadata/dataset-record-before.json",
    1_661, RECORD_SHA);
  const recordAfter = readSmall(root, "metadata/dataset-record-after.json",
    1_661, RECORD_SHA);
  const aliasBefore = readSmall(root, "metadata/alias-record-before.json",
    1_661, RECORD_SHA);
  const aliasAfter = readSmall(root, "metadata/alias-record-after.json",
    1_661, RECORD_SHA);
  const treeBefore = readSmall(root, "metadata/full-tree-before.json", 609, TREE_SHA);
  const treeAfter = readSmall(root, "metadata/full-tree-after.json", 609, TREE_SHA);
  if (!recordBefore.contents.equals(recordAfter.contents)
    || !recordBefore.contents.equals(aliasBefore.contents)
    || !recordBefore.contents.equals(aliasAfter.contents)
    || !treeBefore.contents.equals(treeAfter.contents)) fail("SOURCE_BRACKET_CHANGED");
  const record = validateRecord(recordBefore.contents);
  const tree = validateTree(treeBefore.contents);
  const readme = readSmall(root, "files/README.md", 5_509, README_SHA);
  validateReadme(readme.contents);
  const gitattributes = inspectRegular(root, "files/.gitattributes",
    MAX_SMALL_BYTES, 2_504, GITATTRIBUTES_SHA);
  const parquet = inspectRegular(root, PARQUET_PATH, MAX_LARGE_BYTES,
    123_656_922, PARQUET_SHA);
  const rawRoot = checkedPath(root, RAW_ARTIFACT_PREFIX);
  const raw = verifyLinuxArenaHaikuHonestArtifactDirectory(rawRoot);
  if (!raw.ok || raw.report.artifactHash !== RAW_ARTIFACT_HASH
    || raw.report.source.selectedRangeFileSha256 !== RAW_SELECTED_SHA
    || raw.report.replay.selectedRows !== 200) {
    fail("RAW_ARTIFACT_REPLAY_INVALID", raw.error ?? raw.report?.artifactHash);
  }
  const descriptors = [recordBefore, recordAfter, aliasBefore, aliasAfter,
    treeBefore, treeAfter, readme, gitattributes, parquet].map(({ path: itemPath,
    bytes, sha256: itemSha }) => ({ path: itemPath, bytes, sha256: itemSha }));
  for (const relative of RAW_ARTIFACT_FILES) {
    descriptors.push(inspectRegular(root, `${RAW_ARTIFACT_PREFIX}/${relative}`,
      MAX_LARGE_BYTES));
  }
  descriptors.sort((left, right) => left.path.localeCompare(right.path));
  const expected = [...EXPECTED_SOURCE_FILES,
    ...(withManifest ? ["source-manifest.json"] : [])];
  if (!same(sorted(walk(root)), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  return { root, record, tree, descriptors, raw };
}

function manifestBody(collected) {
  return {
    schema: "outsider/eval-aware-linuxarena-derived-crosswalk-source/v1",
    datasetId: EVAL_AWARE_LINUXARENA_DATASET_ID,
    historicalAlias: EVAL_AWARE_LINUXARENA_HISTORICAL_ALIAS,
    revision: EVAL_AWARE_LINUXARENA_REVISION,
    scope: EVAL_AWARE_LINUXARENA_SCOPE,
    derivedRepositoryFiles: 3, derivedRepositoryBytes: 123_664_935,
    nestedRawArtifactFiles: RAW_ARTIFACT_FILES.length,
    recordBeforeAfterExact: true, aliasRecordBeforeAfterExact: true,
    aliasRecordEqualsCurrentRecord: true, treeBeforeAfterExact: true,
    sourceObjects: collected.descriptors,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, collected.descriptors),
  };
}

export function createEvalAwareLinuxArenaSourceManifestFromDirectory(
  sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, hashlib, json, math, pathlib, re, sys
import pyarrow.parquet as pq

parquet_path = pathlib.Path(sys.argv[1])
raw_path = pathlib.Path(sys.argv[2])

def die(code): raise RuntimeError('EVAL_AWARE_LINUXARENA_PYTHON_' + code)
def canonical(value): return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def sha(value): return 'sha256:' + hashlib.sha256(value).hexdigest()
def leaves(value):
    if isinstance(value,str): yield value
    elif isinstance(value,dict):
        for child in value.values(): yield from leaves(child)
    elif isinstance(value,list):
        for child in value: yield from leaves(child)

raw_rows=[]
with raw_path.open('r',encoding='utf-8') as handle:
    for line in handle:
        raw_rows.append(json.loads(line))
if len(raw_rows)!=200 or len({r['trajectory_id'] for r in raw_rows})!=200:
    die('RAW_PROFILE_INVALID')
raw_by_id={r['trajectory_id']:r for r in raw_rows}
raw_task_lookup=collections.defaultdict(list)
for raw in raw_rows:
    for kind in ('id','name'):
        value=raw['main_task'].get(kind)
        if isinstance(value,str):
            raw_task_lookup[(raw['environment']['id'],value)].append((raw,kind))

p=pq.ParquetFile(parquet_path)
expected_columns=['trajectory_id','dataset','source_file','json_path','run_id','run_name',
 'model','model_short','policy','environment','environment_display',
 'environment_description','main_task','task_category','task_description','side_task',
 'side_task_description','main_task_success','side_task_success','has_side_task',
 'number_of_actions','cost_usd','scorer_explanation','first5_l1_pattern',
 'first5_l2_pattern','first5_files_accessed','all_files_accessed','action_functions',
 'action_arguments_json','action_normalized','action_exact','action_file_accessed',
 'action_output','action_output_error','action_has_error','action_reasoning']
if (p.metadata.num_rows!=775 or p.metadata.num_row_groups!=2
    or [p.metadata.row_group(i).num_rows for i in range(2)]!=[579,196]
    or p.schema_arrow.names!=expected_columns
    or sha(str(p.schema_arrow).encode())!='sha256:b9ad20e46f63edc079ff524fe34df42ed684be78705366831efb74a0b6a958cf'):
    die('PARQUET_PROFILE_INVALID')

patterns={
 'email':re.compile(r"(?<![\w.+-])[A-Za-z0-9.!#$%&'*+/=?^_\x60{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?![\w.-])"),
 'phone':re.compile(r'(?<!\d)(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]\d{3}[ .-]\d{4}(?!\d)'),
 'ipv4':re.compile(r'(?<!\d)(?:\d{1,3}\.){3}\d{1,3}(?!\d)'),
 'privateKeyHeader':re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
 'awsAccessKey':re.compile(r'\b(?:AKIA|ASIA)[A-Z0-9]{16}\b'),
 'githubToken':re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b'),
 'openaiKey':re.compile(r'\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b'),
 'mongoUri':re.compile(r"mongodb(?:\+srv)?://[^\s\"']+",re.I),
 'instanceId':re.compile(r'\bi-[0-9a-f]{8,17}\b',re.I)}
privacy={name:{'occurrences':0,'rows':0} for name in patterns}

policy=collections.Counter(); models=collections.Counter(); environments=collections.Counter()
datasets=collections.Counter(); main_success=collections.Counter(); side_success=collections.Counter()
has_side=collections.Counter(); functions=collections.Counter(); normalized=collections.Counter()
policy_profiles=collections.defaultdict(lambda:collections.Counter())
run_profiles=collections.defaultdict(lambda:{'rows':0,'runIds':set(),'models':set(),
 'policies':set(),'environments':set(),'taskInstances':set(),'mainSuccessTrue':0,
 'sideSuccessTrue':0,'actions':0})
derived_ids=set(); row_hashes=[]; action_hashes=[]; costs=[]
environment_tasks=set(); main_task_strings=set(); total_actions=0
min_actions=None; max_actions=0; zero_actions=0; invalid_args=0
has_error_actions=0; nonempty_error_actions=0; traces_with_error=0
traces_error_then_nonerror=0; output_8034=0; output_8035=0; output_max=0
source_file_identity=json_path_identity=dataset_run_identity=0
first5_l1=first5_l2=first5_files=all_files=error_flags=0
side_task_nonempty=side_description_nonempty=scorer_nonempty=0
task_pairs=[]; task_pair_counts=collections.Counter(); raw_kind=collections.Counter()
label_pairs=collections.Counter(); main_label_equal=side_label_equal=0
action_count_equal=function_equal=argument_equal=output_equal=error_equal=reasoning_equal=0
exact_action_hash_equal=0; honest_pairs=[]; direct_intersection=0; ambiguous=0

for batch in p.iter_batches(batch_size=32):
  for row in batch.to_pylist():
    if set(row)!=set(expected_columns) or any(row[name] is None for name in expected_columns):
        die('ROW_SCHEMA_OR_NULL_INVALID')
    tid=row['trajectory_id']
    if tid in derived_ids: die('TRAJECTORY_ID_DUPLICATE')
    derived_ids.add(tid); direct_intersection += tid in raw_by_id
    n=row['number_of_actions']; total_actions+=n
    min_actions=n if min_actions is None else min(min_actions,n); max_actions=max(max_actions,n)
    zero_actions += n==0
    list_fields=['action_functions','action_arguments_json','action_normalized','action_exact',
      'action_file_accessed','action_output','action_output_error','action_has_error',
      'action_reasoning']
    if any(not isinstance(row[name],list) or len(row[name])!=n for name in list_fields):
        die('PARALLEL_ACTION_LIST_INVALID')
    parsed_args=[]
    for value in row['action_arguments_json']:
        try: parsed_args.append(json.loads(value))
        except Exception: invalid_args+=1
    functions.update(row['action_functions']); normalized.update(row['action_normalized'])
    flags=row['action_has_error']; errors=row['action_output_error']
    has_error_actions+=sum(bool(v) for v in flags)
    nonempty_error_actions+=sum(bool(v) for v in errors)
    if any(flags):
        traces_with_error+=1; first=next(i for i,v in enumerate(flags) if v)
        traces_error_then_nonerror+=any(not v for v in flags[first+1:])
    error_flags+=all(bool(a)==bool(b) for a,b in zip(errors,flags))
    lengths=[len(v) for v in row['action_output']]
    output_8034+=sum(v==8034 for v in lengths); output_8035+=sum(v==8035 for v in lengths)
    output_max=max(output_max,max(lengths,default=0))
    source_file_identity += row['source_file']==tid+'.json'
    json_path_identity += row['json_path']==f"data/{row['dataset']}/trajectories/{row['source_file']}"
    dataset_run_identity += row['dataset']==row['run_name']
    first5_l1 += row['first5_l1_pattern']==' -> '.join(row['action_normalized'][:5])
    first5_l2 += row['first5_l2_pattern']==' -> '.join(row['action_exact'][:5])
    ff=[]
    for value in row['action_file_accessed'][:5]:
        if value and value not in ff: ff.append(value)
    first5_files += row['first5_files_accessed']==ff
    af=[]
    for value in row['action_file_accessed']:
        if value and value not in af: af.append(value)
    all_files += row['all_files_accessed']==af
    side_task_nonempty+=bool(row['side_task']); side_description_nonempty+=bool(row['side_task_description'])
    scorer_nonempty+=bool(row['scorer_explanation'])
    policy[row['policy']]+=1; models[row['model_short']]+=1; environments[row['environment']]+=1
    datasets[row['dataset']]+=1; main_success[str(row['main_task_success']).lower()]+=1
    side_success[str(row['side_task_success']).lower()]+=1; has_side[str(row['has_side_task']).lower()]+=1
    pp=policy_profiles[row['policy']]; pp['rows']+=1; pp['actions']+=n
    pp['mainSuccessTrue']+=row['main_task_success']; pp['mainSuccessFalse']+=not row['main_task_success']
    pp['sideSuccessTrue']+=row['side_task_success']; pp['sideSuccessFalse']+=not row['side_task_success']
    pp['hasSideTaskTrue']+=row['has_side_task']
    rp=run_profiles[row['dataset']]; rp['rows']+=1; rp['runIds'].add(row['run_id'])
    rp['models'].add(row['model_short']); rp['policies'].add(row['policy'])
    rp['environments'].add(row['environment']); rp['taskInstances'].add((row['environment'],row['main_task']))
    rp['mainSuccessTrue']+=row['main_task_success']; rp['sideSuccessTrue']+=row['side_task_success']; rp['actions']+=n
    environment_tasks.add((row['environment'],row['main_task'])); main_task_strings.add(row['main_task'])
    costs.append(row['cost_usd'])
    row_hashes.append(hashlib.sha256(canonical(row).encode()).hexdigest())
    action_hashes.append(hashlib.sha256(canonical({key:row[key] for key in
      ['trajectory_id','number_of_actions','action_functions','action_arguments_json',
       'action_output','action_output_error','action_reasoning']}).encode()).hexdigest())
    surface='\n'.join(leaves(row))
    for name,pattern in patterns.items():
        matches=pattern.findall(surface)
        if name=='ipv4':
            matches=[value for value in matches if all(0<=int(part)<=255 for part in value.split('.'))]
        privacy[name]['occurrences']+=len(matches); privacy[name]['rows']+=bool(matches)
    candidates=raw_task_lookup.get((row['environment'],row['main_task']),[])
    unique={item[0]['trajectory_id']:item for item in candidates}
    ambiguous+=len(unique)>1
    if len(unique)==1:
        raw,kind=next(iter(unique.values())); raw_kind[kind]+=1
        raw_actions=raw['actions']; raw_functions=[a['function'] for a in raw_actions]
        raw_args=[a['arguments'] for a in raw_actions]; raw_outputs=[a['output'] for a in raw_actions]
        raw_errors=[a['output_error'] for a in raw_actions]
        raw_reasoning=[a['agent_reasoning'] for a in raw_actions]
        main_eq=row['main_task_success']==raw['main_task_success']; side_eq=row['side_task_success']==raw['side_task_success']
        count_eq=n==len(raw_actions); function_equal+=row['action_functions']==raw_functions
        argument_equal+=parsed_args==raw_args; output_equal+=row['action_output']==raw_outputs
        error_equal+=row['action_output_error']==raw_errors; reasoning_equal+=row['action_reasoning']==raw_reasoning
        action_count_equal+=count_eq; main_label_equal+=main_eq; side_label_equal+=side_eq
        raw_action={'functions':raw_functions,'arguments':raw_args,'outputs':raw_outputs,
                    'errors':raw_errors,'reasoning':raw_reasoning}
        derived_action={'functions':row['action_functions'],'arguments':parsed_args,
          'outputs':row['action_output'],'errors':row['action_output_error'],
          'reasoning':row['action_reasoning']}
        hashes_equal=hashlib.sha256(canonical(raw_action).encode()).digest()==hashlib.sha256(canonical(derived_action).encode()).digest()
        exact_action_hash_equal+=hashes_equal
        pair=(tid,raw['trajectory_id'],kind); task_pairs.append(pair); task_pair_counts[row['dataset']]+=1
        label_pairs[f"raw_{str(raw['main_task_success']).lower()}__derived_{str(row['main_task_success']).lower()}"]+=1
        if row['dataset']=='50-task-set-honest-haiku':
            honest_pairs.append((row['run_id'],main_eq,hashes_equal,
              str(raw['main_task_success']).lower(),str(row['main_task_success']).lower()))

aggregate_checks=[
 ('uniqueTrajectoryIds',len(derived_ids)==775),('totalActions',total_actions==49817),
 ('minimumActions',min_actions==0),('maximumActions',max_actions==192),
 ('zeroActionRows',zero_actions==1),('invalidArguments',invalid_args==0),
 ('directTrajectoryIntersection',direct_intersection==0),
 ('policyRows',policy==collections.Counter({'honest':421,'attack':316,'claude-code':38})),
 ('mainSuccessRows',main_success==collections.Counter({'false':495,'true':280})),
 ('sideSuccessRows',side_success==collections.Counter({'false':616,'true':159})),
 ('hasSideRows',has_side==collections.Counter({'false':459,'true':316})),
 ('uniqueFunctions',len(functions)==38),('uniqueNormalizedActions',len(normalized)==66),
 ('hasErrorActions',has_error_actions==1666),
 ('nonemptyErrorActions',nonempty_error_actions==1666),
 ('tracesWithError',traces_with_error==481),
 ('errorThenNonerror',traces_error_then_nonerror==481),
 ('outputLength8034',output_8034==839),('outputLength8035',output_8035==1780),
 ('maximumOutputLength',output_max==8035),('sourceFileIdentity',source_file_identity==775),
 ('jsonPathIdentity',json_path_identity==775),('datasetRunIdentity',dataset_run_identity==775),
 ('first5L1',first5_l1==775),('first5L2',first5_l2==775),
 ('first5Files',first5_files==775),('allFiles',all_files==775),
 ('errorFlags',error_flags==775),('sideTaskNonempty',side_task_nonempty==316),
 ('sideDescriptionNonempty',side_description_nonempty==0),('scorerNonempty',scorer_nonempty==775),
 ('taskPairs',len(task_pairs)==135),('uniqueRawTasks',len({pair[1] for pair in task_pairs})==89),
 ('ambiguousTaskMatches',ambiguous==0),('mainLabelEqual',main_label_equal==93),
 ('sideLabelEqual',side_label_equal==115),('actionCountEqual',action_count_equal==0),
 ('functionSequenceEqual',function_equal==0),('argumentSequenceEqual',argument_equal==0),
 ('outputSequenceEqual',output_equal==0),('errorSequenceEqual',error_equal==0),
 ('reasoningSequenceEqual',reasoning_equal==0),('actionHashEqual',exact_action_hash_equal==0)]
failed_checks=[name for name,passed in aggregate_checks if not passed]
if failed_checks: die('AGGREGATE_PROFILE_INVALID_'+'_'.join(failed_checks))
if privacy!={'email':{'occurrences':9922,'rows':438},'phone':{'occurrences':2,'rows':1},
 'ipv4':{'occurrences':9545,'rows':445},'privateKeyHeader':{'occurrences':0,'rows':0},
 'awsAccessKey':{'occurrences':33,'rows':8},'githubToken':{'occurrences':19,'rows':7},
 'openaiKey':{'occurrences':0,'rows':0},'mongoUri':{'occurrences':0,'rows':0},
 'instanceId':{'occurrences':0,'rows':0}}:
    die('PRIVACY_PROFILE_INVALID')

run_output={}
for name,value in sorted(run_profiles.items()):
    run_output[name]={'rows':value['rows'],'runIds':sorted(value['runIds']),
      'models':sorted(value['models']),'policies':sorted(value['policies']),
      'environments':len(value['environments']),'taskInstances':len(value['taskInstances']),
      'mainSuccessTrue':value['mainSuccessTrue'],'sideSuccessTrue':value['sideSuccessTrue'],
      'actions':value['actions']}
pair_root=sha('\n'.join('\0'.join(pair) for pair in sorted(task_pairs)).encode())
if pair_root!='sha256:85ef02c1bd94f9c812f1f265fa33ed726f51183cee65cfe54f0f413171c1617e':
    die('PAIR_ROOT_INVALID')

print(json.dumps({
 'rows':775,'rowGroups':[579,196],'columns':36,
 'schemaSha256':'sha256:b9ad20e46f63edc079ff524fe34df42ed684be78705366831efb74a0b6a958cf',
 'uniqueTrajectoryIds':775,'uniqueSourceFiles':775,'uniqueJsonPaths':775,
 'uniqueRunIds':14,'uniqueRunNames':14,'uniqueModelShortValues':14,
 'policyRows':dict(sorted(policy.items())),'modelRows':dict(sorted(models.items())),
 'environmentRows':dict(sorted(environments.items())),'sourceGroupRows':dict(sorted(datasets.items())),
 'mainTaskSuccessRows':dict(sorted(main_success.items())),
 'sideTaskSuccessRows':dict(sorted(side_success.items())),'hasSideTaskRows':dict(sorted(has_side.items())),
 'policyProfiles':{key:dict(value) for key,value in sorted(policy_profiles.items())},
 'runProfiles':run_output,'uniqueEnvironmentMainTaskPairs':len(environment_tasks),
 'uniqueMainTaskStrings':len(main_task_strings),
 'actions':{'rows':total_actions,'minimumPerTrajectory':min_actions,'maximumPerTrajectory':max_actions,
   'zeroActionTrajectories':zero_actions,'functionCounts':dict(sorted(functions.items())),
   'uniqueNormalizedActions':len(normalized),'argumentJsonParseFailures':invalid_args,
   'hasErrorActionRows':has_error_actions,'nonemptyOutputErrorRows':nonempty_error_actions,
   'tracesWithError':traces_with_error,'errorThenLaterNonerrorTraces':traces_error_then_nonerror,
   'outputLength8034Rows':output_8034,'outputLength8035Rows':output_8035,'maximumOutputLength':output_max,
   'parallelListLengthExactTrajectories':775,'sourceFileIdentityRows':source_file_identity,
   'jsonPathIdentityRows':json_path_identity,'datasetEqualsRunNameRows':dataset_run_identity,
   'first5L1RederivedRows':first5_l1,'first5L2RederivedRows':first5_l2,
   'first5FilesRederivedRows':first5_files,'allFilesRederivedRows':all_files,
   'errorFlagRederivedRows':error_flags},
 'costUsd':{'rows':len(costs),'nonfinite':sum(not math.isfinite(v) for v in costs),
   'minimum':min(costs),'maximum':max(costs),'sum':round(sum(costs),6)},
 'missingness':{'topLevelNullCells':0,'sideTaskNonemptyRows':side_task_nonempty,
   'sideTaskDescriptionNonemptyRows':side_description_nonempty,
   'scorerExplanationNonemptyRows':scorer_nonempty},
 'privacyPatternCandidates':privacy,
 'rowSignatureRoot':sha('\n'.join(sorted(row_hashes)).encode()),
 'actionProjectionRoot':sha('\n'.join(sorted(action_hashes)).encode()),
 'trajectoryIdRoot':sha('\n'.join(sorted(derived_ids)).encode()),
 'crosswalk':{'rawRows':200,'rawUniqueTrajectoryIds':200,'derivedRows':775,
   'exactTrajectoryIdOverlap':direct_intersection,'exactRunIdOverlap':0,
   'taskMatchMethod':'EXACT_ENVIRONMENT_AND_DERIVED_MAIN_TASK_EQUALS_RAW_TASK_ID_OR_NAME',
   'derivedRowsWithUniqueRawTaskMatch':len(task_pairs),'derivedRowsWithoutRawTaskMatch':775-len(task_pairs),
   'uniqueRawTasksMatched':len({pair[1] for pair in task_pairs}),'rawTasksNotRepresented':200-len({pair[1] for pair in task_pairs}),
   'ambiguousDerivedTaskMatches':ambiguous,'rawTaskFieldKindRows':dict(sorted(raw_kind.items())),
   'derivedSourceGroupMatchRows':dict(sorted(task_pair_counts.items())),
   'mainLabelPairs':dict(sorted(label_pairs.items())),'mainLabelEqualRows':main_label_equal,
   'sideLabelEqualRows':side_label_equal,'actionCountEqualRows':action_count_equal,
   'functionSequenceEqualRows':function_equal,'argumentSequenceEqualRows':argument_equal,
   'outputSequenceEqualRows':output_equal,'errorSequenceEqualRows':error_equal,
   'reasoningSequenceEqualRows':reasoning_equal,'exactActionProjectionHashMatches':exact_action_hash_equal,
   'derivedToRawTaskPairRoot':pair_root,
   'honestHaiku':{'derivedRows':datasets['50-task-set-honest-haiku'],
     'taskMatches':len(honest_pairs),'mainLabelEqualRows':sum(item[1] for item in honest_pairs),
     'actionProjectionHashMatches':sum(item[2] for item in honest_pairs),
     'mainLabelPairs':dict(sorted(collections.Counter(f"raw_{a}__derived_{b}" for _,_,_,a,b in honest_pairs).items())),
     'derivedRunIds':dict(sorted(collections.Counter(item[0] for item in honest_pairs).items()))}},
 'downloadedCommandsToolInputsOrCodeExecuted':False,
 'rawDescriptionsCommandsOrOutputsProjected':False,
},sort_keys=True,separators=(',',':')))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable
    ?? process.env.OUTSIDER_EVAL_AWARE_LINUXARENA_PYTHON
    ?? "/opt/anaconda3/bin/python";
  const parquet = checkedPath(root, PARQUET_PATH);
  const raw = checkedPath(root,
    `${RAW_ARTIFACT_PREFIX}/source/selection/haiku-honest.jsonl`);
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, parquet, raw], {
    encoding: "utf8", timeout: 240_000, maxBuffer: 8 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", PYTHONWARNINGS: "ignore" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim() ?? result.status);
  }
  try { return deepFreeze(JSON.parse(result.stdout)); }
  catch { fail("REPLAY_OUTPUT_INVALID"); }
}

export function buildEvalAwareLinuxArenaArtifactFromSourceDirectory(
  sourceDirectory, options = {}) {
  const collected = collectSource(sourceDirectory, true);
  const body = manifestBody(collected);
  const sourceManifest = deepFreeze({ ...body,
    manifestHash: digest(MANIFEST_DOMAIN, body) });
  const manifestFile = readSmall(collected.root, "source-manifest.json");
  if (!manifestFile.contents.equals(serialize(sourceManifest))) {
    fail("SOURCE_MANIFEST_MISMATCH");
  }
  const replay = runReplay(collected.root, options.pythonExecutable);
  const crosswalk = replay.crosswalk;
  const reportBody = {
    schema: EVAL_AWARE_LINUXARENA_SCHEMA,
    disposition: EVAL_AWARE_LINUXARENA_DISPOSITION,
    scope: {
      kind: EVAL_AWARE_LINUXARENA_SCOPE,
      datasetId: EVAL_AWARE_LINUXARENA_DATASET_ID,
      revision: EVAL_AWARE_LINUXARENA_REVISION,
      completePublishedDerivedRepositoryAcquired: true,
      completePublishedDerivedRowsReplayed: 775,
      eachPublishedRowStructurallyCompleteActionCensus: true,
      upstreamRawRunOrAttemptCensusClaimed: false,
      globalLinuxArenaCorpusExhausted: false,
      referencedUpstreamRawJsonObjectsAcquiredForDerivedRows: 0,
      nestedCrosswalkRawRunRows: 200,
      derivedBytes: 123_664_935,
      nestedRawArtifactSelectedBytes: 62_762_384,
    },
    source: {
      publicAtAcquisition: true, gatedAtAcquisition: false,
      disabledAtAcquisition: false, cardLicenseClaim: "MIT",
      fixedRevisionTreeEntries: 4, fixedRevisionFiles: 3,
      fixedRevisionDirectories: 1, fixedRevisionFileBytes: 123_664_935,
      usedStorageBytes: 123_656_922,
      parquetBytes: 123_656_922, parquetLfsSha256: PARQUET_SHA,
      repositoryLicenseFilePresent: false,
      recordBeforeAfterExact: true, treeBeforeAfterExact: true,
      historicalAliasRequested: EVAL_AWARE_LINUXARENA_HISTORICAL_ALIAS,
      aliasRequestResolvedToCurrentDatasetId: true,
      aliasRecordExactCurrentRecord: true,
      sourceManifestHash: sourceManifest.manifestHash,
      sourceManifestFileSha256: manifestFile.sha256,
      sourceRoot: sourceManifest.sourceRoot,
      nestedRawArtifactHash: collected.raw.report.artifactHash,
      nestedRawSourceRoot: collected.raw.report.source.sourceRoot,
      nestedRawSelectedRangeSha256: RAW_SELECTED_SHA,
    },
    replay: { ...replay,
      extractorSha256: sha256(Buffer.from(PYTHON_REPLAY, "utf8")) },
    lineage: {
      readmeUsageRepositoryId: EVAL_AWARE_LINUXARENA_HISTORICAL_ALIAS,
      officialAliasEndpointCurrentlyResolvesTo: EVAL_AWARE_LINUXARENA_DATASET_ID,
      readmeDeclaresLinuxBenchTrajectorySource: true,
      derivedSourceFileReferences: 775,
      derivedJsonPathReferences: 775,
      referencedRawJsonBytesIncludedInDerivedRepository: 0,
      derivedParquetIsNotRawJsonShard: true,
      nestedRaw200ArtifactIsSeparateSourceObject: true,
    },
    selection: {
      completePublishedDerivedCorpus: true,
      publisherSourceGroups: replay.uniqueRunNames,
      publisherRunIds: replay.uniqueRunIds,
      readmeDocumentsRowSelectionRuleFromUpstreamRuns: false,
      sourceGroupNamesTreatedAsLabelsNotExpectedRowCounts: true,
      tenAttackGroupsNamed50RowsEachObserved: 26,
      honestHaikuGroupNamed50ObservedRows: 23,
      derivedRowsAreSubsetOfNestedRaw200Run: false,
      exactTrajectoryIdOverlapWithNestedRaw200: crosswalk.exactTrajectoryIdOverlap,
      exactRunIdOverlapWithNestedRaw200: crosswalk.exactRunIdOverlap,
      taskDefinitionOverlapDoesNotEstablishExecutionIdentity: true,
      completeUpstreamAttemptCensusEstablished: false,
    },
    crosswalk: {
      ...crosswalk,
      identityLevels: {
        exactTrajectoryIdentityRows: 0,
        exactRunIdentityRows: 0,
        exactTaskDefinitionMatchRows: 135,
        exactActionProjectionIdentityRows: 0,
      },
      mainLabelAgreementIsAcrossDifferentExecutions: true,
      mainLabelAgreementDoesNotValidateEitherScorerIndependently: true,
      rawAndDerivedPopulationAdditionProhibited: true,
    },
    documentation: {
      publisherClaimsFullTrajectoryRows: 775,
      actionListStructuralCompletenessRows: 775,
      publisherDocumentsActionOutputTruncationAt8000Characters: true,
      outputRowsWith8000PlusMarkerLength: replay.actions.outputLength8034Rows
        + replay.actions.outputLength8035Rows,
      maximumStoredOutputLength: replay.actions.maximumOutputLength,
      rawUntruncatedOutputByteCompletenessEstablished: false,
      sideTaskDescriptionColumnDocumented: true,
      sideTaskDescriptionNonemptyRows: replay.missingness.sideTaskDescriptionNonemptyRows,
      fullTrajectoryDoesNotMeanFullUntruncatedOutputBytes: true,
    },
    execution: {
      publisherSyntheticLinuxEnvironmentTrajectoryRows: 775,
      verifiedRealWorldExecutionRows: 0,
      physicalRobotExecutionRows: 0,
      downloadedCommandsToolInputsOrCodeExecuted: false,
      networkActionsReplayed: 0,
    },
    outcome: {
      publisherNativeMainTaskOutcomeRows: 775,
      publisherMainTaskSuccessTrueRows: 280,
      publisherMainTaskSuccessFalseRows: 495,
      publisherNativeAttackSideTaskOutcomeRows: 316,
      publisherAttackSideTaskSuccessTrueRows: 159,
      publisherAttackSideTaskSuccessFalseRows: 157,
      structuralFalseSideTaskRowsOutsideAttackPolicy: 459,
      scorerExplanationRows: replay.missingness.scorerExplanationNonemptyRows,
      scorerImplementationBytesAcquired: 0,
      outcomeProducerIndependentFromExecutionSystem: false,
      independentlyVerifiedOutcomeRows: 0,
      completeUpstreamAttemptCensusEstablished: false,
    },
    recovery: {
      outputErrorActionRows: replay.actions.nonemptyOutputErrorRows,
      tracesWithOutputError: replay.actions.tracesWithError,
      errorThenLaterNonerrorTraces: replay.actions.errorThenLaterNonerrorTraces,
      laterNonerrorActionIsMorphologyNotRecovery: true,
      publisherNativeRecoveryLabelRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      longitudinalRecoveryRows: 0,
    },
    privacy: {
      rawDerivedPayloadPrivate: true,
      rawNestedCrosswalkPayloadPrivate: true,
      privacyPatternCandidates: replay.privacyPatternCandidates,
      candidatePatternsMayMatchSyntheticContent: true,
      privacyPatternScanIsNotAnonymityProof: true,
      independentPrivacyReviewRows: 0,
      noPiiOrSecretGuaranteed: false,
      rawContentProjected: false,
      rawVisualBytes: 0,
    },
    activeContent: {
      attackPolicyRows: 316,
      toolCommandArgumentOutputAndReasoningRows: replay.actions.rows,
      harmfulOrDualUsePayloadRiskPresent: true,
      payloadSafeToExecute: false,
      payloadsExecuted: 0, commandsExecuted: 0, networkActionsReplayed: 0,
    },
    rights: {
      derivedCardLicenseClaim: "MIT",
      derivedRepositoryLicenseFilePresent: false,
      upstreamRawArtifactCardLicenseClaim: "CC-BY-4.0",
      upstreamAndDerivedLicenseClaimsDiffer: true,
      derivativeChainRightsIndependentlyAdjudicated: false,
      modelGeneratedContentRightsIndependentlyAdjudicated: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
      commercialUseAuthorizedByThisArtifact: false,
      legalConclusionEstablished: false,
    },
    denominators: {
      DERIVED_PUBLISHED_TRAJECTORY_ROW: 775,
      DERIVED_ACTION_ROW: 49_817,
      NESTED_RAW_HAIKU_HONEST_TRAJECTORY_ROW: 200,
      EXACT_TRAJECTORY_IDENTITY_CROSSWALK_ROW: 0,
      EXACT_TASK_DEFINITION_MATCH_ROW: 135,
      INDEPENDENTLY_VERIFIED_OUTCOME_ROW: 0,
      crossPopulationTotal: null, additionProhibited: true,
    },
    boundary: {
      independentlyVerifiedOutcomeRows: 0,
      independentlyVerifiedRecoveryRows: 0,
      completeAttemptCensusRows: 0,
      authorizedTrainingRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createEvalAwareLinuxArenaReceipt(report, reportBytes,
  manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: EVAL_AWARE_LINUXARENA_RECEIPT_SCHEMA,
    reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    scope: EVAL_AWARE_LINUXARENA_SCOPE,
    completePublishedDerivedRows: 775,
    derivedActionRows: 49_817,
    nestedRawRows: 200,
    exactTrajectoryIdentityRows: 0,
    exactTaskDefinitionMatchRows: 135,
    independentlyVerifiedOutcomeRows: 0,
    independentlyVerifiedRecoveryRows: 0,
    authorizedTrainingRows: 0, offlineTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyEvalAwareLinuxArenaArtifactDirectory(directory,
  options = {}) {
  try {
    const root = path.resolve(directory);
    const status = lstatSync(root, { bigint: true });
    if (!status.isDirectory() || status.isSymbolicLink()
      || Number(status.mode & 0o777n) !== 0o700
      || !same(sorted(readdirSync(root)), ["report.json", "run-receipt.json", "source"])) {
      fail("ARTIFACT_LAYOUT_INVALID");
    }
    const reportFile = readSmall(root, "report.json");
    const receiptFile = readSmall(root, "run-receipt.json");
    const built = buildEvalAwareLinuxArenaArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!reportFile.contents.equals(expectedReport)) fail("REPORT_REPLAY_MISMATCH");
    const manifestFile = readSmall(root, "source/source-manifest.json");
    const receipt = createEvalAwareLinuxArenaReceipt(
      built.report, expectedReport, manifestFile.contents);
    if (!receiptFile.contents.equals(serialize(receipt))) {
      fail("RECEIPT_REPLAY_MISMATCH");
    }
    return deepFreeze({ ok: true, report: built.report, receipt,
      reportExactBytes: true, receiptExactBytes: true });
  } catch (error) {
    return deepFreeze({ ok: false,
      error: error instanceof Error ? error.message : String(error) });
  }
}

export function serializeEvalAwareLinuxArenaArtifact(value) {
  return serialize(value);
}
