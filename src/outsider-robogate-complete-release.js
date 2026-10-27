/* Complete fixed-revision replay of the public RoboGate failure release. */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync, constants, fstatSync, lstatSync, openSync, readFileSync,
  readdirSync, readSync,
} from "node:fs";
import path from "node:path";

import { canonicalizeStrict } from "./canonical.js";

export const ROBOGATE_SCHEMA = "outsider/robogate-complete-release/v1";
export const ROBOGATE_RECEIPT_SCHEMA =
  "outsider/robogate-complete-release-receipt/v1";
export const ROBOGATE_DATASET_ID = "liveplex/robogate-failure-dictionary";
export const ROBOGATE_REVISION = "3b6e5eff5c840c0a97065e422c8288cc0237fc5a";
export const ROBOGATE_GITHUB_REPOSITORY =
  "liveplex-cpu/robogate-failure-dictionary";
export const ROBOGATE_GITHUB_COMMIT =
  "da3cfeaf6833b18043e215f00442a654b0ea6415";
export const ROBOGATE_GITHUB_TREE =
  "d7506024065f1a7b16c3a08d21722a2626480c53";
export const ROBOGATE_SCOPE = "COMPLETE_PINNED_ROBOGATE_RELEASE";
export const ROBOGATE_DISPOSITION = "QUARANTINE_EVAL_ONLY";

const REPORT_DOMAIN = `${ROBOGATE_SCHEMA}/report`;
const RECEIPT_DOMAIN = `${ROBOGATE_RECEIPT_SCHEMA}/receipt`;
const MANIFEST_DOMAIN = `${ROBOGATE_SCHEMA}/source-manifest`;
const SOURCE_ROOT_DOMAIN = `${ROBOGATE_SCHEMA}/source-root`;
const TREE_SPEC = Object.freeze({ bytes: 5_805,
  sha256: "sha256:85a32ae47f4f33b24cfe887d80ac368fc5e159150dd591c0706105c14f85b1ad" });
const GITHUB_TREE_SPEC = Object.freeze({ bytes: 3_050,
  sha256: "sha256:3d3a5c728c3f7fa5b521d160feccf91dccc5dc73dfd797958509b24ec3b507ae" });
const GITHUB_FILES = Object.freeze(["LICENSE", "README.md"]);
const HASH = /^sha256:[a-f0-9]{64}$/u;
const O_RDONLY = constants.O_RDONLY;
const O_NOFOLLOW = constants.O_NOFOLLOW ?? 0;
const MAX_FILE_BYTES = 16 * 1024 * 1024;

function fail(code, detail = null) {
  throw new Error(detail === null ? `ROBOGATE_${code}`
    : `ROBOGATE_${code}:${detail}`);
}

function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function gitBlobOid(bytes) {
  return createHash("sha1").update(Buffer.from(`blob ${bytes.length}\0`, "utf8"))
    .update(bytes).digest("hex");
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

function inspectRegular(root, relative, exactBytes = null, expectedSha256 = null) {
  const target = checkedPath(root, relative);
  const link = lstatSync(target, { bigint: true });
  if (!link.isFile() || link.isSymbolicLink()
    || Number(link.mode & 0o777n) !== 0o600 || link.size > BigInt(MAX_FILE_BYTES)
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
  const inspected = inspectRegular(root, relative, exactBytes, expectedSha256);
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
  const value = parseJson(bytes, "RECORD_JSON_INVALID");
  const projection = {
    id: value.id, author: value.author, sha: value.sha,
    lastModified: value.lastModified, private: value.private,
    gated: value.gated, disabled: value.disabled,
    usedStorage: value.usedStorage, license: value.cardData?.license,
    siblings: value.siblings?.length,
  };
  if (!same(projection, {
    id: ROBOGATE_DATASET_ID, author: "liveplex", sha: ROBOGATE_REVISION,
    lastModified: "2026-08-11T16:54:41.000Z", private: false,
    gated: false, disabled: false, usedStorage: 4_677_086,
    license: "mit", siblings: 28,
  })) fail("RECORD_PROFILE_INVALID");
  return projection;
}

function validateTree(bytes) {
  if (bytes.length !== TREE_SPEC.bytes || sha256(bytes) !== TREE_SPEC.sha256) {
    fail("TREE_PIN_MISMATCH");
  }
  const entries = parseJson(bytes, "TREE_JSON_INVALID");
  const files = entries.filter((entry) => entry.type === "file");
  const directories = entries.filter((entry) => entry.type === "directory");
  const parquet = files.filter((entry) => entry.path.endsWith(".parquet"));
  const json = files.filter((entry) => entry.path.endsWith(".json"));
  const license = files.filter((entry) => /(^|\/)LICENSE(?:\.|$)/u.test(entry.path));
  if (entries.length !== 33 || files.length !== 28 || directories.length !== 5
    || files.reduce((sum, entry) => sum + entry.size, 0) !== 14_835_474
    || parquet.length !== 6
    || parquet.reduce((sum, entry) => sum + entry.size, 0) !== 3_369_279
    || json.length !== 20
    || files.filter((entry) => entry.path === "README.md").length !== 1
    || files.filter((entry) => entry.path === ".gitattributes").length !== 1
    || license.length !== 0 || new Set(entries.map((entry) => entry.path)).size !== 33) {
    fail("TREE_PROFILE_INVALID");
  }
  return { entries, files, directories, parquet, json };
}

function validateReadme(bytes) {
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  for (const phrase of ["license: mit", "50,000+ Physics-Validated",
    "NVIDIA Isaac Sim", "Two-Stage Adaptive Sampling",
    "| **Success Rate** | 33.3% | 63.8% | 74.3% | 10.0% | 0.0% |",
    "liveplex-cpu/robogate-failure-dictionary"]) {
    if (!text.includes(phrase)) fail("README_PROFILE_INVALID");
  }
}

function validateGithub(root) {
  const repository = readSmall(root, "github/repository.json");
  const commit = readSmall(root, "github/commit.json");
  const treeFile = readSmall(root, "github/tree.json",
    GITHUB_TREE_SPEC.bytes, GITHUB_TREE_SPEC.sha256);
  const repositoryValue = parseJson(repository.contents, "GITHUB_REPOSITORY_INVALID");
  const commitValue = parseJson(commit.contents, "GITHUB_COMMIT_INVALID");
  const tree = parseJson(treeFile.contents, "GITHUB_TREE_INVALID");
  if (!same({ fullName: repositoryValue.full_name, private: repositoryValue.private,
    archived: repositoryValue.archived, disabled: repositoryValue.disabled,
    defaultBranch: repositoryValue.default_branch,
    license: repositoryValue.license?.spdx_id ?? null }, {
    fullName: ROBOGATE_GITHUB_REPOSITORY, private: false, archived: false,
    disabled: false, defaultBranch: "main", license: "MIT",
  }) || commitValue.sha !== ROBOGATE_GITHUB_COMMIT
    || commitValue.commit?.tree?.sha !== ROBOGATE_GITHUB_TREE
    || commitValue.commit?.verification?.verified !== false
    || commitValue.commit?.verification?.reason !== "unsigned"
    || tree.sha !== ROBOGATE_GITHUB_TREE || tree.truncated !== false
    || tree.tree?.length !== 9) fail("GITHUB_PROFILE_INVALID");
  const descriptors = [repository, commit, treeFile].map(
    ({ path: itemPath, bytes, sha256: itemSha }) =>
      ({ path: itemPath, bytes, sha256: itemSha }));
  for (const itemPath of GITHUB_FILES) {
    const entry = tree.tree.find((candidate) => candidate.type === "blob"
      && candidate.path === itemPath);
    if (!entry) fail("GITHUB_FILE_MISSING", itemPath);
    const relative = `github/files/${itemPath}`;
    const inspected = inspectRegular(root, relative, entry.size);
    if (gitBlobOid(readFileSync(checkedPath(root, relative))) !== entry.sha) {
      fail("GITHUB_FILE_OID_INVALID", itemPath);
    }
    descriptors.push(inspected);
  }
  const shared = ["analysis_report.json", "failure_dictionary_large.json"];
  const sharedOids = Object.fromEntries(shared.map((itemPath) => [itemPath,
    tree.tree.find((entry) => entry.type === "blob" && entry.path === itemPath)?.sha]));
  if (Object.values(sharedOids).some((value) => typeof value !== "string")) {
    fail("GITHUB_SHARED_LINEAGE_INVALID");
  }
  return { descriptors, sharedOids };
}

function collectSource(sourceDirectory, withManifest) {
  const root = path.resolve(sourceDirectory);
  const recordBefore = readSmall(root, "metadata/hf-record-before.json");
  const recordAfter = readSmall(root, "metadata/hf-record-after.json");
  const record = validateRecord(recordBefore.contents);
  if (!same(record, validateRecord(recordAfter.contents))) {
    fail("RECORD_PROJECTION_CHANGED");
  }
  const treeBefore = readSmall(root, "metadata/hf-tree-before.json",
    TREE_SPEC.bytes, TREE_SPEC.sha256);
  const treeAfter = readSmall(root, "metadata/hf-tree-after.json",
    TREE_SPEC.bytes, TREE_SPEC.sha256);
  if (!treeBefore.contents.equals(treeAfter.contents)) fail("TREE_BRACKET_CHANGED");
  const tree = validateTree(treeBefore.contents);
  const descriptors = [recordBefore, recordAfter, treeBefore, treeAfter]
    .map(({ path: itemPath, bytes, sha256: itemSha }) =>
      ({ path: itemPath, bytes, sha256: itemSha }));
  for (const entry of tree.files) {
    const relative = `files/${entry.path}`;
    const expectedSha = entry.lfs?.oid ? `sha256:${entry.lfs.oid}` : null;
    const inspected = inspectRegular(root, relative, entry.size, expectedSha);
    const bytes = readFileSync(checkedPath(root, relative));
    if (!entry.lfs && gitBlobOid(bytes) !== entry.oid) {
      fail("HF_FILE_OID_INVALID", entry.path);
    }
    if (entry.path === "README.md") validateReadme(bytes);
    descriptors.push(inspected);
  }
  const github = validateGithub(root);
  descriptors.push(...github.descriptors);
  for (const [itemPath, oid] of Object.entries(github.sharedOids)) {
    const entry = tree.files.find((candidate) => candidate.path === itemPath);
    if (!entry || entry.oid !== oid) fail("HF_GITHUB_BYTE_LINEAGE_INVALID", itemPath);
  }
  descriptors.sort((left, right) => left.path.localeCompare(right.path));
  const expected = descriptors.map((entry) => entry.path);
  if (withManifest) expected.push("source-manifest.json");
  if (!same(sorted(walk(root)), sorted(expected))) fail("SOURCE_LAYOUT_INVALID");
  return { root, record, tree, github,
    recordBeforeAfterExact: recordBefore.contents.equals(recordAfter.contents),
    descriptors };
}

function manifestBody(collected) {
  return {
    schema: "outsider/robogate-complete-release-source/v1",
    datasetId: ROBOGATE_DATASET_ID, revision: ROBOGATE_REVISION,
    githubRepository: ROBOGATE_GITHUB_REPOSITORY,
    githubCommit: ROBOGATE_GITHUB_COMMIT, githubTree: ROBOGATE_GITHUB_TREE,
    scope: ROBOGATE_SCOPE,
    fixedTreeEntries: 33, fixedTreeFiles: 28, fixedTreeDirectories: 5,
    fixedTreeFileBytes: 14_835_474, parquetFiles: 6,
    jsonFiles: 20, otherFiles: 2,
    completeFixedTreeAcquired: true,
    recordStableProjectionBeforeAfterExact: true,
    recordResponseBeforeAfterExact: collected.recordBeforeAfterExact,
    treeBeforeAfterExact: true,
    sourceObjects: collected.descriptors,
    sourceRoot: digest(SOURCE_ROOT_DOMAIN, collected.descriptors),
  };
}

export function createRoboGateSourceManifestFromDirectory(sourceDirectory) {
  const collected = collectSource(sourceDirectory, false);
  const body = manifestBody(collected);
  return deepFreeze({ ...body, manifestHash: digest(MANIFEST_DOMAIN, body) });
}

const PYTHON_REPLAY = String.raw`
import collections, copy, hashlib, json, math, pathlib, re, sys, warnings
warnings.filterwarnings('ignore')
import numpy as np
import pyarrow.parquet as pq

root=pathlib.Path(sys.argv[1])/'files'
def die(code): raise RuntimeError('ROBOGATE_PYTHON_'+code)
def canonical(x): return json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def sha_bytes(x): return hashlib.sha256(x).hexdigest()
def row_sha(x): return sha_bytes((canonical(x)+'\n').encode())

names={'franka':'franka-00000-of-00001.parquet','franka_boundary':'franka_boundary-00000-of-00001.parquet','train':'train-00000-of-00001.parquet','ur5e':'ur5e-00000-of-00001.parquet','ur3e':'ur3e-00000-of-00001.parquet','ur10e':'ur10e-00000-of-00001.parquet'}
tables={}; schemas={}; row_groups={}; nulls={}; nonfinite={}
for name,file in names.items():
    pf=pq.ParquetFile(root/'data'/file); table=pf.read(); tables[name]=table.to_pylist()
    schemas[name]=str(table.schema.remove_metadata()); row_groups[name]=pf.metadata.num_row_groups
    nulls[name]=sum(table[c].null_count for c in table.column_names)
    bad=0
    for c in table.column_names:
        if str(table[c].type) in ['double','float']:
            bad+=int((~np.isfinite(np.asarray(table[c].to_numpy(zero_copy_only=False),dtype=np.float64))).sum())
    nonfinite[name]=bad
expected_rows={'franka':10000,'franka_boundary':10000,'train':30000,'ur5e':10000,'ur3e':10000,'ur10e':10000}
if {k:len(v) for k,v in tables.items()}!=expected_rows or set(row_groups.values())!={1} or any(nulls.values()) or any(nonfinite.values()): die('PARQUET_PROFILE_INVALID')

common_columns=list(tables['franka'][0]); ur_columns=list(tables['ur3e'][0])
if list(tables['franka_boundary'][0])!=common_columns or list(tables['ur5e'][0])!=common_columns or list(tables['train'][0])!=common_columns or list(tables['ur10e'][0])!=ur_columns: die('SCHEMA_GROUP_INVALID')
sigs={name:[row_sha(row) for row in rows] for name,rows in tables.items()}
segments=[]
for index in range(3):
    segment=sigs['train'][index*10000:(index+1)*10000]
    segments.append(next((name for name in ['franka','franka_boundary','ur5e'] if segment==sigs[name]),None))
if segments!=['franka','franka_boundary','ur5e']: die('TRAIN_CROSSWALK_INVALID')

dictionary=json.loads((root/'failure_dictionary_large.json').read_text(encoding='utf-8'))
analysis_report=json.loads((root/'analysis_report.json').read_text(encoding='utf-8'))
if len(dictionary['experiments'])!=10000: die('DICTIONARY_ROWS_INVALID')
projection=[{key:row[key] for key in common_columns} for row in dictionary['experiments']]
if [row_sha(row) for row in projection]!=sigs['franka']: die('JSON_PARQUET_CROSSWALK_INVALID')
if analysis_report['metadata']!=dictionary['metadata'] or analysis_report['analysis']!=dictionary['analysis']: die('ANALYSIS_REPORT_CROSSWALK_INVALID')

profiles={}; source_names=['franka','franka_boundary','ur5e','ur3e','ur10e']
for name in source_names:
    rows=tables[name]; failures=collections.Counter(row['failure_type'] for row in rows)
    zones=collections.Counter(str(row.get('zone')) for row in rows)
    profiles[name]={'rows':len(rows),'success':sum(row['success'] for row in rows),'failure':sum(not row['success'] for row in rows),'failureTypes':dict(sorted(failures.items())),'zones':dict(sorted(zones.items())),'sampleIndexExact':all(row['sample_idx']==index for index,row in enumerate(rows)),'successFailureTypeConsistent':all((row['failure_type']=='none')==row['success'] for row in rows),'cycleTimeMin':min(row['cycle_time'] for row in rows),'cycleTimeMax':max(row['cycle_time'] for row in rows),'cycleTimeMean':sum(row['cycle_time'] for row in rows)/len(rows)}
expected_success={'franka':3332,'franka_boundary':6385,'ur5e':7432,'ur3e':961,'ur10e':6160}
if {name:row['success'] for name,row in profiles.items()}!=expected_success or not all(row['sampleIndexExact'] and row['successFailureTypeConsistent'] for row in profiles.values()): die('SOURCE_OUTCOME_PROFILE_INVALID')
sets={name:set(sigs[name]) for name in source_names}; overlaps={}
for index,left in enumerate(source_names):
    for right in source_names[index+1:]: overlaps[f'{left}|{right}']=len(sets[left]&sets[right])
unique_source=len(set().union(*sets.values()))
if unique_source!=50000 or any(overlaps.values()): die('SOURCE_UNIQUENESS_INVALID')

main=sorted(p for p in (root/'v2_evaluations').glob('*.json') if p.name!='fair_harness_qualification.json')
controls=sorted((root/'v2_evaluations/qualifications').glob('*/perfect-oracle-*.json'))+sorted((root/'v2_evaluations/qualifications').glob('*/zero-action.json'))
runs=[]; docs=[]
for p in main+controls:
    doc=json.loads(p.read_text(encoding='utf-8')); docs.append(doc); episodes=doc['episodes']
    episode_claim=doc['integrity']['episodes_sha256']
    result_claim=doc['integrity']['result_sha256']; no_result=copy.deepcopy(doc); no_result['integrity'].pop('result_sha256')
    if sha_bytes(canonical(episodes).encode())!=episode_claim or sha_bytes(canonical(no_result).encode())!=result_claim: die('RUN_HASH_INVALID')
    passed=sum(row['success'] for row in episodes); failed=sum(not row['success'] for row in episodes)
    failures=collections.Counter(row['failure_type'] for row in episodes)
    consistent=all(row['success']==row['transitions']['success'] and ((row['failure_type']=='none')==row['success']) for row in episodes)
    if len(episodes)!=68 or doc['summary']['total']!=68 or doc['summary']['passed']!=passed or doc['summary']['failed']!=failed or not consistent or not all(row['index']==index and row['seed']==42+index and row['status']=='completed' and not row['errors'] for index,row in enumerate(episodes)): die('RUN_PROFILE_INVALID')
    runs.append({'file':str(p.relative_to(root)),'kind':'main' if p in main else 'control','modelId':doc['run']['model']['id'],'displayName':doc['run']['model']['display_name'],'declaredMode':doc['run']['mode'],'simulator':doc['run']['harness']['simulator'],'runId':doc['run']['run_id'],'episodes':68,'passed':passed,'failed':failed,'failureTypes':dict(sorted(failures.items())),'stepsMin':min(row['steps'] for row in episodes),'stepsMax':max(row['steps'] for row in episodes),'stepsSum':sum(row['steps'] for row in episodes),'episodeErrors':0,'episodesHashReproduced':True,'resultHashReproduced':True,'resultHash':result_claim})
if len(main)!=6 or len(controls)!=4 or sum(row['passed'] for row in runs if row['kind']=='main')!=0 or sum(row['failed'] for row in runs if row['kind']=='main')!=408 or sum(row['passed'] for row in runs if row['kind']=='control')!=204 or sum(row['failed'] for row in runs if row['kind']=='control')!=68: die('RUN_TOTALS_INVALID')
scenario_order=len({tuple(row['id'] for row in doc['episodes']) for doc in docs})==1
applied_scenarios=all([row['applied_scenario'] for row in doc['episodes']]==[row['applied_scenario'] for row in docs[0]['episodes']] for doc in docs)
contracts=len({canonical(doc['run']['contract']) for doc in docs})
if not scenario_order or not applied_scenarios or contracts!=1: die('RUN_SCENARIO_CROSSWALK_INVALID')

qualification_path=root/'v2_evaluations/fair_harness_qualification.json'
nested_qualification=next((root/'v2_evaluations/qualifications').glob('*/qualification.json'))
qualification=json.loads(qualification_path.read_text(encoding='utf-8')); no_document=copy.deepcopy(qualification); no_document.pop('document_sha256')
if qualification_path.read_bytes()!=nested_qualification.read_bytes() or sha_bytes(canonical(no_document).encode())!=qualification['document_sha256'] or qualification['status']!='passed' or qualification['issues'] or not all(qualification['checks'].values()): die('QUALIFICATION_INVALID')
oracle_refs=[row['resultHash'] for row in runs if row['modelId']=='control-perfect-oracle']; zero_ref=next(row['resultHash'] for row in runs if row['modelId']=='control-zero-action')
if qualification['evidence']['oracle_result_sha256']!=oracle_refs or qualification['evidence']['zero_action_result_sha256']!=zero_ref: die('QUALIFICATION_REFERENCE_INVALID')
validation=[]
for p in sorted((root/'v2_evaluations/validation_reports').glob('*.json')):
    doc=json.loads(p.read_text(encoding='utf-8')); result=json.loads((root/'v2_evaluations'/p.name).read_text(encoding='utf-8')); no_document=copy.deepcopy(doc); no_document.pop('document_sha256')
    valid=doc['status']=='validated' and doc['validation']['valid'] and not doc['validation']['issues'] and doc['result_sha256']==result['integrity']['result_sha256'] and doc['harness_sha256']==result['run']['harness']['sha256'] and sha_bytes(canonical(no_document).encode())==doc['document_sha256']
    validation.append({'file':p.name,'valid':valid,'resultHashJoinExact':doc['result_sha256']==result['integrity']['result_sha256'],'harnessHashJoinExact':doc['harness_sha256']==result['run']['harness']['sha256'],'documentHashReproduced':sha_bytes(canonical(no_document).encode())==doc['document_sha256']})
if len(validation)!=6 or not all(row['valid'] for row in validation): die('VALIDATION_INVALID')

all_json=[root/'failure_dictionary_large.json',root/'analysis_report.json',*list((root/'v2_evaluations').glob('**/*.json'))]
email_re=re.compile(r'(?i)(?<![A-Z0-9._%+-])[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}(?![A-Z0-9._%+-])')
email_candidates=sum(len(email_re.findall(p.read_text(encoding='utf-8'))) for p in all_json)
absolute_path_candidates=sum(len(re.findall(r'(?<![A-Za-z0-9])/(?:home|mnt|workspace|Users)/',p.read_text(encoding='utf-8'))) for p in all_json)
profile_root='sha256:'+sha_bytes(canonical({'profiles':profiles,'runs':runs}).encode())
print(canonical({'parquet':{'files':6,'physicalRows':80000,'rowGroups':row_groups,'schemas':schemas,'nullValues':sum(nulls.values()),'nonfiniteNumericValues':sum(nonfinite.values()),'commonColumns':common_columns,'urColumns':ur_columns},'lineage':{'trainSegments':segments,'trainRows':30000,'trainRowsExactDuplicatesOfSourceGroups':30000,'jsonExperimentRows':10000,'jsonFrankaProjectionExact':True,'uniqueSourceExperimentRows':unique_source,'sourceGroupSignatureOverlaps':overlaps,'analysisReportMetadataExact':True,'analysisReportAnalysisExact':True,'dictionaryMetadataShaClaim':dictionary['metadata']['sha256'],'dictionaryMetadataShaSemanticTargetSpecified':False},'sourceProfiles':profiles,'documentation':{'readmeSuccessClaims':{'franka':0.333,'franka_boundary':0.638,'ur5e':0.743,'ur3e':0.100,'ur10e':0.0},'byteSuccessCounts':expected_success,'ur10eReadmeClaimRowsEquivalent':0,'ur10eByteSuccessRows':6160,'readmeVlaLeaderboardRunFilesPresent':0},'evaluations':{'runFiles':10,'mainRunFiles':6,'controlRunFiles':4,'episodeRows':680,'mainEpisodeRows':408,'controlEpisodeRows':272,'mainPassed':0,'mainFailed':408,'controlPassed':204,'controlFailed':68,'runs':runs,'scenarioOrderExactAcrossRuns':scenario_order,'appliedScenarioExactAcrossRuns':applied_scenarios,'distinctContracts':contracts,'publisherDeclaredModeValues':sorted(set(row['declaredMode'] for row in runs)),'simulatorValues':sorted(set(row['simulator'] for row in runs)),'qualificationPhysicalFiles':2,'qualificationFilesExactDuplicates':True,'qualificationDocumentHashReproduced':True,'qualificationChecks':qualification['checks'],'validationReports':validation,'rawActionValuesPresent':False,'actionHashEvidencePresent':True,'rawImageFramesPresent':False,'frameHashEvidencePresent':True},'privacyScan':{'emailCandidates':email_candidates,'absoluteLocalPathCandidates':absolute_path_candidates,'independentAudit':False},'profileRoot':profile_root}))
`;

function runReplay(root, pythonExecutable = null) {
  const executable = pythonExecutable ?? process.env.OUTSIDER_ROBOGATE_PYTHON
    ?? "/opt/anaconda3/bin/python";
  const result = spawnSync(executable, ["-I", "-c", PYTHON_REPLAY, root], {
    encoding: "utf8", timeout: 180_000, maxBuffer: 16 * 1024 * 1024,
    env: { PATH: process.env.PATH ?? "", PYTHONWARNINGS: "ignore" },
  });
  if (result.error || result.status !== 0 || result.signal !== null) {
    fail("REPLAY_FAILED", result.error?.message ?? result.stderr?.trim() ?? result.status);
  }
  try { return deepFreeze(JSON.parse(result.stdout)); }
  catch { fail("REPLAY_OUTPUT_INVALID"); }
}

export function buildRoboGateArtifactFromSourceDirectory(
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
  const reportBody = {
    schema: ROBOGATE_SCHEMA, disposition: ROBOGATE_DISPOSITION,
    scope: {
      kind: ROBOGATE_SCOPE, datasetId: ROBOGATE_DATASET_ID,
      revision: ROBOGATE_REVISION, completeFixedTreeAcquired: true,
      fixedTreeEntries: 33, fixedTreeFiles: 28, fixedTreeDirectories: 5,
      fixedTreeFileBytes: 14_835_474,
      completePublisherReleasePayloadReplayed: true,
      globalRoboGateSourceUniverseExhausted: false,
    },
    source: {
      publicAtAcquisition: true, gatedAtAcquisition: false,
      disabledAtAcquisition: false, apiUsedStorageBytes: 4_677_086,
      apiUsedStorageIsNotFixedTreeByteCount: true,
      recordStableProjectionBeforeAfterExact: true,
      recordResponseBeforeAfterExact: collected.recordBeforeAfterExact,
      treeBeforeAfterExact: true,
      githubRepository: ROBOGATE_GITHUB_REPOSITORY,
      githubCommit: ROBOGATE_GITHUB_COMMIT,
      githubTree: ROBOGATE_GITHUB_TREE,
      githubCommitVerified: false, githubCommitVerificationReason: "unsigned",
      hfGithubSharedJsonGitBlobLineageExact: true,
      sourceManifestHash: sourceManifest.manifestHash,
      sourceManifestFileSha256: manifestFile.sha256,
      sourceRoot: sourceManifest.sourceRoot,
    },
    replay: { ...replay,
      extractorSha256: sha256(Buffer.from(PYTHON_REPLAY, "utf8")) },
    corpus: {
      parquetPhysicalRows: 80_000,
      sourceNativeUniqueExperimentRows: 50_000,
      trainPhysicalRows: 30_000,
      trainRowsExactDuplicatesOfSourceGroups: 30_000,
      trainSegmentOrder: replay.lineage.trainSegments,
      jsonExperimentRows: 10_000,
      jsonRowsExactProjectionOfFrankaParquet: true,
      sourceGroupSignatureOverlapRows: 0,
      reportAppliesToFrankaUniformRows: 10_000,
      physicalRowsMustNotBeSummedAsUniqueExperiments: true,
    },
    publisherSimulationOutcomes: {
      simulator: "NVIDIA Isaac Sim",
      publisherReadmePhysicsValidatedClaim: true,
      groups: replay.sourceProfiles,
      successFailureTypeConsistencyRows: 50_000,
      publisherNativeSuccessRows: 24_270,
      publisherNativeFailureRows: 25_730,
      independentlyVerifiedOutcomeRows: 0,
      publisherSimulationOutcomeIsIndependentPhysicalOutcome: false,
    },
    documentationDrift: {
      readmeUr10eSuccessRateClaim: 0,
      pinnedByteUr10eSuccessRows: 6_160,
      pinnedByteUr10eRows: 10_000,
      pinnedByteUr10eSuccessRate: 0.616,
      readmeUr10eClaimMatchesPinnedBytes: false,
      readmeUr3eSuccessRateClaim: 0.10,
      pinnedByteUr3eSuccessRate: 0.0961,
      readmeVlaLeaderboardDescribesPhysicalRunFilesInRelease: false,
      dictionaryMetadataShaClaimSemanticTargetSpecified: false,
      silentNormalizationApplied: false,
      pinnedBytesTakePrecedence: true,
    },
    evaluations: {
      publisherEvaluationRunFiles: 10,
      publisherEvaluationEpisodeRows: 680,
      mainRunFiles: 6, mainEpisodeRows: 408,
      mainPassedRows: 0, mainFailedRows: 408,
      controlRunFiles: 4, controlEpisodeRows: 272,
      controlPassedRows: 204, controlFailedRows: 68,
      completeContractScenarioRowsPerRun: 68,
      identicalScenarioOrderAcrossRuns: true,
      identicalAppliedScenarioAcrossRuns: true,
      identicalContractAcrossRuns: true,
      publisherModeString: "real",
      byteNativeHarnessSimulator: "NVIDIA Isaac Sim",
      publisherModeStringInterpretedAsRealRobot: false,
      episodeHashesReproduced: 10, resultHashesReproduced: 10,
      qualificationPhysicalFiles: 2,
      qualificationPhysicalFilesExactDuplicates: true,
      qualificationDocumentHashesReproduced: 2,
      validationReports: 6,
      validationDocumentHashesReproduced: 6,
      validationResultAndHarnessHashJoinsExact: 6,
      publisherHarnessValidationIsIndependentOutcomeWitness: false,
      rawActionValuesPresent: false, actionHashEvidencePresent: true,
      rawImageFramesPresent: false, frameHashEvidencePresent: true,
      runs: replay.evaluations.runs,
    },
    execution: {
      simulatedExperimentRows: 50_000,
      publisherEvaluationSimulationEpisodeRows: 680,
      realRobotExecutionRows: 0,
      independentlyVerifiedPhysicalExecutionRows: 0,
      independentVisualWitnessRows: 0,
      downloadedPayloadsExecuted: 0, networkActionsReplayed: 0,
    },
    outcome: {
      publisherNativeSimulationOutcomeRows: 50_000,
      publisherHarnessScoredEvaluationOutcomeRows: 680,
      independentlyVerifiedOutcomeRows: 0,
      independentEffectRows: 0,
      completeReleasedEvaluationRunScenarioRows: 680,
      completeCollectionAttemptCensusRows: 0,
      releasedRowsEstablishAllGenerationAttempts: false,
    },
    recovery: {
      sourceNativeFailureModeRows: 25_730,
      sourceNativeRecoveryExecutionRows: 0,
      pairedFailureToRecoveryRows: 0, causalRecoveryRows: 0,
      independentlyVerifiedRecoveryRows: 0, longitudinalRecoveryRows: 0,
      failureDictionaryIsRecoveryCensus: false,
    },
    privacy: {
      rawVisualBytes: 0, rawAudioBytes: 0,
      emailPatternCandidates: replay.privacyScan.emailCandidates,
      absoluteLocalPathCandidates:
        replay.privacyScan.absoluteLocalPathCandidates,
      rawDatasetPrivate: true, rawEvaluationMetadataPrivate: true,
      rawProjectionRows: 0, independentPrivacyAuditRows: 0,
      noPiiOrSensitiveDataGuaranteed: false,
      publicAvailabilityResolvesPrivacy: false,
    },
    activeContent: {
      executableFilesAcquired: 0, downloadedCodeFiles: 0,
      downloadedCommandsExecuted: 0, trajectoryActionsExecuted: 0,
      payloadsExecuted: 0, networkActionsReplayed: 0,
    },
    rights: {
      datasetCardLicenseClaim: "MIT",
      fixedHfTreeLicenseFilePresent: false,
      linkedGithubApiLicense: "MIT",
      linkedGithubRootLicenseFilePresent: true,
      linkedGithubLicenseBlobPinned: true,
      sharedDatasetJsonByteLineageToLicensedRepoExact: true,
      publisherLicenseEvidencePresent: true,
      datasetContentRightsIndependentlyAdjudicated: false,
      thirdPartyModelOrSimulatorRightsIndependentlyAdjudicated: false,
      authorizedTrainingRows: 0,
      redistributionAuthorizedByThisArtifact: false,
      commercialUseAuthorizedByThisArtifact: false,
      legalConclusionEstablished: false,
    },
    denominators: {
      UNIQUE_PUBLISHER_SIMULATION_EXPERIMENT_ROW: 50_000,
      PHYSICAL_PARQUET_ROW_WITH_DUPLICATES: 80_000,
      PUBLISHER_EVALUATION_EPISODE_ROW: 680,
      PUBLISHER_NATIVE_FAILURE_MODE_ROW: 25_730,
      INDEPENDENT_OUTCOME_ROW: 0, INDEPENDENT_RECOVERY_ROW: 0,
      COMPLETE_ATTEMPT_CENSUS_ROW: 0,
    },
    boundary: {
      independentlyVerifiedOutcomeRows: 0, independentEffectRows: 0,
      independentlyVerifiedRecoveryRows: 0, completeAttemptCensusRows: 0,
      authorizedTrainingRows: 0, offlineTrainingRows: 0,
      productionTrainingRows: 0, networkAdmissionRows: 0,
      authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
    },
  };
  const report = deepFreeze({ ...reportBody,
    artifactHash: digest(REPORT_DOMAIN, reportBody) });
  return deepFreeze({ sourceManifest, report });
}

export function createRoboGateReceipt(report, reportBytes, manifestBytes) {
  if (!report || !HASH.test(report.artifactHash ?? "")) fail("REPORT_INVALID");
  const body = {
    schema: ROBOGATE_RECEIPT_SCHEMA, reportHash: report.artifactHash,
    reportFileSha256: sha256(reportBytes), reportFileBytes: reportBytes.length,
    sourceManifestHash: report.source.sourceManifestHash,
    sourceManifestFileSha256: sha256(manifestBytes),
    sourceManifestFileBytes: manifestBytes.length,
    scope: ROBOGATE_SCOPE, fixedTreeFiles: 28,
    fixedTreeFileBytes: 14_835_474,
    uniquePublisherSimulationExperimentRows: 50_000,
    publisherEvaluationEpisodeRows: 680,
    independentlyVerifiedOutcomeRows: 0, independentEffectRows: 0,
    independentlyVerifiedRecoveryRows: 0, completeAttemptCensusRows: 0,
    authorizedTrainingRows: 0, offlineTrainingRows: 0,
    productionTrainingRows: 0, networkAdmissionRows: 0,
    authorityRows: 0, ceuRows: 0, autonomousActionAuthorized: false,
  };
  return deepFreeze({ ...body, receiptHash: digest(RECEIPT_DOMAIN, body) });
}

export function verifyRoboGateArtifactDirectory(directory, options = {}) {
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
    const built = buildRoboGateArtifactFromSourceDirectory(
      checkedPath(root, "source"), options);
    const expectedReport = serialize(built.report);
    if (!reportFile.contents.equals(expectedReport)) fail("REPORT_REPLAY_MISMATCH");
    const manifestFile = readSmall(root, "source/source-manifest.json");
    const receipt = createRoboGateReceipt(
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

export function serializeRoboGateArtifact(value) {
  return serialize(value);
}
